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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const community_task_digestion_js_1 = require("../src/engine/taskmap/community-task-digestion.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const PRODUCED_AT = "2026-08-17T08:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";
function rootEvidenceFixture(roots) {
    const events = roots.flatMap((root) => root.evidence.map((row) => ({
        id: row.id,
        pointerId: `pointer-${row.id}`,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: PRODUCED_AT,
        observedAt: PRODUCED_AT,
        objectRefs: [`community:${(0, source_contracts_js_1.taskMapContractDigest)(root.proposalId)}`],
        title: row.title,
        summary: row.summary,
        extractionConfidence: 0.8,
    })));
    const pointers = [...new Set(events.map((event) => event.pointerId))].map((pointerId) => ({
        id: pointerId,
        sourceKind: "codex_session",
        sourceObjectId: `episode:${(0, source_contracts_js_1.taskMapContractDigest)(pointerId)}`,
        sourceRefHash: (0, source_contracts_js_1.taskMapContractDigest)(`ref-${pointerId}`),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    }));
    return {
        taskMapInput: {
            contractVersion: "taskmap-input.v1",
            generatedAt: PRODUCED_AT,
            pointers,
            events,
        },
        rootProposals: roots.map((root) => ({
            proposalId: root.proposalId,
            title: `Theme ${root.proposalId}`,
            summary: root.evidence.map((row) => row.title).join(" · "),
            evidenceEventIds: root.evidence.map((row) => row.id),
            memberObjectRefs: [`workstream:${(0, source_contracts_js_1.taskMapContractDigest)(root.proposalId)}`],
            confidence: 0.8,
        })),
    };
}
function station(outputForBody, calls = []) {
    return {
        provider: {
            transport: "gemini-remote",
            executable: "",
            args: [],
            model: "digestion-fixture",
        },
        async run(request) {
            calls.push(request);
            const body = request.promptText
                .split("<<<BEGIN_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n")[1]
                .split("\n<<<END_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>")[0];
            return {
                stationId: request.stationId,
                model: "digestion-fixture",
                promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: JSON.stringify({ mentions: outputForBody(body) }),
                producedAt: PRODUCED_AT,
                transport: "gemini-remote",
            };
        },
    };
}
async function fixture() {
    const root = await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-community-task-digestion-"));
    const taskMapRoot = node_path_1.default.join(root, "taskmap");
    const promptTemplatePath = node_path_1.default.join(root, "community-task-extraction-v1.md");
    await (0, promises_1.mkdir)(taskMapRoot, { mode: 0o700 });
    await (0, promises_1.writeFile)(promptTemplatePath, TEMPLATE, { mode: 0o600 });
    return {
        taskMapRoot,
        promptTemplatePath,
        cleanup: () => (0, promises_1.rm)(root, { recursive: true, force: true }),
    };
}
function onlyRoot(digestion) {
    assert.equal(digestion.roots.length, 1);
    return digestion.roots[0];
}
(0, node_test_1.describe)("Task Map community task digestion", () => {
    (0, node_test_1.it)("folds five evidence rows describing one action into one task with five citations", async () => {
        const f = await fixture();
        try {
            const evidence = Array.from({ length: 5 }, (_, index) => ({
                id: `event-repair-${index}`,
                title: `Fix the approval routing regression (report ${index})`,
                summary: `Session ${index} traced the approval routing regression.`,
            }));
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-aaaa", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => evidence.map((row, index) => ({
                    text: `(report ${index})`,
                    title: "Fix the approval routing regression",
                    class: "request",
                    actor: "self",
                    confidence: 0.6 + index * 0.05,
                }))),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.status, "digested");
            assert.equal(row.tasks.length, 1);
            const task = row.tasks[0];
            assert.equal(task.title, "Fix the approval routing regression");
            assert.deepEqual(task.evidenceEventIds, evidence.map((candidate) => candidate.id).sort());
            assert.equal(task.confidence, 0.8);
            assert.equal(task.rootProposalId, "graph-root-aaaa");
            assert.match(task.taskProposalId, /^community-task-[a-f0-9]{16}$/);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("keeps three distinct actions from five evidence rows as three tasks", async () => {
        const f = await fixture();
        try {
            const evidence = Array.from({ length: 5 }, (_, index) => ({
                id: `event-multi-${index}`,
                title: `Directive ${index}`,
                summary: `Body ${index}: advance the workstream.`,
            }));
            const titles = [
                "Repair the release gate",
                "Restore the YC application card",
                "Ship the dismissal interaction",
            ];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-bbbb", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => evidence.map((row, index) => ({
                    text: `Directive ${index}`,
                    title: titles[index % titles.length],
                    class: "request",
                    actor: "self",
                    confidence: 0.7,
                }))),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.tasks.length, 3);
            assert.deepEqual([...row.tasks.map((task) => task.title)].sort(), [...titles].sort());
            const repair = row.tasks.find((task) => task.title === "Repair the release gate");
            assert.deepEqual(repair?.evidenceEventIds, [
                "event-multi-0",
                "event-multi-3",
            ]);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("emits two tasks when one evidence row describes two actions", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-dual",
                    title: "Restore the YC card and ship dismissal",
                    summary: "Restore the YC application card. Ship the dismissal flow.",
                }];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-cccc", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [
                    {
                        text: "Restore the YC application card.",
                        title: "Restore the YC application card",
                        class: "request",
                        actor: "self",
                        confidence: 0.8,
                    },
                    {
                        text: "Ship the dismissal flow.",
                        title: "Ship the dismissal flow",
                        class: "request",
                        actor: "self",
                        confidence: 0.7,
                    },
                ]),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.tasks.length, 2);
            for (const task of row.tasks) {
                assert.deepEqual(task.evidenceEventIds, ["event-dual"]);
            }
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("fails closed on ambiguous spans, cross-excerpt spans, and non-actionable mentions", async () => {
        const f = await fixture();
        try {
            const evidence = [
                {
                    id: "event-shared-0",
                    title: "shared phrase alpha",
                    summary: "First body with the shared phrase alpha inside.",
                },
                {
                    id: "event-shared-1",
                    title: "shared phrase alpha again",
                    summary: "Second body with the shared phrase alpha inside.",
                },
            ];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-dddd", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station((body) => [
                    {
                        // Present in both excerpts: ambiguous, must fail closed.
                        text: "shared phrase alpha",
                        title: "Bind the ambiguous span",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    },
                    {
                        // Crosses the excerpt boundary: valid against the whole body but
                        // inside no single excerpt, must fail closed.
                        text: body.slice(body.indexOf("inside."), body.indexOf("[EVIDENCE 2]") + "[EVIDENCE 2]".length),
                        title: "Bind the crossing span",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    },
                    {
                        // Non-actionable context is never a task.
                        text: "First body",
                        title: "Keep ambient context",
                        class: "other",
                        actor: "unknown",
                        confidence: 0.9,
                    },
                ]),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.status, "degraded");
            assert.equal(row.degradationCode, "invalid_extraction_output");
            assert.deepEqual(row.tasks, []);
            assert.equal(digestion.digestedRootCount, 0, "an extraction with no actionable leaves must not claim a digested root");
            assert.equal(digestion.degradedRootCount, 1);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("emits tasks only for owner-actionable speech acts", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-authority",
                    title: "Authority examples",
                    summary: "Ship owner work. Record the settled choice. Ask Pat to deploy. Track an unknown commitment.",
                }];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-authority", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [
                    {
                        text: "Ship owner work.",
                        title: "Ship owner work",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    },
                    {
                        text: "Record the settled choice.",
                        title: "Record the settled choice",
                        class: "decision",
                        actor: "self",
                        confidence: 0.9,
                    },
                    {
                        text: "Ask Pat to deploy.",
                        title: "Ask Pat to deploy",
                        class: "request",
                        actor: "other",
                        confidence: 0.9,
                    },
                    {
                        text: "Track an unknown commitment.",
                        title: "Track an unknown commitment",
                        class: "commitment",
                        actor: "unknown",
                        confidence: 0.9,
                    },
                ]),
            });
            assert.deepEqual(onlyRoot(digestion).tasks.map((task) => task.title), ["Ship owner work"]);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("caps each root at five tasks preferring higher confidence", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-cap",
                    title: "Directive bundle",
                    summary: "alpha beta gamma delta epsilon zeta",
                }];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([
                    { proposalId: "graph-root-eeee", evidence },
                ]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [
                    "alpha",
                    "beta",
                    "gamma",
                    "delta",
                    "epsilon",
                    "zeta",
                ].map((word, index) => ({
                    text: word,
                    title: `Advance workstream ${word}`,
                    class: "request",
                    actor: "self",
                    confidence: index === 5 ? 0.2 : 0.9,
                }))),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.tasks.length, community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot);
            assert.equal(row.tasks.some((task) => task.title === "Advance workstream zeta"), false, "the low-confidence overflow mention must be the one dropped");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("replays recorded envelopes byte-identically without a station", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-replay",
                    title: "Repair the projection loader",
                    summary: "Repair the projection loader for canonical ordering.",
                }];
            const rootEvidence = rootEvidenceFixture([
                { proposalId: "graph-root-ffff", evidence },
            ]);
            const calls = [];
            const first = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [{
                        text: "Repair the projection loader",
                        title: "Repair the projection loader",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    }], calls),
            });
            assert.equal(calls.length, 1);
            assert.equal(calls[0].stationId, community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID);
            const throwingStation = {
                provider: {
                    transport: "gemini-remote",
                    executable: "must-not-run",
                    args: [],
                    model: "must-not-run",
                },
                async run() {
                    throw new Error("station must not be consulted on replay");
                },
            };
            const replay = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: throwingStation,
            });
            assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(replay), (0, source_contracts_js_1.taskMapContractCanonicalJson)(first));
            const offline = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: null,
            });
            assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(offline), (0, source_contracts_js_1.taskMapContractCanonicalJson)(first));
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("degrades to zero tasks without inventing placeholders when no station and no envelope exist", async () => {
        const f = await fixture();
        try {
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([{
                        proposalId: "graph-root-gggg",
                        evidence: [{
                                id: "event-degraded",
                                title: "Unreachable work",
                                summary: "Unreachable work body.",
                            }],
                    }]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: null,
            });
            const row = onlyRoot(digestion);
            assert.equal(row.status, "degraded");
            assert.equal(row.degradationCode, "no_provider");
            assert.deepEqual(row.tasks, []);
            assert.equal(digestion.degradedRootCount, 1);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("marks a root degraded when the station returns spans outside the body", async () => {
        const f = await fixture();
        try {
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([{
                        proposalId: "graph-root-hhhh",
                        evidence: [{
                                id: "event-invalid",
                                title: "Real directive",
                                summary: "Real directive body.",
                            }],
                    }]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [{
                        text: "fabricated span that never appeared",
                        title: "Reject the fabricated span",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    }]),
            });
            const row = onlyRoot(digestion);
            assert.equal(row.status, "degraded");
            assert.equal(row.degradationCode, "invalid_extraction_output");
            assert.deepEqual(row.tasks, []);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("retries and atomically heals a persisted taskless community envelope", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-poisoned-community",
                    title: "Recover poisoned community envelope",
                    summary: "Recover poisoned community envelope after provider recovery.",
                }];
            const rootEvidence = rootEvidenceFixture([{
                    proposalId: "graph-root-poisoned-community",
                    evidence,
                }]);
            const body = (0, community_task_digestion_js_1.taskMapCommunityTaskExtractionBody)(evidence.map((row) => ({
                evidenceEventId: row.id,
                matchText: `${row.title}\n${row.summary}`,
                summary: row.summary,
            })));
            const rendered = (0, community_task_digestion_js_1.renderTaskMapCommunityTaskExtractionPrompt)(TEMPLATE, body);
            const envelopePath = (0, community_task_digestion_js_1.taskMapCommunityTaskExtractionEnvelopePath)(f.taskMapRoot, rendered.inputDigest);
            await (0, promises_1.mkdir)(node_path_1.default.dirname(envelopePath), { recursive: true, mode: 0o700 });
            await (0, promises_1.writeFile)(envelopePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)({
                stationId: community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
                model: "persisted-taskless-community-fixture",
                promptDigest: rendered.promptDigest,
                inputDigest: rendered.inputDigest,
                outputJson: JSON.stringify({ mentions: [{
                            text: "Recover poisoned community envelope",
                            title: "Ambient poisoned envelope context",
                            class: "other",
                            actor: "unknown",
                            confidence: 0.9,
                        }] }),
                producedAt: PRODUCED_AT,
                transport: "gemini-remote",
            }), { mode: 0o600 });
            const poisonedBytes = await (0, promises_1.readFile)(envelopePath);
            const recoveryCalls = [];
            const recovered = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [{
                        text: "Recover poisoned community envelope",
                        title: "Recover poisoned community envelope",
                        class: "request",
                        actor: "self",
                        confidence: 0.95,
                    }], recoveryCalls),
            });
            assert.equal(recoveryCalls.length, 1);
            assert.equal(onlyRoot(recovered).status, "digested");
            assert.deepEqual(onlyRoot(recovered).tasks[0]?.evidenceEventIds, [
                "event-poisoned-community",
            ]);
            const healedBytes = await (0, promises_1.readFile)(envelopePath);
            assert.notDeepEqual(healedBytes, poisonedBytes);
            const replayed = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: null,
            });
            assert.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(replayed), (0, source_contracts_js_1.taskMapContractCanonicalJson)(recovered));
            assert.deepEqual(await (0, promises_1.readFile)(envelopePath), healedBytes);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("does not persist a taskless community extraction", async () => {
        const f = await fixture();
        try {
            const evidence = [{
                    id: "event-nondurable-community",
                    title: "Keep taskless output nondurable",
                    summary: "Keep taskless output nondurable after validation.",
                }];
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence: rootEvidenceFixture([{
                        proposalId: "graph-root-nondurable-community",
                        evidence,
                    }]),
                taskMapRoot: f.taskMapRoot,
                promptTemplatePath: f.promptTemplatePath,
                station: station(() => [{
                        text: "Keep taskless output nondurable",
                        title: "Ambient taskless context",
                        class: "other",
                        actor: "unknown",
                        confidence: 0.9,
                    }]),
            });
            assert.equal(onlyRoot(digestion).status, "degraded");
            const body = (0, community_task_digestion_js_1.taskMapCommunityTaskExtractionBody)(evidence.map((row) => ({
                evidenceEventId: row.id,
                matchText: `${row.title}\n${row.summary}`,
                summary: row.summary,
            })));
            const rendered = (0, community_task_digestion_js_1.renderTaskMapCommunityTaskExtractionPrompt)(TEMPLATE, body);
            await assert.rejects((0, promises_1.lstat)((0, community_task_digestion_js_1.taskMapCommunityTaskExtractionEnvelopePath)(f.taskMapRoot, rendered.inputDigest)), (error) => error.code === "ENOENT", "a taskless community extraction must not become durable replay authority");
        }
        finally {
            await f.cleanup();
        }
    });
});
