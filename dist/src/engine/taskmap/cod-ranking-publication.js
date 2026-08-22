"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COD_RANKING_FILENAME = exports.TASKMAP_COD_RANKING_PUBLICATION_VERSION = void 0;
exports.buildTaskMapCodRankingPublication = buildTaskMapCodRankingPublication;
exports.validateTaskMapCodRankingPublication = validateTaskMapCodRankingPublication;
const cod_ranking_policy_js_1 = require("./cod-ranking-policy.js");
const source_contracts_js_1 = require("./source-contracts.js");
const task_ranking_publication_js_1 = require("./task-ranking-publication.js");
const work_control_decision_js_1 = require("./work-control-decision.js");
exports.TASKMAP_COD_RANKING_PUBLICATION_VERSION = "taskmap-task-ranking.v2";
exports.TASKMAP_COD_RANKING_FILENAME = "taskmap-task-ranking.v2.json";
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const FACTOR_KEYS = Object.freeze([
    "taskId",
    "costOfDelayBasisPoints",
    "effort",
]);
const POLICY2_ROW_KEYS = Object.freeze([
    "rank",
    "taskId",
    "projectionRowDigest",
    "policyVersion",
    "policyDigest",
    "factorInputs",
    "scoreBasisPoints",
    "contributionBasisPoints",
    "reasonCodes",
    "citations",
]);
const POLICY1_ROW_KEYS = Object.freeze([
    "rank",
    "taskId",
    "projectionRowDigest",
    "policyVersion",
    "policyDigest",
    "factorBasisPoints",
    "contributionBasisPoints",
    "scoreBasisPoints",
    "reasonCodes",
    "citations",
]);
function fail(message) {
    throw new TypeError(`Task Map policy.2 ranking publication: ${message}`);
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
function validTaskId(value) {
    return typeof value === "string"
        && value.trim().length > 0
        && value.length <= 512
        && !CONTROL_CHARACTER.test(value);
}
function validCostOfDelay(value) {
    return value === null
        || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}
function validEffort(value) {
    return value === null
        || (typeof value === "number" && Number.isFinite(value) && value >= 1);
}
function normalizeFactors(factors, rankedTaskIds, maximumRows) {
    if (!Array.isArray(factors) || factors.length > maximumRows) {
        fail("factor collection exceeds its bounded contract");
    }
    const normalized = new Map();
    for (const [index, factor] of factors.entries()) {
        if (!plainObject(factor))
            fail(`factor ${index} is invalid`);
        assertExactKeys(factor, FACTOR_KEYS, `factor ${index}`);
        if (!validTaskId(factor.taskId)
            || !rankedTaskIds.has(factor.taskId)
            || !validCostOfDelay(factor.costOfDelayBasisPoints)
            || !validEffort(factor.effort)
            || normalized.has(factor.taskId)) {
            fail(`factor ${index} is invalid, duplicate, or outside the ranked set`);
        }
        normalized.set(factor.taskId, {
            taskId: factor.taskId,
            costOfDelayBasisPoints: factor.costOfDelayBasisPoints,
            effort: factor.effort,
        });
    }
    return normalized;
}
function bodyBonusBasisPoints(value, taskId) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        fail(`${taskId} body bonus must be a finite unit-interval factor`);
    }
    return Math.floor(value * 10_000 + 0.5);
}
function coreFor(input) {
    if (!plainObject(input))
        fail("input is invalid");
    if (!plainObject(input.projection) || !Array.isArray(input.projection.tasks)) {
        fail("projection candidate set is invalid");
    }
    // Decide availability over the complete accepted-open candidate set before
    // invoking either scorer. This makes whole-run fallback structural: no v2
    // row can be produced before the single policy choice exists.
    const candidateTaskIds = new Set(input.projection.tasks
        .filter((task) => task.reviewState === "accepted" && task.openState === "open")
        .map((task) => task.id));
    const factors = normalizeFactors(input.factors, candidateTaskIds, input.projection.tasks.length);
    const requiredFactorsAvailable = [...candidateTaskIds].every((taskId) => {
        const factor = factors.get(taskId);
        return factor !== undefined
            && factor.costOfDelayBasisPoints !== null
            && factor.effort !== null;
    });
    // This unchanged v1 builder is the authority for accepted-open membership,
    // projection binding, coverage, citations, and privacy. The v2 envelope is
    // additive and cannot relax any of those checks.
    const policy1 = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
        projection: input.projection,
        ownerScopeDigest: input.ownerScopeDigest,
        sourceStatuses: input.sourceStatuses,
    });
    const rankedTaskIds = new Set(policy1.rankedAcceptedOpen.map((row) => row.taskId));
    if (rankedTaskIds.size !== candidateTaskIds.size
        || [...rankedTaskIds].some((taskId) => !candidateTaskIds.has(taskId))) {
        fail("accepted-open candidate set disagrees with the v1 authority");
    }
    let policy;
    let fallback;
    let rankedAcceptedOpen;
    if (!requiredFactorsAvailable) {
        policy = {
            version: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_VERSION,
            digest: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST,
        };
        fallback = {
            applied: true,
            reason: "required_factor_unavailable",
        };
        rankedAcceptedOpen = policy1.rankedAcceptedOpen.map((row) => ({
            ...structuredClone(row),
            policyVersion: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_VERSION,
            policyDigest: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST,
        }));
    }
    else {
        policy = {
            version: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION,
            digest: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST,
        };
        fallback = { applied: false, reason: null };
        const taskById = new Map(input.projection.tasks.map((task) => [task.id, task]));
        rankedAcceptedOpen = policy1.rankedAcceptedOpen.map((baseRow) => {
            const factor = factors.get(baseRow.taskId);
            const task = taskById.get(baseRow.taskId);
            if (task === undefined)
                fail("ranked task is missing from the projection");
            const factorInputs = {
                costOfDelayBasisPoints: factor.costOfDelayBasisPoints,
                effort: factor.effort,
                bodyBonusBasisPoints: bodyBonusBasisPoints(task.score.bodyBonus, task.id),
            };
            const score = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId: baseRow.taskId,
                ...factorInputs,
            });
            return {
                rank: 0,
                taskId: score.taskId,
                projectionRowDigest: baseRow.projectionRowDigest,
                policyVersion: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION,
                policyDigest: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST,
                factorInputs,
                scoreBasisPoints: score.scoreBasisPoints,
                contributionBasisPoints: score.contributionBasisPoints,
                reasonCodes: score.reasonCodes,
                citations: structuredClone(baseRow.citations),
            };
        }).sort(cod_ranking_policy_js_1.compareTaskMapCodRankRows)
            .map((row, index) => ({ ...row, rank: index + 1 }));
    }
    return {
        contractVersion: exports.TASKMAP_COD_RANKING_PUBLICATION_VERSION,
        ownerScopeDigest: policy1.ownerScopeDigest,
        projection: structuredClone(policy1.projection),
        policy,
        fallback,
        coverage: structuredClone(policy1.coverage),
        rankedAcceptedOpen,
        authorityBoundary: {
            membershipCreated: false,
            readinessCreatedByCausalData: false,
            approvalGranted: false,
            executionStarted: false,
            completionGranted: false,
        },
        privacy: structuredClone(policy1.privacy),
    };
}
function sealedPublication(core) {
    const result = {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
    };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES) {
        fail("artifact size exceeds its bounded contract");
    }
    return result;
}
function buildTaskMapCodRankingPublication(input) {
    return sealedPublication(coreFor(input));
}
function validateTaskMapCodRankingPublication(value, input) {
    if (!plainObject(value))
        fail("document shape is invalid");
    assertExactKeys(value, [
        "contractVersion",
        "artifactDigest",
        "ownerScopeDigest",
        "projection",
        "policy",
        "fallback",
        "coverage",
        "rankedAcceptedOpen",
        "authorityBoundary",
        "privacy",
    ], "document");
    if (value.contractVersion !== exports.TASKMAP_COD_RANKING_PUBLICATION_VERSION
        || typeof value.artifactDigest !== "string"
        || !SHA256.test(value.artifactDigest)
        || !plainObject(value.policy)
        || !plainObject(value.fallback)
        || !Array.isArray(value.rankedAcceptedOpen)) {
        fail("document binding is invalid");
    }
    assertExactKeys(value.policy, ["version", "digest"], "policy");
    assertExactKeys(value.fallback, ["applied", "reason"], "fallback");
    const expectedRowKeys = value.policy.version === cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION
        ? POLICY2_ROW_KEYS
        : POLICY1_ROW_KEYS;
    for (const [index, row] of value.rankedAcceptedOpen.entries()) {
        if (!plainObject(row))
            fail(`ranking row ${index} is invalid`);
        assertExactKeys(row, expectedRowKeys, `ranking row ${index}`);
    }
    const { artifactDigest: _artifactDigest, ...suppliedCore } = value;
    if ((0, source_contracts_js_1.taskMapContractDigest)(suppliedCore) !== value.artifactDigest) {
        fail("artifact digest is invalid");
    }
    const expected = buildTaskMapCodRankingPublication(input);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expected)) {
        fail("canonical projection and ranking mismatch");
    }
    return structuredClone(expected);
}
