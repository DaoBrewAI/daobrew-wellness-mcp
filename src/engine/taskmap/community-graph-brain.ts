export const TASKMAP_GRAPH_BRAIN_POLICY_V1 = Object.freeze({
  semanticSimilarityThreshold: 0.60,
  externalRefWeight: 3.0,
  semanticEmbeddingWeight: 2.0,
  semanticGroupingWeight: 1.5,
  routingWeight: 0.3,
  minimumEdgeWeight: 1.0,
  convergenceEpsilon: 1e-6,
} as const);

/**
 * Operational graph head: 256 retained Agent episodes plus 128 bounded
 * meeting/calendar candidates. Every aggregate budget is checked before the
 * pairwise graph and Louvain loops begin.
 */
export const TASKMAP_GRAPH_BRAIN_LIMITS_V1 = Object.freeze({
  agentEpisodeCapacity: 256,
  meetingCalendarHeadroom: 128,
  maxNodes: 384,
  maxOpaqueIdCharacters: 512,
  maxNodeTextCharacters: 480,
  embeddingDimensions: 768,
  maxEmbeddingCoordinates: 294_912,
  maxExternalRefsPerNode: 32,
  maxExternalRefCharacters: 82,
  maxExternalRefsTotal: 4_096,
  maxSemanticGroups: 128,
  maxSemanticGroupMembers: 64,
  maxSemanticPairMemberships: 16_384,
  maxPairComparisons: 73_536,
  maxEdges: 16_384,
  maxOutputBytes: 16 * 1_024 * 1_024,
  maxOptimizationPasses: 128,
} as const);

export type TaskMapCommunityGraphSourceFamily =
  | "agent"
  | "meeting"
  | "calendar";

export interface TaskMapCommunityGraphNodeInputV1 {
  nodeId: string;
  text: string;
  sourceFamily: TaskMapCommunityGraphSourceFamily;
  routingDigest: string;
  occurredAt: string;
  externalRefs: string[];
  embedding: number[] | null;
  isCalendarCommitment: boolean;
}

export interface TaskMapCommunityGraphSemanticGroupInputV1 {
  groupId: string;
  source: "llm_grouping";
  sourceDigest: string;
  memberNodeIds: string[];
}

export interface TaskMapCommunityGraphInputV1 {
  nodes: TaskMapCommunityGraphNodeInputV1[];
  semanticGroups?: TaskMapCommunityGraphSemanticGroupInputV1[];
}

export interface TaskMapCommunityGraphEdgeV1 {
  fromNodeId: string;
  toNodeId: string;
  weight: number;
  sharedExternalRefDigests: string[];
  sharedSemanticGroupIds: string[];
  embeddingSimilarity: number | null;
  sameRoutingDigest: boolean;
}

export interface TaskMapCommunityGraphSemanticGroupProvenanceV1 {
  groupId: string;
  source: "llm_grouping";
  sourceDigest: string;
}

export interface TaskMapCommunityGraphDateSpanV1 {
  startAt: string;
  endAt: string;
}

export interface TaskMapCommunityGraphQualityV1 {
  internalDensity: number;
  cutEdgeRatio: number;
  weakestMemberSimilarity: number | null;
}

export interface TaskMapCommunityGraphCommunityV1 {
  memberNodeIds: string[];
  contextNodeIds: string[];
  internalEdgeCount: number;
  dateSpan: TaskMapCommunityGraphDateSpanV1;
  sourceFamilies: TaskMapCommunityGraphSourceFamily[];
  quality: TaskMapCommunityGraphQualityV1;
}

export interface TaskMapCommunityGraphOutputV1 {
  edges: TaskMapCommunityGraphEdgeV1[];
  communities: TaskMapCommunityGraphCommunityV1[];
  unclustered: string[];
  semanticGroupProvenance: TaskMapCommunityGraphSemanticGroupProvenanceV1[];
  optimization: TaskMapCommunityGraphOptimizationV1;
  resourceUsage: TaskMapCommunityGraphResourceUsageV1;
}

export interface TaskMapCommunityGraphResourceUsageV1 {
  nodeCount: number;
  pairComparisons: number;
  embeddingSimilarityComputations: number;
  emittedEdgeCount: number;
  semanticPairMemberships: number;
}

export interface TaskMapCommunityGraphOptimizationV1 {
  algorithm: "deterministic_louvain_local_modularity";
  passes: number;
  passLimit: number;
  converged: true;
  finalPassModularityGain: number;
}

export interface TaskMapCommunityConnectivityEdge {
  fromNodeId: string;
  toNodeId: string;
}

type NormalizedNode = TaskMapCommunityGraphNodeInputV1 & {
  embeddingNorm: number | null;
  formalMember: boolean;
};

type CommunityStatistics = {
  memberCount: number;
  totalDegree: number;
  internalWeight: number;
  minimumMemberIndex: number;
};

type CommunityOptimizationResult = {
  components: number[][];
  metadata: TaskMapCommunityGraphOptimizationV1;
};

const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_EXTERNAL_REF =
  /^(?:[a-f0-9]{64}|(?:external|canonical-meeting):[a-f0-9]{64})$/;
const CANONICAL_UTC_MILLISECONDS =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const CONTROL_CHARACTER = /\p{Cc}/u;
const NODE_KEYS = new Set([
  "nodeId",
  "text",
  "sourceFamily",
  "routingDigest",
  "occurredAt",
  "externalRefs",
  "embedding",
  "isCalendarCommitment",
]);
const SEMANTIC_GROUP_KEYS = new Set([
  "groupId",
  "source",
  "sourceDigest",
  "memberNodeIds",
]);
const INPUT_KEYS = new Set(["nodes", "semanticGroups"]);
const SOURCE_FAMILIES = new Set<TaskMapCommunityGraphSourceFamily>([
  "agent",
  "meeting",
  "calendar",
]);

function fail(message: string): never {
  throw new TypeError(`Task Map community graph brain: ${message}`);
}

function assertOutputByteBudget(value: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOutputBytes) {
    fail("graph exceeds the output byte budget");
  }
}

function compareText(left: string, right: string): number {
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

function compareStringArrays(left: readonly string[], right: readonly string[]): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = compareText(left[index]!, right[index]!);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function isPlainEnumerableRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      return false;
    }
  }
  return true;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${label} is missing ${key}`);
    }
  }
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return false;
    }
  }
  return true;
}

function assertOpaqueId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOpaqueIdCharacters
    || CONTROL_CHARACTER.test(value)
  ) {
    fail(
      `${label} must be a nonempty opaque id of at most ${TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOpaqueIdCharacters} characters`,
    );
  }
  if (!isWellFormedUnicode(value)) {
    fail(`${label} must be well-formed Unicode`);
  }
}

function assertNodeText(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodeTextCharacters
    || CONTROL_CHARACTER.test(value)
  ) {
    fail(
      `${label} must be nonempty producer-bounded text of at most ${TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodeTextCharacters} characters`,
    );
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest`);
  }
}

function assertExternalRef(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxExternalRefCharacters
    || !CANONICAL_EXTERNAL_REF.test(value)
  ) {
    fail(`${label} must contain only canonical external-ref digests`);
  }
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  const match = typeof value === "string"
    ? CANONICAL_UTC_MILLISECONDS.exec(value)
    : null;
  if (
    match === null
    || !validCalendarDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    )
    || Number(match[4]) > 23
    || Number(match[5]) > 59
    || Number(match[6]) > 59
    || !Number.isFinite(Date.parse(value as string))
  ) {
    fail(`${label} must be a canonical UTC millisecond timestamp`);
  }
}

function normalizeUniqueDigests(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxExternalRefsPerNode
  ) {
    fail(`${label} must be a bounded array of SHA-256 digests`);
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    assertExternalRef(item, label);
    if (seen.has(item)) fail(`${label} contains a duplicate digest`);
    seen.add(item);
    normalized.push(item);
  }
  return normalized.sort(compareText);
}

function normalizeEmbedding(
  value: unknown,
  label: string,
): { embedding: number[] | null; norm: number | null } {
  if (value === null) return { embedding: null, norm: null };
  if (
    !Array.isArray(value)
    || value.length !== TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions
  ) {
    fail(
      `${label} embedding must have exactly ${TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions} dimensions`,
    );
  }
  let sumSquares = 0;
  const embedding: number[] = [];
  for (const coordinate of value) {
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
      fail(`${label} embedding contains a non-finite coordinate`);
    }
    embedding.push(coordinate);
    sumSquares += coordinate * coordinate;
  }
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    fail(`${label} embedding norm is invalid`);
  }
  return { embedding, norm };
}

function normalizeNodes(value: unknown): NormalizedNode[] {
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes
  ) {
    fail(
      `nodes exceed the ${TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes}-node budget`,
    );
  }
  const seenNodeIds = new Set<string>();
  let totalExternalRefs = 0;
  let totalEmbeddingCoordinates = 0;
  const nodes = value.map((candidate, index): NormalizedNode => {
    if (!isPlainEnumerableRecord(candidate)) {
      fail(`node ${index} must be a plain enumerable object`);
    }
    assertExactKeys(candidate, NODE_KEYS, NODE_KEYS, `node ${index}`);
    assertOpaqueId(candidate.nodeId, `node ${index} nodeId`);
    assertNodeText(candidate.text, `node ${index} text`);
    if (
      typeof candidate.sourceFamily !== "string"
      || !SOURCE_FAMILIES.has(
        candidate.sourceFamily as TaskMapCommunityGraphSourceFamily,
      )
    ) {
      fail(`node ${index} sourceFamily is invalid`);
    }
    const sourceFamily = candidate.sourceFamily as TaskMapCommunityGraphSourceFamily;
    assertDigest(candidate.routingDigest, `node ${index} routingDigest`);
    assertTimestamp(candidate.occurredAt, `node ${index} occurredAt`);
    const externalRefs = normalizeUniqueDigests(
      candidate.externalRefs,
      `node ${index} externalRefs`,
    );
    totalExternalRefs += externalRefs.length;
    const { embedding, norm } = normalizeEmbedding(candidate.embedding, `node ${index}`);
    if (embedding !== null) {
      totalEmbeddingCoordinates += embedding.length;
    }
    if (typeof candidate.isCalendarCommitment !== "boolean") {
      fail(`node ${index} isCalendarCommitment must be boolean`);
    }
    if (sourceFamily !== "calendar" && candidate.isCalendarCommitment) {
      fail("calendar commitment membership is valid only for calendar nodes");
    }
    if (seenNodeIds.has(candidate.nodeId)) {
      fail(`duplicate nodeId at node ${index}`);
    }
    seenNodeIds.add(candidate.nodeId);
    return {
      nodeId: candidate.nodeId,
      text: candidate.text,
      sourceFamily,
      routingDigest: candidate.routingDigest,
      occurredAt: candidate.occurredAt,
      externalRefs,
      embedding,
      isCalendarCommitment: candidate.isCalendarCommitment,
      embeddingNorm: norm,
      formalMember: sourceFamily !== "calendar" || candidate.isCalendarCommitment,
    };
  });
  if (totalExternalRefs > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxExternalRefsTotal) {
    fail("nodes exceed the aggregate external-ref budget");
  }
  if (
    totalEmbeddingCoordinates
      > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEmbeddingCoordinates
  ) {
    fail("nodes exceed the aggregate embedding-coordinate budget");
  }
  return nodes.sort((left, right) => compareText(left.nodeId, right.nodeId));
}

function normalizeSemanticGroups(
  value: unknown,
  knownNodeIds: ReadonlySet<string>,
): {
  groups: TaskMapCommunityGraphSemanticGroupInputV1[];
  pairMemberships: number;
} {
  if (value === undefined) return { groups: [], pairMemberships: 0 };
  if (
    !Array.isArray(value)
    || value.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxSemanticGroups
  ) {
    fail("semanticGroups exceed the semantic group budget");
  }
  const seenGroupIds = new Set<string>();
  let totalPairMemberships = 0;
  const groups = value.map((candidate, index): TaskMapCommunityGraphSemanticGroupInputV1 => {
    if (!isPlainEnumerableRecord(candidate)) {
      fail(`semantic group ${index} must be a plain enumerable object`);
    }
    assertExactKeys(
      candidate,
      SEMANTIC_GROUP_KEYS,
      SEMANTIC_GROUP_KEYS,
      `semantic group ${index}`,
    );
    assertOpaqueId(candidate.groupId, `semantic group ${index} groupId`);
    if (seenGroupIds.has(candidate.groupId)) {
      fail(`duplicate semantic groupId at semantic group ${index}`);
    }
    seenGroupIds.add(candidate.groupId);
    if (candidate.source !== "llm_grouping") {
      fail(`semantic group ${index} source must be llm_grouping`);
    }
    assertDigest(candidate.sourceDigest, `semantic group ${index} sourceDigest`);
    if (
      !Array.isArray(candidate.memberNodeIds)
      || candidate.memberNodeIds.length < 2
      || candidate.memberNodeIds.length
        > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxSemanticGroupMembers
    ) {
      fail(`semantic group ${index} exceeds the semantic group member budget`);
    }
    totalPairMemberships += candidate.memberNodeIds.length
      * (candidate.memberNodeIds.length - 1) / 2;
    if (
      totalPairMemberships
        > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxSemanticPairMemberships
    ) {
      fail("semanticGroups exceed the semantic pair-membership budget");
    }
    const seenMembers = new Set<string>();
    const memberNodeIds = candidate.memberNodeIds.map((member, memberIndex) => {
      assertOpaqueId(
        member,
        `semantic group ${index} memberNodeIds[${memberIndex}]`,
      );
      if (!knownNodeIds.has(member)) {
        fail(`semantic group ${index} references an unknown nodeId`);
      }
      if (seenMembers.has(member)) {
        fail(`semantic group ${index} contains a duplicate member nodeId`);
      }
      seenMembers.add(member);
      return member;
    }).sort(compareText);
    return {
      groupId: candidate.groupId,
      source: "llm_grouping",
      sourceDigest: candidate.sourceDigest,
      memberNodeIds,
    };
  });
  return {
    groups: groups.sort((left, right) => (
      compareText(left.groupId, right.groupId)
      || compareText(left.sourceDigest, right.sourceDigest)
    )),
    pairMemberships: totalPairMemberships,
  };
}

function normalizeInput(input: TaskMapCommunityGraphInputV1): {
  nodes: NormalizedNode[];
  semanticGroups: TaskMapCommunityGraphSemanticGroupInputV1[];
  semanticPairMemberships: number;
} {
  if (!isPlainEnumerableRecord(input)) {
    fail("input must be a plain enumerable object");
  }
  assertExactKeys(input, INPUT_KEYS, new Set(["nodes"]), "input");
  const nodes = normalizeNodes(input.nodes);
  const pairComparisons = nodes.length * (nodes.length - 1) / 2;
  if (pairComparisons > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxPairComparisons) {
    fail("nodes exceed the pair-comparison budget");
  }
  const semantic = normalizeSemanticGroups(
    input.semanticGroups,
    new Set(nodes.map((candidate) => candidate.nodeId)),
  );
  return {
    nodes,
    semanticGroups: semantic.groups,
    semanticPairMemberships: semantic.pairMemberships,
  };
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const shared: string[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const comparison = compareText(left[leftIndex]!, right[rightIndex]!);
    if (comparison === 0) {
      shared.push(left[leftIndex]!);
      leftIndex += 1;
      rightIndex += 1;
    } else if (comparison < 0) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return shared;
}

function cosineSimilarity(left: NormalizedNode, right: NormalizedNode): number | null {
  if (
    left.embedding === null
    || right.embedding === null
    || left.embeddingNorm === null
    || right.embeddingNorm === null
  ) {
    return null;
  }
  let dotProduct = 0;
  for (let index = 0; index < left.embedding.length; index += 1) {
    dotProduct += left.embedding[index]! * right.embedding[index]!;
  }
  return Math.max(
    -1,
    Math.min(1, dotProduct / (left.embeddingNorm * right.embeddingNorm)),
  );
}

function pairKey(leftIndex: number, rightIndex: number): number {
  const smaller = Math.min(leftIndex, rightIndex);
  const larger = Math.max(leftIndex, rightIndex);
  return smaller * TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes + larger;
}

function semanticGroupsByPair(
  groups: readonly TaskMapCommunityGraphSemanticGroupInputV1[],
  nodeIndexById: ReadonlyMap<string, number>,
): Map<number, string[]> {
  const byPair = new Map<number, string[]>();
  for (const group of groups) {
    for (let leftIndex = 0; leftIndex < group.memberNodeIds.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < group.memberNodeIds.length;
        rightIndex += 1
      ) {
        const key = pairKey(
          nodeIndexById.get(group.memberNodeIds[leftIndex]!)!,
          nodeIndexById.get(group.memberNodeIds[rightIndex]!)!,
        );
        const groupIds = byPair.get(key) ?? [];
        groupIds.push(group.groupId);
        byPair.set(key, groupIds);
      }
    }
  }
  return byPair;
}

function buildEdges(
  nodes: readonly NormalizedNode[],
  semanticGroups: readonly TaskMapCommunityGraphSemanticGroupInputV1[],
): {
  edges: TaskMapCommunityGraphEdgeV1[];
  similarityByPair: Map<number, number>;
  pairComparisons: number;
} {
  const nodeIndexById = new Map(
    nodes.map((candidate, index) => [candidate.nodeId, index] as const),
  );
  const groupIdsByPair = semanticGroupsByPair(semanticGroups, nodeIndexById);
  const edges: TaskMapCommunityGraphEdgeV1[] = [];
  const similarityByPair = new Map<number, number>();
  let pairComparisons = 0;
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]!;
      pairComparisons += 1;
      const key = pairKey(leftIndex, rightIndex);
      const sharedExternalRefDigests = intersection(left.externalRefs, right.externalRefs);
      const sharedSemanticGroupIds = groupIdsByPair.get(key) ?? [];
      const embeddingSimilarity = cosineSimilarity(left, right);
      if (embeddingSimilarity !== null) {
        similarityByPair.set(key, embeddingSimilarity);
      }
      const sameRoutingDigest = left.routingDigest === right.routingDigest;
      let weight = 0;
      if (sharedExternalRefDigests.length > 0) {
        weight += TASKMAP_GRAPH_BRAIN_POLICY_V1.externalRefWeight;
      }
      if (
        embeddingSimilarity !== null
        && embeddingSimilarity
          >= TASKMAP_GRAPH_BRAIN_POLICY_V1.semanticSimilarityThreshold
      ) {
        weight += TASKMAP_GRAPH_BRAIN_POLICY_V1.semanticEmbeddingWeight
          * embeddingSimilarity;
      }
      if (sharedSemanticGroupIds.length > 0) {
        weight += TASKMAP_GRAPH_BRAIN_POLICY_V1.semanticGroupingWeight;
      }
      if (sameRoutingDigest) {
        weight += TASKMAP_GRAPH_BRAIN_POLICY_V1.routingWeight;
      }
      if (weight < TASKMAP_GRAPH_BRAIN_POLICY_V1.minimumEdgeWeight) continue;
      if (edges.length >= TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEdges) {
        fail("graph exceeds the edge budget");
      }
      edges.push({
        fromNodeId: left.nodeId,
        toNodeId: right.nodeId,
        weight,
        sharedExternalRefDigests,
        sharedSemanticGroupIds,
        embeddingSimilarity,
        sameRoutingDigest,
      });
    }
  }
  return { edges, similarityByPair, pairComparisons };
}

function communityContribution(
  statistics: Pick<CommunityStatistics, "totalDegree" | "internalWeight">,
  totalEdgeWeight: number,
): number {
  if (totalEdgeWeight === 0) return 0;
  return statistics.internalWeight / totalEdgeWeight
    - (statistics.totalDegree / (2 * totalEdgeWeight)) ** 2;
}

function candidateCommunityKey(
  targetCommunity: number | null,
  movingNodeIndex: number,
  nodes: readonly NormalizedNode[],
  statistics: ReadonlyMap<number, CommunityStatistics>,
): string {
  if (targetCommunity === null) return nodes[movingNodeIndex]!.nodeId;
  const target = statistics.get(targetCommunity);
  if (target === undefined) fail("candidate target community has no member");
  return nodes[target.minimumMemberIndex]!.nodeId;
}

function optimizeCommunities(
  nodes: readonly NormalizedNode[],
  edges: readonly TaskMapCommunityGraphEdgeV1[],
  passLimit: number,
): CommunityOptimizationResult {
  if (nodes.length === 0) {
    return {
      components: [],
      metadata: {
        algorithm: "deterministic_louvain_local_modularity",
        passes: 0,
        passLimit,
        converged: true,
        finalPassModularityGain: 0,
      },
    };
  }
  const indexByNodeId = new Map(
    nodes.map((candidate, index) => [candidate.nodeId, index] as const),
  );
  const adjacency = nodes.map(() => new Map<number, number>());
  const degrees = nodes.map(() => 0);
  let totalEdgeWeight = 0;
  for (const edge of edges) {
    const leftIndex = indexByNodeId.get(edge.fromNodeId)!;
    const rightIndex = indexByNodeId.get(edge.toNodeId)!;
    adjacency[leftIndex]!.set(rightIndex, edge.weight);
    adjacency[rightIndex]!.set(leftIndex, edge.weight);
    degrees[leftIndex] += edge.weight;
    degrees[rightIndex] += edge.weight;
    totalEdgeWeight += edge.weight;
  }
  const assignments = nodes.map((_, index) => index);
  const statistics = new Map<number, CommunityStatistics>(
    nodes.map((_, index) => [index, {
      memberCount: 1,
      totalDegree: degrees[index]!,
      internalWeight: 0,
      minimumMemberIndex: index,
    }]),
  );
  let nextCommunity = nodes.length;
  let passes = 0;
  let converged = false;
  let finalPassModularityGain = 0;
  for (let pass = 0; pass < passLimit; pass += 1) {
    let passGain = 0;
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const currentCommunity = assignments[nodeIndex]!;
      const currentStatistics = statistics.get(currentCommunity)!;
      const weightByCommunity = new Map<number, number>();
      for (const [neighborIndex, weight] of adjacency[nodeIndex]!) {
        const neighborCommunity = assignments[neighborIndex]!;
        weightByCommunity.set(
          neighborCommunity,
          (weightByCommunity.get(neighborCommunity) ?? 0) + weight,
        );
      }
      const candidates: Array<{ community: number | null; key: string }> = [];
      for (const community of weightByCommunity.keys()) {
        if (community === currentCommunity) continue;
        candidates.push({
          community,
          key: candidateCommunityKey(community, nodeIndex, nodes, statistics),
        });
      }
      if (currentStatistics.memberCount > 1) {
        candidates.push({
          community: null,
          key: candidateCommunityKey(null, nodeIndex, nodes, statistics),
        });
      }
      candidates.sort((left, right) => (
        compareText(left.key, right.key)
        || (left.community ?? nextCommunity) - (right.community ?? nextCommunity)
      ));
      let bestCommunity: number | null | undefined;
      let bestGain: number = TASKMAP_GRAPH_BRAIN_POLICY_V1.convergenceEpsilon;
      for (const candidate of candidates) {
        const targetStatistics = candidate.community === null
          ? {
            memberCount: 0,
            totalDegree: 0,
            internalWeight: 0,
            minimumMemberIndex: nodeIndex,
          }
          : statistics.get(candidate.community)!;
        const weightToCurrent = weightByCommunity.get(currentCommunity) ?? 0;
        const weightToTarget = candidate.community === null
          ? 0
          : weightByCommunity.get(candidate.community) ?? 0;
        const before = communityContribution(currentStatistics, totalEdgeWeight)
          + communityContribution(targetStatistics, totalEdgeWeight);
        const afterCurrent: CommunityStatistics = {
          memberCount: currentStatistics.memberCount - 1,
          totalDegree: currentStatistics.totalDegree - degrees[nodeIndex]!,
          internalWeight: currentStatistics.internalWeight - weightToCurrent,
          minimumMemberIndex: currentStatistics.minimumMemberIndex,
        };
        const afterTarget: CommunityStatistics = {
          memberCount: targetStatistics.memberCount + 1,
          totalDegree: targetStatistics.totalDegree + degrees[nodeIndex]!,
          internalWeight: targetStatistics.internalWeight + weightToTarget,
          minimumMemberIndex: Math.min(
            targetStatistics.minimumMemberIndex,
            nodeIndex,
          ),
        };
        const gain = communityContribution(afterCurrent, totalEdgeWeight)
          + communityContribution(afterTarget, totalEdgeWeight)
          - before;
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = candidate.community;
        }
      }
      if (bestCommunity === undefined) continue;
      const targetCommunity = bestCommunity ?? nextCommunity++;
      const targetStatistics = statistics.get(targetCommunity) ?? {
        memberCount: 0,
        totalDegree: 0,
        internalWeight: 0,
        minimumMemberIndex: nodeIndex,
      };
      const weightToCurrent = weightByCommunity.get(currentCommunity) ?? 0;
      const weightToTarget = weightByCommunity.get(targetCommunity) ?? 0;
      currentStatistics.memberCount -= 1;
      currentStatistics.totalDegree -= degrees[nodeIndex]!;
      currentStatistics.internalWeight -= weightToCurrent;
      if (
        currentStatistics.memberCount > 0
        && currentStatistics.minimumMemberIndex === nodeIndex
      ) {
        const replacement = assignments.findIndex((community, index) => (
          index !== nodeIndex && community === currentCommunity
        ));
        if (replacement < 0) fail("community minimum member is unavailable");
        currentStatistics.minimumMemberIndex = replacement;
      }
      targetStatistics.memberCount += 1;
      targetStatistics.totalDegree += degrees[nodeIndex]!;
      targetStatistics.internalWeight += weightToTarget;
      targetStatistics.minimumMemberIndex = Math.min(
        targetStatistics.minimumMemberIndex,
        nodeIndex,
      );
      assignments[nodeIndex] = targetCommunity;
      if (currentStatistics.memberCount === 0) statistics.delete(currentCommunity);
      statistics.set(targetCommunity, targetStatistics);
      passGain += bestGain;
    }
    passes = pass + 1;
    finalPassModularityGain = passGain;
    if (passGain < TASKMAP_GRAPH_BRAIN_POLICY_V1.convergenceEpsilon) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    fail("Louvain optimization did not converge within the pass budget");
  }
  const proposed = new Map<number, string[]>();
  for (let index = 0; index < nodes.length; index += 1) {
    const community = assignments[index]!;
    const members = proposed.get(community) ?? [];
    members.push(nodes[index]!.nodeId);
    proposed.set(community, members);
  }
  const components = [...proposed.values()]
    .flatMap((memberNodeIds) => (
      splitTaskMapCommunityConnectedComponents(memberNodeIds, edges)
    ))
    .sort(compareStringArrays)
    .map((component) => component.map((nodeId) => indexByNodeId.get(nodeId)!));
  return {
    components,
    metadata: {
      algorithm: "deterministic_louvain_local_modularity",
      passes,
      passLimit,
      converged: true,
      finalPassModularityGain,
    },
  };
}

export function splitTaskMapCommunityConnectedComponents(
  nodeIds: readonly string[],
  edges: readonly TaskMapCommunityConnectivityEdge[],
): string[][] {
  if (
    !Array.isArray(nodeIds)
    || nodeIds.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes
  ) {
    fail("connected-component node budget exceeded");
  }
  if (
    !Array.isArray(edges)
    || edges.length > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEdges
  ) {
    fail("connected-component edge budget exceeded");
  }
  const sortedNodeIds = [...nodeIds].sort(compareText);
  const included = new Set<string>();
  for (const nodeId of sortedNodeIds) {
    assertOpaqueId(nodeId, "connected-component nodeId");
    if (included.has(nodeId)) fail("connected-component nodeIds contain a duplicate");
    included.add(nodeId);
  }
  const adjacency = new Map(sortedNodeIds.map((nodeId) => [nodeId, [] as string[]]));
  for (const edge of edges) {
    if (!isPlainEnumerableRecord(edge)) {
      fail("connected-component edge must be a plain enumerable object");
    }
    assertOpaqueId(edge.fromNodeId, "connected-component edge fromNodeId");
    assertOpaqueId(edge.toNodeId, "connected-component edge toNodeId");
    if (
      edge.fromNodeId === edge.toNodeId
      || !included.has(edge.fromNodeId)
      || !included.has(edge.toNodeId)
    ) {
      continue;
    }
    adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
    adjacency.get(edge.toNodeId)!.push(edge.fromNodeId);
  }
  for (const neighbors of adjacency.values()) neighbors.sort(compareText);
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of sortedNodeIds) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const pending = [start];
    let cursor = 0;
    visited.add(start);
    while (cursor < pending.length) {
      const current = pending[cursor++]!;
      component.push(current);
      for (const neighbor of adjacency.get(current)!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    components.push(component.sort(compareText));
  }
  return components.sort(compareStringArrays);
}

function weakestMemberSimilarity(
  formalIndexes: readonly number[],
  nodes: readonly NormalizedNode[],
  similarityByPair: ReadonlyMap<number, number>,
): number | null {
  if (
    formalIndexes.length < 2
    || formalIndexes.some((index) => nodes[index]!.embedding === null)
  ) {
    return null;
  }
  const strongestByMember: number[] = [];
  for (let leftIndex = 0; leftIndex < formalIndexes.length; leftIndex += 1) {
    let strongest = -1;
    for (let rightIndex = 0; rightIndex < formalIndexes.length; rightIndex += 1) {
      if (leftIndex === rightIndex) continue;
      const similarity = similarityByPair.get(pairKey(
        formalIndexes[leftIndex]!,
        formalIndexes[rightIndex]!,
      ));
      if (similarity === undefined) {
        fail("embedding similarity cache is incomplete");
      }
      strongest = Math.max(
        strongest,
        similarity,
      );
    }
    strongestByMember.push(strongest);
  }
  return Math.min(...strongestByMember);
}

function buildCommunity(
  componentIndexes: readonly number[],
  nodes: readonly NormalizedNode[],
  edges: readonly TaskMapCommunityGraphEdgeV1[],
  similarityByPair: ReadonlyMap<number, number>,
): TaskMapCommunityGraphCommunityV1 | null {
  const componentNodes = componentIndexes.map((index) => nodes[index]!);
  const formalIndexes = componentIndexes.filter((index) => nodes[index]!.formalMember);
  const formalNodes = formalIndexes.map((index) => nodes[index]!);
  if (
    formalNodes.length < 2
    || formalNodes.every((candidate) => candidate.sourceFamily === "calendar")
  ) {
    return null;
  }
  const componentIds = new Set(componentNodes.map((candidate) => candidate.nodeId));
  let internalEdgeCount = 0;
  let cutEdgeCount = 0;
  for (const edge of edges) {
    const leftInside = componentIds.has(edge.fromNodeId);
    const rightInside = componentIds.has(edge.toNodeId);
    if (leftInside && rightInside) internalEdgeCount += 1;
    else if (leftInside || rightInside) cutEdgeCount += 1;
  }
  const possibleEdges = componentNodes.length * (componentNodes.length - 1) / 2;
  const incidentEdges = internalEdgeCount + cutEdgeCount;
  const timeSorted = [...formalNodes].sort((left, right) => (
    compareText(left.occurredAt, right.occurredAt)
  ));
  const memberNodeIds = formalNodes.map((candidate) => candidate.nodeId).sort(compareText);
  const contextNodeIds = componentNodes
    .filter((candidate) => !candidate.formalMember)
    .map((candidate) => candidate.nodeId)
    .sort(compareText);
  const sourceFamilies = [...new Set(
    formalNodes.map((candidate) => candidate.sourceFamily),
  )].sort(compareText);
  return {
    memberNodeIds,
    contextNodeIds,
    internalEdgeCount,
    dateSpan: {
      startAt: timeSorted[0]!.occurredAt,
      endAt: timeSorted[timeSorted.length - 1]!.occurredAt,
    },
    sourceFamilies,
    quality: {
      internalDensity: possibleEdges === 0 ? 0 : internalEdgeCount / possibleEdges,
      cutEdgeRatio: incidentEdges === 0 ? 0 : cutEdgeCount / incidentEdges,
      weakestMemberSimilarity: weakestMemberSimilarity(
        formalIndexes,
        nodes,
        similarityByPair,
      ),
    },
  };
}

function buildTaskMapCommunityGraphInternal(
  input: TaskMapCommunityGraphInputV1,
  requestedPassLimit: number | null,
): TaskMapCommunityGraphOutputV1 {
  const {
    nodes,
    semanticGroups,
    semanticPairMemberships,
  } = normalizeInput(input);
  const passLimit = requestedPassLimit ?? Math.max(
    1,
    Math.min(
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOptimizationPasses,
      nodes.length * 8,
    ),
  );
  if (
    !Number.isSafeInteger(passLimit)
    || passLimit < 1
    || passLimit > TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOptimizationPasses
  ) {
    fail("optimization pass limit is outside the supported budget");
  }
  const edgeBuild = buildEdges(nodes, semanticGroups);
  const semanticGroupProvenance = semanticGroups.map((group) => ({
    groupId: group.groupId,
    source: group.source,
    sourceDigest: group.sourceDigest,
  }));
  assertOutputByteBudget({
    edges: edgeBuild.edges,
    semanticGroupProvenance,
  });
  const optimization = optimizeCommunities(nodes, edgeBuild.edges, passLimit);
  const communities: TaskMapCommunityGraphCommunityV1[] = [];
  const clusteredNodeIds = new Set<string>();
  for (const component of optimization.components) {
    const community = buildCommunity(
      component,
      nodes,
      edgeBuild.edges,
      edgeBuild.similarityByPair,
    );
    if (community === null) continue;
    communities.push(community);
    for (const index of component) clusteredNodeIds.add(nodes[index]!.nodeId);
  }
  communities.sort((left, right) => (
    compareStringArrays(left.memberNodeIds, right.memberNodeIds)
    || compareStringArrays(left.contextNodeIds, right.contextNodeIds)
  ));
  const output: TaskMapCommunityGraphOutputV1 = {
    edges: edgeBuild.edges,
    communities,
    unclustered: nodes
      .map((candidate) => candidate.nodeId)
      .filter((nodeId) => !clusteredNodeIds.has(nodeId))
      .sort(compareText),
    semanticGroupProvenance,
    optimization: optimization.metadata,
    resourceUsage: {
      nodeCount: nodes.length,
      pairComparisons: edgeBuild.pairComparisons,
      embeddingSimilarityComputations: edgeBuild.similarityByPair.size,
      emittedEdgeCount: edgeBuild.edges.length,
      semanticPairMemberships,
    },
  };
  assertOutputByteBudget(output);
  return output;
}

export function buildTaskMapCommunityGraph(
  input: TaskMapCommunityGraphInputV1,
): TaskMapCommunityGraphOutputV1 {
  return buildTaskMapCommunityGraphInternal(input, null);
}

/** @internal One encapsulated seam for fail-closed optimization-cap tests. */
export const TASKMAP_GRAPH_BRAIN_TEST_ONLY = Object.freeze({
  buildWithPassLimit(
    input: TaskMapCommunityGraphInputV1,
    passLimit: number,
  ): TaskMapCommunityGraphOutputV1 {
    return buildTaskMapCommunityGraphInternal(input, passLimit);
  },
});
