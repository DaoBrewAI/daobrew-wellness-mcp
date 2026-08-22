#!/usr/bin/env node
// One-shot warm-tier data migration: local Docker Postgres -> Neon.
//
// Copies rows for a single canonical UUID user from the warm-tier
// tables into Neon, applying a hygiene filter that drops seeded demo/fixture
// rows (id LIKE 'fixture%' OR source_ref LIKE 'project:/Users/yz%').
//
// Deliberately NOT migrated:
//   - pipeline_metrics            (fresh operational history starts on Neon)
//   - population_priors           (empty / regenerable)
//   - transfer_records            (empty / regenerable)
//   - user_vectors                (regenerable)
//   - intervention_assignments    (only if the user has 0 rows; checked at runtime)
//   - test users (local, session2-*) — excluded by the user_id scope
//
// Embeddings: written as NULL on Neon by design. Local rows do have halfvec
// embeddings, but hand-escaping halfvec literals through psql stdin is
// fragile; the Neon embed sweep regenerates them from the row text anyway,
// so we skip the embedding column entirely (it defaults to NULL).
//
// Reads:  docker exec daobrew-local-postgres psql ... with per-table
//         SELECT jsonb_agg(to_jsonb(t)) — one JSON payload per table, no
//         TSV escaping issues.
// Writes: dist/src/graph-db.js in URL mode (DAOBREW_POSTGRES_URL from the
//         repo .env DATABASE_URL), multi-row INSERT ... ON CONFLICT DO
//         NOTHING batches (idempotent re-runs).
//
// Usage:
//   node scripts/migrate-local-truth-to-neon.mjs --dry-run
//   node scripts/migrate-local-truth-to-neon.mjs
//   node scripts/migrate-local-truth-to-neon.mjs --env /path/to/.env

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const LOCAL_CONTAINER = "daobrew-local-postgres";
const LOCAL_USER = "daobrew";
const LOCAL_DB = "daobrew_local_truth";
const BATCH_SIZE = 100;

// Migration order keeps referential sanity (threads before evidence, etc.).
// columns: migrated columns in insert order. Embedding columns are omitted
// on purpose (see header comment).
// hasSourceRef: apply the project:/Users/yz% capsule filter.
// hasId: apply the fixture% id-prefix filter.
const TABLES = [
  {
    name: "events",
    hasId: true,
    hasSourceRef: true,
    columns: [
      "id", "user_id", "source", "source_ref", "title", "start_ts", "end_ts",
      "all_day", "attendee_count", "attendees_json", "calendar_name",
      "location", "metadata_json", "created_at_ts",
    ],
  },
  {
    name: "meeting_notes",
    hasId: true,
    hasSourceRef: true,
    columns: [
      "id", "user_id", "source", "source_ref", "event_id", "kind", "title",
      "occurred_at_ts", "duration_sec", "participants_json", "summary",
      "body", "transcript_spans_json", "topics_json", "created_at_ts",
    ],
  },
  {
    name: "user_insights",
    hasId: true,
    hasSourceRef: true,
    columns: [
      "id", "user_id", "source", "source_ref", "insight_text", "topics_json",
      "importance", "strength", "occurred_at_ts", "last_accessed_ts",
      "created_at_ts",
    ],
  },
  {
    name: "graph_nodes",
    hasId: true,
    hasSourceRef: true,
    columns: [
      "id", "user_id", "kind", "title", "subtitle", "element",
      "occurred_at_ts", "source", "source_ref", "props_json", "created_at_ts",
    ],
  },
  {
    name: "graph_edges",
    hasId: true,
    hasSourceRef: false,
    columns: [
      "id", "user_id", "src_id", "dst_id", "kind", "label", "weight",
      "props_json", "created_at_ts",
    ],
  },
  {
    name: "causal_memory_threads",
    hasId: true,
    hasSourceRef: false,
    columns: [
      "id", "user_id", "thread_key", "key_version", "graph_root_id", "title",
      "summary", "claim_level", "status", "pattern_keys_json",
      "recurrence_count", "first_seen_ts", "last_seen_ts",
      "last_reinforced_ts", "strength", "decay_state", "promotion_state_json",
      "created_at_ts", "updated_at_ts",
    ],
  },
  {
    name: "causal_thread_evidence",
    hasId: true,
    hasSourceRef: true,
    columns: [
      "id", "thread_id", "user_id", "evidence_kind", "source_table",
      "source_id", "source_ref", "graph_node_id", "graph_edge_id",
      "claim_level", "pattern_key", "evidence_role", "observed_at_ts",
      "weight", "metadata_json", "created_at_ts",
    ],
  },
  {
    name: "user_model_snapshots",
    hasId: true,
    hasSourceRef: false,
    columns: [
      "id", "user_id", "version", "snapshot_text", "source_thread_ids_json",
      "claim_ceiling", "generated_from_count", "prompt_tokens_estimate",
      "created_at_ts",
    ],
  },
  {
    name: "thread_verifications",
    hasId: true,
    hasSourceRef: false,
    columns: [
      "id", "user_id", "thread_id", "thread_key", "graph_root_id", "kind",
      "observation", "handled_at_ts", "horizon_weeks", "predicted_outcome",
      "observed_outcome", "observed_pattern_key", "observed_week_start",
      "verdict", "observed_at_ts", "details_json", "created_at_ts",
    ],
  },
  {
    name: "transfer_consent",
    hasId: false,
    hasSourceRef: false,
    columns: ["user_id", "opted_in", "updated_at_ts"],
  },
];

// JSONB columns per table (stringified + cast ::jsonb on insert).
const JSONB_COLUMNS = new Set([
  "attendees_json", "metadata_json", "participants_json",
  "transcript_spans_json", "topics_json", "props_json", "pattern_keys_json",
  "promotion_state_json", "source_thread_ids_json", "details_json",
]);
const BOOLEAN_COLUMNS = new Set(["opted_in", "all_day"]);

function usage() {
  return [
    "Usage: node scripts/migrate-local-truth-to-neon.mjs [--dry-run] [--user-id UUID] [--env PATH]",
    "",
    "Copies warm-tier rows for one user from local Docker Postgres to Neon,",
    "excluding fixture/demo-capsule rows. Idempotent (ON CONFLICT DO NOTHING).",
    "--dry-run reads local counts only and never connects to Neon.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { userId: null, dryRun: false, envPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--user-id") {
      options.userId = argv[++i];
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else if (arg === "--env") {
      options.envPath = argv[++i];
    } else if (arg.startsWith("--env=")) {
      options.envPath = arg.slice("--env=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.userId = requireCanonicalUserId(options.userId ?? process.env.DAOBREW_USER_ID ?? configUserId());
  return options;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

function requireCanonicalUserId(value) {
  const userId = canonicalUserId(value);
  if (!userId) {
    throw new Error("canonical UUID user_id is required; pass --user-id, set DAOBREW_USER_ID, or run setup");
  }
  return userId;
}

function configUserId() {
  try {
    const raw = readFileSync(join(homedir(), ".daobrew", "config.json"), "utf8");
    return canonicalUserId(JSON.parse(raw)?.user_id);
  } catch {
    return null;
  }
}

function parseEnvFile(path) {
  const env = {};
  const text = readFileSync(path, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadDatabaseUrl(envPath) {
  const candidates = envPath
    ? [resolve(envPath)]
    : [join(REPO_ROOT, ".env"), resolve(SCRIPT_DIR, "..", ".env")];
  for (const candidate of candidates) {
    try {
      const env = parseEnvFile(candidate);
      if (env.DATABASE_URL) return env.DATABASE_URL;
    } catch {
      // Try the next candidate.
    }
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.DAOBREW_POSTGRES_URL) return process.env.DAOBREW_POSTGRES_URL;
  throw new Error("No DATABASE_URL found. Pass --env PATH or set DATABASE_URL.");
}

/** Local single-quote escape (mirrors graph-db q(); kept local so the read
 *  side works even if dist exports change). */
function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runLocalPsql(sql) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "docker",
      [
        "exec", "-i", LOCAL_CONTAINER,
        "psql", "-U", LOCAL_USER, "-d", LOCAL_DB,
        "-v", "ON_ERROR_STOP=1", "-At",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || err.message));
        else resolvePromise(stdout);
      },
    ).stdin.end(sql);
  });
}

async function readLocalJson(sql) {
  const body = sql.trim().replace(/;+\s*$/, "");
  const wrapped = `SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text FROM (${body}) t;`;
  const out = (await runLocalPsql(wrapped)).trim();
  return out ? JSON.parse(out) : [];
}

function hygienePredicate(table) {
  const clauses = [];
  if (table.hasId) clauses.push("id LIKE 'fixture%'");
  if (table.hasSourceRef) clauses.push("source_ref LIKE 'project:/Users/yz%'");
  return clauses.length ? `(${clauses.join(" OR ")})` : null;
}

function sqlLiteral(column, value) {
  if (value === null || value === undefined) return "NULL";
  if (JSONB_COLUMNS.has(column)) return `${q(JSON.stringify(value))}::jsonb`;
  if (BOOLEAN_COLUMNS.has(column) && typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return q(value);
}

function buildInsertBatches(table, rows) {
  const statements = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const values = chunk
      .map((row) => `(${table.columns.map((col) => sqlLiteral(col, row[col])).join(", ")})`)
      .join(",\n");
    statements.push(
      `INSERT INTO ${table.name} (${table.columns.join(", ")})\nVALUES\n${values}\nON CONFLICT DO NOTHING;`,
    );
  }
  return statements;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const userId = options.userId;
  const report = [];

  // intervention_assignments: include only if the user actually has rows.
  const [{ n: interventionCount }] = await readLocalJson(
    `SELECT count(*)::int AS n FROM intervention_assignments WHERE user_id = ${q(userId)}`,
  );
  const tables = [...TABLES];
  if (interventionCount > 0) {
    tables.push({
      name: "intervention_assignments",
      hasId: true,
      hasSourceRef: false,
      columns: [
        "id", "user_id", "ghost_id", "thread_key", "stress_pattern",
        "root_cause_class", "eligible_actions_json", "assigned_action",
        "assignment_probability", "route_policy", "artifact_done",
        "user_acceptance", "closed_at_ts", "created_at_ts",
      ],
    });
    JSONB_COLUMNS.add("eligible_actions_json");
    console.log(`intervention_assignments: ${interventionCount} rows for ${userId} -> INCLUDED`);
  } else {
    console.log(`intervention_assignments: 0 rows for ${userId} -> skipped`);
  }

  // ---- Read phase (local) ----
  const perTable = new Map();
  for (const table of tables) {
    const scope = `user_id = ${q(userId)}`;
    const [{ n: read }] = await readLocalJson(
      `SELECT count(*)::int AS n FROM ${table.name} WHERE ${scope}`,
    );
    const hygiene = hygienePredicate(table);
    const cleanWhere = hygiene ? `${scope} AND NOT ${hygiene}` : scope;
    const rows = await readLocalJson(
      `SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE ${cleanWhere} ORDER BY ${table.hasId ? "id" : "user_id"}`,
    );
    perTable.set(table.name, {
      read,
      skippedContaminated: read - rows.length,
      rows,
    });
  }

  if (options.dryRun) {
    console.log("\nDRY RUN (no Neon connection):");
    for (const table of tables) {
      const { read, skippedContaminated, rows } = perTable.get(table.name);
      report.push({ table: table.name, read, skippedContaminated, wouldWrite: rows.length });
    }
    console.table(report);
    return;
  }

  // ---- Write phase (Neon via graph-db URL mode) ----
  process.env.DAOBREW_POSTGRES_URL = loadDatabaseUrl(options.envPath);
  process.env.DAOBREW_GRAPH_STORE = "postgres";
  const graphDb = require("../dist/src/graph-db.js");

  for (const table of tables) {
    const entry = perTable.get(table.name);
    if (entry.rows.length === 0) {
      entry.written = 0;
      continue;
    }
    const [{ n: before }] = await graphDb.queryJson(
      `SELECT count(*)::int AS n FROM ${table.name} WHERE user_id = ${q(userId)}`,
    );
    for (const statement of buildInsertBatches(table, entry.rows)) {
      await graphDb.execSql(statement);
    }
    const [{ n: after }] = await graphDb.queryJson(
      `SELECT count(*)::int AS n FROM ${table.name} WHERE user_id = ${q(userId)}`,
    );
    entry.written = after - before;
    entry.neonCount = after;
  }

  console.log("\nMIGRATION RESULT:");
  for (const table of tables) {
    const { read, skippedContaminated, written } = perTable.get(table.name);
    report.push({ table: table.name, read, skippedContaminated, written: written ?? 0 });
  }
  console.table(report);

  // Read-back: per-table user-scoped Neon counts (also covers written:0 tables).
  console.log("\nNEON READ-BACK (user-scoped counts):");
  const readBack = [];
  for (const table of tables) {
    const [{ n }] = await graphDb.queryJson(
      `SELECT count(*)::int AS n FROM ${table.name} WHERE user_id = ${q(userId)}`,
    );
    readBack.push({ table: table.name, neonCount: n });
  }
  console.table(readBack);

  // Contamination check on Neon across all filtered tables.
  console.log("CONTAMINATION CHECK (must all be 0):");
  const contamination = [];
  for (const table of tables) {
    const hygiene = hygienePredicate(table);
    if (!hygiene) continue;
    const [{ n }] = await graphDb.queryJson(
      `SELECT count(*)::int AS n FROM ${table.name} WHERE user_id = ${q(userId)} AND ${hygiene}`,
    );
    contamination.push({ table: table.name, contaminated: n });
  }
  console.table(contamination);
  const dirty = contamination.filter((c) => c.contaminated > 0);
  if (dirty.length > 0) {
    throw new Error(`Contaminated rows found on Neon: ${JSON.stringify(dirty)}`);
  }
}

main().catch((err) => {
  console.error(`migrate-local-truth-to-neon failed: ${err.message}`);
  process.exit(1);
});
