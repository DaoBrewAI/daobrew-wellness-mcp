#!/usr/bin/env node
// Overnight bench for P6.5 local truth runtime.
//
// This is intentionally boring: run the local stack, leave logs, and separate
// fake-backend local completeness from real-backend blockers.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(scriptDir, "..");
const repoDir = resolve(mcpDir, "..");
const sentinelDir = resolve(repoDir, "DaobrewSentinelMac");
const loopDoctor = "/Users/yz/Documents/Building in public/codex-loop-engineering/scripts/loop_doctor.py";
const mirrorFixtureUserId = "p6_overnight_mirror";

function usage() {
  return [
    "Usage: node scripts/overnight-local-truth-bench.mjs [--run-dir PATH] [--skip-real-backend-probe]",
    "",
    "For unattended sleep runs, launch with:",
    "  caffeinate -dimsu node scripts/overnight-local-truth-bench.mjs",
  ].join("\n");
}

function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    runDir: resolve(repoDir, "docs", "loop", "evidence", `overnight-local-truth-${stamp}`),
    realBackendProbe: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--skip-real-backend-probe") {
      options.realBackendProbe = false;
    } else if (arg === "--run-dir") {
      options.runDir = resolve(argv[++i]);
    } else if (arg.startsWith("--run-dir=")) {
      options.runDir = resolve(arg.slice("--run-dir=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function slug(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function commandLine(cmd, args) {
  return [cmd, ...args.map((arg) => /\s/.test(arg) ? JSON.stringify(arg) : arg)].join(" ");
}

function runStep(ctx, name, cmd, args, options = {}) {
  const index = String(ctx.steps.length + 1).padStart(2, "0");
  const logPath = join(ctx.runDir, `${index}-${slug(name)}.log`);
  const cwd = options.cwd ?? repoDir;
  const env = { ...process.env, ...(options.env ?? {}) };
  const startedAt = new Date().toISOString();
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf-8",
    maxBuffer: 60 * 1024 * 1024,
  });
  const endedAt = new Date().toISOString();
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const record = {
    name,
    cwd,
    command: commandLine(cmd, args),
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: exitCode,
    log_path: logPath,
  };
  writeFileSync(
    logPath,
    [
      `$ ${record.command}`,
      `cwd: ${cwd}`,
      `started_at: ${startedAt}`,
      `ended_at: ${endedAt}`,
      `exit_code: ${exitCode}`,
      "",
      "## stdout",
      stdout,
      "",
      "## stderr",
      stderr,
    ].join("\n"),
  );
  ctx.steps.push(record);
  writeJson(join(ctx.runDir, "summary.json"), {
    status: "running",
    started_at: ctx.startedAt,
    updated_at: endedAt,
    steps: ctx.steps,
    blockers: ctx.blockers,
  });

  if (result.error) {
    throw new Error(`${name} failed to start: ${result.error.message}`);
  }
  if (exitCode !== 0 && options.required !== false) {
    throw new Error(`${name} failed with exit ${exitCode}; see ${logPath}`);
  }
  return { ...record, stdout, stderr };
}

function readConfigProbe() {
  const configPath = join(homedir(), ".daobrew", "config.json");
  let config = {};
  let configError = null;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (err) {
    configError = err?.message ?? String(err);
  }

  const userId = canonicalUserId(process.env.DAOBREW_USER_ID ?? config.user_id);

  return {
    config_path: configPath,
    config_exists: existsSync(configPath),
    config_error: configError,
    api_url: process.env.DAOBREW_API_URL || config.api_url || null,
    has_api_key: Boolean(process.env.DAOBREW_API_KEY || config.api_key),
    has_user_id: Boolean(userId),
    user_id_source: process.env.DAOBREW_USER_ID ? "env" : userId ? "config.user_id" : null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed.toUpperCase() : null;
}

function recordBackendProbe(ctx) {
  const probe = readConfigProbe();
  if (!probe.has_api_key) {
    probe.status = "blocked";
    probe.reason = "missing_api_key";
  } else if (!probe.has_user_id) {
    probe.status = "blocked";
    probe.reason = "missing_user_id";
  } else {
    probe.status = "ready_for_real_backend_probe";
  }

  const probePath = join(ctx.runDir, "backend-probe.json");
  writeJson(probePath, probe);
  if (probe.status === "blocked") {
    ctx.blockers.push({
      checkpoint: "Session 5",
      reason: probe.reason,
      evidence: probePath,
    });
  }
  return probe;
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function recordRealBackendDryRun(ctx, step) {
  const parsed = parseJsonOutput(step.stdout);
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings : [];
  const backendWarning = warnings.find((warning) => String(warning).includes("backend history unavailable"));
  if (step.exit_code !== 0) {
    ctx.blockers.push({
      checkpoint: "Session 5",
      reason: "real_backend_engine_dry_run_failed",
      evidence: step.log_path,
    });
  } else if (backendWarning) {
    ctx.blockers.push({
      checkpoint: "Session 5",
      reason: "backend_history_unavailable",
      evidence: step.log_path,
    });
  } else if (parsed?.triplet_count === 0) {
    ctx.blockers.push({
      checkpoint: "Session 5",
      reason: "no_real_backend_signal",
      evidence: step.log_path,
    });
  }
}

function runBench(options) {
  mkdirSync(options.runDir, { recursive: true });
  const ctx = {
    runDir: options.runDir,
    startedAt: new Date().toISOString(),
    steps: [],
    blockers: [],
  };

  writeJson(join(options.runDir, "summary.json"), {
    status: "running",
    started_at: ctx.startedAt,
    run_dir: options.runDir,
    repo_dir: repoDir,
    mcp_dir: mcpDir,
    sentinel_dir: sentinelDir,
  });

  runStep(ctx, "loop-doctor", "python", [loopDoctor, "--loop-dir", "docs/loop", "--json"]);
  runStep(ctx, "git-status-before", "git", ["status", "--short", "--branch"]);

  runStep(ctx, "mcp-build", "npm", ["run", "build"], { cwd: mcpDir });
  runStep(ctx, "postgres-up", "npm", ["run", "postgres:up"], { cwd: mcpDir });
  runStep(ctx, "postgres-bootstrap", "npm", ["run", "postgres:bootstrap"], { cwd: mcpDir });
  runStep(ctx, "agent-memory-import-dry-run", "node", [
    "scripts/import-agent-memories.mjs",
    "--postgres-db",
    "--dry-run",
    "--project",
    repoDir,
    "--user-id",
    "local",
  ], { cwd: mcpDir });
  runStep(ctx, "agent-memory-import-postgres", "node", [
    "scripts/import-agent-memories.mjs",
    "--postgres-db",
    "--project",
    repoDir,
    "--user-id",
    "local",
  ], { cwd: mcpDir });

  runStep(ctx, "mcp-test", "npm", ["test"], { cwd: mcpDir });
  runStep(ctx, "mcp-postgres-gated-test", "node", [
    "--test",
    "--test-force-exit",
    "--test-concurrency=1",
    "dist/tests/run.test.js",
  ], { cwd: mcpDir, env: { DAOBREW_ENABLE_POSTGRES_TESTS: "1" } });
  runStep(ctx, "mcp-pack-dry-run", "npm", ["pack", "--dry-run", "--json"], { cwd: mcpDir });

  runStep(ctx, "postgres-local-graph-fake-backend", "node", [
    "scripts/run-local-e2e-lite.mjs",
    "--postgres-db",
    "--fake-backend",
    "--user-id",
    mirrorFixtureUserId,
    "--leave-armed",
  ], { cwd: mcpDir });
  runStep(ctx, "restore-real-agent-memory-after-local-graph", "node", [
    "scripts/import-agent-memories.mjs",
    "--postgres-db",
    "--project",
    repoDir,
    "--user-id",
    mirrorFixtureUserId,
  ], { cwd: mcpDir });
  runStep(ctx, "bridge-dry-run", "node", [
    "scripts/sync-postgres-to-sentinel-sqlite.mjs",
    "--user-id",
    mirrorFixtureUserId,
    "--dry-run",
  ], { cwd: mcpDir });
  runStep(ctx, "bridge-sync-shared-sqlite", "node", [
    "scripts/sync-postgres-to-sentinel-sqlite.mjs",
    "--user-id",
    mirrorFixtureUserId,
  ], { cwd: mcpDir });
  runStep(ctx, "detonator-read-shared-sqlite", "node", [
    "-e",
    "const { handleToolCall } = require('./dist/src/tools.js'); handleToolCall('daobrew_detonate', { cause_id: 'ghost_ai2_demo_story' }, true).then((r) => console.log(JSON.stringify({ local_data: !!r.__local_data__, first_lines: String(r.content?.[0]?.text || '').split('\\n').slice(0, 6) }, null, 2)));",
  ], { cwd: mcpDir, env: { DAOBREW_GRAPH_STORE: "sqlite" } });

  runStep(ctx, "swift-build", "swift", ["build"], { cwd: sentinelDir });
  runStep(ctx, "swift-shared-db-smoke", "swift", [
    "test",
    "--filter",
    "KnowledgeGraphTests/testSharedStoreSmokeLoadsArmedGraphWhenEnabled",
  ], { cwd: sentinelDir, env: { DAOBREW_SHARED_DB_SMOKE: "1" } });
  runStep(ctx, "swift-test", "swift", ["test"], { cwd: sentinelDir });

  runStep(ctx, "full-postgres-fake-backend-close-loop", "node", [
    "scripts/run-local-e2e-lite.mjs",
    "--postgres-db",
    "--fake-backend",
    "--user-id",
    "p6_overnight_full",
    "--close-loop",
  ], { cwd: mcpDir });

  if (options.realBackendProbe) {
    const probe = recordBackendProbe(ctx);
    if (probe.status === "ready_for_real_backend_probe") {
      const realBackendStep = runStep(ctx, "real-backend-engine-dry-run", "node", [
        "dist/src/engine/run.js",
        "--once",
        "--dry-run",
        "--user-id=local",
      ], { cwd: mcpDir, env: { DAOBREW_GRAPH_STORE: "postgres" }, required: false });
      recordRealBackendDryRun(ctx, realBackendStep);
    }
  }

  runStep(ctx, "git-status-after", "git", ["status", "--short", "--branch"]);

  const finalStatus = ctx.blockers.length ? "blocked" : "passed";
  writeJson(join(options.runDir, "summary.json"), {
    status: finalStatus,
    started_at: ctx.startedAt,
    ended_at: new Date().toISOString(),
    run_dir: options.runDir,
    steps: ctx.steps,
    blockers: ctx.blockers,
  });
  console.log(JSON.stringify({
    status: finalStatus,
    run_dir: options.runDir,
    steps: ctx.steps.length,
    blockers: ctx.blockers,
  }, null, 2));
}

try {
  runBench(parseArgs(process.argv.slice(2)));
} catch (err) {
  console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }, null, 2));
  process.exit(1);
}
