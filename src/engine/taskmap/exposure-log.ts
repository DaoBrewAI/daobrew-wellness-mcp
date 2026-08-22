import {
  TASKMAP_COD_RANKING_POLICY_DIGEST,
  TASKMAP_COD_RANKING_POLICY_VERSION,
} from "./cod-ranking-policy.js";
import {
  validateTaskMapCodRankingPublication,
  type BuildTaskMapCodRankingPublicationInputV2,
  type TaskMapCodRankingPublicationV2,
} from "./cod-ranking-publication.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_WORK_CONTROL_POLICY_DIGEST,
  TASKMAP_WORK_CONTROL_POLICY_VERSION,
} from "./work-control-decision.js";

export const TASKMAP_EXPOSURE_LOG_VERSION = "taskmap-exposure-log.v1" as const;
export const TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS =
  "deterministic_display_probability.v1" as const;
export const TASKMAP_EXPOSURE_LOG_LIMITS_V1 = Object.freeze({
  maxCandidates: 4_096,
  maxDisplayedCount: 512,
  maxTaskIdCharacters: 512,
  maxArtifactBytes: 2 * 1_024 * 1_024,
} as const);

export type TaskMapExposurePolicyIdentityV1 =
  | {
      version: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
      digest: string;
    }
  | {
      version: typeof TASKMAP_COD_RANKING_POLICY_VERSION;
      digest: string;
    };

export interface TaskMapExposureProjectionBindingV1 {
  contractVersion: string;
  runId: string;
  inputDigest: string;
  projectionDigest: string;
}

export interface TaskMapExposureCandidateV1 {
  taskId: string;
  pinned: boolean;
}

export interface BuildTaskMapExposureLogInputV1 {
  candidates: readonly TaskMapExposureCandidateV1[];
  displayedCount: number;
  rankingPublication: TaskMapCodRankingPublicationV2;
  rankingInput: BuildTaskMapCodRankingPublicationInputV2;
}

export interface TaskMapExposureEntryV1 {
  taskId: string;
  displayPosition: number | null;
  /** Deterministic display probability; zero rows are candidate negatives, not IPS observations. */
  propensity: number | null;
  pinned: boolean;
  /** Preference-pair eligibility only. Consumers must not divide by a zero propensity. */
  eligibleForTraining: boolean;
}

export interface TaskMapExposureLogV1 {
  contractVersion: typeof TASKMAP_EXPOSURE_LOG_VERSION;
  artifactDigest: string;
  ownerScopeDigest: string;
  sourceRankingArtifactDigest: string;
  projection: TaskMapExposureProjectionBindingV1;
  policy: TaskMapExposurePolicyIdentityV1;
  propensitySemantics: typeof TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS;
  entries: TaskMapExposureEntryV1[];
  authority: {
    orderingChanged: false;
    eligibilityChanged: false;
    learnedRankingApplied: false;
    pinnedRowsUsedForTraining: false;
    executionGranted: false;
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

type ExposureLogCore = Omit<TaskMapExposureLogV1, "artifactDigest">;

const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const INPUT_KEYS = Object.freeze([
  "candidates",
  "displayedCount",
  "rankingPublication",
  "rankingInput",
] as const);
const PROJECTION_KEYS = Object.freeze([
  "contractVersion",
  "runId",
  "inputDigest",
  "projectionDigest",
] as const);
const POLICY_KEYS = Object.freeze(["version", "digest"] as const);
const CANDIDATE_KEYS = Object.freeze(["taskId", "pinned"] as const);
const ENTRY_KEYS = Object.freeze([
  "taskId",
  "displayPosition",
  "propensity",
  "pinned",
  "eligibleForTraining",
] as const);
const AUTHORITY_KEYS = Object.freeze([
  "orderingChanged",
  "eligibilityChanged",
  "learnedRankingApplied",
  "pinnedRowsUsedForTraining",
  "executionGranted",
] as const);
const PRIVACY_KEYS = Object.freeze([
  "sourceBodiesStored",
  "localPathsStored",
  "rawOwnerIdentifiersStored",
  "rawSourceObjectIdentifiersStored",
  "rawBiometricsStored",
  "connectorSecretsStored",
] as const);
const DOCUMENT_KEYS = Object.freeze([
  "contractVersion",
  "artifactDigest",
  "ownerScopeDigest",
  "sourceRankingArtifactDigest",
  "projection",
  "policy",
  "propensitySemantics",
  "entries",
  "authority",
  "privacy",
] as const);

function fail(message: string): never {
  throw new TypeError(`Task Map exposure log: ${message}`);
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

function validOpaque(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxTaskIdCharacters
    && value === value.trim()
    && !CONTROL_CHARACTER.test(value);
}

function assertPolicy(value: unknown): asserts value is TaskMapExposurePolicyIdentityV1 {
  if (!plainObject(value)) fail("policy identity is invalid");
  assertExactKeys(value, POLICY_KEYS, "policy");
  const validPolicy1 =
    value.version === TASKMAP_WORK_CONTROL_POLICY_VERSION
    && value.digest === TASKMAP_WORK_CONTROL_POLICY_DIGEST;
  const validPolicy2 =
    value.version === TASKMAP_COD_RANKING_POLICY_VERSION
    && value.digest === TASKMAP_COD_RANKING_POLICY_DIGEST;
  if (!validPolicy1 && !validPolicy2) fail("policy identity is invalid");
}

function assertProjection(
  value: unknown,
): asserts value is TaskMapExposureProjectionBindingV1 {
  if (!plainObject(value)) fail("projection binding is invalid");
  assertExactKeys(value, PROJECTION_KEYS, "projection");
  if (
    !validOpaque(value.contractVersion)
    || !validOpaque(value.runId)
    || typeof value.inputDigest !== "string"
    || !SHA256.test(value.inputDigest)
    || typeof value.projectionDigest !== "string"
    || !SHA256.test(value.projectionDigest)
  ) {
    fail("projection binding is invalid");
  }
}

function normalizeInput(
  input: BuildTaskMapExposureLogInputV1,
): {
  candidates: TaskMapExposureCandidateV1[];
  displayedCount: number;
  rankingPublication: TaskMapCodRankingPublicationV2;
} {
  if (!plainObject(input)) fail("input is invalid");
  assertExactKeys(input, INPUT_KEYS, "input");
  if (
    !Array.isArray(input.candidates)
    || input.candidates.length > TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxCandidates
  ) {
    fail("candidate collection exceeds its bounded contract");
  }
  if (
    !Number.isSafeInteger(input.displayedCount)
    || input.displayedCount < 0
    || input.displayedCount > input.candidates.length
    || input.displayedCount > TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount
  ) {
    fail("displayed count is invalid or exceeds its bounded contract");
  }

  const seen = new Set<string>();
  const candidates = input.candidates.map((candidate, index) => {
    if (!plainObject(candidate)) fail(`candidate ${index} is invalid`);
    assertExactKeys(candidate, CANDIDATE_KEYS, `candidate ${index}`);
    if (!validOpaque(candidate.taskId)) fail(`candidate ${index} task id is invalid`);
    if (typeof candidate.pinned !== "boolean") fail(`candidate ${index} pinned state is invalid`);
    if (seen.has(candidate.taskId)) fail(`candidate ${index} is duplicate`);
    seen.add(candidate.taskId);
    return { taskId: candidate.taskId, pinned: candidate.pinned };
  });

  const rankingPublication = validateTaskMapCodRankingPublication(
    input.rankingPublication,
    input.rankingInput,
  );
  if (
    rankingPublication.rankedAcceptedOpen.length !== candidates.length
    || rankingPublication.rankedAcceptedOpen.some(
      (row, index) => row.taskId !== candidates[index]!.taskId,
    )
  ) {
    fail("candidate order must exactly match the validated ranking publication");
  }

  return {
    candidates,
    displayedCount: input.displayedCount,
    rankingPublication,
  };
}

function coreFor(input: BuildTaskMapExposureLogInputV1): ExposureLogCore {
  const normalized = normalizeInput(input);
  return {
    contractVersion: TASKMAP_EXPOSURE_LOG_VERSION,
    ownerScopeDigest: normalized.rankingPublication.ownerScopeDigest,
    sourceRankingArtifactDigest: normalized.rankingPublication.artifactDigest,
    projection: structuredClone(normalized.rankingPublication.projection),
    policy: structuredClone(normalized.rankingPublication.policy),
    propensitySemantics: TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS,
    entries: normalized.candidates.map((candidate, index) => {
      const displayed = index < normalized.displayedCount;
      return {
        taskId: candidate.taskId,
        displayPosition: displayed ? index + 1 : null,
        propensity: candidate.pinned ? null : displayed ? 1 : 0,
        pinned: candidate.pinned,
        // The complete non-pinned candidate set remains eligible so later
        // offline training can use non-displayed rows as preference negatives.
        eligibleForTraining: !candidate.pinned,
      };
    }),
    authority: {
      orderingChanged: false,
      eligibilityChanged: false,
      learnedRankingApplied: false,
      pinnedRowsUsedForTraining: false,
      executionGranted: false,
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

function seal(core: ExposureLogCore): TaskMapExposureLogV1 {
  const result = { ...core, artifactDigest: taskMapContractDigest(core) };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxArtifactBytes
  ) {
    fail("artifact size exceeds its bounded contract");
  }
  return result;
}

function assertArtifactShape(value: Record<string, unknown>): void {
  assertExactKeys(value, DOCUMENT_KEYS, "document");
  if (
    value.contractVersion !== TASKMAP_EXPOSURE_LOG_VERSION
    || typeof value.artifactDigest !== "string"
    || !SHA256.test(value.artifactDigest)
    || typeof value.ownerScopeDigest !== "string"
    || !SHA256.test(value.ownerScopeDigest)
    || typeof value.sourceRankingArtifactDigest !== "string"
    || !SHA256.test(value.sourceRankingArtifactDigest)
    || value.propensitySemantics !== TASKMAP_EXPOSURE_PROPENSITY_SEMANTICS
  ) {
    fail("document binding is invalid");
  }
  assertProjection(value.projection);
  assertPolicy(value.policy);
  if (!Array.isArray(value.entries) || value.entries.length > TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxCandidates) {
    fail("entry collection exceeds its bounded contract");
  }
  let undisplayedSeen = false;
  const seen = new Set<string>();
  let displayedCount = 0;
  for (const [index, entry] of value.entries.entries()) {
    if (!plainObject(entry)) fail(`entry ${index} is invalid`);
    assertExactKeys(entry, ENTRY_KEYS, `entry ${index}`);
    if (!validOpaque(entry.taskId)) fail(`entry ${index} task id is invalid`);
    if (seen.has(entry.taskId)) fail(`entry ${index} is duplicate`);
    seen.add(entry.taskId);
    if (typeof entry.pinned !== "boolean" || typeof entry.eligibleForTraining !== "boolean") {
      fail(`entry ${index} flags are invalid`);
    }
    if (entry.displayPosition === null) {
      undisplayedSeen = true;
      if (entry.pinned ? entry.propensity !== null : entry.propensity !== 0) {
        fail(`entry ${index} propensity is invalid`);
      }
    } else {
      displayedCount += 1;
      if (
        undisplayedSeen
        || !Number.isSafeInteger(entry.displayPosition)
        || entry.displayPosition !== index + 1
        || displayedCount > TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount
      ) {
        fail(`entry ${index} display order is invalid`);
      }
      if (entry.pinned ? entry.propensity !== null : entry.propensity !== 1) {
        fail(`entry ${index} propensity is invalid`);
      }
    }
    if (entry.eligibleForTraining !== !entry.pinned) {
      fail(`entry ${index} training eligibility is invalid`);
    }
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

export function buildTaskMapExposureLog(
  input: BuildTaskMapExposureLogInputV1,
): TaskMapExposureLogV1 {
  return seal(coreFor(input));
}

export function validateTaskMapExposureLog(
  value: unknown,
  input: BuildTaskMapExposureLogInputV1,
): TaskMapExposureLogV1 {
  if (!plainObject(value)) fail("document shape is invalid");
  assertArtifactShape(value);
  const { artifactDigest: _artifactDigest, ...core } = value;
  if (taskMapContractDigest(core) !== value.artifactDigest) {
    fail("artifact digest is invalid");
  }
  const expected = buildTaskMapExposureLog(input);
  if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(expected)) {
    fail("canonical decision-time exposure mismatch");
  }
  return structuredClone(expected);
}
