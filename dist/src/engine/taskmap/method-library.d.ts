import type { DetectedLlmProvider, LlmProviderId } from "./llm-station.js";
export declare const TASKMAP_METHOD_LIBRARY_VERSION: "taskmap-method-library.v1";
export declare const TASKMAP_DECOMPOSITION_PROPOSAL_VERSION: "taskmap-decomposition-proposal.v1";
export declare const TASKMAP_DECOMPOSITION_STATION_ID: "task-decomposition-v1";
export declare const TASKMAP_METHOD_LIBRARY_LIMITS_V1: Readonly<{
    maxTemplates: 128;
    maxCandidateProposals: 16;
    maxPublishedProposals: 3;
    maxSubtasksPerProposal: 16;
    maxPromptCharacters: 32768;
    maxOutputBytes: 65536;
    maxArtifactBytes: 1048576;
    maxIdCharacters: 512;
    maxDomainSignatureCharacters: 128;
    maxTitleCharacters: 256;
    maxSummaryCharacters: 1024;
    maxCitationPointers: 32;
    maxModelCharacters: 256;
}>;
export interface TaskMapMethodTemplateSubtaskV1 {
    title: string;
    summary: string;
}
export interface TaskMapMethodTemplateV1 {
    templateId: string;
    domainSignature: string;
    methodId: string;
    subtasks: readonly TaskMapMethodTemplateSubtaskV1[];
}
export interface TaskMapMethodLibraryV1 {
    contractVersion: typeof TASKMAP_METHOD_LIBRARY_VERSION;
    templates: readonly TaskMapMethodTemplateV1[];
    authority: {
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
export interface TaskMapDecompositionWorkItemV1 {
    taskId: string;
    domainSignature: string;
    title: string;
    summary: string;
    citationPointerIds: readonly string[];
}
export interface TaskMapDecompositionStationRequest {
    stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
    promptText: string;
    inputDigest: string;
}
export interface TaskMapDecompositionStationEnvelope {
    stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
    model: string;
    promptDigest: string;
    inputDigest: string;
    outputJson: string;
    producedAt: string;
    transport: LlmProviderId;
}
/** High-level production seam, matching LlmStation provider/run conventions. */
export interface TaskMapDecompositionStation {
    readonly provider: DetectedLlmProvider;
    run(request: TaskMapDecompositionStationRequest): Promise<TaskMapDecompositionStationEnvelope>;
}
export interface TaskMapDecompositionReplayResult {
    outputJson: string;
}
/** Recorded-output seam only; it never receives an executable or argv. */
export type TaskMapDecompositionReplayRunner = (request: TaskMapDecompositionStationRequest) => Promise<TaskMapDecompositionReplayResult>;
export interface TaskMapDecompositionSubtaskV1 {
    subtaskId: string;
    title: string;
    summary: string;
    citationPointerIds: string[];
}
export interface TaskMapDecompositionProposalV1 {
    proposalId: string;
    methodId: string;
    subtasks: TaskMapDecompositionSubtaskV1[];
}
export type TaskMapDecompositionUnavailableReason = "llm_station_unavailable" | "llm_station_invalid_output";
export interface TaskMapDecompositionResultV1 {
    contractVersion: typeof TASKMAP_DECOMPOSITION_PROPOSAL_VERSION;
    inputDigest: string;
    libraryDigest: string;
    source: "method_library" | "llm_station";
    unavailableReason: TaskMapDecompositionUnavailableReason | null;
    proposals: TaskMapDecompositionProposalV1[];
    llm: {
        invocationState: "not_invoked" | "invoked" | "unavailable";
        stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
        modelId: string | null;
        providerId: LlmProviderId | "offline-replay" | null;
        transport: LlmProviderId | "injected-offline" | null;
        promptDigest: string | null;
        inputDigest: string;
        outputDigest: string | null;
    };
    authority: {
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
export declare function buildTaskMapMethodLibrary(input: {
    templates: readonly TaskMapMethodTemplateV1[];
}): TaskMapMethodLibraryV1;
export type ProposeTaskMapDecompositionInputV1 = {
    workItem: TaskMapDecompositionWorkItemV1;
    library: TaskMapMethodLibraryV1;
    station?: TaskMapDecompositionStation;
    runner?: TaskMapDecompositionReplayRunner;
    llmModelId?: string;
};
export declare function proposeTaskMapDecomposition(input: ProposeTaskMapDecompositionInputV1): Promise<TaskMapDecompositionResultV1>;
