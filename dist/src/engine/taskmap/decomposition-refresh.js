"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET = exports.TASKMAP_DECOMPOSITION_REFRESH_VERSION = void 0;
exports.selectTaskMapDecompositionWorkItems = selectTaskMapDecompositionWorkItems;
exports.taskMapDecompositionRefreshPath = taskMapDecompositionRefreshPath;
exports.loadTaskMapDecompositionRefreshArtifact = loadTaskMapDecompositionRefreshArtifact;
exports.refreshTaskMapDecomposition = refreshTaskMapDecomposition;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const decomposition_validation_js_1 = require("./decomposition-validation.js");
const method_library_js_1 = require("./method-library.js");
const llm_station_js_1 = require("./llm-station.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_DECOMPOSITION_REFRESH_VERSION = "taskmap-decomposition-refresh.v1";
exports.TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET = 3;
const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_DIRECTORY = "decomposition";
const MAX_ARTIFACT_BYTES = 8 * 1_024 * 1_024;
function stableCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function newestCitationAt(task) {
    return task.citations.reduce((latest, citation) => {
        const parsed = Date.parse(citation.occurredAt);
        return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
}
function domainSignature(value) {
    const normalized = value
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[^a-z0-9]+|[^a-z0-9._-]+$/g, "")
        .slice(0, 128);
    return /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)
        ? normalized
        : "general-work";
}
function selectTaskMapDecompositionWorkItems(projection) {
    const rootById = new Map(projection.roots.map((root) => [root.id, root]));
    const taskIds = new Set(projection.tasks.map((task) => task.id));
    const parentsWithChildren = new Set(projection.edges
        .filter((edge) => edge.relation === "informed_by"
        && taskIds.has(edge.from)
        && taskIds.has(edge.to))
        .map((edge) => edge.to));
    return projection.tasks
        .filter((task) => task.reviewState === "accepted"
        && task.openState === "open"
        && !parentsWithChildren.has(task.id)
        && task.citations.length > 0)
        .sort((left, right) => newestCitationAt(right) - newestCitationAt(left)
        || stableCompare(left.id, right.id))
        .slice(0, exports.TASKMAP_DECOMPOSITION_REFRESH_ITEM_BUDGET)
        .map((task) => ({
        taskId: task.id,
        domainSignature: domainSignature(rootById.get(task.rootId)?.title ?? task.title),
        title: task.title,
        summary: task.summary,
        citationPointerIds: [...new Set(task.citations.map((citation) => citation.pointerId))].sort(stableCompare),
    }));
}
function taskMapDecompositionRefreshPath(taskMapRoot, projectionDigest) {
    if (!node_path_1.default.isAbsolute(taskMapRoot) || !SHA256.test(projectionDigest)) {
        throw new TypeError("Task Map decomposition refresh path is invalid");
    }
    return node_path_1.default.join(taskMapRoot, ARTIFACT_DIRECTORY, `${projectionDigest}.json`);
}
function proposedEdges(proposal, parentTaskId) {
    return proposal.subtasks.map((subtask, index) => ({
        id: `tme_${(0, source_contracts_js_1.taskMapContractDigest)({
            proposalId: proposal.proposalId,
            parentTaskId,
            subtaskId: subtask.subtaskId,
            index,
        }).slice(0, 16)}`,
        from: subtask.subtaskId,
        to: parentTaskId,
        relation: "informed_by",
        citationPointerIds: [...subtask.citationPointerIds],
    }));
}
function validationCandidate(proposal, result, parentTaskId) {
    return {
        ...proposal,
        sourceResultArtifactDigest: result.artifactDigest,
        sourceProposalDigest: (0, source_contracts_js_1.taskMapContractDigest)(proposal),
        parentTaskId,
        edges: proposedEdges(proposal, parentTaskId),
    };
}
function validationReasonCodes(validation) {
    return validation.steps
        .filter((step) => !step.passed)
        .flatMap((step) => step.reasons.map((reason) => `${step.stepId}:${(0, source_contracts_js_1.taskMapContractDigest)(reason).slice(0, 16)}`));
}
function sealArtifact(base) {
    return { ...base, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(base) };
}
async function ensurePrivateDirectory(directory) {
    try {
        const metadata = await (0, promises_1.lstat)(directory);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error("decomposition artifact directory is unsafe");
        }
        const owner = process.getuid?.();
        if (owner !== undefined && metadata.uid !== owner) {
            throw new Error("decomposition artifact directory owner is unsafe");
        }
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        await (0, promises_1.mkdir)(directory, { recursive: true, mode: 0o700 });
    }
    await (0, promises_1.chmod)(directory, 0o700);
}
async function syncDirectory(directory) {
    const handle = await (0, promises_1.open)(directory, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY | node_fs_1.constants.O_NOFOLLOW);
    try {
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function atomicPrivateWrite(filePath, artifact) {
    const directory = node_path_1.default.dirname(filePath);
    await ensurePrivateDirectory(directory);
    const temporaryPath = node_path_1.default.join(directory, `.${node_path_1.default.basename(filePath)}.${(0, node_crypto_1.randomUUID)()}.tmp`);
    const handle = await (0, promises_1.open)(temporaryPath, "wx", 0o600);
    let renamed = false;
    try {
        await handle.writeFile((0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact), "utf8");
        await handle.chmod(0o600);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        await (0, promises_1.rename)(temporaryPath, filePath);
        renamed = true;
        await syncDirectory(directory);
    }
    finally {
        if (!renamed)
            await (0, promises_1.rm)(temporaryPath, { force: true });
    }
}
function validateCurrentArtifact(value, ownerScopeDigest, projectionDigest) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const artifact = value;
    if (artifact.contractVersion !== exports.TASKMAP_DECOMPOSITION_REFRESH_VERSION
        || artifact.ownerScopeDigest !== ownerScopeDigest
        || artifact.projectionDigest !== projectionDigest
        || artifact.state !== "current"
        || artifact.pendingCount !== 0
        || artifact.degradationCode !== null
        || artifact.authority.nodesWritten !== false
        || artifact.authority.edgesWritten !== false
        || artifact.authority.requiresOwnerAcceptance !== true
        || !Array.isArray(artifact.workItems))
        return null;
    const { artifactDigest, ...base } = artifact;
    if (artifactDigest !== (0, source_contracts_js_1.taskMapContractDigest)(base))
        return null;
    for (const workItem of artifact.workItems) {
        const { artifactDigest: resultDigest, ...resultBase } = workItem.result;
        if (resultDigest !== (0, source_contracts_js_1.taskMapContractDigest)(resultBase))
            return null;
        if (workItem.validations.some((validation) => {
            const { artifactDigest: validationDigest, ...validationBase } = validation;
            return validationDigest !== (0, source_contracts_js_1.taskMapContractDigest)(validationBase);
        }))
            return null;
    }
    return artifact;
}
async function loadCurrentArtifact(filePath, ownerScopeDigest, projectionDigest) {
    try {
        const metadata = await (0, promises_1.lstat)(filePath);
        const owner = process.getuid?.();
        if (!metadata.isFile()
            || metadata.isSymbolicLink()
            || metadata.nlink !== 1
            || metadata.mode % 0o1000 !== 0o600
            || metadata.size > MAX_ARTIFACT_BYTES
            || (owner !== undefined && metadata.uid !== owner))
            return null;
        return validateCurrentArtifact(JSON.parse(await (0, promises_1.readFile)(filePath, "utf8")), ownerScopeDigest, projectionDigest);
    }
    catch {
        return null;
    }
}
async function loadTaskMapDecompositionRefreshArtifact(taskMapRoot, ownerScopeDigest, projectionDigest) {
    if (!SHA256.test(ownerScopeDigest) || !SHA256.test(projectionDigest)) {
        return null;
    }
    return loadCurrentArtifact(taskMapDecompositionRefreshPath(taskMapRoot, projectionDigest), ownerScopeDigest, projectionDigest);
}
async function refreshTaskMapDecomposition(input) {
    if (!SHA256.test(input.ownerScopeDigest)) {
        throw new TypeError("Task Map decomposition owner binding is invalid");
    }
    const projectionDigest = (0, source_contracts_js_1.taskMapContractDigest)(input.projection);
    const artifactPath = taskMapDecompositionRefreshPath(input.taskMapRoot, projectionDigest);
    const replayed = await loadCurrentArtifact(artifactPath, input.ownerScopeDigest, projectionDigest);
    if (replayed !== null)
        return replayed;
    const methodLibrary = (0, method_library_js_1.buildTaskMapMethodLibrary)({ templates: [] });
    const selected = selectTaskMapDecompositionWorkItems(input.projection);
    let station;
    try {
        station = await (input.createStation ?? (() => (0, llm_station_js_1.createLlmStation)()))();
    }
    catch {
        station = undefined;
    }
    const decompositionStation = station === undefined
        ? undefined
        : {
            provider: station.provider,
            async run(request) {
                const envelope = await station.run(request);
                if (envelope.stationId !== "task-decomposition-v1") {
                    throw new Error("decomposition station returned the wrong station id");
                }
                return {
                    ...envelope,
                    stationId: "task-decomposition-v1",
                };
            },
        };
    const workItems = [];
    for (const workItem of selected) {
        const result = await (0, method_library_js_1.proposeTaskMapDecomposition)({
            workItem,
            library: methodLibrary,
            ...(decompositionStation === undefined
                ? {}
                : { station: decompositionStation }),
        });
        const validProposals = [];
        const validations = [];
        const rejected = [];
        for (const proposal of result.proposals) {
            const candidate = validationCandidate(proposal, result, workItem.taskId);
            const validation = (0, decomposition_validation_js_1.validateTaskMapDecomposition)(candidate, {
                projection: input.projection,
                sourceResult: result,
            });
            validations.push(validation);
            if (validation.valid) {
                validProposals.push({
                    proposal,
                    edges: candidate.edges,
                    validationArtifactDigest: validation.artifactDigest,
                });
            }
            else {
                rejected.push({
                    proposalId: proposal.proposalId,
                    reasonCodes: validationReasonCodes(validation),
                });
            }
        }
        workItems.push({
            taskId: workItem.taskId,
            inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(workItem),
            result,
            validProposals,
            validations,
            rejected,
        });
    }
    const unavailableCount = workItems.filter((item) => item.result.unavailableReason !== null).length;
    const rejectedCount = workItems.filter((item) => item.rejected.length > 0).length;
    const pendingCount = unavailableCount + rejectedCount;
    const state = unavailableCount > 0
        ? "unavailable"
        : rejectedCount > 0
            ? "deferred"
            : "current";
    const degradationCode = unavailableCount > 0
        ? "llm_station_unavailable"
        : rejectedCount > 0
            ? "validation_failed"
            : null;
    const artifact = sealArtifact({
        contractVersion: exports.TASKMAP_DECOMPOSITION_REFRESH_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        projectionDigest,
        methodLibrary,
        state,
        pendingCount,
        degradationCode,
        workItems,
        authority: {
            nodesWritten: false,
            edgesWritten: false,
            requiresOwnerAcceptance: true,
        },
    });
    await atomicPrivateWrite(artifactPath, artifact);
    return artifact;
}
