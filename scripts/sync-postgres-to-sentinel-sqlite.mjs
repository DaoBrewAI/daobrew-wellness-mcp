#!/usr/bin/env node
// Mirror one authenticated backend graph snapshot into Sentinel's SQLite DB.
//
// The backend owns durable storage and tenant resolution. Sentinel remains a SQLite
// reader, so the local graph tables are a replaceable projection for exactly
// the server-returned authenticated principal. No database URL reaches this
// process.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const DIST_SCHEMA = "../dist/src/engine/schema.js";
const DIST_GRAPH_DB = "../dist/src/graph-db.js";
export const DEFAULT_BACKUP_RETENTION = 3;
export const STAGING_BACKUP_STALE_MS = 60 * 60 * 1000;
const MANAGED_BACKUP_DIR_RE =
  /^(?:backend-api|postgres-bridge)-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-\d+)?$/;
const STAGING_BACKUP_DIR_RE = /^\.staging-backend-api-([1-9][0-9]*)-([0-9]+)$/;
const RETENTION_WARNING = "Backup retention cleanup was incomplete; mirror continued";
const STAGING_WARNING = "Stale backup staging cleanup was incomplete; backup continued";
const DEVICE_CREDENTIAL_RE = /^dbd_[A-Za-z0-9_-]{16,}$/;
const MAX_PRIVATE_CONFIG_BYTES = 64 * 1024;
const LOCKED_CONFIG_READ_MODE = "--internal-read-backend-config-locked";
const CONFIG_LOCK_RUNNER = String.raw`
import fcntl
import os
import stat
import subprocess
import sys

lock_path = sys.argv[1]
command = sys.argv[2:]
flags = os.O_RDWR | os.O_CREAT
if hasattr(os, "O_NOFOLLOW"):
    flags |= os.O_NOFOLLOW
descriptor = os.open(lock_path, flags, 0o600)
try:
    metadata = os.fstat(descriptor)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.getuid()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) != 0o600
    ):
        raise PermissionError("unsafe DaoBrew config mutation lock")
    fcntl.lockf(descriptor, fcntl.LOCK_EX)
    completed = subprocess.run(command, check=False)
    raise SystemExit(completed.returncode)
finally:
    os.close(descriptor)
`;

function usage() {
  return [
    "Usage: node scripts/sync-postgres-to-sentinel-sqlite.mjs [--db PATH] [--expected-generation ID] [--dry-run] [--no-backup] [--causal-run-only]",
    "",
    "Uses the owner-only local config credential to call the public backend.",
    "The default GETs /graph/snapshot and atomically replaces Sentinel SQLite;",
    "--causal-run-only POSTs /causal/run and performs no local graph write.",
  ].join("\n");
}

function optionValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function validateUserId(value) {
  const userId = typeof value === "string" ? value.trim() : "";
  if (!userId || userId.toLowerCase() === "local") {
    throw new Error("backend graph snapshot is missing an authenticated non-local principal");
  }
  return userId;
}

export function parseArgs(argv) {
  const options = {
    dbPath: join(homedir(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db"),
    dryRun: false,
    backup: true,
    causalRunOnly: false,
    expectedGeneration: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-backup") {
      options.backup = false;
    } else if (arg === "--causal-run-only") {
      options.causalRunOnly = true;
    } else if (arg === "--expected-generation") {
      options.expectedGeneration = optionValue(argv, i, arg);
      i += 1;
    } else if (arg.startsWith("--expected-generation=")) {
      options.expectedGeneration = arg.slice("--expected-generation=".length);
    } else if (arg === "--db") {
      options.dbPath = optionValue(argv, i, arg);
      i += 1;
    } else if (arg.startsWith("--db=")) {
      options.dbPath = arg.slice("--db=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function configPath() {
  return process.env.DAOBREW_CONFIG_FILE
    || join(homedir(), ".daobrew", "config.json");
}

function writePrivateJsonAtomically(path, value, purpose) {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${purpose}.${process.pid}.${randomUUID()}.tmp`,
  );
  const data = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor;
  let published = false;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, data);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
    const parentDescriptor = openSync(dirname(path), "r");
    try {
      fsyncSync(parentDescriptor);
    } finally {
      closeSync(parentDescriptor);
    }
    published = true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!published) rmSync(temporary, { force: true });
  }
}

function backupRequiresSafeReplacement(path, retiredKeys) {
  let descriptor;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const metadata = fstatSync(descriptor);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
    if (
      !metadata.isFile()
      || currentUid === null
      || metadata.uid !== currentUid
      || metadata.nlink !== 1
      || (metadata.mode & 0o7777) !== 0o600
      || metadata.size <= 0
      || metadata.size > MAX_PRIVATE_CONFIG_BYTES
    ) {
      return true;
    }
    const backup = JSON.parse(readFileSync(descriptor, "utf8"));
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) return true;
    return retiredKeys.some((key) => Object.hasOwn(backup, key));
  } catch (error) {
    return error?.code === "ENOENT" ? false : true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readBackendConfigLocked(path) {
  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error();
  } catch {
    // Never replace or delete a valid rolling backup when the primary file is
    // malformed. Recovery publishes only the fail-closed marker.
    writePrivateJsonAtomically(path, { config_repair_required: true }, "repair");
    throw new Error("DaoBrew config was malformed and securely cleared");
  }

  const credential = typeof config.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  const normalizedApiUrl = typeof config.api_url === "string"
    ? config.api_url.trim().replace(/\/+$/, "")
    : "";
  const retired = ["database_url", "postgres_url", "postgres_maintenance_url"];
  if (DEVICE_CREDENTIAL_RE.test(credential)) retired.push("api_key");
  let changed = false;
  if (config.api_url !== normalizedApiUrl) {
    config.api_url = normalizedApiUrl;
    changed = true;
  }
  for (const key of retired) {
    if (Object.hasOwn(config, key)) {
      delete config[key];
      changed = true;
    }
  }
  const backupPath = `${path}.bak`;
  const primaryRequiresRewrite = changed || (lstatSync(path).mode & 0o777) !== 0o600;
  const backupRequiresRewrite = backupRequiresSafeReplacement(backupPath, retired);
  if (primaryRequiresRewrite) {
    // The rolling backup contains the freshly merged and scrubbed object, not
    // the retired database credentials. Both publications happen while the
    // cross-process config mutation lock is held.
    writePrivateJsonAtomically(backupPath, config, "backup");
    writePrivateJsonAtomically(path, config, "scrub");
  } else if (backupRequiresRewrite) {
    // Old builds could leave retired credentials in the rolling backup even
    // after the primary was already clean. Repair that backup under the same
    // lock without rewriting a healthy primary.
    writePrivateJsonAtomically(backupPath, config, "backup");
  }
  chmodSync(path, 0o600);

  const apiUrl = normalizedApiUrl;
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error("DaoBrew backend has an unsafe API URL");
  }
  if (!DEVICE_CREDENTIAL_RE.test(credential)) {
    throw new Error("DaoBrew device credential is unavailable or invalid");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("DaoBrew backend has an unsafe API URL");
  }
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]"
    || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("DaoBrew backend has an unsafe API URL");
  }
  return { apiUrl, credential };
}

export function readBackendConfig(path = configPath()) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const lockPath = join(directory, `.${basename(path)}.mutation.lock`);
  const python = process.platform === "darwin" && existsSync("/usr/bin/python3")
    ? "/usr/bin/python3"
    : "python3";
  let output;
  try {
    output = execFileSync(
      python,
      [
        "-c",
        CONFIG_LOCK_RUNNER,
        lockPath,
        process.execPath,
        fileURLToPath(import.meta.url),
        LOCKED_CONFIG_READ_MODE,
        path,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw new Error("DaoBrew config mutation lock could not be acquired");
  }

  let result;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("DaoBrew config mutation returned an invalid result");
  }
  if (result?.ok !== true) {
    throw new Error(result?.error || "DaoBrew config mutation failed");
  }
  return result.value;
}

async function requestBackendJson(path, init, dependencies = {}) {
  const loadConfig = dependencies.readBackendConfig ?? readBackendConfig;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const { apiUrl, credential } = loadConfig();
  const timeoutMs = dependencies.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${credential}`,
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    throw new Error("DaoBrew backend request failed");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`DaoBrew backend request failed (HTTP ${response.status})`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("DaoBrew backend returned an invalid response");
  }
  if (!body || body.success !== true || !body.data || typeof body.data !== "object") {
    throw new Error("DaoBrew backend returned an unsuccessful response");
  }
  return body.data;
}

export async function runCausalThroughBackend(options = {}, dependencies = {}) {
  const data = await requestBackendJson(
    "/causal/run",
    { method: "POST", body: "{}" },
    {
      ...dependencies,
      timeoutMs: dependencies.timeoutMs ?? 180_000,
    },
  );
  const status = data.status ?? data.summary?.status;
  if (!["written", "no_signal", "skipped_done"].includes(status)) {
    throw new Error("DaoBrew causal API returned a non-durable status");
  }
  const generationId = validateGenerationId(data.generation_id);
  return { status, generation_id: generationId };
}

export function validateGenerationId(value) {
  // The backend owns the generation namespace. Treat it as opaque and never
  // normalize it between the causal response, query parameter, and snapshot
  // equality check.
  const generation = typeof value === "string" ? value : "";
  if (!generation || generation.length > 256) {
    throw new Error("DaoBrew graph generation is missing or invalid");
  }
  return generation;
}

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build before this bridge. ${err.message}`);
  }
}

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return q(value);
}

function jsonText(value) {
  if (value === null || value === undefined) return "{}";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function setStore(store, dbPath) {
  process.env.DAOBREW_GRAPH_STORE = store;
  if (store === "sqlite") process.env.DAOBREW_GRAPH_DB = dbPath;
  else delete process.env.DAOBREW_GRAPH_DB;
}

function managedBackupTimestamp(name) {
  const match = MANAGED_BACKUP_DIR_RE.exec(name);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== iso) return null;
  return timestamp;
}

/**
 * Prune only direct child directories created by this bridge. The just-created
 * backup is always retained even if the system clock moved backwards.
 */
export function pruneManagedBackups(dbPath, currentBackupDir, dependencies = {}) {
  const retention = dependencies.retention ?? DEFAULT_BACKUP_RETENTION;
  if (!Number.isInteger(retention) || retention < 1) {
    throw new Error("Backup retention must be a positive integer");
  }

  const backupsRoot = join(dirname(dbPath), "backups");
  const currentName = basename(currentBackupDir);
  if (dirname(currentBackupDir) !== backupsRoot || managedBackupTimestamp(currentName) === null) {
    throw new Error("Current backup is outside the managed backup directory");
  }

  const readEntries = dependencies.readdirSync ?? readdirSync;
  const removeTree = dependencies.rmSync ?? rmSync;
  const managed = readEntries(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, timestamp: managedBackupTimestamp(entry.name) }))
    .filter((entry) => entry.timestamp !== null);
  const managedNames = managed.map((entry) => entry.name);
  if (!managedNames.includes(currentName)) {
    throw new Error("Current backup is missing from the managed backup directory");
  }

  const newestPredecessors = managed
    .filter((entry) => entry.name !== currentName)
    .sort((a, b) => b.timestamp - a.timestamp || b.name.localeCompare(a.name))
    .slice(0, retention - 1)
    .map((entry) => entry.name);
  const keep = new Set([currentName, ...newestPredecessors]);
  const staleNames = managedNames.filter((name) => !keep.has(name));
  let pruned = 0;
  let failed = 0;
  for (const name of staleNames) {
    try {
      removeTree(join(backupsRoot, name), { recursive: true, force: false });
      pruned += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    limit: retention,
    managed_before: managedNames.length,
    retained: managedNames.length - pruned,
    pruned,
    failed,
    cleanup_failed: failed > 0,
  };
}

function fsyncPath(path, dependencies = {}) {
  const open = dependencies.openSync ?? openSync;
  const sync = dependencies.fsyncSync ?? fsyncSync;
  const close = dependencies.closeSync ?? closeSync;
  const fd = open(path, "r");
  try {
    sync(fd);
  } finally {
    close(fd);
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

/** Remove only old staging directories whose encoded owner PID is dead. */
export function reclaimStaleBackupStaging(backupsRoot, dependencies = {}) {
  const readEntries = dependencies.readdirSync ?? readdirSync;
  const inspect = dependencies.lstatSync ?? lstatSync;
  const removeTree = dependencies.stagingRmSync ?? rmSync;
  const isAlive = dependencies.processIsAlive ?? processIsAlive;
  const nowMs = dependencies.nowMs ?? Date.now();
  const staleMs = dependencies.stagingStaleMs ?? STAGING_BACKUP_STALE_MS;
  const result = {
    examined: 0,
    removed: 0,
    preserved_active: 0,
    preserved_fresh: 0,
    failed: 0,
    cleanup_failed: false,
  };
  for (const entry of readEntries(backupsRoot, { withFileTypes: true })) {
    const match = STAGING_BACKUP_DIR_RE.exec(entry.name);
    if (!match || entry.isSymbolicLink() || !entry.isDirectory()) continue;
    const path = join(backupsRoot, entry.name);
    let stat;
    try {
      stat = inspect(path);
    } catch {
      result.failed += 1;
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
    result.examined += 1;
    const ownerPid = Number(match[1]);
    if (isAlive(ownerPid)) {
      result.preserved_active += 1;
      continue;
    }
    const ageMs = Math.max(0, nowMs - stat.mtimeMs);
    if (ageMs < staleMs) {
      result.preserved_fresh += 1;
      continue;
    }
    try {
      removeTree(path, { recursive: true, force: false });
      result.removed += 1;
    } catch {
      result.failed += 1;
    }
  }
  result.cleanup_failed = result.failed > 0;
  return result;
}

/** Create a single-file, transactionally consistent snapshot (including WAL). */
export function backupSqliteDb(dbPath, dependencies = {}) {
  if (!existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const unique = process.hrtime.bigint().toString();
  const backupsRoot = join(dirname(dbPath), "backups");
  const backupDir = join(backupsRoot, `backend-api-${stamp}-${unique}`);
  const backupDb = join(backupDir, basename(dbPath));
  const stagingDir = join(backupsRoot, `.staging-backend-api-${process.pid}-${unique}`);
  const stagingDb = join(stagingDir, basename(dbPath));
  const runSqlite = dependencies.execFileSync ?? execFileSync;
  const publish = dependencies.renameSync ?? renameSync;
  const cleanup = dependencies.cleanupRmSync ?? rmSync;
  const syncPath = dependencies.fsyncPath ?? fsyncPath;
  mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  chmodSync(dirname(dbPath), 0o700);
  mkdirSync(backupsRoot, { recursive: true, mode: 0o700 });
  chmodSync(backupsRoot, 0o700);
  const stagingCleanup = reclaimStaleBackupStaging(backupsRoot, dependencies);
  let published = false;
  try {
    mkdirSync(stagingDir, { recursive: false, mode: 0o700 });
    chmodSync(stagingDir, 0o700);
    runSqlite(
      "sqlite3",
      ["-bail", "-cmd", ".timeout 5000", dbPath, `VACUUM INTO ${q(stagingDb)};`],
      { encoding: "utf-8" },
    );
    chmodSync(stagingDb, 0o600);
    syncPath(stagingDb, dependencies);
    syncPath(stagingDir, dependencies);
    // The managed name becomes visible only after VACUUM, permissions, and
    // durable file contents all succeed. Directory rename is atomic here.
    publish(stagingDir, backupDir);
    published = true;
    // The backup is not durable/publishable until its parent directory entry
    // is synced. Failure here aborts before retention or live DB replacement.
    syncPath(backupsRoot, dependencies);
  } catch {
    const failedPath = published ? backupDir : stagingDir;
    try { cleanup(failedPath, { recursive: true, force: true }); } catch {}
    throw new Error("SQLite backup creation failed");
  }

  let retention;
  let warning = stagingCleanup.cleanup_failed ? STAGING_WARNING : undefined;
  try {
    const pruneBackups = dependencies.pruneManagedBackups ?? pruneManagedBackups;
    retention = pruneBackups(dbPath, backupDir, dependencies);
    if (retention.cleanup_failed) warning = RETENTION_WARNING;
  } catch {
    // A valid new backup already exists. Retention is best-effort and must not
    // block the primary graph mirror or leak filesystem/credential details.
    retention = {
      limit: DEFAULT_BACKUP_RETENTION,
      managed_before: null,
      retained: null,
      pruned: 0,
      failed: 1,
      cleanup_failed: true,
    };
    warning = RETENTION_WARNING;
  }

  return {
    dir: backupDir,
    db: backupDb,
    staging_cleanup: stagingCleanup,
    retention,
    ...(warning ? { warning } : {}),
  };
}

function nodeInsertSql(row, nowTs) {
  return `
INSERT INTO graph_nodes(
  id, user_id, kind, title, subtitle, element, occurred_at_ts,
  source, source_ref, props_json, created_at_ts
) VALUES (
  ${q(row.id)}, ${q(row.user_id)}, ${q(row.kind)}, ${q(row.title)},
  ${sqlValue(row.subtitle)}, ${sqlValue(row.element)}, ${sqlValue(row.occurred_at_ts)},
  ${sqlValue(row.source)}, ${sqlValue(row.source_ref)}, ${q(jsonText(row.props_json))},
  ${sqlValue(row.created_at_ts ?? nowTs)}
);`;
}

function edgeInsertSql(row, nowTs) {
  return `
INSERT INTO graph_edges(
  id, user_id, src_id, dst_id, kind, label, weight, props_json, created_at_ts
) VALUES (
  ${q(row.id)}, ${q(row.user_id)}, ${q(row.src_id)}, ${q(row.dst_id)},
  ${q(row.kind)}, ${sqlValue(row.label)}, ${sqlValue(row.weight ?? 1)},
  ${q(jsonText(row.props_json))}, ${sqlValue(row.created_at_ts ?? nowTs)}
);`;
}

export function assertRowsBelongToUser(rows, userId) {
  const mismatched = [...rows.nodes, ...rows.edges].some(
    (row) => !row || typeof row !== "object" || row.user_id !== userId,
  );
  if (mismatched) {
    throw new Error("Backend graph snapshot returned a row outside its authenticated principal; mirror aborted");
  }
}

export function assertSnapshotIntegrity(rows, userId) {
  if (!rows || !Array.isArray(rows.nodes) || !Array.isArray(rows.edges)) {
    throw new Error("DaoBrew graph snapshot is malformed");
  }
  assertRowsBelongToUser(rows, userId);

  const nodeIds = new Set();
  for (const node of rows.nodes) {
    const id = node?.id;
    if (typeof id !== "string" || !id || id.trim() !== id || nodeIds.has(id)) {
      throw new Error("DaoBrew graph snapshot contains an invalid or duplicate node ID");
    }
    nodeIds.add(id);
  }
  const edgeIds = new Set();
  for (const edge of rows.edges) {
    const id = edge?.id;
    if (typeof id !== "string" || !id || id.trim() !== id || edgeIds.has(id)) {
      throw new Error("DaoBrew graph snapshot contains an invalid or duplicate edge ID");
    }
    edgeIds.add(id);
    const srcId = edge?.src_id;
    const dstId = edge?.dst_id;
    if (typeof srcId !== "string" || !srcId || srcId.trim() !== srcId
        || typeof dstId !== "string" || !dstId || dstId.trim() !== dstId) {
      throw new Error("DaoBrew graph snapshot contains an invalid edge endpoint ID");
    }
    if (!nodeIds.has(srcId) || !nodeIds.has(dstId)) {
      throw new Error("DaoBrew graph snapshot contains an edge outside the returned node set");
    }
  }
}

/** Read an authenticated, already tenant-scoped graph projection via HTTPS. */
export async function readBackendGraphRows(options = {}, dependencies = {}) {
  const expectedGeneration = validateGenerationId(options.expectedGeneration);
  const data = await requestBackendJson(
    `/graph/snapshot?expected_generation=${encodeURIComponent(expectedGeneration)}`,
    { method: "GET" },
    dependencies,
  );
  if (data.available === false) {
    throw new Error("DaoBrew graph snapshot is currently unavailable");
  }
  if (data.generation_id !== expectedGeneration) {
    throw new Error("DaoBrew graph snapshot generation did not match the causal run");
  }
  if (data.schema_version !== 1) {
    throw new Error("DaoBrew graph snapshot schema version is unsupported");
  }
  const principalId = validateUserId(data.principal?.user_id);
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error("DaoBrew graph snapshot is malformed");
  }
  const rows = {
    nodes: data.nodes,
    edges: data.edges,
    ghostStatusCounts: Array.isArray(data.ghost_status_counts)
      ? data.ghost_status_counts
      : [],
  };
  assertSnapshotIntegrity(rows, principalId);
  return { principalId, rows, generationId: expectedGeneration };
}

export function secureSqliteArtifacts(dbPath) {
  const directory = dirname(dbPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const base = basename(dbPath);
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    if (name === base || name === `${base}-wal` || name === `${base}-shm`
        || name.startsWith(`${base}.tmp-`)) {
      const path = join(directory, name);
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  }
}

function execSqliteTransaction(dbPath, sql) {
  // -bail is essential: if any INSERT violates the SQLite contract, the CLI
  // exits while the transaction is still open and SQLite rolls everything
  // back instead of committing the preceding DELETE statements.
  try {
    execFileSync(
      "sqlite3",
      ["-bail", "-cmd", ".timeout 5000", dbPath],
      {
        encoding: "utf-8",
        input: sql,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch {
    // Keep the CLI boundary private and emit a stable, non-sensitive error.
    throw new Error("SQLite active-user mirror transaction failed");
  }
}

function numericReadback(row) {
  if (!row) return null;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  );
}

export async function writeSqliteRows(
  graphDb,
  ensureSchema,
  options,
  rows,
  dependencies = {},
) {
  assertSnapshotIntegrity(rows, options.userId);
  setStore("sqlite", options.dbPath);
  secureSqliteArtifacts(options.dbPath);
  ensureSchema(options.dbPath);
  secureSqliteArtifacts(options.dbPath);

  const backupFn = dependencies.backupSqliteDb ?? backupSqliteDb;
  const backup = options.backup
    ? backupFn(options.dbPath, dependencies.backupDependencies)
    : null;
  const nowTs = Math.floor(Date.now() / 1000);
  const sql = [
    "BEGIN IMMEDIATE;",
    // SentinelGraphStore reads the whole SQLite graph. This DB is therefore
    // a one-user projection: retaining another user's or demo rows is unsafe.
    "DELETE FROM graph_edges;",
    "DELETE FROM graph_nodes;",
    ...rows.nodes.map((row) => nodeInsertSql(row, nowTs)),
    ...rows.edges.map((row) => edgeInsertSql(row, nowTs)),
    "COMMIT;",
  ].join("\n");
  (dependencies.execSqliteTransaction ?? execSqliteTransaction)(options.dbPath, sql);
  secureSqliteArtifacts(options.dbPath);

  let readbackRows;
  try {
    readbackRows = await graphDb.queryJson(`
      SELECT
        (SELECT count(*) FROM graph_nodes) AS graph_nodes,
        (SELECT count(*) FROM graph_edges) AS graph_edges,
        (SELECT count(*) FROM graph_nodes WHERE user_id = ${q(options.userId)}) AS active_user_nodes,
        (SELECT count(*) FROM graph_edges WHERE user_id = ${q(options.userId)}) AS active_user_edges,
        (SELECT count(*) FROM graph_nodes WHERE user_id <> ${q(options.userId)}) AS foreign_user_nodes,
        (SELECT count(*) FROM graph_edges WHERE user_id <> ${q(options.userId)}) AS foreign_user_edges
    `);
  } catch {
    throw new Error("SQLite active-user mirror readback failed");
  }
  const readback = numericReadback(readbackRows[0] ?? null);
  const verified = readback
    && readback.graph_nodes === rows.nodes.length
    && readback.graph_edges === rows.edges.length
    && readback.active_user_nodes === rows.nodes.length
    && readback.active_user_edges === rows.edges.length
    && readback.foreign_user_nodes === 0
    && readback.foreign_user_edges === 0;
  if (!verified) {
    throw new Error("SQLite active-user mirror readback did not match backend snapshot row counts");
  }

  secureSqliteArtifacts(options.dbPath);

  return { backup, readback };
}

function restoreEnv(previousEnv) {
  if (previousEnv.DAOBREW_GRAPH_STORE === undefined) delete process.env.DAOBREW_GRAPH_STORE;
  else process.env.DAOBREW_GRAPH_STORE = previousEnv.DAOBREW_GRAPH_STORE;
  if (previousEnv.DAOBREW_GRAPH_DB === undefined) delete process.env.DAOBREW_GRAPH_DB;
  else process.env.DAOBREW_GRAPH_DB = previousEnv.DAOBREW_GRAPH_DB;
}

export async function runMirror(options, dependencies = {}) {
  const previousEnv = {
    DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
    DAOBREW_GRAPH_DB: process.env.DAOBREW_GRAPH_DB,
  };

  try {
    const { principalId, rows, generationId } = await readBackendGraphRows(options, dependencies);
    const normalized = { ...options, userId: principalId };

    const common = {
      principal_scope: {
        authenticated: true,
        server_resolved: true,
      },
      sqlite_db: normalized.dbPath,
      generation_id: generationId,
      api_rows: {
        graph_nodes: rows.nodes.length,
        graph_edges: rows.edges.length,
        ghost_status_counts: rows.ghostStatusCounts,
      },
    };
    if (normalized.dryRun) return { status: "dry_run", ...common };

    const written = await writeSqliteRows(
      dependencies.graphDb,
      dependencies.ensureSchema,
      normalized,
      rows,
      dependencies,
    );
    const backupWarning = written.backup?.warning;
    const backup = written.backup
      ? Object.fromEntries(Object.entries(written.backup).filter(([key]) => key !== "warning"))
      : null;
    return {
      status: "synced",
      ...common,
      active_user_mirror: true,
      backup,
      warnings: backupWarning ? [backupWarning] : [],
      sqlite_readback: written.readback,
    };
  } finally {
    restoreEnv(previousEnv);
  }
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.causalRunOnly) {
    const result = await runCausalThroughBackend(options);
    console.log(JSON.stringify(result));
    return;
  }
  const { ensureSchema } = requireDist(DIST_SCHEMA);
  const graphDb = requireDist(DIST_GRAPH_DB);
  const result = await runMirror(options, {
    ensureSchema,
    graphDb,
  });
  console.log(JSON.stringify(result));
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMainModule() && process.argv[2] === LOCKED_CONFIG_READ_MODE) {
  try {
    const value = readBackendConfigLocked(process.argv[3]);
    process.stdout.write(JSON.stringify({ ok: true, value }));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: err?.message ?? String(err),
    }));
  }
} else if (isMainModule()) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }));
    process.exitCode = 1;
  });
}
