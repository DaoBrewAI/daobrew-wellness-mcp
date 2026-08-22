import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { readCausalMemory } from "../src/engine/memory/reader.js";

const USER = "local";
const T1 = "cmt_aaaaaaaaaaaaaaaaaaaaaaaa";
const T2 = "cmt_bbbbbbbbbbbbbbbbbbbbbbbb";

const threadRows = [
  {
    id: T1,
    user_id: USER,
    thread_key: "root:ghost_1",
    key_version: 1,
    graph_root_id: "ghost_1",
    title: "Deploy crunch",
    summary: "hypothesis",
    claim_level: "causal_hypothesis",
    status: "active",
    pattern_keys_json: ["wood"],
    recurrence_count: 4,
    first_seen_ts: 1_799_000_000,
    last_seen_ts: 1_799_900_000,
    last_reinforced_ts: 1_799_900_000,
    strength: 2.8,
    decay_state: "active",
  },
  {
    id: T2,
    user_id: USER,
    thread_key: "root:ghost_2",
    key_version: 1,
    graph_root_id: "ghost_2",
    title: "Self-reported worry",
    summary: null,
    claim_level: "causal_hypothesis",
    status: "active",
    pattern_keys_json: [],
    recurrence_count: 2,
    first_seen_ts: 1_798_000_000,
    last_seen_ts: 1_799_000_000,
    last_reinforced_ts: null,
    strength: 1.2,
    decay_state: "active",
  },
];

const evidenceRows = [
  { thread_id: T1, source_table: "meeting_notes" },
  { thread_id: T1, source_table: "user_insights" },
  { thread_id: T2, source_table: "user_insights" },
  { thread_id: T2, source_table: null },
];

// V6: verdict rows for the aggregate verification-count query. T1 has two
// confirmations, one contradiction, and one insufficient_observation (counts
// as neither — consistent with nightly's counting). T2 has no verdicts.
const verificationRows = [
  { thread_id: T1, verdict: "no_recurrence_observed", observed_at_ts: 1_799_100_000 },
  { thread_id: T1, verdict: "no_recurrence_observed", observed_at_ts: 1_799_400_000 },
  { thread_id: T1, verdict: "pattern_recurred", observed_at_ts: 1_799_200_000 },
  { thread_id: T1, verdict: "insufficient_observation", observed_at_ts: 1_799_500_000 },
];

const snapshotRow = {
  id: "ums_cccccccccccccccccccccccc",
  user_id: USER,
  version: 3,
  snapshot_text: "## Recurring stressors\n- something [cmt_a]",
  source_thread_ids_json: [T1],
  claim_ceiling: "causal_hypothesis",
  generated_from_count: 2,
  created_at_ts: 1_799_990_000,
};

function makeQuery(withSnapshot: boolean, seen: string[] = [], verdicts: Record<string, any>[] = verificationRows) {
  return async (sql: string) => {
    seen.push(sql);
    if (/FROM causal_memory_threads/.test(sql)) return threadRows;
    if (/FROM causal_thread_evidence/.test(sql)) return evidenceRows;
    if (/FROM thread_verifications/.test(sql)) return verdicts;
    if (/FROM user_model_snapshots/.test(sql)) return withSnapshot ? [snapshotRow] : [];
    return [];
  };
}

describe("causal memory hot-path reader", () => {
  it("filters to active non-dormant threads ordered by strength with a limit", async () => {
    const seen: string[] = [];
    await readCausalMemory({ userId: USER, limit: 5, query: makeQuery(true, seen) });
    const threadsSql = seen.find((sql) => /FROM causal_memory_threads/.test(sql)) ?? "";
    assert.match(threadsSql, /status = 'active'/);
    assert.match(threadsSql, /decay_state = 'active'/);
    assert.match(threadsSql, /ORDER BY strength DESC, last_seen_ts DESC/);
    assert.match(threadsSql, /LIMIT 5/);
  });

  it("applies graph-root and escaped pattern-key filters", async () => {
    const seen: string[] = [];
    await readCausalMemory({
      userId: USER,
      graphRootId: "ghost_1",
      patternKeys: ["wood", "fi're"],
      query: makeQuery(true, seen),
    });
    const threadsSql = seen.find((sql) => /FROM causal_memory_threads/.test(sql)) ?? "";
    assert.match(threadsSql, /graph_root_id = 'ghost_1'/);
    assert.match(threadsSql, /pattern_keys_json \?\| array\['wood', 'fi''re'\]/);
  });

  it("gates influence: sourced hypothesis gets recommendation, memory-only demotes to background", async () => {
    const { threads } = await readCausalMemory({ userId: USER, query: makeQuery(true) });
    const sourced = threads.find((t) => t.id === T1)!;
    const memoryOnly = threads.find((t) => t.id === T2)!;
    assert.equal(sourced.influence, "recommendation");
    assert.deepEqual(sourced.evidence_tables, ["meeting_notes", "user_insights"]);
    assert.equal(memoryOnly.influence, "background_context");
    assert.deepEqual(memoryOnly.evidence_tables, ["user_insights"]);
  });

  it("returns the latest snapshot when present", async () => {
    const result = await readCausalMemory({ userId: USER, query: makeQuery(true) });
    assert.equal(result.snapshot_fallback, false);
    assert.equal(result.snapshot?.version, 3);
    assert.equal(result.snapshot?.claim_ceiling, "causal_hypothesis");
    assert.deepEqual(result.snapshot?.source_thread_ids_json, [T1]);
  });

  it("falls back gracefully when no snapshot exists", async () => {
    const result = await readCausalMemory({ userId: USER, query: makeQuery(false) });
    assert.equal(result.snapshot, null);
    assert.equal(result.snapshot_fallback, true);
    assert.equal(result.threads.length, 2);
  });

  // --- V6: verification counts + snapshot freshness ---------------------------

  it("aggregates verdict counts per thread with one scoped query (kind='verdict', thread ids IN)", async () => {
    const seen: string[] = [];
    const { threads } = await readCausalMemory({ userId: USER, query: makeQuery(true, seen) });
    const verificationSql = seen.filter((sql) => /FROM thread_verifications/.test(sql));
    assert.equal(verificationSql.length, 1, "exactly one verification query per read");
    assert.match(verificationSql[0], /kind = 'verdict'/);
    assert.match(verificationSql[0], new RegExp(`thread_id IN \\('${T1}', '${T2}'\\)`));

    const t1 = threads.find((t) => t.id === T1)!;
    // insufficient_observation counts as neither (consistent with nightly).
    assert.deepEqual(t1.verification, {
      confirmations: 2,
      contradictions: 1,
      last_verdict_at_ts: 1_799_500_000,
    });
  });

  it("threads with zero verdict rows carry zeros and a null last_verdict_at_ts", async () => {
    const { threads } = await readCausalMemory({ userId: USER, query: makeQuery(true) });
    const t2 = threads.find((t) => t.id === T2)!;
    assert.deepEqual(t2.verification, {
      confirmations: 0,
      contradictions: 0,
      last_verdict_at_ts: null,
    });
  });

  it("snapshot_fresh is true just inside the 7-day boundary and false at it", async () => {
    const created = snapshotRow.created_at_ts;
    const fresh = await readCausalMemory({
      userId: USER,
      query: makeQuery(true),
      nowTs: () => created + 7 * 86_400 - 1,
    });
    assert.equal(fresh.snapshot_fresh, true);

    const stale = await readCausalMemory({
      userId: USER,
      query: makeQuery(true),
      nowTs: () => created + 7 * 86_400,
    });
    assert.equal(stale.snapshot_fresh, false);
  });

  it("snapshot_fresh is false when no snapshot exists", async () => {
    const result = await readCausalMemory({
      userId: USER,
      query: makeQuery(false),
      nowTs: () => snapshotRow.created_at_ts,
    });
    assert.equal(result.snapshot_fresh, false);
  });
});

describe("reader RLS scoping (F1 One-Time-Filter regression)", () => {
  it("every read filters user_id by the scope row, never by a literal", async () => {
    // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
    // planner fold the RLS qual into a One-Time Filter evaluated at executor
    // startup — before the lateral scope row has run set_config — so a fresh
    // pooled backend silently returns zero rows (live bug F1). The body must
    // reference the scope row's uid instead.
    const seen: string[] = [];
    await readCausalMemory({ userId: USER, query: makeQuery(true, seen) });
    // threads, evidence, verdicts, snapshot — all four are user-scoped reads.
    assert.equal(seen.length, 4);
    for (const sql of seen) {
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
