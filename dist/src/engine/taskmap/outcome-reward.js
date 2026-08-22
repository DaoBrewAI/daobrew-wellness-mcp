"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_OUTCOME_REWARD_LIMITS_V1 = exports.TASKMAP_PREFERENCE_PAIR_THRESHOLD = exports.TASKMAP_REWARD_STAGES = exports.TASKMAP_OUTCOME_REWARD_VERSION = void 0;
exports.buildTaskMapOutcomeReward = buildTaskMapOutcomeReward;
exports.validateTaskMapOutcomeReward = validateTaskMapOutcomeReward;
exports.taskMapPreferenceLearningStatus = taskMapPreferenceLearningStatus;
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_OUTCOME_REWARD_VERSION = "taskmap-outcome-reward.v1";
exports.TASKMAP_REWARD_STAGES = Object.freeze([
    "approved",
    "started",
    "artifact",
    "source",
    "verified",
]);
exports.TASKMAP_PREFERENCE_PAIR_THRESHOLD = 300;
exports.TASKMAP_OUTCOME_REWARD_LIMITS_V1 = Object.freeze({
    maxBodyBonusBasisPoints: 10_000,
    maxPreferencePairs: 1_000_000_000,
    maxArtifactBytes: 16 * 1_024,
});
const INPUT_KEYS = Object.freeze([
    "stage",
    "clicked",
    "bodyBonusBasisPoints",
]);
const PREFERENCE_INPUT_KEYS = Object.freeze(["preferencePairs"]);
const DOCUMENT_KEYS = Object.freeze([
    "contractVersion",
    "artifactDigest",
    "stage",
    "reward",
    "rewardReasonCode",
    "attention",
    "bodyEnteredReward",
    "causalBackdoor",
    "authority",
    "privacy",
]);
const ATTENTION_KEYS = Object.freeze(["clicked"]);
const CAUSAL_BACKDOOR_KEYS = Object.freeze([
    "clickUsedAsValue",
    "bodySignalUsed",
]);
const AUTHORITY_KEYS = Object.freeze([
    "orderingChanged",
    "eligibilityChanged",
    "executionGranted",
    "sourceCompletionChanged",
    "deterministicRankingReplaced",
]);
const PRIVACY_KEYS = Object.freeze([
    "sourceBodiesStored",
    "localPathsStored",
    "rawOwnerIdentifiersStored",
    "rawSourceObjectIdentifiersStored",
    "rawBiometricsStored",
    "connectorSecretsStored",
]);
const SHA256 = /^[a-f0-9]{64}$/;
function fail(message) {
    throw new TypeError(`Task Map outcome reward: ${message}`);
}
function plainObject(value) {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function stableCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort(stableCompare);
    const wanted = [...expected].sort(stableCompare);
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} keys are invalid`);
    }
}
function assertOnlyKnownKeys(value, known, label) {
    const allowed = new Set(known);
    if (Object.keys(value).some((key) => !allowed.has(key))) {
        fail(`${label} keys are invalid`);
    }
}
function validStage(value) {
    return typeof value === "string"
        && exports.TASKMAP_REWARD_STAGES.includes(value);
}
function normalizeInput(input) {
    if (!plainObject(input))
        fail("input is invalid");
    assertOnlyKnownKeys(input, INPUT_KEYS, "input");
    if (!validStage(input.stage))
        fail("stage is invalid");
    if (input.clicked !== undefined && typeof input.clicked !== "boolean") {
        fail("clicked state is invalid");
    }
    if (input.bodyBonusBasisPoints !== undefined
        && (!Number.isSafeInteger(input.bodyBonusBasisPoints)
            || input.bodyBonusBasisPoints < 0
            || input.bodyBonusBasisPoints
                > exports.TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxBodyBonusBasisPoints)) {
        fail("body bonus basis points are invalid or exceed their bounded contract");
    }
    return { stage: input.stage, clicked: input.clicked ?? false };
}
function coreFor(input) {
    const { stage, clicked } = normalizeInput(input);
    const verified = stage === "verified";
    return {
        contractVersion: exports.TASKMAP_OUTCOME_REWARD_VERSION,
        stage,
        reward: verified ? 1 : 0,
        rewardReasonCode: verified
            ? "verified_lifecycle_disposition"
            : "outcome_not_verified",
        attention: { clicked },
        bodyEnteredReward: false,
        causalBackdoor: {
            clickUsedAsValue: false,
            bodySignalUsed: false,
        },
        authority: {
            orderingChanged: false,
            eligibilityChanged: false,
            executionGranted: false,
            sourceCompletionChanged: false,
            deterministicRankingReplaced: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawOwnerIdentifiersStored: false,
            rawSourceObjectIdentifiersStored: false,
            rawBiometricsStored: false,
            connectorSecretsStored: false,
        },
    };
}
function seal(core) {
    const result = { ...core, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core) };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxArtifactBytes) {
        fail("artifact size exceeds its bounded contract");
    }
    return result;
}
function assertArtifactShape(value) {
    assertExactKeys(value, DOCUMENT_KEYS, "document");
    if (value.contractVersion !== exports.TASKMAP_OUTCOME_REWARD_VERSION
        || typeof value.artifactDigest !== "string"
        || !SHA256.test(value.artifactDigest)
        || !validStage(value.stage)) {
        fail("document binding or stage is invalid");
    }
    const verified = value.stage === "verified";
    if (value.reward !== (verified ? 1 : 0)
        || value.rewardReasonCode !== (verified ? "verified_lifecycle_disposition" : "outcome_not_verified")
        || value.bodyEnteredReward !== false) {
        fail("reward staging is invalid");
    }
    if (!plainObject(value.attention))
        fail("attention block is invalid");
    assertExactKeys(value.attention, ATTENTION_KEYS, "attention");
    if (typeof value.attention.clicked !== "boolean") {
        fail("attention block is invalid");
    }
    const causalBackdoor = value.causalBackdoor;
    if (!plainObject(causalBackdoor))
        fail("causal backdoor block is invalid");
    assertExactKeys(causalBackdoor, CAUSAL_BACKDOOR_KEYS, "causal backdoor");
    if (CAUSAL_BACKDOOR_KEYS.some((key) => causalBackdoor[key] !== false)) {
        fail("causal backdoor block is not fail closed");
    }
    const authority = value.authority;
    if (!plainObject(authority))
        fail("authority block is invalid");
    assertExactKeys(authority, AUTHORITY_KEYS, "authority");
    if (AUTHORITY_KEYS.some((key) => authority[key] !== false)) {
        fail("authority block is not fail closed");
    }
    const privacy = value.privacy;
    if (!plainObject(privacy))
        fail("privacy block is invalid");
    assertExactKeys(privacy, PRIVACY_KEYS, "privacy");
    if (PRIVACY_KEYS.some((key) => privacy[key] !== false)) {
        fail("privacy block is not fail closed");
    }
}
function buildTaskMapOutcomeReward(input) {
    return seal(coreFor(input));
}
function validateTaskMapOutcomeReward(value, input) {
    if (!plainObject(value))
        fail("document shape is invalid");
    assertArtifactShape(value);
    const { artifactDigest: _artifactDigest, ...core } = value;
    if ((0, source_contracts_js_1.taskMapContractDigest)(core) !== value.artifactDigest) {
        fail("artifact digest is invalid");
    }
    const expected = buildTaskMapOutcomeReward(input);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expected)) {
        fail("canonical reward mismatch");
    }
    return structuredClone(expected);
}
function taskMapPreferenceLearningStatus(input) {
    if (!plainObject(input))
        fail("preference input is invalid");
    assertExactKeys(input, PREFERENCE_INPUT_KEYS, "input");
    if (!Number.isSafeInteger(input.preferencePairs)
        || input.preferencePairs < 0
        || input.preferencePairs > exports.TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxPreferencePairs) {
        fail("preference pair count is invalid or exceeds its bounded contract");
    }
    const eligible = input.preferencePairs >= exports.TASKMAP_PREFERENCE_PAIR_THRESHOLD;
    return Object.freeze({
        mode: eligible ? "shadow_eligible" : "shadow_only",
        preferencePairs: input.preferencePairs,
        requiredPairs: exports.TASKMAP_PREFERENCE_PAIR_THRESHOLD,
        replacesDeterministicRanking: false,
        onlineLearnerEnabled: false,
        promotionRequiresOfflineProof: true,
        reasonCode: eligible
            ? "offline_proof_required"
            : "insufficient_verified_preference_pairs",
    });
}
