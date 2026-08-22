import { TASKMAP_COD_RANKING_POLICY_VERSION, type TaskMapCodRankReasonCode } from "./cod-ranking-policy.js";
import { type TaskMapTaskRankingCoverageV1, type TaskMapTaskRankingRowV1, type TaskMapTaskRankingSourceStatus } from "./task-ranking-publication.js";
import type { TaskMapCitation, TaskMapProjectionV1 } from "./types.js";
import { TASKMAP_WORK_CONTROL_POLICY_VERSION } from "./work-control-decision.js";
export declare const TASKMAP_COD_RANKING_PUBLICATION_VERSION: "taskmap-task-ranking.v2";
export declare const TASKMAP_COD_RANKING_FILENAME: "taskmap-task-ranking.v2.json";
export interface TaskMapCodRankingRequiredFactorsV2 {
    taskId: string;
    costOfDelayBasisPoints: number | null;
    effort: number | null;
}
export interface BuildTaskMapCodRankingPublicationInputV2 {
    projection: TaskMapProjectionV1;
    ownerScopeDigest: string;
    sourceStatuses: readonly TaskMapTaskRankingSourceStatus[];
    factors: readonly TaskMapCodRankingRequiredFactorsV2[];
}
export interface TaskMapCodRankingPolicy2RowV2 {
    rank: number;
    taskId: string;
    projectionRowDigest: string;
    policyVersion: typeof TASKMAP_COD_RANKING_POLICY_VERSION;
    policyDigest: string;
    factorInputs: {
        costOfDelayBasisPoints: number;
        effort: number;
        bodyBonusBasisPoints: number;
    };
    scoreBasisPoints: number;
    contributionBasisPoints: {
        costOfDelay: number;
        effortDamping: number;
        bodyBonus: number;
    };
    reasonCodes: TaskMapCodRankReasonCode[];
    citations: TaskMapCitation[];
}
export interface TaskMapCodRankingPolicy1RowV2 extends TaskMapTaskRankingRowV1 {
    policyVersion: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
    policyDigest: string;
}
export type TaskMapCodRankingRowV2 = TaskMapCodRankingPolicy2RowV2 | TaskMapCodRankingPolicy1RowV2;
export interface TaskMapCodRankingPublicationV2 {
    contractVersion: typeof TASKMAP_COD_RANKING_PUBLICATION_VERSION;
    artifactDigest: string;
    ownerScopeDigest: string;
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        projectionDigest: string;
    };
    policy: {
        version: typeof TASKMAP_COD_RANKING_POLICY_VERSION | typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
        digest: string;
    };
    fallback: {
        applied: false;
        reason: null;
    } | {
        applied: true;
        reason: "required_factor_unavailable";
    };
    coverage: TaskMapTaskRankingCoverageV1[];
    rankedAcceptedOpen: TaskMapCodRankingRowV2[];
    authorityBoundary: {
        membershipCreated: false;
        readinessCreatedByCausalData: false;
        approvalGranted: false;
        executionStarted: false;
        completionGranted: false;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawOwnerIdentifiersStored: false;
        rawSourceObjectIdentifiersStored: false;
        rawBiometricsStored: false;
        connectorSecretsStored: false;
    };
}
export declare function buildTaskMapCodRankingPublication(input: BuildTaskMapCodRankingPublicationInputV2): TaskMapCodRankingPublicationV2;
export declare function validateTaskMapCodRankingPublication(value: unknown, input: BuildTaskMapCodRankingPublicationInputV2): TaskMapCodRankingPublicationV2;
