import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES: number;
export interface TaskMapNativeAgentSessionEpisodeAdmissionV1 {
    admission: "authenticated_fresh_agent_session";
    directive: "user_directive";
    userDirectiveSummary: string;
    episodeId: string;
    episodeIdentityDigest: string;
    episodeRevisionDigest: string;
    rootSessionIdentityDigest: string;
    occurredAt: string;
    provider: "codex" | "claude";
    routingIdentityKind: "project" | "repository";
    routingIdentityDigest: string;
    completionAuthority: false;
    reopenAuthority: false;
}
export interface TaskMapNativeAgentSessionTaskProofV1 {
    taskId: string;
    candidateId: string;
    candidateRevisionDigest: string;
    evidenceProofDigests: string[];
    promotionId: string;
    promotionDigest: string;
    supportIdentityDigest: string;
    supportEvidenceProofDigest: string;
    episode: TaskMapNativeAgentSessionEpisodeAdmissionV1;
}
export interface TaskMapNativeCurrentnessForWorkV1 {
    contractVersion: "taskmap-native-currentness-gate.v1";
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    taskDispositions: Array<{
        taskId: string;
        disposition: "current" | "needs_lifecycle_review";
    }>;
}
export interface TaskMapNativeCurrentWorkV1 {
    contractVersion: "taskmap-current-work.v1";
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        generatedAt: string;
        projectionDigest: string;
    };
    currentGoal: {
        rootId: string;
        title: string;
        accepted: boolean;
    };
    agentSessionTaskProofs?: TaskMapNativeAgentSessionTaskProofV1[];
    nextTaskToProve: {
        taskId: string;
        rootId: string;
        outcome: string;
        input: {
            summary: string;
            contextPointerIds: string[];
            agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1;
        };
        predecessors: Array<{
            taskId: string;
            relation: "depends_on" | "blocks";
            reviewState: string;
            openState: string;
        }>;
        doneDefinition: string[];
        permission: {
            requiresExplicitApproval: boolean;
            approvalGranted: boolean;
        };
        returnTarget: {
            state: "source_owned";
            pointerId: string;
        } | {
            state: "source_return";
            pointerId: string;
        } | {
            state: "personal_fork";
            pointerId: string;
        } | {
            state: "user_destination_required";
        };
        executable: boolean;
    };
    privacy: {
        sourceBodiesStored: boolean;
        localPathsStored: boolean;
        rawBiometricsStored: boolean;
    };
    artifactDigest: string;
}
export declare function validateTaskMapNativeAgentSessionEpisodeAdmission(value: unknown): TaskMapNativeAgentSessionEpisodeAdmissionV1;
export declare function validateTaskMapNativeAgentSessionTaskProof(value: unknown): TaskMapNativeAgentSessionTaskProofV1;
export declare function validateTaskMapNativeCurrentWork(value: unknown, rawBytes: Buffer, projection: TaskMapProjectionV1, currentness: TaskMapNativeCurrentnessForWorkV1): TaskMapNativeCurrentWorkV1;
export declare function buildTaskMapNativeCurrentWorkSuccessor(predecessorValue: unknown, predecessorBytes: Buffer, predecessorProjection: TaskMapProjectionV1, predecessorCurrentness: TaskMapNativeCurrentnessForWorkV1, successorProjection: TaskMapProjectionV1, successorCurrentness: TaskMapNativeCurrentnessForWorkV1, agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1 | null, agentSessionTaskProofs?: readonly TaskMapNativeAgentSessionTaskProofV1[]): TaskMapNativeCurrentWorkV1;
