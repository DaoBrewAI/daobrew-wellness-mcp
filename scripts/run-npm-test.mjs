#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const tmpRoot = mkdtempSync("/tmp/dbw-");
const tmpHome = resolve(tmpRoot, "home");

function cleanup() {
  rmSync(tmpRoot, { recursive: true, force: true });
}

function exitAfterCleanup(code) {
  cleanup();
  process.exit(code);
}

cleanup();
mkdirSync(tmpHome, { recursive: true });
process.on("exit", cleanup);
process.on("SIGINT", () => exitAfterCleanup(130));
process.on("SIGTERM", () => exitAfterCleanup(143));

function runNodeTest(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      HOME: tmpHome,
      TMPDIR: tmpRoot,
      ...extraEnv,
    },
  });
  if (result.error) {
    console.error(result.error);
    exitAfterCleanup(1);
  }
  if (result.status !== 0) {
    exitAfterCleanup(result.status ?? 1);
  }
}

const scriptTests = readdirSync("scripts")
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join("scripts", name));
const compiledTests = readdirSync("dist/tests")
  .filter((name) => name.endsWith(".test.js"))
  .sort()
  .map((name) => join("dist/tests", name));

runNodeTest(["--test", ...scriptTests]);

runNodeTest([
  "--test",
  "--test-force-exit",
  "--test-concurrency=1",
  ...compiledTests,
], {
  DAOBREW_CONFIG_FILE: "/nonexistent/daobrew-test-config.json",
});

cleanup();
