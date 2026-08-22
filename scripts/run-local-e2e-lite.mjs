#!/usr/bin/env node
// Local E2E Lite harness for the DaoBrew Data Manager.
//
// Runs the engine without --demo, using seeded local source rows plus either a
// fake local backend or the configured real backend. The shared DB path backs up
// the existing Sentinel graph files before writing.

import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const DIST_RUN = "../dist/src/engine/run.js";
const DIST_TOOLS = "../dist/src/tools.js";
const DIST_SCHEMA = "../dist/src/engine/schema.js";
const DIST_GRAPH_DB = "../dist/src/graph-db.js";
const DIST_REASONER = "../dist/src/engine/reasoner/Reasoner.js";
const DIST_IDENTITY = "../dist/src/identity.js";
const SOURCE_FIXTURE_SCRIPT = new URL("./seed-local-source-fixture.mjs", import.meta.url).pathname;
const DEFAULT_SYNTHETIC_USER_ID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const CANONICAL_USER_ID = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/u;

function usage() {
  return [
    "Usage: node scripts/run-local-e2e-lite.mjs (--temp-db|--postgres-db) --fake-backend [--user-id UUID] (--leave-armed|--close-loop)",
    "       node scripts/run-local-e2e-lite.mjs --identity-probe --user-id UUID",
    "",
    "Examples:",
    "  node scripts/run-local-e2e-lite.mjs --temp-db --fake-backend --close-loop",
    `  node scripts/run-local-e2e-lite.mjs --postgres-db --fake-backend --user-id ${DEFAULT_SYNTHETIC_USER_ID} --close-loop`,
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    dbMode: null,
    backendMode: null,
    userId: DEFAULT_SYNTHETIC_USER_ID,
    finalMode: null,
    identityProbe: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--temp-db") options.dbMode = "temp";
    else if (arg === "--shared-db") options.dbMode = "shared";
    else if (arg === "--postgres-db") options.dbMode = "postgres";
    else if (arg === "--fake-backend") options.backendMode = "fake";
    else if (arg === "--real-backend") options.backendMode = "real";
    else if (arg === "--identity-probe") options.identityProbe = true;
    else if (arg === "--leave-armed") options.finalMode = "leave_armed";
    else if (arg === "--close-loop") options.finalMode = "close_loop";
    else if (arg === "--user-id") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error("--user-id requires a value");
      options.userId = value;
      i += 1;
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!CANONICAL_USER_ID.test(options.userId)) {
    throw new Error("--user-id must be a canonical uppercase UUID");
  }
  if (options.identityProbe) {
    if (options.dbMode || options.backendMode || options.finalMode) {
      throw new Error("--identity-probe cannot be combined with DB, backend, or loop options");
    }
    return options;
  }
  if (!options.dbMode) throw new Error("Choose exactly one DB mode: --temp-db or --postgres-db");
  if (!options.backendMode) throw new Error("Choose exactly one backend mode: --fake-backend or --real-backend");
  if (!options.finalMode) throw new Error("Choose exactly one final mode: --leave-armed or --close-loop");
  const dbModeCount = ["--temp-db", "--shared-db", "--postgres-db"].filter((flag) => argv.includes(flag)).length;
  if (dbModeCount > 1) {
    throw new Error("Choose only one DB mode: --temp-db, --shared-db, or --postgres-db");
  }
  if (argv.includes("--fake-backend") && argv.includes("--real-backend")) {
    throw new Error("Choose only one backend mode: --fake-backend or --real-backend");
  }
  if (argv.includes("--leave-armed") && argv.includes("--close-loop")) {
    throw new Error("Choose only one final mode: --leave-armed or --close-loop");
  }
  if (options.dbMode === "shared") throw new Error("--shared-db is unavailable in the synthetic-owner E2E harness");
  if (options.backendMode === "real") throw new Error("--real-backend is unavailable in the synthetic-owner E2E harness");

  return options;
}

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build before this harness. ${err.message}`);
  }
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqliteJson(dbPath, sql) {
  const out = execFileSync("sqlite3", ["-cmd", ".timeout 5000", "-json", dbPath, sql], {
    encoding: "utf-8",
  }).trim();
  return out ? JSON.parse(out) : [];
}

async function sourceCounts(queryJson, userId) {
  const rows = await queryJson(
    `SELECT
       (SELECT count(*) FROM events WHERE user_id=${sqlString(userId)}) AS events,
       (SELECT count(*) FROM meeting_notes WHERE user_id=${sqlString(userId)}) AS meeting_notes,
       (SELECT count(*) FROM user_insights WHERE user_id=${sqlString(userId)}) AS user_insights;`,
  );
  return rows[0] ?? { events: 0, meeting_notes: 0, user_insights: 0 };
}

async function graphSummary(queryJson, storeKind, userId, rootId) {
  const rootStatusExpr = storeKind === "postgres"
    ? "props_json ->> 'status'"
    : "json_extract(props_json, '$.status')";
  const artifactRefExpr = storeKind === "postgres"
    ? "props_json ->> 'artifact_ref'"
    : "json_extract(props_json, '$.artifact_ref')";
  const rows = await queryJson(
    `SELECT
       (SELECT count(*) FROM graph_nodes WHERE user_id=${sqlString(userId)}) AS nodes,
       (SELECT count(*) FROM graph_edges WHERE user_id=${sqlString(userId)}) AS edges,
       (SELECT ${rootStatusExpr} FROM graph_nodes WHERE id=${sqlString(rootId)} AND user_id=${sqlString(userId)}) AS root_status,
       (SELECT ${artifactRefExpr} FROM graph_nodes WHERE id=${sqlString(rootId)} AND user_id=${sqlString(userId)}) AS artifact_ref;`,
  );
  return rows[0] ?? { nodes: 0, edges: 0, root_status: null, artifact_ref: null };
}

function sharedDbPath() {
  return join(homedir(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db");
}

function prepareDb(dbMode) {
  if (dbMode === "postgres") {
    return {
      mode: "postgres",
      path: null,
      temp_dir: null,
      backup: null,
      compose_project: process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai",
      database: process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth",
    };
  }

  if (dbMode === "temp") {
    const tempDir = mkdtempLite("daobrew-local-e2e-");
    return {
      mode: "temp",
      path: join(tempDir, "sentinel-graph.db"),
      temp_dir: tempDir,
      backup: null,
    };
  }

  const dbPath = sharedDbPath();
  return {
    mode: "shared",
    path: dbPath,
    temp_dir: null,
    backup: backupSharedDb(dbPath),
  };
}

function mkdtempLite(prefix) {
  const root = process.env.DAOBREW_E2E_TMP_ROOT || tmpdir();
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, prefix));
}

function provisionSyntheticConfirmedHome(userId, issuerUrl) {
  const home = mkdtempLite("daobrew-local-e2e-home-");
  const configDirectory = join(home, ".daobrew");
  const configPath = join(configDirectory, "config.json");
  mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
  chmodSync(configDirectory, 0o700);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const licensePayload = Buffer.from(JSON.stringify({
    iss: "daobrew",
    aud: "sentinel",
    sub: "synthetic-e2e-owner",
    tier: "physician",
    status: "active",
    exp: Math.floor(Date.now() / 1_000) + 3_600,
  })).toString("base64url");
  const signed = `dbw_v1.${licensePayload}`;
  const licenseKey = `${signed}.${sign(
    null,
    Buffer.from(signed, "utf8"),
    privateKey,
  ).toString("base64url")}`;
  writeFileSync(configPath, JSON.stringify({
    user_id: userId,
    device_credential: `dbd_e2e_${userId.replaceAll("-", "").toLowerCase()}`,
    device_credential_confirmed: true,
    api_url: issuerUrl,
    license_key: licenseKey,
    entitlement_public_key: publicKey.export({
      type: "spki",
      format: "pem",
    }),
  }), { mode: 0o600 });
  return { home, configPath };
}

function installFakeCurlShim(home, fakeHttpUrl) {
  const binDirectory = join(home, "bin");
  const shimPath = join(binDirectory, "curl");
  const realCurl = execFileSync("which", ["curl"], { encoding: "utf-8" }).trim();
  const fakeHttpsUrl = fakeHttpUrl.replace(/^http:/u, "https:");
  mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(shimPath, `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const source = ${JSON.stringify(fakeHttpsUrl)};
const destination = ${JSON.stringify(fakeHttpUrl)};
const args = process.argv.slice(2).map((arg) => arg.startsWith(source)
  ? destination + arg.slice(source.length)
  : arg);
const child = spawn(${JSON.stringify(realCurl)}, args, { stdio: ["pipe", "inherit", "inherit"] });
process.stdin.pipe(child.stdin);
child.on("error", (error) => { console.error(error.message); process.exit(1); });
child.on("close", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
`, { mode: 0o700 });
  chmodSync(shimPath, 0o700);
  return { binDirectory, fakeHttpsUrl };
}

function backupSharedDb(dbPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(dirname(dbPath), "backups", `sentinel-graph-${stamp}`);
  const files = [];

  for (const src of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!existsSync(src)) continue;
    mkdirSync(backupDir, { recursive: true });
    const dst = join(backupDir, basename(src));
    copyFileSync(src, dst);
    files.push(dst);
  }

  return files.length ? { dir: backupDir, files } : null;
}

function seedLocalSources(db, userId) {
  execFileSync(process.execPath, [SOURCE_FIXTURE_SCRIPT], {
    env: {
      ...process.env,
      ...(db.path ? { DAOBREW_GRAPH_DB: db.path } : {}),
      DAOBREW_FIXTURE_USER_ID: userId,
    },
    encoding: "utf-8",
  });
}

async function resetHarnessRows(execSql, userId) {
  await execSql(
    `DELETE FROM graph_edges WHERE user_id = ${sqlString(userId)};
     DELETE FROM graph_nodes WHERE user_id = ${sqlString(userId)};
     DELETE FROM events WHERE user_id = ${sqlString(userId)};
     DELETE FROM meeting_notes WHERE user_id = ${sqlString(userId)};
     DELETE FROM user_insights WHERE user_id = ${sqlString(userId)};`,
  );
}

function makeMetricHistory(metric, range) {
  const sampleTs = new Date(1040 * 1000).toISOString();
  const values = {
    heart_rate: 94,
    heart_rate_variability: 28,
    resting_heart_rate: 72,
    respiratory_rate: 18,
    step_count: 40,
    active_energy_burned: 12,
  };
  const value = values[metric] ?? 1;
  return {
    metric,
    range,
    samples: [{ value, timestamp: sampleTs }],
    aggregated: { avg: value, min: value, max: value },
  };
}

async function startFakeBackend() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let data;

    if (url.pathname === "/api/v1/device/health/history") {
      data = makeMetricHistory(url.searchParams.get("metric") ?? "heart_rate", url.searchParams.get("range") ?? "week");
    } else if (url.pathname === "/api/v1/state/history") {
      const limit = Number(url.searchParams.get("limit") ?? 24);
      data = {
        states: [{
          bucket_ts: 1040,
          yin_score: 34,
          yang_score: 86,
          category: "pushing_it",
          source_quality: "fake_backend_e2e",
          updated_at_ts: 1050,
        }],
        total_count: 1,
        limit,
      };
    } else {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, error: { message: `Unhandled fake backend path: ${url.pathname}` } }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, data }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake backend failed to bind a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function parseCauseId(detonatorResult) {
  const text = String(detonatorResult?.content?.[0]?.text ?? "");
  return /^cause_id:\s*(\S+)/m.exec(text)?.[1] ?? null;
}

async function runHarness() {
  const options = parseArgs(process.argv.slice(2));
  const incomingHome = process.env.HOME ?? homedir();
  const previousEnv = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    DAOBREW_USER_ID: process.env.DAOBREW_USER_ID,
    DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
    DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
    DAOBREW_GRAPH_DB: process.env.DAOBREW_GRAPH_DB,
    DAOBREW_API_KEY: process.env.DAOBREW_API_KEY,
    DAOBREW_API_URL: process.env.DAOBREW_API_URL,
  };
  let fakeBackend = null;
  let syntheticOwner = null;

  try {
    if (!options.identityProbe) fakeBackend = await startFakeBackend();
    const issuerUrl = fakeBackend
      ? fakeBackend.baseUrl.replace(/^http:/u, "https:")
      : "https://synthetic-owner.test.invalid/api/v1";
    syntheticOwner = provisionSyntheticConfirmedHome(options.userId, issuerUrl);
    process.env.HOME = syntheticOwner.home;
    process.env.DAOBREW_USER_ID = options.userId;
    process.env.DAOBREW_CONFIG_FILE = syntheticOwner.configPath;
    if (fakeBackend) {
      const shim = installFakeCurlShim(syntheticOwner.home, fakeBackend.baseUrl);
      process.env.PATH = `${shim.binDirectory}:${previousEnv.PATH ?? ""}`;
      process.env.DAOBREW_API_KEY = "synthetic-local-e2e-key";
      process.env.DAOBREW_API_URL = shim.fakeHttpsUrl;
    }

    if (options.identityProbe) {
      const { loadConfirmedTaskMapOwner } = requireDist(DIST_IDENTITY);
      const plan = await loadConfirmedTaskMapOwner(homedir(), {
        userId: options.userId,
      });
      if (!plan.ok) throw new Error(plan.reason);
      return {
        status: "identity_probe",
        user_id: plan.owner.userId,
        decoy_home_ignored: plan.owner.homeDirectory !== incomingHome
          && plan.owner.homeDirectory === syntheticOwner.home,
      };
    }

    const { runEngineOnce } = requireDist(DIST_RUN);
    const { handleToolCall } = requireDist(DIST_TOOLS);
    const { ensureSchema } = requireDist(DIST_SCHEMA);
    const graphDb = requireDist(DIST_GRAPH_DB);
    const { rootCauseId } = requireDist(DIST_REASONER);
    const db = prepareDb(options.dbMode);
    if (options.dbMode === "postgres") {
      process.env.DAOBREW_GRAPH_STORE = "postgres";
      delete process.env.DAOBREW_GRAPH_DB;
    } else {
      process.env.DAOBREW_GRAPH_STORE = "sqlite";
      process.env.DAOBREW_GRAPH_DB = db.path;
    }
    ensureSchema(db.path ?? undefined);
    if (options.dbMode === "postgres") await resetHarnessRows(graphDb.execSql, options.userId);
    seedLocalSources(db, options.userId);

    const before = await sourceCounts(graphDb.queryJson, options.userId);
    const engine = await runEngineOnce({ once: true });
    if (engine.demo) throw new Error("Harness invariant failed: engine reported demo=true");
    if (engine.status === "no_signal") {
      throw new Error(`Engine produced no graph signal; warnings: ${(engine.warnings ?? []).join("; ")}`);
    }
    if (!engine.root_armed || !engine.armed_node_id) {
      throw new Error(`Engine did not arm a root cause: ${JSON.stringify(engine)}`);
    }

    const expectedRootId = rootCauseId(options.userId);
    const detonate = await handleToolCall(
      "daobrew_detonate",
      { cause_id: expectedRootId },
    );
    const causeId = parseCauseId(detonate);
    if (causeId !== expectedRootId) {
      throw new Error(`Detonator read ${causeId ?? "no cause_id"}, expected ${expectedRootId}`);
    }

    let closeLoop = null;
    if (options.finalMode === "close_loop") {
      const artifactRef = join(db.temp_dir ?? (db.path ? dirname(db.path) : tmpdir()), "local-e2e-lite-artifact.md");
      const done = await handleToolCall(
        "daobrew_detonate_done",
        { cause_id: causeId, artifact_ref: artifactRef },
      );
      closeLoop = { artifact_ref: artifactRef, text: String(done?.content?.[0]?.text ?? "") };
    }

    const rootId = expectedRootId;
    const graph = await graphSummary(graphDb.queryJson, graphDb.graphStoreKind(), options.userId, rootId);
    const expectedStatus = options.finalMode === "close_loop" ? "done" : "armed";
    if (graph.root_status !== expectedStatus) {
      throw new Error(`Expected root status ${expectedStatus}, found ${graph.root_status ?? "null"}`);
    }
    const truthPayload = JSON.stringify({
      armed_node_id: engine.armed_node_id,
      graph,
      causeId,
    });
    if (/ghost_ai2|ai2_demo|AI2 demo readiness/iu.test(truthPayload)) {
      throw new Error("Synthetic E2E produced a fixed showcase identifier");
    }

    return {
      status: options.finalMode === "close_loop" ? "closed" : "armed",
      db,
      backend: {
        mode: options.backendMode,
        fake_url: fakeBackend?.baseUrl,
      },
      user_id: options.userId,
      source_rows: before,
      engine,
      detonator: {
        cause_id: causeId,
        local_data: !!detonate.__local_data__,
      },
      close_loop: closeLoop,
      graph,
    };
  } finally {
    if (fakeBackend) await fakeBackend.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (syntheticOwner) {
      rmSync(syntheticOwner.home, { recursive: true, force: true });
    }
  }
}

runHarness()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }, null, 2));
    process.exit(1);
  });
