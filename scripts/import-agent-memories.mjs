#!/usr/bin/env node
// Import real local agent session memories into the DaoBrew user_insights table.
//
// This reads Codex/Claude project session JSONL files as source material for
// local user memory. It does not write back into Codex or Claude memory.
//
// Parsing lives in dist/src/engine/sources/claudeMemory.js and Postgres writes
// go through dist/src/engine/ingest/sink.js. The SQLite path remains only for
// backward compatibility; warm-tier ingest is Postgres-first.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const DIST_SCHEMA = "../dist/src/engine/schema.js";
const DIST_GRAPH_DB = "../dist/src/graph-db.js";
const DIST_CLAUDE_MEMORY = "../dist/src/engine/sources/claudeMemory.js";
const DIST_SINK = "../dist/src/engine/ingest/sink.js";

function usage() {
  return [
    "Usage: node scripts/import-agent-memories.mjs --user-id USER_ID [--postgres-db|--sqlite-db] [--db PATH] [--project PATH] [--prune-fixtures] [--dry-run]",
    "",
    "Examples:",
    "  node scripts/import-agent-memories.mjs --user-id 14802294-BEED-480E-ABF6-7E3703FA25CD --dry-run",
    "  node scripts/import-agent-memories.mjs --user-id 14802294-BEED-480E-ABF6-7E3703FA25CD --postgres-db --dry-run",
    "  node scripts/import-agent-memories.mjs --user-id 14802294-BEED-480E-ABF6-7E3703FA25CD --postgres-db --prune-fixtures",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    dbPath: process.env.DAOBREW_GRAPH_DB || join(homedir(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db"),
    projectPath: "/Users/yz/DaobrewAI",
    userId: null,
    store: null,
    pruneFixtures: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--postgres-db") {
      options.store = "postgres";
    } else if (arg === "--sqlite-db") {
      options.store = "sqlite";
    } else if (arg === "--prune-fixtures") {
      options.pruneFixtures = true;
    } else if (arg === "--db") {
      options.dbPath = argv[++i];
    } else if (arg.startsWith("--db=")) {
      options.dbPath = arg.slice("--db=".length);
    } else if (arg === "--project") {
      options.projectPath = argv[++i];
    } else if (arg.startsWith("--project=")) {
      options.projectPath = arg.slice("--project=".length);
    } else if (arg === "--user-id") {
      options.userId = argv[++i];
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requireUserId(userId) {
  const trimmed = String(userId ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "local") {
    throw new Error("--user-id is required and must be a real canonical user id; 'local' is not an identity");
  }
  return trimmed;
}

function applyStoreOverride(options) {
  if (options.store) process.env.DAOBREW_GRAPH_STORE = options.store;
}

function resolvedStore(options) {
  if (options.store) return options.store;
  const explicit = (process.env.DAOBREW_GRAPH_STORE || "").trim().toLowerCase();
  if (["postgres", "postgresql", "pg"].includes(explicit)) return "postgres";
  if (["sqlite", "sqlite3"].includes(explicit)) return "sqlite";
  return process.env.DAOBREW_POSTGRES_URL ? "postgres" : "sqlite";
}

function targetDescription(store, options) {
  if (store === "postgres") {
    return `postgres:${process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai"}/${process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth"}`;
  }
  return options.dbPath;
}

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build before this importer. ${err.message}`);
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function truncate(value, limit) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

const CAPSULE_DEFS = [
  {
    key: "ai2-demo-readiness",
    title: "AI2 demo readiness",
    topics: ["#project-memory", "#ai2", "#demo-readiness", "#investor-facing"],
    importance: 0.94,
    matches: /(ai2|incubator|investor|demo|founder|pitch)/i,
    summary: "AI2 demo readiness: local project memory links AI2/investor-facing work to historical replay, evidence quality, and the requirement that real source rows replace demo rows without changing the graph grammar.",
  },
  {
    key: "backend-uid-source-tables",
    title: "Backend UID and source-table migration",
    topics: ["#project-memory", "#backend-uid", "#postgres", "#source-tables"],
    importance: 0.93,
    matches: /(uuid|device|x-device-id|postgres|source table|user_insights|meeting_notes|events|migration|import|cloud run|backend)/i,
    summary: "Backend UID and source-table migration: local project memory tracks the Sentinel device UID path, Cloud Run backend, Postgres live runtime, and the events/meeting_notes/user_insights source-table import contract.",
  },
  {
    key: "sentinel-graph-ui-repair",
    title: "Sentinel graph UI repair",
    topics: ["#project-memory", "#sentinel-ui", "#patterns-graph"],
    importance: 0.91,
    matches: /(sentinel|swift|ui|screenshot|snapshot|graph|pattern|inspector|canvas)/i,
    summary: "Sentinel graph UI repair: local project memory says the app must preserve the five-pattern demo graph structure while replacing demo nodes with real source-backed calendar, meeting, biometric, and memory evidence.",
  },
  {
    key: "detonator-entitlement-gate",
    title: "Detonator entitlement gate",
    topics: ["#project-memory", "#detonator", "#entitlement"],
    importance: 0.88,
    matches: /(detonator|entitlement|license|paid|paywall|not_entitled)/i,
    summary: "Detonator entitlement gate: local project memory records that the paid Detonator close-loop remains gated and must not be bypassed or marked complete without an issued license or explicit approval.",
  },
  {
    key: "loop-handoff-verification",
    title: "Loop handoff and verification",
    topics: ["#project-memory", "#loop", "#handoff", "#verification"],
    importance: 0.86,
    matches: /(loop|tracker|handoff|verification|session|continuation|gpt-5\.5|xhigh|fast mode)/i,
    summary: "Loop handoff and verification: local project memory records the operating rule for this branch: read loop docs first, keep checkpoints scoped, verify with commands, update tracker/handoff, and preserve existing uncommitted work.",
  },
];

function buildCapsuleRows(rawRows, projectPath) {
  const capsules = [];
  for (const def of CAPSULE_DEFS) {
    const matches = rawRows.filter((row) => def.matches.test(row.insight_text));
    if (matches.length === 0) continue;
    const latest = matches
      .map((row) => row.occurred_at_ts)
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => b - a)[0] ?? null;
    const summary = `${def.summary} Backing evidence: ${matches.length} local project-history session(s). Raw session refs are hidden from the graph UI.`;
    capsules.push({
      id: `codex_project_capsule_${hash(`${projectPath}:${def.key}`)}`,
      source: "codex_project_capsule",
      source_ref: `project:${projectPath}#${def.key}`,
      insight_text: truncate(summary, 1100),
      topics: def.topics,
      importance: def.importance,
      strength: 1,
      occurred_at_ts: latest,
      last_accessed_ts: null,
    });
  }
  return capsules;
}

function sqlite(dbPath, sql) {
  return execFileSync("sqlite3", ["-cmd", ".timeout 5000", dbPath, sql], { encoding: "utf-8" });
}

function rowSqliteSql(row, userId, nowTs) {
  return `
INSERT OR REPLACE INTO user_insights(
  id, user_id, source, source_ref, insight_text, topics_json,
  importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
) VALUES (
  ${q(row.id)}, ${q(userId)}, ${q(row.source)}, ${q(row.source_ref)}, ${q(row.insight_text)}, ${q(JSON.stringify(row.topics))},
  ${row.importance}, ${row.strength}, ${row.occurred_at_ts ?? "NULL"}, NULL, ${nowTs}
);`;
}

function buildRows(projectPath) {
  const { buildMemoryRows } = requireDist(DIST_CLAUDE_MEMORY);
  const rawRows = buildMemoryRows({ projectPath });
  const rows = [
    ...rawRows,
    ...buildCapsuleRows(rawRows, projectPath),
  ];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.source}:${row.source_ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pruneSql() {
  return `
DELETE FROM events WHERE id LIKE 'fixture-%';
DELETE FROM meeting_notes WHERE id LIKE 'fixture-%';
DELETE FROM user_insights
 WHERE id LIKE 'fixture-%'
    OR (source = 'claude_sessions' AND source_ref LIKE 'p1-hardening.md:%');
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.userId = requireUserId(options.userId);
  applyStoreOverride(options);
  const store = resolvedStore(options);
  if (store === "sqlite") {
    console.warn("Warning: warm-tier ingest is Postgres-first; the SQLite path is a temporary compatibility fallback.");
  }
  const rows = buildRows(options.projectPath);
  const sourceCounts = rows.reduce((acc, row) => {
    acc[row.source] = (acc[row.source] ?? 0) + 1;
    return acc;
  }, {});

  if (options.dryRun) {
    console.log(JSON.stringify({
      status: "dry_run",
      target_store: store,
      target: targetDescription(store, options),
      sqlite_backup_input: options.dbPath,
      project: options.projectPath,
      prune_fixtures: options.pruneFixtures,
      import_rows: rows.length,
      source_counts: sourceCounts,
      sample_refs: rows.slice(0, 5).map((row) => row.source_ref),
    }, null, 2));
    return;
  }

  const { ensureSchema } = requireDist(DIST_SCHEMA);
  const { graphStoreDescription, graphStoreKind, execSql } = requireDist(DIST_GRAPH_DB);
  ensureSchema(options.dbPath);
  const activeStore = graphStoreKind();
  const nowTs = Math.floor(Date.now() / 1000);

  let ingestResult = null;
  if (activeStore === "postgres") {
    const { PostgresIngestSink } = requireDist(DIST_SINK);
    if (options.pruneFixtures) await execSql(pruneSql());
    const sink = new PostgresIngestSink();
    ingestResult = await sink.upsertInsights(options.userId, rows);
  } else {
    const importSql = [
      "BEGIN IMMEDIATE;",
      options.pruneFixtures ? pruneSql() : "",
      ...rows.map((row) => rowSqliteSql(row, options.userId, nowTs)),
      "COMMIT;",
    ].join("\n");
    sqlite(options.dbPath, importSql);
  }

  const countSql = `
SELECT source || ':' || count(*)
  FROM user_insights
 WHERE user_id=${q(options.userId)}
 GROUP BY source
 ORDER BY source;
`;
  const { execSqlSync } = requireDist(DIST_GRAPH_DB);
  const counts = (activeStore === "postgres" ? execSqlSync(countSql) : sqlite(options.dbPath, countSql))
    .trim()
    .split("\n")
    .filter(Boolean);

  console.log(JSON.stringify({
    status: "imported",
    target_store: activeStore,
    target: activeStore === "postgres" ? graphStoreDescription() : options.dbPath,
    sqlite_backup_input: options.dbPath,
    project: options.projectPath,
    prune_fixtures: options.pruneFixtures,
    imported_rows: rows.length,
    rows_written: ingestResult?.rowsWritten ?? rows.length,
    dedup_skips: ingestResult?.dedupSkips ?? 0,
    source_counts: sourceCounts,
    user_insights_counts: counts,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
  process.exit(1);
});
