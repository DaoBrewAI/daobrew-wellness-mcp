import type { TaskMapDecompositionRefreshArtifactV1 } from "./decomposition-refresh.js";
import type { TaskMapIdentityAdjudicationRefreshArtifactV1 } from "./identity-adjudication-refresh.js";
import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_LLM_PROPOSAL_SURFACE_VERSION: "taskmap-llm-proposal-surface.v1";
export declare const TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME: "taskmap-llm-proposal-surface.v1.json";
type SurfaceState = "current" | "deferred" | "unavailable";
type SurfaceDegradation = "embedding_provider_failed" | "llm_station_unavailable" | "validation_failed" | null;
interface SurfaceStationStatus {
    stationId: "identity-adjudication-v1" | "task-decomposition-v1";
    state: SurfaceState;
    pendingCount: number;
    degradationCode: SurfaceDegradation;
    lastSuccessAtMs: number | null;
}
export interface TaskMapPossibleDuplicateSurfaceV1 {
    pairId: string;
    leftTaskId: string;
    rightTaskId: string;
    leftTitle: string;
    rightTitle: string;
    confidence: "high" | "ambiguous";
    awaitingOwnerAcceptance: true;
}
export interface TaskMapSuggestedBreakdownSubtaskSurfaceV1 {
    subtaskId: string;
    title: string;
    summary: string;
}
export interface TaskMapSuggestedBreakdownSurfaceV1 {
    proposalId: string;
    parentTaskId: string;
    parentTitle: string;
    subtasks: TaskMapSuggestedBreakdownSubtaskSurfaceV1[];
    awaitingOwnerAcceptance: true;
}
export interface TaskMapLlmProposalSurfaceV1 {
    contractVersion: typeof TASKMAP_LLM_PROPOSAL_SURFACE_VERSION;
    ownerScopeDigest: string;
    projectionDigest: string;
    possibleDuplicates: {
        state: SurfaceState;
        pendingCount: number;
        degradationCode: SurfaceDegradation;
        sourceArtifactDigest: string | null;
        proposals: TaskMapPossibleDuplicateSurfaceV1[];
    };
    suggestedBreakdowns: {
        state: SurfaceState;
        pendingCount: number;
        degradationCode: SurfaceDegradation;
        sourceArtifactDigest: string | null;
        proposals: TaskMapSuggestedBreakdownSurfaceV1[];
    };
    authority: {
        aliasesWritten: false;
        nodesWritten: false;
        edgesWritten: false;
        acceptanceAuthority: false;
        requiresOwnerAcceptance: true;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
    };
    artifactDigest: string;
}
export interface PublishTaskMapLlmProposalSurfaceInputV1 {
    taskMapRoot: string;
    ownerScopeDigest: string;
    projection: TaskMapProjectionV1;
    identityStatus: SurfaceStationStatus;
    identityArtifact: TaskMapIdentityAdjudicationRefreshArtifactV1 | null;
    decompositionStatus: SurfaceStationStatus;
    decompositionArtifact: TaskMapDecompositionRefreshArtifactV1 | null;
}
export interface LoadTaskMapLlmProposalSurfaceInputV1 {
    taskMapRoot: string;
    ownerScopeDigest: string;
    projection: TaskMapProjectionV1;
}
export declare function publishTaskMapLlmProposalSurface(input: PublishTaskMapLlmProposalSurfaceInputV1): Promise<TaskMapLlmProposalSurfaceV1>;
export declare function loadTaskMapLlmProposalSurface(input: LoadTaskMapLlmProposalSurfaceInputV1): Promise<TaskMapLlmProposalSurfaceV1 | null>;
export {};
