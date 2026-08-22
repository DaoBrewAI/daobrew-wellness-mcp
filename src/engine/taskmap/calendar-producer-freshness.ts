import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import { taskMapOwnerScopeDigest } from "./owner-scope.js";

export const TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION =
  "taskmap-local-calendar-export.v1" as const;
export const TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION =
  "taskmap-google-calendar-provider-snapshot.v1" as const;
export const TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION =
  "taskmap-calendar-producer-result.v1" as const;
export const TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION =
  "taskmap-google-calendar-api.1" as const;
export const TASKMAP_CALENDAR_OWNER_SCOPE_DOMAIN =
  "taskmap-owner-local.1" as const;
export const TASKMAP_CALENDAR_MAX_AGE_MS = 14_400_000 as const;
export const TASKMAP_LOCAL_CALENDAR_EVENT_IDENTITY_DOMAIN =
  "taskmap-local-calendar-event.1" as const;
export const TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN =
  "taskmap-google-calendar-event.1" as const;
export const TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN =
  "taskmap-calendar-cross-provider.1" as const;
export const TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN =
  "taskmap-calendar-event-revision.1" as const;

export const TASKMAP_CALENDAR_LIMITS_V1 = Object.freeze({
  maxEventsPerProvider: 256,
  maxFileBytes: 256 * 1_024,
} as const);

const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const EMAIL_ADDRESS =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const CREDENTIAL_ASSIGNMENT =
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i;
const BEARER_SECRET =
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i;
const PROVIDER_TOKEN =
  /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/;
const JWT_SECRET =
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const URI_SCHEME = /\b[a-z][a-z0-9+.-]{1,31}:\/\//i;
const OWNER_LOCAL_ABSOLUTE_PATH =
  /(?:^|[^A-Za-z0-9_:/\\])(?:\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]+)/;

const PRIVACY = Object.freeze({
  boundedTitlesStored: true,
  attendeesStored: false,
  locationsStored: false,
  notesStored: false,
  urlsStored: false,
  rawProviderIdsStored: false,
  credentialsStored: false,
  localPathsStored: false,
} as const);

export type TaskMapCalendarProvider =
  | "local_calendar"
  | "google_calendar";

export interface TaskMapCalendarEventV1 {
  eventIdentityDigest: string;
  crossProviderIdentityDigest: string | null;
  revisionDigest: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface TaskMapLocalCalendarExportV1 {
  contractVersion: typeof TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION;
  ownerScopeDigest: string;
  producedAt: string;
  validThrough: string;
  events: TaskMapCalendarEventV1[];
}

export interface TaskMapGoogleCalendarProviderSnapshotV1 {
  contractVersion:
    typeof TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION;
  snapshotDigest: string;
  producerVersion: typeof TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION;
  ownerScopeDigest: string;
  producedAt: string;
  validThrough: string;
  events: TaskMapCalendarEventV1[];
  privacy: typeof PRIVACY;
}

export type TaskMapCalendarProviderFreshness =
  | "current"
  | "boundary_due"
  | "stale"
  | "missing"
  | "malformed";

export interface TaskMapCalendarProviderStatusV1 {
  provider: TaskMapCalendarProvider;
  freshness: TaskMapCalendarProviderFreshness;
  producedAt: string | null;
  validThrough: string | null;
  eventCount: number;
  currentInputEligible: boolean;
}

export interface TaskMapCalendarProducerEventV1
  extends TaskMapCalendarEventV1 {
  provider: TaskMapCalendarProvider;
}

export interface TaskMapCalendarProducerResultV1 {
  contractVersion: typeof TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION;
  resultDigest: string;
  ownerScopeDigest: string;
  availability: "available" | "unavailable";
  assessedAt: string;
  providers: TaskMapCalendarProviderStatusV1[];
  events: TaskMapCalendarProducerEventV1[];
  privacy: typeof PRIVACY;
}

export interface TaskMapCalendarProducerLoadInputV1 {
  localExportPath: string;
  googleSnapshotPath: string;
  assessedAt: string;
  expectedOwnerScopeDigest: string;
}

const EVENT_KEYS = new Set([
  "eventIdentityDigest",
  "crossProviderIdentityDigest",
  "revisionDigest",
  "title",
  "startAt",
  "endAt",
]);
const LOCAL_EXPORT_KEYS = new Set([
  "contractVersion",
  "ownerScopeDigest",
  "producedAt",
  "validThrough",
  "events",
]);
const GOOGLE_SNAPSHOT_KEYS = new Set([
  "contractVersion",
  "snapshotDigest",
  "producerVersion",
  "ownerScopeDigest",
  "producedAt",
  "validThrough",
  "events",
  "privacy",
]);
const PRIVACY_KEYS = new Set(Object.keys(PRIVACY));

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${label} must be a plain object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== keys.size
    || actual.some((key) => !keys.has(key))
  ) {
    throw new Error(`${label} has unsupported or missing keys`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase sha256 digest`);
  }
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length > 64
    || !STRICT_RFC3339.test(value)
  ) {
    throw new Error(`${label} must be an RFC3339 timestamp`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} must be an RFC3339 timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function canonicalTitle(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const title = value.trim().replace(/\s+/gu, " ");
  if (
    title.length === 0
    || Array.from(title).length > 96
    || CONTROL_CHARACTER.test(title)
    || EMAIL_ADDRESS.test(title)
    || CREDENTIAL_ASSIGNMENT.test(title)
    || BEARER_SECRET.test(title)
    || PROVIDER_TOKEN.test(title)
    || JWT_SECRET.test(title)
    || URI_SCHEME.test(title)
    || OWNER_LOCAL_ABSOLUTE_PATH.test(title)
  ) {
    throw new Error(`${label} violates the bounded title privacy policy`);
  }
  return title;
}

function assertCanonicalTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || canonicalTimestamp(value, label) !== value
  ) {
    throw new Error(`${label} must be a canonical RFC3339 timestamp`);
  }
}

function normalizeEvent(
  value: unknown,
  label: string,
): TaskMapCalendarEventV1 {
  assertPlainObject(value, label);
  assertExactKeys(value, EVENT_KEYS, label);
  assertDigest(value.eventIdentityDigest, `${label}.eventIdentityDigest`);
  if (value.crossProviderIdentityDigest !== null) {
    assertDigest(
      value.crossProviderIdentityDigest,
      `${label}.crossProviderIdentityDigest`,
    );
  }
  assertDigest(value.revisionDigest, `${label}.revisionDigest`);
  const title = canonicalTitle(value.title, `${label}.title`);
  if (title !== value.title) {
    throw new Error(`${label}.title must be canonical`);
  }
  assertCanonicalTimestamp(value.startAt, `${label}.startAt`);
  assertCanonicalTimestamp(value.endAt, `${label}.endAt`);
  if (Date.parse(value.endAt) < Date.parse(value.startAt)) {
    throw new Error(`${label} ends before it starts`);
  }
  const expectedRevisionDigest = taskMapCalendarFieldDigest(
    TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
    [
      value.eventIdentityDigest,
      title,
      value.startAt,
      value.endAt,
    ],
  );
  if (value.revisionDigest !== expectedRevisionDigest) {
    throw new Error(`${label}.revisionDigest does not match its event fields`);
  }
  return {
    eventIdentityDigest: value.eventIdentityDigest,
    crossProviderIdentityDigest: value.crossProviderIdentityDigest,
    revisionDigest: value.revisionDigest,
    title,
    startAt: value.startAt,
    endAt: value.endAt,
  };
}

function normalizeEvents(
  value: unknown,
  label: string,
): TaskMapCalendarEventV1[] {
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_CALENDAR_LIMITS_V1.maxEventsPerProvider
  ) {
    throw new Error(`${label} exceeds the event limit`);
  }
  const events = value.map((event, index) =>
    normalizeEvent(event, `${label}[${index}]`)
  );
  events.sort((left, right) =>
    left.startAt.localeCompare(right.startAt)
    || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest)
  );
  const identities = new Set<string>();
  for (const event of events) {
    if (identities.has(event.eventIdentityDigest)) {
      throw new Error(`${label} contains a duplicate event identity`);
    }
    identities.add(event.eventIdentityDigest);
  }
  return events;
}

function validThroughFor(producedAt: string): string {
  return new Date(
    Date.parse(producedAt) + TASKMAP_CALENDAR_MAX_AGE_MS,
  ).toISOString();
}

function assertExactFreshnessInterval(
  producedAt: string,
  validThrough: string,
  label: string,
): void {
  if (validThrough !== validThroughFor(producedAt)) {
    throw new Error(`${label} must use the exact four-hour interval`);
  }
}

export function taskMapCalendarOwnerScopeDigest(ownerUserId: string): string {
  return taskMapOwnerScopeDigest(ownerUserId);
}

export function taskMapCalendarFieldDigest(
  domain: string,
  fields: readonly string[],
): string {
  if (
    domain.length === 0
    || domain.includes("\0")
    || Buffer.byteLength(domain, "utf8") > 256
    || fields.length === 0
    || fields.length > 16
  ) {
    throw new Error("Calendar digest domain or field count is invalid");
  }
  const hash = createHash("sha256");
  hash.update(domain, "utf8");
  hash.update(Buffer.from([0]));
  for (const field of fields) {
    if (
      typeof field !== "string"
      || field.includes("\0")
      || Buffer.byteLength(field, "utf8") > 4_096
    ) {
      throw new Error("Calendar digest field is invalid");
    }
    const bytes = Buffer.from(field, "utf8");
    hash.update(String(bytes.byteLength), "utf8");
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

export function buildTaskMapLocalCalendarExport(input: {
  ownerScopeDigest: string;
  producedAt: string;
  events: readonly TaskMapCalendarEventV1[];
}): TaskMapLocalCalendarExportV1 {
  assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
  const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
  const events = normalizeEvents([...input.events], "events");
  return {
    contractVersion: TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    producedAt,
    validThrough: validThroughFor(producedAt),
    events,
  };
}

export function taskMapLocalCalendarExportCanonicalJson(
  value: TaskMapLocalCalendarExportV1,
): string {
  return taskMapContractCanonicalJson(value);
}

function googleSnapshotDigest(
  snapshot: Omit<
    TaskMapGoogleCalendarProviderSnapshotV1,
    "snapshotDigest"
  >,
): string {
  return taskMapContractDigest({
    domain: TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION,
    snapshot,
  });
}

export function buildTaskMapGoogleCalendarProviderSnapshot(input: {
  ownerScopeDigest: string;
  producedAt: string;
  events: readonly TaskMapCalendarEventV1[];
}): TaskMapGoogleCalendarProviderSnapshotV1 {
  assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
  const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
  const core = {
    contractVersion:
      TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION,
    producerVersion: TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    producedAt,
    validThrough: validThroughFor(producedAt),
    events: normalizeEvents([...input.events], "events"),
    privacy: PRIVACY,
  };
  return {
    ...core,
    snapshotDigest: googleSnapshotDigest(core),
  };
}

export function taskMapGoogleCalendarProviderSnapshotCanonicalJson(
  value: TaskMapGoogleCalendarProviderSnapshotV1,
): string {
  return taskMapContractCanonicalJson(value);
}

function assertPrivacy(value: unknown, label: string): void {
  assertPlainObject(value, label);
  assertExactKeys(value, PRIVACY_KEYS, label);
  for (const key of PRIVACY_KEYS) {
    if (value[key] !== PRIVACY[key as keyof typeof PRIVACY]) {
      throw new Error(`${label}.${key} does not match the privacy contract`);
    }
  }
}

export function assertTaskMapLocalCalendarExport(
  value: unknown,
  expectedOwnerScopeDigest: string,
): asserts value is TaskMapLocalCalendarExportV1 {
  assertPlainObject(value, "local calendar export");
  assertExactKeys(value, LOCAL_EXPORT_KEYS, "local calendar export");
  if (value.contractVersion !== TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION) {
    throw new Error("local calendar export has an unknown version");
  }
  assertDigest(value.ownerScopeDigest, "local calendar ownerScopeDigest");
  assertDigest(expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
  if (value.ownerScopeDigest !== expectedOwnerScopeDigest) {
    throw new Error("local calendar export owner does not match");
  }
  assertCanonicalTimestamp(value.producedAt, "local calendar producedAt");
  assertCanonicalTimestamp(
    value.validThrough,
    "local calendar validThrough",
  );
  assertExactFreshnessInterval(
    value.producedAt,
    value.validThrough,
    "local calendar export",
  );
  normalizeEvents(value.events, "local calendar events");
}

export function assertTaskMapGoogleCalendarProviderSnapshot(
  value: unknown,
  expectedOwnerScopeDigest?: string,
): asserts value is TaskMapGoogleCalendarProviderSnapshotV1 {
  assertPlainObject(value, "Google Calendar snapshot");
  assertExactKeys(
    value,
    GOOGLE_SNAPSHOT_KEYS,
    "Google Calendar snapshot",
  );
  if (
    value.contractVersion
      !== TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION
    || value.producerVersion !== TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION
  ) {
    throw new Error("Google Calendar snapshot has an unknown version");
  }
  assertDigest(value.snapshotDigest, "Google Calendar snapshotDigest");
  assertDigest(value.ownerScopeDigest, "Google Calendar ownerScopeDigest");
  if (
    expectedOwnerScopeDigest !== undefined
    && value.ownerScopeDigest !== expectedOwnerScopeDigest
  ) {
    throw new Error("Google Calendar snapshot owner does not match");
  }
  assertCanonicalTimestamp(
    value.producedAt,
    "Google Calendar producedAt",
  );
  assertCanonicalTimestamp(
    value.validThrough,
    "Google Calendar validThrough",
  );
  assertExactFreshnessInterval(
    value.producedAt,
    value.validThrough,
    "Google Calendar snapshot",
  );
  const events = normalizeEvents(value.events, "Google Calendar events");
  assertPrivacy(value.privacy, "Google Calendar privacy");
  const expectedDigest = googleSnapshotDigest({
    contractVersion: value.contractVersion,
    producerVersion: value.producerVersion,
    ownerScopeDigest: value.ownerScopeDigest,
    producedAt: value.producedAt,
    validThrough: value.validThrough,
    events,
    privacy: PRIVACY,
  });
  if (value.snapshotDigest !== expectedDigest) {
    throw new Error("Google Calendar snapshot digest does not match");
  }
}

async function readOwnerOnlyJson(
  filePath: string,
): Promise<{ value: unknown; bytes: Buffer }> {
  if (!path.isAbsolute(filePath) || path.normalize(filePath) !== filePath) {
    throw new Error("Calendar snapshot path must be normalized and absolute");
  }
  const handle = await open(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const stats = await handle.stat({ bigint: true });
    if (
      !stats.isFile()
      || stats.nlink !== 1n
      || stats.uid !== BigInt(process.getuid?.() ?? -1)
      || (stats.mode & 0o777n) !== 0o600n
      || stats.size > BigInt(TASKMAP_CALENDAR_LIMITS_V1.maxFileBytes)
    ) {
      throw new Error("Calendar snapshot is not an owner-only regular file");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      BigInt(bytes.byteLength) !== stats.size
      || after.dev !== stats.dev
      || after.ino !== stats.ino
      || after.size !== stats.size
      || after.mode !== stats.mode
      || after.nlink !== stats.nlink
      || after.uid !== stats.uid
      || after.mtimeNs !== stats.mtimeNs
      || after.ctimeNs !== stats.ctimeNs
    ) {
      throw new Error("Calendar snapshot changed while it was read");
    }
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } finally {
    await handle.close();
  }
}

function providerStatus(
  provider: TaskMapCalendarProvider,
  assessedAt: string,
  value:
    | TaskMapLocalCalendarExportV1
    | TaskMapGoogleCalendarProviderSnapshotV1
    | null,
  failure: "missing" | "malformed" | null,
): TaskMapCalendarProviderStatusV1 {
  if (value === null) {
    return {
      provider,
      freshness: failure ?? "missing",
      producedAt: null,
      validThrough: null,
      eventCount: 0,
      currentInputEligible: false,
    };
  }
  const assessedAtMs = Date.parse(assessedAt);
  const producedAtMs = Date.parse(value.producedAt);
  const validThroughMs = Date.parse(value.validThrough);
  const freshness: TaskMapCalendarProviderFreshness =
    assessedAtMs < producedAtMs
      ? "malformed"
      : assessedAtMs < validThroughMs
        ? "current"
        : assessedAtMs === validThroughMs
          ? "boundary_due"
          : "stale";
  return {
    provider,
    freshness,
    producedAt: value.producedAt,
    validThrough: value.validThrough,
    eventCount: value.events.length,
    currentInputEligible: freshness === "current",
  };
}

async function loadLocal(
  filePath: string,
  expectedOwnerScopeDigest: string,
): Promise<{
  value: TaskMapLocalCalendarExportV1 | null;
  failure: "missing" | "malformed" | null;
}> {
  try {
    const { value, bytes } = await readOwnerOnlyJson(filePath);
    assertTaskMapLocalCalendarExport(value, expectedOwnerScopeDigest);
    if (!bytes.equals(Buffer.from(taskMapLocalCalendarExportCanonicalJson(value), "utf8"))) {
      throw new Error("local calendar export is not canonical JSON");
    }
    return { value, failure: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      value: null,
      failure: code === "ENOENT" ? "missing" : "malformed",
    };
  }
}

async function loadGoogle(
  filePath: string,
  expectedOwnerScopeDigest: string,
): Promise<{
  value: TaskMapGoogleCalendarProviderSnapshotV1 | null;
  failure: "missing" | "malformed" | null;
}> {
  try {
    const { value, bytes } = await readOwnerOnlyJson(filePath);
    assertTaskMapGoogleCalendarProviderSnapshot(
      value,
      expectedOwnerScopeDigest,
    );
    if (!bytes.equals(Buffer.from(taskMapGoogleCalendarProviderSnapshotCanonicalJson(value), "utf8"))) {
      throw new Error("Google Calendar snapshot is not canonical JSON");
    }
    return { value, failure: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      value: null,
      failure: code === "ENOENT" ? "missing" : "malformed",
    };
  }
}

function dedupeCurrentEvents(
  sources: readonly {
    provider: TaskMapCalendarProvider;
    current: boolean;
    events: readonly TaskMapCalendarEventV1[];
  }[],
): TaskMapCalendarProducerEventV1[] {
  const byIdentity = new Map<string, TaskMapCalendarProducerEventV1>();
  // Google is read first and therefore owns an exact cross-provider match.
  const ordered = [...sources].sort((left, right) =>
    (left.provider === "google_calendar" ? 0 : 1)
    - (right.provider === "google_calendar" ? 0 : 1)
  );
  for (const source of ordered) {
    if (!source.current) continue;
    for (const event of source.events) {
      const identity = event.crossProviderIdentityDigest === null
        ? `${source.provider}:${event.eventIdentityDigest}`
        : `cross:${event.crossProviderIdentityDigest}`;
      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, {
          provider: source.provider,
          ...event,
        });
      }
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.startAt.localeCompare(right.startAt)
    || left.provider.localeCompare(right.provider)
    || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest)
  );
}

export async function loadTaskMapCalendarProducerResult(
  input: TaskMapCalendarProducerLoadInputV1,
): Promise<TaskMapCalendarProducerResultV1> {
  const assessedAt = canonicalTimestamp(input.assessedAt, "assessedAt");
  assertDigest(
    input.expectedOwnerScopeDigest,
    "expectedOwnerScopeDigest",
  );
  const [local, google] = await Promise.all([
    loadLocal(input.localExportPath, input.expectedOwnerScopeDigest),
    loadGoogle(
      input.googleSnapshotPath,
      input.expectedOwnerScopeDigest,
    ),
  ]);
  const providers = [
    providerStatus(
      "local_calendar",
      assessedAt,
      local.value,
      local.failure,
    ),
    providerStatus(
      "google_calendar",
      assessedAt,
      google.value,
      google.failure,
    ),
  ];
  const events = dedupeCurrentEvents([
    {
      provider: "local_calendar",
      current: providers[0].currentInputEligible,
      events: local.value?.events ?? [],
    },
    {
      provider: "google_calendar",
      current: providers[1].currentInputEligible,
      events: google.value?.events ?? [],
    },
  ]);
  const core = {
    contractVersion: TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    availability: providers.some(
      (provider) => provider.currentInputEligible,
    )
      ? "available" as const
      : "unavailable" as const,
    assessedAt,
    providers,
    events,
    privacy: PRIVACY,
  };
  return {
    ...core,
    resultDigest: taskMapContractDigest({
      domain: TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
      result: core,
    }),
  };
}

export function taskMapGoogleCalendarProviderSnapshotPath(
  absoluteHome: string,
): string {
  if (
    !path.isAbsolute(absoluteHome)
    || path.normalize(absoluteHome) !== absoluteHome
  ) {
    throw new Error("Calendar home path must be normalized and absolute");
  }
  return path.join(
    absoluteHome,
    ".daobrew",
    "taskmap",
    "calendar-google-provider-snapshot.v1.json",
  );
}

export function taskMapCalendarResultCanonicalJson(
  result: TaskMapCalendarProducerResultV1,
): string {
  return taskMapContractCanonicalJson(result);
}
