"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET = exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION = void 0;
exports.taskMapIdentityCandidatesFromProjection = taskMapIdentityCandidatesFromProjection;
exports.taskMapIdentityAdjudicationRefreshPath = taskMapIdentityAdjudicationRefreshPath;
exports.loadTaskMapIdentityAdjudicationRefreshArtifact = loadTaskMapIdentityAdjudicationRefreshArtifact;
exports.refreshTaskMapIdentityAdjudication = refreshTaskMapIdentityAdjudication;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const identity_adjudication_proposal_js_1 = require("./identity-adjudication-proposal.js");
const llm_station_js_1 = require("./llm-station.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION = "taskmap-identity-adjudication-refresh.v1";
exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET = 32;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ARTIFACT_BYTES = 4 * 1_024 * 1_024;
const ARTIFACT_DIRECTORY = "identity-adjudication";
const OUTER_KEYS = Object.freeze([
    "contractVersion",
    "ownerScopeDigest",
    "inputDigest",
    "state",
    "pendingCount",
    "degradationCode",
    "proposal",
    "result",
    "artifactDigest",
]);
function stableCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function taskMapIdentityCandidatesFromProjection(projection) {
    const candidates = projection.tasks.flatMap((task) => {
        const textParts = [...new Set([task.title, task.summary]
                .map((value) => value.trim().replace(/\s+/gu, " "))
                .filter((value) => value.length > 0 && !SHA256.test(value)))];
        if (textParts.length === 0)
            return [];
        const text = (0, text_contract_js_1.boundedUtf16)(textParts.join("\n"), identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters);
        if (SHA256.test(text))
            return [];
        return [{
                candidateId: task.id,
                rootId: task.rootId,
                text,
            }];
    }).sort((left, right) => stableCompare(left.candidateId, right.candidateId));
    return candidates.slice(0, identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates);
}
function taskMapIdentityAdjudicationRefreshPath(taskMapRoot, inputDigest) {
    if (!node_path_1.default.isAbsolute(taskMapRoot) || !SHA256.test(inputDigest)) {
        throw new TypeError("Task Map identity refresh path is invalid");
    }
    return node_path_1.default.join(taskMapRoot, ARTIFACT_DIRECTORY, `${inputDigest}.json`);
}
function proposalWithPairs(proposal, pairs) {
    const { artifactDigest: _artifactDigest, ...base } = proposal;
    const bounded = { ...base, pairs: [...pairs] };
    return {
        ...bounded,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(bounded),
    };
}
function sealResult(result) {
    return { ...result, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(result) };
}
function deferredPair(pair) {
    return {
        ...pair,
        adjudication: "deferred",
        adjudicationSource: "deferred",
        deferredReason: "llm_station_unavailable",
    };
}
function sealArtifact(artifact) {
    return { ...artifact, artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(artifact) };
}
function placeholderStation() {
    return {
        provider: {
            transport: "gemini-remote",
            executable: "",
            args: [],
            model: "unavailable",
        },
        async run() {
            throw new Error("identity adjudication station unavailable");
        },
    };
}
async function ensurePrivateDirectory(directory) {
    try {
        const metadata = await (0, promises_1.lstat)(directory);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error("identity adjudication artifact directory is unsafe");
        }
        const owner = process.getuid?.();
        if (owner !== undefined && metadata.uid !== owner) {
            throw new Error("identity adjudication artifact directory owner is unsafe");
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
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value) {
    const actual = Object.keys(value).sort(stableCompare);
    const expected = [...OUTER_KEYS].sort(stableCompare);
    return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
}
function validateReplayArtifact(parsed, ownerScopeDigest, inputDigest) {
    if (!isRecord(parsed) || !exactKeys(parsed))
        return null;
    const artifact = parsed;
    if (artifact.contractVersion !== exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION
        || artifact.ownerScopeDigest !== ownerScopeDigest
        || artifact.inputDigest !== inputDigest
        || artifact.state !== "current"
        || artifact.pendingCount !== 0
        || artifact.degradationCode !== null
        || artifact.proposal.inputDigest !== inputDigest
        || artifact.result.inputDigest !== inputDigest
        || artifact.result.contractVersion !== identity_adjudication_proposal_js_1.TASKMAP_IDENTITY_ADJUDICATION_RESULT_VERSION
        || artifact.result.authority.mergeApplied !== false
        || artifact.result.authority.aliasesWritten !== false
        || artifact.result.authority.requiresOwnerAcceptance !== true)
        return null;
    const { artifactDigest, ...base } = artifact;
    const { artifactDigest: proposalDigest, ...proposalBase } = artifact.proposal;
    const { artifactDigest: resultDigest, ...resultBase } = artifact.result;
    if (artifactDigest !== (0, source_contracts_js_1.taskMapContractDigest)(base)
        || proposalDigest !== (0, source_contracts_js_1.taskMapContractDigest)(proposalBase)
        || resultDigest !== (0, source_contracts_js_1.taskMapContractDigest)(resultBase))
        return null;
    return artifact;
}
async function loadCurrentArtifact(filePath, ownerScopeDigest, inputDigest) {
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
        const bytes = await (0, promises_1.readFile)(filePath);
        if (bytes.byteLength > MAX_ARTIFACT_BYTES)
            return null;
        return validateReplayArtifact(JSON.parse(bytes.toString("utf8")), ownerScopeDigest, inputDigest);
    }
    catch {
        return null;
    }
}
async function loadTaskMapIdentityAdjudicationRefreshArtifact(taskMapRoot, ownerScopeDigest, inputDigest) {
    if (!SHA256.test(ownerScopeDigest) || !SHA256.test(inputDigest))
        return null;
    return loadCurrentArtifact(taskMapIdentityAdjudicationRefreshPath(taskMapRoot, inputDigest), ownerScopeDigest, inputDigest);
}
async function refreshTaskMapIdentityAdjudication(input) {
    if (!SHA256.test(input.ownerScopeDigest) || !SHA256.test(input.inputDigest)) {
        throw new TypeError("Task Map identity refresh binding is invalid");
    }
    const artifactPath = taskMapIdentityAdjudicationRefreshPath(input.taskMapRoot, input.inputDigest);
    const replayed = await loadCurrentArtifact(artifactPath, input.ownerScopeDigest, input.inputDigest);
    if (replayed !== null)
        return replayed;
    const proposal = await (0, identity_adjudication_proposal_js_1.buildTaskMapIdentityAdjudicationProposals)({
        candidates: input.candidates,
        embeddingProvider: input.embeddingProvider,
        embeddingModelId: input.embeddingModelId,
        inputDigest: input.inputDigest,
    });
    const budgetPairs = proposal.pairs.slice(0, exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET);
    const excessPairs = proposal.pairs.slice(exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_PAIR_BUDGET);
    const budgetProposal = proposalWithPairs(proposal, budgetPairs);
    const ambiguous = budgetPairs.some((pair) => pair.confidence === "ambiguous");
    let selectedStation = placeholderStation();
    if (proposal.blockingState === "current" && ambiguous) {
        try {
            selectedStation = await (input.createStation ?? (() => (0, llm_station_js_1.createLlmStation)()))();
        }
        catch {
            selectedStation = placeholderStation();
        }
    }
    const adjudicated = await (0, identity_adjudication_proposal_js_1.adjudicateTaskMapIdentityPairs)({
        proposals: budgetProposal,
        candidateEvidence: input.candidates.map(({ candidateId, text }) => ({
            candidateId,
            text,
        })),
        station: selectedStation,
    });
    const excess = excessPairs.map(deferredPair);
    const combinedPairs = [...adjudicated.pairs, ...excess];
    const { artifactDigest: _adjudicatedDigest, ...adjudicatedBase } = adjudicated;
    const result = sealResult({
        ...adjudicatedBase,
        proposalArtifactDigest: proposal.artifactDigest,
        pairs: combinedPairs,
        verdicts: combinedPairs.map((pair) => ({
            pairId: pair.pairId,
            verdict: pair.adjudication,
            source: pair.adjudicationSource,
        })),
        mergeCandidates: combinedPairs.filter((pair) => pair.adjudication === "same_work"),
    });
    const pendingCount = result.pairs.filter((pair) => pair.adjudication === "deferred").length;
    const state = proposal.blockingState === "unavailable"
        ? "unavailable"
        : pendingCount > 0
            ? "deferred"
            : "current";
    const degradationCode = state === "unavailable"
        ? "embedding_provider_failed"
        : state === "deferred"
            ? "llm_station_unavailable"
            : null;
    const artifact = sealArtifact({
        contractVersion: exports.TASKMAP_IDENTITY_ADJUDICATION_REFRESH_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        inputDigest: input.inputDigest,
        state,
        pendingCount,
        degradationCode,
        proposal,
        result,
    });
    await atomicPrivateWrite(artifactPath, artifact);
    return artifact;
}
