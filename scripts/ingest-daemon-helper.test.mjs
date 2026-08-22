import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = new URL("./ingest-daemon-helper.mjs", import.meta.url);

function run(command, args = [], { input = "", stdio } = {}) {
  const invokedArgs = [helper.pathname, command, ...args];
  const result = spawnSync(process.execPath, invokedArgs, {
    encoding: "utf8",
    input,
    stdio,
  });
  return Object.assign(result, { invokedArgs });
}

test("last-sync publication merges and deletes without exposing file JSON in argv", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-"));
  const file = path.join(root, "last-sync.json");
  fs.writeFileSync(file, JSON.stringify({ keep: "yes", remove: "old" }));
  const result = run("last-sync-write", [file, "remove", "-", "oura", "2026-07-16T00:00:00Z"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    keep: "yes",
    oura: "2026-07-16T00:00:00Z",
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.rmSync(root, { recursive: true });
});

test("health parser distinguishes data, empty, and provider failure from stdin", () => {
  const observed = JSON.stringify({
    status: "ok",
    results: [{ source: "oura", samples_fetched: 7, samples_pushed: 7, outcome: "data_observed" }],
  });
  const empty = JSON.stringify({
    status: "ok",
    results: [{ source: "oura", samples_fetched: 0, samples_pushed: 0, outcome: "no_data" }],
  });
  const failed = JSON.stringify({
    status: "error",
    results: [{ source: "oura", error: "secret provider detail" }],
  });
  assert.equal(run("oura-result", [], { input: observed }).stdout, "data");
  assert.equal(run("oura-result", [], { input: empty }).stdout, "empty");
  const failure = run("oura-result", [], { input: failed });
  assert.equal(failure.stdout, "error");
  assert.doesNotMatch(failure.stderr, /secret provider detail/);
});

test("health parser extracts backend incompatibility without reflecting details", () => {
  const output = [
    "diagnostic line",
    JSON.stringify({
      status: "error",
      code: "backend_incompatible",
      error: "secret route detail",
    }),
  ].join("\n");
  const result = run("health-error-code", [], { input: output });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "backend_incompatible");
  assert.doesNotMatch(result.stderr, /secret route detail/);
});

test("calendar wrapper reads raw health-adjacent payload from file rather than argv", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-calendar-"));
  const file = path.join(root, "calendar.json");
  fs.writeFileSync(file, JSON.stringify({ rawEvents: [{ title: "private meeting" }] }));
  const result = run("calendar-body", [file, "device-user"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    userId: "device-user",
    rawEvents: [{ title: "private meeting" }],
  });
  assert.ok(!result.invokedArgs.includes("private meeting"));
  fs.rmSync(root, { recursive: true });
});

test("identity helpers accept only canonical UUID ownership", () => {
  const userId = "14802294-BEED-480E-ABF6-7E3703FA25CD";
  assert.equal(run("canonical-uuid", [userId.toLowerCase()]).stdout, userId);
  assert.equal(run("canonical-uuid", ["018F3A2B-9C4D-7E6F-8A1B-2C3D4E5F6071"]).stdout,
    "018F3A2B-9C4D-7E6F-8A1B-2C3D4E5F6071");
  assert.equal(run("canonical-uuid", ["local"]).stdout, "");
  const wrapped = run("json-with-user", [userId], { input: '{"rawNotes":[]}' });
  assert.equal(wrapped.status, 0, wrapped.stderr);
  assert.deepEqual(JSON.parse(wrapped.stdout), { rawNotes: [], userId });
  assert.notEqual(run("json-with-user", ["local"], { input: "{}" }).status, 0);
});

test("memory ingest body discovers Claude and Codex rows in normalized API shape", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-memory-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  const claudeDir = path.join(home, ".claude", "projects", project.replace(/[^A-Za-z0-9]/g, "-"));
  const codexDir = path.join(home, ".codex", "sessions", "2026", "07");
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "claude.jsonl"),
    [
      JSON.stringify({ timestamp: "2026-07-22T00:00:00Z", type: "user", message: { role: "user", content: "remember this plan" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "plan recorded" } }),
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(codexDir, "codex.jsonl"),
    [
      JSON.stringify({ type: "turn_context", payload: { cwd: project } }),
      JSON.stringify({ timestamp: "2026-07-22T01:00:00Z", type: "response_item", payload: { type: "message", role: "user", content: "ship terminal sync" } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: "sync shipped" } }),
    ].join("\n"),
  );

  const result = run("memory-ingest-body", [home]);

  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.rows.length, 2);
  assert.ok(body.rows.every((row) => Array.isArray(row.topics_json)));
  assert.ok(body.rows.every((row) => row.topics === undefined));
  assert.deepEqual(new Set(body.rows.map((row) => row.source)), new Set(["claude_project_session", "codex_project_session"]));
  fs.rmSync(root, { recursive: true });
});

test("memory ingest chunks skips empty homes and emits request bodies capped at 100 rows", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-memory-chunks-"));
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  assert.equal(run("memory-ingest-chunks", [home]).stdout, "");
  fs.rmSync(root, { recursive: true });
});

test("authorization generation and bridge fields preserve strict scalar semantics", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-auth-"));
  const file = path.join(root, "token.json");
  fs.writeFileSync(file, JSON.stringify({ authorization_generation: 42, authorized_at: 100.9 }));
  assert.equal(run("oura-authorization", [file]).stdout, "42\n100\n");
  assert.equal(
    run("bridge-field", ["generation_id"], {
      input: "diagnostic\n{\"status\":\"written\",\"generation_id\":\"g-1\"}\n",
    }).stdout,
    "g-1",
  );
  fs.rmSync(root, { recursive: true });
});

test("lock validation compares inherited descriptor 9 with the canonical inode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-lock-"));
  const file = path.join(root, "lock");
  const other = path.join(root, "other");
  fs.writeFileSync(file, "");
  fs.writeFileSync(other, "");
  const descriptor = fs.openSync(file, "r+");
  const wrongDescriptor = fs.openSync(other, "r+");
  const inherited = Array(10).fill("ignore");
  inherited[0] = "ignore";
  inherited[1] = "pipe";
  inherited[2] = "pipe";
  inherited[9] = descriptor;
  assert.equal(run("lock-fd-matches", [file], { stdio: inherited }).status, 0);
  inherited[9] = wrongDescriptor;
  assert.notEqual(run("lock-fd-matches", [file], { stdio: inherited }).status, 0);
  fs.closeSync(descriptor);
  fs.closeSync(wrongDescriptor);
  fs.rmSync(root, { recursive: true });
});

test("owner receipt commands bind state and cadence to the exact owner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-receipt-"));
  const file = path.join(root, "receipt.json");
  const owner = "a".repeat(64);
  assert.equal(run("resident-receipt-write", [
    file, owner,
    "granola_success", "2026-08-05T20:00:00Z",
    "granola_attempt", "2026-08-05T20:01:00Z",
  ]).status, 0);
  assert.equal(run("resident-receipt-get", [file, owner, "granola_success"]).stdout,
    "2026-08-05T20:00:00Z");
  assert.equal(run("resident-receipt-get", [file, "b".repeat(64), "granola_success"]).stdout, "");
  const fiveMinutesAfterSuccess = String(Math.trunc(Date.parse("2026-08-05T20:05:00Z") / 1000));
  assert.equal(run("meeting-producer-due", [
    file, owner, "granola_success", "granola_attempt", "14400", "2700", "600", fiveMinutesAfterSuccess,
  ]).stdout, "no");
  assert.notEqual(run("resident-receipt-write", [file, "b".repeat(64), "x", "y"]).status, 0);
  fs.rmSync(root, { recursive: true });
});

test("confirmed identity and owner digest reproduce the resident domain contracts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-identity-"));
  const file = path.join(root, "config.json");
  const userId = "14802294-BEED-480E-ABF6-7E3703FA25CD";
  const credential = `dbd_${"x".repeat(28)}`;
  const apiURL = "https://api.example.test/v1";
  const issuer = "https://api.example.test";
  fs.writeFileSync(file, JSON.stringify({
    user_id: userId,
    device_credential: credential,
    device_credential_confirmed: true,
    api_url: apiURL,
    pairing_issuer: issuer,
  }));
  const framed = [userId, credential, apiURL, issuer].join("\0");
  const identityDigest = crypto.createHash("sha256")
    .update(`taskmap-resident-identity.v1\0${framed}`).digest("hex");
  assert.equal(run("confirmed-identity", [file]).stdout, `${userId}\n${identityDigest}\n`);
  assert.equal(run("owner-digest", [userId]).stdout,
    crypto.createHash("sha256").update(`taskmap-owner-scope.v1\0${userId}`).digest("hex"));
  fs.writeFileSync(file, JSON.stringify({ user_id: userId, device_credential: credential }));
  assert.equal(run("confirmed-identity", [file]).stdout, "");
  fs.rmSync(root, { recursive: true });
});

test("private token and snapshot helpers reject unsafe metadata and validate exact bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-helper-private-"));
  fs.chmodSync(root, 0o700);
  const token = path.join(root, "token.json");
  const snapshot = path.join(root, "snapshot.json");
  fs.writeFileSync(token, JSON.stringify({ access_token: "secret" }), { mode: 0o600 });
  fs.writeFileSync(snapshot, JSON.stringify({ events: [], meeting_notes: [] }), { mode: 0o600 });
  assert.equal(run("strict-private-granola-token", [token]).status, 0);
  assert.equal(run("snapshot-sha256", [snapshot]).stdout,
    crypto.createHash("sha256").update(fs.readFileSync(snapshot)).digest("hex"));
  fs.chmodSync(token, 0o644);
  assert.notEqual(run("strict-private-granola-token", [token]).status, 0);
  fs.rmSync(root, { recursive: true });
});

test("producer and bounded-command helpers accept multiline output and fail missing commands promptly", () => {
  const producerOutput = `diagnostic\n${JSON.stringify({ status: "ignored" })}\n${JSON.stringify({
    status: "exported",
    taskmap_producer: { status: "exported" },
  }, null, 2)}\n`;
  assert.equal(run("producer-exported", ["gdocs"], { input: producerOutput }).stdout, "yes");
  const missing = run("bounded-command", ["1", "/definitely/missing/daobrew-command"]);
  assert.equal(missing.status, 1);
});
