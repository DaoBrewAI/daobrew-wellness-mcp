#!/usr/bin/env node
// Google Docs bridge (self-managed connector, BYO OAuth client).
//
// The user creates a Desktop-app OAuth client in their OWN Google Cloud
// project (console.cloud.google.com → APIs & Services → Credentials, with the
// Drive and Docs APIs enabled) and pastes client_id/client_secret into
// ~/.daobrew/config.json (gdocs_client_id / gdocs_client_secret) — DaoBrew
// never holds these credentials. Loopback PKCE flow cloned from
// granola-mcp-client.mjs; token cache under:
//   ~/Library/Application Support/DaoBrew/gdocs-token.json
//
// Usage:
//   node scripts/gdocs-client.mjs --login
//   node scripts/gdocs-client.mjs --list-folders [--out folders.json]
//   node scripts/gdocs-client.mjs --export-snapshot /tmp/gdocs.json --folder-id ID \
//     [--days 30] [--import-postgres] [--user-id ID] [--dry-run] [--non-interactive]

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
} from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transcriptSpans } from "./backfill-granola-transcripts.mjs";

const require = createRequire(import.meta.url);

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DOCS_URL = "https://docs.googleapis.com/v1/documents";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars";
const GOOGLE_DRIVE_READONLY_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_DOCS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/documents.readonly";
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
const REQUESTED_SCOPES = Object.freeze([
  GOOGLE_DRIVE_READONLY_SCOPE,
  GOOGLE_DOCS_READONLY_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
]);
const SCOPES = REQUESTED_SCOPES.join(" ");
const DEFAULT_TOKEN_PATH = join(homedir(), "Library", "Application Support", "DaoBrew", "gdocs-token.json");
const TASKMAP_PRODUCER_MAX_DOCUMENTS = 64;
export const TASKMAP_GOOGLE_CALENDAR_MAX_EVENTS = 256;
export const TASKMAP_GOOGLE_CALENDAR_MAX_PAGES = 4;
const TASKMAP_PRODUCER_MAX_GRANOLA_BYTES = 2 * 1024 * 1024;
const TASKMAP_PRODUCER_MAX_GRANOLA_ROWS = 256;
const TASKMAP_PRODUCER_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const GDOCS_HTTP_TIMEOUT_MS = 30_000;
// Meeting documents are read sequentially. A 2 MiB wire/decompressed-body
// ceiling is ample for bounded meeting evidence while limiting one provider
// response and the 64-document Task Map text-retention worst case to 128 MiB.
export const GDOCS_PROVIDER_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const TASKMAP_SEMANTIC_PRIVACY_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i,
  /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/,
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /(?:^|[\s("'`\[{])(?:\/(?!\/)[^\s,;)"'\]}]+|~\/[^\s,;)"'\]}]+|[A-Za-z]:\\[^\s,;)"'\]}]+|\\\\[^\\\s,;)"'\]}]+\\[^\s,;)"'\]}]+)/i,
];
// 8788 by default — 8787 is the engine's internal server.
const DEFAULT_REDIRECT_PORT = 8788;

function usage() {
  return [
    "Usage:",
    "  node scripts/gdocs-client.mjs --login",
    "  node scripts/gdocs-client.mjs --list-folders [--out PATH]",
    "  node scripts/gdocs-client.mjs --export-snapshot /tmp/gdocs.json --folder-id ID \\",
    "    [--days 30] [--import-postgres --user-id dbk_x] [--dry-run] [--non-interactive]",
    "  node scripts/gdocs-client.mjs --export-calendar-producer PATH \\",
    "    [--google-calendar-id primary] [--calendar-past-days 14] [--calendar-future-days 30]",
    "",
    "Options:",
    "  --login                 Run the loopback PKCE OAuth flow and cache the token",
    "  --list-folders          Print Drive folders as {files:[{id,name}]} (for the picker)",
    "  --out PATH              Write --list-folders JSON to PATH instead of stdout",
    "  --export-snapshot PATH  Export folder Docs as { events: [], meeting_notes: [...] }",
    "  --export-taskmap-producer PATH",
    "                          Also write the owner-only, revision-bound Task Map",
    "                          meeting producer snapshot (mode 0600)",
    "  --export-calendar-producer PATH",
    "                          Write a privacy-bounded Google Calendar provider",
    "                          snapshot (mode 0600); requires Calendar re-authorization",
    "  --google-calendar-id ID Google Calendar ID (default: configured ID, then primary)",
    "  --calendar-past-days N  Calendar lookback window (default: 14)",
    "  --calendar-future-days N",
    "                          Calendar lookahead window (default: 30)",
    "  --taskmap-observed-at ISO",
    "                          Fixed producer observation time (default: current UTC)",
    "  --folder-id ID          Drive folder to scope the export (falls back to",
    "                          gdocs_folder_id in ~/.daobrew/config.json)",
    "  --days N                modifiedTime backfill window in days (default: 30)",
    "  --import-postgres       Import exported meeting_notes into the warm-tier source table",
    "  --user-id ID            Canonical UUID for --import-postgres (default: user_id from",
    "                          ~/.daobrew/config.json; fails closed if absent or invalid)",
    "  --no-synthesize-spans   Do not synthesize transcript spans from doc bodies",
    "                          (default: synthesize — personal notes have no transcript)",
    "  --dry-run               Count normalized rows without writing Postgres",
    "  --non-interactive       Fail instead of starting an OAuth login (for daemons)",
    "  --token-file PATH       Override token cache path",
    "  --port N                Local OAuth callback port (default: 8788)",
    "  --no-open               Print auth URL without opening browser",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = {
    login: false,
    listFolders: false,
    out: null,
    exportSnapshot: null,
    exportTaskMapProducer: null,
    exportCalendarProducer: null,
    taskMapObservedAt: null,
    folderId: null,
    googleCalendarId: null,
    days: 30,
    calendarPastDays: 14,
    calendarFutureDays: 30,
    importPostgres: false,
    userId: typeof process.env.DAOBREW_USER_ID === "string"
      && process.env.DAOBREW_USER_ID.trim()
      ? process.env.DAOBREW_USER_ID.trim()
      : null,
    synthesizeSpans: true,
    dryRun: false,
    nonInteractive: false,
    tokenFile: process.env.GDOCS_TOKEN_FILE || DEFAULT_TOKEN_PATH,
    port: Number(process.env.GDOCS_REDIRECT_PORT || DEFAULT_REDIRECT_PORT),
    openBrowser: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--login") {
      options.login = true;
    } else if (arg === "--list-folders") {
      options.listFolders = true;
    } else if (arg === "--out") {
      options.out = argv[++i];
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
    } else if (arg === "--export-snapshot") {
      options.exportSnapshot = argv[++i];
    } else if (arg.startsWith("--export-snapshot=")) {
      options.exportSnapshot = arg.slice("--export-snapshot=".length);
    } else if (arg === "--export-taskmap-producer") {
      options.exportTaskMapProducer = argv[++i];
    } else if (arg.startsWith("--export-taskmap-producer=")) {
      options.exportTaskMapProducer = arg.slice("--export-taskmap-producer=".length);
    } else if (arg === "--export-calendar-producer") {
      options.exportCalendarProducer = argv[++i];
    } else if (arg.startsWith("--export-calendar-producer=")) {
      options.exportCalendarProducer = arg.slice("--export-calendar-producer=".length);
    } else if (arg === "--taskmap-observed-at") {
      options.taskMapObservedAt = argv[++i];
    } else if (arg.startsWith("--taskmap-observed-at=")) {
      options.taskMapObservedAt = arg.slice("--taskmap-observed-at=".length);
    } else if (arg === "--folder-id") {
      options.folderId = argv[++i];
    } else if (arg.startsWith("--folder-id=")) {
      options.folderId = arg.slice("--folder-id=".length);
    } else if (arg === "--google-calendar-id") {
      options.googleCalendarId = argv[++i];
    } else if (arg.startsWith("--google-calendar-id=")) {
      options.googleCalendarId = arg.slice("--google-calendar-id=".length);
    } else if (arg === "--days") {
      options.days = Number(argv[++i]);
    } else if (arg.startsWith("--days=")) {
      options.days = Number(arg.slice("--days=".length));
    } else if (arg === "--calendar-past-days") {
      options.calendarPastDays = Number(argv[++i]);
    } else if (arg.startsWith("--calendar-past-days=")) {
      options.calendarPastDays = Number(
        arg.slice("--calendar-past-days=".length),
      );
    } else if (arg === "--calendar-future-days") {
      options.calendarFutureDays = Number(argv[++i]);
    } else if (arg.startsWith("--calendar-future-days=")) {
      options.calendarFutureDays = Number(
        arg.slice("--calendar-future-days=".length),
      );
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
  if (!Number.isInteger(options.days) || options.days <= 0) throw new Error("Invalid --days");
  if (
    !Number.isInteger(options.calendarPastDays)
    || options.calendarPastDays < 0
    || options.calendarPastDays > 365
  ) {
    throw new Error("Invalid --calendar-past-days");
  }
  if (
    !Number.isInteger(options.calendarFutureDays)
    || options.calendarFutureDays <= 0
    || options.calendarFutureDays > 365
  ) {
    throw new Error("Invalid --calendar-future-days");
  }
  if (!Number.isInteger(options.port) || options.port <= 0) throw new Error("Invalid --port");
  if (
    !options.login
    && !options.listFolders
    && !options.exportSnapshot
    && !options.exportTaskMapProducer
    && !options.exportCalendarProducer
  ) {
    console.log(usage());
    process.exit(0);
  }
  const config = readConfig();
  if (!options.userId) {
    const value = config?.user_id;
    options.userId = typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  }
  if (options.importPostgres) {
    const canonicalImportUserId = canonicalTaskMapUserId(
      typeof options.userId === "string" ? options.userId.trim().toUpperCase() : null,
    );
    if (canonicalImportUserId === null) {
      throw new Error(
        "--import-postgres requires a canonical UUID user id; pass --user-id, set DAOBREW_USER_ID, or run setup",
      );
    }
    options.userId = canonicalImportUserId;
  }
  if (
    !options.userId
    && (options.exportTaskMapProducer || options.exportCalendarProducer)
  ) {
    throw new Error(
      "Task Map producer requires --user-id, DAOBREW_USER_ID, or configured user_id",
    );
  }
  if (!options.userId) {
    options.userId = "local";
  }
  if (!options.folderId) {
    const value = config?.gdocs_folder_id;
    options.folderId = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  if ((options.exportSnapshot || options.exportTaskMapProducer) && !options.folderId) {
    throw new Error("snapshot export requires --folder-id (or gdocs_folder_id in ~/.daobrew/config.json)");
  }
  if (!options.googleCalendarId) {
    const value = config?.google_calendar_id;
    options.googleCalendarId =
      typeof value === "string" && value.trim()
        ? value.trim()
        : "primary";
  }
  if (
    options.exportCalendarProducer
    && (
      typeof options.googleCalendarId !== "string"
      || options.googleCalendarId.trim().length === 0
      || Buffer.byteLength(options.googleCalendarId, "utf8") > 1_024
    )
  ) {
    throw new Error("Invalid --google-calendar-id");
  }
  if (options.taskMapObservedAt) {
    const parsed = new Date(options.taskMapObservedAt);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error("Invalid --taskmap-observed-at");
    }
    options.taskMapObservedAt = parsed.toISOString();
  }
  return options;
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".daobrew", "config.json"), "utf8"));
  } catch {
    return {};
  }
}

function canonicalTaskMapUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function confirmedTaskMapProducerUserId({
  config,
  explicitUserId,
  requestedUserId,
}) {
  const explicit = canonicalTaskMapUserId(explicitUserId);
  const configured = canonicalTaskMapUserId(config?.user_id);
  const credential = typeof config?.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  if (
    explicit === null
    || configured === null
    || explicit !== configured
    || config?.device_credential_confirmed !== true
    || !credential.startsWith("dbd_")
    || credential.length < 32
  ) {
    throw new Error("Task Map confirmed owner identity is unavailable or changed");
  }
  if (
    requestedUserId !== null
    && requestedUserId !== undefined
    && requestedUserId !== explicit
  ) {
    throw new Error("Task Map requested owner identity does not match");
  }
  return explicit;
}

// BYO OAuth client: no dynamic registration against Google — fail with a
// guided error when the user has not created their Desktop-app client yet.
function clientCredentials() {
  const config = readConfig();
  const clientId = typeof config?.gdocs_client_id === "string" ? config.gdocs_client_id.trim() : "";
  const clientSecret = typeof config?.gdocs_client_secret === "string" ? config.gdocs_client_secret.trim() : "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Docs connector needs your own OAuth client: create a Desktop-app OAuth client at " +
      "console.cloud.google.com → APIs & Services → Credentials, enable the Drive and Docs APIs, " +
      "then put gdocs_client_id and gdocs_client_secret in ~/.daobrew/config.json",
    );
  }
  return { clientId, clientSecret };
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pkceChallenge(verifier) {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function providerResponseError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function readBoundedProviderText(response, label) {
  const declaredLength = response.headers?.get?.("content-length");
  if (declaredLength !== null && declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) {
      throw providerResponseError(
        "ProviderMalformedResponseError",
        `${label} returned an invalid content length`,
      );
    }
    if (
      BigInt(declaredLength)
        > BigInt(GDOCS_PROVIDER_RESPONSE_MAX_BYTES)
    ) {
      throw providerResponseError(
        "ProviderResponseTooLargeError",
        `${label} exceeded the provider response byte limit`,
      );
    }
  }
  if (response.body === null || response.body === undefined) return "";
  if (typeof response.body.getReader !== "function") {
    throw providerResponseError(
      "ProviderMalformedResponseError",
      `${label} returned an unreadable response stream`,
    );
  }
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw providerResponseError(
          "ProviderMalformedResponseError",
          `${label} returned a malformed response stream`,
        );
      }
      totalBytes += value.byteLength;
      if (totalBytes > GDOCS_PROVIDER_RESPONSE_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw providerResponseError(
          "ProviderResponseTooLargeError",
          `${label} exceeded the provider response byte limit`,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

export async function readBoundedProviderJson(response, label) {
  const text = await readBoundedProviderText(response, label);
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw providerResponseError(
      "ProviderMalformedResponseError",
      `${label} returned malformed JSON (${response.status})`,
    );
  }
  if (!response.ok) {
    throw providerResponseError(
      "ProviderHttpError",
      `${label} failed (${response.status})`,
    );
  }
  return parsed;
}

function loadToken(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveToken(path, token) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...token, saved_at: Math.trunc(Date.now() / 1000) }, null, 2), { mode: 0o600 });
}

function waitForCallback(port, state) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400).end("Invalid state");
          reject(new Error("OAuth callback state mismatch"));
          server.close();
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400).end(`Google authorization failed: ${error}`);
          reject(new Error(`Google authorization failed: ${error}`));
          server.close();
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400).end("Missing code");
          reject(new Error("OAuth callback missing code"));
          server.close();
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Google Docs connected</h1><p>You can return to the terminal.</p>");
        resolve(code);
        server.close();
      } catch (err) {
        reject(err);
        server.close();
      }
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1");
  });
}

function openUrl(url) {
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.unref();
}

async function login(options) {
  const { clientId, clientSecret } = clientCredentials();
  const redirectUri = `http://127.0.0.1:${options.port}/callback`;
  const verifier = base64Url(randomBytes(48));
  const state = base64Url(randomBytes(24));
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", pkceChallenge(verifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  // offline + consent so Google issues a refresh_token for the daemon path.
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  const callback = waitForCallback(options.port, state);
  console.log(`Open this URL to authorize Google Docs access:\n${authUrl.toString()}\n`);
  if (options.openBrowser) openUrl(authUrl.toString());
  const code = await callback;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(GDOCS_HTTP_TIMEOUT_MS),
  });
  const exchanged = await readBoundedProviderJson(
    response,
    "OAuth token exchange",
  );
  const token = {
    ...exchanged,
    daobrew_authorized_scopes:
      typeof exchanged?.scope === "string" && exchanged.scope.trim()
        ? exchanged.scope.trim().split(/\s+/u).sort()
        : [...REQUESTED_SCOPES],
  };
  saveToken(options.tokenFile, token);
  console.log(JSON.stringify({
    status: "logged_in",
    token_file: options.tokenFile,
    expires_in: token.expires_in ?? null,
    has_refresh_token: Boolean(token.refresh_token),
  }, null, 2));
  return token;
}

async function refreshToken(options, token) {
  if (!token?.refresh_token) return null;
  const { clientId, clientSecret } = clientCredentials();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(GDOCS_HTTP_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const refreshed = await readBoundedProviderJson(
    response,
    "OAuth token refresh",
  );
  const merged = { ...token, ...refreshed, refresh_token: refreshed.refresh_token ?? token.refresh_token };
  saveToken(options.tokenFile, merged);
  return merged;
}

export async function getToken(options) {
  if (options.login) return login(options);
  const token = loadToken(options.tokenFile);
  if (!token?.access_token) {
    if (options.nonInteractive) {
      const error = new Error(
        `No Google Docs token at ${options.tokenFile}; ` +
        "run: node scripts/gdocs-client.mjs --login",
      );
      error.code = "GDOCS_TOKEN_MISSING";
      throw error;
    }
    return login(options);
  }
  return token;
}

function tokenScopes(token) {
  const scopes = new Set();
  if (typeof token?.scope === "string") {
    for (const scope of token.scope.trim().split(/\s+/u)) {
      if (scope) scopes.add(scope);
    }
  }
  if (Array.isArray(token?.daobrew_authorized_scopes)) {
    for (const scope of token.daobrew_authorized_scopes) {
      if (typeof scope === "string" && scope.trim()) {
        scopes.add(scope.trim());
      }
    }
  }
  return scopes;
}

export function tokenHasGoogleCalendarReadScope(token) {
  return tokenScopes(token).has(GOOGLE_CALENDAR_READONLY_SCOPE);
}

export function assertGoogleCalendarReadScope(token) {
  if (tokenHasGoogleCalendarReadScope(token)) return;
  const error = new Error(
    "Google Calendar permission is missing; reconnect Google Workspace to grant read-only Calendar events access",
  );
  error.code = "GOOGLE_CALENDAR_REAUTH_REQUIRED";
  throw error;
}

async function apiGet(options, token, url, label) {
  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(GDOCS_HTTP_TIMEOUT_MS),
  });
  if (response.status === 401) {
    const refreshed = await refreshToken(options, token);
    if (!refreshed) throw new Error(`${label} unauthorized and refresh failed; rerun --login`);
    Object.assign(token, refreshed);
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(GDOCS_HTTP_TIMEOUT_MS),
    });
  }
  return readBoundedProviderJson(response, label);
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

function taskMapDigest(value) {
  const serialized = typeof value === "string"
    ? value
    : JSON.stringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}

function taskMapFramedDigest(domain, fields) {
  if (
    typeof domain !== "string"
    || domain.length === 0
    || domain.includes("\0")
    || !Array.isArray(fields)
    || fields.length === 0
    || fields.length > 16
  ) {
    throw new Error("Calendar digest framing is invalid");
  }
  const hash = createHash("sha256");
  hash.update(domain, "utf8");
  hash.update(Buffer.from([0]));
  for (const field of fields) {
    if (
      typeof field !== "string"
      || field.includes("\0")
      || Buffer.byteLength(field, "utf8") > 4_096
    ) {
      throw new Error("Calendar digest field is invalid");
    }
    const bytes = Buffer.from(field, "utf8");
    hash.update(String(bytes.byteLength), "utf8");
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

function canonicalGoogleCalendarTimestamp(value, label) {
  if (typeof value?.dateTime === "string") {
    const milliseconds = Date.parse(value.dateTime);
    if (Number.isFinite(milliseconds)) {
      return new Date(milliseconds).toISOString();
    }
  }
  if (
    typeof value?.date === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
  ) {
    const milliseconds = Date.parse(`${value.date}T00:00:00.000Z`);
    if (Number.isFinite(milliseconds)) {
      return new Date(milliseconds).toISOString();
    }
  }
  throw new Error(`${label} has no bounded timestamp`);
}

function normalizeTaskMapCalendarTitle(value) {
  if (typeof value !== "string") {
    throw new Error("Calendar event title is unavailable");
  }
  const title = value.trim().replace(/\s+/gu, " ");
  if (
    title.length === 0
    || Array.from(title).length > 96
    || TASKMAP_SEMANTIC_PRIVACY_PATTERNS.some((pattern) => pattern.test(title))
    || /\b[a-z][a-z0-9+.-]{1,31}:\/\//i.test(title)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(title)
  ) {
    throw new Error("Calendar event title violates the privacy boundary");
  }
  return title;
}

export function buildTaskMapGoogleCalendarEventRows(
  items,
  calendarId,
) {
  if (!Array.isArray(items)) {
    throw new Error("Google Calendar events response is malformed");
  }
  if (items.length > TASKMAP_GOOGLE_CALENDAR_MAX_EVENTS) {
    throw new Error("Google Calendar event window is incomplete");
  }
  const rows = [];
  for (const item of items) {
    if (
      item === null
      || typeof item !== "object"
      || item.status === "cancelled"
      || typeof item.id !== "string"
      || item.id.length === 0
    ) {
      continue;
    }
    try {
      const startAt = canonicalGoogleCalendarTimestamp(
        item.start,
        "Google Calendar event start",
      );
      const endAt = canonicalGoogleCalendarTimestamp(
        item.end,
        "Google Calendar event end",
      );
      if (Date.parse(endAt) < Date.parse(startAt)) continue;
      const title = normalizeTaskMapCalendarTitle(item.summary);
      const eventIdentityDigest = taskMapFramedDigest(
        "taskmap-google-calendar-event.1",
        [String(calendarId), item.id, startAt],
      );
      const crossProviderIdentityDigest =
        typeof item.iCalUID === "string" && item.iCalUID.length > 0
          ? taskMapFramedDigest(
              "taskmap-calendar-cross-provider.1",
              [item.iCalUID, startAt],
            )
          : null;
      rows.push({
        eventIdentityDigest,
        crossProviderIdentityDigest,
        revisionDigest: taskMapFramedDigest(
          "taskmap-calendar-event-revision.1",
          [eventIdentityDigest, title, startAt, endAt],
        ),
        title,
        startAt,
        endAt,
      });
    } catch {
      // One private/malformed event is omitted rather than leaking or
      // invalidating the bounded Calendar source.
    }
  }
  rows.sort(
    (left, right) =>
      left.startAt.localeCompare(right.startAt)
      || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest),
  );
  const identities = new Set();
  return rows.filter((row) => {
    if (identities.has(row.eventIdentityDigest)) return false;
    identities.add(row.eventIdentityDigest);
    return true;
  });
}

export function taskMapCanonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => taskMapCanonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => (
        `${JSON.stringify(key)}:${taskMapCanonicalJson(value[key])}`
      ))
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function taskMapCanonicalDigest(value) {
  return createHash("sha256")
    .update(taskMapCanonicalJson(value))
    .digest("hex");
}

export function buildGdocsExportResponse(options, meetingNoteCount) {
  const response = {
    status: "exported",
    days: options.days,
    meeting_notes: meetingNoteCount,
  };
  if (options.exportTaskMapProducer) {
    response.folder_digest = taskMapCanonicalDigest({
      domain: "taskmap-gdocs-export-folder.1",
      folderId: String(options.folderId),
    });
  } else {
    response.folder_id = options.folderId;
  }
  return response;
}

function gdocsProducerFailureKind(error) {
  if (error?.code === "GDOCS_TOKEN_MISSING") {
    return "authentication_unavailable";
  }
  if (error?.code === "GOOGLE_CALENDAR_REAUTH_REQUIRED") {
    return "calendar_reauthorization_required";
  }
  switch (error?.name) {
    case "AbortError":
    case "TimeoutError":
      return "timeout";
    case "ProviderResponseTooLargeError":
      return "response_too_large";
    case "ProviderMalformedResponseError":
    case "SyntaxError":
      return "malformed_response";
    case "ProviderHttpError":
      return "provider_http_error";
    default:
      return "producer_failed";
  }
}

export function serializeGdocsTopLevelFailure(
  error,
  { producerMode = false } = {},
) {
  if (!producerMode) {
    return JSON.stringify({
      error: error?.message ?? String(error),
    }, null, 2);
  }
  const errorKind = gdocsProducerFailureKind(error);
  return JSON.stringify({
    error_kind: errorKind,
    failure_digest: taskMapCanonicalDigest({
      domain: "taskmap-gdocs-producer-top-level-failure.1",
      errorKind,
    }),
  }, null, 2);
}

export function gdocsArgvRequestsTaskMapProducer(argv) {
  return argv.some(
    (arg) =>
      arg === "--export-taskmap-producer"
      || arg.startsWith("--export-taskmap-producer=")
      || arg === "--export-calendar-producer"
      || arg.startsWith("--export-calendar-producer="),
  );
}

function gdocsDocumentReadErrorKind(error) {
  switch (error?.name) {
    case "AbortError":
    case "TimeoutError":
      return "timeout";
    case "ProviderResponseTooLargeError":
      return "response_too_large";
    case "ProviderMalformedResponseError":
    case "SyntaxError":
      return "malformed_response";
    case "ProviderHttpError":
      return "provider_http_error";
    default:
      return "read_failed";
  }
}

export function reportGdocsDocumentReadFailure(
  documentId,
  error,
  write = console.error,
) {
  const errorKind = gdocsDocumentReadErrorKind(error);
  const documentIdDigest = taskMapCanonicalDigest({
    domain: "taskmap-gdocs-document-id.1",
    documentId: String(documentId),
  });
  const failureDigest = taskMapCanonicalDigest({
    domain: "taskmap-gdocs-document-read-failure.1",
    documentIdDigest,
    errorKind,
  });
  write(JSON.stringify({
    warning: "gdocs_document_read_failed",
    error_kind: errorKind,
    failure_digest: failureDigest,
  }));
  return failureDigest;
}

export function buildTaskMapSnapshotWithOptionalGranola(
  buildSnapshot,
  input,
  { onFallback } = {},
) {
  if (typeof buildSnapshot !== "function") {
    throw new Error("Task Map meeting snapshot builder is required");
  }
  try {
    return buildSnapshot(input);
  } catch (optionalError) {
    const meetings = Array.isArray(input?.meetings) ? input.meetings : [];
    const hasOptionalVariants = meetings.some(
      (meeting) =>
        Array.isArray(meeting?.secondaryVariants)
        && meeting.secondaryVariants.length > 0,
    );
    if (!hasOptionalVariants) throw optionalError;
    const primaryOnlyInput = {
      ...input,
      meetings: meetings.map((meeting) => ({
        ...meeting,
        secondaryVariants: [],
      })),
    };
    // Retry is intentionally unguarded: invalid primary GDocs evidence must
    // still fail rather than being mislabeled as an optional-source problem.
    const snapshot = buildSnapshot(primaryOnlyInput);
    const failureDigest = taskMapCanonicalDigest({
      domain: "taskmap-optional-granola-fallback.1",
      errorKind: gdocsDocumentReadErrorKind(optionalError),
    });
    if (typeof onFallback === "function") {
      onFallback({ failureDigest });
    }
    return snapshot;
  }
}

function taskMapTimestamp(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} must be an RFC3339 timestamp`);
  }
  return parsed.toISOString();
}

function taskMapDeadlineFromDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return `${value}T23:59:59.000Z`;
}

function taskMapBoundedText(value, limit) {
  const normalized = String(value).normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || [...normalized].length > limit) return null;
  return normalized;
}

function taskMapSemanticTextIsPrivacySafe(value) {
  return !TASKMAP_SEMANTIC_PRIVACY_PATTERNS.some(
    (pattern) => pattern.test(value),
  );
}

function taskMapExternalReference(urlText) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  const sortedSearch = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
  url.search = "";
  for (const [key, value] of sortedSearch) {
    url.searchParams.append(key, value);
  }
  return {
    kind: "external_reference",
    referenceDigest: taskMapCanonicalDigest({
      domain: "taskmap-explicit-url-reference.1",
      url: url.toString(),
    }),
  };
}

function taskMapNormalizeEvidencePrefix(value, {
  allowBullet,
  stripAssignee,
}) {
  let statement = String(value).normalize("NFKC").trim();
  if (!statement || [...statement].length > 4096) return null;
  if (allowBullet) {
    statement = statement.replace(/^(?:[-*•]\s*)/, "");
  }
  let status;
  const checkbox = /^\[([ xX])\]\s*/.exec(statement);
  if (checkbox) {
    status = checkbox[1].toLowerCase() === "x" ? "done" : "open";
    statement = statement.slice(checkbox[0].length).trim();
  }
  if (stripAssignee && statement.startsWith("[")) {
    const close = statement.indexOf("]");
    if (close <= 1 || close - 1 > 96) return null;
    statement = statement.slice(close + 1).trim();
    if (!statement || statement.startsWith("[")) return null;
  }
  return { statement, status };
}

function taskMapRedactExternalReferences(value) {
  const objectRefs = [];
  let malformed = false;
  const summary = String(value).replace(
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s<>"')\]]+/g,
    (urlText) => {
      const ref = taskMapExternalReference(urlText);
      if (ref === null) {
        malformed = true;
      } else {
        objectRefs.push(ref);
      }
      return "[reference]";
    },
  );
  if (malformed) return null;
  return {
    summary,
    objectRefs: [...new Map(
      objectRefs.map((ref) => [ref.referenceDigest, ref]),
    ).values()].sort((left, right) => (
      left.referenceDigest.localeCompare(right.referenceDigest)
    )),
  };
}

function taskMapGoogleDocumentIds(text) {
  const ids = new Set();
  for (const match of String(text).matchAll(
    /https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)(?:\/|(?=\s|$))/g,
  )) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}

function taskMapWithoutGoogleDocAssociations(text, documentIds) {
  const associated = new Set(documentIds);
  return String(text).replace(
    /https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)(?:\/[^\s<>"']*)?/g,
    (url, documentId) => (
      associated.has(documentId) ? "" : url
    ),
  );
}

/**
 * Extract only explicitly labelled meeting decisions/actions/commitments.
 * This is deliberately not a generic body summarizer.
 */
export function extractTaskMapMeetingEvidence(text, {
  occurredAt,
  observedAt,
} = {}) {
  const normalizedOccurredAt = taskMapTimestamp(occurredAt, "evidence occurredAt");
  const normalizedObservedAt = taskMapTimestamp(observedAt, "evidence observedAt");
  const rows = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const linePrefix = taskMapNormalizeEvidencePrefix(rawLine, {
      allowBullet: true,
      stripAssignee: false,
    });
    if (linePrefix === null) continue;
    let { statement: line, status } = linePrefix;
    const match = /^(decision|decided|action(?:\s+item)?|todo|next\s+step|commitment|committed)\s*:\s*(.+)$/i.exec(line);
    if (!match) continue;
    const label = match[1].toLowerCase().replace(/\s+/g, " ");
    const kind = label === "decision" || label === "decided"
      ? "decision"
      : label === "commitment" || label === "committed"
        ? "commitment"
        : "action_item";
    const statementPrefix = taskMapNormalizeEvidencePrefix(match[2], {
      allowBullet: true,
      stripAssignee: true,
    });
    if (statementPrefix === null) continue;
    if (
      status !== undefined
      && statementPrefix.status !== undefined
      && status !== statementPrefix.status
    ) {
      continue;
    }
    status ??= statementPrefix.status;
    const redacted = taskMapRedactExternalReferences(
      statementPrefix.statement,
    );
    if (redacted === null) continue;
    let summary = redacted.summary
      .replace(/\s*\[reference\]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let deadline;
    const deadlineMatch = /\s*\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*$/i.exec(summary);
    if (deadlineMatch) {
      deadline = taskMapDeadlineFromDate(deadlineMatch[1]);
      if (deadline === null) continue;
      summary = summary.slice(0, deadlineMatch.index).trim();
    }
    summary = taskMapBoundedText(summary, 200);
    if (
      summary === null
      || !taskMapSemanticTextIsPrivacySafe(summary)
    ) {
      continue;
    }
    rows.push({
      kind,
      title: kind === "decision"
        ? "Meeting decision"
        : kind === "commitment"
          ? "Meeting commitment"
          : "Meeting action item",
      summary,
      occurredAt: normalizedOccurredAt,
      observedAt: normalizedObservedAt,
      ...(kind !== "decision" && status ? { status } : {}),
      ...(deadline === undefined ? {} : { deadline }),
      quality: "bounded_context",
      coverage: "partial",
      confidence: 1,
      objectRefs: redacted.objectRefs,
    });
  }
  return rows;
}

const TASKMAP_DECISION_HEADINGS = new Set([
  "decisions",
  "决策",
  "决定",
]);
const TASKMAP_NEXT_STEP_HEADINGS = new Set([
  "next steps",
  "下一步",
  "后续步骤",
  "行动项",
  "待办事项",
]);

function taskMapGoogleParagraphText(paragraph) {
  const elements = paragraph?.elements;
  if (!Array.isArray(elements)) return "";
  return elements
    .map((element) => (
      typeof element?.textRun?.content === "string"
        ? element.textRun.content
        : ""
    ))
    .join("")
    .replace(/\n$/, "")
    .normalize("NFKC")
    .trim();
}

function taskMapGoogleParagraphLinkUrls(paragraph) {
  const elements = paragraph?.elements;
  if (!Array.isArray(elements)) return [];
  return [...new Set(elements.flatMap((element) => [
    element?.textRun?.textStyle?.link?.url,
    element?.richLink?.richLinkProperties?.uri,
  ]).filter((url) => typeof url === "string" && url.length > 0))];
}

function taskMapGoogleParagraphHasSuggestions(paragraph) {
  if (
    paragraph?.suggestedParagraphStyleChanges
    && Object.keys(paragraph.suggestedParagraphStyleChanges).length > 0
  ) {
    return true;
  }
  const elements = paragraph?.elements;
  if (!Array.isArray(elements)) return false;
  return elements.some((element) => [
    element,
    element?.textRun,
    element?.richLink,
    element?.person,
    element?.autoText,
  ].filter(Boolean).some((variant) => (
    (Array.isArray(variant?.suggestedInsertionIds)
      && variant.suggestedInsertionIds.length > 0)
    || (Array.isArray(variant?.suggestedDeletionIds)
      && variant.suggestedDeletionIds.length > 0)
    || (
      variant?.suggestedTextStyleChanges
      && Object.keys(variant.suggestedTextStyleChanges).length > 0
    )
  )));
}

function taskMapRelevantGoogleDocContent(document) {
  const tabs = document?.tabs;
  if (Array.isArray(tabs)) {
    if (tabs.length !== 1) {
      throw new Error(
        "Google Docs Task Map producer requires exactly one document tab",
      );
    }
    const [tab] = tabs;
    if (Array.isArray(tab?.childTabs) && tab.childTabs.length > 0) {
      throw new Error(
        "Google Docs nested tabs are outside the bounded producer seam",
      );
    }
    const tabId = tab?.tabProperties?.tabId;
    const content = tab?.documentTab?.body?.content;
    if (
      typeof tabId !== "string"
      || !tabId.trim()
      || !Array.isArray(content)
    ) {
      throw new Error("Google Docs document tab is malformed");
    }
    return {
      contentScope: "document_tab",
      tabId: tabId.trim(),
      content,
    };
  }
  if (Array.isArray(document?.body?.content)) {
    return {
      contentScope: "legacy_body",
      tabId: null,
      content: document.body.content,
    };
  }
  throw new Error(
    "Google Docs response must contain legacy body content or exactly one document tab",
  );
}

function taskMapExtractSelectedGoogleDocText(document) {
  return taskMapRelevantGoogleDocContent(document).content
    .map((element) => taskMapGoogleParagraphText(element?.paragraph))
    .filter((text) => text.length > 0)
    .join("\n");
}

function taskMapGoogleDocStructuralContentDigest(document, extractedText) {
  const selected = taskMapRelevantGoogleDocContent(document);
  const documentId = typeof document?.documentId === "string"
    ? document.documentId.trim()
    : "";
  const paragraphRows = [];
  for (let index = 0; index < selected.content.length; index += 1) {
    const paragraph = selected.content[index]?.paragraph;
    if (!paragraph || typeof paragraph !== "object") continue;
    if (taskMapGoogleParagraphHasSuggestions(paragraph)) {
      throw new Error(
        "Google Docs producer received unresolved suggested content",
      );
    }
    const style = paragraph?.paragraphStyle?.namedStyleType;
    paragraphRows.push({
      index,
      namedStyleType: typeof style === "string" ? style : null,
      isListItem: paragraph.isListItem === true
        || (
          paragraph.bullet !== null
          && typeof paragraph.bullet === "object"
        ),
      text: taskMapGoogleParagraphText(paragraph),
      linkReferenceDigests: taskMapGoogleParagraphLinkUrls(paragraph)
        .map((url) => taskMapExternalReference(url)?.referenceDigest ?? null)
        .filter((digest) => digest !== null)
        .sort(),
    });
  }
  return taskMapCanonicalDigest({
    domain: "taskmap-gdocs-structural-content.1",
    documentId,
    contentScope: selected.contentScope,
    tabId: selected.tabId,
    sourceTextDigest: taskMapDigest(
      typeof extractedText === "string" ? extractedText : "",
    ),
    paragraphRows,
  });
}

function taskMapStructuredEvidenceRow(
  kind,
  text,
  { occurredAt, observedAt, linkUrls = [] },
) {
  let prefix = taskMapNormalizeEvidencePrefix(text, {
    allowBullet: true,
    stripAssignee: true,
  });
  if (prefix === null) return null;
  let rowKind = kind;
  let { statement, status } = prefix;
  const labelled = /^(decision|decided|action(?:\s+item)?|todo|next\s+step|commitment|committed)\s*:\s*(.+)$/i.exec(statement);
  if (labelled) {
    const label = labelled[1].toLowerCase().replace(/\s+/g, " ");
    const labelledKind = label === "decision" || label === "decided"
      ? "decision"
      : label === "commitment" || label === "committed"
        ? "commitment"
        : "action_item";
    if (
      (kind === "decision" && labelledKind !== "decision")
      || (kind === "action_item" && labelledKind === "decision")
    ) {
      return null;
    }
    rowKind = labelledKind;
    prefix = taskMapNormalizeEvidencePrefix(labelled[2], {
      allowBullet: true,
      stripAssignee: true,
    });
    if (prefix === null) return null;
    if (
      status !== undefined
      && prefix.status !== undefined
      && status !== prefix.status
    ) {
      return null;
    }
    status ??= prefix.status;
    statement = prefix.statement;
  }
  const redacted = taskMapRedactExternalReferences(
    `${statement}${linkUrls.map((url) => ` ${url}`).join("")}`,
  );
  if (redacted === null) return null;
  statement = redacted.summary
    .replace(/\s*\[reference\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let deadline;
  const deadlineMatch =
    /\s*\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*$/i.exec(statement);
  if (deadlineMatch) {
    deadline = taskMapDeadlineFromDate(deadlineMatch[1]);
    if (deadline === null) return null;
    statement = statement.slice(0, deadlineMatch.index).trim();
  }
  const summary = taskMapBoundedText(statement, 200);
  if (
    summary === null
    || !taskMapSemanticTextIsPrivacySafe(summary)
  ) {
    return null;
  }
  return {
    kind: rowKind,
    title: rowKind === "decision"
      ? "Meeting decision"
      : rowKind === "commitment"
        ? "Meeting commitment"
        : "Meeting action item",
    summary,
    occurredAt,
    observedAt,
    ...(rowKind !== "decision" && status ? { status } : {}),
    ...(deadline === undefined ? {} : { deadline }),
    quality: "bounded_context",
    coverage: "partial",
    confidence: 1,
    objectRefs: redacted.objectRefs,
  };
}

/**
 * Parse only exact, section-scoped Google Docs list structure. Summary,
 * Details, arbitrary prose, and unlisted text are never semantic evidence.
 */
export function extractTaskMapMeetingEvidenceFromGoogleDoc(document, {
  occurredAt,
  observedAt,
} = {}) {
  const normalizedOccurredAt =
    taskMapTimestamp(occurredAt, "evidence occurredAt");
  const normalizedObservedAt =
    taskMapTimestamp(observedAt, "evidence observedAt");
  const { content } = taskMapRelevantGoogleDocContent(document);
  let section = null;
  const rows = [];
  for (const element of content) {
    const paragraph = element?.paragraph;
    if (!paragraph || typeof paragraph !== "object") continue;
    if (taskMapGoogleParagraphHasSuggestions(paragraph)) {
      throw new Error(
        "Google Docs producer received unresolved suggested content",
      );
    }
    const style = paragraph?.paragraphStyle?.namedStyleType;
    const text = taskMapGoogleParagraphText(paragraph);
    if (style === "HEADING_3") {
      const heading = text.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
      section = TASKMAP_DECISION_HEADINGS.has(heading)
        ? "decision"
        : TASKMAP_NEXT_STEP_HEADINGS.has(heading)
          ? "action_item"
          : null;
      continue;
    }
    if (typeof style === "string" && style.startsWith("HEADING_")) {
      section = null;
      continue;
    }
    if (style === "SUBTITLE") continue;
    const isListItem = paragraph.isListItem === true
      || (
        paragraph.bullet !== null
        && typeof paragraph.bullet === "object"
      );
    if (
      section === null
      || style !== "NORMAL_TEXT"
      || !isListItem
      || !text
    ) {
      continue;
    }
    const row = taskMapStructuredEvidenceRow(
      section,
      text,
      {
        occurredAt: normalizedOccurredAt,
        observedAt: normalizedObservedAt,
        linkUrls: taskMapGoogleParagraphLinkUrls(paragraph),
      },
    );
    if (row !== null) rows.push(row);
  }
  return rows;
}

export function buildTaskMapGdocsMeetingDraft({
  file,
  document,
  extractedText,
  observedAt,
}) {
  if (!file || typeof file !== "object" || typeof file.id !== "string" || !file.id.trim()) {
    throw new Error("Google Docs file id is required");
  }
  if (!document || typeof document !== "object") {
    throw new Error("Google Docs documents.get response is required");
  }
  if (
    typeof document.documentId !== "string"
    || !document.documentId.trim()
  ) {
    throw new Error("Google Docs documents.get response is missing documentId");
  }
  if (document.documentId !== file.id) {
    throw new Error("Google Docs documents.get identity mismatch");
  }
  if (typeof document.revisionId !== "string" || !document.revisionId.trim()) {
    throw new Error("Google Docs documents.get response is missing revisionId");
  }
  const normalizedObservedAt = taskMapTimestamp(observedAt, "producer observedAt");
  const modifiedAt = taskMapTimestamp(
    file.modifiedTime ?? file.createdTime,
    "Google Docs modifiedAt",
  );
  const eventTime = taskMapTimestamp(
    file.createdTime ?? file.modifiedTime,
    "Google Docs eventTime",
  );
  if (new Date(modifiedAt).getTime() > new Date(normalizedObservedAt).getTime()) {
    throw new Error("Google Docs modifiedAt cannot be after observedAt");
  }
  const text = typeof extractedText === "string" ? extractedText : "";
  const evidence = extractTaskMapMeetingEvidenceFromGoogleDoc(document, {
    occurredAt: eventTime,
    observedAt: normalizedObservedAt,
  });
  return {
    documentId: file.id,
    revisionId: document.revisionId,
    contentDigest: taskMapGoogleDocStructuralContentDigest(document, text),
    modifiedAt,
    eventTime,
    observedAt: normalizedObservedAt,
    evidence,
    secondaryVariants: [],
  };
}

export function readAuthenticatedGranolaSnapshot(
  snapshotPath,
  {
    readBytes = (descriptor) => readFileSync(descriptor),
  } = {},
) {
  let descriptor;
  try {
    descriptor = openSync(
      snapshotPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Granola variant snapshot authentication failed");
  }
  try {
    const before = fstatSync(descriptor);
    const currentUid = typeof process.getuid === "function"
      ? process.getuid()
      : before.uid;
    if (
      !before.isFile()
      || before.uid !== currentUid
      || before.nlink !== 1
      || (before.mode & 0o777) !== 0o600
      || before.size < 2
      || before.size > TASKMAP_PRODUCER_MAX_GRANOLA_BYTES
    ) {
      throw new Error("Granola variant snapshot authentication failed");
    }
    const bytes = readBytes(descriptor);
    if (!Buffer.isBuffer(bytes)) {
      throw new Error("Granola variant snapshot read failed");
    }
    const after = fstatSync(descriptor);
    if (
      bytes.byteLength !== before.size
      || bytes.byteLength > TASKMAP_PRODUCER_MAX_GRANOLA_BYTES
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      throw new Error("Granola variant snapshot changed during read");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Granola variant snapshot is malformed");
    }
    return {
      snapshot,
      modifiedAt: new Date(before.mtimeMs).toISOString(),
      modifiedAtMs: before.mtimeMs,
    };
  } finally {
    closeSync(descriptor);
  }
}

export function taskMapGranolaVariants(snapshotPath, {
  observedAt,
  binding,
  knownDocumentIds,
}) {
  if (!snapshotPath) return new Map();
  const authenticated = readAuthenticatedGranolaSnapshot(snapshotPath);
  if (authenticated === null) return new Map();
  const observedMs = new Date(observedAt).getTime();
  const ageMs = observedMs - authenticated.modifiedAtMs;
  if (ageMs < 0 || ageMs >= TASKMAP_PRODUCER_MAX_AGE_MS) {
    return new Map();
  }
  const sourceObservedAt = authenticated.modifiedAt;
  const { snapshot } = authenticated;
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.meeting_notes)) {
    throw new Error("Granola variant snapshot is malformed");
  }
  if (snapshot.meeting_notes.length > TASKMAP_PRODUCER_MAX_GRANOLA_ROWS) {
    throw new Error("Granola variant snapshot exceeds the bounded row count");
  }
  const byDocumentId = new Map();
  for (const note of snapshot.meeting_notes) {
    if (!note || typeof note !== "object") {
      throw new Error("Granola variant snapshot is malformed");
    }
    const sourceObjectId = String(note.source_ref ?? note.id ?? "").trim();
    if (!sourceObjectId) {
      throw new Error("Granola variant snapshot is missing source identity");
    }
    const text = [
      typeof note.summary === "string" ? note.summary : "",
      typeof note.body === "string" ? note.body : "",
    ].filter(Boolean).join("\n");
    const documentIds = taskMapGoogleDocumentIds(text)
      .filter((documentId) => knownDocumentIds.has(documentId));
    if (documentIds.length === 0) continue;
    if (documentIds.length !== 1) {
      console.error(JSON.stringify({
        warning: "ambiguous Granola variant skipped",
        failure_digest: taskMapCanonicalDigest({
          domain: "taskmap-granola-variant-failure.1",
          reason: "ambiguous_canonical_document",
          sourceObjectDigest: taskMapDigest(sourceObjectId),
          candidateDocumentDigests: documentIds
            .map((documentId) => taskMapDigest(documentId))
            .sort(),
        }),
      }));
      continue;
    }
    const eventTime = taskMapTimestamp(
      note.occurred_at ?? note.created_at,
      "Granola eventTime",
    );
    const contentDigest = taskMapDigest(text);
    const semanticText = taskMapWithoutGoogleDocAssociations(
      text,
      documentIds,
    );
    const variant = {
      binding,
      sourceObjectId,
      sourceVersion: contentDigest,
      contentDigest,
      modifiedAt: eventTime,
      eventTime,
      observedAt: sourceObservedAt,
      evidence: extractTaskMapMeetingEvidence(semanticText, {
        occurredAt: eventTime,
        observedAt: sourceObservedAt,
      }),
    };
    const [documentId] = documentIds;
    byDocumentId.set(
      documentId,
      [...(byDocumentId.get(documentId) ?? []), variant],
    );
  }
  return byDocumentId;
}

export function loadTaskMapGranolaVariants(
  snapshotPath,
  options,
) {
  try {
    return taskMapGranolaVariants(snapshotPath, options);
  } catch (error) {
    console.error(JSON.stringify({
      warning: "Granola variant snapshot unavailable",
      failure_digest: taskMapCanonicalDigest({
        domain: "taskmap-granola-variant-failure.1",
        reason: "snapshot_unavailable",
        failureKind: error instanceof Error ? error.name : "unknown",
      }),
    }));
    return new Map();
  }
}

export function writeOwnerOnlyTaskMapSnapshot(path, snapshot) {
  if (
    typeof path !== "string"
    || !isAbsolute(path)
    || normalize(path) !== path
    || /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error("Task Map producer path must be normalized and absolute");
  }
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = lstatSync(directory);
  const currentUid = typeof process.getuid === "function"
    ? process.getuid()
    : directoryStat.uid;
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || directoryStat.uid !== currentUid
    || (directoryStat.mode & 0o777) !== 0o700
  ) {
    throw new Error(
      "Task Map producer parent must be an owner-only, non-symlink directory",
    );
  }
  const tempPath = join(
    directory,
    `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(tempPath, "wx", 0o600);
    writeFileSync(descriptor, taskMapCanonicalJson(snapshot), "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(tempPath, path);
    chmodSync(path, 0o600);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; the owner-only target was never replaced.
    }
    throw error;
  }
}

async function listFolders(options, token) {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: "files(id,name)",
    pageSize: "200",
  });
  const payload = await apiGet(options, token, `${DRIVE_FILES_URL}?${params}`, "Drive folder list");
  const out = { files: Array.isArray(payload?.files) ? payload.files : [] };
  if (options.out) {
    writeFileSync(options.out, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ status: "wrote", out: options.out, folders: out.files.length }, null, 2));
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
}

export async function listFolderDocs(options, token, get = apiGet) {
  const observedAt = taskMapTimestamp(
    options.sourceObservedAt
      ?? options.taskMapObservedAt
      ?? new Date().toISOString(),
    "source observation time",
  );
  const sinceIso = new Date(
    Date.parse(observedAt) - options.days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const boundedTaskMapRead = Boolean(options.exportTaskMapProducer);
  const files = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${options.folderId}' in parents and mimeType='application/vnd.google-apps.document' ` +
        `and modifiedTime > '${sinceIso}' and trashed=false`,
      fields: "nextPageToken, files(id,name,modifiedTime,createdTime)",
      pageSize: boundedTaskMapRead
        ? String(TASKMAP_PRODUCER_MAX_DOCUMENTS + 1)
        : "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const payload = await get(
      options,
      token,
      `${DRIVE_FILES_URL}?${params}`,
      "Drive files list",
    );
    files.push(...(Array.isArray(payload?.files) ? payload.files : []));
    if (
      boundedTaskMapRead
      && (
        files.length > TASKMAP_PRODUCER_MAX_DOCUMENTS
        || (
          typeof payload?.nextPageToken === "string"
          && payload.nextPageToken.length > 0
        )
      )
    ) {
      throw new Error(
        "Task Map producer document page is incomplete; narrow the configured folder",
      );
    }
    pageToken = payload?.nextPageToken ?? null;
  } while (pageToken);
  return files;
}

export function googleCalendarEventsListUrl({
  calendarId,
  timeMin,
  timeMax,
  pageToken = null,
}) {
  const url = new URL(
    `${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("maxResults", "250");
  url.searchParams.set(
    "fields",
    "nextPageToken,items(id,iCalUID,updated,status,summary,start,end)",
  );
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

export async function listGoogleCalendarEvents(
  options,
  token,
  get = apiGet,
) {
  assertGoogleCalendarReadScope(token);
  const observedAt = new Date(
    options.calendarObservedAt
      ?? options.taskMapObservedAt
      ?? new Date().toISOString(),
  );
  if (!Number.isFinite(observedAt.getTime())) {
    throw new Error("Google Calendar observation time is invalid");
  }
  const timeMin = new Date(
    observedAt.getTime()
      - Number(options.calendarPastDays ?? 14) * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const timeMax = new Date(
    observedAt.getTime()
      + Number(options.calendarFutureDays ?? 30) * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const items = [];
  let pageToken = null;
  let pages = 0;
  do {
    pages += 1;
    if (pages > TASKMAP_GOOGLE_CALENDAR_MAX_PAGES) {
      throw new Error("Google Calendar page window is incomplete");
    }
    const payload = await get(
      options,
      token,
      googleCalendarEventsListUrl({
        calendarId: options.googleCalendarId,
        timeMin,
        timeMax,
        pageToken,
      }),
      "Google Calendar events list",
    );
    if (!Array.isArray(payload?.items)) {
      throw new Error("Google Calendar events response is malformed");
    }
    items.push(...payload.items);
    if (items.length > TASKMAP_GOOGLE_CALENDAR_MAX_EVENTS) {
      throw new Error("Google Calendar event window is incomplete");
    }
    pageToken =
      typeof payload.nextPageToken === "string"
      && payload.nextPageToken.length > 0
        ? payload.nextPageToken
        : null;
  } while (pageToken);
  return {
    observedAt: observedAt.toISOString(),
    timeMin,
    timeMax,
    pages,
    rows: buildTaskMapGoogleCalendarEventRows(
      items,
      options.googleCalendarId,
    ),
  };
}

export function docsGetUrl(documentId, includeTabsContent) {
  const url = new URL(`${DOCS_URL}/${encodeURIComponent(documentId)}`);
  if (includeTabsContent) {
    url.searchParams.set("includeTabsContent", "true");
    url.searchParams.set(
      "suggestionsViewMode",
      "PREVIEW_WITHOUT_SUGGESTIONS",
    );
  }
  return url.toString();
}

async function exportGdocsSnapshot(options, token) {
  const { extractDocText, buildGdocsNotes } = requireDist("../dist/src/engine/sources/gdocs.js");
  const observedAt = options.taskMapObservedAt ?? new Date().toISOString();
  const files = await listFolderDocs(
    { ...options, sourceObservedAt: observedAt },
    token,
  );
  if (
    options.exportTaskMapProducer
    && files.length > TASKMAP_PRODUCER_MAX_DOCUMENTS
  ) {
    throw new Error(
      "Task Map producer document page is incomplete; narrow the configured folder",
    );
  }
  const docTextById = new Map();
  const taskMapDraftById = new Map();
  const failedDocumentReads = [];
  for (const file of files) {
    try {
      const document = await apiGet(
        options,
        token,
        docsGetUrl(file.id, Boolean(options.exportTaskMapProducer)),
        "Docs document read",
      );
      const text = options.exportTaskMapProducer
        ? taskMapExtractSelectedGoogleDocText(document)
        : extractDocText(document);
      docTextById.set(file.id, text);
      if (options.exportTaskMapProducer) {
        taskMapDraftById.set(
          file.id,
          buildTaskMapGdocsMeetingDraft({
            file,
            document,
            extractedText: text,
            observedAt,
          }),
        );
      }
      // Do not retain the full provider response. Compatibility keeps only
      // extracted text; Task Map keeps the bounded, revision-bound draft.
    } catch (error) {
      failedDocumentReads.push(
        reportGdocsDocumentReadFailure(file.id, error),
      );
    }
  }
  const meetingNotes = buildGdocsNotes(files, docTextById);
  const snapshot = { events: [], meeting_notes: meetingNotes };
  if (options.exportSnapshot) {
    mkdirSync(dirname(options.exportSnapshot), { recursive: true });
    writeFileSync(options.exportSnapshot, JSON.stringify(snapshot, null, 2));
  }
  const response = buildGdocsExportResponse(options, meetingNotes.length);

  if (options.exportTaskMapProducer) {
    if (
      failedDocumentReads.length > 0
      || taskMapDraftById.size !== files.length
    ) {
      throw new Error(
        `Task Map producer is incomplete (${failedDocumentReads.length} digest-only read failure(s))`,
      );
    }
    const {
      TASKMAP_MEETING_PRODUCER_VERSION,
      buildTaskMapMeetingProducerSnapshot,
      taskMapMeetingProducerOwnerScopeDigest,
    } = requireDist(
      "../dist/src/engine/taskmap/meeting-producer-freshness.js",
    );
    const ownerScopeDigest =
      taskMapMeetingProducerOwnerScopeDigest(options.userId);
    const gdocsBinding = {
      connectionId: "owner-local-gdocs-producer",
      sourceKind: "gemini_meet",
      tenantOrWorkspaceDigest: taskMapDigest({
        domain: "taskmap-gdocs-folder.1",
        folderId: options.folderId,
      }),
      accountOrPrincipalDigest: taskMapDigest({
        domain: "taskmap-gdocs-principal.1",
        userId: options.userId,
      }),
      grantVersion: "gdocs-documents-get-revision.v1",
    };
    const meetingDrafts = files.map((file) => {
      const draft = taskMapDraftById.get(file.id);
      return {
        ...draft,
        binding: gdocsBinding,
        secondaryVariants: [],
      };
    });
    const taskMapSnapshot = buildTaskMapMeetingProducerSnapshot({
      ownerScopeDigest,
      producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
      producedAt: observedAt,
      meetings: meetingDrafts,
    });
    writeOwnerOnlyTaskMapSnapshot(
      options.exportTaskMapProducer,
      taskMapSnapshot,
    );
    response.taskmap_producer = {
      status: "exported",
      contract_version: taskMapSnapshot.contractVersion,
      producer_version: taskMapSnapshot.producerVersion,
      meetings: taskMapSnapshot.meetings.length,
      evidence: taskMapSnapshot.meetings.reduce(
        (count, meeting) => count + meeting.evidence.length,
        0,
      ),
    };
  }

  if (options.importPostgres || options.dryRun) {
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    const { normalizeGranolaNotes } = requireDist("../dist/src/engine/sources/granola.js");
    const rows = normalizeGranolaNotes(meetingNotes);
    if (options.synthesizeSpans) {
      // Personal notes ship no transcript; synthesize spans from the doc body
      // BEFORE the sink (same rationale as the granola personal tier — the
      // reasoner's span-in-body citation gate starves without spans).
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
        `SELECT count(*) AS gdocs_meeting_notes FROM meeting_notes WHERE user_id=${sqlString(options.userId)} AND source='gdocs'`,
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

export async function exportGoogleCalendarProducer(
  options,
  token,
  {
    get = apiGet,
    loadCalendarModule = () =>
      requireDist(
        "../dist/src/engine/taskmap/calendar-producer-freshness.js",
      ),
    writeSnapshot = writeOwnerOnlyTaskMapSnapshot,
  } = {},
) {
  const collected = await listGoogleCalendarEvents(
    options,
    token,
    get,
  );
  const {
    buildTaskMapGoogleCalendarProviderSnapshot,
    taskMapCalendarOwnerScopeDigest,
  } = loadCalendarModule();
  const snapshot = buildTaskMapGoogleCalendarProviderSnapshot({
    ownerScopeDigest: taskMapCalendarOwnerScopeDigest(options.userId),
    producedAt: collected.observedAt,
    events: collected.rows,
  });
  writeSnapshot(options.exportCalendarProducer, snapshot);
  const response = {
    status: "exported",
    provider: "google_calendar",
    calendar_identity_digest: taskMapCanonicalDigest({
      domain: "taskmap-google-calendar-selection.1",
      calendarId: options.googleCalendarId,
    }),
    contract_version: snapshot.contractVersion,
    producer_version: snapshot.producerVersion,
    events: snapshot.events.length,
    pages: collected.pages,
    produced_at: snapshot.producedAt,
    valid_through: snapshot.validThrough,
  };
  console.log(JSON.stringify(response, null, 2));
  return { snapshot, response };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.exportTaskMapProducer || options.exportCalendarProducer) {
    options.userId = confirmedTaskMapProducerUserId({
      config: readConfig(),
      explicitUserId: process.env.DAOBREW_USER_ID,
      requestedUserId: options.userId,
    });
  }
  const token = await getToken(options);
  if (options.listFolders) await listFolders(options, token);
  if (shouldExportGdocsSnapshot(options)) {
    await exportGdocsSnapshot(options, token);
  }
  if (options.exportCalendarProducer) {
    await exportGoogleCalendarProducer(options, token);
  }
}

export function shouldExportGdocsSnapshot(options) {
  return Boolean(options?.exportSnapshot || options?.exportTaskMapProducer);
}

const invokedAsMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false;
if (invokedAsMain) {
  const producerMode = gdocsArgvRequestsTaskMapProducer(
    process.argv.slice(2),
  );
  main().catch((err) => {
    console.error(serializeGdocsTopLevelFailure(err, { producerMode }));
    process.exitCode = 1;
  });
}
