#!/usr/bin/env node

import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  generateTaskMapAgentSessionReport,
  inspectTaskMapAgentExecution,
  recordTaskMapAgentArtifacts,
  recordTaskMapAgentExecutionFinish,
  recordTaskMapAgentExecutionStart,
  summarizeTaskMapAgentExecutionForReview,
  TASKMAP_AGENT_EXECUTION_LIMITS_V1,
  type TaskMapAgentAdapterV1,
  type TaskMapAgentExecutionInspectionV1,
  type TaskMapAgentExecutionReviewSummaryV1,
  type TaskMapAgentReportTestResultV1,
  type TaskMapAgentExecutionStartDependenciesV1,
} from "./agent-execution-receipts.js";
import { taskMapContractCanonicalJson } from "./source-contracts.js";

export type TaskMapAgentExecutionCliCommand =
  | "start"
  | "finish"
  | "artifacts"
  | "report"
  | "inspect"
  | "review-summary";

export type ParsedTaskMapAgentExecutionCliArguments =
  | {
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
    }
  | {
      command: "finish";
      executionRoot: string;
      sessionId: string;
      finishedAt: string;
      exit:
        | { kind: "code"; code: number }
        | { kind: "signal"; signal: string };
    }
  | {
      command: "artifacts";
      executionRoot: string;
      sessionId: string;
      recordedAt: string;
      artifactRelativePaths: string[];
    }
  | {
      command: "report";
      executionRoot: string;
      sessionId: string;
      generatedAt: string;
      tests: TaskMapAgentReportTestResultV1[];
    }
  | {
      command: "inspect" | "review-summary";
      executionRoot: string;
      sessionId: string;
    };

interface FlagMap {
  singles: Map<string, string>;
  repeated: Map<string, string[]>;
}

function fail(): never {
  throw new Error("Task Map agent execution CLI input is invalid");
}

function parseFlags(
  raw: readonly string[],
  repeatedNames: ReadonlySet<string> = new Set(),
): FlagMap {
  if (raw.length % 2 !== 0 || raw.length > 96) fail();
  const singles = new Map<string, string>();
  const repeated = new Map<string, string[]>();
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index];
    const value = raw[index + 1];
    if (
      name === undefined
      || value === undefined
      || !/^--[a-z][a-z-]{0,31}$/.test(name)
      || value.length === 0
      || value.length > 4096
    ) {
      fail();
    }
    if (repeatedNames.has(name)) {
      const rows = repeated.get(name) ?? [];
      rows.push(value);
      repeated.set(name, rows);
    } else if (singles.has(name)) {
      fail();
    } else {
      singles.set(name, value);
    }
  }
  return { singles, repeated };
}

function exactSingleFlags(
  parsed: FlagMap,
  expected: readonly string[],
  repeatedExpected: readonly string[] = [],
): void {
  const actual = [...parsed.singles.keys()].sort();
  const wanted = [...expected].sort();
  const actualRepeated = [...parsed.repeated.keys()].sort();
  const wantedRepeated = [...repeatedExpected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((row, index) => row !== wanted[index])
    || actualRepeated.length !== wantedRepeated.length
    || actualRepeated.some((row, index) => row !== wantedRepeated[index])
  ) {
    fail();
  }
}

function required(map: Map<string, string>, key: string): string {
  return map.get(key) ?? fail();
}

function parseTests(parsed: FlagMap): TaskMapAgentReportTestResultV1[] {
  const mapping = [
    ["--test-passed", "passed"],
    ["--test-failed", "failed"],
    ["--test-not-run", "not_run"],
  ] as const;
  const tests: TaskMapAgentReportTestResultV1[] = [];
  for (const [flag, status] of mapping) {
    for (const label of parsed.repeated.get(flag) ?? []) {
      tests.push({ label, status });
    }
  }
  return tests;
}

export function parseTaskMapAgentExecutionCliArguments(
  argv: readonly string[],
): ParsedTaskMapAgentExecutionCliArguments {
  const [command, ...raw] = argv;
  if (
    command !== "start"
    && command !== "finish"
    && command !== "artifacts"
    && command !== "report"
    && command !== "inspect"
    && command !== "review-summary"
  ) {
    fail();
  }

  if (command === "start") {
    const parsed = parseFlags(raw);
    exactSingleFlags(parsed, [
      "--execution-root",
      "--package",
      "--workspace",
      "--session-id",
      "--adapter",
      "--adapter-preflight-id",
      "--adapter-preflight-digest",
      "--core-preflight-id",
      "--core-preflight-digest",
      "--runtime-request-digest",
      "--start-idempotency-key",
      "--workspace-binding-digest",
      "--started-at",
    ]);
    const adapter = required(parsed.singles, "--adapter");
    if (adapter !== "claude_code" && adapter !== "codex_cli") fail();
    return {
      command,
      executionRoot: required(parsed.singles, "--execution-root"),
      packagePath: required(parsed.singles, "--package"),
      workspacePath: required(parsed.singles, "--workspace"),
      sessionId: required(parsed.singles, "--session-id"),
      adapter,
      startedAt: required(parsed.singles, "--started-at"),
      adapterPreflightId:
        required(parsed.singles, "--adapter-preflight-id"),
      adapterPreflightDigest:
        required(parsed.singles, "--adapter-preflight-digest"),
      corePreflightId:
        required(parsed.singles, "--core-preflight-id"),
      corePreflightDigest:
        required(parsed.singles, "--core-preflight-digest"),
      runtimeRequestDigest:
        required(parsed.singles, "--runtime-request-digest"),
      startIdempotencyKey:
        required(parsed.singles, "--start-idempotency-key"),
      workspaceBindingDigest:
        required(parsed.singles, "--workspace-binding-digest"),
    };
  }

  if (command === "finish") {
    const parsed = parseFlags(raw);
    const hasCode = parsed.singles.has("--exit-code");
    const hasSignal = parsed.singles.has("--signal");
    if (hasCode === hasSignal) fail();
    exactSingleFlags(parsed, [
      "--execution-root",
      "--session-id",
      "--finished-at",
      hasCode ? "--exit-code" : "--signal",
    ]);
    const exit = hasCode
      ? {
          kind: "code" as const,
          code: Number(required(parsed.singles, "--exit-code")),
        }
      : {
          kind: "signal" as const,
          signal: required(parsed.singles, "--signal"),
        };
    return {
      command,
      executionRoot: required(parsed.singles, "--execution-root"),
      sessionId: required(parsed.singles, "--session-id"),
      finishedAt: required(parsed.singles, "--finished-at"),
      exit,
    };
  }

  if (command === "artifacts") {
    const parsed = parseFlags(raw, new Set(["--artifact"]));
    exactSingleFlags(
      parsed,
      ["--execution-root", "--session-id", "--recorded-at"],
      ["--artifact"],
    );
    return {
      command,
      executionRoot: required(parsed.singles, "--execution-root"),
      sessionId: required(parsed.singles, "--session-id"),
      recordedAt: required(parsed.singles, "--recorded-at"),
      artifactRelativePaths: parsed.repeated.get("--artifact") ?? fail(),
    };
  }

  if (command === "report") {
    const testFlags = new Set([
      "--test-passed",
      "--test-failed",
      "--test-not-run",
    ]);
    const parsed = parseFlags(raw, testFlags);
    const presentTestFlags = [...testFlags]
      .filter((flag) => parsed.repeated.has(flag));
    exactSingleFlags(
      parsed,
      ["--execution-root", "--session-id", "--generated-at"],
      presentTestFlags,
    );
    return {
      command,
      executionRoot: required(parsed.singles, "--execution-root"),
      sessionId: required(parsed.singles, "--session-id"),
      generatedAt: required(parsed.singles, "--generated-at"),
      tests: parseTests(parsed),
    };
  }

  const parsed = parseFlags(raw);
  exactSingleFlags(parsed, ["--execution-root", "--session-id"]);
  return {
    command,
    executionRoot: required(parsed.singles, "--execution-root"),
    sessionId: required(parsed.singles, "--session-id"),
  };
}

export async function runTaskMapAgentExecutionCli(
  argv: readonly string[],
  dependencies: TaskMapAgentExecutionStartDependenciesV1 = {},
): Promise<TaskMapAgentExecutionInspectionV1> {
  const parsed = parseTaskMapAgentExecutionCliArguments(argv);
  switch (parsed.command) {
    case "start":
      await recordTaskMapAgentExecutionStart({
        executionRoot: parsed.executionRoot,
        packagePath: parsed.packagePath,
        workspacePath: parsed.workspacePath,
        sessionId: parsed.sessionId,
        launchedAdapter: parsed.adapter,
        adapterPreflightId: parsed.adapterPreflightId,
        adapterPreflightDigest: parsed.adapterPreflightDigest,
        corePreflightId: parsed.corePreflightId,
        corePreflightDigest: parsed.corePreflightDigest,
        runtimeRequestDigest: parsed.runtimeRequestDigest,
        startIdempotencyKey: parsed.startIdempotencyKey,
        workspaceBindingDigest: parsed.workspaceBindingDigest,
        startedAt: parsed.startedAt,
      }, dependencies);
      break;
    case "finish":
      await recordTaskMapAgentExecutionFinish({
        executionRoot: parsed.executionRoot,
        sessionId: parsed.sessionId,
        finishedAt: parsed.finishedAt,
        exit: parsed.exit,
      });
      break;
    case "artifacts":
      await recordTaskMapAgentArtifacts({
        executionRoot: parsed.executionRoot,
        sessionId: parsed.sessionId,
        recordedAt: parsed.recordedAt,
        artifactRelativePaths: parsed.artifactRelativePaths,
      });
      break;
    case "report":
      await generateTaskMapAgentSessionReport({
        executionRoot: parsed.executionRoot,
        sessionId: parsed.sessionId,
        generatedAt: parsed.generatedAt,
        tests: parsed.tests,
      });
      break;
    case "inspect":
      break;
    case "review-summary":
      fail();
  }
  return inspectTaskMapAgentExecution(
    parsed.executionRoot,
    parsed.sessionId,
  );
}

export async function runTaskMapAgentExecutionReviewSummaryCli(
  argv: readonly string[],
): Promise<TaskMapAgentExecutionReviewSummaryV1> {
  const parsed = parseTaskMapAgentExecutionCliArguments(argv);
  if (parsed.command !== "review-summary") fail();
  return summarizeTaskMapAgentExecutionForReview(
    parsed.executionRoot,
    parsed.sessionId,
  );
}

export function taskMapAgentExecutionCliOutput(
  inspection:
    | TaskMapAgentExecutionInspectionV1
    | TaskMapAgentExecutionReviewSummaryV1,
): string {
  const output = `${taskMapContractCanonicalJson(inspection)}\n`;
  if (
    Buffer.byteLength(output, "utf8")
      > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes
  ) {
    fail();
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const argv = process.argv.slice(2);
    const result = argv[0] === "review-summary"
      ? await runTaskMapAgentExecutionReviewSummaryCli(argv)
      : await runTaskMapAgentExecutionCli(argv);
    process.stdout.write(taskMapAgentExecutionCliOutput(result));
  } catch (error) {
    process.stderr.write(
      `taskmap-agent-execution: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
