import { TASKMAP_COD_RANKING_POLICY_VERSION } from "./cod-ranking-policy.js";
import { type BuildTaskMapCodRankingPublicationInputV2, type TaskMapCodRankingPublicationV2 } from "./cod-ranking-publication.js";
import { TASKMAP_WORK_CONTROL_POLICY_VERSION } from "./work-control-decision.js";
export declare const TASKMAP_EXPOSURE_LOG_VERSION: "taskmap-exposure-log.v1";
export declare const TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS: "deterministic_display_probability.v1";
export declare const TASKMAP_EXPOSURE_LOG_LIMITS_V1: Readonly<{
    readonly maxCandidates: 4096;
    readonly maxDisplayedCount: 512;
    readonly maxTaskIdCharacters: 512;
    readonly maxArtifactBytes: number;
}>;
export type TaskMapExposurePolicyIdentityV1 = {
    version: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
    digest: string;
} | {
    version: typeof TASKMAP_COD_RANKING_POLICY_VERSION;
    digest: string;
};
export interface TaskMapExposureProjectionBindingV1 {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    projectionDigest: string;
}
export interface TaskMapExposureCandidateV1 {
    taskId: string;
    pinned: boolean;
}
export interface BuildTaskMapExposureLogInputV1 {
    candidates: readonly TaskMapExposureCandidateV1[];
    displayedCount: number;
    rankingPublication: TaskMapCodRankingPublicationV2;
    rankingInput: BuildTaskMapCodRankingPublicationInputV2;
}
export interface TaskMapExposureEntryV1 {
    taskId: string;
    displayPosition: number | null;
    /** Deterministic display probability; zero rows are candidate negatives, not IPS observations. */
    propensity: number | null;
    pinned: boolean;
    /** Preference-pair eligibility only. Consumers must not divide by a zero propensity. */
    eligibleForTraining: boolean;
}
export interface TaskMapExposureLogV1 {
    contractVersion: typeof TASKMAP_EXPOSURE_LOG_VERSION;
    artifactDigest: string;
    ownerScopeDigest: string;
    sourceRankingArtifactDigest: string;
    projection: TaskMapExposureProjectionBindingV1;
    policy: TaskMapExposurePolicyIdentityV1;
    propensitySemantics: typeof TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS;
    entries: TaskMapExposureEntryV1[];
    authority: {
        orderingChanged: false;
        eligibilityChanged: false;
        learnedRankingApplied: false;
        pinnedRowsUsedForTraining: false;
        executionGranted: false;
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
export declare function buildTaskMapExposureLog(input: BuildTaskMapExposureLogInputV1): TaskMapExposureLogV1;
export declare function validateTaskMapExposureLog(value: unknown, input: BuildTaskMapExposureLogInputV1): TaskMapExposureLogV1;
