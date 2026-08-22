// Keep config reads hermetic. graph-db no longer consumes client Postgres URLs.
process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { handleToolCall, toolDefinitions, toolUserId } from "../src/tools.js";
import { _resetMockDetonator } from "../src/mock.js";
import * as graphDb from "../src/graph-db.js";
import { __resetGraphDbConfigCacheForTests } from "../src/graph-db.js";
import {
  armedEpisodeTs,
  assignmentId,
  closeInterventionAssignment,
  logInterventionAssignment,
} from "../src/engine/assignments.js";

/**
 * Detonator flow. Mock-mode shape tests always run; the SQLite round-trip
 * (seed script → detonate → done) needs the `sqlite3` CLI, which macOS ships
 * but CI containers may not — those tests skip themselves when it's missing.
 * Calendar writes (osascript) are not exercised here; only the non-macOS guard.
 */

function sqliteCliPresent(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Compiled test lives at dist/tests/, the seed script stays at the package root.
const SEED_SCRIPT = join(__dirname, "..", "..", "scripts", "seed-demo-graph.mjs");
const DETONATE_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const DETONATE_ENV_USER = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const DETONATE_ROW_USER = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";

function signedPhysicianLicense() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;
  const payload = {
    iss: "daobrew",
    aud: "sentinel",
    sub: "neo@example.com",
    tier: "physician",
    status: "active",
    iat: 1_700_000_000,
    exp: Math.floor(Date.now() / 1000) + 86_400,
    checkout_provider: "stripe",
    order_id: "test_order",
  };
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(`dbw_v1.${payloadPart}`, "utf-8"), privateKey).toString("base64url");
  return { publicPem, licenseKey: `dbw_v1.${payloadPart}.${signature}` };
}

function writeLicenseConfig(dir: string, extra?: Record<string, unknown>): string {
  const license = signedPhysicianLicense();
  const configPath = join(dir, "config.json");
  writeFileSync(
    configPath,
    JSON.stringify({
      license_key: license.licenseKey,
      entitlement_public_key: license.publicPem,
      checkout_url: "https://pay.example",
      ...extra,
    }),
  );
  return configPath;
}

let environmentSuiteTail = Promise.resolve();

async function acquireEnvironmentSuite(): Promise<() => void> {
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const prior = environmentSuiteTail;
  environmentSuiteTail = current;
  await prior;
  return release;
}

// These suites intentionally exercise process-wide config/environment seams.
// Keep them under one serial parent so Node versions that schedule top-level
// suites concurrently cannot cross-contaminate identity or graph ownership.
describe("detonator integration", { concurrency: 1 }, () => {
describe("detonator — mock mode (no graph DB)", () => {
  let tmpDir: string;
  let releaseEnvironment: () => void;

  before(async () => {
    releaseEnvironment = await acquireEnvironmentSuite();
    tmpDir = mkdtempSync(join(tmpdir(), "daobrew-detonate-"));
    process.env.DAOBREW_GRAPH_DB = join(tmpDir, "missing.db"); // guaranteed absent
    _resetMockDetonator();
  });
  after(() => {
    delete process.env.DAOBREW_GRAPH_DB;
    delete process.env.DAOBREW_CONFIG_FILE;
    rmSync(tmpDir, { recursive: true, force: true });
    releaseEnvironment();
  });

  it("daobrew_detonate returns the full task package", async () => {
    const result = await handleToolCall("daobrew_detonate", {}, true);
    assert.ok(result.__mcp_content__);
    const text = result.content[0].text as string;
    assert.match(text, /cause_id: ghost_ai2_demo_story/);
    assert.match(text, /SENTINEL ACTION PACKAGE/);
    assert.match(text, /LIKELY WORK THREAD/);
    assert.match(text, /EVIDENCE/);
    assert.match(text, /HR 91 \/ 88 \/ 93/);
    assert.match(text, /CONTEXT/);
    assert.match(text, /read → attribute → review → verify/);
    assert.match(text, /REVIEW TASK/);
    assert.match(text, /daobrew_schedule_block/);
    assert.match(text, /daobrew_detonate_done/);
    assert.ok(!result.__local_data__, "mock brief must keep the mock banner");
  });

  it("daobrew_detonate_done closes the mock cause; re-detonate finds nothing", async () => {
    const done = await handleToolCall(
      "daobrew_detonate_done",
      { cause_id: "ghost_ai2_demo_story", artifact_ref: "ai2-demo-story.md" },
      true,
    );
    assert.match(done.content[0].text as string, /completed \(mock\)/);

    const again = await handleToolCall("daobrew_detonate", {}, true);
    assert.match(again.content[0].text as string, /No ready Sentinel action package/);
  });

  it("daobrew_detonate without mock and without a license returns payment guide", async () => {
    process.env.DAOBREW_CONFIG_FILE = join(tmpDir, "missing-config.json");
    const result = await handleToolCall("daobrew_detonate", {}, false);
    assert.strictEqual(result.status, "not_entitled");
    assert.strictEqual(result.reason, "missing_license");
    assert.match(result.install_and_pay.checkout_url, /^https?:\/\//);
  });

  it("daobrew_detonate_done validates required args", async () => {
    await assert.rejects(
      () => handleToolCall("daobrew_detonate_done", { cause_id: "x" }, true),
      /requires cause_id and artifact_ref/,
    );
  });

  it("daobrew_schedule_block guards non-macOS platforms", async (t) => {
    if (process.platform === "darwin") return t.skip("macOS — would write a real calendar event");
    const result = await handleToolCall("daobrew_schedule_block", { title: "Test block" }, true);
    assert.strictEqual(result.status, "unsupported_platform");
  });
});

describe("detonate_done — user_acceptance outcome close", () => {
  let tmpDir: string;
  let releaseEnvironment: () => void;

  before(async () => {
    releaseEnvironment = await acquireEnvironmentSuite();
    tmpDir = mkdtempSync(join(tmpdir(), "daobrew-acceptance-"));
    process.env.DAOBREW_GRAPH_DB = join(tmpDir, "missing.db"); // guaranteed absent
    _resetMockDetonator();
  });
  after(() => {
    delete process.env.DAOBREW_GRAPH_DB;
    rmSync(tmpDir, { recursive: true, force: true });
    releaseEnvironment();
  });

  it("tool schema exposes optional user_acceptance without changing required args", () => {
    const done = toolDefinitions.find((tool) => tool.name === "daobrew_detonate_done");
    assert.ok(done);
    const schema = done.inputSchema as any;
    assert.deepStrictEqual(schema.required, ["cause_id", "artifact_ref"]);
    assert.deepStrictEqual(schema.properties.user_acceptance.enum, ["accepted", "edited", "rejected"]);
  });

  it("the brief's close-loop line asks for the optional user_acceptance", async () => {
    const result = await handleToolCall("daobrew_detonate", {}, true);
    assert.match(result.content[0].text as string, /user_acceptance: "accepted" \| "edited" \| "rejected"/);
  });

  it("rejects an invalid user_acceptance value at the tool boundary", async () => {
    await assert.rejects(
      () => handleToolCall(
        "daobrew_detonate_done",
        { cause_id: "x", artifact_ref: "y", user_acceptance: "sideways" },
        true,
      ),
      /accepted.*edited.*rejected/s,
    );
  });

  it("mock close with user_acceptance stays backward compatible", async () => {
    const done = await handleToolCall(
      "daobrew_detonate_done",
      { cause_id: "ghost_ai2_demo_story", artifact_ref: "ai2-demo-story.md", user_acceptance: "accepted" },
      true,
    );
    assert.match(done.content[0].text as string, /completed \(mock\)/);
  });
});

describe("intervention assignment log (thin MRT contracts)", () => {
  // Planted prose/paths: the assignment row is closed-vocabulary + refs only,
  // so none of these strings may ever reach the emitted SQL.
  const ghostProps = {
    status: "armed",
    selected_pattern: "overdrive",
    root_cause_class: "productivity",
    brief: {
      cause: "PLANTED-PROSE the AI2 demo story is unwritten",
      evidence: ["PLANTED-EVIDENCE HR 91 spike during standup"],
      artifact_spec: "PLANTED-SPEC write the demo story",
    },
    artifact_ref: "/tmp/planted-artifact-path.md",
  };
  const base = { userId: DETONATE_TEST_USER, ghostId: "ghost_x", armedAtTs: 1_750_000_000 };

  function fakeExec(log: string[]): (sql: string) => Promise<void> {
    return async (sql: string) => { log.push(sql); };
  }

  it("assignmentId is deterministic: ivn_ prefix + 24 hex, stable across calls", () => {
    const a = assignmentId(base);
    const b = assignmentId(base);
    assert.match(a, /^ivn_[0-9a-f]{24}$/);
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, assignmentId({ ...base, ghostId: "ghost_y" }));
    assert.notStrictEqual(a, assignmentId({ ...base, userId: "other" }));
    assert.notStrictEqual(a, assignmentId({ ...base, armedAtTs: 1_750_000_001 }));
  });

  it("episode key prefers armed_at_ts over created_at_ts (legacy fallback only)", () => {
    // Ghost ids are stable across armings and created_at_ts is PRESERVED on
    // upsert conflict — only the transition-stamped armed_at_ts separates
    // episodes. created_at_ts is the fallback for pre-armed_at_ts legacy rows.
    assert.strictEqual(armedEpisodeTs({ armed_at_ts: 111 }, 100), 111);
    assert.strictEqual(armedEpisodeTs({}, 100), 100);
    assert.strictEqual(armedEpisodeTs({ armed_at_ts: "junk" }, 100), 100);
    assert.strictEqual(armedEpisodeTs({}, null), null);

    // Retry within one arming → SAME id; re-arm (fresh stamp) → NEW id.
    const key = (props: Record<string, any>) =>
      assignmentId({ userId: DETONATE_TEST_USER, ghostId: "ghost_x", armedAtTs: armedEpisodeTs(props, 100) });
    assert.strictEqual(key({ armed_at_ts: 111 }), key({ armed_at_ts: 111 }));
    assert.notStrictEqual(key({ armed_at_ts: 111 }), key({ armed_at_ts: 222 }));
  });

  it("logs one idempotent INSERT carrying the full assignment contract (postgres)", async () => {
    const log: string[] = [];
    const result = await logInterventionAssignment({
      ...base, ghostProps, storeKind: "postgres", exec: fakeExec(log), nowTs: 1_751_000_000,
    });
    assert.strictEqual(result.logged, true);
    assert.strictEqual(log.length, 1);
    const sql = log[0];
    assert.match(sql, /INSERT INTO intervention_assignments/);
    assert.ok(sql.includes(assignmentId(base)));
    assert.match(sql, /'\["task_package"\]'::jsonb/);
    assert.match(sql, /'task_package', 1, 'deterministic_argmax_v1'/);
    assert.match(sql, /'overdrive'/);
    assert.match(sql, /'productivity'/);
    assert.match(sql, /'root:ghost_x'/);
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
    // No prose, no paths — the closed-vocabulary boundary.
    assert.doesNotMatch(sql, /PLANTED/);
    assert.doesNotMatch(sql, /planted-artifact-path/);
  });

  it("missing vocabulary props become NULL columns; the insert still happens", async () => {
    const log: string[] = [];
    const result = await logInterventionAssignment({
      ...base, ghostProps: { status: "armed" }, storeKind: "postgres", exec: fakeExec(log), nowTs: 1,
    });
    assert.strictEqual(result.logged, true);
    assert.match(log[0], /NULL, NULL/);
  });

  it("sqlite store skips assignment logging entirely (warm-tier is postgres-only)", async () => {
    const log: string[] = [];
    const result = await logInterventionAssignment({
      ...base, ghostProps, storeKind: "sqlite", exec: fakeExec(log), nowTs: 1,
    });
    assert.strictEqual(result.logged, false);
    assert.strictEqual(log.length, 0);
  });

  it("a failing exec resolves with a warning — never rejects (fail-soft)", async () => {
    const boom = async () => { throw new Error("pg down"); };
    const logged = await logInterventionAssignment({
      ...base, ghostProps, storeKind: "postgres", exec: boom, nowTs: 1,
    });
    assert.strictEqual(logged.logged, false);
    assert.match(logged.warning ?? "", /pg down/);
    const closed = await closeInterventionAssignment({
      ...base, userAcceptance: "accepted", storeKind: "postgres", exec: boom, nowTs: 1,
    });
    assert.strictEqual(closed.logged, false);
    assert.match(closed.warning ?? "", /pg down/);
  });

  it("close stamps artifact_done + closed_at_ts, and user_acceptance only when given", async () => {
    const log: string[] = [];
    await closeInterventionAssignment({
      ...base, userAcceptance: "edited", storeKind: "postgres", exec: fakeExec(log), nowTs: 1_751_000_100,
    });
    assert.strictEqual(log.length, 1);
    assert.match(log[0], /UPDATE intervention_assignments/);
    assert.match(log[0], /artifact_done = TRUE/);
    assert.match(log[0], /closed_at_ts = 1751000100/);
    assert.match(log[0], /user_acceptance = 'edited'/);
    assert.ok(log[0].includes(`WHERE id = '${assignmentId(base)}'`));

    const bare: string[] = [];
    await closeInterventionAssignment({
      ...base, userAcceptance: null, storeKind: "postgres", exec: fakeExec(bare), nowTs: 2,
    });
    assert.doesNotMatch(bare[0], /user_acceptance/);

    const skipped: string[] = [];
    const result = await closeInterventionAssignment({
      ...base, userAcceptance: "accepted", storeKind: "sqlite", exec: fakeExec(skipped), nowTs: 2,
    });
    assert.strictEqual(result.logged, false);
    assert.strictEqual(skipped.length, 0);
  });
});

describe("detonator — seeded SQLite round-trip", () => {
  const hasCli = sqliteCliPresent();
  let tmpDir: string;
  let dbPath: string;
  let releaseEnvironment: () => void;

  before(async () => {
    releaseEnvironment = await acquireEnvironmentSuite();
    tmpDir = mkdtempSync(join(tmpdir(), "daobrew-graph-"));
    dbPath = join(tmpDir, "sentinel-graph.db");
    process.env.DAOBREW_GRAPH_DB = dbPath;
  });
  after(() => {
    delete process.env.DAOBREW_GRAPH_DB;
    delete process.env.DAOBREW_CONFIG_FILE;
    rmSync(tmpDir, { recursive: true, force: true });
    releaseEnvironment();
  });

  it("seed → detonate → done → re-detonate is a closed, idempotent loop", async (t) => {
    if (!hasCli) return t.skip("sqlite3 CLI not available");

    process.env.DAOBREW_CONFIG_FILE = writeLicenseConfig(tmpDir, { user_id: DETONATE_TEST_USER });
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    execFileSync(process.execPath, [SEED_SCRIPT], { env: { ...process.env, DAOBREW_GRAPH_DB: dbPath } });
    assert.ok(existsSync(dbPath), "seed script should create the DB");
    // Re-seed must not duplicate or fail (INSERT OR IGNORE / REPLACE)
    execFileSync(process.execPath, [SEED_SCRIPT], { env: { ...process.env, DAOBREW_GRAPH_DB: dbPath } });

    const brief = await handleToolCall("daobrew_detonate", {}, false);
    const briefText = brief.content[0].text as string;
    assert.match(briefText, /cause_id: ghost_ai2_demo_story/);
    assert.match(briefText, /AI2/);
    assert.ok(brief.__local_data__, "local DB data must skip the mock banner");

    const done = await handleToolCall(
      "daobrew_detonate_done",
      { cause_id: "ghost_ai2_demo_story", artifact_ref: "/tmp/ai2-demo-story.md", user_acceptance: "edited" },
      false,
    );
    assert.match(done.content[0].text as string, /Sentinel action package completed/);

    // Optional Y_primary signal persists into ghost props on BOTH stores.
    const acceptance = execFileSync(
      "sqlite3",
      [dbPath, "SELECT json_extract(props_json,'$.user_acceptance') FROM graph_nodes WHERE id='ghost_ai2_demo_story'"],
      { encoding: "utf-8" },
    ).trim();
    assert.strictEqual(acceptance, "edited");

    const status = execFileSync(
      "sqlite3",
      [dbPath, "SELECT json_extract(props_json,'$.status') || '|' || json_extract(props_json,'$.artifact_ref') FROM graph_nodes WHERE id='ghost_ai2_demo_story'"],
      { encoding: "utf-8" },
    ).trim();
    assert.strictEqual(status, "done|/tmp/ai2-demo-story.md");

    // D6: detonate_done stamps done_at_ts (epoch seconds) alongside status/artifact_ref
    const doneAt = execFileSync(
      "sqlite3",
      [dbPath, "SELECT json_extract(props_json,'$.done_at_ts') FROM graph_nodes WHERE id='ghost_ai2_demo_story'"],
      { encoding: "utf-8" },
    ).trim();
    assert.match(doneAt, /^\d+$/, "done_at_ts must be stamped as an integer epoch");
    const doneAtNum = Number(doneAt);
    assert.ok(Math.abs(doneAtNum - Math.floor(Date.now() / 1000)) < 300, "done_at_ts must be roughly now, in seconds");

    const causedEdges = execFileSync(
      "sqlite3",
      [dbPath, "SELECT count(*) FROM graph_edges WHERE dst_id='ghost_ai2_demo_story' AND kind='caused'"],
      { encoding: "utf-8" },
    ).trim();
    assert.strictEqual(causedEdges, "1");

    const again = await handleToolCall("daobrew_detonate", {}, false);
    assert.match(again.content[0].text as string, /No ready Sentinel action package/);

    // Re-seed re-arms the ghost and clears the completion edge (fresh video take)
    execFileSync(process.execPath, [SEED_SCRIPT], { env: { ...process.env, DAOBREW_GRAPH_DB: dbPath } });
    const rearmed = await handleToolCall("daobrew_detonate", {}, false);
    assert.match(rearmed.content[0].text as string, /cause_id: ghost_ai2_demo_story/);

    // Backward compat on disk: closing WITHOUT user_acceptance stamps no key.
    await handleToolCall(
      "daobrew_detonate_done",
      { cause_id: "ghost_ai2_demo_story", artifact_ref: "/tmp/ai2-demo-story-take2.md" },
      false,
    );
    const bare = execFileSync(
      "sqlite3",
      [dbPath, "SELECT COALESCE(json_extract(props_json,'$.user_acceptance'),'ABSENT') FROM graph_nodes WHERE id='ghost_ai2_demo_story'"],
      { encoding: "utf-8" },
    ).trim();
    assert.strictEqual(bare, "ABSENT");
  });
});

// ---------------------------------------------------------------------------
// RLS deferred wiring (plan 2026-07-06, Task 2): the tool layer must resolve
// its OWN identity — under RLS it cannot learn the user from rows it cannot
// see — and every graph read/write in the detonate handlers must carry the
// session GUC when the store is Postgres. The transport is faked with the
// compiled-CJS export-swap idiom from tests/user-scope.test.ts, so no real
// Postgres (local or Neon) is ever touched. SQLite behavior is pinned
// byte-identical (the seeded round-trip above is the deeper regression net).
// ---------------------------------------------------------------------------

/** Keep in sync with postgres-rls.ts RLS_GUC and user-scope.ts. */
const GUC = "app.daobrew_user_id";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

interface CapturedSql {
  queries: string[];
  execs: string[];
}

/** Armed ghost row whose user_id deliberately DIFFERS from the tool-layer
 *  identity: the QUERY scope must come from toolUserId(), while the
 *  assignment payload keeps reading rows[0].user_id. */
const ARMED_GHOST_ROW = {
  id: "ghost_pg_scope",
  user_id: DETONATE_ROW_USER,
  created_at_ts: 1_750_000_000,
  title: "PG scope test thread",
  props_json: {
    status: "armed",
    armed_at_ts: 1_750_000_100,
    selected_pattern: "overdrive",
    root_cause_class: "productivity",
    brief: { cause: "the thread", evidence: ["evidence line"], artifact_spec: "write the thing" },
  },
};

async function withFakedGraphTransport(
  opts: {
    rows: Record<string, any>[];
    store: "postgres" | "sqlite";
    configUserId?: string;
    envUserId?: string;
  },
  fn: (captured: CapturedSql) => Promise<void>,
): Promise<void> {
  const mod = graphDb as any;
  const realExec = mod.execSql;
  const realQuery = mod.queryJson;
  const realExists = mod.graphDbExists;
  const savedEnv = {
    DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
    DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
    DAOBREW_USER_ID: process.env.DAOBREW_USER_ID,
  };
  const tmp = mkdtempSync(join(tmpdir(), "daobrew-pg-scope-"));
  const captured: CapturedSql = { queries: [], execs: [] };
  mod.queryJson = async (sql: string) => {
    captured.queries.push(sql);
    return opts.rows;
  };
  mod.execSql = async (sql: string) => {
    captured.execs.push(sql);
  };
  mod.graphDbExists = () => true;
  try {
    // License config lets the non-mock entitlement gate pass; the optional
    // tool-layer user_id rides in the same file.
    process.env.DAOBREW_CONFIG_FILE = writeLicenseConfig(
      tmp,
      opts.configUserId === undefined ? undefined : { user_id: opts.configUserId },
    );
    if (opts.envUserId === undefined) delete process.env.DAOBREW_USER_ID;
    else process.env.DAOBREW_USER_ID = opts.envUserId;
    process.env.DAOBREW_GRAPH_STORE = opts.store;
    __resetGraphDbConfigCacheForTests();
    await fn(captured);
  } finally {
    mod.execSql = realExec;
    mod.queryJson = realQuery;
    mod.graphDbExists = realExists;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetGraphDbConfigCacheForTests();
    rmSync(tmp, { recursive: true, force: true });
  }
}

function assertScopedQueryOnce(sql: string, userId: string, label: string): void {
  // Query path: transaction-local set_config inside scopedQuery's lateral
  // SELECT (the autocommit statement's implicit transaction scopes it).
  assert.strictEqual(
    occurrences(sql, `set_config('${GUC}', '${userId}', true)`),
    1,
    `${label}: must carry the GUC for '${userId}' exactly once, got: ${sql}`,
  );
  assert.strictEqual(
    occurrences(sql, "set_config"),
    1,
    `${label}: set_config must appear exactly once per statement batch, got: ${sql}`,
  );
}

function assertScopedExecOnce(sql: string, userId: string, label: string): void {
  // Exec path: scopedExec's single BEGIN/set_config(is_local=true)/COMMIT
  // transaction — one pooled backend, no session GUC leakage after COMMIT.
  assert.ok(sql.startsWith("BEGIN;"), `${label}: exec must open the scoped transaction, got: ${sql}`);
  assert.ok(sql.trimEnd().endsWith("COMMIT;"), `${label}: exec must commit the scoped transaction, got: ${sql}`);
  assert.strictEqual(
    occurrences(sql, `set_config('${GUC}', '${userId}', true)`),
    1,
    `${label}: must carry the transaction-local GUC for '${userId}' exactly once, got: ${sql}`,
  );
  assert.strictEqual(
    occurrences(sql, "set_config"),
    1,
    `${label}: set_config must appear exactly once per statement batch, got: ${sql}`,
  );
}

describe("tool-layer identity (toolUserId)", () => {
  let tmpDir: string;
  const savedEnv = { user: undefined as string | undefined, config: undefined as string | undefined };
  let releaseEnvironment: () => void;

  before(async () => {
    releaseEnvironment = await acquireEnvironmentSuite();
    tmpDir = mkdtempSync(join(tmpdir(), "daobrew-tool-id-"));
    savedEnv.user = process.env.DAOBREW_USER_ID;
    savedEnv.config = process.env.DAOBREW_CONFIG_FILE;
  });
  after(() => {
    if (savedEnv.user === undefined) delete process.env.DAOBREW_USER_ID;
    else process.env.DAOBREW_USER_ID = savedEnv.user;
    if (savedEnv.config === undefined) delete process.env.DAOBREW_CONFIG_FILE;
    else process.env.DAOBREW_CONFIG_FILE = savedEnv.config;
    rmSync(tmpDir, { recursive: true, force: true });
    releaseEnvironment();
  });

  it("resolves env > config user_id and fails closed without a canonical UUID", () => {
    // Nothing set anywhere → fail closed.
    delete process.env.DAOBREW_USER_ID;
    process.env.DAOBREW_CONFIG_FILE = join(tmpDir, "missing-config.json");
    assert.strictEqual(process.env.DAOBREW_USER_ID, undefined);
    assert.throws(() => toolUserId(), /no canonical UUID identity/);

    // Config user_id is the fallback when the env var is absent.
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ user_id: DETONATE_TEST_USER.toLowerCase() }));
    process.env.DAOBREW_CONFIG_FILE = configPath;
    assert.strictEqual(toolUserId(), DETONATE_TEST_USER);

    // Env wins over config; whitespace-only env fails closed instead of falling
    // through to config.
    process.env.DAOBREW_USER_ID = DETONATE_ENV_USER.toLowerCase();
    assert.strictEqual(toolUserId(), DETONATE_ENV_USER);
    process.env.DAOBREW_USER_ID = "   ";
    assert.throws(() => toolUserId(), /no canonical UUID identity/);

    // Blank config user_id also means unset → fail closed.
    delete process.env.DAOBREW_USER_ID;
    writeFileSync(configPath, JSON.stringify({ user_id: "   " }));
    assert.throws(() => toolUserId(), /no canonical UUID identity/);
  });
});

describe("detonator — postgres tool-layer scoping (faked transport)", () => {
  let releaseEnvironment: () => void;

  before(async () => {
    releaseEnvironment = await acquireEnvironmentSuite();
  });

  after(() => {
    releaseEnvironment();
  });
  it("detonate scopes the armed-ghost SELECT and the assignment INSERT with the config user", async () => {
    await withFakedGraphTransport(
      { rows: [ARMED_GHOST_ROW], store: "postgres", configUserId: DETONATE_TEST_USER },
      async (captured) => {
        const result = await handleToolCall("daobrew_detonate", {}, false);
        assert.match(result.content[0].text as string, /cause_id: ghost_pg_scope/);

        assert.strictEqual(captured.queries.length, 1, "detonate must issue exactly one SELECT");
        assertScopedQueryOnce(captured.queries[0], DETONATE_TEST_USER, "armed-ghost SELECT");
        assert.match(captured.queries[0], /FROM graph_nodes/);

        assert.strictEqual(captured.execs.length, 1, "detonate must issue exactly one assignment INSERT");
        assertScopedExecOnce(captured.execs[0], DETONATE_TEST_USER, "assignment INSERT");
        assert.match(captured.execs[0], /INSERT INTO intervention_assignments/);
        // The assignment payload still reads the row's user_id — only the
        // query/exec SCOPE comes from the tool-layer identity.
        assert.ok(
          captured.execs[0].includes(`'${DETONATE_ROW_USER}'`),
          `assignment payload user_id must still come from rows[0].user_id, got: ${captured.execs[0]}`,
        );
      },
    );
  });

  it("DAOBREW_USER_ID env overrides the config user for scoping", async () => {
    await withFakedGraphTransport(
      { rows: [ARMED_GHOST_ROW], store: "postgres", configUserId: DETONATE_TEST_USER, envUserId: DETONATE_ENV_USER },
      async (captured) => {
        await handleToolCall("daobrew_detonate", {}, false);
        assertScopedQueryOnce(captured.queries[0], DETONATE_ENV_USER, "armed-ghost SELECT (env override)");
        assertScopedExecOnce(captured.execs[0], DETONATE_ENV_USER, "assignment INSERT (env override)");
      },
    );
  });

  it("detonate_done scopes the SELECT, the UPDATE/edge-INSERT batch, and the outcome close — one GUC each", async () => {
    await withFakedGraphTransport(
      { rows: [ARMED_GHOST_ROW], store: "postgres", configUserId: DETONATE_TEST_USER },
      async (captured) => {
        const done = await handleToolCall(
          "daobrew_detonate_done",
          { cause_id: "ghost_pg_scope", artifact_ref: "/tmp/pg-scope.md", user_acceptance: "accepted" },
          false,
        );
        assert.match(done.content[0].text as string, /Sentinel action package completed/);

        assert.strictEqual(captured.queries.length, 1, "detonate_done must issue exactly one SELECT");
        assertScopedQueryOnce(captured.queries[0], DETONATE_TEST_USER, "ghost SELECT");

        assert.strictEqual(captured.execs.length, 2, "detonate_done must issue the close batch then the assignment close");
        const batch = captured.execs[0];
        assert.match(batch, /UPDATE graph_nodes/);
        assert.match(batch, /INSERT INTO graph_edges/);
        assertScopedExecOnce(batch, DETONATE_TEST_USER, "UPDATE/edge-INSERT batch");

        const close = captured.execs[1];
        assert.match(close, /UPDATE intervention_assignments/);
        assertScopedExecOnce(close, DETONATE_TEST_USER, "assignment close");
      },
    );
  });

  it("sqlite store composes byte-identical unscoped SQL — no set_config anywhere", async () => {
    await withFakedGraphTransport(
      { rows: [ARMED_GHOST_ROW], store: "sqlite", configUserId: DETONATE_TEST_USER, envUserId: DETONATE_ENV_USER },
      async (captured) => {
        await handleToolCall("daobrew_detonate", {}, false);
        await handleToolCall(
          "daobrew_detonate_done",
          { cause_id: "ghost_pg_scope", artifact_ref: "/tmp/pg-scope.md" },
          false,
        );
        const all = [...captured.queries, ...captured.execs];
        assert.ok(all.length > 0, "handlers must reach the transport");
        for (const sql of all) {
          assert.ok(!sql.includes("set_config"), `sqlite SQL must never carry the GUC, got: ${sql}`);
          assert.ok(!sql.includes("__daobrew_scope"), `sqlite SQL must never be wrapped, got: ${sql}`);
        }
        // Byte-identical pin: the SELECTs are the raw statements, unwrapped.
        assert.ok(
          captured.queries[0].trimStart().startsWith("SELECT id, user_id, created_at_ts, title, props_json FROM graph_nodes"),
          `sqlite detonate SELECT must be the raw statement, got: ${captured.queries[0]}`,
        );
        // sqlite skips assignment logging entirely (warm-tier is postgres-only),
        // so the only exec is detonate_done's UPDATE + edge-INSERT batch.
        assert.strictEqual(captured.execs.length, 1);
        assert.match(captured.execs[0], /INSERT OR IGNORE INTO graph_edges/);
      },
    );
  });
});
});
