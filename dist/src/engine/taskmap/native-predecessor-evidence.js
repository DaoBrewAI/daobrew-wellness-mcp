"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1 = exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION = void 0;
exports.buildTaskMapNativePredecessorEvidence = buildTaskMapNativePredecessorEvidence;
exports.assertTaskMapNativePredecessorEvidence = assertTaskMapNativePredecessorEvidence;
exports.taskMapNativePredecessorEvidencePath = taskMapNativePredecessorEvidencePath;
exports.loadTaskMapNativePredecessorEvidence = loadTaskMapNativePredecessorEvidence;
exports.writeTaskMapNativePredecessorEvidence = writeTaskMapNativePredecessorEvidence;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const harness_js_1 = require("./harness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const types_js_1 = require("./types.js");
exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION = "taskmap-native-predecessor-evidence.v1";
exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1 = Object.freeze({
    maxEvidenceFileBytes: 32 * 1024 * 1024,
    maxProjectionFileBytes: 2 * 1024 * 1024,
    maxCurrentnessFileBytes: 2 * 1024 * 1024,
    maxInputBytes: 16 * 1024 * 1024,
    maxBrainBytes: 16 * 1024 * 1024,
    maxPreviousProjectionBytes: 2 * 1024 * 1024,
    maxPointers: 8_192,
    maxEvents: 32_768,
    maxBrainRoots: 2_048,
    maxBrainTasks: 4_096,
    maxBrainEdges: 8_192,
    maxCausalInputs: 2_048,
    maxArrayLength: 32_768,
    maxObjectKeys: 64,
    maxDepth: 32,
    maxStringCharacters: 65_536,
});
const EVIDENCE_FILENAME = "taskmap-predecessor-evidence.v1.json";
const PROJECTION_FILENAME = "taskmap-projection.v1.json";
const CURRENTNESS_FILENAME = "taskmap-currentness.v1.json";
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const ARTIFACT_DIGEST_DOMAIN = "taskmap-native-predecessor-evidence-artifact.1";
function fail(message) {
    throw new Error(`Task Map native predecessor evidence: ${message}`);
}
function errnoCode(error) {
    if (error !== null
        && typeof error === "object"
        && "code" in error
        && typeof error.code === "string") {
        return error.code;
    }
    return undefined;
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        fail(`${label} must be a plain object`);
    }
}
function assertKeys(value, required, optional, label) {
    const allowed = new Set([...required, ...optional]);
    const actual = Object.keys(value);
    if (actual.some((key) => !allowed.has(key))
        || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
        fail(`${label} has unsupported or missing fields`);
    }
}
function assertExactKeys(value, keys, label) {
    assertKeys(value, keys, [], label);
    if (Object.keys(value).length !== keys.length) {
        fail(`${label} has unsupported or missing fields`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        fail(`${label} must be a lowercase sha256 digest`);
    }
}
function assertBoundedString(value, label) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxStringCharacters
        || CONTROL_CHARACTER.test(value)) {
        fail(`${label} must be a bounded non-empty string`);
    }
}
function assertJsonTree(value, label, depth = 0, seen = new WeakSet()) {
    if (depth > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxDepth) {
        fail(`${label} exceeds the maximum JSON depth`);
    }
    if (value === null || typeof value === "boolean")
        return;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            fail(`${label} contains a non-finite number`);
        return;
    }
    if (typeof value === "string") {
        if (value.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxStringCharacters
            || CONTROL_CHARACTER.test(value)) {
            fail(`${label} contains an invalid string`);
        }
        return;
    }
    if (typeof value !== "object") {
        fail(`${label} must contain JSON values only`);
    }
    if (seen.has(value))
        fail(`${label} must be an acyclic JSON tree`);
    seen.add(value);
    if (Array.isArray(value)) {
        if (value.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxArrayLength) {
            fail(`${label} contains an oversized array`);
        }
        for (const [index, item] of value.entries()) {
            assertJsonTree(item, `${label}[${index}]`, depth + 1, seen);
        }
        return;
    }
    assertPlainObject(value, label);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length
        > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxObjectKeys
        || ownKeys.some((key) => typeof key !== "string")) {
        fail(`${label} contains invalid object keys`);
    }
    for (const key of ownKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined
            || descriptor.get !== undefined
            || descriptor.set !== undefined
            || !descriptor.enumerable
            || descriptor.value === undefined) {
            fail(`${label}.${key} is not a JSON data property`);
        }
        assertJsonTree(descriptor.value, `${label}.${key}`, depth + 1, seen);
    }
}
function assertCanonicalSize(value, maximumBytes, label) {
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8")
        > maximumBytes) {
        fail(`${label} exceeds its byte limit`);
    }
}
function assertTaskMapInputShape(value) {
    assertJsonTree(value, "taskMapInput");
    assertPlainObject(value, "taskMapInput");
    assertExactKeys(value, ["contractVersion", "generatedAt", "pointers", "events"], "taskMapInput");
    if (value.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        fail("taskMapInput contractVersion is unsupported");
    }
    assertBoundedString(value.generatedAt, "taskMapInput.generatedAt");
    if (!Array.isArray(value.pointers)
        || value.pointers.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxPointers
        || !Array.isArray(value.events)
        || value.events.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxEvents) {
        fail("taskMapInput collections exceed their bounds");
    }
    for (const [index, pointer] of value.pointers.entries()) {
        assertPlainObject(pointer, `taskMapInput.pointers[${index}]`);
        assertKeys(pointer, [
            "id",
            "sourceKind",
            "sourceObjectId",
            "sourceRefHash",
            "authority",
            "syncMode",
            "capabilities",
        ], ["canonicalUrl", "sourceVersion"], `taskMapInput.pointers[${index}]`);
    }
    for (const [index, event] of value.events.entries()) {
        assertPlainObject(event, `taskMapInput.events[${index}]`);
        assertKeys(event, [
            "id",
            "pointerId",
            "recordKind",
            "activity",
            "occurredAt",
            "observedAt",
            "objectRefs",
            "title",
            "summary",
            "extractionConfidence",
        ], [
            "dayKey",
            "sourceStatus",
            "priority",
            "deadlineAt",
            "supersedesEventId",
            "retractsEventId",
            "bodyCategory",
            "bodyAxis",
            "bodyJoinEligible",
            "corpusCoverage",
        ], `taskMapInput.events[${index}]`);
    }
    assertCanonicalSize(value, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxInputBytes, "taskMapInput");
}
function assertSemanticBrainShape(value) {
    assertJsonTree(value, "semanticBrainOutput");
    assertPlainObject(value, "semanticBrainOutput");
    assertExactKeys(value, [
        "contractVersion",
        "provider",
        "model",
        "promptHash",
        "inputDigest",
        "generatedAt",
        "roots",
        "tasks",
        "edges",
    ], "semanticBrainOutput");
    if (value.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        fail("semanticBrainOutput contractVersion is unsupported");
    }
    if (!Array.isArray(value.roots)
        || value.roots.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainRoots
        || !Array.isArray(value.tasks)
        || value.tasks.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainTasks
        || !Array.isArray(value.edges)
        || value.edges.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainEdges) {
        fail("semanticBrainOutput collections exceed their bounds");
    }
    for (const [index, root] of value.roots.entries()) {
        assertPlainObject(root, `semanticBrainOutput.roots[${index}]`);
        assertExactKeys(root, [
            "proposalId",
            "title",
            "summary",
            "evidenceEventIds",
            "memberObjectRefs",
            "confidence",
        ], `semanticBrainOutput.roots[${index}]`);
    }
    for (const [index, task] of value.tasks.entries()) {
        assertPlainObject(task, `semanticBrainOutput.tasks[${index}]`);
        assertKeys(task, [
            "proposalId",
            "rootProposalId",
            "title",
            "summary",
            "evidenceEventIds",
            "openState",
            "confidence",
        ], ["authoritativeTaskEventId", "proposedReturnPointerId"], `semanticBrainOutput.tasks[${index}]`);
    }
    for (const [index, edge] of value.edges.entries()) {
        assertPlainObject(edge, `semanticBrainOutput.edges[${index}]`);
        assertExactKeys(edge, [
            "proposalId",
            "fromProposalId",
            "toProposalId",
            "relation",
            "evidenceEventIds",
            "confidence",
        ], `semanticBrainOutput.edges[${index}]`);
    }
    assertCanonicalSize(value, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainBytes, "semanticBrainOutput");
}
function assertCausalInputShape(value, index) {
    const label = `replay.causalInputs[${index}]`;
    assertPlainObject(value, label);
    assertExactKeys(value, ["rootProposalId", "bodyAxis", "bodyCategory", "enrichment"], label);
    assertBoundedString(value.rootProposalId, `${label}.rootProposalId`);
    assertPlainObject(value.enrichment, `${label}.enrichment`);
    assertExactKeys(value.enrichment, [
        "theme",
        "targetHits",
        "targetN",
        "referenceRate",
        "referenceN",
        "citedDays",
        "rtmSuspected",
    ], `${label}.enrichment`);
    if (!Array.isArray(value.enrichment.citedDays)) {
        fail(`${label}.enrichment.citedDays must be an array`);
    }
    for (const [dayIndex, day] of value.enrichment.citedDays.entries()) {
        assertPlainObject(day, `${label}.enrichment.citedDays[${dayIndex}]`);
        assertExactKeys(day, ["date", "backed", "sources"], `${label}.enrichment.citedDays[${dayIndex}]`);
    }
}
function assertAcceptedProjection(projection, label, maximumBytes) {
    const durableProjection = jsonRoundTrip(projection, label);
    assertJsonTree(durableProjection, label);
    assertPlainObject(durableProjection, label);
    assertExactKeys(durableProjection, [
        "contractVersion",
        "algorithmPolicyVersion",
        "algorithmPolicyDigest",
        "runStatus",
        "arm",
        "runId",
        "generatedAt",
        "inputDigest",
        "brain",
        "sources",
        "roots",
        "tasks",
        "edges",
        "rejections",
        "privacy",
    ], label);
    if (!Array.isArray(durableProjection.sources)
        || !Array.isArray(durableProjection.roots)
        || !Array.isArray(durableProjection.tasks)
        || !Array.isArray(durableProjection.edges)
        || !Array.isArray(durableProjection.rejections)) {
        fail(`${label} collections must be arrays`);
    }
    assertCanonicalSize(durableProjection, maximumBytes, label);
    const accepted = durableProjection;
    const reasons = (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(accepted);
    if (reasons.length > 0
        || accepted.runStatus !== "accepted"
        || accepted.rejections.length !== 0) {
        fail(`${label} is not one accepted harness artifact`);
    }
}
function assertReplay(value, projection, brain) {
    assertJsonTree(value, "replay");
    assertPlainObject(value, "replay");
    assertExactKeys(value, ["previousProjection", "causalInputs"], "replay");
    if (value.previousProjection !== null) {
        assertAcceptedProjection(value.previousProjection, "replay.previousProjection", exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
            .maxPreviousProjectionBytes);
        if (Date.parse(value.previousProjection.generatedAt)
            > Date.parse(projection.generatedAt)) {
            fail("replay.previousProjection is newer than the accepted projection");
        }
    }
    if (!Array.isArray(value.causalInputs)
        || value.causalInputs.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxCausalInputs) {
        fail("replay.causalInputs exceed their bound");
    }
    const brainRootIds = new Set(brain.roots.map((root) => root.proposalId));
    const seenRootIds = new Set();
    for (const [index, causalInput] of value.causalInputs.entries()) {
        assertCausalInputShape(causalInput, index);
        if (!brainRootIds.has(causalInput.rootProposalId)
            || seenRootIds.has(causalInput.rootProposalId)) {
            fail("replay.causalInputs must name unique semantic brain roots");
        }
        seenRootIds.add(causalInput.rootProposalId);
    }
}
function canonicalProjectionDigest(projection) {
    try {
        return (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    }
    catch {
        fail("projection cannot produce its canonical digest");
    }
}
function assertCurrentness(value, projection) {
    assertJsonTree(value, "currentness");
    assertPlainObject(value, "currentness");
    assertExactKeys(value, [
        "contractVersion",
        "runId",
        "inputDigest",
        "projectionDigest",
        "taskDispositions",
    ], "currentness");
    if (value.contractVersion !== "taskmap-native-currentness-gate.v1"
        || value.runId !== projection.runId
        || value.inputDigest !== projection.inputDigest
        || value.projectionDigest !== canonicalProjectionDigest(projection)
        || !Array.isArray(value.taskDispositions)
        || value.taskDispositions.length !== projection.tasks.length
        || value.taskDispositions.length
            > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainTasks) {
        fail("currentness is not bound to the accepted projection");
    }
    const projectionTaskIds = projection.tasks.map((task) => task.id).sort();
    const dispositionTaskIds = [];
    for (const [index, row] of value.taskDispositions.entries()) {
        assertPlainObject(row, `currentness.taskDispositions[${index}]`);
        assertExactKeys(row, ["taskId", "disposition"], `currentness.taskDispositions[${index}]`);
        assertBoundedString(row.taskId, `currentness.taskDispositions[${index}].taskId`);
        if (row.disposition !== "current"
            && row.disposition !== "needs_lifecycle_review") {
            fail("currentness contains an unsupported disposition");
        }
        dispositionTaskIds.push(row.taskId);
    }
    dispositionTaskIds.sort();
    if (new Set(dispositionTaskIds).size !== dispositionTaskIds.length
        || dispositionTaskIds.some((taskId, index) => taskId !== projectionTaskIds[index])) {
        fail("currentness must classify every projected task exactly once");
    }
}
function parseRawFile(bytes, expected, maximumBytes, label) {
    if (!Buffer.isBuffer(bytes)
        || bytes.length < 2
        || bytes.length > maximumBytes) {
        fail(`${label} bytes exceed their bound`);
    }
    let parsed;
    try {
        parsed = JSON.parse(bytes.toString("utf8"));
    }
    catch {
        fail(`${label} bytes are not valid JSON`);
    }
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(parsed)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expected)) {
        fail(`${label} bytes do not encode the supplied artifact`);
    }
}
function sha256(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
function sameCanonical(left, right) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(left)
        === (0, source_contracts_js_1.taskMapContractCanonicalJson)(right);
}
function verifySourcePair(input) {
    assertTaskMapInputShape(input.taskMapInput);
    assertSemanticBrainShape(input.semanticBrainOutput);
    assertAcceptedProjection(input.projection, "projection", exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxProjectionFileBytes);
    if (input.projection.arm !== "E4"
        || input.projection.brain === null) {
        fail("projection must be a semantic E4 artifact");
    }
    assertReplay(input.replay, input.projection, input.semanticBrainOutput);
    assertCurrentness(input.currentness, input.projection);
    parseRawFile(input.projectionFileBytes, input.projection, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxProjectionFileBytes, "projection file");
    parseRawFile(input.currentnessFileBytes, input.currentness, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxCurrentnessFileBytes, "currentness file");
    const inputDigest = (0, harness_js_1.taskMapInputDigest)(input.taskMapInput);
    const semanticInputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input.taskMapInput);
    const brainOutputDigest = (0, source_contracts_js_1.taskMapContractDigest)(input.semanticBrainOutput);
    if (input.projection.inputDigest !== inputDigest
        || input.semanticBrainOutput.inputDigest !== semanticInputDigest) {
        fail("taskMapInput is not bound to the projection and semantic brain");
    }
    const projectionBrain = input.projection.brain;
    if (projectionBrain.provider !== input.semanticBrainOutput.provider
        || projectionBrain.model !== input.semanticBrainOutput.model
        || projectionBrain.promptHash !== input.semanticBrainOutput.promptHash
        || projectionBrain.outputDigest !== brainOutputDigest) {
        fail("semanticBrainOutput is not bound to the projection");
    }
    let rebuilt;
    try {
        rebuilt = (0, harness_js_1.buildTaskMapProjection)(input.taskMapInput, input.semanticBrainOutput, {
            arm: "E4",
            now: input.projection.generatedAt,
            ...(input.replay.previousProjection === null
                ? {}
                : { previousProjection: input.replay.previousProjection }),
            causalInputs: input.replay.causalInputs,
        });
    }
    catch {
        fail("harness replay failed");
    }
    if (!sameCanonical(rebuilt, input.projection)) {
        fail("projection is not canonically equal to its harness replay");
    }
    return {
        runId: input.projection.runId,
        inputDigest,
        semanticInputDigest,
        brainOutputDigest,
        replayDigest: (0, source_contracts_js_1.taskMapContractDigest)(input.replay),
        projectionDigest: canonicalProjectionDigest(input.projection),
        projectionFileDigest: sha256(input.projectionFileBytes),
        currentnessFileDigest: sha256(input.currentnessFileBytes),
    };
}
function artifactDigest(value) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ARTIFACT_DIGEST_DOMAIN,
        ...value,
    });
}
function deepFreeze(value) {
    if (value !== null
        && typeof value === "object"
        && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function cloneFrozen(value) {
    return deepFreeze(structuredClone(value));
}
function jsonRoundTrip(value, label) {
    try {
        const serialized = JSON.stringify(value);
        if (serialized === undefined)
            fail(`${label} must be JSON serializable`);
        return JSON.parse(serialized);
    }
    catch (error) {
        if (error instanceof Error
            && error.message.startsWith("Task Map native predecessor evidence:")) {
            throw error;
        }
        fail(`${label} must be JSON serializable`);
    }
}
function assertBuildInput(input) {
    assertPlainObject(input, "build input");
    assertExactKeys(input, [
        "taskMapInput",
        "semanticBrainOutput",
        "replay",
        "projection",
        "currentness",
        "projectionFileBytes",
        "currentnessFileBytes",
    ], "build input");
}
function buildTaskMapNativePredecessorEvidence(input) {
    assertBuildInput(input);
    // Harness projections may carry optional own-properties with `undefined`.
    // The durable replay is the exact JSON value that can be read back later.
    const replay = jsonRoundTrip(input.replay, "replay");
    const binding = verifySourcePair({ ...input, replay });
    const core = {
        contractVersion: exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION,
        binding,
        replay,
        taskMapInput: structuredClone(input.taskMapInput),
        semanticBrainOutput: structuredClone(input.semanticBrainOutput),
    };
    return cloneFrozen({
        ...core,
        artifactDigest: artifactDigest(core),
    });
}
function assertContext(context) {
    assertPlainObject(context, "verification context");
    assertExactKeys(context, [
        "projection",
        "currentness",
        "projectionFileBytes",
        "currentnessFileBytes",
    ], "verification context");
}
function assertBindingShape(value) {
    assertPlainObject(value, "binding");
    assertExactKeys(value, [
        "runId",
        "inputDigest",
        "semanticInputDigest",
        "brainOutputDigest",
        "replayDigest",
        "projectionDigest",
        "projectionFileDigest",
        "currentnessFileDigest",
    ], "binding");
    assertBoundedString(value.runId, "binding.runId");
    for (const key of [
        "inputDigest",
        "semanticInputDigest",
        "brainOutputDigest",
        "replayDigest",
        "projectionDigest",
        "projectionFileDigest",
        "currentnessFileDigest",
    ]) {
        assertDigest(value[key], `binding.${key}`);
    }
}
function assertTaskMapNativePredecessorEvidence(value, context) {
    assertContext(context);
    assertJsonTree(value, "evidence");
    assertPlainObject(value, "evidence");
    assertExactKeys(value, [
        "contractVersion",
        "binding",
        "replay",
        "taskMapInput",
        "semanticBrainOutput",
        "artifactDigest",
    ], "evidence");
    if (value.contractVersion
        !== exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION) {
        fail("evidence contractVersion is unsupported");
    }
    assertBindingShape(value.binding);
    assertDigest(value.artifactDigest, "artifactDigest");
    assertTaskMapInputShape(value.taskMapInput);
    assertSemanticBrainShape(value.semanticBrainOutput);
    assertReplay(value.replay, context.projection, value.semanticBrainOutput);
    const evidence = value;
    const { artifactDigest: storedArtifactDigest, ...core } = evidence;
    if (artifactDigest(core) !== storedArtifactDigest) {
        fail("artifactDigest does not authenticate the evidence");
    }
    const expectedBinding = verifySourcePair({
        taskMapInput: evidence.taskMapInput,
        semanticBrainOutput: evidence.semanticBrainOutput,
        replay: evidence.replay,
        ...context,
    });
    if (!sameCanonical(evidence.binding, expectedBinding)) {
        fail("binding digests do not match the fixed predecessor pair");
    }
    return cloneFrozen({
        binding: expectedBinding,
        taskMapInput: evidence.taskMapInput,
        semanticBrainOutput: evidence.semanticBrainOutput,
    });
}
function assertHomeDirectory(value) {
    if (typeof value !== "string"
        || value.length === 0
        || !node_path_1.default.isAbsolute(value)
        || node_path_1.default.normalize(value) !== value
        || Buffer.byteLength(value, "utf8") > 4_096
        || CONTROL_CHARACTER.test(value)) {
        fail("homeDirectory must be a normalized absolute path");
    }
}
function taskMapNativePredecessorEvidencePath(homeDirectory) {
    assertHomeDirectory(homeDirectory);
    return node_path_1.default.join(homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap", EVIDENCE_FILENAME);
}
function fixedPaths(homeDirectory) {
    const evidencePath = taskMapNativePredecessorEvidencePath(homeDirectory);
    const directory = node_path_1.default.dirname(evidencePath);
    return {
        directory,
        evidencePath,
        projectionPath: node_path_1.default.join(directory, PROJECTION_FILENAME),
        currentnessPath: node_path_1.default.join(directory, CURRENTNESS_FILENAME),
    };
}
async function assertPrivateDirectory(directory) {
    const stats = await (0, promises_1.lstat)(directory, { bigint: true });
    const currentUid = typeof process.getuid === "function"
        ? BigInt(process.getuid())
        : stats.uid;
    if (stats.isSymbolicLink()
        || !stats.isDirectory()
        || stats.uid !== currentUid
        || Number(stats.mode & 511n) !== DIRECTORY_MODE
        || await (0, promises_1.realpath)(directory) !== directory) {
        fail("fixed taskmap directory must be an owner-only real 0700 directory");
    }
    return { dev: stats.dev, ino: stats.ino };
}
async function readOwnerOnlyFile(filePath, maximumBytes, label) {
    let handle;
    try {
        handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : before.uid;
        if (!before.isFile()
            || before.uid !== currentUid
            || Number(before.mode & 511n) !== FILE_MODE
            || before.nlink !== 1n
            || before.size < 2n
            || before.size > BigInt(maximumBytes)) {
            fail(`${label} must be an owner-only 0600 regular file`);
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs) {
            fail(`${label} changed during read`);
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            fail(`${label} is not valid JSON`);
        }
        return { parsed, bytes };
    }
    catch (error) {
        if (errnoCode(error) === "ELOOP") {
            fail(`${label} must not be a symbolic link`);
        }
        throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function readFixedContext(homeDirectory) {
    const paths = fixedPaths(homeDirectory);
    await assertPrivateDirectory(paths.directory);
    const projectionFile = await readOwnerOnlyFile(paths.projectionPath, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxProjectionFileBytes, "fixed projection");
    const currentnessFile = await readOwnerOnlyFile(paths.currentnessPath, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxCurrentnessFileBytes, "fixed currentness");
    return {
        paths,
        context: {
            projection: projectionFile.parsed,
            currentness: currentnessFile.parsed,
            projectionFileBytes: projectionFile.bytes,
            currentnessFileBytes: currentnessFile.bytes,
        },
    };
}
function assertLocationInput(input, label) {
    assertPlainObject(input, label);
    assertExactKeys(input, ["homeDirectory"], label);
    assertHomeDirectory(input.homeDirectory);
}
async function loadTaskMapNativePredecessorEvidence(input) {
    assertLocationInput(input, "load input");
    const { paths, context } = await readFixedContext(input.homeDirectory);
    const evidenceFile = await readOwnerOnlyFile(paths.evidencePath, exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxEvidenceFileBytes, "fixed predecessor evidence");
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(evidenceFile.parsed)
        !== evidenceFile.bytes.toString("utf8")) {
        fail("fixed predecessor evidence bytes are not canonical");
    }
    return assertTaskMapNativePredecessorEvidence(evidenceFile.parsed, context);
}
async function assertExistingEvidenceTarget(evidencePath) {
    try {
        const stats = await (0, promises_1.lstat)(evidencePath, { bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : stats.uid;
        if (stats.isSymbolicLink()
            || !stats.isFile()
            || stats.uid !== currentUid
            || Number(stats.mode & 511n) !== FILE_MODE
            || stats.nlink !== 1n
            || stats.size < 2n
            || stats.size > BigInt(exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
                .maxEvidenceFileBytes)) {
            fail("existing predecessor evidence target is unsafe");
        }
    }
    catch (error) {
        if (errnoCode(error) === "ENOENT")
            return;
        throw error;
    }
}
function assertWriteInput(input) {
    assertPlainObject(input, "write input");
    assertExactKeys(input, ["homeDirectory", "evidence"], "write input");
    assertHomeDirectory(input.homeDirectory);
}
async function writeTaskMapNativePredecessorEvidence(input) {
    assertWriteInput(input);
    const { paths, context } = await readFixedContext(input.homeDirectory);
    assertTaskMapNativePredecessorEvidence(input.evidence, context);
    const bytes = (0, source_contracts_js_1.taskMapContractCanonicalJson)(input.evidence);
    if (Buffer.byteLength(bytes, "utf8")
        > exports.TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
            .maxEvidenceFileBytes) {
        fail("predecessor evidence exceeds its file bound");
    }
    const parentReceipt = await assertPrivateDirectory(paths.directory);
    await assertExistingEvidenceTarget(paths.evidencePath);
    const stagePath = node_path_1.default.join(paths.directory, `.predecessor-evidence-${(0, node_crypto_1.randomBytes)(16).toString("hex")}.tmp`);
    let stageExists = false;
    let stageHandle;
    try {
        stageHandle = await (0, promises_1.open)(stagePath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, FILE_MODE);
        stageExists = true;
        await stageHandle.writeFile(bytes, "utf8");
        await stageHandle.sync();
        const stageStats = await stageHandle.stat({ bigint: true });
        if (!stageStats.isFile()
            || Number(stageStats.mode & 511n) !== FILE_MODE
            || stageStats.nlink !== 1n
            || stageStats.size !== BigInt(Buffer.byteLength(bytes, "utf8"))) {
            fail("staged predecessor evidence is unsafe");
        }
        await stageHandle.close();
        stageHandle = undefined;
        const parentNow = await (0, promises_1.lstat)(paths.directory, { bigint: true });
        if (parentNow.dev !== parentReceipt.dev
            || parentNow.ino !== parentReceipt.ino
            || Number(parentNow.mode & 511n) !== DIRECTORY_MODE) {
            fail("fixed taskmap directory changed during write");
        }
        await assertExistingEvidenceTarget(paths.evidencePath);
        await (0, promises_1.rename)(stagePath, paths.evidencePath);
        stageExists = false;
        const directoryHandle = await (0, promises_1.open)(paths.directory, node_fs_1.constants.O_RDONLY);
        await directoryHandle.sync().finally(() => directoryHandle.close());
    }
    finally {
        await stageHandle?.close().catch(() => undefined);
        if (stageExists) {
            await (0, promises_1.unlink)(stagePath).catch(() => undefined);
        }
    }
    return loadTaskMapNativePredecessorEvidence({
        homeDirectory: input.homeDirectory,
    });
}
