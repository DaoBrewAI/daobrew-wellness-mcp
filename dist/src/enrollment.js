"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendIncompatibleError = exports.EnrollmentNeededError = exports.DEFAULT_API_URL = void 0;
exports.normalizeApiUrl = normalizeApiUrl;
exports.isValidDeviceCredential = isValidDeviceCredential;
exports.isValidEnrollmentGrant = isValidEnrollmentGrant;
exports.isValidInstallationNonce = isValidInstallationNonce;
exports.newInstallationNonce = newInstallationNonce;
exports.isValidLegacyApiKey = isValidLegacyApiKey;
exports.resolveCredentialBoundClientConfig = resolveCredentialBoundClientConfig;
exports.isValidEnrollmentId = isValidEnrollmentId;
exports.isValidEnrollmentUserId = isValidEnrollmentUserId;
exports.scrubLegacyClientSecrets = scrubLegacyClientSecrets;
exports.scrubLegacyDatabaseSecrets = scrubLegacyDatabaseSecrets;
exports.hasLegacyClientSecrets = hasLegacyClientSecrets;
exports.readClientConfigFile = readClientConfigFile;
exports.writeSecureClientConfig = writeSecureClientConfig;
exports.mutateSecureClientConfig = mutateSecureClientConfig;
exports.enrollmentFromConfig = enrollmentFromConfig;
exports.parseEnrollmentResponse = parseEnrollmentResponse;
exports.assertBackendContractCompatible = assertBackendContractCompatible;
exports.requestLegacyDeviceExchange = requestLegacyDeviceExchange;
exports.requestDeviceEnrollment = requestDeviceEnrollment;
exports.requestDeviceConfirmation = requestDeviceConfirmation;
exports.ensureDeviceEnrollment = ensureDeviceEnrollment;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const backend_contract_js_1 = require("./backend-contract.js");
const user_id_js_1 = require("./user-id.js");
exports.DEFAULT_API_URL = "https://daobrew-backend-iaupcwo6dq-uw.a.run.app/api/v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The retired /register route bound every generated dbk_ credential to
// `apikey:${key.slice(0, 12)}`. Production-generated keys use URL/base36-safe
// characters, so the persisted legacy principal is exactly `apikey:dbk_`
// plus eight characters. It remains server-owned response metadata; it is
// never persisted as a client-selected tenant.
const LEGACY_ENROLLMENT_USER_ID_RE = /^apikey:dbk_[A-Za-z0-9_-]{8}$/;
const DEVICE_CREDENTIAL_RE = /^dbd_[A-Za-z0-9_-]{28,}$/;
const ENROLLMENT_GRANT_RE = /^dbe_[A-Za-z0-9_-]{28,}$/;
const INSTALLATION_NONCE_RE = /^dbi_[A-Za-z0-9_-]{28,}$/;
const LEGACY_API_KEY_RE = /^dbk_[A-Za-z0-9_-]{6,}$/;
const LEGACY_DATABASE_KEYS = [
    "postgres_url",
    "postgres_maintenance_url",
    "database_url",
];
const LEGACY_SECRET_KEYS = [
    ...LEGACY_DATABASE_KEYS,
    "api_key",
];
class EnrollmentNeededError extends Error {
    reason;
    code = "ENROLLMENT_NEEDED";
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = "EnrollmentNeededError";
    }
}
exports.EnrollmentNeededError = EnrollmentNeededError;
class BackendIncompatibleError extends Error {
    route;
    reason;
    code = "backend_incompatible";
    constructor(route, reason) {
        super("DaoBrew backend version is behind this client; wait for the server update — this is not your network");
        this.route = route;
        this.reason = reason;
        this.name = "BackendIncompatibleError";
    }
}
exports.BackendIncompatibleError = BackendIncompatibleError;
class DeviceConfirmationRejectedError extends Error {
    constructor() {
        super("saved device credential could not be confirmed");
        this.name = "DeviceConfirmationRejectedError";
    }
}
function normalizeApiUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new Error("DaoBrew API URL is missing");
    }
    const value = raw.trim().replace(/\/+$/, "");
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error("DaoBrew API URL is invalid");
    }
    if (parsed.username || parsed.password) {
        throw new Error("DaoBrew API URL must not contain embedded credentials");
    }
    const loopback = parsed.hostname === "localhost"
        || parsed.hostname === "127.0.0.1"
        || parsed.hostname === "[::1]"
        || parsed.hostname === "::1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
        throw new Error("DaoBrew API URL must use HTTPS (HTTP is allowed only for loopback development)");
    }
    if (parsed.search || parsed.hash) {
        throw new Error("DaoBrew API URL must not contain a query string or fragment");
    }
    return value;
}
function isValidDeviceCredential(value) {
    return typeof value === "string" && DEVICE_CREDENTIAL_RE.test(value.trim());
}
function isValidEnrollmentGrant(value) {
    return typeof value === "string" && ENROLLMENT_GRANT_RE.test(value.trim());
}
function isValidInstallationNonce(value) {
    return typeof value === "string" && INSTALLATION_NONCE_RE.test(value.trim());
}
function newInstallationNonce() {
    return `dbi_${(0, node_crypto_1.randomBytes)(32).toString("base64url")}`;
}
function isValidLegacyApiKey(value) {
    return typeof value === "string" && LEGACY_API_KEY_RE.test(value.trim());
}
/**
 * Resolve an authenticated HTTP client without ever rebinding a persisted
 * bearer to a caller-controlled environment URL.
 *
 * Project-local MCP configuration can set process environment variables. Once
 * an installation has a file-backed credential, its server-provisioned URL is
 * therefore part of the same authority record and both environment overrides
 * are ignored. A paired environment credential+URL remains available only when
 * no persisted credential exists, which keeps explicit test/development seams
 * without exposing the installed user's bearer.
 */
function resolveCredentialBoundClientConfig(config, environment = {}) {
    const persistedCredential = typeof config.device_credential === "string"
        ? config.device_credential.trim()
        : "";
    if (isValidDeviceCredential(persistedCredential)) {
        return {
            deviceCredential: persistedCredential,
            apiUrl: normalizeApiUrl(config.api_url),
        };
    }
    const environmentCredential = typeof environment.deviceCredential === "string"
        ? environment.deviceCredential.trim()
        : "";
    if (isValidDeviceCredential(environmentCredential)) {
        return {
            deviceCredential: environmentCredential,
            apiUrl: normalizeApiUrl(environment.apiUrl),
        };
    }
    const unauthenticatedUrl = config.api_url ?? environment.apiUrl;
    return {
        apiUrl: unauthenticatedUrl === undefined
            ? undefined
            : normalizeApiUrl(unauthenticatedUrl),
    };
}
function isValidEnrollmentId(value) {
    return typeof value === "string" && UUID_RE.test(value.trim()) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
}
function isValidEnrollmentUserId(value) {
    if (typeof value !== "string")
        return false;
    const normalized = value.trim();
    return isValidEnrollmentId(normalized) || LEGACY_ENROLLMENT_USER_ID_RE.test(normalized);
}
function scrubLegacyClientSecrets(config) {
    const next = { ...config };
    for (const key of LEGACY_SECRET_KEYS)
        delete next[key];
    const userId = typeof next.user_id === "string" ? next.user_id.trim() : "";
    if (userId !== "" && (0, user_id_js_1.canonicalUserId)(userId) !== userId)
        delete next.user_id;
    const deviceId = typeof next.device_id === "string" ? next.device_id.trim() : "";
    if (deviceId !== "" && (0, user_id_js_1.canonicalUserId)(deviceId) !== deviceId)
        delete next.device_id;
    return next;
}
function scrubLegacyDatabaseSecrets(config) {
    const next = { ...config };
    for (const key of LEGACY_DATABASE_KEYS)
        delete next[key];
    return next;
}
function hasLegacyClientSecrets(config) {
    if (LEGACY_SECRET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(config, key))) {
        return true;
    }
    const userId = typeof config.user_id === "string" ? config.user_id.trim() : "";
    const deviceId = typeof config.device_id === "string" ? config.device_id.trim() : "";
    return (userId !== "" && (0, user_id_js_1.canonicalUserId)(userId) !== userId)
        || (deviceId !== "" && (0, user_id_js_1.canonicalUserId)(deviceId) !== deviceId);
}
function hasLegacyDatabaseSecrets(config) {
    return LEGACY_DATABASE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(config, key));
}
function configLockPath(configFile) {
    return (0, node_path_1.join)((0, node_path_1.dirname)(configFile), "config.lock");
}
function preparePrivateConfigDirectory(configFile) {
    const directory = (0, node_path_1.dirname)(configFile);
    (0, node_fs_1.mkdirSync)(directory, { recursive: true, mode: 0o700 });
    const info = (0, node_fs_1.lstatSync)(directory);
    const currentUid = process.getuid?.();
    if (!info.isDirectory()
        || info.isSymbolicLink()
        || (currentUid !== undefined && info.uid !== currentUid)) {
        throw new Error("DaoBrew preferences directory is not a current-user real directory");
    }
    (0, node_fs_1.chmodSync)(directory, 0o700);
}
function validateConfigLock(lockFile, descriptor, repairMode) {
    let descriptorInfo = (0, node_fs_1.fstatSync)(descriptor);
    const pathInfo = (0, node_fs_1.lstatSync)(lockFile);
    const currentUid = process.getuid?.();
    if (!descriptorInfo.isFile()
        || !pathInfo.isFile()
        || pathInfo.isSymbolicLink()
        || descriptorInfo.dev !== pathInfo.dev
        || descriptorInfo.ino !== pathInfo.ino
        || descriptorInfo.nlink !== 1
        || pathInfo.nlink !== 1
        || (currentUid !== undefined
            && (descriptorInfo.uid !== currentUid || pathInfo.uid !== currentUid))) {
        throw new Error("DaoBrew config lock identity, owner, or link count is unsafe");
    }
    if (repairMode && (descriptorInfo.mode & 0o7777) !== 0o600) {
        (0, node_fs_1.fchmodSync)(descriptor, 0o600);
        descriptorInfo = (0, node_fs_1.fstatSync)(descriptor);
    }
    if ((descriptorInfo.mode & 0o7777) !== 0o600) {
        throw new Error("DaoBrew config lock is not owner-only");
    }
}
/**
 * Hold the same persistent owner-only config.lock inode used by SentinelMac.
 * On macOS `/usr/bin/lockf` uses BSD flock(2); passing our already-open fd as
 * child fd 3 attaches that kernel lock to the shared open-file description.
 * The parent keeps the fd open for the complete operation and never unlinks
 * the lock path, preventing split serialization domains.
 */
function withClientConfigLock(configFile, operation) {
    preparePrivateConfigDirectory(configFile);
    const lockFile = configLockPath(configFile);
    let descriptor;
    try {
        descriptor = (0, node_fs_1.openSync)(lockFile, node_fs_1.constants.O_RDWR | node_fs_1.constants.O_CREAT | node_fs_1.constants.O_NOFOLLOW, 0o600);
    }
    catch {
        throw new Error("DaoBrew config lock could not be opened safely");
    }
    try {
        validateConfigLock(lockFile, descriptor, true);
        const command = process.platform === "darwin" ? "/usr/bin/lockf" : "/usr/bin/flock";
        const args = process.platform === "darwin"
            ? ["-s", "-t", "15", "3"]
            : ["-x", "-w", "15", "3"];
        const result = (0, node_child_process_1.spawnSync)(command, args, {
            stdio: ["ignore", "ignore", "ignore", descriptor],
        });
        if (result.error || result.status !== 0) {
            throw new Error("timed out waiting for another DaoBrew process to update config.json");
        }
        validateConfigLock(lockFile, descriptor, false);
        return operation();
    }
    finally {
        (0, node_fs_1.closeSync)(descriptor);
    }
}
function readClientConfigFileUnlocked(configFile) {
    if (!(0, node_fs_1.existsSync)(configFile))
        return {};
    let value;
    try {
        value = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
    }
    catch {
        // Do not leave a malformed file that may still contain a shared database
        // URL. There is deliberately no backup: that would preserve the secret.
        writeSecureClientConfigUnlocked(configFile, { config_repair_required: true });
        throw new Error("DaoBrew config was malformed and was securely cleared; repair or re-enroll it");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        writeSecureClientConfigUnlocked(configFile, { config_repair_required: true });
        throw new Error("DaoBrew config had an invalid root and was securely cleared; repair or re-enroll it");
    }
    const config = value;
    if (Object.prototype.hasOwnProperty.call(config, "api_url")) {
        try {
            normalizeApiUrl(config.api_url);
        }
        catch {
            writeSecureClientConfigUnlocked(configFile, { config_repair_required: true });
            throw new Error("DaoBrew config contained an unsafe API URL and was securely cleared; re-authenticate");
        }
    }
    if (hasLegacyDatabaseSecrets(config)
        || !configModeIsSecure(configFile)
        || (0, node_fs_1.existsSync)(`${configFile}.bak`)
        || (isValidDeviceCredential(config.device_credential)
            && (hasLegacyClientSecrets(config)
                || Object.prototype.hasOwnProperty.call(config, "enrollment_grant")))) {
        writeSecureClientConfigUnlocked(configFile, config);
        return JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
    }
    return config;
}
function readClientConfigFile(configFile) {
    // A missing file is a pure read result. Do not create/chmod its parent just
    // to return `{}`: test/dev overrides may intentionally point beneath a
    // nonexistent or non-directory path. Every mutation still acquires the lock.
    if (!(0, node_fs_1.existsSync)(configFile))
        return {};
    return withClientConfigLock(configFile, () => readClientConfigFileUnlocked(configFile));
}
/**
 * Persist client configuration atomically with owner-only permissions. This
 * intentionally does not make a backup: a pre-scrub backup would retain the
 * shared database credential this migration is removing.
 */
function writeSecureClientConfigUnlocked(configFile, config) {
    let next = scrubLegacyDatabaseSecrets(config);
    if (isValidDeviceCredential(next.device_credential)
        && next.device_credential_confirmed === true) {
        next = scrubLegacyClientSecrets(next);
        delete next.enrollment_grant;
    }
    if (Object.prototype.hasOwnProperty.call(next, "api_url")) {
        next.api_url = normalizeApiUrl(next.api_url);
    }
    const temporary = `${configFile}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
    try {
        (0, node_fs_1.writeFileSync)(temporary, `${JSON.stringify(next, null, 2)}\n`, {
            flag: "wx",
            mode: 0o600,
        });
        (0, node_fs_1.renameSync)(temporary, configFile);
        (0, node_fs_1.chmodSync)(configFile, 0o600);
    }
    finally {
        (0, node_fs_1.rmSync)(temporary, { force: true });
    }
    // Sentinel's historical merge path created config.json.bak before removing
    // legacy DB fields. Delete it rather than creating another secret-bearing
    // backup of the backup.
    (0, node_fs_1.rmSync)(`${configFile}.bak`, { force: true });
    return next;
}
function writeSecureClientConfig(configFile, config) {
    withClientConfigLock(configFile, () => {
        writeSecureClientConfigUnlocked(configFile, config);
    });
}
/** Re-read and atomically replace config.json while holding config.lock. */
function mutateSecureClientConfig(configFile, updater) {
    return withClientConfigLock(configFile, () => {
        const current = readClientConfigFileUnlocked(configFile);
        return writeSecureClientConfigUnlocked(configFile, updater({ ...current }));
    });
}
function configModeIsSecure(configFile) {
    try {
        return ((0, node_fs_1.statSync)(configFile).mode & 0o777) === 0o600
            && ((0, node_fs_1.statSync)((0, node_path_1.dirname)(configFile)).mode & 0o777) === 0o700;
    }
    catch {
        return false;
    }
}
function enrollmentFromConfig(config, apiUrl) {
    const credential = typeof config.device_credential === "string"
        ? config.device_credential.trim()
        : "";
    if (!isValidDeviceCredential(credential))
        return null;
    return { deviceCredential: credential, apiUrl };
}
function parseEnrollmentResponse(body) {
    const root = body && typeof body === "object" ? body : null;
    const candidate = root?.data && typeof root.data === "object"
        ? root.data
        : root;
    const credential = typeof candidate?.device_credential === "string"
        ? candidate.device_credential.trim()
        : "";
    const userId = typeof candidate?.user_id === "string" ? candidate.user_id.trim() : "";
    const deviceId = typeof candidate?.device_id === "string" ? candidate.device_id.trim() : "";
    let provisionedApiUrl = "";
    if (!isValidDeviceCredential(credential)) {
        throw new Error("device enrollment response contained an invalid credential");
    }
    if (!isValidEnrollmentUserId(userId) || !isValidEnrollmentId(deviceId)) {
        throw new Error("device enrollment response contained invalid server-issued IDs");
    }
    try {
        provisionedApiUrl = normalizeApiUrl(candidate?.api_url);
    }
    catch {
        throw new Error("device enrollment response contained an invalid API URL");
    }
    return { deviceCredential: credential, userId, deviceId, apiUrl: provisionedApiUrl };
}
function parseEnrollmentResponseForRoute(body, route) {
    try {
        return parseEnrollmentResponse(body);
    }
    catch {
        throw new BackendIncompatibleError(route, "contract_mismatch");
    }
}
function enrollmentMetadataBody(metadata, installationNonce) {
    const surface = metadata.surface?.trim();
    if (!surface)
        throw new Error("device enrollment surface is required");
    const platform = metadata.platform?.trim();
    if (!platform)
        throw new Error("device enrollment platform is required");
    // Runtime allowlist: even a loosely typed caller cannot smuggle a user,
    // tenant, prior device ID, or database credential into either exchange.
    if (!isValidInstallationNonce(installationNonce)) {
        throw new Error("device installation nonce is invalid");
    }
    return { surface, platform, installation_nonce: installationNonce.trim() };
}
function payloadData(body) {
    const root = body && typeof body === "object" && !Array.isArray(body)
        ? body
        : null;
    const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data)
        ? root.data
        : root;
    return data ?? null;
}
async function assertBackendContractCompatible(apiUrl, fetchImpl = fetch) {
    const normalizedApiUrl = normalizeApiUrl(apiUrl);
    let response;
    try {
        response = await fetchImpl(`${normalizedApiUrl}/version`, {
            method: "GET",
            headers: { "Cache-Control": "no-store" },
        });
    }
    catch {
        throw new Error("DaoBrew backend version is temporarily unavailable");
    }
    if (!response.ok) {
        if (response.status === 404) {
            throw new BackendIncompatibleError("/version", "missing_route");
        }
        throw new Error("DaoBrew backend version is temporarily unavailable");
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new BackendIncompatibleError("/version", "contract_mismatch");
    }
    const data = payloadData(body);
    const actual = data?.contract_version;
    if (typeof actual !== "number" || !Number.isSafeInteger(actual)) {
        throw new BackendIncompatibleError("/version", "contract_mismatch");
    }
    if (actual < backend_contract_js_1.REQUIRED_BACKEND_CONTRACT_VERSION) {
        throw new BackendIncompatibleError("/version", "old_contract");
    }
    return actual;
}
async function requestLegacyDeviceExchange(apiUrl, legacyApiKey, metadata, installationNonce, fetchImpl = fetch) {
    const normalizedApiUrl = normalizeApiUrl(apiUrl);
    const legacyCredential = legacyApiKey.trim();
    if (!isValidLegacyApiKey(legacyCredential)) {
        throw new EnrollmentNeededError("no_migration_credential", "DaoBrew enrollment is required; sign in again or contact DaoBrew support");
    }
    let response;
    try {
        response = await fetchImpl(`${normalizedApiUrl}/device/exchange`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${legacyCredential}`,
            },
            body: JSON.stringify(enrollmentMetadataBody(metadata, installationNonce)),
        });
    }
    catch {
        throw new Error("legacy device exchange backend is unreachable");
    }
    if (!response.ok) {
        if (response.status === 404) {
            throw new BackendIncompatibleError("/device/exchange", "missing_route");
        }
        if (response.status !== 401 && response.status !== 403) {
            throw new Error("legacy device exchange is temporarily unavailable");
        }
        throw new EnrollmentNeededError("legacy_exchange_rejected", "The saved DaoBrew session could not be migrated; sign in again or contact DaoBrew support");
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new BackendIncompatibleError("/device/exchange", "contract_mismatch");
    }
    return parseEnrollmentResponseForRoute(body, "/device/exchange");
}
async function requestDeviceEnrollment(apiUrl, enrollmentGrant, metadata, installationNonce, fetchImpl = fetch) {
    const normalizedApiUrl = normalizeApiUrl(apiUrl);
    const grant = enrollmentGrant.trim();
    if (!isValidEnrollmentGrant(grant)) {
        throw new EnrollmentNeededError("no_migration_credential", "DaoBrew enrollment is required; sign in again or contact DaoBrew support");
    }
    const requestBody = enrollmentMetadataBody(metadata, installationNonce);
    let response;
    try {
        response = await fetchImpl(`${normalizedApiUrl}/device/enroll`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${grant}`,
            },
            body: JSON.stringify(requestBody),
        });
    }
    catch {
        throw new Error("device enrollment backend is unreachable");
    }
    if (!response.ok) {
        if (response.status === 404) {
            throw new BackendIncompatibleError("/device/enroll", "missing_route");
        }
        if (response.status !== 401 && response.status !== 403) {
            throw new Error("DaoBrew provisioning is temporarily unavailable");
        }
        throw new EnrollmentNeededError("grant_rejected", "DaoBrew provisioning could not be completed; sign in again or contact DaoBrew support");
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new BackendIncompatibleError("/device/enroll", "contract_mismatch");
    }
    return parseEnrollmentResponseForRoute(body, "/device/enroll");
}
async function requestDeviceConfirmation(apiUrl, deviceCredential, installationNonce, fetchImpl = fetch) {
    const normalizedApiUrl = normalizeApiUrl(apiUrl);
    const credential = deviceCredential.trim();
    if (!isValidDeviceCredential(credential) || !isValidInstallationNonce(installationNonce)) {
        throw new DeviceConfirmationRejectedError();
    }
    let response;
    try {
        response = await fetchImpl(`${normalizedApiUrl}/device/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${credential}`,
            },
            body: JSON.stringify({ installation_nonce: installationNonce.trim() }),
        });
    }
    catch {
        throw new Error("device confirmation backend is unreachable");
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            throw new DeviceConfirmationRejectedError();
        }
        throw new Error("device confirmation is temporarily unavailable");
    }
    let body;
    try {
        body = await response.json();
    }
    catch {
        return {};
    }
    if (body === null || typeof body !== "object" || Array.isArray(body))
        return {};
    const data = body.data;
    if (data === null || typeof data !== "object" || Array.isArray(data))
        return {};
    const payload = data;
    const userId = typeof payload.user_id === "string"
        && (0, user_id_js_1.canonicalUserId)(payload.user_id) === payload.user_id
        ? payload.user_id
        : undefined;
    const deviceId = typeof payload.device_id === "string"
        && (0, user_id_js_1.canonicalUserId)(payload.device_id) === payload.device_id
        ? payload.device_id
        : undefined;
    return {
        ...(userId === undefined ? {} : { userId }),
        ...(deviceId === undefined ? {} : { deviceId }),
    };
}
async function ensureDeviceEnrollment(options) {
    // Re-read under config.lock so an Oura OAuth completion in SentinelMac and a
    // resident Node enrollment can never replace each other's keys. The retry
    // discriminator is durable before the first network mutation; the backend
    // receives and stores only its hash.
    let config = mutateSecureClientConfig(options.configFile, (current) => {
        const hasPersistedAuthority = isValidDeviceCredential(current.device_credential)
            || isValidLegacyApiKey(current.api_key)
            || isValidEnrollmentGrant(current.enrollment_grant);
        // A persisted dbd/dbk/dbe is bound to the URL stored beside it. Never send
        // that secret to DAOBREW_API_URL supplied by a project-local MCP config.
        // Very old configs without api_url migrate through the compiled-in public
        // endpoint, while an injected grant may still use an explicitly paired URL.
        const apiUrl = normalizeApiUrl(hasPersistedAuthority
            ? (current.api_url ?? exports.DEFAULT_API_URL)
            : (options.apiUrl ?? current.api_url ?? exports.DEFAULT_API_URL));
        const installationNonce = isValidInstallationNonce(current.installation_nonce)
            ? String(current.installation_nonce).trim()
            : newInstallationNonce();
        return {
            ...scrubLegacyDatabaseSecrets(current),
            api_url: apiUrl,
            installation_nonce: installationNonce,
        };
    });
    const apiUrl = normalizeApiUrl(config.api_url);
    const installationNonce = String(config.installation_nonce);
    let existingEnrollment = enrollmentFromConfig(config, apiUrl);
    const fetchImpl = options.fetchImpl ?? fetch;
    let compatibilityCheckedApiUrl = "";
    const ensureCompatible = async (url) => {
        const normalized = normalizeApiUrl(url);
        if (compatibilityCheckedApiUrl === normalized)
            return;
        await assertBackendContractCompatible(normalized, fetchImpl);
        compatibilityCheckedApiUrl = normalized;
    };
    // A complete confirmed owner tuple is an offline-capable installed session.
    // A confirmed credential without its canonical owner is re-confirmed once
    // so older device-key-only installs can repair the persisted identity gate.
    if (existingEnrollment
        && config.device_credential_confirmed === true
        && typeof config.user_id === "string"
        && (0, user_id_js_1.canonicalUserId)(config.user_id) === config.user_id) {
        await ensureCompatible(existingEnrollment.apiUrl);
        return { enrollment: existingEnrollment, config, enrolled: false };
    }
    const persistEnrollment = async (enrollment, enrolled) => {
        // First persist the complete record while retaining the exact dbk/dbe
        // recovery source. A resident credential that was already confirmed stays
        // confirmed while its missing owner tuple is repaired; transient backend
        // failures must not erase that durable fact. New or rotated credentials
        // remain unconfirmed until their confirmation succeeds.
        config = mutateSecureClientConfig(options.configFile, (current) => ({
            ...current,
            api_url: enrollment.apiUrl,
            device_credential: enrollment.deviceCredential,
            device_credential_confirmed: current.device_credential === enrollment.deviceCredential
                && current.device_credential_confirmed === true,
            installation_nonce: installationNonce,
        }));
        await ensureCompatible(enrollment.apiUrl);
        const confirmation = await requestDeviceConfirmation(enrollment.apiUrl, enrollment.deviceCredential, installationNonce, fetchImpl);
        config = mutateSecureClientConfig(options.configFile, (current) => {
            if (current.device_credential !== enrollment.deviceCredential
                || current.installation_nonce !== installationNonce) {
                throw new Error("DaoBrew device enrollment changed during confirmation; retry safely");
            }
            const confirmed = scrubLegacyClientSecrets({
                ...current,
                device_credential_confirmed: true,
                ...(confirmation.userId === undefined ? {} : { user_id: confirmation.userId }),
                ...(confirmation.deviceId === undefined ? {} : { device_id: confirmation.deviceId }),
            });
            delete confirmed.enrollment_grant;
            return confirmed;
        });
        return { enrollment, config, enrolled };
    };
    if (existingEnrollment) {
        const existingCredentialWasConfirmed = config.device_credential_confirmed === true;
        try {
            return await persistEnrollment(existingEnrollment, false);
        }
        catch (error) {
            if (!(error instanceof DeviceConfirmationRejectedError))
                throw error;
            if (existingCredentialWasConfirmed) {
                // Keep the previously confirmed bearer available to the Swift recovery
                // path. A retained migration source may still replace it below, but a
                // rejection must never downgrade the durable local confirmation flag.
                existingEnrollment = null;
            }
            else {
                // The unconfirmed response expired or was rotated. Keep its trusted
                // recovery source and retry that source with the same installation nonce.
                const rejectedCredential = existingEnrollment.deviceCredential;
                config = mutateSecureClientConfig(options.configFile, (current) => {
                    const next = { ...current };
                    if (next.device_credential === rejectedCredential
                        && next.installation_nonce === installationNonce
                        && next.device_credential_confirmed !== true) {
                        delete next.device_credential;
                        delete next.device_credential_confirmed;
                    }
                    return next;
                });
                const concurrentApiUrl = normalizeApiUrl(config.api_url ?? apiUrl);
                const concurrentEnrollment = enrollmentFromConfig(config, concurrentApiUrl);
                if (concurrentEnrollment && config.device_credential_confirmed === true) {
                    await ensureCompatible(concurrentEnrollment.apiUrl);
                    return { enrollment: concurrentEnrollment, config, enrolled: false };
                }
                existingEnrollment = null;
            }
        }
    }
    // Refresh recovery material after any confirmation attempt. A setup flow may
    // have supplied a one-time grant while the network call was in flight.
    config = readClientConfigFile(options.configFile);
    const legacyApiKey = typeof config.api_key === "string" ? config.api_key.trim() : "";
    let legacyRejection = null;
    if (isValidLegacyApiKey(legacyApiKey)) {
        try {
            await ensureCompatible(apiUrl);
            const enrollment = await requestLegacyDeviceExchange(apiUrl, legacyApiKey, options.metadata, installationNonce, fetchImpl);
            return await persistEnrollment(enrollment, true);
        }
        catch (error) {
            if (!(error instanceof EnrollmentNeededError))
                throw error;
            legacyRejection = error;
        }
    }
    const injectedGrant = options.enrollmentGrant || process.env.DAOBREW_ENROLLMENT_GRANT || "";
    config = readClientConfigFile(options.configFile);
    const configGrant = typeof config.enrollment_grant === "string" ? config.enrollment_grant : "";
    const enrollmentGrant = (injectedGrant || configGrant).trim();
    if (!isValidEnrollmentGrant(enrollmentGrant)) {
        if (legacyRejection)
            throw legacyRejection;
        throw new EnrollmentNeededError("no_migration_credential", "DaoBrew enrollment is required; sign in again or contact DaoBrew support");
    }
    await ensureCompatible(apiUrl);
    const enrollment = await requestDeviceEnrollment(apiUrl, enrollmentGrant, options.metadata, installationNonce, fetchImpl);
    return await persistEnrollment(enrollment, true);
}
