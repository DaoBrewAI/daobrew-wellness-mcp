"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const outcome_reward_js_1 = require("../src/engine/taskmap/outcome-reward.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
function reseal(draft) {
    const { artifactDigest: _artifactDigest, ...core } = draft;
    draft.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return draft;
}
(0, node_test_1.describe)("Task Map outcome reward", () => {
    (0, node_test_1.it)("anchors reward only at the verified stage", () => {
        strict_1.default.equal(Object.isFrozen(outcome_reward_js_1.TASKMAP_REWARD_STAGES), true);
        strict_1.default.deepEqual(outcome_reward_js_1.TASKMAP_REWARD_STAGES, [
            "approved",
            "started",
            "artifact",
            "source",
            "verified",
        ]);
        for (const stage of ["approved", "started", "artifact", "source"]) {
            const result = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({ stage });
            strict_1.default.equal(result.reward, 0);
            strict_1.default.equal(result.rewardReasonCode, "outcome_not_verified");
        }
        const verified = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({ stage: "verified" });
        strict_1.default.equal(verified.reward, 1);
        strict_1.default.equal(verified.rewardReasonCode, "verified_lifecycle_disposition");
    });
    (0, node_test_1.it)("treats a click as attention, never as value", () => {
        const withoutClick = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "approved",
            clicked: false,
        });
        const withClick = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "approved",
            clicked: true,
        });
        strict_1.default.equal(withClick.reward, 0);
        strict_1.default.equal(withClick.reward, withoutClick.reward);
        strict_1.default.equal(withClick.attention.clicked, true);
        strict_1.default.equal(withClick.causalBackdoor.clickUsedAsValue, false);
    });
    (0, node_test_1.it)("structurally excludes body signal from the reward path", () => {
        const withoutBody = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "verified",
            bodyBonusBasisPoints: 0,
        });
        const withBody = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "verified",
            bodyBonusBasisPoints: 800,
        });
        strict_1.default.deepEqual(withBody, withoutBody);
        strict_1.default.equal(withBody.bodyEnteredReward, false);
        strict_1.default.equal(withBody.causalBackdoor.bodySignalUsed, false);
        strict_1.default.equal("bodyBonusBasisPoints" in withBody, false);
    });
    (0, node_test_1.it)("seals deterministic authority/privacy/causal-backdoor fields", () => {
        const input = { stage: "verified", clicked: true };
        const original = (0, outcome_reward_js_1.buildTaskMapOutcomeReward)(input);
        strict_1.default.deepEqual((0, outcome_reward_js_1.buildTaskMapOutcomeReward)(structuredClone(input)), original);
        strict_1.default.deepEqual((0, outcome_reward_js_1.validateTaskMapOutcomeReward)(original, input), original);
        strict_1.default.deepEqual(original.authority, {
            orderingChanged: false,
            eligibilityChanged: false,
            executionGranted: false,
            sourceCompletionChanged: false,
            deterministicRankingReplaced: false,
        });
        strict_1.default.deepEqual(original.privacy, {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawOwnerIdentifiersStored: false,
            rawSourceObjectIdentifiersStored: false,
            rawBiometricsStored: false,
            connectorSecretsStored: false,
        });
        strict_1.default.deepEqual(original.causalBackdoor, {
            clickUsedAsValue: false,
            bodySignalUsed: false,
        });
        const mutations = [
            (draft) => {
                draft.reward = 7;
            },
            (draft) => { draft.stage = "approved"; },
            (draft) => {
                draft.causalBackdoor
                    .bodySignalUsed = true;
            },
            (draft) => {
                draft.authority
                    .executionGranted = true;
            },
            (draft) => {
                draft.unknown = true;
            },
        ];
        for (const mutate of mutations) {
            const forged = structuredClone(original);
            mutate(forged);
            reseal(forged);
            strict_1.default.throws(() => (0, outcome_reward_js_1.validateTaskMapOutcomeReward)(forged, input), /canonical|keys|reward|authority|causal|stage/i);
        }
    });
    (0, node_test_1.it)("rejects invalid stages, hostile body numbers, and unknown input keys", () => {
        strict_1.default.throws(() => (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "complete",
        }), /stage/i);
        for (const bodyBonusBasisPoints of [
            -1,
            0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            outcome_reward_js_1.TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxBodyBonusBasisPoints + 1,
        ]) {
            strict_1.default.throws(() => (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
                stage: "verified",
                bodyBonusBasisPoints,
            }), /body.*basis points/i);
        }
        strict_1.default.throws(() => (0, outcome_reward_js_1.buildTaskMapOutcomeReward)({
            stage: "verified",
            unknown: true,
        }), /input keys/i);
    });
});
(0, node_test_1.describe)("Task Map preference-learning upgrade seam", () => {
    (0, node_test_1.it)("uses the exact 300-pair boundary without replacing deterministic ranking", () => {
        strict_1.default.equal(outcome_reward_js_1.TASKMAP_PREFERENCE_PAIR_THRESHOLD, 300);
        strict_1.default.deepEqual((0, outcome_reward_js_1.taskMapPreferenceLearningStatus)({ preferencePairs: 299 }), {
            mode: "shadow_only",
            preferencePairs: 299,
            requiredPairs: 300,
            replacesDeterministicRanking: false,
            onlineLearnerEnabled: false,
            promotionRequiresOfflineProof: true,
            reasonCode: "insufficient_verified_preference_pairs",
        });
        strict_1.default.deepEqual((0, outcome_reward_js_1.taskMapPreferenceLearningStatus)({ preferencePairs: 300 }), {
            mode: "shadow_eligible",
            preferencePairs: 300,
            requiredPairs: 300,
            replacesDeterministicRanking: false,
            onlineLearnerEnabled: false,
            promotionRequiresOfflineProof: true,
            reasonCode: "offline_proof_required",
        });
        const aboveThreshold = (0, outcome_reward_js_1.taskMapPreferenceLearningStatus)({
            preferencePairs: outcome_reward_js_1.TASKMAP_PREFERENCE_PAIR_THRESHOLD + 1,
        });
        strict_1.default.equal(aboveThreshold.mode, "shadow_eligible");
        strict_1.default.equal(aboveThreshold.replacesDeterministicRanking, false);
        strict_1.default.equal(aboveThreshold.onlineLearnerEnabled, false);
        strict_1.default.equal(aboveThreshold.promotionRequiresOfflineProof, true);
        strict_1.default.equal(aboveThreshold.reasonCode, "offline_proof_required");
    });
    (0, node_test_1.it)("rejects hostile pair counts and exact-key drift", () => {
        for (const preferencePairs of [
            -1,
            0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            outcome_reward_js_1.TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxPreferencePairs + 1,
        ]) {
            strict_1.default.throws(() => (0, outcome_reward_js_1.taskMapPreferenceLearningStatus)({ preferencePairs }), /preference pair count/i);
        }
        strict_1.default.throws(() => (0, outcome_reward_js_1.taskMapPreferenceLearningStatus)({
            preferencePairs: 0,
            online: true,
        }), /input keys/i);
    });
});
