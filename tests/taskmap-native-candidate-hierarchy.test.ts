import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskMapNativeCandidateHierarchy,
} from "../src/engine/taskmap/native-candidate-hierarchy.js";

const digest = (value: string): string => value.repeat(64).slice(0, 64);
const candidate = (value: string): string =>
  `tmnativecandidate_${digest(value)}`;

describe("native candidate hierarchy", () => {
  it("projects engine community identity and membership without title clustering", () => {
    const meeting = candidate("1");
    const calendar = candidate("2");
    const agent = candidate("3");
    const hierarchy = buildTaskMapNativeCandidateHierarchy({
      producerSnapshotDigest: digest("a"),
      candidateIds: [meeting, calendar, agent],
      groupingAvailable: true,
      proposals: [
        {
          rootProposalId: "tmcommunityroot_alpha",
          title: "Launch readiness",
          titleSource: "llm_community_title_v1",
          memberNodeIds: ["meeting-node", "agent-node"],
        },
        {
          rootProposalId: "tmcommunityroot_beta",
          title: "Founder conversations",
          titleSource: "deterministic_fallback",
          memberNodeIds: ["calendar-node"],
        },
      ],
      candidateNodeBindings: [
        { candidateId: meeting, nodeIds: ["meeting-node"] },
        { candidateId: calendar, nodeIds: ["calendar-node"] },
        { candidateId: agent, nodeIds: ["agent-node"] },
      ],
      subtasks: [{
        rootProposalId: "tmcommunityroot_alpha",
        subtaskId: "community-task-founder-follow-up",
        title: "Follow up with launch owners",
        summary: "Resolve the launch owner questions from agent context.",
        memberNodeIds: ["agent-node"],
      }],
    });

    assert.equal(hierarchy.groupingState, "available");
    assert.deepEqual(hierarchy.topics.map((topic) => topic.topicId), [
      "tmcommunityroot_alpha",
      "tmcommunityroot_beta",
    ]);
    assert.deepEqual(hierarchy.topics[0]?.candidateIds, [meeting, agent]);
    assert.deepEqual(hierarchy.topics[1]?.candidateIds, [calendar]);
    assert.deepEqual(hierarchy.topics[0]?.candidateTasks, [
      { candidateId: meeting, subtasks: [] },
      {
        candidateId: agent,
        subtasks: [{
          subtaskId: "community-task-founder-follow-up",
          title: "Follow up with launch owners",
          summary: "Resolve the launch owner questions from agent context.",
        }],
      },
    ]);
    assert.deepEqual(hierarchy.ungroupedCandidateIds, []);
    assert.equal(hierarchy.topics[0]?.titleSource, "llm_community_title_v1");
  });

  it("fails closed on ambiguous membership and reports unavailable grouping", () => {
    const target = candidate("4");
    assert.throws(() => buildTaskMapNativeCandidateHierarchy({
      producerSnapshotDigest: digest("b"),
      candidateIds: [target],
      groupingAvailable: true,
      proposals: [
        {
          rootProposalId: "tmcommunityroot_one",
          title: "One",
          titleSource: "deterministic_fallback",
          memberNodeIds: ["shared-node"],
        },
        {
          rootProposalId: "tmcommunityroot_two",
          title: "Two",
          titleSource: "deterministic_fallback",
          memberNodeIds: ["shared-node"],
        },
      ],
      candidateNodeBindings: [
        { candidateId: target, nodeIds: ["shared-node"] },
      ],
      subtasks: [],
    }), /ambiguous/);

    const unavailable = buildTaskMapNativeCandidateHierarchy({
      producerSnapshotDigest: digest("c"),
      candidateIds: [target],
      groupingAvailable: false,
      proposals: [],
      candidateNodeBindings: [],
      subtasks: [],
    });
    assert.equal(unavailable.groupingState, "unavailable");
    assert.deepEqual(unavailable.topics, []);
    assert.deepEqual(unavailable.ungroupedCandidateIds, [target]);
  });
});
