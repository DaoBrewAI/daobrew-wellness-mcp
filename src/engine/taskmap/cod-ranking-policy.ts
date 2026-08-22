import { taskMapContractDigest } from "./source-contracts.js";

export const TASKMAP_COD_RANKING_POLICY_VERSION =
  "taskmap-work-control-policy.2" as const;

const BODY_BONUS_BY_GRADE = Object.freeze({
  C2_ATTRIBUTION_CANDIDATE: 300,
  C3_CAUSAL_HYPOTHESIS: 500,
  C4_VALIDATED_PATTERN: 800,
} as const);

export const TASKMAP_COD_RANKING_POLICY_V2 = Object.freeze({
  contractVersion: TASKMAP_COD_RANKING_POLICY_VERSION,
  scoreScale: "integer_basis_points",
  rounding: "nearest_integer_half_up",
  formula: "cost_of_delay_divided_by_sqrt_effort",
  scoreCapBasisPoints: 10_000,
  effortFloor: 1,
  bodyBonusCapBasisPoints: 800,
  bodyBonusByGrade: BODY_BONUS_BY_GRADE,
  tieBreak: "score_desc_then_code_point_task_id",
} as const);

export const TASKMAP_COD_RANKING_POLICY_DIGEST = taskMapContractDigest(
  TASKMAP_COD_RANKING_POLICY_V2,
);

export type TaskMapCodRankReasonCode =
  | "cost_of_delay"
  | "effort_damping"
  | "body_context_not_causal";

export interface TaskMapCodScoreInput {
  taskId: string;
  costOfDelayBasisPoints: number;
  effort: number;
  bodyBonusBasisPoints: number;
}

export interface TaskMapCodScoreRow {
  taskId: string;
  scoreBasisPoints: number;
  /**
   * Additive accounting invariant:
   * scoreBasisPoints = costOfDelay - effortDamping + bodyBonus.
   */
  contributionBasisPoints: {
    costOfDelay: number;
    effortDamping: number;
    bodyBonus: number;
  };
  reasonCodes: TaskMapCodRankReasonCode[];
}

export interface TaskMapCodComparableRankRow {
  taskId: string;
  scoreBasisPoints: number;
}

const MAX_TASK_ID_LENGTH = 512;
const CONTROL_CHARACTER = /\p{Cc}/u;

function fail(message: string): never {
  throw new TypeError(`Task Map policy.2 scoring: ${message}`);
}

function assertTaskId(taskId: unknown): asserts taskId is string {
  if (
    typeof taskId !== "string"
    || taskId.trim().length === 0
    || taskId.length > MAX_TASK_ID_LENGTH
    || CONTROL_CHARACTER.test(taskId)
  ) {
    fail("taskId must be a bounded nonempty identifier");
  }
}

function assertSafeNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a safe finite nonnegative integer`);
  }
}

function roundNearestIntegerHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function scoreTaskMapCodTask(
  input: TaskMapCodScoreInput,
): TaskMapCodScoreRow {
  assertTaskId(input.taskId);
  assertSafeNonnegativeInteger(
    input.costOfDelayBasisPoints,
    "costOfDelayBasisPoints",
  );
  if (
    !Number.isFinite(input.effort)
    || input.effort < TASKMAP_COD_RANKING_POLICY_V2.effortFloor
  ) {
    fail(
      `effort must be finite and at least ${TASKMAP_COD_RANKING_POLICY_V2.effortFloor}`,
    );
  }
  assertSafeNonnegativeInteger(
    input.bodyBonusBasisPoints,
    "bodyBonusBasisPoints",
  );

  const roundedQuotient = roundNearestIntegerHalfUp(
    input.costOfDelayBasisPoints / Math.sqrt(input.effort),
  );
  const costOfDelay = Math.min(
    TASKMAP_COD_RANKING_POLICY_V2.scoreCapBasisPoints,
    input.costOfDelayBasisPoints,
  );
  const cappedRoundedQuotient = Math.min(
    TASKMAP_COD_RANKING_POLICY_V2.scoreCapBasisPoints,
    roundedQuotient,
  );
  const effortDamping = Math.max(0, costOfDelay - cappedRoundedQuotient);
  const bodyBonus = Math.min(
    TASKMAP_COD_RANKING_POLICY_V2.bodyBonusCapBasisPoints,
    input.bodyBonusBasisPoints,
  );
  const reasonCodes: TaskMapCodRankReasonCode[] = [];
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

export function compareTaskMapCodRankRows(
  left: TaskMapCodComparableRankRow,
  right: TaskMapCodComparableRankRow,
): number {
  return right.scoreBasisPoints - left.scoreBasisPoints
    || compareUnicodeScalars(left.taskId, right.taskId);
}

function compareUnicodeScalars(left: string, right: string): number {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftScalars[index]!.codePointAt(0)!
      - rightScalars[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}
