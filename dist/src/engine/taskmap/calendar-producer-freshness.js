"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CALENDAR_LIMITS_V1 = exports.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN = exports.TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN = exports.TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN = exports.TASKMAP_LOCAL_CALENDAR_EVENT_IDENTITY_DOMAIN = exports.TASKMAP_CALENDAR_MAX_AGE_MS = exports.TASKMAP_CALENDAR_OWNER_SCOPE_DOMAIN = exports.TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION = exports.TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION = exports.TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION = exports.TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION = void 0;
exports.taskMapCalendarOwnerScopeDigest = taskMapCalendarOwnerScopeDigest;
exports.taskMapCalendarFieldDigest = taskMapCalendarFieldDigest;
exports.buildTaskMapLocalCalendarExport = buildTaskMapLocalCalendarExport;
exports.taskMapLocalCalendarExportCanonicalJson = taskMapLocalCalendarExportCanonicalJson;
exports.buildTaskMapGoogleCalendarProviderSnapshot = buildTaskMapGoogleCalendarProviderSnapshot;
exports.taskMapGoogleCalendarProviderSnapshotCanonicalJson = taskMapGoogleCalendarProviderSnapshotCanonicalJson;
exports.assertTaskMapLocalCalendarExport = assertTaskMapLocalCalendarExport;
exports.assertTaskMapGoogleCalendarProviderSnapshot = assertTaskMapGoogleCalendarProviderSnapshot;
exports.loadTaskMapCalendarProducerResult = loadTaskMapCalendarProducerResult;
exports.taskMapGoogleCalendarProviderSnapshotPath = taskMapGoogleCalendarProviderSnapshotPath;
exports.taskMapCalendarResultCanonicalJson = taskMapCalendarResultCanonicalJson;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const source_contracts_js_1 = require("./source-contracts.js");
const owner_scope_js_1 = require("./owner-scope.js");
exports.TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION = "taskmap-local-calendar-export.v1";
exports.TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION = "taskmap-google-calendar-provider-snapshot.v1";
exports.TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION = "taskmap-calendar-producer-result.v1";
exports.TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION = "taskmap-google-calendar-api.1";
exports.TASKMAP_CALENDAR_OWNER_SCOPE_DOMAIN = "taskmap-owner-local.1";
exports.TASKMAP_CALENDAR_MAX_AGE_MS = 14_400_000;
exports.TASKMAP_LOCAL_CALENDAR_EVENT_IDENTITY_DOMAIN = "taskmap-local-calendar-event.1";
exports.TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN = "taskmap-google-calendar-event.1";
exports.TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN = "taskmap-calendar-cross-provider.1";
exports.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN = "taskmap-calendar-event-revision.1";
exports.TASKMAP_CALENDAR_LIMITS_V1 = Object.freeze({
    maxEventsPerProvider: 256,
    maxFileBytes: 256 * 1_024,
});
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const CREDENTIAL_ASSIGNMENT = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i;
const PROVIDER_TOKEN = /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const URI_SCHEME = /\b[a-z][a-z0-9+.-]{1,31}:\/\//i;
const OWNER_LOCAL_ABSOLUTE_PATH = /(?:^|[^A-Za-z0-9_:/\\])(?:\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]+)/;
const PRIVACY = Object.freeze({
    boundedTitlesStored: true,
    attendeesStored: false,
    locationsStored: false,
    notesStored: false,
    urlsStored: false,
    rawProviderIdsStored: false,
    credentialsStored: false,
    localPathsStored: false,
});
const EVENT_KEYS = new Set([
    "eventIdentityDigest",
    "crossProviderIdentityDigest",
    "revisionDigest",
    "title",
    "startAt",
    "endAt",
]);
const LOCAL_EXPORT_KEYS = new Set([
    "contractVersion",
    "ownerScopeDigest",
    "producedAt",
    "validThrough",
    "events",
]);
const GOOGLE_SNAPSHOT_KEYS = new Set([
    "contractVersion",
    "snapshotDigest",
    "producerVersion",
    "ownerScopeDigest",
    "producedAt",
    "validThrough",
    "events",
    "privacy",
]);
const PRIVACY_KEYS = new Set(Object.keys(PRIVACY));
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype
            && Object.getPrototypeOf(value) !== null)) {
        throw new Error(`${label} must be a plain object`);
    }
}
function assertExactKeys(value, keys, label) {
    const actual = Object.keys(value);
    if (actual.length !== keys.size
        || actual.some((key) => !keys.has(key))) {
        throw new Error(`${label} has unsupported or missing keys`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase sha256 digest`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || value.length > 64
        || !STRICT_RFC3339.test(value)) {
        throw new Error(`${label} must be an RFC3339 timestamp`);
    }
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) {
        throw new Error(`${label} must be an RFC3339 timestamp`);
    }
    return new Date(milliseconds).toISOString();
}
function canonicalTitle(value, label) {
    if (typeof value !== "string") {
        throw new Error(`${label} must be a string`);
    }
    const title = value.trim().replace(/\s+/gu, " ");
    if (title.length === 0
        || Array.from(title).length > 96
        || CONTROL_CHARACTER.test(title)
        || EMAIL_ADDRESS.test(title)
        || CREDENTIAL_ASSIGNMENT.test(title)
        || BEARER_SECRET.test(title)
        || PROVIDER_TOKEN.test(title)
        || JWT_SECRET.test(title)
        || URI_SCHEME.test(title)
        || OWNER_LOCAL_ABSOLUTE_PATH.test(title)) {
        throw new Error(`${label} violates the bounded title privacy policy`);
    }
    return title;
}
function assertCanonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || canonicalTimestamp(value, label) !== value) {
        throw new Error(`${label} must be a canonical RFC3339 timestamp`);
    }
}
function normalizeEvent(value, label) {
    assertPlainObject(value, label);
    assertExactKeys(value, EVENT_KEYS, label);
    assertDigest(value.eventIdentityDigest, `${label}.eventIdentityDigest`);
    if (value.crossProviderIdentityDigest !== null) {
        assertDigest(value.crossProviderIdentityDigest, `${label}.crossProviderIdentityDigest`);
    }
    assertDigest(value.revisionDigest, `${label}.revisionDigest`);
    const title = canonicalTitle(value.title, `${label}.title`);
    if (title !== value.title) {
        throw new Error(`${label}.title must be canonical`);
    }
    assertCanonicalTimestamp(value.startAt, `${label}.startAt`);
    assertCanonicalTimestamp(value.endAt, `${label}.endAt`);
    if (Date.parse(value.endAt) < Date.parse(value.startAt)) {
        throw new Error(`${label} ends before it starts`);
    }
    const expectedRevisionDigest = taskMapCalendarFieldDigest(exports.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [
        value.eventIdentityDigest,
        title,
        value.startAt,
        value.endAt,
    ]);
    if (value.revisionDigest !== expectedRevisionDigest) {
        throw new Error(`${label}.revisionDigest does not match its event fields`);
    }
    return {
        eventIdentityDigest: value.eventIdentityDigest,
        crossProviderIdentityDigest: value.crossProviderIdentityDigest,
        revisionDigest: value.revisionDigest,
        title,
        startAt: value.startAt,
        endAt: value.endAt,
    };
}
function normalizeEvents(value, label) {
    if (!Array.isArray(value)
        || value.length > exports.TASKMAP_CALENDAR_LIMITS_V1.maxEventsPerProvider) {
        throw new Error(`${label} exceeds the event limit`);
    }
    const events = value.map((event, index) => normalizeEvent(event, `${label}[${index}]`));
    events.sort((left, right) => left.startAt.localeCompare(right.startAt)
        || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest));
    const identities = new Set();
    for (const event of events) {
        if (identities.has(event.eventIdentityDigest)) {
            throw new Error(`${label} contains a duplicate event identity`);
        }
        identities.add(event.eventIdentityDigest);
    }
    return events;
}
function validThroughFor(producedAt) {
    return new Date(Date.parse(producedAt) + exports.TASKMAP_CALENDAR_MAX_AGE_MS).toISOString();
}
function assertExactFreshnessInterval(producedAt, validThrough, label) {
    if (validThrough !== validThroughFor(producedAt)) {
        throw new Error(`${label} must use the exact four-hour interval`);
    }
}
function taskMapCalendarOwnerScopeDigest(ownerUserId) {
    return (0, owner_scope_js_1.taskMapOwnerScopeDigest)(ownerUserId);
}
function taskMapCalendarFieldDigest(domain, fields) {
    if (domain.length === 0
        || domain.includes("\0")
        || Buffer.byteLength(domain, "utf8") > 256
        || fields.length === 0
        || fields.length > 16) {
        throw new Error("Calendar digest domain or field count is invalid");
    }
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update(domain, "utf8");
    hash.update(Buffer.from([0]));
    for (const field of fields) {
        if (typeof field !== "string"
            || field.includes("\0")
            || Buffer.byteLength(field, "utf8") > 4_096) {
            throw new Error("Calendar digest field is invalid");
        }
        const bytes = Buffer.from(field, "utf8");
        hash.update(String(bytes.byteLength), "utf8");
        hash.update(Buffer.from([0]));
        hash.update(bytes);
        hash.update(Buffer.from([0]));
    }
    return hash.digest("hex");
}
function buildTaskMapLocalCalendarExport(input) {
    assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
    const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
    const events = normalizeEvents([...input.events], "events");
    return {
        contractVersion: exports.TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        producedAt,
        validThrough: validThroughFor(producedAt),
        events,
    };
}
function taskMapLocalCalendarExportCanonicalJson(value) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
}
function googleSnapshotDigest(snapshot) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION,
        snapshot,
    });
}
function buildTaskMapGoogleCalendarProviderSnapshot(input) {
    assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
    const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
    const core = {
        contractVersion: exports.TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION,
        producerVersion: exports.TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        producedAt,
        validThrough: validThroughFor(producedAt),
        events: normalizeEvents([...input.events], "events"),
        privacy: PRIVACY,
    };
    return {
        ...core,
        snapshotDigest: googleSnapshotDigest(core),
    };
}
function taskMapGoogleCalendarProviderSnapshotCanonicalJson(value) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
}
function assertPrivacy(value, label) {
    assertPlainObject(value, label);
    assertExactKeys(value, PRIVACY_KEYS, label);
    for (const key of PRIVACY_KEYS) {
        if (value[key] !== PRIVACY[key]) {
            throw new Error(`${label}.${key} does not match the privacy contract`);
        }
    }
}
function assertTaskMapLocalCalendarExport(value, expectedOwnerScopeDigest) {
    assertPlainObject(value, "local calendar export");
    assertExactKeys(value, LOCAL_EXPORT_KEYS, "local calendar export");
    if (value.contractVersion !== exports.TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION) {
        throw new Error("local calendar export has an unknown version");
    }
    assertDigest(value.ownerScopeDigest, "local calendar ownerScopeDigest");
    assertDigest(expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    if (value.ownerScopeDigest !== expectedOwnerScopeDigest) {
        throw new Error("local calendar export owner does not match");
    }
    assertCanonicalTimestamp(value.producedAt, "local calendar producedAt");
    assertCanonicalTimestamp(value.validThrough, "local calendar validThrough");
    assertExactFreshnessInterval(value.producedAt, value.validThrough, "local calendar export");
    normalizeEvents(value.events, "local calendar events");
}
function assertTaskMapGoogleCalendarProviderSnapshot(value, expectedOwnerScopeDigest) {
    assertPlainObject(value, "Google Calendar snapshot");
    assertExactKeys(value, GOOGLE_SNAPSHOT_KEYS, "Google Calendar snapshot");
    if (value.contractVersion
        !== exports.TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION
        || value.producerVersion !== exports.TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION) {
        throw new Error("Google Calendar snapshot has an unknown version");
    }
    assertDigest(value.snapshotDigest, "Google Calendar snapshotDigest");
    assertDigest(value.ownerScopeDigest, "Google Calendar ownerScopeDigest");
    if (expectedOwnerScopeDigest !== undefined
        && value.ownerScopeDigest !== expectedOwnerScopeDigest) {
        throw new Error("Google Calendar snapshot owner does not match");
    }
    assertCanonicalTimestamp(value.producedAt, "Google Calendar producedAt");
    assertCanonicalTimestamp(value.validThrough, "Google Calendar validThrough");
    assertExactFreshnessInterval(value.producedAt, value.validThrough, "Google Calendar snapshot");
    const events = normalizeEvents(value.events, "Google Calendar events");
    assertPrivacy(value.privacy, "Google Calendar privacy");
    const expectedDigest = googleSnapshotDigest({
        contractVersion: value.contractVersion,
        producerVersion: value.producerVersion,
        ownerScopeDigest: value.ownerScopeDigest,
        producedAt: value.producedAt,
        validThrough: value.validThrough,
        events,
        privacy: PRIVACY,
    });
    if (value.snapshotDigest !== expectedDigest) {
        throw new Error("Google Calendar snapshot digest does not match");
    }
}
async function readOwnerOnlyJson(filePath) {
    if (!node_path_1.default.isAbsolute(filePath) || node_path_1.default.normalize(filePath) !== filePath) {
        throw new Error("Calendar snapshot path must be normalized and absolute");
    }
    const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const stats = await handle.stat({ bigint: true });
        if (!stats.isFile()
            || stats.nlink !== 1n
            || stats.uid !== BigInt(process.getuid?.() ?? -1)
            || (stats.mode & 511n) !== 384n
            || stats.size > BigInt(exports.TASKMAP_CALENDAR_LIMITS_V1.maxFileBytes)) {
            throw new Error("Calendar snapshot is not an owner-only regular file");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (BigInt(bytes.byteLength) !== stats.size
            || after.dev !== stats.dev
            || after.ino !== stats.ino
            || after.size !== stats.size
            || after.mode !== stats.mode
            || after.nlink !== stats.nlink
            || after.uid !== stats.uid
            || after.mtimeNs !== stats.mtimeNs
            || after.ctimeNs !== stats.ctimeNs) {
            throw new Error("Calendar snapshot changed while it was read");
        }
        return { value: JSON.parse(bytes.toString("utf8")), bytes };
    }
    finally {
        await handle.close();
    }
}
function providerStatus(provider, assessedAt, value, failure) {
    if (value === null) {
        return {
            provider,
            freshness: failure ?? "missing",
            producedAt: null,
            validThrough: null,
            eventCount: 0,
            currentInputEligible: false,
        };
    }
    const assessedAtMs = Date.parse(assessedAt);
    const producedAtMs = Date.parse(value.producedAt);
    const validThroughMs = Date.parse(value.validThrough);
    const freshness = assessedAtMs < producedAtMs
        ? "malformed"
        : assessedAtMs < validThroughMs
            ? "current"
            : assessedAtMs === validThroughMs
                ? "boundary_due"
                : "stale";
    return {
        provider,
        freshness,
        producedAt: value.producedAt,
        validThrough: value.validThrough,
        eventCount: value.events.length,
        currentInputEligible: freshness === "current",
    };
}
async function loadLocal(filePath, expectedOwnerScopeDigest) {
    try {
        const { value, bytes } = await readOwnerOnlyJson(filePath);
        assertTaskMapLocalCalendarExport(value, expectedOwnerScopeDigest);
        if (!bytes.equals(Buffer.from(taskMapLocalCalendarExportCanonicalJson(value), "utf8"))) {
            throw new Error("local calendar export is not canonical JSON");
        }
        return { value, failure: null };
    }
    catch (error) {
        const code = error.code;
        return {
            value: null,
            failure: code === "ENOENT" ? "missing" : "malformed",
        };
    }
}
async function loadGoogle(filePath, expectedOwnerScopeDigest) {
    try {
        const { value, bytes } = await readOwnerOnlyJson(filePath);
        assertTaskMapGoogleCalendarProviderSnapshot(value, expectedOwnerScopeDigest);
        if (!bytes.equals(Buffer.from(taskMapGoogleCalendarProviderSnapshotCanonicalJson(value), "utf8"))) {
            throw new Error("Google Calendar snapshot is not canonical JSON");
        }
        return { value, failure: null };
    }
    catch (error) {
        const code = error.code;
        return {
            value: null,
            failure: code === "ENOENT" ? "missing" : "malformed",
        };
    }
}
function dedupeCurrentEvents(sources) {
    const byIdentity = new Map();
    // Google is read first and therefore owns an exact cross-provider match.
    const ordered = [...sources].sort((left, right) => (left.provider === "google_calendar" ? 0 : 1)
        - (right.provider === "google_calendar" ? 0 : 1));
    for (const source of ordered) {
        if (!source.current)
            continue;
        for (const event of source.events) {
            const identity = event.crossProviderIdentityDigest === null
                ? `${source.provider}:${event.eventIdentityDigest}`
                : `cross:${event.crossProviderIdentityDigest}`;
            if (!byIdentity.has(identity)) {
                byIdentity.set(identity, {
                    provider: source.provider,
                    ...event,
                });
            }
        }
    }
    return [...byIdentity.values()].sort((left, right) => left.startAt.localeCompare(right.startAt)
        || left.provider.localeCompare(right.provider)
        || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest));
}
async function loadTaskMapCalendarProducerResult(input) {
    const assessedAt = canonicalTimestamp(input.assessedAt, "assessedAt");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    const [local, google] = await Promise.all([
        loadLocal(input.localExportPath, input.expectedOwnerScopeDigest),
        loadGoogle(input.googleSnapshotPath, input.expectedOwnerScopeDigest),
    ]);
    const providers = [
        providerStatus("local_calendar", assessedAt, local.value, local.failure),
        providerStatus("google_calendar", assessedAt, google.value, google.failure),
    ];
    const events = dedupeCurrentEvents([
        {
            provider: "local_calendar",
            current: providers[0].currentInputEligible,
            events: local.value?.events ?? [],
        },
        {
            provider: "google_calendar",
            current: providers[1].currentInputEligible,
            events: google.value?.events ?? [],
        },
    ]);
    const core = {
        contractVersion: exports.TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
        ownerScopeDigest: input.expectedOwnerScopeDigest,
        availability: providers.some((provider) => provider.currentInputEligible)
            ? "available"
            : "unavailable",
        assessedAt,
        providers,
        events,
        privacy: PRIVACY,
    };
    return {
        ...core,
        resultDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION,
            result: core,
        }),
    };
}
function taskMapGoogleCalendarProviderSnapshotPath(absoluteHome) {
    if (!node_path_1.default.isAbsolute(absoluteHome)
        || node_path_1.default.normalize(absoluteHome) !== absoluteHome) {
        throw new Error("Calendar home path must be normalized and absolute");
    }
    return node_path_1.default.join(absoluteHome, ".daobrew", "taskmap", "calendar-google-provider-snapshot.v1.json");
}
function taskMapCalendarResultCanonicalJson(result) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(result);
}
