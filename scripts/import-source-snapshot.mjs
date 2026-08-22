#!/usr/bin/env node
// Import connector-read source snapshots into local DaoBrew source tables.
//
// This is a local P6.5 bridge for audited Google Calendar / Granola snapshots.
// It does not call external APIs and does not write back to Calendar, Granola,
// Codex, Claude, or backend systems.
//
// Normalization lives in dist/src/engine/sources/{calendar,granola}.js and
// writes go through dist/src/engine/ingest/sink.js (Postgres-only).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function usage() {
  return [
    "Usage: node scripts/import-source-snapshot.mjs SNAPSHOT.json [--postgres-db] [--user-id UUID] [--dry-run]",
    "",
    "Snapshot shape: { events: [...], meeting_notes: [...] }",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { file: null, userId: null, store: null, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--postgres-db") {
      options.store = "postgres";
    } else if (arg === "--sqlite-db") {
      options.store = "sqlite";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--user-id") {
      options.userId = argv[++i];
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else if (!options.file) {
      options.file = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.file) throw new Error(usage());
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

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build before this importer. ${err.message}`);
  }
}

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function loadSnapshot(path) {
  const parsed = JSON.parse(readFileSync(path, "utf-8"));
  return {
    events: Array.isArray(parsed.events) ? parsed.events : [],
    meeting_notes: Array.isArray(parsed.meeting_notes) ? parsed.meeting_notes : [],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.store) process.env.DAOBREW_GRAPH_STORE = options.store;
  const { normalizeCalendarEvents } = requireDist("../dist/src/engine/sources/calendar.js");
  const { normalizeGranolaNotes } = requireDist("../dist/src/engine/sources/granola.js");
  const { graphStoreDescription, graphStoreKind, queryJson } = requireDist("../dist/src/graph-db.js");

  if (graphStoreKind() !== "postgres") {
    console.warn("Warning: warm-tier snapshot import is Postgres-only; set DAOBREW_GRAPH_STORE=postgres or pass --postgres-db.");
  }

  const snapshot = loadSnapshot(options.file);
  const events = normalizeCalendarEvents(snapshot.events);
  const meetings = normalizeGranolaNotes(snapshot.meeting_notes);

  if (options.dryRun) {
    console.log(JSON.stringify({
      status: "dry_run",
      target: graphStoreDescription(),
      user_id: options.userId,
      events: events.length,
      meeting_notes: meetings.length,
    }, null, 2));
    return;
  }

  const { PostgresIngestSink } = requireDist("../dist/src/engine/ingest/sink.js");
  const sink = new PostgresIngestSink();
  const eventResult = await sink.upsertEvents(options.userId, events);
  const meetingResult = await sink.upsertMeetingNotes(options.userId, meetings);

  const rows = await queryJson(`
    SELECT
      (SELECT count(*) FROM events WHERE user_id=${q(options.userId)} AND source='google_calendar') AS google_calendar_events,
      (SELECT count(*) FROM meeting_notes WHERE user_id=${q(options.userId)} AND source='granola') AS granola_meeting_notes
  `);
  console.log(JSON.stringify({
    status: "imported",
    target: graphStoreDescription(),
    user_id: options.userId,
    imported: {
      events: eventResult.rowsWritten,
      events_dedup_skips: eventResult.dedupSkips,
      meeting_notes: meetingResult.rowsWritten,
      meeting_notes_dedup_skips: meetingResult.dedupSkips,
    },
    readback: rows[0] ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
  process.exit(1);
});
