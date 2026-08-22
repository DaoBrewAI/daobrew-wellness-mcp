#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_LOCAL_COMPLETION_CLOSED_EXECUTION_BINDING_DOMAIN = exports.TASKMAP_LOCAL_COMPLETION_READY_PROOF_TARGETS_BINDING_DOMAIN = exports.TASKMAP_LOCAL_COMPLETION_TERMINAL_OVERLAY_BINDING_DOMAIN = exports.TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS = exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS = exports.TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS = exports.TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES = exports.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV = exports.TASKMAP_LOCAL_COMPLETION_CLI_RESPONSE_VERSION = void 0;
exports.taskMapLocalCompletionTerminalOverlayBindingDigest = taskMapLocalCompletionTerminalOverlayBindingDigest;
exports.taskMapLocalCompletionReadyProofTargetsBindingDigest = taskMapLocalCompletionReadyProofTargetsBindingDigest;
exports.taskMapLocalCompletionClosedExecutionBindingDigest = taskMapLocalCompletionClosedExecutionBindingDigest;
exports.parseTaskMapLocalCompletionCliArguments = parseTaskMapLocalCompletionCliArguments;
exports.runTaskMapLocalCompletionCli = runTaskMapLocalCompletionCli;
exports.taskMapLocalCompletionCliOutput = taskMapLocalCompletionCliOutput;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const agent_execution_receipts_js_1 = require("./agent-execution-receipts.js");
const local_approval_package_js_1 = require("./local-approval-package.js");
const legacy_local_state_quarantine_js_1 = require("./legacy-local-state-quarantine.js");
const local_completion_overlay_js_1 = require("./local-completion-overlay.js");
const native_predecessor_evidence_js_1 = require("./native-predecessor-evidence.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const source_contracts_js_1 = require("./source-contracts.js");
const ready_frontier_js_1 = require("./ready-frontier.js");
const identity_js_1 = require("../../identity.js");
exports.TASKMAP_LOCAL_COMPLETION_CLI_RESPONSE_VERSION = "taskmap-local-completion-cli-response.v1";
exports.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV = "TASKMAP_LOCAL_COMPLETION_TEST_MODE";
// Worst-case response sizing stays below 256 KiB:
// - 256 sealed history rows: < 177 KiB
// - ready proof-target artifact: <= 32 KiB
// - terminal ids repeated in union + disposition arrays: < 18 KiB
// - ready ids and the fixed response envelope: < 29 KiB
exports.TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES = 256 * 1_024;
exports.TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS = 32;
exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS = 256;
exports.TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS = 32;
exports.TASKMAP_LOCAL_COMPLETION_TERMINAL_OVERLAY_BINDING_DOMAIN = "taskmap-local-completion-terminal-overlay-binding.1";
exports.TASKMAP_LOCAL_COMPLETION_READY_PROOF_TARGETS_BINDING_DOMAIN = "taskmap-local-completion-ready-proof-targets-binding.1";
exports.TASKMAP_LOCAL_COMPLETION_CLOSED_EXECUTION_BINDING_DOMAIN = "taskmap-local-completion-closed-execution-binding.1";
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_PRIVATE_FILE_BYTES = 2 * 1_024 * 1_024;
const MAX_HISTORY_FILES = exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS;
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const CLOSE_DECISION_ID = /^tmlocalclose_[a-f0-9]{64}$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_LIFECYCLE_TRANSACTION_HELD = Symbol("taskmap-local-lifecycle-transaction-held");
function fail() {
    throw new Error("Task Map local completion CLI unavailable");
}
function boundedResponseTaskId(value) {
    return TASK_ID.test(value)
        && value.length
            <= exports.TASKMAP_LOCAL_COMPLETION_MAX_RESPONSE_TASK_ID_CHARACTERS;
}
function exactUniqueTaskIds(values, maximum) {
    return values.length <= maximum
        && values.every(boundedResponseTaskId)
        && new Set(values).size === values.length;
}
function exactSortedUniqueTaskIds(values, maximum) {
    return exactUniqueTaskIds(values, maximum)
        && values.every((value, index) => (index === 0 || values[index - 1] < value));
}
function exactClosedExecutionHistory(values) {
    if (values.length > MAX_HISTORY_FILES
        || new Set(values.map((entry) => entry.taskId)).size !== values.length
        || new Set(values.map((entry) => entry.closeDecisionId)).size
            !== values.length) {
        return false;
    }
    return values.every((entry, index) => (boundedResponseTaskId(entry.taskId)
        && ROOT_ID.test(entry.rootId)
        && UUID.test(entry.sessionId)
        && CLOSE_DECISION_ID.test(entry.closeDecisionId)
        && SHA256.test(entry.closeDecisionDigest)
        && entry.closeDecisionId
            === `tmlocalclose_${entry.closeDecisionDigest}`
        && STRICT_RFC3339.test(entry.closedAt)
        && Number.isFinite(Date.parse(entry.closedAt))
        && SHA256.test(entry.projectionDigest)
        && (index === 0
            || Date.parse(values[index - 1].closedAt)
                > Date.parse(entry.closedAt)
            || (Date.parse(values[index - 1].closedAt)
                === Date.parse(entry.closedAt)
                && (values[index - 1].taskId < entry.taskId
                    || (values[index - 1].taskId === entry.taskId
                        && values[index - 1].closeDecisionId
                            < entry.closeDecisionId))))));
}
function lengthFramedSha256(domain, fields) {
    if (domain.length === 0
        || domain.includes("\0")
        || fields.some((field) => field.includes("\0"))) {
        fail();
    }
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update(domain, "utf8");
    hash.update(Buffer.from([0]));
    for (const field of fields) {
        const bytes = Buffer.from(field, "utf8");
        hash.update(String(bytes.byteLength), "utf8");
        hash.update(Buffer.from([0]));
        hash.update(bytes);
        hash.update(Buffer.from([0]));
    }
    return hash.digest("hex");
}
function taskMapLocalCompletionTerminalOverlayBindingDigest(input) {
    if (!SHA256.test(input.projectionDigest)
        || !SHA256.test(input.terminalOverlayArtifactDigest)
        || input.terminalTaskIds.length
            > exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS
        || input.terminalTaskIds.some((taskId) => !boundedResponseTaskId(taskId))) {
        fail();
    }
    const terminalTaskIds = [...input.terminalTaskIds].sort();
    if (new Set(terminalTaskIds).size !== terminalTaskIds.length)
        fail();
    return lengthFramedSha256(exports.TASKMAP_LOCAL_COMPLETION_TERMINAL_OVERLAY_BINDING_DOMAIN, [
        input.projectionDigest,
        input.terminalOverlayArtifactDigest,
        String(terminalTaskIds.length),
        ...terminalTaskIds,
    ]);
}
function taskMapLocalCompletionReadyProofTargetsBindingDigest(input) {
    if (!SHA256.test(input.inputDigest)
        || !SHA256.test(input.projectionDigest)
        || !SHA256.test(input.currentnessBindingDigest)
        || !SHA256.test(input.proofTargetSourceArtifactDigest)
        || input.readyProofTargets.length
            > exports.TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS
        || Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(input.readyProofTargets), "utf8") > ready_frontier_js_1.TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargetsArtifactBytes) {
        fail();
    }
    const taskIds = input.readyProofTargets.map((target) => target.taskId);
    if (taskIds.some((taskId) => !boundedResponseTaskId(taskId))
        || new Set(taskIds).size !== taskIds.length) {
        fail();
    }
    return lengthFramedSha256(exports.TASKMAP_LOCAL_COMPLETION_READY_PROOF_TARGETS_BINDING_DOMAIN, [
        input.projectionContractVersion,
        input.runId,
        input.inputDigest,
        input.generatedAt,
        input.projectionDigest,
        input.currentnessBindingDigest,
        input.proofTargetSourceArtifactDigest,
        String(input.readyProofTargets.length),
        ...input.readyProofTargets.map(source_contracts_js_1.taskMapContractCanonicalJson),
    ]);
}
function taskMapLocalCompletionClosedExecutionBindingDigest(input) {
    if (!CLOSE_DECISION_ID.test(input.closeDecisionId)
        || !TASK_ID.test(input.taskId)
        || !ROOT_ID.test(input.rootId)
        || !UUID.test(input.sessionId)
        || !SHA256.test(input.packageDigest)
        || PACKAGE_ID.exec(input.packageId)?.[1] !== input.packageDigest
        || !SHA256.test(input.workspaceBindingDigest)
        || (input.launchedAdapter !== "claude_code"
            && input.launchedAdapter !== "codex_cli")
        || !STRICT_RFC3339.test(input.startedAt)
        || !Number.isFinite(Date.parse(input.startedAt))
        || !STRICT_RFC3339.test(input.finishedAt)
        || !Number.isFinite(Date.parse(input.finishedAt))
        || Date.parse(input.startedAt) > Date.parse(input.finishedAt)
        || !Number.isSafeInteger(input.artifactCount)
        || input.artifactCount < 1
        || !SHA256.test(input.artifactReceiptDigest)
        || !SHA256.test(input.reportReceiptDigest)
        || input.reportRelativePaths.length !== 2
        || input.reportRelativePaths[0] !== "report.md"
        || input.reportRelativePaths[1] !== "report.html") {
        fail();
    }
    return lengthFramedSha256(exports.TASKMAP_LOCAL_COMPLETION_CLOSED_EXECUTION_BINDING_DOMAIN, [
        input.closeDecisionId,
        input.taskId,
        input.rootId,
        input.sessionId,
        input.packageId,
        input.packageDigest,
        input.workspaceBindingDigest,
        input.launchedAdapter,
        input.startedAt,
        input.finishedAt,
        String(input.artifactCount),
        input.artifactReceiptDigest,
        input.reportReceiptDigest,
        String(input.reportRelativePaths.length),
        ...input.reportRelativePaths,
    ]);
}
function productRoots(ownerRoot, homeDirectory, legacyQuarantinedTaskIds = []) {
    return {
        homeDirectory,
        ownerRoot,
        taskMapRoot: node_path_1.default.join(ownerRoot, "taskmap"),
        localExecutionRoot: node_path_1.default.join(ownerRoot, "taskmap-local-execution"),
        agentExecutionRoot: node_path_1.default.join(ownerRoot, "taskmap-agent-execution"),
        decisionsRoot: node_path_1.default.join(ownerRoot, "taskmap-local-execution", "completion-decisions"),
        overlayPath: node_path_1.default.join(ownerRoot, "taskmap-local-execution", "completion-overlay.v1.json"),
        readyFrontierPath: node_path_1.default.join(ownerRoot, "taskmap-local-execution", "ready-frontier.v1.json"),
        readyProofTargetsPath: node_path_1.default.join(ownerRoot, "taskmap", "taskmap-ready-proof-targets.v1.json"),
        legacyQuarantinedTaskIds,
    };
}
function confirmedOwner(homeDirectory, environment) {
    const normalized = node_path_1.default.normalize(homeDirectory);
    if (!node_path_1.default.isAbsolute(normalized))
        fail();
    const confirmed = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(normalized, {
        userId: environment.DAOBREW_USER_ID,
        apiUrl: environment.DAOBREW_API_URL,
    });
    if (!confirmed.ok)
        fail();
    const legacy = (0, legacy_local_state_quarantine_js_1.assertNoUnmigratedTaskMapLegacyLocalState)({
        homeDirectory: normalized,
        ownerRoot: confirmed.owner.ownerRoot,
    });
    return {
        ownerRoot: confirmed.owner.ownerRoot,
        legacyQuarantinedTaskIds: legacy?.activeTerminalTaskIds ?? [],
    };
}
function parseFlags(args) {
    if (args.length % 2 !== 0)
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
function rootsFromFlags(flags, dependencies) {
    const internalDependencies = dependencies;
    const environment = dependencies.environment ?? process.env;
    const testOwnerRoot = flags.get("--test-owner-root");
    if (testOwnerRoot !== undefined) {
        const injectedLegacyTaskIds = [
            ...(internalDependencies.legacyQuarantinedTaskIdsForTest ?? []),
        ];
        if (environment[exports.TASKMAP_LOCAL_COMPLETION_CLI_TEST_MODE_ENV] !== "1"
            || !node_path_1.default.isAbsolute(testOwnerRoot)
            || node_path_1.default.normalize(testOwnerRoot) !== testOwnerRoot
            || !exactSortedUniqueTaskIds(injectedLegacyTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS)) {
            fail();
        }
        flags.delete("--test-owner-root");
        return productRoots(testOwnerRoot, dependencies.homeDirectory ?? testOwnerRoot, injectedLegacyTaskIds);
    }
    if (internalDependencies.legacyQuarantinedTaskIdsForTest !== undefined) {
        fail();
    }
    const homeDirectory = dependencies.homeDirectory ?? (0, node_os_1.homedir)();
    const confirmed = confirmedOwner(homeDirectory, environment);
    return productRoots(confirmed.ownerRoot, homeDirectory, confirmed.legacyQuarantinedTaskIds);
}
function parseTaskMapLocalCompletionCliArguments(argv, dependencies = {}) {
    const [command, ...rawFlags] = argv;
    if (command !== "overlay"
        && command !== "inspect-overlay"
        && command !== "inspect-closed-execution"
        && command !== "review"
        && command !== "close"
        && command !== "keep-open"
        && command !== "complete-elsewhere"
        && command !== "reopen") {
        fail();
    }
    const flags = parseFlags(rawFlags);
    const roots = rootsFromFlags(flags, dependencies);
    if (command === "overlay" || command === "inspect-overlay") {
        if (flags.size !== 0)
            fail();
        return { command, roots };
    }
    const taskId = flags.get("--task-id");
    if (command === "inspect-closed-execution") {
        if (flags.size !== 1
            || taskId === undefined
            || !TASK_ID.test(taskId)) {
            fail();
        }
        return { command, roots, taskId };
    }
    const decidedAt = flags.get("--decided-at");
    if (command === "complete-elsewhere" || command === "reopen") {
        if (flags.size !== 2
            || taskId === undefined
            || decidedAt === undefined
            || !TASK_ID.test(taskId)
            || !STRICT_RFC3339.test(decidedAt)
            || !Number.isFinite(Date.parse(decidedAt))) {
            fail();
        }
        return { command, roots, taskId, decidedAt };
    }
    const sessionId = flags.get("--session-id");
    if (flags.size !== 3
        || taskId === undefined
        || sessionId === undefined
        || decidedAt === undefined
        || !TASK_ID.test(taskId)
        || !UUID.test(sessionId)
        || !STRICT_RFC3339.test(decidedAt)
        || !Number.isFinite(Date.parse(decidedAt))) {
        fail();
    }
    return {
        command,
        roots,
        taskId,
        sessionId,
        decidedAt,
    };
}
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
async function assertOwnerDirectory(directory, create) {
    if (create) {
        await (0, promises_1.mkdir)(directory, { recursive: true, mode: DIRECTORY_MODE });
        await (0, promises_1.chmod)(directory, DIRECTORY_MODE);
    }
    const resolved = await (0, promises_1.realpath)(directory);
    const stats = await (0, promises_1.lstat)(directory);
    const uid = typeof process.getuid === "function"
        ? process.getuid()
        : stats.uid;
    if (resolved !== directory
        || !stats.isDirectory()
        || stats.isSymbolicLink()
        || stats.uid !== uid
        || (stats.mode & 0o777) !== DIRECTORY_MODE) {
        fail();
    }
}
async function readHandleFully(handle, maximumBytes) {
    const before = await handle.stat();
    const uid = typeof process.getuid === "function"
        ? process.getuid()
        : before.uid;
    if (!before.isFile()
        || before.uid !== uid
        || before.nlink !== 1
        || (before.mode & 0o777) !== FILE_MODE
        || before.size < 2
        || before.size > maximumBytes) {
        fail();
    }
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (read.bytesRead < 1)
            fail();
        offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (after.dev !== before.dev
        || after.ino !== before.ino
        || after.size !== before.size) {
        fail();
    }
    return bytes;
}
async function readPrivateJson(filePath, maximumBytes = MAX_PRIVATE_FILE_BYTES) {
    const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        return JSON.parse((await readHandleFully(handle, maximumBytes)).toString("utf8"));
    }
    finally {
        await handle.close();
    }
}
async function readLifecycleHistory(roots) {
    try {
        await assertOwnerDirectory(roots.localExecutionRoot, false);
    }
    catch (error) {
        try {
            await (0, promises_1.lstat)(roots.localExecutionRoot);
        }
        catch (absenceError) {
            if (absenceError.code === "ENOENT") {
                // Nothing has ever executed locally: an absent execution root is the
                // empty history, not a fail-closed integrity violation.
                return [];
            }
            throw absenceError;
        }
        throw error;
    }
    try {
        await assertOwnerDirectory(roots.decisionsRoot, false);
    }
    catch (error) {
        try {
            await (0, promises_1.lstat)(roots.decisionsRoot);
        }
        catch (absenceError) {
            if (absenceError.code === "ENOENT") {
                return [];
            }
            throw absenceError;
        }
        throw error;
    }
    const entries = (await (0, promises_1.readdir)(roots.decisionsRoot, {
        withFileTypes: true,
    })).filter((entry) => entry.isFile()
        && !entry.isSymbolicLink()
        && entry.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length > MAX_HISTORY_FILES)
        fail();
    const history = [];
    for (const entry of entries) {
        const parsed = await readPrivateJson(node_path_1.default.join(roots.decisionsRoot, entry.name), 64 * 1_024);
        (0, local_completion_overlay_js_1.assertTaskMapLocalLifecycleDecision)(parsed);
        history.push(parsed);
    }
    return history;
}
function closedExecutionHistory(localOwnerScopeDigest, history) {
    if (!SHA256.test(localOwnerScopeDigest)
        || history.some((decision) => decision.localOwnerScopeDigest !== localOwnerScopeDigest)) {
        fail();
    }
    const reopenedCloseDecisionIds = new Set(history
        .filter((decision) => decision.decision === "reopen")
        .map((decision) => decision.previousCloseDecisionId));
    const entries = history
        .filter((decision) => (decision.decision === "close"
        && !reopenedCloseDecisionIds.has(decision.closeDecisionId)))
        .map((decision) => ({
        taskId: decision.identity.taskId,
        rootId: decision.identity.rootId,
        sessionId: decision.binding.session.sessionId,
        closeDecisionId: decision.closeDecisionId,
        closeDecisionDigest: decision.closeDecisionDigest,
        closedAt: decision.closedAt,
        projectionDigest: decision.binding.projection.projectionDigest,
    }))
        .sort((left, right) => (Date.parse(right.closedAt) - Date.parse(left.closedAt)
        || left.taskId.localeCompare(right.taskId)
        || left.closeDecisionId.localeCompare(right.closeDecisionId)));
    if (entries.length > MAX_HISTORY_FILES
        || new Set(entries.map((entry) => entry.taskId)).size !== entries.length
        || new Set(entries.map((entry) => entry.closeDecisionId)).size
            !== entries.length) {
        fail();
    }
    return entries;
}
async function writeImmutableDecision(roots, decision) {
    await assertOwnerDirectory(roots.localExecutionRoot, false);
    await assertOwnerDirectory(roots.decisionsRoot, true);
    const identifier = "closeDecisionId" in decision
        ? decision.closeDecisionId
        : "reopenDecisionId" in decision
            ? decision.reopenDecisionId
            : "externalCompletionDecisionId" in decision
                ? decision.externalCompletionDecisionId
                : decision.externalReopenDecisionId;
    const bytes = Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(decision), "utf8");
    const destination = node_path_1.default.join(roots.decisionsRoot, `${identifier}.json`);
    let handle = null;
    try {
        handle = await (0, promises_1.open)(destination, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.chmod(FILE_MODE);
    }
    catch (error) {
        if (error instanceof Error
            && "code" in error
            && error.code === "EEXIST") {
            const existing = await readPrivateJson(destination, bytes.length);
            if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(existing)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(decision)) {
                fail();
            }
            return;
        }
        throw error;
    }
    finally {
        await handle?.close();
    }
}
async function writeDerivedOverlay(roots, value) {
    await assertOwnerDirectory(roots.localExecutionRoot, true);
    const bytes = (0, local_completion_overlay_js_1.taskMapLocalCompletionOverlayCanonicalBytes)(value);
    const temporary = `${roots.overlayPath}.stage.${process.pid}.${sha256(bytes.toString("utf8"))}`;
    const handle = await (0, promises_1.open)(temporary, node_fs_1.constants.O_WRONLY
        | node_fs_1.constants.O_CREAT
        | node_fs_1.constants.O_EXCL
        | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.chmod(FILE_MODE);
    }
    finally {
        await handle.close();
    }
    await (0, promises_1.rename)(temporary, roots.overlayPath);
    const directory = await (0, promises_1.open)(roots.localExecutionRoot, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY);
    try {
        await directory.sync();
    }
    finally {
        await directory.close();
    }
}
async function writeDerivedReadyFrontier(roots, value) {
    const bytes = Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8");
    const temporary = `${roots.readyFrontierPath}.stage.${process.pid}.${sha256(bytes.toString("utf8"))}`;
    const handle = await (0, promises_1.open)(temporary, node_fs_1.constants.O_WRONLY
        | node_fs_1.constants.O_CREAT
        | node_fs_1.constants.O_EXCL
        | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
    try {
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.chmod(FILE_MODE);
    }
    finally {
        await handle.close();
    }
    await (0, promises_1.rename)(temporary, roots.readyFrontierPath);
    const directory = await (0, promises_1.open)(roots.localExecutionRoot, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY);
    try {
        await directory.sync();
    }
    finally {
        await directory.close();
    }
}
function sourceObjectKeyDigest(pointerId) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-local-completion-source-object-key.1",
        pointerId,
    });
}
function sourceIdentityDigest(pointerId, sourceKind, sourceRevision) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-local-completion-source-identity.1",
        pointerId,
        sourceKind,
        sourceRevision,
    });
}
function identityForTask(projection, task) {
    const taskHomePointerId = task.taskHomePointerId;
    if (taskHomePointerId === undefined)
        return null;
    const source = projection.sources.find((candidate) => candidate.id === taskHomePointerId);
    if (source === undefined)
        return null;
    const sourceCitations = task.citations
        .filter((citation) => citation.pointerId === taskHomePointerId)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
        || left.eventId.localeCompare(right.eventId));
    const revision = source.sourceVersion ?? sourceCitations[0]?.eventId ?? "observed";
    const observedAt = projection.generatedAt;
    const aliasPointerIds = [...new Set([
            ...task.originPointerIds,
            ...task.citations.map((citation) => citation.pointerId),
        ])].filter((pointerId) => pointerId !== taskHomePointerId).sort();
    return (0, local_completion_overlay_js_1.buildTaskMapLocalCompletionIdentity)({
        taskId: task.id,
        rootId: task.rootId,
        workId: taskHomePointerId,
        canonicalSourceObjectKeyDigest: sourceObjectKeyDigest(taskHomePointerId),
        aliasSourceObjectKeyDigests: aliasPointerIds.map(sourceObjectKeyDigest),
        sourceIdentityDigest: sourceIdentityDigest(taskHomePointerId, source.sourceKind, revision),
        sourceRevision: revision,
        sourceRevisionObservedAt: observedAt,
    });
}
function graphNodes(projection) {
    const nodes = projection.roots.map((root) => ({
        nodeId: root.id,
        title: root.title,
        kind: "root",
        parentNodeId: null,
        candidate: null,
    }));
    for (const task of projection.tasks) {
        const identity = identityForTask(projection, task);
        if (identity === null)
            continue;
        nodes.push({
            nodeId: task.id,
            title: task.title,
            kind: "leaf",
            parentNodeId: task.rootId,
            candidate: {
                identity,
                evidenceKind: "authoritative_source",
            },
        });
    }
    return nodes;
}
async function currentLifecycleContext(roots, dependencies) {
    const inspect = dependencies.inspectLifecycleContext
        ?? local_approval_package_js_1.inspectTaskMapLocalLifecycleContext;
    return inspect({
        taskMapRoot: roots.taskMapRoot,
        ownerRoot: roots.ownerRoot,
    });
}
async function currentApprovalContext(roots, dependencies, taskId) {
    const inspect = dependencies.inspectOperationalContext
        ?? local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext;
    return inspect({
        taskMapRoot: roots.taskMapRoot,
        ownerRoot: roots.ownerRoot,
        taskId,
    });
}
async function exactDeadlineEvidence(roots, context, dependencies) {
    const load = dependencies.loadPredecessorEvidence
        ?? native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence;
    const verified = await load({
        homeDirectory: roots.homeDirectory,
    });
    const projection = context.projection;
    const currentness = context.currentness;
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    if (currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== projectionDigest
        || verified.binding.runId !== projection.runId
        || verified.binding.inputDigest !== projection.inputDigest
        || verified.binding.projectionDigest !== projectionDigest
        || verified.binding.projectionFileDigest
            !== context.projectionFileDigest
        || verified.binding.currentnessFileDigest
            !== context.currentnessFileDigest) {
        fail();
    }
    const deadlineByPointer = new Map();
    for (const event of verified.taskMapInput.events) {
        if (event.deadlineAt === undefined)
            continue;
        if (!STRICT_RFC3339.test(event.deadlineAt)
            || !Number.isFinite(Date.parse(event.deadlineAt))) {
            fail();
        }
        deadlineByPointer.set(event.pointerId, event.deadlineAt);
    }
    const rows = projection.tasks.map((task) => ({
        taskId: task.id,
        deadlineAt: task.taskHomePointerId === undefined
            ? null
            : deadlineByPointer.get(task.taskHomePointerId) ?? null,
    }));
    return {
        sourceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-ready-frontier-native-predecessor-deadline-source.1",
            binding: verified.binding,
        }),
        rows,
    };
}
async function readyFrontier(roots, context, overlay, terminalTaskIds, evaluatedAt, dependencies) {
    try {
        const deadlines = await exactDeadlineEvidence(roots, context, dependencies);
        const causalGrades = context.projection.roots.map((root) => ({
            rootId: root.id,
            causalGrade: root.causalGrade,
        }));
        let proofTargets;
        let readyProofTargetsArtifactDigest = null;
        let readyProofTargetsSourceArtifactDigest;
        try {
            const published = await readPrivateJson(roots.readyProofTargetsPath);
            const validated = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(published, context.projection, context.currentness);
            proofTargets = validated.proofTargets;
            readyProofTargetsArtifactDigest = validated.artifactDigest;
            readyProofTargetsSourceArtifactDigest = validated.artifactDigest;
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
            // Absence is an explicit empty proof collection. Current Work is an
            // attention companion, not execution authority, so it may never be
            // promoted into a singleton ready frontier as a fallback.
            const empty = (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
                projection: context.projection,
                currentness: context.currentness,
                proofTargets: [],
            });
            proofTargets = empty.proofTargets;
            readyProofTargetsArtifactDigest = empty.artifactDigest;
            readyProofTargetsSourceArtifactDigest = empty.artifactDigest;
        }
        const causalGradeSourceDigest = context.currentness.projectionDigest;
        const exactDeadlineBindingDigest = (0, ready_frontier_js_1.taskMapReadyFrontierDeadlineBindingDigest)({
            projection: context.projection,
            currentness: context.currentness,
            sourceDigest: deadlines.sourceDigest,
            rows: deadlines.rows,
        });
        const causalGradeBindingDigest = (0, ready_frontier_js_1.taskMapReadyFrontierCausalGradeBindingDigest)({
            projection: context.projection,
            currentness: context.currentness,
            sourceDigest: causalGradeSourceDigest,
            rows: causalGrades,
        });
        return {
            frontier: (0, ready_frontier_js_1.buildTaskMapReadyFrontier)({
                projection: context.projection,
                currentness: context.currentness,
                evaluatedAt,
                terminalOverlay: {
                    contractVersion: overlay.contractVersion,
                    artifactDigest: overlay.artifactDigest,
                    localOwnerScopeDigest: overlay.localOwnerScopeDigest,
                    terminalTaskIds,
                },
                exactDeadlineSourceDigest: deadlines.sourceDigest,
                exactDeadlineBindingDigest,
                exactDeadlines: deadlines.rows,
                causalGradeSourceDigest,
                causalGradeBindingDigest,
                causalGrades,
                proofTargets,
            }),
            readyProofTargetsArtifactDigest,
            readyProofTargetsSourceArtifactDigest,
        };
    }
    catch (error) {
        process.stderr.write(`taskmap-local-completion: ready frontier unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        return {
            frontier: null,
            readyProofTargetsArtifactDigest: null,
            readyProofTargetsSourceArtifactDigest: null,
        };
    }
}
async function currentOverlay(roots, dependencies, evaluatedAt = new Date().toISOString(), includeReadyFrontier = true) {
    const context = await currentLifecycleContext(roots, dependencies);
    const history = await readLifecycleHistory(roots);
    const overlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
        localOwnerScopeDigest: context.localOwnerScopeDigest,
        nodes: graphNodes(context.projection),
        lifecycleHistory: history,
    });
    const sealedClosedExecutionHistory = closedExecutionHistory(context.localOwnerScopeDigest, history);
    const closedTaskIds = overlay.leafDispositions
        .filter((row) => row.state === "closed_in_daobrew")
        .map((row) => row.leafNodeId)
        .sort();
    const completedElsewhereTaskIds = overlay.leafDispositions
        .filter((row) => row.state === "completed_elsewhere")
        .map((row) => row.leafNodeId)
        .sort();
    const conflictedTaskIds = overlay.leafDispositions
        .filter((row) => row.state === "authoritative_source_conflict")
        .map((row) => row.leafNodeId)
        .sort();
    const terminalTaskIds = [...new Set([
            ...closedTaskIds,
            ...completedElsewhereTaskIds,
            ...conflictedTaskIds,
        ])].sort();
    const activeProjectionTaskIds = new Set(context.projection.tasks.map((task) => task.id));
    const legacyProjectionConflicts = roots.legacyQuarantinedTaskIds
        .filter((taskId) => activeProjectionTaskIds.has(taskId));
    // A matching pre-owner terminal is neither current-owner completion nor an
    // unfinished task. Quarantine the whole executable frontier until explicit
    // migration instead of hiding it, resolving a dependency, or relighting it.
    const ready = includeReadyFrontier
        && legacyProjectionConflicts.length === 0
        ? await readyFrontier(roots, context, overlay, terminalTaskIds, evaluatedAt, dependencies)
        : {
            frontier: null,
            readyProofTargetsArtifactDigest: null,
            readyProofTargetsSourceArtifactDigest: null,
        };
    return {
        context,
        history,
        overlay,
        closedTaskIds,
        closedExecutionHistory: sealedClosedExecutionHistory,
        completedElsewhereTaskIds,
        terminalTaskIds,
        conflictedTaskIds,
        frontier: ready.frontier,
        readyProofTargetsArtifactDigest: ready.readyProofTargetsArtifactDigest,
        readyProofTargetsSourceArtifactDigest: ready.readyProofTargetsSourceArtifactDigest,
    };
}
function assertExactClosedExecutionBinding(closeRecord, inspection) {
    const session = closeRecord.binding.session;
    const artifact = closeRecord.binding.artifact;
    const report = closeRecord.binding.report;
    if (inspection.contractVersion
        !== "taskmap-agent-execution-inspection.v1"
        || inspection.progressState !== "report_ready"
        || inspection.sessionStatus !== "finished"
        || inspection.taskId !== closeRecord.identity.taskId
        || inspection.rootId !== closeRecord.identity.rootId
        || inspection.sessionId !== session.sessionId
        || inspection.packageId !== closeRecord.binding.package.packageId
        || inspection.packageDigest !== closeRecord.binding.package.packageDigest
        || inspection.workspaceBindingDigest !== session.workspaceBindingDigest
        || inspection.launchedAdapter !== session.launchedAdapter
        || inspection.startedAt !== session.startedAt
        || inspection.finishedAt !== session.finishedAt
        || inspection.artifactCount !== artifact.artifactCount
        || inspection.artifactReceiptDigest
            !== artifact.artifactReceiptDigest
        || inspection.reportReceiptDigest !== report.reportReceiptDigest
        || inspection.reportRelativePaths.length !== report.relativePaths.length
        || inspection.reportRelativePaths.some((relativePath, index) => relativePath !== report.relativePaths[index])
        || inspection.sourceWritebackAttempted !== false
        || inspection.sourceCompletion !== false
        || inspection.outcomeVerified !== false) {
        fail();
    }
}
function response(input) {
    const result = {
        contractVersion: exports.TASKMAP_LOCAL_COMPLETION_CLI_RESPONSE_VERSION,
        ...input,
        closedExecutionBindingDigest: input.closedExecutionBindingDigest ?? null,
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
    };
    assertTaskMapLocalCompletionCliResponseEnvelope(result);
    return result;
}
function assertTaskMapLocalCompletionCliResponseEnvelope(value) {
    const readyTargetTaskIds = value.readyProofTargets.map((target) => target.taskId);
    const terminalDispositionTaskIds = [
        ...value.closedTaskIds,
        ...value.completedElsewhereTaskIds,
        ...value.conflictedTaskIds,
    ].sort();
    const historicalEntry = value.taskId === null
        ? undefined
        : value.closedExecutionHistory.find((entry) => entry.taskId === value.taskId);
    const sealedClosedBinding = historicalEntry !== undefined
        && value.rootId === historicalEntry.rootId
        && value.sessionId === historicalEntry.sessionId
        && value.closeDecisionId === historicalEntry.closeDecisionId;
    if (!exactClosedExecutionHistory(value.closedExecutionHistory)
        || !exactUniqueTaskIds(value.readyTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS)
        || value.readyTaskIds.length !== readyTargetTaskIds.length
        || value.readyTaskIds.some((taskId, index) => taskId !== readyTargetTaskIds[index])
        || Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(value.readyProofTargets), "utf8") > ready_frontier_js_1.TASKMAP_READY_FRONTIER_LIMITS_V1.maxProofTargetsArtifactBytes
        || !exactSortedUniqueTaskIds(value.terminalTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS)
        || !exactSortedUniqueTaskIds(value.closedTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS)
        || !exactSortedUniqueTaskIds(value.completedElsewhereTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS)
        || !exactSortedUniqueTaskIds(value.conflictedTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_TERMINAL_TASKS)
        || terminalDispositionTaskIds.length !== value.terminalTaskIds.length
        || terminalDispositionTaskIds.some((taskId, index) => taskId !== value.terminalTaskIds[index])
        // A refreshed projection may give the same source-owned work a new leaf
        // ID, while the immutable close record correctly retains its original
        // task ID. The overlay derives those aliases from the sealed lifecycle
        // records. Cardinality is therefore the strongest envelope-only check:
        // every active closed leaf must have its own sealed close record.
        || value.closedTaskIds.length > value.closedExecutionHistory.length
        || (value.closedExecutionBindingDigest !== null
            && (value.status !== "closed_in_daobrew"
                || !SHA256.test(value.closedExecutionBindingDigest)))
        || (value.status === "closed_in_daobrew"
            && !sealedClosedBinding)
        || Buffer.byteLength(`${(0, source_contracts_js_1.taskMapContractCanonicalJson)(value)}\n`, "utf8") > exports.TASKMAP_LOCAL_COMPLETION_CLI_MAX_OUTPUT_BYTES) {
        fail();
    }
}
function frontierResponse(value) {
    const projection = value.context.projection;
    const projectionDigest = value.context.currentness.projectionDigest;
    const currentnessBindingDigest = (0, ready_frontier_js_1.taskMapReadyFrontierCurrentnessBindingDigest)(value.context.currentness);
    const readyLeaves = value.frontier?.readyLeaves ?? [];
    const readyTaskIds = readyLeaves.map((row) => row.taskId);
    const readyProofTargets = readyLeaves.map((row) => structuredClone(row.proofTarget));
    const proofTargetTaskIds = readyProofTargets.map((row) => row.taskId);
    if (!exactUniqueTaskIds(readyTaskIds, exports.TASKMAP_LOCAL_COMPLETION_MAX_READY_TARGETS)
        || readyTaskIds.length !== proofTargetTaskIds.length
        || readyTaskIds.some((taskId, index) => taskId !== proofTargetTaskIds[index])) {
        fail();
    }
    if (value.frontier !== null
        && (value.frontier.projection.contractVersion
            !== projection.contractVersion
            || value.frontier.projection.runId !== projection.runId
            || value.frontier.projection.inputDigest !== projection.inputDigest
            || value.frontier.projection.generatedAt !== projection.generatedAt
            || value.frontier.projection.projectionDigest !== projectionDigest
            || value.frontier.currentness.projectionDigest !== projectionDigest
            || value.frontier.currentness.taskDispositionsDigest
                !== currentnessBindingDigest
            || value.frontier.terminalOverlay.artifactDigest
                !== value.overlay.artifactDigest
            || value.frontier.terminalOverlay.terminalTaskIds.length
                !== value.terminalTaskIds.length
            || value.frontier.terminalOverlay.terminalTaskIds.some((taskId, index) => taskId !== value.terminalTaskIds[index])
            || value.readyProofTargetsSourceArtifactDigest === null
            || (value.readyProofTargetsArtifactDigest !== null
                && value.readyProofTargetsArtifactDigest
                    !== value.readyProofTargetsSourceArtifactDigest))) {
        fail();
    }
    const terminalOverlayArtifactDigest = value.overlay.artifactDigest;
    const terminalOverlayBindingDigest = taskMapLocalCompletionTerminalOverlayBindingDigest({
        projectionDigest,
        terminalOverlayArtifactDigest,
        terminalTaskIds: value.terminalTaskIds,
    });
    const readyProofTargetsBindingDigest = value.frontier === null
        || value.readyProofTargetsSourceArtifactDigest === null
        ? null
        : taskMapLocalCompletionReadyProofTargetsBindingDigest({
            projectionContractVersion: projection.contractVersion,
            runId: projection.runId,
            inputDigest: projection.inputDigest,
            generatedAt: projection.generatedAt,
            projectionDigest,
            currentnessBindingDigest,
            proofTargetSourceArtifactDigest: value.readyProofTargetsSourceArtifactDigest,
            readyProofTargets,
        });
    return {
        projectionContractVersion: projection.contractVersion,
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        generatedAt: projection.generatedAt,
        projectionDigest,
        currentnessBindingDigest,
        terminalOverlayArtifactDigest,
        terminalOverlayBindingDigest,
        readyTaskIds,
        readyProofTargets,
        readyProofTargetsArtifactDigest: value.readyProofTargetsArtifactDigest,
        readyProofTargetsSourceArtifactDigest: value.readyProofTargetsSourceArtifactDigest,
        readyProofTargetsBindingDigest,
        readyFrontierDigest: value.frontier?.artifactDigest ?? null,
    };
}
async function runTaskMapLocalCompletionCli(argv, dependencies = {}) {
    const internalDependencies = dependencies;
    const parsed = parseTaskMapLocalCompletionCliArguments(argv, dependencies);
    if ("taskId" in parsed
        && parsed.roots.legacyQuarantinedTaskIds.includes(parsed.taskId)) {
        throw new legacy_local_state_quarantine_js_1.TaskMapLegacyLocalStateQuarantineError();
    }
    const evaluatedAt = "decidedAt" in parsed
        ? parsed.decidedAt
        : new Date().toISOString();
    const current = await currentOverlay(parsed.roots, dependencies, evaluatedAt, parsed.command !== "inspect-closed-execution");
    if (parsed.command === "overlay"
        || parsed.command === "inspect-overlay") {
        if (parsed.command === "overlay") {
            await writeDerivedOverlay(parsed.roots, current.overlay);
            if (current.frontier !== null) {
                await writeDerivedReadyFrontier(parsed.roots, current.frontier);
            }
        }
        return response({
            status: "overlay",
            taskId: null,
            rootId: null,
            sessionId: null,
            canClose: false,
            canKeepOpen: false,
            closedTaskIds: current.closedTaskIds,
            closedExecutionHistory: current.closedExecutionHistory,
            completedElsewhereTaskIds: current.completedElsewhereTaskIds,
            terminalTaskIds: current.terminalTaskIds,
            conflictedTaskIds: current.conflictedTaskIds,
            closeDecisionId: null,
            completionDecisionId: null,
            reopenDecisionId: null,
            ...frontierResponse(current),
        });
    }
    if (parsed.command === "inspect-closed-execution") {
        const sealedHistory = current.closedExecutionHistory.find((entry) => entry.taskId === parsed.taskId);
        const closeRecord = sealedHistory === undefined
            ? undefined
            : current.history.find((decision) => (decision.decision === "close"
                && decision.closeDecisionId === sealedHistory.closeDecisionId));
        if (sealedHistory === undefined
            || closeRecord === undefined
            || closeRecord.localOwnerScopeDigest
                !== current.context.localOwnerScopeDigest
            || closeRecord.identity.taskId !== sealedHistory.taskId
            || closeRecord.identity.rootId !== sealedHistory.rootId
            || closeRecord.binding.session.sessionId !== sealedHistory.sessionId
            || closeRecord.closeDecisionDigest
                !== sealedHistory.closeDecisionDigest
            || closeRecord.closedAt !== sealedHistory.closedAt
            || closeRecord.binding.projection.projectionDigest
                !== sealedHistory.projectionDigest) {
            fail();
        }
        // readLifecycleHistory already verifies the immutable decision seal. Keep
        // the assertion at this trust boundary so injected dependencies cannot
        // turn historical inspection into an unvalidated receipt lookup.
        (0, local_completion_overlay_js_1.assertTaskMapLocalLifecycleDecision)(closeRecord);
        const inspectExecution = dependencies.inspectExecution
            ?? agent_execution_receipts_js_1.inspectTaskMapAgentExecution;
        const executionInspection = await inspectExecution(parsed.roots.agentExecutionRoot, closeRecord.binding.session.sessionId);
        assertExactClosedExecutionBinding(closeRecord, executionInspection);
        const closedExecutionBindingDigest = taskMapLocalCompletionClosedExecutionBindingDigest({
            closeDecisionId: closeRecord.closeDecisionId,
            taskId: closeRecord.identity.taskId,
            rootId: closeRecord.identity.rootId,
            sessionId: closeRecord.binding.session.sessionId,
            packageId: closeRecord.binding.package.packageId,
            packageDigest: closeRecord.binding.package.packageDigest,
            workspaceBindingDigest: closeRecord.binding.session.workspaceBindingDigest,
            launchedAdapter: closeRecord.binding.session.launchedAdapter,
            startedAt: closeRecord.binding.session.startedAt,
            finishedAt: closeRecord.binding.session.finishedAt,
            artifactCount: closeRecord.binding.artifact.artifactCount,
            artifactReceiptDigest: closeRecord.binding.artifact.artifactReceiptDigest,
            reportReceiptDigest: closeRecord.binding.report.reportReceiptDigest,
            reportRelativePaths: closeRecord.binding.report.relativePaths,
        });
        return response({
            status: "closed_in_daobrew",
            taskId: closeRecord.identity.taskId,
            rootId: closeRecord.identity.rootId,
            sessionId: closeRecord.binding.session.sessionId,
            canClose: false,
            canKeepOpen: false,
            closedTaskIds: current.closedTaskIds,
            closedExecutionHistory: current.closedExecutionHistory,
            completedElsewhereTaskIds: current.completedElsewhereTaskIds,
            terminalTaskIds: current.terminalTaskIds,
            conflictedTaskIds: current.conflictedTaskIds,
            closeDecisionId: closeRecord.closeDecisionId,
            closedExecutionBindingDigest,
            completionDecisionId: null,
            reopenDecisionId: null,
            ...frontierResponse(current),
        });
    }
    if (!internalDependencies[LOCAL_LIFECYCLE_TRANSACTION_HELD]) {
        return (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
            overlayPath: node_path_1.default.join(parsed.roots.localExecutionRoot, "local-approval-package.json"),
            expectedOwnerScopeDigest: current.context.localOwnerScopeDigest,
        }, async () => runTaskMapLocalCompletionCli(argv, {
            ...dependencies,
            [LOCAL_LIFECYCLE_TRANSACTION_HELD]: true,
        }));
    }
    const task = current.context.projection.tasks.find((candidate) => candidate.id === parsed.taskId);
    const identity = task === undefined
        ? null
        : identityForTask(current.context.projection, task);
    if (parsed.command === "reopen") {
        const sealedHistory = current.closedExecutionHistory.find((entry) => entry.taskId === parsed.taskId);
        const disposition = identity === null
            ? undefined
            : current.overlay.leafDispositions.find((row) => row.leafNodeId === identity.taskId);
        const terminalId = sealedHistory?.closeDecisionId
            ?? disposition?.matchedCloseDecisionId;
        const terminal = terminalId === null || terminalId === undefined
            ? undefined
            : current.history
                .filter((row) => row.decision === "close"
                || row.decision === "complete_elsewhere")
                .find((row) => row.decision === "close"
                ? row.closeDecisionId === terminalId
                : row.externalCompletionDecisionId === terminalId);
        if (terminal === undefined
            || (sealedHistory === undefined
                && disposition?.state !== "closed_in_daobrew"
                && disposition?.state !== "completed_elsewhere"
                && disposition?.state !== "authoritative_source_conflict")
            || (sealedHistory !== undefined
                && (terminal.decision !== "close"
                    || terminal.identity.taskId !== sealedHistory.taskId
                    || terminal.identity.rootId !== sealedHistory.rootId
                    || terminal.binding.session.sessionId !== sealedHistory.sessionId
                    || terminal.closeDecisionDigest
                        !== sealedHistory.closeDecisionDigest
                    || terminal.closedAt !== sealedHistory.closedAt
                    || terminal.binding.projection.projectionDigest
                        !== sealedHistory.projectionDigest))) {
            fail();
        }
        const reopenRecord = terminal.decision === "close"
            ? (0, local_completion_overlay_js_1.buildTaskMapExplicitReopen)({
                closeRecord: terminal,
                explicitOwnerAction: true,
                reopenedAt: parsed.decidedAt,
            })
            : (0, local_completion_overlay_js_1.buildTaskMapExplicitExternalReopen)({
                completionRecord: terminal,
                explicitOwnerAction: true,
                reopenedAt: parsed.decidedAt,
            });
        await writeImmutableDecision(parsed.roots, reopenRecord);
        const after = await currentOverlay(parsed.roots, dependencies, evaluatedAt);
        await writeDerivedOverlay(parsed.roots, after.overlay);
        if (after.frontier !== null) {
            await writeDerivedReadyFrontier(parsed.roots, after.frontier);
        }
        return response({
            status: "reopened",
            taskId: parsed.taskId,
            rootId: task?.rootId ?? terminal.identity.rootId,
            sessionId: null,
            canClose: false,
            canKeepOpen: false,
            closedTaskIds: after.closedTaskIds,
            closedExecutionHistory: after.closedExecutionHistory,
            completedElsewhereTaskIds: after.completedElsewhereTaskIds,
            terminalTaskIds: after.terminalTaskIds,
            conflictedTaskIds: after.conflictedTaskIds,
            closeDecisionId: null,
            completionDecisionId: null,
            reopenDecisionId: "reopenDecisionId" in reopenRecord
                ? reopenRecord.reopenDecisionId
                : reopenRecord.externalReopenDecisionId,
            ...frontierResponse(after),
        });
    }
    if (identity === null)
        fail();
    if (parsed.command === "close"
        || parsed.command === "keep-open"
        || parsed.command === "complete-elsewhere") {
        (0, local_completion_overlay_js_1.assertTaskMapLocalLifecycleMutationAllowed)({
            localOwnerScopeDigest: current.context.localOwnerScopeDigest,
            lifecycleHistory: current.history,
            identity,
        });
    }
    if (parsed.command === "complete-elsewhere") {
        const disposition = current.context.currentness.taskDispositions.find((row) => row.taskId === identity.taskId)?.disposition;
        if (task?.reviewState !== "accepted"
            || task.openState !== "open"
            || disposition !== "current"
            || current.terminalTaskIds.includes(identity.taskId)) {
            fail();
        }
        const completionRecord = (0, local_completion_overlay_js_1.buildTaskMapExternalCompletion)({
            explicitOwnerAction: true,
            localOwnerScopeDigest: current.context.localOwnerScopeDigest,
            identity,
            projection: {
                projectionContractVersion: current.context.projection.contractVersion,
                runId: current.context.projection.runId,
                inputDigest: current.context.projection.inputDigest,
                generatedAt: current.context.projection.generatedAt,
                projectionDigest: current.context.currentness.projectionDigest,
            },
            completedAt: parsed.decidedAt,
        });
        await writeImmutableDecision(parsed.roots, completionRecord);
        const after = await currentOverlay(parsed.roots, dependencies, evaluatedAt);
        await writeDerivedOverlay(parsed.roots, after.overlay);
        if (after.frontier !== null) {
            await writeDerivedReadyFrontier(parsed.roots, after.frontier);
        }
        return response({
            status: "completed_elsewhere",
            taskId: identity.taskId,
            rootId: identity.rootId,
            sessionId: null,
            canClose: false,
            canKeepOpen: false,
            closedTaskIds: after.closedTaskIds,
            closedExecutionHistory: after.closedExecutionHistory,
            completedElsewhereTaskIds: after.completedElsewhereTaskIds,
            terminalTaskIds: after.terminalTaskIds,
            conflictedTaskIds: after.conflictedTaskIds,
            closeDecisionId: null,
            completionDecisionId: completionRecord.externalCompletionDecisionId,
            reopenDecisionId: null,
            ...frontierResponse(after),
        });
    }
    if (!("sessionId" in parsed))
        fail();
    const approvalContext = await currentApprovalContext(parsed.roots, dependencies, identity.taskId);
    if (approvalContext.projection.runId !== current.context.projection.runId
        || approvalContext.projection.inputDigest
            !== current.context.projection.inputDigest
        || approvalContext.currentness.projectionDigest
            !== current.context.currentness.projectionDigest
        || approvalContext.inspection.localOwnerScopeDigest
            !== current.context.localOwnerScopeDigest
        || approvalContext.inspection.quartet.projectionFileDigest
            !== current.context.projectionFileDigest
        || approvalContext.inspection.quartet.currentnessFileDigest
            !== current.context.currentnessFileDigest) {
        fail();
    }
    const approvedPackagePath = approvalContext.response.artifactAccess?.packagePath;
    if (approvedPackagePath === undefined)
        fail();
    const approvedPackage = await readPrivateJson(approvedPackagePath);
    const inspectExecution = dependencies.inspectExecution
        ?? agent_execution_receipts_js_1.inspectTaskMapAgentExecution;
    const executionInspection = await inspectExecution(parsed.roots.agentExecutionRoot, parsed.sessionId);
    const candidate = {
        identity,
        evidenceKind: "authoritative_source",
    };
    const review = (0, local_completion_overlay_js_1.readTaskMapLocalCompletionReviewState)({
        localOwnerScopeDigest: current.context.localOwnerScopeDigest,
        lifecycleHistory: current.history,
        candidate,
        approvedPackage,
        executionInspection,
        observedAt: parsed.decidedAt,
    });
    if (parsed.command === "review") {
        return response({
            status: review.reviewState,
            taskId: review.taskId,
            rootId: review.rootId,
            sessionId: parsed.sessionId,
            canClose: review.canClose,
            canKeepOpen: review.canKeepOpen,
            closedTaskIds: current.closedTaskIds,
            closedExecutionHistory: current.closedExecutionHistory,
            completedElsewhereTaskIds: current.completedElsewhereTaskIds,
            terminalTaskIds: current.terminalTaskIds,
            conflictedTaskIds: current.conflictedTaskIds,
            closeDecisionId: review.matchedCloseDecisionId,
            completionDecisionId: null,
            reopenDecisionId: null,
            ...frontierResponse(current),
        });
    }
    const decision = (0, local_completion_overlay_js_1.decideTaskMapLocalCompletion)({
        decision: parsed.command === "close" ? "close" : "keep_open",
        explicitOwnerAction: true,
        localOwnerScopeDigest: current.context.localOwnerScopeDigest,
        identity,
        approvedPackage,
        reportReady: executionInspection,
        decidedAt: parsed.decidedAt,
    });
    if (decision.decision === "keep_open") {
        return response({
            status: "kept_open",
            taskId: identity.taskId,
            rootId: identity.rootId,
            sessionId: parsed.sessionId,
            canClose: true,
            canKeepOpen: true,
            closedTaskIds: current.closedTaskIds,
            closedExecutionHistory: current.closedExecutionHistory,
            completedElsewhereTaskIds: current.completedElsewhereTaskIds,
            terminalTaskIds: current.terminalTaskIds,
            conflictedTaskIds: current.conflictedTaskIds,
            closeDecisionId: null,
            completionDecisionId: null,
            reopenDecisionId: null,
            ...frontierResponse(current),
        });
    }
    await writeImmutableDecision(parsed.roots, decision.closeRecord);
    const after = await currentOverlay(parsed.roots, dependencies, evaluatedAt);
    await writeDerivedOverlay(parsed.roots, after.overlay);
    if (after.frontier !== null) {
        await writeDerivedReadyFrontier(parsed.roots, after.frontier);
    }
    return response({
        status: "closed_in_daobrew",
        taskId: identity.taskId,
        rootId: identity.rootId,
        sessionId: parsed.sessionId,
        canClose: false,
        canKeepOpen: false,
        closedTaskIds: after.closedTaskIds,
        closedExecutionHistory: after.closedExecutionHistory,
        completedElsewhereTaskIds: after.completedElsewhereTaskIds,
        terminalTaskIds: after.terminalTaskIds,
        conflictedTaskIds: after.conflictedTaskIds,
        closeDecisionId: decision.closeRecord.closeDecisionId,
        completionDecisionId: null,
        reopenDecisionId: null,
        ...frontierResponse(after),
    });
}
function taskMapLocalCompletionCliOutput(value) {
    assertTaskMapLocalCompletionCliResponseEnvelope(value);
    const output = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(value)}\n`;
    return output;
}
async function main() {
    try {
        const result = await runTaskMapLocalCompletionCli(process.argv.slice(2));
        process.stdout.write(taskMapLocalCompletionCliOutput(result));
    }
    catch (error) {
        process.stderr.write(`taskmap-local-completion: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
