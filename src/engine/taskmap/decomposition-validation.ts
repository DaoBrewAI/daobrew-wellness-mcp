import {
  taskMapProjectionArtifactValidationReasons,
  taskMapProjectionPrivacyLeakReasons,
} from "./harness.js";
import {
  TASKMAP_DECOMPOSITION_PROPOSAL_VERSION,
  TASKMAP_DECOMPOSITION_STATION_ID,
  TASKMAP_METHOD_LIBRARY_LIMITS_V1,
  type TaskMapDecompositionProposalV1,
  type TaskMapDecompositionResultV1,
} from "./method-library.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type {
  BrainRelation,
  TaskMapProjectionV1,
} from "./types.js";

export const TASKMAP_DECOMPOSITION_VALIDATION_VERSION =
  "taskmap-decomposition-validation.v1" as const;

export const TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS = Object.freeze([
  "field_completeness",
  "citation_validity",
  "acyclicity",
  "edge_type_legality",
  "privacy_boundary",
] as const);

export type TaskMapDecompositionValidationStepId =
  (typeof TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS)[number];

export const TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1 = Object.freeze({
  maxSubtasks: 16,
  maxEdges: 64,
  maxCitationsPerItem: 32,
  maxIdCharacters: 512,
  maxTitleCharacters: 256,
  maxSummaryCharacters: 1_024,
  maxCandidateBytes: 1_048_576,
  maxSourceResultBytes: 1_048_576,
  maxArtifactBytes: 1_048_576,
});

export interface TaskMapDecompositionValidationSubtaskV1 {
  subtaskId: string;
  title: string;
  summary: string;
  citationPointerIds: string[];
}

export interface TaskMapDecompositionValidationEdgeV1 {
  id: string;
  from: string;
  to: string;
  relation: BrainRelation;
  citationPointerIds: string[];
}

/**
 * Owner-review candidate produced from a Task-7 proposal plus proposed graph
 * edges. It is validation input only; it is never written into the projection.
 */
export interface TaskMapDecompositionValidationCandidateV1 {
  proposalId: string;
  methodId: string;
  sourceResultArtifactDigest: string;
  sourceProposalDigest: string;
  parentTaskId: string;
  subtasks: TaskMapDecompositionValidationSubtaskV1[];
  edges: TaskMapDecompositionValidationEdgeV1[];
}

export interface TaskMapDecompositionValidationContextV1 {
  projection: TaskMapProjectionV1;
  sourceResult: TaskMapDecompositionResultV1;
}

export interface TaskMapDecompositionValidationStepV1 {
  stepId: TaskMapDecompositionValidationStepId;
  passed: boolean;
  reasons: string[];
}

export interface TaskMapDecompositionValidationResultV1 {
  contractVersion: typeof TASKMAP_DECOMPOSITION_VALIDATION_VERSION;
  proposalDigest: string;
  projectionDigest: string;
  valid: boolean;
  steps: TaskMapDecompositionValidationStepV1[];
  authority: {
    nodesWritten: false;
    edgesWritten: false;
    requiresOwnerAcceptance: true;
  };
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawBiometricsStored: false;
  };
  artifactDigest: string;
}

type JsonObject = Record<string, unknown>;
type NodeKind = "root" | "task";

const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL = /\p{Cc}/u;
const EXECUTION_RELATIONS = new Set(["depends_on", "blocks", "supersedes"]);
const LIVE_LLM_PROVIDERS = new Set([
  "claude-cli",
  "codex-cli",
  "cursor-cli",
  "gemini-remote",
]);
const VALID_RELATIONS = new Set<BrainRelation>([
  "advances",
  "depends_on",
  "blocks",
  "informed_by",
  "related_to",
  "supersedes",
]);
const CANDIDATE_KEYS = [
  "proposalId",
  "methodId",
  "sourceResultArtifactDigest",
  "sourceProposalDigest",
  "parentTaskId",
  "subtasks",
  "edges",
];
const SUBTASK_KEYS = ["subtaskId", "title", "summary", "citationPointerIds"];
const EDGE_KEYS = ["id", "from", "to", "relation", "citationPointerIds"];
const CONTEXT_KEYS = ["projection", "sourceResult"];
const SOURCE_RESULT_KEYS = [
  "contractVersion",
  "inputDigest",
  "libraryDigest",
  "source",
  "unavailableReason",
  "proposals",
  "llm",
  "authority",
  "privacy",
  "artifactDigest",
];
const SOURCE_PROPOSAL_KEYS = ["proposalId", "methodId", "subtasks"];
const SOURCE_LLM_KEYS = [
  "invocationState",
  "stationId",
  "modelId",
  "providerId",
  "transport",
  "promptDigest",
  "inputDigest",
  "outputDigest",
];
const SOURCE_AUTHORITY_KEYS = ["edgesWritten", "requiresOwnerAcceptance"];
const SOURCE_PRIVACY_KEYS = ["sourceBodiesStored", "localPathsStored", "rawBiometricsStored"];
const RESULT_KEYS = [
  "contractVersion",
  "proposalDigest",
  "projectionDigest",
  "valid",
  "steps",
  "authority",
  "privacy",
  "artifactDigest",
];
const STEP_KEYS = ["stepId", "passed", "reasons"];
const AUTHORITY_KEYS = ["nodesWritten", "edgesWritten", "requiresOwnerAcceptance"];
const RESULT_PRIVACY_KEYS = ["sourceBodiesStored", "localPathsStored", "rawBiometricsStored"];

function fail(message: string): never {
  throw new TypeError(`Task Map Station-3 decomposition validation: ${message}`);
}

function plain(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(reasons: readonly string[]): string[] {
  return [...new Set(reasons)].sort(compareText);
}

function exactKeyReasons(
  value: JsonObject,
  expected: readonly string[],
  label: string,
): string[] {
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index])
    ? []
    : [`${label} keys are invalid`];
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0
    && value.length <= maximum && !CONTROL.test(value);
}

function boundedId(value: unknown): value is string {
  return boundedText(value, TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxIdCharacters)
    && value === value.trim();
}

function boundedModelId(value: unknown): value is string {
  return boundedText(value, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxModelCharacters)
    && value === value.trim();
}

function jsonBytes(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : Buffer.byteLength(serialized, "utf8");
  } catch (_error: unknown) {
    return null;
  }
}

function digestOrInvalidMarker(value: unknown, marker: string): string {
  try {
    return taskMapContractDigest(value);
  } catch (_error: unknown) {
    return taskMapContractDigest({ invalidCanonicalInput: marker });
  }
}

function candidateSubtasks(candidate: unknown): unknown[] {
  if (!plain(candidate) || !Array.isArray(candidate.subtasks)) return [];
  return candidate.subtasks.slice(
    0,
    TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSubtasks + 1,
  );
}

function candidateEdges(candidate: unknown): unknown[] {
  if (!plain(candidate) || !Array.isArray(candidate.edges)) return [];
  return candidate.edges.slice(
    0,
    TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxEdges + 1,
  );
}

function sourceResultFrom(context: unknown): unknown {
  return plain(context) ? context.sourceResult : null;
}

function validOptionalDigest(value: unknown): boolean {
  return value === null || (typeof value === "string" && SHA256.test(value));
}

function validLlmProviderTransportCorrelation(provider: unknown, transport: unknown): boolean {
  return (provider === "offline-replay" && transport === "injected-offline")
    || (typeof provider === "string" && LIVE_LLM_PROVIDERS.has(provider)
      && transport === provider);
}

function sourceProposalShapeReasons(proposal: unknown, index: number): string[] {
  const reasons: string[] = [];
  if (!plain(proposal)) return [`Task-7 proposal ${index} must be an object`];
  reasons.push(...exactKeyReasons(proposal, SOURCE_PROPOSAL_KEYS, `Task-7 proposal ${index}`));
  if (!boundedId(proposal.proposalId)) reasons.push(`Task-7 proposal ${index} id is invalid`);
  if (!boundedId(proposal.methodId)) reasons.push(`Task-7 proposal ${index} method id is invalid`);
  if (!Array.isArray(proposal.subtasks) || proposal.subtasks.length === 0
    || proposal.subtasks.length > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSubtasks) {
    reasons.push(`Task-7 proposal ${index} subtask collection is invalid or unbounded`);
    return reasons;
  }
  const subtaskIds: string[] = [];
  for (const [subtaskIndex, subtask] of proposal.subtasks.entries()) {
    if (!plain(subtask)) {
      reasons.push(`Task-7 proposal ${index} subtask ${subtaskIndex} must be an object`);
      continue;
    }
    reasons.push(...exactKeyReasons(
      subtask,
      SUBTASK_KEYS,
      `Task-7 proposal ${index} subtask ${subtaskIndex}`,
    ));
    if (!boundedId(subtask.subtaskId)) {
      reasons.push(`Task-7 proposal ${index} subtask ${subtaskIndex} id is invalid`);
    } else {
      subtaskIds.push(subtask.subtaskId);
    }
    if (!boundedText(subtask.title,
      TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxTitleCharacters)) {
      reasons.push(`Task-7 proposal ${index} subtask ${subtaskIndex} title is invalid`);
    }
    if (!boundedText(subtask.summary,
      TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSummaryCharacters)) {
      reasons.push(`Task-7 proposal ${index} subtask ${subtaskIndex} summary is invalid`);
    }
    if (!Array.isArray(subtask.citationPointerIds)
      || subtask.citationPointerIds.length === 0
      || subtask.citationPointerIds.length
        > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxCitationsPerItem
      || subtask.citationPointerIds.some((pointer) => !boundedId(pointer))
      || new Set(subtask.citationPointerIds).size !== subtask.citationPointerIds.length) {
      reasons.push(`Task-7 proposal ${index} subtask ${subtaskIndex} citations are invalid`);
    }
  }
  if (new Set(subtaskIds).size !== subtaskIds.length) {
    reasons.push(`Task-7 proposal ${index} subtask ids must be unique`);
  }
  return reasons;
}

function task7BindingReasons(candidate: unknown, context: unknown): string[] {
  const reasons: string[] = [];
  const sourceResult = sourceResultFrom(context);
  const sourceBytes = jsonBytes(sourceResult);
  if (sourceBytes === null
    || sourceBytes > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSourceResultBytes) {
    return ["referenced Task-7 result is not bounded canonical JSON"];
  }
  if (!plain(sourceResult)) return ["referenced Task-7 result must be an object"];
  reasons.push(...exactKeyReasons(sourceResult, SOURCE_RESULT_KEYS, "referenced Task-7 result"));
  if (sourceResult.contractVersion !== TASKMAP_DECOMPOSITION_PROPOSAL_VERSION
    || typeof sourceResult.inputDigest !== "string" || !SHA256.test(sourceResult.inputDigest)
    || typeof sourceResult.libraryDigest !== "string" || !SHA256.test(sourceResult.libraryDigest)
    || typeof sourceResult.artifactDigest !== "string" || !SHA256.test(sourceResult.artifactDigest)
    || (sourceResult.source !== "method_library" && sourceResult.source !== "llm_station")
    || !Array.isArray(sourceResult.proposals)
    || sourceResult.proposals.length > 3) {
    reasons.push("referenced Task-7 result binding is invalid");
  }
  if (sourceResult.unavailableReason !== null && sourceResult.unavailableReason !== "llm_station_unavailable"
    && sourceResult.unavailableReason !== "llm_station_invalid_output") {
    reasons.push("referenced Task-7 unavailable reason is invalid");
  }
  if (sourceResult.proposals !== undefined && Array.isArray(sourceResult.proposals)) {
    for (const [index, proposal] of sourceResult.proposals.entries()) {
      reasons.push(...sourceProposalShapeReasons(proposal, index));
    }
    const proposalIds = sourceResult.proposals.flatMap((proposal) =>
      plain(proposal) && typeof proposal.proposalId === "string" ? [proposal.proposalId] : []);
    if (new Set(proposalIds).size !== proposalIds.length) {
      reasons.push("referenced Task-7 proposal ids must be unique");
    }
  }
  if (!plain(sourceResult.llm)) {
    reasons.push("referenced Task-7 LLM provenance is invalid");
  } else {
    reasons.push(...exactKeyReasons(sourceResult.llm, SOURCE_LLM_KEYS, "referenced Task-7 LLM provenance"));
    if (sourceResult.llm.stationId !== TASKMAP_DECOMPOSITION_STATION_ID
      || !["not_invoked", "invoked", "unavailable"].includes(String(sourceResult.llm.invocationState))
      || sourceResult.llm.inputDigest !== sourceResult.inputDigest
      || !validOptionalDigest(sourceResult.llm.promptDigest)
      || !validOptionalDigest(sourceResult.llm.outputDigest)) {
      reasons.push("referenced Task-7 LLM provenance binding is invalid");
    }
  }
  const proposalCount = Array.isArray(sourceResult.proposals)
    ? sourceResult.proposals.length
    : -1;
  if (sourceResult.source === "method_library") {
    if (proposalCount !== 1 || sourceResult.unavailableReason !== null
      || !plain(sourceResult.llm) || sourceResult.llm.invocationState !== "not_invoked"
      || sourceResult.llm.modelId !== null || sourceResult.llm.providerId !== null
      || sourceResult.llm.transport !== null || sourceResult.llm.promptDigest !== null
      || sourceResult.llm.outputDigest !== null) {
      reasons.push("referenced Task-7 method-library result invariants are invalid");
    }
  } else if (sourceResult.source === "llm_station" && proposalCount > 0) {
    if (sourceResult.unavailableReason !== null || !plain(sourceResult.llm)
      || sourceResult.llm.invocationState !== "invoked"
      || !boundedModelId(sourceResult.llm.modelId)
      || !validLlmProviderTransportCorrelation(
        sourceResult.llm.providerId,
        sourceResult.llm.transport,
      )
      || typeof sourceResult.llm.promptDigest !== "string"
      || !SHA256.test(sourceResult.llm.promptDigest)
      || typeof sourceResult.llm.outputDigest !== "string"
      || !SHA256.test(sourceResult.llm.outputDigest)) {
      reasons.push("referenced Task-7 invoked LLM result invariants are invalid");
    }
  } else if (sourceResult.source === "llm_station" && proposalCount === 0) {
    const unavailableProvenance = plain(sourceResult.llm)
      && sourceResult.llm.modelId === null
      && sourceResult.llm.providerId === null
      && sourceResult.llm.transport === null;
    const invalidOutputProvenance = plain(sourceResult.llm)
      && boundedModelId(sourceResult.llm.modelId)
      && validLlmProviderTransportCorrelation(
        sourceResult.llm.providerId,
        sourceResult.llm.transport,
      );
    if ((sourceResult.unavailableReason !== "llm_station_unavailable"
      && sourceResult.unavailableReason !== "llm_station_invalid_output")
      || !plain(sourceResult.llm) || sourceResult.llm.invocationState !== "unavailable"
      || typeof sourceResult.llm.promptDigest !== "string"
      || !SHA256.test(sourceResult.llm.promptDigest)
      || (!unavailableProvenance && !invalidOutputProvenance)
      || (sourceResult.unavailableReason === "llm_station_unavailable"
        && (!unavailableProvenance || sourceResult.llm.outputDigest !== null))
      || (sourceResult.unavailableReason === "llm_station_invalid_output"
        && !invalidOutputProvenance)) {
      reasons.push("referenced Task-7 unavailable zero-proposal LLM state is invalid");
    }
  }
  if (!plain(sourceResult.authority)) {
    reasons.push("referenced Task-7 authority is invalid");
  } else if (exactKeyReasons(
    sourceResult.authority,
    SOURCE_AUTHORITY_KEYS,
    "referenced Task-7 authority",
  ).length > 0 || sourceResult.authority.edgesWritten !== false
    || sourceResult.authority.requiresOwnerAcceptance !== true) {
    reasons.push("referenced Task-7 authority is invalid");
  }
  if (!plain(sourceResult.privacy)) {
    reasons.push("referenced Task-7 privacy is invalid");
  } else if (exactKeyReasons(
    sourceResult.privacy,
    SOURCE_PRIVACY_KEYS,
    "referenced Task-7 privacy",
  ).length > 0 || sourceResult.privacy.sourceBodiesStored !== false
    || sourceResult.privacy.localPathsStored !== false
    || sourceResult.privacy.rawBiometricsStored !== false) {
    reasons.push("referenced Task-7 privacy is invalid");
  }
  try {
    const { artifactDigest: _artifactDigest, ...core } = sourceResult;
    if (taskMapContractDigest(core) !== sourceResult.artifactDigest) {
      reasons.push("referenced Task-7 result artifact seal is invalid");
    }
  } catch (_error: unknown) {
    reasons.push("referenced Task-7 result artifact seal is invalid");
  }
  if (!plain(candidate)) return uniqueSorted(reasons);
  if (typeof candidate.sourceResultArtifactDigest !== "string"
    || !SHA256.test(candidate.sourceResultArtifactDigest)
    || candidate.sourceResultArtifactDigest !== sourceResult.artifactDigest) {
    reasons.push("candidate sourceResultArtifactDigest does not bind the Task-7 result");
  }
  if (typeof candidate.sourceProposalDigest !== "string"
    || !SHA256.test(candidate.sourceProposalDigest)) {
    reasons.push("candidate sourceProposalDigest is missing or invalid");
  }
  const selected = Array.isArray(sourceResult.proposals)
    ? sourceResult.proposals.filter((proposal) =>
      plain(proposal) && proposal.proposalId === candidate.proposalId)
    : [];
  if (selected.length !== 1 || !plain(selected[0])) {
    reasons.push("candidate proposal is absent from the referenced Task-7 result");
    return uniqueSorted(reasons);
  }
  const selectedDigest = taskMapContractDigest(selected[0]);
  if (candidate.sourceProposalDigest !== selectedDigest) {
    reasons.push("candidate sourceProposalDigest does not bind the selected Task-7 proposal");
  }
  const candidateProposal = {
    proposalId: candidate.proposalId,
    methodId: candidate.methodId,
    subtasks: candidate.subtasks,
  };
  const selectedOrdinal = (sourceResult.proposals as unknown[]).indexOf(selected[0]);
  const selectedSubtaskValues: unknown[] = Array.isArray(selected[0].subtasks)
    ? selected[0].subtasks
    : [];
  const selectedSubtasks = selectedSubtaskValues.length > 0
    ? selectedSubtaskValues.flatMap((subtask) => {
      if (!plain(subtask)) return [];
      return [{
        title: subtask.title,
        summary: subtask.summary,
        citationPointerIds: subtask.citationPointerIds,
      }];
    })
    : [];
  if (typeof candidate.parentTaskId !== "string" || selectedOrdinal < 0
    || selectedSubtasks.length !== selectedSubtaskValues.length) {
    reasons.push("candidate cannot reconstruct its Task-7 parent identity");
  } else {
    const expectedProposalId = `tmdecomp_${taskMapContractDigest({
      taskId: candidate.parentTaskId,
      methodId: selected[0].methodId,
      subtasks: selectedSubtasks,
      ordinal: selectedOrdinal,
    }).slice(0, 16)}`;
    if (selected[0].proposalId !== expectedProposalId) {
      reasons.push("selected Task-7 proposal identity does not bind parentTaskId");
    }
    for (const [index, selectedSubtask] of selectedSubtaskValues.entries()) {
      if (!plain(selectedSubtask)) continue;
      const canonicalSubtask = {
        title: selectedSubtask.title,
        summary: selectedSubtask.summary,
        citationPointerIds: selectedSubtask.citationPointerIds,
      };
      const expectedSubtaskId = `tmds_${taskMapContractDigest({
        proposalId: selected[0].proposalId,
        index,
        subtask: canonicalSubtask,
      }).slice(0, 16)}`;
      if (selectedSubtask.subtaskId !== expectedSubtaskId) {
        reasons.push(`selected Task-7 subtask ${index} identity is invalid`);
      }
    }
  }
  try {
    if (taskMapContractCanonicalJson(candidateProposal)
      !== taskMapContractCanonicalJson(
        selected[0] as unknown as TaskMapDecompositionProposalV1,
      )) {
      reasons.push("candidate proposal differs from the exact canonical Task-7 proposal");
    }
  } catch (_error: unknown) {
    reasons.push("candidate proposal differs from the exact canonical Task-7 proposal");
  }
  return uniqueSorted(reasons);
}

function projectionFrom(context: unknown): TaskMapProjectionV1 | null {
  if (!plain(context) || !plain(context.projection)) return null;
  return context.projection as unknown as TaskMapProjectionV1;
}

function fieldCompletenessReasons(candidate: unknown, context: unknown): string[] {
  const reasons: string[] = [];
  const bytes = jsonBytes(candidate);
  if (bytes === null
    || bytes > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxCandidateBytes) {
    reasons.push("candidate is not bounded canonical JSON");
  }
  if (!plain(candidate)) {
    reasons.push("candidate must be an object");
  } else {
    reasons.push(...exactKeyReasons(candidate, CANDIDATE_KEYS, "candidate"));
    if (!boundedId(candidate.proposalId)) reasons.push("proposalId is missing or unbounded");
    if (!boundedId(candidate.methodId)) reasons.push("methodId is missing or unbounded");
    if (typeof candidate.sourceResultArtifactDigest !== "string"
      || !SHA256.test(candidate.sourceResultArtifactDigest)) {
      reasons.push("sourceResultArtifactDigest is missing or invalid");
    }
    if (typeof candidate.sourceProposalDigest !== "string"
      || !SHA256.test(candidate.sourceProposalDigest)) {
      reasons.push("sourceProposalDigest is missing or invalid");
    }
    if (!boundedId(candidate.parentTaskId)) reasons.push("parentTaskId is missing or unbounded");
    if (!Array.isArray(candidate.subtasks) || candidate.subtasks.length === 0
      || candidate.subtasks.length > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSubtasks) {
      reasons.push("subtask collection is missing, empty, or unbounded");
    }
    if (!Array.isArray(candidate.edges)
      || candidate.edges.length > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxEdges) {
      reasons.push("edge collection is missing or unbounded");
    }
  }
  if (!plain(context)) {
    reasons.push("validation context must be an object");
  } else {
    reasons.push(...exactKeyReasons(context, CONTEXT_KEYS, "validation context"));
    if (!plain(context.projection)) reasons.push("validation projection is missing");
    if (!plain(context.sourceResult)) reasons.push("referenced Task-7 result is missing");
  }

  const projection = projectionFrom(context);
  if (projection !== null) {
    try {
      reasons.push(...taskMapProjectionArtifactValidationReasons(projection)
        .map((reason) => `projection artifact: ${reason}`));
    } catch (_error: unknown) {
      reasons.push("projection artifact validation failed");
    }
  }
  reasons.push(...task7BindingReasons(candidate, context));

  const subtaskIds: string[] = [];
  for (const [index, subtask] of candidateSubtasks(candidate).entries()) {
    if (!plain(subtask)) {
      reasons.push(`subtask ${index} must be an object`);
      continue;
    }
    reasons.push(...exactKeyReasons(subtask, SUBTASK_KEYS, `subtask ${index}`));
    if (!boundedId(subtask.subtaskId)) reasons.push(`subtask ${index} id is missing or unbounded`);
    else subtaskIds.push(subtask.subtaskId);
    if (!boundedText(subtask.title,
      TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxTitleCharacters)) {
      reasons.push(`subtask ${index} title is missing or unbounded`);
    }
    if (!boundedText(subtask.summary,
      TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSummaryCharacters)) {
      reasons.push(`subtask ${index} summary is missing or unbounded`);
    }
    if (!Array.isArray(subtask.citationPointerIds)
      || subtask.citationPointerIds.length === 0
      || subtask.citationPointerIds.length
        > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxCitationsPerItem
      || subtask.citationPointerIds.some((pointer) => !boundedId(pointer))
      || new Set(subtask.citationPointerIds).size !== subtask.citationPointerIds.length) {
      reasons.push(`subtask ${index} citations are missing, duplicate, or unbounded`);
    }
  }
  if (new Set(subtaskIds).size !== subtaskIds.length) reasons.push("subtask ids must be unique");

  const edgeIds: string[] = [];
  for (const [index, edge] of candidateEdges(candidate).entries()) {
    if (!plain(edge)) {
      reasons.push(`edge ${index} must be an object`);
      continue;
    }
    reasons.push(...exactKeyReasons(edge, EDGE_KEYS, `edge ${index}`));
    if (!boundedId(edge.id)) reasons.push(`edge ${index} id is missing or unbounded`);
    else edgeIds.push(edge.id);
    if (!boundedId(edge.from) || !boundedId(edge.to)) {
      reasons.push(`edge ${index} endpoints are missing or unbounded`);
    }
    if (!boundedId(edge.relation)) reasons.push(`edge ${index} relation is missing or unbounded`);
    if (!Array.isArray(edge.citationPointerIds)
      || edge.citationPointerIds.length === 0
      || edge.citationPointerIds.length
        > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxCitationsPerItem
      || edge.citationPointerIds.some((pointer) => !boundedId(pointer))
      || new Set(edge.citationPointerIds).size !== edge.citationPointerIds.length) {
      reasons.push(`edge ${index} citations are missing, duplicate, or unbounded`);
    }
  }
  if (new Set(edgeIds).size !== edgeIds.length) reasons.push("edge ids must be unique");
  return uniqueSorted(reasons);
}

function citationValidityReasons(candidate: unknown, context: unknown): string[] {
  const projection = projectionFrom(context);
  if (projection === null || !Array.isArray(projection.sources)) {
    return ["projection sources are unavailable for citation validation"];
  }
  const sources = new Map(projection.sources.flatMap((source) =>
    plain(source) && typeof source.id === "string"
      ? [[source.id, source] as const]
      : []));
  const reasons: string[] = [];
  const endpointSupports = new Map<string, Set<string>>();
  for (const root of Array.isArray(projection.roots) ? projection.roots : []) {
    if (!plain(root) || typeof root.id !== "string") continue;
    endpointSupports.set(root.id, new Set(Array.isArray(root.citations)
      ? root.citations.flatMap((citation) =>
        plain(citation) && typeof citation.pointerId === "string" ? [citation.pointerId] : [])
      : []));
  }
  for (const task of Array.isArray(projection.tasks) ? projection.tasks : []) {
    if (!plain(task) || typeof task.id !== "string") continue;
    const support = new Set<string>();
    if (Array.isArray(task.citations)) {
      for (const citation of task.citations) {
        if (plain(citation) && typeof citation.pointerId === "string") {
          support.add(citation.pointerId);
        }
      }
    }
    if (typeof task.taskHomePointerId === "string") support.add(task.taskHomePointerId);
    if (Array.isArray(task.originPointerIds)) {
      for (const pointerId of task.originPointerIds) {
        if (typeof pointerId === "string") support.add(pointerId);
      }
    }
    endpointSupports.set(task.id, support);
  }
  for (const subtask of candidateSubtasks(candidate)) {
    if (!plain(subtask) || typeof subtask.subtaskId !== "string") continue;
    endpointSupports.set(subtask.subtaskId, new Set(Array.isArray(subtask.citationPointerIds)
      ? subtask.citationPointerIds.filter((pointer): pointer is string => typeof pointer === "string")
      : []));
  }
  const parentSupport = plain(candidate) && typeof candidate.parentTaskId === "string"
    ? endpointSupports.get(candidate.parentTaskId)
    : undefined;
  for (const [kind, values] of [
    ["subtask", candidateSubtasks(candidate)],
    ["edge", candidateEdges(candidate)],
  ] as const) {
    for (const [index, value] of values.entries()) {
      if (!plain(value) || !Array.isArray(value.citationPointerIds)) continue;
      for (const pointerId of value.citationPointerIds) {
        if (typeof pointerId !== "string") continue;
        const source = sources.get(pointerId);
        if (source === undefined) {
          reasons.push(`${kind} ${index} cites an unknown projection source pointer`);
        } else if (source.sourceKind === "oura") {
          reasons.push(`${kind} ${index} cites body-only evidence instead of a non-body source`);
        }
      }
      const pointerIds = value.citationPointerIds
        .filter((pointer): pointer is string => typeof pointer === "string");
      if (kind === "subtask" && parentSupport !== undefined
        && pointerIds.some((pointerId) => !parentSupport.has(pointerId))) {
        reasons.push(`subtask ${index} citation does not support parentTaskId`);
      }
      if (kind === "edge" && typeof value.from === "string" && typeof value.to === "string") {
        const fromSupport = endpointSupports.get(value.from);
        const toSupport = endpointSupports.get(value.to);
        if (fromSupport !== undefined && !pointerIds.some((pointerId) => fromSupport.has(pointerId))) {
          reasons.push(`edge ${index} citations do not support the from endpoint`);
        }
        if (toSupport !== undefined && !pointerIds.some((pointerId) => toSupport.has(pointerId))) {
          reasons.push(`edge ${index} citations do not support the to endpoint`);
        }
        const endpointUnion = new Set([...(fromSupport ?? []), ...(toSupport ?? [])]);
        if (pointerIds.some((pointerId) => !endpointUnion.has(pointerId))) {
          reasons.push(`edge ${index} contains citation evidence unrelated to its endpoints`);
        }
      }
    }
  }
  return uniqueSorted(reasons);
}

function executionEdges(candidate: unknown, context: unknown): Array<{
  id: string;
  from: string;
  to: string;
  proposed: boolean;
  proposedIndex: number | null;
}> {
  const projection = projectionFrom(context);
  const existing = projection !== null && Array.isArray(projection.edges)
    ? projection.edges
      .filter((edge) => plain(edge) && EXECUTION_RELATIONS.has(String(edge.relation))
        && typeof edge.id === "string" && typeof edge.from === "string"
        && typeof edge.to === "string")
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        proposed: false,
        proposedIndex: null,
      }))
    : [];
  const proposed = candidateEdges(candidate).flatMap((edge, proposedIndex) => {
    if (!plain(edge) || !EXECUTION_RELATIONS.has(String(edge.relation))
      || typeof edge.id !== "string" || typeof edge.from !== "string"
      || typeof edge.to !== "string") return [];
    return [{
      id: edge.id,
      from: edge.from,
      to: edge.to,
      proposed: true,
      proposedIndex,
    }];
  });
  return [...existing, ...proposed];
}

function acyclicityReasons(candidate: unknown, context: unknown): string[] {
  const edges = executionEdges(candidate, context);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const next = adjacency.get(edge.from) ?? [];
    next.push(edge.to);
    next.sort(compareText);
    adjacency.set(edge.from, next);
  }
  const hasPath = (start: string, target: string): boolean => {
    const pending = [start];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      pending.push(...(adjacency.get(current) ?? []));
    }
    return false;
  };
  return uniqueSorted(edges
    .filter((edge) => hasPath(edge.to, edge.from))
    .map((edge) => edge.proposed
      ? `proposed execution edge ${edge.proposedIndex} creates a cycle`
      : "existing execution graph contains a cycle"));
}

function edgeTypeLegalityReasons(candidate: unknown, context: unknown): string[] {
  const projection = projectionFrom(context);
  if (projection === null || !Array.isArray(projection.roots)
    || !Array.isArray(projection.tasks) || !Array.isArray(projection.edges)) {
    return ["projection graph is unavailable for edge validation"];
  }
  const nodeKinds = new Map<string, NodeKind>();
  const projectionTasks = new Map<string, TaskMapProjectionV1["tasks"][number]>();
  for (const root of projection.roots) {
    if (plain(root) && typeof root.id === "string") nodeKinds.set(root.id, "root");
  }
  for (const task of projection.tasks) {
    if (plain(task) && typeof task.id === "string") {
      nodeKinds.set(task.id, "task");
      projectionTasks.set(task.id, task as TaskMapProjectionV1["tasks"][number]);
    }
  }
  const reasons: string[] = [];
  const globalGraphIds = new Set(nodeKinds.keys());
  for (const existingEdge of projection.edges) {
    if (!plain(existingEdge) || typeof existingEdge.id !== "string") continue;
    if (globalGraphIds.has(existingEdge.id)) {
      reasons.push("projection graph contains a global identity collision");
    }
    globalGraphIds.add(existingEdge.id);
  }
  const proposedSubtaskIds = new Set<string>();
  for (const [index, subtask] of candidateSubtasks(candidate).entries()) {
    if (!plain(subtask) || typeof subtask.subtaskId !== "string") continue;
    if (globalGraphIds.has(subtask.subtaskId)) {
      reasons.push(`subtask ${index} id causes a global graph identity collision`);
    }
    globalGraphIds.add(subtask.subtaskId);
    proposedSubtaskIds.add(subtask.subtaskId);
    nodeKinds.set(subtask.subtaskId, "task");
  }
  if (!plain(candidate) || typeof candidate.parentTaskId !== "string"
    || nodeKinds.get(candidate.parentTaskId) !== "task"
    || proposedSubtaskIds.has(candidate.parentTaskId)) {
    reasons.push("parentTaskId must reference an existing projection task");
  }
  const existingEdgeIds = new Set(projection.edges
    .map((edge) => plain(edge) && typeof edge.id === "string" ? edge.id : null)
    .filter((edgeId): edgeId is string => edgeId !== null));
  const edgeIdentities = new Set<string>();
  for (const existingEdge of projection.edges) {
    if (!plain(existingEdge) || typeof existingEdge.from !== "string"
      || typeof existingEdge.to !== "string" || typeof existingEdge.relation !== "string") continue;
    const identity = `${existingEdge.from}\u0000${existingEdge.relation}\u0000${existingEdge.to}`;
    if (edgeIdentities.has(identity)) reasons.push("projection contains a duplicate edge identity");
    edgeIdentities.add(identity);
  }
  for (const [index, edge] of candidateEdges(candidate).entries()) {
    if (!plain(edge)) continue;
    if (typeof edge.id === "string") {
      if (globalGraphIds.has(edge.id)) {
        reasons.push(`edge ${index} id causes a global graph identity collision`);
      }
      globalGraphIds.add(edge.id);
    }
    if (typeof edge.id === "string" && existingEdgeIds.has(edge.id)) {
      reasons.push(`edge ${index} id collides with the projection graph`);
    }
    if (typeof edge.from !== "string" || typeof edge.to !== "string") continue;
    if (typeof edge.relation === "string") {
      const identity = `${edge.from}\u0000${edge.relation}\u0000${edge.to}`;
      if (edgeIdentities.has(identity)) reasons.push(`edge ${index} duplicates an existing edge identity`);
      edgeIdentities.add(identity);
    }
    const from = nodeKinds.get(edge.from);
    const to = nodeKinds.get(edge.to);
    if (from === undefined || to === undefined) {
      reasons.push(`edge ${index} endpoints must exist in the projection or proposal`);
      continue;
    }
    if (edge.from === edge.to) reasons.push(`edge ${index} cannot be a self edge`);
    if (!proposedSubtaskIds.has(edge.from) && !proposedSubtaskIds.has(edge.to)) {
      reasons.push(`edge ${index} must reference a proposed subtask`);
    }
    if (!VALID_RELATIONS.has(edge.relation as BrainRelation)) {
      reasons.push(`edge ${index} relation is invalid`);
      continue;
    }
    if (edge.relation === "advances" && (from !== "root" || to !== "task")) {
      reasons.push(`edge ${index} advances requires root-to-task endpoints`);
    } else if (["depends_on", "blocks", "supersedes", "informed_by"].includes(
      edge.relation as string,
    ) && (from !== "task" || to !== "task")) {
      reasons.push(`edge ${index} relation requires task-to-task endpoints`);
    } else if (edge.relation === "related_to" && from !== to) {
      reasons.push(`edge ${index} related_to requires same-kind endpoints`);
    }
    if (edge.relation === "supersedes" && to === "task") {
      const target = projectionTasks.get(edge.to);
      if (target === undefined) {
        reasons.push(`edge ${index} supersedes target must be an existing projection task`);
      } else {
        if (target.authority === "source_system") {
          reasons.push(`edge ${index} supersedes cannot override a source-owned task`);
        }
        if (target.openState !== "superseded") {
          reasons.push(`edge ${index} supersedes target must have explicit superseded open state`);
        }
      }
    }
  }
  if (plain(candidate) && typeof candidate.parentTaskId === "string") {
    const undirected = new Map<string, string[]>();
    for (const edge of candidateEdges(candidate)) {
      if (!plain(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") continue;
      undirected.set(edge.from, [...(undirected.get(edge.from) ?? []), edge.to]);
      undirected.set(edge.to, [...(undirected.get(edge.to) ?? []), edge.from]);
    }
    const reachable = new Set<string>();
    const pending = [candidate.parentTaskId];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      pending.push(...(undirected.get(current) ?? []));
    }
    for (const [index, subtaskId] of [...proposedSubtaskIds].entries()) {
      if (!reachable.has(subtaskId)) {
        reasons.push(`subtask ${index} is orphaned from parentTaskId`);
      }
    }
  }
  return uniqueSorted(reasons);
}

function privacyBoundaryReasons(candidate: unknown): string[] {
  const bytes = jsonBytes(candidate);
  if (bytes === null
    || bytes > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxCandidateBytes) {
    return ["privacy validation rejected an unbounded candidate"];
  }
  return uniqueSorted(taskMapProjectionPrivacyLeakReasons(candidate));
}

function step(
  stepId: TaskMapDecompositionValidationStepId,
  reasons: readonly string[],
): TaskMapDecompositionValidationStepV1 {
  const normalized = uniqueSorted(reasons);
  return { stepId, passed: normalized.length === 0, reasons: normalized };
}

export function validateTaskMapDecomposition(
  candidate: TaskMapDecompositionValidationCandidateV1 | unknown,
  context: TaskMapDecompositionValidationContextV1 | unknown,
): TaskMapDecompositionValidationResultV1 {
  const steps = [
    step("field_completeness", fieldCompletenessReasons(candidate, context)),
    step("citation_validity", citationValidityReasons(candidate, context)),
    step("acyclicity", acyclicityReasons(candidate, context)),
    step("edge_type_legality", edgeTypeLegalityReasons(candidate, context)),
    step("privacy_boundary", privacyBoundaryReasons(candidate)),
  ];
  const projection = projectionFrom(context);
  const core = {
    contractVersion: TASKMAP_DECOMPOSITION_VALIDATION_VERSION,
    proposalDigest: digestOrInvalidMarker(candidate, "proposal"),
    projectionDigest: digestOrInvalidMarker(projection, "projection"),
    valid: steps.every((candidateStep) => candidateStep.passed),
    steps,
    authority: {
      nodesWritten: false as const,
      edgesWritten: false as const,
      requiresOwnerAcceptance: true as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
    },
  };
  const result = { ...core, artifactDigest: taskMapContractDigest(core) };
  if (Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
    > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxArtifactBytes) {
    fail("validation artifact exceeds its bounded ceiling");
  }
  return result;
}

function assertResultShape(
  value: unknown,
): asserts value is TaskMapDecompositionValidationResultV1 {
  if (!plain(value)) fail("result must be an object");
  if (exactKeyReasons(value, RESULT_KEYS, "result").length > 0
    || value.contractVersion !== TASKMAP_DECOMPOSITION_VALIDATION_VERSION
    || typeof value.proposalDigest !== "string" || !SHA256.test(value.proposalDigest)
    || typeof value.projectionDigest !== "string" || !SHA256.test(value.projectionDigest)
    || typeof value.valid !== "boolean"
    || typeof value.artifactDigest !== "string" || !SHA256.test(value.artifactDigest)
    || !Array.isArray(value.steps)
    || value.steps.length !== TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS.length
    || !plain(value.authority) || !plain(value.privacy)) fail("result shape is invalid");
  if (exactKeyReasons(value.authority, AUTHORITY_KEYS, "result authority").length > 0
    || value.authority.nodesWritten !== false || value.authority.edgesWritten !== false
    || value.authority.requiresOwnerAcceptance !== true) fail("result authority is invalid");
  if (exactKeyReasons(value.privacy, RESULT_PRIVACY_KEYS, "result privacy").length > 0
    || value.privacy.sourceBodiesStored !== false || value.privacy.localPathsStored !== false
    || value.privacy.rawBiometricsStored !== false) fail("result privacy is invalid");
  for (const [index, candidateStep] of value.steps.entries()) {
    if (!plain(candidateStep)
      || exactKeyReasons(candidateStep, STEP_KEYS, `result step ${index}`).length > 0
      || candidateStep.stepId !== TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS[index]
      || typeof candidateStep.passed !== "boolean"
      || !Array.isArray(candidateStep.reasons)
      || candidateStep.reasons.some((reason) => !boundedText(reason, 1_024))) {
      fail(`result step ${index} is invalid`);
    }
  }
}

export function validateTaskMapDecompositionValidationResult(
  value: unknown,
  candidate: TaskMapDecompositionValidationCandidateV1 | unknown,
  context: TaskMapDecompositionValidationContextV1 | unknown,
): TaskMapDecompositionValidationResultV1 {
  const suppliedBytes = jsonBytes(value);
  if (suppliedBytes === null
    || suppliedBytes > TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxArtifactBytes) {
    fail("supplied validation result exceeds its bounded byte ceiling");
  }
  assertResultShape(value);
  const rebuilt = validateTaskMapDecomposition(candidate, context);
  if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(rebuilt)) {
    fail("result canonical validation or digest binding failed");
  }
  return value;
}
