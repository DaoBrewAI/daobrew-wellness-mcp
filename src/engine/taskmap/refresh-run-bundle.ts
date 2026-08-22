import { createHash } from "node:crypto";
import {
  constants as FS_CONSTANTS,
  type Stats,
} from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  assertTaskMapConnectorCheckpoint,
  assertTaskMapSourceSnapshot,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  assertTaskMapReadyBatch,
  assertTaskMapRefreshPlan,
  type TaskMapReadyBatchV1,
  type TaskMapRefreshPlanV1,
  type TaskMapRefreshSourceRevisionV1,
} from "./refresh-plan.js";
import {
  type TaskMapConnectorCheckpointV1,
  type TaskMapSourceKind,
  type TaskMapSourceSnapshotV1,
} from "./types.js";

export const TASKMAP_REFRESH_RUN_BUNDLE_VERSION =
  "taskmap-refresh-run-bundle.v1" as const;
export const TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION =
  "taskmap-refresh-run-checkpoints.v1" as const;
export const TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION =
  "taskmap-refresh-run-source-snapshot-proof.v1" as const;
export const TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION =
  "taskmap-refresh-run-source-slice-proof.v1" as const;
export const TASKMAP_REFRESH_RUN_COMMIT_VERSION =
  "taskmap-refresh-run-commit.v1" as const;

export const TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1 = Object.freeze({
  maxMemberBytes: 4 * 1024 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxCheckpoints: 4096,
  maxFiles: 6,
  maxJsonDepth: 32,
  maxJsonNodes: 262_144,
  maxObjectKeys: 4096,
  maxReservationWaitMs: 30_000,
});

const SHA256 = /^[a-f0-9]{64}$/;
const BUNDLE_ID = /^tmrefreshrun_[a-f0-9]{64}$/;
const CHECKPOINT_SET_ID = /^tmrefreshcheckpoints_[a-f0-9]{64}$/;
const SNAPSHOT_PROOF_ID = /^tmrefreshsnapshotproof_[a-f0-9]{64}$/;
const EMAIL_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URI_SCHEME =
  /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9+.-]*:\/\//i;
const ENCODED_PATH = /%(?:2f|5c|7e|3a)/i;
const COMMON_SECRET_TEXT =
  /(?:\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,255}\b|\bxox[baprs]-[A-Za-z0-9-]{10,255}\b|\bAIza[A-Za-z0-9_-]{20,64}\b|\bsk_live_[A-Za-z0-9]{16,255}\b|\bnpm_[A-Za-z0-9]{20,255}\b|\beyJ[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\b|bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|BEGIN [A-Z0-9 ]*PRIVATE KEY)/i;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const CONTENT_MEMBER_ORDER = [
  "plan.json",
  "batch.json",
  "checkpoints.json",
  "source-snapshot.json",
] as const;
const CLOSED_FILE_NAMES = new Set([
  ...CONTENT_MEMBER_ORDER,
  "manifest.json",
  "COMMITTED",
]);
const REQUIRED_FILE_NAMES = new Set([
  "plan.json",
  "batch.json",
  "checkpoints.json",
  "manifest.json",
  "COMMITTED",
]);
const BUNDLE_PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  rawSourceObjectIdentifiersStored: false,
  discoveryIdentifiersStored: false,
  connectorSecretsStored: false,
  localPathsStored: false,
});
const PRIVACY_KEYS = new Set(Object.keys(BUNDLE_PRIVACY));

export type TaskMapRefreshRunContentMemberName =
  typeof CONTENT_MEMBER_ORDER[number];
export type TaskMapRefreshRunMaterializationStatus =
  | "created"
  | "already_present";
export type TaskMapRefreshRunFaultPoint =
  | "after_reservation"
  | "after_plan"
  | "after_batch"
  | "after_checkpoints"
  | "after_source_snapshot"
  | "after_manifest"
  | "after_precommit_directory_sync"
  | "after_committed"
  | "after_final_directory_sync"
  | "after_publish_rename";

export interface TaskMapRefreshRunCheckpointRecordV1 {
  checkpointDigest: string;
  bindingDigest: string;
  checkpoint: TaskMapConnectorCheckpointV1;
}

export interface TaskMapRefreshRunSourceSliceProofDraftV1 {
  sliceRole?: "serving" | "observed_non_serving";
  ownerScopeDigest: string;
  bindingDigest: string;
  sourceRevisions: TaskMapRefreshSourceRevisionV1[];
  acceptedSourceIdentityDigests: string[];
}

export interface TaskMapRefreshRunSourceSliceProofV1
  extends Omit<TaskMapRefreshRunSourceSliceProofDraftV1, "sliceRole"> {
  contractVersion: typeof TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION;
  sourceRevisionSetDigest: string;
  sourceSliceDigest: string;
  sliceRole: "serving" | "observed_non_serving";
}

export interface TaskMapRefreshRunLaneReferenceV1 {
  laneId: string;
  referenceKind: "attempt_output" | "retained_last_good";
  checkpointDigest: string;
  sourceSliceDigest: string;
}

export interface TaskMapRefreshRunAttemptOutputV1 {
  laneId: string;
  checkpointDigest: string;
  sourceSliceDigest: string;
}

export interface TaskMapRefreshRunCheckpointsV1 {
  contractVersion: typeof TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION;
  checkpointSetId: string;
  ownerScopeDigest: string;
  planId: string;
  batchId: string;
  checkpoints: TaskMapRefreshRunCheckpointRecordV1[];
  checkpointDigests: string[];
  sourceSlices: TaskMapRefreshRunSourceSliceProofV1[];
  laneReferences: TaskMapRefreshRunLaneReferenceV1[];
  privacy: typeof BUNDLE_PRIVACY;
}

export interface TaskMapRefreshRunSourceSnapshotProofV1 {
  contractVersion:
    typeof TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION;
  sourceSnapshotProofId: string;
  sourceContractVersion: TaskMapSourceSnapshotV1["contractVersion"];
  ownerScopeDigest: string;
  planId: string;
  snapshotId: string;
  /**
   * Producer-attested P9.2 audit provenance. This digest is copied from the
   * validated source snapshot, but the digest-only proof intentionally omits
   * the snapshot body needed to recompute it. It is never promotion authority.
   */
  sourceSnapshotDigest: string;
  semanticInputDigest: string;
  /**
   * Producer-attested audit provenance only. P10.1C must not use this field as
   * independently verified body evidence or as a promotion condition.
   */
  bodyContextDigest: string;
  /**
   * Producer-attested audit provenance only. The privacy-safe bundle does not
   * persist discovery pointers, so this digest is not independently
   * recomputable here and must never authorize promotion.
   */
  discoveryProvenanceDigest: string;
  sourceBindingProofDigest: string;
  sourceRevisionProofDigest: string;
  sourceRevisionSetProofDigest: string;
  sourceBindingCount: number;
  sourceRevisionCount: number;
  privacy: typeof BUNDLE_PRIVACY;
}

export interface TaskMapRefreshRunMemberDescriptorV1 {
  fileName: TaskMapRefreshRunContentMemberName;
  kind: "plan" | "batch" | "checkpoints" | "source_snapshot_proof";
  contractVersion: string;
  artifactId: string;
  canonicalArtifactDigest: string;
  byteSha256: string;
  byteLength: number;
}

export interface TaskMapRefreshRunManifestV1 {
  contractVersion: typeof TASKMAP_REFRESH_RUN_BUNDLE_VERSION;
  bundleId: string;
  bundleContentDigest: string;
  ownerScopeDigest: string;
  planId: string;
  batchId: string;
  candidateAcceptedStateDigest: string;
  members: TaskMapRefreshRunMemberDescriptorV1[];
  privacy: typeof BUNDLE_PRIVACY;
}

export interface TaskMapRefreshRunCommitV1 {
  contractVersion: typeof TASKMAP_REFRESH_RUN_COMMIT_VERSION;
  bundleId: string;
  manifestByteSha256: string;
}

export interface PreparedTaskMapRefreshRunBundle {
  bundleId: string;
  manifest: TaskMapRefreshRunManifestV1;
  commitMarker: TaskMapRefreshRunCommitV1;
  members: Readonly<Partial<Record<TaskMapRefreshRunContentMemberName, string>>>;
}

export interface PrepareTaskMapRefreshRunBundleInput {
  plan: TaskMapRefreshPlanV1;
  batch: TaskMapReadyBatchV1;
  connectorCheckpoints: TaskMapConnectorCheckpointV1[];
  attemptOutputs: TaskMapRefreshRunAttemptOutputV1[];
  sourceSliceProofs: TaskMapRefreshRunSourceSliceProofV1[];
  sourceSnapshot?: TaskMapSourceSnapshotV1;
}

export interface TaskMapRefreshRunMaterializeOptions {
  reservationWaitMs?: number;
  pollIntervalMs?: number;
  faultInjection?: (
    point: TaskMapRefreshRunFaultPoint,
  ) => void | Promise<void>;
}

export interface TaskMapRefreshRunMaterializationResult {
  status: TaskMapRefreshRunMaterializationStatus;
  bundleId: string;
  /**
   * True when a cooperating-writer staging/reservation/final residual is
   * intentionally preserved for later P10.1C recovery.
   */
  sameUidResidual: boolean;
}

/**
 * Proof of bounded canonical bytes, immutable member identity, and cross-file
 * closure only. It is not a publication or promotion receipt. P10.1C must
 * resolve accepted predecessors and validate checkpoint transitions before
 * changing any current reference. In particular, the optional snapshot
 * sourceSnapshotDigest/bodyContextDigest/discoveryProvenanceDigest values are
 * producer-attested audit provenance, not independently recomputable proof,
 * and P10.1C must not use them for lifecycle validity or promotion.
 */
export interface VerifiedTaskMapRefreshRunBundle {
  bundleId: string;
  manifest: TaskMapRefreshRunManifestV1;
  commitMarker: TaskMapRefreshRunCommitV1;
  plan: TaskMapRefreshPlanV1;
  batch: TaskMapReadyBatchV1;
  checkpoints: TaskMapRefreshRunCheckpointsV1;
  sourceSnapshotProof?: TaskMapRefreshRunSourceSnapshotProofV1;
}

export type TaskMapRefreshRunBundleErrorCode =
  | "invalid_contract"
  | "invalid_root"
  | "unsafe_target"
  | "reservation_incomplete"
  | "bundle_corrupt"
  | "write_failed";

export class TaskMapRefreshRunBundleError extends Error {
  readonly code: TaskMapRefreshRunBundleErrorCode;
  readonly sameUidResidual: boolean;

  constructor(
    code: TaskMapRefreshRunBundleErrorCode,
    message: string,
    sameUidResidual = false,
  ) {
    super(message);
    this.name = "TaskMapRefreshRunBundleError";
    this.code = code;
    this.sameUidResidual = sameUidResidual;
  }
}

type JsonRecord = Record<string, unknown>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalBytes(value: unknown): string {
  return taskMapContractCanonicalJson(value);
}

function containsLocalPath(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1])) continue;
    const remainder = value.slice(index);
    if (
      remainder.startsWith("/")
      || remainder.startsWith("~/")
      || remainder.startsWith("~\\")
      || remainder.startsWith("./")
      || remainder.startsWith(".\\")
      || remainder.startsWith("../")
      || remainder.startsWith("..\\")
      || /^[A-Za-z]:[\\/]/.test(remainder)
      || remainder.startsWith("\\\\")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Defense in depth for known credential/path/email forms. Binding registry
 * construction remains the authority that connectionId/grantVersion are
 * identifiers rather than arbitrary caller-provided secret containers.
 */
function assertNoKnownSensitiveStringValues(
  value: unknown,
  label: string,
): void {
  if (typeof value === "string") {
    if (
      EMAIL_TEXT.test(value)
      || URI_SCHEME.test(value)
      || ENCODED_PATH.test(value)
      || containsLocalPath(value)
      || /(?:\$HOME|\$\{HOME\})[\\/]/.test(value)
      || COMMON_SECRET_TEXT.test(value)
      || /[\u0000-\u001f\u007f]/.test(value)
    ) {
      fail(
        "invalid_contract",
        `${label} contains a known sensitive string form`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoKnownSensitiveStringValues(item, label);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as JsonRecord)) {
      assertNoKnownSensitiveStringValues(item, label);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as JsonRecord)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function fail(
  code: TaskMapRefreshRunBundleErrorCode,
  message: string,
  sameUidResidual = false,
): never {
  throw new TaskMapRefreshRunBundleError(code, message, sameUidResidual);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is JsonRecord {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    fail("invalid_contract", `${label} must be a plain object`);
  }
}

function assertOnlyKeys(
  value: unknown,
  expected: ReadonlySet<string>,
  label: string,
): asserts value is JsonRecord {
  assertPlainObject(value, label);
  const keys = Object.keys(value);
  if (
    keys.length !== expected.size
    || keys.some((key) => !expected.has(key))
  ) {
    fail("invalid_contract", `${label} has unknown or missing fields`);
  }
}

function assertOptionalKeys(
  value: unknown,
  required: ReadonlySet<string>,
  optional: ReadonlySet<string>,
  label: string,
): asserts value is JsonRecord {
  assertPlainObject(value, label);
  const keys = Object.keys(value);
  if (
    [...required].some((key) => !keys.includes(key))
    || keys.some((key) => !required.has(key) && !optional.has(key))
  ) {
    fail("invalid_contract", `${label} has unknown or missing fields`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("invalid_contract", `${label} must be a full SHA-256 digest`);
  }
}

function assertSafeText(
  value: unknown,
  label: string,
  maxBytes = 1024,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > maxBytes
  ) {
    fail("invalid_contract", `${label} must be bounded text`);
  }
}

function assertInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    fail("invalid_contract", `${label} is outside its integer bound`);
  }
}

function assertPrivacy(value: unknown): asserts value is typeof BUNDLE_PRIVACY {
  assertOnlyKeys(value, PRIVACY_KEYS, "bundle privacy");
  if (
    taskMapContractCanonicalJson(value)
    !== taskMapContractCanonicalJson(BUNDLE_PRIVACY)
  ) {
    fail("invalid_contract", "bundle privacy contract is invalid");
  }
}

function assertBoundedJsonData(value: unknown, label: string): void {
  let bytes = 0;
  let nodes = 0;
  const visiting = new WeakSet<object>();
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxJsonNodes) {
      fail("invalid_contract", `${label} exceeds its JSON node bound`);
    }
    if (depth > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxJsonDepth) {
      fail("invalid_contract", `${label} exceeds its JSON depth bound`);
    }
    if (typeof item === "string") {
      bytes += Buffer.byteLength(item, "utf8");
    } else if (
      item === null
      || typeof item === "boolean"
      || (
        typeof item === "number"
        && Number.isFinite(item)
      )
    ) {
      bytes += 32;
    } else {
      if (typeof item !== "object") {
        fail("invalid_contract", `${label} must contain JSON data`);
      }
      if (visiting.has(item)) {
        fail("invalid_contract", `${label} cannot contain cycles`);
      }
      visiting.add(item);
      const isArray = Array.isArray(item);
      const prototype = Object.getPrototypeOf(item);
      if (
        (isArray && prototype !== Array.prototype)
        || (!isArray
          && prototype !== Object.prototype
          && prototype !== null)
      ) {
        fail("invalid_contract", `${label} must contain plain JSON data`);
      }
      let enumerableOwnKeys = 0;
      for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        enumerableOwnKeys += 1;
        if (
          enumerableOwnKeys
          > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxObjectKeys
        ) {
          fail("invalid_contract", `${label} exceeds its object-key bound`);
        }
      }
      const ownKeys = Reflect.ownKeys(item);
      if (
        ownKeys.length
        > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxObjectKeys
        + (isArray ? 1 : 0)
      ) {
        fail("invalid_contract", `${label} exceeds its object-key bound`);
      }
      let arrayEntries = 0;
      for (const key of ownKeys) {
        if (typeof key !== "string") {
          fail("invalid_contract", `${label} cannot contain symbol keys`);
        }
        if (isArray && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (
          !descriptor
          || !("value" in descriptor)
          || !descriptor.enumerable
        ) {
          fail(
            "invalid_contract",
            `${label} cannot contain hidden or accessor fields`,
          );
        }
        if (isArray) {
          if (
            !/^(?:0|[1-9][0-9]*)$/.test(key)
            || Number(key) >= item.length
          ) {
            fail("invalid_contract", `${label} arrays cannot carry fields`);
          }
          arrayEntries += 1;
        }
        bytes += Buffer.byteLength(key, "utf8");
        visit(descriptor.value, depth + 1);
      }
      if (isArray && arrayEntries !== item.length) {
        fail("invalid_contract", `${label} arrays cannot contain holes`);
      }
      visiting.delete(item);
    }
    if (bytes > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxTotalBytes) {
      fail("invalid_contract", `${label} exceeds its aggregate byte bound`);
    }
  };
  visit(value, 0);
}

function snapshotBoundedJson<T>(value: T, label: string): T {
  assertBoundedJsonData(value, label);
  try {
    return structuredClone(value);
  } catch {
    return fail(
      "invalid_contract",
      `${label} cannot be snapshotted as plain JSON data`,
    );
  }
}

export function assertTaskMapRefreshRunBundleByteLimits(
  byteLengths: readonly number[],
): void {
  if (
    !Array.isArray(byteLengths)
    || byteLengths.length === 0
    || byteLengths.length > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxFiles
  ) {
    fail("invalid_contract", "bundle file count is outside its bound");
  }
  let total = 0;
  for (const byteLength of byteLengths) {
    assertInteger(
      byteLength,
      "bundle member byte length",
      0,
      TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes,
    );
    total += byteLength;
    if (total > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxTotalBytes) {
      fail("invalid_contract", "bundle aggregate bytes exceed the total bound");
    }
  }
}

function bindingDigestFor(
  binding: TaskMapConnectorCheckpointV1["binding"],
): string {
  return taskMapContractDigest(binding);
}

function checkpointRecord(
  checkpoint: TaskMapConnectorCheckpointV1,
): TaskMapRefreshRunCheckpointRecordV1 {
  assertNoKnownSensitiveStringValues(
    checkpoint,
    "connector checkpoint",
  );
  return {
    checkpointDigest: taskMapContractDigest(checkpoint),
    bindingDigest: bindingDigestFor(checkpoint.binding),
    checkpoint,
  };
}

const SOURCE_REVISION_KEYS = new Set([
  "bindingDigest",
  "sourceIdentityDigest",
  "sourceRevisionDigest",
  "contentDigest",
]);
const SOURCE_SLICE_DRAFT_REQUIRED_KEYS = new Set([
  "ownerScopeDigest",
  "bindingDigest",
  "sourceRevisions",
  "acceptedSourceIdentityDigests",
]);
const SOURCE_SLICE_PROOF_KEYS = new Set([
  "contractVersion",
  "sourceSliceDigest",
  "sliceRole",
  "ownerScopeDigest",
  "bindingDigest",
  "sourceRevisions",
  "sourceRevisionSetDigest",
  "acceptedSourceIdentityDigests",
]);

function normalizeSourceSliceRevisions(
  value: unknown,
  bindingDigest: string,
): TaskMapRefreshSourceRevisionV1[] {
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "source-slice revisions must be bounded");
  }
  const byIdentity = new Map<string, TaskMapRefreshSourceRevisionV1>();
  for (const item of value) {
    assertOnlyKeys(item, SOURCE_REVISION_KEYS, "source-slice revision");
    const revision = item as unknown as TaskMapRefreshSourceRevisionV1;
    for (const [label, digest] of [
      ["bindingDigest", revision.bindingDigest],
      ["sourceIdentityDigest", revision.sourceIdentityDigest],
      ["sourceRevisionDigest", revision.sourceRevisionDigest],
      ["contentDigest", revision.contentDigest],
    ] as const) {
      assertDigest(digest, `source-slice ${label}`);
    }
    if (revision.bindingDigest !== bindingDigest) {
      fail("invalid_contract", "source-slice revision crosses a binding");
    }
    const prior = byIdentity.get(revision.sourceIdentityDigest);
    if (prior) {
      fail("invalid_contract", "source-slice revisions repeat an identity");
    }
    byIdentity.set(revision.sourceIdentityDigest, {
      bindingDigest: revision.bindingDigest,
      sourceIdentityDigest: revision.sourceIdentityDigest,
      sourceRevisionDigest: revision.sourceRevisionDigest,
      contentDigest: revision.contentDigest,
    });
  }
  return [...byIdentity.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
    || compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
    || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
    || compareText(left.contentDigest, right.contentDigest)
  ));
}

function sourceRevisionSetDigestFor(
  revisions: readonly TaskMapRefreshSourceRevisionV1[],
): string {
  return taskMapContractDigest(revisions.map((revision) => ({
    sourceIdentityDigest: revision.sourceIdentityDigest,
    sourceRevisionDigest: revision.sourceRevisionDigest,
    contentDigest: revision.contentDigest,
  })));
}

function buildSourceSliceProofFromSnapshot(
  draft: TaskMapRefreshRunSourceSliceProofDraftV1,
): TaskMapRefreshRunSourceSliceProofV1 {
  assertOptionalKeys(
    draft,
    SOURCE_SLICE_DRAFT_REQUIRED_KEYS,
    new Set(["sliceRole"]),
    "source-slice proof draft",
  );
  const sliceRole = draft.sliceRole ?? "serving";
  if (
    sliceRole !== "serving"
    && sliceRole !== "observed_non_serving"
  ) {
    fail("invalid_contract", "source-slice role is unsupported");
  }
  assertDigest(draft.ownerScopeDigest, "source-slice ownerScopeDigest");
  assertDigest(draft.bindingDigest, "source-slice bindingDigest");
  const sourceRevisions = normalizeSourceSliceRevisions(
    draft.sourceRevisions,
    draft.bindingDigest,
  );
  if (
    !Array.isArray(draft.acceptedSourceIdentityDigests)
    || draft.acceptedSourceIdentityDigests.length
      > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "source-slice accepted identities must be bounded");
  }
  const acceptedSourceIdentityDigests = [
    ...new Set(draft.acceptedSourceIdentityDigests),
  ].sort(compareText);
  if (
    acceptedSourceIdentityDigests.length
    !== draft.acceptedSourceIdentityDigests.length
  ) {
    fail("invalid_contract", "source-slice accepted identities repeat");
  }
  for (const digest of acceptedSourceIdentityDigests) {
    assertDigest(digest, "source-slice accepted source identity");
  }
  const revisionIdentityDigests = sourceRevisions
    .map((revision) => revision.sourceIdentityDigest)
    .sort(compareText);
  if (
    sliceRole === "serving"
    &&
    taskMapContractCanonicalJson(acceptedSourceIdentityDigests)
    !== taskMapContractCanonicalJson(revisionIdentityDigests)
  ) {
    fail(
      "invalid_contract",
      "source-slice accepted identities do not match its revisions",
    );
  }
  const sourceRevisionSetDigest =
    sourceRevisionSetDigestFor(sourceRevisions);
  const core = {
    contractVersion: TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION,
    sliceRole,
    ownerScopeDigest: draft.ownerScopeDigest,
    bindingDigest: draft.bindingDigest,
    sourceRevisions,
    sourceRevisionSetDigest,
    acceptedSourceIdentityDigests,
  };
  return deepFreeze({
    contractVersion: TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION,
    sourceSliceDigest: taskMapContractDigest(core),
    sliceRole,
    ownerScopeDigest: draft.ownerScopeDigest,
    bindingDigest: draft.bindingDigest,
    sourceRevisions,
    sourceRevisionSetDigest,
    acceptedSourceIdentityDigests,
  });
}

export function buildTaskMapRefreshRunSourceSliceProof(
  untrustedDraft: TaskMapRefreshRunSourceSliceProofDraftV1,
): TaskMapRefreshRunSourceSliceProofV1 {
  return buildSourceSliceProofFromSnapshot(
    snapshotBoundedJson(untrustedDraft, "source-slice proof draft"),
  );
}

export function assertTaskMapRefreshRunSourceSliceProof(
  untrustedProof: TaskMapRefreshRunSourceSliceProofV1,
): TaskMapRefreshRunSourceSliceProofV1 {
  const proof = snapshotBoundedJson(
    untrustedProof,
    "source-slice proof",
  );
  assertOnlyKeys(proof, SOURCE_SLICE_PROOF_KEYS, "source-slice proof");
  if (
    proof.contractVersion
    !== TASKMAP_REFRESH_RUN_SOURCE_SLICE_PROOF_VERSION
  ) {
    fail("invalid_contract", "source-slice proof version is unsupported");
  }
  const rebuilt = buildSourceSliceProofFromSnapshot({
    sliceRole: proof.sliceRole,
    ownerScopeDigest: proof.ownerScopeDigest,
    bindingDigest: proof.bindingDigest,
    sourceRevisions: proof.sourceRevisions,
    acceptedSourceIdentityDigests:
      proof.acceptedSourceIdentityDigests,
  });
  if (
    taskMapContractCanonicalJson(rebuilt)
    !== taskMapContractCanonicalJson(proof)
  ) {
    fail("invalid_contract", "source-slice proof derived fields are invalid");
  }
  return rebuilt;
}

function retainedLaneReferencesFor(
  batch: TaskMapReadyBatchV1,
): TaskMapRefreshRunLaneReferenceV1[] {
  return batch.laneStates
    .filter((state) => state.lastGoodCheckpointDigest !== undefined)
    .map((state) => ({
      laneId: state.laneId,
      referenceKind: "retained_last_good" as const,
      checkpointDigest: state.lastGoodCheckpointDigest!,
      sourceSliceDigest: state.lastGoodSourceSliceDigest!,
    }))
    .sort(compareLaneReferences);
}

function compareLaneReferences(
  left: TaskMapRefreshRunLaneReferenceV1,
  right: TaskMapRefreshRunLaneReferenceV1,
): number {
  return compareText(left.laneId, right.laneId)
    || compareText(left.referenceKind, right.referenceKind)
    || compareText(left.checkpointDigest, right.checkpointDigest)
    || compareText(left.sourceSliceDigest, right.sourceSliceDigest);
}

function normalizeAttemptOutputs(
  value: readonly TaskMapRefreshRunAttemptOutputV1[],
): TaskMapRefreshRunLaneReferenceV1[] {
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "attempt outputs must be a bounded array");
  }
  const byLane = new Set<string>();
  const rows = value.map((item) => {
    assertOnlyKeys(
      item,
      new Set(["laneId", "checkpointDigest", "sourceSliceDigest"]),
      "refresh-run attempt output",
    );
    assertSafeText(item.laneId, "attempt output laneId");
    assertDigest(item.checkpointDigest, "attempt checkpointDigest");
    assertDigest(item.sourceSliceDigest, "attempt sourceSliceDigest");
    if (byLane.has(item.laneId)) {
      fail("invalid_contract", "attempt outputs repeat a lane");
    }
    byLane.add(item.laneId);
    return {
      laneId: item.laneId,
      referenceKind: "attempt_output" as const,
      checkpointDigest: item.checkpointDigest,
      sourceSliceDigest: item.sourceSliceDigest,
    };
  });
  return rows.sort(compareLaneReferences);
}

function assertSortedUniqueStrings(
  value: unknown,
  label: string,
  maxItems: number =
    TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail("invalid_contract", `${label} must be a bounded array`);
  }
  let prior: string | undefined;
  for (const item of value) {
    assertSafeText(item, `${label} item`);
    if (prior !== undefined && compareText(prior, item) >= 0) {
      fail("invalid_contract", `${label} must be unique and sorted`);
    }
    prior = item;
  }
}

function assertCheckpointReferenceClosure(
  plan: TaskMapRefreshPlanV1,
  batch: TaskMapReadyBatchV1,
  records: readonly TaskMapRefreshRunCheckpointRecordV1[],
  sourceSlices: readonly TaskMapRefreshRunSourceSliceProofV1[],
  laneReferences: readonly TaskMapRefreshRunLaneReferenceV1[],
): void {
  const recordDigests = records
    .map((record) => record.checkpointDigest)
    .sort(compareText);
  const referencedDigests = [...new Set(
    laneReferences.map((reference) => reference.checkpointDigest),
  )].sort(compareText);
  if (
    taskMapContractCanonicalJson(recordDigests)
    !== taskMapContractCanonicalJson(referencedDigests)
  ) {
    fail(
      "invalid_contract",
      "checkpoint artifacts must exactly resolve referenced digests",
    );
  }
  const sourceSliceDigests = sourceSlices
    .map((proof) => proof.sourceSliceDigest)
    .sort(compareText);
  const referencedSourceSliceDigests = [...new Set(
    laneReferences.map((reference) => reference.sourceSliceDigest),
  )].sort(compareText);
  if (
    taskMapContractCanonicalJson(sourceSliceDigests)
    !== taskMapContractCanonicalJson(referencedSourceSliceDigests)
  ) {
    fail(
      "invalid_contract",
      "source-slice proofs must exactly resolve referenced outputs",
    );
  }
  const recordsByDigest = new Map(
    records.map((record) => [record.checkpointDigest, record]),
  );
  const sourceSlicesByDigest = new Map(
    sourceSlices.map((proof) => [proof.sourceSliceDigest, proof]),
  );
  const lanesById = new Map(plan.lanes.map((lane) => [lane.laneId, lane]));
  const statesByLaneId = new Map(
    batch.laneStates.map((state) => [state.laneId, state]),
  );
  const retainedReferences = laneReferences.filter((reference) => (
    reference.referenceKind === "retained_last_good"
  ));
  const expectedRetainedReferences = retainedLaneReferencesFor(batch);
  if (
    taskMapContractCanonicalJson(retainedReferences)
    !== taskMapContractCanonicalJson(expectedRetainedReferences)
  ) {
    fail("invalid_contract", "retained-last-good references do not match batch");
  }
  for (const reference of laneReferences) {
    const lane = lanesById.get(reference.laneId);
    const state = statesByLaneId.get(reference.laneId);
    const record = recordsByDigest.get(reference.checkpointDigest);
    const sourceSlice = sourceSlicesByDigest.get(
      reference.sourceSliceDigest,
    );
    if (!lane || !state || !record || !sourceSlice) {
      fail(
        "invalid_contract",
        "checkpoint or source-slice lane reference is unresolved",
      );
    }
    const matchingBindings = plan.sourceBindings.filter((binding) => (
      lane.inputDigests.includes(binding.bindingDigest)
    ));
    if (
      matchingBindings.length !== 1
      || record.bindingDigest !== matchingBindings[0].bindingDigest
      || sourceSlice.bindingDigest !== matchingBindings[0].bindingDigest
      || record.checkpoint.sourceKind !== matchingBindings[0].sourceKind
      || record.checkpoint.adapterVersion
        !== matchingBindings[0].adapterVersion
      || sourceSlice.ownerScopeDigest !== plan.ownerScopeDigest
      || taskMapContractCanonicalJson(
        record.checkpoint.acceptedSourceIdentityDigests,
      ) !== taskMapContractCanonicalJson(
        sourceSlice.acceptedSourceIdentityDigests,
      )
    ) {
      fail(
        "invalid_contract",
        "checkpoint lane reference is binding-inconsistent",
      );
    }
    if (reference.referenceKind === "retained_last_good") {
      const provider = plan.baseline.priorProviderArtifacts.find((artifact) => (
        artifact.checkpointDigest === reference.checkpointDigest
        && artifact.sourceSliceDigest === reference.sourceSliceDigest
        && artifact.bindingDigest === record.bindingDigest
      ));
      const expectedRevisions = plan.baseline.acceptedSourceRevisions
        .filter((revision) => (
          revision.bindingDigest === record.bindingDigest
        ));
      const expectedRevisionSet =
        plan.baseline.acceptedSourceRevisionSets.find((item) => (
          item.bindingDigest === record.bindingDigest
        ));
      if (
        !provider
        || !expectedRevisionSet
        || sourceSlice.sliceRole !== "serving"
        || taskMapContractCanonicalJson(sourceSlice.sourceRevisions)
          !== taskMapContractCanonicalJson(expectedRevisions)
        || sourceSlice.sourceRevisionSetDigest
          !== expectedRevisionSet.revisionSetDigest
      ) {
        fail(
          "invalid_contract",
          "retained-last-good source slice is absent or baseline-inconsistent",
        );
      }
      continue;
    }
    if (
      !lane.outputKinds.includes("connector_checkpoint")
      || !lane.outputKinds.includes("source_slice")
      || !["succeeded", "partial", "failed"].includes(state.status)
      || (
        (state.status === "succeeded"
          && record.checkpoint.state !== "success")
        || (state.status === "partial"
          && record.checkpoint.state !== "partial")
        || (state.status === "failed"
          && record.checkpoint.state !== "failed")
      )
    ) {
      fail(
        "invalid_contract",
        "attempt-output reference does not match terminal lane state",
      );
    }
    const succeeded = state.status === "succeeded";
    if (
      !succeeded
      && (
        record.checkpoint.error?.code !== state.errorCode
        || record.checkpoint.error?.detailDigest
          !== state.errorDetailDigest
      )
    ) {
      fail(
        "invalid_contract",
        "attempt-output checkpoint error does not match lane audit facts",
      );
    }
    const priorArtifact = plan.baseline.priorProviderArtifacts.find(
      (artifact) => artifact.bindingDigest === record.bindingDigest,
    );
    if (
      priorArtifact
      && reference.checkpointDigest === priorArtifact.checkpointDigest
    ) {
      fail(
        "invalid_contract",
        "attempt-output checkpoint must be new relative to its baseline",
      );
    }
    const hasRetainedLastGood =
      state.lastGoodCheckpointDigest !== undefined
      && state.lastGoodSourceSliceDigest !== undefined;
    if (!succeeded && hasRetainedLastGood) {
      const retainedReference = retainedReferences.find((retained) => (
        retained.laneId === reference.laneId
        && retained.checkpointDigest
          === state.lastGoodCheckpointDigest
        && retained.sourceSliceDigest
          === state.lastGoodSourceSliceDigest
      ));
      const retainedRecord = retainedReference === undefined
        ? undefined
        : recordsByDigest.get(retainedReference.checkpointDigest);
      if (
        reference.sourceSliceDigest !== state.lastGoodSourceSliceDigest
        || retainedReference === undefined
        || retainedRecord === undefined
      ) {
        fail(
          "invalid_contract",
          "partial or failed attempt must retain its exact last-good pair",
        );
      }
      const retainedCheckpoint = retainedRecord.checkpoint;
      const attemptCheckpoint = record.checkpoint;
      if (
        Date.parse(attemptCheckpoint.lastAttemptAt)
          < Date.parse(retainedCheckpoint.lastAttemptAt)
        || attemptCheckpoint.lastSuccessfulPollAt
          !== retainedCheckpoint.lastSuccessfulPollAt
        || taskMapContractCanonicalJson(attemptCheckpoint.watermark)
          !== taskMapContractCanonicalJson(retainedCheckpoint.watermark)
        || taskMapContractCanonicalJson(
          attemptCheckpoint.watermarkHistoryDigests,
        ) !== taskMapContractCanonicalJson(
          retainedCheckpoint.watermarkHistoryDigests,
        )
        || taskMapContractCanonicalJson(
          attemptCheckpoint.acceptedSourceIdentityDigests,
        ) !== taskMapContractCanonicalJson(
          retainedCheckpoint.acceptedSourceIdentityDigests,
        )
      ) {
        fail(
          "invalid_contract",
          "partial or failed attempt rolls back retained checkpoint state",
        );
      }
    } else if (
      !succeeded
      && (
        priorArtifact !== undefined
        || retainedReferences.some(
          (retained) => retained.laneId === reference.laneId,
        )
        || sourceSlice.sliceRole !== "observed_non_serving"
        || sourceSlice.sourceRevisions.length !== 0
        || sourceSlice.acceptedSourceIdentityDigests.length !== 0
        || record.checkpoint.watermark !== undefined
        || record.checkpoint.lastSuccessfulPollAt !== undefined
        || record.checkpoint.acceptedSourceIdentityDigests.length !== 0
      )
    ) {
      fail(
        "invalid_contract",
        "provider without prior state must remain non-serving and empty",
      );
    }
    const expectedRevisions = (
      succeeded
        ? plan.sourceRevisions
        : hasRetainedLastGood
          ? plan.baseline.acceptedSourceRevisions
          : []
    ).filter((revision) => (
      revision.bindingDigest === record.bindingDigest
    ));
    const expectedRevisionSet = (
      succeeded
        ? plan.sourceRevisionSets
        : hasRetainedLastGood
          ? plan.baseline.acceptedSourceRevisionSets
          : [{
              bindingDigest: record.bindingDigest,
              revisionSetDigest: sourceRevisionSetDigestFor([]),
            }]
    ).find((item) => (
      item.bindingDigest === record.bindingDigest
    ));
    if (
      !expectedRevisionSet
      || (
        succeeded
        && sourceSlice.sliceRole !== "serving"
      )
      || (
        !succeeded
        && hasRetainedLastGood
        && sourceSlice.sliceRole !== "serving"
      )
      || taskMapContractCanonicalJson(sourceSlice.sourceRevisions)
        !== taskMapContractCanonicalJson(expectedRevisions)
      || sourceSlice.sourceRevisionSetDigest
        !== expectedRevisionSet.revisionSetDigest
    ) {
      fail(
        "invalid_contract",
        "attempt-output source slice is not role-consistent",
      );
    }
  }
  const attemptReferences = laneReferences.filter((reference) => (
    reference.referenceKind === "attempt_output"
  ));
  const attemptedLaneIds = new Set(
    attemptReferences.map((reference) => reference.laneId),
  );
  for (const lane of plan.lanes) {
    if (
      !lane.outputKinds.includes("connector_checkpoint")
      || !lane.outputKinds.includes("source_slice")
    ) {
      continue;
    }
    const state = statesByLaneId.get(lane.laneId)!;
    const requiresAttempt =
      ["succeeded", "partial", "failed"].includes(state.status);
    if (attemptedLaneIds.has(lane.laneId) !== requiresAttempt) {
      fail(
        "invalid_contract",
        "terminal provider lane attempt-output closure is incomplete",
      );
    }
  }
}

function buildCheckpointSet(
  plan: TaskMapRefreshPlanV1,
  batch: TaskMapReadyBatchV1,
  checkpoints: readonly TaskMapConnectorCheckpointV1[],
  attemptOutputs: readonly TaskMapRefreshRunAttemptOutputV1[],
  sourceSliceProofs: readonly TaskMapRefreshRunSourceSliceProofV1[],
): TaskMapRefreshRunCheckpointsV1 {
  if (
    checkpoints.length
    > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "connector checkpoints exceed their count bound");
  }
  const records = checkpoints
    .map(checkpointRecord)
    .sort((left, right) => compareText(
      left.checkpoint.checkpointId,
      right.checkpoint.checkpointId,
    ));
  const ids = new Set<string>();
  const digests = new Set<string>();
  for (const record of records) {
    if (
      ids.has(record.checkpoint.checkpointId)
      || digests.has(record.checkpointDigest)
    ) {
      fail("invalid_contract", "connector checkpoints must be unique");
    }
    ids.add(record.checkpoint.checkpointId);
    digests.add(record.checkpointDigest);
  }
  if (
    !Array.isArray(sourceSliceProofs)
    || sourceSliceProofs.length
      > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "source-slice proofs must be bounded");
  }
  const sourceSlices = sourceSliceProofs
    .map(assertTaskMapRefreshRunSourceSliceProof)
    .sort((left, right) => (
      compareText(left.bindingDigest, right.bindingDigest)
      || compareText(left.sourceSliceDigest, right.sourceSliceDigest)
    ));
  const sourceSliceDigests = new Set<string>();
  for (const proof of sourceSlices) {
    if (sourceSliceDigests.has(proof.sourceSliceDigest)) {
      fail("invalid_contract", "source-slice proofs must be unique");
    }
    sourceSliceDigests.add(proof.sourceSliceDigest);
  }
  const checkpointDigests = records
    .map((record) => record.checkpointDigest)
    .sort(compareText);
  const laneReferences = [
    ...normalizeAttemptOutputs(attemptOutputs),
    ...retainedLaneReferencesFor(batch),
  ].sort(compareLaneReferences);
  for (let index = 1; index < laneReferences.length; index += 1) {
    const prior = laneReferences[index - 1];
    const current = laneReferences[index];
    if (
      prior.laneId === current.laneId
      && prior.referenceKind === current.referenceKind
    ) {
      fail("invalid_contract", "checkpoint lane references are duplicated");
    }
  }
  assertCheckpointReferenceClosure(
    plan,
    batch,
    records,
    sourceSlices,
    laneReferences,
  );
  const core = {
    contractVersion: TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION,
    ownerScopeDigest: plan.ownerScopeDigest,
    planId: plan.planId,
    batchId: batch.batchId,
    checkpoints: records,
    checkpointDigests,
    sourceSlices,
    laneReferences,
    privacy: BUNDLE_PRIVACY,
  };
  return deepFreeze({
    contractVersion: TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION,
    checkpointSetId:
      `tmrefreshcheckpoints_${taskMapContractDigest(core)}`,
    ownerScopeDigest: plan.ownerScopeDigest,
    planId: plan.planId,
    batchId: batch.batchId,
    checkpoints: records,
    checkpointDigests,
    sourceSlices,
    laneReferences,
    privacy: { ...BUNDLE_PRIVACY },
  });
}

function snapshotBindingProjection(
  snapshot: TaskMapSourceSnapshotV1,
): Array<{
  bindingDigest: string;
  sourceKind: TaskMapSourceKind;
  sourceContractVersion: TaskMapSourceSnapshotV1["envelopes"][number]["contractVersion"];
}> {
  const byDigest = new Map<string, {
    bindingDigest: string;
    sourceKind: TaskMapSourceKind;
    sourceContractVersion:
      TaskMapSourceSnapshotV1["envelopes"][number]["contractVersion"];
  }>();
  for (const envelope of snapshot.envelopes) {
    const bindingDigest = taskMapContractDigest(envelope.binding);
    const current = byDigest.get(bindingDigest);
    const value = {
      bindingDigest,
      sourceKind: envelope.sourceKind,
      sourceContractVersion: envelope.contractVersion,
    };
    if (
      current
      && taskMapContractCanonicalJson(current)
        !== taskMapContractCanonicalJson(value)
    ) {
      fail("invalid_contract", "snapshot binding digest is contradictory");
    }
    byDigest.set(bindingDigest, value);
  }
  return [...byDigest.values()].sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
  ));
}

function snapshotRevisionProjection(
  snapshot: TaskMapSourceSnapshotV1,
): TaskMapRefreshPlanV1["sourceRevisions"] {
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

function buildSourceSnapshotProof(
  plan: TaskMapRefreshPlanV1,
  snapshot: TaskMapSourceSnapshotV1,
): TaskMapRefreshRunSourceSnapshotProofV1 {
  if (snapshot.ownerScopeDigest !== plan.ownerScopeDigest) {
    fail("invalid_contract", "source snapshot owner does not match plan");
  }
  if (!plan.semanticInputDigests.includes(snapshot.semanticInputDigest)) {
    fail(
      "invalid_contract",
      "source snapshot semantic input is absent from plan",
    );
  }
  const bindingProjection = snapshotBindingProjection(snapshot);
  const plannedBindings = plan.sourceBindings.map((binding) => ({
    bindingDigest: binding.bindingDigest,
    sourceKind: binding.sourceKind,
    sourceContractVersion: binding.sourceContractVersion,
  })).sort((left, right) => compareText(
    left.bindingDigest,
    right.bindingDigest,
  ));
  if (
    taskMapContractCanonicalJson(bindingProjection)
    !== taskMapContractCanonicalJson(plannedBindings)
  ) {
    fail(
      "invalid_contract",
      "source snapshot binding proof is not exact for plan",
    );
  }
  const revisionProjection = snapshotRevisionProjection(snapshot);
  if (
    taskMapContractCanonicalJson(revisionProjection)
    !== taskMapContractCanonicalJson(plan.sourceRevisions)
  ) {
    fail(
      "invalid_contract",
      "source snapshot revision proof is not exact for plan",
    );
  }
  const core = {
    contractVersion: TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION,
    sourceContractVersion: snapshot.contractVersion,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    planId: plan.planId,
    snapshotId: snapshot.snapshotId,
    sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
    semanticInputDigest: snapshot.semanticInputDigest,
    bodyContextDigest: snapshot.bodyContextDigest,
    discoveryProvenanceDigest: snapshot.discoveryProvenanceDigest,
    sourceBindingProofDigest: taskMapContractDigest(bindingProjection),
    sourceRevisionProofDigest: taskMapContractDigest(revisionProjection),
    sourceRevisionSetProofDigest:
      taskMapContractDigest(plan.sourceRevisionSets),
    sourceBindingCount: bindingProjection.length,
    sourceRevisionCount: revisionProjection.length,
    privacy: BUNDLE_PRIVACY,
  };
  return deepFreeze({
    sourceSnapshotProofId:
      `tmrefreshsnapshotproof_${taskMapContractDigest(core)}`,
    ...core,
    privacy: { ...BUNDLE_PRIVACY },
  });
}

function memberDescriptor(
  fileName: TaskMapRefreshRunContentMemberName,
  kind: TaskMapRefreshRunMemberDescriptorV1["kind"],
  contractVersion: string,
  artifactId: string,
  artifact: unknown,
  bytes: string,
): TaskMapRefreshRunMemberDescriptorV1 {
  const byteLength = Buffer.byteLength(bytes, "utf8");
  assertTaskMapRefreshRunBundleByteLimits([byteLength]);
  return {
    fileName,
    kind,
    contractVersion,
    artifactId,
    canonicalArtifactDigest: taskMapContractDigest(artifact),
    byteSha256: sha256Bytes(bytes),
    byteLength,
  };
}

function manifestCore(
  manifest: Omit<
    TaskMapRefreshRunManifestV1,
    "bundleId" | "bundleContentDigest"
  >,
): Omit<
  TaskMapRefreshRunManifestV1,
  "bundleId" | "bundleContentDigest"
> {
  return manifest;
}

function makePreparedBundle(
  plan: TaskMapRefreshPlanV1,
  batch: TaskMapReadyBatchV1,
  checkpoints: TaskMapRefreshRunCheckpointsV1,
  sourceSnapshotProof?: TaskMapRefreshRunSourceSnapshotProofV1,
): PreparedTaskMapRefreshRunBundle {
  assertNoKnownSensitiveStringValues(
    {
      plan,
      batch,
      checkpoints,
      ...(sourceSnapshotProof === undefined
        ? {}
        : { sourceSnapshotProof }),
    },
    "refresh-run bundle",
  );
  const members: Partial<Record<
    TaskMapRefreshRunContentMemberName,
    string
  >> = {
    "plan.json": canonicalBytes(plan),
    "batch.json": canonicalBytes(batch),
    "checkpoints.json": canonicalBytes(checkpoints),
    ...(sourceSnapshotProof === undefined
      ? {}
      : { "source-snapshot.json": canonicalBytes(sourceSnapshotProof) }),
  };
  const descriptors: TaskMapRefreshRunMemberDescriptorV1[] = [
    memberDescriptor(
      "plan.json",
      "plan",
      plan.contractVersion,
      plan.planId,
      plan,
      members["plan.json"]!,
    ),
    memberDescriptor(
      "batch.json",
      "batch",
      batch.contractVersion,
      batch.batchId,
      batch,
      members["batch.json"]!,
    ),
    memberDescriptor(
      "checkpoints.json",
      "checkpoints",
      checkpoints.contractVersion,
      checkpoints.checkpointSetId,
      checkpoints,
      members["checkpoints.json"]!,
    ),
    ...(sourceSnapshotProof === undefined
      ? []
      : [memberDescriptor(
          "source-snapshot.json",
          "source_snapshot_proof",
          sourceSnapshotProof.contractVersion,
          sourceSnapshotProof.sourceSnapshotProofId,
          sourceSnapshotProof,
          members["source-snapshot.json"]!,
        )]),
  ];
  const core = manifestCore({
    contractVersion: TASKMAP_REFRESH_RUN_BUNDLE_VERSION,
    ownerScopeDigest: plan.ownerScopeDigest,
    planId: plan.planId,
    batchId: batch.batchId,
    candidateAcceptedStateDigest: plan.candidateAcceptedStateDigest,
    members: descriptors,
    privacy: BUNDLE_PRIVACY,
  });
  const bundleContentDigest = taskMapContractDigest(core);
  const bundleId = `tmrefreshrun_${bundleContentDigest}`;
  const manifest = deepFreeze({
    contractVersion: TASKMAP_REFRESH_RUN_BUNDLE_VERSION,
    bundleId,
    bundleContentDigest,
    ownerScopeDigest: plan.ownerScopeDigest,
    planId: plan.planId,
    batchId: batch.batchId,
    candidateAcceptedStateDigest: plan.candidateAcceptedStateDigest,
    members: descriptors,
    privacy: { ...BUNDLE_PRIVACY },
  });
  const manifestBytes = canonicalBytes(manifest);
  const commitMarker = deepFreeze({
    contractVersion: TASKMAP_REFRESH_RUN_COMMIT_VERSION,
    bundleId,
    manifestByteSha256: sha256Bytes(manifestBytes),
  });
  const committedBytes = canonicalBytes(commitMarker);
  assertTaskMapRefreshRunBundleByteLimits([
    ...Object.values(members).map((value) => (
      Buffer.byteLength(value!, "utf8")
    )),
    Buffer.byteLength(manifestBytes, "utf8"),
    Buffer.byteLength(committedBytes, "utf8"),
  ]);
  return deepFreeze({
    bundleId,
    manifest,
    commitMarker,
    members,
  });
}

export function prepareTaskMapRefreshRunBundle(
  input: PrepareTaskMapRefreshRunBundleInput,
): PreparedTaskMapRefreshRunBundle {
  const snapshot = snapshotBoundedJson(input, "refresh-run bundle input");
  assertOptionalKeys(
    snapshot,
    new Set([
      "plan",
      "batch",
      "connectorCheckpoints",
      "attemptOutputs",
      "sourceSliceProofs",
    ]),
    new Set(["sourceSnapshot"]),
    "refresh-run bundle input",
  );
  const plan = assertTaskMapRefreshPlan(snapshot.plan);
  const batch = assertTaskMapReadyBatch(plan, snapshot.batch);
  if (
    !Array.isArray(snapshot.connectorCheckpoints)
    || snapshot.connectorCheckpoints.length
      > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "connector checkpoints must be bounded");
  }
  const connectorCheckpoints = snapshot.connectorCheckpoints.map(
    (checkpoint) => assertTaskMapConnectorCheckpoint(checkpoint),
  );
  const checkpoints = buildCheckpointSet(
    plan,
    batch,
    connectorCheckpoints,
    snapshot.attemptOutputs,
    snapshot.sourceSliceProofs,
  );
  const sourceSnapshotProof = snapshot.sourceSnapshot === undefined
    ? undefined
    : buildSourceSnapshotProof(
        plan,
        assertTaskMapSourceSnapshot(snapshot.sourceSnapshot),
      );
  return makePreparedBundle(
    plan,
    batch,
    checkpoints,
    sourceSnapshotProof,
  );
}

const CHECKPOINT_SET_KEYS = new Set([
  "contractVersion",
  "checkpointSetId",
  "ownerScopeDigest",
  "planId",
  "batchId",
  "checkpoints",
  "checkpointDigests",
  "sourceSlices",
  "laneReferences",
  "privacy",
]);
const CHECKPOINT_RECORD_KEYS = new Set([
  "checkpointDigest",
  "bindingDigest",
  "checkpoint",
]);
const LANE_REFERENCE_KEYS = new Set([
  "laneId",
  "referenceKind",
  "checkpointDigest",
  "sourceSliceDigest",
]);

function assertCheckpointRecord(
  value: unknown,
): TaskMapRefreshRunCheckpointRecordV1 {
  assertOnlyKeys(
    value,
    CHECKPOINT_RECORD_KEYS,
    "refresh-run checkpoint record",
  );
  const record = value as unknown as TaskMapRefreshRunCheckpointRecordV1;
  assertDigest(record.checkpointDigest, "checkpointDigest");
  assertDigest(record.bindingDigest, "checkpoint bindingDigest");
  const checkpoint = assertTaskMapConnectorCheckpoint(record.checkpoint);
  assertNoKnownSensitiveStringValues(
    checkpoint,
    "connector checkpoint",
  );
  if (
    record.checkpointDigest !== taskMapContractDigest(checkpoint)
    || record.bindingDigest !== bindingDigestFor(checkpoint.binding)
  ) {
    fail("invalid_contract", "checkpoint record derived digests are invalid");
  }
  return deepFreeze({
    checkpointDigest: record.checkpointDigest,
    bindingDigest: record.bindingDigest,
    checkpoint,
  });
}

function assertCheckpointSetArtifact(
  plan: TaskMapRefreshPlanV1,
  batch: TaskMapReadyBatchV1,
  value: unknown,
): TaskMapRefreshRunCheckpointsV1 {
  assertOnlyKeys(value, CHECKPOINT_SET_KEYS, "refresh-run checkpoints");
  const artifact = value as unknown as TaskMapRefreshRunCheckpointsV1;
  if (
    artifact.contractVersion
    !== TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION
  ) {
    fail("invalid_contract", "checkpoint-set version is unsupported");
  }
  if (
    artifact.ownerScopeDigest !== plan.ownerScopeDigest
    || artifact.planId !== plan.planId
    || artifact.batchId !== batch.batchId
  ) {
    fail("invalid_contract", "checkpoint-set plan binding is invalid");
  }
  if (
    !Array.isArray(artifact.checkpoints)
    || artifact.checkpoints.length
      > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "checkpoint records must be bounded");
  }
  const records = artifact.checkpoints.map(assertCheckpointRecord);
  if (
    taskMapContractCanonicalJson(records)
    !== taskMapContractCanonicalJson(artifact.checkpoints)
  ) {
    fail("invalid_contract", "checkpoint records are not canonical");
  }
  let priorId: string | undefined;
  const recordDigests = new Set<string>();
  for (const record of records) {
    if (
      priorId !== undefined
      && compareText(priorId, record.checkpoint.checkpointId) >= 0
    ) {
      fail("invalid_contract", "checkpoint records must be unique and sorted");
    }
    if (recordDigests.has(record.checkpointDigest)) {
      fail("invalid_contract", "checkpoint digests must be unique");
    }
    priorId = record.checkpoint.checkpointId;
    recordDigests.add(record.checkpointDigest);
  }
  assertSortedUniqueStrings(
    artifact.checkpointDigests,
    "checkpoint digests",
  );
  for (const digest of artifact.checkpointDigests) {
    assertDigest(digest, "checkpoint digest");
  }
  const expectedDigests = records
    .map((record) => record.checkpointDigest)
    .sort(compareText);
  if (
    taskMapContractCanonicalJson(artifact.checkpointDigests)
    !== taskMapContractCanonicalJson(expectedDigests)
  ) {
    fail("invalid_contract", "checkpoint digest index is invalid");
  }
  if (
    !Array.isArray(artifact.sourceSlices)
    || artifact.sourceSlices.length
      > TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints
  ) {
    fail("invalid_contract", "source-slice proofs must be bounded");
  }
  const sourceSlices = artifact.sourceSlices
    .map(assertTaskMapRefreshRunSourceSliceProof);
  if (
    taskMapContractCanonicalJson(sourceSlices)
    !== taskMapContractCanonicalJson(artifact.sourceSlices)
  ) {
    fail("invalid_contract", "source-slice proofs are not canonical");
  }
  let priorSourceSlice:
    TaskMapRefreshRunSourceSliceProofV1 | undefined;
  for (const proof of sourceSlices) {
    if (
      priorSourceSlice !== undefined
      && (
        compareText(
          priorSourceSlice.bindingDigest,
          proof.bindingDigest,
        )
        || compareText(
          priorSourceSlice.sourceSliceDigest,
          proof.sourceSliceDigest,
        )
      ) >= 0
    ) {
      fail("invalid_contract", "source-slice proofs must be unique and sorted");
    }
    priorSourceSlice = proof;
  }
  if (
    !Array.isArray(artifact.laneReferences)
    || artifact.laneReferences.length
      > Math.min(
        TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints,
        plan.lanes.length * 2,
      )
  ) {
    fail("invalid_contract", "lane references must be bounded");
  }
  const laneReferences = artifact.laneReferences.map((reference) => {
    assertOnlyKeys(
      reference,
      LANE_REFERENCE_KEYS,
      "checkpoint lane reference",
    );
    const row = reference as unknown as TaskMapRefreshRunLaneReferenceV1;
    assertSafeText(row.laneId, "lane reference laneId");
    if (
      row.referenceKind !== "attempt_output"
      && row.referenceKind !== "retained_last_good"
    ) {
      fail("invalid_contract", "lane reference kind is unsupported");
    }
    assertDigest(row.checkpointDigest, "lane checkpointDigest");
    assertDigest(row.sourceSliceDigest, "lane sourceSliceDigest");
    return row;
  });
  let priorReference: TaskMapRefreshRunLaneReferenceV1 | undefined;
  const referenceRoleByLane = new Set<string>();
  for (const reference of laneReferences) {
    if (
      priorReference !== undefined
      && compareLaneReferences(priorReference, reference) >= 0
    ) {
      fail("invalid_contract", "lane references must be unique and sorted");
    }
    const roleKey = `${reference.laneId}\u0000${reference.referenceKind}`;
    if (referenceRoleByLane.has(roleKey)) {
      fail(
        "invalid_contract",
        "checkpoint lane reference roles must be unique per lane",
      );
    }
    referenceRoleByLane.add(roleKey);
    priorReference = reference;
  }
  assertPrivacy(artifact.privacy);
  assertCheckpointReferenceClosure(
    plan,
    batch,
    records,
    sourceSlices,
    laneReferences,
  );
  const core = {
    contractVersion: artifact.contractVersion,
    ownerScopeDigest: artifact.ownerScopeDigest,
    planId: artifact.planId,
    batchId: artifact.batchId,
    checkpoints: records,
    checkpointDigests: artifact.checkpointDigests,
    sourceSlices,
    laneReferences,
    privacy: artifact.privacy,
  };
  const expectedId = `tmrefreshcheckpoints_${taskMapContractDigest(core)}`;
  if (
    !CHECKPOINT_SET_ID.test(artifact.checkpointSetId)
    || artifact.checkpointSetId !== expectedId
  ) {
    fail("invalid_contract", "checkpoint-set identity is invalid");
  }
  return deepFreeze({
    contractVersion: TASKMAP_REFRESH_RUN_CHECKPOINTS_VERSION,
    checkpointSetId: artifact.checkpointSetId,
    ownerScopeDigest: artifact.ownerScopeDigest,
    planId: artifact.planId,
    batchId: artifact.batchId,
    checkpoints: records,
    checkpointDigests: [...artifact.checkpointDigests],
    sourceSlices,
    laneReferences,
    privacy: { ...BUNDLE_PRIVACY },
  });
}

const SNAPSHOT_PROOF_KEYS = new Set([
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
]);

function assertSourceSnapshotProofArtifact(
  plan: TaskMapRefreshPlanV1,
  value: unknown,
): TaskMapRefreshRunSourceSnapshotProofV1 {
  assertOnlyKeys(
    value,
    SNAPSHOT_PROOF_KEYS,
    "refresh-run source-snapshot proof",
  );
  const proof = value as unknown as TaskMapRefreshRunSourceSnapshotProofV1;
  if (
    proof.contractVersion
      !== TASKMAP_REFRESH_RUN_SOURCE_SNAPSHOT_PROOF_VERSION
    || proof.sourceContractVersion !== "taskmap-source-snapshot.v1"
  ) {
    fail("invalid_contract", "source-snapshot proof version is unsupported");
  }
  if (
    proof.ownerScopeDigest !== plan.ownerScopeDigest
    || proof.planId !== plan.planId
    || !plan.semanticInputDigests.includes(proof.semanticInputDigest)
  ) {
    fail("invalid_contract", "source-snapshot proof plan binding is invalid");
  }
  assertSafeText(proof.snapshotId, "source snapshotId");
  for (const [label, digest] of [
    ["sourceSnapshotDigest", proof.sourceSnapshotDigest],
    ["semanticInputDigest", proof.semanticInputDigest],
    ["bodyContextDigest", proof.bodyContextDigest],
    ["discoveryProvenanceDigest", proof.discoveryProvenanceDigest],
    ["sourceBindingProofDigest", proof.sourceBindingProofDigest],
    ["sourceRevisionProofDigest", proof.sourceRevisionProofDigest],
    ["sourceRevisionSetProofDigest", proof.sourceRevisionSetProofDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const expectedSnapshotId =
    `tmsnapshot_${
      taskMapContractDigest(proof.sourceSnapshotDigest).slice(0, 16)
    }`;
  if (proof.snapshotId !== expectedSnapshotId) {
    fail(
      "invalid_contract",
      "source-snapshot ID is not derived from its snapshot digest",
    );
  }
  assertInteger(
    proof.sourceBindingCount,
    "source binding count",
    1,
    TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints,
  );
  assertInteger(
    proof.sourceRevisionCount,
    "source revision count",
    1,
    TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxCheckpoints,
  );
  const plannedBindings = plan.sourceBindings.map((binding) => ({
    bindingDigest: binding.bindingDigest,
    sourceKind: binding.sourceKind,
    sourceContractVersion: binding.sourceContractVersion,
  })).sort((left, right) => compareText(
    left.bindingDigest,
    right.bindingDigest,
  ));
  if (
    proof.sourceBindingCount !== plannedBindings.length
    || proof.sourceRevisionCount !== plan.sourceRevisions.length
    || proof.sourceBindingProofDigest
      !== taskMapContractDigest(plannedBindings)
    || proof.sourceRevisionProofDigest
      !== taskMapContractDigest(plan.sourceRevisions)
    || proof.sourceRevisionSetProofDigest
      !== taskMapContractDigest(plan.sourceRevisionSets)
  ) {
    fail("invalid_contract", "source-snapshot digest proof is invalid");
  }
  assertPrivacy(proof.privacy);
  const { sourceSnapshotProofId: _proofId, ...core } = proof;
  const expectedId = `tmrefreshsnapshotproof_${taskMapContractDigest(core)}`;
  if (
    !SNAPSHOT_PROOF_ID.test(proof.sourceSnapshotProofId)
    || proof.sourceSnapshotProofId !== expectedId
  ) {
    fail("invalid_contract", "source-snapshot proof identity is invalid");
  }
  return deepFreeze(structuredClone(proof));
}

const MEMBER_DESCRIPTOR_KEYS = new Set([
  "fileName",
  "kind",
  "contractVersion",
  "artifactId",
  "canonicalArtifactDigest",
  "byteSha256",
  "byteLength",
]);
const MANIFEST_KEYS = new Set([
  "contractVersion",
  "bundleId",
  "bundleContentDigest",
  "ownerScopeDigest",
  "planId",
  "batchId",
  "candidateAcceptedStateDigest",
  "members",
  "privacy",
]);
const COMMIT_KEYS = new Set([
  "contractVersion",
  "bundleId",
  "manifestByteSha256",
]);

function assertMemberDescriptors(
  value: unknown,
): TaskMapRefreshRunMemberDescriptorV1[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
    fail("invalid_contract", "bundle manifest member list is invalid");
  }
  const descriptors = value.map((item) => {
    assertOnlyKeys(item, MEMBER_DESCRIPTOR_KEYS, "bundle member descriptor");
    const descriptor =
      item as unknown as TaskMapRefreshRunMemberDescriptorV1;
    if (!CONTENT_MEMBER_ORDER.includes(descriptor.fileName)) {
      fail("invalid_contract", "bundle member file name is invalid");
    }
    assertSafeText(descriptor.kind, "bundle member kind");
    assertSafeText(
      descriptor.contractVersion,
      "bundle member contractVersion",
    );
    assertSafeText(descriptor.artifactId, "bundle member artifactId");
    assertDigest(
      descriptor.canonicalArtifactDigest,
      "canonical artifact digest",
    );
    assertDigest(descriptor.byteSha256, "member byte SHA-256");
    assertInteger(
      descriptor.byteLength,
      "member byte length",
      1,
      TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes,
    );
    return descriptor;
  });
  const expectedNames = [
    "plan.json",
    "batch.json",
    "checkpoints.json",
    ...(descriptors.length === 4 ? ["source-snapshot.json"] : []),
  ];
  if (
    taskMapContractCanonicalJson(descriptors.map((row) => row.fileName))
    !== taskMapContractCanonicalJson(expectedNames)
  ) {
    fail("invalid_contract", "bundle manifest members are not closed or ordered");
  }
  return descriptors;
}

function assertManifestArtifact(
  value: unknown,
): TaskMapRefreshRunManifestV1 {
  assertOnlyKeys(value, MANIFEST_KEYS, "refresh-run manifest");
  const manifest = value as unknown as TaskMapRefreshRunManifestV1;
  if (manifest.contractVersion !== TASKMAP_REFRESH_RUN_BUNDLE_VERSION) {
    fail("invalid_contract", "refresh-run manifest version is unsupported");
  }
  if (!BUNDLE_ID.test(manifest.bundleId)) {
    fail("invalid_contract", "refresh-run bundleId is invalid");
  }
  for (const [label, digest] of [
    ["bundleContentDigest", manifest.bundleContentDigest],
    ["ownerScopeDigest", manifest.ownerScopeDigest],
    ["candidateAcceptedStateDigest", manifest.candidateAcceptedStateDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  assertSafeText(manifest.planId, "manifest planId");
  assertSafeText(manifest.batchId, "manifest batchId");
  manifest.members = assertMemberDescriptors(manifest.members);
  assertPrivacy(manifest.privacy);
  const {
    bundleId: _bundleId,
    bundleContentDigest: _bundleContentDigest,
    ...core
  } = manifest;
  const expectedDigest = taskMapContractDigest(core);
  if (
    manifest.bundleContentDigest !== expectedDigest
    || manifest.bundleId !== `tmrefreshrun_${expectedDigest}`
  ) {
    fail("invalid_contract", "refresh-run manifest identity is invalid");
  }
  return deepFreeze(structuredClone(manifest));
}

function assertCommitArtifact(
  value: unknown,
  manifest: TaskMapRefreshRunManifestV1,
  manifestBytes: string,
): TaskMapRefreshRunCommitV1 {
  assertOnlyKeys(value, COMMIT_KEYS, "refresh-run commit marker");
  const marker = value as unknown as TaskMapRefreshRunCommitV1;
  if (
    marker.contractVersion !== TASKMAP_REFRESH_RUN_COMMIT_VERSION
    || marker.bundleId !== manifest.bundleId
    || marker.manifestByteSha256 !== sha256Bytes(manifestBytes)
  ) {
    fail("invalid_contract", "refresh-run commit marker is invalid");
  }
  return deepFreeze(structuredClone(marker));
}

function parseCanonicalBytes(
  bytes: string,
  label: string,
): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    return fail("bundle_corrupt", `${label} is not valid JSON`);
  }
  assertBoundedJsonData(parsed, label);
  if (canonicalBytes(parsed) !== bytes) {
    fail("bundle_corrupt", `${label} bytes are not canonical`);
  }
  return parsed;
}

function expectedDescriptorsForArtifacts(
  plan: TaskMapRefreshPlanV1,
  batch: TaskMapReadyBatchV1,
  checkpoints: TaskMapRefreshRunCheckpointsV1,
  sourceSnapshotProof: TaskMapRefreshRunSourceSnapshotProofV1 | undefined,
  members: Readonly<Partial<Record<
    TaskMapRefreshRunContentMemberName,
    string
  >>>,
): TaskMapRefreshRunMemberDescriptorV1[] {
  return [
    memberDescriptor(
      "plan.json",
      "plan",
      plan.contractVersion,
      plan.planId,
      plan,
      members["plan.json"]!,
    ),
    memberDescriptor(
      "batch.json",
      "batch",
      batch.contractVersion,
      batch.batchId,
      batch,
      members["batch.json"]!,
    ),
    memberDescriptor(
      "checkpoints.json",
      "checkpoints",
      checkpoints.contractVersion,
      checkpoints.checkpointSetId,
      checkpoints,
      members["checkpoints.json"]!,
    ),
    ...(sourceSnapshotProof === undefined
      ? []
      : [memberDescriptor(
          "source-snapshot.json",
          "source_snapshot_proof",
          sourceSnapshotProof.contractVersion,
          sourceSnapshotProof.sourceSnapshotProofId,
          sourceSnapshotProof,
          members["source-snapshot.json"]!,
        )]),
  ];
}

function assertPreparedBundle(
  untrusted: PreparedTaskMapRefreshRunBundle,
): PreparedTaskMapRefreshRunBundle {
  const prepared = snapshotBoundedJson(
    untrusted,
    "prepared refresh-run bundle",
  );
  assertOnlyKeys(
    prepared,
    new Set(["bundleId", "manifest", "commitMarker", "members"]),
    "prepared refresh-run bundle",
  );
  assertPlainObject(prepared.members, "prepared bundle members");
  const memberNames = Object.keys(prepared.members);
  const allowedNames = [
    "plan.json",
    "batch.json",
    "checkpoints.json",
    ...(memberNames.includes("source-snapshot.json")
      ? ["source-snapshot.json"]
      : []),
  ];
  if (
    taskMapContractCanonicalJson(memberNames.sort(compareText))
    !== taskMapContractCanonicalJson([...allowedNames].sort(compareText))
  ) {
    fail("invalid_contract", "prepared bundle members are not closed");
  }
  const members = prepared.members as Partial<Record<
    TaskMapRefreshRunContentMemberName,
    string
  >>;
  for (const [name, bytes] of Object.entries(members)) {
    if (typeof bytes !== "string") {
      fail("invalid_contract", `prepared member ${name} must be bytes`);
    }
  }
  const plan = assertTaskMapRefreshPlan(
    parseCanonicalBytes(
      members["plan.json"]!,
      "plan.json",
    ) as TaskMapRefreshPlanV1,
  );
  const batch = assertTaskMapReadyBatch(
    plan,
    parseCanonicalBytes(
      members["batch.json"]!,
      "batch.json",
    ) as TaskMapReadyBatchV1,
  );
  const checkpoints = assertCheckpointSetArtifact(
    plan,
    batch,
    parseCanonicalBytes(
      members["checkpoints.json"]!,
      "checkpoints.json",
    ),
  );
  const sourceSnapshotProof = members["source-snapshot.json"] === undefined
    ? undefined
    : assertSourceSnapshotProofArtifact(
        plan,
        parseCanonicalBytes(
          members["source-snapshot.json"],
          "source-snapshot.json",
        ),
      );
  const manifest = assertManifestArtifact(prepared.manifest);
  const expectedDescriptors = expectedDescriptorsForArtifacts(
    plan,
    batch,
    checkpoints,
    sourceSnapshotProof,
    members,
  );
  if (
    manifest.bundleId !== prepared.bundleId
    || manifest.ownerScopeDigest !== plan.ownerScopeDigest
    || manifest.planId !== plan.planId
    || manifest.batchId !== batch.batchId
    || manifest.candidateAcceptedStateDigest
      !== plan.candidateAcceptedStateDigest
    || taskMapContractCanonicalJson(manifest.members)
      !== taskMapContractCanonicalJson(expectedDescriptors)
  ) {
    fail("invalid_contract", "prepared bundle cross-file identity is invalid");
  }
  const manifestBytes = canonicalBytes(manifest);
  const marker = assertCommitArtifact(
    prepared.commitMarker,
    manifest,
    manifestBytes,
  );
  assertTaskMapRefreshRunBundleByteLimits([
    ...Object.values(members).map((bytes) => (
      Buffer.byteLength(bytes!, "utf8")
    )),
    Buffer.byteLength(manifestBytes, "utf8"),
    Buffer.byteLength(canonicalBytes(marker), "utf8"),
  ]);
  return deepFreeze({
    bundleId: manifest.bundleId,
    manifest,
    commitMarker: marker,
    members,
  });
}

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    return fail("invalid_root", "owner UID verification is unavailable");
  }
  return process.getuid();
}

function modeBits(stats: Stats): number {
  return stats.mode & 0o7777;
}

function assertOwnerDirectoryStats(
  stats: Stats,
  label: string,
  code: TaskMapRefreshRunBundleErrorCode,
): void {
  if (
    !stats.isDirectory()
    || stats.isSymbolicLink()
    || stats.uid !== currentUid()
    || modeBits(stats) !== DIRECTORY_MODE
  ) {
    fail(code, `${label} must be a same-owner 0700 real directory`);
  }
}

function assertOwnerFileStats(
  stats: Stats,
  label: string,
  maximumBytes = TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes,
  minimumBytes = 1,
): void {
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || stats.uid !== currentUid()
    || modeBits(stats) !== FILE_MODE
    || stats.nlink !== 1
    || stats.size < minimumBytes
    || stats.size > maximumBytes
  ) {
    fail(
      "unsafe_target",
      `${label} must be a same-owner 0600 single-link regular file`,
    );
  }
}

function errnoCode(error: unknown): string | undefined {
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

interface CheckedOwnerDirectory {
  directory: string;
  stats: Stats;
}

async function assertTrustedRunRoot(
  runRoot: string,
): Promise<CheckedOwnerDirectory> {
  if (!path.isAbsolute(runRoot)) {
    return fail("invalid_root", "refresh-run root must be absolute");
  }
  const resolved = path.resolve(runRoot);
  let stats: Stats;
  let canonical: string;
  let handle: FileHandle | undefined;
  try {
    stats = await lstat(resolved);
    canonical = await realpath(resolved);
    handle = await open(
      resolved,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = await handle.stat();
    assertOwnerDirectoryStats(opened, "refresh-run root", "invalid_root");
    if (opened.dev !== stats.dev || opened.ino !== stats.ino) {
      return fail("invalid_root", "refresh-run root changed during validation");
    }
    stats = opened;
  } catch {
    return fail("invalid_root", "refresh-run root must already exist");
  } finally {
    await handle?.close().catch(() => undefined);
  }
  assertOwnerDirectoryStats(stats, "refresh-run root", "invalid_root");
  if (canonical !== resolved) {
    fail("invalid_root", "refresh-run root cannot traverse symbolic links");
  }
  return { directory: canonical, stats };
}

function bundlePathFor(runRoot: string, bundleId: string): string {
  if (!BUNDLE_ID.test(bundleId)) {
    return fail("invalid_contract", "bundleId is invalid");
  }
  const candidate = path.join(runRoot, bundleId);
  if (
    path.dirname(candidate) !== runRoot
    || path.relative(runRoot, candidate) !== bundleId
  ) {
    return fail("invalid_root", "bundle path escapes refresh-run root");
  }
  return candidate;
}

async function syncDirectory(
  directory: string,
  expected: Stats,
  label: string,
): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const stats = await handle.stat();
    assertOwnerDirectoryStats(stats, label, "write_failed");
    if (stats.dev !== expected.dev || stats.ino !== expected.ino) {
      fail("write_failed", `${label} changed before durability sync`);
    }
    await handle.sync();
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) throw error;
    fail("write_failed", `${label} durability sync failed`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function hardenDirectory(
  directory: string,
  label: string,
  code: TaskMapRefreshRunBundleErrorCode,
): Promise<{ handle: FileHandle; stats: Stats }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    await handle.chmod(DIRECTORY_MODE);
    const stats = await handle.stat();
    assertOwnerDirectoryStats(stats, label, code);
    return { handle, stats };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof TaskMapRefreshRunBundleError) throw error;
    return fail(code, `${label} cannot be hardened safely`);
  }
}

async function createStagingDirectory(
  runRoot: CheckedOwnerDirectory,
): Promise<CheckedOwnerDirectory> {
  let stagingDirectory: string;
  try {
    stagingDirectory = await mkdtemp(
      path.join(runRoot.directory, ".tmrefreshrun-stage-"),
    );
  } catch {
    return fail("write_failed", "sibling staging directory creation failed");
  }
  try {
    if (
      path.dirname(stagingDirectory) !== runRoot.directory
      || !/^\.tmrefreshrun-stage-[A-Za-z0-9]+$/
        .test(path.basename(stagingDirectory))
    ) {
      fail("write_failed", "sibling staging directory identity is invalid");
    }
    await chmod(stagingDirectory, DIRECTORY_MODE);
    const createdStats = await lstat(stagingDirectory);
    const hardened = await hardenDirectory(
      stagingDirectory,
      "sibling staging directory",
      "write_failed",
    );
    if (
      hardened.stats.dev !== createdStats.dev
      || hardened.stats.ino !== createdStats.ino
    ) {
      fail("write_failed", "sibling staging directory changed while hardening");
    }
    await hardened.handle.close().catch(() => undefined);
    let canonical: string;
    try {
      canonical = await realpath(stagingDirectory);
    } catch {
      return fail("write_failed", "sibling staging directory disappeared");
    }
    if (canonical !== stagingDirectory) {
      fail("write_failed", "sibling staging directory cannot be a symlink");
    }
    await syncDirectory(
      runRoot.directory,
      runRoot.stats,
      "refresh-run root",
    );
    return { directory: stagingDirectory, stats: hardened.stats };
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) {
      return fail(error.code, error.message, true);
    }
    return fail(
      "write_failed",
      "sibling staging directory hardening failed",
      true,
    );
  }
}

async function writeExclusiveFile(
  directory: string,
  fileName: string,
  text: string,
): Promise<void> {
  const bytes = Buffer.from(text, "utf8");
  assertTaskMapRefreshRunBundleByteLimits([bytes.length]);
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      path.join(directory, fileName),
      FS_CONSTANTS.O_RDWR
        | FS_CONSTANTS.O_CREAT
        | FS_CONSTANTS.O_EXCL
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
      FILE_MODE,
    );
    await handle.chmod(FILE_MODE);
    const initial = await handle.stat();
    assertOwnerFileStats(
      initial,
      `bundle member ${fileName}`,
      TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxMemberBytes,
      0,
    );
    let written = 0;
    while (written < bytes.length) {
      const result = await handle.write(
        bytes,
        written,
        bytes.length - written,
        written,
      );
      if (result.bytesWritten <= 0) {
        fail("write_failed", `bundle member ${fileName} write stalled`);
      }
      written += result.bytesWritten;
    }
    await handle.sync();
    const readback = Buffer.alloc(bytes.length);
    let read = 0;
    while (read < readback.length) {
      const result = await handle.read(
        readback,
        read,
        readback.length - read,
        read,
      );
      if (result.bytesRead <= 0) {
        fail("write_failed", `bundle member ${fileName} readback stalled`);
      }
      read += result.bytesRead;
    }
    const finalStats = await handle.stat();
    assertOwnerFileStats(finalStats, `bundle member ${fileName}`);
    if (
      finalStats.size !== bytes.length
      || !readback.equals(bytes)
      || sha256Bytes(readback) !== sha256Bytes(bytes)
    ) {
      fail("write_failed", `bundle member ${fileName} readback mismatched`);
    }
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) throw error;
    fail("write_failed", `bundle member ${fileName} exclusive write failed`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readOwnerFile(
  directory: string,
  fileName: string,
): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      path.join(directory, fileName),
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const before = await handle.stat();
    assertOwnerFileStats(before, `bundle member ${fileName}`);
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (result.bytesRead <= 0) {
        fail("bundle_corrupt", `bundle member ${fileName} read stalled`);
      }
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    assertOwnerFileStats(after, `bundle member ${fileName}`);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      fail("bundle_corrupt", `bundle member ${fileName} changed during read`);
    }
    const text = buffer.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(buffer)) {
      fail("bundle_corrupt", `bundle member ${fileName} is not strict UTF-8`);
    }
    return text;
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) throw error;
    return fail(
      "unsafe_target",
      `bundle member ${fileName} cannot be opened safely`,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertBundleDirectory(
  bundleDirectory: string,
  expectedBundleId?: string,
): Promise<{
  runRoot: string;
  bundleId: string;
  bundleDirectory: string;
  stats: Stats;
}> {
  const resolved = path.resolve(bundleDirectory);
  const bundleId = path.basename(resolved);
  if (
    !BUNDLE_ID.test(bundleId)
    || (expectedBundleId !== undefined && bundleId !== expectedBundleId)
  ) {
    return fail("unsafe_target", "bundle directory name is invalid");
  }
  const runRoot = await assertTrustedRunRoot(path.dirname(resolved));
  if (bundlePathFor(runRoot.directory, bundleId) !== resolved) {
    fail("unsafe_target", "bundle directory escapes refresh-run root");
  }
  let stats: Stats;
  let canonical: string;
  let handle: FileHandle | undefined;
  try {
    stats = await lstat(resolved);
    canonical = await realpath(resolved);
    handle = await open(
      resolved,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = await handle.stat();
    assertOwnerDirectoryStats(opened, "bundle directory", "unsafe_target");
    if (opened.dev !== stats.dev || opened.ino !== stats.ino) {
      return fail(
        "unsafe_target",
        "bundle directory changed during validation",
      );
    }
    stats = opened;
  } catch {
    return fail("unsafe_target", "bundle directory is unavailable");
  } finally {
    await handle?.close().catch(() => undefined);
  }
  assertOwnerDirectoryStats(stats, "bundle directory", "unsafe_target");
  if (canonical !== resolved) {
    fail("unsafe_target", "bundle directory cannot be a symbolic link");
  }
  return {
    runRoot: runRoot.directory,
    bundleId,
    bundleDirectory: resolved,
    stats,
  };
}

export async function verifyTaskMapRefreshRunBundle(
  bundleDirectory: string,
  expectedBundleId?: string,
): Promise<VerifiedTaskMapRefreshRunBundle> {
  const checked = await assertBundleDirectory(
    bundleDirectory,
    expectedBundleId,
  );
  let names: string[];
  try {
    names = (await readdir(checked.bundleDirectory)).sort(compareText);
  } catch {
    return fail("unsafe_target", "bundle directory cannot be listed");
  }
  if (
    names.some((name) => !CLOSED_FILE_NAMES.has(name))
    || [...REQUIRED_FILE_NAMES].some((name) => !names.includes(name))
    || names.length !== (names.includes("source-snapshot.json") ? 6 : 5)
  ) {
    fail("bundle_corrupt", "bundle file set is not closed and complete");
  }
  const manifestBytes = await readOwnerFile(
    checked.bundleDirectory,
    "manifest.json",
  );
  const manifest = assertManifestArtifact(
    parseCanonicalBytes(manifestBytes, "manifest.json"),
  );
  if (
    manifest.bundleId !== checked.bundleId
    || (
      manifest.members.some((member) => !names.includes(member.fileName))
    )
    || manifest.members.length !== (names.includes("source-snapshot.json")
      ? 4
      : 3)
  ) {
    fail("bundle_corrupt", "manifest does not match bundle directory");
  }
  const committedBytes = await readOwnerFile(
    checked.bundleDirectory,
    "COMMITTED",
  );
  const commitMarker = assertCommitArtifact(
    parseCanonicalBytes(committedBytes, "COMMITTED"),
    manifest,
    manifestBytes,
  );
  const members: Partial<Record<
    TaskMapRefreshRunContentMemberName,
    string
  >> = {};
  for (const descriptor of manifest.members) {
    members[descriptor.fileName] = await readOwnerFile(
      checked.bundleDirectory,
      descriptor.fileName,
    );
  }
  const plan = assertTaskMapRefreshPlan(
    parseCanonicalBytes(
      members["plan.json"]!,
      "plan.json",
    ) as TaskMapRefreshPlanV1,
  );
  const batch = assertTaskMapReadyBatch(
    plan,
    parseCanonicalBytes(
      members["batch.json"]!,
      "batch.json",
    ) as TaskMapReadyBatchV1,
  );
  const checkpoints = assertCheckpointSetArtifact(
    plan,
    batch,
    parseCanonicalBytes(
      members["checkpoints.json"]!,
      "checkpoints.json",
    ),
  );
  const sourceSnapshotProof = members["source-snapshot.json"] === undefined
    ? undefined
    : assertSourceSnapshotProofArtifact(
        plan,
        parseCanonicalBytes(
          members["source-snapshot.json"],
          "source-snapshot.json",
        ),
      );
  const expectedDescriptors = expectedDescriptorsForArtifacts(
    plan,
    batch,
    checkpoints,
    sourceSnapshotProof,
    members,
  );
  if (
    manifest.ownerScopeDigest !== plan.ownerScopeDigest
    || manifest.planId !== plan.planId
    || manifest.batchId !== batch.batchId
    || manifest.candidateAcceptedStateDigest
      !== plan.candidateAcceptedStateDigest
    || taskMapContractCanonicalJson(manifest.members)
      !== taskMapContractCanonicalJson(expectedDescriptors)
  ) {
    fail("bundle_corrupt", "bundle members fail cross-file consistency");
  }
  assertTaskMapRefreshRunBundleByteLimits([
    ...Object.values(members).map((bytes) => (
      Buffer.byteLength(bytes!, "utf8")
    )),
    Buffer.byteLength(manifestBytes, "utf8"),
    Buffer.byteLength(committedBytes, "utf8"),
  ]);
  let finalStats: Stats;
  let finalNames: string[];
  try {
    finalStats = await lstat(checked.bundleDirectory);
    assertOwnerDirectoryStats(
      finalStats,
      "bundle directory",
      "unsafe_target",
    );
    finalNames = (await readdir(checked.bundleDirectory)).sort(compareText);
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) throw error;
    return fail(
      "unsafe_target",
      "bundle directory changed before verification completed",
    );
  }
  if (
    finalStats.dev !== checked.stats.dev
    || finalStats.ino !== checked.stats.ino
    || taskMapContractCanonicalJson(finalNames)
      !== taskMapContractCanonicalJson(names)
  ) {
    fail(
      "bundle_corrupt",
      "bundle directory or closed member set changed during verification",
    );
  }
  return deepFreeze({
    bundleId: manifest.bundleId,
    manifest,
    commitMarker,
    plan,
    batch,
    checkpoints,
    ...(sourceSnapshotProof === undefined
      ? {}
      : { sourceSnapshotProof }),
  });
}

function expectedWriteOrder(
  prepared: PreparedTaskMapRefreshRunBundle,
): string[] {
  return [
    "plan.json",
    "batch.json",
    "checkpoints.json",
    ...(prepared.members["source-snapshot.json"] === undefined
      ? []
      : ["source-snapshot.json"]),
    "manifest.json",
    "COMMITTED",
  ];
}

function expectedBytes(
  prepared: PreparedTaskMapRefreshRunBundle,
  fileName: string,
): string {
  if (fileName === "manifest.json") return canonicalBytes(prepared.manifest);
  if (fileName === "COMMITTED") return canonicalBytes(prepared.commitMarker);
  const value = prepared.members[
    fileName as TaskMapRefreshRunContentMemberName
  ];
  if (value === undefined) {
    return fail("invalid_contract", "prepared bundle member is missing");
  }
  return value;
}

async function inspectIncompleteReservation(
  bundleDirectory: string,
  prepared: PreparedTaskMapRefreshRunBundle,
): Promise<"waiting" | "committed"> {
  let stats: Stats;
  try {
    stats = await lstat(bundleDirectory);
  } catch {
    return fail("unsafe_target", "existing bundle reservation is unavailable");
  }
  assertOwnerDirectoryStats(
    stats,
    "existing bundle reservation",
    "unsafe_target",
  );
  let names: string[];
  try {
    names = await readdir(bundleDirectory);
  } catch {
    return fail("unsafe_target", "existing bundle reservation cannot be listed");
  }
  if (names.includes("COMMITTED")) return "committed";
  const order = expectedWriteOrder(prepared).slice(0, -1);
  const present = new Set(names);
  const orderedNames = order.filter((name) => present.has(name));
  if (
    names.some((name) => !order.includes(name))
    || orderedNames.length !== names.length
    || orderedNames.some((name, index) => order[index] !== name)
  ) {
    fail("unsafe_target", "existing bundle reservation is not a valid prefix");
  }
  for (let index = 0; index < orderedNames.length; index += 1) {
    const name = orderedNames[index];
    let memberStats: Stats;
    try {
      memberStats = await lstat(path.join(bundleDirectory, name));
    } catch {
      return fail("unsafe_target", "reservation member cannot be inspected");
    }
    const expected = Buffer.from(expectedBytes(prepared, name), "utf8");
    if (
      !memberStats.isFile()
      || memberStats.isSymbolicLink()
      || memberStats.uid !== currentUid()
      || modeBits(memberStats) !== FILE_MODE
      || memberStats.nlink !== 1
      || memberStats.size > expected.length
    ) {
      fail("unsafe_target", "reservation member is unsafe or oversized");
    }
    const isTail = index === orderedNames.length - 1;
    if (!isTail || memberStats.size === expected.length) {
      const actual = await readOwnerFile(bundleDirectory, name);
      if (actual !== expected.toString("utf8")) {
        fail("unsafe_target", "reservation member content is invalid");
      }
    }
  }
  return "waiting";
}

async function awaitExistingBundle(
  runRoot: string,
  prepared: PreparedTaskMapRefreshRunBundle,
  options: TaskMapRefreshRunMaterializeOptions,
  sameUidResidual = false,
): Promise<TaskMapRefreshRunMaterializationResult> {
  const waitMs = options.reservationWaitMs ?? 3000;
  const pollMs = options.pollIntervalMs ?? 20;
  assertInteger(
    waitMs,
    "reservation wait",
    0,
    TASKMAP_REFRESH_RUN_BUNDLE_LIMITS_V1.maxReservationWaitMs,
  );
  assertInteger(pollMs, "reservation poll interval", 1, 1000);
  const bundleDirectory = bundlePathFor(runRoot, prepared.bundleId);
  const deadline = Date.now() + waitMs;
  for (;;) {
    const state = await inspectIncompleteReservation(
      bundleDirectory,
      prepared,
    );
    if (state === "committed") {
      const verified = await verifyTaskMapRefreshRunBundle(
        bundleDirectory,
        prepared.bundleId,
      );
      if (
        taskMapContractCanonicalJson(verified.manifest)
        !== taskMapContractCanonicalJson(prepared.manifest)
        || taskMapContractCanonicalJson(verified.commitMarker)
        !== taskMapContractCanonicalJson(prepared.commitMarker)
      ) {
        fail("bundle_corrupt", "existing bundle collides with prepared content");
      }
      return {
        status: "already_present",
        bundleId: prepared.bundleId,
        sameUidResidual,
      };
    }
    if (Date.now() >= deadline) {
      fail(
        "reservation_incomplete",
        "same-UID bundle reservation remains incomplete; it was preserved",
        true,
      );
    }
    await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())));
  }
}

async function injectFault(
  options: TaskMapRefreshRunMaterializeOptions,
  point: TaskMapRefreshRunFaultPoint,
): Promise<void> {
  await options.faultInjection?.(point);
}

export async function materializeTaskMapRefreshRunBundle(
  runRootInput: string,
  untrustedPrepared: PreparedTaskMapRefreshRunBundle,
  options: TaskMapRefreshRunMaterializeOptions = {},
): Promise<TaskMapRefreshRunMaterializationResult> {
  const prepared = assertPreparedBundle(untrustedPrepared);
  const checkedRunRoot = await assertTrustedRunRoot(runRootInput);
  const runRoot = checkedRunRoot.directory;
  const bundleDirectory = bundlePathFor(runRoot, prepared.bundleId);
  try {
    await lstat(bundleDirectory);
    return awaitExistingBundle(runRoot, prepared, options);
  } catch (error) {
    if (
      error instanceof TaskMapRefreshRunBundleError
      || errnoCode(error) !== "ENOENT"
    ) {
      throw error;
    }
  }
  const staging = await createStagingDirectory(checkedRunRoot);
  const stagingDirectory = staging.directory;
  let reservation: { handle: FileHandle; stats: Stats } | undefined;
  try {
    await writeExclusiveFile(
      stagingDirectory,
      "plan.json",
      prepared.members["plan.json"]!,
    );
    await injectFault(options, "after_plan");
    await writeExclusiveFile(
      stagingDirectory,
      "batch.json",
      prepared.members["batch.json"]!,
    );
    await injectFault(options, "after_batch");
    await writeExclusiveFile(
      stagingDirectory,
      "checkpoints.json",
      prepared.members["checkpoints.json"]!,
    );
    await injectFault(options, "after_checkpoints");
    if (prepared.members["source-snapshot.json"] !== undefined) {
      await writeExclusiveFile(
        stagingDirectory,
        "source-snapshot.json",
        prepared.members["source-snapshot.json"],
      );
      await injectFault(options, "after_source_snapshot");
    }
    await writeExclusiveFile(
      stagingDirectory,
      "manifest.json",
      canonicalBytes(prepared.manifest),
    );
    await injectFault(options, "after_manifest");
    await syncDirectory(
      stagingDirectory,
      staging.stats,
      "sibling staging directory",
    );
    await injectFault(options, "after_precommit_directory_sync");
    await writeExclusiveFile(
      stagingDirectory,
      "COMMITTED",
      canonicalBytes(prepared.commitMarker),
    );
    await injectFault(options, "after_committed");
    await syncDirectory(
      stagingDirectory,
      staging.stats,
      "sibling staging directory",
    );
    await injectFault(options, "after_final_directory_sync");
    try {
      await mkdir(bundleDirectory, { mode: DIRECTORY_MODE });
    } catch (error) {
      if (errnoCode(error) === "EEXIST") {
        return awaitExistingBundle(
          runRoot,
          prepared,
          options,
          true,
        );
      }
      throw error;
    }
    await chmod(bundleDirectory, DIRECTORY_MODE);
    const createdReservationStats = await lstat(bundleDirectory);
    reservation = await hardenDirectory(
      bundleDirectory,
      "new bundle reservation",
      "write_failed",
    );
    if (
      reservation.stats.dev !== createdReservationStats.dev
      || reservation.stats.ino !== createdReservationStats.ino
    ) {
      fail("unsafe_target", "new bundle reservation changed while hardening");
    }
    const reservationNames = await readdir(bundleDirectory);
    if (reservationNames.length !== 0) {
      fail("unsafe_target", "new bundle reservation is not empty");
    }
    await syncDirectory(
      runRoot,
      checkedRunRoot.stats,
      "refresh-run root",
    );
    await injectFault(options, "after_reservation");
    const beforeRename = await lstat(bundleDirectory);
    if (
      beforeRename.dev !== reservation.stats.dev
      || beforeRename.ino !== reservation.stats.ino
      || !beforeRename.isDirectory()
      || beforeRename.isSymbolicLink()
      || (await readdir(bundleDirectory)).length !== 0
    ) {
      fail("unsafe_target", "bundle reservation changed before publication");
    }
    await rename(stagingDirectory, bundleDirectory);
    await injectFault(options, "after_publish_rename");
    await syncDirectory(
      runRoot,
      checkedRunRoot.stats,
      "refresh-run root",
    );
    const verified = await verifyTaskMapRefreshRunBundle(
      bundleDirectory,
      prepared.bundleId,
    );
    if (
      taskMapContractCanonicalJson(verified.manifest)
      !== taskMapContractCanonicalJson(prepared.manifest)
    ) {
      fail("bundle_corrupt", "materialized bundle readback does not match");
    }
    return {
      status: "created",
      bundleId: prepared.bundleId,
      sameUidResidual: false,
    };
  } catch (error) {
    if (error instanceof TaskMapRefreshRunBundleError) {
      return fail(error.code, error.message, true);
    }
    return fail(
      "write_failed",
      "bundle publication failed; immutable residual was preserved",
      true,
    );
  } finally {
    await reservation?.handle.close().catch(() => undefined);
  }
}
