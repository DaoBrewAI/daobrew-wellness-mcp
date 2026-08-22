#!/usr/bin/env node

import { homedir } from "node:os";
import path from "node:path";

import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  approveAndPrepareTaskMapLocalPackage,
  inspectTaskMapLocalApproval,
  type TaskMapLocalApprovalResponseV1,
} from "./local-approval-package.js";
import {
  assertNoUnmigratedTaskMapLegacyLocalState,
  TaskMapLegacyLocalStateQuarantineError,
} from "./legacy-local-state-quarantine.js";
import { taskMapContractCanonicalJson } from "./source-contracts.js";
import { loadConfirmedTaskMapOwnerSync } from "../../identity.js";

export const TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES = 16 * 1024;
export const TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV =
  "TASKMAP_LOCAL_APPROVAL_TEST_MODE";

const DIGEST = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;

interface LocalApprovalCliRoots {
  ownerRoot: string;
  taskMapRoot: string;
  executionRoot: string;
  legacyQuarantinedTaskIds: readonly string[];
}

type ParsedCommand =
  | {
      command: "inspect";
      roots: LocalApprovalCliRoots;
      taskId?: string;
    }
  | {
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

function fail(): never {
  throw new Error("Task Map local approval CLI input is invalid");
}

function productRoots(
  homeDirectory: string,
  environment: NodeJS.ProcessEnv,
): LocalApprovalCliRoots {
  if (!path.isAbsolute(homeDirectory)) fail();
  const normalizedHome = path.normalize(homeDirectory);
  const confirmed = loadConfirmedTaskMapOwnerSync(
    normalizedHome,
    {
      userId: environment.DAOBREW_USER_ID,
      apiUrl: environment.DAOBREW_API_URL,
    },
  );
  if (!confirmed.ok) fail();
  const ownerRoot = confirmed.owner.ownerRoot;
  const legacy = assertNoUnmigratedTaskMapLegacyLocalState({
    homeDirectory: normalizedHome,
    ownerRoot,
  });
  return {
    ownerRoot,
    taskMapRoot: path.join(ownerRoot, "taskmap"),
    executionRoot: path.join(ownerRoot, "taskmap-local-execution"),
    legacyQuarantinedTaskIds:
      legacy?.activeTerminalTaskIds ?? [],
  };
}

function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      key === undefined
      || value === undefined
      || !key.startsWith("--")
      || value.startsWith("--")
      || flags.has(key)
    ) {
      fail();
    }
    flags.set(key, value);
  }
  return flags;
}

function rootsFromFlags(
  flags: Map<string, string>,
  dependencies: TaskMapLocalApprovalCliDependencies,
): LocalApprovalCliRoots {
  const environment = dependencies.environment ?? process.env;
  const testOwnerRoot = flags.get("--test-owner-root");
  if (testOwnerRoot !== undefined) {
    if (
      environment[TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV] !== "1"
      || !path.isAbsolute(testOwnerRoot)
      || path.normalize(testOwnerRoot) !== testOwnerRoot
    ) {
      fail();
    }
    flags.delete("--test-owner-root");
    return {
      ownerRoot: testOwnerRoot,
      taskMapRoot: path.join(testOwnerRoot, "taskmap"),
      executionRoot: path.join(testOwnerRoot, "taskmap-local-execution"),
      legacyQuarantinedTaskIds: [],
    };
  }
  return productRoots(
    dependencies.homeDirectory ?? homedir(),
    environment,
  );
}

export function parseTaskMapLocalApprovalCliArguments(
  argv: readonly string[],
  dependencies: TaskMapLocalApprovalCliDependencies = {},
): ParsedCommand {
  const [command, ...rawFlags] = argv;
  if (command !== "inspect" && command !== "approve-prepare") fail();
  const flags = parseFlags(rawFlags);
  const roots = rootsFromFlags(flags, dependencies);
  if (command === "inspect") {
    const taskId = flags.get("--task-id");
    if (
      flags.size > 1
      || (flags.size === 1 && !flags.has("--task-id"))
      || (taskId !== undefined && !TASK_ID.test(taskId))
    ) {
      fail();
    }
    return taskId === undefined
      ? { command, roots }
      : { command, roots, taskId };
  }
  const expectedOwnerScopeDigest = flags.get("--expected-owner-scope-digest");
  const expectedProofDigest = flags.get("--expected-proof-digest");
  const taskId = flags.get("--task-id");
  const idempotencyKey = flags.get("--idempotency-key");
  const authorizedAt = flags.get("--authorized-at");
  const expectedKeys = new Set([
    "--expected-owner-scope-digest",
    "--expected-proof-digest",
    "--task-id",
    "--idempotency-key",
    "--authorized-at",
  ]);
  if (
    flags.size !== expectedKeys.size
    || [...flags.keys()].some((key) => !expectedKeys.has(key))
    || expectedOwnerScopeDigest === undefined
    || expectedProofDigest === undefined
    || taskId === undefined
    || idempotencyKey === undefined
    || authorizedAt === undefined
    || !DIGEST.test(expectedOwnerScopeDigest)
    || !DIGEST.test(expectedProofDigest)
    || !DIGEST.test(idempotencyKey)
    || !TASK_ID.test(taskId)
    || new Date(authorizedAt).toISOString() !== authorizedAt
  ) {
    fail();
  }
  return {
    command,
    roots,
    expectedOwnerScopeDigest,
    expectedProofDigest,
    taskId,
    idempotencyKey,
    authorizedAt,
  };
}

export async function runTaskMapLocalApprovalCli(
  argv: readonly string[],
  dependencies: TaskMapLocalApprovalCliDependencies = {},
): Promise<TaskMapLocalApprovalResponseV1> {
  const parsed = parseTaskMapLocalApprovalCliArguments(argv, dependencies);
  if (parsed.command === "inspect") {
    const inspected = await inspectTaskMapLocalApproval({
      taskMapRoot: parsed.roots.taskMapRoot,
      ownerRoot: parsed.roots.ownerRoot,
      ...(parsed.taskId === undefined ? {} : { taskId: parsed.taskId }),
    });
    if (
      parsed.roots.legacyQuarantinedTaskIds.includes(
        inspected.inspection.task.taskId,
      )
    ) {
      throw new TaskMapLegacyLocalStateQuarantineError();
    }
    return inspected.response;
  }
  if (parsed.roots.legacyQuarantinedTaskIds.includes(parsed.taskId)) {
    throw new TaskMapLegacyLocalStateQuarantineError();
  }
  return (await approveAndPrepareTaskMapLocalPackage({
    taskMapRoot: parsed.roots.taskMapRoot,
    ownerRoot: parsed.roots.ownerRoot,
    executionRoot: parsed.roots.executionRoot,
    expectedOwnerScopeDigest: parsed.expectedOwnerScopeDigest,
    expectedProofDigest: parsed.expectedProofDigest,
    taskId: parsed.taskId,
    idempotencyKey: parsed.idempotencyKey,
    authorizedAt: parsed.authorizedAt,
  })).response;
}

export function taskMapLocalApprovalCliOutput(
  response: TaskMapLocalApprovalResponseV1,
): string {
  const output = `${taskMapContractCanonicalJson(response)}\n`;
  if (Buffer.byteLength(output, "utf8") > TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES) {
    throw new Error("Task Map local approval CLI output exceeded its bound");
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const response = await runTaskMapLocalApprovalCli(process.argv.slice(2));
    process.stdout.write(taskMapLocalApprovalCliOutput(response));
  } catch (error) {
    process.stderr.write(
      `taskmap-local-approval: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
