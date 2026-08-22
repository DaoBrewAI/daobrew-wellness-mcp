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
const node_test_1 = require("node:test");
const body_context_js_1 = require("../src/engine/taskmap/body-context.js");
const agent_handoff_manifest_js_1 = require("../src/engine/taskmap/agent-handoff-manifest.js");
const agent_handoff_manifest_cli_js_1 = require("../src/engine/taskmap/agent-handoff-manifest-cli.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const local_approval_package_js_1 = require("../src/engine/taskmap/local-approval-package.js");
const local_approval_package_cli_js_1 = require("../src/engine/taskmap/local-approval-package-cli.js");
const local_completion_cli_js_1 = require("../src/engine/taskmap/local-completion-cli.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const ready_frontier_js_1 = require("../src/engine/taskmap/ready-frontier.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const wednesday_demo_leaf_js_1 = require("../src/engine/taskmap/wednesday-demo-leaf.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const GENERATED_AT = "2026-07-29T12:00:00.000Z";
const AUTHORIZED_AT = "2026-07-29T12:05:00.000Z";
function invokeCliMain(entrypointName, argv) {
    const entrypoint = node_path_1.default.resolve(__dirname, `../src/engine/taskmap/${entrypointName}.js`);
    return (0, node_child_process_1.spawnSync)(process.execPath, [entrypoint, ...argv], {
        cwd: process.cwd(),
        encoding: "utf8",
    });
}
(0, node_test_1.it)("preserves local-approval failure bytes without echoing invalid argv", () => {
    const unreflectedArgument = "PRIVATE_LOCAL_APPROVAL_ARGUMENT";
    const result = invokeCliMain("local-approval-package-cli", [unreflectedArgument]);
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.stdout, "");
    strict_1.default.match(result.stderr, /^taskmap-local-approval: unavailable\nError: Task Map local approval CLI input is invalid/m);
    strict_1.default.match(result.stderr, /at fail/);
    strict_1.default.equal(result.stderr.includes(unreflectedArgument), false);
});
(0, node_test_1.it)("preserves agent-handoff failure bytes without echoing invalid argv", () => {
    const unreflectedArgument = "PRIVATE_AGENT_HANDOFF_ARGUMENT";
    const result = invokeCliMain("agent-handoff-manifest-cli", [unreflectedArgument]);
    strict_1.default.equal(result.status, 1);
    strict_1.default.equal(result.stdout, "");
    strict_1.default.match(result.stderr, /^taskmap-agent-handoff: unavailable\nError: Task Map agent handoff CLI input is invalid/m);
    strict_1.default.match(result.stderr, /at fail/);
    strict_1.default.equal(result.stderr.includes(unreflectedArgument), false);
});
(0, node_test_1.it)("resolves product approval storage from the confirmed owner only", () => {
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("local-approval-product-owner");
    const parsed = (0, local_approval_package_cli_js_1.parseTaskMapLocalApprovalCliArguments)(["inspect"], {
        homeDirectory: owner.homeDirectory,
        environment: { DAOBREW_USER_ID: owner.userId },
    });
    strict_1.default.equal(parsed.roots.ownerRoot, owner.ownerRoot);
    strict_1.default.equal(parsed.roots.taskMapRoot, node_path_1.default.join(owner.ownerRoot, "taskmap"));
    strict_1.default.throws(() => (0, local_approval_package_cli_js_1.parseTaskMapLocalApprovalCliArguments)(["inspect"], {
        homeDirectory: owner.homeDirectory,
        environment: {
            DAOBREW_USER_ID: "00000000-0000-4000-8000-000000000000",
        },
    }), /Task Map local approval CLI input is invalid/);
});
(0, node_test_1.it)("quarantines private legacy terminal state instead of approving it under a fresh owner", async () => {
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("local-approval-legacy-terminal-quarantine");
    const legacyExecutionRoot = node_path_1.default.join(owner.homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap-local-execution");
    const legacyDecisionsRoot = node_path_1.default.join(legacyExecutionRoot, "completion-decisions");
    const legacyDecisionPath = node_path_1.default.join(legacyDecisionsRoot, "legacy-close.json");
    const legacyBytes = Buffer.from("{\"legacyTerminal\":true}\n", "utf8");
    await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    await (0, promises_1.mkdir)(legacyDecisionsRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(legacyExecutionRoot, 0o700);
    await (0, promises_1.chmod)(legacyDecisionsRoot, 0o700);
    await (0, promises_1.writeFile)(legacyDecisionPath, legacyBytes, { mode: 0o600 });
    try {
        await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
            "approve-prepare",
            "--expected-owner-scope-digest", "a".repeat(64),
            "--expected-proof-digest", "b".repeat(64),
            "--task-id", "tmt_0000000000000001",
            "--idempotency-key", "c".repeat(64),
            "--authorized-at", AUTHORIZED_AT,
        ], {
            homeDirectory: owner.homeDirectory,
            environment: { DAOBREW_USER_ID: owner.userId },
        }), (error) => (error instanceof Error
            && error.name === "TaskMapLegacyLocalStateQuarantineError"
            && error.code
                === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"));
        strict_1.default.deepEqual(await (0, promises_1.readFile)(legacyDecisionPath), legacyBytes);
        await strict_1.default.rejects((0, promises_1.lstat)(node_path_1.default.join(owner.ownerRoot, "taskmap-local-execution")), { code: "ENOENT" });
    }
    finally {
        await (0, promises_1.rm)(legacyExecutionRoot, { recursive: true, force: true });
        await (0, promises_1.rm)(owner.ownerRoot, { recursive: true, force: true });
    }
});
function sha256(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
function inputFixture() {
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: GENERATED_AT,
        pointers: [
            {
                id: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
                sourceKind: "manual",
                sourceObjectId: "task-safe-ref",
                sourceRefHash: "0000000000000000",
                sourceVersion: "taskmap-demo-rally.2026-07-31.1",
                authority: "user",
                syncMode: "personal_fork",
                capabilities: ["read_task", "update_status"],
            },
            {
                id: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.requestPointerId,
                sourceKind: "manual",
                sourceObjectId: "codex-request-safe-ref",
                sourceRefHash: "1111111111111111",
                authority: "user",
                syncMode: "personal_fork",
                capabilities: ["read_task"],
            },
            {
                id: "body-context",
                sourceKind: "oura",
                sourceObjectId: "relative-window",
                sourceRefHash: "2222222222222222",
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ],
        events: [
            {
                id: "task-created",
                pointerId: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-07-28T10:00:00.000Z",
                observedAt: GENERATED_AT,
                objectRefs: ["task:safe-ref"],
                title: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
                summary: "Package the Odyssey attention-management demo without starting delivery.",
                extractionConfidence: 1,
                sourceStatus: "open",
            },
            {
                id: "meeting-context-event",
                pointerId: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.requestPointerId,
                recordKind: "work_context",
                activity: "context_observed",
                occurredAt: "2026-07-29T10:00:00.000Z",
                observedAt: GENERATED_AT,
                dayKey: "2026-07-29",
                objectRefs: ["context:odyssey-debate"],
                title: "Odyssey attention-management package request",
                summary: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
                extractionConfidence: 1,
                bodyJoinEligible: true,
            },
            {
                id: "body-context-event",
                pointerId: "body-context",
                recordKind: "body_context",
                activity: "body_window_observed",
                occurredAt: "2026-07-29T09:00:00.000Z",
                observedAt: GENERATED_AT,
                dayKey: "2026-07-29",
                objectRefs: ["body-day:2026-07-29"],
                title: "Relative body context",
                summary: "Provider-specific raw values are not stored.",
                extractionConfidence: 1,
                bodyCategory: "below_baseline",
                bodyAxis: "composite_recovery",
            },
        ],
    };
}
function brainFixture(input) {
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: GENERATED_AT,
        roots: [{
                proposalId: "root",
                title: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_COPY.rootTitle,
                summary: "Ship the Task Map with one honest input-to-artifact demo.",
                evidenceEventIds: ["task-created", "meeting-context-event"],
                memberObjectRefs: [
                    "task:safe-ref",
                    "context:odyssey-debate",
                ],
                confidence: 1,
            }],
        tasks: [{
                proposalId: "task",
                rootProposalId: "root",
                title: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
                summary: "Package the Odyssey attention-management demo without dispatch or source mutation.",
                evidenceEventIds: ["task-created", "meeting-context-event"],
                authoritativeTaskEventId: "task-created",
                openState: "open",
                confidence: 1,
            }],
        edges: [{
                proposalId: "edge",
                fromProposalId: "root",
                toProposalId: "task",
                relation: "advances",
                evidenceEventIds: ["meeting-context-event"],
                confidence: 1,
            }],
    };
}
function acceptedProjection(input, brain) {
    const baseline = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E2",
        now: GENERATED_AT,
    });
    strict_1.default.equal(baseline.runStatus, "accepted", JSON.stringify(baseline.rejections));
    const projection = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: GENERATED_AT,
        previousProjection: baseline,
    });
    strict_1.default.equal(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
    const root = projection.roots[0];
    const task = projection.tasks[0];
    return {
        ...projection,
        roots: projection.roots.map((row) => (row.id === root.id
            ? {
                ...row,
                id: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.rootId,
                taskIds: row.taskIds.map((taskId) => (taskId === task.id
                    ? wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
                    : taskId)),
            }
            : row)),
        tasks: projection.tasks.map((row) => (row.id === task.id
            ? {
                ...row,
                id: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskId,
                rootId: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.rootId,
            }
            : row)),
        edges: projection.edges.map((edge) => ({
            ...edge,
            from: edge.from === root.id
                ? wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.rootId
                : edge.from === task.id
                    ? wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
                    : edge.from,
            to: edge.to === root.id
                ? wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.rootId
                : edge.to === task.id
                    ? wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskId
                    : edge.to,
        })),
    };
}
async function writePrivateJson(filePath, value, canonical = false) {
    const bytes = canonical
        ? (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)
        : `${JSON.stringify(value, null, 2)}\n`;
    await (0, promises_1.writeFile)(filePath, bytes, { mode: 0o600 });
    await (0, promises_1.chmod)(filePath, 0o600);
}
function currentWorkCore(projection) {
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const root = projection.roots[0];
    const task = projection.tasks[0];
    const contextPointerIds = [...new Set([
            ...task.originPointerIds,
            ...task.citations
                .filter((citation) => citation.sourceKind !== "oura")
                .map((citation) => citation.pointerId),
        ])].sort();
    const returnTarget = task.returnRoute.state === "user_destination_required"
        ? { state: task.returnRoute.state }
        : {
            state: task.returnRoute.state,
            pointerId: task.returnRoute.pointerId,
        };
    return {
        contractVersion: "taskmap-current-work.v1",
        projection: {
            contractVersion: projection.contractVersion,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            projectionDigest,
        },
        currentGoal: {
            rootId: root.id,
            title: root.title,
            accepted: true,
        },
        nextTaskToProve: {
            taskId: task.id,
            rootId: root.id,
            outcome: "An immutable approval-bound package is ready locally.",
            input: {
                summary: "Use only the exact accepted projection and current work.",
                contextPointerIds,
                agentSessionEpisode: {
                    admission: "authenticated_fresh_agent_session",
                    directive: "user_directive",
                    userDirectiveSummary: "Prepare the customer launch checklist",
                    episodeId: "tmaepisode_250aeaa278a0c4ff",
                    episodeIdentityDigest: "8e5662d48cbe05f044bfb131d20576fbe2bb4123cc87def83a3f1dd556858770",
                    episodeRevisionDigest: "16f62b4e49440b9421ab2668a7097469a71bf414eb39eaed39745ab6f3fb84e3",
                    rootSessionIdentityDigest: "2cf7c9ea0e7c80d88db5de9e0817297160275a1d485b2b54345aeaa0ac4246f3",
                    occurredAt: "2026-07-30T22:06:04.957Z",
                    provider: "codex",
                    routingIdentityKind: "repository",
                    routingIdentityDigest: "b1c787fae927b1596fc69ff6fcbd1ab34e640aac7133a01f33fc273e1f22de2b",
                    completionAuthority: false,
                    reopenAuthority: false,
                },
            },
            predecessors: [],
            doneDefinition: [
                "Authorization is recorded separately from current-work.",
                "Package is ready locally with delivery not started.",
                "Source completion and outcome verification remain false.",
            ],
            permission: {
                requiresExplicitApproval: true,
                approvalGranted: false,
            },
            returnTarget,
            executable: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
}
const READY_APPROVAL_BOUNDARY = Object.freeze({
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
});
function readyProofTarget(target) {
    return {
        ...structuredClone(target),
        approvalPackage: { ...READY_APPROVAL_BOUNDARY },
    };
}
async function writeReadyProofTargets(taskMapRoot, projection, currentness, proofTargets) {
    await writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_READY_PROOF_TARGETS_FILENAME), (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
        projection,
        currentness,
        proofTargets,
    }), true);
}
function bodySignalAssessment(projection, relationship = "repeated_association") {
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    const repeated = relationship === "repeated_association";
    const bodyInformed = relationship === "body_informed";
    const signalDates = ["2026-07-23", "2026-07-25", "2026-07-29"];
    const base = {
        contractVersion: native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
        projection: {
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            projectionDigest,
        },
        physiologicalSnapshotDigest: "b".repeat(64),
        assessedAt: GENERATED_AT,
        sourceFamily: "physiological",
        signal: {
            axis: "composite_recovery",
            displayName: "Readiness + Sleep",
            comparison: "relative_to_recent_personal_range",
            targetCategory: "below_baseline",
        },
        coverage: {
            startDay: "2026-07-01",
            endDay: "2026-07-29",
            classifiedDays: 29,
            unknownDays: 0,
        },
        roots: projection.roots
            .map((root) => ({
            rootId: root.id,
            relationship,
            ...(bodyInformed ? { evidenceLevel: "body_informed" } : {}),
            observedSignalDates: signalDates,
            matchedWorkDates: repeated
                ? signalDates
                : bodyInformed
                    ? ["2026-07-25"]
                    : [],
            matchedWorkSources: repeated
                ? [
                    native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.codex_session,
                    native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.gemini_meet,
                ]
                : bodyInformed
                    ? [native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola]
                    : [],
            matchedDateCount: repeated ? signalDates.length : bodyInformed ? 1 : 0,
            signalSummary: "Readiness + Sleep was below your recent personal range on 2026-07-23, 2026-07-25, 2026-07-29 within 2026-07-01 through 2026-07-29.",
            relevanceSummary: repeated
                ? "Eligible work in this workstream repeated on 2026-07-23, 2026-07-25, 2026-07-29 across Codex sessions and Gemini meeting notes. This is an association, not proof of cause."
                : bodyInformed
                    ? "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range in Granola meeting notes. This is an association, not proof of cause."
                    : "Fewer than three overlap days had two independent work sources, so no repeated relationship is shown.",
            reasonCode: repeated || bodyInformed
                ? null
                : "insufficient_multi_source_backing",
        }))
            .sort((left, right) => left.rootId.localeCompare(right.rootId)),
        boundary: "Body-informed context only. Association is not proof of cause.",
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
            providerIdentityStored: false,
        },
    };
    return {
        ...base,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(base),
    };
}
async function createFixture() {
    const base = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-local-approval-")));
    const ownerRoot = node_path_1.default.join(base, "owner");
    const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
    const executionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    await (0, promises_1.mkdir)(taskMapRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(ownerRoot, 0o700);
    await (0, promises_1.chmod)(taskMapRoot, 0o700);
    const input = inputFixture();
    const projection = acceptedProjection(input, brainFixture(input));
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
    const currentWorkWithoutDigest = currentWorkCore(projection);
    const currentWork = {
        ...currentWorkWithoutDigest,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentWorkWithoutDigest),
    };
    const body = (0, body_context_js_1.buildTaskMapBodyContextDisclosure)(input, projection, {
        contractVersion: "oura-taskmap-context.v1",
        generatedAt: GENERATED_AT,
        sourceKind: "oura",
        coverage: {
            startDay: "2026-07-01",
            endDay: "2026-07-29",
            dailyActivityDays: 29,
            dailyReadinessDays: 29,
            dailySleepDays: 28,
            sleepRecords: 40,
            heartRateSamples: 12_000,
            classifiedDays: 1,
            unknownDays: 0,
        },
        classifier: {
            version: "relative-recovery.1",
            axis: "composite_recovery",
            method: "Personal baseline categories only.",
            minimumMetricsPerDay: 2,
            lowerThreshold: -1,
            upperThreshold: 1,
        },
        days: [{
                dayKey: "2026-07-29",
                axis: "composite_recovery",
                category: "below_baseline",
            }],
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
        },
    });
    const bodyAssessment = bodySignalAssessment(projection);
    await Promise.all([
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection), projection),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), currentness),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork, true),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.body), body),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodyAssessment, true),
    ]);
    return {
        base,
        ownerRoot,
        taskMapRoot,
        executionRoot,
        projection,
        targetTaskId: projection.tasks[0].id,
    };
}
async function createTwoTargetFixture() {
    const fixture = await createFixture();
    const firstTask = fixture.projection.tasks[0];
    const root = fixture.projection.roots[0];
    const routeEdge = fixture.projection.edges.find((edge) => ((edge.from === root.id && edge.to === firstTask.id)
        || (edge.from === firstTask.id && edge.to === root.id)));
    strict_1.default.ok(routeEdge, "fixture must expose a root-to-task route");
    const secondTaskId = "tmt_0000000000000002";
    const projection = {
        ...structuredClone(fixture.projection),
        roots: fixture.projection.roots.map((candidate) => (candidate.id === root.id
            ? {
                ...structuredClone(candidate),
                taskIds: [...candidate.taskIds, secondTaskId],
            }
            : structuredClone(candidate))),
        tasks: [
            ...fixture.projection.tasks.map((task) => structuredClone(task)),
            {
                ...structuredClone(firstTask),
                id: secondTaskId,
                title: "Prepare the second bounded owner package",
                summary: "Use the same accepted inputs for a distinct bounded leaf.",
            },
        ],
        edges: [
            ...fixture.projection.edges.map((edge) => structuredClone(edge)),
            {
                ...structuredClone(routeEdge),
                id: "tme_0000000000000002",
                from: routeEdge.from === firstTask.id ? secondTaskId : routeEdge.from,
                to: routeEdge.to === firstTask.id ? secondTaskId : routeEdge.to,
            },
        ],
    };
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
    const currentWorkWithoutDigest = currentWorkCore(projection);
    const currentWork = {
        ...currentWorkWithoutDigest,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentWorkWithoutDigest),
    };
    const firstTarget = currentWork.nextTaskToProve;
    const secondTarget = {
        ...structuredClone(firstTarget),
        taskId: secondTaskId,
        outcome: "A second immutable approval-bound package is ready locally.",
    };
    await Promise.all([
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection), projection),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), currentness),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork, true),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(projection), true),
        writeReadyProofTargets(fixture.taskMapRoot, projection, currentness, [readyProofTarget(firstTarget), readyProofTarget(secondTarget)]),
    ]);
    fixture.projection = projection;
    return { ...fixture, secondTaskId };
}
async function createTerminalPredecessorFixture() {
    const fixture = await createTwoTargetFixture();
    const firstTask = fixture.projection.tasks[0];
    const originalSecondTask = fixture.projection.tasks.find((task) => task.id === fixture.secondTaskId);
    const firstHomePointerId = firstTask.taskHomePointerId;
    const firstHomeSource = fixture.projection.sources.find((source) => source.id === firstHomePointerId);
    const successorPointerId = "ptr-dependent-successor";
    const secondTask = {
        ...structuredClone(originalSecondTask),
        taskHomePointerId: successorPointerId,
        originPointerIds: [successorPointerId],
        returnRoute: {
            ...structuredClone(originalSecondTask.returnRoute),
            pointerId: successorPointerId,
        },
        citations: [{
                ...structuredClone(originalSecondTask.citations.find((citation) => citation.pointerId === firstHomePointerId)),
                eventId: "task-created-successor",
                pointerId: successorPointerId,
            }],
    };
    const edgeTemplate = fixture.projection.edges[0];
    const projection = {
        ...structuredClone(fixture.projection),
        sources: [
            ...fixture.projection.sources.map((source) => structuredClone(source)),
            {
                ...structuredClone(firstHomeSource),
                id: successorPointerId,
                sourceVersion: "taskmap-dependent-successor.1",
            },
        ],
        tasks: fixture.projection.tasks.map((task) => (task.id === secondTask.id
            ? structuredClone(secondTask)
            : structuredClone(task))),
        edges: [
            ...fixture.projection.edges.map((edge) => structuredClone(edge)),
            {
                ...structuredClone(edgeTemplate),
                id: "tme_0000000000000003",
                from: secondTask.id,
                to: firstTask.id,
                relation: "depends_on",
            },
        ],
    };
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
    const currentWorkWithoutDigest = currentWorkCore(projection);
    const currentWork = {
        ...currentWorkWithoutDigest,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentWorkWithoutDigest),
    };
    const firstTarget = currentWork.nextTaskToProve;
    const secondTarget = {
        ...structuredClone(firstTarget),
        taskId: secondTask.id,
        outcome: "The successor package is ready after its predecessor closes.",
        input: {
            ...structuredClone(firstTarget.input),
            contextPointerIds: [...new Set([
                    ...secondTask.originPointerIds,
                    ...secondTask.citations
                        .filter((citation) => citation.sourceKind !== "oura")
                        .map((citation) => citation.pointerId),
                ])].sort(),
        },
        returnTarget: secondTask.returnRoute.state === "user_destination_required"
            ? { state: secondTask.returnRoute.state }
            : {
                state: secondTask.returnRoute.state,
                pointerId: secondTask.returnRoute.pointerId,
            },
        predecessors: [{
                taskId: firstTask.id,
                relation: "depends_on",
                reviewState: firstTask.reviewState,
                openState: firstTask.openState,
            }],
    };
    await Promise.all([
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection), projection),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), currentness),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork, true),
        writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(projection), true),
        writeReadyProofTargets(fixture.taskMapRoot, projection, currentness, [readyProofTarget(firstTarget), readyProofTarget(secondTarget)]),
    ]);
    fixture.projection = projection;
    return fixture;
}
async function mutateCurrentWork(fixture, mutate) {
    const filePath = node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork);
    const value = JSON.parse(await (0, promises_1.readFile)(filePath, "utf8"));
    delete value.artifactDigest;
    mutate(value);
    const resealed = {
        ...value,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(value),
    };
    await writePrivateJson(filePath, resealed, true);
}
async function mutateBodyAssessment(fixture, mutate, reseal = true) {
    const filePath = node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment);
    const value = JSON.parse(await (0, promises_1.readFile)(filePath, "utf8"));
    delete value.artifactDigest;
    mutate(value);
    const next = reseal
        ? {
            ...value,
            artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(value),
        }
        : {
            ...value,
            artifactDigest: "0".repeat(64),
        };
    await writePrivateJson(filePath, next, true);
}
async function quartetDigests(fixture) {
    return Object.fromEntries(await Promise.all(Object.values(local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES).map(async (name) => [
        name,
        sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.taskMapRoot, name))),
    ])));
}
async function inspectAndPrepare(fixture) {
    const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
    });
    const prepared = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
        expectedProofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        idempotencyKey: inspection.prepareIdempotencyKey,
        authorizedAt: AUTHORIZED_AT,
    });
    return { inspection, prepared };
}
function resealArtifact(value, digestKey, idKey, idPrefix, domain) {
    const core = { ...value };
    delete core[digestKey];
    delete core[idKey];
    const digest = (0, source_contracts_js_1.taskMapContractDigest)({ domain, ...core });
    return {
        ...core,
        [idKey]: `${idPrefix}${digest}`,
        [digestKey]: digest,
    };
}
(0, node_test_1.describe)("Task Map local approval package", () => {
    (0, node_test_1.it)("inspects an exact current quartet without granting execution", async () => {
        const fixture = await createFixture();
        try {
            const quartetBefore = await quartetDigests(fixture);
            const { inspection, response } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.equal(inspection.readyForLocalApproval, true);
            strict_1.default.equal(inspection.currentWorkApprovalGranted, false);
            strict_1.default.equal(inspection.currentWorkExecutable, false);
            strict_1.default.equal(inspection.dispatchAuthorized, false);
            strict_1.default.equal(inspection.codexTaskStartAuthorized, false);
            strict_1.default.deepEqual(inspection.task.routeNodeIds, [
                fixture.projection.roots[0].id,
                fixture.targetTaskId,
            ]);
            strict_1.default.equal(response.status, "ready_for_approval");
            strict_1.default.equal(response.approvalRecorded, false);
            strict_1.default.equal(response.packageId, null);
            strict_1.default.equal(response.deliveryStatus, "not_started");
            strict_1.default.equal(response.sourceCompletion, false);
            strict_1.default.equal(response.outcomeVerified, false);
            strict_1.default.equal(response.bodyAssessmentFileDigest, quartetBefore[local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment]);
            strict_1.default.equal(response.bodyAssessmentArtifactDigest, inspection.task.bodySignal.assessmentArtifactDigest);
            strict_1.default.equal(response.physiologicalSnapshotDigest, inspection.task.bodySignal.physiologicalSnapshotDigest);
            strict_1.default.deepEqual(await quartetDigests(fixture), quartetBefore);
            await strict_1.default.rejects((0, promises_1.lstat)(fixture.executionRoot), (error) => error.code === "ENOENT");
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps an existing empty execution root read-only and ready for approval", async () => {
        const fixture = await createFixture();
        try {
            await (0, promises_1.mkdir)(fixture.executionRoot, { mode: 0o700 });
            const quartetBefore = await quartetDigests(fixture);
            const response = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.equal(response.response.status, "ready_for_approval");
            strict_1.default.deepEqual(await (0, promises_1.readdir)(fixture.executionRoot), []);
            strict_1.default.deepEqual(await quartetDigests(fixture), quartetBefore);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("records a separate approval and prepares three immutable owner-only artifacts", async () => {
        const fixture = await createFixture();
        try {
            const before = await quartetDigests(fixture);
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const result = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
                authorizedAt: AUTHORIZED_AT,
            });
            strict_1.default.equal(result.replayed, false);
            strict_1.default.equal(result.response.status, "package_ready");
            strict_1.default.equal(result.response.approvalRecorded, true);
            strict_1.default.match(result.authorization.approvalAuthorizationId, /^tmauthorization_[a-f0-9]{64}$/);
            strict_1.default.match(result.package.packageId, /^tmlocalpackage_[a-f0-9]{64}$/);
            strict_1.default.match(result.receipt.preparationReceiptId, /^tmpreparationreceipt_[a-f0-9]{64}$/);
            strict_1.default.deepEqual(result.package.executionBoundary, {
                state: "prepared_not_started",
                approvalRecorded: true,
                deliveryStatus: "not_started",
                taskStarted: false,
                taskExecuted: false,
                dispatchAuthorized: false,
                sourceWritebackAuthorized: false,
                codexTaskStartAuthorized: false,
            });
            strict_1.default.equal(result.receipt.deliveryStatus, "not_started");
            strict_1.default.equal(result.receipt.noDispatch, true);
            strict_1.default.equal(result.receipt.sourceMutationAttempted, false);
            strict_1.default.equal(result.receipt.sourceCompletion, false);
            strict_1.default.equal(result.receipt.outcomeVerified, false);
            strict_1.default.equal(Object.hasOwn(result.package.task, "demoLeaf"), false);
            strict_1.default.equal(result.package.task.outcome, "An immutable approval-bound package is ready locally.");
            strict_1.default.equal(result.package.task.input.summary, "Use only the exact accepted projection and current work.");
            strict_1.default.ok(result.response.artifactAccess);
            strict_1.default.equal(result.response.artifactAccess.revealDirectoryPath, fixture.executionRoot);
            strict_1.default.deepEqual(await quartetDigests(fixture), before);
            const executionStats = await (0, promises_1.lstat)(fixture.executionRoot);
            strict_1.default.equal(executionStats.mode & 0o777, 0o700);
            const expectedFiles = [
                `authorization_${inspection.prepareIdempotencyKey}.json`,
                `package_${result.authorization.approvalAuthorizationId}.json`,
                `receipt_${result.package.packageId}.json`,
            ];
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot)).sort(), [...expectedFiles].sort());
            for (const name of expectedFiles) {
                const stats = await (0, promises_1.lstat)(node_path_1.default.join(fixture.executionRoot, name));
                strict_1.default.equal(stats.mode & 0o777, 0o600);
                strict_1.default.equal(stats.nlink, 1);
            }
            const preparedBytes = Object.fromEntries(await Promise.all(expectedFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ])));
            const restarted = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.deepEqual(restarted.inspection, inspection);
            strict_1.default.deepEqual(restarted.response, result.response);
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot)).sort(), expectedFiles.sort());
            strict_1.default.deepEqual(Object.fromEntries(await Promise.all(expectedFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ]))), preparedBytes);
            strict_1.default.deepEqual(await quartetDigests(fixture), before);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("gives a fresh Codex or Claude session a complete brief from package bytes alone", async () => {
        const fixture = await createFixture();
        try {
            const { prepared } = await inspectAndPrepare(fixture);
            const access = prepared.response.artifactAccess;
            strict_1.default.ok(access);
            // Deliberately read only the exported package and receipt. A fresh agent
            // should not need the source projection, this test fixture, or chat state.
            const packageOnly = JSON.parse(await (0, promises_1.readFile)(access.packagePath, "utf8"));
            const receiptOnly = JSON.parse(await (0, promises_1.readFile)(access.receiptPath, "utf8"));
            strict_1.default.equal(Object.hasOwn(packageOnly, "adapter"), false);
            strict_1.default.equal(Object.hasOwn(packageOnly, "runtimeRequest"), false);
            strict_1.default.equal(Object.hasOwn(receiptOnly, "adapter"), false);
            strict_1.default.equal(Object.hasOwn(receiptOnly, "runtimeRequest"), false);
            strict_1.default.equal(Object.hasOwn(packageOnly.task, "demoLeaf"), false);
            strict_1.default.equal(packageOnly.task.taskId, fixture.targetTaskId);
            strict_1.default.equal(packageOnly.task.outcome, "An immutable approval-bound package is ready locally.");
            strict_1.default.equal(packageOnly.task.input.summary, "Use only the exact accepted projection and current work.");
            strict_1.default.deepEqual(packageOnly.task.doneDefinition, [
                "Authorization is recorded separately from current-work.",
                "Package is ready locally with delivery not started.",
                "Source completion and outcome verification remain false.",
            ]);
            strict_1.default.deepEqual(packageOnly.task.returnTarget, {
                state: "source_owned",
                pointerId: wednesday_demo_leaf_js_1.TASKMAP_WEDNESDAY_DEMO_BINDING.taskHomePointerId,
            });
            strict_1.default.equal(packageOnly.task.bodySignal.relationship, "repeated_association");
            strict_1.default.deepEqual(packageOnly.task.bodySignal.matchedWorkDates, ["2026-07-23", "2026-07-25", "2026-07-29"]);
            strict_1.default.deepEqual(packageOnly.task.bodySignal.matchedWorkSources, [
                native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.codex_session,
                native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.gemini_meet,
            ]);
            strict_1.default.equal(packageOnly.task.bodySignal.assessmentArtifactDigest, packageOnly.quartet.bodyAssessmentArtifactDigest);
            strict_1.default.equal(packageOnly.task.bodySignal.physiologicalSnapshotDigest, packageOnly.quartet.physiologicalSnapshotDigest);
            strict_1.default.equal(packageOnly.quartet.bodyAssessmentFileDigest, sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment))));
            strict_1.default.doesNotMatch([
                ...packageOnly.task.doneDefinition,
                packageOnly.task.bodySignal.signalSummary,
                packageOnly.task.bodySignal.relevanceSummary,
                packageOnly.task.bodySignal.boundary,
            ].join(" "), /\b(?:C0|C2|causal|qualified signal|Oura)\b/i);
            strict_1.default.equal(packageOnly.task.sourceEvidence.length, 2);
            strict_1.default.equal(packageOnly.executionBoundary.approvalRecorded, true);
            strict_1.default.equal(packageOnly.executionBoundary.dispatchAuthorized, false);
            strict_1.default.equal(packageOnly.executionBoundary.sourceWritebackAuthorized, false);
            strict_1.default.equal(packageOnly.executionBoundary.taskStarted, false);
            strict_1.default.equal(packageOnly.executionBoundary.taskExecuted, false);
            strict_1.default.equal(receiptOnly.packageId, packageOnly.packageId);
            strict_1.default.equal(receiptOnly.noDispatch, true);
            strict_1.default.equal(receiptOnly.sourceMutationAttempted, false);
            strict_1.default.equal(receiptOnly.sourceCompletion, false);
            strict_1.default.equal(receiptOnly.outcomeVerified, false);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed when the body-signal assessment is missing, tampered, or bound to another projection", async () => {
        const missing = await createFixture();
        try {
            await (0, promises_1.rm)(node_path_1.default.join(missing.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment));
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: missing.taskMapRoot,
                ownerRoot: missing.ownerRoot,
            }), /body-signal assessment is missing/);
        }
        finally {
            await (0, promises_1.rm)(missing.base, { recursive: true, force: true });
        }
        const tampered = await createFixture();
        try {
            await mutateBodyAssessment(tampered, () => { }, false);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: tampered.taskMapRoot,
                ownerRoot: tampered.ownerRoot,
            }), /body-signal assessment artifact digest is invalid/);
        }
        finally {
            await (0, promises_1.rm)(tampered.base, { recursive: true, force: true });
        }
        const wrongProjection = await createFixture();
        try {
            await mutateBodyAssessment(wrongProjection, (value) => {
                const projection = value.projection;
                projection.projectionDigest = "f".repeat(64);
            });
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: wrongProjection.taskMapRoot,
                ownerRoot: wrongProjection.ownerRoot,
            }), /body-signal assessment is not bound to every projected root/);
        }
        finally {
            await (0, promises_1.rm)(wrongProjection.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("exports an honest no-pattern body sentence without changing approval or dispatch", async () => {
        const fixture = await createFixture();
        try {
            await writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(fixture.projection, "not_established"), true);
            const { inspection, prepared } = await inspectAndPrepare(fixture);
            strict_1.default.equal(inspection.task.bodySignal.relationship, "not_established");
            strict_1.default.deepEqual(inspection.task.bodySignal.matchedWorkDates, []);
            strict_1.default.deepEqual(inspection.task.bodySignal.matchedWorkSources, []);
            strict_1.default.match(inspection.task.bodySignal.signalSummary, /Readiness \+ Sleep was below your recent personal range on 2026-07-23, 2026-07-25, 2026-07-29/);
            strict_1.default.match(inspection.task.bodySignal.relevanceSummary, /no repeated relationship is shown/);
            strict_1.default.doesNotMatch((0, source_contracts_js_1.taskMapContractCanonicalJson)(inspection.task.bodySignal), /\b(?:C0|C2|causal|Oura)\b/i);
            strict_1.default.equal(prepared.package.executionBoundary.dispatchAuthorized, false);
            strict_1.default.equal(prepared.package.executionBoundary.taskStarted, false);
            strict_1.default.equal(prepared.receipt.noDispatch, true);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preserves a qualified body-informed association without granting dispatch authority", async () => {
        const fixture = await createFixture();
        try {
            await writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(fixture.projection, "body_informed"), true);
            const { inspection, prepared } = await inspectAndPrepare(fixture);
            strict_1.default.equal(inspection.task.bodySignal.relationship, "body_informed");
            strict_1.default.deepEqual(inspection.task.bodySignal.matchedWorkDates, ["2026-07-25"]);
            strict_1.default.deepEqual(inspection.task.bodySignal.matchedWorkSources, [native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola]);
            strict_1.default.match(inspection.task.bodySignal.boundary, /association is not proof of cause/i);
            strict_1.default.equal(prepared.package.executionBoundary.dispatchAuthorized, false);
            strict_1.default.equal(prepared.package.executionBoundary.taskStarted, false);
            strict_1.default.equal(prepared.receipt.noDispatch, true);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("accepts the current no-exact-root-work-overlap result for unrelated roots", async () => {
        const fixture = await createFixture();
        try {
            await writePrivateJson(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(fixture.projection, "not_established"), true);
            await mutateBodyAssessment(fixture, (value) => {
                const roots = value.roots;
                for (const root of roots) {
                    root.reasonCode = "no_exact_root_work_overlap";
                }
            });
            const { inspection } = await inspectAndPrepare(fixture);
            strict_1.default.equal(inspection.task.bodySignal.relationship, "not_established");
            strict_1.default.deepEqual(inspection.task.bodySignal.matchedWorkDates, []);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects body-signal dates outside the authenticated coverage interval", async () => {
        const fixture = await createFixture();
        try {
            await mutateBodyAssessment(fixture, (value) => {
                const roots = value.roots;
                roots[0].observedSignalDates = [
                    "2026-06-30",
                    "2026-07-23",
                    "2026-07-25",
                ];
                roots[0].matchedWorkDates = [
                    "2026-06-30",
                    "2026-07-23",
                    "2026-07-25",
                ];
            });
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /must be unique, sorted, and within coverage/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("replays the exact first authorization when the timestamp changes", async () => {
        const fixture = await createFixture();
        try {
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const common = {
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
            };
            const first = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                ...common,
                authorizedAt: AUTHORIZED_AT,
            });
            const replay = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                ...common,
                authorizedAt: "2026-07-29T12:06:00.000Z",
            });
            strict_1.default.equal(replay.replayed, true);
            strict_1.default.deepEqual(replay.authorization, first.authorization);
            strict_1.default.deepEqual(replay.package, first.package);
            strict_1.default.deepEqual(replay.receipt, first.receipt);
            strict_1.default.deepEqual(replay.response, first.response);
            const restarted = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.deepEqual(restarted.response, first.response);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("serializes concurrent duplicates and repairs an authorization-only residue", async () => {
        const fixture = await createFixture();
        try {
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const common = {
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
            };
            const [first, second] = await Promise.all([
                (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                    ...common,
                    authorizedAt: AUTHORIZED_AT,
                }),
                (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                    ...common,
                    authorizedAt: "2026-07-29T12:06:00.000Z",
                }),
            ]);
            strict_1.default.deepEqual(first.authorization, second.authorization);
            strict_1.default.deepEqual(first.package, second.package);
            strict_1.default.deepEqual(first.receipt, second.receipt);
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot)).sort(), [
                `authorization_${inspection.prepareIdempotencyKey}.json`,
                `package_${first.authorization.approvalAuthorizationId}.json`,
                `receipt_${first.package.packageId}.json`,
            ].sort());
            await (0, promises_1.rm)(node_path_1.default.join(fixture.executionRoot, `package_${first.authorization.approvalAuthorizationId}.json`));
            await (0, promises_1.rm)(node_path_1.default.join(fixture.executionRoot, `receipt_${first.package.packageId}.json`));
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /local execution package is missing/);
            const recovered = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                ...common,
                authorizedAt: "2026-07-29T12:07:00.000Z",
            });
            strict_1.default.equal(recovered.replayed, true);
            strict_1.default.deepEqual(recovered.authorization, first.authorization);
            strict_1.default.deepEqual(recovered.package, first.package);
            strict_1.default.deepEqual(recovered.receipt, first.receipt);
            const restarted = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.deepEqual(restarted.response, recovered.response);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed on an authorization-and-package partial chain and lets approve-prepare repair it", async () => {
        const fixture = await createFixture();
        try {
            const { inspection, prepared } = await inspectAndPrepare(fixture);
            await (0, promises_1.rm)(node_path_1.default.join(fixture.executionRoot, `receipt_${prepared.package.packageId}.json`));
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /preparation receipt is missing/);
            const repaired = await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
                authorizedAt: "2026-07-29T12:07:00.000Z",
            });
            strict_1.default.equal(repaired.replayed, true);
            strict_1.default.deepEqual(repaired.authorization, prepared.authorization);
            strict_1.default.deepEqual(repaired.package, prepared.package);
            strict_1.default.deepEqual(repaired.receipt, prepared.receipt);
            strict_1.default.deepEqual((await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            })).response, repaired.response);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("ignores a valid stale chain for another proof when current authorization is absent", async () => {
        const fixture = await createFixture();
        try {
            const { inspection: oldInspection } = await inspectAndPrepare(fixture);
            const staleFiles = (await (0, promises_1.readdir)(fixture.executionRoot)).sort();
            const staleDigests = Object.fromEntries(await Promise.all(staleFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ])));
            await mutateCurrentWork(fixture, (value) => {
                const next = value.nextTaskToProve;
                next.doneDefinition = [
                    "Authorization remains separate from current work.",
                    "The successor package remains local and is not dispatched.",
                ];
            });
            const quartetBefore = await quartetDigests(fixture);
            const current = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.notEqual(current.inspection.prepareIdempotencyKey, oldInspection.prepareIdempotencyKey);
            strict_1.default.equal(current.response.status, "ready_for_approval");
            strict_1.default.equal(current.response.approvalRecorded, false);
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot)).sort(), staleFiles);
            strict_1.default.deepEqual(Object.fromEntries(await Promise.all(staleFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ]))), staleDigests);
            strict_1.default.deepEqual(await quartetDigests(fixture), quartetBefore);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a canonically resealed conflicting package and receipt", async () => {
        const packageFixture = await createFixture();
        try {
            const { prepared } = await inspectAndPrepare(packageFixture);
            const packagePath = node_path_1.default.join(packageFixture.executionRoot, `package_${prepared.authorization.approvalAuthorizationId}.json`);
            const changedPackage = JSON.parse(await (0, promises_1.readFile)(packagePath, "utf8"));
            const boundary = changedPackage.executionBoundary;
            boundary.approvalRecorded = false;
            await writePrivateJson(packagePath, resealArtifact(changedPackage, "packageDigest", "packageId", "tmlocalpackage_", "taskmap-local-execution-package.1"), true);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: packageFixture.taskMapRoot,
                ownerRoot: packageFixture.ownerRoot,
            }), /local execution package conflicts with the authorization/);
        }
        finally {
            await (0, promises_1.rm)(packageFixture.base, { recursive: true, force: true });
        }
        const receiptFixture = await createFixture();
        try {
            const { prepared } = await inspectAndPrepare(receiptFixture);
            const receiptPath = node_path_1.default.join(receiptFixture.executionRoot, `receipt_${prepared.package.packageId}.json`);
            const changedReceipt = JSON.parse(await (0, promises_1.readFile)(receiptPath, "utf8"));
            changedReceipt.sourceCompletion = true;
            await writePrivateJson(receiptPath, resealArtifact(changedReceipt, "preparationReceiptDigest", "preparationReceiptId", "tmpreparationreceipt_", "taskmap-local-preparation-receipt.1"), true);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: receiptFixture.taskMapRoot,
                ownerRoot: receiptFixture.ownerRoot,
            }), /preparation receipt conflicts with the package/);
        }
        finally {
            await (0, promises_1.rm)(receiptFixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects stale proof drift and a conflicting idempotency key", async () => {
        const fixture = await createFixture();
        try {
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            await mutateCurrentWork(fixture, (value) => {
                const next = value.nextTaskToProve;
                next.doneDefinition = ["A changed completion boundary."];
            });
            await strict_1.default.rejects((0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
                authorizedAt: AUTHORIZED_AT,
            }), /does not match the current proof/);
            const current = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            await strict_1.default.rejects((0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                executionRoot: fixture.executionRoot,
                expectedOwnerScopeDigest: current.inspection.localOwnerScopeDigest,
                expectedProofDigest: current.inspection.proofDigest,
                taskId: current.inspection.task.taskId,
                idempotencyKey: "f".repeat(64),
                authorizedAt: AUTHORIZED_AT,
            }), /does not match the current proof/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects an unauthorized execution root before any filesystem mutation", async () => {
        const fixture = await createFixture();
        try {
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const common = {
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
                authorizedAt: AUTHORIZED_AT,
            };
            const outside = node_path_1.default.join(fixture.base, "outside-execution");
            await strict_1.default.rejects((0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                ...common,
                executionRoot: outside,
            }), /fixed distinct product paths/);
            await strict_1.default.rejects((0, promises_1.lstat)(outside), (error) => error.code === "ENOENT");
            const before = (await (0, promises_1.readdir)(fixture.taskMapRoot)).sort();
            await strict_1.default.rejects((0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                ...common,
                executionRoot: fixture.taskMapRoot,
            }), /fixed distinct product paths/);
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.taskMapRoot)).sort(), before);
            strict_1.default.equal(before.some((name) => (name.startsWith("authorization_")
                || name.startsWith("package_")
                || name.startsWith("receipt_"))), false);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects private paths or raw biometric/source text before preparing a privacy-false package", async () => {
        const mutations = [
            (value) => {
                const next = value.nextTaskToProve;
                const input = next.input;
                input.summary = "Read /Users/private-owner/secret.txt before preparing.";
            },
            (value) => {
                const next = value.nextTaskToProve;
                next.outcome = "Raw HRV measured 23 ms before this task.";
            },
            (value) => {
                const next = value.nextTaskToProve;
                next.doneDefinition = ["Use Bearer topsecretvalue to reach the source."];
            },
        ];
        for (const mutate of mutations) {
            const fixture = await createFixture();
            try {
                await mutateCurrentWork(fixture, mutate);
                await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                    taskMapRoot: fixture.taskMapRoot,
                    ownerRoot: fixture.ownerRoot,
                }), /package content violates the privacy boundary/);
                await strict_1.default.rejects((0, promises_1.lstat)(fixture.executionRoot), (error) => error.code === "ENOENT");
            }
            finally {
                await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
            }
        }
    });
    (0, node_test_1.it)("rejects executable/current-work approval, cross-owner replay, and unsafe files", async () => {
        const executableFixture = await createFixture();
        try {
            await mutateCurrentWork(executableFixture, (value) => {
                const next = value.nextTaskToProve;
                next.executable = true;
            });
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: executableFixture.taskMapRoot,
                ownerRoot: executableFixture.ownerRoot,
            }), /pre-approval and non-executable/);
        }
        finally {
            await (0, promises_1.rm)(executableFixture.base, { recursive: true, force: true });
        }
        const fixture = await createFixture();
        try {
            const { inspection } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const copiedBase = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-local-owner-copy-")));
            const copiedOwner = node_path_1.default.join(copiedBase, "owner");
            const copiedTaskMap = node_path_1.default.join(copiedOwner, "taskmap");
            await (0, promises_1.mkdir)(copiedTaskMap, { recursive: true, mode: 0o700 });
            await (0, promises_1.chmod)(copiedOwner, 0o700);
            for (const name of Object.values(local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES)) {
                await (0, promises_1.writeFile)(node_path_1.default.join(copiedTaskMap, name), await (0, promises_1.readFile)(node_path_1.default.join(fixture.taskMapRoot, name)), { mode: 0o600 });
            }
            const copiedScope = await (0, local_approval_package_js_1.deriveTaskMapLocalOwnerScopeDigest)(copiedOwner);
            strict_1.default.notEqual(copiedScope, inspection.localOwnerScopeDigest);
            await strict_1.default.rejects((0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot: copiedTaskMap,
                ownerRoot: copiedOwner,
                executionRoot: node_path_1.default.join(copiedOwner, "taskmap-local-execution"),
                expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
                expectedProofDigest: inspection.proofDigest,
                taskId: inspection.task.taskId,
                idempotencyKey: inspection.prepareIdempotencyKey,
                authorizedAt: AUTHORIZED_AT,
            }), /local owner scope changed/);
            await (0, promises_1.rm)(copiedBase, { recursive: true, force: true });
            const currentWorkPath = node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork);
            await (0, promises_1.chmod)(currentWorkPath, 0o644);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /owner-only bounded regular file/);
            await (0, promises_1.chmod)(currentWorkPath, 0o600);
            const peer = node_path_1.default.join(fixture.base, "hardlink-peer.json");
            await (0, promises_1.link)(currentWorkPath, peer);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /owner-only bounded regular file/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed on malformed, unsafe, symlinked, and cross-owner current artifacts", async () => {
        const malformedFixture = await createFixture();
        try {
            const { inspection } = await inspectAndPrepare(malformedFixture);
            const authorizationPath = node_path_1.default.join(malformedFixture.executionRoot, `authorization_${inspection.prepareIdempotencyKey}.json`);
            await (0, promises_1.writeFile)(authorizationPath, "{", { mode: 0o600 });
            await (0, promises_1.chmod)(authorizationPath, 0o600);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: malformedFixture.taskMapRoot,
                ownerRoot: malformedFixture.ownerRoot,
            }), /approval authorization is not valid JSON/);
        }
        finally {
            await (0, promises_1.rm)(malformedFixture.base, { recursive: true, force: true });
        }
        const modeFixture = await createFixture();
        try {
            const { inspection } = await inspectAndPrepare(modeFixture);
            const authorizationPath = node_path_1.default.join(modeFixture.executionRoot, `authorization_${inspection.prepareIdempotencyKey}.json`);
            await (0, promises_1.chmod)(authorizationPath, 0o644);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: modeFixture.taskMapRoot,
                ownerRoot: modeFixture.ownerRoot,
            }), /approval authorization is not an owner-only bounded regular file/);
        }
        finally {
            await (0, promises_1.rm)(modeFixture.base, { recursive: true, force: true });
        }
        const symlinkFixture = await createFixture();
        try {
            const { inspection } = await inspectAndPrepare(symlinkFixture);
            const authorizationPath = node_path_1.default.join(symlinkFixture.executionRoot, `authorization_${inspection.prepareIdempotencyKey}.json`);
            const peerPath = node_path_1.default.join(symlinkFixture.base, "authorization-peer.json");
            await (0, promises_1.writeFile)(peerPath, await (0, promises_1.readFile)(authorizationPath), { mode: 0o600 });
            await (0, promises_1.rm)(authorizationPath);
            await (0, promises_1.symlink)(peerPath, authorizationPath);
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: symlinkFixture.taskMapRoot,
                ownerRoot: symlinkFixture.ownerRoot,
            }), /approval authorization is not an owner-only bounded regular file/);
        }
        finally {
            await (0, promises_1.rm)(symlinkFixture.base, { recursive: true, force: true });
        }
        const sourceFixture = await createFixture();
        const targetFixture = await createFixture();
        try {
            const source = await inspectAndPrepare(sourceFixture);
            const target = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: targetFixture.taskMapRoot,
                ownerRoot: targetFixture.ownerRoot,
            });
            await (0, promises_1.mkdir)(targetFixture.executionRoot, { mode: 0o700 });
            await (0, promises_1.writeFile)(node_path_1.default.join(targetFixture.executionRoot, `authorization_${target.inspection.prepareIdempotencyKey}.json`), await (0, promises_1.readFile)(node_path_1.default.join(sourceFixture.executionRoot, `authorization_${source.inspection.prepareIdempotencyKey}.json`)), { mode: 0o600 });
            await strict_1.default.rejects((0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
                taskMapRoot: targetFixture.taskMapRoot,
                ownerRoot: targetFixture.ownerRoot,
            }), /approval authorization conflicts with the current proof/);
        }
        finally {
            await (0, promises_1.rm)(sourceFixture.base, { recursive: true, force: true });
            await (0, promises_1.rm)(targetFixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("derives deterministic M4A handoff bytes from the exact prepared M3 chain without mutation", async () => {
        const fixture = await createFixture();
        try {
            const quartetBefore = await quartetDigests(fixture);
            const { prepared } = await inspectAndPrepare(fixture);
            const executionFiles = (await (0, promises_1.readdir)(fixture.executionRoot)).sort();
            const executionDigests = Object.fromEntries(await Promise.all(executionFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ])));
            const first = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const second = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            strict_1.default.deepEqual(second, first);
            strict_1.default.equal((0, source_contracts_js_1.taskMapContractCanonicalJson)(second.manifest), (0, source_contracts_js_1.taskMapContractCanonicalJson)(first.manifest));
            strict_1.default.equal(first.manifest.contractVersion, agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION);
            strict_1.default.equal(first.manifest.preparation.approvalAuthorizationDigest, prepared.authorization.approvalAuthorizationDigest);
            strict_1.default.equal(first.manifest.preparation.packageDigest, prepared.package.packageDigest);
            strict_1.default.equal(first.manifest.preparation.preparationReceiptDigest, prepared.receipt.preparationReceiptDigest);
            strict_1.default.deepEqual(first.manifest.runtimeRequest, agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1);
            strict_1.default.deepEqual(first.manifest.dryRunReturnPlan.actions, []);
            strict_1.default.equal(first.manifest.dryRunReturnPlan.state, "dry_run");
            strict_1.default.equal(first.manifest.dryRunReturnPlan.sourceMutationAuthorized, false);
            strict_1.default.deepEqual(first.manifest.dryRunReturnPlan.primaryTarget, prepared.package.task.returnTarget);
            strict_1.default.deepEqual(first.manifest.boundary, {
                state: "prepared_not_dispatched",
                dispatchAuthorized: false,
                processStartAuthorized: false,
                codexTaskStartAuthorized: false,
                taskCreated: false,
                codexTaskId: null,
                deliveryStatus: "not_started",
                returnActionExecutionAuthorized: false,
                sourceCompletionAuthorized: false,
                outcomeVerificationAuthorized: false,
            });
            strict_1.default.deepEqual(first.manifest.privacy, {
                sourceBodiesStored: false,
                localPathsStored: false,
                rawBiometricsStored: false,
                ownerIdentityStored: false,
                credentialsStored: false,
                participantIdentitiesStored: false,
                unboundedWorkspaceContextStored: false,
            });
            strict_1.default.deepEqual(first.summary, {
                contractVersion: agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
                status: "handoff_ready",
                handoffManifestId: first.manifest.handoffManifestId,
                handoffManifestDigest: first.manifest.handoffManifestDigest,
                boundPackageDigest: prepared.package.packageDigest,
                routeIdempotencyKey: first.manifest.routeIdempotencyKey,
                runtimeRequest: agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1,
                returnPlan: {
                    mode: "dry_run_only",
                    returnActionsAuthorized: false,
                    sourceWritebackAuthorized: false,
                },
                codexTaskCreated: false,
                codexTaskId: null,
                codexTaskStartAuthorized: false,
                dispatchAuthorized: false,
            });
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot)).sort(), executionFiles);
            strict_1.default.deepEqual(Object.fromEntries(await Promise.all(executionFiles.map(async (name) => [
                name,
                sha256(await (0, promises_1.readFile)(node_path_1.default.join(fixture.executionRoot, name))),
            ]))), executionDigests);
            strict_1.default.deepEqual(await quartetDigests(fixture), quartetBefore);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects M4A handoff inspection while the exact M3 package awaits approval", async () => {
        const fixture = await createFixture();
        try {
            const quartetBefore = await quartetDigests(fixture);
            await strict_1.default.rejects((0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            }), /exact M3 package is not ready/);
            strict_1.default.deepEqual(await quartetDigests(fixture), quartetBefore);
            await strict_1.default.rejects((0, promises_1.lstat)(fixture.executionRoot), (error) => error.code === "ENOENT");
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("exposes bounded full and summary M4A CLI reads only through the fixed command surface", async () => {
        const fixture = await createFixture();
        const dependencies = {
            environment: {
                [agent_handoff_manifest_cli_js_1.TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV]: "1",
            },
        };
        try {
            await inspectAndPrepare(fixture);
            strict_1.default.deepEqual((0, agent_handoff_manifest_cli_js_1.parseTaskMapAgentHandoffCliArguments)([
                "inspect-summary",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies), {
                command: "inspect-summary",
                ownerRoot: fixture.ownerRoot,
                taskMapRoot: fixture.taskMapRoot,
            });
            const manifest = await (0, agent_handoff_manifest_cli_js_1.runTaskMapAgentHandoffCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies);
            const summary = await (0, agent_handoff_manifest_cli_js_1.runTaskMapAgentHandoffCli)([
                "inspect-summary",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies);
            strict_1.default.equal(manifest.contractVersion, agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION);
            strict_1.default.equal(summary.contractVersion, agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION);
            if (manifest.contractVersion !== agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION
                || summary.contractVersion !== agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION) {
                strict_1.default.fail("M4A CLI returned the wrong contract");
            }
            strict_1.default.equal(summary.status, "handoff_ready");
            strict_1.default.equal(summary.handoffManifestId, manifest.handoffManifestId);
            strict_1.default.equal(summary.handoffManifestDigest, manifest.handoffManifestDigest);
            strict_1.default.equal(summary.boundPackageDigest, manifest.preparation.packageDigest);
            strict_1.default.equal(summary.routeIdempotencyKey, manifest.routeIdempotencyKey);
            const manifestOutput = (0, agent_handoff_manifest_cli_js_1.taskMapAgentHandoffCliOutput)(manifest);
            const summaryOutput = (0, agent_handoff_manifest_cli_js_1.taskMapAgentHandoffCliOutput)(summary);
            strict_1.default.equal(manifestOutput, `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(manifest)}\n`);
            strict_1.default.equal(summaryOutput, `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(summary)}\n`);
            strict_1.default.ok(Buffer.byteLength(manifestOutput, "utf8")
                <= agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes);
            strict_1.default.ok(Buffer.byteLength(summaryOutput, "utf8")
                <= agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes);
            await strict_1.default.rejects((0, agent_handoff_manifest_cli_js_1.runTaskMapAgentHandoffCli)([
                "inspect-summary",
                "--test-owner-root",
                fixture.ownerRoot,
            ]), /CLI input is invalid/);
            strict_1.default.throws(() => (0, agent_handoff_manifest_cli_js_1.parseTaskMapAgentHandoffCliArguments)([
                "inspect",
                "--model",
                "another-model",
            ], dependencies), /CLI input is invalid/);
            strict_1.default.throws(() => (0, agent_handoff_manifest_cli_js_1.taskMapAgentHandoffCliOutput)({
                ...manifest,
                task: {
                    ...manifest.task,
                    outcome: "x".repeat(agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes),
                },
            }), /exceeded its bound/);
            strict_1.default.throws(() => (0, agent_handoff_manifest_cli_js_1.taskMapAgentHandoffCliOutput)({
                ...summary,
                handoffManifestId: "x".repeat(agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes),
            }), /exceeded its bound/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("inspects and prepares each projection-bound ready target through one CLI collection", async () => {
        const fixture = await createTwoTargetFixture();
        const dependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        try {
            const legacyInspect = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies);
            strict_1.default.equal(legacyInspect.taskId, fixture.targetTaskId);
            const firstInspect = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.targetTaskId,
            ], dependencies);
            const secondInspect = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], dependencies);
            strict_1.default.equal(firstInspect.status, "ready_for_approval");
            strict_1.default.equal(secondInspect.status, "ready_for_approval");
            strict_1.default.equal(firstInspect.taskId, fixture.targetTaskId);
            strict_1.default.equal(secondInspect.taskId, fixture.secondTaskId);
            strict_1.default.equal(legacyInspect.proofDigest, firstInspect.proofDigest);
            strict_1.default.notEqual(firstInspect.proofDigest, secondInspect.proofDigest);
            strict_1.default.notEqual(firstInspect.prepareIdempotencyKey, secondInspect.prepareIdempotencyKey);
            const firstPrepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                firstInspect.localOwnerScopeDigest,
                "--expected-proof-digest",
                firstInspect.proofDigest,
                "--task-id",
                firstInspect.taskId,
                "--idempotency-key",
                firstInspect.prepareIdempotencyKey,
                "--authorized-at",
                AUTHORIZED_AT,
            ], dependencies);
            const secondPrepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                secondInspect.localOwnerScopeDigest,
                "--expected-proof-digest",
                secondInspect.proofDigest,
                "--task-id",
                secondInspect.taskId,
                "--idempotency-key",
                secondInspect.prepareIdempotencyKey,
                "--authorized-at",
                "2026-07-29T12:06:00.000Z",
            ], dependencies);
            strict_1.default.equal(firstPrepared.status, "package_ready");
            strict_1.default.equal(secondPrepared.status, "package_ready");
            strict_1.default.notEqual(firstPrepared.packageId, secondPrepared.packageId);
            strict_1.default.equal(firstPrepared.noDispatch, true);
            strict_1.default.equal(secondPrepared.noDispatch, true);
            strict_1.default.equal(firstPrepared.sourceCompletion, false);
            strict_1.default.equal(secondPrepared.outcomeVerified, false);
            const restartedFirst = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.targetTaskId,
            ], dependencies);
            const restartedSecond = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], dependencies);
            strict_1.default.deepEqual(restartedFirst, firstPrepared);
            strict_1.default.deepEqual(restartedSecond, secondPrepared);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("closes predecessor A, then approves and prepares successor B from the sealed terminal frontier", async () => {
        const fixture = await createTerminalPredecessorFixture();
        const approvalDependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        const sessionId = "22222222-2222-4222-8222-222222222222";
        try {
            const firstInspection = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.targetTaskId,
            ], approvalDependencies);
            const firstPrepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                firstInspection.localOwnerScopeDigest,
                "--expected-proof-digest",
                firstInspection.proofDigest,
                "--task-id",
                firstInspection.taskId,
                "--idempotency-key",
                firstInspection.prepareIdempotencyKey,
                "--authorized-at",
                AUTHORIZED_AT,
            ], approvalDependencies);
            strict_1.default.equal(firstPrepared.status, "package_ready");
            strict_1.default.ok(firstPrepared.artifactAccess?.packagePath);
            const firstPackage = JSON.parse(await (0, promises_1.readFile)(firstPrepared.artifactAccess.packagePath, "utf8"));
            const lifecycle = await (0, local_approval_package_js_1.inspectTaskMapLocalLifecycleContext)({
                taskMapRoot: fixture.taskMapRoot,
                ownerRoot: fixture.ownerRoot,
            });
            const completionDependencies = {
                environment: {
                    TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
                },
                loadPredecessorEvidence: async () => ({
                    binding: {
                        runId: lifecycle.projection.runId,
                        inputDigest: lifecycle.projection.inputDigest,
                        projectionDigest: lifecycle.currentness.projectionDigest,
                        projectionFileDigest: lifecycle.projectionFileDigest,
                        currentnessFileDigest: lifecycle.currentnessFileDigest,
                    },
                    taskMapInput: { events: [] },
                }),
                inspectExecution: async () => ({
                    contractVersion: "taskmap-agent-execution-inspection.v1",
                    sessionId,
                    progressState: "report_ready",
                    sessionStatus: "finished",
                    packageId: firstPackage.packageId,
                    packageDigest: firstPackage.packageDigest,
                    preflightId: null,
                    preflightDigest: null,
                    taskId: fixture.targetTaskId,
                    rootId: firstPackage.task.rootId,
                    workspaceBindingDigest: "2".repeat(64),
                    launchedAdapter: "codex_cli",
                    startedAt: "2026-07-29T12:06:00.000Z",
                    finishedAt: "2026-07-29T12:07:00.000Z",
                    artifactCount: 1,
                    artifactReceiptDigest: "3".repeat(64),
                    reportReceiptDigest: "4".repeat(64),
                    reportRelativePaths: ["report.md", "report.html"],
                    sourceWritebackAttempted: false,
                    sourceCompletion: false,
                    outcomeVerified: false,
                }),
            };
            const closed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "close",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.targetTaskId,
                "--session-id",
                sessionId,
                "--decided-at",
                "2026-07-29T12:08:00.000Z",
            ], completionDependencies);
            strict_1.default.equal(closed.status, "closed_in_daobrew");
            strict_1.default.deepEqual(closed.readyTaskIds, [fixture.secondTaskId]);
            const secondInspection = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], approvalDependencies);
            strict_1.default.equal(secondInspection.status, "ready_for_approval");
            const secondPrepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                secondInspection.localOwnerScopeDigest,
                "--expected-proof-digest",
                secondInspection.proofDigest,
                "--task-id",
                secondInspection.taskId,
                "--idempotency-key",
                secondInspection.prepareIdempotencyKey,
                "--authorized-at",
                "2026-07-29T12:09:00.000Z",
            ], approvalDependencies);
            strict_1.default.equal(secondPrepared.status, "package_ready");
            strict_1.default.equal(secondPrepared.taskId, fixture.secondTaskId);
            strict_1.default.equal(secondPrepared.noDispatch, true);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("revalidates the selected ready target before preparation and rejects proof drift", async () => {
        const fixture = await createTwoTargetFixture();
        const dependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        try {
            const inspected = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], dependencies);
            const currentness = JSON.parse(await (0, promises_1.readFile)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), "utf8"));
            const ready = JSON.parse(await (0, promises_1.readFile)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_READY_PROOF_TARGETS_FILENAME), "utf8"));
            await writeReadyProofTargets(fixture.taskMapRoot, fixture.projection, currentness, ready.proofTargets.map((target) => (target.taskId === fixture.secondTaskId
                ? {
                    ...structuredClone(target),
                    outcome: "The selected bounded outcome changed before approval.",
                }
                : structuredClone(target))));
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                inspected.localOwnerScopeDigest,
                "--expected-proof-digest",
                inspected.proofDigest,
                "--task-id",
                inspected.taskId,
                "--idempotency-key",
                inspected.prepareIdempotencyKey,
                "--authorized-at",
                AUTHORIZED_AT,
            ], dependencies), /approval request does not match the current proof/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects prepare after terminal completion until explicit Reopen", async () => {
        const fixture = await createTwoTargetFixture();
        const approvalDependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        const completionDependencies = {
            environment: {
                TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
            },
        };
        try {
            await (0, promises_1.mkdir)(fixture.executionRoot, { mode: 0o700 });
            const inspected = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], approvalDependencies);
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
                "--decided-at",
                AUTHORIZED_AT,
            ], completionDependencies);
            const prepareArguments = [
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                inspected.localOwnerScopeDigest,
                "--expected-proof-digest",
                inspected.proofDigest,
                "--task-id",
                inspected.taskId,
                "--idempotency-key",
                inspected.prepareIdempotencyKey,
                "--authorized-at",
                "2026-07-29T12:06:00.000Z",
            ];
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)(prepareArguments, approvalDependencies), /active terminal disposition; explicit Reopen is required/);
            await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "reopen",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
                "--decided-at",
                "2026-07-29T12:07:00.000Z",
            ], completionDependencies);
            const prepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)(prepareArguments, approvalDependencies);
            strict_1.default.equal(prepared.status, "package_ready");
            strict_1.default.equal(prepared.taskId, fixture.secondTaskId);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("serializes concurrent external completion ahead of package preparation", async () => {
        const fixture = await createTwoTargetFixture();
        try {
            await (0, promises_1.mkdir)(fixture.executionRoot, { mode: 0o700 });
            const inspected = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], {
                environment: { TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1" },
            });
            let lifecycleReadCount = 0;
            let releaseLockedRead;
            let announceLockedRead;
            const lockedReadStarted = new Promise((resolve) => {
                announceLockedRead = resolve;
            });
            const lockedReadRelease = new Promise((resolve) => {
                releaseLockedRead = resolve;
            });
            const completion = (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
                "--decided-at",
                AUTHORIZED_AT,
            ], {
                environment: { TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1" },
                inspectLifecycleContext: async (input) => {
                    const context = await (0, local_approval_package_js_1.inspectTaskMapLocalLifecycleContext)(input);
                    lifecycleReadCount += 1;
                    if (lifecycleReadCount === 2) {
                        announceLockedRead();
                        await lockedReadRelease;
                    }
                    return context;
                },
            });
            await lockedReadStarted;
            const prepare = (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                inspected.localOwnerScopeDigest,
                "--expected-proof-digest",
                inspected.proofDigest,
                "--task-id",
                inspected.taskId,
                "--idempotency-key",
                inspected.prepareIdempotencyKey,
                "--authorized-at",
                "2026-07-29T12:06:00.000Z",
            ], {
                environment: { TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1" },
            });
            const prepareRejection = strict_1.default.rejects(prepare, /active terminal disposition; explicit Reopen is required/);
            releaseLockedRead();
            strict_1.default.equal((await completion).status, "completed_elsewhere");
            await prepareRejection;
            strict_1.default.deepEqual((await (0, promises_1.readdir)(fixture.executionRoot))
                .filter((name) => name.startsWith("authorization_")
                || name.startsWith("package_")
                || name.startsWith("receipt_")), []);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("completes externally from lifecycle context without approval artifacts", async () => {
        const fixture = await createTwoTargetFixture();
        try {
            await (0, promises_1.mkdir)(fixture.executionRoot, { mode: 0o700 });
            await Promise.all([
                (0, promises_1.rm)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork)),
                (0, promises_1.rm)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.body)),
                (0, promises_1.rm)(node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment)),
            ]);
            const completed = await (0, local_completion_cli_js_1.runTaskMapLocalCompletionCli)([
                "complete-elsewhere",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
                "--decided-at",
                AUTHORIZED_AT,
            ], {
                environment: {
                    TASKMAP_LOCAL_COMPLETION_TEST_MODE: "1",
                },
            });
            strict_1.default.equal(completed.status, "completed_elsewhere");
            strict_1.default.ok(completed.completedElsewhereTaskIds.includes(fixture.secondTaskId), "the explicitly selected stable task/work/source identity is terminal");
            strict_1.default.equal(completed.sessionId, null);
            strict_1.default.equal(completed.sourceCompletion, false);
            strict_1.default.equal(completed.outcomeVerified, false);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a resealed ready-target collection bound to another projection", async () => {
        const fixture = await createTwoTargetFixture();
        const dependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        try {
            const readyPath = node_path_1.default.join(fixture.taskMapRoot, local_approval_package_js_1.TASKMAP_READY_PROOF_TARGETS_FILENAME);
            const ready = JSON.parse(await (0, promises_1.readFile)(readyPath, "utf8"));
            const core = {
                ...ready,
                projection: {
                    ...ready.projection,
                    projectionDigest: "0".repeat(64),
                },
            };
            delete core.artifactDigest;
            await writePrivateJson(readyPath, {
                ...core,
                artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-ready-proof-targets.1",
                    ...core,
                }),
            }, true);
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                fixture.secondTaskId,
            ], dependencies), /ready proof targets are not bound to the current projection/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("exposes one bounded inspect then approve-prepare CLI flow", async () => {
        const fixture = await createFixture();
        const dependencies = {
            environment: {
                TASKMAP_LOCAL_APPROVAL_TEST_MODE: "1",
            },
        };
        try {
            const inspect = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies);
            strict_1.default.equal(inspect.status, "ready_for_approval");
            strict_1.default.equal(inspect.approvalRecorded, false);
            strict_1.default.equal(inspect.deliveryStatus, "not_started");
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
                "--task-id",
                inspect.taskId,
            ], dependencies), /ready proof targets are missing/);
            const prepared = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                inspect.localOwnerScopeDigest,
                "--expected-proof-digest",
                inspect.proofDigest,
                "--task-id",
                inspect.taskId,
                "--idempotency-key",
                inspect.prepareIdempotencyKey,
                "--authorized-at",
                AUTHORIZED_AT,
            ], dependencies);
            strict_1.default.equal(prepared.status, "package_ready");
            strict_1.default.equal(prepared.approvalRecorded, true);
            strict_1.default.equal(prepared.deliveryStatus, "not_started");
            strict_1.default.equal(prepared.taskStarted, false);
            strict_1.default.equal(prepared.noDispatch, true);
            strict_1.default.equal(prepared.sourceCompletion, false);
            strict_1.default.equal(prepared.outcomeVerified, false);
            const restartedInspect = await (0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
            ], dependencies);
            strict_1.default.deepEqual(restartedInspect, prepared);
            const output = (0, local_approval_package_cli_js_1.taskMapLocalApprovalCliOutput)(prepared);
            strict_1.default.equal(output, `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(prepared)}\n`);
            strict_1.default.ok(Buffer.byteLength(output, "utf8") < 16 * 1024);
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "inspect",
                "--test-owner-root",
                fixture.ownerRoot,
            ]), /CLI input is invalid/);
            await strict_1.default.rejects((0, local_approval_package_cli_js_1.runTaskMapLocalApprovalCli)([
                "approve-prepare",
                "--test-owner-root",
                fixture.ownerRoot,
                "--expected-owner-scope-digest",
                inspect.localOwnerScopeDigest,
                "--expected-proof-digest",
                inspect.proofDigest,
                "--task-id",
                inspect.taskId,
                "--idempotency-key",
                inspect.prepareIdempotencyKey,
                "--authorized-at",
                "2026-07-29T12:05:00Z",
            ], dependencies), /CLI input is invalid/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
});
