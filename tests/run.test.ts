import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleToolCall } from "../src/tools.js";
import { runEngineOnce } from "../src/engine/run.js";
import { ensureSchema } from "../src/engine/schema.js";
import { execSql, queryJson, q } from "../src/graph-db.js";
import { threadId, verificationId } from "../src/engine/memory/keys.js";
import { recordCoverageObservations, recordHeldTriggerObservation, recordSkippedDoneObservation } from "../src/engine/memory/verify.js";
import { rootCauseId } from "../src/engine/reasoner/Reasoner.js";
import { buildV2Context, localDayKey } from "../src/engine/reasoner/v2Context.js";
import { RawSample } from "../src/engine/signals/patterns.js";
import type { BiometricsClient } from "../src/engine/signals/biometrics.js";

const SOURCE_FIXTURE_SCRIPT = join(__dirname, "..", "..", "scripts", "seed-local-source-fixture.mjs");
const LOCAL_E2E_SCRIPT = join(__dirname, "..", "..", "scripts", "run-local-e2e-lite.mjs");
const ENGINE_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const DEMO_A_USER = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const DEMO_B_USER = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
const TEST_DEVICE_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";

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

function postgresRuntimePresent(): boolean {
  try {
    execFileSync("docker", [
      "compose",
      "-p",
      process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai",
      "-f",
      process.env.DAOBREW_POSTGRES_COMPOSE_FILE || "../docker-compose.postgres.yml",
      "exec",
      "-T",
      process.env.DAOBREW_POSTGRES_SERVICE || "postgres",
      "psql",
      "-At",
      "-U",
      process.env.DAOBREW_POSTGRES_USER || "daobrew",
      "-d",
      process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth",
      "-c",
      "SELECT 1;",
    ], { cwd: process.cwd(), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function withTempGraphDb(run: (dbPath: string) => Promise<void>): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "daobrew-run-"));
  const dbPath = join(tmpDir, "sentinel-graph.db");
  const previous = process.env.DAOBREW_GRAPH_DB;
  const previousStore = process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_GRAPH_STORE = "sqlite";
  process.env.DAOBREW_GRAPH_DB = dbPath;
  try {
    ensureSchema(dbPath);
    await run(dbPath);
  } finally {
    if (previous === undefined) delete process.env.DAOBREW_GRAPH_DB;
    else process.env.DAOBREW_GRAPH_DB = previous;
    if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = previousStore;
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Minimal fake biometric client serving the same shapes as the backend
 *  endpoints the engine reads, without opening a localhost listener. */
function fakeBiometricsClient(config: {
  samplesByMetric: Record<string, { value: number; timestamp: string }[]>;
  states: Array<{
    bucket_ts: number;
    yin_score: number;
    yang_score: number;
    category: string;
    source_quality: string;
    updated_at_ts: number;
  }>;
}): BiometricsClient {
  return {
    async getHealthkitHistory(metric: string, range: string) {
      const samples = config.samplesByMetric[metric] ?? [];
      const values = samples.map((s) => s.value);
      return {
        metric,
        range,
        samples,
        aggregated: values.length
          ? { avg: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) }
          : { avg: 0, min: 0, max: 0 },
      };
    },
    async getStateHistory(limit = 24) {
      return {
        states: config.states,
        total_count: config.states.length,
        limit,
      };
    },
  };
}

async function startFakeBiometricsBackend(config: Parameters<typeof fakeBiometricsClient>[0]): Promise<{
  url: string;
  client: BiometricsClient;
  close: () => Promise<void>;
}> {
  return {
    url: "mock://in-process-biometric-client",
    client: fakeBiometricsClient(config),
    close: async () => {},
  };
}

describe("engine CLI runner", () => {
  it("uses a process-local canonical scope for implicit demo identity", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async () => {
      const first = await runEngineOnce({ once: true, dryRun: true, demo: true });
      const second = await runEngineOnce({ once: true, dryRun: true, demo: true });

      assert.match(first.user_id, /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
      assert.strictEqual(second.user_id, first.user_id);
      assert.notStrictEqual(first.user_id, "14802294-BEED-480E-ABF6-7E3703FA25CD");
    });
  });

  it("implicit demo identity is stable across separate processes", () => {
    const read = () => JSON.parse(execFileSync(process.execPath, [
      "dist/src/engine/run.js",
      "--once",
      "--dry-run",
      "--demo",
    ], { cwd: process.cwd(), env: process.env, encoding: "utf-8" })).user_id;

    const first = read();
    const second = read();

    assert.match(first, /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
    assert.strictEqual(second, first);
    assert.notStrictEqual(first, "14802294-BEED-480E-ABF6-7E3703FA25CD");
  });

  it("dry-run demo builds a delta summary without writing graph nodes", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const result = await runEngineOnce({ once: true, dryRun: true, demo: true });
      assert.strictEqual(result.status, "dry_run");
      assert.ok(result.node_count > 0);
      assert.strictEqual(result.root_armed, false);

      const graphNodes = sqlite(dbPath, "SELECT count(*) FROM graph_nodes;").trim();
      assert.strictEqual(graphNodes, "0");
    });
  });

  it("demo non-dry run arms exactly one root and remains idempotent", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const first = await runEngineOnce({ once: true, demo: true });
      const counts = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      const second = await runEngineOnce({ once: true, demo: true });
      const countsAfter = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      const armed = sqlite(
        dbPath,
        "SELECT count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed';",
      ).trim();

      assert.strictEqual(first.status, "written");
      assert.strictEqual(second.status, "written");
      assert.strictEqual(countsAfter, counts);
      assert.strictEqual(armed, "1");
    });
  });

  it("non-dry no-signal run writes WATCHING state and clears stale armed root", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const previousConfig = process.env.DAOBREW_CONFIG_FILE;
      const previousDeviceCredential = process.env.DAOBREW_DEVICE_CREDENTIAL;
      process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
      delete process.env.DAOBREW_DEVICE_CREDENTIAL;
      try {
        const armedRun = await runEngineOnce({ once: true, demo: true });
        assert.strictEqual(armedRun.status, "written");
        assert.strictEqual(sqlite(
          dbPath,
          "SELECT count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed';",
        ).trim(), "1");

        const watchingRun = await runEngineOnce({ once: true, userId: armedRun.user_id });
        const rootStatus = sqlite(
          dbPath,
          `SELECT json_extract(props_json,'$.status') || '|' || title || '|' || COALESCE(json_extract(props_json,'$.evidence_grade'),'') FROM graph_nodes WHERE id='${armedRun.armed_node_id}';`,
        ).trim();
        const armed = sqlite(
          dbPath,
          "SELECT count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed';",
        ).trim();

        assert.strictEqual(watchingRun.status, "no_signal");
        assert.strictEqual(watchingRun.root_armed, false);
        assert.ok(watchingRun.node_count > 0);
        assert.strictEqual(armed, "0");
        assert.strictEqual(rootStatus, "watching|WATCHING|insufficient_evidence");
      } finally {
        if (previousConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
        else process.env.DAOBREW_CONFIG_FILE = previousConfig;
        if (previousDeviceCredential === undefined) delete process.env.DAOBREW_DEVICE_CREDENTIAL;
        else process.env.DAOBREW_DEVICE_CREDENTIAL = previousDeviceCredential;
      }
    });
  });

  it("non-local WATCHING advances to armed on one neutral persistent root", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const previousConfig = process.env.DAOBREW_CONFIG_FILE;
      const previousDeviceCredential = process.env.DAOBREW_DEVICE_CREDENTIAL;
      process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
      delete process.env.DAOBREW_DEVICE_CREDENTIAL;
      try {
        const userId = "80E6AB78-775F-499E-9C8B-BD076E54A5B0";
        const rootId = rootCauseId(userId);
        const watchingRun = await runEngineOnce({ once: true, userId });
        const watchingIdentity = sqlite(
          dbPath,
          `SELECT id || '|' || source_ref FROM graph_nodes WHERE user_id='${userId}' AND id='${rootId}';`,
        ).trim();

        const armedRun = await runEngineOnce({ once: true, demo: true, userId });
        const armedIdentity = sqlite(
          dbPath,
          `SELECT id || '|' || source_ref FROM graph_nodes WHERE user_id='${userId}' AND id='${rootId}';`,
        ).trim();
        const persistentRootCount = sqlite(
          dbPath,
          `SELECT count(*) FROM graph_nodes WHERE user_id='${userId}' AND id='${rootId}';`,
        ).trim();
        const rootStatus = sqlite(
          dbPath,
          `SELECT json_extract(props_json,'$.status') FROM graph_nodes WHERE user_id='${userId}' AND id='${rootId}';`,
        ).trim();

        assert.strictEqual(watchingRun.status, "no_signal");
        assert.strictEqual(watchingRun.armed_node_id, rootId);
        assert.strictEqual(armedRun.status, "written");
        assert.strictEqual(armedRun.armed_node_id, rootId);
        assert.strictEqual(armedIdentity, watchingIdentity);
        assert.strictEqual(persistentRootCount, "1");
        assert.strictEqual(rootStatus, "armed");
        assert.doesNotMatch(armedIdentity, /ai2|demo|story/i);
      } finally {
        if (previousConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
        else process.env.DAOBREW_CONFIG_FILE = previousConfig;
        if (previousDeviceCredential === undefined) delete process.env.DAOBREW_DEVICE_CREDENTIAL;
        else process.env.DAOBREW_DEVICE_CREDENTIAL = previousDeviceCredential;
      }
    });
  });

  it("replay startTs bounds memory signals but keeps undated rows", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const previousConfig = process.env.DAOBREW_CONFIG_FILE;
      const previousDeviceCredential = process.env.DAOBREW_DEVICE_CREDENTIAL;
      process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
      delete process.env.DAOBREW_DEVICE_CREDENTIAL;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const startTs = nowSec - 30 * 86400;
        sqlite(dbPath, `
          INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
          VALUES ('mem-old', '${ENGINE_TEST_USER}', 'claude_project_session', 's1', 'Ancient session.', '[]', 0.8, 1.0, ${nowSec - 60 * 86400}, NULL, ${nowSec - 60 * 86400});
          INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
          VALUES ('mem-undated', '${ENGINE_TEST_USER}', 'claude_project_session', 's2', 'Undated fresh session.', '[]', 0.8, 1.0, NULL, NULL, ${nowSec - 86400});
        `);

        // Replay run: startTs must reach the memory reader — only the
        // undated row (created_at_ts in window) survives.
        const bounded = await runEngineOnce({ once: true, dryRun: true, userId: ENGINE_TEST_USER, startTs, endTs: nowSec });
        assert.strictEqual(bounded.signal_counts.memory, 1);

        // Live run (no startTs): both rows visible, unchanged behavior.
        const unbounded = await runEngineOnce({ once: true, dryRun: true, userId: ENGINE_TEST_USER });
        assert.strictEqual(unbounded.signal_counts.memory, 2);
      } finally {
        if (previousConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
        else process.env.DAOBREW_CONFIG_FILE = previousConfig;
        if (previousDeviceCredential === undefined) delete process.env.DAOBREW_DEVICE_CREDENTIAL;
        else process.env.DAOBREW_DEVICE_CREDENTIAL = previousDeviceCredential;
      }
    });
  });

  it("direct runEngineOnce resolves identity from the configured user_id", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const previousConfig = process.env.DAOBREW_CONFIG_FILE;
      const previousApiKey = process.env.DAOBREW_API_KEY;
      const configFile = `${dbPath}.config.json`;
      writeFileSync(configFile, JSON.stringify({ user_id: ENGINE_TEST_USER }));
      process.env.DAOBREW_CONFIG_FILE = configFile;
      delete process.env.DAOBREW_API_KEY;
      try {
        const result = await runEngineOnce({ once: true, dryRun: true });
        assert.strictEqual(result.user_id, ENGINE_TEST_USER);
        assert.strictEqual(result.demo, false);
      } finally {
        if (previousConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
        else process.env.DAOBREW_CONFIG_FILE = previousConfig;
        if (previousApiKey === undefined) delete process.env.DAOBREW_API_KEY;
        else process.env.DAOBREW_API_KEY = previousApiKey;
      }
    });
  });

  it("hardens source fixture through CLI run, idempotency, and Detonator read", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const env = {
        ...process.env,
        DAOBREW_GRAPH_DB: dbPath,
        DAOBREW_CONFIG_FILE: join(dbPath, "missing-config.json"),
        DAOBREW_FIXTURE_USER_ID: ENGINE_TEST_USER,
        DAOBREW_USER_ID: ENGINE_TEST_USER,
      };

      const fixtureOut = execFileSync(process.execPath, [SOURCE_FIXTURE_SCRIPT], {
        cwd: process.cwd(),
        env,
        encoding: "utf-8",
      });
      assert.match(fixtureOut, /source_rows: events=2, meeting_notes=2, user_insights=2/);
      const sourceCounts = sqlite(
        dbPath,
        `SELECT (SELECT count(*) FROM events WHERE user_id='${ENGINE_TEST_USER}') || '|' || (SELECT count(*) FROM meeting_notes WHERE user_id='${ENGINE_TEST_USER}') || '|' || (SELECT count(*) FROM user_insights WHERE user_id='${ENGINE_TEST_USER}');`,
      ).trim();
      assert.strictEqual(sourceCounts, "2|2|2");

      const dryRunOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--once",
        "--dry-run",
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const dryRun = JSON.parse(dryRunOut);
      assert.strictEqual(dryRun.status, "no_signal");
      assert.strictEqual(sqlite(dbPath, "SELECT count(*) FROM graph_nodes;").trim(), "0");

      const firstOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--once",
        "--demo",
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const first = JSON.parse(firstOut);
      const counts = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();

      const secondOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--once",
        "--demo",
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const second = JSON.parse(secondOut);
      const countsAfter = sqlite(
        dbPath,
        "SELECT (SELECT count(*) FROM graph_nodes) || '|' || (SELECT count(*) FROM graph_edges);",
      ).trim();
      const armed = sqlite(
        dbPath,
        `SELECT count(*) FROM graph_nodes WHERE id='${first.armed_node_id}' AND kind='ghost' AND json_extract(props_json,'$.status')='armed';`,
      ).trim();

      assert.strictEqual(first.status, "written");
      assert.strictEqual(second.status, "written");
      assert.strictEqual(countsAfter, counts);
      assert.strictEqual(armed, "1");

      const detonator = await handleToolCall("daobrew_detonate", {}, true);
      const text = detonator.content[0].text as string;
      assert.ok(text.includes(`cause_id: ${first.armed_node_id}`));
      assert.match(text, /SENTINEL ACTION PACKAGE/);
      assert.match(text, /LIKELY WORK THREAD/);
      assert.match(text, /EVIDENCE/);
      assert.match(text, /CONTEXT/);
      assert.match(text, /REVIEW TASK/);
      assert.match(text, /daobrew_schedule_block/);
      assert.ok(detonator.__local_data__, "Detonator should read engine-written local DB data");
    });
  });

  it("source fixture seeding rejects non-UUID user ids before writing", () => {
    let err: (Error & { stderr?: Buffer | string }) | null = null;
    try {
      execFileSync(process.execPath, [
        SOURCE_FIXTURE_SCRIPT,
        "--user-id=config-user",
      ], {
        cwd: process.cwd(),
        env: { ...process.env, DAOBREW_GRAPH_DB: join(tmpdir(), "daobrew-unused-fixture.db") },
        encoding: "utf-8",
      });
    } catch (caught: any) {
      err = caught;
    }
    assert.ok(err, "expected seed-local-source-fixture to reject a label user id");
    assert.match(String(err.stderr ?? err.message), /canonical UUID/);
  });

  it("local E2E lite harness closes a temp fake-backend loop without demo mode", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    let result: any;
    try {
      const out = execFileSync(process.execPath, [
        LOCAL_E2E_SCRIPT,
        "--temp-db",
        "--fake-backend",
        "--user-id",
        ENGINE_TEST_USER,
        "--close-loop",
      ], { cwd: process.cwd(), env: { ...process.env }, encoding: "utf-8" });
      result = JSON.parse(out);

      assert.strictEqual(result.status, "closed");
      assert.strictEqual(result.backend.mode, "fake");
      assert.strictEqual(result.user_id, ENGINE_TEST_USER);
      assert.deepStrictEqual(result.source_rows, { events: 2, meeting_notes: 2, user_insights: 2 });
      assert.strictEqual(result.engine.status, "written");
      assert.strictEqual(result.engine.demo, false);
      assert.strictEqual(result.engine.armed_node_id, rootCauseId(ENGINE_TEST_USER));
      assert.strictEqual(result.detonator.cause_id, result.engine.armed_node_id);
      assert.strictEqual(result.detonator.local_data, true);
      assert.strictEqual(result.graph.root_status, "done");
    } finally {
      if (result?.db?.temp_dir) rmSync(result.db.temp_dir, { recursive: true, force: true });
    }
  });

  it("local E2E lite harness closes a fake-backend loop in Postgres", async (t) => {
    if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1") {
      return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 to exercise Docker Postgres");
    }
    if (!postgresRuntimePresent()) return t.skip("Docker Postgres runtime is not available");

    const userId = `session2-postgres-${process.pid}`;
    const out = execFileSync(process.execPath, [
      LOCAL_E2E_SCRIPT,
      "--postgres-db",
      "--fake-backend",
      "--user-id",
      userId,
      "--close-loop",
    ], {
      cwd: process.cwd(),
      env: { ...process.env, DAOBREW_GRAPH_STORE: "postgres" },
      encoding: "utf-8",
    });
    const result = JSON.parse(out);

    assert.strictEqual(result.status, "closed");
    assert.strictEqual(result.db.mode, "postgres");
    assert.strictEqual(result.backend.mode, "fake");
    assert.strictEqual(result.user_id, userId);
    assert.deepStrictEqual(result.source_rows, { events: 2, meeting_notes: 2, user_insights: 2 });
    assert.strictEqual(result.engine.status, "written");
    assert.strictEqual(result.engine.demo, false);
    assert.match(result.engine.armed_node_id, /^ghost_root_[0-9a-f]{12}$/);
    assert.doesNotMatch(result.engine.armed_node_id, /ai2|demo|story/i);
    assert.strictEqual(result.detonator.cause_id, result.engine.armed_node_id);
    assert.strictEqual(result.detonator.local_data, true);
    assert.ok(result.graph.nodes > 0);
    assert.ok(result.graph.edges > 0);
    assert.strictEqual(result.graph.root_status, "done");
  });

  it("postgres run attaches Layer 2 causal memory as root-node context only", async (t) => {
    if (process.env.DAOBREW_ENABLE_POSTGRES_TESTS !== "1") {
      return t.skip("set DAOBREW_ENABLE_POSTGRES_TESTS=1 to exercise Docker Postgres");
    }
    if (!postgresRuntimePresent()) return t.skip("Docker Postgres runtime is not available");

    const userWithMemory = `layer2-memctx-${process.pid}`;
    const userWithoutMemory = `layer2-nomem-${process.pid}`;
    const nowTs = Math.floor(Date.now() / 1000);

    async function purgeUser(userId: string): Promise<void> {
      await execSql(
        `DELETE FROM intervention_assignments WHERE user_id = ${q(userId)};
         DELETE FROM thread_verifications WHERE user_id = ${q(userId)};
         DELETE FROM causal_thread_evidence WHERE user_id = ${q(userId)};
         DELETE FROM causal_memory_threads WHERE user_id = ${q(userId)};
         DELETE FROM user_model_snapshots WHERE user_id = ${q(userId)};
         DELETE FROM graph_edges WHERE user_id = ${q(userId)};
         DELETE FROM graph_nodes WHERE user_id = ${q(userId)};
         DELETE FROM events WHERE user_id = ${q(userId)};
         DELETE FROM meeting_notes WHERE user_id = ${q(userId)};
         DELETE FROM user_insights WHERE user_id = ${q(userId)};`,
      );
    }

    // Fake backend mirrors run-local-e2e-lite.mjs: one pushing_it state at
    // bucket_ts 1040 so the seeded fixture corpus joins and the root arms.
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let data: unknown;
      if (url.pathname === "/api/v1/device/health/history") {
        const metric = url.searchParams.get("metric") ?? "heart_rate";
        const values: Record<string, number> = {
          heart_rate: 94,
          heart_rate_variability: 28,
          resting_heart_rate: 72,
          respiratory_rate: 18,
          step_count: 40,
          active_energy_burned: 12,
        };
        const value = values[metric] ?? 1;
        data = {
          metric,
          range: url.searchParams.get("range") ?? "week",
          samples: [{ value, timestamp: new Date(1040 * 1000).toISOString() }],
          aggregated: { avg: value, min: value, max: value },
        };
      } else if (url.pathname === "/api/v1/state/history") {
        data = {
          states: [{
            bucket_ts: 1040,
            yin_score: 34,
            yang_score: 86,
            category: "pushing_it",
            source_quality: "fake_backend_layer2",
            updated_at_ts: 1050,
          }],
          total_count: 1,
          limit: Number(url.searchParams.get("limit") ?? 24),
        };
      } else {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: false, error: { message: `Unhandled path: ${url.pathname}` } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string", "fake backend bound a TCP port");

    const previousEnv = {
      DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
      DAOBREW_GRAPH_DB: process.env.DAOBREW_GRAPH_DB,
      DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
      DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
      DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      DAOBREW_MRT_TREATMENT_P: process.env.DAOBREW_MRT_TREATMENT_P,
    };
    try {
      process.env.DAOBREW_GRAPH_STORE = "postgres";
      delete process.env.DAOBREW_GRAPH_DB;
      process.env.DAOBREW_CONFIG_FILE = join(tmpdir(), "daobrew-missing-config.json");
      process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
      process.env.DAOBREW_API_URL = `http://127.0.0.1:${address.port}/api/v1`;
      // Pin the MRT draw to treatment so the detonate_done/skipped_done flow
      // below stays deterministic regardless of the per-pid user id hash.
      process.env.DAOBREW_MRT_TREATMENT_P = "1";

      ensureSchema();
      await purgeUser(userWithMemory);
      await purgeUser(userWithoutMemory);
      for (const userId of [userWithMemory, userWithoutMemory]) {
        execFileSync(process.execPath, [SOURCE_FIXTURE_SCRIPT], {
          cwd: process.cwd(),
          env: { ...process.env, DAOBREW_FIXTURE_USER_ID: userId },
          encoding: "utf-8",
        });
      }

      // Six active threads: the strongest is an attribution_candidate with
      // EXTERNAL (events) evidence, so the reader's claim gate keeps its
      // candidate_ranking influence. The other five are memory-only
      // correlations. Six seeded > the 5-thread context cap.
      const threadInserts: string[] = [];
      const evidenceInserts: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const threadId = `thr-memctx-${i}`;
        const claim = i === 0 ? "attribution_candidate" : "correlation";
        threadInserts.push(
          `INSERT INTO causal_memory_threads(id, user_id, thread_key, key_version, graph_root_id, title, summary, claim_level, status, pattern_keys_json, recurrence_count, first_seen_ts, last_seen_ts, last_reinforced_ts, strength, decay_state, created_at_ts, updated_at_ts)
           VALUES (${q(threadId)}, ${q(userWithMemory)}, ${q(`overdrive|demo-thread-${i}`)}, 1, NULL, ${q(`Demo thread ${i}`)}, ${q(`Summary for thread ${i}`)}, ${q(claim)}, 'active', '["overdrive"]'::jsonb, ${3 + i}, ${nowTs - 86400 * 30}, ${nowTs - 3600 * (i + 1)}, ${nowTs - 3600 * (i + 1)}, ${(9 - i) / 10}, 'active', ${nowTs - 86400 * 30}, ${nowTs});`,
        );
        evidenceInserts.push(
          `INSERT INTO causal_thread_evidence(id, thread_id, user_id, evidence_kind, source_table, source_id, source_ref, graph_node_id, graph_edge_id, claim_level, pattern_key, evidence_role, observed_at_ts, weight, metadata_json, created_at_ts)
           VALUES (${q(`ev-memctx-${i}`)}, ${q(threadId)}, ${q(userWithMemory)}, 'source_row', ${i === 0 ? "'events'" : "'user_insights'"}, ${q(`src-${i}`)}, ${q(`ref-${i}`)}, NULL, NULL, ${q(claim)}, 'overdrive', 'support', ${nowTs - 3600 * (i + 1)}, 1.0, '{}'::jsonb, ${nowTs});`,
        );
      }
      await execSql(threadInserts.join("\n"));
      await execSql(evidenceInserts.join("\n"));
      await execSql(
        `INSERT INTO user_model_snapshots(id, user_id, version, snapshot_text, source_thread_ids_json, claim_ceiling, generated_from_count, created_at_ts)
         VALUES ('snap-memctx-1', ${q(userWithMemory)}, 1, 'Snapshot text for layer2 hookup test.', '["thr-memctx-0"]'::jsonb, 'attribution_candidate', 6, ${nowTs});`,
      );
      // V6/V7: settled verdicts for the strongest thread — 2 confirmations,
      // 1 contradiction, and 1 insufficient_observation (counts as neither
      // but is still the latest verdict for last_verdict_at_ts).
      await execSql(
        `INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, kind, verdict, observed_at_ts, created_at_ts)
         VALUES
           ('tv-memctx-1', ${q(userWithMemory)}, 'thr-memctx-0', 'overdrive|demo-thread-0', 'verdict', 'no_recurrence_observed', ${nowTs - 86400 * 20}, ${nowTs}),
           ('tv-memctx-2', ${q(userWithMemory)}, 'thr-memctx-0', 'overdrive|demo-thread-0', 'verdict', 'no_recurrence_observed', ${nowTs - 86400 * 10}, ${nowTs}),
           ('tv-memctx-3', ${q(userWithMemory)}, 'thr-memctx-0', 'overdrive|demo-thread-0', 'verdict', 'pattern_recurred', ${nowTs - 86400 * 15}, ${nowTs}),
           ('tv-memctx-4', ${q(userWithMemory)}, 'thr-memctx-0', 'overdrive|demo-thread-0', 'verdict', 'insufficient_observation', ${nowTs - 86400 * 5}, ${nowTs});`,
      );

      async function armedRootProps(userId: string): Promise<Record<string, any>> {
        const rows = await queryJson<{ props_json: unknown }>(
          `SELECT props_json FROM graph_nodes WHERE user_id = ${q(userId)} AND kind = 'ghost' AND props_json ->> 'status' = 'armed'`,
        );
        assert.strictEqual(rows.length, 1, `expected exactly one armed root for ${userId}`);
        const raw = rows[0].props_json;
        return typeof raw === "string" ? JSON.parse(raw) : (raw as Record<string, any>);
      }

      const first = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.strictEqual(first.status, "written");
      assert.strictEqual(first.root_armed, true);
      assert.strictEqual(first.graph_store, "postgres");
      assert.ok(
        !first.warnings.some((w) => w.includes("layer 2 memory read failed")),
        `unexpected layer-2 warning: ${JSON.stringify(first.warnings)}`,
      );

      const props = await armedRootProps(userWithMemory);
      const memoryContext = props.memory_context;
      assert.ok(memoryContext, "armed root props_json.memory_context should exist when threads are seeded");
      assert.ok(Array.isArray(memoryContext.threads), "memory_context.threads is an array");
      assert.ok(memoryContext.threads.length <= 5, `memory_context caps at 5 threads, got ${memoryContext.threads.length}`);
      assert.strictEqual(memoryContext.threads.length, 5, "6 seeded active threads should surface exactly the 5-thread cap");
      assert.strictEqual(memoryContext.threads[0].claim_level, "attribution_candidate");
      assert.strictEqual(memoryContext.threads[0].thread_key, "overdrive|demo-thread-0");
      assert.strictEqual(memoryContext.threads[0].influence, "candidate_ranking");
      // Memory-only demotion: correlation threads backed solely by
      // user_insights stay background context.
      assert.strictEqual(memoryContext.threads[1].influence, "background_context");
      assert.strictEqual(memoryContext.snapshot_id, "snap-memctx-1");
      // V7: seeded verdicts surface as per-thread verification counts;
      // insufficient_observation counts as neither side but IS the latest
      // verdict. Threads without verdicts carry explicit zeros.
      assert.deepStrictEqual(memoryContext.threads[0].verification, {
        confirmations: 2,
        contradictions: 1,
        last_verdict_at_ts: nowTs - 86400 * 5,
      });
      assert.deepStrictEqual(memoryContext.threads[1].verification, {
        confirmations: 0,
        contradictions: 0,
        last_verdict_at_ts: null,
      });
      // Snapshot minted at nowTs → fresh (<7d).
      assert.strictEqual(memoryContext.snapshot_fresh, true);

      // MRT randomization v1: the arming moment drew the offer arm (p pinned
      // to 1 → treatment), stamped offer_state, and logged the assignment
      // under the randomized policy.
      assert.strictEqual(props.offer_state, "offered", "arming must stamp offer_state on the root");
      const assignmentRows = await queryJson<Record<string, any>>(
        `SELECT assigned_action, route_policy, assignment_probability, eligible_actions_json
           FROM intervention_assignments WHERE user_id = ${q(userWithMemory)} AND ghost_id = ${q(first.armed_node_id!)}`,
      );
      assert.strictEqual(assignmentRows.length, 1, "exactly one assignment row per arming episode");
      assert.strictEqual(assignmentRows[0].assigned_action, "task_package");
      assert.strictEqual(assignmentRows[0].route_policy, "randomized_offer_v1");
      assert.strictEqual(Number(assignmentRows[0].assignment_probability), 1);

      // Idempotency: an identical second run must not change root props.
      const second = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.ok(second.status === "written" || second.status === "skipped_done");
      const propsAfter = await armedRootProps(userWithMemory);
      assert.deepStrictEqual(propsAfter, props, "memory_context must keep root props deterministic across identical runs");

      // G5 verify loop: armed runs write no verification rows; after
      // detonate_done, a re-fire (skipped_done) records exactly one
      // same_thread_trigger observation, idempotent within the week.
      // kind='observation' only: the seeded V7 verdict rows are test
      // fixtures, not engine writes — the engine only ever writes
      // observations on this path.
      async function verificationRows(): Promise<Array<Record<string, any>>> {
        return queryJson(
          `SELECT id, kind, observation, thread_id, thread_key, handled_at_ts, observed_week_start
             FROM thread_verifications WHERE user_id = ${q(userWithMemory)} AND kind = 'observation' ORDER BY created_at_ts, id`,
        );
      }
      assert.strictEqual((await verificationRows()).length, 0, "armed runs must write no observation rows");

      const rootId = first.armed_node_id!;
      await handleToolCall("daobrew_detonate_done", { cause_id: rootId, artifact_ref: "test://v3-artifact" }, false);
      const third = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.strictEqual(third.status, "skipped_done");
      const afterThird = await verificationRows();
      assert.strictEqual(afterThird.length, 1, "skipped_done records exactly one observation");
      assert.strictEqual(afterThird[0].kind, "observation");
      assert.strictEqual(afterThird[0].observation, "same_thread_trigger");
      const expectedTid = threadId(userWithMemory, `root:${rootId}`);
      assert.strictEqual(afterThird[0].thread_key, `root:${rootId}`);
      assert.strictEqual(afterThird[0].thread_id, expectedTid);
      assert.strictEqual(
        afterThird[0].id,
        verificationId({ threadId: expectedTid, kind: "observation", bucket: `wk:${afterThird[0].observed_week_start}` }),
        "id derives from (threadId, 'observation', wk:<observed_week_start>)",
      );
      assert.ok(Number(afterThird[0].handled_at_ts) > 0, "handled_at_ts stamped from done_at_ts");

      const fourth = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.strictEqual(fourth.status, "skipped_done");
      const afterFourth = await verificationRows();
      assert.strictEqual(afterFourth.length, 1, "same-week re-fire stays a single row");
      // Mutual exclusivity: skipped_done runs write the trigger observation
      // ONLY — never coverage rows.
      assert.ok(
        afterFourth.every((row) => row.observation === "same_thread_trigger"),
        "skipped_done paths must not write engine_ran_no_trigger rows",
      );

      // V4: a no-signal run records one engine_ran_no_trigger coverage
      // observation per done thread per local day.
      delete process.env.DAOBREW_DEVICE_CREDENTIAL;
      const fifth = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.strictEqual(fifth.status, "no_signal");
      const afterFifth = await verificationRows();
      const coverageRows = afterFifth.filter((row) => row.observation === "engine_ran_no_trigger");
      assert.strictEqual(coverageRows.length, 1, "one coverage row for the single done thread");
      assert.strictEqual(coverageRows[0].thread_id, expectedTid);
      assert.strictEqual(afterFifth.length, 2, "trigger + coverage observations coexist as separate rows");
      const sixth = await runEngineOnce({ once: true, userId: userWithMemory });
      assert.strictEqual(sixth.status, "no_signal");
      assert.strictEqual((await verificationRows()).length, 2, "same-day rerun adds no coverage rows");
      process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;

      // No seeded threads → no memory_context key at all (absent, not empty junk).
      const bare = await runEngineOnce({ once: true, userId: userWithoutMemory });
      assert.strictEqual(bare.status, "written");
      assert.strictEqual(bare.root_armed, true);
      const bareProps = await armedRootProps(userWithoutMemory);
      assert.ok(!("memory_context" in bareProps), "root without Layer 2 threads must not carry a memory_context key");
    } finally {
      try {
        await purgeUser(userWithMemory);
        await purgeUser(userWithoutMemory);
      } catch {
        // best-effort cleanup; the unique per-pid user ids keep reruns isolated
      }
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("writes demo graph rows separately for each --user-id", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const env = {
        ...process.env,
        DAOBREW_GRAPH_DB: dbPath,
        DAOBREW_CONFIG_FILE: join(dbPath, "missing-config.json"),
        DAOBREW_USER_ID: ENGINE_TEST_USER,
      };

      const firstUser = DEMO_A_USER;
      const local = await runEngineOnce({ once: true, demo: true, userId: firstUser });
      const otherOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--once",
        "--demo",
        `--user-id=${DEMO_B_USER}`,
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const other = JSON.parse(otherOut);

      assert.strictEqual(local.status, "written");
      assert.strictEqual(other.status, "written");
      assert.strictEqual(other.user_id, DEMO_B_USER);
      assert.strictEqual(other.armed_node_id, rootCauseId(DEMO_B_USER));

      const perUserNodes = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      const perUserNodeCounts = Object.fromEntries(perUserNodes.map((line) => {
        const [user, count] = line.split(":");
        return [user, Number(count)];
      }));
      assert.ok((perUserNodeCounts[firstUser] ?? 0) >= 7);
      // 10 = previous 9 + 1 memory_hit node (project-memory support is now
      // emitted as a first-class citation node).
      assert.strictEqual(perUserNodeCounts[DEMO_B_USER], 10);

      const patternsPerUser = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes WHERE kind='pattern' GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      assert.deepStrictEqual(patternsPerUser, [`${firstUser}:5`, `${DEMO_B_USER}:5`]);

      const armedPerUser = sqlite(
        dbPath,
        "SELECT user_id || ':' || count(*) FROM graph_nodes WHERE kind='ghost' AND json_extract(props_json,'$.status')='armed' GROUP BY user_id ORDER BY user_id;",
      ).trim().split("\n");
      assert.deepStrictEqual(armedPerUser, [`${firstUser}:1`, `${DEMO_B_USER}:1`]);
    });
  });

  it("live run derives enrichment axes from seeded corpus (7th gate fires)", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // Anomaly-window fixture: 9 quiet BALANCED days (constant HR at
    // baseline, healthy HRV) followed by 3 anomaly days (elevated,
    // jittery HR + suppressed HRV) that classify non-BALANCED (empirically
    // OVERDRIVE) — the corpus-axis TARGET class. Every day carries 12 hourly HR samples,
    // comfortably past the >=3 real_inference wear bar.
    const ANOMALY_DATES = ["2026-06-10", "2026-06-11", "2026-06-12"];
    const QUIET_DATES = [
      "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
      "2026-06-06", "2026-06-07", "2026-06-08", "2026-06-09",
    ];
    function hkSamples(metric: string): { value: number; timestamp: string }[] {
      if (metric !== "heart_rate" && metric !== "heart_rate_variability") return [];
      const out: { value: number; timestamp: string }[] = [];
      for (const date of [...QUIET_DATES, ...ANOMALY_DATES]) {
        const anomaly = ANOMALY_DATES.includes(date);
        for (let hour = 9; hour <= 20; hour += 1) {
          const timestamp = `${date}T${String(hour).padStart(2, "0")}:00:00-07:00`;
          const value = metric === "heart_rate"
            ? (anomaly ? 105 + (hour % 4) * 6 : 62)
            : (anomaly ? 18 : 55);
          out.push({ value, timestamp });
        }
      }
      return out;
    }

    // Shift the seeded source fixture so its meetings/insights land at
    // local noon of the first anomaly day: the "#ai2"/"#demo" insight
    // topics then cite an OVERDRIVE target day while the quiet BALANCED
    // days stay uncited — exactly the contrast the 7th gate tests.
    // (1040 = the AI2 meeting's fixture occurred_at_ts — the earliest
    // same-day anchor — so subtracting it lands that meeting exactly at noon.)
    const tsBase = Math.floor(Date.parse("2026-06-10T12:00:00-07:00") / 1000) - 1040;

    await withTempGraphDb(async (dbPath) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        let data: unknown;
        if (url.pathname === "/api/v1/device/health/history") {
          const metric = url.searchParams.get("metric") ?? "heart_rate";
          const samples = hkSamples(metric);
          const values = samples.map((s) => s.value);
          data = {
            metric,
            range: url.searchParams.get("range") ?? "week",
            samples,
            aggregated: values.length
              ? { avg: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) }
              : { avg: 0, min: 0, max: 0 },
          };
        } else if (url.pathname === "/api/v1/state/history") {
          data = {
            states: [{
              bucket_ts: tsBase + 1040,
              yin_score: 34,
              yang_score: 86,
              category: "pushing_it",
              source_quality: "fake_backend_axes",
              updated_at_ts: tsBase + 1050,
            }],
            total_count: 1,
            limit: Number(url.searchParams.get("limit") ?? 24),
          };
        } else {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ success: false, error: { message: `Unhandled path: ${url.pathname}` } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string", "fake backend bound a TCP port");
      const previousEnv = {
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
        DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      };
      try {
        execFileSync(process.execPath, [SOURCE_FIXTURE_SCRIPT], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DAOBREW_GRAPH_DB: dbPath,
            DAOBREW_FIXTURE_USER_ID: ENGINE_TEST_USER,
            DAOBREW_FIXTURE_TS_BASE: String(tsBase),
          },
          encoding: "utf-8",
        });
        process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
        process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
        process.env.DAOBREW_API_URL = `http://127.0.0.1:${address.port}/api/v1`;

        // endTs anchors the requested week window just past the newest
        // fixture sample (2026-06-12T20:00-07:00): the samples are FRESH
        // relative to the window this run asks for, so the staleness
        // diagnostics below must stay silent.
        const endTs = Math.floor(Date.parse("2026-06-13T00:00:00-07:00") / 1000);
        const result = await runEngineOnce({
          once: true,
          dryRun: true,
          userId: ENGINE_TEST_USER,
          endTs,
        });
        assert.strictEqual(result.status, "dry_run");
        assert.strictEqual(result.demo, false);
        assert.ok(
          (result.enrichment_axes_count ?? 0) >= 1,
          `expected >=1 live-derived enrichment axis, got ${result.enrichment_axes_count}`,
        );
        // Guard: fresh raw samples must never trip the staleness warnings,
        // and live axes mean the wear bar was cleared — the no-worn-days
        // diagnostic must stay quiet too.
        assert.ok(
          !result.warnings.some((w) => w.includes("raw samples stale") || w.includes("raw push pipeline may be down") || w.includes("no worn days")),
          `fresh raw samples must not trigger staleness warnings: ${JSON.stringify(result.warnings)}`,
        );

        // Pin the corpus-axis class split directly: quiet days must classify
        // BALANCED and anomaly days non-BALANCED, or the axis asserted above
        // would silently lose its target/reference contrast if the pattern
        // thresholds drift. This makes threshold drift fail loudly here.
        const rawSamples: RawSample[] = (["heart_rate", "heart_rate_variability"] as const)
          .flatMap((metric) => hkSamples(metric).map((s) => ({ metric, value: s.value, timestamp: s.timestamp })));
        const ctx = buildV2Context(rawSamples);
        assert.ok(ctx, "raw fixture samples should activate the v2 context");
        assert.strictEqual(ctx.signaturesByDate.get(QUIET_DATES[0])?.dominant, "BALANCED");
        assert.notStrictEqual(ctx.signaturesByDate.get(ANOMALY_DATES[0])?.dominant, "BALANCED");
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  it("run output reports the graph store and warns on the sqlite/empty-memory trap", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // Fresh temp SQLite db, NO seeding: this is the split-store trap shape.
    // Inject an empty in-process biometric client so UUID-first auth cannot
    // reach the default external API while this test is proving empty corpus
    // behavior.
    await withTempGraphDb(async () => {
      const previousConfig = process.env.DAOBREW_CONFIG_FILE;
      const previousDeviceCredential = process.env.DAOBREW_DEVICE_CREDENTIAL;
      process.env.DAOBREW_CONFIG_FILE = join(tmpdir(), "daobrew-missing-config.json");
      delete process.env.DAOBREW_DEVICE_CREDENTIAL;
      try {
        const emptyClient = fakeBiometricsClient({ samplesByMetric: {}, states: [] });
        const observedClientReads: string[] = [];
        const client: BiometricsClient = {
          async getHealthkitHistory(metric, range) {
            observedClientReads.push(`metric:${metric}`);
            return emptyClient.getHealthkitHistory(metric, range);
          },
          async getStateHistory(limit) {
            observedClientReads.push("states");
            return emptyClient.getStateHistory(limit);
          },
        };
        const result = await runEngineOnce({ once: true, dryRun: true, demo: false, userId: ENGINE_TEST_USER, client });
        assert.equal(result.status, "no_signal");
        assert.equal(result.graph_store, "sqlite");
        assert.deepStrictEqual(result.signal_counts, {
          calendar: 0,
          granola: 0,
          memory: 0,
          biometric_episodes: 0,
          biometric_source: "api",
        });
        assert.ok(observedClientReads.includes("states"));
        assert.ok(result.warnings.some((w) => w.includes("store is sqlite")));
        // The two diagnostics are mutually exclusive by construction: the
        // split-store warning needs an EMPTY corpus, the temporal-overlap
        // warning needs a NON-EMPTY one. Pin that they never both fire.
        assert.ok(!result.warnings.some((w) => w.includes("outside the biometric window")));
        assert.equal(result.enrichment_axes_count, undefined);
      } finally {
        if (previousConfig === undefined) delete process.env.DAOBREW_CONFIG_FILE;
        else process.env.DAOBREW_CONFIG_FILE = previousConfig;
        if (previousDeviceCredential === undefined) delete process.env.DAOBREW_DEVICE_CREDENTIAL;
        else process.env.DAOBREW_DEVICE_CREDENTIAL = previousDeviceCredential;
      }
    });
  });

  it("no_signal distinguishes empty corpus from corpus-outside-biometric-window", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // Biometric episode + raw samples on 2026-06-10, but the seeded corpus
    // is shifted ~60 days EARLIER — rows exist yet none fall inside the
    // triplet join windows (calendar ±24h, memory 14d). Today that reads as
    // a bare no_signal indistinguishable from "no data at all".
    const stateAnchorTs = Math.floor(Date.parse("2026-06-10T12:00:00-07:00") / 1000);
    const tsBase = stateAnchorTs - 1040 - 60 * 86400;
    const sampleDate = "2026-06-10";

    await withTempGraphDb(async (dbPath) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        let data: unknown;
        if (url.pathname === "/api/v1/device/health/history") {
          const metric = url.searchParams.get("metric") ?? "heart_rate";
          const samples = metric === "heart_rate"
            ? Array.from({ length: 12 }, (_, i) => ({
                value: 62,
                timestamp: `${sampleDate}T${String(9 + i).padStart(2, "0")}:00:00-07:00`,
              }))
            : [];
          const values = samples.map((s) => s.value);
          data = {
            metric,
            range: url.searchParams.get("range") ?? "week",
            samples,
            aggregated: values.length
              ? { avg: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) }
              : { avg: 0, min: 0, max: 0 },
          };
        } else if (url.pathname === "/api/v1/state/history") {
          data = {
            states: [{
              bucket_ts: stateAnchorTs,
              yin_score: 34,
              yang_score: 86,
              category: "pushing_it",
              source_quality: "fake_backend_stale_corpus",
              updated_at_ts: stateAnchorTs + 10,
            }],
            total_count: 1,
            limit: Number(url.searchParams.get("limit") ?? 24),
          };
        } else {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ success: false, error: { message: `Unhandled path: ${url.pathname}` } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, data }));
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== "string", "fake backend bound a TCP port");
      const previousEnv = {
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
        DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      };
      try {
        execFileSync(process.execPath, [SOURCE_FIXTURE_SCRIPT], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DAOBREW_GRAPH_DB: dbPath,
            DAOBREW_FIXTURE_USER_ID: ENGINE_TEST_USER,
            DAOBREW_FIXTURE_TS_BASE: String(tsBase),
          },
          encoding: "utf-8",
        });
        process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
        process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
        process.env.DAOBREW_API_URL = `http://127.0.0.1:${address.port}/api/v1`;

        const result = await runEngineOnce({
          once: true,
          dryRun: true,
          demo: false,
          userId: ENGINE_TEST_USER,
        });
        assert.equal(result.status, "no_signal");
        assert.deepStrictEqual(result.signal_counts, {
          calendar: 2,
          granola: 2,
          memory: 2,
          biometric_episodes: 1,
          // sqlite store: the direct Neon path is skipped, HTTP serves.
          biometric_source: "api",
        });
        assert.equal(result.graph_store, "sqlite");
        assert.ok(result.warnings.some((w) => w.includes("outside the biometric window")));
        // Corpus is NON-empty here, so the split-store warning must not
        // also fire — the two diagnostics stay mutually exclusive.
        assert.ok(!result.warnings.some((w) => w.includes("store is sqlite")));
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  it("warns when newest raw sample is older than the biometric window", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // Half of the G1 masking shape: ScheduledRefreshJob keeps minting
    // CURRENT states while the watch→backend raw-sample push is dead, so
    // the newest raw sample predates the requested week window (~3 days
    // before its start here). The run looks alive; the engine must warn.
    const nowSec = Math.floor(Date.now() / 1000);
    const staleAnchorSec = nowSec - 10 * 86400; // week window starts at now-7d
    const samples = Array.from({ length: 12 }, (_, i) => ({
      value: 62 + (i % 4),
      timestamp: new Date((staleAnchorSec - i * 3600) * 1000).toISOString(),
    }));

    await withTempGraphDb(async (dbPath) => {
      const backend = await startFakeBiometricsBackend({
        samplesByMetric: { heart_rate: samples },
        states: [{
          bucket_ts: nowSec - 3600,
          yin_score: 34,
          yang_score: 86,
          category: "pushing_it",
          source_quality: "fake_backend_stale_samples",
          updated_at_ts: nowSec - 3500,
        }],
      });
      const previousEnv = {
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
        DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      };
      try {
        process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
        process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
        process.env.DAOBREW_API_URL = backend.url;

        const result = await runEngineOnce({
          once: true,
          dryRun: true,
          demo: false,
          userId: ENGINE_TEST_USER,
          client: backend.client,
        });
        assert.equal(result.signal_counts.biometric_episodes, 1);
        assert.ok(
          result.warnings.some((w) => w.startsWith("raw samples stale: newest ")),
          `expected a raw-sample staleness warning, got ${JSON.stringify(result.warnings)}`,
        );
        // Mutually exclusive with the zero-sample shape: samples DID arrive.
        assert.ok(!result.warnings.some((w) => w.includes("raw push pipeline may be down")));
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await backend.close();
      }
    });
  });

  it("warns when states exist but zero raw samples arrive", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // The exact masked-outage shape from 2026-06-23: the raw push died
    // completely, healthkit history comes back EMPTY, yet refresh-job
    // states keep the run looking healthy. Silence here is the bug.
    const nowSec = Math.floor(Date.now() / 1000);

    await withTempGraphDb(async (dbPath) => {
      const backend = await startFakeBiometricsBackend({
        samplesByMetric: {},
        states: [{
          bucket_ts: nowSec - 3600,
          yin_score: 34,
          yang_score: 86,
          category: "pushing_it",
          source_quality: "fake_backend_zero_samples",
          updated_at_ts: nowSec - 3500,
        }],
      });
      const previousEnv = {
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
        DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      };
      try {
        process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
        process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
        process.env.DAOBREW_API_URL = backend.url;

        const result = await runEngineOnce({
          once: true,
          dryRun: true,
          demo: false,
          userId: ENGINE_TEST_USER,
          client: backend.client,
        });
        assert.equal(result.signal_counts.biometric_episodes, 1);
        assert.ok(
          result.warnings.some((w) => w.includes("raw push pipeline may be down")),
          `expected a raw-push-outage warning, got ${JSON.stringify(result.warnings)}`,
        );
        // Mutually exclusive with the stale-sample shape: there is no
        // "newest sample" to be stale when zero samples arrived.
        assert.ok(!result.warnings.some((w) => w.startsWith("raw samples stale: newest ")));
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await backend.close();
      }
    });
  });

  it("warns when fresh samples arrive but none clear the wear bar (v2 inactive)", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    // The third G1 blind spot: samples ARE arriving and ARE fresh (warning A
    // stays quiet, warning B stays quiet), but they are step_count-only — no
    // heart_rate means zero worn days, so buildV2Context returns null and v2
    // silently never activates.
    const nowSec = Math.floor(Date.now() / 1000);
    const samples = Array.from({ length: 12 }, (_, i) => ({
      value: 40 + i,
      timestamp: new Date((nowSec - 1800 - i * 3600) * 1000).toISOString(),
    }));

    await withTempGraphDb(async (dbPath) => {
      const backend = await startFakeBiometricsBackend({
        samplesByMetric: { step_count: samples },
        states: [{
          bucket_ts: nowSec - 3600,
          yin_score: 34,
          yang_score: 86,
          category: "pushing_it",
          source_quality: "fake_backend_no_hr_samples",
          updated_at_ts: nowSec - 3500,
        }],
      });
      const previousEnv = {
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_DEVICE_CREDENTIAL: process.env.DAOBREW_DEVICE_CREDENTIAL,
        DAOBREW_API_URL: process.env.DAOBREW_API_URL,
      };
      try {
        process.env.DAOBREW_CONFIG_FILE = join(dbPath, "missing-config.json");
        process.env.DAOBREW_DEVICE_CREDENTIAL = TEST_DEVICE_CREDENTIAL;
        process.env.DAOBREW_API_URL = backend.url;

        const result = await runEngineOnce({
          once: true,
          dryRun: true,
          demo: false,
          userId: ENGINE_TEST_USER,
          client: backend.client,
        });
        assert.equal(result.signal_counts.biometric_episodes, 1);
        assert.ok(
          result.warnings.some((w) => w.includes("raw samples present but no worn days")),
          `expected a no-worn-days warning, got ${JSON.stringify(result.warnings)}`,
        );
        // Compatible-but-distinct from A/B: samples arrived (no B) and are
        // fresh (no A) — only the wear-bar diagnostic fires here.
        assert.ok(!result.warnings.some((w) => w.startsWith("raw samples stale: newest ")));
        assert.ok(!result.warnings.some((w) => w.includes("raw push pipeline may be down")));
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        await backend.close();
      }
    });
  });

  it("CLI supports --once --dry-run and --watch", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    await withTempGraphDb(async (dbPath) => {
      const env = {
        ...process.env,
        DAOBREW_GRAPH_DB: dbPath,
        DAOBREW_CONFIG_FILE: join(dbPath, "missing-config.json"),
        DAOBREW_USER_ID: ENGINE_TEST_USER,
      };
      const onceOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--once",
        "--dry-run",
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const once = JSON.parse(onceOut);
      assert.strictEqual(once.status, "no_signal");

      const watchOut = execFileSync(process.execPath, [
        "dist/src/engine/run.js",
        "--watch",
        "--dry-run",
        "--demo",
        "--max-runs=1",
      ], { cwd: process.cwd(), env, encoding: "utf-8" });
      const watch = JSON.parse(watchOut.trim());
      assert.strictEqual(watch.run, 1);
      assert.strictEqual(watch.status, "dry_run");
    });
  });
});

// Unit harness for the G5 verification observation writers: injected
// exec/query fakes capture the exact SQL (memory-nightly.test.ts style), so
// these run on every `npm test` with no Docker. The engine-level hookup
// (skipped_done → observation row, mutual exclusivity with coverage rows)
// is pinned in the PG-gated Layer-2 test above.
describe("verification observations (G5 verify loop)", () => {
  const VUSER = "verify-user";
  const VGHOST = "ghost_root_verify-user_converge-the-story";
  const VTID = threadId(VUSER, `root:${VGHOST}`);
  const VNOW = 1_800_000_000;

  function skippedDoneDelta(): any {
    return {
      user_id: VUSER,
      nodes: [{
        id: VGHOST,
        kind: "ghost",
        title: "root",
        source: "reasoner",
        source_ref: "reasoner:test",
        props_json: {
          status: "armed",
          selected_pattern: "overdrive",
          week_start: "2026-06-29",
          verify_horizon_weeks: 2,
          claim_level: "source_backed_hypothesis_not_settled_causality",
          evidence_grade: "moderate",
        },
      }],
      edges: [],
      armed_root_cause: { node_id: VGHOST, confidence: 0.7, root_cause_class: "productivity", brief: {} },
    };
  }

  function makeVerifyQuery(fixtures: Array<[RegExp, Record<string, any>[]]>) {
    return async (sql: string) => {
      for (const [pattern, rows] of fixtures) {
        if (pattern.test(sql)) return rows;
      }
      return [];
    };
  }

  async function withGraphStore<T>(kind: string, fn: () => Promise<T>): Promise<T> {
    const previous = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = kind;
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = previous;
    }
  }

  const doneGhostRow = {
    props_json: { status: "done", done_at_ts: 1_799_900_000, verify_horizon_weeks: 2 },
  };

  it("skipped_done writes one same_thread_trigger observation with the deterministic week-bucket id", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      await recordSkippedDoneObservation({
        userId: VUSER,
        ghostId: VGHOST,
        delta: skippedDoneDelta(),
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([[/FROM graph_nodes WHERE/, [doneGhostRow]]]),
        nowTs: VNOW,
      });
      assert.strictEqual(calls.length, 1, "exactly one INSERT statement");
      const sql = calls[0];
      assert.match(sql, /INSERT INTO thread_verifications/);
      assert.match(sql, /'observation'/);
      assert.match(sql, /'same_thread_trigger'/);
      assert.match(sql, /'no_same_thread_trigger_within_horizon'/);
      assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
      const expectedId = verificationId({ threadId: VTID, kind: "observation", bucket: "wk:2026-06-29" });
      assert.ok(sql.includes(`'${expectedId}'`), `deterministic id ${expectedId} in:\n${sql}`);
      assert.ok(sql.includes(`'root:${VGHOST}'`), "thread_key is root:<ghostId>");
      assert.ok(sql.includes(`'${VTID}'`), "thread_id derives from userId+thread_key");
      assert.ok(sql.includes("1799900000"), "handled_at_ts comes from ghost props.done_at_ts");
      assert.match(sql, /'2026-06-29'/);
      // details_json carries the unwritten delta root's verification props.
      assert.match(sql, /"selected_pattern":"overdrive"/);
      assert.match(sql, /"claim_level":"source_backed_hypothesis_not_settled_causality"/);
      assert.match(sql, /"evidence_grade":"moderate"/);
      assert.match(sql, /"verify_horizon_weeks":2/);
    });
  });

  it("same-week rerun issues a byte-identical statement (idempotent by id)", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const deps = {
        userId: VUSER,
        ghostId: VGHOST,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([[/FROM graph_nodes WHERE/, [doneGhostRow]]]),
        nowTs: VNOW,
      };
      await recordSkippedDoneObservation({ ...deps, delta: skippedDoneDelta() });
      await recordSkippedDoneObservation({ ...deps, delta: skippedDoneDelta() });
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0], calls[1], "same-week rerun must produce the identical statement");
    });
  });

  it("falls back to the e_done_ edge created_at_ts when props.done_at_ts is absent", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      await recordSkippedDoneObservation({
        userId: VUSER,
        ghostId: VGHOST,
        delta: skippedDoneDelta(),
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([
          [/FROM graph_nodes WHERE/, [{ props_json: { status: "done" } }]],
          [/FROM graph_edges WHERE/, [{ created_at_ts: 1_799_800_000 }]],
        ]),
        nowTs: VNOW,
      });
      assert.strictEqual(calls.length, 1);
      assert.ok(calls[0].includes("1799800000"), "handled_at_ts falls back to the e_done_ edge timestamp");
    });
  });

  it("writes nothing when the graph store is sqlite", async () => {
    await withGraphStore("sqlite", async () => {
      const calls: string[] = [];
      await recordSkippedDoneObservation({
        userId: VUSER,
        ghostId: VGHOST,
        delta: skippedDoneDelta(),
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([[/FROM graph_nodes WHERE/, [doneGhostRow]]]),
        nowTs: VNOW,
      });
      assert.strictEqual(calls.length, 0, "sqlite runs must not write verification rows");
    });
  });

  // V4 — engine_ran_no_trigger coverage observations. Day-bucket convention:
  // localDayKey with the engine's fixed default offset (v2Context
  // DEFAULT_OFFSET_HOURS = -7), i.e. VNOW → the same local day the
  // coverage/signature layer would assign.
  const doneGhostRows = [
    { id: "ghost_a", props_json: { status: "done", done_at_ts: 1_799_000_000, verify_horizon_weeks: 2 } },
    { id: "ghost_b", props_json: { status: "done", done_at_ts: 1_799_100_000 } },
  ];
  // MRT v1: the coverage scan also selects held (control-arm) armed roots.
  const COVERAGE_SCAN = /kind = 'ghost' AND \(props_json ->> 'status' = 'done' OR \(props_json ->> 'status' = 'armed' AND props_json ->> 'offer_state' = 'held'\)\)/;
  const doneGhostFixture: Array<[RegExp, Record<string, any>[]]> = [
    [COVERAGE_SCAN, doneGhostRows],
  ];
  const VDAY = localDayKey(VNOW, -7);

  it("coverage run writes one engine_ran_no_trigger row per done thread with a deterministic local-day id", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const result = await recordCoverageObservations({
        userId: VUSER,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery(doneGhostFixture),
        nowTs: VNOW,
      });
      assert.strictEqual(result.written, 2);
      assert.strictEqual(calls.length, 1, "one batched INSERT statement");
      const sql = calls[0];
      assert.match(sql, /INSERT INTO thread_verifications/);
      assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
      assert.strictEqual(sql.match(/'engine_ran_no_trigger'/g)?.length, 2, "one row per done thread");
      for (const ghost of doneGhostRows) {
        const tid = threadId(VUSER, `root:${ghost.id}`);
        const expectedId = verificationId({ threadId: tid, kind: "observation", bucket: `day:${VDAY}` });
        assert.ok(sql.includes(`'${expectedId}'`), `deterministic day-bucket id for ${ghost.id}`);
        assert.ok(sql.includes(`'root:${ghost.id}'`), `thread_key for ${ghost.id}`);
      }
      assert.ok(sql.includes("1799000000"), "handled_at_ts carried from ghost props.done_at_ts");
      assert.ok(sql.includes(`"local_day":"${VDAY}"`), "details_json records the day bucket");
    });
  });

  it("same-day rerun issues a byte-identical coverage statement (capped at 1/day/thread)", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const deps = {
        userId: VUSER,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery(doneGhostFixture),
        nowTs: VNOW,
      };
      await recordCoverageObservations(deps);
      await recordCoverageObservations(deps);
      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0], calls[1], "same-day rerun must produce the identical statement");
    });
  });

  it("coverage run with no done threads writes nothing", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const result = await recordCoverageObservations({
        userId: VUSER,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([]),
        nowTs: VNOW,
      });
      assert.strictEqual(result.written, 0);
      assert.strictEqual(calls.length, 0);
    });
  });

  it("trigger and coverage ids never collide on a Monday (week_start == local day)", async () => {
    await withGraphStore("postgres", async () => {
      // 2026-06-29 is a Monday: week_start and localDayKey emit the same
      // YYYY-MM-DD string, so unprefixed buckets would mint the SAME tvf_ id
      // for both observations and ON CONFLICT would silently drop one.
      const MONDAY = "2026-06-29";
      const MONDAY_TS = Date.UTC(2026, 5, 29, 20) / 1000; // localDayKey(ts, -7) === MONDAY
      assert.strictEqual(localDayKey(MONDAY_TS, -7), MONDAY, "fixture sanity: same local day");

      const triggerCalls: string[] = [];
      await recordSkippedDoneObservation({
        userId: VUSER,
        ghostId: VGHOST,
        delta: skippedDoneDelta(), // root week_start is 2026-06-29 (Monday)
        exec: async (sql: string) => { triggerCalls.push(sql); },
        query: makeVerifyQuery([[/FROM graph_nodes WHERE/, [doneGhostRow]]]),
        nowTs: MONDAY_TS,
      });
      const coverageCalls: string[] = [];
      await recordCoverageObservations({
        userId: VUSER,
        exec: async (sql: string) => { coverageCalls.push(sql); },
        query: makeVerifyQuery([[
          COVERAGE_SCAN,
          [{ id: VGHOST, props_json: { status: "done", done_at_ts: 1_799_900_000 } }],
        ]]),
        nowTs: MONDAY_TS,
      });

      const triggerId = triggerCalls[0]?.match(/tvf_[0-9a-f]{24}/)?.[0];
      const coverageId = coverageCalls[0]?.match(/tvf_[0-9a-f]{24}/)?.[0];
      assert.ok(triggerId, "trigger statement carries a tvf_ id");
      assert.ok(coverageId, "coverage statement carries a tvf_ id");
      assert.notStrictEqual(
        triggerId,
        coverageId,
        "same thread, same Monday: trigger and coverage observations must keep distinct ids",
      );
    });
  });

  it("coverage run writes nothing when the graph store is sqlite", async () => {
    await withGraphStore("sqlite", async () => {
      const calls: string[] = [];
      await recordCoverageObservations({
        userId: VUSER,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery(doneGhostFixture),
        nowTs: VNOW,
      });
      assert.strictEqual(calls.length, 0, "sqlite runs must not write coverage rows");
    });
  });

  it("verify reads filter user_id by the scope row, never by a literal (F1 One-Time-Filter regression)", async () => {
    await withGraphStore("postgres", async () => {
      // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
      // planner fold the RLS qual into a One-Time Filter evaluated at
      // executor startup — before the lateral scope row has run set_config —
      // so a fresh pooled backend silently returns zero rows (live bug F1).
      // Every read body must reference the scope row's uid instead. (The
      // INSERTs keep their literals: scopedExec sets the GUC in-transaction.)
      const reads: string[] = [];
      // Ghost props WITHOUT done_at_ts force the e_done_<ghostId> edge
      // fallback read too, so both resolveHandledAtTs reads are exercised.
      const fixtureQuery = makeVerifyQuery([
        [COVERAGE_SCAN, doneGhostRows],
        [/FROM graph_nodes WHERE user_id = /, [{ props_json: { status: "done", verify_horizon_weeks: 2 } }]],
        [/FROM graph_edges WHERE user_id = /, [{ created_at_ts: 1_799_900_000 }]],
      ]);
      const query = async (sql: string) => { reads.push(sql); return fixtureQuery(sql); };
      await recordSkippedDoneObservation({
        userId: VUSER,
        ghostId: VGHOST,
        delta: skippedDoneDelta(),
        exec: async () => {},
        query,
        nowTs: VNOW,
      });
      await recordCoverageObservations({ userId: VUSER, exec: async () => {}, query, nowTs: VNOW });
      // ghost props + e_done edge fallback + coverage ghost scan
      assert.strictEqual(reads.length, 3, `expected 3 reads, got: ${JSON.stringify(reads)}`);
      for (const sql of reads) {
        assert.ok(
          sql.includes("user_id = __daobrew_scope.uid"),
          `read must filter user_id via the scope row, got: ${sql}`,
        );
        assert.ok(
          !sql.includes(`user_id = '${VUSER}'`),
          `read must NOT compare user_id to a literal (One-Time-Filter fail-closed trap), got: ${sql}`,
        );
      }
    });
  });

  // MRT randomization v1: held (control-arm) armed roots are observation-
  // eligible like done threads, anchored on armed_at_ts instead of done_at_ts.
  const heldGhostRow = {
    id: "ghost_held",
    props_json: {
      status: "armed",
      offer_state: "held",
      armed_at_ts: 1_799_950_000,
      verify_horizon_weeks: 2,
      selected_pattern: "overdrive",
      week_start: "2026-07-06",
      first_seen_week: "2026-06-29",
      claim_level: "source_backed_hypothesis_not_settled_causality",
    },
  };

  it("coverage scan includes held control roots with handled_at_ts = armed_at_ts and an arm tag", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const result = await recordCoverageObservations({
        userId: VUSER,
        exec: async (sql: string) => { calls.push(sql); },
        query: makeVerifyQuery([[COVERAGE_SCAN, [...doneGhostRows, heldGhostRow]]]),
        nowTs: VNOW,
      });
      assert.strictEqual(result.written, 3);
      const sql = calls[0];
      assert.strictEqual(sql.match(/'engine_ran_no_trigger'/g)?.length, 3, "held roots earn quiet-day rows too");
      assert.ok(sql.includes("1799950000"), "held row's handled_at_ts is the episode anchor armed_at_ts");
      assert.strictEqual(sql.match(/"arm":"control"/g)?.length, 1, "exactly the held row carries the control arm tag");
      const heldTid = threadId(VUSER, "root:ghost_held");
      const expectedId = verificationId({ threadId: heldTid, kind: "observation", bucket: `day:${VDAY}` });
      assert.ok(sql.includes(`'${expectedId}'`), "held rows share the day-bucket id convention");
    });
  });

  it("held trigger observation records a LATER-week re-fire, never the arming week itself", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const result = await recordHeldTriggerObservation({
        userId: VUSER,
        ghostId: "ghost_held",
        ghostProps: heldGhostRow.props_json,
        exec: async (sql: string) => { calls.push(sql); },
        nowTs: VNOW,
      });
      assert.strictEqual(result.written, 1);
      const sql = calls[0];
      assert.match(sql, /INSERT INTO thread_verifications/);
      assert.match(sql, /'same_thread_trigger'/);
      assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
      assert.ok(sql.includes("1799950000"), "handled_at_ts = armed_at_ts");
      assert.match(sql, /"arm":"control"/);
      const heldTid = threadId(VUSER, "root:ghost_held");
      const expectedId = verificationId({ threadId: heldTid, kind: "observation", bucket: "wk:2026-07-06" });
      assert.ok(sql.includes(`'${expectedId}'`), "week-bucketed like skipped_done triggers");

      // Arming week: the episode IS the firing — no self-trigger.
      const armingWeek: string[] = [];
      const sameWeek = await recordHeldTriggerObservation({
        userId: VUSER,
        ghostId: "ghost_held",
        ghostProps: { ...heldGhostRow.props_json, week_start: "2026-06-29" },
        exec: async (sql: string) => { armingWeek.push(sql); },
        nowTs: VNOW,
      });
      assert.strictEqual(sameWeek.written, 0);
      assert.strictEqual(armingWeek.length, 0);
    });
  });

  it("held trigger writer skips offered roots, non-held props, and sqlite stores", async () => {
    await withGraphStore("postgres", async () => {
      const calls: string[] = [];
      const offered = await recordHeldTriggerObservation({
        userId: VUSER,
        ghostId: "ghost_held",
        ghostProps: { ...heldGhostRow.props_json, offer_state: "offered" },
        exec: async (sql: string) => { calls.push(sql); },
        nowTs: VNOW,
      });
      assert.strictEqual(offered.written, 0);
      const notArmed = await recordHeldTriggerObservation({
        userId: VUSER,
        ghostId: "ghost_held",
        ghostProps: { ...heldGhostRow.props_json, status: "done" },
        exec: async (sql: string) => { calls.push(sql); },
        nowTs: VNOW,
      });
      assert.strictEqual(notArmed.written, 0);
      assert.strictEqual(calls.length, 0);
    });
    await withGraphStore("sqlite", async () => {
      const calls: string[] = [];
      const result = await recordHeldTriggerObservation({
        userId: VUSER,
        ghostId: "ghost_held",
        ghostProps: heldGhostRow.props_json,
        exec: async (sql: string) => { calls.push(sql); },
        nowTs: VNOW,
      });
      assert.strictEqual(result.written, 0);
      assert.strictEqual(calls.length, 0);
    });
  });
});
