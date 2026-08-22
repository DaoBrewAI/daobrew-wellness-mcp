import { type TaskMapOwnerRefreshSource } from "./owner-refresh-coordinator.js";
import type { TaskMapCitation, TaskMapProjectionV1 } from "./types.js";
import { TASKMAP_WORK_CONTROL_POLICY_VERSION, type TaskMapAcceptedOpenTaskRankV1 } from "./work-control-decision.js";
export declare const TASKMAP_TASK_RANKING_PUBLICATION_VERSION: "taskmap-task-ranking.v1";
export declare const TASKMAP_TASK_RANKING_FILENAME: "taskmap-task-ranking.v1.json";
export declare const TASKMAP_TASK_RANKING_MAX_BYTES: number;
export type TaskMapTaskRankingCoverageState = "current" | "unavailable";
export interface TaskMapTaskRankingCoverageV1 {
    source: TaskMapOwnerRefreshSource;
    state: TaskMapTaskRankingCoverageState;
    sliceDigest: string | null;
}
export interface TaskMapTaskRankingRowV1 extends TaskMapAcceptedOpenTaskRankV1 {
    citations: TaskMapCitation[];
}
export interface TaskMapTaskRankingPublicationV1 {
    contractVersion: typeof TASKMAP_TASK_RANKING_PUBLICATION_VERSION;
    artifactDigest: string;
    ownerScopeDigest: string;
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        projectionDigest: string;
    };
    policy: {
        version: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
        digest: string;
    };
    coverage: TaskMapTaskRankingCoverageV1[];
    rankedAcceptedOpen: TaskMapTaskRankingRowV1[];
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawOwnerIdentifiersStored: false;
        rawSourceObjectIdentifiersStored: false;
        rawBiometricsStored: false;
        connectorSecretsStored: false;
    };
}
export interface TaskMapTaskRankingSourceStatus {
    source: TaskMapOwnerRefreshSource;
    disposition: "fresh" | "retained_last_good" | "unavailable";
    sliceDigest: string | null;
}
export declare function buildTaskMapTaskRankingPublication(input: {
    projection: TaskMapProjectionV1;
    ownerScopeDigest: string;
    sourceStatuses: readonly TaskMapTaskRankingSourceStatus[];
}): TaskMapTaskRankingPublicationV1;
export declare function validateTaskMapTaskRankingPublication(value: unknown, projection: TaskMapProjectionV1, expectedOwnerScopeDigest: string): TaskMapTaskRankingPublicationV1;
