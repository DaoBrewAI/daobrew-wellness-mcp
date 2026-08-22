"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const llm_proposal_surface_js_1 = require("../src/engine/taskmap/llm-proposal-surface.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const OWNER = "a".repeat(64);
async function fixture() {
    const root = await (0, promises_1.mkdtemp)(node_path_1.default.join(node_os_1.default.tmpdir(), "taskmap-llm-surface-"));
    await (0, promises_1.chmod)(root, 0o700);
    return { root, cleanup: () => (0, promises_1.rm)(root, { recursive: true, force: true }) };
}
function projection() {
    return {
        contractVersion: "taskmap.v1",
        roots: [{ id: "root-a", title: "Launch" }],
        tasks: [{
                id: "task-a",
                rootId: "root-a",
                title: "Ship launch notes",
                summary: "Prepare the release summary.",
            }, {
                id: "task-b",
                rootId: "root-a",
                title: "Prepare release notes",
                summary: "Draft the launch summary.",
            }],
        edges: [],
    };
}
(0, node_test_1.describe)("Task Map owner-visible LLM proposal surface", () => {
    (0, node_test_1.it)("publishes only read-only duplicate and validated breakdown proposals", async () => {
        const f = await fixture();
        try {
            const document = await (0, llm_proposal_surface_js_1.publishTaskMapLlmProposalSurface)({
                taskMapRoot: f.root,
                ownerScopeDigest: OWNER,
                projection: projection(),
                identityStatus: {
                    stationId: "identity-adjudication-v1",
                    state: "current",
                    pendingCount: 0,
                    degradationCode: null,
                    lastSuccessAtMs: 1,
                },
                identityArtifact: {
                    artifactDigest: "b".repeat(64),
                    result: {
                        mergeCandidates: [{
                                pairId: "pair-a-b",
                                leftCandidateId: "task-a",
                                rightCandidateId: "task-b",
                                confidence: "ambiguous",
                            }],
                    },
                },
                decompositionStatus: {
                    stationId: "task-decomposition-v1",
                    state: "current",
                    pendingCount: 0,
                    degradationCode: null,
                    lastSuccessAtMs: 1,
                },
                decompositionArtifact: {
                    artifactDigest: "c".repeat(64),
                    workItems: [{
                            taskId: "task-a",
                            validProposals: [{
                                    proposal: {
                                        proposalId: "proposal-a",
                                        subtasks: [{
                                                subtaskId: "subtask-a",
                                                title: "Draft the outline",
                                                summary: "Create the first release-note outline.",
                                            }],
                                    },
                                }],
                        }],
                },
            });
            strict_1.default.deepEqual(document.possibleDuplicates.proposals, [{
                    pairId: "pair-a-b",
                    leftTaskId: "task-a",
                    rightTaskId: "task-b",
                    leftTitle: "Ship launch notes",
                    rightTitle: "Prepare release notes",
                    confidence: "ambiguous",
                    awaitingOwnerAcceptance: true,
                }]);
            strict_1.default.deepEqual(document.suggestedBreakdowns.proposals, [{
                    proposalId: "proposal-a",
                    parentTaskId: "task-a",
                    parentTitle: "Ship launch notes",
                    subtasks: [{
                            subtaskId: "subtask-a",
                            title: "Draft the outline",
                            summary: "Create the first release-note outline.",
                        }],
                    awaitingOwnerAcceptance: true,
                }]);
            strict_1.default.deepEqual(document.authority, {
                aliasesWritten: false,
                nodesWritten: false,
                edgesWritten: false,
                acceptanceAuthority: false,
                requiresOwnerAcceptance: true,
            });
            strict_1.default.deepEqual(await (0, llm_proposal_surface_js_1.loadTaskMapLlmProposalSurface)({
                taskMapRoot: f.root,
                ownerScopeDigest: OWNER,
                projection: projection(),
            }), document);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("fails closed on re-sealed authority escalation and preserves degraded empties", async () => {
        const f = await fixture();
        try {
            const degraded = await (0, llm_proposal_surface_js_1.publishTaskMapLlmProposalSurface)({
                taskMapRoot: f.root,
                ownerScopeDigest: OWNER,
                projection: projection(),
                identityStatus: {
                    stationId: "identity-adjudication-v1",
                    state: "unavailable",
                    pendingCount: 2,
                    degradationCode: "embedding_provider_failed",
                    lastSuccessAtMs: null,
                },
                identityArtifact: null,
                decompositionStatus: {
                    stationId: "task-decomposition-v1",
                    state: "deferred",
                    pendingCount: 1,
                    degradationCode: "validation_failed",
                    lastSuccessAtMs: null,
                },
                decompositionArtifact: null,
            });
            strict_1.default.equal(degraded.possibleDuplicates.proposals.length, 0);
            strict_1.default.equal(degraded.suggestedBreakdowns.proposals.length, 0);
            const filePath = node_path_1.default.join(f.root, llm_proposal_surface_js_1.TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME);
            const parsed = JSON.parse(await (0, promises_1.readFile)(filePath, "utf8"));
            parsed.authority.aliasesWritten = true;
            const { artifactDigest: _digest, ...base } = parsed;
            parsed.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
            await (0, promises_1.writeFile)(filePath, JSON.stringify(parsed), { mode: 0o600 });
            strict_1.default.equal(await (0, llm_proposal_surface_js_1.loadTaskMapLlmProposalSurface)({
                taskMapRoot: f.root,
                ownerScopeDigest: OWNER,
                projection: projection(),
            }), null);
        }
        finally {
            await f.cleanup();
        }
    });
});
