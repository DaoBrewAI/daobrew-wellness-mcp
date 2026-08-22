import { type TaskMapDecompositionResultV1 } from "./method-library.js";
import type { BrainRelation, TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_DECOMPOSITION_VALIDATION_VERSION: "taskmap-decomposition-validation.v1";
export declare const TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS: readonly ["field_completeness", "citation_validity", "acyclicity", "edge_type_legality", "privacy_boundary"];
export type TaskMapDecompositionValidationStepId = (typeof TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS)[number];
export declare const TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1: Readonly<{
    maxSubtasks: 16;
    maxEdges: 64;
    maxCitationsPerItem: 32;
    maxIdCharacters: 512;
    maxTitleCharacters: 256;
    maxSummaryCharacters: 1024;
    maxCandidateBytes: 1048576;
    maxSourceResultBytes: 1048576;
    maxArtifactBytes: 1048576;
}>;
export interface TaskMapDecompositionValidationSubtaskV1 {
    subtaskId: string;
    title: string;
    summary: string;
    citationPointerIds: string[];
}
export interface TaskMapDecompositionValidationEdgeV1 {
    id: string;
    from: string;
    to: string;
    relation: BrainRelation;
    citationPointerIds: string[];
}
/**
 * Owner-review candidate produced from a Task-7 proposal plus proposed graph
 * edges. It is validation input only; it is never written into the projection.
 */
export interface TaskMapDecompositionValidationCandidateV1 {
    proposalId: string;
    methodId: string;
    sourceResultArtifactDigest: string;
    sourceProposalDigest: string;
    parentTaskId: string;
    subtasks: TaskMapDecompositionValidationSubtaskV1[];
    edges: TaskMapDecompositionValidationEdgeV1[];
}
export interface TaskMapDecompositionValidationContextV1 {
    projection: TaskMapProjectionV1;
    sourceResult: TaskMapDecompositionResultV1;
}
export interface TaskMapDecompositionValidationStepV1 {
    stepId: TaskMapDecompositionValidationStepId;
    passed: boolean;
    reasons: string[];
}
export interface TaskMapDecompositionValidationResultV1 {
    contractVersion: typeof TASKMAP_DECOMPOSITION_VALIDATION_VERSION;
    proposalDigest: string;
    projectionDigest: string;
    valid: boolean;
    steps: TaskMapDecompositionValidationStepV1[];
    authority: {
        nodesWritten: false;
        edgesWritten: false;
        requiresOwnerAcceptance: true;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
    };
    artifactDigest: string;
}
export declare function validateTaskMapDecomposition(candidate: TaskMapDecompositionValidationCandidateV1 | unknown, context: TaskMapDecompositionValidationContextV1 | unknown): TaskMapDecompositionValidationResultV1;
export declare function validateTaskMapDecompositionValidationResult(value: unknown, candidate: TaskMapDecompositionValidationCandidateV1 | unknown, context: TaskMapDecompositionValidationContextV1 | unknown): TaskMapDecompositionValidationResultV1;
