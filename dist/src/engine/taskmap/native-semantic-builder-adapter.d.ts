import { TASKMAP_MEETING_PRODUCER_RESULT_VERSION, TASKMAP_MEETING_PRODUCER_VERSION, type TaskMapMeetingProducerResultV1 } from "./meeting-producer-freshness.js";
import { type TaskMapBodyPatternResultV1 } from "./body-causal-assessment.js";
import type { TaskMapPhysiologicalSemanticContextV1 } from "./physiological-source-snapshot.js";
import { type TaskMapNativeCandidateAcceptanceStoreV1 } from "./native-candidate-acceptance.js";
import { type RootCausalGateInput, type SemanticBrainOutput, type TaskMapInput, type TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION: "taskmap-native-semantic-builder-input.v1";
export declare const TASKMAP_NATIVE_SEMANTIC_BUILDER_VERSION: "taskmap-native-semantic-builder.1";
export declare const TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION: "taskmap-native-body-pattern-build.v1";
export declare const TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1: Readonly<{
    maximumPointers: 128;
    maximumSemanticEvents: 128;
    maximumTotalEvents: 512;
    acceptedOwnerBodyHistoryDays: 90;
    maximumSourceBindings: 128;
    maximumEvidenceBindings: 512;
    bodyFreshnessWindowMs: number;
}>;
export type TaskMapNativeSemanticFreshnessDecision = "fresh" | "boundary_due" | "stale" | "missing" | "unknown_version" | "malformed";
export interface TaskMapNativeSemanticSourceBindingV1 {
    pointerId: string;
    semanticClass: "source_authoritative" | "meeting_context" | "context_only" | "body_context";
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
    disposition: "source_authoritative" | "candidate_only" | "context_only" | "body_only";
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
export interface TaskMapNativeMeetingSemanticBuilderOptions extends TaskMapNativeSemanticBuilderOptions {
    expectedOwnerScopeDigest: string;
}
export interface TaskMapNativeMeetingBodySemanticBuilderOptions extends Omit<TaskMapNativeSemanticBuilderOptions, "causalInputs"> {
    expectedOwnerScopeDigest: string;
}
export interface TaskMapNativeBodyPatternBuildResultV1 {
    contractVersion: typeof TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION;
    projection: TaskMapProjectionV1;
    bodyPatternResults: TaskMapBodyPatternResultV1[];
}
export type TaskMapNativeSemanticBuilderFailureCode = "invalid_contract" | "invalid_freshness" | "invalid_source_binding" | "input_limit_exceeded" | "invalid_predecessor" | "owner_scope_mismatch" | "harness_rejected" | "no_eligible_work" | "predecessor_continuity_required";
export declare class TaskMapNativeSemanticBuilderUnavailableError extends Error {
    readonly code: TaskMapNativeSemanticBuilderFailureCode;
    constructor(code: TaskMapNativeSemanticBuilderFailureCode);
}
export declare function buildTaskMapNativeDeterministicBrain(input: TaskMapInput, sourceBindings: readonly TaskMapNativeSemanticSourceBindingV1[], evidenceBindings: readonly TaskMapNativeSemanticEvidenceBindingV1[]): SemanticBrainOutput;
/**
 * Pure conversion from the authenticated M2B result. It keeps opaque source
 * revision binding outside TaskMap semantic identity, emits one pointer per
 * canonical meeting, and never expands provider variants into occurrences.
 */
export declare function taskMapNativeSemanticInputFromMeetingProducerResult(result: TaskMapMeetingProducerResultV1, expectedOwnerScopeDigest: string): TaskMapNativeSemanticBuilderInputV1;
export declare function buildTaskMapNativeSemanticProjection(input: TaskMapNativeSemanticBuilderInputV1, options?: TaskMapNativeSemanticBuilderOptions): TaskMapProjectionV1;
export declare function buildTaskMapNativeSemanticProjectionFromMeetingProducerResult(result: TaskMapMeetingProducerResultV1, options: TaskMapNativeMeetingSemanticBuilderOptions): TaskMapProjectionV1;
export declare function taskMapNativeSemanticInputWithPhysiologicalContext(meetingInput: TaskMapNativeSemanticBuilderInputV1, physiologicalContext: TaskMapPhysiologicalSemanticContextV1, candidateAcceptanceStore?: TaskMapNativeCandidateAcceptanceStoreV1): TaskMapNativeSemanticBuilderInputV1;
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
export declare function buildTaskMapNativeSemanticProjectionFromMeetingAndPhysiologicalContext(result: TaskMapMeetingProducerResultV1, physiologicalContext: TaskMapPhysiologicalSemanticContextV1, options: TaskMapNativeMeetingBodySemanticBuilderOptions): TaskMapNativeBodyPatternBuildResultV1;
