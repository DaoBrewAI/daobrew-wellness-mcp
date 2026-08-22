"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHOWCASE_FIXED_NOW = void 0;
exports.buildTaskMapShowcaseSource = buildTaskMapShowcaseSource;
exports.resolveTaskMapShowcaseOwnerRoot = resolveTaskMapShowcaseOwnerRoot;
exports.publishTaskMapShowcase = publishTaskMapShowcase;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const identity_js_1 = require("../../identity.js");
const body_context_js_1 = require("./body-context.js");
const harness_js_1 = require("./harness.js");
const native_current_work_successor_js_1 = require("./native-current-work-successor.js");
const native_refresh_service_js_1 = require("./native-refresh-service.js");
const ready_frontier_js_1 = require("./ready-frontier.js");
const source_contracts_js_1 = require("./source-contracts.js");
const types_js_1 = require("./types.js");
const task_ranking_publication_js_1 = require("./task-ranking-publication.js");
exports.SHOWCASE_FIXED_NOW = "2026-07-31T12:00:00.000Z";
const SHOWCASE_REFRESH_NOW = "2026-07-31T12:01:00.000Z";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
function sourcePointer(id, sourceKind, sourceObjectId, sourceRefHash, authoritative = false) {
    if (authoritative) {
        return {
            id,
            sourceKind,
            sourceObjectId,
            sourceRefHash,
            sourceVersion: "showcase-source-v1",
            authority: "source_system",
            syncMode: "return_only",
            capabilities: ["read_task", "deep_link"],
        };
    }
    return {
        id,
        sourceKind,
        sourceObjectId,
        sourceRefHash,
        sourceVersion: "showcase-source-v1",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    };
}
function buildTaskMapShowcaseSource() {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: exports.SHOWCASE_FIXED_NOW,
        pointers: [
            sourcePointer("ptr-synthetic-authority", "gemini_meet", "taskmap-showcase-loop", "1111111111111111", true),
            sourcePointer("ptr-synthetic-agent", "gemini_meet", "bounded-showcase-session", "2222222222222222"),
            sourcePointer("ptr-synthetic-body", "oura", "relative-recovery-window", "3333333333333333"),
        ],
        events: [
            {
                id: "event-synthetic-source-task",
                pointerId: "ptr-synthetic-authority",
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-07-29T16:00:00.000Z",
                observedAt: "2026-07-31T11:55:00.000Z",
                dayKey: "2026-07-29",
                objectRefs: [
                    "workstream:local-task-map",
                    "task:showcase-loop",
                ],
                title: "Complete the showcase loop",
                summary: "Prove the local Task Map from source refresh through retained execution evidence.",
                extractionConfidence: 1,
                sourceStatus: "in_progress",
                priority: 1,
            },
            {
                id: "event-synthetic-publication",
                pointerId: "ptr-synthetic-agent",
                recordKind: "work_context",
                activity: "commitment_stated",
                occurredAt: "2026-07-29T17:00:00.000Z",
                observedAt: "2026-07-31T11:56:00.000Z",
                dayKey: "2026-07-29",
                objectRefs: [
                    "workstream:local-task-map",
                    "outcome:source-publication",
                ],
                title: "Trace source inputs through publication",
                summary: "Keep projection, currentness, and sidecars bound to one deterministic refresh.",
                extractionConfidence: 0.98,
                bodyJoinEligible: true,
            },
            {
                id: "event-synthetic-execution",
                pointerId: "ptr-synthetic-agent",
                recordKind: "work_context",
                activity: "commitment_stated",
                occurredAt: "2026-07-29T18:00:00.000Z",
                observedAt: "2026-07-31T11:57:00.000Z",
                dayKey: "2026-07-29",
                objectRefs: [
                    "workstream:local-task-map",
                    "outcome:execution-receipts",
                ],
                title: "Verify approval and execution receipts",
                summary: "Keep approval, start, artifact, report, and close as distinct evidence.",
                extractionConfidence: 0.98,
                bodyJoinEligible: true,
            },
            {
                id: "event-synthetic-visual",
                pointerId: "ptr-synthetic-agent",
                recordKind: "work_context",
                activity: "commitment_stated",
                occurredAt: "2026-07-29T19:00:00.000Z",
                observedAt: "2026-07-31T11:58:00.000Z",
                dayKey: "2026-07-29",
                objectRefs: [
                    "workstream:local-task-map",
                    "outcome:signed-forest",
                ],
                title: "Capture the signed Task Map Forest",
                summary: "Retain visual evidence from the repo-built signed app in isolated showcase mode.",
                extractionConfidence: 0.98,
                bodyJoinEligible: true,
            },
            {
                id: "event-synthetic-body",
                pointerId: "ptr-synthetic-body",
                recordKind: "body_context",
                activity: "body_window_observed",
                occurredAt: "2026-07-29T12:00:00.000Z",
                observedAt: "2026-07-31T11:59:00.000Z",
                dayKey: "2026-07-29",
                objectRefs: ["body-day:2026-07-29"],
                title: "Recovery window was below the recent personal range",
                summary: "Relative category only; related in time and not proof of cause.",
                extractionConfidence: 1,
                bodyCategory: "below_baseline",
                bodyAxis: "composite_recovery",
            },
        ],
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "showcase-reviewed",
        model: "deterministic-v1",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: exports.SHOWCASE_FIXED_NOW,
        roots: [{
                proposalId: "root-local-task-map",
                title: "Make the local Task Map trustworthy end to end",
                summary: "One source-linked workstream proves publication, execution evidence, and the signed Forest.",
                evidenceEventIds: [
                    "event-synthetic-source-task",
                    "event-synthetic-publication",
                    "event-synthetic-execution",
                    "event-synthetic-visual",
                ],
                memberObjectRefs: [
                    "workstream:local-task-map",
                    "task:showcase-loop",
                    "outcome:source-publication",
                    "outcome:execution-receipts",
                    "outcome:signed-forest",
                ],
                confidence: 0.99,
            }],
        tasks: [
            {
                proposalId: "task-showcase-loop",
                rootProposalId: "root-local-task-map",
                title: "Complete the showcase loop",
                summary: "Prove source refresh, approval, execution, report, and close without owner data.",
                evidenceEventIds: [
                    "event-synthetic-source-task",
                    "event-synthetic-publication",
                ],
                authoritativeTaskEventId: "event-synthetic-source-task",
                openState: "open",
                confidence: 1,
            },
            {
                proposalId: "task-showcase-publication",
                rootProposalId: "root-local-task-map",
                title: "Trace source inputs through publication",
                summary: "Verify accepted projection, currentness, current work, and body disclosure.",
                evidenceEventIds: [
                    "event-synthetic-source-task",
                    "event-synthetic-publication",
                ],
                openState: "open",
                confidence: 0.98,
            },
            {
                proposalId: "task-showcase-execution",
                rootProposalId: "root-local-task-map",
                title: "Verify approval and execution receipts",
                summary: "Prove each authorization and execution lifecycle transition independently.",
                evidenceEventIds: [
                    "event-synthetic-source-task",
                    "event-synthetic-execution",
                ],
                openState: "open",
                confidence: 0.98,
            },
            {
                proposalId: "task-showcase-visual",
                rootProposalId: "root-local-task-map",
                title: "Capture the signed Task Map Forest",
                summary: "Record the reference-like hierarchy from the signed local app.",
                evidenceEventIds: [
                    "event-synthetic-source-task",
                    "event-synthetic-visual",
                ],
                openState: "open",
                confidence: 0.98,
            },
        ],
        edges: [
            ["publication", "task-showcase-publication"],
            ["execution", "task-showcase-execution"],
            ["visual", "task-showcase-visual"],
            ["loop", "task-showcase-loop"],
        ].map(([suffix, taskProposalId]) => ({
            proposalId: `edge-root-${suffix}`,
            fromProposalId: "root-local-task-map",
            toProposalId: taskProposalId,
            relation: "advances",
            evidenceEventIds: ["event-synthetic-source-task"],
            confidence: 1,
        })),
    };
    const supplementalWorkstreams = [
        {
            proposalId: "root-reviewable-evidence",
            objectRef: "workstream:reviewable-evidence",
            title: "Keep showcase evidence easy to review",
            summary: "Compiler, test, visual, and handoff evidence stay distinct and easy to audit.",
            tasks: [
                {
                    proposalId: "task-compiler-evidence",
                    objectRef: "outcome:compiler-evidence",
                    title: "Record compiler and test evidence",
                    summary: "Retain focused and full-gate results with their exact truth boundaries.",
                },
                {
                    proposalId: "task-forest-comparison",
                    objectRef: "outcome:forest-comparison",
                    title: "Compare the deterministic Forest",
                    summary: "Keep the accepted hierarchy and visual-density comparison reproducible.",
                },
                {
                    proposalId: "task-cto-handoff",
                    objectRef: "outcome:cto-handoff",
                    title: "Package the CTO review handoff",
                    summary: "Separate verified evidence, known gaps, and reviewer decisions.",
                },
            ],
        },
        {
            proposalId: "root-isolated-refresh",
            objectRef: "workstream:isolated-refresh",
            title: "Keep source refresh isolated from owner state",
            summary: "Root guards, source truth, and sanitized provenance keep the showcase separate.",
            tasks: [
                {
                    proposalId: "task-owner-root-guard",
                    objectRef: "outcome:owner-root-guard",
                    title: "Verify the owner-root guard",
                    summary: "Reject normal, relative, redirected, and already-used owner roots.",
                },
                {
                    proposalId: "task-unavailable-source-truth",
                    objectRef: "outcome:unavailable-source-truth",
                    title: "Retain unavailable source truth",
                    summary: "Show two current and two unavailable source families without inference.",
                },
                {
                    proposalId: "task-sanitized-provenance",
                    objectRef: "outcome:sanitized-provenance",
                    title: "Audit sanitized provenance",
                    summary: "Keep citations useful without identities, source bodies, paths, or tokens.",
                },
            ],
        },
    ];
    supplementalWorkstreams.forEach((workstream, rootIndex) => {
        const eventIds = [];
        const memberObjectRefs = [workstream.objectRef];
        workstream.tasks.forEach((task, taskIndex) => {
            const eventId = `event-synthetic-${task.proposalId}`;
            const pointerId = `ptr-synthetic-${task.proposalId}`;
            input.pointers.push(sourcePointer(pointerId, "codex_session", task.objectRef, (40 + rootIndex * 10 + taskIndex)
                .toString(16)
                .padStart(16, "0"), true));
            eventIds.push(eventId);
            memberObjectRefs.push(task.objectRef);
            input.events.push({
                id: eventId,
                pointerId,
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: `2026-07-${27 + taskIndex}T${16 + rootIndex}:00:00.000Z`,
                observedAt: `2026-07-31T11:${40 + rootIndex * 5 + taskIndex}:00.000Z`,
                dayKey: `2026-07-${27 + taskIndex}`,
                objectRefs: [workstream.objectRef, task.objectRef],
                title: task.title,
                summary: task.summary,
                extractionConfidence: 0.97,
                sourceStatus: "in_progress",
                priority: (rootIndex === 0 ? 1 : 0.5) - taskIndex * 0.01,
            });
            brain.tasks.push({
                proposalId: task.proposalId,
                rootProposalId: workstream.proposalId,
                title: task.title,
                summary: task.summary,
                evidenceEventIds: [eventId],
                authoritativeTaskEventId: eventId,
                openState: "open",
                confidence: 0.97,
            });
            brain.edges.push({
                proposalId: `edge-${workstream.proposalId}-${taskIndex + 1}`,
                fromProposalId: workstream.proposalId,
                toProposalId: task.proposalId,
                relation: "advances",
                evidenceEventIds: [eventId],
                confidence: 1,
            });
        });
        brain.roots.push({
            proposalId: workstream.proposalId,
            title: workstream.title,
            summary: workstream.summary,
            evidenceEventIds: eventIds,
            memberObjectRefs,
            confidence: 0.97,
        });
    });
    brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
    const bodyContext = {
        contractVersion: "oura-taskmap-context.v1",
        generatedAt: exports.SHOWCASE_FIXED_NOW,
        sourceKind: "oura",
        coverage: {
            startDay: "2026-07-23",
            endDay: "2026-07-29",
            dailyActivityDays: 0,
            dailyReadinessDays: 7,
            dailySleepDays: 7,
            sleepRecords: 0,
            heartRateSamples: 0,
            classifiedDays: 7,
            unknownDays: 0,
        },
        classifier: {
            version: "showcase-relative-v1",
            axis: "composite_recovery",
            method: "Relative category from a deterministic sanitized seven-day window.",
            minimumMetricsPerDay: 2,
            lowerThreshold: -1,
            upperThreshold: 1,
        },
        days: Array.from({ length: 7 }, (_, index) => {
            const day = 23 + index;
            return {
                dayKey: `2026-07-${day}`,
                axis: "composite_recovery",
                category: day === 29
                    ? "below_baseline"
                    : "within_baseline",
            };
        }),
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
        },
    };
    return {
        input,
        brain,
        bodyContext,
        sourceStates: [
            { source: "agent_session", state: "current" },
            { source: "meeting_notes", state: "current" },
            { source: "calendar", state: "unavailable" },
            { source: "body", state: "current" },
        ],
    };
}
function pathContains(parent, candidate) {
    const relative = node_path_1.default.relative(parent, candidate);
    return relative === ""
        || (!relative.startsWith("..") && !node_path_1.default.isAbsolute(relative));
}
function resolveTaskMapShowcaseOwnerRoot(ownerRoot, homeDirectory = (0, node_os_1.homedir)()) {
    const trimmed = ownerRoot.trim();
    if (trimmed.length === 0
        || !node_path_1.default.isAbsolute(trimmed)
        || node_path_1.default.normalize(trimmed) !== trimmed
        || CONTROL_CHARACTER.test(trimmed)) {
        throw new TypeError("Task Map showcase requires an absolute isolated owner root");
    }
    const normalizedHome = node_path_1.default.resolve(homeDirectory);
    const normalOwnerRoot = node_path_1.default.join(normalizedHome, "Library", "Application Support", "DaoBrew");
    if (pathContains(normalOwnerRoot, trimmed)
        || pathContains(trimmed, normalOwnerRoot)) {
        throw new Error("Task Map showcase refuses the normal owner root");
    }
    if (!(0, node_fs_1.existsSync)(trimmed)) {
        throw new Error("Task Map showcase owner root must already exist");
    }
    const metadata = (0, node_fs_1.lstatSync)(trimmed);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Task Map showcase owner root must be symlink-free");
    }
    const canonical = (0, node_fs_1.realpathSync)(trimmed);
    if (canonical !== trimmed) {
        throw new Error("Task Map showcase owner root must be symlink-free");
    }
    return canonical;
}
function showcaseSlice(source, ownerScopeDigest) {
    const revision = (0, source_contracts_js_1.taskMapContractDigest)(`showcase:${source}:revision-v1`);
    return {
        ownerScopeDigest,
        revision,
        sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)(`showcase:${source}:slice-v1`),
        value: {
            contractVersion: "taskmap-native-safe-source-slice.v1",
            ownerScopeDigest,
            source,
            recordCount: 1,
            records: [{
                    identityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`showcase:${source}:identity-v1`),
                    revision,
                    occurredAtMs: Date.parse("2026-07-29T18:00:00.000Z"),
                }],
            metadata: {
                showcase: true,
                privacySafe: true,
            },
        },
    };
}
function showcaseRanking(projection, ownerScopeDigest) {
    return (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
        projection,
        ownerScopeDigest,
        sourceStatuses: [
            {
                source: "agent_session",
                disposition: "fresh",
                sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)("showcase:agent_session:slice-v1"),
            },
            {
                source: "meeting_notes",
                disposition: "fresh",
                sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)("showcase:meeting_notes:slice-v1"),
            },
            {
                source: "calendar",
                disposition: "unavailable",
                sliceDigest: null,
            },
            {
                source: "body",
                disposition: "fresh",
                sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)("showcase:body:slice-v1"),
            },
        ],
    });
}
function currentWorkForShowcase(projection, currentness) {
    const task = projection.tasks.find((row) => (row.title === "Complete the showcase loop"
        && row.reviewState === "accepted"
        && row.openState === "open"));
    if (task === undefined) {
        throw new Error("Task Map showcase approval target is unavailable");
    }
    const root = projection.roots.find((row) => row.id === task.rootId);
    if (root === undefined || task.returnRoute.state !== "source_owned") {
        throw new Error("Task Map showcase source route is unavailable");
    }
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    const contextPointerIds = [...new Set([
            ...task.originPointerIds,
            ...task.citations.map((citation) => citation.pointerId),
        ])]
        .filter((pointerId) => sourceById.get(pointerId)?.sourceKind !== "oura")
        .sort();
    const core = {
        contractVersion: "taskmap-current-work.v1",
        projection: {
            contractVersion: projection.contractVersion,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            projectionDigest: currentness.projectionDigest,
        },
        currentGoal: {
            rootId: root.id,
            title: "Make the local Task Map trustworthy end to end",
            accepted: true,
        },
        nextTaskToProve: {
            taskId: task.id,
            rootId: root.id,
            outcome: "Complete the showcase loop with a signed app and retained receipts.",
            input: {
                summary: "Use only the deterministic source citations already published in this isolated showcase.",
                contextPointerIds,
            },
            predecessors: [],
            doneDefinition: [
                "Projection, currentness, current work, and body context validate.",
                "Approval and start remain separate explicit actions.",
                "Execution returns receipts, an artifact, and an HTML report.",
                "Close prunes active work without deleting retained evidence.",
            ],
            permission: {
                requiresExplicitApproval: true,
                approvalGranted: false,
            },
            returnTarget: {
                state: "source_owned",
                pointerId: task.returnRoute.pointerId,
            },
            executable: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    const currentWork = {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
    };
    return (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(currentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(currentWork), "utf8"), projection, currentness);
}
async function writeCanonicalOwnerArtifact(filePath, value) {
    await (0, promises_1.writeFile)(filePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await (0, promises_1.chmod)(filePath, 0o600);
}
async function stageReferencedShowcasePredecessor(taskMapRoot, ownerScopeDigest, candidate, currentWork) {
    const generationId = (0, source_contracts_js_1.taskMapContractDigest)(candidate);
    const generationRoot = node_path_1.default.join(taskMapRoot, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATIONS_DIRECTORY);
    const generationDirectory = node_path_1.default.join(generationRoot, generationId);
    await (0, promises_1.mkdir)(generationRoot, { recursive: false, mode: 0o700 });
    await (0, promises_1.mkdir)(generationDirectory, { recursive: false, mode: 0o700 });
    await (0, promises_1.chmod)(generationRoot, 0o700);
    await (0, promises_1.chmod)(generationDirectory, 0o700);
    const artifacts = {
        projection: {
            filename: "taskmap-projection.v1.json",
            sha256: (0, source_contracts_js_1.taskMapContractDigest)(candidate.projection),
        },
        currentness: {
            filename: "taskmap-currentness.v1.json",
            sha256: (0, source_contracts_js_1.taskMapContractDigest)(candidate.currentness),
        },
        currentWork: {
            filename: "taskmap-current-work.v1.json",
            sha256: (0, source_contracts_js_1.taskMapContractDigest)(currentWork),
        },
        ranking: {
            filename: task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME,
            sha256: (0, source_contracts_js_1.taskMapContractDigest)(candidate.ranking),
        },
    };
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, artifacts.projection.filename), candidate.projection);
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, artifacts.currentness.filename), candidate.currentness);
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, artifacts.currentWork.filename), currentWork);
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, artifacts.ranking.filename), candidate.ranking);
    const readyProofTargets = (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
        projection: candidate.projection,
        currentness: candidate.currentness,
        proofTargets: [{
                ...structuredClone(currentWork.nextTaskToProve),
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
            }],
    });
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, native_refresh_service_js_1.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME), readyProofTargets);
    const manifest = {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION,
        generationId,
        ownerScopeDigest,
        graphInputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-showcase-bootstrap-graph.v1",
            ownerScopeDigest,
        }),
        candidateDigest: generationId,
        requestedAtMs: Date.parse(exports.SHOWCASE_FIXED_NOW),
        artifacts,
    };
    await writeCanonicalOwnerArtifact(node_path_1.default.join(generationDirectory, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME), manifest);
    await writeCanonicalOwnerArtifact(node_path_1.default.join(taskMapRoot, native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME), {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
        generationId,
        ownerScopeDigest,
        manifestDigest: (0, source_contracts_js_1.taskMapContractDigest)(manifest),
    });
}
function showcaseBodySignalAssessment(projection, physiologicalSnapshotDigest) {
    const observedDate = "2026-07-29";
    const base = {
        contractVersion: native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
        projection: {
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            projectionDigest: (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest,
        },
        physiologicalSnapshotDigest,
        assessedAt: SHOWCASE_REFRESH_NOW,
        sourceFamily: "physiological",
        signal: {
            axis: "composite_recovery",
            displayName: "Readiness + Sleep",
            comparison: "relative_to_recent_personal_range",
            targetCategory: "below_baseline",
        },
        coverage: {
            startDay: observedDate,
            endDay: observedDate,
            classifiedDays: 1,
            unknownDays: 0,
        },
        roots: projection.roots.map((root) => {
            const matchedWorkSources = [...new Set(root.citations.flatMap((citation) => citation.sourceKind === "codex_session"
                    ? ["Codex sessions"]
                    : citation.sourceKind === "gemini_meet"
                        ? ["Gemini meeting notes"]
                        : []))].sort();
            return {
                rootId: root.id,
                relationship: "body_informed",
                evidenceLevel: "body_informed",
                observedSignalDates: [observedDate],
                matchedWorkDates: [observedDate],
                matchedWorkSources,
                matchedDateCount: 1,
                signalSummary: "Readiness + Sleep was below your recent personal range on 2026-07-29 within 2026-07-29 through 2026-07-29.",
                relevanceSummary: `Body-informed: accepted work in this workstream occurred on 2026-07-29, when recovery was below your recent personal range in ${matchedWorkSources.join(" and ")}. This is an association, not proof of cause.`,
                reasonCode: null,
            };
        }).sort((left, right) => left.rootId.localeCompare(right.rootId)),
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
async function publishTaskMapShowcase(options) {
    const ownerRoot = resolveTaskMapShowcaseOwnerRoot(options.ownerRoot, options.homeDirectory);
    const taskMapRoot = node_path_1.default.join(ownerRoot, "taskmap");
    const runtimeRoot = node_path_1.default.join(ownerRoot, "taskmap-refresh");
    if ((0, node_fs_1.existsSync)(taskMapRoot) || (0, node_fs_1.existsSync)(runtimeRoot)) {
        throw new Error("Task Map showcase owner root must be unused");
    }
    await (0, promises_1.mkdir)(taskMapRoot, { recursive: false, mode: 0o700 });
    await (0, promises_1.mkdir)(runtimeRoot, { recursive: false, mode: 0o700 });
    await (0, promises_1.chmod)(taskMapRoot, 0o700);
    await (0, promises_1.chmod)(runtimeRoot, 0o700);
    const showcaseOwnerPlan = await (0, identity_js_1.loadConfirmedTaskMapOwner)(options.homeDirectory ?? (0, node_os_1.homedir)());
    if (!showcaseOwnerPlan.ok) {
        throw new Error(showcaseOwnerPlan.reason);
    }
    const projectionPath = node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json");
    const currentnessPath = node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json");
    const currentWorkPath = node_path_1.default.join(taskMapRoot, "taskmap-current-work.v1.json");
    const bodyContextPath = node_path_1.default.join(taskMapRoot, "taskmap-body-context.v1.json");
    const bodyAssessmentPath = node_path_1.default.join(taskMapRoot, native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME);
    const source = buildTaskMapShowcaseSource();
    const predecessorProjection = (0, harness_js_1.buildTaskMapProjection)(source.input, source.brain, { arm: "E4", now: exports.SHOWCASE_FIXED_NOW });
    if (predecessorProjection.runStatus !== "accepted"
        || (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(predecessorProjection)
            .length > 0) {
        throw new Error("Task Map showcase predecessor projection was rejected");
    }
    const predecessorCurrentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(predecessorProjection, null);
    const predecessorCurrentWork = currentWorkForShowcase(predecessorProjection, predecessorCurrentness);
    const predecessorRanking = showcaseRanking(predecessorProjection, showcaseOwnerPlan.owner.ownerScopeDigest);
    // This excluded developer harness stages one complete referenced bootstrap
    // predecessor before the refresh service starts. Fixed files below are only
    // compatibility output; the same verified generation reference used by
    // production readers controls visibility.
    await writeCanonicalOwnerArtifact(projectionPath, predecessorProjection);
    await writeCanonicalOwnerArtifact(currentnessPath, predecessorCurrentness);
    await writeCanonicalOwnerArtifact(currentWorkPath, predecessorCurrentWork);
    await stageReferencedShowcasePredecessor(taskMapRoot, showcaseOwnerPlan.owner.ownerScopeDigest, {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection: predecessorProjection,
        currentness: predecessorCurrentness,
        ranking: predecessorRanking,
    }, predecessorCurrentWork);
    const successorProjection = (0, harness_js_1.buildTaskMapProjection)(source.input, source.brain, {
        arm: "E4",
        now: SHOWCASE_REFRESH_NOW,
        previousProjection: predecessorProjection,
    });
    const successorCurrentness = (0, native_refresh_service_js_1.currentnessForNativeProjection)(successorProjection, predecessorCurrentness);
    const successorCandidate = {
        contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection: successorProjection,
        currentness: successorCurrentness,
        ranking: showcaseRanking(successorProjection, showcaseOwnerPlan.owner.ownerScopeDigest),
    };
    const service = new native_refresh_service_js_1.TaskMapNativeRefreshService({
        confirmedOwner: showcaseOwnerPlan.owner,
        runtimeRoot,
        projectionPath,
        currentnessPath,
        collectors: {
            agent_session: async () => showcaseSlice("agent_session", showcaseOwnerPlan.owner.ownerScopeDigest),
            meeting_notes: async () => showcaseSlice("meeting_notes", showcaseOwnerPlan.owner.ownerScopeDigest),
            calendar: async () => {
                throw new Error("Showcase calendar is intentionally unavailable");
            },
            body: async () => showcaseSlice("body", showcaseOwnerPlan.owner.ownerScopeDigest),
        },
        graphBuilder: async (input) => {
            const freshSources = input.graphInput.sources
                .filter((row) => row.value !== null)
                .map((row) => row.source)
                .sort();
            if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(freshSources)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)([
                    "agent_session",
                    "body",
                    "meeting_notes",
                ])) {
                throw new Error("Task Map showcase source truth changed");
            }
            return {
                candidateDigest: (0, source_contracts_js_1.taskMapContractDigest)(successorCandidate),
                candidate: successorCandidate,
            };
        },
        nowMs: () => Date.parse(SHOWCASE_REFRESH_NOW),
    });
    const refresh = await service.requestRefresh("manual");
    if (refresh.refreshStatus !== "published"
        || refresh.publicationVerified !== true) {
        throw new Error("Task Map showcase native refresh did not publish");
    }
    const projectionBytes = await (0, promises_1.readFile)(projectionPath);
    const currentnessBytes = await (0, promises_1.readFile)(currentnessPath);
    const currentWorkBytes = await (0, promises_1.readFile)(currentWorkPath);
    const projection = JSON.parse(projectionBytes.toString("utf8"));
    const currentness = JSON.parse(currentnessBytes.toString("utf8"));
    const currentWork = JSON.parse(currentWorkBytes.toString("utf8"));
    if ((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection).length > 0
        || currentness.projectionDigest
            !== (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest) {
        throw new Error("Task Map showcase publication failed strict validation");
    }
    (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(currentWork, currentWorkBytes, projection, currentness);
    const body = (0, body_context_js_1.buildTaskMapBodyContextDisclosure)(source.input, projection, source.bodyContext);
    await writeCanonicalOwnerArtifact(bodyContextPath, body);
    const bodyAssessment = showcaseBodySignalAssessment(projection, (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-showcase-physiological-snapshot.1",
        bodyContext: source.bodyContext,
    }));
    await writeCanonicalOwnerArtifact(bodyAssessmentPath, bodyAssessment);
    const persistedBody = JSON.parse((await (0, promises_1.readFile)(bodyContextPath)).toString("utf8"));
    if (persistedBody.projectionRunId !== projection.runId
        || persistedBody.projectionInputDigest !== projection.inputDigest
        || persistedBody.nodes.length === 0) {
        throw new Error("Task Map showcase body disclosure failed validation");
    }
    return { refresh };
}
