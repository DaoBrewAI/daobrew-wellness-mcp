import { beforeEach, afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildSnapshotPrompt,
  validateSnapshotModel,
  renderSnapshotText,
  claimCeiling,
  runWeeklySnapshotJob,
  SnapshotModel,
  SnapshotThreadFacts,
} from "../src/engine/memory/snapshot.js";
import { TextGenerationProvider } from "../src/engine/memory/llm.js";
import { snapshotId } from "../src/engine/memory/keys.js";

const NOW = 1_800_000_000;
const USER = "local";

const T1 = "cmt_aaaaaaaaaaaaaaaaaaaaaaaa";
const T2 = "cmt_bbbbbbbbbbbbbbbbbbbbbbbb";

const threads: SnapshotThreadFacts[] = [
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

const validModel: SnapshotModel = {
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

class MockLlm implements TextGenerationProvider {
  prompts: string[] = [];
  private calls = 0;
  constructor(private readonly responses: unknown[]) {}
  async generateJson(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    this.calls += 1;
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }
  callsUsed(): number {
    return this.calls;
  }
}

type Fixture = [RegExp, Record<string, any>[]];

function defaultFixtures(): Fixture[] {
  return [
    [/FROM causal_memory_threads t\b/, threadRows],
    [/COALESCE\(MAX\(version\), 0\)/, [{ v: 0 }]],
    [/SELECT created_at_ts FROM user_model_snapshots/, []],
  ];
}

function makeQuery(fixtures: Fixture[]) {
  return async (sql: string) => {
    for (const [pattern, rows] of fixtures) {
      if (pattern.test(sql)) return rows;
    }
    return [];
  };
}

async function runWith(fixtures: Fixture[], llm: MockLlm, extras: Record<string, any> = {}) {
  const calls: string[] = [];
  const result = await runWeeklySnapshotJob({
    userId: USER,
    exec: async (sql: string) => { calls.push(sql); },
    query: makeQuery(fixtures),
    nowTs: () => NOW,
    llm,
    ...extras,
  });
  return { calls, result };
}

describe("snapshot validator", () => {
  it("accepts a well-formed model citing allowlisted threads", () => {
    const verdict = validateSnapshotModel(validModel, threads);
    assert.deepEqual(verdict.errors, []);
    assert.equal(verdict.ok, true);
  });

  it("rejects a model missing a section", () => {
    const { recurring_stressors: _dropped, ...partial } = validModel;
    const verdict = validateSnapshotModel(partial, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /recurring_stressors/.test(e)));
  });

  it("rejects items citing an unknown thread_id", () => {
    const model = {
      ...validModel,
      recurring_stressors: [{ text: "co-occurs with stress", thread_id: "cmt_hallucinated" }],
    };
    const verdict = validateSnapshotModel(model, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /cmt_hallucinated/.test(e)));
  });

  it("rejects items with empty text", () => {
    const model = {
      ...validModel,
      pattern_tendencies: [{ text: "   ", thread_id: T1 }],
    };
    const verdict = validateSnapshotModel(model, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /pattern_tendencies/.test(e)));
  });

  it("rejects causal over-claiming against the cited thread's claim level", () => {
    const model = {
      ...validModel,
      recurring_stressors: [{ text: "Morning walks cause calmer readings", thread_id: T2 }],
    };
    const verdict = validateSnapshotModel(model, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /banned_for_correlation/.test(e)));
  });

  it("rejects more than 16 total items", () => {
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
    const verdict = validateSnapshotModel(model, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /too_many_items/.test(e)));
  });

  it("rejects oversized JSON payloads", () => {
    const model = {
      ...validModel,
      inference_cautions: [{ text: `observational only ${"sleep ".repeat(900)}`, thread_id: T2 }],
    };
    const verdict = validateSnapshotModel(model, threads);
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((e) => /oversized_json/.test(e)));
  });
});

describe("snapshot rendering and ceiling", () => {
  it("renders deterministic markdown with the four fixed headers and citations", () => {
    const first = renderSnapshotText(validModel, threads);
    const second = renderSnapshotText(validModel, threads);
    assert.equal(first, second);
    assert.match(first, /## Recurring stressors/);
    assert.match(first, /## Pattern tendencies/);
    assert.match(first, /## Intervention response/);
    assert.match(first, /## Inference cautions/);
    assert.ok(first.includes(`- Late-night deploy windows co-occur with elevated stress markers [${T1}]`));
    assert.ok(first.includes(`- Morning walks were followed by calmer readings [${T2}]`));
  });

  it("claimCeiling returns the max claim level among threads", () => {
    assert.equal(claimCeiling(threads), "attribution_candidate");
    assert.equal(
      claimCeiling([
        { ...threads[1] },
        { ...threads[0], claim_level: "causal_hypothesis" },
      ]),
      "causal_hypothesis",
    );
    assert.equal(claimCeiling([]), "correlation");
  });

  it("buildSnapshotPrompt carries thread facts and the JSON contract", () => {
    const prompt = buildSnapshotPrompt(threads);
    assert.ok(prompt.includes(T1));
    assert.ok(prompt.includes(T2));
    assert.match(prompt, /recurring_stressors/);
    assert.match(prompt, /inference_cautions/);
    assert.match(prompt, /thread_id/);
  });
});

describe("weekly snapshot job", () => {
  it("writes version 1 with the correct claim ceiling on the happy path", async () => {
    const llm = new MockLlm([validModel]);
    const { calls, result } = await runWith(defaultFixtures(), llm);

    assert.equal(result.written, true);
    assert.equal(result.version, 1);
    assert.equal(llm.callsUsed(), 1);

    const inserts = calls.filter((sql) => /INSERT INTO user_model_snapshots/.test(sql));
    assert.equal(inserts.length, 1);
    assert.ok(inserts[0].includes(`'${snapshotId(USER, 1)}'`));
    assert.match(inserts[0], /'attribution_candidate'/);
    assert.ok(inserts[0].includes(T1));
    assert.ok(inserts[0].includes(T2));
    assert.match(inserts[0], /## Recurring stressors/);

    const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
    assert.equal(metrics.length, 1);
    assert.match(metrics[0], /'layer2:snapshot'/);
  });

  it("fails closed after one retry: no insert, validation warning, webhook alert", async () => {
    const bad = { ...validModel, recurring_stressors: [{ text: "deploys cause stress", thread_id: T1 }] };
    const llm = new MockLlm([bad, bad]);
    const webhookCalls: string[] = [];
    const { calls, result } = await runWith(defaultFixtures(), llm, {
      alertWebhook: "https://hooks.example.com/layer2",
      fetchImpl: (async (url: any, init: any) => {
        webhookCalls.push(`${url} ${init?.body ?? ""}`);
        return { ok: true, json: async () => ({}) };
      }) as any,
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

  it("does not flag snapshot_stale when a recent snapshot survives the fail-closed keep", async () => {
    const bad = { ...validModel, recurring_stressors: [{ text: "deploys cause stress", thread_id: T1 }] };
    const llm = new MockLlm([bad, bad]);
    const fixtures: Fixture[] = [
      [/FROM causal_memory_threads t\b/, threadRows],
      [/COALESCE\(MAX\(version\), 0\)/, [{ v: 3 }]],
      [/SELECT created_at_ts FROM user_model_snapshots/, [{ created_at_ts: NOW - 86_400 }]],
    ];
    const { result } = await runWith(fixtures, llm);
    assert.equal(result.written, false);
    assert.ok(!result.warnings.includes("snapshot_stale"));
  });

  it("retries once with validation errors and writes when the retry is valid", async () => {
    const bad = { ...validModel, intervention_response: [{ text: "", thread_id: T2 }] };
    const llm = new MockLlm([bad, validModel]);
    const { calls, result } = await runWith(defaultFixtures(), llm);

    assert.equal(result.written, true);
    assert.equal(llm.callsUsed(), 2);
    assert.ok(llm.prompts[1].includes("failed validation"));
    assert.equal(calls.filter((sql) => /INSERT INTO user_model_snapshots/.test(sql)).length, 1);
  });

  it("bumps the version past the previous max", async () => {
    const llm = new MockLlm([validModel]);
    const fixtures: Fixture[] = [
      [/FROM causal_memory_threads t\b/, threadRows],
      [/COALESCE\(MAX\(version\), 0\)/, [{ v: 4 }]],
    ];
    const { calls, result } = await runWith(fixtures, llm);
    assert.equal(result.written, true);
    assert.equal(result.version, 5);
    const insert = calls.find((sql) => /INSERT INTO user_model_snapshots/.test(sql)) ?? "";
    assert.ok(insert.includes(`'${snapshotId(USER, 5)}'`));
  });

  it("skips the LLM entirely when there are no active threads", async () => {
    const llm = new MockLlm([validModel]);
    const fixtures: Fixture[] = [[/FROM causal_memory_threads t\b/, []]];
    const { calls, result } = await runWith(fixtures, llm);

    assert.equal(result.written, false);
    assert.equal(llm.callsUsed(), 0);
    assert.deepEqual(result.warnings, ["no_active_threads"]);
    assert.ok(!calls.some((sql) => /INSERT INTO user_model_snapshots/.test(sql)));
    const metrics = calls.filter((sql) => /INSERT INTO pipeline_metrics/.test(sql));
    assert.equal(metrics.length, 1);
    assert.match(metrics[0], /no_active_threads/);
  });

  it("selects top active threads with the evidence-count subquery and limit", async () => {
    const seen: string[] = [];
    const llm = new MockLlm([validModel]);
    await runWeeklySnapshotJob({
      userId: USER,
      exec: async () => {},
      query: async (sql: string) => {
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

  describe("gemini key gate (no llm injected)", () => {
    const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY"] as const;
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
      savedEnv = {};
      for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
      process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
    });

    afterEach(() => {
      for (const key of ENV_KEYS) {
        if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
        else delete process.env[key];
      }
    });

    it("skips with gemini_key_missing instead of throwing when no key exists anywhere", async () => {
      const { calls, result } = await runWith(defaultFixtures(), undefined as any);

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

    it("does not flag snapshot_stale on skip when a recent snapshot is retained", async () => {
      const fixtures: Fixture[] = [
        [/FROM causal_memory_threads t\b/, threadRows],
        [/SELECT created_at_ts FROM user_model_snapshots/, [{ created_at_ts: NOW - 86_400 }]],
      ];
      const { result } = await runWith(fixtures, undefined as any);
      assert.equal(result.written, false);
      assert.ok(result.warnings.some((w) => /gemini_key_missing/.test(w)));
      assert.ok(!result.warnings.includes("snapshot_stale"));
    });
  });

  it("records a job_failed metrics row and rethrows when the LLM call throws", async () => {
    const llm = new MockLlm([new Error("gemini down")]);
    const calls: string[] = [];
    const webhookCalls: string[] = [];
    await assert.rejects(() => runWeeklySnapshotJob({
      userId: USER,
      exec: async (sql: string) => { calls.push(sql); },
      query: makeQuery(defaultFixtures()),
      nowTs: () => NOW,
      llm,
      alertWebhook: "https://hooks.example.com/layer2",
      fetchImpl: (async (url: any, init: any) => {
        webhookCalls.push(`${url} ${init?.body ?? ""}`);
        return { ok: true, json: async () => ({}) };
      }) as any,
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

describe("snapshot job RLS scoping (F1 One-Time-Filter regression)", () => {
  it("every snapshot read filters user_id by the scope row, never by a literal", async () => {
    // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
    // planner fold the RLS qual into a One-Time Filter evaluated at executor
    // startup — before the lateral scope row has run set_config — so a fresh
    // pooled backend silently returns zero rows (live bug F1). Every read
    // body must reference the scope row's uid instead.
    const queries: string[] = [];
    const fixtureQuery = makeQuery(defaultFixtures());
    await runWeeklySnapshotJob({
      userId: USER,
      exec: async () => {},
      query: async (sql: string) => { queries.push(sql); return fixtureQuery(sql); },
      nowTs: () => NOW,
      llm: new MockLlm([validModel]),
    });
    const userScoped = queries.filter((sql) => sql.includes("user_id"));
    // active-threads read + MAX(version) read
    assert.equal(userScoped.length, 2);
    for (const sql of userScoped) {
      assert.ok(
        sql.includes("user_id = __daobrew_scope.uid"),
        `read must filter user_id via the scope row, got: ${sql}`,
      );
      assert.ok(
        !sql.includes(`user_id = '${USER}'`),
        `read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`,
      );
    }
  });
});
