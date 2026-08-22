import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  assertOwnerSafeOuraTaskMapContext,
  fetchOuraTaskMapContext,
  type FetchOuraTaskMapContextOptions,
  type OuraTaskMapBodyCategory,
  type OuraTaskMapContextDocument,
} from "../../health/oura-taskmap-context.js";
import type {
  TaskMapNativeSemanticEvidenceBindingV1,
  TaskMapNativeSemanticSourceBindingV1,
} from "./native-semantic-builder-adapter.js";
import type { TaskMapNativeSafeSlice } from "./native-refresh-service.js";
import type { TaskMapOwnerCollectedSlice } from "./owner-refresh-coordinator.js";
import { taskMapContractDigest } from "./source-contracts.js";
import type {
  TaskMapEvent,
  TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION =
  "taskmap-physiological-source-snapshot.v1" as const;
export const TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION =
  "taskmap-physiological-source-producer.1" as const;
export const TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS =
  4 * 60 * 60 * 1_000;
export const TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS = 90;
export const TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1 = Object.freeze({
  maximumHistoryDays: 90,
  maximumFileBytes: 128 * 1_024,
  maximumSourceRecordCount: 10_000_000,
} as const);

const DAY_MS = 24 * 60 * 60 * 1_000;
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z][a-z0-9_]{1,31}_[a-f0-9]{16}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARACTER =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const PROVIDER_BINDING_DOMAIN =
  "taskmap-physiological-owner-local-provider-binding.1";
const SEMANTIC_POINTER_DOMAIN =
  "taskmap-physiological-semantic-pointer.1";
const SEMANTIC_EVENT_DOMAIN =
  "taskmap-physiological-semantic-event.1";
const SAFE_RECORD_DOMAIN =
  "taskmap-physiological-native-safe-record.1";

export interface TaskMapPhysiologicalSourceSnapshotV1 {
  contractVersion: typeof TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION;
  ownerScopeDigest: string;
  snapshotId: string;
  snapshotDigest: string;
  producerVersion: typeof TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION;
  sourceFamily: "physiological";
  producedAt: string;
  validThrough: string;
  readReceipt: {
    mode: "live_provider_read";
    outcome: "succeeded";
    requestedAt: string;
    completedAt: string;
    sourceObservedAt: string;
    providerBindingDigest: string;
    safeContextDigest: string;
  };
  coverage: {
    startDay: string;
    endDay: string;
    observedDays: number;
    classifiedDays: number;
    unknownDays: number;
    sourceRecordCount: number;
  };
  days: Array<{
    dayKey: string;
    axis: "composite_recovery";
    category: OuraTaskMapBodyCategory;
  }>;
  privacy: {
    rawBiometricsStored: false;
    sourceBodiesStored: false;
    localPathsStored: false;
    credentialsStored: false;
  };
}

export type TaskMapPhysiologicalSourceFreshnessDecision =
  | "fresh"
  | "boundary_due"
  | "stale"
  | "missing"
  | "unknown_version"
  | "malformed";

export interface TaskMapPhysiologicalSourceAssessmentV1 {
  decision: TaskMapPhysiologicalSourceFreshnessDecision;
  eligibleForCurrentRefresh: boolean;
  assessedAt: string;
  snapshot: TaskMapPhysiologicalSourceSnapshotV1 | null;
  detailCode:
    | "within_four_hour_half_open_interval"
    | "four_hour_boundary_due"
    | "four_hour_max_age_exceeded"
    | "assessment_precedes_production"
    | "unsupported_snapshot_or_producer_version"
    | "snapshot_contract_validation_failed"
    | "snapshot_file_missing"
    | "snapshot_path_invalid"
    | "snapshot_file_authentication_failed"
    | "snapshot_file_changed_during_read"
    | "snapshot_json_parse_failed"
    | "snapshot_serialization_noncanonical"
    | "snapshot_file_open_failed";
}

export type TaskMapPhysiologicalSourceFailureCode =
  | "invalid_request"
  | "provider_error"
  | "publication_error"
  | "snapshot_not_fresh";

export class TaskMapPhysiologicalSourceUnavailableError extends Error {
  constructor(readonly code: TaskMapPhysiologicalSourceFailureCode) {
    super(`Task Map physiological source unavailable: ${code}`);
    this.name = "TaskMapPhysiologicalSourceUnavailableError";
  }
}

export type TaskMapPhysiologicalProviderReader = (
  options: FetchOuraTaskMapContextOptions,
) => Promise<OuraTaskMapContextDocument>;

export interface RefreshTaskMapPhysiologicalSourceSnapshotOptions {
  outputPath: string;
  ownerScopeDigest: string;
  /**
   * A current authenticated snapshot is reused until its half-open validity
   * interval ends. Force is reserved for an explicit operator refresh.
   */
  force?: boolean;
  historyDays?: number;
  clock?: () => Date;
  readProviderContext?: TaskMapPhysiologicalProviderReader;
}

export interface TaskMapPhysiologicalSemanticContextV1 {
  pointers: TaskMapSourcePointer[];
  events: TaskMapEvent[];
  sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
  evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains an unexpected field`);
  }
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || CONTROL_CHARACTER.test(value)) {
    throw new Error(`${label} must be a canonical timestamp`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical timestamp`);
  }
  return value;
}

function clockTimestamp(clock: () => Date): string {
  let value: Date;
  try {
    value = clock();
  } catch {
    throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
  }
  return value.toISOString();
}

function dayTimestamp(day: unknown, label: string): number {
  if (typeof day !== "string" || !DAY_KEY.test(day)) {
    throw new Error(`${label} must be a real day`);
  }
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed)
    || new Date(parsed).toISOString().slice(0, 10) !== day
  ) {
    throw new Error(`${label} must be a real day`);
  }
  return parsed;
}

function inclusiveDays(startDay: string, endDay: string): string[] {
  const startMs = dayTimestamp(startDay, "coverage startDay");
  const endMs = dayTimestamp(endDay, "coverage endDay");
  if (startMs > endMs) throw new Error("physiological coverage is reversed");
  const count = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (count > TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumHistoryDays) {
    throw new Error("physiological coverage exceeds the bounded history");
  }
  return Array.from(
    { length: count },
    (_, index) =>
      new Date(startMs + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function boundedCount(value: unknown, label: string): number {
  if (
    !Number.isInteger(value)
    || Number(value) < 0
    || Number(value)
      > TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumSourceRecordCount
  ) {
    throw new Error(`${label} must be a bounded count`);
  }
  return Number(value);
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${taskMapContractDigest(value).slice(0, 16)}`;
}

function snapshotDigestInput(
  snapshot: TaskMapPhysiologicalSourceSnapshotV1,
): Omit<
  TaskMapPhysiologicalSourceSnapshotV1,
  "snapshotId" | "snapshotDigest"
> {
  return {
    contractVersion: snapshot.contractVersion,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    producerVersion: snapshot.producerVersion,
    sourceFamily: snapshot.sourceFamily,
    producedAt: snapshot.producedAt,
    validThrough: snapshot.validThrough,
    readReceipt: snapshot.readReceipt,
    coverage: snapshot.coverage,
    days: snapshot.days,
    privacy: snapshot.privacy,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function providerBindingDigest(
  context: OuraTaskMapContextDocument,
  ownerScopeDigest: string,
): string {
  return taskMapContractDigest({
    domain: PROVIDER_BINDING_DOMAIN,
    ownerScopeDigest,
    sourceKind: context.sourceKind,
    connection: "owner_local_direct_oauth",
  });
}

function sourceRecordCount(context: OuraTaskMapContextDocument): number {
  const result = [
    context.coverage.dailyActivityDays,
    context.coverage.dailyReadinessDays,
    context.coverage.dailySleepDays,
    context.coverage.sleepRecords,
    context.coverage.heartRateSamples,
  ].reduce((sum, value) => sum + value, 0);
  return boundedCount(result, "sourceRecordCount");
}

export function buildTaskMapPhysiologicalSourceSnapshot(
  context: OuraTaskMapContextDocument,
  ownerScopeDigest: string,
  requestedAtInput: string,
  completedAtInput: string,
): TaskMapPhysiologicalSourceSnapshotV1 {
  assertOwnerSafeOuraTaskMapContext(context);
  if (!SHA256.test(ownerScopeDigest)) {
    throw new Error("physiological owner scope digest is invalid");
  }
  const requestedAt = canonicalTimestamp(requestedAtInput, "requestedAt");
  const completedAt = canonicalTimestamp(completedAtInput, "completedAt");
  const sourceObservedAt = canonicalTimestamp(
    new Date(Date.parse(context.generatedAt)).toISOString(),
    "sourceObservedAt",
  );
  const requestedAtMs = Date.parse(requestedAt);
  const completedAtMs = Date.parse(completedAt);
  const sourceObservedAtMs = Date.parse(sourceObservedAt);
  if (
    requestedAtMs > sourceObservedAtMs
    || sourceObservedAtMs > completedAtMs
  ) {
    throw new Error("live provider receipt timestamps are inconsistent");
  }

  const days = context.days.map((day) => ({
    dayKey: day.dayKey,
    axis: day.axis,
    category: day.category,
  }));
  const observedDays = days.filter(
    (day) => day.category !== "unknown",
  ).length;
  const base = {
    contractVersion: TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION,
    ownerScopeDigest,
    producerVersion: TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION,
    sourceFamily: "physiological" as const,
    producedAt: completedAt,
    validThrough: new Date(
      completedAtMs + TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS,
    ).toISOString(),
    readReceipt: {
      mode: "live_provider_read" as const,
      outcome: "succeeded" as const,
      requestedAt,
      completedAt,
      sourceObservedAt,
      providerBindingDigest: providerBindingDigest(
        context,
        ownerScopeDigest,
      ),
      safeContextDigest: taskMapContractDigest(context),
    },
    coverage: {
      startDay: context.coverage.startDay,
      endDay: context.coverage.endDay,
      observedDays,
      classifiedDays: context.coverage.classifiedDays,
      unknownDays: context.coverage.unknownDays,
      sourceRecordCount: sourceRecordCount(context),
    },
    days,
    privacy: {
      rawBiometricsStored: false as const,
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      credentialsStored: false as const,
    },
  };
  const snapshotDigest = taskMapContractDigest(base);
  const snapshot: TaskMapPhysiologicalSourceSnapshotV1 = {
    ...base,
    snapshotId: stableId("tmps", snapshotDigest),
    snapshotDigest,
  };
  assertTaskMapPhysiologicalSourceSnapshot(snapshot);
  return deepFreeze(snapshot);
}

export function assertTaskMapPhysiologicalSourceSnapshot(
  value: unknown,
): asserts value is TaskMapPhysiologicalSourceSnapshotV1 {
  assertRecord(value, "physiological source snapshot");
  assertExactKeys(value, [
    "contractVersion",
    "ownerScopeDigest",
    "snapshotId",
    "snapshotDigest",
    "producerVersion",
    "sourceFamily",
    "producedAt",
    "validThrough",
    "readReceipt",
    "coverage",
    "days",
    "privacy",
  ], "physiological source snapshot");
  if (
    value.contractVersion
      !== TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION
    || typeof value.ownerScopeDigest !== "string"
    || !SHA256.test(value.ownerScopeDigest)
    || value.producerVersion
      !== TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION
    || value.sourceFamily !== "physiological"
    || typeof value.snapshotId !== "string"
    || !STABLE_ID.test(value.snapshotId)
    || typeof value.snapshotDigest !== "string"
    || !SHA256.test(value.snapshotDigest)
  ) {
    throw new Error("physiological source snapshot identity is invalid");
  }
  const producedAt = canonicalTimestamp(value.producedAt, "producedAt");
  const validThrough = canonicalTimestamp(
    value.validThrough,
    "validThrough",
  );
  if (
    Date.parse(validThrough) - Date.parse(producedAt)
      !== TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS
  ) {
    throw new Error("physiological source validity interval is invalid");
  }

  assertRecord(value.readReceipt, "readReceipt");
  assertExactKeys(value.readReceipt, [
    "mode",
    "outcome",
    "requestedAt",
    "completedAt",
    "sourceObservedAt",
    "providerBindingDigest",
    "safeContextDigest",
  ], "readReceipt");
  const requestedAt = canonicalTimestamp(
    value.readReceipt.requestedAt,
    "readReceipt.requestedAt",
  );
  const completedAt = canonicalTimestamp(
    value.readReceipt.completedAt,
    "readReceipt.completedAt",
  );
  const sourceObservedAt = canonicalTimestamp(
    value.readReceipt.sourceObservedAt,
    "readReceipt.sourceObservedAt",
  );
  if (
    value.readReceipt.mode !== "live_provider_read"
    || value.readReceipt.outcome !== "succeeded"
    || completedAt !== producedAt
    || Date.parse(requestedAt) > Date.parse(sourceObservedAt)
    || Date.parse(sourceObservedAt) > Date.parse(completedAt)
    || typeof value.readReceipt.providerBindingDigest !== "string"
    || !SHA256.test(value.readReceipt.providerBindingDigest)
    || typeof value.readReceipt.safeContextDigest !== "string"
    || !SHA256.test(value.readReceipt.safeContextDigest)
  ) {
    throw new Error("physiological live-read receipt is invalid");
  }

  assertRecord(value.coverage, "coverage");
  assertExactKeys(value.coverage, [
    "startDay",
    "endDay",
    "observedDays",
    "classifiedDays",
    "unknownDays",
    "sourceRecordCount",
  ], "coverage");
  if (
    typeof value.coverage.startDay !== "string"
    || typeof value.coverage.endDay !== "string"
  ) {
    throw new Error("physiological coverage days are invalid");
  }
  const expectedDays = inclusiveDays(
    value.coverage.startDay,
    value.coverage.endDay,
  );
  if (
    !Array.isArray(value.days)
    || value.days.length !== expectedDays.length
  ) {
    throw new Error("physiological day coverage is incomplete");
  }
  const categories = new Set<OuraTaskMapBodyCategory>([
    "below_baseline",
    "within_baseline",
    "above_baseline",
    "unknown",
  ]);
  value.days.forEach((day, index) => {
    assertRecord(day, "physiological day");
    assertExactKeys(day, ["dayKey", "axis", "category"], "physiological day");
    if (
      day.dayKey !== expectedDays[index]
      || day.axis !== "composite_recovery"
      || !categories.has(day.category as OuraTaskMapBodyCategory)
    ) {
      throw new Error("physiological day is invalid");
    }
  });
  const classifiedDays = value.days.filter(
    (day) => day.category !== "unknown",
  ).length;
  const observedDays = boundedCount(
    value.coverage.observedDays,
    "coverage.observedDays",
  );
  const declaredClassifiedDays = boundedCount(
    value.coverage.classifiedDays,
    "coverage.classifiedDays",
  );
  const unknownDays = boundedCount(
    value.coverage.unknownDays,
    "coverage.unknownDays",
  );
  boundedCount(
    value.coverage.sourceRecordCount,
    "coverage.sourceRecordCount",
  );
  if (
    observedDays !== classifiedDays
    || declaredClassifiedDays !== classifiedDays
    || unknownDays !== value.days.length - classifiedDays
  ) {
    throw new Error("physiological coverage counts do not match its days");
  }

  assertRecord(value.privacy, "privacy");
  assertExactKeys(value.privacy, [
    "rawBiometricsStored",
    "sourceBodiesStored",
    "localPathsStored",
    "credentialsStored",
  ], "privacy");
  if (
    value.privacy.rawBiometricsStored !== false
    || value.privacy.sourceBodiesStored !== false
    || value.privacy.localPathsStored !== false
    || value.privacy.credentialsStored !== false
  ) {
    throw new Error("physiological privacy boundary is invalid");
  }

  const typedSnapshot = value as unknown as TaskMapPhysiologicalSourceSnapshotV1;
  const expectedDigest = taskMapContractDigest(
    snapshotDigestInput(typedSnapshot),
  );
  if (
    typedSnapshot.snapshotDigest !== expectedDigest
    || typedSnapshot.snapshotId !== stableId("tmps", expectedDigest)
  ) {
    throw new Error("physiological snapshot digest is invalid");
  }
}

function unknownVersion(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.contractVersion === "string"
    && value.contractVersion
      !== TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION
  ) || (
    typeof value.producerVersion === "string"
    && value.producerVersion
      !== TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION
  );
}

function unavailableAssessment(
  decision: Extract<
    TaskMapPhysiologicalSourceFreshnessDecision,
    "missing" | "unknown_version" | "malformed"
  >,
  assessedAt: string,
  detailCode: TaskMapPhysiologicalSourceAssessmentV1["detailCode"],
): TaskMapPhysiologicalSourceAssessmentV1 {
  return {
    decision,
    eligibleForCurrentRefresh: false,
    assessedAt,
    snapshot: null,
    detailCode,
  };
}

export function assessTaskMapPhysiologicalSourceSnapshot(
  value: unknown,
  assessedAtInput: string,
  expectedOwnerScopeDigest: string,
): TaskMapPhysiologicalSourceAssessmentV1 {
  const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
  if (!SHA256.test(expectedOwnerScopeDigest)) {
    return unavailableAssessment(
      "malformed",
      assessedAt,
      "snapshot_contract_validation_failed",
    );
  }
  if (unknownVersion(value)) {
    return unavailableAssessment(
      "unknown_version",
      assessedAt,
      "unsupported_snapshot_or_producer_version",
    );
  }
  try {
    assertTaskMapPhysiologicalSourceSnapshot(value);
  } catch {
    return unavailableAssessment(
      "malformed",
      assessedAt,
      "snapshot_contract_validation_failed",
    );
  }
  const snapshot = value;
  if (snapshot.ownerScopeDigest !== expectedOwnerScopeDigest) {
    return unavailableAssessment(
      "malformed",
      assessedAt,
      "snapshot_contract_validation_failed",
    );
  }
  if (Date.parse(assessedAt) < Date.parse(snapshot.producedAt)) {
    return {
      decision: "malformed",
      eligibleForCurrentRefresh: false,
      assessedAt,
      snapshot,
      detailCode: "assessment_precedes_production",
    };
  }
  if (assessedAt === snapshot.validThrough) {
    return {
      decision: "boundary_due",
      eligibleForCurrentRefresh: false,
      assessedAt,
      snapshot,
      detailCode: "four_hour_boundary_due",
    };
  }
  if (Date.parse(assessedAt) > Date.parse(snapshot.validThrough)) {
    return {
      decision: "stale",
      eligibleForCurrentRefresh: false,
      assessedAt,
      snapshot,
      detailCode: "four_hour_max_age_exceeded",
    };
  }
  return {
    decision: "fresh",
    eligibleForCurrentRefresh: true,
    assessedAt,
    snapshot,
    detailCode: "within_four_hour_half_open_interval",
  };
}

function validSnapshotPath(snapshotPath: string): boolean {
  return (
    typeof snapshotPath === "string"
    && path.isAbsolute(snapshotPath)
    && path.normalize(snapshotPath) === snapshotPath
    && !CONTROL_CHARACTER.test(snapshotPath)
  );
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === "string"
    ? value.code
    : undefined;
}

export function serializeTaskMapPhysiologicalSourceSnapshot(
  snapshot: TaskMapPhysiologicalSourceSnapshotV1,
): string {
  assertTaskMapPhysiologicalSourceSnapshot(snapshot);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export async function loadTaskMapPhysiologicalSourceSnapshot(
  snapshotPath: string,
  assessedAtInput: string,
  expectedOwnerScopeDigest: string,
): Promise<TaskMapPhysiologicalSourceAssessmentV1> {
  const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
  if (!validSnapshotPath(snapshotPath)) {
    return unavailableAssessment(
      "malformed",
      assessedAt,
      "snapshot_path_invalid",
    );
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      snapshotPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    const expectedUid = typeof process.getuid === "function"
      ? process.getuid()
      : before.uid;
    if (
      !before.isFile()
      || before.uid !== BigInt(expectedUid)
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 2n
      || before.size
        > BigInt(TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumFileBytes)
    ) {
      return unavailableAssessment(
        "malformed",
        assessedAt,
        "snapshot_file_authentication_failed",
      );
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      BigInt(bytes.byteLength) !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mode !== before.mode
      || after.nlink !== before.nlink
      || after.uid !== before.uid
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) {
      return unavailableAssessment(
        "malformed",
        assessedAt,
        "snapshot_file_changed_during_read",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      return unavailableAssessment(
        "malformed",
        assessedAt,
        "snapshot_json_parse_failed",
      );
    }
    const assessed = assessTaskMapPhysiologicalSourceSnapshot(
      parsed,
      assessedAt,
      expectedOwnerScopeDigest,
    );
    if (
      assessed.snapshot !== null
      && bytes.toString("utf8")
        !== serializeTaskMapPhysiologicalSourceSnapshot(assessed.snapshot)
    ) {
      return unavailableAssessment(
        "malformed",
        assessedAt,
        "snapshot_serialization_noncanonical",
      );
    }
    return assessed;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return unavailableAssessment(
        "missing",
        assessedAt,
        "snapshot_file_missing",
      );
    }
    return unavailableAssessment(
      "malformed",
      assessedAt,
      "snapshot_file_open_failed",
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  try {
    const metadata = await lstat(directory);
    const expectedUid = typeof process.getuid === "function"
      ? process.getuid()
      : metadata.uid;
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || metadata.uid !== expectedUid
    ) {
      throw new Error("physiological snapshot parent is not private");
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await chmod(directory, 0o700);
}

export async function writeTaskMapPhysiologicalSourceSnapshotAtomic(
  outputPath: string,
  snapshot: TaskMapPhysiologicalSourceSnapshotV1,
): Promise<void> {
  if (!validSnapshotPath(outputPath)) {
    throw new Error("physiological snapshot output path must be absolute");
  }
  const serialized = serializeTaskMapPhysiologicalSourceSnapshot(snapshot);
  if (
    Buffer.byteLength(serialized)
      > TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumFileBytes
  ) {
    throw new Error("physiological snapshot exceeds its file limit");
  }
  const directory = path.dirname(outputPath);
  await ensurePrivateDirectory(directory);
  const temporaryDirectory = await mkdtemp(
    path.join(directory, ".physiological-source-"),
  );
  await chmod(temporaryDirectory, 0o700);
  const temporaryPath = path.join(temporaryDirectory, "snapshot.json");
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let published = false;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(serialized, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    const metadata = await handle.stat();
    if (
      !metadata.isFile()
      || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== 0o600
      || metadata.size !== Buffer.byteLength(serialized)
    ) {
      throw new Error("temporary physiological snapshot is invalid");
    }
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
    published = true;
  } finally {
    await handle?.close().catch(() => undefined);
    if (!published) await unlink(temporaryPath).catch(() => undefined);
    await rmdir(temporaryDirectory).catch(() => undefined);
  }
}

function rangeForRequest(
  requestedAt: string,
  historyDays: number,
): { startDate: string; endDate: string } {
  const endDate = requestedAt.slice(0, 10);
  const endMs = dayTimestamp(endDate, "request day");
  return {
    startDate: new Date(
      endMs - (historyDays - 1) * DAY_MS,
    ).toISOString().slice(0, 10),
    endDate,
  };
}

async function defaultProviderReader(
  options: FetchOuraTaskMapContextOptions,
): Promise<OuraTaskMapContextDocument> {
  return fetchOuraTaskMapContext(options);
}

export async function refreshTaskMapPhysiologicalSourceSnapshot(
  options: RefreshTaskMapPhysiologicalSourceSnapshotOptions,
): Promise<TaskMapPhysiologicalSourceSnapshotV1> {
  if (!isRecord(options) || !validSnapshotPath(options.outputPath)) {
    throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
  }
  const historyDays =
    options.historyDays
    ?? TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS;
  if (
    !Number.isInteger(historyDays)
    || historyDays < 1
    || historyDays
      > TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumHistoryDays
    || (options.force !== undefined && typeof options.force !== "boolean")
    || typeof options.ownerScopeDigest !== "string"
    || !SHA256.test(options.ownerScopeDigest)
    || (
      options.readProviderContext !== undefined
      && typeof options.readProviderContext !== "function"
    )
    || (options.clock !== undefined && typeof options.clock !== "function")
  ) {
    throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
  }
  const clock = options.clock ?? (() => new Date());
  const requestedAt = clockTimestamp(clock);
  if (options.force !== true) {
    const current = await loadTaskMapPhysiologicalSourceSnapshot(
      options.outputPath,
      requestedAt,
      options.ownerScopeDigest,
    );
    if (current.decision === "fresh" && current.snapshot !== null) {
      return current.snapshot;
    }
  }

  const range = rangeForRequest(requestedAt, historyDays);
  const reader = options.readProviderContext ?? defaultProviderReader;
  let context: OuraTaskMapContextDocument;
  try {
    context = await reader({
      ...range,
      now: new Date(requestedAt),
    });
    assertOwnerSafeOuraTaskMapContext(context);
    if (
      context.coverage.startDay !== range.startDate
      || context.coverage.endDay !== range.endDate
      || new Date(Date.parse(context.generatedAt)).toISOString()
        !== requestedAt
    ) {
      throw new Error("provider context is not bound to this read attempt");
    }
  } catch {
    throw new TaskMapPhysiologicalSourceUnavailableError("provider_error");
  }

  let snapshot: TaskMapPhysiologicalSourceSnapshotV1;
  try {
    const completedAt = clockTimestamp(clock);
    snapshot = buildTaskMapPhysiologicalSourceSnapshot(
      context,
      options.ownerScopeDigest,
      requestedAt,
      completedAt,
    );
  } catch {
    throw new TaskMapPhysiologicalSourceUnavailableError("provider_error");
  }
  try {
    await writeTaskMapPhysiologicalSourceSnapshotAtomic(
      options.outputPath,
      snapshot,
    );
  } catch {
    throw new TaskMapPhysiologicalSourceUnavailableError(
      "publication_error",
    );
  }
  return snapshot;
}

function requireFreshSnapshot(
  snapshot: TaskMapPhysiologicalSourceSnapshotV1,
  assessedAt: string,
  expectedOwnerScopeDigest: string,
): TaskMapPhysiologicalSourceSnapshotV1 {
  const assessment = assessTaskMapPhysiologicalSourceSnapshot(
    snapshot,
    assessedAt,
    expectedOwnerScopeDigest,
  );
  if (
    assessment.decision !== "fresh"
    || assessment.snapshot === null
  ) {
    throw new TaskMapPhysiologicalSourceUnavailableError(
      "snapshot_not_fresh",
    );
  }
  return assessment.snapshot;
}

export function buildTaskMapPhysiologicalOwnerSlice(
  snapshotInput: TaskMapPhysiologicalSourceSnapshotV1,
  assessedAt: string,
  ownerScopeDigest: string,
): TaskMapOwnerCollectedSlice<TaskMapNativeSafeSlice> {
  const snapshot = requireFreshSnapshot(
    snapshotInput,
    assessedAt,
    ownerScopeDigest,
  );
  const value: TaskMapNativeSafeSlice = {
    contractVersion: "taskmap-native-safe-source-slice.v1",
    ownerScopeDigest,
    source: "body",
    recordCount: 1,
    records: [{
      identityDigest: taskMapContractDigest({
        domain: SAFE_RECORD_DOMAIN,
        providerBindingDigest:
          snapshot.readReceipt.providerBindingDigest,
      }),
      revision: snapshot.snapshotDigest,
      occurredAtMs: Date.parse(snapshot.readReceipt.sourceObservedAt),
    }],
    metadata: {
      sourceSnapshotVersion: snapshot.contractVersion,
      producerVersion: snapshot.producerVersion,
      producedAtMs: Date.parse(snapshot.producedAt),
      validThroughMs: Date.parse(snapshot.validThrough),
      sourceObservedAtMs:
        Date.parse(snapshot.readReceipt.sourceObservedAt),
      liveReadReceiptDigest: taskMapContractDigest(snapshot.readReceipt),
      coverageStartDay: snapshot.coverage.startDay,
      coverageEndDay: snapshot.coverage.endDay,
      observedDays: snapshot.coverage.observedDays,
      classifiedDays: snapshot.coverage.classifiedDays,
      unknownDays: snapshot.coverage.unknownDays,
    },
  };
  return deepFreeze({
    ownerScopeDigest,
    revision: snapshot.snapshotDigest,
    sliceDigest: taskMapContractDigest(value),
    value,
  });
}

function bodySummary(category: OuraTaskMapBodyCategory): string {
  switch (category) {
    case "below_baseline":
      return "Combined Readiness + Sleep was below your usual recent range. This does not prove any work caused the change.";
    case "within_baseline":
      return "Combined Readiness + Sleep was within your usual recent range.";
    case "above_baseline":
      return "Combined Readiness + Sleep was above your usual recent range. This does not prove any work caused the change.";
    case "unknown":
      return "Readiness + Sleep did not provide enough data for this day.";
  }
}

export function buildTaskMapPhysiologicalSemanticContext(
  snapshotInput: TaskMapPhysiologicalSourceSnapshotV1,
  assessedAt: string,
  expectedOwnerScopeDigest: string,
): TaskMapPhysiologicalSemanticContextV1 {
  const snapshot = requireFreshSnapshot(
    snapshotInput,
    assessedAt,
    expectedOwnerScopeDigest,
  );
  const semanticIdentityDigest = taskMapContractDigest({
    domain: SEMANTIC_POINTER_DOMAIN,
    providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
  });
  const pointerId = stableId("physource", semanticIdentityDigest);
  const pointer: TaskMapSourcePointer = {
    id: pointerId,
    // The frozen Task Map schema has one current body-provider provenance kind.
    // Provider identity never enters user-facing title or summary copy.
    sourceKind: "oura",
    sourceObjectId: snapshot.readReceipt.providerBindingDigest,
    sourceRefHash: semanticIdentityDigest,
    sourceVersion: snapshot.snapshotDigest,
    authority: "none",
    syncMode: "reference_only",
    capabilities: ["read_context"],
  };
  const sourceBinding: TaskMapNativeSemanticSourceBindingV1 = {
    pointerId,
    semanticClass: "body_context",
    semanticOriginId: "physiological_source",
    semanticIdentityDigest,
    sourceIdentityDigest:
      snapshot.readReceipt.providerBindingDigest,
    observedRevision: snapshot.snapshotDigest,
    evidenceRevision: snapshot.snapshotDigest,
    observedContentDigest: snapshot.snapshotDigest,
    evidenceContentDigest: snapshot.snapshotDigest,
  };
  const events = snapshot.days.map((day): TaskMapEvent => {
    const eventIdentity = {
      domain: SEMANTIC_EVENT_DOMAIN,
      providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
      dayKey: day.dayKey,
      axis: day.axis,
      category: day.category,
    };
    return {
      id: stableId("physioevent", eventIdentity),
      pointerId,
      recordKind: "body_context",
      activity: "body_window_observed",
      occurredAt: `${day.dayKey}T00:00:00.000Z`,
      observedAt: snapshot.readReceipt.completedAt,
      dayKey: day.dayKey,
      objectRefs: [
        `physiological:${taskMapContractDigest({
          domain: SEMANTIC_EVENT_DOMAIN,
          providerBindingDigest:
            snapshot.readReceipt.providerBindingDigest,
          dayKey: day.dayKey,
          axis: day.axis,
        })}`,
      ],
      title: "Body context",
      summary: bodySummary(day.category),
      extractionConfidence: 1,
      bodyCategory: day.category,
      bodyAxis: day.axis,
      bodyJoinEligible: false,
    };
  });
  const evidenceBindings = events.map(
    (event): TaskMapNativeSemanticEvidenceBindingV1 => ({
      eventId: event.id,
      disposition: "body_only",
      rootLinkRefs: [],
    }),
  );
  return deepFreeze({
    pointers: [pointer],
    events,
    sourceBindings: [sourceBinding],
    evidenceBindings,
  });
}
