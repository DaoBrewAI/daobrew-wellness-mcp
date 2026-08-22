import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  readTaskMapIdentityDedupeProjectionStore,
  type TaskMapAdjudicatedLifecycleDelta,
  type TaskMapAdjudicatedLifecycleState,
  type TaskMapAdjudicatedPreviousLifecycleState,
  type TaskMapIdentityDedupeLifecycleDeltaV1,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapIdentityDedupeStoreRoots,
  type TaskMapIdentityDedupeStoreSnapshotV1,
} from "./identity-dedupe-projection.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  assertTaskMapWorkControlDecision,
  buildTaskMapWorkControlDecision,
  type TaskMapWorkControlDecisionV1,
  type TaskMapWorkControlLifecycleDecision,
} from "./work-control-decision.js";
import type {
  TaskMapProjectionV1,
  TaskMapTask,
} from "./types.js";

export const TASKMAP_LIFECYCLE_FACETS_VERSION =
  "taskmap-lifecycle-facets.v1" as const;
export const TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION =
  "taskmap-lifecycle-facets-policy.1" as const;

export const TASKMAP_LIFECYCLE_FACETS_LIMITS_V1 = Object.freeze({
  maxCanonicalInputBytes: 16 * 1024 * 1024,
  maxCanonicalArtifactBytes: 4 * 1024 * 1024,
  maxNodes: 100_000,
  maxDescriptors: 100_000,
  maxDepth: 32,
  maxObjectKeys: 128,
  maxArrayLength: 8_192,
  maxStringLength: 4_096,
  maxWorks: 2_048,
  maxProjectionTasks: 8_192,
});

export type TaskMapLifecycleFacet =
  | "accepted_open"
  | "source_complete"
  | "superseded"
  | "rejected";

export type TaskMapLifecycleFacetChange =
  | "new"
  | "updated"
  | "resolved"
  | "superseded"
  | "rejected"
  | "unchanged";

export const TASKMAP_LIFECYCLE_FACETS_POLICY_V1 = Object.freeze({
  contractVersion: TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION,
  lifecycleAuthority: "authenticated_p10_2_lifecycle_delta",
  acceptedWorkAuthority: "store_backed_p10_3a_work_control",
  projectionAuthority: "exact_p10_2_replay_projection",
  changeMapping: Object.freeze({
    open: "new",
    updated: "updated",
    resolved: "resolved",
    superseded: "superseded",
    rejected: "rejected",
    no_op: "unchanged",
  }),
  newRule: "absent_to_open_with_open_delta_only",
  changedSinceLastRefreshRule: "adjudicated_delta_is_not_no_op",
  rankEligibilityRule: "accepted_open_only",
  candidateAuthority: "none",
  executionAuthority: "none",
});

export interface TaskMapLifecycleFacetsPredecessorV1 {
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
  diffId: string;
  diffDigest: string;
  replayClosureDigest: string;
  sourceSnapshotDigest: string;
  sourceSemanticInputDigest: string;
  workControlArtifactId: string;
  workControlArtifactDigest: string;
  workControlOriginDigest: string;
  projectionRunId: string;
  projectionInputDigest: string;
  projectionDigest: string;
}

export interface TaskMapLifecycleFacetDeltaV1 {
  deltaId: string;
  previousState: TaskMapAdjudicatedPreviousLifecycleState;
  currentState: TaskMapAdjudicatedLifecycleState;
  adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
  adjudicationDigest: string;
  lifecycleEventId: string;
}

export interface TaskMapLifecycleFacetRowV1 {
  workId: string;
  rootId: string | null;
  projectionTaskIds: string[];
  lifecycle: TaskMapLifecycleFacet;
  change: TaskMapLifecycleFacetChange;
  changedSinceLastRefresh: boolean;
  newlyAcceptedOpen: boolean;
  rankEligible: boolean;
  lifecycleDelta: TaskMapLifecycleFacetDeltaV1;
}

export interface TaskMapLifecycleFacetsPrivacyV1 {
  sourceBodiesStored: false;
  candidateTokensStored: false;
  candidateTextStored: false;
  routeDataStored: false;
  rawOwnerIdentifiersStored: false;
  rawSourceObjectIdentifiersStored: false;
  rawSourceRevisionsStored: false;
  rawBiometricsStored: false;
  localPathsStored: false;
  connectorSecretsStored: false;
  executionStateStored: false;
}

export interface TaskMapLifecycleFacetsV1 {
  contractVersion: typeof TASKMAP_LIFECYCLE_FACETS_VERSION;
  artifactId: string;
  artifactDigest: string;
  originDigest: string;
  policyVersion: typeof TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION;
  policyDigest: string;
  predecessor: TaskMapLifecycleFacetsPredecessorV1;
  rows: TaskMapLifecycleFacetRowV1[];
  privacy: TaskMapLifecycleFacetsPrivacyV1;
}

export interface BuiltTaskMapLifecycleFacets {
  artifact: TaskMapLifecycleFacetsV1;
  canonicalBytes: string;
}

export interface BuildTaskMapLifecycleFacetsInput
  extends TaskMapIdentityDedupeStoreRoots {
  projection: TaskMapProjectionV1;
}

/**
 * TEST-ONLY. The two P10.2 snapshots and P10.3a artifact must already have
 * been authenticated by their owning contracts. This input is deliberately
 * not a product authority boundary.
 */
export interface UnsafeBuildTaskMapLifecycleFacetsInputForTest {
  firstStore: TaskMapIdentityDedupeStoreSnapshotV1;
  secondStore: TaskMapIdentityDedupeStoreSnapshotV1;
  projection: TaskMapProjectionV1;
  workControl: TaskMapWorkControlDecisionV1;
}

type JsonPreflightState = {
  nodes: number;
  descriptors: number;
  bytes: number;
  byteLimit: number;
  seen: WeakSet<object>;
};

const SHA256 = /^[a-f0-9]{64}$/;
const FIXED_GENERATION = /^[0-9]{20}$/;
const HASHED_IDS = Object.freeze({
  artifact: /^tmlifecyclefacets_[a-f0-9]{64}$/,
  work: /^tmwork_[a-f0-9]{64}$/,
  root: /^tmr_[a-f0-9]{16}$/,
  task: /^tm[ct]_[a-f0-9]{16}$/,
  delta: /^tmlifecycledelta_[a-f0-9]{64}$/,
  lifecycleEvent: /^tmlifecycleevent_[a-f0-9]{64}$/,
  currentRef: /^tmrefreshcurrent_[a-f0-9]{64}$/,
  entry: /^tmidentityentry_[a-f0-9]{64}$/,
  sidecar: /^tmidentityprojection_[a-f0-9]{64}$/,
  diff: /^tmidentitydiff_[a-f0-9]{64}$/,
  bundle: /^tmrefreshrun_[a-f0-9]{64}$/,
  workControl: /^tmworkcontroldecision_[a-f0-9]{64}$/,
  projectionRun: /^tmrun_[a-f0-9]{16}$/,
});

const PRIVACY: TaskMapLifecycleFacetsPrivacyV1 = Object.freeze({
  sourceBodiesStored: false,
  candidateTokensStored: false,
  candidateTextStored: false,
  routeDataStored: false,
  rawOwnerIdentifiersStored: false,
  rawSourceObjectIdentifiersStored: false,
  rawSourceRevisionsStored: false,
  rawBiometricsStored: false,
  localPathsStored: false,
  connectorSecretsStored: false,
  executionStateStored: false,
});

const READ_P10_2_STORE = readTaskMapIdentityDedupeProjectionStore;
const BUILD_P10_3A_WORK_CONTROL = buildTaskMapWorkControlDecision;
const ASSERT_P10_3A_WORK_CONTROL = assertTaskMapWorkControlDecision;
const DIFF_PROJECTIONS = diffTaskMapProjections;
const TASKMAP_CONTRACT_DIGEST = taskMapContractDigest;
const CREATE_HASH = createHash;
const IS_PROXY = nodeUtilTypes.isProxy;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_KEYS = Object.keys;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_FREEZE = Object.freeze;
const ARRAY_IS_ARRAY = Array.isArray;
const MAP_CONSTRUCTOR = Map;
const SET_CONSTRUCTOR = Set;
const WEAK_SET_CONSTRUCTOR = WeakSet;
const STRUCTURED_CLONE = structuredClone;
const JSON_STRINGIFY = JSON.stringify;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_FINITE = Number.isFinite;
const BIGINT_CONSTRUCTOR = BigInt;
const REFLECT_APPLY = Reflect.apply;

const HASH_PROTOTYPE = GET_PROTOTYPE_OF(CREATE_HASH("sha256"));
const HASH_PROTOTYPE_DESCRIPTORS = snapshotPrototype(HASH_PROTOTYPE);
const HASH_UPDATE = GET_OWN_PROPERTY_DESCRIPTOR(
  HASH_PROTOTYPE,
  "update",
)?.value as (value: string) => unknown;
const HASH_DIGEST = GET_OWN_PROPERTY_DESCRIPTOR(
  HASH_PROTOTYPE,
  "digest",
)?.value as (encoding: "hex") => string;

const ARRAY_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Array.prototype);
const OBJECT_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Object.prototype);
const MAP_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Map.prototype);
const SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Set.prototype);
const WEAK_SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(WeakSet.prototype);

const POLICY_DIGEST = digestCanonical(TASKMAP_LIFECYCLE_FACETS_POLICY_V1);

function fail(message: string): never {
  throw new Error(`P11.1b lifecycle facets: ${message}`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotPrototype(prototype: object): ReadonlyArray<{
  key: string | symbol;
  descriptor: PropertyDescriptor;
}> {
  const keys = REFLECT_OWN_KEYS(prototype);
  const rows: Array<{
    key: string | symbol;
    descriptor: PropertyDescriptor;
  }> = [];
  for (const key of keys) {
    rows.push({
      key,
      descriptor: {
        ...GET_OWN_PROPERTY_DESCRIPTOR(prototype, key)!,
      },
    });
  }
  return OBJECT_FREEZE(rows);
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
    const expectedRow = expected[index]!;
    if (
      keys[index] !== expectedRow.key
      || !sameDescriptor(
        GET_OWN_PROPERTY_DESCRIPTOR(prototype, expectedRow.key),
        expectedRow.descriptor,
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
    Map.prototype,
    MAP_PROTOTYPE_DESCRIPTORS,
    "Map",
  );
  assertPrototypeIntegrity(
    Set.prototype,
    SET_PROTOTYPE_DESCRIPTORS,
    "Set",
  );
  assertPrototypeIntegrity(
    WeakSet.prototype,
    WEAK_SET_PROTOTYPE_DESCRIPTORS,
    "WeakSet",
  );
  assertPrototypeIntegrity(
    HASH_PROTOTYPE,
    HASH_PROTOTYPE_DESCRIPTORS,
    "Hash",
  );
  if (
    readTaskMapIdentityDedupeProjectionStore !== READ_P10_2_STORE
    || buildTaskMapWorkControlDecision !== BUILD_P10_3A_WORK_CONTROL
    || assertTaskMapWorkControlDecision !== ASSERT_P10_3A_WORK_CONTROL
    || diffTaskMapProjections !== DIFF_PROJECTIONS
    || taskMapContractDigest !== TASKMAP_CONTRACT_DIGEST
    || createHash !== CREATE_HASH
    || Number !== NUMBER_CONSTRUCTOR
    || Number.isFinite !== NUMBER_IS_FINITE
    || BigInt !== BIGINT_CONSTRUCTOR
    || Map !== MAP_CONSTRUCTOR
    || Set !== SET_CONSTRUCTOR
    || WeakSet !== WEAK_SET_CONSTRUCTOR
  ) {
    fail("captured P10 dependency callable changed during validation");
  }
}

function countNode(state: JsonPreflightState, label: string): void {
  state.nodes += 1;
  if (state.nodes > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxNodes) {
    fail(`${label} exceeds the pre-clone node ceiling`);
  }
}

function countDescriptor(state: JsonPreflightState, label: string): void {
  state.descriptors += 1;
  if (
    state.descriptors
      > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxDescriptors
  ) {
    fail(`${label} exceeds the pre-clone descriptor ceiling`);
  }
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

function chargeOwnDescriptor(
  state: JsonPreflightState,
  key: string,
  label: string,
): void {
  countDescriptor(state, label);
  if (key.length > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxStringLength) {
    fail(`${label} contains an oversized object key`);
  }
  addPrecloneBytes(
    state,
    BUFFER_BYTE_LENGTH(JSON_STRINGIFY(key), "utf8") + 1,
    label,
  );
}

function preflightJson(
  value: unknown,
  label: string,
  state: JsonPreflightState,
  depth = 0,
): void {
  if (depth > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxDepth) {
    fail(`${label} exceeds the pre-clone depth ceiling`);
  }
  countNode(state, label);
  if (value === null) {
    addPrecloneBytes(state, 4, label);
    return;
  }
  if (typeof value === "string") {
    if (value.length > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxStringLength) {
      fail(`${label} exceeds the string ceiling`);
    }
    addPrecloneBytes(
      state,
      BUFFER_BYTE_LENGTH(JSON_STRINGIFY(value), "utf8"),
      label,
    );
    return;
  }
  if (typeof value === "number") {
    if (!NUMBER_IS_FINITE(value)) {
      fail(`${label} contains a non-finite number`);
    }
    addPrecloneBytes(
      state,
      BUFFER_BYTE_LENGTH(JSON_STRINGIFY(value), "utf8"),
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
  if (IS_PROXY(value)) {
    fail(`${label} contains a proxy`);
  }
  if (state.seen.has(value)) {
    fail(`${label} contains a cycle or alias`);
  }
  state.seen.add(value);
  const prototype = GET_PROTOTYPE_OF(value);
  const keys = REFLECT_OWN_KEYS(value);
  if (ARRAY_IS_ARRAY(value)) {
    if (prototype !== Array.prototype) {
      fail(`${label} array must use the intrinsic Array prototype`);
    }
    if (value.length > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxArrayLength) {
      fail(`${label} exceeds the array ceiling`);
    }
    if (keys.length !== value.length + 1 || !keys.includes("length")) {
      fail(`${label} array contains holes or named fields`);
    }
    addPrecloneBytes(state, 2 + Math.max(0, value.length - 1), label);
    for (const key of keys) {
      if (typeof key !== "string") {
        fail(`${label} contains a symbol key`);
      }
      chargeOwnDescriptor(state, key, label);
      if (
        key !== "length"
        && (
          !/^(0|[1-9]\d*)$/.test(key)
          || NUMBER_CONSTRUCTOR(key) >= value.length
        )
      ) {
        fail(`${label} array contains holes or named fields`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || descriptor.enumerable !== true
        || descriptor.value === undefined
      ) {
        fail(`${label} array must contain enumerable defined data elements`);
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
  if (keys.length > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxObjectKeys) {
    fail(`${label} exceeds the object-key ceiling`);
  }
  addPrecloneBytes(state, 2 + Math.max(0, keys.length - 1), label);
  for (const key of keys) {
    if (typeof key !== "string") {
      fail(`${label} contains a symbol key`);
    }
    chargeOwnDescriptor(state, key, label);
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.enumerable !== true
      || descriptor.value === undefined
    ) {
      fail(`${label} must contain enumerable defined JSON data properties`);
    }
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
  byteLimit = TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxCanonicalInputBytes,
): T {
  assertRuntimeIntegrity();
  preflightJson(value, label, {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit,
    seen: new WEAK_SET_CONSTRUCTOR<object>(),
  });
  let snapshot: T;
  try {
    snapshot = STRUCTURED_CLONE(value);
  } catch {
    fail(`${label} must be independently cloneable`);
  }
  const canonicalBytes = canonicalJson(snapshot);
  if (BUFFER_BYTE_LENGTH(canonicalBytes, "utf8") > byteLimit) {
    fail(`${label} exceeds the canonical byte ceiling`);
  }
  assertRuntimeIntegrity();
  return snapshot;
}

function canonicalJson(value: unknown): string {
  if (ARRAY_IS_ARRAY(value)) {
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      items.push(canonicalJson(value[index]));
    }
    return `[${items.join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = OBJECT_KEYS(value as Record<string, unknown>)
      .sort(compareText);
    const items: string[] = [];
    for (const key of keys) {
      items.push(
        `${JSON_STRINGIFY(key)}:${
          canonicalJson((value as Record<string, unknown>)[key])
        }`,
      );
    }
    return `{${items.join(",")}}`;
  }
  return JSON_STRINGIFY(value) ?? "null";
}

function digestCanonical(value: unknown): string {
  const hash = CREATE_HASH("sha256");
  if (GET_PROTOTYPE_OF(hash) !== HASH_PROTOTYPE) {
    fail("Hash instance prototype changed during canonical digest");
  }
  REFLECT_APPLY(HASH_UPDATE, hash, [canonicalJson(value)]);
  return REFLECT_APPLY(HASH_DIGEST, hash, ["hex"]);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !OBJECT_IS_FROZEN(value)) {
    for (const key of OBJECT_KEYS(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    OBJECT_FREEZE(value);
  }
  return value;
}

function assertExactKeys(
  value: object,
  required: readonly string[],
  label: string,
): void {
  const keys = OBJECT_KEYS(value).sort(compareText);
  const expected = [...required].sort(compareText);
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has invalid fields`);
  }
}

function assertDigest(
  value: unknown,
  label: string,
): asserts value is string {
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
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  if (!ARRAY_IS_ARRAY(store.entries) || store.entries.length === 0) {
    fail(`${label} has no authenticated P10.2 predecessor`);
  }
  const latest = store.entries[store.entries.length - 1]!;
  if (latest.entryKind !== "projection") {
    fail(`${label} latest P10.2 entry is not a projection`);
  }
  return latest;
}

function assertSameAuthenticatedHead(
  firstStore: TaskMapIdentityDedupeStoreSnapshotV1,
  secondStore: TaskMapIdentityDedupeStoreSnapshotV1,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  const firstEntry = latestProjectionEntry(firstStore, "first store");
  const secondEntry = latestProjectionEntry(secondStore, "second store");
  if (
    firstStore.entries.length !== secondStore.entries.length
    || firstEntry.generation !== secondEntry.generation
    || firstEntry.currentRefId !== secondEntry.currentRefId
    || firstEntry.currentRefDigest !== secondEntry.currentRefDigest
    || firstEntry.entryId !== secondEntry.entryId
    || firstEntry.sidecarId !== secondEntry.sidecarId
    || firstEntry.sidecarDigest !== secondEntry.sidecarDigest
    || firstEntry.diffId !== secondEntry.diffId
    || firstEntry.diffDigest !== secondEntry.diffDigest
    || firstEntry.replayClosureDigest !== secondEntry.replayClosureDigest
    || digestCanonical(firstEntry) !== digestCanonical(secondEntry)
  ) {
    fail("authenticated P10.2 head advanced during lifecycle-facet build");
  }
  return firstEntry;
}

function lifecycleFromP10_2(
  value: TaskMapAdjudicatedLifecycleState,
): TaskMapLifecycleFacet {
  if (value === "open") return "accepted_open";
  if (value === "resolved") return "source_complete";
  return value;
}

function expectedChange(
  delta: TaskMapIdentityDedupeLifecycleDeltaV1,
): TaskMapLifecycleFacetChange {
  if (
    delta.adjudicatedDelta === "open"
    && delta.previousState === "absent"
    && delta.currentState === "open"
  ) {
    return "new";
  }
  if (delta.adjudicatedDelta === "updated") return "updated";
  if (delta.adjudicatedDelta === "resolved") return "resolved";
  if (delta.adjudicatedDelta === "superseded") return "superseded";
  if (delta.adjudicatedDelta === "rejected") return "rejected";
  return "unchanged";
}

function assertLifecycleTruth(
  previousState: TaskMapAdjudicatedPreviousLifecycleState,
  currentState: TaskMapAdjudicatedLifecycleState,
  adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta,
  label: string,
): void {
  const valid =
    (
      adjudicatedDelta === "open"
      && previousState === "absent"
      && currentState === "open"
    )
    || (
      adjudicatedDelta === "updated"
      && previousState !== "absent"
      && previousState === currentState
    )
    || (
      adjudicatedDelta === "resolved"
      && previousState === "open"
      && currentState === "resolved"
    )
    || (
      adjudicatedDelta === "superseded"
      && (previousState === "open" || previousState === "resolved")
      && currentState === "superseded"
    )
    || (
      adjudicatedDelta === "rejected"
      && (previousState === "absent" || previousState === "open")
      && currentState === "rejected"
    )
    || (
      adjudicatedDelta === "no_op"
      && previousState !== "absent"
      && previousState === currentState
    );
  if (!valid) {
    fail(`${label} violates the closed P10.2 lifecycle truth table`);
  }
  if (
    previousState !== "absent"
    && ["resolved", "superseded", "rejected"].includes(previousState)
    && currentState === "open"
  ) {
    fail(`${label} attempts to reopen terminal work`);
  }
}

function assertWorkControlPredecessor(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  projection: TaskMapProjectionV1,
  workControl: TaskMapWorkControlDecisionV1,
): void {
  const predecessor = workControl.predecessor;
  const projectionDigest =
    DIFF_PROJECTIONS(null, projection).currentProjectionDigest;
  if (
    predecessor.ownerScopeDigest !== entry.ownerScopeDigest
    || predecessor.generation !== entry.generation
    || predecessor.currentRefId !== entry.currentRefId
    || predecessor.currentRefDigest !== entry.currentRefDigest
    || predecessor.entryId !== entry.entryId
    || predecessor.acceptedOriginBundleId !== entry.acceptedOriginBundleId
    || predecessor.acceptedOriginReplayDigest
      !== entry.acceptedOriginReplayDigest
    || predecessor.acceptedStateDigest
      !== entry.sidecar.origin.acceptedStateDigest
    || predecessor.sidecarId !== entry.sidecarId
    || predecessor.sidecarDigest !== entry.sidecarDigest
    || predecessor.replayClosureDigest !== entry.replayClosureDigest
    || predecessor.sourceSnapshotDigest
      !== entry.sidecar.sourceSnapshotDigest
    || predecessor.sourceSemanticInputDigest
      !== entry.sidecar.replayClosure.sourceSemanticInputDigest
    || predecessor.projectionRunId !== projection.runId
    || predecessor.projectionInputDigest !== projection.inputDigest
    || predecessor.projectionDigest !== projectionDigest
    || projectionDigest !== entry.sidecar.projectionDigest
    || projectionDigest !== entry.sidecar.replayClosure.projectionDigest
    || predecessor.projectionRunId !== entry.sidecar.projectionRunId
    || predecessor.projectionInputDigest
      !== entry.sidecar.replayClosure.projectionInputDigest
  ) {
    fail("P10.3a predecessor does not match the exact P10.2/projection head");
  }
}

function projectionTaskIndex(
  projection: TaskMapProjectionV1,
): Map<string, TaskMapTask> {
  if (
    projection.tasks.length
      > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks
  ) {
    fail("projection task count exceeds the lifecycle-facet ceiling");
  }
  const roots = new MAP_CONSTRUCTOR<string, Set<string>>();
  for (const root of projection.roots) {
    assertHashedId(root.id, HASHED_IDS.root, "projection root ID");
    if (roots.has(root.id)) fail("projection root IDs are not unique");
    const taskIds = new SET_CONSTRUCTOR<string>();
    for (const taskId of root.taskIds) {
      assertHashedId(taskId, HASHED_IDS.task, "root task ID");
      if (taskIds.has(taskId)) {
        fail("a root repeats a projection task ID");
      }
      taskIds.add(taskId);
    }
    roots.set(root.id, taskIds);
  }
  const tasks = new MAP_CONSTRUCTOR<string, TaskMapTask>();
  for (const task of projection.tasks) {
    assertHashedId(task.id, HASHED_IDS.task, "projection task ID");
    assertHashedId(task.rootId, HASHED_IDS.root, "task root ID");
    if (tasks.has(task.id)) fail("projection task IDs are not unique");
    const rootTasks = roots.get(task.rootId);
    if (rootTasks === undefined || !rootTasks.has(task.id)) {
      fail("projection task/root binding is inconsistent");
    }
    if (task.reviewState === "proposed") {
      fail("candidate/proposed tasks cannot enter accepted lifecycle facets");
    }
    tasks.set(task.id, task);
  }
  const rootTaskIds = new SET_CONSTRUCTOR<string>();
  for (const taskIds of roots.values()) {
    for (const taskId of taskIds) {
      if (rootTaskIds.has(taskId) || !tasks.has(taskId)) {
        fail("root task coverage is duplicate or references an absent task");
      }
      rootTaskIds.add(taskId);
    }
  }
  if (rootTaskIds.size !== tasks.size) {
    fail("projection roots do not exactly cover projection tasks");
  }
  return tasks;
}

function predecessorFrom(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  workControl: TaskMapWorkControlDecisionV1,
): TaskMapLifecycleFacetsPredecessorV1 {
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
    diffId: entry.diffId,
    diffDigest: entry.diffDigest,
    replayClosureDigest: entry.replayClosureDigest,
    sourceSnapshotDigest: entry.sidecar.sourceSnapshotDigest,
    sourceSemanticInputDigest:
      entry.sidecar.replayClosure.sourceSemanticInputDigest,
    workControlArtifactId: workControl.artifactId,
    workControlArtifactDigest: workControl.artifactDigest,
    workControlOriginDigest: workControl.originDigest,
    projectionRunId: workControl.predecessor.projectionRunId,
    projectionInputDigest: workControl.predecessor.projectionInputDigest,
    projectionDigest: workControl.predecessor.projectionDigest,
  };
}

function buildRows(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  projection: TaskMapProjectionV1,
  workControl: TaskMapWorkControlDecisionV1,
): TaskMapLifecycleFacetRowV1[] {
  const projectionTasks = projectionTaskIndex(projection);
  const taskIdByRowDigest = new MAP_CONSTRUCTOR<string, string>();
  for (const task of projectionTasks.values()) {
    const rowDigest = TASKMAP_CONTRACT_DIGEST(task);
    if (taskIdByRowDigest.has(rowDigest)) {
      fail("projection contains duplicate task-row digests");
    }
    taskIdByRowDigest.set(rowDigest, task.id);
  }
  const rejectionByRowDigest = new MAP_CONSTRUCTOR<
    string,
    TaskMapProjectionV1["rejections"][number]
  >();
  for (const rejection of projection.rejections) {
    if (rejection.kind !== "task") continue;
    const rowDigest = TASKMAP_CONTRACT_DIGEST(rejection);
    if (rejectionByRowDigest.has(rowDigest)) {
      fail("projection contains duplicate task-rejection row digests");
    }
    rejectionByRowDigest.set(rowDigest, rejection);
  }
  const workById = new MAP_CONSTRUCTOR(entry.sidecar.works.map((work) => [
    work.workId,
    work,
  ]));
  const deltasByWorkId = new MAP_CONSTRUCTOR<
    string,
    TaskMapIdentityDedupeLifecycleDeltaV1
  >();
  for (const delta of entry.sidecar.lifecycleDeltas) {
    if (deltasByWorkId.has(delta.workId)) {
      fail("P10.2 contains duplicate lifecycle deltas for one work");
    }
    deltasByWorkId.set(delta.workId, delta);
  }
  if (
    workControl.workDecisions.length
      > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxWorks
  ) {
    fail("work count exceeds the lifecycle-facet ceiling");
  }
  const usedTaskIds = new SET_CONSTRUCTOR<string>();
  const rows: TaskMapLifecycleFacetRowV1[] = [];
  for (const decision of workControl.workDecisions) {
    const work = workById.get(decision.workId);
    const delta = deltasByWorkId.get(decision.workId);
    if (work === undefined || delta === undefined) {
      fail("each P10.3a work must join exactly one P10.2 lifecycle delta");
    }
    const expectedTaskRows: TaskMapWorkControlDecisionV1[
      "workDecisions"
    ][number]["projectionTaskRows"] = [];
    const expectedRejectionRows: TaskMapWorkControlDecisionV1[
      "workDecisions"
    ][number]["projectionRejectionRows"] = [];
    for (const reference of work.projectionReferences) {
      if (reference.kind === "task") {
        const taskId = taskIdByRowDigest.get(reference.projectionRowDigest);
        if (taskId === undefined) {
          fail("P10.2 task reference is absent from the exact projection");
        }
        expectedTaskRows.push({
          taskId,
          projectionRowDigest: reference.projectionRowDigest,
        });
      } else {
        if (!rejectionByRowDigest.has(reference.projectionRowDigest)) {
          fail("P10.2 rejection reference is absent from the exact projection");
        }
        expectedRejectionRows.push({
          projectionReferenceId: reference.id,
          projectionRowDigest: reference.projectionRowDigest,
        });
      }
    }
    expectedTaskRows.sort((left, right) => (
      compareText(left.taskId, right.taskId)
      || compareText(left.projectionRowDigest, right.projectionRowDigest)
    ));
    expectedRejectionRows.sort((left, right) => (
      compareText(
        left.projectionReferenceId,
        right.projectionReferenceId,
      )
      || compareText(left.projectionRowDigest, right.projectionRowDigest)
    ));
    const expectedTaskIds =
      expectedTaskRows.map((row) => row.taskId).sort(compareText);
    const expectedRejectionIds = expectedRejectionRows
      .map((row) => row.projectionReferenceId)
      .sort(compareText);
    const expectedRowDigests = work.projectionReferences
      .map((reference) => reference.projectionRowDigest)
      .sort(compareText);
    if (
      canonicalJson(decision.projectionTaskRows)
        !== canonicalJson(expectedTaskRows)
      || canonicalJson(decision.projectionRejectionRows)
        !== canonicalJson(expectedRejectionRows)
      || canonicalJson(decision.projectionTaskIds)
        !== canonicalJson(expectedTaskIds)
      || canonicalJson(decision.projectionRejectionReferenceIds)
        !== canonicalJson(expectedRejectionIds)
      || canonicalJson(decision.projectionRowDigests)
        !== canonicalJson(expectedRowDigests)
    ) {
      fail(
        "P10.3a projection rows/digests diverge from P10.2 references",
      );
    }
    const lifecycle = lifecycleFromP10_2(work.lifecycleState);
    if (
      lifecycle !== decision.lifecycleDecision
      || delta.currentState !== work.lifecycleState
      || delta.workId !== work.workId
      || delta.lifecycleEventId !== work.lifecycleEventId
    ) {
      fail("P10.2 lifecycle and P10.3a work decision diverge");
    }
    assertLifecycleTruth(
      delta.previousState,
      delta.currentState,
      delta.adjudicatedDelta,
      `work ${decision.workId}`,
    );
    const taskIds = [...decision.projectionTaskIds].sort(compareText);
    if (
      taskIds.length !== decision.projectionTaskIds.length
      || taskIds.some((taskId, index) => (
        taskId !== decision.projectionTaskIds[index]
      ))
    ) {
      fail("P10.3a projection task IDs are not canonical");
    }
    if (lifecycle === "rejected") {
      if (decision.rootId !== null || taskIds.length !== 0) {
        fail("rejected work cannot retain accepted projection task IDs");
      }
    } else {
      if (decision.rootId === null || taskIds.length === 0) {
        fail("accepted work must retain its projection root and tasks");
      }
      for (const taskId of taskIds) {
        const task = projectionTasks.get(taskId);
        if (
          task === undefined
          || task.rootId !== decision.rootId
          || usedTaskIds.has(taskId)
        ) {
          fail("task/root binding is absent, duplicated, or contradictory");
        }
        usedTaskIds.add(taskId);
      }
    }
    if (decision.rankEligible !== (lifecycle === "accepted_open")) {
      fail("P10.3a rank eligibility diverges from lifecycle authority");
    }
    const change = expectedChange(delta);
    rows.push({
      workId: decision.workId,
      rootId: decision.rootId,
      projectionTaskIds: taskIds,
      lifecycle,
      change,
      changedSinceLastRefresh: delta.adjudicatedDelta !== "no_op",
      newlyAcceptedOpen: change === "new",
      rankEligible: lifecycle === "accepted_open",
      lifecycleDelta: {
        deltaId: delta.deltaId,
        previousState: delta.previousState,
        currentState: delta.currentState,
        adjudicatedDelta: delta.adjudicatedDelta,
        adjudicationDigest: delta.adjudicationDigest,
        lifecycleEventId: delta.lifecycleEventId,
      },
    });
  }
  if (
    workById.size !== rows.length
    || deltasByWorkId.size !== rows.length
  ) {
    fail("P10.2 work/delta coverage does not match P10.3a work coverage");
  }
  if (usedTaskIds.size !== projectionTasks.size) {
    fail("lifecycle facets do not exactly cover projection tasks");
  }
  return rows.sort((left, right) => compareText(left.workId, right.workId));
}

function artifactCore(
  artifact: Omit<TaskMapLifecycleFacetsV1, "artifactId" | "artifactDigest">,
): Omit<TaskMapLifecycleFacetsV1, "artifactId" | "artifactDigest"> {
  return artifact;
}

function buildFromAuthenticatedInputs(
  firstStore: TaskMapIdentityDedupeStoreSnapshotV1,
  secondStore: TaskMapIdentityDedupeStoreSnapshotV1,
  projectionInput: TaskMapProjectionV1,
  workControlInput: TaskMapWorkControlDecisionV1,
): BuiltTaskMapLifecycleFacets {
  assertRuntimeIntegrity();
  const projection = snapshotJson(
    projectionInput,
    "lifecycle-facet projection",
  );
  const workControl = ASSERT_P10_3A_WORK_CONTROL(workControlInput);
  const entry = assertSameAuthenticatedHead(firstStore, secondStore);
  assertWorkControlPredecessor(entry, projection, workControl);
  const predecessor = predecessorFrom(entry, workControl);
  const rows = buildRows(entry, projection, workControl);
  const originDigest = digestCanonical(predecessor);
  const core = artifactCore({
    contractVersion: TASKMAP_LIFECYCLE_FACETS_VERSION,
    originDigest,
    policyVersion: TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION,
    policyDigest: POLICY_DIGEST,
    predecessor,
    rows,
    privacy: { ...PRIVACY },
  });
  const artifactDigest = digestCanonical(core);
  const artifact: TaskMapLifecycleFacetsV1 = {
    ...core,
    artifactId: `tmlifecyclefacets_${artifactDigest}`,
    artifactDigest,
  };
  return {
    artifact: assertTaskMapLifecycleFacets(artifact),
    canonicalBytes: taskMapLifecycleFacetsCanonicalBytes(artifact),
  };
}

/**
 * Product path. Input is snapshotted before the first await. The P10.2 head
 * must be identical before and after the real store-backed P10.3a build.
 */
export async function buildTaskMapLifecycleFacets(
  input: BuildTaskMapLifecycleFacetsInput,
): Promise<BuiltTaskMapLifecycleFacets> {
  const snapshot = snapshotJson(input, "lifecycle-facet build input");
  assertExactKeys(
    snapshot,
    ["currentRoot", "runRoot", "sidecarRoot", "projection"],
    "lifecycle-facet build input",
  );
  const roots: TaskMapIdentityDedupeStoreRoots = {
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
  };
  const firstStore = await READ_P10_2_STORE(roots);
  assertRuntimeIntegrity();
  const workControl = await BUILD_P10_3A_WORK_CONTROL({
    ...roots,
    projection: snapshot.projection,
  });
  assertRuntimeIntegrity();
  const secondStore = await READ_P10_2_STORE(roots);
  assertRuntimeIntegrity();
  return buildFromAuthenticatedInputs(
    firstStore,
    secondStore,
    snapshot.projection,
    workControl.artifact,
  );
}

/**
 * TEST-ONLY. This function is pure but trusts that the supplied P10.2
 * snapshots and P10.3a artifact were authenticated by their owning seams.
 * Standalone output validation is self-consistency only.
 */
export function unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest(
  input: UnsafeBuildTaskMapLifecycleFacetsInputForTest,
): BuiltTaskMapLifecycleFacets {
  const snapshot = snapshotJson(
    input,
    "unsafe lifecycle-facet authenticated fixture input",
  );
  assertExactKeys(
    snapshot,
    ["firstStore", "secondStore", "projection", "workControl"],
    "unsafe lifecycle-facet authenticated fixture input",
  );
  return buildFromAuthenticatedInputs(
    snapshot.firstStore,
    snapshot.secondStore,
    snapshot.projection,
    snapshot.workControl,
  );
}

function assertPredecessor(
  predecessor: TaskMapLifecycleFacetsPredecessorV1,
): void {
  assertExactKeys(
    predecessor,
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
      "diffId",
      "diffDigest",
      "replayClosureDigest",
      "sourceSnapshotDigest",
      "sourceSemanticInputDigest",
      "workControlArtifactId",
      "workControlArtifactDigest",
      "workControlOriginDigest",
      "projectionRunId",
      "projectionInputDigest",
      "projectionDigest",
    ],
    "lifecycle-facet predecessor",
  );
  assertDigest(predecessor.ownerScopeDigest, "owner scope digest");
  if (
    !FIXED_GENERATION.test(predecessor.generation)
    || BIGINT_CONSTRUCTOR(predecessor.generation) === 0n
  ) {
    fail("predecessor generation is invalid");
  }
  assertHashedId(
    predecessor.currentRefId,
    HASHED_IDS.currentRef,
    "current-ref ID",
  );
  assertDigest(predecessor.currentRefDigest, "current-ref digest");
  assertHashedId(predecessor.entryId, HASHED_IDS.entry, "entry ID");
  assertHashedId(
    predecessor.acceptedOriginBundleId,
    HASHED_IDS.bundle,
    "accepted-origin bundle ID",
  );
  assertDigest(
    predecessor.acceptedOriginReplayDigest,
    "accepted-origin replay digest",
  );
  assertDigest(predecessor.acceptedStateDigest, "accepted-state digest");
  assertHashedId(predecessor.sidecarId, HASHED_IDS.sidecar, "sidecar ID");
  assertDigest(predecessor.sidecarDigest, "sidecar digest");
  assertHashedId(predecessor.diffId, HASHED_IDS.diff, "diff ID");
  assertDigest(predecessor.diffDigest, "diff digest");
  assertDigest(predecessor.replayClosureDigest, "replay-closure digest");
  assertDigest(predecessor.sourceSnapshotDigest, "source-snapshot digest");
  assertDigest(
    predecessor.sourceSemanticInputDigest,
    "source-semantic-input digest",
  );
  assertHashedId(
    predecessor.workControlArtifactId,
    HASHED_IDS.workControl,
    "work-control artifact ID",
  );
  assertDigest(
    predecessor.workControlArtifactDigest,
    "work-control artifact digest",
  );
  if (
    predecessor.workControlArtifactId
      !== `tmworkcontroldecision_${
        predecessor.workControlArtifactDigest
      }`
  ) {
    fail("work-control artifact ID does not bind its digest");
  }
  assertDigest(
    predecessor.workControlOriginDigest,
    "work-control origin digest",
  );
  assertHashedId(
    predecessor.projectionRunId,
    HASHED_IDS.projectionRun,
    "projection run ID",
  );
  assertDigest(predecessor.projectionInputDigest, "projection input digest");
  assertDigest(predecessor.projectionDigest, "projection digest");
}

function assertArtifactPrivacy(value: unknown, path = "artifact"): void {
  if (value === null || typeof value !== "object") return;
  if (ARRAY_IS_ARRAY(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertArtifactPrivacy(value[index], `${path}[${index}]`);
    }
    return;
  }
  for (const key of OBJECT_KEYS(value as Record<string, unknown>)) {
    if (
      /^(?:title|summary|body|transcript|candidateToken|candidateText|route|returnRoute|sourceObjectId|sourceRevision|ownerId|participant|email|localPath|credential|secret)$/i
        .test(key)
    ) {
      fail(`${path}.${key} is forbidden by the privacy contract`);
    }
    assertArtifactPrivacy(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
  }
}

/**
 * Standalone validation proves schema/canonical self-consistency only.
 * Product authenticity requires buildTaskMapLifecycleFacets and its
 * authenticated P10.2/P10.3a reads.
 */
export function assertTaskMapLifecycleFacets(
  value: TaskMapLifecycleFacetsV1,
): TaskMapLifecycleFacetsV1 {
  const artifact = snapshotJson(
    value,
    "lifecycle-facet artifact",
    TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxCanonicalArtifactBytes,
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
      "rows",
      "privacy",
    ],
    "lifecycle-facet artifact",
  );
  if (artifact.contractVersion !== TASKMAP_LIFECYCLE_FACETS_VERSION) {
    fail("artifact contract version is unsupported");
  }
  if (
    artifact.policyVersion !== TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION
    || artifact.policyDigest !== POLICY_DIGEST
  ) {
    fail("artifact lifecycle-facet policy binding is invalid");
  }
  assertHashedId(artifact.artifactId, HASHED_IDS.artifact, "artifact ID");
  assertDigest(artifact.artifactDigest, "artifact digest");
  assertDigest(artifact.originDigest, "origin digest");
  assertPredecessor(artifact.predecessor);
  if (digestCanonical(artifact.predecessor) !== artifact.originDigest) {
    fail("origin digest does not bind the exact predecessor");
  }
  if (
    !ARRAY_IS_ARRAY(artifact.rows)
    || artifact.rows.length
      > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxWorks
  ) {
    fail("artifact rows exceed the work ceiling");
  }
  const workIds = new SET_CONSTRUCTOR<string>();
  const taskIds = new SET_CONSTRUCTOR<string>();
  const deltaIds = new SET_CONSTRUCTOR<string>();
  const lifecycleEventIds = new SET_CONSTRUCTOR<string>();
  let previousWorkId: string | undefined;
  for (const [index, row] of artifact.rows.entries()) {
    const label = `lifecycle-facet row ${index}`;
    assertExactKeys(
      row,
      [
        "workId",
        "rootId",
        "projectionTaskIds",
        "lifecycle",
        "change",
        "changedSinceLastRefresh",
        "newlyAcceptedOpen",
        "rankEligible",
        "lifecycleDelta",
      ],
      label,
    );
    assertHashedId(row.workId, HASHED_IDS.work, `${label} work ID`);
    if (
      workIds.has(row.workId)
      || (previousWorkId !== undefined
        && compareText(previousWorkId, row.workId) >= 0)
    ) {
      fail("artifact work rows are duplicate or not canonically sorted");
    }
    workIds.add(row.workId);
    previousWorkId = row.workId;
    if (
      !["accepted_open", "source_complete", "superseded", "rejected"]
        .includes(row.lifecycle)
    ) {
      fail(`${label} lifecycle is unsupported`);
    }
    if (
      !["new", "updated", "resolved", "superseded", "rejected", "unchanged"]
        .includes(row.change)
    ) {
      fail(`${label} change is unsupported`);
    }
    if (!ARRAY_IS_ARRAY(row.projectionTaskIds)) {
      fail(`${label} projection task IDs must be an array`);
    }
    assertExactKeys(
      row.lifecycleDelta,
      [
        "deltaId",
        "previousState",
        "currentState",
        "adjudicatedDelta",
        "adjudicationDigest",
        "lifecycleEventId",
      ],
      `${label} delta`,
    );
    assertHashedId(
      row.lifecycleDelta.deltaId,
      HASHED_IDS.delta,
      `${label} delta ID`,
    );
    if (deltaIds.has(row.lifecycleDelta.deltaId)) {
      fail("artifact lifecycle delta IDs are not unique");
    }
    deltaIds.add(row.lifecycleDelta.deltaId);
    assertDigest(
      row.lifecycleDelta.adjudicationDigest,
      `${label} adjudication digest`,
    );
    assertHashedId(
      row.lifecycleDelta.lifecycleEventId,
      HASHED_IDS.lifecycleEvent,
      `${label} lifecycle event ID`,
    );
    if (lifecycleEventIds.has(row.lifecycleDelta.lifecycleEventId)) {
      fail("artifact lifecycle event IDs are not unique");
    }
    lifecycleEventIds.add(row.lifecycleDelta.lifecycleEventId);
    assertLifecycleTruth(
      row.lifecycleDelta.previousState,
      row.lifecycleDelta.currentState,
      row.lifecycleDelta.adjudicatedDelta,
      label,
    );
    if (
      lifecycleFromP10_2(row.lifecycleDelta.currentState) !== row.lifecycle
    ) {
      fail(`${label} lifecycle does not match its P10.2 delta`);
    }
    const expected = expectedChange({
      ...row.lifecycleDelta,
      workId: row.workId,
      currentSourceIdentityDigest: "0".repeat(64),
    });
    if (
      row.change !== expected
      || row.changedSinceLastRefresh
        !== (row.lifecycleDelta.adjudicatedDelta !== "no_op")
      || row.newlyAcceptedOpen !== (expected === "new")
      || row.rankEligible !== (row.lifecycle === "accepted_open")
    ) {
      fail(`${label} derived lifecycle facets are inconsistent`);
    }
    if (row.lifecycle === "rejected") {
      if (row.rootId !== null || row.projectionTaskIds.length !== 0) {
        fail(`${label} rejected work retains accepted task membership`);
      }
    } else {
      if (row.rootId === null || row.projectionTaskIds.length === 0) {
        fail(`${label} accepted work lacks root/task membership`);
      }
      assertHashedId(row.rootId, HASHED_IDS.root, `${label} root ID`);
    }
    let previousTaskId: string | undefined;
    for (const taskId of row.projectionTaskIds) {
      assertHashedId(taskId, HASHED_IDS.task, `${label} task ID`);
      if (
        taskIds.has(taskId)
        || (
          previousTaskId !== undefined
          && compareText(previousTaskId, taskId) >= 0
        )
      ) {
        fail("projection task IDs are duplicate or not canonically sorted");
      }
      taskIds.add(taskId);
      if (
        taskIds.size
          > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxProjectionTasks
      ) {
        fail("artifact exceeds the global projection-task ceiling");
      }
      previousTaskId = taskId;
    }
  }
  if (
    workIds.size !== artifact.rows.length
    || deltaIds.size !== artifact.rows.length
    || lifecycleEventIds.size !== artifact.rows.length
  ) {
    fail("artifact work/delta/event coverage is not one-to-one");
  }
  assertExactKeys(
    artifact.privacy,
    OBJECT_KEYS(PRIVACY),
    "lifecycle-facet privacy",
  );
  for (const key of OBJECT_KEYS(PRIVACY) as Array<
    keyof TaskMapLifecycleFacetsPrivacyV1
  >) {
    if (artifact.privacy[key] !== false) {
      fail("artifact privacy flags are not fail closed");
    }
  }
  const core = artifactCore({
    contractVersion: artifact.contractVersion,
    originDigest: artifact.originDigest,
    policyVersion: artifact.policyVersion,
    policyDigest: artifact.policyDigest,
    predecessor: artifact.predecessor,
    rows: artifact.rows,
    privacy: artifact.privacy,
  });
  const expectedDigest = digestCanonical(core);
  if (
    artifact.artifactDigest !== expectedDigest
    || artifact.artifactId !== `tmlifecyclefacets_${expectedDigest}`
  ) {
    fail("artifact ID/digest is not canonical-core-derived");
  }
  assertArtifactPrivacy(artifact);
  const bytes = canonicalJson(artifact);
  if (
    BUFFER_BYTE_LENGTH(bytes, "utf8")
      > TASKMAP_LIFECYCLE_FACETS_LIMITS_V1.maxCanonicalArtifactBytes
  ) {
    fail("artifact exceeds the canonical byte ceiling");
  }
  return deepFreeze(artifact);
}

export function taskMapLifecycleFacetsCanonicalBytes(
  value: TaskMapLifecycleFacetsV1,
): string {
  return canonicalJson(assertTaskMapLifecycleFacets(value));
}
