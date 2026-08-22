"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const identity_adjudication_proposal_js_1 = require("../src/engine/taskmap/identity-adjudication-proposal.js");
const llm_station_js_1 = require("../src/engine/taskmap/llm-station.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
function paddedVector(values) {
    node_assert_1.strict.ok(values.length <= identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions);
    return [
        ...values,
        ...Array(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions
            - values.length).fill(0),
    ];
}
function fixedProvider(vectors) {
    return {
        embed: async (texts) => texts.map((text) => {
            const vector = vectors[text];
            if (vector === undefined)
                throw new Error(`no fixture vector: ${text}`);
            return paddedVector(vector);
        }),
    };
}
function buildTaskMapIdentityAdjudicationProposals(input) {
    return (0, identity_adjudication_proposal_js_1.buildTaskMapIdentityAdjudicationProposals)({
        ...input,
        embeddingModelId: "fixture-embedding-v1",
    });
}
(0, node_test_1.describe)("Task Map Station-2 blocking", () => {
    (0, node_test_1.it)("publishes the frozen version, limits, and embedding policy", () => {
        node_assert_1.strict.equal(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_VERSION, "taskmap-identity-adjudication.v1");
        node_assert_1.strict.deepEqual(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1, {
            maxCandidates: 512,
            maxPairs: 2_048,
            maxTextCharacters: 512,
        });
        node_assert_1.strict.equal(Object.isFrozen(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1), true);
        node_assert_1.strict.deepEqual(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1, {
            blockThreshold: 0.82,
            autoBand: 0.95,
            embeddingDimensions: 768,
            similarity: "cosine_dot_product_l2_normalized",
        });
        node_assert_1.strict.equal(Object.isFrozen(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1), true);
    });
    (0, node_test_1.it)("proposes only same-root pairs at or above the threshold and never merges", async () => {
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "a", rootId: "r1", text: "ship the billing fix" },
                { candidateId: "b", rootId: "r1", text: "ship billing fix" },
                { candidateId: "c", rootId: "r1", text: "write the launch post" },
                { candidateId: "d", rootId: "r1", text: "slightly similar billing" },
            ],
            embeddingProvider: fixedProvider({
                "ship the billing fix": [2, 0],
                "ship billing fix": [4, 0],
                "write the launch post": [0, 3],
                "slightly similar billing": [0.81, Math.sqrt(1 - 0.81 ** 2)],
            }),
            inputDigest: "a".repeat(64),
        });
        node_assert_1.strict.equal(result.blockingState, "current");
        node_assert_1.strict.equal(result.unavailableReason, null);
        node_assert_1.strict.equal(result.pairs.length, 1);
        node_assert_1.strict.deepEqual(result.pairs[0], {
            pairId: result.pairs[0].pairId,
            leftCandidateId: "a",
            rightCandidateId: "b",
            rootId: "r1",
            similarity: 1,
            confidence: "high",
        });
        node_assert_1.strict.match(result.pairs[0].pairId, /^tmidentitypair_[a-f0-9]{64}$/);
        node_assert_1.strict.equal(result.authority.mergeApplied, false);
        node_assert_1.strict.equal(result.authority.aliasesWritten, false);
        node_assert_1.strict.equal(result.authority.requiresOwnerAcceptance, true);
        node_assert_1.strict.equal(result.embeddingModelId, "fixture-embedding-v1");
        node_assert_1.strict.deepEqual(result.evidenceManifest, [
            {
                candidateId: "a",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("ship the billing fix"),
            },
            {
                candidateId: "b",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("ship billing fix"),
            },
            {
                candidateId: "c",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("write the launch post"),
            },
            {
                candidateId: "d",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("slightly similar billing"),
            },
        ]);
        node_assert_1.strict.deepEqual(result.privacy, {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        });
    });
    (0, node_test_1.it)("is order-independent and normalizes each pair to sorted candidate ids", async () => {
        const vectors = {
            "alpha task": [1, 0],
            "alpha task copy": [0.99, 0.141],
        };
        const forward = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "x", rootId: "r1", text: "alpha task" },
                { candidateId: "y", rootId: "r1", text: "alpha task copy" },
            ],
            embeddingProvider: fixedProvider(vectors),
            inputDigest: "b".repeat(64),
        });
        const reversed = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "y", rootId: "r1", text: "alpha task copy" },
                { candidateId: "x", rootId: "r1", text: "alpha task" },
            ],
            embeddingProvider: fixedProvider(vectors),
            inputDigest: "b".repeat(64),
        });
        node_assert_1.strict.equal(forward.artifactDigest, reversed.artifactDigest);
        node_assert_1.strict.deepEqual([forward.pairs[0].leftCandidateId, forward.pairs[0].rightCandidateId], ["x", "y"]);
        node_assert_1.strict.equal(forward.pairs[0].confidence, "high");
    });
    (0, node_test_1.it)("emits zero pairs and an explicit sealed state when embeddings are unavailable", async () => {
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "a", rootId: "r1", text: "one" },
                { candidateId: "b", rootId: "r1", text: "two" },
            ],
            embeddingProvider: {
                embed: async () => { throw new Error("network down"); },
            },
            inputDigest: "c".repeat(64),
        });
        node_assert_1.strict.equal(result.blockingState, "unavailable");
        node_assert_1.strict.deepEqual(result.pairs, []);
        node_assert_1.strict.deepEqual(result.crossRootFlagged, []);
        node_assert_1.strict.equal(result.unavailableReason, "embedding_provider_failed");
        node_assert_1.strict.deepEqual(result.evidenceManifest, [
            {
                candidateId: "a",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("one"),
            },
            {
                candidateId: "b",
                rootId: "r1",
                textDigest: (0, source_contracts_js_1.taskMapContractDigest)("two"),
            },
        ]);
        node_assert_1.strict.match(result.artifactDigest, /^[a-f0-9]{64}$/);
    });
    (0, node_test_1.it)("flags cross-root pairs instead of proposing them", async () => {
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "z", rootId: "r2", text: "same words" },
                { candidateId: "a", rootId: "r1", text: "same words" },
            ],
            embeddingProvider: fixedProvider({ "same words": [1, 0] }),
            inputDigest: "d".repeat(64),
        });
        node_assert_1.strict.deepEqual(result.pairs, []);
        node_assert_1.strict.equal(result.crossRootFlagged.length, 1);
        node_assert_1.strict.deepEqual([
            result.crossRootFlagged[0].leftCandidateId,
            result.crossRootFlagged[0].rightCandidateId,
        ], ["a", "z"]);
    });
    (0, node_test_1.it)("sorts proposal output by normalized candidate pair", async () => {
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "c", rootId: "r1", text: "copy c" },
                { candidateId: "a", rootId: "r1", text: "copy a" },
                { candidateId: "b", rootId: "r1", text: "copy b" },
            ],
            embeddingProvider: fixedProvider({
                "copy a": [1, 0],
                "copy b": [1, 0],
                "copy c": [1, 0],
            }),
            inputDigest: "1".repeat(64),
        });
        node_assert_1.strict.deepEqual(result.pairs.map((pair) => [
            pair.leftCandidateId,
            pair.rightCandidateId,
        ]), [["a", "b"], ["a", "c"], ["b", "c"]]);
    });
    (0, node_test_1.it)("accepts an EmbeddingProvider implemented as a class instance", async () => {
        class FixtureProvider {
            async embed(texts) {
                return texts.map(() => paddedVector([1, 0]));
            }
        }
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "a", rootId: "r1", text: "one" },
                { candidateId: "b", rootId: "r1", text: "two" },
            ],
            embeddingProvider: new FixtureProvider(),
            inputDigest: "2".repeat(64),
        });
        node_assert_1.strict.equal(result.blockingState, "current");
        node_assert_1.strict.equal(result.pairs.length, 1);
    });
    (0, node_test_1.it)("fails closed when a provider returns vectors outside the frozen width", async () => {
        const result = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "a", rootId: "r1", text: "one" },
                { candidateId: "b", rootId: "r1", text: "two" },
            ],
            embeddingProvider: {
                embed: async (texts) => texts.map(() => [1, 0]),
            },
            inputDigest: "3".repeat(64),
        });
        node_assert_1.strict.equal(result.blockingState, "unavailable");
        node_assert_1.strict.equal(result.unavailableReason, "embedding_provider_failed");
        node_assert_1.strict.deepEqual(result.pairs, []);
        node_assert_1.strict.deepEqual(result.crossRootFlagged, []);
        node_assert_1.strict.match(result.artifactDigest, /^[a-f0-9]{64}$/);
    });
    (0, node_test_1.it)("applies the block and confidence thresholds at their exact boundaries", async () => {
        const cases = [
            {
                similarity: identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold,
                confidence: "ambiguous",
                inputDigest: "4".repeat(64),
            },
            {
                similarity: identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand,
                confidence: "high",
                inputDigest: "5".repeat(64),
            },
            {
                similarity: identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand - 0.000_001,
                confidence: "ambiguous",
                inputDigest: "6".repeat(64),
            },
        ];
        for (const boundary of cases) {
            const result = await buildTaskMapIdentityAdjudicationProposals({
                candidates: [
                    { candidateId: "a", rootId: "r1", text: "baseline" },
                    { candidateId: "b", rootId: "r1", text: "boundary" },
                ],
                embeddingProvider: fixedProvider({
                    baseline: [1, 0],
                    boundary: [
                        boundary.similarity,
                        Math.sqrt(1 - boundary.similarity ** 2),
                    ],
                }),
                inputDigest: boundary.inputDigest,
            });
            node_assert_1.strict.equal(result.pairs.length, 1);
            node_assert_1.strict.equal(result.pairs[0].similarity, boundary.similarity);
            node_assert_1.strict.equal(result.pairs[0].confidence, boundary.confidence);
        }
    });
    (0, node_test_1.it)("seals malformed provider output as unavailable", async () => {
        const valid = paddedVector([1, 0]);
        const malformedProviders = [
            { embed: async () => [valid] },
            { embed: async () => [valid, [1, 0]] },
            { embed: async () => [valid, paddedVector([Number.NaN, 0])] },
            { embed: async () => [valid, paddedVector([0, 0])] },
        ];
        for (let index = 0; index < malformedProviders.length; index += 1) {
            const result = await buildTaskMapIdentityAdjudicationProposals({
                candidates: [
                    { candidateId: "a", rootId: "r1", text: "one" },
                    { candidateId: "b", rootId: "r1", text: "two" },
                ],
                embeddingProvider: malformedProviders[index],
                inputDigest: (index + 7).toString(16).repeat(64),
            });
            node_assert_1.strict.equal(result.blockingState, "unavailable");
            node_assert_1.strict.equal(result.unavailableReason, "embedding_provider_failed");
            node_assert_1.strict.deepEqual(result.pairs, []);
            node_assert_1.strict.deepEqual(result.crossRootFlagged, []);
            node_assert_1.strict.match(result.artifactDigest, /^[a-f0-9]{64}$/);
        }
    });
    (0, node_test_1.it)("validates bounded input before calling the embedding provider", async () => {
        let providerCalls = 0;
        const provider = {
            embed: async (_texts) => {
                providerCalls += 1;
                return [];
            },
        };
        const tooMany = Array.from({ length: identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates + 1 }, (_unused, index) => ({
            candidateId: `c${index}`, rootId: "r1", text: `t${index}`,
        }));
        await node_assert_1.strict.rejects(() => buildTaskMapIdentityAdjudicationProposals({
            candidates: tooMany,
            embeddingProvider: provider,
            inputDigest: "e".repeat(64),
        }), /bounded/);
        await node_assert_1.strict.rejects(() => buildTaskMapIdentityAdjudicationProposals({
            candidates: [{
                    candidateId: "a",
                    rootId: "r1",
                    text: "x".repeat(identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters + 1),
                }],
            embeddingProvider: provider,
            inputDigest: "f".repeat(64),
        }), /bounded/);
        node_assert_1.strict.equal(providerCalls, 0);
    });
    (0, node_test_1.it)("requires explicit bounded embedding-model provenance before calling the provider", async () => {
        let providerCalls = 0;
        const base = {
            candidates: [{ candidateId: "a", rootId: "r1", text: "one" }],
            embeddingProvider: {
                embed: async () => {
                    providerCalls += 1;
                    return [paddedVector([1, 0])];
                },
            },
            inputDigest: "9".repeat(64),
        };
        await node_assert_1.strict.rejects(() => (0, identity_adjudication_proposal_js_1.buildTaskMapIdentityAdjudicationProposals)({
            ...base,
        }), /embedding model/i);
        await node_assert_1.strict.rejects(() => (0, identity_adjudication_proposal_js_1.buildTaskMapIdentityAdjudicationProposals)({
            ...base,
            embeddingModelId: "bad\nmodel",
        }), /embedding model/i);
        node_assert_1.strict.equal(providerCalls, 0);
    });
});
async function adjudicationFixture(confidence = "ambiguous") {
    const similarity = confidence === "ambiguous" ? 0.9 : 1;
    const candidates = [
        { candidateId: "a", rootId: "r1", text: "ship the billing fix" },
        { candidateId: "b", rootId: "r1", text: "finish billing correction" },
    ];
    const proposals = await buildTaskMapIdentityAdjudicationProposals({
        candidates,
        embeddingProvider: fixedProvider({
            "ship the billing fix": [1, 0],
            "finish billing correction": [
                similarity,
                Math.sqrt(1 - similarity ** 2),
            ],
        }),
        inputDigest: (confidence === "ambiguous" ? "a" : "b").repeat(64),
    });
    node_assert_1.strict.equal(proposals.pairs[0].confidence, confidence);
    const candidateEvidence = candidates.map(({ candidateId, text }) => ({
        candidateId,
        text,
    }));
    return { candidateEvidence, proposals, pairId: proposals.pairs[0].pairId };
}
(0, node_test_1.describe)("Task Map Station-2 adjudication", () => {
    (0, node_test_1.it)("publishes all bounded station ids without changing the Station-1 literal", () => {
        node_assert_1.strict.equal(llm_station_js_1.LLM_STATION_ID, "mention-extraction-v1");
        node_assert_1.strict.deepEqual(llm_station_js_1.LLM_STATION_IDS, [
            "mention-extraction-v1",
            "identity-adjudication-v1",
            "task-decomposition-v1",
            "community-grouping-v1",
            "community-title-v1",
            "community-task-extraction-v1",
        ]);
        node_assert_1.strict.equal(Object.isFrozen(llm_station_js_1.LLM_STATION_IDS), true);
    });
    (0, node_test_1.it)("runs identity-adjudication-v1 through the generalized fixed-provider station", async () => {
        let calls = 0;
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: (candidate) => candidate === "/Users/owner/.local/bin/claude",
            runner: async () => {
                calls += 1;
                return calls === 1
                    ? { stdout: JSON.stringify({ loggedIn: true }), stderr: "", exitCode: 0 }
                    : {
                        stdout: JSON.stringify({
                            type: "result",
                            subtype: "success",
                            result: JSON.stringify({ verdicts: [] }),
                        }),
                        stderr: "",
                        exitCode: 0,
                    };
            },
            clock: () => new Date("2026-08-14T12:00:00.000Z"),
        });
        const envelope = await station.run({
            stationId: "identity-adjudication-v1",
            promptText: "bounded prompt",
            inputDigest: "8".repeat(64),
        });
        node_assert_1.strict.equal(calls, 2);
        node_assert_1.strict.equal(envelope.stationId, "identity-adjudication-v1");
        node_assert_1.strict.equal(envelope.promptDigest, (0, source_contracts_js_1.taskMapContractDigest)("bounded prompt"));
    });
    (0, node_test_1.it)("adjudicates ambiguous pairs to same_work and still never merges automatically", async () => {
        const fixture = await adjudicationFixture();
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => ({
                stdout: JSON.stringify({
                    verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                }),
                stderr: "",
                exitCode: 0,
            }),
        });
        node_assert_1.strict.equal(result.pairs[0].adjudication, "same_work");
        node_assert_1.strict.equal(result.pairs[0].adjudicationSource, "llm_identity_adjudication");
        node_assert_1.strict.equal(result.mergeCandidates.length, 1);
        node_assert_1.strict.equal(result.authority.mergeApplied, false);
        node_assert_1.strict.equal(result.authority.aliasesWritten, false);
        node_assert_1.strict.equal(result.authority.requiresOwnerAcceptance, true);
        node_assert_1.strict.deepEqual(result.embedding, {
            modelId: "fixture-embedding-v1",
            dimensions: 768,
            similarity: "cosine_dot_product_l2_normalized",
            blockThreshold: 0.82,
            autoBand: 0.95,
        });
        node_assert_1.strict.deepEqual(result.llm, {
            invocationState: "invoked",
            stationId: "identity-adjudication-v1",
            modelId: "fixture-offline-llm-v1",
            transport: "injected-offline",
            promptDigest: result.llm.promptDigest,
        });
    });
    (0, node_test_1.it)("uses a high-level station request and records its real model provenance", async () => {
        const fixture = await adjudicationFixture();
        let stationRequest;
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            station: {
                provider: {
                    transport: "claude-cli",
                    executable: "/fixture/claude",
                    args: [],
                    model: "configured-model",
                },
                run: async (request) => {
                    stationRequest = request;
                    return {
                        stationId: "identity-adjudication-v1",
                        model: "real-station-model-v1",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({
                            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                        }),
                        producedAt: "2026-08-14T12:00:00.000Z",
                        transport: "claude-cli",
                    };
                },
            },
        });
        node_assert_1.strict.equal(stationRequest?.stationId, "identity-adjudication-v1");
        node_assert_1.strict.equal(stationRequest?.inputDigest, fixture.proposals.inputDigest);
        node_assert_1.strict.match(stationRequest?.promptText ?? "", /ship the billing fix/);
        node_assert_1.strict.deepEqual(result.llm, {
            invocationState: "invoked",
            stationId: "identity-adjudication-v1",
            modelId: "real-station-model-v1",
            transport: "claude-cli",
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(stationRequest?.promptText ?? ""),
        });
    });
    (0, node_test_1.it)("accepts matching gemini-remote metadata deterministically", async () => {
        const fixture = await adjudicationFixture();
        const station = {
            provider: {
                transport: "gemini-remote",
                executable: "",
                args: [],
                model: "gemini-remote",
            },
            run: async (request) => ({
                stationId: "identity-adjudication-v1",
                model: "gemini-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: ' {"verdicts":[{"pairId":"' + fixture.pairId
                    + '","verdict":"same_work"}]} ',
                producedAt: "2026-08-14T12:00:00.000Z",
                transport: "gemini-remote",
            }),
        };
        const run = () => (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            station,
        });
        const first = await run();
        const replayed = await run();
        node_assert_1.strict.equal(first.pairs[0]?.adjudication, "same_work");
        node_assert_1.strict.equal(first.llm.transport, "gemini-remote");
        node_assert_1.strict.equal(first.llm.modelId, "gemini-fixture");
        node_assert_1.strict.deepEqual(replayed, first);
    });
    (0, node_test_1.it)("keeps unknown station transports invalid for live identity adjudication", async () => {
        const fixture = await adjudicationFixture();
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            station: {
                provider: {
                    transport: "local-rules",
                    executable: "builtin",
                    args: [],
                    model: "local-rules-v1",
                },
                run: async (request) => ({
                    stationId: "identity-adjudication-v1",
                    model: "local-rules-v1",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({ verdicts: [] }),
                    producedAt: "2026-08-14T12:00:00.000Z",
                    transport: "local-rules",
                }),
            },
        });
        node_assert_1.strict.equal(result.llm.invocationState, "unavailable");
        node_assert_1.strict.equal(result.llm.transport, null);
    });
    (0, node_test_1.it)("defers ambiguous pairs when a station envelope does not match the request", async () => {
        const fixture = await adjudicationFixture();
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            station: {
                provider: {
                    transport: "codex-cli",
                    executable: "/fixture/codex",
                    args: [],
                    model: "configured-model",
                },
                run: async (request) => ({
                    stationId: "identity-adjudication-v1",
                    model: "real-station-model-v1",
                    promptDigest: "0".repeat(64),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                    }),
                    producedAt: "2026-08-14T12:00:00.000Z",
                    transport: "codex-cli",
                }),
            },
        });
        node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
        node_assert_1.strict.equal(result.llm.invocationState, "unavailable");
        node_assert_1.strict.equal(result.llm.modelId, null);
        node_assert_1.strict.equal(result.llm.transport, null);
    });
    (0, node_test_1.it)("defers when envelope transport disagrees with the selected station provider", async () => {
        const fixture = await adjudicationFixture();
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            station: {
                provider: {
                    transport: "claude-cli",
                    executable: "/fixture/claude",
                    args: [],
                    model: "configured-model",
                },
                run: async (request) => ({
                    stationId: "identity-adjudication-v1",
                    model: "returned-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                    }),
                    producedAt: "2026-08-14T12:00:00.000Z",
                    transport: "codex-cli",
                }),
            },
        });
        node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
        node_assert_1.strict.equal(result.llm.invocationState, "unavailable");
        node_assert_1.strict.equal(result.llm.transport, null);
        node_assert_1.strict.doesNotMatch(JSON.stringify(result), /"transport":"codex-cli"/);
    });
    (0, node_test_1.it)("defers station envelopes with malformed or non-real producedAt values", async () => {
        const fixture = await adjudicationFixture();
        for (const producedAt of [
            "not-a-timestamp",
            "2026-08-14T12:00:00+99:00",
            "2026-02-31T12:00:00.000Z",
        ]) {
            const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
                proposals: fixture.proposals,
                candidateEvidence: fixture.candidateEvidence,
                station: {
                    provider: {
                        transport: "claude-cli",
                        executable: "/fixture/claude",
                        args: [],
                        model: "configured-model",
                    },
                    run: async (request) => ({
                        stationId: "identity-adjudication-v1",
                        model: "returned-model",
                        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                        inputDigest: request.inputDigest,
                        outputJson: JSON.stringify({
                            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                        }),
                        producedAt,
                        transport: "claude-cli",
                    }),
                },
            });
            node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
            node_assert_1.strict.equal(result.llm.invocationState, "unavailable");
            node_assert_1.strict.equal(result.llm.modelId, null);
        }
    });
    (0, node_test_1.it)("requires exactly one station seam and explicit offline model provenance", async () => {
        const fixture = await adjudicationFixture();
        let runnerCalls = 0;
        const runner = async () => {
            runnerCalls += 1;
            return { stdout: "", stderr: "", exitCode: 0 };
        };
        const station = {
            provider: {
                transport: "claude-cli",
                executable: "/fixture/claude",
                args: [],
                model: "configured-model",
            },
            run: async () => { throw new Error("not reached"); },
        };
        for (const invalid of [
            {
                proposals: fixture.proposals,
                candidateEvidence: fixture.candidateEvidence,
                station,
                runner,
                llmModelId: "offline-model",
            },
            {
                proposals: fixture.proposals,
                candidateEvidence: fixture.candidateEvidence,
                runner,
            },
            {
                proposals: fixture.proposals,
                candidateEvidence: fixture.candidateEvidence,
                runner: "not-a-runner",
                llmModelId: "offline-model",
            },
        ]) {
            await node_assert_1.strict.rejects(() => (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)(invalid), /station.*runner|runner seam|model provenance/i);
        }
        node_assert_1.strict.equal(runnerCalls, 0);
    });
    (0, node_test_1.it)("rejects a re-sealed proposal whose derived pair, policy, and authority were forged", async () => {
        const similarity = 0.83;
        const original = await buildTaskMapIdentityAdjudicationProposals({
            candidates: [
                { candidateId: "a", rootId: "r1", text: "original alpha" },
                { candidateId: "b", rootId: "r1", text: "original beta" },
            ],
            embeddingProvider: fixedProvider({
                "original alpha": [1, 0],
                "original beta": [similarity, Math.sqrt(1 - similarity ** 2)],
            }),
            inputDigest: "7".repeat(64),
        });
        node_assert_1.strict.equal(original.pairs[0].confidence, "ambiguous");
        const { artifactDigest: _artifactDigest, ...base } = original;
        const forgedBase = {
            ...base,
            policy: { ...base.policy, autoBand: 0.82 },
            pairs: base.pairs.map((pair) => ({
                ...pair,
                pairId: "attacker_pair_id",
                confidence: "high",
            })),
            authority: {
                mergeApplied: true,
                aliasesWritten: true,
                requiresOwnerAcceptance: false,
            },
        };
        const forged = {
            ...forgedBase,
            artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(forgedBase),
        };
        let runnerCalls = 0;
        await node_assert_1.strict.rejects(() => (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: forged,
            candidateEvidence: [
                { candidateId: "a", text: "original alpha" },
                { candidateId: "b", text: "original beta" },
            ],
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => {
                runnerCalls += 1;
                return { stdout: "", stderr: "", exitCode: 0 };
            },
        }), /proposal|policy|authority/i);
        node_assert_1.strict.equal(runnerCalls, 0);
    });
    (0, node_test_1.it)("defers before the runner when candidate evidence is substituted", async () => {
        const fixture = await adjudicationFixture();
        let runnerCalls = 0;
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: [
                { candidateId: "a", text: "substituted attacker text" },
                { candidateId: "b", text: "finish billing correction" },
            ],
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => {
                runnerCalls += 1;
                return {
                    stdout: JSON.stringify({
                        verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                    }),
                    stderr: "",
                    exitCode: 0,
                };
            },
        });
        node_assert_1.strict.equal(runnerCalls, 0);
        node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
        node_assert_1.strict.equal(result.pairs[0].deferredReason, "llm_station_unavailable");
        node_assert_1.strict.deepEqual(result.mergeCandidates, []);
    });
    (0, node_test_1.it)("does not send high-confidence pairs to the LLM and keeps them owner-gated", async () => {
        const fixture = await adjudicationFixture("high");
        let runnerCalls = 0;
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => {
                runnerCalls += 1;
                throw new Error("high-confidence pairs must not reach the runner");
            },
        });
        node_assert_1.strict.equal(runnerCalls, 0);
        node_assert_1.strict.equal(result.pairs[0].adjudication, "same_work");
        node_assert_1.strict.equal(result.pairs[0].adjudicationSource, "embedding_high_confidence");
        node_assert_1.strict.equal(result.mergeCandidates.length, 1);
        node_assert_1.strict.equal(result.authority.mergeApplied, false);
        node_assert_1.strict.equal(result.authority.requiresOwnerAcceptance, true);
        node_assert_1.strict.deepEqual(result.llm, {
            invocationState: "not_invoked",
            stationId: "identity-adjudication-v1",
            modelId: null,
            transport: null,
            promptDigest: null,
        });
    });
    (0, node_test_1.it)("defers, not guesses, when the injected runner throws", async () => {
        const fixture = await adjudicationFixture();
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => { throw new Error("no provider"); },
        });
        node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
        node_assert_1.strict.equal(result.pairs[0].deferredReason, "llm_station_unavailable");
        node_assert_1.strict.equal(result.mergeCandidates.length, 0);
    });
    (0, node_test_1.it)("replays identical runner output to a byte-identical sealed artifact", async () => {
        const fixture = await adjudicationFixture();
        const recorded = async () => ({
            stdout: JSON.stringify({
                verdicts: [{ pairId: fixture.pairId, verdict: "different_work" }],
            }),
            stderr: "",
            exitCode: 0,
        });
        const once = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: recorded,
        });
        const twice = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: recorded,
        });
        node_assert_1.strict.equal(once.artifactDigest, twice.artifactDigest);
        node_assert_1.strict.deepEqual(once, twice);
    });
    (0, node_test_1.it)("fails closed for malformed, duplicate-key, unknown-pair, and missing verdict output", async () => {
        const fixture = await adjudicationFixture();
        const invalidOutputs = [
            "not json",
            `{"verdicts":[{"pairId":"${fixture.pairId}","verdict":"same_work","verdict":"different_work"}]}`,
            JSON.stringify({
                verdicts: [{ pairId: "unknown_pair", verdict: "same_work" }],
            }),
            JSON.stringify({ verdicts: [] }),
        ];
        for (const stdout of invalidOutputs) {
            const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
                proposals: fixture.proposals,
                candidateEvidence: fixture.candidateEvidence,
                llmModelId: "fixture-offline-llm-v1",
                runner: async () => ({ stdout, stderr: "", exitCode: 0 }),
            });
            node_assert_1.strict.equal(result.pairs[0].adjudication, "deferred");
            node_assert_1.strict.equal(result.pairs[0].deferredReason, "llm_station_unavailable");
            node_assert_1.strict.deepEqual(result.mergeCandidates, []);
        }
    });
    (0, node_test_1.it)("builds a bounded evidence-carrying prompt without persisting candidate text", async () => {
        const fixture = await adjudicationFixture();
        let prompt = "";
        const result = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: fixture.proposals,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: async (request) => {
                prompt = request.stdin;
                return {
                    stdout: JSON.stringify({
                        verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
                    }),
                    stderr: "",
                    exitCode: 0,
                };
            },
        });
        node_assert_1.strict.match(prompt, /ship the billing fix/);
        node_assert_1.strict.match(prompt, /finish billing correction/);
        node_assert_1.strict.match(prompt, new RegExp(fixture.pairId));
        node_assert_1.strict.ok(prompt.length > 0 && prompt.length <= 1_048_576);
        const persisted = JSON.stringify(result);
        node_assert_1.strict.doesNotMatch(persisted, /ship the billing fix/);
        node_assert_1.strict.doesNotMatch(persisted, /finish billing correction/);
        node_assert_1.strict.equal(result.privacy.sourceBodiesStored, false);
    });
    (0, node_test_1.it)("rejects an off-contract proposal pair instead of copying injected source text", async () => {
        const fixture = await adjudicationFixture();
        const { artifactDigest: _artifactDigest, ...base } = fixture.proposals;
        const forgedBase = {
            ...base,
            pairs: base.pairs.map((pair) => ({ ...pair, text: "private source body" })),
        };
        const forged = {
            ...forgedBase,
            artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(forgedBase),
        };
        await node_assert_1.strict.rejects(() => (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
            proposals: forged,
            candidateEvidence: fixture.candidateEvidence,
            llmModelId: "fixture-offline-llm-v1",
            runner: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
        }), /keys are invalid/);
    });
});
