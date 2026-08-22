#!/usr/bin/env node

import { homedir } from "node:os";
import path from "node:path";

import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  inspectTaskMapAgentHandoff,
  TASKMAP_AGENT_HANDOFF_LIMITS_V1,
  TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
  TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
  type TaskMapAgentHandoffManifestV1,
  type TaskMapAgentHandoffSummaryV1,
} from "./agent-handoff-manifest.js";
import { taskMapContractCanonicalJson } from "./source-contracts.js";

export const TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV =
  "TASKMAP_AGENT_HANDOFF_TEST_MODE";

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

export type TaskMapAgentHandoffCliResult =
  | TaskMapAgentHandoffManifestV1
  | TaskMapAgentHandoffSummaryV1;

function fail(): never {
  throw new Error("Task Map agent handoff CLI input is invalid");
}

function productRoots(homeDirectory: string): {
  ownerRoot: string;
  taskMapRoot: string;
} {
  if (!path.isAbsolute(homeDirectory)) fail();
  const ownerRoot = path.join(
    path.normalize(homeDirectory),
    "Library",
    "Application Support",
    "DaoBrew",
  );
  return {
    ownerRoot,
    taskMapRoot: path.join(ownerRoot, "taskmap"),
  };
}

export function parseTaskMapAgentHandoffCliArguments(
  argv: readonly string[],
  dependencies: TaskMapAgentHandoffCliDependencies = {},
): ParsedTaskMapAgentHandoffCliArguments {
  const [command, ...rawFlags] = argv;
  if (command !== "inspect" && command !== "inspect-summary") fail();
  if (rawFlags.length === 0) {
    return {
      command,
      ...productRoots(dependencies.homeDirectory ?? homedir()),
    };
  }
  if (
    rawFlags.length !== 2
    || rawFlags[0] !== "--test-owner-root"
    || rawFlags[1] === undefined
    || (dependencies.environment ?? process.env)[
      TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV
    ] !== "1"
    || !path.isAbsolute(rawFlags[1])
    || path.normalize(rawFlags[1]) !== rawFlags[1]
  ) {
    fail();
  }
  return {
    command,
    ownerRoot: rawFlags[1],
    taskMapRoot: path.join(rawFlags[1], "taskmap"),
  };
}

export async function runTaskMapAgentHandoffCli(
  argv: readonly string[],
  dependencies: TaskMapAgentHandoffCliDependencies = {},
): Promise<TaskMapAgentHandoffCliResult> {
  const parsed = parseTaskMapAgentHandoffCliArguments(argv, dependencies);
  const result = await inspectTaskMapAgentHandoff({
    ownerRoot: parsed.ownerRoot,
    taskMapRoot: parsed.taskMapRoot,
  });
  return parsed.command === "inspect" ? result.manifest : result.summary;
}

export function taskMapAgentHandoffCliOutput(
  result: TaskMapAgentHandoffCliResult,
): string {
  const output = `${taskMapContractCanonicalJson(result)}\n`;
  const maxBytes = result.contractVersion === TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION
    ? TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes
    : result.contractVersion === TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION
      ? TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes
      : fail();
  if (Buffer.byteLength(output, "utf8") > maxBytes) {
    throw new Error("Task Map agent handoff CLI output exceeded its bound");
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const result = await runTaskMapAgentHandoffCli(process.argv.slice(2));
    process.stdout.write(taskMapAgentHandoffCliOutput(result));
  } catch (error) {
    process.stderr.write(
      `taskmap-agent-handoff: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
