// Keep config reads hermetic. graph-db no longer consumes client Postgres URLs.
process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { handleToolCall } from "../src/tools.js";
import { Reasoner, rootCauseId } from "../src/engine/reasoner/Reasoner.js";
import { GraphDelta } from "../src/engine/reasoner/types.js";
import { runEngineOnce } from "../src/engine/run.js";
import {
  __resetPostgresSchemaEnsureForTests,
  ensureSchema,
} from "../src/engine/schema.js";
import { joinTriplets, TripletInput } from "../src/engine/triplet.js";
import { GraphDeltaValidationError, upsertGraphDelta, validateGraphDelta } from "../src/engine/upsert.js";
import { scopedExec, scopedQuery } from "../src/engine/user-scope.js";
import * as graphDb from "../src/graph-db.js";
import { __resetGraphDbConfigCacheForTests } from "../src/graph-db.js";

const UPSERT_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const UPSERT_OTHER_USER = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const UPSERT_ROOT_ID = rootCauseId(UPSERT_TEST_USER);
const UPSERT_DONE_EDGE_ID = `e_done_${UPSERT_ROOT_ID}`;

function sqliteCliPresent(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sqlite(dbPath: string, sql: string): string {
  return execFileSync("sqlite3", [dbPath, sql], { encoding: "utf-8" });
}

async function withTempGraphDb(run: (dbPath: string) => Promise<void>): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "daobrew-upsert-"));
  const dbPath = join(tmpDir, "sentinel-graph.db");
  const previous = process.env.DAOBREW_GRAPH_DB;
  process.env.DAOBREW_GRAPH_DB = dbPath;
  try {
    ensureSchema(dbPath);
    await run(dbPath);
  } finally {
    if (previous === undefined) delete process.env.DAOBREW_GRAPH_DB;
    else process.env.DAOBREW_GRAPH_DB = previous;
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function fixtureInput(userId = UPSERT_TEST_USER): TripletInput {
  return {
    biometrics: {
      metrics: [{
        metric: "heart_rate",
        range: "day",
        aggregated: { avg: 88, min: 70, max: 96 },
        samples: [{
          metric: "heart_rate",
          value: 96,
          timestamp: "1970-01-01T00:16:50.000Z",
          graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:50.000Z",
        }],
      }],
      states: [{
        bucket_ts: 1000,
        yin_score: 35,
        yang_score: 82,
        category: "pushing_it",
        source_quality: "data_verified",
        updated_at_ts: 1010,
        graph_source_ref: "state:1000",
      }],
    },
    calendar: [{
      id: "event-1",
      user_id: userId,
      source: "eventkit",
      source_ref: "evt-1",
      graph_source_ref: "calendar:evt-1",
      title: "AI2 demo sync",
      start_ts: 1030,
      end_ts: 1600,
      all_day: false,
      attendee_count: 2,
      attendees: [],
      calendar_name: "DaoBrew",
      location: "Zoom",
      metadata: {},
      created_at_ts: 900,
    }],
    granola: [{
      id: "meeting-1",
      user_id: userId,
      source: "granola",
      source_ref: "note-1",
      graph_source_ref: "granola:note-1",
      event_id: "event-1",
      kind: "meeting",
      title: "AI2 demo sync",
      occurred_at_ts: 1040,
      duration_sec: 1800,
      participants: [],
      summary: "Demo flow review",
      body: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
      transcript_spans: [{
        idx: 0,
        speaker: "Neo",
        ts_offset_sec: 120,
        text: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
      }],
      topics: ["#demo"],
      created_at_ts: 901,
    }],
    memory: [{
      id: "memory-1",
      user_id: userId,
      source: "claude_sessions",
      source_ref: "session.md:42",
      graph_source_ref: "memory:session.md:42",
      insight_text: "Project memory says Neo keeps circling the one wedge demo proof loop and needs the real review path.",
      topics: ["#one-wedge", "#demo-readiness"],
      importance: 0.9,
      strength: 0.8,
      occurred_at_ts: null,
      last_accessed_ts: null,
      created_at_ts: 902,
    }],
  };
}

async function fixtureDelta(userId = UPSERT_TEST_USER): Promise<GraphDelta> {
  const triplets = joinTriplets(fixtureInput(userId), {
    userId,
    contextWindowSec: 120,
    sampleWindowSec: 60,
  });
  return new Reasoner().buildDelta({ user_id: userId, triplets });
}

describe("upsertGraphDelta", () => {
  it("transactionally writes and arms a GraphDelta idempotently", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      const first = await upsertGraphDelta(delta, { nowTs: 1234 });

      assert.strictEqual(first.status, "written");

      const counts = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      const second = await upsertGraphDelta(delta, { nowTs: 1234 });
      assert.strictEqual(second.status, "written");
      const countsAfterRerun = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      assert.strictEqual(countsAfterRerun, counts);

      const root = sqlite(
        dbPath,
        `SELECT json_extract(props_json,'$.status') || '|' || json_extract(props_json,'$.brief.cause') FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim();
      assert.match(root, /^armed\|Closing the evidence-backed delivery loop/);

      const detonator = await handleToolCall("daobrew_detonate", {}, true);
      assert.match(detonator.content[0].text as string, new RegExp(`cause_id: ${UPSERT_ROOT_ID}`));
      assert.match(detonator.content[0].text as string, /evidence-backed delivery loop/);
    });
  });

  it("rejects deltas with unbacked episodes and missing edge refs", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async () => {
      const delta = await fixtureDelta();
      const episode = delta.nodes.find((node) => node.kind === "episode");
      assert.ok(episode);
      episode.source_ref = "manual:episode";
      delta.edges[0].src_id = "missing-node";

      await assert.rejects(
        () => upsertGraphDelta(delta),
        (err: Error) => {
          assert.ok(err instanceof GraphDeltaValidationError);
          assert.match(err.message, /lacks biometric source_ref/);
          assert.match(err.message, /missing src node missing-node/);
          return true;
        },
      );
    });
  });

  it("does not re-arm a completed root cause by default", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      await upsertGraphDelta(delta, { nowTs: 1234 });
      sqlite(
        dbPath,
        `UPDATE graph_nodes SET props_json = json_set(props_json, '$.status', 'done') WHERE id='${UPSERT_ROOT_ID}';`,
      );

      const result = await upsertGraphDelta(delta, { nowTs: 1235 });
      assert.strictEqual(result.status, "skipped_done");
      assert.strictEqual(result.root_armed, false);

      const status = sqlite(
        dbPath,
        `SELECT json_extract(props_json,'$.status') FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim();
      assert.strictEqual(status, "done");
    });
  });

  it("skips the watching write when the root is done, preserving the done lifecycle", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      await upsertGraphDelta(delta, { nowTs: 1234 });
      await handleToolCall("daobrew_detonate_done", {
        cause_id: UPSERT_ROOT_ID,
        artifact_ref: "ai2-demo-story.md",
      }, true);
      const countsBefore = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();

      const triplets = joinTriplets(fixtureInput(), {
        userId: UPSERT_TEST_USER,
        contextWindowSec: 120,
        sampleWindowSec: 60,
      });
      const watching = await new Reasoner().buildWatchingDelta({
        user_id: UPSERT_TEST_USER,
        triplets,
        generated_at_ts: 2234,
      });
      const result = await upsertGraphDelta(watching, { nowTs: 2234 });

      assert.strictEqual(result.status, "skipped_done");
      assert.strictEqual(result.root_armed, false);

      const props = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(props.status, "done");
      assert.strictEqual(props.artifact_ref, "ai2-demo-story.md");
      assert.ok(Number.isFinite(props.done_at_ts));
      assert.match(props.brief.cause, /evidence-backed delivery loop/);

      const doneEdges = sqlite(
        dbPath,
        `SELECT count(*) FROM graph_edges WHERE id='${UPSERT_DONE_EDGE_ID}';`,
      ).trim();
      assert.strictEqual(doneEdges, "1");

      const countsAfter = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      assert.strictEqual(countsAfter, countsBefore);
    });
  });

  it("clears completed artifact props when an explicit re-arm is allowed", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      await upsertGraphDelta(delta, { nowTs: 1234 });
      sqlite(
        dbPath,
        `UPDATE graph_nodes
            SET props_json = json_set(
              props_json,
              '$.status', 'done',
              '$.artifact_ref', 'ai2-demo-story.md',
              '$.summary', 'stale WATCHING summary'
            )
          WHERE id='${UPSERT_ROOT_ID}';`,
      );

      const result = await upsertGraphDelta(delta, { nowTs: 1235, allowRearmDone: true });
      const props = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());

      assert.strictEqual(result.status, "written");
      assert.strictEqual(result.root_armed, true);
      assert.strictEqual(props.status, "armed");
      assert.strictEqual(props.artifact_ref, undefined);
      assert.notStrictEqual(props.summary, "stale WATCHING summary");
    });
  });

  it("stamps armed_at_ts on the →armed transition and keeps it stable while armed", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();

      // (a) fresh arm stamps the transition time.
      await upsertGraphDelta(delta, { nowTs: 1234 });
      const armed = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(armed.status, "armed");
      assert.strictEqual(armed.armed_at_ts, 1234);

      // (b) re-upserting the armed delta with a LATER clock must NOT move the
      // stamp: the intervention-assignment id derived at detonate time has to
      // resolve unchanged at detonate_done, and the engine re-upserts the armed
      // delta on every run in between.
      await upsertGraphDelta(delta, { nowTs: 9999 });
      const stillArmed = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(stillArmed.armed_at_ts, 1234);

      // (b2) legacy stampless armed root: re-upserting must PRESERVE the
      // absence — a mid-episode stamp would change the assignment id between
      // detonate and detonate_done for episodes opened before the field existed.
      sqlite(
        dbPath,
        `UPDATE graph_nodes SET props_json = json_remove(props_json, '$.armed_at_ts') WHERE id='${UPSERT_ROOT_ID}';`,
      );
      await upsertGraphDelta(delta, { nowTs: 15000 });
      const legacy = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(legacy.status, "armed");
      assert.strictEqual(legacy.armed_at_ts, undefined);

      // (c) done → explicit re-arm is a NEW decision point → fresh stamp.
      sqlite(
        dbPath,
        `UPDATE graph_nodes
            SET props_json = json_set(props_json, '$.status', 'done', '$.artifact_ref', 'ai2-demo-story.md')
          WHERE id='${UPSERT_ROOT_ID}';`,
      );
      await upsertGraphDelta(delta, { nowTs: 20000, allowRearmDone: true });
      const rearmed = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(rearmed.status, "armed");
      assert.strictEqual(rearmed.armed_at_ts, 20000);
    });
  });

  it("preserves offer_state while armed and drops it on a fresh arming episode (MRT v1)", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();

      // (a) direct/local upserts do not opt into the production armedOffer
      // transaction, so they must not invent offer_state.
      await upsertGraphDelta(delta, { nowTs: 1234 });
      const armed = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(armed.offer_state, undefined);

      // (b) the run loop re-upserts the armed delta every run between arming
      // and detonate_done — a held episode must STAY held across re-upserts,
      // like armed_at_ts.
      sqlite(
        dbPath,
        `UPDATE graph_nodes SET props_json = json_set(props_json, '$.offer_state', 'held') WHERE id='${UPSERT_ROOT_ID}';`,
      );
      await upsertGraphDelta(delta, { nowTs: 9999 });
      const stillHeld = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(stillHeld.status, "armed");
      assert.strictEqual(stillHeld.offer_state, "held");

      // (c) done → explicit re-arm is a NEW decision point → fresh draw, so
      // the stale offer_state must NOT survive.
      sqlite(
        dbPath,
        `UPDATE graph_nodes
            SET props_json = json_set(props_json, '$.status', 'done', '$.artifact_ref', 'ai2-demo-story.md')
          WHERE id='${UPSERT_ROOT_ID}';`,
      );
      await upsertGraphDelta(delta, { nowTs: 20000, allowRearmDone: true });
      const rearmed = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      assert.strictEqual(rearmed.status, "armed");
      assert.strictEqual(rearmed.offer_state, undefined);
    });
  });

  it("preserves ghost carry-forward props across reruns", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      await upsertGraphDelta(delta, { nowTs: 1234 });
      sqlite(
        dbPath,
        `UPDATE graph_nodes
            SET props_json = json_set(
              props_json,
              '$.active_weeks', json_array('2026-05-25'),
              '$.weekly_briefs', json_object('2026-05-25', json_object('title', 'AI2 historical root', 'trigger_count', 2)),
              '$.first_seen_week', '2026-05-25',
              '$.last_active_week', '2026-05-25',
              '$.recurrence_count', 1,
              '$.cooldown', json_object('cooldown_weeks', 3, 'last_armed_week', '2026-05-25')
            )
          WHERE id='${UPSERT_ROOT_ID}';`,
      );

      await upsertGraphDelta(delta, { nowTs: 1235 });
      const props = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());

      assert.deepStrictEqual(props.active_weeks, ["1969-12-29", "2026-05-25"]);
      assert.strictEqual(props.first_seen_week, "1969-12-29");
      assert.strictEqual(props.last_active_week, "2026-05-25");
      assert.strictEqual(props.recurrence_count, 2);
      assert.strictEqual(props.weekly_briefs["2026-05-25"].title, "AI2 historical root");
      assert.match(props.weekly_briefs["1969-12-29"].title, /evidence-backed delivery loop/);
      assert.strictEqual(props.cooldown.cooldown_weeks, 3);
      assert.strictEqual(props.status, "armed");
    });
  });

  it("writes WATCHING state and clears stale armed roots without carrying old weeks", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const delta = await fixtureDelta();
      await upsertGraphDelta(delta, { nowTs: 1234 });
      sqlite(
        dbPath,
        `UPDATE graph_nodes
            SET props_json = json_set(
              props_json,
              '$.active_weeks', json_array('2026-05-25'),
              '$.weekly_briefs', json_object('2026-05-25', json_object('title', 'stale title root'))
            )
          WHERE id='${UPSERT_ROOT_ID}';`,
      );

      const triplets = joinTriplets(fixtureInput(), {
        userId: UPSERT_TEST_USER,
        contextWindowSec: 120,
        sampleWindowSec: 60,
      });
      const watching = await new Reasoner().buildWatchingDelta({
        user_id: UPSERT_TEST_USER,
        triplets,
        generated_at_ts: 2234,
      });
      const result = await upsertGraphDelta(watching, { nowTs: 2234 });
      const root = JSON.parse(sqlite(
        dbPath,
        `SELECT props_json FROM graph_nodes WHERE id='${UPSERT_ROOT_ID}';`,
      ).trim());
      const edgeCount = sqlite(
        dbPath,
        "SELECT count(*) FROM graph_edges;",
      ).trim();
      const manifestedCount = sqlite(
        dbPath,
        "SELECT count(*) FROM graph_edges WHERE kind='manifested';",
      ).trim();
      const nodeCount = sqlite(
        dbPath,
        "SELECT count(*) FROM graph_nodes;",
      ).trim();
      const titles = sqlite(
        dbPath,
        "SELECT group_concat(title, '|') FROM graph_nodes;",
      ).trim();
      const armed = sqlite(
        dbPath,
        "SELECT count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed';",
      ).trim();

      assert.strictEqual(result.status, "written");
      assert.strictEqual(result.root_armed, false);
      assert.strictEqual(armed, "0");
      assert.strictEqual(root.status, "watching");
      assert.strictEqual(root.evidence_grade, "insufficient_evidence");
      assert.strictEqual(root.active_weeks, undefined);
      assert.strictEqual(root.weekly_briefs, undefined);
      assert.match(root.brief.cause, /Watching: not enough meeting-note detail/);
      assert.strictEqual(edgeCount, String(watching.edges.length));
      assert.strictEqual(manifestedCount, "0");
      assert.strictEqual(nodeCount, String(watching.nodes.length));
      assert.doesNotMatch(titles, /stale title root/);
    });
  });

  it("writes separate graphs for different users without id collisions", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const localDelta = await fixtureDelta(UPSERT_TEST_USER);
      const otherDelta = await fixtureDelta(UPSERT_OTHER_USER);
      await upsertGraphDelta(localDelta, { nowTs: 1234 });
      const counts = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();

      await upsertGraphDelta(otherDelta, { userId: UPSERT_OTHER_USER, nowTs: 1235 });
      const countsAfterOther = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      assert.notStrictEqual(countsAfterOther, counts);

      const perUser = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      // 10 = 5 patterns + root ghost + episode + 2 meeting context nodes
      // + 1 memory_hit (project-memory support is now a first-class node).
      assert.deepStrictEqual(perUser, [`${UPSERT_TEST_USER}:10`, `${UPSERT_OTHER_USER}:10`]);

      const patternsPerUser = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes WHERE kind='pattern' GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      assert.deepStrictEqual(patternsPerUser, [`${UPSERT_TEST_USER}:5`, `${UPSERT_OTHER_USER}:5`]);

      const armedPerUser = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed' GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      assert.deepStrictEqual(armedPerUser, [`${UPSERT_TEST_USER}:1`, `${UPSERT_OTHER_USER}:1`]);

      const rootIds = sqlite(
        dbPath,
        "SELECT id FROM graph_nodes WHERE kind='ghost' ORDER BY user_id;",
      ).trim().split("\n");
      assert.deepStrictEqual(rootIds, [UPSERT_ROOT_ID, rootCauseId(UPSERT_OTHER_USER)]);

      const beforeRerun = countsAfterOther;
      await upsertGraphDelta(otherDelta, { userId: UPSERT_OTHER_USER, nowTs: 1236 });
      const afterRerun = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      assert.strictEqual(afterRerun, beforeRerun);
    });
  });
});

// ---------------------------------------------------------------------------
// RLS deferred wiring (1/3): injected exec/query seams + run.ts entry-point
// wiring. Same seam as tests/user-scope.test.ts — the compiled CJS modules
// resolve `graph_db_js_1.execSql`/`queryJson`/`execSqlSync` at call time, so
// swapping graph-db's exports for capturing fakes intercepts the genuine
// delegate chain and no real Postgres (local or Neon) is ever touched.
// execSqlSync is faked too so ensureSchema's postgres verifier is a no-op.
// ---------------------------------------------------------------------------

/** Keep in sync with postgres-rls.ts RLS_GUC and user-scope.ts. */
const GUC = "app.daobrew_user_id";

const WIRING_USER = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";

interface CapturedSql {
  execs: string[];
  queries: string[];
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

async function withPostgresFakeTransport(
  fn: (captured: CapturedSql) => Promise<void>,
): Promise<void> {
  const mod = graphDb as any;
  const realExec = mod.execSql;
  const realQuery = mod.queryJson;
  const realExecSync = mod.execSqlSync;
  const savedEnv = {
    DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
    DAOBREW_API_KEY: process.env.DAOBREW_API_KEY,
    DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
  };
  const captured: CapturedSql = { execs: [], queries: [] };
  mod.execSql = async (sql: string) => {
    captured.execs.push(sql);
  };
  mod.queryJson = async (sql: string) => {
    captured.queries.push(sql);
    return [];
  };
  mod.execSqlSync = (sql: string) => {
    if (sql.includes("daobrew_runtime_schema")) {
      return JSON.stringify({
        ready: true,
        vector_extension: true,
        generation_current_marker: true,
        missing_tables: [],
        missing_indexes: [],
        missing_functions: [],
        missing_triggers: [],
        trigger_count: 4,
      });
    }
    return "";
  };
  process.env.DAOBREW_GRAPH_STORE = "postgres";
  // No backend key: biometrics stay empty and the run degrades to a loud
  // warning instead of reaching out to any API.
  delete process.env.DAOBREW_API_KEY;
  process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-wiring-test-config.json";
  __resetGraphDbConfigCacheForTests();
  __resetPostgresSchemaEnsureForTests();
  try {
    await fn(captured);
  } finally {
    mod.execSql = realExec;
    mod.queryJson = realQuery;
    mod.execSqlSync = realExecSync;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetGraphDbConfigCacheForTests();
    __resetPostgresSchemaEnsureForTests();
  }
}

function assertScopedQueriesForWiringUser(statements: string[], label: string): void {
  assert.ok(statements.length > 0, `${label}: at least one SQL statement must reach the transport`);
  for (const sql of statements) {
    // Query path: transaction-local set_config inside scopedQuery's lateral
    // SELECT (the autocommit statement's implicit transaction scopes it).
    assert.ok(
      sql.includes(`set_config('${GUC}', '${WIRING_USER}', true)`),
      `${label}: every query must carry the GUC scope for the run's userId, got: ${sql}`,
    );
    assert.strictEqual(
      occurrences(sql, "set_config"),
      1,
      `${label}: the GUC scope must appear exactly once per statement, got: ${sql}`,
    );
  }
}

function assertScopedExecsForWiringUser(statements: string[], label: string): void {
  assert.ok(statements.length > 0, `${label}: at least one SQL statement must reach the transport`);
  for (const sql of statements) {
    // Exec path: scopedExec's single BEGIN/set_config(is_local=true)/COMMIT
    // transaction — one pooled backend, no session GUC leakage.
    assert.ok(sql.startsWith("BEGIN;"), `${label}: exec must open the scoped transaction, got: ${sql}`);
    assert.ok(sql.trimEnd().endsWith("COMMIT;"), `${label}: exec must commit the scoped transaction, got: ${sql}`);
    // Count top-level transaction-control lines, not PL/pgSQL BEGIN blocks
    // used by fail-soft assignment/generation DO statements inside the batch.
    assert.strictEqual(
      sql.split("\n").filter((line) => line.trim() === "BEGIN;").length,
      1,
      `${label}: exactly one transaction BEGIN, got: ${sql}`,
    );
    assert.strictEqual(
      sql.split("\n").filter((line) => line.trim() === "COMMIT;").length,
      1,
      `${label}: exactly one transaction COMMIT, got: ${sql}`,
    );
    assert.ok(
      sql.includes(`set_config('${GUC}', '${WIRING_USER}', true)`),
      `${label}: every exec must carry the transaction-local GUC for the run's userId, got: ${sql}`,
    );
    assert.strictEqual(
      occurrences(sql, "set_config"),
      1,
      `${label}: the GUC scope must appear exactly once per statement, got: ${sql}`,
    );
  }
}

describe("upsertGraphDelta injected executors", () => {
  it("co-locates exact-lease guard, graph DML, receipt, and generation in one postgres batch", async () => {
    await withPostgresFakeTransport(async () => {
      const generationUser = "6BE41257-235F-463C-90B4-C6A3400D112A";
      const delta = await fixtureDelta(generationUser);
      const writes: string[] = [];
      const result = await upsertGraphDelta(delta, {
        userId: generationUser,
        generationId: "11111111-1111-4111-8111-111111111111",
        leaseToken: "22222222-2222-4222-8222-222222222222",
        armedOffer: { treatmentP: 1 },
        nowTs: 1_234,
        query: async () => [],
        exec: async (sql) => { writes.push(sql); },
      });

      assert.strictEqual(result.status, "written");
      assert.strictEqual(writes.length, 1, "one scopedExec call owns the entire commit");
      const sql = writes[0];
      const guard = sql.indexOf("$daobrew_generation_guard$");
      const graphWrite = sql.indexOf("INSERT INTO graph_nodes");
      const assignment = sql.indexOf("INSERT INTO intervention_assignments");
      const receipt = sql.indexOf("SET committed_generation_id");
      const invalidate = sql.indexOf("SET is_current = FALSE");
      const marker = sql.indexOf("INSERT INTO causal_graph_generations");
      assert.ok(guard >= 0 && guard < graphWrite, "lease guard must precede graph DML");
      assert.ok(
        graphWrite < assignment
          && assignment < receipt
          && receipt < invalidate
          && invalidate < marker,
        "offer, receipt, invalidation, and new current marker must share that exact order",
      );
      assert.match(sql, /"offer_state":"offered"/);
      assert.match(sql, /DO \$daobrew_offer_assignment\$/);
      assert.doesNotMatch(sql, /jsonb_build_object\('offer_state'/);
      assert.match(sql, /pg_advisory_xact_lock\(1144153669\)/);
      assert.match(
        sql,
        new RegExp(`pg_advisory_xact_lock\\(\\s*1144153670, hashtext\\('${generationUser}'\\)\\s*\\)`),
      );
      assert.match(sql, /lease_expires_at_ts > commit_ts/);
      assert.match(
        sql,
        new RegExp(`\\(user_id, generation_id, generated_at_ts, is_current\\)\\s+VALUES \\('${generationUser}', '11111111-1111-4111-8111-111111111111', commit_ts, TRUE\\)`),
      );
      assert.doesNotMatch(sql, /ON CONFLICT \(user_id\)/);
      assert.strictEqual(result.armed_offer?.offerState, "offered");
      assert.strictEqual(result.armed_offer?.armedAtTs, 1_234);
      assert.ok(!sql.includes("BEGIN;"), "scopedExec, not upsert, owns BEGIN");
      assert.ok(!sql.includes("COMMIT;"), "scopedExec, not upsert, owns COMMIT");
    });
  });

  it("advances skipped_done only through the same exact-lease generation transaction", async () => {
    await withPostgresFakeTransport(async () => {
      const doneUser = "87E66B43-3394-4919-A4D6-77CD6F5FA380";
      const delta = await fixtureDelta(doneUser);
      const writes: string[] = [];
      const result = await upsertGraphDelta(delta, {
        userId: doneUser,
        generationId: "33333333-3333-4333-8333-333333333333",
        leaseToken: "44444444-4444-4444-8444-444444444444",
        query: async (sql) => {
          if (sql.includes("props_json ->> 'status'")) return [{ status: "done" }];
          return [];
        },
        exec: async (sql) => { writes.push(sql); },
      });

      assert.strictEqual(result.status, "skipped_done");
      assert.strictEqual(writes.length, 1);
      assert.match(writes[0], /causal execution lease is not live/);
      assert.match(writes[0], /INSERT INTO causal_graph_generations/);
      assert.ok(!writes[0].includes("INSERT INTO graph_nodes"));
      assert.ok(!writes[0].includes("DELETE FROM graph_nodes"));
    });
  });

  it("rejects partial or sqlite generation capabilities before any write", async () => {
    await withPostgresFakeTransport(async () => {
      const partialUser = "CB3D5925-2FB8-4706-8C5B-0D6520A5A0F1";
      const delta = await fixtureDelta(partialUser);
      let writes = 0;
      await assert.rejects(
        () => upsertGraphDelta(delta, {
          userId: partialUser,
          generationId: "11111111-1111-4111-8111-111111111111",
          query: async () => [],
          exec: async () => { writes += 1; },
        }),
        /generationId and leaseToken must be supplied together/,
      );
      assert.strictEqual(writes, 0);
    });

    const savedStore = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    try {
      const sqliteUser = "95A6894E-93EB-4C88-9643-1EF3C3D34B69";
      const delta = await fixtureDelta(sqliteUser);
      await assert.rejects(
        () => upsertGraphDelta(delta, {
          userId: sqliteUser,
          generationId: "11111111-1111-4111-8111-111111111111",
          leaseToken: "22222222-2222-4222-8222-222222222222",
          query: async () => [],
          exec: async () => {},
        }),
        /require the Postgres graph store/,
      );
    } finally {
      if (savedStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = savedStore;
    }
  });

  it("routes all three internal reads through the injected query and the batch through the injected exec", async () => {
    await withPostgresFakeTransport(async (captured) => {
      const delta = await fixtureDelta();
      const reads: string[] = [];
      const writes: string[] = [];
      const result = await upsertGraphDelta(delta, {
        nowTs: 1234,
        query: async (sql) => {
          reads.push(sql);
          return [];
        },
        exec: async (sql) => {
          writes.push(sql);
        },
      });

      assert.strictEqual(result.status, "written");
      // Three internal reads: existingNodeIds (via validateGraphDelta),
      // existingRootStatus, existingGhostStates — all on the injected query.
      assert.strictEqual(reads.length, 3, `expected 3 injected reads, got: ${JSON.stringify(reads)}`);
      assert.ok(
        reads.some((sql) => sql.includes("SELECT id FROM graph_nodes")),
        "existingNodeIds must flow through the injected query",
      );
      assert.ok(
        reads.some((sql) => sql.includes("props_json ->> 'status'") && sql.includes("LIMIT 1")),
        "existingRootStatus must flow through the injected query",
      );
      assert.ok(
        reads.some((sql) => sql.includes("SELECT id, props_json")),
        "existingGhostStates must flow through the injected query",
      );
      // The big batch goes through the injected exec, once. In postgres mode
      // it carries NO transaction control of its own: production exec is
      // scopedExec, which wraps the delegated SQL in its own BEGIN/set_config/
      // COMMIT transaction — a nested BEGIN/COMMIT here would end that
      // transaction early and break the pooler-safe GUC scoping.
      assert.strictEqual(writes.length, 1);
      assert.ok(!writes[0].includes("BEGIN;"), "postgres batch must not open its own transaction");
      assert.ok(writes[0].includes("INSERT INTO graph_nodes"), "batch must carry the node upserts");
      assert.ok(!writes[0].includes("COMMIT;"), "postgres batch must not commit on its own");
      // Nothing may leak to the module-level defaults when executors are injected.
      assert.deepStrictEqual(captured.queries, [], "no read may bypass the injected query");
      assert.deepStrictEqual(captured.execs, [], "no write may bypass the injected exec");
    });
  });

  it("sqlite batch keeps its own BEGIN IMMEDIATE/COMMIT transaction", async () => {
    // SQLite has no scopedExec transaction wrapper, so the batch must supply
    // its own atomicity — this pins the branch the postgres pooler fix
    // deliberately left untouched.
    const savedStore = process.env.DAOBREW_GRAPH_STORE;
    const savedGraphDb = process.env.DAOBREW_GRAPH_DB;
    const tmpDir = mkdtempSync(join(tmpdir(), "daobrew-upsert-sqlite-batch-"));
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    process.env.DAOBREW_GRAPH_DB = join(tmpDir, "sentinel-graph.db");
    try {
      const delta = await fixtureDelta();
      const writes: string[] = [];
      const result = await upsertGraphDelta(delta, {
        nowTs: 1234,
        query: async () => [],
        exec: async (sql) => {
          writes.push(sql);
        },
      });
      assert.strictEqual(result.status, "written");
      assert.strictEqual(writes.length, 1);
      assert.ok(
        writes[0].trimStart().startsWith("BEGIN IMMEDIATE;"),
        `sqlite batch must open its own transaction, got: ${writes[0].slice(0, 80)}`,
      );
      assert.ok(writes[0].trimEnd().endsWith("COMMIT;"), "sqlite batch must commit on its own");
    } finally {
      if (savedStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = savedStore;
      if (savedGraphDb === undefined) delete process.env.DAOBREW_GRAPH_DB;
      else process.env.DAOBREW_GRAPH_DB = savedGraphDb;
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("internal reads filter user_id by the scope row under postgres, never by a literal (F1 One-Time-Filter regression)", async () => {
    // In postgres mode the injected query is scopedQuery(userId) (run.ts
    // graphScopedDeps / tools.ts toolScopedDb); a `user_id = '<literal>'` in
    // the body lets the planner fold the RLS qual into a One-Time Filter
    // evaluated at executor startup — before the lateral scope row has run
    // set_config — so a fresh pooled backend silently returns zero rows
    // (live bug F1: every node would look new). The exec-path batch keeps
    // its literals: scopedExec sets the GUC inside the same transaction.
    await withPostgresFakeTransport(async () => {
      const delta = await fixtureDelta();
      const reads: string[] = [];
      await upsertGraphDelta(delta, {
        nowTs: 1234,
        query: async (sql) => {
          reads.push(sql);
          return [];
        },
        exec: async () => {},
      });
      assert.strictEqual(reads.length, 3, `expected 3 injected reads, got: ${JSON.stringify(reads)}`);
      for (const sql of reads) {
        assert.ok(
          sql.includes("user_id = __daobrew_scope.uid"),
          `postgres internal read must filter user_id via the scope row, got: ${sql}`,
        );
        assert.ok(
          !sql.includes(`user_id = '${UPSERT_TEST_USER}'`),
          `postgres internal read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`,
        );
      }
    });
  });

  it("internal reads keep the escaped literal under sqlite (plain queryJson has no scope row)", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    const previousStore = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    try {
      await withTempGraphDb(async () => {
        const delta = await fixtureDelta();
        const reads: string[] = [];
        await validateGraphDelta(delta, {
          query: async (sql) => {
            reads.push(sql);
            return [];
          },
        });
        assert.strictEqual(reads.length, 1);
        assert.ok(
          reads[0].includes(`user_id = '${UPSERT_TEST_USER}'`),
          `sqlite internal read must keep the escaped literal, got: ${reads[0]}`,
        );
        assert.ok(
          !reads[0].includes("__daobrew_scope.uid"),
          `sqlite has no scope row — the reference would be an unknown-column error, got: ${reads[0]}`,
        );
      });
    } finally {
      if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = previousStore;
    }
  });

  it("validateGraphDelta routes its existingNodeIds read through the injected query", async () => {
    await withPostgresFakeTransport(async (captured) => {
      const delta = await fixtureDelta();
      const reads: string[] = [];
      await validateGraphDelta(delta, {
        query: async (sql) => {
          reads.push(sql);
          return [];
        },
      });

      assert.strictEqual(reads.length, 1);
      assert.ok(reads[0].includes("SELECT id FROM graph_nodes"));
      assert.deepStrictEqual(captured.queries, [], "no read may bypass the injected query");
    });
  });

  it("defaults to module execSql/queryJson with GUC-free SQL when no executors are injected", async () => {
    await withPostgresFakeTransport(async (captured) => {
      const delta = await fixtureDelta();
      const result = await upsertGraphDelta(delta, { nowTs: 1234 });

      assert.strictEqual(result.status, "written");
      assert.strictEqual(captured.queries.length, 3, "internal reads must fall back to queryJson");
      assert.strictEqual(captured.execs.length, 1, "the batch must fall back to execSql");
      for (const sql of [...captured.queries, ...captured.execs]) {
        assert.ok(
          !sql.includes("set_config"),
          `un-injected SQL must stay GUC-free (unchanged behavior), got: ${sql}`,
        );
      }
    });
  });
});

describe("generation lease commit live postgres", () => {
  it("co-commits rows+marker and rolls both back on crash or stale-token interleaving", async (t) => {
    const liveUrl = process.env.DAOBREW_LIVE_TEST_POSTGRES_URL;
    if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1" || !liveUrl) {
      return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 and DAOBREW_LIVE_TEST_POSTGRES_URL");
    }

    const previousStore = process.env.DAOBREW_GRAPH_STORE;
    const previousUrl = process.env.DAOBREW_POSTGRES_URL;
    const adminUrl = new URL(liveUrl);
    adminUrl.pathname = "/postgres";
    const scratchDb = `generation_commit_${process.pid}_${Date.now()}`;
    const scratchUrl = new URL(liveUrl);
    scratchUrl.pathname = `/${scratchDb}`;
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    process.env.DAOBREW_POSTGRES_URL = adminUrl.toString();

    await graphDb.execSql(`CREATE DATABASE ${scratchDb};`);
    try {
      process.env.DAOBREW_POSTGRES_URL = scratchUrl.toString();
      // Exercise the real Alembic-owned order. Migration 0010 owns the
      // SECURITY DEFINER functions; 0015 owns graph relations and triggers.
      const repoRoot = existsSync(resolve(process.cwd(), "alembic.ini"))
        ? process.cwd()
        : resolve(process.cwd(), "..");
      execFileSync(process.env.DAOBREW_PYTHON_BIN || "python3", [
        "-m",
        "alembic",
        "upgrade",
        "head",
      ], {
        cwd: repoRoot,
        env: { ...process.env, DATABASE_URL: scratchUrl.toString() },
        stdio: "pipe",
        timeout: 60_000,
      });
      const now = Math.floor(Date.now() / 1000);
      const successUser = "generation-success-user";
      const successGeneration = "11111111-1111-4111-8111-111111111111";
      const successLease = "22222222-2222-4222-8222-222222222222";
      await graphDb.execSql(`
        INSERT INTO users VALUES ('${successUser}', ${now}, ${now});
        INSERT INTO causal_execution_leases
          (user_id, lease_token, leased_at_ts, lease_expires_at_ts)
        VALUES ('${successUser}', '${successLease}', ${now}, ${now + 60});
      `);
      const successDelta = await fixtureDelta(successUser);
      await upsertGraphDelta(successDelta, {
        userId: successUser,
        generationId: successGeneration,
        leaseToken: successLease,
        armedOffer: { treatmentP: 1 },
        nowTs: now,
        exec: scopedExec(successUser),
        query: scopedQuery(successUser),
      });
      // One SELECT is one MVCC snapshot: the generation receipt, marker,
      // user-visible offer_state, and research assignment must all be visible
      // together or none may be visible.
      const committed = await graphDb.queryJson(`
        SELECT
          (SELECT count(*)::int FROM graph_nodes WHERE user_id = '${successUser}') AS nodes,
          (SELECT props_json ->> 'offer_state' FROM graph_nodes WHERE user_id = '${successUser}' AND id = '${successDelta.armed_root_cause.node_id}') AS offer_state,
          (SELECT generation_id FROM causal_graph_generations WHERE user_id = '${successUser}' AND is_current IS TRUE) AS generation_id,
          (SELECT committed_generation_id FROM causal_execution_leases WHERE user_id = '${successUser}') AS receipt,
          (SELECT assigned_action FROM intervention_assignments WHERE user_id = '${successUser}' LIMIT 1) AS assigned_action,
          (SELECT count(*)::int FROM intervention_assignments WHERE user_id = '${successUser}') AS assignments
      `);
      assert.ok(Number(committed[0].nodes) > 0);
      assert.strictEqual(committed[0].offer_state, "offered");
      assert.strictEqual(committed[0].generation_id, successGeneration);
      assert.strictEqual(committed[0].receipt, successGeneration);
      assert.strictEqual(committed[0].assigned_action, "task_package");
      assert.strictEqual(Number(committed[0].assignments), 1);

      // A failed graph mutation rolls back both its row change and the trigger's
      // marker invalidation, so the old exact snapshot remains current.
      await assert.rejects(
        () => scopedExec(successUser)(`
          UPDATE graph_nodes
             SET title = 'must-roll-back'
           WHERE user_id = '${successUser}'
             AND id = '${successDelta.armed_root_cause.node_id}';
          SELECT 1 / 0;
        `),
        /division by zero/,
      );
      const afterMutationRollback = await graphDb.queryJson(`
        SELECT
          (SELECT title FROM graph_nodes
            WHERE user_id = '${successUser}'
              AND id = '${successDelta.armed_root_cause.node_id}') AS title,
          (SELECT generation_id FROM causal_graph_generations
            WHERE user_id = '${successUser}' AND is_current IS TRUE) AS generation_id
      `);
      assert.notStrictEqual(afterMutationRollback[0].title, "must-roll-back");
      assert.strictEqual(afterMutationRollback[0].generation_id, successGeneration);

      // This is the graph half of detonate_done/standalone assignment: any
      // committed post-generation UPDATE makes expected_generation stale while
      // retaining the historical row required by the exact lease receipt FK.
      await scopedExec(successUser)(`
        UPDATE graph_nodes
           SET props_json = props_json || '{"status":"done"}'::jsonb
         WHERE user_id = '${successUser}'
           AND id = '${successDelta.armed_root_cause.node_id}';
      `);
      const afterDetonate = await graphDb.queryJson(`
        SELECT
          (SELECT generation_id FROM causal_graph_generations
            WHERE user_id = '${successUser}' AND is_current IS TRUE) AS current_generation,
          (SELECT count(*)::int FROM causal_graph_generations
            WHERE user_id = '${successUser}'
              AND generation_id = '${successGeneration}') AS historical_marker,
          (SELECT committed_generation_id FROM causal_execution_leases
            WHERE user_id = '${successUser}') AS receipt
      `);
      assert.deepStrictEqual(afterDetonate, [{
        current_generation: null,
        historical_marker: 1,
        receipt: successGeneration,
      }]);

      // History can advance without overwriting the marker still referenced by
      // the un-finalized lease.  The normal publisher performs this INSERT only
      // after acquiring the exact next lease; this direct insert isolates the
      // history/FK schema invariant.
      const laterGeneration = "99999999-9999-4999-8999-999999999999";
      await graphDb.execSql(`
        INSERT INTO causal_graph_generations
          (user_id, generation_id, generated_at_ts, is_current)
        VALUES ('${successUser}', '${laterGeneration}', ${now + 1}, TRUE);
      `);
      const retainedHistory = await graphDb.queryJson(`
        SELECT
          (SELECT count(*)::int FROM causal_graph_generations
            WHERE user_id = '${successUser}') AS generations,
          (SELECT generation_id FROM causal_graph_generations
            WHERE user_id = '${successUser}' AND is_current IS TRUE) AS current_generation,
          (SELECT committed_generation_id FROM causal_execution_leases
            WHERE user_id = '${successUser}') AS receipt
      `);
      assert.deepStrictEqual(retainedHistory, [{
        generations: 2,
        current_generation: laterGeneration,
        receipt: successGeneration,
      }]);

      // Start a real generation transaction, observe its per-user advisory
      // lock from a second connection, then launch a post-generation mutation
      // while the publisher is still sleeping before COMMIT.  The mutation
      // must serialize after that COMMIT and invalidate the just-published
      // marker; it can never leave the new generation looking current.
      const raceUser = "generation-race-user";
      const raceGeneration = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const raceLease = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      await graphDb.execSql(`
        INSERT INTO users VALUES ('${raceUser}', ${now}, ${now});
        INSERT INTO causal_execution_leases
          (user_id, lease_token, leased_at_ts, lease_expires_at_ts)
        VALUES ('${raceUser}', '${raceLease}', ${now}, ${now + 60});
      `);
      const raceDelta = await fixtureDelta(raceUser);
      // The target must pre-exist.  An UPDATE whose MVCC snapshot starts while
      // a brand-new generation row is still uncommitted legitimately affects
      // zero rows and is not a graph mutation.  A pre-existing ghost forces
      // the concurrent UPDATE to wait and then update the committed version.
      await graphDb.execSql(`
        INSERT INTO graph_nodes(
          id, user_id, kind, title, source, source_ref, props_json, created_at_ts
        ) VALUES (
          '${raceDelta.armed_root_cause.node_id}', '${raceUser}', 'ghost',
          'pre-existing race root', 'reasoner',
          'reasoner:${raceDelta.armed_root_cause.node_id}',
          '{"status":"watching"}'::jsonb, ${now - 1}
        );
      `);
      const slowGenerationExec = scopedExec(raceUser, async (scopedSql) => {
        const delayed = scopedSql.replace(
          /\nCOMMIT;\s*$/,
          "\nSELECT pg_sleep(3);\nCOMMIT;",
        );
        assert.notStrictEqual(delayed, scopedSql, "test must delay before transaction COMMIT");
        await graphDb.execSql(delayed);
      });
      const generationPromise = upsertGraphDelta(raceDelta, {
        userId: raceUser,
        generationId: raceGeneration,
        leaseToken: raceLease,
        armedOffer: { treatmentP: 1 },
        nowTs: now,
        exec: slowGenerationExec,
        query: scopedQuery(raceUser),
      });

      let generationLockSeen = false;
      const lockDeadline = Date.now() + 5_000;
      while (Date.now() < lockDeadline) {
        const locks = await graphDb.queryJson(`
          SELECT count(*)::int AS count
            FROM pg_locks
           WHERE locktype = 'advisory'
             AND granted IS TRUE
             AND classid = 1144153670::oid
             AND objsubid = 2
        `);
        if (Number(locks[0]?.count) > 0) {
          generationLockSeen = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(generationLockSeen, "generation publisher must hold the shared per-user lock");

      const mutationPromise = scopedExec(raceUser)(`
        UPDATE graph_nodes
           SET title = 'mutation-after-generation'
         WHERE user_id = '${raceUser}'
           AND id = '${raceDelta.armed_root_cause.node_id}';
      `);
      await Promise.all([generationPromise, mutationPromise]);
      const afterConcurrentMutation = await graphDb.queryJson(`
        SELECT
          (SELECT title FROM graph_nodes
            WHERE user_id = '${raceUser}'
              AND id = '${raceDelta.armed_root_cause.node_id}') AS title,
          (SELECT generation_id FROM causal_graph_generations
            WHERE user_id = '${raceUser}' AND is_current IS TRUE) AS current_generation,
          (SELECT count(*)::int FROM causal_graph_generations
            WHERE user_id = '${raceUser}'
              AND generation_id = '${raceGeneration}') AS historical_marker
      `);
      assert.deepStrictEqual(afterConcurrentMutation, [{
        title: "mutation-after-generation",
        current_generation: null,
        historical_marker: 1,
      }]);

      await graphDb.execSql("DELETE FROM intervention_assignments; DELETE FROM graph_edges; DELETE FROM graph_nodes; DELETE FROM causal_execution_leases; DELETE FROM causal_graph_generations; DELETE FROM users;");
      const crashUser = "generation-crash-user";
      const crashGeneration = "33333333-3333-4333-8333-333333333333";
      const crashLease = "44444444-4444-4444-8444-444444444444";
      await graphDb.execSql(`
        INSERT INTO users VALUES ('${crashUser}', ${now}, ${now});
        INSERT INTO causal_execution_leases
          (user_id, lease_token, leased_at_ts, lease_expires_at_ts)
        VALUES ('${crashUser}', '${crashLease}', ${now}, ${now + 60});
      `);
      const crashDelta = await fixtureDelta(crashUser);
      const crashExec = scopedExec(crashUser, async (scopedSql) => {
        const boundary = scopedSql.indexOf("DO $daobrew_generation_commit$");
        assert.ok(boundary > 0, "test injection must land after graph DML and before marker");
        await graphDb.execSql(
          `${scopedSql.slice(0, boundary)}SELECT 1 / 0;\n${scopedSql.slice(boundary)}`,
        );
      });
      await assert.rejects(
        () => upsertGraphDelta(crashDelta, {
          userId: crashUser,
          generationId: crashGeneration,
          leaseToken: crashLease,
          armedOffer: { treatmentP: 0 },
          nowTs: now,
          exec: crashExec,
          query: scopedQuery(crashUser),
        }),
        /division by zero/,
      );
      const rolledBack = await graphDb.queryJson(`
        SELECT
          (SELECT count(*)::int FROM graph_nodes WHERE user_id = '${crashUser}') AS nodes,
          (SELECT count(*)::int FROM causal_graph_generations WHERE user_id = '${crashUser}') AS generations,
          (SELECT committed_generation_id FROM causal_execution_leases WHERE user_id = '${crashUser}') AS receipt,
          (SELECT count(*)::int FROM intervention_assignments WHERE user_id = '${crashUser}') AS assignments
      `);
      assert.deepStrictEqual(rolledBack, [{ nodes: 0, generations: 0, receipt: null, assignments: 0 }]);

      await graphDb.execSql("DELETE FROM intervention_assignments; DELETE FROM graph_edges; DELETE FROM graph_nodes; DELETE FROM causal_execution_leases; DELETE FROM causal_graph_generations; DELETE FROM users;");
      const staleUser = "generation-stale-user";
      const staleGeneration = "55555555-5555-4555-8555-555555555555";
      const oldLease = "66666666-6666-4666-8666-666666666666";
      const replacementLease = "77777777-7777-4777-8777-777777777777";
      await graphDb.execSql(`
        INSERT INTO users VALUES ('${staleUser}', ${now}, ${now});
        INSERT INTO causal_execution_leases
          (user_id, lease_token, leased_at_ts, lease_expires_at_ts)
        VALUES ('${staleUser}', '${oldLease}', ${now - 60}, ${now - 1});
      `);
      const staleDelta = await fixtureDelta(staleUser);
      await assert.rejects(
        () => upsertGraphDelta(staleDelta, {
          userId: staleUser,
          generationId: staleGeneration,
          leaseToken: oldLease,
          exec: scopedExec(staleUser),
          query: scopedQuery(staleUser),
        }),
        /causal execution lease is not live/,
      );
      await graphDb.execSql(`
        DELETE FROM causal_execution_leases WHERE user_id = '${staleUser}';
        INSERT INTO causal_execution_leases
          (user_id, lease_token, leased_at_ts, lease_expires_at_ts)
        VALUES ('${staleUser}', '${replacementLease}', ${now}, ${now + 60});
      `);
      await assert.rejects(
        () => upsertGraphDelta(staleDelta, {
          userId: staleUser,
          generationId: staleGeneration,
          leaseToken: oldLease,
          exec: scopedExec(staleUser),
          query: scopedQuery(staleUser),
        }),
        /causal execution lease is not live/,
      );
      const stale = await graphDb.queryJson(`
        SELECT
          (SELECT count(*)::int FROM graph_nodes WHERE user_id = '${staleUser}') AS nodes,
          (SELECT count(*)::int FROM causal_graph_generations WHERE user_id = '${staleUser}') AS generations,
          (SELECT lease_token FROM causal_execution_leases WHERE user_id = '${staleUser}') AS live_lease
      `);
      assert.deepStrictEqual(stale, [{ nodes: 0, generations: 0, live_lease: replacementLease }]);
    } finally {
      process.env.DAOBREW_POSTGRES_URL = adminUrl.toString();
      try {
        await graphDb.execSql(`DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE);`);
      } finally {
        if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
        else process.env.DAOBREW_GRAPH_STORE = previousStore;
        if (previousUrl === undefined) delete process.env.DAOBREW_POSTGRES_URL;
        else process.env.DAOBREW_POSTGRES_URL = previousUrl;
      }
    }
  });
});

describe("engine run wiring (postgres graph upsert)", () => {
  it("runEngineOnce writes the noSignal watching delta through scoped executors", async () => {
    await withPostgresFakeTransport(async (captured) => {
      const result = await runEngineOnce({ once: true, userId: WIRING_USER });
      assert.strictEqual(result.status, "no_signal");
      assert.strictEqual(result.graph_store, "postgres");

      // The transactional batch (upsertGraphDelta's single exec) must be scoped.
      const batches = captured.execs.filter((sql) => sql.includes("INSERT INTO graph_nodes"));
      assertScopedExecsForWiringUser(batches, "noSignal upsert batch");

      // upsert's internal graph_nodes reads (existingNodeIds via
      // validateGraphDelta, existingRootStatus) must be scoped too.
      const graphReads = captured.queries.filter((sql) => sql.includes("FROM graph_nodes"));
      assert.ok(graphReads.length >= 2, "upsert must read graph_nodes through the transport");
      assertScopedQueriesForWiringUser(graphReads, "noSignal upsert graph_nodes reads");
    });
  });

  it("runEngineOnce writes the armed delta through scoped executors", async () => {
    await withPostgresFakeTransport(async (captured) => {
      const result = await runEngineOnce({ once: true, demo: true, userId: WIRING_USER });
      assert.strictEqual(result.status, "written");
      assert.strictEqual(result.graph_store, "postgres");

      const batches = captured.execs.filter((sql) => sql.includes("INSERT INTO graph_nodes"));
      assertScopedExecsForWiringUser(batches, "armed upsert batch");

      const graphReads = captured.queries.filter((sql) => sql.includes("FROM graph_nodes"));
      assert.ok(graphReads.length >= 2, "upsert must read graph_nodes through the transport");
      assertScopedQueriesForWiringUser(graphReads, "armed upsert graph_nodes reads");
    });
  });
});
