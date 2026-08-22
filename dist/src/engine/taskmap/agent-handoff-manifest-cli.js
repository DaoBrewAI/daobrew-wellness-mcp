#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV = void 0;
exports.parseTaskMapAgentHandoffCliArguments = parseTaskMapAgentHandoffCliArguments;
exports.runTaskMapAgentHandoffCli = runTaskMapAgentHandoffCli;
exports.taskMapAgentHandoffCliOutput = taskMapAgentHandoffCliOutput;
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const agent_handoff_manifest_js_1 = require("./agent-handoff-manifest.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV = "TASKMAP_AGENT_HANDOFF_TEST_MODE";
function fail() {
    throw new Error("Task Map agent handoff CLI input is invalid");
}
function productRoots(homeDirectory) {
    if (!node_path_1.default.isAbsolute(homeDirectory))
        fail();
    const ownerRoot = node_path_1.default.join(node_path_1.default.normalize(homeDirectory), "Library", "Application Support", "DaoBrew");
    return {
        ownerRoot,
        taskMapRoot: node_path_1.default.join(ownerRoot, "taskmap"),
    };
}
function parseTaskMapAgentHandoffCliArguments(argv, dependencies = {}) {
    const [command, ...rawFlags] = argv;
    if (command !== "inspect" && command !== "inspect-summary")
        fail();
    if (rawFlags.length === 0) {
        return {
            command,
            ...productRoots(dependencies.homeDirectory ?? (0, node_os_1.homedir)()),
        };
    }
    if (rawFlags.length !== 2
        || rawFlags[0] !== "--test-owner-root"
        || rawFlags[1] === undefined
        || (dependencies.environment ?? process.env)[exports.TASKMAP_AGENT_HANDOFF_TEST_MODE_ENV] !== "1"
        || !node_path_1.default.isAbsolute(rawFlags[1])
        || node_path_1.default.normalize(rawFlags[1]) !== rawFlags[1]) {
        fail();
    }
    return {
        command,
        ownerRoot: rawFlags[1],
        taskMapRoot: node_path_1.default.join(rawFlags[1], "taskmap"),
    };
}
async function runTaskMapAgentHandoffCli(argv, dependencies = {}) {
    const parsed = parseTaskMapAgentHandoffCliArguments(argv, dependencies);
    const result = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)({
        ownerRoot: parsed.ownerRoot,
        taskMapRoot: parsed.taskMapRoot,
    });
    return parsed.command === "inspect" ? result.manifest : result.summary;
}
function taskMapAgentHandoffCliOutput(result) {
    const output = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(result)}\n`;
    const maxBytes = result.contractVersion === agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION
        ? agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes
        : result.contractVersion === agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION
            ? agent_handoff_manifest_js_1.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes
            : fail();
    if (Buffer.byteLength(output, "utf8") > maxBytes) {
        throw new Error("Task Map agent handoff CLI output exceeded its bound");
    }
    return output;
}
async function main() {
    try {
        const result = await runTaskMapAgentHandoffCli(process.argv.slice(2));
        process.stdout.write(taskMapAgentHandoffCliOutput(result));
    }
    catch (error) {
        process.stderr.write(`taskmap-agent-handoff: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
