"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_WORK_CONTROL_POLICY_DIGEST = exports.TASKMAP_WORK_CONTROL_POLICY_V1 = exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER = exports.TASKMAP_WORK_CONTROL_LIMITS_V1 = exports.TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE = exports.TASKMAP_WORK_CONTROL_POLICY_VERSION = exports.TASKMAP_WORK_CONTROL_DECISION_VERSION = void 0;
exports.unsafeSelectedTaskMapWorkControlEntryIdForTest = unsafeSelectedTaskMapWorkControlEntryIdForTest;
exports.rankAcceptedOpenProjectionTasks = rankAcceptedOpenProjectionTasks;
exports.buildTaskMapWorkControlDecision = buildTaskMapWorkControlDecision;
exports.unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest = unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest;
exports.unsafeExerciseTaskMapWorkControlRootReceiptForTest = unsafeExerciseTaskMapWorkControlRootReceiptForTest;
exports.unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest = unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest;
exports.assertTaskMapWorkControlDecision = assertTaskMapWorkControlDecision;
exports.taskMapWorkControlDecisionCanonicalBytes = taskMapWorkControlDecisionCanonicalBytes;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const identity_dedupe_projection_js_1 = require("./identity-dedupe-projection.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_WORK_CONTROL_DECISION_VERSION = "taskmap-work-control-decision.v1";
exports.TASKMAP_WORK_CONTROL_POLICY_VERSION = "taskmap-work-control-policy.1";
/**
 * P10.3a is intentionally a read-only decision seam. Candidate evidence is
 * not present in the authenticated P10.2 v1 sidecar, so this contract cannot
 * manufacture REVIEW NEXT rows.
 */
exports.TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE = "unavailable_in_p10_2_v1";
exports.TASKMAP_WORK_CONTROL_LIMITS_V1 = Object.freeze({
    maxCanonicalInputBytes: 12 * 1024 * 1024,
    maxCanonicalArtifactBytes: 4 * 1024 * 1024,
    maxNodes: 100_000,
    maxDescriptors: 100_000,
    maxDepth: 32,
    maxObjectKeys: 128,
    maxArrayLength: 8_192,
    maxStringLength: 4_096,
    maxWorks: 2_048,
    maxRelations: 8_192,
});
exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER = Object.freeze([
    "sourcePriority",
    "deadlinePressure",
    "dependencyImpact",
    "recurrence",
    "staleOpen",
    "evidenceStrength",
    "bodyBonus",
]);
const RANK_REASON_BY_FACTOR = Object.freeze({
    sourcePriority: "source_priority",
    deadlinePressure: "deadline_pressure",
    dependencyImpact: "dependency_impact",
    recurrence: "recurrence",
    staleOpen: "stale_open",
    evidenceStrength: "evidence_strength",
    bodyBonus: "body_context_not_causal",
});
exports.TASKMAP_WORK_CONTROL_POLICY_V1 = Object.freeze({
    contractVersion: exports.TASKMAP_WORK_CONTROL_POLICY_VERSION,
    scoreScale: "integer_basis_points",
    rounding: "nearest_integer_half_up",
    scoreCapBasisPoints: 10_000,
    bodyBonusCapBasisPoints: 800,
    dependencyCountCap: 3,
    weightsBasisPoints: Object.freeze({
        sourcePriority: 2_500,
        deadlinePressure: 2_500,
        dependencyImpact: 1_500,
        recurrence: 1_500,
        staleOpen: 1_000,
        evidenceStrength: 1_000,
    }),
    legacyProjectionTotal: "ignored",
    canonicalAliasRank: "highest_recomputed_whole_row_then_code_point_task_id_then_row_digest",
    dependencyImpact: "recomputed_from_validated_normalized_dag",
    dependencyDirection: Object.freeze({
        depends_on: "B_to_A_for_A_depends_on_B",
        blocks: "A_to_B_for_A_blocks_B",
        supersedes: "lifecycle_only_excluded_from_execution_dag",
    }),
    tieBreak: "score_desc_then_code_point_work_id",
    candidateCoverage: exports.TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
});
const SHA256 = /^[a-f0-9]{64}$/;
const FIXED_GENERATION = /^[0-9]{20}$/;
const HASHED_IDS = Object.freeze({
    decision: /^tmworkcontroldecision_[a-f0-9]{64}$/,
    entry: /^tmidentityentry_[a-f0-9]{64}$/,
    currentRef: /^tmrefreshcurrent_[a-f0-9]{64}$/,
    sidecar: /^tmidentityprojection_[a-f0-9]{64}$/,
    work: /^tmwork_[a-f0-9]{64}$/,
    projectionRef: /^tmprojectionref_[a-f0-9]{64}$/,
    projectionRun: /^tmrun_[a-f0-9]{16}$/,
    projectionTask: /^tm[ct]_[a-f0-9]{16}$/,
    projectionRoot: /^tmr_[a-f0-9]{16}$/,
    projectionEdge: /^tme_[a-f0-9]{16}$/,
});
const CONTROL_RELATIONS = new Set([
    "depends_on",
    "blocks",
    "supersedes",
]);
const TERMINAL_OPEN_STATES = new Set(["completed", "superseded"]);
const LIFECYCLE_DECISIONS = new Set([
    "accepted_open",
    "source_complete",
    "superseded",
    "rejected",
]);
const PROJECTION_RELATIONS = new Set([
    "advances",
    "depends_on",
    "blocks",
    "informed_by",
    "related_to",
    "supersedes",
    "body_context_for",
]);
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const STRUCTURED_CLONE = structuredClone;
const JSON_STRINGIFY = JSON.stringify;
const ARRAY_IS_ARRAY = Array.isArray;
exports.TASKMAP_WORK_CONTROL_POLICY_DIGEST = digestCanonical(exports.TASKMAP_WORK_CONTROL_POLICY_V1);
const ARRAY_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Array.prototype);
const OBJECT_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Object.prototype);
const SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Set.prototype);
const MAP_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Map.prototype);
const WEAK_SET_PROTOTYPE_DESCRIPTORS = snapshotPrototype(WeakSet.prototype);
function fail(message) {
    throw new Error(`P10.3a work-control decision: ${message}`);
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function rootContains(parent, child) {
    const relative = node_path_1.default.relative(parent, child);
    return relative === ""
        || (relative !== ".."
            && !relative.startsWith(`..${node_path_1.default.sep}`)
            && !node_path_1.default.isAbsolute(relative));
}
async function closeHeldRoots(roots) {
    await Promise.all(roots.map(async (root) => {
        try {
            await root.handle.close();
        }
        catch {
            // A prior validation error remains authoritative. Closed/invalid held
            // descriptors are also detected by the final receipt check.
        }
    }));
}
async function holdTaskMapWorkControlRoots(roots) {
    const held = [];
    try {
        for (const label of [
            "currentRoot",
            "runRoot",
            "sidecarRoot",
        ]) {
            const requestedPath = roots[label];
            if (!node_path_1.default.isAbsolute(requestedPath)) {
                fail(`${label} must be an absolute path`);
            }
            const resolvedPath = node_path_1.default.resolve(requestedPath);
            const canonicalPath = await (0, promises_1.realpath)(resolvedPath);
            const before = await (0, promises_1.lstat)(canonicalPath, { bigint: true });
            const currentUid = process.getuid?.();
            if (canonicalPath !== resolvedPath
                || !before.isDirectory()
                || currentUid === undefined
                || before.uid !== BigInt(currentUid)
                || (before.mode & 4095n) !== 448n) {
                fail(`${label} must be a canonical current-user 0700 directory`);
            }
            const handle = await (0, promises_1.open)(canonicalPath, node_fs_1.constants.O_RDONLY
                | (node_fs_1.constants.O_DIRECTORY ?? 0)
                | (node_fs_1.constants.O_NOFOLLOW ?? 0));
            held.push({
                label,
                requestedPath,
                canonicalPath,
                handle,
                dev: before.dev,
                ino: before.ino,
                uid: before.uid,
                mode: before.mode & 4095n,
            });
            const opened = await handle.stat({ bigint: true });
            if (!opened.isDirectory()
                || opened.dev !== before.dev
                || opened.ino !== before.ino
                || opened.uid !== before.uid
                || (opened.mode & 4095n) !== (before.mode & 4095n)) {
                fail(`${label} changed while its root receipt was opened`);
            }
        }
        for (let left = 0; left < held.length; left += 1) {
            for (let right = left + 1; right < held.length; right += 1) {
                const a = held[left];
                const b = held[right];
                if (rootContains(a.canonicalPath, b.canonicalPath)
                    || rootContains(b.canonicalPath, a.canonicalPath)
                    || (a.dev === b.dev && a.ino === b.ino)) {
                    fail(`${a.label} and ${b.label} are not disjoint roots`);
                }
            }
        }
        return held;
    }
    catch (error) {
        await closeHeldRoots(held);
        if (error instanceof Error
            && error.message.startsWith("P10.3a work-control decision:")) {
            throw error;
        }
        fail("task-map store roots are unavailable for the spanning receipt");
    }
}
function revalidateHeldTaskMapWorkControlRootsSync(held) {
    for (const root of held) {
        let canonicalPath;
        try {
            canonicalPath = (0, node_fs_1.realpathSync)(node_path_1.default.resolve(root.requestedPath));
        }
        catch {
            fail(`${root.label} disappeared during the spanning root receipt`);
        }
        const current = (0, node_fs_1.lstatSync)(canonicalPath, { bigint: true });
        const opened = (0, node_fs_1.fstatSync)(root.handle.fd, { bigint: true });
        if (canonicalPath !== root.canonicalPath
            || !current.isDirectory()
            || !opened.isDirectory()
            || current.dev !== root.dev
            || current.ino !== root.ino
            || current.uid !== root.uid
            || (current.mode & 4095n) !== root.mode
            || opened.dev !== root.dev
            || opened.ino !== root.ino
            || opened.uid !== root.uid
            || (opened.mode & 4095n) !== root.mode
            || opened.nlink === 0n) {
            fail(`${root.label} was replaced during the spanning root receipt`);
        }
    }
}
function snapshotPrototype(prototype) {
    return Object.freeze(REFLECT_OWN_KEYS(prototype).map((key) => ({
        key,
        descriptor: {
            ...GET_OWN_PROPERTY_DESCRIPTOR(prototype, key),
        },
    })));
}
function sameDescriptor(left, right) {
    return left !== undefined
        && left.configurable === right.configurable
        && left.enumerable === right.enumerable
        && left.writable === right.writable
        && left.value === right.value
        && left.get === right.get
        && left.set === right.set;
}
function assertPrototypeIntegrity(prototype, expected, label) {
    const keys = REFLECT_OWN_KEYS(prototype);
    if (keys.length !== expected.length) {
        fail(`${label} prototype changed during validation`);
    }
    for (let index = 0; index < expected.length; index += 1) {
        const row = expected[index];
        if (keys[index] !== row.key
            || !sameDescriptor(GET_OWN_PROPERTY_DESCRIPTOR(prototype, row.key), row.descriptor)) {
            fail(`${label} prototype changed during validation`);
        }
    }
}
function assertRuntimeIntegrity() {
    assertPrototypeIntegrity(Array.prototype, ARRAY_PROTOTYPE_DESCRIPTORS, "Array");
    assertPrototypeIntegrity(Object.prototype, OBJECT_PROTOTYPE_DESCRIPTORS, "Object");
    assertPrototypeIntegrity(Set.prototype, SET_PROTOTYPE_DESCRIPTORS, "Set");
    assertPrototypeIntegrity(Map.prototype, MAP_PROTOTYPE_DESCRIPTORS, "Map");
    assertPrototypeIntegrity(WeakSet.prototype, WEAK_SET_PROTOTYPE_DESCRIPTORS, "WeakSet");
}
function addPrecloneBytes(state, bytes, label) {
    state.bytes += bytes;
    if (state.bytes > state.byteLimit) {
        fail(`${label} exceeds the pre-clone byte ceiling`);
    }
}
function countNode(state, label) {
    state.nodes += 1;
    if (state.nodes > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxNodes) {
        fail(`${label} exceeds the pre-clone node ceiling`);
    }
}
function countDescriptor(state, label) {
    state.descriptors += 1;
    if (state.descriptors
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxDescriptors) {
        fail(`${label} exceeds the pre-clone descriptor ceiling`);
    }
}
function chargeOwnDescriptor(state, key, label) {
    countDescriptor(state, label);
    if (key.length > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxStringLength) {
        fail(`${label} contains an oversized object key`);
    }
    addPrecloneBytes(state, Buffer.byteLength(JSON_STRINGIFY(key), "utf8") + 1, label);
}
function preflightJson(value, label, state, depth = 0) {
    if (depth > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxDepth) {
        fail(`${label} exceeds the pre-clone depth ceiling`);
    }
    countNode(state, label);
    if (value === null) {
        addPrecloneBytes(state, 4, label);
        return;
    }
    if (typeof value === "string") {
        if (value.length > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxStringLength) {
            fail(`${label} exceeds the string ceiling`);
        }
        addPrecloneBytes(state, Buffer.byteLength(JSON_STRINGIFY(value), "utf8"), label);
        return;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail(`${label} contains a non-finite number`);
        addPrecloneBytes(state, Buffer.byteLength(JSON_STRINGIFY(value), "utf8"), label);
        return;
    }
    if (typeof value === "boolean") {
        addPrecloneBytes(state, value ? 4 : 5, label);
        return;
    }
    if (typeof value !== "object") {
        fail(`${label} contains a non-JSON value`);
    }
    if (node_util_1.types.isProxy(value)) {
        fail(`${label} contains a proxy`);
    }
    if (state.seen.has(value))
        fail(`${label} contains a cycle or alias`);
    state.seen.add(value);
    const prototype = GET_PROTOTYPE_OF(value);
    const keys = REFLECT_OWN_KEYS(value);
    if (ARRAY_IS_ARRAY(value)) {
        if (prototype !== Array.prototype) {
            fail(`${label} array must use the intrinsic Array prototype`);
        }
        if (value.length > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength) {
            fail(`${label} exceeds the array ceiling`);
        }
        if (keys.some((key) => typeof key === "symbol")) {
            fail(`${label} contains a symbol key`);
        }
        addPrecloneBytes(state, 2 + Math.max(0, value.length - 1), label);
        if (keys.length !== value.length + 1 || !keys.includes("length")) {
            fail(`${label} array contains holes or named fields`);
        }
        for (const key of keys) {
            if (typeof key !== "string")
                fail(`${label} contains a symbol key`);
            chargeOwnDescriptor(state, key, label);
            if (key !== "length"
                && (!/^(0|[1-9]\d*)$/.test(key)
                    || Number(key) >= value.length)) {
                fail(`${label} array contains holes or named fields`);
            }
        }
        for (let index = 0; index < value.length; index += 1) {
            const key = String(index);
            const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
            if (descriptor === undefined
                || !("value" in descriptor)
                || descriptor.enumerable !== true
                || descriptor.value === undefined) {
                fail(`${label} array must contain enumerable data elements`);
            }
            preflightJson(descriptor.value, `${label}[${index}]`, state, depth + 1);
        }
        state.seen.delete(value);
        return;
    }
    if (prototype !== Object.prototype && prototype !== null) {
        fail(`${label} must use a plain or null prototype`);
    }
    if (keys.length > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxObjectKeys) {
        fail(`${label} exceeds the object-key ceiling`);
    }
    addPrecloneBytes(state, 2 + Math.max(0, keys.length - 1), label);
    for (const key of keys) {
        if (typeof key !== "string")
            fail(`${label} contains a symbol key`);
        chargeOwnDescriptor(state, key, label);
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
        if (descriptor === undefined
            || !("value" in descriptor)
            || descriptor.enumerable !== true) {
            fail(`${label} must contain enumerable JSON data properties`);
        }
        if (descriptor.value === undefined)
            continue;
        preflightJson(descriptor.value, `${label}.${key}`, state, depth + 1);
    }
    state.seen.delete(value);
}
function snapshotJson(value, label, byteLimit = exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalInputBytes) {
    assertRuntimeIntegrity();
    preflightJson(value, label, {
        nodes: 0,
        descriptors: 0,
        bytes: 0,
        byteLimit,
        seen: new WeakSet(),
    });
    let snapshot;
    try {
        snapshot = STRUCTURED_CLONE(value);
    }
    catch {
        fail(`${label} must be independently cloneable`);
    }
    const canonicalBytes = canonicalJson(snapshot);
    if (Buffer.byteLength(canonicalBytes, "utf8") > byteLimit) {
        fail(`${label} exceeds the canonical byte ceiling`);
    }
    assertRuntimeIntegrity();
    return snapshot;
}
function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value)
            .sort(compareText)
            .map((key) => (`${JSON_STRINGIFY(key)}:${canonicalJson(value[key])}`))
            .join(",")}}`;
    }
    return JSON_STRINGIFY(value) ?? "null";
}
function digestCanonical(value) {
    return (0, node_crypto_1.createHash)("sha256").update(canonicalJson(value)).digest("hex");
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const key of Object.keys(value)) {
            deepFreeze(value[key]);
        }
        Object.freeze(value);
    }
    return value;
}
function assertExactKeys(value, required, optional, label) {
    const keys = Object.keys(value).sort(compareText);
    const allowed = new Set([...required, ...optional]);
    const unknown = keys.filter((key) => !allowed.has(key));
    const missing = required.filter((key) => !keys.includes(key));
    if (unknown.length > 0 || missing.length > 0) {
        fail(`${label} has invalid fields`
            + (unknown.length > 0 ? `; unknown=${unknown.join(",")}` : "")
            + (missing.length > 0 ? `; missing=${missing.join(",")}` : ""));
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        fail(`${label} must be a SHA-256 digest`);
    }
}
function assertHashedId(value, pattern, label) {
    if (typeof value !== "string" || !pattern.test(value)) {
        fail(`${label} is invalid`);
    }
}
function latestProjectionEntry(store, label, authenticateSelectedEntry) {
    if (!ARRAY_IS_ARRAY(store.entries) || store.entries.length === 0) {
        fail(`${label} has no authenticated P10.2 predecessor`);
    }
    const latestInput = store.entries[store.entries.length - 1];
    const latest = authenticateSelectedEntry
        ? (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreEntry)(latestInput)
        : snapshotJson(latestInput, `${label} selected entry`);
    if (latest.entryKind !== "projection") {
        fail(`${label} latest P10.2 entry is ${latest.entryKind}, not projection`);
    }
    return latest;
}
/**
 * TEST-ONLY selected-entry probe. The preceding rows are deliberately treated
 * as already authenticated by P10.2 so a retained-history regression can
 * prove P10.3a never reclones or recanonicalizes the whole 64 MiB store.
 */
function unsafeSelectedTaskMapWorkControlEntryIdForTest(store) {
    return latestProjectionEntry(store, "unsafe P10.3a selected-entry probe", false).entryId;
}
function assertSameAuthenticatedHead(firstEntryCount, secondStore, firstEntry, authenticateSelectedEntry) {
    const secondEntry = latestProjectionEntry(secondStore, "second authenticated P10.2 store snapshot", authenticateSelectedEntry);
    if (firstEntryCount !== secondStore.entries.length
        || firstEntry.entryId !== secondEntry.entryId
        || firstEntry.generation !== secondEntry.generation
        || firstEntry.currentRefId !== secondEntry.currentRefId
        || firstEntry.currentRefDigest !== secondEntry.currentRefDigest
        || firstEntry.sidecar.origin.acceptedStateDigest
            !== secondEntry.sidecar.origin.acceptedStateDigest
        || firstEntry.sidecar.sourceSnapshotDigest
            !== secondEntry.sidecar.sourceSnapshotDigest
        || firstEntry.sidecarId !== secondEntry.sidecarId
        || firstEntry.sidecarDigest !== secondEntry.sidecarDigest
        || firstEntry.replayClosureDigest !== secondEntry.replayClosureDigest
        || digestCanonical(firstEntry) !== digestCanonical(secondEntry)) {
        fail("authenticated P10.2 head advanced during decision build");
    }
}
function predecessorFrom(entry, projection) {
    assertDigest(entry.ownerScopeDigest, "P10.2 owner scope digest");
    if (typeof entry.generation !== "string"
        || !FIXED_GENERATION.test(entry.generation)
        || BigInt(entry.generation) === 0n) {
        fail("P10.2 generation is invalid");
    }
    assertHashedId(entry.entryId, HASHED_IDS.entry, "P10.2 entry ID");
    assertHashedId(entry.currentRefId, HASHED_IDS.currentRef, "P10.2 current-ref ID");
    assertHashedId(entry.sidecarId, HASHED_IDS.sidecar, "P10.2 sidecar ID");
    assertDigest(entry.sidecarDigest, "P10.2 sidecar digest");
    assertDigest(entry.currentRefDigest, "P10.2 current-ref digest");
    assertDigest(entry.replayClosureDigest, "P10.2 replay-closure digest");
    assertDigest(entry.acceptedOriginReplayDigest, "P10.2 accepted-origin replay digest");
    if (typeof entry.acceptedOriginBundleId !== "string"
        || !/^tmrefreshrun_[a-f0-9]{64}$/.test(entry.acceptedOriginBundleId)) {
        fail("P10.2 accepted-origin bundle ID is invalid");
    }
    if (entry.sidecar.sidecarId !== entry.sidecarId) {
        fail("P10.2 entry and sidecar IDs diverge");
    }
    if ((0, source_contracts_js_1.taskMapContractDigest)(entry.sidecar) !== entry.sidecarDigest) {
        fail("P10.2 sidecar digest does not match its authenticated bytes");
    }
    if ((0, source_contracts_js_1.taskMapContractDigest)(entry.sidecar.replayClosure)
        !== entry.replayClosureDigest
        || entry.sidecar.origin.replayClosureDigest
            !== entry.replayClosureDigest) {
        fail("P10.2 replay-closure digest binding is invalid");
    }
    if (entry.sidecar.ownerScopeDigest !== entry.ownerScopeDigest
        || entry.sidecar.origin.currentGeneration !== entry.generation
        || entry.sidecar.origin.currentRefId !== entry.currentRefId
        || entry.sidecar.origin.bundleId !== entry.acceptedOriginBundleId
        || entry.sidecar.origin.acceptedOriginReplayDigest
            !== entry.acceptedOriginReplayDigest) {
        fail("P10.2 entry metadata diverges from its sidecar origin");
    }
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    if (projection.runId !== entry.sidecar.projectionRunId
        || projection.runId !== entry.sidecar.replayClosure.projectionRunId
        || projection.inputDigest
            !== entry.sidecar.replayClosure.projectionInputDigest
        || projectionDigest !== entry.sidecar.projectionDigest
        || projectionDigest !== entry.sidecar.replayClosure.projectionDigest) {
        fail("supplied projection does not exactly match the P10.2 replay tuple");
    }
    assertHashedId(projection.runId, HASHED_IDS.projectionRun, "projection run ID");
    assertDigest(projection.inputDigest, "projection input digest");
    assertDigest(entry.sidecar.replayClosure.sourceSemanticInputDigest, "source semantic input digest");
    assertDigest(entry.sidecar.origin.acceptedStateDigest, "P10.2 accepted-state digest");
    assertDigest(entry.sidecar.sourceSnapshotDigest, "P10.2 source-snapshot digest");
    return {
        ownerScopeDigest: entry.ownerScopeDigest,
        generation: entry.generation,
        currentRefId: entry.currentRefId,
        currentRefDigest: entry.currentRefDigest,
        entryId: entry.entryId,
        acceptedOriginBundleId: entry.acceptedOriginBundleId,
        acceptedOriginReplayDigest: entry.acceptedOriginReplayDigest,
        acceptedStateDigest: entry.sidecar.origin.acceptedStateDigest,
        sidecarId: entry.sidecarId,
        sidecarDigest: entry.sidecarDigest,
        replayClosureDigest: entry.replayClosureDigest,
        sourceSnapshotDigest: entry.sidecar.sourceSnapshotDigest,
        sourceSemanticInputDigest: entry.sidecar.replayClosure.sourceSemanticInputDigest,
        projectionRunId: projection.runId,
        projectionInputDigest: projection.inputDigest,
        projectionDigest,
        inputDomainBinding: "separate_authenticated_domains",
    };
}
function lifecycleDecision(state) {
    if (state === "open")
        return "accepted_open";
    if (state === "resolved")
        return "source_complete";
    return state;
}
function assertTaskLifecycleConsistent(task, lifecycle) {
    if (lifecycle === "open") {
        if (task.reviewState !== "accepted"
            || TERMINAL_OPEN_STATES.has(task.openState)) {
            fail(`open work ${task.id} has unsafe projection terminal semantics`);
        }
        return;
    }
    if (lifecycle === "resolved"
        && (task.reviewState !== "source_complete"
            || task.openState !== "completed")) {
        fail(`resolved work ${task.id} is inconsistent with its P10.2 lifecycle`);
    }
    if (lifecycle === "superseded"
        && (task.reviewState !== "superseded"
            || task.openState !== "superseded")) {
        fail(`superseded work ${task.id} is inconsistent with its P10.2 lifecycle`);
    }
    if (lifecycle === "rejected") {
        fail(`rejected P10.2 work ${task.id} cannot retain a projected task`);
    }
}
function bindWorks(entry, projection) {
    if (entry.sidecar.works.length > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxWorks) {
        fail("P10.2 work count exceeds the P10.3a policy ceiling");
    }
    const taskRowsByDigest = new Map();
    for (const task of projection.tasks) {
        const rowDigest = (0, source_contracts_js_1.taskMapContractDigest)(task);
        if (taskRowsByDigest.has(rowDigest)) {
            fail("projection contains duplicate task-row digests");
        }
        taskRowsByDigest.set(rowDigest, task);
    }
    const rejectionRowsByDigest = new Map();
    for (const rejection of projection.rejections) {
        if (rejection.kind !== "task")
            continue;
        const rowDigest = (0, source_contracts_js_1.taskMapContractDigest)(rejection);
        if (rejectionRowsByDigest.has(rowDigest)) {
            fail("projection contains duplicate task-rejection row digests");
        }
        rejectionRowsByDigest.set(rowDigest, rejection);
    }
    const usedTaskDigests = new Set();
    const usedRejectionDigests = new Set();
    const workById = new Map();
    const workIdByTaskId = new Map();
    const usedReferences = new Set();
    for (const work of entry.sidecar.works) {
        assertHashedId(work.workId, HASHED_IDS.work, "P10.2 work ID");
        if (workById.has(work.workId))
            fail("P10.2 work IDs are not unique");
        const accumulator = {
            workId: work.workId,
            lifecycleState: work.lifecycleState,
            taskIds: [],
            rejectionReferenceIds: [],
            rowDigests: [],
            tasks: [],
            taskRows: [],
            rejectionRows: [],
            rootId: null,
        };
        for (const reference of work.projectionReferences) {
            assertHashedId(reference.id, HASHED_IDS.projectionRef, "P10.2 projection-reference ID");
            assertDigest(reference.projectionRowDigest, "P10.2 projection-row digest");
            const expectedReferenceId = `tmprojectionref_${(0, source_contracts_js_1.taskMapContractDigest)({
                kind: reference.kind,
                projectionRowDigest: reference.projectionRowDigest,
            })}`;
            if (reference.id !== expectedReferenceId) {
                fail("P10.2 projection-reference ID is not row-derived");
            }
            if (usedReferences.has(reference.id)) {
                fail("a projection reference is bound more than once");
            }
            usedReferences.add(reference.id);
            accumulator.rowDigests.push(reference.projectionRowDigest);
            if (reference.kind === "task") {
                const task = taskRowsByDigest.get(reference.projectionRowDigest);
                if (task === undefined) {
                    fail("P10.2 task reference is absent from the supplied projection");
                }
                if (usedTaskDigests.has(reference.projectionRowDigest)) {
                    fail("a projection task row is bound more than once");
                }
                usedTaskDigests.add(reference.projectionRowDigest);
                if (task.reviewState === "proposed") {
                    fail("P10.2 cannot authenticate a proposed REVIEW NEXT task");
                }
                assertTaskLifecycleConsistent(task, work.lifecycleState);
                accumulator.taskIds.push(task.id);
                accumulator.tasks.push(task);
                accumulator.taskRows.push({
                    taskId: task.id,
                    projectionRowDigest: reference.projectionRowDigest,
                });
                if (accumulator.rootId === null) {
                    accumulator.rootId = task.rootId;
                }
                else if (accumulator.rootId !== task.rootId) {
                    fail("one canonical work crosses multiple projection roots");
                }
                if (workIdByTaskId.has(task.id)) {
                    fail("a projection task is bound to multiple canonical works");
                }
                workIdByTaskId.set(task.id, work.workId);
            }
            else {
                const rejection = rejectionRowsByDigest.get(reference.projectionRowDigest);
                if (rejection === undefined) {
                    fail("P10.2 rejection reference is absent from the supplied projection");
                }
                if (usedRejectionDigests.has(reference.projectionRowDigest)) {
                    fail("a projection rejection row is bound more than once");
                }
                usedRejectionDigests.add(reference.projectionRowDigest);
                accumulator.rejectionReferenceIds.push(reference.id);
                accumulator.rejectionRows.push({
                    projectionReferenceId: reference.id,
                    projectionRowDigest: reference.projectionRowDigest,
                });
            }
        }
        if (accumulator.rowDigests.length === 0) {
            fail("P10.2 canonical work has no projection reference");
        }
        if (work.lifecycleState === "rejected"
            && accumulator.rejectionReferenceIds.length === 0) {
            fail("rejected P10.2 work lacks an authenticated rejection row");
        }
        if (work.lifecycleState !== "rejected"
            && accumulator.taskIds.length === 0) {
            fail("non-rejected P10.2 work lacks an authenticated task row");
        }
        accumulator.taskIds.sort(compareText);
        accumulator.taskRows.sort((left, right) => (compareText(left.taskId, right.taskId)
            || compareText(left.projectionRowDigest, right.projectionRowDigest)));
        accumulator.rejectionReferenceIds.sort(compareText);
        accumulator.rejectionRows.sort((left, right) => (compareText(left.projectionReferenceId, right.projectionReferenceId)
            || compareText(left.projectionRowDigest, right.projectionRowDigest)));
        accumulator.rowDigests.sort(compareText);
        workById.set(work.workId, accumulator);
    }
    if (usedTaskDigests.size !== taskRowsByDigest.size) {
        fail("every supplied projection task must bind exactly once to P10.2");
    }
    const workDecisions = [...workById.values()]
        .map((work) => ({
        workId: work.workId,
        lifecycleDecision: lifecycleDecision(work.lifecycleState),
        rankEligible: work.lifecycleState === "open",
        rootId: work.rootId,
        projectionTaskRows: work.taskRows,
        projectionRejectionRows: work.rejectionRows,
        projectionTaskIds: work.taskIds,
        projectionRejectionReferenceIds: work.rejectionReferenceIds,
        projectionRowDigests: work.rowDigests,
    }))
        .sort((left, right) => compareText(left.workId, right.workId));
    return {
        workDecisions,
        workById,
        workIdByTaskId,
    };
}
function controlRelations(projection, workById, workIdByTaskId) {
    if (projection.edges.length
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations) {
        fail("projection relation count exceeds the P10.3a policy ceiling");
    }
    const relationDecisions = [];
    const executionDependencies = [];
    const dependencyPairs = new Set();
    const supersedePairs = new Set();
    for (const edge of [...projection.edges].sort((left, right) => (compareText(left.id, right.id)))) {
        if (!CONTROL_RELATIONS.has(edge.relation)) {
            relationDecisions.push({
                edgeId: edge.id,
                relation: edge.relation,
                outcome: "ignored_non_control",
            });
            continue;
        }
        const fromWorkId = workIdByTaskId.get(edge.from);
        const toWorkId = workIdByTaskId.get(edge.to);
        if (fromWorkId === undefined || toWorkId === undefined) {
            fail(`control relation ${edge.id} has a dangling canonical-work endpoint`);
        }
        if (fromWorkId === toWorkId) {
            fail(`control relation ${edge.id} is self-referential after dedupe`);
        }
        if (edge.relation === "supersedes") {
            const pair = `${fromWorkId}\u0000${toWorkId}`;
            if (supersedePairs.has(pair)) {
                fail("duplicate supersedes relation after identity normalization");
            }
            supersedePairs.add(pair);
            if (workById.get(fromWorkId)?.lifecycleState !== "open"
                || workById.get(toWorkId)?.lifecycleState !== "superseded") {
                fail("supersedes relation is not backed by P10.2 lifecycle authority");
            }
            relationDecisions.push({
                edgeId: edge.id,
                relation: edge.relation,
                outcome: "lifecycle_only",
                supersedingWorkId: fromWorkId,
                supersededWorkId: toWorkId,
            });
            continue;
        }
        const prerequisiteWorkId = edge.relation === "depends_on" ? toWorkId : fromWorkId;
        const dependentWorkId = edge.relation === "depends_on" ? fromWorkId : toWorkId;
        if (workById.get(prerequisiteWorkId)?.lifecycleState !== "open"
            || workById.get(dependentWorkId)?.lifecycleState !== "open") {
            fail("execution dependency references terminal canonical work");
        }
        const pair = `${prerequisiteWorkId}\u0000${dependentWorkId}`;
        if (dependencyPairs.has(pair)) {
            fail("duplicate execution dependency after relation normalization");
        }
        dependencyPairs.add(pair);
        relationDecisions.push({
            edgeId: edge.id,
            relation: edge.relation,
            outcome: "execution_dependency",
            prerequisiteWorkId,
            dependentWorkId,
        });
        executionDependencies.push({
            prerequisiteWorkId,
            dependentWorkId,
            edgeId: edge.id,
        });
    }
    executionDependencies.sort((left, right) => (compareText(left.prerequisiteWorkId, right.prerequisiteWorkId)
        || compareText(left.dependentWorkId, right.dependentWorkId)
        || compareText(left.edgeId, right.edgeId)));
    assertAcyclic(workById, executionDependencies);
    return { relationDecisions, executionDependencies };
}
function assertAcyclic(workById, dependencies) {
    const openWorkIds = [...workById.values()]
        .filter((work) => work.lifecycleState === "open")
        .map((work) => work.workId)
        .sort(compareText);
    const indegree = new Map(openWorkIds.map((workId) => [workId, 0]));
    const outgoing = new Map(openWorkIds.map((workId) => [
        workId,
        [],
    ]));
    for (const dependency of dependencies) {
        outgoing.get(dependency.prerequisiteWorkId).push(dependency.dependentWorkId);
        indegree.set(dependency.dependentWorkId, indegree.get(dependency.dependentWorkId) + 1);
    }
    const ready = openWorkIds.filter((workId) => indegree.get(workId) === 0);
    let visited = 0;
    while (ready.length > 0) {
        const workId = ready.shift();
        visited += 1;
        for (const dependent of outgoing.get(workId).sort(compareText)) {
            const next = indegree.get(dependent) - 1;
            indegree.set(dependent, next);
            if (next === 0) {
                ready.push(dependent);
                ready.sort(compareText);
            }
        }
    }
    if (visited !== openWorkIds.length) {
        fail("normalized execution dependency graph contains a cycle");
    }
}
function unitBasisPoints(value, label) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        fail(`${label} must be a finite unit-interval factor`);
    }
    return Math.floor(value * 10_000 + 0.5);
}
function weightedContribution(factorBasisPoints, weightBasisPoints) {
    return Math.floor((factorBasisPoints * weightBasisPoints + 5_000) / 10_000);
}
function scoreAcceptedOpenTask(task, dependencyImpact, label) {
    const factors = {};
    for (const factor of exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER) {
        // A missing evidence factor contributes zero. The policy weights are not
        // renormalized around absent evidence.
        factors[factor] = unitBasisPoints(task.score[factor] ?? 0, `${label} ${factor}`);
    }
    // Dependency impact is always recomputed from the validated execution DAG.
    factors.dependencyImpact = dependencyImpact;
    factors.bodyBonus = Math.min(factors.bodyBonus, exports.TASKMAP_WORK_CONTROL_POLICY_V1.bodyBonusCapBasisPoints);
    const contributions = {
        sourcePriority: weightedContribution(factors.sourcePriority, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.sourcePriority),
        deadlinePressure: weightedContribution(factors.deadlinePressure, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.deadlinePressure),
        dependencyImpact: weightedContribution(factors.dependencyImpact, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.dependencyImpact),
        recurrence: weightedContribution(factors.recurrence, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.recurrence),
        staleOpen: weightedContribution(factors.staleOpen, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.staleOpen),
        evidenceStrength: weightedContribution(factors.evidenceStrength, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.evidenceStrength),
        bodyBonus: factors.bodyBonus,
    };
    const scoreBasisPoints = Math.min(exports.TASKMAP_WORK_CONTROL_POLICY_V1.scoreCapBasisPoints, exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.reduce((sum, factor) => sum + contributions[factor], 0));
    const reasonCodes = [...exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER]
        .filter((factor) => contributions[factor] > 0)
        .sort((left, right) => (contributions[right] - contributions[left]
        || exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(left)
            - exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(right)))
        .slice(0, 3)
        .map((factor) => RANK_REASON_BY_FACTOR[factor]);
    return {
        taskId: task.id,
        projectionRowDigest: (0, source_contracts_js_1.taskMapContractDigest)(task),
        factorBasisPoints: factors,
        contributionBasisPoints: contributions,
        scoreBasisPoints,
        reasonCodes,
    };
}
function rankAcceptedOpenProjectionTasks(projection) {
    const tasks = projection.tasks.filter((task) => (task.reviewState === "accepted" && task.openState === "open"));
    const eligibleTaskIds = new Set(tasks.map((task) => task.id));
    const outgoing = new Map(tasks.map((task) => [task.id, new Set()]));
    for (const edge of projection.edges) {
        if (edge.relation !== "blocks" && edge.relation !== "depends_on") {
            continue;
        }
        const prerequisite = edge.relation === "depends_on" ? edge.to : edge.from;
        const dependent = edge.relation === "depends_on" ? edge.from : edge.to;
        if (eligibleTaskIds.has(prerequisite)
            && eligibleTaskIds.has(dependent)
            && prerequisite !== dependent) {
            outgoing.get(prerequisite).add(dependent);
        }
    }
    const ranked = tasks.map((task) => {
        const count = Math.min(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap, outgoing.get(task.id)?.size ?? 0);
        const dependencyImpact = Math.floor((count * 10_000
            + Math.floor(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2)) / exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap);
        return scoreAcceptedOpenTask(task, dependencyImpact, task.id);
    }).sort((left, right) => (right.scoreBasisPoints - left.scoreBasisPoints
        || compareText(left.taskId, right.taskId)
        || compareText(left.projectionRowDigest, right.projectionRowDigest)));
    return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}
function rankAcceptedOpen(workById, dependencies) {
    const outgoingCount = new Map();
    for (const dependency of dependencies) {
        outgoingCount.set(dependency.prerequisiteWorkId, (outgoingCount.get(dependency.prerequisiteWorkId) ?? 0) + 1);
    }
    const rows = [...workById.values()]
        .filter((work) => work.lifecycleState === "open")
        .map((work) => {
        const count = Math.min(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap, outgoingCount.get(work.workId) ?? 0);
        const dependencyImpact = Math.floor((count * 10_000
            + Math.floor(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2)) / exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap);
        const representatives = work.tasks.map((task) => (scoreAcceptedOpenTask(task, dependencyImpact, work.workId))).sort((left, right) => (right.scoreBasisPoints - left.scoreBasisPoints
            || compareText(left.taskId, right.taskId)
            || compareText(left.projectionRowDigest, right.projectionRowDigest)));
        const representative = representatives[0];
        if (representative === undefined) {
            fail(`${work.workId} has no accepted task rank factors`);
        }
        return {
            rank: 0,
            workId: work.workId,
            representativeProjectionTaskId: representative.taskId,
            representativeProjectionRowDigest: representative.projectionRowDigest,
            scoreBasisPoints: representative.scoreBasisPoints,
            factorBasisPoints: representative.factorBasisPoints,
            contributionBasisPoints: representative.contributionBasisPoints,
            reasonCodes: representative.reasonCodes,
            aliasRankProofRows: representatives,
        };
    })
        .sort((left, right) => (right.scoreBasisPoints - left.scoreBasisPoints
        || compareText(left.workId, right.workId)));
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
const PRIVACY = Object.freeze({
    sourceBodiesStored: false,
    candidateTextStored: false,
    rawOwnerIdentifiersStored: false,
    rawSourceObjectIdentifiersStored: false,
    rawSourceRevisionsStored: false,
    rawBiometricsStored: false,
    localPathsStored: false,
    connectorSecretsStored: false,
    executionStateStored: false,
});
function assertArtifactPrivacy(value, path = "artifact") {
    if (typeof value === "string") {
        if (/(?:https?|file):\/\//i.test(value)
            || /(?:^|[\\/])Users[\\/]/.test(value)
            || /(?:^|[\\/])home[\\/]/.test(value)
            || /\b[A-Z]:\\/.test(value)
            || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
            || /\b(?:sk|api|token|secret)[-_][A-Za-z0-9_-]{12,}\b/i.test(value)) {
            fail(`${path} contains privacy-sensitive string material`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => (assertArtifactPrivacy(item, `${path}[${index}]`)));
        return;
    }
    if (value === null || typeof value !== "object")
        return;
    for (const [key, item] of Object.entries(value)) {
        if (/^(?:title|summary|body|transcript|sourceObjectId|sourceRevision|ownerId|participant|email|localPath|credential|secret|token)$/i
            .test(key)) {
            fail(`${path}.${key} is forbidden by the privacy contract`);
        }
        assertArtifactPrivacy(item, `${path}.${key}`);
    }
}
function artifactCore(artifact) {
    return artifact;
}
function buildFromAuthenticatedSnapshots(firstStoreInput, projectionInput, authenticateSelectedEntry) {
    const projection = snapshotJson(projectionInput, "P10.3a supplied projection");
    const firstEntry = latestProjectionEntry(firstStoreInput, "first authenticated P10.2 store snapshot", authenticateSelectedEntry);
    const predecessor = predecessorFrom(firstEntry, projection);
    const { workDecisions, workById, workIdByTaskId, } = bindWorks(firstEntry, projection);
    const { relationDecisions, executionDependencies } = controlRelations(projection, workById, workIdByTaskId);
    const rankedAcceptedOpen = rankAcceptedOpen(workById, executionDependencies);
    const originDigest = digestCanonical(predecessor);
    const core = artifactCore({
        contractVersion: exports.TASKMAP_WORK_CONTROL_DECISION_VERSION,
        originDigest,
        policyVersion: exports.TASKMAP_WORK_CONTROL_POLICY_VERSION,
        policyDigest: exports.TASKMAP_WORK_CONTROL_POLICY_DIGEST,
        predecessor,
        candidateCoverage: exports.TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE,
        reviewNext: [],
        workDecisions,
        relationDecisions,
        executionDependencies,
        rankedAcceptedOpen,
        privacy: { ...PRIVACY },
    });
    const artifactDigest = digestCanonical(core);
    const artifact = {
        ...core,
        artifactId: `tmworkcontroldecision_${artifactDigest}`,
        artifactDigest,
    };
    return {
        built: {
            artifact: assertTaskMapWorkControlDecision(artifact),
            canonicalBytes: taskMapWorkControlDecisionCanonicalBytes(artifact),
        },
        firstEntryCount: firstStoreInput.entries.length,
        firstEntry,
    };
}
function closeAuthenticatedHeadRace(candidate, secondStoreInput, authenticateSelectedEntry) {
    assertSameAuthenticatedHead(candidate.firstEntryCount, secondStoreInput, candidate.firstEntry, authenticateSelectedEntry);
    return candidate.built;
}
/**
 * Product path. The complete caller input is snapshotted before the first
 * await, and the authenticated P10.2 head is read and rechecked around the
 * pure decision build.
 */
async function buildTaskMapWorkControlDecisionProductCore(input, afterFirstAuthenticatedRead) {
    const snapshot = snapshotJson(input, "P10.3a build input");
    assertExactKeys(snapshot, ["currentRoot", "runRoot", "sidecarRoot", "projection"], [], "P10.3a build input");
    const roots = {
        currentRoot: snapshot.currentRoot,
        runRoot: snapshot.runRoot,
        sidecarRoot: snapshot.sidecarRoot,
    };
    const heldRoots = await holdTaskMapWorkControlRoots(roots);
    try {
        const firstStore = await (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(roots);
        if (afterFirstAuthenticatedRead !== undefined) {
            await afterFirstAuthenticatedRead();
        }
        const candidate = buildFromAuthenticatedSnapshots(firstStore, snapshot.projection, true);
        const secondStore = await (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(roots);
        revalidateHeldTaskMapWorkControlRootsSync(heldRoots);
        const built = closeAuthenticatedHeadRace(candidate, secondStore, true);
        return built;
    }
    finally {
        await closeHeldRoots(heldRoots);
    }
}
async function buildTaskMapWorkControlDecision(input) {
    return buildTaskMapWorkControlDecisionProductCore(input);
}
/**
 * TEST-ONLY product-wiring seam. Authentication remains the real public P10.2
 * reader; the sole hook permits a deterministic temporary-filesystem swap
 * after its first successful read.
 */
async function unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest(input, afterFirstAuthenticatedRead) {
    return buildTaskMapWorkControlDecisionProductCore(input, afterFirstAuthenticatedRead);
}
/**
 * TEST-ONLY root-receipt exerciser. It performs no Task Map reads or writes;
 * the callback exists only to deterministically replace a temporary test root
 * between receipt acquisition and revalidation.
 */
async function unsafeExerciseTaskMapWorkControlRootReceiptForTest(rootsInput, between) {
    const roots = snapshotJson(rootsInput, "unsafe P10.3a root-receipt test roots");
    assertExactKeys(roots, ["currentRoot", "runRoot", "sidecarRoot"], [], "unsafe P10.3a root-receipt test roots");
    const heldRoots = await holdTaskMapWorkControlRoots(roots);
    try {
        await between();
        revalidateHeldTaskMapWorkControlRootsSync(heldRoots);
    }
    finally {
        await closeHeldRoots(heldRoots);
    }
}
/**
 * TEST-ONLY. This bypasses P10.2 filesystem/authentication and must never be
 * used as a product reader. It preserves the same exact projection, lifecycle,
 * row-bijection, head-stability, DAG, rank, and privacy decisions.
 */
function unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(input) {
    const snapshot = snapshotJson(input, "unsafe P10.3a test input");
    assertExactKeys(snapshot, ["firstStore", "secondStore", "projection"], [], "unsafe P10.3a test input");
    const candidate = buildFromAuthenticatedSnapshots(snapshot.firstStore, snapshot.projection, false);
    return closeAuthenticatedHeadRace(candidate, snapshot.secondStore, false);
}
function assertIntegerBasisPoints(value, label) {
    if (typeof value !== "number"
        || !Number.isSafeInteger(value)
        || value < 0
        || value > 10_000) {
        fail(`${label} must be integer basis points`);
    }
}
function assertRecordValue(value, label) {
    if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) {
        fail(`${label} must be an object`);
    }
}
function assertArrayValue(value, label) {
    if (!ARRAY_IS_ARRAY(value))
        fail(`${label} must be an array`);
}
function assertSortedUniqueStrings(value, label, pattern) {
    assertArrayValue(value, label);
    let previous;
    for (const row of value) {
        if (typeof row !== "string"
            || (pattern !== undefined && !pattern.test(row))) {
            fail(`${label} contains an invalid string`);
        }
        if (previous !== undefined && compareText(previous, row) >= 0) {
            fail(`${label} must be strictly code-point sorted and unique`);
        }
        previous = row;
    }
}
function expectedRankReasonCodes(contributions) {
    return [...exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER]
        .filter((factor) => contributions[factor] > 0)
        .sort((left, right) => (contributions[right] - contributions[left]
        || exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(left)
            - exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.indexOf(right)))
        .slice(0, 3)
        .map((factor) => RANK_REASON_BY_FACTOR[factor]);
}
function expectedRankContributions(factors) {
    return {
        sourcePriority: weightedContribution(factors.sourcePriority, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.sourcePriority),
        deadlinePressure: weightedContribution(factors.deadlinePressure, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.deadlinePressure),
        dependencyImpact: weightedContribution(factors.dependencyImpact, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.dependencyImpact),
        recurrence: weightedContribution(factors.recurrence, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.recurrence),
        staleOpen: weightedContribution(factors.staleOpen, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.staleOpen),
        evidenceStrength: weightedContribution(factors.evidenceStrength, exports.TASKMAP_WORK_CONTROL_POLICY_V1.weightsBasisPoints.evidenceStrength),
        bodyBonus: factors.bodyBonus,
    };
}
function assertAliasRankProofScore(row, expectedDependencyImpact, label) {
    assertIntegerBasisPoints(row.scoreBasisPoints, `${label} score`);
    assertRecordValue(row.factorBasisPoints, `${label} factor basis points`);
    assertRecordValue(row.contributionBasisPoints, `${label} contribution basis points`);
    assertExactKeys(row.factorBasisPoints, exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER, [], `${label} factor basis points`);
    assertExactKeys(row.contributionBasisPoints, exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER, [], `${label} contribution basis points`);
    for (const factor of exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER) {
        assertIntegerBasisPoints(row.factorBasisPoints[factor], `${label} ${factor} factor`);
        assertIntegerBasisPoints(row.contributionBasisPoints[factor], `${label} ${factor} contribution`);
    }
    if (row.factorBasisPoints.bodyBonus
        > exports.TASKMAP_WORK_CONTROL_POLICY_V1.bodyBonusCapBasisPoints) {
        fail(`${label} body bonus exceeds the closed policy cap`);
    }
    if (row.factorBasisPoints.dependencyImpact !== expectedDependencyImpact) {
        fail(`${label} dependency-impact factor is not DAG-derived`);
    }
    const expectedContributions = expectedRankContributions(row.factorBasisPoints);
    if (canonicalJson(row.contributionBasisPoints)
        !== canonicalJson(expectedContributions)) {
        fail(`${label} contributions are not policy-derived`);
    }
    const expectedScore = Math.min(exports.TASKMAP_WORK_CONTROL_POLICY_V1.scoreCapBasisPoints, exports.TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER.reduce((sum, factor) => sum + expectedContributions[factor], 0));
    if (row.scoreBasisPoints !== expectedScore
        || canonicalJson(row.reasonCodes)
            !== canonicalJson(expectedRankReasonCodes(expectedContributions))) {
        fail(`${label} score or reasons are not policy-derived`);
    }
}
function compareAliasRankProof(left, right) {
    return right.scoreBasisPoints - left.scoreBasisPoints
        || compareText(left.taskId, right.taskId)
        || compareText(left.projectionRowDigest, right.projectionRowDigest);
}
function assertArtifactDependencyAcyclic(openWorkIds, dependencies) {
    const indegree = new Map(openWorkIds.map((workId) => [workId, 0]));
    const outgoing = new Map(openWorkIds.map((workId) => [
        workId,
        [],
    ]));
    for (const dependency of dependencies) {
        outgoing.get(dependency.prerequisiteWorkId).push(dependency.dependentWorkId);
        indegree.set(dependency.dependentWorkId, indegree.get(dependency.dependentWorkId) + 1);
    }
    const ready = openWorkIds
        .filter((workId) => indegree.get(workId) === 0)
        .sort(compareText);
    let visited = 0;
    while (ready.length > 0) {
        const current = ready.shift();
        visited += 1;
        for (const dependent of outgoing.get(current).sort(compareText)) {
            const next = indegree.get(dependent) - 1;
            indegree.set(dependent, next);
            if (next === 0) {
                ready.push(dependent);
                ready.sort(compareText);
            }
        }
    }
    if (visited !== openWorkIds.length) {
        fail("artifact execution dependency graph contains a cycle");
    }
}
/**
 * Self-contained semantic/canonical validator. It does not authenticate the
 * predecessor against P10.1/P10.2 storage. Product trust requires rebuilding
 * through buildTaskMapWorkControlDecision and its authenticated store reads.
 */
function assertTaskMapWorkControlDecision(value) {
    const artifact = snapshotJson(value, "P10.3a decision artifact", exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes);
    assertExactKeys(artifact, [
        "contractVersion",
        "artifactId",
        "artifactDigest",
        "originDigest",
        "policyVersion",
        "policyDigest",
        "predecessor",
        "candidateCoverage",
        "reviewNext",
        "workDecisions",
        "relationDecisions",
        "executionDependencies",
        "rankedAcceptedOpen",
        "privacy",
    ], [], "P10.3a decision artifact");
    if (artifact.contractVersion !== exports.TASKMAP_WORK_CONTROL_DECISION_VERSION
        || artifact.policyVersion !== exports.TASKMAP_WORK_CONTROL_POLICY_VERSION
        || artifact.policyDigest !== exports.TASKMAP_WORK_CONTROL_POLICY_DIGEST) {
        fail("artifact version or policy binding is invalid");
    }
    assertHashedId(artifact.artifactId, HASHED_IDS.decision, "artifact ID");
    assertDigest(artifact.artifactDigest, "artifact digest");
    assertDigest(artifact.originDigest, "origin digest");
    assertArrayValue(artifact.reviewNext, "artifact reviewNext");
    assertArrayValue(artifact.workDecisions, "artifact work decisions");
    if (artifact.workDecisions.length
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxWorks) {
        fail("artifact work decision count exceeds the policy ceiling");
    }
    assertArrayValue(artifact.relationDecisions, "artifact relation decisions");
    assertArrayValue(artifact.executionDependencies, "artifact execution dependencies");
    if (artifact.relationDecisions.length
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations) {
        fail("artifact relation decision count exceeds the policy ceiling");
    }
    if (artifact.executionDependencies.length
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxRelations) {
        fail("artifact execution dependency count exceeds the policy ceiling");
    }
    assertArrayValue(artifact.rankedAcceptedOpen, "artifact ranked accepted-open rows");
    if (artifact.candidateCoverage
        !== exports.TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE
        || artifact.reviewNext.length !== 0) {
        fail("P10.2 v1 candidate coverage must stay unavailable and empty");
    }
    assertRecordValue(artifact.privacy, "artifact privacy");
    if (canonicalJson(artifact.privacy) !== canonicalJson(PRIVACY)) {
        fail("artifact privacy declaration is invalid");
    }
    assertRecordValue(artifact.predecessor, "artifact predecessor");
    assertExactKeys(artifact.predecessor, [
        "ownerScopeDigest",
        "generation",
        "currentRefId",
        "currentRefDigest",
        "entryId",
        "acceptedOriginBundleId",
        "acceptedOriginReplayDigest",
        "acceptedStateDigest",
        "sidecarId",
        "sidecarDigest",
        "replayClosureDigest",
        "sourceSnapshotDigest",
        "sourceSemanticInputDigest",
        "projectionRunId",
        "projectionInputDigest",
        "projectionDigest",
        "inputDomainBinding",
    ], [], "artifact predecessor");
    assertDigest(artifact.predecessor.ownerScopeDigest, "artifact predecessor owner scope");
    if (!FIXED_GENERATION.test(artifact.predecessor.generation)
        || BigInt(artifact.predecessor.generation) === 0n) {
        fail("artifact predecessor generation is invalid");
    }
    assertHashedId(artifact.predecessor.currentRefId, HASHED_IDS.currentRef, "artifact predecessor current-ref ID");
    assertHashedId(artifact.predecessor.entryId, HASHED_IDS.entry, "artifact predecessor entry ID");
    assertHashedId(artifact.predecessor.sidecarId, HASHED_IDS.sidecar, "artifact predecessor sidecar ID");
    assertHashedId(artifact.predecessor.projectionRunId, HASHED_IDS.projectionRun, "artifact predecessor projection run ID");
    if (typeof artifact.predecessor.acceptedOriginBundleId !== "string"
        || !/^tmrefreshrun_[a-f0-9]{64}$/.test(artifact.predecessor.acceptedOriginBundleId)) {
        fail("artifact predecessor accepted-origin bundle ID is invalid");
    }
    for (const [digestValue, label] of [
        [artifact.predecessor.currentRefDigest, "current-ref"],
        [
            artifact.predecessor.acceptedOriginReplayDigest,
            "accepted-origin replay",
        ],
        [artifact.predecessor.acceptedStateDigest, "accepted state"],
        [artifact.predecessor.sidecarDigest, "sidecar"],
        [artifact.predecessor.replayClosureDigest, "replay closure"],
        [artifact.predecessor.sourceSnapshotDigest, "source snapshot"],
        [
            artifact.predecessor.sourceSemanticInputDigest,
            "source semantic input",
        ],
        [artifact.predecessor.projectionInputDigest, "projection input"],
        [artifact.predecessor.projectionDigest, "projection"],
    ]) {
        assertDigest(digestValue, `artifact predecessor ${label} digest`);
    }
    if (artifact.predecessor.inputDomainBinding
        !== "separate_authenticated_domains") {
        fail("artifact conflates source-semantic and projection input domains");
    }
    if (digestCanonical(artifact.predecessor) !== artifact.originDigest) {
        fail("artifact origin digest is not predecessor-derived");
    }
    const workById = new Map();
    const globalTaskIds = new Set();
    const globalRejectionReferenceIds = new Set();
    const globalProjectionRowDigests = new Set();
    let previousWorkId;
    for (const work of artifact.workDecisions) {
        assertRecordValue(work, "artifact work decision");
        assertExactKeys(work, [
            "workId",
            "lifecycleDecision",
            "rankEligible",
            "rootId",
            "projectionTaskRows",
            "projectionRejectionRows",
            "projectionTaskIds",
            "projectionRejectionReferenceIds",
            "projectionRowDigests",
        ], [], "artifact work decision");
        assertHashedId(work.workId, HASHED_IDS.work, "artifact work ID");
        if (previousWorkId !== undefined
            && compareText(previousWorkId, work.workId) >= 0) {
            fail("artifact work decisions are not strictly sorted");
        }
        previousWorkId = work.workId;
        if (!LIFECYCLE_DECISIONS.has(work.lifecycleDecision)) {
            fail("artifact work lifecycle decision is invalid");
        }
        if (typeof work.rankEligible !== "boolean"
            || work.rankEligible
                !== (work.lifecycleDecision === "accepted_open")) {
            fail("artifact rank eligibility contradicts lifecycle");
        }
        if (work.rootId !== null
            && (typeof work.rootId !== "string"
                || !HASHED_IDS.projectionRoot.test(work.rootId))) {
            fail("artifact work root ID is invalid");
        }
        assertArrayValue(work.projectionTaskRows, "artifact work projection task rows");
        let previousTaskPair = "";
        const pairedTaskIds = [];
        const pairedTaskDigests = [];
        for (const taskRow of work.projectionTaskRows) {
            assertRecordValue(taskRow, "artifact projection task row");
            assertExactKeys(taskRow, ["taskId", "projectionRowDigest"], [], "artifact projection task row");
            assertHashedId(taskRow.taskId, HASHED_IDS.projectionTask, "artifact projection task ID");
            assertDigest(taskRow.projectionRowDigest, "artifact projection task-row digest");
            const pair = `${taskRow.taskId}\u0000${taskRow.projectionRowDigest}`;
            if (previousTaskPair !== "" && compareText(previousTaskPair, pair) >= 0) {
                fail("artifact projection task rows are not strictly sorted");
            }
            previousTaskPair = pair;
            if (globalTaskIds.has(taskRow.taskId)) {
                fail("artifact projection task row is bound more than once");
            }
            globalTaskIds.add(taskRow.taskId);
            pairedTaskIds.push(taskRow.taskId);
            pairedTaskDigests.push(taskRow.projectionRowDigest);
        }
        assertArrayValue(work.projectionRejectionRows, "artifact work projection rejection rows");
        let previousRejectionPair = "";
        const pairedRejectionReferenceIds = [];
        const pairedRejectionDigests = [];
        for (const rejectionRow of work.projectionRejectionRows) {
            assertRecordValue(rejectionRow, "artifact projection rejection row");
            assertExactKeys(rejectionRow, ["projectionReferenceId", "projectionRowDigest"], [], "artifact projection rejection row");
            assertHashedId(rejectionRow.projectionReferenceId, HASHED_IDS.projectionRef, "artifact projection rejection reference ID");
            assertDigest(rejectionRow.projectionRowDigest, "artifact projection rejection-row digest");
            const expectedReferenceId = `tmprojectionref_${digestCanonical({
                kind: "rejection",
                projectionRowDigest: rejectionRow.projectionRowDigest,
            })}`;
            if (rejectionRow.projectionReferenceId !== expectedReferenceId) {
                fail("artifact projection rejection reference ID is not row-derived");
            }
            const pair = `${rejectionRow.projectionReferenceId}\u0000${rejectionRow.projectionRowDigest}`;
            if (previousRejectionPair !== ""
                && compareText(previousRejectionPair, pair) >= 0) {
                fail("artifact projection rejection rows are not strictly sorted");
            }
            previousRejectionPair = pair;
            if (globalRejectionReferenceIds.has(rejectionRow.projectionReferenceId)) {
                fail("artifact projection rejection row is bound more than once");
            }
            globalRejectionReferenceIds.add(rejectionRow.projectionReferenceId);
            pairedRejectionReferenceIds.push(rejectionRow.projectionReferenceId);
            pairedRejectionDigests.push(rejectionRow.projectionRowDigest);
        }
        assertSortedUniqueStrings(work.projectionTaskIds, "artifact projection task IDs", HASHED_IDS.projectionTask);
        assertSortedUniqueStrings(work.projectionRejectionReferenceIds, "artifact projection rejection reference IDs", HASHED_IDS.projectionRef);
        assertSortedUniqueStrings(work.projectionRowDigests, "artifact projection row digests", SHA256);
        for (const rowDigest of work.projectionRowDigests) {
            if (globalProjectionRowDigests.has(rowDigest)) {
                fail("artifact projection row digest is bound more than once");
            }
            globalProjectionRowDigests.add(rowDigest);
        }
        const pairedProjectionRowDigests = [
            ...pairedTaskDigests,
            ...pairedRejectionDigests,
        ].sort(compareText);
        if (canonicalJson(work.projectionTaskIds)
            !== canonicalJson(pairedTaskIds)
            || canonicalJson(work.projectionRejectionReferenceIds)
                !== canonicalJson(pairedRejectionReferenceIds)
            || canonicalJson(work.projectionRowDigests)
                !== canonicalJson(pairedProjectionRowDigests)) {
            fail("artifact work projection row pairing is inconsistent");
        }
        if (work.lifecycleDecision === "rejected"
            ? (work.projectionTaskRows.length !== 0
                || work.projectionRejectionRows.length === 0
                || work.rootId !== null)
            : (work.projectionTaskRows.length === 0
                || work.projectionRejectionRows.length !== 0
                || work.rootId === null)) {
            fail("artifact work lifecycle has inconsistent projection rows");
        }
        workById.set(work.workId, work);
    }
    if (globalTaskIds.size
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength) {
        fail("artifact projection task row count exceeds the policy ceiling");
    }
    if (globalRejectionReferenceIds.size
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxArrayLength) {
        fail("artifact projection rejection row count exceeds the policy ceiling");
    }
    const dependencyPairs = new Set();
    const dependencyByEdgeId = new Map();
    let previousDependencyKey = "";
    for (const dependency of artifact.executionDependencies) {
        assertRecordValue(dependency, "artifact execution dependency");
        assertExactKeys(dependency, ["prerequisiteWorkId", "dependentWorkId", "edgeId"], [], "artifact execution dependency");
        assertHashedId(dependency.edgeId, HASHED_IDS.projectionEdge, "artifact execution dependency edge ID");
        const prerequisite = workById.get(dependency.prerequisiteWorkId);
        const dependent = workById.get(dependency.dependentWorkId);
        if (prerequisite?.lifecycleDecision !== "accepted_open"
            || dependent?.lifecycleDecision !== "accepted_open"
            || dependency.prerequisiteWorkId === dependency.dependentWorkId) {
            fail("artifact execution dependency has a terminal or invalid endpoint");
        }
        const pair = `${dependency.prerequisiteWorkId}\u0000${dependency.dependentWorkId}`;
        const orderKey = `${pair}\u0000${dependency.edgeId}`;
        if (dependencyPairs.has(pair)
            || dependencyByEdgeId.has(dependency.edgeId)
            || (previousDependencyKey !== ""
                && compareText(previousDependencyKey, orderKey) >= 0)) {
            fail("artifact execution dependencies are duplicated or unsorted");
        }
        previousDependencyKey = orderKey;
        dependencyPairs.add(pair);
        dependencyByEdgeId.set(dependency.edgeId, dependency);
    }
    const openWorkIds = [...workById.values()]
        .filter((work) => work.lifecycleDecision === "accepted_open")
        .map((work) => work.workId)
        .sort(compareText);
    assertArtifactDependencyAcyclic(openWorkIds, artifact.executionDependencies);
    const usedDependencyEdges = new Set();
    const usedSupersedePairs = new Set();
    let previousRelationEdgeId;
    for (const relation of artifact.relationDecisions) {
        assertRecordValue(relation, "artifact relation decision");
        assertHashedId(relation.edgeId, HASHED_IDS.projectionEdge, "artifact relation edge ID");
        if (previousRelationEdgeId !== undefined
            && compareText(previousRelationEdgeId, relation.edgeId) >= 0) {
            fail("artifact relation decisions are not strictly edge-ID sorted");
        }
        previousRelationEdgeId = relation.edgeId;
        if (!PROJECTION_RELATIONS.has(relation.relation)) {
            fail("artifact relation decision has an invalid relation");
        }
        if (relation.outcome === "execution_dependency") {
            assertExactKeys(relation, [
                "edgeId",
                "relation",
                "outcome",
                "prerequisiteWorkId",
                "dependentWorkId",
            ], [], "artifact execution relation decision");
            if (relation.relation !== "depends_on"
                && relation.relation !== "blocks") {
                fail("artifact execution relation has a non-execution kind");
            }
            const dependency = dependencyByEdgeId.get(relation.edgeId);
            if (dependency === undefined
                || dependency.prerequisiteWorkId !== relation.prerequisiteWorkId
                || dependency.dependentWorkId !== relation.dependentWorkId) {
                fail("artifact execution relation does not match its DAG edge");
            }
            usedDependencyEdges.add(relation.edgeId);
        }
        else if (relation.outcome === "lifecycle_only") {
            assertExactKeys(relation, [
                "edgeId",
                "relation",
                "outcome",
                "supersedingWorkId",
                "supersededWorkId",
            ], [], "artifact lifecycle-only relation decision");
            if (relation.relation !== "supersedes"
                || relation.supersedingWorkId === relation.supersededWorkId
                || workById.get(relation.supersedingWorkId)
                    ?.lifecycleDecision !== "accepted_open"
                || workById.get(relation.supersededWorkId)
                    ?.lifecycleDecision !== "superseded") {
                fail("artifact lifecycle-only relation lacks P10.2 terminal authority");
            }
            const pair = `${relation.supersedingWorkId}\u0000${relation.supersededWorkId}`;
            if (usedSupersedePairs.has(pair)) {
                fail("artifact contains a duplicate normalized supersedes pair");
            }
            usedSupersedePairs.add(pair);
        }
        else if (relation.outcome === "ignored_non_control") {
            assertExactKeys(relation, ["edgeId", "relation", "outcome"], [], "artifact ignored relation decision");
            if (CONTROL_RELATIONS.has(relation.relation)) {
                fail("artifact ignored relation is control-bearing");
            }
        }
        else {
            fail("artifact relation decision has an invalid outcome");
        }
    }
    if (usedDependencyEdges.size !== dependencyByEdgeId.size) {
        fail("artifact relation decisions do not exactly cover the DAG edges");
    }
    const outgoingCount = new Map();
    for (const dependency of artifact.executionDependencies) {
        outgoingCount.set(dependency.prerequisiteWorkId, (outgoingCount.get(dependency.prerequisiteWorkId) ?? 0) + 1);
    }
    const rankedWorkIds = new Set();
    let previousRankScore = Number.POSITIVE_INFINITY;
    let previousRankWorkId = "";
    for (let index = 0; index < artifact.rankedAcceptedOpen.length; index += 1) {
        const row = artifact.rankedAcceptedOpen[index];
        assertRecordValue(row, "artifact rank decision");
        assertExactKeys(row, [
            "rank",
            "workId",
            "representativeProjectionTaskId",
            "representativeProjectionRowDigest",
            "scoreBasisPoints",
            "factorBasisPoints",
            "contributionBasisPoints",
            "reasonCodes",
            "aliasRankProofRows",
        ], [], "artifact rank decision");
        const work = workById.get(row.workId);
        if (row.rank !== index + 1
            || rankedWorkIds.has(row.workId)
            || work?.lifecycleDecision !== "accepted_open") {
            fail("artifact ranks are not unique contiguous accepted-open rows");
        }
        rankedWorkIds.add(row.workId);
        const dependencyCount = Math.min(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap, outgoingCount.get(row.workId) ?? 0);
        const expectedDependencyImpact = Math.floor((dependencyCount * 10_000
            + Math.floor(exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap / 2)) / exports.TASKMAP_WORK_CONTROL_POLICY_V1.dependencyCountCap);
        assertArrayValue(row.aliasRankProofRows, "artifact alias rank proof rows");
        if (row.aliasRankProofRows.length === 0) {
            fail("artifact accepted-open work has no alias rank proof row");
        }
        const proofPairs = [];
        let previousProof;
        for (const proof of row.aliasRankProofRows) {
            assertRecordValue(proof, "artifact alias rank proof row");
            assertExactKeys(proof, [
                "taskId",
                "projectionRowDigest",
                "scoreBasisPoints",
                "factorBasisPoints",
                "contributionBasisPoints",
                "reasonCodes",
            ], [], "artifact alias rank proof row");
            assertHashedId(proof.taskId, HASHED_IDS.projectionTask, "artifact alias rank proof task ID");
            assertDigest(proof.projectionRowDigest, "artifact alias rank proof row digest");
            if (previousProof !== undefined
                && compareAliasRankProof(previousProof, proof) >= 0) {
                fail("artifact alias rank proof rows are not strictly sorted");
            }
            previousProof = proof;
            proofPairs.push(`${proof.taskId}\u0000${proof.projectionRowDigest}`);
            assertAliasRankProofScore(proof, expectedDependencyImpact, "artifact alias rank proof");
        }
        const expectedProofPairs = work.projectionTaskRows
            .map((taskRow) => (`${taskRow.taskId}\u0000${taskRow.projectionRowDigest}`))
            .sort(compareText);
        proofPairs.sort(compareText);
        if (canonicalJson(proofPairs) !== canonicalJson(expectedProofPairs)) {
            fail("artifact alias rank proof rows do not exactly cover work task rows");
        }
        const winner = row.aliasRankProofRows[0];
        if (row.representativeProjectionTaskId !== winner.taskId
            || row.representativeProjectionRowDigest
                !== winner.projectionRowDigest
            || row.scoreBasisPoints !== winner.scoreBasisPoints
            || canonicalJson(row.factorBasisPoints)
                !== canonicalJson(winner.factorBasisPoints)
            || canonicalJson(row.contributionBasisPoints)
                !== canonicalJson(winner.contributionBasisPoints)
            || canonicalJson(row.reasonCodes)
                !== canonicalJson(winner.reasonCodes)) {
            fail("artifact rank fields do not equal the canonical alias winner");
        }
        if (row.scoreBasisPoints > previousRankScore
            || (row.scoreBasisPoints === previousRankScore
                && compareText(previousRankWorkId, row.workId) >= 0)) {
            fail("artifact rank order violates the deterministic tie break");
        }
        previousRankScore = row.scoreBasisPoints;
        previousRankWorkId = row.workId;
    }
    const rankedExpected = new Set(openWorkIds);
    if (rankedExpected.size !== rankedWorkIds.size
        || [...rankedExpected].some((workId) => !rankedWorkIds.has(workId))) {
        fail("artifact rank rows do not exactly cover accepted-open work");
    }
    const core = artifactCore({
        contractVersion: artifact.contractVersion,
        originDigest: artifact.originDigest,
        policyVersion: artifact.policyVersion,
        policyDigest: artifact.policyDigest,
        predecessor: artifact.predecessor,
        candidateCoverage: artifact.candidateCoverage,
        reviewNext: artifact.reviewNext,
        workDecisions: artifact.workDecisions,
        relationDecisions: artifact.relationDecisions,
        executionDependencies: artifact.executionDependencies,
        rankedAcceptedOpen: artifact.rankedAcceptedOpen,
        privacy: artifact.privacy,
    });
    const expectedDigest = digestCanonical(core);
    if (artifact.artifactDigest !== expectedDigest
        || artifact.artifactId !== `tmworkcontroldecision_${expectedDigest}`) {
        fail("artifact ID/digest is not canonical-core-derived");
    }
    assertArtifactPrivacy(artifact);
    const canonicalBytes = canonicalJson(artifact);
    if (Buffer.byteLength(canonicalBytes, "utf8")
        > exports.TASKMAP_WORK_CONTROL_LIMITS_V1.maxCanonicalArtifactBytes) {
        fail("artifact exceeds the canonical byte ceiling");
    }
    return deepFreeze(artifact);
}
function taskMapWorkControlDecisionCanonicalBytes(value) {
    return canonicalJson(assertTaskMapWorkControlDecision(value));
}
