import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNodeWithIsolatedConfig } from "./npm-test-isolated-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("exact npm test routes the broad Node phase through an isolated config parent", () => {
  const packageText = readFileSync(path.join(root, "package.json"), "utf8");
  const metadata = JSON.parse(packageText);
  const script = metadata.scripts?.test;
  const runnerSource = readFileSync(
    path.join(root, "scripts", "npm-test-isolated-config.mjs"),
    "utf8",
  );
  const showcaseSuite = "dist/tests/taskmap-showcase.test.js";
  assert.equal(typeof script, "string");
  assert.doesNotMatch(
    packageText,
    /taskmap-showcase|showcase-source|wednesday-demo|DEMO_USER_ID/i,
  );
  assert.equal(script.split(showcaseSuite).length - 1, 0);
  assert.equal(
    runnerSource.split(showcaseSuite).length - 1,
    1,
    "the repo-owned normal-test runner must enroll the showcase suite exactly once",
  );
  assert.equal(script.split("--include-required-suites").length - 1, 1);
  assert.doesNotMatch(script, /\/nonexistent\/daobrew-test-config\.json/);
  assert.match(script, /^node --test scripts\/oura-client\.test\.mjs scripts\/oura-oauth-flow\.test\.mjs/);
  assert.match(
    script,
    /node scripts\/npm-test-isolated-config\.mjs --include-required-suites --test /,
  );
  assert.match(script, /dist\/tests\/client\.test\.js/);
  assert.match(script, /node --test scripts\/gdocs-client-taskmap\.test\.mjs/);
  assert.match(script, /node --test tests\/taskmap-cli\.test\.mjs$/);
});

test("exact npm test uses a short out-of-package macOS socket-safe temp root", () => {
  const runnerSource = readFileSync(
    path.join(root, "scripts", "run-npm-test.mjs"),
    "utf8",
  );
  assert.match(runnerSource, /mkdtempSync\("\/tmp\/dbw-"\)/);
  assert.doesNotMatch(
    runnerSource,
    /mkdtempSync\(join\(tmpdir\(\), "daobrew-npm-test-"\)\)/,
  );
});

test("required normal suite arguments are forwarded exactly once", async () => {
  const runner = await import("./npm-test-isolated-config.mjs");
  assert.equal(typeof runner.normalTestNodeArguments, "function");
  const showcaseSuite = "dist/tests/taskmap-showcase.test.js";
  const argumentsForChild = runner.normalTestNodeArguments([
    "--include-required-suites",
    "--test",
    showcaseSuite,
    showcaseSuite,
  ]);
  assert.equal(
    argumentsForChild.filter((argument) => argument === showcaseSuite).length,
    1,
  );
  assert.equal(argumentsForChild.includes("--include-required-suites"), false);
});

test("isolated config parent exists privately for the child and is removed after success", () => {
  const temporaryParent = mkdtempSync(path.join(tmpdir(), "daobrew-npm-harness-test-"));
  try {
    const result = runNodeWithIsolatedConfig([
      "-e",
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const file = process.env.DAOBREW_CONFIG_FILE;",
        "const parent = path.dirname(file);",
        "process.stdout.write(JSON.stringify({",
        "  file,",
        "  parent,",
        "  parentExists: fs.statSync(parent).isDirectory(),",
        "  parentMode: fs.statSync(parent).mode & 0o777,",
        "}));",
      ].join("\n"),
    ], { temporaryParent });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout);
    assert.equal(observed.file, path.join(observed.parent, "daobrew-test-config.json"));
    assert.equal(observed.parentExists, true);
    assert.equal(observed.parentMode, 0o700);
    assert.equal(path.dirname(observed.parent), temporaryParent);
    assert.equal(existsSync(observed.parent), false);
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("isolated config parent is removed after child failure and status is preserved", () => {
  const temporaryParent = mkdtempSync(path.join(tmpdir(), "daobrew-npm-harness-test-"));
  try {
    const result = runNodeWithIsolatedConfig([
      "-e",
      "process.exit(23);",
    ], { temporaryParent });
    assert.equal(result.status, 23);
    assert.equal(existsSync(result.configDirectory), false);
  } finally {
    rmSync(temporaryParent, { recursive: true, force: true });
  }
});
