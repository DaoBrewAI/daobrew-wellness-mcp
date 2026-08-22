"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const community_root_proposals_js_1 = require("../src/engine/taskmap/community-root-proposals.js");
const llm_station_js_1 = require("../src/engine/taskmap/llm-station.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const OCCURRED_AT = "2026-08-16T12:00:00.000Z";
function digest(label) {
    return (0, source_contracts_js_1.taskMapContractDigest)(`community-root-test:${label}`);
}
function baseRootId(memberNodeIds) {
    return `graph-root-${(0, source_contracts_js_1.taskMapContractDigest)([...memberNodeIds].sort()).slice(0, 16)}`;
}
function titleBatch(entries) {
    return JSON.stringify({ titles: entries });
}
function node(nodeId, text = `Work represented by ${nodeId}`, sourceFamily = "agent") {
    return {
        nodeId,
        text,
        sourceFamily,
        routingDigest: digest(`routing:${nodeId}`),
        occurredAt: OCCURRED_AT,
        externalRefs: [],
        embedding: null,
        isCalendarCommitment: false,
    };
}
function community(memberNodeIds) {
    return {
        memberNodeIds,
        contextNodeIds: [],
        internalEdgeCount: Math.max(0, memberNodeIds.length - 1),
        dateSpan: { startAt: OCCURRED_AT, endAt: OCCURRED_AT },
        sourceFamilies: ["agent"],
        quality: {
            internalDensity: memberNodeIds.length > 1 ? 1 : 0,
            cutEdgeRatio: 0,
            weakestMemberSimilarity: null,
        },
    };
}
function graph(communities, nodeCount) {
    return {
        edges: [],
        communities,
        unclustered: [],
        semanticGroupProvenance: [],
        optimization: {
            algorithm: "deterministic_louvain_local_modularity",
            passes: 1,
            passLimit: 1,
            converged: true,
            finalPassModularityGain: 0,
        },
        resourceUsage: {
            nodeCount,
            pairComparisons: 0,
            embeddingSimilarityComputations: 0,
            emittedEdgeCount: 0,
            semanticPairMemberships: 0,
        },
    };
}
function lookup(nodes) {
    return new Map(nodes.map((candidate) => [candidate.nodeId, candidate]));
}
function boundLookup(nodes) {
    const nodeLookup = lookup(nodes);
    return {
        nodeLookup,
        nodeLookupDigest: (0, community_root_proposals_js_1.taskMapCommunityRootNodeLookupDigest)(nodeLookup),
    };
}
function station(outputJson, calls = []) {
    return {
        provider: {
            transport: "gemini-remote",
            executable: "injected-test-station",
            args: [],
            model: "injected-title-test",
        },
        async run(request) {
            calls.push(request);
            if (outputJson instanceof Error)
                throw outputJson;
            return {
                stationId: request.stationId,
                model: "injected-title-test",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson,
                producedAt: OCCURRED_AT,
                transport: "gemini-remote",
            };
        },
    };
}
(0, node_test_1.describe)("Task Map community root proposals", () => {
    (0, node_test_1.it)("reserves a measured thirty-second title batch inside the 120s shadow budget", () => {
        strict_1.default.equal(community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs, 30_000);
    });
    (0, node_test_1.it)("emits one deterministic review-only proposal and titles the top five members through the injected station", async () => {
        const nodes = [
            node("a", "Ship the durable Task Map"),
            node("b", "Verify the durable Task Map"),
            node("c", "Review the durable Task Map"),
            node("d", "Test the durable Task Map"),
            node("e", "Document the durable Task Map"),
            node("f", "This sixth member must not enter the title prompt"),
        ];
        const calls = [];
        const sortedMembers = ["a", "b", "c", "d", "e", "f"];
        const baseId = baseRootId(sortedMembers);
        const binding = boundLookup(nodes);
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 6),
            ...binding,
            previousAcceptedRoots: [],
            llmStation: station(titleBatch([{
                    baseRootProposalId: baseId,
                    title: "Durable Task Map Delivery",
                }]), calls),
        });
        strict_1.default.equal(result.proposals.length, 1);
        strict_1.default.equal(result.proposals[0].rootProposalId, baseId);
        strict_1.default.equal(result.proposals[0].baseRootProposalId, baseId);
        strict_1.default.equal(result.proposals[0].title, "Durable Task Map Delivery");
        strict_1.default.equal(result.proposals[0].titleSource, "llm_community_title_v1");
        strict_1.default.equal(result.proposals[0].recordKind, "review_only_root_proposal");
        strict_1.default.equal(result.proposals[0].authority, "none");
        strict_1.default.equal(result.proposals[0].requiresOwnerAcceptance, true);
        strict_1.default.equal(result.proposals[0].acceptedMembershipAuthority, false);
        strict_1.default.equal(result.authority, "none");
        strict_1.default.equal(result.requiresOwnerAcceptance, true);
        strict_1.default.equal(result.lifecycle.length, 0);
        strict_1.default.equal(result.nodeLookupDigest, binding.nodeLookupDigest);
        strict_1.default.equal(result.monitoring.titleBatchAttempted, true);
        strict_1.default.equal(result.monitoring.titleBatchTimedOut, false);
        strict_1.default.equal(result.monitoring.llmTitleCount, 1);
        strict_1.default.equal(result.monitoring.fallbackTitleCount, 0);
        strict_1.default.ok(result.monitoring.titlePromptBytes > 0);
        strict_1.default.ok(result.monitoring.titleOutputBytes > 0);
        strict_1.default.equal(calls.length, 1);
        strict_1.default.equal(calls[0].stationId, "community-title-v1");
        strict_1.default.match(calls[0].inputDigest, /^[a-f0-9]{64}$/);
        for (const candidate of nodes.slice(0, 5)) {
            strict_1.default.ok(calls[0].promptText.includes(candidate.text));
        }
        strict_1.default.equal(calls[0].promptText.includes(nodes[5].text), false);
    });
    (0, node_test_1.it)("falls back deterministically on unavailable or invalid title output and keeps prompts and titles private", async () => {
        const unsafe = node("unsafe", "Launch Task Map review from /Users/neo/private with api_key=super-secret-value and sk-proj-abcdefghijklmnop");
        const sibling = node("sibling", "Launch Task Map review safely this week");
        const unavailableCalls = [];
        const input = {
            graphOutput: graph([community(["unsafe", "sibling"])], 2),
            ...boundLookup([unsafe, sibling]),
            previousAcceptedRoots: [],
        };
        const unavailable = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(new llm_station_js_1.LlmStationUnavailableError("no_provider"), unavailableCalls),
        });
        const invalid = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(JSON.stringify({
                titles: [{
                        baseRootProposalId: baseRootId(["sibling", "unsafe"]),
                        title: "/Users/neo/private",
                        unexpected: true,
                    }],
            })),
        });
        strict_1.default.equal(unavailable.proposals[0].title, "Launch Task Map review");
        strict_1.default.equal(invalid.proposals[0].title, "Launch Task Map review");
        strict_1.default.equal(unavailable.proposals[0].titleSource, "deterministic_fallback");
        strict_1.default.ok(unavailable.proposals[0].title.length <= 80);
        strict_1.default.equal(JSON.stringify(unavailable).includes("/Users/"), false);
        strict_1.default.equal(JSON.stringify(unavailable).includes("super-secret"), false);
        strict_1.default.equal(JSON.stringify(unavailable).includes("sk-proj-"), false);
        strict_1.default.equal(unavailableCalls[0].promptText.includes("/Users/"), false);
        strict_1.default.equal(unavailableCalls[0].promptText.includes("super-secret"), false);
        strict_1.default.equal(unavailableCalls[0].promptText.includes("sk-proj-"), false);
    });
    (0, node_test_1.it)("is byte-identical under community, member, prior-root, and node-map permutations", async () => {
        const nodes = [
            node("a", "Alpha launch work"),
            node("b", "Alpha verification work"),
            node("c", "Beta launch work"),
            node("d", "Beta verification work"),
        ];
        const communities = [community(["a", "b"]), community(["c", "d"])];
        const previousAcceptedRoots = [
            {
                rootProposalId: "accepted-alpha",
                memberNodeIds: ["a", "b"],
            },
            {
                rootProposalId: "accepted-beta",
                memberNodeIds: ["c", "d"],
            },
        ];
        const forward = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph(communities, 4),
            ...boundLookup(nodes),
            previousAcceptedRoots,
        });
        const reversed = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([...communities].reverse().map((candidate) => ({
                ...candidate,
                memberNodeIds: [...candidate.memberNodeIds].reverse(),
            })), 4),
            ...boundLookup([...nodes].reverse()),
            previousAcceptedRoots: [...previousAcceptedRoots].reverse().map((candidate) => ({
                ...candidate,
                memberNodeIds: [...candidate.memberNodeIds].reverse(),
            })),
        });
        strict_1.default.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(forward), (0, source_contracts_js_1.taskMapContractCanonicalJson)(reversed));
        strict_1.default.equal(forward.proposalSetDigest, reversed.proposalSetDigest);
    });
    (0, node_test_1.it)("does not invent a root when the validated graph has no community", async () => {
        const calendarNodes = [
            node("calendar-a", "Calendar context A", "calendar"),
            node("calendar-b", "Calendar context B", "calendar"),
        ];
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([], calendarNodes.length),
            ...boundLookup(calendarNodes),
            previousAcceptedRoots: [],
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.deepEqual(result.lifecycle, []);
    });
    (0, node_test_1.it)("reuses an accepted root identity after a twenty-percent membership change without granting authority", async () => {
        const nodes = ["a", "b", "c", "d"].map((nodeId) => node(nodeId));
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(["a", "b", "c", "d"])], 4),
            ...boundLookup(nodes),
            previousAcceptedRoots: [{
                    rootProposalId: "accepted-existing-root",
                    memberNodeIds: ["a", "b", "c", "d", "removed"],
                }],
        });
        strict_1.default.equal(result.proposals[0].rootProposalId, "accepted-existing-root");
        strict_1.default.notEqual(result.proposals[0].baseRootProposalId, result.proposals[0].rootProposalId);
        strict_1.default.equal(result.proposals[0].authority, "none");
        strict_1.default.equal(result.proposals[0].requiresOwnerAcceptance, true);
        strict_1.default.deepEqual(result.lifecycle, [{
                kind: "identity_reuse_proposed",
                rootProposalId: "accepted-existing-root",
                baseRootProposalId: result.proposals[0].baseRootProposalId,
                previousMemberNodeIds: ["a", "b", "c", "d", "removed"],
                currentMemberNodeIds: ["a", "b", "c", "d"],
                jaccardSimilarity: 0.8,
                recordKind: "review_only_identity_reuse_proposal",
                proposalDisposition: "review_only",
                authority: "none",
                requiresOwnerAcceptance: true,
                lifecycleAuthority: false,
            }]);
        strict_1.default.deepEqual(result.reuseMetrics, {
            reuseThreshold: 0.5,
            communityCount: 1,
            previousAcceptedRootCount: 1,
            eligiblePairCount: 1,
            identityReuseProposedCount: 1,
            unmatchedCommunityCount: 0,
            unmatchedPreviousRootCount: 0,
        });
    });
    (0, node_test_1.it)("does not reuse identity below the Jaccard threshold", async () => {
        const nodes = [node("a"), node("b")];
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(["a", "b"])], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [{
                    rootProposalId: "accepted-low-overlap",
                    memberNodeIds: ["a", "c", "d"],
                }],
        });
        strict_1.default.match(result.proposals[0].rootProposalId, /^graph-root-[a-f0-9]{16}$/);
        strict_1.default.notEqual(result.proposals[0].rootProposalId, "accepted-low-overlap");
        strict_1.default.deepEqual(result.lifecycle, []);
        strict_1.default.equal(result.reuseMetrics.eligiblePairCount, 0);
        strict_1.default.equal(result.reuseMetrics.identityReuseProposedCount, 0);
    });
    (0, node_test_1.it)("uses global maximum-cardinality assignment instead of a locally ambiguous match", async () => {
        const nodes = [node("a"), node("b"), node("c")];
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([
                community(["a"]),
                community(["b"]),
                community(["c"]),
            ], 3),
            ...boundLookup(nodes),
            previousAcceptedRoots: [
                {
                    rootProposalId: "accepted-shared",
                    memberNodeIds: ["a", "b"],
                },
                {
                    rootProposalId: "accepted-a-alternative",
                    memberNodeIds: ["a", "x"],
                },
            ],
        });
        const rootByMember = new Map(result.proposals.map((proposal) => [
            proposal.memberNodeIds[0],
            proposal.rootProposalId,
        ]));
        strict_1.default.equal(rootByMember.get("a"), "accepted-a-alternative");
        strict_1.default.equal(rootByMember.get("b"), "accepted-shared");
        strict_1.default.match(rootByMember.get("c") ?? "", /^graph-root-[a-f0-9]{16}$/);
        strict_1.default.equal(result.lifecycle.length, 2);
    });
    (0, node_test_1.it)("reuses at exactly 0.5 and breaks equal global assignments by code point", async () => {
        const nodes = [node("tie-a"), node("tie-b")];
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([
                community(["tie-a"]),
                community(["tie-b"]),
            ], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [
                {
                    rootProposalId: "accepted-a",
                    memberNodeIds: ["tie-a", "tie-b"],
                },
                {
                    rootProposalId: "accepted-b",
                    memberNodeIds: ["tie-a", "tie-b"],
                },
            ],
        });
        const rootByMember = new Map(result.proposals.map((proposal) => [
            proposal.memberNodeIds[0],
            proposal.rootProposalId,
        ]));
        strict_1.default.equal(rootByMember.get("tie-a"), "accepted-a");
        strict_1.default.equal(rootByMember.get("tie-b"), "accepted-b");
        strict_1.default.ok(result.lifecycle.every((record) => record.jaccardSimilarity === 0.5));
        strict_1.default.deepEqual(result.reuseMetrics, {
            reuseThreshold: 0.5,
            communityCount: 2,
            previousAcceptedRootCount: 2,
            eligiblePairCount: 4,
            identityReuseProposedCount: 2,
            unmatchedCommunityCount: 0,
            unmatchedPreviousRootCount: 0,
        });
    });
    (0, node_test_1.it)("fails closed on duplicate previous roots and duplicate community or history members", async () => {
        const nodes = [node("a"), node("b")];
        const base = {
            graphOutput: graph([community(["a", "b"])], 2),
            ...boundLookup(nodes),
        };
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...base,
            previousAcceptedRoots: [
                { rootProposalId: "same-root", memberNodeIds: ["a"] },
                { rootProposalId: "same-root", memberNodeIds: ["b"] },
            ],
        }), /duplicate previous rootProposalId/);
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...base,
            previousAcceptedRoots: [{
                    rootProposalId: "history-duplicate-member",
                    memberNodeIds: ["a", "a"],
                }],
        }), /duplicate previous memberNodeId/);
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(["a", "a"])], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        }), /duplicate community memberNodeId/);
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([
                community(["a"]),
                community(["a", "b"]),
            ], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        }), /duplicate memberNodeId across communities/);
    });
    (0, node_test_1.it)("rejects duplicate-key and overlong LLM title payloads into the bounded fallback", async () => {
        const nodes = [
            node("a", "Stable bounded fallback title"),
            node("b", "Stable bounded fallback title"),
        ];
        const input = {
            graphOutput: graph([community(["a", "b"])], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        };
        const duplicate = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station('{"titles":[],"titles":[]}'),
        });
        const overlong = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(titleBatch([{
                    baseRootProposalId: baseRootId(["a", "b"]),
                    title: "x".repeat(81),
                }])),
        });
        for (const result of [duplicate, overlong]) {
            strict_1.default.equal(result.proposals[0].title, "Stable bounded fallback title");
            strict_1.default.equal(result.proposals[0].titleSource, "deterministic_fallback");
            strict_1.default.ok(result.proposals[0].title.length <= 80);
        }
    });
    (0, node_test_1.it)("sanitizes cross-platform paths and AWS credentials from prompts and returned titles", async () => {
        const awsAccessKey = "AKIA1234567890ABCDEF";
        const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
        const granolaToken = "grn_abcdefghijklmnop";
        const dbkToken = "dbk_abcdefghijklmnop";
        const githubToken = "ghp_abcdefghijklmnop";
        const slackToken = "xoxb-1234567890123456";
        const openAiToken = "sk-proj-abcdefghijklmnop";
        const jwt = "abcdefgh.ijklmnop.qrstuvwx";
        const unsafeText = [
            "Launch Task Map review",
            "file:///Users/neo/private/report.md",
            "C:\\Users\\neo\\private\\report.md",
            "\\\\server\\share\\private\\report.md",
            "/repo/private/report.md",
            awsAccessKey,
            `aws_secret_access_key=${awsSecret}`,
            granolaToken,
            dbkToken,
            githubToken,
            slackToken,
            openAiToken,
            jwt,
            "-----BEGIN PRIVATE KEY----- truncated-private-content",
            "password=visible-password",
        ].join(" ");
        const nodes = [
            node("unsafe-platform", unsafeText),
            node("safe-platform", "Launch Task Map review safely"),
        ];
        const input = {
            graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        };
        const calls = [];
        const unavailable = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(new llm_station_js_1.LlmStationUnavailableError("no_provider"), calls),
        });
        for (const secret of [
            "file://",
            "C:\\Users",
            "\\\\server\\share",
            "/repo/private",
            awsAccessKey,
            awsSecret,
            granolaToken,
            dbkToken,
            githubToken,
            slackToken,
            openAiToken,
            jwt,
            "-----BEGIN PRIVATE KEY-----",
            "visible-password",
        ]) {
            strict_1.default.equal(calls[0].promptText.includes(secret), false, secret);
            strict_1.default.equal(JSON.stringify(unavailable).includes(secret), false, secret);
        }
        const invalidTitles = [
            "file:///Users/neo/private/report.md",
            "C:\\Users\\neo\\private\\report.md",
            "\\\\server\\share\\private\\report.md",
            "/repo/private/report.md",
            awsAccessKey,
            `aws_secret_access_key=${awsSecret}`,
            granolaToken,
            dbkToken,
            githubToken,
            slackToken,
            openAiToken,
            jwt,
            "-----BEGIN PRIVATE KEY----- truncated-private-content",
            "password=visible-password",
        ];
        for (const title of invalidTitles) {
            const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
                ...input,
                llmStation: station(titleBatch([{
                        baseRootProposalId: baseRootId([
                            "safe-platform",
                            "unsafe-platform",
                        ]),
                        title,
                    }])),
            });
            strict_1.default.equal(result.proposals[0].titleSource, "deterministic_fallback");
            strict_1.default.equal(result.proposals[0].title, "Launch Task Map review");
            strict_1.default.equal(JSON.stringify(result).includes(title), false);
        }
    });
    (0, node_test_1.it)("preserves commit SHAs and technical identifiers as non-secret title input", async () => {
        const sha40 = "a".repeat(40);
        const sha64 = "b".repeat(64);
        const technicalId = "taskmap_agent_session_compacted_v2";
        const nodes = [
            node("technical-a", `Review commit ${sha40} ${technicalId}`),
            node("technical-b", `Compare digest ${sha64} ${technicalId}`),
        ];
        const calls = [];
        await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
            llmStation: station(new llm_station_js_1.LlmStationUnavailableError("no_provider"), calls),
        });
        strict_1.default.ok(calls[0].promptText.includes(sha40));
        strict_1.default.ok(calls[0].promptText.includes(sha64));
        strict_1.default.ok(calls[0].promptText.includes(technicalId));
        const titled = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
            llmStation: station(titleBatch([{
                    baseRootProposalId: baseRootId(nodes.map((candidate) => candidate.nodeId)),
                    title: sha40,
                }])),
        });
        strict_1.default.equal(titled.proposals[0].title, sha40);
        strict_1.default.equal(titled.proposals[0].titleSource, "llm_community_title_v1");
    });
    (0, node_test_1.it)("uses one bounded station call for a production-shaped maximum root batch", async () => {
        const nodes = Array.from({ length: 384 }, (_, index) => node(`max-root-${String(index).padStart(3, "0")}`, `Bounded title evidence ${index} ${"context ".repeat(50)}`));
        const calls = [];
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph(nodes.map((candidate) => community([candidate.nodeId])), nodes.length),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
            llmStation: station('{"titles":[]}', calls),
        });
        strict_1.default.equal(result.proposals.length, 384);
        strict_1.default.equal(calls.length, 1);
        strict_1.default.ok(Buffer.byteLength(calls[0].promptText, "utf8") <= 64 * 1_024);
        strict_1.default.ok(result.proposals.every((proposal) => proposal.titleSource === "deterministic_fallback"));
        strict_1.default.equal(result.monitoring.titleBatchAttempted, true);
        strict_1.default.equal(result.monitoring.fallbackTitleCount, 384);
        strict_1.default.ok(result.monitoring.titlePromptBytes <= 64 * 1_024);
    });
    (0, node_test_1.it)("opens one run-level circuit after a bounded title-batch timeout", async () => {
        const calls = [];
        const hangingStation = {
            provider: {
                transport: "gemini-remote",
                executable: "hanging-test-station",
                args: [],
                model: "hanging-title-test",
            },
            run(request) {
                calls.push(request);
                return new Promise(() => { });
            },
        };
        const result = await community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY
            .buildWithTitleTimeout({
            graphOutput: graph([community(["timeout-node"])], 1),
            ...boundLookup([node("timeout-node", "Timeout fallback title")]),
            previousAcceptedRoots: [],
            llmStation: hangingStation,
        }, 5);
        strict_1.default.equal(calls.length, 1);
        strict_1.default.equal(result.proposals[0].title, "Timeout fallback title");
        strict_1.default.equal(result.proposals[0].titleSource, "deterministic_fallback");
        strict_1.default.equal(result.titleGeneration, null);
        strict_1.default.equal(result.monitoring.titleBatchAttempted, true);
        strict_1.default.equal(result.monitoring.titleBatchTimedOut, true);
        strict_1.default.equal(result.monitoring.fallbackTitleCount, 1);
    });
    (0, node_test_1.it)("records a station-originated timeout as the title fallback reason", async () => {
        const timedOutStation = station(new llm_station_js_1.LlmStationUnavailableError("timeout", "gemini-remote"));
        const result = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(["station-timeout-node"])], 1),
            ...boundLookup([node("station-timeout-node", "Station timeout fallback")]),
            previousAcceptedRoots: [],
            llmStation: timedOutStation,
        });
        strict_1.default.equal(result.monitoring.titleBatchTimedOut, true);
        strict_1.default.equal(result.monitoring.titleFallbackReason, "station_timeout");
        strict_1.default.equal(result.proposals[0].titleSource, "deterministic_fallback");
    });
    (0, node_test_1.it)("replays a fully bound recorded title envelope deterministically", async () => {
        const nodes = [
            node("replay-a", "Replay stable root title"),
            node("replay-b", "Replay stable root evidence"),
        ];
        const memberNodeIds = nodes.map((candidate) => candidate.nodeId);
        const outputJson = titleBatch([{
                baseRootProposalId: baseRootId(memberNodeIds),
                title: "Replay Stable Root",
            }]);
        const calls = [];
        const input = {
            graphOutput: graph([community(memberNodeIds)], 2),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        };
        await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(outputJson, calls),
        });
        const recordedEnvelope = {
            stationId: "community-title-v1",
            model: "recorded-title-model",
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(calls[0].promptText),
            inputDigest: calls[0].inputDigest,
            outputJson,
            producedAt: OCCURRED_AT,
            transport: "gemini-remote",
        };
        const first = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            recordedTitleEnvelope: recordedEnvelope,
        });
        const second = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community([...memberNodeIds].reverse())], 2),
            ...boundLookup([...nodes].reverse()),
            previousAcceptedRoots: [],
            recordedTitleEnvelope: structuredClone(recordedEnvelope),
        });
        strict_1.default.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(first), (0, source_contracts_js_1.taskMapContractCanonicalJson)(second));
        strict_1.default.equal(first.proposals[0].title, "Replay Stable Root");
        strict_1.default.equal(first.titleGeneration?.source, "recorded_replay");
        strict_1.default.equal(first.titleGeneration?.transport, "gemini-remote");
        strict_1.default.equal(first.titleGeneration?.model, "recorded-title-model");
        strict_1.default.match(first.titleGeneration?.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
        strict_1.default.match(first.titleGeneration?.outputDigest ?? "", /^[a-f0-9]{64}$/);
        const otherModel = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            recordedTitleEnvelope: {
                ...recordedEnvelope,
                model: "recorded-title-model-v2",
            },
        });
        strict_1.default.equal(otherModel.proposals[0].title, first.proposals[0].title);
        strict_1.default.notEqual(otherModel.proposalSetDigest, first.proposalSetDigest);
    });
    (0, node_test_1.it)("fails closed on every tampered recorded title-envelope binding", async () => {
        const nodes = [node("tamper-a", "Tamper stable title")];
        const memberNodeIds = ["tamper-a"];
        const calls = [];
        const outputJson = titleBatch([{
                baseRootProposalId: baseRootId(memberNodeIds),
                title: "Tamper Stable Title",
            }]);
        const input = {
            graphOutput: graph([community(memberNodeIds)], 1),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
        };
        await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            ...input,
            llmStation: station(outputJson, calls),
        });
        const valid = {
            stationId: "community-title-v1",
            model: "recorded-title-model",
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(calls[0].promptText),
            inputDigest: calls[0].inputDigest,
            outputJson,
            producedAt: OCCURRED_AT,
            transport: "gemini-remote",
        };
        const tampered = [
            { ...valid, stationId: "community-grouping-v1" },
            { ...valid, inputDigest: digest("wrong-input") },
            { ...valid, promptDigest: digest("wrong-prompt") },
            { ...valid, transport: "unsafe-transport" },
            { ...valid, model: "/private/model" },
            { ...valid, model: "sk-proj-abcdefghijklmnop" },
            { ...valid, producedAt: "2026-08-16T05:00:00-07:00" },
            { ...valid, outputJson: '{"titles":[{"baseRootProposalId":"unknown","title":"Wrong"}]}' },
        ];
        for (const recordedTitleEnvelope of tampered) {
            await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
                ...input,
                recordedTitleEnvelope,
            }), /recorded title envelope/i);
        }
    });
    (0, node_test_1.it)("fails closed when a new base ID collides with an unmatched historical root", async () => {
        const nodes = [node("collision-current")];
        const collidingId = baseRootId(["collision-current"]);
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community(["collision-current"])], 1),
            ...boundLookup(nodes),
            previousAcceptedRoots: [{
                    rootProposalId: collidingId,
                    memberNodeIds: ["different-history-member"],
                }],
        }), /base ID collides with an unmatched historical root/);
    });
    (0, node_test_1.it)("fails closed on every previous-root budget before title generation", async () => {
        const calls = [];
        const base = {
            graphOutput: graph([community(["bounded-current"])], 1),
            ...boundLookup([node("bounded-current")]),
            llmStation: station('{"titles":[]}', calls),
        };
        const countOverflow = Array.from({ length: community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots + 1 }, (_, index) => ({
            rootProposalId: `count-root-${index}`,
            memberNodeIds: [`count-member-${index}`],
        }));
        const perRootOverflow = [{
                rootProposalId: "per-root-overflow",
                memberNodeIds: Array.from({
                    length: community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                        .maxMembersPerPreviousRoot + 1,
                }, (_, index) => `per-root-member-${index}`),
            }];
        const aggregateOverflow = [];
        let aggregateMember = 0;
        while (aggregateMember
            <= community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal) {
            const memberNodeIds = Array.from({
                length: Math.min(community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                    .maxMembersPerPreviousRoot, community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                    .maxPreviousMembersTotal + 1 - aggregateMember),
            }, () => `aggregate-member-${aggregateMember++}`);
            aggregateOverflow.push({
                rootProposalId: `aggregate-root-${aggregateOverflow.length}`,
                memberNodeIds,
            });
        }
        const byteHeavyMembers = Array.from({
            length: community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                .maxPreviousMembersTotal,
        }, (_, index) => {
            const prefix = `byte-member-${String(index).padStart(4, "0")}-`;
            return `${prefix}${"x".repeat(300 - prefix.length)}`;
        });
        const byteOverflow = [];
        for (let offset = 0; offset < byteHeavyMembers.length; offset += community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
            .maxMembersPerPreviousRoot) {
            byteOverflow.push({
                rootProposalId: `byte-root-${byteOverflow.length}`,
                memberNodeIds: byteHeavyMembers.slice(offset, offset + community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                    .maxMembersPerPreviousRoot),
            });
        }
        for (const [previousAcceptedRoots, expected] of [
            [countOverflow, /previousAcceptedRoots exceeds its count limit/],
            [perRootOverflow, /previous root exceeds its member limit/],
            [aggregateOverflow, /previous roots exceed their aggregate member limit/],
            [byteOverflow, /previous roots exceed their canonical byte limit/],
        ]) {
            await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
                ...base,
                previousAcceptedRoots,
            }), expected);
        }
        strict_1.default.equal(calls.length, 0);
    });
    (0, node_test_1.it)("fails closed when canonical proposal output exceeds its byte budget", async () => {
        const nodes = Array.from({ length: 200 }, (_, index) => {
            const prefix = `output-node-${String(index).padStart(3, "0")}-`;
            return node(`${prefix}${"n".repeat(500 - prefix.length)}`, `Output byte fixture ${index}`);
        });
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph(nodes.map((candidate) => community([candidate.nodeId])), nodes.length),
            ...boundLookup(nodes),
            previousAcceptedRoots: nodes.map((candidate, index) => ({
                rootProposalId: `accepted-output-${index}`,
                memberNodeIds: [candidate.nodeId],
            })),
        }), /proposal output exceeds its canonical byte limit/);
    });
    (0, node_test_1.it)("binds a canonical privacy-safe node lookup and rejects mutation or text overflow at entry", async () => {
        const mutable = node("digest-bound-node", "Bound lookup from /Users/neo/private with password=first-secret");
        const binding = boundLookup([mutable]);
        mutable.text = "Mutated title evidence";
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community([mutable.nodeId])], 1),
            ...binding,
            previousAcceptedRoots: [],
        }), /nodeLookupDigest does not match/);
        for (const [text, expected] of [
            ["x".repeat(481), /node text exceeds its character limit/],
        ]) {
            const oversized = node("oversized-node", text);
            await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
                graphOutput: graph([community([oversized.nodeId])], 1),
                nodeLookup: lookup([oversized]),
                nodeLookupDigest: digest("fabricated-node-lookup"),
                previousAcceptedRoots: [],
            }), expected);
        }
        const utf8Boundary = node("utf8-boundary", "界".repeat(480));
        const boundaryResult = await (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([community([utf8Boundary.nodeId])], 1),
            ...boundLookup([utf8Boundary]),
            previousAcceptedRoots: [],
        });
        strict_1.default.equal(boundaryResult.proposals.length, 1);
    });
    (0, node_test_1.it)("binds every exact node field including embedding and delegates fabricated-row rejection to A1", async () => {
        const embedding = Array(768).fill(0);
        embedding[0] = 1;
        const original = {
            ...node("all-fields-node", "All fields title", "calendar"),
            externalRefs: [digest("all-fields-ref")],
            embedding,
        };
        const originalBinding = boundLookup([original]);
        const mutations = [
            { ...original, nodeId: "all-fields-node-mutated" },
            { ...original, text: "All fields title mutated" },
            { ...original, sourceFamily: "meeting" },
            { ...original, routingDigest: digest("mutated-routing") },
            { ...original, occurredAt: "2026-08-15T12:00:00.000Z" },
            { ...original, externalRefs: [digest("mutated-ref")] },
            {
                ...original,
                embedding: original.embedding.map((coordinate, index) => index === 0 ? coordinate + 0.25 : coordinate),
            },
            { ...original, isCalendarCommitment: true },
        ];
        for (const mutated of mutations) {
            await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
                graphOutput: graph([community([original.nodeId])], 1),
                nodeLookup: lookup([mutated]),
                nodeLookupDigest: originalBinding.nodeLookupDigest,
                previousAcceptedRoots: [],
            }), /nodeLookupDigest does not match/);
        }
        const invalidRows = [
            { ...original, routingDigest: "not-a-digest" },
            { ...original, occurredAt: "yesterday" },
            { ...original, externalRefs: ["https://example.com/private"] },
            { ...original, embedding: [1] },
            {
                ...original,
                embedding: original.embedding.map((coordinate, index) => index === 1 ? Number.NaN : coordinate),
            },
            {
                ...original,
                sourceFamily: "agent",
                isCalendarCommitment: true,
            },
            { ...original, nodeId: "lone-surrogate-\uD800" },
        ];
        for (const invalid of invalidRows) {
            strict_1.default.throws(() => (0, community_root_proposals_js_1.taskMapCommunityRootNodeLookupDigest)(lookup([invalid])), /Task Map community graph brain/);
        }
        const extraField = {
            ...original,
            unexpected: true,
        };
        strict_1.default.throws(() => (0, community_root_proposals_js_1.taskMapCommunityRootNodeLookupDigest)(lookup([extraField])), /Task Map community graph brain/);
    });
    (0, node_test_1.it)("rejects duplicate base root proposal identities before matching or titles", async () => {
        const nodes = [node("duplicate-base-member")];
        const calls = [];
        await strict_1.default.rejects(() => (0, community_root_proposals_js_1.buildTaskMapCommunityRootProposals)({
            graphOutput: graph([
                community(["duplicate-base-member"]),
                community(["duplicate-base-member"]),
            ], 1),
            ...boundLookup(nodes),
            previousAcceptedRoots: [],
            llmStation: station('{"titles":[]}', calls),
        }), /duplicate baseRootProposalId/);
        strict_1.default.equal(calls.length, 0);
    });
});
