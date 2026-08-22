import type { EmbeddingProvider } from "../embeddings/provider.js";
import {
  LLM_STATION_MAX_OUTPUT_BYTES,
  LLM_STATION_TIMEOUT_MS,
  type LlmProviderId,
  type LlmStation,
  type LlmStationRunner,
} from "./llm-station.js";
import { assertTaskMapStrictJsonSyntaxAndUniqueKeys } from "./mention-extraction.js";
import { taskMapContractDigest } from "./source-contracts.js";

export const TASKMAP_IDENTITY_ADJUDICATION_VERSION =
  "taskmap-identity-adjudication.v1" as const;
export const TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION =
  "taskmap-identity-adjudication-result.v1" as const;
export const TASKMAP_IDENTITY_ADJUDICATION_STATION_ID =
  "identity-adjudication-v1" as const;

export const TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1 = Object.freeze({
  maxCandidates: 512,
  maxPairs: 2_048,
  maxTextCharacters: 512,
});

export const TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1 = Object.freeze({
  maxEvidenceItems: 512,
  maxPromptCharacters: 1_048_576,
  maxVerdicts: 2_048,
  maxOutputBytes: LLM_STATION_MAX_OUTPUT_BYTES,
});

export const TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1 = Object.freeze({
  blockThreshold: 0.82,
  autoBand: 0.95,
  embeddingDimensions: 768,
  similarity: "cosine_dot_product_l2_normalized" as const,
});

export interface TaskMapIdentityAdjudicationCandidateV1 {
  candidateId: string;
  rootId: string;
  text: string;
}

export type TaskMapIdentityAdjudicationConfidenceV1 = "high" | "ambiguous";

export interface TaskMapIdentityAdjudicationPairV1 {
  pairId: string;
  leftCandidateId: string;
  rightCandidateId: string;
  rootId: string;
  similarity: number;
  confidence: TaskMapIdentityAdjudicationConfidenceV1;
}

export interface TaskMapIdentityAdjudicationCrossRootFlagV1 {
  pairId: string;
  leftCandidateId: string;
  rightCandidateId: string;
  leftRootId: string;
  rightRootId: string;
  similarity: number;
  confidence: TaskMapIdentityAdjudicationConfidenceV1;
}

export interface TaskMapIdentityEvidenceDigestV1 {
  candidateId: string;
  rootId: string;
  textDigest: string;
}

export interface TaskMapIdentityAdjudicationProposalV1 {
  contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_VERSION;
  inputDigest: string;
  embeddingModelId: string;
  evidenceManifest: TaskMapIdentityEvidenceDigestV1[];
  policy: typeof TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1;
  blockingState: "current" | "unavailable";
  unavailableReason: "embedding_provider_failed" | null;
  candidateCount: number;
  pairs: TaskMapIdentityAdjudicationPairV1[];
  crossRootFlagged: TaskMapIdentityAdjudicationCrossRootFlagV1[];
  authority: {
    mergeApplied: false;
    aliasesWritten: false;
    requiresOwnerAcceptance: true;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
  artifactDigest: string;
}

export interface BuildTaskMapIdentityAdjudicationProposalsInputV1 {
  candidates: readonly TaskMapIdentityAdjudicationCandidateV1[];
  embeddingProvider: EmbeddingProvider;
  embeddingModelId: string;
  inputDigest: string;
}

export type TaskMapIdentityAdjudicationVerdictV1 =
  | "same_work"
  | "different_work";

export interface TaskMapIdentityAdjudicationEvidenceV1 {
  candidateId: string;
  text: string;
}

export interface TaskMapIdentityAdjudicatedPairV1
  extends TaskMapIdentityAdjudicationPairV1 {
  adjudication: TaskMapIdentityAdjudicationVerdictV1 | "deferred";
  adjudicationSource:
    | "embedding_high_confidence"
    | "llm_identity_adjudication"
    | "deferred";
  deferredReason: "llm_station_unavailable" | null;
}

export interface TaskMapIdentityAdjudicationVerdictRecordV1 {
  pairId: string;
  verdict: TaskMapIdentityAdjudicationVerdictV1 | "deferred";
  source: TaskMapIdentityAdjudicatedPairV1["adjudicationSource"];
}

export interface TaskMapIdentityAdjudicationResultV1 {
  contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION;
  inputDigest: string;
  proposalArtifactDigest: string;
  embedding: {
    modelId: string;
    dimensions: number;
    similarity: typeof TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity;
    blockThreshold: number;
    autoBand: number;
  };
  llm: {
    invocationState: "invoked" | "not_invoked" | "unavailable";
    stationId: typeof TASKMAP_IDENTITY_ADJUDICATION_STATION_ID;
    modelId: string | null;
    transport: LlmProviderId | "injected-offline" | null;
    promptDigest: string | null;
  };
  pairs: TaskMapIdentityAdjudicatedPairV1[];
  verdicts: TaskMapIdentityAdjudicationVerdictRecordV1[];
  mergeCandidates: TaskMapIdentityAdjudicatedPairV1[];
  authority: {
    mergeApplied: false;
    aliasesWritten: false;
    requiresOwnerAcceptance: true;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
  artifactDigest: string;
}

interface AdjudicateTaskMapIdentityPairsInputBaseV1 {
  proposals: TaskMapIdentityAdjudicationProposalV1;
  candidateEvidence?: readonly TaskMapIdentityAdjudicationEvidenceV1[];
}

export type AdjudicateTaskMapIdentityPairsInputV1 =
  AdjudicateTaskMapIdentityPairsInputBaseV1 & (
    | {
        station: LlmStation;
        runner?: never;
        llmModelId?: never;
      }
    | {
        station?: never;
        /** Deterministic recorded-output seam for offline tests and replay only. */
        runner: LlmStationRunner;
        /** Exact recorded/offline model identity; never inferred by the runner seam. */
        llmModelId: string;
      }
  );

const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const MAX_OPAQUE_ID_CHARACTERS = 512;
const MAX_MODEL_ID_CHARACTERS = 256;
const CANDIDATE_KEYS = Object.freeze([
  "candidateId",
  "rootId",
  "text",
] as const);

function fail(message: string): never {
  throw new TypeError(`Task Map identity adjudication proposal: ${message}`);
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

function stablePairCompare(
  left: { leftCandidateId: string; rightCandidateId: string },
  right: { leftCandidateId: string; rightCandidateId: string },
): number {
  return stableCompare(left.leftCandidateId, right.leftCandidateId)
    || stableCompare(left.rightCandidateId, right.rightCandidateId);
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

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_OPAQUE_ID_CHARACTERS
    && !CONTROL_CHARACTERS.test(value);
}

function validModelId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_MODEL_ID_CHARACTERS
    && value === value.trim()
    && !CONTROL_CHARACTERS.test(value);
}

function validProducedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = STRICT_RFC3339.exec(value);
  if (match === null || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]!
    && hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59;
}

function validateAndNormalizeCandidates(
  candidates: readonly TaskMapIdentityAdjudicationCandidateV1[],
): TaskMapIdentityAdjudicationCandidateV1[] {
  if (!Array.isArray(candidates)) fail("candidates are invalid");
  if (candidates.length > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates) {
    fail("candidate collection exceeds its bounded ceiling");
  }

  const seenCandidateIds = new Set<string>();
  const normalized = candidates.map((candidate, index) => {
    if (!plainObject(candidate)) fail(`candidate ${index} is invalid`);
    assertExactKeys(candidate, CANDIDATE_KEYS, `candidate ${index}`);
    if (
      !validOpaqueId(candidate.candidateId)
      || !validOpaqueId(candidate.rootId)
    ) {
      fail(`candidate ${index} identity is invalid`);
    }
    if (
      typeof candidate.text !== "string"
      || candidate.text.length === 0
      || candidate.text.length
        > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters
      || CONTROL_CHARACTERS.test(candidate.text)
    ) {
      fail(`candidate ${index} text exceeds its bounded contract`);
    }
    if (seenCandidateIds.has(candidate.candidateId)) {
      fail(`candidate ${index} repeats a candidate id`);
    }
    seenCandidateIds.add(candidate.candidateId);
    return {
      candidateId: candidate.candidateId,
      rootId: candidate.rootId,
      text: candidate.text,
    };
  });

  return normalized.sort((left, right) =>
    stableCompare(left.candidateId, right.candidateId));
}

function normalizedDotProduct(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("embedding dimensions are invalid");
  }
  let dotProduct = 0;
  let leftSumSquares = 0;
  let rightSumSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (
      typeof leftValue !== "number"
      || !Number.isFinite(leftValue)
      || typeof rightValue !== "number"
      || !Number.isFinite(rightValue)
    ) {
      throw new Error("embedding values are invalid");
    }
    dotProduct += leftValue * rightValue;
    leftSumSquares += leftValue * leftValue;
    rightSumSquares += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftSumSquares) * Math.sqrt(rightSumSquares);
  if (!Number.isFinite(denominator) || denominator === 0) {
    throw new Error("embedding norm is invalid");
  }
  return Math.max(-1, Math.min(1, dotProduct / denominator));
}

type ProposalBase = Omit<TaskMapIdentityAdjudicationProposalV1, "artifactDigest">;

function sealedArtifact(base: ProposalBase): TaskMapIdentityAdjudicationProposalV1 {
  return {
    ...base,
    artifactDigest: taskMapContractDigest(base),
  };
}

function baseBoundary(input: {
  inputDigest: string;
  embeddingModelId: string;
  evidenceManifest: TaskMapIdentityEvidenceDigestV1[];
  candidateCount: number;
  blockingState: "current" | "unavailable";
  unavailableReason: "embedding_provider_failed" | null;
  pairs: TaskMapIdentityAdjudicationPairV1[];
  crossRootFlagged: TaskMapIdentityAdjudicationCrossRootFlagV1[];
}): ProposalBase {
  return {
    contractVersion: TASKMAP_IDENTITY_ADJUDICATION_VERSION,
    inputDigest: input.inputDigest,
    embeddingModelId: input.embeddingModelId,
    evidenceManifest: input.evidenceManifest,
    policy: { ...TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1 },
    blockingState: input.blockingState,
    unavailableReason: input.unavailableReason,
    candidateCount: input.candidateCount,
    pairs: input.pairs,
    crossRootFlagged: input.crossRootFlagged,
    authority: {
      mergeApplied: false,
      aliasesWritten: false,
      requiresOwnerAcceptance: true,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
}

function pairId(leftCandidateId: string, rightCandidateId: string): string {
  return `tmidentitypair_${taskMapContractDigest({
    contractVersion: TASKMAP_IDENTITY_ADJUDICATION_VERSION,
    leftCandidateId,
    rightCandidateId,
  })}`;
}

export async function buildTaskMapIdentityAdjudicationProposals(
  input: BuildTaskMapIdentityAdjudicationProposalsInputV1,
): Promise<TaskMapIdentityAdjudicationProposalV1> {
  if (!plainObject(input)) fail("input is invalid");
  if (!SHA256.test(input.inputDigest)) fail("input digest is invalid");
  if (!validModelId(input.embeddingModelId)) fail("embedding model id is invalid");
  if (
    input.embeddingProvider === null
    || (
      typeof input.embeddingProvider !== "object"
      && typeof input.embeddingProvider !== "function"
    )
    || typeof input.embeddingProvider.embed !== "function"
  ) {
    fail("embedding provider is invalid");
  }

  // Complete every deterministic input and collection-bound check before the
  // provider boundary so invalid work cannot trigger an external call.
  const candidates = validateAndNormalizeCandidates(input.candidates);
  const evidenceManifest = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    rootId: candidate.rootId,
    textDigest: taskMapContractDigest(candidate.text),
  }));
  if (candidates.length < 2) {
    return sealedArtifact(baseBoundary({
      inputDigest: input.inputDigest,
      embeddingModelId: input.embeddingModelId,
      evidenceManifest,
      candidateCount: candidates.length,
      blockingState: "current",
      unavailableReason: null,
      pairs: [],
      crossRootFlagged: [],
    }));
  }

  let embeddings: number[][];
  try {
    embeddings = await input.embeddingProvider.embed(
      candidates.map((candidate) => candidate.text),
    );
    if (!Array.isArray(embeddings) || embeddings.length !== candidates.length) {
      throw new Error("embedding count is invalid");
    }
    for (const embedding of embeddings) {
      if (
        !Array.isArray(embedding)
        || embedding.length
          !== TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions
      ) {
        throw new Error("embedding dimensions do not match the frozen policy");
      }
      // Validate every vector, including vectors that never form a pair.
      normalizedDotProduct(embedding, embedding);
    }
  } catch (_error: unknown) {
    return sealedArtifact(baseBoundary({
      inputDigest: input.inputDigest,
      embeddingModelId: input.embeddingModelId,
      evidenceManifest,
      candidateCount: candidates.length,
      blockingState: "unavailable",
      unavailableReason: "embedding_provider_failed",
      pairs: [],
      crossRootFlagged: [],
    }));
  }

  const pairs: TaskMapIdentityAdjudicationPairV1[] = [];
  const crossRootFlagged: TaskMapIdentityAdjudicationCrossRootFlagV1[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];
    const leftEmbedding = embeddings[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const right = candidates[rightIndex];
      const similarity = normalizedDotProduct(
        leftEmbedding,
        embeddings[rightIndex],
      );
      if (similarity < TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold) {
        continue;
      }
      if (
        pairs.length + crossRootFlagged.length
        >= TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxPairs
      ) {
        fail("pair collection exceeds its bounded ceiling");
      }
      const confidence = similarity
        >= TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
        ? "high" as const
        : "ambiguous" as const;
      const normalizedPairId = pairId(left.candidateId, right.candidateId);
      if (left.rootId !== right.rootId) {
        crossRootFlagged.push({
          pairId: normalizedPairId,
          leftCandidateId: left.candidateId,
          rightCandidateId: right.candidateId,
          leftRootId: left.rootId,
          rightRootId: right.rootId,
          similarity,
          confidence,
        });
        continue;
      }
      pairs.push({
        pairId: normalizedPairId,
        leftCandidateId: left.candidateId,
        rightCandidateId: right.candidateId,
        rootId: left.rootId,
        similarity,
        confidence,
      });
    }
  }

  pairs.sort(stablePairCompare);
  crossRootFlagged.sort(stablePairCompare);
  return sealedArtifact(baseBoundary({
    inputDigest: input.inputDigest,
    embeddingModelId: input.embeddingModelId,
    evidenceManifest,
    candidateCount: candidates.length,
    blockingState: "current",
    unavailableReason: null,
    pairs,
    crossRootFlagged,
  }));
}

const EVIDENCE_KEYS = Object.freeze(["candidateId", "text"] as const);
const PROPOSAL_KEYS = Object.freeze([
  "contractVersion",
  "inputDigest",
  "embeddingModelId",
  "evidenceManifest",
  "policy",
  "blockingState",
  "unavailableReason",
  "candidateCount",
  "pairs",
  "crossRootFlagged",
  "authority",
  "privacy",
  "artifactDigest",
] as const);
const PROPOSAL_PAIR_KEYS = Object.freeze([
  "pairId",
  "leftCandidateId",
  "rightCandidateId",
  "rootId",
  "similarity",
  "confidence",
] as const);
const CROSS_ROOT_FLAG_KEYS = Object.freeze([
  "pairId",
  "leftCandidateId",
  "rightCandidateId",
  "leftRootId",
  "rightRootId",
  "similarity",
  "confidence",
] as const);
const EVIDENCE_MANIFEST_KEYS = Object.freeze([
  "candidateId",
  "rootId",
  "textDigest",
] as const);
const POLICY_KEYS = Object.freeze([
  "blockThreshold",
  "autoBand",
  "embeddingDimensions",
  "similarity",
] as const);
const AUTHORITY_KEYS = Object.freeze([
  "mergeApplied",
  "aliasesWritten",
  "requiresOwnerAcceptance",
] as const);
const PRIVACY_KEYS = Object.freeze([
  "sourceBodiesStored",
  "localPathsStored",
  "rawBiometricsStored",
] as const);
const LLM_OUTPUT_KEYS = Object.freeze(["verdicts"] as const);
const LLM_VERDICT_KEYS = Object.freeze(["pairId", "verdict"] as const);
const LLM_ENVELOPE_KEYS = Object.freeze([
  "stationId",
  "model",
  "promptDigest",
  "inputDigest",
  "outputJson",
  "producedAt",
  "transport",
] as const);

function validateProposalForAdjudication(
  proposal: TaskMapIdentityAdjudicationProposalV1,
): void {
  if (!plainObject(proposal)) fail("adjudication proposal is invalid");
  assertExactKeys(proposal, PROPOSAL_KEYS, "adjudication proposal");
  if (
    proposal.contractVersion !== TASKMAP_IDENTITY_ADJUDICATION_VERSION
    || !SHA256.test(proposal.inputDigest)
    || !Number.isSafeInteger(proposal.candidateCount)
    || proposal.candidateCount < 0
    || proposal.candidateCount > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates
    || !Array.isArray(proposal.evidenceManifest)
    || !Array.isArray(proposal.pairs)
    || !Array.isArray(proposal.crossRootFlagged)
  ) {
    fail("adjudication proposal contract is invalid");
  }
  if (!plainObject(proposal.policy)) fail("adjudication policy is invalid");
  assertExactKeys(proposal.policy, POLICY_KEYS, "adjudication policy");
  if (
    proposal.policy.blockThreshold
      !== TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
    || proposal.policy.autoBand
      !== TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
    || proposal.policy.embeddingDimensions
      !== TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions
    || proposal.policy.similarity
      !== TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity
  ) {
    fail("adjudication policy is not canonical");
  }
  if (!plainObject(proposal.authority)) fail("adjudication authority is invalid");
  assertExactKeys(proposal.authority, AUTHORITY_KEYS, "adjudication authority");
  if (
    proposal.authority.mergeApplied !== false
    || proposal.authority.aliasesWritten !== false
    || proposal.authority.requiresOwnerAcceptance !== true
  ) {
    fail("adjudication authority is not canonical");
  }
  if (!plainObject(proposal.privacy)) fail("adjudication privacy is invalid");
  assertExactKeys(proposal.privacy, PRIVACY_KEYS, "adjudication privacy");
  if (
    proposal.privacy.sourceBodiesStored !== false
    || proposal.privacy.localPathsStored !== false
    || proposal.privacy.rawBiometricsStored !== false
  ) {
    fail("adjudication privacy is not canonical");
  }
  if (
    proposal.evidenceManifest.length !== proposal.candidateCount
    || proposal.evidenceManifest.length
      > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates
    || proposal.pairs.length + proposal.crossRootFlagged.length
      > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxPairs
  ) {
    fail("adjudication proposal collections exceed their bounded contract");
  }
  if (proposal.blockingState === "unavailable") {
    if (
      proposal.unavailableReason !== "embedding_provider_failed"
      || proposal.pairs.length !== 0
      || proposal.crossRootFlagged.length !== 0
    ) {
      fail("unavailable adjudication proposal is inconsistent");
    }
  } else if (
    proposal.blockingState !== "current"
    || proposal.unavailableReason !== null
  ) {
    fail("current adjudication proposal is inconsistent");
  }

  const candidateRoots = new Map<string, string>();
  let previousCandidateId: string | undefined;
  for (const [index, evidence] of proposal.evidenceManifest.entries()) {
    if (!plainObject(evidence)) fail(`evidence manifest ${index} is invalid`);
    assertExactKeys(evidence, EVIDENCE_MANIFEST_KEYS, `evidence manifest ${index}`);
    if (
      !validOpaqueId(evidence.candidateId)
      || !validOpaqueId(evidence.rootId)
      || typeof evidence.textDigest !== "string"
      || !SHA256.test(evidence.textDigest)
      || (
        previousCandidateId !== undefined
        && stableCompare(previousCandidateId, evidence.candidateId) >= 0
      )
    ) {
      fail(`evidence manifest ${index} is invalid or unsorted`);
    }
    previousCandidateId = evidence.candidateId;
    candidateRoots.set(evidence.candidateId, evidence.rootId);
  }

  const seenPairIds = new Set<string>();
  let previousPair: TaskMapIdentityAdjudicationPairV1 | undefined;
  for (const [index, pair] of proposal.pairs.entries()) {
    if (!plainObject(pair)) {
      fail(`adjudication proposal pair ${index} is invalid`);
    }
    assertExactKeys(pair, PROPOSAL_PAIR_KEYS, `adjudication proposal pair ${index}`);
    if (
      !validOpaqueId(pair.pairId)
      || !validOpaqueId(pair.leftCandidateId)
      || !validOpaqueId(pair.rightCandidateId)
      || !validOpaqueId(pair.rootId)
      || pair.leftCandidateId >= pair.rightCandidateId
      || typeof pair.similarity !== "number"
      || !Number.isFinite(pair.similarity)
      || pair.similarity < TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
      || pair.similarity > 1
      || (pair.confidence !== "ambiguous" && pair.confidence !== "high")
      || pair.pairId !== pairId(pair.leftCandidateId, pair.rightCandidateId)
      || pair.confidence !== (
        pair.similarity >= TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
          ? "high"
          : "ambiguous"
      )
      || candidateRoots.get(pair.leftCandidateId) !== pair.rootId
      || candidateRoots.get(pair.rightCandidateId) !== pair.rootId
      || (previousPair !== undefined && stablePairCompare(previousPair, pair) >= 0)
    ) {
      fail(`adjudication proposal pair ${index} is invalid`);
    }
    if (seenPairIds.has(pair.pairId)) {
      fail(`adjudication proposal pair ${index} repeats a pair id`);
    }
    seenPairIds.add(pair.pairId);
    previousPair = pair;
  }

  let previousCrossRoot: TaskMapIdentityAdjudicationCrossRootFlagV1 | undefined;
  for (const [index, flag] of proposal.crossRootFlagged.entries()) {
    if (!plainObject(flag)) fail(`cross-root flag ${index} is invalid`);
    assertExactKeys(flag, CROSS_ROOT_FLAG_KEYS, `cross-root flag ${index}`);
    if (
      !validOpaqueId(flag.pairId)
      || !validOpaqueId(flag.leftCandidateId)
      || !validOpaqueId(flag.rightCandidateId)
      || !validOpaqueId(flag.leftRootId)
      || !validOpaqueId(flag.rightRootId)
      || flag.leftCandidateId >= flag.rightCandidateId
      || flag.leftRootId === flag.rightRootId
      || typeof flag.similarity !== "number"
      || !Number.isFinite(flag.similarity)
      || flag.similarity < TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold
      || flag.similarity > 1
      || (flag.confidence !== "ambiguous" && flag.confidence !== "high")
      || flag.pairId !== pairId(flag.leftCandidateId, flag.rightCandidateId)
      || flag.confidence !== (
        flag.similarity >= TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand
          ? "high"
          : "ambiguous"
      )
      || candidateRoots.get(flag.leftCandidateId) !== flag.leftRootId
      || candidateRoots.get(flag.rightCandidateId) !== flag.rightRootId
      || (
        previousCrossRoot !== undefined
        && stablePairCompare(previousCrossRoot, flag) >= 0
      )
      || seenPairIds.has(flag.pairId)
    ) {
      fail(`cross-root flag ${index} is invalid`);
    }
    seenPairIds.add(flag.pairId);
    previousCrossRoot = flag;
  }

  if (
    !validModelId(proposal.embeddingModelId)
    || !SHA256.test(proposal.artifactDigest)
  ) {
    fail("adjudication proposal provenance is invalid");
  }
  const { artifactDigest: _artifactDigest, ...base } = proposal;
  if (taskMapContractDigest(base) !== proposal.artifactDigest) {
    fail("adjudication proposal digest is invalid");
  }
}

function evidenceForAmbiguousPairs(
  ambiguousPairs: readonly TaskMapIdentityAdjudicationPairV1[],
  evidence: readonly TaskMapIdentityAdjudicationEvidenceV1[] | undefined,
  manifest: readonly TaskMapIdentityEvidenceDigestV1[],
): TaskMapIdentityAdjudicationEvidenceV1[] {
  if (!Array.isArray(evidence)) throw new Error("candidate evidence is unavailable");
  if (evidence.length > TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxEvidenceItems) {
    throw new Error("candidate evidence exceeds its bounded ceiling");
  }
  const required = new Set(
    ambiguousPairs.flatMap((pair) => [pair.leftCandidateId, pair.rightCandidateId]),
  );
  const manifestByCandidateId = new Map(
    manifest.map((item) => [item.candidateId, item.textDigest]),
  );
  const byCandidateId = new Map<string, TaskMapIdentityAdjudicationEvidenceV1>();
  for (const [index, item] of evidence.entries()) {
    if (!plainObject(item)) throw new Error(`candidate evidence ${index} is invalid`);
    assertExactKeys(item, EVIDENCE_KEYS, `candidate evidence ${index}`);
    if (
      !validOpaqueId(item.candidateId)
      || typeof item.text !== "string"
      || item.text.length === 0
      || item.text.length > TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters
      || CONTROL_CHARACTERS.test(item.text)
      || byCandidateId.has(item.candidateId)
      || manifestByCandidateId.get(item.candidateId)
        !== taskMapContractDigest(item.text)
    ) {
      throw new Error(`candidate evidence ${index} is invalid`);
    }
    byCandidateId.set(item.candidateId, {
      candidateId: item.candidateId,
      text: item.text,
    });
  }
  const selected = [...required]
    .sort(stableCompare)
    .map((candidateId) => {
      const item = byCandidateId.get(candidateId);
      if (item === undefined) throw new Error("candidate evidence is incomplete");
      return item;
    });
  return selected;
}

function buildIdentityAdjudicationPrompt(
  ambiguousPairs: readonly TaskMapIdentityAdjudicationPairV1[],
  evidence: readonly TaskMapIdentityAdjudicationEvidenceV1[],
): string {
  const prompt = JSON.stringify({
    stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
    instructions: [
      "Decide whether each pair identifies the same concrete unit of work.",
      "Return strict JSON only, with exactly one verdict per supplied pair.",
      "Use verdict same_work only when the evidence denotes one work identity; otherwise use different_work.",
    ],
    outputSchema: {
      verdicts: [{ pairId: "string", verdict: "same_work|different_work" }],
    },
    candidateEvidence: evidence,
    pairs: ambiguousPairs.map((pair) => ({
      pairId: pair.pairId,
      leftCandidateId: pair.leftCandidateId,
      rightCandidateId: pair.rightCandidateId,
      rootId: pair.rootId,
      similarity: pair.similarity,
    })),
  });
  if (
    prompt.length === 0
    || prompt.length > TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxPromptCharacters
  ) {
    throw new Error("identity adjudication prompt exceeds its bounded ceiling");
  }
  return prompt;
}

function validateVerdicts(
  outputJson: string,
  ambiguousPairs: readonly TaskMapIdentityAdjudicationPairV1[],
): Map<string, TaskMapIdentityAdjudicationVerdictV1> {
  if (
    typeof outputJson !== "string"
    || Buffer.byteLength(outputJson, "utf8")
      > TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxOutputBytes
  ) {
    throw new Error("identity adjudication output exceeds its bounded ceiling");
  }
  const trimmed = outputJson.trim();
  assertTaskMapStrictJsonSyntaxAndUniqueKeys(trimmed);
  const parsed: unknown = JSON.parse(trimmed);
  if (!plainObject(parsed)) throw new Error("identity adjudication output is invalid");
  assertExactKeys(parsed, LLM_OUTPUT_KEYS, "identity adjudication output");
  if (
    !Array.isArray(parsed.verdicts)
    || parsed.verdicts.length !== ambiguousPairs.length
    || parsed.verdicts.length
      > TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxVerdicts
  ) {
    throw new Error("identity adjudication verdict collection is invalid");
  }
  const expectedPairIds = new Set(ambiguousPairs.map((pair) => pair.pairId));
  const verdicts = new Map<string, TaskMapIdentityAdjudicationVerdictV1>();
  for (const [index, value] of parsed.verdicts.entries()) {
    if (!plainObject(value)) throw new Error(`identity verdict ${index} is invalid`);
    assertExactKeys(value, LLM_VERDICT_KEYS, `identity verdict ${index}`);
    if (
      typeof value.pairId !== "string"
      || !expectedPairIds.has(value.pairId)
      || verdicts.has(value.pairId)
      || (value.verdict !== "same_work" && value.verdict !== "different_work")
    ) {
      throw new Error(`identity verdict ${index} is invalid`);
    }
    verdicts.set(value.pairId, value.verdict);
  }
  if (verdicts.size !== expectedPairIds.size) {
    throw new Error("identity adjudication verdicts are incomplete");
  }
  return verdicts;
}

async function runOfflineIdentityAdjudication(
  runner: LlmStationRunner,
  prompt: string,
  ambiguousPairs: readonly TaskMapIdentityAdjudicationPairV1[],
): Promise<Map<string, TaskMapIdentityAdjudicationVerdictV1>> {
  if (typeof runner !== "function") throw new Error("LLM runner is unavailable");
  const abortController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(new Error("identity adjudication runner timed out"));
    }, LLM_STATION_TIMEOUT_MS);
  });
  timer?.unref();
  try {
    const result = await Promise.race([
      runner({
        executable: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
        args: Object.freeze([]),
        stdin: prompt,
        timeoutMs: LLM_STATION_TIMEOUT_MS,
        signal: abortController.signal,
      }),
      timeout,
    ]);
    if (
      !plainObject(result)
      || result.exitCode !== 0
      || typeof result.stdout !== "string"
      || typeof result.stderr !== "string"
      || Buffer.byteLength(result.stderr, "utf8")
        > TASKMAP_IDENTITY_ADJUDICATION_LLM_LIMITS_V1.maxOutputBytes
    ) {
      throw new Error("identity adjudication runner result is invalid");
    }
    return validateVerdicts(result.stdout, ambiguousPairs);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function validLlmTransport(value: unknown): value is LlmProviderId {
  return value === "claude-cli"
    || value === "codex-cli"
    || value === "cursor-cli"
    || value === "gemini-remote";
}

async function runStationIdentityAdjudication(
  station: LlmStation,
  prompt: string,
  inputDigest: string,
  ambiguousPairs: readonly TaskMapIdentityAdjudicationPairV1[],
): Promise<{
  verdicts: Map<string, TaskMapIdentityAdjudicationVerdictV1>;
  modelId: string;
  transport: LlmProviderId;
}> {
  const expectedPromptDigest = taskMapContractDigest(prompt);
  const envelope = await station.run({
    stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
    promptText: prompt,
    inputDigest,
  });
  if (!plainObject(envelope)) throw new Error("LLM station envelope is invalid");
  assertExactKeys(envelope, LLM_ENVELOPE_KEYS, "LLM station envelope");
  if (
    envelope.stationId !== TASKMAP_IDENTITY_ADJUDICATION_STATION_ID
    || envelope.inputDigest !== inputDigest
    || envelope.promptDigest !== expectedPromptDigest
    || typeof envelope.outputJson !== "string"
    || !validModelId(envelope.model)
    || !validLlmTransport(envelope.transport)
    || envelope.transport !== station.provider.transport
    || !validProducedAt(envelope.producedAt)
  ) {
    throw new Error("LLM station envelope does not match its request");
  }
  return {
    verdicts: validateVerdicts(envelope.outputJson, ambiguousPairs),
    modelId: envelope.model,
    transport: envelope.transport,
  };
}

type AdjudicationResultBase = Omit<
  TaskMapIdentityAdjudicationResultV1,
  "artifactDigest"
>;

function sealAdjudicationResult(
  base: AdjudicationResultBase,
): TaskMapIdentityAdjudicationResultV1 {
  return { ...base, artifactDigest: taskMapContractDigest(base) };
}

/**
 * Produces owner-gated identity proposals. Raw candidate evidence is used only
 * to construct the deterministic prompt and is never copied into the artifact.
 */
export async function adjudicateTaskMapIdentityPairs(
  input: AdjudicateTaskMapIdentityPairsInputV1,
): Promise<TaskMapIdentityAdjudicationResultV1> {
  if (!plainObject(input)) fail("adjudication input is invalid");
  const hasStation = input.station !== undefined;
  const hasRunner = input.runner !== undefined;
  if (hasStation === hasRunner) {
    fail("exactly one station or runner seam is required");
  }
  if (
    hasStation
    && (
      input.station === null
      || (typeof input.station !== "object" && typeof input.station !== "function")
      || typeof input.station.run !== "function"
    )
  ) {
    fail("station seam is invalid");
  }
  if (hasRunner && typeof input.runner !== "function") {
    fail("offline runner seam is invalid");
  }
  if (hasRunner && !validModelId(input.llmModelId)) {
    fail("offline runner model provenance is invalid");
  }
  validateProposalForAdjudication(input.proposals);
  const proposalPairs = [...input.proposals.pairs].sort(stablePairCompare);
  const ambiguousPairs = proposalPairs.filter(
    (pair) => pair.confidence === "ambiguous",
  );
  let llm: TaskMapIdentityAdjudicationResultV1["llm"] = {
    invocationState: "not_invoked",
    stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
    modelId: null,
    transport: null,
    promptDigest: null,
  };
  let llmVerdicts: Map<string, TaskMapIdentityAdjudicationVerdictV1> | undefined;
  if (ambiguousPairs.length > 0) {
    let promptDigest: string | null = null;
    try {
      const evidence = evidenceForAmbiguousPairs(
        ambiguousPairs,
        input.candidateEvidence,
        input.proposals.evidenceManifest,
      );
      const prompt = buildIdentityAdjudicationPrompt(ambiguousPairs, evidence);
      promptDigest = taskMapContractDigest(prompt);
      if (hasStation) {
        const result = await runStationIdentityAdjudication(
          input.station,
          prompt,
          input.proposals.inputDigest,
          ambiguousPairs,
        );
        llmVerdicts = result.verdicts;
        llm = {
          invocationState: "invoked",
          stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
          modelId: result.modelId,
          transport: result.transport,
          promptDigest,
        };
      } else {
        llmVerdicts = await runOfflineIdentityAdjudication(
          input.runner,
          prompt,
          ambiguousPairs,
        );
        llm = {
          invocationState: "invoked",
          stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
          modelId: input.llmModelId,
          transport: "injected-offline",
          promptDigest,
        };
      }
    } catch (_error: unknown) {
      llmVerdicts = undefined;
      llm = {
        invocationState: "unavailable",
        stationId: TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
        modelId: hasRunner ? input.llmModelId : null,
        transport: hasRunner ? "injected-offline" : null,
        promptDigest,
      };
    }
  }

  const pairs: TaskMapIdentityAdjudicatedPairV1[] = proposalPairs.map((pair) => {
    if (pair.confidence === "high") {
      return {
        ...pair,
        adjudication: "same_work",
        adjudicationSource: "embedding_high_confidence",
        deferredReason: null,
      };
    }
    const verdict = llmVerdicts?.get(pair.pairId);
    return verdict === undefined
      ? {
          ...pair,
          adjudication: "deferred",
          adjudicationSource: "deferred",
          deferredReason: "llm_station_unavailable",
        }
      : {
          ...pair,
          adjudication: verdict,
          adjudicationSource: "llm_identity_adjudication",
          deferredReason: null,
        };
  });
  const verdicts = pairs.map((pair) => ({
    pairId: pair.pairId,
    verdict: pair.adjudication,
    source: pair.adjudicationSource,
  }));
  const mergeCandidates = pairs.filter(
    (pair) => pair.adjudication === "same_work",
  );
  return sealAdjudicationResult({
    contractVersion: TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION,
    inputDigest: input.proposals.inputDigest,
    proposalArtifactDigest: input.proposals.artifactDigest,
    embedding: {
      modelId: input.proposals.embeddingModelId,
      dimensions: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions,
      similarity: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.similarity,
      blockThreshold: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold,
      autoBand: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand,
    },
    llm,
    pairs,
    verdicts,
    mergeCandidates,
    authority: {
      mergeApplied: false,
      aliasesWritten: false,
      requiresOwnerAcceptance: true,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  });
}
