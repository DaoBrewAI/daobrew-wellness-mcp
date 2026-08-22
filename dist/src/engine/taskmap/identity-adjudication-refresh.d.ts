import type { EmbeddingProvider } from "../embeddings/provider.js";
import { type TaskMapIdentityAdjudicationCandidateV1, type TaskMapIdentityAdjudicationProposalV1, type TaskMapIdentityAdjudicationResultV1 } from "./identity-adjudication-proposal.js";
import { type LlmStation } from "./llm-station.js";
import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION: "taskmap-identity-adjudication-refresh.v1";
export declare const TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET = 32;
export type TaskMapIdentityAdjudicationRefreshState = "current" | "deferred" | "unavailable";
export type TaskMapIdentityAdjudicationRefreshDegradationCode = "embedding_provider_failed" | "llm_station_unavailable" | null;
export interface TaskMapIdentityAdjudicationRefreshArtifactV1 {
    contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION;
    ownerScopeDigest: string;
    inputDigest: string;
    state: TaskMapIdentityAdjudicationRefreshState;
    pendingCount: number;
    degradationCode: TaskMapIdentityAdjudicationRefreshDegradationCode;
    proposal: TaskMapIdentityAdjudicationProposalV1;
    result: TaskMapIdentityAdjudicationResultV1;
    artifactDigest: string;
}
export interface RefreshTaskMapIdentityAdjudicationInputV1 {
    taskMapRoot: string;
    ownerScopeDigest: string;
    inputDigest: string;
    candidates: readonly TaskMapIdentityAdjudicationCandidateV1[];
    embeddingProvider: EmbeddingProvider;
    embeddingModelId: string;
    createStation?: () => Promise<LlmStation>;
}
export declare function taskMapIdentityCandidatesFromProjection(projection: Pick<TaskMapProjectionV1, "tasks">): TaskMapIdentityAdjudicationCandidateV1[];
export declare function taskMapIdentityAdjudicationRefreshPath(taskMapRoot: string, inputDigest: string): string;
export declare function loadTaskMapIdentityAdjudicationRefreshArtifact(taskMapRoot: string, ownerScopeDigest: string, inputDigest: string): Promise<TaskMapIdentityAdjudicationRefreshArtifactV1 | null>;
export declare function refreshTaskMapIdentityAdjudication(input: RefreshTaskMapIdentityAdjudicationInputV1): Promise<TaskMapIdentityAdjudicationRefreshArtifactV1>;
