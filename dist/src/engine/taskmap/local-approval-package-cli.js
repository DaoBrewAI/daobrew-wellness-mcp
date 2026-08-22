#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV = exports.TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES = void 0;
exports.parseTaskMapLocalApprovalCliArguments = parseTaskMapLocalApprovalCliArguments;
exports.runTaskMapLocalApprovalCli = runTaskMapLocalApprovalCli;
exports.taskMapLocalApprovalCliOutput = taskMapLocalApprovalCliOutput;
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const local_approval_package_js_1 = require("./local-approval-package.js");
const legacy_local_state_quarantine_js_1 = require("./legacy-local-state-quarantine.js");
const source_contracts_js_1 = require("./source-contracts.js");
const identity_js_1 = require("../../identity.js");
exports.TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES = 16 * 1024;
exports.TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV = "TASKMAP_LOCAL_APPROVAL_TEST_MODE";
const DIGEST = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
function fail() {
    throw new Error("Task Map local approval CLI input is invalid");
}
function productRoots(homeDirectory, environment) {
    if (!node_path_1.default.isAbsolute(homeDirectory))
        fail();
    const normalizedHome = node_path_1.default.normalize(homeDirectory);
    const confirmed = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(normalizedHome, {
        userId: environment.DAOBREW_USER_ID,
        apiUrl: environment.DAOBREW_API_URL,
    });
    if (!confirmed.ok)
        fail();
    const ownerRoot = confirmed.owner.ownerRoot;
    const legacy = (0, legacy_local_state_quarantine_js_1.assertNoUnmigratedTaskMapLegacyLocalState)({
        homeDirectory: normalizedHome,
        ownerRoot,
    });
    return {
        ownerRoot,
        taskMapRoot: node_path_1.default.join(ownerRoot, "taskmap"),
        executionRoot: node_path_1.default.join(ownerRoot, "taskmap-local-execution"),
        legacyQuarantinedTaskIds: legacy?.activeTerminalTaskIds ?? [],
    };
}
function parseFlags(args) {
    const flags = new Map();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        if (key === undefined
            || value === undefined
            || !key.startsWith("--")
            || value.startsWith("--")
            || flags.has(key)) {
            fail();
        }
        flags.set(key, value);
    }
    return flags;
}
function rootsFromFlags(flags, dependencies) {
    const environment = dependencies.environment ?? process.env;
    const testOwnerRoot = flags.get("--test-owner-root");
    if (testOwnerRoot !== undefined) {
        if (environment[exports.TASKMAP_LOCAL_APPROVAL_TEST_MODE_ENV] !== "1"
            || !node_path_1.default.isAbsolute(testOwnerRoot)
            || node_path_1.default.normalize(testOwnerRoot) !== testOwnerRoot) {
            fail();
        }
        flags.delete("--test-owner-root");
        return {
            ownerRoot: testOwnerRoot,
            taskMapRoot: node_path_1.default.join(testOwnerRoot, "taskmap"),
            executionRoot: node_path_1.default.join(testOwnerRoot, "taskmap-local-execution"),
            legacyQuarantinedTaskIds: [],
        };
    }
    return productRoots(dependencies.homeDirectory ?? (0, node_os_1.homedir)(), environment);
}
function parseTaskMapLocalApprovalCliArguments(argv, dependencies = {}) {
    const [command, ...rawFlags] = argv;
    if (command !== "inspect" && command !== "approve-prepare")
        fail();
    const flags = parseFlags(rawFlags);
    const roots = rootsFromFlags(flags, dependencies);
    if (command === "inspect") {
        const taskId = flags.get("--task-id");
        if (flags.size > 1
            || (flags.size === 1 && !flags.has("--task-id"))
            || (taskId !== undefined && !TASK_ID.test(taskId))) {
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
    if (flags.size !== expectedKeys.size
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
        || new Date(authorizedAt).toISOString() !== authorizedAt) {
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
async function runTaskMapLocalApprovalCli(argv, dependencies = {}) {
    const parsed = parseTaskMapLocalApprovalCliArguments(argv, dependencies);
    if (parsed.command === "inspect") {
        const inspected = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)({
            taskMapRoot: parsed.roots.taskMapRoot,
            ownerRoot: parsed.roots.ownerRoot,
            ...(parsed.taskId === undefined ? {} : { taskId: parsed.taskId }),
        });
        if (parsed.roots.legacyQuarantinedTaskIds.includes(inspected.inspection.task.taskId)) {
            throw new legacy_local_state_quarantine_js_1.TaskMapLegacyLocalStateQuarantineError();
        }
        return inspected.response;
    }
    if (parsed.roots.legacyQuarantinedTaskIds.includes(parsed.taskId)) {
        throw new legacy_local_state_quarantine_js_1.TaskMapLegacyLocalStateQuarantineError();
    }
    return (await (0, local_approval_package_js_1.approveAndPrepareTaskMapLocalPackage)({
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
function taskMapLocalApprovalCliOutput(response) {
    const output = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(response)}\n`;
    if (Buffer.byteLength(output, "utf8") > exports.TASKMAP_LOCAL_APPROVAL_CLI_MAX_OUTPUT_BYTES) {
        throw new Error("Task Map local approval CLI output exceeded its bound");
    }
    return output;
}
async function main() {
    try {
        const response = await runTaskMapLocalApprovalCli(process.argv.slice(2));
        process.stdout.write(taskMapLocalApprovalCliOutput(response));
    }
    catch (error) {
        process.stderr.write(`taskmap-local-approval: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
