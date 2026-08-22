"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const node_util_1 = require("node:util");
const agent_execution_receipts_js_1 = require("../src/engine/taskmap/agent-execution-receipts.js");
const agent_execution_receipts_cli_js_1 = require("../src/engine/taskmap/agent-execution-receipts-cli.js");
const local_approval_package_js_1 = require("../src/engine/taskmap/local-approval-package.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const FAILED_SESSION_ID = "123e4567-e89b-42d3-a456-426614174001";
const FALLBACK_SESSION_ID = "123e4567-e89b-42d3-a456-426614174002";
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);
const D3 = "3".repeat(64);
const D4 = "4".repeat(64);
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
(0, node_test_1.default)("preserves agent-execution failure bytes without echoing invalid argv", () => {
    const entrypoint = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/agent-execution-receipts-cli.js");
    const unreflectedArgument = "PRIVATE_AGENT_EXECUTION_ARGUMENT";
    const result = (0, node_child_process_1.spawnSync)(process.execPath, [entrypoint, unreflectedArgument], {
        cwd: process.cwd(),
        encoding: "utf8",
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.stdout, "");
    strict_1.default.match(result.stderr, /^taskmap-agent-execution: unavailable\nError: Task Map agent execution CLI input is invalid/m);
    strict_1.default.match(result.stderr, /at fail/);
    strict_1.default.equal(result.stderr.includes(unreflectedArgument), false);
});
async function writePrivateJson(filePath, value) {
    await (0, promises_1.writeFile)(filePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(value), {
        mode: 0o600,
    });
    await (0, promises_1.chmod)(filePath, 0o600);
}
function packageFixture() {
    const core = {
        contractVersion: local_approval_package_js_1.TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION,
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
    const packageDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-local-execution-package.1",
        ...core,
    });
    return {
        ...core,
        packageId: `tmlocalpackage_${packageDigest}`,
        packageDigest,
    };
}
function adapterPreflightFixture(executionPackage, adapter = "claude_code") {
    const corePreflightDigest = D2;
    const corePreflightId = `tmhandoffpreflight_${corePreflightDigest}`;
    const workspaceBindingDigest = D3;
    const runtimeCore = {
        contractVersion: "taskmap-agent-adapter-runtime-request.v1",
        adapter,
        operation: adapter === "codex"
            ? "create_fresh_codex_task"
            : "create_fresh_claude_code_session",
        taskMode: "fresh",
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
        requestDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-agent-adapter-runtime-request.1",
            ...runtimeCore,
        }),
    };
    const startIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-agent-adapter-start-idempotency.1",
        adapter,
        packageDigest: executionPackage.packageDigest,
        corePreflightDigest,
        requestDigest: runtimeRequest.requestDigest,
    });
    const core = {
        contractVersion: "taskmap-agent-adapter-handoff-preflight.v1",
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
            state: "validated_not_started",
            humanApprovalRequired: true,
            dispatchAuthorized: false,
            processStartAuthorized: false,
            adapterSessionStartAuthorized: false,
            taskCreated: false,
            adapterSessionId: null,
            sourceWritebackAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            credentialsStored: false,
            participantIdentitiesStored: false,
            unboundedWorkspaceContextStored: false,
        },
    };
    const adapterPreflightDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-agent-adapter-handoff-preflight.1",
        ...core,
    });
    return {
        ...core,
        adapterPreflightId: `tmadapterpreflight_${adapterPreflightDigest}`,
        adapterPreflightDigest,
    };
}
function executionDependencies(preflight) {
    return {
        inspectAdapterPreflight: async () => preflight,
    };
}
async function fixture() {
    const root = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-execution-")));
    await (0, promises_1.chmod)(root, 0o700);
    const inputs = node_path_1.default.join(root, "inputs");
    await (0, promises_1.mkdir)(inputs, { mode: 0o700 });
    const executionPackage = packageFixture();
    const packagePath = node_path_1.default.join(inputs, "package.json");
    const workspacePath = node_path_1.default.join(root, "workspace");
    await (0, promises_1.mkdir)(workspacePath, { mode: 0o700 });
    await writePrivateJson(packagePath, executionPackage);
    const preflight = adapterPreflightFixture(executionPackage);
    await writePrivateJson(node_path_1.default.join(inputs, `adapter-preflight_${preflight.adapterPreflightId}.json`), preflight);
    return {
        root,
        executionRoot: node_path_1.default.join(root, "execution"),
        packagePath,
        workspacePath,
        preflight,
    };
}
async function start(input, sessionId = SESSION_ID, startedAt = "2026-07-30T18:00:00Z") {
    return (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
(0, node_test_1.default)("freezes an explicit launcher contract and closed CLI arguments", () => {
    strict_1.default.deepEqual(agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1.requiredOrder, ["start", "finish", "artifacts", "report"]);
    strict_1.default.equal(agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1
        .approvedPackageRequired, true);
    strict_1.default.equal(agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1.workspacePathStored, false);
    strict_1.default.equal(agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1
        .outcomeVerificationSupported, false);
    strict_1.default.deepEqual((0, agent_execution_receipts_cli_js_1.parseTaskMapAgentExecutionCliArguments)([
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
    ]), {
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
    });
    strict_1.default.deepEqual((0, agent_execution_receipts_cli_js_1.parseTaskMapAgentExecutionCliArguments)([
        "finish",
        "--execution-root",
        "/tmp/execution",
        "--session-id",
        SESSION_ID,
        "--finished-at",
        "2026-07-30T18:01:00Z",
        "--exit-code",
        "0",
    ]), {
        command: "finish",
        executionRoot: "/tmp/execution",
        sessionId: SESSION_ID,
        finishedAt: "2026-07-30T18:01:00Z",
        exit: { kind: "code", code: 0 },
    });
    strict_1.default.throws(() => (0, agent_execution_receipts_cli_js_1.parseTaskMapAgentExecutionCliArguments)([
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
    strict_1.default.deepEqual((0, agent_execution_receipts_cli_js_1.parseTaskMapAgentExecutionCliArguments)([
        "review-summary",
        "--execution-root",
        "/tmp/execution",
        "--session-id",
        SESSION_ID,
    ]), {
        command: "review-summary",
        executionRoot: "/tmp/execution",
        sessionId: SESSION_ID,
    });
});
(0, node_test_1.default)("binds start and inspection to one sealed adapter preflight", async () => {
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
    ];
    const inspection = await (0, agent_execution_receipts_cli_js_1.runTaskMapAgentExecutionCli)(cli, executionDependencies(input.preflight));
    strict_1.default.equal(inspection.preflightId, input.preflight.adapterPreflightId);
    strict_1.default.equal(inspection.preflightDigest, input.preflight.adapterPreflightDigest);
    strict_1.default.equal(inspection.corePreflightId, input.preflight.corePreflightId);
    strict_1.default.equal(inspection.corePreflightDigest, input.preflight.corePreflightDigest);
    strict_1.default.equal(inspection.runtimeRequestDigest, input.preflight.runtimeRequest.requestDigest);
    strict_1.default.equal(inspection.startIdempotencyKey, input.preflight.startIdempotencyKey);
    strict_1.default.equal(inspection.workspaceBindingDigest, input.preflight.workspaceBindingDigest);
    const receipt = JSON.parse(await (0, promises_1.readFile)(node_path_1.default.join(input.executionRoot, "sessions", SESSION_ID, "start-receipt.json"), "utf8"));
    strict_1.default.equal(receipt.proofAdapter, "claude_code");
    strict_1.default.equal(receipt.adapterPreflightId, input.preflight.adapterPreflightId);
    strict_1.default.equal(receipt.localWorkspaceDigest.length, 64);
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
    await writePrivateJson(node_path_1.default.join(node_path_1.default.dirname(codexInput.packagePath), `adapter-preflight_${codexPreflight.adapterPreflightId}.json`), codexPreflight);
    const codex = await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
    strict_1.default.equal(codex.receipt.proofAdapter, "codex");
    strict_1.default.equal(codex.receipt.launchedAdapter, "codex_cli");
});
(0, node_test_1.default)("runs an isolated fake-Claude flow through artifact, report, and awaiting review", async () => {
    const input = await fixture();
    const started = await start(input);
    strict_1.default.equal(started.replayed, false);
    strict_1.default.equal(started.receipt.userStartApprovalRecorded, true);
    strict_1.default.equal(started.receipt.launchedAdapter, "claude_code");
    strict_1.default.equal(started.receipt.sourceCompletion, false);
    strict_1.default.equal(started.receipt.outcomeVerified, false);
    const startReplay = await start(input);
    strict_1.default.equal(startReplay.replayed, true);
    strict_1.default.deepEqual(startReplay.receipt, started.receipt);
    await strict_1.default.rejects(() => start(input, SESSION_ID, "2026-07-30T18:00:01Z"), /immutable receipt conflicts/);
    let inspection = await (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(inspection.progressState, "started");
    strict_1.default.equal(inspection.sessionStatus, "running");
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionFinish)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        finishedAt: "2026-07-30T18:02:00Z",
        exit: { kind: "code", code: 0 },
    });
    inspection = await (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(inspection.progressState, "finished_without_artifact");
    strict_1.default.equal(inspection.sessionStatus, "finished");
    strict_1.default.equal(inspection.artifactCount, 0);
    strict_1.default.equal(inspection.outcomeVerified, false);
    const artifactPath = node_path_1.default.join(input.executionRoot, "sessions", SESSION_ID, "artifacts", "result.md");
    const fakeClaudeResult = node_path_1.default.join(input.root, "fake-claude-result.md");
    await (0, promises_1.writeFile)(fakeClaudeResult, [
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
    ].join("\n"), { mode: 0o600 });
    await (0, promises_1.chmod)(fakeClaudeResult, 0o600);
    const fakeClaude = node_path_1.default.join(input.root, "fake-claude");
    await (0, promises_1.writeFile)(fakeClaude, "#!/bin/sh\nset -eu\n/bin/cp \"$1\" \"$2\"\n", { mode: 0o700 });
    await (0, promises_1.chmod)(fakeClaude, 0o700);
    await execFileAsync(fakeClaude, [fakeClaudeResult, artifactPath]);
    await (0, promises_1.chmod)(artifactPath, 0o600);
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["artifacts/result.md"],
    });
    inspection = await (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(inspection.progressState, "artifact_delivered");
    strict_1.default.equal(inspection.artifactCount, 1);
    strict_1.default.equal(inspection.sourceCompletion, false);
    const deliveredSummary = await (0, agent_execution_receipts_js_1.summarizeTaskMapAgentExecutionForReview)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(deliveredSummary.reviewState, "not_ready");
    strict_1.default.deepEqual(deliveredSummary.artifactRelativePaths, ["artifacts/result.md"]);
    strict_1.default.equal(deliveredSummary.primaryArtifactRelativePath, "artifacts/result.md");
    strict_1.default.equal(deliveredSummary.htmlReportRelativePath, null);
    strict_1.default.equal(deliveredSummary.terminalStateInferred, false);
    const report = await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        generatedAt: "2026-07-30T18:04:00Z",
        tests: [
            { label: "Focused receipt fixture", status: "passed" },
            { label: "Source completion check", status: "not_run" },
        ],
    });
    strict_1.default.equal(report.replayed, false);
    strict_1.default.equal(report.receipt.transcriptStored, false);
    strict_1.default.equal(report.receipt.rawBiometricsStored, false);
    strict_1.default.equal(report.receipt.meetingBodiesStored, false);
    strict_1.default.equal(report.receipt.outcomeVerified, false);
    const replay = await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        generatedAt: "2026-07-30T18:04:00Z",
        tests: [
            { label: "Source completion check", status: "not_run" },
            { label: "Focused receipt fixture", status: "passed" },
        ],
    });
    strict_1.default.equal(replay.replayed, true);
    strict_1.default.deepEqual(replay.receipt, report.receipt);
    inspection = await (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(inspection.progressState, "report_ready");
    strict_1.default.equal(inspection.reportRelativePaths.length, 2);
    strict_1.default.equal(inspection.sourceWritebackAttempted, false);
    strict_1.default.equal(inspection.sourceCompletion, false);
    strict_1.default.equal(inspection.outcomeVerified, false);
    const reviewSummary = await (0, agent_execution_receipts_js_1.summarizeTaskMapAgentExecutionForReview)(input.executionRoot, SESSION_ID);
    strict_1.default.equal(reviewSummary.contractVersion, agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION);
    strict_1.default.equal(reviewSummary.reviewState, "awaiting_review");
    strict_1.default.equal(reviewSummary.reportShape, "change_walkthrough");
    strict_1.default.deepEqual(reviewSummary.artifactRelativePaths, ["artifacts/result.md"]);
    strict_1.default.equal(reviewSummary.primaryArtifactRelativePath, "artifacts/result.md");
    strict_1.default.equal(reviewSummary.markdownReportRelativePath, "report.md");
    strict_1.default.equal(reviewSummary.htmlReportRelativePath, "report.html");
    strict_1.default.equal(reviewSummary.artifactReceiptDigest, inspection.artifactReceiptDigest);
    strict_1.default.equal(reviewSummary.reportReceiptDigest, inspection.reportReceiptDigest);
    strict_1.default.equal(reviewSummary.terminalStateInferred, false);
    strict_1.default.equal(reviewSummary.sourceCompletion, false);
    strict_1.default.equal(reviewSummary.outcomeVerified, false);
    const { summaryDigest, ...summaryCore } = reviewSummary;
    strict_1.default.equal(summaryDigest, (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-agent-execution-review-summary.1",
        ...summaryCore,
    }));
    const cliReviewSummary = await (0, agent_execution_receipts_cli_js_1.runTaskMapAgentExecutionReviewSummaryCli)([
        "review-summary",
        "--execution-root",
        input.executionRoot,
        "--session-id",
        SESSION_ID,
    ]);
    strict_1.default.deepEqual(cliReviewSummary, reviewSummary);
    strict_1.default.deepEqual(JSON.parse((0, agent_execution_receipts_cli_js_1.taskMapAgentExecutionCliOutput)(cliReviewSummary)), reviewSummary);
    const summary = (0, agent_execution_receipts_cli_js_1.taskMapAgentExecutionCliOutput)(inspection);
    strict_1.default.equal(summary.endsWith("\n"), true);
    strict_1.default.deepEqual(JSON.parse(summary), inspection);
    const reportDirectory = node_path_1.default.join(input.executionRoot, "sessions", SESSION_ID);
    const markdown = await (0, promises_1.readFile)(node_path_1.default.join(reportDirectory, "report.md"), "utf8");
    const html = await (0, promises_1.readFile)(node_path_1.default.join(reportDirectory, "report.html"), "utf8");
    strict_1.default.equal((0, node_crypto_1.createHash)("sha256").update(markdown).digest("hex"), report.receipt.markdownDigest);
    strict_1.default.equal((0, node_crypto_1.createHash)("sha256").update(html).digest("hex"), report.receipt.htmlDigest);
    let priorMarkdownSection = -1;
    for (const section of agent_execution_receipts_js_1.TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS) {
        const sectionIndex = markdown.indexOf(`## ${section}`);
        strict_1.default.ok(sectionIndex > priorMarkdownSection, section);
        priorMarkdownSection = sectionIndex;
    }
    strict_1.default.match(html, /^<!doctype html>/);
    strict_1.default.match(html, /<p class="eyebrow">Awaiting human review<\/p>/);
    for (const heading of [
        "<h2>Context</h2>",
        "<h2>Intuition</h2>",
        "<h2>What was done</h2>",
        "<h2>Deviations &amp; judgment calls</h2>",
        "<h2>What to watch</h2>",
        "<h2>Quiz</h2>",
    ]) {
        strict_1.default.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    strict_1.default.match(html, /Used the deterministic report fallback/);
    strict_1.default.match(html, /<ol><li>Why does/);
    strict_1.default.doesNotMatch(html, /quiz (?:passed|complete)|task (?:completed|complete)/i);
    strict_1.default.match(html, /<\/body><\/html>$/);
    strict_1.default.match(markdown, /Artifact delivery is not source completion or outcome verification/);
    strict_1.default.match(html, /No source writeback was attempted/);
    strict_1.default.doesNotMatch(markdown, /HRV|readiness score|client_secret/i);
    for (const name of [
        "start-receipt.json",
        "finish-receipt.json",
        "artifact-receipt.json",
        "report-receipt.json",
        "report.md",
        "report.html",
    ]) {
        strict_1.default.equal((await (0, promises_1.lstat)(node_path_1.default.join(reportDirectory, name))).mode & 0o777, 0o600);
    }
});
(0, node_test_1.default)("builds the deterministic walkthrough fallback without an external skill", async () => {
    const input = await fixture();
    await start(input, FALLBACK_SESSION_ID);
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionFinish)({
        executionRoot: input.executionRoot,
        sessionId: FALLBACK_SESSION_ID,
        finishedAt: "2026-07-30T18:02:00Z",
        exit: { kind: "code", code: 0 },
    });
    const session = node_path_1.default.join(input.executionRoot, "sessions", FALLBACK_SESSION_ID);
    const resultPath = node_path_1.default.join(session, "artifacts", "result.md");
    await (0, promises_1.writeFile)(resultPath, "# Fake Claude result\n\nReturned one bounded local result.\n", { mode: 0o600 });
    await (0, promises_1.chmod)(resultPath, 0o600);
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: FALLBACK_SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["artifacts/result.md"],
    });
    await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: FALLBACK_SESSION_ID,
        generatedAt: "2026-07-30T18:04:00Z",
    });
    const markdown = await (0, promises_1.readFile)(node_path_1.default.join(session, "report.md"), "utf8");
    const html = await (0, promises_1.readFile)(node_path_1.default.join(session, "report.html"), "utf8");
    let prior = -1;
    for (const section of agent_execution_receipts_js_1.TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS) {
        const current = markdown.indexOf(`## ${section}`);
        strict_1.default.ok(current > prior, section);
        prior = current;
    }
    strict_1.default.match(markdown, /sealed checkpoints/);
    strict_1.default.match(markdown, /Returned one bounded local result/);
    strict_1.default.match(markdown, /No deviation narrative was present/);
    strict_1.default.match(markdown, /still require human review/);
    strict_1.default.match(html, /Awaiting human review/);
    strict_1.default.match(html, /<h2>Quiz<\/h2><ol>/);
    const summary = await (0, agent_execution_receipts_js_1.summarizeTaskMapAgentExecutionForReview)(input.executionRoot, FALLBACK_SESSION_ID);
    strict_1.default.equal(summary.reviewState, "awaiting_review");
    strict_1.default.equal(summary.terminalStateInferred, false);
    strict_1.default.equal(summary.sourceWritebackAttempted, false);
    strict_1.default.equal(summary.sourceCompletion, false);
    strict_1.default.equal(summary.outcomeVerified, false);
});
(0, node_test_1.default)("reports failed_without_artifact without claiming task failure or completion", async () => {
    const input = await fixture();
    await start(input, FAILED_SESSION_ID);
    const inspection = await (0, agent_execution_receipts_cli_js_1.runTaskMapAgentExecutionCli)([
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
    strict_1.default.equal(inspection.progressState, "failed_without_artifact");
    strict_1.default.equal(inspection.sessionStatus, "failed");
    strict_1.default.equal(inspection.artifactCount, 0);
    strict_1.default.equal(inspection.sourceCompletion, false);
    strict_1.default.equal(inspection.outcomeVerified, false);
    const failedArtifactPath = node_path_1.default.join(input.executionRoot, "sessions", FAILED_SESSION_ID, "artifacts", "result.md");
    await (0, promises_1.writeFile)(failedArtifactPath, "# Partial\n", { mode: 0o600 });
    await (0, promises_1.chmod)(failedArtifactPath, 0o600);
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: FAILED_SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["artifacts/result.md"],
    }), /failed sessions/);
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: FAILED_SESSION_ID,
        generatedAt: "2026-07-30T18:03:00Z",
    }), /ENOENT|artifact receipt/);
});
(0, node_test_1.default)("fails closed on invalid workspace, escaped artifacts, symlinks, and private report text", async () => {
    const invalidWorkspace = await fixture();
    const outside = node_path_1.default.join(invalidWorkspace.root, "outside-workspace");
    await (0, promises_1.mkdir)(outside, { mode: 0o700 });
    const workspaceLink = node_path_1.default.join(invalidWorkspace.root, "workspace-link");
    await (0, promises_1.symlink)(outside, workspaceLink);
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
    }, executionDependencies(invalidWorkspace.preflight)), /workspacePath/);
    const input = await fixture();
    await start(input);
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionFinish)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        finishedAt: "2026-07-30T18:02:00Z",
        exit: { kind: "code", code: 0 },
    });
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["../secret.txt"],
    }), /artifactRelativePaths/);
    const artifacts = node_path_1.default.join(input.executionRoot, "sessions", SESSION_ID, "artifacts");
    const outsideArtifact = node_path_1.default.join(input.root, "outside.txt");
    await (0, promises_1.writeFile)(outsideArtifact, "outside", { mode: 0o600 });
    await (0, promises_1.chmod)(outsideArtifact, 0o600);
    await (0, promises_1.symlink)(outsideArtifact, node_path_1.default.join(artifacts, "linked.txt"));
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["artifacts/linked.txt"],
    }), /ELOOP|private file boundary/);
    await (0, promises_1.writeFile)(node_path_1.default.join(artifacts, "result.md"), "Do not expose /Users/private-owner/secret.txt", { mode: 0o600 });
    await (0, promises_1.chmod)(node_path_1.default.join(artifacts, "result.md"), 0o600);
    await (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        recordedAt: "2026-07-30T18:03:00Z",
        artifactRelativePaths: ["artifacts/result.md"],
    });
    await strict_1.default.rejects(() => (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        generatedAt: "2026-07-30T18:04:00Z",
        tests: [{ label: "HRV 42", status: "passed" }],
    }), /privacy-safe/);
    await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
        executionRoot: input.executionRoot,
        sessionId: SESSION_ID,
        generatedAt: "2026-07-30T18:04:00Z",
    });
    const privateReport = await (0, promises_1.readFile)(node_path_1.default.join(input.executionRoot, "sessions", SESSION_ID, "report.html"), "utf8");
    strict_1.default.doesNotMatch(privateReport, /private-owner|secret\.txt/);
    strict_1.default.match(privateReport, /Returned narrative text was excluded because it crossed the privacy-safe report boundary/);
});
