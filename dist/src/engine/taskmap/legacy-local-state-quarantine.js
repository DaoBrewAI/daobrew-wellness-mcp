"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMapLegacyLocalStateQuarantineError = exports.TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE = void 0;
exports.inspectTaskMapLegacyLocalState = inspectTaskMapLegacyLocalState;
exports.assertNoUnmigratedTaskMapLegacyLocalState = assertNoUnmigratedTaskMapLegacyLocalState;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const local_completion_overlay_js_1 = require("./local-completion-overlay.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE = "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED";
const MAX_DECISIONS = 256;
const MAX_DECISION_BYTES = 64 * 1024;
const MAX_OVERLAY_BYTES = 4 * 1024 * 1024;
const LOCAL_OWNER_DOMAIN = "taskmap-local-os-owner.1";
class TaskMapLegacyLocalStateQuarantineError extends Error {
    code = exports.TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE;
    constructor() {
        super("Task Map local lifecycle state is unavailable pending migration");
        this.name = "TaskMapLegacyLocalStateQuarantineError";
    }
}
exports.TaskMapLegacyLocalStateQuarantineError = TaskMapLegacyLocalStateQuarantineError;
function quarantine() {
    throw new TaskMapLegacyLocalStateQuarantineError();
}
function errnoCode(error) {
    return error.code;
}
function statOrNull(valuePath) {
    try {
        return (0, node_fs_1.lstatSync)(valuePath);
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        return quarantine();
    }
}
function expectedUid(stat) {
    return typeof process.getuid === "function" ? process.getuid() : stat.uid;
}
function assertPrivateDirectory(directory) {
    const stat = statOrNull(directory);
    if (stat === null
        || !stat.isDirectory()
        || stat.isSymbolicLink()
        || stat.uid !== expectedUid(stat)
        || (stat.mode & 0o777) !== 0o700) {
        quarantine();
    }
    try {
        if ((0, node_fs_1.realpathSync)(directory) !== directory)
            quarantine();
    }
    catch {
        quarantine();
    }
}
function readPrivateCanonicalFile(filePath, maximumBytes) {
    if (statOrNull(filePath) === null)
        return null;
    let descriptor = null;
    try {
        descriptor = (0, node_fs_1.openSync)(filePath, node_fs_1.constants.O_RDONLY | (node_fs_1.constants.O_NOFOLLOW ?? 0));
        const before = (0, node_fs_1.fstatSync)(descriptor);
        if (!before.isFile()
            || before.isSymbolicLink()
            || before.uid !== expectedUid(before)
            || before.nlink !== 1
            || (before.mode & 0o777) !== 0o600
            || before.size < 2
            || before.size > maximumBytes) {
            quarantine();
        }
        const bytes = (0, node_fs_1.readFileSync)(descriptor);
        const after = (0, node_fs_1.fstatSync)(descriptor);
        if (after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mtimeMs !== before.mtimeMs
            || bytes.length !== before.size) {
            quarantine();
        }
        return bytes;
    }
    catch (error) {
        if (error instanceof TaskMapLegacyLocalStateQuarantineError) {
            throw error;
        }
        return quarantine();
    }
    finally {
        if (descriptor !== null)
            (0, node_fs_1.closeSync)(descriptor);
    }
}
function parseJson(bytes) {
    try {
        return JSON.parse(bytes.toString("utf8"));
    }
    catch {
        quarantine();
    }
}
function decisionId(value) {
    switch (value.decision) {
        case "close": return value.closeDecisionId;
        case "reopen": return value.reopenDecisionId;
        case "complete_elsewhere":
            return value.externalCompletionDecisionId;
        case "reopen_external_completion":
            return value.externalReopenDecisionId;
    }
}
function readLegacyDecisions(decisionsRoot) {
    if (statOrNull(decisionsRoot) === null)
        return null;
    assertPrivateDirectory(decisionsRoot);
    let names;
    try {
        names = (0, node_fs_1.readdirSync)(decisionsRoot).sort();
    }
    catch {
        quarantine();
    }
    if (names.length === 0)
        return [];
    if (names.length > MAX_DECISIONS)
        quarantine();
    return names.map((name) => {
        if (!/^[A-Za-z0-9._-]{1,256}\.json$/.test(name))
            quarantine();
        const filePath = node_path_1.default.join(decisionsRoot, name);
        const bytes = readPrivateCanonicalFile(filePath, MAX_DECISION_BYTES);
        if (bytes === null)
            quarantine();
        const value = parseJson(bytes);
        let canonical;
        try {
            canonical = (0, local_completion_overlay_js_1.taskMapLocalLifecycleDecisionCanonicalBytes)(value);
        }
        catch {
            quarantine();
        }
        if (!bytes.equals(canonical))
            quarantine();
        const decision = value;
        if (name !== `${decisionId(decision)}.json`)
            quarantine();
        return decision;
    });
}
/**
 * Read and validate pre-owner lifecycle state as a separate quarantine lane.
 * The returned task IDs may be suppressed as unresolved legacy terminals, but
 * the old decisions are never attributed to the current owner or rewritten.
 */
function inspectTaskMapLegacyLocalState(input) {
    if (!node_path_1.default.isAbsolute(input.homeDirectory)
        || node_path_1.default.normalize(input.homeDirectory) !== input.homeDirectory
        || !node_path_1.default.isAbsolute(input.ownerRoot)
        || node_path_1.default.normalize(input.ownerRoot) !== input.ownerRoot) {
        quarantine();
    }
    const legacyExecutionRoot = node_path_1.default.join(input.homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap-local-execution");
    if (statOrNull(legacyExecutionRoot) === null)
        return null;
    assertPrivateDirectory(legacyExecutionRoot);
    const decisions = readLegacyDecisions(node_path_1.default.join(legacyExecutionRoot, "completion-decisions"));
    let overlay = null;
    const overlayBytes = decisions !== null && decisions.length > 0
        ? null
        : readPrivateCanonicalFile(node_path_1.default.join(legacyExecutionRoot, "completion-overlay.v1.json"), MAX_OVERLAY_BYTES);
    if (overlayBytes !== null) {
        const value = parseJson(overlayBytes);
        let canonical;
        try {
            canonical = (0, local_completion_overlay_js_1.taskMapLocalCompletionOverlayCanonicalBytes)(value);
        }
        catch {
            quarantine();
        }
        if (!overlayBytes.equals(canonical))
            quarantine();
        overlay = value;
    }
    const history = decisions !== null && decisions.length > 0
        ? decisions
        : overlay?.completionHistory ?? [];
    if (history.length === 0) {
        // An empty private directory is not lifecycle state. Any unaccounted file
        // is rejected above instead of becoming an implicit migration signal.
        return null;
    }
    // Immutable decision files are authority. A stale derived overlay is not
    // read when those files exist; crash residue must not globally block
    // unrelated current-owner work.
    let summary;
    try {
        summary = (0, local_completion_overlay_js_1.summarizeTaskMapLocalLifecycleHistory)(history);
    }
    catch {
        quarantine();
    }
    if (overlay !== null
        && overlay.localOwnerScopeDigest !== summary.localOwnerScopeDigest) {
        quarantine();
    }
    const legacyOwnerScopeDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: LOCAL_OWNER_DOMAIN,
        uid: expectedUid((0, node_fs_1.lstatSync)(legacyExecutionRoot)).toString(10),
        ownerRoot: node_path_1.default.dirname(legacyExecutionRoot),
    });
    if (summary.localOwnerScopeDigest !== legacyOwnerScopeDigest) {
        quarantine();
    }
    return Object.freeze({
        legacyOwnerScopeDigest,
        activeTerminalTaskIds: [...summary.activeTerminalTaskIds],
    });
}
/**
 * Compatibility entrypoint for both product CLIs. Valid legacy state is
 * quarantined per task instead of disabling every unrelated owner action.
 */
function assertNoUnmigratedTaskMapLegacyLocalState(input) {
    const quarantineState = inspectTaskMapLegacyLocalState(input);
    if (input.selectedTaskId !== undefined
        && quarantineState?.activeTerminalTaskIds.includes(input.selectedTaskId)) {
        quarantine();
    }
    return quarantineState;
}
