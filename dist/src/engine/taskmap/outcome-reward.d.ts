export declare const TASKMAP_OUTCOME_REWARD_VERSION: "taskmap-outcome-reward.v1";
export declare const TASKMAP_REWARD_STAGES: readonly ["approved", "started", "artifact", "source", "verified"];
export declare const TASKMAP_PREFERENCE_PAIR_THRESHOLD: 300;
export declare const TASKMAP_OUTCOME_REWARD_LIMITS_V1: Readonly<{
    readonly maxBodyBonusBasisPoints: 10000;
    readonly maxPreferencePairs: 1000000000;
    readonly maxArtifactBytes: number;
}>;
export type TaskMapRewardStageV1 = typeof TASKMAP_REWARD_STAGES[number];
export type TaskMapRewardReasonCodeV1 = "outcome_not_verified" | "verified_lifecycle_disposition";
export interface BuildTaskMapOutcomeRewardInputV1 {
    stage: TaskMapRewardStageV1;
    clicked?: boolean;
    /** Accepted for caller compatibility but never copied into or used by reward. */
    bodyBonusBasisPoints?: number;
}
export interface TaskMapOutcomeRewardV1 {
    contractVersion: typeof TASKMAP_OUTCOME_REWARD_VERSION;
    artifactDigest: string;
    stage: TaskMapRewardStageV1;
    reward: 0 | 1;
    rewardReasonCode: TaskMapRewardReasonCodeV1;
    attention: {
        clicked: boolean;
    };
    bodyEnteredReward: false;
    causalBackdoor: {
        clickUsedAsValue: false;
        bodySignalUsed: false;
    };
    authority: {
        orderingChanged: false;
        eligibilityChanged: false;
        executionGranted: false;
        sourceCompletionChanged: false;
        deterministicRankingReplaced: false;
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
export interface TaskMapPreferenceLearningStatusInputV1 {
    preferencePairs: number;
}
export interface TaskMapPreferenceLearningStatusV1 {
    mode: "shadow_only" | "shadow_eligible";
    preferencePairs: number;
    requiredPairs: typeof TASKMAP_PREFERENCE_PAIR_THRESHOLD;
    replacesDeterministicRanking: false;
    onlineLearnerEnabled: false;
    promotionRequiresOfflineProof: true;
    reasonCode: "insufficient_verified_preference_pairs" | "offline_proof_required";
}
export declare function buildTaskMapOutcomeReward(input: BuildTaskMapOutcomeRewardInputV1): TaskMapOutcomeRewardV1;
export declare function validateTaskMapOutcomeReward(value: unknown, input: BuildTaskMapOutcomeRewardInputV1): TaskMapOutcomeRewardV1;
export declare function taskMapPreferenceLearningStatus(input: TaskMapPreferenceLearningStatusInputV1): Readonly<TaskMapPreferenceLearningStatusV1>;
