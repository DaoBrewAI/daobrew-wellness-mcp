import { inspectTaskMapAgentAdapterHandoffPreflightFromPaths } from "./agent-handoff-preflight-cli.js";
export declare const TASKMAP_AGENT_EXECUTION_START_VERSION: "taskmap-agent-execution-start-receipt.v2";
export declare const TASKMAP_AGENT_EXECUTION_FINISH_VERSION: "taskmap-agent-execution-finish-receipt.v1";
export declare const TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION: "taskmap-agent-artifact-receipt.v1";
export declare const TASKMAP_AGENT_SESSION_REPORT_VERSION: "taskmap-agent-session-report-receipt.v1";
export declare const TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION: "taskmap-agent-execution-inspection.v1";
export declare const TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION: "taskmap-agent-execution-review-summary.v1";
export declare const TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_VERSION: "taskmap-agent-execution-launcher-contract.v1";
export declare const TASKMAP_AGENT_UNDERSTANDING_REPORT_SHAPE: "change_walkthrough";
export declare const TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS: readonly ["Context", "Intuition", "What was done", "Deviations & judgment calls", "What to watch", "Quiz"];
export declare const TASKMAP_AGENT_EXECUTION_LIMITS_V1: Readonly<{
    readonly maxInputArtifactBytes: number;
    readonly maxReceiptBytes: number;
    readonly maxReturnedArtifacts: 8;
    readonly maxReturnedArtifactBytes: number;
    readonly maxReturnedArtifactBytesTotal: number;
    readonly maxReportBytes: number;
    readonly maxReportNarrativeSectionBytes: number;
    readonly maxReportNarrativeBytesTotal: number;
    readonly maxTestResults: 32;
    readonly maxTestLabelCharacters: 160;
}>;
export type TaskMapAgentAdapterV1 = "claude_code" | "codex_cli";
export type TaskMapAgentProofAdapterV1 = "codex" | "claude_code";
export type TaskMapAgentSessionStatusV1 = "not_started" | "running" | "finished" | "failed";
export interface TaskMapAgentExecutionStartReceiptV1 {
    contractVersion: typeof TASKMAP_AGENT_EXECUTION_START_VERSION;
    startReceiptId: string;
    startReceiptDigest: string;
    sessionId: string;
    packageId: string;
    packageDigest: string;
    taskId: string;
    rootId: string;
    proofAdapter: TaskMapAgentProofAdapterV1;
    adapterPreflightId: string;
    adapterPreflightDigest: string;
    corePreflightId: string;
    corePreflightDigest: string;
    runtimeRequestDigest: string;
    startIdempotencyKey: string;
    localWorkspaceDigest: string;
    workspaceBindingDigest: string;
    launchedAdapter: TaskMapAgentAdapterV1;
    adapterSelection: "user_selected_after_package_approval";
    startedAt: string;
    userStartApprovalRecorded: true;
    state: "started";
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapAgentExecutionFinishReceiptV1 {
    contractVersion: typeof TASKMAP_AGENT_EXECUTION_FINISH_VERSION;
    finishReceiptId: string;
    finishReceiptDigest: string;
    sessionId: string;
    startReceiptId: string;
    startReceiptDigest: string;
    finishedAt: string;
    sessionStatus: "finished" | "failed";
    exit: {
        kind: "code";
        code: number;
    } | {
        kind: "signal";
        signal: string;
    };
    taskExecutedClaimed: false;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapAgentReturnedArtifactV1 {
    relativePath: string;
    contentDigest: string;
    bytes: number;
    mediaType: "text/markdown" | "text/html" | "application/json" | "text/plain" | "application/octet-stream";
}
export interface TaskMapAgentArtifactReceiptV1 {
    contractVersion: typeof TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION;
    artifactReceiptId: string;
    artifactReceiptDigest: string;
    sessionId: string;
    startReceiptDigest: string;
    finishReceiptDigest: string;
    recordedAt: string;
    deliveryStatus: "artifact_delivered";
    artifacts: TaskMapAgentReturnedArtifactV1[];
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapAgentReportTestResultV1 {
    label: string;
    status: "passed" | "failed" | "not_run";
}
export interface TaskMapAgentSessionReportReceiptV1 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_REPORT_VERSION;
    reportReceiptId: string;
    reportReceiptDigest: string;
    sessionId: string;
    startReceiptDigest: string;
    finishReceiptDigest: string;
    artifactReceiptDigest: string;
    generatedAt: string;
    markdownRelativePath: "report.md";
    markdownDigest: string;
    htmlRelativePath: "report.html";
    htmlDigest: string;
    tests: TaskMapAgentReportTestResultV1[];
    reportStatus: "report_ready";
    transcriptStored: false;
    rawCredentialsStored: false;
    rawBiometricsStored: false;
    meetingBodiesStored: false;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapAgentExecutionInspectionV1 {
    contractVersion: typeof TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION;
    sessionId: string;
    progressState: "not_started" | "started" | "finished_without_artifact" | "failed_without_artifact" | "artifact_delivered" | "report_ready";
    sessionStatus: TaskMapAgentSessionStatusV1;
    packageId: string | null;
    packageDigest: string | null;
    preflightId: string | null;
    preflightDigest: string | null;
    taskId: string | null;
    corePreflightId: string | null;
    corePreflightDigest: string | null;
    runtimeRequestDigest: string | null;
    startIdempotencyKey: string | null;
    rootId: string | null;
    workspaceBindingDigest: string | null;
    launchedAdapter: TaskMapAgentAdapterV1 | null;
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
export interface TaskMapAgentExecutionReviewSummaryV1 {
    contractVersion: typeof TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION;
    summaryDigest: string;
    sessionId: string;
    progressState: TaskMapAgentExecutionInspectionV1["progressState"];
    reviewState: "not_ready" | "awaiting_review";
    reportShape: null | typeof TASKMAP_AGENT_UNDERSTANDING_REPORT_SHAPE;
    artifactRelativePaths: string[];
    primaryArtifactRelativePath: string | null;
    markdownReportRelativePath: null | "report.md";
    htmlReportRelativePath: null | "report.html";
    artifactReceiptDigest: string | null;
    reportReceiptDigest: string | null;
    terminalStateInferred: false;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface RecordTaskMapAgentExecutionStartInputV1 {
    executionRoot: string;
    packagePath: string;
    workspacePath: string;
    sessionId: string;
    launchedAdapter: TaskMapAgentAdapterV1;
    adapterPreflightId: string;
    adapterPreflightDigest: string;
    corePreflightId: string;
    corePreflightDigest: string;
    runtimeRequestDigest: string;
    startIdempotencyKey: string;
    workspaceBindingDigest: string;
    startedAt: string;
}
export interface TaskMapAgentExecutionStartDependenciesV1 {
    inspectAdapterPreflight?: typeof inspectTaskMapAgentAdapterHandoffPreflightFromPaths;
    expectedCandidateOwnerScopeDigest?: string;
}
export interface RecordTaskMapAgentExecutionFinishInputV1 {
    executionRoot: string;
    sessionId: string;
    finishedAt: string;
    exit: {
        kind: "code";
        code: number;
    } | {
        kind: "signal";
        signal: string;
    };
}
export interface RecordTaskMapAgentArtifactsInputV1 {
    executionRoot: string;
    sessionId: string;
    recordedAt: string;
    artifactRelativePaths: string[];
}
export interface GenerateTaskMapAgentSessionReportInputV1 {
    executionRoot: string;
    sessionId: string;
    generatedAt: string;
    tests?: TaskMapAgentReportTestResultV1[];
}
export interface TaskMapAgentExecutionLauncherContractV1 {
    contractVersion: typeof TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_VERSION;
    sessionIdentity: "caller_generated_lowercase_uuid";
    userAction: "explicit_approve_and_start";
    startReceiptTiming: "immediately_before_interactive_process_spawn";
    artifactReturnDirectory: "sessions/<session-id>/artifacts";
    requiredOrder: [
        "start",
        "finish",
        "artifacts",
        "report"
    ];
    supportedAdapters: ["claude_code", "codex_cli"];
    approvedPackageRequired: true;
    workspacePathStored: false;
    sourceWritebackSupported: false;
    outcomeVerificationSupported: false;
}
export declare const TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1: Readonly<TaskMapAgentExecutionLauncherContractV1>;
export declare function recordTaskMapAgentExecutionStart(input: RecordTaskMapAgentExecutionStartInputV1, dependencies?: TaskMapAgentExecutionStartDependenciesV1): Promise<{
    receipt: TaskMapAgentExecutionStartReceiptV1;
    replayed: boolean;
}>;
export declare function recordTaskMapAgentExecutionFinish(input: RecordTaskMapAgentExecutionFinishInputV1): Promise<{
    receipt: TaskMapAgentExecutionFinishReceiptV1;
    replayed: boolean;
}>;
export declare function recordTaskMapAgentArtifacts(input: RecordTaskMapAgentArtifactsInputV1): Promise<{
    receipt: TaskMapAgentArtifactReceiptV1;
    replayed: boolean;
}>;
export declare function generateTaskMapAgentSessionReport(input: GenerateTaskMapAgentSessionReportInputV1): Promise<{
    receipt: TaskMapAgentSessionReportReceiptV1;
    replayed: boolean;
}>;
export declare function inspectTaskMapAgentExecution(executionRoot: string, sessionId: string): Promise<TaskMapAgentExecutionInspectionV1>;
/**
 * Strict, receipt-derived adoption seam for a later Tasks/Task Map UI.
 *
 * The existing inspection.v1 JSON stays unchanged for current clients. This
 * summary adds only openable relative paths and an explicit review state. It
 * cannot infer a terminal task state from process, artifact, or report facts.
 */
export declare function summarizeTaskMapAgentExecutionForReview(executionRoot: string, sessionId: string): Promise<TaskMapAgentExecutionReviewSummaryV1>;
