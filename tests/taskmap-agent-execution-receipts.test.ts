import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, chmod, writeFile, lstat, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  generateTaskMapAgentSessionReport,
  inspectTaskMapAgentExecution,
  recordTaskMapAgentArtifacts,
  recordTaskMapAgentExecutionFinish,
  recordTaskMapAgentExecutionStart,
  TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1,
  TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION,
  TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS,
  summarizeTaskMapAgentExecutionForReview,
} from "../src/engine/taskmap/agent-execution-receipts.js";
import {
  parseTaskMapAgentExecutionCliArguments,
  runTaskMapAgentExecutionCli,
  runTaskMapAgentExecutionReviewSummaryCli,
  taskMapAgentExecutionCliOutput,
} from "../src/engine/taskmap/agent-execution-receipts-cli.js";
import {
  TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION,
} from "../src/engine/taskmap/local-approval-package.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const FAILED_SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";
const FALLBACK_SESSION_ID = "123e4567-e89b-42d3-a456-426614174002";
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);
const D3 = "3".repeat(64);
const D4 = "4".repeat(64);
const execFileAsync = promisify(execFile);

test("preserves agent-execution failure bytes without echoing invalid argv", () => {
  const entrypoint = path.resolve(
    __dirname,
    "../src/engine/taskmap/agent-execution-receipts-cli.js",
  );
  const unreflectedArgument = "PRIVATE_AGENT_EXECUTION_ARGUMENT";
  const result = spawnSync(process.execPath, [entrypoint, unreflectedArgument], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^taskmap-agent-execution: unavailable\nError: Task Map agent execution CLI input is invalid/m,
  );
  assert.match(result.stderr, /at fail/);
  assert.equal(result.stderr.includes(unreflectedArgument), false);
});

interface Fixture {
  root: string;
  executionRoot: string;
  packagePath: string;
  workspacePath: string;
  preflight: ReturnType<typeof adapterPreflightFixture>;
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, taskMapContractCanonicalJson(value), {
    mode: 0o600,
  });
  await chmod(filePath, 0o600);
}

function packageFixture() {
  const core = {
    contractVersion: TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION,
    approvalAuthorizationId: `tmauthorization_${D1}`,
    approvalAuthorizationDigest: D1,
    localOwnerScopeDigest: D2,
    proofDigest: D3,
    quartet: {
      runId: "tmrun_fixture",
      projectionDigest: D4,
    },
    task: {
      taskId: "tmt_fixture",
      rootId: "tmr_fixture",
      outcome: "Produce one bounded result",
    },
    executionBoundary: {
      state: "prepared_not_started",
      approvalRecorded: true,
      deliveryStatus: "not_started",
      taskStarted: false,
      taskExecuted: false,
      dispatchAuthorized: false,
      sourceWritebackAuthorized: false,
      codexTaskStartAuthorized: false,
    },
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
      ownerIdentityStored: false,
    },
  };
  const packageDigest = taskMapContractDigest({
    domain: "taskmap-local-execution-package.1",
    ...core,
  });
  return {
    ...core,
    packageId: `tmlocalpackage_${packageDigest}`,
    packageDigest,
  };
}

function adapterPreflightFixture(
  executionPackage: ReturnType<typeof packageFixture>,
  adapter: "codex" | "claude_code" = "claude_code",
) {
  const corePreflightDigest = D2;
  const corePreflightId = `tmhandoffpreflight_${corePreflightDigest}`;
  const workspaceBindingDigest = D3;
  const runtimeCore = {
    contractVersion: "taskmap-agent-adapter-runtime-request.v1" as const,
    adapter,
    operation: adapter === "codex"
      ? "create_fresh_codex_task" as const
      : "create_fresh_claude_code_session" as const,
    taskMode: "fresh" as const,
    packageId: executionPackage.packageId,
    packageDigest: executionPackage.packageDigest,
    packagePayloadDigest: D4,
    corePreflightId,
    corePreflightDigest,
    taskId: executionPackage.task.taskId,
    rootId: executionPackage.task.rootId,
    workspaceBindingDigest,
  };
  const runtimeRequest = {
    ...runtimeCore,
    requestDigest: taskMapContractDigest({
      domain: "taskmap-agent-adapter-runtime-request.1",
      ...runtimeCore,
    }),
  };
  const startIdempotencyKey = taskMapContractDigest({
    domain: "taskmap-agent-adapter-start-idempotency.1",
    adapter,
    packageDigest: executionPackage.packageDigest,
    corePreflightDigest,
    requestDigest: runtimeRequest.requestDigest,
  });
  const core = {
    contractVersion: "taskmap-agent-adapter-handoff-preflight.v1" as const,
    adapter,
    packageId: executionPackage.packageId,
    packageDigest: executionPackage.packageDigest,
    corePreflightId,
    corePreflightDigest,
    taskId: executionPackage.task.taskId,
    rootId: executionPackage.task.rootId,
    workspaceBindingDigest,
    runtimeRequest,
    startIdempotencyKey,
    boundary: {
      state: "validated_not_started" as const,
      humanApprovalRequired: true as const,
      dispatchAuthorized: false as const,
      processStartAuthorized: false as const,
      adapterSessionStartAuthorized: false as const,
      taskCreated: false as const,
      adapterSessionId: null,
      sourceWritebackAuthorized: false as const,
      sourceCompletionAuthorized: false as const,
      outcomeVerificationAuthorized: false as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      credentialsStored: false as const,
      participantIdentitiesStored: false as const,
      unboundedWorkspaceContextStored: false as const,
    },
  };
  const adapterPreflightDigest = taskMapContractDigest({
    domain: "taskmap-agent-adapter-handoff-preflight.1",
    ...core,
  });
  return {
    ...core,
    adapterPreflightId: `tmadapterpreflight_${adapterPreflightDigest}`,
    adapterPreflightDigest,
  };
}

function executionDependencies(
  preflight: ReturnType<typeof adapterPreflightFixture>,
) {
  return {
    inspectAdapterPreflight: async () => preflight,
  };
}

async function fixture(): Promise<Fixture> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "taskmap-execution-")),
  );
  await chmod(root, 0o700);
  const inputs = path.join(root, "inputs");
  await mkdir(inputs, { mode: 0o700 });
  const executionPackage = packageFixture();
  const packagePath = path.join(inputs, "package.json");
  const workspacePath = path.join(root, "workspace");
  await mkdir(workspacePath, { mode: 0o700 });
  await writePrivateJson(packagePath, executionPackage);
  const preflight = adapterPreflightFixture(executionPackage);
  await writePrivateJson(
    path.join(
      inputs,
      `adapter-preflight_${preflight.adapterPreflightId}.json`,
    ),
    preflight,
  );
  return {
    root,
    executionRoot: path.join(root, "execution"),
    packagePath,
    workspacePath,
    preflight,
  };
}

async function start(
  input: Fixture,
  sessionId = SESSION_ID,
  startedAt = "2026-07-30T18:00:00Z",
) {
  return recordTaskMapAgentExecutionStart({
    executionRoot: input.executionRoot,
    packagePath: input.packagePath,
    workspacePath: input.workspacePath,
    sessionId,
    launchedAdapter: "claude_code",
    adapterPreflightId: input.preflight.adapterPreflightId,
    adapterPreflightDigest: input.preflight.adapterPreflightDigest,
    corePreflightId: input.preflight.corePreflightId,
    corePreflightDigest: input.preflight.corePreflightDigest,
    runtimeRequestDigest: input.preflight.runtimeRequest.requestDigest,
    startIdempotencyKey: input.preflight.startIdempotencyKey,
    workspaceBindingDigest: input.preflight.workspaceBindingDigest,
    startedAt,
  }, executionDependencies(input.preflight));
}

test("freezes an explicit launcher contract and closed CLI arguments", () => {
  assert.deepEqual(
    TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1.requiredOrder,
    ["start", "finish", "artifacts", "report"],
  );
  assert.equal(
    TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1
      .approvedPackageRequired,
    true,
  );
  assert.equal(
    TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1.workspacePathStored,
    false,
  );
  assert.equal(
    TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1
      .outcomeVerificationSupported,
    false,
  );
  assert.deepEqual(
    parseTaskMapAgentExecutionCliArguments([
      "start",
      "--execution-root",
      "/tmp/execution",
      "--package",
      "/tmp/private/package.json",
      "--workspace",
      "/tmp/workspace",
      "--session-id",
      SESSION_ID,
      "--adapter",
      "claude_code",
      "--adapter-preflight-id",
      `tmadapterpreflight_${D1}`,
      "--adapter-preflight-digest",
      D1,
      "--core-preflight-id",
      `tmhandoffpreflight_${D2}`,
      "--core-preflight-digest",
      D2,
      "--runtime-request-digest",
      D3,
      "--start-idempotency-key",
      D4,
      "--workspace-binding-digest",
      D1,
      "--started-at",
      "2026-07-30T18:00:00Z",
    ]),
    {
      command: "start",
      executionRoot: "/tmp/execution",
      packagePath: "/tmp/private/package.json",
      workspacePath: "/tmp/workspace",
      sessionId: SESSION_ID,
      adapter: "claude_code",
      adapterPreflightId: `tmadapterpreflight_${D1}`,
      adapterPreflightDigest: D1,
      corePreflightId: `tmhandoffpreflight_${D2}`,
      corePreflightDigest: D2,
      runtimeRequestDigest: D3,
      startIdempotencyKey: D4,
      workspaceBindingDigest: D1,
      startedAt: "2026-07-30T18:00:00Z",
    },
  );
  assert.deepEqual(
    parseTaskMapAgentExecutionCliArguments([
      "finish",
      "--execution-root",
      "/tmp/execution",
      "--session-id",
      SESSION_ID,
      "--finished-at",
      "2026-07-30T18:01:00Z",
      "--exit-code",
      "0",
    ]),
    {
      command: "finish",
      executionRoot: "/tmp/execution",
      sessionId: SESSION_ID,
      finishedAt: "2026-07-30T18:01:00Z",
      exit: { kind: "code", code: 0 },
    },
  );
  assert.throws(() => parseTaskMapAgentExecutionCliArguments([
    "finish",
    "--execution-root",
    "/tmp/execution",
    "--session-id",
    SESSION_ID,
    "--finished-at",
    "2026-07-30T18:01:00Z",
    "--exit-code",
    "0",
    "--signal",
    "SIGTERM",
  ]));
  assert.deepEqual(
    parseTaskMapAgentExecutionCliArguments([
      "review-summary",
      "--execution-root",
      "/tmp/execution",
      "--session-id",
      SESSION_ID,
    ]),
    {
      command: "review-summary",
      executionRoot: "/tmp/execution",
      sessionId: SESSION_ID,
    },
  );
});

test("binds start and inspection to one sealed adapter preflight", async () => {
  const input = await fixture();
  const cli = [
    "start",
    "--execution-root",
    input.executionRoot,
    "--package",
    input.packagePath,
    "--workspace",
    input.workspacePath,
    "--session-id",
    SESSION_ID,
    "--adapter",
    "claude_code",
    "--adapter-preflight-id",
    input.preflight.adapterPreflightId,
    "--adapter-preflight-digest",
    input.preflight.adapterPreflightDigest,
    "--core-preflight-id",
    input.preflight.corePreflightId,
    "--core-preflight-digest",
    input.preflight.corePreflightDigest,
    "--runtime-request-digest",
    input.preflight.runtimeRequest.requestDigest,
    "--start-idempotency-key",
    input.preflight.startIdempotencyKey,
    "--workspace-binding-digest",
    input.preflight.workspaceBindingDigest,
    "--started-at",
    "2026-07-30T18:00:00Z",
  ] as const;
  const inspection = await runTaskMapAgentExecutionCli(
    cli,
    executionDependencies(input.preflight),
  );
  assert.equal(inspection.preflightId, input.preflight.adapterPreflightId);
  assert.equal(
    inspection.preflightDigest,
    input.preflight.adapterPreflightDigest,
  );
  assert.equal(inspection.corePreflightId, input.preflight.corePreflightId);
  assert.equal(
    inspection.corePreflightDigest,
    input.preflight.corePreflightDigest,
  );
  assert.equal(
    inspection.runtimeRequestDigest,
    input.preflight.runtimeRequest.requestDigest,
  );
  assert.equal(
    inspection.startIdempotencyKey,
    input.preflight.startIdempotencyKey,
  );
  assert.equal(
    inspection.workspaceBindingDigest,
    input.preflight.workspaceBindingDigest,
  );
  const receipt = JSON.parse(await readFile(path.join(
    input.executionRoot,
    "sessions",
    SESSION_ID,
    "start-receipt.json",
  ), "utf8"));
  assert.equal(receipt.proofAdapter, "claude_code");
  assert.equal(receipt.adapterPreflightId, input.preflight.adapterPreflightId);
  assert.equal(receipt.localWorkspaceDigest.length, 64);

  await assert.rejects(() => recordTaskMapAgentExecutionStart({
    executionRoot: input.executionRoot,
    packagePath: input.packagePath,
    workspacePath: input.workspacePath,
    sessionId: FAILED_SESSION_ID,
    launchedAdapter: "claude_code",
    adapterPreflightId: input.preflight.adapterPreflightId,
    adapterPreflightDigest: D4,
    corePreflightId: input.preflight.corePreflightId,
    corePreflightDigest: input.preflight.corePreflightDigest,
    runtimeRequestDigest: input.preflight.runtimeRequest.requestDigest,
    startIdempotencyKey: input.preflight.startIdempotencyKey,
    workspaceBindingDigest: input.preflight.workspaceBindingDigest,
    startedAt: "2026-07-30T18:00:00Z",
  }, executionDependencies(input.preflight)), /adapter preflight identity/);
  await assert.rejects(() => recordTaskMapAgentExecutionStart({
    executionRoot: input.executionRoot,
    packagePath: input.packagePath,
    workspacePath: input.workspacePath,
    sessionId: FAILED_SESSION_ID,
    launchedAdapter: "codex_cli",
    adapterPreflightId: input.preflight.adapterPreflightId,
    adapterPreflightDigest: input.preflight.adapterPreflightDigest,
    corePreflightId: input.preflight.corePreflightId,
    corePreflightDigest: input.preflight.corePreflightDigest,
    runtimeRequestDigest: input.preflight.runtimeRequest.requestDigest,
    startIdempotencyKey: input.preflight.startIdempotencyKey,
    workspaceBindingDigest: input.preflight.workspaceBindingDigest,
    startedAt: "2026-07-30T18:00:00Z",
  }, executionDependencies(input.preflight)), /adapter preflight binding/);

  const codexInput = await fixture();
  const codexPreflight = adapterPreflightFixture(packageFixture(), "codex");
  await writePrivateJson(
    path.join(
      path.dirname(codexInput.packagePath),
      `adapter-preflight_${codexPreflight.adapterPreflightId}.json`,
    ),
    codexPreflight,
  );
  const codex = await recordTaskMapAgentExecutionStart({
    executionRoot: codexInput.executionRoot,
    packagePath: codexInput.packagePath,
    workspacePath: codexInput.workspacePath,
    sessionId: SESSION_ID,
    launchedAdapter: "codex_cli",
    adapterPreflightId: codexPreflight.adapterPreflightId,
    adapterPreflightDigest: codexPreflight.adapterPreflightDigest,
    corePreflightId: codexPreflight.corePreflightId,
    corePreflightDigest: codexPreflight.corePreflightDigest,
    runtimeRequestDigest: codexPreflight.runtimeRequest.requestDigest,
    startIdempotencyKey: codexPreflight.startIdempotencyKey,
    workspaceBindingDigest: codexPreflight.workspaceBindingDigest,
    startedAt: "2026-07-30T18:00:00Z",
  }, executionDependencies(codexPreflight));
  assert.equal(codex.receipt.proofAdapter, "codex");
  assert.equal(codex.receipt.launchedAdapter, "codex_cli");
});

test("runs an isolated fake-Claude flow through artifact, report, and awaiting review", async () => {
  const input = await fixture();
  const started = await start(input);
  assert.equal(started.replayed, false);
  assert.equal(started.receipt.userStartApprovalRecorded, true);
  assert.equal(started.receipt.launchedAdapter, "claude_code");
  assert.equal(started.receipt.sourceCompletion, false);
  assert.equal(started.receipt.outcomeVerified, false);

  const startReplay = await start(input);
  assert.equal(startReplay.replayed, true);
  assert.deepEqual(startReplay.receipt, started.receipt);
  await assert.rejects(() => start(
    input,
    SESSION_ID,
    "2026-07-30T18:00:01Z",
  ), /immutable receipt conflicts/);

  let inspection = await inspectTaskMapAgentExecution(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(inspection.progressState, "started");
  assert.equal(inspection.sessionStatus, "running");

  await recordTaskMapAgentExecutionFinish({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    finishedAt: "2026-07-30T18:02:00Z",
    exit: { kind: "code", code: 0 },
  });
  inspection = await inspectTaskMapAgentExecution(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(inspection.progressState, "finished_without_artifact");
  assert.equal(inspection.sessionStatus, "finished");
  assert.equal(inspection.artifactCount, 0);
  assert.equal(inspection.outcomeVerified, false);

  const artifactPath = path.join(
    input.executionRoot,
    "sessions",
    SESSION_ID,
    "artifacts",
    "result.md",
  );
  const fakeClaudeResult = path.join(input.root, "fake-claude-result.md");
  await writeFile(
    fakeClaudeResult,
    [
      "# Fake Claude result",
      "",
      "## Context",
      "The approved package requested one bounded local result.",
      "",
      "## Intuition",
      "Receipts form a chain of local facts, not a completion claim.",
      "",
      "## What was done",
      "Produced the requested result and recorded focused checks.",
      "",
      "## Deviations & judgment calls",
      "Used the deterministic report fallback instead of an external skill.",
      "",
      "## What to watch",
      "A reviewer still needs to inspect the returned result.",
      "",
      "## Quiz",
      "1. Why is delivery not completion?",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(fakeClaudeResult, 0o600);
  const fakeClaude = path.join(input.root, "fake-claude");
  await writeFile(
    fakeClaude,
    "#!/bin/sh\nset -eu\n/bin/cp \"$1\" \"$2\"\n",
    { mode: 0o700 },
  );
  await chmod(fakeClaude, 0o700);
  await execFileAsync(fakeClaude, [fakeClaudeResult, artifactPath]);
  await chmod(artifactPath, 0o600);
  await recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["artifacts/result.md"],
  });
  inspection = await inspectTaskMapAgentExecution(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(inspection.progressState, "artifact_delivered");
  assert.equal(inspection.artifactCount, 1);
  assert.equal(inspection.sourceCompletion, false);
  const deliveredSummary = await summarizeTaskMapAgentExecutionForReview(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(deliveredSummary.reviewState, "not_ready");
  assert.deepEqual(
    deliveredSummary.artifactRelativePaths,
    ["artifacts/result.md"],
  );
  assert.equal(
    deliveredSummary.primaryArtifactRelativePath,
    "artifacts/result.md",
  );
  assert.equal(deliveredSummary.htmlReportRelativePath, null);
  assert.equal(deliveredSummary.terminalStateInferred, false);

  const report = await generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    generatedAt: "2026-07-30T18:04:00Z",
    tests: [
      { label: "Focused receipt fixture", status: "passed" },
      { label: "Source completion check", status: "not_run" },
    ],
  });
  assert.equal(report.replayed, false);
  assert.equal(report.receipt.transcriptStored, false);
  assert.equal(report.receipt.rawBiometricsStored, false);
  assert.equal(report.receipt.meetingBodiesStored, false);
  assert.equal(report.receipt.outcomeVerified, false);
  const replay = await generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    generatedAt: "2026-07-30T18:04:00Z",
    tests: [
      { label: "Source completion check", status: "not_run" },
      { label: "Focused receipt fixture", status: "passed" },
    ],
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, report.receipt);

  inspection = await inspectTaskMapAgentExecution(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(inspection.progressState, "report_ready");
  assert.equal(inspection.reportRelativePaths.length, 2);
  assert.equal(inspection.sourceWritebackAttempted, false);
  assert.equal(inspection.sourceCompletion, false);
  assert.equal(inspection.outcomeVerified, false);
  const reviewSummary = await summarizeTaskMapAgentExecutionForReview(
    input.executionRoot,
    SESSION_ID,
  );
  assert.equal(
    reviewSummary.contractVersion,
    TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION,
  );
  assert.equal(reviewSummary.reviewState, "awaiting_review");
  assert.equal(reviewSummary.reportShape, "change_walkthrough");
  assert.deepEqual(
    reviewSummary.artifactRelativePaths,
    ["artifacts/result.md"],
  );
  assert.equal(
    reviewSummary.primaryArtifactRelativePath,
    "artifacts/result.md",
  );
  assert.equal(reviewSummary.markdownReportRelativePath, "report.md");
  assert.equal(reviewSummary.htmlReportRelativePath, "report.html");
  assert.equal(
    reviewSummary.artifactReceiptDigest,
    inspection.artifactReceiptDigest,
  );
  assert.equal(
    reviewSummary.reportReceiptDigest,
    inspection.reportReceiptDigest,
  );
  assert.equal(reviewSummary.terminalStateInferred, false);
  assert.equal(reviewSummary.sourceCompletion, false);
  assert.equal(reviewSummary.outcomeVerified, false);
  const { summaryDigest, ...summaryCore } = reviewSummary;
  assert.equal(
    summaryDigest,
    taskMapContractDigest({
      domain: "taskmap-agent-execution-review-summary.1",
      ...summaryCore,
    }),
  );
  const cliReviewSummary =
    await runTaskMapAgentExecutionReviewSummaryCli([
    "review-summary",
    "--execution-root",
    input.executionRoot,
    "--session-id",
    SESSION_ID,
    ]);
  assert.deepEqual(cliReviewSummary, reviewSummary);
  assert.deepEqual(
    JSON.parse(taskMapAgentExecutionCliOutput(cliReviewSummary)),
    reviewSummary,
  );
  const summary = taskMapAgentExecutionCliOutput(inspection);
  assert.equal(summary.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(summary), inspection);

  const reportDirectory = path.join(
    input.executionRoot,
    "sessions",
    SESSION_ID,
  );
  const markdown = await readFile(path.join(reportDirectory, "report.md"), "utf8");
  const html = await readFile(path.join(reportDirectory, "report.html"), "utf8");
  assert.equal(
    createHash("sha256").update(markdown).digest("hex"),
    report.receipt.markdownDigest,
  );
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    report.receipt.htmlDigest,
  );
  let priorMarkdownSection = -1;
  for (const section of TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS) {
    const sectionIndex = markdown.indexOf(`## ${section}`);
    assert.ok(sectionIndex > priorMarkdownSection, section);
    priorMarkdownSection = sectionIndex;
  }
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<p class="eyebrow">Awaiting human review<\/p>/);
  for (const heading of [
    "<h2>Context</h2>",
    "<h2>Intuition</h2>",
    "<h2>What was done</h2>",
    "<h2>Deviations &amp; judgment calls</h2>",
    "<h2>What to watch</h2>",
    "<h2>Quiz</h2>",
  ]) {
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /Used the deterministic report fallback/);
  assert.match(html, /<ol><li>Why does/);
  assert.doesNotMatch(
    html,
    /quiz (?:passed|complete)|task (?:completed|complete)/i,
  );
  assert.match(html, /<\/body><\/html>$/);
  assert.match(markdown, /Artifact delivery is not source completion or outcome verification/);
  assert.match(html, /No source writeback was attempted/);
  assert.doesNotMatch(markdown, /HRV|readiness score|client_secret/i);
  for (const name of [
    "start-receipt.json",
    "finish-receipt.json",
    "artifact-receipt.json",
    "report-receipt.json",
    "report.md",
    "report.html",
  ]) {
    assert.equal(
      (await lstat(path.join(reportDirectory, name))).mode & 0o777,
      0o600,
    );
  }
});

test("builds the deterministic walkthrough fallback without an external skill", async () => {
  const input = await fixture();
  await start(input, FALLBACK_SESSION_ID);
  await recordTaskMapAgentExecutionFinish({
    executionRoot: input.executionRoot,
    sessionId: FALLBACK_SESSION_ID,
    finishedAt: "2026-07-30T18:02:00Z",
    exit: { kind: "code", code: 0 },
  });
  const session = path.join(
    input.executionRoot,
    "sessions",
    FALLBACK_SESSION_ID,
  );
  const resultPath = path.join(session, "artifacts", "result.md");
  await writeFile(
    resultPath,
    "# Fake Claude result\n\nReturned one bounded local result.\n",
    { mode: 0o600 },
  );
  await chmod(resultPath, 0o600);
  await recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: FALLBACK_SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["artifacts/result.md"],
  });
  await generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: FALLBACK_SESSION_ID,
    generatedAt: "2026-07-30T18:04:00Z",
  });

  const markdown = await readFile(path.join(session, "report.md"), "utf8");
  const html = await readFile(path.join(session, "report.html"), "utf8");
  let prior = -1;
  for (const section of TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS) {
    const current = markdown.indexOf(`## ${section}`);
    assert.ok(current > prior, section);
    prior = current;
  }
  assert.match(markdown, /sealed checkpoints/);
  assert.match(markdown, /Returned one bounded local result/);
  assert.match(markdown, /No deviation narrative was present/);
  assert.match(markdown, /still require human review/);
  assert.match(html, /Awaiting human review/);
  assert.match(html, /<h2>Quiz<\/h2><ol>/);
  const summary = await summarizeTaskMapAgentExecutionForReview(
    input.executionRoot,
    FALLBACK_SESSION_ID,
  );
  assert.equal(summary.reviewState, "awaiting_review");
  assert.equal(summary.terminalStateInferred, false);
  assert.equal(summary.sourceWritebackAttempted, false);
  assert.equal(summary.sourceCompletion, false);
  assert.equal(summary.outcomeVerified, false);
});

test("reports failed_without_artifact without claiming task failure or completion", async () => {
  const input = await fixture();
  await start(input, FAILED_SESSION_ID);
  const inspection = await runTaskMapAgentExecutionCli([
    "finish",
    "--execution-root",
    input.executionRoot,
    "--session-id",
    FAILED_SESSION_ID,
    "--finished-at",
    "2026-07-30T18:02:00Z",
    "--exit-code",
    "7",
  ]);
  assert.equal(inspection.progressState, "failed_without_artifact");
  assert.equal(inspection.sessionStatus, "failed");
  assert.equal(inspection.artifactCount, 0);
  assert.equal(inspection.sourceCompletion, false);
  assert.equal(inspection.outcomeVerified, false);
  const failedArtifactPath = path.join(
    input.executionRoot,
    "sessions",
    FAILED_SESSION_ID,
    "artifacts",
    "result.md",
  );
  await writeFile(failedArtifactPath, "# Partial\n", { mode: 0o600 });
  await chmod(failedArtifactPath, 0o600);
  await assert.rejects(() => recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: FAILED_SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["artifacts/result.md"],
  }), /failed sessions/);
  await assert.rejects(() => generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: FAILED_SESSION_ID,
    generatedAt: "2026-07-30T18:03:00Z",
  }), /ENOENT|artifact receipt/);
});

test("fails closed on invalid workspace, escaped artifacts, symlinks, and private report text", async () => {
  const invalidWorkspace = await fixture();
  const outside = path.join(invalidWorkspace.root, "outside-workspace");
  await mkdir(outside, { mode: 0o700 });
  const workspaceLink = path.join(invalidWorkspace.root, "workspace-link");
  await symlink(outside, workspaceLink);
  await assert.rejects(
    () => recordTaskMapAgentExecutionStart({
      executionRoot: invalidWorkspace.executionRoot,
      packagePath: invalidWorkspace.packagePath,
      workspacePath: workspaceLink,
      sessionId: SESSION_ID,
      launchedAdapter: "claude_code",
      adapterPreflightId: invalidWorkspace.preflight.adapterPreflightId,
      adapterPreflightDigest: invalidWorkspace.preflight.adapterPreflightDigest,
      corePreflightId: invalidWorkspace.preflight.corePreflightId,
      corePreflightDigest: invalidWorkspace.preflight.corePreflightDigest,
      runtimeRequestDigest: invalidWorkspace.preflight.runtimeRequest.requestDigest,
      startIdempotencyKey: invalidWorkspace.preflight.startIdempotencyKey,
      workspaceBindingDigest: invalidWorkspace.preflight.workspaceBindingDigest,
      startedAt: "2026-07-30T18:00:00Z",
    }, executionDependencies(invalidWorkspace.preflight)),
    /workspacePath/,
  );

  const input = await fixture();
  await start(input);
  await recordTaskMapAgentExecutionFinish({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    finishedAt: "2026-07-30T18:02:00Z",
    exit: { kind: "code", code: 0 },
  });
  await assert.rejects(() => recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["../secret.txt"],
  }), /artifactRelativePaths/);

  const artifacts = path.join(
    input.executionRoot,
    "sessions",
    SESSION_ID,
    "artifacts",
  );
  const outsideArtifact = path.join(input.root, "outside.txt");
  await writeFile(outsideArtifact, "outside", { mode: 0o600 });
  await chmod(outsideArtifact, 0o600);
  await symlink(outsideArtifact, path.join(artifacts, "linked.txt"));
  await assert.rejects(() => recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["artifacts/linked.txt"],
  }), /ELOOP|private file boundary/);

  await writeFile(
    path.join(artifacts, "result.md"),
    "Do not expose /Users/private-owner/secret.txt",
    { mode: 0o600 },
  );
  await chmod(path.join(artifacts, "result.md"), 0o600);
  await recordTaskMapAgentArtifacts({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    recordedAt: "2026-07-30T18:03:00Z",
    artifactRelativePaths: ["artifacts/result.md"],
  });
  await assert.rejects(() => generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    generatedAt: "2026-07-30T18:04:00Z",
    tests: [{ label: "HRV 42", status: "passed" }],
  }), /privacy-safe/);
  await generateTaskMapAgentSessionReport({
    executionRoot: input.executionRoot,
    sessionId: SESSION_ID,
    generatedAt: "2026-07-30T18:04:00Z",
  });
  const privateReport = await readFile(
    path.join(input.executionRoot, "sessions", SESSION_ID, "report.html"),
    "utf8",
  );
  assert.doesNotMatch(privateReport, /private-owner|secret\.txt/);
  assert.match(
    privateReport,
    /Returned narrative text was excluded because it crossed the privacy-safe report boundary/,
  );
});
