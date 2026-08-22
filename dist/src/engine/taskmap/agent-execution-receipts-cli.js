#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTaskMapAgentExecutionCliArguments = parseTaskMapAgentExecutionCliArguments;
exports.runTaskMapAgentExecutionCli = runTaskMapAgentExecutionCli;
exports.runTaskMapAgentExecutionReviewSummaryCli = runTaskMapAgentExecutionReviewSummaryCli;
exports.taskMapAgentExecutionCliOutput = taskMapAgentExecutionCliOutput;
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const agent_execution_receipts_js_1 = require("./agent-execution-receipts.js");
const source_contracts_js_1 = require("./source-contracts.js");
function fail() {
    throw new Error("Task Map agent execution CLI input is invalid");
}
function parseFlags(raw, repeatedNames = new Set()) {
    if (raw.length % 2 !== 0 || raw.length > 96)
        fail();
    const singles = new Map();
    const repeated = new Map();
    for (let index = 0; index < raw.length; index += 2) {
        const name = raw[index];
        const value = raw[index + 1];
        if (name === undefined
            || value === undefined
            || !/^--[a-z][a-z-]{0,31}$/.test(name)
            || value.length === 0
            || value.length > 4096) {
            fail();
        }
        if (repeatedNames.has(name)) {
            const rows = repeated.get(name) ?? [];
            rows.push(value);
            repeated.set(name, rows);
        }
        else if (singles.has(name)) {
            fail();
        }
        else {
            singles.set(name, value);
        }
    }
    return { singles, repeated };
}
function exactSingleFlags(parsed, expected, repeatedExpected = []) {
    const actual = [...parsed.singles.keys()].sort();
    const wanted = [...expected].sort();
    const actualRepeated = [...parsed.repeated.keys()].sort();
    const wantedRepeated = [...repeatedExpected].sort();
    if (actual.length !== wanted.length
        || actual.some((row, index) => row !== wanted[index])
        || actualRepeated.length !== wantedRepeated.length
        || actualRepeated.some((row, index) => row !== wantedRepeated[index])) {
        fail();
    }
}
function required(map, key) {
    return map.get(key) ?? fail();
}
function parseTests(parsed) {
    const mapping = [
        ["--test-passed", "passed"],
        ["--test-failed", "failed"],
        ["--test-not-run", "not_run"],
    ];
    const tests = [];
    for (const [flag, status] of mapping) {
        for (const label of parsed.repeated.get(flag) ?? []) {
            tests.push({ label, status });
        }
    }
    return tests;
}
function parseTaskMapAgentExecutionCliArguments(argv) {
    const [command, ...raw] = argv;
    if (command !== "start"
        && command !== "finish"
        && command !== "artifacts"
        && command !== "report"
        && command !== "inspect"
        && command !== "review-summary") {
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
        if (adapter !== "claude_code" && adapter !== "codex_cli")
            fail();
        return {
            command,
            executionRoot: required(parsed.singles, "--execution-root"),
            packagePath: required(parsed.singles, "--package"),
            workspacePath: required(parsed.singles, "--workspace"),
            sessionId: required(parsed.singles, "--session-id"),
            adapter,
            startedAt: required(parsed.singles, "--started-at"),
            adapterPreflightId: required(parsed.singles, "--adapter-preflight-id"),
            adapterPreflightDigest: required(parsed.singles, "--adapter-preflight-digest"),
            corePreflightId: required(parsed.singles, "--core-preflight-id"),
            corePreflightDigest: required(parsed.singles, "--core-preflight-digest"),
            runtimeRequestDigest: required(parsed.singles, "--runtime-request-digest"),
            startIdempotencyKey: required(parsed.singles, "--start-idempotency-key"),
            workspaceBindingDigest: required(parsed.singles, "--workspace-binding-digest"),
        };
    }
    if (command === "finish") {
        const parsed = parseFlags(raw);
        const hasCode = parsed.singles.has("--exit-code");
        const hasSignal = parsed.singles.has("--signal");
        if (hasCode === hasSignal)
            fail();
        exactSingleFlags(parsed, [
            "--execution-root",
            "--session-id",
            "--finished-at",
            hasCode ? "--exit-code" : "--signal",
        ]);
        const exit = hasCode
            ? {
                kind: "code",
                code: Number(required(parsed.singles, "--exit-code")),
            }
            : {
                kind: "signal",
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
        exactSingleFlags(parsed, ["--execution-root", "--session-id", "--recorded-at"], ["--artifact"]);
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
        exactSingleFlags(parsed, ["--execution-root", "--session-id", "--generated-at"], presentTestFlags);
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
async function runTaskMapAgentExecutionCli(argv, dependencies = {}) {
    const parsed = parseTaskMapAgentExecutionCliArguments(argv);
    switch (parsed.command) {
        case "start":
            await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionStart)({
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
            await (0, agent_execution_receipts_js_1.recordTaskMapAgentExecutionFinish)({
                executionRoot: parsed.executionRoot,
                sessionId: parsed.sessionId,
                finishedAt: parsed.finishedAt,
                exit: parsed.exit,
            });
            break;
        case "artifacts":
            await (0, agent_execution_receipts_js_1.recordTaskMapAgentArtifacts)({
                executionRoot: parsed.executionRoot,
                sessionId: parsed.sessionId,
                recordedAt: parsed.recordedAt,
                artifactRelativePaths: parsed.artifactRelativePaths,
            });
            break;
        case "report":
            await (0, agent_execution_receipts_js_1.generateTaskMapAgentSessionReport)({
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
    return (0, agent_execution_receipts_js_1.inspectTaskMapAgentExecution)(parsed.executionRoot, parsed.sessionId);
}
async function runTaskMapAgentExecutionReviewSummaryCli(argv) {
    const parsed = parseTaskMapAgentExecutionCliArguments(argv);
    if (parsed.command !== "review-summary")
        fail();
    return (0, agent_execution_receipts_js_1.summarizeTaskMapAgentExecutionForReview)(parsed.executionRoot, parsed.sessionId);
}
function taskMapAgentExecutionCliOutput(inspection) {
    const output = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(inspection)}\n`;
    if (Buffer.byteLength(output, "utf8")
        > agent_execution_receipts_js_1.TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes) {
        fail();
    }
    return output;
}
async function main() {
    try {
        const argv = process.argv.slice(2);
        const result = argv[0] === "review-summary"
            ? await runTaskMapAgentExecutionReviewSummaryCli(argv)
            : await runTaskMapAgentExecutionCli(argv);
        process.stdout.write(taskMapAgentExecutionCliOutput(result));
    }
    catch (error) {
        process.stderr.write(`taskmap-agent-execution: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
