import type { TaskMapAgentSessionSemanticAdmissionV2 } from "./agent-session-semantic-admission.js";
import type { TaskMapAgentSessionExtractionReportV1 } from "./agent-session-refresh-llm-replay.js";
import type { TaskMapCalendarProducerResultV1 } from "./calendar-producer-freshness.js";
import type { TaskMapCalendarExtractionReportV1 } from "./calendar-refresh-llm-replay.js";
import { type TaskMapNativeCandidateReviewV1, type TaskMapNativeCandidateShelfRowV1 } from "./native-candidate-review.js";
import { type VerifiedTaskMapGranolaExtractionReportV1 } from "./meeting-refresh-llm-replay.js";
import type { TaskMapMeetingProducerResultV1 } from "./meeting-producer-freshness.js";
import type { TaskMapNativeSemanticBuilderInputV1, TaskMapNativeSemanticEvidenceBindingV1, TaskMapNativeSemanticSourceBindingV1 } from "./native-semantic-builder-adapter.js";
import { type TaskMapEvent, type TaskMapSourcePointer } from "./types.js";
export declare const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION: "taskmap-native-candidate-acceptance.v1";
export declare const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION: "taskmap-native-candidate-acceptance-policy.1";
export declare const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1: Readonly<{
    readonly maxReceipts: 128;
    readonly maxEvidenceProofsPerReceipt: 128;
    readonly maxFileBytes: number;
    readonly maxTitleCharacters: 96;
    readonly maxSummaryCharacters: 200;
}>;
declare const PRIVACY: Readonly<{
    boundedAcceptedDisplayTextStored: true;
    sourceBodiesStored: false;
    participantDetailsStored: false;
    rawUrlsStored: false;
    credentialsStored: false;
    localPathsStored: false;
    callerDisplayTextStored: false;
    sourceWritebackPerformed: false;
}>;
export interface TaskMapNativeCandidateAcceptedPayloadV1 {
    kind: "decision" | "action_item" | "commitment";
    title: string;
    summary: string;
    speechActClass: "request" | "commitment" | "decision" | "other";
    speechActActor: "self" | "other" | "unknown";
    mentionIdentityDigest: string;
    confidence: number;
    occurredAt: string;
    observedAt: string;
}
export interface TaskMapNativeCandidatePromotionReceiptV1 {
    promotionId: string;
    promotionDigest: string;
    previousReceiptDigest: string | null;
    ownerScopeDigest: string;
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    idempotencyKeyDigest: string;
    confirmedAt: string;
    accepted: TaskMapNativeCandidateAcceptedPayloadV1;
    authority: {
        sourceKind: "manual";
        authority: "user";
        syncMode: "personal_fork";
        capabilities: readonly ["read_task"];
        recordKind: "authoritative_task";
        lifecycle: "explicit_user_policy";
        sourceStatus: "open";
    };
    sourceWritebackAttempted: false;
}
export interface TaskMapNativeCandidateAcceptanceStoreV1 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION;
    policyVersion: typeof TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION;
    ownerScopeDigest: string;
    headReceiptDigest: string;
    receipts: TaskMapNativeCandidatePromotionReceiptV1[];
    privacy: typeof PRIVACY;
}
export interface PromoteTaskMapNativeCandidateInputV1 {
    result: TaskMapMeetingProducerResultV1 | null;
    overlay: TaskMapNativeCandidateReviewV1 | null;
    previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    expectedStatementReferenceDigest: string;
    expectedEvidenceProofDigests: readonly string[];
    idempotencyKeyDigest: string;
    confirmedAt: string;
}
export interface TaskMapNativeCandidatePromotionResultV1 {
    store: TaskMapNativeCandidateAcceptanceStoreV1;
    receipt: TaskMapNativeCandidatePromotionReceiptV1;
}
export interface PromoteTaskMapVerifiedMeetingCandidateInputV1 {
    result: TaskMapMeetingProducerResultV1 | null;
    overlay: TaskMapNativeCandidateReviewV1 | null;
    rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
    previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    expectedStatementReferenceDigest: string;
    expectedEvidenceProofDigests: readonly string[];
    idempotencyKeyDigest: string;
    confirmedAt: string;
}
export interface PromoteTaskMapAgentSessionCandidateInputV2 {
    admission: TaskMapAgentSessionSemanticAdmissionV2;
    extraction: TaskMapAgentSessionExtractionReportV1;
    overlay: TaskMapNativeCandidateReviewV1 | null;
    previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
    expectedOwnerScopeDigest: string;
    expectedAcceptanceHeadDigest: string;
    assessedAt: string;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    expectedStatementReferenceDigest: string;
    expectedEvidenceProofDigests: readonly string[];
    idempotencyKeyDigest: string;
    confirmedAt: string;
}
export interface PromoteTaskMapCalendarCandidateInputV1 {
    result: TaskMapCalendarProducerResultV1;
    extraction: TaskMapCalendarExtractionReportV1;
    overlay: TaskMapNativeCandidateReviewV1 | null;
    previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
    expectedOwnerScopeDigest: string;
    expectedAcceptanceHeadDigest: string;
    assessedAt: string;
    candidateId: string;
    expectedCandidateRevisionDigest: string;
    expectedStatementReferenceDigest: string;
    expectedEvidenceProofDigests: readonly string[];
    idempotencyKeyDigest: string;
    confirmedAt: string;
}
export interface LoadTaskMapNativeCandidateAcceptanceStoreInputV1 {
    storePath: string;
    expectedOwnerScopeDigest: string;
    afterAuthenticatedReadForTesting?: (storePath: string) => void | Promise<void>;
}
export interface WriteTaskMapNativeCandidateAcceptanceStoreInputV1 {
    storePath: string;
    expectedOwnerScopeDigest: string;
    store: TaskMapNativeCandidateAcceptanceStoreV1;
}
export declare function assertTaskMapNativeCandidateAcceptanceStore(value: unknown): asserts value is TaskMapNativeCandidateAcceptanceStoreV1;
export declare function promoteTaskMapNativeCandidate(input: PromoteTaskMapNativeCandidateInputV1): TaskMapNativeCandidatePromotionResultV1;
/**
 * Re-resolves one ephemeral v2 agent proposal and appends the existing
 * byte-compatible v1 owner receipt. This grants only local manual-task
 * authority; it does not approve, export, route, select, or start an agent.
 */
export declare function promoteTaskMapAgentSessionCandidate(input: PromoteTaskMapAgentSessionCandidateInputV2): TaskMapNativeCandidatePromotionResultV1;
/** Re-resolves one calendar proposal before granting local manual authority. */
export declare function promoteTaskMapCalendarCandidate(input: PromoteTaskMapCalendarCandidateInputV1): TaskMapNativeCandidatePromotionResultV1;
/**
 * Task 7 promotion resolver. Raw evidence can enter only through the
 * process-local verified-report capability; candidate proof is always
 * recomputed and never supplied by the caller.
 */
export declare function promoteTaskMapVerifiedMeetingCandidate(input: PromoteTaskMapVerifiedMeetingCandidateInputV1): TaskMapNativeCandidatePromotionResultV1;
export declare function taskMapNativeCandidateAcceptanceHeadDigest(store: TaskMapNativeCandidateAcceptanceStoreV1 | null): string;
/** Presentation-only omission behind the authenticated receipt-store gate. */
export declare function filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(rows: readonly TaskMapNativeCandidateShelfRowV1[], store: TaskMapNativeCandidateAcceptanceStoreV1 | null, expectedOwnerScopeDigest: string, publishedPromotionIds?: ReadonlySet<string>): TaskMapNativeCandidateShelfRowV1[];
export interface TaskMapNativeCandidateAcceptanceManualRecordsV1 {
    ownerScopeDigest: string;
    generatedAt: string;
    pointers: TaskMapSourcePointer[];
    events: TaskMapEvent[];
    sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
    evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
}
export declare function taskMapNativeCandidateAcceptanceManualAuthorityRecords(store: TaskMapNativeCandidateAcceptanceStoreV1): TaskMapNativeCandidateAcceptanceManualRecordsV1;
/**
 * The sole Task 6 authority merge. Manual records are rehydrated internally
 * from a fully validated receipt store; callers cannot supply raw authority.
 */
export declare function mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(base: TaskMapNativeSemanticBuilderInputV1, store: TaskMapNativeCandidateAcceptanceStoreV1): TaskMapNativeSemanticBuilderInputV1;
export declare function loadTaskMapNativeCandidateAcceptanceStore(input: LoadTaskMapNativeCandidateAcceptanceStoreInputV1): Promise<TaskMapNativeCandidateAcceptanceStoreV1 | null>;
export declare function writeTaskMapNativeCandidateAcceptanceStore(input: WriteTaskMapNativeCandidateAcceptanceStoreInputV1): Promise<void>;
export {};
