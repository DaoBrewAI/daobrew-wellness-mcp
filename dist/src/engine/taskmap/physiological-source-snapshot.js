"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMapPhysiologicalSourceUnavailableError = exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1 = exports.TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS = exports.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS = exports.TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION = exports.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION = void 0;
exports.buildTaskMapPhysiologicalSourceSnapshot = buildTaskMapPhysiologicalSourceSnapshot;
exports.assertTaskMapPhysiologicalSourceSnapshot = assertTaskMapPhysiologicalSourceSnapshot;
exports.assessTaskMapPhysiologicalSourceSnapshot = assessTaskMapPhysiologicalSourceSnapshot;
exports.serializeTaskMapPhysiologicalSourceSnapshot = serializeTaskMapPhysiologicalSourceSnapshot;
exports.loadTaskMapPhysiologicalSourceSnapshot = loadTaskMapPhysiologicalSourceSnapshot;
exports.writeTaskMapPhysiologicalSourceSnapshotAtomic = writeTaskMapPhysiologicalSourceSnapshotAtomic;
exports.refreshTaskMapPhysiologicalSourceSnapshot = refreshTaskMapPhysiologicalSourceSnapshot;
exports.buildTaskMapPhysiologicalOwnerSlice = buildTaskMapPhysiologicalOwnerSlice;
exports.buildTaskMapPhysiologicalSemanticContext = buildTaskMapPhysiologicalSemanticContext;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const oura_taskmap_context_js_1 = require("../../health/oura-taskmap-context.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION = "taskmap-physiological-source-snapshot.v1";
exports.TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION = "taskmap-physiological-source-producer.1";
exports.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS = 4 * 60 * 60 * 1_000;
exports.TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS = 90;
exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1 = Object.freeze({
    maximumHistoryDays: 90,
    maximumFileBytes: 128 * 1_024,
    maximumSourceRecordCount: 10_000_000,
});
const DAY_MS = 24 * 60 * 60 * 1_000;
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z][a-z0-9_]{1,31}_[a-f0-9]{16}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const PROVIDER_BINDING_DOMAIN = "taskmap-physiological-owner-local-provider-binding.1";
const SEMANTIC_POINTER_DOMAIN = "taskmap-physiological-semantic-pointer.1";
const SEMANTIC_EVENT_DOMAIN = "taskmap-physiological-semantic-event.1";
const SAFE_RECORD_DOMAIN = "taskmap-physiological-native-safe-record.1";
class TaskMapPhysiologicalSourceUnavailableError extends Error {
    code;
    constructor(code) {
        super(`Task Map physiological source unavailable: ${code}`);
        this.code = code;
        this.name = "TaskMapPhysiologicalSourceUnavailableError";
    }
}
exports.TaskMapPhysiologicalSourceUnavailableError = TaskMapPhysiologicalSourceUnavailableError;
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertRecord(value, label) {
    if (!isRecord(value))
        throw new Error(`${label} must be an object`);
}
function assertExactKeys(value, keys, label) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length
        || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} contains an unexpected field`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string" || CONTROL_CHARACTER.test(value)) {
        throw new Error(`${label} must be a canonical timestamp`);
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
        throw new Error(`${label} must be a canonical timestamp`);
    }
    return value;
}
function clockTimestamp(clock) {
    let value;
    try {
        value = clock();
    }
    catch {
        throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
    }
    return value.toISOString();
}
function dayTimestamp(day, label) {
    if (typeof day !== "string" || !DAY_KEY.test(day)) {
        throw new Error(`${label} must be a real day`);
    }
    const parsed = Date.parse(`${day}T00:00:00.000Z`);
    if (!Number.isFinite(parsed)
        || new Date(parsed).toISOString().slice(0, 10) !== day) {
        throw new Error(`${label} must be a real day`);
    }
    return parsed;
}
function inclusiveDays(startDay, endDay) {
    const startMs = dayTimestamp(startDay, "coverage startDay");
    const endMs = dayTimestamp(endDay, "coverage endDay");
    if (startMs > endMs)
        throw new Error("physiological coverage is reversed");
    const count = Math.floor((endMs - startMs) / DAY_MS) + 1;
    if (count > exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumHistoryDays) {
        throw new Error("physiological coverage exceeds the bounded history");
    }
    return Array.from({ length: count }, (_, index) => new Date(startMs + index * DAY_MS).toISOString().slice(0, 10));
}
function boundedCount(value, label) {
    if (!Number.isInteger(value)
        || Number(value) < 0
        || Number(value)
            > exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumSourceRecordCount) {
        throw new Error(`${label} must be a bounded count`);
    }
    return Number(value);
}
function stableId(prefix, value) {
    return `${prefix}_${(0, source_contracts_js_1.taskMapContractDigest)(value).slice(0, 16)}`;
}
function snapshotDigestInput(snapshot) {
    return {
        contractVersion: snapshot.contractVersion,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        producerVersion: snapshot.producerVersion,
        sourceFamily: snapshot.sourceFamily,
        producedAt: snapshot.producedAt,
        validThrough: snapshot.validThrough,
        readReceipt: snapshot.readReceipt,
        coverage: snapshot.coverage,
        days: snapshot.days,
        privacy: snapshot.privacy,
    };
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function providerBindingDigest(context, ownerScopeDigest) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: PROVIDER_BINDING_DOMAIN,
        ownerScopeDigest,
        sourceKind: context.sourceKind,
        connection: "owner_local_direct_oauth",
    });
}
function sourceRecordCount(context) {
    const result = [
        context.coverage.dailyActivityDays,
        context.coverage.dailyReadinessDays,
        context.coverage.dailySleepDays,
        context.coverage.sleepRecords,
        context.coverage.heartRateSamples,
    ].reduce((sum, value) => sum + value, 0);
    return boundedCount(result, "sourceRecordCount");
}
function buildTaskMapPhysiologicalSourceSnapshot(context, ownerScopeDigest, requestedAtInput, completedAtInput) {
    (0, oura_taskmap_context_js_1.assertOwnerSafeOuraTaskMapContext)(context);
    if (!SHA256.test(ownerScopeDigest)) {
        throw new Error("physiological owner scope digest is invalid");
    }
    const requestedAt = canonicalTimestamp(requestedAtInput, "requestedAt");
    const completedAt = canonicalTimestamp(completedAtInput, "completedAt");
    const sourceObservedAt = canonicalTimestamp(new Date(Date.parse(context.generatedAt)).toISOString(), "sourceObservedAt");
    const requestedAtMs = Date.parse(requestedAt);
    const completedAtMs = Date.parse(completedAt);
    const sourceObservedAtMs = Date.parse(sourceObservedAt);
    if (requestedAtMs > sourceObservedAtMs
        || sourceObservedAtMs > completedAtMs) {
        throw new Error("live provider receipt timestamps are inconsistent");
    }
    const days = context.days.map((day) => ({
        dayKey: day.dayKey,
        axis: day.axis,
        category: day.category,
    }));
    const observedDays = days.filter((day) => day.category !== "unknown").length;
    const base = {
        contractVersion: exports.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION,
        ownerScopeDigest,
        producerVersion: exports.TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION,
        sourceFamily: "physiological",
        producedAt: completedAt,
        validThrough: new Date(completedAtMs + exports.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS).toISOString(),
        readReceipt: {
            mode: "live_provider_read",
            outcome: "succeeded",
            requestedAt,
            completedAt,
            sourceObservedAt,
            providerBindingDigest: providerBindingDigest(context, ownerScopeDigest),
            safeContextDigest: (0, source_contracts_js_1.taskMapContractDigest)(context),
        },
        coverage: {
            startDay: context.coverage.startDay,
            endDay: context.coverage.endDay,
            observedDays,
            classifiedDays: context.coverage.classifiedDays,
            unknownDays: context.coverage.unknownDays,
            sourceRecordCount: sourceRecordCount(context),
        },
        days,
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
            credentialsStored: false,
        },
    };
    const snapshotDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const snapshot = {
        ...base,
        snapshotId: stableId("tmps", snapshotDigest),
        snapshotDigest,
    };
    assertTaskMapPhysiologicalSourceSnapshot(snapshot);
    return deepFreeze(snapshot);
}
function assertTaskMapPhysiologicalSourceSnapshot(value) {
    assertRecord(value, "physiological source snapshot");
    assertExactKeys(value, [
        "contractVersion",
        "ownerScopeDigest",
        "snapshotId",
        "snapshotDigest",
        "producerVersion",
        "sourceFamily",
        "producedAt",
        "validThrough",
        "readReceipt",
        "coverage",
        "days",
        "privacy",
    ], "physiological source snapshot");
    if (value.contractVersion
        !== exports.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION
        || typeof value.ownerScopeDigest !== "string"
        || !SHA256.test(value.ownerScopeDigest)
        || value.producerVersion
            !== exports.TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION
        || value.sourceFamily !== "physiological"
        || typeof value.snapshotId !== "string"
        || !STABLE_ID.test(value.snapshotId)
        || typeof value.snapshotDigest !== "string"
        || !SHA256.test(value.snapshotDigest)) {
        throw new Error("physiological source snapshot identity is invalid");
    }
    const producedAt = canonicalTimestamp(value.producedAt, "producedAt");
    const validThrough = canonicalTimestamp(value.validThrough, "validThrough");
    if (Date.parse(validThrough) - Date.parse(producedAt)
        !== exports.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS) {
        throw new Error("physiological source validity interval is invalid");
    }
    assertRecord(value.readReceipt, "readReceipt");
    assertExactKeys(value.readReceipt, [
        "mode",
        "outcome",
        "requestedAt",
        "completedAt",
        "sourceObservedAt",
        "providerBindingDigest",
        "safeContextDigest",
    ], "readReceipt");
    const requestedAt = canonicalTimestamp(value.readReceipt.requestedAt, "readReceipt.requestedAt");
    const completedAt = canonicalTimestamp(value.readReceipt.completedAt, "readReceipt.completedAt");
    const sourceObservedAt = canonicalTimestamp(value.readReceipt.sourceObservedAt, "readReceipt.sourceObservedAt");
    if (value.readReceipt.mode !== "live_provider_read"
        || value.readReceipt.outcome !== "succeeded"
        || completedAt !== producedAt
        || Date.parse(requestedAt) > Date.parse(sourceObservedAt)
        || Date.parse(sourceObservedAt) > Date.parse(completedAt)
        || typeof value.readReceipt.providerBindingDigest !== "string"
        || !SHA256.test(value.readReceipt.providerBindingDigest)
        || typeof value.readReceipt.safeContextDigest !== "string"
        || !SHA256.test(value.readReceipt.safeContextDigest)) {
        throw new Error("physiological live-read receipt is invalid");
    }
    assertRecord(value.coverage, "coverage");
    assertExactKeys(value.coverage, [
        "startDay",
        "endDay",
        "observedDays",
        "classifiedDays",
        "unknownDays",
        "sourceRecordCount",
    ], "coverage");
    if (typeof value.coverage.startDay !== "string"
        || typeof value.coverage.endDay !== "string") {
        throw new Error("physiological coverage days are invalid");
    }
    const expectedDays = inclusiveDays(value.coverage.startDay, value.coverage.endDay);
    if (!Array.isArray(value.days)
        || value.days.length !== expectedDays.length) {
        throw new Error("physiological day coverage is incomplete");
    }
    const categories = new Set([
        "below_baseline",
        "within_baseline",
        "above_baseline",
        "unknown",
    ]);
    value.days.forEach((day, index) => {
        assertRecord(day, "physiological day");
        assertExactKeys(day, ["dayKey", "axis", "category"], "physiological day");
        if (day.dayKey !== expectedDays[index]
            || day.axis !== "composite_recovery"
            || !categories.has(day.category)) {
            throw new Error("physiological day is invalid");
        }
    });
    const classifiedDays = value.days.filter((day) => day.category !== "unknown").length;
    const observedDays = boundedCount(value.coverage.observedDays, "coverage.observedDays");
    const declaredClassifiedDays = boundedCount(value.coverage.classifiedDays, "coverage.classifiedDays");
    const unknownDays = boundedCount(value.coverage.unknownDays, "coverage.unknownDays");
    boundedCount(value.coverage.sourceRecordCount, "coverage.sourceRecordCount");
    if (observedDays !== classifiedDays
        || declaredClassifiedDays !== classifiedDays
        || unknownDays !== value.days.length - classifiedDays) {
        throw new Error("physiological coverage counts do not match its days");
    }
    assertRecord(value.privacy, "privacy");
    assertExactKeys(value.privacy, [
        "rawBiometricsStored",
        "sourceBodiesStored",
        "localPathsStored",
        "credentialsStored",
    ], "privacy");
    if (value.privacy.rawBiometricsStored !== false
        || value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.credentialsStored !== false) {
        throw new Error("physiological privacy boundary is invalid");
    }
    const typedSnapshot = value;
    const expectedDigest = (0, source_contracts_js_1.taskMapContractDigest)(snapshotDigestInput(typedSnapshot));
    if (typedSnapshot.snapshotDigest !== expectedDigest
        || typedSnapshot.snapshotId !== stableId("tmps", expectedDigest)) {
        throw new Error("physiological snapshot digest is invalid");
    }
}
function unknownVersion(value) {
    if (!isRecord(value))
        return false;
    return (typeof value.contractVersion === "string"
        && value.contractVersion
            !== exports.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION) || (typeof value.producerVersion === "string"
        && value.producerVersion
            !== exports.TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION);
}
function unavailableAssessment(decision, assessedAt, detailCode) {
    return {
        decision,
        eligibleForCurrentRefresh: false,
        assessedAt,
        snapshot: null,
        detailCode,
    };
}
function assessTaskMapPhysiologicalSourceSnapshot(value, assessedAtInput, expectedOwnerScopeDigest) {
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    if (!SHA256.test(expectedOwnerScopeDigest)) {
        return unavailableAssessment("malformed", assessedAt, "snapshot_contract_validation_failed");
    }
    if (unknownVersion(value)) {
        return unavailableAssessment("unknown_version", assessedAt, "unsupported_snapshot_or_producer_version");
    }
    try {
        assertTaskMapPhysiologicalSourceSnapshot(value);
    }
    catch {
        return unavailableAssessment("malformed", assessedAt, "snapshot_contract_validation_failed");
    }
    const snapshot = value;
    if (snapshot.ownerScopeDigest !== expectedOwnerScopeDigest) {
        return unavailableAssessment("malformed", assessedAt, "snapshot_contract_validation_failed");
    }
    if (Date.parse(assessedAt) < Date.parse(snapshot.producedAt)) {
        return {
            decision: "malformed",
            eligibleForCurrentRefresh: false,
            assessedAt,
            snapshot,
            detailCode: "assessment_precedes_production",
        };
    }
    if (assessedAt === snapshot.validThrough) {
        return {
            decision: "boundary_due",
            eligibleForCurrentRefresh: false,
            assessedAt,
            snapshot,
            detailCode: "four_hour_boundary_due",
        };
    }
    if (Date.parse(assessedAt) > Date.parse(snapshot.validThrough)) {
        return {
            decision: "stale",
            eligibleForCurrentRefresh: false,
            assessedAt,
            snapshot,
            detailCode: "four_hour_max_age_exceeded",
        };
    }
    return {
        decision: "fresh",
        eligibleForCurrentRefresh: true,
        assessedAt,
        snapshot,
        detailCode: "within_four_hour_half_open_interval",
    };
}
function validSnapshotPath(snapshotPath) {
    return (typeof snapshotPath === "string"
        && node_path_1.default.isAbsolute(snapshotPath)
        && node_path_1.default.normalize(snapshotPath) === snapshotPath
        && !CONTROL_CHARACTER.test(snapshotPath));
}
function errorCode(value) {
    return isRecord(value) && typeof value.code === "string"
        ? value.code
        : undefined;
}
function serializeTaskMapPhysiologicalSourceSnapshot(snapshot) {
    assertTaskMapPhysiologicalSourceSnapshot(snapshot);
    return `${JSON.stringify(snapshot, null, 2)}\n`;
}
async function loadTaskMapPhysiologicalSourceSnapshot(snapshotPath, assessedAtInput, expectedOwnerScopeDigest) {
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    if (!validSnapshotPath(snapshotPath)) {
        return unavailableAssessment("malformed", assessedAt, "snapshot_path_invalid");
    }
    let handle;
    try {
        handle = await (0, promises_1.open)(snapshotPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const expectedUid = typeof process.getuid === "function"
            ? process.getuid()
            : before.uid;
        if (!before.isFile()
            || before.uid !== BigInt(expectedUid)
            || before.nlink !== 1n
            || (before.mode & 4095n) !== 384n
            || before.size < 2n
            || before.size
                > BigInt(exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumFileBytes)) {
            return unavailableAssessment("malformed", assessedAt, "snapshot_file_authentication_failed");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (BigInt(bytes.byteLength) !== before.size
            || after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mode !== before.mode
            || after.nlink !== before.nlink
            || after.uid !== before.uid
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs) {
            return unavailableAssessment("malformed", assessedAt, "snapshot_file_changed_during_read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            return unavailableAssessment("malformed", assessedAt, "snapshot_json_parse_failed");
        }
        const assessed = assessTaskMapPhysiologicalSourceSnapshot(parsed, assessedAt, expectedOwnerScopeDigest);
        if (assessed.snapshot !== null
            && bytes.toString("utf8")
                !== serializeTaskMapPhysiologicalSourceSnapshot(assessed.snapshot)) {
            return unavailableAssessment("malformed", assessedAt, "snapshot_serialization_noncanonical");
        }
        return assessed;
    }
    catch (error) {
        if (errorCode(error) === "ENOENT") {
            return unavailableAssessment("missing", assessedAt, "snapshot_file_missing");
        }
        return unavailableAssessment("malformed", assessedAt, "snapshot_file_open_failed");
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function ensurePrivateDirectory(directory) {
    try {
        const metadata = await (0, promises_1.lstat)(directory);
        const expectedUid = typeof process.getuid === "function"
            ? process.getuid()
            : metadata.uid;
        if (!metadata.isDirectory()
            || metadata.isSymbolicLink()
            || metadata.uid !== expectedUid) {
            throw new Error("physiological snapshot parent is not private");
        }
    }
    catch (error) {
        if (errorCode(error) !== "ENOENT")
            throw error;
        await (0, promises_1.mkdir)(directory, { recursive: true, mode: 0o700 });
    }
    await (0, promises_1.chmod)(directory, 0o700);
}
async function writeTaskMapPhysiologicalSourceSnapshotAtomic(outputPath, snapshot) {
    if (!validSnapshotPath(outputPath)) {
        throw new Error("physiological snapshot output path must be absolute");
    }
    const serialized = serializeTaskMapPhysiologicalSourceSnapshot(snapshot);
    if (Buffer.byteLength(serialized)
        > exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumFileBytes) {
        throw new Error("physiological snapshot exceeds its file limit");
    }
    const directory = node_path_1.default.dirname(outputPath);
    await ensurePrivateDirectory(directory);
    const temporaryDirectory = await (0, promises_1.mkdtemp)(node_path_1.default.join(directory, ".physiological-source-"));
    await (0, promises_1.chmod)(temporaryDirectory, 0o700);
    const temporaryPath = node_path_1.default.join(temporaryDirectory, "snapshot.json");
    let handle;
    let published = false;
    try {
        handle = await (0, promises_1.open)(temporaryPath, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, 0o600);
        await handle.writeFile(serialized, "utf8");
        await handle.chmod(0o600);
        await handle.sync();
        const metadata = await handle.stat();
        if (!metadata.isFile()
            || metadata.nlink !== 1
            || (metadata.mode & 0o777) !== 0o600
            || metadata.size !== Buffer.byteLength(serialized)) {
            throw new Error("temporary physiological snapshot is invalid");
        }
        await handle.close();
        handle = undefined;
        await (0, promises_1.rename)(temporaryPath, outputPath);
        published = true;
    }
    finally {
        await handle?.close().catch(() => undefined);
        if (!published)
            await (0, promises_1.unlink)(temporaryPath).catch(() => undefined);
        await (0, promises_1.rmdir)(temporaryDirectory).catch(() => undefined);
    }
}
function rangeForRequest(requestedAt, historyDays) {
    const endDate = requestedAt.slice(0, 10);
    const endMs = dayTimestamp(endDate, "request day");
    return {
        startDate: new Date(endMs - (historyDays - 1) * DAY_MS).toISOString().slice(0, 10),
        endDate,
    };
}
async function defaultProviderReader(options) {
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options);
}
async function refreshTaskMapPhysiologicalSourceSnapshot(options) {
    if (!isRecord(options) || !validSnapshotPath(options.outputPath)) {
        throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
    }
    const historyDays = options.historyDays
        ?? exports.TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS;
    if (!Number.isInteger(historyDays)
        || historyDays < 1
        || historyDays
            > exports.TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1.maximumHistoryDays
        || (options.force !== undefined && typeof options.force !== "boolean")
        || typeof options.ownerScopeDigest !== "string"
        || !SHA256.test(options.ownerScopeDigest)
        || (options.readProviderContext !== undefined
            && typeof options.readProviderContext !== "function")
        || (options.clock !== undefined && typeof options.clock !== "function")) {
        throw new TaskMapPhysiologicalSourceUnavailableError("invalid_request");
    }
    const clock = options.clock ?? (() => new Date());
    const requestedAt = clockTimestamp(clock);
    if (options.force !== true) {
        const current = await loadTaskMapPhysiologicalSourceSnapshot(options.outputPath, requestedAt, options.ownerScopeDigest);
        if (current.decision === "fresh" && current.snapshot !== null) {
            return current.snapshot;
        }
    }
    const range = rangeForRequest(requestedAt, historyDays);
    const reader = options.readProviderContext ?? defaultProviderReader;
    let context;
    try {
        context = await reader({
            ...range,
            now: new Date(requestedAt),
        });
        (0, oura_taskmap_context_js_1.assertOwnerSafeOuraTaskMapContext)(context);
        if (context.coverage.startDay !== range.startDate
            || context.coverage.endDay !== range.endDate
            || new Date(Date.parse(context.generatedAt)).toISOString()
                !== requestedAt) {
            throw new Error("provider context is not bound to this read attempt");
        }
    }
    catch {
        throw new TaskMapPhysiologicalSourceUnavailableError("provider_error");
    }
    let snapshot;
    try {
        const completedAt = clockTimestamp(clock);
        snapshot = buildTaskMapPhysiologicalSourceSnapshot(context, options.ownerScopeDigest, requestedAt, completedAt);
    }
    catch {
        throw new TaskMapPhysiologicalSourceUnavailableError("provider_error");
    }
    try {
        await writeTaskMapPhysiologicalSourceSnapshotAtomic(options.outputPath, snapshot);
    }
    catch {
        throw new TaskMapPhysiologicalSourceUnavailableError("publication_error");
    }
    return snapshot;
}
function requireFreshSnapshot(snapshot, assessedAt, expectedOwnerScopeDigest) {
    const assessment = assessTaskMapPhysiologicalSourceSnapshot(snapshot, assessedAt, expectedOwnerScopeDigest);
    if (assessment.decision !== "fresh"
        || assessment.snapshot === null) {
        throw new TaskMapPhysiologicalSourceUnavailableError("snapshot_not_fresh");
    }
    return assessment.snapshot;
}
function buildTaskMapPhysiologicalOwnerSlice(snapshotInput, assessedAt, ownerScopeDigest) {
    const snapshot = requireFreshSnapshot(snapshotInput, assessedAt, ownerScopeDigest);
    const value = {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        ownerScopeDigest,
        source: "body",
        recordCount: 1,
        records: [{
                identityDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: SAFE_RECORD_DOMAIN,
                    providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
                }),
                revision: snapshot.snapshotDigest,
                occurredAtMs: Date.parse(snapshot.readReceipt.sourceObservedAt),
            }],
        metadata: {
            sourceSnapshotVersion: snapshot.contractVersion,
            producerVersion: snapshot.producerVersion,
            producedAtMs: Date.parse(snapshot.producedAt),
            validThroughMs: Date.parse(snapshot.validThrough),
            sourceObservedAtMs: Date.parse(snapshot.readReceipt.sourceObservedAt),
            liveReadReceiptDigest: (0, source_contracts_js_1.taskMapContractDigest)(snapshot.readReceipt),
            coverageStartDay: snapshot.coverage.startDay,
            coverageEndDay: snapshot.coverage.endDay,
            observedDays: snapshot.coverage.observedDays,
            classifiedDays: snapshot.coverage.classifiedDays,
            unknownDays: snapshot.coverage.unknownDays,
        },
    };
    return deepFreeze({
        ownerScopeDigest,
        revision: snapshot.snapshotDigest,
        sliceDigest: (0, source_contracts_js_1.taskMapContractDigest)(value),
        value,
    });
}
function bodySummary(category) {
    switch (category) {
        case "below_baseline":
            return "Combined Readiness + Sleep was below your usual recent range. This does not prove any work caused the change.";
        case "within_baseline":
            return "Combined Readiness + Sleep was within your usual recent range.";
        case "above_baseline":
            return "Combined Readiness + Sleep was above your usual recent range. This does not prove any work caused the change.";
        case "unknown":
            return "Readiness + Sleep did not provide enough data for this day.";
    }
}
function buildTaskMapPhysiologicalSemanticContext(snapshotInput, assessedAt, expectedOwnerScopeDigest) {
    const snapshot = requireFreshSnapshot(snapshotInput, assessedAt, expectedOwnerScopeDigest);
    const semanticIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: SEMANTIC_POINTER_DOMAIN,
        providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
    });
    const pointerId = stableId("physource", semanticIdentityDigest);
    const pointer = {
        id: pointerId,
        // The frozen Task Map schema has one current body-provider provenance kind.
        // Provider identity never enters user-facing title or summary copy.
        sourceKind: "oura",
        sourceObjectId: snapshot.readReceipt.providerBindingDigest,
        sourceRefHash: semanticIdentityDigest,
        sourceVersion: snapshot.snapshotDigest,
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
    };
    const sourceBinding = {
        pointerId,
        semanticClass: "body_context",
        semanticOriginId: "physiological_source",
        semanticIdentityDigest,
        sourceIdentityDigest: snapshot.readReceipt.providerBindingDigest,
        observedRevision: snapshot.snapshotDigest,
        evidenceRevision: snapshot.snapshotDigest,
        observedContentDigest: snapshot.snapshotDigest,
        evidenceContentDigest: snapshot.snapshotDigest,
    };
    const events = snapshot.days.map((day) => {
        const eventIdentity = {
            domain: SEMANTIC_EVENT_DOMAIN,
            providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
            dayKey: day.dayKey,
            axis: day.axis,
            category: day.category,
        };
        return {
            id: stableId("physioevent", eventIdentity),
            pointerId,
            recordKind: "body_context",
            activity: "body_window_observed",
            occurredAt: `${day.dayKey}T00:00:00.000Z`,
            observedAt: snapshot.readReceipt.completedAt,
            dayKey: day.dayKey,
            objectRefs: [
                `physiological:${(0, source_contracts_js_1.taskMapContractDigest)({
                    domain: SEMANTIC_EVENT_DOMAIN,
                    providerBindingDigest: snapshot.readReceipt.providerBindingDigest,
                    dayKey: day.dayKey,
                    axis: day.axis,
                })}`,
            ],
            title: "Body context",
            summary: bodySummary(day.category),
            extractionConfidence: 1,
            bodyCategory: day.category,
            bodyAxis: day.axis,
            bodyJoinEligible: false,
        };
    });
    const evidenceBindings = events.map((event) => ({
        eventId: event.id,
        disposition: "body_only",
        rootLinkRefs: [],
    }));
    return deepFreeze({
        pointers: [pointer],
        events,
        sourceBindings: [sourceBinding],
        evidenceBindings,
    });
}
