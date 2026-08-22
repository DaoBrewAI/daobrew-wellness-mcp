import type { MentionActor, MentionSpeechActClass } from "./mention-extraction.js";
import type { TaskMapEvidenceAuthority, TaskMapEvidenceQuality, TaskMapSourceAuthorityBindingV1 } from "./types.js";
/**
 * This artifact is deliberately separate from TaskMapSourceEnvelopeV1.
 * Source envelopes remain metadata-only; this contract carries only bounded,
 * producer-reviewed meeting evidence.
 */
export declare const TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION: "taskmap-meeting-producer-snapshot.v1";
export declare const TASKMAP_MEETING_PRODUCER_RESULT_VERSION: "taskmap-meeting-producer-result.v1";
export declare const TASKMAP_MEETING_PRODUCER_VERSION: "taskmap-meeting-producer.1";
export declare const TASKMAP_MEETING_PRODUCER_OWNER_SCOPE_DOMAIN: "taskmap-owner-local.1";
export declare const TASKMAP_MEETING_PRODUCER_MAX_AGE_MS: 14400000;
export declare const TASKMAP_MEETING_STATEMENT_REFERENCE_DOMAIN: "taskmap-meeting-statement-reference.1";
export declare const TASKMAP_MEETING_NORMALIZED_STATEMENT_REFERENCE_DOMAIN: "taskmap-meeting-normalized-statement-reference.1";
export declare const TASKMAP_MEETING_PRODUCER_LIMITS_V1: Readonly<{
    readonly maxMeetings: 64;
    readonly maxVariantsPerMeeting: 8;
    readonly maxEvidencePerVariant: 20;
    readonly maxEvidenceGlobal: 128;
    readonly maxObjectRefsPerEvidence: 16;
    readonly maxTitleCharacters: 96;
    readonly maxSummaryCharacters: 200;
    readonly maxFileBytes: number;
    readonly maxOpaqueBytes: 1024;
}>;
declare const PRIVACY: Readonly<{
    sourceBodiesStored: false;
    transcriptBodiesStored: false;
    emailContentStored: false;
    participantDetailsStored: false;
    credentialsStored: false;
    localPathsStored: false;
}>;
export type TaskMapMeetingProducerEvidenceKind = "decision" | "action_item" | "commitment";
export type TaskMapMeetingProducerEvidenceStatus = "proposed" | "open" | "in_progress" | "done" | "cancelled" | "unknown";
export type TaskMapMeetingProducerCoverage = "complete" | "partial";
export type TaskMapMeetingProducerObjectRefKind = "canonical_meeting" | "source_object" | "external_reference";
export interface TaskMapMeetingProducerObjectRefV1 {
    kind: TaskMapMeetingProducerObjectRefKind;
    referenceDigest: string;
}
export interface TaskMapMeetingStatementReferenceInputV1 {
    kind: TaskMapMeetingProducerEvidenceKind;
    title: string;
    summary: string;
    explicitExternalReferenceDigests: readonly string[];
    mentionIdentityDigest?: string;
}
export interface TaskMapMeetingProducerEvidenceDraftV1 {
    kind: TaskMapMeetingProducerEvidenceKind;
    title: string;
    summary: string;
    occurredAt: string;
    observedAt: string;
    status?: TaskMapMeetingProducerEvidenceStatus;
    deadline?: string;
    quality?: Extract<TaskMapEvidenceQuality, "source_native" | "structured_generated" | "provider_summary" | "degraded_summary" | "bounded_context">;
    coverage?: TaskMapMeetingProducerCoverage;
    confidence?: number;
    objectRefs?: TaskMapMeetingProducerObjectRefV1[];
    speechActClass?: MentionSpeechActClass;
    speechActActor?: MentionActor;
    mentionIdentityDigest?: string;
    extractionEnvelopeDigest?: string;
}
export interface TaskMapMeetingProducerGranolaVariantDraftV1 {
    binding: TaskMapSourceAuthorityBindingV1;
    sourceObjectId: string;
    sourceVersion: string;
    contentDigest: string;
    modifiedAt: string;
    eventTime: string;
    observedAt: string;
    evidence: TaskMapMeetingProducerEvidenceDraftV1[];
}
export interface TaskMapMeetingProducerMeetingDraftV1 {
    binding: TaskMapSourceAuthorityBindingV1;
    documentId: string;
    revisionId: string;
    contentDigest: string;
    modifiedAt: string;
    eventTime: string;
    observedAt: string;
    evidence: TaskMapMeetingProducerEvidenceDraftV1[];
    secondaryVariants?: TaskMapMeetingProducerGranolaVariantDraftV1[];
}
export interface TaskMapMeetingProducerSnapshotDraftV1 {
    ownerScopeDigest: string;
    producerVersion?: typeof TASKMAP_MEETING_PRODUCER_VERSION;
    producedAt: string;
    meetings: TaskMapMeetingProducerMeetingDraftV1[];
}
export interface TaskMapMeetingProducerSourceVariantV1 {
    sourceVariantRefDigest: string;
    sourceKind: "gemini_meet" | "granola";
    role: "primary" | "secondary";
    bindingDigest: string;
    sourceObjectDigest: string;
    sourceRevisionDigest: string;
    contentDigest: string;
    sourceIdentityDigest: string;
    authority: Extract<TaskMapEvidenceAuthority, "provider_generated_summary" | "context_only">;
    modifiedAt: string;
    eventTime: string;
    observedAt: string;
}
export interface TaskMapMeetingProducerEvidenceV1 {
    evidenceId: string;
    evidenceDigest: string;
    canonicalMeetingId: string;
    kind: TaskMapMeetingProducerEvidenceKind;
    recordKind: "work_context";
    activity: "meeting_decision" | "meeting_action_item" | "meeting_commitment";
    occurredAt: string;
    observedAt: string;
    objectRefs: TaskMapMeetingProducerObjectRefV1[];
    title: string;
    summary: string;
    authority: Extract<TaskMapEvidenceAuthority, "context_only" | "provider_generated_summary" | "explicit_commitment">;
    quality: Extract<TaskMapEvidenceQuality, "source_native" | "structured_generated" | "provider_summary" | "degraded_summary" | "bounded_context">;
    coverage: TaskMapMeetingProducerCoverage;
    confidence: number;
    status: TaskMapMeetingProducerEvidenceStatus | null;
    deadline: string | null;
    proposalDisposition: "context_only" | "candidate_only";
    statementReferenceDigest: string | null;
    supportingSourceVariantRefDigests: string[];
    speechActClass?: MentionSpeechActClass;
    speechActActor?: MentionActor;
    mentionIdentityDigest?: string;
    extractionEnvelopeDigest?: string;
    promotionEligible?: boolean;
}
export interface TaskMapMeetingProducerMeetingV1 {
    canonicalMeetingId: string;
    primarySourceIdentityDigest: string;
    sourceVariants: TaskMapMeetingProducerSourceVariantV1[];
    evidence: TaskMapMeetingProducerEvidenceV1[];
}
export interface TaskMapMeetingProducerWatermarkV1 {
    kind: "revision_content";
    valueDigest: string;
    observedThrough: string;
}
export interface TaskMapMeetingProducerSnapshotV1 {
    contractVersion: typeof TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION;
    snapshotId: string;
    snapshotDigest: string;
    producerVersion: typeof TASKMAP_MEETING_PRODUCER_VERSION;
    ownerScopeDigest: string;
    producedAt: string;
    validThrough: string;
    maxAgeMs: typeof TASKMAP_MEETING_PRODUCER_MAX_AGE_MS;
    watermark: TaskMapMeetingProducerWatermarkV1;
    meetings: TaskMapMeetingProducerMeetingV1[];
    privacy: typeof PRIVACY;
}
export type TaskMapMeetingProducerFreshnessDecision = "fresh" | "boundary_due" | "stale" | "missing" | "unknown_version" | "malformed";
export interface TaskMapMeetingProducerFreshnessV1 {
    decision: TaskMapMeetingProducerFreshnessDecision;
    interval: "[producedAt,validThrough)";
    assessedAt: string;
    producedAt: string | null;
    validThrough: string | null;
    ageMs: number | null;
    maxAgeMs: typeof TASKMAP_MEETING_PRODUCER_MAX_AGE_MS;
    currentSemanticInputEligible: boolean;
}
export interface TaskMapMeetingProducerLastGoodRefV1 {
    snapshotId: string;
    snapshotDigest: string;
    producedAt: string;
    validThrough: string;
}
export interface TaskMapMeetingProducerRetainedLastGoodV1 extends TaskMapMeetingProducerLastGoodRefV1 {
    retainedBecause: Exclude<TaskMapMeetingProducerFreshnessDecision, "fresh">;
    eligibleForCurrentSemanticInput: false;
}
export interface TaskMapMeetingProducerResultV1 {
    contractVersion: typeof TASKMAP_MEETING_PRODUCER_RESULT_VERSION;
    resultId: string;
    resultDigest: string;
    producerVersion: typeof TASKMAP_MEETING_PRODUCER_VERSION;
    availability: "available" | "unavailable";
    freshness: TaskMapMeetingProducerFreshnessV1;
    reasonDetailDigest: string;
    snapshot: TaskMapMeetingProducerSnapshotV1 | null;
    retainedLastGood: TaskMapMeetingProducerRetainedLastGoodV1 | null;
    privacy: typeof PRIVACY;
}
export interface TaskMapMeetingProducerLoadInputV1 {
    snapshotPath: string;
    assessedAt: string;
    expectedOwnerScopeDigest?: string;
    retainedLastGood?: TaskMapMeetingProducerLastGoodRefV1;
}
export interface TaskMapMeetingObligationGateResultV1 {
    authority: Extract<TaskMapEvidenceAuthority, "context_only" | "provider_generated_summary" | "explicit_commitment">;
    proposalDisposition: "context_only" | "candidate_only";
    promotionEligible: boolean;
}
export declare function taskMapMeetingObligationGate(speechActClass: MentionSpeechActClass, speechActActor: MentionActor): TaskMapMeetingObligationGateResultV1;
export declare function taskMapMeetingStatementReferenceDigest(input: TaskMapMeetingStatementReferenceInputV1): string;
export declare function buildTaskMapMeetingProducerSnapshot(input: TaskMapMeetingProducerSnapshotDraftV1): TaskMapMeetingProducerSnapshotV1;
export declare function assertTaskMapMeetingProducerSnapshot(value: unknown): asserts value is TaskMapMeetingProducerSnapshotV1;
export declare function taskMapMeetingProducerLastGoodRef(snapshot: TaskMapMeetingProducerSnapshotV1): TaskMapMeetingProducerLastGoodRefV1;
export declare function assessTaskMapMeetingProducerSnapshot(value: unknown, assessedAtInput: string, retainedLastGood?: TaskMapMeetingProducerLastGoodRefV1): TaskMapMeetingProducerResultV1;
/**
 * Shared trusted owner-scope derivation for the producer and product loader.
 * Callers must supply an established owner ID; there is no implicit fallback.
 */
export declare function taskMapMeetingProducerOwnerScopeDigest(userId: string): string;
/**
 * Resolves the owner-local producer artifact. The loader still requires the
 * caller to pass this path explicitly, keeping path selection outside parsing.
 */
export declare function taskMapMeetingProducerSnapshotPath(homeDirectory: string): string;
/**
 * Authenticated local read only: no provider, connector, network, or write.
 * The returned result never includes the local path.
 */
export declare function loadTaskMapMeetingProducerResult(input: TaskMapMeetingProducerLoadInputV1): Promise<TaskMapMeetingProducerResultV1>;
export declare function assertTaskMapMeetingProducerResult(value: unknown): asserts value is TaskMapMeetingProducerResultV1;
export {};
