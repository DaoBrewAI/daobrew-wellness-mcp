"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1 = exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_VERSION = void 0;
exports.defaultTaskMapCommunityEmbeddingCachePath = defaultTaskMapCommunityEmbeddingCachePath;
exports.defaultTaskMapCommunityGroupingReplayPath = defaultTaskMapCommunityGroupingReplayPath;
exports.buildTaskMapCommunitySemanticEvidence = buildTaskMapCommunitySemanticEvidence;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const community_graph_brain_js_1 = require("./community-graph-brain.js");
const llm_station_js_1 = require("./llm-station.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_VERSION = "taskmap-community-semantic-evidence.v1";
const GROUPING_REPLAY_VERSION = "taskmap-community-grouping-replay.v1";
const EMBEDDING_CACHE_VERSION = "taskmap-community-embedding-cache.v1";
const REPLAY_CAPACITY_LOCK_VERSION = "taskmap-community-replay-capacity-lock.v1";
exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1 = Object.freeze({
    /** Monitored fail-open ceiling; reports expose prompt_limit_exceeded and node counts. */
    maxPromptBytes: 64 * 1_024,
    maxGroupingOutputBytes: llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES,
    maxGroupingReplayEntries: 32,
    maxGroupingReplayBytes: 4 * 1_024 * 1_024,
    groupingReplayGraceMs: 5_000,
    groupingReplayFutureToleranceMs: 1_000,
    groupingReplayLockLeaseMs: 30_000,
    groupingReplayLockRetryCount: 2_000,
    groupingReplayLockRetryDelayMs: 5,
    maxEmbeddingCacheEntries: 2_048,
    maxEmbeddingCacheBytes: 16 * 1_024 * 1_024,
    maxModelCharacters: 256,
});
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CONTROL = /\p{Cc}/u;
const GROUPING_OUTPUT_KEYS = new Set(["groups"]);
const GROUP_KEYS = new Set(["nodeIds"]);
const ENVELOPE_KEYS = new Set([
    "stationId",
    "model",
    "promptDigest",
    "inputDigest",
    "outputJson",
    "producedAt",
    "transport",
]);
const REPLAY_ENTRY_KEYS = new Set([
    "contractVersion",
    "createdAt",
    "replayKey",
    "inputDigest",
    "promptDigest",
    "envelope",
]);
const CACHE_KEYS = new Set(["contractVersion", "entries"]);
const CACHE_ENTRY_KEYS = new Set(["contentDigest", "modelId", "vector"]);
const LOCK_KEYS = new Set(["contractVersion", "createdAt", "generation", "pid"]);
function fail(message) {
    throw new TypeError(`Task Map community semantic evidence: ${message}`);
}
class UnsafeModelProvenanceError extends TypeError {
    constructor() {
        super("Task Map community semantic evidence: unsafe model provenance cannot cross the semantic persistence boundary");
        this.name = "UnsafeModelProvenanceError";
    }
}
function plain(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.size && actual.every((key) => keys.has(key));
}
function compareText(left, right) {
    const leftScalars = Array.from(left);
    const rightScalars = Array.from(right);
    const sharedLength = Math.min(leftScalars.length, rightScalars.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = leftScalars[index].codePointAt(0)
            - rightScalars[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftScalars.length - rightScalars.length;
}
function compareStringArrays(left, right) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = compareText(left[index], right[index]);
        if (difference !== 0)
            return difference;
    }
    return left.length - right.length;
}
function sanitizedText(value) {
    return value.trim().replace(/\s+/gu, " ");
}
function unsafePersistentNodeId(value) {
    const lower = value.toLowerCase();
    return value.includes("/")
        || value.includes("\\")
        || lower.startsWith("file:")
        || value === "."
        || value === ".."
        || /(?:^|[._:=\-\s])(?:api[._-]?key|access[._-]?token|refresh[._-]?token|token|bearer|credential|password|secret)(?:$|[._:=\-\s])/iu
            .test(value)
        || /^(?:sk-|gh[pousr]_|xox[baprs]-|aiza)/iu.test(value);
}
function validModel(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxModelCharacters
        && value === value.trim()
        && !CONTROL.test(value);
}
function assertSafeModelProvenance(value) {
    if (!validModel(value) || unsafePersistentNodeId(value)) {
        throw new UnsafeModelProvenanceError();
    }
}
function validLiveTransport(value) {
    return value === "claude-cli"
        || value === "codex-cli"
        || value === "cursor-cli"
        || value === "gemini-remote";
}
function validCalendarDate(year, month, day) {
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}
function validProducedAt(value) {
    const match = typeof value === "string" ? STRICT_RFC3339.exec(value) : null;
    if (match === null || !Number.isFinite(Date.parse(value)))
        return false;
    const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
    const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
    return validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
        && Number(match[4]) <= 23
        && Number(match[5]) <= 59
        && Number(match[6]) <= 59
        && offsetHour <= 23
        && offsetMinute <= 59;
}
function ratio(numerator, denominator) {
    return denominator === 0 ? 1 : numerator / denominator;
}
function pairCount(count) {
    return count < 2 ? 0 : count * (count - 1) / 2;
}
function normalizeNodes(nodes) {
    if (Array.isArray(nodes)) {
        for (const candidate of nodes) {
            if (plain(candidate)
                && typeof candidate.nodeId === "string"
                && unsafePersistentNodeId(candidate.nodeId)) {
                fail("unsafe node id cannot cross the semantic persistence boundary");
            }
        }
    }
    (0, community_graph_brain_js_1.buildTaskMapCommunityGraph)({ nodes });
    return nodes
        .map((candidate) => ({
        ...candidate,
        externalRefs: [...candidate.externalRefs].sort(compareText),
        embedding: candidate.embedding === null ? null : [...candidate.embedding],
    }))
        .sort((left, right) => compareText(left.nodeId, right.nodeId));
}
function groupingPrompt(nodes) {
    const boundedNodes = nodes.map((candidate) => ({
        nodeId: candidate.nodeId,
        text: sanitizedText(candidate.text),
    }));
    const inputDigest = (0, source_contracts_js_1.taskMapContractDigest)({ nodes: boundedNodes });
    const promptText = [
        "Group nodes by one durable workstream intent that can span repositories and weeks.",
        "Do not group nodes only because they share a repository, file, operational wrapper, or shared delivery medium.",
        "Keep concurrent product, fundraising, content, event, landing, partnership, and operations work distinct when their dominant intent differs.",
        "Leave ambiguous or genuinely multi-workstream nodes ungrouped instead of mixing themes.",
        "Return strict JSON with exactly this shape: {\"groups\":[{\"nodeIds\":[\"...\"]}]}",
        "Use each known nodeId at most once. Do not invent IDs or include prose.",
        (0, source_contracts_js_1.taskMapContractCanonicalJson)({ nodes: boundedNodes }),
    ].join("\n");
    return {
        inputDigest,
        promptText,
        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptText),
    };
}
function validateEnvelope(value, inputDigest, promptDigest, selectedTransport) {
    if (!plain(value) || !exactKeys(value, ENVELOPE_KEYS))
        return null;
    if (validModel(value.model) && unsafePersistentNodeId(value.model)) {
        throw new UnsafeModelProvenanceError();
    }
    if (value.stationId !== "community-grouping-v1"
        || value.inputDigest !== inputDigest
        || value.promptDigest !== promptDigest
        || !validModel(value.model)
        || typeof value.outputJson !== "string"
        || Buffer.byteLength(value.outputJson, "utf8")
            > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingOutputBytes
        || !validProducedAt(value.producedAt)
        || !validLiveTransport(value.transport)
        || (selectedTransport !== undefined && value.transport !== selectedTransport)) {
        return null;
    }
    return {
        stationId: "community-grouping-v1",
        model: value.model,
        promptDigest,
        inputDigest,
        outputJson: value.outputJson,
        producedAt: value.producedAt,
        transport: value.transport,
    };
}
function parseGroups(raw, knownNodeIds) {
    let parsed;
    try {
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(raw);
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!plain(parsed) || !exactKeys(parsed, GROUPING_OUTPUT_KEYS))
        return null;
    if (!Array.isArray(parsed.groups)
        || parsed.groups.length > community_graph_brain_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxSemanticGroups) {
        return null;
    }
    const globallySeen = new Set();
    const groups = [];
    let contaminatedGroupCount = 0;
    for (const candidate of parsed.groups) {
        if (!plain(candidate) || !exactKeys(candidate, GROUP_KEYS))
            return null;
        if (!Array.isArray(candidate.nodeIds)
            || candidate.nodeIds.length < 2
            || candidate.nodeIds.length
                > community_graph_brain_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxSemanticGroupMembers) {
            return null;
        }
        const members = [];
        let containsUnknownNode = false;
        for (const nodeId of candidate.nodeIds) {
            if (typeof nodeId !== "string") {
                return null;
            }
            if (!knownNodeIds.has(nodeId)) {
                containsUnknownNode = true;
                continue;
            }
            if (members.includes(nodeId) || globallySeen.has(nodeId))
                return null;
            globallySeen.add(nodeId);
            members.push(nodeId);
        }
        if (containsUnknownNode) {
            for (const nodeId of members)
                globallySeen.delete(nodeId);
            contaminatedGroupCount += 1;
            continue;
        }
        groups.push(members.sort(compareText));
    }
    if (groups.length === 0 && contaminatedGroupCount > 0)
        return null;
    return groups.sort(compareStringArrays);
}
function semanticGroups(members, envelope) {
    const sourceDigest = groupingSourceDigest(members, envelope);
    return members.map((memberNodeIds) => ({
        groupId: `tmsg_${(0, source_contracts_js_1.taskMapContractDigest)({ sourceDigest, memberNodeIds }).slice(0, 24)}`,
        source: "llm_grouping",
        sourceDigest,
        memberNodeIds: [...memberNodeIds],
    }));
}
function groupingSourceDigest(members, envelope) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        stationId: envelope.stationId,
        model: envelope.model,
        promptDigest: envelope.promptDigest,
        inputDigest: envelope.inputDigest,
        producedAt: envelope.producedAt,
        transport: envelope.transport,
        normalizedGroupsDigest: (0, source_contracts_js_1.taskMapContractDigest)({ groups: members }),
    });
}
function defaultTaskMapCommunityEmbeddingCachePath() {
    return node_path_1.default.join((0, node_os_1.homedir)(), ".daobrew", "cache", "taskmap-embeddings.json");
}
function defaultTaskMapCommunityGroupingReplayPath() {
    return node_path_1.default.join((0, node_os_1.homedir)(), ".daobrew", "cache", "taskmap-community-grouping-replay");
}
function storageNow(hooks) {
    const value = hooks?.now?.() ?? Date.now();
    if (!Number.isFinite(value) || value < 0) {
        throw new Error("private semantic storage clock is invalid");
    }
    return value;
}
function currentUid() {
    return typeof process.getuid === "function" ? process.getuid() : null;
}
function sameIdentity(left, right) {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.mode === right.mode
        && left.nlink === right.nlink
        && left.uid === right.uid
        && left.size === right.size
        && left.mtimeMs === right.mtimeMs
        && left.ctimeMs === right.ctimeMs;
}
function sameDirectoryIdentity(left, right) {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.mode === right.mode
        && left.uid === right.uid;
}
async function ownedAncestorDirectory(directory) {
    const metadata = await (0, promises_1.lstat)(directory);
    const uid = currentUid();
    if (!metadata.isDirectory()
        || metadata.isSymbolicLink()
        || (uid !== null && metadata.uid !== uid)) {
        throw new Error("private semantic storage directory is invalid");
    }
    return metadata;
}
async function ownedDirectory(directory) {
    const metadata = await ownedAncestorDirectory(directory);
    if ((metadata.mode & 0o777) !== 0o700) {
        throw new Error("private semantic storage directory is invalid");
    }
    return metadata;
}
async function ensureOwnedDirectory(directory) {
    try {
        return await ownedDirectory(directory);
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    const parent = node_path_1.default.dirname(directory);
    if (parent === directory) {
        throw new Error("private semantic storage directory is unavailable");
    }
    try {
        const parentMetadata = await ownedAncestorDirectory(parent);
        if ((parentMetadata.mode & 0o022) !== 0) {
            throw new Error("private semantic storage ancestor is writable");
        }
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        await ensureOwnedDirectory(parent);
    }
    try {
        await (0, promises_1.mkdir)(directory, { mode: 0o700 });
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
    }
    return ownedDirectory(directory);
}
async function parentChain(filePath) {
    const parentPath = node_path_1.default.dirname(filePath);
    return {
        parent: await ownedDirectory(parentPath),
        grandparent: await ownedDirectory(node_path_1.default.dirname(parentPath)),
    };
}
async function recheckParentChain(filePath, before) {
    const after = await parentChain(filePath);
    if (!sameDirectoryIdentity(before.parent, after.parent)
        || !sameDirectoryIdentity(before.grandparent, after.grandparent)) {
        throw new Error("private semantic storage directory changed");
    }
}
function validPrivateFile(metadata, maxBytes) {
    const uid = currentUid();
    return metadata.isFile()
        && !metadata.isSymbolicLink()
        && metadata.nlink === 1
        && (metadata.mode & 0o777) === 0o600
        && (uid === null || metadata.uid === uid)
        && metadata.size <= maxBytes;
}
async function readPrivateCanonicalJson(filePath, maxBytes, hooks) {
    let handle;
    try {
        const parents = await parentChain(filePath);
        handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat();
        if (!validPrivateFile(before, maxBytes))
            return null;
        await hooks?.afterOpen?.(filePath);
        const bytes = await handle.readFile();
        const after = await handle.stat();
        const current = await (0, promises_1.lstat)(filePath);
        await recheckParentChain(filePath, parents);
        if (bytes.length > maxBytes
            || !sameIdentity(before, after)
            || !sameIdentity(before, current)
            || !validPrivateFile(current, maxBytes)) {
            return null;
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(text);
        const value = JSON.parse(text);
        return (0, source_contracts_js_1.taskMapContractCanonicalJson)(value) === text ? value : null;
    }
    catch {
        return null;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function syncDirectory(directory, expected) {
    let handle;
    try {
        handle = await (0, promises_1.open)(directory, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY | node_fs_1.constants.O_NOFOLLOW);
        const metadata = await handle.stat();
        if (!sameDirectoryIdentity(expected, metadata)) {
            throw new Error("private semantic storage directory changed");
        }
        await handle.sync();
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function writePrivateCanonicalJson(filePath, value, maxBytes, hooks, replace = true) {
    const text = (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
        throw new RangeError("private semantic cache exceeds its byte budget");
    }
    const directory = node_path_1.default.dirname(filePath);
    await ensureOwnedDirectory(directory);
    const parents = await parentChain(filePath);
    let previous = null;
    try {
        previous = await (0, promises_1.lstat)(filePath);
        if (!replace || !validPrivateFile(previous, maxBytes)) {
            throw new Error("private semantic storage target is invalid");
        }
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    const tempPath = node_path_1.default.join(directory, `.${node_path_1.default.basename(filePath)}.${(0, node_crypto_1.randomBytes)(16).toString("hex")}.tmp`);
    let handle;
    try {
        handle = await (0, promises_1.open)(tempPath, node_fs_1.constants.O_WRONLY | node_fs_1.constants.O_CREAT | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(text, "utf8");
        await handle.sync();
        const tempMetadata = await handle.stat();
        if (!validPrivateFile(tempMetadata, maxBytes)) {
            throw new Error("private semantic storage temp file is invalid");
        }
        await handle.close();
        handle = undefined;
        await hooks?.beforeRename?.(filePath);
        await recheckParentChain(filePath, parents);
        try {
            const current = await (0, promises_1.lstat)(filePath);
            if (previous === null || !sameIdentity(previous, current)) {
                throw new Error("private semantic storage target changed");
            }
        }
        catch (error) {
            if (error.code !== "ENOENT" || previous !== null) {
                throw error;
            }
        }
        await (0, promises_1.rename)(tempPath, filePath);
        await syncDirectory(directory, parents.parent);
    }
    finally {
        await handle?.close().catch(() => undefined);
        await (0, promises_1.unlink)(tempPath).catch(() => undefined);
    }
}
function replayEntry(value) {
    if (!plain(value) || !exactKeys(value, REPLAY_ENTRY_KEYS))
        return null;
    if (value.contractVersion !== GROUPING_REPLAY_VERSION
        || !validProducedAt(value.createdAt)
        || typeof value.replayKey !== "string"
        || !SHA256.test(value.replayKey)
        || typeof value.inputDigest !== "string"
        || !SHA256.test(value.inputDigest)
        || typeof value.promptDigest !== "string"
        || !SHA256.test(value.promptDigest)) {
        return null;
    }
    const envelope = validateEnvelope(value.envelope, value.inputDigest, value.promptDigest);
    return envelope === null ? null : {
        contractVersion: GROUPING_REPLAY_VERSION,
        createdAt: value.createdAt,
        replayKey: value.replayKey,
        inputDigest: value.inputDigest,
        promptDigest: value.promptDigest,
        envelope,
    };
}
function replayEntryPath(directory, replayKey) {
    return node_path_1.default.join(directory, `${replayKey}.json`);
}
async function ensureReplayDirectory(directory) {
    await ensureOwnedDirectory(directory);
    await ownedDirectory(node_path_1.default.dirname(directory));
}
function replayLock(value) {
    if (!plain(value) || !exactKeys(value, LOCK_KEYS))
        return null;
    if (value.contractVersion !== REPLAY_CAPACITY_LOCK_VERSION
        || !validProducedAt(value.createdAt)
        || typeof value.generation !== "string"
        || !/^[a-f0-9]{32}$/.test(value.generation)
        || typeof value.pid !== "number"
        || !Number.isSafeInteger(value.pid)
        || value.pid <= 0) {
        return null;
    }
    return {
        contractVersion: REPLAY_CAPACITY_LOCK_VERSION,
        createdAt: value.createdAt,
        generation: value.generation,
        pid: value.pid,
    };
}
function pidAlive(pid, hooks) {
    if (hooks?.isPidAlive !== undefined)
        return hooks.isPidAlive(pid);
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return !(error instanceof Error
            && "code" in error
            && error.code === "ESRCH");
    }
}
async function quarantineReplayLock(directory, lockPath, expected, hooks) {
    await hooks?.beforeLockQuarantine?.(lockPath);
    const expectedGeneration = expected?.generation ?? "invalid";
    const quarantinePath = node_path_1.default.join(directory, `.capacity.lock.quarantine.${expectedGeneration}.${(0, node_crypto_1.randomBytes)(16).toString("hex")}`);
    try {
        await (0, promises_1.rename)(lockPath, quarantinePath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
    await hooks?.afterLockQuarantined?.(quarantinePath);
    const quarantined = replayLock(await readPrivateCanonicalJson(quarantinePath, 1_024, hooks));
    const matches = expected === null
        ? quarantined === null
        : quarantined !== null
            && quarantined.generation === expected.generation
            && quarantined.pid === expected.pid
            && quarantined.createdAt === expected.createdAt;
    if (matches) {
        await (0, promises_1.unlink)(quarantinePath).catch(() => undefined);
        await syncDirectory(directory, await ownedDirectory(directory));
        return true;
    }
    try {
        await (0, promises_1.lstat)(lockPath);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            await (0, promises_1.rename)(quarantinePath, lockPath).catch(() => undefined);
            await syncDirectory(directory, await ownedDirectory(directory))
                .catch(() => undefined);
        }
    }
    return false;
}
async function cleanupStaleLockQuarantines(directory, hooks) {
    const now = storageNow(hooks);
    let changed = false;
    let live = false;
    for (const name of await (0, promises_1.readdir)(directory)) {
        if (!/^\.capacity\.lock\.quarantine\.(?:[a-f0-9]{32}|invalid)\.[a-f0-9]{32}$/.test(name)) {
            continue;
        }
        const quarantinePath = node_path_1.default.join(directory, name);
        const owner = replayLock(await readPrivateCanonicalJson(quarantinePath, 1_024, hooks));
        if (owner === null)
            continue;
        const createdAtMs = Date.parse(owner.createdAt);
        if (!pidAlive(owner.pid, hooks)
            || createdAtMs > now
                + exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayFutureToleranceMs
            || now - createdAtMs
                > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockLeaseMs) {
            await (0, promises_1.unlink)(quarantinePath).catch(() => undefined);
            changed = true;
        }
        else {
            live = true;
        }
    }
    if (changed) {
        await syncDirectory(directory, await ownedDirectory(directory));
    }
    return live;
}
async function createReplayLockClaim(directory, lockPath, owner) {
    const text = (0, source_contracts_js_1.taskMapContractCanonicalJson)(owner);
    let handle;
    try {
        handle = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_WRONLY | node_fs_1.constants.O_CREAT | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(text, "utf8");
        await handle.sync();
        const metadata = await handle.stat();
        if (!validPrivateFile(metadata, 1_024)) {
            throw new Error("private replay capacity lease is invalid");
        }
        await handle.close();
        handle = undefined;
        await syncDirectory(directory, await ownedDirectory(directory));
    }
    catch (error) {
        await handle?.close().catch(() => undefined);
        throw error;
    }
}
async function acquireReplayCapacityLock(directory, hooks) {
    const lockPath = node_path_1.default.join(directory, ".capacity.lock");
    for (let attempt = 0; attempt < (hooks?.lockRetryCount
        ?? exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockRetryCount); attempt += 1) {
        const liveBefore = await cleanupStaleLockQuarantines(directory, hooks)
            .catch(() => false);
        if (liveBefore) {
            await hooks?.onLockRetry?.(attempt, lockPath);
            await new Promise((resolve) => setTimeout(resolve, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockRetryDelayMs));
            continue;
        }
        const owner = {
            contractVersion: REPLAY_CAPACITY_LOCK_VERSION,
            createdAt: new Date(storageNow(hooks)).toISOString(),
            generation: (0, node_crypto_1.randomBytes)(16).toString("hex"),
            pid: process.pid,
        };
        try {
            await createReplayLockClaim(directory, lockPath, owner);
            const liveAfter = await cleanupStaleLockQuarantines(directory, hooks)
                .catch(() => false);
            if (liveAfter) {
                await quarantineReplayLock(directory, lockPath, owner, hooks)
                    .catch(() => undefined);
                await hooks?.onLockRetry?.(attempt, lockPath);
                await new Promise((resolve) => setTimeout(resolve, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockRetryDelayMs));
                continue;
            }
            try {
                await hooks?.afterLockAcquired?.(owner);
            }
            catch (error) {
                await quarantineReplayLock(directory, lockPath, owner, hooks)
                    .catch(() => undefined);
                throw error;
            }
            return {
                release: async () => {
                    await quarantineReplayLock(directory, lockPath, owner, hooks)
                        .catch(() => undefined);
                },
            };
        }
        catch {
            const current = replayLock(await readPrivateCanonicalJson(lockPath, 1_024, hooks));
            const now = storageNow(hooks);
            const createdAtMs = current === null ? Number.NEGATIVE_INFINITY : Date.parse(current.createdAt);
            const recoverable = current === null
                || !pidAlive(current.pid, hooks)
                || createdAtMs > now
                    + exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayFutureToleranceMs
                || now - createdAtMs
                    > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockLeaseMs;
            if (recoverable) {
                await quarantineReplayLock(directory, lockPath, current, hooks)
                    .catch(() => undefined);
                continue;
            }
            await hooks?.onLockRetry?.(attempt, lockPath);
            await new Promise((resolve) => setTimeout(resolve, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayLockRetryDelayMs));
        }
    }
    throw new Error("private replay capacity lease is unavailable");
}
async function replayCapacity(directory) {
    let count = 0;
    let bytes = 0;
    const entries = [];
    for (const name of await (0, promises_1.readdir)(directory)) {
        if (!/^[a-f0-9]{64}\.json$/.test(name))
            continue;
        const filePath = node_path_1.default.join(directory, name);
        const metadata = await (0, promises_1.lstat)(filePath);
        if (!validPrivateFile(metadata, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes)) {
            throw new Error("private replay entry is invalid");
        }
        count += 1;
        bytes += metadata.size;
        const parsed = replayEntry(await readPrivateCanonicalJson(filePath, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes));
        if (parsed === null || parsed.replayKey !== name.slice(0, -".json".length)) {
            throw new Error("private replay entry is invalid");
        }
        entries.push({
            filePath,
            replayKey: name.slice(0, -".json".length),
            bytes: metadata.size,
            createdAtMs: Date.parse(parsed.createdAt),
        });
    }
    return {
        count,
        bytes,
        entries: entries.sort((left, right) => compareText(left.replayKey, right.replayKey)),
    };
}
async function loadReplayEnvelope(directory, replayKey, inputDigest, promptDigest, hooks) {
    const value = await readPrivateCanonicalJson(replayEntryPath(directory, replayKey), exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes, hooks);
    const entry = replayEntry(value);
    return entry !== null
        && entry.replayKey === replayKey
        && entry.inputDigest === inputDigest
        && entry.promptDigest === promptDigest
        && Date.parse(entry.createdAt) <= storageNow(hooks)
            + exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayFutureToleranceMs
        ? entry.envelope
        : null;
}
async function storeReplayEnvelope(directory, entry, hooks) {
    await ensureReplayDirectory(directory);
    const lock = await acquireReplayCapacityLock(directory, hooks);
    try {
        const now = storageNow(hooks);
        const filePath = replayEntryPath(directory, entry.replayKey);
        const existing = replayEntry(await readPrivateCanonicalJson(filePath, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes, hooks));
        if (existing !== null
            && Date.parse(existing.createdAt) <= now
                + exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayFutureToleranceMs) {
            return;
        }
        if (existing !== null) {
            await (0, promises_1.unlink)(filePath);
        }
        await writePrivateCanonicalJson(filePath, entry, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes, hooks, false);
        const capacity = await replayCapacity(directory);
        const futureAfter = now
            + exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayFutureToleranceMs;
        const protectedAfter = now
            - exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.groupingReplayGraceMs;
        const evictionOrder = () => capacity.entries
            .filter((candidate) => candidate.replayKey !== entry.replayKey)
            .sort((left, right) => {
            const leftFuture = left.createdAtMs > futureAfter;
            const rightFuture = right.createdAtMs > futureAfter;
            if (leftFuture !== rightFuture)
                return leftFuture ? -1 : 1;
            const leftRecent = left.createdAtMs >= protectedAfter && !leftFuture;
            const rightRecent = right.createdAtMs >= protectedAfter && !rightFuture;
            if (leftRecent !== rightRecent)
                return leftRecent ? 1 : -1;
            if (left.createdAtMs !== right.createdAtMs) {
                return left.createdAtMs - right.createdAtMs;
            }
            return compareText(right.replayKey, left.replayKey);
        });
        for (const future of evictionOrder().filter((candidate) => candidate.createdAtMs > futureAfter)) {
            await (0, promises_1.unlink)(future.filePath);
            capacity.entries.splice(capacity.entries.indexOf(future), 1);
            capacity.count -= 1;
            capacity.bytes -= future.bytes;
        }
        while (capacity.count
            > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries
            || capacity.bytes
                > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayBytes) {
            const evicted = evictionOrder()[0];
            if (evicted === undefined) {
                await (0, promises_1.unlink)(filePath).catch(() => undefined);
                throw new Error("current replay entry exceeds bounded capacity");
            }
            await (0, promises_1.unlink)(evicted.filePath);
            capacity.entries.splice(capacity.entries.indexOf(evicted), 1);
            capacity.count -= 1;
            capacity.bytes -= evicted.bytes;
        }
        await syncDirectory(directory, await ownedDirectory(directory));
    }
    finally {
        await lock.release();
    }
}
function validVector(value) {
    if (!Array.isArray(value)
        || value.length !== community_graph_brain_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions) {
        return false;
    }
    let sumSquares = 0;
    for (const coordinate of value) {
        if (typeof coordinate !== "number" || !Number.isFinite(coordinate)) {
            return false;
        }
        sumSquares += coordinate * coordinate;
    }
    return Number.isFinite(sumSquares) && sumSquares > 0;
}
function cacheEntries(value) {
    if (!plain(value) || !exactKeys(value, CACHE_KEYS))
        return [];
    if (value.contractVersion !== EMBEDDING_CACHE_VERSION
        || !Array.isArray(value.entries)
        || value.entries.length
            > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheEntries) {
        return [];
    }
    const entries = [];
    const keys = new Set();
    for (const candidate of value.entries) {
        if (!plain(candidate) || !exactKeys(candidate, CACHE_ENTRY_KEYS))
            return [];
        if (typeof candidate.contentDigest !== "string"
            || !SHA256.test(candidate.contentDigest)
            || !validModel(candidate.modelId)
            || unsafePersistentNodeId(candidate.modelId)
            || !validVector(candidate.vector)) {
            return [];
        }
        const key = `${candidate.modelId}\u0000${candidate.contentDigest}`;
        if (keys.has(key))
            return [];
        keys.add(key);
        entries.push({
            contentDigest: candidate.contentDigest,
            modelId: candidate.modelId,
            vector: [...candidate.vector],
        });
    }
    return entries.sort((left, right) => compareText(`${left.modelId}\u0000${left.contentDigest}`, `${right.modelId}\u0000${right.contentDigest}`));
}
async function loadEmbeddingCache(filePath, hooks) {
    return cacheEntries(await readPrivateCanonicalJson(filePath, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheBytes, hooks));
}
/** Concurrent cache merges are best-effort; immutable content keys prevent misbinding. */
async function storeEmbeddingCache(filePath, existing, additions, hooks) {
    const additionKeys = new Set(additions.map((entry) => `${entry.modelId}\u0000${entry.contentDigest}`));
    const entryKey = (entry) => `${entry.modelId}\u0000${entry.contentDigest}`;
    const preferred = [
        [...additions].sort((left, right) => compareText(entryKey(left), entryKey(right))),
        existing
            .filter((entry) => !additionKeys.has(entryKey(entry)))
            .sort((left, right) => compareText(entryKey(left), entryKey(right))),
    ].flat();
    const unique = new Map();
    for (const entry of preferred) {
        const key = entryKey(entry);
        if (!unique.has(key))
            unique.set(key, entry);
    }
    const emptyCacheBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)({
        contractVersion: EMBEDDING_CACHE_VERSION,
        entries: [],
    }), "utf8");
    const selected = [];
    let selectedBytes = emptyCacheBytes;
    for (const entry of unique.values()) {
        if (selected.length
            >= exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheEntries) {
            break;
        }
        const entryBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(entry), "utf8");
        const incrementalBytes = entryBytes + (selected.length === 0 ? 0 : 1);
        if (selectedBytes + incrementalBytes
            > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheBytes) {
            continue;
        }
        selected.push(entry);
        selectedBytes += incrementalBytes;
    }
    const entries = selected.sort((left, right) => compareText(entryKey(left), entryKey(right)));
    await writePrivateCanonicalJson(filePath, { contractVersion: EMBEDDING_CACHE_VERSION, entries }, exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheBytes, hooks);
}
async function hydrateEmbeddings(nodes, provider, modelId, cachePath, hooks, signal) {
    if (provider !== undefined && provider !== null && !validModel(modelId)) {
        fail("embedding provider requires bounded model provenance");
    }
    if (signal?.aborted)
        fail("embedding hydration aborted");
    if (modelId !== undefined && modelId !== null && !validModel(modelId)) {
        fail("embedding model provenance is invalid");
    }
    if (modelId === undefined || modelId === null) {
        return {
            nodes: nodes.map((candidate) => ({
                ...candidate,
                externalRefs: [...candidate.externalRefs],
                embedding: candidate.embedding === null ? null : [...candidate.embedding],
            })),
            state: "not_requested",
            modelId: null,
            hits: 0,
            misses: 0,
        };
    }
    const entries = await loadEmbeddingCache(cachePath, hooks);
    const byKey = new Map(entries.map((entry) => [
        `${entry.modelId}\u0000${entry.contentDigest}`,
        entry,
    ]));
    const descriptors = nodes.map((candidate) => ({
        node: candidate,
        text: sanitizedText(candidate.text),
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)({ text: sanitizedText(candidate.text) }),
    }));
    const vectors = new Map();
    const misses = [];
    let hits = 0;
    for (const descriptor of descriptors) {
        const entry = byKey.get(`${modelId}\u0000${descriptor.contentDigest}`);
        if (entry === undefined) {
            misses.push(descriptor);
        }
        else {
            hits += 1;
            vectors.set(descriptor.node.nodeId, [...entry.vector]);
        }
    }
    let providerFailed = false;
    const uniqueMisses = new Map();
    for (const descriptor of misses) {
        if (!uniqueMisses.has(descriptor.contentDigest)) {
            uniqueMisses.set(descriptor.contentDigest, descriptor);
        }
    }
    const missBatch = [...uniqueMisses.values()];
    const additions = [];
    if (misses.length > 0 && provider !== undefined && provider !== null) {
        try {
            const embedded = await provider.embed(missBatch.map((descriptor) => descriptor.text), { signal });
            if (signal?.aborted)
                fail("embedding hydration aborted");
            if (!Array.isArray(embedded)
                || embedded.length !== missBatch.length
                || embedded.some((candidate) => !validVector(candidate))) {
                providerFailed = true;
            }
            else {
                const vectorsByDigest = new Map();
                for (let index = 0; index < missBatch.length; index += 1) {
                    const descriptor = missBatch[index];
                    const candidate = embedded[index];
                    const cloned = [...candidate];
                    vectorsByDigest.set(descriptor.contentDigest, cloned);
                    additions.push({
                        contentDigest: descriptor.contentDigest,
                        modelId,
                        vector: cloned,
                    });
                }
                for (const descriptor of misses) {
                    const vector = vectorsByDigest.get(descriptor.contentDigest);
                    vectors.set(descriptor.node.nodeId, [...vector]);
                }
            }
        }
        catch {
            providerFailed = true;
        }
    }
    else if (misses.length > 0) {
        providerFailed = true;
    }
    if (additions.length > 0) {
        if (signal?.aborted)
            fail("embedding hydration aborted");
        await storeEmbeddingCache(cachePath, entries, additions, hooks)
            .catch(() => undefined);
    }
    const hydrated = nodes.map((candidate) => ({
        ...candidate,
        externalRefs: [...candidate.externalRefs],
        embedding: vectors.get(candidate.nodeId) ?? null,
    }));
    const embeddedCount = hydrated.filter((candidate) => candidate.embedding !== null).length;
    const state = embeddedCount === nodes.length
        ? "available"
        : embeddedCount > 0
            ? "partial"
            : providerFailed || nodes.length > 0
                ? "unavailable"
                : "available";
    return {
        nodes: hydrated,
        state,
        modelId,
        hits,
        misses: misses.length,
    };
}
function semanticPairCoverage(nodes, groups) {
    const covered = new Set();
    let groupingPairCount = 0;
    for (const group of groups) {
        groupingPairCount += pairCount(group.memberNodeIds.length);
        for (let left = 0; left < group.memberNodeIds.length; left += 1) {
            for (let right = left + 1; right < group.memberNodeIds.length; right += 1) {
                covered.add(`${group.memberNodeIds[left]}\u0000${group.memberNodeIds[right]}`);
            }
        }
    }
    const embedded = nodes
        .filter((candidate) => candidate.embedding !== null)
        .map((candidate) => candidate.nodeId)
        .sort(compareText);
    for (let left = 0; left < embedded.length; left += 1) {
        for (let right = left + 1; right < embedded.length; right += 1) {
            covered.add(`${embedded[left]}\u0000${embedded[right]}`);
        }
    }
    const totalPairCount = pairCount(nodes.length);
    return {
        totalPairCount,
        groupingPairCount,
        embeddingPairCount: pairCount(embedded.length),
        coveredPairCount: covered.size,
        ratio: ratio(covered.size, totalPairCount),
    };
}
async function buildTaskMapCommunitySemanticEvidence(input) {
    const assertNotAborted = () => {
        if (input.signal?.aborted)
            fail("semantic evidence aborted");
    };
    assertNotAborted();
    if (!plain(input))
        fail("input must be a plain object");
    const nodes = normalizeNodes(input.nodes);
    if (input.station !== undefined && input.station !== null) {
        assertSafeModelProvenance(input.station.provider.model);
    }
    if (input.embeddingModelId !== undefined && input.embeddingModelId !== null) {
        assertSafeModelProvenance(input.embeddingModelId);
    }
    const overallInputDigest = (0, source_contracts_js_1.taskMapContractDigest)({ nodes });
    const prompt = groupingPrompt(nodes);
    const replayPath = input.groupingReplayPath
        ?? defaultTaskMapCommunityGroupingReplayPath();
    const cachePath = input.embeddingCachePath
        ?? defaultTaskMapCommunityEmbeddingCachePath();
    const knownNodeIds = new Set(nodes.map((candidate) => candidate.nodeId));
    const replayKey = (0, source_contracts_js_1.taskMapContractDigest)({
        inputDigest: prompt.inputDigest,
        promptDigest: prompt.promptDigest,
    });
    let envelope = null;
    let members = null;
    let unavailableReason = null;
    if (Buffer.byteLength(prompt.promptText, "utf8")
        > exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxPromptBytes) {
        unavailableReason = "prompt_limit_exceeded";
    }
    else {
        envelope = await loadReplayEnvelope(replayPath, replayKey, prompt.inputDigest, prompt.promptDigest, input.storageHooksForTesting);
        if (envelope !== null) {
            members = parseGroups(envelope.outputJson, knownNodeIds);
            if (members === null)
                envelope = null;
        }
        if (envelope === null && input.station !== undefined && input.station !== null) {
            try {
                const returned = await input.station.run({
                    stationId: "community-grouping-v1",
                    promptText: prompt.promptText,
                    inputDigest: prompt.inputDigest,
                    signal: input.signal,
                });
                assertNotAborted();
                envelope = validateEnvelope(returned, prompt.inputDigest, prompt.promptDigest, input.station.provider.transport);
                if (envelope === null) {
                    unavailableReason = "invalid_envelope";
                }
                else {
                    members = parseGroups(envelope.outputJson, knownNodeIds);
                    if (members === null) {
                        unavailableReason = "invalid_output";
                        envelope = null;
                    }
                }
            }
            catch (error) {
                if (error instanceof UnsafeModelProvenanceError)
                    throw error;
                unavailableReason = "station_failure";
                envelope = null;
            }
            if (envelope !== null && members !== null) {
                assertNotAborted();
                await storeReplayEnvelope(replayPath, {
                    contractVersion: GROUPING_REPLAY_VERSION,
                    createdAt: new Date(storageNow(input.storageHooksForTesting)).toISOString(),
                    replayKey,
                    inputDigest: prompt.inputDigest,
                    promptDigest: prompt.promptDigest,
                    envelope,
                }, input.storageHooksForTesting).catch(() => undefined);
            }
        }
        else if (envelope === null && unavailableReason === null) {
            unavailableReason = "no_station";
        }
    }
    const groups = envelope === null || members === null
        ? []
        : semanticGroups(members, envelope);
    const embedding = await hydrateEmbeddings(nodes, input.embeddingProvider, input.embeddingModelId, cachePath, input.storageHooksForTesting, input.signal);
    assertNotAborted();
    (0, community_graph_brain_js_1.buildTaskMapCommunityGraph)({ nodes: embedding.nodes, semanticGroups: groups });
    const groupedNodeCount = groups.reduce((total, group) => total + group.memberNodeIds.length, 0);
    const embeddedNodeCount = embedding.nodes.filter((candidate) => candidate.embedding !== null).length;
    const sourceDigest = groups[0]?.sourceDigest ?? (envelope === null
        ? null
        : groupingSourceDigest(members ?? [], envelope));
    const reportCore = {
        contractVersion: exports.TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_VERSION,
        inputDigest: overallInputDigest,
        grouping: {
            state: envelope === null ? "unavailable" : "available",
            unavailableReason: envelope === null ? unavailableReason ?? "no_station" : null,
            stationId: "community-grouping-v1",
            providerId: envelope?.transport ?? null,
            modelId: envelope?.model ?? null,
            transport: envelope?.transport ?? null,
            promptDigest: prompt.promptDigest,
            sourceDigest,
            producedAt: envelope?.producedAt ?? null,
        },
        groupingCoverage: {
            groupedNodeCount,
            totalNodeCount: nodes.length,
            ratio: ratio(groupedNodeCount, nodes.length),
        },
        embedding: {
            state: embedding.state,
            modelId: embedding.modelId,
            coverage: {
                embeddedNodeCount,
                totalNodeCount: nodes.length,
                ratio: ratio(embeddedNodeCount, nodes.length),
            },
        },
        semanticEdgeCoverage: semanticPairCoverage(embedding.nodes, groups),
        cache: {
            hits: embedding.hits,
            misses: embedding.misses,
        },
        authority: {
            graphMutated: false,
            nodesMerged: false,
            acceptanceGranted: false,
        },
        privacy: {
            sourceTextsPersisted: false,
            credentialsPersisted: false,
            localPathsPersisted: false,
        },
    };
    const report = {
        ...reportCore,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(reportCore),
    };
    const output = {
        nodes: embedding.nodes,
        semanticGroups: groups,
        report,
    };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(output), "utf8")
        > community_graph_brain_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOutputBytes) {
        fail("output exceeds the A1 byte budget");
    }
    return output;
}
