#!/usr/bin/env node
// Local Granola remote-MCP bridge.
//
// This script uses Granola's OAuth-protected MCP endpoint:
//   https://mcp.granola.ai/mcp
//
// It keeps OAuth tokens out of the repo by default, under:
//   ~/Library/Application Support/DaoBrew/granola-mcp-token.json

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { transcriptSpans } from "./backfill-granola-transcripts.mjs";

const require = createRequire(import.meta.url);

const MCP_URL = "https://mcp.granola.ai/mcp";
const AUTH_ISSUER = "https://mcp-auth.granola.ai";
const DEFAULT_TOKEN_PATH = join(homedir(), "Library", "Application Support", "DaoBrew", "granola-mcp-token.json");
// Bind an OS-assigned free port by default. A fixed 8787 callback collides
// with the resident engine server that one-click setup starts first.
const DEFAULT_REDIRECT_PORT = 0;
const PROTOCOL_VERSION = "2025-06-18";
export const GRANOLA_NON_INTERACTIVE_AUTH_ERROR_CODE = "GRANOLA_MCP_AUTH_REQUIRED";
export const GRANOLA_NON_INTERACTIVE_AUTH_ERROR_MESSAGE =
  "Granola MCP authentication required; run --login interactively.";
export const GRANOLA_TOKEN_MAX_BYTES = 64 * 1024;

function usage() {
  return [
    "Usage:",
    "  node scripts/granola-mcp-client.mjs --login",
    "  node scripts/granola-mcp-client.mjs --list-tools",
    "  node scripts/granola-mcp-client.mjs --tool TOOL_NAME --args '{...}' [--out notes.json]",
    "  node scripts/granola-mcp-client.mjs --export-snapshot /tmp/granola.json [--import-postgres --user-id UUID]",
    "",
    "Options:",
    "  --login                 Force OAuth login and save token",
    "  --list-tools            Print MCP tools/list",
    "  --tool NAME             Call one MCP tool",
    "  --args JSON             JSON arguments for --tool (default: {})",
    "  --out PATH              Write tool result JSON",
    "  --export-snapshot PATH  Export Granola meetings as { events: [], meeting_notes: [...] }",
    "  --time-range RANGE      this_week | last_week | last_30_days (default: last_30_days)",
    "  --import-postgres       Import exported meeting_notes into local Postgres source table",
    "  --user-id ID            Canonical UUID user id for --import-postgres",
    "                          (default: DAOBREW_USER_ID or config user_id; fails closed if absent)",
    "  --no-synthesize-spans   Do not synthesize transcript spans from note bodies when",
    "                          the Granola tier ships no transcript (default: synthesize)",
    "  --dry-run               Count normalized rows without writing Postgres",
    "  --non-interactive       Fail instead of starting an OAuth login (for daemons)",
    "  --token-file PATH       Override token cache path",
    "  --port N                Local OAuth callback port (default: an OS-assigned free port)",
    "  --no-open               Print auth URL without opening browser",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    login: false,
    listTools: false,
    tool: null,
    argsJson: "{}",
    out: null,
    exportSnapshot: null,
    timeRange: "last_30_days",
    importPostgres: false,
    userId: null,
    synthesizeSpans: true,
    nonInteractive: false,
    dryRun: false,
    tokenFile: process.env.GRANOLA_MCP_TOKEN_FILE || DEFAULT_TOKEN_PATH,
    port: Number(process.env.GRANOLA_MCP_REDIRECT_PORT || DEFAULT_REDIRECT_PORT),
    openBrowser: true,
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
    } else if (arg === "--tool") {
      options.tool = argv[++i];
    } else if (arg.startsWith("--tool=")) {
      options.tool = arg.slice("--tool=".length);
    } else if (arg === "--args") {
      options.argsJson = argv[++i];
    } else if (arg.startsWith("--args=")) {
      options.argsJson = arg.slice("--args=".length);
    } else if (arg === "--out") {
      options.out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    } else if (arg === "--export-snapshot") {
      options.exportSnapshot = argv[++i];
    } else if (arg.startsWith("--export-snapshot=")) {
      options.exportSnapshot = arg.slice("--export-snapshot=".length);
    } else if (arg === "--time-range") {
      options.timeRange = argv[++i];
    } else if (arg.startsWith("--time-range=")) {
      options.timeRange = arg.slice("--time-range=".length);
    } else if (arg === "--import-postgres") {
      options.importPostgres = true;
    } else if (arg === "--user-id") {
      options.userId = argv[++i];
    } else if (arg.startsWith("--user-id=")) {
      options.userId = arg.slice("--user-id=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-synthesize-spans") {
      options.synthesizeSpans = false;
    } else if (arg === "--synthesize-spans") {
      options.synthesizeSpans = true;
    } else if (arg === "--non-interactive") {
      options.nonInteractive = true;
    } else if (arg === "--token-file") {
      options.tokenFile = argv[++i];
    } else if (arg.startsWith("--token-file=")) {
      options.tokenFile = arg.slice("--token-file=".length);
    } else if (arg === "--port") {
      options.port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
    } else if (arg === "--no-open") {
      options.openBrowser = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["this_week", "last_week", "last_30_days"].includes(options.timeRange)) throw new Error("Invalid --time-range");
  if (!options.login && !options.listTools && !options.tool && !options.exportSnapshot) options.listTools = true;
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) throw new Error("Invalid --port");
  JSON.parse(options.argsJson);
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

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pkceChallenge(verifier) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

async function readJson(response, label) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned non-JSON (${response.status}): ${text.slice(0, 240)}`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function privateTokenStat(stat) {
  return stat.isFile()
    && stat.uid === BigInt(process.getuid())
    && stat.nlink === 1n
    && (stat.mode & 0o7777n) === 0o600n
    && stat.size >= 0n
    && stat.size <= BigInt(GRANOLA_TOKEN_MAX_BYTES);
}

function sameTokenStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function openPrivateToken(path) {
  if (typeof process.getuid !== "function" || !fsConstants.O_NOFOLLOW) return null;
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd, { bigint: true });
    const pathStat = lstatSync(path, { bigint: true });
    if (!privateTokenStat(stat) || !sameTokenStat(stat, pathStat)) {
      closeSync(fd);
      return null;
    }
    return { fd, stat };
  } catch {
    closeSync(fd);
    return null;
  }
}

export function loadToken(path) {
  const opened = openPrivateToken(path);
  if (!opened) return null;
  const { fd, stat: before } = opened;
  try {
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) return null;
      offset += count;
    }
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    if (!sameTokenStat(before, after) || !sameTokenStat(after, pathAfter)) return null;
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

function hasAccessToken(token) {
  return typeof token?.access_token === "string" && token.access_token.trim().length > 0;
}

function nonInteractiveAuthError() {
  const error = new Error(GRANOLA_NON_INTERACTIVE_AUTH_ERROR_MESSAGE);
  error.code = GRANOLA_NON_INTERACTIVE_AUTH_ERROR_CODE;
  return error;
}

function tokenCacheSafetyError() {
  return new Error("Granola token cache is not a private owner file");
}

export function saveToken(path, token) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const existing = openPrivateToken(path);
  let pathExists = false;
  try {
    lstatSync(path);
    pathExists = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw tokenCacheSafetyError();
  }
  if (pathExists && !existing) throw tokenCacheSafetyError();

  const payload = Buffer.from(
    JSON.stringify({ ...token, saved_at: Math.trunc(Date.now() / 1000) }, null, 2),
    "utf8",
  );
  if (payload.length > GRANOLA_TOKEN_MAX_BYTES) {
    if (existing) closeSync(existing.fd);
    throw tokenCacheSafetyError();
  }
  const temporary = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`,
  );
  let temporaryFd;
  try {
    temporaryFd = openSync(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(temporaryFd, 0o600);
    writeFileSync(temporaryFd, payload);
    fsyncSync(temporaryFd);
    const temporaryStat = fstatSync(temporaryFd, { bigint: true });
    if (!privateTokenStat(temporaryStat) || temporaryStat.size !== BigInt(payload.length)) {
      throw tokenCacheSafetyError();
    }
    closeSync(temporaryFd);
    temporaryFd = undefined;

    let current = null;
    try {
      current = lstatSync(path, { bigint: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw tokenCacheSafetyError();
    }
    if (existing) {
      if (!current || !sameTokenStat(existing.stat, current)) throw tokenCacheSafetyError();
    } else if (current) {
      throw tokenCacheSafetyError();
    }
    renameSync(temporary, path);
  } finally {
    if (temporaryFd !== undefined) closeSync(temporaryFd);
    try { unlinkSync(temporary); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (existing) closeSync(existing.fd);
  }
}

async function registerClient(redirectUri) {
  const response = await fetch(`${AUTH_ISSUER}/oauth2/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "DaoBrew Local Granola MCP Importer",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  return readJson(response, "OAuth client registration");
}

export function startCallbackServer(
  port,
  state,
  createServerImpl = createServer,
) {
  return new Promise((resolveListen, rejectListen) => {
    let resolveCode;
    let rejectCode;
    const code = new Promise((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    let listening = false;
    const server = createServerImpl((req, res) => {
      try {
        const url = new URL(
          req.url || "/",
          `http://127.0.0.1:${server.address().port}`,
        );
        if (url.pathname !== "/callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid state");
          rejectCode(new Error("OAuth callback state mismatch"));
          server.close();
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400).end(`Granola authorization failed: ${error}`);
          rejectCode(new Error(`Granola authorization failed: ${error}`));
          server.close();
          return;
        }
        const authorizationCode = url.searchParams.get("code");
        if (!authorizationCode) {
          res.writeHead(400).end("Missing code");
          rejectCode(new Error("OAuth callback missing code"));
          server.close();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Granola connected</h1><p>You can return to the terminal.</p>");
        resolveCode(authorizationCode);
        server.close();
      } catch (err) {
        rejectCode(err);
        server.close();
      }
    });
    server.on("error", (error) => {
      if (listening) {
        rejectCode(error);
        server.close();
      } else {
        rejectListen(error);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      listening = true;
      resolveListen({ port: server.address().port, code, server });
    });
  });
}

function openUrl(url) {
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.unref();
}

async function login(options) {
  const state = base64Url(randomBytes(24));
  const callback = await startCallbackServer(options.port, state);
  const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
  let client;
  let verifier;
  let code;
  try {
    client = await registerClient(redirectUri);
    verifier = base64Url(randomBytes(48));
    const authUrl = new URL(`${AUTH_ISSUER}/oauth2/authorize`);
    authUrl.searchParams.set("client_id", client.client_id);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile email offline_access");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", pkceChallenge(verifier));
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("resource", MCP_URL);

    console.log(`Open this URL to authorize Granola MCP:\n${authUrl.toString()}\n`);
    if (options.openBrowser) openUrl(authUrl.toString());
    code = await callback.code;
  } finally {
    callback.server.close();
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.client_id,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    resource: MCP_URL,
  });
  const response = await fetch(`${AUTH_ISSUER}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = await readJson(response, "OAuth token exchange");
  saveToken(options.tokenFile, { ...token, client_id: client.client_id, redirect_uri: redirectUri });
  console.log(JSON.stringify({
    status: "logged_in",
    token_file: options.tokenFile,
    expires_in: token.expires_in ?? null,
  }, null, 2));
  return token;
}

async function refreshToken(options, token) {
  if (!token?.refresh_token || !token?.client_id) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: token.client_id,
    refresh_token: token.refresh_token,
    resource: MCP_URL,
  });
  const response = await fetch(`${AUTH_ISSUER}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) return null;
  const refreshed = await response.json();
  const merged = { ...token, ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token };
  saveToken(options.tokenFile, merged);
  return merged;
}

export async function getToken(
  options,
  {
    loadTokenFn = loadToken,
    loginFn = login,
  } = {},
) {
  if (options.nonInteractive) {
    if (options.login) throw nonInteractiveAuthError();
    const token = loadTokenFn(options.tokenFile);
    if (!hasAccessToken(token)) throw nonInteractiveAuthError();
    return token;
  }

  if (options.login) return loginFn(options);
  const token = loadTokenFn(options.tokenFile);
  if (!hasAccessToken(token)) return loginFn(options);
  return token;
}

function parseMcpPayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^(?:\{|\[|null|true|false|"|-?\d)/.test(trimmed)) return JSON.parse(trimmed);
  const dataLines = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (dataLines.length > 0) return JSON.parse(dataLines.join("\n"));
  throw new Error(`Unable to parse MCP response: ${trimmed.slice(0, 240)}`);
}

async function mcpPost(token, method, params, sessionId, id) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token.access_token}`,
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  if (sessionId) headers["MCP-Session-Id"] = sessionId;
  const payload = { jsonrpc: "2.0", method };
  if (id !== undefined) payload.id = id;
  if (params !== undefined) payload.params = params;
  const response = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await response.text();
  const parsed = parseMcpPayload(text);
  if (!response.ok || parsed?.error) {
    const detail = parsed?.error ?? parsed ?? text;
    const err = new Error(`MCP ${method} failed (${response.status}): ${JSON.stringify(detail)}`);
    err.status = response.status;
    throw err;
  }
  return { body: parsed, sessionId: response.headers.get("mcp-session-id") || sessionId || null };
}

async function mcpToolCall(token, sessionId, name, args, id) {
  const result = await mcpPost(token, "tools/call", { name, arguments: args }, sessionId, id);
  return result.body.result ?? result.body;
}

function textContent(result) {
  if (typeof result?.content?.[0]?.text === "string") return result.content[0].text;
  if (typeof result?.text === "string") return result.text;
  return JSON.stringify(result);
}

function decodeXmlEntities(value) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/\s([a-zA-Z_:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
  }
  return attrs;
}

function splitParticipants(value) {
  return String(value ?? "").toWellFormed()
    .replace(/\([^)]*\)/g, "")
    .split(/,\s*/)
    .map((part) => part.replace(/<[^>]*>/g, "").trim())
    .filter(Boolean);
}

export function canonicalGranolaSnapshotDate(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseMeetingList(text) {
  const meetings = [];
  for (const match of text.matchAll(/<meeting\b([^>]*)>([\s\S]*?)<\/meeting>/g)) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    const participants = match[2].match(/<known_participants>([\s\S]*?)<\/known_participants>/)?.[1] ?? "";
    meetings.push({
      id: attrs.id,
      title: (attrs.title || "(untitled meeting)").toWellFormed(),
      date: attrs.date || null,
      participants: splitParticipants(participants),
    });
  }
  return meetings;
}

function parseMeetingDetails(text, fallbackById) {
  const meetings = [];
  for (const match of text.matchAll(/<meeting\b([^>]*)>([\s\S]*?)<\/meeting>/g)) {
    const attrs = parseAttrs(match[1]);
    if (!attrs.id) continue;
    const body = match[2].toWellFormed();
    const summary = body.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? "";
    const participants = body.match(/<known_participants>([\s\S]*?)<\/known_participants>/)?.[1] ?? "";
    const fallback = fallbackById.get(attrs.id) ?? {};
    const occurredAt = canonicalGranolaSnapshotDate(attrs.date || fallback.date);
    if (occurredAt === null) continue;
    meetings.push({
      id: attrs.id,
      source: "granola",
      source_ref: attrs.id,
      title: (attrs.title || fallback.title || "(untitled meeting)").toWellFormed(),
      created_at: occurredAt,
      occurred_at: occurredAt,
      participants: splitParticipants(participants).length > 0 ? splitParticipants(participants) : fallback.participants ?? [],
      summary: summary || null,
      body: summary || body.trim() || null,
      transcript: [],
      topics: [],
    });
  }
  return meetings;
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

export async function exportGranolaSnapshot(
  options,
  token,
  sessionId,
  {
    mcpToolCallFn = mcpToolCall,
    logFn = console.log,
  } = {},
) {
  const listResult = await mcpToolCallFn(token, sessionId, "list_meetings", { time_range: options.timeRange }, 10);
  const listed = parseMeetingList(textContent(listResult));
  const fallbackById = new Map(listed.map((meeting) => [meeting.id, meeting]));
  const meetingNotes = [];
  for (let i = 0; i < listed.length; i += 10) {
    const ids = listed.slice(i, i + 10).map((meeting) => meeting.id);
    const detailResult = await mcpToolCallFn(token, sessionId, "get_meetings", { meeting_ids: ids }, 11 + i);
    meetingNotes.push(...parseMeetingDetails(textContent(detailResult), fallbackById));
  }
  const snapshot = { events: [], meeting_notes: meetingNotes };
  mkdirSync(dirname(options.exportSnapshot), { recursive: true });
  writeFileSync(options.exportSnapshot, JSON.stringify(snapshot, null, 2));
  const response = {
    status: "exported",
    out: options.exportSnapshot,
    time_range: options.timeRange,
    meeting_notes: meetingNotes.length,
    dropped_meeting_notes: Math.max(0, listed.length - meetingNotes.length),
  };
  if (options.importPostgres || options.dryRun) {
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    const { normalizeGranolaNotes } = requireDist("../dist/src/engine/sources/granola.js");
    const rows = normalizeGranolaNotes(meetingNotes);
    if (options.synthesizeSpans) {
      // Synthesize BEFORE the sink: incoming rows then match stored rows on
      // re-import (dedup_skips instead of rewrite+embedding-reset churn).
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
        `SELECT count(*) AS granola_meeting_notes FROM meeting_notes WHERE user_id=${sqlString(options.userId)} AND source='granola'`,
      );
      response.target = graphStoreDescription();
      response.imported = {
        rows_written: importResult.rowsWritten,
        dedup_skips: importResult.dedupSkips,
      };
      response.readback = readback[0] ?? null;
      if (options.synthesizeSpans) {
        // Personal-tier Granola ships no transcripts; without spans the
        // reasoner's span-in-body citation gate starves and the armed chain
        // demotes. Synthesize spans from each note's own body (deterministic
        // chunker shared with backfill-granola-transcripts.mjs). Spans-only
        // UPDATE — embeddings are reset by the sink only when text changed.
        const { execSql, q } = requireDist("../dist/src/graph-db.js");
        const bare = await queryJson(
          `SELECT id, body FROM meeting_notes\n` +
            ` WHERE user_id=${sqlString(options.userId)} AND source='granola'\n` +
            `   AND body IS NOT NULL AND length(body) >= 16\n` +
            `   AND jsonb_array_length(COALESCE(transcript_spans_json, '[]'::jsonb)) = 0`,
        );
        let synthesized = 0;
        for (const row of bare) {
          const spans = transcriptSpans(String(row.body));
          if (!spans.length) continue;
          await execSql(
            `UPDATE meeting_notes SET transcript_spans_json = ${q(JSON.stringify(spans))}::jsonb\n` +
              ` WHERE id = ${q(String(row.id))} AND user_id = ${sqlString(options.userId)};`,
          );
          synthesized += 1;
        }
        response.spans_synthesized = synthesized;
      }
    }
  }
  logFn(JSON.stringify(response, null, 2));
  return response;
}

export async function withMcp(
  options,
  fn,
  {
    getTokenFn = getToken,
    connectAndRunFn = connectAndRun,
    refreshTokenFn = refreshToken,
  } = {},
) {
  let token = await getTokenFn(options);
  try {
    return await connectAndRunFn(token, fn);
  } catch (err) {
    if (err?.status !== 401) throw err;
    let refreshed;
    try {
      refreshed = await refreshTokenFn(options, token);
    } catch (refreshError) {
      if (options.nonInteractive) throw nonInteractiveAuthError();
      throw refreshError;
    }
    if (!refreshed || (options.nonInteractive && !hasAccessToken(refreshed))) {
      if (options.nonInteractive) throw nonInteractiveAuthError();
      throw err;
    }
    token = refreshed;
    try {
      return await connectAndRunFn(token, fn);
    } catch (retryError) {
      if (options.nonInteractive && retryError?.status === 401) throw nonInteractiveAuthError();
      throw retryError;
    }
  }
}

async function connectAndRun(token, fn) {
  const init = await mcpPost(token, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "daobrew-granola-mcp-client", version: "0.1.0" },
  }, null, 1);
  const sessionId = init.sessionId;
  await mcpPost(token, "notifications/initialized", undefined, sessionId, undefined);
  return fn({ token, sessionId });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await withMcp(options, async ({ token, sessionId }) => {
    if (options.listTools) {
      const tools = await mcpPost(token, "tools/list", {}, sessionId, 2);
      console.log(JSON.stringify(tools.body.result ?? tools.body, null, 2));
    }
    if (options.tool) {
      const body = await mcpToolCall(token, sessionId, options.tool, JSON.parse(options.argsJson), 3);
      if (options.out) {
        writeFileSync(options.out, JSON.stringify(body, null, 2));
        console.log(JSON.stringify({ status: "wrote", out: options.out }, null, 2));
      } else {
        console.log(JSON.stringify(body, null, 2));
      }
    }
    if (options.exportSnapshot) await exportGranolaSnapshot(options, token, sessionId);
  });
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
