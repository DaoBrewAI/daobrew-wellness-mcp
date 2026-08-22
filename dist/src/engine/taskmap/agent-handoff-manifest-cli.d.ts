#!/usr/bin/env node
import { type TaskMapAgentHandoffManifestV1, type TaskMapAgentHandoffSummaryV1 } from "./agent-handoff-manifest.js";
export declare const TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV = "TASKMAP_AGENT_HANDOFF_TEST_MODE";
export type TaskMapAgentHandoffCliCommand = "inspect" | "inspect-summary";
export interface TaskMapAgentHandoffCliDependencies {
    environment?: NodeJS.ProcessEnv;
    homeDirectory?: string;
}
export interface ParsedTaskMapAgentHandoffCliArguments {
    command: TaskMapAgentHandoffCliCommand;
    ownerRoot: string;
    taskMapRoot: string;
}
export type TaskMapAgentHandoffCliResult = TaskMapAgentHandoffManifestV1 | TaskMapAgentHandoffSummaryV1;
export declare function parseTaskMapAgentHandoffCliArguments(argv: readonly string[], dependencies?: TaskMapAgentHandoffCliDependencies): ParsedTaskMapAgentHandoffCliArguments;
export declare function runTaskMapAgentHandoffCli(argv: readonly string[], dependencies?: TaskMapAgentHandoffCliDependencies): Promise<TaskMapAgentHandoffCliResult>;
export declare function taskMapAgentHandoffCliOutput(result: TaskMapAgentHandoffCliResult): string;
