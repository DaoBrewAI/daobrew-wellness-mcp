import {
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_GRANOLA_RAW_NOTE_LIMIT = 64;
export const TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES = 65_536;
export const TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES = 262_144;
export const TASKMAP_MENTION_PROMPT_OPEN_DELIMITER =
  "\n<<<BEGIN_UNTRUSTED_MEETING_NOTE_V1>>>\n";
export const TASKMAP_MENTION_PROMPT_CLOSE_DELIMITER =
  "\n<<<END_UNTRUSTED_MEETING_NOTE_V1>>>\n";

const RAW_NOTE_IDENTITY_DOMAIN = "taskmap-granola-raw-note-identity-v1";
const STRICT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const RAW_SNAPSHOT_KEYS = new Set(["events", "meeting_notes"]);
const RAW_NOTE_KEYS = new Set([
  "id",
  "source",
  "source_ref",
  "title",
  "created_at",
  "occurred_at",
  "participants",
  "summary",
  "body",
  "transcript",
  "topics",
]);

export interface TaskMapRawGranolaNoteV1 {
  sourceIdentityDigest: string;
  title: string;
  body: string;
  createdAt: string;
  occurredAt: string;
}

export interface TaskMapRawGranolaParseResultV1 {
  notes: readonly TaskMapRawGranolaNoteV1[];
  invalidRows: readonly never[];
}

export interface TaskMapRenderedMentionPromptV1 {
  promptText: string;
  promptTemplateDigest: string;
  inputDigest: string;
  promptDigest: string;
}

export class TaskMapRawGranolaSnapshotError extends Error {
  constructor(reason: string) {
    super(`Invalid raw Granola snapshot: ${reason}`);
    this.name = "TaskMapRawGranolaSnapshotError";
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function canonicalGranolaDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = STRICT_DATE.exec(value) ?? STRICT_RFC3339.exec(value);
  if (match === null) return null;
  const [, yearText, monthText, dayText] = match;
  if (!validCalendarDate(Number(yearText), Number(monthText), Number(dayText))) {
    return null;
  }
  if (STRICT_DATE.test(value)) return `${value}T00:00:00.000Z`;
  const rfc = STRICT_RFC3339.exec(value);
  if (rfc === null) return null;
  const hour = Number(rfc[4]);
  const minute = Number(rfc[5]);
  const second = Number(rfc[6]);
  const offsetHour = rfc[8] === undefined ? 0 : Number(rfc[8]);
  const offsetMinute = rfc[9] === undefined ? 0 : Number(rfc[9]);
  const componentValid = hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 14
    && offsetMinute <= 59
    && !(offsetHour === 14 && offsetMinute !== 0)
    && Number.isFinite(Date.parse(value));
  if (!componentValid) return null;
  return new Date(Date.parse(value)).toISOString();
}

function boundedString(
  value: unknown,
  field: string,
  maximumBytes: number,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string"
    || (!allowEmpty && value.trim().length === 0)
    || byteLength(value) > maximumBytes
  ) {
    throw new TaskMapRawGranolaSnapshotError(`invalid ${field}`);
  }
  return value;
}

function validatePrivateArray(
  value: unknown,
  field: string,
  maximumEntries: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximumEntries) {
    throw new TaskMapRawGranolaSnapshotError(`invalid ${field}`);
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new TaskMapRawGranolaSnapshotError(`invalid ${field}`);
  }
  if (byteLength(encoded) > TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES) {
    throw new TaskMapRawGranolaSnapshotError(`invalid ${field}`);
  }
  return value;
}

function parseRawNote(value: unknown): {
  note: TaskMapRawGranolaNoteV1;
  identity: string;
  rowDigest: string;
} {
  if (!isRecord(value) || !hasExactKeys(value, RAW_NOTE_KEYS)) {
    throw new TaskMapRawGranolaSnapshotError("invalid meeting_notes row shape");
  }
  const id = boundedString(value.id, "id", 512);
  const sourceRef = boundedString(value.source_ref, "source_ref", 512);
  if (value.source !== "granola" || id !== sourceRef) {
    throw new TaskMapRawGranolaSnapshotError("invalid Granola source identity");
  }
  const title = boundedString(value.title, "title", 2_048);
  const body = boundedString(
    value.body,
    "body",
    TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES,
  );
  const createdAt = canonicalGranolaDate(value.created_at);
  const occurredAt = canonicalGranolaDate(value.occurred_at);
  if (
    createdAt === null
    || occurredAt === null
    || Date.parse(occurredAt) > Date.parse(createdAt)
  ) {
    throw new TaskMapRawGranolaSnapshotError("invalid meeting date");
  }
  validatePrivateArray(value.participants, "participants", 128);
  validatePrivateArray(value.transcript, "transcript", 4_096);
  validatePrivateArray(value.topics, "topics", 1_024);
  if (
    value.summary !== null
    && (typeof value.summary !== "string"
      || byteLength(value.summary) > TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES)
  ) {
    throw new TaskMapRawGranolaSnapshotError("invalid summary");
  }
  const sourceIdentityDigest = taskMapContractDigest({
    domain: RAW_NOTE_IDENTITY_DOMAIN,
    source: "granola",
    sourceRef,
  });
  return {
    identity: sourceIdentityDigest,
    rowDigest: taskMapContractDigest(value),
    note: Object.freeze({
      sourceIdentityDigest,
      title,
      body,
      createdAt,
      occurredAt,
    }),
  };
}

export function parseTaskMapRawGranolaSnapshot(
  value: unknown,
): TaskMapRawGranolaParseResultV1 {
  if (!isRecord(value) || !hasExactKeys(value, RAW_SNAPSHOT_KEYS)) {
    throw new TaskMapRawGranolaSnapshotError("expected closed {events,meeting_notes} shape");
  }
  if (!Array.isArray(value.events) || value.events.length !== 0) {
    throw new TaskMapRawGranolaSnapshotError("events must be the daemon's empty array");
  }
  if (!Array.isArray(value.meeting_notes)) {
    throw new TaskMapRawGranolaSnapshotError("meeting_notes must be an array");
  }
  if (value.meeting_notes.length > TASKMAP_GRANOLA_RAW_NOTE_LIMIT) {
    throw new TaskMapRawGranolaSnapshotError("meeting_notes must contain at most 64 rows");
  }
  const byIdentity = new Map<string, { note: TaskMapRawGranolaNoteV1; rowDigest: string }>();
  for (const row of value.meeting_notes) {
    const parsed = parseRawNote(row);
    const existing = byIdentity.get(parsed.identity);
    if (existing !== undefined && existing.rowDigest !== parsed.rowDigest) {
      throw new TaskMapRawGranolaSnapshotError("conflicting duplicate identity");
    }
    if (existing === undefined) {
      byIdentity.set(parsed.identity, {
        note: parsed.note,
        rowDigest: parsed.rowDigest,
      });
    }
  }
  return Object.freeze({
    notes: Object.freeze([...byIdentity.values()].map(({ note }) => note)),
    invalidRows: Object.freeze([]),
  });
}

export function renderTaskMapMentionExtractionPrompt(
  promptTemplate: string,
  noteBody: string,
): TaskMapRenderedMentionPromptV1 {
  if (
    typeof promptTemplate !== "string"
    || promptTemplate.length === 0
    || byteLength(promptTemplate) > TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map prompt template");
  }
  if (
    typeof noteBody !== "string"
    || noteBody.length === 0
    || byteLength(noteBody) > TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map note body");
  }
  const promptText = promptTemplate
    + TASKMAP_MENTION_PROMPT_OPEN_DELIMITER
    + noteBody
    + TASKMAP_MENTION_PROMPT_CLOSE_DELIMITER;
  return Object.freeze({
    promptText,
    promptTemplateDigest: taskMapContractDigest(promptTemplate),
    inputDigest: taskMapContractDigest(noteBody),
    promptDigest: taskMapContractDigest(promptText),
  });
}
