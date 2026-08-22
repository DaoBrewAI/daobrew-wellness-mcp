"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_FIXED_ARTIFACT_NAMES = exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1 = exports.TASKMAP_READY_FRONTIER_FILENAME = exports.TASKMAP_READY_PROOF_TARGETS_FILENAME = exports.TASKMAP_LOCAL_OPERATIONAL_CONTEXT_VERSION = exports.TASKMAP_LOCAL_APPROVAL_RESPONSE_VERSION = exports.TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION = exports.TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION = exports.TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION = exports.TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION = void 0;
exports.deriveTaskMapLocalOwnerScopeDigest = deriveTaskMapLocalOwnerScopeDigest;
exports.inspectTaskMapLocalApproval = inspectTaskMapLocalApproval;
exports.inspectTaskMapLocalLifecycleContext = inspectTaskMapLocalLifecycleContext;
exports.inspectTaskMapLocalApprovalOperationalContext = inspectTaskMapLocalApprovalOperationalContext;
exports.approveAndPrepareTaskMapLocalPackage = approveAndPrepareTaskMapLocalPackage;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const harness_js_1 = require("./harness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const types_js_1 = require("./types.js");
const native_refresh_service_js_1 = require("./native-refresh-service.js");
const native_current_work_successor_js_1 = require("./native-current-work-successor.js");
const ready_frontier_js_1 = require("./ready-frontier.js");
const local_completion_overlay_js_1 = require("./local-completion-overlay.js");
exports.TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION = "taskmap-local-approval-inspection.v1";
exports.TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION = "taskmap-local-approval-authorization.v1";
exports.TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION = "taskmap-local-execution-package.v1";
exports.TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION = "taskmap-local-preparation-receipt.v1";
exports.TASKMAP_LOCAL_APPROVAL_RESPONSE_VERSION = "taskmap-local-approval-response.v1";
exports.TASKMAP_LOCAL_OPERATIONAL_CONTEXT_VERSION = "taskmap-local-operational-context.v1";
exports.TASKMAP_READY_PROOF_TARGETS_FILENAME = "taskmap-ready-proof-targets.v1.json";
exports.TASKMAP_READY_FRONTIER_FILENAME = "ready-frontier.v1.json";
exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1 = Object.freeze({
    maxProjectionBytes: 4 * 1024 * 1024,
    maxCurrentnessBytes: 1024 * 1024,
    maxCurrentWorkBytes: 256 * 1024,
    maxBodyBytes: 1024 * 1024,
    maxBodyAssessmentBytes: 512 * 1024,
    maxReadyProofTargetsBytes: 64 * 1024,
    maxReadyFrontierBytes: 2 * 1024 * 1024,
    maxArtifactBytes: 256 * 1024,
    maxRouteNodes: 6,
    maxDoneItems: 12,
    maxContextPointers: 128,
    maxTextCharacters: 4096,
});
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const BODY_SIGNAL_SOURCE_LABELS = new Set(native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABELS);
const BODY_SIGNAL_REASON_CODES = new Set([
    "root_not_found",
    "input_or_brain_not_accepted",
    "root_not_accepted",
    "body_provider_read_unverified",
    "body_provider_read_stale",
    "body_provider_read_not_bound",
    "contradictory_body_classification",
    "no_exact_root_work_overlap",
    "no_eligible_work_evidence",
    "no_comparable_source_day_coverage",
    "no_covered_target_body_days",
    "no_target_work_overlap",
    "insufficient_target_backed_days",
    "enrichment_below_fixed_threshold",
    "insufficient_multi_source_backing",
    "insufficient_neutral_reference_days",
    "harness_causal_input_rejected",
]);
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const LOCAL_OWNER_DOMAIN = "taskmap-local-os-owner.1";
const IDEMPOTENCY_DOMAIN = "taskmap-local-approve-prepare-idempotency.1";
const AUTHORIZATION_DOMAIN = "taskmap-local-approval-authorization.1";
const PACKAGE_DOMAIN = "taskmap-local-execution-package.1";
const RECEIPT_DOMAIN = "taskmap-local-preparation-receipt.1";
const PROOF_DOMAIN = "taskmap-local-approval-proof.1";
const OPERATIONAL_CONTEXT_DOMAIN = "taskmap-local-operational-context.1";
const SELECTED_PROOF_TARGET_DOMAIN = "taskmap-local-selected-proof-target.1";
const READY_PROOF_TARGET_APPROVAL_BOUNDARY = Object.freeze({
    contractVersion: exports.TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION,
    readyForLocalApproval: true,
    currentWorkApprovalGranted: false,
    currentWorkExecutable: false,
    authorizationScope: "prepare_local_package_only",
    dispatchAuthorized: false,
    sourceWritebackAuthorized: false,
    codexTaskStartAuthorized: false,
    sourceCompletionAuthorized: false,
    outcomeVerificationAuthorized: false,
});
exports.TASKMAP_FIXED_ARTIFACT_NAMES = Object.freeze({
    projection: "taskmap-projection.v1.json",
    currentness: "taskmap-currentness.v1.json",
    currentWork: "taskmap-current-work.v1.json",
    body: "taskmap-body-context.v1.json",
    bodyAssessment: native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME,
});
function fail(message) {
    throw new Error(`Task Map local approval unavailable: ${message}`);
}
function errnoCode(error) {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && typeof error.code === "string"
        ? error.code
        : undefined;
}
function sha256Bytes(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        fail(`${label} must be a plain object`);
    }
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} fields are invalid`);
    }
}
function assertString(value, label, max = exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxTextCharacters) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > max
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
        fail(`${label} is invalid`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        fail(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertStrictTimestamp(value, label) {
    if (typeof value !== "string"
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value))) {
        fail(`${label} must be strict RFC3339`);
    }
}
function assertDateKey(value, label) {
    if (typeof value !== "string"
        || !DATE_KEY.test(value)
        || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
        fail(`${label} must be a real YYYY-MM-DD date`);
    }
}
function assertCanonicalApprovalTimestamp(value, label) {
    if (typeof value !== "string"
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value))
        || new Date(value).toISOString() !== value) {
        fail(`${label} must be canonical UTC RFC3339 with milliseconds`);
    }
}
function assertAbsolutePath(value, label) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > 4096
        || !node_path_1.default.isAbsolute(value)
        || node_path_1.default.normalize(value) !== value) {
        fail(`${label} must be a normalized absolute path`);
    }
}
function uid() {
    if (typeof process.getuid !== "function") {
        fail("local OS owner identity is unavailable");
    }
    return process.getuid();
}
async function assertPrivateDirectory(directoryPath, label, create) {
    assertAbsolutePath(directoryPath, label);
    if (create)
        await (0, promises_1.mkdir)(directoryPath, { recursive: true, mode: DIRECTORY_MODE });
    const resolved = await (0, promises_1.realpath)(directoryPath).catch(() => fail(`${label} is unavailable`));
    if (resolved !== directoryPath)
        fail(`${label} must not traverse a symlink`);
    const stats = await (0, promises_1.lstat)(resolved);
    if (!stats.isDirectory()
        || stats.uid !== uid()
        || (stats.mode & 0o777) !== DIRECTORY_MODE) {
        fail(`${label} must be an owner-only directory`);
    }
    return resolved;
}
async function deriveTaskMapLocalOwnerScopeDigest(ownerRoot) {
    const validated = await assertPrivateDirectory(ownerRoot, "owner root", false);
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: LOCAL_OWNER_DOMAIN,
        uid: uid().toString(10),
        ownerRoot: validated,
    });
}
async function readPrivateFile(filePath, maxBytes, label) {
    assertAbsolutePath(filePath, `${label} path`);
    const initial = await (0, promises_1.lstat)(filePath).catch(() => fail(`${label} is missing`));
    if (!initial.isFile()
        || initial.isSymbolicLink()
        || initial.uid !== uid()
        || (initial.mode & 0o777) !== FILE_MODE
        || initial.nlink !== 1
        || initial.size <= 0
        || initial.size > maxBytes) {
        fail(`${label} is not an owner-only bounded regular file`);
    }
    const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const before = await handle.stat();
        if (before.dev !== initial.dev
            || before.ino !== initial.ino
            || before.size !== initial.size) {
            fail(`${label} changed before read`);
        }
        const bytes = await handle.readFile();
        const after = await handle.stat();
        if (bytes.byteLength !== before.size
            || after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size) {
            fail(`${label} changed during read`);
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            fail(`${label} is not valid JSON`);
        }
        return { bytes, digest: sha256Bytes(bytes), parsed };
    }
    finally {
        await handle.close();
    }
}
function approvalLifecycleSourceObjectKeyDigest(pointerId) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-local-completion-source-object-key.1",
        pointerId,
    });
}
function approvalLifecycleIdentity(projection, task) {
    const pointerId = task.taskHomePointerId;
    if (pointerId === undefined) {
        fail("ready proof target has no stable source identity");
    }
    const source = projection.sources.find((row) => row.id === pointerId);
    if (source === undefined) {
        fail("ready proof target source identity is unavailable");
    }
    const sourceCitations = task.citations
        .filter((citation) => citation.pointerId === pointerId)
        .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
        || left.eventId.localeCompare(right.eventId));
    const sourceRevision = source.sourceVersion ?? sourceCitations[0]?.eventId ?? "observed";
    const aliasPointerIds = [...new Set([
            ...task.originPointerIds,
            ...task.citations.map((citation) => citation.pointerId),
        ])].filter((value) => value !== pointerId).sort();
    return (0, local_completion_overlay_js_1.buildTaskMapLocalCompletionIdentity)({
        taskId: task.id,
        rootId: task.rootId,
        workId: pointerId,
        canonicalSourceObjectKeyDigest: approvalLifecycleSourceObjectKeyDigest(pointerId),
        aliasSourceObjectKeyDigests: aliasPointerIds.map(approvalLifecycleSourceObjectKeyDigest),
        sourceIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: "taskmap-local-completion-source-identity.1",
            pointerId,
            sourceKind: source.sourceKind,
            sourceRevision,
        }),
        sourceRevision,
        sourceRevisionObservedAt: projection.generatedAt,
    });
}
async function readApprovalLifecycleHistory(ownerRoot) {
    const localExecutionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    const decisionsRoot = node_path_1.default.join(localExecutionRoot, "completion-decisions");
    try {
        await assertPrivateDirectory(localExecutionRoot, "local execution root", false);
        await assertPrivateDirectory(decisionsRoot, "completion decisions", false);
    }
    catch (error) {
        try {
            await (0, promises_1.lstat)(decisionsRoot);
        }
        catch (absenceError) {
            if (absenceError.code === "ENOENT") {
                return [];
            }
            throw absenceError;
        }
        throw error;
    }
    const entries = (await (0, promises_1.readdir)(decisionsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isFile()
        && !entry.isSymbolicLink()
        && entry.name.endsWith(".json"))
        .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length > 256)
        fail("completion history is unavailable");
    const history = [];
    for (const entry of entries) {
        const file = await readPrivateFile(node_path_1.default.join(decisionsRoot, entry.name), 64 * 1024, "completion decision");
        (0, local_completion_overlay_js_1.assertTaskMapLocalLifecycleDecision)(file.parsed);
        history.push(file.parsed);
    }
    return history;
}
function approvalLifecycleGraphNodes(projection) {
    const nodes = projection.roots.map((root) => ({
        nodeId: root.id,
        title: root.title,
        kind: "root",
        parentNodeId: null,
        candidate: null,
    }));
    for (const task of projection.tasks) {
        if (task.taskHomePointerId === undefined
            || !projection.sources.some((source) => source.id === task.taskHomePointerId)) {
            continue;
        }
        nodes.push({
            nodeId: task.id,
            title: task.title,
            kind: "leaf",
            parentNodeId: task.rootId,
            candidate: {
                identity: approvalLifecycleIdentity(projection, task),
                evidenceKind: "authoritative_source",
            },
        });
    }
    return nodes;
}
async function validateApprovalTerminalReadyFrontier(input) {
    const completionOverlay = (0, local_completion_overlay_js_1.applyTaskMapLocalCompletionOverlay)({
        localOwnerScopeDigest: input.localOwnerScopeDigest,
        nodes: approvalLifecycleGraphNodes(input.projection),
        lifecycleHistory: input.lifecycleHistory,
    });
    const terminalTaskIds = completionOverlay.leafDispositions
        .filter((row) => row.state !== "active")
        .map((row) => row.leafNodeId)
        .sort();
    const frontierFile = await readPrivateFile(node_path_1.default.join(input.ownerRoot, "taskmap-local-execution", exports.TASKMAP_READY_FRONTIER_FILENAME), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxReadyFrontierBytes, "ready frontier");
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(frontierFile.parsed)
        !== frontierFile.bytes.toString("utf8")) {
        fail("ready frontier must use canonical JSON bytes");
    }
    let frontier;
    try {
        frontier = (0, ready_frontier_js_1.validateTaskMapReadyFrontier)(frontierFile.parsed, {
            projection: input.projection,
            currentness: input.currentness,
            terminalOverlay: {
                contractVersion: completionOverlay.contractVersion,
                artifactDigest: completionOverlay.artifactDigest,
                localOwnerScopeDigest: completionOverlay.localOwnerScopeDigest,
                terminalTaskIds,
            },
            proofTargets: input.proofTargets,
        });
    }
    catch {
        fail("ready frontier is not bound to the current terminal overlay");
    }
    const selectedReadyLeaf = frontier.readyLeaves.find((leaf) => leaf.taskId === input.selectedProofTarget.taskId);
    if (selectedReadyLeaf === undefined
        || !sameCanonical(selectedReadyLeaf.proofTarget, input.selectedProofTarget)) {
        fail("requested proof target is not ready in the sealed frontier");
    }
    return {
        frontier,
        terminalTaskIds: new Set(terminalTaskIds),
    };
}
function assertStringArray(value, label, maxLength) {
    if (!Array.isArray(value) || value.length > maxLength) {
        fail(`${label} is invalid`);
    }
    for (const item of value)
        assertString(item, `${label} item`, 512);
    if (new Set(value).size !== value.length)
        fail(`${label} must be unique`);
}
function parseCurrentness(value) {
    assertPlainObject(value, "currentness");
    assertExactKeys(value, ["contractVersion", "runId", "inputDigest", "projectionDigest", "taskDispositions"], "currentness");
    if (value.contractVersion !== "taskmap-native-currentness-gate.v1") {
        fail("currentness version is unsupported");
    }
    assertString(value.runId, "currentness runId", 256);
    assertDigest(value.inputDigest, "currentness inputDigest");
    assertDigest(value.projectionDigest, "currentness projectionDigest");
    if (!Array.isArray(value.taskDispositions) || value.taskDispositions.length > 4096) {
        fail("currentness taskDispositions are invalid");
    }
    const seen = new Set();
    for (const [index, raw] of value.taskDispositions.entries()) {
        assertPlainObject(raw, `currentness disposition ${index}`);
        assertExactKeys(raw, ["taskId", "disposition"], `currentness disposition ${index}`);
        assertString(raw.taskId, `currentness disposition ${index} taskId`, 256);
        if (raw.disposition !== "current"
            && raw.disposition !== "needs_lifecycle_review") {
            fail("currentness disposition is invalid");
        }
        if (seen.has(raw.taskId))
            fail("currentness taskId is duplicated");
        seen.add(raw.taskId);
    }
    return value;
}
function parseCurrentWork(value, rawBytes) {
    assertPlainObject(value, "current work");
    assertExactKeys(value, [
        "contractVersion",
        "projection",
        "currentGoal",
        ...(Object.prototype.hasOwnProperty.call(value, "agentSessionTaskProofs") ? ["agentSessionTaskProofs"] : []),
        "nextTaskToProve",
        "privacy",
        "artifactDigest",
    ], "current work");
    if (value.contractVersion !== "taskmap-current-work.v1") {
        fail("current-work version is unsupported");
    }
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== rawBytes.toString("utf8")) {
        fail("current work must use canonical JSON bytes");
    }
    assertDigest(value.artifactDigest, "current-work artifactDigest");
    const core = { ...value };
    delete core.artifactDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)(core) !== value.artifactDigest) {
        fail("current-work artifact digest is invalid");
    }
    assertPlainObject(value.projection, "current-work projection");
    assertExactKeys(value.projection, ["contractVersion", "runId", "inputDigest", "generatedAt", "projectionDigest"], "current-work projection");
    assertString(value.projection.contractVersion, "current-work projection version", 128);
    assertString(value.projection.runId, "current-work projection runId", 256);
    assertDigest(value.projection.inputDigest, "current-work projection inputDigest");
    assertStrictTimestamp(value.projection.generatedAt, "current-work projection generatedAt");
    assertDigest(value.projection.projectionDigest, "current-work projectionDigest");
    assertPlainObject(value.currentGoal, "current goal");
    assertExactKeys(value.currentGoal, ["rootId", "title", "accepted"], "current goal");
    assertString(value.currentGoal.rootId, "current goal rootId", 256);
    assertString(value.currentGoal.title, "current goal title");
    if (value.currentGoal.accepted !== true)
        fail("current goal is not accepted");
    if (Object.prototype.hasOwnProperty.call(value, "agentSessionTaskProofs")) {
        if (!Array.isArray(value.agentSessionTaskProofs)
            || value.agentSessionTaskProofs.length > 128)
            fail("current-work task proofs are invalid");
        const rows = value.agentSessionTaskProofs.map((row) => {
            try {
                return (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)(row);
            }
            catch {
                fail("current-work task proof is invalid");
            }
        });
        const taskIds = rows.map((row) => row.taskId);
        if (new Set(taskIds).size !== taskIds.length
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(taskIds)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)([...taskIds].sort()))
            fail("current-work task proofs are not canonical");
    }
    assertPlainObject(value.nextTaskToProve, "next task");
    assertExactKeys(value.nextTaskToProve, [
        "taskId",
        "rootId",
        "outcome",
        "input",
        "predecessors",
        "doneDefinition",
        "permission",
        "returnTarget",
        "executable",
    ], "next task");
    assertString(value.nextTaskToProve.taskId, "next task taskId", 256);
    assertString(value.nextTaskToProve.rootId, "next task rootId", 256);
    assertString(value.nextTaskToProve.outcome, "next task outcome");
    assertPlainObject(value.nextTaskToProve.input, "next task input");
    assertExactKeys(value.nextTaskToProve.input, [
        "summary",
        "contextPointerIds",
        ...(Object.prototype.hasOwnProperty.call(value.nextTaskToProve.input, "agentSessionEpisode")
            ? ["agentSessionEpisode"]
            : []),
    ], "next task input");
    assertString(value.nextTaskToProve.input.summary, "next task input summary");
    assertStringArray(value.nextTaskToProve.input.contextPointerIds, "next task contextPointerIds", exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxContextPointers);
    if (Object.prototype.hasOwnProperty.call(value.nextTaskToProve.input, "agentSessionEpisode")) {
        try {
            (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionEpisodeAdmission)(value.nextTaskToProve.input.agentSessionEpisode);
        }
        catch {
            fail("current-work agent-session episode is invalid");
        }
    }
    assertStringArray(value.nextTaskToProve.doneDefinition, "next task doneDefinition", exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxDoneItems);
    if (value.nextTaskToProve.doneDefinition.length === 0) {
        fail("next task doneDefinition is empty");
    }
    if (!Array.isArray(value.nextTaskToProve.predecessors) || value.nextTaskToProve.predecessors.length > 256) {
        fail("next task predecessors are invalid");
    }
    for (const [index, predecessor] of value.nextTaskToProve.predecessors.entries()) {
        assertPlainObject(predecessor, `predecessor ${index}`);
        assertExactKeys(predecessor, ["taskId", "relation", "reviewState", "openState"], `predecessor ${index}`);
        assertString(predecessor.taskId, `predecessor ${index} taskId`, 256);
        if (predecessor.relation !== "depends_on" && predecessor.relation !== "blocks") {
            fail("predecessor relation is invalid");
        }
        assertString(predecessor.reviewState, `predecessor ${index} reviewState`, 64);
        assertString(predecessor.openState, `predecessor ${index} openState`, 64);
    }
    assertPlainObject(value.nextTaskToProve.permission, "next task permission");
    assertExactKeys(value.nextTaskToProve.permission, ["requiresExplicitApproval", "approvalGranted"], "next task permission");
    if (value.nextTaskToProve.permission.requiresExplicitApproval !== true
        || value.nextTaskToProve.permission.approvalGranted !== false
        || value.nextTaskToProve.executable !== false) {
        fail("current work must remain pre-approval and non-executable");
    }
    assertPlainObject(value.nextTaskToProve.returnTarget, "next task returnTarget");
    const target = value.nextTaskToProve.returnTarget;
    if (target.state === "user_destination_required") {
        assertExactKeys(target, ["state"], "next task returnTarget");
    }
    else if (target.state === "source_owned"
        || target.state === "source_return"
        || target.state === "personal_fork") {
        assertExactKeys(target, ["state", "pointerId"], "next task returnTarget");
        assertString(target.pointerId, "next task returnTarget pointerId", 512);
    }
    else {
        fail("next task returnTarget is invalid");
    }
    assertPlainObject(value.privacy, "current-work privacy");
    assertExactKeys(value.privacy, ["sourceBodiesStored", "localPathsStored", "rawBiometricsStored"], "current-work privacy");
    if (value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.rawBiometricsStored !== false) {
        fail("current-work privacy boundary is invalid");
    }
    return value;
}
function parseReadyProofTarget(value, currentWork, projection) {
    assertPlainObject(value, "ready proof target");
    assertExactKeys(value, [
        "taskId",
        "rootId",
        "outcome",
        "input",
        "predecessors",
        "doneDefinition",
        "permission",
        "returnTarget",
        "executable",
        "approvalPackage",
    ], "ready proof target");
    if (!sameCanonical(value.approvalPackage, READY_PROOF_TARGET_APPROVAL_BOUNDARY)) {
        fail("ready proof target approval-package boundary is invalid");
    }
    const rootId = value.rootId;
    if (typeof rootId !== "string") {
        fail("ready proof target root identity is invalid");
    }
    const root = projection.roots.find((candidate) => candidate.id === rootId);
    if (root === undefined)
        fail("ready proof target root is missing");
    const leaf = { ...value };
    delete leaf.approvalPackage;
    const core = {
        contractVersion: currentWork.contractVersion,
        projection: currentWork.projection,
        currentGoal: {
            rootId: root.id,
            title: root.title,
            accepted: true,
        },
        nextTaskToProve: leaf,
        privacy: currentWork.privacy,
    };
    const synthetic = {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
    };
    return parseCurrentWork(synthetic, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(synthetic), "utf8")).nextTaskToProve;
}
function parseBody(value) {
    assertPlainObject(value, "body context");
    if (value.contractVersion !== types_js_1.TASKMAP_BODY_CONTEXT_CONTRACT_VERSION) {
        fail("body-context version is unsupported");
    }
    assertString(value.projectionRunId, "body-context projectionRunId", 256);
    assertDigest(value.projectionInputDigest, "body-context projectionInputDigest");
    assertPlainObject(value.privacy, "body-context privacy");
    if (value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.rawBiometricsStored !== false) {
        fail("body-context privacy boundary is invalid");
    }
    return value;
}
function parseBodySignalAssessment(value, rawBytes) {
    assertPlainObject(value, "body-signal assessment");
    assertExactKeys(value, [
        "contractVersion",
        "artifactDigest",
        "projection",
        "physiologicalSnapshotDigest",
        "assessedAt",
        "sourceFamily",
        "signal",
        "coverage",
        "roots",
        "boundary",
        "privacy",
    ], "body-signal assessment");
    if (value.contractVersion !== native_refresh_service_js_1.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION) {
        fail("body-signal assessment version is unsupported");
    }
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== rawBytes.toString("utf8")) {
        fail("body-signal assessment must use canonical JSON bytes");
    }
    assertDigest(value.artifactDigest, "body-signal assessment artifactDigest");
    const core = { ...value };
    delete core.artifactDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)(core) !== value.artifactDigest) {
        fail("body-signal assessment artifact digest is invalid");
    }
    assertPlainObject(value.projection, "body-signal assessment projection");
    assertExactKeys(value.projection, ["runId", "inputDigest", "projectionDigest"], "body-signal assessment projection");
    assertString(value.projection.runId, "body-signal assessment projection runId", 256);
    assertDigest(value.projection.inputDigest, "body-signal assessment projection inputDigest");
    assertDigest(value.projection.projectionDigest, "body-signal assessment projectionDigest");
    assertDigest(value.physiologicalSnapshotDigest, "body-signal assessment physiologicalSnapshotDigest");
    assertStrictTimestamp(value.assessedAt, "body-signal assessment assessedAt");
    if (value.sourceFamily !== "physiological") {
        fail("body-signal assessment source family is invalid");
    }
    assertPlainObject(value.signal, "body-signal assessment signal");
    assertExactKeys(value.signal, ["axis", "displayName", "comparison", "targetCategory"], "body-signal assessment signal");
    if (value.signal.axis !== "composite_recovery"
        || value.signal.displayName !== "Readiness + Sleep"
        || value.signal.comparison !== "relative_to_recent_personal_range"
        || value.signal.targetCategory !== "below_baseline") {
        fail("body-signal assessment signal definition is invalid");
    }
    assertPlainObject(value.coverage, "body-signal assessment coverage");
    const coverage = value.coverage;
    assertExactKeys(coverage, ["startDay", "endDay", "classifiedDays", "unknownDays"], "body-signal assessment coverage");
    const coverageStartDay = coverage.startDay;
    const coverageEndDay = coverage.endDay;
    assertDateKey(coverageStartDay, "body-signal assessment coverage startDay");
    assertDateKey(coverageEndDay, "body-signal assessment coverage endDay");
    if (coverageStartDay > coverageEndDay
        || typeof coverage.classifiedDays !== "number"
        || !Number.isSafeInteger(coverage.classifiedDays)
        || coverage.classifiedDays < 0
        || typeof coverage.unknownDays !== "number"
        || !Number.isSafeInteger(coverage.unknownDays)
        || coverage.unknownDays < 0) {
        fail("body-signal assessment coverage is invalid");
    }
    if (!Array.isArray(value.roots) || value.roots.length > 4_096) {
        fail("body-signal assessment roots are invalid");
    }
    const rootIds = new Set();
    for (const [index, raw] of value.roots.entries()) {
        assertPlainObject(raw, `body-signal assessment root ${index}`);
        const hasEvidenceLevel = Object.prototype.hasOwnProperty.call(raw, "evidenceLevel");
        assertExactKeys(raw, [
            "rootId",
            "relationship",
            ...(hasEvidenceLevel ? ["evidenceLevel"] : []),
            "observedSignalDates",
            "matchedWorkDates",
            "matchedWorkSources",
            "matchedDateCount",
            "signalSummary",
            "relevanceSummary",
            "reasonCode",
        ], `body-signal assessment root ${index}`);
        assertString(raw.rootId, `body-signal assessment root ${index} rootId`, 256);
        if (!ROOT_ID.test(raw.rootId)) {
            fail("body-signal assessment root identity is invalid");
        }
        if (rootIds.has(raw.rootId)) {
            fail("body-signal assessment root identity is duplicated");
        }
        rootIds.add(raw.rootId);
        if (raw.relationship !== "body_informed"
            && raw.relationship !== "repeated_association"
            && raw.relationship !== "not_established") {
            fail("body-signal assessment relationship is invalid");
        }
        if (raw.evidenceLevel !== undefined
            && raw.evidenceLevel !== "body_informed"
            && raw.evidenceLevel !== "corroborated_association"
            && raw.evidenceLevel !== "not_established") {
            fail("body-signal assessment evidence level is invalid");
        }
        const observedSignalDates = raw.observedSignalDates;
        const matchedWorkDates = raw.matchedWorkDates;
        if (!Array.isArray(observedSignalDates)
            || !Array.isArray(matchedWorkDates)) {
            fail("body-signal assessment dates are invalid");
        }
        for (const [field, dates] of [
            ["observedSignalDates", observedSignalDates],
            ["matchedWorkDates", matchedWorkDates],
        ]) {
            if (!Array.isArray(dates) || dates.length > 366) {
                fail(`body-signal assessment ${field} is invalid`);
            }
            for (const date of dates) {
                assertDateKey(date, `body-signal assessment ${field} date`);
            }
            if (new Set(dates).size !== dates.length
                || dates.some((date, dateIndex) => (dateIndex > 0 && dates[dateIndex - 1] >= date))
                || dates.some((date) => (date < coverageStartDay || date > coverageEndDay))) {
                fail(`body-signal assessment ${field} must be unique, sorted, and within coverage`);
            }
        }
        const matchedWorkSources = raw.matchedWorkSources;
        assertStringArray(matchedWorkSources, "body-signal assessment matchedWorkSources", 16);
        if (matchedWorkSources.some((label) => !BODY_SIGNAL_SOURCE_LABELS.has(label))
            || matchedWorkSources.some((label, labelIndex) => (labelIndex > 0 && matchedWorkSources[labelIndex - 1] >= label))) {
            fail("body-signal assessment work-source labels are invalid");
        }
        const matchedDateCount = raw.matchedDateCount;
        if (typeof matchedDateCount !== "number"
            || !Number.isSafeInteger(matchedDateCount)
            || matchedDateCount !== matchedWorkDates.length
            || matchedWorkDates.some((date) => !observedSignalDates.includes(date))) {
            fail("body-signal assessment matched dates are invalid");
        }
        assertString(raw.signalSummary, "body-signal assessment signal summary", 1024);
        assertString(raw.relevanceSummary, "body-signal assessment relevance summary", 1024);
        if (raw.reasonCode !== null
            && (typeof raw.reasonCode !== "string"
                || !BODY_SIGNAL_REASON_CODES.has(raw.reasonCode))) {
            fail("body-signal assessment reason code is invalid");
        }
        if ((raw.relationship === "repeated_association"
            && (raw.reasonCode !== null
                || matchedDateCount < 3
                || matchedWorkSources.length < 2
                || (raw.evidenceLevel !== undefined
                    && raw.evidenceLevel !== "corroborated_association")))
            || (raw.relationship === "body_informed"
                && (raw.reasonCode !== null
                    || matchedDateCount < 1
                    || matchedWorkSources.length < 1
                    || (raw.evidenceLevel !== undefined
                        && raw.evidenceLevel !== "body_informed")))
            || (raw.relationship === "not_established"
                && (raw.reasonCode === null
                    || (raw.evidenceLevel !== undefined
                        && raw.evidenceLevel !== "not_established")))) {
            fail("body-signal assessment relationship is inconsistent");
        }
    }
    if (value.boundary
        !== "Body-informed context only. Association is not proof of cause.") {
        fail("body-signal assessment boundary is invalid");
    }
    assertPlainObject(value.privacy, "body-signal assessment privacy");
    assertExactKeys(value.privacy, [
        "rawBiometricsStored",
        "sourceBodiesStored",
        "localPathsStored",
        "providerIdentityStored",
    ], "body-signal assessment privacy");
    if (value.privacy.rawBiometricsStored !== false
        || value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.providerIdentityStored !== false) {
        fail("body-signal assessment privacy boundary is invalid");
    }
    return value;
}
function expectedPredecessors(projection, taskId) {
    const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
    const rows = [];
    for (const edge of projection.edges) {
        let predecessorId;
        let relation;
        if (edge.relation === "depends_on" && edge.from === taskId) {
            predecessorId = edge.to;
            relation = "depends_on";
        }
        else if (edge.relation === "blocks" && edge.to === taskId) {
            predecessorId = edge.from;
            relation = "blocks";
        }
        if (predecessorId === undefined || relation === undefined)
            continue;
        const task = tasks.get(predecessorId);
        if (task === undefined)
            fail("predecessor task is missing");
        rows.push({
            taskId: task.id,
            relation,
            reviewState: task.reviewState,
            openState: task.openState,
        });
    }
    return rows.sort((a, b) => (a.taskId.localeCompare(b.taskId) || a.relation.localeCompare(b.relation)));
}
function expectedContextPointerIds(projection, task) {
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    return [...new Set([
            ...task.originPointerIds.filter((pointerId) => (sourceById.get(pointerId)?.sourceKind !== "oura")),
            ...task.citations
                .filter((citation) => citation.sourceKind !== "oura")
                .map((citation) => citation.pointerId),
        ])].sort();
}
function currentSourceBacks(projection, task) {
    const homeId = task.taskHomePointerId;
    if (task.reviewState !== "accepted"
        || task.openState !== "open"
        || (task.sourceStatus !== "open" && task.sourceStatus !== "in_progress")
        || task.authority === "none"
        || homeId === undefined
        || !task.originPointerIds.includes(homeId)) {
        return false;
    }
    const source = projection.sources.find((row) => row.id === homeId);
    return (source !== undefined
        && source.authority === task.authority
        && source.sourceKind !== "oura"
        && source.sourceKind !== "codex_session"
        && source.sourceKind !== "claude_session"
        && source.capabilities.includes("read_task")
        && typeof source.sourceVersion === "string"
        && source.sourceVersion.trim().length > 0
        && task.citations.some((citation) => (citation.pointerId === homeId
            && citation.sourceKind === source.sourceKind)));
}
function buildOperationalSourceEvidence(projection, task, contextPointerIds, returnTarget) {
    const homeId = task.taskHomePointerId;
    if (homeId === undefined)
        fail("operational task home is unavailable");
    const returnPointerId = "pointerId" in returnTarget
        ? returnTarget.pointerId
        : undefined;
    const pointerIds = [...new Set([
            homeId,
            ...contextPointerIds,
            ...(returnPointerId === undefined ? [] : [returnPointerId]),
        ])].sort();
    if (pointerIds.length === 0
        || pointerIds.length > exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxContextPointers + 2) {
        fail("operational source evidence exceeds the product bounds");
    }
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    const sourceEvidence = pointerIds.map((pointerId) => {
        const source = sourceById.get(pointerId);
        if (source === undefined)
            fail("operational source pointer is missing");
        const roles = [];
        if (pointerId === homeId)
            roles.push("task_home");
        if (contextPointerIds.includes(pointerId)) {
            roles.push("context");
        }
        if (pointerId === returnPointerId)
            roles.push("return_target");
        const citations = task.citations
            .filter((citation) => citation.pointerId === pointerId)
            .map((citation) => ({
            eventId: citation.eventId,
            sourceRefHash: citation.sourceRefHash,
            occurredAt: citation.occurredAt,
            extractionConfidence: citation.extractionConfidence,
        }))
            .sort((left, right) => (left.eventId.localeCompare(right.eventId)
            || left.sourceRefHash.localeCompare(right.sourceRefHash)
            || left.occurredAt.localeCompare(right.occurredAt)));
        return {
            pointerId,
            roles,
            sourceKind: source.sourceKind,
            sourceVersion: source.sourceVersion ?? null,
            authority: source.authority,
            syncMode: source.syncMode,
            capabilities: [...source.capabilities].sort(),
            citations,
        };
    });
    return sourceEvidence;
}
function buildOperationalContext(rootTitle, task, approvalTask, quartet) {
    const homeId = task.taskHomePointerId;
    if (homeId === undefined)
        fail("operational task home is unavailable");
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_OPERATIONAL_CONTEXT_VERSION,
        quartet: { ...quartet },
        task: {
            taskId: task.id,
            rootId: task.rootId,
            taskTitle: task.title,
            rootTitle,
            reviewState: task.reviewState,
            openState: task.openState,
            sourceStatus: task.sourceStatus,
            authority: task.authority,
            taskHomePointerId: homeId,
        },
        sourceEvidence: approvalTask.sourceEvidence.map((row) => ({
            ...row,
            roles: [...row.roles],
            capabilities: [...row.capabilities],
            citations: row.citations.map((citation) => ({ ...citation })),
        })),
    };
    return {
        ...core,
        contextDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: OPERATIONAL_CONTEXT_DOMAIN,
            ...core,
        }),
    };
}
function operational(edge) {
    return (edge.relation === "advances"
        || edge.relation === "depends_on"
        || edge.relation === "blocks"
        || edge.relation === "supersedes");
}
function routeToTask(projection, rootId, taskId) {
    const root = projection.roots.find((row) => row.id === rootId);
    if (root === undefined || !root.taskIds.includes(taskId)) {
        fail("target task is outside its root");
    }
    const allowed = new Set([rootId, ...root.taskIds]);
    const adjacency = new Map();
    for (const edge of projection.edges.filter(operational)) {
        if (!allowed.has(edge.from) || !allowed.has(edge.to))
            continue;
        adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
        adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
    }
    for (const [key, values] of adjacency) {
        adjacency.set(key, [...new Set(values)].sort());
    }
    const queue = [[rootId]];
    const visited = new Set([rootId]);
    while (queue.length > 0) {
        const route = queue.shift();
        const tail = route[route.length - 1];
        if (tail === taskId) {
            if (route.length > exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxRouteNodes) {
                fail("route is too long");
            }
            return route;
        }
        if (route.length >= exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxRouteNodes) {
            continue;
        }
        for (const next of adjacency.get(tail) ?? []) {
            if (visited.has(next))
                continue;
            visited.add(next);
            queue.push([...route, next]);
        }
    }
    const target = projection.tasks.find((task) => task.id === taskId);
    if (target?.rootId === rootId) {
        // Receipt-backed owner tasks have exact root membership but no fabricated
        // semantic dependency edge. That direct membership is their bounded route.
        return [rootId, taskId];
    }
    fail("target task has no operational route from its root");
}
function sameCanonical(a, b) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(a) === (0, source_contracts_js_1.taskMapContractCanonicalJson)(b);
}
function derivePrepareIdempotencyKey(ownerScopeDigest, proofDigest, taskId) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: IDEMPOTENCY_DOMAIN,
        localOwnerScopeDigest: ownerScopeDigest,
        proofDigest,
        taskId,
        operation: "approve_prepare",
    });
}
function responseFromInspection(inspection) {
    return {
        contractVersion: exports.TASKMAP_LOCAL_APPROVAL_RESPONSE_VERSION,
        status: "ready_for_approval",
        taskId: inspection.task.taskId,
        rootId: inspection.task.rootId,
        runId: inspection.quartet.runId,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        prepareIdempotencyKey: inspection.prepareIdempotencyKey,
        projectionFileDigest: inspection.quartet.projectionFileDigest,
        currentnessFileDigest: inspection.quartet.currentnessFileDigest,
        currentWorkFileDigest: inspection.quartet.currentWorkFileDigest,
        bodyFileDigest: inspection.quartet.bodyFileDigest,
        bodyAssessmentFileDigest: inspection.quartet.bodyAssessmentFileDigest,
        bodyAssessmentArtifactDigest: inspection.quartet.bodyAssessmentArtifactDigest,
        physiologicalSnapshotDigest: inspection.quartet.physiologicalSnapshotDigest,
        proofDigest: inspection.proofDigest,
        approvalRecorded: false,
        approvalAuthorizationId: null,
        approvalAuthorizationDigest: null,
        packageId: null,
        packageDigest: null,
        preparationReceiptId: null,
        artifactAccess: null,
        deliveryStatus: "not_started",
        taskStarted: false,
        noDispatch: true,
        sourceCompletion: false,
        outcomeVerified: false,
    };
}
async function inspectTaskMapLocalApprovalInternal(input, includePreparedReadback) {
    assertPlainObject(input, "inspection input");
    const allowed = [
        "taskMapRoot",
        "ownerRoot",
        ...(input.expectedOwnerScopeDigest === undefined
            ? []
            : ["expectedOwnerScopeDigest"]),
        ...(input.taskId === undefined ? [] : ["taskId"]),
    ];
    assertExactKeys(input, allowed, "inspection input");
    if (input.taskId !== undefined && !TASK_ID.test(input.taskId)) {
        fail("requested proof-target task identity is invalid");
    }
    const taskMapRoot = await assertPrivateDirectory(input.taskMapRoot, "taskmap root", false);
    const ownerRoot = await assertPrivateDirectory(input.ownerRoot, "owner root", false);
    if (taskMapRoot !== node_path_1.default.join(ownerRoot, node_path_1.default.basename(taskMapRoot))) {
        fail("taskmap root is outside the validated owner root");
    }
    const localOwnerScopeDigest = await deriveTaskMapLocalOwnerScopeDigest(ownerRoot);
    if (input.expectedOwnerScopeDigest !== undefined) {
        assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
        if (input.expectedOwnerScopeDigest !== localOwnerScopeDigest) {
            fail("local owner scope changed");
        }
    }
    const [projectionFile, currentnessFile, currentWorkFile, bodyFile, bodyAssessmentFile,] = await Promise.all([
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.projection), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxProjectionBytes, "projection"),
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxCurrentnessBytes, "currentness"),
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.currentWork), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxCurrentWorkBytes, "current work"),
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.body), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxBodyBytes, "body context"),
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.bodyAssessment), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxBodyAssessmentBytes, "body-signal assessment"),
    ]);
    const projection = projectionFile.parsed;
    const projectionDiff = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection);
    if (projection.runStatus !== "accepted" || projection.rejections.length !== 0) {
        fail("projection is not accepted");
    }
    const projectionDigest = projectionDiff.currentProjectionDigest;
    const currentness = parseCurrentness(currentnessFile.parsed);
    const currentWork = parseCurrentWork(currentWorkFile.parsed, currentWorkFile.bytes);
    const body = parseBody(bodyFile.parsed);
    const bodyAssessment = parseBodySignalAssessment(bodyAssessmentFile.parsed, bodyAssessmentFile.bytes);
    if (currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== projectionDigest) {
        fail("currentness is not bound to the projection");
    }
    const dispositionByTask = new Map(currentness.taskDispositions.map((row) => [row.taskId, row.disposition]));
    if (dispositionByTask.size !== projection.tasks.length
        || projection.tasks.some((task) => !dispositionByTask.has(task.id))) {
        fail("currentness does not classify every projected task exactly once");
    }
    const projectionBinding = currentWork.projection;
    if (projectionBinding.contractVersion !== projection.contractVersion
        || projectionBinding.runId !== projection.runId
        || projectionBinding.inputDigest !== projection.inputDigest
        || projectionBinding.generatedAt !== projection.generatedAt
        || projectionBinding.projectionDigest !== projectionDigest) {
        fail("current work is not bound to the projection");
    }
    if (body.projectionRunId !== projection.runId
        || body.projectionInputDigest !== projection.inputDigest) {
        fail("body context is not bound to the projection");
    }
    if (bodyAssessment.projection.runId !== projection.runId
        || bodyAssessment.projection.inputDigest !== projection.inputDigest
        || bodyAssessment.projection.projectionDigest !== projectionDigest
        || bodyAssessment.roots.length !== projection.roots.length
        || new Set(bodyAssessment.roots.map((row) => row.rootId)).size
            !== projection.roots.length
        || projection.roots.some((root) => (!bodyAssessment.roots.some((row) => row.rootId === root.id)))) {
        fail("body-signal assessment is not bound to every projected root");
    }
    let leaf = currentWork.nextTaskToProve;
    let publishedProofTargets = null;
    let selectedPublishedProofTarget = null;
    if (input.taskId !== undefined) {
        const readyProofTargetsPath = node_path_1.default.join(taskMapRoot, exports.TASKMAP_READY_PROOF_TARGETS_FILENAME);
        let readyProofTargetsFile = null;
        try {
            await (0, promises_1.lstat)(readyProofTargetsPath);
            readyProofTargetsFile = await readPrivateFile(readyProofTargetsPath, exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxReadyProofTargetsBytes, "ready proof targets");
        }
        catch (error) {
            if (errnoCode(error) !== "ENOENT")
                throw error;
        }
        if (readyProofTargetsFile === null) {
            fail("ready proof targets are missing");
        }
        else {
            if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(readyProofTargetsFile.parsed)
                !== readyProofTargetsFile.bytes.toString("utf8")) {
                fail("ready proof targets must use canonical JSON bytes");
            }
            let readyProofTargets;
            try {
                readyProofTargets = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(readyProofTargetsFile.parsed, projection, currentness);
            }
            catch {
                fail("ready proof targets are not bound to the current projection");
            }
            const selected = readyProofTargets.proofTargets.find((target) => target.taskId === input.taskId);
            if (selected === undefined)
                fail("requested proof target is not published");
            publishedProofTargets = readyProofTargets.proofTargets;
            selectedPublishedProofTarget = selected;
            leaf = parseReadyProofTarget(selected, currentWork, projection);
        }
    }
    if (!TASK_ID.test(leaf.taskId) || !ROOT_ID.test(leaf.rootId)) {
        fail("current-work task or root identity is invalid");
    }
    if ((input.taskId === undefined
        && currentWork.currentGoal.rootId !== leaf.rootId)
        || dispositionByTask.get(leaf.taskId) !== "current") {
        fail("current-work target is not current");
    }
    const root = projection.roots.find((row) => row.id === leaf.rootId);
    const task = projection.tasks.find((row) => row.id === leaf.taskId);
    if (root === undefined || task === undefined)
        fail("current-work target is missing");
    let selectedAgentSessionTaskProof = null;
    if (currentWork.agentSessionTaskProofs !== undefined) {
        const matchingProofs = currentWork.agentSessionTaskProofs.filter((row) => row.taskId === task.id);
        const homeSource = task.taskHomePointerId === undefined ? undefined
            : projection.sources.find((source) => source.id === task.taskHomePointerId);
        const receiptBackedManual = homeSource?.sourceKind === "manual"
            && homeSource.authority === "user"
            && homeSource.syncMode === "personal_fork";
        if (matchingProofs.length > 1 || (receiptBackedManual && matchingProofs.length !== 1)) {
            fail("selected adopted-agent task proof is unavailable or ambiguous");
        }
        selectedAgentSessionTaskProof = matchingProofs[0] ?? null;
        if (selectedAgentSessionTaskProof !== null
            && selectedAgentSessionTaskProof.promotionId !== task.taskHomePointerId)
            fail("selected adopted-agent task proof does not match the task");
    }
    if (task.rootId !== root.id
        || !root.taskIds.includes(task.id)
        || !currentSourceBacks(projection, task)
        || task.citations.filter((citation) => citation.sourceKind !== "oura").length === 0) {
        fail("current-work target is not an accepted open source-backed task");
    }
    let selectedLifecycleHistory = null;
    if (input.taskId !== undefined) {
        selectedLifecycleHistory = await readApprovalLifecycleHistory(ownerRoot);
        (0, local_completion_overlay_js_1.assertTaskMapLocalLifecycleMutationAllowed)({
            localOwnerScopeDigest,
            lifecycleHistory: selectedLifecycleHistory,
            identity: approvalLifecycleIdentity(projection, task),
        });
    }
    if (leaf.outcome.length > 320
        || leaf.input.summary.length > 320
        || leaf.doneDefinition.length > 12
        || leaf.doneDefinition.some((item) => item.length > 240)) {
        fail("current-work execution leaf exceeds the product bounds");
    }
    if (leaf.returnTarget.state === "user_destination_required"
        || !projection.sources.some((source) => ("pointerId" in leaf.returnTarget
            && source.id === leaf.returnTarget.pointerId))) {
        fail("current-work return route is unavailable");
    }
    if (task.returnRoute.requiresApproval !== true
        || !sameCanonical(leaf.returnTarget, task.returnRoute.state === "user_destination_required"
            ? { state: task.returnRoute.state }
            : { state: task.returnRoute.state, pointerId: task.returnRoute.pointerId })) {
        fail("current-work return target does not match the task");
    }
    const contextPointerIds = expectedContextPointerIds(projection, task);
    if (!sameCanonical(leaf.input.contextPointerIds, contextPointerIds)) {
        fail("current-work context pointers do not match the task");
    }
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(leaf).length > 0) {
        fail("current-work package content violates the privacy boundary");
    }
    const predecessors = expectedPredecessors(projection, task.id);
    if (!sameCanonical(leaf.predecessors, predecessors)) {
        fail("current-work predecessors do not match the graph");
    }
    const projectionOpenPredecessorIds = predecessors
        .filter((predecessor) => (predecessor.reviewState !== "source_complete"
        && predecessor.reviewState !== "superseded"
        && predecessor.openState !== "completed"
        && predecessor.openState !== "superseded"))
        .map((predecessor) => predecessor.taskId);
    let terminalFrontierBinding = null;
    if (input.taskId !== undefined && projectionOpenPredecessorIds.length > 0) {
        if (selectedLifecycleHistory === null
            || publishedProofTargets === null
            || selectedPublishedProofTarget === null) {
            fail("current-work terminal dependency evidence is unavailable");
        }
        const validated = await validateApprovalTerminalReadyFrontier({
            ownerRoot,
            projection,
            currentness,
            localOwnerScopeDigest,
            lifecycleHistory: selectedLifecycleHistory,
            proofTargets: publishedProofTargets,
            selectedProofTarget: selectedPublishedProofTarget,
        });
        if (projectionOpenPredecessorIds.some((taskId) => !validated.terminalTaskIds.has(taskId))) {
            fail("current-work dependencies are not ready");
        }
        terminalFrontierBinding = {
            readyFrontierArtifactDigest: validated.frontier.artifactDigest,
            terminalOverlay: structuredClone(validated.frontier.terminalOverlay),
        };
    }
    const routeNodeIds = routeToTask(projection, root.id, task.id);
    const selectedBodyAssessment = bodyAssessment.roots.find((row) => row.rootId === root.id);
    if (selectedBodyAssessment === undefined) {
        fail("selected root has no body-signal assessment");
    }
    const quartet = {
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        generatedAt: projection.generatedAt,
        projectionDigest,
        projectionFileDigest: projectionFile.digest,
        currentnessFileDigest: currentnessFile.digest,
        currentWorkFileDigest: currentWorkFile.digest,
        bodyFileDigest: bodyFile.digest,
        bodyAssessmentFileDigest: bodyAssessmentFile.digest,
        bodyAssessmentArtifactDigest: bodyAssessment.artifactDigest,
        physiologicalSnapshotDigest: bodyAssessment.physiologicalSnapshotDigest,
        currentWorkArtifactDigest: currentWork.artifactDigest,
    };
    const sourceEvidence = buildOperationalSourceEvidence(projection, task, contextPointerIds, leaf.returnTarget);
    const bodySignal = {
        assessmentArtifactDigest: bodyAssessment.artifactDigest,
        physiologicalSnapshotDigest: bodyAssessment.physiologicalSnapshotDigest,
        relationship: selectedBodyAssessment.relationship,
        signal: { ...bodyAssessment.signal },
        coverage: { ...bodyAssessment.coverage },
        observedSignalDates: [...selectedBodyAssessment.observedSignalDates],
        matchedWorkDates: [...selectedBodyAssessment.matchedWorkDates],
        matchedWorkSources: [...selectedBodyAssessment.matchedWorkSources],
        signalSummary: selectedBodyAssessment.signalSummary,
        relevanceSummary: selectedBodyAssessment.relevanceSummary,
        boundary: bodyAssessment.boundary,
    };
    const approvalTask = {
        taskId: task.id,
        rootId: root.id,
        outcome: leaf.outcome,
        input: {
            summary: leaf.input.summary,
            contextPointerIds: [...contextPointerIds],
        },
        predecessors: predecessors.map((row) => ({ ...row })),
        doneDefinition: [...leaf.doneDefinition],
        returnTarget: { ...leaf.returnTarget },
        routeNodeIds,
        sourceEvidence,
        bodySignal,
    };
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(approvalTask).length > 0) {
        fail("current-work package content violates the privacy boundary");
    }
    const selectedProofTargetBindingDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: SELECTED_PROOF_TARGET_DOMAIN,
        projectionDigest,
        currentnessFileDigest: currentnessFile.digest,
        proofTarget: leaf,
        ...(terminalFrontierBinding === null
            ? {}
            : { terminalFrontierBinding }),
    });
    const proofDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: PROOF_DOMAIN,
        localOwnerScopeDigest,
        quartet,
        task: approvalTask,
        selectedProofTargetBindingDigest,
        currentWorkApprovalGranted: false,
        currentWorkExecutable: false,
        authorizationScope: "prepare_local_package_only",
    });
    const inspection = {
        contractVersion: exports.TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION,
        localOwnerScopeDigest,
        proofDigest,
        prepareIdempotencyKey: derivePrepareIdempotencyKey(localOwnerScopeDigest, proofDigest, task.id),
        quartet,
        task: approvalTask,
        readyForLocalApproval: true,
        currentWorkApprovalGranted: false,
        currentWorkExecutable: false,
        authorizationScope: "prepare_local_package_only",
        dispatchAuthorized: false,
        sourceWritebackAuthorized: false,
        codexTaskStartAuthorized: false,
        sourceCompletionAuthorized: false,
        outcomeVerificationAuthorized: false,
    };
    const operationalContext = buildOperationalContext(root.title, task, approvalTask, quartet);
    const prepared = includePreparedReadback
        ? await readPreparedResponseIfPresent(ownerRoot, taskMapRoot, inspection)
        : null;
    return {
        inspection,
        response: prepared ?? responseFromInspection(inspection),
        projection,
        currentness,
        operationalContext,
        agentSessionEpisode: selectedAgentSessionTaskProof?.episode
            ?? (input.taskId === undefined
                && currentWork.nextTaskToProve.input.agentSessionEpisode !== undefined
                ? structuredClone(currentWork.nextTaskToProve.input.agentSessionEpisode)
                : null),
        agentSessionTaskProof: selectedAgentSessionTaskProof === null
            ? null : structuredClone(selectedAgentSessionTaskProof),
    };
}
async function inspectTaskMapLocalApproval(input) {
    const { inspection, response } = await inspectTaskMapLocalApprovalInternal(input, true);
    return { inspection, response };
}
/**
 * Exact lifecycle context for overlay, external completion, and Reopen.
 * Deliberately reads no current-work, approval, body, package, session,
 * artifact, or report state.
 */
async function inspectTaskMapLocalLifecycleContext(input) {
    assertPlainObject(input, "lifecycle context input");
    assertExactKeys(input, ["taskMapRoot", "ownerRoot"], "lifecycle context input");
    const taskMapRoot = await assertPrivateDirectory(input.taskMapRoot, "taskmap root", false);
    const ownerRoot = await assertPrivateDirectory(input.ownerRoot, "owner root", false);
    if (taskMapRoot !== node_path_1.default.join(ownerRoot, node_path_1.default.basename(taskMapRoot))) {
        fail("taskmap root is outside the validated owner root");
    }
    const [projectionFile, currentnessFile] = await Promise.all([
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.projection), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxProjectionBytes, "projection"),
        readPrivateFile(node_path_1.default.join(taskMapRoot, exports.TASKMAP_FIXED_ARTIFACT_NAMES.currentness), exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxCurrentnessBytes, "currentness"),
    ]);
    const projection = projectionFile.parsed;
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    if (projection.runStatus !== "accepted"
        || projection.rejections.length !== 0) {
        fail("projection is not accepted");
    }
    const currentness = parseCurrentness(currentnessFile.parsed);
    const dispositions = new Map(currentness.taskDispositions.map((row) => [row.taskId, row.disposition]));
    if (currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== projectionDigest
        || dispositions.size !== projection.tasks.length
        || projection.tasks.some((task) => !dispositions.has(task.id))) {
        fail("currentness is not bound to every projected task");
    }
    return {
        projection,
        currentness,
        localOwnerScopeDigest: await deriveTaskMapLocalOwnerScopeDigest(ownerRoot),
        projectionFileDigest: projectionFile.digest,
        currentnessFileDigest: currentnessFile.digest,
    };
}
async function inspectTaskMapLocalApprovalOperationalContext(input) {
    const { inspection, response, projection, currentness, agentSessionEpisode, agentSessionTaskProof, operationalContext, } = await inspectTaskMapLocalApprovalInternal(input, true);
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(operationalContext).length > 0) {
        fail("operational context violates the privacy boundary");
    }
    return {
        inspection,
        response,
        projection,
        currentness,
        agentSessionEpisode,
        agentSessionTaskProof,
        context: operationalContext,
    };
}
async function writeImmutableCanonical(filePath, value) {
    const bytes = Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8");
    if (bytes.byteLength > exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes) {
        fail("prepared artifact exceeds the byte limit");
    }
    let handle;
    try {
        handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        await handle.writeFile(bytes);
        await handle.sync();
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
        const existing = await readPrivateFile(filePath, exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes, "immutable prepared artifact");
        if (!existing.bytes.equals(bytes)) {
            fail("immutable prepared artifact conflicts with existing bytes");
        }
    }
    finally {
        await handle?.close();
    }
}
async function readCanonicalArtifact(filePath, label) {
    const file = await readPrivateFile(filePath, exports.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes, label);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(file.parsed) !== file.bytes.toString("utf8")) {
        fail(`${label} is not canonical`);
    }
    return file.parsed;
}
function sealWithDigest(core, digestKey, idKey, idPrefix, domain) {
    const digest = (0, source_contracts_js_1.taskMapContractDigest)({ domain, ...core });
    return {
        ...core,
        [idKey]: `${idPrefix}${digest}`,
        [digestKey]: digest,
    };
}
function authorizationRequestDigest(inspection) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: AUTHORIZATION_DOMAIN,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        proofDigest: inspection.proofDigest,
        taskId: inspection.task.taskId,
        rootId: inspection.task.rootId,
        authorizationScope: "prepare_local_package_only",
    });
}
function buildAuthorization(inspection, authorizedAt) {
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        idempotencyKey: inspection.prepareIdempotencyKey,
        requestDigest: authorizationRequestDigest(inspection),
        authorizedAt,
        proofDigest: inspection.proofDigest,
        quartet: inspection.quartet,
        taskId: inspection.task.taskId,
        rootId: inspection.task.rootId,
        approvalRecorded: true,
        currentWorkApprovalGranted: false,
        currentWorkExecutable: false,
        authorizationScope: "prepare_local_package_only",
        dispatchAuthorized: false,
        sourceWritebackAuthorized: false,
        codexTaskStartAuthorized: false,
        sourceCompletionAuthorized: false,
        outcomeVerificationAuthorized: false,
    };
    return sealWithDigest(core, "approvalAuthorizationDigest", "approvalAuthorizationId", "tmauthorization_", AUTHORIZATION_DOMAIN);
}
function buildPackage(inspection, authorization) {
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION,
        approvalAuthorizationId: authorization.approvalAuthorizationId,
        approvalAuthorizationDigest: authorization.approvalAuthorizationDigest,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        proofDigest: inspection.proofDigest,
        quartet: inspection.quartet,
        task: inspection.task,
        executionBoundary: {
            state: "prepared_not_started",
            approvalRecorded: true,
            deliveryStatus: "not_started",
            taskStarted: false,
            taskExecuted: false,
            dispatchAuthorized: false,
            sourceWritebackAuthorized: false,
            codexTaskStartAuthorized: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
            ownerIdentityStored: false,
        },
    };
    return sealWithDigest(core, "packageDigest", "packageId", "tmlocalpackage_", PACKAGE_DOMAIN);
}
function buildReceipt(inspection, authorization, executionPackage) {
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION,
        packageId: executionPackage.packageId,
        packageDigest: executionPackage.packageDigest,
        approvalAuthorizationId: authorization.approvalAuthorizationId,
        approvalAuthorizationDigest: authorization.approvalAuthorizationDigest,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        proofDigest: inspection.proofDigest,
        preparedAt: authorization.authorizedAt,
        preparationStatus: "package_ready",
        deliveryStatus: "not_started",
        taskStarted: false,
        taskExecuted: false,
        noDispatch: true,
        sourceMutationAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
    };
    return sealWithDigest(core, "preparationReceiptDigest", "preparationReceiptId", "tmpreparationreceipt_", RECEIPT_DOMAIN);
}
function assertSealedArtifact(value, version, digestKey, idKey, idPrefix, domain, label) {
    assertPlainObject(value, label);
    if (value.contractVersion !== version)
        fail(`${label} version is invalid`);
    assertDigest(value[digestKey], `${label} digest`);
    assertString(value[idKey], `${label} id`, 256);
    const core = { ...value };
    delete core[digestKey];
    delete core[idKey];
    const digest = (0, source_contracts_js_1.taskMapContractDigest)({ domain, ...core });
    if (value[digestKey] !== digest || value[idKey] !== `${idPrefix}${digest}`) {
        fail(`${label} seal is invalid`);
    }
}
function assertAuthorization(value, inspection) {
    assertPlainObject(value, "approval authorization");
    assertExactKeys(value, [
        "contractVersion",
        "approvalAuthorizationId",
        "approvalAuthorizationDigest",
        "localOwnerScopeDigest",
        "idempotencyKey",
        "requestDigest",
        "authorizedAt",
        "proofDigest",
        "quartet",
        "taskId",
        "rootId",
        "approvalRecorded",
        "currentWorkApprovalGranted",
        "currentWorkExecutable",
        "authorizationScope",
        "dispatchAuthorized",
        "sourceWritebackAuthorized",
        "codexTaskStartAuthorized",
        "sourceCompletionAuthorized",
        "outcomeVerificationAuthorized",
    ], "approval authorization");
    assertSealedArtifact(value, exports.TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION, "approvalAuthorizationDigest", "approvalAuthorizationId", "tmauthorization_", AUTHORIZATION_DOMAIN, "approval authorization");
    const auth = value;
    if (auth.localOwnerScopeDigest !== inspection.localOwnerScopeDigest
        || auth.idempotencyKey !== inspection.prepareIdempotencyKey
        || auth.requestDigest !== authorizationRequestDigest(inspection)
        || auth.proofDigest !== inspection.proofDigest
        || auth.taskId !== inspection.task.taskId
        || auth.rootId !== inspection.task.rootId
        || !sameCanonical(auth.quartet, inspection.quartet)
        || auth.approvalRecorded !== true
        || auth.currentWorkApprovalGranted !== false
        || auth.currentWorkExecutable !== false
        || auth.authorizationScope !== "prepare_local_package_only"
        || auth.dispatchAuthorized !== false
        || auth.sourceWritebackAuthorized !== false
        || auth.codexTaskStartAuthorized !== false
        || auth.sourceCompletionAuthorized !== false
        || auth.outcomeVerificationAuthorized !== false) {
        fail("approval authorization conflicts with the current proof");
    }
    assertCanonicalApprovalTimestamp(auth.authorizedAt, "authorization timestamp");
}
function assertPackage(value, inspection, authorization) {
    assertPlainObject(value, "local execution package");
    assertExactKeys(value, [
        "contractVersion",
        "packageId",
        "packageDigest",
        "approvalAuthorizationId",
        "approvalAuthorizationDigest",
        "localOwnerScopeDigest",
        "proofDigest",
        "quartet",
        "task",
        "executionBoundary",
        "privacy",
    ], "local execution package");
    assertSealedArtifact(value, exports.TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION, "packageDigest", "packageId", "tmlocalpackage_", PACKAGE_DOMAIN, "local execution package");
    const artifact = value;
    assertPlainObject(artifact.executionBoundary, "package execution boundary");
    assertExactKeys(artifact.executionBoundary, [
        "state",
        "approvalRecorded",
        "deliveryStatus",
        "taskStarted",
        "taskExecuted",
        "dispatchAuthorized",
        "sourceWritebackAuthorized",
        "codexTaskStartAuthorized",
    ], "package execution boundary");
    assertPlainObject(artifact.privacy, "package privacy");
    assertExactKeys(artifact.privacy, [
        "sourceBodiesStored",
        "localPathsStored",
        "rawBiometricsStored",
        "ownerIdentityStored",
    ], "package privacy");
    if (artifact.approvalAuthorizationId !== authorization.approvalAuthorizationId
        || artifact.approvalAuthorizationDigest !== authorization.approvalAuthorizationDigest
        || artifact.localOwnerScopeDigest !== inspection.localOwnerScopeDigest
        || artifact.proofDigest !== inspection.proofDigest
        || !sameCanonical(artifact.quartet, inspection.quartet)
        || !sameCanonical(artifact.task, inspection.task)
        || artifact.executionBoundary.state !== "prepared_not_started"
        || artifact.executionBoundary.approvalRecorded !== true
        || artifact.executionBoundary.deliveryStatus !== "not_started"
        || artifact.executionBoundary.taskStarted !== false
        || artifact.executionBoundary.taskExecuted !== false
        || artifact.executionBoundary.dispatchAuthorized !== false
        || artifact.executionBoundary.sourceWritebackAuthorized !== false
        || artifact.executionBoundary.codexTaskStartAuthorized !== false
        || artifact.privacy.sourceBodiesStored !== false
        || artifact.privacy.localPathsStored !== false
        || artifact.privacy.rawBiometricsStored !== false
        || artifact.privacy.ownerIdentityStored !== false) {
        fail("local execution package conflicts with the authorization");
    }
}
function assertReceipt(value, inspection, authorization, executionPackage) {
    assertPlainObject(value, "preparation receipt");
    assertExactKeys(value, [
        "contractVersion",
        "preparationReceiptId",
        "preparationReceiptDigest",
        "packageId",
        "packageDigest",
        "approvalAuthorizationId",
        "approvalAuthorizationDigest",
        "localOwnerScopeDigest",
        "proofDigest",
        "preparedAt",
        "preparationStatus",
        "deliveryStatus",
        "taskStarted",
        "taskExecuted",
        "noDispatch",
        "sourceMutationAttempted",
        "sourceCompletion",
        "outcomeVerified",
    ], "preparation receipt");
    assertSealedArtifact(value, exports.TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION, "preparationReceiptDigest", "preparationReceiptId", "tmpreparationreceipt_", RECEIPT_DOMAIN, "preparation receipt");
    const receipt = value;
    if (receipt.packageId !== executionPackage.packageId
        || receipt.packageDigest !== executionPackage.packageDigest
        || receipt.approvalAuthorizationId !== authorization.approvalAuthorizationId
        || receipt.approvalAuthorizationDigest !== authorization.approvalAuthorizationDigest
        || receipt.localOwnerScopeDigest !== inspection.localOwnerScopeDigest
        || receipt.proofDigest !== inspection.proofDigest
        || receipt.preparedAt !== authorization.authorizedAt
        || receipt.preparationStatus !== "package_ready"
        || receipt.deliveryStatus !== "not_started"
        || receipt.taskStarted !== false
        || receipt.taskExecuted !== false
        || receipt.noDispatch !== true
        || receipt.sourceMutationAttempted !== false
        || receipt.sourceCompletion !== false
        || receipt.outcomeVerified !== false) {
        fail("preparation receipt conflicts with the package");
    }
}
function preparedResponse(inspection, authorization, executionPackage, receipt, executionRoot) {
    return {
        ...responseFromInspection(inspection),
        status: "package_ready",
        approvalRecorded: true,
        approvalAuthorizationId: authorization.approvalAuthorizationId,
        approvalAuthorizationDigest: authorization.approvalAuthorizationDigest,
        packageId: executionPackage.packageId,
        packageDigest: executionPackage.packageDigest,
        preparationReceiptId: receipt.preparationReceiptId,
        artifactAccess: {
            revealDirectoryPath: executionRoot,
            packagePath: node_path_1.default.join(executionRoot, `package_${authorization.approvalAuthorizationId}.json`),
            receiptPath: node_path_1.default.join(executionRoot, `receipt_${executionPackage.packageId}.json`),
        },
    };
}
async function readPreparedResponseIfPresent(ownerRoot, taskMapRoot, inspection) {
    const executionRoot = node_path_1.default.join(ownerRoot, "taskmap-local-execution");
    if (executionRoot === taskMapRoot) {
        fail("owner artifact roots are not the fixed distinct product paths");
    }
    try {
        await (0, promises_1.lstat)(executionRoot);
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        throw error;
    }
    const validatedExecutionRoot = await assertPrivateDirectory(executionRoot, "execution root", false);
    if (validatedExecutionRoot !== executionRoot)
        fail("execution root changed");
    const rootBefore = await (0, promises_1.lstat)(executionRoot);
    const authorizationPath = node_path_1.default.join(executionRoot, `authorization_${inspection.prepareIdempotencyKey}.json`);
    try {
        await (0, promises_1.lstat)(authorizationPath);
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return null;
        throw error;
    }
    const authorization = await readCanonicalArtifact(authorizationPath, "approval authorization");
    assertAuthorization(authorization, inspection);
    const packagePath = node_path_1.default.join(executionRoot, `package_${authorization.approvalAuthorizationId}.json`);
    const executionPackage = await readCanonicalArtifact(packagePath, "local execution package");
    assertPackage(executionPackage, inspection, authorization);
    const receiptPath = node_path_1.default.join(executionRoot, `receipt_${executionPackage.packageId}.json`);
    const receipt = await readCanonicalArtifact(receiptPath, "preparation receipt");
    assertReceipt(receipt, inspection, authorization, executionPackage);
    const rootAfter = await (0, promises_1.lstat)(executionRoot);
    if (!rootAfter.isDirectory()
        || rootAfter.isSymbolicLink()
        || rootAfter.uid !== uid()
        || (rootAfter.mode & 0o777) !== DIRECTORY_MODE
        || rootAfter.dev !== rootBefore.dev
        || rootAfter.ino !== rootBefore.ino) {
        fail("execution root changed during readback");
    }
    return preparedResponse(inspection, authorization, executionPackage, receipt, executionRoot);
}
async function approveAndPrepareTaskMapLocalPackage(input) {
    assertPlainObject(input, "approve-and-prepare input");
    assertExactKeys(input, [
        "taskMapRoot",
        "ownerRoot",
        "executionRoot",
        "expectedOwnerScopeDigest",
        "expectedProofDigest",
        "taskId",
        "idempotencyKey",
        "authorizedAt",
    ], "approve-and-prepare input");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    assertDigest(input.expectedProofDigest, "expectedProofDigest");
    assertDigest(input.idempotencyKey, "idempotencyKey");
    assertString(input.taskId, "taskId", 256);
    assertCanonicalApprovalTimestamp(input.authorizedAt, "authorizedAt");
    assertAbsolutePath(input.ownerRoot, "ownerRoot");
    assertAbsolutePath(input.taskMapRoot, "taskMapRoot");
    assertAbsolutePath(input.executionRoot, "executionRoot");
    const expectedTaskMapRoot = node_path_1.default.join(input.ownerRoot, "taskmap");
    const expectedExecutionRoot = node_path_1.default.join(input.ownerRoot, "taskmap-local-execution");
    if (input.taskMapRoot !== expectedTaskMapRoot
        || input.executionRoot !== expectedExecutionRoot
        || input.executionRoot === input.taskMapRoot) {
        fail("owner artifact roots are not the fixed distinct product paths");
    }
    const inspectCurrentApproval = async () => {
        try {
            return (await inspectTaskMapLocalApprovalInternal({
                taskMapRoot: input.taskMapRoot,
                ownerRoot: input.ownerRoot,
                expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
                taskId: input.taskId,
            }, false)).inspection;
        }
        catch (error) {
            if (!(error instanceof Error)
                || !error.message.includes("ready proof targets are missing")) {
                throw error;
            }
            const legacy = await inspectTaskMapLocalApprovalInternal({
                taskMapRoot: input.taskMapRoot,
                ownerRoot: input.ownerRoot,
                expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
            }, false);
            if (legacy.inspection.task.taskId !== input.taskId) {
                throw error;
            }
            return legacy.inspection;
        }
    };
    let inspection = await inspectCurrentApproval();
    if (inspection.proofDigest !== input.expectedProofDigest
        || inspection.task.taskId !== input.taskId
        || inspection.prepareIdempotencyKey !== input.idempotencyKey) {
        fail("approval request does not match the current proof");
    }
    const executionRoot = await assertPrivateDirectory(input.executionRoot, "execution root", true);
    if (executionRoot !== expectedExecutionRoot)
        fail("execution root changed");
    return (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
        overlayPath: node_path_1.default.join(executionRoot, "local-approval-package.json"),
        expectedOwnerScopeDigest: inspection.localOwnerScopeDigest,
    }, async () => {
        // Completion/Close/Reopen use this same filesystem transaction. Re-read
        // the exact selected proof and terminal history only after the lock is
        // held so a terminal decision cannot land between inspection and write.
        inspection = await inspectCurrentApproval();
        if (inspection.proofDigest !== input.expectedProofDigest
            || inspection.task.taskId !== input.taskId
            || inspection.prepareIdempotencyKey !== input.idempotencyKey) {
            fail("approval request does not match the current proof");
        }
        const authorizationPath = node_path_1.default.join(executionRoot, `authorization_${inspection.prepareIdempotencyKey}.json`);
        let authorization;
        let replayed = false;
        try {
            authorization = await readCanonicalArtifact(authorizationPath, "approval authorization");
            assertAuthorization(authorization, inspection);
            replayed = true;
        }
        catch (error) {
            if (!(error instanceof Error)
                || !error.message.includes("approval authorization is missing")) {
                throw error;
            }
            authorization = buildAuthorization(inspection, input.authorizedAt);
            await writeImmutableCanonical(authorizationPath, authorization);
        }
        const expectedPackage = buildPackage(inspection, authorization);
        const packagePath = node_path_1.default.join(executionRoot, `package_${authorization.approvalAuthorizationId}.json`);
        await writeImmutableCanonical(packagePath, expectedPackage);
        const executionPackage = await readCanonicalArtifact(packagePath, "local execution package");
        assertPackage(executionPackage, inspection, authorization);
        const expectedReceipt = buildReceipt(inspection, authorization, executionPackage);
        const receiptPath = node_path_1.default.join(executionRoot, `receipt_${executionPackage.packageId}.json`);
        await writeImmutableCanonical(receiptPath, expectedReceipt);
        const receipt = await readCanonicalArtifact(receiptPath, "preparation receipt");
        assertReceipt(receipt, inspection, authorization, executionPackage);
        return {
            response: preparedResponse(inspection, authorization, executionPackage, receipt, executionRoot),
            authorization,
            package: executionPackage,
            receipt,
            replayed,
        };
    });
}
