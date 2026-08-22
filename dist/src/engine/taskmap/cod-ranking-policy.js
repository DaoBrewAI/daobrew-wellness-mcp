"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COD_RANKING_POLICY_DIGEST = exports.TASKMAP_COD_RANKING_POLICY_V2 = exports.TASKMAP_COD_RANKING_POLICY_VERSION = void 0;
exports.scoreTaskMapCodTask = scoreTaskMapCodTask;
exports.compareTaskMapCodRankRows = compareTaskMapCodRankRows;
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_COD_RANKING_POLICY_VERSION = "taskmap-work-control-policy.2";
const BODY_BONUS_BY_GRADE = Object.freeze({
    C2_ATTRIBUTION_CANDIDATE: 300,
    C3_CAUSAL_HYPOTHESIS: 500,
    C4_VALIDATED_PATTERN: 800,
});
exports.TASKMAP_COD_RANKING_POLICY_V2 = Object.freeze({
    contractVersion: exports.TASKMAP_COD_RANKING_POLICY_VERSION,
    scoreScale: "integer_basis_points",
    rounding: "nearest_integer_half_up",
    formula: "cost_of_delay_divided_by_sqrt_effort",
    scoreCapBasisPoints: 10_000,
    effortFloor: 1,
    bodyBonusCapBasisPoints: 800,
    bodyBonusByGrade: BODY_BONUS_BY_GRADE,
    tieBreak: "score_desc_then_code_point_task_id",
});
exports.TASKMAP_COD_RANKING_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)(exports.TASKMAP_COD_RANKING_POLICY_V2);
const MAX_TASK_ID_LENGTH = 512;
const CONTROL_CHARACTER = /\p{Cc}/u;
function fail(message) {
    throw new TypeError(`Task Map policy.2 scoring: ${message}`);
}
function assertTaskId(taskId) {
    if (typeof taskId !== "string"
        || taskId.trim().length === 0
        || taskId.length > MAX_TASK_ID_LENGTH
        || CONTROL_CHARACTER.test(taskId)) {
        fail("taskId must be a bounded nonempty identifier");
    }
}
function assertSafeNonnegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        fail(`${label} must be a safe finite nonnegative integer`);
    }
}
function roundNearestIntegerHalfUp(value) {
    return Math.floor(value + 0.5);
}
function scoreTaskMapCodTask(input) {
    assertTaskId(input.taskId);
    assertSafeNonnegativeInteger(input.costOfDelayBasisPoints, "costOfDelayBasisPoints");
    if (!Number.isFinite(input.effort)
        || input.effort < exports.TASKMAP_COD_RANKING_POLICY_V2.effortFloor) {
        fail(`effort must be finite and at least ${exports.TASKMAP_COD_RANKING_POLICY_V2.effortFloor}`);
    }
    assertSafeNonnegativeInteger(input.bodyBonusBasisPoints, "bodyBonusBasisPoints");
    const roundedQuotient = roundNearestIntegerHalfUp(input.costOfDelayBasisPoints / Math.sqrt(input.effort));
    const costOfDelay = Math.min(exports.TASKMAP_COD_RANKING_POLICY_V2.scoreCapBasisPoints, input.costOfDelayBasisPoints);
    const cappedRoundedQuotient = Math.min(exports.TASKMAP_COD_RANKING_POLICY_V2.scoreCapBasisPoints, roundedQuotient);
    const effortDamping = Math.max(0, costOfDelay - cappedRoundedQuotient);
    const bodyBonus = Math.min(exports.TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints, input.bodyBonusBasisPoints);
    const reasonCodes = [];
    if (cappedRoundedQuotient > 0) {
        reasonCodes.push("cost_of_delay");
    }
    if (effortDamping > 0 && cappedRoundedQuotient > 0) {
        reasonCodes.push("effort_damping");
    }
    if (bodyBonus > 0) {
        reasonCodes.push("body_context_not_causal");
    }
    return {
        taskId: input.taskId,
        scoreBasisPoints: costOfDelay - effortDamping + bodyBonus,
        contributionBasisPoints: {
            costOfDelay,
            effortDamping,
            bodyBonus,
        },
        reasonCodes,
    };
}
function compareTaskMapCodRankRows(left, right) {
    return right.scoreBasisPoints - left.scoreBasisPoints
        || compareUnicodeScalars(left.taskId, right.taskId);
}
function compareUnicodeScalars(left, right) {
    const leftScalars = Array.from(left);
    const rightScalars = Array.from(right);
    const sharedLength = Math.min(leftScalars.length, rightScalars.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = leftScalars[index].codePointAt(0)
            - rightScalars[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftScalars.length - rightScalars.length;
}
