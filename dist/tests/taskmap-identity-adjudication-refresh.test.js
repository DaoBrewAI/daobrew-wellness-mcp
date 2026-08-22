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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const identity_adjudication_refresh_js_1 = require("../src/engine/taskmap/identity-adjudication-refresh.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const OWNER = "a".repeat(64);
const INPUT = "b".repeat(64);
function vector(similarity, index = 0) {
    const values = new Array(768).fill(0);
    values[index] = similarity;
    values[(index + 1) % 768] = Math.sqrt(Math.max(0, 1 - similarity ** 2));
    return values;
}
function pairProvider(similarity) {
    return {
        embed: async (texts) => texts.map((_text, index) => index === 0 ? vector(1) : vector(similarity)),
    };
}
function station(verdict) {
    return {
        provider: {
            transport: "gemini-remote",
            executable: "",
            args: [],
            model: "gemini-fixture",
        },
        async run(request) {
            const prompt = JSON.parse(request.promptText);
            return {
                stationId: "identity-adjudication-v1",
                model: "gemini-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({
                    verdicts: prompt.pairs.map(({ pairId }) => ({ pairId, verdict })),
                }),
                producedAt: "2026-08-17T12:00:00.000Z",
                transport: "gemini-remote",
            };
        },
    };
}
async function fixture() {
    const root = await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-identity-refresh-"));
    const taskMapRoot = node_path_1.default.join(root, "taskmap");
    await (0, promises_1.mkdir)(taskMapRoot, { recursive: true, mode: 0o700 });
    return {
        root,
        taskMapRoot,
        cleanup: () => (0, promises_1.rm)(root, { recursive: true, force: true }),
    };
}
const CANDIDATES = [
    { candidateId: "a", rootId: "root", text: "ship the billing fix" },
    { candidateId: "b", rootId: "root", text: "finish the billing correction" },
];
(0, node_test_1.describe)("Task Map Station-2 identity adjudication refresh", () => {
    (0, node_test_1.it)("persists proposal-only output and replays byte-identically without providers", async () => {
        const f = await fixture();
        let stationCalls = 0;
        try {
            const first = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: INPUT,
                candidates: CANDIDATES,
                embeddingProvider: pairProvider(0.9),
                embeddingModelId: "gemini-embedding-001",
                createStation: async () => {
                    stationCalls += 1;
                    return station("same_work");
                },
            });
            const artifactPath = (0, identity_adjudication_refresh_js_1.taskMapIdentityAdjudicationRefreshPath)(f.taskMapRoot, INPUT);
            const firstBytes = await (0, promises_1.readFile)(artifactPath, "utf8");
            assert.equal(first.state, "current");
            assert.equal(first.pendingCount, 0);
            assert.equal(first.result.mergeCandidates.length, 1);
            assert.deepEqual(first.result.authority, {
                mergeApplied: false,
                aliasesWritten: false,
                requiresOwnerAcceptance: true,
            });
            assert.equal(firstBytes.includes("aliasesWritten\":false"), true);
            const replayed = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: INPUT,
                candidates: CANDIDATES,
                embeddingProvider: { embed: async () => { throw new Error("no embed"); } },
                embeddingModelId: "gemini-embedding-001",
                createStation: async () => {
                    throw new Error("no station");
                },
            });
            assert.deepEqual(replayed, first);
            assert.equal(await (0, promises_1.readFile)(artifactPath, "utf8"), firstBytes);
            assert.equal(stationCalls, 1);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("seals embedding failure as unavailable with no pairs or station call", async () => {
        const f = await fixture();
        let stationCalls = 0;
        try {
            const result = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: "c".repeat(64),
                candidates: CANDIDATES,
                embeddingProvider: { embed: async () => { throw new Error("offline"); } },
                embeddingModelId: "gemini-embedding-001",
                createStation: async () => {
                    stationCalls += 1;
                    return station("same_work");
                },
            });
            assert.equal(result.state, "unavailable");
            assert.equal(result.degradationCode, "embedding_provider_failed");
            assert.deepEqual(result.proposal.pairs, []);
            assert.deepEqual(result.result.pairs, []);
            assert.equal(result.result.authority.aliasesWritten, false);
            assert.equal(stationCalls, 0);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("spends nothing when projection extraction yields fewer than two candidates", async () => {
        const f = await fixture();
        let embeddingCalls = 0;
        let stationCalls = 0;
        try {
            const result = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: "9".repeat(64),
                candidates: [],
                embeddingProvider: {
                    embed: async () => {
                        embeddingCalls += 1;
                        return [];
                    },
                },
                embeddingModelId: "gemini-embedding-001",
                createStation: async () => {
                    stationCalls += 1;
                    return station("same_work");
                },
            });
            assert.equal(result.state, "current");
            assert.equal(result.proposal.candidateCount, 0);
            assert.deepEqual(result.result.pairs, []);
            assert.equal(embeddingCalls, 0);
            assert.equal(stationCalls, 0);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("persists deferred LLM pairs and retries them on the next refresh", async () => {
        const f = await fixture();
        let attempts = 0;
        try {
            const input = {
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: "d".repeat(64),
                candidates: CANDIDATES,
                embeddingProvider: pairProvider(0.9),
                embeddingModelId: "gemini-embedding-001",
            };
            const deferred = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                ...input,
                createStation: async () => {
                    attempts += 1;
                    throw new Error("station unavailable");
                },
            });
            assert.equal(deferred.state, "deferred");
            assert.equal(deferred.pendingCount, 1);
            assert.equal(deferred.result.pairs[0]?.deferredReason, "llm_station_unavailable");
            const recovered = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                ...input,
                createStation: async () => {
                    attempts += 1;
                    return station("different_work");
                },
            });
            assert.equal(attempts, 2);
            assert.equal(recovered.state, "current");
            assert.equal(recovered.pendingCount, 0);
            assert.equal(recovered.result.pairs[0]?.adjudication, "different_work");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("bounds each refresh to 32 adjudicated pairs and defers the excess", async () => {
        const f = await fixture();
        const candidates = Array.from({ length: 12 }, (_unused, index) => ({
            candidateId: `candidate-${index}`,
            rootId: "root",
            text: `same task ${index}`,
        }));
        try {
            const result = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: f.taskMapRoot,
                ownerScopeDigest: OWNER,
                inputDigest: "e".repeat(64),
                candidates,
                embeddingProvider: {
                    embed: async (texts) => texts.map(() => vector(1)),
                },
                embeddingModelId: "gemini-embedding-001",
                createStation: async () => station("same_work"),
            });
            assert.equal(result.result.pairs.length, 66);
            assert.equal(result.result.pairs.filter((pair) => pair.adjudication !== "deferred").length, 32);
            assert.equal(result.pendingCount, 34);
            assert.equal(result.state, "deferred");
            assert.equal(result.result.authority.aliasesWritten, false);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("extracts bounded work text and real roots from projection tasks while dropping digest-only text", () => {
        const digestOnly = "f".repeat(64);
        const projection = {
            tasks: [{
                    id: "task-b",
                    rootId: "root-b",
                    title: "Ship the billing fix",
                    summary: "Finish the accepted billing correction.",
                }, {
                    id: "task-digest",
                    rootId: "root-digest",
                    title: digestOnly,
                    summary: digestOnly,
                }, {
                    id: "task-a",
                    rootId: "root-a",
                    title: "Prepare launch notes",
                    summary: "s".repeat(700),
                }],
        };
        const candidates = (0, identity_adjudication_refresh_js_1.taskMapIdentityCandidatesFromProjection)(projection);
        assert.deepEqual(candidates.map(({ candidateId, rootId }) => ({ candidateId, rootId })), [
            { candidateId: "task-a", rootId: "root-a" },
            { candidateId: "task-b", rootId: "root-b" },
        ]);
        assert.equal(candidates.find(({ candidateId }) => candidateId === "task-b")?.text, "Ship the billing fix\nFinish the accepted billing correction.");
        assert.ok(candidates.every((candidate) => candidate.text.length <= 512));
        assert.ok(candidates.every((candidate) => !/^[a-f0-9]{64}$/.test(candidate.text)));
    });
});
