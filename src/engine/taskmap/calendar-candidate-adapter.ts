import type {
  TaskMapCalendarProducerEventV1,
  TaskMapCalendarProducerResultV1,
} from "./calendar-producer-freshness.js";
import type {
  TaskMapCalendarExtractionMentionV1,
  TaskMapCalendarExtractionReportV1,
  TaskMapCalendarExtractionSegmentReportV1,
} from "./calendar-refresh-llm-replay.js";
import {
  TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1,
  TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
  applyTaskMapNativeCandidateReviewToProofRows,
  assertTaskMapNativeCandidateReview,
  assertTaskMapNativeCandidateShelfV2,
  buildTaskMapNativeCandidateReviewFromProofRows,
  taskMapCalendarCandidateStatementReferenceDigest,
  taskMapNativeCandidateId,
  taskMapNativeCandidateRevisionDigest,
  type TaskMapNativeCandidateCalendarShelfRowV2,
  type TaskMapNativeCandidateProofRowsContextV1,
  type TaskMapNativeCandidateReviewV1,
  type TaskMapNativeCandidateShelfRowV1,
  type TaskMapNativeCandidateShelfV2,
} from "./native-candidate-review.js";
import { taskMapContractDigest } from "./source-contracts.js";
import { boundedUtf16 } from "./text-contract.js";

export const TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN =
  "taskmap-calendar-candidate-evidence.1" as const;

export interface BuildTaskMapCalendarCandidateReviewInputV1 {
  result: TaskMapCalendarProducerResultV1;
  extraction: TaskMapCalendarExtractionReportV1;
  previous: TaskMapNativeCandidateReviewV1 | null;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
}

export interface BuildTaskMapCalendarCandidateShelfInputV1 {
  result: TaskMapCalendarProducerResultV1;
  extraction: TaskMapCalendarExtractionReportV1;
  overlay: TaskMapNativeCandidateReviewV1;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
}

export interface TaskMapCalendarCandidateReviewProjectionV1 {
  overlay: TaskMapNativeCandidateReviewV1;
  shelf: TaskMapNativeCandidateShelfV2;
}

interface CalendarMentionOccurrence {
  segment: TaskMapCalendarExtractionSegmentReportV1;
  mention: TaskMapCalendarExtractionMentionV1;
  events: TaskMapCalendarProducerEventV1[];
}

interface DerivedCalendarCandidates {
  context: TaskMapNativeCandidateProofRowsContextV1;
  rows: TaskMapNativeCandidateCalendarShelfRowV2[];
}

function fail(message: string): never {
  throw new Error(`Task Map calendar candidate adapter: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length
    || actual.some((key, index) => key !== keys[index])
  ) fail(`${label} has unexpected or missing fields`);
}

function canonicalAssessedAt(value: unknown): string {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail("assessedAt must be a canonical timestamp");
  return value;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function mentionKind(
  mention: TaskMapCalendarExtractionMentionV1,
): "action_item" | "commitment" | "decision" {
  return mention.speechActClass === "commitment" ? "commitment"
    : mention.speechActClass === "decision" ? "decision"
      : "action_item";
}

function occurrenceProofs(
  ownerScopeDigest: string,
  occurrence: CalendarMentionOccurrence,
): string[] {
  if (occurrence.segment.envelopeDigest === null) {
    fail("extracted segment has no station envelope");
  }
  if (occurrence.events.length === 0) {
    fail("extracted segment has no current calendar events");
  }
  return occurrence.events.map((event) => taskMapContractDigest({
    domain: TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN,
    ownerScopeDigest,
    mentionIdentityDigest: occurrence.mention.mentionIdentityDigest,
    envelopeDigest: occurrence.segment.envelopeDigest,
    inputDigest: occurrence.segment.inputDigest,
    eventIdentityDigest: event.eventIdentityDigest,
    eventRevisionDigest: event.revisionDigest,
  }));
}

function deriveCalendarCandidates(
  result: TaskMapCalendarProducerResultV1,
  extraction: TaskMapCalendarExtractionReportV1,
  expectedOwnerScopeDigest: string,
  assessedAtInput: string,
): DerivedCalendarCandidates {
  const assessedAt = canonicalAssessedAt(assessedAtInput);
  if (
    result.ownerScopeDigest !== expectedOwnerScopeDigest
    || extraction.ownerScopeDigest !== expectedOwnerScopeDigest
  ) fail("calendar input belongs to another owner");
  if (extraction.resultDigest !== result.resultDigest) {
    fail("extraction does not match current calendar result");
  }
  if (result.availability !== "available") {
    fail("calendar result is unavailable");
  }
  const eventByIdentity = new Map(result.events.map((event) => [
    event.eventIdentityDigest,
    event,
  ]));
  const occurrences = extraction.segments.flatMap((segment) => {
    if (segment.status === "degraded") return [];
    const events = segment.eventIdentityDigests.map((identity) => {
      const event = eventByIdentity.get(identity);
      if (event === undefined) fail("extraction segment has no current event");
      return event;
    });
    return segment.mentions.map((mention) => ({ segment, mention, events }));
  });
  const byMention = new Map<string, CalendarMentionOccurrence[]>();
  for (const occurrence of occurrences) {
    const identity = occurrence.mention.mentionIdentityDigest;
    const current = byMention.get(identity) ?? [];
    current.push(occurrence);
    byMention.set(identity, current);
  }
  const rows = [...byMention.entries()].map(([mentionIdentityDigest, rows]) => {
    const ordered = [...rows].sort((left, right) =>
      right.mention.confidence - left.mention.confidence
      || left.segment.segmentIndex - right.segment.segmentIndex
      || compareCodePoints(left.segment.inputDigest, right.segment.inputDigest)
    );
    const representative = ordered[0]!;
    const statementReferenceDigest =
      taskMapCalendarCandidateStatementReferenceDigest(
        result.ownerScopeDigest,
        mentionIdentityDigest,
      );
    const candidateId = taskMapNativeCandidateId(
      result.ownerScopeDigest,
      statementReferenceDigest,
    );
    const proofDigests = [...new Set(ordered.flatMap((occurrence) =>
      occurrenceProofs(result.ownerScopeDigest, occurrence)
    ))].sort(compareCodePoints);
    const candidateRevisionDigest = taskMapNativeCandidateRevisionDigest(
      candidateId,
      proofDigests,
    );
    const earliestEventStart = ordered.flatMap((occurrence) => occurrence.events)
      .reduce((earliest, event) =>
        event.startAt < earliest ? event.startAt : earliest,
      ordered[0]!.events[0]!.startAt);
    const occurredAt = earliestEventStart < assessedAt
      ? earliestEventStart
      : assessedAt;
    return {
      candidateId,
      candidateRevisionDigest,
      statementReferenceDigest,
      evidenceProofDigests: proofDigests,
      candidateFamily: "calendar" as const,
      kind: mentionKind(representative.mention),
      title: boundedUtf16(
        representative.mention.title,
        TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters,
      ),
      summary: boundedUtf16(
        representative.mention.text,
        TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters,
      ),
      speechActClass: representative.mention.speechActClass,
      speechActActor: representative.mention.speechActActor,
      confidence: Math.max(...ordered.map((row) => row.mention.confidence)),
      mentionIdentityDigest,
      sourceKinds: ["calendar" as const],
      originIdentityDigest: mentionIdentityDigest,
      supportSetRevisionDigest: candidateRevisionDigest,
      proposalDisposition: representative.mention.proposalDisposition,
      occurredAt,
      observedAt: assessedAt,
      reviewState: "unreviewed" as const,
      reviewedAt: null,
      reviewedOnly: false,
      promotionEligible: ordered.every((row) =>
        row.mention.promotionEligible === true
      ),
      acceptedWork: false as const,
      sourceWritebackEligible: false as const,
      rankEligible: false as const,
      routeEligible: false as const,
      proveEligible: false as const,
      runEligible: false as const,
    } satisfies TaskMapNativeCandidateCalendarShelfRowV2;
  }).sort((left, right) => compareCodePoints(left.candidateId, right.candidateId));
  const context: TaskMapNativeCandidateProofRowsContextV1 = {
    ownerScopeDigest: result.ownerScopeDigest,
    producerResultDigest: extraction.reportDigest,
    producerSnapshotDigest: result.resultDigest,
    producedAt: result.assessedAt,
    assessedAt,
    candidates: rows as unknown as TaskMapNativeCandidateShelfRowV1[],
  };
  return { context, rows };
}

function shelfFromDerived(
  derived: DerivedCalendarCandidates,
  overlay: TaskMapNativeCandidateReviewV1,
): TaskMapNativeCandidateShelfV2 {
  assertTaskMapNativeCandidateReview(overlay);
  if (
    overlay.ownerScopeDigest !== derived.context.ownerScopeDigest
    || overlay.producerResultDigest !== derived.context.producerResultDigest
    || overlay.producerSnapshotDigest !== derived.context.producerSnapshotDigest
  ) fail("candidate overlay does not match current calendar evidence");
  const reviewed = applyTaskMapNativeCandidateReviewToProofRows({
    context: derived.context,
    overlay,
  });
  const candidates = reviewed.map((reviewedRow) => {
    const display = derived.rows.find((row) =>
      row.candidateId === reviewedRow.candidateId
    );
    if (display === undefined) fail("review row has no current candidate proof");
    return {
      ...display,
      reviewState: reviewedRow.reviewState,
      reviewedAt: reviewedRow.reviewedAt,
      reviewedOnly: reviewedRow.reviewedOnly,
    };
  });
  const shelf: TaskMapNativeCandidateShelfV2 = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
    ownerScopeDigest: derived.context.ownerScopeDigest,
    producerResultDigest: derived.context.producerResultDigest,
    producerSnapshotDigest: derived.context.producerSnapshotDigest,
    assessedAt: derived.context.assessedAt,
    candidates,
    displayTextPersistence: "memory_only",
  };
  assertTaskMapNativeCandidateShelfV2(shelf);
  return deepFreeze(shelf);
}

export function buildTaskMapCalendarCandidateShelf(
  input: BuildTaskMapCalendarCandidateShelfInputV1,
): TaskMapNativeCandidateShelfV2 {
  assertExactKeys(input, [
    "assessedAt", "expectedOwnerScopeDigest", "extraction", "overlay", "result",
  ], "calendar candidate shelf input");
  const derived = deriveCalendarCandidates(
    input.result,
    input.extraction,
    input.expectedOwnerScopeDigest,
    input.assessedAt,
  );
  return shelfFromDerived(derived, input.overlay);
}

export function buildTaskMapCalendarCandidateReview(
  input: BuildTaskMapCalendarCandidateReviewInputV1,
): TaskMapCalendarCandidateReviewProjectionV1 {
  assertExactKeys(input, [
    "assessedAt", "expectedOwnerScopeDigest", "extraction", "previous", "result",
  ], "calendar candidate review input");
  const derived = deriveCalendarCandidates(
    input.result,
    input.extraction,
    input.expectedOwnerScopeDigest,
    input.assessedAt,
  );
  const overlay = buildTaskMapNativeCandidateReviewFromProofRows({
    context: derived.context,
    previous: input.previous,
  });
  const shelf = shelfFromDerived(derived, overlay);
  return deepFreeze({ overlay, shelf });
}
