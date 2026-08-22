import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  buildTaskMapCalendarExtractionSegments,
  renderTaskMapCalendarMentionPrompt,
  type TaskMapCalendarExtractionSegmentV1,
} from "./calendar-extraction.js";
import {
  loadTaskMapCalendarProducerResult,
  type TaskMapCalendarProducerResultV1,
} from "./calendar-producer-freshness.js";
import type {
  TaskMapNativeSemanticBuilderInputV1,
} from "./native-semantic-builder-adapter.js";
import {
  LLM_STATION_ID,
  createLlmStation,
  type LlmStation,
  type LlmStationEnvelope,
} from "./llm-station.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
  validateMentionExtraction,
  type MentionActor,
  type MentionSpeechActClass,
} from "./mention-extraction.js";
import { normalizeMentionText } from "./mention-normalization.js";
import {
  TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
  TaskMapMeetingExtractionUnavailableError,
  TaskMapPromptTemplateUnavailableError,
  assertPrivateDirectory,
  atomicPrivateWriteNew,
  loadEnvelope,
  readAuthenticatedFile,
  readPromptTemplate,
  replacePrivateFile,
  stationDegradationCode,
  taskMapMentionExtractionEnvelopePath,
  validateEnvelope,
  type TaskMapLlmStationFactory,
  type TaskMapMeetingExtractionDegradationCode,
} from "./meeting-refresh-llm-replay.js";
import {
  taskMapMeetingObligationGate,
  taskMapMeetingStatementReferenceDigest,
} from "./meeting-producer-freshness.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION =
  "taskmap-calendar-extraction-report.v1" as const;
export const TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME =
  "taskmap-calendar-extraction-report.v1.json" as const;
export const TASKMAP_CALENDAR_ENVELOPE_NAMESPACE = "calendar" as const;
export const TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN =
  "taskmap-calendar-mention-identity.1" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const REPORT_KEYS = new Set([
  "contractVersion", "ownerScopeDigest", "resultDigest",
  "promptTemplateDigest", "assessedAt", "segments", "pendingCount",
  "reportDigest",
]);
const SEGMENT_KEYS = new Set([
  "segmentIndex", "inputDigest", "eventIdentityDigests", "status",
  "degradationCode", "envelopeDigest", "envelopeModel",
  "envelopeTransport", "mentions",
]);
const MENTION_KEYS = new Set([
  "text", "title", "speechActClass", "speechActActor", "confidence",
  "mentionIdentityDigest", "proposalDisposition", "promotionEligible",
]);
const SPEECH_ACT_CLASSES = new Set<MentionSpeechActClass>([
  "request", "commitment", "decision", "other",
]);
const SPEECH_ACT_ACTORS = new Set<MentionActor>([
  "self", "other", "unknown",
]);
const DEGRADATION_CODES = new Set<TaskMapMeetingExtractionDegradationCode>([
  "raw_snapshot_unavailable", "raw_snapshot_malformed",
  "raw_snapshot_limit_exceeded", "invalid_note_contract", "no_provider",
  "provider_unauthenticated", "provider_rate_limited", "provider_timeout",
  "provider_nonzero_exit",
  "provider_malformed_wrapper", "provider_empty_output",
  "provider_runner_failure", "invalid_extraction_output",
  "remote_consent_required",
  "envelope_tampered", "envelope_store_unavailable",
]);

export interface TaskMapCalendarExtractionMentionV1 {
  text: string;
  title: string;
  speechActClass: MentionSpeechActClass;
  speechActActor: MentionActor;
  confidence: number;
  mentionIdentityDigest: string;
  proposalDisposition: "context_only" | "candidate_only";
  promotionEligible: boolean;
}

export interface TaskMapCalendarExtractionSegmentReportV1 {
  segmentIndex: number;
  inputDigest: string;
  eventIdentityDigests: string[];
  status: "extracted" | "degraded";
  degradationCode: TaskMapMeetingExtractionDegradationCode | null;
  envelopeDigest: string | null;
  envelopeModel: string | null;
  envelopeTransport: "claude-cli" | "codex-cli" | "gemini-remote" | null;
  mentions: TaskMapCalendarExtractionMentionV1[];
}

export interface TaskMapCalendarExtractionReportV1 {
  contractVersion: typeof TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION;
  ownerScopeDigest: string;
  resultDigest: string;
  promptTemplateDigest: string;
  assessedAt: string;
  segments: TaskMapCalendarExtractionSegmentReportV1[];
  pendingCount: number;
  reportDigest: string;
}

export interface TaskMapCalendarSemanticFragmentV1 {
  ownerScopeDigest: string;
  taskMapInput: TaskMapInput;
  sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"];
  evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"];
}

export interface RefreshTaskMapCalendarExtractionInputV1 {
  result: TaskMapCalendarProducerResultV1;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
  assessedAt: string;
  createStation?: TaskMapLlmStationFactory;
  signal?: AbortSignal;
  persist?: boolean;
}

export interface LoadVerifiedTaskMapCalendarExtractionReportInputV1 {
  result: TaskMapCalendarProducerResultV1;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
}

export interface LoadCurrentTaskMapCalendarExtractionProofInputV1 {
  localExportPath: string;
  googleSnapshotPath: string;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
  currentAssessedAt: string;
}

export interface TaskMapCalendarExtractionProofV1 {
  result: TaskMapCalendarProducerResultV1;
  extraction: TaskMapCalendarExtractionReportV1;
}

function unavailable(code: string, cause?: unknown): never {
  const error = new TaskMapMeetingExtractionUnavailableError(code);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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

function envelopeDigest(envelope: LlmStationEnvelope): string {
  return taskMapContractDigest(envelope);
}

function reportEnvelopeTransport(
  envelope: LlmStationEnvelope,
): "claude-cli" | "codex-cli" | "gemini-remote" {
  if (
    envelope.transport !== "claude-cli"
    && envelope.transport !== "codex-cli"
    && envelope.transport !== "gemini-remote"
  ) unavailable("invalid_extraction_output");
  return envelope.transport;
}

function mentionsFromEnvelope(
  envelope: LlmStationEnvelope,
  body: string,
): TaskMapCalendarExtractionMentionV1[] {
  const byIdentity = new Map<string, {
    representative: ReturnType<typeof validateMentionExtraction>["mentions"][number];
    promotionEligible: boolean;
  }>();
  for (const mention of validateMentionExtraction(envelope.outputJson, body).mentions) {
    const mentionIdentityDigest = taskMapContractDigest({
      domain: TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN,
      normalizedText: normalizeMentionText(mention.text),
    });
    const gate = taskMapMeetingObligationGate(mention.class, mention.actor);
    const current = byIdentity.get(mentionIdentityDigest);
    if (current === undefined) {
      byIdentity.set(mentionIdentityDigest, {
        representative: mention,
        promotionEligible: gate.promotionEligible,
      });
      continue;
    }
    current.promotionEligible &&= gate.promotionEligible;
    if (mention.confidence > current.representative.confidence) {
      current.representative = mention;
    }
  }
  return [...byIdentity.entries()].map(([
    mentionIdentityDigest,
    folded,
  ]) => {
    const mention = folded.representative;
    const gate = taskMapMeetingObligationGate(mention.class, mention.actor);
    return Object.freeze({
      text: mention.text,
      title: mention.title,
      speechActClass: mention.class,
      speechActActor: mention.actor,
      confidence: mention.confidence,
      mentionIdentityDigest,
      proposalDisposition: gate.proposalDisposition,
      promotionEligible: folded.promotionEligible,
    });
  });
}

function degradedRow(
  segment: TaskMapCalendarExtractionSegmentV1,
  degradationCode: TaskMapMeetingExtractionDegradationCode,
): TaskMapCalendarExtractionSegmentReportV1 {
  return {
    segmentIndex: segment.segmentIndex,
    inputDigest: segment.inputDigest,
    eventIdentityDigests: [...segment.eventIdentityDigests],
    status: "degraded",
    degradationCode,
    envelopeDigest: null,
    envelopeModel: null,
    envelopeTransport: null,
    mentions: [],
  };
}

function extractionFailureCode(
  error: unknown,
): TaskMapMeetingExtractionDegradationCode {
  if (error instanceof TaskMapMeetingExtractionUnavailableError) {
    if (error.code === "invalid_extraction_output") {
      return "invalid_extraction_output";
    }
    if (error.code === "envelope_tampered") return "envelope_tampered";
    return "envelope_store_unavailable";
  }
  return stationDegradationCode(error);
}

function finalizeReport(
  report: Omit<TaskMapCalendarExtractionReportV1, "reportDigest">,
): TaskMapCalendarExtractionReportV1 {
  return deepFreeze({
    ...report,
    reportDigest: taskMapContractDigest(report),
  });
}

function assertMention(value: unknown): void {
  if (!isRecord(value) || !hasExactKeys(value, MENTION_KEYS)) {
    unavailable("calendar_extraction_report_malformed");
  }
  if (
    typeof value.text !== "string" || value.text.length === 0
    || typeof value.title !== "string" || value.title.length === 0
    || !SPEECH_ACT_CLASSES.has(value.speechActClass as MentionSpeechActClass)
    || !SPEECH_ACT_ACTORS.has(value.speechActActor as MentionActor)
    || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0 || value.confidence > 1
    || typeof value.mentionIdentityDigest !== "string"
    || !SHA256.test(value.mentionIdentityDigest)
    || (value.proposalDisposition !== "candidate_only"
      && value.proposalDisposition !== "context_only")
    || typeof value.promotionEligible !== "boolean"
  ) unavailable("calendar_extraction_report_malformed");
}

function parseReport(bytes: Buffer): TaskMapCalendarExtractionReportV1 {
  let value: unknown;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(decoded);
    value = JSON.parse(decoded);
  } catch (error) {
    unavailable("calendar_extraction_report_malformed", error);
  }
  if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
    unavailable("calendar_extraction_report_malformed");
  }
  if (
    value.contractVersion !== TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION
    || typeof value.ownerScopeDigest !== "string"
    || !SHA256.test(value.ownerScopeDigest)
    || typeof value.resultDigest !== "string" || !SHA256.test(value.resultDigest)
    || typeof value.promptTemplateDigest !== "string"
    || !SHA256.test(value.promptTemplateDigest)
    || !validTimestamp(value.assessedAt)
    || !Array.isArray(value.segments) || value.segments.length > 22
    || !Number.isSafeInteger(value.pendingCount)
    || (value.pendingCount as number) < 0
    || typeof value.reportDigest !== "string" || !SHA256.test(value.reportDigest)
  ) unavailable("calendar_extraction_report_malformed");
  let pendingCount = 0;
  for (let index = 0; index < value.segments.length; index += 1) {
    const row = value.segments[index];
    if (!isRecord(row) || !hasExactKeys(row, SEGMENT_KEYS)) {
      unavailable("calendar_extraction_report_malformed");
    }
    if (
      row.segmentIndex !== index
      || typeof row.inputDigest !== "string" || !SHA256.test(row.inputDigest)
      || !Array.isArray(row.eventIdentityDigests)
      || row.eventIdentityDigests.length === 0
      || row.eventIdentityDigests.length > 24
      || row.eventIdentityDigests.some((digest) =>
        typeof digest !== "string" || !SHA256.test(digest)
      )
      || (row.status !== "extracted" && row.status !== "degraded")
      || !Array.isArray(row.mentions) || row.mentions.length > 20
    ) unavailable("calendar_extraction_report_malformed");
    row.mentions.forEach(assertMention);
    const seenMentionIdentities = new Set<string>();
    for (const mention of row.mentions) {
      const mentionIdentityDigest = (
        mention as Record<string, unknown>
      ).mentionIdentityDigest as string;
      if (seenMentionIdentities.has(mentionIdentityDigest)) {
        unavailable("calendar_extraction_report_malformed");
      }
      seenMentionIdentities.add(mentionIdentityDigest);
    }
    if (row.status === "degraded") pendingCount += 1;
    if (row.status === "extracted") {
      if (
        row.degradationCode !== null
        || typeof row.envelopeDigest !== "string"
        || !SHA256.test(row.envelopeDigest)
        || typeof row.envelopeModel !== "string" || row.envelopeModel.length === 0
        || (row.envelopeTransport !== "claude-cli"
          && row.envelopeTransport !== "codex-cli"
          && row.envelopeTransport !== "gemini-remote")
      ) unavailable("calendar_extraction_report_malformed");
    } else if (
      typeof row.degradationCode !== "string"
      || !DEGRADATION_CODES.has(
        row.degradationCode as TaskMapMeetingExtractionDegradationCode,
      )
      || row.envelopeDigest !== null || row.envelopeModel !== null
      || row.envelopeTransport !== null || row.mentions.length !== 0
    ) unavailable("calendar_extraction_report_malformed");
  }
  if (pendingCount !== value.pendingCount) {
    unavailable("calendar_extraction_report_malformed");
  }
  const { reportDigest, ...payload } = value;
  if (taskMapContractDigest(payload) !== reportDigest) {
    unavailable("calendar_extraction_report_tampered");
  }
  return value as unknown as TaskMapCalendarExtractionReportV1;
}

function assertInput(
  result: TaskMapCalendarProducerResultV1,
  ownerScopeDigest: string,
): void {
  if (
    !SHA256.test(ownerScopeDigest)
    || result.ownerScopeDigest !== ownerScopeDigest
    || !SHA256.test(result.resultDigest)
    || result.availability !== "available"
  ) unavailable("calendar_result_invalid");
}

export async function refreshTaskMapCalendarExtraction(
  input: RefreshTaskMapCalendarExtractionInputV1,
): Promise<TaskMapCalendarExtractionReportV1> {
  const assertNotAborted = (): void => {
    if (input.signal?.aborted) unavailable("extraction_aborted");
  };
  assertNotAborted();
  assertInput(input.result, input.ownerScopeDigest);
  if (
    !validTimestamp(input.assessedAt)
    || input.result.assessedAt !== input.assessedAt
  ) unavailable("assessed_at_invalid");
  await assertPrivateDirectory(input.runtimeRoot, false);
  let template: Awaited<ReturnType<typeof readPromptTemplate>>;
  try {
    template = await readPromptTemplate(input.promptTemplatePath);
  } catch (error) {
    throw new TaskMapPromptTemplateUnavailableError({ cause: error });
  }
  const sourceSegments = buildTaskMapCalendarExtractionSegments(
    input.result.events,
  );
  const createStation = input.createStation
    ?? ((signal?: AbortSignal) => createLlmStation({ signal }));
  let stationPromise: Promise<LlmStation> | undefined;
  const segments: TaskMapCalendarExtractionSegmentReportV1[] = [];

  for (const segment of sourceSegments) {
    const rendered = renderTaskMapCalendarMentionPrompt(
      template.bytes,
      segment.body,
    );
    let envelope: LlmStationEnvelope | null;
    try {
      envelope = await loadEnvelope(
        input.taskMapRoot,
        rendered,
        segment.body,
        TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
      );
    } catch (error) {
      segments.push(degradedRow(segment, extractionFailureCode(error)));
      continue;
    }
    if (envelope === null) {
      stationPromise ??= createStation(input.signal);
      let station: LlmStation;
      try {
        station = await stationPromise;
      } catch (error) {
        segments.push(degradedRow(segment, stationDegradationCode(error)));
        continue;
      }
      try {
        assertNotAborted();
        const candidate = await station.run({
          stationId: LLM_STATION_ID,
          promptText: rendered.promptText,
          inputDigest: rendered.inputDigest,
          signal: input.signal,
        });
        assertNotAborted();
        envelope = validateEnvelope(
          candidate,
          rendered,
          segment.body,
          "invalid_extraction_output",
        );
        if (input.persist !== false) {
          assertNotAborted();
          await atomicPrivateWriteNew(
            taskMapMentionExtractionEnvelopePath(
              input.taskMapRoot,
              rendered.inputDigest,
              TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
            ),
            envelope,
          );
          assertNotAborted();
          const durable = await loadEnvelope(
            input.taskMapRoot,
            rendered,
            segment.body,
            TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
          );
          if (durable === null) unavailable("envelope_store_unavailable");
          envelope = durable;
        }
      } catch (error) {
        segments.push(degradedRow(segment, extractionFailureCode(error)));
        continue;
      }
    }
    segments.push({
      segmentIndex: segment.segmentIndex,
      inputDigest: segment.inputDigest,
      eventIdentityDigests: [...segment.eventIdentityDigests],
      status: "extracted",
      degradationCode: null,
      envelopeDigest: envelopeDigest(envelope),
      envelopeModel: envelope.model,
      envelopeTransport: reportEnvelopeTransport(envelope),
      mentions: mentionsFromEnvelope(envelope, segment.body),
    });
  }
  const report = finalizeReport({
    contractVersion: TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    resultDigest: input.result.resultDigest,
    promptTemplateDigest: template.digest,
    assessedAt: input.assessedAt,
    segments,
    pendingCount: segments.filter((segment) => segment.status === "degraded").length,
  });
  assertNotAborted();
  if (input.persist === false) return report;
  await replacePrivateFile(
    path.join(input.runtimeRoot, TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME),
    report,
  );
  const verified = await loadVerifiedTaskMapCalendarExtractionReport({
    result: input.result,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
  });
  if (verified === null) unavailable("calendar_extraction_report_stale");
  return verified;
}

/**
 * Reconstructs the producer result at the authenticated report's original
 * assessment instant, then delegates every proof check to the verified loader.
 */
export async function loadCurrentTaskMapCalendarExtractionProof(
  input: LoadCurrentTaskMapCalendarExtractionProofInputV1,
): Promise<TaskMapCalendarExtractionProofV1 | null> {
  const current = await loadTaskMapCalendarProducerResult({
    localExportPath: input.localExportPath,
    googleSnapshotPath: input.googleSnapshotPath,
    assessedAt: input.currentAssessedAt,
    expectedOwnerScopeDigest: input.ownerScopeDigest,
  });
  if (current.availability !== "available") return null;
  const reportPath = path.join(
    input.runtimeRoot,
    TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME,
  );
  try {
    await lstat(reportPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let persisted: TaskMapCalendarExtractionReportV1;
  try {
    const reportFile = await readAuthenticatedFile(
      reportPath,
      TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
      "owner_private",
    );
    persisted = parseReport(reportFile.bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (persisted.ownerScopeDigest !== input.ownerScopeDigest) return null;
  const result = await loadTaskMapCalendarProducerResult({
    localExportPath: input.localExportPath,
    googleSnapshotPath: input.googleSnapshotPath,
    assessedAt: persisted.assessedAt,
    expectedOwnerScopeDigest: input.ownerScopeDigest,
  });
  if (result.availability !== "available") return null;
  const extraction = await loadVerifiedTaskMapCalendarExtractionReport({
    result,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
  });
  return extraction === null ? null : deepFreeze({ result, extraction });
}

export async function loadVerifiedTaskMapCalendarExtractionReport(
  input: LoadVerifiedTaskMapCalendarExtractionReportInputV1,
): Promise<TaskMapCalendarExtractionReportV1 | null> {
  assertInput(input.result, input.ownerScopeDigest);
  const reportPath = path.join(
    input.runtimeRoot,
    TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME,
  );
  try {
    await lstat(reportPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    unavailable("calendar_extraction_report_unavailable", error);
  }
  const [template, reportFile] = await Promise.all([
    readPromptTemplate(input.promptTemplatePath),
    readAuthenticatedFile(
      reportPath,
      TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
      "owner_private",
    ),
  ]);
  const report = parseReport(reportFile.bytes);
  if (
    report.ownerScopeDigest !== input.ownerScopeDigest
    || report.resultDigest !== input.result.resultDigest
    || report.promptTemplateDigest !== template.digest
  ) return null;
  const sourceSegments = buildTaskMapCalendarExtractionSegments(
    input.result.events,
  );
  if (report.segments.length !== sourceSegments.length) return null;
  for (const [index, row] of report.segments.entries()) {
    const segment = sourceSegments[index];
    if (
      segment === undefined
      || row.inputDigest !== segment.inputDigest
      || taskMapContractCanonicalJson(row.eventIdentityDigests)
        !== taskMapContractCanonicalJson(segment.eventIdentityDigests)
    ) return null;
    if (row.status === "extracted") {
      const rendered = renderTaskMapCalendarMentionPrompt(
        template.bytes,
        segment.body,
      );
      const envelope = await loadEnvelope(
        input.taskMapRoot,
        rendered,
        segment.body,
        TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
      );
      if (
        envelope === null
        || row.envelopeDigest !== envelopeDigest(envelope)
        || row.envelopeModel !== envelope.model
        || row.envelopeTransport !== envelope.transport
        || taskMapContractCanonicalJson(row.mentions)
          !== taskMapContractCanonicalJson(
            mentionsFromEnvelope(envelope, segment.body),
          )
      ) unavailable("calendar_extraction_report_tampered");
    }
  }
  return deepFreeze(report);
}

export function buildTaskMapCalendarSemanticFragment(
  result: TaskMapCalendarProducerResultV1,
  report: TaskMapCalendarExtractionReportV1,
): TaskMapCalendarSemanticFragmentV1 {
  assertInput(result, report.ownerScopeDigest);
  if (
    report.resultDigest !== result.resultDigest
    || report.ownerScopeDigest !== result.ownerScopeDigest
  ) unavailable("calendar_extraction_report_stale");
  const eventByIdentity = new Map(result.events.map((event) => [
    event.eventIdentityDigest,
    event,
  ] as const));
  const representativeByMention = new Map<
    string,
    TaskMapCalendarExtractionMentionV1
  >();
  for (const segment of report.segments) {
    if (segment.status !== "extracted") continue;
    for (const mention of segment.mentions) {
      const current = representativeByMention.get(
        mention.mentionIdentityDigest,
      );
      if (
        current === undefined
        || mention.confidence > current.confidence
        || (
          mention.confidence === current.confidence
          && mention.title.localeCompare(current.title) < 0
        )
      ) {
        representativeByMention.set(mention.mentionIdentityDigest, mention);
      }
    }
  }
  const pointers = new Map<string, TaskMapSourcePointer>();
  const sourceBindings = new Map<
    string,
    TaskMapNativeSemanticBuilderInputV1["sourceBindings"][number]
  >();
  const events: TaskMapEvent[] = [];
  const evidenceBindings:
    TaskMapNativeSemanticBuilderInputV1["evidenceBindings"] = [];
  for (const segment of report.segments) {
    if (segment.status !== "extracted") continue;
    for (const eventIdentityDigest of segment.eventIdentityDigests) {
      const calendarEvent = eventByIdentity.get(eventIdentityDigest);
      if (calendarEvent === undefined) {
        unavailable("calendar_extraction_report_stale");
      }
      const pointerId = `tmcalptr_${eventIdentityDigest.slice(0, 16)}`;
      pointers.set(pointerId, {
        id: pointerId,
        sourceKind: calendarEvent.provider,
        sourceObjectId: eventIdentityDigest,
        sourceRefHash: eventIdentityDigest,
        sourceVersion: calendarEvent.revisionDigest,
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      });
      sourceBindings.set(pointerId, {
        pointerId,
        semanticClass: "context_only",
        semanticOriginId: `calendar-${segment.segmentIndex}`,
        semanticIdentityDigest: eventIdentityDigest,
        sourceIdentityDigest: eventIdentityDigest,
        observedRevision: calendarEvent.revisionDigest,
        evidenceRevision: calendarEvent.revisionDigest,
        observedContentDigest: calendarEvent.revisionDigest,
        evidenceContentDigest: calendarEvent.revisionDigest,
      });
      for (const mention of segment.mentions) {
        const representative = representativeByMention.get(
          mention.mentionIdentityDigest,
        )!;
        const eventId = `tmcalevent_${taskMapContractDigest({
          eventIdentityDigest,
          mentionIdentityDigest: mention.mentionIdentityDigest,
          segmentIndex: segment.segmentIndex,
        }).slice(0, 16)}`;
        const candidateKind = mention.speechActClass === "commitment"
          ? "commitment" as const
          : "action_item" as const;
        const candidateIdentityRef = `external:${
          taskMapMeetingStatementReferenceDigest({
            kind: candidateKind,
            title: representative.title,
            summary: representative.text,
            explicitExternalReferenceDigests: [],
            mentionIdentityDigest: mention.mentionIdentityDigest,
          })
        }`;
        events.push({
          id: eventId,
          pointerId,
          recordKind: "work_context",
          activity: mention.proposalDisposition === "candidate_only"
            ? "commitment_stated"
            : "context_observed",
          occurredAt: calendarEvent.startAt < report.assessedAt
            ? calendarEvent.startAt
            : report.assessedAt,
          observedAt: report.assessedAt,
          objectRefs: mention.proposalDisposition === "candidate_only"
            ? [candidateIdentityRef]
            : [],
          title: representative.title,
          summary: representative.text,
          extractionConfidence: mention.confidence,
          bodyJoinEligible: false,
        });
        evidenceBindings.push(
          mention.proposalDisposition === "candidate_only"
            ? {
                eventId,
                disposition: "candidate_only",
                candidateIdentityRef,
                candidateKind,
                mentionIdentityDigest: mention.mentionIdentityDigest,
                rootLinkRefs: [],
              }
            : {
                eventId,
                disposition: "context_only",
                rootLinkRefs: [],
              },
        );
      }
    }
  }
  return deepFreeze({
    ownerScopeDigest: report.ownerScopeDigest,
    taskMapInput: {
      contractVersion: TASKMAP_CONTRACT_VERSION,
      generatedAt: report.assessedAt,
      pointers: [...pointers.values()].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
      events: events.sort((left, right) => left.id.localeCompare(right.id)),
    },
    sourceBindings: [...sourceBindings.values()].sort((left, right) =>
      left.pointerId.localeCompare(right.pointerId)
    ),
    evidenceBindings: evidenceBindings.sort((left, right) =>
      left.eventId.localeCompare(right.eventId)
    ),
  });
}
