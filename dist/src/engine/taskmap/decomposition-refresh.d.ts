import { type TaskMapDecompositionValidationEdgeV1, type TaskMapDecompositionValidationResultV1 } from "./decomposition-validation.js";
import { type TaskMapDecompositionProposalV1, type TaskMapDecompositionResultV1, type TaskMapDecompositionWorkItemV1, type TaskMapMethodLibraryV1 } from "./method-library.js";
import { type LlmStation } from "./llm-station.js";
import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_DECOMPOSITION_REFRESH_VERSION: "taskmap-decomposition-refresh.v1";
export declare const TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET = 3;
export interface TaskMapDecompositionValidatedProposalV1 {
    proposal: TaskMapDecompositionProposalV1;
    edges: TaskMapDecompositionValidationEdgeV1[];
    validationArtifactDigest: string;
}
export interface TaskMapDecompositionRejectedProposalV1 {
    proposalId: string;
    reasonCodes: string[];
}
export interface TaskMapDecompositionRefreshWorkItemV1 {
    taskId: string;
    inputDigest: string;
    result: TaskMapDecompositionResultV1;
    validProposals: TaskMapDecompositionValidatedProposalV1[];
    validations: TaskMapDecompositionValidationResultV1[];
    rejected: TaskMapDecompositionRejectedProposalV1[];
}
export interface TaskMapDecompositionRefreshArtifactV1 {
    contractVersion: typeof TASKMAP_DECOMPOSITION_REFRESH_VERSION;
    ownerScopeDigest: string;
    projectionDigest: string;
    methodLibrary: TaskMapMethodLibraryV1;
    state: "current" | "deferred" | "unavailable";
    pendingCount: number;
    degradationCode: "llm_station_unavailable" | "validation_failed" | null;
    workItems: TaskMapDecompositionRefreshWorkItemV1[];
    authority: {
        nodesWritten: false;
        edgesWritten: false;
        requiresOwnerAcceptance: true;
    };
    artifactDigest: string;
}
export interface RefreshTaskMapDecompositionInputV1 {
    taskMapRoot: string;
    ownerScopeDigest: string;
    projection: TaskMapProjectionV1;
    createStation?: () => Promise<LlmStation>;
}
export declare function selectTaskMapDecompositionWorkItems(projection: TaskMapProjectionV1): TaskMapDecompositionWorkItemV1[];
export declare function taskMapDecompositionRefreshPath(taskMapRoot: string, projectionDigest: string): string;
export declare function loadTaskMapDecompositionRefreshArtifact(taskMapRoot: string, ownerScopeDigest: string, projectionDigest: string): Promise<TaskMapDecompositionRefreshArtifactV1 | null>;
export declare function refreshTaskMapDecomposition(input: RefreshTaskMapDecompositionInputV1): Promise<TaskMapDecompositionRefreshArtifactV1>;
