import {
  compareTaskMapCodRankRows,
  scoreTaskMapCodTask,
  TASKMAP_COD_RANKING_POLICY_DIGEST,
  TASKMAP_COD_RANKING_POLICY_VERSION,
  type TaskMapCodRankReasonCode,
} from "./cod-ranking-policy.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  buildTaskMapTaskRankingPublication,
  TASKMAP_TASK_RANKING_MAX_BYTES,
  type TaskMapTaskRankingCoverageV1,
  type TaskMapTaskRankingRowV1,
  type TaskMapTaskRankingSourceStatus,
} from "./task-ranking-publication.js";
import type {
  TaskMapCitation,
  TaskMapProjectionV1,
} from "./types.js";
import {
  TASKMAP_WORK_CONTROL_POLICY_DIGEST,
  TASKMAP_WORK_CONTROL_POLICY_VERSION,
} from "./work-control-decision.js";

export const TASKMAP_COD_RANKING_PUBLICATION_VERSION =
  "taskmap-task-ranking.v2" as const;
export const TASKMAP_COD_RANKING_FILENAME =
  "taskmap-task-ranking.v2.json" as const;

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

export interface TaskMapCodRankingPolicy1RowV2
  extends TaskMapTaskRankingRowV1 {
  policyVersion: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
  policyDigest: string;
}

export type TaskMapCodRankingRowV2 =
  | TaskMapCodRankingPolicy2RowV2
  | TaskMapCodRankingPolicy1RowV2;

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
    version:
      | typeof TASKMAP_COD_RANKING_POLICY_VERSION
      | typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
    digest: string;
  };
  fallback:
    | { applied: false; reason: null }
    | { applied: true; reason: "required_factor_unavailable" };
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

type PublicationCore = Omit<TaskMapCodRankingPublicationV2, "artifactDigest">;

const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const FACTOR_KEYS = Object.freeze([
  "taskId",
  "costOfDelayBasisPoints",
  "effort",
] as const);
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
] as const);
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
] as const);

function fail(message: string): never {
  throw new TypeError(`Task Map policy.2 ranking publication: ${message}`);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(stableCompare);
  const wanted = [...expected].sort(stableCompare);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys are invalid`);
  }
}

function validTaskId(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 512
    && !CONTROL_CHARACTER.test(value);
}

function validCostOfDelay(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function validEffort(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 1);
}

function normalizeFactors(
  factors: readonly TaskMapCodRankingRequiredFactorsV2[],
  rankedTaskIds: ReadonlySet<string>,
  maximumRows: number,
): Map<string, TaskMapCodRankingRequiredFactorsV2> {
  if (!Array.isArray(factors) || factors.length > maximumRows) {
    fail("factor collection exceeds its bounded contract");
  }
  const normalized = new Map<string, TaskMapCodRankingRequiredFactorsV2>();
  for (const [index, factor] of factors.entries()) {
    if (!plainObject(factor)) fail(`factor ${index} is invalid`);
    assertExactKeys(factor, FACTOR_KEYS, `factor ${index}`);
    if (
      !validTaskId(factor.taskId)
      || !rankedTaskIds.has(factor.taskId)
      || !validCostOfDelay(factor.costOfDelayBasisPoints)
      || !validEffort(factor.effort)
      || normalized.has(factor.taskId)
    ) {
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

function bodyBonusBasisPoints(value: number, taskId: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${taskId} body bonus must be a finite unit-interval factor`);
  }
  return Math.floor(value * 10_000 + 0.5);
}

function coreFor(input: BuildTaskMapCodRankingPublicationInputV2): PublicationCore {
  if (!plainObject(input)) fail("input is invalid");
  if (!plainObject(input.projection) || !Array.isArray(input.projection.tasks)) {
    fail("projection candidate set is invalid");
  }

  // Decide availability over the complete accepted-open candidate set before
  // invoking either scorer. This makes whole-run fallback structural: no v2
  // row can be produced before the single policy choice exists.
  const candidateTaskIds = new Set(
    input.projection.tasks
      .filter((task) => task.reviewState === "accepted" && task.openState === "open")
      .map((task) => task.id),
  );
  const factors = normalizeFactors(
    input.factors,
    candidateTaskIds,
    input.projection.tasks.length,
  );
  const requiredFactorsAvailable = [...candidateTaskIds].every((taskId) => {
    const factor = factors.get(taskId);
    return factor !== undefined
      && factor.costOfDelayBasisPoints !== null
      && factor.effort !== null;
  });

  // This unchanged v1 builder is the authority for accepted-open membership,
  // projection binding, coverage, citations, and privacy. The v2 envelope is
  // additive and cannot relax any of those checks.
  const policy1 = buildTaskMapTaskRankingPublication({
    projection: input.projection,
    ownerScopeDigest: input.ownerScopeDigest,
    sourceStatuses: input.sourceStatuses,
  });
  const rankedTaskIds = new Set(policy1.rankedAcceptedOpen.map((row) => row.taskId));
  if (
    rankedTaskIds.size !== candidateTaskIds.size
    || [...rankedTaskIds].some((taskId) => !candidateTaskIds.has(taskId))
  ) {
    fail("accepted-open candidate set disagrees with the v1 authority");
  }

  let policy: PublicationCore["policy"];
  let fallback: PublicationCore["fallback"];
  let rankedAcceptedOpen: TaskMapCodRankingRowV2[];
  if (!requiredFactorsAvailable) {
    policy = {
      version: TASKMAP_WORK_CONTROL_POLICY_VERSION,
      digest: TASKMAP_WORK_CONTROL_POLICY_DIGEST,
    };
    fallback = {
      applied: true,
      reason: "required_factor_unavailable",
    };
    rankedAcceptedOpen = policy1.rankedAcceptedOpen.map((row) => ({
      ...structuredClone(row),
      policyVersion: TASKMAP_WORK_CONTROL_POLICY_VERSION,
      policyDigest: TASKMAP_WORK_CONTROL_POLICY_DIGEST,
    }));
  } else {
    policy = {
      version: TASKMAP_COD_RANKING_POLICY_VERSION,
      digest: TASKMAP_COD_RANKING_POLICY_DIGEST,
    };
    fallback = { applied: false, reason: null };
    const taskById = new Map(
      input.projection.tasks.map((task) => [task.id, task]),
    );
    rankedAcceptedOpen = policy1.rankedAcceptedOpen.map((baseRow) => {
      const factor = factors.get(baseRow.taskId)!;
      const task = taskById.get(baseRow.taskId);
      if (task === undefined) fail("ranked task is missing from the projection");
      const factorInputs = {
        costOfDelayBasisPoints: factor.costOfDelayBasisPoints!,
        effort: factor.effort!,
        bodyBonusBasisPoints: bodyBonusBasisPoints(
          task.score.bodyBonus,
          task.id,
        ),
      };
      const score = scoreTaskMapCodTask({
        taskId: baseRow.taskId,
        ...factorInputs,
      });
      return {
        rank: 0,
        taskId: score.taskId,
        projectionRowDigest: baseRow.projectionRowDigest,
        policyVersion: TASKMAP_COD_RANKING_POLICY_VERSION,
        policyDigest: TASKMAP_COD_RANKING_POLICY_DIGEST,
        factorInputs,
        scoreBasisPoints: score.scoreBasisPoints,
        contributionBasisPoints: score.contributionBasisPoints,
        reasonCodes: score.reasonCodes,
        citations: structuredClone(baseRow.citations),
      } satisfies TaskMapCodRankingPolicy2RowV2;
    }).sort(compareTaskMapCodRankRows)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  return {
    contractVersion: TASKMAP_COD_RANKING_PUBLICATION_VERSION,
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

function sealedPublication(core: PublicationCore): TaskMapCodRankingPublicationV2 {
  const result = {
    ...core,
    artifactDigest: taskMapContractDigest(core),
  };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_TASK_RANKING_MAX_BYTES
  ) {
    fail("artifact size exceeds its bounded contract");
  }
  return result;
}

export function buildTaskMapCodRankingPublication(
  input: BuildTaskMapCodRankingPublicationInputV2,
): TaskMapCodRankingPublicationV2 {
  return sealedPublication(coreFor(input));
}

export function validateTaskMapCodRankingPublication(
  value: unknown,
  input: BuildTaskMapCodRankingPublicationInputV2,
): TaskMapCodRankingPublicationV2 {
  if (!plainObject(value)) fail("document shape is invalid");
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
  if (
    value.contractVersion !== TASKMAP_COD_RANKING_PUBLICATION_VERSION
    || typeof value.artifactDigest !== "string"
    || !SHA256.test(value.artifactDigest)
    || !plainObject(value.policy)
    || !plainObject(value.fallback)
    || !Array.isArray(value.rankedAcceptedOpen)
  ) {
    fail("document binding is invalid");
  }
  assertExactKeys(value.policy, ["version", "digest"], "policy");
  assertExactKeys(value.fallback, ["applied", "reason"], "fallback");
  const expectedRowKeys = value.policy.version === TASKMAP_COD_RANKING_POLICY_VERSION
    ? POLICY2_ROW_KEYS
    : POLICY1_ROW_KEYS;
  for (const [index, row] of value.rankedAcceptedOpen.entries()) {
    if (!plainObject(row)) fail(`ranking row ${index} is invalid`);
    assertExactKeys(row, expectedRowKeys, `ranking row ${index}`);
  }
  const { artifactDigest: _artifactDigest, ...suppliedCore } = value;
  if (taskMapContractDigest(suppliedCore) !== value.artifactDigest) {
    fail("artifact digest is invalid");
  }

  const expected = buildTaskMapCodRankingPublication(input);
  if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(expected)) {
    fail("canonical projection and ranking mismatch");
  }
  return structuredClone(expected);
}
