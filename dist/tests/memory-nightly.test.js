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
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const nightly_js_1 = require("../src/engine/memory/nightly.js");
const keys_js_1 = require("../src/engine/memory/keys.js");
const NOW = 1_800_000_000;
const USER = "local";
const GHOST_ID = "ghost_root_local";
const TID = (0, keys_js_1.threadId)(USER, `root:${GHOST_ID}`);
const ghostRow = {
    id: GHOST_ID,
    title: "Late-night deploy crunch",
    subtitle: "attribution candidate",
    occurred_at_ts: NOW - 86_400,
    created_at_ts: NOW - 172_800,
    props_json: {
        status: "suggested",
        claim_level: "source_backed_hypothesis_not_settled_causality",
        recurrence_count: 3,
        active_weeks: ["2026-06-15", "2026-06-22", "2026-06-29"],
        hidden_raw_refs: ["memory:ins1", "granola:note1", "granola:ghostnote", "state:1799000000"],
        supporting_calendar_events: [{ id: "e1", title: "Deploy window", source_ref: "calendar:ev1" }],
        supporting_meeting_notes: [{ id: "m1", title: "Deploy sync", source_ref: "granola:note1" }],
    },
};
const contextNodeRows = [
    { id: "ep1", kind: "episode", title: "Stress episode", element: "wood" },
    { id: "pat_wood", kind: "pattern", title: "Wood", element: "wood" },
    { id: "pat_metal", kind: "pattern", title: "Metal", element: "metal" },
];
const edgeRows = [
    { id: "edge1", src_id: "ep1", dst_id: GHOST_ID, kind: "evidence_for" },
    { id: "edge2", src_id: "ep1", dst_id: "pat_wood", kind: "manifested" },
    // 'tagged' is not a causal traversal kind; pat_metal must NOT reach the thread.
    { id: "edge3", src_id: "ep1", dst_id: "pat_metal", kind: "tagged" },
];
const meetingRows = [
    { id: "mn_1", source_ref: "note1", occurred_at_ts: NOW - 90_000, body: "TRANSCRIPT_BODY_SENTINEL" },
];
const eventRows = [{ id: "ev_row_1", source_ref: "ev1", occurred_at_ts: NOW - 100_000 }];
const insightRows = [{ id: "ui_1", source_ref: "ins1", occurred_at_ts: NOW - 80_000 }];
const threadRecomputeRows = [{ id: TID, claim_level: "attribution_candidate" }];
const evidenceRecomputeRows = [
    { thread_id: TID, observed_at_ts: NOW - 80_000, weight: 1 },
    { thread_id: TID, observed_at_ts: NOW - 90_000, weight: 1 },
];
function defaultFixtures() {
    return [
        [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [ghostRow]],
        [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind IN \('pattern','episode'\)/, contextNodeRows],
        [/FROM graph_edges WHERE user_id = __daobrew_scope\.uid/, edgeRows],
        [/FROM meeting_notes WHERE/, meetingRows],
        [/FROM events WHERE/, eventRows],
        [/FROM user_insights WHERE/, insightRows],
        [/SELECT id, claim_level FROM causal_memory_threads WHERE/, threadRecomputeRows],
        [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, evidenceRecomputeRows],
    ];
}
function makeQuery(fixtures) {
    return async (sql) => {
        for (const [pattern, rows] of fixtures) {
            if (pattern.test(sql))
                return rows;
        }
        return [];
    };
}
async function runWith(fixtures, extraDeps = {}) {
    const calls = [];
    const queries = [];
    const fixtureQuery = makeQuery(fixtures);
    const result = await (0, nightly_js_1.runNightlyThreadMaintenance)({
        userId: USER,
        exec: async (sql) => { calls.push(sql); },
        query: async (sql) => { queries.push(sql); return fixtureQuery(sql); },
        nowTs: () => NOW,
        ...extraDeps,
    });
    return { calls, queries, result };
}
(0, node_test_1.describe)("layer 2 nightly thread maintenance", () => {
    (0, node_test_1.it)("upserts a thread from a ghost node with mapped claim, copied recurrence, and pattern keys", async () => {
        const { calls, result } = await runWith(defaultFixtures());
        const threadSql = calls.filter((sql) => /INSERT INTO causal_memory_threads/.test(sql));
        assert.equal(threadSql.length, 1);
        assert.match(threadSql[0], /'attribution_candidate'/);
        assert.ok(threadSql[0].includes(`'["wood"]'::jsonb, 3,`)); // wood via manifested; recurrence copied, never incremented
        assert.ok(!threadSql[0].includes("metal")); // tagged edges are not causal traversal
        assert.match(threadSql[0], /ON CONFLICT \(user_id, thread_key\) DO UPDATE/);
        assert.match(threadSql[0], /GREATEST\(causal_memory_threads\.recurrence_count, EXCLUDED\.recurrence_count\)/);
        assert.ok(threadSql[0].includes(`'root:${GHOST_ID}'`));
        assert.ok(threadSql[0].includes(`'${TID}'`));
        assert.equal(result.threadsUpserted, 1);
        assert.equal(result.evidenceInserted, 5); // ins1, note1, ghostnote (unresolved), ev1, state biometric
        assert.deepEqual(result.warnings, ["unresolved_refs: 1"]);
        assert.deepEqual(result.alerts, []);
        // Two metrics rows per nightly: the job row + the MRT comparison row.
        const metricsSql = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql) && /'layer2:nightly'/.test(sql));
        assert.equal(metricsSql.length, 1);
        assert.match(metricsSql[0], /unresolved_refs: 1/);
    });
    (0, node_test_1.it)("inserts deterministic evidence ids with a monotone NULL-fill upsert", async () => {
        const { calls } = await runWith(defaultFixtures());
        const evidenceSql = calls.filter((sql) => /INSERT INTO causal_thread_evidence/.test(sql));
        assert.equal(evidenceSql.length, 1);
        // Q3(a): conflict fills NULLs only — an existing timestamp/source is never overwritten.
        assert.match(evidenceSql[0], /ON CONFLICT \(id\) DO UPDATE SET/);
        assert.match(evidenceSql[0], /observed_at_ts = COALESCE\(causal_thread_evidence\.observed_at_ts, EXCLUDED\.observed_at_ts\)/);
        assert.match(evidenceSql[0], /source_id = COALESCE\(causal_thread_evidence\.source_id, EXCLUDED\.source_id\)/);
        assert.doesNotMatch(evidenceSql[0], /observed_at_ts = EXCLUDED\.observed_at_ts/);
        // Evidence ids hash the bare source_ref so resolution state never changes the id.
        const meetingEvidenceId = (0, keys_js_1.evidenceId)({
            threadId: TID, sourceTable: "meeting_notes", sourceId: "note1",
            graphNodeId: null, graphEdgeId: null, evidenceRole: "observation",
        });
        const biometricEvidenceId = (0, keys_js_1.evidenceId)({
            threadId: TID, sourceTable: null, sourceId: "1799000000",
            graphNodeId: null, graphEdgeId: null, evidenceRole: "observation",
        });
        assert.ok(evidenceSql[0].includes(`'${meetingEvidenceId}'`));
        assert.ok(evidenceSql[0].includes(`'${biometricEvidenceId}'`));
        assert.match(evidenceSql[0], /'biometric'/);
        // Resolved rows carry the source id; unresolved rows keep the ref with NULL source_id.
        assert.match(evidenceSql[0], /'mn_1'/);
        assert.match(evidenceSql[0], /NULL, 'ghostnote'/);
    });
    (0, node_test_1.it)("is idempotent: re-running over identical rows emits byte-identical write SQL", async () => {
        const first = await runWith(defaultFixtures());
        const second = await runWith(defaultFixtures());
        const writes = (calls) => calls.filter((sql) => (/INSERT INTO causal_memory_threads|INSERT INTO causal_thread_evidence|UPDATE causal_memory_threads/.test(sql)));
        assert.ok(writes(first.calls).length > 0);
        assert.deepEqual(writes(first.calls), writes(second.calls));
        assert.deepEqual(first.result, second.result);
    });
    (0, node_test_1.it)("adds a weighted intervention_outcome evidence row for detonated (done) ghosts", async () => {
        const doneGhost = {
            id: "ghost_done",
            title: "Resolved crunch",
            subtitle: null,
            occurred_at_ts: NOW - 50_000,
            created_at_ts: NOW - 60_000,
            props_json: { status: "done", claim_level: "source_backed_hypothesis_not_settled_causality", recurrence_count: 2 },
        };
        const fixtures = [
            [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [doneGhost]],
            [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
            [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
        ];
        const { calls, result } = await runWith(fixtures);
        const threadSql = calls.find((sql) => /INSERT INTO causal_memory_threads/.test(sql)) ?? "";
        assert.match(threadSql, /'done'/);
        const evidenceSql = calls.find((sql) => /INSERT INTO causal_thread_evidence/.test(sql)) ?? "";
        assert.match(evidenceSql, /'intervention_outcome'/);
        assert.match(evidenceSql, /'system_initiated_intervention'/);
        assert.match(evidenceSql, /2\.5/);
        assert.ok(evidenceSql.includes(`'ghost_done'`)); // graph_node_id tags the detonated ghost
        assert.equal(result.evidenceInserted, 1);
    });
    (0, node_test_1.it)("classifies plaud: and gdocs: refs as meeting-note evidence exactly like granola:", async () => {
        const multiSourceGhost = {
            id: "ghost_multisource",
            title: "Cross-source crunch",
            subtitle: null,
            occurred_at_ts: NOW - 10_000,
            created_at_ts: NOW - 20_000,
            props_json: {
                status: "suggested",
                claim_level: "source_backed_hypothesis_not_settled_causality",
                recurrence_count: 1,
                hidden_raw_refs: ["plaud:filep1", "gdocs:doc1", "granola:note1"],
            },
        };
        const fixtures = [
            [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [multiSourceGhost]],
            [/FROM meeting_notes WHERE/, [
                    { id: "mn_plaud", source_ref: "filep1", occurred_at_ts: NOW - 90_000 },
                    { id: "mn_gdocs", source_ref: "doc1", occurred_at_ts: NOW - 91_000 },
                    { id: "mn_1", source_ref: "note1", occurred_at_ts: NOW - 92_000 },
                ]],
            [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
            [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
        ];
        const { calls, queries, result } = await runWith(fixtures);
        assert.equal(result.evidenceInserted, 3);
        assert.deepEqual(result.warnings, []);
        // All three refs resolve through the ONE meeting_notes lookup.
        const lookup = queries.find((sql) => /FROM meeting_notes WHERE/.test(sql)) ?? "";
        assert.ok(lookup.includes("'filep1'") && lookup.includes("'doc1'") && lookup.includes("'note1'"), `meeting_notes lookup must cover plaud/gdocs/granola bare refs, got: ${lookup}`);
        const evidenceSql = calls.find((sql) => /INSERT INTO causal_thread_evidence/.test(sql)) ?? "";
        assert.ok(evidenceSql.includes("'mn_plaud'"));
        assert.ok(evidenceSql.includes("'mn_gdocs'"));
        assert.ok(evidenceSql.includes("'mn_1'"));
    });
    (0, node_test_1.it)("skips unknown ref prefixes and reports them as unresolved_refs", async () => {
        const weirdGhost = {
            id: "ghost_weird",
            title: "Odd refs",
            subtitle: null,
            occurred_at_ts: NOW - 10_000,
            created_at_ts: NOW - 20_000,
            props_json: {
                status: "suggested",
                claim_level: "insufficient_evidence",
                recurrence_count: 1,
                hidden_raw_refs: ["weird:abc", "noprefixref"],
            },
        };
        const fixtures = [
            [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [weirdGhost]],
            [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
            [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
        ];
        const { calls, result } = await runWith(fixtures);
        assert.deepEqual(result.warnings, ["unresolved_refs: 2"]);
        assert.equal(result.evidenceInserted, 0);
        assert.ok(!calls.join("\n").includes("weird:abc"));
        // insufficient_evidence maps to the bottom rung
        const threadSql = calls.find((sql) => /INSERT INTO causal_memory_threads/.test(sql)) ?? "";
        assert.match(threadSql, /'correlation'/);
    });
    (0, node_test_1.it)("records a job_failed metrics row, posts the alert webhook, and rethrows on failure", async () => {
        const calls = [];
        const webhookCalls = [];
        await assert.rejects(() => (0, nightly_js_1.runNightlyThreadMaintenance)({
            userId: USER,
            exec: async (sql) => {
                if (/INSERT INTO causal_memory_threads/.test(sql))
                    throw new Error("neon down");
                calls.push(sql);
            },
            query: makeQuery(defaultFixtures()),
            nowTs: () => NOW,
            alertWebhook: "https://hooks.example.com/layer2",
            fetchImpl: (async (url, init) => {
                webhookCalls.push(`${url} ${init?.body ?? ""}`);
                return { ok: true, json: async () => ({}) };
            }),
        }), /neon down/);
        const joined = calls.join("\n");
        assert.match(joined, /INSERT INTO pipeline_metrics/);
        assert.match(joined, /job_failed/);
        assert.match(joined, /'layer2:nightly'/);
        assert.equal(webhookCalls.length, 1);
        assert.match(webhookCalls[0], /job_failed/);
    });
    (0, node_test_1.it)("never writes transcript bodies into layer 2 SQL", async () => {
        const { calls } = await runWith(defaultFixtures());
        assert.ok(!calls.join("\n").includes("TRANSCRIPT_BODY_SENTINEL"));
    });
});
// --- V5: verdict settlement + claim promotion -------------------------------
const HANDLED = NOW - 30 * 86_400; // horizon 2w => window closed 16d ago
const DONE_GHOST_ID = "ghost_done_settle";
const DONE_TID = (0, keys_js_1.threadId)(USER, `root:${DONE_GHOST_ID}`);
const VERDICT_ID = (0, keys_js_1.verificationId)({ threadId: DONE_TID, kind: "verdict", bucket: `vd:${HANDLED}` });
function doneGhostRow(props = {}) {
    return {
        id: DONE_GHOST_ID,
        title: "Handled crunch",
        subtitle: null,
        occurred_at_ts: HANDLED,
        created_at_ts: HANDLED - 86_400,
        props_json: {
            status: "done",
            done_at_ts: HANDLED,
            verify_horizon_weeks: 2,
            claim_level: "source_backed_hypothesis_not_settled_causality",
            recurrence_count: 2,
            ...props,
        },
    };
}
function settleFixtures(observationRows, extra = []) {
    return [
        ...extra,
        [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [doneGhostRow()]],
        [/SELECT observation, observed_at_ts FROM thread_verifications WHERE/, observationRows],
        [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
        [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
    ];
}
function verdictInserts(calls) {
    return calls.filter((sql) => /INSERT INTO thread_verifications/.test(sql) && /'verdict'/.test(sql));
}
/** All writes except pipeline_metrics (whose id is a random UUID by design). */
function deterministicWrites(calls) {
    return calls.filter((sql) => !/INSERT INTO pipeline_metrics/.test(sql));
}
(0, node_test_1.describe)("V5 settlement pass (verdicts)", () => {
    (0, node_test_1.it)("thread upsert never demotes claim_level on conflict (base claim written on INSERT only)", async () => {
        const { calls } = await runWith(defaultFixtures());
        const threadSql = calls.find((sql) => /INSERT INTO causal_memory_threads/.test(sql)) ?? "";
        assert.ok(threadSql.length > 0);
        assert.doesNotMatch(threadSql, /claim_level\s*=\s*EXCLUDED\.claim_level/);
    });
    (0, node_test_1.it)("writes pattern_recurred when a same_thread_trigger observation lands in the verify window", async () => {
        const { calls } = await runWith(settleFixtures([
            { observation: "same_thread_trigger", observed_at_ts: HANDLED + 3 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 4 * 86_400 },
        ]));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.match(verdicts[0], /'pattern_recurred'/);
        assert.ok(verdicts[0].includes(`'${VERDICT_ID}'`));
        assert.match(verdicts[0], /ON CONFLICT \(id\) DO NOTHING/);
    });
    (0, node_test_1.it)("writes no_recurrence_observed on >=3 in-window engine_ran_no_trigger and no triggers", async () => {
        const { calls } = await runWith(settleFixtures([
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 1 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 5 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 9 * 86_400 },
            // out-of-window rows never count
            { observation: "same_thread_trigger", observed_at_ts: HANDLED + 20 * 86_400 },
            { observation: "same_thread_trigger", observed_at_ts: HANDLED - 86_400 },
        ]));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.match(verdicts[0], /'no_recurrence_observed'/);
    });
    (0, node_test_1.it)("writes insufficient_observation when coverage is too thin to clear the thread", async () => {
        const { calls } = await runWith(settleFixtures([
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 1 * 86_400 },
        ]));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.match(verdicts[0], /'insufficient_observation'/);
    });
    (0, node_test_1.it)("does not settle while the verify window is still open", async () => {
        const fixtures = [
            [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [
                    { ...doneGhostRow(), props_json: { ...doneGhostRow().props_json, done_at_ts: NOW - 5 * 86_400 } },
                ]],
            [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
            [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
        ];
        const { calls } = await runWith(fixtures);
        assert.equal(verdictInserts(calls).length, 0);
    });
    (0, node_test_1.it)("falls back to the e_done_ edge timestamp when done_at_ts is absent", async () => {
        const ghost = doneGhostRow();
        delete ghost.props_json.done_at_ts;
        const { calls } = await runWith([
            [/FROM graph_edges WHERE user_id = __daobrew_scope\.uid AND id = 'e_done_/, [{ created_at_ts: HANDLED }]],
            [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [ghost]],
            [/SELECT observation, observed_at_ts FROM thread_verifications WHERE/, []],
            [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
            [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
        ]);
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.ok(verdicts[0].includes(`'${VERDICT_ID}'`)); // same vd:<handled> bucket either way
    });
    (0, node_test_1.it)("settlement re-runs are byte-identical (one verdict per handled cycle)", async () => {
        const fixtures = (verdictExists) => settleFixtures([{ observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 86_400 }], 
        // Second run: the verdict row already landed, so the pre-check sees it.
        verdictExists ? [[/SELECT 1 FROM thread_verifications WHERE/, [{ "?column?": 1 }]]] : []);
        const first = await runWith(fixtures(false));
        const second = await runWith(fixtures(true));
        assert.deepEqual(deterministicWrites(first.calls), deterministicWrites(second.calls));
        assert.equal(verdictInserts(first.calls).length, 1);
        // verdictsSettled counts rows actually inserted, not INSERT attempts:
        // the ON CONFLICT DO NOTHING rerun settles nothing new.
        assert.equal(first.result.verdictsSettled, 1);
        assert.equal(second.result.verdictsSettled, 0);
    });
});
(0, node_test_1.describe)("V5 claim pass (promotion/demotion)", () => {
    const claimRowFixture = (row) => ([/SELECT id, graph_root_id, claim_level, promotion_state_json FROM causal_memory_threads WHERE/, [row]]);
    const verdictRowsFixture = (rows) => ([/SELECT thread_id, verdict, details_json ->> 'arm' AS arm FROM thread_verifications WHERE/, rows]);
    const claimUpdates = (calls) => calls.filter((sql) => /UPDATE causal_memory_threads SET claim_level =/.test(sql));
    (0, node_test_1.it)("promotes attribution_candidate to causal_hypothesis on 2 confirmations", async () => {
        const fixtures = [
            ...defaultFixtures(),
            verdictRowsFixture([
                { thread_id: TID, verdict: "no_recurrence_observed" },
                { thread_id: TID, verdict: "no_recurrence_observed" },
                { thread_id: TID, verdict: "insufficient_observation" }, // neither
            ]),
            claimRowFixture({ id: TID, graph_root_id: GHOST_ID, claim_level: "attribution_candidate", promotion_state_json: {} }),
        ];
        const { calls } = await runWith(fixtures);
        const updates = claimUpdates(calls);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET claim_level = 'causal_hypothesis'/);
        assert.ok(updates[0].includes(`'${TID}'`));
        const state = JSON.parse(updates[0].match(/promotion_state_json = '(.+)'::jsonb/s)[1]);
        assert.equal(state.base_claim_level, "attribution_candidate");
        assert.equal(state.confirmations, 2);
        assert.equal(state.contradictions, 0);
        assert.equal(state.computed_at_ts, NOW);
        assert.equal(state.history.length, 1);
        assert.deepEqual({ from: state.history[0].from, to: state.history[0].to }, { from: "attribution_candidate", to: "causal_hypothesis" });
    });
    (0, node_test_1.it)("demotes on >=2 contradictions with a history entry appended", async () => {
        const fixtures = [
            ...defaultFixtures(),
            verdictRowsFixture([
                { thread_id: TID, verdict: "pattern_recurred" },
                { thread_id: TID, verdict: "pattern_recurred" },
            ]),
            claimRowFixture({
                id: TID,
                graph_root_id: GHOST_ID,
                claim_level: "causal_hypothesis",
                promotion_state_json: {
                    base_claim_level: "attribution_candidate",
                    confirmations: 2,
                    contradictions: 0,
                    computed_at_ts: NOW - 86_400,
                    history: [{ from: "attribution_candidate", to: "causal_hypothesis", at_ts: NOW - 86_400, confirmations: 2, contradictions: 0 }],
                },
            }),
        ];
        const { calls } = await runWith(fixtures);
        const updates = claimUpdates(calls);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET claim_level = 'attribution_candidate'/);
        const state = JSON.parse(updates[0].match(/promotion_state_json = '(.+)'::jsonb/s)[1]);
        assert.equal(state.contradictions, 2);
        assert.equal(state.history.length, 2);
        assert.deepEqual({ from: state.history[1].from, to: state.history[1].to }, { from: "causal_hypothesis", to: "attribution_candidate" });
    });
    (0, node_test_1.it)("excludes control-arm verdicts from promotion counts (promotion stays treatment-evidence-based)", async () => {
        const fixtures = [
            ...defaultFixtures(),
            verdictRowsFixture([
                // Two control confirmations would promote if counted — they must not.
                { thread_id: TID, verdict: "no_recurrence_observed", arm: "control" },
                { thread_id: TID, verdict: "no_recurrence_observed", arm: "control" },
            ]),
            claimRowFixture({ id: TID, graph_root_id: GHOST_ID, claim_level: "attribution_candidate", promotion_state_json: {} }),
        ];
        const { calls } = await runWith(fixtures);
        const updates = claimUpdates(calls);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET claim_level = 'attribution_candidate'/);
        const state = JSON.parse(updates[0].match(/promotion_state_json = '(.+)'::jsonb/s)[1]);
        assert.equal(state.confirmations, 0, "control verdicts must not count as confirmations");
        assert.equal(state.contradictions, 0);
        assert.deepEqual(state.history, []);
    });
    (0, node_test_1.it)("control contradictions never demote either: mixed arms count only the treatment rows", async () => {
        const fixtures = [
            ...defaultFixtures(),
            verdictRowsFixture([
                { thread_id: TID, verdict: "no_recurrence_observed" }, // treatment (arm absent)
                { thread_id: TID, verdict: "no_recurrence_observed", arm: "treatment" },
                { thread_id: TID, verdict: "pattern_recurred", arm: "control" }, // must not demote
                { thread_id: TID, verdict: "pattern_recurred", arm: "control" },
            ]),
            claimRowFixture({ id: TID, graph_root_id: GHOST_ID, claim_level: "attribution_candidate", promotion_state_json: {} }),
        ];
        const { calls } = await runWith(fixtures);
        const updates = claimUpdates(calls);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET claim_level = 'causal_hypothesis'/);
        const state = JSON.parse(updates[0].match(/promotion_state_json = '(.+)'::jsonb/s)[1]);
        assert.equal(state.confirmations, 2);
        assert.equal(state.contradictions, 0);
    });
    (0, node_test_1.it)("no level change appends no history and re-runs emit identical statements", async () => {
        const fixtures = () => [
            ...defaultFixtures(),
            verdictRowsFixture([{ thread_id: TID, verdict: "no_recurrence_observed" }]), // C=1: below threshold
            claimRowFixture({
                id: TID,
                graph_root_id: GHOST_ID,
                claim_level: "attribution_candidate",
                promotion_state_json: { base_claim_level: "attribution_candidate", confirmations: 0, contradictions: 0, computed_at_ts: NOW - 86_400, history: [] },
            }),
        ];
        const first = await runWith(fixtures());
        const second = await runWith(fixtures());
        assert.deepEqual(deterministicWrites(first.calls), deterministicWrites(second.calls));
        const updates = claimUpdates(first.calls);
        assert.equal(updates.length, 1);
        assert.match(updates[0], /SET claim_level = 'attribution_candidate'/);
        const state = JSON.parse(updates[0].match(/promotion_state_json = '(.+)'::jsonb/s)[1]);
        assert.deepEqual(state.history, []);
    });
});
// --- MRT v1: control-arm (held) episode settlement + comparison metric ------
const HELD_GHOST_ID = "ghost_held_settle";
const HELD_TID = (0, keys_js_1.threadId)(USER, `root:${HELD_GHOST_ID}`);
const HELD_VERDICT_ID = (0, keys_js_1.verificationId)({ threadId: HELD_TID, kind: "verdict", bucket: `vd:${HANDLED}` });
function heldGhostRow(props = {}) {
    return {
        id: HELD_GHOST_ID,
        title: "Withheld crunch",
        subtitle: null,
        occurred_at_ts: HANDLED,
        created_at_ts: HANDLED - 86_400,
        props_json: {
            status: "armed",
            offer_state: "held",
            armed_at_ts: HANDLED,
            verify_horizon_weeks: 2,
            claim_level: "source_backed_hypothesis_not_settled_causality",
            recurrence_count: 1,
            ...props,
        },
    };
}
function heldFixtures(observationRows, ghost = heldGhostRow()) {
    return [
        [/FROM graph_nodes WHERE user_id = __daobrew_scope\.uid AND kind = 'ghost'/, [ghost]],
        [/SELECT observation, observed_at_ts FROM thread_verifications WHERE/, observationRows],
        [/SELECT id, claim_level FROM causal_memory_threads WHERE/, []],
        [/SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE/, []],
    ];
}
(0, node_test_1.describe)("MRT v1 held-episode settlement (control arm)", () => {
    (0, node_test_1.it)("settles a held episode past the horizon with the SAME verdict formula and arm:'control' details", async () => {
        const { calls, result } = await runWith(heldFixtures([
            { observation: "same_thread_trigger", observed_at_ts: HANDLED + 3 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 4 * 86_400 },
        ]));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.match(verdicts[0], /'pattern_recurred'/);
        assert.match(verdicts[0], /"arm":"control"/);
        assert.ok(verdicts[0].includes(`'${HELD_VERDICT_ID}'`), "vd:<armed_at_ts> bucket keeps settlement idempotent");
        assert.match(verdicts[0], /ON CONFLICT \(id\) DO NOTHING/);
        assert.equal(result.verdictsSettled, 1);
    });
    (0, node_test_1.it)("quiet held windows settle no_recurrence_observed on >=3 in-window quiet runs", async () => {
        const { calls } = await runWith(heldFixtures([
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 1 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 5 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 9 * 86_400 },
        ]));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        assert.match(verdicts[0], /'no_recurrence_observed'/);
        assert.match(verdicts[0], /"arm":"control"/);
    });
    (0, node_test_1.it)("does not settle a held episode while its window is still open", async () => {
        const { calls } = await runWith(heldFixtures([], heldGhostRow({ armed_at_ts: NOW - 5 * 86_400 })));
        assert.equal(verdictInserts(calls).length, 0);
    });
    (0, node_test_1.it)("legacy stampless held roots anchor on created_at_ts (armedEpisodeTs convention)", async () => {
        const ghost = heldGhostRow();
        delete ghost.props_json.armed_at_ts;
        const { calls } = await runWith(heldFixtures([{ observation: "engine_ran_no_trigger", observed_at_ts: HANDLED }], ghost));
        const verdicts = verdictInserts(calls);
        assert.equal(verdicts.length, 1);
        const legacyId = (0, keys_js_1.verificationId)({ threadId: HELD_TID, kind: "verdict", bucket: `vd:${HANDLED - 86_400}` });
        assert.ok(verdicts[0].includes(`'${legacyId}'`), "bucket keys on created_at_ts when armed_at_ts is absent");
    });
    (0, node_test_1.it)("held episodes never emit transfer records or intervention_outcome evidence (no intervention happened)", async () => {
        const { calls, result } = await runWith(heldFixtures([
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 1 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 5 * 86_400 },
            { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 9 * 86_400 },
        ]).concat([[/FROM transfer_consent WHERE/, [{ opted_in: true }]]]), { transferSalt: SALT, transferProvider: fakeTransferProvider() });
        assert.equal(transferInserts(calls).length, 0, "transfer emission is treatment-only");
        const evidenceSql = calls.find((sql) => /INSERT INTO causal_thread_evidence/.test(sql)) ?? "";
        assert.ok(!evidenceSql.includes("intervention_outcome"), "held roots earn no intervention_outcome evidence");
        assert.equal(result.verdictsSettled, 1, "the verdict itself still settles");
    });
    (0, node_test_1.it)("held settlement re-runs are byte-identical", async () => {
        const observations = [{ observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 86_400 }];
        const first = await runWith(heldFixtures(observations));
        const second = await runWith([
            [/SELECT 1 FROM thread_verifications WHERE/, [{ "?column?": 1 }]],
            ...heldFixtures(observations),
        ]);
        assert.deepEqual(deterministicWrites(first.calls), deterministicWrites(second.calls));
        assert.equal(first.result.verdictsSettled, 1);
        assert.equal(second.result.verdictsSettled, 0);
    });
});
(0, node_test_1.describe)("MRT v1 comparison metric (per-arm settled verdict counts)", () => {
    const mixedVerdictRows = [
        { thread_id: TID, verdict: "no_recurrence_observed" }, // treatment quiet (arm absent)
        { thread_id: TID, verdict: "no_recurrence_observed", arm: "treatment" }, // treatment quiet
        { thread_id: TID, verdict: "pattern_recurred", arm: "treatment" }, // treatment recurred
        { thread_id: HELD_TID, verdict: "pattern_recurred", arm: "control" }, // control recurred
        { thread_id: HELD_TID, verdict: "no_recurrence_observed", arm: "control" }, // control quiet
        { thread_id: HELD_TID, verdict: "insufficient_observation", arm: "control" }, // counts nowhere
    ];
    function metricInserts(calls) {
        return calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql) && /mrt_comparison/.test(sql));
    }
    (0, node_test_1.it)("writes one pipeline_metrics row summarizing settled verdicts by arm x verdict", async () => {
        const { calls, result } = await runWith([
            ...defaultFixtures(),
            [/SELECT thread_id, verdict, details_json ->> 'arm' AS arm FROM thread_verifications WHERE/, mixedVerdictRows],
        ]);
        const inserts = metricInserts(calls);
        assert.equal(inserts.length, 1);
        assert.match(inserts[0], /'layer2:nightly:mrt_comparison'/);
        assert.match(inserts[0], /"treatment_recurred":1/);
        assert.match(inserts[0], /"treatment_quiet":2/);
        assert.match(inserts[0], /"control_recurred":1/);
        assert.match(inserts[0], /"control_quiet":1/);
        assert.deepEqual(result.mrtComparison, {
            treatment_recurred: 1,
            treatment_quiet: 2,
            control_recurred: 1,
            control_quiet: 1,
        });
    });
    (0, node_test_1.it)("writes the row with explicit zeros when no verdicts have settled yet", async () => {
        const { calls, result } = await runWith(defaultFixtures());
        const inserts = metricInserts(calls);
        assert.equal(inserts.length, 1);
        assert.match(inserts[0], /"treatment_recurred":0/);
        assert.deepEqual(result.mrtComparison, {
            treatment_recurred: 0,
            treatment_quiet: 0,
            control_recurred: 0,
            control_quiet: 0,
        });
    });
});
// --- Q3: dormant-thread GC (D3 = ARCHIVE, never delete) ---------------------
(0, node_test_1.describe)("Q3 dormant-thread archival", () => {
    const GC_CUTOFF = NOW - 90 * 86_400;
    const gcFixture = (rows) => ([/SELECT id, graph_root_id FROM causal_memory_threads WHERE/, rows]);
    const archiveUpdates = (calls) => calls.filter((sql) => /UPDATE causal_memory_threads SET status = 'archived'/.test(sql));
    (0, node_test_1.it)("selects candidates with the full dormancy predicate (active/dormant/zero-strength/aged/no fresh evidence)", async () => {
        const { queries } = await runWith([...defaultFixtures(), gcFixture([])]);
        const gcSelect = queries.find((sql) => /SELECT id, graph_root_id FROM causal_memory_threads WHERE/.test(sql)) ?? "";
        assert.ok(gcSelect.length > 0);
        assert.match(gcSelect, /status = 'active'/);
        assert.match(gcSelect, /decay_state = 'dormant'/);
        assert.match(gcSelect, /strength = 0/);
        assert.match(gcSelect, new RegExp(`created_at_ts < ${GC_CUTOFF}`));
        assert.match(gcSelect, /NOT EXISTS/);
        assert.match(gcSelect, new RegExp(`observed_at_ts >= ${GC_CUTOFF}`));
    });
    (0, node_test_1.it)("archives a rootless dormant victim (never DELETE) and reports it", async () => {
        const { calls, result } = await runWith([
            ...defaultFixtures(),
            gcFixture([{ id: "cmt_victim", graph_root_id: null }]),
        ]);
        const updates = archiveUpdates(calls);
        assert.equal(updates.length, 1);
        assert.ok(updates[0].includes("'cmt_victim'"));
        assert.match(updates[0], /status = 'active'/); // guard: only flips active rows
        assert.equal(result.threadsArchived, 1);
        assert.ok(result.warnings.includes("threads_archived: 1"));
        // D3: archive means archive — no DELETE anywhere, evidence/verifications kept
        assert.ok(!calls.join("\n").match(/DELETE FROM/));
        const metricsSql = calls.find((sql) => /INSERT INTO pipeline_metrics/.test(sql) && /'layer2:nightly'/.test(sql)) ?? "";
        assert.match(metricsSql, /threads_archived: 1/);
    });
    (0, node_test_1.it)("archives a victim whose graph root vanished from graph_nodes", async () => {
        const { calls, result } = await runWith([
            ...defaultFixtures(),
            gcFixture([{ id: "cmt_gone_root", graph_root_id: "ghost_vanished" }]),
        ]);
        assert.equal(result.threadsArchived, 1);
        assert.ok(archiveUpdates(calls)[0].includes("'cmt_gone_root'"));
    });
    (0, node_test_1.it)("does NOT archive a dormant thread whose root is still live in the graph", async () => {
        const { calls, result } = await runWith([
            ...defaultFixtures(),
            gcFixture([{ id: TID, graph_root_id: GHOST_ID }]), // GHOST_ID is in tonight's scan
        ]);
        assert.equal(archiveUpdates(calls).length, 0);
        assert.equal(result.threadsArchived, 0);
        assert.ok(!result.warnings.some((w) => w.startsWith("threads_archived")));
    });
    (0, node_test_1.it)("emits no archive UPDATE when there are no candidates", async () => {
        const { calls, result } = await runWith(defaultFixtures());
        assert.equal(archiveUpdates(calls).length, 0);
        assert.equal(result.threadsArchived, 0);
    });
});
// --- T5: anonymized transfer-record emission at settlement (5B) --------------
const SALT = "salt-a";
const CONTRIB = (0, keys_js_1.contributorHash)(USER, SALT);
const TRANSFER_ID = (0, keys_js_1.transferRecordId)({
    contributorHash: CONTRIB,
    threadKey: `root:${DONE_GHOST_ID}`,
    handledAtTs: HANDLED,
});
const transferGhostProps = {
    selected_pattern: "overdrive",
    root_cause_class: "productivity",
    source_quality: "data_verified",
    linked_patterns: ["wood", "Overdrive"],
    artifact_ref: "/Users/neo/secret/wedge.md",
    brief: {
        cause: "PII_PROSE_SENTINEL the user keeps circling the demo",
        artifact_spec: "Write the one-wedge doc",
        suggested_block: { title: "Draft wedge", start_offset_min: 30, duration_min: 45 },
    },
};
function fakeTransferProvider() {
    return { embed: async (texts) => texts.map(() => new Array(768).fill(0.5)) };
}
function transferFixtures(observationRows, opts = {}) {
    return settleFixtures(observationRows, [
        [/FROM transfer_consent WHERE/, opts.consent === false ? [] : [{ opted_in: true }]],
        [/SELECT verdict FROM thread_verifications WHERE/, opts.verdictRows ?? [
                { verdict: "no_recurrence_observed" },
            ]],
    ]).map(([pattern, rows]) => pattern.source.includes("kind = 'ghost'")
        ? [pattern, [doneGhostRow(transferGhostProps)]]
        : [pattern, rows]);
}
function transferInserts(calls) {
    return calls.filter((sql) => /INSERT INTO transfer_records/.test(sql));
}
const QUIET_RUNS = [
    { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 1 * 86_400 },
    { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 5 * 86_400 },
    { observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 9 * 86_400 },
];
(0, node_test_1.describe)("T5 transfer-record emission (5B)", () => {
    (0, node_test_1.it)("emits one anonymized record when a verdict settles for an opted-in user", async () => {
        const { calls, result } = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        const inserts = transferInserts(calls);
        assert.equal(inserts.length, 1);
        assert.ok(inserts[0].includes(`'${TRANSFER_ID}'`));
        assert.ok(inserts[0].includes(`'${CONTRIB}'`));
        assert.match(inserts[0], /'worked'/);
        assert.match(inserts[0], /trigger overdrive productivity \| ctx: overdrive wood/);
        assert.match(inserts[0], /::halfvec/);
        assert.match(inserts[0], /"stress_pattern":"overdrive"/);
        assert.match(inserts[0], /ON CONFLICT \(id\) DO NOTHING/);
        assert.match(inserts[0], /Draft wedge/); // method suggested_block survives
        assert.equal(result.transferRecordsEmitted, 1);
    });
    (0, node_test_1.it)("never leaks identity, artifact paths, or brief prose into the record SQL", async () => {
        const { calls } = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        const insert = transferInserts(calls)[0];
        assert.ok(insert);
        assert.ok(!insert.includes("'local'"), "user id literal must not appear");
        assert.ok(!insert.includes("PII_PROSE_SENTINEL"), "brief.cause prose must not appear");
        assert.ok(!insert.includes("/Users/neo/secret/wedge.md"), "artifact_ref must not appear");
    });
    (0, node_test_1.it)("maps pattern_recurred to did_not_work and computes outcome_strength from verdict counts", async () => {
        const { calls } = await runWith(transferFixtures([{ observation: "same_thread_trigger", observed_at_ts: HANDLED + 3 * 86_400 }], { verdictRows: [
                { verdict: "no_recurrence_observed" },
                { verdict: "no_recurrence_observed" },
                { verdict: "pattern_recurred" },
            ] }), { transferSalt: SALT, transferProvider: fakeTransferProvider() });
        const insert = transferInserts(calls)[0];
        assert.ok(insert);
        assert.match(insert, /'did_not_work'/);
        assert.match(insert, /0\.6667/);
    });
    (0, node_test_1.it)("does not emit on insufficient_observation", async () => {
        const { calls, result } = await runWith(transferFixtures([{ observation: "engine_ran_no_trigger", observed_at_ts: HANDLED + 86_400 }]), { transferSalt: SALT, transferProvider: fakeTransferProvider() });
        assert.equal(transferInserts(calls).length, 0);
        assert.equal(result.transferRecordsEmitted, 0);
    });
    (0, node_test_1.it)("skips silently without consent and warns-without-emitting when the salt is unset", async () => {
        const noConsent = await runWith(transferFixtures(QUIET_RUNS, { consent: false }), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        assert.equal(transferInserts(noConsent.calls).length, 0);
        assert.ok(!noConsent.result.warnings.some((w) => w.includes("transfer")));
        const noSalt = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: "",
            transferProvider: fakeTransferProvider(),
        });
        assert.equal(transferInserts(noSalt.calls).length, 0);
        assert.ok(noSalt.result.warnings.some((w) => w.includes("DAOBREW_TRANSFER_SALT")));
    });
    (0, node_test_1.it)("writes a NULL embedding with a warning when no provider is available", async () => {
        const { calls, result } = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: null,
        });
        const insert = transferInserts(calls)[0];
        assert.ok(insert);
        assert.doesNotMatch(insert, /::halfvec/);
        assert.match(insert, /NULL/);
        assert.equal(result.transferRecordsEmitted, 1);
        assert.ok(result.warnings.some((w) => w.includes("trigger embedding")));
    });
    (0, node_test_1.it)("carries provenance columns and coarsens created_at_ts to the week bucket (5B §6.3)", async () => {
        const { calls } = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        const insert = transferInserts(calls)[0];
        assert.ok(insert);
        assert.match(insert, /'data_verified'/); // source_quality from ghost props
        assert.match(insert, /'source_backed_hypothesis_not_settled_causality'/); // evidence_quality = claim_level
        assert.match(insert, /'task_package'/); // method_class constant (first action-ontology entry)
        // Expected week bucket, computed independently in the engine's fixed -7h frame:
        // NOW is Fri 2027-01-15 01:00 local, so the Monday bucket is 2027-01-11.
        const OFFSET_HOURS = -7;
        const shifted = new Date((NOW + OFFSET_HOURS * 3600) * 1000);
        const dayStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
        const mondayMs = dayStartMs - ((shifted.getUTCDay() + 6) % 7) * 86_400_000;
        const expectedBucket = new Date(mondayMs).toISOString().slice(0, 10);
        const expectedStartTs = mondayMs / 1000 - OFFSET_HOURS * 3600;
        assert.equal(expectedBucket, "2027-01-11"); // pin so a shared helper bug can't self-confirm
        assert.equal(expectedStartTs, 1_799_650_800);
        assert.ok(insert.includes(`'${expectedBucket}'`), "created_week_bucket date literal must appear");
        assert.ok(insert.includes(String(expectedStartTs)), "coarsened week-start epoch must be stored as created_at_ts");
        assert.ok(!insert.includes(String(NOW)), "exact nightly timestamp must not appear (exact_ts_absent)");
    });
    (0, node_test_1.it)("re-runs are idempotent: same fixtures, byte-identical transfer INSERT", async () => {
        const first = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        const second = await runWith(transferFixtures(QUIET_RUNS), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        assert.deepEqual(transferInserts(first.calls), transferInserts(second.calls));
    });
});
// --- T6: nightly user-profile vector (5B) ------------------------------------
function profileFixtures(userVectorRows = []) {
    return [
        [/SELECT thread_key, pattern_keys_json FROM causal_memory_threads WHERE/, [
                { thread_key: "root:ghost_b", pattern_keys_json: ["wood"] },
                { thread_key: "root:ghost_a", pattern_keys_json: '["fire","wood"]' },
            ]],
        [/SELECT claim_ceiling FROM user_model_snapshots WHERE/, [
                { claim_ceiling: "attribution_candidate", snapshot_text: "SNAPSHOT_PROSE_SENTINEL" },
            ]],
        [/SELECT version, created_at_ts FROM user_vectors WHERE/, userVectorRows],
        ...defaultFixtures(),
    ];
}
function profileInserts(calls) {
    return calls.filter((sql) => /INSERT INTO user_vectors/.test(sql));
}
(0, node_test_1.describe)("T6 nightly user-profile vector (5B)", () => {
    (0, node_test_1.it)("writes one versioned profile vector from thread vocabulary, never snapshot prose", async () => {
        const { calls, result } = await runWith(profileFixtures(), {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        const inserts = profileInserts(calls);
        assert.equal(inserts.length, 1);
        assert.match(inserts[0], /'profile'/);
        assert.ok(inserts[0].includes("profile patterns: fire wood | threads: root:ghost_a root:ghost_b | ceiling: attribution_candidate"));
        assert.match(inserts[0], /::halfvec/);
        assert.match(inserts[0], /, 1,/); // first version
        assert.ok(!inserts[0].includes("SNAPSHOT_PROSE_SENTINEL"));
        assert.equal(result.profileVectorsWritten, 1);
    });
    (0, node_test_1.it)("bumps the version when a prior vector exists on an earlier day", async () => {
        const { calls } = await runWith(profileFixtures([{ version: 3, created_at_ts: NOW - 2 * 86_400 }]), { transferSalt: SALT, transferProvider: fakeTransferProvider() });
        const inserts = profileInserts(calls);
        assert.equal(inserts.length, 1);
        assert.match(inserts[0], /, 4,/);
    });
    (0, node_test_1.it)("is idempotent within a local day: same-day prior vector means no write", async () => {
        const { calls, result } = await runWith(profileFixtures([{ version: 3, created_at_ts: NOW - 60 }]), { transferSalt: SALT, transferProvider: fakeTransferProvider() });
        assert.equal(profileInserts(calls).length, 0);
        assert.equal(result.profileVectorsWritten, 0);
    });
    (0, node_test_1.it)("skips with a warning when threads exist but no provider is available", async () => {
        const { calls, result } = await runWith(profileFixtures(), {
            transferSalt: SALT,
            transferProvider: null,
        });
        assert.equal(profileInserts(calls).length, 0);
        assert.equal(result.profileVectorsWritten, 0);
        assert.ok(result.warnings.some((w) => w.includes("profile vector")));
    });
    (0, node_test_1.it)("skips silently when the user has no active threads", async () => {
        const fixtures = profileFixtures().map(([pattern, rows]) => pattern.source.includes("thread_key, pattern_keys_json")
            ? [pattern, []]
            : [pattern, rows]);
        const { calls, result } = await runWith(fixtures, {
            transferSalt: SALT,
            transferProvider: fakeTransferProvider(),
        });
        assert.equal(profileInserts(calls).length, 0);
        assert.equal(result.profileVectorsWritten, 0);
        assert.ok(!result.warnings.some((w) => w.includes("profile vector")));
    });
});
(0, node_test_1.describe)("nightly RLS scoping (F1 One-Time-Filter regression)", () => {
    (0, node_test_1.it)("every nightly read filters user_id by the scope row, never by a literal", async () => {
        // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
        // planner fold the RLS qual into a One-Time Filter evaluated at executor
        // startup — before the lateral scope row has run set_config — so a fresh
        // pooled backend silently returns zero rows (live bug F1). Every read
        // body must reference the scope row's uid instead. (Exec-path DML keeps
        // its literals: scopedExec runs set_config in the same transaction.)
        const { queries } = await runWith(defaultFixtures());
        const userScoped = queries.filter((sql) => sql.includes("user_id"));
        assert.ok(userScoped.length > 0, "expected user-scoped reads");
        for (const sql of userScoped) {
            assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `read must filter user_id via the scope row, got: ${sql}`);
            assert.ok(!sql.includes(`user_id = '${USER}'`), `read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`);
        }
    });
});
(0, node_test_1.describe)("nightly accepts an arbitrary identity (bare device UUID)", () => {
    (0, node_test_1.it)("runs the full job for a bare device-UUID userId, writing it verbatim", async () => {
        // Deliverable 1: a bare device UUID (unpaired iPhone / unregistered
        // principal, no apikey: prefix) must flow through the nightly job exactly
        // like any other identity. The thread INSERT writes the UUID verbatim as
        // user_id; reads still scope via the lateral scope row (no apikey/config
        // assumption anywhere on the path).
        const deviceUuid = "4A008E08-1111-2222-3333-444455556666";
        const { calls, queries, result } = await runWith(defaultFixtures(), { userId: deviceUuid });
        const threadInsert = calls.find((sql) => sql.includes("INSERT INTO causal_memory_threads"));
        assert.ok(threadInsert, "a thread INSERT must be emitted for the ghost");
        assert.ok(threadInsert.includes(`'${deviceUuid}'`), `thread INSERT must write the bare device UUID as user_id, got: ${threadInsert}`);
        assert.strictEqual(result.threadsUpserted, 1);
        // Reads scope via the scope row, never a bare-UUID literal comparison.
        const userScopedReads = queries.filter((sql) => sql.includes("user_id"));
        assert.ok(userScopedReads.length > 0, "expected user-scoped reads");
        for (const sql of userScopedReads) {
            assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `read must scope via the scope row, got: ${sql}`);
            assert.ok(!sql.includes(`user_id = '${deviceUuid}'`), `read must NOT compare user_id to the bare-UUID literal, got: ${sql}`);
        }
    });
});
