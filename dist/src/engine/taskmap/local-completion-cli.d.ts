#!/usr/bin/env node
import { inspectTaskMapAgentExecution } from "./agent-execution-receipts.js";
import { inspectTaskMapLocalLifecycleContext, inspectTaskMapLocalApprovalOperationalContext } from "./local-approval-package.js";
import { loadTaskMapNativePredecessorEvidence } from "./native-predecessor-evidence.js";
import { type TaskMapReadyFrontierProofTargetV1 } from "./ready-frontier.js";
export declare const TASKMAP_LOCAL_COMPLETION_CLI_RESPONSE_VERSION: "taskmap-local-completion-cli-response.v1";
export declare const TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV = "TASKMAP_LOCAL_COMPLETION_TEST_MODE";
export declare const TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES: number;
export declare const TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS = 32;
export declare const TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS = 256;
export declare const TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS = 32;
export declare const TASKMAP_LOCAL_COMPLETION_TERMINAL_OVERLAY_BINDING_DOMAIN: "taskmap-local-completion-terminal-overlay-binding.1";
export declare const TASKMAP_LOCAL_COMPLETION_READY_PROOF_TARGETS_BINDING_DOMAIN: "taskmap-local-completion-ready-proof-targets-binding.1";
export declare const TASKMAP_LOCAL_COMPLETION_CLOSED_EXECUTION_BINDING_DOMAIN: "taskmap-local-completion-closed-execution-binding.1";
interface LocalCompletionRoots {
    homeDirectory: string;
    ownerRoot: string;
    taskMapRoot: string;
    localExecutionRoot: string;
    agentExecutionRoot: string;
    decisionsRoot: string;
    overlayPath: string;
    readyFrontierPath: string;
    readyProofTargetsPath: string;
    legacyQuarantinedTaskIds: readonly string[];
}
type ParsedCommand = {
    command: "overlay";
    roots: LocalCompletionRoots;
} | {
    command: "inspect-overlay";
    roots: LocalCompletionRoots;
} | {
    command: "inspect-closed-execution";
    roots: LocalCompletionRoots;
    taskId: string;
} | {
    command: "review" | "close" | "keep-open";
    roots: LocalCompletionRoots;
    taskId: string;
    sessionId: string;
    decidedAt: string;
} | {
    command: "complete-elsewhere" | "reopen";
    roots: LocalCompletionRoots;
    taskId: string;
    decidedAt: string;
};
export interface TaskMapLocalCompletionCliResponseV1 {
    contractVersion: typeof TASKMAP_LOCAL_COMPLETION_CLI_RESPONSE_VERSION;
    status: "overlay" | "awaiting_report" | "awaiting_review" | "kept_open" | "closed_in_daobrew" | "completed_elsewhere" | "reopened" | "authoritative_source_conflict";
    taskId: string | null;
    rootId: string | null;
    sessionId: string | null;
    canClose: boolean;
    canKeepOpen: boolean;
    closedTaskIds: string[];
    closedExecutionHistory: TaskMapLocalClosedExecutionHistoryEntryV1[];
    completedElsewhereTaskIds: string[];
    terminalTaskIds: string[];
    conflictedTaskIds: string[];
    closeDecisionId: string | null;
    closedExecutionBindingDigest: string | null;
    completionDecisionId: string | null;
    reopenDecisionId: string | null;
    projectionContractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
    currentnessBindingDigest: string;
    terminalOverlayArtifactDigest: string;
    terminalOverlayBindingDigest: string;
    readyTaskIds: string[];
    readyProofTargets: TaskMapReadyFrontierProofTargetV1[];
    readyProofTargetsArtifactDigest: string | null;
    readyProofTargetsSourceArtifactDigest: string | null;
    readyProofTargetsBindingDigest: string | null;
    readyFrontierDigest: string | null;
    sourceWritebackAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
/**
 * Privacy-safe metadata copied only from an authenticated, immutable Close
 * decision. It deliberately contains no source title/body or local path.
 * The close-decision id embeds the digest of the complete sealed record.
 */
export interface TaskMapLocalClosedExecutionHistoryEntryV1 {
    taskId: string;
    rootId: string;
    sessionId: string;
    closeDecisionId: string;
    closeDecisionDigest: string;
    closedAt: string;
    projectionDigest: string;
}
export interface TaskMapLocalCompletionCliDependencies {
    environment?: NodeJS.ProcessEnv;
    homeDirectory?: string;
    inspectExecution?: typeof inspectTaskMapAgentExecution;
    inspectOperationalContext?: typeof inspectTaskMapLocalApprovalOperationalContext;
    inspectLifecycleContext?: typeof inspectTaskMapLocalLifecycleContext;
    loadPredecessorEvidence?: typeof loadTaskMapNativePredecessorEvidence;
}
export declare function taskMapLocalCompletionTerminalOverlayBindingDigest(input: {
    projectionDigest: string;
    terminalOverlayArtifactDigest: string;
    terminalTaskIds: readonly string[];
}): string;
export declare function taskMapLocalCompletionReadyProofTargetsBindingDigest(input: {
    projectionContractVersion: string;
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
    currentnessBindingDigest: string;
    proofTargetSourceArtifactDigest: string;
    readyProofTargets: readonly TaskMapReadyFrontierProofTargetV1[];
}): string;
export interface TaskMapLocalCompletionClosedExecutionBindingInputV1 {
    closeDecisionId: string;
    taskId: string;
    rootId: string;
    sessionId: string;
    packageId: string;
    packageDigest: string;
    workspaceBindingDigest: string;
    launchedAdapter: "claude_code" | "codex_cli";
    startedAt: string;
    finishedAt: string;
    artifactCount: number;
    artifactReceiptDigest: string;
    reportReceiptDigest: string;
    reportRelativePaths: readonly ["report.md", "report.html"];
}
export declare function taskMapLocalCompletionClosedExecutionBindingDigest(input: TaskMapLocalCompletionClosedExecutionBindingInputV1): string;
export declare function parseTaskMapLocalCompletionCliArguments(argv: readonly string[], dependencies?: TaskMapLocalCompletionCliDependencies): ParsedCommand;
export declare function runTaskMapLocalCompletionCli(argv: readonly string[], dependencies?: TaskMapLocalCompletionCliDependencies): Promise<TaskMapLocalCompletionCliResponseV1>;
export declare function taskMapLocalCompletionCliOutput(value: TaskMapLocalCompletionCliResponseV1): string;
export {};
