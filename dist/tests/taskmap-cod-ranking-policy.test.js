"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const cod_ranking_policy_js_1 = require("../src/engine/taskmap/cod-ranking-policy.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
(0, node_test_1.describe)("Task Map policy.2 CoD scoring", () => {
    (0, node_test_1.it)("scores costOfDelay divided by sqrt(effort) in integer basis points", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "tmt_a",
            costOfDelayBasisPoints: 10_000,
            effort: 4,
            bodyBonusBasisPoints: 0,
        });
        strict_1.default.deepEqual(row, {
            taskId: "tmt_a",
            scoreBasisPoints: 5_000,
            contributionBasisPoints: {
                costOfDelay: 10_000,
                effortDamping: 5_000,
                bodyBonus: 0,
            },
            reasonCodes: ["cost_of_delay", "effort_damping"],
        });
    });
    (0, node_test_1.it)("damps effort noise: 4x effort halves the score, not quarters it", () => {
        const small = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "a",
            costOfDelayBasisPoints: 8_000,
            effort: 1,
            bodyBonusBasisPoints: 0,
        });
        const large = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "b",
            costOfDelayBasisPoints: 8_000,
            effort: 4,
            bodyBonusBasisPoints: 0,
        });
        strict_1.default.equal(large.scoreBasisPoints, Math.round(small.scoreBasisPoints / 2));
    });
    (0, node_test_1.it)("caps the body bonus and adds it only after the quotient", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "tmt_a",
            costOfDelayBasisPoints: 10_000,
            effort: 4,
            bodyBonusBasisPoints: 5_000,
        });
        strict_1.default.equal(row.contributionBasisPoints.bodyBonus, cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints);
        strict_1.default.equal(row.scoreBasisPoints, 5_800);
        strict_1.default.deepEqual(row.reasonCodes, [
            "cost_of_delay",
            "effort_damping",
            "body_context_not_causal",
        ]);
    });
    (0, node_test_1.it)("preserves the exact graded body scale and ceiling", () => {
        strict_1.default.deepEqual(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2.bodyBonusByGrade, {
            C2_ATTRIBUTION_CANDIDATE: 300,
            C3_CAUSAL_HYPOTHESIS: 500,
            C4_VALIDATED_PATTERN: 800,
        });
        strict_1.default.equal(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints, 800);
    });
    (0, node_test_1.it)("is deterministic and float-free for 7777 divided by sqrt(3)", () => {
        const input = {
            taskId: "a",
            costOfDelayBasisPoints: 7_777,
            effort: 3,
            bodyBonusBasisPoints: 0,
        };
        const once = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)(input);
        const twice = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)(input);
        strict_1.default.deepEqual(once, twice);
        strict_1.default.equal(once.scoreBasisPoints, 4_490);
        strict_1.default.ok(Number.isInteger(once.scoreBasisPoints));
        strict_1.default.ok(Object.values(once.contributionBasisPoints).every(Number.isInteger));
    });
    (0, node_test_1.it)("rounds an exact positive half up", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "half",
            costOfDelayBasisPoints: 1,
            effort: 4,
            bodyBonusBasisPoints: 0,
        });
        strict_1.default.equal(row.scoreBasisPoints, 1);
        strict_1.default.equal(row.contributionBasisPoints.effortDamping, 0);
        strict_1.default.deepEqual(row.reasonCodes, ["cost_of_delay"]);
    });
    (0, node_test_1.it)("does not explain a cost-of-delay contribution rounded down to zero", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "rounded-away",
            costOfDelayBasisPoints: 1,
            effort: Number.MAX_VALUE,
            bodyBonusBasisPoints: 0,
        });
        strict_1.default.deepEqual(row.contributionBasisPoints, {
            costOfDelay: 1,
            effortDamping: 1,
            bodyBonus: 0,
        });
        strict_1.default.equal(row.scoreBasisPoints, row.contributionBasisPoints.costOfDelay
            - row.contributionBasisPoints.effortDamping
            + row.contributionBasisPoints.bodyBonus);
        strict_1.default.equal(row.scoreBasisPoints, 0);
        strict_1.default.deepEqual(row.reasonCodes, []);
    });
    (0, node_test_1.it)("caps the quotient before adding the capped body bonus", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "cap-order",
            costOfDelayBasisPoints: 20_000,
            effort: 1,
            bodyBonusBasisPoints: 1_000,
        });
        strict_1.default.equal(row.contributionBasisPoints.costOfDelay, 10_000);
        strict_1.default.equal(row.contributionBasisPoints.effortDamping, 0);
        strict_1.default.equal(row.contributionBasisPoints.bodyBonus, 800);
        strict_1.default.equal(row.scoreBasisPoints, row.contributionBasisPoints.costOfDelay
            - row.contributionBasisPoints.effortDamping
            + row.contributionBasisPoints.bodyBonus);
        strict_1.default.equal(row.scoreBasisPoints, 10_800);
    });
    (0, node_test_1.it)("accepts a finite fractional effort while keeping stored values integer", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "fractional-effort",
            costOfDelayBasisPoints: 9_000,
            effort: 2.25,
            bodyBonusBasisPoints: 0,
        });
        strict_1.default.equal(row.scoreBasisPoints, 6_000);
        strict_1.default.ok(Object.values(row.contributionBasisPoints).every(Number.isInteger));
    });
    (0, node_test_1.it)("rejects zero, negative, or non-finite effort", () => {
        for (const effort of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId: "a",
                costOfDelayBasisPoints: 100,
                effort,
                bodyBonusBasisPoints: 0,
            }), /effort/);
        }
    });
    (0, node_test_1.it)("names the scoring contract in typed validation failures", () => {
        strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "a",
            costOfDelayBasisPoints: 100,
            effort: 0,
            bodyBonusBasisPoints: 0,
        }), {
            name: "TypeError",
            message: /^Task Map policy\.2 scoring: effort must be finite and at least 1$/,
        });
    });
    (0, node_test_1.it)("rejects basis-point inputs outside safe finite nonnegative integers", () => {
        for (const costOfDelayBasisPoints of [
            -1,
            0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.MAX_SAFE_INTEGER + 1,
            Number.MAX_VALUE,
        ]) {
            strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId: "a",
                costOfDelayBasisPoints,
                effort: 1,
                bodyBonusBasisPoints: 0,
            }), /costOfDelayBasisPoints.*safe finite nonnegative integer/);
        }
        for (const bodyBonusBasisPoints of [
            -1,
            0.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.MAX_SAFE_INTEGER + 1,
            Number.MAX_VALUE,
        ]) {
            strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId: "a",
                costOfDelayBasisPoints: 100,
                effort: 1,
                bodyBonusBasisPoints,
            }), /bodyBonusBasisPoints.*safe finite nonnegative integer/);
        }
    });
    (0, node_test_1.it)("accepts the explicit safe-integer ceiling and caps stored contributions", () => {
        const row = (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "safe-ceiling",
            costOfDelayBasisPoints: Number.MAX_SAFE_INTEGER,
            effort: 1,
            bodyBonusBasisPoints: Number.MAX_SAFE_INTEGER,
        });
        strict_1.default.deepEqual(row.contributionBasisPoints, {
            costOfDelay: 10_000,
            effortDamping: 0,
            bodyBonus: 800,
        });
        strict_1.default.equal(row.scoreBasisPoints, 10_800);
    });
    (0, node_test_1.it)("requires a bounded nonempty task id", () => {
        for (const taskId of ["", "   ", "x".repeat(513)]) {
            strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId,
                costOfDelayBasisPoints: 100,
                effort: 1,
                bodyBonusBasisPoints: 0,
            }), /taskId/);
        }
        strict_1.default.equal((0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
            taskId: "x".repeat(512),
            costOfDelayBasisPoints: 0,
            effort: 1,
            bodyBonusBasisPoints: 0,
        }).taskId.length, 512);
    });
    (0, node_test_1.it)("rejects control characters in otherwise nonempty task ids", () => {
        for (const taskId of ["nul\u0000task", "c1\u0085task"]) {
            strict_1.default.throws(() => (0, cod_ranking_policy_js_1.scoreTaskMapCodTask)({
                taskId,
                costOfDelayBasisPoints: 100,
                effort: 1,
                bodyBonusBasisPoints: 0,
            }), /taskId/);
        }
    });
    (0, node_test_1.it)("exports the complete deeply frozen policy and canonical digest", () => {
        strict_1.default.equal(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION, "taskmap-work-control-policy.2");
        strict_1.default.deepEqual(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2, {
            contractVersion: "taskmap-work-control-policy.2",
            scoreScale: "integer_basis_points",
            rounding: "nearest_integer_half_up",
            formula: "cost_of_delay_divided_by_sqrt_effort",
            scoreCapBasisPoints: 10_000,
            effortFloor: 1,
            bodyBonusCapBasisPoints: 800,
            bodyBonusByGrade: {
                C2_ATTRIBUTION_CANDIDATE: 300,
                C3_CAUSAL_HYPOTHESIS: 500,
                C4_VALIDATED_PATTERN: 800,
            },
            tieBreak: "score_desc_then_code_point_task_id",
        });
        strict_1.default.ok(Object.isFrozen(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2));
        strict_1.default.ok(Object.isFrozen(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2.bodyBonusByGrade));
        strict_1.default.match(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST, /^[a-f0-9]{64}$/);
        strict_1.default.equal(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST, (0, source_contracts_js_1.taskMapContractDigest)(cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_V2));
    });
    (0, node_test_1.it)("orders by descending score then code-point task id", () => {
        const rows = [
            { taskId: "a", scoreBasisPoints: 100 },
            { taskId: "B", scoreBasisPoints: 100 },
            { taskId: "z", scoreBasisPoints: 200 },
        ].sort(cod_ranking_policy_js_1.compareTaskMapCodRankRows);
        strict_1.default.deepEqual(rows.map((row) => row.taskId), ["z", "B", "a"]);
    });
    (0, node_test_1.it)("orders astral and BMP task ids by Unicode scalar value", () => {
        const astral = "\u{10000}";
        const privateUseBmp = "\u{E000}";
        const rows = [
            { taskId: astral, scoreBasisPoints: 100 },
            { taskId: privateUseBmp, scoreBasisPoints: 100 },
        ].sort(cod_ranking_policy_js_1.compareTaskMapCodRankRows);
        strict_1.default.deepEqual(rows.map((row) => row.taskId), [privateUseBmp, astral]);
    });
});
