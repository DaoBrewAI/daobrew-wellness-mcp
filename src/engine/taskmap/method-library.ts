import type {
  DetectedLlmProvider,
  LlmProviderId,
} from "./llm-station.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
} from "./mention-extraction.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_METHOD_LIBRARY_VERSION =
  "taskmap-method-library.v1" as const;
export const TASKMAP_DECOMPOSITION_PROPOSAL_VERSION =
  "taskmap-decomposition-proposal.v1" as const;
export const TASKMAP_DECOMPOSITION_STATION_ID =
  "task-decomposition-v1" as const;

export const TASKMAP_METHOD_LIBRARY_LIMITS_V1 = Object.freeze({
  maxTemplates: 128,
  maxCandidateProposals: 16,
  maxPublishedProposals: 3,
  maxSubtasksPerProposal: 16,
  maxPromptCharacters: 32_768,
  maxOutputBytes: 65_536,
  maxArtifactBytes: 1_048_576,
  maxIdCharacters: 512,
  maxDomainSignatureCharacters: 128,
  maxTitleCharacters: 256,
  maxSummaryCharacters: 1_024,
  maxCitationPointers: 32,
  maxModelCharacters: 256,
});

export interface TaskMapMethodTemplateSubtaskV1 {
  title: string;
  summary: string;
}

export interface TaskMapMethodTemplateV1 {
  templateId: string;
  domainSignature: string;
  methodId: string;
  subtasks: readonly TaskMapMethodTemplateSubtaskV1[];
}

export interface TaskMapMethodLibraryV1 {
  contractVersion: typeof TASKMAP_METHOD_LIBRARY_VERSION;
  templates: readonly TaskMapMethodTemplateV1[];
  authority: {
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

export interface TaskMapDecompositionWorkItemV1 {
  taskId: string;
  domainSignature: string;
  title: string;
  summary: string;
  citationPointerIds: readonly string[];
}

export interface TaskMapDecompositionStationRequest {
  stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
  promptText: string;
  inputDigest: string;
}

export interface TaskMapDecompositionStationEnvelope {
  stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
  model: string;
  promptDigest: string;
  inputDigest: string;
  outputJson: string;
  producedAt: string;
  transport: LlmProviderId;
}

/** High-level production seam, matching LlmStation provider/run conventions. */
export interface TaskMapDecompositionStation {
  readonly provider: DetectedLlmProvider;
  run(
    request: TaskMapDecompositionStationRequest,
  ): Promise<TaskMapDecompositionStationEnvelope>;
}

export interface TaskMapDecompositionReplayResult {
  outputJson: string;
}

/** Recorded-output seam only; it never receives an executable or argv. */
export type TaskMapDecompositionReplayRunner = (
  request: TaskMapDecompositionStationRequest,
) => Promise<TaskMapDecompositionReplayResult>;

export interface TaskMapDecompositionSubtaskV1 {
  subtaskId: string;
  title: string;
  summary: string;
  citationPointerIds: string[];
}

export interface TaskMapDecompositionProposalV1 {
  proposalId: string;
  methodId: string;
  subtasks: TaskMapDecompositionSubtaskV1[];
}

export type TaskMapDecompositionUnavailableReason =
  | "llm_station_unavailable"
  | "llm_station_invalid_output";

export interface TaskMapDecompositionResultV1 {
  contractVersion: typeof TASKMAP_DECOMPOSITION_PROPOSAL_VERSION;
  inputDigest: string;
  libraryDigest: string;
  source: "method_library" | "llm_station";
  unavailableReason: TaskMapDecompositionUnavailableReason | null;
  proposals: TaskMapDecompositionProposalV1[];
  llm: {
    invocationState: "not_invoked" | "invoked" | "unavailable";
    stationId: typeof TASKMAP_DECOMPOSITION_STATION_ID;
    modelId: string | null;
    providerId: LlmProviderId | "offline-replay" | null;
    transport: LlmProviderId | "injected-offline" | null;
    promptDigest: string | null;
    inputDigest: string;
    outputDigest: string | null;
  };
  authority: {
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
const SHA256 = /^[a-f0-9]{64}$/;
const DOMAIN_SIGNATURE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CONTROL = /\p{Cc}/u;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const TEMPLATE_KEYS = ["templateId", "domainSignature", "methodId", "subtasks"];
const TEMPLATE_SUBTASK_KEYS = ["title", "summary"];
const LIBRARY_AUTHORITY_KEYS = ["edgesWritten", "requiresOwnerAcceptance"];
const LIBRARY_PRIVACY_KEYS = [
  "sourceBodiesStored",
  "localPathsStored",
  "rawBiometricsStored",
];
const WORK_KEYS = ["taskId", "domainSignature", "title", "summary", "citationPointerIds"];
const LLM_OUTPUT_KEYS = ["proposals"];
const LLM_PROPOSAL_KEYS = ["methodId", "subtasks"];
const LLM_SUBTASK_KEYS = ["title", "summary", "citationPointerIds"];
const LLM_PROVIDER_KEYS = ["transport", "executable", "args", "model"];
const LLM_ENVELOPE_KEYS = [
  "stationId",
  "model",
  "promptDigest",
  "inputDigest",
  "outputJson",
  "producedAt",
  "transport",
];

function fail(message: string): never {
  throw new TypeError(`Task Map Station-3 method library: ${message}`);
}

function plain(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value: JsonObject, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} keys are invalid`);
  }
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    && !CONTROL.test(value);
}

function opaqueId(value: unknown): value is string {
  return boundedText(value, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters)
    && value === value.trim();
}

function modelId(value: unknown): value is string {
  return boundedText(value, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxModelCharacters)
    && value === value.trim();
}

function validLlmTransport(value: unknown): value is LlmProviderId {
  return value === "claude-cli"
    || value === "codex-cli"
    || value === "cursor-cli"
    || value === "gemini-remote";
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
  return month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth[month - 1]!
    && hour <= 23 && minute <= 59 && second <= 59
    && offsetHour <= 23 && offsetMinute <= 59;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as JsonObject)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function normalizeTemplate(value: unknown, index: number): TaskMapMethodTemplateV1 {
  if (!plain(value)) fail(`template ${index} is invalid`);
  exactKeys(value, TEMPLATE_KEYS, `template ${index}`);
  if (!opaqueId(value.templateId) || !opaqueId(value.methodId)
    || typeof value.domainSignature !== "string"
    || !DOMAIN_SIGNATURE.test(value.domainSignature)
    || !Array.isArray(value.subtasks) || value.subtasks.length === 0
    || value.subtasks.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSubtasksPerProposal) {
    fail(`template ${index} is invalid or unbounded`);
  }
  const subtasks = value.subtasks.map((subtask, subtaskIndex) => {
    if (!plain(subtask)) fail(`template ${index} subtask ${subtaskIndex} is invalid`);
    exactKeys(subtask, TEMPLATE_SUBTASK_KEYS, `template ${index} subtask ${subtaskIndex}`);
    if (!boundedText(subtask.title, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
      || !boundedText(subtask.summary, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)) {
      fail(`template ${index} subtask ${subtaskIndex} is invalid or unbounded`);
    }
    return { title: subtask.title, summary: subtask.summary };
  });
  return {
    templateId: value.templateId,
    domainSignature: value.domainSignature,
    methodId: value.methodId,
    subtasks,
  };
}

export function buildTaskMapMethodLibrary(input: {
  templates: readonly TaskMapMethodTemplateV1[];
}): TaskMapMethodLibraryV1 {
  if (!plain(input)) fail("library draft is invalid");
  exactKeys(input, ["templates"], "library draft");
  if (!Array.isArray(input.templates)
    || input.templates.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTemplates) {
    fail("library template collection is invalid or unbounded");
  }
  const templates = input.templates.map(normalizeTemplate).sort((left, right) =>
    compareText(left.domainSignature, right.domainSignature)
      || compareText(left.templateId, right.templateId));
  if (new Set(templates.map((template) => template.domainSignature)).size
    !== templates.length) fail("library domain signatures must be unique");
  if (new Set(templates.map((template) => template.templateId)).size
    !== templates.length) fail("library template ids must be unique");
  const core = {
    contractVersion: TASKMAP_METHOD_LIBRARY_VERSION,
    templates,
    authority: {
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
    > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxArtifactBytes) {
    fail("library artifact exceeds its bounded ceiling");
  }
  return deepFreeze(result);
}

function validateLibrary(library: unknown): asserts library is TaskMapMethodLibraryV1 {
  if (!plain(library)) fail("library is invalid");
  exactKeys(library, [
    "contractVersion",
    "templates",
    "authority",
    "privacy",
    "artifactDigest",
  ], "library");
  if (library.contractVersion !== TASKMAP_METHOD_LIBRARY_VERSION
    || typeof library.artifactDigest !== "string" || !SHA256.test(library.artifactDigest)
    || !Array.isArray(library.templates)) fail("library binding is invalid");
  const authority = library.authority;
  if (!plain(authority)) fail("library authority is invalid");
  exactKeys(authority, LIBRARY_AUTHORITY_KEYS, "library authority");
  if (authority.edgesWritten !== false
    || authority.requiresOwnerAcceptance !== true) {
    fail("library authority is not fail closed");
  }
  const privacy = library.privacy;
  if (!plain(privacy)) fail("library privacy is invalid");
  exactKeys(privacy, LIBRARY_PRIVACY_KEYS, "library privacy");
  if (LIBRARY_PRIVACY_KEYS.some((key) => privacy[key] !== false)) {
    fail("library privacy is not fail closed");
  }
  const rebuilt = buildTaskMapMethodLibrary({
    templates: library.templates as unknown as TaskMapMethodTemplateV1[],
  });
  if (taskMapContractCanonicalJson(library) !== taskMapContractCanonicalJson(rebuilt)) {
    fail("library canonical seal is invalid");
  }
}

function validateWorkItem(value: unknown): asserts value is TaskMapDecompositionWorkItemV1 {
  if (!plain(value)) fail("work item is invalid");
  exactKeys(value, WORK_KEYS, "work item");
  if (!opaqueId(value.taskId) || typeof value.domainSignature !== "string"
    || !DOMAIN_SIGNATURE.test(value.domainSignature)
    || !boundedText(value.title, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
    || !boundedText(value.summary, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)
    || !Array.isArray(value.citationPointerIds)
    || value.citationPointerIds.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCitationPointers
    || value.citationPointerIds.some((pointer) => !opaqueId(pointer))
    || new Set(value.citationPointerIds).size !== value.citationPointerIds.length) {
    fail("work item is invalid or unbounded");
  }
}

function makeProposal(
  workItem: TaskMapDecompositionWorkItemV1,
  methodIdValue: string,
  subtasks: readonly { title: string; summary: string; citationPointerIds: readonly string[] }[],
  ordinal: number,
): TaskMapDecompositionProposalV1 {
  const proposalSeed = { taskId: workItem.taskId, methodId: methodIdValue, subtasks, ordinal };
  const proposalId = `tmdecomp_${taskMapContractDigest(proposalSeed).slice(0, 16)}`;
  return {
    proposalId,
    methodId: methodIdValue,
    subtasks: subtasks.map((subtask, index) => ({
      subtaskId: `tmds_${taskMapContractDigest({ proposalId, index, subtask }).slice(0, 16)}`,
      title: subtask.title,
      summary: subtask.summary,
      citationPointerIds: [...subtask.citationPointerIds],
    })),
  };
}

function parseOutput(outputJson: string, workItem: TaskMapDecompositionWorkItemV1): TaskMapDecompositionProposalV1[] {
  if (typeof outputJson !== "string"
    || Buffer.byteLength(outputJson, "utf8") > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes) {
    fail("LLM output is invalid or unbounded");
  }
  assertTaskMapStrictJsonSyntaxAndUniqueKeys(outputJson.trim());
  const parsed: unknown = JSON.parse(outputJson.trim());
  if (!plain(parsed)) fail("LLM output is invalid");
  exactKeys(parsed, LLM_OUTPUT_KEYS, "LLM output");
  if (!Array.isArray(parsed.proposals)
    || parsed.proposals.length === 0
    || parsed.proposals.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCandidateProposals) {
    fail("LLM proposal collection is invalid or unbounded");
  }
  const proposals = parsed.proposals.map((proposal, proposalIndex) => {
    if (!plain(proposal)) fail(`LLM proposal ${proposalIndex} is invalid`);
    exactKeys(proposal, LLM_PROPOSAL_KEYS, `LLM proposal ${proposalIndex}`);
    if (!opaqueId(proposal.methodId) || !Array.isArray(proposal.subtasks)
      || proposal.subtasks.length === 0
      || proposal.subtasks.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSubtasksPerProposal) {
      fail(`LLM proposal ${proposalIndex} is invalid or unbounded`);
    }
    const subtasks = proposal.subtasks.map((subtask, subtaskIndex) => {
      if (!plain(subtask)) fail(`LLM subtask ${subtaskIndex} is invalid`);
      exactKeys(subtask, LLM_SUBTASK_KEYS, `LLM subtask ${subtaskIndex}`);
      if (!boundedText(subtask.title, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxTitleCharacters)
        || !boundedText(subtask.summary, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxSummaryCharacters)
        || !Array.isArray(subtask.citationPointerIds)
        || subtask.citationPointerIds.length === 0
        || subtask.citationPointerIds.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxCitationPointers
        || subtask.citationPointerIds.some((pointer) => !opaqueId(pointer))) {
        fail(`LLM subtask ${subtaskIndex} is invalid or unbounded`);
      }
      return {
        title: subtask.title,
        summary: subtask.summary,
        citationPointerIds: [...subtask.citationPointerIds],
      };
    });
    return makeProposal(workItem, proposal.methodId, subtasks, proposalIndex);
  });
  return proposals.slice(0, TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxPublishedProposals);
}

function promptFor(workItem: TaskMapDecompositionWorkItemV1): string {
  const prompt = JSON.stringify({
    stationId: TASKMAP_DECOMPOSITION_STATION_ID,
    instructions: [
      "Propose one to three alternative decompositions for exactly one work item.",
      "Return one level only; subtasks must never contain children or edges.",
      "Return strict JSON with proposals[{methodId,subtasks[{title,summary,citationPointerIds}]}].",
    ],
    workItem,
  });
  if (prompt.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxPromptCharacters) {
    fail("Station-3 prompt is unbounded");
  }
  return prompt;
}

function baseResult(
  inputDigest: string,
  libraryDigest: string,
  source: TaskMapDecompositionResultV1["source"],
  unavailableReason: TaskMapDecompositionUnavailableReason | null,
  proposals: TaskMapDecompositionProposalV1[],
  llm: TaskMapDecompositionResultV1["llm"],
): TaskMapDecompositionResultV1 {
  const core = {
    contractVersion: TASKMAP_DECOMPOSITION_PROPOSAL_VERSION,
    inputDigest,
    libraryDigest,
    source,
    unavailableReason,
    proposals,
    llm,
    authority: { edgesWritten: false as const, requiresOwnerAcceptance: true as const },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
    },
  };
  const result = { ...core, artifactDigest: taskMapContractDigest(core) };
  if (Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
    > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxArtifactBytes) fail("result is unbounded");
  return deepFreeze(result) as TaskMapDecompositionResultV1;
}

export type ProposeTaskMapDecompositionInputV1 = {
  workItem: TaskMapDecompositionWorkItemV1;
  library: TaskMapMethodLibraryV1;
  station?: TaskMapDecompositionStation;
  runner?: TaskMapDecompositionReplayRunner;
  llmModelId?: string;
};

export async function proposeTaskMapDecomposition(
  input: ProposeTaskMapDecompositionInputV1,
): Promise<TaskMapDecompositionResultV1> {
  if (!plain(input)) fail("input is invalid");
  exactKeys(input, Object.keys(input).includes("station")
    ? ["workItem", "library", "station"]
    : Object.keys(input).includes("runner") || Object.keys(input).includes("llmModelId")
      ? ["workItem", "library", "runner", "llmModelId"]
      : ["workItem", "library"], "input");
  validateWorkItem(input.workItem);
  validateLibrary(input.library);
  if (input.station !== undefined && (input.runner !== undefined || input.llmModelId !== undefined)) {
    fail("station and replay runner seams are mutually exclusive");
  }
  if (input.runner !== undefined
    && (typeof input.runner !== "function" || !modelId(input.llmModelId))) {
    fail("replay runner requires explicit model provenance");
  }
  const inputDigest = taskMapContractDigest(input.workItem);
  const template = input.library.templates.find((candidate) =>
    candidate.domainSignature === input.workItem.domainSignature);
  const idleLlm = {
    invocationState: "not_invoked" as const,
    stationId: TASKMAP_DECOMPOSITION_STATION_ID,
    modelId: null,
    providerId: null,
    transport: null,
    promptDigest: null,
    inputDigest,
    outputDigest: null,
  };
  if (template !== undefined) {
    const subtasks = template.subtasks.map((subtask) => ({
      ...subtask,
      citationPointerIds: [...input.workItem.citationPointerIds],
    }));
    return baseResult(inputDigest, input.library.artifactDigest, "method_library", null,
      [makeProposal(input.workItem, template.methodId, subtasks, 0)], idleLlm);
  }

  const promptText = promptFor(input.workItem);
  const promptDigest = taskMapContractDigest(promptText);
  const request = { stationId: TASKMAP_DECOMPOSITION_STATION_ID, promptText, inputDigest };
  let outputJson: string;
  let model: string;
  let provider: LlmProviderId | "offline-replay";
  let transport: LlmProviderId | "injected-offline";
  try {
    if (input.station !== undefined) {
      if (input.station === null || typeof input.station !== "object"
        || Array.isArray(input.station) || !plain(input.station.provider)
        || typeof input.station.run !== "function") fail("station seam is invalid");
      exactKeys(input.station.provider, LLM_PROVIDER_KEYS, "station provider");
      if (!validLlmTransport(input.station.provider.transport)
        || (input.station.provider.transport === "gemini-remote"
          ? input.station.provider.executable !== ""
          : !boundedText(input.station.provider.executable,
            TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters))
        || !Array.isArray(input.station.provider.args)
        || (input.station.provider.transport === "gemini-remote"
          && input.station.provider.args.length !== 0)
        || input.station.provider.args.some((argument) =>
          typeof argument !== "string"
          || argument.length > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxIdCharacters
          || CONTROL.test(argument))
        || !modelId(input.station.provider.model)) fail("station provider is invalid");
      const envelope = await input.station.run(request);
      if (!plain(envelope)) fail("station envelope is invalid");
      exactKeys(envelope, LLM_ENVELOPE_KEYS, "station envelope");
      if (envelope.stationId !== TASKMAP_DECOMPOSITION_STATION_ID
        || envelope.inputDigest !== inputDigest || envelope.promptDigest !== promptDigest
        || !validLlmTransport(envelope.transport)
        || envelope.transport !== input.station.provider.transport
        || !modelId(envelope.model) || typeof envelope.outputJson !== "string"
        || !validProducedAt(envelope.producedAt)) fail("station envelope is invalid");
      outputJson = envelope.outputJson;
      model = envelope.model;
      provider = envelope.transport;
      transport = envelope.transport;
    } else if (input.runner !== undefined) {
      const replay = await input.runner(request);
      if (!plain(replay)) fail("replay output is invalid");
      exactKeys(replay, ["outputJson"], "replay output");
      if (typeof replay.outputJson !== "string") fail("replay output is invalid");
      outputJson = replay.outputJson;
      model = input.llmModelId!;
      provider = "offline-replay";
      transport = "injected-offline";
    } else {
      throw new Error("no Station-3 provider");
    }
  } catch (error: unknown) {
    void error;
    return baseResult(inputDigest, input.library.artifactDigest, "llm_station",
      "llm_station_unavailable", [], {
        ...idleLlm,
        invocationState: "unavailable",
        promptDigest,
      });
  }

  if (Buffer.byteLength(outputJson, "utf8")
    > TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes) {
    return baseResult(inputDigest, input.library.artifactDigest, "llm_station",
      "llm_station_invalid_output", [], {
        invocationState: "unavailable",
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        modelId: model,
        providerId: provider,
        transport,
        promptDigest,
        inputDigest,
        outputDigest: null,
      });
  }
  const outputDigest = taskMapContractDigest(outputJson);
  let proposals: TaskMapDecompositionProposalV1[];
  try {
    proposals = parseOutput(outputJson, input.workItem);
  } catch (error: unknown) {
    void error;
    return baseResult(inputDigest, input.library.artifactDigest, "llm_station",
      "llm_station_invalid_output", [], {
        invocationState: "unavailable",
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        modelId: model,
        providerId: provider,
        transport,
        promptDigest,
        inputDigest,
        outputDigest,
      });
  }
  return baseResult(inputDigest, input.library.artifactDigest, "llm_station", null,
    proposals, {
      invocationState: "invoked",
      stationId: TASKMAP_DECOMPOSITION_STATION_ID,
      modelId: model,
      providerId: provider,
      transport,
      promptDigest,
      inputDigest,
      outputDigest,
    });
}
