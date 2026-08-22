import type { EmbeddingProvider } from "../embeddings/provider.js";
import { type LlmProviderId, type LlmStation, type LlmStationRunner } from "./llm-station.js";
export declare const TASKMAP_IDENTITY_ADJUDICATION_VERSION: "taskmap-identity-adjudication.v1";
export declare const TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION: "taskmap-identity-adjudication-result.v1";
export declare const TASKMAP_IDENTITY_ADJUDICATION_STATION_ID: "identity-adjudication-v1";
export declare const TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1: Readonly<{
    maxCandidates: 512;
    maxPairs: 2048;
    maxTextCharacters: 512;
}>;
export declare const TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1: Readonly<{
    maxEvidenceItems: 512;
    maxPromptCharacters: 1048576;
    maxVerdicts: 2048;
    maxOutputBytes: 1048576;
}>;
export declare const TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1: Readonly<{
    blockThreshold: 0.82;
    autoBand: 0.95;
    embeddingDimensions: 768;
    similarity: "cosine_dot_product_l2_normalized";
}>;
export interface TaskMapIdentityAdjudicationCandidateV1 {
    candidateId: string;
    rootId: string;
    text: string;
}
export type TaskMapIdentityAdjudicationConfidenceV1 = "high" | "ambiguous";
export interface TaskMapIdentityAdjudicationPairV1 {
    pairId: string;
    leftCandidateId: string;
    rightCandidateId: string;
    rootId: string;
    similarity: number;
    confidence: TaskMapIdentityAdjudicationConfidenceV1;
}
export interface TaskMapIdentityAdjudicationCrossRootFlagV1 {
    pairId: string;
    leftCandidateId: string;
    rightCandidateId: string;
    leftRootId: string;
    rightRootId: string;
    similarity: number;
    confidence: TaskMapIdentityAdjudicationConfidenceV1;
}
export interface TaskMapIdentityEvidenceDigestV1 {
    candidateId: string;
    rootId: string;
    textDigest: string;
}
export interface TaskMapIdentityAdjudicationProposalV1 {
    contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_VERSION;
    inputDigest: string;
    embeddingModelId: string;
    evidenceManifest: TaskMapIdentityEvidenceDigestV1[];
    policy: typeof TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1;
    blockingState: "current" | "unavailable";
    unavailableReason: "embedding_provider_failed" | null;
    candidateCount: number;
    pairs: TaskMapIdentityAdjudicationPairV1[];
    crossRootFlagged: TaskMapIdentityAdjudicationCrossRootFlagV1[];
    authority: {
        mergeApplied: false;
        aliasesWritten: false;
        requiresOwnerAcceptance: true;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
    };
    artifactDigest: string;
}
export interface BuildTaskMapIdentityAdjudicationProposalsInputV1 {
    candidates: readonly TaskMapIdentityAdjudicationCandidateV1[];
    embeddingProvider: EmbeddingProvider;
    embeddingModelId: string;
    inputDigest: string;
}
export type TaskMapIdentityAdjudicationVerdictV1 = "same_work" | "different_work";
export interface TaskMapIdentityAdjudicationEvidenceV1 {
    candidateId: string;
    text: string;
}
export interface TaskMapIdentityAdjudicatedPairV1 extends TaskMapIdentityAdjudicationPairV1 {
    adjudication: TaskMapIdentityAdjudicationVerdictV1 | "deferred";
    adjudicationSource: "embedding_high_confidence" | "llm_identity_adjudication" | "deferred";
    deferredReason: "llm_station_unavailable" | null;
}
export interface TaskMapIdentityAdjudicationVerdictRecordV1 {
    pairId: string;
    verdict: TaskMapIdentityAdjudicationVerdictV1 | "deferred";
    source: TaskMapIdentityAdjudicatedPairV1["adjudicationSource"];
}
export interface TaskMapIdentityAdjudicationResultV1 {
    contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION;
    inputDigest: string;
    proposalArtifactDigest: string;
    embedding: {
        modelId: string;
        dimensions: number;
        similarity: typeof TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity;
        blockThreshold: number;
        autoBand: number;
    };
    llm: {
        invocationState: "invoked" | "not_invoked" | "unavailable";
        stationId: typeof TASKMAP_IDENTITY_ADJUDICATION_STATION_ID;
        modelId: string | null;
        transport: LlmProviderId | "injected-offline" | null;
        promptDigest: string | null;
    };
    pairs: TaskMapIdentityAdjudicatedPairV1[];
    verdicts: TaskMapIdentityAdjudicationVerdictRecordV1[];
    mergeCandidates: TaskMapIdentityAdjudicatedPairV1[];
    authority: {
        mergeApplied: false;
        aliasesWritten: false;
        requiresOwnerAcceptance: true;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
    };
    artifactDigest: string;
}
interface AdjudicateTaskMapIdentityPairsInputBaseV1 {
    proposals: TaskMapIdentityAdjudicationProposalV1;
    candidateEvidence?: readonly TaskMapIdentityAdjudicationEvidenceV1[];
}
export type AdjudicateTaskMapIdentityPairsInputV1 = AdjudicateTaskMapIdentityPairsInputBaseV1 & ({
    station: LlmStation;
    runner?: never;
    llmModelId?: never;
} | {
    station?: never;
    /** Deterministic recorded-output seam for offline tests and replay only. */
    runner: LlmStationRunner;
    /** Exact recorded/offline model identity; never inferred by the runner seam. */
    llmModelId: string;
});
export declare function buildTaskMapIdentityAdjudicationProposals(input: BuildTaskMapIdentityAdjudicationProposalsInputV1): Promise<TaskMapIdentityAdjudicationProposalV1>;
/**
 * Produces owner-gated identity proposals. Raw candidate evidence is used only
 * to construct the deterministic prompt and is never copied into the artifact.
 */
export declare function adjudicateTaskMapIdentityPairs(input: AdjudicateTaskMapIdentityPairsInputV1): Promise<TaskMapIdentityAdjudicationResultV1>;
export {};
