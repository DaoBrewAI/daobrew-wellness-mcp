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
const assert = __importStar(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const native_predecessor_evidence_js_1 = require("../src/engine/taskmap/native-predecessor-evidence.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const tempHomes = [];
const GENERATED_AT = "2026-07-29T17:00:00.000Z";
(0, node_test_1.afterEach)(() => {
    for (const home of tempHomes.splice(0)) {
        (0, node_fs_1.rmSync)(home, { recursive: true, force: true });
    }
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function taskMapInput(generatedAt = GENERATED_AT, includeBodyContext = false) {
    const base = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt,
        pointers: [
            {
                id: "strategy-task",
                sourceKind: "strategy",
                sourceObjectId: "strategy-task-map-prototype",
                sourceRefHash: digest("strategy-task-ref"),
                canonicalUrl: "https://github.com/DaoBrewAI/DaoBrewStrategy/blob/09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57/tasks/TASKS.md",
                sourceVersion: "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57",
                authority: "source_system",
                syncMode: "return_only",
                capabilities: ["read_task", "deep_link"],
            },
        ],
        events: [
            {
                id: "event-strategy-task",
                pointerId: "strategy-task",
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-07-29T09:00:00.000Z",
                observedAt: generatedAt,
                objectRefs: ["work:task-map-prototype"],
                title: "Complete the Task Map product prototype",
                summary: "Close the bounded input to map to approval loop.",
                extractionConfidence: 1,
                sourceStatus: "in_progress",
                priority: 1,
            },
        ],
    };
    if (!includeBodyContext)
        return base;
    base.pointers.push({
        id: "meeting-work",
        sourceKind: "gemini_meet",
        sourceObjectId: "meeting-work-context",
        sourceRefHash: digest("meeting-work-ref"),
        sourceVersion: "meeting-revision-1",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    }, {
        id: "oura-body",
        sourceKind: "oura",
        sourceObjectId: digest("body-object"),
        sourceRefHash: digest("body-ref"),
        sourceVersion: digest("body-revision"),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    });
    base.events.push({
        id: "event-meeting-work",
        pointerId: "meeting-work",
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-29T10:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-29",
        objectRefs: ["work:task-map-prototype"],
        title: "Task Map demo discussion",
        summary: "Independent meeting context for the same workstream.",
        extractionConfidence: 1,
        bodyJoinEligible: true,
    }, {
        id: "receipt-strategy",
        pointerId: "strategy-task",
        recordKind: "receipt",
        activity: "receipt_observed",
        occurredAt: "2026-07-29T16:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-29",
        objectRefs: ["coverage:strategy:2026-07-29"],
        title: "Strategy coverage",
        summary: "Complete daily strategy coverage.",
        extractionConfidence: 1,
        corpusCoverage: "complete",
    }, {
        id: "receipt-meeting",
        pointerId: "meeting-work",
        recordKind: "receipt",
        activity: "receipt_observed",
        occurredAt: "2026-07-29T16:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-29",
        objectRefs: ["coverage:meeting:2026-07-29"],
        title: "Meeting coverage",
        summary: "Complete daily meeting coverage.",
        extractionConfidence: 1,
        corpusCoverage: "complete",
    }, {
        id: "event-body",
        pointerId: "oura-body",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-29T07:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-29",
        objectRefs: ["body:2026-07-29"],
        title: "Private relative recovery context",
        summary: "Recovery was below the preceding personal range.",
        extractionConfidence: 1,
        bodyCategory: "below_baseline",
        bodyAxis: "composite_recovery",
    });
    return base;
}
function semanticBrain(input, includeBodyContext = false) {
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "native-deterministic-test",
        model: "native-deterministic-test.1",
        promptHash: digest("native-predecessor-prompt"),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: input.generatedAt,
        roots: [
            {
                proposalId: "root-task-map",
                title: "Make Task Map a daily-use internal product",
                summary: "One accepted workstream for the bounded demo loop.",
                evidenceEventIds: [
                    "event-strategy-task",
                    ...(includeBodyContext ? ["event-meeting-work"] : []),
                ],
                memberObjectRefs: ["work:task-map-prototype"],
                confidence: 1,
            },
        ],
        tasks: [
            {
                proposalId: "task-task-map",
                rootProposalId: "root-task-map",
                title: "Complete the Task Map product prototype",
                summary: "Close the bounded input to map to approval loop.",
                evidenceEventIds: ["event-strategy-task"],
                authoritativeTaskEventId: "event-strategy-task",
                openState: "open",
                confidence: 1,
            },
        ],
        edges: [
            {
                proposalId: "edge-root-task",
                fromProposalId: "root-task-map",
                toProposalId: "task-task-map",
                relation: "advances",
                evidenceEventIds: ["event-strategy-task"],
                confidence: 1,
            },
        ],
    };
}
function causalInput() {
    return {
        rootProposalId: "root-task-map",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
            theme: "Make Task Map a daily-use internal product",
            targetHits: 1,
            targetN: 1,
            referenceRate: 0,
            referenceN: 0,
            citedDays: [
                {
                    date: "2026-07-29",
                    backed: true,
                    sources: ["gemini_meet"],
                },
            ],
            rtmSuspected: true,
        },
    };
}
function currentness(projection) {
    return {
        contractVersion: "taskmap-native-currentness-gate.v1",
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: "current",
        })),
    };
}
function fileBytes(value) {
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function fixture(input = {}) {
    const rawInput = taskMapInput(input.generatedAt, input.includeBodyContext ?? false);
    const brain = semanticBrain(rawInput, input.includeBodyContext ?? false);
    const previousProjection = input.previousProjection == null
        ? null
        : JSON.parse(JSON.stringify(input.previousProjection));
    const replay = {
        previousProjection,
        causalInputs: input.causalInputs ?? [],
    };
    const projection = (0, harness_js_1.buildTaskMapProjection)(rawInput, brain, {
        arm: "E4",
        now: rawInput.generatedAt,
        ...(replay.previousProjection === null
            ? {}
            : { previousProjection: replay.previousProjection }),
        causalInputs: replay.causalInputs,
    });
    assert.equal(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
    assert.deepEqual(projection.rejections, []);
    const gate = currentness(projection);
    return {
        taskMapInput: rawInput,
        semanticBrainOutput: brain,
        replay,
        projection,
        currentness: gate,
        projectionFileBytes: fileBytes(projection),
        currentnessFileBytes: fileBytes(gate),
    };
}
function createFixedHome(input) {
    const home = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-predecessor-home-")));
    tempHomes.push(home);
    const evidencePath = (0, native_predecessor_evidence_js_1.taskMapNativePredecessorEvidencePath)(home);
    const directory = node_path_1.default.dirname(evidencePath);
    (0, node_fs_1.mkdirSync)(directory, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(directory, 0o700);
    const projectionPath = node_path_1.default.join(directory, "taskmap-projection.v1.json");
    const currentnessPath = node_path_1.default.join(directory, "taskmap-currentness.v1.json");
    (0, node_fs_1.writeFileSync)(projectionPath, input.projectionFileBytes, { mode: 0o600 });
    (0, node_fs_1.writeFileSync)(currentnessPath, input.currentnessFileBytes, { mode: 0o600 });
    return {
        home,
        directory,
        evidencePath,
        projectionPath,
        currentnessPath,
    };
}
function context(input) {
    return {
        projection: input.projection,
        currentness: input.currentness,
        projectionFileBytes: input.projectionFileBytes,
        currentnessFileBytes: input.currentnessFileBytes,
    };
}
(0, node_test_1.describe)("Task Map native predecessor evidence", () => {
    (0, node_test_1.it)("writes and loads one fixed canonical 0600 replay bound to exact files", async () => {
        const input = fixture();
        const evidence = (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(input);
        const fixed = createFixedHome(input);
        const written = await (0, native_predecessor_evidence_js_1.writeTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
            evidence,
        });
        const loaded = await (0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
        });
        assert.equal(fixed.evidencePath, node_path_1.default.join(fixed.home, "Library", "Application Support", "DaoBrew", "taskmap", "taskmap-predecessor-evidence.v1.json"));
        assert.equal((0, node_fs_1.statSync)(fixed.directory).mode & 0o777, 0o700);
        assert.equal((0, node_fs_1.statSync)(fixed.evidencePath).mode & 0o777, 0o600);
        assert.equal((0, node_fs_1.readFileSync)(fixed.evidencePath, "utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(evidence));
        assert.deepEqual(loaded, written);
        assert.deepEqual(loaded.taskMapInput, input.taskMapInput);
        assert.deepEqual(loaded.semanticBrainOutput, input.semanticBrainOutput);
        assert.equal(loaded.binding.projectionFileDigest, digest(input.projectionFileBytes.toString("utf8")));
        assert.equal(Object.isFrozen(loaded), true);
        assert.equal(Object.isFrozen(loaded.taskMapInput), true);
    });
    (0, node_test_1.it)("detects exact projection/currentness file digest drift", async () => {
        const input = fixture();
        const evidence = (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(input);
        const fixed = createFixedHome(input);
        await (0, native_predecessor_evidence_js_1.writeTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
            evidence,
        });
        (0, node_fs_1.writeFileSync)(fixed.currentnessPath, Buffer.concat([input.currentnessFileBytes, Buffer.from(" ")]), { mode: 0o600 });
        await assert.rejects((0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
        }), /binding digests/);
        (0, node_fs_1.writeFileSync)(fixed.currentnessPath, input.currentnessFileBytes, { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(fixed.projectionPath, Buffer.concat([input.projectionFileBytes, Buffer.from(" ")]), { mode: 0o600 });
        await assert.rejects((0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
        }), /binding digests/);
    });
    (0, node_test_1.it)("rejects a tampered evidence payload before trusting embedded input", () => {
        const input = fixture();
        const evidence = structuredClone((0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(input));
        evidence.taskMapInput.events[0].summary =
            "Tampered after the artifact digest was issued.";
        assert.throws(() => (0, native_predecessor_evidence_js_1.assertTaskMapNativePredecessorEvidence)(evidence, context(input)), /artifactDigest/);
    });
    (0, node_test_1.it)("rejects an accepted-looking projection that is not the harness replay", () => {
        const input = fixture();
        const projection = structuredClone(input.projection);
        projection.tasks[0].summary = "Coordinated projection tamper.";
        const gate = currentness(projection);
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            projection,
            currentness: gate,
            projectionFileBytes: fileBytes(projection),
            currentnessFileBytes: fileBytes(gate),
        }), /canonically equal/);
    });
    (0, node_test_1.it)("rejects currentness with drifted binding or incomplete classification", () => {
        const input = fixture();
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            currentness: {
                ...input.currentness,
                runId: "tmrun_wrong",
            },
            currentnessFileBytes: fileBytes({
                ...input.currentness,
                runId: "tmrun_wrong",
            }),
        }), /currentness is not bound/);
        const incomplete = {
            ...input.currentness,
            taskDispositions: [],
        };
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            currentness: incomplete,
            currentnessFileBytes: fileBytes(incomplete),
        }), /currentness is not bound/);
    });
    (0, node_test_1.it)("rejects brain and input substitutions independently", () => {
        const input = fixture();
        const brain = structuredClone(input.semanticBrainOutput);
        brain.tasks[0].summary = "Substituted semantic output.";
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            semanticBrainOutput: brain,
        }), /semanticBrainOutput is not bound/);
        const rawInput = structuredClone(input.taskMapInput);
        rawInput.events[0].summary = "Substituted raw input.";
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            taskMapInput: rawInput,
        }), /taskMapInput is not bound/);
    });
    (0, node_test_1.it)("requires the exact previous projection and causal replay dependencies", () => {
        const predecessorInput = fixture({
            generatedAt: "2026-07-29T16:00:00.000Z",
        });
        const withPredecessor = fixture({
            previousProjection: predecessorInput.projection,
        });
        assert.doesNotThrow(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(withPredecessor));
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...withPredecessor,
            replay: {
                ...withPredecessor.replay,
                previousProjection: null,
            },
        }), /canonically equal/);
        const bodyReplay = fixture({
            includeBodyContext: true,
            causalInputs: [causalInput()],
        });
        assert.doesNotThrow(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(bodyReplay));
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...bodyReplay,
            replay: {
                ...bodyReplay.replay,
                causalInputs: [],
            },
        }), /canonically equal/);
    });
    (0, node_test_1.it)("rejects unknown schema fields and bounded-string overflow", () => {
        const input = fixture();
        const evidence = structuredClone((0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(input));
        evidence.unexpected = true;
        assert.throws(() => (0, native_predecessor_evidence_js_1.assertTaskMapNativePredecessorEvidence)(evidence, context(input)), /unsupported or missing fields/);
        const rawInput = structuredClone(input.taskMapInput);
        rawInput.events[0].summary = "x".repeat(65_537);
        assert.throws(() => (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)({
            ...input,
            taskMapInput: rawInput,
        }), /invalid string/);
    });
    (0, node_test_1.it)("rejects non-0600 fixed files, non-0700 directories, and unsafe paths", async () => {
        const input = fixture();
        const evidence = (0, native_predecessor_evidence_js_1.buildTaskMapNativePredecessorEvidence)(input);
        const fixed = createFixedHome(input);
        await (0, native_predecessor_evidence_js_1.writeTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
            evidence,
        });
        for (const filePath of [
            fixed.evidencePath,
            fixed.projectionPath,
            fixed.currentnessPath,
        ]) {
            (0, node_fs_1.chmodSync)(filePath, 0o644);
            await assert.rejects((0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
                homeDirectory: fixed.home,
            }), /0600/);
            (0, node_fs_1.chmodSync)(filePath, 0o600);
        }
        (0, node_fs_1.chmodSync)(fixed.directory, 0o755);
        await assert.rejects((0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
            homeDirectory: fixed.home,
        }), /0700/);
        (0, node_fs_1.chmodSync)(fixed.directory, 0o700);
        assert.throws(() => (0, native_predecessor_evidence_js_1.taskMapNativePredecessorEvidencePath)("relative/home"), /normalized absolute path/);
    });
});
