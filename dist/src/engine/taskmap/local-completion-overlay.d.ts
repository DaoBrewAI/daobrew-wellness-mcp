import type { TaskMapLocalExecutionPackageV1 } from "./local-approval-package.js";
export declare const TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION: "taskmap-local-completion-identity.v1";
export declare const TASKMAP_LOCAL_CLOSE_DECISION_VERSION: "taskmap-local-close-decision.v1";
export declare const TASKMAP_LOCAL_REOPEN_DECISION_VERSION: "taskmap-local-reopen-decision.v1";
export declare const TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION: "taskmap-local-external-completion-decision.v1";
export declare const TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION: "taskmap-local-external-reopen-decision.v1";
export declare const TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION: "taskmap-local-completion-overlay.v1";
export declare const TASKMAP_LOCAL_COMPLETION_REVIEW_STATE_VERSION: "taskmap-local-completion-review-state.v1";
export declare const TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION: "taskmap-agent-execution-inspection.v1";
export declare const TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1: Readonly<{
    readonly storageRecommendation: {
        readonly decisionsDirectoryRelativeToOwnerRoot: "taskmap-local-execution/completion-decisions";
        readonly immutableDecisionFilePattern: "<decision-id>.json";
        readonly derivedOverlayRelativeToOwnerRoot: "taskmap-local-execution/completion-overlay.v1.json";
    };
    readonly cliRecommendation: {
        readonly source: "src/engine/taskmap/local-completion-cli.ts";
        readonly compiled: "dist/src/engine/taskmap/local-completion-cli.js";
        readonly commands: readonly ["review", "close", "keep-open", "complete-elsewhere", "reopen", "overlay"];
    };
    readonly requiredClosePrecondition: "report_ready";
    readonly persistenceImplementedHere: false;
    readonly persistenceOwner: "command_center_cli";
    readonly keepOpenWritesTerminalRecord: false;
    readonly sourceWritebackSupported: false;
    readonly outcomeVerificationSupported: false;
}>;
export declare const TASKMAP_LOCAL_COMPLETION_LIMITS_V1: Readonly<{
    readonly maxAliasSourceObjectKeys: 8;
    readonly maxReturnedArtifacts: 8;
    readonly maxGraphNodes: 1024;
    readonly maxLifecycleRecords: 256;
    readonly maxTextCharacters: 512;
}>;
export interface BuildTaskMapLocalCompletionIdentityInputV1 {
    taskId: string;
    rootId: string;
    workId: string;
    canonicalSourceObjectKeyDigest: string;
    aliasSourceObjectKeyDigests: string[];
    sourceIdentityDigest: string;
    sourceRevision: string;
    sourceRevisionObservedAt: string;
}
export interface TaskMapLocalCompletionIdentityV1 {
    contractVersion: typeof TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION;
    taskId: string;
    rootId: string;
    workId: string;
    canonicalSourceObjectKeyDigest: string;
    aliasSourceObjectKeyDigests: string[];
    aliasSignatureDigest: string;
    sourceIdentityDigest: string;
    sourceRevision: string;
    sourceRevisionObservedAt: string;
    completionIdentityDigest: string;
}
export interface TaskMapLocalCompletionProjectionBindingV1 {
    projectionContractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
}
/**
 * Structural integration seam for the validated output of
 * inspectTaskMapAgentExecution. Keeping the seam structural avoids making the
 * completion contract responsible for execution-receipt persistence.
 */
export interface TaskMapLocalCompletionExecutionInspectionV1 {
    contractVersion: typeof TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION;
    sessionId: string;
    progressState: "not_started" | "started" | "finished_without_artifact" | "failed_without_artifact" | "artifact_delivered" | "report_ready";
    sessionStatus: "not_started" | "running" | "finished" | "failed";
    packageId: string | null;
    packageDigest: string | null;
    preflightId: string | null;
    preflightDigest: string | null;
    taskId: string | null;
    rootId: string | null;
    workspaceBindingDigest: string | null;
    launchedAdapter: "claude_code" | "codex_cli" | null;
    startedAt: string | null;
    finishedAt: string | null;
    artifactCount: number;
    artifactReceiptDigest: string | null;
    reportReceiptDigest: string | null;
    reportRelativePaths: [] | ["report.md", "report.html"];
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapLocalCloseDecisionV1 {
    contractVersion: typeof TASKMAP_LOCAL_CLOSE_DECISION_VERSION;
    closeDecisionId: string;
    closeDecisionDigest: string;
    decision: "close";
    lifecycleState: "closed_in_daobrew";
    displayState: "Closed in DaoBrew";
    authority: "explicit_local_owner";
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    identity: TaskMapLocalCompletionIdentityV1;
    binding: {
        projection: TaskMapLocalCompletionProjectionBindingV1;
        package: {
            packageId: string;
            packageDigest: string;
        };
        session: {
            sessionId: string;
            workspaceBindingDigest: string;
            launchedAdapter: "claude_code" | "codex_cli";
            startedAt: string;
            finishedAt: string;
        };
        artifact: {
            artifactReceiptDigest: string;
            artifactCount: number;
        };
        report: {
            reportReceiptDigest: string;
            relativePaths: ["report.md", "report.html"];
        };
    };
    closedAt: string;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
    privacy: {
        storage: "owner_local_only";
        ownerIdentityStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
export interface TaskMapLocalReopenDecisionV1 {
    contractVersion: typeof TASKMAP_LOCAL_REOPEN_DECISION_VERSION;
    reopenDecisionId: string;
    reopenDecisionDigest: string;
    decision: "reopen";
    lifecycleState: "open_in_daobrew";
    displayState: "Reopened in DaoBrew";
    authority: "explicit_local_owner";
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    completionIdentityDigest: string;
    taskId: string;
    rootId: string;
    workId: string;
    previousCloseDecisionId: string;
    previousCloseDecisionDigest: string;
    reopenedAt: string;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
    privacy: {
        storage: "owner_local_only";
        ownerIdentityStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
/**
 * Owner truth for work completed outside DaoBrew. This record deliberately
 * has no package, session, artifact, or report binding. It records only the
 * stable task/work/source identity and the exact accepted projection observed
 * by the owner when they made the decision.
 */
export interface TaskMapLocalExternalCompletionDecisionV1 {
    contractVersion: typeof TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION;
    externalCompletionDecisionId: string;
    externalCompletionDecisionDigest: string;
    decision: "complete_elsewhere";
    lifecycleState: "completed_elsewhere";
    displayState: "Completed by you";
    authority: "explicit_local_owner";
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    identity: TaskMapLocalCompletionIdentityV1;
    binding: {
        projection: TaskMapLocalCompletionProjectionBindingV1;
    };
    completedAt: string;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
    privacy: {
        storage: "owner_local_only";
        ownerIdentityStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
export interface TaskMapLocalExternalReopenDecisionV1 {
    contractVersion: typeof TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION;
    externalReopenDecisionId: string;
    externalReopenDecisionDigest: string;
    decision: "reopen_external_completion";
    lifecycleState: "open_in_daobrew";
    displayState: "Reopened in DaoBrew";
    authority: "explicit_local_owner";
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    completionIdentityDigest: string;
    taskId: string;
    rootId: string;
    workId: string;
    previousExternalCompletionDecisionId: string;
    previousExternalCompletionDecisionDigest: string;
    reopenedAt: string;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
    privacy: {
        storage: "owner_local_only";
        ownerIdentityStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
export type TaskMapLocalLifecycleDecisionV1 = TaskMapLocalCloseDecisionV1 | TaskMapLocalReopenDecisionV1 | TaskMapLocalExternalCompletionDecisionV1 | TaskMapLocalExternalReopenDecisionV1;
export interface BuildTaskMapExternalCompletionInputV1 {
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    identity: TaskMapLocalCompletionIdentityV1;
    projection: TaskMapLocalCompletionProjectionBindingV1;
    completedAt: string;
}
export interface BuildTaskMapExplicitExternalReopenInputV1 {
    completionRecord: TaskMapLocalExternalCompletionDecisionV1;
    explicitOwnerAction: true;
    reopenedAt: string;
}
export interface DecideTaskMapLocalCompletionInputV1 {
    decision: "close" | "keep_open";
    explicitOwnerAction: true;
    localOwnerScopeDigest: string;
    identity: TaskMapLocalCompletionIdentityV1;
    approvedPackage: TaskMapLocalExecutionPackageV1;
    reportReady: TaskMapLocalCompletionExecutionInspectionV1;
    decidedAt: string;
}
export type TaskMapLocalCompletionDecisionResultV1 = {
    decision: "close";
    lifecycleState: "closed_in_daobrew";
    terminalLifecycleChanged: true;
    closeRecord: TaskMapLocalCloseDecisionV1;
} | {
    decision: "keep_open";
    lifecycleState: "open";
    displayState: "Kept open";
    decidedAt: string;
    terminalLifecycleChanged: false;
    closeRecord: null;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
};
export interface BuildTaskMapExplicitReopenInputV1 {
    closeRecord: TaskMapLocalCloseDecisionV1;
    explicitOwnerAction: true;
    reopenedAt: string;
}
export type TaskMapLocalCompletionCandidateEvidenceKindV1 = "authoritative_source" | "agent_session" | "meeting";
export interface TaskMapLocalCompletionLeafCandidateV1 {
    identity: TaskMapLocalCompletionIdentityV1;
    evidenceKind: TaskMapLocalCompletionCandidateEvidenceKindV1;
}
interface TaskMapLocalCompletionGraphNodeBaseV1 {
    nodeId: string;
    title: string;
}
export type TaskMapLocalCompletionGraphNodeV1 = TaskMapLocalCompletionGraphNodeBaseV1 & {
    kind: "root";
    parentNodeId: null;
    candidate: null;
} | TaskMapLocalCompletionGraphNodeBaseV1 & {
    kind: "intermediate";
    parentNodeId: string;
    candidate: null;
} | TaskMapLocalCompletionGraphNodeBaseV1 & {
    kind: "leaf";
    parentNodeId: string;
    candidate: TaskMapLocalCompletionLeafCandidateV1;
};
export type TaskMapLocalCompletionMatchBasisV1 = "task_id" | "work_id" | "canonical_source_object_key" | "bounded_source_alias";
export interface TaskMapLocalCompletionLeafDispositionV1 {
    leafNodeId: string;
    state: "active" | "closed_in_daobrew" | "completed_elsewhere" | "authoritative_source_conflict";
    matchedCloseDecisionId: string | null;
    matchBasis: TaskMapLocalCompletionMatchBasisV1 | null;
}
export interface TaskMapLocalCompletionSourceRevisionConflictV1 {
    conflictId: string;
    leafNodeId: string;
    closeDecisionId: string;
    matchBasis: TaskMapLocalCompletionMatchBasisV1;
    closedSourceIdentityDigest: string;
    closedSourceRevision: string;
    closedSourceRevisionObservedAt: string;
    candidateSourceIdentityDigest: string;
    candidateSourceRevision: string;
    candidateSourceRevisionObservedAt: string;
    resolution: "explicit_reopen_required";
}
export interface ApplyTaskMapLocalCompletionOverlayInputV1 {
    localOwnerScopeDigest: string;
    nodes: TaskMapLocalCompletionGraphNodeV1[];
    lifecycleHistory: TaskMapLocalLifecycleDecisionV1[];
}
export interface TaskMapLocalCompletionOverlayV1 {
    contractVersion: typeof TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION;
    localOwnerScopeDigest: string;
    activeGraph: {
        nodes: TaskMapLocalCompletionGraphNodeV1[];
    };
    prunedNodeIds: string[];
    leafDispositions: TaskMapLocalCompletionLeafDispositionV1[];
    sourceRevisionConflicts: TaskMapLocalCompletionSourceRevisionConflictV1[];
    completionHistory: TaskMapLocalLifecycleDecisionV1[];
    sourceWritebackAttempted: false;
    outcomeVerified: false;
    artifactDigest: string;
}
export interface ReadTaskMapLocalClosedTaskIdsInputV1 {
    localOwnerScopeDigest: string;
    lifecycleHistory: TaskMapLocalLifecycleDecisionV1[];
}
export interface AssertTaskMapLocalLifecycleMutationAllowedInputV1 extends ReadTaskMapLocalClosedTaskIdsInputV1 {
    identity: TaskMapLocalCompletionIdentityV1;
}
export interface ReadTaskMapLocalCompletionReviewStateInputV1 extends ReadTaskMapLocalClosedTaskIdsInputV1 {
    candidate: TaskMapLocalCompletionLeafCandidateV1;
    approvedPackage: TaskMapLocalExecutionPackageV1;
    executionInspection: TaskMapLocalCompletionExecutionInspectionV1;
    observedAt: string;
}
export interface TaskMapLocalCompletionReviewStateV1 {
    contractVersion: typeof TASKMAP_LOCAL_COMPLETION_REVIEW_STATE_VERSION;
    taskId: string;
    rootId: string;
    reviewState: "awaiting_report" | "awaiting_review" | "closed_in_daobrew" | "authoritative_source_conflict";
    canClose: boolean;
    canKeepOpen: boolean;
    canReopen: boolean;
    matchedCloseDecisionId: string | null;
    closedTaskIds: string[];
    reportBinding: {
        projectionDigest: string;
        packageId: string;
        packageDigest: string;
        sessionId: string;
        artifactReceiptDigest: string;
        reportReceiptDigest: string;
    } | null;
    sourceWritebackAttempted: false;
    outcomeVerified: false;
}
export declare function buildTaskMapLocalCompletionIdentity(input: BuildTaskMapLocalCompletionIdentityInputV1): TaskMapLocalCompletionIdentityV1;
export declare function decideTaskMapLocalCompletion(input: DecideTaskMapLocalCompletionInputV1): TaskMapLocalCompletionDecisionResultV1;
export declare function buildTaskMapExternalCompletion(input: BuildTaskMapExternalCompletionInputV1): TaskMapLocalExternalCompletionDecisionV1;
export declare function buildTaskMapExplicitReopen(input: BuildTaskMapExplicitReopenInputV1): TaskMapLocalReopenDecisionV1;
export declare function buildTaskMapExplicitExternalReopen(input: BuildTaskMapExplicitExternalReopenInputV1): TaskMapLocalExternalReopenDecisionV1;
export declare function assertTaskMapLocalLifecycleDecision(value: unknown): asserts value is TaskMapLocalLifecycleDecisionV1;
export declare function taskMapLocalLifecycleDecisionCanonicalBytes(value: unknown): Buffer;
export interface TaskMapLocalLifecycleHistorySummaryV1 {
    localOwnerScopeDigest: string;
    activeTerminalTaskIds: string[];
}
/**
 * Validate a sealed lifecycle history without binding it to the current
 * owner. This is used only to quarantine pre-owner local state: callers may
 * suppress matching task IDs, but must not treat the result as current-owner
 * completion authority or rewrite any decision seal.
 */
export declare function summarizeTaskMapLocalLifecycleHistory(lifecycleHistory: TaskMapLocalLifecycleDecisionV1[]): TaskMapLocalLifecycleHistorySummaryV1;
/**
 * Enforces the single-terminal lifecycle invariant at the command boundary.
 * Stable task/work/source aliases are deliberately matched before any new
 * non-Reopen decision is built, so a terminal task cannot accumulate a
 * second hidden terminal disposition.
 */
export declare function assertTaskMapLocalLifecycleMutationAllowed(input: AssertTaskMapLocalLifecycleMutationAllowedInputV1): void;
export declare function readTaskMapLocalClosedTaskIds(input: ReadTaskMapLocalClosedTaskIdsInputV1): string[];
export declare function readTaskMapLocalCompletionReviewState(input: ReadTaskMapLocalCompletionReviewStateInputV1): TaskMapLocalCompletionReviewStateV1;
export declare function applyTaskMapLocalCompletionOverlay(input: ApplyTaskMapLocalCompletionOverlayInputV1): TaskMapLocalCompletionOverlayV1;
export declare function taskMapLocalCompletionOverlayCanonicalBytes(value: TaskMapLocalCompletionOverlayV1): Buffer;
export {};
