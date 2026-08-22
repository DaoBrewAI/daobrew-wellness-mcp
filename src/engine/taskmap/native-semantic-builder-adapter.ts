import { createHash } from "node:crypto";
import {
  TASKMAP_ALGORITHM_POLICY,
  buildTaskMapProjection,
  taskMapInputDigest,
  taskMapInputValidationReasons,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInput,
  taskMapSemanticInputDigest,
} from "./harness.js";
import {
  TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  assertTaskMapMeetingProducerResult,
  taskMapMeetingStatementReferenceDigest,
  type TaskMapMeetingProducerResultV1,
} from "./meeting-producer-freshness.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  evaluateTaskMapOwnerBodyPatterns,
  type TaskMapBodyPatternResultV1,
} from "./body-causal-assessment.js";
import type {
  TaskMapPhysiologicalSemanticContextV1,
} from "./physiological-source-snapshot.js";
import {
  assertTaskMapNativeCandidateAcceptanceStore,
  taskMapNativeCandidateAcceptanceManualAuthorityRecords,
  type TaskMapNativeCandidateAcceptanceStoreV1,
} from "./native-candidate-acceptance.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type BrainRootProposal,
  type BrainTaskOpenState,
  type BrainTaskProposal,
  type RootCausalGateInput,
  type SemanticBrainOutput,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION =
  "taskmap-native-semantic-builder-input.v1" as const;
export const TASKMAP_NATIVE_SEMANTIC_BUILDER_VERSION =
  "taskmap-native-semantic-builder.1" as const;
export const TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION =
  "taskmap-native-body-pattern-build.v1" as const;
export const TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1 = Object.freeze({
  maximumPointers: 128,
  maximumSemanticEvents: 128,
  // The accepted owner input retains a 90-day body history. A closed 512-row
  // total keeps that history plus bounded delta/replay headroom while rejecting
  // hostile body-only arrays before harness validation.
  maximumTotalEvents: 512,
  acceptedOwnerBodyHistoryDays: 90,
  maximumSourceBindings: 128,
  maximumEvidenceBindings: 512,
  bodyFreshnessWindowMs: TASKMAP_ALGORITHM_POLICY.bodyFreshnessWindowMs,
});

export type TaskMapNativeSemanticFreshnessDecision =
  | "fresh"
  | "boundary_due"
  | "stale"
  | "missing"
  | "unknown_version"
  | "malformed";

export interface TaskMapNativeSemanticSourceBindingV1 {
  pointerId: string;
  semanticClass:
    | "source_authoritative"
    | "meeting_context"
    | "context_only"
    | "body_context";
  /**
   * One canonical source occurrence. Provider variants of one meeting must
   * share this value and therefore cannot count as independent support.
   */
  semanticOriginId: string;
  /** Content-stable identity used by TaskMap membership and replay. */
  semanticIdentityDigest: string;
  /** Exact producer/source identity, which may include an opaque revision. */
  sourceIdentityDigest: string;
  observedRevision: string;
  evidenceRevision: string;
  observedContentDigest: string;
  evidenceContentDigest: string;
}

export interface TaskMapNativeSemanticEvidenceBindingV1 {
  eventId: string;
  disposition:
    | "source_authoritative"
    | "candidate_only"
    | "context_only"
    | "body_only";
  /**
   * Stable explicit-item identity. For meeting evidence this is the producer's
   * domain-separated statement reference, excluding mutable lifecycle facets.
   */
  candidateIdentityRef?: string;
  candidateKind?: "action_item" | "commitment";
  /** Normalized v1 meeting mention identity; absent for legacy evidence. */
  mentionIdentityDigest?: string;
  /**
   * Stable external work/source references used only to select a root.
   * Meeting/source provenance never appears here.
   */
  rootLinkRefs: string[];
}

export interface TaskMapNativeSemanticBuilderInputV1 {
  contractVersion: typeof TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION;
  ownerScopeDigest: string;
  producer: {
    id: typeof TASKMAP_MEETING_PRODUCER_RESULT_VERSION;
    version: typeof TASKMAP_MEETING_PRODUCER_VERSION;
  };
  freshness: {
    decision: TaskMapNativeSemanticFreshnessDecision;
    available: boolean;
    retainedLastGood: boolean;
    producedAt: string;
    validThrough: string;
    assessedAt: string;
  };
  sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
  evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
  taskMapInput: TaskMapInput;
}

export interface TaskMapNativeSemanticBuilderOptions {
  previousProjection?: TaskMapProjectionV1;
  /** Digest from the authenticated predecessor currentness companion. */
  previousProjectionDigest?: string;
  causalInputs?: RootCausalGateInput[];
  /** Required proof-chain context for any current manual authoritative input. */
  candidateAcceptanceStore?: TaskMapNativeCandidateAcceptanceStoreV1;
}

export interface TaskMapNativeMeetingSemanticBuilderOptions
  extends TaskMapNativeSemanticBuilderOptions {
  expectedOwnerScopeDigest: string;
}

export interface TaskMapNativeMeetingBodySemanticBuilderOptions
  extends Omit<TaskMapNativeSemanticBuilderOptions, "causalInputs"> {
  expectedOwnerScopeDigest: string;
}

export interface TaskMapNativeBodyPatternBuildResultV1 {
  contractVersion: typeof TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION;
  projection: TaskMapProjectionV1;
  bodyPatternResults: TaskMapBodyPatternResultV1[];
}

export type TaskMapNativeSemanticBuilderFailureCode =
  | "invalid_contract"
  | "invalid_freshness"
  | "invalid_source_binding"
  | "input_limit_exceeded"
  | "invalid_predecessor"
  | "owner_scope_mismatch"
  | "harness_rejected"
  | "no_eligible_work"
  | "predecessor_continuity_required";

export class TaskMapNativeSemanticBuilderUnavailableError extends Error {
  constructor(
    readonly code: TaskMapNativeSemanticBuilderFailureCode,
  ) {
    super(`Task Map semantic builder unavailable: ${code}`);
    this.name = "TaskMapNativeSemanticBuilderUnavailableError";
  }
}

const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_REVISION = /^[^\u0000-\u001f\u007f]{1,512}$/;
const EXTERNAL_WORK_REF = /^external:[a-f0-9]{64}$/;
const CANONICAL_MEETING_REF = /^canonical-meeting:([a-f0-9]{64})$/;
const SOURCE_AUTHORITATIVE_KINDS = new Set([
  "linear",
  "jira",
  "github",
  "google_tasks",
  "strategy",
  "manual",
]);
const MEETING_CONTEXT_KINDS = new Set(["gemini_meet", "granola"]);
const BODY_CONTEXT_KINDS = new Set(["oura"]);
const TASKMAP_NATIVE_MEETING_SEMANTIC_IDENTITY_DOMAIN =
  "taskmap-native-meeting-semantic-identity.1" as const;
const DETERMINISTIC_POLICY = Object.freeze({
  version: TASKMAP_NATIVE_SEMANTIC_BUILDER_VERSION,
  authoritativeRecordKind: "authoritative_task",
  candidateRecordKind: "work_context",
  candidateActivity: "commitment_stated",
  rootGrouping: "authoritative-link-or-candidate-identity",
  candidateGrouping: "explicit-statement-identity",
  contextPromotion: false,
  bodyMembership: false,
});
const DETERMINISTIC_PROMPT_HASH = digest(DETERMINISTIC_POLICY);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(input)
      .sort()
      .filter((key) => input[key] !== undefined)
      .map((key) => [key, canonicalize(input[key])]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${digest(value).slice(0, 16)}`;
}

function strictTimestamp(value: string): boolean {
  const match = STRICT_RFC3339.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, , offsetHour, offsetMinute] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (
    month < 1
    || month > 12
    || day < 1
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    return false;
  }
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
  if (
    zone !== "Z"
    && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)
  ) {
    return false;
  }
  return true;
}

function fail(code: TaskMapNativeSemanticBuilderFailureCode): never {
  throw new TaskMapNativeSemanticBuilderUnavailableError(code);
}

function validateFreshness(
  input: TaskMapNativeSemanticBuilderInputV1,
): void {
  const { freshness } = input;
  if (
    freshness.decision !== "fresh"
    || freshness.available !== true
    || freshness.retainedLastGood !== false
    || !strictTimestamp(freshness.producedAt)
    || !strictTimestamp(freshness.validThrough)
    || !strictTimestamp(freshness.assessedAt)
  ) {
    fail("invalid_freshness");
  }
  const producedAtMs = Date.parse(freshness.producedAt);
  const validThroughMs = Date.parse(freshness.validThrough);
  const assessedAtMs = Date.parse(freshness.assessedAt);
  if (
    validThroughMs <= producedAtMs
    || validThroughMs - producedAtMs
      !== TASKMAP_MEETING_PRODUCER_MAX_AGE_MS
    || assessedAtMs < producedAtMs
    || assessedAtMs >= validThroughMs
  ) {
    fail("invalid_freshness");
  }
}

function validateAbsoluteInputLimits(
  input: TaskMapNativeSemanticBuilderInputV1,
): void {
  if (
    input.taskMapInput.pointers.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumPointers
    || input.taskMapInput.events.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumTotalEvents
    || input.sourceBindings.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumSourceBindings
    || input.evidenceBindings.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumEvidenceBindings
  ) {
    fail("input_limit_exceeded");
  }
}

function validateSourceBindings(
  input: TaskMapNativeSemanticBuilderInputV1,
  enforceSemanticEventLimit = true,
): void {
  if (
    enforceSemanticEventLimit
    && taskMapSemanticInput(input.taskMapInput).events.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumSemanticEvents
  ) {
    fail("input_limit_exceeded");
  }

  const pointers = new Map(
    input.taskMapInput.pointers.map((pointer) => [pointer.id, pointer]),
  );
  const events = new Map(
    input.taskMapInput.events.map((event) => [event.id, event]),
  );
  const eventsByPointer = new Map<string, TaskMapEvent[]>();
  for (const event of events.values()) {
    const pointerEvents = eventsByPointer.get(event.pointerId) ?? [];
    pointerEvents.push(event);
    eventsByPointer.set(event.pointerId, pointerEvents);
  }
  const candidateEventIds = new Set(
    input.evidenceBindings
      .filter((binding) => binding.disposition === "candidate_only")
      .map((binding) => binding.eventId),
  );
  const bindingCounts = new Map<string, number>();
  for (const binding of input.sourceBindings) {
    bindingCounts.set(
      binding.pointerId,
      (bindingCounts.get(binding.pointerId) ?? 0) + 1,
    );
    const pointer = pointers.get(binding.pointerId);
    const semanticClassMatches = pointer !== undefined && (
      (
        binding.semanticClass === "source_authoritative"
        && SOURCE_AUTHORITATIVE_KINDS.has(pointer.sourceKind)
        && (
          pointer.authority === "source_system"
          || pointer.authority === "user"
        )
        && pointer.capabilities.includes("read_task")
      )
      || (
        binding.semanticClass === "meeting_context"
        && MEETING_CONTEXT_KINDS.has(pointer.sourceKind)
        && pointer.authority === "none"
        && pointer.syncMode === "reference_only"
        && pointer.capabilities.includes("read_context")
      )
      || (
        binding.semanticClass === "context_only"
        && !SOURCE_AUTHORITATIVE_KINDS.has(pointer.sourceKind)
        && !MEETING_CONTEXT_KINDS.has(pointer.sourceKind)
        && !BODY_CONTEXT_KINDS.has(pointer.sourceKind)
        && pointer.authority === "none"
        && pointer.capabilities.includes("read_context")
      )
      || (
        binding.semanticClass === "body_context"
        && BODY_CONTEXT_KINDS.has(pointer.sourceKind)
        && pointer.authority === "none"
      )
    );
    const pointerEvents = eventsByPointer.get(binding.pointerId) ?? [];
    const candidateEvents = pointerEvents.filter((event) =>
      candidateEventIds.has(event.id)
    );
    const canonicalMeetingDigests = new Set(
      pointerEvents.flatMap((event) =>
        event.objectRefs.flatMap((ref) => {
          const match = CANONICAL_MEETING_REF.exec(ref);
          return match === null ? [] : [match[1]];
        })
      ),
    );
    const meetingOriginMatches =
      binding.semanticClass !== "meeting_context"
        ? SAFE_LABEL.test(binding.semanticOriginId)
        : candidateEvents.length === 0
          ? SAFE_LABEL.test(binding.semanticOriginId)
          : canonicalMeetingDigests.size === 1
            && binding.semanticOriginId === [...canonicalMeetingDigests][0]
            && candidateEvents.every((event) =>
              event.objectRefs.filter((ref) =>
                CANONICAL_MEETING_REF.test(ref)
              ).length === 1
            );
    if (
      pointer === undefined
      || !semanticClassMatches
      || !meetingOriginMatches
      || !HEX_DIGEST.test(binding.semanticIdentityDigest)
      || !HEX_DIGEST.test(binding.sourceIdentityDigest)
      || !SAFE_REVISION.test(binding.observedRevision)
      || !SAFE_REVISION.test(binding.evidenceRevision)
      || !HEX_DIGEST.test(binding.observedContentDigest)
      || !HEX_DIGEST.test(binding.evidenceContentDigest)
      || binding.observedRevision !== binding.evidenceRevision
      || binding.observedContentDigest !== binding.evidenceContentDigest
      || pointer.sourceRefHash !== binding.semanticIdentityDigest
      || pointer.sourceVersion !== binding.evidenceContentDigest
    ) {
      fail("invalid_source_binding");
    }
  }
  if (
    input.sourceBindings.length !== pointers.size
    || [...pointers.keys()].some(
      (pointerId) => bindingCounts.get(pointerId) !== 1,
    )
  ) {
    fail("invalid_source_binding");
  }

  const sourceBindings = new Map(
    input.sourceBindings.map((binding) => [binding.pointerId, binding]),
  );
  const evidenceBindingCounts = new Map<string, number>();
  for (const binding of input.evidenceBindings) {
    evidenceBindingCounts.set(
      binding.eventId,
      (evidenceBindingCounts.get(binding.eventId) ?? 0) + 1,
    );
    const event = events.get(binding.eventId);
    const sourceBinding = event === undefined
      ? undefined
      : sourceBindings.get(event.pointerId);
    const rootLinkRefsAreValid = Array.isArray(binding.rootLinkRefs)
      && binding.rootLinkRefs.every((item) => EXTERNAL_WORK_REF.test(item))
      && new Set(binding.rootLinkRefs).size === binding.rootLinkRefs.length
      && binding.rootLinkRefs.every((item) => event?.objectRefs.includes(item));
    const eventExternalRefs = new Set(
      event?.objectRefs.filter((item) => EXTERNAL_WORK_REF.test(item)) ?? [],
    );
    const boundExternalRefs = new Set([
      ...binding.rootLinkRefs,
      ...(binding.candidateIdentityRef === undefined
        ? []
        : [binding.candidateIdentityRef]),
    ]);
    const externalRemainderIsExact =
      binding.disposition !== "source_authoritative"
        && binding.disposition !== "candidate_only"
        ? true
        : eventExternalRefs.size === boundExternalRefs.size
          && [...eventExternalRefs].every((ref) =>
            boundExternalRefs.has(ref)
          );
    const candidateIdentityIsValid =
      binding.candidateIdentityRef === undefined
        ? binding.candidateKind === undefined
          && binding.mentionIdentityDigest === undefined
        : EXTERNAL_WORK_REF.test(binding.candidateIdentityRef)
          && event?.objectRefs.includes(binding.candidateIdentityRef) === true
          && (
            binding.candidateKind === "action_item"
            || binding.candidateKind === "commitment"
          )
          && (
            binding.mentionIdentityDigest === undefined
            || HEX_DIGEST.test(binding.mentionIdentityDigest)
          )
          && binding.candidateIdentityRef === `external:${
            taskMapMeetingStatementReferenceDigest({
              kind: binding.candidateKind,
              title: event!.title,
              summary: event!.summary,
              explicitExternalReferenceDigests:
                binding.rootLinkRefs.map((ref) =>
                  ref.slice("external:".length)
                ),
              ...(binding.mentionIdentityDigest === undefined
                ? {}
                : {
                    mentionIdentityDigest:
                      binding.mentionIdentityDigest,
                  }),
            })
          }`;
    const dispositionMatches = event !== undefined
      && sourceBinding !== undefined
      && (
        (
          binding.disposition === "source_authoritative"
          && sourceBinding.semanticClass === "source_authoritative"
          && event.recordKind === "authoritative_task"
          && (
            event.activity === "task_created"
            || event.activity === "task_updated"
            || event.activity === "task_completed"
            || event.activity === "task_reopened"
          )
          && binding.candidateIdentityRef === undefined
          && binding.mentionIdentityDigest === undefined
          && binding.rootLinkRefs.length > 0
        )
        || (
          binding.disposition === "candidate_only"
          && (
            sourceBinding.semanticClass === "meeting_context"
            || sourceBinding.semanticClass === "context_only"
          )
          && event.recordKind === "work_context"
          && event.activity === "commitment_stated"
          && binding.candidateIdentityRef !== undefined
          && !binding.rootLinkRefs.includes(binding.candidateIdentityRef)
        )
        || (
          binding.disposition === "context_only"
          && (
            sourceBinding.semanticClass === "meeting_context"
            || sourceBinding.semanticClass === "context_only"
          )
          && (
            event.recordKind === "work_context"
            || event.recordKind === "receipt"
          )
          && binding.candidateIdentityRef === undefined
        )
        || (
          binding.disposition === "body_only"
          && sourceBinding.semanticClass === "body_context"
          && event.recordKind === "body_context"
          && binding.candidateIdentityRef === undefined
          && binding.mentionIdentityDigest === undefined
        )
      );
    if (
      !rootLinkRefsAreValid
      || !externalRemainderIsExact
      || !candidateIdentityIsValid
      || !dispositionMatches
    ) {
      fail("invalid_source_binding");
    }
  }
  if (
    input.evidenceBindings.length !== events.size
    || [...events.keys()].some(
      (eventId) => evidenceBindingCounts.get(eventId) !== 1,
    )
  ) {
    fail("invalid_source_binding");
  }
}

function normalizedManualAuthoritySubset(input: {
  pointers: readonly TaskMapSourcePointer[];
  events: readonly TaskMapEvent[];
  sourceBindings: readonly TaskMapNativeSemanticSourceBindingV1[];
  evidenceBindings: readonly TaskMapNativeSemanticEvidenceBindingV1[];
}): string {
  return canonicalJson({
    pointers: input.pointers.map((pointer) => ({
      ...pointer,
      capabilities: [...pointer.capabilities].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    events: input.events.map((event) => ({
      ...event,
      objectRefs: [...event.objectRefs].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    sourceBindings: [...input.sourceBindings].sort((left, right) =>
      left.pointerId.localeCompare(right.pointerId)
    ),
    evidenceBindings: input.evidenceBindings.map((binding) => ({
      ...binding,
      rootLinkRefs: [...binding.rootLinkRefs].sort(),
    })).sort((left, right) => left.eventId.localeCompare(right.eventId)),
  });
}

function validateCandidateAcceptanceAuthority(
  input: TaskMapNativeSemanticBuilderInputV1,
  store: TaskMapNativeCandidateAcceptanceStoreV1 | undefined,
): void {
  const manualPointers = input.taskMapInput.pointers.filter((pointer) =>
    pointer.sourceKind === "manual"
  );
  if (store === undefined) {
    if (manualPointers.length > 0) fail("invalid_source_binding");
    return;
  }

  let expected: ReturnType<
    typeof taskMapNativeCandidateAcceptanceManualAuthorityRecords
  >;
  try {
    assertTaskMapNativeCandidateAcceptanceStore(store);
    expected = taskMapNativeCandidateAcceptanceManualAuthorityRecords(store);
  } catch {
    fail("invalid_source_binding");
  }
  if (store.ownerScopeDigest !== input.ownerScopeDigest) {
    fail("invalid_source_binding");
  }

  const expectedPointerIds = new Set(
    expected.pointers.map((pointer) => pointer.id),
  );
  const expectedEventIds = new Set(expected.events.map((event) => event.id));
  const relevantPointerIds = new Set([
    ...manualPointers.map((pointer) => pointer.id),
    ...expectedPointerIds,
  ]);
  const actualPointers = input.taskMapInput.pointers.filter((pointer) =>
    pointer.sourceKind === "manual" || expectedPointerIds.has(pointer.id)
  );
  const actualEvents = input.taskMapInput.events.filter((event) =>
    relevantPointerIds.has(event.pointerId) || expectedEventIds.has(event.id)
  );
  const relevantEventIds = new Set([
    ...actualEvents.map((event) => event.id),
    ...expectedEventIds,
  ]);
  const actualSourceBindings = input.sourceBindings.filter((binding) =>
    relevantPointerIds.has(binding.pointerId)
  );
  const actualEvidenceBindings = input.evidenceBindings.filter((binding) =>
    relevantEventIds.has(binding.eventId)
  );
  if (
    normalizedManualAuthoritySubset({
      pointers: actualPointers,
      events: actualEvents,
      sourceBindings: actualSourceBindings,
      evidenceBindings: actualEvidenceBindings,
    }) !== normalizedManualAuthoritySubset(expected)
  ) {
    fail("invalid_source_binding");
  }
}

function validateInputContract(
  input: TaskMapNativeSemanticBuilderInputV1,
  candidateAcceptanceStore?: TaskMapNativeCandidateAcceptanceStoreV1,
  enforceSemanticEventLimit = true,
): void {
  validateAbsoluteInputLimits(input);
  if (
    input.contractVersion !== TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION
    || !HEX_DIGEST.test(input.ownerScopeDigest)
    || input.producer.id !== TASKMAP_MEETING_PRODUCER_RESULT_VERSION
    || input.producer.version !== TASKMAP_MEETING_PRODUCER_VERSION
    || input.taskMapInput.contractVersion !== TASKMAP_CONTRACT_VERSION
    || !strictTimestamp(input.taskMapInput.generatedAt)
  ) {
    fail("invalid_contract");
  }
  validateFreshness(input);
  validateCandidateAcceptanceAuthority(input, candidateAcceptanceStore);
  validateSourceBindings(input, enforceSemanticEventLimit);
}

function activeEvents(input: TaskMapInput): TaskMapEvent[] {
  const inactive = new Set<string>();
  const retractors = new Set<string>();
  for (const event of input.events) {
    if (event.supersedesEventId) inactive.add(event.supersedesEventId);
    if (event.retractsEventId) {
      inactive.add(event.retractsEventId);
      retractors.add(event.id);
    }
  }
  return input.events.filter(
    (event) => !inactive.has(event.id) && !retractors.has(event.id),
  );
}

/**
 * The deterministic brain observes at most one active candidate occurrence for
 * each explicit statement and semantic origin. Compact only those exact
 * redundancies before applying the closed input limits; all other evidence is
 * preserved and still validated normally.
 */
function compactRedundantCandidateOccurrences(
  input: TaskMapNativeSemanticBuilderInputV1,
): TaskMapNativeSemanticBuilderInputV1 {
  const sourceBindingByPointer = new Map(
    input.sourceBindings.map((sourceBinding) => [
      sourceBinding.pointerId,
      sourceBinding,
    ]),
  );
  const evidenceBindingByEvent = new Map(
    input.evidenceBindings.map((evidenceBinding) => [
      evidenceBinding.eventId,
      evidenceBinding,
    ]),
  );
  const representativeByGroup = new Map<string, string>();
  const redundantEventIds = new Set<string>();

  for (const event of activeEvents(input.taskMapInput)) {
    const evidenceBinding = evidenceBindingByEvent.get(event.id);
    if (evidenceBinding?.disposition !== "candidate_only") continue;
    if (
      event.supersedesEventId !== undefined
      || event.retractsEventId !== undefined
    ) {
      continue;
    }
    const sourceBinding = sourceBindingByPointer.get(event.pointerId);
    if (
      sourceBinding === undefined
      || evidenceBinding.candidateIdentityRef === undefined
    ) {
      continue;
    }
    const groupKey = canonicalJson([
      evidenceBinding.candidateIdentityRef,
      sourceBinding.semanticOriginId,
    ]);
    const previousEventId = representativeByGroup.get(groupKey);
    if (previousEventId === undefined) {
      representativeByGroup.set(groupKey, event.id);
    } else if (event.id.localeCompare(previousEventId) < 0) {
      redundantEventIds.add(previousEventId);
      representativeByGroup.set(groupKey, event.id);
    } else {
      redundantEventIds.add(event.id);
    }
  }
  if (redundantEventIds.size === 0) return input;

  const retainedEvents = input.taskMapInput.events.filter((event) =>
    !redundantEventIds.has(event.id)
  );
  const retainedPointerIds = new Set(
    retainedEvents.map((event) => event.pointerId),
  );
  const originalEventsByPointer = new Map<string, TaskMapEvent[]>();
  for (const event of input.taskMapInput.events) {
    const events = originalEventsByPointer.get(event.pointerId) ?? [];
    events.push(event);
    originalEventsByPointer.set(event.pointerId, events);
  }
  const removablePointerIds = new Set<string>();
  for (const pointer of input.taskMapInput.pointers) {
    if (retainedPointerIds.has(pointer.id)) continue;
    const originalEvents = originalEventsByPointer.get(pointer.id) ?? [];
    const sourceBinding = sourceBindingByPointer.get(pointer.id);
    if (
      originalEvents.length > 0
      && originalEvents.every((event) => redundantEventIds.has(event.id))
      && (
        sourceBinding?.semanticClass === "meeting_context"
        || sourceBinding?.semanticClass === "context_only"
      )
    ) {
      removablePointerIds.add(pointer.id);
    }
  }

  return {
    ...input,
    sourceBindings: input.sourceBindings.filter((sourceBinding) =>
      !removablePointerIds.has(sourceBinding.pointerId)
    ),
    evidenceBindings: input.evidenceBindings.filter((evidenceBinding) =>
      !redundantEventIds.has(evidenceBinding.eventId)
    ),
    taskMapInput: {
      ...input.taskMapInput,
      pointers: input.taskMapInput.pointers.filter((pointer) =>
        !removablePointerIds.has(pointer.id)
      ),
      events: retainedEvents,
    },
  };
}

function validatedCompactedSemanticInput(
  input: TaskMapNativeSemanticBuilderInputV1,
  candidateAcceptanceStore?: TaskMapNativeCandidateAcceptanceStoreV1,
): TaskMapNativeSemanticBuilderInputV1 {
  // Validate the complete evidence graph first so compaction cannot sanitize a
  // malformed duplicate, then enforce every closed bound on the compact form.
  validateInputContract(input, candidateAcceptanceStore, false);
  if (taskMapInputValidationReasons(input.taskMapInput).length > 0) {
    fail("harness_rejected");
  }
  const compacted = compactRedundantCandidateOccurrences(input);
  validateInputContract(compacted, candidateAcceptanceStore);
  if (taskMapInputValidationReasons(compacted.taskMapInput).length > 0) {
    fail("harness_rejected");
  }
  return compacted;
}

function latestAuthoritativeEvents(input: TaskMapInput): TaskMapEvent[] {
  const latest = new Map<string, TaskMapEvent>();
  for (const event of activeEvents(input)) {
    if (event.recordKind !== "authoritative_task") continue;
    const previous = latest.get(event.pointerId);
    if (
      previous === undefined
      || Date.parse(event.occurredAt) > Date.parse(previous.occurredAt)
      || (
        event.occurredAt === previous.occurredAt
        && Date.parse(event.observedAt) > Date.parse(previous.observedAt)
      )
      || (
        event.occurredAt === previous.occurredAt
        && event.observedAt === previous.observedAt
        && event.id.localeCompare(previous.id) > 0
      )
    ) {
      latest.set(event.pointerId, event);
    }
  }
  return [...latest.values()];
}

function eventOpenState(event: TaskMapEvent): BrainTaskOpenState {
  if (event.activity === "task_completed") return "completed";
  switch (event.sourceStatus) {
    case "completed": return "completed";
    case "cancelled": return "superseded";
    case "blocked": return "blocked";
    case "awaiting_review": return "awaiting_review";
    case "open":
    case "in_progress":
      return "open";
    default:
      break;
  }
  if (
    event.activity === "task_created"
    || event.activity === "task_reopened"
  ) {
    return "open";
  }
  return "unknown";
}

function orderedEvents(events: readonly TaskMapEvent[]): TaskMapEvent[] {
  return [...events].sort((left, right) =>
    Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || Date.parse(left.observedAt) - Date.parse(right.observedAt)
    || left.id.localeCompare(right.id)
  );
}

function confidence(events: readonly TaskMapEvent[]): number {
  return Math.min(
    ...events.map((event) => event.extractionConfidence),
  );
}

function canonicalTaskMapInput(input: TaskMapInput): TaskMapInput {
  return {
    contractVersion: input.contractVersion,
    generatedAt: input.generatedAt,
    pointers: input.pointers.map((pointer) => ({
      ...pointer,
      capabilities: [...pointer.capabilities].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    events: input.events.map((event) => ({
      ...event,
      objectRefs: [...event.objectRefs].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

interface DeterministicCandidateGroup {
  candidateIdentityRef: string;
  candidateKind: "action_item" | "commitment";
  events: TaskMapEvent[];
  rootLinkRefs: string[];
}

interface DeterministicRootGroup {
  rootKey: string;
  authoritative: TaskMapEvent[];
  candidates: DeterministicCandidateGroup[];
}

export function buildTaskMapNativeDeterministicBrain(
  input: TaskMapInput,
  sourceBindings: readonly TaskMapNativeSemanticSourceBindingV1[],
  evidenceBindings: readonly TaskMapNativeSemanticEvidenceBindingV1[],
): SemanticBrainOutput {
  const sourceBindingByPointer = new Map(
    sourceBindings.map((binding) => [binding.pointerId, binding]),
  );
  const evidenceBindingByEvent = new Map(
    evidenceBindings.map((binding) => [binding.eventId, binding]),
  );
  const authoritative = latestAuthoritativeEvents(input).filter((event) =>
    evidenceBindingByEvent.get(event.id)?.disposition
      === "source_authoritative"
  );
  const active = activeEvents(input);
  const candidateOccurrences = active.filter((event) =>
    evidenceBindingByEvent.get(event.id)?.disposition === "candidate_only"
  );

  const rawCandidates = new Map<string, {
    candidateKind: "action_item" | "commitment";
    byOrigin: Map<string, TaskMapEvent>;
    rootLinkRefs: Set<string>;
  }>();
  for (const event of orderedEvents(candidateOccurrences)) {
    const evidenceBinding = evidenceBindingByEvent.get(event.id)!;
    const sourceBinding = sourceBindingByPointer.get(event.pointerId)!;
    const candidateIdentityRef = evidenceBinding.candidateIdentityRef!;
    const group = rawCandidates.get(candidateIdentityRef) ?? {
      candidateKind: evidenceBinding.candidateKind!,
      byOrigin: new Map<string, TaskMapEvent>(),
      rootLinkRefs: new Set<string>(),
    };
    const previous = group.byOrigin.get(sourceBinding.semanticOriginId);
    if (
      previous === undefined
      || event.id.localeCompare(previous.id) < 0
    ) {
      group.byOrigin.set(sourceBinding.semanticOriginId, event);
    }
    for (const ref of evidenceBinding.rootLinkRefs) {
      group.rootLinkRefs.add(ref);
    }
    rawCandidates.set(candidateIdentityRef, group);
  }
  const candidates = [...rawCandidates.entries()].map(
    ([candidateIdentityRef, group]): DeterministicCandidateGroup => ({
      candidateIdentityRef,
      candidateKind: group.candidateKind,
      events: orderedEvents([...group.byOrigin.values()]),
      rootLinkRefs: [...group.rootLinkRefs].sort(),
    }),
  ).sort((left, right) =>
    left.candidateIdentityRef.localeCompare(right.candidateIdentityRef)
  );

  const authoritativeRefParent = new Map<string, string>();
  const findAuthoritativeRef = (ref: string): string => {
    const parent = authoritativeRefParent.get(ref);
    if (parent === undefined) {
      authoritativeRefParent.set(ref, ref);
      return ref;
    }
    if (parent === ref) return ref;
    const root = findAuthoritativeRef(parent);
    authoritativeRefParent.set(ref, root);
    return root;
  };
  const unionAuthoritativeRefs = (left: string, right: string): void => {
    const leftRoot = findAuthoritativeRef(left);
    const rightRoot = findAuthoritativeRef(right);
    if (leftRoot === rightRoot) return;
    const [root, child] = [leftRoot, rightRoot].sort();
    authoritativeRefParent.set(child, root);
  };
  for (const event of authoritative) {
    const refs = [
      ...evidenceBindingByEvent.get(event.id)!.rootLinkRefs,
    ].sort();
    for (const ref of refs) findAuthoritativeRef(ref);
    for (const ref of refs.slice(1)) {
      unionAuthoritativeRefs(refs[0], ref);
    }
  }

  const authoritativeRefToRoot = new Map<string, string>();
  const groups = new Map<string, DeterministicRootGroup>();
  for (const event of orderedEvents(authoritative)) {
    const evidenceBinding = evidenceBindingByEvent.get(event.id)!;
    const refs = [...evidenceBinding.rootLinkRefs].sort();
    const rootKey = findAuthoritativeRef(refs[0]);
    const group = groups.get(rootKey) ?? {
      rootKey,
      authoritative: [],
      candidates: [],
    };
    group.authoritative.push(event);
    groups.set(rootKey, group);
    for (const ref of refs) {
      authoritativeRefToRoot.set(ref, findAuthoritativeRef(ref));
    }
  }

  for (const candidate of candidates) {
    const linkedRootKey = candidate.rootLinkRefs
      .map((ref) => authoritativeRefToRoot.get(ref))
      .filter((item): item is string => item !== undefined)
      .sort()[0];
    const originIds = new Set(candidate.events.map((event) =>
      sourceBindingByPointer.get(event.pointerId)!.semanticOriginId
    ));
    const occurrenceDates = new Set(candidate.events.map((event) =>
      event.occurredAt.slice(0, 10)
    ));
    const independentlyCorroborated =
      originIds.size >= 2 && occurrenceDates.size >= 2;
    if (linkedRootKey === undefined && !independentlyCorroborated) {
      continue;
    }
    const rootKey = linkedRootKey ?? candidate.candidateIdentityRef;
    const group = groups.get(rootKey) ?? {
      rootKey,
      authoritative: [],
      candidates: [],
    };
    group.candidates.push(candidate);
    groups.set(rootKey, group);
  }

  const roots: BrainRootProposal[] = [];
  const tasks: BrainTaskProposal[] = [];
  for (const [key, rawGroup] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const group = {
      authoritative: orderedEvents(rawGroup.authoritative),
      candidates: [...rawGroup.candidates].sort((left, right) =>
        left.candidateIdentityRef.localeCompare(right.candidateIdentityRef)
      ),
    };
    const evidence = [
      ...group.authoritative,
      ...group.candidates.flatMap((candidate) => candidate.events),
    ];
    if (evidence.length === 0) continue;
    const representative =
      group.authoritative.at(-1)
      ?? group.candidates.at(-1)!.events.at(-1)!;
    const rootProposalId = stableId("baseline-root", key);
    roots.push({
      proposalId: rootProposalId,
      title: representative.title,
      summary: representative.summary,
      evidenceEventIds: evidence.map((event) => event.id).sort(),
      memberObjectRefs: [rawGroup.rootKey],
      confidence: confidence(evidence),
    });
    for (const event of group.authoritative) {
      tasks.push({
        proposalId: stableId("baseline-source-task", event.id),
        rootProposalId,
        title: event.title,
        summary: event.summary,
        evidenceEventIds: [event.id],
        authoritativeTaskEventId: event.id,
        openState: eventOpenState(event),
        confidence: event.extractionConfidence,
      });
    }
    for (const candidate of group.candidates) {
      const latest = candidate.events.at(-1)!;
      const anchor = [...candidate.events].sort((left, right) => {
        const occurredOrder =
          Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
        if (occurredOrder !== 0) return occurredOrder;
        const leftOrigin =
          sourceBindingByPointer.get(left.pointerId)!.semanticOriginId;
        const rightOrigin =
          sourceBindingByPointer.get(right.pointerId)!.semanticOriginId;
        return leftOrigin.localeCompare(rightOrigin)
          || Date.parse(left.observedAt) - Date.parse(right.observedAt)
          || left.id.localeCompare(right.id);
      })[0];
      tasks.push({
        proposalId: stableId(
          "baseline-candidate-task",
          candidate.candidateIdentityRef,
        ),
        rootProposalId,
        title: latest.title,
        summary: latest.summary,
        // The root retains every corroborating occurrence. The leaf anchors
        // to one canonical origin so a third meeting is an update, not a new
        // task identity under the frozen harness.
        evidenceEventIds: [anchor.id],
        openState: "possibly_open",
        confidence: confidence(candidate.events),
      });
    }
  }

  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "deterministic-explicit-work",
    model: TASKMAP_NATIVE_SEMANTIC_BUILDER_VERSION,
    promptHash: DETERMINISTIC_PROMPT_HASH,
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: input.generatedAt,
    roots,
    tasks,
    edges: [],
  };
}

function meetingObjectRef(
  kind: "canonical_meeting" | "source_object" | "external_reference",
  referenceDigest: string,
): string {
  switch (kind) {
    case "canonical_meeting":
      return `canonical-meeting:${referenceDigest}`;
    case "source_object":
      return `source-object:${referenceDigest}`;
    case "external_reference":
      return `external:${referenceDigest}`;
  }
}

function meetingStatementIdentityRef(
  evidence: NonNullable<
    TaskMapMeetingProducerResultV1["snapshot"]
  >["meetings"][number]["evidence"][number],
): string {
  if (
    evidence.statementReferenceDigest === null
    || !HEX_DIGEST.test(evidence.statementReferenceDigest)
  ) {
    fail("invalid_source_binding");
  }
  return `external:${evidence.statementReferenceDigest}`;
}

/**
 * Pure conversion from the authenticated M2B result. It keeps opaque source
 * revision binding outside TaskMap semantic identity, emits one pointer per
 * canonical meeting, and never expands provider variants into occurrences.
 */
export function taskMapNativeSemanticInputFromMeetingProducerResult(
  result: TaskMapMeetingProducerResultV1,
  expectedOwnerScopeDigest: string,
): TaskMapNativeSemanticBuilderInputV1 {
  assertTaskMapMeetingProducerResult(result);
  if (
    !HEX_DIGEST.test(expectedOwnerScopeDigest)
    || result.availability !== "available"
    || result.freshness.decision !== "fresh"
    || result.freshness.currentSemanticInputEligible !== true
    || result.retainedLastGood !== null
    || result.snapshot === null
    || result.snapshot.ownerScopeDigest !== expectedOwnerScopeDigest
  ) {
    if (
      result.snapshot !== null
      && result.snapshot.ownerScopeDigest !== expectedOwnerScopeDigest
    ) {
      fail("owner_scope_mismatch");
    }
    fail("invalid_freshness");
  }

  const pointers: TaskMapSourcePointer[] = [];
  const events: TaskMapEvent[] = [];
  const sourceBindings: TaskMapNativeSemanticSourceBindingV1[] = [];
  const evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[] = [];
  const stableTimes: string[] = [];

  for (const meeting of result.snapshot.meetings) {
    const primary = meeting.sourceVariants.find(
      (variant) => variant.role === "primary",
    );
    if (primary === undefined || primary.sourceKind !== "gemini_meet") {
      fail("invalid_source_binding");
    }
    const semanticIdentityDigest = taskMapContractDigest({
      domain: TASKMAP_NATIVE_MEETING_SEMANTIC_IDENTITY_DOMAIN,
      ownerScopeDigest: result.snapshot.ownerScopeDigest,
      canonicalMeetingId: meeting.canonicalMeetingId,
      bindingDigest: primary.bindingDigest,
      sourceObjectDigest: primary.sourceObjectDigest,
    });
    const canonicalMeetingReferenceDigests = new Set(
      meeting.evidence.flatMap((evidence) =>
        evidence.objectRefs
          .filter((ref) => ref.kind === "canonical_meeting")
          .map((ref) => ref.referenceDigest)
      ),
    );
    if (canonicalMeetingReferenceDigests.size > 1) {
      fail("invalid_source_binding");
    }
    const semanticOriginId =
      [...canonicalMeetingReferenceDigests][0]
      ?? meeting.canonicalMeetingId;
    pointers.push({
      id: meeting.canonicalMeetingId,
      sourceKind: "gemini_meet",
      sourceObjectId: meeting.canonicalMeetingId,
      sourceRefHash: semanticIdentityDigest,
      sourceVersion: primary.contentDigest,
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
    sourceBindings.push({
      pointerId: meeting.canonicalMeetingId,
      semanticClass: "meeting_context",
      semanticOriginId,
      semanticIdentityDigest,
      sourceIdentityDigest: primary.sourceIdentityDigest,
      observedRevision: primary.sourceRevisionDigest,
      evidenceRevision: primary.sourceRevisionDigest,
      observedContentDigest: primary.contentDigest,
      evidenceContentDigest: primary.contentDigest,
    });
    stableTimes.push(primary.eventTime);

    for (const evidence of meeting.evidence) {
      const objectRefs = evidence.objectRefs.map((ref) =>
        meetingObjectRef(ref.kind, ref.referenceDigest)
      ).sort();
      const event: TaskMapEvent = {
        id: evidence.evidenceId,
        pointerId: meeting.canonicalMeetingId,
        recordKind: "work_context",
        activity:
          evidence.kind === "decision"
            ? "decision_made"
            : "commitment_stated",
        occurredAt: evidence.occurredAt,
        // Observation/revision rotation is not a semantic change.
        observedAt: evidence.occurredAt,
        dayKey: evidence.occurredAt.slice(0, 10),
        objectRefs,
        title: evidence.title,
        summary: evidence.summary,
        extractionConfidence: evidence.confidence,
        // Eligibility is fixed by the authenticated producer coverage before
        // body categories are read. Partial rows remain ordinary context.
        bodyJoinEligible: evidence.coverage === "complete",
        ...(evidence.status === null
          ? {}
          : {
              // Non-authoritative evidence never supplies lifecycle authority;
              // this facet only makes the bounded update observable.
              sourceStatus:
                evidence.status === "done"
                  ? "completed"
                  : evidence.status === "cancelled"
                    ? "cancelled"
                    : evidence.status === "in_progress"
                      ? "in_progress"
                      : evidence.status === "open"
                        ? "open"
                        : "unknown",
            }),
        ...(evidence.deadline === null
          ? {}
          : { deadlineAt: evidence.deadline }),
      };
      events.push(event);
      stableTimes.push(evidence.occurredAt);
      if (evidence.proposalDisposition === "candidate_only") {
        const candidateIdentityRef =
          meetingStatementIdentityRef(evidence);
        if (!objectRefs.includes(candidateIdentityRef)) {
          fail("invalid_source_binding");
        }
        evidenceBindings.push({
          eventId: evidence.evidenceId,
          disposition: "candidate_only",
          candidateIdentityRef,
          candidateKind:
            evidence.kind === "action_item"
              ? "action_item"
              : "commitment",
          ...(evidence.mentionIdentityDigest === undefined
            ? {}
            : {
                mentionIdentityDigest: evidence.mentionIdentityDigest,
              }),
          rootLinkRefs: objectRefs.filter((ref) =>
            EXTERNAL_WORK_REF.test(ref) && ref !== candidateIdentityRef
          ),
        });
      } else {
        evidenceBindings.push({
          eventId: evidence.evidenceId,
          disposition: "context_only",
          rootLinkRefs: [],
        });
      }
    }
  }

  const generatedAt = stableTimes.length === 0
    ? result.snapshot.producedAt
    : stableTimes.reduce((latest, timestamp) =>
      Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest
    );
  return {
    contractVersion: TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
    ownerScopeDigest: result.snapshot.ownerScopeDigest,
    producer: {
      id: TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
      version: TASKMAP_MEETING_PRODUCER_VERSION,
    },
    freshness: {
      decision: result.freshness.decision,
      available: true,
      retainedLastGood: false,
      producedAt: result.freshness.producedAt!,
      validThrough: result.freshness.validThrough!,
      assessedAt: result.freshness.assessedAt,
    },
    sourceBindings: sourceBindings.sort((left, right) =>
      left.pointerId.localeCompare(right.pointerId)
    ),
    evidenceBindings: evidenceBindings.sort((left, right) =>
      left.eventId.localeCompare(right.eventId)
    ),
    taskMapInput: {
      contractVersion: TASKMAP_CONTRACT_VERSION,
      generatedAt,
      pointers: pointers.sort((left, right) => left.id.localeCompare(right.id)),
      events: events.sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function validatedPredecessor(
  previousProjection: TaskMapProjectionV1 | undefined,
  expectedProjectionDigest: string | undefined,
): TaskMapProjectionV1 | undefined {
  if (
    (previousProjection === undefined)
      !== (expectedProjectionDigest === undefined)
  ) {
    fail("invalid_predecessor");
  }
  if (previousProjection === undefined) return undefined;
  let projectionDigest: string;
  try {
    projectionDigest = diffTaskMapProjections(
      null,
      previousProjection,
    ).currentProjectionDigest;
  } catch {
    fail("invalid_predecessor");
  }
  if (
    !HEX_DIGEST.test(expectedProjectionDigest!)
    || previousProjection.runStatus !== "accepted"
    || previousProjection.rejections.length !== 0
    || taskMapProjectionArtifactValidationReasons(previousProjection).length
      > 0
    || projectionDigest !== expectedProjectionDigest
    || previousProjection.privacy.sourceBodiesStored !== false
    || previousProjection.privacy.localPathsStored !== false
    || previousProjection.privacy.rawBiometricsStored !== false
    || (
      previousProjection.brain !== null
      && !HEX_DIGEST.test(previousProjection.brain.outputDigest)
    )
  ) {
    fail("invalid_predecessor");
  }
  return previousProjection;
}

export function buildTaskMapNativeSemanticProjection(
  input: TaskMapNativeSemanticBuilderInputV1,
  options: TaskMapNativeSemanticBuilderOptions = {},
): TaskMapProjectionV1 {
  const compactedInput = validatedCompactedSemanticInput(
    input,
    options.candidateAcceptanceStore,
  );
  const canonicalInput = canonicalTaskMapInput(compactedInput.taskMapInput);
  const previousProjection = validatedPredecessor(
    options.previousProjection,
    options.previousProjectionDigest,
  );

  const brain = buildTaskMapNativeDeterministicBrain(
    canonicalInput,
    compactedInput.sourceBindings,
    compactedInput.evidenceBindings,
  );
  if (
    previousProjection !== undefined
    && (options.causalInputs?.length ?? 0) === 0
    && previousProjection.inputDigest === taskMapInputDigest(canonicalInput)
    && previousProjection.brain?.provider === brain.provider
    && previousProjection.brain.model === brain.model
    && previousProjection.brain.promptHash === brain.promptHash
    && previousProjection.brain.outputDigest === digest(brain)
  ) {
    return structuredClone(previousProjection);
  }
  const projection = buildTaskMapProjection(
    canonicalInput,
    brain,
    {
      arm: "E4",
      now: canonicalInput.generatedAt,
      previousProjection,
      causalInputs: options.causalInputs ?? [],
    },
  );
  if (
    projection.runStatus !== "accepted"
    || projection.rejections.length !== 0
  ) {
    fail("harness_rejected");
  }
  if (projection.tasks.length === 0) {
    fail("no_eligible_work");
  }
  if (previousProjection !== undefined) {
    const taskIds = new Set(projection.tasks.map((task) => task.id));
    if (previousProjection.tasks.some((task) => !taskIds.has(task.id))) {
      fail("predecessor_continuity_required");
    }
  }
  return projection;
}

export function buildTaskMapNativeSemanticProjectionFromMeetingProducerResult(
  result: TaskMapMeetingProducerResultV1,
  options: TaskMapNativeMeetingSemanticBuilderOptions,
): TaskMapProjectionV1 {
  const {
    expectedOwnerScopeDigest,
    previousProjection,
    previousProjectionDigest,
    causalInputs,
    candidateAcceptanceStore,
  } = options;
  const input = taskMapNativeSemanticInputFromMeetingProducerResult(
    result,
    expectedOwnerScopeDigest,
  );
  return buildTaskMapNativeSemanticProjection(input, {
    ...(previousProjection === undefined ? {} : { previousProjection }),
    ...(previousProjectionDigest === undefined
      ? {}
      : { previousProjectionDigest }),
    ...(causalInputs === undefined ? {} : { causalInputs }),
    ...(candidateAcceptanceStore === undefined
      ? {}
      : { candidateAcceptanceStore }),
  });
}

export function taskMapNativeSemanticInputWithPhysiologicalContext(
  meetingInput: TaskMapNativeSemanticBuilderInputV1,
  physiologicalContext: TaskMapPhysiologicalSemanticContextV1,
  candidateAcceptanceStore?: TaskMapNativeCandidateAcceptanceStoreV1,
): TaskMapNativeSemanticBuilderInputV1 {
  const latestBodyObservation = physiologicalContext.events
    .map((event) => event.observedAt)
    .filter(strictTimestamp)
    .reduce<string | null>((latest, timestamp) => (
      latest === null || Date.parse(timestamp) > Date.parse(latest)
        ? timestamp
        : latest
    ), null);
  const generatedAt = (
    latestBodyObservation !== null
    && Date.parse(latestBodyObservation)
      > Date.parse(meetingInput.taskMapInput.generatedAt)
  )
    ? latestBodyObservation
    : meetingInput.taskMapInput.generatedAt;
  const merged: TaskMapNativeSemanticBuilderInputV1 = {
    ...structuredClone(meetingInput),
    sourceBindings: [
      ...structuredClone(meetingInput.sourceBindings),
      ...structuredClone(physiologicalContext.sourceBindings),
    ].sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
    evidenceBindings: [
      ...structuredClone(meetingInput.evidenceBindings),
      ...structuredClone(physiologicalContext.evidenceBindings),
    ].sort((left, right) => left.eventId.localeCompare(right.eventId)),
    taskMapInput: {
      ...structuredClone(meetingInput.taskMapInput),
      generatedAt,
      pointers: [
        ...structuredClone(meetingInput.taskMapInput.pointers),
        ...structuredClone(physiologicalContext.pointers),
      ].sort((left, right) => left.id.localeCompare(right.id)),
      events: [
        ...structuredClone(meetingInput.taskMapInput.events),
        ...structuredClone(physiologicalContext.events),
      ].sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
  return validatedCompactedSemanticInput(
    merged,
    candidateAcceptanceStore,
  );
}

/**
 * Native owner-live body integration. It evaluates every accepted proposal
 * against the single predeclared below-baseline composite-recovery policy and
 * supplies only fixed-gate passes to E4. The per-root plain-language results
 * are ephemeral and do not alter publication or storage contracts. The
 * current meeting-only producer has one canonical work source and emits no
 * complete source-day receipts, so it truthfully returns a no-pattern result;
 * a positive result remains gated on a later authenticated multi-source work
 * producer rather than fabricated from provider variants.
 */
export function buildTaskMapNativeSemanticProjectionFromMeetingAndPhysiologicalContext(
  result: TaskMapMeetingProducerResultV1,
  physiologicalContext: TaskMapPhysiologicalSemanticContextV1,
  options: TaskMapNativeMeetingBodySemanticBuilderOptions,
): TaskMapNativeBodyPatternBuildResultV1 {
  const meetingInput = taskMapNativeSemanticInputFromMeetingProducerResult(
    result,
    options.expectedOwnerScopeDigest,
  );
  const input = taskMapNativeSemanticInputWithPhysiologicalContext(
    meetingInput,
    physiologicalContext,
  );
  const canonicalInput = canonicalTaskMapInput(input.taskMapInput);
  const brain = buildTaskMapNativeDeterministicBrain(
    canonicalInput,
    input.sourceBindings,
    input.evidenceBindings,
  );
  const bodyEvaluation = evaluateTaskMapOwnerBodyPatterns({
    taskMapInput: canonicalInput,
    brain,
    now: canonicalInput.generatedAt,
  });
  const projection = buildTaskMapNativeSemanticProjection(input, {
    ...(options.previousProjection === undefined
      ? {}
      : { previousProjection: options.previousProjection }),
    ...(options.previousProjectionDigest === undefined
      ? {}
      : { previousProjectionDigest: options.previousProjectionDigest }),
    ...(options.candidateAcceptanceStore === undefined
      ? {}
      : { candidateAcceptanceStore: options.candidateAcceptanceStore }),
    causalInputs: bodyEvaluation.projectionInputs,
  });
  return {
    contractVersion: TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION,
    projection,
    bodyPatternResults: bodyEvaluation.results,
  };
}
