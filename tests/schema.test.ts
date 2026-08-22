import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureSchema } from "../src/engine/schema.js";

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

function sqliteResult(dbPath: string, sql: string): { status: number | null; stderr: string } {
  const result = spawnSync("sqlite3", [dbPath, sql], { encoding: "utf-8" });
  return { status: result.status, stderr: result.stderr };
}

function objectExists(dbPath: string, type: "table" | "index", name: string): boolean {
  const out = sqlite(
    dbPath,
    `SELECT count(*) FROM sqlite_master WHERE type='${type}' AND name='${name.replace(/'/g, "''")}';`,
  ).trim();
  return out === "1";
}

describe("engine schema", () => {
  it("ensureSchema is idempotent and migrates graph_nodes.embedding", (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");

    const scratchRoot = join(process.cwd(), ".test-tmp", "schema-test");
    mkdirSync(scratchRoot, { recursive: true });
    const tmpDir = mkdtempSync(join(scratchRoot, "daobrew-schema-"));
    const dbPath = join(tmpDir, "sentinel-graph.db");
    const previousGraphStore = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = "sqlite";

    try {
      sqlite(
        dbPath,
        `
        CREATE TABLE graph_nodes(
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL DEFAULT 'local',
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
          user_id TEXT NOT NULL DEFAULT 'local',
          src_id TEXT NOT NULL,
          dst_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('triggered','manifested','tagged','clusters','suggests','evidence_for','predicts','caused','relates_to')),
          label TEXT,
          weight REAL DEFAULT 1.0,
          props_json TEXT DEFAULT '{}',
          created_at_ts INTEGER NOT NULL,
          UNIQUE(user_id, src_id, dst_id, kind)
        );
        CREATE INDEX idx_legacy_graph_title ON graph_nodes(title);
        INSERT INTO graph_nodes(
          id, user_id, kind, title, props_json, created_at_ts
        ) VALUES (
          'legacy-row', '14802294-BEED-480E-ABF6-7E3703FA25CD',
          'episode', 'preserved row', '{}', 1
        );
        `,
      );

      ensureSchema(dbPath);
      ensureSchema(dbPath);

      const columns = sqlite(dbPath, "PRAGMA table_info(graph_nodes);");
      assert.match(columns, /\|embedding\|BLOB\|/);

      const meetingColumns = sqlite(dbPath, "PRAGMA table_info(meeting_notes);");
      assert.match(meetingColumns, /\|transcript_spans_json\|TEXT\|/);

      const indexCount = sqlite(
        dbPath,
        "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='ux_nodes_dedup';",
      ).trim();
      assert.strictEqual(indexCount, "1");
      assert.ok(
        objectExists(dbPath, "index", "idx_legacy_graph_title"),
        "legacy explicit index was not restored",
      );
      assert.strictEqual(
        sqlite(dbPath, "SELECT title FROM graph_nodes WHERE id='legacy-row';").trim(),
        "preserved row",
      );

      for (const table of ["events", "meeting_notes", "user_insights"]) {
        assert.ok(objectExists(dbPath, "table", table), `missing source table ${table}`);
      }

      for (const index of [
        "ux_events_dedup",
        "idx_events_user_time",
        "ux_meeting_notes_dedup",
        "idx_meeting_notes_user_time",
        "ux_user_insights_dedup",
        "idx_user_insights_user_strength",
      ]) {
        assert.ok(objectExists(dbPath, "index", index), `missing source index ${index}`);
      }

      const graphColumns = sqlite(dbPath, "PRAGMA table_info(graph_nodes);");
      assert.doesNotMatch(graphColumns, /user_id\|TEXT\|1\|'local'/);
      const missingUserInsert = sqliteResult(
        dbPath,
        `
        INSERT INTO graph_nodes(id, kind, title, created_at_ts)
        VALUES ('missing-user', 'episode', 'missing user', 1);
        `,
      );
      assert.notStrictEqual(missingUserInsert.status, 0);
      assert.match(missingUserInsert.stderr, /NOT NULL constraint failed: graph_nodes\.user_id/);
    } finally {
      if (previousGraphStore === undefined) {
        delete process.env.DAOBREW_GRAPH_STORE;
      } else {
        process.env.DAOBREW_GRAPH_STORE = previousGraphStore;
      }
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});
