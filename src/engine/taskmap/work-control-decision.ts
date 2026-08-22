import { createHash } from "node:crypto";
import {
  constants as FS_CONSTANTS,
  fstatSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  lstat,
  open,
  realpath,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  assertTaskMapIdentityDedupeStoreEntry,
  readTaskMapIdentityDedupeProjectionStore,
  type TaskMapAdjudicatedLifecycleState,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapIdentityDedupeStoreRoots,
  type TaskMapIdentityDedupeStoreSnapshotV1,
} from "./identity-dedupe-projection.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
} from "./source-contracts.js";
import type {
  BrainRelation,
  TaskMapProjectionV1,
  TaskMapReviewState,
  TaskMapTask,
} from "./types.js";

export const TASKMAP_WORK_CONTROL_DECISION_VERSION =
  "taskmap-work-control-decision.v1" as const;
export const TASKMAP_WORK_CONTROL_POLICY_VERSION =
  "taskmap-work-control-policy.1" as const;

/**
 * P10.3a is intentionally a read-only decision seam. Candidate evidence is
 * not present in the authenticated P10.2 v1 sidecar, so this contract cannot
 * manufacture REVIEW NEXT rows.
 */
export const TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE =
  "unavailable_in_p10_2_v1" as const;

export const TASKMAP_WORK_CONTROL_LIMITS_V1 = Object.freeze({
  maxCanonicalInputBytes: 12 * 1024 * 1024,
  maxCanonicalArtifactBytes: 4 * 1024 * 1024,
  maxNodes: 100_000,
  maxDescriptors: 100_000,
  maxDepth: 32,
  maxObjectKeys: 128,
  maxArrayLength: 8_192,
  maxStringLength: 4_096,
  maxWorks: 2_048,
  maxRelations: 8_192,
});

export const TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER = Object.freeze([
  "sourcePriority",
  "deadlinePressure",
  "dependencyImpact",
  "recurrence",
  "staleOpen",
  "evidenceStrength",
  "bodyBonus",
] as const);

export type TaskMapWorkControlRankFactor =
  (typeof TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER)[number];

const RANK_REASON_BY_FACTOR: Readonly<
  Record<TaskMapWorkControlRankFactor, TaskMapWorkControlRankReasonCode>
> = Object.freeze({
  sourcePriority: "source_priority",
  deadlinePressure: "deadline_pressure",
  dependencyImpact: "dependency_impact",
  recurrence: "recurrence",
  staleOpen: "stale_open",
  evidenceStrength: "evidence_strength",
  bodyBonus: "body_context_not_causal",
});

export type TaskMapWorkControlRankReasonCode =
  | "source_priority"
  | "deadline_pressure"
  | "dependency_impact"
  | "recurrence"
  | "stale_open"
  | "evidence_strength"
  | "body_context_not_causal";

export const TASKMAP_WORK_CONTROL_POLICY_V1 = Object.freeze({
  contractVersion: TASKMAP_WORK_CONTROL_POLICY_VERSION,
  scoreScale: "integer_basis_points",
  rounding: "nearest_integer_half_up",
  scoreCapBasisPoints: 10_000,
  bodyBonusCapBasisPoints: 800,
  dependencyCountCap: 3,
  weightsBasisPoints: Object.freeze({
    sourcePriority: 2_500,
    deadlinePressure: 2_500,
    dependencyImpact: 1_500,
    recurrence: 1_500,
    staleOpen: 1_000,
    evidenceStrength: 1_000,
  }),
  legacyProjectionTotal: "ignored",
  canonicalAliasRank:
    "highest_recomputed_whole_row_then_code_point_task_id_then_row_digest",
  dependencyImpact: "recomputed_from_validated_normalized_dag",
  dependencyDirection: Object.freeze({
    depends_on: "B_to_A_for_A_depends_on_B",
    blocks: "A_to_B_for_A_blocks_B",
    supersedes: "lifecycle_only_excluded_from_execution_dag",
  }),
  tieBreak: "score_desc_then_code_point_work_id",
  candidateCoverage: TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
});

const SHA256 = /^[a-f0-9]{64}$/;
const FIXED_GENERATION = /^[0-9]{20}$/;
const HASHED_IDS = Object.freeze({
  decision: /^tmworkcontroldecision_[a-f0-9]{64}$/,
  entry: /^tmidentityentry_[a-f0-9]{64}$/,
  currentRef: /^tmrefreshcurrent_[a-f0-9]{64}$/,
  sidecar: /^tmidentityprojection_[a-f0-9]{64}$/,
  work: /^tmwork_[a-f0-9]{64}$/,
  projectionRef: /^tmprojectionref_[a-f0-9]{64}$/,
  projectionRun: /^tmrun_[a-f0-9]{16}$/,
  projectionTask: /^tm[ct]_[a-f0-9]{16}$/,
  projectionRoot: /^tmr_[a-f0-9]{16}$/,
  projectionEdge: /^tme_[a-f0-9]{16}$/,
});
const CONTROL_RELATIONS = new Set<BrainRelation>([
  "depends_on",
  "blocks",
  "supersedes",
]);
const TERMINAL_OPEN_STATES = new Set(["completed", "superseded"]);
const LIFECYCLE_DECISIONS =
  new Set<TaskMapWorkControlLifecycleDecision>([
    "accepted_open",
    "source_complete",
    "superseded",
    "rejected",
  ]);
const PROJECTION_RELATIONS = new Set<BrainRelation | "body_context_for">([
  "advances",
  "depends_on",
  "blocks",
  "informed_by",
  "related_to",
  "supersedes",
  "body_context_for",
]);
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const STRUCTURED_CLONE = structuredClone;
const JSON_STRINGIFY = JSON.stringify;
const ARRAY_IS_ARRAY = Array.isArray;
export const TASKMAP_WORK_CONTROL_POLICY_DIGEST =
  digestCanonical(TASKMAP_WORK_CONTROL_POLICY_V1);

type JsonPreflightState = {
  nodes: number;
  descriptors: number;
  bytes: number;
  byteLimit: number;
  seen: WeakSet<object>;
};

const ARRAY_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Array.prototype);
const OBJECT_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Object.prototype);
const SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Set.prototype);
const MAP_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Map.prototype);
const WEAK_SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(WeakSet.prototype);

export interface TaskMapWorkControlPredecessorV1 {
  ownerScopeDigest: string;
  generation: string;
  currentRefId: string;
  currentRefDigest: string;
  entryId: string;
  acceptedOriginBundleId: string;
  acceptedOriginReplayDigest: string;
  acceptedStateDigest: string;
  sidecarId: string;
  sidecarDigest: string;
  replayClosureDigest: string;
  sourceSnapshotDigest: string;
  sourceSemanticInputDigest: string;
  projectionRunId: string;
  projectionInputDigest: string;
  projectionDigest: string;
  inputDomainBinding: "separate_authenticated_domains";
}

export type TaskMapWorkControlLifecycleDecision =
  | "accepted_open"
  | "source_complete"
  | "superseded"
  | "rejected";

export interface TaskMapWorkControlWorkDecisionV1 {
  workId: string;
  lifecycleDecision: TaskMapWorkControlLifecycleDecision;
  rankEligible: boolean;
  rootId: string | null;
  projectionTaskRows: Array<{
    taskId: string;
    projectionRowDigest: string;
  }>;
  projectionRejectionRows: Array<{
    projectionReferenceId: string;
    projectionRowDigest: string;
  }>;
  projectionTaskIds: string[];
  projectionRejectionReferenceIds: string[];
  projectionRowDigests: string[];
}

export type TaskMapWorkControlRelationOutcome =
  | "execution_dependency"
  | "lifecycle_only"
  | "ignored_non_control";

export interface TaskMapWorkControlRelationDecisionV1 {
  edgeId: string;
  relation: BrainRelation | "body_context_for";
  outcome: TaskMapWorkControlRelationOutcome;
  prerequisiteWorkId?: string;
  dependentWorkId?: string;
  supersedingWorkId?: string;
  supersededWorkId?: string;
}

export interface TaskMapWorkControlExecutionDependencyV1 {
  prerequisiteWorkId: string;
  dependentWorkId: string;
  edgeId: string;
}

export interface TaskMapWorkControlAliasRankProofV1 {
  taskId: string;
  projectionRowDigest: string;
  scoreBasisPoints: number;
  factorBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
  contributionBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
  reasonCodes: TaskMapWorkControlRankReasonCode[];
}

export interface TaskMapAcceptedOpenTaskRankV1
  extends TaskMapWorkControlAliasRankProofV1 {
  rank: number;
}

export interface TaskMapWorkControlRankDecisionV1 {
  rank: number;
  workId: string;
  representativeProjectionTaskId: string;
  representativeProjectionRowDigest: string;
  scoreBasisPoints: number;
  factorBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
  contributionBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
  reasonCodes: TaskMapWorkControlRankReasonCode[];
  aliasRankProofRows: TaskMapWorkControlAliasRankProofV1[];
}

export interface TaskMapWorkControlDecisionPrivacyV1 {
  sourceBodiesStored: false;
  candidateTextStored: false;
  rawOwnerIdentifiersStored: false;
  rawSourceObjectIdentifiersStored: false;
  rawSourceRevisionsStored: false;
  rawBiometricsStored: false;
  localPathsStored: false;
  connectorSecretsStored: false;
  executionStateStored: false;
}

export interface TaskMapWorkControlDecisionV1 {
  contractVersion: typeof TASKMAP_WORK_CONTROL_DECISION_VERSION;
  artifactId: string;
  artifactDigest: string;
  originDigest: string;
  policyVersion: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
  policyDigest: string;
  predecessor: TaskMapWorkControlPredecessorV1;
  candidateCoverage: typeof TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE;
  reviewNext: [];
  workDecisions: TaskMapWorkControlWorkDecisionV1[];
  relationDecisions: TaskMapWorkControlRelationDecisionV1[];
  executionDependencies: TaskMapWorkControlExecutionDependencyV1[];
  rankedAcceptedOpen: TaskMapWorkControlRankDecisionV1[];
  privacy: TaskMapWorkControlDecisionPrivacyV1;
}

export interface BuiltTaskMapWorkControlDecision {
  artifact: TaskMapWorkControlDecisionV1;
  canonicalBytes: string;
}

export interface BuildTaskMapWorkControlDecisionInput
  extends TaskMapIdentityDedupeStoreRoots {
  projection: TaskMapProjectionV1;
}

export interface UnsafeBuildTaskMapWorkControlDecisionInputForTest {
  firstStore: TaskMapIdentityDedupeStoreSnapshotV1;
  secondStore: TaskMapIdentityDedupeStoreSnapshotV1;
  projection: TaskMapProjectionV1;
}

type WorkAccumulator = {
  workId: string;
  lifecycleState: TaskMapAdjudicatedLifecycleState;
  taskIds: string[];
  rejectionReferenceIds: string[];
  rowDigests: string[];
  tasks: TaskMapTask[];
  taskRows: Array<{
    taskId: string;
    projectionRowDigest: string;
  }>;
  rejectionRows: Array<{
    projectionReferenceId: string;
    projectionRowDigest: string;
  }>;
  rootId: string | null;
};

type TaskMapWorkControlRootLabel =
  keyof TaskMapIdentityDedupeStoreRoots;

type HeldTaskMapWorkControlRoot = {
  label: TaskMapWorkControlRootLabel;
  requestedPath: string;
  canonicalPath: string;
  handle: FileHandle;
  dev: bigint;
  ino: bigint;
  uid: bigint;
  mode: bigint;
};

function fail(message: string): never {
  throw new Error(`P10.3a work-control decision: ${message}`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rootContains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    );
}

async function closeHeldRoots(
  roots: readonly HeldTaskMapWorkControlRoot[],
): Promise<void> {
  await Promise.all(roots.map(async (root) => {
    try {
      await root.handle.close();
    } catch {
      // A prior validation error remains authoritative. Closed/invalid held
      // descriptors are also detected by the final receipt check.
    }
  }));
}

async function holdTaskMapWorkControlRoots(
  roots: TaskMapIdentityDedupeStoreRoots,
): Promise<HeldTaskMapWorkControlRoot[]> {
  const held: HeldTaskMapWorkControlRoot[] = [];
  try {
    for (const label of [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
    ] as const) {
      const requestedPath = roots[label];
      if (!path.isAbsolute(requestedPath)) {
        fail(`${label} must be an absolute path`);
      }
      const resolvedPath = path.resolve(requestedPath);
      const canonicalPath = await realpath(resolvedPath);
      const before = await lstat(canonicalPath, { bigint: true });
      const currentUid = process.getuid?.();
      if (
        canonicalPath !== resolvedPath
        || !before.isDirectory()
        || currentUid === undefined
        || before.uid !== BigInt(currentUid)
        || (before.mode & 0o7777n) !== 0o700n
      ) {
        fail(
          `${label} must be a canonical current-user 0700 directory`,
        );
      }
      const handle = await open(
        canonicalPath,
        FS_CONSTANTS.O_RDONLY
          | (FS_CONSTANTS.O_DIRECTORY ?? 0)
          | (FS_CONSTANTS.O_NOFOLLOW ?? 0),
      );
      held.push({
        label,
        requestedPath,
        canonicalPath,
        handle,
        dev: before.dev,
        ino: before.ino,
        uid: before.uid,
        mode: before.mode & 0o7777n,
      });
      const opened = await handle.stat({ bigint: true });
      if (
        !opened.isDirectory()
        || opened.dev !== before.dev
        || opened.ino !== before.ino
        || opened.uid !== before.uid
        || (opened.mode & 0o7777n) !== (before.mode & 0o7777n)
      ) {
        fail(`${label} changed while its root receipt was opened`);
      }
    }
    for (let left = 0; left < held.length; left += 1) {
      for (let right = left + 1; right < held.length; right += 1) {
        const a = held[left]!;
        const b = held[right]!;
        if (
          rootContains(a.canonicalPath, b.canonicalPath)
          || rootContains(b.canonicalPath, a.canonicalPath)
          || (a.dev === b.dev && a.ino === b.ino)
        ) {
          fail(`${a.label} and ${b.label} are not disjoint roots`);
        }
      }
    }
    return held;
  } catch (error) {
    await closeHeldRoots(held);
    if (
      error instanceof Error
      && error.message.startsWith("P10.3a work-control decision:")
    ) {
      throw error;
    }
    fail("task-map store roots are unavailable for the spanning receipt");
  }
}

function revalidateHeldTaskMapWorkControlRootsSync(
  held: readonly HeldTaskMapWorkControlRoot[],
): void {
  for (const root of held) {
    let canonicalPath: string;
    try {
      canonicalPath = realpathSync(path.resolve(root.requestedPath));
    } catch {
      fail(`${root.label} disappeared during the spanning root receipt`);
    }
    const current = lstatSync(canonicalPath, { bigint: true });
    const opened = fstatSync(root.handle.fd, { bigint: true });
    if (
      canonicalPath !== root.canonicalPath
      || !current.isDirectory()
      || !opened.isDirectory()
      || current.dev !== root.dev
      || current.ino !== root.ino
      || current.uid !== root.uid
      || (current.mode & 0o7777n) !== root.mode
      || opened.dev !== root.dev
      || opened.ino !== root.ino
      || opened.uid !== root.uid
      || (opened.mode & 0o7777n) !== root.mode
      || opened.nlink === 0n
    ) {
      fail(`${root.label} was replaced during the spanning root receipt`);
    }
  }
}

function snapshotPrototype(prototype: object): ReadonlyArray<{
  key: string | symbol;
  descriptor: PropertyDescriptor;
}> {
  return Object.freeze(REFLECT_OWN_KEYS(prototype).map((key) => ({
    key,
    descriptor: {
      ...GET_OWN_PROPERTY_DESCRIPTOR(prototype, key)!,
    },
  })));
}

function sameDescriptor(
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor,
): boolean {
  return left !== undefined
    && left.configurable === right.configurable
    && left.enumerable === right.enumerable
    && left.writable === right.writable
    && left.value === right.value
    && left.get === right.get
    && left.set === right.set;
}

function assertPrototypeIntegrity(
  prototype: object,
  expected: ReadonlyArray<{
    key: string | symbol;
    descriptor: PropertyDescriptor;
  }>,
  label: string,
): void {
  const keys = REFLECT_OWN_KEYS(prototype);
  if (keys.length !== expected.length) {
    fail(`${label} prototype changed during validation`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const row = expected[index]!;
    if (
      keys[index] !== row.key
      || !sameDescriptor(
        GET_OWN_PROPERTY_DESCRIPTOR(prototype, row.key),
        row.descriptor,
      )
    ) {
      fail(`${label} prototype changed during validation`);
    }
  }
}

function assertRuntimeIntegrity(): void {
  assertPrototypeIntegrity(
    Array.prototype,
    ARRAY_PROTOTYPE_DESCRIPTORS,
    "Array",
  );
  assertPrototypeIntegrity(
    Object.prototype,
    OBJECT_PROTOTYPE_DESCRIPTORS,
    "Object",
  );
  assertPrototypeIntegrity(
    Set.prototype,
    SET_PROTOTYPE_DESCRIPTORS,
    "Set",
  );
  assertPrototypeIntegrity(
    Map.prototype,
    MAP_PROTOTYPE_DESCRIPTORS,
    "Map",
  );
  assertPrototypeIntegrity(
    WeakSet.prototype,
    WEAK_SET_PROTOTYPE_DESCRIPTORS,
    "WeakSet",
  );
}

function addPrecloneBytes(
  state: JsonPreflightState,
  bytes: number,
  label: string,
): void {
  state.bytes += bytes;
  if (state.bytes > state.byteLimit) {
    fail(`${label} exceeds the pre-clone byte ceiling`);
  }
}

function countNode(state: JsonPreflightState, label: string): void {
  state.nodes += 1;
  if (state.nodes > TASKMAP_WORK_CONTROL_LIMITS_V1.maxNodes) {
    fail(`${label} exceeds the pre-clone node ceiling`);
  }
}

function countDescriptor(
  state: JsonPreflightState,
  label: string,
): void {
  state.descriptors += 1;
  if (
    state.descriptors
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxDescriptors
  ) {
    fail(`${label} exceeds the pre-clone descriptor ceiling`);
  }
}

function chargeOwnDescriptor(
  state: JsonPreflightState,
  key: string,
  label: string,
): void {
  countDescriptor(state, label);
  if (key.length > TASKMAP_WORK_CONTROL_LIMITS_V1.maxStringLength) {
    fail(`${label} contains an oversized object key`);
  }
  addPrecloneBytes(
    state,
    Buffer.byteLength(JSON_STRINGIFY(key), "utf8") + 1,
    label,
  );
}

function preflightJson(
  value: unknown,
  label: string,
  state: JsonPreflightState,
  depth = 0,
): void {
  if (depth > TASKMAP_WORK_CONTROL_LIMITS_V1.maxDepth) {
    fail(`${label} exceeds the pre-clone depth ceiling`);
  }
  countNode(state, label);
  if (value === null) {
    addPrecloneBytes(state, 4, label);
    return;
  }
  if (typeof value === "string") {
    if (value.length > TASKMAP_WORK_CONTROL_LIMITS_V1.maxStringLength) {
      fail(`${label} exceeds the string ceiling`);
    }
    addPrecloneBytes(
      state,
      Buffer.byteLength(JSON_STRINGIFY(value), "utf8"),
      label,
    );
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    addPrecloneBytes(
      state,
      Buffer.byteLength(JSON_STRINGIFY(value), "utf8"),
      label,
    );
    return;
  }
  if (typeof value === "boolean") {
    addPrecloneBytes(state, value ? 4 : 5, label);
    return;
  }
  if (typeof value !== "object") {
    fail(`${label} contains a non-JSON value`);
  }
  if (nodeUtilTypes.isProxy(value)) {
    fail(`${label} contains a proxy`);
  }
  if (state.seen.has(value)) fail(`${label} contains a cycle or alias`);
  state.seen.add(value);
  const prototype = GET_PROTOTYPE_OF(value);
  const keys = REFLECT_OWN_KEYS(value);
  if (ARRAY_IS_ARRAY(value)) {
    if (prototype !== Array.prototype) {
      fail(`${label} array must use the intrinsic Array prototype`);
    }
    if (value.length > TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength) {
      fail(`${label} exceeds the array ceiling`);
    }
    if (keys.some((key) => typeof key === "symbol")) {
      fail(`${label} contains a symbol key`);
    }
    addPrecloneBytes(state, 2 + Math.max(0, value.length - 1), label);
    if (keys.length !== value.length + 1 || !keys.includes("length")) {
      fail(`${label} array contains holes or named fields`);
    }
    for (const key of keys) {
      if (typeof key !== "string") fail(`${label} contains a symbol key`);
      chargeOwnDescriptor(state, key, label);
      if (
        key !== "length"
        && (
          !/^(0|[1-9]\d*)$/.test(key)
          || Number(key) >= value.length
        )
      ) {
        fail(`${label} array contains holes or named fields`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || descriptor.enumerable !== true
        || descriptor.value === undefined
      ) {
        fail(`${label} array must contain enumerable data elements`);
      }
      preflightJson(
        descriptor.value,
        `${label}[${index}]`,
        state,
        depth + 1,
      );
    }
    state.seen.delete(value);
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must use a plain or null prototype`);
  }
  if (keys.length > TASKMAP_WORK_CONTROL_LIMITS_V1.maxObjectKeys) {
    fail(`${label} exceeds the object-key ceiling`);
  }
  addPrecloneBytes(state, 2 + Math.max(0, keys.length - 1), label);
  for (const key of keys) {
    if (typeof key !== "string") fail(`${label} contains a symbol key`);
    chargeOwnDescriptor(state, key, label);
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.enumerable !== true
    ) {
      fail(`${label} must contain enumerable JSON data properties`);
    }
    if (descriptor.value === undefined) continue;
    preflightJson(
      descriptor.value,
      `${label}.${key}`,
      state,
      depth + 1,
    );
  }
  state.seen.delete(value);
}

function snapshotJson<T>(
  value: T,
  label: string,
  byteLimit = TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalInputBytes,
): T {
  assertRuntimeIntegrity();
  preflightJson(value, label, {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit,
    seen: new WeakSet<object>(),
  });
  let snapshot: T;
  try {
    snapshot = STRUCTURED_CLONE(value);
  } catch {
    fail(`${label} must be independently cloneable`);
  }
  const canonicalBytes = canonicalJson(snapshot);
  if (Buffer.byteLength(canonicalBytes, "utf8") > byteLimit) {
    fail(`${label} exceeds the canonical byte ceiling`);
  }
  assertRuntimeIntegrity();
  return snapshot;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${
      Object.keys(value as Record<string, unknown>)
        .sort(compareText)
        .map((key) => (
          `${JSON_STRINGIFY(key)}:${
            canonicalJson((value as Record<string, unknown>)[key])
          }`
        ))
        .join(",")
    }}`;
  }
  return JSON_STRINGIFY(value) ?? "null";
}

function digestCanonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value).sort(compareText);
  const allowed = new Set([...required, ...optional]);
  const unknown = keys.filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !keys.includes(key));
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      `${label} has invalid fields`
      + (unknown.length > 0 ? `; unknown=${unknown.join(",")}` : "")
      + (missing.length > 0 ? `; missing=${missing.join(",")}` : ""),
    );
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest`);
  }
}

function assertHashedId(
  value: unknown,
  pattern: RegExp,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label} is invalid`);
  }
}

function latestProjectionEntry(
  store: TaskMapIdentityDedupeStoreSnapshotV1,
  label: string,
  authenticateSelectedEntry: boolean,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  if (!ARRAY_IS_ARRAY(store.entries) || store.entries.length === 0) {
    fail(`${label} has no authenticated P10.2 predecessor`);
  }
  const latestInput = store.entries[store.entries.length - 1]!;
  const latest = authenticateSelectedEntry
    ? assertTaskMapIdentityDedupeStoreEntry(latestInput)
    : snapshotJson(latestInput, `${label} selected entry`);
  if (latest.entryKind !== "projection") {
    fail(`${label} latest P10.2 entry is ${latest.entryKind}, not projection`);
  }
  return latest;
}

/**
 * TEST-ONLY selected-entry probe. The preceding rows are deliberately treated
 * as already authenticated by P10.2 so a retained-history regression can
 * prove P10.3a never reclones or recanonicalizes the whole 64 MiB store.
 */
export function unsafeSelectedTaskMapWorkControlEntryIdForTest(
  store: TaskMapIdentityDedupeStoreSnapshotV1,
): string {
  return latestProjectionEntry(
    store,
    "unsafe P10.3a selected-entry probe",
    false,
  ).entryId;
}

function assertSameAuthenticatedHead(
  firstEntryCount: number,
  secondStore: TaskMapIdentityDedupeStoreSnapshotV1,
  firstEntry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  authenticateSelectedEntry: boolean,
): void {
  const secondEntry = latestProjectionEntry(
    secondStore,
    "second authenticated P10.2 store snapshot",
    authenticateSelectedEntry,
  );
  if (
    firstEntryCount !== secondStore.entries.length
    || firstEntry.entryId !== secondEntry.entryId
    || firstEntry.generation !== secondEntry.generation
    || firstEntry.currentRefId !== secondEntry.currentRefId
    || firstEntry.currentRefDigest !== secondEntry.currentRefDigest
    || firstEntry.sidecar.origin.acceptedStateDigest
      !== secondEntry.sidecar.origin.acceptedStateDigest
    || firstEntry.sidecar.sourceSnapshotDigest
      !== secondEntry.sidecar.sourceSnapshotDigest
    || firstEntry.sidecarId !== secondEntry.sidecarId
    || firstEntry.sidecarDigest !== secondEntry.sidecarDigest
    || firstEntry.replayClosureDigest !== secondEntry.replayClosureDigest
    || digestCanonical(firstEntry) !== digestCanonical(secondEntry)
  ) {
    fail("authenticated P10.2 head advanced during decision build");
  }
}

function predecessorFrom(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  projection: TaskMapProjectionV1,
): TaskMapWorkControlPredecessorV1 {
  assertDigest(entry.ownerScopeDigest, "P10.2 owner scope digest");
  if (
    typeof entry.generation !== "string"
    || !FIXED_GENERATION.test(entry.generation)
    || BigInt(entry.generation) === 0n
  ) {
    fail("P10.2 generation is invalid");
  }
  assertHashedId(entry.entryId, HASHED_IDS.entry, "P10.2 entry ID");
  assertHashedId(
    entry.currentRefId,
    HASHED_IDS.currentRef,
    "P10.2 current-ref ID",
  );
  assertHashedId(entry.sidecarId, HASHED_IDS.sidecar, "P10.2 sidecar ID");
  assertDigest(entry.sidecarDigest, "P10.2 sidecar digest");
  assertDigest(entry.currentRefDigest, "P10.2 current-ref digest");
  assertDigest(entry.replayClosureDigest, "P10.2 replay-closure digest");
  assertDigest(
    entry.acceptedOriginReplayDigest,
    "P10.2 accepted-origin replay digest",
  );
  if (
    typeof entry.acceptedOriginBundleId !== "string"
    || !/^tmrefreshrun_[a-f0-9]{64}$/.test(
      entry.acceptedOriginBundleId,
    )
  ) {
    fail("P10.2 accepted-origin bundle ID is invalid");
  }
  if (entry.sidecar.sidecarId !== entry.sidecarId) {
    fail("P10.2 entry and sidecar IDs diverge");
  }
  if (taskMapContractDigest(entry.sidecar) !== entry.sidecarDigest) {
    fail("P10.2 sidecar digest does not match its authenticated bytes");
  }
  if (
    taskMapContractDigest(entry.sidecar.replayClosure)
      !== entry.replayClosureDigest
    || entry.sidecar.origin.replayClosureDigest
      !== entry.replayClosureDigest
  ) {
    fail("P10.2 replay-closure digest binding is invalid");
  }
  if (
    entry.sidecar.ownerScopeDigest !== entry.ownerScopeDigest
    || entry.sidecar.origin.currentGeneration !== entry.generation
    || entry.sidecar.origin.currentRefId !== entry.currentRefId
    || entry.sidecar.origin.bundleId !== entry.acceptedOriginBundleId
    || entry.sidecar.origin.acceptedOriginReplayDigest
      !== entry.acceptedOriginReplayDigest
  ) {
    fail("P10.2 entry metadata diverges from its sidecar origin");
  }
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  if (
    projection.runId !== entry.sidecar.projectionRunId
    || projection.runId !== entry.sidecar.replayClosure.projectionRunId
    || projection.inputDigest
      !== entry.sidecar.replayClosure.projectionInputDigest
    || projectionDigest !== entry.sidecar.projectionDigest
    || projectionDigest !== entry.sidecar.replayClosure.projectionDigest
  ) {
    fail("supplied projection does not exactly match the P10.2 replay tuple");
  }
  assertHashedId(
    projection.runId,
    HASHED_IDS.projectionRun,
    "projection run ID",
  );
  assertDigest(projection.inputDigest, "projection input digest");
  assertDigest(
    entry.sidecar.replayClosure.sourceSemanticInputDigest,
    "source semantic input digest",
  );
  assertDigest(
    entry.sidecar.origin.acceptedStateDigest,
    "P10.2 accepted-state digest",
  );
  assertDigest(
    entry.sidecar.sourceSnapshotDigest,
    "P10.2 source-snapshot digest",
  );
  return {
    ownerScopeDigest: entry.ownerScopeDigest,
    generation: entry.generation,
    currentRefId: entry.currentRefId,
    currentRefDigest: entry.currentRefDigest,
    entryId: entry.entryId,
    acceptedOriginBundleId: entry.acceptedOriginBundleId,
    acceptedOriginReplayDigest: entry.acceptedOriginReplayDigest,
    acceptedStateDigest: entry.sidecar.origin.acceptedStateDigest,
    sidecarId: entry.sidecarId,
    sidecarDigest: entry.sidecarDigest,
    replayClosureDigest: entry.replayClosureDigest,
    sourceSnapshotDigest: entry.sidecar.sourceSnapshotDigest,
    sourceSemanticInputDigest:
      entry.sidecar.replayClosure.sourceSemanticInputDigest,
    projectionRunId: projection.runId,
    projectionInputDigest: projection.inputDigest,
    projectionDigest,
    inputDomainBinding: "separate_authenticated_domains",
  };
}

function lifecycleDecision(
  state: TaskMapAdjudicatedLifecycleState,
): TaskMapWorkControlLifecycleDecision {
  if (state === "open") return "accepted_open";
  if (state === "resolved") return "source_complete";
  return state;
}

function assertTaskLifecycleConsistent(
  task: TaskMapTask,
  lifecycle: TaskMapAdjudicatedLifecycleState,
): void {
  if (lifecycle === "open") {
    if (
      task.reviewState !== "accepted"
      || TERMINAL_OPEN_STATES.has(task.openState)
    ) {
      fail(`open work ${task.id} has unsafe projection terminal semantics`);
    }
    return;
  }
  if (
    lifecycle === "resolved"
    && (
      task.reviewState !== "source_complete"
      || task.openState !== "completed"
    )
  ) {
    fail(`resolved work ${task.id} is inconsistent with its P10.2 lifecycle`);
  }
  if (
    lifecycle === "superseded"
    && (
      task.reviewState !== "superseded"
      || task.openState !== "superseded"
    )
  ) {
    fail(`superseded work ${task.id} is inconsistent with its P10.2 lifecycle`);
  }
  if (lifecycle === "rejected") {
    fail(`rejected P10.2 work ${task.id} cannot retain a projected task`);
  }
}

function bindWorks(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  projection: TaskMapProjectionV1,
): {
  workDecisions: TaskMapWorkControlWorkDecisionV1[];
  workById: Map<string, WorkAccumulator>;
  workIdByTaskId: Map<string, string>;
} {
  if (entry.sidecar.works.length > TASKMAP_WORK_CONTROL_LIMITS_V1.maxWorks) {
    fail("P10.2 work count exceeds the P10.3a policy ceiling");
  }
  const taskRowsByDigest = new Map<string, TaskMapTask>();
  for (const task of projection.tasks) {
    const rowDigest = taskMapContractDigest(task);
    if (taskRowsByDigest.has(rowDigest)) {
      fail("projection contains duplicate task-row digests");
    }
    taskRowsByDigest.set(rowDigest, task);
  }
  const rejectionRowsByDigest = new Map<
    string,
    TaskMapProjectionV1["rejections"][number]
  >();
  for (const rejection of projection.rejections) {
    if (rejection.kind !== "task") continue;
    const rowDigest = taskMapContractDigest(rejection);
    if (rejectionRowsByDigest.has(rowDigest)) {
      fail("projection contains duplicate task-rejection row digests");
    }
    rejectionRowsByDigest.set(rowDigest, rejection);
  }
  const usedTaskDigests = new Set<string>();
  const usedRejectionDigests = new Set<string>();
  const workById = new Map<string, WorkAccumulator>();
  const workIdByTaskId = new Map<string, string>();
  const usedReferences = new Set<string>();
  for (const work of entry.sidecar.works) {
    assertHashedId(work.workId, HASHED_IDS.work, "P10.2 work ID");
    if (workById.has(work.workId)) fail("P10.2 work IDs are not unique");
    const accumulator: WorkAccumulator = {
      workId: work.workId,
      lifecycleState: work.lifecycleState,
      taskIds: [],
      rejectionReferenceIds: [],
      rowDigests: [],
      tasks: [],
      taskRows: [],
      rejectionRows: [],
      rootId: null,
    };
    for (const reference of work.projectionReferences) {
      assertHashedId(
        reference.id,
        HASHED_IDS.projectionRef,
        "P10.2 projection-reference ID",
      );
      assertDigest(
        reference.projectionRowDigest,
        "P10.2 projection-row digest",
      );
      const expectedReferenceId = `tmprojectionref_${
        taskMapContractDigest({
          kind: reference.kind,
          projectionRowDigest: reference.projectionRowDigest,
        })
      }`;
      if (reference.id !== expectedReferenceId) {
        fail("P10.2 projection-reference ID is not row-derived");
      }
      if (usedReferences.has(reference.id)) {
        fail("a projection reference is bound more than once");
      }
      usedReferences.add(reference.id);
      accumulator.rowDigests.push(reference.projectionRowDigest);
      if (reference.kind === "task") {
        const task = taskRowsByDigest.get(reference.projectionRowDigest);
        if (task === undefined) {
          fail("P10.2 task reference is absent from the supplied projection");
        }
        if (usedTaskDigests.has(reference.projectionRowDigest)) {
          fail("a projection task row is bound more than once");
        }
        usedTaskDigests.add(reference.projectionRowDigest);
        if (task.reviewState === "proposed") {
          fail("P10.2 cannot authenticate a proposed REVIEW NEXT task");
        }
        assertTaskLifecycleConsistent(task, work.lifecycleState);
        accumulator.taskIds.push(task.id);
        accumulator.tasks.push(task);
        accumulator.taskRows.push({
          taskId: task.id,
          projectionRowDigest: reference.projectionRowDigest,
        });
        if (accumulator.rootId === null) {
          accumulator.rootId = task.rootId;
        } else if (accumulator.rootId !== task.rootId) {
          fail("one canonical work crosses multiple projection roots");
        }
        if (workIdByTaskId.has(task.id)) {
          fail("a projection task is bound to multiple canonical works");
        }
        workIdByTaskId.set(task.id, work.workId);
      } else {
        const rejection = rejectionRowsByDigest.get(
          reference.projectionRowDigest,
        );
        if (rejection === undefined) {
          fail("P10.2 rejection reference is absent from the supplied projection");
        }
        if (usedRejectionDigests.has(reference.projectionRowDigest)) {
          fail("a projection rejection row is bound more than once");
        }
        usedRejectionDigests.add(reference.projectionRowDigest);
        accumulator.rejectionReferenceIds.push(reference.id);
        accumulator.rejectionRows.push({
          projectionReferenceId: reference.id,
          projectionRowDigest: reference.projectionRowDigest,
        });
      }
    }
    if (accumulator.rowDigests.length === 0) {
      fail("P10.2 canonical work has no projection reference");
    }
    if (
      work.lifecycleState === "rejected"
      && accumulator.rejectionReferenceIds.length === 0
    ) {
      fail("rejected P10.2 work lacks an authenticated rejection row");
    }
    if (
      work.lifecycleState !== "rejected"
      && accumulator.taskIds.length === 0
    ) {
      fail("non-rejected P10.2 work lacks an authenticated task row");
    }
    accumulator.taskIds.sort(compareText);
    accumulator.taskRows.sort((left, right) => (
      compareText(left.taskId, right.taskId)
      || compareText(
        left.projectionRowDigest,
        right.projectionRowDigest,
      )
    ));
    accumulator.rejectionReferenceIds.sort(compareText);
    accumulator.rejectionRows.sort((left, right) => (
      compareText(
        left.projectionReferenceId,
        right.projectionReferenceId,
      )
      || compareText(
        left.projectionRowDigest,
        right.projectionRowDigest,
      )
    ));
    accumulator.rowDigests.sort(compareText);
    workById.set(work.workId, accumulator);
  }
  if (usedTaskDigests.size !== taskRowsByDigest.size) {
    fail("every supplied projection task must bind exactly once to P10.2");
  }
  const workDecisions = [...workById.values()]
    .map((work): TaskMapWorkControlWorkDecisionV1 => ({
      workId: work.workId,
      lifecycleDecision: lifecycleDecision(work.lifecycleState),
      rankEligible: work.lifecycleState === "open",
      rootId: work.rootId,
      projectionTaskRows: work.taskRows,
      projectionRejectionRows: work.rejectionRows,
      projectionTaskIds: work.taskIds,
      projectionRejectionReferenceIds: work.rejectionReferenceIds,
      projectionRowDigests: work.rowDigests,
    }))
    .sort((left, right) => compareText(left.workId, right.workId));
  return {
    workDecisions,
    workById,
    workIdByTaskId,
  };
}

function controlRelations(
  projection: TaskMapProjectionV1,
  workById: Map<string, WorkAccumulator>,
  workIdByTaskId: Map<string, string>,
): {
  relationDecisions: TaskMapWorkControlRelationDecisionV1[];
  executionDependencies: TaskMapWorkControlExecutionDependencyV1[];
} {
  if (
    projection.edges.length
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations
  ) {
    fail("projection relation count exceeds the P10.3a policy ceiling");
  }
  const relationDecisions: TaskMapWorkControlRelationDecisionV1[] = [];
  const executionDependencies: TaskMapWorkControlExecutionDependencyV1[] = [];
  const dependencyPairs = new Set<string>();
  const supersedePairs = new Set<string>();
  for (const edge of [...projection.edges].sort((left, right) => (
    compareText(left.id, right.id)
  ))) {
    if (!CONTROL_RELATIONS.has(edge.relation as BrainRelation)) {
      relationDecisions.push({
        edgeId: edge.id,
        relation: edge.relation,
        outcome: "ignored_non_control",
      });
      continue;
    }
    const fromWorkId = workIdByTaskId.get(edge.from);
    const toWorkId = workIdByTaskId.get(edge.to);
    if (fromWorkId === undefined || toWorkId === undefined) {
      fail(`control relation ${edge.id} has a dangling canonical-work endpoint`);
    }
    if (fromWorkId === toWorkId) {
      fail(`control relation ${edge.id} is self-referential after dedupe`);
    }
    if (edge.relation === "supersedes") {
      const pair = `${fromWorkId}\u0000${toWorkId}`;
      if (supersedePairs.has(pair)) {
        fail("duplicate supersedes relation after identity normalization");
      }
      supersedePairs.add(pair);
      if (
        workById.get(fromWorkId)?.lifecycleState !== "open"
        || workById.get(toWorkId)?.lifecycleState !== "superseded"
      ) {
        fail("supersedes relation is not backed by P10.2 lifecycle authority");
      }
      relationDecisions.push({
        edgeId: edge.id,
        relation: edge.relation,
        outcome: "lifecycle_only",
        supersedingWorkId: fromWorkId,
        supersededWorkId: toWorkId,
      });
      continue;
    }
    const prerequisiteWorkId =
      edge.relation === "depends_on" ? toWorkId : fromWorkId;
    const dependentWorkId =
      edge.relation === "depends_on" ? fromWorkId : toWorkId;
    if (
      workById.get(prerequisiteWorkId)?.lifecycleState !== "open"
      || workById.get(dependentWorkId)?.lifecycleState !== "open"
    ) {
      fail("execution dependency references terminal canonical work");
    }
    const pair = `${prerequisiteWorkId}\u0000${dependentWorkId}`;
    if (dependencyPairs.has(pair)) {
      fail("duplicate execution dependency after relation normalization");
    }
    dependencyPairs.add(pair);
    relationDecisions.push({
      edgeId: edge.id,
      relation: edge.relation,
      outcome: "execution_dependency",
      prerequisiteWorkId,
      dependentWorkId,
    });
    executionDependencies.push({
      prerequisiteWorkId,
      dependentWorkId,
      edgeId: edge.id,
    });
  }
  executionDependencies.sort((left, right) => (
    compareText(left.prerequisiteWorkId, right.prerequisiteWorkId)
    || compareText(left.dependentWorkId, right.dependentWorkId)
    || compareText(left.edgeId, right.edgeId)
  ));
  assertAcyclic(workById, executionDependencies);
  return { relationDecisions, executionDependencies };
}

function assertAcyclic(
  workById: Map<string, WorkAccumulator>,
  dependencies: TaskMapWorkControlExecutionDependencyV1[],
): void {
  const openWorkIds = [...workById.values()]
    .filter((work) => work.lifecycleState === "open")
    .map((work) => work.workId)
    .sort(compareText);
  const indegree = new Map(openWorkIds.map((workId) => [workId, 0]));
  const outgoing = new Map(openWorkIds.map((workId) => [
    workId,
    [] as string[],
  ]));
  for (const dependency of dependencies) {
    outgoing.get(dependency.prerequisiteWorkId)!.push(
      dependency.dependentWorkId,
    );
    indegree.set(
      dependency.dependentWorkId,
      indegree.get(dependency.dependentWorkId)! + 1,
    );
  }
  const ready = openWorkIds.filter((workId) => indegree.get(workId) === 0);
  let visited = 0;
  while (ready.length > 0) {
    const workId = ready.shift()!;
    visited += 1;
    for (
      const dependent of outgoing.get(workId)!.sort(compareText)
    ) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort(compareText);
      }
    }
  }
  if (visited !== openWorkIds.length) {
    fail("normalized execution dependency graph contains a cycle");
  }
}

function unitBasisPoints(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${label} must be a finite unit-interval factor`);
  }
  return Math.floor(value * 10_000 + 0.5);
}

function weightedContribution(
  factorBasisPoints: number,
  weightBasisPoints: number,
): number {
  return Math.floor(
    (factorBasisPoints * weightBasisPoints + 5_000) / 10_000,
  );
}

function scoreAcceptedOpenTask(
  task: TaskMapTask,
  dependencyImpact: number,
  label: string,
): TaskMapWorkControlAliasRankProofV1 {
  const factors = {} as Record<TaskMapWorkControlRankFactor, number>;
  for (const factor of TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER) {
    // A missing evidence factor contributes zero. The policy weights are not
    // renormalized around absent evidence.
    factors[factor] = unitBasisPoints(
      task.score[factor] ?? 0,
      `${label} ${factor}`,
    );
  }
  // Dependency impact is always recomputed from the validated execution DAG.
  factors.dependencyImpact = dependencyImpact;
  factors.bodyBonus = Math.min(
    factors.bodyBonus,
    TASKMAP_WORK_CONTROL_POLICY_V1.bodyBonusCapBasisPoints,
  );
  const contributions: Record<TaskMapWorkControlRankFactor, number> = {
    sourcePriority: weightedContribution(
      factors.sourcePriority,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.sourcePriority,
    ),
    deadlinePressure: weightedContribution(
      factors.deadlinePressure,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.deadlinePressure,
    ),
    dependencyImpact: weightedContribution(
      factors.dependencyImpact,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.dependencyImpact,
    ),
    recurrence: weightedContribution(
      factors.recurrence,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.recurrence,
    ),
    staleOpen: weightedContribution(
      factors.staleOpen,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.staleOpen,
    ),
    evidenceStrength: weightedContribution(
      factors.evidenceStrength,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.evidenceStrength,
    ),
    bodyBonus: factors.bodyBonus,
  };
  const scoreBasisPoints = Math.min(
    TASKMAP_WORK_CONTROL_POLICY_V1.scoreCapBasisPoints,
    TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.reduce(
      (sum, factor) => sum + contributions[factor],
      0,
    ),
  );
  const reasonCodes = [...TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER]
    .filter((factor) => contributions[factor] > 0)
    .sort((left, right) => (
      contributions[right] - contributions[left]
      || TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(left)
        - TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(right)
    ))
    .slice(0, 3)
    .map((factor) => RANK_REASON_BY_FACTOR[factor]);
  return {
    taskId: task.id,
    projectionRowDigest: taskMapContractDigest(task),
    factorBasisPoints: factors,
    contributionBasisPoints: contributions,
    scoreBasisPoints,
    reasonCodes,
  };
}

export function rankAcceptedOpenProjectionTasks(
  projection: TaskMapProjectionV1,
): TaskMapAcceptedOpenTaskRankV1[] {
  const tasks = projection.tasks.filter((task) => (
    task.reviewState === "accepted" && task.openState === "open"
  ));
  const eligibleTaskIds = new Set(tasks.map((task) => task.id));
  const outgoing = new Map(tasks.map((task) => [task.id, new Set<string>()]));
  for (const edge of projection.edges) {
    if (edge.relation !== "blocks" && edge.relation !== "depends_on") {
      continue;
    }
    const prerequisite = edge.relation === "depends_on" ? edge.to : edge.from;
    const dependent = edge.relation === "depends_on" ? edge.from : edge.to;
    if (
      eligibleTaskIds.has(prerequisite)
      && eligibleTaskIds.has(dependent)
      && prerequisite !== dependent
    ) {
      outgoing.get(prerequisite)!.add(dependent);
    }
  }
  const ranked = tasks.map((task) => {
    const count = Math.min(
      TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
      outgoing.get(task.id)?.size ?? 0,
    );
    const dependencyImpact = Math.floor(
      (
        count * 10_000
        + Math.floor(TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2)
      ) / TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
    );
    return scoreAcceptedOpenTask(task, dependencyImpact, task.id);
  }).sort((left, right) => (
    right.scoreBasisPoints - left.scoreBasisPoints
    || compareText(left.taskId, right.taskId)
    || compareText(left.projectionRowDigest, right.projectionRowDigest)
  ));
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

function rankAcceptedOpen(
  workById: Map<string, WorkAccumulator>,
  dependencies: TaskMapWorkControlExecutionDependencyV1[],
): TaskMapWorkControlRankDecisionV1[] {
  const outgoingCount = new Map<string, number>();
  for (const dependency of dependencies) {
    outgoingCount.set(
      dependency.prerequisiteWorkId,
      (outgoingCount.get(dependency.prerequisiteWorkId) ?? 0) + 1,
    );
  }
  const rows = [...workById.values()]
    .filter((work) => work.lifecycleState === "open")
    .map((work) => {
      const count = Math.min(
        TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
        outgoingCount.get(work.workId) ?? 0,
      );
      const dependencyImpact = Math.floor(
        (
          count * 10_000
          + Math.floor(
            TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2,
          )
        ) / TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
      );
      const representatives = work.tasks.map((task) => (
        scoreAcceptedOpenTask(task, dependencyImpact, work.workId)
      )).sort((left, right) => (
        right.scoreBasisPoints - left.scoreBasisPoints
        || compareText(left.taskId, right.taskId)
        || compareText(
          left.projectionRowDigest,
          right.projectionRowDigest,
        )
      ));
      const representative = representatives[0];
      if (representative === undefined) {
        fail(`${work.workId} has no accepted task rank factors`);
      }
      return {
        rank: 0,
        workId: work.workId,
        representativeProjectionTaskId: representative.taskId,
        representativeProjectionRowDigest:
          representative.projectionRowDigest,
        scoreBasisPoints: representative.scoreBasisPoints,
        factorBasisPoints: representative.factorBasisPoints,
        contributionBasisPoints:
          representative.contributionBasisPoints,
        reasonCodes: representative.reasonCodes,
        aliasRankProofRows: representatives,
      };
    })
    .sort((left, right) => (
      right.scoreBasisPoints - left.scoreBasisPoints
      || compareText(left.workId, right.workId)
    ));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

const PRIVACY: TaskMapWorkControlDecisionPrivacyV1 = Object.freeze({
  sourceBodiesStored: false,
  candidateTextStored: false,
  rawOwnerIdentifiersStored: false,
  rawSourceObjectIdentifiersStored: false,
  rawSourceRevisionsStored: false,
  rawBiometricsStored: false,
  localPathsStored: false,
  connectorSecretsStored: false,
  executionStateStored: false,
});

function assertArtifactPrivacy(value: unknown, path = "artifact"): void {
  if (typeof value === "string") {
    if (
      /(?:https?|file):\/\//i.test(value)
      || /(?:^|[\\/])Users[\\/]/.test(value)
      || /(?:^|[\\/])home[\\/]/.test(value)
      || /\b[A-Z]:\\/.test(value)
      || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
      || /\b(?:sk|api|token|secret)[-_][A-Za-z0-9_-]{12,}\b/i.test(value)
    ) {
      fail(`${path} contains privacy-sensitive string material`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => (
      assertArtifactPrivacy(item, `${path}[${index}]`)
    ));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (
      /^(?:title|summary|body|transcript|sourceObjectId|sourceRevision|ownerId|participant|email|localPath|credential|secret|token)$/i
        .test(key)
    ) {
      fail(`${path}.${key} is forbidden by the privacy contract`);
    }
    assertArtifactPrivacy(item, `${path}.${key}`);
  }
}

function artifactCore(
  artifact: Omit<
    TaskMapWorkControlDecisionV1,
    "artifactId" | "artifactDigest"
  >,
): Omit<
  TaskMapWorkControlDecisionV1,
  "artifactId" | "artifactDigest"
> {
  return artifact;
}

function buildFromAuthenticatedSnapshots(
  firstStoreInput: TaskMapIdentityDedupeStoreSnapshotV1,
  projectionInput: TaskMapProjectionV1,
  authenticateSelectedEntry: boolean,
): {
  built: BuiltTaskMapWorkControlDecision;
  firstEntryCount: number;
  firstEntry: TaskMapIdentityDedupeProjectionStoreEntryV1;
} {
  const projection = snapshotJson(
    projectionInput,
    "P10.3a supplied projection",
  );
  const firstEntry = latestProjectionEntry(
    firstStoreInput,
    "first authenticated P10.2 store snapshot",
    authenticateSelectedEntry,
  );
  const predecessor = predecessorFrom(firstEntry, projection);
  const {
    workDecisions,
    workById,
    workIdByTaskId,
  } =
    bindWorks(firstEntry, projection);
  const { relationDecisions, executionDependencies } =
    controlRelations(
      projection,
      workById,
      workIdByTaskId,
    );
  const rankedAcceptedOpen =
    rankAcceptedOpen(workById, executionDependencies);
  const originDigest = digestCanonical(predecessor);
  const core = artifactCore({
    contractVersion: TASKMAP_WORK_CONTROL_DECISION_VERSION,
    originDigest,
    policyVersion: TASKMAP_WORK_CONTROL_POLICY_VERSION,
    policyDigest: TASKMAP_WORK_CONTROL_POLICY_DIGEST,
    predecessor,
    candidateCoverage: TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
    reviewNext: [],
    workDecisions,
    relationDecisions,
    executionDependencies,
    rankedAcceptedOpen,
    privacy: { ...PRIVACY },
  });
  const artifactDigest = digestCanonical(core);
  const artifact: TaskMapWorkControlDecisionV1 = {
    ...core,
    artifactId: `tmworkcontroldecision_${artifactDigest}`,
    artifactDigest,
  };
  return {
    built: {
      artifact: assertTaskMapWorkControlDecision(artifact),
      canonicalBytes: taskMapWorkControlDecisionCanonicalBytes(artifact),
    },
    firstEntryCount: firstStoreInput.entries.length,
    firstEntry,
  };
}

function closeAuthenticatedHeadRace(
  candidate: ReturnType<typeof buildFromAuthenticatedSnapshots>,
  secondStoreInput: TaskMapIdentityDedupeStoreSnapshotV1,
  authenticateSelectedEntry: boolean,
): BuiltTaskMapWorkControlDecision {
  assertSameAuthenticatedHead(
    candidate.firstEntryCount,
    secondStoreInput,
    candidate.firstEntry,
    authenticateSelectedEntry,
  );
  return candidate.built;
}

/**
 * Product path. The complete caller input is snapshotted before the first
 * await, and the authenticated P10.2 head is read and rechecked around the
 * pure decision build.
 */
async function buildTaskMapWorkControlDecisionProductCore(
  input: BuildTaskMapWorkControlDecisionInput,
  afterFirstAuthenticatedRead?: () => void | Promise<void>,
): Promise<BuiltTaskMapWorkControlDecision> {
  const snapshot = snapshotJson(input, "P10.3a build input");
  assertExactKeys(
    snapshot,
    ["currentRoot", "runRoot", "sidecarRoot", "projection"],
    [],
    "P10.3a build input",
  );
  const roots: TaskMapIdentityDedupeStoreRoots = {
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
  };
  const heldRoots = await holdTaskMapWorkControlRoots(roots);
  try {
    const firstStore =
      await readTaskMapIdentityDedupeProjectionStore(roots);
    if (afterFirstAuthenticatedRead !== undefined) {
      await afterFirstAuthenticatedRead();
    }
    const candidate = buildFromAuthenticatedSnapshots(
      firstStore,
      snapshot.projection,
      true,
    );
    const secondStore =
      await readTaskMapIdentityDedupeProjectionStore(roots);
    revalidateHeldTaskMapWorkControlRootsSync(heldRoots);
    const built = closeAuthenticatedHeadRace(
      candidate,
      secondStore,
      true,
    );
    return built;
  } finally {
    await closeHeldRoots(heldRoots);
  }
}

export async function buildTaskMapWorkControlDecision(
  input: BuildTaskMapWorkControlDecisionInput,
): Promise<BuiltTaskMapWorkControlDecision> {
  return buildTaskMapWorkControlDecisionProductCore(input);
}

/**
 * TEST-ONLY product-wiring seam. Authentication remains the real public P10.2
 * reader; the sole hook permits a deterministic temporary-filesystem swap
 * after its first successful read.
 */
export async function unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest(
  input: BuildTaskMapWorkControlDecisionInput,
  afterFirstAuthenticatedRead: () => void | Promise<void>,
): Promise<BuiltTaskMapWorkControlDecision> {
  return buildTaskMapWorkControlDecisionProductCore(
    input,
    afterFirstAuthenticatedRead,
  );
}

/**
 * TEST-ONLY root-receipt exerciser. It performs no Task Map reads or writes;
 * the callback exists only to deterministically replace a temporary test root
 * between receipt acquisition and revalidation.
 */
export async function unsafeExerciseTaskMapWorkControlRootReceiptForTest(
  rootsInput: TaskMapIdentityDedupeStoreRoots,
  between: () => void | Promise<void>,
): Promise<void> {
  const roots = snapshotJson(
    rootsInput,
    "unsafe P10.3a root-receipt test roots",
  );
  assertExactKeys(
    roots,
    ["currentRoot", "runRoot", "sidecarRoot"],
    [],
    "unsafe P10.3a root-receipt test roots",
  );
  const heldRoots = await holdTaskMapWorkControlRoots(roots);
  try {
    await between();
    revalidateHeldTaskMapWorkControlRootsSync(heldRoots);
  } finally {
    await closeHeldRoots(heldRoots);
  }
}

/**
 * TEST-ONLY. This bypasses P10.2 filesystem/authentication and must never be
 * used as a product reader. It preserves the same exact projection, lifecycle,
 * row-bijection, head-stability, DAG, rank, and privacy decisions.
 */
export function unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(
  input: UnsafeBuildTaskMapWorkControlDecisionInputForTest,
): BuiltTaskMapWorkControlDecision {
  const snapshot = snapshotJson(input, "unsafe P10.3a test input");
  assertExactKeys(
    snapshot,
    ["firstStore", "secondStore", "projection"],
    [],
    "unsafe P10.3a test input",
  );
  const candidate = buildFromAuthenticatedSnapshots(
    snapshot.firstStore,
    snapshot.projection,
    false,
  );
  return closeAuthenticatedHeadRace(
    candidate,
    snapshot.secondStore,
    false,
  );
}

function assertIntegerBasisPoints(value: unknown, label: string): void {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value > 10_000
  ) {
    fail(`${label} must be integer basis points`);
  }
}

function assertRecordValue(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) {
    fail(`${label} must be an object`);
  }
}

function assertArrayValue(
  value: unknown,
  label: string,
): asserts value is unknown[] {
  if (!ARRAY_IS_ARRAY(value)) fail(`${label} must be an array`);
}

function assertSortedUniqueStrings(
  value: unknown,
  label: string,
  pattern?: RegExp,
): asserts value is string[] {
  assertArrayValue(value, label);
  let previous: string | undefined;
  for (const row of value) {
    if (
      typeof row !== "string"
      || (pattern !== undefined && !pattern.test(row))
    ) {
      fail(`${label} contains an invalid string`);
    }
    if (previous !== undefined && compareText(previous, row) >= 0) {
      fail(`${label} must be strictly code-point sorted and unique`);
    }
    previous = row;
  }
}

function expectedRankReasonCodes(
  contributions: Record<TaskMapWorkControlRankFactor, number>,
): TaskMapWorkControlRankReasonCode[] {
  return [...TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER]
    .filter((factor) => contributions[factor] > 0)
    .sort((left, right) => (
      contributions[right] - contributions[left]
      || TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(left)
        - TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(right)
    ))
    .slice(0, 3)
    .map((factor) => RANK_REASON_BY_FACTOR[factor]);
}

function expectedRankContributions(
  factors: Record<TaskMapWorkControlRankFactor, number>,
): Record<TaskMapWorkControlRankFactor, number> {
  return {
    sourcePriority: weightedContribution(
      factors.sourcePriority,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.sourcePriority,
    ),
    deadlinePressure: weightedContribution(
      factors.deadlinePressure,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.deadlinePressure,
    ),
    dependencyImpact: weightedContribution(
      factors.dependencyImpact,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.dependencyImpact,
    ),
    recurrence: weightedContribution(
      factors.recurrence,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.recurrence,
    ),
    staleOpen: weightedContribution(
      factors.staleOpen,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.staleOpen,
    ),
    evidenceStrength: weightedContribution(
      factors.evidenceStrength,
      TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.evidenceStrength,
    ),
    bodyBonus: factors.bodyBonus,
  };
}

function assertAliasRankProofScore(
  row: TaskMapWorkControlAliasRankProofV1,
  expectedDependencyImpact: number,
  label: string,
): void {
  assertIntegerBasisPoints(row.scoreBasisPoints, `${label} score`);
  assertRecordValue(row.factorBasisPoints, `${label} factor basis points`);
  assertRecordValue(
    row.contributionBasisPoints,
    `${label} contribution basis points`,
  );
  assertExactKeys(
    row.factorBasisPoints,
    TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER,
    [],
    `${label} factor basis points`,
  );
  assertExactKeys(
    row.contributionBasisPoints,
    TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER,
    [],
    `${label} contribution basis points`,
  );
  for (const factor of TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER) {
    assertIntegerBasisPoints(
      row.factorBasisPoints[factor],
      `${label} ${factor} factor`,
    );
    assertIntegerBasisPoints(
      row.contributionBasisPoints[factor],
      `${label} ${factor} contribution`,
    );
  }
  if (
    row.factorBasisPoints.bodyBonus
      > TASKMAP_WORK_CONTROL_POLICY_V1.bodyBonusCapBasisPoints
  ) {
    fail(`${label} body bonus exceeds the closed policy cap`);
  }
  if (
    row.factorBasisPoints.dependencyImpact !== expectedDependencyImpact
  ) {
    fail(`${label} dependency-impact factor is not DAG-derived`);
  }
  const expectedContributions =
    expectedRankContributions(row.factorBasisPoints);
  if (
    canonicalJson(row.contributionBasisPoints)
      !== canonicalJson(expectedContributions)
  ) {
    fail(`${label} contributions are not policy-derived`);
  }
  const expectedScore = Math.min(
    TASKMAP_WORK_CONTROL_POLICY_V1.scoreCapBasisPoints,
    TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.reduce(
      (sum, factor) => sum + expectedContributions[factor],
      0,
    ),
  );
  if (
    row.scoreBasisPoints !== expectedScore
    || canonicalJson(row.reasonCodes)
      !== canonicalJson(expectedRankReasonCodes(expectedContributions))
  ) {
    fail(`${label} score or reasons are not policy-derived`);
  }
}

function compareAliasRankProof(
  left: TaskMapWorkControlAliasRankProofV1,
  right: TaskMapWorkControlAliasRankProofV1,
): number {
  return right.scoreBasisPoints - left.scoreBasisPoints
    || compareText(left.taskId, right.taskId)
    || compareText(left.projectionRowDigest, right.projectionRowDigest);
}

function assertArtifactDependencyAcyclic(
  openWorkIds: readonly string[],
  dependencies: readonly TaskMapWorkControlExecutionDependencyV1[],
): void {
  const indegree = new Map(openWorkIds.map((workId) => [workId, 0]));
  const outgoing = new Map(openWorkIds.map((workId) => [
    workId,
    [] as string[],
  ]));
  for (const dependency of dependencies) {
    outgoing.get(dependency.prerequisiteWorkId)!.push(
      dependency.dependentWorkId,
    );
    indegree.set(
      dependency.dependentWorkId,
      indegree.get(dependency.dependentWorkId)! + 1,
    );
  }
  const ready = openWorkIds
    .filter((workId) => indegree.get(workId) === 0)
    .sort(compareText);
  let visited = 0;
  while (ready.length > 0) {
    const current = ready.shift()!;
    visited += 1;
    for (const dependent of outgoing.get(current)!.sort(compareText)) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort(compareText);
      }
    }
  }
  if (visited !== openWorkIds.length) {
    fail("artifact execution dependency graph contains a cycle");
  }
}

/**
 * Self-contained semantic/canonical validator. It does not authenticate the
 * predecessor against P10.1/P10.2 storage. Product trust requires rebuilding
 * through buildTaskMapWorkControlDecision and its authenticated store reads.
 */
export function assertTaskMapWorkControlDecision(
  value: TaskMapWorkControlDecisionV1,
): TaskMapWorkControlDecisionV1 {
  const artifact = snapshotJson(
    value,
    "P10.3a decision artifact",
    TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes,
  );
  assertExactKeys(
    artifact,
    [
      "contractVersion",
      "artifactId",
      "artifactDigest",
      "originDigest",
      "policyVersion",
      "policyDigest",
      "predecessor",
      "candidateCoverage",
      "reviewNext",
      "workDecisions",
      "relationDecisions",
      "executionDependencies",
      "rankedAcceptedOpen",
      "privacy",
    ],
    [],
    "P10.3a decision artifact",
  );
  if (
    artifact.contractVersion !== TASKMAP_WORK_CONTROL_DECISION_VERSION
    || artifact.policyVersion !== TASKMAP_WORK_CONTROL_POLICY_VERSION
    || artifact.policyDigest !== TASKMAP_WORK_CONTROL_POLICY_DIGEST
  ) {
    fail("artifact version or policy binding is invalid");
  }
  assertHashedId(
    artifact.artifactId,
    HASHED_IDS.decision,
    "artifact ID",
  );
  assertDigest(artifact.artifactDigest, "artifact digest");
  assertDigest(artifact.originDigest, "origin digest");
  assertArrayValue(artifact.reviewNext, "artifact reviewNext");
  assertArrayValue(artifact.workDecisions, "artifact work decisions");
  if (
    artifact.workDecisions.length
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxWorks
  ) {
    fail("artifact work decision count exceeds the policy ceiling");
  }
  assertArrayValue(
    artifact.relationDecisions,
    "artifact relation decisions",
  );
  assertArrayValue(
    artifact.executionDependencies,
    "artifact execution dependencies",
  );
  if (
    artifact.relationDecisions.length
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations
  ) {
    fail("artifact relation decision count exceeds the policy ceiling");
  }
  if (
    artifact.executionDependencies.length
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations
  ) {
    fail("artifact execution dependency count exceeds the policy ceiling");
  }
  assertArrayValue(
    artifact.rankedAcceptedOpen,
    "artifact ranked accepted-open rows",
  );
  if (
    artifact.candidateCoverage
      !== TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE
    || artifact.reviewNext.length !== 0
  ) {
    fail("P10.2 v1 candidate coverage must stay unavailable and empty");
  }
  assertRecordValue(artifact.privacy, "artifact privacy");
  if (canonicalJson(artifact.privacy) !== canonicalJson(PRIVACY)) {
    fail("artifact privacy declaration is invalid");
  }
  assertRecordValue(artifact.predecessor, "artifact predecessor");
  assertExactKeys(
    artifact.predecessor,
    [
      "ownerScopeDigest",
      "generation",
      "currentRefId",
      "currentRefDigest",
      "entryId",
      "acceptedOriginBundleId",
      "acceptedOriginReplayDigest",
      "acceptedStateDigest",
      "sidecarId",
      "sidecarDigest",
      "replayClosureDigest",
      "sourceSnapshotDigest",
      "sourceSemanticInputDigest",
      "projectionRunId",
      "projectionInputDigest",
      "projectionDigest",
      "inputDomainBinding",
    ],
    [],
    "artifact predecessor",
  );
  assertDigest(
    artifact.predecessor.ownerScopeDigest,
    "artifact predecessor owner scope",
  );
  if (
    !FIXED_GENERATION.test(artifact.predecessor.generation)
    || BigInt(artifact.predecessor.generation) === 0n
  ) {
    fail("artifact predecessor generation is invalid");
  }
  assertHashedId(
    artifact.predecessor.currentRefId,
    HASHED_IDS.currentRef,
    "artifact predecessor current-ref ID",
  );
  assertHashedId(
    artifact.predecessor.entryId,
    HASHED_IDS.entry,
    "artifact predecessor entry ID",
  );
  assertHashedId(
    artifact.predecessor.sidecarId,
    HASHED_IDS.sidecar,
    "artifact predecessor sidecar ID",
  );
  assertHashedId(
    artifact.predecessor.projectionRunId,
    HASHED_IDS.projectionRun,
    "artifact predecessor projection run ID",
  );
  if (
    typeof artifact.predecessor.acceptedOriginBundleId !== "string"
    || !/^tmrefreshrun_[a-f0-9]{64}$/.test(
      artifact.predecessor.acceptedOriginBundleId,
    )
  ) {
    fail("artifact predecessor accepted-origin bundle ID is invalid");
  }
  for (const [digestValue, label] of [
    [artifact.predecessor.currentRefDigest, "current-ref"],
    [
      artifact.predecessor.acceptedOriginReplayDigest,
      "accepted-origin replay",
    ],
    [artifact.predecessor.acceptedStateDigest, "accepted state"],
    [artifact.predecessor.sidecarDigest, "sidecar"],
    [artifact.predecessor.replayClosureDigest, "replay closure"],
    [artifact.predecessor.sourceSnapshotDigest, "source snapshot"],
    [
      artifact.predecessor.sourceSemanticInputDigest,
      "source semantic input",
    ],
    [artifact.predecessor.projectionInputDigest, "projection input"],
    [artifact.predecessor.projectionDigest, "projection"],
  ] as const) {
    assertDigest(digestValue, `artifact predecessor ${label} digest`);
  }
  if (
    artifact.predecessor.inputDomainBinding
      !== "separate_authenticated_domains"
  ) {
    fail("artifact conflates source-semantic and projection input domains");
  }
  if (digestCanonical(artifact.predecessor) !== artifact.originDigest) {
    fail("artifact origin digest is not predecessor-derived");
  }

  const workById = new Map<string, TaskMapWorkControlWorkDecisionV1>();
  const globalTaskIds = new Set<string>();
  const globalRejectionReferenceIds = new Set<string>();
  const globalProjectionRowDigests = new Set<string>();
  let previousWorkId: string | undefined;
  for (const work of artifact.workDecisions) {
    assertRecordValue(work, "artifact work decision");
    assertExactKeys(
      work,
      [
        "workId",
        "lifecycleDecision",
        "rankEligible",
        "rootId",
        "projectionTaskRows",
        "projectionRejectionRows",
        "projectionTaskIds",
        "projectionRejectionReferenceIds",
        "projectionRowDigests",
      ],
      [],
      "artifact work decision",
    );
    assertHashedId(work.workId, HASHED_IDS.work, "artifact work ID");
    if (
      previousWorkId !== undefined
      && compareText(previousWorkId, work.workId) >= 0
    ) {
      fail("artifact work decisions are not strictly sorted");
    }
    previousWorkId = work.workId;
    if (!LIFECYCLE_DECISIONS.has(work.lifecycleDecision)) {
      fail("artifact work lifecycle decision is invalid");
    }
    if (
      typeof work.rankEligible !== "boolean"
      || work.rankEligible
        !== (work.lifecycleDecision === "accepted_open")
    ) {
      fail("artifact rank eligibility contradicts lifecycle");
    }
    if (
      work.rootId !== null
      && (
        typeof work.rootId !== "string"
        || !HASHED_IDS.projectionRoot.test(work.rootId)
      )
    ) {
      fail("artifact work root ID is invalid");
    }
    assertArrayValue(
      work.projectionTaskRows,
      "artifact work projection task rows",
    );
    let previousTaskPair = "";
    const pairedTaskIds: string[] = [];
    const pairedTaskDigests: string[] = [];
    for (const taskRow of work.projectionTaskRows) {
      assertRecordValue(taskRow, "artifact projection task row");
      assertExactKeys(
        taskRow,
        ["taskId", "projectionRowDigest"],
        [],
        "artifact projection task row",
      );
      assertHashedId(
        taskRow.taskId,
        HASHED_IDS.projectionTask,
        "artifact projection task ID",
      );
      assertDigest(
        taskRow.projectionRowDigest,
        "artifact projection task-row digest",
      );
      const pair = `${taskRow.taskId}\u0000${taskRow.projectionRowDigest}`;
      if (previousTaskPair !== "" && compareText(previousTaskPair, pair) >= 0) {
        fail("artifact projection task rows are not strictly sorted");
      }
      previousTaskPair = pair;
      if (
        globalTaskIds.has(taskRow.taskId)
      ) {
        fail("artifact projection task row is bound more than once");
      }
      globalTaskIds.add(taskRow.taskId);
      pairedTaskIds.push(taskRow.taskId);
      pairedTaskDigests.push(taskRow.projectionRowDigest);
    }
    assertArrayValue(
      work.projectionRejectionRows,
      "artifact work projection rejection rows",
    );
    let previousRejectionPair = "";
    const pairedRejectionReferenceIds: string[] = [];
    const pairedRejectionDigests: string[] = [];
    for (const rejectionRow of work.projectionRejectionRows) {
      assertRecordValue(
        rejectionRow,
        "artifact projection rejection row",
      );
      assertExactKeys(
        rejectionRow,
        ["projectionReferenceId", "projectionRowDigest"],
        [],
        "artifact projection rejection row",
      );
      assertHashedId(
        rejectionRow.projectionReferenceId,
        HASHED_IDS.projectionRef,
        "artifact projection rejection reference ID",
      );
      assertDigest(
        rejectionRow.projectionRowDigest,
        "artifact projection rejection-row digest",
      );
      const expectedReferenceId = `tmprojectionref_${
        digestCanonical({
          kind: "rejection",
          projectionRowDigest: rejectionRow.projectionRowDigest,
        })
      }`;
      if (
        rejectionRow.projectionReferenceId !== expectedReferenceId
      ) {
        fail(
          "artifact projection rejection reference ID is not row-derived",
        );
      }
      const pair =
        `${rejectionRow.projectionReferenceId}\u0000${
          rejectionRow.projectionRowDigest
        }`;
      if (
        previousRejectionPair !== ""
        && compareText(previousRejectionPair, pair) >= 0
      ) {
        fail("artifact projection rejection rows are not strictly sorted");
      }
      previousRejectionPair = pair;
      if (
        globalRejectionReferenceIds.has(
          rejectionRow.projectionReferenceId,
        )
      ) {
        fail("artifact projection rejection row is bound more than once");
      }
      globalRejectionReferenceIds.add(
        rejectionRow.projectionReferenceId,
      );
      pairedRejectionReferenceIds.push(
        rejectionRow.projectionReferenceId,
      );
      pairedRejectionDigests.push(rejectionRow.projectionRowDigest);
    }
    assertSortedUniqueStrings(
      work.projectionTaskIds,
      "artifact projection task IDs",
      HASHED_IDS.projectionTask,
    );
    assertSortedUniqueStrings(
      work.projectionRejectionReferenceIds,
      "artifact projection rejection reference IDs",
      HASHED_IDS.projectionRef,
    );
    assertSortedUniqueStrings(
      work.projectionRowDigests,
      "artifact projection row digests",
      SHA256,
    );
    for (const rowDigest of work.projectionRowDigests) {
      if (globalProjectionRowDigests.has(rowDigest)) {
        fail("artifact projection row digest is bound more than once");
      }
      globalProjectionRowDigests.add(rowDigest);
    }
    const pairedProjectionRowDigests = [
      ...pairedTaskDigests,
      ...pairedRejectionDigests,
    ].sort(compareText);
    if (
      canonicalJson(work.projectionTaskIds)
        !== canonicalJson(pairedTaskIds)
      || canonicalJson(work.projectionRejectionReferenceIds)
        !== canonicalJson(pairedRejectionReferenceIds)
      || canonicalJson(work.projectionRowDigests)
        !== canonicalJson(pairedProjectionRowDigests)
    ) {
      fail("artifact work projection row pairing is inconsistent");
    }
    if (
      work.lifecycleDecision === "rejected"
        ? (
          work.projectionTaskRows.length !== 0
          || work.projectionRejectionRows.length === 0
          || work.rootId !== null
        )
        : (
          work.projectionTaskRows.length === 0
          || work.projectionRejectionRows.length !== 0
          || work.rootId === null
        )
    ) {
      fail("artifact work lifecycle has inconsistent projection rows");
    }
    workById.set(work.workId, work);
  }
  if (
    globalTaskIds.size
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength
  ) {
    fail("artifact projection task row count exceeds the policy ceiling");
  }
  if (
    globalRejectionReferenceIds.size
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength
  ) {
    fail(
      "artifact projection rejection row count exceeds the policy ceiling",
    );
  }

  const dependencyPairs = new Set<string>();
  const dependencyByEdgeId =
    new Map<string, TaskMapWorkControlExecutionDependencyV1>();
  let previousDependencyKey = "";
  for (const dependency of artifact.executionDependencies) {
    assertRecordValue(dependency, "artifact execution dependency");
    assertExactKeys(
      dependency,
      ["prerequisiteWorkId", "dependentWorkId", "edgeId"],
      [],
      "artifact execution dependency",
    );
    assertHashedId(
      dependency.edgeId,
      HASHED_IDS.projectionEdge,
      "artifact execution dependency edge ID",
    );
    const prerequisite = workById.get(dependency.prerequisiteWorkId);
    const dependent = workById.get(dependency.dependentWorkId);
    if (
      prerequisite?.lifecycleDecision !== "accepted_open"
      || dependent?.lifecycleDecision !== "accepted_open"
      || dependency.prerequisiteWorkId === dependency.dependentWorkId
    ) {
      fail("artifact execution dependency has a terminal or invalid endpoint");
    }
    const pair =
      `${dependency.prerequisiteWorkId}\u0000${dependency.dependentWorkId}`;
    const orderKey = `${pair}\u0000${dependency.edgeId}`;
    if (
      dependencyPairs.has(pair)
      || dependencyByEdgeId.has(dependency.edgeId)
      || (
        previousDependencyKey !== ""
        && compareText(previousDependencyKey, orderKey) >= 0
      )
    ) {
      fail("artifact execution dependencies are duplicated or unsorted");
    }
    previousDependencyKey = orderKey;
    dependencyPairs.add(pair);
    dependencyByEdgeId.set(dependency.edgeId, dependency);
  }
  const openWorkIds = [...workById.values()]
    .filter((work) => work.lifecycleDecision === "accepted_open")
    .map((work) => work.workId)
    .sort(compareText);
  assertArtifactDependencyAcyclic(
    openWorkIds,
    artifact.executionDependencies,
  );

  const usedDependencyEdges = new Set<string>();
  const usedSupersedePairs = new Set<string>();
  let previousRelationEdgeId: string | undefined;
  for (const relation of artifact.relationDecisions) {
    assertRecordValue(relation, "artifact relation decision");
    assertHashedId(
      relation.edgeId,
      HASHED_IDS.projectionEdge,
      "artifact relation edge ID",
    );
    if (
      previousRelationEdgeId !== undefined
      && compareText(previousRelationEdgeId, relation.edgeId) >= 0
    ) {
      fail("artifact relation decisions are not strictly edge-ID sorted");
    }
    previousRelationEdgeId = relation.edgeId;
    if (!PROJECTION_RELATIONS.has(relation.relation)) {
      fail("artifact relation decision has an invalid relation");
    }
    if (relation.outcome === "execution_dependency") {
      assertExactKeys(
        relation,
        [
          "edgeId",
          "relation",
          "outcome",
          "prerequisiteWorkId",
          "dependentWorkId",
        ],
        [],
        "artifact execution relation decision",
      );
      if (
        relation.relation !== "depends_on"
        && relation.relation !== "blocks"
      ) {
        fail("artifact execution relation has a non-execution kind");
      }
      const dependency = dependencyByEdgeId.get(relation.edgeId);
      if (
        dependency === undefined
        || dependency.prerequisiteWorkId !== relation.prerequisiteWorkId
        || dependency.dependentWorkId !== relation.dependentWorkId
      ) {
        fail("artifact execution relation does not match its DAG edge");
      }
      usedDependencyEdges.add(relation.edgeId);
    } else if (relation.outcome === "lifecycle_only") {
      assertExactKeys(
        relation,
        [
          "edgeId",
          "relation",
          "outcome",
          "supersedingWorkId",
          "supersededWorkId",
        ],
        [],
        "artifact lifecycle-only relation decision",
      );
      if (
        relation.relation !== "supersedes"
        || relation.supersedingWorkId === relation.supersededWorkId
        || workById.get(relation.supersedingWorkId!)
          ?.lifecycleDecision !== "accepted_open"
        || workById.get(relation.supersededWorkId!)
          ?.lifecycleDecision !== "superseded"
      ) {
        fail("artifact lifecycle-only relation lacks P10.2 terminal authority");
      }
      const pair = `${relation.supersedingWorkId}\u0000${
        relation.supersededWorkId
      }`;
      if (usedSupersedePairs.has(pair)) {
        fail("artifact contains a duplicate normalized supersedes pair");
      }
      usedSupersedePairs.add(pair);
    } else if (relation.outcome === "ignored_non_control") {
      assertExactKeys(
        relation,
        ["edgeId", "relation", "outcome"],
        [],
        "artifact ignored relation decision",
      );
      if (CONTROL_RELATIONS.has(relation.relation as BrainRelation)) {
        fail("artifact ignored relation is control-bearing");
      }
    } else {
      fail("artifact relation decision has an invalid outcome");
    }
  }
  if (usedDependencyEdges.size !== dependencyByEdgeId.size) {
    fail("artifact relation decisions do not exactly cover the DAG edges");
  }

  const outgoingCount = new Map<string, number>();
  for (const dependency of artifact.executionDependencies) {
    outgoingCount.set(
      dependency.prerequisiteWorkId,
      (outgoingCount.get(dependency.prerequisiteWorkId) ?? 0) + 1,
    );
  }
  const rankedWorkIds = new Set<string>();
  let previousRankScore = Number.POSITIVE_INFINITY;
  let previousRankWorkId = "";
  for (
    let index = 0;
    index < artifact.rankedAcceptedOpen.length;
    index += 1
  ) {
    const row = artifact.rankedAcceptedOpen[index]!;
    assertRecordValue(row, "artifact rank decision");
    assertExactKeys(
      row,
      [
        "rank",
        "workId",
        "representativeProjectionTaskId",
        "representativeProjectionRowDigest",
        "scoreBasisPoints",
        "factorBasisPoints",
        "contributionBasisPoints",
        "reasonCodes",
        "aliasRankProofRows",
      ],
      [],
      "artifact rank decision",
    );
    const work = workById.get(row.workId);
    if (
      row.rank !== index + 1
      || rankedWorkIds.has(row.workId)
      || work?.lifecycleDecision !== "accepted_open"
    ) {
      fail("artifact ranks are not unique contiguous accepted-open rows");
    }
    rankedWorkIds.add(row.workId);
    const dependencyCount = Math.min(
      TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
      outgoingCount.get(row.workId) ?? 0,
    );
    const expectedDependencyImpact = Math.floor(
      (
        dependencyCount * 10_000
        + Math.floor(
          TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2,
        )
      ) / TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap,
    );
    assertArrayValue(
      row.aliasRankProofRows,
      "artifact alias rank proof rows",
    );
    if (row.aliasRankProofRows.length === 0) {
      fail("artifact accepted-open work has no alias rank proof row");
    }
    const proofPairs: string[] = [];
    let previousProof:
      TaskMapWorkControlAliasRankProofV1 | undefined;
    for (const proof of row.aliasRankProofRows) {
      assertRecordValue(proof, "artifact alias rank proof row");
      assertExactKeys(
        proof,
        [
          "taskId",
          "projectionRowDigest",
          "scoreBasisPoints",
          "factorBasisPoints",
          "contributionBasisPoints",
          "reasonCodes",
        ],
        [],
        "artifact alias rank proof row",
      );
      assertHashedId(
        proof.taskId,
        HASHED_IDS.projectionTask,
        "artifact alias rank proof task ID",
      );
      assertDigest(
        proof.projectionRowDigest,
        "artifact alias rank proof row digest",
      );
      if (
        previousProof !== undefined
        && compareAliasRankProof(previousProof, proof) >= 0
      ) {
        fail("artifact alias rank proof rows are not strictly sorted");
      }
      previousProof = proof;
      proofPairs.push(
        `${proof.taskId}\u0000${proof.projectionRowDigest}`,
      );
      assertAliasRankProofScore(
        proof,
        expectedDependencyImpact,
        "artifact alias rank proof",
      );
    }
    const expectedProofPairs = work.projectionTaskRows
      .map((taskRow) => (
        `${taskRow.taskId}\u0000${taskRow.projectionRowDigest}`
      ))
      .sort(compareText);
    proofPairs.sort(compareText);
    if (
      canonicalJson(proofPairs) !== canonicalJson(expectedProofPairs)
    ) {
      fail(
        "artifact alias rank proof rows do not exactly cover work task rows",
      );
    }
    const winner = row.aliasRankProofRows[0]!;
    if (
      row.representativeProjectionTaskId !== winner.taskId
      || row.representativeProjectionRowDigest
        !== winner.projectionRowDigest
      || row.scoreBasisPoints !== winner.scoreBasisPoints
      || canonicalJson(row.factorBasisPoints)
        !== canonicalJson(winner.factorBasisPoints)
      || canonicalJson(row.contributionBasisPoints)
        !== canonicalJson(winner.contributionBasisPoints)
      || canonicalJson(row.reasonCodes)
        !== canonicalJson(winner.reasonCodes)
    ) {
      fail("artifact rank fields do not equal the canonical alias winner");
    }
    if (
      row.scoreBasisPoints > previousRankScore
      || (
        row.scoreBasisPoints === previousRankScore
        && compareText(previousRankWorkId, row.workId) >= 0
      )
    ) {
      fail("artifact rank order violates the deterministic tie break");
    }
    previousRankScore = row.scoreBasisPoints;
    previousRankWorkId = row.workId;
  }
  const rankedExpected = new Set(openWorkIds);
  if (
    rankedExpected.size !== rankedWorkIds.size
    || [...rankedExpected].some((workId) => !rankedWorkIds.has(workId))
  ) {
    fail("artifact rank rows do not exactly cover accepted-open work");
  }
  const core = artifactCore({
    contractVersion: artifact.contractVersion,
    originDigest: artifact.originDigest,
    policyVersion: artifact.policyVersion,
    policyDigest: artifact.policyDigest,
    predecessor: artifact.predecessor,
    candidateCoverage: artifact.candidateCoverage,
    reviewNext: artifact.reviewNext,
    workDecisions: artifact.workDecisions,
    relationDecisions: artifact.relationDecisions,
    executionDependencies: artifact.executionDependencies,
    rankedAcceptedOpen: artifact.rankedAcceptedOpen,
    privacy: artifact.privacy,
  });
  const expectedDigest = digestCanonical(core);
  if (
    artifact.artifactDigest !== expectedDigest
    || artifact.artifactId !== `tmworkcontroldecision_${expectedDigest}`
  ) {
    fail("artifact ID/digest is not canonical-core-derived");
  }
  assertArtifactPrivacy(artifact);
  const canonicalBytes = canonicalJson(artifact);
  if (
    Buffer.byteLength(canonicalBytes, "utf8")
      > TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes
  ) {
    fail("artifact exceeds the canonical byte ceiling");
  }
  return deepFreeze(artifact);
}

export function taskMapWorkControlDecisionCanonicalBytes(
  value: TaskMapWorkControlDecisionV1,
): string {
  return canonicalJson(assertTaskMapWorkControlDecision(value));
}
