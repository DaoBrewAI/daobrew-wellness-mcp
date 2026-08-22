"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const local_completion_cli_js_1 = require("../src/engine/taskmap/local-completion-cli.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const ready_frontier_js_1 = require("../src/engine/taskmap/ready-frontier.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const digest = (character) => character.repeat(64);
const OWNER_SCOPE = digest("a");
const TASK_ID = "tmt_complete_loop";
const ROOT_ID = "tmr_taskmap_product";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const GENERATED_AT = "2026-07-30T08:00:00.000Z";
const DECIDED_AT = "2026-07-30T08:04:00.000Z";
const POLICY_PRIMARY_TASK_ID = "tmt_f000000000000001";
const POLICY_SECONDARY_TASK_ID = "tmt_a000000000000001";
const POLICY_ROOT_ID = "tmr_9000000000000001";
const POLICY_PRIMARY_POINTER_ID = "linear-policy-primary";
const POLICY_SECONDARY_POINTER_ID = "linear-policy-secondary";
const CLOSED_EXECUTION_BINDING_VECTOR = {
    closeDecisionId: `tmlocalclose_${digest("1")}`,
    taskId: "tmt_binding_vector",
    rootId: "tmr_binding_vector",
    sessionId: "11111111-1111-4111-8111-111111111111",
    packageId: `tmlocalpackage_${digest("2")}`,
    packageDigest: digest("2"),
    workspaceBindingDigest: digest("3"),
    launchedAdapter: "codex_cli",
    startedAt: "2026-08-02T12:00:00.000Z",
    finishedAt: "2026-08-02T12:05:00.000Z",
    artifactCount: 2,
    artifactReceiptDigest: digest("4"),
    reportReceiptDigest: digest("5"),
    reportRelativePaths: ["report.md", "report.html"],
};
const CLOSED_EXECUTION_BINDING_VECTOR_DIGEST = "dbf82efdf21e2e6e538d9ef63f9a3b602a591d04bd94fbde21d6c54eac116a86";
function strictEmptyProofProjection() {
    const taskId = "tmt_0000000000000001";
    const rootId = "tmr_1000000000000001";
    const pointerId = "linear-owner-home";
    const zeroScore = {
        sourcePriority: 0,
        deadlinePressure: 0,
        dependencyImpact: 0,
        recurrence: 0,
        staleOpen: 0,
        evidenceStrength: 0,
        bodyBonus: 0,
        total: 0,
    };
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: harness_js_1.TASKMAP_ALGORITHM_POLICY_DIGEST,
        runStatus: "accepted",
        arm: "E4",
        runId: "tmrun_empty_proof_test",
        generatedAt: "2026-08-02T11:00:00.000Z",
        inputDigest: digest("d"),
        brain: null,
        sources: [{
                id: pointerId,
                sourceKind: "linear",
                sourceVersion: "linear-owner-snapshot.1",
                authority: "source_system",
                syncMode: "writeback",
                capabilities: ["read_task", "update_status"],
            }],
        roots: [{
                id: rootId,
                title: "Owner work",
                summary: "Accepted owner work.",
                taskIds: [taskId],
                memberObjectRefs: ["object-owner-work"],
                citations: [{
                        eventId: "root-event-owner-work",
                        pointerId,
                        sourceKind: "linear",
                        sourceRefHash: digest("b"),
                        occurredAt: "2026-08-01T12:00:00.000Z",
                        extractionConfidence: 1,
                    }],
                causalGrade: "C0_NO_DATA",
                bodyContextCount: 0,
                scoreBreakdown: {
                    maxChildActionability: 0,
                    rootRecurrence: 0,
                    evidenceStrength: 0,
                    sourceBreadth: 0,
                    actionableLoad: 0,
                    dependencyBreadth: 0,
                    bodyBonus: 0,
                    total: 0,
                },
                score: 0,
                whyNow: [],
            }],
        tasks: [{
                id: taskId,
                rootId,
                title: "Owner task",
                summary: "Bounded owner work.",
                reviewState: "accepted",
                openState: "open",
                authority: "source_system",
                taskHomePointerId: pointerId,
                originPointerIds: [pointerId],
                returnRoute: {
                    state: "source_owned",
                    pointerId,
                    requiresApproval: true,
                },
                sourceStatus: "open",
                citations: [{
                        eventId: "event-owner-task",
                        pointerId,
                        sourceKind: "linear",
                        sourceRefHash: digest("a"),
                        occurredAt: "2026-08-01T12:00:00.000Z",
                        extractionConfidence: 1,
                    }],
                score: zeroScore,
                whyNow: [],
                discoveredBy: ["linear"],
                bodyContextCount: 0,
            }],
        edges: [],
        rejections: [],
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
}
(0, node_test_1.it)("resolves product completion storage from the confirmed owner only", () => {
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("local-completion-product-owner");
    const unscopedApplicationSupportRoot = node_path_1.default.join(owner.homeDirectory, "Library", "Application Support", "DaoBrew");
    const expectedOwnerRoot = node_path_1.default.join(unscopedApplicationSupportRoot, "owners", owner.ownerScopeDigest);
    const parsed = (0, local_completion_cli_js_1.parseTaskMapLocalCompletionCliArguments)(["inspect-overlay"], {
        homeDirectory: owner.homeDirectory,
        environment: { DAOBREW_USER_ID: owner.userId },
    });
    strict_1.default.equal(owner.ownerRoot, expectedOwnerRoot);
    strict_1.default.equal(parsed.roots.ownerRoot, expectedOwnerRoot);
    strict_1.default.notEqual(parsed.roots.ownerRoot, unscopedApplicationSupportRoot);
    strict_1.default.equal(parsed.roots.taskMapRoot, node_path_1.default.join(expectedOwnerRoot, "taskmap"));
    strict_1.default.equal(parsed.roots.decisionsRoot, node_path_1.default.join(expectedOwnerRoot, "taskmap-local-execution", "completion-decisions"));
    strict_1.default.throws(() => (0, local_completion_cli_js_1.parseTaskMapLocalCompletionCliArguments)(["inspect-overlay"], {
        homeDirectory: owner.homeDirectory,
        environment: {
            DAOBREW_USER_ID: "00000000-0000-4000-8000-000000000000",
        },
    }), /Task Map local completion CLI unavailable/);
});
(0, node_test_1.it)("preserves empty stdout and exit status without echoing invalid argv", () => {
    const entrypoint = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/local-completion-cli.js");
    const unreflectedArgument = "PRIVATE_LOCAL_COMPLETION_ARGUMENT";
    const result = (0, node_child_process_1.spawnSync)(process.execPath, [entrypoint, unreflectedArgument], {
        cwd: process.cwd(),
        encoding: "utf8",
    });
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.stdout, "");
    strict_1.default.match(result.stderr, /^taskmap-local-completion: unavailable\nError: Task Map local completion CLI unavailable/m);
    strict_1.default.match(result.stderr, /at fail/);
    strict_1.default.equal(result.stderr.includes(unreflectedArgument), false);
});
(0, node_test_1.it)("quarantines a private legacy terminal overlay instead of exposing an empty fresh-owner lifecycle", async () => {
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("local-completion-legacy-terminal-quarantine");
    const legacyExecutionRoot = node_path_1.default.join(owner.homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap-local-execution");
    const legacyOverlayPath = node_path_1.default.join(legacyExecutionRoot, "completion-overlay.v1.json");
    const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
    await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    await (0, promises_1.mkdir)(legacyExecutionRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(legacyExecutionRoot, 0o700);
    await (0, promises_1.writeFile)(legacyOverlayPath, legacyBytes, { mode: 0o600 });
    try {
        await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay"], {
            homeDirectory: owner.homeDirectory,
            environment: { DAOBREW_USER_ID: owner.userId },
        }), (error) => (error instanceof Error
            && error.name === "TaskMapLegacyLocalStateQuarantineError"
            && error.code
                === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"));
        strict_1.default.deepEqual(await (0, promises_1.readFile)(legacyOverlayPath), legacyBytes);
        await strict_1.default.rejects((0, promises_1.lstat)(node_path_1.default.join(owner.ownerRoot, "taskmap-local-execution")), { code: "ENOENT" });
    }
    finally {
        await (0, promises_1.rm)(legacyExecutionRoot, { recursive: true, force: true });
        await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    }
});
(0, node_test_1.it)("does not treat an unrelated owner decision as proof that all legacy terminal state migrated", async () => {
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("local-completion-mixed-legacy-terminal-quarantine");
    const ownerDecisionsRoot = node_path_1.default.join(owner.ownerRoot, "taskmap-local-execution", "completion-decisions");
    const ownerDecisionPath = node_path_1.default.join(ownerDecisionsRoot, "owner-close.json");
    const legacyExecutionRoot = node_path_1.default.join(owner.homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap-local-execution");
    const legacyDecisionsRoot = node_path_1.default.join(legacyExecutionRoot, "completion-decisions");
    const legacyDecisionPath = node_path_1.default.join(legacyDecisionsRoot, "unattributed-legacy-close.json");
    const ownerBytes = Buffer.from("{\"ownerTerminal\":true}\n", "utf8");
    const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
    await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    await (0, promises_1.mkdir)(ownerDecisionsRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(node_path_1.default.join(owner.ownerRoot, "taskmap-local-execution"), 0o700);
    await (0, promises_1.chmod)(ownerDecisionsRoot, 0o700);
    await (0, promises_1.writeFile)(ownerDecisionPath, ownerBytes, { mode: 0o600 });
    await (0, promises_1.mkdir)(legacyDecisionsRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(legacyExecutionRoot, 0o700);
    await (0, promises_1.chmod)(legacyDecisionsRoot, 0o700);
    await (0, promises_1.writeFile)(legacyDecisionPath, legacyBytes, { mode: 0o600 });
    try {
        await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay"], {
            homeDirectory: owner.homeDirectory,
            environment: { DAOBREW_USER_ID: owner.userId },
        }), (error) => (error instanceof Error
            && error.name === "TaskMapLegacyLocalStateQuarantineError"
            && error.code
                === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"));
        strict_1.default.deepEqual(await (0, promises_1.readFile)(ownerDecisionPath), ownerBytes);
        strict_1.default.deepEqual(await (0, promises_1.readFile)(legacyDecisionPath), legacyBytes);
    }
    finally {
        await (0, promises_1.rm)(legacyExecutionRoot, { recursive: true, force: true });
        await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    }
});
(0, node_test_1.it)("does not synthesize a singleton ready leaf when proof targets are missing", async () => {
    const value = await fixture();
    let approvalInspections = 0;
    const currentProjection = strictEmptyProofProjection();
    const currentTaskId = currentProjection.tasks[0].id;
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, currentProjection).currentProjectionDigest;
    try {
        const response = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], {
            ...value.dependencies,
            inspectLifecycleContext: async () => ({
                projection: currentProjection,
                currentness: {
                    contractVersion: "taskmap-native-currentness-gate.v1",
                    runId: currentProjection.runId,
                    inputDigest: currentProjection.inputDigest,
                    projectionDigest,
                    taskDispositions: [{
                            taskId: currentTaskId,
                            disposition: "current",
                        }],
                },
                localOwnerScopeDigest: OWNER_SCOPE,
                projectionFileDigest: digest("7"),
                currentnessFileDigest: digest("8"),
            }),
            inspectOperationalContext: async () => {
                approvalInspections += 1;
                throw new Error("Current Work must not grant readiness");
            },
            loadPredecessorEvidence: async () => ({
                binding: {
                    runId: currentProjection.runId,
                    inputDigest: currentProjection.inputDigest,
                    projectionDigest,
                    projectionFileDigest: digest("7"),
                    currentnessFileDigest: digest("8"),
                },
                taskMapInput: {
                    pointers: [],
                    events: [],
                },
            }),
        });
        strict_1.default.deepEqual(response.readyTaskIds, []);
        strict_1.default.deepEqual(response.readyProofTargets, []);
        strict_1.default.equal(approvalInspections, 0);
    }
    finally {
        await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
    }
});
function approvedPackage(options = {}) {
    const core = {
        contractVersion: "taskmap-local-execution-package.v1",
        approvalAuthorizationId: `tmlocalauthorization_${digest("5")}`,
        approvalAuthorizationDigest: digest("5"),
        localOwnerScopeDigest: OWNER_SCOPE,
        proofDigest: digest("6"),
        quartet: {
            runId: options.runId ?? "tmrun_completion",
            inputDigest: options.inputDigest ?? digest("b"),
            generatedAt: options.generatedAt ?? GENERATED_AT,
            projectionDigest: options.projectionDigest ?? digest("c"),
            projectionFileDigest: options.projectionFileDigest ?? digest("7"),
            currentnessFileDigest: options.currentnessFileDigest ?? digest("8"),
            currentWorkFileDigest: digest("9"),
            bodyFileDigest: digest("0"),
            bodyAssessmentFileDigest: digest("a"),
            bodyAssessmentArtifactDigest: digest("b"),
            physiologicalSnapshotDigest: digest("c"),
            currentWorkArtifactDigest: digest("d"),
        },
        task: {
            taskId: options.taskId ?? TASK_ID,
            rootId: options.rootId ?? ROOT_ID,
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
function projection(taskId = TASK_ID, sourceVersion = "revision-1", generatedAt = GENERATED_AT) {
    return {
        contractVersion: "taskmap.v1",
        runId: "tmrun_completion",
        inputDigest: digest("b"),
        generatedAt,
        roots: [{
                id: ROOT_ID,
                title: "Task Map product",
                taskIds: [taskId],
            }],
        tasks: [{
                id: taskId,
                rootId: ROOT_ID,
                title: "Complete the loop",
                reviewState: "accepted",
                openState: "open",
                taskHomePointerId: "ptr-strategy-taskmap-product-prototype",
                originPointerIds: [
                    "ptr-codex-complete-loop",
                    "ptr-strategy-taskmap-product-prototype",
                ],
                citations: [{
                        eventId: "event-strategy-taskmap-product-prototype",
                        pointerId: "ptr-strategy-taskmap-product-prototype",
                        sourceKind: "strategy",
                        sourceRefHash: digest("e"),
                        occurredAt: "2026-07-30T08:01:00.000Z",
                        extractionConfidence: 1,
                    }],
            }],
        edges: [],
        sources: [{
                id: "ptr-strategy-taskmap-product-prototype",
                sourceKind: "strategy",
                sourceVersion,
            }],
    };
}
function strictMultiReadyProjection() {
    const base = strictEmptyProofProjection();
    const template = base.tasks[0];
    const task = (taskId, pointerId, title) => ({
        ...structuredClone(template),
        id: taskId,
        rootId: POLICY_ROOT_ID,
        title,
        taskHomePointerId: pointerId,
        originPointerIds: [pointerId],
        returnRoute: {
            state: "source_owned",
            pointerId,
            requiresApproval: true,
        },
        citations: [{
                ...structuredClone(template.citations[0]),
                eventId: `event-${taskId}`,
                pointerId,
            }],
    });
    const source = base.sources[0];
    return {
        ...base,
        runId: "tmrun_multi_ready_completion",
        generatedAt: GENERATED_AT,
        inputDigest: digest("b"),
        sources: [
            {
                ...structuredClone(source),
                id: POLICY_PRIMARY_POINTER_ID,
                sourceVersion: "linear-policy-primary.1",
            },
            {
                ...structuredClone(source),
                id: POLICY_SECONDARY_POINTER_ID,
                sourceVersion: "linear-policy-secondary.1",
            },
        ],
        roots: [{
                ...structuredClone(base.roots[0]),
                id: POLICY_ROOT_ID,
                taskIds: [POLICY_PRIMARY_TASK_ID, POLICY_SECONDARY_TASK_ID],
                citations: [{
                        ...structuredClone(base.roots[0].citations[0]),
                        pointerId: POLICY_PRIMARY_POINTER_ID,
                    }],
            }],
        tasks: [
            task(POLICY_PRIMARY_TASK_ID, POLICY_PRIMARY_POINTER_ID, "Policy-ranked primary task"),
            task(POLICY_SECONDARY_TASK_ID, POLICY_SECONDARY_POINTER_ID, "Policy-ranked secondary task"),
        ],
    };
}
function readyProofTarget(projection, taskId) {
    const task = projection.tasks.find((candidate) => candidate.id === taskId);
    const pointerId = task.taskHomePointerId;
    return {
        taskId,
        rootId: task.rootId,
        outcome: `Owner-visible result for ${taskId}.`,
        input: {
            summary: `Bounded input for ${taskId}.`,
            contextPointerIds: [pointerId],
        },
        predecessors: [],
        doneDefinition: [`Verify the bounded result for ${taskId}.`],
        permission: {
            requiresExplicitApproval: true,
            approvalGranted: false,
        },
        returnTarget: {
            state: "source_owned",
            pointerId,
        },
        executable: false,
        approvalPackage: {
            contractVersion: "taskmap-local-approval-inspection.v1",
            readyForLocalApproval: true,
            currentWorkApprovalGranted: false,
            currentWorkExecutable: false,
            authorizationScope: "prepare_local_package_only",
            dispatchAuthorized: false,
            sourceWritebackAuthorized: false,
            codexTaskStartAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
    };
}
async function fixture() {
    const ownerRoot = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-local-completion-cli-")));
    await (0, promises_1.chmod)(ownerRoot, 0o700);
    await (0, promises_1.mkdir)(node_path_1.default.join(ownerRoot, "taskmap"), { mode: 0o700 });
    await (0, promises_1.mkdir)(node_path_1.default.join(ownerRoot, "taskmap-local-execution"), {
        mode: 0o700,
    });
    const packagePath = node_path_1.default.join(ownerRoot, "taskmap-local-execution", "package.json");
    await (0, promises_1.writeFile)(packagePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(approvedPackage()), { mode: 0o600 });
    let currentProjection = projection();
    const lifecycleContext = () => ({
        projection: currentProjection,
        currentness: {
            contractVersion: "taskmap-native-currentness-gate.v1",
            runId: currentProjection.runId,
            inputDigest: currentProjection.inputDigest,
            projectionDigest: digest("c"),
            taskDispositions: [{
                    taskId: currentProjection.tasks[0].id,
                    disposition: "current",
                }],
        },
        localOwnerScopeDigest: OWNER_SCOPE,
        projectionFileDigest: digest("7"),
        currentnessFileDigest: digest("8"),
    });
    const inspectOperationalContext = async () => ({
        inspection: {
            localOwnerScopeDigest: OWNER_SCOPE,
            quartet: {
                projectionFileDigest: digest("7"),
                currentnessFileDigest: digest("8"),
            },
        },
        response: {
            artifactAccess: { packagePath },
        },
        projection: currentProjection,
        currentness: {
            runId: currentProjection.runId,
            inputDigest: currentProjection.inputDigest,
            projectionDigest: digest("c"),
            taskDispositions: [{
                    taskId: currentProjection.tasks[0].id,
                    disposition: "current",
                }],
        },
        context: {},
    });
    const inspectExecution = async () => {
        const executionPackage = approvedPackage();
        return {
            contractVersion: "taskmap-agent-execution-inspection.v1",
            sessionId: SESSION_ID,
            progressState: "report_ready",
            sessionStatus: "finished",
            packageId: executionPackage.packageId,
            packageDigest: executionPackage.packageDigest,
            preflightId: null,
            preflightDigest: null,
            corePreflightId: null,
            corePreflightDigest: null,
            runtimeRequestDigest: null,
            startIdempotencyKey: null,
            taskId: TASK_ID,
            rootId: ROOT_ID,
            workspaceBindingDigest: digest("2"),
            launchedAdapter: "claude_code",
            startedAt: "2026-07-30T08:02:00.000Z",
            finishedAt: "2026-07-30T08:03:00.000Z",
            artifactCount: 1,
            artifactReceiptDigest: digest("3"),
            reportReceiptDigest: digest("4"),
            reportRelativePaths: ["report.md", "report.html"],
            sourceWritebackAttempted: false,
            sourceCompletion: false,
            outcomeVerified: false,
        };
    };
    const dependencies = {
        environment: {
            [local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
        },
        inspectOperationalContext,
        inspectLifecycleContext: async () => lifecycleContext(),
        inspectExecution,
    };
    const common = [
        "--test-owner-root", ownerRoot,
        "--task-id", TASK_ID,
        "--session-id", SESSION_ID,
        "--decided-at", DECIDED_AT,
    ];
    return {
        ownerRoot,
        dependencies,
        common,
        setProjection(value) {
            currentProjection = value;
        },
    };
}
async function multiReadyFixture() {
    const ownerRoot = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-local-completion-multi-ready-")));
    await (0, promises_1.chmod)(ownerRoot, 0o700);
    const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
    const localExecutionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    await (0, promises_1.mkdir)(taskMapRoot, { mode: 0o700 });
    await (0, promises_1.mkdir)(localExecutionRoot, { mode: 0o700 });
    const projection = strictMultiReadyProjection();
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const currentness = {
        contractVersion: "taskmap-native-currentness-gate.v1",
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest,
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: "current",
        })),
    };
    const proofTargets = [
        readyProofTarget(projection, POLICY_PRIMARY_TASK_ID),
        readyProofTarget(projection, POLICY_SECONDARY_TASK_ID),
    ];
    const published = (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
        projection,
        currentness,
        proofTargets,
    });
    await (0, promises_1.writeFile)(node_path_1.default.join(taskMapRoot, "taskmap-ready-proof-targets.v1.json"), (0, source_contracts_js_1.taskMapContractCanonicalJson)(published), { mode: 0o600 });
    const projectionFileDigest = digest("7");
    const currentnessFileDigest = digest("8");
    const selectedPackage = approvedPackage({
        taskId: POLICY_SECONDARY_TASK_ID,
        rootId: POLICY_ROOT_ID,
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        generatedAt: projection.generatedAt,
        projectionDigest,
        projectionFileDigest,
        currentnessFileDigest,
    });
    const packagePath = node_path_1.default.join(localExecutionRoot, "secondary-local-approval-package.json");
    await (0, promises_1.writeFile)(packagePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(selectedPackage), { mode: 0o600 });
    const approvalTaskIds = [];
    const executionInspection = {
        contractVersion: "taskmap-agent-execution-inspection.v1",
        sessionId: SESSION_ID,
        progressState: "report_ready",
        sessionStatus: "finished",
        packageId: selectedPackage.packageId,
        packageDigest: selectedPackage.packageDigest,
        preflightId: null,
        preflightDigest: null,
        corePreflightId: null,
        corePreflightDigest: null,
        runtimeRequestDigest: null,
        startIdempotencyKey: null,
        taskId: POLICY_SECONDARY_TASK_ID,
        rootId: POLICY_ROOT_ID,
        workspaceBindingDigest: digest("2"),
        launchedAdapter: "claude_code",
        startedAt: "2026-07-30T08:02:00.000Z",
        finishedAt: "2026-07-30T08:03:00.000Z",
        artifactCount: 1,
        artifactReceiptDigest: digest("3"),
        reportReceiptDigest: digest("4"),
        reportRelativePaths: ["report.md", "report.html"],
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
    };
    const dependencies = {
        environment: {
            [local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV]: "1",
        },
        inspectLifecycleContext: async () => ({
            projection,
            currentness,
            localOwnerScopeDigest: OWNER_SCOPE,
            projectionFileDigest,
            currentnessFileDigest,
        }),
        loadPredecessorEvidence: async (input) => {
            strict_1.default.equal(input.homeDirectory, ownerRoot);
            return {
                binding: {
                    runId: projection.runId,
                    inputDigest: projection.inputDigest,
                    projectionDigest,
                    projectionFileDigest,
                    currentnessFileDigest,
                },
                taskMapInput: {
                    pointers: [],
                    events: [
                        {
                            pointerId: POLICY_PRIMARY_POINTER_ID,
                            deadlineAt: "2026-07-30T09:00:00.000Z",
                        },
                        {
                            pointerId: POLICY_SECONDARY_POINTER_ID,
                            deadlineAt: "2026-08-20T09:00:00.000Z",
                        },
                    ],
                },
            };
        },
        inspectOperationalContext: async (input) => {
            strict_1.default.equal(input.taskMapRoot, taskMapRoot);
            strict_1.default.equal(input.ownerRoot, ownerRoot);
            approvalTaskIds.push(input.taskId);
            return {
                inspection: {
                    localOwnerScopeDigest: OWNER_SCOPE,
                    quartet: {
                        projectionFileDigest,
                        currentnessFileDigest,
                    },
                    task: {
                        taskId: POLICY_SECONDARY_TASK_ID,
                        rootId: POLICY_ROOT_ID,
                    },
                },
                response: {
                    artifactAccess: { packagePath },
                },
                projection,
                currentness,
                context: {},
            };
        },
        inspectExecution: async (executionRoot, sessionId) => {
            strict_1.default.equal(executionRoot, node_path_1.default.join(ownerRoot, "taskmap-agent-execution"));
            strict_1.default.equal(sessionId, SESSION_ID);
            return executionInspection;
        },
    };
    return {
        ownerRoot,
        dependencies,
        approvalTaskIds,
        proofTargets,
        common: [
            "--test-owner-root", ownerRoot,
            "--task-id", POLICY_SECONDARY_TASK_ID,
            "--session-id", SESSION_ID,
            "--decided-at", DECIDED_AT,
        ],
    };
}
(0, node_test_1.describe)("Task Map local completion CLI", () => {
    (0, node_test_1.it)("treats an absent local-execution root as empty history in overlay reads", async () => {
        const value = await fixture();
        try {
            await (0, promises_1.rm)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution"), {
                recursive: true,
                force: true,
            });
            const overlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.equal(overlay.status, "overlay");
            strict_1.default.deepEqual(overlay.closedTaskIds, []);
            strict_1.default.deepEqual(overlay.closedExecutionHistory, []);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fits the maximum sealed history inside the bounded response envelope", async () => {
        const value = await fixture();
        try {
            const overlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            const maximumHistory = Array.from({ length: local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS }, (_, index) => {
                const closeDecisionDigest = index.toString(16).padStart(64, "0");
                return {
                    taskId: `tmt_${index.toString(16).padStart(4, "0")}${"t".repeat(24)}`,
                    rootId: `tmr_${"r".repeat(256)}`,
                    sessionId: `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`,
                    closeDecisionId: `tmlocalclose_${closeDecisionDigest}`,
                    closeDecisionDigest,
                    closedAt: new Date(Date.parse(DECIDED_AT) - index * 1_000).toISOString(),
                    projectionDigest: digest("c"),
                };
            });
            const output = (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...overlay,
                closedExecutionHistory: maximumHistory,
            });
            strict_1.default.ok(Buffer.byteLength(output, "utf8")
                <= local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...overlay,
                closedExecutionHistory: [
                    ...maximumHistory,
                    {
                        ...maximumHistory[0],
                        taskId: `tmt_0100${"t".repeat(24)}`,
                        sessionId: "11111111-1111-4111-8111-000000000100",
                        closeDecisionId: `tmlocalclose_${digest("f")}`,
                        closeDecisionDigest: digest("f"),
                        closedAt: new Date(Date.parse(DECIDED_AT)
                            - local_completion_cli_js_1.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS * 1_000).toISOString(),
                    },
                ],
            }), /Task Map local completion CLI unavailable/);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("quarantines a legacy-overlap task without attributing it to the current owner", async () => {
        const value = await multiReadyFixture();
        const dependencies = {
            ...value.dependencies,
            legacyQuarantinedTaskIdsForTest: [POLICY_PRIMARY_TASK_ID],
        };
        try {
            const overlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], dependencies);
            // The legacy terminal is not current-owner terminal authority, and it
            // cannot relight itself or unlock another executable leaf.
            strict_1.default.deepEqual(overlay.closedTaskIds, []);
            strict_1.default.deepEqual(overlay.closedExecutionHistory, []);
            strict_1.default.deepEqual(overlay.completedElsewhereTaskIds, []);
            strict_1.default.deepEqual(overlay.conflictedTaskIds, []);
            strict_1.default.deepEqual(overlay.terminalTaskIds, []);
            strict_1.default.deepEqual(overlay.readyTaskIds, []);
            strict_1.default.deepEqual(overlay.readyProofTargets, []);
            strict_1.default.equal(overlay.readyFrontierDigest, null);
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root", value.ownerRoot,
                "--task-id", POLICY_PRIMARY_TASK_ID,
                "--decided-at", DECIDED_AT,
            ], dependencies), (error) => (error instanceof Error
                && error.name === "TaskMapLegacyLocalStateQuarantineError"
                && error.code
                    === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"));
            await strict_1.default.rejects((0, promises_1.lstat)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions")), { code: "ENOENT" });
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preserves non-lexical policy-ranked ready order with exact proof-target validation", async () => {
        const value = await multiReadyFixture();
        try {
            const ranked = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(ranked.readyTaskIds, [
                POLICY_PRIMARY_TASK_ID,
                POLICY_SECONDARY_TASK_ID,
            ]);
            strict_1.default.deepEqual(ranked.readyProofTargets.map((target) => target.taskId), ranked.readyTaskIds);
            const encoded = JSON.parse((0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)(ranked));
            strict_1.default.deepEqual(encoded.readyTaskIds, ranked.readyTaskIds);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...ranked,
                readyProofTargets: [...ranked.readyProofTargets].reverse(),
            }), /Task Map local completion CLI unavailable/);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...ranked,
                readyTaskIds: [
                    POLICY_PRIMARY_TASK_ID,
                    POLICY_PRIMARY_TASK_ID,
                ],
                readyProofTargets: [
                    ranked.readyProofTargets[0],
                    {
                        ...structuredClone(ranked.readyProofTargets[1]),
                        taskId: POLICY_PRIMARY_TASK_ID,
                    },
                ],
            }), /Task Map local completion CLI unavailable/);
            const overlongTaskId = `tmt_${"x".repeat(29)}`;
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...ranked,
                readyTaskIds: [overlongTaskId],
                readyProofTargets: [{
                        ...structuredClone(ranked.readyProofTargets[0]),
                        taskId: overlongTaskId,
                    }],
            }), /Task Map local completion CLI unavailable/);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("reviews and closes a secondary ready leaf through its selected approval context", async () => {
        const value = await multiReadyFixture();
        try {
            const review = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["review", ...value.common], value.dependencies);
            strict_1.default.equal(review.status, "awaiting_review");
            strict_1.default.equal(review.taskId, POLICY_SECONDARY_TASK_ID);
            strict_1.default.equal(review.canClose, true);
            strict_1.default.deepEqual(review.readyTaskIds, [
                POLICY_PRIMARY_TASK_ID,
                POLICY_SECONDARY_TASK_ID,
            ]);
            const closed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            strict_1.default.equal(closed.status, "closed_in_daobrew");
            strict_1.default.equal(closed.taskId, POLICY_SECONDARY_TASK_ID);
            strict_1.default.deepEqual(closed.closedTaskIds, [POLICY_SECONDARY_TASK_ID]);
            strict_1.default.deepEqual(closed.readyTaskIds, [POLICY_PRIMARY_TASK_ID]);
            strict_1.default.deepEqual(value.approvalTaskIds, [
                POLICY_SECONDARY_TASK_ID,
                POLICY_SECONDARY_TASK_ID,
            ]);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("freezes the exact closed-execution binding digest and its tamper vector", () => {
        strict_1.default.equal((0, local_completion_cli_js_1.taskMapLocalCompletionClosedExecutionBindingDigest)(CLOSED_EXECUTION_BINDING_VECTOR), CLOSED_EXECUTION_BINDING_VECTOR_DIGEST);
        const tamperedDigest = (0, local_completion_cli_js_1.taskMapLocalCompletionClosedExecutionBindingDigest)({
            ...CLOSED_EXECUTION_BINDING_VECTOR,
            reportReceiptDigest: digest("6"),
        });
        strict_1.default.equal(tamperedDigest, "10fe7f6cb4b335bf2bf7ef204bcb5592ee11a3e2d0b3d5da74544e7358a39054");
        strict_1.default.notEqual(tamperedDigest, CLOSED_EXECUTION_BINDING_VECTOR_DIGEST);
    });
    (0, node_test_1.it)("persists explicit Close and derives an anti-resurrection overlay", async () => {
        const value = await fixture();
        try {
            const close = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            strict_1.default.equal(close.status, "closed_in_daobrew");
            strict_1.default.deepEqual(close.closedTaskIds, [TASK_ID]);
            strict_1.default.equal(close.closedExecutionBindingDigest, null);
            strict_1.default.equal(close.sourceCompletion, false);
            const decisions = await (0, promises_1.readdir)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions"));
            strict_1.default.equal(decisions.length, 1);
            const bytes = await (0, promises_1.readFile)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions", decisions[0]));
            strict_1.default.match(bytes.toString("utf8"), /"closed_in_daobrew"/);
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
                "--decided-at", "2026-07-30T08:05:00.000Z",
            ], value.dependencies), /active terminal disposition; explicit Reopen is required/);
            strict_1.default.equal((await (0, promises_1.readdir)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions"))).length, 1);
            value.setProjection(projection("tmt_refreshed_alias"));
            const overlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(overlay.closedTaskIds, ["tmt_refreshed_alias"]);
            value.setProjection(projection("tmt_authoritative_revision", "revision-2", "2026-07-30T09:00:00.000Z"));
            const conflict = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(conflict.conflictedTaskIds, ["tmt_authoritative_revision"]);
            strict_1.default.deepEqual(conflict.closedTaskIds, []);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("inspects the exact report-ready execution behind an active closed disposition without writes or current approval", async () => {
        const value = await fixture();
        try {
            const closed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            const localExecutionRoot = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution");
            const decisionsRoot = node_path_1.default.join(localExecutionRoot, "completion-decisions");
            const overlayPath = node_path_1.default.join(localExecutionRoot, "completion-overlay.v1.json");
            const beforeOverlay = await (0, promises_1.stat)(overlayPath);
            const beforeDecisions = await (0, promises_1.readdir)(decisionsRoot);
            let approvalInspections = 0;
            let predecessorLoads = 0;
            let executionInspections = 0;
            const inspected = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], {
                ...value.dependencies,
                inspectOperationalContext: async () => {
                    approvalInspections += 1;
                    throw new Error("historical inspection must not read approval");
                },
                loadPredecessorEvidence: async () => {
                    predecessorLoads += 1;
                    throw new Error("historical inspection must not build frontier");
                },
                inspectExecution: async (executionRoot, sessionId) => {
                    executionInspections += 1;
                    strict_1.default.equal(executionRoot, node_path_1.default.join(value.ownerRoot, "taskmap-agent-execution"));
                    strict_1.default.equal(sessionId, SESSION_ID);
                    return value.dependencies.inspectExecution();
                },
            });
            strict_1.default.equal(inspected.status, "closed_in_daobrew");
            strict_1.default.equal(inspected.taskId, TASK_ID);
            strict_1.default.equal(inspected.rootId, ROOT_ID);
            strict_1.default.equal(inspected.sessionId, SESSION_ID);
            strict_1.default.equal(inspected.closeDecisionId, closed.closeDecisionId);
            const execution = await value.dependencies.inspectExecution();
            strict_1.default.equal(inspected.closedExecutionBindingDigest, (0, local_completion_cli_js_1.taskMapLocalCompletionClosedExecutionBindingDigest)({
                closeDecisionId: closed.closeDecisionId,
                taskId: execution.taskId,
                rootId: execution.rootId,
                sessionId: execution.sessionId,
                packageId: execution.packageId,
                packageDigest: execution.packageDigest,
                workspaceBindingDigest: execution.workspaceBindingDigest,
                launchedAdapter: execution.launchedAdapter,
                startedAt: execution.startedAt,
                finishedAt: execution.finishedAt,
                artifactCount: execution.artifactCount,
                artifactReceiptDigest: execution.artifactReceiptDigest,
                reportReceiptDigest: execution.reportReceiptDigest,
                reportRelativePaths: execution.reportRelativePaths,
            }));
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...inspected,
                status: "overlay",
            }), /Task Map local completion CLI unavailable/);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...inspected,
                closedExecutionBindingDigest: "not-a-digest",
            }), /Task Map local completion CLI unavailable/);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...inspected,
                closedExecutionHistory: [],
            }), /Task Map local completion CLI unavailable/);
            const activeOverlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...activeOverlay,
                closedExecutionHistory: [],
            }), /Task Map local completion CLI unavailable/);
            strict_1.default.equal(inspected.canClose, false);
            strict_1.default.equal(inspected.canKeepOpen, false);
            strict_1.default.deepEqual(inspected.closedTaskIds, [TASK_ID]);
            strict_1.default.deepEqual(inspected.readyTaskIds, []);
            strict_1.default.equal(inspected.readyFrontierDigest, null);
            strict_1.default.equal(inspected.sourceWritebackAttempted, false);
            strict_1.default.equal(inspected.sourceCompletion, false);
            strict_1.default.equal(inspected.outcomeVerified, false);
            strict_1.default.equal(approvalInspections, 0);
            strict_1.default.equal(predecessorLoads, 0);
            strict_1.default.equal(executionInspections, 1);
            strict_1.default.deepEqual(await (0, promises_1.readdir)(decisionsRoot), beforeDecisions);
            const afterOverlay = await (0, promises_1.stat)(overlayPath);
            strict_1.default.equal(afterOverlay.ino, beforeOverlay.ino);
            strict_1.default.equal(afterOverlay.mtimeMs, beforeOverlay.mtimeMs);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps sealed closed execution history inspectable and reopenable after a successor projection omits the task", async () => {
        const value = await fixture();
        try {
            const closed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            const successor = projection("tmt_successor_work", "successor-revision-1", "2026-07-30T08:10:00.000Z");
            const successorPointerId = "ptr-successor-owner-work";
            successor.tasks[0].taskHomePointerId = successorPointerId;
            successor.tasks[0].originPointerIds = [successorPointerId];
            successor.tasks[0].citations = [{
                    ...successor.tasks[0].citations[0],
                    eventId: "event-successor-owner-work",
                    pointerId: successorPointerId,
                }];
            successor.sources[0] = {
                ...successor.sources[0],
                id: successorPointerId,
            };
            value.setProjection(successor);
            const overlay = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(overlay.closedTaskIds, []);
            strict_1.default.deepEqual(overlay.terminalTaskIds, []);
            strict_1.default.deepEqual(overlay.closedExecutionHistory, [{
                    taskId: TASK_ID,
                    rootId: ROOT_ID,
                    sessionId: SESSION_ID,
                    closeDecisionId: closed.closeDecisionId,
                    closeDecisionDigest: closed.closeDecisionId.slice("tmlocalclose_".length),
                    closedAt: DECIDED_AT,
                    projectionDigest: digest("c"),
                }]);
            const inspected = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], value.dependencies);
            strict_1.default.equal(inspected.taskId, TASK_ID);
            strict_1.default.equal(inspected.rootId, ROOT_ID);
            strict_1.default.equal(inspected.sessionId, SESSION_ID);
            strict_1.default.equal(inspected.closeDecisionId, closed.closeDecisionId);
            strict_1.default.equal(inspected.closedTaskIds.includes(TASK_ID), false);
            strict_1.default.equal(inspected.closedExecutionHistory.length, 1);
            strict_1.default.match(inspected.closedExecutionBindingDigest ?? "", /^[a-f0-9]{64}$/);
            strict_1.default.throws(() => (0, local_completion_cli_js_1.taskMapLocalCompletionCliOutput)({
                ...inspected,
                closeDecisionId: `tmlocalclose_${digest("f")}`,
            }), /Task Map local completion CLI unavailable/);
            const reopened = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "reopen",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
                "--decided-at", "2026-07-30T08:11:00.000Z",
            ], value.dependencies);
            strict_1.default.equal(reopened.status, "reopened");
            strict_1.default.equal(reopened.taskId, TASK_ID);
            strict_1.default.deepEqual(reopened.closedExecutionHistory, []);
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], value.dependencies), /Task Map local completion CLI unavailable/);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a closed execution whose receipt binding differs from the sealed close decision", async () => {
        const value = await fixture();
        try {
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            const execution = await value.dependencies.inspectExecution();
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], {
                ...value.dependencies,
                inspectExecution: async () => ({
                    ...execution,
                    reportReceiptDigest: digest("f"),
                }),
            }), /Task Map local completion CLI unavailable/);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a tampered sealed close decision before inspecting its session", async () => {
        const value = await fixture();
        try {
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            const decisionsRoot = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions");
            const decisionPath = node_path_1.default.join(decisionsRoot, (await (0, promises_1.readdir)(decisionsRoot))[0]);
            const tampered = JSON.parse((await (0, promises_1.readFile)(decisionPath)).toString("utf8"));
            tampered.binding.report.reportReceiptDigest = digest("f");
            await (0, promises_1.writeFile)(decisionPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(tampered));
            let executionInspections = 0;
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], {
                ...value.dependencies,
                inspectExecution: async () => {
                    executionInspections += 1;
                    return value.dependencies.inspectExecution();
                },
            }));
            strict_1.default.equal(executionInspections, 0);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects historical execution inspection after the matched close is reopened", async () => {
        const value = await fixture();
        try {
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "reopen",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
                "--decided-at", "2026-07-30T08:05:00.000Z",
            ], value.dependencies);
            let executionInspections = 0;
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "inspect-closed-execution",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
            ], {
                ...value.dependencies,
                inspectExecution: async () => {
                    executionInspections += 1;
                    return value.dependencies.inspectExecution();
                },
            }), /Task Map local completion CLI unavailable/);
            strict_1.default.equal(executionInspections, 0);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("Keep open is nonterminal and parser rejects incomplete approval", async () => {
        const value = await fixture();
        try {
            const kept = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["keep-open", ...value.common], value.dependencies);
            strict_1.default.equal(kept.status, "kept_open");
            strict_1.default.deepEqual(kept.closedTaskIds, []);
            await strict_1.default.rejects((0, promises_1.readdir)(node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions")));
            strict_1.default.throws(() => (0, local_completion_cli_js_1.parseTaskMapLocalCompletionCliArguments)([
                "close",
                "--task-id", TASK_ID,
            ]));
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("records non-ready external completion without package or execution evidence and only explicit Reopen reactivates it", async () => {
        const value = await fixture();
        try {
            const unusedPackagePath = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "package.json");
            await (0, promises_1.rm)(unusedPackagePath);
            await strict_1.default.rejects((0, promises_1.lstat)(unusedPackagePath), { code: "ENOENT" });
            const dependencies = {
                ...value.dependencies,
                inspectOperationalContext: async () => {
                    throw new Error("external completion must not inspect approval context");
                },
                inspectExecution: async () => {
                    throw new Error("external completion must not inspect execution");
                },
            };
            const before = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], dependencies);
            strict_1.default.deepEqual(before.readyTaskIds, []);
            strict_1.default.deepEqual(before.terminalTaskIds, []);
            const completed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root", value.ownerRoot,
                "--task-id", TASK_ID,
                "--decided-at", DECIDED_AT,
            ], dependencies);
            strict_1.default.equal(completed.status, "completed_elsewhere");
            strict_1.default.deepEqual(completed.completedElsewhereTaskIds, [TASK_ID]);
            strict_1.default.deepEqual(completed.terminalTaskIds, [TASK_ID]);
            strict_1.default.match(completed.completionDecisionId ?? "", /^tmlocalexternalcompletion_[a-f0-9]{64}$/);
            strict_1.default.equal(completed.sessionId, null);
            strict_1.default.equal(completed.sourceWritebackAttempted, false);
            strict_1.default.equal(completed.sourceCompletion, false);
            strict_1.default.equal(completed.outcomeVerified, false);
            strict_1.default.deepEqual(completed.readyTaskIds, []);
            const decisionsRoot = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions");
            const firstDecision = JSON.parse((await (0, promises_1.readFile)(node_path_1.default.join(decisionsRoot, (await (0, promises_1.readdir)(decisionsRoot))[0]))).toString("utf8"));
            strict_1.default.equal(firstDecision.displayState, "Completed by you");
            strict_1.default.equal(firstDecision.localOwnerScopeDigest, OWNER_SCOPE);
            strict_1.default.equal(firstDecision.sourceWritebackAttempted, false);
            strict_1.default.equal(firstDecision.sourceCompletion, false);
            strict_1.default.equal(firstDecision.outcomeVerified, false);
            strict_1.default.deepEqual(Object.keys(firstDecision.binding), ["projection"]);
            strict_1.default.equal("package" in firstDecision, false);
            strict_1.default.equal("session" in firstDecision, false);
            strict_1.default.equal("artifact" in firstDecision, false);
            strict_1.default.equal("report" in firstDecision, false);
            for (const command of [
                ["close", ...value.common],
                ["keep-open", ...value.common],
                [
                    "complete-elsewhere",
                    "--test-owner-root", value.ownerRoot,
                    "--task-id", TASK_ID,
                    "--decided-at", "2026-07-30T08:05:00.000Z",
                ],
            ]) {
                await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(command, dependencies), /active terminal disposition; explicit Reopen is required/);
            }
            strict_1.default.equal((await (0, promises_1.readdir)(decisionsRoot)).length, 1);
            value.setProjection(projection("tmt_repeated_source_text", "revision-2", "2026-07-30T09:00:00.000Z"));
            const repeated = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], dependencies);
            strict_1.default.deepEqual(repeated.completedElsewhereTaskIds, ["tmt_repeated_source_text"]);
            strict_1.default.deepEqual(repeated.conflictedTaskIds, []);
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "close",
                "--test-owner-root", value.ownerRoot,
                "--task-id", "tmt_repeated_source_text",
                "--session-id", SESSION_ID,
                "--decided-at", "2026-07-30T09:00:30.000Z",
            ], dependencies), /active terminal disposition; explicit Reopen is required/);
            strict_1.default.equal((await (0, promises_1.readdir)(decisionsRoot)).length, 1);
            const reopened = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "reopen",
                "--test-owner-root", value.ownerRoot,
                "--task-id", "tmt_repeated_source_text",
                "--decided-at", "2026-07-30T09:01:00.000Z",
            ], dependencies);
            strict_1.default.equal(reopened.status, "reopened");
            strict_1.default.deepEqual(reopened.terminalTaskIds, []);
            strict_1.default.match(reopened.reopenDecisionId ?? "", /^tmlocalexternalreopen_[a-f0-9]{64}$/);
            strict_1.default.equal((await (0, promises_1.readdir)(decisionsRoot)).length, 2);
            const afterReopen = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], dependencies);
            strict_1.default.deepEqual(afterReopen.terminalTaskIds, []);
            strict_1.default.deepEqual(afterReopen.completedElsewhereTaskIds, []);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("inspects a new overlay without rewriting the derived cache", async () => {
        const value = await fixture();
        try {
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["close", ...value.common], value.dependencies);
            const overlayPath = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-overlay.v1.json");
            const before = await (0, promises_1.readFile)(overlayPath);
            value.setProjection(projection("tmt_refreshed_alias"));
            const inspected = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["inspect-overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(inspected.closedTaskIds, ["tmt_refreshed_alias"]);
            strict_1.default.deepEqual(await (0, promises_1.readFile)(overlayPath), before);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("treats only an absent lifecycle history directory as empty", async () => {
        const value = await fixture();
        const decisionsRoot = node_path_1.default.join(value.ownerRoot, "taskmap-local-execution", "completion-decisions");
        try {
            const absent = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], value.dependencies);
            strict_1.default.deepEqual(absent.closedTaskIds, []);
            await (0, promises_1.mkdir)(decisionsRoot, { mode: 0o755 });
            await strict_1.default.rejects((0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)(["overlay", "--test-owner-root", value.ownerRoot], value.dependencies), /Task Map local completion CLI unavailable/);
        }
        finally {
            await (0, promises_1.rm)(value.ownerRoot, { recursive: true, force: true });
        }
    });
});
