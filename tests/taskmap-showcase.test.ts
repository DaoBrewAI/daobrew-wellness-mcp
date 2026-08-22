import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  generateTaskMapAgentSessionReport,
  inspectTaskMapAgentExecution,
  recordTaskMapAgentArtifacts,
  recordTaskMapAgentExecutionFinish,
  recordTaskMapAgentExecutionStart,
  summarizeTaskMapAgentExecutionForReview,
} from "../src/engine/taskmap/agent-execution-receipts.js";
import type {
  TaskMapAgentAdapterHandoffPreflightV1,
} from "../src/engine/taskmap/agent-handoff-preflight.js";
import {
  buildTaskMapBodyContextDisclosure,
} from "../src/engine/taskmap/body-context.js";
import {
  buildTaskMapProjection,
  taskMapProjectionArtifactValidationReasons,
} from "../src/engine/taskmap/harness.js";
import {
  approveAndPrepareTaskMapLocalPackage,
  inspectTaskMapLocalApproval,
  type TaskMapLocalExecutionPackageV1,
  TASKMAP_FIXED_ARTIFACT_NAMES,
} from "../src/engine/taskmap/local-approval-package.js";
import {
  runTaskMapLocalCompletionCli,
  TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV,
} from "../src/engine/taskmap/local-completion-cli.js";
import {
  validateTaskMapNativeCurrentWork,
} from "../src/engine/taskmap/native-current-work-successor.js";
import {
  validateTaskMapReadyProofTargets,
} from "../src/engine/taskmap/ready-frontier.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
  taskMapContractCanonicalJson,
} from "../src/engine/taskmap/source-contracts.js";
import {
  SHOWCASE_FIXED_NOW,
  buildTaskMapShowcaseSource,
  publishTaskMapShowcase,
  resolveTaskMapShowcaseOwnerRoot,
} from "../src/engine/taskmap/showcase-source.js";
import type {
  TaskMapBodyContextDisclosureV1,
  TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";
import { confirmedTestOwner } from "./support/confirmed-owner.js";

const temporaryRoots: string[] = [];
const SHOWCASE_SESSION_ID = "b8a710d2-1acf-4f22-8a5e-3e43235a04d0";
const SHOWCASE_CONFIRMED_HOME = confirmedTestOwner(
  "showcase-owner",
).homeDirectory;

function writeShowcaseAdapterPreflight(
  packagePath: string,
  executionPackage: TaskMapLocalExecutionPackageV1,
): TaskMapAgentAdapterHandoffPreflightV1 {
  const adapter = "codex" as const;
  const corePreflightDigest = "d".repeat(64);
  const corePreflightId = `tmhandoffpreflight_${corePreflightDigest}`;
  const workspaceBindingDigest = "e".repeat(64);
  const runtimeCore = {
    contractVersion: "taskmap-agent-adapter-runtime-request.v1" as const,
    adapter,
    operation: "create_fresh_codex_task" as const,
    taskMode: "fresh" as const,
    packageId: executionPackage.packageId,
    packageDigest: executionPackage.packageDigest,
    packagePayloadDigest: "f".repeat(64),
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
  const preflight = {
    ...core,
    adapterPreflightId: `tmadapterpreflight_${adapterPreflightDigest}`,
    adapterPreflightDigest,
  };
  const artifactPath = path.join(
    path.dirname(packagePath),
    `adapter-preflight_${preflight.adapterPreflightId}.json`,
  );
  writeFileSync(
    artifactPath,
    taskMapContractCanonicalJson(preflight),
    { mode: 0o600 },
  );
  chmodSync(artifactPath, 0o600);
  return preflight;
}

function writeSimulatedCodexCliReturnFixture(artifactPath: string): void {
  const artifact = [
    "# Task Map showcase execution result",
    "",
    "## Context",
    "The approved local package requested one bounded showcase result.",
    "",
    "## Intuition",
    "A receipt chain proves delivery while preserving separate completion authority.",
    "",
    "## What was done",
    "Produced a privacy-safe result bound to the selected showcase task.",
    "",
    "## Deviations & judgment calls",
    "Simulated the codex_cli return boundary for receipt-contract coverage; no Codex process was launched.",
    "",
    "## What to watch",
    "Source completion and outcome verification remain false.",
    "",
    "## Quiz",
    "1. Why does artifact delivery not imply source completion?",
    "",
  ].join("\n");
  execFileSync(process.execPath, [
    "-e",
    "require('node:fs').writeFileSync(process.argv[1], process.argv[2], {mode: 0o600})",
    artifactPath,
    artifact,
  ]);
}

function temporaryRoot(label: string): string {
  const parent = path.join(process.cwd(), ".taskmap-showcase-tests");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const root = realpathSync(mkdtempSync(path.join(parent, `${label}-`)));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    const parent = path.dirname(root);
    assert.equal(path.basename(parent), ".taskmap-showcase-tests");
    rmSync(root, { recursive: true, force: true });
  }
});

describe("privacy-safe Task Map showcase", () => {
  it("is deterministic, source-backed, approval-ready, and exactly 3/4 current", () => {
    const first = buildTaskMapShowcaseSource();
    const second = buildTaskMapShowcaseSource();

    assert.deepEqual(second, first);
    assert.equal(first.input.generatedAt, SHOWCASE_FIXED_NOW);
    assert.deepEqual(first.sourceStates, [
      { source: "agent_session", state: "current" },
      { source: "meeting_notes", state: "current" },
      { source: "calendar", state: "unavailable" },
      { source: "body", state: "current" },
    ]);

    const serialized = JSON.stringify(first);
    for (const forbidden of [
      "Neo",
      "yz",
      "/Users/",
      "private-owner",
      "access_token",
      "refresh_token",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }

    const projection = buildTaskMapProjection(first.input, first.brain, {
      arm: "E4",
      now: SHOWCASE_FIXED_NOW,
    });
    const repeated = buildTaskMapProjection(first.input, first.brain, {
      arm: "E4",
      now: SHOWCASE_FIXED_NOW,
    });
    assert.equal(projection.runStatus, "accepted");
    assert.deepEqual(projection.rejections, []);
    assert.equal(projection.roots.length, 3);
    assert.equal(projection.tasks.length, 10);
    const selectedRoot = projection.roots.find(
      (root) => root.title === "Make the local Task Map trustworthy end to end",
    );
    assert.ok(selectedRoot);
    assert.equal(selectedRoot.taskIds.length, 4);
    assert.deepEqual(
      repeated.roots.map((root) => root.id),
      projection.roots.map((root) => root.id),
    );
    assert.deepEqual(
      repeated.tasks.map((task) => task.id),
      projection.tasks.map((task) => task.id),
    );
    assert.ok(projection.tasks.every((task) => task.citations.length > 0));

    const sourceBacked = projection.tasks.filter((task) => (
      task.reviewState === "accepted"
      && task.openState === "open"
      && task.authority !== "none"
      && task.returnRoute.requiresApproval
    ));
    assert.equal(sourceBacked.length, 7);
    assert.equal(
      sourceBacked.filter(
        (task) => task.title === "Complete the showcase loop",
      ).length,
      1,
    );

    const body = buildTaskMapBodyContextDisclosure(
      first.input,
      projection,
      first.bodyContext,
    );
    assert.equal(body.projectionRunId, projection.runId);
    assert.ok(body.nodes.length > 0);
    assert.deepEqual(body.privacy, {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    });
  });

  it("publishes strict projection/currentness plus both sidecars through native refresh", async () => {
    const ownerRoot = temporaryRoot("publication");
    const result = await publishTaskMapShowcase({
      ownerRoot,
      homeDirectory: SHOWCASE_CONFIRMED_HOME,
    });

    assert.equal(result.refresh.refreshStatus, "published");
    assert.equal(result.refresh.publicationVerified, true);
    assert.equal(
      result.refresh.sourceStatuses.filter(
        (status) => status.state === "current",
      ).length,
      3,
    );
    assert.deepEqual(
      result.refresh.sourceStatuses.map(({ source, state }) => ({
        source,
        state,
      })),
      buildTaskMapShowcaseSource().sourceStates,
    );

    const taskMapRoot = path.join(ownerRoot, "taskmap");
    const projectionPath = path.join(
      taskMapRoot,
      "taskmap-projection.v1.json",
    );
    const currentnessPath = path.join(
      taskMapRoot,
      "taskmap-currentness.v1.json",
    );
    const currentWorkPath = path.join(
      taskMapRoot,
      "taskmap-current-work.v1.json",
    );
    const readyProofTargetsPath = path.join(
      taskMapRoot,
      "taskmap-ready-proof-targets.v1.json",
    );
    const bodyPath = path.join(
      taskMapRoot,
      "taskmap-body-context.v1.json",
    );
    const bodyAssessmentPath = path.join(
      taskMapRoot,
      TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
    );
    const projection = JSON.parse(
      readFileSync(projectionPath, "utf8"),
    ) as TaskMapProjectionV1;
    const currentness = JSON.parse(
      readFileSync(currentnessPath, "utf8"),
    ) as Parameters<typeof validateTaskMapNativeCurrentWork>[3];
    const currentWorkBytes = readFileSync(currentWorkPath);
    const currentWork = JSON.parse(currentWorkBytes.toString("utf8"));
    const body = JSON.parse(
      readFileSync(bodyPath, "utf8"),
    ) as TaskMapBodyContextDisclosureV1;

    assert.deepEqual(taskMapProjectionArtifactValidationReasons(projection), []);
    assert.equal(projection.runStatus, "accepted");
    assert.equal(
      currentness.projectionDigest,
      diffTaskMapProjections(null, projection).currentProjectionDigest,
    );
    assert.equal(
      currentWorkBytes.toString("utf8"),
      taskMapContractCanonicalJson(currentWork),
    );
    assert.doesNotThrow(() => validateTaskMapNativeCurrentWork(
      currentWork,
      currentWorkBytes,
      projection,
      currentness,
    ));
    const readyProofTargets = validateTaskMapReadyProofTargets(
      JSON.parse(readFileSync(readyProofTargetsPath, "utf8")),
      projection,
      currentness,
    );
    assert.deepEqual(
      readyProofTargets.proofTargets.map((target) => target.taskId),
      [currentWork.nextTaskToProve.taskId],
    );
    assert.equal(body.projectionRunId, projection.runId);
    assert.equal(body.projectionInputDigest, projection.inputDigest);
    assert.ok(body.nodes.length > 0);
    const approval = await inspectTaskMapLocalApproval({
      ownerRoot,
      taskMapRoot,
    });
    assert.equal(approval.response.status, "ready_for_approval");
    assert.equal(approval.inspection.readyForLocalApproval, true);
    assert.equal(
      approval.inspection.task.outcome,
      "Complete the showcase loop with a signed app and retained receipts.",
    );
    for (const artifactPath of [
      projectionPath,
      currentnessPath,
      currentWorkPath,
      readyProofTargetsPath,
      bodyPath,
      bodyAssessmentPath,
    ]) {
      assert.equal(lstatSync(artifactPath).isSymbolicLink(), false);
      assert.equal(lstatSync(artifactPath).mode & 0o777, 0o600);
    }
  });

  it("requires an absolute symlink-free root outside normal owner state", () => {
    assert.throws(
      () => resolveTaskMapShowcaseOwnerRoot("relative/showcase"),
      /absolute isolated owner root/,
    );
    const normalRoot = path.join(
      homedir(),
      "Library",
      "Application Support",
      "DaoBrew",
    );
    assert.throws(
      () => resolveTaskMapShowcaseOwnerRoot(normalRoot),
      /normal owner root/,
    );

    const realRoot = temporaryRoot("real");
    const symlinkParent = temporaryRoot("symlink-parent");
    const symlinkRoot = path.join(symlinkParent, "showcase-link");
    symlinkSync(realRoot, symlinkRoot);
    assert.throws(
      () => resolveTaskMapShowcaseOwnerRoot(symlinkRoot),
      /symlink-free/,
    );
  });

  it("CLI refuses missing/unsafe roots and publishes only to an explicit valid root", () => {
    const script = path.resolve("scripts/taskmap-showcase.mjs");
    assert.throws(
      () => execFileSync(process.execPath, [script], { encoding: "utf8" }),
      /--owner-root is required/,
    );
    assert.throws(
      () => execFileSync(
        process.execPath,
        [script, "--owner-root", "relative/showcase"],
        { encoding: "utf8" },
      ),
      /absolute isolated owner root/,
    );

    const ownerRoot = temporaryRoot("cli");
    chmodSync(ownerRoot, 0o700);
    const output = execFileSync(
      process.execPath,
      [script, "--owner-root", ownerRoot],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: SHOWCASE_CONFIRMED_HOME },
      },
    );
    const summary = JSON.parse(output) as {
      status: string;
      refreshStatus: string;
      currentSources: number;
      totalSources: number;
    };
    assert.deepEqual(summary, {
      status: "ok",
      refreshStatus: "published",
      currentSources: 3,
      totalSources: 4,
    });
  });

  it("simulates a codex_cli return, then reports, closes, and prunes while retaining contract evidence", async () => {
    const ownerRoot = temporaryRoot("execution-loop");
    await publishTaskMapShowcase({
      ownerRoot,
      homeDirectory: SHOWCASE_CONFIRMED_HOME,
    });
    const taskMapRoot = path.join(ownerRoot, "taskmap");
    const localExecutionRoot = path.join(
      ownerRoot,
      "taskmap-local-execution",
    );
    const agentExecutionRoot = path.join(
      ownerRoot,
      "taskmap-agent-execution",
    );
    const workspacePath = path.join(ownerRoot, "showcase-workspace");
    mkdirSync(workspacePath, { mode: 0o700 });
    const projectionPath = path.join(
      taskMapRoot,
      TASKMAP_FIXED_ARTIFACT_NAMES.projection,
    );
    const projectionBefore = readFileSync(projectionPath);
    const approval = await inspectTaskMapLocalApproval({
      ownerRoot,
      taskMapRoot,
    });
    const prepared = await approveAndPrepareTaskMapLocalPackage({
      ownerRoot,
      taskMapRoot,
      executionRoot: localExecutionRoot,
      expectedOwnerScopeDigest:
        approval.inspection.localOwnerScopeDigest,
      expectedProofDigest: approval.inspection.proofDigest,
      taskId: approval.inspection.task.taskId,
      idempotencyKey: approval.inspection.prepareIdempotencyKey,
      authorizedAt: "2026-07-31T12:02:00.000Z",
    });
    assert.equal(prepared.response.status, "package_ready");
    assert.equal(prepared.package.task.taskId, approval.inspection.task.taskId);
    assert.equal(prepared.package.executionBoundary.taskStarted, false);
    const packagePath = prepared.response.artifactAccess?.packagePath;
    assert.ok(packagePath);

    const adapterPreflight = writeShowcaseAdapterPreflight(
      packagePath,
      prepared.package,
    );
    const started = await recordTaskMapAgentExecutionStart({
      executionRoot: agentExecutionRoot,
      packagePath,
      workspacePath,
      sessionId: SHOWCASE_SESSION_ID,
      launchedAdapter: "codex_cli",
      adapterPreflightId: adapterPreflight.adapterPreflightId,
      adapterPreflightDigest: adapterPreflight.adapterPreflightDigest,
      corePreflightId: adapterPreflight.corePreflightId,
      corePreflightDigest: adapterPreflight.corePreflightDigest,
      runtimeRequestDigest: adapterPreflight.runtimeRequest.requestDigest,
      startIdempotencyKey: adapterPreflight.startIdempotencyKey,
      workspaceBindingDigest: adapterPreflight.workspaceBindingDigest,
      startedAt: "2026-07-31T12:03:00.000Z",
    }, {
      inspectAdapterPreflight: async () => adapterPreflight,
    });
    assert.equal(started.receipt.packageDigest, prepared.package.packageDigest);
    const artifactRelativePath = "artifacts/result.md";
    const artifactPath = path.join(
      agentExecutionRoot,
      "sessions",
      SHOWCASE_SESSION_ID,
      artifactRelativePath,
    );
    writeSimulatedCodexCliReturnFixture(artifactPath);
    const finished = await recordTaskMapAgentExecutionFinish({
      executionRoot: agentExecutionRoot,
      sessionId: SHOWCASE_SESSION_ID,
      finishedAt: "2026-07-31T12:04:00.000Z",
      exit: { kind: "code", code: 0 },
    });
    const delivered = await recordTaskMapAgentArtifacts({
      executionRoot: agentExecutionRoot,
      sessionId: SHOWCASE_SESSION_ID,
      recordedAt: "2026-07-31T12:05:00.000Z",
      artifactRelativePaths: [artifactRelativePath],
    });
    const reported = await generateTaskMapAgentSessionReport({
      executionRoot: agentExecutionRoot,
      sessionId: SHOWCASE_SESSION_ID,
      generatedAt: "2026-07-31T12:06:00.000Z",
      tests: [{
        label: "Simulated codex_cli receipt path (no process launched)",
        status: "passed",
      }],
    });
    assert.equal(
      delivered.receipt.finishReceiptDigest,
      finished.receipt.finishReceiptDigest,
    );
    assert.equal(
      reported.receipt.artifactReceiptDigest,
      delivered.receipt.artifactReceiptDigest,
    );
    const inspection = await inspectTaskMapAgentExecution(
      agentExecutionRoot,
      SHOWCASE_SESSION_ID,
    );
    assert.equal(inspection.progressState, "report_ready");
    assert.equal(inspection.taskId, approval.inspection.task.taskId);
    assert.equal(inspection.sourceWritebackAttempted, false);
    const reviewSummary = await summarizeTaskMapAgentExecutionForReview(
      agentExecutionRoot,
      SHOWCASE_SESSION_ID,
    );
    assert.equal(reviewSummary.reviewState, "awaiting_review");
    assert.equal(reviewSummary.reportShape, "change_walkthrough");

    const completionDependencies = {
      environment: {
        [TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
      },
    };
    const commonCompletionArgs = [
      "--test-owner-root", ownerRoot,
      "--task-id", approval.inspection.task.taskId,
      "--session-id", SHOWCASE_SESSION_ID,
      "--decided-at", "2026-07-31T12:07:00.000Z",
    ];
    const review = await runTaskMapLocalCompletionCli(
      ["review", ...commonCompletionArgs],
      completionDependencies,
    );
    assert.equal(review.status, "awaiting_review");
    const closed = await runTaskMapLocalCompletionCli(
      ["close", ...commonCompletionArgs],
      completionDependencies,
    );
    assert.equal(closed.status, "closed_in_daobrew");
    assert.deepEqual(
      closed.closedTaskIds,
      [approval.inspection.task.taskId],
    );
    const overlay = JSON.parse(readFileSync(path.join(
      localExecutionRoot,
      "completion-overlay.v1.json",
    ), "utf8")) as {
      prunedNodeIds: string[];
      activeGraph: { nodes: Array<{ nodeId: string }> };
      completionHistory: unknown[];
    };
    assert.ok(overlay.prunedNodeIds.includes(approval.inspection.task.taskId));
    assert.equal(
      overlay.activeGraph.nodes.some(
        (node) => node.nodeId === approval.inspection.task.taskId,
      ),
      false,
    );
    assert.equal(overlay.completionHistory.length, 1);
    assert.deepEqual(readFileSync(projectionPath), projectionBefore);
    for (const retainedPath of [
      packagePath,
      artifactPath,
      path.join(
        agentExecutionRoot,
        "sessions",
        SHOWCASE_SESSION_ID,
        "report.md",
      ),
      path.join(
        agentExecutionRoot,
        "sessions",
        SHOWCASE_SESSION_ID,
        "report.html",
      ),
    ]) {
      assert.equal(lstatSync(retainedPath).isFile(), true);
    }
  });
});
