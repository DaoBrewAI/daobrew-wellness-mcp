"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAuthorizationGeneration = normalizeAuthorizationGeneration;
exports.createAuthorizationGeneration = createAuthorizationGeneration;
exports.ouraTokenLockPath = ouraTokenLockPath;
exports.ouraTokenTemporaryPath = ouraTokenTemporaryPath;
exports.readOuraTokenFile = readOuraTokenFile;
exports.saveNewOuraAuthorization = saveNewOuraAuthorization;
exports.compareAndSwapOuraRefresh = compareAndSwapOuraRefresh;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_RETRY_MS = 10;
function normalizeAuthorizationGeneration(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed && trimmed.length <= 128 ? trimmed : undefined;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        return String(value);
    }
    return undefined;
}
function createAuthorizationGeneration(nonce = crypto_1.randomUUID) {
    return `auth_${nonce()}`;
}
function ouraTokenLockPath(tokenFile) {
    return `${tokenFile}.lock`;
}
function ouraTokenTemporaryPath(tokenFile, pid = process.pid, nonce = (0, crypto_1.randomUUID)()) {
    return `${tokenFile}.tmp-${pid}-${nonce}`;
}
function readOuraTokenFile(tokenFile) {
    let descriptor;
    try {
        const tokenDirectory = (0, path_1.dirname)(tokenFile);
        const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
        const directoryStat = (0, fs_1.lstatSync)(tokenDirectory);
        if (!directoryStat.isDirectory()
            || directoryStat.isSymbolicLink()
            || (directoryStat.mode & 0o777) !== 0o700
            || (expectedUid !== undefined && directoryStat.uid !== expectedUid)) {
            return null;
        }
        const pathStat = (0, fs_1.lstatSync)(tokenFile);
        if (!pathStat.isFile()
            || pathStat.isSymbolicLink()
            || pathStat.nlink !== 1
            || (pathStat.mode & 0o777) !== 0o600
            || (expectedUid !== undefined && pathStat.uid !== expectedUid)) {
            return null;
        }
        descriptor = (0, fs_1.openSync)(tokenFile, fs_1.constants.O_RDONLY | fs_1.constants.O_NOFOLLOW);
        const openStat = (0, fs_1.fstatSync)(descriptor);
        if (!openStat.isFile()
            || openStat.nlink !== 1
            || (openStat.mode & 0o777) !== 0o600
            || (expectedUid !== undefined && openStat.uid !== expectedUid)
            || openStat.dev !== pathStat.dev
            || openStat.ino !== pathStat.ino) {
            return null;
        }
        const token = JSON.parse((0, fs_1.readFileSync)(descriptor, "utf-8"));
        if (!isUsableOuraToken(token))
            return null;
        return token;
    }
    catch {
        return null;
    }
    finally {
        if (descriptor !== undefined) {
            try {
                (0, fs_1.closeSync)(descriptor);
            }
            catch { }
        }
    }
}
function isUsableOuraToken(token) {
    return typeof token?.access_token === "string"
        && Boolean(token.access_token.trim())
        && typeof token?.refresh_token === "string"
        && Boolean(token.refresh_token.trim())
        && Number.isFinite(token?.expires_at)
        && (token?.oauth_mode === undefined
            || token.oauth_mode === "managed"
            || token.oauth_mode === "personal");
}
function ensureOwnerOnlyTokenDirectory(tokenDirectory) {
    (0, fs_1.mkdirSync)(tokenDirectory, { recursive: true, mode: 0o700 });
    const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const directoryStat = (0, fs_1.lstatSync)(tokenDirectory);
    if (!directoryStat.isDirectory()
        || directoryStat.isSymbolicLink()
        || (expectedUid !== undefined && directoryStat.uid !== expectedUid)) {
        throw new Error("Refusing to use an unsafe Oura token directory");
    }
    if ((directoryStat.mode & 0o777) !== 0o700) {
        (0, fs_1.chmodSync)(tokenDirectory, 0o700);
    }
}
function atomicWriteOuraToken(tokenFile, token, nonce) {
    if (!isUsableOuraToken(token)) {
        throw new Error("Refusing to save an incomplete Oura OAuth token");
    }
    const tokenDirectory = (0, path_1.dirname)(tokenFile);
    ensureOwnerOnlyTokenDirectory(tokenDirectory);
    const temporary = ouraTokenTemporaryPath(tokenFile, process.pid, nonce());
    try {
        (0, fs_1.writeFileSync)(temporary, JSON.stringify(token, null, 2), { mode: 0o600, flag: "wx" });
        (0, fs_1.chmodSync)(temporary, 0o600);
        (0, fs_1.renameSync)(temporary, tokenFile);
        (0, fs_1.chmodSync)(tokenFile, 0o600);
    }
    finally {
        try {
            (0, fs_1.rmSync)(temporary, { force: true });
        }
        catch { }
    }
}
async function withOuraTokenLock(tokenFile, operation, options = {}) {
    const now = options.now ?? Date.now;
    const sleep = options.sleep
        ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    const nonce = options.nonce ?? crypto_1.randomUUID;
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_LOCK_RETRY_MS;
    const tokenDirectory = (0, path_1.dirname)(tokenFile);
    const lockPath = ouraTokenLockPath(tokenFile);
    const ownerPath = `${lockPath}/owner`;
    const owner = nonce();
    const deadline = now() + timeoutMs;
    ensureOwnerOnlyTokenDirectory(tokenDirectory);
    while (true) {
        try {
            (0, fs_1.mkdirSync)(lockPath, { mode: 0o700 });
            (0, fs_1.chmodSync)(lockPath, 0o700);
            (0, fs_1.writeFileSync)(ownerPath, owner, { mode: 0o600 });
            (0, fs_1.chmodSync)(ownerPath, 0o600);
            break;
        }
        catch (error) {
            if (error?.code !== "EEXIST") {
                throw new Error("Could not acquire the local Oura token lock");
            }
            try {
                if (now() - (0, fs_1.statSync)(lockPath).mtimeMs > staleMs) {
                    const abandoned = `${lockPath}.stale-${process.pid}-${nonce()}`;
                    (0, fs_1.renameSync)(lockPath, abandoned);
                    (0, fs_1.rmSync)(abandoned, { recursive: true, force: true });
                    continue;
                }
            }
            catch { }
            if (now() >= deadline) {
                throw new Error("Timed out waiting for the local Oura token lock");
            }
            await sleep(retryDelayMs);
        }
    }
    try {
        return await operation();
    }
    finally {
        try {
            if ((0, fs_1.readFileSync)(ownerPath, "utf-8") === owner) {
                (0, fs_1.rmSync)(lockPath, { recursive: true, force: true });
            }
        }
        catch { }
    }
}
async function saveNewOuraAuthorization(tokenFile, token, options = {}) {
    return withOuraTokenLock(tokenFile, () => {
        readOuraTokenFile(tokenFile);
        options.validateBeforeSave?.();
        const generation = options.generation?.()
            ?? createAuthorizationGeneration(options.nonce);
        if (!normalizeAuthorizationGeneration(generation)) {
            throw new Error("Could not allocate an Oura authorization generation");
        }
        const next = { ...token, authorization_generation: generation };
        atomicWriteOuraToken(tokenFile, next, options.nonce ?? crypto_1.randomUUID);
        return next;
    }, options);
}
function sameRefreshSnapshot(current, expected) {
    return normalizeAuthorizationGeneration(current.authorization_generation)
        === normalizeAuthorizationGeneration(expected.authorization_generation)
        && current.owner_scope_digest === expected.owner_scope_digest
        && current.access_token === expected.access_token
        && current.refresh_token === expected.refresh_token
        && current.oauth_mode === expected.oauth_mode;
}
async function compareAndSwapOuraRefresh(tokenFile, expected, refreshed, options = {}) {
    return withOuraTokenLock(tokenFile, () => {
        const current = readOuraTokenFile(tokenFile);
        if (!current) {
            throw new Error("Oura authorization changed during token refresh; reconnect if needed");
        }
        if (!sameRefreshSnapshot(current, expected)) {
            return { token: current, saved: false };
        }
        options.validateBeforeSave?.();
        const next = {
            ...refreshed,
            authorization_generation: current.authorization_generation,
        };
        atomicWriteOuraToken(tokenFile, next, options.nonce ?? crypto_1.randomUUID);
        return { token: next, saved: true };
    }, options);
}
