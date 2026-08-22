#!/usr/bin/env node
// Discovery spike for the Cursor session-memory connector (Phase 3, Task 7).
// Read-only: dumps table names, row counts, and chat-looking keys from every
// Cursor state.vscdb so the Task-14 normalizer is written against the REAL
// schema, not guesses. Run on a machine with Cursor installed:
//   node scripts/inspect-cursor-db.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CURSOR_USER = join(homedir(), "Library", "Application Support", "Cursor", "User");
const report = { cursor_installed: existsSync(CURSOR_USER), workspaces: [], global: null };

function sq(db, sql) {
  return execFileSync("sqlite3", ["-json", "-readonly", db, sql], { encoding: "utf-8" }).trim();
}

function inspect(db) {
  const out = { path: db, tables: [], chat_keys: [] };
  const tables = JSON.parse(sq(db, "SELECT name FROM sqlite_master WHERE type='table';") || "[]");
  for (const t of tables.map((r) => r.name)) {
    const count = JSON.parse(sq(db, `SELECT count(*) AS c FROM "${t}";`) || "[]")[0]?.c ?? 0;
    out.tables.push({ name: t, rows: count });
    try {
      const keys = JSON.parse(sq(db,
        `SELECT key AS k, length(value) AS bytes FROM "${t}" ` +
        `WHERE key LIKE '%chat%' OR key LIKE '%composer%' OR key LIKE '%aichat%' OR key LIKE 'bubbleId%' LIMIT 200;`) || "[]");
      out.chat_keys.push(...keys.map((r) => ({ table: t, key: r.k, bytes: r.bytes })));
    } catch {
      // table has no key column
    }
  }
  return out;
}

if (report.cursor_installed) {
  const wsRoot = join(CURSOR_USER, "workspaceStorage");
  if (existsSync(wsRoot)) {
    for (const dir of readdirSync(wsRoot)) {
      const db = join(wsRoot, dir, "state.vscdb");
      if (existsSync(db)) {
        try {
          report.workspaces.push(inspect(db));
        } catch (e) {
          report.workspaces.push({ path: db, error: String(e) });
        }
      }
    }
  }
  const globalDb = join(CURSOR_USER, "globalStorage", "state.vscdb");
  if (existsSync(globalDb)) {
    try {
      report.global = inspect(globalDb);
    } catch (e) {
      report.global = { path: globalDb, error: String(e) };
    }
  }
}
console.log(JSON.stringify(report, null, 2));
