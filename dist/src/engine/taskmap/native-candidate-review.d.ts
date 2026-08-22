import { type TaskMapMeetingProducerResultV1 } from "./meeting-producer-freshness.js";
import type { MentionActor, MentionSpeechActClass } from "./mention-extraction.js";
import { type TaskMapNativeCandidateHierarchyV1 } from "./native-candidate-hierarchy.js";
export declare const TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION: "taskmap-native-candidate-review.v1";
export declare const TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION: "taskmap-native-candidate-review-policy.1";
export declare const TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION: "taskmap-native-candidate-shelf.v1";
export declare const TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2: "taskmap-native-candidate-shelf.v2";
export declare const TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3: "taskmap-native-candidate-shelf.v3";
export declare const TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1: Readonly<{
    readonly maxCandidates: 128;
    readonly maxEvidenceProofsPerCandidate: 128;
    readonly maxFileBytes: number;
    readonly maxTitleCharacters: 96;
    readonly maxSummaryCharacters: 200;
}>;
export declare const TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN: "taskmap-agent-session-candidate-statement.3";
export declare const TASKMAP_CALENDAR_CANDIDATE_STATEMENT_DOMAIN: "taskmap-calendar-candidate-statement.1";
export type TaskMapNativeCandidateReviewAction = "accept_for_review" | "dismiss" | "defer";
export interface TaskMapNativeCandidateReviewDecisionV1 {
    decisionId: string;
    action: TaskMapNativeCandidateReviewAction;
    idempotencyKeyDigest: string;
    reviewedCandidateRevisionDigest: string;
    decidedAt: string;
    reviewedOnly: true;
    acceptedWork: false;
}
export interface TaskMapNativeCandidateReviewRowV1 {
    candidateId: string;
    statementReferenceDigest: string;
    candidateRevisionDigest: string;
    evidenceProofDigests: string[];
    review: TaskMapNativeCandidateReviewDecisionV1 | null;
}
export interface TaskMapNativeCandidateReviewPrivacyV1 {
    displayTextStored: false;
    sourceTitlesStored: false;
    sourceSummariesStored: false;
    sourceBodiesStored: false;
    participantDetailsStored: false;
    rawUrlsStored: false;
    credentialsStored: false;
    localPathsStored: false;
    acceptedProjectionStored: false;
    acceptedWorkStored: false;
    rankRouteProveRunStateStored: false;
}
/**
 * Durable M2C state. It intentionally contains no display strings, raw source
 * identifiers, source revisions, routes, accepted work, or execution state.
 */
export interface TaskMapNativeCandidateReviewV1 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_REVIEW_VERSION;
    policyVersion: typeof TASKMAP_NATIVE_CANDIDATE_REVIEW_POLICY_VERSION;
    overlayId: string;
    overlayDigest: string;
    ownerScopeDigest: string;
    producerResultDigest: string;
    producerSnapshotDigest: string;
    producedAt: string;
    candidates: TaskMapNativeCandidateReviewRowV1[];
    privacy: TaskMapNativeCandidateReviewPrivacyV1;
}
export interface BuildTaskMapNativeCandidateReviewInputV1 {
    result: TaskMapMeetingProducerResultV1;
    previous: TaskMapNativeCandidateReviewV1 | null;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
}
export interface ReduceTaskMapNativeCandidateReviewInputV1 {
    result: TaskMapMeetingProducerResultV1;
    overlay: TaskMapNativeCandidateReviewV1;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    action: TaskMapNativeCandidateReviewAction;
    idempotencyKeyDigest: string;
    decidedAt: string;
}
export interface TaskMapNativeCandidateShelfRowV1 {
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    kind: "decision" | "action_item" | "commitment";
    title: string;
    summary: string;
    speechActClass?: MentionSpeechActClass;
    speechActActor?: MentionActor;
    mentionIdentityDigest?: string;
    confidence: number;
    promotionEligible: boolean;
    sourceKinds: Array<"gemini_meet" | "granola">;
    occurredAt: string;
    observedAt: string;
    reviewState: "unreviewed" | TaskMapNativeCandidateReviewAction;
    reviewedAt: string | null;
    reviewedOnly: boolean;
    acceptedWork: false;
    rankEligible: false;
    routeEligible: false;
    proveEligible: false;
    runEligible: false;
}
export interface TaskMapNativeCandidateShelfV1 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION;
    ownerScopeDigest: string;
    producerResultDigest: string;
    producerSnapshotDigest: string;
    assessedAt: string;
    candidates: TaskMapNativeCandidateShelfRowV1[];
    displayTextPersistence: "memory_only";
}
export type TaskMapNativeCandidateAgentSourceKindV2 = "claude_session" | "codex_session";
export type TaskMapNativeCandidateMeetingShelfRowV2 = TaskMapNativeCandidateShelfRowV1 & {
    candidateFamily: "meeting";
};
export interface TaskMapNativeCandidateAgentShelfRowV2 {
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    candidateFamily: "agent_session";
    kind: "action_item" | "commitment" | "decision";
    title: string;
    summary: string;
    speechActClass: MentionSpeechActClass;
    speechActActor: MentionActor;
    confidence: number;
    mentionIdentityDigest: string;
    sourceKinds: TaskMapNativeCandidateAgentSourceKindV2[];
    originIdentityDigest: string;
    supportSetRevisionDigest: string;
    workstreamIdentityDigest: string;
    proposalDisposition: "candidate_only" | "context_only";
    occurredAt: string;
    observedAt: string;
    reviewState: "unreviewed" | TaskMapNativeCandidateReviewAction;
    reviewedAt: string | null;
    reviewedOnly: boolean;
    promotionEligible: boolean;
    acceptedWork: false;
    sourceWritebackEligible: false;
    rankEligible: false;
    routeEligible: false;
    proveEligible: false;
    runEligible: false;
}
export type TaskMapNativeCandidateCalendarSourceKindV2 = "calendar";
export interface TaskMapNativeCandidateCalendarShelfRowV2 {
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    candidateFamily: "calendar";
    kind: "action_item" | "commitment" | "decision";
    title: string;
    summary: string;
    speechActClass: MentionSpeechActClass;
    speechActActor: MentionActor;
    confidence: number;
    mentionIdentityDigest: string;
    sourceKinds: [TaskMapNativeCandidateCalendarSourceKindV2];
    originIdentityDigest: string;
    supportSetRevisionDigest: string;
    proposalDisposition: "candidate_only" | "context_only";
    occurredAt: string;
    observedAt: string;
    reviewState: "unreviewed" | TaskMapNativeCandidateReviewAction;
    reviewedAt: string | null;
    reviewedOnly: boolean;
    promotionEligible: boolean;
    acceptedWork: false;
    sourceWritebackEligible: false;
    rankEligible: false;
    routeEligible: false;
    proveEligible: false;
    runEligible: false;
}
/** Receipt-backed display row retained after its source window rotates. */
export interface TaskMapNativeCandidateAcceptedPendingShelfRowV2 {
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    candidateFamily: "accepted_pending";
    kind: "action_item" | "commitment" | "decision";
    title: string;
    summary: string;
    speechActClass: MentionSpeechActClass;
    speechActActor: MentionActor;
    confidence: number;
    mentionIdentityDigest: string;
    sourceKinds: ["accepted_pending"];
    occurredAt: string;
    observedAt: string;
    reviewState: "unreviewed";
    reviewedAt: null;
    reviewedOnly: false;
    promotionEligible: false;
    acceptedWork: false;
    sourceWritebackEligible: false;
    rankEligible: false;
    routeEligible: false;
    proveEligible: false;
    runEligible: false;
}
export type TaskMapNativeCandidateShelfRowV2 = TaskMapNativeCandidateMeetingShelfRowV2 | TaskMapNativeCandidateAgentShelfRowV2 | TaskMapNativeCandidateCalendarShelfRowV2 | TaskMapNativeCandidateAcceptedPendingShelfRowV2;
/** Ephemeral display-only union. Durable overlays and receipts remain v1. */
export interface TaskMapNativeCandidateShelfV2 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2;
    ownerScopeDigest: string;
    producerResultDigest: string;
    producerSnapshotDigest: string;
    assessedAt: string;
    candidates: TaskMapNativeCandidateShelfRowV2[];
    displayTextPersistence: "memory_only";
}
/** Ephemeral v3 display union with engine-authored cross-context hierarchy. */
export interface TaskMapNativeCandidateShelfV3 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3;
    ownerScopeDigest: string;
    producerResultDigest: string;
    producerSnapshotDigest: string;
    assessedAt: string;
    candidates: TaskMapNativeCandidateShelfRowV2[];
    durableConfirmedCandidateIds: string[];
    hierarchy: TaskMapNativeCandidateHierarchyV1;
    displayTextPersistence: "memory_only";
}
export declare function upgradeTaskMapNativeCandidateShelfV1(shelf: TaskMapNativeCandidateShelfV1): TaskMapNativeCandidateShelfV2;
export interface LoadTaskMapNativeCandidateReviewInputV1 {
    overlayPath: string;
    expectedOwnerScopeDigest: string;
}
export interface WriteTaskMapNativeCandidateReviewInputV1 {
    overlayPath: string;
    expectedOwnerScopeDigest: string;
    overlay: TaskMapNativeCandidateReviewV1;
}
export interface TaskMapNativeCandidateReviewTransactionInputV1 {
    overlayPath: string;
    expectedOwnerScopeDigest: string;
}
export interface TaskMapNativeCandidateProofRowsContextV1 {
    ownerScopeDigest: string;
    producerResultDigest: string;
    producerSnapshotDigest: string;
    producedAt: string;
    assessedAt: string;
    candidates: readonly TaskMapNativeCandidateShelfRowV1[];
}
/** Resolve one candidate solely from the authenticated current producer shelf. */
export interface ResolveTaskMapNativeCandidateProofInputV1 {
    result: TaskMapMeetingProducerResultV1;
    overlay: TaskMapNativeCandidateReviewV1;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
    candidateId: string;
}
export declare function taskMapAgentSessionCandidateStatementReferenceDigest(ownerScopeDigest: string, originIdentityDigest: string, mentionIdentityDigest: string): string;
export declare function taskMapCalendarCandidateStatementReferenceDigest(ownerScopeDigest: string, mentionIdentityDigest: string): string;
export declare function taskMapNativeCandidateId(ownerScopeDigest: string, statementReferenceDigest: string): string;
export declare function taskMapNativeCandidateRevisionDigest(candidate: string, evidenceProofDigests: readonly string[]): string;
/**
 * Reconciles review-only state for proof rows already derived by an
 * authenticated source adapter. It persists no display data and grants no
 * accepted-work authority.
 */
export declare function buildTaskMapNativeCandidateReviewFromProofRows(input: {
    context: TaskMapNativeCandidateProofRowsContextV1;
    previous: TaskMapNativeCandidateReviewV1 | null;
}): TaskMapNativeCandidateReviewV1;
export declare function reduceTaskMapNativeCandidateReviewFromProofRows(input: {
    context: TaskMapNativeCandidateProofRowsContextV1;
    overlay: TaskMapNativeCandidateReviewV1;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    action: TaskMapNativeCandidateReviewAction;
    idempotencyKeyDigest: string;
    decidedAt: string;
}): TaskMapNativeCandidateReviewV1;
export declare function applyTaskMapNativeCandidateReviewToProofRows(input: {
    context: TaskMapNativeCandidateProofRowsContextV1;
    overlay: TaskMapNativeCandidateReviewV1;
}): TaskMapNativeCandidateShelfRowV1[];
export declare function buildTaskMapNativeCandidateReview(input: BuildTaskMapNativeCandidateReviewInputV1): TaskMapNativeCandidateReviewV1;
export declare function reduceTaskMapNativeCandidateReview(input: ReduceTaskMapNativeCandidateReviewInputV1): TaskMapNativeCandidateReviewV1;
/**
 * Owner-display view only. Titles and summaries are joined from the currently
 * authenticated fresh producer result and are never accepted by load/write.
 */
export declare function buildTaskMapNativeCandidateShelf(result: TaskMapMeetingProducerResultV1, overlay: TaskMapNativeCandidateReviewV1, assessedAtInput: string): TaskMapNativeCandidateShelfV1;
/**
 * Resolve one exact current proof from the authenticated shelf. The review
 * overlay is read-only and remains byte-for-byte unchanged. Task 6 accepts
 * only the Google producer result authenticated by the existing overlay;
 * other producer unions require Task 7's extraction-report validator.
 */
export declare function resolveTaskMapNativeCandidateProof(input: ResolveTaskMapNativeCandidateProofInputV1): TaskMapNativeCandidateShelfRowV1;
/** Strict validator for the ephemeral v2 meeting/agent display union. */
export declare function assertTaskMapNativeCandidateShelfV2(value: unknown): asserts value is TaskMapNativeCandidateShelfV2;
export declare function assertTaskMapNativeCandidateShelfV3(value: unknown): asserts value is TaskMapNativeCandidateShelfV3;
export declare function assertTaskMapNativeCandidateReview(value: unknown): asserts value is TaskMapNativeCandidateReviewV1;
export declare function taskMapNativeCandidateReviewCanonicalBytes(value: TaskMapNativeCandidateReviewV1): string;
/**
 * Serializes the complete owner-local overlay read/build/reduce/write
 * transaction across CLI processes. A canonical receipt is fully staged
 * before its no-replace hardlink becomes the lock. Dead owners are reclaimed
 * only after receipt, inode, peer, mode, and process-identity verification.
 */
export declare function withTaskMapNativeCandidateReviewTransaction<T>(input: TaskMapNativeCandidateReviewTransactionInputV1, operation: () => Promise<T>): Promise<T>;
export declare function loadTaskMapNativeCandidateReview(input: LoadTaskMapNativeCandidateReviewInputV1): Promise<TaskMapNativeCandidateReviewV1 | null>;
export declare function writeTaskMapNativeCandidateReview(input: WriteTaskMapNativeCandidateReviewInputV1): Promise<void>;
