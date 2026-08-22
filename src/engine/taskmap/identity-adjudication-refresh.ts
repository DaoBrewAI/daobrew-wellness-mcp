import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { EmbeddingProvider } from "../embeddings/provider.js";
import {
  adjudicateTaskMapIdentityPairs,
  buildTaskMapIdentityAdjudicationProposals,
  TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1,
  TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1,
  TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION,
  TASKMAP_IDENTITY_ADJUDICATION_STATION_ID,
  type TaskMapIdentityAdjudicatedPairV1,
  type TaskMapIdentityAdjudicationCandidateV1,
  type TaskMapIdentityAdjudicationProposalV1,
  type TaskMapIdentityAdjudicationResultV1,
} from "./identity-adjudication-proposal.js";
import {
  createLlmStation,
  type LlmStation,
} from "./llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import { boundedUtf16 } from "./text-contract.js";
import type { TaskMapProjectionV1 } from "./types.js";

export const TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION =
  "taskmap-identity-adjudication-refresh.v1" as const;
export const TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET = 32;

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ARTIFACT_BYTES = 4 * 1_024 * 1_024;
const ARTIFACT_DIRECTORY = "identity-adjudication";
const OUTER_KEYS = Object.freeze([
  "contractVersion",
  "ownerScopeDigest",
  "inputDigest",
  "state",
  "pendingCount",
  "degradationCode",
  "proposal",
  "result",
  "artifactDigest",
] as const);

export type TaskMapIdentityAdjudicationRefreshState =
  | "current"
  | "deferred"
  | "unavailable";

export type TaskMapIdentityAdjudicationRefreshDegradationCode =
  | "embedding_provider_failed"
  | "llm_station_unavailable"
  | null;

export interface TaskMapIdentityAdjudicationRefreshArtifactV1 {
  contractVersion: typeof TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION;
  ownerScopeDigest: string;
  inputDigest: string;
  state: TaskMapIdentityAdjudicationRefreshState;
  pendingCount: number;
  degradationCode: TaskMapIdentityAdjudicationRefreshDegradationCode;
  proposal: TaskMapIdentityAdjudicationProposalV1;
  result: TaskMapIdentityAdjudicationResultV1;
  artifactDigest: string;
}

export interface RefreshTaskMapIdentityAdjudicationInputV1 {
  taskMapRoot: string;
  ownerScopeDigest: string;
  inputDigest: string;
  candidates: readonly TaskMapIdentityAdjudicationCandidateV1[];
  embeddingProvider: EmbeddingProvider;
  embeddingModelId: string;
  createStation?: () => Promise<LlmStation>;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function taskMapIdentityCandidatesFromProjection(
  projection: Pick<TaskMapProjectionV1, "tasks">,
): TaskMapIdentityAdjudicationCandidateV1[] {
  const candidates = projection.tasks.flatMap((task) => {
    const textParts = [...new Set([task.title, task.summary]
      .map((value) => value.trim().replace(/\s+/gu, " "))
      .filter((value) => value.length > 0 && !SHA256.test(value)))];
    if (textParts.length === 0) return [];
    const text = boundedUtf16(
      textParts.join("\n"),
      TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters,
    );
    if (SHA256.test(text)) return [];
    return [{
      candidateId: task.id,
      rootId: task.rootId,
      text,
    }];
  }).sort((left, right) => stableCompare(
    left.candidateId,
    right.candidateId,
  ));
  return candidates.slice(
    0,
    TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates,
  );
}

export function taskMapIdentityAdjudicationRefreshPath(
  taskMapRoot: string,
  inputDigest: string,
): string {
  if (!path.isAbsolute(taskMapRoot) || !SHA256.test(inputDigest)) {
    throw new TypeError("Task Map identity refresh path is invalid");
  }
  return path.join(taskMapRoot, ARTIFACT_DIRECTORY, `${inputDigest}.json`);
}

function proposalWithPairs(
  proposal: TaskMapIdentityAdjudicationProposalV1,
  pairs: TaskMapIdentityAdjudicationProposalV1["pairs"],
): TaskMapIdentityAdjudicationProposalV1 {
  const { artifactDigest: _artifactDigest, ...base } = proposal;
  const bounded = { ...base, pairs: [...pairs] };
  return {
    ...bounded,
    artifactDigest: taskMapContractDigest(bounded),
  };
}

function sealResult(
  result: Omit<TaskMapIdentityAdjudicationResultV1, "artifactDigest">,
): TaskMapIdentityAdjudicationResultV1 {
  return { ...result, artifactDigest: taskMapContractDigest(result) };
}

function deferredPair(
  pair: TaskMapIdentityAdjudicationProposalV1["pairs"][number],
): TaskMapIdentityAdjudicatedPairV1 {
  return {
    ...pair,
    adjudication: "deferred",
    adjudicationSource: "deferred",
    deferredReason: "llm_station_unavailable",
  };
}

function sealArtifact(
  artifact: Omit<TaskMapIdentityAdjudicationRefreshArtifactV1, "artifactDigest">,
): TaskMapIdentityAdjudicationRefreshArtifactV1 {
  return { ...artifact, artifactDigest: taskMapContractDigest(artifact) };
}

function placeholderStation(): LlmStation {
  return {
    provider: {
      transport: "gemini-remote",
      executable: "",
      args: [],
      model: "unavailable",
    },
    async run() {
      throw new Error("identity adjudication station unavailable");
    },
  };
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("identity adjudication artifact directory is unsafe");
    }
    const owner = process.getuid?.();
    if (owner !== undefined && metadata.uid !== owner) {
      throw new Error("identity adjudication artifact directory owner is unsafe");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory, { recursive: true, mode: 0o700 });
  }
  await chmod(directory, 0o700);
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicPrivateWrite(
  filePath: string,
  artifact: TaskMapIdentityAdjudicationRefreshArtifactV1,
): Promise<void> {
  const directory = path.dirname(filePath);
  await ensurePrivateDirectory(directory);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  let renamed = false;
  try {
    await handle.writeFile(taskMapContractCanonicalJson(artifact), "utf8");
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, filePath);
    renamed = true;
    await syncDirectory(directory);
  } finally {
    if (!renamed) await rm(temporaryPath, { force: true });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value).sort(stableCompare);
  const expected = [...OUTER_KEYS].sort(stableCompare);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function validateReplayArtifact(
  parsed: unknown,
  ownerScopeDigest: string,
  inputDigest: string,
): TaskMapIdentityAdjudicationRefreshArtifactV1 | null {
  if (!isRecord(parsed) || !exactKeys(parsed)) return null;
  const artifact = parsed as unknown as TaskMapIdentityAdjudicationRefreshArtifactV1;
  if (
    artifact.contractVersion !== TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION
    || artifact.ownerScopeDigest !== ownerScopeDigest
    || artifact.inputDigest !== inputDigest
    || artifact.state !== "current"
    || artifact.pendingCount !== 0
    || artifact.degradationCode !== null
    || artifact.proposal.inputDigest !== inputDigest
    || artifact.result.inputDigest !== inputDigest
    || artifact.result.contractVersion !== TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION
    || artifact.result.authority.mergeApplied !== false
    || artifact.result.authority.aliasesWritten !== false
    || artifact.result.authority.requiresOwnerAcceptance !== true
  ) return null;
  const { artifactDigest, ...base } = artifact;
  const { artifactDigest: proposalDigest, ...proposalBase } = artifact.proposal;
  const { artifactDigest: resultDigest, ...resultBase } = artifact.result;
  if (
    artifactDigest !== taskMapContractDigest(base)
    || proposalDigest !== taskMapContractDigest(proposalBase)
    || resultDigest !== taskMapContractDigest(resultBase)
  ) return null;
  return artifact;
}

async function loadCurrentArtifact(
  filePath: string,
  ownerScopeDigest: string,
  inputDigest: string,
): Promise<TaskMapIdentityAdjudicationRefreshArtifactV1 | null> {
  try {
    const metadata = await lstat(filePath);
    const owner = process.getuid?.();
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.nlink !== 1
      || metadata.mode % 0o1000 !== 0o600
      || metadata.size > MAX_ARTIFACT_BYTES
      || (owner !== undefined && metadata.uid !== owner)
    ) return null;
    const bytes = await readFile(filePath);
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) return null;
    return validateReplayArtifact(
      JSON.parse(bytes.toString("utf8")),
      ownerScopeDigest,
      inputDigest,
    );
  } catch {
    return null;
  }
}

export async function loadTaskMapIdentityAdjudicationRefreshArtifact(
  taskMapRoot: string,
  ownerScopeDigest: string,
  inputDigest: string,
): Promise<TaskMapIdentityAdjudicationRefreshArtifactV1 | null> {
  if (!SHA256.test(ownerScopeDigest) || !SHA256.test(inputDigest)) return null;
  return loadCurrentArtifact(
    taskMapIdentityAdjudicationRefreshPath(taskMapRoot, inputDigest),
    ownerScopeDigest,
    inputDigest,
  );
}

export async function refreshTaskMapIdentityAdjudication(
  input: RefreshTaskMapIdentityAdjudicationInputV1,
): Promise<TaskMapIdentityAdjudicationRefreshArtifactV1> {
  if (!SHA256.test(input.ownerScopeDigest) || !SHA256.test(input.inputDigest)) {
    throw new TypeError("Task Map identity refresh binding is invalid");
  }
  const artifactPath = taskMapIdentityAdjudicationRefreshPath(
    input.taskMapRoot,
    input.inputDigest,
  );
  const replayed = await loadCurrentArtifact(
    artifactPath,
    input.ownerScopeDigest,
    input.inputDigest,
  );
  if (replayed !== null) return replayed;

  const proposal = await buildTaskMapIdentityAdjudicationProposals({
    candidates: input.candidates,
    embeddingProvider: input.embeddingProvider,
    embeddingModelId: input.embeddingModelId,
    inputDigest: input.inputDigest,
  });
  const budgetPairs = proposal.pairs.slice(
    0,
    TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET,
  );
  const excessPairs = proposal.pairs.slice(
    TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET,
  );
  const budgetProposal = proposalWithPairs(proposal, budgetPairs);
  const ambiguous = budgetPairs.some((pair) => pair.confidence === "ambiguous");
  let selectedStation = placeholderStation();
  if (proposal.blockingState === "current" && ambiguous) {
    try {
      selectedStation = await (input.createStation ?? (() => createLlmStation()))();
    } catch {
      selectedStation = placeholderStation();
    }
  }
  const adjudicated = await adjudicateTaskMapIdentityPairs({
    proposals: budgetProposal,
    candidateEvidence: input.candidates.map(({ candidateId, text }) => ({
      candidateId,
      text,
    })),
    station: selectedStation,
  });
  const excess = excessPairs.map(deferredPair);
  const combinedPairs = [...adjudicated.pairs, ...excess];
  const { artifactDigest: _adjudicatedDigest, ...adjudicatedBase } = adjudicated;
  const result = sealResult({
    ...adjudicatedBase,
    proposalArtifactDigest: proposal.artifactDigest,
    pairs: combinedPairs,
    verdicts: combinedPairs.map((pair) => ({
      pairId: pair.pairId,
      verdict: pair.adjudication,
      source: pair.adjudicationSource,
    })),
    mergeCandidates: combinedPairs.filter(
      (pair) => pair.adjudication === "same_work",
    ),
  });
  const pendingCount = result.pairs.filter(
    (pair) => pair.adjudication === "deferred",
  ).length;
  const state: TaskMapIdentityAdjudicationRefreshState =
    proposal.blockingState === "unavailable"
      ? "unavailable"
      : pendingCount > 0
        ? "deferred"
        : "current";
  const degradationCode: TaskMapIdentityAdjudicationRefreshDegradationCode =
    state === "unavailable"
      ? "embedding_provider_failed"
      : state === "deferred"
        ? "llm_station_unavailable"
        : null;
  const artifact = sealArtifact({
    contractVersion: TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    inputDigest: input.inputDigest,
    state,
    pendingCount,
    degradationCode,
    proposal,
    result,
  });
  await atomicPrivateWrite(artifactPath, artifact);
  return artifact;
}
