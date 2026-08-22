import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  attachSemanticContext,
  retrieveSemanticMemoryEvidence,
  rerankSemanticMemoryEvidence,
  rerankSemanticNeighbors,
  SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD,
  SEMANTIC_MEMORY_EVIDENCE_WEIGHTS,
  retrieveSemanticNeighbors,
  semanticRecencyScore,
  semanticStage1Sql,
  SEMANTIC_K_DEFAULT,
  SEMANTIC_SNIPPET_MAX,
  SEMANTIC_STAGE1_LIMIT,
  SEMANTIC_WEIGHTS,
} from "../src/engine/retrieval/semantic.js";
import type { SemanticCandidateRow } from "../src/engine/retrieval/semantic.js";
import type { GraphDelta } from "../src/engine/reasoner/types.js";
import { ensureSchema } from "../src/engine/schema.js";

const SEMANTIC_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";

const NOW_TS = 1_700_000_000;

function unitVector(): number[] {
  const v = new Array(768).fill(0);
  v[0] = 1;
  return v;
}

function candidate(overrides: Partial<SemanticCandidateRow> = {}): SemanticCandidateRow {
  return {
    table: "user_insights",
    id: "ins-1",
    source_ref: "session.md:1",
    title: null,
    text: "pricing pressure keeps resurfacing",
    ts: NOW_TS - 3600,
    distance: 0.2,
    ...overrides,
  };
}

/** Blank out Gemini key env vars so "no key" degradation paths are testable
 *  even on shells that export a real key. */
async function withoutGeminiKeys(run: () => Promise<void>): Promise<void> {
  const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY };
  const savedConfig = process.env.DAOBREW_CONFIG_FILE;
  const tempRoot = resolve(process.cwd(), ".test-tmp");
  mkdirSync(tempRoot, { recursive: true });
  const configDir = mkdtempSync(join(tempRoot, "daobrew-semantic-config-"));
  const emptyConfig = join(configDir, "config.json");
  writeFileSync(emptyConfig, "{}");
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  process.env.DAOBREW_CONFIG_FILE = emptyConfig;
  try {
    await run();
  } finally {
    rmSync(configDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (savedConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
    else process.env.DAOBREW_CONFIG_FILE = savedConfig;
  }
}

function sqliteCliPresent(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function withSqliteStore(run: () => Promise<void>): Promise<void> {
  const tempRoot = resolve(process.cwd(), ".test-tmp");
  mkdirSync(tempRoot, { recursive: true });
  const tmpDir = mkdtempSync(join(tempRoot, "daobrew-semantic-"));
  const dbPath = join(tmpDir, "sentinel-graph.db");
  const previousDb = process.env.DAOBREW_GRAPH_DB;
  const previousStore = process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_GRAPH_STORE = "sqlite";
  process.env.DAOBREW_GRAPH_DB = dbPath;
  try {
    ensureSchema(dbPath);
    await run();
  } finally {
    if (previousDb === undefined) delete process.env.DAOBREW_GRAPH_DB;
    else process.env.DAOBREW_GRAPH_DB = previousDb;
    if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = previousStore;
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("semantic stage-1 SQL (pure ANN)", () => {
  it("orders by bare `embedding <=> $vec`, scopes by user_id, and caps the pool at 40", () => {
    const sql = semanticStage1Sql("user_insights", SEMANTIC_TEST_USER, unitVector());
    assert.match(sql, /ORDER BY embedding <=> '\[/);
    assert.match(sql, /embedding IS NOT NULL/);
    assert.match(sql, new RegExp(`user_id = '${SEMANTIC_TEST_USER}'`));
    assert.match(sql, new RegExp(`LIMIT ${SEMANTIC_STAGE1_LIMIT}`));
    assert.equal(SEMANTIC_STAGE1_LIMIT, 40);
    // Pure ANN: the ORDER BY carries no weights/arithmetic beyond the operator.
    assert.ok(!/ORDER BY.*[+*]/.test(sql), "stage-1 ORDER BY must stay pure for the HNSW index");
  });

  it("selects table-appropriate text (insight_text vs summary/body) with a shared column shape", () => {
    const insights = semanticStage1Sql("user_insights", "u", unitVector());
    const meetings = semanticStage1Sql("meeting_notes", "u", unitVector());
    assert.match(insights, /insight_text/);
    assert.match(meetings, /NULLIF\(summary,''\)/);
    for (const sql of [insights, meetings]) {
      assert.match(sql, /AS distance/);
      assert.match(sql, /AS ts/);
      assert.match(sql, /source_ref/);
    }
  });

  it("escapes a hostile userId", () => {
    const sql = semanticStage1Sql("user_insights", "a'; DROP TABLE user_insights; --", unitVector());
    assert.match(sql, /user_id = 'a''; DROP TABLE user_insights; --'/);
  });

  it("adds the replay bound and active-memory filter only for semantic memory evidence mode", () => {
    const sql = semanticStage1Sql("user_insights", SEMANTIC_TEST_USER, unitVector(), {
      mode: "memory_evidence",
      endTs: 1_234,
    });
    assert.match(sql, /strength > 0/);
    assert.match(sql, /COALESCE\(occurred_at_ts, created_at_ts\) <= 1234/);

    const baseline = semanticStage1Sql("user_insights", SEMANTIC_TEST_USER, unitVector());
    assert.doesNotMatch(baseline, /strength > 0/);
    assert.doesNotMatch(baseline, /COALESCE\(occurred_at_ts, created_at_ts\) <= 1234/);
  });
});

describe("semantic stage-2 rerank (pure, deterministic)", () => {
  it("blends similarity with recency using the exported weights", () => {
    const fresh = candidate({ id: "fresh", ts: NOW_TS, distance: 0.3 });
    const stale = candidate({ id: "stale", ts: NOW_TS - 365 * 86400, distance: 0.3 });
    const [first, second] = rerankSemanticNeighbors([stale, fresh], NOW_TS);
    assert.equal(first.id, "fresh");
    assert.equal(second.id, "stale");
    // Distance still dominates: a much closer stale row beats a far fresh row.
    const close = candidate({ id: "close", ts: NOW_TS - 365 * 86400, distance: 0.05 });
    const far = candidate({ id: "far", ts: NOW_TS, distance: 0.9 });
    assert.equal(rerankSemanticNeighbors([far, close], NOW_TS)[0].id, "close");
    assert.ok(SEMANTIC_WEIGHTS.similarity > SEMANTIC_WEIGHTS.recency);
  });

  it("recency score is 1 now, halves every half-life, and is 0 for missing timestamps", () => {
    assert.equal(semanticRecencyScore(NOW_TS, NOW_TS), 1);
    assert.ok(Math.abs(semanticRecencyScore(NOW_TS - 30 * 86400, NOW_TS) - 0.5) < 1e-9);
    assert.equal(semanticRecencyScore(null, NOW_TS), 0);
    // Future timestamps clamp to age 0 rather than exceeding 1.
    assert.equal(semanticRecencyScore(NOW_TS + 86400, NOW_TS), 1);
  });

  it("caps at k, is deterministic on ties, and truncates snippets to 200 chars", () => {
    const rows: SemanticCandidateRow[] = [];
    for (let i = 0; i < 20; i++) {
      rows.push(candidate({ id: `ins-${String(i).padStart(2, "0")}`, distance: 0.5, ts: NOW_TS }));
    }
    const reranked = rerankSemanticNeighbors(rows, NOW_TS);
    assert.equal(reranked.length, SEMANTIC_K_DEFAULT);
    // Ties resolve by id, so identical inputs always serve identical outputs.
    assert.deepEqual(
      reranked.map((r) => r.id),
      rows.slice(0, SEMANTIC_K_DEFAULT).map((r) => r.id),
    );
    const long = rerankSemanticNeighbors(
      [candidate({ title: "Weekly pricing sync", text: "x".repeat(500) })],
      NOW_TS,
    );
    assert.ok(long[0].snippet.length <= SEMANTIC_SNIPPET_MAX);
    assert.match(long[0].snippet, /^Weekly pricing sync: x/);
    assert.equal(rerankSemanticNeighbors(rows, NOW_TS, 3).length, 3);
  });
});

describe("retrieveSemanticNeighbors", () => {
  const embedded = unitVector();

  function servedQuery(rowsByTable: Record<string, Record<string, unknown>[]>): (sql: string) => Promise<Record<string, any>[]> {
    return async (sql: string) => {
      if (sql.includes("FROM user_insights")) return rowsByTable.user_insights ?? [];
      if (sql.includes("FROM meeting_notes")) return rowsByTable.meeting_notes ?? [];
      throw new Error(`unexpected sql: ${sql}`);
    };
  }

  it("embeds queryText, pools both tables, and returns reranked references", async () => {
    const embedCalls: string[] = [];
    const warnings: string[] = [];
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryText: "pricing pressure overdrive",
      warnings,
      nowTs: () => NOW_TS,
      embedText: async (text) => {
        embedCalls.push(text);
        return embedded;
      },
      query: servedQuery({
        user_insights: [
          { id: "ins-1", source_ref: "s.md:1", title: null, text: "pricing pressure again", ts: NOW_TS - 60, distance: 0.1 },
        ],
        meeting_notes: [
          { id: "mtg-1", source_ref: "note-9", title: "Pricing sync", text: "walked the tiers", ts: NOW_TS - 120, distance: 0.4 },
        ],
      }),
    });
    assert.deepEqual(embedCalls, ["pricing pressure overdrive"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].table, "user_insights");
    assert.equal(rows[0].id, "ins-1");
    assert.equal(rows[0].source_ref, "s.md:1");
    assert.ok(rows[0].distance < rows[1].distance);
    assert.deepEqual(warnings, []);
  });

  it("skips the embed call when queryEmbedding is provided", async () => {
    let embedCalled = false;
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryEmbedding: embedded,
      embedText: async () => {
        embedCalled = true;
        return embedded;
      },
      nowTs: () => NOW_TS,
      query: servedQuery({
        user_insights: [{ id: "i", source_ref: null, title: null, text: "t", ts: NOW_TS, distance: 0.2 }],
      }),
    });
    assert.equal(embedCalled, false);
    assert.equal(rows.length, 1);
  });

  it("caps k", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `i-${String(i).padStart(2, "0")}`, source_ref: null, title: null, text: "t", ts: NOW_TS, distance: 0.2,
    }));
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryEmbedding: embedded,
      k: 5,
      nowTs: () => NOW_TS,
      query: servedQuery({ user_insights: many }),
    });
    assert.equal(rows.length, 5);
  });

  // --- degradation paths: EMPTY array, never a throw ------------------------
  it("degrades to empty with a warning when no Gemini key can embed the query", async () => {
    await withoutGeminiKeys(async () => {
      const warnings: string[] = [];
      const rows = await retrieveSemanticNeighbors({
        userId: "u1",
        queryText: "anything",
        warnings,
        query: servedQuery({}),
        // no embedText injected and no GEMINI key in the test env
      });
      assert.deepEqual(rows, []);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /semantic retrieval degraded/);
      assert.match(warnings[0], /Gemini/i);
    });
  });

  it("degrades to empty with a warning on a non-postgres store", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    await withSqliteStore(async () => {
      const warnings: string[] = [];
      const rows = await retrieveSemanticNeighbors({
        userId: "u1",
        queryText: "anything",
        warnings,
        embedText: async () => embedded,
        // no query injected -> falls back to the store, which is sqlite here
      });
      assert.deepEqual(rows, []);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /semantic retrieval degraded/);
      assert.match(warnings[0], /postgres/i);
    });
  });

  it("degrades to empty with a warning when zero embedded rows exist (alive, waiting for data)", async () => {
    const warnings: string[] = [];
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryText: "anything",
      warnings,
      embedText: async () => embedded,
      query: servedQuery({}),
    });
    assert.deepEqual(rows, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /semantic retrieval empty/);
  });

  it("degrades to empty with a warning when the embedding call fails", async () => {
    const warnings: string[] = [];
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryText: "anything",
      warnings,
      embedText: async () => {
        throw new Error("quota exhausted");
      },
      query: servedQuery({}),
    });
    assert.deepEqual(rows, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /semantic retrieval degraded/);
    assert.match(warnings[0], /quota exhausted/);
  });

  it("degrades to empty with a warning when the ANN query itself fails", async () => {
    const warnings: string[] = [];
    const rows = await retrieveSemanticNeighbors({
      userId: "u1",
      queryEmbedding: embedded,
      warnings,
      query: async () => {
        throw new Error("relation does not exist");
      },
    });
    assert.deepEqual(rows, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /semantic retrieval degraded/);
  });
});

describe("semantic memory evidence retrieval", () => {
  const embedded = unitVector();

  function memoryCandidate(overrides: Partial<SemanticCandidateRow> = {}): SemanticCandidateRow {
    return {
      table: "user_insights",
      id: "mem-1",
      user_id: "u1",
      source: "claude_project_session",
      source_ref: "session.md:1",
      title: null,
      text: "wedge decision keeps slipping",
      insight_text: "wedge decision keeps slipping",
      topics_json: ["#wedge"],
      ts: NOW_TS - 3600,
      occurred_at_ts: NOW_TS - 3600,
      last_accessed_ts: null,
      created_at_ts: NOW_TS - 7200,
      distance: 0.2,
      importance: 0.7,
      strength: 0.8,
      ...overrides,
    };
  }

  it("uses the §5B weighted rerank and clamps out-of-range strength values", () => {
    const stronger = memoryCandidate({ id: "stronger", distance: 0.18, strength: 5, importance: 0.9 });
    const weaker = memoryCandidate({ id: "weaker", distance: 0.12, strength: -2, importance: 0.1, ts: NOW_TS - 60 * 86400 });
    const reranked = rerankSemanticMemoryEvidence([weaker, stronger], NOW_TS, 2);

    assert.equal(reranked[0].memory.id, "stronger");
    assert.equal(reranked[1].memory.id, "weaker");
    assert.ok(reranked[0].semanticScore > reranked[1].semanticScore);
    assert.ok(SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.similarity > SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.importance);
    assert.ok(reranked[0].semanticScore >= SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD);

    const capped = rerankSemanticMemoryEvidence([
      memoryCandidate({ id: "capped", strength: 4, distance: 0.2, importance: 0.5 }),
      memoryCandidate({ id: "unit", strength: 1, distance: 0.2, importance: 0.5 }),
    ], NOW_TS, 2);
    const byId = new Map(capped.map((entry) => [entry.memory.id, entry.semanticScore]));
    assert.ok(Math.abs((byId.get("capped") ?? 0) - (byId.get("unit") ?? 0)) < 1e-9);
  });

  it("retrieves bounded within-user memory evidence with weighted scores", async () => {
    const queries: string[] = [];
    const rows = await retrieveSemanticMemoryEvidence({
      userId: "u1",
      queryEmbedding: embedded,
      endTs: NOW_TS - 10,
      nowTs: () => NOW_TS,
      query: async (sql) => {
        queries.push(sql);
        return [memoryCandidate()];
      },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].memory.graph_source_ref, "memory:session.md:1");
    assert.equal(rows[0].memory.topics[0], "#wedge");
    assert.ok(rows[0].semanticScore > 0);
    assert.match(queries[0], new RegExp(`COALESCE\\(occurred_at_ts, created_at_ts\\) <= ${NOW_TS - 10}`));
    assert.match(queries[0], /strength > 0/);
  });
});

describe("attachSemanticContext (context-only root attachment)", () => {
  function armedDelta(): GraphDelta {
    return {
      user_id: "u1",
      nodes: [{
        id: "root-1",
        kind: "ghost",
        title: "Pricing thread under OVERDRIVE",
        source: "reasoner",
        source_ref: "reasoner:root",
        props_json: { status: "suggested", selected_pattern: "overdrive" },
      }],
      edges: [],
      root_armed: true,
      armed_root_cause: { node_id: "root-1", confidence: 0.7, root_cause_class: "productivity", brief: {} as any },
    };
  }

  it("attaches neighbor REFERENCES (table:source_ref/id + distance), never text snippets", async () => {
    const delta = armedDelta();
    const queries: string[] = [];
    const result = await attachSemanticContext({
      delta,
      userId: "u1",
      nowTs: () => NOW_TS,
      embedText: async () => unitVector(),
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes("FROM user_insights")) {
          return [{ id: "ins-1", source_ref: "s.md:1", title: null, text: "secret full text", ts: NOW_TS, distance: 0.1 }];
        }
        return [{ id: "mtg-1", source_ref: null, title: "Pricing sync", text: "body", ts: NOW_TS, distance: 0.3 }];
      },
    });
    assert.equal(result.attached, 2);
    const props = delta.nodes[0].props_json as Record<string, any>;
    const context = props.semantic_context;
    assert.ok(context, "semantic_context attached to the armed root");
    assert.equal(context.neighbors.length, 2);
    assert.deepEqual(context.neighbors[0], {
      ref: "user_insights:s.md:1",
      table: "user_insights",
      id: "ins-1",
      distance: 0.1,
    });
    // source_ref-less rows fall back to table:id references.
    assert.equal(context.neighbors[1].ref, "meeting_notes:mtg-1");
    assert.ok(!JSON.stringify(context).includes("secret full text"), "full text must not reach root props");
    // Query text came from the armed root's title/pattern.
    assert.match(String(context.query_text), /Pricing thread under OVERDRIVE/);
    assert.match(String(context.query_text), /overdrive/);
    // Existing props survive the attach.
    assert.equal(props.status, "suggested");
  });

  it("attaches nothing (no key) but reports the degradation warning", async () => {
    await withoutGeminiKeys(async () => {
      const delta = armedDelta();
      const result = await attachSemanticContext({
        delta,
        userId: "u1",
        query: async () => [],
        // no embedText and no key in the env
      });
      assert.equal(result.attached, 0);
      assert.equal((delta.nodes[0].props_json as Record<string, any>).semantic_context, undefined);
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /semantic retrieval degraded/);
    });
  });

  it("skips watching-shaped deltas without a resolvable root text", async () => {
    const delta = armedDelta();
    delta.nodes = [];
    const result = await attachSemanticContext({ delta, userId: "u1", query: async () => [] });
    assert.equal(result.attached, 0);
    assert.deepEqual(result.warnings, []);
  });
});

describe("run.ts semantic wiring (alive on sqlite, degrades loudly)", () => {
  it("demo non-dry sqlite run stays green and never gains semantic_context (postgres-only path)", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    await withSqliteStore(async () => {
      const { runEngineOnce } = await import("../src/engine/run.js");
      const result = await runEngineOnce({ once: true, demo: true, userId: SEMANTIC_TEST_USER });
      assert.equal(result.status, "written");
      // The attach lives behind the postgres guard; sqlite deltas stay byte-identical.
      assert.ok(!result.warnings.some((w) => /semantic context attach failed/.test(w)));
    });
  });
});

describe("semantic stage-1 RLS scoping (F1 One-Time-Filter regression)", () => {
  function withGraphStore<T>(kind: string, fn: () => T): T {
    const previous = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = kind;
    try {
      return fn();
    } finally {
      if (previous === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = previous;
    }
  }

  it("references the scope row under postgres, never the literal", () => {
    // In postgres mode the stage-1 SQL runs through scopedQuery(userId); a
    // `user_id = '<literal>'` in the body lets the planner fold the RLS qual
    // into a One-Time Filter evaluated at executor startup — before the
    // lateral scope row has run set_config — so a fresh pooled backend
    // silently returns zero rows (live bug F1).
    withGraphStore("postgres", () => {
      const sql = semanticStage1Sql("user_insights", SEMANTIC_TEST_USER, unitVector());
      assert.ok(
        sql.includes("user_id = __daobrew_scope.uid"),
        `postgres stage-1 SQL must filter user_id via the scope row, got: ${sql}`,
      );
      assert.ok(
        !sql.includes(`user_id = '${SEMANTIC_TEST_USER}'`),
        `postgres stage-1 SQL must NOT compare user_id to a literal, got: ${sql}`,
      );
    });
  });

  it("keeps the escaped literal under sqlite (plain queryJson has no scope row)", () => {
    withGraphStore("sqlite", () => {
      const sql = semanticStage1Sql("user_insights", SEMANTIC_TEST_USER, unitVector());
      assert.ok(
        sql.includes(`user_id = '${SEMANTIC_TEST_USER}'`),
        `sqlite stage-1 SQL must keep the escaped literal, got: ${sql}`,
      );
      assert.ok(
        !sql.includes("__daobrew_scope.uid"),
        `sqlite has no scope row — the reference would be an unknown-column error, got: ${sql}`,
      );
    });
  });
});
