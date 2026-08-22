"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION = void 0;
exports.assertTaskMapNativeCandidateHierarchy = assertTaskMapNativeCandidateHierarchy;
exports.buildTaskMapNativeCandidateHierarchy = buildTaskMapNativeCandidateHierarchy;
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION = "taskmap-native-candidate-hierarchy.v2";
const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
function fail(message) {
    throw new Error(`Task Map native candidate hierarchy: ${message}`);
}
function plain(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertTaskMapNativeCandidateHierarchy(value, expectedProducerSnapshotDigest, expectedCandidateIds) {
    if (!plain(value))
        fail("invalid hierarchy");
    const keys = Object.keys(value).sort();
    const expectedKeys = [
        "acceptedWork", "authority", "contractVersion", "groupingState",
        "hierarchyDigest", "producerSnapshotDigest", "rankEligible", "topics",
        "ungroupedCandidateIds",
    ].sort();
    if (keys.join("\0") !== expectedKeys.join("\0"))
        fail("invalid hierarchy keys");
    if (value.contractVersion !== exports.TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION
        || value.producerSnapshotDigest !== expectedProducerSnapshotDigest
        || value.authority !== "none"
        || value.acceptedWork !== false
        || value.rankEligible !== false
        || (value.groupingState !== "available" && value.groupingState !== "unavailable")
        || !Array.isArray(value.topics)
        || !Array.isArray(value.ungroupedCandidateIds))
        fail("invalid hierarchy contract");
    const candidateIds = [...expectedCandidateIds].sort();
    const observedIds = [];
    let priorTopicId;
    for (const topic of value.topics) {
        if (!plain(topic))
            fail("invalid topic");
        const topicKeys = Object.keys(topic).sort();
        if (topicKeys.join("\0") !== ["candidateIds", "candidateTasks", "title", "titleSource", "topicId"].sort().join("\0")) {
            fail("invalid topic keys");
        }
        if (typeof topic.topicId !== "string"
            || topic.topicId.length === 0
            || topic.topicId.length > 192
            || (priorTopicId !== undefined && priorTopicId >= topic.topicId)
            || typeof topic.title !== "string"
            || topic.title.trim().length === 0
            || topic.title.length > 120
            || (topic.titleSource !== "llm_community_title_v1" && topic.titleSource !== "deterministic_fallback")
            || !Array.isArray(topic.candidateIds)
            || !Array.isArray(topic.candidateTasks)
            || topic.candidateIds.length === 0)
            fail("invalid topic contract");
        priorTopicId = topic.topicId;
        let priorCandidateId;
        for (const candidateId of topic.candidateIds) {
            if (typeof candidateId !== "string"
                || !CANDIDATE_ID.test(candidateId)
                || (priorCandidateId !== undefined && priorCandidateId >= candidateId))
                fail("invalid topic candidates");
            priorCandidateId = candidateId;
            observedIds.push(candidateId);
        }
        if (topic.candidateTasks.length !== topic.candidateIds.length) {
            fail("invalid candidate tasks");
        }
        const observedTaskCandidates = [];
        const observedSubtaskIds = new Set();
        for (const candidateTask of topic.candidateTasks) {
            if (!plain(candidateTask)
                || Object.keys(candidateTask).sort().join("\0")
                    !== ["candidateId", "subtasks"].sort().join("\0")
                || typeof candidateTask.candidateId !== "string"
                || !Array.isArray(candidateTask.subtasks))
                fail("invalid candidate task");
            observedTaskCandidates.push(candidateTask.candidateId);
            for (const subtask of candidateTask.subtasks) {
                if (!plain(subtask)
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
                    || subtask.summary.length > 240)
                    fail("invalid subtask");
                observedSubtaskIds.add(subtask.subtaskId);
            }
        }
        if (observedTaskCandidates.join("\0") !== topic.candidateIds.join("\0")) {
            fail("candidate task partition is invalid");
        }
    }
    let priorUngroupedId;
    for (const candidateId of value.ungroupedCandidateIds) {
        if (typeof candidateId !== "string"
            || !CANDIDATE_ID.test(candidateId)
            || (priorUngroupedId !== undefined && priorUngroupedId >= candidateId))
            fail("invalid ungrouped candidates");
        priorUngroupedId = candidateId;
        observedIds.push(candidateId);
    }
    if (observedIds.sort().join("\0") !== candidateIds.join("\0")
        || new Set(observedIds).size !== observedIds.length
        || (value.groupingState === "available" && value.topics.length === 0)
        || (value.groupingState === "unavailable" && value.topics.length !== 0))
        fail("candidate partition is invalid");
    const { hierarchyDigest, ...payload } = value;
    if (typeof hierarchyDigest !== "string" || !SHA256.test(hierarchyDigest) || hierarchyDigest !== (0, source_contracts_js_1.taskMapContractDigest)(payload)) {
        fail("invalid hierarchy digest");
    }
}
function buildTaskMapNativeCandidateHierarchy(input) {
    if (!SHA256.test(input.producerSnapshotDigest))
        fail("invalid snapshot");
    const candidateIds = [...input.candidateIds].sort();
    if (new Set(candidateIds).size !== candidateIds.length
        || candidateIds.some((id) => !CANDIDATE_ID.test(id)))
        fail("invalid candidates");
    const candidates = new Set(candidateIds);
    const proposalByNode = new Map();
    const proposalIds = new Set();
    for (const proposal of input.proposals) {
        if (proposal.rootProposalId.length === 0
            || proposal.rootProposalId.length > 192
            || proposalIds.has(proposal.rootProposalId)
            || proposal.title.trim().length === 0
            || proposal.memberNodeIds.length === 0)
            fail("invalid proposal");
        proposalIds.add(proposal.rootProposalId);
        for (const nodeId of proposal.memberNodeIds) {
            const previous = proposalByNode.get(nodeId);
            if (previous !== undefined && previous !== proposal.rootProposalId) {
                fail("ambiguous engine membership");
            }
            proposalByNode.set(nodeId, proposal.rootProposalId);
        }
    }
    const candidateTopic = new Map();
    const bindingByCandidate = new Map();
    for (const binding of input.candidateNodeBindings) {
        if (!candidates.has(binding.candidateId) || binding.nodeIds.length === 0) {
            fail("invalid candidate binding");
        }
        const topicIds = new Set(binding.nodeIds.flatMap((nodeId) => {
            const topicId = proposalByNode.get(nodeId);
            return topicId === undefined ? [] : [topicId];
        }));
        if (topicIds.size > 1)
            fail("ambiguous candidate membership");
        const topicId = [...topicIds][0];
        if (topicId !== undefined)
            candidateTopic.set(binding.candidateId, topicId);
        bindingByCandidate.set(binding.candidateId, new Set(binding.nodeIds));
    }
    const subtaskIds = new Set();
    const subtasksByCandidate = new Map();
    for (const subtask of input.subtasks) {
        if (!proposalIds.has(subtask.rootProposalId)
            || subtask.subtaskId.length === 0
            || subtask.subtaskId.length > 192
            || subtaskIds.has(subtask.subtaskId)
            || subtask.title.trim().length === 0
            || subtask.title.length > 120
            || subtask.summary.trim().length === 0
            || subtask.summary.length > 240
            || subtask.memberNodeIds.length === 0)
            fail("invalid subtask input");
        subtaskIds.add(subtask.subtaskId);
        const owners = candidateIds.filter((candidateId) => candidateTopic.get(candidateId) === subtask.rootProposalId
            && subtask.memberNodeIds.some((nodeId) => bindingByCandidate.get(candidateId)?.has(nodeId) === true));
        if (owners.length > 1)
            fail("ambiguous subtask membership");
        if (owners.length === 0)
            continue;
        const rows = subtasksByCandidate.get(owners[0]) ?? [];
        rows.push({
            subtaskId: subtask.subtaskId,
            title: subtask.title,
            summary: subtask.summary,
        });
        subtasksByCandidate.set(owners[0], rows);
    }
    const topics = input.groupingAvailable
        ? [...input.proposals].sort((left, right) => left.rootProposalId.localeCompare(right.rootProposalId)).flatMap((proposal) => {
            const members = candidateIds.filter((candidateId) => candidateTopic.get(candidateId) === proposal.rootProposalId);
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
        contractVersion: exports.TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION,
        producerSnapshotDigest: input.producerSnapshotDigest,
        groupingState: input.groupingAvailable && topics.length > 0
            ? "available"
            : "unavailable",
        topics,
        ungroupedCandidateIds: candidateIds.filter((id) => !grouped.has(id)),
        authority: "none",
        acceptedWork: false,
        rankEligible: false,
    };
    const hierarchy = Object.freeze({
        ...payload,
        hierarchyDigest: (0, source_contracts_js_1.taskMapContractDigest)(payload),
    });
    assertTaskMapNativeCandidateHierarchy(hierarchy, input.producerSnapshotDigest, candidateIds);
    return hierarchy;
}
