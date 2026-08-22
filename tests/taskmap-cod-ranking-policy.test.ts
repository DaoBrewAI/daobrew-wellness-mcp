import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASKMAP_COD_RANKING_POLICY_DIGEST,
  TASKMAP_COD_RANKING_POLICY_V2,
  TASKMAP_COD_RANKING_POLICY_VERSION,
  compareTaskMapCodRankRows,
  scoreTaskMapCodTask,
} from "../src/engine/taskmap/cod-ranking-policy.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";

describe("Task Map policy.2 CoD scoring", () => {
  it("scores costOfDelay divided by sqrt(effort) in integer basis points", () => {
    const row = scoreTaskMapCodTask({
      taskId: "tmt_a",
      costOfDelayBasisPoints: 10_000,
      effort: 4,
      bodyBonusBasisPoints: 0,
    });

    assert.deepEqual(row, {
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

  it("damps effort noise: 4x effort halves the score, not quarters it", () => {
    const small = scoreTaskMapCodTask({
      taskId: "a",
      costOfDelayBasisPoints: 8_000,
      effort: 1,
      bodyBonusBasisPoints: 0,
    });
    const large = scoreTaskMapCodTask({
      taskId: "b",
      costOfDelayBasisPoints: 8_000,
      effort: 4,
      bodyBonusBasisPoints: 0,
    });

    assert.equal(large.scoreBasisPoints, Math.round(small.scoreBasisPoints / 2));
  });

  it("caps the body bonus and adds it only after the quotient", () => {
    const row = scoreTaskMapCodTask({
      taskId: "tmt_a",
      costOfDelayBasisPoints: 10_000,
      effort: 4,
      bodyBonusBasisPoints: 5_000,
    });

    assert.equal(
      row.contributionBasisPoints.bodyBonus,
      TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints,
    );
    assert.equal(row.scoreBasisPoints, 5_800);
    assert.deepEqual(row.reasonCodes, [
      "cost_of_delay",
      "effort_damping",
      "body_context_not_causal",
    ]);
  });

  it("preserves the exact graded body scale and ceiling", () => {
    assert.deepEqual(TASKMAP_COD_RANKING_POLICY_V2.bodyBonusByGrade, {
      C2_ATTRIBUTION_CANDIDATE: 300,
      C3_CAUSAL_HYPOTHESIS: 500,
      C4_VALIDATED_PATTERN: 800,
    });
    assert.equal(TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints, 800);
  });

  it("is deterministic and float-free for 7777 divided by sqrt(3)", () => {
    const input = {
      taskId: "a",
      costOfDelayBasisPoints: 7_777,
      effort: 3,
      bodyBonusBasisPoints: 0,
    };
    const once = scoreTaskMapCodTask(input);
    const twice = scoreTaskMapCodTask(input);

    assert.deepEqual(once, twice);
    assert.equal(once.scoreBasisPoints, 4_490);
    assert.ok(Number.isInteger(once.scoreBasisPoints));
    assert.ok(Object.values(once.contributionBasisPoints).every(Number.isInteger));
  });

  it("rounds an exact positive half up", () => {
    const row = scoreTaskMapCodTask({
      taskId: "half",
      costOfDelayBasisPoints: 1,
      effort: 4,
      bodyBonusBasisPoints: 0,
    });

    assert.equal(row.scoreBasisPoints, 1);
    assert.equal(row.contributionBasisPoints.effortDamping, 0);
    assert.deepEqual(row.reasonCodes, ["cost_of_delay"]);
  });

  it("does not explain a cost-of-delay contribution rounded down to zero", () => {
    const row = scoreTaskMapCodTask({
      taskId: "rounded-away",
      costOfDelayBasisPoints: 1,
      effort: Number.MAX_VALUE,
      bodyBonusBasisPoints: 0,
    });

    assert.deepEqual(row.contributionBasisPoints, {
      costOfDelay: 1,
      effortDamping: 1,
      bodyBonus: 0,
    });
    assert.equal(
      row.scoreBasisPoints,
      row.contributionBasisPoints.costOfDelay
        - row.contributionBasisPoints.effortDamping
        + row.contributionBasisPoints.bodyBonus,
    );
    assert.equal(row.scoreBasisPoints, 0);
    assert.deepEqual(row.reasonCodes, []);
  });

  it("caps the quotient before adding the capped body bonus", () => {
    const row = scoreTaskMapCodTask({
      taskId: "cap-order",
      costOfDelayBasisPoints: 20_000,
      effort: 1,
      bodyBonusBasisPoints: 1_000,
    });

    assert.equal(row.contributionBasisPoints.costOfDelay, 10_000);
    assert.equal(row.contributionBasisPoints.effortDamping, 0);
    assert.equal(row.contributionBasisPoints.bodyBonus, 800);
    assert.equal(
      row.scoreBasisPoints,
      row.contributionBasisPoints.costOfDelay
        - row.contributionBasisPoints.effortDamping
        + row.contributionBasisPoints.bodyBonus,
    );
    assert.equal(row.scoreBasisPoints, 10_800);
  });

  it("accepts a finite fractional effort while keeping stored values integer", () => {
    const row = scoreTaskMapCodTask({
      taskId: "fractional-effort",
      costOfDelayBasisPoints: 9_000,
      effort: 2.25,
      bodyBonusBasisPoints: 0,
    });

    assert.equal(row.scoreBasisPoints, 6_000);
    assert.ok(Object.values(row.contributionBasisPoints).every(Number.isInteger));
  });

  it("rejects zero, negative, or non-finite effort", () => {
    for (const effort of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => scoreTaskMapCodTask({
          taskId: "a",
          costOfDelayBasisPoints: 100,
          effort,
          bodyBonusBasisPoints: 0,
        }),
        /effort/,
      );
    }
  });

  it("names the scoring contract in typed validation failures", () => {
    assert.throws(
      () => scoreTaskMapCodTask({
        taskId: "a",
        costOfDelayBasisPoints: 100,
        effort: 0,
        bodyBonusBasisPoints: 0,
      }),
      {
        name: "TypeError",
        message: /^Task Map policy\.2 scoring: effort must be finite and at least 1$/,
      },
    );
  });

  it("rejects basis-point inputs outside safe finite nonnegative integers", () => {
    for (const costOfDelayBasisPoints of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_VALUE,
    ]) {
      assert.throws(
        () => scoreTaskMapCodTask({
          taskId: "a",
          costOfDelayBasisPoints,
          effort: 1,
          bodyBonusBasisPoints: 0,
        }),
        /costOfDelayBasisPoints.*safe finite nonnegative integer/,
      );
    }
    for (const bodyBonusBasisPoints of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_VALUE,
    ]) {
      assert.throws(
        () => scoreTaskMapCodTask({
          taskId: "a",
          costOfDelayBasisPoints: 100,
          effort: 1,
          bodyBonusBasisPoints,
        }),
        /bodyBonusBasisPoints.*safe finite nonnegative integer/,
      );
    }
  });

  it("accepts the explicit safe-integer ceiling and caps stored contributions", () => {
    const row = scoreTaskMapCodTask({
      taskId: "safe-ceiling",
      costOfDelayBasisPoints: Number.MAX_SAFE_INTEGER,
      effort: 1,
      bodyBonusBasisPoints: Number.MAX_SAFE_INTEGER,
    });

    assert.deepEqual(row.contributionBasisPoints, {
      costOfDelay: 10_000,
      effortDamping: 0,
      bodyBonus: 800,
    });
    assert.equal(row.scoreBasisPoints, 10_800);
  });

  it("requires a bounded nonempty task id", () => {
    for (const taskId of ["", "   ", "x".repeat(513)]) {
      assert.throws(
        () => scoreTaskMapCodTask({
          taskId,
          costOfDelayBasisPoints: 100,
          effort: 1,
          bodyBonusBasisPoints: 0,
        }),
        /taskId/,
      );
    }
    assert.equal(
      scoreTaskMapCodTask({
        taskId: "x".repeat(512),
        costOfDelayBasisPoints: 0,
        effort: 1,
        bodyBonusBasisPoints: 0,
      }).taskId.length,
      512,
    );
  });

  it("rejects control characters in otherwise nonempty task ids", () => {
    for (const taskId of ["nul\u0000task", "c1\u0085task"]) {
      assert.throws(
        () => scoreTaskMapCodTask({
          taskId,
          costOfDelayBasisPoints: 100,
          effort: 1,
          bodyBonusBasisPoints: 0,
        }),
        /taskId/,
      );
    }
  });

  it("exports the complete deeply frozen policy and canonical digest", () => {
    assert.equal(
      TASKMAP_COD_RANKING_POLICY_VERSION,
      "taskmap-work-control-policy.2",
    );
    assert.deepEqual(TASKMAP_COD_RANKING_POLICY_V2, {
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
    assert.ok(Object.isFrozen(TASKMAP_COD_RANKING_POLICY_V2));
    assert.ok(Object.isFrozen(TASKMAP_COD_RANKING_POLICY_V2.bodyBonusByGrade));
    assert.match(TASKMAP_COD_RANKING_POLICY_DIGEST, /^[a-f0-9]{64}$/);
    assert.equal(
      TASKMAP_COD_RANKING_POLICY_DIGEST,
      taskMapContractDigest(TASKMAP_COD_RANKING_POLICY_V2),
    );
  });

  it("orders by descending score then code-point task id", () => {
    const rows = [
      { taskId: "a", scoreBasisPoints: 100 },
      { taskId: "B", scoreBasisPoints: 100 },
      { taskId: "z", scoreBasisPoints: 200 },
    ].sort(compareTaskMapCodRankRows);

    assert.deepEqual(rows.map((row) => row.taskId), ["z", "B", "a"]);
  });

  it("orders astral and BMP task ids by Unicode scalar value", () => {
    const astral = "\u{10000}";
    const privateUseBmp = "\u{E000}";
    const rows = [
      { taskId: astral, scoreBasisPoints: 100 },
      { taskId: privateUseBmp, scoreBasisPoints: 100 },
    ].sort(compareTaskMapCodRankRows);

    assert.deepEqual(rows.map((row) => row.taskId), [privateUseBmp, astral]);
  });
});
