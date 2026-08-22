"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const task_ranking_publication_js_1 = require("../src/engine/taskmap/task-ranking-publication.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const work_control_decision_js_1 = require("../src/engine/taskmap/work-control-decision.js");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`ranking:${label}`);
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
                occurredAt: "2026-08-02T12:00:00.000Z",
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
        total: 0.999,
    });
    const beta = task("beta", { ...ZERO_SCORE });
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: harness_js_1.TASKMAP_ALGORITHM_POLICY_DIGEST,
        runStatus: "accepted",
        arm: "E4",
        runId: `tmrun_${digest("run").slice(0, 16)}`,
        generatedAt: "2026-08-02T12:00:00.000Z",
        inputDigest: digest("input"),
        brain: null,
        sources: [{
                id: "session-alpha",
                sourceKind: "codex_session",
                authority: "source_system",
                syncMode: "reference_only",
                capabilities: ["read_task"],
            }, {
                id: "session-beta",
                sourceKind: "codex_session",
                authority: "source_system",
                syncMode: "reference_only",
                capabilities: ["read_task"],
            }],
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
function statuses(agentDisposition = "fresh") {
    return [
        {
            source: "agent_session",
            disposition: agentDisposition,
            sliceDigest: digest("agent"),
        },
        { source: "meeting_notes", disposition: "unavailable", sliceDigest: null },
        { source: "calendar", disposition: "unavailable", sliceDigest: null },
        { source: "body", disposition: "unavailable", sliceDigest: null },
    ];
}
(0, node_test_1.describe)("task-level ranking publication", () => {
    (0, node_test_1.it)("admits only an exact proof-bound manual owner receipt without changing scoring", () => {
        const source = projection();
        const promotionDigest = digest("owner-promotion");
        const pointerId = `tmcandidatepromotion_${promotionDigest}`;
        const eventId = `tmcandidatepromotionevent_${promotionDigest}`;
        const promoted = source.tasks[0];
        source.tasks = [{
                ...promoted,
                reviewState: "accepted",
                authority: "user",
                taskHomePointerId: pointerId,
                originPointerIds: [pointerId],
                returnRoute: {
                    state: "user_destination_required",
                    requiresApproval: true,
                },
                citations: [{
                        ...promoted.citations[0],
                        eventId,
                        pointerId,
                        sourceKind: "manual",
                        sourceRefHash: promotionDigest,
                    }],
                discoveredBy: ["manual"],
            }];
        source.roots = source.roots.map((root) => ({
            ...root,
            taskIds: [promoted.id],
        }));
        source.sources = [{
                id: pointerId,
                sourceKind: "manual",
                sourceVersion: promotionDigest,
                authority: "user",
                syncMode: "personal_fork",
                capabilities: ["read_task"],
            }];
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses("retained_last_good"),
        });
        node_assert_1.default.equal(ranking.rankedAcceptedOpen.length, 1);
        node_assert_1.default.equal(ranking.rankedAcceptedOpen[0].scoreBasisPoints, 2_500);
        for (const mutate of [
            (draft) => { draft.tasks[0].authority = "none"; },
            (draft) => { draft.tasks[0].taskHomePointerId = "other"; },
            (draft) => { draft.tasks[0].citations[0].eventId = `event_${promotionDigest}`; },
            (draft) => { draft.tasks[0].citations[0].sourceRefHash = digest("other"); },
            (draft) => { draft.sources[0].sourceVersion = digest("other"); },
            (draft) => { draft.sources[0].authority = "source_system"; },
            (draft) => { draft.sources[0].syncMode = "reference_only"; },
            (draft) => { draft.sources[0].capabilities = ["read_task", "read_context"]; },
            (draft) => { draft.sources[0].canonicalUrl = "https://example.invalid"; },
        ]) {
            const forged = structuredClone(source);
            mutate(forged);
            node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: forged,
                ownerScopeDigest: OWNER,
                sourceStatuses: statuses("retained_last_good"),
            }), /citation from unavailable source family|manual receipt proof/);
        }
    });
    (0, node_test_1.it)("publishes an exact no-imputation matrix for every current connector subset", () => {
        const workFamilyByTask = new Map([
            [taskId("alpha"), "agent_session"],
            [taskId("beta"), "meeting_notes"],
        ]);
        const sourceKindByWorkFamily = {
            agent_session: "codex_session",
            meeting_notes: "gemini_meet",
        };
        for (let mask = 0; mask < (1 << owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.length); mask += 1) {
            const current = new Set(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.filter((_, index) => (mask & (1 << index)) !== 0));
            const source = projection();
            source.tasks = source.tasks.filter((candidate) => {
                const family = workFamilyByTask.get(candidate.id);
                return family !== undefined && current.has(family);
            }).map((candidate) => {
                const family = workFamilyByTask.get(candidate.id);
                const sourceKind = sourceKindByWorkFamily[family];
                return {
                    ...candidate,
                    citations: candidate.citations.map((citation) => ({
                        ...citation,
                        sourceKind,
                    })),
                    discoveredBy: [family],
                };
            });
            source.roots = source.tasks.length === 0
                ? []
                : source.roots.map((root) => ({
                    ...root,
                    taskIds: source.tasks.map((candidate) => candidate.id),
                }));
            const sourceStatuses = owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((family) => ({
                source: family,
                disposition: current.has(family)
                    ? "fresh"
                    : "unavailable",
                sliceDigest: current.has(family) ? digest(`slice:${family}`) : null,
            }));
            const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: source,
                ownerScopeDigest: OWNER,
                sourceStatuses,
            });
            node_assert_1.default.deepStrictEqual(ranking.rankedAcceptedOpen.map((row) => row.taskId).sort(), source.tasks.map((candidate) => candidate.id).sort());
            node_assert_1.default.ok(ranking.rankedAcceptedOpen.every((row) => row.citations.every((citation) => {
                const family = citation.sourceKind === "codex_session"
                    ? "agent_session"
                    : "meeting_notes";
                return current.has(family);
            })));
            node_assert_1.default.deepStrictEqual(ranking.coverage.map((row) => ({
                source: row.source,
                state: row.state,
                sliceDigest: row.sliceDigest,
            })), sourceStatuses.map((row) => ({
                source: row.source,
                state: row.disposition === "fresh" ? "current" : "unavailable",
                sliceDigest: row.sliceDigest,
            })));
            node_assert_1.default.ok(ranking.coverage.every((row) => row.state === "current"
                ? row.sliceDigest !== null
                : row.sliceDigest === null));
            if (!current.has("agent_session") && !current.has("meeting_notes")) {
                node_assert_1.default.deepStrictEqual(ranking.rankedAcceptedOpen, []);
            }
        }
    });
    (0, node_test_1.it)("binds every accepted-open task to the exact scorer, projection, policy, citations, and coverage", () => {
        const source = projection();
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        });
        node_assert_1.default.deepStrictEqual(ranking.rankedAcceptedOpen.map((row) => row.taskId), [
            taskId("alpha"),
            taskId("beta"),
        ]);
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[0].scoreBasisPoints, 2_500);
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[1].scoreBasisPoints, 0);
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[1].reasonCodes.length, 0);
        node_assert_1.default.strictEqual(ranking.policy.version, work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_VERSION);
        node_assert_1.default.strictEqual(ranking.policy.digest, work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST);
        node_assert_1.default.deepStrictEqual((0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(ranking, source, OWNER), ranking);
    });
    (0, node_test_1.it)("treats missing evidence as zero without renormalizing and ignores legacy total", () => {
        const source = projection();
        const alpha = source.tasks[0];
        const score = alpha.score;
        delete score.evidenceStrength;
        score.total = 1;
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        });
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[0].scoreBasisPoints, 2_500);
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[0].factorBasisPoints.evidenceStrength, 0);
    });
    (0, node_test_1.it)("does not confuse a real demographic citation identifier with a demo marker", () => {
        const source = projection();
        source.tasks[0].citations[0].eventId = "demographic-owner-event";
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        });
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[0].citations[0].eventId, "demographic-owner-event");
    });
    (0, node_test_1.it)("matches Swift case-insensitive synthetic-marker containment without rejecting legitimate identifiers", () => {
        for (const legitimate of [
            "event-demo-owner",
            "synthetic-data-review",
            "showcase-planning",
            "fixture-repair",
            "event-demonstration-2026-08-02",
        ]) {
            const source = projection();
            source.tasks[0].citations[0].eventId = legitimate;
            node_assert_1.default.doesNotThrow(() => (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: source,
                ownerScopeDigest: OWNER,
                sourceStatuses: statuses(),
            }));
        }
        for (const forbidden of [
            "wednesday-demo-leaf",
            "REVIEWER-ALPHA-UNVERSIONED",
            "taskrankingsnapshot.demo",
            "showcase-source",
            "DEMO_USER_ID",
        ]) {
            const source = projection();
            source.tasks[0].citations[0].eventId = `event-${forbidden}`;
            node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
                projection: source,
                ownerScopeDigest: OWNER,
                sourceStatuses: statuses(),
            }), /demo marker/);
        }
    });
    (0, node_test_1.it)("accepts a legitimate real citation observed on the former fixture date", () => {
        const source = projection();
        source.tasks[0].citations[0].occurredAt =
            "2025-02-26T19:30:00.000Z";
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        });
        node_assert_1.default.strictEqual(ranking.rankedAcceptedOpen[0].citations[0].occurredAt, "2025-02-26T19:30:00.000Z");
    });
    (0, node_test_1.it)("fails closed on retained/stale citations, unknown keys, and row mismatch", () => {
        const source = projection();
        node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses("retained_last_good"),
        }), /unavailable source family/);
        const ranking = (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        });
        node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)({ ...ranking, extra: true }, source, OWNER), /document keys/);
        const tampered = structuredClone(ranking);
        tampered.rankedAcceptedOpen[0].scoreBasisPoints += 1;
        node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(tampered, source, OWNER), /canonical projection\/rank mismatch/);
    });
    (0, node_test_1.it)("rejects an accepted-open ranked task without a projection citation", () => {
        const source = projection();
        source.tasks[0].citations = [];
        node_assert_1.default.throws(() => (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
            projection: source,
            ownerScopeDigest: OWNER,
            sourceStatuses: statuses(),
        }), /ranked task citation/);
    });
});
