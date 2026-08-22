import { type EnrichmentVerdict } from "../reasoner/EnrichmentGate.js";
import type { RootCausalGateInput, SemanticBrainOutput, TaskMapInput, TaskMapProjectionV1, TaskMapRoot, TaskMapSourcePointer } from "./types.js";
export declare const TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION: "taskmap-body-causal-assessment.v1";
export declare const TASKMAP_BODY_CAUSAL_COMPARISON_VERSION: "taskmap-body-causal-comparison.v1";
export declare const TASKMAP_BODY_PATTERN_RESULT_VERSION: "taskmap-body-pattern-result.v1";
export declare const TASKMAP_OWNER_BODY_PATTERN_POLICY_V1: Readonly<{
    version: "taskmap-owner-body-pattern-policy.1";
    bodyAxis: "composite_recovery";
    bodyCategory: "below_baseline";
}>;
type KnownBodyAxis = Exclude<RootCausalGateInput["bodyAxis"], "unknown">;
export type TaskMapBodyCausalReasonCode = "root_not_found" | "input_or_brain_not_accepted" | "root_not_accepted" | "body_provider_read_unverified" | "body_provider_read_stale" | "body_provider_read_not_bound" | "contradictory_body_classification" | "no_exact_root_work_overlap" | "no_eligible_work_evidence" | "no_comparable_source_day_coverage" | "no_covered_target_body_days" | "no_target_work_overlap" | "insufficient_target_backed_days" | "enrichment_below_fixed_threshold" | "insufficient_multi_source_backing" | "insufficient_neutral_reference_days" | "harness_causal_input_rejected";
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
export interface TaskMapBodyCausalInputReady extends TaskMapBodyCausalAssessmentBase {
    status: "causal_input_ready";
    reasonCode: null;
    reason: null;
    gateVerdict: "attribution_candidate";
    causalInput: RootCausalGateInput;
}
export interface TaskMapBodyCausalInsufficientEvidence extends TaskMapBodyCausalAssessmentBase {
    status: "insufficient_evidence";
    reasonCode: TaskMapBodyCausalReasonCode;
    reason: string;
    gateVerdict: EnrichmentVerdict | null;
    causalInput: null;
}
export type TaskMapBodyCausalAssessment = TaskMapBodyCausalInputReady | TaskMapBodyCausalInsufficientEvidence;
export interface TaskMapBodyPatternResultV1 {
    contractVersion: typeof TASKMAP_BODY_PATTERN_RESULT_VERSION;
    policyVersion: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version;
    rootProposalId: string;
    bodyAxis: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyAxis;
    bodyCategory: typeof TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.bodyCategory;
    status: "body_informed" | "repeated_pattern" | "no_repeated_pattern";
    evidenceLevel?: "body_informed" | "corroborated_association" | "not_established";
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
export declare function assessTaskMapBodyInformedPattern(request: TaskMapBodyInformedRequest): TaskMapBodyInformedAssessment;
/**
 * Evaluates every proposed root against one owner-live hypothesis fixed before
 * reading the data. Above-baseline days remain context and are never tried as
 * an alternative target.
 */
export declare function evaluateTaskMapOwnerBodyPatterns(input: {
    taskMapInput: TaskMapInput;
    brain: SemanticBrainOutput;
    now?: string;
    verifiedProviderRead?: TaskMapVerifiedBodyProviderRead;
}): TaskMapOwnerBodyPatternEvaluationV1;
/**
 * Builds a harness-ready causal input only after the existing fixed C2 gate
 * passes. Every weaker result is explicit and carries a stable reason code;
 * callers never have to infer "insufficient" from a silent C0 projection.
 */
export declare function assessTaskMapBodyCausalInput(request: TaskMapBodyCausalRequest): TaskMapBodyCausalAssessment;
/**
 * Replays one predeclared hypothesis twice:
 * - R0 removes only body-context rows and supplies no causal input.
 * - R1 keeps body classifications and supplies the input only when C2-ready.
 *
 * Coverage receipts remain in both arms because they are semantic-neutral
 * availability facts. Both projections still pass through the same authority,
 * membership, lifecycle, privacy, and scoring implementation.
 */
export declare function runTaskMapBodyCausalComparison(request: TaskMapBodyCausalRequest): TaskMapBodyCausalComparison;
export {};
