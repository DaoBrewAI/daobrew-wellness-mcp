#!/usr/bin/env node
// Plaud MCP bridge — official stdio MCP (npx @plaud-ai/mcp, docs.plaud.ai).
//
// Unlike Granola's remote HTTP MCP this is a stdio MCP: the official package
// owns the OAuth browser login and its own token cache; we speak MCP over
// stdio via @modelcontextprotocol/sdk. The import tail (normalize →
// PostgresIngestSink → readback) is a clone of granola-mcp-client.mjs.
//
// Usage:
//   node scripts/plaud-mcp-client.mjs --login            # interactive browser OAuth
//   node scripts/plaud-mcp-client.mjs --list-tools
//   node scripts/plaud-mcp-client.mjs --export-snapshot /tmp/plaud.json \
//     [--days 30] [--import-postgres] [--user-id ID] [--dry-run] [--non-interactive]

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { transcriptSpans } from "./backfill-granola-transcripts.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function usage() {
  return [
    "Usage:",
    "  node scripts/plaud-mcp-client.mjs --login",
    "  node scripts/plaud-mcp-client.mjs --list-tools",
    "  node scripts/plaud-mcp-client.mjs --export-snapshot /tmp/plaud.json [--days 30] \\",
    "    [--import-postgres --user-id UUID] [--dry-run] [--non-interactive]",
    "",
    "Options:",
    "  --login                 Run the official MCP's interactive browser OAuth login",
    "  --list-tools            Print MCP tools/list (verify tool names/arg shapes live)",
    "  --export-snapshot PATH  Export Plaud files as { events: [], meeting_notes: [...] }",
    "  --days N                Backfill window in days (default: 30)",
    "  --import-postgres       Import exported meeting_notes into the warm-tier source table",
    "  --user-id ID            Canonical UUID user id for --import-postgres",
    "                          (default: DAOBREW_USER_ID or config user_id; fails closed if absent)",
    "  --no-synthesize-spans   Do not synthesize transcript spans from note bodies when",
    "                          Plaud ships no transcript (default: synthesize)",
    "  --dry-run               Count normalized rows without writing Postgres",
    "  --non-interactive       Spawn the MCP with --no-login (fail fast when unauthenticated)",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    login: false,
    listTools: false,
    exportSnapshot: null,
    days: 30,
    importPostgres: false,
    userId: null,
    synthesizeSpans: true,
    dryRun: false,
    nonInteractive: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--login") {
      options.login = true;
    } else if (arg === "--list-tools") {
      options.listTools = true;
    } else if (arg === "--export-snapshot") {
      options.exportSnapshot = argv[++i];
    } else if (arg.startsWith("--export-snapshot=")) {
      options.exportSnapshot = arg.slice("--export-snapshot=".length);
    } else if (arg === "--days") {
      options.days = Number(argv[++i]);
    } else if (arg.startsWith("--days=")) {
      options.days = Number(arg.slice("--days=".length));
    } else if (arg === "--import-postgres") {
      options.importPostgres = true;
    } else if (arg === "--user-id") {
      options.userId = argv[++i];
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else if (arg === "--no-synthesize-spans") {
      options.synthesizeSpans = false;
    } else if (arg === "--synthesize-spans") {
      options.synthesizeSpans = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--non-interactive") {
      options.nonInteractive = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.days) || options.days <= 0) throw new Error("Invalid --days");
  if (!options.login && !options.listTools && !options.exportSnapshot) options.listTools = true;
  if (options.importPostgres) {
    options.userId = requireCanonicalUserId(
      options.userId ?? process.env.DAOBREW_USER_ID ?? configUserId(),
    );
  }
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
    throw new Error(
      "--import-postgres requires a canonical UUID user id; pass --user-id, set DAOBREW_USER_ID, or run setup",
    );
  }
  return userId;
}

function configUserId() {
  try {
    const raw = readFileSync(join(homedir(), ".daobrew", "config.json"), "utf8");
    const value = JSON.parse(raw)?.user_id;
    return canonicalUserId(value);
  } catch {
    return null;
  }
}

function requireDist(path) {
  try {
    return require(path);
  } catch (err) {
    throw new Error(`Unable to load ${path}. Run npm run build before importing. ${err.message}`);
  }
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function connect(nonInteractive) {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@plaud-ai/mcp", ...(nonInteractive ? ["--no-login"] : [])],
  });
  const client = new Client({ name: "daobrew-plaud-bridge", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

/** Tool results arrive as {content:[{type:"text",text}]} — parse JSON when possible. */
function toolText(result) {
  if (typeof result?.content?.[0]?.text === "string") return result.content[0].text;
  if (typeof result?.text === "string") return result.text;
  return JSON.stringify(result ?? null);
}

function toolJson(result) {
  const text = toolText(result);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args ?? {} });
  if (result?.isError) {
    throw new Error(`MCP tool ${name} failed: ${toolText(result).slice(0, 400)}`);
  }
  return result;
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Normalize whatever list_files returns into [{id, title, created_at}]. */
function coerceFileList(payload) {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload?.files) ? payload.files
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.items) ? payload.items
    : [];
  return list
    .filter((f) => f && (f.id ?? f.file_id ?? f.fileId))
    .map((f) => ({
      id: String(f.id ?? f.file_id ?? f.fileId),
      title: f.title ?? f.name ?? f.filename ?? null,
      created_at: f.created_at ?? f.createdAt ?? f.start_time ?? f.startTime ?? null,
    }));
}

/** Normalize get_transcript output into [{speaker, text}]. */
function coerceTranscript(payload) {
  const segments = Array.isArray(payload) ? payload
    : Array.isArray(payload?.transcript) ? payload.transcript
    : Array.isArray(payload?.segments) ? payload.segments
    : Array.isArray(payload?.data) ? payload.data
    : [];
  return segments
    .map((s) => (typeof s === "string"
      ? { speaker: null, text: s }
      : { speaker: s?.speaker ?? s?.speaker_label ?? null, text: String(s?.text ?? s?.content ?? "") }))
    .filter((s) => s.text.trim());
}

/** Normalize get_note output into a plain summary string (or null). */
function coerceNote(payload) {
  if (typeof payload === "string") return payload.trim() || null;
  const text = payload?.note ?? payload?.summary ?? payload?.content ?? payload?.text ?? null;
  return typeof text === "string" && text.trim() ? text : null;
}

async function exportPlaudSnapshot(options, client) {
  // Fail fast with a login pointer when unauthenticated.
  try {
    await callTool(client, "get_current_user", {});
  } catch (err) {
    throw new Error(`Plaud MCP not authenticated (${err.message}); run: node scripts/plaud-mcp-client.mjs --login`);
  }

  const now = Date.now();
  const listResult = await callTool(client, "list_files", {
    start_date: isoDate(now - options.days * 24 * 60 * 60 * 1000),
    end_date: isoDate(now),
  });
  const files = coerceFileList(toolJson(listResult));

  const { buildPlaudNote } = requireDist("../dist/src/engine/sources/plaud.js");
  const meetingNotes = [];
  for (const file of files) {
    let transcript = [];
    let noteText = null;
    try {
      transcript = coerceTranscript(toolJson(await callTool(client, "get_transcript", { file_id: file.id })));
    } catch { /* transcript optional (list-only tiers) */ }
    try {
      noteText = coerceNote(toolJson(await callTool(client, "get_note", { file_id: file.id })));
    } catch { /* note optional */ }
    meetingNotes.push(buildPlaudNote(file, transcript, noteText));
  }

  const snapshot = { events: [], meeting_notes: meetingNotes };
  mkdirSync(dirname(options.exportSnapshot), { recursive: true });
  writeFileSync(options.exportSnapshot, JSON.stringify(snapshot, null, 2));
  const response = {
    status: "exported",
    out: options.exportSnapshot,
    days: options.days,
    meeting_notes: meetingNotes.length,
  };

  if (options.importPostgres || options.dryRun) {
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    const { normalizeGranolaNotes } = requireDist("../dist/src/engine/sources/granola.js");
    const rows = normalizeGranolaNotes(meetingNotes);
    if (options.synthesizeSpans) {
      // Synthesize BEFORE the sink: incoming rows then match stored rows on
      // re-import (dedup_skips instead of rewrite+embedding-reset churn).
      // Only when Plaud shipped no transcript for the file.
      for (const row of rows) {
        const body = typeof row.body === "string" ? row.body : "";
        const hasSpans = Array.isArray(row.transcript_spans) && row.transcript_spans.length > 0;
        if (!hasSpans && body.trim().length >= 16) {
          row.transcript_spans = transcriptSpans(body);
        }
      }
    }
    response.normalized_meeting_notes = rows.length;
    response.user_id = options.userId;
    if (!options.dryRun) {
      const { PostgresIngestSink } = requireDist("../dist/src/engine/ingest/sink.js");
      const { graphStoreDescription, queryJson } = requireDist("../dist/src/graph-db.js");
      const sink = new PostgresIngestSink();
      const importResult = await sink.upsertMeetingNotes(options.userId, rows);
      const readback = await queryJson(
        `SELECT count(*) AS plaud_meeting_notes FROM meeting_notes WHERE user_id=${sqlString(options.userId)} AND source='plaud'`,
      );
      response.target = graphStoreDescription();
      response.imported = {
        rows_written: importResult.rowsWritten,
        dedup_skips: importResult.dedupSkips,
      };
      response.readback = readback[0] ?? null;
    }
  }
  console.log(JSON.stringify(response, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = await connect(options.nonInteractive && !options.login);
  try {
    if (options.login) {
      // The official MCP runs its browser OAuth on first spawn without
      // --no-login; touching a tool forces the flow to complete.
      const user = toolJson(await callTool(client, "get_current_user", {}));
      console.log(JSON.stringify({ status: "logged_in", user }, null, 2));
    }
    if (options.listTools) {
      const tools = await client.listTools();
      console.log(JSON.stringify(tools, null, 2));
    }
    if (options.exportSnapshot) await exportPlaudSnapshot(options, client);
  } finally {
    await client.close().catch(() => {});
  }
}

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
