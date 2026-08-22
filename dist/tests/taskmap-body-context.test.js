"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const body_context_js_1 = require("../src/engine/taskmap/body-context.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
function fixture() {
    const generatedAt = "2026-07-27T18:00:00.000Z";
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt,
        pointers: [
            {
                id: "task-home",
                sourceKind: "strategy",
                sourceObjectId: "task-safe-ref",
                sourceRefHash: "0000000000000000",
                authority: "source_system",
                syncMode: "return_only",
                capabilities: ["read_task", "deep_link"],
            },
            {
                id: "work",
                sourceKind: "granola",
                sourceObjectId: "meeting-safe-ref",
                sourceRefHash: "1111111111111111",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
            {
                id: "body",
                sourceKind: "oura",
                sourceObjectId: "relative-window",
                sourceRefHash: "2222222222222222",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ],
        events: [
            {
                id: "task-created",
                pointerId: "task-home",
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-07-26T14:00:00.000Z",
                observedAt: generatedAt,
                objectRefs: ["task:safe-ref"],
                title: "Close the Task Map decision",
                summary: "Use bounded source evidence to close the open implementation decision.",
                extractionConfidence: 1,
                sourceStatus: "open",
            },
            {
                id: "meeting",
                pointerId: "work",
                recordKind: "work_context",
                activity: "context_observed",
                occurredAt: "2026-07-27T14:00:00.000Z",
                observedAt: generatedAt,
                dayKey: "2026-07-27",
                objectRefs: ["meeting:safe-ref"],
                title: "Task Map decision",
                summary: "The accepted work context identifies one open implementation decision.",
                extractionConfidence: 1,
                bodyJoinEligible: true,
            },
            {
                id: "body-day",
                pointerId: "body",
                recordKind: "body_context",
                activity: "body_window_observed",
                occurredAt: "2026-07-27T12:00:00.000Z",
                observedAt: generatedAt,
                dayKey: "2026-07-27",
                objectRefs: ["body-day:2026-07-27"],
                title: "Body window was below personal baseline",
                summary: "Relative category only; no raw biometric value is stored.",
                extractionConfidence: 1,
                bodyCategory: "below_baseline",
                bodyAxis: "composite_recovery",
            },
        ],
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt,
        roots: [{
                proposalId: "root",
                title: "Task Map implementation",
                summary: "Finish the source-backed Task Map implementation.",
                evidenceEventIds: ["task-created", "meeting"],
                memberObjectRefs: ["task:safe-ref", "meeting:safe-ref"],
                confidence: 1,
            }],
        tasks: [{
                proposalId: "task",
                rootProposalId: "root",
                title: "Close the Task Map decision",
                summary: "Use the bounded source evidence to close the open decision.",
                evidenceEventIds: ["task-created", "meeting"],
                authoritativeTaskEventId: "task-created",
                openState: "open",
                confidence: 1,
            }],
        edges: [{
                proposalId: "edge",
                fromProposalId: "root",
                toProposalId: "task",
                relation: "advances",
                evidenceEventIds: ["meeting"],
                confidence: 1,
            }],
    };
    const context = {
        contractVersion: "oura-taskmap-context.v1",
        generatedAt,
        sourceKind: "oura",
        coverage: {
            startDay: "2026-07-01",
            endDay: "2026-07-27",
            dailyActivityDays: 27,
            dailyReadinessDays: 27,
            dailySleepDays: 26,
            sleepRecords: 40,
            heartRateSamples: 12_000,
            classifiedDays: 1,
            unknownDays: 0,
        },
        classifier: {
            version: "oura-relative-recovery.1",
            axis: "composite_recovery",
            method: "Robust personal-window median and MAD; relative context only.",
            minimumMetricsPerDay: 2,
            lowerThreshold: -1,
            upperThreshold: 1,
        },
        days: [{
                dayKey: "2026-07-27",
                axis: "composite_recovery",
                category: "below_baseline",
            }],
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
        },
    };
    return { input, brain, context };
}
(0, node_test_1.describe)("Task Map body-context disclosure", () => {
    function acceptedProjection(input, brain) {
        const stable = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
            arm: "E2",
            now: input.generatedAt,
        });
        strict_1.default.equal(stable.runStatus, "accepted", JSON.stringify(stable.rejections));
        return (0, harness_js_1.buildTaskMapProjection)(input, brain, {
            arm: "E4",
            now: input.generatedAt,
            previousProjection: stable,
        });
    }
    (0, node_test_1.it)("binds safe Oura dates to accepted nodes after membership is fixed", () => {
        const { input, brain, context } = fixture();
        const projection = acceptedProjection(input, brain);
        strict_1.default.equal(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
        strict_1.default.equal(projection.roots[0].bodyContextCount, 1);
        strict_1.default.equal(projection.tasks[0].bodyContextCount, 1);
        const disclosure = (0, body_context_js_1.buildTaskMapBodyContextDisclosure)(input, projection, context);
        strict_1.default.equal(disclosure.projectionRunId, projection.runId);
        strict_1.default.equal(disclosure.nodes.length, 2);
        strict_1.default.deepEqual(disclosure.nodes.map((node) => node.matches[0]), [
            {
                dayKey: "2026-07-27",
                axis: "composite_recovery",
                category: "below_baseline",
                backingSourceCount: 1,
                sourceKind: "oura",
            },
            {
                dayKey: "2026-07-27",
                axis: "composite_recovery",
                category: "below_baseline",
                backingSourceCount: 1,
                sourceKind: "oura",
            },
        ]);
    });
    (0, node_test_1.it)("serializes no raw biometric fields or values", () => {
        const { input, brain, context } = fixture();
        const projection = acceptedProjection(input, brain);
        const serialized = JSON.stringify((0, body_context_js_1.buildTaskMapBodyContextDisclosure)(input, projection, context));
        for (const forbidden of [
            "\"score\"",
            "\"bpm\"",
            "\"hrv\"",
            "\"steps\"",
            "\"value\"",
            "\"access_token\"",
            "\"refresh_token\"",
            "/Users/",
        ]) {
            strict_1.default.equal(serialized.includes(forbidden), false, forbidden);
        }
    });
    (0, node_test_1.it)("fails closed when projection, input, or relative categories diverge", () => {
        const { input, brain, context } = fixture();
        const projection = acceptedProjection(input, brain);
        strict_1.default.throws(() => (0, body_context_js_1.buildTaskMapBodyContextDisclosure)({ ...input, generatedAt: "2026-07-27T19:00:00.000Z" }, projection, context), /accepted matching/);
        strict_1.default.throws(() => (0, body_context_js_1.buildTaskMapBodyContextDisclosure)(input, projection, {
            ...context,
            days: [{
                    ...context.days[0],
                    category: "above_baseline",
                }],
        }), /do not match/);
    });
});
