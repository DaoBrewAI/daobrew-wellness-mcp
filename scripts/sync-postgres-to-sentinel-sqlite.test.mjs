import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
  DEFAULT_BACKUP_RETENTION,
  STAGING_BACKUP_STALE_MS,
  assertRowsBelongToUser,
  assertSnapshotIntegrity,
  backupSqliteDb,
  parseArgs,
  readBackendConfig,
  readBackendGraphRows,
  reclaimStaleBackupStaging,
  runCausalThroughBackend,
  runMirror,
  secureSqliteArtifacts,
  writeSqliteRows,
} from "./sync-postgres-to-sentinel-sqlite.mjs";

const tempDirs = [];
const MANAGED_BACKUP_DIR_RE =
  /^(?:backend-api|postgres-bridge)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/;
const DEVICE_CREDENTIAL = "dbd_fixture_device_credential_123456789";
const GENERATION_ID = "generation-fixture-1";

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "daobrew-api-mirror-test-"));
  tempDirs.push(dir);
  return join(dir, "sentinel-graph.db");
}

async function waitForFile(path, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${basename(path)}`);
    await delay(10);
  }
}

function sqlite(dbPath, sql, json = false) {
  const args = ["-bail"];
  if (json) args.push("-json");
  args.push(dbPath, sql);
  const out = execFileSync("sqlite3", args, { encoding: "utf-8" }).trim();
  return json ? (out ? JSON.parse(out) : []) : out;
}

function createGraphSchema(dbPath) {
  sqlite(dbPath, `
    PRAGMA journal_mode=WAL;
    CREATE TABLE graph_nodes(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('pattern','meeting','episode','theme','ghost','prediction','intervention','memory_hit')),
      title TEXT NOT NULL,
      subtitle TEXT,
      element TEXT,
      occurred_at_ts INTEGER,
      source TEXT,
      source_ref TEXT,
      props_json TEXT NOT NULL DEFAULT '{}',
      created_at_ts INTEGER NOT NULL
    );
    CREATE TABLE graph_edges(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      src_id TEXT NOT NULL,
      dst_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('triggered','manifested','tagged','clusters','suggests','evidence_for','predicts','caused','relates_to')),
      label TEXT,
      weight REAL DEFAULT 1.0,
      props_json TEXT DEFAULT '{}',
      created_at_ts INTEGER NOT NULL
    );
  `);
}

function seedOldGraph(dbPath) {
  sqlite(dbPath, `
    INSERT INTO graph_nodes(id,user_id,kind,title,props_json,created_at_ts) VALUES
      ('old-local','local','pattern','old local','{}',1),
      ('old-other','other-user','ghost','old other','{"status":"armed"}',2);
    INSERT INTO graph_edges(id,user_id,src_id,dst_id,kind,props_json,created_at_ts)
      VALUES ('old-edge','other-user','old-local','old-other','caused','{}',3);
  `);
}

function seedManagedBackupDirs(dbPath, count) {
  const backupsRoot = join(dirname(dbPath), "backups");
  mkdirSync(backupsRoot, { recursive: true });
  for (let i = 1; i <= count; i += 1) {
    const day = String(i).padStart(2, "0");
    const prefix = i <= 2 ? "postgres-bridge" : "backend-api";
    mkdirSync(join(backupsRoot, `${prefix}-2020-01-${day}T00-00-00-000Z`));
  }
  mkdirSync(join(backupsRoot, "manual-backup"));
  mkdirSync(join(backupsRoot, "postgres-bridge-not-managed"));
  return backupsRoot;
}

function managedBackupNames(backupsRoot) {
  return readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && MANAGED_BACKUP_DIR_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function seedStagingDir(backupsRoot, pid, unique, mtimeMs) {
  const path = join(backupsRoot, `.staging-backend-api-${pid}-${unique}`);
  mkdirSync(path, { recursive: true });
  const time = new Date(mtimeMs);
  utimesSync(path, time, time);
  return path;
}

function currentRows(userId = "user-123") {
  return {
    nodes: [
      {
        id: "current-pattern",
        user_id: userId,
        kind: "pattern",
        title: "current pattern",
        subtitle: null,
        element: "wood",
        occurred_at_ts: 100,
        source: "engine",
        source_ref: "pattern-1",
        props_json: { safe: true },
        created_at_ts: 101,
      },
      {
        id: "current-ghost",
        user_id: userId,
        kind: "ghost",
        title: "current ghost",
        subtitle: null,
        element: null,
        occurred_at_ts: 102,
        source: "engine",
        source_ref: "ghost-1",
        props_json: { status: "watching" },
        created_at_ts: 103,
      },
    ],
    edges: [
      {
        id: "current-edge",
        user_id: userId,
        src_id: "current-pattern",
        dst_id: "current-ghost",
        kind: "suggests",
        label: null,
        weight: 0.8,
        props_json: {},
        created_at_ts: 104,
      },
    ],
    ghostStatusCounts: [{ status: "watching", count: 1 }],
  };
}

function snapshotData(userId = "user-123", overrides = {}) {
  const rows = currentRows(userId);
  return {
    generation_id: GENERATION_ID,
    schema_version: 1,
    principal: { user_id: userId },
    nodes: rows.nodes,
    edges: rows.edges,
    ghost_status_counts: rows.ghostStatusCounts,
    ...overrides,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function backendDependencies(data, requests = [], credential = DEVICE_CREDENTIAL) {
  return {
    readBackendConfig: () => ({
      apiUrl: "https://api.example.test/api/v1",
      credential,
    }),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(data);
    },
  };
}

function sqliteGraphDb(dbPath) {
  return {
    queryJson: async (sql) => sqlite(dbPath, sql, true),
  };
}

function saveGraphEnv() {
  return {
    store: process.env.DAOBREW_GRAPH_STORE,
    db: process.env.DAOBREW_GRAPH_DB,
  };
}

function restoreGraphEnv(saved) {
  if (saved.store === undefined) delete process.env.DAOBREW_GRAPH_STORE;
  else process.env.DAOBREW_GRAPH_STORE = saved.store;
  if (saved.db === undefined) delete process.env.DAOBREW_GRAPH_DB;
  else process.env.DAOBREW_GRAPH_DB = saved.db;
}

describe("authenticated backend mirror contract", () => {
  it("has no caller-selected tenant argument", () => {
    const parsed = parseArgs([
      "--dry-run",
      "--causal-run-only",
      "--expected-generation",
      GENERATION_ID,
      "--db",
      "/tmp/graph.db",
    ]);
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.causalRunOnly, true);
    assert.equal(parsed.dbPath, "/tmp/graph.db");
    assert.equal(parsed.expectedGeneration, GENERATION_ID);
    assert.equal(Object.hasOwn(parsed, "userId"), false);
    assert.throws(() => parseArgs(["--user-id", "forged-user"]), /Unknown argument/);
    assert.throws(() => parseArgs(["--db"]), /requires a value/);
  });

  it("uses only a device credential and scrubs retired secrets after enrollment", () => {
    const dbPath = tempDb();
    const configPath = join(dirname(dbPath), "config.json");
    writeFileSync(configPath, JSON.stringify({
      api_url: "https://api.example.test/api/v1/",
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      api_key: "dbk_legacy_only_exchange",
      database_url: "secret-database-url",
      postgres_url: "secret-shared-url",
      postgres_maintenance_url: "secret-owner-url",
      preserved: true,
    }), { mode: 0o644 });
    writeFileSync(`${configPath}.bak`, JSON.stringify({ database_url: "backup-secret" }));

    assert.deepEqual(readBackendConfig(configPath), {
      apiUrl: "https://api.example.test/api/v1",
      credential: DEVICE_CREDENTIAL,
    });
    const stored = JSON.parse(readFileSync(configPath, "utf8"));
    assert.deepEqual(stored, {
      api_url: "https://api.example.test/api/v1",
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      preserved: true,
    });
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(configPath)).mode & 0o777, 0o700);
    assert.equal(existsSync(`${configPath}.bak`), true);
    assert.deepEqual(JSON.parse(readFileSync(`${configPath}.bak`, "utf8")), stored);
    assert.doesNotMatch(readFileSync(`${configPath}.bak`, "utf8"), /secret-/);
    const lockPath = join(dirname(configPath), ".config.json.mutation.lock");
    assert.equal(existsSync(lockPath), true, "the shared lock inode must remain persistent");
    assert.equal(statSync(lockPath).mode & 0o777, 0o600);
  });

  it("never authenticates with api_key and securely clears malformed configuration", () => {
    const dbPath = tempDb();
    const configPath = join(dirname(dbPath), "config.json");
    writeFileSync(configPath, JSON.stringify({
      api_url: "https://api.example.test/api/v1",
      api_key: "dbk_legacy_only_exchange",
      database_url: "must-not-remain",
    }));
    assert.throws(() => readBackendConfig(configPath), /device credential/);
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), {
      api_url: "https://api.example.test/api/v1",
      api_key: "dbk_legacy_only_exchange",
    });

    const validPriorBackup = { preserved_backup: true, pairing_issuer: "https://issuer.test" };
    writeFileSync(`${configPath}.bak`, JSON.stringify(validPriorBackup), { mode: 0o600 });
    writeFileSync(configPath, '{"database_url":"unterminated');
    assert.throws(() => readBackendConfig(configPath), /malformed.*securely cleared/);
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), {
      config_repair_required: true,
    });
    assert.deepEqual(
      JSON.parse(readFileSync(`${configPath}.bak`, "utf8")),
      validPriorBackup,
      "malformed primary recovery must not delete or overwrite a valid prior backup",
    );
  });

  it("scrubs a retired credential from backup when the primary is already clean", () => {
    const dbPath = tempDb();
    const configPath = join(dirname(dbPath), "config.json");
    const clean = {
      api_url: "https://api.example.test/api/v1",
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      pairing_issuer: "https://api.example.test",
      preserved: true,
    };
    writeFileSync(configPath, JSON.stringify(clean), { mode: 0o600 });
    writeFileSync(`${configPath}.bak`, JSON.stringify({
      ...clean,
      api_key: "dbk_retired_exchange_secret",
      database_url: "secret-database-url",
    }), { mode: 0o600 });

    assert.deepEqual(readBackendConfig(configPath), {
      apiUrl: "https://api.example.test/api/v1",
      credential: DEVICE_CREDENTIAL,
    });
    assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), clean);
    const backupText = readFileSync(`${configPath}.bak`, "utf8");
    assert.deepEqual(JSON.parse(backupText), clean);
    assert.doesNotMatch(backupText, /retired_exchange_secret|secret-database-url/);
    assert.equal(statSync(`${configPath}.bak`).mode & 0o777, 0o600);
  });

  it("replaces an unsafe backup symlink without following its target", () => {
    const dbPath = tempDb();
    const directory = dirname(dbPath);
    const configPath = join(directory, "config.json");
    const backupPath = `${configPath}.bak`;
    const symlinkTarget = join(directory, "outside-backup.json");
    const clean = {
      api_url: "https://api.example.test/api/v1",
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      pairing_issuer: "https://api.example.test",
      preserved: true,
    };
    writeFileSync(configPath, JSON.stringify(clean), { mode: 0o600 });
    writeFileSync(symlinkTarget, JSON.stringify({
      database_url: "secret-symlink-target",
    }), { mode: 0o600 });
    symlinkSync(symlinkTarget, backupPath);

    assert.deepEqual(readBackendConfig(configPath), {
      apiUrl: "https://api.example.test/api/v1",
      credential: DEVICE_CREDENTIAL,
    });
    assert.deepEqual(JSON.parse(readFileSync(backupPath, "utf8")), clean);
    assert.deepEqual(JSON.parse(readFileSync(symlinkTarget, "utf8")), {
      database_url: "secret-symlink-target",
    });
    assert.equal(statSync(backupPath).mode & 0o777, 0o600);
  });

  it("serializes with a lockf writer and preserves its concurrent authority update", async () => {
    const dbPath = tempDb();
    const directory = dirname(dbPath);
    const configPath = join(directory, "config.json");
    const lockPath = join(directory, ".config.json.mutation.lock");
    const holderReady = join(directory, "holder-ready");
    const releaseHolder = join(directory, "release-holder");
    const readerStarted = join(directory, "reader-started");
    const readerScript = join(directory, "config-reader.mjs");
    writeFileSync(configPath, JSON.stringify({
      api_url: "https://api.example.test/api/v1/",
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      database_url: "secret-database-url",
      preserved: true,
    }), { mode: 0o600 });

    const holderSource = String.raw`
import fcntl
import json
import os
import stat
import sys
import time

lock_path, config_path, ready_path, release_path = sys.argv[1:]
flags = os.O_RDWR | os.O_CREAT
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
descriptor = os.open(lock_path, flags, 0o600)
try:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
        raise PermissionError("unsafe fixture lock")
    fcntl.lockf(descriptor, fcntl.LOCK_EX)
    with open(config_path, "r", encoding="utf-8") as source:
        snapshot = json.load(source)
    with open(ready_path, "x", encoding="utf-8") as marker:
        marker.write("ready")
    while not os.path.exists(release_path):
        time.sleep(0.01)

    def publish(path, value):
        temporary = path + ".fixture.tmp"
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(fd, (json.dumps(value, indent=2) + "\n").encode("utf-8"))
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, path)
        os.chmod(path, 0o600)

    publish(config_path + ".bak", snapshot)
    snapshot["pairing_issuer"] = "https://api.example.test"
    snapshot["concurrent_authority_marker"] = "preserve-me"
    publish(config_path, snapshot)
finally:
    os.close(descriptor)
`;
    const holder = spawn(
      process.platform === "darwin" ? "/usr/bin/python3" : "python3",
      ["-c", holderSource, lockPath, configPath, holderReady, releaseHolder],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const holderExit = once(holder, "exit");
    await waitForFile(holderReady);

    const moduleUrl = new URL("./sync-postgres-to-sentinel-sqlite.mjs", import.meta.url).href;
    writeFileSync(readerScript, `
import { writeFileSync } from "node:fs";
import { readBackendConfig } from ${JSON.stringify(moduleUrl)};
writeFileSync(process.argv[3], "started", { mode: 0o600 });
process.stdout.write(JSON.stringify(readBackendConfig(process.argv[2])));
`);
    const reader = spawn(process.execPath, [readerScript, configPath, readerStarted], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let readerOutput = "";
    let readerError = "";
    reader.stdout.setEncoding("utf8");
    reader.stderr.setEncoding("utf8");
    reader.stdout.on("data", (chunk) => { readerOutput += chunk; });
    reader.stderr.on("data", (chunk) => { readerError += chunk; });
    const readerExit = once(reader, "exit");
    await waitForFile(readerStarted);
    await delay(250);
    assert.equal(
      reader.exitCode,
      null,
      "Node must block behind the same POSIX lockf transaction used by Swift",
    );

    writeFileSync(releaseHolder, "release", { mode: 0o600 });
    const [[holderCode], [readerCode]] = await Promise.all([holderExit, readerExit]);
    assert.equal(holderCode, 0);
    assert.equal(readerCode, 0, readerError);
    assert.deepEqual(JSON.parse(readerOutput), {
      apiUrl: "https://api.example.test/api/v1",
      credential: DEVICE_CREDENTIAL,
    });

    const stored = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(stored.pairing_issuer, "https://api.example.test");
    assert.equal(stored.concurrent_authority_marker, "preserve-me");
    assert.equal(stored.preserved, true);
    assert.equal(stored.api_url, "https://api.example.test/api/v1");
    assert.equal(Object.hasOwn(stored, "database_url"), false);
    const backupText = readFileSync(`${configPath}.bak`, "utf8");
    assert.deepEqual(JSON.parse(backupText), stored);
    assert.doesNotMatch(backupText, /secret-database-url/);
    assert.equal(statSync(lockPath).mode & 0o777, 0o600);
  });

  it("requires HTTPS except loopback and rejects credential-bearing API URLs", () => {
    const dbPath = tempDb();
    const configPath = join(dirname(dbPath), "config.json");
    const check = (apiUrl) => {
      writeFileSync(configPath, JSON.stringify({
        api_url: apiUrl,
        device_credential: DEVICE_CREDENTIAL,
      }));
      return () => readBackendConfig(configPath);
    };
    assert.throws(check("http://api.example.test/api/v1"), /unsafe API URL/);
    assert.throws(check("https://user:pass@api.example.test/api/v1"), /unsafe API URL/);
    assert.throws(check("https://api.example.test/api/v1?token=secret"), /unsafe API URL/);
    assert.deepEqual(check("http://127.0.0.1:8787/api/v1")(), {
      apiUrl: "http://127.0.0.1:8787/api/v1",
      credential: DEVICE_CREDENTIAL,
    });
  });

  it("POSTs the causal run with a private bearer header and preserves no_signal", async () => {
    const requests = [];
    const result = await runCausalThroughBackend(
      {},
      backendDependencies({ status: "no_signal", generation_id: GENERATION_ID }, requests),
    );
    assert.deepEqual(result, { status: "no_signal", generation_id: GENERATION_ID });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.example.test/api/v1/causal/run");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.body, "{}");
    assert.equal(requests[0].init.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
    assert.doesNotMatch(`${requests[0].url}${requests[0].init.body}${JSON.stringify(result)}`, /fixture_device_credential/);
  });

  it("fails closed when the causal run does not return an opaque generation", async () => {
    await assert.rejects(
      runCausalThroughBackend({}, backendDependencies({ status: "written" })),
      /generation is missing or invalid/,
    );
    await assert.rejects(
      runCausalThroughBackend(
        {},
        backendDependencies({ status: "written", generation_id: "x".repeat(257) }),
      ),
      /generation is missing or invalid/,
    );
  });

  it("GETs only the versioned snapshot for the authenticated principal", async () => {
    const requests = [];
    const result = await readBackendGraphRows(
      { expectedGeneration: GENERATION_ID },
      backendDependencies(snapshotData(), requests),
    );
    assert.equal(result.principalId, "user-123");
    assert.equal(result.generationId, GENERATION_ID);
    assert.equal(result.rows.nodes.length, 2);
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].url,
      `https://api.example.test/api/v1/graph/snapshot?expected_generation=${GENERATION_ID}`,
    );
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
  });

  it("URL-encodes the pinned generation and requires the exact response generation", async () => {
    const generation = " gen/a b?c=d ";
    const requests = [];
    const result = await readBackendGraphRows(
      { expectedGeneration: generation },
      backendDependencies(snapshotData("user-123", { generation_id: generation }), requests),
    );
    assert.equal(result.generationId, generation);
    assert.equal(
      requests[0].url,
      `https://api.example.test/api/v1/graph/snapshot?expected_generation=${encodeURIComponent(generation)}`,
    );
  });

  it("fails closed on a missing or raced snapshot generation", async () => {
    await assert.rejects(
      readBackendGraphRows(
        { expectedGeneration: GENERATION_ID },
        backendDependencies(snapshotData("user-123", { generation_id: undefined })),
      ),
      /generation did not match/,
    );
    await assert.rejects(
      readBackendGraphRows(
        { expectedGeneration: GENERATION_ID },
        backendDependencies(snapshotData("user-123", { generation_id: "newer-generation" })),
      ),
      /generation did not match/,
    );
  });

  it("does not invoke any SQLite dependency after a snapshot generation race", async () => {
    let ensureCalls = 0;
    let backupCalls = 0;
    let transactionCalls = 0;
    await assert.rejects(
      runMirror(
        {
          dbPath: "/tmp/sentinel-graph.db",
          dryRun: false,
          backup: true,
          expectedGeneration: GENERATION_ID,
        },
        {
          ...backendDependencies(snapshotData("user-123", { generation_id: "newer-generation" })),
          ensureSchema: () => { ensureCalls += 1; },
          backupSqliteDb: () => { backupCalls += 1; },
          execSqliteTransaction: () => { transactionCalls += 1; },
          graphDb: { queryJson: async () => [] },
        },
      ),
      /generation did not match/,
    );
    assert.equal(ensureCalls, 0);
    assert.equal(backupCalls, 0);
    assert.equal(transactionCalls, 0);
  });

  it("fails closed if a backend result contains another principal's row", async () => {
    const rows = currentRows("user-123");
    rows.edges[0].user_id = "other-user";
    assert.throws(
      () => assertRowsBelongToUser(rows, "user-123"),
      /outside its authenticated principal/,
    );
    await assert.rejects(
      readBackendGraphRows(
        { expectedGeneration: GENERATION_ID },
        backendDependencies(snapshotData("user-123", { edges: rows.edges })),
      ),
      /outside its authenticated principal/,
    );
  });

  it("rejects unsupported, duplicate, dangling, and textual snapshot shapes before write", async () => {
    await assert.rejects(
      readBackendGraphRows(
        { expectedGeneration: GENERATION_ID },
        backendDependencies(snapshotData("user-123", { schema_version: 2 })),
      ),
      /schema version is unsupported/,
    );
    await assert.rejects(
      readBackendGraphRows(
        { expectedGeneration: GENERATION_ID },
        backendDependencies({ generation_id: GENERATION_ID, snapshot: "narrative text" }),
      ),
      /schema version is unsupported/,
    );

    const duplicate = currentRows();
    duplicate.nodes.push({ ...duplicate.nodes[0] });
    assert.throws(() => assertSnapshotIntegrity(duplicate, "user-123"), /duplicate node ID/);

    const dangling = currentRows();
    dangling.edges[0].dst_id = "not-returned";
    assert.throws(() => assertSnapshotIntegrity(dangling, "user-123"), /outside the returned node set/);

    const paddedNode = currentRows();
    paddedNode.nodes[0].id = " current-pattern";
    assert.throws(() => assertSnapshotIntegrity(paddedNode, "user-123"), /invalid or duplicate node ID/);

    const paddedEdge = currentRows();
    paddedEdge.edges[0].id = "current-edge ";
    assert.throws(() => assertSnapshotIntegrity(paddedEdge, "user-123"), /invalid or duplicate edge ID/);

    for (const invalidRef of ["", "   ", " current-pattern", "current-pattern "]) {
      const invalidEndpoint = currentRows();
      invalidEndpoint.edges[0].src_id = invalidRef;
      assert.throws(
        () => assertSnapshotIntegrity(invalidEndpoint, "user-123"),
        /invalid edge endpoint ID/,
      );
    }
  });

  it("performs no local write during an authenticated dry run and redacts principal/credential", async () => {
    const saved = saveGraphEnv();
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    process.env.DAOBREW_GRAPH_DB = "/prior/db";
    let ensureCalls = 0;
    let backupCalls = 0;
    try {
      const result = await runMirror(
        {
          dbPath: "/tmp/sentinel-graph.db",
          dryRun: true,
          backup: true,
          expectedGeneration: GENERATION_ID,
        },
        {
          ...backendDependencies(snapshotData("secret-user-id"), [], DEVICE_CREDENTIAL),
          ensureSchema: () => { ensureCalls += 1; },
          backupSqliteDb: () => { backupCalls += 1; },
          graphDb: {},
        },
      );

      assert.equal(ensureCalls, 0, "dry-run must never bootstrap local schema");
      assert.equal(backupCalls, 0, "dry-run must not create or prune backups");
      assert.equal(process.env.DAOBREW_GRAPH_STORE, "sqlite");
      assert.equal(process.env.DAOBREW_GRAPH_DB, "/prior/db");
      const output = JSON.stringify(result);
      assert.doesNotMatch(output, /secret-user-id/);
      assert.doesNotMatch(output, /fixture_device_credential/);
      assert.match(output, /"principal_scope":\{"authenticated":true,"server_resolved":true\}/);
    } finally {
      restoreGraphEnv(saved);
    }
  });
});

describe("active-user SQLite mirror", () => {
  it("backs up the old graph then atomically replaces all users with the active user", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const rows = currentRows();
    const saved = saveGraphEnv();
    try {
      const result = await writeSqliteRows(
        sqliteGraphDb(dbPath),
        () => assert.equal(process.env.DAOBREW_GRAPH_STORE, "sqlite"),
        { userId: "user-123", dbPath, dryRun: false, backup: true },
        rows,
      );

      assert.ok(result.backup?.db);
      assert.equal(existsSync(result.backup.db), true);
      assert.deepEqual(result.backup.retention, {
        limit: DEFAULT_BACKUP_RETENTION,
        managed_before: 1,
        retained: 1,
        pruned: 0,
        failed: 0,
        cleanup_failed: false,
      });
      assert.deepEqual(result.readback, {
        graph_nodes: 2,
        graph_edges: 1,
        active_user_nodes: 2,
        active_user_edges: 1,
        foreign_user_nodes: 0,
        foreign_user_edges: 0,
      });
      assert.deepEqual(
        sqlite(dbPath, "SELECT DISTINCT user_id FROM graph_nodes UNION SELECT DISTINCT user_id FROM graph_edges;", true),
        [{ user_id: "user-123" }],
      );
      assert.deepEqual(
        sqlite(result.backup.db, "SELECT count(*) AS nodes FROM graph_nodes;", true),
        [{ nodes: 2 }],
        "backup must retain the pre-mirror graph",
      );
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("hardens the graph directory, active SQLite artifacts, and backups under umask 000", async () => {
    const dbPath = tempDb();
    const directory = dirname(dbPath);
    const priorUmask = process.umask(0);
    const saved = saveGraphEnv();
    try {
      chmodSync(directory, 0o777);
      createGraphSchema(dbPath);
      seedOldGraph(dbPath);
      chmodSync(dbPath, 0o666);
      for (const suffix of ["-wal", "-shm", ".tmp-fixture"]) {
        writeFileSync(`${dbPath}${suffix}`, "fixture", { mode: 0o666 });
        chmodSync(`${dbPath}${suffix}`, 0o666);
      }

      secureSqliteArtifacts(dbPath);
      for (const suffix of ["", "-wal", "-shm", ".tmp-fixture"]) {
        assert.equal(statSync(`${dbPath}${suffix}`).mode & 0o777, 0o600);
      }
      assert.equal(statSync(directory).mode & 0o777, 0o700);

      rmSync(`${dbPath}-wal`, { force: true });
      rmSync(`${dbPath}-shm`, { force: true });
      rmSync(`${dbPath}.tmp-fixture`, { force: true });
      const result = await writeSqliteRows(
        sqliteGraphDb(dbPath),
        () => {},
        { userId: "user-123", dbPath, dryRun: false, backup: true },
        currentRows(),
      );
      assert.equal(statSync(directory).mode & 0o777, 0o700);
      assert.equal(statSync(dbPath).mode & 0o777, 0o600);
      assert.equal(statSync(join(directory, "backups")).mode & 0o777, 0o700);
      assert.equal(statSync(result.backup.dir).mode & 0o777, 0o700);
      assert.equal(statSync(result.backup.db).mode & 0o777, 0o600);
    } finally {
      process.umask(priorUmask);
      restoreGraphEnv(saved);
    }
  });

  it("publishes a complete backup by atomically renaming an unmanaged staging directory", () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const backupsRoot = join(dirname(dbPath), "backups");
    mkdirSync(backupsRoot);
    const nowMs = Date.now();
    const stale = seedStagingDir(
      backupsRoot,
      99999991,
      1,
      nowMs - STAGING_BACKUP_STALE_MS - 1_000,
    );
    let publishObserved = false;
    const result = backupSqliteDb(dbPath, {
      nowMs,
      processIsAlive: () => false,
      renameSync: (source, target) => {
        publishObserved = true;
        assert.match(basename(source), /^\.staging-backend-api-/);
        assert.equal(MANAGED_BACKUP_DIR_RE.test(basename(source)), false);
        assert.equal(MANAGED_BACKUP_DIR_RE.test(basename(target)), true);
        assert.equal(existsSync(target), false);
        assert.equal(statSync(source).mode & 0o777, 0o700);
        assert.equal(statSync(join(source, basename(dbPath))).mode & 0o777, 0o600);
        renameSync(source, target);
      },
    });

    assert.equal(publishObserved, true);
    assert.equal(result.dir, dirname(result.db));
    assert.equal(existsSync(result.db), true);
    assert.equal(statSync(result.db).mode & 0o777, 0o600);
    assert.equal(result.staging_cleanup.removed, 1);
    assert.equal(existsSync(stale), false, "the next backup start reclaims dead stale staging");
  });

  it("reclaims only exact dead-and-stale staging directories", () => {
    const dbPath = tempDb();
    const backupsRoot = join(dirname(dbPath), "backups");
    mkdirSync(backupsRoot);
    const nowMs = Date.now();
    const staleDead = seedStagingDir(
      backupsRoot,
      99999991,
      11,
      nowMs - STAGING_BACKUP_STALE_MS - 1_000,
    );
    const staleActive = seedStagingDir(
      backupsRoot,
      process.pid,
      12,
      nowMs - STAGING_BACKUP_STALE_MS - 1_000,
    );
    const freshDead = seedStagingDir(backupsRoot, 99999992, 13, nowMs - 1_000);
    const malformed = join(backupsRoot, ".staging-backend-api-not-a-pid-14");
    mkdirSync(malformed);
    const outside = join(dirname(dbPath), "outside-staging-target");
    mkdirSync(outside);
    const stagedSymlink = join(backupsRoot, ".staging-backend-api-99999993-15");
    symlinkSync(outside, stagedSymlink);

    const result = reclaimStaleBackupStaging(backupsRoot, {
      nowMs,
      processIsAlive: (pid) => pid === process.pid,
    });

    assert.deepEqual(result, {
      examined: 3,
      removed: 1,
      preserved_active: 1,
      preserved_fresh: 1,
      failed: 0,
      cleanup_failed: false,
    });
    assert.equal(existsSync(staleDead), false);
    assert.equal(existsSync(staleActive), true, "active owner staging must never be reclaimed");
    assert.equal(existsSync(freshDead), true, "fresh dead-owner staging retains a grace period");
    assert.equal(existsSync(malformed), true, "non-exact names are unmanaged");
    assert.equal(existsSync(stagedSymlink), true, "symlinks are never followed or removed");
    assert.equal(existsSync(outside), true);
  });

  it("reports stale staging cleanup failure without touching the candidate", () => {
    const dbPath = tempDb();
    const backupsRoot = join(dirname(dbPath), "backups");
    mkdirSync(backupsRoot);
    const nowMs = Date.now();
    const stale = seedStagingDir(
      backupsRoot,
      99999994,
      21,
      nowMs - STAGING_BACKUP_STALE_MS - 1_000,
    );
    const result = reclaimStaleBackupStaging(backupsRoot, {
      nowMs,
      processIsAlive: () => false,
      stagingRmSync: () => { throw new Error("fixture cleanup failure"); },
    });
    assert.deepEqual(result, {
      examined: 1,
      removed: 0,
      preserved_active: 0,
      preserved_fresh: 0,
      failed: 1,
      cleanup_failed: true,
    });
    assert.equal(existsSync(stale), true);
  });

  it("cleans staging and never publishes or prunes after backup creation failure", () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const backupsRoot = seedManagedBackupDirs(dbPath, 3);
    const managedBefore = managedBackupNames(backupsRoot);
    let pruneCalls = 0;
    const pruneSpy = () => {
      pruneCalls += 1;
      throw new Error("must not prune");
    };

    assert.throws(
      () => backupSqliteDb(dbPath, {
        execFileSync: () => {
          const staging = readdirSync(backupsRoot).find((name) => name.startsWith(".staging-"));
          assert.ok(staging, "staging directory must exist before VACUUM");
          writeFileSync(join(backupsRoot, staging, basename(dbPath)), "partial", { mode: 0o666 });
          throw new Error("fixture VACUUM failure");
        },
        pruneManagedBackups: pruneSpy,
      }),
      /SQLite backup creation failed/,
    );
    assert.deepEqual(managedBackupNames(backupsRoot), managedBefore);
    assert.equal(readdirSync(backupsRoot).some((name) => name.startsWith(".staging-")), false);
    assert.equal(pruneCalls, 0);

    assert.throws(
      () => backupSqliteDb(dbPath, {
        renameSync: () => { throw new Error("fixture rename failure"); },
        pruneManagedBackups: pruneSpy,
      }),
      /SQLite backup creation failed/,
    );
    assert.deepEqual(managedBackupNames(backupsRoot), managedBefore);
    assert.equal(readdirSync(backupsRoot).some((name) => name.startsWith(".staging-")), false);
    assert.equal(pruneCalls, 0);
  });

  it("fails closed before live overwrite or pruning when backups-root fsync fails", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const backupsRoot = join(dirname(dbPath), "backups");
    let transactionCalls = 0;
    let pruneCalls = 0;
    const saved = saveGraphEnv();
    try {
      await assert.rejects(
        writeSqliteRows(
          sqliteGraphDb(dbPath),
          () => {},
          { userId: "user-123", dbPath, dryRun: false, backup: true },
          currentRows(),
          {
            execSqliteTransaction: () => { transactionCalls += 1; },
            backupDependencies: {
              fsyncPath: (path) => {
                if (path === backupsRoot) throw new Error("fixture parent fsync failure");
              },
              pruneManagedBackups: () => { pruneCalls += 1; },
            },
          },
        ),
        /SQLite backup creation failed/,
      );
      assert.equal(transactionCalls, 0, "live graph replacement must not begin");
      assert.equal(pruneCalls, 0, "retention must not run after parent fsync failure");
      assert.deepEqual(
        sqlite(dbPath, "SELECT id FROM graph_nodes ORDER BY id;", true),
        [{ id: "old-local" }, { id: "old-other" }],
      );
      assert.equal(
        readdirSync(backupsRoot).some((name) => MANAGED_BACKUP_DIR_RE.test(name)),
        false,
        "the unsynced published backup is removed",
      );
      assert.equal(readdirSync(backupsRoot).some((name) => name.startsWith(".staging-")), false);
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("accepts an authoritative empty snapshot and clears stale local graph rows", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const saved = saveGraphEnv();
    try {
      const result = await runMirror(
        {
          dbPath,
          dryRun: false,
          backup: false,
          expectedGeneration: GENERATION_ID,
        },
        {
          ...backendDependencies(snapshotData("user-123", {
            nodes: [],
            edges: [],
            ghost_status_counts: [],
          })),
          ensureSchema: () => {},
          graphDb: sqliteGraphDb(dbPath),
        },
      );
      assert.equal(result.status, "synced");
      assert.deepEqual(result.api_rows, {
        graph_nodes: 0,
        graph_edges: 0,
        ghost_status_counts: [],
      });
      assert.deepEqual(result.sqlite_readback, {
        graph_nodes: 0,
        graph_edges: 0,
        active_user_nodes: 0,
        active_user_edges: 0,
        foreign_user_nodes: 0,
        foreign_user_edges: 0,
      });
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("rolls back the clear when any mirrored row violates the SQLite contract", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const rows = currentRows();
    rows.nodes[1].kind = "not-a-real-kind";
    const saved = saveGraphEnv();
    try {
      await assert.rejects(
        writeSqliteRows(
          sqliteGraphDb(dbPath),
          () => {},
          { userId: "user-123", dbPath, dryRun: false, backup: false },
          rows,
        ),
      );
      assert.deepEqual(
        sqlite(dbPath, "SELECT id, user_id FROM graph_nodes ORDER BY id;", true),
        [
          { id: "old-local", user_id: "local" },
          { id: "old-other", user_id: "other-user" },
        ],
        "the original graph must survive a failed replacement",
      );
      assert.deepEqual(
        sqlite(dbPath, "SELECT id FROM graph_edges;", true),
        [{ id: "old-edge" }],
      );
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("streams a mirror larger than process argv limits through SQLite stdin", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const rows = currentRows();
    rows.nodes[0].props_json = { payload: "x".repeat(2_200_000) };
    const saved = saveGraphEnv();
    let backupCalls = 0;
    try {
      const result = await writeSqliteRows(
        sqliteGraphDb(dbPath),
        () => {},
        { userId: "user-123", dbPath, dryRun: false, backup: false },
        rows,
        { backupSqliteDb: () => { backupCalls += 1; } },
      );
      assert.equal(backupCalls, 0, "--no-backup must not create or prune backups");
      assert.equal(result.readback.graph_nodes, 2);
      assert.deepEqual(
        sqlite(dbPath, "SELECT length(props_json) > 2000000 AS large FROM graph_nodes WHERE id='current-pattern';", true),
        [{ large: 1 }],
      );
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("retains only the new backup and two newest managed predecessors", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    const backupsRoot = seedManagedBackupDirs(dbPath, 5);
    const saved = saveGraphEnv();
    try {
      const result = await writeSqliteRows(
        sqliteGraphDb(dbPath),
        () => {},
        { userId: "user-123", dbPath, dryRun: false, backup: true },
        currentRows(),
      );

      const managed = managedBackupNames(backupsRoot);
      assert.equal(managed.length, DEFAULT_BACKUP_RETENTION);
      assert.equal(managed.includes(basename(result.backup.dir)), true);
      assert.deepEqual(
        managed,
        [
          "backend-api-2020-01-04T00-00-00-000Z",
          "backend-api-2020-01-05T00-00-00-000Z",
          basename(result.backup.dir),
        ].sort(),
        "retention must compare timestamps across legacy/new prefixes, not prefix text",
      );
      assert.equal(existsSync(join(backupsRoot, "manual-backup")), true);
      assert.equal(existsSync(join(backupsRoot, "postgres-bridge-not-managed")), true);
      assert.deepEqual(result.backup.retention, {
        limit: DEFAULT_BACKUP_RETENTION,
        managed_before: 6,
        retained: 3,
        pruned: 3,
        failed: 0,
        cleanup_failed: false,
      });
    } finally {
      restoreGraphEnv(saved);
    }
  });

  it("continues the mirror with a redacted warning when retention cleanup fails", async () => {
    const dbPath = tempDb();
    createGraphSchema(dbPath);
    seedOldGraph(dbPath);
    seedManagedBackupDirs(dbPath, 4);
    const saved = saveGraphEnv();
    try {
      const result = await runMirror(
        {
          dbPath,
          dryRun: false,
          backup: true,
          expectedGeneration: GENERATION_ID,
        },
        {
          ...backendDependencies(snapshotData("secret-user-id")),
          ensureSchema: () => {},
          graphDb: sqliteGraphDb(dbPath),
          backupDependencies: {
            rmSync: () => { throw new Error("credential=do-not-echo"); },
          },
        },
      );

      assert.equal(result.status, "synced");
      assert.deepEqual(result.warnings, ["Backup retention cleanup was incomplete; mirror continued"]);
      assert.deepEqual(result.backup.retention, {
        limit: DEFAULT_BACKUP_RETENTION,
        managed_before: 5,
        retained: 5,
        pruned: 0,
        failed: 2,
        cleanup_failed: true,
      });
      assert.equal(result.sqlite_readback.graph_nodes, 2);
      const output = JSON.stringify(result);
      assert.doesNotMatch(output, /secret-user-id|do-not-echo/);
    } finally {
      restoreGraphEnv(saved);
    }
  });
});
