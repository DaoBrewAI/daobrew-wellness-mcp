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
const snapshot_js_1 = require("../src/engine/memory/snapshot.js");
const keys_js_1 = require("../src/engine/memory/keys.js");
const NOW = 1_800_000_000;
const USER = "local";
const T1 = "cmt_aaaaaaaaaaaaaaaaaaaaaaaa";
const T2 = "cmt_bbbbbbbbbbbbbbbbbbbbbbbb";
const threads = [
    {
        id: T1,
        title: "Late-night deploy crunch",
        summary: "attribution candidate",
        claim_level: "attribution_candidate",
        recurrence_count: 3,
        pattern_keys: ["wood"],
        evidence_count: 5,
        first_seen_ts: NOW - 3_000_000,
        last_seen_ts: NOW - 86_400,
        strength: 2.4,
    },
    {
        id: T2,
        title: "Morning walk co-occurrence",
        summary: null,
        claim_level: "correlation",
        recurrence_count: 2,
        pattern_keys: [],
        evidence_count: 2,
        first_seen_ts: NOW - 2_000_000,
        last_seen_ts: NOW - 172_800,
        strength: 1.1,
    },
];
const validModel = {
    recurring_stressors: [
        { text: "Late-night deploy windows co-occur with elevated stress markers", thread_id: T1 },
    ],
    pattern_tendencies: [
        { text: "Wood-pattern episodes tend to coincide with crunch weeks", thread_id: T1 },
    ],
    intervention_response: [
        { text: "Morning walks were followed by calmer readings", thread_id: T2 },
    ],
    inference_cautions: [
        { text: "Evidence is observational; alternative explanations remain open", thread_id: T2 },
    ],
};
const threadRows = threads.map((t) => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    claim_level: t.claim_level,
    recurrence_count: t.recurrence_count,
    pattern_keys_json: t.pattern_keys,
    first_seen_ts: t.first_seen_ts,
    last_seen_ts: t.last_seen_ts,
    strength: t.strength,
    evidence_count: t.evidence_count,
}));
class MockLlm {
    responses;
    prompts = [];
    calls = 0;
    constructor(responses) {
        this.responses = responses;
    }
    async generateJson(prompt) {
        this.prompts.push(prompt);
        this.calls += 1;
        const next = this.responses.shift();
        if (next instanceof Error)
            throw next;
        return next;
    }
    callsUsed() {
        return this.calls;
    }
}
function defaultFixtures() {
    return [
        [/FROM causal_memory_threads t\b/, threadRows],
        [/COALESCE\(MAX\(version\), 0\)/, [{ v: 0 }]],
        [/SELECT created_at_ts FROM user_model_snapshots/, []],
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
async function runWith(fixtures, llm, extras = {}) {
    const calls = [];
    const result = await (0, snapshot_js_1.runWeeklySnapshotJob)({
        userId: USER,
        exec: async (sql) => { calls.push(sql); },
        query: makeQuery(fixtures),
        nowTs: () => NOW,
        llm,
        ...extras,
    });
    return { calls, result };
}
(0, node_test_1.describe)("snapshot validator", () => {
    (0, node_test_1.it)("accepts a well-formed model citing allowlisted threads", () => {
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(validModel, threads);
        assert.deepEqual(verdict.errors, []);
        assert.equal(verdict.ok, true);
    });
    (0, node_test_1.it)("rejects a model missing a section", () => {
        const { recurring_stressors: _dropped, ...partial } = validModel;
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(partial, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /recurring_stressors/.test(e)));
    });
    (0, node_test_1.it)("rejects items citing an unknown thread_id", () => {
        const model = {
            ...validModel,
            recurring_stressors: [{ text: "co-occurs with stress", thread_id: "cmt_hallucinated" }],
        };
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(model, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /cmt_hallucinated/.test(e)));
    });
    (0, node_test_1.it)("rejects items with empty text", () => {
        const model = {
            ...validModel,
            pattern_tendencies: [{ text: "   ", thread_id: T1 }],
        };
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(model, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /pattern_tendencies/.test(e)));
    });
    (0, node_test_1.it)("rejects causal over-claiming against the cited thread's claim level", () => {
        const model = {
            ...validModel,
            recurring_stressors: [{ text: "Morning walks cause calmer readings", thread_id: T2 }],
        };
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(model, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /banned_for_correlation/.test(e)));
    });
    (0, node_test_1.it)("rejects more than 16 total items", () => {
        const many = Array.from({ length: 5 }, (_, i) => ({
            text: `observation number ${i} co-occurs with stress`,
            thread_id: T1,
        }));
        const model = {
            recurring_stressors: many,
            pattern_tendencies: many,
            intervention_response: many,
            inference_cautions: [...many.slice(0, 2)],
        };
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(model, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /too_many_items/.test(e)));
    });
    (0, node_test_1.it)("rejects oversized JSON payloads", () => {
        const model = {
            ...validModel,
            inference_cautions: [{ text: `observational only ${"sleep ".repeat(900)}`, thread_id: T2 }],
        };
        const verdict = (0, snapshot_js_1.validateSnapshotModel)(model, threads);
        assert.equal(verdict.ok, false);
        assert.ok(verdict.errors.some((e) => /oversized_json/.test(e)));
    });
});
(0, node_test_1.describe)("snapshot rendering and ceiling", () => {
    (0, node_test_1.it)("renders deterministic markdown with the four fixed headers and citations", () => {
        const first = (0, snapshot_js_1.renderSnapshotText)(validModel, threads);
        const second = (0, snapshot_js_1.renderSnapshotText)(validModel, threads);
        assert.equal(first, second);
        assert.match(first, /## Recurring stressors/);
        assert.match(first, /## Pattern tendencies/);
        assert.match(first, /## Intervention response/);
        assert.match(first, /## Inference cautions/);
        assert.ok(first.includes(`- Late-night deploy windows co-occur with elevated stress markers [${T1}]`));
        assert.ok(first.includes(`- Morning walks were followed by calmer readings [${T2}]`));
    });
    (0, node_test_1.it)("claimCeiling returns the max claim level among threads", () => {
        assert.equal((0, snapshot_js_1.claimCeiling)(threads), "attribution_candidate");
        assert.equal((0, snapshot_js_1.claimCeiling)([
            { ...threads[1] },
            { ...threads[0], claim_level: "causal_hypothesis" },
        ]), "causal_hypothesis");
        assert.equal((0, snapshot_js_1.claimCeiling)([]), "correlation");
    });
    (0, node_test_1.it)("buildSnapshotPrompt carries thread facts and the JSON contract", () => {
        const prompt = (0, snapshot_js_1.buildSnapshotPrompt)(threads);
        assert.ok(prompt.includes(T1));
        assert.ok(prompt.includes(T2));
        assert.match(prompt, /recurring_stressors/);
        assert.match(prompt, /inference_cautions/);
        assert.match(prompt, /thread_id/);
    });
});
(0, node_test_1.describe)("weekly snapshot job", () => {
    (0, node_test_1.it)("writes version 1 with the correct claim ceiling on the happy path", async () => {
        const llm = new MockLlm([validModel]);
        const { calls, result } = await runWith(defaultFixtures(), llm);
        assert.equal(result.written, true);
        assert.equal(result.version, 1);
        assert.equal(llm.callsUsed(), 1);
        const inserts = calls.filter((sql) => /INSERT INTO user_model_snapshots/.test(sql));
        assert.equal(inserts.length, 1);
        assert.ok(inserts[0].includes(`'${(0, keys_js_1.snapshotId)(USER, 1)}'`));
        assert.match(inserts[0], /'attribution_candidate'/);
        assert.ok(inserts[0].includes(T1));
        assert.ok(inserts[0].includes(T2));
        assert.match(inserts[0], /## Recurring stressors/);
        const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
        assert.equal(metrics.length, 1);
        assert.match(metrics[0], /'layer2:snapshot'/);
    });
    (0, node_test_1.it)("fails closed after one retry: no insert, validation warning, webhook alert", async () => {
        const bad = { ...validModel, recurring_stressors: [{ text: "deploys cause stress", thread_id: T1 }] };
        const llm = new MockLlm([bad, bad]);
        const webhookCalls = [];
        const { calls, result } = await runWith(defaultFixtures(), llm, {
            alertWebhook: "https://hooks.example.com/layer2",
            fetchImpl: (async (url, init) => {
                webhookCalls.push(`${url} ${init?.body ?? ""}`);
                return { ok: true, json: async () => ({}) };
            }),
        });
        assert.equal(result.written, false);
        assert.equal(llm.callsUsed(), 2);
        assert.ok(llm.prompts[1].includes("failed validation"));
        assert.ok(!calls.some((sql) => /INSERT INTO user_model_snapshots/.test(sql)));
        assert.ok(result.warnings.some((w) => /snapshot_validation_failed/.test(w)));
        // no previous snapshot exists, so the kept state is stale
        assert.ok(result.warnings.includes("snapshot_stale"));
        const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
        assert.equal(metrics.length, 1);
        assert.match(metrics[0], /snapshot_validation_failed/);
        assert.equal(webhookCalls.length, 1);
        assert.match(webhookCalls[0], /snapshot_validation_failed/);
    });
    (0, node_test_1.it)("does not flag snapshot_stale when a recent snapshot survives the fail-closed keep", async () => {
        const bad = { ...validModel, recurring_stressors: [{ text: "deploys cause stress", thread_id: T1 }] };
        const llm = new MockLlm([bad, bad]);
        const fixtures = [
            [/FROM causal_memory_threads t\b/, threadRows],
            [/COALESCE\(MAX\(version\), 0\)/, [{ v: 3 }]],
            [/SELECT created_at_ts FROM user_model_snapshots/, [{ created_at_ts: NOW - 86_400 }]],
        ];
        const { result } = await runWith(fixtures, llm);
        assert.equal(result.written, false);
        assert.ok(!result.warnings.includes("snapshot_stale"));
    });
    (0, node_test_1.it)("retries once with validation errors and writes when the retry is valid", async () => {
        const bad = { ...validModel, intervention_response: [{ text: "", thread_id: T2 }] };
        const llm = new MockLlm([bad, validModel]);
        const { calls, result } = await runWith(defaultFixtures(), llm);
        assert.equal(result.written, true);
        assert.equal(llm.callsUsed(), 2);
        assert.ok(llm.prompts[1].includes("failed validation"));
        assert.equal(calls.filter((sql) => /INSERT INTO user_model_snapshots/.test(sql)).length, 1);
    });
    (0, node_test_1.it)("bumps the version past the previous max", async () => {
        const llm = new MockLlm([validModel]);
        const fixtures = [
            [/FROM causal_memory_threads t\b/, threadRows],
            [/COALESCE\(MAX\(version\), 0\)/, [{ v: 4 }]],
        ];
        const { calls, result } = await runWith(fixtures, llm);
        assert.equal(result.written, true);
        assert.equal(result.version, 5);
        const insert = calls.find((sql) => /INSERT INTO user_model_snapshots/.test(sql)) ?? "";
        assert.ok(insert.includes(`'${(0, keys_js_1.snapshotId)(USER, 5)}'`));
    });
    (0, node_test_1.it)("skips the LLM entirely when there are no active threads", async () => {
        const llm = new MockLlm([validModel]);
        const fixtures = [[/FROM causal_memory_threads t\b/, []]];
        const { calls, result } = await runWith(fixtures, llm);
        assert.equal(result.written, false);
        assert.equal(llm.callsUsed(), 0);
        assert.deepEqual(result.warnings, ["no_active_threads"]);
        assert.ok(!calls.some((sql) => /INSERT INTO user_model_snapshots/.test(sql)));
        const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
        assert.equal(metrics.length, 1);
        assert.match(metrics[0], /no_active_threads/);
    });
    (0, node_test_1.it)("selects top active threads with the evidence-count subquery and limit", async () => {
        const seen = [];
        const llm = new MockLlm([validModel]);
        await (0, snapshot_js_1.runWeeklySnapshotJob)({
            userId: USER,
            exec: async () => { },
            query: async (sql) => {
                seen.push(sql);
                return makeQuery(defaultFixtures())(sql);
            },
            nowTs: () => NOW,
            llm,
            maxThreads: 3,
        });
        const threadsSql = seen.find((sql) => /FROM causal_memory_threads t\b/.test(sql)) ?? "";
        assert.match(threadsSql, /t\.status = 'active'/);
        assert.match(threadsSql, /t\.decay_state = 'active'/);
        assert.match(threadsSql, /SELECT COUNT\(\*\) FROM causal_thread_evidence e WHERE e\.thread_id = t\.id/);
        assert.match(threadsSql, /ORDER BY t\.strength DESC, t\.last_seen_ts DESC/);
        assert.match(threadsSql, /LIMIT 3/);
    });
    (0, node_test_1.describe)("gemini key gate (no llm injected)", () => {
        const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY"];
        let savedEnv;
        (0, node_test_1.beforeEach)(() => {
            savedEnv = {};
            for (const key of ENV_KEYS) {
                savedEnv[key] = process.env[key];
                delete process.env[key];
            }
            process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
        });
        (0, node_test_1.afterEach)(() => {
            for (const key of ENV_KEYS) {
                if (savedEnv[key] !== undefined)
                    process.env[key] = savedEnv[key];
                else
                    delete process.env[key];
            }
        });
        (0, node_test_1.it)("skips with gemini_key_missing instead of throwing when no key exists anywhere", async () => {
            const { calls, result } = await runWith(defaultFixtures(), undefined);
            assert.equal(result.written, false);
            assert.ok(result.warnings.some((w) => /gemini_key_missing/.test(w)));
            // fresh machine: no previous snapshot, so the staleness alert still fires
            assert.ok(result.warnings.includes("snapshot_stale"));
            assert.deepEqual(result.alerts, []);
            assert.ok(!calls.some((sql) => /INSERT INTO user_model_snapshots/.test(sql)));
            const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
            assert.equal(metrics.length, 1);
            assert.match(metrics[0], /gemini_key_missing/);
        });
        (0, node_test_1.it)("does not flag snapshot_stale on skip when a recent snapshot is retained", async () => {
            const fixtures = [
                [/FROM causal_memory_threads t\b/, threadRows],
                [/SELECT created_at_ts FROM user_model_snapshots/, [{ created_at_ts: NOW - 86_400 }]],
            ];
            const { result } = await runWith(fixtures, undefined);
            assert.equal(result.written, false);
            assert.ok(result.warnings.some((w) => /gemini_key_missing/.test(w)));
            assert.ok(!result.warnings.includes("snapshot_stale"));
        });
    });
    (0, node_test_1.it)("records a job_failed metrics row and rethrows when the LLM call throws", async () => {
        const llm = new MockLlm([new Error("gemini down")]);
        const calls = [];
        const webhookCalls = [];
        await assert.rejects(() => (0, snapshot_js_1.runWeeklySnapshotJob)({
            userId: USER,
            exec: async (sql) => { calls.push(sql); },
            query: makeQuery(defaultFixtures()),
            nowTs: () => NOW,
            llm,
            alertWebhook: "https://hooks.example.com/layer2",
            fetchImpl: (async (url, init) => {
                webhookCalls.push(`${url} ${init?.body ?? ""}`);
                return { ok: true, json: async () => ({}) };
            }),
        }), /gemini down/);
        const joined = calls.join("\n");
        assert.match(joined, /INSERT INTO pipeline_metrics/);
        assert.match(joined, /job_failed/);
        assert.match(joined, /'layer2:snapshot'/);
        assert.ok(!joined.includes("INSERT INTO user_model_snapshots"));
        assert.equal(webhookCalls.length, 1);
        assert.match(webhookCalls[0], /job_failed/);
    });
});
(0, node_test_1.describe)("snapshot job RLS scoping (F1 One-Time-Filter regression)", () => {
    (0, node_test_1.it)("every snapshot read filters user_id by the scope row, never by a literal", async () => {
        // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
        // planner fold the RLS qual into a One-Time Filter evaluated at executor
        // startup — before the lateral scope row has run set_config — so a fresh
        // pooled backend silently returns zero rows (live bug F1). Every read
        // body must reference the scope row's uid instead.
        const queries = [];
        const fixtureQuery = makeQuery(defaultFixtures());
        await (0, snapshot_js_1.runWeeklySnapshotJob)({
            userId: USER,
            exec: async () => { },
            query: async (sql) => { queries.push(sql); return fixtureQuery(sql); },
            nowTs: () => NOW,
            llm: new MockLlm([validModel]),
        });
        const userScoped = queries.filter((sql) => sql.includes("user_id"));
        // active-threads read + MAX(version) read
        assert.equal(userScoped.length, 2);
        for (const sql of userScoped) {
            assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `read must filter user_id via the scope row, got: ${sql}`);
            assert.ok(!sql.includes(`user_id = '${USER}'`), `read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`);
        }
    });
});
