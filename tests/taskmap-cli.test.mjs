import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const CLI = path.join(PACKAGE_ROOT, "scripts/taskmap-harness.mjs");
const OWNER_REFRESH = path.join(
  PACKAGE_ROOT,
  "scripts/taskmap-owner-refresh.mjs",
);
const HARNESS_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/harness.js"),
).href;
const { taskMapSemanticInputDigest } = await import(HARNESS_URL);

function fixture() {
  const input = {
    contractVersion: "taskmap.v1",
    generatedAt: "2026-07-26T20:00:00.000Z",
    pointers: [{
      id: "source-task",
      sourceKind: "strategy",
      sourceObjectId: "taskmap-cli",
      sourceRefHash: "1111111111111111",
      authority: "source_system",
      syncMode: "return_only",
      capabilities: ["read_task", "deep_link"],
    }],
    events: [{
      id: "task-created",
      pointerId: "source-task",
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: "2026-07-20T17:00:00.000Z",
      observedAt: "2026-07-26T20:00:00.000Z",
      objectRefs: ["task:taskmap-cli"],
      title: "Replay the Task Map harness",
      summary: "Produce a deterministic projection from bounded JSON artifacts.",
      extractionConfidence: 1,
      sourceStatus: "in_progress",
      priority: 1,
    }],
  };
  const brain = {
    contractVersion: "taskmap.v1",
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: "bbbbbbbbbbbbbbbb",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: input.generatedAt,
    roots: [{
      proposalId: "root-cli",
      title: "Task Map replay",
      summary: "The bounded input and semantic proposal form one replayable run.",
      evidenceEventIds: ["task-created"],
      memberObjectRefs: ["task:taskmap-cli"],
      confidence: 1,
    }],
    tasks: [{
      proposalId: "task-cli",
      rootProposalId: "root-cli",
      title: "Replay the Task Map harness",
      summary: "Run the local harness and inspect its versioned projection.",
      evidenceEventIds: ["task-created"],
      authoritativeTaskEventId: "task-created",
      openState: "open",
      confidence: 1,
    }],
    edges: [{
      proposalId: "edge-cli",
      fromProposalId: "root-cli",
      toProposalId: "task-cli",
      relation: "advances",
      evidenceEventIds: ["task-created"],
      confidence: 1,
    }],
  };
  return { input, brain };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: {},
  });
}

function runWithPid(args, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: PACKAGE_ROOT,
      env: {},
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    try {
      onSpawn(child.pid);
    } catch (error) {
      child.kill();
      reject(error);
      return;
    }
    child.once("close", (status, signal) => resolve({
      status,
      signal,
      stdout,
      stderr,
    }));
  });
}

function runOwnerRefresh(args) {
  return spawnSync(process.execPath, [OWNER_REFRESH, ...args], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: {},
  });
}

function ownerFixture() {
  const { input, brain } = fixture();
  input.pointers.push({
    id: "body-context",
    sourceKind: "oura",
    sourceObjectId: "relative-owner-window",
    sourceRefHash: "2222222222222222",
    authority: "none",
    syncMode: "reference_only",
    capabilities: ["read_context"],
  });
  brain.inputDigest = taskMapSemanticInputDigest(input);
  const now = "2026-07-27T20:00:00.000Z";
  const ouraContext = {
    contractVersion: "oura-taskmap-context.v1",
    sourceKind: "oura",
    generatedAt: now,
    coverage: {
      startDay: "2026-07-27",
      endDay: "2026-07-27",
      dailyActivityDays: 0,
      dailyReadinessDays: 0,
      dailySleepDays: 0,
      sleepRecords: 0,
      heartRateSamples: 0,
      classifiedDays: 0,
      unknownDays: 1,
    },
    classifier: {
      version: "personal-baseline-composite-recovery.v2",
      axis: "composite_recovery",
      method:
        "Trailing 28-calendar-day personal median/MAD; context only, not medical or causal.",
      minimumMetricsPerDay: 2,
      lowerThreshold: -1,
      upperThreshold: 1,
    },
    days: [{
      dayKey: "2026-07-27",
      axis: "composite_recovery",
      category: "unknown",
    }],
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  };
  return { input, brain, ouraContext, now };
}

describe("Task Map replay CLI", () => {
  it("runs the explicit E0 baseline with only input and output artifacts", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-e0-"));
    const inputPath = path.join(directory, "input.json");
    const outputDirectory = path.join(directory, "private", "run");
    const outputPath = path.join(outputDirectory, "projection.json");
    const { input } = fixture();
    writeJson(inputPath, input);

    const result = run([
      "--arm", "E0",
      "--input", inputPath,
      "--output", outputPath,
    ]);

    assert.equal(result.status, 0, result.stderr);
    const projection = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(projection.arm, "E0");
    assert.equal(projection.runStatus, "accepted");
    assert.equal(projection.brain, null);
    assert.equal(projection.roots.length, 1);
    assert.equal(projection.tasks.length, 1);
    assert.deepEqual(projection.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    });
    assert.equal(statSync(outputDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  });

  it("replays E4 with semantic, previous, causal, and ablation artifacts", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-e4-"));
    const inputPath = path.join(directory, "input.json");
    const brainPath = path.join(directory, "brain.json");
    const causalPath = path.join(directory, "causal.json");
    const firstOutputPath = path.join(directory, "first.json");
    const outputPath = path.join(directory, "projection.json");
    const ablationPath = path.join(directory, "ablation.json");
    const { input, brain } = fixture();
    writeJson(inputPath, input);
    writeJson(brainPath, brain);
    writeJson(causalPath, []);

    const first = run([
      "--arm", "E4",
      "--input", inputPath,
      "--brain", brainPath,
      "--output", firstOutputPath,
    ]);
    assert.equal(first.status, 0, first.stderr);

    const replay = run([
      "--arm", "E4",
      "--input", inputPath,
      "--brain", brainPath,
      "--previous", firstOutputPath,
      "--causal", causalPath,
      "--output", outputPath,
      "--ablation", ablationPath,
      "--now", "2026-07-26T20:00:00.000Z",
    ]);

    assert.equal(replay.status, 0, replay.stderr);
    const firstProjection = JSON.parse(readFileSync(firstOutputPath, "utf8"));
    const projection = JSON.parse(readFileSync(outputPath, "utf8"));
    const ablation = JSON.parse(readFileSync(ablationPath, "utf8"));
    assert.equal(projection.arm, "E4");
    assert.equal(projection.runStatus, "accepted");
    assert.equal(projection.brain.provider, "codex");
    assert.equal(projection.roots[0].id, firstProjection.roots[0].id);
    assert.equal(projection.edges.length, 1);
    assert.deepEqual(ablation.arms.map(({ arm }) => arm), ["E0", "E1", "E2", "E3", "E4"]);
    assert.equal(ablation.controls.bodyMaskMembershipStable, true);
    assert.equal(ablation.controls.bodyShuffleMembershipStable, true);
  });

  it("rejects implicit paths and refuses to overwrite an input artifact", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-paths-"));
    const inputPath = path.join(directory, "input.json");
    const { input } = fixture();
    writeJson(inputPath, input);

    const relative = run([
      "--arm", "E0",
      "--input", "input.json",
      "--output", path.join(directory, "projection.json"),
    ]);
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr, /--input must be an absolute path/);

    const overwrite = run([
      "--arm", "E0",
      "--input", inputPath,
      "--output", inputPath,
    ]);
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /refusing to overwrite an input artifact/);
  });

  it("refuses to overwrite an input through a symlinked directory", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-symlink-"));
    const realDirectory = path.join(directory, "real");
    const aliasDirectory = path.join(directory, "alias");
    mkdirSync(realDirectory);
    symlinkSync(realDirectory, aliasDirectory, "dir");
    const inputPath = path.join(realDirectory, "artifact.json");
    const aliasedOutputPath = path.join(aliasDirectory, "artifact.json");
    const { input } = fixture();
    writeJson(inputPath, input);
    const before = readFileSync(inputPath, "utf8");

    const result = run([
      "--arm", "E0",
      "--input", inputPath,
      "--output", aliasedOutputPath,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to overwrite an input artifact/);
    assert.equal(readFileSync(inputPath, "utf8"), before);
  });

  it("refuses to overwrite an input through a hard link", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-hardlink-"));
    const inputPath = path.join(directory, "input.json");
    const linkedOutputPath = path.join(directory, "linked.json");
    const { input } = fixture();
    writeJson(inputPath, input);
    linkSync(inputPath, linkedOutputPath);
    const before = readFileSync(inputPath, "utf8");

    const result = run([
      "--arm", "E0",
      "--input", inputPath,
      "--output", linkedOutputPath,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to overwrite an input artifact/);
    assert.equal(readFileSync(inputPath, "utf8"), before);
  });

  it("does not follow a pre-planted predictable temporary symlink", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-temp-symlink-"));
    const inputPath = path.join(directory, "input.json");
    const outputPath = path.join(directory, "projection.json");
    const victimPath = path.join(directory, "victim.txt");
    const { input } = fixture();
    writeJson(inputPath, input);
    writeFileSync(victimPath, "do-not-overwrite\n", { mode: 0o600 });

    const result = await runWithPid([
      "--arm", "E0",
      "--input", inputPath,
      "--output", outputPath,
    ], (pid) => {
      const legacyTemporary = path.join(directory, `.projection.json.${pid}.tmp`);
      symlinkSync(victimPath, legacyTemporary);
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(victimPath, "utf8"), "do-not-overwrite\n");
    assert.equal(lstatSync(outputPath).isSymbolicLink(), false);
    assert.equal(lstatSync(outputPath).isFile(), true);
  });

  it("requires a brain for semantic arms and exits nonzero on a fatal brain rejection", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-fatal-"));
    const inputPath = path.join(directory, "input.json");
    const brainPath = path.join(directory, "brain.json");
    const outputPath = path.join(directory, "projection.json");
    const { input, brain } = fixture();
    writeJson(inputPath, input);

    const missing = run([
      "--arm", "E4",
      "--input", inputPath,
      "--output", outputPath,
    ]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--brain is required/);

    brain.inputDigest = "0000000000000000";
    writeJson(brainPath, brain);
    const stale = run([
      "--arm", "E4",
      "--input", inputPath,
      "--brain", brainPath,
      "--output", outputPath,
    ]);
    assert.equal(stale.status, 2);
    const projection = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(projection.runStatus, "rejected");
    assert.equal(projection.roots.length, 0);
    assert.equal(projection.tasks.length, 0);
  });

  it("fails an E0 ablation when the semantic brain digest is stale", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-ablation-fatal-"));
    const inputPath = path.join(directory, "input.json");
    const brainPath = path.join(directory, "brain.json");
    const outputPath = path.join(directory, "projection.json");
    const ablationPath = path.join(directory, "ablation.json");
    const { input, brain } = fixture();
    brain.inputDigest = "0000000000000000";
    writeJson(inputPath, input);
    writeJson(brainPath, brain);

    const result = run([
      "--arm", "E0",
      "--input", inputPath,
      "--brain", brainPath,
      "--output", outputPath,
      "--ablation", ablationPath,
    ]);

    assert.equal(result.status, 2);
    assert.equal(existsSync(ablationPath), false);
    assert.match(result.stdout, /"ablationStatus":"rejected"/);
  });

  it("rejects timezone-less timestamps", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-timezone-"));
    const inputPath = path.join(directory, "input.json");
    const outputPath = path.join(directory, "projection.json");
    const { input } = fixture();
    input.generatedAt = "2026-07-26 20:00:00";
    writeJson(inputPath, input);

    const result = run([
      "--arm", "E0",
      "--input", inputPath,
      "--output", outputPath,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RFC3339 with an explicit timezone/);
  });

  it("rejects options that cannot affect the selected arm", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-cli-scope-"));
    const inputPath = path.join(directory, "input.json");
    const brainPath = path.join(directory, "brain.json");
    const outputPath = path.join(directory, "projection.json");
    const previousPath = path.join(directory, "previous.json");
    const { input, brain } = fixture();
    writeJson(inputPath, input);
    writeJson(brainPath, brain);
    writeJson(previousPath, {
      contractVersion: input.contractVersion,
      arm: "E4",
      roots: [],
      tasks: [],
      edges: [],
      rejections: [],
    });

    const unusedBrain = run([
      "--arm", "E0",
      "--input", inputPath,
      "--brain", brainPath,
      "--output", outputPath,
    ]);
    assert.notEqual(unusedBrain.status, 0);
    assert.match(unusedBrain.stderr, /only valid with E0 when --ablation/);

    const unusedPrevious = run([
      "--arm", "E1",
      "--input", inputPath,
      "--brain", brainPath,
      "--previous", previousPath,
      "--output", outputPath,
    ]);
    assert.notEqual(unusedPrevious.status, 0);
    assert.match(unusedPrevious.stderr, /--previous is only valid/);
  });
});

describe("Task Map owner refresh", () => {
  it("replays only a reviewed brain originally bound to the base input", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-owner-valid-"));
    const inputPath = path.join(directory, "base-input.json");
    const brainPath = path.join(directory, "reviewed-brain.json");
    const ouraPath = path.join(directory, "oura.json");
    const outputDirectory = path.join(directory, "run");
    const { input, brain, ouraContext, now } = ownerFixture();
    writeJson(inputPath, input);
    writeJson(brainPath, brain);
    writeJson(ouraPath, ouraContext);

    const result = runOwnerRefresh([
      "--base-input", inputPath,
      "--reviewed-brain", brainPath,
      "--oura-context", ouraPath,
      "--output-dir", outputDirectory,
      "--now", now,
    ]);

    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(
      readFileSync(path.join(outputDirectory, "manifest.json"), "utf8"),
    );
    assert.equal(
      manifest.baseSemanticInputDigest,
      taskMapSemanticInputDigest(input),
    );
    assert.equal(manifest.reviewedBrain.semanticsReused, true);
    assert.equal(statSync(outputDirectory).mode & 0o777, 0o700);
    for (const filename of [
      "input.json",
      "semantic-brain.codex.json",
      "projection-e4.json",
      "oura-taskmap-context.v1.json",
      "taskmap-body-context.v1.json",
      "manifest.json",
    ]) {
      assert.equal(
        statSync(path.join(outputDirectory, filename)).mode & 0o777,
        0o600,
      );
    }
  });

  it("rejects a reviewed brain bound to a different base input", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-owner-stale-"));
    const inputPath = path.join(directory, "base-input.json");
    const brainPath = path.join(directory, "reviewed-brain.json");
    const ouraPath = path.join(directory, "oura.json");
    const outputDirectory = path.join(directory, "run");
    const { input, brain, ouraContext, now } = ownerFixture();
    brain.inputDigest = "0".repeat(64);
    writeJson(inputPath, input);
    writeJson(brainPath, brain);
    writeJson(ouraPath, ouraContext);

    const result = runOwnerRefresh([
      "--base-input", inputPath,
      "--reviewed-brain", brainPath,
      "--oura-context", ouraPath,
      "--output-dir", outputDirectory,
      "--now", now,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /semantic input digest does not match/);
    assert.equal(existsSync(outputDirectory), false);
  });

  it("refuses an existing output directory without changing its contents or mode", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "taskmap-owner-existing-"));
    const inputPath = path.join(directory, "base-input.json");
    const brainPath = path.join(directory, "reviewed-brain.json");
    const ouraPath = path.join(directory, "oura.json");
    const outputDirectory = path.join(directory, "run");
    const markerPath = path.join(outputDirectory, "keep.txt");
    const { input, brain, ouraContext, now } = ownerFixture();
    writeJson(inputPath, input);
    writeJson(brainPath, brain);
    writeJson(ouraPath, ouraContext);
    mkdirSync(outputDirectory);
    writeFileSync(markerPath, "keep\n");
    const beforeMode = statSync(outputDirectory).mode & 0o777;

    const result = runOwnerRefresh([
      "--base-input", inputPath,
      "--reviewed-brain", brainPath,
      "--oura-context", ouraPath,
      "--output-dir", outputDirectory,
      "--now", now,
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a new directory/);
    assert.equal(readFileSync(markerPath, "utf8"), "keep\n");
    assert.equal(statSync(outputDirectory).mode & 0o777, beforeMode);
  });
});
