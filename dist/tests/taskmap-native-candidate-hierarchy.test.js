"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("node:assert/strict"));
const node_test_1 = require("node:test");
const native_candidate_hierarchy_js_1 = require("../src/engine/taskmap/native-candidate-hierarchy.js");
const digest = (value) => value.repeat(64).slice(0, 64);
const candidate = (value) => `tmnativecandidate_${digest(value)}`;
(0, node_test_1.describe)("native candidate hierarchy", () => {
    (0, node_test_1.it)("projects engine community identity and membership without title clustering", () => {
        const meeting = candidate("1");
        const calendar = candidate("2");
        const agent = candidate("3");
        const hierarchy = (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
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
    (0, node_test_1.it)("fails closed on ambiguous membership and reports unavailable grouping", () => {
        const target = candidate("4");
        assert.throws(() => (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
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
        const unavailable = (0, native_candidate_hierarchy_js_1.buildTaskMapNativeCandidateHierarchy)({
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
