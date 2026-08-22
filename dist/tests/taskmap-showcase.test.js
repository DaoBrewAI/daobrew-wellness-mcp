"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const agent_execution_receipts_js_1 = require("../src/engine/taskmap/agent-execution-receipts.js");
const body_context_js_1 = require("../src/engine/taskmap/body-context.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const local_approval_package_js_1 = require("../src/engine/taskmap/local-approval-package.js");
const local_completion_cli_js_1 = require("../src/engine/taskmap/local-completion-cli.js");
const native_current_work_successor_js_1 = require("../src/engine/taskmap/native-current-work-successor.js");
const ready_frontier_js_1 = require("../src/engine/taskmap/ready-frontier.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const showcase_source_js_1 = require("../src/engine/taskmap/showcase-source.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const temporaryRoots = [];
const SHOWCASE_SESSION_ID = "b8a710d2-1acf-4f22-8a5e-3e43235a04d0";
const SHOWCASE_CONFIRMED_HOME = (0, confirmed_owner_js_1.confirmedTestOwner)("showcase-owner").homeDirectory;
function writeShowcaseAdapterPreflight(packagePath, executionPackage) {
    const adapter = "codex";
    const corePreflightDigest = "d".repeat(64);
    const corePreflightId = `tmhandoffpreflight_${corePreflightDigest}`;
    const workspaceBindingDigest = "e".repeat(64);
    const runtimeCore = {
        contractVersion: "taskmap-agent-adapter-runtime-request.v1",
        adapter,
        operation: "create_fresh_codex_task",
        taskMode: "fresh",
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
    const preflight = {
        ...core,
        adapterPreflightId: `tmadapterpreflight_${adapterPreflightDigest}`,
        adapterPreflightDigest,
    };
    const artifactPath = node_path_1.default.join(node_path_1.default.dirname(packagePath), `adapter-preflight_${preflight.adapterPreflightId}.json`);
    (0, node_fs_1.writeFileSync)(artifactPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(preflight), { mode: 0o600 });
    (0, node_fs_1.chmodSync)(artifactPath, 0o600);
    return preflight;
}
function writeSimulatedCodexCliReturnFixture(artifactPath) {
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
    (0, node_child_process_1.execFileSync)(process.execPath, [
        "-e",
        "require('node:fs').writeFileSync(process.argv[1], process.argv[2], {mode: 0o600})",
        artifactPath,
        artifact,
    ]);
}
function temporaryRoot(label) {
    const parent = node_path_1.default.join(process.cwd(), ".taskmap-showcase-tests");
    (0, node_fs_1.mkdirSync)(parent, { recursive: true, mode: 0o700 });
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join(parent, `${label}-`)));
    temporaryRoots.push(root);
    return root;
}
(0, node_test_1.afterEach)(() => {
    for (const root of temporaryRoots.splice(0)) {
        const parent = node_path_1.default.dirname(root);
        strict_1.default.equal(node_path_1.default.basename(parent), ".taskmap-showcase-tests");
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
(0, node_test_1.describe)("privacy-safe Task Map showcase", () => {
    (0, node_test_1.it)("is deterministic, source-backed, approval-ready, and exactly 3/4 current", () => {
        const first = (0, showcase_source_js_1.buildTaskMapShowcaseSource)();
        const second = (0, showcase_source_js_1.buildTaskMapShowcaseSource)();
        strict_1.default.deepEqual(second, first);
        strict_1.default.equal(first.input.generatedAt, showcase_source_js_1.SHOWCASE_FIXED_NOW);
        strict_1.default.deepEqual(first.sourceStates, [
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
            strict_1.default.equal(serialized.includes(forbidden), false, forbidden);
        }
        const projection = (0, harness_js_1.buildTaskMapProjection)(first.input, first.brain, {
            arm: "E4",
            now: showcase_source_js_1.SHOWCASE_FIXED_NOW,
        });
        const repeated = (0, harness_js_1.buildTaskMapProjection)(first.input, first.brain, {
            arm: "E4",
            now: showcase_source_js_1.SHOWCASE_FIXED_NOW,
        });
        strict_1.default.equal(projection.runStatus, "accepted");
        strict_1.default.deepEqual(projection.rejections, []);
        strict_1.default.equal(projection.roots.length, 3);
        strict_1.default.equal(projection.tasks.length, 10);
        const selectedRoot = projection.roots.find((root) => root.title === "Make the local Task Map trustworthy end to end");
        strict_1.default.ok(selectedRoot);
        strict_1.default.equal(selectedRoot.taskIds.length, 4);
        strict_1.default.deepEqual(repeated.roots.map((root) => root.id), projection.roots.map((root) => root.id));
        strict_1.default.deepEqual(repeated.tasks.map((task) => task.id), projection.tasks.map((task) => task.id));
        strict_1.default.ok(projection.tasks.every((task) => task.citations.length > 0));
        const sourceBacked = projection.tasks.filter((task) => (task.reviewState === "accepted"
            && task.openState === "open"
            && task.authority !== "none"
            && task.returnRoute.requiresApproval));
        strict_1.default.equal(sourceBacked.length, 7);
        strict_1.default.equal(sourceBacked.filter((task) => task.title === "Complete the showcase loop").length, 1);
        const body = (0, body_context_js_1.buildTaskMapBodyContextDisclosure)(first.input, projection, first.bodyContext);
        strict_1.default.equal(body.projectionRunId, projection.runId);
        strict_1.default.ok(body.nodes.length > 0);
        strict_1.default.deepEqual(body.privacy, {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
        });
    });
    (0, node_test_1.it)("publishes strict projection/currentness plus both sidecars through native refresh", async () => {
        const ownerRoot = temporaryRoot("publication");
        const result = await (0, showcase_source_js_1.publishTaskMapShowcase)({
            ownerRoot,
            homeDirectory: SHOWCASE_CONFIRMED_HOME,
        });
        strict_1.default.equal(result.refresh.refreshStatus, "published");
        strict_1.default.equal(result.refresh.publicationVerified, true);
        strict_1.default.equal(result.refresh.sourceStatuses.filter((status) => status.state === "current").length, 3);
        strict_1.default.deepEqual(result.refresh.sourceStatuses.map(({ source, state }) => ({
            source,
            state,
        })), (0, showcase_source_js_1.buildTaskMapShowcaseSource)().sourceStates);
        const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
        const projectionPath = node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json");
        const currentnessPath = node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json");
        const currentWorkPath = node_path_1.default.join(taskMapRoot, "taskmap-current-work.v1.json");
        const readyProofTargetsPath = node_path_1.default.join(taskMapRoot, "taskmap-ready-proof-targets.v1.json");
        const bodyPath = node_path_1.default.join(taskMapRoot, "taskmap-body-context.v1.json");
        const bodyAssessmentPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment);
        const projection = JSON.parse((0, node_fs_1.readFileSync)(projectionPath, "utf8"));
        const currentness = JSON.parse((0, node_fs_1.readFileSync)(currentnessPath, "utf8"));
        const currentWorkBytes = (0, node_fs_1.readFileSync)(currentWorkPath);
        const currentWork = JSON.parse(currentWorkBytes.toString("utf8"));
        const body = JSON.parse((0, node_fs_1.readFileSync)(bodyPath, "utf8"));
        strict_1.default.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), []);
        strict_1.default.equal(projection.runStatus, "accepted");
        strict_1.default.equal(currentness.projectionDigest, (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest);
        strict_1.default.equal(currentWorkBytes.toString("utf8"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(currentWork));
        strict_1.default.doesNotThrow(() => (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(currentWork, currentWorkBytes, projection, currentness));
        const readyProofTargets = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(JSON.parse((0, node_fs_1.readFileSync)(readyProofTargetsPath, "utf8")), projection, currentness);
        strict_1.default.deepEqual(readyProofTargets.proofTargets.map((target) => target.taskId), [currentWork.nextTaskToProve.taskId]);
        strict_1.default.equal(body.projectionRunId, projection.runId);
        strict_1.default.equal(body.projectionInputDigest, projection.inputDigest);
        strict_1.default.ok(body.nodes.length > 0);
        const approval = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
            ownerRoot,
            taskMapRoot,
        });
        strict_1.default.equal(approval.response.status, "ready_for_approval");
        strict_1.default.equal(approval.inspection.readyForLocalApproval, true);
        strict_1.default.equal(approval.inspection.task.outcome, "Complete the showcase loop with a signed app and retained receipts.");
        for (const artifactPath of [
            projectionPath,
            currentnessPath,
            currentWorkPath,
            readyProofTargetsPath,
            bodyPath,
            bodyAssessmentPath,
        ]) {
            strict_1.default.equal((0, node_fs_1.lstatSync)(artifactPath).isSymbolicLink(), false);
            strict_1.default.equal((0, node_fs_1.lstatSync)(artifactPath).mode & 0o777, 0o600);
        }
    });
    (0, node_test_1.it)("requires an absolute symlink-free root outside normal owner state", () => {
        strict_1.default.throws(() => (0, showcase_source_js_1.resolveTaskMapShowcaseOwnerRoot)("relative/showcase"), /absolute isolated owner root/);
        const normalRoot = node_path_1.default.join((0, node_os_1.homedir)(), "Library", "Application Support", "DaoBrew");
        strict_1.default.throws(() => (0, showcase_source_js_1.resolveTaskMapShowcaseOwnerRoot)(normalRoot), /normal owner root/);
        const realRoot = temporaryRoot("real");
        const symlinkParent = temporaryRoot("symlink-parent");
        const symlinkRoot = node_path_1.default.join(symlinkParent, "showcase-link");
        (0, node_fs_1.symlinkSync)(realRoot, symlinkRoot);
        strict_1.default.throws(() => (0, showcase_source_js_1.resolveTaskMapShowcaseOwnerRoot)(symlinkRoot), /symlink-free/);
    });
    (0, node_test_1.it)("CLI refuses missing/unsafe roots and publishes only to an explicit valid root", () => {
        const script = node_path_1.default.resolve("scripts/taskmap-showcase.mjs");
        strict_1.default.throws(() => (0, node_child_process_1.execFileSync)(process.execPath, [script], { encoding: "utf8" }), /--owner-root is required/);
        strict_1.default.throws(() => (0, node_child_process_1.execFileSync)(process.execPath, [script, "--owner-root", "relative/showcase"], { encoding: "utf8" }), /absolute isolated owner root/);
        const ownerRoot = temporaryRoot("cli");
        (0, node_fs_1.chmodSync)(ownerRoot, 0o700);
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [script, "--owner-root", ownerRoot], {
            encoding: "utf8",
            env: { ...process.env, HOME: SHOWCASE_CONFIRMED_HOME },
        });
        const summary = JSON.parse(output);
        strict_1.default.deepEqual(summary, {
            status: "ok",
            refreshStatus: "published",
            currentSources: 3,
            totalSources: 4,
        });
    });
    (0, node_test_1.it)("simulates a codex_cli return, then reports, closes, and prunes while retaining contract evidence", async () => {
        const ownerRoot = temporaryRoot("execution-loop");
        await (0, showcase_source_js_1.publishTaskMapShowcase)({
            ownerRoot,
            homeDirectory: SHOWCASE_CONFIRMED_HOME,
        });
        const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
        const localExecutionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
        const agentExecutionRoot = node_path_1.default.join(ownerRoot, "taskmap-agent-execution");
        const workspacePath = node_path_1.default.join(ownerRoot, "showcase-workspace");
        (0, node_fs_1.mkdirSync)(workspacePath, { mode: 0o700 });
        const projectionPath = node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection);
        const projectionBefore = (0, node_fs_1.readFileSync)(projectionPath);
        const approval = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
            ownerRoot,
            taskMapRoot,
        });
        const prepared = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
            ownerRoot,
            taskMapRoot,
            executionRoot: localExecutionRoot,
            expectedOwnerScopeDigest: approval.inspection.localOwnerScopeDigest,
            expectedProofDigest: approval.inspection.proofDigest,
            taskId: approval.inspection.task.taskId,
            idempotencyKey: approval.inspection.prepareIdempotencyKey,
            authorizedAt: "2026-07-31T12:02:00.000Z",
        });
        strict_1.default.equal(prepared.response.status, "package_ready");
        strict_1.default.equal(prepared.package.task.taskId, approval.inspection.task.taskId);
        strict_1.default.equal(prepared.package.executionBoundary.taskStarted, false);
        const packagePath = prepared.response.artifactAccess?.packagePath;
        strict_1.default.ok(packagePath);
        const adapterPreflight = writeShowcaseAdapterPreflight(packagePath, prepared.package);
        const started = await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
        strict_1.default.equal(started.receipt.packageDigest, prepared.package.packageDigest);
        const artifactRelativePath = "artifacts/result.md";
        const artifactPath = node_path_1.default.join(agentExecutionRoot, "sessions", SHOWCASE_SESSION_ID, artifactRelativePath);
        writeSimulatedCodexCliReturnFixture(artifactPath);
        const finished = await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionFinish)({
            executionRoot: agentExecutionRoot,
            sessionId: SHOWCASE_SESSION_ID,
            finishedAt: "2026-07-31T12:04:00.000Z",
            exit: { kind: "code", code: 0 },
        });
        const delivered = await (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
            executionRoot: agentExecutionRoot,
            sessionId: SHOWCASE_SESSION_ID,
            recordedAt: "2026-07-31T12:05:00.000Z",
            artifactRelativePaths: [artifactRelativePath],
        });
        const reported = await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
            executionRoot: agentExecutionRoot,
            sessionId: SHOWCASE_SESSION_ID,
            generatedAt: "2026-07-31T12:06:00.000Z",
            tests: [{
                    label: "Simulated codex_cli receipt path (no process launched)",
                    status: "passed",
                }],
        });
        strict_1.default.equal(delivered.receipt.finishReceiptDigest, finished.receipt.finishReceiptDigest);
        strict_1.default.equal(reported.receipt.artifactReceiptDigest, delivered.receipt.artifactReceiptDigest);
        const inspection = await (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(agentExecutionRoot, SHOWCASE_SESSION_ID);
        strict_1.default.equal(inspection.progressState, "report_ready");
        strict_1.default.equal(inspection.taskId, approval.inspection.task.taskId);
        strict_1.default.equal(inspection.sourceWritebackAttempted, false);
        const reviewSummary = await (0, agent_execution_receipts_js_1.summarizeTaskMapAgentExecutionForReview)(agentExecutionRoot, SHOWCASE_SESSION_ID);
        strict_1.default.equal(reviewSummary.reviewState, "awaiting_review");
        strict_1.default.equal(reviewSummary.reportShape, "change_walkthrough");
        const completionDependencies = {
            environment: {
                [local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
            },
        };
        const commonCompletionArgs = [
            "--test-owner-root", ownerRoot,
            "--task-id", approval.inspection.task.taskId,
            "--session-id", SHOWCASE_SESSION_ID,
            "--decided-at", "2026-07-31T12:07:00.000Z",
        ];
        const review = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["review", ...commonCompletionArgs], completionDependencies);
        strict_1.default.equal(review.status, "awaiting_review");
        const closed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...commonCompletionArgs], completionDependencies);
        strict_1.default.equal(closed.status, "closed_in_daobrew");
        strict_1.default.deepEqual(closed.closedTaskIds, [approval.inspection.task.taskId]);
        const overlay = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(localExecutionRoot, "completion-overlay.v1.json"), "utf8"));
        strict_1.default.ok(overlay.prunedNodeIds.includes(approval.inspection.task.taskId));
        strict_1.default.equal(overlay.activeGraph.nodes.some((node) => node.nodeId === approval.inspection.task.taskId), false);
        strict_1.default.equal(overlay.completionHistory.length, 1);
        strict_1.default.deepEqual((0, node_fs_1.readFileSync)(projectionPath), projectionBefore);
        for (const retainedPath of [
            packagePath,
            artifactPath,
            node_path_1.default.join(agentExecutionRoot, "sessions", SHOWCASE_SESSION_ID, "report.md"),
            node_path_1.default.join(agentExecutionRoot, "sessions", SHOWCASE_SESSION_ID, "report.html"),
        ]) {
            strict_1.default.equal((0, node_fs_1.lstatSync)(retainedPath).isFile(), true);
        }
    });
});
