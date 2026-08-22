#!/usr/bin/env node
import { type TaskMapLocalApprovalResponseV1 } from "./local-approval-package.js";
export declare const TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES: number;
export declare const TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV = "TASKMAP_LOCAL_APPROVAL_TEST_MODE";
interface LocalApprovalCliRoots {
    ownerRoot: string;
    taskMapRoot: string;
    executionRoot: string;
    legacyQuarantinedTaskIds: readonly string[];
}
type ParsedCommand = {
    command: "inspect";
    roots: LocalApprovalCliRoots;
    taskId?: string;
} | {
    command: "approve-prepare";
    roots: LocalApprovalCliRoots;
    expectedOwnerScopeDigest: string;
    expectedProofDigest: string;
    taskId: string;
    idempotencyKey: string;
    authorizedAt: string;
};
export interface TaskMapLocalApprovalCliDependencies {
    environment?: NodeJS.ProcessEnv;
    homeDirectory?: string;
}
export declare function parseTaskMapLocalApprovalCliArguments(argv: readonly string[], dependencies?: TaskMapLocalApprovalCliDependencies): ParsedCommand;
export declare function runTaskMapLocalApprovalCli(argv: readonly string[], dependencies?: TaskMapLocalApprovalCliDependencies): Promise<TaskMapLocalApprovalResponseV1>;
export declare function taskMapLocalApprovalCliOutput(response: TaskMapLocalApprovalResponseV1): string;
export {};
