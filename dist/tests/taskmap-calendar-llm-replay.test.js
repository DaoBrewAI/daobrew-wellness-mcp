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
const calendar_refresh_llm_replay_js_1 = require("../src/engine/taskmap/calendar-refresh-llm-replay.js");
const calendar_candidate_adapter_js_1 = require("../src/engine/taskmap/calendar-candidate-adapter.js");
const calendar_extraction_js_1 = require("../src/engine/taskmap/calendar-extraction.js");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const llm_station_js_1 = require("../src/engine/taskmap/llm-station.js");
const meeting_refresh_llm_replay_js_1 = require("../src/engine/taskmap/meeting-refresh-llm-replay.js");
const native_candidate_review_js_1 = require("../src/engine/taskmap/native-candidate-review.js");
const native_semantic_builder_adapter_js_1 = require("../src/engine/taskmap/native-semantic-builder-adapter.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const OWNER = (0, source_contracts_js_1.taskMapContractDigest)("calendar-replay-owner");
const PRODUCED_AT = "2026-08-07T19:00:00.000Z";
const ASSESSED_AT = "2026-08-07T20:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";
function event(index) {
    const startAt = new Date(Date.parse("2026-07-01T08:00:00.000Z") + index * 86_400_000).toISOString();
    const eventIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)(`calendar-replay-event-${index}`);
    const title = `Review calendar item ${index}`;
    const endAt = new Date(Date.parse(startAt) + 1_800_000).toISOString();
    return {
        eventIdentityDigest,
        crossProviderIdentityDigest: null,
        revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, title, startAt, endAt]),
        title,
        startAt,
        endAt,
    };
}
async function fixture(eventCount = 1) {
    const root = await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-replay-"));
    const taskMapRoot = node_path_1.default.join(root, "taskmap");
    const runtimeRoot = node_path_1.default.join(root, "runtime");
    const promptTemplatePath = node_path_1.default.join(root, "calendar-extraction-v1.md");
    const localExportPath = node_path_1.default.join(root, "calendar-export.json");
    const googleSnapshotPath = node_path_1.default.join(root, "calendar-google.json");
    await (0, promises_1.mkdir)(taskMapRoot, { mode: 0o700 });
    await (0, promises_1.mkdir)(runtimeRoot, { mode: 0o700 });
    await (0, promises_1.writeFile)(promptTemplatePath, TEMPLATE, { mode: 0o600 });
    const local = (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
        ownerScopeDigest: OWNER,
        producedAt: PRODUCED_AT,
        events: Array.from({ length: eventCount }, (_, index) => event(index)),
    });
    await (0, promises_1.writeFile)(localExportPath, (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)(local), { mode: 0o600 });
    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath,
        googleSnapshotPath,
        assessedAt: ASSESSED_AT,
        expectedOwnerScopeDigest: OWNER,
    });
    assert.equal(result.availability, "available");
    return {
        root,
        taskMapRoot,
        runtimeRoot,
        promptTemplatePath,
        localExportPath,
        googleSnapshotPath,
        result,
        cleanup: () => (0, promises_1.rm)(root, { recursive: true, force: true }),
    };
}
function outputFor(promptText) {
    const match = /Review calendar item \d+/.exec(promptText);
    const text = match?.[0] ?? "Review calendar item 0";
    return JSON.stringify({
        mentions: [{
                text,
                title: text,
                class: "other",
                actor: "unknown",
                confidence: 0.83,
            }],
    });
}
function stationFactory(calls, output, transport = "claude-cli") {
    return async () => {
        calls.factory += 1;
        const station = {
            provider: {
                transport,
                executable: transport === "gemini-remote" ? "" : "/private/provider",
                args: [],
                model: "calendar-test-model",
            },
            async run(request) {
                calls.run.push(request.promptText);
                return {
                    stationId: "mention-extraction-v1",
                    model: "calendar-test-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: output(request.promptText),
                    producedAt: ASSESSED_AT,
                    transport,
                };
            },
        };
        return station;
    };
}
function realStationFactory(output) {
    return async () => (0, llm_station_js_1.createLlmStation)({
        order: ["claude-cli"],
        ownerHome: "/Users/owner",
        pathEnv: "",
        isExecutable: async (candidate) => candidate === "/Users/owner/.local/bin/claude",
        clock: () => new Date(ASSESSED_AT),
        runner: async (request) => {
            if (request.args.join("\0") === "auth\0status") {
                return { stdout: "", stderr: "", exitCode: 0 };
            }
            return {
                stdout: JSON.stringify({
                    type: "result",
                    subtype: "success",
                    result: output(request.stdin),
                }),
                stderr: "",
                exitCode: 0,
            };
        },
    });
}
async function refresh(f, createStation) {
    return (0, calendar_refresh_llm_replay_js_1.refreshTaskMapCalendarExtraction)({
        result: f.result,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation,
    });
}
(0, node_test_1.describe)("Task Map calendar Station-1 extraction replay", () => {
    (0, node_test_1.it)("records and byte-identically replays a Gemini calendar envelope", async () => {
        const f = await fixture();
        const calls = { factory: 0, run: [] };
        const rawOutput = ' {"mentions":[{"text":"Review calendar item 0",'
            + '"title":"Review calendar item 0","class":"other",'
            + '"actor":"unknown","confidence":0.83}]} ';
        try {
            const report = await refresh(f, stationFactory(calls, () => rawOutput, "gemini-remote"));
            assert.equal(report.segments[0]?.envelopeTransport, "gemini-remote");
            const segment = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(f.result.events)[0];
            const rendered = (0, calendar_extraction_js_1.renderTaskMapCalendarMentionPrompt)(TEMPLATE, segment.body);
            const envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(f.taskMapRoot, rendered, segment.body, calendar_refresh_llm_replay_js_1.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
            assert.equal(envelope?.transport, "gemini-remote");
            assert.equal(envelope?.outputJson, rawOutput);
            const replayed = await refresh(f, async () => {
                assert.fail("Gemini calendar replay must not recreate the station");
            });
            assert.deepEqual(replayed, report);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("returns null when the current calendar extraction report is absent", async () => {
        const f = await fixture();
        try {
            assert.equal(await (0, calendar_refresh_llm_replay_js_1.loadCurrentTaskMapCalendarExtractionProof)({
                localExportPath: f.localExportPath,
                googleSnapshotPath: f.googleSnapshotPath,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
                currentAssessedAt: ASSESSED_AT,
            }), null);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("reconstructs the exact assessed producer result for a later authenticated load", async () => {
        const f = await fixture();
        const calls = { factory: 0, run: [] };
        try {
            const report = await refresh(f, stationFactory(calls, outputFor));
            const proof = await (0, calendar_refresh_llm_replay_js_1.loadCurrentTaskMapCalendarExtractionProof)({
                localExportPath: f.localExportPath,
                googleSnapshotPath: f.googleSnapshotPath,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
                currentAssessedAt: "2026-08-07T21:00:00.000Z",
            });
            assert.ok(proof);
            assert.equal(proof.result.assessedAt, ASSESSED_AT);
            assert.equal(proof.result.resultDigest, f.result.resultDigest);
            assert.equal(proof.extraction.reportDigest, report.reportDigest);
            assert.equal(await (0, calendar_refresh_llm_replay_js_1.loadCurrentTaskMapCalendarExtractionProof)({
                localExportPath: f.localExportPath,
                googleSnapshotPath: f.googleSnapshotPath,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
                currentAssessedAt: "2026-08-08T00:00:00.001Z",
            }), null);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("persists namespaced envelopes and gate-derived calendar mentions", async () => {
        const f = await fixture();
        const calls = { factory: 0, run: [] };
        try {
            const report = await refresh(f, stationFactory(calls, outputFor));
            assert.equal(calls.factory, 1);
            assert.equal(calls.run.length, 1);
            assert.equal(report.pendingCount, 0);
            assert.equal(report.segments[0]?.status, "extracted");
            assert.equal(report.segments[0]?.mentions[0]?.speechActClass, "other");
            assert.equal(report.segments[0]?.mentions[0]?.proposalDisposition, "candidate_only");
            assert.equal(report.segments[0]?.mentions[0]?.promotionEligible, false);
            const envelopePath = (0, meeting_refresh_llm_replay_js_1.taskMapMentionExtractionEnvelopePath)(f.taskMapRoot, report.segments[0].inputDigest, calendar_refresh_llm_replay_js_1.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
            assert.equal((await (0, promises_1.lstat)(envelopePath)).mode & 0o777, 0o600);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("extracts JSON-fenced and bare-fenced calendar segments through the real station with canonical envelopes", async () => {
        const f = await fixture(25);
        try {
            const report = await refresh(f, realStationFactory((promptText) => {
                const output = outputFor(promptText);
                return promptText.includes("Review calendar item 0")
                    ? "```json\n" + output + "\n```"
                    : "```\n" + output + "\n```";
            }));
            assert.equal(report.pendingCount, 0);
            assert.equal(report.segments.length, 2);
            for (const row of report.segments) {
                assert.equal(row.status, "extracted");
                assert.equal(row.degradationCode, null);
                assert.match(row.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
            }
            const segments = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(f.result.events);
            for (const segment of segments) {
                const rendered = (0, calendar_extraction_js_1.renderTaskMapCalendarMentionPrompt)(TEMPLATE, segment.body);
                const envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(f.taskMapRoot, rendered, segment.body, calendar_refresh_llm_replay_js_1.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
                assert.equal(envelope?.outputJson, outputFor(rendered.promptText));
            }
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("accepts gemini-remote in calendar envelope and report contracts", async () => {
        const f = await fixture();
        const calls = { factory: 0, run: [] };
        try {
            const report = await refresh(f, stationFactory(calls, outputFor, "gemini-remote"));
            assert.equal(report.segments[0]?.envelopeTransport, "gemini-remote");
            const reloaded = await (0, calendar_refresh_llm_replay_js_1.loadVerifiedTaskMapCalendarExtractionReport)({
                result: f.result,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
            });
            assert.equal(reloaded?.segments[0]?.envelopeTransport, "gemini-remote");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("folds duplicate segment mention identities before shelf and projection construction", async () => {
        const f = await fixture(25);
        const calls = { factory: 0, run: [] };
        try {
            const report = await refresh(f, stationFactory(calls, () => JSON.stringify({
                mentions: [
                    {
                        text: "Review calendar item",
                        title: "Lower-confidence other request",
                        class: "request",
                        actor: "other",
                        confidence: 0.7,
                    },
                    {
                        text: "Review calendar item",
                        title: "Higher-confidence self request",
                        class: "request",
                        actor: "self",
                        confidence: 0.9,
                    },
                    {
                        text: "Review calendar item",
                        title: "Later tied request",
                        class: "request",
                        actor: "other",
                        confidence: 0.9,
                    },
                ],
            })));
            assert.equal(report.pendingCount, 0, JSON.stringify(report));
            const mentions = report.segments[0].mentions;
            assert.equal(mentions.length, 1);
            assert.equal(mentions[0]?.title, "Higher-confidence self request");
            assert.equal(mentions[0]?.speechActActor, "self");
            assert.equal(mentions[0]?.confidence, 0.9);
            assert.equal(mentions[0]?.promotionEligible, false);
            const review = (0, calendar_candidate_adapter_js_1.buildTaskMapCalendarCandidateReview)({
                result: f.result,
                extraction: report,
                previous: null,
                expectedOwnerScopeDigest: OWNER,
                assessedAt: ASSESSED_AT,
            });
            assert.equal(review.shelf.candidates.length, 1);
            assert.equal(review.shelf.candidates[0]?.promotionEligible, false);
            (0, native_candidate_review_js_1.assertTaskMapNativeCandidateShelfV2)(review.shelf);
            const fragment = (0, calendar_refresh_llm_replay_js_1.buildTaskMapCalendarSemanticFragment)(f.result, report);
            assert.equal(fragment.taskMapInput.events.length, 25);
            const projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)({
                contractVersion: "taskmap-native-semantic-builder-input.v1",
                ownerScopeDigest: OWNER,
                producer: {
                    id: "taskmap-meeting-producer-result.v1",
                    version: "taskmap-meeting-producer.1",
                },
                freshness: {
                    decision: "fresh",
                    available: true,
                    retainedLastGood: false,
                    producedAt: ASSESSED_AT,
                    validThrough: "2026-08-08T00:00:00.000Z",
                    assessedAt: ASSESSED_AT,
                },
                sourceBindings: fragment.sourceBindings,
                evidenceBindings: fragment.evidenceBindings,
                taskMapInput: fragment.taskMapInput,
            });
            assert.equal(projection.tasks.length, 1);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("rejects persisted segment rows with duplicate mention identities", async () => {
        const f = await fixture();
        const calls = { factory: 0, run: [] };
        try {
            await refresh(f, stationFactory(calls, outputFor));
            const reportPath = node_path_1.default.join(f.runtimeRoot, calendar_refresh_llm_replay_js_1.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME);
            const tampered = JSON.parse(await (0, promises_1.readFile)(reportPath, "utf8"));
            tampered.segments[0].mentions.push({
                ...tampered.segments[0].mentions[0],
            });
            const { reportDigest: _oldDigest, ...payload } = tampered;
            tampered.reportDigest = (0, source_contracts_js_1.taskMapContractDigest)(payload);
            await (0, promises_1.writeFile)(reportPath, JSON.stringify(tampered), { mode: 0o600 });
            await assert.rejects((0, calendar_refresh_llm_replay_js_1.loadVerifiedTaskMapCalendarExtractionReport)({
                result: f.result,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
            }), (error) => {
                assert.equal(error.code, "calendar_extraction_report_malformed");
                return true;
            });
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("replays unchanged results with zero station calls and identical report identity", async () => {
        const f = await fixture();
        const firstCalls = { factory: 0, run: [] };
        try {
            const first = await refresh(f, stationFactory(firstCalls, outputFor));
            const replayCalls = { factory: 0, run: [] };
            const replayed = await refresh(f, stationFactory(replayCalls, outputFor));
            assert.equal(replayCalls.factory, 0);
            assert.equal(replayCalls.run.length, 0);
            assert.equal(replayed.reportDigest, first.reportDigest);
            assert.deepEqual(replayed, first);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("accounts all segments as pending after one no-provider selection failure", async () => {
        const f = await fixture(25);
        let factoryCalls = 0;
        try {
            const report = await refresh(f, async () => {
                factoryCalls += 1;
                throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
            });
            assert.equal(factoryCalls, 1);
            assert.equal(report.segments.length, 2);
            assert.equal(report.pendingCount, 2);
            assert.ok(report.segments.every((row) => row.status === "degraded"
                && row.degradationCode === "no_provider"
                && row.mentions.length === 0));
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("persists remote-consent-required pending state and retries it after consent", async () => {
        const f = await fixture();
        try {
            const degraded = await refresh(f, async () => {
                throw new llm_station_js_1.LlmStationUnavailableError("remote_consent_required");
            });
            assert.equal(degraded.pendingCount, 1);
            assert.equal(degraded.segments[0]?.degradationCode, "remote_consent_required");
            const calls = { factory: 0, run: [] };
            const recovered = await refresh(f, stationFactory(calls, outputFor));
            assert.equal(calls.factory, 1);
            assert.equal(calls.run.length, 1);
            assert.equal(recovered.pendingCount, 0);
            assert.equal(recovered.segments[0]?.status, "extracted");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("persists and reloads provider_rate_limited for every pending segment", async () => {
        const f = await fixture(25);
        try {
            const report = await refresh(f, async () => ({
                provider: {
                    transport: "claude-cli",
                    executable: "/private/provider",
                    args: [],
                    model: "calendar-test-model",
                },
                async run() {
                    throw new llm_station_js_1.LlmStationUnavailableError("provider_rate_limited", "claude-cli");
                },
            }));
            assert.ok(report.segments.every((row) => row.status === "degraded"
                && row.degradationCode === "provider_rate_limited"));
            const reloaded = await (0, calendar_refresh_llm_replay_js_1.loadVerifiedTaskMapCalendarExtractionReport)({
                result: f.result,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: f.promptTemplatePath,
            });
            assert.ok(reloaded?.segments.every((row) => row.degradationCode === "provider_rate_limited"));
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("throws the deployment marker before station creation when the prompt is missing", async () => {
        const f = await fixture();
        let factoryCalls = 0;
        try {
            await assert.rejects((0, calendar_refresh_llm_replay_js_1.refreshTaskMapCalendarExtraction)({
                result: f.result,
                taskMapRoot: f.taskMapRoot,
                runtimeRoot: f.runtimeRoot,
                ownerScopeDigest: OWNER,
                promptTemplatePath: node_path_1.default.join(f.root, "missing-prompt.md"),
                assessedAt: ASSESSED_AT,
                createStation: async () => {
                    factoryCalls += 1;
                    throw new Error("station must not be created");
                },
            }), (error) => error instanceof meeting_refresh_llm_replay_js_1.TaskMapPromptTemplateUnavailableError);
            assert.equal(factoryCalls, 0);
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("isolates malformed output to one segment and extracts the other", async () => {
        const f = await fixture(25);
        const calls = { factory: 0, run: [] };
        try {
            const report = await refresh(f, stationFactory(calls, (promptText) => promptText.includes("Review calendar item 0") ? "not-json" : outputFor(promptText)));
            assert.equal(calls.run.length, 2);
            assert.equal(report.pendingCount, 1);
            assert.equal(report.segments[0]?.degradationCode, "invalid_extraction_output");
            assert.equal(report.segments[1]?.status, "extracted");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("backfills pending segments when the station recovers", async () => {
        const f = await fixture();
        try {
            const degraded = await refresh(f, async () => {
                throw new llm_station_js_1.LlmStationUnavailableError("no_provider");
            });
            assert.equal(degraded.pendingCount, 1);
            const calls = { factory: 0, run: [] };
            const recovered = await refresh(f, stationFactory(calls, outputFor));
            assert.equal(calls.factory, 1);
            assert.equal(calls.run.length, 1);
            assert.equal(recovered.pendingCount, 0);
            assert.equal(recovered.segments[0]?.status, "extracted");
        }
        finally {
            await f.cleanup();
        }
    });
    (0, node_test_1.it)("maps station timeout to provider_timeout pending state", async () => {
        const f = await fixture();
        try {
            const report = await refresh(f, async () => ({
                provider: {
                    transport: "codex-cli",
                    executable: "/private/codex",
                    args: [],
                    model: "default",
                },
                async run() {
                    throw new llm_station_js_1.LlmStationUnavailableError("timeout", "codex-cli");
                },
            }));
            assert.equal(report.pendingCount, 1);
            assert.equal(report.segments[0]?.degradationCode, "provider_timeout");
        }
        finally {
            await f.cleanup();
        }
    });
});
