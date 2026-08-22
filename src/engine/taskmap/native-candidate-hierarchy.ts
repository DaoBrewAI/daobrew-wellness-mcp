import { taskMapContractDigest } from "./source-contracts.js";

export const TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION =
  "taskmap-native-candidate-hierarchy.v2" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;

export interface TaskMapNativeCandidateHierarchyTopicV1 {
  topicId: string;
  title: string;
  titleSource: "llm_community_title_v1" | "deterministic_fallback";
  candidateIds: string[];
  candidateTasks: Array<{
    candidateId: string;
    subtasks: Array<{
      subtaskId: string;
      title: string;
      summary: string;
    }>;
  }>;
}

export interface TaskMapNativeCandidateHierarchyV1 {
  contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION;
  hierarchyDigest: string;
  producerSnapshotDigest: string;
  groupingState: "available" | "unavailable";
  topics: TaskMapNativeCandidateHierarchyTopicV1[];
  ungroupedCandidateIds: string[];
  authority: "none";
  acceptedWork: false;
  rankEligible: false;
}

export interface BuildTaskMapNativeCandidateHierarchyInputV1 {
  producerSnapshotDigest: string;
  candidateIds: string[];
  groupingAvailable: boolean;
  proposals: Array<{
    rootProposalId: string;
    title: string;
    titleSource: "llm_community_title_v1" | "deterministic_fallback";
    memberNodeIds: string[];
  }>;
  candidateNodeBindings: Array<{
    candidateId: string;
    nodeIds: string[];
  }>;
  subtasks: Array<{
    rootProposalId: string;
    subtaskId: string;
    title: string;
    summary: string;
    memberNodeIds: string[];
  }>;
}

function fail(message: string): never {
  throw new Error(`Task Map native candidate hierarchy: ${message}`);
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertTaskMapNativeCandidateHierarchy(
  value: unknown,
  expectedProducerSnapshotDigest: string,
  expectedCandidateIds: readonly string[],
): asserts value is TaskMapNativeCandidateHierarchyV1 {
  if (!plain(value)) fail("invalid hierarchy");
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "acceptedWork", "authority", "contractVersion", "groupingState",
    "hierarchyDigest", "producerSnapshotDigest", "rankEligible", "topics",
    "ungroupedCandidateIds",
  ].sort();
  if (keys.join("\0") !== expectedKeys.join("\0")) fail("invalid hierarchy keys");
  if (
    value.contractVersion !== TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION
    || value.producerSnapshotDigest !== expectedProducerSnapshotDigest
    || value.authority !== "none"
    || value.acceptedWork !== false
    || value.rankEligible !== false
    || (value.groupingState !== "available" && value.groupingState !== "unavailable")
    || !Array.isArray(value.topics)
    || !Array.isArray(value.ungroupedCandidateIds)
  ) fail("invalid hierarchy contract");
  const candidateIds = [...expectedCandidateIds].sort();
  const observedIds: string[] = [];
  let priorTopicId: string | undefined;
  for (const topic of value.topics) {
    if (!plain(topic)) fail("invalid topic");
    const topicKeys = Object.keys(topic).sort();
    if (topicKeys.join("\0") !== ["candidateIds", "candidateTasks", "title", "titleSource", "topicId"].sort().join("\0")) {
      fail("invalid topic keys");
    }
    if (
      typeof topic.topicId !== "string"
      || topic.topicId.length === 0
      || topic.topicId.length > 192
      || (priorTopicId !== undefined && priorTopicId >= topic.topicId)
      || typeof topic.title !== "string"
      || topic.title.trim().length === 0
      || topic.title.length > 120
      || (topic.titleSource !== "llm_community_title_v1" && topic.titleSource !== "deterministic_fallback")
      || !Array.isArray(topic.candidateIds)
      || !Array.isArray(topic.candidateTasks)
      || topic.candidateIds.length === 0
    ) fail("invalid topic contract");
    priorTopicId = topic.topicId;
    let priorCandidateId: string | undefined;
    for (const candidateId of topic.candidateIds) {
      if (
        typeof candidateId !== "string"
        || !CANDIDATE_ID.test(candidateId)
        || (priorCandidateId !== undefined && priorCandidateId >= candidateId)
      ) fail("invalid topic candidates");
      priorCandidateId = candidateId;
      observedIds.push(candidateId);
    }
    if (topic.candidateTasks.length !== topic.candidateIds.length) {
      fail("invalid candidate tasks");
    }
    const observedTaskCandidates: string[] = [];
    const observedSubtaskIds = new Set<string>();
    for (const candidateTask of topic.candidateTasks) {
      if (
        !plain(candidateTask)
        || Object.keys(candidateTask).sort().join("\0")
          !== ["candidateId", "subtasks"].sort().join("\0")
        || typeof candidateTask.candidateId !== "string"
        || !Array.isArray(candidateTask.subtasks)
      ) fail("invalid candidate task");
      observedTaskCandidates.push(candidateTask.candidateId);
      for (const subtask of candidateTask.subtasks) {
        if (
          !plain(subtask)
          || Object.keys(subtask).sort().join("\0")
            !== ["subtaskId", "summary", "title"].sort().join("\0")
          || typeof subtask.subtaskId !== "string"
          || subtask.subtaskId.length === 0
          || subtask.subtaskId.length > 192
          || observedSubtaskIds.has(subtask.subtaskId)
          || typeof subtask.title !== "string"
          || subtask.title.trim().length === 0
          || subtask.title.length > 120
          || typeof subtask.summary !== "string"
          || subtask.summary.trim().length === 0
          || subtask.summary.length > 240
        ) fail("invalid subtask");
        observedSubtaskIds.add(subtask.subtaskId);
      }
    }
    if (observedTaskCandidates.join("\0") !== topic.candidateIds.join("\0")) {
      fail("candidate task partition is invalid");
    }
  }
  let priorUngroupedId: string | undefined;
  for (const candidateId of value.ungroupedCandidateIds) {
    if (
      typeof candidateId !== "string"
      || !CANDIDATE_ID.test(candidateId)
      || (priorUngroupedId !== undefined && priorUngroupedId >= candidateId)
    ) fail("invalid ungrouped candidates");
    priorUngroupedId = candidateId;
    observedIds.push(candidateId);
  }
  if (
    observedIds.sort().join("\0") !== candidateIds.join("\0")
    || new Set(observedIds).size !== observedIds.length
    || (value.groupingState === "available" && value.topics.length === 0)
    || (value.groupingState === "unavailable" && value.topics.length !== 0)
  ) fail("candidate partition is invalid");
  const { hierarchyDigest, ...payload } = value;
  if (typeof hierarchyDigest !== "string" || !SHA256.test(hierarchyDigest) || hierarchyDigest !== taskMapContractDigest(payload)) {
    fail("invalid hierarchy digest");
  }
}

export function buildTaskMapNativeCandidateHierarchy(
  input: BuildTaskMapNativeCandidateHierarchyInputV1,
): TaskMapNativeCandidateHierarchyV1 {
  if (!SHA256.test(input.producerSnapshotDigest)) fail("invalid snapshot");
  const candidateIds = [...input.candidateIds].sort();
  if (
    new Set(candidateIds).size !== candidateIds.length
    || candidateIds.some((id) => !CANDIDATE_ID.test(id))
  ) fail("invalid candidates");
  const candidates = new Set(candidateIds);
  const proposalByNode = new Map<string, string>();
  const proposalIds = new Set<string>();
  for (const proposal of input.proposals) {
    if (
      proposal.rootProposalId.length === 0
      || proposal.rootProposalId.length > 192
      || proposalIds.has(proposal.rootProposalId)
      || proposal.title.trim().length === 0
      || proposal.memberNodeIds.length === 0
    ) fail("invalid proposal");
    proposalIds.add(proposal.rootProposalId);
    for (const nodeId of proposal.memberNodeIds) {
      const previous = proposalByNode.get(nodeId);
      if (previous !== undefined && previous !== proposal.rootProposalId) {
        fail("ambiguous engine membership");
      }
      proposalByNode.set(nodeId, proposal.rootProposalId);
    }
  }
  const candidateTopic = new Map<string, string>();
  const bindingByCandidate = new Map<string, Set<string>>();
  for (const binding of input.candidateNodeBindings) {
    if (!candidates.has(binding.candidateId) || binding.nodeIds.length === 0) {
      fail("invalid candidate binding");
    }
    const topicIds = new Set(
      binding.nodeIds.flatMap((nodeId) => {
        const topicId = proposalByNode.get(nodeId);
        return topicId === undefined ? [] : [topicId];
      }),
    );
    if (topicIds.size > 1) fail("ambiguous candidate membership");
    const topicId = [...topicIds][0];
    if (topicId !== undefined) candidateTopic.set(binding.candidateId, topicId);
    bindingByCandidate.set(binding.candidateId, new Set(binding.nodeIds));
  }
  const subtaskIds = new Set<string>();
  const subtasksByCandidate = new Map<string, Array<{
    subtaskId: string; title: string; summary: string;
  }>>();
  for (const subtask of input.subtasks) {
    if (
      !proposalIds.has(subtask.rootProposalId)
      || subtask.subtaskId.length === 0
      || subtask.subtaskId.length > 192
      || subtaskIds.has(subtask.subtaskId)
      || subtask.title.trim().length === 0
      || subtask.title.length > 120
      || subtask.summary.trim().length === 0
      || subtask.summary.length > 240
      || subtask.memberNodeIds.length === 0
    ) fail("invalid subtask input");
    subtaskIds.add(subtask.subtaskId);
    const owners = candidateIds.filter((candidateId) =>
      candidateTopic.get(candidateId) === subtask.rootProposalId
      && subtask.memberNodeIds.some((nodeId) =>
        bindingByCandidate.get(candidateId)?.has(nodeId) === true
      )
    );
    if (owners.length > 1) fail("ambiguous subtask membership");
    if (owners.length === 0) continue;
    const rows = subtasksByCandidate.get(owners[0]!) ?? [];
    rows.push({
      subtaskId: subtask.subtaskId,
      title: subtask.title,
      summary: subtask.summary,
    });
    subtasksByCandidate.set(owners[0]!, rows);
  }
  const topics = input.groupingAvailable
    ? [...input.proposals].sort((left, right) =>
        left.rootProposalId.localeCompare(right.rootProposalId)
      ).flatMap((proposal) => {
        const members = candidateIds.filter((candidateId) =>
          candidateTopic.get(candidateId) === proposal.rootProposalId
        );
        return members.length === 0 ? [] : [{
          topicId: proposal.rootProposalId,
          title: proposal.title,
          titleSource: proposal.titleSource,
          candidateIds: members,
          candidateTasks: members.map((candidateId) => ({
            candidateId,
            subtasks: (subtasksByCandidate.get(candidateId) ?? [])
              .sort((left, right) => left.subtaskId.localeCompare(right.subtaskId)),
          })),
        }];
      })
    : [];
  const grouped = new Set(topics.flatMap((topic) => topic.candidateIds));
  const payload = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION,
    producerSnapshotDigest: input.producerSnapshotDigest,
    groupingState: input.groupingAvailable && topics.length > 0
      ? "available" as const
      : "unavailable" as const,
    topics,
    ungroupedCandidateIds: candidateIds.filter((id) => !grouped.has(id)),
    authority: "none" as const,
    acceptedWork: false as const,
    rankEligible: false as const,
  };
  const hierarchy = Object.freeze({
    ...payload,
    hierarchyDigest: taskMapContractDigest(payload),
  });
  assertTaskMapNativeCandidateHierarchy(
    hierarchy,
    input.producerSnapshotDigest,
    candidateIds,
  );
  return hierarchy;
}
