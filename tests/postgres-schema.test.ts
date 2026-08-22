import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  POSTGRES_INDEXES,
  POSTGRES_RUNTIME_VERIFY_SQL,
  POSTGRES_TABLES,
  WARM_DB_BYTES_SQL,
} from "../src/engine/postgres-schema.js";
import {
  __resetPostgresSchemaEnsureForTests,
  ensureSchema,
  verifyPostgresRuntimeSchema,
} from "../src/engine/schema.js";
import { execSql, q, queryJson } from "../src/graph-db.js";
import { prepareInternalServerStorage } from "../src/engine/internal-server.js";

function repoRoot(): string {
  return existsSync(resolve(process.cwd(), "alembic.ini"))
    ? process.cwd()
    : resolve(process.cwd(), "..");
}

function sharedGraphMigrationSource(): string {
  return readFileSync(
    resolve(repoRoot(), "alembic", "versions", "0015_shared_graph_schema.py"),
    "utf8",
  );
}

function currentSchemaMigrationSource(): string {
  return [
    sharedGraphMigrationSource(),
    readFileSync(
      resolve(repoRoot(), "alembic", "versions", "0024_insight_lifecycle_decisions.py"),
      "utf8",
    ),
  ].join("\n");
}

function tableDdl(source: string, table: string): string {
  const marker = `CREATE TABLE IF NOT EXISTS ${table}(`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${table} missing from Alembic migration`);
  const end = source.indexOf(");", start);
  assert.notStrictEqual(end, -1, `${table} table DDL is unterminated`);
  return source.slice(start, end);
}

function safeLocalPostgresUrl(): string | null {
  const raw = process.env.DAOBREW_LIVE_TEST_POSTGRES_URL || process.env.DATABASE_URL || "";
  if (process.env.DAOBREW_TEST_DATABASE_OK !== "1" || !raw.trim()) return null;
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) return null;
  if (/(neon|supabase|rds\.amazonaws)/i.test(host)) return null;
  if (!/(test|tmp|ci|pytest)/.test(dbName)) return null;
  return raw;
}

describe("Postgres schema ownership contract", () => {
  it("gates the internal-server listener on postgres readiness", () => {
    let calls = 0;
    prepareInternalServerStorage(() => "postgres", () => { calls += 1; });
    assert.strictEqual(calls, 1);

    prepareInternalServerStorage(() => "sqlite", () => { calls += 1; });
    assert.strictEqual(calls, 1);

    assert.throws(
      () => prepareInternalServerStorage(
        () => "postgres",
        () => { throw new Error("schema not ready"); },
      ),
      /schema not ready/,
    );
  });

  it("keeps stable table and index metadata for runtime verification", () => {
    assert.ok(POSTGRES_TABLES.includes("pipeline_metrics" as (typeof POSTGRES_TABLES)[number]));
    assert.ok(POSTGRES_TABLES.includes("intervention_assignments" as (typeof POSTGRES_TABLES)[number]));
    assert.ok(POSTGRES_TABLES.includes("insight_lifecycle_decisions" as (typeof POSTGRES_TABLES)[number]));
    assert.ok(POSTGRES_INDEXES.includes("idx_pipeline_metrics_job_run" as (typeof POSTGRES_INDEXES)[number]));
    assert.ok(POSTGRES_INDEXES.includes("idx_ivn_user_ghost" as (typeof POSTGRES_INDEXES)[number]));
    assert.ok(POSTGRES_INDEXES.includes("ux_insight_lifecycle_decisions_replay" as (typeof POSTGRES_INDEXES)[number]));

    for (const table of POSTGRES_TABLES) {
      assert.match(WARM_DB_BYTES_SQL, new RegExp(`to_regclass\\('${table}'\\)`));
      assert.match(POSTGRES_RUNTIME_VERIFY_SQL, new RegExp(`'${table}'`));
    }
    for (const index of POSTGRES_INDEXES) {
      assert.match(POSTGRES_RUNTIME_VERIFY_SQL, new RegExp(`'${index}'`));
    }
  });

  it("documents pgvector graph/source DDL in Alembic only", () => {
    const migration = currentSchemaMigrationSource();

    assert.match(migration, /CREATE EXTENSION IF NOT EXISTS vector/);
    assert.match(migration, /embedding halfvec\(768\)/);
    assert.doesNotMatch(migration, /embedding vector\(768\)/);
    assert.match(migration, /props_json JSONB/);
    assert.match(migration, /metadata_json JSONB/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS pipeline_metrics\(/);
    assert.match(migration, /warm_db_bytes BIGINT/);
    assert.match(migration, /ALTER TABLE meeting_notes ALTER COLUMN body SET STORAGE EXTENDED;/);
    assert.match(migration, /ALTER TABLE meeting_notes ALTER COLUMN transcript_spans_json SET STORAGE EXTENDED;/);
    assert.match(migration, /ALTER TABLE meeting_notes ALTER COLUMN body SET COMPRESSION lz4;/);
    assert.match(migration, /ALTER TABLE meeting_notes ALTER COLUMN transcript_spans_json SET COMPRESSION lz4;/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_meeting_notes_embedding_cosine/);
    assert.match(migration, /halfvec_cosine_ops/);

    for (const table of POSTGRES_TABLES) {
      assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\(`));
    }
    for (const index of POSTGRES_INDEXES) {
      assert.match(migration, new RegExp(`IF NOT EXISTS ${index}\\b`));
    }
  });

  it("leaves invalidation functions to migration 0010 and installs four triggers in Alembic", () => {
    const migration0010 = readFileSync(
      resolve(repoRoot(), "alembic", "versions", "0010_causal_generation_validity.py"),
      "utf8",
    );
    const migration0015 = sharedGraphMigrationSource();

    assert.match(
      migration0010,
      /CREATE OR REPLACE FUNCTION public\.daobrew_invalidate_graph_generation\(\)/,
    );
    assert.doesNotMatch(
      migration0015,
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.daobrew_invalidate_/i,
    );
    assert.match(migration0015, /AFTER INSERT OR UPDATE OR DELETE ON public\.\{table\}/);
    assert.match(migration0015, /AFTER TRUNCATE ON public\.\{table\}/);
    assert.match(migration0015, /trg_\{table\}_invalidate_generation/);
    assert.match(migration0015, /trg_\{table\}_truncate_generation/);
  });

  it("readiness verifies the shared causal schema and exact four-trigger wiring", () => {
    for (const required of [
      "causal_graph_generations",
      "causal_execution_leases",
      "daobrew_invalidate_graph_generation",
      "daobrew_invalidate_all_graph_generations",
      "trg_graph_nodes_invalidate_generation",
      "trg_graph_nodes_truncate_generation",
      "trg_graph_edges_invalidate_generation",
      "trg_graph_edges_truncate_generation",
    ]) {
      assert.match(POSTGRES_RUNTIME_VERIFY_SQL, new RegExp(required));
    }
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /'trigger_count', trigger_count/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /trigger_count = 4/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /t\.tgenabled = 'O'/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /p\.prosecdef/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /p\.proowner = marker\.relowner/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /acl\.grantee = 0/);
    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /trigger_type = e\.trigger_type/);
  });

  it("postgres startup is read-only verification and exposes no runtime bootstrap DDL", () => {
    const schemaSource = readFileSync("src/engine/schema.ts", "utf8");
    const postgresSchemaSource = readFileSync("src/engine/postgres-schema.ts", "utf8");
    const bootstrapScriptSource = readFileSync("scripts/bootstrap-postgres-schema.mjs", "utf8");

    assert.doesNotMatch(schemaSource, /postgresBootstrapSql/);
    assert.doesNotMatch(schemaSource, /expectedBootstrapPrivilegeDenial/);
    assert.doesNotMatch(postgresSchemaSource, /export const POSTGRES_BOOTSTRAP_DDL/);
    assert.doesNotMatch(postgresSchemaSource, /export const CAUSAL_GENERATION_TRIGGER_INSTALLER_DDL/);
    assert.doesNotMatch(postgresSchemaSource, /export function postgresBootstrapSql/);
    assert.doesNotMatch(bootstrapScriptSource, /POSTGRES_RLS_DDL|postgresBootstrapSql/);
    assert.match(bootstrapScriptSource, /Alembic-owned/);

    assert.match(POSTGRES_RUNTIME_VERIFY_SQL, /\bSELECT\b/i);
    assert.doesNotMatch(
      POSTGRES_RUNTIME_VERIFY_SQL,
      /\b(?:CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COMMENT|INSERT|UPDATE|DELETE|ENABLE\s+ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY)\b/i,
    );
  });

  it("sqlite local setup remains functional", () => {
    const previousStore = process.env.DAOBREW_GRAPH_STORE;
    const previousDb = process.env.DAOBREW_GRAPH_DB;
    const tempRoot = resolve(process.cwd(), ".test-tmp");
    mkdirSync(tempRoot, { recursive: true });
    const dir = mkdtempSync(join(tempRoot, "daobrew-sqlite-schema-"));
    const dbPath = join(dir, "graph.db");
    try {
      process.env.DAOBREW_GRAPH_STORE = "sqlite";
      process.env.DAOBREW_GRAPH_DB = dbPath;
      ensureSchema(dbPath);
      const tables = execFileSync(
        "sqlite3",
        [
          "-json",
          dbPath,
          "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;",
        ],
        { encoding: "utf8" },
      );
      assert.match(tables, /graph_nodes/);
      assert.match(tables, /events/);
    } finally {
      __resetPostgresSchemaEnsureForTests();
      if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = previousStore;
      if (previousDb === undefined) delete process.env.DAOBREW_GRAPH_DB;
      else process.env.DAOBREW_GRAPH_DB = previousDb;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("layer 2 causal memory tables are present with claim ladder constraints", () => {
    const migration = currentSchemaMigrationSource();
    assert.match(migration, /CREATE TABLE IF NOT EXISTS causal_memory_threads\(/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS causal_thread_evidence\(/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS user_model_snapshots\(/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS population_priors\(/);
    assert.match(
      migration,
      /claim_level TEXT NOT NULL CHECK\(claim_level IN \('correlation','attribution_candidate','causal_hypothesis','validated_pattern'\)\)/,
    );
    assert.match(migration, /ux_cmt_user_thread_key\s+ON causal_memory_threads\(user_id, thread_key\)/);
    assert.match(migration, /ux_ums_user_version\s+ON user_model_snapshots\(user_id, version\)/);
  });

  it("layer 2 tables never store transcript bodies or embeddings", () => {
    const migration = currentSchemaMigrationSource();
    const layer2 = migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS causal_memory_threads("));
    assert.doesNotMatch(layer2, /body TEXT/);
    assert.doesNotMatch(layer2, /transcript/);
    assert.doesNotMatch(layer2, /halfvec/);
  });

  it("transfer store is anonymized: records carry a contributor hash, never a user id (5B)", () => {
    const migration = currentSchemaMigrationSource();
    const recordsDdl = tableDdl(migration, "transfer_records");

    assert.doesNotMatch(recordsDdl, /user_id/);
    assert.match(recordsDdl, /contributor_hash TEXT NOT NULL/);
    assert.match(recordsDdl, /trigger_embedding halfvec\(768\)/);
    assert.match(recordsDdl, /outcome TEXT NOT NULL CHECK\(outcome IN \('worked','did_not_work'\)\)/);
    assert.match(recordsDdl, /method_json JSONB NOT NULL/);
    assert.match(recordsDdl, /context_bucket_json JSONB NOT NULL/);
    assert.match(recordsDdl, /source_quality TEXT/);
    assert.match(recordsDdl, /evidence_quality TEXT/);
    assert.match(recordsDdl, /method_class TEXT NOT NULL DEFAULT 'task_package'/);
    assert.match(recordsDdl, /created_week_bucket TEXT/);
    assert.match(migration, /ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS source_quality TEXT;/);
    assert.match(migration, /ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS evidence_quality TEXT;/);
    assert.match(migration, /ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS method_class TEXT NOT NULL DEFAULT 'task_package';/);
    assert.match(migration, /ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS created_week_bucket TEXT;/);
    assert.match(migration, /idx_transfer_records_trigger_cosine\s+ON transfer_records USING hnsw \(trigger_embedding halfvec_cosine_ops\)/);
    assert.match(migration, /idx_transfer_records_contributor\s+ON transfer_records\(contributor_hash\)/);
  });

  it("intervention_assignments logs the thin MRT assignment and outcome contract", () => {
    const migration = currentSchemaMigrationSource();
    const tableDdlText = tableDdl(migration, "intervention_assignments");

    assert.match(
      tableDdlText,
      /assigned_action TEXT NOT NULL CHECK\(assigned_action IN \('task_package','artifact_draft','focus_block','blocker_list','context_pack','hold_noop'\)\)/,
    );
    assert.match(tableDdlText, /assignment_probability REAL NOT NULL DEFAULT 1/);
    assert.match(tableDdlText, /route_policy TEXT NOT NULL DEFAULT 'deterministic_argmax_v1'/);
    assert.match(tableDdlText, /eligible_actions_json JSONB NOT NULL DEFAULT '\["task_package"\]'::jsonb/);
    assert.match(tableDdlText, /artifact_done BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(tableDdlText, /user_acceptance TEXT CHECK\(user_acceptance IN \('accepted','edited','rejected'\)\)/);
    assert.match(tableDdlText, /closed_at_ts INTEGER/);
    assert.match(tableDdlText, /stress_pattern TEXT/);
    assert.match(tableDdlText, /root_cause_class TEXT/);
    assert.match(tableDdlText, /thread_key TEXT/);
    assert.doesNotMatch(tableDdlText, /brief|evidence|artifact_ref|halfvec/);
    assert.match(migration, /idx_ivn_user_created\s+ON intervention_assignments\(user_id, created_at_ts DESC\)/);
    assert.match(migration, /idx_ivn_user_ghost\s+ON intervention_assignments\(user_id, ghost_id\)/);
  });

  it("captures durable insight lifecycle decisions in a dedicated replay table", () => {
    const migration = currentSchemaMigrationSource();
    const tableDdlText = tableDdl(migration, "insight_lifecycle_decisions");

    assert.match(tableDdlText, /incoming_source TEXT NOT NULL/);
    assert.match(tableDdlText, /incoming_source_ref TEXT NOT NULL/);
    assert.match(tableDdlText, /incoming_content_hash TEXT NOT NULL/);
    assert.match(tableDdlText, /decision_kind TEXT NOT NULL CHECK\(decision_kind IN \('add','supersedes','noop_duplicate'\)\)/);
    assert.match(tableDdlText, /winner_insight_id TEXT/);
    assert.match(tableDdlText, /loser_insight_id TEXT/);
    assert.match(tableDdlText, /decided_importance REAL NOT NULL CHECK\(decided_importance >= 0 AND decided_importance <= 1\)/);
    assert.match(tableDdlText, /rationale TEXT NOT NULL/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_insight_lifecycle_decisions_replay/);
    assert.match(migration, /idx_insight_lifecycle_decisions_user_winner/);
    assert.match(migration, /idx_insight_lifecycle_decisions_user_loser/);
  });
});

describe("Alembic-only runtime readiness (live postgres)", () => {
  it("verifies an Alembic-provisioned schema as an app role without runtime DDL", async (t) => {
    const liveUrl = safeLocalPostgresUrl();
    if (!liveUrl) {
      return t.skip("set DAOBREW_TEST_DATABASE_OK=1 and a local disposable DAOBREW_LIVE_TEST_POSTGRES_URL or DATABASE_URL");
    }

    const previousStore = process.env.DAOBREW_GRAPH_STORE;
    const previousUrl = process.env.DAOBREW_POSTGRES_URL;
    const ownerAdminUrl = new URL(liveUrl);
    ownerAdminUrl.pathname = "/postgres";
    const suffix = `${process.pid}_${Date.now()}`;
    const scratchDb = `runtime_verify_${suffix}`;
    const appRole = `runtime_app_${suffix}`;
    const appPassword = `runtime_pw_${suffix}`;
    const ownerScratchUrl = new URL(liveUrl);
    ownerScratchUrl.pathname = `/${scratchDb}`;
    const appScratchUrl = new URL(ownerScratchUrl);
    appScratchUrl.username = appRole;
    appScratchUrl.password = appPassword;
    let roleCreated = false;

    process.env.DAOBREW_GRAPH_STORE = "postgres";
    process.env.DAOBREW_POSTGRES_URL = ownerAdminUrl.toString();
    await execSql(`CREATE DATABASE ${scratchDb};`);
    try {
      execFileSync(process.env.DAOBREW_PYTHON_BIN || "python3", [
        "-m",
        "alembic",
        "upgrade",
        "head",
      ], {
        cwd: repoRoot(),
        env: {
          ...process.env,
          DATABASE_URL: ownerScratchUrl.toString(),
          DAOBREW_SKIP_DOTENV: "1",
        },
        stdio: "pipe",
        timeout: 60_000,
      });

      process.env.DAOBREW_POSTGRES_URL = ownerScratchUrl.toString();
      await execSql(`
        CREATE ROLE ${appRole} LOGIN NOSUPERUSER NOBYPASSRLS
          PASSWORD ${q(appPassword)};
        GRANT USAGE ON SCHEMA public TO ${appRole};
        GRANT SELECT, INSERT, UPDATE, DELETE
          ON ALL TABLES IN SCHEMA public TO ${appRole};
      `);
      roleCreated = true;

      const functionsBefore = await queryJson(`
        SELECT p.proname AS name,
               r.rolname AS owner,
               pg_get_functiondef(p.oid) AS definition
          FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
          JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
         WHERE n.nspname = 'public'
           AND p.proname IN (
             'daobrew_invalidate_graph_generation',
             'daobrew_invalidate_all_graph_generations'
           )
         ORDER BY p.proname
      `);
      assert.strictEqual(functionsBefore.length, 2);

      process.env.DAOBREW_POSTGRES_URL = appScratchUrl.toString();
      __resetPostgresSchemaEnsureForTests();
      ensureSchema();
      const status = verifyPostgresRuntimeSchema();
      assert.strictEqual(status.ready, true);
      assert.strictEqual(status.trigger_count, 4);
      assert.deepStrictEqual(status.missing_triggers, []);

      process.env.DAOBREW_POSTGRES_URL = ownerScratchUrl.toString();
      const functionsAfter = await queryJson(`
        SELECT p.proname AS name,
               r.rolname AS owner,
               pg_get_functiondef(p.oid) AS definition
          FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
          JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
         WHERE n.nspname = 'public'
           AND p.proname IN (
             'daobrew_invalidate_graph_generation',
             'daobrew_invalidate_all_graph_generations'
           )
         ORDER BY p.proname
      `);
      assert.deepStrictEqual(functionsAfter, functionsBefore);
      assert.ok(functionsAfter.every((row: any) => row.owner !== appRole));
    } finally {
      __resetPostgresSchemaEnsureForTests();
      process.env.DAOBREW_POSTGRES_URL = ownerScratchUrl.toString();
      if (roleCreated) {
        try {
          await execSql(`DROP OWNED BY ${appRole};`);
        } catch {
          // The database drop below still removes database-local grants.
        }
      }
      process.env.DAOBREW_POSTGRES_URL = ownerAdminUrl.toString();
      try {
        await execSql(`DROP DATABASE IF EXISTS ${scratchDb} WITH (FORCE);`);
        if (roleCreated) await execSql(`DROP ROLE IF EXISTS ${appRole};`);
      } finally {
        if (previousStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
        else process.env.DAOBREW_GRAPH_STORE = previousStore;
        if (previousUrl === undefined) delete process.env.DAOBREW_POSTGRES_URL;
        else process.env.DAOBREW_POSTGRES_URL = previousUrl;
      }
    }
  });
});
