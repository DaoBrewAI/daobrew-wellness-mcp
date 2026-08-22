import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_OUTCOME_REWARD_VERSION =
  "taskmap-outcome-reward.v1" as const;
export const TASKMAP_REWARD_STAGES = Object.freeze([
  "approved",
  "started",
  "artifact",
  "source",
  "verified",
] as const);
export const TASKMAP_PREFERENCE_PAIR_THRESHOLD = 300 as const;
export const TASKMAP_OUTCOME_REWARD_LIMITS_V1 = Object.freeze({
  maxBodyBonusBasisPoints: 10_000,
  maxPreferencePairs: 1_000_000_000,
  maxArtifactBytes: 16 * 1_024,
} as const);

export type TaskMapRewardStageV1 = typeof TASKMAP_REWARD_STAGES[number];
export type TaskMapRewardReasonCodeV1 =
  | "outcome_not_verified"
  | "verified_lifecycle_disposition";

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
  reasonCode:
    | "insufficient_verified_preference_pairs"
    | "offline_proof_required";
}

type OutcomeRewardCore = Omit<TaskMapOutcomeRewardV1, "artifactDigest">;

const INPUT_KEYS = Object.freeze([
  "stage",
  "clicked",
  "bodyBonusBasisPoints",
] as const);
const PREFERENCE_INPUT_KEYS = Object.freeze(["preferencePairs"] as const);
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
] as const);
const ATTENTION_KEYS = Object.freeze(["clicked"] as const);
const CAUSAL_BACKDOOR_KEYS = Object.freeze([
  "clickUsedAsValue",
  "bodySignalUsed",
] as const);
const AUTHORITY_KEYS = Object.freeze([
  "orderingChanged",
  "eligibilityChanged",
  "executionGranted",
  "sourceCompletionChanged",
  "deterministicRankingReplaced",
] as const);
const PRIVACY_KEYS = Object.freeze([
  "sourceBodiesStored",
  "localPathsStored",
  "rawOwnerIdentifiersStored",
  "rawSourceObjectIdentifiersStored",
  "rawBiometricsStored",
  "connectorSecretsStored",
] as const);
const SHA256 = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new TypeError(`Task Map outcome reward: ${message}`);
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

function assertOnlyKnownKeys(
  value: Record<string, unknown>,
  known: readonly string[],
  label: string,
): void {
  const allowed = new Set(known);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    fail(`${label} keys are invalid`);
  }
}

function validStage(value: unknown): value is TaskMapRewardStageV1 {
  return typeof value === "string"
    && (TASKMAP_REWARD_STAGES as readonly string[]).includes(value);
}

function normalizeInput(
  input: BuildTaskMapOutcomeRewardInputV1,
): { stage: TaskMapRewardStageV1; clicked: boolean } {
  if (!plainObject(input)) fail("input is invalid");
  assertOnlyKnownKeys(input, INPUT_KEYS, "input");
  if (!validStage(input.stage)) fail("stage is invalid");
  if (input.clicked !== undefined && typeof input.clicked !== "boolean") {
    fail("clicked state is invalid");
  }
  if (
    input.bodyBonusBasisPoints !== undefined
    && (
      !Number.isSafeInteger(input.bodyBonusBasisPoints)
      || input.bodyBonusBasisPoints < 0
      || input.bodyBonusBasisPoints
        > TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxBodyBonusBasisPoints
    )
  ) {
    fail("body bonus basis points are invalid or exceed their bounded contract");
  }
  return { stage: input.stage, clicked: input.clicked ?? false };
}

function coreFor(input: BuildTaskMapOutcomeRewardInputV1): OutcomeRewardCore {
  const { stage, clicked } = normalizeInput(input);
  const verified = stage === "verified";
  return {
    contractVersion: TASKMAP_OUTCOME_REWARD_VERSION,
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

function seal(core: OutcomeRewardCore): TaskMapOutcomeRewardV1 {
  const result = { ...core, artifactDigest: taskMapContractDigest(core) };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxArtifactBytes
  ) {
    fail("artifact size exceeds its bounded contract");
  }
  return result;
}

function assertArtifactShape(value: Record<string, unknown>): void {
  assertExactKeys(value, DOCUMENT_KEYS, "document");
  if (
    value.contractVersion !== TASKMAP_OUTCOME_REWARD_VERSION
    || typeof value.artifactDigest !== "string"
    || !SHA256.test(value.artifactDigest)
    || !validStage(value.stage)
  ) {
    fail("document binding or stage is invalid");
  }
  const verified = value.stage === "verified";
  if (
    value.reward !== (verified ? 1 : 0)
    || value.rewardReasonCode !== (
      verified ? "verified_lifecycle_disposition" : "outcome_not_verified"
    )
    || value.bodyEnteredReward !== false
  ) {
    fail("reward staging is invalid");
  }

  if (!plainObject(value.attention)) fail("attention block is invalid");
  assertExactKeys(value.attention, ATTENTION_KEYS, "attention");
  if (typeof value.attention.clicked !== "boolean") {
    fail("attention block is invalid");
  }

  const causalBackdoor = value.causalBackdoor;
  if (!plainObject(causalBackdoor)) fail("causal backdoor block is invalid");
  assertExactKeys(causalBackdoor, CAUSAL_BACKDOOR_KEYS, "causal backdoor");
  if (CAUSAL_BACKDOOR_KEYS.some((key) => causalBackdoor[key] !== false)) {
    fail("causal backdoor block is not fail closed");
  }

  const authority = value.authority;
  if (!plainObject(authority)) fail("authority block is invalid");
  assertExactKeys(authority, AUTHORITY_KEYS, "authority");
  if (AUTHORITY_KEYS.some((key) => authority[key] !== false)) {
    fail("authority block is not fail closed");
  }

  const privacy = value.privacy;
  if (!plainObject(privacy)) fail("privacy block is invalid");
  assertExactKeys(privacy, PRIVACY_KEYS, "privacy");
  if (PRIVACY_KEYS.some((key) => privacy[key] !== false)) {
    fail("privacy block is not fail closed");
  }
}

export function buildTaskMapOutcomeReward(
  input: BuildTaskMapOutcomeRewardInputV1,
): TaskMapOutcomeRewardV1 {
  return seal(coreFor(input));
}

export function validateTaskMapOutcomeReward(
  value: unknown,
  input: BuildTaskMapOutcomeRewardInputV1,
): TaskMapOutcomeRewardV1 {
  if (!plainObject(value)) fail("document shape is invalid");
  assertArtifactShape(value);
  const { artifactDigest: _artifactDigest, ...core } = value;
  if (taskMapContractDigest(core) !== value.artifactDigest) {
    fail("artifact digest is invalid");
  }
  const expected = buildTaskMapOutcomeReward(input);
  if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(expected)) {
    fail("canonical reward mismatch");
  }
  return structuredClone(expected);
}

export function taskMapPreferenceLearningStatus(
  input: TaskMapPreferenceLearningStatusInputV1,
): Readonly<TaskMapPreferenceLearningStatusV1> {
  if (!plainObject(input)) fail("preference input is invalid");
  assertExactKeys(input, PREFERENCE_INPUT_KEYS, "input");
  if (
    !Number.isSafeInteger(input.preferencePairs)
    || input.preferencePairs < 0
    || input.preferencePairs > TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxPreferencePairs
  ) {
    fail("preference pair count is invalid or exceeds its bounded contract");
  }
  const eligible = input.preferencePairs >= TASKMAP_PREFERENCE_PAIR_THRESHOLD;
  return Object.freeze({
    mode: eligible ? "shadow_eligible" : "shadow_only",
    preferencePairs: input.preferencePairs,
    requiredPairs: TASKMAP_PREFERENCE_PAIR_THRESHOLD,
    replacesDeterministicRanking: false,
    onlineLearnerEnabled: false,
    promotionRequiresOfflineProof: true,
    reasonCode: eligible
      ? "offline_proof_required"
      : "insufficient_verified_preference_pairs",
  });
}
