import {
  buildTaskMapCommunityGraph,
  type TaskMapCommunityGraphNodeInputV1,
  type TaskMapCommunityGraphOutputV1,
} from "./community-graph-brain.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
} from "./mention-extraction.js";
import {
  LlmStationUnavailableError,
  type LlmStation,
  type LlmStationEnvelope,
  type LlmProviderId,
} from "./llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  boundedUtf16,
  toWellFormedText,
} from "./text-contract.js";

export const TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION =
  "taskmap-community-root-proposals.v1" as const;
export const TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD =
  0.5 as const;
export const TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1 = Object.freeze({
  maxRoots: 384,
  maxPreviousRoots: 384,
  maxMembersPerPreviousRoot: 384,
  maxPreviousMembersTotal: 4_096,
  maxPreviousRootsBytes: 1 * 1_024 * 1_024,
  maxOutputBytes: 256 * 1_024,
  maxTitlePromptBytes: 64 * 1_024,
  maxTitleOutputBytes: 64 * 1_024,
  titleBatchTimeoutMs: 30_000,
  maxNodeTextCharacters: 480,
  maxNodeTextBytes: 3 * 480,
} as const);

const MAX_TITLE_CHARACTERS = 80;
const MAX_MEMBER_TEXT_CHARACTERS = 480;
const SHA256 = /^[a-f0-9]{64}$/;
const TITLE_TRANSPORTS = new Set<LlmProviderId>([
  "claude-cli",
  "codex-cli",
  "cursor-cli",
  "gemini-remote",
]);
const CONTROL_CHARACTER = /\p{Cc}/u;
const URL = /\b(?:https?|ftp):\/\/[^\s<>"]+/giu;
const FILE_URI = /\bfile:\/\/\/[^\s<>"')\]]+/giu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu;
const OWNER_LOCAL_PATH = /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)[^\s<>"')\]]+/gu;
const GENERIC_ABSOLUTE_POSIX_PATH = /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/gu;
const CREDENTIAL = /\b(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*["']?[^\s"',;]+/giu;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/giu;
const PROVIDER_TOKEN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/giu;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu;
const TRUNCATED_PEM_CONTENT = /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*/giu;
const UNSAFE_TITLE = [
  /\b(?:https?|ftp):\/\//iu,
  /\bfile:\/\/\//iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/iu,
  /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)/u,
  /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/u,
  /\b(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]/iu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/iu,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/iu,
] as const;
const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of",
  "on", "or", "the", "to", "with",
]);

export interface TaskMapPreviousAcceptedRootV1 {
  rootProposalId: string;
  memberNodeIds: string[];
}

export interface TaskMapCommunityRootProposalV1 {
  rootProposalId: string;
  baseRootProposalId: string;
  proposalDigest: string;
  memberNodeIds: string[];
  title: string;
  titleSource: "llm_community_title_v1" | "deterministic_fallback";
  recordKind: "review_only_root_proposal";
  proposalDisposition: "review_only";
  authority: "none";
  requiresOwnerAcceptance: true;
  acceptedMembershipAuthority: false;
}

export interface TaskMapCommunityRootIdentityReuseProposalV1 {
  kind: "identity_reuse_proposed";
  rootProposalId: string;
  baseRootProposalId: string;
  previousMemberNodeIds: string[];
  currentMemberNodeIds: string[];
  jaccardSimilarity: number;
  recordKind: "review_only_identity_reuse_proposal";
  proposalDisposition: "review_only";
  authority: "none";
  requiresOwnerAcceptance: true;
  lifecycleAuthority: false;
}

export interface TaskMapCommunityRootReuseMetricsV1 {
  reuseThreshold:
    typeof TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD;
  communityCount: number;
  previousAcceptedRootCount: number;
  eligiblePairCount: number;
  identityReuseProposedCount: number;
  unmatchedCommunityCount: number;
  unmatchedPreviousRootCount: number;
}

export interface TaskMapCommunityRootMonitoringV1 {
  titlePromptBytes: number;
  titleOutputBytes: number;
  titleBatchAttempted: boolean;
  titleBatchTimedOut: boolean;
  titleFallbackReason:
    | "none"
    | "no_station"
    | "missing_titles"
    | "station_timeout"
    | "station_unavailable_or_invalid";
  llmTitleCount: number;
  fallbackTitleCount: number;
}

export interface TaskMapCommunityRootProposalSetV1 {
  contractVersion: typeof TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION;
  proposalSetId: string;
  proposalSetDigest: string;
  authority: "none";
  requiresOwnerAcceptance: true;
  nodeLookupDigest: string;
  titleGeneration: TaskMapCommunityTitleGenerationV1 | null;
  monitoring: TaskMapCommunityRootMonitoringV1;
  reuseMetrics: TaskMapCommunityRootReuseMetricsV1;
  proposals: TaskMapCommunityRootProposalV1[];
  lifecycle: TaskMapCommunityRootIdentityReuseProposalV1[];
}

export interface TaskMapCommunityTitleGenerationV1 {
  source: "live_station" | "recorded_replay";
  stationId: "community-title-v1";
  inputDigest: string;
  promptDigest: string;
  outputDigest: string;
  envelopeDigest: string;
  transport: LlmProviderId;
  model: string;
  producedAt: string;
}

export interface BuildTaskMapCommunityRootProposalsInputV1 {
  graphOutput: TaskMapCommunityGraphOutputV1;
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
  nodeLookupDigest: string;
  previousAcceptedRoots: readonly TaskMapPreviousAcceptedRootV1[];
  llmStation?: LlmStation | null;
  recordedTitleEnvelope?: LlmStationEnvelope | null;
  signal?: AbortSignal;
}

interface NormalizedCommunity {
  memberNodeIds: string[];
  memberTexts: string[];
  baseRootProposalId: string;
}

interface NormalizedPreviousRoot {
  rootProposalId: string;
  memberNodeIds: string[];
}

function fail(message: string): never {
  throw new TypeError(`Task Map community root proposals: ${message}`);
}

function compareText(left: string, right: string): number {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftScalars[index].codePointAt(0)!
      - rightScalars[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

function compareStringArrays(
  left: readonly string[],
  right: readonly string[],
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = compareText(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBoundedId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > 512
    || CONTROL_CHARACTER.test(value)
  ) fail(`${label} is invalid`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function sanitizeText(value: string): string {
  return boundedUtf16(
    toWellFormedText(value)
      .replace(PRIVATE_KEY, "[private-key]")
      .replace(TRUNCATED_PEM_CONTENT, "[private-key]")
      .replace(FILE_URI, "[file-uri]")
      .replace(URL, "[url]")
      .replace(EMAIL, "[email]")
      .replace(BEARER_SECRET, "[credential]")
      .replace(PROVIDER_TOKEN, "[credential]")
      .replace(AWS_ACCESS_KEY, "[credential]")
      .replace(JWT_SECRET, "[credential]")
      .replace(CREDENTIAL, "[credential]")
      .replace(OWNER_LOCAL_PATH, " [path]")
      .replace(GENERIC_ABSOLUTE_POSIX_PATH, " [path]")
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim(),
    MAX_MEMBER_TEXT_CHARACTERS,
  );
}

function assertNodeTextBounded(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    fail("node text is invalid");
  }
  if (
    value.length
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxNodeTextCharacters
  ) fail("node text exceeds its character limit");
  if (
    Buffer.byteLength(value, "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxNodeTextBytes
  ) fail("node text exceeds its UTF-8 byte limit");
}

export function taskMapCommunityRootNodeLookupDigest(
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>,
): string {
  if (
    !(nodeLookup instanceof Map)
    || nodeLookup.size > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxRoots
  ) fail("nodeLookup is invalid");
  const rows = [...nodeLookup.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([lookupId, candidate]) => {
    assertBoundedId(lookupId, "node lookup id");
    if (!isPlainObject(candidate) || candidate.nodeId !== lookupId) {
      fail("nodeLookup entry is invalid");
    }
    assertNodeTextBounded(candidate.text);
    return candidate as unknown as TaskMapCommunityGraphNodeInputV1;
  });
  buildTaskMapCommunityGraph({ nodes: rows });
  return taskMapContractDigest(rows);
}

function boundedTitle(value: string): string {
  const normalized = toWellFormedText(value).replace(/\s+/g, " ").trim();
  const scalars = Array.from(normalized);
  if (scalars.length <= MAX_TITLE_CHARACTERS) return normalized;
  return scalars.slice(0, MAX_TITLE_CHARACTERS).join("").trim();
}

function safeTitle(value: unknown): value is string {
  return typeof value === "string"
    && value === toWellFormedText(value)
    && value.trim() === value
    && value.length > 0
    && Array.from(value).length <= MAX_TITLE_CHARACTERS
    && !CONTROL_CHARACTER.test(value)
    && !UNSAFE_TITLE.some((pattern) => pattern.test(value));
}

function tokens(value: string): string[] {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function includesTokenSequence(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, index) =>
      token.normalize("NFKC").toLowerCase()
        === haystack[start + index].normalize("NFKC").toLowerCase()
    )) return true;
  }
  return false;
}

function meaningful(token: string): boolean {
  const canonical = token.normalize("NFKC").toLowerCase();
  return !STOP_WORDS.has(canonical)
    && (Array.from(token).length > 1 || /[^\u0000-\u007f]/u.test(token));
}

function deterministicFallbackTitle(memberTexts: readonly string[]): string {
  const tokenRows = memberTexts.map(tokens).filter((row) => row.length > 0);
  if (tokenRows.length > 0) {
    const candidates: string[] = [];
    const first = tokenRows[0];
    for (let length = first.length; length >= 1; length -= 1) {
      for (let start = 0; start <= first.length - length; start += 1) {
        const candidate = first.slice(start, start + length);
        if (!candidate.some(meaningful)) continue;
        if (tokenRows.every((row) => includesTokenSequence(row, candidate))) {
          candidates.push(candidate.join(" "));
        }
      }
      if (candidates.length > 0) {
        return boundedTitle(candidates.sort(compareText)[0]);
      }
    }
  }
  const stable = [...memberTexts].sort((left, right) => {
    const length = Array.from(right).length - Array.from(left).length;
    return length !== 0 ? length : compareText(left, right);
  })[0] ?? "Untitled work community";
  return boundedTitle(stable) || "Untitled work community";
}

function normalizePreviousRoots(
  value: readonly TaskMapPreviousAcceptedRootV1[],
): NormalizedPreviousRoot[] {
  if (
    !Array.isArray(value)
    || value.length
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots
  ) {
    fail("previousAcceptedRoots exceeds its count limit");
  }
  const seenRootIds = new Set<string>();
  let aggregateMembers = 0;
  const normalized = value.map((candidate, index) => {
    if (!isPlainObject(candidate)) fail(`previousAcceptedRoots[${index}] is invalid`);
    if (
      Object.keys(candidate).sort().join(":")
        !== "memberNodeIds:rootProposalId"
    ) fail(`previousAcceptedRoots[${index}] has unexpected fields`);
    assertBoundedId(candidate.rootProposalId, "previous rootProposalId");
    if (seenRootIds.has(candidate.rootProposalId)) {
      fail("duplicate previous rootProposalId");
    }
    seenRootIds.add(candidate.rootProposalId);
    if (!Array.isArray(candidate.memberNodeIds) || candidate.memberNodeIds.length === 0) {
      fail("previous memberNodeIds is invalid");
    }
    if (
      candidate.memberNodeIds.length
        > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
          .maxMembersPerPreviousRoot
    ) fail("previous root exceeds its member limit");
    aggregateMembers += candidate.memberNodeIds.length;
    if (
      aggregateMembers
        > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
          .maxPreviousMembersTotal
    ) fail("previous roots exceed their aggregate member limit");
    candidate.memberNodeIds.forEach((memberNodeId) =>
      assertBoundedId(memberNodeId, "previous memberNodeId")
    );
    if (new Set(candidate.memberNodeIds).size !== candidate.memberNodeIds.length) {
      fail("duplicate previous memberNodeId");
    }
    return {
      rootProposalId: candidate.rootProposalId,
      memberNodeIds: [...candidate.memberNodeIds].sort(compareText),
    };
  }).sort((left, right) => compareText(
    left.rootProposalId,
    right.rootProposalId,
  ));
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(normalized), "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRootsBytes
  ) fail("previous roots exceed their canonical byte limit");
  return normalized;
}

function normalizeCommunities(
  graphOutput: TaskMapCommunityGraphOutputV1,
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>,
): NormalizedCommunity[] {
  if (!isPlainObject(graphOutput) || !Array.isArray(graphOutput.communities)) {
    fail("graphOutput is invalid");
  }
  if (
    !(nodeLookup instanceof Map)
    || nodeLookup.size > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxRoots
  ) {
    fail("nodeLookup is invalid");
  }
  if (graphOutput.resourceUsage?.nodeCount !== nodeLookup.size) {
    fail("nodeLookup does not cover the validated graph");
  }
  const normalized: NormalizedCommunity[] = [];
  graphOutput.communities.forEach((candidate, communityIndex) => {
    if (!isPlainObject(candidate) || !Array.isArray(candidate.memberNodeIds)) {
      fail(`community ${communityIndex} is invalid`);
    }
    if (candidate.memberNodeIds.length === 0) return;
    candidate.memberNodeIds.forEach((memberNodeId) =>
      assertBoundedId(memberNodeId, "community memberNodeId")
    );
    if (new Set(candidate.memberNodeIds).size !== candidate.memberNodeIds.length) {
      fail("duplicate community memberNodeId");
    }
    const memberNodeIds = [...candidate.memberNodeIds].sort(compareText);
    const memberTexts = memberNodeIds.map((memberNodeId) => {
      const member = nodeLookup.get(memberNodeId);
      if (member === undefined || member.nodeId !== memberNodeId) {
        fail("community references an unknown memberNodeId");
      }
      assertNodeTextBounded(member.text);
      return sanitizeText(member.text);
    });
    const baseRootProposalId = `graph-root-${taskMapContractDigest(
      memberNodeIds,
    ).slice(0, 16)}`;
    normalized.push({
      memberNodeIds,
      memberTexts,
      baseRootProposalId,
    });
  });
  const baseRootProposalIds = normalized.map(
    (community) => community.baseRootProposalId,
  );
  if (new Set(baseRootProposalIds).size !== baseRootProposalIds.length) {
    fail("duplicate baseRootProposalId across communities");
  }
  const globallySeenMembers = new Set<string>();
  for (const candidate of normalized) {
    for (const memberNodeId of candidate.memberNodeIds) {
      if (globallySeenMembers.has(memberNodeId)) {
        fail("duplicate memberNodeId across communities");
      }
      globallySeenMembers.add(memberNodeId);
    }
  }
  return normalized.sort((left, right) =>
    compareStringArrays(left.memberNodeIds, right.memberNodeIds)
  );
}

interface TitleBatchRequest {
  promptText: string;
  inputDigest: string;
}

interface TitleBatchResult {
  titles: Map<string, string>;
  titleGeneration: TaskMapCommunityTitleGenerationV1 | null;
  titlePromptBytes: number;
  titleOutputBytes: number;
  titleBatchAttempted: boolean;
  titleBatchTimedOut: boolean;
  titleFallbackReason: TaskMapCommunityRootMonitoringV1["titleFallbackReason"];
}

function truncateScalars(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function titleBatchRequest(
  communities: readonly NormalizedCommunity[],
): TitleBatchRequest {
  const render = (maximumSnippetCharacters: number) => {
    const payload = {
      communities: communities.map((community) => ({
        baseRootProposalId: community.baseRootProposalId,
        memberTexts: community.memberTexts.slice(0, 5).map((text) =>
          truncateScalars(text, maximumSnippetCharacters)
        ),
      })),
    };
    const promptText = [
      "Create one concise Task Map root title for each community.",
      "Return strict JSON with exactly this schema:",
      "{\"titles\":[{\"baseRootProposalId\":\"graph-root-...\",\"title\":\"...\"}]}",
      "Each title must be at most 80 characters and contain no paths or secrets.",
      "Missing communities use deterministic fallback; do not invent IDs.",
      JSON.stringify(payload),
    ].join("\n");
    return { payload, promptText };
  };
  let low = 0;
  let high = MAX_MEMBER_TEXT_CHARACTERS;
  let best = render(0);
  if (
    Buffer.byteLength(best.promptText, "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitlePromptBytes
  ) {
    fail("community title batch cannot fit its prompt budget");
  }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = render(middle);
    if (Buffer.byteLength(candidate.promptText, "utf8")
      <= TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitlePromptBytes) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return {
    promptText: best.promptText,
    inputDigest: taskMapContractDigest(best.payload),
  };
}

function parseTitleBatch(
  outputJson: string,
  communities: readonly NormalizedCommunity[],
): Map<string, string> {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys(outputJson);
  const parsed: unknown = JSON.parse(outputJson);
  if (
    !isPlainObject(parsed)
    || Object.keys(parsed).length !== 1
    || !Array.isArray(parsed.titles)
    || parsed.titles.length > communities.length
  ) throw new Error("invalid title batch output");
  const expectedIds = new Set(
    communities.map((community) => community.baseRootProposalId),
  );
  const titles = new Map<string, string>();
  for (const candidate of parsed.titles) {
    if (
      !isPlainObject(candidate)
      || Object.keys(candidate).sort().join(":")
        !== "baseRootProposalId:title"
      || typeof candidate.baseRootProposalId !== "string"
      || !expectedIds.has(candidate.baseRootProposalId)
      || titles.has(candidate.baseRootProposalId)
      || !safeTitle(candidate.title)
    ) throw new Error("invalid title batch mapping");
    titles.set(candidate.baseRootProposalId, candidate.title);
  }
  return titles;
}

function canonicalTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(Date.parse(value)).toISOString() === value;
}

function safeModel(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value)
    && !UNSAFE_TITLE.some((pattern) => pattern.test(value));
}

function validateTitleEnvelope(
  envelope: unknown,
  request: TitleBatchRequest,
  communities: readonly NormalizedCommunity[],
  source: TaskMapCommunityTitleGenerationV1["source"],
  expectedTransport?: LlmProviderId,
): TitleBatchResult {
  if (
    !isPlainObject(envelope)
    || Object.keys(envelope).sort().join(":")
      !== "inputDigest:model:outputJson:producedAt:promptDigest:stationId:transport"
    || envelope.stationId !== "community-title-v1"
    || envelope.inputDigest !== request.inputDigest
    || envelope.promptDigest !== taskMapContractDigest(request.promptText)
    || typeof envelope.outputJson !== "string"
    || Buffer.byteLength(envelope.outputJson, "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitleOutputBytes
    || !TITLE_TRANSPORTS.has(envelope.transport as LlmProviderId)
    || (
      expectedTransport !== undefined
      && envelope.transport !== expectedTransport
    )
    || !safeModel(envelope.model)
    || !canonicalTimestamp(envelope.producedAt)
  ) throw new Error("invalid community title envelope");
  const titles = parseTitleBatch(envelope.outputJson, communities);
  const typedEnvelope = envelope as unknown as LlmStationEnvelope;
  return {
    titles,
    titleGeneration: {
      source,
      stationId: "community-title-v1",
      inputDigest: typedEnvelope.inputDigest,
      promptDigest: typedEnvelope.promptDigest,
      outputDigest: taskMapContractDigest(typedEnvelope.outputJson),
      envelopeDigest: taskMapContractDigest(typedEnvelope),
      transport: typedEnvelope.transport,
      model: typedEnvelope.model,
      producedAt: typedEnvelope.producedAt,
    },
    titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
    titleOutputBytes: Buffer.byteLength(typedEnvelope.outputJson, "utf8"),
    titleBatchAttempted: source === "live_station",
    titleBatchTimedOut: false,
    titleFallbackReason: titles.size === communities.length
      ? "none"
      : "missing_titles",
  };
}

async function batchTitlesForCommunities(
  communities: readonly NormalizedCommunity[],
  llmStation: LlmStation | null | undefined,
  recordedTitleEnvelope: LlmStationEnvelope | null | undefined,
  titleBatchTimeoutMs: number,
  signal?: AbortSignal,
): Promise<TitleBatchResult> {
  if (communities.length === 0) {
    if (recordedTitleEnvelope !== undefined && recordedTitleEnvelope !== null) {
      fail("recorded title envelope has no communities");
    }
    return {
      titles: new Map(),
      titleGeneration: null,
      titlePromptBytes: 0,
      titleOutputBytes: 0,
      titleBatchAttempted: false,
      titleBatchTimedOut: false,
      titleFallbackReason: "none",
    };
  }
  const request = titleBatchRequest(communities);
  if (recordedTitleEnvelope !== undefined && recordedTitleEnvelope !== null) {
    try {
      return validateTitleEnvelope(
        recordedTitleEnvelope,
        request,
        communities,
        "recorded_replay",
      );
    } catch {
      fail("recorded title envelope is invalid");
    }
  }
  if (llmStation === undefined || llmStation === null) {
    return {
      titles: new Map(),
      titleGeneration: null,
      titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
      titleOutputBytes: 0,
      titleBatchAttempted: false,
      titleBatchTimedOut: false,
      titleFallbackReason: "no_station",
    };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let outputBytes = 0;
  const abortController = new AbortController();
  const abortFromCaller = () => abortController.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => {
          timedOut = true;
          abortController.abort();
          reject(new Error("community title batch timeout"));
        },
        titleBatchTimeoutMs,
      );
    });
    const envelope = await Promise.race([
      llmStation.run({
        stationId: "community-title-v1",
        promptText: request.promptText,
        inputDigest: request.inputDigest,
        signal: abortController.signal,
      }),
      timeout,
    ]);
    outputBytes = typeof envelope.outputJson === "string"
      ? Buffer.byteLength(envelope.outputJson, "utf8")
      : 0;
    return validateTitleEnvelope(
      envelope,
      request,
      communities,
      "live_station",
      llmStation.provider.transport,
    );
  } catch (error) {
    const stationTimedOut = timedOut
      || (
        error instanceof LlmStationUnavailableError
        && error.reason === "timeout"
      );
    return {
      titles: new Map(),
      titleGeneration: null,
      titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
      titleOutputBytes: outputBytes,
      titleBatchAttempted: true,
      titleBatchTimedOut: stationTimedOut,
      titleFallbackReason: stationTimedOut
        ? "station_timeout"
        : "station_unavailable_or_invalid",
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

function jaccardSimilarity(
  left: readonly string[],
  right: readonly string[],
): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const member of leftSet) {
    if (rightSet.has(member)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Hungarian minimum-cost assignment for rows <= columns. */
function hungarian(costs: readonly (readonly number[])[]): number[] {
  const rowCount = costs.length;
  if (rowCount === 0) return [];
  const columnCount = costs[0].length;
  if (columnCount < rowCount) fail("identity assignment is not rectangular");
  if (costs.some((row) => row.length !== columnCount)) {
    fail("identity assignment rows are inconsistent");
  }
  const u = Array<number>(rowCount + 1).fill(0);
  const v = Array<number>(columnCount + 1).fill(0);
  const p = Array<number>(columnCount + 1).fill(0);
  const way = Array<number>(columnCount + 1).fill(0);
  for (let row = 1; row <= rowCount; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minimum = Array<number>(columnCount + 1)
      .fill(Number.POSITIVE_INFINITY);
    const used = Array<boolean>(columnCount + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0];
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let column = 1; column <= columnCount; column += 1) {
        if (used[column]) continue;
        const reduced = costs[row0 - 1][column - 1]
          - u[row0]
          - v[column];
        if (reduced < minimum[column]) {
          minimum[column] = reduced;
          way[column] = column0;
        }
        if (
          minimum[column] < delta
          || (minimum[column] === delta && column < column1)
        ) {
          delta = minimum[column];
          column1 = column;
        }
      }
      for (let column = 0; column <= columnCount; column += 1) {
        if (used[column]) {
          u[p[column]] += delta;
          v[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      column0 = column1;
    } while (p[column0] !== 0);
    do {
      const column1 = way[column0];
      p[column0] = p[column1];
      column0 = column1;
    } while (column0 !== 0);
  }
  const assignment = Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    if (p[column] !== 0) assignment[p[column] - 1] = column - 1;
  }
  return assignment;
}

function matchPreviousRoots(
  communities: readonly NormalizedCommunity[],
  previousRoots: readonly NormalizedPreviousRoot[],
): {
  matches: Array<{
    previous: NormalizedPreviousRoot;
    similarity: number;
  } | null>;
  eligiblePairCount: number;
} {
  if (communities.length === 0 || previousRoots.length === 0) {
    return {
      matches: communities.map(() => null),
      eligiblePairCount: 0,
    };
  }
  const similarities = communities.map((community) =>
    previousRoots.map((previous) =>
      jaccardSimilarity(community.memberNodeIds, previous.memberNodeIds)
    )
  );
  const cardinalityBonus = communities.length + 1;
  const costs = similarities.map((row) => [
    ...row.map((similarity) => similarity
        >= TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD
      ? -(cardinalityBonus + similarity)
      : cardinalityBonus),
    ...Array<number>(communities.length).fill(0),
  ]);
  const assignment = hungarian(costs);
  const matches = assignment.map((column, communityIndex) => {
    if (column < 0 || column >= previousRoots.length) return null;
    const similarity = similarities[communityIndex][column];
    if (
      similarity < TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD
    ) return null;
    return {
      previous: previousRoots[column],
      similarity: Math.round(similarity * 1_000_000_000_000)
        / 1_000_000_000_000,
    };
  });
  return {
    matches,
    eligiblePairCount: similarities.reduce(
      (count, row) => count + row.filter((similarity) =>
        similarity
          >= TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD
      ).length,
      0,
    ),
  };
}

function proposalSetPayload(
  value: Omit<
    TaskMapCommunityRootProposalSetV1,
    "proposalSetId" | "proposalSetDigest"
  >,
): Omit<
  TaskMapCommunityRootProposalSetV1,
  "proposalSetId" | "proposalSetDigest"
> {
  return value;
}

async function buildTaskMapCommunityRootProposalsInternal(
  input: BuildTaskMapCommunityRootProposalsInputV1,
  titleBatchTimeoutMs: number,
): Promise<TaskMapCommunityRootProposalSetV1> {
  if (!isPlainObject(input)) fail("input is invalid");
  if (
    !Number.isSafeInteger(titleBatchTimeoutMs)
    || titleBatchTimeoutMs < 1
    || titleBatchTimeoutMs
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs
  ) fail("title batch timeout is invalid");
  const actualKeys = Object.keys(input);
  const allowedKeys = new Set([
    "graphOutput", "llmStation", "nodeLookup", "nodeLookupDigest",
    "previousAcceptedRoots", "recordedTitleEnvelope", "signal",
  ]);
  if (
    !Object.prototype.hasOwnProperty.call(input, "graphOutput")
    || !Object.prototype.hasOwnProperty.call(input, "nodeLookup")
    || !Object.prototype.hasOwnProperty.call(input, "nodeLookupDigest")
    || !Object.prototype.hasOwnProperty.call(input, "previousAcceptedRoots")
    || actualKeys.some((key) => !allowedKeys.has(key))
  ) fail("input has unexpected or missing fields");
  if (
    input.llmStation !== undefined
    && input.llmStation !== null
    && input.recordedTitleEnvelope !== undefined
    && input.recordedTitleEnvelope !== null
  ) fail("live and recorded title sources are mutually exclusive");
  if (
    typeof input.nodeLookupDigest !== "string"
    || !SHA256.test(input.nodeLookupDigest)
  ) fail("nodeLookupDigest is invalid");
  const computedNodeLookupDigest = taskMapCommunityRootNodeLookupDigest(
    input.nodeLookup,
  );
  if (computedNodeLookupDigest !== input.nodeLookupDigest) {
    fail("nodeLookupDigest does not match nodeLookup");
  }
  const communities = normalizeCommunities(
    input.graphOutput,
    input.nodeLookup,
  );
  const previousRoots = normalizePreviousRoots(input.previousAcceptedRoots);
  const { matches, eligiblePairCount } = matchPreviousRoots(
    communities,
    previousRoots,
  );
  const matchedPreviousIds = new Set(matches.flatMap((match) =>
    match === null ? [] : [match.previous.rootProposalId]
  ));
  const unmatchedPreviousIds = new Set(previousRoots
    .map((previous) => previous.rootProposalId)
    .filter((rootProposalId) => !matchedPreviousIds.has(rootProposalId)));
  communities.forEach((community, index) => {
    if (
      matches[index] === null
      && unmatchedPreviousIds.has(community.baseRootProposalId)
    ) fail("base ID collides with an unmatched historical root");
  });

  const proposals: TaskMapCommunityRootProposalV1[] = [];
  const lifecycle: TaskMapCommunityRootIdentityReuseProposalV1[] = [];
  const titleBatchResult = await batchTitlesForCommunities(
    communities,
    input.llmStation,
    input.recordedTitleEnvelope,
    titleBatchTimeoutMs,
    input.signal,
  );
  for (let index = 0; index < communities.length; index += 1) {
    const community = communities[index];
    const match = matches[index];
    const modelTitle = titleBatchResult.titles.get(
      community.baseRootProposalId,
    );
    const title = modelTitle ?? deterministicFallbackTitle(
      community.memberTexts.slice(0, 5),
    );
    const titleSource = modelTitle === undefined
      ? "deterministic_fallback" as const
      : "llm_community_title_v1" as const;
    const rootProposalId = match?.previous.rootProposalId
      ?? community.baseRootProposalId;
    const base = {
      rootProposalId,
      baseRootProposalId: community.baseRootProposalId,
      memberNodeIds: community.memberNodeIds,
      title,
      titleSource,
      recordKind: "review_only_root_proposal" as const,
      proposalDisposition: "review_only" as const,
      authority: "none" as const,
      requiresOwnerAcceptance: true as const,
      acceptedMembershipAuthority: false as const,
    };
    proposals.push({
      ...base,
      proposalDigest: taskMapContractDigest(base),
    });
    if (match !== null) {
      lifecycle.push({
        kind: "identity_reuse_proposed",
        rootProposalId,
        baseRootProposalId: community.baseRootProposalId,
        previousMemberNodeIds: match.previous.memberNodeIds,
        currentMemberNodeIds: community.memberNodeIds,
        jaccardSimilarity: match.similarity,
        recordKind: "review_only_identity_reuse_proposal",
        proposalDisposition: "review_only",
        authority: "none",
        requiresOwnerAcceptance: true,
        lifecycleAuthority: false,
      });
    }
  }
  proposals.sort((left, right) => compareText(
    left.rootProposalId,
    right.rootProposalId,
  ));
  if (new Set(proposals.map((proposal) => proposal.rootProposalId)).size
    !== proposals.length) {
    fail("root proposal identity collision");
  }
  lifecycle.sort((left, right) => compareText(
    left.rootProposalId,
    right.rootProposalId,
  ));
  const identityReuseProposedCount = matches.filter(
    (match) => match !== null,
  ).length;
  const reuseMetrics: TaskMapCommunityRootReuseMetricsV1 = {
    reuseThreshold:
      TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD,
    communityCount: communities.length,
    previousAcceptedRootCount: previousRoots.length,
    eligiblePairCount,
    identityReuseProposedCount,
    unmatchedCommunityCount:
      communities.length - identityReuseProposedCount,
    unmatchedPreviousRootCount:
      previousRoots.length - matchedPreviousIds.size,
  };
  const monitoring: TaskMapCommunityRootMonitoringV1 = {
    titlePromptBytes: titleBatchResult.titlePromptBytes,
    titleOutputBytes: titleBatchResult.titleOutputBytes,
    titleBatchAttempted: titleBatchResult.titleBatchAttempted,
    titleBatchTimedOut: titleBatchResult.titleBatchTimedOut,
    titleFallbackReason: titleBatchResult.titleFallbackReason,
    llmTitleCount: titleBatchResult.titles.size,
    fallbackTitleCount:
      communities.length - titleBatchResult.titles.size,
  };
  const base = proposalSetPayload({
    contractVersion: TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION,
    authority: "none",
    requiresOwnerAcceptance: true,
    nodeLookupDigest: input.nodeLookupDigest,
    titleGeneration: titleBatchResult.titleGeneration,
    monitoring,
    reuseMetrics,
    proposals,
    lifecycle,
  });
  const proposalSetDigest = taskMapContractDigest(base);
  const result = {
    ...base,
    proposalSetId: `tmcrpset_${proposalSetDigest.slice(0, 16)}`,
    proposalSetDigest,
  };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxOutputBytes
  ) fail("proposal output exceeds its canonical byte limit");
  return deepFreeze(result);
}

export function buildTaskMapCommunityRootProposals(
  input: BuildTaskMapCommunityRootProposalsInputV1,
): Promise<TaskMapCommunityRootProposalSetV1> {
  return buildTaskMapCommunityRootProposalsInternal(
    input,
    TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs,
  );
}

export interface TaskMapCommunityTitleBatchRequestDigestsV1 {
  inputDigest: string;
  promptDigest: string;
}

/**
 * The batch title request digests for one validated community graph, or null
 * when there is no community to title. Callers use this to key the recorded
 * title-envelope store before invoking the proposal builder.
 */
export function taskMapCommunityTitleBatchRequestDigests(input: {
  graphOutput: TaskMapCommunityGraphOutputV1;
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
}): TaskMapCommunityTitleBatchRequestDigestsV1 | null {
  const communities = normalizeCommunities(
    input.graphOutput,
    input.nodeLookup,
  );
  if (communities.length === 0) return null;
  const request = titleBatchRequest(communities);
  return {
    inputDigest: request.inputDigest,
    promptDigest: taskMapContractDigest(request.promptText),
  };
}

/**
 * Full replay-side validation of a recorded community title envelope against
 * the current community set. Returns the frozen envelope when it would
 * satisfy the recorded-replay path, and null on any mismatch, so callers can
 * fall back to the live station instead of failing the whole proposal build.
 */
export function taskMapCommunityRecordedTitleEnvelope(
  candidate: unknown,
  input: {
    graphOutput: TaskMapCommunityGraphOutputV1;
    nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
  },
): LlmStationEnvelope | null {
  try {
    const communities = normalizeCommunities(
      input.graphOutput,
      input.nodeLookup,
    );
    if (communities.length === 0) return null;
    const request = titleBatchRequest(communities);
    validateTitleEnvelope(candidate, request, communities, "recorded_replay");
    return deepFreeze({
      ...(candidate as LlmStationEnvelope),
    });
  } catch {
    return null;
  }
}

/** @internal One bounded seam for run-level title timeout tests. */
export const TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY = Object.freeze({
  buildWithTitleTimeout(
    input: BuildTaskMapCommunityRootProposalsInputV1,
    titleBatchTimeoutMs: number,
  ): Promise<TaskMapCommunityRootProposalSetV1> {
    return buildTaskMapCommunityRootProposalsInternal(
      input,
      titleBatchTimeoutMs,
    );
  },
});
