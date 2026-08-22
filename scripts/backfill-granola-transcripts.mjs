#!/usr/bin/env node
// Backfill connector-read Granola transcripts into existing local source rows.
//
// Input is local agent-collected JSON from the Granola connector:
//   [{ "id": "<granola meeting uuid>", "title": "...", "transcript": "..." }]
//
// This script updates only existing meeting_notes rows by source_ref. It does
// not call Granola, insert new source rows, or write back to external systems.

import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function usage() {
  return [
    "Usage: node scripts/backfill-granola-transcripts.mjs [SNAPSHOT.json|-] [--postgres-db|--sqlite-db] [--user-id UUID] [--dry-run]",
    "",
    "Snapshot shape: [{ id, title, transcript }, ...] or { meetings: [...] }",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { file: "-", userId: null, store: null, dryRun: false };
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
    } else if (options.file === "-") {
      options.file = arg;
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

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build first. ${err.message}`);
  }
}

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readInput(file) {
  if (file === "-") {
    return readFileSync(0, "utf-8");
  }
  return readFileSync(file, "utf-8");
}

function normalizeMeeting(entry) {
  if (!entry || typeof entry !== "object") return null;
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const transcript = typeof entry.transcript === "string" ? entry.transcript.replace(/\s+/g, " ").trim() : "";
  if (!id || !transcript) return null;
  return {
    id,
    title: typeof entry.title === "string" ? entry.title.trim() : id,
    transcript,
  };
}

function loadMeetings(text) {
  const parsed = JSON.parse(text);
  const raw = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.meetings)
    ? parsed.meetings
    : parsed && typeof parsed === "object" && typeof parsed.id === "string"
    ? [parsed]
    : [];
  return raw.map(normalizeMeeting).filter(Boolean);
}

export function chunkText(text, maxLen = 720) {
  const chunks = [];
  let rest = text.trim();
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      chunks.push(rest);
      break;
    }
    const splitAt = Math.max(
      rest.lastIndexOf(". ", maxLen),
      rest.lastIndexOf("? ", maxLen),
      rest.lastIndexOf("! ", maxLen),
      rest.lastIndexOf(" ", maxLen),
    );
    const end = splitAt > 80 ? splitAt + 1 : maxLen;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return chunks.filter(Boolean);
}

// Shared chunker: granola-mcp-client.mjs imports this to synthesize spans
// from a note's own body on the personal (no-transcript) Granola tier. Keep
// it deterministic — resident re-imports rely on identical output for the
// same input so the ingest sink can dedup instead of resetting embeddings.
export function transcriptSpans(transcript) {
  const spans = [];
  const speakerPattern = /(?:^|\n|\s{2,})(Me|Them|Speaker\s*\d+|Participant\s*\d+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}):\s*/g;
  const matches = [...transcript.matchAll(speakerPattern)];
  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i];
      const next = matches[i + 1];
      const start = (match.index ?? 0) + match[0].length;
      const end = next?.index ?? transcript.length;
      const text = transcript.slice(start, end).replace(/\s+/g, " ").trim();
      if (text.length >= 16) {
        spans.push({
          idx: spans.length,
          speaker: match[1].replace(/\s+/g, " "),
          ts_offset_sec: null,
          text,
        });
      }
    }
  }
  const base = spans.length > 0 ? spans : chunkText(transcript).map((text, idx) => ({
    idx,
    speaker: null,
    ts_offset_sec: null,
    text,
  }));
  return base.slice(0, 80).map((span, idx) => ({ ...span, idx }));
}

function jsonSql(value, storeKind) {
  const literal = q(JSON.stringify(value));
  return storeKind === "postgres" ? `${literal}::jsonb` : literal;
}

function updateSql(meeting, userId, storeKind) {
  return `
UPDATE meeting_notes
   SET body = ${q(meeting.transcript)},
       transcript_spans_json = ${jsonSql(transcriptSpans(meeting.transcript), storeKind)}
 WHERE user_id = ${q(userId)}
   AND source = 'granola'
   AND source_ref = ${q(meeting.id)};`;
}

async function existingSourceRefs(queryJson, userId, ids) {
  if (ids.length === 0) return new Set();
  const rows = await queryJson(
    `SELECT source_ref
       FROM meeting_notes
      WHERE user_id = ${q(userId)}
        AND source = 'granola'
        AND source_ref IN (${ids.map(q).join(", ")});`,
  );
  return new Set(rows.map((row) => row.source_ref).filter(Boolean));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.store) process.env.DAOBREW_GRAPH_STORE = options.store;

  const { ensureSchema } = requireDist("../dist/src/engine/schema.js");
  const { execSql, graphStoreDescription, graphStoreKind, queryJson } = requireDist("../dist/src/graph-db.js");
  ensureSchema();

  const meetings = loadMeetings(readInput(options.file));
  const ids = [...new Set(meetings.map((meeting) => meeting.id))];
  const existing = await existingSourceRefs(queryJson, options.userId, ids);
  const writable = meetings.filter((meeting) => existing.has(meeting.id));
  const skipped = meetings
    .filter((meeting) => !existing.has(meeting.id))
    .map((meeting) => ({ id: meeting.id, title: meeting.title, reason: "no_existing_local_row" }));

  if (!options.dryRun && writable.length > 0) {
    await execSql([
      "BEGIN;",
      ...writable.map((meeting) => updateSql(meeting, options.userId, graphStoreKind())),
      "COMMIT;",
    ].join("\n"));
  }

  const readback = await queryJson(
    `SELECT
       count(*) FILTER (WHERE source = 'granola')::int AS granola_rows,
       count(*) FILTER (WHERE source = 'granola' AND COALESCE(length(body), 0) > 0)::int AS with_body,
       count(*) FILTER (WHERE source = 'granola' AND jsonb_array_length(COALESCE(transcript_spans_json, '[]'::jsonb)) > 0)::int AS with_spans,
       max(COALESCE(length(body), 0))::int AS max_body_len
     FROM meeting_notes
     WHERE user_id = ${q(options.userId)};`,
  ).catch(async () => queryJson(
    `SELECT
       sum(CASE WHEN source = 'granola' THEN 1 ELSE 0 END) AS granola_rows,
       sum(CASE WHEN source = 'granola' AND COALESCE(length(body), 0) > 0 THEN 1 ELSE 0 END) AS with_body,
       sum(CASE WHEN source = 'granola' AND COALESCE(json_array_length(COALESCE(transcript_spans_json, '[]')), 0) > 0 THEN 1 ELSE 0 END) AS with_spans,
       max(COALESCE(length(body), 0)) AS max_body_len
     FROM meeting_notes
     WHERE user_id = ${q(options.userId)};`,
  ));

  console.log(JSON.stringify({
    status: options.dryRun ? "dry_run" : "backfilled",
    target: graphStoreDescription(),
    user_id: options.userId,
    input_meetings: meetings.length,
    updated_meetings: writable.length,
    skipped,
    readback: readback[0] ?? null,
  }, null, 2));
}

// Only run as a CLI when invoked directly; granola-mcp-client.mjs imports
// transcriptSpans from this module and must not trigger a backfill.
// Compare realpaths: Node realpath-resolves the main module's import.meta.url
// but process.argv[1] keeps the invoked spelling, so a naive comparison fails
// when invoked through a symlink (e.g. engine/current).
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
    process.exit(1);
  });
}
