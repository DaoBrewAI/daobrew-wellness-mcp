#!/usr/bin/env node
import { type TaskMapAgentAdapterHandoffPreflightV1, type TaskMapAgentHandoffAdapterV1, type TaskMapAgentWorkspaceBindingV1 } from "./agent-handoff-preflight.js";
export declare const TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV = "TASKMAP_AGENT_HANDOFF_PREFLIGHT_TEST_MODE";
interface PreflightRoots {
    ownerRoot: string;
    taskMapRoot: string;
    expectedCandidateOwnerScopeDigest: string;
}
export interface ParsedTaskMapAgentHandoffPreflightCliArguments extends PreflightRoots {
    command: "inspect";
    adapter: TaskMapAgentHandoffAdapterV1;
    packagePath: string;
    workspacePath: string;
}
export interface TaskMapAgentHandoffPreflightCliDependencies {
    environment?: NodeJS.ProcessEnv;
    homeDirectory?: string;
    resolveWorkspaceBinding?: (input: ResolveTaskMapAgentWorkspaceBindingInputV1) => Promise<TaskMapAgentWorkspaceBindingV1>;
}
export interface ResolveTaskMapAgentWorkspaceBindingInputV1 {
    workspacePath: string;
    expectedCandidateOwnerScopeDigest: string;
    routingIdentityKind: "project" | "repository";
}
export interface InspectTaskMapAgentAdapterPreflightFromPathsInputV1 extends PreflightRoots {
    adapter: TaskMapAgentHandoffAdapterV1;
    packagePath: string;
    workspacePath: string;
}
export interface PreparedTaskMapAgentAdapterPreflightV1 {
    preflight: TaskMapAgentAdapterHandoffPreflightV1;
    artifactPath: string;
}
export declare function parseTaskMapAgentHandoffPreflightCliArguments(argv: readonly string[], dependencies?: TaskMapAgentHandoffPreflightCliDependencies): ParsedTaskMapAgentHandoffPreflightCliArguments;
export declare function resolveTaskMapAgentWorkspaceBinding(input: ResolveTaskMapAgentWorkspaceBindingInputV1): Promise<TaskMapAgentWorkspaceBindingV1>;
export declare function inspectTaskMapAgentAdapterHandoffPreflightFromPaths(input: InspectTaskMapAgentAdapterPreflightFromPathsInputV1, dependencies?: Pick<TaskMapAgentHandoffPreflightCliDependencies, "resolveWorkspaceBinding">): Promise<TaskMapAgentAdapterHandoffPreflightV1>;
export declare function taskMapAgentAdapterPreflightArtifactPath(packagePath: string, adapterPreflightId: string): string;
export declare function readTaskMapAgentAdapterHandoffPreflightArtifact(packagePath: string, adapterPreflightId: string): Promise<TaskMapAgentAdapterHandoffPreflightV1>;
export declare function prepareTaskMapAgentAdapterHandoffPreflight(input: InspectTaskMapAgentAdapterPreflightFromPathsInputV1, dependencies?: Pick<TaskMapAgentHandoffPreflightCliDependencies, "resolveWorkspaceBinding">): Promise<PreparedTaskMapAgentAdapterPreflightV1>;
export declare function runTaskMapAgentHandoffPreflightCli(argv: readonly string[], dependencies?: TaskMapAgentHandoffPreflightCliDependencies): Promise<TaskMapAgentAdapterHandoffPreflightV1>;
export declare function taskMapAgentHandoffPreflightCliOutput(preflight: TaskMapAgentAdapterHandoffPreflightV1): string;
export {};
