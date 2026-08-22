"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const local_completion_overlay_js_1 = require("../src/engine/taskmap/local-completion-overlay.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const digest = (character) => character.repeat(64);
const OWNER_SCOPE = digest("a");
// GOLDEN_* digests re-pinned 2026-08-04 for the Unicode-scalar canonical
// key sort (see source-contracts.ts canonicalJson note).
const GOLDEN_ALIAS_SIGNATURE = "7c556e4f3064078d6246696b3cf550e7f5d1a2800b9cded0b43d65029572e594";
const GOLDEN_COMPLETION_IDENTITY = "536307b4006d737c74f6d9bd753d07951f80d6dae2446575dc8aa1213e1c142a";
const GOLDEN_CLOSE_DECISION = "d901ee3121dc0d9c687ecf65b58e3a5adaed44a87a26122b07e330ccda21fde2";
const GOLDEN_REOPEN_DECISION = "3526c58ee63c13f90e18101d5bc0d1e02e9704f426c12da6799983bd5b92516c";
const GOLDEN_CLOSED_OVERLAY = "b16bd9864802cc387a74102743a172b4b26f13f9b59bc53bc424d3d9c6b4b028";
const PROJECTION = {
    projectionContractVersion: "taskmap.v1",
    runId: "tmrun_completion",
    inputDigest: digest("b"),
    generatedAt: "2026-07-30T08:00:00.000Z",
    projectionDigest: digest("c"),
};
function identity(overrides = {}) {
    return (0, local_completion_overlay_js_1.buildTaskMapLocalCompletionIdentity)({
        taskId: overrides.taskId ?? "tmt_complete_loop",
        rootId: overrides.rootId ?? "tmr_taskmap_product",
        workId: overrides.workId ?? "tmwork_complete_loop",
        canonicalSourceObjectKeyDigest: overrides.canonicalSourceObjectKeyDigest ?? digest("d"),
        aliasSourceObjectKeyDigests: overrides.aliasSourceObjectKeyDigests ?? [digest("e")],
        sourceIdentityDigest: overrides.sourceIdentityDigest ?? digest("f"),
        sourceRevision: overrides.sourceRevision ?? "source-revision-1",
        sourceRevisionObservedAt: overrides.sourceRevisionObservedAt
            ?? "2026-07-30T08:01:00.000Z",
    });
}
function approvedPackage(work, projection = PROJECTION) {
    const core = {
        contractVersion: "taskmap-local-execution-package.v1",
        approvalAuthorizationId: `tmlocalauthorization_${digest("5")}`,
        approvalAuthorizationDigest: digest("5"),
        localOwnerScopeDigest: OWNER_SCOPE,
        proofDigest: digest("6"),
        quartet: {
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            projectionDigest: projection.projectionDigest,
            projectionFileDigest: digest("7"),
            currentnessFileDigest: digest("8"),
            currentWorkFileDigest: digest("9"),
            bodyFileDigest: digest("0"),
            bodyAssessmentFileDigest: digest("a"),
            bodyAssessmentArtifactDigest: digest("b"),
            physiologicalSnapshotDigest: digest("c"),
            currentWorkArtifactDigest: digest("d"),
        },
        task: {
            taskId: work.taskId,
            rootId: work.rootId,
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
function reportReady(work, overrides = {}, executionPackage = approvedPackage(work)) {
    return {
        contractVersion: local_completion_overlay_js_1.TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION,
        sessionId: "11111111-1111-4111-8111-111111111111",
        progressState: "report_ready",
        sessionStatus: "finished",
        packageId: executionPackage.packageId,
        packageDigest: executionPackage.packageDigest,
        preflightId: null,
        preflightDigest: null,
        taskId: work.taskId,
        rootId: work.rootId,
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
        ...overrides,
    };
}
function close(work) {
    const executionPackage = approvedPackage(work);
    const result = (0, local_completion_overlay_js_1.decideTaskMapLocalCompletion)({
        decision: "close",
        explicitOwnerAction: true,
        localOwnerScopeDigest: OWNER_SCOPE,
        identity: work,
        approvedPackage: executionPackage,
        reportReady: reportReady(work, {}, executionPackage),
        decidedAt: "2026-07-30T08:04:00.000Z",
    });
    strict_1.default.equal(result.decision, "close");
    return result.closeRecord;
}
function route(leafCandidates) {
    return [
        {
            nodeId: "tmr_taskmap_product",
            title: "Make Task Map a daily-use product",
            kind: "root",
            parentNodeId: null,
            candidate: null,
        },
        {
            nodeId: "tmm_close_loop",
            title: "Close the product loop",
            kind: "intermediate",
            parentNodeId: "tmr_taskmap_product",
            candidate: null,
        },
        {
            nodeId: "tmm_review_result",
            title: "Review the returned result",
            kind: "intermediate",
            parentNodeId: "tmm_close_loop",
            candidate: null,
        },
        ...leafCandidates.map((row) => ({
            nodeId: row.identity.taskId,
            title: row.title ?? "Complete the loop",
            kind: "leaf",
            parentNodeId: "tmm_review_result",
            candidate: {
                identity: row.identity,
                evidenceKind: row.evidenceKind ?? "authoritative_source",
            },
        })),
    ];
}
(0, node_test_1.describe)("Task Map local Close / Keep open contract", () => {
    (0, node_test_1.it)("records explicit post-report Close as an immutable exact-bound Closed in DaoBrew fact", () => {
        const work = identity();
        const first = close(work);
        const second = close(work);
        strict_1.default.equal(first.displayState, "Closed in DaoBrew");
        strict_1.default.equal(first.authority, "explicit_local_owner");
        strict_1.default.equal(first.binding.projection.projectionDigest, digest("c"));
        strict_1.default.equal(first.binding.package.packageId, approvedPackage(work).packageId);
        strict_1.default.equal(first.binding.session.sessionId, "11111111-1111-4111-8111-111111111111");
        strict_1.default.equal(first.binding.artifact.artifactReceiptDigest, digest("3"));
        strict_1.default.equal(first.binding.report.reportReceiptDigest, digest("4"));
        strict_1.default.equal(first.closedAt, "2026-07-30T08:04:00.000Z");
        strict_1.default.equal(first.identity.aliasSignatureDigest, GOLDEN_ALIAS_SIGNATURE);
        strict_1.default.equal(first.identity.completionIdentityDigest, GOLDEN_COMPLETION_IDENTITY);
        strict_1.default.equal(first.closeDecisionDigest, GOLDEN_CLOSE_DECISION);
        strict_1.default.equal(first.sourceWritebackAttempted, false);
        strict_1.default.equal(first.outcomeVerified, false);
        strict_1.default.equal(first.closeDecisionDigest, second.closeDecisionDigest);
        strict_1.default.ok(Object.isFrozen(first));
        strict_1.default.ok(Object.isFrozen(first.binding));
        strict_1.default.ok(Object.isFrozen(first.identity));
        strict_1.default.deepEqual(JSON.parse((0, local_completion_overlay_js_1.taskMapLocalLifecycleDecisionCanonicalBytes)(first).toString("utf8")), first);
        const tampered = structuredClone(first);
        tampered.binding.report.reportReceiptDigest = digest("5");
        strict_1.default.throws(() => (0, local_completion_overlay_js_1.taskMapLocalLifecycleDecisionCanonicalBytes)(tampered), /seal is invalid/);
    });
    (0, node_test_1.it)("requires report_ready and never infers Close from artifact delivery", () => {
        const work = identity();
        strict_1.default.throws(() => (0, local_completion_overlay_js_1.decideTaskMapLocalCompletion)({
            decision: "close",
            explicitOwnerAction: true,
            localOwnerScopeDigest: OWNER_SCOPE,
            identity: work,
            approvedPackage: approvedPackage(work),
            reportReady: reportReady(work, {
                progressState: "artifact_delivered",
                reportReceiptDigest: null,
                reportRelativePaths: [],
            }),
            decidedAt: "2026-07-30T08:04:00.000Z",
        }), /not an exact report_ready binding/);
        const packageA = approvedPackage(work);
        const packageB = approvedPackage(work, {
            ...PROJECTION,
            projectionDigest: digest("e"),
        });
        strict_1.default.throws(() => (0, local_completion_overlay_js_1.decideTaskMapLocalCompletion)({
            decision: "close",
            explicitOwnerAction: true,
            localOwnerScopeDigest: OWNER_SCOPE,
            identity: work,
            approvedPackage: packageB,
            reportReady: reportReady(work, {}, packageA),
            decidedAt: "2026-07-30T08:04:00.000Z",
        }), /does not bind the approved package/);
    });
    (0, node_test_1.it)("keeps Keep open nonterminal and emits no terminal lifecycle record", () => {
        const work = identity();
        const result = (0, local_completion_overlay_js_1.decideTaskMapLocalCompletion)({
            decision: "keep_open",
            explicitOwnerAction: true,
            localOwnerScopeDigest: OWNER_SCOPE,
            identity: work,
            approvedPackage: approvedPackage(work),
            reportReady: reportReady(work),
            decidedAt: "2026-07-30T08:04:00.000Z",
        });
        strict_1.default.deepEqual(result, {
            decision: "keep_open",
            lifecycleState: "open",
            displayState: "Kept open",
            decidedAt: "2026-07-30T08:04:00.000Z",
            terminalLifecycleChanged: false,
            closeRecord: null,
            sourceWritebackAttempted: false,
            sourceCompletion: false,
            outcomeVerified: false,
        });
    });
    (0, node_test_1.it)("exposes one product read API for report review, closure, and closed task IDs", () => {
        const work = identity();
        const candidate = {
            identity: work,
            evidenceKind: "authoritative_source",
        };
        const awaitingReport = (0, local_completion_overlay_js_1.readTaskMapLocalCompletionReviewState)({
            localOwnerScopeDigest: OWNER_SCOPE,
            lifecycleHistory: [],
            candidate,
            approvedPackage: approvedPackage(work),
            executionInspection: reportReady(work, {
                progressState: "artifact_delivered",
                reportReceiptDigest: null,
                reportRelativePaths: [],
            }),
            observedAt: "2026-07-30T08:04:00.000Z",
        });
        strict_1.default.equal(awaitingReport.reviewState, "awaiting_report");
        strict_1.default.equal(awaitingReport.canClose, false);
        const awaitingReview = (0, local_completion_overlay_js_1.readTaskMapLocalCompletionReviewState)({
            localOwnerScopeDigest: OWNER_SCOPE,
            lifecycleHistory: [],
            candidate,
            approvedPackage: approvedPackage(work),
            executionInspection: reportReady(work),
            observedAt: "2026-07-30T08:04:00.000Z",
        });
        strict_1.default.equal(awaitingReview.reviewState, "awaiting_review");
        strict_1.default.equal(awaitingReview.canClose, true);
        strict_1.default.equal(awaitingReview.canKeepOpen, true);
        strict_1.default.equal(awaitingReview.reportBinding?.reportReceiptDigest, digest("4"));
        const closed = close(work);
        const closedState = (0, local_completion_overlay_js_1.readTaskMapLocalCompletionReviewState)({
            localOwnerScopeDigest: OWNER_SCOPE,
            lifecycleHistory: [closed],
            candidate,
            approvedPackage: approvedPackage(work),
            executionInspection: reportReady(work),
            observedAt: "2026-07-30T08:05:00.000Z",
        });
        strict_1.default.equal(closedState.reviewState, "closed_in_daobrew");
        strict_1.default.equal(closedState.canReopen, true);
        strict_1.default.equal(closedState.reportBinding?.reportReceiptDigest, digest("4"));
        strict_1.default.deepEqual(closedState.closedTaskIds, [work.taskId]);
        strict_1.default.deepEqual((0, local_completion_overlay_js_1.readTaskMapLocalClosedTaskIds)({
            localOwnerScopeDigest: OWNER_SCOPE,
            lifecycleHistory: [closed],
        }), [work.taskId]);
        const reopened = (0, local_completion_overlay_js_1.buildTaskMapExplicitReopen)({
            closeRecord: closed,
            explicitOwnerAction: true,
            reopenedAt: "2026-07-30T08:06:00.000Z",
        });
        strict_1.default.deepEqual((0, local_completion_overlay_js_1.readTaskMapLocalClosedTaskIds)({
            localOwnerScopeDigest: OWNER_SCOPE,
            lifecycleHistory: [closed, reopened],
        }), []);
        strict_1.default.equal(local_completion_overlay_js_1.TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1.storageRecommendation
            .decisionsDirectoryRelativeToOwnerRoot, "taskmap-local-execution/completion-decisions");
        strict_1.default.equal(local_completion_overlay_js_1.TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1.cliRecommendation.compiled, "dist/src/engine/taskmap/local-completion-cli.js");
        strict_1.default.equal(local_completion_overlay_js_1.TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1.persistenceImplementedHere, false);
    });
});
(0, node_test_1.describe)("Task Map local completion active-graph overlay", () => {
    (0, node_test_1.it)("prunes a closed leaf and every empty intermediate ancestor, including an empty root", () => {
        const work = identity();
        const closed = close(work);
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{
                    identity: work,
                }]),
            lifecycleHistory: [closed],
        });
        strict_1.default.deepEqual(overlay.activeGraph.nodes, []);
        strict_1.default.deepEqual(overlay.prunedNodeIds, [
            "tmm_close_loop",
            "tmm_review_result",
            "tmr_taskmap_product",
            "tmt_complete_loop",
        ]);
        strict_1.default.equal(overlay.leafDispositions[0]?.state, "closed_in_daobrew");
        strict_1.default.deepEqual(overlay.completionHistory[0], closed);
        strict_1.default.equal(overlay.artifactDigest, GOLDEN_CLOSED_OVERLAY);
        strict_1.default.equal(overlay.localOwnerScopeDigest, OWNER_SCOPE);
        strict_1.default.equal(overlay.sourceWritebackAttempted, false);
        strict_1.default.equal(overlay.outcomeVerified, false);
        strict_1.default.doesNotThrow(() => (0, local_completion_overlay_js_1.taskMapLocalCompletionOverlayCanonicalBytes)(overlay));
        strict_1.default.throws(() => (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: digest("b"),
            nodes: route([{ identity: work }]),
            lifecycleHistory: [closed],
        }), /crosses the local owner scope/);
    });
    (0, node_test_1.it)("retains a two-leaf parent and root when only one child is closed", () => {
        const closedWork = identity();
        const openWork = identity({
            taskId: "tmt_second_leaf",
            workId: "tmwork_second_leaf",
            canonicalSourceObjectKeyDigest: digest("6"),
            aliasSourceObjectKeyDigests: [digest("7")],
            sourceIdentityDigest: digest("8"),
        });
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([
                { identity: closedWork },
                { identity: openWork, title: "Ship the next visible milestone" },
            ]),
            lifecycleHistory: [close(closedWork)],
        });
        strict_1.default.deepEqual(overlay.activeGraph.nodes.map((node) => node.nodeId), [
            "tmm_close_loop",
            "tmm_review_result",
            "tmr_taskmap_product",
            "tmt_second_leaf",
        ]);
        strict_1.default.deepEqual(overlay.prunedNodeIds, ["tmt_complete_loop"]);
        strict_1.default.deepEqual(overlay.leafDispositions.map((row) => [row.leafNodeId, row.state]), [
            ["tmt_complete_loop", "closed_in_daobrew"],
            ["tmt_second_leaf", "active"],
        ]);
    });
    (0, node_test_1.it)("deduplicates an exact Close replay and suppresses the exact task replay", () => {
        const work = identity();
        const closed = close(work);
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{ identity: work }]),
            lifecycleHistory: [closed, closed],
        });
        strict_1.default.equal(overlay.completionHistory.length, 1);
        strict_1.default.equal(overlay.leafDispositions[0]?.matchedCloseDecisionId, closed.closeDecisionId);
        strict_1.default.equal(overlay.leafDispositions[0]?.matchBasis, "task_id");
        strict_1.default.deepEqual(overlay.activeGraph.nodes, []);
    });
    (0, node_test_1.it)("suppresses alias and title variation without relying on title equality", () => {
        const sharedAlias = digest("9");
        const closedWork = identity({
            canonicalSourceObjectKeyDigest: digest("d"),
            aliasSourceObjectKeyDigests: [sharedAlias],
        });
        const aliasVariation = identity({
            taskId: "tmt_complete_loop_alias",
            workId: "tmwork_complete_loop_alias",
            canonicalSourceObjectKeyDigest: digest("0"),
            aliasSourceObjectKeyDigests: [sharedAlias],
            sourceIdentityDigest: closedWork.sourceIdentityDigest,
            sourceRevision: "source-revision-1-alias",
        });
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{
                    identity: aliasVariation,
                    title: "A completely rewritten title",
                }]),
            lifecycleHistory: [close(closedWork)],
        });
        strict_1.default.equal(overlay.leafDispositions[0]?.state, "closed_in_daobrew");
        strict_1.default.equal(overlay.leafDispositions[0]?.matchBasis, "bounded_source_alias");
    });
    (0, node_test_1.it)("does not suppress unrelated work merely because its title is identical", () => {
        const closedWork = identity();
        const unrelated = identity({
            taskId: "tmt_unrelated",
            workId: "tmwork_unrelated",
            canonicalSourceObjectKeyDigest: digest("6"),
            aliasSourceObjectKeyDigests: [digest("7")],
            sourceIdentityDigest: digest("8"),
        });
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{
                    identity: unrelated,
                    title: "Complete the loop",
                }]),
            lifecycleHistory: [close(closedWork)],
        });
        strict_1.default.equal(overlay.leafDispositions[0]?.state, "active");
        strict_1.default.deepEqual(overlay.activeGraph.nodes.map((node) => node.nodeId), [
            "tmm_close_loop",
            "tmm_review_result",
            "tmr_taskmap_product",
            "tmt_unrelated",
        ]);
    });
    (0, node_test_1.it)("attaches later agent or meeting discussion to history without resurrection", () => {
        const closedWork = identity();
        const discussion = identity({
            taskId: "tmt_discussion_variant",
            workId: closedWork.workId,
            canonicalSourceObjectKeyDigest: digest("6"),
            aliasSourceObjectKeyDigests: [],
            sourceIdentityDigest: digest("7"),
            sourceRevision: "agent-message-200",
            sourceRevisionObservedAt: "2026-07-30T09:00:00.000Z",
        });
        for (const evidenceKind of ["agent_session", "meeting"]) {
            const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
                localOwnerScopeDigest: OWNER_SCOPE,
                nodes: route([{
                        identity: discussion,
                        evidenceKind,
                        title: `Later ${evidenceKind} chatter`,
                    }]),
                lifecycleHistory: [close(closedWork)],
            });
            strict_1.default.equal(overlay.leafDispositions[0]?.state, "closed_in_daobrew");
            strict_1.default.equal(overlay.leafDispositions[0]?.matchBasis, "work_id");
            strict_1.default.deepEqual(overlay.sourceRevisionConflicts, []);
            strict_1.default.deepEqual(overlay.activeGraph.nodes, []);
        }
    });
    (0, node_test_1.it)("surfaces a newer authoritative source revision as a conflict without reopening", () => {
        const closedWork = identity();
        const newerSource = identity({
            sourceIdentityDigest: digest("6"),
            sourceRevision: "source-revision-2",
            sourceRevisionObservedAt: "2026-07-30T09:00:00.000Z",
        });
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{
                    identity: newerSource,
                    evidenceKind: "authoritative_source",
                }]),
            lifecycleHistory: [close(closedWork)],
        });
        strict_1.default.equal(overlay.leafDispositions[0]?.state, "authoritative_source_conflict");
        strict_1.default.deepEqual(overlay.activeGraph.nodes, []);
        strict_1.default.equal(overlay.sourceRevisionConflicts.length, 1);
        strict_1.default.equal(overlay.sourceRevisionConflicts[0]?.resolution, "explicit_reopen_required");
        strict_1.default.equal(overlay.sourceRevisionConflicts[0]?.candidateSourceRevision, "source-revision-2");
    });
    (0, node_test_1.it)("restores active membership only after an explicit Reopen while retaining history", () => {
        const work = identity();
        const closed = close(work);
        const reopened = (0, local_completion_overlay_js_1.buildTaskMapExplicitReopen)({
            closeRecord: closed,
            explicitOwnerAction: true,
            reopenedAt: "2026-07-30T08:05:00.000Z",
        });
        const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
            localOwnerScopeDigest: OWNER_SCOPE,
            nodes: route([{ identity: work }]),
            lifecycleHistory: [closed, reopened],
        });
        strict_1.default.equal(reopened.previousCloseDecisionId, closed.closeDecisionId);
        strict_1.default.equal(reopened.displayState, "Reopened in DaoBrew");
        strict_1.default.equal(reopened.reopenDecisionDigest, GOLDEN_REOPEN_DECISION);
        strict_1.default.equal(reopened.sourceWritebackAttempted, false);
        strict_1.default.equal(reopened.outcomeVerified, false);
        strict_1.default.equal(overlay.leafDispositions[0]?.state, "active");
        strict_1.default.deepEqual(overlay.activeGraph.nodes.map((node) => node.nodeId), [
            "tmm_close_loop",
            "tmm_review_result",
            "tmr_taskmap_product",
            "tmt_complete_loop",
        ]);
        strict_1.default.equal(overlay.completionHistory.length, 2);
        strict_1.default.deepEqual(overlay.prunedNodeIds, []);
    });
});
