#!/usr/bin/env node
import { type TaskMapAgentAdapterV1, type TaskMapAgentExecutionInspectionV1, type TaskMapAgentExecutionReviewSummaryV1, type TaskMapAgentReportTestResultV1, type TaskMapAgentExecutionStartDependenciesV1 } from "./agent-execution-receipts.js";
export type TaskMapAgentExecutionCliCommand = "start" | "finish" | "artifacts" | "report" | "inspect" | "review-summary";
export type ParsedTaskMapAgentExecutionCliArguments = {
    command: "start";
    executionRoot: string;
    packagePath: string;
    workspacePath: string;
    sessionId: string;
    adapter: TaskMapAgentAdapterV1;
    adapterPreflightId: string;
    adapterPreflightDigest: string;
    corePreflightId: string;
    corePreflightDigest: string;
    runtimeRequestDigest: string;
    startIdempotencyKey: string;
    workspaceBindingDigest: string;
    startedAt: string;
} | {
    command: "finish";
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
} | {
    command: "artifacts";
    executionRoot: string;
    sessionId: string;
    recordedAt: string;
    artifactRelativePaths: string[];
} | {
    command: "report";
    executionRoot: string;
    sessionId: string;
    generatedAt: string;
    tests: TaskMapAgentReportTestResultV1[];
} | {
    command: "inspect" | "review-summary";
    executionRoot: string;
    sessionId: string;
};
export declare function parseTaskMapAgentExecutionCliArguments(argv: readonly string[]): ParsedTaskMapAgentExecutionCliArguments;
export declare function runTaskMapAgentExecutionCli(argv: readonly string[], dependencies?: TaskMapAgentExecutionStartDependenciesV1): Promise<TaskMapAgentExecutionInspectionV1>;
export declare function runTaskMapAgentExecutionReviewSummaryCli(argv: readonly string[]): Promise<TaskMapAgentExecutionReviewSummaryV1>;
export declare function taskMapAgentExecutionCliOutput(inspection: TaskMapAgentExecutionInspectionV1 | TaskMapAgentExecutionReviewSummaryV1): string;
