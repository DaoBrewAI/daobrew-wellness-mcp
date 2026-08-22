"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const method_library_js_1 = require("../src/engine/taskmap/method-library.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const knownItem = () => ({
    taskId: "tmt_release",
    domainSignature: "software.release",
    title: "Release the signed desktop build",
    summary: "Prepare, verify, and publish the accepted release.",
    citationPointerIds: ["session-release"],
});
const unknownItem = () => ({
    ...knownItem(),
    taskId: "tmt_unknown",
    domainSignature: "unknown.specialty",
    title: "Handle a novel specialty workflow",
    summary: "Use bounded evidence to propose one decomposition level.",
});
function seededLibrary() {
    return (0, method_library_js_1.buildTaskMapMethodLibrary)({
        templates: [{
                templateId: "release-checklist-v1",
                domainSignature: "software.release",
                methodId: "verified-release",
                subtasks: [
                    { title: "Prepare release candidate", summary: "Create the bounded release candidate." },
                    { title: "Verify release candidate", summary: "Run the accepted verification contract." },
                ],
            }],
    });
}
function resealLibrary(draft) {
    const { artifactDigest: _artifactDigest, ...core } = draft;
    draft.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return draft;
}
const fiveProposals = () => ({
    proposals: Array.from({ length: 5 }, (_, index) => ({
        methodId: `novel-method-${index + 1}`,
        subtasks: [{
                title: `Novel step ${index + 1}`,
                summary: `Execute bounded novel step ${index + 1}.`,
                citationPointerIds: ["session-release"],
            }],
    })),
});
const replayRunner = (payload = fiveProposals(), onRequest) => async (request) => {
    onRequest?.(request);
    return { outputJson: JSON.stringify(payload) };
};
(0, node_test_1.describe)("Task Map Station-3 method library", () => {
    (0, node_test_1.it)("uses a deterministic sealed library template without invoking an LLM", async () => {
        const library = seededLibrary();
        let calls = 0;
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: knownItem(),
            library,
            llmModelId: "offline-replay-v1",
            runner: async () => {
                calls += 1;
                throw new Error("must not be called");
            },
        });
        strict_1.default.equal(method_library_js_1.TASKMAP_METHOD_LIBRARY_VERSION, "taskmap-method-library.v1");
        strict_1.default.equal(calls, 0);
        strict_1.default.equal(result.source, "method_library");
        strict_1.default.equal(result.proposals.length, 1);
        strict_1.default.equal(result.llm.invocationState, "not_invoked");
        strict_1.default.equal(result.libraryDigest, library.artifactDigest);
        const { artifactDigest, ...core } = result;
        strict_1.default.equal(artifactDigest, (0, source_contracts_js_1.taskMapContractDigest)(core));
        strict_1.default.deepEqual(library.authority, {
            edgesWritten: false,
            requiresOwnerAcceptance: true,
        });
        strict_1.default.deepEqual(library.privacy, {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        });
        strict_1.default.ok(Object.isFrozen(library));
        strict_1.default.ok(Object.isFrozen(library.templates));
    });
    (0, node_test_1.it)("caps an offline replay miss at three one-level proposals", async () => {
        let captured;
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner(fiveProposals(), (request) => {
                captured = request;
            }),
        });
        strict_1.default.equal(result.source, "llm_station");
        strict_1.default.equal(result.proposals.length, 3);
        strict_1.default.ok(result.proposals.every((proposal) => proposal.subtasks.every((subtask) => !("subtasks" in subtask))));
        strict_1.default.equal(captured?.stationId, method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID);
        strict_1.default.ok(!("executable" in (captured ?? {})));
        strict_1.default.equal(result.llm.modelId, "offline-replay-v1");
        strict_1.default.equal(result.llm.providerId, "offline-replay");
        strict_1.default.equal(result.llm.transport, "injected-offline");
        strict_1.default.match(result.llm.promptDigest ?? "", /^[a-f0-9]{64}$/);
        strict_1.default.match(result.llm.inputDigest, /^[a-f0-9]{64}$/);
        strict_1.default.match(result.llm.outputDigest ?? "", /^[a-f0-9]{64}$/);
    });
    (0, node_test_1.it)("uses the production-compatible high-level station seam with full provenance", async () => {
        let stationCalls = 0;
        class FixtureStation {
            provider = {
                transport: "claude-cli",
                executable: "/fixture/claude",
                args: [],
                model: "configured-model",
            };
            async run(request) {
                stationCalls += 1;
                return {
                    stationId: method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID,
                    model: "returned-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify(fiveProposals()),
                    producedAt: "2026-08-14T12:00:00.000Z",
                    transport: "claude-cli",
                };
            }
        }
        const station = new FixtureStation();
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            station,
        });
        strict_1.default.equal(stationCalls, 1);
        strict_1.default.equal(result.proposals.length, 3);
        strict_1.default.deepEqual({
            state: result.llm.invocationState,
            stationId: result.llm.stationId,
            model: result.llm.modelId,
            provider: result.llm.providerId,
            transport: result.llm.transport,
        }, {
            state: "invoked",
            stationId: "task-decomposition-v1",
            model: "returned-model",
            provider: "claude-cli",
            transport: "claude-cli",
        });
    });
    (0, node_test_1.it)("accepts and deterministically records matching remote station provenance", async () => {
        const station = {
            provider: {
                transport: "gemini-remote",
                executable: "",
                args: [],
                model: "gemini-remote",
            },
            run: async (request) => ({
                stationId: method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID,
                model: "gemini-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: " " + JSON.stringify(fiveProposals()) + " ",
                producedAt: "2026-08-14T12:00:00.000Z",
                transport: "gemini-remote",
            }),
        };
        const run = () => (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            station,
        });
        const first = await run();
        const replayed = await run();
        strict_1.default.equal(first.proposals.length, 3);
        strict_1.default.equal(first.unavailableReason, null);
        strict_1.default.equal(first.llm.providerId, "gemini-remote");
        strict_1.default.equal(first.llm.transport, "gemini-remote");
        strict_1.default.equal(first.llm.modelId, "gemini-fixture");
        strict_1.default.match(first.llm.outputDigest ?? "", /^[a-f0-9]{64}$/);
        strict_1.default.deepEqual(replayed, first);
    });
    (0, node_test_1.it)("fails closed when a station envelope carries unknown keys", async () => {
        const station = {
            provider: {
                transport: "claude-cli",
                executable: "/fixture/claude",
                args: [],
                model: "configured-model",
            },
            run: async (request) => ({
                stationId: method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID,
                model: "returned-model",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify(fiveProposals()),
                producedAt: "2026-08-14T12:00:00.000Z",
                transport: "claude-cli",
                localPath: "/forbidden/provider-state",
            }),
        };
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            station,
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.equal(result.unavailableReason, "llm_station_unavailable");
    });
    (0, node_test_1.it)("emits typed zero-proposal safe behavior when the LLM is unavailable", async () => {
        for (const providerFailure of [
            new Error("no provider"),
            "provider unavailable",
            { sensitiveProviderState: "must-not-leak" },
        ]) {
            const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: unknownItem(),
                library: seededLibrary(),
                llmModelId: "offline-replay-v1",
                runner: async () => {
                    throw providerFailure;
                },
            });
            strict_1.default.deepEqual(result.proposals, []);
            strict_1.default.equal(result.unavailableReason, "llm_station_unavailable");
            strict_1.default.equal(result.llm.invocationState, "unavailable");
            strict_1.default.doesNotMatch(JSON.stringify(result), /no provider|provider unavailable|sensitiveProviderState|must-not-leak/);
        }
    });
    (0, node_test_1.it)("rejects nested subtasks and malformed exact-key output as typed invalid output", async () => {
        for (const payload of [
            {
                proposals: [{
                        methodId: "nested",
                        subtasks: [{
                                title: "Nested",
                                summary: "Must be rejected.",
                                citationPointerIds: ["session-release"],
                                subtasks: [],
                            }],
                    }],
            },
            { proposals: [], unexpected: true },
            { proposals: [] },
        ]) {
            const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: unknownItem(),
                library: seededLibrary(),
                llmModelId: "offline-replay-v1",
                runner: replayRunner(payload),
            });
            strict_1.default.deepEqual(result.proposals, []);
            strict_1.default.equal(result.unavailableReason, "llm_station_invalid_output");
        }
    });
    (0, node_test_1.it)("rejects unbounded proposal collections instead of silently truncating them", async () => {
        const payload = {
            proposals: Array.from({ length: 17 }, (_, index) => ({
                methodId: `method-${index}`,
                subtasks: [{
                        title: `Step ${index}`,
                        summary: "Bounded step.",
                        citationPointerIds: ["session-release"],
                    }],
            })),
        };
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner(payload),
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.equal(result.unavailableReason, "llm_station_invalid_output");
    });
    (0, node_test_1.it)("rejects oversized provider output before recording an output digest", async () => {
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: async () => ({
                outputJson: "x".repeat(method_library_js_1.TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes + 1),
            }),
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.equal(result.unavailableReason, "llm_station_invalid_output");
        strict_1.default.equal(result.llm.outputDigest, null);
    });
    (0, node_test_1.it)("validates malformed candidates after the publication cap", async () => {
        const payload = fiveProposals();
        payload.proposals[3].subtasks[0] = {
            ...payload.proposals[3].subtasks[0],
            subtasks: [],
        };
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner(payload),
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.equal(result.unavailableReason, "llm_station_invalid_output");
    });
    (0, node_test_1.it)("fails closed for provider shape and transport forgery", async () => {
        for (const provider of [
            {
                transport: "claude-cli",
                executable: "/fixture/claude",
                args: [],
                model: "configured-model",
                localPath: "/forbidden/provider-state",
            },
            {
                transport: "forged-cli",
                executable: "/fixture/forged",
                args: [],
                model: "configured-model",
            },
            {
                transport: "local-rules",
                executable: "builtin",
                args: [],
                model: "local-rules-v1",
            },
        ]) {
            const station = {
                provider,
                run: async (request) => ({
                    stationId: method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID,
                    model: "returned-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify(fiveProposals()),
                    producedAt: "2026-08-14T12:00:00.000Z",
                    transport: provider.transport,
                }),
            };
            const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: unknownItem(),
                library: seededLibrary(),
                station,
            });
            strict_1.default.deepEqual(result.proposals, []);
            strict_1.default.equal(result.unavailableReason, "llm_station_unavailable");
        }
    });
    (0, node_test_1.it)("rejects an impossible calendar date in a station envelope", async () => {
        const station = {
            provider: {
                transport: "claude-cli",
                executable: "/fixture/claude",
                args: [],
                model: "configured-model",
            },
            run: async (request) => ({
                stationId: method_library_js_1.TASKMAP_DECOMPOSITION_STATION_ID,
                model: "returned-model",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify(fiveProposals()),
                producedAt: "2026-02-31T12:00:00.000Z",
                transport: "claude-cli",
            }),
        };
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            station,
        });
        strict_1.default.deepEqual(result.proposals, []);
        strict_1.default.equal(result.unavailableReason, "llm_station_unavailable");
    });
    (0, node_test_1.it)("is deterministic for identical recorded replay output", async () => {
        const input = {
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner(fiveProposals()),
        };
        strict_1.default.deepEqual(await (0, method_library_js_1.proposeTaskMapDecomposition)(input), await (0, method_library_js_1.proposeTaskMapDecomposition)(input));
    });
    (0, node_test_1.it)("never grants graph or acceptance authority", async () => {
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner(),
        });
        strict_1.default.deepEqual(result.authority, {
            edgesWritten: false,
            requiresOwnerAcceptance: true,
        });
        strict_1.default.ok(result.proposals.every((proposal) => !("edges" in proposal)));
    });
    (0, node_test_1.it)("stores no raw input body, prompt, provider output, local path, or biometrics", async () => {
        const item = unknownItem();
        const rawOutput = JSON.stringify(fiveProposals());
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: item,
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: async () => ({ outputJson: rawOutput }),
        });
        const serialized = JSON.stringify(result);
        strict_1.default.doesNotMatch(serialized, new RegExp(item.title));
        strict_1.default.doesNotMatch(serialized, new RegExp(item.summary));
        strict_1.default.ok(!serialized.includes(rawOutput));
        strict_1.default.deepEqual(result.privacy, {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        });
        strict_1.default.ok(result.proposals[0].subtasks[0].title.length > 0);
    });
    (0, node_test_1.it)("rejects tampered or unbounded libraries and invalid work before any runner call", async () => {
        const tampered = structuredClone(seededLibrary());
        tampered.templates[0].domainSignature = "forged";
        let calls = 0;
        for (const fixture of [
            { workItem: knownItem(), library: tampered },
            {
                workItem: { ...knownItem(), title: "x".repeat(257) },
                library: seededLibrary(),
            },
        ]) {
            await strict_1.default.rejects(() => (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: fixture.workItem,
                library: fixture.library,
                llmModelId: "offline-replay-v1",
                runner: async () => {
                    calls += 1;
                    return { outputJson: "{}" };
                },
            }), /library|work item|bounded|invalid/i);
        }
        strict_1.default.equal(calls, 0);
    });
    (0, node_test_1.it)("rejects re-sealed library authority/privacy tampering before any runner call", async () => {
        const mutations = [
            (draft) => {
                draft.authority.edgesWritten = true;
            },
            (draft) => {
                draft.privacy.localPathsStored = true;
            },
            (draft) => {
                draft.authority.unknown = false;
            },
            (draft) => {
                draft.privacy.unknown = false;
            },
        ];
        let calls = 0;
        for (const mutate of mutations) {
            const forged = structuredClone(seededLibrary());
            mutate(forged);
            resealLibrary(forged);
            await strict_1.default.rejects(() => (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: unknownItem(),
                library: forged,
                llmModelId: "offline-replay-v1",
                runner: async () => {
                    calls += 1;
                    return { outputJson: JSON.stringify(fiveProposals()) };
                },
            }), /library|authority|privacy|canonical|keys/i);
        }
        strict_1.default.equal(calls, 0);
    });
    (0, node_test_1.it)("rejects whitespace-only bounded strings and identifiers", async () => {
        strict_1.default.throws(() => (0, method_library_js_1.buildTaskMapMethodLibrary)({
            templates: [{
                    templateId: " ",
                    domainSignature: "software.release",
                    methodId: "verified-release",
                    subtasks: [{ title: "Prepare", summary: "Prepare the release." }],
                }],
        }), /invalid|bounded/i);
        await strict_1.default.rejects(() => (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: { ...knownItem(), taskId: "\t " },
            library: seededLibrary(),
        }), /work item|invalid|bounded/i);
        const invalidOutput = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: "offline-replay-v1",
            runner: replayRunner({
                proposals: [{
                        methodId: " ",
                        subtasks: [{
                                title: "Step",
                                summary: "Bounded step.",
                                citationPointerIds: ["session-release"],
                            }],
                    }],
            }),
        });
        strict_1.default.deepEqual(invalidOutput.proposals, []);
        strict_1.default.equal(invalidOutput.unavailableReason, "llm_station_invalid_output");
    });
    (0, node_test_1.it)("rejects identifiers and model provenance with outer whitespace", async () => {
        await strict_1.default.rejects(() => (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: { ...knownItem(), taskId: " padded-task " },
            library: seededLibrary(),
        }), /work item|invalid|bounded/i);
        let runnerCalls = 0;
        await strict_1.default.rejects(() => (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: unknownItem(),
            library: seededLibrary(),
            llmModelId: " padded-model ",
            runner: async () => {
                runnerCalls += 1;
                return { outputJson: JSON.stringify(fiveProposals()) };
            },
        }), /model|provenance|invalid/i);
        strict_1.default.equal(runnerCalls, 0);
        for (const payload of [
            {
                proposals: [{
                        methodId: " padded-method ",
                        subtasks: [{
                                title: "Step",
                                summary: "Bounded step.",
                                citationPointerIds: ["session-release"],
                            }],
                    }],
            },
            {
                proposals: [{
                        methodId: "method",
                        subtasks: [{
                                title: "Step",
                                summary: "Bounded step.",
                                citationPointerIds: [" padded-citation "],
                            }],
                    }],
            },
        ]) {
            const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
                workItem: unknownItem(),
                library: seededLibrary(),
                llmModelId: "offline-replay-v1",
                runner: replayRunner(payload),
            });
            strict_1.default.deepEqual(result.proposals, []);
            strict_1.default.equal(result.unavailableReason, "llm_station_invalid_output");
        }
    });
    (0, node_test_1.it)("preserves nonblank human titles and summaries with outer whitespace", async () => {
        const library = (0, method_library_js_1.buildTaskMapMethodLibrary)({
            templates: [{
                    templateId: "spaced-content",
                    domainSignature: "human.content",
                    methodId: "spaced-method",
                    subtasks: [{ title: " Padded title ", summary: " Padded summary " }],
                }],
        });
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem: {
                ...knownItem(),
                domainSignature: "human.content",
                title: " Padded work title ",
                summary: " Padded work summary ",
            },
            library,
        });
        strict_1.default.equal(result.proposals[0].subtasks[0].title, " Padded title ");
        strict_1.default.equal(result.proposals[0].subtasks[0].summary, " Padded summary ");
    });
    (0, node_test_1.it)("enforces the library artifact byte ceiling before returning", () => {
        const summary = "x".repeat(1_024);
        strict_1.default.throws(() => (0, method_library_js_1.buildTaskMapMethodLibrary)({
            templates: Array.from({ length: 128 }, (_, templateIndex) => ({
                templateId: `template-${templateIndex}`,
                domainSignature: `domain.${templateIndex}`,
                methodId: `method-${templateIndex}`,
                subtasks: Array.from({ length: 16 }, (_, subtaskIndex) => ({
                    title: `Step ${subtaskIndex}`,
                    summary,
                })),
            })),
        }), /artifact|bounded|ceiling/i);
    });
    (0, node_test_1.it)("rejects duplicate template identities across domain signatures", () => {
        strict_1.default.throws(() => (0, method_library_js_1.buildTaskMapMethodLibrary)({
            templates: ["one", "two"].map((suffix) => ({
                templateId: "shared-template-id",
                domainSignature: `software.${suffix}`,
                methodId: `method-${suffix}`,
                subtasks: [{ title: `Step ${suffix}`, summary: "Bounded step." }],
            })),
        }), /template|unique|repeat/i);
    });
});
