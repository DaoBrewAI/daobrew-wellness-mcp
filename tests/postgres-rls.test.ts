import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RLS_GUC,
  USER_SCOPED_TABLES,
  PERMISSIVE_TABLES,
  appRoleProvisionSql,
} from "../src/engine/postgres-rls.js";
import { POSTGRES_TABLES } from "../src/engine/postgres-schema.js";

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

function currentRlsMigrationSource(): string {
  return [
    sharedGraphMigrationSource(),
    readFileSync(
      resolve(repoRoot(), "alembic", "versions", "0024_insight_lifecycle_decisions.py"),
      "utf8",
    ),
  ].join("\n");
}

describe("Postgres RLS DDL contract (multi-user tenant isolation)", () => {
  it("pins the session GUC name used for user scoping", () => {
    assert.equal(RLS_GUC, "app.daobrew_user_id");
  });

  it("classifies every schema table exactly once (union === POSTGRES_TABLES)", () => {
    const union = [...USER_SCOPED_TABLES, ...PERMISSIVE_TABLES];
    // No table classified twice.
    assert.equal(new Set(union).size, union.length, "a table appears in both classifications");
    // Union is exactly the schema's table list — a future table cannot silently
    // skip classification without breaking this test.
    assert.deepEqual([...union].sort(), [...POSTGRES_TABLES].sort());
  });

  it("classification matches the design of record", () => {
    assert.deepEqual(
      [...USER_SCOPED_TABLES].sort(),
      [
        "causal_memory_threads",
        "causal_thread_evidence",
        "events",
        "graph_edges",
        "graph_nodes",
        "insight_lifecycle_decisions",
        "intervention_assignments",
        "meeting_notes",
        "thread_verifications",
        "transfer_consent",
        "user_insights",
        "user_model_snapshots",
        "user_vectors",
      ],
    );
    assert.deepEqual(
      [...PERMISSIVE_TABLES].sort(),
      ["pipeline_metrics", "population_priors", "transfer_records"],
    );
  });

  it("MCP exports only RLS metadata; Alembic owns shared policy DDL", () => {
    const source = readFileSync(
      resolve(repoRoot(), "daobrew-wellness-mcp", "src", "engine", "postgres-rls.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /POSTGRES_RLS_DDL/);
    assert.doesNotMatch(source, /CREATE POLICY/);
    assert.doesNotMatch(source, /ENABLE ROW LEVEL SECURITY/);
  });

  it("Alembic enables RLS on every table — ENABLE, never FORCE (owner must bypass)", () => {
    const migration = currentRlsMigrationSource();
    for (const table of POSTGRES_TABLES) {
      assert.match(
        migration,
        new RegExp(`"${table}"`),
        `${table} is not listed in the Alembic RLS table classifications`,
      );
    }
    assert.match(migration, /ALTER TABLE \{table\} ENABLE ROW LEVEL SECURITY;/);
    assert.doesNotMatch(migration, /FORCE ROW LEVEL SECURITY/);
  });

  it("Alembic user-scoped tables get deny-by-default policies keyed on the GUC", () => {
    const migration = currentRlsMigrationSource();
    for (const table of USER_SCOPED_TABLES) {
      assert.match(
        migration,
        new RegExp(`"${table}"`),
        `${table} is not listed in USER_SCOPED_TABLES`,
      );
    }
    assert.match(migration, /guard = "user_id = current_setting\('app\.daobrew_user_id', true\)"/);
    assert.match(migration, /CREATE POLICY \{table\}_user_isolation ON \{table\}/);
    assert.match(migration, /USING \(\{guard\}\)/);
    assert.match(migration, /WITH CHECK \(\{guard\}\)/);
  });

  it("Alembic user-scoped policy template has NO fallback-to-permissive", () => {
    const migration = sharedGraphMigrationSource();
    const userScopedStart = migration.indexOf("for table in USER_SCOPED_TABLES:");
    const permissiveStart = migration.indexOf("for table in PERMISSIVE_TABLES:");
    assert.ok(userScopedStart >= 0 && permissiveStart > userScopedStart);
    const section = migration.slice(userScopedStart, permissiveStart);
    assert.doesNotMatch(section, /USING \(true\)/);
    assert.doesNotMatch(section, /WITH CHECK \(true\)/);
    assert.doesNotMatch(section, /COALESCE/i);
    assert.doesNotMatch(section, /'local'/);
  });

  it("Alembic annex + aggregate tables are explicitly permissive", () => {
    const migration = currentRlsMigrationSource();
    for (const table of PERMISSIVE_TABLES) {
      assert.match(migration, new RegExp(`"${table}"`));
    }
    const permissiveStart = migration.indexOf("for table in PERMISSIVE_TABLES:");
    assert.ok(permissiveStart >= 0);
    const section = migration.slice(permissiveStart, migration.indexOf("def upgrade()", permissiveStart));
    assert.match(section, /CREATE POLICY \{table\}_permissive_all ON \{table\}/);
    assert.match(section, /USING \(true\)/);
    assert.match(section, /WITH CHECK \(true\)/);
    assert.doesNotMatch(section, /current_setting/);
  });

  it("Alembic policy DDL is idempotent: DROP precedes matching CREATE", () => {
    const migration = sharedGraphMigrationSource();
    const userDrop = migration.indexOf("DROP POLICY IF EXISTS {table}_user_isolation ON {table};");
    const userCreate = migration.indexOf("CREATE POLICY {table}_user_isolation ON {table}");
    const permissiveDrop = migration.indexOf("DROP POLICY IF EXISTS {table}_permissive_all ON {table};");
    const permissiveCreate = migration.indexOf("CREATE POLICY {table}_permissive_all ON {table}");
    assert.ok(userDrop >= 0 && userDrop < userCreate);
    assert.ok(permissiveDrop >= 0 && permissiveDrop < permissiveCreate);
  });

  it("app-role provisioning SQL creates a non-bypass login role with table grants", () => {
    const sql = appRoleProvisionSql("daobrew_app");
    assert.match(sql, /CREATE ROLE daobrew_app LOGIN NOSUPERUSER NOBYPASSRLS/);
    assert.match(sql, /GRANT USAGE ON SCHEMA public TO daobrew_app;/);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO daobrew_app;/);
    // Future tables inherit the grants.
    assert.match(
      sql,
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO daobrew_app;/,
    );
  });

  it("provisioning SQL never embeds a password literal — psql variable placeholder only", () => {
    const sql = appRoleProvisionSql("daobrew_app");
    // The password is a psql variable (:'app_password'), interpolated client-side
    // at apply time from the environment — never a literal in generated SQL.
    assert.match(sql, /PASSWORD :'app_password'/);
    // No password-looking literal anywhere: PASSWORD followed by a plain quoted string.
    assert.doesNotMatch(sql, /PASSWORD\s+'[^']*'/i);
    assert.doesNotMatch(sql, /PASSWORD\s+"[^"]*"/i);
  });

  it("rejects role names that are not simple SQL identifiers", () => {
    assert.throws(() => appRoleProvisionSql("bad role; DROP TABLE graph_nodes--"));
    assert.throws(() => appRoleProvisionSql(""));
    assert.throws(() => appRoleProvisionSql("role'name"));
  });
});
