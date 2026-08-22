#!/usr/bin/env node
// Read-only preflight checker for the transfer-learning real-data verification
// run (P0). Verifies the environment is armed BEFORE a manual engine run:
// graph store kind, Postgres reachability + transfer tables, RLS coverage +
// connection-role bypass, salt/consent/key gates, and informational counts.
// Performs ZERO writes to any database — every query is a SELECT; fixes are
// printed as suggestions, never executed.
//
// Usage:
//   node scripts/transfer-preflight.mjs --user-id=14802294-BEED-480E-ABF6-7E3703FA25CD
//
// Env contract (same as the engine):
//   DAOBREW_GRAPH_STORE=postgres        (or DAOBREW_POSTGRES_URL for direct mode)
//   DAOBREW_POSTGRES_DB / _USER / _PASSWORD / _PORT   (compose mode)
//   DAOBREW_TRANSFER_SALT               (presence reported; value never printed)
//   GEMINI_API_KEY | GOOGLE_API_KEY | ~/.daobrew/config.json gemini_api_key
//
// Exit code: 0 if no FAIL lines, 1 otherwise. WARN never fails the run.

import { graphStoreKind, q, queryJson } from "../dist/src/graph-db.js";
import { resolveGeminiApiKey } from "../dist/src/engine/local-config.js";
import { PERMISSIVE_TABLES, USER_SCOPED_TABLES } from "../dist/src/engine/postgres-rls.js";

const REQUIRED_TABLES = [
  "transfer_records",
  "transfer_consent",
  "user_vectors",
  "intervention_assignments",
  "population_priors",
];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonicalUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed !== value || !UUID_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log([
    "Usage: node scripts/transfer-preflight.mjs --user-id=UUID",
    "",
    "Read-only gate checker for the transfer verification run. Prints one",
    "PASS/WARN/FAIL line per check and exits non-zero if any check FAILs.",
    "Never writes to any database and never prints secret values.",
  ].join("\n"));
  process.exit(0);
}

const userId = canonicalUserId(argValue("user-id", process.env.DAOBREW_USER_ID));
if (!userId) {
  console.error("FAIL user identity — pass --user-id=UUID or set DAOBREW_USER_ID to a canonical UUID");
  process.exit(1);
}
const results = [];

function record(status, label, detail) {
  results.push({ status, label, detail });
  console.log(`${status} ${label} — ${detail}`);
}

function firstLine(err) {
  return String(err?.message || err).split("\n")[0].trim();
}

// 1. Graph store kind — transfer pipeline (pgvector kNN, priors) is Postgres-only.
const storeKind = graphStoreKind();
if (storeKind === "postgres") {
  record("PASS", "graph store", "postgres");
} else {
  record("WARN", "graph store", `${storeKind} — transfer pipeline is Postgres-only; set DAOBREW_GRAPH_STORE=postgres`);
}

// 2. Postgres reachable + required tables exist.
let tablesOk = false;
if (storeKind !== "postgres") {
  record("WARN", "postgres tables", "skipped (graph store is not postgres)");
} else {
  try {
    const inList = REQUIRED_TABLES.map((t) => q(t)).join(", ");
    const rows = await queryJson(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN (${inList})`,
    );
    const present = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    if (missing.length === 0) {
      tablesOk = true;
      record("PASS", "postgres tables", `all present (${REQUIRED_TABLES.join(", ")})`);
    } else {
      for (const table of missing) {
        record("FAIL", `table ${table}`, "missing — run backend Alembic migrations through revision 0015_shared_graph_schema");
      }
    }
  } catch (err) {
    record("FAIL", "postgres reachable", firstLine(err));
  }
}

// 2b. Row-level security coverage — RLS must be enabled on every public table
// (deny-by-default per-user policies; see src/engine/postgres-rls.ts). Owner
// sessions bypass RLS (ENABLE, not FORCE), so this only reports the DDL state.
const truthy = (v) => v === true || v === "t" || v === "true" || v === 1;
if (storeKind !== "postgres") {
  record("WARN", "rls", "skipped (graph store is not postgres)");
} else {
  try {
    const known = [...USER_SCOPED_TABLES, ...PERMISSIVE_TABLES];
    const expected = known.length;
    // Name-filtered: an unrelated RLS-enabled table must not mask a missing one.
    const rows = await queryJson(
      `SELECT count(*)::int AS enabled FROM pg_tables WHERE schemaname = 'public' AND rowsecurity AND tablename IN (${known.map((t) => `'${t}'`).join(", ")})`,
    );
    const enabled = rows[0]?.enabled ?? 0;
    if (enabled >= expected) {
      record("PASS", "rls", `enabled on ${enabled}/${expected} tables`);
    } else {
      record("WARN", "rls", `enabled on ${enabled}/${expected} tables — run backend Alembic migrations, then provision the app role with scripts/provision-app-role.mjs`);
    }
  } catch (err) {
    record("FAIL", "rls", firstLine(err));
  }
}

// 2c. Connection role — superuser / BYPASSRLS / table-owner sessions are not
// subject to RLS, so isolation is only enforced once the runtime connects as
// the app role (scripts/provision-app-role.mjs).
if (storeKind !== "postgres") {
  record("WARN", "connection role", "skipped (graph store is not postgres)");
} else {
  try {
    const rows = await queryJson(
      `SELECT current_user AS role, rolsuper, rolbypassrls,
              (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owned_tables
       FROM pg_roles WHERE rolname = current_user`,
    );
    const row = rows[0] ?? {};
    const owned = Number(row.owned_tables ?? 0);
    const reasons = [
      truthy(row.rolbypassrls) ? "BYPASSRLS" : null,
      truthy(row.rolsuper) ? "superuser" : null,
      owned > 0 ? `owns ${owned} public tables` : null,
    ].filter(Boolean);
    if (reasons.length > 0) {
      record("WARN", "connection role", `${row.role} (${reasons.join(", ")}) — owner connection, RLS not enforced on this session`);
    } else {
      record("PASS", "connection role", `${row.role} (NOBYPASSRLS, non-owner) — RLS enforced on this session`);
    }
  } catch (err) {
    record("FAIL", "connection role", firstLine(err));
  }
}

// 3. Transfer salt — presence only, value never printed.
if ((process.env.DAOBREW_TRANSFER_SALT || "").trim()) {
  record("PASS", "DAOBREW_TRANSFER_SALT", "set (value not shown)");
} else {
  record("WARN", "DAOBREW_TRANSFER_SALT", "absent — emission fail-closed (no transfer_records written); assignments still log");
}

// 4. Consent row for the user — DEFAULT CLOSED; no row means opted out.
const consentInsert =
  `INSERT INTO transfer_consent(user_id, opted_in, updated_at_ts) ` +
  `VALUES (${q(userId)}, TRUE, EXTRACT(EPOCH FROM now())::int) ` +
  `ON CONFLICT (user_id) DO UPDATE SET opted_in = TRUE, updated_at_ts = EXTRACT(EPOCH FROM now())::int;`;
if (!tablesOk) {
  record("WARN", `consent (${userId})`, "skipped (transfer_consent unavailable)");
} else {
  try {
    const rows = await queryJson(
      `SELECT opted_in FROM transfer_consent WHERE user_id = ${q(userId)} LIMIT 1`,
    );
    const optedIn = rows.length > 0 &&
      (rows[0].opted_in === true || rows[0].opted_in === "t" || rows[0].opted_in === "true" || rows[0].opted_in === 1);
    if (optedIn) {
      record("PASS", `consent (${userId})`, "opted_in = true");
    } else {
      const state = rows.length === 0 ? "no row (default closed)" : "opted_in = false";
      record("WARN", `consent (${userId})`, `${state} — to opt in run: ${consentInsert}`);
    }
  } catch (err) {
    record("FAIL", `consent (${userId})`, firstLine(err));
  }
}

// 5. Gemini key — presence only (env or ~/.daobrew/config.json).
try {
  if (resolveGeminiApiKey()) {
    record("PASS", "gemini api key", "resolvable (value not shown)");
  } else {
    record("WARN", "gemini api key", "absent — trigger embeddings will be NULL until swept");
  }
} catch (err) {
  record("FAIL", "gemini api key", firstLine(err));
}

// 6. Informational counts — never gate the run, just describe current state.
if (!tablesOk) {
  record("WARN", "counts", "skipped (tables unavailable)");
} else {
  try {
    const rows = await queryJson(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE trigger_embedding IS NULL)::int AS null_embeddings
       FROM transfer_records`,
    );
    record("PASS", "transfer_records", `${rows[0]?.total ?? 0} total, ${rows[0]?.null_embeddings ?? 0} with NULL embedding`);
  } catch (err) {
    record("FAIL", "transfer_records count", firstLine(err));
  }
  try {
    const rows = await queryJson(
      `SELECT max(version)::int AS latest FROM population_priors WHERE cohort_key = 'global'`,
    );
    const latest = rows[0]?.latest;
    record("PASS", "population_priors (global)", latest == null ? "no versions yet" : `latest version ${latest}`);
  } catch (err) {
    record("FAIL", "population_priors count", firstLine(err));
  }
  try {
    const rows = await queryJson(`SELECT count(*)::int AS total FROM intervention_assignments`);
    record("PASS", "intervention_assignments", `${rows[0]?.total ?? 0} total`);
  } catch (err) {
    record("FAIL", "intervention_assignments count", firstLine(err));
  }
  try {
    const rows = await queryJson(
      `SELECT id,
              props_json -> 'memory_context' ->> 'transfer_source' AS transfer_source,
              props_json -> 'memory_context' ->> 'transport_status' AS transport_status
       FROM graph_nodes
       WHERE user_id = ${q(userId)} AND kind = 'ghost' AND props_json ->> 'status' = 'armed'
       ORDER BY created_at_ts DESC LIMIT 1`,
    );
    if (rows.length === 0) {
      record("PASS", "armed root", `none for user '${userId}' (engine has not armed a root yet)`);
    } else {
      const { id, transfer_source, transport_status } = rows[0];
      record(
        "PASS",
        "armed root",
        `${id} — transfer_source=${transfer_source ?? "(unset)"}, transport_status=${transport_status ?? "(unset)"}`,
      );
    }
  } catch (err) {
    record("FAIL", "armed root", firstLine(err));
  }
}

const fails = results.filter((r) => r.status === "FAIL").length;
const warns = results.filter((r) => r.status === "WARN").length;
console.log(`\n${fails === 0 ? "READY" : "NOT READY"}: ${results.length} checks, ${fails} FAIL, ${warns} WARN`);
process.exit(fails === 0 ? 0 : 1);
