import {
  TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION,
  assertTaskMapAgentSessionSemanticAdmission,
  type TaskMapAgentSessionGraphFeedEpisodeV1,
  type TaskMapAgentSessionGraphFeedV1,
  type TaskMapAgentSessionSemanticAdmissionV2,
} from "./agent-session-semantic-admission.js";
import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1 as TASKMAP_AGENT_GRAPH_LIMITS_V1,
} from "./agent-session-producer-freshness.js";
import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1,
  buildTaskMapCommunityGraph,
  type TaskMapCommunityGraphCommunityV1,
  type TaskMapCommunityGraphNodeInputV1,
  type TaskMapCommunityGraphOptimizationV1,
  type TaskMapCommunityGraphResourceUsageV1,
} from "./community-graph-brain.js";
import {
  TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1,
  buildTaskMapCommunityRootProposals,
  taskMapCommunityRootNodeLookupDigest,
  taskMapCommunityTitleBatchRequestDigests,
  type TaskMapCommunityRootProposalSetV1,
  type TaskMapPreviousAcceptedRootV1,
} from "./community-root-proposals.js";
import {
  loadRecordedCommunityTitleEnvelope,
  withCommunityTitleEnvelopeRecording,
} from "./community-title-replay.js";
import {
  buildTaskMapCommunitySemanticEvidence,
  type TaskMapCommunitySemanticEvidenceInputV1,
  type TaskMapCommunitySemanticEvidenceReportV1,
} from "./community-semantic-evidence.js";
import {
  taskMapInputValidationReasons,
  taskMapProjectionPrivacyLeakReasons,
} from "./harness.js";
import {
  TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  taskMapMeetingStatementReferenceDigest,
} from "./meeting-producer-freshness.js";
import {
  TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
  TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1,
  type TaskMapNativeSemanticBuilderInputV1,
  type TaskMapNativeSemanticEvidenceBindingV1,
  type TaskMapNativeSemanticSourceBindingV1,
} from "./native-semantic-builder-adapter.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  boundedUtf16,
  toWellFormedText,
} from "./text-contract.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type BrainRootProposal,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION =
  "taskmap-native-community-shadow.v1" as const;
export const TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION =
  "taskmap-native-community-shadow-unavailable.v1" as const;
export const TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION =
  "taskmap-native-community-graph-coverage.v1" as const;
export const TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1 = Object.freeze({
  directoryLimit: 1_024,
  candidateLimit: 4_096,
  attemptLimit: 1_024,
  globalScanByteLimit: 64 * 1_024 * 1_024,
  perFileScanByteLimit: 512 * 1_024,
  observationLimit: TASKMAP_AGENT_GRAPH_LIMITS_V1.maxObservations,
  rawByteLimit: TASKMAP_AGENT_GRAPH_LIMITS_V1.maxRawBytesGlobal,
  maxGraphEpisodes: TASKMAP_AGENT_GRAPH_LIMITS_V1.maxEpisodesGlobal,
} as const);
export const TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1 = Object.freeze({
  maximumInputBytes: 2 * 1_024 * 1_024,
  maximumOutputBytes: 2 * 1_024 * 1_024,
  maximumAgentNodes: TASKMAP_GRAPH_BRAIN_LIMITS_V1.agentEpisodeCapacity,
  maximumMeetingCalendarNodes:
    TASKMAP_GRAPH_BRAIN_LIMITS_V1.meetingCalendarHeadroom,
} as const);

export interface TaskMapNativeCommunityShadowLegacyBindingsV1 {
  graphInputDigest: string;
  candidateDigest: string;
  projectionDigest: string;
  promotionReceiptHeadDigest: string;
}

export interface TaskMapNativeCommunityShadowLegacyFlagsV1 {
  readAuthority: false;
  rankingMutated: false;
  bodyMutated: false;
  acceptanceStoreMutated: false;
}

export type TaskMapNativeCommunityShadowSemanticEvidenceOptionsV1 = Omit<
  TaskMapCommunitySemanticEvidenceInputV1,
  "nodes"
> & {
  /** Recorded community-title-v1 envelope directory for byte-stable replay. */
  titleReplayPath?: string;
};

export interface TaskMapNativeCommunityGraphCoverageV1 {
  contractVersion: typeof TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION;
  discovery: { directoriesVisited: number; candidatesDiscovered: number; directoryLimit: number; candidateLimit: number; directoryLimitReached: boolean; candidateLimitReached: boolean };
  reads: { attemptedFiles: number; attemptLimit: number; droppedAttemptLimit: number; droppedInvalid: number };
  scan: { chargedBytes: number; globalByteLimit: number; perFileByteLimit: number; droppedScanBudget: number };
  observations: { selectedObservations: number; observationLimit: number; droppedObservationLimit: number; rawBytesSelected: number; rawByteLimit: number; droppedRawByteBudget: number; graphEpisodesSelected: number; maxGraphEpisodes: number; droppedGraphEpisodes: number };
  distribution: { codexSelected: number; claudeSelected: number; isoWeeksSelected: number };
  completeness: "complete" | "bounded_partial" | "unknown";
  truncationReasons: Array<"candidate_limit" | "directory_limit" | "read_attempt_limit" | "scan_byte_limit" | "raw_byte_limit" | "observation_limit" | "graph_episode_limit" | "invalid_or_raced" | "not_collected">;
  authority: "none";
  privacy: { pathsPersisted: false; textPersisted: false; secretsPersisted: false; vectorsPersisted: false };
}

export interface TaskMapNativeCommunityShadowInputV1 {
  ownerScopeDigest: string;
  requestedAt: string;
  legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
  agentSessionGraphFeed: TaskMapAgentSessionGraphFeedV1 | null;
  graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
  candidateSemanticFragment?: TaskMapNativeSemanticBuilderInputV1;
  semanticEvidence: TaskMapNativeCommunityShadowSemanticEvidenceOptionsV1;
  previousAcceptedRoots: TaskMapPreviousAcceptedRootV1[];
  expectedLegacyFlags: TaskMapNativeCommunityShadowLegacyFlagsV1;
}

/**
 * Transient Plan2 input used by the authoritative projection builder. Unlike
 * the former shadow artifact, this plan has no publication binding or durable
 * filename: it exists only long enough to shape SemanticBrainOutput roots.
 */
export type TaskMapNativeCommunityPlanInputV1 = Omit<
  TaskMapNativeCommunityShadowInputV1,
  "expectedLegacyFlags" | "legacyBindings"
>;

export interface TaskMapNativeCommunityPlanV1 {
  planDigest: string;
  feedDigest: string | null;
  proposalSet: TaskMapCommunityRootProposalSetV1;
  /**
   * False when the grouping station was unavailable, so an empty proposal
   * set is a degradation signal rather than evidence that no communities
   * exist. Callers must then preserve the predecessor tree instead of
   * publishing a collapsed rebuild.
   */
  groupingAvailable: boolean;
}

export interface TaskMapNativeCommunityAgentRootPlanV1 {
  roots: Array<{
    rootProposalId: string;
    title: string;
    clusterIdentityDigests: string[];
  }>;
}

export const TASKMAP_NATIVE_COMMUNITY_ROOT_EVIDENCE_LIMITS_V1 = Object.freeze({
  maximumEventsPerRoot: 5,
  maximumEventsTotal: 128,
} as const);

export interface TaskMapNativeCommunityRootEvidenceV1 {
  taskMapInput: TaskMapInput;
  rootProposals: BrainRootProposal[];
}

export interface TaskMapNativeCommunityShadowFeedSummaryV1 {
  feedDigest: string | null;
  counts: TaskMapAgentSessionGraphFeedV1["counts"];
}

export interface TaskMapNativeCommunityShadowSourceFamilyCountsV1 {
  agent: number;
  meeting: number;
  calendar: number;
}

export interface TaskMapNativeCommunityShadowArtifactV1
  extends TaskMapNativeCommunityShadowLegacyFlagsV1 {
  contractVersion: typeof TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION;
  artifactId: string;
  artifactDigest: string;
  ownerScopeDigest: string;
  requestedAt: string;
  legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
  feed: TaskMapNativeCommunityShadowFeedSummaryV1;
  graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
  sourceFamilyCounts: TaskMapNativeCommunityShadowSourceFamilyCountsV1;
  semanticEvidenceReport: TaskMapCommunitySemanticEvidenceReportV1;
  communities: TaskMapCommunityGraphCommunityV1[];
  unclustered: string[];
  optimization: TaskMapCommunityGraphOptimizationV1;
  resourceUsage: TaskMapCommunityGraphResourceUsageV1;
  edges: {
    count: number;
    digest: string;
  };
  proposalSet: TaskMapCommunityRootProposalSetV1;
  authority: "none";
}

export interface BuildTaskMapNativeCommunityShadowUnavailableReceiptInputV1 {
  ownerScopeDigest: string;
  requestedAt: string;
  legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
  graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
}

export interface TaskMapNativeCommunityShadowUnavailableReceiptV1
  extends TaskMapNativeCommunityShadowLegacyFlagsV1 {
  contractVersion:
    typeof TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION;
  receiptId: string;
  receiptDigest: string;
  ownerScopeDigest: string;
  requestedAt: string;
  legacyBindings: TaskMapNativeCommunityShadowLegacyBindingsV1;
  graphCollectionCoverage: TaskMapNativeCommunityGraphCoverageV1;
  availability: "unavailable";
  authority: "none";
}

export type TaskMapNativeCommunityShadowFailureCode =
  | "invalid_input"
  | "pipeline_unavailable"
  | "output_limit_exceeded";

export class TaskMapNativeCommunityShadowUnavailableError extends TypeError {
  constructor(readonly code: TaskMapNativeCommunityShadowFailureCode) {
    super(`Task Map native community shadow unavailable: ${code}`);
    this.name = "TaskMapNativeCommunityShadowUnavailableError";
  }
}

interface CandidateNodeDraft {
  candidateIdentityRef: string;
  semanticOriginId: string;
  event: TaskMapEvent;
  evidenceBinding: TaskMapNativeSemanticEvidenceBindingV1;
  sourceFamily: "meeting" | "calendar";
  isoWeek: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_EXTERNAL_REF =
  /^(?:[a-f0-9]{64}|(?:external|canonical-meeting):[a-f0-9]{64})$/;
const CANONICAL_UTC_MILLISECONDS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const ISO_WEEK = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;
const CONTROL = /\p{Cc}/u;
const PERSISTENT_ID_CREDENTIAL =
  /(?:^|[._:=\-\s])(?:api[._-]?key|access[._-]?token|refresh[._-]?token|token|bearer|credential|password|secret)(?:$|[._:=\-\s])/iu;
const PERSISTENT_ID_PROVIDER_TOKEN =
  /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|aiza[A-Za-z0-9_-]{12,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,})/iu;
const PERSISTENT_ID_AWS_ACCESS_KEY = /(?:AKIA|ASIA)[0-9A-Z]{16}/u;
const PERSISTENT_ID_JWT =
  /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u;
const SENSITIVE_PERSISTED_TEXT_PATTERNS = [
  /(?:https?|ftp):\/\/[^\s<>"']+/iu,
  /file:\/\/\/[^\s<>"')\]]+/iu,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/iu,
  /(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)[^\s<>"')\],;]*/iu,
  /\b(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*["']?[^\s"',;]+/iu,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  PERSISTENT_ID_PROVIDER_TOKEN,
  PERSISTENT_ID_AWS_ACCESS_KEY,
  PERSISTENT_ID_JWT,
  /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/iu,
] as const;
const INERT_GROUPING_REPLAY_PATH =
  "/dev/null/taskmap-native-community-shadow-grouping";
const INERT_EMBEDDING_CACHE_PATH =
  "/dev/null/taskmap-native-community-shadow-embeddings";
const AGENT_EPISODE_KEYS = new Set([
  "acceptedMembershipAuthority",
  "assistantOutcomeSummary",
  "authority",
  "completionAuthority",
  "directiveSemanticDigest",
  "disposition",
  "episodeId",
  "episodeIdentityDigest",
  "episodeRevisionDigest",
  "firstSeenAt",
  "graphEpisodeDigest",
  "graphEpisodeId",
  "graphEpisodeRevisionDigest",
  "isoWeek",
  "lifecycleAuthority",
  "observedAt",
  "occurredAt",
  "parentRootSessionIdentityDigest",
  "proposalDisposition",
  "provider",
  "providerNeutralRoutingDigest",
  "recordKind",
  "recurrenceCount",
  "rootSessionIdentityDigest",
  "routing",
  "routingKind",
  "semanticUnit",
  "turnLineageIdentityDigest",
  "userDirectiveSummary",
  "verificationAuthority",
  "workstreamIdentityDigest",
]);
const POINTER_KEYS = new Set([
  "authority",
  "canonicalUrl",
  "capabilities",
  "id",
  "sourceKind",
  "sourceObjectId",
  "sourceRefHash",
  "sourceVersion",
  "syncMode",
]);
const EVENT_KEYS = new Set([
  "activity",
  "bodyAxis",
  "bodyCategory",
  "bodyJoinEligible",
  "corpusCoverage",
  "dayKey",
  "deadlineAt",
  "extractionConfidence",
  "id",
  "objectRefs",
  "observedAt",
  "occurredAt",
  "pointerId",
  "priority",
  "recordKind",
  "retractsEventId",
  "sourceStatus",
  "summary",
  "supersedesEventId",
  "title",
]);
const SOURCE_BINDING_KEYS = new Set([
  "evidenceContentDigest",
  "evidenceRevision",
  "observedContentDigest",
  "observedRevision",
  "pointerId",
  "semanticClass",
  "semanticIdentityDigest",
  "semanticOriginId",
  "sourceIdentityDigest",
]);
const EVIDENCE_BINDING_KEYS = new Set([
  "candidateIdentityRef",
  "candidateKind",
  "eventId",
  "mentionIdentityDigest",
  "disposition",
  "rootLinkRefs",
]);

function fail(code: TaskMapNativeCommunityShadowFailureCode): never {
  throw new TaskMapNativeCommunityShadowUnavailableError(code);
}

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  required: ReadonlySet<string>,
  allowed: ReadonlySet<string> = required,
): boolean {
  const actual = Object.keys(value);
  return [...required].every((key) => actual.includes(key))
    && actual.every((key) => allowed.has(key));
}

function compareCodePoint(left: string, right: string): number {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const sharedLength = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftScalars[index]!.codePointAt(0)!
      - rightScalars[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

function assertDigest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail("invalid_input");
  }
}

function assertSafeId(value: unknown): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOpaqueIdCharacters
    || CONTROL.test(value)
  ) fail("invalid_input");
}

function assertPrivacySafePersistentId(
  value: unknown,
): asserts value is string {
  assertSafeId(value);
  const lower = value.toLowerCase();
  if (
    value !== value.trim()
    || value !== toWellFormedText(value)
    || value.includes("/")
    || value.includes("\\")
    || lower.startsWith("file:")
    || value === "."
    || value === ".."
    || PERSISTENT_ID_CREDENTIAL.test(value)
    || PERSISTENT_ID_PROVIDER_TOKEN.test(value)
    || PERSISTENT_ID_AWS_ACCESS_KEY.test(value)
    || PERSISTENT_ID_JWT.test(value)
    || /^-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/iu.test(value)
    || hasSensitivePersistedText(value)
  ) fail("invalid_input");
}

function hasSensitivePersistedText(value: string): boolean {
  return SENSITIVE_PERSISTED_TEXT_PATTERNS.some((pattern) =>
    pattern.test(value)
  );
}

function redactSensitiveNodeText(value: string): string {
  let redacted = toWellFormedText(value);
  for (const pattern of SENSITIVE_PERSISTED_TEXT_PATTERNS) {
    redacted = redacted.replace(
      new RegExp(pattern.source, `${pattern.flags}g`),
      "[redacted]",
    );
  }
  return boundedUtf16(
    redacted.replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim(),
    TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodeTextCharacters,
  );
}

function assertPrivacySafeProposalSet(
  proposalSet: TaskMapCommunityRootProposalSetV1,
): void {
  assertPrivacySafePersistentId(proposalSet.proposalSetId);
  for (const proposal of proposalSet.proposals) {
    assertPrivacySafePersistentId(proposal.rootProposalId);
    assertPrivacySafePersistentId(proposal.baseRootProposalId);
    proposal.memberNodeIds.forEach(assertPrivacySafePersistentId);
    if (
      proposal.title !== toWellFormedText(proposal.title)
      || hasSensitivePersistedText(proposal.title)
    ) fail("invalid_input");
  }
  for (const lifecycle of proposalSet.lifecycle) {
    assertPrivacySafePersistentId(lifecycle.rootProposalId);
    assertPrivacySafePersistentId(lifecycle.baseRootProposalId);
    lifecycle.previousMemberNodeIds.forEach(assertPrivacySafePersistentId);
    lifecycle.currentMemberNodeIds.forEach(assertPrivacySafePersistentId);
  }
}

function hasUnanchoredSensitiveArtifactValue(value: unknown): boolean {
  if (typeof value === "string") return hasSensitivePersistedText(value);
  if (Array.isArray(value)) {
    return value.some(hasUnanchoredSensitiveArtifactValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .some(hasUnanchoredSensitiveArtifactValue);
  }
  return false;
}

function assertPrivacySafeArtifactBase(value: unknown): void {
  if (
    taskMapProjectionPrivacyLeakReasons(value).length > 0
    || hasUnanchoredSensitiveArtifactValue(value)
  ) fail("invalid_input");
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function assertTimestamp(value: unknown): asserts value is string {
  const match = typeof value === "string"
    ? CANONICAL_UTC_MILLISECONDS.exec(value)
    : null;
  if (
    match === null
    || !validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
    || Number(match[4]) > 23
    || Number(match[5]) > 59
    || Number(match[6]) > 59
    || !Number.isFinite(Date.parse(value as string))
    || new Date(Date.parse(value as string)).toISOString() !== value
  ) fail("invalid_input");
}

function assertCount(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail("invalid_input");
  }
}

function stableId(prefix: string, digest: string): string {
  return `${prefix}_${digest.slice(0, 16)}`;
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

function assertCanonicalByteBudget(value: unknown, maximum: number): void {
  let bytes: number;
  try {
    bytes = Buffer.byteLength(taskMapContractCanonicalJson(value), "utf8");
  } catch {
    fail("invalid_input");
  }
  if (bytes > maximum) fail("invalid_input");
}

function validateLegacyBindings(
  value: unknown,
): asserts value is TaskMapNativeCommunityShadowLegacyBindingsV1 {
  if (
    !plain(value)
    || !exactKeys(value, new Set([
      "candidateDigest",
      "graphInputDigest",
      "projectionDigest",
      "promotionReceiptHeadDigest",
    ]))
  ) fail("invalid_input");
  assertDigest(value.graphInputDigest);
  assertDigest(value.candidateDigest);
  assertDigest(value.projectionDigest);
  assertDigest(value.promotionReceiptHeadDigest);
}

function validateLegacyFlags(
  value: unknown,
): asserts value is TaskMapNativeCommunityShadowLegacyFlagsV1 {
  if (
    !plain(value)
    || !exactKeys(value, new Set([
      "acceptanceStoreMutated",
      "bodyMutated",
      "rankingMutated",
      "readAuthority",
    ]))
    || value.readAuthority !== false
    || value.rankingMutated !== false
    || value.bodyMutated !== false
    || value.acceptanceStoreMutated !== false
  ) fail("invalid_input");
}

function validateGraphCollectionCoverage(
  value: unknown,
): asserts value is TaskMapNativeCommunityGraphCoverageV1 {
  if (!plain(value)) fail("invalid_input");
  const coverage = value as Record<string, unknown>;
  if (
    !exactKeys(coverage, new Set(["authority", "completeness", "contractVersion", "discovery", "distribution", "observations", "privacy", "reads", "scan", "truncationReasons"]))
    || coverage.contractVersion !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION
    || coverage.authority !== "none"
    || !["complete", "bounded_partial", "unknown"].includes(
      String(coverage.completeness),
    )
  ) fail("invalid_input");
  const expectedKeys = {
    discovery: new Set(["candidateLimit", "candidateLimitReached", "candidatesDiscovered", "directoriesVisited", "directoryLimit", "directoryLimitReached"]),
    reads: new Set(["attemptLimit", "attemptedFiles", "droppedAttemptLimit", "droppedInvalid"]),
    scan: new Set(["chargedBytes", "droppedScanBudget", "globalByteLimit", "perFileByteLimit"]),
    observations: new Set(["droppedGraphEpisodes", "droppedObservationLimit", "droppedRawByteBudget", "graphEpisodesSelected", "maxGraphEpisodes", "observationLimit", "rawByteLimit", "rawBytesSelected", "selectedObservations"]),
    distribution: new Set(["claudeSelected", "codexSelected", "isoWeeksSelected"]),
  } as const;
  for (const key of ["discovery", "reads", "scan", "observations", "distribution"] as const) {
    if (!plain(coverage[key])) fail("invalid_input");
    if (!exactKeys(coverage[key], expectedKeys[key])) fail("invalid_input");
    for (const count of Object.values(coverage[key])) {
      if (typeof count === "boolean") continue;
      assertCount(count);
    }
  }
  if (!plain(coverage.privacy) || !exactKeys(coverage.privacy, new Set(["pathsPersisted", "secretsPersisted", "textPersisted", "vectorsPersisted"])) || Object.values(coverage.privacy).some((value) => value !== false)) {
    fail("invalid_input");
  }
  if (!Array.isArray(coverage.truncationReasons)) fail("invalid_input");
  const truncationReasons = coverage.truncationReasons as unknown[];
  const allowedReasons = new Set(["candidate_limit", "directory_limit", "read_attempt_limit", "scan_byte_limit", "raw_byte_limit", "observation_limit", "graph_episode_limit", "invalid_or_raced", "not_collected"]);
  if (truncationReasons.some((reason) => typeof reason !== "string" || !allowedReasons.has(reason))) fail("invalid_input");
  const canonicalReasons = [...truncationReasons as string[]].sort(compareCodePoint);
  if (new Set(canonicalReasons).size !== canonicalReasons.length || canonicalReasons.some((reason, index) => reason !== truncationReasons[index])) fail("invalid_input");
  const discovery = coverage.discovery as Record<string, unknown>;
  const reads = coverage.reads as Record<string, unknown>;
  const scan = coverage.scan as Record<string, unknown>;
  const observations = coverage.observations as Record<string, unknown>;
  const reasons = new Set(coverage.truncationReasons as string[]);
  if (
    typeof discovery.directoryLimitReached !== "boolean"
    || typeof discovery.candidateLimitReached !== "boolean"
    || (reads.attemptedFiles as number) > (reads.attemptLimit as number)
    || (discovery.directoriesVisited as number) > (discovery.directoryLimit as number)
    || (discovery.candidatesDiscovered as number) > (discovery.candidateLimit as number)
    || (scan.chargedBytes as number) > (scan.globalByteLimit as number)
    || (observations.selectedObservations as number) > (observations.observationLimit as number)
    || (observations.rawBytesSelected as number) > (observations.rawByteLimit as number)
    || (observations.graphEpisodesSelected as number) > (observations.maxGraphEpisodes as number)
    || discovery.directoryLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.directoryLimit
    || discovery.candidateLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.candidateLimit
    || reads.attemptLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.attemptLimit
    || scan.globalByteLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.globalScanByteLimit
    || scan.perFileByteLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.perFileScanByteLimit
    || observations.observationLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.observationLimit
    || observations.rawByteLimit !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.rawByteLimit
    || observations.maxGraphEpisodes !== TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.maxGraphEpisodes
    || (coverage.completeness === "unknown" && (reasons.size !== 1 || !reasons.has("not_collected")))
    || (coverage.completeness === "complete" && reasons.size !== 0)
    || (coverage.completeness === "bounded_partial" && (reasons.size === 0 || reasons.has("not_collected")))
    || (coverage.completeness !== "unknown" && Boolean(discovery.directoryLimitReached) !== reasons.has("directory_limit"))
    || (coverage.completeness !== "unknown" && Boolean(discovery.candidateLimitReached) !== reasons.has("candidate_limit"))
    || (coverage.completeness !== "unknown" && ((reads.droppedAttemptLimit as number) > 0) !== reasons.has("read_attempt_limit"))
    || (coverage.completeness !== "unknown" && ((reads.droppedInvalid as number) > 0) !== reasons.has("invalid_or_raced"))
    || (coverage.completeness !== "unknown" && ((scan.droppedScanBudget as number) > 0) !== reasons.has("scan_byte_limit"))
    || (coverage.completeness !== "unknown" && ((observations.droppedRawByteBudget as number) > 0) !== reasons.has("raw_byte_limit"))
    || (coverage.completeness !== "unknown" && ((observations.droppedObservationLimit as number) > 0) !== reasons.has("observation_limit"))
    || (coverage.completeness !== "unknown" && ((observations.droppedGraphEpisodes as number) > 0) !== reasons.has("graph_episode_limit"))
  ) fail("invalid_input");
}

function validateCoverageFeedBinding(
  coverage: TaskMapNativeCommunityGraphCoverageV1,
  feed: TaskMapAgentSessionGraphFeedV1 | null,
): void {
  const inputObservations = feed?.counts.inputObservations ?? 0;
  const selectedEpisodes = feed?.counts.selectedEpisodes ?? 0;
  const deduplicatedEpisodes = feed?.counts.deduplicatedEpisodes ?? 0;
  if (
    coverage.observations.selectedObservations !== inputObservations
    || coverage.observations.graphEpisodesSelected !== selectedEpisodes
    || coverage.observations.droppedGraphEpisodes
      !== deduplicatedEpisodes - selectedEpisodes
  ) fail("invalid_input");
}

function isoWeek(value: string): string {
  const source = new Date(value);
  const day = source.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth(),
    source.getUTCDate() + 4 - day,
  ));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    (((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7,
  );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function validateFeedEpisode(
  value: unknown,
): asserts value is TaskMapAgentSessionGraphFeedEpisodeV1 {
  if (!plain(value) || !exactKeys(value, AGENT_EPISODE_KEYS)) {
    fail("invalid_input");
  }
  for (const key of [
    "directiveSemanticDigest",
    "episodeIdentityDigest",
    "episodeRevisionDigest",
    "graphEpisodeDigest",
    "graphEpisodeRevisionDigest",
    "providerNeutralRoutingDigest",
    "rootSessionIdentityDigest",
    "turnLineageIdentityDigest",
    "workstreamIdentityDigest",
  ] as const) assertDigest(value[key]);
  assertDigest(value.episodeIdentityDigest);
  assertDigest(value.graphEpisodeDigest);
  if (value.parentRootSessionIdentityDigest !== null) {
    assertDigest(value.parentRootSessionIdentityDigest);
  }
  assertSafeId(value.episodeId);
  assertSafeId(value.graphEpisodeId);
  if (
    value.graphEpisodeId !== stableId("tmagraph", value.graphEpisodeDigest)
    || value.disposition !== "work_candidate"
    || value.semanticUnit !== "bounded_user_turn_work_episode"
    || value.recordKind !== "work_context"
    || value.proposalDisposition !== "candidate_or_context_only"
    || value.authority !== "none"
    || value.acceptedMembershipAuthority !== false
    || value.lifecycleAuthority !== false
    || value.completionAuthority !== false
    || value.verificationAuthority !== false
    || (value.provider !== "codex" && value.provider !== "claude")
    || (value.routingKind !== "project" && value.routingKind !== "repository")
    || typeof value.userDirectiveSummary !== "string"
    || value.userDirectiveSummary.length === 0
    || value.userDirectiveSummary.length
      > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodeTextCharacters
    || CONTROL.test(value.userDirectiveSummary)
    || (value.assistantOutcomeSummary !== null
      && typeof value.assistantOutcomeSummary !== "string")
  ) fail("invalid_input");
  assertTimestamp(value.occurredAt);
  assertTimestamp(value.observedAt);
  assertTimestamp(value.firstSeenAt);
  assertCount(value.recurrenceCount);
  if (
    value.recurrenceCount < 1
    || typeof value.isoWeek !== "string"
    || !ISO_WEEK.test(value.isoWeek)
    || value.isoWeek !== isoWeek(value.occurredAt)
    || Date.parse(value.firstSeenAt) > Date.parse(value.occurredAt)
    || Date.parse(value.occurredAt) > Date.parse(value.observedAt)
  ) fail("invalid_input");
  if (
    !plain(value.routing)
    || !exactKeys(value.routing, new Set([
      "projectIdentityDigests",
      "providerNeutralProjectIdentityDigests",
      "providerNeutralRepositoryIdentityDigests",
      "repositoryIdentityDigests",
      "role",
    ]))
    || value.routing.role !== "routing_metadata_only"
  ) fail("invalid_input");
  for (const key of [
    "projectIdentityDigests",
    "providerNeutralProjectIdentityDigests",
    "providerNeutralRepositoryIdentityDigests",
    "repositoryIdentityDigests",
  ] as const) {
    const digests = value.routing[key];
    if (!Array.isArray(digests) || digests.length > 2) fail("invalid_input");
    digests.forEach(assertDigest);
    const sorted = [...digests].sort(compareCodePoint);
    if (
      new Set(digests).size !== digests.length
      || digests.some((item, index) => item !== sorted[index])
    ) fail("invalid_input");
  }
  const episode = value as unknown as TaskMapAgentSessionGraphFeedEpisodeV1;
  const {
    episodeId,
    episodeRevisionDigest,
    graphEpisodeId: _graphEpisodeId,
    graphEpisodeDigest: _graphEpisodeDigest,
    graphEpisodeRevisionDigest: _graphEpisodeRevisionDigest,
    workstreamIdentityDigest: _workstreamIdentityDigest,
    routingKind: _routingKind,
    providerNeutralRoutingDigest: _providerNeutralRoutingDigest,
    isoWeek: _isoWeek,
    recurrenceCount: _recurrenceCount,
    firstSeenAt: _firstSeenAt,
    ...producerEpisodeBase
  } = episode;
  if (
    episodeId !== `tmaepisode_${
      taskMapContractDigest(episode.episodeIdentityDigest).slice(0, 16)
    }`
    || episodeRevisionDigest !== taskMapContractDigest(producerEpisodeBase)
  ) fail("invalid_input");
}

function validateAgentFeed(
  value: unknown,
  ownerScopeDigest: string,
  requestedAt: string,
): asserts value is TaskMapAgentSessionGraphFeedV1 | null {
  if (value === null) return;
  if (
    !plain(value)
    || !exactKeys(value, new Set([
      "acceptedMembershipAuthority",
      "authority",
      "contractVersion",
      "counts",
      "episodes",
      "feedDigest",
      "feedId",
      "limits",
      "ownerScopeDigest",
      "producedAt",
    ]))
    || value.contractVersion !== TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION
    || value.ownerScopeDigest !== ownerScopeDigest
    || value.authority !== "none"
    || value.acceptedMembershipAuthority !== false
    || taskMapContractCanonicalJson(value.limits)
      !== taskMapContractCanonicalJson(TASKMAP_AGENT_GRAPH_LIMITS_V1)
    || !Array.isArray(value.episodes)
    || value.episodes.length
      > TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumAgentNodes
    || !plain(value.counts)
    || !exactKeys(value.counts, new Set([
      "deduplicatedEpisodes",
      "eligibleEpisodes",
      "inputObservations",
      "selectedEpisodes",
    ]))
  ) fail("invalid_input");
  assertTimestamp(value.producedAt);
  if (Date.parse(value.producedAt) > Date.parse(requestedAt)) {
    fail("invalid_input");
  }
  assertDigest(value.feedDigest);
  assertSafeId(value.feedId);
  for (const key of [
    "deduplicatedEpisodes",
    "eligibleEpisodes",
    "inputObservations",
    "selectedEpisodes",
  ] as const) assertCount(value.counts[key]);
  const eligibleEpisodes = value.counts.eligibleEpisodes as number;
  const deduplicatedEpisodes = value.counts.deduplicatedEpisodes as number;
  const selectedEpisodes = value.counts.selectedEpisodes as number;
  if (
    selectedEpisodes !== value.episodes.length
    || selectedEpisodes > deduplicatedEpisodes
    || deduplicatedEpisodes > eligibleEpisodes
  ) fail("invalid_input");
  value.episodes.forEach(validateFeedEpisode);
  const nodeIds = value.episodes.map((episode) => episode.graphEpisodeId);
  const canonicalNodeIds = [...nodeIds].sort(compareCodePoint);
  if (
    new Set(nodeIds).size !== nodeIds.length
    || nodeIds.some((nodeId, index) => nodeId !== canonicalNodeIds[index])
  ) fail("invalid_input");
  const { feedDigest, feedId, ...base } = value;
  if (
    feedDigest !== taskMapContractDigest(base)
    || feedId !== stableId("tmagraphfeed", feedDigest)
  ) fail("invalid_input");
}

function validateSemanticOptions(
  value: unknown,
): asserts value is TaskMapNativeCommunityShadowSemanticEvidenceOptionsV1 {
  const allowed = new Set([
    "embeddingCachePath",
    "embeddingModelId",
    "embeddingProvider",
    "groupingReplayPath",
    "signal",
    "station",
    "storageHooksForTesting",
    "titleReplayPath",
  ]);
  if (!plain(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    fail("invalid_input");
  }
  const stationModel = plain(value.station) && plain(value.station.provider)
    ? value.station.provider.model
    : undefined;
  for (const model of [stationModel, value.embeddingModelId]) {
    if (
      typeof model === "string"
      && (
        taskMapProjectionPrivacyLeakReasons(model).length > 0
        || hasSensitivePersistedText(model)
      )
    ) fail("invalid_input");
  }
  for (
    const key of [
      "embeddingCachePath",
      "groupingReplayPath",
      "titleReplayPath",
    ] as const
  ) {
    const candidate = value[key];
    if (
      candidate !== undefined
      && (
        typeof candidate !== "string"
        || candidate.length === 0
        || candidate.length > 4_096
        || candidate.includes("\u0000")
      )
    ) fail("invalid_input");
  }
}

function validatePointer(value: unknown): asserts value is TaskMapSourcePointer {
  if (
    !plain(value)
    || !exactKeys(
      value,
      new Set([
        "authority",
        "capabilities",
        "id",
        "sourceKind",
        "sourceObjectId",
        "sourceRefHash",
        "syncMode",
      ]),
      POINTER_KEYS,
    )
  ) fail("invalid_input");
  assertSafeId(value.id);
  assertSafeId(value.sourceObjectId);
  assertDigest(value.sourceRefHash);
  if (value.sourceVersion !== undefined) assertDigest(value.sourceVersion);
  if (!Array.isArray(value.capabilities)) fail("invalid_input");
}

function validateEvent(value: unknown): asserts value is TaskMapEvent {
  if (
    !plain(value)
    || !exactKeys(
      value,
      new Set([
        "activity",
        "extractionConfidence",
        "id",
        "objectRefs",
        "observedAt",
        "occurredAt",
        "pointerId",
        "recordKind",
        "summary",
        "title",
      ]),
      EVENT_KEYS,
    )
  ) fail("invalid_input");
  assertSafeId(value.id);
  assertSafeId(value.pointerId);
  assertTimestamp(value.occurredAt);
  assertTimestamp(value.observedAt);
  if (
    !Array.isArray(value.objectRefs)
    || value.objectRefs.length
      > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxExternalRefsPerNode
    || value.objectRefs.some((ref) =>
      typeof ref !== "string" || ref.length === 0 || ref.length > 512
    )
    || typeof value.title !== "string"
    || typeof value.summary !== "string"
    || typeof value.extractionConfidence !== "number"
    || !Number.isFinite(value.extractionConfidence)
    || value.extractionConfidence < 0
    || value.extractionConfidence > 1
  ) fail("invalid_input");
}

function validateSourceBinding(
  value: unknown,
): asserts value is TaskMapNativeSemanticSourceBindingV1 {
  if (!plain(value) || !exactKeys(value, SOURCE_BINDING_KEYS)) {
    fail("invalid_input");
  }
  assertSafeId(value.pointerId);
  assertSafeId(value.semanticOriginId);
  assertDigest(value.semanticIdentityDigest);
  assertDigest(value.sourceIdentityDigest);
  assertDigest(value.observedContentDigest);
  assertDigest(value.evidenceContentDigest);
  if (
    typeof value.observedRevision !== "string"
    || value.observedRevision.length === 0
    || value.observedRevision.length > 512
    || typeof value.evidenceRevision !== "string"
    || value.evidenceRevision.length === 0
    || value.evidenceRevision.length > 512
  ) fail("invalid_input");
}

function validateEvidenceBinding(
  value: unknown,
): asserts value is TaskMapNativeSemanticEvidenceBindingV1 {
  if (
    !plain(value)
    || !exactKeys(
      value,
      new Set(["disposition", "eventId", "rootLinkRefs"]),
      EVIDENCE_BINDING_KEYS,
    )
  ) fail("invalid_input");
  assertSafeId(value.eventId);
  if (
    !Array.isArray(value.rootLinkRefs)
    || value.rootLinkRefs.some((ref) =>
      typeof ref !== "string" || !/^external:[a-f0-9]{64}$/.test(ref)
    )
    || new Set(value.rootLinkRefs).size !== value.rootLinkRefs.length
  ) fail("invalid_input");
}

function sourceFamily(
  pointer: TaskMapSourcePointer,
  sourceBinding: TaskMapNativeSemanticSourceBindingV1,
): "meeting" | "calendar" | null {
  if (
    (pointer.sourceKind === "gemini_meet" || pointer.sourceKind === "granola")
    && sourceBinding.semanticClass === "meeting_context"
  ) return "meeting";
  if (
    (pointer.sourceKind === "google_calendar"
      || pointer.sourceKind === "local_calendar")
    && sourceBinding.semanticClass === "context_only"
  ) return "calendar";
  return null;
}

function validateCandidateBinding(
  event: TaskMapEvent,
  pointer: TaskMapSourcePointer,
  sourceBinding: TaskMapNativeSemanticSourceBindingV1,
  evidenceBinding: TaskMapNativeSemanticEvidenceBindingV1,
): "meeting" | "calendar" {
  const family = sourceFamily(pointer, sourceBinding);
  const candidateIdentityRef = evidenceBinding.candidateIdentityRef;
  if (
    family === null
    || evidenceBinding.disposition !== "candidate_only"
    || event.pointerId !== pointer.id
    || sourceBinding.pointerId !== pointer.id
    || event.recordKind !== "work_context"
    || event.activity !== "commitment_stated"
    || typeof candidateIdentityRef !== "string"
    || !/^external:[a-f0-9]{64}$/.test(candidateIdentityRef)
    || (evidenceBinding.candidateKind !== "action_item"
      && evidenceBinding.candidateKind !== "commitment")
    || (evidenceBinding.mentionIdentityDigest !== undefined
      && !SHA256.test(evidenceBinding.mentionIdentityDigest))
    || !event.objectRefs.includes(candidateIdentityRef)
    || evidenceBinding.rootLinkRefs.some((ref) =>
      !event.objectRefs.includes(ref) || ref === candidateIdentityRef
    )
    || pointer.authority !== "none"
    || pointer.syncMode !== "reference_only"
    || !pointer.capabilities.includes("read_context")
    || pointer.sourceRefHash !== sourceBinding.semanticIdentityDigest
    || pointer.sourceVersion !== sourceBinding.evidenceContentDigest
    || sourceBinding.observedRevision !== sourceBinding.evidenceRevision
    || sourceBinding.observedContentDigest
      !== sourceBinding.evidenceContentDigest
  ) fail("invalid_input");
  const externalRefs = event.objectRefs.filter((ref) =>
    /^external:[a-f0-9]{64}$/.test(ref)
  );
  const expectedExternalRefs = new Set([
    candidateIdentityRef,
    ...evidenceBinding.rootLinkRefs,
  ]);
  if (
    externalRefs.length !== expectedExternalRefs.size
    || externalRefs.some((ref) => !expectedExternalRefs.has(ref))
  ) fail("invalid_input");
  const expectedCandidateIdentityRef = `external:${
    taskMapMeetingStatementReferenceDigest({
      kind: evidenceBinding.candidateKind,
      title: event.title,
      summary: event.summary,
      explicitExternalReferenceDigests: evidenceBinding.rootLinkRefs.map(
        (ref) => ref.slice("external:".length),
      ),
      ...(evidenceBinding.mentionIdentityDigest === undefined
        ? {}
        : { mentionIdentityDigest: evidenceBinding.mentionIdentityDigest }),
    })
  }`;
  if (candidateIdentityRef !== expectedCandidateIdentityRef) {
    fail("invalid_input");
  }
  if (family === "meeting") {
    const origins = event.objectRefs.flatMap((ref) => {
      const match = /^canonical-meeting:([a-f0-9]{64})$/.exec(ref);
      return match === null ? [] : [match[1]!];
    });
    if (
      origins.length !== 1
      || origins[0] !== sourceBinding.semanticOriginId
    ) fail("invalid_input");
  }
  return family;
}

function validateSemanticFragment(
  value: unknown,
  ownerScopeDigest: string,
  requestedAt: string,
): TaskMapNativeSemanticBuilderInputV1 | undefined {
  if (value === undefined) return undefined;
  if (
    !plain(value)
    || !exactKeys(value, new Set([
      "contractVersion",
      "evidenceBindings",
      "freshness",
      "ownerScopeDigest",
      "producer",
      "sourceBindings",
      "taskMapInput",
    ]))
    || value.contractVersion !== TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION
    || value.ownerScopeDigest !== ownerScopeDigest
    || !plain(value.producer)
    || !exactKeys(value.producer, new Set(["id", "version"]))
    || !plain(value.freshness)
    || !exactKeys(value.freshness, new Set([
      "assessedAt",
      "available",
      "decision",
      "producedAt",
      "retainedLastGood",
      "validThrough",
    ]))
    || !plain(value.taskMapInput)
    || !exactKeys(value.taskMapInput, new Set([
      "contractVersion",
      "events",
      "generatedAt",
      "pointers",
    ]))
    || !Array.isArray(value.sourceBindings)
    || !Array.isArray(value.evidenceBindings)
    || !Array.isArray(value.taskMapInput.pointers)
    || !Array.isArray(value.taskMapInput.events)
    || value.sourceBindings.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumSourceBindings
    || value.evidenceBindings.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumEvidenceBindings
    || value.taskMapInput.pointers.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumPointers
    || value.taskMapInput.events.length
      > TASKMAP_NATIVE_SEMANTIC_BUILDER_LIMITS_V1.maximumTotalEvents
    || value.taskMapInput.contractVersion !== TASKMAP_CONTRACT_VERSION
    || value.producer.id !== TASKMAP_MEETING_PRODUCER_RESULT_VERSION
    || value.producer.version !== TASKMAP_MEETING_PRODUCER_VERSION
    || value.freshness.decision !== "fresh"
    || value.freshness.available !== true
    || value.freshness.retainedLastGood !== false
  ) fail("invalid_input");
  assertTimestamp(value.taskMapInput.generatedAt);
  assertTimestamp(value.freshness.producedAt);
  assertTimestamp(value.freshness.validThrough);
  assertTimestamp(value.freshness.assessedAt);
  const producedAtMs = Date.parse(value.freshness.producedAt);
  const validThroughMs = Date.parse(value.freshness.validThrough);
  const assessedAtMs = Date.parse(value.freshness.assessedAt);
  const requestedAtMs = Date.parse(requestedAt);
  if (
    validThroughMs - producedAtMs !== TASKMAP_MEETING_PRODUCER_MAX_AGE_MS
    || assessedAtMs < producedAtMs
    || assessedAtMs >= validThroughMs
    || producedAtMs > requestedAtMs
    || requestedAtMs >= validThroughMs
  ) fail("invalid_input");
  value.taskMapInput.pointers.forEach(validatePointer);
  value.taskMapInput.events.forEach(validateEvent);
  value.sourceBindings.forEach(validateSourceBinding);
  value.evidenceBindings.forEach(validateEvidenceBinding);
  const pointers = new Map(value.taskMapInput.pointers.map((pointer) => [
    pointer.id,
    pointer,
  ]));
  const events = new Map(value.taskMapInput.events.map((event) => [
    event.id,
    event,
  ]));
  const sourceBindings = new Map(value.sourceBindings.map((binding) => [
    binding.pointerId,
    binding,
  ]));
  const evidenceBindings = new Map(value.evidenceBindings.map((binding) => [
    binding.eventId,
    binding,
  ]));
  if (
    pointers.size !== value.taskMapInput.pointers.length
    || events.size !== value.taskMapInput.events.length
    || sourceBindings.size !== value.sourceBindings.length
    || evidenceBindings.size !== value.evidenceBindings.length
    || pointers.size !== sourceBindings.size
    || events.size !== evidenceBindings.size
    || [...pointers.keys()].some((pointerId) => !sourceBindings.has(pointerId))
    || [...events.keys()].some((eventId) => !evidenceBindings.has(eventId))
  ) fail("invalid_input");
  for (const event of events.values()) {
    const pointer = pointers.get(event.pointerId);
    const source = sourceBindings.get(event.pointerId);
    const evidence = evidenceBindings.get(event.id)!;
    if (pointer === undefined || source === undefined) fail("invalid_input");
    if (evidence.disposition === "candidate_only") {
      validateCandidateBinding(event, pointer, source, evidence);
    }
  }
  if (
    taskMapInputValidationReasons(
      value.taskMapInput as unknown as
        TaskMapNativeSemanticBuilderInputV1["taskMapInput"],
    ).length > 0
  ) fail("invalid_input");
  return value as unknown as TaskMapNativeSemanticBuilderInputV1;
}

function validatePreviousAcceptedRoots(
  value: unknown,
): asserts value is TaskMapPreviousAcceptedRootV1[] {
  if (
    !Array.isArray(value)
    || value.length
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots
  ) fail("invalid_input");
  const rootIds = new Set<string>();
  let aggregateMemberCount = 0;
  for (const root of value) {
    if (
      !plain(root)
      || !exactKeys(root, new Set(["memberNodeIds", "rootProposalId"]))
      || !Array.isArray(root.memberNodeIds)
      || root.memberNodeIds.length === 0
      || root.memberNodeIds.length
        > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
          .maxMembersPerPreviousRoot
    ) fail("invalid_input");
    assertPrivacySafePersistentId(root.rootProposalId);
    root.memberNodeIds.forEach(assertPrivacySafePersistentId);
    if (
      rootIds.has(root.rootProposalId)
      || new Set(root.memberNodeIds).size !== root.memberNodeIds.length
    ) fail("invalid_input");
    rootIds.add(root.rootProposalId);
    aggregateMemberCount += root.memberNodeIds.length;
    if (
      aggregateMemberCount
        > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal
    ) fail("invalid_input");
  }
  const normalized = value.map((root) => ({
    rootProposalId: root.rootProposalId,
    memberNodeIds: [...root.memberNodeIds].sort(compareCodePoint),
  })).sort((left, right) => compareCodePoint(
    left.rootProposalId,
    right.rootProposalId,
  ));
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(normalized), "utf8")
      > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRootsBytes
  ) fail("invalid_input");
}

function validateInput(value: unknown): TaskMapNativeCommunityShadowInputV1 {
  const required = new Set([
    "agentSessionGraphFeed",
    "expectedLegacyFlags",
    "graphCollectionCoverage",
    "legacyBindings",
    "ownerScopeDigest",
    "previousAcceptedRoots",
    "requestedAt",
    "semanticEvidence",
  ]);
  const allowed = new Set([...required, "candidateSemanticFragment"]);
  if (!plain(value) || !exactKeys(value, required, allowed)) {
    fail("invalid_input");
  }
  assertCanonicalByteBudget(
    value,
    TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumInputBytes,
  );
  assertDigest(value.ownerScopeDigest);
  assertTimestamp(value.requestedAt);
  validateLegacyBindings(value.legacyBindings);
  validateLegacyFlags(value.expectedLegacyFlags);
  validateGraphCollectionCoverage(value.graphCollectionCoverage);
  validateAgentFeed(
    value.agentSessionGraphFeed,
    value.ownerScopeDigest,
    value.requestedAt,
  );
  validateCoverageFeedBinding(
    value.graphCollectionCoverage,
    value.agentSessionGraphFeed,
  );
  validateSemanticOptions(value.semanticEvidence);
  validatePreviousAcceptedRoots(value.previousAcceptedRoots);
  validateSemanticFragment(
    value.candidateSemanticFragment,
    value.ownerScopeDigest,
    value.requestedAt,
  );
  return value as unknown as TaskMapNativeCommunityShadowInputV1;
}

function agentNodes(
  feed: TaskMapAgentSessionGraphFeedV1 | null,
): TaskMapCommunityGraphNodeInputV1[] {
  if (feed === null) return [];
  return feed.episodes.map((episode) => ({
    nodeId: episode.graphEpisodeId,
    text: redactSensitiveNodeText(episode.userDirectiveSummary),
    sourceFamily: "agent",
    routingDigest: episode.providerNeutralRoutingDigest,
    occurredAt: episode.occurredAt,
    externalRefs: [episode.directiveSemanticDigest],
    embedding: null,
    isCalendarCommitment: false,
  }));
}

function candidateDrafts(
  fragment: TaskMapNativeSemanticBuilderInputV1 | undefined,
): CandidateNodeDraft[] {
  if (fragment === undefined) return [];
  const inactiveEventIds = new Set<string>();
  const retractorEventIds = new Set<string>();
  for (const event of fragment.taskMapInput.events) {
    if (event.supersedesEventId !== undefined) {
      inactiveEventIds.add(event.supersedesEventId);
    }
    if (event.retractsEventId !== undefined) {
      inactiveEventIds.add(event.retractsEventId);
      retractorEventIds.add(event.id);
    }
  }
  const pointers = new Map(fragment.taskMapInput.pointers.map((pointer) => [
    pointer.id,
    pointer,
  ]));
  const events = new Map(fragment.taskMapInput.events.map((event) => [
    event.id,
    event,
  ]));
  const sourceBindings = new Map(fragment.sourceBindings.map((binding) => [
    binding.pointerId,
    binding,
  ]));
  const deduplicated = new Map<string, CandidateNodeDraft>();
  for (const evidenceBinding of fragment.evidenceBindings) {
    if (evidenceBinding.disposition !== "candidate_only") continue;
    if (
      inactiveEventIds.has(evidenceBinding.eventId)
      || retractorEventIds.has(evidenceBinding.eventId)
    ) continue;
    const event = events.get(evidenceBinding.eventId)!;
    const pointer = pointers.get(event.pointerId)!;
    const sourceBinding = sourceBindings.get(event.pointerId)!;
    const family = validateCandidateBinding(
      event,
      pointer,
      sourceBinding,
      evidenceBinding,
    );
    const key = `${family}\u0000${
      evidenceBinding.candidateIdentityRef!
    }\u0000${sourceBinding.semanticOriginId}`;
    const candidate: CandidateNodeDraft = {
      candidateIdentityRef: evidenceBinding.candidateIdentityRef!,
      semanticOriginId: sourceBinding.semanticOriginId,
      event,
      evidenceBinding,
      sourceFamily: family,
      isoWeek: isoWeek(event.occurredAt),
    };
    const previous = deduplicated.get(key);
    if (
      previous === undefined
      || compareCodePoint(event.id, previous.event.id) < 0
    ) deduplicated.set(key, candidate);
  }
  return [...deduplicated.values()];
}

function fairFamilyWeekQueue(
  drafts: readonly CandidateNodeDraft[],
): CandidateNodeDraft[] {
  const byWeek = new Map<string, CandidateNodeDraft[]>();
  for (const draft of drafts) {
    const members = byWeek.get(draft.isoWeek) ?? [];
    members.push(draft);
    byWeek.set(draft.isoWeek, members);
  }
  const weeks = [...byWeek.entries()]
    .map(([week, members]) => ({
      week,
      members: members.sort((left, right) =>
        compareCodePoint(left.event.id, right.event.id)
      ),
    }))
    .sort((left, right) => compareCodePoint(right.week, left.week));
  const queue: CandidateNodeDraft[] = [];
  for (let round = 0; ; round += 1) {
    let added = false;
    for (const week of weeks) {
      const candidate = week.members[round];
      if (candidate === undefined) continue;
      queue.push(candidate);
      added = true;
    }
    if (!added) break;
  }
  return queue;
}

function fairCandidateHead(
  drafts: readonly CandidateNodeDraft[],
): CandidateNodeDraft[] {
  const familyQueues = (["calendar", "meeting"] as const).map((family) => ({
    family,
    queue: fairFamilyWeekQueue(
      drafts.filter((draft) => draft.sourceFamily === family),
    ),
  }));
  const selected: CandidateNodeDraft[] = [];
  selection: for (let round = 0; ; round += 1) {
    let added = false;
    for (const family of familyQueues) {
      const candidate = family.queue[round];
      if (candidate === undefined) continue;
      selected.push(candidate);
      added = true;
      if (
        selected.length
          === TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1
            .maximumMeetingCalendarNodes
      ) break selection;
    }
    if (!added) break;
  }
  return selected;
}

function candidateNode(
  ownerScopeDigest: string,
  draft: CandidateNodeDraft,
): TaskMapCommunityGraphNodeInputV1 {
  const nodeIdentityDigest = taskMapContractDigest({
    domain: "taskmap-native-community-shadow-node.1",
    ownerScopeDigest,
    candidateIdentityRef: draft.candidateIdentityRef,
    semanticOriginId: draft.semanticOriginId,
    sourceFamily: draft.sourceFamily,
  });
  const routingDigest = taskMapContractDigest({
    domain: "taskmap-native-community-shadow-routing.1",
    ownerScopeDigest,
    semanticOriginId: draft.semanticOriginId,
  });
  const externalRefs = [...new Set([
    ...draft.event.objectRefs,
    ...draft.evidenceBinding.rootLinkRefs,
    draft.candidateIdentityRef,
  ].filter((ref) => CANONICAL_EXTERNAL_REF.test(ref)))]
    .sort(compareCodePoint);
  const text = redactSensitiveNodeText(
    [
      draft.event.title.trim(),
      draft.event.summary.trim(),
    ].filter((part) => part.length > 0).join(" — "),
  );
  if (text.length === 0 || CONTROL.test(text)) fail("invalid_input");
  return {
    nodeId: `tmcommunitynode_${nodeIdentityDigest.slice(0, 24)}`,
    text,
    sourceFamily: draft.sourceFamily,
    routingDigest,
    occurredAt: draft.event.occurredAt,
    externalRefs,
    embedding: null,
    isCalendarCommitment:
      draft.sourceFamily === "calendar"
      && draft.evidenceBinding.candidateKind === "commitment",
  };
}

export interface TaskMapNativeCommunityCandidateNodeBindingV1 {
  statementReferenceDigest: string;
  nodeId: string;
}

/** Exact candidate-to-node bridge for the review hierarchy. */
export function taskMapNativeCommunityCandidateNodeBindings(
  fragment: TaskMapNativeSemanticBuilderInputV1,
  ownerScopeDigest: string,
  requestedAt: string,
): TaskMapNativeCommunityCandidateNodeBindingV1[] {
  const validated = validateSemanticFragment(
    fragment,
    ownerScopeDigest,
    requestedAt,
  );
  if (validated === undefined) return [];
  return candidateDrafts(validated).map((draft) => {
    const match = /^external:([a-f0-9]{64})$/.exec(
      draft.candidateIdentityRef,
    );
    if (match === null) fail("invalid_input");
    return {
      statementReferenceDigest: match[1]!,
      nodeId: candidateNode(ownerScopeDigest, draft).nodeId,
    };
  }).sort((left, right) => compareCodePoint(left.nodeId, right.nodeId));
}

function sourceFamilyCounts(
  nodes: readonly TaskMapCommunityGraphNodeInputV1[],
): TaskMapNativeCommunityShadowSourceFamilyCountsV1 {
  const counts: TaskMapNativeCommunityShadowSourceFamilyCountsV1 = {
    agent: 0,
    meeting: 0,
    calendar: 0,
  };
  for (const node of nodes) counts[node.sourceFamily] += 1;
  return counts;
}

function feedSummary(
  feed: TaskMapAgentSessionGraphFeedV1 | null,
): TaskMapNativeCommunityShadowFeedSummaryV1 {
  if (feed === null) {
    return {
      feedDigest: null,
      counts: {
        inputObservations: 0,
        eligibleEpisodes: 0,
        deduplicatedEpisodes: 0,
        selectedEpisodes: 0,
      },
    };
  }
  return {
    feedDigest: feed.feedDigest,
    counts: { ...feed.counts },
  };
}

function unavailableReceiptBase(
  input: BuildTaskMapNativeCommunityShadowUnavailableReceiptInputV1,
) {
  return {
    contractVersion: TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    requestedAt: input.requestedAt,
    legacyBindings: { ...input.legacyBindings },
    graphCollectionCoverage: structuredClone(input.graphCollectionCoverage),
    availability: "unavailable" as const,
    authority: "none" as const,
    readAuthority: false as const,
    rankingMutated: false as const,
    bodyMutated: false as const,
    acceptanceStoreMutated: false as const,
  };
}

export function buildTaskMapNativeCommunityShadowUnavailableReceipt(
  input: BuildTaskMapNativeCommunityShadowUnavailableReceiptInputV1,
): TaskMapNativeCommunityShadowUnavailableReceiptV1 {
  if (
    !plain(input)
    || !exactKeys(input, new Set([
      "legacyBindings",
      "graphCollectionCoverage",
      "ownerScopeDigest",
      "requestedAt",
    ]))
  ) fail("invalid_input");
  assertDigest(input.ownerScopeDigest);
  assertTimestamp(input.requestedAt);
  validateLegacyBindings(input.legacyBindings);
  validateGraphCollectionCoverage(input.graphCollectionCoverage);
  const base = unavailableReceiptBase(input);
  const receiptDigest = taskMapContractDigest(base);
  const result: TaskMapNativeCommunityShadowUnavailableReceiptV1 = {
    ...base,
    receiptId: stableId("tmcommunityunavailable", receiptDigest),
    receiptDigest,
  };
  if (Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8") >= 4_096) {
    fail("output_limit_exceeded");
  }
  return deepFreeze(result);
}

const TRANSIENT_PLAN_BINDING_DIGEST = "0".repeat(64);

/**
 * Computes the Plan2 community proposal set without writing a sidecar or
 * acquiring read/ranking/body/acceptance authority.
 */
export async function buildTaskMapNativeCommunityPlan(
  input: TaskMapNativeCommunityPlanInputV1,
): Promise<TaskMapNativeCommunityPlanV1> {
  const artifact = await buildTaskMapNativeCommunityShadow({
    ...input,
    legacyBindings: {
      graphInputDigest: TRANSIENT_PLAN_BINDING_DIGEST,
      candidateDigest: TRANSIENT_PLAN_BINDING_DIGEST,
      projectionDigest: TRANSIENT_PLAN_BINDING_DIGEST,
      promotionReceiptHeadDigest: TRANSIENT_PLAN_BINDING_DIGEST,
    },
    expectedLegacyFlags: {
      readAuthority: false,
      rankingMutated: false,
      bodyMutated: false,
      acceptanceStoreMutated: false,
    },
  });
  const base = {
    feedDigest: artifact.feed.feedDigest,
    proposalSet: artifact.proposalSet,
  };
  return deepFreeze({
    ...base,
    planDigest: taskMapContractDigest(base),
    groupingAvailable:
      artifact.semanticEvidenceReport.grouping.state === "available",
  });
}

/**
 * Resolves Plan2 graph members back to the current admission through the
 * exact graph-episode tuple. Missing or multiply-routed tuples are omitted so
 * the projection builder can retain their legacy workstream fallback roots.
 */
export function mapTaskMapNativeCommunityPlanToAgentRoots(input: {
  plan: TaskMapNativeCommunityPlanV1;
  feed: TaskMapAgentSessionGraphFeedV1;
  admission: TaskMapAgentSessionSemanticAdmissionV2;
}): TaskMapNativeCommunityAgentRootPlanV1 {
  assertTaskMapAgentSessionSemanticAdmission(input.admission);
  validateAgentFeed(
    input.feed,
    input.admission.ownerScopeDigest,
    input.admission.producedAt,
  );
  if (input.plan.feedDigest !== input.feed.feedDigest) fail("invalid_input");
  const episodeById = new Map(input.feed.episodes.map((episode) => [
    episode.graphEpisodeId,
    episode,
  ] as const));
  const exactKey = (value: {
    workstreamIdentityDigest: string;
    directiveSemanticDigest: string;
  }): string => `${value.workstreamIdentityDigest}\u0000${
    value.directiveSemanticDigest
  }`;
  const rootIdsByExactKey = new Map<string, Set<string>>();
  const proposalById = new Map(input.plan.proposalSet.proposals.map(
    (proposal) => [proposal.rootProposalId, proposal] as const,
  ));
  for (const proposal of input.plan.proposalSet.proposals) {
    for (const memberNodeId of proposal.memberNodeIds) {
      const episode = episodeById.get(memberNodeId);
      if (episode === undefined) continue;
      const key = exactKey(episode);
      const rootIds = rootIdsByExactKey.get(key) ?? new Set<string>();
      rootIds.add(proposal.rootProposalId);
      rootIdsByExactKey.set(key, rootIds);
    }
  }
  const clusterIdsByRoot = new Map<string, string[]>();
  for (const cluster of input.admission.clusters) {
    const rootIds = rootIdsByExactKey.get(exactKey(cluster));
    if (rootIds?.size !== 1) continue;
    const rootProposalId = [...rootIds][0]!;
    if (!proposalById.has(rootProposalId)) continue;
    const clusterIds = clusterIdsByRoot.get(rootProposalId) ?? [];
    clusterIds.push(cluster.clusterIdentityDigest);
    clusterIdsByRoot.set(rootProposalId, clusterIds);
  }
  return deepFreeze({
    roots: [...clusterIdsByRoot.entries()].map(([
      rootProposalId,
      clusterIdentityDigests,
    ]) => ({
      rootProposalId,
      title: proposalById.get(rootProposalId)!.title,
      clusterIdentityDigests: [...new Set(clusterIdentityDigests)].sort(
        compareCodePoint,
      ),
    })).sort((left, right) => compareCodePoint(
      left.rootProposalId,
      right.rootProposalId,
    )),
  });
}

function historicalAgentTupleKey(value: {
  workstreamIdentityDigest: string;
  directiveSemanticDigest: string;
}): string {
  return `${value.workstreamIdentityDigest}\u0000${
    value.directiveSemanticDigest
  }`;
}

export function buildTaskMapNativeCommunityRootEvidence(
  input: {
    plan: TaskMapNativeCommunityPlanV1;
    feed: TaskMapAgentSessionGraphFeedV1;
    generatedAt: string;
    currentAdmission?: TaskMapAgentSessionSemanticAdmissionV2 | null;
  },
): TaskMapNativeCommunityRootEvidenceV1 {
  validateAgentFeed(
    input.feed,
    input.feed.ownerScopeDigest,
    input.generatedAt,
  );
  if (
    input.plan.feedDigest !== input.feed.feedDigest
    || input.plan.planDigest !== taskMapContractDigest({
      feedDigest: input.plan.feedDigest,
      proposalSet: input.plan.proposalSet,
    })
  ) fail("invalid_input");
  assertPrivacySafeProposalSet(input.plan.proposalSet);
  const currentAdmission = input.currentAdmission ?? null;
  if (currentAdmission !== null) {
    assertTaskMapAgentSessionSemanticAdmission(currentAdmission);
    if (currentAdmission.ownerScopeDigest !== input.feed.ownerScopeDigest) {
      fail("invalid_input");
    }
  }
  const excludedTuples = new Set(
    currentAdmission?.clusters.map(historicalAgentTupleKey) ?? [],
  );
  const episodeById = new Map(input.feed.episodes.map((episode) => [
    episode.graphEpisodeId,
    episode,
  ] as const));
  const proposalIdsByEpisode = new Map<string, Set<string>>();
  for (const proposal of input.plan.proposalSet.proposals) {
    for (const memberNodeId of proposal.memberNodeIds) {
      if (!episodeById.has(memberNodeId)) continue;
      const proposalIds = proposalIdsByEpisode.get(memberNodeId)
        ?? new Set<string>();
      proposalIds.add(proposal.rootProposalId);
      proposalIdsByEpisode.set(memberNodeId, proposalIds);
    }
  }
  const proposalIdsByTuple = new Map<string, Set<string>>();
  for (const [episodeId, proposalIds] of proposalIdsByEpisode) {
    if (proposalIds.size !== 1) continue;
    const episode = episodeById.get(episodeId)!;
    const tuple = historicalAgentTupleKey(episode);
    const tupleProposalIds = proposalIdsByTuple.get(tuple)
      ?? new Set<string>();
    tupleProposalIds.add([...proposalIds][0]!);
    proposalIdsByTuple.set(tuple, tupleProposalIds);
  }
  const compareEpisodePriority = (
    left: TaskMapAgentSessionGraphFeedEpisodeV1,
    right: TaskMapAgentSessionGraphFeedEpisodeV1,
  ): number =>
    Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
    || compareCodePoint(left.graphEpisodeId, right.graphEpisodeId);
  const proposalRows = input.plan.proposalSet.proposals.flatMap((proposal) => {
    const byTuple = new Map<string, TaskMapAgentSessionGraphFeedEpisodeV1>();
    for (const memberNodeId of proposal.memberNodeIds) {
      const episode = episodeById.get(memberNodeId);
      if (
        episode === undefined
        || episode.disposition !== "work_candidate"
        || proposalIdsByEpisode.get(memberNodeId)?.size !== 1
      ) continue;
      const tuple = historicalAgentTupleKey(episode);
      if (proposalIdsByTuple.get(tuple)?.size !== 1) continue;
      const previous = byTuple.get(tuple);
      if (
        previous === undefined
        || compareEpisodePriority(episode, previous) < 0
      ) byTuple.set(tuple, episode);
    }
    const allEpisodes = [...byTuple.values()].sort(compareEpisodePriority);
    if (allEpisodes.length === 0) return [];
    return [{
      proposal,
      evidenceCandidates: allEpisodes.filter((episode) =>
        !excludedTuples.has(historicalAgentTupleKey(episode))
      ).slice(
        0,
        TASKMAP_NATIVE_COMMUNITY_ROOT_EVIDENCE_LIMITS_V1
          .maximumEventsPerRoot,
      ),
      selectedEvidence: [] as TaskMapAgentSessionGraphFeedEpisodeV1[],
    }];
  });
  let selectedEventCount = 0;
  for (
    let round = 0;
    round
      < TASKMAP_NATIVE_COMMUNITY_ROOT_EVIDENCE_LIMITS_V1.maximumEventsPerRoot;
    round += 1
  ) {
    for (const row of proposalRows) {
      if (
        selectedEventCount
          >= TASKMAP_NATIVE_COMMUNITY_ROOT_EVIDENCE_LIMITS_V1.maximumEventsTotal
      ) break;
      const episode = row.evidenceCandidates[round];
      if (episode === undefined) continue;
      row.selectedEvidence.push(episode);
      selectedEventCount += 1;
    }
  }
  const activeRows = proposalRows.filter((row) =>
    row.selectedEvidence.length > 0
  );
  const selectedEpisodes = new Map<
    string,
    TaskMapAgentSessionGraphFeedEpisodeV1
  >();
  for (const row of activeRows) {
    for (const episode of row.selectedEvidence) {
      selectedEpisodes.set(episode.graphEpisodeId, episode);
    }
  }
  const episodeIdentity = (
    episode: TaskMapAgentSessionGraphFeedEpisodeV1,
  ) => ({
      pointerId: `agent-community-evidence-${taskMapContractDigest({
        episodeIdentityDigest: episode.episodeIdentityDigest,
      }).slice(0, 16)}`,
      workstreamRef: `workstream:${episode.workstreamIdentityDigest}`,
      episodeRef: `episode:${episode.episodeIdentityDigest}`,
    });
  const evidenceTitle = (
    episode: TaskMapAgentSessionGraphFeedEpisodeV1,
  ): string => boundedUtf16(
    redactSensitiveNodeText(episode.userDirectiveSummary),
    96,
  );
  const evidenceSummary = (
    episode: TaskMapAgentSessionGraphFeedEpisodeV1,
  ): string => boundedUtf16(
    redactSensitiveNodeText(
      episode.assistantOutcomeSummary ?? episode.userDirectiveSummary,
    ),
    200,
  );
  const pointers: TaskMapInput["pointers"] = [];
  for (const episode of selectedEpisodes.values()) {
    const identity = episodeIdentity(episode);
    pointers.push({
      id: identity.pointerId,
      sourceKind: episode.provider === "codex"
        ? "codex_session"
        : "claude_session",
      sourceObjectId: identity.episodeRef,
      sourceRefHash: episode.episodeIdentityDigest,
      sourceVersion: episode.graphEpisodeRevisionDigest,
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
  }
  const communityRef = (proposalDigest: string): string =>
    `community:${proposalDigest}`;
  const communityRootIdentityRef = (rootProposalId: string): string =>
    `community:root:${rootProposalId}`;
  const communityMemberIdentityRef = (graphEpisodeId: string): string =>
    `community:member:${graphEpisodeId}`;
  const eventId = (
    rootProposalId: string,
    episode: TaskMapAgentSessionGraphFeedEpisodeV1,
  ): string => `agent-community-event-${taskMapContractDigest({
    rootProposalId,
    graphEpisodeId: episode.graphEpisodeId,
  }).slice(0, 16)}`;
  const events: TaskMapInput["events"] = activeRows.flatMap((row) =>
    row.selectedEvidence.map((episode) => {
      const identity = episodeIdentity(episode);
      return {
        id: eventId(row.proposal.rootProposalId, episode),
        pointerId: identity.pointerId,
        recordKind: "work_context" as const,
        activity: "context_observed" as const,
        occurredAt: episode.occurredAt,
        observedAt: episode.observedAt,
        objectRefs: [
          communityRef(row.proposal.proposalDigest),
          communityRootIdentityRef(row.proposal.rootProposalId),
          communityMemberIdentityRef(episode.graphEpisodeId),
          identity.workstreamRef,
          identity.episodeRef,
        ],
        title: evidenceTitle(episode),
        summary: evidenceSummary(episode),
        extractionConfidence: 0.8,
      };
    })
  );
  const taskMapInput: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: input.generatedAt,
    pointers: pointers.sort((left, right) => compareCodePoint(left.id, right.id)),
    events: events.sort((left, right) => compareCodePoint(left.id, right.id)),
  };
  const rootProposals: BrainRootProposal[] = activeRows.map((row) => ({
      proposalId: row.proposal.rootProposalId,
      title: row.proposal.title,
      summary: boundedUtf16(
        row.selectedEvidence.map(evidenceTitle).join(" · "),
        200,
      ),
      evidenceEventIds: row.selectedEvidence.map((episode) =>
        eventId(row.proposal.rootProposalId, episode)
      ).sort(compareCodePoint),
      memberObjectRefs: [
        communityRef(row.proposal.proposalDigest),
        communityRootIdentityRef(row.proposal.rootProposalId),
        ...new Set(row.selectedEvidence.map((episode) =>
          communityMemberIdentityRef(episode.graphEpisodeId)
        )),
        ...new Set(row.selectedEvidence.map((episode) =>
          episodeIdentity(episode).workstreamRef
        )),
      ].sort(compareCodePoint),
      confidence: 0.8,
    }));
  return deepFreeze({ taskMapInput, rootProposals });
}

function buildArtifactBase(input: {
  validated: TaskMapNativeCommunityShadowInputV1;
  nodes: readonly TaskMapCommunityGraphNodeInputV1[];
  semanticEvidenceReport: TaskMapCommunitySemanticEvidenceReportV1;
  communities: TaskMapCommunityGraphCommunityV1[];
  unclustered: string[];
  optimization: TaskMapCommunityGraphOptimizationV1;
  resourceUsage: TaskMapCommunityGraphResourceUsageV1;
  edgeCount: number;
  edgeDigest: string;
  proposalSet: TaskMapCommunityRootProposalSetV1;
}) {
  return {
    contractVersion: TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION,
    ownerScopeDigest: input.validated.ownerScopeDigest,
    requestedAt: input.validated.requestedAt,
    legacyBindings: { ...input.validated.legacyBindings },
    feed: feedSummary(input.validated.agentSessionGraphFeed),
    graphCollectionCoverage:
      structuredClone(input.validated.graphCollectionCoverage),
    sourceFamilyCounts: sourceFamilyCounts(input.nodes),
    semanticEvidenceReport: input.semanticEvidenceReport,
    communities: input.communities,
    unclustered: input.unclustered,
    optimization: input.optimization,
    resourceUsage: input.resourceUsage,
    edges: {
      count: input.edgeCount,
      digest: input.edgeDigest,
    },
    proposalSet: input.proposalSet,
    authority: "none" as const,
    readAuthority: false as const,
    rankingMutated: false as const,
    bodyMutated: false as const,
    acceptanceStoreMutated: false as const,
  };
}

/**
 * Pure shadow orchestration. It only returns a review-only artifact; no legacy
 * projection, ranking, body, acceptance, or read-authority state is mutated.
 */
export async function buildTaskMapNativeCommunityShadow(
  input: TaskMapNativeCommunityShadowInputV1,
): Promise<TaskMapNativeCommunityShadowArtifactV1> {
  let validated: TaskMapNativeCommunityShadowInputV1;
  try {
    validated = validateInput(input);
  } catch (error) {
    if (error instanceof TaskMapNativeCommunityShadowUnavailableError) {
      throw error;
    }
    fail("invalid_input");
  }
  try {
    const candidateHead = fairCandidateHead(candidateDrafts(
      validated.candidateSemanticFragment,
    ));
    const nodes = [
      ...agentNodes(validated.agentSessionGraphFeed),
      ...candidateHead.map((draft) =>
        candidateNode(validated.ownerScopeDigest, draft)
      ),
    ].sort((left, right) => compareCodePoint(left.nodeId, right.nodeId));
    if (
      nodes.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes
      || new Set(nodes.map((node) => node.nodeId)).size !== nodes.length
    ) fail("invalid_input");

    const { titleReplayPath, ...semanticOptions } =
      validated.semanticEvidence;
    const semantic = await buildTaskMapCommunitySemanticEvidence({
      nodes,
      ...semanticOptions,
      groupingReplayPath:
        semanticOptions.groupingReplayPath
        ?? INERT_GROUPING_REPLAY_PATH,
      embeddingCachePath:
        semanticOptions.embeddingCachePath
        ?? INERT_EMBEDDING_CACHE_PATH,
    });
    if (semantic.report.grouping.producedAt !== null) {
      assertTimestamp(semantic.report.grouping.producedAt);
    }
    const graph = buildTaskMapCommunityGraph({
      nodes: semantic.nodes,
      semanticGroups: semantic.semanticGroups,
    });
    const nodeLookup = new Map(semantic.nodes.map((node) => [node.nodeId, node]));
    const nodeLookupDigest = taskMapCommunityRootNodeLookupDigest(nodeLookup);
    // Batch title record/replay (Plan2 D2): a recorded envelope replays the
    // exact titles byte-identically without a station; a live station run is
    // recorded for the next generation; any invalid recording falls back to
    // the live/deterministic path instead of failing the plan.
    const titleReplayScope = titleReplayPath === undefined ? null : {
      directory: titleReplayPath,
      graphOutput: graph,
      nodeLookup,
    };
    const titleRequest = titleReplayScope === null
      ? null
      : taskMapCommunityTitleBatchRequestDigests({
          graphOutput: graph,
          nodeLookup,
        });
    let proposalSet: TaskMapCommunityRootProposalSetV1 | undefined;
    if (titleReplayScope !== null && titleRequest !== null) {
      const recorded = await loadRecordedCommunityTitleEnvelope(
        titleReplayScope,
        titleRequest.inputDigest,
      );
      if (recorded !== null) {
        try {
          proposalSet = await buildTaskMapCommunityRootProposals({
            graphOutput: graph,
            nodeLookup,
            nodeLookupDigest,
            previousAcceptedRoots: validated.previousAcceptedRoots,
            recordedTitleEnvelope: recorded,
            signal: semanticOptions.signal,
          });
        } catch {
          proposalSet = undefined;
        }
      }
    }
    if (proposalSet === undefined) {
      const liveStation = semanticOptions.station ?? null;
      proposalSet = await buildTaskMapCommunityRootProposals({
        graphOutput: graph,
        nodeLookup,
        nodeLookupDigest,
        previousAcceptedRoots: validated.previousAcceptedRoots,
        llmStation: liveStation === null || titleReplayScope === null
          ? liveStation
          : withCommunityTitleEnvelopeRecording(
              liveStation,
              titleReplayScope,
            ),
        signal: semanticOptions.signal,
      });
    }
    assertPrivacySafeProposalSet(proposalSet);

    const base = buildArtifactBase({
      validated,
      nodes,
      semanticEvidenceReport: semantic.report,
      communities: graph.communities,
      unclustered: graph.unclustered,
      optimization: graph.optimization,
      resourceUsage: graph.resourceUsage,
      edgeCount: graph.edges.length,
      edgeDigest: taskMapContractDigest(graph.edges),
      proposalSet,
    });
    assertPrivacySafeArtifactBase(base);
    const artifactDigest = taskMapContractDigest(base);
    const result: TaskMapNativeCommunityShadowArtifactV1 = {
      ...base,
      artifactId: stableId("tmcommunityshadow", artifactDigest),
      artifactDigest,
    };
    if (
      Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
        > TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumOutputBytes
    ) fail("output_limit_exceeded");
    return deepFreeze(result);
  } catch (error) {
    if (error instanceof TaskMapNativeCommunityShadowUnavailableError) {
      throw error;
    }
    fail("pipeline_unavailable");
  }
}
