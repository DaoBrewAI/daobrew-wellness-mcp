import { createHash, randomBytes } from "node:crypto";
import {
  constants as FS_CONSTANTS,
  type BigIntStats,
} from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readlink,
  realpath,
  symlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import {
  advanceTaskMapConnectorCheckpoint,
  assertTaskMapConnectorCheckpoint,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
  type TaskMapConnectorPollDraftV1,
} from "./source-contracts.js";
import {
  verifyTaskMapRefreshRunBundle,
  type TaskMapRefreshRunLaneReferenceV1,
  type VerifiedTaskMapRefreshRunBundle,
} from "./refresh-run-bundle.js";
import type {
  TaskMapConnectorCheckpointV1,
  TaskMapSourceKind,
} from "./types.js";

export const TASKMAP_REFRESH_CURRENT_REF_VERSION =
  "taskmap-refresh-current-ref.v1" as const;

export const TASKMAP_REFRESH_CURRENT_LIMITS_V1 = Object.freeze({
  maxGenerations: 4096,
  maxRefBytes: 256 * 1024,
  maxHistoryBytes: 16 * 1024 * 1024,
  maxVerifiedBundleBytesPerOperation: 64 * 1024 * 1024,
  maxBundleCacheEntries: 4096,
  maxConnectorHeads: 4096,
  maxUnknownNames: 256,
  maxObjectEntries: 4352,
  maxDirectoryEntries: 4352,
  generationWidth: 20,
});

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const GENERATION_NAME = /^[0-9]{20}\.ref$/;
const REF_ID = /^tmrefreshcurrent_[a-f0-9]{64}$/;
const BUNDLE_ID = /^tmrefreshrun_[a-f0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const OPERATION_TOKEN = /^[a-f0-9]{32,64}$/;
const ARRAY_ITERATOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  Symbol.iterator,
);
const ARRAY_FILTER_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "filter",
);
const ARRAY_AT_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "at",
);
const ARRAY_EVERY_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "every",
);
const ARRAY_FIND_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "find",
);
const ARRAY_FLAT_MAP_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "flatMap",
);
const ARRAY_INCLUDES_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "includes",
);
const ARRAY_JOIN_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "join",
);
const ARRAY_MAP_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "map",
);
const ARRAY_PUSH_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "push",
);
const ARRAY_REDUCE_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "reduce",
);
const ARRAY_SLICE_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "slice",
);
const ARRAY_SOME_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "some",
);
const ARRAY_SORT_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Array.prototype,
  "sort",
);
const OBJECTS_DIRECTORY = "objects";
const GENERATIONS_DIRECTORY = "generations";
const RESERVATIONS_DIRECTORY = "reservations";
const RESERVATION_VERSION =
  "taskmap-refresh-current-reservation.v1" as const;
const RESERVATION_IDENTITY_VERSION =
  "taskmap-refresh-current-object-identity.v1" as const;
export const TASKMAP_REFRESH_CURRENT_PENDING_RECOVERY_VERSION =
  "taskmap-refresh-current-pending-recovery.v1" as const;
const PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  rawOwnerIdentifiersStored: false,
  connectorSecretsStored: false,
  localPathsStored: false,
});

export type TaskMapRefreshCurrentPublicationState =
  | "complete"
  | "no_op"
  | "blocked";

export type TaskMapRefreshCurrentOperation =
  | TaskMapRefreshCurrentPublicationState
  | "rollback";

export interface TaskMapRefreshCurrentAttemptV1 {
  generation: string;
  bundleId: string;
  planId: string;
  batchId: string;
  publicationState: TaskMapRefreshCurrentPublicationState;
  candidateAcceptedStateDigest: string;
}

export interface TaskMapRefreshCurrentAcceptedV1 {
  acceptedStateDigest: string;
  bundleId: string;
  planId: string;
  batchId: string;
  originGeneration: string;
}

export interface TaskMapRefreshCurrentConnectorArtifactV1 {
  bundleId: string;
  checkpointDigest: string;
  sourceSliceDigest: string;
}

export interface TaskMapRefreshCurrentConnectorHeadV1 {
  connectorKeyDigest: string;
  bindingDigest: string;
  sourceKind: TaskMapSourceKind;
  adapterVersion: string;
  latestCheckpoint: TaskMapRefreshCurrentConnectorArtifactV1;
  lastGood?: TaskMapRefreshCurrentConnectorArtifactV1;
}

export interface TaskMapRefreshCurrentRollbackV1 {
  targetGeneration: string;
  targetRefId: string;
  targetAcceptedStateDigest: string;
}

export interface TaskMapRefreshCurrentRefV1 {
  contractVersion: typeof TASKMAP_REFRESH_CURRENT_REF_VERSION;
  refId: string;
  generation: string;
  predecessorRefId?: string;
  ownerScopeDigest: string;
  operation: TaskMapRefreshCurrentOperation;
  attempt?: TaskMapRefreshCurrentAttemptV1;
  accepted?: TaskMapRefreshCurrentAcceptedV1;
  connectorHeads: TaskMapRefreshCurrentConnectorHeadV1[];
  rollback?: TaskMapRefreshCurrentRollbackV1;
  privacy: typeof PRIVACY;
}

export interface TaskMapRefreshCurrentFaultV1 {
  generation: string;
  code:
    | "generation_hole"
    | "generation_corrupt"
    | "generation_limit"
    | "store_unavailable";
  detail: string;
}

export interface TaskMapRefreshCurrentSnapshotV1 {
  status: "empty" | "healthy" | "degraded";
  head?: TaskMapRefreshCurrentRefV1;
  generations: TaskMapRefreshCurrentRefV1[];
  fault?: TaskMapRefreshCurrentFaultV1;
  unknownGenerationNames: string[];
  unknownObjectNames: string[];
}

export interface TaskMapRefreshCurrentRecoveryReceiptV1 {
  contractVersion: typeof TASKMAP_REFRESH_CURRENT_REF_VERSION;
  operationToken: string;
  objectName: string;
  expectedGeneration: string;
  expectedPredecessorRefId?: string;
  refId: string;
  ref: TaskMapRefreshCurrentRefV1;
  rootDev: string;
  rootIno: string;
  dev: string;
  ino: string;
  byteLength: number;
  byteSha256: string;
}

export type TaskMapRefreshCurrentFaultPoint =
  | "after_reservation_link"
  | "after_reservation_directory_sync"
  | "after_object_create_before_identity"
  | "after_object_identity_link"
  | "after_stage_create"
  | "after_object_partial_write"
  | "after_stage_sync"
  | "after_object_link"
  | "after_object_directory_sync"
  | "before_generation_link"
  | "after_generation_link"
  | "after_generation_directory_sync"
  | "after_current_validation";

export interface TaskMapRefreshCurrentWriteOptions {
  operationToken?: string;
  faultInjection?: (
    point: TaskMapRefreshCurrentFaultPoint,
  ) => void | Promise<void>;
}

export interface PublishTaskMapRefreshCurrentInput {
  currentRoot: string;
  runRoot: string;
  bundleId: string;
  expectedGeneration: string;
  expectedRefId?: string;
  options?: TaskMapRefreshCurrentWriteOptions;
}

export interface RollbackTaskMapRefreshCurrentInput {
  currentRoot: string;
  runRoot: string;
  targetGeneration: string;
  expectedGeneration: string;
  expectedRefId: string;
  options?: TaskMapRefreshCurrentWriteOptions;
}

export interface TaskMapRefreshCurrentWriteResult {
  status: "published" | "already_current";
  ref: TaskMapRefreshCurrentRefV1;
  processCrashAtomic: true;
  powerLossDurabilityClaimed: false;
}

export type TaskMapRefreshCurrentPendingOriginV1 =
  | {
      kind: "bundle";
      bundleId: string;
    }
  | {
      kind: "rollback";
      targetGeneration: string;
      targetRefId: string;
    };

export interface TaskMapRefreshCurrentPendingRecoveryV1 {
  contractVersion:
    typeof TASKMAP_REFRESH_CURRENT_PENDING_RECOVERY_VERSION;
  generation: string;
  expectedPredecessorRefId?: string;
  refId: string;
  origin: TaskMapRefreshCurrentPendingOriginV1;
  state: "claim_only" | "object_pending" | "generation_pending";
}

export type TaskMapRefreshCurrentErrorCode =
  | "invalid_contract"
  | "invalid_root"
  | "unsafe_target"
  | "degraded"
  | "cas_conflict"
  | "checkpoint_replay_failed"
  | "write_failed"
  | "recovery_required"
  | "recovery_refused"
  | "resource_limit";

export class TaskMapRefreshCurrentError extends Error {
  readonly code: TaskMapRefreshCurrentErrorCode;
  readonly committed: boolean;
  readonly recoveryReceipt?: TaskMapRefreshCurrentRecoveryReceiptV1;
  readonly pendingRecovery?: TaskMapRefreshCurrentPendingRecoveryV1;

  constructor(
    code: TaskMapRefreshCurrentErrorCode,
    message: string,
    options: {
      committed?: boolean;
      recoveryReceipt?: TaskMapRefreshCurrentRecoveryReceiptV1;
      pendingRecovery?: TaskMapRefreshCurrentPendingRecoveryV1;
    } = {},
  ) {
    super(message);
    this.name = "TaskMapRefreshCurrentError";
    this.code = code;
    this.committed = options.committed ?? false;
    this.recoveryReceipt = options.recoveryReceipt;
    this.pendingRecovery = options.pendingRecovery;
  }
}

interface CheckedDirectory {
  directory: string;
  stats: BigIntStats;
}

interface CurrentStore {
  root: CheckedDirectory;
  objects: CheckedDirectory;
  generations: CheckedDirectory;
  reservations: CheckedDirectory;
}

interface CurrentReservationV1 {
  contractVersion: typeof RESERVATION_VERSION;
  operationToken: string;
  expectedGeneration: string;
  expectedPredecessorRefId?: string;
  refId: string;
  objectName: string;
  origin: TaskMapRefreshCurrentPendingOriginV1;
}

interface CurrentReservationIdentityV1 {
  contractVersion: typeof RESERVATION_IDENTITY_VERSION;
  operationToken: string;
  expectedGeneration: string;
  refId: string;
  objectName: string;
  dev: string;
  ino: string;
}

type BundleCache = Map<string, VerifiedTaskMapRefreshRunBundle>;

interface AcceptedSourceFactLedger {
  historyLength: number;
  lastRefId?: string;
  originBundleIds: Set<string>;
  contentByRevision: Map<string, string>;
}

const acceptedSourceFactLedgers =
  new WeakMap<BundleCache, AcceptedSourceFactLedger>();
const verifiedBundleBytesByCache = new WeakMap<BundleCache, number>();

function fail(
  code: TaskMapRefreshCurrentErrorCode,
  message: string,
  options: {
    committed?: boolean;
    recoveryReceipt?: TaskMapRefreshCurrentRecoveryReceiptV1;
    pendingRecovery?: TaskMapRefreshCurrentPendingRecoveryV1;
  } = {},
): never {
  throw new TaskMapRefreshCurrentError(code, message, options);
}

function failWithWriteContext(
  error: unknown,
  message: string,
  committed: boolean,
  recoveryReceipt: TaskMapRefreshCurrentRecoveryReceiptV1 | undefined,
): never {
  if (error instanceof TaskMapRefreshCurrentError) {
    const nextCommitted = committed || error.committed;
    const nextReceipt = error.recoveryReceipt ?? recoveryReceipt;
    if (
      error.committed === nextCommitted
      && error.recoveryReceipt === nextReceipt
    ) {
      throw error;
    }
    throw new TaskMapRefreshCurrentError(error.code, error.message, {
      committed: nextCommitted,
      ...(nextReceipt === undefined
        ? {}
        : { recoveryReceipt: nextReceipt }),
      ...(error.pendingRecovery === undefined
        ? {}
        : { pendingRecovery: error.pendingRecovery }),
    });
  }
  return fail("write_failed", message, {
    committed,
    ...(recoveryReceipt === undefined ? {} : { recoveryReceipt }),
  });
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

function currentUid(): number {
  if (typeof process.getuid !== "function") {
    return fail("invalid_root", "owner UID verification is unavailable");
  }
  return process.getuid();
}

function modeBits(stats: BigIntStats): number {
  return Number(stats.mode & 0o7777n);
}

function assertOwnerDirectoryStats(
  stats: BigIntStats,
  label: string,
  code: TaskMapRefreshCurrentErrorCode,
): void {
  if (
    !stats.isDirectory()
    || stats.isSymbolicLink()
    || stats.uid !== BigInt(currentUid())
    || modeBits(stats) !== DIRECTORY_MODE
  ) {
    fail(code, `${label} must be a same-owner 0700 real directory`);
  }
}

function assertOwnerFileStats(
  stats: BigIntStats,
  label: string,
  allowedLinks: readonly number[],
  minimumBytes = 1,
): void {
  let linkCountAllowed = false;
  for (let index = 0; index < allowedLinks.length; index += 1) {
    if (stats.nlink === BigInt(allowedLinks[index])) {
      linkCountAllowed = true;
      break;
    }
  }
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || stats.uid !== BigInt(currentUid())
    || modeBits(stats) !== FILE_MODE
    || !linkCountAllowed
    || stats.size < BigInt(minimumBytes)
    || stats.size > BigInt(TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes)
  ) {
    fail(
      "unsafe_target",
      `${label} must be a bounded same-owner 0600 regular file`,
    );
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copyArray<T>(values: readonly T[]): T[] {
  const result = new Array<T>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = values[index];
  }
  return result;
}

function filterArray<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
): T[] {
  const result: T[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (predicate(value, index)) {
      result[result.length] = value;
    }
  }
  return result;
}

function findArray<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
): T | undefined {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (predicate(value, index)) return value;
  }
  return undefined;
}

function mapArray<T, U>(
  values: readonly T[],
  transform: (value: T, index: number) => U,
): U[] {
  const result = new Array<U>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = transform(values[index], index);
  }
  return result;
}

function sortedArray<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): T[] {
  const result = copyArray(values);
  for (let index = 1; index < result.length; index += 1) {
    const current = result[index];
    let insertion = index;
    while (
      insertion > 0
      && compare(current, result[insertion - 1]) < 0
    ) {
      result[insertion] = result[insertion - 1];
      insertion -= 1;
    }
    result[insertion] = current;
  }
  return result;
}

function arrayIncludes<T>(values: readonly T[], expected: T): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return true;
  }
  return false;
}

function lastArrayValue<T>(values: readonly T[]): T | undefined {
  return values.length === 0 ? undefined : values[values.length - 1];
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail("invalid_contract", `${label} must be a sha256 digest`);
  }
}

function assertBundleId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !BUNDLE_ID.test(value)) {
    fail("invalid_contract", `${label} is invalid`);
  }
}

function assertRefId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !REF_ID.test(value)) {
    fail("invalid_contract", `${label} is invalid`);
  }
}

function assertGeneration(
  value: unknown,
  label: string,
  allowZero = false,
): asserts value is string {
  if (
    typeof value !== "string"
    || !/^[0-9]{20}$/.test(value)
    || (!allowZero && BigInt(value) === 0n)
  ) {
    fail("invalid_contract", `${label} must be a fixed-width generation`);
  }
}

function generationFor(value: bigint): string {
  if (
    value < 1n
    || value > BigInt(TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations)
  ) {
    fail("invalid_contract", "generation is outside its supported bound");
  }
  return value.toString().padStart(
    TASKMAP_REFRESH_CURRENT_LIMITS_V1.generationWidth,
    "0",
  );
}

function nextGeneration(current: string): string {
  assertGeneration(current, "current generation", true);
  return generationFor(BigInt(current) + 1n);
}

function generationFileName(generation: string): string {
  assertGeneration(generation, "generation");
  return `${generation}.ref`;
}

function refObjectName(refId: string): string {
  assertRefId(refId, "current refId");
  return `${refId}.json`;
}

function reservedObjectName(
  refId: string,
  operationToken: string,
): string {
  assertRefId(refId, "current refId");
  if (!OPERATION_TOKEN.test(operationToken)) {
    fail("invalid_contract", "reservation operation token is invalid");
  }
  return `${refId}.${operationToken}.json`;
}

function ownEnumerableValue(
  value: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (
    !descriptor
    || !("value" in descriptor)
    || !descriptor.enumerable
  ) {
    fail("invalid_contract", `${label} field ${key} must be own data`);
  }
  return descriptor.value;
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("invalid_contract", `${label} must be a plain object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>();
  for (let index = 0; index < required.length; index += 1) {
    allowed.add(required[index]);
  }
  for (let index = 0; index < optional.length; index += 1) {
    allowed.add(optional[index]);
  }
  const keys = Reflect.ownKeys(record);
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string" || !allowed.has(key)) {
      fail("invalid_contract", `${label} has an unknown field`);
    }
    snapshot[key] = ownEnumerableValue(record, key, label);
  }
  for (let index = 0; index < required.length; index += 1) {
    const key = required[index];
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
      ownEnumerableValue(record, key, label);
    }
  }
  for (let index = 0; index < optional.length; index += 1) {
    const key = optional[index];
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) continue;
    let prototype: object | null = Object.getPrototypeOf(record);
    while (prototype !== null) {
      if (Object.getOwnPropertyDescriptor(prototype, key) !== undefined) {
        fail(
          "invalid_contract",
          `${label} optional field ${key} cannot be inherited`,
        );
      }
      prototype = Object.getPrototypeOf(prototype);
    }
  }
  return snapshot;
}

function canonicalBytes(value: unknown): string {
  assertPristineArrayRuntime("current-ref canonicalization");
  return taskMapContractCanonicalJson(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    const children = Object.values(value as Record<string, unknown>);
    for (let index = 0; index < children.length; index += 1) {
      deepFreeze(children[index]);
    }
    Object.freeze(value);
  }
  return value;
}

function hasSameDataDescriptor(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor | undefined,
): boolean {
  return (
    actual !== undefined
    && expected !== undefined
    && "value" in actual
    && "value" in expected
    && actual.value === expected.value
    && actual.get === expected.get
    && actual.set === expected.set
  );
}

function assertPristineArrayRuntime(label: string): void {
  const iterator = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator,
  );
  if (
    !hasSameDataDescriptor(iterator, ARRAY_ITERATOR_DESCRIPTOR)
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "filter"),
      ARRAY_FILTER_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "includes"),
      ARRAY_INCLUDES_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "join"),
      ARRAY_JOIN_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "map"),
      ARRAY_MAP_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "slice"),
      ARRAY_SLICE_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "sort"),
      ARRAY_SORT_DESCRIPTOR,
    )
  ) {
    fail("invalid_contract", `${label} cannot use a polluted array runtime`);
  }
}

function assertPristineBundleArrayRuntime(label: string): void {
  assertPristineArrayRuntime(label);
  if (
    !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "at"),
      ARRAY_AT_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "every"),
      ARRAY_EVERY_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "find"),
      ARRAY_FIND_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "flatMap"),
      ARRAY_FLAT_MAP_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "push"),
      ARRAY_PUSH_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "reduce"),
      ARRAY_REDUCE_DESCRIPTOR,
    )
    || !hasSameDataDescriptor(
      Object.getOwnPropertyDescriptor(Array.prototype, "some"),
      ARRAY_SOME_DESCRIPTOR,
    )
  ) {
    fail(
      "invalid_contract",
      `${label} cannot use a polluted bundle array runtime`,
    );
  }
}

function snapshotArray(
  value: unknown,
  label: string,
  maximumLength: number,
): unknown[] {
  assertPristineArrayRuntime(label);
  if (!Array.isArray(value)) {
    fail("invalid_contract", `${label} must be an array`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor
    || !("value" in lengthDescriptor)
    || !Number.isInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximumLength
  ) {
    fail("invalid_contract", `${label} length is outside its bound`);
  }
  const length = lengthDescriptor.value as number;
  const snapshot = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      value,
      index.toString(),
    );
    if (
      !descriptor
      || !("value" in descriptor)
      || !descriptor.enumerable
    ) {
      fail(
        "invalid_contract",
        `${label} cannot contain sparse, inherited, or accessor entries`,
      );
    }
    snapshot[index] = descriptor.value;
  }
  const ownKeys = Reflect.ownKeys(value);
  let carriesExtraField = ownKeys.length !== length + 1;
  for (
    let index = 0;
    !carriesExtraField && index < ownKeys.length;
    index += 1
  ) {
    const key = ownKeys[index];
    carriesExtraField = (
      key !== "length"
      && (
        typeof key !== "string"
        || !/^(?:0|[1-9][0-9]*)$/.test(key)
        || Number(key) >= length
      )
    );
  }
  if (
    carriesExtraField
  ) {
    fail("invalid_contract", `${label} cannot carry extra fields`);
  }
  return snapshot;
}

function snapshotWriteOptions(
  value: unknown,
): Readonly<TaskMapRefreshCurrentWriteOptions> {
  if (value === undefined) return Object.freeze({});
  const snapshot = assertExactKeys(
    value,
    [],
    ["operationToken", "faultInjection"],
    "current-ref write options",
  );
  const operationToken = snapshot.operationToken;
  const faultInjectionValue = snapshot.faultInjection;
  if (
    operationToken !== undefined
    && (
      typeof operationToken !== "string"
      || !OPERATION_TOKEN.test(operationToken)
    )
  ) {
    fail("invalid_contract", "operation token must be 32-64 lowercase hex");
  }
  if (
    faultInjectionValue !== undefined
    && typeof faultInjectionValue !== "function"
  ) {
    fail("invalid_contract", "fault injection must be a function");
  }
  const faultInjection =
    faultInjectionValue as TaskMapRefreshCurrentWriteOptions["faultInjection"];
  return Object.freeze({
    ...(operationToken === undefined ? {} : { operationToken }),
    ...(faultInjection === undefined ? {} : { faultInjection }),
  });
}

function snapshotPublishInput(
  value: unknown,
): Readonly<PublishTaskMapRefreshCurrentInput> {
  const snapshot = assertExactKeys(
    value,
    ["currentRoot", "runRoot", "bundleId", "expectedGeneration"],
    ["expectedRefId", "options"],
    "current-ref publish command",
  );
  const requiredKeys = [
    "currentRoot",
    "runRoot",
    "bundleId",
    "expectedGeneration",
  ] as const;
  for (let index = 0; index < requiredKeys.length; index += 1) {
    const key = requiredKeys[index];
    if (typeof snapshot[key] !== "string") {
      fail("invalid_contract", `publish ${key} must be a string`);
    }
  }
  if (
    snapshot.expectedRefId !== undefined
    && typeof snapshot.expectedRefId !== "string"
  ) {
    fail("invalid_contract", "publish expectedRefId must be a string");
  }
  return Object.freeze({
    currentRoot: snapshot.currentRoot as string,
    runRoot: snapshot.runRoot as string,
    bundleId: snapshot.bundleId as string,
    expectedGeneration: snapshot.expectedGeneration as string,
    ...(snapshot.expectedRefId === undefined
      ? {}
      : { expectedRefId: snapshot.expectedRefId as string }),
    options: snapshotWriteOptions(snapshot.options),
  });
}

function snapshotRollbackInput(
  value: unknown,
): Readonly<RollbackTaskMapRefreshCurrentInput> {
  const snapshot = assertExactKeys(
    value,
    [
      "currentRoot",
      "runRoot",
      "targetGeneration",
      "expectedGeneration",
      "expectedRefId",
    ],
    ["options"],
    "current-ref rollback command",
  );
  const requiredKeys = [
    "currentRoot",
    "runRoot",
    "targetGeneration",
    "expectedGeneration",
    "expectedRefId",
  ] as const;
  for (let index = 0; index < requiredKeys.length; index += 1) {
    const key = requiredKeys[index];
    if (typeof snapshot[key] !== "string") {
      fail("invalid_contract", `rollback ${key} must be a string`);
    }
  }
  return Object.freeze({
    currentRoot: snapshot.currentRoot as string,
    runRoot: snapshot.runRoot as string,
    targetGeneration: snapshot.targetGeneration as string,
    expectedGeneration: snapshot.expectedGeneration as string,
    expectedRefId: snapshot.expectedRefId as string,
    options: snapshotWriteOptions(snapshot.options),
  });
}

function refIdFor(
  core: Omit<TaskMapRefreshCurrentRefV1, "refId">,
): string {
  return `tmrefreshcurrent_${taskMapContractDigest(core)}`;
}

function makeRef(
  value: Omit<TaskMapRefreshCurrentRefV1, "contractVersion" | "refId" | "privacy">,
): TaskMapRefreshCurrentRefV1 {
  const core: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    ...value,
    privacy: { ...PRIVACY },
  };
  return deepFreeze({
    ...core,
    refId: refIdFor(core),
  });
}

function connectorKeyFor(
  checkpoint: TaskMapConnectorCheckpointV1,
): string {
  return taskMapContractDigest({
    binding: checkpoint.binding,
    sourceKind: checkpoint.sourceKind,
    adapterVersion: checkpoint.adapterVersion,
  });
}

function pollForCheckpoint(
  checkpoint: TaskMapConnectorCheckpointV1,
): TaskMapConnectorPollDraftV1 {
  return {
    binding: checkpoint.binding,
    sourceKind: checkpoint.sourceKind,
    adapterVersion: checkpoint.adapterVersion,
    capabilities: checkpoint.capabilities,
    state: checkpoint.state,
    attemptedAt: checkpoint.lastAttemptAt,
    ...(checkpoint.state === "success"
      ? {
          proposedWatermark: checkpoint.watermark!,
          acceptedSourceIdentityDigests:
            checkpoint.acceptedSourceIdentityDigests,
        }
      : {
          errorCode: checkpoint.error!.code,
          errorDetailDigest: checkpoint.error!.detailDigest,
        }),
  };
}

function checkpointEquals(
  left: TaskMapConnectorCheckpointV1,
  right: TaskMapConnectorCheckpointV1,
): boolean {
  return canonicalBytes(left) === canonicalBytes(right);
}

async function checkedDirectory(
  directory: string,
  label: string,
  code: TaskMapRefreshCurrentErrorCode,
): Promise<CheckedDirectory> {
  const resolved = path.resolve(directory);
  let initial: BigIntStats;
  let canonical: string;
  let handle: FileHandle | undefined;
  try {
    initial = await lstat(resolved, { bigint: true });
    canonical = await realpath(resolved);
    handle = await open(
      resolved,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = await handle.stat({ bigint: true });
    assertOwnerDirectoryStats(opened, label, code);
    if (opened.dev !== initial.dev || opened.ino !== initial.ino) {
      fail(code, `${label} changed during validation`);
    }
    initial = opened;
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    return fail(code, `${label} is unavailable`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
  if (canonical !== resolved) {
    fail(code, `${label} cannot traverse symbolic links`);
  }
  return { directory: canonical, stats: initial };
}

async function checkedRecoveryObservationDirectory(
  directory: string,
  label: string,
): Promise<CheckedDirectory> {
  const resolved = path.resolve(directory);
  let initial: BigIntStats;
  let canonical: string;
  let handle: FileHandle | undefined;
  try {
    initial = await lstat(resolved, { bigint: true });
    canonical = await realpath(resolved);
    handle = await open(
      resolved,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isDirectory()
      || opened.isSymbolicLink()
      || opened.uid !== BigInt(currentUid())
      || opened.dev !== initial.dev
      || opened.ino !== initial.ino
    ) {
      fail(
        "invalid_root",
        `${label} is not a stable same-owner real directory`,
      );
    }
    initial = opened;
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    return fail(
      "invalid_root",
      `${label} is unavailable`,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
  if (canonical !== resolved) {
    fail(
      "invalid_root",
      `${label} cannot traverse symbolic links`,
    );
  }
  return { directory: canonical, stats: initial };
}

async function recoveryObservationStore(
  currentRoot: string,
): Promise<Pick<CurrentStore, "root" | "objects" | "generations">> {
  if (!path.isAbsolute(currentRoot)) {
    fail("invalid_root", "current-ref root must be absolute");
  }
  const root = await checkedRecoveryObservationDirectory(
    currentRoot,
    "recovery observation root",
  );
  const objects = await checkedRecoveryObservationDirectory(
    path.join(root.directory, OBJECTS_DIRECTORY),
    "recovery observation objects directory",
  );
  const generations = await checkedRecoveryObservationDirectory(
    path.join(root.directory, GENERATIONS_DIRECTORY),
    "recovery observation generations directory",
  );
  if (
    objects.stats.dev !== root.stats.dev
    || generations.stats.dev !== root.stats.dev
  ) {
    fail(
      "invalid_root",
      "recovery observation store must remain on one volume",
    );
  }
  return { root, objects, generations };
}

async function revalidateRecoveryObservationStore(
  store: Pick<CurrentStore, "root" | "objects" | "generations">,
): Promise<void> {
  const root = await checkedRecoveryObservationDirectory(
    store.root.directory,
    "recovery observation root",
  );
  if (
    root.stats.dev !== store.root.stats.dev
    || root.stats.ino !== store.root.stats.ino
  ) {
    fail("invalid_root", "recovery observation root changed");
  }
  const children = [store.objects, store.generations];
  const labels = [
    "recovery observation objects directory",
    "recovery observation generations directory",
  ];
  for (let index = 0; index < children.length; index += 1) {
    const current = await checkedRecoveryObservationDirectory(
      children[index].directory,
      labels[index],
    );
    if (
      current.stats.dev !== children[index].stats.dev
      || current.stats.ino !== children[index].stats.ino
    ) {
      fail("invalid_root", `${labels[index]} changed`);
    }
  }
}

async function revalidateDirectory(
  checked: CheckedDirectory,
  label: string,
  code: TaskMapRefreshCurrentErrorCode,
): Promise<void> {
  const current = await checkedDirectory(checked.directory, label, code);
  if (
    current.stats.dev !== checked.stats.dev
    || current.stats.ino !== checked.stats.ino
  ) {
    fail(code, `${label} was replaced after validation`);
  }
}

async function revalidateStore(
  store: CurrentStore,
  code: TaskMapRefreshCurrentErrorCode,
): Promise<void> {
  await revalidateDirectory(store.root, "current-ref root", code);
  await revalidateDirectory(
    store.objects,
    "current-ref objects directory",
    code,
  );
  await revalidateDirectory(
    store.generations,
    "current-ref generations directory",
    code,
  );
  await revalidateDirectory(
    store.reservations,
    "current-ref reservations directory",
    code,
  );
}

async function syncDirectory(
  checked: CheckedDirectory,
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
    assertOwnerDirectoryStats(stats, label, "write_failed");
    if (stats.dev !== checked.stats.dev || stats.ino !== checked.stats.ino) {
      fail("write_failed", `${label} changed before sync`);
    }
    await handle.sync();
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    fail("write_failed", `${label} sync failed`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function openCurrentStore(currentRoot: string): Promise<CurrentStore> {
  if (!path.isAbsolute(currentRoot)) {
    fail("invalid_root", "current-ref root must be absolute");
  }
  const root = await checkedDirectory(
    currentRoot,
    "current-ref root",
    "invalid_root",
  );
  const objects = await checkedDirectory(
    path.join(root.directory, OBJECTS_DIRECTORY),
    "current-ref objects directory",
    "invalid_root",
  );
  const generations = await checkedDirectory(
    path.join(root.directory, GENERATIONS_DIRECTORY),
    "current-ref generations directory",
    "invalid_root",
  );
  const reservations = await checkedDirectory(
    path.join(root.directory, RESERVATIONS_DIRECTORY),
    "current-ref reservations directory",
    "invalid_root",
  );
  if (
    objects.stats.dev !== root.stats.dev
    || generations.stats.dev !== root.stats.dev
    || reservations.stats.dev !== root.stats.dev
  ) {
    fail("invalid_root", "current-ref store must remain on one volume");
  }
  return { root, objects, generations, reservations };
}

export async function initializeTaskMapRefreshCurrentStore(
  currentRoot: string,
): Promise<void> {
  if (!path.isAbsolute(currentRoot)) {
    fail("invalid_root", "current-ref root must be absolute");
  }
  const root = await checkedDirectory(
    currentRoot,
    "current-ref root",
    "invalid_root",
  );
  const directoryNames = [
    OBJECTS_DIRECTORY,
    GENERATIONS_DIRECTORY,
    RESERVATIONS_DIRECTORY,
  ];
  for (let index = 0; index < directoryNames.length; index += 1) {
    const name = directoryNames[index];
    const directory = path.join(root.directory, name);
    try {
      await mkdir(directory, { mode: DIRECTORY_MODE });
      await chmod(directory, DIRECTORY_MODE);
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") {
        fail("write_failed", `cannot initialize ${name} directory`);
      }
    }
    await checkedDirectory(
      directory,
      `current-ref ${name} directory`,
      "invalid_root",
    );
  }
  await syncDirectory(root, "current-ref root");
}

function normalizeArtifact(
  value: unknown,
  label: string,
): TaskMapRefreshCurrentConnectorArtifactV1 {
  const snapshot = assertExactKeys(
    value,
    ["bundleId", "checkpointDigest", "sourceSliceDigest"],
    [],
    label,
  );
  const artifact =
    snapshot as unknown as TaskMapRefreshCurrentConnectorArtifactV1;
  assertBundleId(artifact.bundleId, `${label} bundleId`);
  assertDigest(artifact.checkpointDigest, `${label} checkpointDigest`);
  assertDigest(artifact.sourceSliceDigest, `${label} sourceSliceDigest`);
  return {
    bundleId: artifact.bundleId,
    checkpointDigest: artifact.checkpointDigest,
    sourceSliceDigest: artifact.sourceSliceDigest,
  };
}

function normalizeAttempt(
  value: unknown,
): TaskMapRefreshCurrentAttemptV1 {
  const snapshot = assertExactKeys(
    value,
    [
      "generation",
      "bundleId",
      "planId",
      "batchId",
      "publicationState",
      "candidateAcceptedStateDigest",
    ],
    [],
    "current attempt",
  );
  const attempt =
    snapshot as unknown as TaskMapRefreshCurrentAttemptV1;
  assertGeneration(attempt.generation, "attempt generation");
  assertBundleId(attempt.bundleId, "attempt bundleId");
  if (
    typeof attempt.planId !== "string"
    || typeof attempt.batchId !== "string"
    || (
      attempt.publicationState !== "complete"
      && attempt.publicationState !== "no_op"
      && attempt.publicationState !== "blocked"
    )
  ) {
    fail("invalid_contract", "current attempt identity is invalid");
  }
  assertDigest(
    attempt.candidateAcceptedStateDigest,
    "attempt candidate accepted-state digest",
  );
  return { ...attempt };
}

function normalizeAccepted(
  value: unknown,
): TaskMapRefreshCurrentAcceptedV1 {
  const snapshot = assertExactKeys(
    value,
    [
      "acceptedStateDigest",
      "bundleId",
      "planId",
      "batchId",
      "originGeneration",
    ],
    [],
    "current accepted head",
  );
  const accepted =
    snapshot as unknown as TaskMapRefreshCurrentAcceptedV1;
  assertDigest(accepted.acceptedStateDigest, "accepted-state digest");
  assertBundleId(accepted.bundleId, "accepted bundleId");
  if (
    typeof accepted.planId !== "string"
    || typeof accepted.batchId !== "string"
  ) {
    fail("invalid_contract", "accepted plan/batch identity is invalid");
  }
  assertGeneration(accepted.originGeneration, "accepted origin generation");
  return { ...accepted };
}

function normalizeConnectorHeads(
  value: unknown,
  sort = true,
): TaskMapRefreshCurrentConnectorHeadV1[] {
  const items = snapshotArray(
    value,
    "connector heads",
    TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxConnectorHeads,
  );
  const byKey = new Map<string, TaskMapRefreshCurrentConnectorHeadV1>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const snapshot = assertExactKeys(
      item,
      [
        "connectorKeyDigest",
        "bindingDigest",
        "sourceKind",
        "adapterVersion",
        "latestCheckpoint",
      ],
      ["lastGood"],
      "connector head",
    );
    const head =
      snapshot as unknown as TaskMapRefreshCurrentConnectorHeadV1;
    assertDigest(head.connectorKeyDigest, "connector key digest");
    assertDigest(head.bindingDigest, "connector binding digest");
    if (
      typeof head.sourceKind !== "string"
      || typeof head.adapterVersion !== "string"
      || head.adapterVersion.length === 0
      || head.adapterVersion.length > 256
    ) {
      fail("invalid_contract", "connector lineage identity is invalid");
    }
    if (byKey.has(head.connectorKeyDigest)) {
      fail("invalid_contract", "connector head lineage is duplicated");
    }
    byKey.set(head.connectorKeyDigest, {
      connectorKeyDigest: head.connectorKeyDigest,
      bindingDigest: head.bindingDigest,
      sourceKind: head.sourceKind,
      adapterVersion: head.adapterVersion,
      latestCheckpoint: normalizeArtifact(
        head.latestCheckpoint,
        "latest checkpoint",
      ),
      ...(head.lastGood === undefined
        ? {}
        : {
            lastGood: normalizeArtifact(
              head.lastGood,
              "last-good checkpoint",
            ),
          }),
    });
  }
  const normalized = Array.from(byKey.values());
  return sort
    ? sortedArray(normalized, (left, right) => (
        compareText(left.connectorKeyDigest, right.connectorKeyDigest)
      ))
    : normalized;
}

function normalizeRollback(
  value: unknown,
): TaskMapRefreshCurrentRollbackV1 {
  const snapshot = assertExactKeys(
    value,
    [
      "targetGeneration",
      "targetRefId",
      "targetAcceptedStateDigest",
    ],
    [],
    "current rollback",
  );
  const rollback =
    snapshot as unknown as TaskMapRefreshCurrentRollbackV1;
  assertGeneration(rollback.targetGeneration, "rollback target generation");
  assertRefId(rollback.targetRefId, "rollback target refId");
  assertDigest(
    rollback.targetAcceptedStateDigest,
    "rollback target accepted-state digest",
  );
  return { ...rollback };
}

function normalizeCurrentRef(
  value: unknown,
): TaskMapRefreshCurrentRefV1 {
  assertPristineArrayRuntime("current ref");
  const snapshot = assertExactKeys(
    value,
    [
      "contractVersion",
      "refId",
      "generation",
      "ownerScopeDigest",
      "operation",
      "connectorHeads",
      "privacy",
    ],
    ["predecessorRefId", "attempt", "accepted", "rollback"],
    "current ref",
  );
  const ref = snapshot as unknown as TaskMapRefreshCurrentRefV1;
  if (ref.contractVersion !== TASKMAP_REFRESH_CURRENT_REF_VERSION) {
    fail("invalid_contract", "current-ref contract version is unsupported");
  }
  assertRefId(ref.refId, "current refId");
  assertGeneration(ref.generation, "current generation");
  assertDigest(ref.ownerScopeDigest, "current owner-scope digest");
  if (
    ref.operation !== "complete"
    && ref.operation !== "no_op"
    && ref.operation !== "blocked"
    && ref.operation !== "rollback"
  ) {
    fail("invalid_contract", "current-ref operation is unsupported");
  }
  if (ref.predecessorRefId !== undefined) {
    assertRefId(ref.predecessorRefId, "current predecessor refId");
  }
  const privacySnapshot = assertExactKeys(
    ref.privacy,
    Object.keys(PRIVACY),
    [],
    "current-ref privacy",
  );
  if (canonicalBytes(privacySnapshot) !== canonicalBytes(PRIVACY)) {
    fail("invalid_contract", "current-ref privacy boundary is invalid");
  }
  const rawConnectorHeads = normalizeConnectorHeads(
    ref.connectorHeads,
    false,
  );
  const normalized: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    generation: ref.generation,
    ...(ref.predecessorRefId === undefined
      ? {}
      : { predecessorRefId: ref.predecessorRefId }),
    ownerScopeDigest: ref.ownerScopeDigest,
    operation: ref.operation,
    ...(ref.attempt === undefined
      ? {}
      : { attempt: normalizeAttempt(ref.attempt) }),
    ...(ref.accepted === undefined
      ? {}
      : { accepted: normalizeAccepted(ref.accepted) }),
    connectorHeads: sortedArray(rawConnectorHeads, (left, right) => (
      compareText(left.connectorKeyDigest, right.connectorKeyDigest)
    )),
    ...(ref.rollback === undefined
      ? {}
      : { rollback: normalizeRollback(ref.rollback) }),
    privacy: { ...PRIVACY },
  };
  if (
    ref.operation === "rollback"
    ? normalized.rollback === undefined
    : normalized.rollback !== undefined
  ) {
    fail("invalid_contract", "rollback fields do not match the operation");
  }
  if (
    ref.operation !== "rollback"
    && (
      normalized.attempt === undefined
      || normalized.attempt.generation !== normalized.generation
      || normalized.attempt.publicationState !== ref.operation
    )
  ) {
    fail("invalid_contract", "publication attempt fields are inconsistent");
  }
  const expectedId = refIdFor(normalized);
  if (ref.refId !== expectedId) {
    fail("invalid_contract", "current-ref derived identity is invalid");
  }
  const result = { ...normalized, refId: ref.refId };
  const rawRepresentation: TaskMapRefreshCurrentRefV1 = {
    ...result,
    connectorHeads: rawConnectorHeads,
  };
  if (canonicalBytes(rawRepresentation) !== canonicalBytes(result)) {
    fail("invalid_contract", "current-ref bytes are not in canonical order");
  }
  return deepFreeze(result);
}

export function assertTaskMapRefreshCurrentRef(
  value: TaskMapRefreshCurrentRefV1,
): TaskMapRefreshCurrentRefV1 {
  return normalizeCurrentRef(value);
}

async function readOwnerFile(
  filePath: string,
  label: string,
  allowedLinks: readonly number[],
): Promise<{ text: string; stats: BigIntStats }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      filePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const before = await handle.stat({ bigint: true });
    assertOwnerFileStats(before, label, allowedLinks);
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (result.bytesRead <= 0) {
        fail("unsafe_target", `${label} read stalled`);
      }
      offset += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    assertOwnerFileStats(after, label, allowedLinks);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      fail("unsafe_target", `${label} changed during read`);
    }
    const text = buffer.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(buffer)) {
      fail("unsafe_target", `${label} is not strict UTF-8`);
    }
    return { text, stats: after };
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    return fail("unsafe_target", `${label} cannot be opened safely`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readRecoveryObservationFile(
  filePath: string,
  label: string,
  expectedBytes: number,
): Promise<{ text: string; stats: BigIntStats }> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      filePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.uid !== BigInt(currentUid())
      || before.nlink !== 2n
      || before.size !== BigInt(expectedBytes)
    ) {
      fail(
        "invalid_root",
        `${label} is not the exact same-owner committed inode`,
      );
    }
    const buffer = Buffer.alloc(expectedBytes);
    let offset = 0;
    while (offset < buffer.length) {
      const result = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (result.bytesRead <= 0) {
        fail("invalid_root", `${label} read stalled`);
      }
      offset += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (
      !after.isFile()
      || after.isSymbolicLink()
      || after.uid !== before.uid
      || after.nlink !== 2n
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      fail("invalid_root", `${label} changed during observation`);
    }
    const text = buffer.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(buffer)) {
      fail("invalid_root", `${label} is not strict UTF-8`);
    }
    return { text, stats: after };
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    return fail("invalid_root", `${label} cannot be opened safely`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function verifyStoredRef(
  store: CurrentStore,
  generation: string,
  claimedObjectNames?: Set<string>,
): Promise<TaskMapRefreshCurrentRefV1> {
  await revalidateStore(store, "unsafe_target");
  const generationPath = path.join(
    store.generations.directory,
    generationFileName(generation),
  );
  const stored = await readOwnerFile(
    generationPath,
    `generation ${generation}`,
    [2],
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.text);
  } catch {
    return fail("unsafe_target", `generation ${generation} is not JSON`);
  }
  const ref = normalizeCurrentRef(parsed);
  if (canonicalBytes(parsed) !== stored.text) {
    fail("unsafe_target", `generation ${generation} is not canonical`);
  }
  if (ref.generation !== generation) {
    fail("unsafe_target", `generation ${generation} names another generation`);
  }
  const reservation = await parseReservationTarget(
    store,
    reservationNameFor(generation),
    `reservation ${generation}`,
    normalizeReservation,
  );
  const identity = await parseReservationTarget(
    store,
    reservationIdentityNameFor(generation),
    `reservation identity ${generation}`,
    normalizeReservationIdentity,
  );
  const expectedOrigin: TaskMapRefreshCurrentPendingOriginV1 =
    ref.operation === "rollback"
      ? {
          kind: "rollback",
          targetGeneration: ref.rollback!.targetGeneration,
          targetRefId: ref.rollback!.targetRefId,
        }
      : {
          kind: "bundle",
          bundleId: ref.attempt!.bundleId,
        };
  if (
    canonicalBytes(reservation.origin)
      !== canonicalBytes(expectedOrigin)
  ) {
    fail(
      "unsafe_target",
      `generation ${generation} reservation origin is inconsistent`,
    );
  }
  if (
    reservation.expectedGeneration !== generation
    || reservation.expectedPredecessorRefId !== ref.predecessorRefId
    || reservation.refId !== ref.refId
    || identity.operationToken !== reservation.operationToken
    || identity.expectedGeneration !== generation
    || identity.refId !== ref.refId
    || identity.objectName !== reservation.objectName
  ) {
    fail(
      "unsafe_target",
      `generation ${generation} storage journal is inconsistent`,
    );
  }
  const objectPath = path.join(
    store.objects.directory,
    reservation.objectName,
  );
  await revalidateStore(store, "unsafe_target");
  const object = await readOwnerFile(
    objectPath,
    `current-ref object ${ref.refId}`,
    [2],
  );
  if (
    object.text !== stored.text
    || object.stats.dev !== stored.stats.dev
    || object.stats.ino !== stored.stats.ino
    || object.stats.dev.toString() !== identity.dev
    || object.stats.ino.toString() !== identity.ino
  ) {
    fail(
      "unsafe_target",
      `generation ${generation} is not the expected object hardlink`,
    );
  }
  await revalidateStore(store, "unsafe_target");
  const reboundGeneration = await readOwnerFile(
    generationPath,
    `generation ${generation}`,
    [2],
  );
  if (
    reboundGeneration.text !== stored.text
    || reboundGeneration.stats.dev !== stored.stats.dev
    || reboundGeneration.stats.ino !== stored.stats.ino
  ) {
    fail(
      "unsafe_target",
      `generation ${generation} path changed during verification`,
    );
  }
  const reboundObject = await readOwnerFile(
    objectPath,
    `current-ref object ${ref.refId}`,
    [2],
  );
  if (
    reboundObject.text !== object.text
    || reboundObject.stats.dev !== object.stats.dev
    || reboundObject.stats.ino !== object.stats.ino
  ) {
    fail(
      "unsafe_target",
      `current-ref object ${ref.refId} path changed during verification`,
    );
  }
  claimedObjectNames?.add(reservation.objectName);
  return ref;
}

async function verifyBundleCached(
  runRoot: string,
  bundleId: string,
  cache: BundleCache,
): Promise<VerifiedTaskMapRefreshRunBundle> {
  assertBundleId(bundleId, "referenced bundleId");
  const cached = cache.get(bundleId);
  if (cached) return cached;
  if (
    cache.size
      >= TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxBundleCacheEntries
  ) {
    fail(
      "resource_limit",
      "current-ref bundle verification exceeds its distinct bundle bound",
    );
  }
  assertPristineBundleArrayRuntime("current-ref bundle verification");
  const verified = await verifyTaskMapRefreshRunBundle(
    path.join(runRoot, bundleId),
    bundleId,
  );
  let verifiedBytes =
    Buffer.byteLength(canonicalBytes(verified.manifest), "utf8")
    + Buffer.byteLength(canonicalBytes(verified.commitMarker), "utf8");
  for (
    let index = 0;
    index < verified.manifest.members.length;
    index += 1
  ) {
    verifiedBytes += verified.manifest.members[index].byteLength;
  }
  const priorVerifiedBytes = verifiedBundleBytesByCache.get(cache) ?? 0;
  if (
    priorVerifiedBytes + verifiedBytes
      > TASKMAP_REFRESH_CURRENT_LIMITS_V1
        .maxVerifiedBundleBytesPerOperation
  ) {
    fail(
      "resource_limit",
      "current-ref bundle verification exceeds its aggregate byte budget",
    );
  }
  verifiedBundleBytesByCache.set(
    cache,
    priorVerifiedBytes + verifiedBytes,
  );
  cache.set(bundleId, verified);
  return verified;
}

function checkpointRecordFor(
  bundle: VerifiedTaskMapRefreshRunBundle,
  checkpointDigest: string,
  bindingDigest?: string,
): TaskMapConnectorCheckpointV1 {
  const matches = filterArray(bundle.checkpoints.checkpoints, (record) => (
    record.checkpointDigest === checkpointDigest
    && (bindingDigest === undefined || record.bindingDigest === bindingDigest)
  ));
  if (matches.length !== 1) {
    fail(
      "checkpoint_replay_failed",
      "checkpoint digest is missing or ambiguous in its bundle",
    );
  }
  return assertTaskMapConnectorCheckpoint(matches[0].checkpoint);
}

function laneReferenceFor(
  bundle: VerifiedTaskMapRefreshRunBundle,
  checkpointDigest: string,
  sourceSliceDigest: string,
): TaskMapRefreshRunLaneReferenceV1 {
  const matches = filterArray(
    bundle.checkpoints.laneReferences,
    (reference) => (
    reference.checkpointDigest === checkpointDigest
    && reference.sourceSliceDigest === sourceSliceDigest
    ),
  );
  if (matches.length === 0) {
    fail(
      "checkpoint_replay_failed",
      "checkpoint/source-slice pair is absent from its bundle",
    );
  }
  return matches[0];
}

async function checkpointForHead(
  head: TaskMapRefreshCurrentConnectorHeadV1,
  runRoot: string,
  cache: BundleCache,
): Promise<TaskMapConnectorCheckpointV1> {
  const bundle = await verifyBundleCached(
    runRoot,
    head.latestCheckpoint.bundleId,
    cache,
  );
  laneReferenceFor(
    bundle,
    head.latestCheckpoint.checkpointDigest,
    head.latestCheckpoint.sourceSliceDigest,
  );
  return checkpointRecordFor(
    bundle,
    head.latestCheckpoint.checkpointDigest,
    head.bindingDigest,
  );
}

async function acceptedBaselinePredecessors(
  previous: TaskMapRefreshCurrentRefV1,
  history: readonly TaskMapRefreshCurrentRefV1[],
  candidate: VerifiedTaskMapRefreshRunBundle,
  runRoot: string,
  cache: BundleCache,
): Promise<Map<string, TaskMapConnectorCheckpointV1>> {
  const accepted = previous.accepted;
  if (!accepted || candidate.plan.baseline.kind !== "accepted") {
    fail("invalid_contract", "accepted baseline has no authoritative origin");
  }
  const originRecord = findArray(
    history,
    (record) => record.generation === accepted.originGeneration,
  );
  if (
    !originRecord
    || originRecord.operation !== "complete"
    || canonicalBytes(originRecord.accepted) !== canonicalBytes(accepted)
  ) {
    fail(
      "invalid_contract",
      "accepted origin generation is absent from contiguous history",
    );
  }
  const origin = await verifyBundleCached(
    runRoot,
    accepted.bundleId,
    cache,
  );
  if (
    origin.bundleId !== accepted.bundleId
    || origin.plan.planId !== accepted.planId
    || origin.batch.batchId !== accepted.batchId
    || origin.plan.candidateAcceptedStateDigest
      !== accepted.acceptedStateDigest
    || origin.batch.publication.state !== "complete"
  ) {
    fail("invalid_contract", "accepted origin bundle identity is inconsistent");
  }
  const baseline = candidate.plan.baseline;
  const baselineComponents = [
    baseline.acceptedSourceRevisions,
    baseline.acceptedSourceRevisionSets,
    baseline.acceptedSemanticInputDigests,
  ];
  const originComponents = [
    origin.plan.sourceRevisions,
    origin.plan.sourceRevisionSets,
    origin.plan.semanticInputDigests,
  ];
  const componentLabels = [
    "accepted source revisions",
    "accepted source revision sets",
    "accepted semantic inputs",
  ];
  for (let index = 0; index < baselineComponents.length; index += 1) {
    if (
      canonicalBytes(baselineComponents[index])
        !== canonicalBytes(originComponents[index])
    ) {
      fail(
        "invalid_contract",
        `${componentLabels[index]} do not match the accepted origin`,
      );
    }
  }
  if (
    baseline.priorAcceptedStateDigest !== accepted.acceptedStateDigest
    || baseline.priorOwnerScopeDigest !== previous.ownerScopeDigest
    || baseline.acceptedDeterministicReplayDigest
      !== origin.plan.deterministicReplayDigest
    || baseline.priorReviewedEvidenceDigest
      !== origin.plan.reviewedEvidenceDigest
    || baseline.priorPolicyBundleDigest !== origin.plan.policyBundleDigest
    || baseline.priorSemanticImplementationDigest
      !== origin.plan.semanticImplementationDigest
  ) {
    fail(
      "invalid_contract",
      "accepted semantic baseline closure does not match its origin",
    );
  }

  const artifacts = new Map<string, {
    artifact: {
      bindingDigest: string;
      checkpointDigest: string;
      sourceSliceDigest: string;
    };
    checkpoint: TaskMapConnectorCheckpointV1;
  }>();
  for (
    let index = 0;
    index < origin.checkpoints.laneReferences.length;
    index += 1
  ) {
    const reference = origin.checkpoints.laneReferences[index];
    const record = findArray(
      origin.checkpoints.checkpoints,
      (candidateRecord) => (
      candidateRecord.checkpointDigest === reference.checkpointDigest
      ),
    );
    if (!record) {
      fail("invalid_contract", "accepted origin checkpoint is missing");
    }
    if (artifacts.has(record.bindingDigest)) {
      fail(
        "invalid_contract",
        "accepted origin repeats a provider binding artifact",
      );
    }
    const sourceSlice = findArray(
      origin.checkpoints.sourceSlices,
      (slice) => (
      slice.sourceSliceDigest === reference.sourceSliceDigest
      && slice.bindingDigest === record.bindingDigest
      ),
    );
    if (!sourceSlice) {
      fail("invalid_contract", "accepted origin source slice is missing");
    }
    artifacts.set(record.bindingDigest, {
      artifact: {
        bindingDigest: record.bindingDigest,
        checkpointDigest: reference.checkpointDigest,
        sourceSliceDigest: reference.sourceSliceDigest,
      },
      checkpoint: assertTaskMapConnectorCheckpoint(record.checkpoint),
    });
  }
  const artifactValues = Array.from(artifacts.values());
  const authoritativeArtifacts = sortedArray(
    mapArray(artifactValues, (value) => value.artifact),
    (left, right) => compareText(
      left.bindingDigest,
      right.bindingDigest,
    ),
  );
  if (
    canonicalBytes(baseline.priorProviderArtifacts)
      !== canonicalBytes(authoritativeArtifacts)
    || canonicalBytes(baseline.priorCheckpointDigests)
      !== canonicalBytes(
        sortedArray(
          mapArray(
            authoritativeArtifacts,
            (artifact) => artifact.checkpointDigest,
          ),
          compareText,
        ),
      )
    || canonicalBytes(baseline.priorSourceSliceDigests)
      !== canonicalBytes(
        sortedArray(
          mapArray(
            authoritativeArtifacts,
            (artifact) => artifact.sourceSliceDigest,
          ),
          compareText,
        ),
      )
  ) {
    fail(
      "invalid_contract",
      "baseline provider artifacts do not match the accepted origin",
    );
  }
  const byLineage = new Map<string, TaskMapConnectorCheckpointV1>();
  for (const value of artifacts.values()) {
    const key = connectorKeyFor(value.checkpoint);
    if (byLineage.has(key)) {
      fail("invalid_contract", "accepted origin repeats a connector lineage");
    }
    byLineage.set(key, value.checkpoint);
  }
  return byLineage;
}

function acceptedSourceFactKey(revision: {
  bindingDigest: string;
  sourceIdentityDigest: string;
  sourceRevisionDigest: string;
}): string {
  return `${revision.bindingDigest}:${revision.sourceIdentityDigest}:`
    + revision.sourceRevisionDigest;
}

async function assertHistoricalAcceptedSourceFacts(
  history: readonly TaskMapRefreshCurrentRefV1[],
  candidate: VerifiedTaskMapRefreshRunBundle,
  runRoot: string,
  cache: BundleCache,
): Promise<void> {
  let ledger = acceptedSourceFactLedgers.get(cache);
  if (
    ledger === undefined
    || ledger.historyLength > history.length
    || (
      ledger.historyLength > 0
      && history[ledger.historyLength - 1]?.refId !== ledger.lastRefId
    )
  ) {
    ledger = {
      historyLength: 0,
      originBundleIds: new Set(),
      contentByRevision: new Map(),
    };
    acceptedSourceFactLedgers.set(cache, ledger);
  }
  for (
    let index = ledger.historyLength;
    index < history.length;
    index += 1
  ) {
    const record = history[index];
    const accepted = record.accepted;
    if (record.operation !== "complete") {
      ledger.historyLength = index + 1;
      ledger.lastRefId = record.refId;
      continue;
    }
    if (
      accepted === undefined
      || accepted.originGeneration !== record.generation
    ) {
      fail(
        "invalid_contract",
        "complete history record lacks a self-origin accepted state",
      );
    }
    if (ledger.originBundleIds.has(accepted.bundleId)) {
      ledger.historyLength = index + 1;
      ledger.lastRefId = record.refId;
      continue;
    }
    if (
      record.attempt?.bundleId !== accepted.bundleId
      || record.attempt.planId !== accepted.planId
      || record.attempt.batchId !== accepted.batchId
    ) {
      fail("invalid_contract", "accepted origin attempt identity is inconsistent");
    }
    const origin = await verifyBundleCached(
      runRoot,
      accepted.bundleId,
      cache,
    );
    if (
      origin.bundleId !== accepted.bundleId
      || origin.plan.planId !== accepted.planId
      || origin.batch.batchId !== accepted.batchId
      || origin.plan.candidateAcceptedStateDigest
        !== accepted.acceptedStateDigest
      || origin.batch.publication.state !== "complete"
    ) {
      fail("invalid_contract", "historical accepted origin is inconsistent");
    }
    for (
      let revisionIndex = 0;
      revisionIndex < origin.plan.sourceRevisions.length;
      revisionIndex += 1
    ) {
      const revision = origin.plan.sourceRevisions[revisionIndex];
      const key = acceptedSourceFactKey(revision);
      const priorContent = ledger.contentByRevision.get(key);
      if (
        priorContent !== undefined
        && priorContent !== revision.contentDigest
      ) {
        fail(
          "invalid_contract",
          "historical accepted source revision changes immutable content",
        );
      }
      ledger.contentByRevision.set(key, revision.contentDigest);
    }
    ledger.originBundleIds.add(accepted.bundleId);
    ledger.historyLength = index + 1;
    ledger.lastRefId = record.refId;
  }
  for (
    let revisionIndex = 0;
    revisionIndex < candidate.plan.sourceRevisions.length;
    revisionIndex += 1
  ) {
    const revision = candidate.plan.sourceRevisions[revisionIndex];
    const priorContent = ledger.contentByRevision.get(
      acceptedSourceFactKey(revision),
    );
    if (
      priorContent !== undefined
      && priorContent !== revision.contentDigest
    ) {
      fail(
        "invalid_contract",
        "candidate conflicts with immutable accepted source history",
      );
    }
  }
}

function publicationStateFor(
  bundle: VerifiedTaskMapRefreshRunBundle,
): TaskMapRefreshCurrentPublicationState {
  const state = bundle.batch.publication.state;
  if (state !== "complete" && state !== "no_op" && state !== "blocked") {
    fail(
      "invalid_contract",
      "only complete, no-op, or blocked refresh runs can advance attempt history",
    );
  }
  if (
    (state === "complete" && (
      bundle.plan.isExactNoOp
      || bundle.batch.publication.eligible
    ))
    || (state === "no_op" && (
      !bundle.plan.isExactNoOp
      || bundle.batch.publication.eligible
    ))
    || (state === "blocked" && bundle.batch.publication.eligible)
  ) {
    fail("invalid_contract", "refresh publication state is inconsistent");
  }
  return state;
}

async function derivePublicationRef(
  previous: TaskMapRefreshCurrentRefV1 | undefined,
  history: readonly TaskMapRefreshCurrentRefV1[],
  bundle: VerifiedTaskMapRefreshRunBundle,
  generation: string,
  runRoot: string,
  cache: BundleCache,
): Promise<TaskMapRefreshCurrentRefV1> {
  const publicationState = publicationStateFor(bundle);
  const baseline = bundle.plan.baseline;
  if (previous === undefined) {
    if (baseline.kind !== "genesis") {
      fail(
        "invalid_contract",
        "the first current generation requires a genesis refresh baseline",
      );
    }
  } else {
    if (bundle.plan.ownerScopeDigest !== previous.ownerScopeDigest) {
      fail("invalid_contract", "refresh run crosses owner scope");
    }
    if (previous.accepted === undefined) {
      if (baseline.kind !== "genesis") {
        fail(
          "invalid_contract",
          "pre-acceptance current history requires a genesis baseline",
        );
      }
    } else if (
      baseline.kind !== "accepted"
      || baseline.priorAcceptedStateDigest
        !== previous.accepted.acceptedStateDigest
      || baseline.priorOwnerScopeDigest !== previous.ownerScopeDigest
    ) {
      fail(
        "invalid_contract",
        "refresh baseline does not match the authoritative accepted head",
      );
    }
  }
  if (
    publicationState === "no_op"
    && (
      previous?.accepted === undefined
      || bundle.plan.candidateAcceptedStateDigest
        !== previous.accepted.acceptedStateDigest
    )
  ) {
    fail("invalid_contract", "no-op must preserve an existing accepted state");
  }
  if (
    baseline.kind === "accepted"
    && baseline.priorProviderArtifacts.length === 0
  ) {
    fail("invalid_contract", "accepted baseline has no provider history");
  }
  await assertHistoricalAcceptedSourceFacts(
    history,
    bundle,
    runRoot,
    cache,
  );

  const historicalPredecessors =
    baseline.kind === "accepted"
      ? await acceptedBaselinePredecessors(
          previous!,
          history,
          bundle,
          runRoot,
          cache,
        )
      : new Map<string, TaskMapConnectorCheckpointV1>();

  const headByKey =
    new Map<string, TaskMapRefreshCurrentConnectorHeadV1>();
  const previousHeads = previous?.connectorHeads ?? [];
  for (let index = 0; index < previousHeads.length; index += 1) {
    const head = previousHeads[index];
    headByKey.set(head.connectorKeyDigest, head);
  }
  const attemptedBindings = new Set<string>();
  const attemptReferences = filterArray(
    bundle.checkpoints.laneReferences,
    (reference) => reference.referenceKind === "attempt_output",
  );
  for (let index = 0; index < attemptReferences.length; index += 1) {
    const reference = attemptReferences[index];
    const record = findArray(
      bundle.checkpoints.checkpoints,
      (candidate) => (
      candidate.checkpointDigest === reference.checkpointDigest
      ),
    );
    if (!record) {
      fail("checkpoint_replay_failed", "attempt checkpoint is missing");
    }
    if (attemptedBindings.has(record.bindingDigest)) {
      fail(
        "checkpoint_replay_failed",
        "refresh run repeats a connector binding attempt",
      );
    }
    attemptedBindings.add(record.bindingDigest);
    const checkpoint = assertTaskMapConnectorCheckpoint(record.checkpoint);
    const sourceBinding = findArray(
      bundle.plan.sourceBindings,
      (binding) => (
      binding.bindingDigest === record.bindingDigest
      ),
    );
    if (
      !sourceBinding
      || sourceBinding.sourceKind !== checkpoint.sourceKind
      || sourceBinding.adapterVersion !== checkpoint.adapterVersion
    ) {
      fail(
        "checkpoint_replay_failed",
        "attempt checkpoint crosses its planned connector lineage",
      );
    }
    const connectorKeyDigest = connectorKeyFor(checkpoint);
    const currentHead = headByKey.get(connectorKeyDigest);
    const baselinePrevious =
      historicalPredecessors.get(connectorKeyDigest) ?? null;
    const poll = pollForCheckpoint(checkpoint);
    const transitionPrevious = currentHead === undefined
      ? baselinePrevious
      : await checkpointForHead(currentHead, runRoot, cache);
    let replayed: TaskMapConnectorCheckpointV1;
    try {
      replayed = advanceTaskMapConnectorCheckpoint(
        transitionPrevious,
        poll,
      );
    } catch {
      return fail(
        "checkpoint_replay_failed",
        "frozen checkpoint replay rejected the authoritative transition",
      );
    }
    if (!checkpointEquals(replayed, checkpoint)) {
      fail(
        "checkpoint_replay_failed",
        "attempt checkpoint differs from frozen authoritative replay",
      );
    }
    const latestCheckpoint: TaskMapRefreshCurrentConnectorArtifactV1 = {
      bundleId: bundle.bundleId,
      checkpointDigest: reference.checkpointDigest,
      sourceSliceDigest: reference.sourceSliceDigest,
    };
    headByKey.set(connectorKeyDigest, {
      connectorKeyDigest,
      bindingDigest: record.bindingDigest,
      sourceKind: checkpoint.sourceKind,
      adapterVersion: checkpoint.adapterVersion,
      latestCheckpoint,
      ...(checkpoint.state === "success"
        ? { lastGood: latestCheckpoint }
        : currentHead?.lastGood === undefined
          ? {}
          : { lastGood: currentHead.lastGood }),
    });
  }

  const accepted = publicationState === "complete"
    ? {
        acceptedStateDigest: bundle.plan.candidateAcceptedStateDigest,
        bundleId: bundle.bundleId,
        planId: bundle.plan.planId,
        batchId: bundle.batch.batchId,
        originGeneration: generation,
      }
    : previous?.accepted;
  return makeRef({
    generation,
    ...(previous === undefined ? {} : { predecessorRefId: previous.refId }),
    ownerScopeDigest: bundle.plan.ownerScopeDigest,
    operation: publicationState,
    attempt: {
      generation,
      bundleId: bundle.bundleId,
      planId: bundle.plan.planId,
      batchId: bundle.batch.batchId,
      publicationState,
      candidateAcceptedStateDigest:
        bundle.plan.candidateAcceptedStateDigest,
    },
    ...(accepted === undefined ? {} : { accepted }),
    connectorHeads: sortedArray(
      Array.from(headByKey.values()),
      (left, right) => (
        compareText(left.connectorKeyDigest, right.connectorKeyDigest)
      ),
    ),
  });
}

function deriveRollbackRef(
  previous: TaskMapRefreshCurrentRefV1,
  target: TaskMapRefreshCurrentRefV1,
  generation: string,
): TaskMapRefreshCurrentRefV1 {
  if (
    target.accepted === undefined
    || BigInt(target.generation) >= BigInt(generation)
    || target.ownerScopeDigest !== previous.ownerScopeDigest
  ) {
    fail("invalid_contract", "rollback target is not an accepted ancestor");
  }
  return makeRef({
    generation,
    predecessorRefId: previous.refId,
    ownerScopeDigest: previous.ownerScopeDigest,
    operation: "rollback",
    ...(previous.attempt === undefined ? {} : { attempt: previous.attempt }),
    accepted: target.accepted,
    connectorHeads: previous.connectorHeads,
    rollback: {
      targetGeneration: target.generation,
      targetRefId: target.refId,
      targetAcceptedStateDigest: target.accepted.acceptedStateDigest,
    },
  });
}

async function deriveStoredRef(
  stored: TaskMapRefreshCurrentRefV1,
  history: readonly TaskMapRefreshCurrentRefV1[],
  runRoot: string,
  cache: BundleCache,
): Promise<TaskMapRefreshCurrentRefV1> {
  const previous = lastArrayValue(history);
  if (stored.operation === "rollback") {
    if (!previous || !stored.rollback) {
      fail("invalid_contract", "rollback cannot be the first generation");
    }
    const target = findArray(
      history,
      (candidate) => (
        candidate.generation === stored.rollback!.targetGeneration
        && candidate.refId === stored.rollback!.targetRefId
      ),
    );
    if (!target) {
      fail("invalid_contract", "rollback target is not in contiguous history");
    }
    return deriveRollbackRef(previous, target, stored.generation);
  }
  if (!stored.attempt) {
    fail("invalid_contract", "publication generation has no attempt");
  }
  const bundle = await verifyBundleCached(
    runRoot,
    stored.attempt.bundleId,
    cache,
  );
  return derivePublicationRef(
    previous,
    history,
    bundle,
    stored.generation,
    runRoot,
    cache,
  );
}

function boundedUnknownNames(
  names: readonly string[],
  known: (name: string) => boolean,
): string[] {
  const sorted = sortedArray(
    filterArray(names, (name) => !known(name)),
    compareText,
  );
  const length = Math.min(
    sorted.length,
    TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxUnknownNames,
  );
  const bounded = new Array<string>(length);
  for (let index = 0; index < length; index += 1) {
    bounded[index] = sorted[index];
  }
  return bounded;
}

async function boundedDirectoryNames(
  checked: CheckedDirectory,
  label: string,
  maximumEntries: number =
    TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxDirectoryEntries,
): Promise<{ names: string[]; overflow: boolean }> {
  await revalidateDirectory(checked, label, "unsafe_target");
  let directory: Awaited<ReturnType<typeof opendir>> | undefined;
  const names: string[] = [];
  try {
    directory = await opendir(checked.directory);
    while (
      names.length <= maximumEntries
    ) {
      const entry = await directory.read();
      if (entry === null) break;
      names[names.length] = entry.name;
    }
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    fail("unsafe_target", `${label} cannot be listed safely`);
  } finally {
    await directory?.close().catch(() => undefined);
  }
  await revalidateDirectory(checked, label, "unsafe_target");
  const overflow = (
    names.length > maximumEntries
  );
  if (overflow) {
    names.length = maximumEntries;
  }
  return { names, overflow };
}

async function readTaskMapRefreshCurrentWithCache(
  currentRoot: string,
  runRoot: string,
  cache: BundleCache,
): Promise<TaskMapRefreshCurrentSnapshotV1> {
  const store = await openCurrentStore(currentRoot);
  await revalidateStore(store, "unsafe_target");
  let generationListing: Awaited<ReturnType<typeof boundedDirectoryNames>>;
  let objectListing: Awaited<ReturnType<typeof boundedDirectoryNames>>;
  try {
    generationListing = await boundedDirectoryNames(
      store.generations,
      "current-ref generations directory",
    );
    objectListing = await boundedDirectoryNames(
      store.objects,
      "current-ref objects directory",
      TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxObjectEntries,
    );
    await revalidateStore(store, "unsafe_target");
  } catch {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: generationFor(1n),
        code: "store_unavailable",
        detail: "current-ref store cannot be listed",
      },
      unknownGenerationNames: [],
      unknownObjectNames: [],
    };
  }
  const generationNames = generationListing.names;
  const objectNames = objectListing.names;
  const claimedObjectNames = new Set<string>();
  const currentUnknownObjectNames = (): string[] => boundedUnknownNames(
    objectNames,
    (name) => claimedObjectNames.has(name),
  );
  if (generationListing.overflow) {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: generationFor(1n),
        code: "generation_limit",
        detail: "current-ref store entry count exceeds its bound",
      },
      unknownGenerationNames: boundedUnknownNames(
        generationNames,
        (name) => GENERATION_NAME.test(name),
      ),
      unknownObjectNames: currentUnknownObjectNames(),
    };
  }
  const unknownGenerationNames = boundedUnknownNames(
    generationNames,
    (name) => GENERATION_NAME.test(name),
  );
  let unknownGenerationCount = 0;
  for (let index = 0; index < generationNames.length; index += 1) {
    if (!GENERATION_NAME.test(generationNames[index])) {
      unknownGenerationCount += 1;
    }
  }
  let unknownObjectNames = currentUnknownObjectNames();
  const canonical = sortedArray(
    filterArray(
      generationNames,
      (name) => GENERATION_NAME.test(name),
    ),
    compareText,
  );
  if (arrayIncludes(canonical, "00000000000000000000.ref")) {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: "00000000000000000000",
        code: "generation_corrupt",
        detail: "generation zero is never authoritative",
      },
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  if (canonical.length === 0) {
    if (
      objectListing.overflow
      || objectNames.length
        > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxUnknownNames
      || unknownGenerationCount
        > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxUnknownNames
    ) {
      return {
        status: "degraded",
        generations: [],
        fault: {
          generation: generationFor(1n),
          code: "generation_limit",
          detail: "current-ref structural diagnostics exceed their bound",
        },
        unknownGenerationNames,
        unknownObjectNames,
      };
    }
    return {
      status: "empty",
      generations: [],
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  if (canonical.length > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations) {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: generationFor(1n),
        code: "generation_limit",
        detail: "current-ref generation count exceeds its bound",
      },
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  const present = new Set<string>();
  for (let index = 0; index < canonical.length; index += 1) {
    present.add(canonical[index]);
  }
  const highestName = canonical[canonical.length - 1];
  const highest = BigInt(highestName.slice(0, -4));
  if (
    highest > BigInt(TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations)
  ) {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: highestName.slice(0, -4),
        code: "generation_limit",
        detail: "current-ref generation exceeds its supported bound",
      },
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  let aggregateHistoryBytes = 0n;
  try {
    await revalidateStore(store, "unsafe_target");
    for (let index = 0; index < canonical.length; index += 1) {
      const stats = await lstat(
        path.join(store.generations.directory, canonical[index]),
        { bigint: true },
      );
      aggregateHistoryBytes += stats.size;
      if (
        aggregateHistoryBytes
          > BigInt(TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes)
      ) {
        return {
          status: "degraded",
          generations: [],
          fault: {
            generation: canonical[index].slice(0, -4),
            code: "generation_limit",
            detail: "current-ref history exceeds its aggregate byte budget",
          },
          unknownGenerationNames,
          unknownObjectNames,
        };
      }
    }
    await revalidateStore(store, "unsafe_target");
  } catch {
    return {
      status: "degraded",
      generations: [],
      fault: {
        generation: generationFor(1n),
        code: "store_unavailable",
        detail: "current-ref history cannot be sized safely",
      },
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  const history: TaskMapRefreshCurrentRefV1[] = [];
  for (let value = 1n; value <= highest; value += 1n) {
    const generation = generationFor(value);
    const fileName = generationFileName(generation);
    if (!present.has(fileName)) {
      return {
        status: "degraded",
        ...(history.length === 0
          ? {}
          : { head: history[history.length - 1] }),
        generations: history,
        fault: {
          generation,
          code: "generation_hole",
          detail: "a higher canonical generation exists after a hole",
        },
        unknownGenerationNames,
        unknownObjectNames,
      };
    }
    try {
      await revalidateStore(store, "unsafe_target");
      const stored = await verifyStoredRef(
        store,
        generation,
        claimedObjectNames,
      );
      unknownObjectNames = currentUnknownObjectNames();
      const previous = lastArrayValue(history);
      if (
        (previous === undefined && stored.predecessorRefId !== undefined)
        || (
          previous !== undefined
          && stored.predecessorRefId !== previous.refId
        )
      ) {
        fail("invalid_contract", "current-ref predecessor chain is broken");
      }
      const expected = await deriveStoredRef(
        stored,
        history,
        runRoot,
        cache,
      );
      if (canonicalBytes(expected) !== canonicalBytes(stored)) {
        fail("invalid_contract", "stored current ref is not derivable");
      }
      history[history.length] = stored;
    } catch (error) {
      const resourceLimited = (
        error instanceof TaskMapRefreshCurrentError
        && error.code === "resource_limit"
      );
      return {
        status: "degraded",
        ...(history.length === 0
          ? {}
          : { head: history[history.length - 1] }),
        generations: history,
        fault: {
          generation,
          code: resourceLimited
            ? "generation_limit"
            : "generation_corrupt",
          detail: error instanceof Error
            ? error.message
            : "current generation validation failed",
        },
        unknownGenerationNames,
        unknownObjectNames,
      };
    }
  }
  let unknownObjectCount = 0;
  for (let index = 0; index < objectNames.length; index += 1) {
    if (!claimedObjectNames.has(objectNames[index])) {
      unknownObjectCount += 1;
    }
  }
  if (
    objectListing.overflow
    || unknownObjectCount
      > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxUnknownNames
    || unknownGenerationCount
      > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxUnknownNames
  ) {
    return {
      status: "degraded",
      ...(history.length === 0
        ? {}
        : { head: history[history.length - 1] }),
      generations: history,
      fault: {
        generation: lastArrayValue(history)?.generation ?? generationFor(1n),
        code: "generation_limit",
        detail: "current-ref structural diagnostics exceed their bound",
      },
      unknownGenerationNames,
      unknownObjectNames,
    };
  }
  return {
    status: "healthy",
    head: lastArrayValue(history),
    generations: history,
    unknownGenerationNames,
    unknownObjectNames,
  };
}

export async function readTaskMapRefreshCurrent(
  currentRoot: string,
  runRoot: string,
): Promise<TaskMapRefreshCurrentSnapshotV1> {
  return readTaskMapRefreshCurrentWithCache(
    currentRoot,
    runRoot,
    new Map(),
  );
}

function sha256Bytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function reservationNameFor(generation: string): string {
  return `${generation}.claim`;
}

function reservationIdentityNameFor(generation: string): string {
  return `${generation}.identity`;
}

function assertOwnerSymlinkStats(
  stats: BigIntStats,
  label: string,
): void {
  if (
    !stats.isSymbolicLink()
    || stats.uid !== BigInt(currentUid())
    || stats.nlink !== 1n
    || stats.size < 1n
    || stats.size > 4_096n
  ) {
    fail(
      "unsafe_target",
      `${label} must be a bounded same-owner reservation symlink`,
    );
  }
}

async function readStableReservationTarget(
  store: CurrentStore,
  name: string,
  label: string,
): Promise<string> {
  await revalidateDirectory(
    store.reservations,
    "current-ref reservations directory",
    "unsafe_target",
  );
  const targetPath = path.join(store.reservations.directory, name);
  let before: BigIntStats;
  let target: string;
  try {
    before = await lstat(targetPath, { bigint: true });
    assertOwnerSymlinkStats(before, label);
    target = await readlink(targetPath, { encoding: "utf8" });
    const after = await lstat(targetPath, { bigint: true });
    assertOwnerSymlinkStats(after, label);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      fail("unsafe_target", `${label} changed during validation`);
    }
  } catch (error) {
    if (error instanceof TaskMapRefreshCurrentError) throw error;
    if (errnoCode(error) === "ENOENT") throw error;
    return fail("unsafe_target", `${label} cannot be read safely`);
  }
  await revalidateDirectory(
    store.reservations,
    "current-ref reservations directory",
    "unsafe_target",
  );
  return target;
}

function normalizeReservationOrigin(
  value: unknown,
): TaskMapRefreshCurrentPendingOriginV1 {
  const base = assertExactKeys(
    value,
    ["kind"],
    ["bundleId", "targetGeneration", "targetRefId"],
    "current-ref reservation origin",
  );
  if (base.kind === "bundle") {
    if (
      base.targetGeneration !== undefined
      || base.targetRefId !== undefined
    ) {
      fail("invalid_contract", "bundle reservation origin is inconsistent");
    }
    assertBundleId(base.bundleId, "reservation origin bundleId");
    return { kind: "bundle", bundleId: base.bundleId };
  }
  if (base.kind === "rollback") {
    if (base.bundleId !== undefined) {
      fail("invalid_contract", "rollback reservation origin is inconsistent");
    }
    assertGeneration(
      base.targetGeneration,
      "reservation rollback target generation",
    );
    assertRefId(base.targetRefId, "reservation rollback target refId");
    return {
      kind: "rollback",
      targetGeneration: base.targetGeneration,
      targetRefId: base.targetRefId,
    };
  }
  return fail("invalid_contract", "reservation origin kind is invalid");
}

function normalizeReservation(value: unknown): CurrentReservationV1 {
  const snapshot = assertExactKeys(
    value,
    [
      "contractVersion",
      "operationToken",
      "expectedGeneration",
      "refId",
      "objectName",
      "origin",
    ],
    ["expectedPredecessorRefId"],
    "current-ref reservation",
  );
  if (
    snapshot.contractVersion !== RESERVATION_VERSION
    || typeof snapshot.operationToken !== "string"
    || !OPERATION_TOKEN.test(snapshot.operationToken)
    || typeof snapshot.expectedGeneration !== "string"
    || typeof snapshot.refId !== "string"
    || typeof snapshot.objectName !== "string"
    || (
      snapshot.expectedPredecessorRefId !== undefined
      && typeof snapshot.expectedPredecessorRefId !== "string"
    )
  ) {
    fail("invalid_contract", "current-ref reservation is invalid");
  }
  assertGeneration(
    snapshot.expectedGeneration,
    "reservation generation",
  );
  assertRefId(snapshot.refId, "reservation refId");
  if (snapshot.expectedPredecessorRefId !== undefined) {
    assertRefId(
      snapshot.expectedPredecessorRefId,
      "reservation predecessor refId",
    );
  }
  if (
    snapshot.objectName !== reservedObjectName(
      snapshot.refId,
      snapshot.operationToken,
    )
  ) {
    fail("invalid_contract", "reservation object name is inconsistent");
  }
  return deepFreeze({
    contractVersion: RESERVATION_VERSION,
    operationToken: snapshot.operationToken,
    expectedGeneration: snapshot.expectedGeneration,
    ...(snapshot.expectedPredecessorRefId === undefined
      ? {}
      : {
          expectedPredecessorRefId:
            snapshot.expectedPredecessorRefId,
        }),
    refId: snapshot.refId,
    objectName: snapshot.objectName,
    origin: normalizeReservationOrigin(snapshot.origin),
  });
}

function normalizeReservationIdentity(
  value: unknown,
): CurrentReservationIdentityV1 {
  const snapshot = assertExactKeys(
    value,
    [
      "contractVersion",
      "operationToken",
      "expectedGeneration",
      "refId",
      "objectName",
      "dev",
      "ino",
    ],
    [],
    "current-ref reservation identity",
  );
  if (
    snapshot.contractVersion !== RESERVATION_IDENTITY_VERSION
    || typeof snapshot.operationToken !== "string"
    || !OPERATION_TOKEN.test(snapshot.operationToken)
    || typeof snapshot.expectedGeneration !== "string"
    || typeof snapshot.refId !== "string"
    || typeof snapshot.objectName !== "string"
    || typeof snapshot.dev !== "string"
    || typeof snapshot.ino !== "string"
    || !/^(?:0|[1-9][0-9]*)$/.test(snapshot.dev)
    || !/^(?:0|[1-9][0-9]*)$/.test(snapshot.ino)
  ) {
    fail("invalid_contract", "current-ref reservation identity is invalid");
  }
  assertGeneration(
    snapshot.expectedGeneration,
    "reservation identity generation",
  );
  assertRefId(snapshot.refId, "reservation identity refId");
  if (
    snapshot.objectName !== reservedObjectName(
      snapshot.refId,
      snapshot.operationToken,
    )
  ) {
    fail(
      "invalid_contract",
      "reservation identity object name is inconsistent",
    );
  }
  return deepFreeze({
    contractVersion: RESERVATION_IDENTITY_VERSION,
    operationToken: snapshot.operationToken,
    expectedGeneration: snapshot.expectedGeneration,
    refId: snapshot.refId,
    objectName: snapshot.objectName,
    dev: snapshot.dev,
    ino: snapshot.ino,
  });
}

async function parseReservationTarget<T>(
  store: CurrentStore,
  name: string,
  label: string,
  normalize: (value: unknown) => T,
): Promise<T> {
  const target = await readStableReservationTarget(store, name, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(target);
  } catch {
    return fail("unsafe_target", `${label} is not canonical JSON`);
  }
  if (canonicalBytes(parsed) !== target) {
    fail("unsafe_target", `${label} is not canonical`);
  }
  return normalize(parsed);
}

async function pendingRecoveryForReservation(
  store: CurrentStore,
  reservation: CurrentReservationV1,
): Promise<TaskMapRefreshCurrentPendingRecoveryV1> {
  let state: TaskMapRefreshCurrentPendingRecoveryV1["state"] =
    "claim_only";
  try {
    await lstat(
      path.join(
        store.reservations.directory,
        reservationIdentityNameFor(reservation.expectedGeneration),
      ),
      { bigint: true },
    );
    state = "object_pending";
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") state = "object_pending";
  }
  if (state === "claim_only") {
    try {
      await lstat(
        path.join(store.objects.directory, reservation.objectName),
        { bigint: true },
      );
      state = "object_pending";
    } catch (error) {
      if (errnoCode(error) !== "ENOENT") state = "object_pending";
    }
  }
  try {
    await lstat(
      path.join(
        store.generations.directory,
        generationFileName(reservation.expectedGeneration),
      ),
      { bigint: true },
    );
    state = "generation_pending";
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") state = "generation_pending";
  }
  return deepFreeze({
    contractVersion: TASKMAP_REFRESH_CURRENT_PENDING_RECOVERY_VERSION,
    generation: reservation.expectedGeneration,
    ...(reservation.expectedPredecessorRefId === undefined
      ? {}
      : {
          expectedPredecessorRefId:
            reservation.expectedPredecessorRefId,
        }),
    refId: reservation.refId,
    origin: reservation.origin,
    state,
  });
}

async function ensureReservation(
  store: CurrentStore,
  ref: TaskMapRefreshCurrentRefV1,
  expectedPredecessorRefId: string | undefined,
  requestedOperationToken: string,
  origin: TaskMapRefreshCurrentPendingOriginV1,
  options: TaskMapRefreshCurrentWriteOptions,
): Promise<CurrentReservationV1> {
  const requested: CurrentReservationV1 = deepFreeze({
    contractVersion: RESERVATION_VERSION,
    operationToken: requestedOperationToken,
    expectedGeneration: ref.generation,
    ...(expectedPredecessorRefId === undefined
      ? {}
      : { expectedPredecessorRefId }),
    refId: ref.refId,
    objectName: reservedObjectName(ref.refId, requestedOperationToken),
    origin,
  });
  const name = reservationNameFor(ref.generation);
  const reservationPath = path.join(store.reservations.directory, name);
  let created = false;
  await revalidateStore(store, "unsafe_target");
  try {
    await symlink(canonicalBytes(requested), reservationPath);
    created = true;
  } catch (error) {
    if (errnoCode(error) !== "EEXIST") {
      fail("write_failed", "current-ref reservation link failed");
    }
  }
  const reservation = await parseReservationTarget(
    store,
    name,
    `reservation ${ref.generation}`,
    normalizeReservation,
  );
  if (
    reservation.expectedGeneration !== ref.generation
    || reservation.expectedPredecessorRefId
      !== expectedPredecessorRefId
    || reservation.refId !== ref.refId
    || canonicalBytes(reservation.origin) !== canonicalBytes(origin)
  ) {
    const pendingRecovery = await pendingRecoveryForReservation(
      store,
      reservation,
    );
    fail(
      "recovery_required",
      "the next generation has a pending immutable recovery origin",
      { pendingRecovery },
    );
  }
  if (created) {
    await injectFault(options, "after_reservation_link", undefined);
    await syncDirectory(
      store.reservations,
      "current-ref reservations directory",
    );
    await injectFault(
      options,
      "after_reservation_directory_sync",
      undefined,
    );
  }
  return reservation;
}

async function injectFault(
  options: TaskMapRefreshCurrentWriteOptions,
  point: TaskMapRefreshCurrentFaultPoint,
  receipt: TaskMapRefreshCurrentRecoveryReceiptV1 | undefined,
  committed = false,
): Promise<void> {
  try {
    await options.faultInjection?.(point);
  } catch (error) {
    failWithWriteContext(
      error,
      `current-ref fault injected at ${point}`,
      committed,
      receipt,
    );
  }
}

function assertExpectedHead(
  snapshot: TaskMapRefreshCurrentSnapshotV1,
  expectedGeneration: string,
  expectedRefId: string | undefined,
): void {
  assertGeneration(expectedGeneration, "expected generation", true);
  const actualGeneration = snapshot.head?.generation ?? "00000000000000000000";
  if (actualGeneration !== expectedGeneration) {
    fail("cas_conflict", "current generation changed before publication");
  }
  if (
    (snapshot.head === undefined && expectedRefId !== undefined)
    || (
      snapshot.head !== undefined
      && (
        expectedRefId === undefined
        || snapshot.head.refId !== expectedRefId
      )
    )
  ) {
    fail("cas_conflict", "current predecessor ref changed before publication");
  }
}

async function assertProspectiveResourceCapacity(
  snapshot: TaskMapRefreshCurrentSnapshotV1,
  ref: TaskMapRefreshCurrentRefV1,
  runRoot: string,
  cache: BundleCache,
): Promise<void> {
  if (snapshot.status === "degraded") {
    fail("degraded", "current-ref history is degraded");
  }
  if (
    snapshot.generations.length + 1
      > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations
  ) {
    fail(
      "resource_limit",
      "prospective current-ref history exceeds its generation bound",
    );
  }
  const refBytes = Buffer.byteLength(canonicalBytes(ref), "utf8");
  if (refBytes > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes) {
    fail("invalid_contract", "current ref exceeds its byte bound");
  }
  let aggregateHistoryBytes = refBytes;
  for (
    let index = 0;
    index < snapshot.generations.length;
    index += 1
  ) {
    aggregateHistoryBytes += Buffer.byteLength(
      canonicalBytes(snapshot.generations[index]),
      "utf8",
    );
    if (
      aggregateHistoryBytes
        > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxHistoryBytes
    ) {
      fail(
        "resource_limit",
        "prospective current-ref history exceeds its aggregate byte budget",
      );
    }
  }
  for (
    let index = 0;
    index < snapshot.generations.length;
    index += 1
  ) {
    const attempt = snapshot.generations[index].attempt;
    if (attempt !== undefined) {
      await verifyBundleCached(runRoot, attempt.bundleId, cache);
    }
  }
  if (ref.attempt !== undefined) {
    await verifyBundleCached(runRoot, ref.attempt.bundleId, cache);
  }
}

async function exactRetryResult(
  input: {
    currentRoot: string;
    runRoot: string;
    expectedGeneration: string;
    expectedRefId?: string;
  },
  snapshot: TaskMapRefreshCurrentSnapshotV1,
  derive: (
    prefix: readonly TaskMapRefreshCurrentRefV1[],
    generation: string,
  ) => Promise<TaskMapRefreshCurrentRefV1>,
): Promise<TaskMapRefreshCurrentWriteResult | undefined> {
  if (snapshot.status === "degraded") {
    fail("degraded", "current-ref history is degraded");
  }
  const expectedNext = nextGeneration(input.expectedGeneration);
  if (snapshot.head?.generation !== expectedNext) return undefined;
  const prefixLength = Math.max(0, snapshot.generations.length - 1);
  const prefix = new Array<TaskMapRefreshCurrentRefV1>(prefixLength);
  for (let index = 0; index < prefixLength; index += 1) {
    prefix[index] = snapshot.generations[index];
  }
  const prefixHead = lastArrayValue(prefix);
  if (
    (prefixHead?.generation ?? "00000000000000000000")
      !== input.expectedGeneration
    || (prefixHead?.refId ?? undefined) !== input.expectedRefId
  ) {
    return undefined;
  }
  const expected = await derive(prefix, expectedNext);
  if (canonicalBytes(expected) !== canonicalBytes(snapshot.head)) {
    return undefined;
  }
  return {
    status: "already_current",
    ref: snapshot.head,
    processCrashAtomic: true,
    powerLossDurabilityClaimed: false,
  };
}

async function writeContentObject(
  store: CurrentStore,
  ref: TaskMapRefreshCurrentRefV1,
  expectedPredecessorRefId: string | undefined,
  reservation: CurrentReservationV1,
  options: TaskMapRefreshCurrentWriteOptions,
): Promise<{
  path: string;
  receipt: TaskMapRefreshCurrentRecoveryReceiptV1;
}> {
  const objectName = reservation.objectName;
  const objectPath = path.join(store.objects.directory, objectName);
  const identityName = reservationIdentityNameFor(ref.generation);
  const identityPath = path.join(
    store.reservations.directory,
    identityName,
  );
  const bytes = Buffer.from(canonicalBytes(ref), "utf8");
  if (bytes.length > TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxRefBytes) {
    fail("invalid_contract", "current ref exceeds its byte bound");
  }
  let handle: FileHandle | undefined;
  let receipt: TaskMapRefreshCurrentRecoveryReceiptV1 | undefined;
  let observedCommitted = false;
  try {
    let identity: CurrentReservationIdentityV1 | undefined;
    try {
      identity = await parseReservationTarget(
        store,
        identityName,
        `reservation identity ${ref.generation}`,
        normalizeReservationIdentity,
      );
    } catch (error) {
      if (error instanceof TaskMapRefreshCurrentError) throw error;
      if (errnoCode(error) !== "ENOENT") throw error;
    }
    if (identity === undefined) {
      let createdObject = false;
      try {
        handle = await open(
          objectPath,
          FS_CONSTANTS.O_RDWR
            | FS_CONSTANTS.O_CREAT
            | FS_CONSTANTS.O_EXCL
            | FS_CONSTANTS.O_NOFOLLOW
            | FS_CONSTANTS.O_NONBLOCK,
          FILE_MODE,
        );
        createdObject = true;
      } catch (error) {
        if (errnoCode(error) !== "EEXIST") throw error;
        handle = await open(
          objectPath,
          FS_CONSTANTS.O_RDWR
            | FS_CONSTANTS.O_NOFOLLOW
            | FS_CONSTANTS.O_NONBLOCK,
        );
      }
      if (createdObject) {
        await handle.chmod(FILE_MODE);
      }
      const initial = await handle.stat({ bigint: true });
      assertOwnerFileStats(
        initial,
        "current-ref content object",
        [1],
        0,
      );
      const existingPrefix = Buffer.alloc(Number(initial.size));
      let prefixOffset = 0;
      while (prefixOffset < existingPrefix.length) {
        const result = await handle.read(
          existingPrefix,
          prefixOffset,
          existingPrefix.length - prefixOffset,
          prefixOffset,
        );
        if (result.bytesRead <= 0) {
          fail(
            "recovery_refused",
            "unjournaled claimed object read stalled",
          );
        }
        prefixOffset += result.bytesRead;
      }
      if (
        !existingPrefix.equals(
          bytes.subarray(0, existingPrefix.length),
        )
      ) {
        fail(
          "recovery_refused",
          "unjournaled claimed object is not a canonical byte prefix",
        );
      }
      await injectFault(
        options,
        "after_object_create_before_identity",
        undefined,
      );
      identity = deepFreeze({
        contractVersion: RESERVATION_IDENTITY_VERSION,
        operationToken: reservation.operationToken,
        expectedGeneration: ref.generation,
        refId: ref.refId,
        objectName,
        dev: initial.dev.toString(),
        ino: initial.ino.toString(),
      });
      try {
        await symlink(canonicalBytes(identity), identityPath);
      } catch (error) {
        if (errnoCode(error) !== "EEXIST") throw error;
        const racedIdentity = await parseReservationTarget(
          store,
          identityName,
          `reservation identity ${ref.generation}`,
          normalizeReservationIdentity,
        );
        if (canonicalBytes(racedIdentity) !== canonicalBytes(identity)) {
          fail(
            "recovery_refused",
            "reservation identity raced with another inode",
          );
        }
        identity = racedIdentity;
      }
      await injectFault(options, "after_object_identity_link", undefined);
      await syncDirectory(
        store.reservations,
        "current-ref reservations directory",
      );
    }
    if (
      identity.operationToken !== reservation.operationToken
      || identity.expectedGeneration !== reservation.expectedGeneration
      || identity.refId !== reservation.refId
      || identity.objectName !== reservation.objectName
    ) {
      fail(
        "recovery_refused",
        "content object identity does not match its reservation",
      );
    }
    if (handle === undefined) {
      handle = await open(
        objectPath,
        FS_CONSTANTS.O_RDWR
          | FS_CONSTANTS.O_NOFOLLOW
          | FS_CONSTANTS.O_NONBLOCK,
      );
    }
    receipt = deepFreeze({
      contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
      operationToken: reservation.operationToken,
      objectName,
      expectedGeneration: ref.generation,
      ...(expectedPredecessorRefId === undefined
        ? {}
        : { expectedPredecessorRefId }),
      refId: ref.refId,
      ref,
      rootDev: store.root.stats.dev.toString(),
      rootIno: store.root.stats.ino.toString(),
      dev: identity.dev,
      ino: identity.ino,
      byteLength: bytes.length,
      byteSha256: sha256Bytes(bytes),
    });
    await injectFault(options, "after_stage_create", receipt);
    const opened = await handle.stat({ bigint: true });
    assertOwnerFileStats(
      opened,
      "current-ref content object",
      [1, 2],
      0,
    );
    if (
      opened.dev.toString() !== identity.dev
      || opened.ino.toString() !== identity.ino
    ) {
      fail("recovery_refused", "journaled content object identity changed");
    }
    const existingBytes = Buffer.alloc(Number(opened.size));
    let existingOffset = 0;
    while (existingOffset < existingBytes.length) {
      const result = await handle.read(
        existingBytes,
        existingOffset,
        existingBytes.length - existingOffset,
        existingOffset,
      );
      if (result.bytesRead <= 0) {
        fail("recovery_refused", "journaled content object read stalled");
      }
      existingOffset += result.bytesRead;
    }
    if (!existingBytes.equals(bytes.subarray(0, existingBytes.length))) {
      fail(
        "recovery_refused",
        "journaled content object is not the canonical byte prefix",
      );
    }
    if (opened.nlink === 2n) {
      if (existingBytes.length !== bytes.length) {
        fail("recovery_refused", "committed content object cannot be partial");
      }
      const generationPeer = await readOwnerFile(
        path.join(
          store.generations.directory,
          generationFileName(ref.generation),
        ),
        `committed generation ${ref.generation}`,
        [2],
      );
      if (
        generationPeer.stats.dev !== opened.dev
        || generationPeer.stats.ino !== opened.ino
        || generationPeer.text !== canonicalBytes(ref)
      ) {
        fail(
          "recovery_refused",
          "second content-object link is not its exact generation peer",
        );
      }
      observedCommitted = true;
    }
    let offset = existingBytes.length;
    let firstWrite = true;
    while (offset < bytes.length) {
      const beforeWrite = await handle.stat({ bigint: true });
      assertOwnerFileStats(
        beforeWrite,
        "current-ref content object before write",
        [1, 2],
        0,
      );
      if (
        beforeWrite.dev.toString() !== identity.dev
        || beforeWrite.ino.toString() !== identity.ino
        || beforeWrite.size < BigInt(offset)
        || beforeWrite.size > BigInt(bytes.length)
      ) {
        fail(
          "recovery_refused",
          "journaled content object changed before recovery write",
        );
      }
      if (beforeWrite.size > BigInt(offset)) {
        const advancedLength = Number(beforeWrite.size) - offset;
        const advanced = Buffer.alloc(advancedLength);
        let advancedOffset = 0;
        while (advancedOffset < advanced.length) {
          const result = await handle.read(
            advanced,
            advancedOffset,
            advanced.length - advancedOffset,
            offset + advancedOffset,
          );
          if (result.bytesRead <= 0) {
            fail(
              "recovery_refused",
              "concurrent canonical-prefix read stalled",
            );
          }
          advancedOffset += result.bytesRead;
        }
        if (
          !advanced.equals(
            bytes.subarray(offset, Number(beforeWrite.size)),
          )
        ) {
          fail(
            "recovery_refused",
            "concurrent writer changed the canonical byte prefix",
          );
        }
        offset = Number(beforeWrite.size);
        continue;
      }
      if (beforeWrite.nlink === 2n) {
        const committedBytes = Buffer.alloc(bytes.length);
        let committedOffset = 0;
        while (committedOffset < committedBytes.length) {
          const result = await handle.read(
            committedBytes,
            committedOffset,
            committedBytes.length - committedOffset,
            committedOffset,
          );
          if (result.bytesRead <= 0) {
            fail(
              "recovery_refused",
              "concurrent committed object read stalled",
            );
          }
          committedOffset += result.bytesRead;
        }
        const generationPeer = await readOwnerFile(
          path.join(
            store.generations.directory,
            generationFileName(ref.generation),
          ),
          `committed generation ${ref.generation}`,
          [2],
        );
        if (
          !committedBytes.equals(bytes)
          || generationPeer.stats.dev !== beforeWrite.dev
          || generationPeer.stats.ino !== beforeWrite.ino
          || generationPeer.text !== canonicalBytes(ref)
        ) {
          fail(
            "recovery_refused",
            "concurrent second link is not the exact generation peer",
          );
        }
        observedCommitted = true;
        offset = bytes.length;
        break;
      }
      const remaining = bytes.length - offset;
      const writeLength = firstWrite && remaining > 1
        ? Math.max(1, Math.floor(remaining / 2))
        : remaining;
      const result = await handle.write(
        bytes,
        offset,
        writeLength,
        offset,
      );
      if (result.bytesWritten <= 0) {
        fail("write_failed", "current-ref object write stalled", {
          recoveryReceipt: receipt,
        });
      }
      offset += result.bytesWritten;
      if (firstWrite) {
        firstWrite = false;
        await injectFault(
          options,
          "after_object_partial_write",
          receipt,
        );
      }
    }
    await handle.sync();
    const finalStats = await handle.stat({ bigint: true });
    assertOwnerFileStats(
      finalStats,
      "current-ref content object",
      [1, 2],
    );
    if (
      finalStats.dev.toString() !== receipt.dev
      || finalStats.ino.toString() !== receipt.ino
      || finalStats.size !== BigInt(bytes.length)
    ) {
      fail("write_failed", "current-ref object identity changed", {
        recoveryReceipt: receipt,
      });
    }
    if (finalStats.nlink === 2n) {
      const generationPeer = await readOwnerFile(
        path.join(
          store.generations.directory,
          generationFileName(ref.generation),
        ),
        `committed generation ${ref.generation}`,
        [2],
      );
      if (
        generationPeer.stats.dev !== finalStats.dev
        || generationPeer.stats.ino !== finalStats.ino
        || generationPeer.text !== canonicalBytes(ref)
      ) {
        fail(
          "recovery_refused",
          "completed content object has an unknown second link",
        );
      }
      observedCommitted = true;
    }
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
        fail("write_failed", "current-ref object readback stalled", {
          recoveryReceipt: receipt,
        });
      }
      read += result.bytesRead;
    }
    if (
      !readback.equals(bytes)
      || sha256Bytes(readback) !== receipt.byteSha256
    ) {
      fail("write_failed", "current-ref object readback mismatched", {
        recoveryReceipt: receipt,
      });
    }
    await injectFault(options, "after_stage_sync", receipt);
    return { path: objectPath, receipt };
  } catch (error) {
    return failWithWriteContext(
      error,
      "current-ref object creation failed",
      observedCommitted,
      receipt,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function commitCandidate(
  currentRoot: string,
  runRoot: string,
  ref: TaskMapRefreshCurrentRefV1,
  expectedGeneration: string,
  expectedRefId: string | undefined,
  origin: TaskMapRefreshCurrentPendingOriginV1,
  options: TaskMapRefreshCurrentWriteOptions,
  cache: BundleCache,
): Promise<TaskMapRefreshCurrentWriteResult> {
  let recoveryReceipt: TaskMapRefreshCurrentRecoveryReceiptV1 | undefined;
  let committed = false;
  try {
    const store = await openCurrentStore(currentRoot);
    await revalidateStore(store, "unsafe_target");
    const initial = await readTaskMapRefreshCurrentWithCache(
      currentRoot,
      runRoot,
      cache,
    );
    if (initial.status === "degraded") {
      fail("degraded", "current-ref history degraded before publication");
    }
    if (
      initial.head?.generation === ref.generation
      && canonicalBytes(initial.head) === canonicalBytes(ref)
    ) {
      return {
        status: "already_current",
        ref: initial.head,
        processCrashAtomic: true,
        powerLossDurabilityClaimed: false,
      };
    }
    assertExpectedHead(initial, expectedGeneration, expectedRefId);
    await assertProspectiveResourceCapacity(
      initial,
      ref,
      runRoot,
      cache,
    );
    const operationToken = options.operationToken
      ?? randomBytes(16).toString("hex");
    const ambiguousObjectPath = path.join(
      store.objects.directory,
      refObjectName(ref.refId),
    );
    try {
      await lstat(ambiguousObjectPath, { bigint: true });
      fail(
        "unsafe_target",
        "unclaimed canonical object path is occupied",
      );
    } catch (error) {
      if (error instanceof TaskMapRefreshCurrentError) throw error;
      if (errnoCode(error) !== "ENOENT") throw error;
    }
    const reservation = await ensureReservation(
      store,
      ref,
      expectedRefId,
      operationToken,
      origin,
      options,
    );
    const objectPath = path.join(
      store.objects.directory,
      reservation.objectName,
    );
    const created = await writeContentObject(
      store,
      ref,
      expectedRefId,
      reservation,
      options,
    );
    recoveryReceipt = created.receipt;
    if (created.path !== objectPath) {
      fail("write_failed", "content object path changed during creation", {
        recoveryReceipt,
      });
    }
    await injectFault(
      options,
      "after_object_link",
      recoveryReceipt,
    );
    await syncDirectory(store.objects, "current-ref objects directory");
    await injectFault(
      options,
      "after_object_directory_sync",
      recoveryReceipt,
    );

    const object = await readOwnerFile(
      objectPath,
      `current-ref object ${ref.refId}`,
      [1, 2],
    );
    if (object.text !== canonicalBytes(ref)) {
      fail("unsafe_target", "current-ref object bytes changed before CAS");
    }
    if (
      object.stats.dev.toString() !== recoveryReceipt.dev
      || object.stats.ino.toString() !== recoveryReceipt.ino
    ) {
      fail(
        "unsafe_target",
        "current-ref object no longer matches its identity journal",
      );
    }
    if (object.stats.dev !== store.generations.stats.dev) {
      fail("invalid_root", "current-ref object and generation are cross-volume");
    }
    await revalidateStore(store, "unsafe_target");
    const before = await readTaskMapRefreshCurrentWithCache(
      currentRoot,
      runRoot,
      cache,
    );
    if (before.status === "degraded") {
      fail("degraded", "current-ref history degraded before CAS");
    }
    if (
      before.head?.generation === ref.generation
      && canonicalBytes(before.head) === canonicalBytes(ref)
    ) {
      return {
        status: "already_current",
        ref: before.head,
        processCrashAtomic: true,
        powerLossDurabilityClaimed: false,
      };
    }
    assertExpectedHead(before, expectedGeneration, expectedRefId);
    await assertProspectiveResourceCapacity(
      before,
      ref,
      runRoot,
      cache,
    );
    await injectFault(options, "before_generation_link", recoveryReceipt);
    await revalidateStore(store, "unsafe_target");
    const reservationBeforeLink = await parseReservationTarget(
      store,
      reservationNameFor(ref.generation),
      `reservation ${ref.generation}`,
      normalizeReservation,
    );
    const identityBeforeLink = await parseReservationTarget(
      store,
      reservationIdentityNameFor(ref.generation),
      `reservation identity ${ref.generation}`,
      normalizeReservationIdentity,
    );
    if (
      canonicalBytes(reservationBeforeLink) !== canonicalBytes(reservation)
      || identityBeforeLink.operationToken !== reservation.operationToken
      || identityBeforeLink.expectedGeneration !== ref.generation
      || identityBeforeLink.refId !== ref.refId
      || identityBeforeLink.objectName !== reservation.objectName
      || identityBeforeLink.dev !== recoveryReceipt.dev
      || identityBeforeLink.ino !== recoveryReceipt.ino
    ) {
      fail(
        "unsafe_target",
        "current-ref reservation changed before generation CAS",
      );
    }
    const objectBeforeLink = await readOwnerFile(
      objectPath,
      `current-ref object ${ref.refId}`,
      [1, 2],
    );
    if (
      objectBeforeLink.text !== canonicalBytes(ref)
      || objectBeforeLink.stats.dev !== object.stats.dev
      || objectBeforeLink.stats.ino !== object.stats.ino
      || objectBeforeLink.stats.dev.toString() !== recoveryReceipt.dev
      || objectBeforeLink.stats.ino.toString() !== recoveryReceipt.ino
    ) {
      fail("unsafe_target", "current-ref object changed before generation CAS");
    }
    if (objectBeforeLink.stats.nlink === 2n) {
      const raced = await readTaskMapRefreshCurrentWithCache(
        currentRoot,
        runRoot,
        cache,
      );
      if (
        raced.status !== "degraded"
        && raced.head?.generation === ref.generation
        && canonicalBytes(raced.head) === canonicalBytes(ref)
      ) {
        return {
          status: "already_current",
          ref: raced.head,
          processCrashAtomic: true,
          powerLossDurabilityClaimed: false,
        };
      }
      fail(
        "unsafe_target",
        "content object acquired an unknown link before generation CAS",
      );
    }
    const generationPath = path.join(
      store.generations.directory,
      generationFileName(ref.generation),
    );
    try {
      await link(objectPath, generationPath);
      committed = true;
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") {
        fail("write_failed", "current generation hardlink failed");
      }
      const current = await readTaskMapRefreshCurrentWithCache(
        currentRoot,
        runRoot,
        cache,
      );
      if (
        current.status !== "degraded"
        && current.head?.generation === ref.generation
        && canonicalBytes(current.head) === canonicalBytes(ref)
      ) {
        return {
          status: "already_current",
          ref: current.head,
          processCrashAtomic: true,
          powerLossDurabilityClaimed: false,
        };
      }
      fail("cas_conflict", "another current generation won the CAS");
    }
    await injectFault(
      options,
      "after_generation_link",
      recoveryReceipt,
      true,
    );
    await revalidateStore(store, "unsafe_target");
    await syncDirectory(
      store.generations,
      "current-ref generations directory",
    );
    await injectFault(
      options,
      "after_generation_directory_sync",
      recoveryReceipt,
      true,
    );
    const current = await readTaskMapRefreshCurrentWithCache(
      currentRoot,
      runRoot,
      cache,
    );
    if (
      current.status === "degraded"
      || current.head?.refId !== ref.refId
      || current.head.generation !== ref.generation
    ) {
      fail("write_failed", "published current generation failed validation");
    }
    await injectFault(
      options,
      "after_current_validation",
      recoveryReceipt,
      true,
    );
    return {
      status: "published",
      ref: current.head,
      processCrashAtomic: true,
      powerLossDurabilityClaimed: false,
    };
  } catch (error) {
    return failWithWriteContext(
      error,
      "current-ref publication failed",
      committed,
      recoveryReceipt,
    );
  }
}

export async function publishTaskMapRefreshRunCurrent(
  input: PublishTaskMapRefreshCurrentInput,
): Promise<TaskMapRefreshCurrentWriteResult> {
  assertPristineBundleArrayRuntime("current-ref publication");
  const command = snapshotPublishInput(input);
  assertBundleId(command.bundleId, "publication bundleId");
  assertGeneration(command.expectedGeneration, "expected generation", true);
  if (command.expectedRefId !== undefined) {
    assertRefId(command.expectedRefId, "expected current refId");
  }
  const cache: BundleCache = new Map();
  const snapshot = await readTaskMapRefreshCurrentWithCache(
    command.currentRoot,
    command.runRoot,
    cache,
  );
  if (snapshot.status === "degraded") {
    fail("degraded", "current-ref history is degraded");
  }
  const bundle = await verifyBundleCached(
    command.runRoot,
    command.bundleId,
    cache,
  );
  const derive = async (
    prefix: readonly TaskMapRefreshCurrentRefV1[],
    generation: string,
  ): Promise<TaskMapRefreshCurrentRefV1> => derivePublicationRef(
    lastArrayValue(prefix),
    prefix,
    bundle,
    generation,
    command.runRoot,
    cache,
  );
  const retry = await exactRetryResult(command, snapshot, derive);
  if (retry) return retry;
  assertExpectedHead(
    snapshot,
    command.expectedGeneration,
    command.expectedRefId,
  );
  const generation = nextGeneration(command.expectedGeneration);
  const ref = await derive(snapshot.generations, generation);
  await assertProspectiveResourceCapacity(
    snapshot,
    ref,
    command.runRoot,
    cache,
  );
  return commitCandidate(
    command.currentRoot,
    command.runRoot,
    ref,
    command.expectedGeneration,
    command.expectedRefId,
    { kind: "bundle", bundleId: command.bundleId },
    command.options ?? {},
    cache,
  );
}

export async function rollbackTaskMapRefreshCurrent(
  input: RollbackTaskMapRefreshCurrentInput,
): Promise<TaskMapRefreshCurrentWriteResult> {
  const command = snapshotRollbackInput(input);
  assertGeneration(command.targetGeneration, "rollback target generation");
  assertGeneration(command.expectedGeneration, "expected generation");
  assertRefId(command.expectedRefId, "expected current refId");
  const cache: BundleCache = new Map();
  const snapshot = await readTaskMapRefreshCurrentWithCache(
    command.currentRoot,
    command.runRoot,
    cache,
  );
  if (snapshot.status === "degraded") {
    fail("degraded", "current-ref history is degraded");
  }
  const derive = async (
    prefix: readonly TaskMapRefreshCurrentRefV1[],
    generation: string,
  ): Promise<TaskMapRefreshCurrentRefV1> => {
    const previous = lastArrayValue(prefix);
    if (!previous) {
      fail("invalid_contract", "rollback requires current history");
    }
    const target = findArray(
      prefix,
      (candidate) => candidate.generation === command.targetGeneration,
    );
    if (!target) {
      fail("invalid_contract", "rollback target is not a contiguous ancestor");
    }
    return deriveRollbackRef(previous, target, generation);
  };
  const retry = await exactRetryResult(command, snapshot, derive);
  if (retry) return retry;
  assertExpectedHead(
    snapshot,
    command.expectedGeneration,
    command.expectedRefId,
  );
  const generation = nextGeneration(command.expectedGeneration);
  const ref = await derive(snapshot.generations, generation);
  await assertProspectiveResourceCapacity(
    snapshot,
    ref,
    command.runRoot,
    cache,
  );
  return commitCandidate(
    command.currentRoot,
    command.runRoot,
    ref,
    command.expectedGeneration,
    command.expectedRefId,
    {
      kind: "rollback",
      targetGeneration: command.targetGeneration,
      targetRefId: ref.rollback!.targetRefId,
    },
    command.options ?? {},
    cache,
  );
}

export async function recoverTaskMapRefreshCurrentResidue(
  currentRoot: string,
  runRoot: string,
  receipt: TaskMapRefreshCurrentRecoveryReceiptV1,
): Promise<"recovered" | "already_complete"> {
  const receiptSnapshot = assertExactKeys(
    receipt,
    [
      "contractVersion",
      "operationToken",
      "objectName",
      "expectedGeneration",
      "refId",
      "ref",
      "rootDev",
      "rootIno",
      "dev",
      "ino",
      "byteLength",
      "byteSha256",
    ],
    ["expectedPredecessorRefId"],
    "current-ref recovery receipt",
  );
  const receiptFields =
    receiptSnapshot as unknown as TaskMapRefreshCurrentRecoveryReceiptV1;
  if (
    receiptFields.contractVersion !== TASKMAP_REFRESH_CURRENT_REF_VERSION
    || typeof receiptFields.operationToken !== "string"
    || !OPERATION_TOKEN.test(receiptFields.operationToken)
    || typeof receiptFields.rootDev !== "string"
    || !/^[0-9]+$/.test(receiptFields.rootDev)
    || typeof receiptFields.rootIno !== "string"
    || !/^[0-9]+$/.test(receiptFields.rootIno)
    || typeof receiptFields.dev !== "string"
    || !/^[0-9]+$/.test(receiptFields.dev)
    || typeof receiptFields.ino !== "string"
    || !/^[0-9]+$/.test(receiptFields.ino)
  ) {
    fail("recovery_refused", "recovery receipt identity is invalid");
  }
  assertGeneration(
    receiptFields.expectedGeneration,
    "recovery generation",
  );
  assertRefId(receiptFields.refId, "recovery refId");
  if (receiptFields.expectedPredecessorRefId !== undefined) {
    assertRefId(
      receiptFields.expectedPredecessorRefId,
      "recovery predecessor refId",
    );
  }
  const ref = normalizeCurrentRef(receiptFields.ref);
  const normalizedReceipt: TaskMapRefreshCurrentRecoveryReceiptV1 =
    deepFreeze({
      contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
      operationToken: receiptFields.operationToken,
      objectName: receiptFields.objectName,
      expectedGeneration: receiptFields.expectedGeneration,
      ...(receiptFields.expectedPredecessorRefId === undefined
        ? {}
        : {
            expectedPredecessorRefId:
              receiptFields.expectedPredecessorRefId,
          }),
      refId: receiptFields.refId,
      ref,
      rootDev: receiptFields.rootDev,
      rootIno: receiptFields.rootIno,
      dev: receiptFields.dev,
      ino: receiptFields.ino,
      byteLength: receiptFields.byteLength,
      byteSha256: receiptFields.byteSha256,
    });
  const expectedObjectName = reservedObjectName(
    ref.refId,
    normalizedReceipt.operationToken,
  );
  const expectedBytes = Buffer.from(canonicalBytes(ref), "utf8");
  if (
    normalizedReceipt.objectName !== expectedObjectName
    || normalizedReceipt.refId !== ref.refId
    || normalizedReceipt.expectedGeneration !== ref.generation
    || normalizedReceipt.expectedPredecessorRefId !== ref.predecessorRefId
    || normalizedReceipt.byteLength !== expectedBytes.length
    || normalizedReceipt.byteSha256 !== sha256Bytes(expectedBytes)
  ) {
    fail("recovery_refused", "recovery receipt does not close over the ref");
  }
  let observedCommitted = false;
  try {
    const observationStore = await recoveryObservationStore(currentRoot);
    const possibleObjectPath = path.join(
      observationStore.objects.directory,
      expectedObjectName,
    );
    const possibleGenerationPath = path.join(
      observationStore.generations.directory,
      generationFileName(ref.generation),
    );
    const [possibleObject, possibleGeneration] = await Promise.all([
      readRecoveryObservationFile(
        possibleObjectPath,
        `possible committed current-ref object ${ref.refId}`,
        expectedBytes.length,
      ),
      readRecoveryObservationFile(
        possibleGenerationPath,
        `possible committed generation ${ref.generation}`,
        expectedBytes.length,
      ),
    ]);
    await revalidateRecoveryObservationStore(observationStore);
    if (
      observationStore.root.stats.dev.toString()
        === normalizedReceipt.rootDev
      && observationStore.root.stats.ino.toString()
        === normalizedReceipt.rootIno
      && possibleObject.stats.dev.toString() === normalizedReceipt.dev
      && possibleObject.stats.ino.toString() === normalizedReceipt.ino
      && possibleGeneration.stats.dev === possibleObject.stats.dev
      && possibleGeneration.stats.ino === possibleObject.stats.ino
      && possibleObject.text === expectedBytes.toString("utf8")
      && possibleGeneration.text === possibleObject.text
    ) {
      observedCommitted = true;
    }
  } catch {
    // The trusted-store open below owns authoritative validation.
  }
  let store: CurrentStore;
  try {
    store = await openCurrentStore(currentRoot);
  } catch (error) {
    return failWithWriteContext(
      error,
      "current-ref store cannot be opened during recovery",
      observedCommitted,
      normalizedReceipt,
    );
  }
  if (
    store.root.stats.dev.toString() !== normalizedReceipt.rootDev
    || store.root.stats.ino.toString() !== normalizedReceipt.rootIno
  ) {
    fail(
      "recovery_refused",
      "recovery receipt belongs to a different current-ref root",
      {
        committed: observedCommitted,
        recoveryReceipt: normalizedReceipt,
      },
    );
  }
  const objectPath = path.join(
    store.objects.directory,
    normalizedReceipt.objectName,
  );
  const generationPath = path.join(
    store.generations.directory,
    generationFileName(ref.generation),
  );
  const verifyExactGenerationPeer = async (
    objectStats: BigIntStats,
    objectText: string,
  ): Promise<void> => {
    const generationPeer = await readOwnerFile(
      generationPath,
      `committed generation ${ref.generation}`,
      [2],
    );
    if (
      generationPeer.stats.dev !== objectStats.dev
      || generationPeer.stats.ino !== objectStats.ino
      || generationPeer.text !== objectText
      || generationPeer.text !== expectedBytes.toString("utf8")
    ) {
      fail(
        "recovery_refused",
        "recovery object second link is not its exact generation peer",
      );
    }
  };
  try {
    const possibleCommittedObject = await readOwnerFile(
      objectPath,
      `possible committed current-ref object ${ref.refId}`,
      [1, 2],
    );
    if (
      possibleCommittedObject.stats.nlink === 2n
      && possibleCommittedObject.stats.dev.toString()
        === normalizedReceipt.dev
      && possibleCommittedObject.stats.ino.toString()
        === normalizedReceipt.ino
      && possibleCommittedObject.text === expectedBytes.toString("utf8")
    ) {
      await verifyExactGenerationPeer(
        possibleCommittedObject.stats,
        possibleCommittedObject.text,
      );
      observedCommitted = true;
    }
  } catch {
    // Full receipt, journal, mode, link-count, and byte validation follows.
  }
  let reservation: CurrentReservationV1;
  let identity: CurrentReservationIdentityV1;
  const expectedOrigin: TaskMapRefreshCurrentPendingOriginV1 =
    ref.operation === "rollback"
      ? {
          kind: "rollback",
          targetGeneration: ref.rollback!.targetGeneration,
          targetRefId: ref.rollback!.targetRefId,
        }
      : {
          kind: "bundle",
          bundleId: ref.attempt!.bundleId,
        };
  try {
    reservation = await parseReservationTarget(
      store,
      reservationNameFor(ref.generation),
      `reservation ${ref.generation}`,
      normalizeReservation,
    );
    identity = await parseReservationTarget(
      store,
      reservationIdentityNameFor(ref.generation),
      `reservation identity ${ref.generation}`,
      normalizeReservationIdentity,
    );
    if (
      reservation.operationToken !== normalizedReceipt.operationToken
      || reservation.expectedGeneration !== ref.generation
      || reservation.expectedPredecessorRefId !== ref.predecessorRefId
      || reservation.refId !== ref.refId
      || reservation.objectName !== expectedObjectName
      || canonicalBytes(reservation.origin)
        !== canonicalBytes(expectedOrigin)
      || identity.operationToken !== reservation.operationToken
      || identity.expectedGeneration !== reservation.expectedGeneration
      || identity.refId !== reservation.refId
      || identity.objectName !== reservation.objectName
      || identity.dev !== normalizedReceipt.dev
      || identity.ino !== normalizedReceipt.ino
    ) {
      fail(
        "recovery_refused",
        "recovery receipt does not match its durable reservation journal",
      );
    }
  } catch (error) {
    const journalError = (
      error instanceof TaskMapRefreshCurrentError
      && error.code === "recovery_refused"
    )
      ? error
      : new TaskMapRefreshCurrentError(
          "recovery_refused",
          "recovery reservation journal is unavailable or invalid",
          {
            committed: (
              error instanceof TaskMapRefreshCurrentError
              && error.committed
            ),
            ...(error instanceof TaskMapRefreshCurrentError
              && error.recoveryReceipt !== undefined
              ? { recoveryReceipt: error.recoveryReceipt }
              : {}),
          },
        );
    return failWithWriteContext(
      journalError,
      "current-ref recovery journal validation failed",
      observedCommitted,
      normalizedReceipt,
    );
  }
  let stats: BigIntStats;
  try {
    try {
      stats = await lstat(objectPath, { bigint: true });
    } catch (error) {
      if (errnoCode(error) === "ENOENT") {
        fail("recovery_refused", "owned content object is absent");
      }
      fail("recovery_refused", "owned residue cannot be inspected");
    }
    assertOwnerFileStats(
      stats,
      "owned current-ref residue",
      [1, 2],
      0,
    );
    if (
      stats.dev.toString() !== normalizedReceipt.dev
      || stats.ino.toString() !== normalizedReceipt.ino
      || stats.size > BigInt(expectedBytes.length)
    ) {
      fail("recovery_refused", "owned residue identity does not match receipt");
    }
    if (stats.nlink === 2n) {
      const initialObject = await readOwnerFile(
        objectPath,
        `recovered current-ref object ${ref.refId}`,
        [2],
      );
      if (
        initialObject.stats.dev.toString() !== normalizedReceipt.dev
        || initialObject.stats.ino.toString() !== normalizedReceipt.ino
        || initialObject.text !== expectedBytes.toString("utf8")
      ) {
        fail("recovery_refused", "owned object changed before recovery");
      }
      await verifyExactGenerationPeer(
        initialObject.stats,
        initialObject.text,
      );
      observedCommitted = true;
    }
  } catch (error) {
    const recoveryError = (
      error instanceof TaskMapRefreshCurrentError
      && error.code === "unsafe_target"
    )
      ? new TaskMapRefreshCurrentError(
          "recovery_refused",
          error.message,
          {
            committed: error.committed,
            ...(error.recoveryReceipt === undefined
              ? {}
              : { recoveryReceipt: error.recoveryReceipt }),
          },
        )
      : error;
    return failWithWriteContext(
      recoveryError,
      "current-ref recovery precondition failed",
      observedCommitted,
      normalizedReceipt,
    );
  }
  let snapshot: TaskMapRefreshCurrentSnapshotV1;
  try {
    snapshot = await readTaskMapRefreshCurrent(currentRoot, runRoot);
  } catch (error) {
    return failWithWriteContext(
      error,
      "current-ref history cannot be read during recovery",
      observedCommitted,
      normalizedReceipt,
    );
  }
  let historyShowsCommit = false;
  for (
    let index = 0;
    index < snapshot.generations.length;
    index += 1
  ) {
    const candidate = snapshot.generations[index];
    if (
      candidate.generation === ref.generation
      && candidate.refId === ref.refId
      && canonicalBytes(candidate) === canonicalBytes(ref)
    ) {
      historyShowsCommit = true;
      break;
    }
  }
  if (historyShowsCommit && !observedCommitted) {
    try {
      const committedObject = await readOwnerFile(
        objectPath,
        `committed recovered object ${ref.refId}`,
        [2],
      );
      if (
        committedObject.stats.dev.toString() !== normalizedReceipt.dev
        || committedObject.stats.ino.toString() !== normalizedReceipt.ino
        || committedObject.text !== expectedBytes.toString("utf8")
      ) {
        fail(
          "recovery_refused",
          "committed recovery object changed after history validation",
        );
      }
      await verifyExactGenerationPeer(
        committedObject.stats,
        committedObject.text,
      );
      observedCommitted = true;
    } catch (error) {
      return failWithWriteContext(
        error,
        "committed recovery storage validation failed",
        true,
        normalizedReceipt,
      );
    }
  }
  if (snapshot.status === "degraded") {
    fail(
      "recovery_refused",
      "degraded current history blocks recovery",
      {
        committed: observedCommitted,
        recoveryReceipt: normalizedReceipt,
      },
    );
  }
  const predecessorGeneration =
    snapshot.generations.length === 0
      ? "00000000000000000000"
      : snapshot.head!.generation;
  const isBeforeCommit = (
    predecessorGeneration
      === (ref.generation === generationFor(1n)
        ? "00000000000000000000"
        : generationFor(BigInt(ref.generation) - 1n))
    && snapshot.head?.refId === ref.predecessorRefId
  );
  if (!isBeforeCommit && !historyShowsCommit) {
    fail(
      "recovery_refused",
      "current head moved beyond the recovery receipt",
      {
        committed: observedCommitted,
        recoveryReceipt: normalizedReceipt,
      },
    );
  }
  if (observedCommitted && !historyShowsCommit) {
    fail(
      "recovery_refused",
      "exact committed generation is absent from healthy current history",
      {
        committed: true,
        recoveryReceipt: normalizedReceipt,
      },
    );
  }
  const initiallyComplete = stats.size === BigInt(expectedBytes.length);
  try {
    await writeContentObject(
      store,
      ref,
      ref.predecessorRefId,
      reservation,
      {},
    );
    let finalObject = await readOwnerFile(
      objectPath,
      `recovered current-ref object ${ref.refId}`,
      [1, 2],
    );
    const assertFinalObject = (): void => {
      if (
        finalObject.stats.dev.toString() !== normalizedReceipt.dev
        || finalObject.stats.ino.toString() !== normalizedReceipt.ino
        || finalObject.text !== expectedBytes.toString("utf8")
      ) {
        fail("recovery_refused", "owned object changed during recovery");
      }
    };
    assertFinalObject();
    if (finalObject.stats.nlink === 2n) {
      await verifyExactGenerationPeer(
        finalObject.stats,
        finalObject.text,
      );
      observedCommitted = true;
    }

    let finalSnapshot = await readTaskMapRefreshCurrent(
      currentRoot,
      runRoot,
    );
    if (finalSnapshot.status === "degraded") {
      fail("recovery_refused", "recovered current history is degraded");
    }
    let storedGeneration = findArray(
      finalSnapshot.generations,
      (candidate) => candidate.generation === ref.generation,
    );
    if (
      storedGeneration !== undefined
      && canonicalBytes(storedGeneration) !== canonicalBytes(ref)
    ) {
      fail(
        "recovery_refused",
        "recovery generation contains a different current ref",
      );
    }
    if (storedGeneration !== undefined && !observedCommitted) {
      finalObject = await readOwnerFile(
        objectPath,
        `recovered current-ref object ${ref.refId}`,
        [2],
      );
      assertFinalObject();
      await verifyExactGenerationPeer(
        finalObject.stats,
        finalObject.text,
      );
      observedCommitted = true;
    }

    if (!observedCommitted) {
      const expectedPredecessorGeneration = ref.generation === generationFor(1n)
        ? "00000000000000000000"
        : generationFor(BigInt(ref.generation) - 1n);
      if (
        (finalSnapshot.head?.generation ?? "00000000000000000000")
          !== expectedPredecessorGeneration
        || finalSnapshot.head?.refId !== ref.predecessorRefId
      ) {
        fail(
          "recovery_refused",
          "current head changed before recovery completed",
        );
      }
      finalObject = await readOwnerFile(
        objectPath,
        `recovered current-ref object ${ref.refId}`,
        [1, 2],
      );
      assertFinalObject();
      if (finalObject.stats.nlink === 2n) {
        await verifyExactGenerationPeer(
          finalObject.stats,
          finalObject.text,
        );
        observedCommitted = true;
        finalSnapshot = await readTaskMapRefreshCurrent(
          currentRoot,
          runRoot,
        );
        if (finalSnapshot.status === "degraded") {
          fail(
            "recovery_refused",
            "committed recovery history is degraded",
          );
        }
        storedGeneration = findArray(
          finalSnapshot.generations,
          (candidate) => candidate.generation === ref.generation,
        );
        if (
          storedGeneration === undefined
          || canonicalBytes(storedGeneration) !== canonicalBytes(ref)
        ) {
          fail(
            "recovery_refused",
            "committed recovery is absent from current history",
          );
        }
      }
    }

    if (observedCommitted) {
      await revalidateStore(store, "recovery_refused");
      finalObject = await readOwnerFile(
        objectPath,
        `committed recovered object ${ref.refId}`,
        [2],
      );
      assertFinalObject();
      await verifyExactGenerationPeer(
        finalObject.stats,
        finalObject.text,
      );
    }
    await syncDirectory(store.objects, "current-ref objects directory");
    return observedCommitted || initiallyComplete
      ? "already_complete"
      : "recovered";
  } catch (error) {
    return failWithWriteContext(
      error,
      "current-ref recovery failed",
      observedCommitted,
      normalizedReceipt,
    );
  }
}
