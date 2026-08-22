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
const agent_handoff_preflight_js_1 = require("../src/engine/taskmap/agent-handoff-preflight.js");
const agent_handoff_preflight_js_2 = require("../src/engine/taskmap/agent-handoff-preflight.js");
const agent_handoff_preflight_cli_js_1 = require("../src/engine/taskmap/agent-handoff-preflight-cli.js");
const agent_handoff_manifest_js_1 = require("../src/engine/taskmap/agent-handoff-manifest.js");
const body_context_js_1 = require("../src/engine/taskmap/body-context.js");
const exact_provenance_companion_js_1 = require("../src/engine/taskmap/exact-provenance-companion.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const local_approval_package_js_1 = require("../src/engine/taskmap/local-approval-package.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const GENERATED_AT = "2026-07-29T12:00:00.000Z";
const AUTHORIZED_AT = "2026-07-29T12:05:00.000Z";
const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REPOSITORY_PATH = "tasks/TASKS.md";
const OWNER_MIGRATION_TASK_ID = "tmt_5dd23eaa9cc8c250";
const OWNER_MIGRATION_TASK_TITLE = "Build the migration blocker ledger";
const ADAPTER_VERSION = "strategy-row-adapter.1";
const ADAPTER_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)({
    version: ADAPTER_VERSION,
    binding: "explicit-pointer-to-immutable-row",
});
function sha256(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
function sourceRef(pointerId) {
    return (0, source_contracts_js_1.taskMapContractDigest)(`source:${pointerId}`);
}
function inputFixture(mode) {
    const strategyPointers = [
        {
            id: "strategy-task",
            sourceObjectId: "task-safe-ref",
            ref: "task:target",
            title: "Prepare the local execution package",
        },
        ...(mode === "blocking_predecessor"
            ? [{
                    id: "strategy-predecessor",
                    sourceObjectId: "predecessor-safe-ref",
                    ref: "task:predecessor",
                    title: "Finish the blocking source task",
                }]
            : []),
    ];
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: GENERATED_AT,
        pointers: [
            ...strategyPointers.map((row) => ({
                id: row.id,
                sourceKind: "strategy",
                sourceObjectId: row.sourceObjectId,
                sourceRefHash: sourceRef(row.id),
                canonicalUrl: `https://github.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`,
                sourceVersion: COMMIT,
                authority: "source_system",
                syncMode: "return_only",
                capabilities: ["read_task", "deep_link"],
            })),
            {
                id: "meeting-context",
                sourceKind: "granola",
                sourceObjectId: "meeting-safe-ref",
                sourceRefHash: sourceRef("meeting-context"),
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
            {
                id: "body-context",
                sourceKind: "oura",
                sourceObjectId: "relative-window",
                sourceRefHash: sourceRef("body-context"),
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            },
        ],
        events: [
            ...strategyPointers.map((row, index) => ({
                id: index === 0 ? "task-created" : "predecessor-created",
                pointerId: row.id,
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: `2026-07-2${8 - index}T10:00:00.000Z`,
                observedAt: GENERATED_AT,
                objectRefs: [row.ref],
                title: row.title,
                summary: "One explicit source-owned task row.",
                extractionConfidence: 1,
                sourceStatus: "open",
            })),
            {
                id: "meeting-context-event",
                pointerId: "meeting-context",
                recordKind: "work_context",
                activity: "context_observed",
                occurredAt: "2026-07-29T10:00:00.000Z",
                observedAt: GENERATED_AT,
                dayKey: "2026-07-29",
                objectRefs: ["meeting:safe-ref"],
                title: "Bounded approval context",
                summary: "This unversioned context cannot prove execution provenance.",
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
function brainFixture(input, mode) {
    const hasPredecessor = mode === "blocking_predecessor";
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: (0, source_contracts_js_1.taskMapContractDigest)(`preflight:${mode}`),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: GENERATED_AT,
        roots: [{
                proposalId: "root",
                title: "Local approval and package",
                summary: "Prepare one exact package under explicit human approval.",
                evidenceEventIds: [
                    "task-created",
                    "meeting-context-event",
                    ...(hasPredecessor ? ["predecessor-created"] : []),
                ],
                memberObjectRefs: [
                    "task:target",
                    "meeting:safe-ref",
                    ...(hasPredecessor ? ["task:predecessor"] : []),
                ],
                confidence: 1,
            }],
        tasks: [
            {
                proposalId: "task",
                rootProposalId: "root",
                title: "Prepare the local execution package",
                summary: "Prepare one exact package without dispatch or source mutation.",
                evidenceEventIds: ["task-created", "meeting-context-event"],
                authoritativeTaskEventId: "task-created",
                openState: "open",
                confidence: 1,
            },
            ...(hasPredecessor
                ? [{
                        proposalId: "predecessor",
                        rootProposalId: "root",
                        title: "Finish the blocking source task",
                        summary: "This open predecessor blocks the target task.",
                        evidenceEventIds: ["predecessor-created"],
                        authoritativeTaskEventId: "predecessor-created",
                        openState: "open",
                        confidence: 1,
                    }]
                : []),
        ],
        edges: [
            {
                proposalId: "edge-target",
                fromProposalId: mode === "reverse_route" ? "task" : "root",
                toProposalId: mode === "reverse_route" ? "root" : "task",
                relation: "advances",
                evidenceEventIds: ["task-created"],
                confidence: 1,
            },
            ...(hasPredecessor
                ? [
                    {
                        proposalId: "edge-predecessor-root",
                        fromProposalId: "root",
                        toProposalId: "predecessor",
                        relation: "advances",
                        evidenceEventIds: ["predecessor-created"],
                        confidence: 1,
                    },
                    {
                        proposalId: "edge-blocking",
                        fromProposalId: "task",
                        toProposalId: "predecessor",
                        relation: "depends_on",
                        evidenceEventIds: ["predecessor-created"],
                        confidence: 1,
                    },
                ]
                : []),
        ],
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
    return projection.rejections.length === 0 ? projection : baseline;
}
async function writePrivateJson(filePath, value, canonical = false) {
    const bytes = canonical
        ? (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)
        : `${JSON.stringify(value, null, 2)}\n`;
    await (0, promises_1.writeFile)(filePath, bytes, { mode: 0o600 });
    await (0, promises_1.chmod)(filePath, 0o600);
}
function predecessors(projection, targetTaskId) {
    const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
    return projection.edges.flatMap((edge) => {
        const predecessorId = edge.relation === "depends_on" && edge.from === targetTaskId
            ? edge.to
            : edge.relation === "blocks" && edge.to === targetTaskId
                ? edge.from
                : undefined;
        if (predecessorId === undefined)
            return [];
        const task = taskById.get(predecessorId);
        strict_1.default.ok(task);
        return [{
                taskId: task.id,
                relation: edge.relation,
                reviewState: task.reviewState,
                openState: task.openState,
            }];
    }).sort((left, right) => left.taskId.localeCompare(right.taskId));
}
function currentWork(projection, targetTaskId, override = {}) {
    const task = projection.tasks.find((row) => row.id === targetTaskId);
    const root = projection.roots.find((row) => row.id === task.rootId);
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
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
    const core = {
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
            outcome: override.outcome
                ?? "An immutable approval-bound package is ready locally.",
            input: {
                summary: override.inputSummary
                    ?? "Use only the exact accepted projection and current work.",
                contextPointerIds,
            },
            predecessors: predecessors(projection, task.id),
            doneDefinition: override.doneDefinition ?? [
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
    return {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
    };
}
function bodySignalAssessment(projection, currentness) {
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    strict_1.default.deepEqual({
        runId: currentness.runId,
        inputDigest: currentness.inputDigest,
        projectionDigest: currentness.projectionDigest,
    }, {
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest,
    }, "body-signal assessment fixture must match currentness");
    const matchedDate = "2026-07-29";
    const base = {
        contractVersion: native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
        projection: {
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            projectionDigest,
        },
        physiologicalSnapshotDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            fixture: "taskmap-agent-handoff-preflight",
            generatedAt: GENERATED_AT,
        }),
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
            endDay: matchedDate,
            classifiedDays: 1,
            unknownDays: 0,
        },
        roots: projection.roots
            .map((root) => ({
            rootId: root.id,
            relationship: "not_established",
            observedSignalDates: [matchedDate],
            matchedWorkDates: [matchedDate],
            matchedWorkSources: [
                native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND.granola,
            ],
            matchedDateCount: 1,
            signalSummary: "Readiness + Sleep was below your recent personal range on 2026-07-29 within 2026-07-01 through 2026-07-29.",
            relevanceSummary: "The overlap appeared on fewer than three days, so no repeated relationship is shown.",
            reasonCode: "insufficient_target_backed_days",
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
async function createFixture(mode = "ready") {
    const base = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-agent-preflight-")));
    const ownerRoot = node_path_1.default.join(base, "owner");
    const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
    const executionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    await (0, promises_1.mkdir)(taskMapRoot, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(ownerRoot, 0o700);
    await (0, promises_1.chmod)(taskMapRoot, 0o700);
    const input = inputFixture(mode);
    const projection = acceptedProjection(input, brainFixture(input, mode));
    strict_1.default.deepEqual((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection), [], `invalid ${mode} projection`);
    strict_1.default.equal(projection.rejections.length, 0, `rejected ${mode} projection`);
    strict_1.default.equal(projection.inputDigest, (0, harness_js_1.taskMapInputDigest)(input), `input mismatch for ${mode}`);
    const target = projection.tasks.find((task) => task.taskHomePointerId === "strategy-task");
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
    await Promise.all([
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection), projection),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), currentness),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork(projection, target.id), true),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.body), body),
        writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), bodySignalAssessment(projection, currentness), true),
    ]);
    return {
        base,
        ownerRoot,
        taskMapRoot,
        executionRoot,
        input,
        projection,
        currentness,
        targetTaskId: target.id,
        strategyPointerIds: projection.tasks
            .map((task) => task.taskHomePointerId)
            .filter((pointerId) => pointerId?.startsWith("strategy-") === true),
    };
}
function buildProvenance(fixture, ownerScopeDigest, currentnessFileDigest, overrides = {}) {
    const adapterVersion = overrides.adapterVersion ?? ADAPTER_VERSION;
    const adapterPolicyDigest = overrides.adapterPolicyDigest ?? ADAPTER_POLICY_DIGEST;
    const envelopes = fixture.strategyPointerIds.map((pointerId, index) => {
        const canonicalRowDigest = (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
            repositoryRelativePath: REPOSITORY_PATH,
            sourceObjectId: pointerId,
            rowText: `| P0 | **Source task ${index}** | Owner | Done ${overrides.rowSuffix ?? ""} |`,
        });
        return (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest,
            binding: {
                connectionId: "strategy-read",
                sourceKind: "strategy",
                tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-repository"),
                accountOrPrincipalDigest: ownerScopeDigest,
                grantVersion: "strategy-read-v1",
            },
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: pointerId,
            sourceRevision: COMMIT,
            eventTime: "2026-07-28T10:00:00.000Z",
            contentDigest: canonicalRowDigest,
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
    });
    const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, []);
    const taskByPointer = new Map(fixture.projection.tasks.map((task) => [task.taskHomePointerId, task]));
    const expectedProvenance = {
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        adapterVersion,
        adapterPolicyDigest,
    };
    return {
        expectedProvenance,
        artifact: (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            projection: fixture.projection,
            currentness: fixture.currentness,
            currentnessFileDigest,
            expectedSourceSnapshotDigest: expectedProvenance.sourceSnapshotDigest,
            expectedAdapterVersion: adapterVersion,
            expectedAdapterPolicyDigest: adapterPolicyDigest,
            sourceSnapshot,
            taskBindings: fixture.strategyPointerIds.map((pointerId, index) => ({
                taskId: taskByPointer.get(pointerId).id,
                sourceEnvelopeId: envelopes[index].envelopeId,
                repositoryRelativePath: REPOSITORY_PATH,
                adapterVersion,
                adapterPolicyDigest,
            })),
        }),
    };
}
async function preparedInput(fixture, states = ["met", "unmet", "met"]) {
    const before = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
    });
    await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        executionRoot: fixture.executionRoot,
        expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
        expectedProofDigest: before.inspection.proofDigest,
        taskId: before.inspection.task.taskId,
        idempotencyKey: before.inspection.prepareIdempotencyKey,
        authorizedAt: AUTHORIZED_AT,
    });
    const handoff = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
    });
    const local = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)({
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
    });
    const provenance = buildProvenance(fixture, local.inspection.localOwnerScopeDigest, local.inspection.quartet.currentnessFileDigest);
    const workspaceBinding = (0, agent_handoff_preflight_js_1.buildTaskMapAgentWorkspaceBinding)({
        projectId: `tmproject_${(0, source_contracts_js_1.taskMapContractDigest)("project")}`,
        repositoryIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)("repository"),
        workspaceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)("workspace-revision"),
    });
    strict_1.default.equal(states.length, handoff.manifest.task.doneDefinition.length);
    const criteriaAssessment = (0, agent_handoff_preflight_js_1.buildTaskMapOperationalCriteriaAssessment)({
        handoffManifestDigest: handoff.manifest.handoffManifestDigest,
        operationalContextDigest: local.context.contextDigest,
        exactProvenanceDigest: provenance.artifact.artifactDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest: local.inspection.quartet.currentWorkArtifactDigest,
        taskId: handoff.manifest.task.taskId,
        rootId: handoff.manifest.task.rootId,
        doneDefinition: handoff.manifest.task.doneDefinition,
        criteria: states.map((state, criterionIndex) => ({
            criterionIndex,
            state,
            evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                criterionIndex,
                state,
                workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
            }),
        })),
    });
    const input = {
        taskMapRoot: fixture.taskMapRoot,
        ownerRoot: fixture.ownerRoot,
        exactProvenance: provenance.artifact,
        expectedProvenance: provenance.expectedProvenance,
        expectedOperational: {
            workspaceBindingDigest: workspaceBinding.bindingDigest,
            criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
        },
        workspaceBinding,
        criteriaAssessment,
    };
    return {
        input,
        local,
        handoff,
        provenance,
        workspaceBinding,
        criteriaAssessment,
    };
}
async function fileSnapshot(root) {
    const names = (await (0, promises_1.readdir)(root)).sort();
    return Object.fromEntries(await Promise.all(names.map(async (name) => [
        name,
        sha256(await (0, promises_1.readFile)(node_path_1.default.join(root, name))),
    ])));
}
async function fixedQuartetSnapshot(taskMapRoot) {
    return Object.fromEntries(await Promise.all(Object.values(local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES).map(async (name) => [
        name,
        sha256(await (0, promises_1.readFile)(node_path_1.default.join(taskMapRoot, name))),
    ])));
}
function buildOwnerExactProvenance(input) {
    const sourceText = (0, node_child_process_1.execFileSync)("git", ["-C", input.strategyRepo, "show", `${COMMIT}:${REPOSITORY_PATH}`], { encoding: "utf8" });
    const eventTime = (0, node_child_process_1.execFileSync)("git", ["-C", input.strategyRepo, "show", "-s", "--format=%cI", COMMIT], { encoding: "utf8" }).trim();
    const selectors = new Map([
        ["ptr-strategy-source-aware-e2e", "**Source-aware E2E**"],
        [
            "ptr-strategy-connector-session-foundation",
            "**Connector + session foundation**",
        ],
        [
            "ptr-strategy-taskmap-product-prototype",
            "**Task Map product prototype**",
        ],
        [
            "ptr-strategy-migration-blocker-ledger",
            "**Migration blocker ledger**",
        ],
        [
            "ptr-strategy-meeting-capture-workflow",
            "**Meeting capture workflow**",
        ],
        ["ptr-strategy-spc-application", "SPC 申请"],
        ["ptr-strategy-nyx-contact-onepager", "NYX intro"],
        ["ptr-strategy-yc-closeout", "YC 状态收尾"],
        ["ptr-strategy-market-test-ledger", "Market-test ledger"],
    ]);
    const adapterVersion = "strategy-owner-pointer-row-attestation.1";
    const adapterPolicyDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        version: adapterVersion,
        commit: COMMIT,
        repositoryRelativePath: REPOSITORY_PATH,
        selectors: [...selectors].sort(([left], [right]) => left.localeCompare(right)),
        mappingAuthority: "adapter_attested_not_source_native",
    });
    const binding = {
        connectionId: "strategy-owner-read",
        sourceKind: "strategy",
        tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("DaoBrewStrategy"),
        accountOrPrincipalDigest: input.ownerScopeDigest,
        grantVersion: "strategy-immutable-git-read-v1",
    };
    const currentTaskIds = new Set(input.currentness.taskDispositions
        .filter((row) => row.disposition === "current")
        .map((row) => row.taskId));
    const tasks = input.projection.tasks
        .filter((task) => currentTaskIds.has(task.id))
        .sort((left, right) => left.id.localeCompare(right.id));
    strict_1.default.equal(tasks.length, 9);
    const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
    const envelopeByTask = tasks.map((task) => {
        const pointerId = task.taskHomePointerId;
        strict_1.default.ok(pointerId);
        const selector = selectors.get(pointerId);
        strict_1.default.ok(selector);
        const rows = lines.filter((line) => line.startsWith("|") && line.includes(selector));
        strict_1.default.equal(rows.length, 1);
        const envelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: input.ownerScopeDigest,
            binding,
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: pointerId,
            sourceRevision: COMMIT,
            eventTime,
            contentDigest: (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
                repositoryRelativePath: REPOSITORY_PATH,
                sourceObjectId: pointerId,
                rowText: rows[0],
            }),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
        return { taskId: task.id, envelope };
    });
    const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopeByTask.map((row) => row.envelope), []);
    const expectedProvenance = {
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        adapterVersion,
        adapterPolicyDigest,
    };
    return {
        expectedProvenance,
        artifact: (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
            projection: input.projection,
            currentness: input.currentness,
            currentnessFileDigest: input.currentnessFileDigest,
            expectedSourceSnapshotDigest: expectedProvenance.sourceSnapshotDigest,
            expectedAdapterVersion: adapterVersion,
            expectedAdapterPolicyDigest: adapterPolicyDigest,
            sourceSnapshot,
            taskBindings: envelopeByTask.map((row) => ({
                taskId: row.taskId,
                sourceEnvelopeId: row.envelope.envelopeId,
                repositoryRelativePath: REPOSITORY_PATH,
                adapterVersion,
                adapterPolicyDigest,
            })),
        }),
    };
}
function ownerMigrationLedgerAbsenceDigest(strategyRepo) {
    const sourceTree = (0, node_child_process_1.execFileSync)("git", ["-C", strategyRepo, "rev-parse", `${COMMIT}^{tree}`], { encoding: "utf8" }).trim();
    const mentions = (0, node_child_process_1.execFileSync)("git", [
        "-C",
        strategyRepo,
        "grep",
        "-il",
        "-E",
        "Migration blocker ledger|migration blockers|legacy graph.*ghost.*fixture",
        COMMIT,
        "--",
    ], { encoding: "utf8" }).trim().split("\n").filter(Boolean).map((row) => (row.startsWith(`${COMMIT}:`) ? row.slice(COMMIT.length + 1) : row)).sort();
    const dedicatedArtifacts = mentions.filter((relativePath) => (relativePath !== "tasks/TASKS.md"
        && !relativePath.startsWith("meetings/")
        && !relativePath.startsWith("graphify-out/")));
    strict_1.default.deepEqual(dedicatedArtifacts, []);
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-m4p-owner-unfinished-check.1",
        sourceCommit: COMMIT,
        sourceTree,
        mentionPathDigests: mentions.map((relativePath) => (0, source_contracts_js_1.taskMapContractDigest)(relativePath)),
        excludedMentionClasses: [
            "task_queue",
            "meeting_context",
            "generated_graph",
        ],
        dedicatedArtifactCount: 0,
        criterionState: "unmet",
    });
}
(0, node_test_1.describe)("Task Map agent handoff preflight", () => {
    (0, node_test_1.it)("replays one readable exact-provenance unfinished handoff without starting work", async () => {
        const fixture = await createFixture();
        try {
            const prepared = await preparedInput(fixture);
            const quartetBefore = await fileSnapshot(fixture.taskMapRoot);
            const executionBefore = await fileSnapshot(fixture.executionRoot);
            const first = await (0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input);
            const second = await (0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input);
            const summary = (0, agent_handoff_preflight_js_1.buildTaskMapAgentHandoffPreflightSummary)(first, prepared.handoff.manifest);
            strict_1.default.deepEqual(second, first);
            strict_1.default.equal(summary.preflightDigest, first.preflightDigest);
            strict_1.default.equal(summary.packageDigest, prepared.handoff.manifest.preparation.packageDigest);
            strict_1.default.equal(summary.workspaceBindingDigest, first.workspaceBinding.bindingDigest);
            strict_1.default.equal(summary.criteriaAssessmentDigest, first.criteriaAssessment.assessmentDigest);
            strict_1.default.deepEqual(summary.runtimeRequest, first.runtimeRequest);
            strict_1.default.equal(summary.startIdempotencyKey, first.startIdempotencyKey);
            const staleDigestManifest = structuredClone(prepared.handoff.manifest);
            const forgedPackageDigest = (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-synthetic-forged-package-stale-manifest.1",
                packageDigest: prepared.handoff.manifest.preparation.packageDigest,
            });
            staleDigestManifest.preparation.packageDigest = forgedPackageDigest;
            staleDigestManifest.preparation.packageId =
                `tmlocalpackage_${forgedPackageDigest}`;
            strict_1.default.throws(() => (0, agent_handoff_preflight_js_1.buildTaskMapAgentHandoffPreflightSummary)(first, staleDigestManifest), /M4A handoff manifest digest is invalid/);
            strict_1.default.equal(first.contractVersion, agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION);
            strict_1.default.equal(first.task.taskTitle, "Prepare the local execution package");
            strict_1.default.equal(first.task.rootTitle, "Local approval and package");
            strict_1.default.equal(first.boundary.state, "validated_not_started");
            strict_1.default.equal(first.boundary.taskCreated, false);
            strict_1.default.equal(first.boundary.codexTaskStartAuthorized, false);
            strict_1.default.equal(first.boundary.sourceWritebackAuthorized, false);
            strict_1.default.equal(first.provenance.expectedSourceSnapshotDigest, prepared.input.expectedProvenance.sourceSnapshotDigest);
            strict_1.default.equal(first.provenance.expectedAdapterPolicyDigest, ADAPTER_POLICY_DIGEST);
            strict_1.default.deepEqual(first.provenance.excludedUnversionedContextPointerIds, ["meeting-context"]);
            strict_1.default.equal(first.provenance.routeEdgeDerivationDigests.length, 1);
            strict_1.default.equal(first.privacy.localPathsStored, false);
            const serialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(first);
            strict_1.default.ok(!serialized.includes(fixture.base));
            strict_1.default.ok(!serialized.includes("meeting-safe-ref"));
            strict_1.default.ok(!serialized.includes("Provider-specific raw values"));
            strict_1.default.deepEqual(await fileSnapshot(fixture.taskMapRoot), quartetBefore);
            strict_1.default.deepEqual(await fileSnapshot(fixture.executionRoot), executionBefore);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("derives distinct bounded Codex and Claude Code preflights from one owner-proven package", async () => {
        const fixture = await createFixture();
        try {
            const prepared = await preparedInput(fixture);
            const quartetBefore = await fileSnapshot(fixture.taskMapRoot);
            const executionBefore = await fileSnapshot(fixture.executionRoot);
            const codex = await (0, agent_handoff_preflight_js_2.inspectTaskMapAgentAdapterHandoffPreflight)({
                adapter: "codex",
                preflightInput: prepared.input,
            });
            const claude = await (0, agent_handoff_preflight_js_2.inspectTaskMapAgentAdapterHandoffPreflight)({
                adapter: "claude_code",
                preflightInput: prepared.input,
            });
            strict_1.default.equal(codex.contractVersion, agent_handoff_preflight_js_2.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION);
            strict_1.default.equal(claude.contractVersion, agent_handoff_preflight_js_2.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION);
            strict_1.default.equal(codex.runtimeRequest.operation, "create_fresh_codex_task");
            strict_1.default.equal(claude.runtimeRequest.operation, "create_fresh_claude_code_session");
            strict_1.default.notEqual(codex.adapterPreflightDigest, claude.adapterPreflightDigest);
            strict_1.default.equal(codex.packageDigest, claude.packageDigest);
            strict_1.default.equal(codex.corePreflightDigest, claude.corePreflightDigest);
            strict_1.default.equal(codex.boundary.state, "validated_not_started");
            strict_1.default.equal(claude.boundary.state, "validated_not_started");
            strict_1.default.equal(codex.boundary.processStartAuthorized, false);
            strict_1.default.equal(claude.boundary.processStartAuthorized, false);
            strict_1.default.equal(codex.boundary.adapterSessionStartAuthorized, false);
            strict_1.default.equal(claude.boundary.adapterSessionStartAuthorized, false);
            strict_1.default.equal(codex.boundary.adapterSessionId, null);
            strict_1.default.equal(claude.boundary.adapterSessionId, null);
            strict_1.default.deepEqual(await fileSnapshot(fixture.taskMapRoot), quartetBefore);
            strict_1.default.deepEqual(await fileSnapshot(fixture.executionRoot), executionBefore);
            const forged = structuredClone(prepared.input);
            forged.expectedProvenance.sourceSnapshotDigest =
                (0, source_contracts_js_1.taskMapContractDigest)("forged-owner-package-proof");
            await strict_1.default.rejects((0, agent_handoff_preflight_js_2.inspectTaskMapAgentAdapterHandoffPreflight)({
                adapter: "claude_code",
                preflightInput: forged,
            }), /source snapshot does not match the externally expected digest/);
            await strict_1.default.rejects((0, agent_handoff_preflight_js_2.inspectTaskMapAgentAdapterHandoffPreflight)({
                adapter: "cursor",
                preflightInput: prepared.input,
            }), /adapter must be codex or claude_code/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects all-met, unknown, stale workspace, and external checker mismatches", async () => {
        const fixture = await createFixture();
        try {
            const ready = await preparedInput(fixture);
            const allMet = await preparedInput(fixture, ["met", "met", "met"]);
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(allMet.input), /task is already satisfied/);
            const rehashedCriteria = (0, agent_handoff_preflight_js_1.buildTaskMapOperationalCriteriaAssessment)({
                handoffManifestDigest: ready.handoff.manifest.handoffManifestDigest,
                operationalContextDigest: ready.local.context.contextDigest,
                exactProvenanceDigest: ready.provenance.artifact.artifactDigest,
                workspaceBindingDigest: ready.workspaceBinding.bindingDigest,
                workspaceRevisionDigest: ready.workspaceBinding.workspaceRevisionDigest,
                currentWorkArtifactDigest: ready.local.inspection.quartet.currentWorkArtifactDigest,
                taskId: ready.handoff.manifest.task.taskId,
                rootId: ready.handoff.manifest.task.rootId,
                doneDefinition: ready.handoff.manifest.task.doneDefinition,
                criteria: ready.criteriaAssessment.criteria.map((criterion) => (criterion.criterionIndex === 1
                    ? {
                        ...criterion,
                        evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)("coordinated-evidence-rehash"),
                    }
                    : { ...criterion })),
            });
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...ready.input,
                criteriaAssessment: rehashedCriteria,
            }), /external checker expectation/);
            const unknownAssessment = (0, agent_handoff_preflight_js_1.buildTaskMapOperationalCriteriaAssessment)({
                handoffManifestDigest: allMet.handoff.manifest.handoffManifestDigest,
                operationalContextDigest: allMet.local.context.contextDigest,
                exactProvenanceDigest: allMet.provenance.artifact.artifactDigest,
                workspaceBindingDigest: allMet.workspaceBinding.bindingDigest,
                workspaceRevisionDigest: allMet.workspaceBinding.workspaceRevisionDigest,
                currentWorkArtifactDigest: allMet.local.inspection.quartet.currentWorkArtifactDigest,
                taskId: allMet.handoff.manifest.task.taskId,
                rootId: allMet.handoff.manifest.task.rootId,
                doneDefinition: allMet.handoff.manifest.task.doneDefinition,
                criteria: allMet.handoff.manifest.task.doneDefinition.map((_criterion, criterionIndex) => ({
                    criterionIndex,
                    state: criterionIndex === 1 ? "unknown" : "met",
                    evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)(`unknown:${criterionIndex}`),
                })),
            });
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...allMet.input,
                criteriaAssessment: unknownAssessment,
                expectedOperational: {
                    ...allMet.input.expectedOperational,
                    criteriaAssessmentDigest: unknownAssessment.assessmentDigest,
                },
            }), /unfinishedness is unknown/);
            const changedWorkspace = (0, agent_handoff_preflight_js_1.buildTaskMapAgentWorkspaceBinding)({
                projectId: ready.workspaceBinding.projectId,
                repositoryIdentityDigest: ready.workspaceBinding.repositoryIdentityDigest,
                workspaceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)("changed-workspace"),
            });
            const changedCriteria = (0, agent_handoff_preflight_js_1.buildTaskMapOperationalCriteriaAssessment)({
                handoffManifestDigest: ready.handoff.manifest.handoffManifestDigest,
                operationalContextDigest: ready.local.context.contextDigest,
                exactProvenanceDigest: ready.provenance.artifact.artifactDigest,
                workspaceBindingDigest: changedWorkspace.bindingDigest,
                workspaceRevisionDigest: changedWorkspace.workspaceRevisionDigest,
                currentWorkArtifactDigest: ready.local.inspection.quartet.currentWorkArtifactDigest,
                taskId: ready.handoff.manifest.task.taskId,
                rootId: ready.handoff.manifest.task.rootId,
                doneDefinition: ready.handoff.manifest.task.doneDefinition,
                criteria: ready.criteriaAssessment.criteria.map((criterion) => ({
                    ...criterion,
                    evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                        priorEvidenceDigest: criterion.evidenceDigest,
                        workspaceRevisionDigest: changedWorkspace.workspaceRevisionDigest,
                    }),
                })),
            });
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...ready.input,
                workspaceBinding: changedWorkspace,
                criteriaAssessment: changedCriteria,
            }), /external registry expectation/);
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...ready.input,
                workspaceBinding: changedWorkspace,
                expectedOperational: {
                    ...ready.input.expectedOperational,
                    workspaceBindingDigest: changedWorkspace.bindingDigest,
                },
            }), /criteria assessment is stale or invalid/);
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...allMet.input,
                expectedOperational: {
                    ...allMet.input.expectedOperational,
                    criteriaAssessmentDigest: "f".repeat(64),
                },
            }), /external checker expectation/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects coordinated provenance rehash and a reversed operational route", async () => {
        const fixture = await createFixture();
        try {
            const prepared = await preparedInput(fixture);
            const replacementPolicy = (0, source_contracts_js_1.taskMapContractDigest)("replacement-policy");
            const replacement = buildProvenance(fixture, prepared.local.inspection.localOwnerScopeDigest, prepared.local.inspection.quartet.currentnessFileDigest, {
                adapterVersion: "replacement-adapter.1",
                adapterPolicyDigest: replacementPolicy,
                rowSuffix: "replacement",
            });
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                ...prepared.input,
                exactProvenance: replacement.artifact,
            }), /source snapshot|adapter policy|expected/);
            const reverseHandoff = structuredClone(prepared.handoff);
            reverseHandoff.manifest.task.routeNodeIds =
                [...reverseHandoff.manifest.task.routeNodeIds].reverse();
            const reverseLocal = structuredClone(prepared.local);
            reverseLocal.inspection.task.routeNodeIds =
                [...reverseLocal.inspection.task.routeNodeIds].reverse();
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectHandoff: async () => reverseHandoff,
                inspectOperationalContext: async () => reverseLocal,
            }), /route is not uniquely backed by exact task-source evidence/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects blocking predecessors and a sequential package-read mismatch", async () => {
        const fixture = await createFixture();
        try {
            const prepared = await preparedInput(fixture);
            const blockedHandoff = structuredClone(prepared.handoff);
            const blockedLocal = structuredClone(prepared.local);
            const blockingPredecessor = {
                taskId: `tmt_${"b".repeat(16)}`,
                relation: "depends_on",
                reviewState: "accepted",
                openState: "open",
            };
            blockedHandoff.manifest.task.predecessors = [blockingPredecessor];
            blockedLocal.inspection.task.predecessors = [blockingPredecessor];
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectHandoff: async () => blockedHandoff,
                inspectOperationalContext: async () => blockedLocal,
            }), /blocking nonterminal predecessor/);
            const supersededHandoff = structuredClone(prepared.handoff);
            const supersededLocal = structuredClone(prepared.local);
            const supersededWithoutReplacement = {
                ...blockingPredecessor,
                reviewState: "superseded",
                openState: "superseded",
            };
            supersededHandoff.manifest.task.predecessors = [
                supersededWithoutReplacement,
            ];
            supersededLocal.inspection.task.predecessors = [
                supersededWithoutReplacement,
            ];
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectHandoff: async () => supersededHandoff,
                inspectOperationalContext: async () => supersededLocal,
            }), /blocking nonterminal predecessor/);
            const terminalLocal = structuredClone(prepared.local);
            terminalLocal.context.task.reviewState = "source_complete";
            terminalLocal.context.task.openState = "completed";
            terminalLocal.context.task.sourceStatus = "completed";
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectOperationalContext: async () => terminalLocal,
            }), /task is terminal or no longer operational/);
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectOperationalContext: async (input) => {
                    const value = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)(input);
                    strict_1.default.equal(value.response.status, "package_ready");
                    return {
                        ...value,
                        response: {
                            ...value.response,
                            packageDigest: "f".repeat(64),
                        },
                    };
                },
            }), /do not share one exact package/);
            const privateLocal = structuredClone(prepared.local);
            privateLocal.context.task.taskTitle = "/Users/neo/private-task";
            await strict_1.default.rejects((0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)(prepared.input, {
                inspectOperationalContext: async () => privateLocal,
            }), /privacy boundary/);
        }
        finally {
            await (0, promises_1.rm)(fixture.base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preflights the real migration blocker ledger leaf from byte-identical owner inputs", {
        skip: process.env.TASKMAP_M4P_STRATEGY_REPO === undefined
            || process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT === undefined,
    }, async () => {
        const strategyRepo = await (0, promises_1.realpath)(process.env.TASKMAP_M4P_STRATEGY_REPO);
        const ownerTaskMapRoot = await (0, promises_1.realpath)(process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT);
        const ownerBefore = await fixedQuartetSnapshot(ownerTaskMapRoot);
        const base = await (0, promises_1.realpath)(await (0, promises_1.mkdtemp)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-owner-preflight-")));
        const ownerRoot = node_path_1.default.join(base, "owner");
        const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
        const executionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
        try {
            await (0, promises_1.mkdir)(taskMapRoot, { recursive: true, mode: 0o700 });
            await (0, promises_1.chmod)(ownerRoot, 0o700);
            await (0, promises_1.chmod)(taskMapRoot, 0o700);
            const copiedNames = [
                local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection,
                local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness,
                local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.body,
                local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment,
            ];
            const copiedBytes = new Map();
            for (const name of copiedNames) {
                const bytes = await (0, promises_1.readFile)(node_path_1.default.join(ownerTaskMapRoot, name));
                copiedBytes.set(name, bytes);
                await (0, promises_1.writeFile)(node_path_1.default.join(taskMapRoot, name), bytes, { mode: 0o600 });
                await (0, promises_1.chmod)(node_path_1.default.join(taskMapRoot, name), 0o600);
            }
            const projection = JSON.parse(copiedBytes.get(local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.projection)
                .toString("utf8"));
            const currentness = JSON.parse(copiedBytes.get(local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentness)
                .toString("utf8"));
            const target = projection.tasks.find((task) => task.id === OWNER_MIGRATION_TASK_ID);
            strict_1.default.ok(target);
            strict_1.default.equal(target.title, OWNER_MIGRATION_TASK_TITLE);
            strict_1.default.equal(target.reviewState, "accepted");
            strict_1.default.equal(target.openState, "open");
            strict_1.default.equal(target.sourceStatus, "open");
            strict_1.default.equal(target.taskHomePointerId, "ptr-strategy-migration-blocker-ledger");
            strict_1.default.equal(currentness.taskDispositions.find((row) => row.taskId === target.id)?.disposition, "current");
            await writePrivateJson(node_path_1.default.join(taskMapRoot, local_approval_package_js_1.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), currentWork(projection, target.id, {
                outcome: "A reviewed migration blocker ledger covers every legacy Task Map blocker.",
                inputSummary: "Use the exact Strategy task row and immutable source revision only.",
                doneDefinition: [
                    "Every legacy graph, ghost, task, and fixture blocker into TaskMapProjection is listed.",
                    "Every blocker has an explicit owner and exit test.",
                    "No transcript or artifact body is moved and production data is unchanged.",
                ],
            }), true);
            for (const name of copiedNames) {
                strict_1.default.equal(sha256(await (0, promises_1.readFile)(node_path_1.default.join(taskMapRoot, name))), ownerBefore[name], `${name} must remain byte-identical in the temp root`);
            }
            const before = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)({
                taskMapRoot,
                ownerRoot,
            });
            strict_1.default.equal(before.inspection.task.taskId, OWNER_MIGRATION_TASK_ID);
            const provenance = buildOwnerExactProvenance({
                projection,
                currentness,
                currentnessFileDigest: before.inspection.quartet.currentnessFileDigest,
                strategyRepo,
                ownerScopeDigest: before.inspection.localOwnerScopeDigest,
            });
            await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
                taskMapRoot,
                ownerRoot,
                executionRoot,
                expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
                expectedProofDigest: before.inspection.proofDigest,
                taskId: OWNER_MIGRATION_TASK_ID,
                idempotencyKey: before.inspection.prepareIdempotencyKey,
                authorizedAt: AUTHORIZED_AT,
            });
            const handoff = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
                taskMapRoot,
                ownerRoot,
                expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
            });
            const local = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)({
                taskMapRoot,
                ownerRoot,
                expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
            });
            const repositoryHead = (0, node_child_process_1.execFileSync)("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
            const workspaceBinding = (0, agent_handoff_preflight_js_1.buildTaskMapAgentWorkspaceBinding)({
                projectId: `tmproject_${(0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-owner-project.1",
                    taskId: OWNER_MIGRATION_TASK_ID,
                })}`,
                repositoryIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-owner-repository.1",
                    repository: "DaobrewAI",
                }),
                workspaceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-owner-workspace-revision.1",
                    repositoryHead,
                }),
            });
            const absenceEvidenceDigest = ownerMigrationLedgerAbsenceDigest(strategyRepo);
            const criteriaAssessment = (0, agent_handoff_preflight_js_1.buildTaskMapOperationalCriteriaAssessment)({
                handoffManifestDigest: handoff.manifest.handoffManifestDigest,
                operationalContextDigest: local.context.contextDigest,
                exactProvenanceDigest: provenance.artifact.artifactDigest,
                workspaceBindingDigest: workspaceBinding.bindingDigest,
                workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
                currentWorkArtifactDigest: local.inspection.quartet.currentWorkArtifactDigest,
                taskId: handoff.manifest.task.taskId,
                rootId: handoff.manifest.task.rootId,
                doneDefinition: handoff.manifest.task.doneDefinition,
                criteria: [
                    {
                        criterionIndex: 0,
                        state: "unmet",
                        evidenceDigest: absenceEvidenceDigest,
                    },
                    {
                        criterionIndex: 1,
                        state: "unmet",
                        evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                            domain: "taskmap-owner-ledger-owner-exit-check.1",
                            absenceEvidenceDigest,
                        }),
                    },
                    {
                        criterionIndex: 2,
                        state: "met",
                        evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                            domain: "taskmap-owner-ledger-privacy-check.1",
                            currentWorkPrivacy: {
                                sourceBodiesStored: false,
                                localPathsStored: false,
                                rawBiometricsStored: false,
                            },
                            ownerQuartetDigest: (0, source_contracts_js_1.taskMapContractDigest)(ownerBefore),
                        }),
                    },
                ],
            });
            const preflight = await (0, agent_handoff_preflight_js_1.inspectTaskMapAgentHandoffPreflight)({
                taskMapRoot,
                ownerRoot,
                expectedOwnerScopeDigest: before.inspection.localOwnerScopeDigest,
                exactProvenance: provenance.artifact,
                expectedProvenance: provenance.expectedProvenance,
                expectedOperational: {
                    workspaceBindingDigest: workspaceBinding.bindingDigest,
                    criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
                },
                workspaceBinding,
                criteriaAssessment,
            });
            const summary = (0, agent_handoff_preflight_js_1.buildTaskMapAgentHandoffPreflightSummary)(preflight, handoff.manifest);
            strict_1.default.equal(preflight.task.taskId, OWNER_MIGRATION_TASK_ID);
            strict_1.default.equal(preflight.task.taskTitle, OWNER_MIGRATION_TASK_TITLE);
            strict_1.default.deepEqual(preflight.task.routeNodeIds, [
                target.rootId,
                OWNER_MIGRATION_TASK_ID,
            ]);
            strict_1.default.equal(preflight.provenance.taskProof.pointerId, "ptr-strategy-migration-blocker-ledger");
            strict_1.default.equal(preflight.provenance.taskProof.sourceRevision, COMMIT);
            strict_1.default.equal(preflight.provenance.taskProof.repositoryRelativePath, REPOSITORY_PATH);
            strict_1.default.equal(preflight.criteriaAssessment.criteria[0].state, "unmet");
            strict_1.default.equal(preflight.boundary.state, "validated_not_started");
            strict_1.default.equal(preflight.boundary.dispatchAuthorized, false);
            strict_1.default.equal(preflight.boundary.processStartAuthorized, false);
            strict_1.default.equal(preflight.boundary.codexTaskStartAuthorized, false);
            strict_1.default.equal(preflight.boundary.taskCreated, false);
            strict_1.default.equal(preflight.boundary.codexTaskId, null);
            strict_1.default.equal(preflight.boundary.sourceWritebackAuthorized, false);
            strict_1.default.equal(preflight.boundary.sourceCompletionAuthorized, false);
            strict_1.default.equal(preflight.boundary.outcomeVerificationAuthorized, false);
            strict_1.default.equal(preflight.privacy.sourceBodiesStored, false);
            strict_1.default.equal(preflight.privacy.localPathsStored, false);
            strict_1.default.equal(preflight.privacy.rawBiometricsStored, false);
            strict_1.default.equal(summary.contractVersion, agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION);
            strict_1.default.equal(summary.state, "validated_not_started");
            strict_1.default.equal(summary.preflightDigest, preflight.preflightDigest);
            strict_1.default.equal(summary.packageDigest, handoff.manifest.preparation.packageDigest);
            strict_1.default.equal(summary.taskId, OWNER_MIGRATION_TASK_ID);
            strict_1.default.equal(summary.exactProvenanceDigest, provenance.artifact.artifactDigest);
            strict_1.default.equal(summary.workspaceBindingDigest, preflight.workspaceBinding.bindingDigest);
            strict_1.default.equal(summary.criteriaAssessmentDigest, criteriaAssessment.assessmentDigest);
            strict_1.default.deepEqual(summary.runtimeRequest, preflight.runtimeRequest);
            strict_1.default.equal(summary.startIdempotencyKey, preflight.startIdempotencyKey);
            strict_1.default.equal(summary.taskCreated, false);
            strict_1.default.equal(summary.codexTaskStartAuthorized, false);
            strict_1.default.equal(summary.dispatchAuthorized, false);
            strict_1.default.equal(summary.sourceWritebackAuthorized, false);
            strict_1.default.equal(summary.returnActionsAuthorized, false);
            strict_1.default.equal(summary.sourceCompletionAuthorized, false);
            strict_1.default.equal(summary.outcomeVerificationAuthorized, false);
            const staleDigestManifest = structuredClone(handoff.manifest);
            const forgedPackageDigest = (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-forged-package-for-stale-manifest-regression.1",
                packageDigest: handoff.manifest.preparation.packageDigest,
            });
            staleDigestManifest.preparation.packageDigest = forgedPackageDigest;
            staleDigestManifest.preparation.packageId =
                `tmlocalpackage_${forgedPackageDigest}`;
            strict_1.default.throws(() => (0, agent_handoff_preflight_js_1.buildTaskMapAgentHandoffPreflightSummary)(preflight, staleDigestManifest), /M4A handoff manifest digest is invalid/);
            const serialized = (0, source_contracts_js_1.taskMapContractCanonicalJson)(preflight);
            strict_1.default.ok(!serialized.includes(strategyRepo));
            strict_1.default.ok(!serialized.includes(ownerTaskMapRoot));
            strict_1.default.ok(!serialized.includes("列出 legacy graph"));
            strict_1.default.deepEqual(await fixedQuartetSnapshot(ownerTaskMapRoot), ownerBefore);
        }
        finally {
            await (0, promises_1.rm)(base, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("parses only the closed picker-time adapter preflight CLI surface", () => {
        const ownerRoot = node_path_1.default.join((0, node_os_1.tmpdir)(), "preflight-cli-owner");
        const packagePath = node_path_1.default.join(ownerRoot, "package_fixture.json");
        const workspacePath = node_path_1.default.join((0, node_os_1.tmpdir)(), "preflight-cli-workspace");
        const ownerScopeDigest = (0, source_contracts_js_1.taskMapContractDigest)("preflight-cli-owner");
        const environment = {
            [agent_handoff_preflight_cli_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV]: "1",
        };
        const parsed = (0, agent_handoff_preflight_cli_js_1.parseTaskMapAgentHandoffPreflightCliArguments)([
            "inspect",
            "--adapter", "codex",
            "--package", packagePath,
            "--workspace", workspacePath,
            "--test-owner-root", ownerRoot,
            "--test-owner-scope-digest", ownerScopeDigest,
        ], {
            environment,
        });
        strict_1.default.equal(parsed.adapter, "codex");
        strict_1.default.equal(parsed.packagePath, packagePath);
        strict_1.default.equal(parsed.workspacePath, workspacePath);
        strict_1.default.equal(parsed.ownerRoot, ownerRoot);
        strict_1.default.equal(parsed.taskMapRoot, node_path_1.default.join(ownerRoot, "taskmap"));
        strict_1.default.equal(parsed.expectedCandidateOwnerScopeDigest, ownerScopeDigest);
        for (const malformed of [
            ["inspect", "--adapter", "cursor", "--package", packagePath,
                "--workspace", workspacePath, "--test-owner-root", ownerRoot,
                "--test-owner-scope-digest", ownerScopeDigest],
            ["inspect", "--adapter", "claude_code", "--package", "relative.json",
                "--workspace", workspacePath, "--test-owner-root", ownerRoot,
                "--test-owner-scope-digest", ownerScopeDigest],
            ["inspect", "--adapter", "claude_code", "--package", packagePath,
                "--workspace", "relative", "--test-owner-root", ownerRoot,
                "--test-owner-scope-digest", ownerScopeDigest],
            ["inspect", "--adapter", "codex", "--package", packagePath,
                "--workspace", workspacePath, "--unknown", "value",
                "--test-owner-root", ownerRoot,
                "--test-owner-scope-digest", ownerScopeDigest],
        ]) {
            strict_1.default.throws(() => (0, agent_handoff_preflight_cli_js_1.parseTaskMapAgentHandoffPreflightCliArguments)(malformed, {
                environment,
            }), /invalid/);
        }
    });
});
