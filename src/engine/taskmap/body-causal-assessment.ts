import { createHash } from "node:crypto";
import {
  DEFAULT_ENRICHMENT_THRESHOLDS,
  enrichmentGate,
  type EnrichmentVerdict,
} from "../reasoner/EnrichmentGate.js";
import {
  buildTaskMapProjection,
  TASKMAP_ALGORITHM_POLICY,
  TASKMAP_ALGORITHM_POLICY_DIGEST,
  taskMapMembershipSignature,
} from "./harness.js";
import type {
  BrainRootProposal,
  RootCausalGateInput,
  SemanticBrainOutput,
  TaskMapEvent,
  TaskMapInput,
  TaskMapProjectionV1,
  TaskMapRoot,
  TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION =
  "taskmap-body-causal-assessment.v1" as const;
export const TASKMAP_BODY_CAUSAL_COMPARISON_VERSION =
  "taskmap-body-causal-comparison.v1" as const;
export const TASKMAP_BODY_PATTERN_RESULT_VERSION =
  "taskmap-body-pattern-result.v1" as const;
export const TASKMAP_OWNER_BODY_PATTERN_POLICY_V1 = Object.freeze({
  version: "taskmap-owner-body-pattern-policy.1" as const,
  bodyAxis: "composite_recovery" as const,
  bodyCategory: "below_baseline" as const,
});

type KnownBodyAxis = Exclude<RootCausalGateInput["bodyAxis"], "unknown">;

export type TaskMapBodyCausalReasonCode =
  | "root_not_found"
  | "input_or_brain_not_accepted"
  | "root_not_accepted"
  | "body_provider_read_unverified"
  | "body_provider_read_stale"
  | "body_provider_read_not_bound"
  | "contradictory_body_classification"
  | "no_exact_root_work_overlap"
  | "no_eligible_work_evidence"
  | "no_comparable_source_day_coverage"
  | "no_covered_target_body_days"
  | "no_target_work_overlap"
  | "insufficient_target_backed_days"
  | "enrichment_below_fixed_threshold"
  | "insufficient_multi_source_backing"
  | "insufficient_neutral_reference_days"
  | "harness_causal_input_rejected";

export interface TaskMapBodyCausalRequest {
  input: TaskMapInput;
  brain: SemanticBrainOutput;
  rootProposalId: string;
  /**
   * The hypothesis is caller-selected and fixed before assessment. This
   * module never searches axes or target categories for a favorable result.
   */
  bodyAxis: KnownBodyAxis;
  bodyCategory: RootCausalGateInput["bodyCategory"];
  now?: string;
  previousProjection?: TaskMapProjectionV1;
}

/**
 * A provider-neutral proof supplied only after the owner-local body source
 * snapshot has passed its authentication and freshness checks. This module
 * binds it to the semantic body pointer; it never reads provider data itself.
 */
export interface TaskMapVerifiedBodyProviderRead {
  snapshotDigest: string;
  completedAt: string;
  validThrough: string;
}

export interface TaskMapBodyInformedRequest {
  input: TaskMapInput;
  brain: SemanticBrainOutput;
  rootProposalId: string;
  bodyAxis: KnownBodyAxis;
  bodyCategory: RootCausalGateInput["bodyCategory"];
  now?: string;
  verifiedProviderRead?: TaskMapVerifiedBodyProviderRead;
}

export interface TaskMapBodyInformedAssessment {
  status: "body_informed" | "not_established";
  rootProposalId: string;
  observedTargetDates: string[];
  matchedDates: string[];
  matchedSourceKinds: TaskMapSourcePointer["sourceKind"][];
  reasonCode: TaskMapBodyCausalReasonCode | null;
  reason: string;
}

export interface TaskMapBodyCausalEvidenceSummary {
  bodyClassificationDayCount: number;
  bodyClassificationDates: string[];
  unknownBodyDayCount: number;
  unknownBodyDates: string[];
  eligibleWorkEventCount: number;
  eligibleWorkDayCount: number;
  eligibleWorkDates: string[];
  requiredWorkSourceKindCount: number;
  completeCoverageDayCount: number;
  completeCoverageDates: string[];
  comparableCoverageDayCount: number;
  comparableCoverageDates: string[];
  observedTargetBodyDates: string[];
  targetBodyDayCount: number;
  coveredTargetBodyDates: string[];
  targetHitDayCount: number;
  matchedTargetDates: string[];
  observedNeutralReferenceDates: string[];
  neutralReferenceDayCount: number;
  coveredNeutralReferenceDates: string[];
  neutralReferenceHitDayCount: number;
  matchedNeutralReferenceDates: string[];
  multiSourceBackedTargetDayCount: number;
  multiSourceBackedTargetDates: string[];
  controlRatio: number | null;
  enrichmentInfinite: boolean;
}

interface TaskMapBodyCausalAssessmentBase {
  contractVersion: typeof TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION;
  rootProposalId: string;
  bodyAxis: KnownBodyAxis;
  bodyCategory: RootCausalGateInput["bodyCategory"];
  evidence: TaskMapBodyCausalEvidenceSummary;
}

export interface TaskMapBodyCausalInputReady
  extends TaskMapBodyCausalAssessmentBase {
  status: "causal_input_ready";
  reasonCode: null;
  reason: null;
  gateVerdict: "attribution_candidate";
  causalInput: RootCausalGateInput;
}

export interface TaskMapBodyCausalInsufficientEvidence
  extends TaskMapBodyCausalAssessmentBase {
  status: "insufficient_evidence";
  reasonCode: TaskMapBodyCausalReasonCode;
  reason: string;
  gateVerdict: EnrichmentVerdict | null;
  causalInput: null;
}

export type TaskMapBodyCausalAssessment =
  | TaskMapBodyCausalInputReady
  | TaskMapBodyCausalInsufficientEvidence;

export interface TaskMapBodyPatternResultV1 {
  contractVersion: typeof TASKMAP_BODY_PATTERN_RESULT_VERSION;
  policyVersion: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version;
  rootProposalId: string;
  bodyAxis: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis;
  bodyCategory: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory;
  status:
    | "body_informed"
    | "repeated_pattern"
    | "no_repeated_pattern";
  evidenceLevel?:
    | "body_informed"
    | "corroborated_association"
    | "not_established";
  observedTargetDates: string[];
  comparableTargetDates: string[];
  matchedDates: string[];
  matchedDateCount: number;
  matchedSourceKinds?: TaskMapSourcePointer["sourceKind"][];
  comparableReferenceDates: string[];
  reasonCode: TaskMapBodyCausalReasonCode | null;
  reason: string;
}

export interface TaskMapOwnerBodyPatternEvaluationV1 {
  policyVersion: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version;
  results: TaskMapBodyPatternResultV1[];
  projectionInputs: RootCausalGateInput[];
}

export interface TaskMapBodyCausalProjectionSummary {
  runId: string;
  runStatus: TaskMapProjectionV1["runStatus"];
  membershipSignature: string;
  authoritySignature: string;
  rootCount: number;
  taskCount: number;
  root: null | {
    id: string;
    causalGrade: TaskMapRoot["causalGrade"];
    bodyContextCount: number;
    bodyBonus: number;
    score: number;
  };
  taskBodyBonusTotal: number;
}

export interface TaskMapBodyCausalComparison {
  contractVersion: typeof TASKMAP_BODY_CAUSAL_COMPARISON_VERSION;
  comparisonId: string;
  algorithmPolicyDigest: string;
  fixedNow: string;
  rootProposalId: string;
  bodyAxis: KnownBodyAxis;
  bodyCategory: RootCausalGateInput["bodyCategory"];
  assessment: TaskMapBodyCausalAssessment;
  r0BodyMasked: TaskMapBodyCausalProjectionSummary;
  r1BodyInformed: TaskMapBodyCausalProjectionSummary;
  membershipStable: boolean | null;
  authorityStable: boolean | null;
  rootScoreDelta: number | null;
  rootBodyBonusDelta: number | null;
}

const REASON_MESSAGES: Record<TaskMapBodyCausalReasonCode, string> = {
  root_not_found: "The requested root proposal does not exist.",
  input_or_brain_not_accepted: "The Task Map input or semantic brain is not accepted.",
  root_not_accepted: "The requested root did not survive the existing membership gates.",
  body_provider_read_unverified:
    "No verified current body-provider read was supplied.",
  body_provider_read_stale:
    "The verified body-provider read is no longer current.",
  body_provider_read_not_bound:
    "The verified body-provider read is not bound to the body evidence in this Task Map input.",
  contradictory_body_classification:
    "The body evidence contains conflicting classifications for a candidate signal day.",
  no_exact_root_work_overlap:
    "No accepted, root-specific work timestamp overlaps a candidate signal day.",
  no_eligible_work_evidence:
    "The accepted root cites no work event explicitly marked body-join eligible.",
  no_comparable_source_day_coverage:
    "No source-local day has complete coverage for every eligible root source and the fixed two-source floor.",
  no_covered_target_body_days:
    "No target body-classification day falls inside comparable complete coverage.",
  no_target_work_overlap:
    "No comparable target day overlaps explicitly eligible work evidence.",
  insufficient_target_backed_days:
    "Fewer than three target days have explicitly eligible work overlap.",
  enrichment_below_fixed_threshold:
    "The target work rate does not reach the fixed 2.0x enrichment threshold.",
  insufficient_multi_source_backing:
    "Fewer than three target days have at least two eligible work sources.",
  insufficient_neutral_reference_days:
    "Fewer than three comparable within-baseline reference days exist.",
  harness_causal_input_rejected:
    "The existing Task Map harness rejected the deterministically derived causal input.",
};

const BODY_PATTERN_REASON_MESSAGES: Record<TaskMapBodyCausalReasonCode, string> = {
  root_not_found: "The requested workstream does not exist.",
  input_or_brain_not_accepted:
    "The current Task Map input was not accepted for the fixed body-pattern check.",
  root_not_accepted:
    "The requested workstream did not survive the existing membership checks.",
  body_provider_read_unverified:
    "Body data was checked, but no verified current provider read was available for matching.",
  body_provider_read_stale:
    "The last verified body read is no longer current, so no work relationship is shown.",
  body_provider_read_not_bound:
    "The verified body read could not be bound to this accepted Task Map input.",
  contradictory_body_classification:
    "The same signal day has conflicting body classifications, so no relationship is shown.",
  no_exact_root_work_overlap:
    "No accepted work timestamp for this workstream fell on a below-personal-range day.",
  no_eligible_work_evidence:
    "No work timestamp for this workstream was explicitly eligible for body-pattern matching.",
  no_comparable_source_day_coverage:
    "No day had complete coverage for every required work source and the fixed two-source minimum.",
  no_covered_target_body_days:
    "No below-baseline Readiness and Sleep day fell inside comparable complete work-source coverage.",
  no_target_work_overlap:
    "No comparably covered below-baseline day overlapped eligible work for this workstream.",
  insufficient_target_backed_days:
    "Fewer than three below-baseline days overlapped eligible work.",
  enrichment_below_fixed_threshold:
    "The below-baseline work rate did not reach the fixed 2.0x threshold.",
  insufficient_multi_source_backing:
    "Fewer than three matched below-baseline days had at least two independent work sources.",
  insufficient_neutral_reference_days:
    "Fewer than three comparably covered within-baseline reference days were available.",
  harness_causal_input_rejected:
    "The fixed body-pattern result was not accepted by the current Task Map projection.",
};

function emptyEvidence(): TaskMapBodyCausalEvidenceSummary {
  return {
    bodyClassificationDayCount: 0,
    bodyClassificationDates: [],
    unknownBodyDayCount: 0,
    unknownBodyDates: [],
    eligibleWorkEventCount: 0,
    eligibleWorkDayCount: 0,
    eligibleWorkDates: [],
    requiredWorkSourceKindCount: 0,
    completeCoverageDayCount: 0,
    completeCoverageDates: [],
    comparableCoverageDayCount: 0,
    comparableCoverageDates: [],
    observedTargetBodyDates: [],
    targetBodyDayCount: 0,
    coveredTargetBodyDates: [],
    targetHitDayCount: 0,
    matchedTargetDates: [],
    observedNeutralReferenceDates: [],
    neutralReferenceDayCount: 0,
    coveredNeutralReferenceDates: [],
    neutralReferenceHitDayCount: 0,
    matchedNeutralReferenceDates: [],
    multiSourceBackedTargetDayCount: 0,
    multiSourceBackedTargetDates: [],
    controlRatio: null,
    enrichmentInfinite: false,
  };
}

function insufficient(
  request: TaskMapBodyCausalRequest,
  reasonCode: TaskMapBodyCausalReasonCode,
  evidence: TaskMapBodyCausalEvidenceSummary,
  gateVerdict: EnrichmentVerdict | null = null,
): TaskMapBodyCausalInsufficientEvidence {
  return {
    contractVersion: TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION,
    rootProposalId: request.rootProposalId,
    bodyAxis: request.bodyAxis,
    bodyCategory: request.bodyCategory,
    status: "insufficient_evidence",
    reasonCode,
    reason: REASON_MESSAGES[reasonCode],
    gateVerdict,
    causalInput: null,
    evidence,
  };
}

function isRealDayKey(value: unknown): value is string {
  return (
    typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * The public assessment first asks the existing harness to accept the input
 * and brain. Once accepted, this resolver is equivalent to the harness's
 * active-event rule: superseded and retracted rows cannot contribute.
 */
function activeEvents(input: TaskMapInput): TaskMapEvent[] {
  const inactive = new Set<string>();
  const tombstones = new Set<string>();
  for (const event of input.events) {
    if (event.supersedesEventId) inactive.add(event.supersedesEventId);
    if (event.retractsEventId) {
      inactive.add(event.retractsEventId);
      tombstones.add(event.id);
    }
  }
  return input.events.filter((event) => (
    !inactive.has(event.id) && !tombstones.has(event.id)
  ));
}

function sameSortedStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function matchingProjectionRoot(
  projection: TaskMapProjectionV1,
  proposal: BrainRootProposal,
): TaskMapRoot | undefined {
  return projection.roots.find((root) => (
    root.title === proposal.title
    && root.summary === proposal.summary
    && sameSortedStrings(root.memberObjectRefs, proposal.memberObjectRefs)
  ));
}

const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;
const BODY_INFORMED_WORK_SOURCE_KINDS = new Set<
  TaskMapSourcePointer["sourceKind"]
>([
  "gemini_meet",
  "granola",
  "codex_session",
  "claude_session",
  "cursor_session",
  // Calendar rows and user-authority manual work records are legitimate
  // same-day work evidence for the body-informed
  // association. This widens ONLY the body_informed matching source set; the
  // causal/purple lane and its eligibility gates are unchanged.
  "google_calendar",
  "manual",
]);

function canonicalInstant(value: unknown): number | null {
  if (typeof value !== "string" || !STRICT_RFC3339.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactSourceDay(event: TaskMapEvent): string | null {
  if (isRealDayKey(event.dayKey)) return event.dayKey;
  if (canonicalInstant(event.occurredAt) === null) return null;
  const sourceDay = event.occurredAt.slice(0, 10);
  return isRealDayKey(sourceDay) ? sourceDay : null;
}

function bodyInformedNotEstablished(
  request: TaskMapBodyInformedRequest,
  reasonCode: TaskMapBodyCausalReasonCode,
  observedTargetDates: readonly string[] = [],
): TaskMapBodyInformedAssessment {
  return {
    status: "not_established",
    rootProposalId: request.rootProposalId,
    observedTargetDates: sortedUnique(observedTargetDates),
    matchedDates: [],
    matchedSourceKinds: [],
    reasonCode,
    reason: BODY_PATTERN_REASON_MESSAGES[reasonCode],
  };
}

/**
 * Establishes only a body-informed work association. It deliberately does not
 * calculate enrichment, add a body score, create work membership, or supply an
 * E4 causal input. One exact accepted work timestamp may pass these three
 * checks:
 * 1. a verified current provider read is bound to the body evidence;
 * 2. accepted root-cited work occurs on a below-personal-range day; and
 * 3. source/day provenance is bounded and the body classification is not
 *    contradictory.
 *
 * A root-cited meeting or agent-session work_context may derive its source day
 * from the RFC3339 timestamp when an older accepted producer omitted dayKey.
 * This is local to this weaker view; it does not mutate or upgrade the event's
 * bodyJoinEligible field.
 */
export function assessTaskMapBodyInformedPattern(
  request: TaskMapBodyInformedRequest,
): TaskMapBodyInformedAssessment {
  const root = request.brain.roots.find((candidate) => (
    candidate.proposalId === request.rootProposalId
  ));
  if (!root) return bodyInformedNotEstablished(request, "root_not_found");

  const baseline = buildTaskMapProjection(request.input, request.brain, {
    arm: "E2",
    now: request.now ?? request.input.generatedAt,
  });
  if (baseline.runStatus !== "accepted") {
    return bodyInformedNotEstablished(
      request,
      "input_or_brain_not_accepted",
    );
  }
  if (!matchingProjectionRoot(baseline, root)) {
    return bodyInformedNotEstablished(request, "root_not_accepted");
  }

  const providerRead = request.verifiedProviderRead;
  if (
    providerRead === undefined
    || !SHA256.test(providerRead.snapshotDigest)
    || canonicalInstant(providerRead.completedAt) === null
    || canonicalInstant(providerRead.validThrough) === null
  ) {
    return bodyInformedNotEstablished(
      request,
      "body_provider_read_unverified",
    );
  }
  const assessedAt = canonicalInstant(request.now ?? request.input.generatedAt);
  const completedAt = canonicalInstant(providerRead.completedAt)!;
  const validThrough = canonicalInstant(providerRead.validThrough)!;
  if (
    assessedAt === null
    || assessedAt < completedAt
    || assessedAt >= validThrough
  ) {
    return bodyInformedNotEstablished(request, "body_provider_read_stale");
  }

  const events = activeEvents(request.input);
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const pointers = new Map(
    request.input.pointers.map((pointer) => [pointer.id, pointer]),
  );
  const boundBodyPointerIds = new Set(request.input.pointers
    .filter((pointer) => (
      pointer.sourceVersion === providerRead.snapshotDigest
      && pointer.authority === "none"
      && pointer.capabilities.includes("read_context")
    ))
    .map((pointer) => pointer.id));
  if (boundBodyPointerIds.size === 0) {
    return bodyInformedNotEstablished(
      request,
      "body_provider_read_not_bound",
    );
  }

  const bodyEvents = events.filter((event) => (
    event.recordKind === "body_context"
    && event.bodyAxis === request.bodyAxis
    && isRealDayKey(event.dayKey)
    && boundBodyPointerIds.has(event.pointerId)
  ));
  const observedTargetDates = sortedUnique(bodyEvents
    .filter((event) => event.bodyCategory === request.bodyCategory)
    .map((event) => event.dayKey!));
  if (observedTargetDates.length === 0) {
    return bodyInformedNotEstablished(
      request,
      "no_covered_target_body_days",
    );
  }

  const targetDateSet = new Set(observedTargetDates);
  const classificationsByTargetDate = new Map<string, Set<string>>();
  for (const event of bodyEvents) {
    if (!targetDateSet.has(event.dayKey!)) continue;
    const classifications =
      classificationsByTargetDate.get(event.dayKey!) ?? new Set<string>();
    classifications.add(event.bodyCategory ?? "unknown");
    classificationsByTargetDate.set(event.dayKey!, classifications);
  }
  if (
    [...classificationsByTargetDate.values()]
      .some((classifications) => classifications.size !== 1)
  ) {
    return bodyInformedNotEstablished(
      request,
      "contradictory_body_classification",
      observedTargetDates,
    );
  }

  const workSourcesByDate = new Map<
    string,
    Set<TaskMapSourcePointer["sourceKind"]>
  >();
  for (const eventId of sortedUnique(root.evidenceEventIds)) {
    const event = eventsById.get(eventId);
    if (event?.recordKind !== "work_context") continue;
    const pointer = pointers.get(event.pointerId);
    if (
      pointer === undefined
      || !BODY_INFORMED_WORK_SOURCE_KINDS.has(pointer.sourceKind)
    ) continue;
    const day = exactSourceDay(event);
    if (day === null || !targetDateSet.has(day)) continue;
    const sources = workSourcesByDate.get(day) ?? new Set();
    sources.add(pointer.sourceKind);
    workSourcesByDate.set(day, sources);
  }
  const matchedDates = sortedUnique([...workSourcesByDate.keys()]);
  if (matchedDates.length === 0) {
    return bodyInformedNotEstablished(
      request,
      "no_exact_root_work_overlap",
      observedTargetDates,
    );
  }

  return {
    status: "body_informed",
    rootProposalId: request.rootProposalId,
    observedTargetDates,
    matchedDates,
    matchedSourceKinds: sortedUnique(matchedDates.flatMap((date) => (
      [...(workSourcesByDate.get(date) ?? [])]
    ))) as TaskMapSourcePointer["sourceKind"][],
    reasonCode: null,
    reason:
      `Accepted work in this workstream occurred on ${matchedDates.join(", ")}, when recovery was below your recent personal range. This is an association, not proof of cause.`,
  };
}

function buildEvidenceAndInput(
  request: TaskMapBodyCausalRequest,
  root: BrainRootProposal,
): {
  evidence: TaskMapBodyCausalEvidenceSummary;
  causalInput: RootCausalGateInput;
} {
  const events = activeEvents(request.input);
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const pointers = new Map(request.input.pointers.map((pointer) => [pointer.id, pointer]));
  const rootEvents = sortedUnique(root.evidenceEventIds)
    .map((eventId) => eventsById.get(eventId))
    .filter((event): event is TaskMapEvent => (
      event !== undefined
      && event.recordKind !== "body_context"
      && event.bodyJoinEligible === true
    ));

  const workSourcesByDate = new Map<string, Set<string>>();
  for (const event of rootEvents) {
    if (!isRealDayKey(event.dayKey)) continue;
    const sourceKind = pointers.get(event.pointerId)?.sourceKind;
    if (!sourceKind) continue;
    const sources = workSourcesByDate.get(event.dayKey) ?? new Set<string>();
    sources.add(sourceKind);
    workSourcesByDate.set(event.dayKey, sources);
  }

  const requiredRootSourceKinds = new Set(rootEvents
    .map((event) => pointers.get(event.pointerId)?.sourceKind)
    .filter((sourceKind): sourceKind is TaskMapSourcePointer["sourceKind"] => (
      sourceKind !== undefined
    )));
  const coverageSourcesByDate = new Map<string, Set<string>>();
  for (const event of events) {
    if (
      event.recordKind !== "receipt"
      || event.activity !== "receipt_observed"
      || event.corpusCoverage !== "complete"
      || !isRealDayKey(event.dayKey)
    ) continue;
    const sourceKind = pointers.get(event.pointerId)?.sourceKind;
    if (!sourceKind) continue;
    const sources = coverageSourcesByDate.get(event.dayKey) ?? new Set<string>();
    sources.add(sourceKind);
    coverageSourcesByDate.set(event.dayKey, sources);
  }

  const hasComparableCoverage = (dayKey: string): boolean => {
    if (requiredRootSourceKinds.size === 0) return false;
    const covered = coverageSourcesByDate.get(dayKey);
    if (
      !covered
      || covered.size < TASKMAP_ALGORITHM_POLICY.causal.minCorpusSourcesPerDay
    ) return false;
    return [...requiredRootSourceKinds].every((sourceKind) => covered.has(sourceKind));
  };

  const bodyEvents = events.filter((event) => (
    event.recordKind === "body_context"
    && event.bodyAxis === request.bodyAxis
    && isRealDayKey(event.dayKey)
  ));
  const bodyClassificationDays = sortedUnique(bodyEvents
    .filter((event) => event.bodyCategory !== "unknown")
    .map((event) => event.dayKey!));
  const unknownBodyDays = sortedUnique(bodyEvents
    .filter((event) => event.bodyCategory === "unknown")
    .map((event) => event.dayKey!));
  const observedTargetDates = sortedUnique(bodyEvents
    .filter((event) => event.bodyCategory === request.bodyCategory)
    .map((event) => event.dayKey!));
  const targetDates = observedTargetDates.filter(hasComparableCoverage);
  const observedReferenceDates = sortedUnique(bodyEvents
    .filter((event) => (
      event.bodyCategory === TASKMAP_ALGORITHM_POLICY.causal.neutralReferenceCategory
    ))
    .map((event) => event.dayKey!));
  const referenceDates = observedReferenceDates.filter(hasComparableCoverage);
  const targetHitDates = targetDates.filter((date) => workSourcesByDate.has(date));
  const referenceHitDates = referenceDates.filter((date) => workSourcesByDate.has(date));
  const citedDays = targetHitDates.map((date) => ({
    date,
    backed: true,
    sources: [...(workSourcesByDate.get(date) ?? [])].sort(),
  }));
  const referenceRate = referenceDates.length === 0
    ? 0
    : referenceHitDates.length / referenceDates.length;
  const gatePreview = enrichmentGate({
    theme: root.title,
    targetHits: targetHitDates.length,
    targetN: targetDates.length,
    referenceRate,
    referenceN: referenceDates.length,
    citedDays,
    rtmSuspected: targetHitDates.length > 0,
  });
  const completeCoverageDates = sortedUnique([
    ...coverageSourcesByDate.keys(),
  ]);
  const comparableCoverageDates = completeCoverageDates
    .filter(hasComparableCoverage);

  return {
    evidence: {
      bodyClassificationDayCount: bodyClassificationDays.length,
      bodyClassificationDates: bodyClassificationDays,
      unknownBodyDayCount: unknownBodyDays.length,
      unknownBodyDates: unknownBodyDays,
      eligibleWorkEventCount: rootEvents.length,
      eligibleWorkDayCount: workSourcesByDate.size,
      eligibleWorkDates: sortedUnique([...workSourcesByDate.keys()]),
      requiredWorkSourceKindCount: requiredRootSourceKinds.size,
      completeCoverageDayCount: coverageSourcesByDate.size,
      completeCoverageDates,
      comparableCoverageDayCount: comparableCoverageDates.length,
      comparableCoverageDates,
      observedTargetBodyDates: observedTargetDates,
      targetBodyDayCount: targetDates.length,
      coveredTargetBodyDates: targetDates,
      targetHitDayCount: targetHitDates.length,
      matchedTargetDates: targetHitDates,
      observedNeutralReferenceDates: observedReferenceDates,
      neutralReferenceDayCount: referenceDates.length,
      coveredNeutralReferenceDates: referenceDates,
      neutralReferenceHitDayCount: referenceHitDates.length,
      matchedNeutralReferenceDates: referenceHitDates,
      multiSourceBackedTargetDayCount: gatePreview.multiSourceBackedDays.length,
      multiSourceBackedTargetDates: gatePreview.multiSourceBackedDays,
      controlRatio: Number.isFinite(gatePreview.ratio) ? gatePreview.ratio : null,
      enrichmentInfinite: gatePreview.ratio === Infinity,
    },
    causalInput: {
      rootProposalId: request.rootProposalId,
      bodyAxis: request.bodyAxis,
      bodyCategory: request.bodyCategory,
      enrichment: {
        theme: root.title,
        targetHits: targetHitDates.length,
        targetN: targetDates.length,
        referenceRate,
        referenceN: referenceDates.length,
        citedDays,
        rtmSuspected: targetHitDates.length > 0,
      },
    },
  };
}

function bodyPatternResult(
  assessment: TaskMapBodyCausalAssessment,
  bodyInformed: TaskMapBodyInformedAssessment,
  providerReadSupplied: boolean,
): TaskMapBodyPatternResultV1 {
  const matchedDates = assessment.evidence.multiSourceBackedTargetDates;
  if (assessment.status === "causal_input_ready") {
    const matchedSourceKinds = sortedUnique(
      assessment.causalInput.enrichment.citedDays.flatMap((day) => day.sources),
    ) as TaskMapSourcePointer["sourceKind"][];
    return {
      contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
      policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
      rootProposalId: assessment.rootProposalId,
      bodyAxis: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis,
      bodyCategory: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory,
      status: "repeated_pattern",
      evidenceLevel: "corroborated_association",
      observedTargetDates: assessment.evidence.observedTargetBodyDates,
      comparableTargetDates: assessment.evidence.coveredTargetBodyDates,
      matchedDates,
      matchedDateCount: matchedDates.length,
      matchedSourceKinds,
      comparableReferenceDates:
        assessment.evidence.coveredNeutralReferenceDates,
      reason:
        `Eligible work repeated on ${matchedDates.length} below-baseline day(s) under the fixed complete-coverage, two-source, and 2.0x rules.`,
      reasonCode: null,
    };
  }
  if (bodyInformed.status === "body_informed") {
    return {
      contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
      policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
      rootProposalId: assessment.rootProposalId,
      bodyAxis: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis,
      bodyCategory: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory,
      status: "body_informed",
      evidenceLevel: "body_informed",
      observedTargetDates: bodyInformed.observedTargetDates,
      comparableTargetDates: [],
      matchedDates: bodyInformed.matchedDates,
      matchedDateCount: bodyInformed.matchedDates.length,
      matchedSourceKinds: bodyInformed.matchedSourceKinds,
      comparableReferenceDates: [],
      reasonCode: null,
      reason: bodyInformed.reason,
    };
  }
  return {
    contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
    policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
    rootProposalId: assessment.rootProposalId,
    bodyAxis: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis,
    bodyCategory: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory,
    status: "no_repeated_pattern",
    observedTargetDates: assessment.evidence.observedTargetBodyDates,
    comparableTargetDates: assessment.evidence.coveredTargetBodyDates,
    matchedDates,
    matchedDateCount: matchedDates.length,
    comparableReferenceDates:
      assessment.evidence.coveredNeutralReferenceDates,
    reasonCode: providerReadSupplied
      ? bodyInformed.reasonCode ?? assessment.reasonCode
      : assessment.reasonCode,
    reason: providerReadSupplied
      ? bodyInformed.reason
      : BODY_PATTERN_REASON_MESSAGES[assessment.reasonCode],
  };
}

/**
 * Evaluates every proposed root against one owner-live hypothesis fixed before
 * reading the data. Above-baseline days remain context and are never tried as
 * an alternative target.
 */
export function evaluateTaskMapOwnerBodyPatterns(input: {
  taskMapInput: TaskMapInput;
  brain: SemanticBrainOutput;
  now?: string;
  verifiedProviderRead?: TaskMapVerifiedBodyProviderRead;
}): TaskMapOwnerBodyPatternEvaluationV1 {
  const assessments = [...input.brain.roots]
    .sort((left, right) => left.proposalId.localeCompare(right.proposalId))
    .map((root) => {
      const causal = assessTaskMapBodyCausalInput({
        input: input.taskMapInput,
        brain: input.brain,
        rootProposalId: root.proposalId,
        bodyAxis: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis,
        bodyCategory: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory,
        ...(input.now === undefined ? {} : { now: input.now }),
      });
      const bodyInformed = assessTaskMapBodyInformedPattern({
        input: input.taskMapInput,
        brain: input.brain,
        rootProposalId: root.proposalId,
        bodyAxis: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis,
        bodyCategory: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory,
        ...(input.now === undefined ? {} : { now: input.now }),
        ...(input.verifiedProviderRead === undefined
          ? {}
          : { verifiedProviderRead: input.verifiedProviderRead }),
      });
      return { causal, bodyInformed };
    });
  return {
    policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
    results: assessments.map(({ causal, bodyInformed }) => (
      bodyPatternResult(
        causal,
        bodyInformed,
        input.verifiedProviderRead !== undefined,
      )
    )),
    projectionInputs: assessments.flatMap(({ causal }) => (
      causal.status === "causal_input_ready"
        ? [causal.causalInput]
        : []
    )),
  };
}

/**
 * Builds a harness-ready causal input only after the existing fixed C2 gate
 * passes. Every weaker result is explicit and carries a stable reason code;
 * callers never have to infer "insufficient" from a silent C0 projection.
 */
export function assessTaskMapBodyCausalInput(
  request: TaskMapBodyCausalRequest,
): TaskMapBodyCausalAssessment {
  const root = request.brain.roots.find((candidate) => (
    candidate.proposalId === request.rootProposalId
  ));
  if (!root) return insufficient(request, "root_not_found", emptyEvidence());

  const baseline = buildTaskMapProjection(request.input, request.brain, {
    arm: "E2",
    now: request.now ?? request.input.generatedAt,
  });
  if (baseline.runStatus !== "accepted") {
    return insufficient(request, "input_or_brain_not_accepted", emptyEvidence());
  }
  if (!matchingProjectionRoot(baseline, root)) {
    return insufficient(request, "root_not_accepted", emptyEvidence());
  }

  const { evidence, causalInput } = buildEvidenceAndInput(request, root);
  if (evidence.eligibleWorkEventCount === 0) {
    return insufficient(request, "no_eligible_work_evidence", evidence);
  }
  if (evidence.comparableCoverageDayCount === 0) {
    return insufficient(request, "no_comparable_source_day_coverage", evidence);
  }
  if (evidence.targetBodyDayCount === 0) {
    return insufficient(request, "no_covered_target_body_days", evidence);
  }

  const gate = enrichmentGate(causalInput.enrichment);
  if (gate.verdict === "no_data") {
    return insufficient(request, "no_target_work_overlap", evidence, gate.verdict);
  }
  if (
    gate.verdict === "insufficient_power"
    && gate.backedDays.length < DEFAULT_ENRICHMENT_THRESHOLDS.minBackedDays
  ) {
    return insufficient(
      request,
      "insufficient_target_backed_days",
      evidence,
      gate.verdict,
    );
  }
  if (gate.verdict === "context_only") {
    return insufficient(
      request,
      "enrichment_below_fixed_threshold",
      evidence,
      gate.verdict,
    );
  }
  if (gate.verdict === "insufficient_power") {
    return insufficient(
      request,
      "insufficient_multi_source_backing",
      evidence,
      gate.verdict,
    );
  }
  if (
    causalInput.enrichment.referenceN
    < TASKMAP_ALGORITHM_POLICY.causal.minNeutralReferenceDays
  ) {
    return insufficient(
      request,
      "insufficient_neutral_reference_days",
      evidence,
      "insufficient_power",
    );
  }

  const harnessCheck = buildTaskMapProjection(request.input, request.brain, {
    arm: "E4",
    now: request.now ?? request.input.generatedAt,
    causalInputs: [causalInput],
  });
  if (
    harnessCheck.runStatus !== "accepted"
    || harnessCheck.rejections.some((rejection) => (
      rejection.proposalId === `causal:${request.rootProposalId}`
    ))
  ) {
    return insufficient(
      request,
      "harness_causal_input_rejected",
      evidence,
      gate.verdict,
    );
  }

  return {
    contractVersion: TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION,
    rootProposalId: request.rootProposalId,
    bodyAxis: request.bodyAxis,
    bodyCategory: request.bodyCategory,
    status: "causal_input_ready",
    reasonCode: null,
    reason: null,
    gateVerdict: "attribution_candidate",
    causalInput,
    evidence,
  };
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function projectionAuthoritySignature(projection: TaskMapProjectionV1): string {
  const rows = projection.tasks.map((task) => ({
    id: task.id,
    rootId: task.rootId,
    authority: task.authority,
    taskHomePointerId: task.taskHomePointerId ?? null,
    reviewState: task.reviewState,
    openState: task.openState,
    returnRoute: task.returnRoute,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(stableJson(rows)).digest("hex");
}

function projectionSummary(
  projection: TaskMapProjectionV1,
  proposal: BrainRootProposal | undefined,
): TaskMapBodyCausalProjectionSummary {
  const root = proposal ? matchingProjectionRoot(projection, proposal) : undefined;
  return {
    runId: projection.runId,
    runStatus: projection.runStatus,
    membershipSignature: taskMapMembershipSignature(projection),
    authoritySignature: projectionAuthoritySignature(projection),
    rootCount: projection.roots.length,
    taskCount: projection.tasks.length,
    root: root ? {
      id: root.id,
      causalGrade: root.causalGrade,
      bodyContextCount: root.bodyContextCount,
      bodyBonus: root.scoreBreakdown.bodyBonus,
      score: root.score,
    } : null,
    taskBodyBonusTotal: round(projection.tasks.reduce(
      (sum, task) => sum + task.score.bodyBonus,
      0,
    )),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function comparisonId(value: unknown): string {
  return `tmbca_${createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16)}`;
}

/**
 * Replays one predeclared hypothesis twice:
 * - R0 removes only body-context rows and supplies no causal input.
 * - R1 keeps body classifications and supplies the input only when C2-ready.
 *
 * Coverage receipts remain in both arms because they are semantic-neutral
 * availability facts. Both projections still pass through the same authority,
 * membership, lifecycle, privacy, and scoring implementation.
 */
export function runTaskMapBodyCausalComparison(
  request: TaskMapBodyCausalRequest,
): TaskMapBodyCausalComparison {
  const fixedNow = request.now ?? request.input.generatedAt;
  const assessment = assessTaskMapBodyCausalInput(request);
  const maskedInput: TaskMapInput = {
    ...request.input,
    events: request.input.events.filter((event) => event.recordKind !== "body_context"),
  };
  const sharedOptions = {
    arm: "E4" as const,
    now: fixedNow,
    ...(request.previousProjection === undefined
      ? {}
      : { previousProjection: request.previousProjection }),
  };
  const r0Projection = buildTaskMapProjection(maskedInput, request.brain, {
    ...sharedOptions,
    causalInputs: [],
  });
  const r1Projection = buildTaskMapProjection(request.input, request.brain, {
    ...sharedOptions,
    causalInputs: assessment.status === "causal_input_ready"
      ? [assessment.causalInput]
      : [],
  });
  const proposal = request.brain.roots.find((candidate) => (
    candidate.proposalId === request.rootProposalId
  ));
  const r0BodyMasked = projectionSummary(r0Projection, proposal);
  const r1BodyInformed = projectionSummary(r1Projection, proposal);
  const membershipStable = (
    r0Projection.runStatus === "accepted"
    && r1Projection.runStatus === "accepted"
  )
    ? r0BodyMasked.membershipSignature === r1BodyInformed.membershipSignature
    : null;
  const authorityStable = (
    r0Projection.runStatus === "accepted"
    && r1Projection.runStatus === "accepted"
  )
    ? r0BodyMasked.authoritySignature === r1BodyInformed.authoritySignature
    : null;
  const rootScoreDelta = r0BodyMasked.root && r1BodyInformed.root
    ? round(r1BodyInformed.root.score - r0BodyMasked.root.score)
    : null;
  const rootBodyBonusDelta = r0BodyMasked.root && r1BodyInformed.root
    ? round(r1BodyInformed.root.bodyBonus - r0BodyMasked.root.bodyBonus)
    : null;
  const identityPayload = {
    contractVersion: TASKMAP_BODY_CAUSAL_COMPARISON_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    fixedNow,
    rootProposalId: request.rootProposalId,
    bodyAxis: request.bodyAxis,
    bodyCategory: request.bodyCategory,
    assessment,
    r0BodyMasked,
    r1BodyInformed,
    membershipStable,
    authorityStable,
    rootScoreDelta,
    rootBodyBonusDelta,
  };

  return {
    ...identityPayload,
    comparisonId: comparisonId(identityPayload),
  };
}
