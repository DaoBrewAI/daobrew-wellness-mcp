import { constants as fsConstants } from "node:fs";
import {
  chmod,
  lstat,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { TaskMapDecompositionRefreshArtifactV1 } from "./decomposition-refresh.js";
import type { TaskMapIdentityAdjudicationRefreshArtifactV1 } from "./identity-adjudication-refresh.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type { TaskMapProjectionV1 } from "./types.js";

export const TASKMAP_LLM_PROPOSAL_SURFACE_VERSION =
  "taskmap-llm-proposal-surface.v1" as const;
export const TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME =
  "taskmap-llm-proposal-surface.v1.json" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const MAX_DOCUMENT_BYTES = 512 * 1_024;
const MAX_DUPLICATES = 32;
const MAX_BREAKDOWNS = 9;
const MAX_SUBTASKS = 16;

type SurfaceState = "current" | "deferred" | "unavailable";
type SurfaceDegradation =
  | "embedding_provider_failed"
  | "llm_station_unavailable"
  | "validation_failed"
  | null;

interface SurfaceStationStatus {
  stationId: "identity-adjudication-v1" | "task-decomposition-v1";
  state: SurfaceState;
  pendingCount: number;
  degradationCode: SurfaceDegradation;
  lastSuccessAtMs: number | null;
}

export interface TaskMapPossibleDuplicateSurfaceV1 {
  pairId: string;
  leftTaskId: string;
  rightTaskId: string;
  leftTitle: string;
  rightTitle: string;
  confidence: "high" | "ambiguous";
  awaitingOwnerAcceptance: true;
}

export interface TaskMapSuggestedBreakdownSubtaskSurfaceV1 {
  subtaskId: string;
  title: string;
  summary: string;
}

export interface TaskMapSuggestedBreakdownSurfaceV1 {
  proposalId: string;
  parentTaskId: string;
  parentTitle: string;
  subtasks: TaskMapSuggestedBreakdownSubtaskSurfaceV1[];
  awaitingOwnerAcceptance: true;
}

export interface TaskMapLlmProposalSurfaceV1 {
  contractVersion: typeof TASKMAP_LLM_PROPOSAL_SURFACE_VERSION;
  ownerScopeDigest: string;
  projectionDigest: string;
  possibleDuplicates: {
    state: SurfaceState;
    pendingCount: number;
    degradationCode: SurfaceDegradation;
    sourceArtifactDigest: string | null;
    proposals: TaskMapPossibleDuplicateSurfaceV1[];
  };
  suggestedBreakdowns: {
    state: SurfaceState;
    pendingCount: number;
    degradationCode: SurfaceDegradation;
    sourceArtifactDigest: string | null;
    proposals: TaskMapSuggestedBreakdownSurfaceV1[];
  };
  authority: {
    aliasesWritten: false;
    nodesWritten: false;
    edgesWritten: false;
    acceptanceAuthority: false;
    requiresOwnerAcceptance: true;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
  artifactDigest: string;
}

export interface PublishTaskMapLlmProposalSurfaceInputV1 {
  taskMapRoot: string;
  ownerScopeDigest: string;
  projection: TaskMapProjectionV1;
  identityStatus: SurfaceStationStatus;
  identityArtifact: TaskMapIdentityAdjudicationRefreshArtifactV1 | null;
  decompositionStatus: SurfaceStationStatus;
  decompositionArtifact: TaskMapDecompositionRefreshArtifactV1 | null;
}

export interface LoadTaskMapLlmProposalSurfaceInputV1 {
  taskMapRoot: string;
  ownerScopeDigest: string;
  projection: TaskMapProjectionV1;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort(stableCompare);
  const wanted = [...expected].sort(stableCompare);
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && value === value.trim()
    && !CONTROL.test(value);
}

function validStatus(
  state: unknown,
  pendingCount: unknown,
  degradationCode: unknown,
): boolean {
  if (
    state !== "current"
    && state !== "deferred"
    && state !== "unavailable"
  ) return false;
  if (
    !Number.isSafeInteger(pendingCount)
    || (pendingCount as number) < 0
    || (pendingCount as number) > 2_048
  ) return false;
  if (state === "current") {
    return pendingCount === 0 && degradationCode === null;
  }
  return degradationCode === "embedding_provider_failed"
    || degradationCode === "llm_station_unavailable"
    || degradationCode === "validation_failed";
}

function surfacePath(taskMapRoot: string): string {
  if (!path.isAbsolute(taskMapRoot)) {
    throw new TypeError("Task Map LLM proposal surface path is invalid");
  }
  return path.join(taskMapRoot, TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME);
}

function possibleDuplicates(
  projection: TaskMapProjectionV1,
  artifact: TaskMapIdentityAdjudicationRefreshArtifactV1 | null,
): TaskMapPossibleDuplicateSurfaceV1[] {
  if (artifact === null) return [];
  const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
  return artifact.result.mergeCandidates.flatMap((pair) => {
    const left = tasks.get(pair.leftCandidateId);
    const right = tasks.get(pair.rightCandidateId);
    if (left === undefined || right === undefined) return [];
    return [{
      pairId: pair.pairId,
      leftTaskId: left.id,
      rightTaskId: right.id,
      leftTitle: left.title,
      rightTitle: right.title,
      confidence: pair.confidence,
      awaitingOwnerAcceptance: true as const,
    }];
  }).slice(0, MAX_DUPLICATES);
}

function suggestedBreakdowns(
  projection: TaskMapProjectionV1,
  artifact: TaskMapDecompositionRefreshArtifactV1 | null,
): TaskMapSuggestedBreakdownSurfaceV1[] {
  if (artifact === null) return [];
  const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
  return artifact.workItems.flatMap((item) => {
    const parent = tasks.get(item.taskId);
    if (parent === undefined) return [];
    return item.validProposals.map(({ proposal }) => ({
      proposalId: proposal.proposalId,
      parentTaskId: parent.id,
      parentTitle: parent.title,
      subtasks: proposal.subtasks.map((subtask) => ({
        subtaskId: subtask.subtaskId,
        title: subtask.title,
        summary: subtask.summary,
      })),
      awaitingOwnerAcceptance: true as const,
    }));
  }).slice(0, MAX_BREAKDOWNS);
}

function seal(
  value: Omit<TaskMapLlmProposalSurfaceV1, "artifactDigest">,
): TaskMapLlmProposalSurfaceV1 {
  return { ...value, artifactDigest: taskMapContractDigest(value) };
}

async function atomicPrivateWrite(
  filePath: string,
  document: TaskMapLlmProposalSurfaceV1,
): Promise<void> {
  const directory = path.dirname(filePath);
  const directoryMetadata = await lstat(directory);
  const owner = process.getuid?.();
  if (
    !directoryMetadata.isDirectory()
    || directoryMetadata.isSymbolicLink()
    || (owner !== undefined && directoryMetadata.uid !== owner)
  ) {
    throw new Error("Task Map LLM proposal surface directory is unsafe");
  }
  await chmod(directory, 0o700);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  let renamed = false;
  try {
    await handle.writeFile(taskMapContractCanonicalJson(document), "utf8");
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, filePath);
    renamed = true;
    const directoryHandle = await open(
      directory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (!renamed) await rm(temporaryPath, { force: true });
  }
}

function validateDocument(
  value: unknown,
  input: LoadTaskMapLlmProposalSurfaceInputV1,
): TaskMapLlmProposalSurfaceV1 | null {
  if (!isRecord(value) || !exactKeys(value, [
    "contractVersion",
    "ownerScopeDigest",
    "projectionDigest",
    "possibleDuplicates",
    "suggestedBreakdowns",
    "authority",
    "privacy",
    "artifactDigest",
  ])) return null;
  const document = value as unknown as TaskMapLlmProposalSurfaceV1;
  if (
    document.contractVersion !== TASKMAP_LLM_PROPOSAL_SURFACE_VERSION
    || document.ownerScopeDigest !== input.ownerScopeDigest
    || document.projectionDigest !== taskMapContractDigest(input.projection)
    || !SHA256.test(document.artifactDigest)
    || !isRecord(document.authority)
    || !exactKeys(document.authority, [
      "aliasesWritten",
      "nodesWritten",
      "edgesWritten",
      "acceptanceAuthority",
      "requiresOwnerAcceptance",
    ])
    || document.authority.aliasesWritten !== false
    || document.authority.nodesWritten !== false
    || document.authority.edgesWritten !== false
    || document.authority.acceptanceAuthority !== false
    || document.authority.requiresOwnerAcceptance !== true
    || !isRecord(document.privacy)
    || !exactKeys(document.privacy, [
      "sourceBodiesStored",
      "localPathsStored",
      "rawBiometricsStored",
    ])
    || document.privacy.sourceBodiesStored !== false
    || document.privacy.localPathsStored !== false
    || document.privacy.rawBiometricsStored !== false
  ) return null;
  const { artifactDigest, ...base } = document;
  if (artifactDigest !== taskMapContractDigest(base)) return null;

  const tasks = new Map(input.projection.tasks.map((task) => [task.id, task]));
  const duplicateSection = document.possibleDuplicates;
  if (
    !isRecord(duplicateSection)
    || !exactKeys(duplicateSection, [
      "state",
      "pendingCount",
      "degradationCode",
      "sourceArtifactDigest",
      "proposals",
    ])
    || !validStatus(
      duplicateSection.state,
      duplicateSection.pendingCount,
      duplicateSection.degradationCode,
    )
    || !(
      duplicateSection.sourceArtifactDigest === null
      || SHA256.test(duplicateSection.sourceArtifactDigest)
    )
    || !Array.isArray(duplicateSection.proposals)
    || duplicateSection.proposals.length > MAX_DUPLICATES
  ) return null;
  const duplicateIds = new Set<string>();
  for (const proposal of duplicateSection.proposals) {
    if (
      !isRecord(proposal)
      || !exactKeys(proposal, [
        "pairId",
        "leftTaskId",
        "rightTaskId",
        "leftTitle",
        "rightTitle",
        "confidence",
        "awaitingOwnerAcceptance",
      ])
      || !boundedText(proposal.pairId, 512)
      || !boundedText(proposal.leftTaskId, 512)
      || !boundedText(proposal.rightTaskId, 512)
      || !boundedText(proposal.leftTitle, 256)
      || !boundedText(proposal.rightTitle, 256)
      || (proposal.confidence !== "high" && proposal.confidence !== "ambiguous")
      || proposal.awaitingOwnerAcceptance !== true
      || duplicateIds.has(proposal.pairId)
      || tasks.get(proposal.leftTaskId)?.title !== proposal.leftTitle
      || tasks.get(proposal.rightTaskId)?.title !== proposal.rightTitle
    ) return null;
    duplicateIds.add(proposal.pairId);
  }

  const breakdownSection = document.suggestedBreakdowns;
  if (
    !isRecord(breakdownSection)
    || !exactKeys(breakdownSection, [
      "state",
      "pendingCount",
      "degradationCode",
      "sourceArtifactDigest",
      "proposals",
    ])
    || !validStatus(
      breakdownSection.state,
      breakdownSection.pendingCount,
      breakdownSection.degradationCode,
    )
    || !(
      breakdownSection.sourceArtifactDigest === null
      || SHA256.test(breakdownSection.sourceArtifactDigest)
    )
    || !Array.isArray(breakdownSection.proposals)
    || breakdownSection.proposals.length > MAX_BREAKDOWNS
  ) return null;
  const breakdownIds = new Set<string>();
  for (const proposal of breakdownSection.proposals) {
    if (
      !isRecord(proposal)
      || !exactKeys(proposal, [
        "proposalId",
        "parentTaskId",
        "parentTitle",
        "subtasks",
        "awaitingOwnerAcceptance",
      ])
      || !boundedText(proposal.proposalId, 512)
      || !boundedText(proposal.parentTaskId, 512)
      || !boundedText(proposal.parentTitle, 256)
      || proposal.awaitingOwnerAcceptance !== true
      || breakdownIds.has(proposal.proposalId)
      || tasks.get(proposal.parentTaskId)?.title !== proposal.parentTitle
      || !Array.isArray(proposal.subtasks)
      || proposal.subtasks.length < 1
      || proposal.subtasks.length > MAX_SUBTASKS
    ) return null;
    breakdownIds.add(proposal.proposalId);
    const subtaskIds = new Set<string>();
    for (const subtask of proposal.subtasks) {
      if (
        !isRecord(subtask)
        || !exactKeys(subtask, ["subtaskId", "title", "summary"])
        || !boundedText(subtask.subtaskId, 512)
        || !boundedText(subtask.title, 256)
        || !boundedText(subtask.summary, 1_024)
        || subtaskIds.has(subtask.subtaskId)
      ) return null;
      subtaskIds.add(subtask.subtaskId);
    }
  }
  return document;
}

export async function publishTaskMapLlmProposalSurface(
  input: PublishTaskMapLlmProposalSurfaceInputV1,
): Promise<TaskMapLlmProposalSurfaceV1> {
  if (!SHA256.test(input.ownerScopeDigest)) {
    throw new TypeError("Task Map LLM proposal surface owner is invalid");
  }
  if (
    input.identityStatus.stationId !== "identity-adjudication-v1"
    || input.decompositionStatus.stationId !== "task-decomposition-v1"
  ) {
    throw new TypeError("Task Map LLM proposal surface station is invalid");
  }
  const document = seal({
    contractVersion: TASKMAP_LLM_PROPOSAL_SURFACE_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    projectionDigest: taskMapContractDigest(input.projection),
    possibleDuplicates: {
      state: input.identityStatus.state,
      pendingCount: input.identityStatus.pendingCount,
      degradationCode: input.identityStatus.degradationCode,
      sourceArtifactDigest: input.identityArtifact?.artifactDigest ?? null,
      proposals: possibleDuplicates(input.projection, input.identityArtifact),
    },
    suggestedBreakdowns: {
      state: input.decompositionStatus.state,
      pendingCount: input.decompositionStatus.pendingCount,
      degradationCode: input.decompositionStatus.degradationCode,
      sourceArtifactDigest: input.decompositionArtifact?.artifactDigest ?? null,
      proposals: suggestedBreakdowns(input.projection, input.decompositionArtifact),
    },
    authority: {
      aliasesWritten: false,
      nodesWritten: false,
      edgesWritten: false,
      acceptanceAuthority: false,
      requiresOwnerAcceptance: true,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  });
  await atomicPrivateWrite(surfacePath(input.taskMapRoot), document);
  return document;
}

export async function loadTaskMapLlmProposalSurface(
  input: LoadTaskMapLlmProposalSurfaceInputV1,
): Promise<TaskMapLlmProposalSurfaceV1 | null> {
  if (!SHA256.test(input.ownerScopeDigest)) return null;
  try {
    const filePath = surfacePath(input.taskMapRoot);
    const metadata = await lstat(filePath);
    const owner = process.getuid?.();
    if (
      !metadata.isFile()
      || metadata.isSymbolicLink()
      || metadata.nlink !== 1
      || metadata.mode % 0o1000 !== 0o600
      || metadata.size < 0
      || metadata.size > MAX_DOCUMENT_BYTES
      || (owner !== undefined && metadata.uid !== owner)
    ) return null;
    const bytes = await readFile(filePath);
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) return null;
    return validateDocument(JSON.parse(bytes.toString("utf8")), input);
  } catch {
    return null;
  }
}
