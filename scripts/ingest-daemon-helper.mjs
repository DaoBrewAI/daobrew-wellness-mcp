#!/usr/bin/env node

// Structured-data helper for the installed Sentinel ingest daemon.
//
// The release daemon invokes this file only with the pinned runtime's
// `bin/node`. Sensitive JSON and health/provider responses are read from files
// or stdin; they are never embedded in `node -e`, argv, or diagnostic output.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [, , command, ...args] = process.argv;

function readJSONFile(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function readStdinBuffer() {
  return fs.readFileSync(0);
}

function objectFromOutput(text) {
  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Fall through to the legacy helper shape below.
    }
  }
  const start = text.indexOf("{");
  if (start >= 0) {
    try {
      const value = JSON.parse(text.slice(start));
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Invalid helper output is represented as an empty object.
    }
  }
  return {};
}

function scalar(value) {
  if (value === null || value === undefined || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function parseAuthorizationGeneration(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : "";
  }
  if (Number.isSafeInteger(value) && value > 0) return String(value);
  return "";
}

function parseISOEpoch(value) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  let normalized = value.trim();
  if (!/(?:Z|[+-]\d\d:\d\d)$/i.test(normalized)) normalized += "Z";
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? Math.trunc(millis / 1000) : 0;
}

function snapshotDigest(file) {
  const maximum = 16 * 1024 * 1024;
  const metadata = fs.lstatSync(file);
  if (!metadata.isFile() || metadata.uid !== process.getuid()
    || metadata.nlink !== 1 || (metadata.mode & 0o022) !== 0
    || metadata.size > maximum) throw new Error("unsafe snapshot");
  const payload = fs.readFileSync(file);
  if (payload.length > maximum) throw new Error("oversized snapshot");
  const value = JSON.parse(payload.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Array.isArray(value.events) || !Array.isArray(value.meeting_notes)) {
    throw new Error("invalid snapshot");
  }
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function readResidentReceipt(file, ownerDigest) {
  const value = readJSONFile(file, {});
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.contractVersion !== "taskmap-resident-receipt.v1"
    || value.ownerScopeDigest !== ownerDigest) return {};
  return value;
}

function writeResidentReceipt(file, ownerDigest, pairs) {
  const prior = readJSONFile(file, {});
  if (prior && typeof prior === "object" && !Array.isArray(prior)
    && Object.keys(prior).length > 0
    && (prior.contractVersion !== "taskmap-resident-receipt.v1"
      || prior.ownerScopeDigest !== ownerDigest)) {
    throw new Error("resident receipt owner contract mismatch");
  }
  const value = prior && typeof prior === "object" && !Array.isArray(prior) ? prior : {};
  value.contractVersion = "taskmap-resident-receipt.v1";
  value.ownerScopeDigest = ownerDigest;
  for (let index = 0; index < pairs.length; index += 2) {
    const key = pairs[index];
    const entry = pairs[index + 1];
    if (typeof key !== "string" || entry === undefined) throw new Error("invalid key/value pair");
    if (entry === "-") delete value[key];
    else value[key] = entry;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp.${process.pid}.${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* publication already renamed it */ }
  }
}

function strictPrivateGranolaToken(file) {
  const maximum = 64 * 1024;
  const parent = fs.lstatSync(path.dirname(file), { bigint: true });
  const before = fs.lstatSync(file, { bigint: true });
  if (!parent.isDirectory() || parent.uid !== BigInt(process.getuid())
    || (parent.mode & 0o77n) !== 0n || !before.isFile()
    || before.uid !== BigInt(process.getuid()) || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o600n || before.size > BigInt(maximum)) {
    throw new Error("unsafe token metadata");
  }
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let payload;
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    for (const field of ["dev", "ino", "size", "mode", "uid", "nlink"]) {
      if (opened[field] !== before[field]) throw new Error("token changed before open");
    }
    payload = fs.readFileSync(descriptor);
    if (payload.length > maximum) throw new Error("token too large");
    const after = fs.fstatSync(descriptor, { bigint: true });
    const namedAfter = fs.lstatSync(file, { bigint: true });
    for (const field of ["dev", "ino", "size", "mode", "uid", "nlink", "mtimeNs", "ctimeNs"]) {
      if (after[field] !== before[field] || namedAfter[field] !== before[field]) {
        throw new Error("token changed during read");
      }
    }
  } finally {
    fs.closeSync(descriptor);
  }
  const value = JSON.parse(payload.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)
    || typeof value.access_token !== "string" || !value.access_token.trim()
    || Buffer.byteLength(value.access_token, "utf8") > 8192) {
    throw new Error("invalid token payload");
  }
}

function jsonObjectsFromText(text) {
  const values = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, index + 1));
            if (value && typeof value === "object" && !Array.isArray(value)) values.push(value);
          } catch { /* keep scanning for the next possible object */ }
          start = index;
          break;
        }
      }
    }
  }
  return values;
}

function exportedProducerResult(kind, text) {
  const candidates = jsonObjectsFromText(text);
  return candidates.some((value) => {
    if (kind === "granola") return value.status === "exported";
    if (kind === "google_calendar") {
      return value.status === "exported" && value.provider === "google_calendar";
    }
    return value.status === "exported" && value.taskmap_producer?.status === "exported";
  });
}

async function runBoundedCommand(seconds, executable, commandArgs) {
  const timeoutMilliseconds = Number(seconds) * 1000;
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0 || !executable) {
    throw new Error("invalid bounded command");
  }
  return await new Promise((resolve) => {
    const child = spawn(executable, commandArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    let settled = false;
    let timer;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stdout.write(chunk));
    child.on("error", () => finish(1));
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMilliseconds);
    child.on("close", (code) => {
      if (timedOut) {
        process.stdout.write("\nmeeting producer command timed out\n");
        finish(124);
      } else finish(Number.isInteger(code) ? code : 1);
    });
  });
}

function normalizeInsightRow(row) {
  const { topics, topics_json, ...rest } = row;
  return {
    ...rest,
    topics_json: topics_json ?? topics ?? null,
  };
}

async function memoryRowsFromHome(module, homeOverride) {
  const options = homeOverride
    ? {
        claudeProjectsRoot: path.join(homeOverride, ".claude", "projects"),
        codexSessionsRoot: path.join(homeOverride, ".codex", "sessions"),
      }
    : undefined;
  const result = await module.buildDiscoveredMemoryRows(options);
  return result.rows.map(normalizeInsightRow);
}

function canonicalUUID(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toUpperCase();
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[1-8][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/.test(normalized)
    ? normalized
    : "";
}

function writeLastSync(file, pairs) {
  const current = readJSONFile(file, {});
  const data = current && typeof current === "object" && !Array.isArray(current)
    ? current
    : {};
  for (let index = 0; index < pairs.length; index += 2) {
    const key = pairs[index];
    const value = pairs[index + 1];
    if (typeof key !== "string" || value === undefined) throw new Error("invalid key/value pair");
    if (value === "-") delete data[key];
    else data[key] = value;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp.${process.pid}.${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* publication already renamed it */ }
  }
}

async function main() {
  switch (command) {
    case "lock-fd-matches": {
      const [file] = args;
      const pathStat = fs.lstatSync(file);
      const descriptorStat = fs.fstatSync(9);
      const valid = pathStat.isFile()
        && descriptorStat.isFile()
        && pathStat.dev === descriptorStat.dev
        && pathStat.ino === descriptorStat.ino;
      process.exit(valid ? 0 : 1);
    }
    case "legacy-lock-pid": {
      const value = readJSONFile(args[0], {}).pid;
      process.stdout.write(Number.isSafeInteger(value) && value > 0 ? String(value) : "0");
      return;
    }
    case "last-sync-write":
      writeLastSync(args[0], args.slice(1));
      return;
    case "resident-receipt-write":
      writeResidentReceipt(args[0], args[1], args.slice(2));
      return;
    case "resident-receipt-get":
      process.stdout.write(scalar(readResidentReceipt(args[0], args[1])[args[2]]));
      return;
    case "json-file-get": {
      const value = readJSONFile(args[0], {})[args[1]];
      if (Array.isArray(value)) process.stdout.write(value.map(String).join("\n"));
      else process.stdout.write(scalar(value));
      return;
    }
    case "config-ready": {
      const config = readJSONFile(args[0], {});
      if (args[1] === "device-credential") {
        const value = config.device_credential;
        process.stdout.write(typeof value === "string" && value.trim().startsWith("dbd_")
          && value.trim().length >= 20 ? "True" : "False");
      } else if (args[1] === "api-url") {
        const value = config.api_url;
        process.stdout.write(typeof value === "string" && value.trim() ? "True" : "False");
      } else if (args[1] === "enrollment-recovery") {
        const ready = [config.enrollment_grant, config.api_key]
          .some((value) => typeof value === "string" && value.trim());
        process.stdout.write(ready ? "True" : "False");
      } else {
        throw new Error("unknown readiness check");
      }
      return;
    }
    case "uuid":
      process.stdout.write(crypto.randomUUID());
      return;
    case "canonical-uuid":
      process.stdout.write(canonicalUUID(args[0]));
      return;
    case "owner-digest":
      process.stdout.write(crypto.createHash("sha256")
        .update(`taskmap-owner-scope.v1\0${args[0]}`, "utf8").digest("hex"));
      return;
    case "connector-output-digest": {
      const domain = Buffer.from(args[0] ?? "", "utf8");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(domain.length);
      process.stdout.write(crypto.createHash("sha256")
        .update("daobrew-ingest-connector-output.v1\0", "utf8")
        .update(size).update(domain).update("\0", "utf8").update(readStdinBuffer()).digest("hex"));
      return;
    }
    case "strict-private-granola-token":
      strictPrivateGranolaToken(args[0]);
      return;
    case "snapshot-sha256":
      process.stdout.write(snapshotDigest(args[0]));
      return;
    case "native-refresh-result": {
      const value = objectFromOutput(readStdin());
      process.stdout.write(`${scalar(value.status)}:${scalar(value.refreshStatus)}:${value.publicationVerified === true ? "verified" : "unverified"}`);
      return;
    }
    case "meeting-producer-due": {
      const [file, ownerDigest, successKey, attemptKey, intervalRaw, leadRaw, retryRaw, nowRaw] = args;
      const state = readResidentReceipt(file, ownerDigest);
      const success = parseISOEpoch(state[successKey]);
      const attempt = parseISOEpoch(state[attemptKey]);
      const interval = Number(intervalRaw);
      const lead = Number(leadRaw);
      const retry = Number(retryRaw);
      const now = Number(nowRaw);
      let due = true;
      if (success > 0 && now - success >= 0 && now - success < interval - lead) due = false;
      if (due && attempt > 0 && now - attempt >= 0 && now - attempt < retry) due = false;
      process.stdout.write(due ? "yes" : "no");
      return;
    }
    case "granola-snapshot-migration": {
      const state = readResidentReceipt(args[0], args[1]);
      if (!state.granola_mcp_success) { process.stdout.write("no"); return; }
      if (typeof state.granola_mcp_snapshot_sha256 !== "string"
        || !/^[a-f0-9]{64}$/.test(state.granola_mcp_snapshot_sha256)) {
        process.stdout.write("yes"); return;
      }
      let actual = "";
      try { actual = snapshotDigest(args[2]); } catch { /* unsafe means migration */ }
      process.stdout.write(actual === state.granola_mcp_snapshot_sha256 ? "no" : "yes");
      return;
    }
    case "bounded-command": {
      const status = await runBoundedCommand(args[0], args[1], args.slice(2));
      process.exitCode = status;
      return;
    }
    case "producer-exported":
      process.stdout.write(exportedProducerResult(args[0], readStdin()) ? "yes" : "no");
      return;
    case "promote-snapshot": {
      const [pending, final] = args;
      const metadata = fs.lstatSync(pending);
      if (!metadata.isFile() || metadata.uid !== process.getuid() || metadata.nlink !== 1
        || (metadata.mode & 0o022) !== 0 || path.dirname(pending) !== path.dirname(final)) {
        throw new Error("unsafe pending snapshot");
      }
      fs.chmodSync(pending, 0o600);
      fs.renameSync(pending, final);
      return;
    }
    case "confirmed-identity": {
      const config = readJSONFile(args[0], {});
      const userId = canonicalUUID(config.user_id);
      const credential = config.device_credential;
      if (config.user_id !== userId || config.device_credential_confirmed !== true
        || typeof credential !== "string" || !/^dbd_[A-Za-z0-9_-]{28,}$/.test(credential)
        || typeof config.api_url !== "string" || typeof config.pairing_issuer !== "string") return;
      let parsed;
      try { parsed = new URL(config.api_url); } catch { return; }
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
        || parsed.search || parsed.hash) return;
      const issuer = `https://${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}`;
      if (config.pairing_issuer !== issuer) return;
      const framed = [userId, credential, config.api_url, config.pairing_issuer].join("\0");
      const digest = crypto.createHash("sha256")
        .update(`taskmap-resident-identity.v1\0${framed}`, "utf8").digest("hex");
      process.stdout.write(`${userId}\n${digest}\n`);
      return;
    }
    case "memory-body": {
      const [userId, projectPath] = args;
      const body = { userId };
      if (projectPath !== undefined) body.projectPath = projectPath;
      process.stdout.write(JSON.stringify(body));
      return;
    }
    case "memory-ingest-body": {
      const [homeOverride] = args;
      const module = await import("../dist/src/engine/sources/claudeMemory.js");
      const rows = await memoryRowsFromHome(module, homeOverride);
      process.stdout.write(JSON.stringify({ rows }));
      return;
    }
    case "memory-ingest-chunks": {
      const [homeOverride] = args;
      const module = await import("../dist/src/engine/sources/claudeMemory.js");
      const rows = await memoryRowsFromHome(module, homeOverride);
      // 100-row chunks: the cloud route upserts row-by-row against Neon
      // (~0.3s/row observed), so 500-row bodies outlive the provider's
      // request window before retrying.
      const chunkRows = 100;
      for (let index = 0; index < rows.length; index += chunkRows) {
        process.stdout.write(`${JSON.stringify({ rows: rows.slice(index, index + chunkRows) })}\n`);
      }
      return;
    }
    case "json-status":
      process.stdout.write(scalar(objectFromOutput(readStdin()).status));
      return;
    case "granola-due": {
      const stamp = readJSONFile(args[0], {}).granola_mcp_attempt;
      const epoch = parseISOEpoch(stamp);
      process.stdout.write(epoch === 0 || Date.now() / 1000 - epoch >= 21_600 ? "yes" : "no");
      return;
    }
    case "imported-status": {
      const imported = objectFromOutput(readStdin()).imported;
      process.stdout.write(imported && typeof imported === "object" && !Array.isArray(imported)
        ? "ok"
        : "");
      return;
    }
    case "granola-notes": {
      const payload = objectFromOutput(readStdin());
      if (!Array.isArray(payload.notes)) process.exit(1);
      const rawNotes = payload.notes
        .filter((note) => note && typeof note === "object" && note.id)
        .map((note) => ({
          id: String(note.id),
          source: "granola",
          source_ref: String(note.id),
          title: note.title,
          created_at: note.createdAt ?? note.created_at,
          summary: note.summary,
        }));
      process.stdout.write(JSON.stringify({ rawNotes }));
      return;
    }
    case "json-with-user": {
      const payload = objectFromOutput(readStdin());
      const userId = canonicalUUID(args[0]);
      if (!userId) process.exit(1);
      process.stdout.write(JSON.stringify({ ...payload, userId }));
      return;
    }
    case "calendar-body": {
      const payload = readJSONFile(args[0], null);
      if (!payload || !Array.isArray(payload.rawEvents)) process.exit(1);
      process.stdout.write(JSON.stringify({ userId: args[1], rawEvents: payload.rawEvents }));
      return;
    }
    case "epoch":
      process.stdout.write(String(parseISOEpoch(args[0])));
      return;
    case "bridge-field":
      process.stdout.write(scalar(objectFromOutput(readStdin())[args[0]]));
      return;
    case "oura-authorization": {
      const token = readJSONFile(args[0], {});
      const generation = parseAuthorizationGeneration(token.authorization_generation);
      const authorizedAt = Number(token.authorized_at);
      const epoch = Number.isFinite(authorizedAt) && authorizedAt > 0
        ? Math.trunc(authorizedAt)
        : 0;
      process.stdout.write(`${generation}\n${epoch}\n`);
      return;
    }
    case "health-status":
      process.stdout.write(scalar(objectFromOutput(readStdin()).status));
      return;
    case "health-error-code":
      process.stdout.write(scalar(objectFromOutput(readStdin()).code));
      return;
    case "oura-result": {
      const rows = objectFromOutput(readStdin()).results;
      const result = Array.isArray(rows) ? rows.find((row) => row?.source === "oura") : null;
      if (!result || result.error) { process.stdout.write("error"); return; }
      const fetched = result.samples_fetched;
      const pushed = Object.prototype.hasOwnProperty.call(result, "samples_pushed")
        ? result.samples_pushed
        : 0;
      const fetchedOK = Number.isInteger(fetched) && fetched >= 0;
      const pushedOK = Number.isInteger(pushed) && pushed >= 0;
      if (result.outcome === "data_observed" && fetchedOK && fetched > 0 && pushedOK) {
        process.stdout.write("data");
      } else if (result.outcome === "no_data" && fetched === 0 && pushed === 0) {
        process.stdout.write("empty");
      } else if (result.outcome == null && pushedOK
        && ((fetchedOK && fetched > 0) || (fetched == null && pushed > 0))) {
        process.stdout.write("data");
      } else if (result.outcome == null && (fetched == null || fetched === 0) && pushed === 0) {
        process.stdout.write("empty");
      } else {
        process.stdout.write("error");
      }
      return;
    }
    case "google-result": {
      const rows = objectFromOutput(readStdin()).results;
      const result = Array.isArray(rows) ? rows.find((row) => row?.source === "google_fit") : null;
      process.stdout.write(result && !result.error ? "ok" : "error");
      return;
    }
    default:
      throw new Error("unknown ingest-daemon helper command");
  }
}

let isMainModule = false;
try {
  isMainModule = typeof process.argv[1] === "string"
    && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
} catch {
  // A missing/unresolvable argv path is an import, never a CLI activation.
}

if (isMainModule) {
  try {
    await main();
  } catch {
    // Fail closed without reflecting file contents, stdin, or credentials.
    process.exit(1);
  }
}
