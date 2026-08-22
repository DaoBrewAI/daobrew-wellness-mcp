#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV = void 0;
exports.parseTaskMapAgentHandoffPreflightCliArguments = parseTaskMapAgentHandoffPreflightCliArguments;
exports.resolveTaskMapAgentWorkspaceBinding = resolveTaskMapAgentWorkspaceBinding;
exports.inspectTaskMapAgentAdapterHandoffPreflightFromPaths = inspectTaskMapAgentAdapterHandoffPreflightFromPaths;
exports.taskMapAgentAdapterPreflightArtifactPath = taskMapAgentAdapterPreflightArtifactPath;
exports.readTaskMapAgentAdapterHandoffPreflightArtifact = readTaskMapAgentAdapterHandoffPreflightArtifact;
exports.prepareTaskMapAgentAdapterHandoffPreflight = prepareTaskMapAgentAdapterHandoffPreflight;
exports.runTaskMapAgentHandoffPreflightCli = runTaskMapAgentHandoffPreflightCli;
exports.taskMapAgentHandoffPreflightCliOutput = taskMapAgentHandoffPreflightCliOutput;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const identity_js_1 = require("../../identity.js");
const agent_handoff_preflight_js_1 = require("./agent-handoff-preflight.js");
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const local_approval_package_js_1 = require("./local-approval-package.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV = "TASKMAP_AGENT_HANDOFF_PREFLIGHT_TEST_MODE";
const DIGEST = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40,64}$/;
const ADAPTER_PREFLIGHT_ID = /^tmadapterpreflight_[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function fail(message = "Task Map agent handoff preflight CLI input is invalid") {
    throw new Error(message);
}
function assertNormalizedAbsolute(value, label) {
    if (typeof value !== "string"
        || value.length === 0
        || Buffer.byteLength(value, "utf8") > 4_096
        || CONTROL_CHARACTER.test(value)
        || !node_path_1.default.isAbsolute(value)
        || node_path_1.default.normalize(value) !== value) {
        fail(`${label} is invalid`);
    }
    return value;
}
function parseFlags(args) {
    if (args.length === 0 || args.length % 2 !== 0)
        fail();
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
function productRoots(dependencies) {
    const environment = dependencies.environment ?? process.env;
    const homeDirectory = assertNormalizedAbsolute(dependencies.homeDirectory ?? (0, node_os_1.homedir)(), "home directory");
    const confirmed = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(homeDirectory, {
        userId: environment.DAOBREW_USER_ID,
        apiUrl: environment.DAOBREW_API_URL,
    });
    if (!confirmed.ok)
        fail("confirmed Task Map owner is unavailable");
    return {
        ownerRoot: confirmed.owner.ownerRoot,
        taskMapRoot: confirmed.owner.taskMapRoot,
        expectedCandidateOwnerScopeDigest: confirmed.owner.ownerScopeDigest,
    };
}
function rootsFromFlags(flags, dependencies) {
    const testOwnerRoot = flags.get("--test-owner-root");
    const ownerScopeDigest = flags.get("--test-owner-scope-digest");
    if (testOwnerRoot === undefined) {
        if (ownerScopeDigest !== undefined)
            fail();
        return productRoots(dependencies);
    }
    const environment = dependencies.environment ?? process.env;
    if (environment[exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV] !== "1"
        || ownerScopeDigest === undefined
        || !DIGEST.test(ownerScopeDigest)) {
        fail();
    }
    const ownerRoot = assertNormalizedAbsolute(testOwnerRoot, "test owner root");
    flags.delete("--test-owner-root");
    flags.delete("--test-owner-scope-digest");
    return {
        ownerRoot,
        taskMapRoot: node_path_1.default.join(ownerRoot, "taskmap"),
        expectedCandidateOwnerScopeDigest: ownerScopeDigest,
    };
}
function parseTaskMapAgentHandoffPreflightCliArguments(argv, dependencies = {}) {
    const [command, ...rawFlags] = argv;
    if (command !== "inspect")
        fail();
    const flags = parseFlags(rawFlags);
    const roots = rootsFromFlags(flags, dependencies);
    const adapter = flags.get("--adapter");
    const packagePath = flags.get("--package");
    const workspacePath = flags.get("--workspace");
    const expectedKeys = new Set(["--adapter", "--package", "--workspace"]);
    if (flags.size !== expectedKeys.size
        || [...flags.keys()].some((key) => !expectedKeys.has(key))
        || (adapter !== "codex" && adapter !== "claude_code")
        || packagePath === undefined
        || workspacePath === undefined) {
        fail();
    }
    return {
        command,
        ...roots,
        adapter,
        packagePath: assertNormalizedAbsolute(packagePath, "package path"),
        workspacePath: assertNormalizedAbsolute(workspacePath, "workspace path"),
    };
}
function expectedUid() {
    return typeof process.getuid === "function" ? process.getuid() : undefined;
}
async function assertOwnerControlledRegularFile(filePath, label) {
    const stat = await (0, promises_1.lstat)(filePath);
    if (!stat.isFile()
        || stat.isSymbolicLink()
        || (expectedUid() !== undefined && stat.uid !== expectedUid())
        || (stat.mode & 0o077) !== 0
        || await (0, promises_1.realpath)(filePath) !== filePath) {
        fail(`${label} is unsafe`);
    }
}
async function assertOwnerControlledDirectory(directoryPath, label) {
    const stat = await (0, promises_1.lstat)(directoryPath);
    if (!stat.isDirectory()
        || stat.isSymbolicLink()
        || (expectedUid() !== undefined && stat.uid !== expectedUid())
        || await (0, promises_1.realpath)(directoryPath) !== directoryPath) {
        fail(`${label} is unsafe`);
    }
}
async function gitOutput(workspacePath, args) {
    const result = await execFileAsync("git", ["-C", workspacePath, ...args], {
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 64 * 1_024,
        windowsHide: true,
    });
    const output = result.stdout.trim();
    if (output.length === 0 || CONTROL_CHARACTER.test(output)) {
        fail("Git workspace output is invalid");
    }
    return output;
}
async function resolveTaskMapAgentWorkspaceBinding(input) {
    const workspacePath = assertNormalizedAbsolute(input.workspacePath, "workspace path");
    if (!DIGEST.test(input.expectedCandidateOwnerScopeDigest)
        || (input.routingIdentityKind !== "project"
            && input.routingIdentityKind !== "repository")) {
        fail("candidate owner scope digest is invalid");
    }
    await assertOwnerControlledDirectory(workspacePath, "workspace directory");
    const repositoryRoot = node_path_1.default.normalize(await gitOutput(workspacePath, ["rev-parse", "--show-toplevel"]));
    const relativeToRepository = node_path_1.default.relative(repositoryRoot, workspacePath);
    const workspaceInsideRepository = (relativeToRepository === ""
        || (relativeToRepository !== ".."
            && !relativeToRepository.startsWith(`..${node_path_1.default.sep}`)
            && !node_path_1.default.isAbsolute(relativeToRepository)));
    if (!workspaceInsideRepository
        || (input.routingIdentityKind === "repository"
            && repositoryRoot !== workspacePath)) {
        fail("selected workspace must be the Git repository root");
    }
    const head = await gitOutput(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
    if (!GIT_COMMIT.test(head))
        fail("Git workspace HEAD is invalid");
    const routingDomain = input.routingIdentityKind === "project"
        ? agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN
        : agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN;
    const routingPath = input.routingIdentityKind === "project"
        ? workspacePath : repositoryRoot;
    const repositoryIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: routingDomain,
        ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
        nativeIdentity: routingPath.normalize("NFKC"),
    });
    return (0, agent_handoff_preflight_js_1.buildTaskMapAgentWorkspaceBinding)({
        projectId: `tmproject_${(0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-agent-selected-project.1",
            repositoryIdentityDigest,
        })}`,
        repositoryIdentityDigest,
        workspaceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-agent-git-workspace-revision.1",
            repositoryIdentityDigest,
            head,
        }),
    });
}
function assertInspectInput(input) {
    if ((input.adapter !== "codex" && input.adapter !== "claude_code")
        || !DIGEST.test(input.expectedCandidateOwnerScopeDigest)) {
        fail();
    }
    assertNormalizedAbsolute(input.ownerRoot, "owner root");
    assertNormalizedAbsolute(input.taskMapRoot, "task map root");
    assertNormalizedAbsolute(input.packagePath, "package path");
    assertNormalizedAbsolute(input.workspacePath, "workspace path");
    if (input.taskMapRoot !== node_path_1.default.join(input.ownerRoot, "taskmap"))
        fail();
}
async function selectedPackageTaskId(packagePath) {
    await assertOwnerControlledRegularFile(packagePath, "package artifact");
    const handle = await (0, promises_1.open)(packagePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const stat = await handle.stat();
        if (stat.size <= 0 || stat.size > agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
            fail("selected package is invalid");
        }
        const bytes = await handle.readFile();
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            fail("selected package is invalid");
        }
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed) !== bytes.toString("utf8")
            || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            fail("selected package is invalid");
        }
        const candidate = parsed;
        const task = candidate.task;
        if (candidate.contractVersion !== "taskmap-local-execution-package.v1"
            || task === null || typeof task !== "object" || Array.isArray(task)
            || !TASK_ID.test(task.taskId)) {
            fail("selected package is invalid");
        }
        return task.taskId;
    }
    finally {
        await handle.close();
    }
}
async function inspectTaskMapAgentAdapterHandoffPreflightFromPaths(input, dependencies = {}) {
    assertInspectInput(input);
    const taskId = await selectedPackageTaskId(input.packagePath);
    const local = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)({
        ownerRoot: input.ownerRoot,
        taskMapRoot: input.taskMapRoot,
        taskId,
    });
    if (local.response.status !== "package_ready"
        || local.response.artifactAccess === null
        || local.response.artifactAccess.packagePath !== input.packagePath
        || node_path_1.default.dirname(input.packagePath)
            !== local.response.artifactAccess.revealDirectoryPath
        || local.agentSessionEpisode === null) {
        fail("selected package is not the current prepared package");
    }
    await assertOwnerControlledRegularFile(input.packagePath, "package artifact");
    const workspaceBinding = await (dependencies.resolveWorkspaceBinding ?? resolveTaskMapAgentWorkspaceBinding)({
        workspacePath: input.workspacePath,
        expectedCandidateOwnerScopeDigest: input.expectedCandidateOwnerScopeDigest,
        routingIdentityKind: local.agentSessionEpisode.routingIdentityKind,
    });
    return (0, agent_handoff_preflight_js_1.inspectTaskMapAdoptedAgentAdapterPreflight)({
        adapter: input.adapter,
        ownerRoot: input.ownerRoot,
        taskMapRoot: input.taskMapRoot,
        expectedCandidateOwnerScopeDigest: input.expectedCandidateOwnerScopeDigest,
        taskId,
        workspaceBinding,
    });
}
function taskMapAgentAdapterPreflightArtifactPath(packagePath, adapterPreflightId) {
    assertNormalizedAbsolute(packagePath, "package path");
    if (!ADAPTER_PREFLIGHT_ID.test(adapterPreflightId))
        fail();
    return node_path_1.default.join(node_path_1.default.dirname(packagePath), `adapter-preflight_${adapterPreflightId}.json`);
}
async function readPrivateCanonicalArtifact(artifactPath) {
    let handle;
    try {
        handle = await (0, promises_1.open)(artifactPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const stat = await handle.stat();
        if (!stat.isFile()
            || (expectedUid() !== undefined && stat.uid !== expectedUid())
            || (stat.mode & 0o777) !== FILE_MODE
            || stat.size <= 0
            || stat.size > agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
            fail("adapter preflight artifact is unsafe");
        }
        const bytes = await handle.readFile();
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            fail("adapter preflight artifact is invalid");
        }
        (0, agent_handoff_preflight_js_1.assertTaskMapAgentAdapterHandoffPreflight)(parsed);
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed) !== bytes.toString("utf8")) {
            fail("adapter preflight artifact is not canonical");
        }
        return parsed;
    }
    finally {
        await handle?.close();
    }
}
async function readTaskMapAgentAdapterHandoffPreflightArtifact(packagePath, adapterPreflightId) {
    const artifactPath = taskMapAgentAdapterPreflightArtifactPath(packagePath, adapterPreflightId);
    return readPrivateCanonicalArtifact(artifactPath);
}
async function persistImmutableAdapterPreflight(packagePath, preflight) {
    (0, agent_handoff_preflight_js_1.assertTaskMapAgentAdapterHandoffPreflight)(preflight);
    const artifactPath = taskMapAgentAdapterPreflightArtifactPath(packagePath, preflight.adapterPreflightId);
    const directoryPath = node_path_1.default.dirname(artifactPath);
    await assertOwnerControlledDirectory(directoryPath, "package directory");
    const directoryStat = await (0, promises_1.lstat)(directoryPath);
    if ((directoryStat.mode & 0o777) !== DIRECTORY_MODE) {
        fail("package directory permissions are unsafe");
    }
    const bytes = Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(preflight), "utf8");
    if (bytes.byteLength <= 0
        || bytes.byteLength
            > agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
        fail("adapter preflight artifact exceeds its byte bound");
    }
    let handle;
    try {
        handle = await (0, promises_1.open)(artifactPath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        await handle.writeFile(bytes);
        await handle.sync();
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
    }
    finally {
        await handle?.close();
    }
    const readback = await readPrivateCanonicalArtifact(artifactPath);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(readback) !== bytes.toString("utf8")) {
        fail("immutable adapter preflight artifact conflicts with existing bytes");
    }
    return artifactPath;
}
async function prepareTaskMapAgentAdapterHandoffPreflight(input, dependencies = {}) {
    const preflight = await inspectTaskMapAgentAdapterHandoffPreflightFromPaths(input, dependencies);
    const artifactPath = await persistImmutableAdapterPreflight(input.packagePath, preflight);
    return { preflight, artifactPath };
}
async function runTaskMapAgentHandoffPreflightCli(argv, dependencies = {}) {
    const parsed = parseTaskMapAgentHandoffPreflightCliArguments(argv, dependencies);
    const prepared = await prepareTaskMapAgentAdapterHandoffPreflight(parsed, dependencies);
    return prepared.preflight;
}
function taskMapAgentHandoffPreflightCliOutput(preflight) {
    (0, agent_handoff_preflight_js_1.assertTaskMapAgentAdapterHandoffPreflight)(preflight);
    const output = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(preflight)}\n`;
    if (Buffer.byteLength(output, "utf8")
        > agent_handoff_preflight_js_1.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxSummaryBytes) {
        fail("adapter preflight CLI output exceeded its byte bound");
    }
    return output;
}
async function main() {
    try {
        const result = await runTaskMapAgentHandoffPreflightCli(process.argv.slice(2));
        process.stdout.write(taskMapAgentHandoffPreflightCliOutput(result));
    }
    catch (error) {
        process.stderr.write(`taskmap-agent-handoff-preflight: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
