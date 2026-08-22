import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as FS_CONSTANTS,
  fchmodSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeSync,
  type BigIntStats,
} from "node:fs";
import {
  lstat,
  open,
  opendir,
  realpath,
  type FileHandle,
} from "node:fs/promises";
import { types as nodeUtilTypes } from "node:util";
import path from "node:path";

import {
  assertTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  assertTaskMapRefreshPlan,
  assertTaskMapReadyBatch,
} from "./refresh-plan.js";
import {
  TASKMAP_REFRESH_RUN_BUNDLE_VERSION,
  TASKMAP_REFRESH_RUN_COMMIT_VERSION,
  TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION,
  prepareTaskMapRefreshRunBundle,
  verifyTaskMapRefreshRunBundle,
  type TaskMapRefreshRunSourceSnapshotProofV1,
  type VerifiedTaskMapRefreshRunBundle,
} from "./refresh-run-bundle.js";
import {
  TASKMAP_REFRESH_CURRENT_LIMITS_V1,
  assertTaskMapRefreshCurrentRef,
  readTaskMapRefreshCurrent,
  type TaskMapRefreshCurrentAcceptedV1,
  type TaskMapRefreshCurrentRefV1,
  type TaskMapRefreshCurrentSnapshotV1,
} from "./refresh-current-ref.js";
import type {
  TaskMapProjectionV1,
  TaskMapSourceEnvelopeV1,
  TaskMapSourceKind,
  TaskMapSourceSnapshotV1,
} from "./types.js";

export const TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION =
  "taskmap-identity-dedupe-projection.v1" as const;
export const TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION =
  "taskmap-identity-dedupe-diff.v1" as const;
export const TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION =
  "taskmap-identity-dedupe-replay-closure.v1" as const;
export const TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION =
  "taskmap-identity-dedupe-policy.1" as const;
export const TASKMAP_IDENTITY_DECISION_PROOF_VERSION =
  "taskmap-identity-decision-proof.v1" as const;
export const TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION =
  "taskmap-identity-dedupe-store-entry.v1" as const;

// The aggregate input ceiling covers one P10.1C history (16 MiB), one P10.1B
// current bundle (16 MiB), one predecessor bundle (16 MiB), the independently
// bounded source/projection artifacts (4 MiB each), a prior sidecar (4 MiB),
// supplied decisions (8 MiB), and 12 MiB of canonical wrapper headroom:
// 16 + 16 + 16 + 4 + 4 + 4 + 8 + 12 = 80 MiB. The narrower decision ceiling
// prevents caller-authored alias/lineage data from consuming compatibility
// headroom. Count ceilings mirror the upstream safety boundary; 128 variants
// and eight delegation hops are fail-closed policy limits, not load claims.
// The 100k descriptor ceiling pairs with the 100k node ceiling so omitted
// `undefined` fields cannot create unbounded pre-clone work without adding
// traversed value nodes. It is compatibility headroom, not measured capacity.
export const TASKMAP_IDENTITY_DEDUPE_LIMITS_V1 = Object.freeze({
  maxCanonicalInputBytes: 80 * 1024 * 1024,
  maxSuppliedIdentityProofBytes: 8 * 1024 * 1024,
  maxCanonicalArtifactBytes: 4 * 1024 * 1024,
  maxStoreEntryBytes: 10 * 1024 * 1024,
  maxStoreHistoryBytes: 64 * 1024 * 1024,
  maxStoreEntries: 4_096,
  maxConcurrentWriters: 1,
  maxStagingEntries: 1,
  maxStagingBytes: 10 * 1024 * 1024,
  maxNodes: 100_000,
  maxDescriptors: 100_000,
  maxDepth: 32,
  maxObjectKeys: 128,
  maxArrayLength: 8_192,
  maxStringLength: 4_096,
  maxAliases: 2_048,
  maxWorkBindings: 2_048,
  maxSessionLineage: 2_048,
  maxLifecycleAdjudications: 2_048,
  maxVariantsPerIdentity: 128,
  maxDelegationDepth: 8,
});

const SHA256 = /^[a-f0-9]{64}$/;
const FIXED_GENERATION = /^[0-9]{20}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._#-]{0,511}$/;
const HASHED_IDS = Object.freeze({
  sidecar: /^tmidentityprojection_[a-f0-9]{64}$/,
  sourceSnapshot: /^tmsnapshot_[a-f0-9]{16}$/,
  projectionRun: /^tmrun_[a-f0-9]{16}$/,
  currentRef: /^tmrefreshcurrent_[a-f0-9]{64}$/,
  bundle: /^tmrefreshrun_[a-f0-9]{64}$/,
  plan: /^tmrefreshplan_[a-f0-9]{64}$/,
  batch: /^tmrefreshbatch_[a-f0-9]{64}$/,
  sourceSnapshotProof: /^tmrefreshsnapshotproof_[a-f0-9]{64}$/,
  work: /^tmwork_[a-f0-9]{64}$/,
  projectionReference: /^tmprojectionref_[a-f0-9]{64}$/,
  meeting: /^tmmeeting_[a-f0-9]{16}$/,
  event:
    /^(?:tmmeetingevent|tmsessionevent|tmlifecycleevent)_[a-f0-9]{64}$/,
  variant: /^tmvariant_[a-f0-9]{64}$/,
  lifecycleDelta: /^tmlifecycledelta_[a-f0-9]{64}$/,
  sessionRejection: /^tmsessionrejection_[a-f0-9]{64}$/,
  diff: /^tmidentitydiff_[a-f0-9]{64}$/,
  storeEntry: /^tmidentityentry_[a-f0-9]{64}$/,
});
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const STORE_GENERATIONS_DIRECTORY = "generations";
const STORE_STAGING_DIRECTORY = "staging";
const STORE_CLAIMS_DIRECTORY = "claims";
const STORE_GENERATION_FILE = /^([0-9]{20})\.entry\.json$/;
const STORE_STAGE_FILE = /^stage_([a-f0-9]{64})\.json$/;
const STORE_WRITER_CLAIM = /^writer_([a-f0-9]{64})\.claim$/;
const STORE_WRITER_ADMISSION_CLAIM = "writer-admission.claim";
const STORE_RECOVERY_CLAIM = "recovery.claim";
const STORE_WRITER_JOURNAL_VERSION =
  "taskmap-identity-dedupe-writer-journal.v1";
const MAX_WRITER_JOURNAL_BYTES = 1_024;
const STORE_PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  rawOwnerIdentifiersStored: false,
  rawSourceObjectIdentifiersStored: false,
  connectorSecretsStored: false,
  localPathsStored: false,
});
const AGENT_SOURCE_KINDS = new Set<TaskMapSourceKind>([
  "codex_session",
  "claude_session",
  "cursor_session",
]);
const WORK_OBJECT_TYPES = new Set<TaskMapSourceEnvelopeV1["objectType"]>([
  "authoritative_task",
]);
const TERMINAL_STATES = new Set<TaskMapAdjudicatedLifecycleState>([
  "resolved",
  "superseded",
  "rejected",
]);
const PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  emailBodiesStored: false,
  participantDetailsStored: false,
  rawSourceObjectIdentifiersStored: false,
  rawSourceRevisionsStored: false,
  rawBiometricsStored: false,
  fullAgentSessionBodiesStored: false,
  localPathsStored: false,
  connectorSecretsStored: false,
});
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const ARRAY_PROTOTYPE_DESCRIPTORS = (() => {
  const keys = REFLECT_OWN_KEYS(Array.prototype);
  const rows: Array<{
    key: string | symbol;
    descriptor: PropertyDescriptor;
  }> = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    rows.push({
      key,
      descriptor: {
        ...GET_OWN_PROPERTY_DESCRIPTOR(Array.prototype, key)!,
      },
    });
  }
  return Object.freeze(rows);
})();

export type TaskMapIdentityAliasKind = "work" | "session";
export type TaskMapSessionRole = "root" | "subagent" | "wrapper";
export type TaskMapProjectionWorkReferenceKind = "task" | "rejection";
export type TaskMapAdjudicatedLifecycleState =
  | "open"
  | "resolved"
  | "superseded"
  | "rejected";
export type TaskMapAdjudicatedPreviousLifecycleState =
  | "absent"
  | TaskMapAdjudicatedLifecycleState;
export type TaskMapAdjudicatedLifecycleDelta =
  | "open"
  | "updated"
  | "resolved"
  | "superseded"
  | "rejected"
  | "no_op";

export interface TaskMapIdentityAliasV1 {
  identityKind: TaskMapIdentityAliasKind;
  canonicalSourceObjectKeyDigest: string;
  aliasSourceObjectKeyDigest: string;
}

export interface TaskMapProjectionWorkBindingV1 {
  projectionKind: TaskMapProjectionWorkReferenceKind;
  projectionId: string;
  sourceEnvelopeId: string;
}

export interface TaskMapSessionLineageV1 {
  sessionEnvelopeId: string;
  role: TaskMapSessionRole;
  workSourceObjectKeyDigest?: string;
  parentSessionEnvelopeId?: string;
}

export interface TaskMapLifecycleAdjudicationV1 {
  canonicalSourceObjectKeyDigest: string;
  previousState: TaskMapAdjudicatedPreviousLifecycleState;
  currentState: TaskMapAdjudicatedLifecycleState;
  previousSourceIdentityDigest?: string;
  currentSourceIdentityDigest: string;
  adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
}

export interface TaskMapIdentityDedupeReplayClosureV1 {
  contractVersion:
    typeof TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION;
  ownerScopeDigest: string;
  sourceSnapshotDigest: string;
  sourceSemanticInputDigest: string;
  projectionDigest: string;
  projectionRunId: string;
  projectionInputDigest: string;
  suppliedIdentityProofDigest: string;
  semanticRowsDigest: string;
}

export interface TaskMapIdentityDedupeOriginProofV1 {
  currentRefId: string;
  currentGeneration: string;
  acceptedOriginGeneration: string;
  acceptedStateDigest: string;
  bundleId: string;
  planId: string;
  batchId: string;
  sourceSnapshotProofId: string;
  acceptedOriginReplayDigest: string;
  replayClosureDigest: string;
}

export interface TaskMapIdentityProjectionReferenceV1 {
  kind: TaskMapProjectionWorkReferenceKind;
  id: string;
  projectionRowDigest: string;
}

export interface TaskMapIdentityDedupeWorkV1 {
  workId: string;
  canonicalSourceObjectKeyDigest: string;
  variantSourceObjectKeyDigests: string[];
  variantSourceIdentityDigests: string[];
  projectionReferences: TaskMapIdentityProjectionReferenceV1[];
  corroboratingSessionEventIds: string[];
  lifecycleEventId: string;
  lifecycleState: TaskMapAdjudicatedLifecycleState;
}

export interface TaskMapIdentityDedupeMeetingEventV1 {
  eventKind: "meeting";
  eventId: string;
  canonicalMeetingId: string;
  identityMethod: "calendar_event" | "bounded_fingerprint";
  reviewState: "resolved" | "needs_review";
  variantEnvelopeIds: string[];
}

export interface TaskMapIdentityDedupeSessionEventV1 {
  eventKind: "session";
  eventId: string;
  canonicalSourceObjectKeyDigest: string;
  corroboratesWorkId: string;
  identitySourceObjectKeyDigests: string[];
  variantSourceObjectKeyDigests: string[];
  variantEnvelopeIds: string[];
}

export interface TaskMapIdentityDedupeLifecycleEventV1 {
  eventKind: "work_lifecycle";
  eventId: string;
  workId: string;
  sourceIdentityDigest: string;
  lifecycleState: TaskMapAdjudicatedLifecycleState;
  adjudicationDigest: string;
}

export type TaskMapIdentityDedupeEventV1 =
  | TaskMapIdentityDedupeMeetingEventV1
  | TaskMapIdentityDedupeSessionEventV1
  | TaskMapIdentityDedupeLifecycleEventV1;

export interface TaskMapIdentityDedupeLifecycleDeltaV1 {
  deltaId: string;
  workId: string;
  previousState: TaskMapAdjudicatedPreviousLifecycleState;
  currentState: TaskMapAdjudicatedLifecycleState;
  previousSourceIdentityDigest?: string;
  currentSourceIdentityDigest: string;
  adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
  adjudicationDigest: string;
  lifecycleEventId: string;
}

export interface TaskMapIdentityDedupeRejectedVariantV1 {
  rejectionId: string;
  sourceObjectKeyDigest: string;
  envelopeId: string;
  reasonCode: "wrapper_transport_not_semantic_session";
  proofDigest: string;
}

export interface TaskMapIdentityDedupeProjectionV1 {
  contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION;
  sidecarId: string;
  ownerScopeDigest: string;
  policyVersion: typeof TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION;
  suppliedIdentityProofDigest: string;
  sourceSnapshotId: string;
  sourceSnapshotDigest: string;
  projectionRunId: string;
  projectionDigest: string;
  origin: TaskMapIdentityDedupeOriginProofV1;
  replayClosure: TaskMapIdentityDedupeReplayClosureV1;
  works: TaskMapIdentityDedupeWorkV1[];
  events: TaskMapIdentityDedupeEventV1[];
  lifecycleDeltas: TaskMapIdentityDedupeLifecycleDeltaV1[];
  rejectedVariants: TaskMapIdentityDedupeRejectedVariantV1[];
  privacy: typeof PRIVACY;
}

export type TaskMapIdentityDedupeDiffRecordKind =
  | "metadata"
  | "work"
  | "event"
  | "lifecycle_delta"
  | "rejected_variant";

export interface TaskMapIdentityDedupeDiffEntryV1 {
  kind: TaskMapIdentityDedupeDiffRecordKind;
  id: string;
  beforeDigest?: string;
  afterDigest?: string;
}

export interface TaskMapIdentityDedupeDiffV1 {
  contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION;
  diffId: string;
  previousSidecarDigest: string;
  currentSidecarDigest: string;
  added: TaskMapIdentityDedupeDiffEntryV1[];
  removed: TaskMapIdentityDedupeDiffEntryV1[];
  changed: TaskMapIdentityDedupeDiffEntryV1[];
}

export interface BuildTaskMapIdentityDedupeProjectionInput {
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1;
  acceptedOrigin: VerifiedTaskMapRefreshRunBundle;
  sourceSnapshot: TaskMapSourceSnapshotV1;
  projection: TaskMapProjectionV1;
  workBindings: TaskMapProjectionWorkBindingV1[];
  aliases: TaskMapIdentityAliasV1[];
  sessionLineage: TaskMapSessionLineageV1[];
  lifecycleAdjudications: TaskMapLifecycleAdjudicationV1[];
  previousSidecar: TaskMapIdentityDedupeProjectionV1 | null;
  previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle | null;
}

export interface BuildTaskMapIdentityDedupeProjectionFromStoreInput
  extends Omit<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "currentSnapshot"
    | "acceptedOrigin"
    | "previousSidecar"
    | "previousAcceptedOrigin"
  > {
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
}

export interface TaskMapIdentityDedupeStoreRoots {
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
}

export interface BackfillTaskMapIdentityDedupeProjectionInput
  extends BuildTaskMapIdentityDedupeProjectionFromStoreInput {
  targetGeneration: string;
}

export interface TaskMapIdentityDedupeGenerationObservationInput {
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
  targetGeneration: string;
}

export interface BuiltTaskMapIdentityDedupeProjection {
  sidecar: TaskMapIdentityDedupeProjectionV1;
  diff: TaskMapIdentityDedupeDiffV1;
  sidecarCanonicalBytes: string;
  diffCanonicalBytes: string;
}

export interface TaskMapIdentityDedupeStorePredecessorV1 {
  generation: string;
  currentRefId: string;
  entryId: string;
}

export interface TaskMapIdentityDedupeSemanticHeadV1 {
  generation: string;
  currentRefId: string;
  sidecarId: string;
  sidecarDigest: string;
}

interface TaskMapIdentityDedupeStoreEntryBaseV1 {
  contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION;
  entryId: string;
  ownerScopeDigest: string;
  generation: string;
  currentRefId: string;
  currentRefDigest: string;
  predecessor: TaskMapIdentityDedupeStorePredecessorV1 | null;
  semanticHead: TaskMapIdentityDedupeSemanticHeadV1 | null;
  privacy: typeof STORE_PRIVACY;
}

export interface TaskMapIdentityDedupeProjectionStoreEntryV1
  extends TaskMapIdentityDedupeStoreEntryBaseV1 {
  entryKind: "projection";
  acceptedOriginBundleId: string;
  acceptedOriginReplayDigest: string;
  replayClosureDigest: string;
  sidecarId: string;
  sidecarDigest: string;
  diffId: string;
  diffDigest: string;
  sidecar: TaskMapIdentityDedupeProjectionV1;
  diff: TaskMapIdentityDedupeDiffV1;
}

export interface TaskMapIdentityDedupeObservationStoreEntryV1
  extends TaskMapIdentityDedupeStoreEntryBaseV1 {
  entryKind: "no_accepted_origin" | "rollback_observed";
  publicationState: "no_accepted_origin" | "review_required";
  operation: TaskMapRefreshCurrentRefV1["operation"];
  accepted: TaskMapRefreshCurrentAcceptedV1 | null;
  rollback: TaskMapRefreshCurrentRefV1["rollback"] | null;
  reasonCode:
    | "p10_1_has_no_accepted_origin"
    | "rollback_requires_reviewed_identity_adjudication";
}

export type TaskMapIdentityDedupeStoreEntryV1 =
  | TaskMapIdentityDedupeProjectionStoreEntryV1
  | TaskMapIdentityDedupeObservationStoreEntryV1;

export interface TaskMapIdentityDedupeStoreSnapshotV1 {
  entries: TaskMapIdentityDedupeStoreEntryV1[];
  canonicalByteLength: number;
  remainingByteCapacity: number;
}

export interface TaskMapIdentityDedupePublicationV1 {
  status: "published" | "already_published";
  entry: TaskMapIdentityDedupeStoreEntryV1;
  processCrashAtomic: true;
  powerLossDurabilityClaimed: false;
}

export interface BuiltAndPublishedTaskMapIdentityDedupeProjection
  extends BuiltTaskMapIdentityDedupeProjection {
  publication: TaskMapIdentityDedupePublicationV1;
}

type JsonPreflightState = {
  nodes: number;
  descriptors: number;
  bytes: number;
  byteLimit: number;
};

type RecordLike = Record<string, unknown>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${taskMapContractDigest(value)}`;
}

function fail(message: string): never {
  throw new Error(`P10.2 identity/dedupe projection: ${message}`);
}

function decodeExactUtf8(buffer: Buffer, label: string): string {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
  if (!Buffer.from(decoded, "utf8").equals(buffer)) {
    fail(`${label} is not exact UTF-8`);
  }
  return decoded;
}

export function taskMapIdentityDedupeUtf8WriteChunks(
  value: string,
): readonly [Buffer, Buffer] {
  if (typeof value !== "string") {
    fail("UTF-8 write input must be a string");
  }
  const buffer = Buffer.from(value, "utf8");
  const split = Math.max(1, Math.floor(buffer.byteLength / 2));
  return [
    buffer.subarray(0, split),
    buffer.subarray(split),
  ] as const;
}

function assertArrayPrototypeIntegrity(): void {
  const currentKeys = REFLECT_OWN_KEYS(Array.prototype);
  if (currentKeys.length !== ARRAY_PROTOTYPE_DESCRIPTORS.length) {
    fail("Array prototype dependency set is not intact");
  }
  for (
    let index = 0;
    index < ARRAY_PROTOTYPE_DESCRIPTORS.length;
    index += 1
  ) {
    const expected = ARRAY_PROTOTYPE_DESCRIPTORS[index]!;
    if (currentKeys[index] !== expected.key) {
      fail("Array prototype dependency set is not intact");
    }
    const current = GET_OWN_PROPERTY_DESCRIPTOR(
      Array.prototype,
      expected.key,
    );
    const prior = expected.descriptor;
    if (
      current === undefined
      || current.configurable !== prior.configurable
      || current.enumerable !== prior.enumerable
      || ("writable" in current ? current.writable : undefined)
        !== ("writable" in prior ? prior.writable : undefined)
      || ("value" in current ? current.value : undefined)
        !== ("value" in prior ? prior.value : undefined)
      || current.get !== prior.get
      || current.set !== prior.set
    ) {
      fail("Array prototype dependency set is not intact");
    }
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertSafeId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    fail(`${label} must be a bounded opaque identifier`);
  }
}

function assertHashedId(
  value: unknown,
  pattern: RegExp,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label} must be a contract-derived hashed identifier`);
  }
}

function assertArrayBound(
  value: unknown,
  limit: number,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > limit) {
    fail(`${label} must be an array of at most ${limit} items`);
  }
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is RecordLike {
  if (!value || typeof value !== "object") {
    fail(`${label} must be an object`);
  }
  if (nodeUtilTypes.isProxy(value)) {
    fail(`${label} must not be proxy-backed`);
  }
  if (Array.isArray(value)) fail(`${label} must be an object`);
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (
    ownKeys.length > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys
  ) {
    fail(`${label} contains too many object fields`);
  }
  const keys: string[] = [];
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      fail(`${label} must not contain symbol fields`);
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (descriptor === undefined) {
      fail(`${label}.${key} changed during validation`);
    }
    keys.push(key);
    descriptors.set(key, descriptor);
  }
  keys.sort(compareText);
  const allowed = new Set([...required, ...optional]);
  const unknown = keys.filter((key) => !allowed.has(key));
  const hasDescriptor = (key: string): boolean => descriptors.has(key);
  const missing = required.filter((key) => !hasDescriptor(key));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must use a plain or null prototype`);
  }
  if (unknown.length > 0 || missing.length > 0) {
    fail(
      `${label} has invalid fields`
      + (unknown.length > 0 ? `; unknown=${unknown.join(",")}` : "")
      + (missing.length > 0 ? `; missing=${missing.join(",")}` : ""),
    );
  }
  for (const key of keys) {
    const descriptor = descriptors.get(key)!;
    if (
      !descriptor.enumerable
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      fail(`${label}.${key} must be an own enumerable data property`);
    }
  }
  if (prototype !== null) {
    for (const key of allowed) {
      if (
        !hasDescriptor(key)
        && Object.getOwnPropertyDescriptor(prototype, key) !== undefined
      ) {
        fail(`${label}.${key} must not be inherited`);
      }
    }
  }
}

function preflightJson(
  value: unknown,
  label: string,
  state: JsonPreflightState,
  depth = 0,
): void {
  state.nodes += 1;
  if (
    state.nodes > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxNodes
    || depth > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxDepth
  ) {
    fail(`${label} exceeds the structural bound`);
  }
  const addBytes = (bytes: number): void => {
    state.bytes += bytes;
    if (state.bytes > state.byteLimit) {
      fail(`${label} exceeds the pre-clone canonical byte bound`);
    }
  };
  const chargeOwnDescriptor = (key: string): void => {
    state.descriptors += 1;
    if (
      state.descriptors
        > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxDescriptors
    ) {
      fail(`${label} exceeds the pre-clone descriptor bound`);
    }
    if (key.length > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength) {
      fail(`${label} contains an oversized object key`);
    }
    addBytes(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
  };
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(`${label} contains a non-finite number`);
    }
    addBytes(Buffer.byteLength(JSON.stringify(value), "utf8"));
    return;
  }
  if (typeof value === "string") {
    if (value.length > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength) {
      fail(`${label} contains an oversized string`);
    }
    addBytes(Buffer.byteLength(JSON.stringify(value), "utf8"));
    return;
  }
  if (
    value !== null
    && typeof value === "object"
    && nodeUtilTypes.isProxy(value)
  ) {
    fail(`${label} must not be proxy-backed`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      fail(`${label} array must use the intrinsic Array prototype`);
    }
    if (value.length > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxArrayLength) {
      fail(`${label} contains an oversized array`);
    }
    addBytes(2 + Math.max(0, value.length - 1));
    const ownKeys = REFLECT_OWN_KEYS(value);
    if (ownKeys.length > value.length + 1) {
      fail(`${label} array contains named fields`);
    }
    for (const key of ownKeys) {
      if (typeof key !== "string") {
        fail(`${label} array contains symbol fields`);
      }
      chargeOwnDescriptor(key);
      if (
        key !== "length"
        && (
          !/^(0|[1-9]\d*)$/.test(key)
          || Number(key) >= value.length
        )
      ) {
        fail(`${label} array contains named fields`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || !("value" in descriptor)
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) {
        fail(`${label}[${index}] must be an own enumerable data property`);
      }
      preflightJson(
        descriptor.value,
        `${label}[${index}]`,
        state,
        depth + 1,
      );
    }
    return;
  }
  if (!value || typeof value !== "object") {
    fail(`${label} contains a non-JSON value`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must use a plain or null prototype`);
  }
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (
    ownKeys.length > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys
  ) {
    fail(`${label} contains too many object fields`);
  }
  const keys: string[] = [];
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      fail(`${label} contains symbol fields`);
    }
    keys.push(key);
  }
  addBytes(2 + Math.max(0, keys.length - 1));
  for (const key of keys) {
    // Charge every own key and descriptor before inspecting its value.
    // Optional fields whose data value is `undefined` are omitted from the
    // canonical JSON, but they still consume traversal/clone work and cannot
    // bypass the advertised pre-clone bounds.
    chargeOwnDescriptor(key);
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      fail(`${label}.${key} must be an own enumerable JSON data property`);
    }
    // Existing Task Map contracts represent absent optional object fields as
    // either omitted or `undefined` in memory. Canonical bytes omit both, so
    // accept `undefined` only as an object-property absence. Array holes and
    // array `undefined` entries remain invalid above.
    if (descriptor.value === undefined) continue;
    preflightJson(
      descriptor.value,
      `${label}.${key}`,
      state,
      depth + 1,
    );
  }
}

function snapshotInput(
  value: BuildTaskMapIdentityDedupeProjectionInput,
): BuildTaskMapIdentityDedupeProjectionInput {
  assertExactKeys(
    value,
    [
      "currentSnapshot",
      "acceptedOrigin",
      "sourceSnapshot",
      "projection",
      "workBindings",
      "aliases",
      "sessionLineage",
      "lifecycleAdjudications",
      "previousSidecar",
      "previousAcceptedOrigin",
    ],
    [],
    "build input",
  );
  preflightJson({
    aliases: value.aliases,
    workBindings: value.workBindings,
    sessionLineage: value.sessionLineage,
    lifecycleAdjudications: value.lifecycleAdjudications,
  }, "supplied identity proof input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxSuppliedIdentityProofBytes,
  });
  preflightJson(value, "build input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  let snapshot: BuildTaskMapIdentityDedupeProjectionInput;
  try {
    snapshot = structuredClone(value);
  } catch {
    fail("build input must be independently cloneable");
  }
  const bytes = Buffer.byteLength(
    taskMapContractCanonicalJson(snapshot),
    "utf8",
  );
  if (bytes > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes) {
    fail("build input exceeds the canonical byte bound");
  }
  return snapshot;
}

function snapshotStoreRoots(
  value: TaskMapIdentityDedupeStoreRoots,
  label = "sidecar store roots",
): TaskMapIdentityDedupeStoreRoots {
  assertExactKeys(
    value,
    ["currentRoot", "runRoot", "sidecarRoot"],
    [],
    label,
  );
  if (
    typeof value.currentRoot !== "string"
    || value.currentRoot.length === 0
    || typeof value.runRoot !== "string"
    || value.runRoot.length === 0
    || typeof value.sidecarRoot !== "string"
    || value.sidecarRoot.length === 0
  ) {
    fail(`${label} must be non-empty paths`);
  }
  preflightJson(value, label, {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  try {
    return structuredClone(value);
  } catch {
    fail(`${label} must be independently cloneable`);
  }
}

function snapshotStoreInput(
  value: BuildTaskMapIdentityDedupeProjectionFromStoreInput,
): BuildTaskMapIdentityDedupeProjectionFromStoreInput {
  assertExactKeys(
    value,
    [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
      "sourceSnapshot",
      "projection",
      "workBindings",
      "aliases",
      "sessionLineage",
      "lifecycleAdjudications",
    ],
    [],
    "store build input",
  );
  preflightJson(value, "store build input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  if (
    typeof value.currentRoot !== "string"
    || value.currentRoot.length === 0
    || typeof value.runRoot !== "string"
    || value.runRoot.length === 0
    || typeof value.sidecarRoot !== "string"
    || value.sidecarRoot.length === 0
  ) {
    fail("store roots must be non-empty paths");
  }
  try {
    return structuredClone(value);
  } catch {
    fail("store build input must be independently cloneable");
  }
}

function snapshotBackfillInput(
  value: BackfillTaskMapIdentityDedupeProjectionInput,
): BackfillTaskMapIdentityDedupeProjectionInput {
  assertExactKeys(
    value,
    [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
      "targetGeneration",
      "sourceSnapshot",
      "projection",
      "workBindings",
      "aliases",
      "sessionLineage",
      "lifecycleAdjudications",
    ],
    [],
    "backfill input",
  );
  preflightJson(value, "backfill input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  if (
    typeof value.targetGeneration !== "string"
    || !FIXED_GENERATION.test(value.targetGeneration)
    || BigInt(value.targetGeneration) === 0n
  ) {
    fail("backfill target must be a nonzero fixed-width generation");
  }
  const {
    targetGeneration,
    ...storeInput
  } = value;
  const snapshot = snapshotStoreInput(storeInput);
  return { ...snapshot, targetGeneration };
}

function snapshotObservationInput(
  value: TaskMapIdentityDedupeGenerationObservationInput,
): TaskMapIdentityDedupeGenerationObservationInput {
  assertExactKeys(
    value,
    [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
      "targetGeneration",
    ],
    [],
    "generation observation input",
  );
  preflightJson(value, "generation observation input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  if (
    typeof value.currentRoot !== "string"
    || value.currentRoot.length === 0
    || typeof value.runRoot !== "string"
    || value.runRoot.length === 0
    || typeof value.sidecarRoot !== "string"
    || value.sidecarRoot.length === 0
  ) {
    fail("generation observation roots must be non-empty paths");
  }
  assertFixedGeneration(
    value.targetGeneration,
    "generation observation target",
  );
  try {
    return structuredClone(value);
  } catch {
    fail("generation observation input must be independently cloneable");
  }
}

type ReplayDigestInput = {
  sourceSnapshot: TaskMapSourceSnapshotV1;
  projection: TaskMapProjectionV1;
  suppliedProofs: Pick<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "aliases"
    | "workBindings"
    | "sessionLineage"
    | "lifecycleAdjudications"
  >;
  reviewAttestationDigest: string;
};

function snapshotReplayDigestInput(
  value: ReplayDigestInput,
): ReplayDigestInput {
  assertExactKeys(
    value,
    [
      "sourceSnapshot",
      "projection",
      "suppliedProofs",
      "reviewAttestationDigest",
    ],
    [],
    "replay digest input",
  );
  assertExactKeys(
    value.suppliedProofs,
    [
      "aliases",
      "workBindings",
      "sessionLineage",
      "lifecycleAdjudications",
    ],
    [],
    "replay supplied proofs",
  );
  preflightJson(value, "replay digest input", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
  });
  try {
    return structuredClone(value);
  } catch {
    fail("replay digest input must be independently cloneable");
  }
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left)
    === taskMapContractCanonicalJson(right);
}

function sortedUnique(values: readonly string[], label: string): string[] {
  const sorted = [...values].sort(compareText);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) {
      fail(`${label} contains a duplicate value`);
    }
  }
  return sorted;
}

function expectedGeneration(index: number): string {
  return BigInt(index + 1).toString().padStart(20, "0");
}

function assertHealthyCurrentHistory(
  value: TaskMapRefreshCurrentSnapshotV1,
): {
  head: TaskMapRefreshCurrentRefV1;
  generations: TaskMapRefreshCurrentRefV1[];
} {
  if (
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
      !== TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations
  ) {
    fail("P10.1/P10.2 generation capacity dependency is misaligned");
  }
  assertExactKeys(
    value,
    [
      "status",
      "head",
      "generations",
      "unknownGenerationNames",
      "unknownObjectNames",
    ],
    [],
    "current snapshot",
  );
  if (value.status !== "healthy") {
    fail("current snapshot must be healthy");
  }
  if (
    !Array.isArray(value.generations)
    || value.generations.length === 0
    || value.head === undefined
  ) {
    fail("current snapshot must contain a non-empty head and history");
  }
  if (
    value.generations.length
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
  ) {
    fail("current snapshot exceeds P10.2 generation capacity");
  }
  if (
    !Array.isArray(value.unknownGenerationNames)
    || !Array.isArray(value.unknownObjectNames)
    || value.unknownGenerationNames.length > 0
    || value.unknownObjectNames.length > 0
  ) {
    fail("current snapshot must not contain unknown store residue");
  }
  const generations = value.generations.map((generation, index) => {
    const normalized = assertTaskMapRefreshCurrentRef(generation);
    if (!canonicalEqual(normalized, generation)) {
      fail(`generation ${index + 1} is not canonical`);
    }
    if (generation.generation !== expectedGeneration(index)) {
      fail("current snapshot generations are not a contiguous prefix");
    }
    if (
      index === 0
        ? generation.predecessorRefId !== undefined
        : generation.predecessorRefId
          !== value.generations[index - 1]!.refId
    ) {
      fail("current snapshot predecessor chain is inconsistent");
    }
    return normalized;
  });
  const head = generations[generations.length - 1]!;
  if (generations.some((generation) => (
    generation.ownerScopeDigest !== head.ownerScopeDigest
  ))) {
    fail("current snapshot generations cross owner scope");
  }
  if (!canonicalEqual(head, value.head)) {
    fail("current snapshot head is not the last contiguous generation");
  }
  return { head, generations };
}

function assertHealthyCurrentSnapshot(
  value: TaskMapRefreshCurrentSnapshotV1,
): {
  head: TaskMapRefreshCurrentRefV1;
  accepted: TaskMapRefreshCurrentAcceptedV1;
  originRef: TaskMapRefreshCurrentRefV1;
} {
  const { head, generations } = assertHealthyCurrentHistory(value);
  const accepted = head.accepted;
  if (accepted === undefined) {
    fail("current snapshot has no active accepted origin");
  }
  const originRef = generations.find((candidate) => (
    candidate.generation === accepted.originGeneration
  ));
  if (
    originRef === undefined
    || originRef.operation !== "complete"
    || originRef.accepted === undefined
    || !canonicalEqual(originRef.accepted, accepted)
    || originRef.attempt === undefined
    || originRef.attempt.bundleId !== accepted.bundleId
    || originRef.attempt.planId !== accepted.planId
    || originRef.attempt.batchId !== accepted.batchId
    || originRef.attempt.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
  ) {
    fail("active accepted origin is absent or inconsistent");
  }
  return { head, accepted, originRef };
}

function snapshotBindingProjection(
  snapshot: TaskMapSourceSnapshotV1,
): Array<{
  bindingDigest: string;
  sourceKind: TaskMapSourceKind;
  sourceContractVersion: TaskMapSourceEnvelopeV1["contractVersion"];
}> {
  const rows = new Map<string, {
    bindingDigest: string;
    sourceKind: TaskMapSourceKind;
    sourceContractVersion: TaskMapSourceEnvelopeV1["contractVersion"];
  }>();
  for (const envelope of snapshot.envelopes) {
    const bindingDigest = taskMapContractDigest(envelope.binding);
    const value = {
      bindingDigest,
      sourceKind: envelope.sourceKind,
      sourceContractVersion: envelope.contractVersion,
    };
    const prior = rows.get(bindingDigest);
    if (prior !== undefined && !canonicalEqual(prior, value)) {
      fail("source snapshot binding digest is contradictory");
    }
    rows.set(bindingDigest, value);
  }
  return [...rows.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
  ));
}

function snapshotRevisionProjection(
  snapshot: TaskMapSourceSnapshotV1,
): Array<{
  bindingDigest: string;
  sourceIdentityDigest: string;
  sourceRevisionDigest: string;
  contentDigest: string;
}> {
  return snapshot.envelopes.map((envelope) => ({
    bindingDigest: taskMapContractDigest(envelope.binding),
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  })).sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
    || compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
    || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
    || compareText(left.contentDigest, right.contentDigest)
  ));
}

function expectedSnapshotProof(
  snapshot: TaskMapSourceSnapshotV1,
  origin: VerifiedTaskMapRefreshRunBundle,
): TaskMapRefreshRunSourceSnapshotProofV1 {
  const bindingProjection = snapshotBindingProjection(snapshot);
  const revisionProjection = snapshotRevisionProjection(snapshot);
  const plannedBindings = origin.plan.sourceBindings.map((binding) => ({
    bindingDigest: binding.bindingDigest,
    sourceKind: binding.sourceKind,
    sourceContractVersion: binding.sourceContractVersion,
  })).sort((left, right) => compareText(
    left.bindingDigest,
    right.bindingDigest,
  ));
  if (
    !canonicalEqual(bindingProjection, plannedBindings)
    || !canonicalEqual(revisionProjection, origin.plan.sourceRevisions)
  ) {
    fail("source snapshot does not exactly project into the accepted plan");
  }
  const core = {
    contractVersion: TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION,
    sourceContractVersion: snapshot.contractVersion,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    planId: origin.plan.planId,
    snapshotId: snapshot.snapshotId,
    sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
    semanticInputDigest: snapshot.semanticInputDigest,
    bodyContextDigest: snapshot.bodyContextDigest,
    discoveryProvenanceDigest: snapshot.discoveryProvenanceDigest,
    sourceBindingProofDigest: taskMapContractDigest(bindingProjection),
    sourceRevisionProofDigest: taskMapContractDigest(revisionProjection),
    sourceRevisionSetProofDigest:
      taskMapContractDigest(origin.plan.sourceRevisionSets),
    sourceBindingCount: bindingProjection.length,
    sourceRevisionCount: revisionProjection.length,
    privacy: {
      sourceBodiesStored: false,
      rawSourceObjectIdentifiersStored: false,
      discoveryIdentifiersStored: false,
      connectorSecretsStored: false,
      localPathsStored: false,
    },
  } as const;
  return {
    sourceSnapshotProofId:
      `tmrefreshsnapshotproof_${taskMapContractDigest(core)}`,
    ...core,
  };
}

function assertAcceptedOrigin(
  origin: VerifiedTaskMapRefreshRunBundle,
  accepted: TaskMapRefreshCurrentAcceptedV1,
  ownerScopeDigest: string,
  sourceSnapshot: TaskMapSourceSnapshotV1,
): void {
  assertExactKeys(
    origin,
    [
      "bundleId",
      "manifest",
      "commitMarker",
      "plan",
      "batch",
      "checkpoints",
    ],
    ["sourceSnapshotProof"],
    "accepted origin",
  );
  const plan = assertTaskMapRefreshPlan(origin.plan);
  const batch = assertTaskMapReadyBatch(plan, origin.batch);
  if (
    !canonicalEqual(plan, origin.plan)
    || !canonicalEqual(batch, origin.batch)
  ) {
    fail("accepted origin plan or batch is not canonical");
  }
  assertExactKeys(
    origin.manifest,
    [
      "contractVersion",
      "bundleId",
      "bundleContentDigest",
      "ownerScopeDigest",
      "planId",
      "batchId",
      "candidateAcceptedStateDigest",
      "members",
      "privacy",
    ],
    [],
    "accepted origin manifest",
  );
  assertExactKeys(
    origin.commitMarker,
    ["contractVersion", "bundleId", "manifestByteSha256"],
    [],
    "accepted origin commit marker",
  );
  if (
    origin.manifest.contractVersion !== TASKMAP_REFRESH_RUN_BUNDLE_VERSION
    || origin.commitMarker.contractVersion
      !== TASKMAP_REFRESH_RUN_COMMIT_VERSION
    || origin.bundleId !== accepted.bundleId
    || origin.manifest.bundleId !== accepted.bundleId
    || origin.commitMarker.bundleId !== accepted.bundleId
    || origin.plan.planId !== accepted.planId
    || origin.manifest.planId !== accepted.planId
    || origin.batch.batchId !== accepted.batchId
    || origin.manifest.batchId !== accepted.batchId
    || origin.plan.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.batch.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.manifest.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.batch.publication.state !== "complete"
    || origin.batch.publication.eligible
    || origin.plan.ownerScopeDigest !== ownerScopeDigest
    || origin.manifest.ownerScopeDigest !== ownerScopeDigest
    || origin.checkpoints.ownerScopeDigest !== ownerScopeDigest
    || sourceSnapshot.ownerScopeDigest !== ownerScopeDigest
  ) {
    fail("accepted origin owner/identity/accepted-state closure is invalid");
  }
  if (origin.sourceSnapshotProof === undefined) {
    fail("accepted origin has no source-snapshot proof");
  }
  assertExactKeys(
    origin.sourceSnapshotProof,
    [
      "contractVersion",
      "sourceSnapshotProofId",
      "sourceContractVersion",
      "ownerScopeDigest",
      "planId",
      "snapshotId",
      "sourceSnapshotDigest",
      "semanticInputDigest",
      "bodyContextDigest",
      "discoveryProvenanceDigest",
      "sourceBindingProofDigest",
      "sourceRevisionProofDigest",
      "sourceRevisionSetProofDigest",
      "sourceBindingCount",
      "sourceRevisionCount",
      "privacy",
    ],
    [],
    "accepted origin source-snapshot proof",
  );
  const expected = expectedSnapshotProof(sourceSnapshot, origin);
  if (!canonicalEqual(expected, origin.sourceSnapshotProof)) {
    fail("supplied source snapshot does not match the accepted origin proof");
  }
  if (!origin.plan.semanticInputDigests.includes(sourceSnapshot.semanticInputDigest)) {
    fail("source semantic input is absent from the accepted plan");
  }
  let reproduced;
  try {
    reproduced = prepareTaskMapRefreshRunBundle({
      plan: origin.plan,
      batch: origin.batch,
      connectorCheckpoints: origin.checkpoints.checkpoints.map(
        (record) => record.checkpoint,
      ),
      attemptOutputs: origin.checkpoints.laneReferences
        .filter((reference) => reference.referenceKind === "attempt_output")
        .map((reference) => ({
          laneId: reference.laneId,
          checkpointDigest: reference.checkpointDigest,
          sourceSliceDigest: reference.sourceSliceDigest,
        })),
      sourceSliceProofs: origin.checkpoints.sourceSlices,
      sourceSnapshot,
    });
  } catch {
    fail("accepted origin cannot be reproduced from its closed artifacts");
  }
  if (
    reproduced.bundleId !== origin.bundleId
    || !canonicalEqual(reproduced.manifest, origin.manifest)
    || !canonicalEqual(reproduced.commitMarker, origin.commitMarker)
    || !canonicalEqual(
      JSON.parse(reproduced.members["checkpoints.json"]!),
      origin.checkpoints,
    )
    || !canonicalEqual(
      JSON.parse(reproduced.members["source-snapshot.json"]!),
      origin.sourceSnapshotProof,
    )
  ) {
    fail("accepted origin immutable bundle closure is invalid");
  }
}

function assertPreviousAcceptedOrigin(
  origin: VerifiedTaskMapRefreshRunBundle,
  previous: TaskMapIdentityDedupeProjectionV1,
  predecessorRef: TaskMapRefreshCurrentRefV1,
): void {
  const accepted = predecessorRef.accepted;
  if (accepted === undefined) {
    fail("immediate predecessor has no active accepted origin");
  }
  assertExactKeys(
    origin,
    [
      "bundleId",
      "manifest",
      "commitMarker",
      "plan",
      "batch",
      "checkpoints",
    ],
    ["sourceSnapshotProof"],
    "previous accepted origin",
  );
  const plan = assertTaskMapRefreshPlan(origin.plan);
  const batch = assertTaskMapReadyBatch(plan, origin.batch);
  if (
    !canonicalEqual(plan, origin.plan)
    || !canonicalEqual(batch, origin.batch)
  ) {
    fail("previous accepted origin plan or batch is not canonical");
  }
  if (origin.sourceSnapshotProof === undefined) {
    fail("previous accepted origin has no source-snapshot proof");
  }
  const proof = origin.sourceSnapshotProof;
  if (
    origin.bundleId !== accepted.bundleId
    || origin.manifest.bundleId !== accepted.bundleId
    || origin.commitMarker.bundleId !== accepted.bundleId
    || origin.plan.planId !== accepted.planId
    || origin.manifest.planId !== accepted.planId
    || origin.batch.batchId !== accepted.batchId
    || origin.manifest.batchId !== accepted.batchId
    || origin.plan.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.batch.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.manifest.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.batch.publication.state !== "complete"
    || origin.batch.publication.eligible
    || origin.plan.ownerScopeDigest !== predecessorRef.ownerScopeDigest
    || origin.manifest.ownerScopeDigest !== predecessorRef.ownerScopeDigest
    || origin.checkpoints.ownerScopeDigest !== predecessorRef.ownerScopeDigest
    || previous.ownerScopeDigest !== predecessorRef.ownerScopeDigest
    || previous.origin.currentGeneration !== predecessorRef.generation
    || previous.origin.currentRefId !== predecessorRef.refId
    || previous.origin.acceptedOriginGeneration
      !== accepted.originGeneration
    || previous.origin.acceptedStateDigest !== accepted.acceptedStateDigest
    || previous.origin.bundleId !== accepted.bundleId
    || previous.origin.planId !== accepted.planId
    || previous.origin.batchId !== accepted.batchId
    || previous.origin.sourceSnapshotProofId
      !== proof.sourceSnapshotProofId
    || previous.sourceSnapshotId !== proof.snapshotId
    || previous.sourceSnapshotDigest !== proof.sourceSnapshotDigest
    || previous.replayClosure.sourceSnapshotDigest
      !== proof.sourceSnapshotDigest
    || previous.replayClosure.sourceSemanticInputDigest
      !== proof.semanticInputDigest
    || previous.origin.replayClosureDigest
      !== taskMapContractDigest(previous.replayClosure)
    || previous.origin.acceptedOriginReplayDigest
      !== origin.plan.deterministicReplayDigest
    || predecessorRef.operation === "rollback"
    || previous.origin.replayClosureDigest
      !== previous.origin.acceptedOriginReplayDigest
  ) {
    fail(
      "previous sidecar does not close to the immediate predecessor bundle",
    );
  }
}

function buildReplayClosure(
  ownerScopeDigest: string,
  sourceSnapshot: TaskMapSourceSnapshotV1,
  projection: TaskMapProjectionV1,
  projectionDigest: string,
  identityProofDigest: string,
  semanticRowsDigest: string,
): TaskMapIdentityDedupeReplayClosureV1 {
  return {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION,
    ownerScopeDigest,
    sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    sourceSemanticInputDigest: sourceSnapshot.semanticInputDigest,
    projectionDigest,
    projectionRunId: projection.runId,
    projectionInputDigest: projection.inputDigest,
    suppliedIdentityProofDigest: identityProofDigest,
    semanticRowsDigest,
  };
}

function envelopesById(
  snapshot: TaskMapSourceSnapshotV1,
): Map<string, TaskMapSourceEnvelopeV1> {
  const result = new Map<string, TaskMapSourceEnvelopeV1>();
  for (const envelope of snapshot.envelopes) {
    if (result.has(envelope.envelopeId)) {
      fail("source snapshot repeats an envelope ID");
    }
    result.set(envelope.envelopeId, envelope);
  }
  return result;
}

function envelopesByObjectKey(
  snapshot: TaskMapSourceSnapshotV1,
): Map<string, TaskMapSourceEnvelopeV1[]> {
  const result = new Map<string, TaskMapSourceEnvelopeV1[]>();
  for (const envelope of snapshot.envelopes) {
    const rows = result.get(envelope.sourceObjectKeyDigest) ?? [];
    rows.push(envelope);
    result.set(envelope.sourceObjectKeyDigest, rows);
  }
  for (const rows of result.values()) {
    rows.sort((left, right) => compareText(
      left.sourceIdentityDigest,
      right.sourceIdentityDigest,
    ));
  }
  return result;
}

type DerivedIdentityDecisionProofs = {
  digest: string;
  sessionProofByEnvelopeId: Map<string, string>;
  lifecycleProofByCanonicalKey: Map<string, string>;
};

function sourceDecisionFact(
  envelope: TaskMapSourceEnvelopeV1,
): Record<string, unknown> {
  return {
    envelopeId: envelope.envelopeId,
    sourceKind: envelope.sourceKind,
    objectType: envelope.objectType,
    sourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
    bindingDigest: taskMapContractDigest(envelope.binding),
    authorityDigest: taskMapContractDigest(envelope.authority),
  };
}

function decisionProofDigest(
  reviewAttestationDigest: string,
  decisionKind: "alias" | "work_binding" | "session_lineage" | "lifecycle",
  decision: unknown,
  referencedFacts: unknown,
): string {
  return taskMapContractDigest({
    contractVersion: TASKMAP_IDENTITY_DECISION_PROOF_VERSION,
    policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
    reviewAttestationDigest,
    decisionKind,
    decision,
    referencedFacts,
  });
}

function deriveIdentityDecisionProofs(
  reviewAttestationDigest: string,
  sourceSnapshot: TaskMapSourceSnapshotV1,
  projection: TaskMapProjectionV1,
  input: Pick<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "aliases"
    | "workBindings"
    | "sessionLineage"
    | "lifecycleAdjudications"
  >,
): DerivedIdentityDecisionProofs {
  assertDigest(reviewAttestationDigest, "review attestation");
  const byEnvelopeId = envelopesById(sourceSnapshot);
  const byObjectKey = envelopesByObjectKey(sourceSnapshot);
  const taskRows = new Map(
    projection.tasks.map((row) => [row.id, row]),
  );
  const rejectionRows = new Map(
    projection.rejections
      .filter((row) => row.kind === "task")
      .map((row) => [row.proposalId, row]),
  );

  assertArrayBound(
    input.aliases,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxAliases,
    "aliases",
  );
  const aliasProofs = input.aliases.map((alias, index) => {
    assertExactKeys(
      alias,
      [
        "identityKind",
        "canonicalSourceObjectKeyDigest",
        "aliasSourceObjectKeyDigest",
      ],
      [],
      `alias ${index}`,
    );
    if (alias.identityKind !== "work" && alias.identityKind !== "session") {
      fail(`alias ${index} has an unsupported identity kind`);
    }
    assertDigest(
      alias.canonicalSourceObjectKeyDigest,
      `alias ${index} first member`,
    );
    assertDigest(
      alias.aliasSourceObjectKeyDigest,
      `alias ${index} second member`,
    );
    const memberSourceObjectKeyDigests = sortedUnique([
      alias.canonicalSourceObjectKeyDigest,
      alias.aliasSourceObjectKeyDigest,
    ], `alias ${index} members`);
    const referencedFacts = memberSourceObjectKeyDigests.flatMap((key) => (
      (byObjectKey.get(key) ?? []).map(sourceDecisionFact)
    )).sort((left, right) => compareText(
      String(left.envelopeId),
      String(right.envelopeId),
    ));
    if (referencedFacts.length === 0) {
      fail(`alias ${index} has no referenced source facts`);
    }
    const decision = {
      identityKind: alias.identityKind,
      memberSourceObjectKeyDigests,
    };
    return {
      identityKind: alias.identityKind,
      memberSourceObjectKeyDigests,
      proofDigest: decisionProofDigest(
        reviewAttestationDigest,
        "alias",
        decision,
        referencedFacts,
      ),
    };
  }).sort((left, right) => (
    compareText(left.identityKind, right.identityKind)
    || compareText(
      left.memberSourceObjectKeyDigests[0]!,
      right.memberSourceObjectKeyDigests[0]!,
    )
    || compareText(
      left.memberSourceObjectKeyDigests[1]!,
      right.memberSourceObjectKeyDigests[1]!,
    )
  ));

  assertArrayBound(
    input.workBindings,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxWorkBindings,
    "work bindings",
  );
  const workBindingProofs = input.workBindings.map((binding, index) => {
    assertExactKeys(
      binding,
      ["projectionKind", "projectionId", "sourceEnvelopeId"],
      [],
      `work binding ${index}`,
    );
    if (
      binding.projectionKind !== "task"
      && binding.projectionKind !== "rejection"
    ) {
      fail(`work binding ${index} has an unsupported projection kind`);
    }
    assertSafeId(
      binding.projectionId,
      `work binding ${index} projection ID`,
    );
    assertSafeId(
      binding.sourceEnvelopeId,
      `work binding ${index} envelope ID`,
    );
    const envelope = byEnvelopeId.get(binding.sourceEnvelopeId);
    const projectionRow = binding.projectionKind === "task"
      ? taskRows.get(binding.projectionId)
      : rejectionRows.get(binding.projectionId);
    if (envelope === undefined || projectionRow === undefined) {
      fail(`work binding ${index} has absent referenced facts`);
    }
    const decision = {
      projectionKind: binding.projectionKind,
      projectionId: binding.projectionId,
      sourceEnvelopeId: binding.sourceEnvelopeId,
    };
    return {
      ...decision,
      proofDigest: decisionProofDigest(
        reviewAttestationDigest,
        "work_binding",
        decision,
        {
          source: sourceDecisionFact(envelope),
          projectionRowDigest: taskMapContractDigest(projectionRow),
        },
      ),
    };
  }).sort((left, right) => (
    compareText(left.projectionKind, right.projectionKind)
    || compareText(left.projectionId, right.projectionId)
    || compareText(left.sourceEnvelopeId, right.sourceEnvelopeId)
  ));

  assertArrayBound(
    input.sessionLineage,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxSessionLineage,
    "session lineage",
  );
  const sessionProofByEnvelopeId = new Map<string, string>();
  const sessionProofs = input.sessionLineage.map((lineage, index) => {
    assertExactKeys(
      lineage,
      ["sessionEnvelopeId", "role"],
      ["workSourceObjectKeyDigest", "parentSessionEnvelopeId"],
      `session lineage ${index}`,
    );
    assertSafeId(
      lineage.sessionEnvelopeId,
      `session lineage ${index} envelope ID`,
    );
    const envelope = byEnvelopeId.get(lineage.sessionEnvelopeId);
    if (envelope === undefined) {
      fail(`session lineage ${index} has no referenced source fact`);
    }
    const decision = {
      sessionEnvelopeId: lineage.sessionEnvelopeId,
      role: lineage.role,
      ...(lineage.workSourceObjectKeyDigest === undefined
        ? {}
        : {
          workSourceObjectKeyDigest:
            lineage.workSourceObjectKeyDigest,
        }),
      ...(lineage.parentSessionEnvelopeId === undefined
        ? {}
        : {
          parentSessionEnvelopeId:
            lineage.parentSessionEnvelopeId,
        }),
    };
    const proofDigest = decisionProofDigest(
      reviewAttestationDigest,
      "session_lineage",
      decision,
      {
        session: sourceDecisionFact(envelope),
        ...(lineage.parentSessionEnvelopeId === undefined
          ? {}
          : {
            parentSession:
              byEnvelopeId.get(lineage.parentSessionEnvelopeId) === undefined
                ? null
                : sourceDecisionFact(
                  byEnvelopeId.get(lineage.parentSessionEnvelopeId)!,
                ),
          }),
        ...(lineage.workSourceObjectKeyDigest === undefined
          ? {}
          : {
            workSources:
              (byObjectKey.get(lineage.workSourceObjectKeyDigest) ?? [])
                .map(sourceDecisionFact),
          }),
      },
    );
    if (sessionProofByEnvelopeId.has(lineage.sessionEnvelopeId)) {
      fail("session envelope has more than one derived proof");
    }
    sessionProofByEnvelopeId.set(lineage.sessionEnvelopeId, proofDigest);
    return { ...decision, proofDigest };
  }).sort((left, right) => compareText(
    left.sessionEnvelopeId,
    right.sessionEnvelopeId,
  ));

  assertArrayBound(
    input.lifecycleAdjudications,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxLifecycleAdjudications,
    "lifecycle adjudications",
  );
  const lifecycleProofByCanonicalKey = new Map<string, string>();
  const lifecycleProofs = input.lifecycleAdjudications.map(
    (adjudication, index) => {
      const decision = {
        canonicalSourceObjectKeyDigest:
          adjudication.canonicalSourceObjectKeyDigest,
        previousState: adjudication.previousState,
        currentState: adjudication.currentState,
        ...(adjudication.previousSourceIdentityDigest === undefined
          ? {}
          : {
            previousSourceIdentityDigest:
              adjudication.previousSourceIdentityDigest,
          }),
        currentSourceIdentityDigest:
          adjudication.currentSourceIdentityDigest,
        adjudicatedDelta: adjudication.adjudicatedDelta,
      };
      const currentEnvelope = sourceSnapshot.envelopes.find((envelope) => (
        envelope.sourceIdentityDigest
          === adjudication.currentSourceIdentityDigest
      ));
      const proofDigest = decisionProofDigest(
        reviewAttestationDigest,
        "lifecycle",
        decision,
        {
          currentSource:
            currentEnvelope === undefined
              ? null
              : sourceDecisionFact(currentEnvelope),
          canonicalWorkSources:
            (
              byObjectKey.get(
                adjudication.canonicalSourceObjectKeyDigest,
              ) ?? []
            ).map(sourceDecisionFact),
          projectionDigest:
            taskMapContractDigest(projection),
        },
      );
      if (
        lifecycleProofByCanonicalKey.has(
          adjudication.canonicalSourceObjectKeyDigest,
        )
      ) {
        fail(`lifecycle adjudication ${index} repeats a proof identity`);
      }
      lifecycleProofByCanonicalKey.set(
        adjudication.canonicalSourceObjectKeyDigest,
        proofDigest,
      );
      return { ...decision, adjudicationDigest: proofDigest };
    },
  ).sort((left, right) => compareText(
    left.canonicalSourceObjectKeyDigest,
    right.canonicalSourceObjectKeyDigest,
  ));

  return {
    digest: taskMapContractDigest({
      contractVersion: TASKMAP_IDENTITY_DECISION_PROOF_VERSION,
      policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
      reviewAttestationDigest,
      aliasProofs,
      workBindingProofs,
      sessionProofs,
      lifecycleProofs,
    }),
    sessionProofByEnvelopeId,
    lifecycleProofByCanonicalKey,
  };
}

function normalizeAliases(
  values: TaskMapIdentityAliasV1[],
  byObjectKey: Map<string, TaskMapSourceEnvelopeV1[]>,
): {
  work: Map<string, string>;
  session: Map<string, string>;
} {
  assertArrayBound(
    values,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxAliases,
    "aliases",
  );
  const maps = {
    work: new Map<string, string>(),
    session: new Map<string, string>(),
  };
  const usedMembers = {
    work: new Set<string>(),
    session: new Set<string>(),
  };
  for (const [index, alias] of values.entries()) {
    assertExactKeys(
      alias,
      [
        "identityKind",
        "canonicalSourceObjectKeyDigest",
        "aliasSourceObjectKeyDigest",
      ],
      [],
      `alias ${index}`,
    );
    if (alias.identityKind !== "work" && alias.identityKind !== "session") {
      fail(`alias ${index} has an unsupported identity kind`);
    }
    assertDigest(
      alias.canonicalSourceObjectKeyDigest,
      `alias ${index} canonical key`,
    );
    assertDigest(alias.aliasSourceObjectKeyDigest, `alias ${index} alias key`);
    if (
      alias.canonicalSourceObjectKeyDigest
        === alias.aliasSourceObjectKeyDigest
    ) {
      fail(`alias ${index} cannot point to itself`);
    }
    const canonicalRows = byObjectKey.get(
      alias.canonicalSourceObjectKeyDigest,
    );
    const aliasRows = byObjectKey.get(alias.aliasSourceObjectKeyDigest);
    if (canonicalRows === undefined || aliasRows === undefined) {
      fail(`alias ${index} references an absent source identity`);
    }
    const expectedObjectType = alias.identityKind === "session"
      ? "agent_session"
      : undefined;
    if (
      expectedObjectType === undefined
        ? (
          canonicalRows.some((row) => !WORK_OBJECT_TYPES.has(row.objectType))
          || aliasRows.some((row) => !WORK_OBJECT_TYPES.has(row.objectType))
        )
        : (
          canonicalRows.some((row) => row.objectType !== expectedObjectType)
          || aliasRows.some((row) => row.objectType !== expectedObjectType)
        )
    ) {
      fail(`alias ${index} crosses incompatible semantic object types`);
    }
    const canonicalKinds = new Set(canonicalRows.map((row) => row.sourceKind));
    const aliasKinds = new Set(aliasRows.map((row) => row.sourceKind));
    if (new Set([...canonicalKinds, ...aliasKinds]).size < 2) {
      fail(`alias ${index} is not an explicit cross-provider merge`);
    }
    const map = maps[alias.identityKind];
    const members = usedMembers[alias.identityKind];
    if (
      members.has(alias.canonicalSourceObjectKeyDigest)
      || members.has(alias.aliasSourceObjectKeyDigest)
    ) {
      fail(`alias ${index} repeats or chains an alias identity`);
    }
    const representative = [
      alias.canonicalSourceObjectKeyDigest,
      alias.aliasSourceObjectKeyDigest,
    ].sort(compareText)[0]!;
    for (const member of [
      alias.canonicalSourceObjectKeyDigest,
      alias.aliasSourceObjectKeyDigest,
    ]) {
      map.set(member, representative);
      members.add(member);
    }
  }
  return maps;
}

function canonicalKey(
  key: string,
  aliases: Map<string, string>,
): string {
  return aliases.get(key) ?? key;
}

function normalizeWorkBindings(
  values: TaskMapProjectionWorkBindingV1[],
  projection: TaskMapProjectionV1,
  byEnvelopeId: Map<string, TaskMapSourceEnvelopeV1>,
  byObjectKey: Map<string, TaskMapSourceEnvelopeV1[]>,
  workAliases: Map<string, string>,
): Map<string, {
  sourceKeys: Set<string>;
  sourceIdentityDigests: Set<string>;
  envelopeIds: Set<string>;
  projectionReferences: Map<string, TaskMapIdentityProjectionReferenceV1>;
}> {
  assertArrayBound(
    values,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxWorkBindings,
    "work bindings",
  );
  const taskIds = new Set(projection.tasks.map((task) => task.id));
  const taskRejectionIds = new Set(
    projection.rejections
      .filter((rejection) => rejection.kind === "task")
      .map((rejection) => rejection.proposalId),
  );
  const boundTasks = new Set<string>();
  const references = new Set<string>();
  const groups = new Map<string, {
    sourceKeys: Set<string>;
    sourceIdentityDigests: Set<string>;
    envelopeIds: Set<string>;
    projectionReferences:
      Map<string, TaskMapIdentityProjectionReferenceV1>;
  }>();
  for (const [index, binding] of values.entries()) {
    assertExactKeys(
      binding,
      ["projectionKind", "projectionId", "sourceEnvelopeId"],
      [],
      `work binding ${index}`,
    );
    if (
      binding.projectionKind !== "task"
      && binding.projectionKind !== "rejection"
    ) {
      fail(`work binding ${index} has an unsupported projection kind`);
    }
    assertSafeId(binding.projectionId, `work binding ${index} projection ID`);
    assertSafeId(
      binding.sourceEnvelopeId,
      `work binding ${index} envelope ID`,
    );
    const referenceKey =
      `${binding.projectionKind}:${binding.projectionId}`;
    if (references.has(referenceKey)) {
      fail("projection work reference is bound more than once");
    }
    references.add(referenceKey);
    if (
      binding.projectionKind === "task"
        ? !taskIds.has(binding.projectionId)
        : !taskRejectionIds.has(binding.projectionId)
    ) {
      fail(`work binding ${index} references an absent projection row`);
    }
    if (binding.projectionKind === "task") {
      boundTasks.add(binding.projectionId);
    }
    const envelope = byEnvelopeId.get(binding.sourceEnvelopeId);
    if (
      envelope === undefined
      || !WORK_OBJECT_TYPES.has(envelope.objectType)
    ) {
      fail(`work binding ${index} does not reference a work source envelope`);
    }
    const canonical = canonicalKey(
      envelope.sourceObjectKeyDigest,
      workAliases,
    );
    const group = groups.get(canonical) ?? {
      sourceKeys: new Set<string>(),
      sourceIdentityDigests: new Set<string>(),
      envelopeIds: new Set<string>(),
      projectionReferences:
        new Map<string, TaskMapIdentityProjectionReferenceV1>(),
    };
    group.sourceKeys.add(envelope.sourceObjectKeyDigest);
    group.sourceIdentityDigests.add(envelope.sourceIdentityDigest);
    group.envelopeIds.add(envelope.envelopeId);
    const projectionRow = binding.projectionKind === "task"
      ? projection.tasks.find((task) => task.id === binding.projectionId)!
      : projection.rejections.find((rejection) => (
        rejection.kind === "task"
        && rejection.proposalId === binding.projectionId
      ))!;
    const projectionRowDigest = taskMapContractDigest(projectionRow);
    group.projectionReferences.set(referenceKey, {
      kind: binding.projectionKind,
      id: stableId("tmprojectionref", {
        kind: binding.projectionKind,
        projectionRowDigest,
      }),
      projectionRowDigest,
    });
    groups.set(canonical, group);
  }
  if (
    taskIds.size !== boundTasks.size
    || [...taskIds].some((taskId) => !boundTasks.has(taskId))
  ) {
    fail("every projected task must cross the identity/dedupe barrier exactly once");
  }
  for (const [objectKey, envelopes] of byObjectKey) {
    const canonical = canonicalKey(objectKey, workAliases);
    const group = groups.get(canonical);
    if (
      group === undefined
      || envelopes.some((envelope) => !WORK_OBJECT_TYPES.has(envelope.objectType))
    ) {
      continue;
    }
    group.sourceKeys.add(objectKey);
    for (const envelope of envelopes) {
      group.sourceIdentityDigests.add(envelope.sourceIdentityDigest);
      group.envelopeIds.add(envelope.envelopeId);
    }
  }
  for (const [aliasKey, canonicalKey] of workAliases) {
    const group = groups.get(canonicalKey);
    if (
      group === undefined
      || !group.sourceKeys.has(canonicalKey)
      || !group.sourceKeys.has(aliasKey)
    ) {
      fail("every explicit work alias must be consumed by one work group");
    }
  }
  return groups;
}

function validateLifecycleAdjudication(
  value: TaskMapLifecycleAdjudicationV1,
  index: number,
): void {
  assertExactKeys(
    value,
    [
      "canonicalSourceObjectKeyDigest",
      "previousState",
      "currentState",
      "currentSourceIdentityDigest",
      "adjudicatedDelta",
    ],
    ["previousSourceIdentityDigest"],
    `lifecycle adjudication ${index}`,
  );
  assertDigest(
    value.canonicalSourceObjectKeyDigest,
    `lifecycle adjudication ${index} work key`,
  );
  assertDigest(
    value.currentSourceIdentityDigest,
    `lifecycle adjudication ${index} current source identity`,
  );
  if (value.previousSourceIdentityDigest !== undefined) {
    assertDigest(
      value.previousSourceIdentityDigest,
      `lifecycle adjudication ${index} previous source identity`,
    );
  }
  if (
    !["absent", "open", "resolved", "superseded", "rejected"]
      .includes(value.previousState)
    || !["open", "resolved", "superseded", "rejected"]
      .includes(value.currentState)
    || !["open", "updated", "resolved", "superseded", "rejected", "no_op"]
      .includes(value.adjudicatedDelta)
  ) {
    fail(`lifecycle adjudication ${index} has an unsupported closed value`);
  }
  if (
    value.previousState === "absent"
      ? value.previousSourceIdentityDigest !== undefined
      : value.previousSourceIdentityDigest === undefined
  ) {
    fail(`lifecycle adjudication ${index} has inconsistent prior identity`);
  }
  if (
    value.previousState !== "absent"
    && TERMINAL_STATES.has(value.previousState)
    && value.currentState === "open"
  ) {
    fail("a terminal work variant cannot reopen");
  }
  const mechanical =
    (
      value.adjudicatedDelta === "open"
      && value.previousState === "absent"
      && value.currentState === "open"
    )
    || (
      value.adjudicatedDelta === "updated"
      && value.previousState !== "absent"
      && value.previousState === value.currentState
      && value.previousSourceIdentityDigest
        !== value.currentSourceIdentityDigest
    )
    || (
      value.adjudicatedDelta === "resolved"
      && value.previousState === "open"
      && value.currentState === "resolved"
    )
    || (
      value.adjudicatedDelta === "superseded"
      && (
        value.previousState === "open"
        || value.previousState === "resolved"
      )
      && value.currentState === "superseded"
    )
    || (
      value.adjudicatedDelta === "rejected"
      && (
        value.previousState === "absent"
        || value.previousState === "open"
      )
      && value.currentState === "rejected"
    )
    || (
      value.adjudicatedDelta === "no_op"
      && value.previousState !== "absent"
      && value.previousState === value.currentState
      && value.previousSourceIdentityDigest
        === value.currentSourceIdentityDigest
    );
  if (!mechanical) {
    fail(
      `lifecycle adjudication ${index} is not a mechanically closed delta`,
    );
  }
}

function assertPreviousLifecycleClosure(
  previous: TaskMapIdentityDedupeProjectionV1 | null,
  previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle | null,
  ownerScopeDigest: string,
  currentGeneration: string,
  generations: TaskMapRefreshCurrentRefV1[],
  adjudications: TaskMapLifecycleAdjudicationV1[],
  lifecycleProofByCanonicalKey: Map<string, string>,
  currentWorkGroups: Map<string, {
    sourceKeys: Set<string>;
    sourceIdentityDigests: Set<string>;
  }>,
  isExplicitGenesis: boolean,
): void {
  if (previous === null) {
    if (
      previousAcceptedOrigin !== null
      || !isExplicitGenesis
      || adjudications.some((adjudication) => (
        adjudication.previousState !== "absent"
        || adjudication.previousSourceIdentityDigest !== undefined
      ))
    ) {
      fail(
        "previous sidecar may be null only for an explicit absent-state genesis",
      );
    }
    return;
  }
  if (previousAcceptedOrigin === null) {
    fail("a non-genesis previous sidecar requires its verified origin bundle");
  }
  const previousIndex = generations.findIndex((candidate) => (
    candidate.generation === previous.origin.currentGeneration
    && candidate.refId === previous.origin.currentRefId
  ));
  const predecessorRef = previousIndex < 0
    ? undefined
    : generations[previousIndex];
  if (
    predecessorRef === undefined
    || previous.ownerScopeDigest !== ownerScopeDigest
    || BigInt(previous.origin.currentGeneration)
      >= BigInt(currentGeneration)
    || generations.slice(previousIndex + 1, -1).some((candidate) => (
      candidate.operation !== "rollback"
    ))
  ) {
    fail(
      "previous sidecar is not the latest semantic predecessor across "
        + "rollback observations",
    );
  }
  assertPreviousAcceptedOrigin(
    previousAcceptedOrigin,
    previous,
    predecessorRef,
  );
  const priorLifecycleByEventId = new Map(
    previous.events
      .filter((event): event is TaskMapIdentityDedupeLifecycleEventV1 => (
        event.eventKind === "work_lifecycle"
      ))
      .map((event) => [event.eventId, event]),
  );
  const priorWorkByVariantKey = new Map<string, TaskMapIdentityDedupeWorkV1>();
  const priorWorkByVariantIdentity =
    new Map<string, TaskMapIdentityDedupeWorkV1>();
  for (const priorWork of previous.works) {
    for (const key of priorWork.variantSourceObjectKeyDigests) {
      priorWorkByVariantKey.set(key, priorWork);
    }
    for (const identity of priorWork.variantSourceIdentityDigests) {
      priorWorkByVariantIdentity.set(identity, priorWork);
    }
  }
  const continuedPriorWorkIds = new Map<string, string>();
  for (const adjudication of adjudications) {
    const currentGroup = currentWorkGroups.get(
      adjudication.canonicalSourceObjectKeyDigest,
    );
    if (currentGroup === undefined) {
      fail("lifecycle adjudication has no normalized current work group");
    }
    const touchedPriorWorks = new Map<string, TaskMapIdentityDedupeWorkV1>();
    for (const key of new Set([
      adjudication.canonicalSourceObjectKeyDigest,
      ...currentGroup.sourceKeys,
    ])) {
      const priorWork = priorWorkByVariantKey.get(key);
      if (priorWork !== undefined) {
        touchedPriorWorks.set(priorWork.workId, priorWork);
      }
    }
    for (const identity of currentGroup.sourceIdentityDigests) {
      const priorWork = priorWorkByVariantIdentity.get(identity);
      if (priorWork !== undefined) {
        touchedPriorWorks.set(priorWork.workId, priorWork);
      }
    }
    if (touchedPriorWorks.size > 1) {
      fail(
        "current work merges distinct prior lifecycle identities without "
          + "a reviewed migration",
      );
    }
    const priorWork = [...touchedPriorWorks.values()][0];
    if (priorWork === undefined) {
      if (
        adjudication.previousState !== "absent"
        || adjudication.previousSourceIdentityDigest !== undefined
      ) {
        fail("new canonical work must begin from an absent lifecycle state");
      }
      continue;
    }
    const currentVariantKeys = [...new Set([
      adjudication.canonicalSourceObjectKeyDigest,
      ...currentGroup.sourceKeys,
    ])].sort(compareText);
    if (
      adjudication.canonicalSourceObjectKeyDigest
        !== priorWork.canonicalSourceObjectKeyDigest
      || !canonicalEqual(
        currentVariantKeys,
        priorWork.variantSourceObjectKeyDigests,
      )
    ) {
      fail(
        "work alias membership cannot change without a reviewed migration",
      );
    }
    const priorContinuation = continuedPriorWorkIds.get(priorWork.workId);
    if (
      priorContinuation !== undefined
      && priorContinuation !== adjudication.canonicalSourceObjectKeyDigest
    ) {
      fail(
        "a prior lifecycle identity cannot split into multiple current works",
      );
    }
    continuedPriorWorkIds.set(
      priorWork.workId,
      adjudication.canonicalSourceObjectKeyDigest,
    );
    const priorLifecycle = priorLifecycleByEventId.get(
      priorWork.lifecycleEventId,
    );
    if (priorLifecycle === undefined) {
      fail("previous sidecar work has no closed lifecycle event");
    }
    const isExactReplay =
      adjudication.currentState === priorLifecycle.lifecycleState
      && adjudication.currentSourceIdentityDigest
        === priorLifecycle.sourceIdentityDigest
      && lifecycleProofByCanonicalKey.get(
        adjudication.canonicalSourceObjectKeyDigest,
      )
        === priorLifecycle.adjudicationDigest;
    if (isExactReplay) continue;
    if (
      adjudication.previousState !== priorLifecycle.lifecycleState
      || adjudication.previousSourceIdentityDigest
        !== priorLifecycle.sourceIdentityDigest
    ) {
      fail("lifecycle adjudication does not continue the previous sidecar");
    }
  }
  for (const priorWork of previous.works) {
    if (!continuedPriorWorkIds.has(priorWork.workId)) {
      fail("a prior work identity cannot disappear without lifecycle proof");
    }
  }
}

function assertPreviousSessionAliasContinuity(
  previous: TaskMapIdentityDedupeProjectionV1 | null,
  currentEvents: TaskMapIdentityDedupeEventV1[],
): void {
  if (previous === null) return;
  const previousSessions = previous.events.filter(
    (event): event is TaskMapIdentityDedupeSessionEventV1 => (
      event.eventKind === "session"
    ),
  );
  const currentSessions = currentEvents.filter(
    (event): event is TaskMapIdentityDedupeSessionEventV1 => (
      event.eventKind === "session"
    ),
  );
  const previousByIdentityKey =
    new Map<string, TaskMapIdentityDedupeSessionEventV1>();
  for (const event of previousSessions) {
    for (const key of event.identitySourceObjectKeyDigests) {
      const prior = previousByIdentityKey.get(key);
      if (prior !== undefined && prior.eventId !== event.eventId) {
        fail("previous sidecar repeats a session identity alias member");
      }
      previousByIdentityKey.set(key, event);
    }
  }
  const continued = new Map<string, string>();
  for (const event of currentSessions) {
    const touched = new Map<
      string,
      TaskMapIdentityDedupeSessionEventV1
    >();
    for (const key of event.identitySourceObjectKeyDigests) {
      const prior = previousByIdentityKey.get(key);
      if (prior !== undefined) touched.set(prior.eventId, prior);
    }
    if (touched.size > 1) {
      fail(
        "current session aliases merge prior identities without "
          + "a reviewed migration",
      );
    }
    const prior = [...touched.values()][0];
    if (prior === undefined) continue;
    const priorContinuation = continued.get(prior.eventId);
    if (
      priorContinuation !== undefined
      && priorContinuation !== event.eventId
    ) {
      fail(
        "a prior session alias identity cannot split without "
          + "a reviewed migration",
      );
    }
    if (
      event.canonicalSourceObjectKeyDigest
        !== prior.canonicalSourceObjectKeyDigest
      || event.corroboratesWorkId !== prior.corroboratesWorkId
      || !canonicalEqual(
        event.identitySourceObjectKeyDigests,
        prior.identitySourceObjectKeyDigests,
      )
    ) {
      fail(
        "session alias membership or work binding cannot change without "
          + "a reviewed migration",
      );
    }
    continued.set(prior.eventId, event.eventId);
  }
  for (const prior of previousSessions) {
    if (!continued.has(prior.eventId)) {
      fail(
        "a prior session alias identity cannot disappear without "
          + "a reviewed migration",
      );
    }
  }
}

type SessionRoleDisposition = {
  role: "accepted";
  eventId: string;
  canonicalSourceObjectKeyDigest: string;
  corroboratesWorkId: string;
} | {
  role: "rejected";
  rejectionId: string;
  reasonCode:
    TaskMapIdentityDedupeRejectedVariantV1["reasonCode"];
};

function sessionRoleDispositions(
  events: TaskMapIdentityDedupeEventV1[],
  rejectedVariants: TaskMapIdentityDedupeRejectedVariantV1[],
  label: string,
): Map<string, SessionRoleDisposition> {
  const dispositions = new Map<string, SessionRoleDisposition>();
  const add = (
    sourceObjectKeyDigest: string,
    disposition: SessionRoleDisposition,
  ): void => {
    if (dispositions.has(sourceObjectKeyDigest)) {
      fail(`${label} repeats a stable session role identity`);
    }
    dispositions.set(sourceObjectKeyDigest, disposition);
  };
  for (const event of events) {
    if (event.eventKind !== "session") continue;
    for (const sourceObjectKeyDigest of
      event.variantSourceObjectKeyDigests) {
      add(sourceObjectKeyDigest, {
        role: "accepted",
        eventId: event.eventId,
        canonicalSourceObjectKeyDigest:
          event.canonicalSourceObjectKeyDigest,
        corroboratesWorkId: event.corroboratesWorkId,
      });
    }
  }
  for (const rejected of rejectedVariants) {
    add(rejected.sourceObjectKeyDigest, {
      role: "rejected",
      rejectionId: rejected.rejectionId,
      reasonCode: rejected.reasonCode,
    });
  }
  return dispositions;
}

function assertPreviousSessionRoleContinuity(
  previous: TaskMapIdentityDedupeProjectionV1 | null,
  currentEvents: TaskMapIdentityDedupeEventV1[],
  currentRejectedVariants: TaskMapIdentityDedupeRejectedVariantV1[],
): void {
  if (previous === null) return;
  const prior = sessionRoleDispositions(
    previous.events,
    previous.rejectedVariants,
    "previous sidecar",
  );
  const current = sessionRoleDispositions(
    currentEvents,
    currentRejectedVariants,
    "current sidecar",
  );
  for (const [sourceObjectKeyDigest, previousDisposition] of prior) {
    const currentDisposition = current.get(sourceObjectKeyDigest);
    if (currentDisposition === undefined) {
      fail(
        "a prior stable session role identity cannot disappear or rekey "
          + "without a reviewed migration",
      );
    }
    if (currentDisposition.role !== previousDisposition.role) {
      fail(
        "a stable session identity cannot change its accepted/rejected "
          + "role without a reviewed migration",
      );
    }
    if (
      previousDisposition.role === "accepted"
      && currentDisposition.role === "accepted"
      && (
        currentDisposition.eventId !== previousDisposition.eventId
        || currentDisposition.canonicalSourceObjectKeyDigest
          !== previousDisposition.canonicalSourceObjectKeyDigest
        || currentDisposition.corroboratesWorkId
          !== previousDisposition.corroboratesWorkId
      )
    ) {
      fail(
        "an accepted session variant cannot change its canonical session "
          + "or work binding without a reviewed migration",
      );
    }
    if (
      previousDisposition.role === "rejected"
      && currentDisposition.role === "rejected"
      && (
        currentDisposition.rejectionId
          !== previousDisposition.rejectionId
        || currentDisposition.reasonCode
          !== previousDisposition.reasonCode
      )
    ) {
      fail(
        "a rejected session identity cannot change its stable rejection "
          + "without a reviewed migration",
      );
    }
  }
}

function assertAdjacentSidecarLifecycleContinuity(
  previous: TaskMapIdentityDedupeProjectionV1,
  current: TaskMapIdentityDedupeProjectionV1,
): void {
  assertPreviousSessionAliasContinuity(previous, current.events);
  assertPreviousSessionRoleContinuity(
    previous,
    current.events,
    current.rejectedVariants,
  );
  const previousEvents = new Map(
    previous.events
      .filter((event): event is TaskMapIdentityDedupeLifecycleEventV1 => (
        event.eventKind === "work_lifecycle"
      ))
      .map((event) => [event.eventId, event]),
  );
  const currentEvents = new Map(
    current.events
      .filter((event): event is TaskMapIdentityDedupeLifecycleEventV1 => (
        event.eventKind === "work_lifecycle"
      ))
      .map((event) => [event.eventId, event]),
  );
  const previousWorkByVariantKey =
    new Map<string, TaskMapIdentityDedupeWorkV1>();
  const previousWorkByVariantIdentity =
    new Map<string, TaskMapIdentityDedupeWorkV1>();
  for (const work of previous.works) {
    for (const key of work.variantSourceObjectKeyDigests) {
      previousWorkByVariantKey.set(key, work);
    }
    for (const identity of work.variantSourceIdentityDigests) {
      previousWorkByVariantIdentity.set(identity, work);
    }
  }
  const currentDeltas = new Map(current.lifecycleDeltas.map((delta) => [
    delta.workId,
    delta,
  ]));
  const continuedPreviousWorkIds = new Map<string, string>();
  for (const currentWork of current.works) {
    const touchedPreviousWorks =
      new Map<string, TaskMapIdentityDedupeWorkV1>();
    for (const key of currentWork.variantSourceObjectKeyDigests) {
      const previousWork = previousWorkByVariantKey.get(key);
      if (previousWork !== undefined) {
        touchedPreviousWorks.set(previousWork.workId, previousWork);
      }
    }
    for (const identity of currentWork.variantSourceIdentityDigests) {
      const previousWork = previousWorkByVariantIdentity.get(identity);
      if (previousWork !== undefined) {
        touchedPreviousWorks.set(previousWork.workId, previousWork);
      }
    }
    if (touchedPreviousWorks.size > 1) {
      fail("stored sidecar continuity merges distinct prior work identities");
    }
    const previousWork = [...touchedPreviousWorks.values()][0];
    const currentDelta = currentDeltas.get(currentWork.workId)!;
    if (previousWork === undefined) {
      if (
        currentDelta.previousState !== "absent"
        || currentDelta.previousSourceIdentityDigest !== undefined
      ) {
        fail("stored new work identity does not begin from absent state");
      }
      continue;
    }
    if (
      currentWork.canonicalSourceObjectKeyDigest
        !== previousWork.canonicalSourceObjectKeyDigest
      || !canonicalEqual(
        currentWork.variantSourceObjectKeyDigests,
        previousWork.variantSourceObjectKeyDigests,
      )
    ) {
      fail("stored work alias membership changed without reviewed migration");
    }
    const priorContinuation = continuedPreviousWorkIds.get(
      previousWork.workId,
    );
    if (
      priorContinuation !== undefined
      && priorContinuation !== currentWork.workId
    ) {
      fail("stored sidecar continuity splits a prior work identity");
    }
    continuedPreviousWorkIds.set(previousWork.workId, currentWork.workId);
    const previousEvent = previousEvents.get(
      previousWork.lifecycleEventId,
    )!;
    const currentEvent = currentEvents.get(currentWork.lifecycleEventId)!;
    if (
      TERMINAL_STATES.has(previousEvent.lifecycleState)
      && currentEvent.lifecycleState === "open"
    ) {
      fail("stored sidecar continuity reopens a terminal work");
    }
    const exactReplay = (
      previousEvent.lifecycleState === currentEvent.lifecycleState
      && previousEvent.sourceIdentityDigest
        === currentEvent.sourceIdentityDigest
      && previousEvent.adjudicationDigest
        === currentEvent.adjudicationDigest
    );
    if (exactReplay) continue;
    if (
      currentDelta.previousState !== previousEvent.lifecycleState
      || currentDelta.previousSourceIdentityDigest
        !== previousEvent.sourceIdentityDigest
    ) {
      fail(
        "stored sidecar lifecycle does not continue its adjacent predecessor",
      );
    }
  }
  for (const previousWork of previous.works) {
    if (!continuedPreviousWorkIds.has(previousWork.workId)) {
      fail("stored sidecar continuity drops a prior work identity");
    }
  }
}

function buildLifecycle(
  values: TaskMapLifecycleAdjudicationV1[],
  workGroups: Map<string, {
    sourceKeys: Set<string>;
    sourceIdentityDigests: Set<string>;
    envelopeIds: Set<string>;
    projectionReferences:
      Map<string, TaskMapIdentityProjectionReferenceV1>;
  }>,
  lifecycleProofByCanonicalKey: Map<string, string>,
): {
  events: TaskMapIdentityDedupeLifecycleEventV1[];
  deltas: TaskMapIdentityDedupeLifecycleDeltaV1[];
  byWorkKey: Map<string, {
    event: TaskMapIdentityDedupeLifecycleEventV1;
    delta: TaskMapIdentityDedupeLifecycleDeltaV1;
  }>;
} {
  assertArrayBound(
    values,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxLifecycleAdjudications,
    "lifecycle adjudications",
  );
  const byWorkKey = new Map<string, {
    event: TaskMapIdentityDedupeLifecycleEventV1;
    delta: TaskMapIdentityDedupeLifecycleDeltaV1;
  }>();
  for (const [index, adjudication] of values.entries()) {
    validateLifecycleAdjudication(adjudication, index);
    const group = workGroups.get(adjudication.canonicalSourceObjectKeyDigest);
    if (group === undefined) {
      fail(`lifecycle adjudication ${index} references a noncanonical work`);
    }
    if (byWorkKey.has(adjudication.canonicalSourceObjectKeyDigest)) {
      fail("canonical work has more than one lifecycle adjudication");
    }
    if (
      !group.sourceIdentityDigests.has(
        adjudication.currentSourceIdentityDigest,
      )
    ) {
      fail("current lifecycle identity is absent from the work variants");
    }
    const projectionKinds = new Set(
      [...group.projectionReferences.values()].map((reference) => (
        reference.kind
      )),
    );
    if (projectionKinds.size !== 1) {
      fail(
        "canonical work has mixed task/rejection projection dispositions",
      );
    }
    if (
      adjudication.currentState === "rejected"
        ? !projectionKinds.has("rejection")
        : !projectionKinds.has("task")
    ) {
      fail("lifecycle adjudication does not match the supplied projection row");
    }
    const adjudicationDigest = lifecycleProofByCanonicalKey.get(
      adjudication.canonicalSourceObjectKeyDigest,
    );
    if (adjudicationDigest === undefined) {
      fail("lifecycle adjudication has no internally derived proof");
    }
    const workId = stableId("tmwork", {
      policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
      canonicalSourceObjectKeyDigest:
        adjudication.canonicalSourceObjectKeyDigest,
    });
    const eventCore = {
      workId,
      sourceIdentityDigest: adjudication.currentSourceIdentityDigest,
      lifecycleState: adjudication.currentState,
      adjudicationDigest,
    };
    const event: TaskMapIdentityDedupeLifecycleEventV1 = {
      eventKind: "work_lifecycle",
      eventId: stableId("tmlifecycleevent", eventCore),
      ...eventCore,
    };
    const deltaCore = {
      workId,
      previousState: adjudication.previousState,
      currentState: adjudication.currentState,
      ...(adjudication.previousSourceIdentityDigest === undefined
        ? {}
        : {
          previousSourceIdentityDigest:
            adjudication.previousSourceIdentityDigest,
        }),
      currentSourceIdentityDigest:
        adjudication.currentSourceIdentityDigest,
      adjudicatedDelta: adjudication.adjudicatedDelta,
      adjudicationDigest,
      lifecycleEventId: event.eventId,
    };
    const delta: TaskMapIdentityDedupeLifecycleDeltaV1 = {
      deltaId: stableId("tmlifecycledelta", deltaCore),
      ...deltaCore,
    };
    byWorkKey.set(adjudication.canonicalSourceObjectKeyDigest, {
      event,
      delta,
    });
  }
  if (byWorkKey.size !== workGroups.size) {
    fail("every canonical work must have one supplied lifecycle adjudication");
  }
  const events = [...byWorkKey.values()]
    .map((value) => value.event)
    .sort((left, right) => compareText(left.eventId, right.eventId));
  const deltas = [...byWorkKey.values()]
    .map((value) => value.delta)
    .sort((left, right) => compareText(left.deltaId, right.deltaId));
  return { events, deltas, byWorkKey };
}

function normalizeSessionLineage(
  values: TaskMapSessionLineageV1[],
  snapshot: TaskMapSourceSnapshotV1,
  byEnvelopeId: Map<string, TaskMapSourceEnvelopeV1>,
  workAliases: Map<string, string>,
  sessionAliases: Map<string, string>,
  workIdByCanonicalKey: Map<string, string>,
  sessionProofByEnvelopeId: Map<string, string>,
): {
  events: TaskMapIdentityDedupeSessionEventV1[];
  rejected: TaskMapIdentityDedupeRejectedVariantV1[];
  eventIdsByWorkId: Map<string, string[]>;
} {
  assertArrayBound(
    values,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxSessionLineage,
    "session lineage",
  );
  const declarations = new Map<string, TaskMapSessionLineageV1>();
  for (const [index, lineage] of values.entries()) {
    assertExactKeys(
      lineage,
      ["sessionEnvelopeId", "role"],
      ["workSourceObjectKeyDigest", "parentSessionEnvelopeId"],
      `session lineage ${index}`,
    );
    assertSafeId(
      lineage.sessionEnvelopeId,
      `session lineage ${index} envelope ID`,
    );
    if (!["root", "subagent", "wrapper"].includes(lineage.role)) {
      fail(`session lineage ${index} has an unsupported role`);
    }
    const envelope = byEnvelopeId.get(lineage.sessionEnvelopeId);
    if (
      envelope === undefined
      || envelope.objectType !== "agent_session"
      || !AGENT_SOURCE_KINDS.has(envelope.sourceKind)
    ) {
      fail(`session lineage ${index} does not reference a local agent session`);
    }
    if (declarations.has(lineage.sessionEnvelopeId)) {
      fail("session envelope has more than one lineage declaration");
    }
    if (lineage.role === "root") {
      if (
        lineage.workSourceObjectKeyDigest === undefined
        || lineage.parentSessionEnvelopeId !== undefined
      ) {
        fail("root sessions require only an explicit work corroboration link");
      }
      assertDigest(
        lineage.workSourceObjectKeyDigest,
        "root session work identity",
      );
    } else if (lineage.role === "subagent") {
      if (
        lineage.parentSessionEnvelopeId === undefined
        || lineage.workSourceObjectKeyDigest !== undefined
      ) {
        fail("subagents require only an explicit delegation parent");
      }
      assertSafeId(
        lineage.parentSessionEnvelopeId,
        "subagent parent session ID",
      );
    } else if (
      lineage.workSourceObjectKeyDigest !== undefined
      || lineage.parentSessionEnvelopeId !== undefined
    ) {
      fail("transport wrappers cannot claim work or delegation identity");
    }
    declarations.set(lineage.sessionEnvelopeId, lineage);
  }
  const sessionEnvelopeIds = snapshot.envelopes
    .filter((envelope) => (
      envelope.objectType === "agent_session"
      && AGENT_SOURCE_KINDS.has(envelope.sourceKind)
    ))
    .map((envelope) => envelope.envelopeId);
  if (
    sessionEnvelopeIds.length !== declarations.size
    || sessionEnvelopeIds.some((id) => !declarations.has(id))
  ) {
    fail("every local session envelope requires explicit lineage adjudication");
  }
  const declaredRootKeys = new Set<string>();
  for (const lineage of declarations.values()) {
    if (lineage.role === "root") {
      declaredRootKeys.add(
        byEnvelopeId.get(lineage.sessionEnvelopeId)!
          .sourceObjectKeyDigest,
      );
    }
  }
  for (const [aliasKey, canonicalKey] of sessionAliases) {
    if (
      !declaredRootKeys.has(aliasKey)
      || !declaredRootKeys.has(canonicalKey)
    ) {
      fail("session aliases may merge only two declared root sessions");
    }
  }

  const rejected: TaskMapIdentityDedupeRejectedVariantV1[] = [];
  const groups = new Map<string, {
    canonicalSourceObjectKeyDigest: string;
    corroboratesWorkId: string;
    identitySourceObjectKeyDigests: Set<string>;
    variantSourceObjectKeyDigests: Set<string>;
    variantEnvelopeIds: Set<string>;
  }>();
  const rootFor = (
    declaration: TaskMapSessionLineageV1,
  ): TaskMapSessionLineageV1 => {
    let current = declaration;
    const seen = new Set<string>();
    for (
      let depth = 0;
      depth <= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxDelegationDepth;
      depth += 1
    ) {
      if (seen.has(current.sessionEnvelopeId)) {
        fail("session delegation lineage contains a cycle");
      }
      seen.add(current.sessionEnvelopeId);
      if (current.role === "root") return current;
      if (current.role !== "subagent") {
        fail("a subagent lineage cannot terminate at a wrapper");
      }
      const parent = declarations.get(current.parentSessionEnvelopeId!);
      if (parent === undefined) {
        fail("subagent delegation parent is absent");
      }
      current = parent;
    }
    fail("session delegation lineage exceeds its depth bound");
  };

  for (const lineage of declarations.values()) {
    const envelope = byEnvelopeId.get(lineage.sessionEnvelopeId)!;
    const lineageProofDigest = sessionProofByEnvelopeId.get(
      lineage.sessionEnvelopeId,
    );
    if (lineageProofDigest === undefined) {
      fail("session lineage has no internally derived proof");
    }
    if (lineage.role === "wrapper") {
      const core = {
        sourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
        reasonCode: "wrapper_transport_not_semantic_session" as const,
      };
      const evidence = {
        envelopeId: stableId("tmvariant", {
          sourceEnvelopeId: envelope.envelopeId,
        }),
        proofDigest: lineageProofDigest,
      };
      rejected.push({
        rejectionId: stableId("tmsessionrejection", core),
        ...core,
        ...evidence,
      });
      continue;
    }
    const root = rootFor(lineage);
    const rootEnvelope = byEnvelopeId.get(root.sessionEnvelopeId)!;
    const canonicalSessionKey = canonicalKey(
      rootEnvelope.sourceObjectKeyDigest,
      sessionAliases,
    );
    const canonicalWorkKey = canonicalKey(
      root.workSourceObjectKeyDigest!,
      workAliases,
    );
    const workId = workIdByCanonicalKey.get(canonicalWorkKey);
    if (workId === undefined) {
      fail("root session corroborates no existing canonical work");
    }
    const group = groups.get(canonicalSessionKey) ?? {
      canonicalSourceObjectKeyDigest: canonicalSessionKey,
      corroboratesWorkId: workId,
      identitySourceObjectKeyDigests: new Set<string>(),
      variantSourceObjectKeyDigests: new Set<string>(),
      variantEnvelopeIds: new Set<string>(),
    };
    if (group.corroboratesWorkId !== workId) {
      fail("aliased root sessions corroborate different work identities");
    }
    group.identitySourceObjectKeyDigests.add(
      rootEnvelope.sourceObjectKeyDigest,
    );
    group.variantSourceObjectKeyDigests.add(
      envelope.sourceObjectKeyDigest,
    );
    group.variantSourceObjectKeyDigests.add(
      rootEnvelope.sourceObjectKeyDigest,
    );
    group.variantEnvelopeIds.add(stableId("tmvariant", {
      sourceEnvelopeId: envelope.envelopeId,
    }));
    group.variantEnvelopeIds.add(stableId("tmvariant", {
      sourceEnvelopeId: rootEnvelope.envelopeId,
    }));
    groups.set(canonicalSessionKey, group);
  }
  const events = [...groups.values()].map((group) => {
    const core = {
      canonicalSourceObjectKeyDigest:
        group.canonicalSourceObjectKeyDigest,
      corroboratesWorkId: group.corroboratesWorkId,
    };
    return {
      eventKind: "session" as const,
      eventId: stableId("tmsessionevent", core),
      ...core,
      identitySourceObjectKeyDigests: sortedUnique(
        [...group.identitySourceObjectKeyDigests],
        "session identity source-object-key variants",
      ),
      variantSourceObjectKeyDigests: sortedUnique(
        [...group.variantSourceObjectKeyDigests],
        "accepted session source-object-key variants",
      ),
      variantEnvelopeIds: sortedUnique(
        [...group.variantEnvelopeIds],
        "session variants",
      ),
    };
  }).sort((left, right) => compareText(left.eventId, right.eventId));
  rejected.sort((left, right) => compareText(
    left.rejectionId,
    right.rejectionId,
  ));
  const eventIdsByWorkId = new Map<string, string[]>();
  for (const event of events) {
    const ids = eventIdsByWorkId.get(event.corroboratesWorkId) ?? [];
    ids.push(event.eventId);
    eventIdsByWorkId.set(event.corroboratesWorkId, ids);
  }
  for (const [workId, ids] of eventIdsByWorkId) {
    eventIdsByWorkId.set(workId, ids.sort(compareText));
  }
  return { events, rejected, eventIdsByWorkId };
}

function buildMeetingEvents(
  snapshot: TaskMapSourceSnapshotV1,
  byEnvelopeId: Map<string, TaskMapSourceEnvelopeV1>,
): TaskMapIdentityDedupeMeetingEventV1[] {
  return snapshot.canonicalMeetings.map((meeting) => {
    const sourceVariantEnvelopeIds = sortedUnique([
      ...meeting.calendarEnvelopeIds,
      ...meeting.evidenceVariantEnvelopeIds,
    ], "meeting variants");
    for (const envelopeId of sourceVariantEnvelopeIds) {
      const envelope = byEnvelopeId.get(envelopeId);
      if (
        envelope === undefined
        || !["meeting_note", "calendar_event"].includes(envelope.objectType)
      ) {
        fail("canonical meeting references an invalid evidence variant");
      }
    }
    const variantEnvelopeIds = sourceVariantEnvelopeIds.map((envelopeId) => (
      stableId("tmvariant", { sourceEnvelopeId: envelopeId })
    )).sort(compareText);
    return {
      eventKind: "meeting" as const,
      eventId: stableId("tmmeetingevent", {
        canonicalMeetingId: meeting.canonicalMeetingId,
      }),
      canonicalMeetingId: meeting.canonicalMeetingId,
      identityMethod: meeting.identityMethod,
      reviewState: meeting.reviewState,
      variantEnvelopeIds,
    };
  }).sort((left, right) => compareText(left.eventId, right.eventId));
}

function buildWorks(
  workGroups: Map<string, {
    sourceKeys: Set<string>;
    sourceIdentityDigests: Set<string>;
    envelopeIds: Set<string>;
    projectionReferences:
      Map<string, TaskMapIdentityProjectionReferenceV1>;
  }>,
  lifecycleByWorkKey: Map<string, {
    event: TaskMapIdentityDedupeLifecycleEventV1;
    delta: TaskMapIdentityDedupeLifecycleDeltaV1;
  }>,
  sessionEventIdsByWorkId: Map<string, string[]>,
): TaskMapIdentityDedupeWorkV1[] {
  const works: TaskMapIdentityDedupeWorkV1[] = [];
  for (const [canonicalSourceObjectKeyDigest, group] of workGroups) {
    const lifecycle = lifecycleByWorkKey.get(canonicalSourceObjectKeyDigest);
    if (lifecycle === undefined) {
      fail("canonical work has no lifecycle result");
    }
    const workId = lifecycle.event.workId;
    const variants = sortedUnique(
      [...new Set([
        canonicalSourceObjectKeyDigest,
        ...group.sourceKeys,
      ])],
      "work source-object-key variants",
    );
    if (
      variants.length
        > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity
    ) {
      fail("canonical work has too many identity variants");
    }
    works.push({
      workId,
      canonicalSourceObjectKeyDigest,
      variantSourceObjectKeyDigests: variants,
      variantSourceIdentityDigests: sortedUnique(
        [...group.sourceIdentityDigests],
        "work source-identity variants",
      ),
      projectionReferences: [...group.projectionReferences.values()]
        .sort((left, right) => (
          compareText(left.kind, right.kind)
          || compareText(left.id, right.id)
        )),
      corroboratingSessionEventIds:
        sessionEventIdsByWorkId.get(workId) ?? [],
      lifecycleEventId: lifecycle.event.eventId,
      lifecycleState: lifecycle.event.lifecycleState,
    });
  }
  return works.sort((left, right) => compareText(left.workId, right.workId));
}

function buildIdentityDedupeSemanticRows(
  sourceSnapshot: TaskMapSourceSnapshotV1,
  projection: TaskMapProjectionV1,
  supplied: Pick<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "aliases"
    | "workBindings"
    | "sessionLineage"
    | "lifecycleAdjudications"
  >,
  decisionProofs: DerivedIdentityDecisionProofs,
) {
  const byEnvelopeId = envelopesById(sourceSnapshot);
  const byObjectKey = envelopesByObjectKey(sourceSnapshot);
  const aliases = normalizeAliases(supplied.aliases, byObjectKey);
  const workGroups = normalizeWorkBindings(
    supplied.workBindings,
    projection,
    byEnvelopeId,
    byObjectKey,
    aliases.work,
  );
  const lifecycle = buildLifecycle(
    supplied.lifecycleAdjudications,
    workGroups,
    decisionProofs.lifecycleProofByCanonicalKey,
  );
  const workIdByCanonicalKey = new Map<string, string>();
  for (const [key, value] of lifecycle.byWorkKey) {
    workIdByCanonicalKey.set(key, value.event.workId);
  }
  const sessions = normalizeSessionLineage(
    supplied.sessionLineage,
    sourceSnapshot,
    byEnvelopeId,
    aliases.work,
    aliases.session,
    workIdByCanonicalKey,
    decisionProofs.sessionProofByEnvelopeId,
  );
  const works = buildWorks(
    workGroups,
    lifecycle.byWorkKey,
    sessions.eventIdsByWorkId,
  );
  const events: TaskMapIdentityDedupeEventV1[] = [
    ...buildMeetingEvents(sourceSnapshot, byEnvelopeId),
    ...sessions.events,
    ...lifecycle.events,
  ].sort((left, right) => compareText(left.eventId, right.eventId));
  return {
    works,
    events,
    lifecycleDeltas: lifecycle.deltas,
    rejectedVariants: sessions.rejected,
    privacy: { ...PRIVACY },
    workGroups,
  };
}

function identityDedupeSemanticRowsDigest(
  rows: Pick<
    TaskMapIdentityDedupeProjectionV1,
    | "works"
    | "events"
    | "lifecycleDeltas"
    | "rejectedVariants"
    | "privacy"
  >,
): string {
  return taskMapContractDigest({
    contractVersion: TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
    policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
    works: rows.works,
    events: rows.events,
    lifecycleDeltas: rows.lifecycleDeltas,
    rejectedVariants: rows.rejectedVariants,
    privacy: rows.privacy,
  });
}

type DiffRow = {
  kind: TaskMapIdentityDedupeDiffRecordKind;
  id: string;
  value: object;
};

function sidecarRows(
  sidecar: TaskMapIdentityDedupeProjectionV1,
): DiffRow[] {
  return [
    {
      kind: "metadata" as const,
      id: "identity-sidecar-metadata",
      value: {
        contractVersion: sidecar.contractVersion,
        ownerScopeDigest: sidecar.ownerScopeDigest,
        policyVersion: sidecar.policyVersion,
        suppliedIdentityProofDigest:
          sidecar.suppliedIdentityProofDigest,
        sourceSnapshotId: sidecar.sourceSnapshotId,
        sourceSnapshotDigest: sidecar.sourceSnapshotDigest,
        projectionRunId: sidecar.projectionRunId,
        projectionDigest: sidecar.projectionDigest,
        origin: sidecar.origin,
        replayClosure: sidecar.replayClosure,
        privacy: sidecar.privacy,
      },
    },
    ...sidecar.works.map((value) => ({
      kind: "work" as const,
      id: value.workId,
      value,
    })),
    ...sidecar.events.map((value) => ({
      kind: "event" as const,
      id: value.eventId,
      value,
    })),
    ...sidecar.lifecycleDeltas.map((value) => ({
      kind: "lifecycle_delta" as const,
      id: value.deltaId,
      value,
    })),
    ...sidecar.rejectedVariants.map((value) => ({
      kind: "rejected_variant" as const,
      id: value.rejectionId,
      value,
    })),
  ].sort((left, right) => (
    compareText(left.kind, right.kind) || compareText(left.id, right.id)
  ));
}

function sidecarDigest(
  sidecar: TaskMapIdentityDedupeProjectionV1 | null,
): string {
  return taskMapContractDigest(sidecar);
}

function buildDiff(
  previous: TaskMapIdentityDedupeProjectionV1 | null,
  current: TaskMapIdentityDedupeProjectionV1,
): TaskMapIdentityDedupeDiffV1 {
  const before = new Map<string, DiffRow>();
  const after = new Map<string, DiffRow>();
  for (const row of previous === null ? [] : sidecarRows(previous)) {
    before.set(`${row.kind}:${row.id}`, row);
  }
  for (const row of sidecarRows(current)) {
    after.set(`${row.kind}:${row.id}`, row);
  }
  const added: TaskMapIdentityDedupeDiffEntryV1[] = [];
  const removed: TaskMapIdentityDedupeDiffEntryV1[] = [];
  const changed: TaskMapIdentityDedupeDiffEntryV1[] = [];
  for (const [key, row] of after) {
    const prior = before.get(key);
    if (prior === undefined) {
      added.push({
        kind: row.kind,
        id: row.id,
        afterDigest: taskMapContractDigest(row.value),
      });
    } else {
      const beforeDigest = taskMapContractDigest(prior.value);
      const afterDigest = taskMapContractDigest(row.value);
      if (beforeDigest !== afterDigest) {
        changed.push({
          kind: row.kind,
          id: row.id,
          beforeDigest,
          afterDigest,
        });
      }
    }
  }
  for (const [key, row] of before) {
    if (!after.has(key)) {
      removed.push({
        kind: row.kind,
        id: row.id,
        beforeDigest: taskMapContractDigest(row.value),
      });
    }
  }
  const sort = (
    rows: TaskMapIdentityDedupeDiffEntryV1[],
  ): TaskMapIdentityDedupeDiffEntryV1[] => rows.sort((left, right) => (
    compareText(left.kind, right.kind) || compareText(left.id, right.id)
  ));
  const core = {
    previousSidecarDigest: sidecarDigest(previous),
    currentSidecarDigest: sidecarDigest(current),
    added: sort(added),
    removed: sort(removed),
    changed: sort(changed),
  };
  return {
    contractVersion: TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION,
    diffId: stableId("tmidentitydiff", core),
    ...core,
  };
}

function assertPrivacy(value: unknown, label: string): void {
  assertExactKeys(value, Object.keys(PRIVACY), [], label);
  if (!canonicalEqual(value, PRIVACY)) {
    fail(`${label} is not the exact fail-closed privacy contract`);
  }
}

function assertNoSensitiveOutput(value: unknown): void {
  const text = taskMapContractCanonicalJson(value);
  const lower = text.toLowerCase();
  const patterns: Array<[string, RegExp]> = [
    ["local path", /(?:^|["\s])(?:\/users\/|\/home\/|file:\/\/|[a-z]:\\\\)/i],
    ["email address", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
    ["URL", /\b(?:https?|ftp):\/\//i],
    ["private key", /-----begin [^-]*private key-----/i],
    ["bearer secret", /\bbearer\s+[a-z0-9._~+/=-]{8,}/i],
    ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
    ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
    ["OpenAI key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
    ["Google OAuth token", /\bya29\.[0-9A-Za-z_-]{20,}\b/],
    ["Stripe secret", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/],
    ["npm token", /\bnpm_[0-9A-Za-z]{20,}\b/],
    ["GitLab token", /\bglpat-[0-9A-Za-z_-]{20,}\b/],
  ];
  for (const [label, pattern] of patterns) {
    if (pattern.test(text) || pattern.test(lower)) {
      fail(`sidecar output contains a ${label}`);
    }
  }
  for (const forbiddenKey of [
    "\"title\"",
    "\"summary\"",
    "\"body\"",
    "\"transcript\"",
    "\"email\"",
    "\"participants\"",
    "\"sourceobjectid\"",
    "\"sourcerevision\"",
    "\"opaquemessageid\"",
  ]) {
    if (lower.includes(forbiddenKey)) {
      fail(`sidecar output contains forbidden raw-content field ${forbiddenKey}`);
    }
  }
}

function sidecarCore(
  value: Omit<TaskMapIdentityDedupeProjectionV1, "sidecarId">,
): Omit<TaskMapIdentityDedupeProjectionV1, "sidecarId"> {
  return value;
}

function assertSortedById<T>(
  rows: readonly T[],
  id: (value: T) => string,
  label: string,
): void {
  for (let index = 0; index < rows.length; index += 1) {
    const current = id(rows[index]!);
    assertSafeId(current, `${label} ID`);
    if (index > 0 && compareText(id(rows[index - 1]!), current) >= 0) {
      fail(`${label} must be strictly sorted by stable ID`);
    }
  }
}

function assertSortedStringArray(
  value: unknown,
  kind: "digest" | "id",
  limit: number,
  label: string,
  requireNonEmpty = false,
): asserts value is string[] {
  assertArrayBound(value, limit, label);
  if (requireNonEmpty && value.length === 0) {
    fail(`${label} must not be empty`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (kind === "digest") {
      assertDigest(value[index], `${label} ${index}`);
    } else {
      assertSafeId(value[index], `${label} ${index}`);
    }
    if (
      index > 0
      && compareText(value[index - 1] as string, value[index] as string) >= 0
    ) {
      fail(`${label} must be strictly sorted and duplicate-free`);
    }
  }
}

function assertOriginAndReplayClosure(
  value: TaskMapIdentityDedupeProjectionV1,
): void {
  assertExactKeys(
    value.origin,
    [
      "currentRefId",
      "currentGeneration",
      "acceptedOriginGeneration",
      "acceptedStateDigest",
      "bundleId",
      "planId",
      "batchId",
      "sourceSnapshotProofId",
      "acceptedOriginReplayDigest",
      "replayClosureDigest",
    ],
    [],
    "sidecar origin",
  );
  assertHashedId(
    value.origin.currentRefId,
    HASHED_IDS.currentRef,
    "sidecar origin current ref ID",
  );
  assertHashedId(
    value.origin.bundleId,
    HASHED_IDS.bundle,
    "sidecar origin bundle ID",
  );
  assertHashedId(
    value.origin.planId,
    HASHED_IDS.plan,
    "sidecar origin plan ID",
  );
  assertHashedId(
    value.origin.batchId,
    HASHED_IDS.batch,
    "sidecar origin batch ID",
  );
  assertHashedId(
    value.origin.sourceSnapshotProofId,
    HASHED_IDS.sourceSnapshotProof,
    "sidecar origin source snapshot proof ID",
  );
  for (const [item, label] of [
    [value.origin.acceptedStateDigest, "accepted state"],
    [value.origin.acceptedOriginReplayDigest, "accepted origin replay"],
    [value.origin.replayClosureDigest, "replay closure"],
  ] as const) {
    assertDigest(item, `sidecar origin ${label} digest`);
  }
  for (const [item, label] of [
    [value.origin.currentGeneration, "current generation"],
    [value.origin.acceptedOriginGeneration, "accepted origin generation"],
  ] as const) {
    if (typeof item !== "string" || !/^[0-9]{20}$/.test(item)) {
      fail(`sidecar origin ${label} must be a canonical generation`);
    }
  }

  assertExactKeys(
    value.replayClosure,
    [
      "contractVersion",
      "ownerScopeDigest",
      "sourceSnapshotDigest",
      "sourceSemanticInputDigest",
      "projectionDigest",
      "projectionRunId",
      "projectionInputDigest",
      "suppliedIdentityProofDigest",
      "semanticRowsDigest",
    ],
    [],
    "sidecar replay closure",
  );
  if (
    value.replayClosure.contractVersion
      !== TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION
  ) {
    fail("sidecar replay closure uses an unsupported contract version");
  }
  for (const [item, label] of [
    [value.replayClosure.ownerScopeDigest, "owner"],
    [value.replayClosure.sourceSnapshotDigest, "source snapshot"],
    [value.replayClosure.sourceSemanticInputDigest, "semantic input"],
    [value.replayClosure.projectionDigest, "projection"],
    [value.replayClosure.projectionInputDigest, "projection input"],
    [
      value.replayClosure.suppliedIdentityProofDigest,
      "supplied identity proof",
    ],
    [value.replayClosure.semanticRowsDigest, "semantic rows"],
  ] as const) {
    assertDigest(item, `sidecar replay closure ${label} digest`);
  }
  assertHashedId(
    value.replayClosure.projectionRunId,
    HASHED_IDS.projectionRun,
    "sidecar replay closure projection run ID",
  );
  if (
    value.origin.replayClosureDigest
      !== taskMapContractDigest(value.replayClosure)
    || value.ownerScopeDigest !== value.replayClosure.ownerScopeDigest
    || value.sourceSnapshotDigest
      !== value.replayClosure.sourceSnapshotDigest
    || value.projectionDigest !== value.replayClosure.projectionDigest
    || value.projectionRunId !== value.replayClosure.projectionRunId
    || value.suppliedIdentityProofDigest
      !== value.replayClosure.suppliedIdentityProofDigest
  ) {
    fail("sidecar origin/replay/top-level closure is inconsistent");
  }
}

function assertIdentityRows(
  value: TaskMapIdentityDedupeProjectionV1,
): void {
  const worksById = new Map<string, TaskMapIdentityDedupeWorkV1>();
  const workIdByCanonicalKey = new Map<string, string>();
  const workIdByVariantKey = new Map<string, string>();
  const workIdByVariantIdentity = new Map<string, string>();
  const workIdByProjectionReference = new Map<string, string>();
  for (const [index, work] of value.works.entries()) {
    const label = `sidecar work ${index}`;
    assertExactKeys(
      work,
      [
        "workId",
        "canonicalSourceObjectKeyDigest",
        "variantSourceObjectKeyDigests",
        "variantSourceIdentityDigests",
        "projectionReferences",
        "corroboratingSessionEventIds",
        "lifecycleEventId",
        "lifecycleState",
      ],
      [],
      label,
    );
    assertHashedId(work.workId, HASHED_IDS.work, `${label} ID`);
    assertDigest(
      work.canonicalSourceObjectKeyDigest,
      `${label} canonical source-object-key digest`,
    );
    if (
      work.workId !== stableId("tmwork", {
        policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
        canonicalSourceObjectKeyDigest:
          work.canonicalSourceObjectKeyDigest,
      })
    ) {
      fail(`${label} ID is not derived from canonical work identity`);
    }
    assertSortedStringArray(
      work.variantSourceObjectKeyDigests,
      "digest",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
      `${label} source-object-key variants`,
      true,
    );
    assertSortedStringArray(
      work.variantSourceIdentityDigests,
      "digest",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
      `${label} source-identity variants`,
      true,
    );
    if (
      work.variantSourceObjectKeyDigests[0]
        !== work.canonicalSourceObjectKeyDigest
    ) {
      fail(`${label} canonical work key is not its lexical representative`);
    }
    assertArrayBound(
      work.projectionReferences,
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxWorkBindings,
      `${label} projection references`,
    );
    if (work.projectionReferences.length === 0) {
      fail(`${label} must retain at least one projection reference`);
    }
    for (
      let referenceIndex = 0;
      referenceIndex < work.projectionReferences.length;
      referenceIndex += 1
    ) {
      const reference = work.projectionReferences[referenceIndex]!;
      assertExactKeys(
        reference,
        ["kind", "id", "projectionRowDigest"],
        [],
        `${label} projection reference ${referenceIndex}`,
      );
      if (!["task", "rejection"].includes(reference.kind)) {
        fail(`${label} projection reference has an unsupported kind`);
      }
      assertHashedId(
        reference.id,
        HASHED_IDS.projectionReference,
        `${label} projection reference ${referenceIndex} ID`,
      );
      assertDigest(
        reference.projectionRowDigest,
        `${label} projection reference ${referenceIndex} row digest`,
      );
      if (
        reference.id !== stableId("tmprojectionref", {
          kind: reference.kind,
          projectionRowDigest: reference.projectionRowDigest,
        })
      ) {
        fail(`${label} projection reference ID is not derived from its row`);
      }
      if (
        referenceIndex > 0
        && (
          compareText(
            work.projectionReferences[referenceIndex - 1]!.kind,
            reference.kind,
          )
          || compareText(
            work.projectionReferences[referenceIndex - 1]!.id,
            reference.id,
          )
        ) >= 0
      ) {
        fail(`${label} projection references are not strictly sorted`);
      }
      const key = `${reference.kind}:${reference.id}`;
      if (workIdByProjectionReference.has(key)) {
        fail("a projection row is bound to more than one canonical work");
      }
      workIdByProjectionReference.set(key, work.workId);
    }
    assertSortedStringArray(
      work.corroboratingSessionEventIds,
      "id",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxSessionLineage,
      `${label} corroborating session event IDs`,
    );
    assertHashedId(
      work.lifecycleEventId,
      HASHED_IDS.event,
      `${label} lifecycle event ID`,
    );
    if (
      !["open", "resolved", "superseded", "rejected"]
        .includes(work.lifecycleState)
    ) {
      fail(`${label} has an unsupported lifecycle state`);
    }
    if (
      worksById.has(work.workId)
      || workIdByCanonicalKey.has(work.canonicalSourceObjectKeyDigest)
    ) {
      fail("sidecar contains a duplicate canonical work");
    }
    worksById.set(work.workId, work);
    workIdByCanonicalKey.set(
      work.canonicalSourceObjectKeyDigest,
      work.workId,
    );
    for (const variant of work.variantSourceObjectKeyDigests) {
      if (workIdByVariantKey.has(variant)) {
        fail("a work identity variant belongs to more than one canonical work");
      }
      workIdByVariantKey.set(variant, work.workId);
    }
    for (const variant of work.variantSourceIdentityDigests) {
      if (workIdByVariantIdentity.has(variant)) {
        fail("a work revision variant belongs to more than one canonical work");
      }
      workIdByVariantIdentity.set(variant, work.workId);
    }
  }

  const eventsById = new Map<string, TaskMapIdentityDedupeEventV1>();
  const meetingByCanonicalId = new Map<string, string>();
  const meetingByVariant = new Map<string, string>();
  const sessionByCanonicalKey = new Map<string, string>();
  const sessionByVariant = new Map<string, string>();
  const sessionBySourceObjectKeyDigest = new Map<string, string>();
  const lifecycleByWorkId = new Map<
    string,
    TaskMapIdentityDedupeLifecycleEventV1
  >();
  const sessionEventIdsByWorkId = new Map<string, string[]>();
  for (const [index, event] of value.events.entries()) {
    const label = `sidecar event ${index}`;
    assertHashedId(event.eventId, HASHED_IDS.event, `${label} ID`);
    if (eventsById.has(event.eventId)) {
      fail("sidecar contains a duplicate event ID");
    }
    eventsById.set(event.eventId, event);
    if (event.eventKind === "meeting") {
      assertExactKeys(
        event,
        [
          "eventKind",
          "eventId",
          "canonicalMeetingId",
          "identityMethod",
          "reviewState",
          "variantEnvelopeIds",
        ],
        [],
        label,
      );
      assertHashedId(
        event.canonicalMeetingId,
        HASHED_IDS.meeting,
        `${label} canonical meeting ID`,
      );
      if (!["calendar_event", "bounded_fingerprint"].includes(
        event.identityMethod,
      )) {
        fail(`${label} has an unsupported meeting identity method`);
      }
      if (!["resolved", "needs_review"].includes(event.reviewState)) {
        fail(`${label} has an unsupported meeting review state`);
      }
      assertSortedStringArray(
        event.variantEnvelopeIds,
        "id",
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
        `${label} meeting variants`,
        true,
      );
      for (const variant of event.variantEnvelopeIds) {
        assertHashedId(
          variant,
          HASHED_IDS.variant,
          `${label} meeting variant`,
        );
      }
      if (
        event.eventId !== stableId("tmmeetingevent", {
          canonicalMeetingId: event.canonicalMeetingId,
        })
      ) {
        fail(`${label} ID is not derived from canonical meeting identity`);
      }
      if (meetingByCanonicalId.has(event.canonicalMeetingId)) {
        fail("sidecar contains a duplicate canonical meeting");
      }
      meetingByCanonicalId.set(event.canonicalMeetingId, event.eventId);
      for (const variant of event.variantEnvelopeIds) {
        if (
          meetingByVariant.has(variant)
          || sessionByVariant.has(variant)
        ) {
          fail(
            "an accepted variant belongs to more than one meeting/session identity",
          );
        }
        meetingByVariant.set(variant, event.eventId);
      }
      continue;
    }
    if (event.eventKind === "session") {
      assertExactKeys(
        event,
        [
          "eventKind",
          "eventId",
          "canonicalSourceObjectKeyDigest",
          "corroboratesWorkId",
          "identitySourceObjectKeyDigests",
          "variantSourceObjectKeyDigests",
          "variantEnvelopeIds",
        ],
        [],
        label,
      );
      assertDigest(
        event.canonicalSourceObjectKeyDigest,
        `${label} canonical session digest`,
      );
      assertHashedId(
        event.corroboratesWorkId,
        HASHED_IDS.work,
        `${label} work ID`,
      );
      assertSortedStringArray(
        event.identitySourceObjectKeyDigests,
        "digest",
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
        `${label} session identity source-object-key variants`,
        true,
      );
      if (
        event.identitySourceObjectKeyDigests[0]
          !== event.canonicalSourceObjectKeyDigest
      ) {
        fail(`${label} canonical session key is not its lexical representative`);
      }
      assertSortedStringArray(
        event.variantSourceObjectKeyDigests,
        "digest",
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
        `${label} accepted session source-object-key variants`,
        true,
      );
      if (
        event.identitySourceObjectKeyDigests.some((identity) => (
          !event.variantSourceObjectKeyDigests.includes(identity)
        ))
      ) {
        fail(
          `${label} accepted session variants omit a root identity member`,
        );
      }
      assertSortedStringArray(
        event.variantEnvelopeIds,
        "id",
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxVariantsPerIdentity,
        `${label} session variants`,
        true,
      );
      for (const variant of event.variantEnvelopeIds) {
        assertHashedId(
          variant,
          HASHED_IDS.variant,
          `${label} session variant`,
        );
      }
      if (
        event.eventId !== stableId("tmsessionevent", {
          canonicalSourceObjectKeyDigest:
            event.canonicalSourceObjectKeyDigest,
          corroboratesWorkId: event.corroboratesWorkId,
        })
      ) {
        fail(`${label} ID is not derived from canonical session identity`);
      }
      if (sessionByCanonicalKey.has(
        event.canonicalSourceObjectKeyDigest,
      )) {
        fail("sidecar contains a duplicate canonical session");
      }
      sessionByCanonicalKey.set(
        event.canonicalSourceObjectKeyDigest,
        event.eventId,
      );
      for (const sourceObjectKeyDigest of
        event.variantSourceObjectKeyDigests) {
        if (sessionBySourceObjectKeyDigest.has(sourceObjectKeyDigest)) {
          fail(
            "a stable accepted session variant belongs to more than one "
              + "canonical session",
          );
        }
        sessionBySourceObjectKeyDigest.set(
          sourceObjectKeyDigest,
          event.eventId,
        );
      }
      for (const variant of event.variantEnvelopeIds) {
        if (
          sessionByVariant.has(variant)
          || meetingByVariant.has(variant)
        ) {
          fail(
            "an accepted variant belongs to more than one meeting/session identity",
          );
        }
        sessionByVariant.set(variant, event.eventId);
      }
      const ids = sessionEventIdsByWorkId.get(event.corroboratesWorkId) ?? [];
      ids.push(event.eventId);
      sessionEventIdsByWorkId.set(event.corroboratesWorkId, ids);
      continue;
    }
    if (event.eventKind === "work_lifecycle") {
      assertExactKeys(
        event,
        [
          "eventKind",
          "eventId",
          "workId",
          "sourceIdentityDigest",
          "lifecycleState",
          "adjudicationDigest",
        ],
        [],
        label,
      );
      assertHashedId(event.workId, HASHED_IDS.work, `${label} work ID`);
      assertDigest(
        event.sourceIdentityDigest,
        `${label} source identity digest`,
      );
      assertDigest(
        event.adjudicationDigest,
        `${label} adjudication digest`,
      );
      if (
        !["open", "resolved", "superseded", "rejected"]
          .includes(event.lifecycleState)
      ) {
        fail(`${label} has an unsupported lifecycle state`);
      }
      const eventCore = {
        workId: event.workId,
        sourceIdentityDigest: event.sourceIdentityDigest,
        lifecycleState: event.lifecycleState,
        adjudicationDigest: event.adjudicationDigest,
      };
      if (event.eventId !== stableId("tmlifecycleevent", eventCore)) {
        fail(`${label} ID is not derived from the lifecycle facts`);
      }
      if (lifecycleByWorkId.has(event.workId)) {
        fail("a canonical work has more than one lifecycle event");
      }
      lifecycleByWorkId.set(event.workId, event);
      continue;
    }
    fail(`${label} has an unsupported event kind`);
  }

  const deltasByWorkId = new Map<
    string,
    TaskMapIdentityDedupeLifecycleDeltaV1
  >();
  for (const [index, delta] of value.lifecycleDeltas.entries()) {
    const label = `sidecar lifecycle delta ${index}`;
    assertExactKeys(
      delta,
      [
        "deltaId",
        "workId",
        "previousState",
        "currentState",
        "currentSourceIdentityDigest",
        "adjudicatedDelta",
        "adjudicationDigest",
        "lifecycleEventId",
      ],
      ["previousSourceIdentityDigest"],
      label,
    );
    assertHashedId(
      delta.deltaId,
      HASHED_IDS.lifecycleDelta,
      `${label} ID`,
    );
    assertHashedId(delta.workId, HASHED_IDS.work, `${label} work ID`);
    assertHashedId(
      delta.lifecycleEventId,
      HASHED_IDS.event,
      `${label} lifecycle event ID`,
    );
    const work = worksById.get(delta.workId);
    if (work === undefined) {
      fail(`${label} references an absent work`);
    }
    validateLifecycleAdjudication({
      canonicalSourceObjectKeyDigest:
        work.canonicalSourceObjectKeyDigest,
      previousState: delta.previousState,
      currentState: delta.currentState,
      ...(delta.previousSourceIdentityDigest === undefined
        ? {}
        : {
          previousSourceIdentityDigest:
            delta.previousSourceIdentityDigest,
        }),
      currentSourceIdentityDigest: delta.currentSourceIdentityDigest,
      adjudicatedDelta: delta.adjudicatedDelta,
    }, index);
    assertDigest(delta.adjudicationDigest, `${label} adjudication digest`);
    const { deltaId: _deltaId, ...deltaCore } = delta;
    if (delta.deltaId !== stableId("tmlifecycledelta", deltaCore)) {
      fail(`${label} ID is not derived from the adjudicated delta`);
    }
    if (deltasByWorkId.has(delta.workId)) {
      fail("a canonical work has more than one lifecycle delta");
    }
    deltasByWorkId.set(delta.workId, delta);
  }

  const rejectedEnvelopeIds = new Set<string>();
  const rejectedSourceObjectKeyDigests = new Set<string>();
  for (const [index, rejected] of value.rejectedVariants.entries()) {
    const label = `sidecar rejected variant ${index}`;
    assertExactKeys(
      rejected,
      [
        "rejectionId",
        "sourceObjectKeyDigest",
        "envelopeId",
        "reasonCode",
        "proofDigest",
      ],
      [],
      label,
    );
    assertHashedId(
      rejected.rejectionId,
      HASHED_IDS.sessionRejection,
      `${label} ID`,
    );
    assertHashedId(
      rejected.envelopeId,
      HASHED_IDS.variant,
      `${label} envelope ID`,
    );
    assertDigest(
      rejected.sourceObjectKeyDigest,
      `${label} source-object-key digest`,
    );
    assertDigest(rejected.proofDigest, `${label} proof digest`);
    if (rejected.reasonCode !== "wrapper_transport_not_semantic_session") {
      fail(`${label} has an unsupported reason code`);
    }
    const rejectionCore = {
      sourceObjectKeyDigest: rejected.sourceObjectKeyDigest,
      reasonCode: rejected.reasonCode,
    };
    if (
      rejected.rejectionId
        !== stableId("tmsessionrejection", rejectionCore)
    ) {
      fail(`${label} ID is not derived from the rejected variant`);
    }
    if (rejectedEnvelopeIds.has(rejected.envelopeId)) {
      fail("a rejected session variant is repeated");
    }
    if (
      rejectedSourceObjectKeyDigests.has(
        rejected.sourceObjectKeyDigest,
      )
    ) {
      fail("a stable rejected session identity is repeated");
    }
    if (
      sessionBySourceObjectKeyDigest.has(
        rejected.sourceObjectKeyDigest,
      )
    ) {
      fail(
        "a stable session identity cannot be both accepted and rejected",
      );
    }
    if (
      sessionByVariant.has(rejected.envelopeId)
      || meetingByVariant.has(rejected.envelopeId)
    ) {
      fail("a source variant cannot be both accepted and rejected");
    }
    rejectedEnvelopeIds.add(rejected.envelopeId);
    rejectedSourceObjectKeyDigests.add(
      rejected.sourceObjectKeyDigest,
    );
  }

  for (const work of value.works) {
    const lifecycleEvent = lifecycleByWorkId.get(work.workId);
    const delta = deltasByWorkId.get(work.workId);
    if (
      lifecycleEvent === undefined
      || delta === undefined
      || work.lifecycleEventId !== lifecycleEvent.eventId
      || work.lifecycleState !== lifecycleEvent.lifecycleState
      || delta.lifecycleEventId !== lifecycleEvent.eventId
      || delta.currentState !== lifecycleEvent.lifecycleState
      || delta.currentSourceIdentityDigest
        !== lifecycleEvent.sourceIdentityDigest
      || delta.adjudicationDigest !== lifecycleEvent.adjudicationDigest
      || !work.variantSourceIdentityDigests.includes(
        lifecycleEvent.sourceIdentityDigest,
      )
    ) {
      fail("canonical work/lifecycle event/delta closure is inconsistent");
    }
    const expectedSessionIds = (
      sessionEventIdsByWorkId.get(work.workId) ?? []
    ).sort(compareText);
    if (!canonicalEqual(
      work.corroboratingSessionEventIds,
      expectedSessionIds,
    )) {
      fail("canonical work/session corroboration closure is inconsistent");
    }
  }
  if (
    lifecycleByWorkId.size !== worksById.size
    || deltasByWorkId.size !== worksById.size
    || [...sessionEventIdsByWorkId.keys()].some(
      (workId) => !worksById.has(workId),
    )
  ) {
    fail("sidecar contains orphan lifecycle or session rows");
  }
}

export function assertTaskMapIdentityDedupeProjection(
  value: TaskMapIdentityDedupeProjectionV1,
): TaskMapIdentityDedupeProjectionV1 {
  assertArrayPrototypeIntegrity();
  preflightJson(value, "identity sidecar", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes,
  });
  assertExactKeys(
    value,
    [
      "contractVersion",
      "sidecarId",
      "ownerScopeDigest",
      "policyVersion",
      "suppliedIdentityProofDigest",
      "sourceSnapshotId",
      "sourceSnapshotDigest",
      "projectionRunId",
      "projectionDigest",
      "origin",
      "replayClosure",
      "works",
      "events",
      "lifecycleDeltas",
      "rejectedVariants",
      "privacy",
    ],
    [],
    "identity sidecar",
  );
  if (
    value.contractVersion !== TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION
    || value.policyVersion !== TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION
  ) {
    fail("identity sidecar uses an unsupported contract version");
  }
  assertHashedId(value.sidecarId, HASHED_IDS.sidecar, "sidecar ID");
  assertDigest(value.ownerScopeDigest, "sidecar owner");
  assertDigest(
    value.suppliedIdentityProofDigest,
    "sidecar supplied identity proof digest",
  );
  assertHashedId(
    value.sourceSnapshotId,
    HASHED_IDS.sourceSnapshot,
    "sidecar snapshot ID",
  );
  if (
    value.sourceSnapshotId
      !== `tmsnapshot_${taskMapContractDigest(
        value.sourceSnapshotDigest,
      ).slice(0, 16)}`
  ) {
    fail("sidecar snapshot ID is not derived from its snapshot digest");
  }
  assertDigest(value.sourceSnapshotDigest, "sidecar snapshot digest");
  assertHashedId(
    value.projectionRunId,
    HASHED_IDS.projectionRun,
    "sidecar projection run ID",
  );
  assertDigest(value.projectionDigest, "sidecar projection digest");
  assertPrivacy(value.privacy, "sidecar privacy");
  assertOriginAndReplayClosure(value);
  assertArrayBound(
    value.works,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxWorkBindings,
    "sidecar works",
  );
  assertArrayBound(
    value.events,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxArrayLength,
    "sidecar events",
  );
  assertArrayBound(
    value.lifecycleDeltas,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxLifecycleAdjudications,
    "sidecar lifecycle deltas",
  );
  assertArrayBound(
    value.rejectedVariants,
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxSessionLineage,
    "sidecar rejected variants",
  );
  if (
    1
      + value.works.length
      + value.events.length
      + value.lifecycleDeltas.length
      + value.rejectedVariants.length
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxArrayLength
  ) {
    fail("sidecar total diff-row count exceeds its shared bound");
  }
  assertSortedById(value.works, (row) => row.workId, "sidecar works");
  assertSortedById(value.events, (row) => row.eventId, "sidecar events");
  assertSortedById(
    value.lifecycleDeltas,
    (row) => row.deltaId,
    "sidecar lifecycle deltas",
  );
  assertSortedById(
    value.rejectedVariants,
    (row) => row.rejectionId,
    "sidecar rejected variants",
  );
  assertIdentityRows(value);
  if (
    value.replayClosure.semanticRowsDigest
      !== identityDedupeSemanticRowsDigest(value)
  ) {
    fail("sidecar semantic rows do not match the accepted replay closure");
  }
  const { sidecarId: _sidecarId, ...core } = value;
  if (value.sidecarId !== stableId("tmidentityprojection", core)) {
    fail("sidecar ID does not bind its exact canonical bytes");
  }
  const canonicalBytes = taskMapContractCanonicalJson(value);
  if (
    Buffer.byteLength(canonicalBytes, "utf8")
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes
  ) {
    fail("identity sidecar exceeds its canonical byte bound");
  }
  assertNoSensitiveOutput(value);
  return value;
}

export function assertTaskMapIdentityDedupeDiff(
  value: TaskMapIdentityDedupeDiffV1,
): TaskMapIdentityDedupeDiffV1 {
  assertArrayPrototypeIntegrity();
  preflightJson(value, "identity sidecar diff", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes,
  });
  assertExactKeys(
    value,
    [
      "contractVersion",
      "diffId",
      "previousSidecarDigest",
      "currentSidecarDigest",
      "added",
      "removed",
      "changed",
    ],
    [],
    "identity sidecar diff",
  );
  if (value.contractVersion !== TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION) {
    fail("identity sidecar diff uses an unsupported contract version");
  }
  assertHashedId(value.diffId, HASHED_IDS.diff, "identity diff ID");
  assertDigest(value.previousSidecarDigest, "previous sidecar digest");
  assertDigest(value.currentSidecarDigest, "current sidecar digest");
  const seenEntries = new Set<string>();
  let entryCount = 0;
  for (const [rows, label] of [
    [value.added, "added"],
    [value.removed, "removed"],
    [value.changed, "changed"],
  ] as const) {
    assertArrayBound(
      rows,
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxArrayLength,
      `identity diff ${label}`,
    );
    for (const [index, row] of rows.entries()) {
      assertExactKeys(
        row,
        ["kind", "id"],
        ["beforeDigest", "afterDigest"],
        `identity diff ${label} ${index}`,
      );
      if (
        ![
          "metadata",
          "work",
          "event",
          "lifecycle_delta",
          "rejected_variant",
        ]
          .includes(row.kind)
      ) {
        fail(`identity diff ${label} ${index} has an unsupported kind`);
      }
      if (row.kind === "metadata") {
        if (row.id !== "identity-sidecar-metadata") {
          fail(`identity diff ${label} ${index} has an invalid metadata ID`);
        }
      } else {
        const pattern = row.kind === "work"
          ? HASHED_IDS.work
          : row.kind === "event"
            ? HASHED_IDS.event
            : row.kind === "lifecycle_delta"
              ? HASHED_IDS.lifecycleDelta
              : HASHED_IDS.sessionRejection;
        assertHashedId(
          row.id,
          pattern,
          `identity diff ${label} ${index} ID`,
        );
      }
      if (row.beforeDigest !== undefined) {
        assertDigest(
          row.beforeDigest,
          `identity diff ${label} ${index} before digest`,
        );
      }
      if (row.afterDigest !== undefined) {
        assertDigest(
          row.afterDigest,
          `identity diff ${label} ${index} after digest`,
        );
      }
      if (
        label === "added"
          ? row.beforeDigest !== undefined || row.afterDigest === undefined
          : label === "removed"
            ? row.beforeDigest === undefined || row.afterDigest !== undefined
            : row.beforeDigest === undefined || row.afterDigest === undefined
      ) {
        fail(`identity diff ${label} ${index} has invalid digest polarity`);
      }
      if (
        label === "changed"
        && row.beforeDigest === row.afterDigest
      ) {
        fail(`identity diff ${label} ${index} is not an actual change`);
      }
      const entryKey = `${row.kind}:${row.id}`;
      if (seenEntries.has(entryKey)) {
        fail("identity diff repeats one record across change classes");
      }
      seenEntries.add(entryKey);
      entryCount += 1;
      if (
        index > 0
        && (
          compareText(rows[index - 1]!.kind, row.kind)
          || compareText(rows[index - 1]!.id, row.id)
        ) >= 0
      ) {
        fail(`identity diff ${label} rows are not strictly sorted`);
      }
    }
  }
  if (
    value.previousSidecarDigest === value.currentSidecarDigest
      ? entryCount !== 0
      : entryCount === 0
  ) {
    fail("identity diff exact no-op state is inconsistent");
  }
  const { diffId: _diffId, contractVersion: _version, ...core } = value;
  if (value.diffId !== stableId("tmidentitydiff", core)) {
    fail("identity diff ID does not bind its exact canonical bytes");
  }
  const canonicalBytes = taskMapContractCanonicalJson(value);
  if (
    Buffer.byteLength(canonicalBytes, "utf8")
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes
  ) {
    fail("identity sidecar diff exceeds its canonical byte bound");
  }
  assertNoSensitiveOutput(value);
  return value;
}

export function taskMapIdentityDedupeProjectionCanonicalBytes(
  value: TaskMapIdentityDedupeProjectionV1,
): string {
  return taskMapContractCanonicalJson(
    assertTaskMapIdentityDedupeProjection(value),
  );
}

export function taskMapIdentityDedupeDiffCanonicalBytes(
  value: TaskMapIdentityDedupeDiffV1,
): string {
  return taskMapContractCanonicalJson(assertTaskMapIdentityDedupeDiff(value));
}

export function taskMapIdentityDedupeReplayClosureDigest(
  sourceSnapshot: TaskMapSourceSnapshotV1,
  projection: TaskMapProjectionV1,
  suppliedProofs: Pick<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "aliases"
    | "workBindings"
    | "sessionLineage"
    | "lifecycleAdjudications"
  >,
  reviewAttestationDigest: string,
): string {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotReplayDigestInput({
    sourceSnapshot,
    projection,
    suppliedProofs,
    reviewAttestationDigest,
  });
  const normalizedSnapshot = assertTaskMapSourceSnapshot(
    snapshot.sourceSnapshot,
  );
  const projectionDiff = diffTaskMapProjections(null, snapshot.projection);
  const proofs = deriveIdentityDecisionProofs(
    snapshot.reviewAttestationDigest,
    normalizedSnapshot,
    snapshot.projection,
    snapshot.suppliedProofs,
  );
  const semanticRows = buildIdentityDedupeSemanticRows(
    normalizedSnapshot,
    snapshot.projection,
    snapshot.suppliedProofs,
    proofs,
  );
  const closure = buildReplayClosure(
    normalizedSnapshot.ownerScopeDigest,
    normalizedSnapshot,
    snapshot.projection,
    projectionDiff.currentProjectionDigest,
    proofs.digest,
    identityDedupeSemanticRowsDigest(semanticRows),
  );
  return taskMapContractDigest(closure);
}

/**
 * TEST-ONLY deterministic seam. It cannot establish filesystem origin,
 * freshness, or append-only history and therefore must never be wired into a
 * product/runtime path. Runtime callers must use the store-backed entrypoint.
 */
export function unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest(
  input: BuildTaskMapIdentityDedupeProjectionInput,
): BuiltTaskMapIdentityDedupeProjection {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotInput(input);
  const sourceSnapshot = assertTaskMapSourceSnapshot(snapshot.sourceSnapshot);
  if (!canonicalEqual(sourceSnapshot, snapshot.sourceSnapshot)) {
    fail("source snapshot is not canonical");
  }
  const projectionDiff = diffTaskMapProjections(null, snapshot.projection);
  if (snapshot.projection.runStatus !== "accepted") {
    fail("supplied projection must already be accepted");
  }
  const current = assertHealthyCurrentSnapshot(snapshot.currentSnapshot);
  if (current.head.operation === "rollback") {
    fail(
      "rollback cannot accept caller-authored identity or lifecycle "
        + "decisions without a reviewed authority artifact",
    );
  }
  assertAcceptedOrigin(
    snapshot.acceptedOrigin,
    current.accepted,
    current.head.ownerScopeDigest,
    sourceSnapshot,
  );
  const decisionProofs = deriveIdentityDecisionProofs(
    snapshot.acceptedOrigin.plan.reviewedDigests.reviewAttestationDigest,
    sourceSnapshot,
    snapshot.projection,
    snapshot,
  );
  const identityProofDigest = decisionProofs.digest;
  const semanticRows = buildIdentityDedupeSemanticRows(
    sourceSnapshot,
    snapshot.projection,
    snapshot,
    decisionProofs,
  );
  const replayClosure = buildReplayClosure(
    current.head.ownerScopeDigest,
    sourceSnapshot,
    snapshot.projection,
    projectionDiff.currentProjectionDigest,
    identityProofDigest,
    identityDedupeSemanticRowsDigest(semanticRows),
  );
  const replayClosureDigest = taskMapContractDigest(replayClosure);
  const previous = snapshot.previousSidecar === null
    ? null
    : assertTaskMapIdentityDedupeProjection(snapshot.previousSidecar);

  assertPreviousLifecycleClosure(
    previous,
    snapshot.previousAcceptedOrigin,
    current.head.ownerScopeDigest,
    current.head.generation,
    snapshot.currentSnapshot.generations,
    snapshot.lifecycleAdjudications,
    decisionProofs.lifecycleProofByCanonicalKey,
    semanticRows.workGroups,
    (
      snapshot.currentSnapshot.generations.slice(0, -1).every(
        (generation) => generation.accepted === undefined,
      )
      && current.originRef.refId === current.head.refId
      && current.accepted.originGeneration === current.head.generation
      && snapshot.acceptedOrigin.plan.baseline.kind === "genesis"
    ),
  );
  assertPreviousSessionAliasContinuity(previous, semanticRows.events);
  assertPreviousSessionRoleContinuity(
    previous,
    semanticRows.events,
    semanticRows.rejectedVariants,
  );
  if (
    snapshot.acceptedOrigin.plan.deterministicReplayDigest
      !== replayClosureDigest
  ) {
    fail(
      "projection replay closure is not the active accepted origin replay",
    );
  }
  const originProof: TaskMapIdentityDedupeOriginProofV1 = {
    currentRefId: current.head.refId,
    currentGeneration: current.head.generation,
    acceptedOriginGeneration: current.accepted.originGeneration,
    acceptedStateDigest: current.accepted.acceptedStateDigest,
    bundleId: current.accepted.bundleId,
    planId: current.accepted.planId,
    batchId: current.accepted.batchId,
    sourceSnapshotProofId:
      snapshot.acceptedOrigin.sourceSnapshotProof!.sourceSnapshotProofId,
    acceptedOriginReplayDigest:
      snapshot.acceptedOrigin.plan.deterministicReplayDigest,
    replayClosureDigest,
  };
  const core = sidecarCore({
    contractVersion: TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
    ownerScopeDigest: current.head.ownerScopeDigest,
    policyVersion: TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION,
    suppliedIdentityProofDigest: identityProofDigest,
    sourceSnapshotId: sourceSnapshot.snapshotId,
    sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    projectionRunId: snapshot.projection.runId,
    projectionDigest: projectionDiff.currentProjectionDigest,
    origin: originProof,
    replayClosure,
    works: semanticRows.works,
    events: semanticRows.events,
    lifecycleDeltas: semanticRows.lifecycleDeltas,
    rejectedVariants: semanticRows.rejectedVariants,
    privacy: semanticRows.privacy,
  });
  const sidecar: TaskMapIdentityDedupeProjectionV1 = {
    sidecarId: stableId("tmidentityprojection", core),
    ...core,
  };
  assertTaskMapIdentityDedupeProjection(sidecar);
  const diff = buildDiff(previous, sidecar);
  assertTaskMapIdentityDedupeDiff(diff);
  return {
    sidecar,
    diff,
    sidecarCanonicalBytes:
      taskMapIdentityDedupeProjectionCanonicalBytes(sidecar),
    diffCanonicalBytes: taskMapIdentityDedupeDiffCanonicalBytes(diff),
  };
}

function assertFixedGeneration(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || !FIXED_GENERATION.test(value)
    || BigInt(value) === 0n
  ) {
    fail(`${label} must be a nonzero fixed-width generation`);
  }
}

function storeEntryCore<T extends Omit<
  TaskMapIdentityDedupeStoreEntryV1,
  "entryId"
>>(
  value: T,
): T {
  return value;
}

export function assertTaskMapIdentityDedupeStoreEntry(
  value: TaskMapIdentityDedupeStoreEntryV1,
): TaskMapIdentityDedupeStoreEntryV1 {
  assertArrayPrototypeIntegrity();
  preflightJson(value, "sidecar store entry", {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit: TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes,
  });
  let snapshot: TaskMapIdentityDedupeStoreEntryV1;
  try {
    snapshot = structuredClone(value);
  } catch {
    fail("sidecar store entry must be independently cloneable");
  }
  if (
    snapshot.entryKind !== "projection"
    && snapshot.entryKind !== "no_accepted_origin"
    && snapshot.entryKind !== "rollback_observed"
  ) {
    fail("sidecar store entry has an unsupported kind");
  }
  const commonKeys = [
    "contractVersion",
    "entryId",
    "entryKind",
    "ownerScopeDigest",
    "generation",
    "currentRefId",
    "currentRefDigest",
    "predecessor",
    "semanticHead",
    "privacy",
  ];
  assertExactKeys(
    snapshot,
    snapshot.entryKind === "projection"
      ? [
        ...commonKeys,
        "acceptedOriginBundleId",
        "acceptedOriginReplayDigest",
        "replayClosureDigest",
        "sidecarId",
        "sidecarDigest",
        "diffId",
        "diffDigest",
        "sidecar",
        "diff",
      ]
      : [
        ...commonKeys,
        "publicationState",
        "operation",
        "accepted",
        "rollback",
        "reasonCode",
      ],
    [],
    "sidecar store entry",
  );
  if (
    snapshot.contractVersion
      !== TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION
  ) {
    fail("sidecar store entry has an unsupported contract version");
  }
  assertHashedId(
    snapshot.entryId,
    HASHED_IDS.storeEntry,
    "sidecar store entry ID",
  );
  assertDigest(snapshot.ownerScopeDigest, "sidecar store owner scope");
  assertFixedGeneration(snapshot.generation, "sidecar store generation");
  assertHashedId(
    snapshot.currentRefId,
    HASHED_IDS.currentRef,
    "sidecar store current ref",
  );
  assertDigest(snapshot.currentRefDigest, "sidecar store current ref digest");
  assertExactKeys(
    snapshot.privacy,
    Object.keys(STORE_PRIVACY),
    [],
    "sidecar store privacy",
  );
  if (!canonicalEqual(snapshot.privacy, STORE_PRIVACY)) {
    fail("sidecar store privacy is not fail closed");
  }
  if (snapshot.semanticHead !== null) {
    assertExactKeys(
      snapshot.semanticHead,
      [
        "generation",
        "currentRefId",
        "sidecarId",
        "sidecarDigest",
      ],
      [],
      "sidecar store semantic head",
    );
    assertFixedGeneration(
      snapshot.semanticHead.generation,
      "sidecar store semantic-head generation",
    );
    assertHashedId(
      snapshot.semanticHead.currentRefId,
      HASHED_IDS.currentRef,
      "sidecar store semantic-head current ref",
    );
    assertHashedId(
      snapshot.semanticHead.sidecarId,
      HASHED_IDS.sidecar,
      "sidecar store semantic-head sidecar ID",
    );
    assertDigest(
      snapshot.semanticHead.sidecarDigest,
      "sidecar store semantic-head sidecar digest",
    );
    if (
      BigInt(snapshot.semanticHead.generation)
        > BigInt(snapshot.generation)
    ) {
      fail("sidecar store semantic head is from a future generation");
    }
  }
  if (snapshot.predecessor === null) {
    if (snapshot.generation !== "00000000000000000001") {
      fail("only generation one may omit a sidecar-store predecessor");
    }
  } else {
    assertExactKeys(
      snapshot.predecessor,
      [
        "generation",
        "currentRefId",
        "entryId",
      ],
      [],
      "sidecar store predecessor",
    );
    assertFixedGeneration(
      snapshot.predecessor.generation,
      "sidecar store predecessor generation",
    );
    assertHashedId(
      snapshot.predecessor.currentRefId,
      HASHED_IDS.currentRef,
      "sidecar store predecessor current ref",
    );
    assertHashedId(
      snapshot.predecessor.entryId,
      HASHED_IDS.storeEntry,
      "sidecar store predecessor entry ID",
    );
    if (
      BigInt(snapshot.predecessor.generation) + 1n
        !== BigInt(snapshot.generation)
    ) {
      fail("sidecar store predecessor is not the exact prior generation");
    }
  }
  if (snapshot.entryKind === "projection") {
    assertHashedId(
      snapshot.acceptedOriginBundleId,
      HASHED_IDS.bundle,
      "sidecar store accepted bundle",
    );
    assertDigest(
      snapshot.acceptedOriginReplayDigest,
      "sidecar store accepted origin replay",
    );
    assertDigest(
      snapshot.replayClosureDigest,
      "sidecar store replay closure",
    );
    assertHashedId(
      snapshot.sidecarId,
      HASHED_IDS.sidecar,
      "sidecar store sidecar ID",
    );
    assertDigest(snapshot.sidecarDigest, "sidecar store sidecar digest");
    assertHashedId(
      snapshot.diffId,
      HASHED_IDS.diff,
      "sidecar store diff ID",
    );
    assertDigest(snapshot.diffDigest, "sidecar store diff digest");
    const sidecar = assertTaskMapIdentityDedupeProjection(
      snapshot.sidecar,
    );
    const diff = assertTaskMapIdentityDedupeDiff(snapshot.diff);
    if (
      snapshot.sidecarId !== sidecar.sidecarId
      || snapshot.sidecarDigest !== taskMapContractDigest(sidecar)
      || snapshot.diffId !== diff.diffId
      || snapshot.diffDigest !== taskMapContractDigest(diff)
      || snapshot.ownerScopeDigest !== sidecar.ownerScopeDigest
      || snapshot.generation !== sidecar.origin.currentGeneration
      || snapshot.currentRefId !== sidecar.origin.currentRefId
      || snapshot.acceptedOriginBundleId !== sidecar.origin.bundleId
      || snapshot.acceptedOriginReplayDigest
        !== sidecar.origin.acceptedOriginReplayDigest
      || snapshot.replayClosureDigest
        !== sidecar.origin.replayClosureDigest
      || diff.currentSidecarDigest !== snapshot.sidecarDigest
      || snapshot.semanticHead === null
      || snapshot.semanticHead.generation !== snapshot.generation
      || snapshot.semanticHead.currentRefId !== snapshot.currentRefId
      || snapshot.semanticHead.sidecarId !== snapshot.sidecarId
      || snapshot.semanticHead.sidecarDigest !== snapshot.sidecarDigest
    ) {
      fail("sidecar store entry artifact closure is inconsistent");
    }
  } else {
    if (
      !["complete", "no_op", "blocked", "rollback"]
        .includes(snapshot.operation)
    ) {
      fail("sidecar observation has an unsupported operation");
    }
    if (snapshot.accepted !== null) {
      assertExactKeys(
        snapshot.accepted,
        [
          "acceptedStateDigest",
          "bundleId",
          "planId",
          "batchId",
          "originGeneration",
        ],
        [],
        "sidecar observation accepted tuple",
      );
      assertDigest(
        snapshot.accepted.acceptedStateDigest,
        "sidecar observation accepted-state digest",
      );
      assertHashedId(
        snapshot.accepted.bundleId,
        HASHED_IDS.bundle,
        "sidecar observation accepted bundle",
      );
      assertHashedId(
        snapshot.accepted.planId,
        HASHED_IDS.plan,
        "sidecar observation accepted plan",
      );
      assertHashedId(
        snapshot.accepted.batchId,
        HASHED_IDS.batch,
        "sidecar observation accepted batch",
      );
      assertFixedGeneration(
        snapshot.accepted.originGeneration,
        "sidecar observation accepted origin generation",
      );
    }
    if (snapshot.rollback !== null) {
      assertExactKeys(
        snapshot.rollback,
        [
          "targetGeneration",
          "targetRefId",
          "targetAcceptedStateDigest",
        ],
        [],
        "sidecar observation rollback tuple",
      );
      assertFixedGeneration(
        snapshot.rollback.targetGeneration,
        "sidecar observation rollback target generation",
      );
      assertHashedId(
        snapshot.rollback.targetRefId,
        HASHED_IDS.currentRef,
        "sidecar observation rollback target ref",
      );
      assertDigest(
        snapshot.rollback.targetAcceptedStateDigest,
        "sidecar observation rollback accepted-state digest",
      );
    }
    const isNoAccepted =
      snapshot.entryKind === "no_accepted_origin"
      && snapshot.publicationState === "no_accepted_origin"
      && snapshot.reasonCode === "p10_1_has_no_accepted_origin"
      && snapshot.accepted === null
      && snapshot.rollback === null
      && snapshot.operation !== "complete"
      && snapshot.operation !== "rollback";
    const isRollback =
      snapshot.entryKind === "rollback_observed"
      && snapshot.publicationState === "review_required"
      && snapshot.reasonCode
        === "rollback_requires_reviewed_identity_adjudication"
      && snapshot.operation === "rollback"
      && snapshot.accepted !== null
      && snapshot.rollback !== null
      && snapshot.accepted.acceptedStateDigest
        === snapshot.rollback.targetAcceptedStateDigest;
    if (!isNoAccepted && !isRollback) {
      fail("sidecar observation state is inconsistent");
    }
  }
  const { entryId: _entryId, ...core } = snapshot;
  if (
    snapshot.entryId
      !== stableId("tmidentityentry", storeEntryCore(core))
  ) {
    fail("sidecar store entry ID is not derived from its exact contents");
  }
  const canonicalBytes = taskMapContractCanonicalJson(snapshot);
  if (
    Buffer.byteLength(canonicalBytes, "utf8")
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes
  ) {
    fail("sidecar store entry exceeds its canonical byte bound");
  }
  assertNoSensitiveOutput(snapshot);
  return snapshot;
}

function buildStoreEntry(
  built: BuiltTaskMapIdentityDedupeProjection,
  predecessor: TaskMapIdentityDedupeStoreEntryV1 | null,
  currentRef: TaskMapRefreshCurrentRefV1,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  const sidecar = assertTaskMapIdentityDedupeProjection(built.sidecar);
  const diff = assertTaskMapIdentityDedupeDiff(built.diff);
  const predecessorProof: TaskMapIdentityDedupeStorePredecessorV1 | null =
    predecessor === null
      ? null
      : {
        generation: predecessor.generation,
        currentRefId: predecessor.currentRefId,
        entryId: predecessor.entryId,
      };
  const sidecarDigest = taskMapContractDigest(sidecar);
  const core = storeEntryCore({
    contractVersion: TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION,
    entryKind: "projection" as const,
    ownerScopeDigest: sidecar.ownerScopeDigest,
    generation: sidecar.origin.currentGeneration,
    currentRefId: sidecar.origin.currentRefId,
    currentRefDigest: taskMapContractDigest(currentRef),
    acceptedOriginBundleId: sidecar.origin.bundleId,
    acceptedOriginReplayDigest:
      sidecar.origin.acceptedOriginReplayDigest,
    replayClosureDigest: sidecar.origin.replayClosureDigest,
    sidecarId: sidecar.sidecarId,
    sidecarDigest,
    diffId: diff.diffId,
    diffDigest: taskMapContractDigest(diff),
    predecessor: predecessorProof,
    semanticHead: {
      generation: sidecar.origin.currentGeneration,
      currentRefId: sidecar.origin.currentRefId,
      sidecarId: sidecar.sidecarId,
      sidecarDigest,
    },
    sidecar,
    diff,
    privacy: { ...STORE_PRIVACY },
  });
  return assertTaskMapIdentityDedupeStoreEntry({
    entryId: stableId("tmidentityentry", core),
    ...core,
  }) as TaskMapIdentityDedupeProjectionStoreEntryV1;
}

function buildObservationStoreEntry(
  ref: TaskMapRefreshCurrentRefV1,
  predecessor: TaskMapIdentityDedupeStoreEntryV1 | null,
): TaskMapIdentityDedupeObservationStoreEntryV1 {
  const predecessorProof: TaskMapIdentityDedupeStorePredecessorV1 | null =
    predecessor === null
      ? null
      : {
        generation: predecessor.generation,
        currentRefId: predecessor.currentRefId,
        entryId: predecessor.entryId,
      };
  const isRollback = ref.operation === "rollback";
  if (
    isRollback
      ? ref.accepted === undefined || ref.rollback === undefined
      : ref.accepted !== undefined
        || ref.rollback !== undefined
        || ref.operation === "complete"
  ) {
    fail("P10.1 ref cannot be represented as a non-semantic observation");
  }
  if (
    isRollback
    && (predecessor === null || predecessor.semanticHead === null)
  ) {
    fail("rollback observation has no authenticated semantic predecessor");
  }
  const core = storeEntryCore({
    contractVersion: TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION,
    entryKind: isRollback
      ? "rollback_observed" as const
      : "no_accepted_origin" as const,
    ownerScopeDigest: ref.ownerScopeDigest,
    generation: ref.generation,
    currentRefId: ref.refId,
    currentRefDigest: taskMapContractDigest(ref),
    predecessor: predecessorProof,
    semanticHead: predecessor?.semanticHead ?? null,
    publicationState: isRollback
      ? "review_required" as const
      : "no_accepted_origin" as const,
    operation: ref.operation,
    accepted: ref.accepted === undefined
      ? null
      : structuredClone(ref.accepted),
    rollback: ref.rollback === undefined
      ? null
      : structuredClone(ref.rollback),
    reasonCode: isRollback
      ? "rollback_requires_reviewed_identity_adjudication" as const
      : "p10_1_has_no_accepted_origin" as const,
    privacy: { ...STORE_PRIVACY },
  });
  return assertTaskMapIdentityDedupeStoreEntry({
    entryId: stableId("tmidentityentry", core),
    ...core,
  }) as TaskMapIdentityDedupeObservationStoreEntryV1;
}

type CheckedSidecarDirectory = {
  directory: string;
  stats: BigIntStats;
};

type OpenSidecarStore = {
  root: CheckedSidecarDirectory;
  generations: CheckedSidecarDirectory;
  staging: CheckedSidecarDirectory;
  claims: CheckedSidecarDirectory;
};

type CheckedTaskMapStoreRoots = Record<
  keyof TaskMapIdentityDedupeStoreRoots,
  { canonical: string; dev: bigint; ino: bigint }
>;

async function assertDisjointTaskMapStoreRoots(
  roots: TaskMapIdentityDedupeStoreRoots,
): Promise<CheckedTaskMapStoreRoots> {
  const candidates = [
    ["currentRoot", roots.currentRoot],
    ["runRoot", roots.runRoot],
    ["sidecarRoot", roots.sidecarRoot],
  ] as const;
  const resolved: Array<{
    label: typeof candidates[number][0];
    canonical: string;
    dev: bigint;
    ino: bigint;
  }> = [];
  for (const [label, candidate] of candidates) {
    if (!path.isAbsolute(candidate)) {
      fail(`${label} must be an absolute path`);
    }
    let canonical: string;
    let stats: BigIntStats;
    try {
      canonical = await realpath(path.resolve(candidate));
      stats = await lstat(canonical, { bigint: true });
    } catch {
      fail(`${label} is unavailable for store-root isolation`);
    }
    if (!stats.isDirectory()) {
      fail(`${label} must resolve to a directory`);
    }
    resolved.push({
      label,
      canonical,
      dev: stats.dev,
      ino: stats.ino,
    });
  }
  const contains = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return (
      relative === ""
      || (
        relative !== ".."
        && !relative.startsWith(`..${path.sep}`)
        && !path.isAbsolute(relative)
      )
    );
  };
  for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < resolved.length;
      rightIndex += 1
    ) {
      const left = resolved[leftIndex]!;
      const right = resolved[rightIndex]!;
      if (
        contains(left.canonical, right.canonical)
        || contains(right.canonical, left.canonical)
        || (
          left.dev === right.dev
          && left.ino === right.ino
        )
      ) {
        fail(
          `task-map store roots must be realpath-disjoint; `
            + `${left.label} overlaps ${right.label}`,
        );
      }
    }
  }
  return Object.fromEntries(resolved.map((entry) => [
    entry.label,
    {
      canonical: entry.canonical,
      dev: entry.dev,
      ino: entry.ino,
    },
  ])) as CheckedTaskMapStoreRoots;
}

async function revalidateDisjointTaskMapStoreRoots(
  roots: TaskMapIdentityDedupeStoreRoots,
  expected: CheckedTaskMapStoreRoots,
): Promise<void> {
  const current = await assertDisjointTaskMapStoreRoots(roots);
  for (const label of [
    "currentRoot",
    "runRoot",
    "sidecarRoot",
  ] as const) {
    if (
      current[label].canonical !== expected[label].canonical
      || current[label].dev !== expected[label].dev
      || current[label].ino !== expected[label].ino
    ) {
      fail(`${label} was replaced after store-root isolation`);
    }
  }
}

function sidecarErrnoCode(error: unknown): string | undefined {
  if (
    error !== null
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

function sidecarCurrentUid(): number {
  if (typeof process.getuid !== "function") {
    fail("sidecar store owner UID verification is unavailable");
  }
  return process.getuid();
}

function sidecarModeBits(stats: BigIntStats): number {
  return Number(stats.mode & 0o7777n);
}

async function checkedSidecarDirectory(
  directory: string,
  label: string,
): Promise<CheckedSidecarDirectory> {
  if (!path.isAbsolute(directory)) {
    fail(`${label} must be an absolute path`);
  }
  const normalized = path.resolve(directory);
  let stats: BigIntStats;
  let canonical: string;
  try {
    stats = await lstat(normalized, { bigint: true });
    canonical = await realpath(normalized);
  } catch {
    fail(`${label} is unavailable`);
  }
  if (
    !stats.isDirectory()
    || stats.isSymbolicLink()
    || stats.uid !== BigInt(sidecarCurrentUid())
    || sidecarModeBits(stats) !== DIRECTORY_MODE
    || canonical !== normalized
  ) {
    fail(`${label} must be a same-owner 0700 real directory`);
  }
  return { directory: canonical, stats };
}

async function revalidateSidecarDirectory(
  checked: CheckedSidecarDirectory,
  label: string,
): Promise<void> {
  const current = await checkedSidecarDirectory(checked.directory, label);
  if (
    current.stats.dev !== checked.stats.dev
    || current.stats.ino !== checked.stats.ino
  ) {
    fail(`${label} was replaced after validation`);
  }
}

function revalidateSidecarDirectorySync(
  checked: CheckedSidecarDirectory,
  label: string,
): BigIntStats {
  let current: BigIntStats;
  try {
    current = lstatSync(checked.directory, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || current.uid !== BigInt(sidecarCurrentUid())
    || sidecarModeBits(current) !== DIRECTORY_MODE
    || current.dev !== checked.stats.dev
    || current.ino !== checked.stats.ino
  ) {
    fail(`${label} was replaced after validation`);
  }
  return current;
}

function observeSidecarDirectorySync(
  directory: string,
  label: string,
): BigIntStats {
  let current: BigIntStats;
  try {
    current = lstatSync(directory, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  if (
    !current.isDirectory()
    || current.isSymbolicLink()
    || current.uid !== BigInt(sidecarCurrentUid())
    || sidecarModeBits(current) !== DIRECTORY_MODE
  ) {
    fail(`${label} must remain a same-owner 0700 real directory`);
  }
  return current;
}

function openVerifiedSidecarParentSync(
  checked: CheckedSidecarDirectory,
  label: string,
): number {
  revalidateSidecarDirectorySync(checked, label);
  let descriptor: number;
  try {
    descriptor = openSync(
      checked.directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isDirectory()
      || opened.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(opened) !== DIRECTORY_MODE
      || opened.dev !== checked.stats.dev
      || opened.ino !== checked.stats.ino
    ) {
      closeSync(descriptor);
      fail(`${label} changed while opening its mutation guard`);
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot open an exact mutation guard`);
  }
  return descriptor;
}

function checkedSidecarParentStillCurrentSync(
  descriptor: number,
  checked: CheckedSidecarDirectory,
): boolean {
  const opened = fstatSync(descriptor, { bigint: true });
  let current: BigIntStats;
  try {
    current = lstatSync(checked.directory, { bigint: true });
  } catch {
    return false;
  }
  return (
    opened.isDirectory()
    && opened.uid === BigInt(sidecarCurrentUid())
    && sidecarModeBits(opened) === DIRECTORY_MODE
    && opened.dev === checked.stats.dev
    && opened.ino === checked.stats.ino
    && current.isDirectory()
    && !current.isSymbolicLink()
    && current.uid === opened.uid
    && sidecarModeBits(current) === DIRECTORY_MODE
    && current.dev === opened.dev
    && current.ino === opened.ino
  );
}

function unlinkExactCreatedSidecarFileSync(
  filePath: string,
  expectedParent: BigIntStats,
  expectedFile: BigIntStats,
  expectedBytes: string | Uint8Array,
  label: string,
): void {
  const expectedBuffer = typeof expectedBytes === "string"
    ? Buffer.from(expectedBytes, "utf8")
    : Buffer.from(expectedBytes);
  let parentDescriptor: number | undefined;
  let fileDescriptor: number | undefined;
  try {
    parentDescriptor = openSync(
      path.dirname(filePath),
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const openedParent = fstatSync(parentDescriptor, { bigint: true });
    if (
      !openedParent.isDirectory()
      || openedParent.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(openedParent) !== DIRECTORY_MODE
      || openedParent.dev !== expectedParent.dev
      || openedParent.ino !== expectedParent.ino
    ) {
      fail(`${label} parent changed before exact rollback`);
    }
    const observed = lstatSync(filePath, { bigint: true });
    const expectedMode = sidecarModeBits(expectedFile);
    if (
      !observed.isFile()
      || observed.isSymbolicLink()
      || observed.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(observed) !== expectedMode
      || (expectedMode & ~FILE_MODE) !== 0
      || observed.dev !== expectedFile.dev
      || observed.ino !== expectedFile.ino
      || observed.nlink !== 1n
      || observed.size !== expectedFile.size
      || observed.size !== BigInt(expectedBuffer.byteLength)
    ) {
      fail(`${label} is not the exact created file`);
    }
    let verifiedFile = observed;
    if (expectedBuffer.byteLength > 0) {
      fileDescriptor = openSync(
        filePath,
        FS_CONSTANTS.O_RDONLY
          | FS_CONSTANTS.O_NOFOLLOW
          | FS_CONSTANTS.O_NONBLOCK,
      );
      const opened = fstatSync(fileDescriptor, { bigint: true });
      if (
        opened.dev !== observed.dev
        || opened.ino !== observed.ino
        || opened.uid !== observed.uid
        || sidecarModeBits(opened) !== expectedMode
        || opened.nlink !== 1n
        || opened.size !== observed.size
      ) {
        fail(`${label} changed while opening for exact rollback`);
      }
      const bytes = readFileSync(fileDescriptor);
      if (
        BigInt(bytes.byteLength) !== opened.size
        || !bytes.equals(expectedBuffer)
      ) {
        fail(`${label} bytes changed before exact rollback`);
      }
      verifiedFile = opened;
    }
    const finalParent = lstatSync(
      path.dirname(filePath),
      { bigint: true },
    );
    const finalFile = lstatSync(filePath, { bigint: true });
    if (
      finalParent.dev !== openedParent.dev
      || finalParent.ino !== openedParent.ino
      || finalFile.dev !== verifiedFile.dev
      || finalFile.ino !== verifiedFile.ino
      || finalFile.uid !== verifiedFile.uid
      || sidecarModeBits(finalFile) !== expectedMode
      || finalFile.nlink !== 1n
      || finalFile.size !== verifiedFile.size
    ) {
      fail(`${label} changed immediately before exact rollback`);
    }
    unlinkSync(filePath);
    fsyncSync(parentDescriptor);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot be rolled back exactly`);
  } finally {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        // Exact rollback success/failure was already decided above.
      }
    }
    if (parentDescriptor !== undefined) {
      try {
        closeSync(parentDescriptor);
      } catch {
        // Directory durability was already attempted before close.
      }
    }
  }
}

function removeExactCreatedSidecarDirectorySync(
  directory: string,
  expectedParent: BigIntStats,
  expectedDirectory: BigIntStats,
  label: string,
): void {
  let parentDescriptor: number | undefined;
  try {
    parentDescriptor = openSync(
      path.dirname(directory),
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const openedParent = fstatSync(parentDescriptor, { bigint: true });
    if (
      !openedParent.isDirectory()
      || openedParent.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(openedParent) !== DIRECTORY_MODE
      || openedParent.dev !== expectedParent.dev
      || openedParent.ino !== expectedParent.ino
    ) {
      fail(`${label} parent changed before exact rollback`);
    }
    const observed = lstatSync(directory, { bigint: true });
    const expectedMode = sidecarModeBits(expectedDirectory);
    if (
      !observed.isDirectory()
      || observed.isSymbolicLink()
      || observed.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(observed) !== expectedMode
      || (expectedMode & ~DIRECTORY_MODE) !== 0
      || observed.dev !== expectedDirectory.dev
      || observed.ino !== expectedDirectory.ino
      || readdirSync(directory).length !== 0
    ) {
      fail(`${label} is not the exact empty created directory`);
    }
    const finalParent = lstatSync(
      path.dirname(directory),
      { bigint: true },
    );
    const finalDirectory = lstatSync(directory, { bigint: true });
    if (
      finalParent.dev !== openedParent.dev
      || finalParent.ino !== openedParent.ino
      || finalDirectory.dev !== observed.dev
      || finalDirectory.ino !== observed.ino
      || readdirSync(directory).length !== 0
    ) {
      fail(`${label} changed immediately before exact rollback`);
    }
    rmdirSync(directory);
    fsyncSync(parentDescriptor);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot be rolled back exactly`);
  } finally {
    if (parentDescriptor !== undefined) {
      try {
        closeSync(parentDescriptor);
      } catch {
        // Directory durability was already attempted before close.
      }
    }
  }
}

type CreatedSidecarDirectory = {
  directory: string;
  stats: BigIntStats;
};

function createSidecarDirectoryGuardedSync(
  parent: CheckedSidecarDirectory,
  parentDescriptor: number,
  directory: string,
  label: string,
): CreatedSidecarDirectory | null {
  let created = false;
  let createdStats: BigIntStats | undefined;
  let childDescriptor: number | undefined;
  if (
    !checkedSidecarParentStillCurrentSync(parentDescriptor, parent)
  ) {
    fail(`${label} parent was replaced before creation`);
  }
  try {
    try {
      mkdirSync(directory, { mode: DIRECTORY_MODE });
      created = true;
    } catch (error) {
      if (sidecarErrnoCode(error) !== "EEXIST") {
        fail(`cannot initialize ${label}`);
      }
      const existing = observeSidecarDirectorySync(directory, label);
      if (
        existing.dev !== parent.stats.dev
        || !checkedSidecarParentStillCurrentSync(
          parentDescriptor,
          parent,
        )
      ) {
        fail(`${label} is outside its validated parent`);
      }
      return null;
    }

    // Capture the created inode before any later operation can fail. There is
    // no await between mkdir and this receipt under the cooperative same-UID
    // boundary.
    createdStats = lstatSync(directory, { bigint: true });
    childDescriptor = openSync(
      directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(childDescriptor, { bigint: true });
    if (
      !opened.isDirectory()
      || opened.uid !== BigInt(sidecarCurrentUid())
      || opened.dev !== createdStats.dev
      || opened.ino !== createdStats.ino
    ) {
      fail(`${label} changed while opening after creation`);
    }
    fchmodSync(childDescriptor, DIRECTORY_MODE);
    createdStats = fstatSync(childDescriptor, { bigint: true });
    if (
      !createdStats.isDirectory()
      || createdStats.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(createdStats) !== DIRECTORY_MODE
      || createdStats.dev !== parent.stats.dev
      || createdStats.dev !== opened.dev
      || createdStats.ino !== opened.ino
      || !checkedSidecarParentStillCurrentSync(
        parentDescriptor,
        parent,
      )
    ) {
      fail(`${label} changed during creation`);
    }
    fsyncSync(childDescriptor);
    return { directory, stats: createdStats };
  } catch (error) {
    if (!created) {
      if (
        error instanceof Error
        && error.message.startsWith("P10.2 identity/dedupe projection:")
      ) {
        throw error;
      }
      fail(`cannot initialize ${label}`);
    }
    if (childDescriptor !== undefined) {
      try {
        closeSync(childDescriptor);
      } catch {
        // Rollback below remains bound to the captured pathname inode.
      }
      childDescriptor = undefined;
    }
    if (createdStats === undefined) {
      try {
        createdStats = lstatSync(directory, { bigint: true });
      } catch {
        // The exact rollback failure is surfaced with the creation failure.
      }
    }
    const rollbackErrors: unknown[] = [];
    if (
      createdStats !== undefined
      && checkedSidecarParentStillCurrentSync(parentDescriptor, parent)
    ) {
      try {
        removeExactCreatedSidecarDirectorySync(
          directory,
          parent.stats,
          createdStats,
          label,
        );
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    } else {
      rollbackErrors.push(
        new Error(
          `P10.2 identity/dedupe projection: ${label} has no exact `
            + "rollback receipt",
        ),
      );
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "P10.2 identity/dedupe projection: sidecar directory creation "
          + "failed and exact rollback was not possible",
      );
    }
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`cannot initialize ${label}`);
  } finally {
    if (childDescriptor !== undefined) {
      try {
        closeSync(childDescriptor);
      } catch {
        // The created directory was already validated by its open handle.
      }
    }
  }
  fail(`cannot initialize ${label}`);
}

async function syncSidecarDirectory(
  checked: CheckedSidecarDirectory,
  label: string,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      checked.directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const stats = await handle.stat({ bigint: true });
    if (
      !stats.isDirectory()
      || stats.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(stats) !== DIRECTORY_MODE
      || stats.dev !== checked.stats.dev
      || stats.ino !== checked.stats.ino
    ) {
      fail(`${label} changed before sync`);
    }
    await handle.sync();
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    const code = sidecarErrnoCode(error);
    fail(`${label} sync failed${code === undefined ? "" : ` (${code})`}`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function listSidecarDirectory(
  checked: CheckedSidecarDirectory,
  label: string,
  maximum: number,
): Promise<string[]> {
  const names: string[] = [];
  let directory;
  try {
    directory = await opendir(checked.directory);
    for await (const entry of directory) {
      names.push(entry.name);
      if (names.length > maximum) {
        fail(`${label} exceeds its entry bound`);
      }
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot be enumerated`);
  } finally {
    await directory?.close().catch(() => undefined);
  }
  return names.sort(compareText);
}

async function openSidecarStore(
  sidecarRoot: string,
): Promise<OpenSidecarStore> {
  const root = await checkedSidecarDirectory(
    sidecarRoot,
    "sidecar store root",
  );
  const rootEntries = await listSidecarDirectory(
    root,
    "sidecar store root",
    3,
  );
  if (!canonicalEqual(rootEntries, [
    STORE_CLAIMS_DIRECTORY,
    STORE_GENERATIONS_DIRECTORY,
    STORE_STAGING_DIRECTORY,
  ])) {
    fail("sidecar store root contains unknown entries");
  }
  const generations = await checkedSidecarDirectory(
    path.join(root.directory, STORE_GENERATIONS_DIRECTORY),
    "sidecar store generations directory",
  );
  const staging = await checkedSidecarDirectory(
    path.join(root.directory, STORE_STAGING_DIRECTORY),
    "sidecar store staging directory",
  );
  const claims = await checkedSidecarDirectory(
    path.join(root.directory, STORE_CLAIMS_DIRECTORY),
    "sidecar store claims directory",
  );
  if (
    generations.stats.dev !== root.stats.dev
    || staging.stats.dev !== root.stats.dev
    || claims.stats.dev !== root.stats.dev
  ) {
    fail("sidecar store must remain on one volume");
  }
  return { root, generations, staging, claims };
}

function revalidateOpenSidecarStoreSync(
  store: OpenSidecarStore,
  label: string,
): void {
  revalidateSidecarDirectorySync(store.root, `${label} root`);
  for (const [name, child] of [
    ["generations", store.generations],
    ["staging", store.staging],
    ["claims", store.claims],
  ] as const) {
    const stats = revalidateSidecarDirectorySync(
      child,
      `${label} ${name} directory`,
    );
    if (stats.dev !== store.root.stats.dev) {
      fail(`${label} ${name} directory left the store volume`);
    }
  }
}

async function assertSidecarFileStats(
  filePath: string,
  label: string,
  allowedLinks: readonly number[],
  expectedDev: bigint,
  minimumBytes = 1,
): Promise<BigIntStats> {
  let stats: BigIntStats;
  try {
    stats = await lstat(filePath, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || stats.uid !== BigInt(sidecarCurrentUid())
    || sidecarModeBits(stats) !== FILE_MODE
    || stats.dev !== expectedDev
    || !allowedLinks.includes(Number(stats.nlink))
    || stats.size < BigInt(minimumBytes)
    || stats.size
      > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes)
  ) {
    fail(`${label} must be a bounded same-owner 0600 regular file`);
  }
  return stats;
}

async function readSidecarEntryFile(
  filePath: string,
  label: string,
  allowedLinks: readonly number[],
  expectedDev: bigint,
): Promise<{
  entry: TaskMapIdentityDedupeStoreEntryV1;
  bytes: string;
  stats: BigIntStats;
}> {
  const observed = await assertSidecarFileStats(
    filePath,
    label,
    allowedLinks,
    expectedDev,
  );
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      filePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const stats = await handle.stat({ bigint: true });
    if (
      stats.dev !== observed.dev
      || stats.ino !== observed.ino
      || stats.size !== observed.size
      || stats.uid !== observed.uid
      || sidecarModeBits(stats) !== FILE_MODE
      || !allowedLinks.includes(Number(stats.nlink))
    ) {
      fail(`${label} changed while opening`);
    }
    const buffer = await handle.readFile();
    if (BigInt(buffer.byteLength) !== stats.size) {
      fail(`${label} changed while reading`);
    }
    const bytes = decodeExactUtf8(buffer, label);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      fail(`${label} is not valid JSON`);
    }
    const entry = assertTaskMapIdentityDedupeStoreEntry(
      parsed as TaskMapIdentityDedupeStoreEntryV1,
    );
    const canonicalBytes = taskMapContractCanonicalJson(entry);
    if (
      canonicalBytes !== bytes
      || !Buffer.from(canonicalBytes, "utf8").equals(buffer)
    ) {
      fail(`${label} is not exact canonical JSON`);
    }
    return { entry, bytes, stats };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function sidecarGenerationFileName(generation: string): string {
  assertFixedGeneration(generation, "sidecar generation");
  return `${generation}.entry.json`;
}

export async function initializeTaskMapIdentityDedupeProjectionStore(
  roots: TaskMapIdentityDedupeStoreRoots,
  writeOptions: TaskMapIdentityDedupeWriteOptions = {},
): Promise<void> {
  const snapshot = snapshotStoreRoots(roots);
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(snapshot);
  const root = await checkedSidecarDirectory(
    snapshot.sidecarRoot,
    "sidecar store root",
  );
  const priorNames = await listSidecarDirectory(
    root,
    "sidecar store root",
    3,
  );
  for (const name of priorNames) {
    if (
      name !== STORE_GENERATIONS_DIRECTORY
      && name !== STORE_STAGING_DIRECTORY
      && name !== STORE_CLAIMS_DIRECTORY
    ) {
      fail("sidecar store root contains unknown entries");
    }
  }
  await writeOptions.faultInjection?.(
    "before_initialize_directory_create",
  );
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  const rootDescriptor = openVerifiedSidecarParentSync(
    root,
    "sidecar store root",
  );
  const created: CreatedSidecarDirectory[] = [];
  try {
    for (const name of [
      STORE_GENERATIONS_DIRECTORY,
      STORE_STAGING_DIRECTORY,
      STORE_CLAIMS_DIRECTORY,
    ]) {
      const directory = path.join(root.directory, name);
      const receipt = createSidecarDirectoryGuardedSync(
        root,
        rootDescriptor,
        directory,
        `sidecar store ${name} directory`,
      );
      if (receipt !== null) created.push(receipt);
    }
    if (!checkedSidecarParentStillCurrentSync(rootDescriptor, root)) {
      fail("sidecar store root was replaced during initialization");
    }
    fsyncSync(rootDescriptor);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const receipt of [...created].reverse()) {
      if (!checkedSidecarParentStillCurrentSync(rootDescriptor, root)) {
        rollbackErrors.push(
          new Error(
            "P10.2 identity/dedupe projection: sidecar store root "
              + "changed before initialization rollback",
          ),
        );
        break;
      }
      try {
        removeExactCreatedSidecarDirectorySync(
          receipt.directory,
          root.stats,
          receipt.stats,
          `sidecar store ${path.basename(receipt.directory)} directory`,
        );
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "P10.2 identity/dedupe projection: sidecar store initialization "
          + "failed and exact rollback was not complete",
      );
    }
    throw error;
  } finally {
    try {
      closeSync(rootDescriptor);
    } catch {
      // The root transaction was already synced or exactly rolled back.
    }
  }
}

async function readSidecarStoreFromOpen(
  store: OpenSidecarStore,
  allowKnownStaging = false,
  allowedLinkedGenerationInodes: ReadonlySet<string> = new Set(),
): Promise<TaskMapIdentityDedupeStoreSnapshotV1> {
  await validateSidecarClaimDirectory(store);
  const stagingNames = await listSidecarDirectory(
    store.staging,
    "sidecar store staging directory",
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries,
  );
  let stagingBytes = 0n;
  for (const name of stagingNames) {
    if (!STORE_STAGE_FILE.test(name)) {
      fail("sidecar store staging directory contains an unknown entry");
    }
    const stage = await assertRecoverableSidecarStage(
      path.join(store.staging.directory, name),
      `sidecar staged entry ${name}`,
      store.staging.stats.dev,
    );
    stagingBytes += stage.size;
    if (
      stagingBytes
        > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingBytes)
    ) {
      fail("sidecar staging exceeds its aggregate byte bound");
    }
  }
  if (!allowKnownStaging && stagingNames.length > 0) {
    fail("sidecar store has interrupted staging state; recovery is required");
  }
  const names = await listSidecarDirectory(
    store.generations,
    "sidecar store generations directory",
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries,
  );
  const entries: TaskMapIdentityDedupeStoreEntryV1[] = [];
  let retainedHistoryBytes = 0n;
  let semanticSidecar: TaskMapIdentityDedupeProjectionV1 | null = null;
  let semanticHead: TaskMapIdentityDedupeSemanticHeadV1 | null = null;
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]!;
    const match = STORE_GENERATION_FILE.exec(name);
    if (match === null || match[1] !== expectedGeneration(index)) {
      fail(
        "sidecar store generations must be an exact contiguous prefix",
      );
    }
    const generationPath = path.join(store.generations.directory, name);
    const generationStats = await assertSidecarFileStats(
      generationPath,
      `sidecar store generation ${match[1]}`,
      allowedLinkedGenerationInodes.size === 0 ? [1] : [1, 2],
      store.generations.stats.dev,
    );
    if (
      generationStats.nlink === 2n
      && !allowedLinkedGenerationInodes.has(
        `${generationStats.dev}:${generationStats.ino}`,
      )
    ) {
      fail("sidecar store generation has an unbound extra hardlink");
    }
    retainedHistoryBytes += generationStats.size;
    if (
      retainedHistoryBytes
        > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes)
    ) {
      fail("sidecar store history exceeds its aggregate byte bound");
    }
    const observed = await readSidecarEntryFile(
      generationPath,
      `sidecar store generation ${match[1]}`,
      allowedLinkedGenerationInodes.size === 0 ? [1] : [1, 2],
      store.generations.stats.dev,
    );
    const entry = observed.entry;
    if (entry.generation !== match[1]) {
      fail("sidecar store generation filename/content mismatch");
    }
    const predecessor = index === 0 ? null : entries[index - 1]!;
    if (
      predecessor === null
        ? entry.predecessor !== null
        : (
          entry.predecessor === null
          || entry.predecessor.generation !== predecessor.generation
          || entry.predecessor.currentRefId !== predecessor.currentRefId
          || entry.predecessor.entryId !== predecessor.entryId
        )
    ) {
      fail("sidecar store predecessor entry chain is inconsistent");
    }
    if (entry.entryKind === "projection") {
      const expectedDiff = buildDiff(semanticSidecar, entry.sidecar);
      if (!canonicalEqual(entry.diff, expectedDiff)) {
        fail("sidecar store diff is not derived from semantic history");
      }
      if (semanticSidecar !== null) {
        assertAdjacentSidecarLifecycleContinuity(
          semanticSidecar,
          entry.sidecar,
        );
      }
      semanticSidecar = entry.sidecar;
      semanticHead = entry.semanticHead;
    } else if (!canonicalEqual(entry.semanticHead, semanticHead)) {
      fail("sidecar observation changed the authenticated semantic head");
    }
    if (
      predecessor !== null
      && predecessor.ownerScopeDigest !== entry.ownerScopeDigest
    ) {
      fail("sidecar store crosses owner scope");
    }
    if (
      entry.semanticHead !== null
      && semanticSidecar !== null
      && (
        entry.semanticHead.sidecarId !== semanticSidecar.sidecarId
        || entry.semanticHead.sidecarDigest
          !== taskMapContractDigest(semanticSidecar)
      )
    ) {
      fail("sidecar semantic head does not resolve to stored semantics");
    }
    entries.push(entry);
  }
  await revalidateSidecarDirectory(
    store.generations,
    "sidecar store generations directory",
  );
  await revalidateSidecarDirectory(
    store.staging,
    "sidecar store staging directory",
  );
  await revalidateSidecarDirectory(
    store.root,
    "sidecar store root",
  );
  await revalidateSidecarDirectory(
    store.claims,
    "sidecar store claims directory",
  );
  await validateSidecarClaimDirectory(store);
  const canonicalByteLength = Number(retainedHistoryBytes);
  return {
    entries,
    canonicalByteLength,
    remainingByteCapacity:
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes
        - canonicalByteLength,
  };
}

async function readTaskMapIdentityDedupeProjectionStoreStructural(
  sidecarRoot: string,
): Promise<TaskMapIdentityDedupeStoreSnapshotV1> {
  assertArrayPrototypeIntegrity();
  return readSidecarStoreFromOpen(await openSidecarStore(sidecarRoot));
}

/**
 * TEST-ONLY structural parser. It validates sidecar bytes and local history,
 * but cannot authenticate semantic rows against P10.1 accepted bundles.
 */
export async function unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest(
  sidecarRoot: string,
): Promise<TaskMapIdentityDedupeStoreSnapshotV1> {
  return readTaskMapIdentityDedupeProjectionStoreStructural(sidecarRoot);
}

/**
 * Product/authenticated reader. Every semantic entry is checked against the
 * exact immutable P10.1 accepted bundle and deterministic replay digest.
 */
export async function readTaskMapIdentityDedupeProjectionStore(
  roots: TaskMapIdentityDedupeStoreRoots,
): Promise<TaskMapIdentityDedupeStoreSnapshotV1> {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotStoreRoots(roots, "sidecar authenticated-read roots");
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(snapshot);
  const currentSnapshot = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  assertHealthyCurrentHistory(currentSnapshot);
  const store = await readTaskMapIdentityDedupeProjectionStoreStructural(
    snapshot.sidecarRoot,
  );
  const { currentEntry } = assertSidecarStoreAlignedWithCurrent(
    store,
    currentSnapshot,
  );
  if (
    currentSnapshot.generations.length > 0
    && currentEntry === null
  ) {
    fail("authenticated sidecar store is not caught up to the P10.1 head");
  }
  await verifySidecarStoreAcceptedOrigins(
    store,
    currentSnapshot,
    snapshot.runRoot,
  );
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  const latest = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  if (!sameCurrentHead(currentSnapshot, latest)) {
    fail("P10.1 current head advanced during authenticated sidecar read");
  }
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  return store;
}

type SidecarWriterClaim = {
  token: string;
  claimPath: string;
  stats: BigIntStats;
  bytes: string;
};

type SidecarRecoveryClaim = {
  claimPath: string;
  stats: BigIntStats;
  bytes: string;
};

type SidecarWriterJournal = {
  contractVersion: typeof STORE_WRITER_JOURNAL_VERSION;
  writerToken: string;
  stageFileName: string;
  stageDevice: string;
  stageInode: string;
};

export interface TaskMapIdentityDedupeRecoveryOptions {
  /** Stable caller-owned token identifying this recovery attempt. */
  operationToken: string;
  /**
   * Explicit takeover of a recovery claim left by a crashed process. This is
   * accepted only together with externalExclusivityAsserted.
   */
  takeOverRecoveryClaim?: boolean;
  /** Assertion that an out-of-process mechanism has quiesced recoverers. */
  externalExclusivityAsserted?: boolean;
  /**
   * Explicit assertion that every writer is quiescent under an external
   * exclusivity mechanism. Recovery never infers process death.
   */
  abandonWriterClaims?: boolean;
}

async function sidecarPathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath, { bigint: true });
    return true;
  } catch (error) {
    if (sidecarErrnoCode(error) === "ENOENT") return false;
    fail("sidecar claim path cannot be inspected");
  }
}

function writeExclusiveSidecarClaim(
  parent: CheckedSidecarDirectory,
  claimPath: string,
  label: string,
  bytes = "",
): BigIntStats {
  const parentDescriptor = openVerifiedSidecarParentSync(
    parent,
    `${label} parent`,
  );
  let descriptor: number | undefined;
  let createdStats: BigIntStats | undefined;
  let rollbackBytes = Buffer.alloc(0);
  let rolledBack = false;
  try {
    descriptor = openSync(
      claimPath,
      FS_CONSTANTS.O_RDWR
        | FS_CONSTANTS.O_CREAT
        | FS_CONSTANTS.O_EXCL
        | FS_CONSTANTS.O_NOFOLLOW,
      FILE_MODE,
    );
    createdStats = fstatSync(descriptor, { bigint: true });
    fchmodSync(descriptor, FILE_MODE);
    createdStats = fstatSync(descriptor, { bigint: true });
    const buffer = Buffer.from(bytes, "utf8");
    if (buffer.byteLength > 0) {
      const written = writeSync(
        descriptor,
        buffer,
        0,
        buffer.byteLength,
        0,
      );
      rollbackBytes = buffer.subarray(0, written);
      createdStats = fstatSync(descriptor, { bigint: true });
      if (written !== buffer.byteLength) {
        fail(`${label} write was incomplete`);
      }
    }
    fsyncSync(descriptor);
    createdStats = fstatSync(descriptor, { bigint: true });
    if (
      !createdStats.isFile()
      || createdStats.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(createdStats) !== FILE_MODE
      || createdStats.nlink !== 1n
      || createdStats.size !== BigInt(buffer.byteLength)
    ) {
      fail(`${label} changed while being created`);
    }
    if (
      !checkedSidecarParentStillCurrentSync(parentDescriptor, parent)
    ) {
      closeSync(descriptor);
      descriptor = undefined;
      const currentParent = observeSidecarDirectorySync(
        parent.directory,
        `${label} replacement parent`,
      );
      unlinkExactCreatedSidecarFileSync(
        claimPath,
        currentParent,
        createdStats,
        rollbackBytes,
        label,
      );
      rolledBack = true;
      fail(`${label} parent was replaced during creation`);
    }
    return createdStats;
  } catch (error) {
    if (sidecarErrnoCode(error) === "EEXIST") throw error;
    if (
      createdStats !== undefined
      && !rolledBack
      && checkedSidecarParentStillCurrentSync(parentDescriptor, parent)
    ) {
      if (descriptor !== undefined) {
        closeSync(descriptor);
        descriptor = undefined;
      }
      unlinkExactCreatedSidecarFileSync(
        claimPath,
        parent.stats,
        createdStats,
        rollbackBytes,
        label,
      );
      rolledBack = true;
    }
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`cannot create ${label}`);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The exact created file is either durable or already rolled back.
      }
    }
    try {
      closeSync(parentDescriptor);
    } catch {
      // The parent guard was already checked around the mutation.
    }
  }
  fail(`cannot create ${label}`);
}

async function assertRecoverableSidecarClaim(
  claimPath: string,
  label: string,
  expectedDev: bigint,
  maximumBytes = 128,
): Promise<BigIntStats> {
  let observed: BigIntStats;
  try {
    observed = await lstat(claimPath, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  const mode = sidecarModeBits(observed);
  if (
    !observed.isFile()
    || observed.isSymbolicLink()
    || observed.uid !== BigInt(sidecarCurrentUid())
    || observed.dev !== expectedDev
    || observed.nlink !== 1n
    || observed.size > BigInt(maximumBytes)
    || (mode & ~FILE_MODE) !== 0
  ) {
    fail(`${label} is not a recoverable same-owner claim`);
  }
  return observed;
}

async function bindSidecarWriterClaimToStage(
  store: OpenSidecarStore,
  claim: SidecarWriterClaim,
  stagePath: string,
  stageStats: BigIntStats,
): Promise<SidecarWriterJournal> {
  const journal: SidecarWriterJournal = {
    contractVersion: STORE_WRITER_JOURNAL_VERSION,
    writerToken: claim.token,
    stageFileName: path.basename(stagePath),
    stageDevice: stageStats.dev.toString(),
    stageInode: stageStats.ino.toString(),
  };
  const bytes = taskMapContractCanonicalJson(journal);
  if (Buffer.byteLength(bytes, "utf8") > MAX_WRITER_JOURNAL_BYTES) {
    fail("sidecar writer journal exceeds its byte bound");
  }
  const observed = await assertRecoverableSidecarClaim(
    claim.claimPath,
    "sidecar writer claim",
    store.claims.stats.dev,
    MAX_WRITER_JOURNAL_BYTES,
  );
  if (observed.size !== 0n) {
    fail("sidecar writer claim was already bound to a stage");
  }
  const parentDescriptor = openVerifiedSidecarParentSync(
    store.claims,
    "sidecar writer claim parent",
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      claim.claimPath,
      FS_CONSTANTS.O_WRONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== observed.dev
      || before.ino !== observed.ino
      || before.size !== 0n
      || before.nlink !== 1n
      || before.uid !== observed.uid
      || sidecarModeBits(before) !== FILE_MODE
    ) {
      fail("sidecar writer claim changed before stage binding");
    }
    const buffer = Buffer.from(bytes, "utf8");
    const written = writeSync(
      descriptor,
      buffer,
      0,
      buffer.byteLength,
      0,
    );
    if (written !== buffer.byteLength) {
      fail("sidecar writer journal write was incomplete");
    }
    fsyncSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== BigInt(Buffer.byteLength(bytes, "utf8"))
      || after.nlink !== 1n
    ) {
      fail("sidecar writer journal changed while materializing");
    }
    if (
      !checkedSidecarParentStillCurrentSync(
        parentDescriptor,
        store.claims,
      )
    ) {
      fail("sidecar writer claim parent changed while materializing");
    }
    claim.stats = after;
    claim.bytes = bytes;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The durable journal state was already decided by fstat/fsync.
      }
    }
    try {
      closeSync(parentDescriptor);
    } catch {
      // The parent guard was already checked after the write.
    }
  }
  await syncSidecarDirectory(
    store.claims,
    "sidecar store claims directory",
  );
  return journal;
}

async function readSidecarWriterJournal(
  claimPath: string,
  expectedDev: bigint,
): Promise<SidecarWriterJournal> {
  const claimName = path.basename(claimPath);
  const match = STORE_WRITER_CLAIM.exec(claimName);
  if (match === null) {
    fail("sidecar writer journal has no canonical writer token");
  }
  const observed = await assertRecoverableSidecarClaim(
    claimPath,
    `sidecar writer claim ${claimName}`,
    expectedDev,
    MAX_WRITER_JOURNAL_BYTES,
  );
  if (observed.size === 0n) {
    fail("sidecar writer claim has no durable stage binding");
  }
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      claimPath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const current = await handle.stat({ bigint: true });
    if (
      current.dev !== observed.dev
      || current.ino !== observed.ino
      || current.size !== observed.size
      || current.nlink !== 1n
      || current.uid !== observed.uid
      || sidecarModeBits(current) !== FILE_MODE
    ) {
      fail("sidecar writer journal changed while opening");
    }
    const buffer = await handle.readFile();
    if (BigInt(buffer.byteLength) !== current.size) {
      fail("sidecar writer journal changed while reading");
    }
    const bytes = decodeExactUtf8(buffer, "sidecar writer journal");
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      fail("sidecar writer journal is not valid JSON");
    }
    assertExactKeys(
      parsed,
      [
        "contractVersion",
        "writerToken",
        "stageFileName",
        "stageDevice",
        "stageInode",
      ],
      [],
      "sidecar writer journal",
    );
    const journal = parsed as SidecarWriterJournal;
    if (
      journal.contractVersion !== STORE_WRITER_JOURNAL_VERSION
      || journal.writerToken !== match[1]
      || journal.stageFileName !== `stage_${match[1]}.json`
      || !/^(?:0|[1-9][0-9]*)$/.test(journal.stageDevice)
      || !/^(?:0|[1-9][0-9]*)$/.test(journal.stageInode)
      || taskMapContractCanonicalJson(journal) !== bytes
    ) {
      fail("sidecar writer journal is not an exact canonical stage binding");
    }
    return journal;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readSidecarRecoveryClaimToken(
  claimPath: string,
  expectedDev: bigint,
  expectedToken?: string,
): Promise<string> {
  const observed = await assertRecoverableSidecarClaim(
    claimPath,
    "sidecar recovery claim",
    expectedDev,
  );
  if (observed.size !== 64n) {
    fail("sidecar recovery claim is not fully materialized");
  }
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      claimPath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const current = await handle.stat({ bigint: true });
    if (
      current.dev !== observed.dev
      || current.ino !== observed.ino
      || current.size !== observed.size
      || current.nlink !== 1n
    ) {
      fail("sidecar recovery claim changed while opening");
    }
    const token = decodeExactUtf8(
      await handle.readFile(),
      "sidecar recovery claim",
    );
    assertDigest(token, "sidecar recovery claim token");
    if (expectedToken !== undefined && token !== expectedToken) {
      fail("sidecar recovery claim token does not match its operation");
    }
    return token;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertRecoverableSidecarStage(
  stagePath: string,
  label: string,
  expectedDev: bigint,
): Promise<BigIntStats> {
  let observed: BigIntStats;
  try {
    observed = await lstat(stagePath, { bigint: true });
  } catch {
    fail(`${label} is unavailable`);
  }
  const mode = sidecarModeBits(observed);
  if (
    !observed.isFile()
    || observed.isSymbolicLink()
    || observed.uid !== BigInt(sidecarCurrentUid())
    || observed.dev !== expectedDev
    || ![1n, 2n].includes(observed.nlink)
    || observed.size
      > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes)
    || (mode & ~FILE_MODE) !== 0
  ) {
    fail(`${label} is not a recoverable same-owner staged file`);
  }
  return observed;
}

async function readExactRecoverableSidecarStageBytes(
  stagePath: string,
  expectedStats: BigIntStats,
  label: string,
): Promise<Buffer> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      stagePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = await handle.stat({ bigint: true });
    if (
      opened.dev !== expectedStats.dev
      || opened.ino !== expectedStats.ino
      || opened.uid !== expectedStats.uid
      || sidecarModeBits(opened) !== FILE_MODE
      || opened.nlink !== expectedStats.nlink
      || opened.size !== expectedStats.size
    ) {
      fail(`${label} changed while opening for recovery preflight`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.uid !== opened.uid
      || sidecarModeBits(after) !== FILE_MODE
      || after.nlink !== opened.nlink
      || after.size !== opened.size
      || BigInt(bytes.byteLength) !== opened.size
    ) {
      fail(`${label} changed while reading for recovery preflight`);
    }
    return bytes;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function unlinkExactSidecarStage(
  store: OpenSidecarStore,
  staged: {
    stagePath: string;
    writerClaim: SidecarWriterClaim;
    stats: BigIntStats;
    expectedNlink: 1n | 2n;
    expectedBytes: string | Uint8Array;
    journalRequired: boolean;
  },
  label: string,
): Promise<void> {
  const expectedBuffer = typeof staged.expectedBytes === "string"
    ? Buffer.from(staged.expectedBytes, "utf8")
    : Buffer.from(staged.expectedBytes);
  const expectedBytesDigest = createHash("sha256")
    .update(expectedBuffer)
    .digest("hex");
  const expectedStageName = `stage_${staged.writerClaim.token}.json`;
  const expectedClaimName = `writer_${staged.writerClaim.token}.claim`;
  assertDigest(staged.writerClaim.token, `${label} writer token`);
  if (
    path.dirname(staged.stagePath) !== store.staging.directory
    || path.basename(staged.stagePath) !== expectedStageName
    || path.dirname(staged.writerClaim.claimPath)
      !== store.claims.directory
    || path.basename(staged.writerClaim.claimPath) !== expectedClaimName
    || staged.stats.dev !== store.staging.stats.dev
    || staged.stats.uid !== BigInt(sidecarCurrentUid())
    || sidecarModeBits(staged.stats) !== FILE_MODE
    || staged.stats.size !== BigInt(expectedBuffer.byteLength)
  ) {
    fail(
      `${label} has no exact writer/stage binding; explicit recovery is required`,
    );
  }
  const claimStats = await assertRecoverableSidecarClaim(
    staged.writerClaim.claimPath,
    `${label} writer claim`,
    store.claims.stats.dev,
    MAX_WRITER_JOURNAL_BYTES,
  );
  if (staged.journalRequired && claimStats.size === 0n) {
    fail(`${label} has no durable writer journal; explicit recovery is required`);
  }
  if (claimStats.size !== 0n) {
    const journal = await readSidecarWriterJournal(
      staged.writerClaim.claimPath,
      store.claims.stats.dev,
    );
    if (
      journal.writerToken !== staged.writerClaim.token
      || journal.stageFileName !== expectedStageName
      || BigInt(journal.stageDevice) !== staged.stats.dev
      || BigInt(journal.stageInode) !== staged.stats.ino
    ) {
      fail(
        `${label} writer journal no longer binds the stage; explicit recovery is required`,
      );
    }
  }

  const parentDescriptor = openVerifiedSidecarParentSync(
    store.staging,
    `${label} staging parent`,
  );
  let descriptor: number | undefined;
  let removed = false;
  try {
    const observed = lstatSync(staged.stagePath, { bigint: true });
    if (
      !observed.isFile()
      || observed.isSymbolicLink()
      || observed.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(observed) !== FILE_MODE
      || observed.dev !== staged.stats.dev
      || observed.ino !== staged.stats.ino
      || observed.nlink !== staged.expectedNlink
      || observed.size !== staged.stats.size
    ) {
      fail(
        `${label} inode changed before cleanup; explicit recovery is required`,
      );
    }
    descriptor = openSync(
      staged.stagePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== observed.dev
      || opened.ino !== observed.ino
      || opened.uid !== observed.uid
      || sidecarModeBits(opened) !== FILE_MODE
      || opened.nlink !== staged.expectedNlink
      || opened.size !== observed.size
    ) {
      fail(
        `${label} inode changed while opening for cleanup; explicit recovery is required`,
      );
    }
    const buffer = readFileSync(descriptor);
    if (BigInt(buffer.byteLength) !== opened.size) {
      fail(
        `${label} bytes changed while reading for cleanup; explicit recovery is required`,
      );
    }
    if (
      !buffer.equals(expectedBuffer)
      || createHash("sha256").update(buffer).digest("hex")
        !== expectedBytesDigest
    ) {
      fail(
        `${label} content changed before cleanup; explicit recovery is required`,
      );
    }
    const finalObserved = lstatSync(staged.stagePath, { bigint: true });
    if (
      finalObserved.dev !== opened.dev
      || finalObserved.ino !== opened.ino
      || finalObserved.uid !== opened.uid
      || sidecarModeBits(finalObserved) !== FILE_MODE
      || finalObserved.nlink !== staged.expectedNlink
      || finalObserved.size !== opened.size
    ) {
      fail(
        `${label} pathname changed before cleanup; explicit recovery is required`,
      );
    }
    if (
      !checkedSidecarParentStillCurrentSync(
        parentDescriptor,
        store.staging,
      )
    ) {
      fail(
        `${label} staging parent changed before cleanup; explicit recovery is required`,
      );
    }
    unlinkSync(staged.stagePath);
    fsyncSync(parentDescriptor);
    removed = true;
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot be removed exactly; explicit recovery is required`);
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        if (!removed) {
          // The extant stage and claim remain authoritative recovery residue.
        }
      }
    }
    try {
      closeSync(parentDescriptor);
    } catch {
      if (!removed) {
        // The stage and claim remain recovery residue on guard failure.
      }
    }
  }
  await syncSidecarDirectory(
    store.staging,
    "sidecar store staging directory",
  );
}

async function validateSidecarClaimDirectory(
  store: OpenSidecarStore,
): Promise<string[]> {
  const names = await listSidecarDirectory(
    store.claims,
    "sidecar store claims directory",
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters + 2,
  );
  let writerCount = 0;
  for (const name of names) {
    if (name === STORE_RECOVERY_CLAIM) {
      await readSidecarRecoveryClaimToken(
        path.join(store.claims.directory, name),
        store.claims.stats.dev,
      );
      continue;
    }
    if (name === STORE_WRITER_ADMISSION_CLAIM) {
      const admissionClaim = await assertRecoverableSidecarClaim(
        path.join(store.claims.directory, name),
        "sidecar writer admission claim",
        store.claims.stats.dev,
      );
      if (admissionClaim.size !== 0n) {
        fail("sidecar writer admission claim must be an empty marker");
      }
      continue;
    }
    if (STORE_WRITER_CLAIM.exec(name) === null) {
      fail("sidecar store claims directory contains an unknown entry");
    }
    writerCount += 1;
    const writerClaim = await assertRecoverableSidecarClaim(
      path.join(store.claims.directory, name),
      `sidecar writer claim ${name}`,
      store.claims.stats.dev,
      MAX_WRITER_JOURNAL_BYTES,
    );
    if (writerClaim.size !== 0n) {
      await readSidecarWriterJournal(
        path.join(store.claims.directory, name),
        store.claims.stats.dev,
      );
    }
  }
  if (
    writerCount
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters
  ) {
    fail("sidecar store writer claims exceed their reserved capacity");
  }
  return names;
}

async function createSidecarWriterClaim(
  store: OpenSidecarStore,
  options: TaskMapIdentityDedupeWriteOptions,
): Promise<SidecarWriterClaim> {
  const recoveryPath = path.join(
    store.claims.directory,
    STORE_RECOVERY_CLAIM,
  );
  if (await sidecarPathExists(recoveryPath)) {
    fail("sidecar writer refuses an active recovery claim");
  }
  const admissionPath = path.join(
    store.claims.directory,
    STORE_WRITER_ADMISSION_CLAIM,
  );
  let admissionStats: BigIntStats | undefined;
  try {
    await options.faultInjection?.("before_writer_admission_create");
    admissionStats = writeExclusiveSidecarClaim(
      store.claims,
      admissionPath,
      "sidecar writer admission claim",
    );
    await syncSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
    );
  } catch (error) {
    if (sidecarErrnoCode(error) === "EEXIST") {
      fail("sidecar writer admission claim is already active");
    }
    throw error;
  }
  const token = randomBytes(32).toString("hex");
  const claimPath = path.join(
    store.claims.directory,
    `writer_${token}.claim`,
  );
  let writerCreated = false;
  let admissionCreated = true;
  let writerStats: BigIntStats | undefined;
  try {
    if (await sidecarPathExists(recoveryPath)) {
      fail("sidecar writer lost the admission race to recovery");
    }
    const priorClaims = await validateSidecarClaimDirectory(store);
    const priorWriterCount = priorClaims.filter((name) => (
      STORE_WRITER_CLAIM.test(name)
    )).length;
    if (
      priorWriterCount
        >= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters
    ) {
      fail("sidecar store has no reserved writer-claim capacity");
    }
    await options.faultInjection?.("before_writer_claim_create");
    writerStats = writeExclusiveSidecarClaim(
      store.claims,
      claimPath,
      "sidecar writer claim",
    );
    writerCreated = true;
    await syncSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
    );
    await validateSidecarClaimDirectory(store);
    if (await sidecarPathExists(recoveryPath)) {
      fail("sidecar writer lost the claim race to recovery");
    }
    await assertRecoverableSidecarClaim(
      claimPath,
      "sidecar writer claim",
      store.claims.stats.dev,
    );
    if (admissionStats === undefined) {
      fail("sidecar writer admission claim lost its exact identity");
    }
    revalidateSidecarDirectorySync(
      store.claims,
      "sidecar store claims directory",
    );
    unlinkExactCreatedSidecarFileSync(
      admissionPath,
      store.claims.stats,
      admissionStats,
      "",
      "sidecar writer admission claim",
    );
    admissionCreated = false;
    await syncSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
    );
    if (writerStats === undefined) {
      fail("sidecar writer claim lost its exact identity");
    }
    return {
      token,
      claimPath,
      stats: writerStats,
      bytes: "",
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    let claimsStillCurrent = false;
    try {
      revalidateSidecarDirectorySync(
        store.claims,
        "sidecar store claims directory",
      );
      claimsStillCurrent = true;
    } catch {
      // A replaced path must not be used to clean detached claim inodes.
    }
    if (
      writerCreated
      && writerStats !== undefined
      && claimsStillCurrent
    ) {
      try {
        unlinkExactCreatedSidecarFileSync(
          claimPath,
          store.claims.stats,
          writerStats,
          "",
          "sidecar writer claim",
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (
      admissionCreated
      && admissionStats !== undefined
      && claimsStillCurrent
    ) {
      try {
        unlinkExactCreatedSidecarFileSync(
          admissionPath,
          store.claims.stats,
          admissionStats,
          "",
          "sidecar writer admission claim",
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (claimsStillCurrent) {
      try {
        await syncSidecarDirectory(
          store.claims,
          "sidecar store claims directory",
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "P10.2 identity/dedupe projection: writer claim creation failed "
          + "and cleanup was not durable",
      );
    }
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail("cannot create the sidecar writer claim");
  }
}

async function closeSidecarWriterClaim(
  store: OpenSidecarStore,
  claim: SidecarWriterClaim,
): Promise<void> {
  revalidateSidecarDirectorySync(
    store.claims,
    "sidecar store claims directory",
  );
  unlinkExactCreatedSidecarFileSync(
    claim.claimPath,
    store.claims.stats,
    claim.stats,
    claim.bytes,
    "sidecar writer claim",
  );
  await syncSidecarDirectory(
    store.claims,
    "sidecar store claims directory",
  );
}

async function acquireSidecarRecoveryClaim(
  store: OpenSidecarStore,
  options: TaskMapIdentityDedupeRecoveryOptions,
  writeOptions: TaskMapIdentityDedupeWriteOptions,
): Promise<SidecarRecoveryClaim> {
  const { operationToken } = options;
  assertDigest(operationToken, "sidecar recovery operation token");
  const claimPath = path.join(
    store.claims.directory,
    STORE_RECOVERY_CLAIM,
  );
  const createClaim = async (): Promise<SidecarRecoveryClaim> => {
    await writeOptions.faultInjection?.("before_recovery_claim_create");
    const stats = writeExclusiveSidecarClaim(
      store.claims,
      claimPath,
      "sidecar recovery claim",
      operationToken,
    );
    try {
      await readSidecarRecoveryClaimToken(
        claimPath,
        store.claims.stats.dev,
        operationToken,
      );
      await syncSidecarDirectory(
        store.claims,
        "sidecar store claims directory",
      );
      return { claimPath, stats, bytes: operationToken };
    } catch (error) {
      let claimsStillCurrent = false;
      try {
        revalidateSidecarDirectorySync(
          store.claims,
          "sidecar store claims directory",
        );
        claimsStillCurrent = true;
      } catch {
        // Never retarget cleanup through a replaced claims pathname.
      }
      if (claimsStillCurrent) {
        unlinkExactCreatedSidecarFileSync(
          claimPath,
          store.claims.stats,
          stats,
          operationToken,
          "sidecar recovery claim",
        );
      }
      throw error;
    }
  };
  try {
    return await createClaim();
  } catch (error) {
    if (sidecarErrnoCode(error) !== "EEXIST") throw error;
    if (
      options.takeOverRecoveryClaim !== true
      || options.externalExclusivityAsserted !== true
    ) {
      fail("sidecar recovery claim is already active");
    }
    const existingStats = await assertRecoverableSidecarClaim(
      claimPath,
      "sidecar recovery claim",
      store.claims.stats.dev,
    );
    const existingToken = existingStats.size === 0n
      ? ""
      : await readSidecarRecoveryClaimToken(
        claimPath,
        store.claims.stats.dev,
      );
    revalidateSidecarDirectorySync(
      store.claims,
      "sidecar store claims directory",
    );
    unlinkExactCreatedSidecarFileSync(
      claimPath,
      store.claims.stats,
      existingStats,
      existingToken,
      "sidecar recovery claim takeover",
    );
    await syncSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
    );
    try {
      return await createClaim();
    } catch (takeoverError) {
      if (sidecarErrnoCode(takeoverError) === "EEXIST") {
        fail("sidecar recovery claim takeover lost its CAS");
      }
      throw takeoverError;
    }
  }
}

function snapshotRecoveryOptions(
  value: TaskMapIdentityDedupeRecoveryOptions,
): TaskMapIdentityDedupeRecoveryOptions {
  if (
    value === null
    || typeof value !== "object"
    || nodeUtilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("sidecar recovery options must be a plain data object");
  }
  const allowed = new Set<PropertyKey>([
    "operationToken",
    "takeOverRecoveryClaim",
    "externalExclusivityAsserted",
    "abandonWriterClaims",
  ]);
  const keys = REFLECT_OWN_KEYS(value);
  if (
    keys.length > allowed.size
    || keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || !keys.includes("operationToken")
  ) {
    fail("sidecar recovery options have unknown or executable fields");
  }
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const key of keys) {
    if (typeof key !== "string") {
      fail("sidecar recovery options have unknown or executable fields");
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      fail("sidecar recovery options have unknown or executable fields");
    }
    descriptors.set(key, descriptor);
  }
  const snapshot = {
    operationToken: descriptors.get("operationToken")!.value as string,
    ...(descriptors.get("takeOverRecoveryClaim") === undefined
      ? {}
      : {
        takeOverRecoveryClaim:
          descriptors.get("takeOverRecoveryClaim")!.value as boolean,
      }),
    ...(descriptors.get("externalExclusivityAsserted") === undefined
      ? {}
      : {
        externalExclusivityAsserted:
          descriptors.get("externalExclusivityAsserted")!.value as boolean,
      }),
    ...(descriptors.get("abandonWriterClaims") === undefined
      ? {}
      : {
        abandonWriterClaims:
          descriptors.get("abandonWriterClaims")!.value as boolean,
      }),
  };
  assertDigest(snapshot.operationToken, "sidecar recovery operation token");
  for (const [label, candidate] of [
    ["takeover", snapshot.takeOverRecoveryClaim],
    ["external-exclusivity", snapshot.externalExclusivityAsserted],
    ["abandon-writer", snapshot.abandonWriterClaims],
  ] as const) {
    if (candidate !== undefined && typeof candidate !== "boolean") {
      fail(`sidecar recovery ${label} assertion must be boolean`);
    }
  }
  if (
    (snapshot.takeOverRecoveryClaim === true
      || snapshot.abandonWriterClaims === true)
    && snapshot.externalExclusivityAsserted !== true
  ) {
    fail(
      "sidecar recovery takeover requires external exclusivity assertion",
    );
  }
  return snapshot;
}

export async function recoverTaskMapIdentityDedupeProjectionStore(
  roots: TaskMapIdentityDedupeStoreRoots,
  options: TaskMapIdentityDedupeRecoveryOptions,
  writeOptions: TaskMapIdentityDedupeWriteOptions = {},
): Promise<void> {
  assertArrayPrototypeIntegrity();
  const storeRoots = snapshotStoreRoots(roots, "sidecar recovery roots");
  const snapshot = snapshotRecoveryOptions(options);
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(storeRoots);
  const store = await openSidecarStore(storeRoots.sidecarRoot);
  await revalidateDisjointTaskMapStoreRoots(storeRoots, isolatedRoots);
  const recoveryClaim = await acquireSidecarRecoveryClaim(
    store,
    snapshot,
    writeOptions,
  );
  let recoveryFailure: unknown;
  try {
    const claimNames = await listSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters + 2,
    );
    const writerClaims = new Map<string, {
      name: string;
      path: string;
      stats: BigIntStats;
      bytes: string;
      journal: SidecarWriterJournal | null;
    }>();
    let writerAdmissionPath: string | undefined;
    let writerAdmissionStats: BigIntStats | undefined;
    for (const name of claimNames) {
      if (name === STORE_RECOVERY_CLAIM) continue;
      if (name === STORE_WRITER_ADMISSION_CLAIM) {
        writerAdmissionPath = path.join(store.claims.directory, name);
        const admission = await assertRecoverableSidecarClaim(
          writerAdmissionPath,
          "sidecar writer admission claim",
          store.claims.stats.dev,
        );
        if (admission.size !== 0n) {
          fail("sidecar writer admission claim must be an empty marker");
        }
        writerAdmissionStats = admission;
        continue;
      }
      const match = STORE_WRITER_CLAIM.exec(name);
      if (match === null) {
        fail("sidecar store claims directory contains an unknown entry");
      }
      const writerPath = path.join(store.claims.directory, name);
      const writer = await assertRecoverableSidecarClaim(
        writerPath,
        `sidecar writer claim ${name}`,
        store.claims.stats.dev,
        MAX_WRITER_JOURNAL_BYTES,
      );
      const journal = writer.size === 0n
        ? null
        : await readSidecarWriterJournal(
          writerPath,
          store.claims.stats.dev,
        );
      writerClaims.set(match[1]!, {
        name,
        path: writerPath,
        stats: writer,
        bytes: journal === null
          ? ""
          : taskMapContractCanonicalJson(journal),
        journal,
      });
    }
    if (
      (
        writerClaims.size > 0
        || writerAdmissionPath !== undefined
      )
      && snapshot.abandonWriterClaims !== true
    ) {
      fail(
        "sidecar store recovery refuses active writer claims or an "
          + "admission claim "
          + "without external exclusivity",
      );
    }

    const names = await listSidecarDirectory(
      store.staging,
      "sidecar store staging directory",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries,
    );
    let stagedBytes = 0n;
    const stagedEntries: Array<{
      stagePath: string;
      writerClaim: SidecarWriterClaim;
      stats: BigIntStats;
      expectedNlink: 1n | 2n;
      expectedBytes: Buffer;
      journalRequired: true;
    }> = [];
    const linkedGenerationInodes = new Set<string>();
    for (const name of names) {
      const stageMatch = STORE_STAGE_FILE.exec(name);
      if (stageMatch === null) {
        fail("sidecar store staging directory contains an unknown entry");
      }
      const stagePath = path.join(store.staging.directory, name);
      const stageStats = await assertRecoverableSidecarStage(
        stagePath,
        `sidecar staged entry ${name}`,
        store.staging.stats.dev,
      );
      stagedBytes += stageStats.size;
      if (
        stagedBytes
          > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingBytes)
      ) {
        fail("sidecar recovery staging exceeds its aggregate byte bound");
      }
      const claim = writerClaims.get(stageMatch[1]!);
      if (
        claim === undefined
        || claim.journal === null
        || claim.journal.stageFileName !== name
        || BigInt(claim.journal.stageDevice) !== stageStats.dev
        || BigInt(claim.journal.stageInode) !== stageStats.ino
      ) {
        fail(
          "sidecar staged residue has no exact durable writer-journal "
            + "binding",
        );
      }
      if (stageStats.nlink === 1n) {
        stagedEntries.push({
          stagePath,
          writerClaim: {
            token: stageMatch[1]!,
            claimPath: claim.path,
            stats: claim.stats,
            bytes: claim.bytes,
          },
          stats: stageStats,
          expectedNlink: 1n,
          expectedBytes: await readExactRecoverableSidecarStageBytes(
            stagePath,
            stageStats,
            `sidecar staged entry ${name}`,
          ),
          journalRequired: true,
        });
        continue;
      }
      const staged = await readSidecarEntryFile(
        stagePath,
        `sidecar staged entry ${name}`,
        [2],
        store.staging.stats.dev,
      );
      const generationPath = path.join(
        store.generations.directory,
        sidecarGenerationFileName(staged.entry.generation),
      );
      const committed = await readSidecarEntryFile(
        generationPath,
        `sidecar committed generation ${staged.entry.generation}`,
        [2],
        store.generations.stats.dev,
      );
      if (
        staged.stats.dev !== stageStats.dev
        || staged.stats.ino !== stageStats.ino
        || staged.stats.size !== stageStats.size
        || staged.stats.nlink !== stageStats.nlink
        ||
        committed.stats.dev !== staged.stats.dev
        || committed.stats.ino !== staged.stats.ino
        || committed.bytes !== staged.bytes
      ) {
        fail("linked staged sidecar does not match its committed generation");
      }
      linkedGenerationInodes.add(
        `${committed.stats.dev}:${committed.stats.ino}`,
      );
      stagedEntries.push({
        stagePath,
        writerClaim: {
          token: stageMatch[1]!,
          claimPath: claim.path,
          stats: claim.stats,
          bytes: claim.bytes,
        },
        stats: stageStats,
        expectedNlink: 2n,
        expectedBytes: Buffer.from(staged.bytes, "utf8"),
        journalRequired: true,
      });
    }
    await readSidecarStoreFromOpen(
      store,
      true,
      linkedGenerationInodes,
    );
    await revalidateDisjointTaskMapStoreRoots(storeRoots, isolatedRoots);
    if (linkedGenerationInodes.size > 0) {
      await syncSidecarDirectory(
        store.generations,
        "sidecar store generations directory",
      );
    }
    await writeOptions.faultInjection?.("before_recovery_stage_cleanup");
    for (const staged of stagedEntries) {
      await unlinkExactSidecarStage(
        store,
        staged,
        "sidecar recovery staged entry",
      );
    }
    if (
      writerAdmissionPath !== undefined
      && writerAdmissionStats !== undefined
    ) {
      revalidateSidecarDirectorySync(
        store.claims,
        "sidecar store claims directory",
      );
      unlinkExactCreatedSidecarFileSync(
        writerAdmissionPath,
        store.claims.stats,
        writerAdmissionStats,
        "",
        "sidecar writer admission claim",
      );
    }
    for (const claim of writerClaims.values()) {
      revalidateSidecarDirectorySync(
        store.claims,
        "sidecar store claims directory",
      );
      unlinkExactCreatedSidecarFileSync(
        claim.path,
        store.claims.stats,
        claim.stats,
        claim.bytes,
        `sidecar writer claim ${claim.name}`,
      );
    }
    if (
      writerAdmissionPath !== undefined
      || writerClaims.size > 0
    ) {
      await syncSidecarDirectory(
        store.claims,
        "sidecar store claims directory",
      );
    }
    await readSidecarStoreFromOpen(store);
  } catch (error) {
    recoveryFailure = error;
  }
  const releaseFailures: unknown[] = [];
  try {
    revalidateSidecarDirectorySync(
      store.claims,
      "sidecar store claims directory",
    );
    unlinkExactCreatedSidecarFileSync(
      recoveryClaim.claimPath,
      store.claims.stats,
      recoveryClaim.stats,
      recoveryClaim.bytes,
      "sidecar recovery claim",
    );
  } catch (error) {
    releaseFailures.push(error);
  }
  try {
    await syncSidecarDirectory(
      store.claims,
      "sidecar store claims directory",
    );
  } catch (error) {
    releaseFailures.push(error);
  }
  if (releaseFailures.length > 0) {
    throw new AggregateError(
      [
        ...(recoveryFailure === undefined ? [] : [recoveryFailure]),
        ...releaseFailures,
      ],
      "P10.2 identity/dedupe projection: recovery claim release was not "
        + "durable",
    );
  }
  if (recoveryFailure !== undefined) {
    throw recoveryFailure;
  }
}

function sameCurrentHead(
  left: TaskMapRefreshCurrentSnapshotV1,
  right: TaskMapRefreshCurrentSnapshotV1,
): boolean {
  return (
    left.status === "healthy"
    && right.status === "healthy"
    && left.head !== undefined
    && right.head !== undefined
    && left.head.generation === right.head.generation
    && left.head.refId === right.head.refId
    && canonicalEqual(left.head, right.head)
    && left.generations.length === right.generations.length
  );
}

function assertSidecarStoreAlignedWithCurrent(
  sidecarStore: TaskMapIdentityDedupeStoreSnapshotV1,
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1,
): {
  predecessor: TaskMapIdentityDedupeStoreEntryV1 | null;
  currentEntry: TaskMapIdentityDedupeStoreEntryV1 | null;
} {
  const current = assertHealthyCurrentHistory(currentSnapshot);
  const generationIndex = Number(BigInt(current.head.generation) - 1n);
  if (
    sidecarStore.entries.length < generationIndex
    || sidecarStore.entries.length > generationIndex + 1
  ) {
    fail(
      "sidecar store requires reviewed sequential backfill from generation one",
    );
  }
  for (let index = 0; index < sidecarStore.entries.length; index += 1) {
    const entry = sidecarStore.entries[index]!;
    const ref = currentSnapshot.generations[index];
    if (
      ref === undefined
      || entry.generation !== ref.generation
      || entry.currentRefId !== ref.refId
      || entry.currentRefDigest !== taskMapContractDigest(ref)
      || entry.ownerScopeDigest !== ref.ownerScopeDigest
    ) {
      fail("sidecar store is not aligned to the P10.1 contiguous history");
    }
    const accepted = ref.accepted;
    if (entry.entryKind === "projection") {
      if (
        accepted === undefined
        || ref.operation === "rollback"
        || entry.sidecar.origin.acceptedOriginGeneration
          !== accepted.originGeneration
        || entry.sidecar.origin.acceptedStateDigest
          !== accepted.acceptedStateDigest
        || entry.sidecar.origin.bundleId !== accepted.bundleId
        || entry.sidecar.origin.planId !== accepted.planId
        || entry.sidecar.origin.batchId !== accepted.batchId
        || entry.sidecar.origin.replayClosureDigest
          !== entry.sidecar.origin.acceptedOriginReplayDigest
      ) {
        fail("projection entry is not bound to its accepted P10.1 ref");
      }
    } else if (entry.entryKind === "no_accepted_origin") {
      if (
        accepted !== undefined
        || ref.operation === "complete"
        || ref.operation === "rollback"
        || entry.operation !== ref.operation
        || entry.accepted !== null
        || entry.rollback !== null
      ) {
        fail("no-accepted entry does not match its P10.1 ref");
      }
    } else if (
      ref.operation !== "rollback"
      || accepted === undefined
      || ref.rollback === undefined
      || entry.operation !== "rollback"
      || !canonicalEqual(entry.accepted, accepted)
      || !canonicalEqual(entry.rollback, ref.rollback)
    ) {
      fail("rollback observation does not match its P10.1 ref");
    }
  }
  return {
    predecessor: generationIndex === 0
      ? null
      : sidecarStore.entries[generationIndex - 1] ?? null,
    currentEntry: sidecarStore.entries[generationIndex] ?? null,
  };
}

async function verifySidecarStoreAcceptedOrigins(
  sidecarStore: TaskMapIdentityDedupeStoreSnapshotV1,
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1,
  runRoot: string,
): Promise<void> {
  const indicesByBundleId = new Map<string, number[]>();
  for (let index = 0; index < sidecarStore.entries.length; index += 1) {
    const entry = sidecarStore.entries[index]!;
    if (entry.entryKind !== "projection") continue;
    const bundleId = entry.acceptedOriginBundleId;
    const indices = indicesByBundleId.get(bundleId) ?? [];
    indices.push(index);
    indicesByBundleId.set(bundleId, indices);
  }
  for (const [bundleId, indices] of indicesByBundleId) {
    const origin = await verifyTaskMapRefreshRunBundle(
      path.join(runRoot, bundleId),
      bundleId,
    );
    for (const index of indices) {
      const entry = sidecarStore.entries[index]!;
      if (entry.entryKind !== "projection") {
        fail("accepted-origin index does not reference a projection");
      }
      const ref = currentSnapshot.generations[index]!;
      assertPreviousAcceptedOrigin(origin, entry.sidecar, ref);
    }
  }
}

type StoreBuildContext = {
  snapshot: BuildTaskMapIdentityDedupeProjectionFromStoreInput;
  isolatedRoots: CheckedTaskMapStoreRoots;
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1;
  predecessor: TaskMapIdentityDedupeStoreEntryV1 | null;
  semanticPredecessor:
    | TaskMapIdentityDedupeProjectionStoreEntryV1
    | null;
  currentEntry: TaskMapIdentityDedupeStoreEntryV1 | null;
  built: BuiltTaskMapIdentityDedupeProjection;
};

function resolveSemanticPredecessor(
  sidecarStore: TaskMapIdentityDedupeStoreSnapshotV1,
  predecessor: TaskMapIdentityDedupeStoreEntryV1 | null,
): TaskMapIdentityDedupeProjectionStoreEntryV1 | null {
  const head = predecessor?.semanticHead ?? null;
  if (head === null) return null;
  const candidate = sidecarStore.entries.find((entry) => (
    entry.entryKind === "projection"
    && entry.generation === head.generation
    && entry.currentRefId === head.currentRefId
    && entry.sidecarId === head.sidecarId
    && entry.sidecarDigest === head.sidecarDigest
  ));
  if (candidate === undefined || candidate.entryKind !== "projection") {
    fail("sidecar semantic predecessor is absent from immutable history");
  }
  return candidate;
}

async function buildStoreBackedProjection(
  snapshot: BuildTaskMapIdentityDedupeProjectionFromStoreInput,
): Promise<StoreBuildContext> {
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(snapshot);
  const currentSnapshot = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  const current = assertHealthyCurrentSnapshot(currentSnapshot);
  if (current.head.operation === "rollback") {
    fail(
      "rollback identity decisions require a reviewed authority artifact; "
        + "publish a rollback observation instead",
    );
  }
  const sidecarStore =
    await readTaskMapIdentityDedupeProjectionStoreStructural(
    snapshot.sidecarRoot,
  );
  const { predecessor, currentEntry } =
    assertSidecarStoreAlignedWithCurrent(sidecarStore, currentSnapshot);
  await verifySidecarStoreAcceptedOrigins(
    sidecarStore,
    currentSnapshot,
    snapshot.runRoot,
  );
  const acceptedOrigin = await verifyTaskMapRefreshRunBundle(
    path.join(snapshot.runRoot, current.accepted.bundleId),
    current.accepted.bundleId,
  );
  const semanticPredecessor = resolveSemanticPredecessor(
    sidecarStore,
    predecessor,
  );
  let previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle | null = null;
  if (semanticPredecessor !== null) {
    const predecessorRef = currentSnapshot.generations[
      Number(BigInt(semanticPredecessor.generation) - 1n)
    ]!;
    if (
      predecessorRef.accepted === undefined
      || predecessorRef.accepted.bundleId
        !== semanticPredecessor.acceptedOriginBundleId
    ) {
      fail("semantic P10.1 predecessor has no matching accepted origin");
    }
    previousAcceptedOrigin = await verifyTaskMapRefreshRunBundle(
      path.join(snapshot.runRoot, predecessorRef.accepted.bundleId),
      predecessorRef.accepted.bundleId,
    );
  }
  const {
    currentRoot: _currentRoot,
    runRoot: _runRoot,
    sidecarRoot: _sidecarRoot,
    ...verifiedInput
  } = snapshot;
  const built =
    unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest({
    ...verifiedInput,
    currentSnapshot,
    acceptedOrigin,
    previousSidecar: semanticPredecessor?.sidecar ?? null,
    previousAcceptedOrigin,
  });
  if (
    currentEntry !== null
    && (
      currentEntry.entryKind !== "projection"
      ||
      !canonicalEqual(currentEntry.sidecar, built.sidecar)
      || !canonicalEqual(currentEntry.diff, built.diff)
    )
  ) {
    fail("current sidecar generation already exists with different contents");
  }
  return {
    snapshot,
    isolatedRoots,
    currentSnapshot,
    predecessor,
    semanticPredecessor,
    currentEntry,
    built,
  };
}

async function buildBackfillProjection(
  input: BackfillTaskMapIdentityDedupeProjectionInput,
): Promise<StoreBuildContext & {
  observedCurrentSnapshot: TaskMapRefreshCurrentSnapshotV1;
}> {
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(input);
  const observedCurrentSnapshot = await readTaskMapRefreshCurrent(
    input.currentRoot,
    input.runRoot,
  );
  const observed = assertHealthyCurrentSnapshot(observedCurrentSnapshot);
  const targetIndex = Number(BigInt(input.targetGeneration) - 1n);
  if (
    targetIndex < 0
    || targetIndex >= observedCurrentSnapshot.generations.length
    || targetIndex
      >= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
  ) {
    fail("backfill target is not in the healthy P10.1 history");
  }
  const targetRef = observedCurrentSnapshot.generations[targetIndex]!;
  if (targetRef.generation !== input.targetGeneration) {
    fail("backfill target generation is not canonical");
  }
  const targetSnapshot: TaskMapRefreshCurrentSnapshotV1 = {
    status: "healthy",
    head: targetRef,
    generations: observedCurrentSnapshot.generations.slice(
      0,
      targetIndex + 1,
    ),
    unknownGenerationNames: [],
    unknownObjectNames: [],
  };
  const target = assertHealthyCurrentSnapshot(targetSnapshot);
  if (target.head.operation === "rollback") {
    fail(
      "rollback identity decisions require a reviewed authority artifact; "
        + "backfill a rollback observation instead",
    );
  }
  const sidecarStore =
    await readTaskMapIdentityDedupeProjectionStoreStructural(
    input.sidecarRoot,
  );
  if (
    sidecarStore.entries.length !== targetIndex
    && sidecarStore.entries.length !== targetIndex + 1
  ) {
    fail(
      "backfill must append exactly the next missing sidecar generation",
    );
  }
  const { predecessor, currentEntry } =
    assertSidecarStoreAlignedWithCurrent(sidecarStore, targetSnapshot);
  await verifySidecarStoreAcceptedOrigins(
    sidecarStore,
    targetSnapshot,
    input.runRoot,
  );
  const acceptedOrigin = await verifyTaskMapRefreshRunBundle(
    path.join(input.runRoot, target.accepted.bundleId),
    target.accepted.bundleId,
  );
  const semanticPredecessor = resolveSemanticPredecessor(
    sidecarStore,
    predecessor,
  );
  let previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle | null = null;
  if (semanticPredecessor !== null) {
    const predecessorRef = targetSnapshot.generations[
      Number(BigInt(semanticPredecessor.generation) - 1n)
    ]!;
    if (
      predecessorRef.accepted === undefined
      || predecessorRef.accepted.bundleId
        !== semanticPredecessor.acceptedOriginBundleId
    ) {
      fail("backfill semantic predecessor has no accepted origin");
    }
    previousAcceptedOrigin = await verifyTaskMapRefreshRunBundle(
      path.join(input.runRoot, predecessorRef.accepted.bundleId),
      predecessorRef.accepted.bundleId,
    );
  }
  const {
    targetGeneration: _targetGeneration,
    currentRoot: _currentRoot,
    runRoot: _runRoot,
    sidecarRoot: _sidecarRoot,
    ...verifiedInput
  } = input;
  const built =
    unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest({
    ...verifiedInput,
    currentSnapshot: targetSnapshot,
    acceptedOrigin,
    previousSidecar: semanticPredecessor?.sidecar ?? null,
    previousAcceptedOrigin,
  });
  if (
    currentEntry !== null
    && (
      currentEntry.entryKind !== "projection"
      ||
      !canonicalEqual(currentEntry.sidecar, built.sidecar)
      || !canonicalEqual(currentEntry.diff, built.diff)
    )
  ) {
    fail("backfill generation already exists with different contents");
  }
  return {
    snapshot: {
      currentRoot: input.currentRoot,
      runRoot: input.runRoot,
      sidecarRoot: input.sidecarRoot,
      sourceSnapshot: input.sourceSnapshot,
      projection: input.projection,
      workBindings: input.workBindings,
      aliases: input.aliases,
      sessionLineage: input.sessionLineage,
      lifecycleAdjudications: input.lifecycleAdjudications,
    },
    isolatedRoots,
    currentSnapshot: targetSnapshot,
    observedCurrentSnapshot,
    predecessor,
    semanticPredecessor,
    currentEntry,
    built,
  };
}

function historyStillContainsTarget(
  targetSnapshot: TaskMapRefreshCurrentSnapshotV1,
  latestSnapshot: TaskMapRefreshCurrentSnapshotV1,
): boolean {
  if (
    targetSnapshot.status !== "healthy"
    || latestSnapshot.status !== "healthy"
    || targetSnapshot.head === undefined
    || latestSnapshot.head === undefined
    || latestSnapshot.generations.length
      < targetSnapshot.generations.length
  ) {
    return false;
  }
  const latestTarget = latestSnapshot.generations[
    targetSnapshot.generations.length - 1
  ];
  return (
    latestTarget !== undefined
    && latestTarget.generation === targetSnapshot.head.generation
    && latestTarget.refId === targetSnapshot.head.refId
    && canonicalEqual(latestTarget, targetSnapshot.head)
  );
}

async function reopenExactRetryEntry(
  sidecarRoot: string,
  targetSnapshot: TaskMapRefreshCurrentSnapshotV1,
  expectedEntry: TaskMapIdentityDedupeStoreEntryV1,
  label: string,
): Promise<TaskMapIdentityDedupeStoreEntryV1> {
  const latestStore =
    await readTaskMapIdentityDedupeProjectionStoreStructural(
    sidecarRoot,
  );
  const aligned = assertSidecarStoreAlignedWithCurrent(
    latestStore,
    targetSnapshot,
  );
  if (
    aligned.currentEntry === null
    || !canonicalEqual(aligned.currentEntry, expectedEntry)
  ) {
    fail(`${label} changed before idempotent return`);
  }
  return aligned.currentEntry;
}

export type TaskMapIdentityDedupeFaultPoint =
  | "before_initialize_directory_create"
  | "before_retry_revalidation"
  | "before_recovery_claim_create"
  | "before_recovery_stage_cleanup"
  | "before_writer_admission_create"
  | "before_writer_claim_create"
  | "before_stage_create"
  | "before_stage_journal_bind"
  | "after_stage_create"
  | "after_stage_partial_write"
  | "after_stage_sync"
  | "before_generation_cas"
  | "after_generation_parent_check"
  | "before_existing_stage_cleanup"
  | "after_generation_link"
  | "before_stage_cleanup";

export interface TaskMapIdentityDedupeWriteOptions {
  faultInjection?: (
    point: TaskMapIdentityDedupeFaultPoint,
  ) => void | Promise<void>;
}

export function assertTaskMapIdentityDedupeStoreAppendCapacity(
  committedBytes: number,
  candidateBytes: number,
  targetAlreadyExists = false,
  committedEntries = 0,
): void {
  if (
    !Number.isSafeInteger(committedBytes)
    || committedBytes < 0
    || !Number.isSafeInteger(candidateBytes)
    || candidateBytes < 1
    || candidateBytes
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes
    || !Number.isSafeInteger(committedEntries)
    || committedEntries < 0
    || committedEntries
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
  ) {
    fail("sidecar store append byte accounting is invalid");
  }
  if (
    !targetAlreadyExists
    && committedEntries
      >= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
  ) {
    fail("sidecar store append exceeds the generation count bound");
  }
  const growth = targetAlreadyExists ? 0 : candidateBytes;
  if (
    committedBytes + growth
      > TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes
  ) {
    fail("sidecar store append exceeds the aggregate history byte bound");
  }
}

async function assertSidecarStoreAppendCapacity(
  store: OpenSidecarStore,
  generationFileName: string,
  candidateBytes: number,
): Promise<void> {
  const names = await listSidecarDirectory(
    store.generations,
    "sidecar store generations directory",
    TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries,
  );
  let committedBytes = 0;
  let targetAlreadyExists = false;
  for (const name of names) {
    if (!STORE_GENERATION_FILE.test(name)) {
      fail("sidecar store generations directory contains an unknown entry");
    }
    const stats = await assertSidecarFileStats(
      path.join(store.generations.directory, name),
      `sidecar store generation ${name}`,
      [1, 2],
      store.generations.stats.dev,
    );
    committedBytes += Number(stats.size);
    if (!Number.isSafeInteger(committedBytes)) {
      fail("sidecar store history byte accounting overflowed");
    }
    if (name === generationFileName) {
      targetAlreadyExists = true;
    }
  }
  assertTaskMapIdentityDedupeStoreAppendCapacity(
    committedBytes,
    candidateBytes,
    targetAlreadyExists,
    names.length,
  );
}

async function writeSidecarStage(
  store: OpenSidecarStore,
  entry: TaskMapIdentityDedupeStoreEntryV1,
  options: TaskMapIdentityDedupeWriteOptions,
): Promise<{
  stagePath: string;
  bytes: string;
  writerClaim: SidecarWriterClaim;
  stats: BigIntStats;
}> {
  const bytes = taskMapContractCanonicalJson(entry);
  const [firstChunk, secondChunk] =
    taskMapIdentityDedupeUtf8WriteChunks(bytes);
  const byteLength = firstChunk.byteLength + secondChunk.byteLength;
  const writerClaim = await createSidecarWriterClaim(store, options);
  const stagePath = path.join(
    store.staging.directory,
    `stage_${writerClaim.token}.json`,
  );
  let descriptor: number | undefined;
  let stagedStats: BigIntStats | undefined;
  let initialStageStats: BigIntStats | undefined;
  let stageCreated = false;
  let journalBound = false;
  let injectedError: unknown;
  const inject = async (
    point: TaskMapIdentityDedupeFaultPoint,
  ): Promise<void> => {
    try {
      await options.faultInjection?.(point);
    } catch (error) {
      injectedError = error;
      throw error;
    }
  };
  try {
    const existingStages = await listSidecarDirectory(
      store.staging,
      "sidecar store staging directory",
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries,
    );
    let existingStageBytes = 0n;
    for (const name of existingStages) {
      if (!STORE_STAGE_FILE.test(name)) {
        fail("sidecar store staging directory contains an unknown entry");
      }
      const stage = await assertRecoverableSidecarStage(
        path.join(store.staging.directory, name),
        `sidecar staged entry ${name}`,
        store.staging.stats.dev,
      );
      existingStageBytes += stage.size;
    }
    if (
      existingStages.length
        >= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries
      || existingStageBytes + BigInt(byteLength)
        > BigInt(TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingBytes)
    ) {
      fail("sidecar store has no transient staging capacity");
    }
    await inject("before_stage_create");
    const stagingParentDescriptor = openVerifiedSidecarParentSync(
      store.staging,
      "sidecar store staging directory",
    );
    try {
      descriptor = openSync(
        stagePath,
        FS_CONSTANTS.O_WRONLY
          | FS_CONSTANTS.O_CREAT
          | FS_CONSTANTS.O_EXCL
          | FS_CONSTANTS.O_NOFOLLOW,
        FILE_MODE,
      );
      stageCreated = true;
      // Capture the O_EXCL inode before chmod or any subsequent fstat can
      // fail, so pre-journal cleanup stays bound to this exact creation.
      initialStageStats = fstatSync(descriptor, { bigint: true });
      fchmodSync(descriptor, FILE_MODE);
      initialStageStats = fstatSync(descriptor, { bigint: true });
      if (
        !checkedSidecarParentStillCurrentSync(
          stagingParentDescriptor,
          store.staging,
        )
      ) {
        closeSync(descriptor);
        descriptor = undefined;
        const currentParent = observeSidecarDirectorySync(
          store.staging.directory,
          "sidecar replacement staging directory",
        );
        unlinkExactCreatedSidecarFileSync(
          stagePath,
          currentParent,
          initialStageStats,
          "",
          "sidecar staged entry",
        );
        stageCreated = false;
        fail("sidecar staging directory was replaced during stage creation");
      }
    } finally {
      try {
        closeSync(stagingParentDescriptor);
      } catch {
        // The staging parent was already checked around O_EXCL creation.
      }
    }
    if (
      !initialStageStats.isFile()
      || initialStageStats.isSymbolicLink()
      || initialStageStats.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(initialStageStats) !== FILE_MODE
      || initialStageStats.dev !== store.staging.stats.dev
      || initialStageStats.nlink !== 1n
      || initialStageStats.size !== 0n
    ) {
      fail("sidecar staged entry changed before writer-journal binding");
    }
    await inject("before_stage_journal_bind");
    await bindSidecarWriterClaimToStage(
      store,
      writerClaim,
      stagePath,
      initialStageStats,
    );
    journalBound = true;
    await inject("after_stage_create");
    if (
      writeSync(
        descriptor,
        firstChunk,
        0,
        firstChunk.byteLength,
        0,
      ) !== firstChunk.byteLength
    ) {
      fail("sidecar staged entry first write was incomplete");
    }
    await inject("after_stage_partial_write");
    if (
      writeSync(
        descriptor,
        secondChunk,
        0,
        secondChunk.byteLength,
        firstChunk.byteLength,
      ) !== secondChunk.byteLength
    ) {
      fail("sidecar staged entry second write was incomplete");
    }
    fsyncSync(descriptor);
    stagedStats = fstatSync(descriptor, { bigint: true });
    if (
      !stagedStats.isFile()
      || stagedStats.isSymbolicLink()
      || stagedStats.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(stagedStats) !== FILE_MODE
      || stagedStats.dev !== store.staging.stats.dev
      || stagedStats.dev !== initialStageStats.dev
      || stagedStats.ino !== initialStageStats.ino
      || stagedStats.nlink !== 1n
      || stagedStats.size !== BigInt(byteLength)
    ) {
      fail("sidecar staged entry changed while writing");
    }
  } catch (error) {
    if (!journalBound) {
      let stageRemovalSynced = !stageCreated;
      if (
        stageCreated
        && initialStageStats === undefined
        && descriptor !== undefined
      ) {
        try {
          initialStageStats = fstatSync(descriptor, { bigint: true });
        } catch {
          // Exact cleanup below remains fail-closed without a receipt.
        }
      }
      if (stageCreated && initialStageStats !== undefined) {
        try {
          if (descriptor !== undefined) {
            closeSync(descriptor);
            descriptor = undefined;
          }
          revalidateSidecarDirectorySync(
            store.staging,
            "sidecar store staging directory",
          );
          unlinkExactCreatedSidecarFileSync(
            stagePath,
            store.staging.stats,
            initialStageStats,
            "",
            "sidecar pre-journal staged entry",
          );
          stageCreated = false;
          stageRemovalSynced = true;
        } catch {
          // Preserve the claim when stage cleanup cannot be proven durable.
        }
      }
      if (stageRemovalSynced) {
        await closeSidecarWriterClaim(store, writerClaim)
          .catch(() => undefined);
      }
    }
    if (error === injectedError) throw error;
    fail("cannot create and sync the sidecar staging entry");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The stage remains journal-bound for explicit recovery on error.
      }
    }
  }
  try {
    await syncSidecarDirectory(
      store.staging,
      "sidecar store staging directory",
    );
  } catch (error) {
    // The journal remains so recovery can bind the extant stage exactly.
    throw error;
  }
  if (stagedStats === undefined) {
    fail("sidecar staged entry has no bound inode");
  }
  return { stagePath, bytes, writerClaim, stats: stagedStats };
}

async function verifySidecarStageBeforeLink(
  staged: {
    stagePath: string;
    bytes: string;
    stats: BigIntStats;
  },
  expectedEntry: TaskMapIdentityDedupeStoreEntryV1,
): Promise<void> {
  const observed = await readSidecarEntryFile(
    staged.stagePath,
    "sidecar staged entry before generation CAS",
    [1],
    staged.stats.dev,
  );
  if (
    observed.stats.dev !== staged.stats.dev
    || observed.stats.ino !== staged.stats.ino
    || observed.stats.size !== staged.stats.size
    || observed.stats.nlink !== 1n
    || observed.bytes !== staged.bytes
    || !canonicalEqual(observed.entry, expectedEntry)
  ) {
    fail("sidecar staged entry changed before generation CAS");
  }
}

function verifySidecarStageBeforeLinkSync(
  staged: {
    stagePath: string;
    bytes: string;
    stats: BigIntStats;
  },
  expectedEntry: TaskMapIdentityDedupeStoreEntryV1,
): void {
  let descriptor: number | undefined;
  try {
    const observed = lstatSync(staged.stagePath, { bigint: true });
    if (
      !observed.isFile()
      || observed.isSymbolicLink()
      || observed.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(observed) !== FILE_MODE
      || observed.dev !== staged.stats.dev
      || observed.ino !== staged.stats.ino
      || observed.size !== staged.stats.size
      || observed.nlink !== 1n
    ) {
      fail("sidecar staged entry changed at generation CAS");
    }
    descriptor = openSync(
      staged.stagePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const current = fstatSync(descriptor, { bigint: true });
    if (
      current.dev !== observed.dev
      || current.ino !== observed.ino
      || current.size !== observed.size
      || current.nlink !== 1n
      || current.uid !== observed.uid
      || sidecarModeBits(current) !== FILE_MODE
    ) {
      fail("sidecar staged entry changed while opening at generation CAS");
    }
    const buffer = readFileSync(descriptor);
    if (BigInt(buffer.byteLength) !== current.size) {
      fail("sidecar staged entry changed while reading at generation CAS");
    }
    const bytes = decodeExactUtf8(
      buffer,
      "sidecar staged entry at generation CAS",
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      fail("sidecar staged entry is not JSON at generation CAS");
    }
    const entry = assertTaskMapIdentityDedupeStoreEntry(
      parsed as TaskMapIdentityDedupeStoreEntryV1,
    );
    if (
      bytes !== staged.bytes
      || taskMapContractCanonicalJson(entry) !== bytes
      || !canonicalEqual(entry, expectedEntry)
    ) {
      fail("sidecar staged entry bytes changed at generation CAS");
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail("sidecar staged entry cannot be verified at generation CAS");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The CAS will fail closed on the already-detected descriptor error.
      }
    }
  }
}

function unlinkExactSidecarGenerationFromObservedParentSync(
  generationPath: string,
  expectedParent: BigIntStats,
  staged: {
    bytes: string;
    stats: BigIntStats;
  },
  label: string,
): void {
  let parentDescriptor: number | undefined;
  let entryDescriptor: number | undefined;
  try {
    parentDescriptor = openSync(
      path.dirname(generationPath),
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const openedParent = fstatSync(parentDescriptor, { bigint: true });
    if (
      !openedParent.isDirectory()
      || openedParent.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(openedParent) !== DIRECTORY_MODE
      || openedParent.dev !== expectedParent.dev
      || openedParent.ino !== expectedParent.ino
    ) {
      fail(`${label} parent changed before exact rollback`);
    }
    const observed = lstatSync(generationPath, { bigint: true });
    if (
      !observed.isFile()
      || observed.isSymbolicLink()
      || observed.uid !== BigInt(sidecarCurrentUid())
      || sidecarModeBits(observed) !== FILE_MODE
      || observed.dev !== staged.stats.dev
      || observed.ino !== staged.stats.ino
      || observed.nlink !== 2n
      || observed.size !== staged.stats.size
    ) {
      fail(`${label} is not the exact staged hardlink`);
    }
    entryDescriptor = openSync(
      generationPath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(entryDescriptor, { bigint: true });
    if (
      opened.dev !== observed.dev
      || opened.ino !== observed.ino
      || opened.uid !== observed.uid
      || sidecarModeBits(opened) !== FILE_MODE
      || opened.nlink !== 2n
      || opened.size !== observed.size
    ) {
      fail(`${label} changed while opening for exact rollback`);
    }
    const bytes = readFileSync(entryDescriptor);
    if (
      BigInt(bytes.byteLength) !== opened.size
      || !bytes.equals(Buffer.from(staged.bytes, "utf8"))
    ) {
      fail(`${label} bytes changed before exact rollback`);
    }
    const finalParent = lstatSync(
      path.dirname(generationPath),
      { bigint: true },
    );
    const finalEntry = lstatSync(generationPath, { bigint: true });
    if (
      finalParent.dev !== openedParent.dev
      || finalParent.ino !== openedParent.ino
      || finalEntry.dev !== opened.dev
      || finalEntry.ino !== opened.ino
      || finalEntry.nlink !== 2n
      || finalEntry.size !== opened.size
    ) {
      fail(`${label} changed immediately before exact rollback`);
    }
    unlinkSync(generationPath);
    fsyncSync(parentDescriptor);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P10.2 identity/dedupe projection:")
    ) {
      throw error;
    }
    fail(`${label} cannot be rolled back exactly`);
  } finally {
    if (entryDescriptor !== undefined) {
      try {
        closeSync(entryDescriptor);
      } catch {
        // Exact rollback success/failure was already decided above.
      }
    }
    if (parentDescriptor !== undefined) {
      try {
        closeSync(parentDescriptor);
      } catch {
        // Directory durability was already attempted before close.
      }
    }
  }
}

async function verifyLinkedSidecarPeers(
  staged: {
    stagePath: string;
    bytes: string;
    stats: BigIntStats;
  },
  generationPath: string,
  expectedEntry: TaskMapIdentityDedupeStoreEntryV1,
): Promise<void> {
  const stage = await readSidecarEntryFile(
    staged.stagePath,
    "linked sidecar staged entry",
    [2],
    staged.stats.dev,
  );
  const generation = await readSidecarEntryFile(
    generationPath,
    `sidecar committed generation ${expectedEntry.generation}`,
    [2],
    staged.stats.dev,
  );
  if (
    stage.stats.dev !== staged.stats.dev
    || stage.stats.ino !== staged.stats.ino
    || stage.stats.size !== staged.stats.size
    || generation.stats.dev !== stage.stats.dev
    || generation.stats.ino !== stage.stats.ino
    || generation.stats.size !== stage.stats.size
    || stage.bytes !== staged.bytes
    || generation.bytes !== staged.bytes
    || !canonicalEqual(stage.entry, expectedEntry)
    || !canonicalEqual(generation.entry, expectedEntry)
  ) {
    fail("sidecar generation is not the exact staged hardlink peer");
  }
}

async function publishSidecarEntry(
  store: OpenSidecarStore,
  entry: TaskMapIdentityDedupeStoreEntryV1,
  beforeCas: () => Promise<void>,
  options: TaskMapIdentityDedupeWriteOptions = {},
): Promise<TaskMapIdentityDedupePublicationV1> {
  const generationPath = path.join(
    store.generations.directory,
    sidecarGenerationFileName(entry.generation),
  );
  const candidateBytes = Buffer.byteLength(
    taskMapContractCanonicalJson(entry),
    "utf8",
  );
  await assertSidecarStoreAppendCapacity(
    store,
    path.basename(generationPath),
    candidateBytes,
  );
  const staged = await writeSidecarStage(store, entry, options);
  let stageRemoved = false;
  let claimCloseAttempted = false;
  const closeRemovedStageClaim = async (): Promise<void> => {
    claimCloseAttempted = true;
    await closeSidecarWriterClaim(store, staged.writerClaim);
  };
  try {
  await options.faultInjection?.("after_stage_sync");
  await revalidateSidecarDirectory(
    store.root,
    "sidecar store root",
  );
  await revalidateSidecarDirectory(
    store.generations,
    "sidecar store generations directory",
  );
  await revalidateSidecarDirectory(
    store.staging,
    "sidecar store staging directory",
  );
  try {
    await assertSidecarStoreAppendCapacity(
      store,
      path.basename(generationPath),
      Buffer.byteLength(staged.bytes, "utf8"),
    );
  } catch (error) {
    await unlinkExactSidecarStage(store, {
      ...staged,
      expectedNlink: 1n,
      expectedBytes: staged.bytes,
      journalRequired: true,
    }, "sidecar capacity-failed staged entry");
    stageRemoved = true;
    throw error;
  }
  await verifySidecarStageBeforeLink(staged, entry);
  try {
    await options.faultInjection?.("before_generation_cas");
    await beforeCas();
  } catch (error) {
    await unlinkExactSidecarStage(store, {
      ...staged,
      expectedNlink: 1n,
      expectedBytes: staged.bytes,
      journalRequired: true,
    }, "sidecar pre-CAS staged entry");
    stageRemoved = true;
    throw error;
  }
  verifySidecarStageBeforeLinkSync(staged, entry);
  let generationParentDescriptor: number | undefined;
  let stagingParentDescriptor: number | undefined;
  try {
    revalidateSidecarDirectorySync(
      store.generations,
      "sidecar store generations directory",
    );
    await options.faultInjection?.("after_generation_parent_check");
    stagingParentDescriptor = openVerifiedSidecarParentSync(
      store.staging,
      "sidecar store staging directory",
    );
    generationParentDescriptor = openVerifiedSidecarParentSync(
      store.generations,
      "sidecar store generations directory",
    );
  } catch (error) {
    if (stagingParentDescriptor !== undefined) {
      closeSync(stagingParentDescriptor);
      stagingParentDescriptor = undefined;
    }
    await unlinkExactSidecarStage(store, {
      ...staged,
      expectedNlink: 1n,
      expectedBytes: staged.bytes,
      journalRequired: true,
    }, "sidecar generation-parent-failed staged entry");
    stageRemoved = true;
    throw error;
  }
  let generationLinked = false;
  try {
    linkSync(staged.stagePath, generationPath);
    generationLinked = true;
  } catch (error) {
    const generationParentCurrent = generationParentDescriptor !== undefined
      && checkedSidecarParentStillCurrentSync(
        generationParentDescriptor,
        store.generations,
      );
    const stagingParentCurrent = stagingParentDescriptor !== undefined
      && checkedSidecarParentStillCurrentSync(
        stagingParentDescriptor,
        store.staging,
      );
    if (generationParentDescriptor !== undefined) {
      closeSync(generationParentDescriptor);
      generationParentDescriptor = undefined;
    }
    if (stagingParentDescriptor !== undefined) {
      closeSync(stagingParentDescriptor);
      stagingParentDescriptor = undefined;
    }
    if (!generationParentCurrent || !stagingParentCurrent) {
      if (!stagingParentCurrent) {
        fail("sidecar staging directory was replaced during generation CAS");
      }
      await unlinkExactSidecarStage(store, {
        ...staged,
        expectedNlink: 1n,
        expectedBytes: staged.bytes,
        journalRequired: true,
      }, "sidecar replaced-generation-parent staged entry");
      stageRemoved = true;
      fail("sidecar generations directory was replaced during generation CAS");
    }
    if (sidecarErrnoCode(error) !== "EEXIST") {
      fail("sidecar generation CAS link failed");
    }
    await options.faultInjection?.("before_existing_stage_cleanup");
    revalidateOpenSidecarStoreSync(
      store,
      "sidecar already-published return",
    );
    await unlinkExactSidecarStage(store, {
      ...staged,
      expectedNlink: 1n,
      expectedBytes: staged.bytes,
      journalRequired: true,
    }, "sidecar already-published staged entry");
    stageRemoved = true;
    const existing = await readSidecarEntryFile(
      generationPath,
      `sidecar store generation ${entry.generation}`,
      [1, 2],
      store.generations.stats.dev,
    );
    if (!canonicalEqual(existing.entry, entry)) {
      fail("sidecar generation CAS conflict");
    }
    await closeRemovedStageClaim();
    revalidateOpenSidecarStoreSync(
      store,
      "sidecar already-published return",
    );
    return {
      status: "already_published",
      entry: existing.entry,
      processCrashAtomic: true,
      powerLossDurabilityClaimed: false,
    };
  }
  const linkedParentCurrent = generationParentDescriptor !== undefined
    && checkedSidecarParentStillCurrentSync(
      generationParentDescriptor,
      store.generations,
    );
  const linkedStagingParentCurrent = stagingParentDescriptor !== undefined
    && checkedSidecarParentStillCurrentSync(
      stagingParentDescriptor,
      store.staging,
    );
  if (stagingParentDescriptor !== undefined) {
    closeSync(stagingParentDescriptor);
    stagingParentDescriptor = undefined;
  }
  let linkedParent: BigIntStats | undefined;
  if (!linkedParentCurrent || !linkedStagingParentCurrent) {
    linkedParent = observeSidecarDirectorySync(
      store.generations.directory,
      "sidecar generations directory after generation CAS",
    );
  }
  if (generationParentDescriptor !== undefined) {
    closeSync(generationParentDescriptor);
    generationParentDescriptor = undefined;
  }
  if (!linkedParentCurrent || !linkedStagingParentCurrent) {
    if (!generationLinked) {
      fail("sidecar generation CAS parent changed without a created link");
    }
    unlinkExactSidecarGenerationFromObservedParentSync(
      generationPath,
      linkedParent!,
      staged,
      "sidecar generation in a replaced parent",
    );
    if (!linkedStagingParentCurrent) {
      fail("sidecar staging directory was replaced during generation CAS");
    }
    await unlinkExactSidecarStage(store, {
      ...staged,
      expectedNlink: 1n,
      expectedBytes: staged.bytes,
      journalRequired: true,
    }, "sidecar rolled-back generation staged entry");
    stageRemoved = true;
    fail("sidecar generations directory was replaced during generation CAS");
  }
  await verifyLinkedSidecarPeers(
    staged,
    generationPath,
    entry,
  );
  await options.faultInjection?.("after_generation_link");
  revalidateOpenSidecarStoreSync(
    store,
    "sidecar linked-generation postcheck",
  );
  await verifyLinkedSidecarPeers(
    staged,
    generationPath,
    entry,
  );
  await syncSidecarDirectory(
    store.generations,
    "sidecar store generations directory",
  );
  revalidateOpenSidecarStoreSync(
    store,
    "sidecar linked-generation sync",
  );
  await options.faultInjection?.("before_stage_cleanup");
  revalidateOpenSidecarStoreSync(
    store,
    "sidecar published return",
  );
  await unlinkExactSidecarStage(store, {
    ...staged,
    expectedNlink: 2n,
    expectedBytes: staged.bytes,
    journalRequired: true,
  }, "sidecar linked staged entry");
  stageRemoved = true;
  await closeRemovedStageClaim();
  revalidateOpenSidecarStoreSync(
    store,
    "sidecar published return",
  );
  return {
    status: "published",
    entry,
    processCrashAtomic: true,
    powerLossDurabilityClaimed: false,
  };
  } finally {
    if (stageRemoved && !claimCloseAttempted) {
      await closeRemovedStageClaim();
    }
  }
}

/**
 * Store-backed read/verify/build path. It reads the exact authenticated
 * generation N-1 sidecar from the append-only P10.2 store; callers cannot
 * inject lifecycle history. It is intentionally non-publishing.
 */
export async function buildTaskMapIdentityDedupeProjection(
  input: BuildTaskMapIdentityDedupeProjectionFromStoreInput,
): Promise<BuiltTaskMapIdentityDedupeProjection> {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotStoreInput(input);
  const context = await buildStoreBackedProjection(snapshot);
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  const latest = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  if (!sameCurrentHead(context.currentSnapshot, latest)) {
    fail("P10.1 current head advanced during sidecar construction");
  }
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  return context.built;
}

/**
 * Production publication path. Each P10.1 generation receives exactly one
 * immutable sidecar+diff entry. The P10.1 current head is reread as the final
 * asynchronous operation before the no-replace generation link.
 */
export async function buildAndPublishTaskMapIdentityDedupeProjection(
  input: BuildTaskMapIdentityDedupeProjectionFromStoreInput,
  options: TaskMapIdentityDedupeWriteOptions = {},
): Promise<BuiltAndPublishedTaskMapIdentityDedupeProjection> {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotStoreInput(input);
  const context = await buildStoreBackedProjection(snapshot);
  if (context.currentEntry !== null) {
    await options.faultInjection?.("before_retry_revalidation");
    await revalidateDisjointTaskMapStoreRoots(
      snapshot,
      context.isolatedRoots,
    );
    const exactEntry = await reopenExactRetryEntry(
      snapshot.sidecarRoot,
      context.currentSnapshot,
      context.currentEntry,
      "current sidecar generation",
    );
    const latest = await readTaskMapRefreshCurrent(
      snapshot.currentRoot,
      snapshot.runRoot,
    );
    if (!sameCurrentHead(context.currentSnapshot, latest)) {
      fail("P10.1 current head advanced during sidecar retry");
    }
    await revalidateDisjointTaskMapStoreRoots(
      snapshot,
      context.isolatedRoots,
    );
    return {
      ...context.built,
      publication: {
        status: "already_published",
        entry: exactEntry,
        processCrashAtomic: true,
        powerLossDurabilityClaimed: false,
      },
    };
  }
  const entry = buildStoreEntry(
    context.built,
    context.predecessor,
    context.currentSnapshot.head!,
  );
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  const store = await openSidecarStore(snapshot.sidecarRoot);
  const publication = await publishSidecarEntry(
    store,
    entry,
    async () => {
      const latestSidecars = await readSidecarStoreFromOpen(store, true);
      const aligned = assertSidecarStoreAlignedWithCurrent(
        latestSidecars,
        context.currentSnapshot,
      );
      if (
        (
          aligned.currentEntry !== null
          && !canonicalEqual(aligned.currentEntry, entry)
        )
        || (
          context.predecessor === null
            ? aligned.predecessor !== null
            : (
              aligned.predecessor === null
              || aligned.predecessor.entryId
                !== context.predecessor.entryId
            )
        )
      ) {
        fail("sidecar predecessor changed before generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(
        snapshot,
        context.isolatedRoots,
      );
      const latest = await readTaskMapRefreshCurrent(
        snapshot.currentRoot,
        snapshot.runRoot,
      );
      if (!sameCurrentHead(context.currentSnapshot, latest)) {
        fail("P10.1 current head advanced before sidecar generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(
        snapshot,
        context.isolatedRoots,
      );
    },
    options,
  );
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  const latest = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  if (!sameCurrentHead(context.currentSnapshot, latest)) {
    fail(
      "P10.1 current head advanced after committed sidecar publication; retry",
    );
  }
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  return { ...context.built, publication };
}

/**
 * Explicit reviewed adoption path for an existing P10.1 history. Backfill is
 * strictly sequential from generation one and never skips a P10.1 generation.
 * The target ref must remain an exact member of the healthy append-only P10.1
 * history through the P10.2 generation CAS.
 */
export async function backfillTaskMapIdentityDedupeProjectionGeneration(
  input: BackfillTaskMapIdentityDedupeProjectionInput,
  options: TaskMapIdentityDedupeWriteOptions = {},
): Promise<BuiltAndPublishedTaskMapIdentityDedupeProjection> {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotBackfillInput(input);
  const context = await buildBackfillProjection(snapshot);
  if (context.currentEntry !== null) {
    await options.faultInjection?.("before_retry_revalidation");
    await revalidateDisjointTaskMapStoreRoots(
      snapshot,
      context.isolatedRoots,
    );
    const exactEntry = await reopenExactRetryEntry(
      snapshot.sidecarRoot,
      context.currentSnapshot,
      context.currentEntry,
      "backfill sidecar generation",
    );
    const latest = await readTaskMapRefreshCurrent(
      snapshot.currentRoot,
      snapshot.runRoot,
    );
    if (!historyStillContainsTarget(context.currentSnapshot, latest)) {
      fail("P10.1 backfill target changed during sidecar retry");
    }
    await revalidateDisjointTaskMapStoreRoots(
      snapshot,
      context.isolatedRoots,
    );
    return {
      ...context.built,
      publication: {
        status: "already_published",
        entry: exactEntry,
        processCrashAtomic: true,
        powerLossDurabilityClaimed: false,
      },
    };
  }
  const entry = buildStoreEntry(
    context.built,
    context.predecessor,
    context.currentSnapshot.head!,
  );
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  const store = await openSidecarStore(snapshot.sidecarRoot);
  const publication = await publishSidecarEntry(
    store,
    entry,
    async () => {
      const latestSidecars = await readSidecarStoreFromOpen(store, true);
      const aligned = assertSidecarStoreAlignedWithCurrent(
        latestSidecars,
        context.currentSnapshot,
      );
      if (
        (
          aligned.currentEntry !== null
          && !canonicalEqual(aligned.currentEntry, entry)
        )
        || (
          context.predecessor === null
            ? aligned.predecessor !== null
            : (
              aligned.predecessor === null
              || aligned.predecessor.entryId
                !== context.predecessor.entryId
            )
        )
      ) {
        fail("backfill predecessor changed before generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(
        snapshot,
        context.isolatedRoots,
      );
      const latest = await readTaskMapRefreshCurrent(
        snapshot.currentRoot,
        snapshot.runRoot,
      );
      if (!historyStillContainsTarget(context.currentSnapshot, latest)) {
        fail("P10.1 backfill target changed before sidecar generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(
        snapshot,
        context.isolatedRoots,
      );
    },
    options,
  );
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  const latest = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  if (!historyStillContainsTarget(context.currentSnapshot, latest)) {
    fail("P10.1 backfill target changed after sidecar publication");
  }
  await revalidateDisjointTaskMapStoreRoots(
    snapshot,
    context.isolatedRoots,
  );
  return { ...context.built, publication };
}

async function publishTaskMapIdentityDedupeGenerationObservation(
  input: TaskMapIdentityDedupeGenerationObservationInput,
  expectedKind: TaskMapIdentityDedupeObservationStoreEntryV1["entryKind"],
  options: TaskMapIdentityDedupeWriteOptions,
): Promise<TaskMapIdentityDedupePublicationV1> {
  assertArrayPrototypeIntegrity();
  const snapshot = snapshotObservationInput(input);
  const isolatedRoots = await assertDisjointTaskMapStoreRoots(snapshot);
  const observedCurrentSnapshot = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  assertHealthyCurrentHistory(observedCurrentSnapshot);
  const targetIndex = Number(BigInt(snapshot.targetGeneration) - 1n);
  const targetRef = observedCurrentSnapshot.generations[targetIndex];
  if (
    targetIndex < 0
    || targetIndex
      >= TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries
    || targetRef === undefined
    || targetRef.generation !== snapshot.targetGeneration
  ) {
    fail("generation observation target is not in healthy P10.1 history");
  }
  const targetSnapshot: TaskMapRefreshCurrentSnapshotV1 = {
    status: "healthy",
    head: targetRef,
    generations: observedCurrentSnapshot.generations.slice(
      0,
      targetIndex + 1,
    ),
    unknownGenerationNames: [],
    unknownObjectNames: [],
  };
  assertHealthyCurrentHistory(targetSnapshot);
  const sidecarStore =
    await readTaskMapIdentityDedupeProjectionStoreStructural(
    snapshot.sidecarRoot,
  );
  if (
    sidecarStore.entries.length !== targetIndex
    && sidecarStore.entries.length !== targetIndex + 1
  ) {
    fail(
      "generation observation must append exactly the next missing "
        + "P10.2 generation",
    );
  }
  const { predecessor, currentEntry } =
    assertSidecarStoreAlignedWithCurrent(sidecarStore, targetSnapshot);
  await verifySidecarStoreAcceptedOrigins(
    sidecarStore,
    targetSnapshot,
    snapshot.runRoot,
  );
  const entry = buildObservationStoreEntry(targetRef, predecessor);
  if (entry.entryKind !== expectedKind) {
    fail(`P10.1 generation is not a ${expectedKind} observation`);
  }
  if (currentEntry !== null) {
    if (!canonicalEqual(currentEntry, entry)) {
      fail("generation observation already exists with different contents");
    }
    await options.faultInjection?.("before_retry_revalidation");
    await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
    const exactEntry = await reopenExactRetryEntry(
      snapshot.sidecarRoot,
      targetSnapshot,
      currentEntry,
      "generation observation",
    );
    const latest = await readTaskMapRefreshCurrent(
      snapshot.currentRoot,
      snapshot.runRoot,
    );
    if (!historyStillContainsTarget(targetSnapshot, latest)) {
      fail("P10.1 observation target changed during retry");
    }
    await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
    return {
      status: "already_published",
      entry: exactEntry,
      processCrashAtomic: true,
      powerLossDurabilityClaimed: false,
    };
  }
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  const store = await openSidecarStore(snapshot.sidecarRoot);
  const publication = await publishSidecarEntry(
    store,
    entry,
    async () => {
      const latestSidecars = await readSidecarStoreFromOpen(store, true);
      const aligned = assertSidecarStoreAlignedWithCurrent(
        latestSidecars,
        targetSnapshot,
      );
      if (
        (
          aligned.currentEntry !== null
          && !canonicalEqual(aligned.currentEntry, entry)
        )
        || (
          predecessor === null
            ? aligned.predecessor !== null
            : (
              aligned.predecessor === null
              || aligned.predecessor.entryId !== predecessor.entryId
            )
        )
      ) {
        fail("observation predecessor changed before generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
      const latest = await readTaskMapRefreshCurrent(
        snapshot.currentRoot,
        snapshot.runRoot,
      );
      if (!historyStillContainsTarget(targetSnapshot, latest)) {
        fail("P10.1 observation target changed before generation CAS");
      }
      await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
    },
    options,
  );
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  const latest = await readTaskMapRefreshCurrent(
    snapshot.currentRoot,
    snapshot.runRoot,
  );
  if (!historyStillContainsTarget(targetSnapshot, latest)) {
    fail("P10.1 observation target changed after publication");
  }
  await revalidateDisjointTaskMapStoreRoots(snapshot, isolatedRoots);
  return publication;
}

/**
 * Represents a valid P10.1 generation whose history has no accepted origin.
 * It advances only the authenticated generation chain and carries no semantic
 * projection.
 */
export async function backfillTaskMapIdentityDedupeNoAcceptedGeneration(
  input: TaskMapIdentityDedupeGenerationObservationInput,
  options: TaskMapIdentityDedupeWriteOptions = {},
): Promise<TaskMapIdentityDedupePublicationV1> {
  return publishTaskMapIdentityDedupeGenerationObservation(
    input,
    "no_accepted_origin",
    options,
  );
}

/**
 * Records an exact P10.1 rollback tuple while preserving the last reviewed
 * semantic sidecar. Caller-authored identity and lifecycle decisions are not
 * accepted on this path.
 */
export async function publishTaskMapIdentityDedupeRollbackObservation(
  input: TaskMapIdentityDedupeGenerationObservationInput,
  options: TaskMapIdentityDedupeWriteOptions = {},
): Promise<TaskMapIdentityDedupePublicationV1> {
  return publishTaskMapIdentityDedupeGenerationObservation(
    input,
    "rollback_observed",
    options,
  );
}

export const backfillTaskMapIdentityDedupeRollbackObservation =
  publishTaskMapIdentityDedupeRollbackObservation;
