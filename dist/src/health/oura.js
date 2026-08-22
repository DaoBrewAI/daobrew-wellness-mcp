"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.needsRefresh = needsRefresh;
exports.isConnected = isConnected;
exports.loadCurrentConfirmedOuraOwner = loadCurrentConfirmedOuraOwner;
exports.ouraTokenFileForConfirmedOwner = ouraTokenFileForConfirmedOwner;
exports.loadOuraTokenForConfirmedOwner = loadOuraTokenForConfirmedOwner;
exports.assertCurrentOuraTokenOwner = assertCurrentOuraTokenOwner;
exports.captureCurrentOuraOwnerGuard = captureCurrentOuraOwnerGuard;
exports.assertCurrentOuraOwnerGuard = assertCurrentOuraOwnerGuard;
exports.loadToken = loadToken;
exports.resolveManagedOuraClientConfig = resolveManagedOuraClientConfig;
exports.startManagedOuraAuthorization = startManagedOuraAuthorization;
exports.exchangeManagedOuraCode = exchangeManagedOuraCode;
exports.refreshManagedOuraToken = refreshManagedOuraToken;
exports.saveToken = saveToken;
exports.exchangeCode = exchangeCode;
exports.refreshAccessToken = refreshAccessToken;
exports.refreshedOuraToken = refreshedOuraToken;
exports.fetchDailyReadiness = fetchDailyReadiness;
exports.fetchDailyActivity = fetchDailyActivity;
exports.fetchDailySleep = fetchDailySleep;
exports.fetchHeartRate = fetchHeartRate;
exports.fetchSleep = fetchSleep;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const identity_js_1 = require("../identity.js");
const local_config_js_1 = require("../engine/local-config.js");
const oura_token_store_js_1 = require("./oura-token-store.js");
const OURA_TOKEN_FILE_NAME = "oura-token.json";
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const MANAGED_REDIRECT_URI = "http://localhost:8791/callback";
const REQUIRED_OURA_SCOPES = ["daily", "heartrate"];
const STATE_RE = /^[A-Za-z0-9._~-]{16,512}$/;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_SCOPE_LENGTH = 1_024;
const MAX_TOKEN_TYPE_LENGTH = 64;
const MAX_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;
const CURRENT_OURA_OWNER_GUARD_AUTHORITY = Symbol("CurrentOuraOwnerGuardAuthority");
const currentOuraOwnerGuards = new WeakSet();
function needsRefresh(token, nowMs) {
    return nowMs >= token.expires_at;
}
function isConnected() {
    return loadToken() !== null;
}
function loadCurrentConfirmedOuraOwner() {
    const plan = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)((0, os_1.homedir)());
    return plan.ok ? plan.owner : null;
}
function requireCurrentConfirmedOuraOwner() {
    const owner = loadCurrentConfirmedOuraOwner();
    if (owner === null) {
        throw new Error("DaoBrew confirmed owner enrollment is required for Oura");
    }
    return owner;
}
function ouraTokenFileForConfirmedOwner(owner) {
    (0, identity_js_1.assertConfirmedTaskMapOwner)(owner);
    return (0, path_1.join)(owner.sourceRoot, OURA_TOKEN_FILE_NAME);
}
function loadOuraTokenForConfirmedOwner(owner) {
    (0, identity_js_1.assertConfirmedTaskMapOwner)(owner);
    const token = (0, oura_token_store_js_1.readOuraTokenFile)(ouraTokenFileForConfirmedOwner(owner));
    if (token?.owner_scope_digest !== owner.ownerScopeDigest)
        return null;
    return token;
}
function assertCurrentOuraTokenOwner(token) {
    const owner = requireCurrentConfirmedOuraOwner();
    if (token.owner_scope_digest !== owner.ownerScopeDigest) {
        throw new Error("Oura authorization belongs to a different confirmed owner");
    }
}
function captureCurrentOuraOwnerGuard(token) {
    const owner = requireCurrentConfirmedOuraOwner();
    if (token.owner_scope_digest !== owner.ownerScopeDigest) {
        throw new Error("Oura authorization belongs to a different confirmed owner");
    }
    const guard = Object.freeze({
        [CURRENT_OURA_OWNER_GUARD_AUTHORITY]: true,
        ownerScopeDigest: owner.ownerScopeDigest,
        owner,
    });
    currentOuraOwnerGuards.add(guard);
    return guard;
}
function assertCurrentOuraOwnerGuard(guard) {
    if (!currentOuraOwnerGuards.has(guard)) {
        throw new Error("Oura owner guard is not trusted");
    }
    const expected = guard.owner;
    assertSameCurrentOwner(expected);
}
function loadToken() {
    const owner = loadCurrentConfirmedOuraOwner();
    return owner === null ? null : loadOuraTokenForConfirmedOwner(owner);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedString(value, label, maximum) {
    if (typeof value !== "string")
        throw new Error(`${label} is invalid`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        throw new Error(`${label} is invalid`);
    return normalized;
}
function normalizedScopes(value, label) {
    const values = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[\s,]+/)
            : [];
    if (values.length === 0 || values.length > 64)
        throw new Error(`${label} are invalid`);
    const scopes = values.flatMap((entry) => {
        if (typeof entry !== "string")
            throw new Error(`${label} are invalid`);
        return entry.split(/[\s,]+/);
    }).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (scopes.length === 0 || scopes.some((scope) => scope.length > 128)) {
        throw new Error(`${label} are invalid`);
    }
    return [...new Set(scopes)];
}
function requireOuraScopes(scopes, label) {
    for (const required of REQUIRED_OURA_SCOPES) {
        if (!scopes.includes(required))
            throw new Error(`${label} omitted required Oura scopes`);
    }
}
function resolveManagedOuraClientConfig(owner) {
    (0, identity_js_1.assertConfirmedTaskMapOwner)(owner);
    return {
        apiUrl: owner.issuerUrl,
        deviceCredential: owner.deviceCredential,
        ownerScopeDigest: owner.ownerScopeDigest,
    };
}
async function managedBackendRequest(config, path, body, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(`${config.apiUrl}${path}`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${config.deviceCredential}`,
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }
    catch {
        throw new Error("DaoBrew managed Oura service is unreachable");
    }
    if (!response.ok) {
        throw new Error(`DaoBrew managed Oura service failed (HTTP ${response.status})`);
    }
    let envelope;
    try {
        envelope = await response.json();
    }
    catch {
        throw new Error("DaoBrew managed Oura service returned an invalid response");
    }
    if (!isRecord(envelope) || envelope.success !== true || !isRecord(envelope.data)) {
        throw new Error("DaoBrew managed Oura service returned an invalid response");
    }
    return envelope.data;
}
function validateManagedAuthorizationStart(data) {
    if (!isRecord(data) || data.mode !== "managed") {
        throw new Error("DaoBrew managed Oura authorization response is invalid");
    }
    const authorizationUrl = boundedString(data.authorization_url, "DaoBrew managed Oura authorization URL", 4_096);
    const state = boundedString(data.state, "DaoBrew managed Oura state", 512);
    if (!STATE_RE.test(state))
        throw new Error("DaoBrew managed Oura state is invalid");
    const redirectUri = boundedString(data.redirect_uri, "DaoBrew managed Oura redirect URI", 256);
    if (redirectUri !== MANAGED_REDIRECT_URI) {
        throw new Error("DaoBrew managed Oura redirect URI is invalid");
    }
    const scopes = normalizedScopes(data.scopes, "DaoBrew managed Oura scopes");
    requireOuraScopes(scopes, "DaoBrew managed Oura authorization");
    let url;
    try {
        url = new URL(authorizationUrl);
    }
    catch {
        throw new Error("DaoBrew managed Oura authorization URL is invalid");
    }
    if (url.origin !== "https://cloud.ouraring.com"
        || url.pathname !== "/oauth/authorize"
        || url.username
        || url.password
        || url.hash
        || url.searchParams.has("client_secret")
        || url.searchParams.getAll("response_type").length !== 1
        || url.searchParams.get("response_type") !== "code"
        || url.searchParams.getAll("client_id").length !== 1
        || !url.searchParams.get("client_id")?.trim()
        || url.searchParams.getAll("state").length !== 1
        || url.searchParams.get("state") !== state
        || url.searchParams.getAll("redirect_uri").length !== 1
        || url.searchParams.get("redirect_uri") !== redirectUri
        || url.searchParams.getAll("scope").length !== 1) {
        throw new Error("DaoBrew managed Oura authorization URL is invalid");
    }
    requireOuraScopes(normalizedScopes(url.searchParams.get("scope"), "DaoBrew managed Oura URL scopes"), "DaoBrew managed Oura authorization URL");
    return { authorizationUrl, state, redirectUri: MANAGED_REDIRECT_URI, scopes, mode: "managed" };
}
function validateManagedTokenPayload(data) {
    if (!isRecord(data) || !isRecord(data.token)) {
        throw new Error("DaoBrew managed Oura token response is invalid");
    }
    const token = data.token;
    const expiresIn = token.expires_in;
    if (typeof expiresIn !== "number"
        || !Number.isFinite(expiresIn)
        || expiresIn <= 0
        || expiresIn > MAX_EXPIRES_IN_SECONDS) {
        throw new Error("DaoBrew managed Oura token lifetime is invalid");
    }
    return {
        access_token: boundedString(token.access_token, "Managed Oura access token", MAX_TOKEN_LENGTH),
        refresh_token: boundedString(token.refresh_token, "Managed Oura refresh token", MAX_TOKEN_LENGTH),
        token_type: boundedString(token.token_type, "Managed Oura token type", MAX_TOKEN_TYPE_LENGTH),
        expires_in: expiresIn,
        scope: boundedString(token.scope, "Managed Oura token scope", MAX_SCOPE_LENGTH),
    };
}
async function startManagedOuraAuthorization(config, fetchImpl = fetch) {
    return validateManagedAuthorizationStart(await managedBackendRequest(config, "/device/oura/oauth/start", undefined, fetchImpl));
}
async function exchangeManagedOuraCode(config, code, state, fetchImpl = fetch) {
    const normalizedState = boundedString(state, "Oura authorization state", 512);
    if (!STATE_RE.test(normalizedState))
        throw new Error("Oura authorization state is invalid");
    return validateManagedTokenPayload(await managedBackendRequest(config, "/device/oura/oauth/exchange", { code: boundedString(code, "Oura authorization code", MAX_TOKEN_LENGTH), state: normalizedState }, fetchImpl));
}
async function refreshManagedOuraToken(config, refreshToken, fetchImpl = fetch) {
    return validateManagedTokenPayload(await managedBackendRequest(config, "/device/oura/oauth/refresh", { refresh_token: boundedString(refreshToken, "Managed Oura refresh token", MAX_TOKEN_LENGTH) }, fetchImpl));
}
async function saveToken(token) {
    if (!token.access_token || !token.refresh_token) {
        throw new Error("Refusing to save an Oura token without access_token and refresh_token");
    }
    const owner = requireCurrentConfirmedOuraOwner();
    if (token.owner_scope_digest !== owner.ownerScopeDigest) {
        throw new Error("Refusing to save an Oura token for a different owner");
    }
    const tokenFile = ouraTokenFileForConfirmedOwner(owner);
    const { authorization_generation: _authorizationGeneration, ...newAuthorization } = token;
    return (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, newAuthorization, {
        validateBeforeSave: () => assertSameCurrentOwner(owner),
    });
}
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
    const response = await fetch(OURA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
        }),
    });
    if (!response.ok) {
        throw new Error(`Oura token exchange failed: ${response.status}`);
    }
    const data = await response.json();
    const savedAt = Math.trunc(Date.now() / 1000);
    const owner = requireCurrentConfirmedOuraOwner();
    const token = {
        owner_scope_digest: owner.ownerScopeDigest,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
        token_type: data.token_type ?? "Bearer",
        scope: data.scope,
        oauth_mode: "personal",
        authorized_at: savedAt,
        saved_at: savedAt,
    };
    return (0, oura_token_store_js_1.saveNewOuraAuthorization)(ouraTokenFileForConfirmedOwner(owner), token, { validateBeforeSave: () => assertSameCurrentOwner(owner) });
}
function resolvePersonalOuraCredentials(config, environment) {
    const clientId = (environment.DAOBREW_OURA_CLIENT_ID || config.oura_client_id || "").trim();
    const clientSecret = (environment.DAOBREW_OURA_CLIENT_SECRET || config.oura_client_secret || "").trim();
    if (!clientId || !clientSecret) {
        throw new Error("Cannot refresh personal-app Oura token: oura_client_id/oura_client_secret are not configured");
    }
    return { clientId, clientSecret };
}
function sameManagedAuthority(current, expected) {
    return current.apiUrl === expected.apiUrl
        && current.deviceCredential === expected.deviceCredential
        && current.ownerScopeDigest === expected.ownerScopeDigest;
}
function sameConfirmedOwner(current, expected) {
    return current.userId === expected.userId
        && current.ownerScopeDigest === expected.ownerScopeDigest
        && current.deviceCredential === expected.deviceCredential
        && current.issuerUrl === expected.issuerUrl;
}
function assertSameCurrentOwner(expected) {
    const current = loadCurrentConfirmedOuraOwner();
    if (current === null || !sameConfirmedOwner(current, expected)) {
        throw new Error("DaoBrew owner enrollment changed while Oura authorization was in progress. Reconnect Oura.");
    }
}
async function refreshAccessToken(token, options = {}) {
    if (!token.refresh_token) {
        throw new Error("Cannot refresh Oura token: no refresh_token");
    }
    const owner = requireCurrentConfirmedOuraOwner();
    assertCurrentOuraTokenOwner(token);
    const tokenFile = ouraTokenFileForConfirmedOwner(owner);
    const fetchImpl = options.fetchImpl ?? fetch;
    const environment = options.environment ?? process.env;
    const nowMs = options.nowMs ?? Date.now;
    let data;
    let validateAuthority;
    if (token.oauth_mode === "managed") {
        const authority = resolveManagedOuraClientConfig(owner);
        data = await refreshManagedOuraToken(authority, token.refresh_token, fetchImpl);
        validateAuthority = () => {
            assertSameCurrentOwner(owner);
            const currentOwner = requireCurrentConfirmedOuraOwner();
            const current = resolveManagedOuraClientConfig(currentOwner);
            if (!sameManagedAuthority(current, authority)) {
                throw new Error("DaoBrew device enrollment changed while Oura refresh was in progress. Reconnect Oura.");
            }
        };
    }
    else {
        // Missing oauth_mode is the pre-managed on-disk format and intentionally
        // remains a personal-app refresh for backward compatibility.
        const authority = resolvePersonalOuraCredentials((0, local_config_js_1.readLocalConfig)(), environment);
        let response;
        try {
            response = await fetchImpl(OURA_TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: token.refresh_token,
                    client_id: authority.clientId,
                    client_secret: authority.clientSecret,
                }),
            });
        }
        catch {
            throw new Error("Oura token refresh service is unreachable");
        }
        if (!response.ok)
            throw new Error(`Oura token refresh failed: ${response.status}`);
        try {
            const payload = await response.json();
            if (!isRecord(payload))
                throw new Error();
            boundedString(payload.access_token, "Oura access token", MAX_TOKEN_LENGTH);
            data = payload;
        }
        catch {
            throw new Error("Oura token refresh returned an invalid response");
        }
        validateAuthority = () => {
            assertSameCurrentOwner(owner);
            const current = resolvePersonalOuraCredentials((0, local_config_js_1.readLocalConfig)(), environment);
            if (current.clientId !== authority.clientId || current.clientSecret !== authority.clientSecret) {
                throw new Error("Oura application credentials changed while token refresh was in progress. Reconnect Oura.");
            }
        };
    }
    const refreshedAtMs = nowMs();
    const savedAt = Math.trunc(refreshedAtMs / 1000);
    let authorizedAt = token.authorized_at ?? token.saved_at;
    if (!Number.isFinite(authorizedAt)) {
        try {
            authorizedAt = Math.trunc((0, fs_1.statSync)(tokenFile).mtimeMs / 1000);
        }
        catch {
            authorizedAt = savedAt;
        }
    }
    const newToken = refreshedOuraToken(token, data, refreshedAtMs, authorizedAt);
    const saved = await (0, oura_token_store_js_1.compareAndSwapOuraRefresh)(tokenFile, token, newToken, {
        validateBeforeSave: validateAuthority,
    });
    return saved.token;
}
/** Pure refresh merge: token rotation must never masquerade as reconnect. */
function refreshedOuraToken(token, data, nowMs = Date.now(), authorizedAt = token.authorized_at ?? token.saved_at) {
    const savedAt = Math.trunc(nowMs / 1000);
    return {
        owner_scope_digest: token.owner_scope_digest,
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? token.refresh_token,
        expires_at: nowMs + (data.expires_in ?? 86400) * 1000,
        token_type: data.token_type ?? "Bearer",
        scope: data.scope ?? token.scope,
        oauth_mode: token.oauth_mode,
        authorization_generation: token.authorization_generation,
        authorized_at: authorizedAt,
        saved_at: savedAt,
    };
}
async function fetchDailyReadiness(token, startDate, endDate, nextToken, fetchImpl = fetch) {
    const params = new URLSearchParams();
    if (startDate)
        params.set("start_date", startDate);
    if (endDate)
        params.set("end_date", endDate);
    if (nextToken)
        params.set("next_token", nextToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const response = await fetchImpl(`${OURA_API_BASE}/daily_readiness${qs}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Oura API error: ${response.status}`);
    return response.json();
}
async function fetchDailyActivity(token, startDate, endDate, nextToken, fetchImpl = fetch) {
    const params = new URLSearchParams();
    if (startDate)
        params.set("start_date", startDate);
    if (endDate)
        params.set("end_date", endDate);
    if (nextToken)
        params.set("next_token", nextToken);
    // Avoid fetching the large provider-specific MET/classification payload that
    // the canonical health adapter deliberately does not ingest.
    params.set("fields", "active_calories,steps,timestamp");
    const qs = params.toString() ? `?${params.toString()}` : "";
    const response = await fetchImpl(`${OURA_API_BASE}/daily_activity${qs}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Oura API error: ${response.status}`);
    return response.json();
}
/**
 * Read daily sleep documents for read-only context consumers. The sync adapter
 * continues to use `/sleep` for canonical interval metrics; daily scores stay
 * provider-linked context rather than being invented as backend metric types.
 */
async function fetchDailySleep(token, startDate, endDate, nextToken, fetchImpl = fetch) {
    const params = new URLSearchParams();
    if (startDate)
        params.set("start_date", startDate);
    if (endDate)
        params.set("end_date", endDate);
    if (nextToken)
        params.set("next_token", nextToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const response = await fetchImpl(`${OURA_API_BASE}/daily_sleep${qs}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Oura API error: ${response.status}`);
    return response.json();
}
async function fetchHeartRate(token, startDate, endDate, nextToken, fetchImpl = fetch) {
    const params = new URLSearchParams();
    if (startDate)
        params.set("start_datetime", startDate);
    if (endDate)
        params.set("end_datetime", endDate);
    // The v2 heartrate route pages via next_token — a 30-day backfill will page.
    if (nextToken)
        params.set("next_token", nextToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const response = await fetchImpl(`${OURA_API_BASE}/heartrate${qs}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Oura API error: ${response.status}`);
    return response.json();
}
async function fetchSleep(token, startDate, endDate, nextToken, fetchImpl = fetch) {
    const params = new URLSearchParams();
    if (startDate)
        params.set("start_date", startDate);
    if (endDate)
        params.set("end_date", endDate);
    if (nextToken)
        params.set("next_token", nextToken);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const response = await fetchImpl(`${OURA_API_BASE}/sleep${qs}`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok)
        throw new Error(`Oura API error: ${response.status}`);
    return response.json();
}
