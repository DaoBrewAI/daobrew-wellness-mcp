"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveUserId = resolveUserId;
exports.clientOptionsFor = clientOptionsFor;
exports.credentialBoundApiEndpoint = credentialBoundApiEndpoint;
exports.validateTaskMapOwnerEnrollment = validateTaskMapOwnerEnrollment;
exports.assertConfirmedTaskMapOwner = assertConfirmedTaskMapOwner;
exports.loadConfirmedTaskMapOwner = loadConfirmedTaskMapOwner;
exports.loadConfirmedTaskMapOwnerSync = loadConfirmedTaskMapOwnerSync;
exports.resolveCredentialBoundClient = resolveCredentialBoundClient;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const owner_scope_js_1 = require("./engine/taskmap/owner-scope.js");
const user_id_js_1 = require("./user-id.js");
function resolveUserId(config, explicit) {
    const rawCandidate = explicit !== undefined
        ? explicit
        : process.env.DAOBREW_USER_ID !== undefined
            ? process.env.DAOBREW_USER_ID
            : config.user_id ?? "";
    const candidate = (0, user_id_js_1.canonicalUserId)(rawCandidate);
    if (!candidate) {
        return {
            ok: false,
            reason: "no canonical UUID identity - run daobrew setup (MCP) or launch the Sentinel app (Mac) to mint one, or set DAOBREW_USER_ID",
        };
    }
    return { ok: true, userId: candidate };
}
function clientOptionsFor(config, userId) {
    return {
        apiKey: process.env.DAOBREW_API_KEY || config.api_key || "",
        baseUrl: process.env.DAOBREW_API_URL || config.api_url,
        deviceId: userId,
    };
}
const DEVICE_CREDENTIAL_RE = /^dbd_[A-Za-z0-9_-]{28,}$/;
const CONFIRMED_TASKMAP_OWNER_AUTHORITY = Symbol("ConfirmedTaskMapOwnerAuthority");
const confirmedTaskMapOwners = new WeakSet();
const MAX_CONFIRMED_OWNER_CONFIG_BYTES = 64 * 1_024;
/**
 * Resolve an absolute backend route against the credential issuer origin.
 * Persisted enrollment URLs intentionally include `/api/v1`; treating that
 * value as a string prefix would duplicate the API path for device endpoints.
 */
function credentialBoundApiEndpoint(apiUrl, route) {
    return new URL(route, `${apiUrl}/`).toString();
}
function normalizeApiUrl(raw) {
    if (typeof raw !== "string" || !raw.trim())
        return null;
    try {
        const parsed = new URL(raw.trim().replace(/\/+$/, ""));
        const loopback = parsed.hostname === "localhost"
            || parsed.hostname === "127.0.0.1"
            || parsed.hostname === "::1"
            || parsed.hostname === "[::1]";
        if (parsed.username || parsed.password || parsed.search || parsed.hash)
            return null;
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
            return null;
        return parsed.toString().replace(/\/$/, "");
    }
    catch {
        return null;
    }
}
function normalizePersistedHttpsIssuer(raw) {
    if (typeof raw !== "string" || !raw.trim())
        return null;
    try {
        const parsed = new URL(raw.trim().replace(/\/+$/, ""));
        if (parsed.protocol !== "https:"
            || parsed.username
            || parsed.password
            || parsed.search
            || parsed.hash) {
            return null;
        }
        return parsed.toString().replace(/\/$/u, "");
    }
    catch {
        return null;
    }
}
/**
 * Resolve the immutable, persisted enrollment used by production Task Map.
 * Environment values may confirm an already-persisted UUID but can never
 * supply or rebind its credential/issuer authority record.
 */
function validateTaskMapOwnerEnrollment(config, environment = {}, homeDirectory) {
    const configuredRaw = typeof config.user_id === "string"
        ? config.user_id.trim()
        : "";
    const userId = (0, user_id_js_1.canonicalUserId)(configuredRaw);
    if (userId === null || configuredRaw !== userId) {
        return {
            ok: false,
            reason: "Task Map persisted owner must be a canonical uppercase UUID",
        };
    }
    if (environment.userId !== undefined) {
        const explicitRaw = typeof environment.userId === "string"
            ? environment.userId.trim()
            : "";
        const explicit = (0, user_id_js_1.canonicalUserId)(explicitRaw);
        if (explicit === null
            || explicitRaw !== explicit
            || explicit !== userId) {
            return {
                ok: false,
                reason: "Task Map explicit owner identity is unavailable or changed",
            };
        }
    }
    const deviceCredential = typeof config.device_credential === "string"
        ? config.device_credential.trim()
        : "";
    if (config.device_credential_confirmed !== true
        || !DEVICE_CREDENTIAL_RE.test(deviceCredential)) {
        return {
            ok: false,
            reason: "Task Map confirmed device credential is unavailable",
        };
    }
    const issuerUrl = normalizePersistedHttpsIssuer(config.api_url);
    if (issuerUrl === null) {
        return {
            ok: false,
            reason: "Task Map confirmed credential requires a persisted safe HTTPS issuer",
        };
    }
    try {
        const owner = {
            ...(0, owner_scope_js_1.createTaskMapOwnerScope)(userId, homeDirectory),
            deviceCredential,
            issuerUrl,
        };
        return {
            ok: true,
            owner: Object.freeze(owner),
        };
    }
    catch {
        return {
            ok: false,
            reason: "Task Map owner storage scope is unavailable",
        };
    }
}
function confirmPersistedTaskMapOwner(enrollment) {
    const owner = { ...enrollment };
    Object.defineProperty(owner, CONFIRMED_TASKMAP_OWNER_AUTHORITY, {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false,
    });
    confirmedTaskMapOwners.add(owner);
    return Object.freeze(owner);
}
function assertConfirmedTaskMapOwner(value) {
    if (value === null
        || typeof value !== "object"
        || !confirmedTaskMapOwners.has(value)) {
        throw new Error("Task Map confirmed owner authority is unavailable");
    }
    (0, owner_scope_js_1.assertTaskMapOwnerScope)(value);
    const owner = value;
    if (!DEVICE_CREDENTIAL_RE.test(owner.deviceCredential)
        || normalizePersistedHttpsIssuer(owner.issuerUrl) !== owner.issuerUrl) {
        throw new Error("Task Map confirmed owner authority is invalid");
    }
}
function stableBigIntMetadataMatches(expected, actual) {
    return actual.dev === expected.dev
        && actual.ino === expected.ino
        && actual.mode === expected.mode
        && actual.nlink === expected.nlink
        && actual.uid === expected.uid
        && actual.size === expected.size
        && actual.mtimeNs === expected.mtimeNs
        && actual.ctimeNs === expected.ctimeNs;
}
/**
 * Load one installation-persisted enrollment. The path is fixed beneath the
 * supplied OS home; environment values can only confirm its UUID and can
 * never redirect or replace the credential/issuer authority record.
 */
async function loadConfirmedTaskMapOwner(homeDirectory, environment = {}, afterDirectoryOpenForTesting) {
    let directoryHandle;
    let handle;
    try {
        const configDirectory = node_path_1.default.join(homeDirectory, ".daobrew");
        directoryHandle = await (0, promises_1.open)(configDirectory, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY | node_fs_1.constants.O_NOFOLLOW);
        const directory = await directoryHandle.stat({ bigint: true });
        const expectedUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : directory.uid;
        if (!directory.isDirectory()
            || directory.uid !== expectedUid
            || (directory.mode & 63n) !== 0n) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment directory is unsafe",
            };
        }
        await afterDirectoryOpenForTesting?.();
        const configPath = node_path_1.default.join(configDirectory, "config.json");
        handle = await (0, promises_1.open)(configPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        if (!before.isFile()
            || before.uid !== expectedUid
            || before.nlink !== 1n
            || (before.mode & 4095n) !== 384n
            || before.size < 2n
            || before.size > BigInt(MAX_CONFIRMED_OWNER_CONFIG_BYTES)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment is not an owner-only regular file",
            };
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        const directoryAfter = await directoryHandle.stat({ bigint: true });
        const namedDirectory = await (0, promises_1.lstat)(configDirectory, { bigint: true });
        const namedConfig = await (0, promises_1.lstat)(configPath, { bigint: true });
        if (BigInt(bytes.byteLength) !== before.size
            || !stableBigIntMetadataMatches(before, after)
            || !stableBigIntMetadataMatches(directory, directoryAfter)
            || !stableBigIntMetadataMatches(directory, namedDirectory)
            || !stableBigIntMetadataMatches(before, namedConfig)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment changed while it was read",
            };
        }
        const parsed = JSON.parse(bytes.toString("utf8"));
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment is malformed",
            };
        }
        const enrollment = validateTaskMapOwnerEnrollment(parsed, environment, homeDirectory);
        return enrollment.ok
            ? { ok: true, owner: confirmPersistedTaskMapOwner(enrollment.owner) }
            : enrollment;
    }
    catch {
        return {
            ok: false,
            reason: "Task Map confirmed owner enrollment is unavailable",
        };
    }
    finally {
        await handle?.close().catch(() => undefined);
        await directoryHandle?.close().catch(() => undefined);
    }
}
/** Synchronous equivalent for startup/test harnesses that construct services. */
function loadConfirmedTaskMapOwnerSync(homeDirectory, environment = {}, afterDirectoryOpenForTesting) {
    let directoryDescriptor;
    let descriptor;
    try {
        const configDirectory = node_path_1.default.join(homeDirectory, ".daobrew");
        directoryDescriptor = (0, node_fs_1.openSync)(configDirectory, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY | node_fs_1.constants.O_NOFOLLOW);
        const directory = (0, node_fs_1.fstatSync)(directoryDescriptor, { bigint: true });
        const expectedUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : directory.uid;
        if (!directory.isDirectory()
            || directory.uid !== expectedUid
            || (directory.mode & 63n) !== 0n) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment directory is unsafe",
            };
        }
        afterDirectoryOpenForTesting?.();
        const configPath = node_path_1.default.join(configDirectory, "config.json");
        descriptor = (0, node_fs_1.openSync)(configPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = (0, node_fs_1.fstatSync)(descriptor, { bigint: true });
        if (!before.isFile()
            || before.uid !== expectedUid
            || before.nlink !== 1n
            || (before.mode & 4095n) !== 384n
            || before.size < 2n
            || before.size > BigInt(MAX_CONFIRMED_OWNER_CONFIG_BYTES)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment is not an owner-only regular file",
            };
        }
        const bytes = (0, node_fs_1.readFileSync)(descriptor);
        const after = (0, node_fs_1.fstatSync)(descriptor, { bigint: true });
        const directoryAfter = (0, node_fs_1.fstatSync)(directoryDescriptor, { bigint: true });
        const namedDirectory = (0, node_fs_1.lstatSync)(configDirectory, { bigint: true });
        const namedConfig = (0, node_fs_1.lstatSync)(configPath, { bigint: true });
        if (BigInt(bytes.byteLength) !== before.size
            || !stableBigIntMetadataMatches(before, after)
            || !stableBigIntMetadataMatches(directory, directoryAfter)
            || !stableBigIntMetadataMatches(directory, namedDirectory)
            || !stableBigIntMetadataMatches(before, namedConfig)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment changed while it was read",
            };
        }
        const parsed = JSON.parse(bytes.toString("utf8"));
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {
                ok: false,
                reason: "Task Map persisted enrollment is malformed",
            };
        }
        const enrollment = validateTaskMapOwnerEnrollment(parsed, environment, homeDirectory);
        return enrollment.ok
            ? { ok: true, owner: confirmPersistedTaskMapOwner(enrollment.owner) }
            : enrollment;
    }
    catch {
        return {
            ok: false,
            reason: "Task Map confirmed owner enrollment is unavailable",
        };
    }
    finally {
        if (descriptor !== undefined)
            (0, node_fs_1.closeSync)(descriptor);
        if (directoryDescriptor !== undefined)
            (0, node_fs_1.closeSync)(directoryDescriptor);
    }
}
/**
 * Bind a persisted bearer to the persisted URL that issued it. Environment
 * values are accepted only as an explicit paired development seam when no
 * credential is present in the owner-only config file.
 */
function resolveCredentialBoundClient(config, environment = {}) {
    const persistedCredential = typeof config.device_credential === "string"
        ? config.device_credential.trim()
        : "";
    if (DEVICE_CREDENTIAL_RE.test(persistedCredential)) {
        const apiUrl = normalizeApiUrl(config.api_url);
        return apiUrl
            ? { ok: true, deviceCredential: persistedCredential, apiUrl }
            : { ok: false, reason: "persisted device credential requires a safe persisted HTTPS API URL" };
    }
    const environmentCredential = typeof environment.deviceCredential === "string"
        ? environment.deviceCredential.trim()
        : "";
    if (DEVICE_CREDENTIAL_RE.test(environmentCredential)) {
        const apiUrl = normalizeApiUrl(environment.apiUrl);
        return apiUrl
            ? { ok: true, deviceCredential: environmentCredential, apiUrl }
            : { ok: false, reason: "environment device credential requires a safe paired HTTPS API URL" };
    }
    return { ok: false, reason: "No enrolled DaoBrew device credential found" };
}
