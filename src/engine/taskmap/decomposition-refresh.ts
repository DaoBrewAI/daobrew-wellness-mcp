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

import {
  validateTaskMapDecomposition,
  type TaskMapDecompositionValidationCandidateV1,
  type TaskMapDecompositionValidationEdgeV1,
  type TaskMapDecompositionValidationResultV1,
} from "./decomposition-validation.js";
import {
  buildTaskMapMethodLibrary,
  proposeTaskMapDecomposition,
  type TaskMapDecompositionProposalV1,
  type TaskMapDecompositionResultV1,
  type TaskMapDecompositionStation,
  type TaskMapDecompositionWorkItemV1,
  type TaskMapMethodLibraryV1,
} from "./method-library.js";
import {
  createLlmStation,
  type LlmStation,
} from "./llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type { TaskMapProjectionV1, TaskMapTask } from "./types.js";

export const TASKMAP_DECOMPOSITION_REFRESH_VERSION =
  "taskmap-decomposition-refresh.v1" as const;
export const TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET = 3;

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_DIRECTORY = "decomposition";
const MAX_ARTIFACT_BYTES = 8 * 1_024 * 1_024;

export interface TaskMapDecompositionValidatedProposalV1 {
  proposal: TaskMapDecompositionProposalV1;
  edges: TaskMapDecompositionValidationEdgeV1[];
  validationArtifactDigest: string;
}

export interface TaskMapDecompositionRejectedProposalV1 {
  proposalId: string;
  reasonCodes: string[];
}

export interface TaskMapDecompositionRefreshWorkItemV1 {
  taskId: string;
  inputDigest: string;
  result: TaskMapDecompositionResultV1;
  validProposals: TaskMapDecompositionValidatedProposalV1[];
  validations: TaskMapDecompositionValidationResultV1[];
  rejected: TaskMapDecompositionRejectedProposalV1[];
}

export interface TaskMapDecompositionRefreshArtifactV1 {
  contractVersion: typeof TASKMAP_DECOMPOSITION_REFRESH_VERSION;
  ownerScopeDigest: string;
  projectionDigest: string;
  methodLibrary: TaskMapMethodLibraryV1;
  state: "current" | "deferred" | "unavailable";
  pendingCount: number;
  degradationCode: "llm_station_unavailable" | "validation_failed" | null;
  workItems: TaskMapDecompositionRefreshWorkItemV1[];
  authority: {
    nodesWritten: false;
    edgesWritten: false;
    requiresOwnerAcceptance: true;
  };
  artifactDigest: string;
}

export interface RefreshTaskMapDecompositionInputV1 {
  taskMapRoot: string;
  ownerScopeDigest: string;
  projection: TaskMapProjectionV1;
  createStation?: () => Promise<LlmStation>;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function newestCitationAt(task: TaskMapTask): number {
  return task.citations.reduce((latest, citation) => {
    const parsed = Date.parse(citation.occurredAt);
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, 0);
}

function domainSignature(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9._-]+$/g, "")
    .slice(0, 128);
  return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)
    ? normalized
    : "general-work";
}

export function selectTaskMapDecompositionWorkItems(
  projection: TaskMapProjectionV1,
): TaskMapDecompositionWorkItemV1[] {
  const rootById = new Map(projection.roots.map((root) => [root.id, root]));
  const taskIds = new Set(projection.tasks.map((task) => task.id));
  const parentsWithChildren = new Set(
    projection.edges
      .filter((edge) =>
        edge.relation === "informed_by"
        && taskIds.has(edge.from)
        && taskIds.has(edge.to)
      )
      .map((edge) => edge.to),
  );
  return projection.tasks
    .filter((task) =>
      task.reviewState === "accepted"
      && task.openState === "open"
      && !parentsWithChildren.has(task.id)
      && task.citations.length > 0
    )
    .sort((left, right) =>
      newestCitationAt(right) - newestCitationAt(left)
      || stableCompare(left.id, right.id)
    )
    .slice(0, TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET)
    .map((task) => ({
      taskId: task.id,
      domainSignature: domainSignature(
        rootById.get(task.rootId)?.title ?? task.title,
      ),
      title: task.title,
      summary: task.summary,
      citationPointerIds: [...new Set(
        task.citations.map((citation) => citation.pointerId),
      )].sort(stableCompare),
    }));
}

export function taskMapDecompositionRefreshPath(
  taskMapRoot: string,
  projectionDigest: string,
): string {
  if (!path.isAbsolute(taskMapRoot) || !SHA256.test(projectionDigest)) {
    throw new TypeError("Task Map decomposition refresh path is invalid");
  }
  return path.join(taskMapRoot, ARTIFACT_DIRECTORY, `${projectionDigest}.json`);
}

function proposedEdges(
  proposal: TaskMapDecompositionProposalV1,
  parentTaskId: string,
): TaskMapDecompositionValidationEdgeV1[] {
  return proposal.subtasks.map((subtask, index) => ({
    id: `tme_${taskMapContractDigest({
      proposalId: proposal.proposalId,
      parentTaskId,
      subtaskId: subtask.subtaskId,
      index,
    }).slice(0, 16)}`,
    from: subtask.subtaskId,
    to: parentTaskId,
    relation: "informed_by" as const,
    citationPointerIds: [...subtask.citationPointerIds],
  }));
}

function validationCandidate(
  proposal: TaskMapDecompositionProposalV1,
  result: TaskMapDecompositionResultV1,
  parentTaskId: string,
): TaskMapDecompositionValidationCandidateV1 {
  return {
    ...proposal,
    sourceResultArtifactDigest: result.artifactDigest,
    sourceProposalDigest: taskMapContractDigest(proposal),
    parentTaskId,
    edges: proposedEdges(proposal, parentTaskId),
  };
}

function validationReasonCodes(
  validation: TaskMapDecompositionValidationResultV1,
): string[] {
  return validation.steps
    .filter((step) => !step.passed)
    .flatMap((step) => step.reasons.map((reason) =>
      `${step.stepId}:${taskMapContractDigest(reason).slice(0, 16)}`
    ));
}

function sealArtifact(
  base: Omit<TaskMapDecompositionRefreshArtifactV1, "artifactDigest">,
): TaskMapDecompositionRefreshArtifactV1 {
  return { ...base, artifactDigest: taskMapContractDigest(base) };
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  try {
    const metadata = await lstat(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("decomposition artifact directory is unsafe");
    }
    const owner = process.getuid?.();
    if (owner !== undefined && metadata.uid !== owner) {
      throw new Error("decomposition artifact directory owner is unsafe");
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
  artifact: TaskMapDecompositionRefreshArtifactV1,
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

function validateCurrentArtifact(
  value: unknown,
  ownerScopeDigest: string,
  projectionDigest: string,
): TaskMapDecompositionRefreshArtifactV1 | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const artifact = value as TaskMapDecompositionRefreshArtifactV1;
  if (
    artifact.contractVersion !== TASKMAP_DECOMPOSITION_REFRESH_VERSION
    || artifact.ownerScopeDigest !== ownerScopeDigest
    || artifact.projectionDigest !== projectionDigest
    || artifact.state !== "current"
    || artifact.pendingCount !== 0
    || artifact.degradationCode !== null
    || artifact.authority.nodesWritten !== false
    || artifact.authority.edgesWritten !== false
    || artifact.authority.requiresOwnerAcceptance !== true
    || !Array.isArray(artifact.workItems)
  ) return null;
  const { artifactDigest, ...base } = artifact;
  if (artifactDigest !== taskMapContractDigest(base)) return null;
  for (const workItem of artifact.workItems) {
    const { artifactDigest: resultDigest, ...resultBase } = workItem.result;
    if (resultDigest !== taskMapContractDigest(resultBase)) return null;
    if (workItem.validations.some((validation) => {
      const { artifactDigest: validationDigest, ...validationBase } = validation;
      return validationDigest !== taskMapContractDigest(validationBase);
    })) return null;
  }
  return artifact;
}

async function loadCurrentArtifact(
  filePath: string,
  ownerScopeDigest: string,
  projectionDigest: string,
): Promise<TaskMapDecompositionRefreshArtifactV1 | null> {
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
    return validateCurrentArtifact(
      JSON.parse(await readFile(filePath, "utf8")),
      ownerScopeDigest,
      projectionDigest,
    );
  } catch {
    return null;
  }
}

export async function loadTaskMapDecompositionRefreshArtifact(
  taskMapRoot: string,
  ownerScopeDigest: string,
  projectionDigest: string,
): Promise<TaskMapDecompositionRefreshArtifactV1 | null> {
  if (!SHA256.test(ownerScopeDigest) || !SHA256.test(projectionDigest)) {
    return null;
  }
  return loadCurrentArtifact(
    taskMapDecompositionRefreshPath(taskMapRoot, projectionDigest),
    ownerScopeDigest,
    projectionDigest,
  );
}

export async function refreshTaskMapDecomposition(
  input: RefreshTaskMapDecompositionInputV1,
): Promise<TaskMapDecompositionRefreshArtifactV1> {
  if (!SHA256.test(input.ownerScopeDigest)) {
    throw new TypeError("Task Map decomposition owner binding is invalid");
  }
  const projectionDigest = taskMapContractDigest(input.projection);
  const artifactPath = taskMapDecompositionRefreshPath(
    input.taskMapRoot,
    projectionDigest,
  );
  const replayed = await loadCurrentArtifact(
    artifactPath,
    input.ownerScopeDigest,
    projectionDigest,
  );
  if (replayed !== null) return replayed;

  const methodLibrary = buildTaskMapMethodLibrary({ templates: [] });
  const selected = selectTaskMapDecompositionWorkItems(input.projection);
  let station: LlmStation | undefined;
  try {
    station = await (input.createStation ?? (() => createLlmStation()))();
  } catch {
    station = undefined;
  }
  const decompositionStation: TaskMapDecompositionStation | undefined =
    station === undefined
      ? undefined
      : {
          provider: station.provider,
          async run(request) {
            const envelope = await station.run(request);
            if (envelope.stationId !== "task-decomposition-v1") {
              throw new Error("decomposition station returned the wrong station id");
            }
            return {
              ...envelope,
              stationId: "task-decomposition-v1" as const,
            };
          },
        };
  const workItems: TaskMapDecompositionRefreshWorkItemV1[] = [];
  for (const workItem of selected) {
    const result = await proposeTaskMapDecomposition({
      workItem,
      library: methodLibrary,
      ...(decompositionStation === undefined
        ? {}
        : { station: decompositionStation }),
    });
    const validProposals: TaskMapDecompositionValidatedProposalV1[] = [];
    const validations: TaskMapDecompositionValidationResultV1[] = [];
    const rejected: TaskMapDecompositionRejectedProposalV1[] = [];
    for (const proposal of result.proposals) {
      const candidate = validationCandidate(proposal, result, workItem.taskId);
      const validation = validateTaskMapDecomposition(candidate, {
        projection: input.projection,
        sourceResult: result,
      });
      validations.push(validation);
      if (validation.valid) {
        validProposals.push({
          proposal,
          edges: candidate.edges,
          validationArtifactDigest: validation.artifactDigest,
        });
      } else {
        rejected.push({
          proposalId: proposal.proposalId,
          reasonCodes: validationReasonCodes(validation),
        });
      }
    }
    workItems.push({
      taskId: workItem.taskId,
      inputDigest: taskMapContractDigest(workItem),
      result,
      validProposals,
      validations,
      rejected,
    });
  }
  const unavailableCount = workItems.filter(
    (item) => item.result.unavailableReason !== null,
  ).length;
  const rejectedCount = workItems.filter(
    (item) => item.rejected.length > 0,
  ).length;
  const pendingCount = unavailableCount + rejectedCount;
  const state = unavailableCount > 0
    ? "unavailable" as const
    : rejectedCount > 0
      ? "deferred" as const
      : "current" as const;
  const degradationCode = unavailableCount > 0
    ? "llm_station_unavailable" as const
    : rejectedCount > 0
      ? "validation_failed" as const
      : null;
  const artifact = sealArtifact({
    contractVersion: TASKMAP_DECOMPOSITION_REFRESH_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    projectionDigest,
    methodLibrary,
    state,
    pendingCount,
    degradationCode,
    workItems,
    authority: {
      nodesWritten: false,
      edgesWritten: false,
      requiresOwnerAcceptance: true,
    },
  });
  await atomicPrivateWrite(artifactPath, artifact);
  return artifact;
}
