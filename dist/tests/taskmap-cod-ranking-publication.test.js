"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const cod_ranking_publication_js_1 = require("../src/engine/taskmap/cod-ranking-publication.js");
const task_ranking_publication_js_1 = require("../src/engine/taskmap/task-ranking-publication.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`cod-ranking:${label}`);
const OWNER = digest("owner");
const ROOT_ID = `tmr_${digest("root").slice(0, 16)}`;
const taskId = (label) => `tmt_${digest(`task:${label}`).slice(0, 16)}`;
const ZERO_SCORE = {
    sourcePriority: 0,
    deadlinePressure: 0,
    dependencyImpact: 0,
    recurrence: 0,
    staleOpen: 0,
    evidenceStrength: 0,
    bodyBonus: 0,
    total: 0,
};
function task(label, score) {
    return {
        id: taskId(label),
        rootId: ROOT_ID,
        title: `Owner work ${label}`,
        summary: `Current owner evidence ${label}`,
        reviewState: "accepted",
        openState: "open",
        authority: "source_system",
        taskHomePointerId: `session-${label}`,
        originPointerIds: [`session-${label}`],
        returnRoute: {
            state: "source_return",
            pointerId: `session-${label}`,
            requiresApproval: true,
        },
        citations: [{
                eventId: `event-${label}`,
                pointerId: `session-${label}`,
                sourceKind: "codex_session",
                sourceRefHash: digest(`ref:${label}`).slice(0, 16),
                occurredAt: "2026-08-14T12:00:00.000Z",
                extractionConfidence: 1,
            }],
        score,
        whyNow: [],
        discoveredBy: ["agent_session"],
        bodyContextCount: 0,
    };
}
function projection() {
    const alpha = task("alpha", {
        ...ZERO_SCORE,
        sourcePriority: 1,
        total: 1,
    });
    const beta = task("beta", { ...ZERO_SCORE });
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: harness_js_1.TASKMAP_ALGORITHM_POLICY_DIGEST,
        runStatus: "accepted",
        arm: "E4",
        runId: `tmrun_${digest("run").slice(0, 16)}`,
        generatedAt: "2026-08-14T12:00:00.000Z",
        inputDigest: digest("input"),
        brain: null,
        sources: ["alpha", "beta"].map((label) => ({
            id: `session-${label}`,
            sourceKind: "codex_session",
            authority: "source_system",
            syncMode: "reference_only",
            capabilities: ["read_task"],
        })),
        roots: [{
                id: ROOT_ID,
                title: "Owner work",
                summary: "Current accepted work",
                taskIds: [alpha.id, beta.id],
                memberObjectRefs: ["work-alpha", "work-beta"],
                citations: [],
                causalGrade: "C0_NO_DATA",
                bodyContextCount: 0,
                scoreBreakdown: {
                    maxChildActionability: 0,
                    rootRecurrence: 0,
                    evidenceStrength: 0,
                    sourceBreadth: 0,
                    actionableLoad: 0,
                    dependencyBreadth: 0,
                    bodyBonus: 0,
                    total: 0,
                },
                score: 0,
                whyNow: [],
            }],
        tasks: [alpha, beta],
        edges: [],
        rejections: [],
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
}
function statuses() {
    return [
        { source: "agent_session", disposition: "fresh", sliceDigest: digest("agent") },
        { source: "meeting_notes", disposition: "unavailable", sliceDigest: null },
        { source: "calendar", disposition: "unavailable", sliceDigest: null },
        { source: "body", disposition: "unavailable", sliceDigest: null },
    ];
}
function v1Input() {
    return {
        projection: projection(),
        ownerScopeDigest: OWNER,
        sourceStatuses: statuses(),
    };
}
function completeFixture() {
    return {
        ...v1Input(),
        factors: [
            { taskId: taskId("alpha"), costOfDelayBasisPoints: 4_000, effort: 4 },
            { taskId: taskId("beta"), costOfDelayBasisPoints: 3_000, effort: 1 },
        ],
    };
}
function oneTaskMissingEffortFixture() {
    return {
        ...v1Input(),
        factors: [
            { taskId: taskId("alpha"), costOfDelayBasisPoints: 4_000, effort: 4 },
            { taskId: taskId("beta"), costOfDelayBasisPoints: 3_000, effort: null },
        ],
    };
}
function reseal(draft) {
    const { artifactDigest: _artifactDigest, ...core } = draft;
    draft.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return draft;
}
(0, node_test_1.describe)("Task Map policy.2 publication", () => {
    (0, node_test_1.it)("publishes policy.2 when every required factor is present", () => {
        const doc = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(completeFixture());
        strict_1.default.equal(doc.policy.version, "taskmap-work-control-policy.2");
        strict_1.default.equal(doc.fallback.applied, false);
        strict_1.default.equal(doc.fallback.reason, null);
        strict_1.default.deepEqual(doc.authorityBoundary, {
            membershipCreated: false,
            readinessCreatedByCausalData: false,
            approvalGranted: false,
            executionStarted: false,
            completionGranted: false,
        });
        strict_1.default.deepEqual(doc.rankedAcceptedOpen.map((row) => row.taskId), [
            taskId("beta"),
            taskId("alpha"),
        ]);
    });
    (0, node_test_1.it)("falls the WHOLE run back to policy.1 when any task lacks effort", () => {
        const doc = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(oneTaskMissingEffortFixture());
        strict_1.default.equal(doc.policy.version, "taskmap-work-control-policy.1");
        strict_1.default.equal(doc.fallback.applied, true);
        strict_1.default.equal(doc.fallback.reason, "required_factor_unavailable");
        strict_1.default.ok(doc.rankedAcceptedOpen.every((row) => row.policyVersion === "taskmap-work-control-policy.1"));
        strict_1.default.deepEqual(doc.rankedAcceptedOpen.map((row) => row.taskId), [
            taskId("alpha"),
            taskId("beta"),
        ]);
    });
    (0, node_test_1.it)("falls the whole run back when cost of delay or a factor row is unavailable", () => {
        const missingCost = completeFixture();
        missingCost.factors[0].costOfDelayBasisPoints = null;
        const missingRow = completeFixture();
        missingRow.factors.pop();
        for (const input of [missingCost, missingRow]) {
            const doc = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(input);
            strict_1.default.equal(doc.policy.version, "taskmap-work-control-policy.1");
            strict_1.default.equal(doc.fallback.applied, true);
            strict_1.default.ok(doc.rankedAcceptedOpen.every((row) => row.policyVersion === "taskmap-work-control-policy.1"));
        }
    });
    (0, node_test_1.it)("never mixes policies in one artifact", () => {
        for (const fixture of [completeFixture(), oneTaskMissingEffortFixture()]) {
            const doc = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(fixture);
            strict_1.default.equal(new Set(doc.rankedAcceptedOpen.map((row) => row.policyVersion)).size, 1);
            strict_1.default.ok(doc.rankedAcceptedOpen.every((row) => row.policyVersion === doc.policy.version
                && row.policyDigest === doc.policy.digest));
        }
    });
    (0, node_test_1.it)("writes to a distinct filename from the v1 publication", () => {
        strict_1.default.notEqual(cod_ranking_publication_js_1.TASKMAP_COD_RANKING_FILENAME, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME);
        strict_1.default.equal(cod_ranking_publication_js_1.TASKMAP_COD_RANKING_FILENAME, "taskmap-task-ranking.v2.json");
    });
    (0, node_test_1.it)("leaves the v1 publication byte-identical for the same projection", () => {
        const input = v1Input();
        const before = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)(input);
        (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(completeFixture());
        const after = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)(input);
        strict_1.default.equal(before.artifactDigest, after.artifactDigest);
        strict_1.default.deepEqual(before, after);
    });
    (0, node_test_1.it)("seals a replayable artifact and rejects a tampered row", () => {
        const input = completeFixture();
        const doc = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(input);
        strict_1.default.deepEqual((0, cod_ranking_publication_js_1.validateTaskMapCodRankingPublication)(doc, input), doc);
        const forged = structuredClone(doc);
        forged.rankedAcceptedOpen[0].scoreBasisPoints += 1;
        strict_1.default.throws(() => (0, cod_ranking_publication_js_1.validateTaskMapCodRankingPublication)(forged, input), /canonical|digest|ranking/i);
    });
    (0, node_test_1.it)("is factor-order independent and rejects duplicate, extra, and malformed factor rows", () => {
        const canonical = completeFixture();
        const reversed = completeFixture();
        reversed.factors.reverse();
        strict_1.default.deepEqual((0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(reversed), (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(canonical));
        const duplicate = completeFixture();
        duplicate.factors.push({ ...duplicate.factors[0] });
        const extra = completeFixture();
        extra.factors.push({
            taskId: taskId("not-ranked"),
            costOfDelayBasisPoints: 1,
            effort: 1,
        });
        const malformed = [
            { costOfDelayBasisPoints: -1 },
            { costOfDelayBasisPoints: 0.5 },
            { costOfDelayBasisPoints: Number.NaN },
            { effort: 0 },
            { effort: Number.POSITIVE_INFINITY },
        ];
        for (const input of [duplicate, extra]) {
            strict_1.default.throws(() => (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(input), /factor.*invalid|duplicate|ranked set|factor collection.*bounded/i);
        }
        for (const patch of malformed) {
            const input = completeFixture();
            Object.assign(input.factors[0], patch);
            strict_1.default.throws(() => (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(input), /factor.*invalid/i);
        }
        const unknownKey = completeFixture();
        unknownKey.factors[0].unexpected = true;
        strict_1.default.throws(() => (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(unknownKey), /factor.*keys/i);
    });
    (0, node_test_1.it)("rejects re-sealed policy, fallback, coverage, privacy, citation, and row mutations", () => {
        const input = completeFixture();
        const original = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(input);
        const mutations = [
            (draft) => { draft.policy.digest = "0".repeat(64); },
            (draft) => {
                draft.fallback = {
                    applied: true,
                    reason: "required_factor_unavailable",
                };
            },
            (draft) => {
                draft.coverage[0].state = "unavailable";
                draft.coverage[0].sliceDigest = null;
            },
            (draft) => {
                draft.privacy
                    .sourceBodiesStored = true;
            },
            (draft) => {
                draft.authorityBoundary
                    .approvalGranted = true;
            },
            (draft) => {
                draft.rankedAcceptedOpen[0].citations[0].sourceRefHash = "forged";
            },
            (draft) => {
                const row = draft.rankedAcceptedOpen[0];
                if (!("factorInputs" in row))
                    throw new Error("expected policy.2 row");
                row.factorInputs.effort = 16;
            },
            (draft) => { draft.rankedAcceptedOpen[0].scoreBasisPoints += 1; },
            (draft) => {
                draft.rankedAcceptedOpen[0]
                    .unexpected = true;
            },
        ];
        for (const mutate of mutations) {
            const forged = structuredClone(original);
            mutate(forged);
            reseal(forged);
            strict_1.default.throws(() => (0, cod_ranking_publication_js_1.validateTaskMapCodRankingPublication)(forged, input), /canonical|keys|ranking/i);
        }
    });
});
