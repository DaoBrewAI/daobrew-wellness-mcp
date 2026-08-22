import { type TaskMapSemanticBrainArtifactV1 } from "./source-contracts.js";
import { type TaskMapWorkControlDecisionV1 } from "./work-control-decision.js";
import { type TaskMapInput, type TaskMapProjectionV1, type TaskMapSourceSnapshotV1 } from "./types.js";
export declare const TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION: "taskmap-candidate-evidence-bridge.v1";
export declare const TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION: "taskmap-candidate-review-companion.v1";
export declare const TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION: "taskmap-candidate-review-policy.1";
export declare const TASKMAP_CANDIDATE_REVIEW_LIMITS_V1: Readonly<{
    maxCanonicalInputBytes: number;
    maxCanonicalArtifactBytes: number;
    maxNodes: 120000;
    maxDescriptors: 120000;
    maxDepth: 32;
    maxObjectKeys: 128;
    maxArrayLength: 8192;
    maxStringLength: 4096;
    maxBrainRoots: 2048;
    maxBrainTasks: 4096;
    maxBrainEdges: 8192;
    maxEvidence: 8192;
}>;
declare const CANDIDATE_REASON_CODES: readonly ["attested_candidate_only", "owner_review_required"];
export interface TaskMapCandidateEvidenceTokenMappingV1 {
    eventToken: string;
    envelopeToken: string;
}
export interface TaskMapCandidateEvidenceBridgePrivacyV1 {
    rawEventIdentifiersStored: false;
    rawEnvelopeIdentifiersStored: false;
    rawProposalIdentifiersStored: false;
    sourceBodiesStored: false;
    rawBiometricsStored: false;
    sourceObjectIdentifiersStored: false;
    sourceRevisionsStored: false;
    candidateTextStored: false;
    localPathsStored: false;
    secretsStored: false;
}
export interface TaskMapCandidateEvidenceBridgeV1 {
    contractVersion: typeof TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION;
    bridgeId: string;
    bridgeDigest: string;
    attestationKeyId: string;
    attestationMac: string;
    ownerScopeDigest: string;
    sourceSemanticInputDigest: string;
    brainInputDigest: string;
    brainOutputDigest: string;
    semanticBrainDigest: string;
    evidenceCount: number;
    evidenceMappings: TaskMapCandidateEvidenceTokenMappingV1[];
    privacy: TaskMapCandidateEvidenceBridgePrivacyV1;
}
export interface TaskMapCandidateEvidenceReviewMappingDraftV1 {
    eventId: string;
    sourceEnvelopeId: string;
}
export interface BuildTaskMapCandidateEvidenceBridgeInput {
    taskMapInput: TaskMapInput;
    sourceSnapshot: TaskMapSourceSnapshotV1;
    semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
    semanticBrainAttestationKey: string;
    bridgeAttestationKey: string;
    reviewedMappings: TaskMapCandidateEvidenceReviewMappingDraftV1[];
}
export declare function buildTaskMapCandidateEvidenceBridge(input: BuildTaskMapCandidateEvidenceBridgeInput): TaskMapCandidateEvidenceBridgeV1;
export declare function assertTaskMapCandidateEvidenceBridge(value: TaskMapCandidateEvidenceBridgeV1, bridgeAttestationKey: string): TaskMapCandidateEvidenceBridgeV1;
export interface TaskMapCandidateReviewRowV1 {
    candidateId: string;
    candidateGroupId: string;
    evidenceIds: string[];
    evidenceCount: number;
    evidenceComplete: true;
    reasonCodes: Array<(typeof CANDIDATE_REASON_CODES)[number]>;
}
export interface TaskMapCandidateReviewPrivacyV1 {
    candidateTextStored: false;
    rawProposalIdentifiersStored: false;
    rawEventIdentifiersStored: false;
    rawEnvelopeIdentifiersStored: false;
    sourceBodiesStored: false;
    rawBiometricsStored: false;
    rawOwnerIdentifiersStored: false;
    sourceObjectIdentifiersStored: false;
    sourceRevisionsStored: false;
    routesStored: false;
    lifecycleAuthorityStored: false;
    rankStored: false;
    executionStateStored: false;
    localPathsStored: false;
    secretsStored: false;
}
export type TaskMapCandidateReviewCoverage = "unavailable_missing_companion" | "available_attested_candidate_only";
export interface TaskMapCandidateReviewCompanionV1 {
    contractVersion: typeof TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION;
    artifactId: string;
    artifactDigest: string;
    originDigest: string;
    policyVersion: typeof TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION;
    attestationKeyId: string | null;
    attestationMac: string | null;
    taskMapInputDigest: string;
    workControlArtifactDigest: string;
    workControlOriginDigest: string;
    projectionInputDigest: string;
    sourceSnapshotDigest: string;
    sourceSemanticInputDigest: string;
    bridgeDigest: string | null;
    semanticBrainDigest: string | null;
    candidateCoverage: TaskMapCandidateReviewCoverage;
    reviewNext: TaskMapCandidateReviewRowV1[];
    privacy: TaskMapCandidateReviewPrivacyV1;
}
export interface TaskMapCandidateReviewAttestedCompanionInput {
    sourceSnapshot: TaskMapSourceSnapshotV1;
    semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
    semanticBrainAttestationKey: string;
    evidenceBridge: TaskMapCandidateEvidenceBridgeV1;
    bridgeAttestationKey: string;
}
export interface BuildTaskMapCandidateReviewCompanionInput {
    currentRoot: string;
    runRoot: string;
    sidecarRoot: string;
    projection: TaskMapProjectionV1;
    taskMapInput: TaskMapInput;
    workControlDecision: TaskMapWorkControlDecisionV1;
    companion?: TaskMapCandidateReviewAttestedCompanionInput;
}
export interface BuiltTaskMapCandidateReviewCompanion {
    artifact: TaskMapCandidateReviewCompanionV1;
    canonicalBytes: string;
}
export declare function assertTaskMapCandidateReviewCompanion(value: TaskMapCandidateReviewCompanionV1, artifactAttestationKey?: string): TaskMapCandidateReviewCompanionV1;
export declare function taskMapCandidateReviewCompanionCanonicalBytes(value: TaskMapCandidateReviewCompanionV1, artifactAttestationKey?: string): string;
export declare function buildTaskMapCandidateReviewCompanion(input: BuildTaskMapCandidateReviewCompanionInput): Promise<BuiltTaskMapCandidateReviewCompanion>;
/**
 * TEST-ONLY deterministic seam. Product authority still comes from the real
 * store-backed P10.3a builder; the hook can only exercise runtime-integrity
 * failure between starting and accepting that authenticated read.
 */
export declare function unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest(input: BuildTaskMapCandidateReviewCompanionInput, afterWorkControlStarted: () => void | Promise<void>): Promise<BuiltTaskMapCandidateReviewCompanion>;
export {};
