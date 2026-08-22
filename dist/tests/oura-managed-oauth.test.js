"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const oura_js_1 = require("../src/health/oura.js");
const identity_js_1 = require("../src/identity.js");
const roots = [];
const DEVICE_CREDENTIAL = `dbd_${"a".repeat(32)}`;
const OTHER_DEVICE_CREDENTIAL = `dbd_${"b".repeat(32)}`;
const API_URL = "https://api.daobrew.example/api/v1";
const STATE = "state_0123456789abcdef0123456789";
const REDIRECT_URI = "http://localhost:8791/callback";
const ORIGINAL_HOME = process.env.HOME;
(0, node_test_1.afterEach)(() => {
    if (ORIGINAL_HOME === undefined)
        delete process.env.HOME;
    else
        process.env.HOME = ORIGINAL_HOME;
    for (const root of roots.splice(0))
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
});
function fixture() {
    const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-managed-oura-"));
    roots.push(root);
    const prefs = (0, node_path_1.join)(root, ".daobrew");
    (0, node_fs_1.mkdirSync)(prefs, { mode: 0o700 });
    const configFile = (0, node_path_1.join)(prefs, "config.json");
    (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
        user_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        api_url: API_URL,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        oura_client_id: "personal-id",
        oura_client_secret: "personal-secret",
    }), { mode: 0o600 });
    process.env.HOME = root;
    const owner = confirmedOwner(root);
    return { root, tokenFile: (0, oura_js_1.ouraTokenFileForConfirmedOwner)(owner), configFile, owner };
}
function confirmedOwner(root) {
    const plan = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(root);
    if (!plan.ok)
        throw new Error(plan.reason);
    (0, node_fs_1.mkdirSync)(plan.owner.sourceRoot, { recursive: true, mode: 0o700 });
    return plan.owner;
}
function authorizationUrl(overrides = {}) {
    const url = new URL("https://cloud.ouraring.com/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "managed-client-id");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", "daily heartrate");
    url.searchParams.set("state", STATE);
    for (const [key, value] of Object.entries(overrides))
        url.searchParams.set(key, value);
    return url.toString();
}
function startEnvelope(overrides = {}) {
    return {
        success: true,
        data: {
            authorization_url: authorizationUrl(),
            state: STATE,
            redirect_uri: REDIRECT_URI,
            scopes: ["daily", "heartrate"],
            mode: "managed",
            ...overrides,
        },
    };
}
function tokenEnvelope(overrides = {}) {
    return {
        success: true,
        data: {
            token: {
                access_token: "access-managed",
                refresh_token: "refresh-managed",
                token_type: "Bearer",
                expires_in: 3_600,
                scope: "daily heartrate",
                ...overrides,
            },
        },
    };
}
function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
    });
}
function managedConfig() {
    return (0, oura_js_1.resolveManagedOuraClientConfig)(fixture().owner);
}
(0, node_test_1.describe)("managed Oura backend protocol", () => {
    (0, node_test_1.it)("starts with bearer-only device auth, POST, and no request body", async () => {
        const calls = [];
        const fetchImpl = (async (input, init) => {
            calls.push({ url: String(input), init });
            return jsonResponse(startEnvelope());
        });
        const result = await (0, oura_js_1.startManagedOuraAuthorization)(managedConfig(), fetchImpl);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].url, `${API_URL}/device/oura/oauth/start`);
        assert.strictEqual(calls[0].init?.method, "POST");
        assert.strictEqual(calls[0].init?.body, undefined);
        const headers = new Headers(calls[0].init?.headers);
        assert.strictEqual(headers.get("authorization"), `Bearer ${DEVICE_CREDENTIAL}`);
        assert.strictEqual(headers.get("x-device-id"), null);
        assert.strictEqual(headers.get("content-type"), null);
        assert.deepStrictEqual(result, {
            authorizationUrl: authorizationUrl(),
            state: STATE,
            redirectUri: REDIRECT_URI,
            scopes: ["daily", "heartrate"],
            mode: "managed",
        });
    });
    (0, node_test_1.it)("exchanges only code/state and refreshes only refresh_token", async () => {
        const calls = [];
        const fetchImpl = (async (input, init) => {
            calls.push({ url: String(input), init });
            return jsonResponse(tokenEnvelope());
        });
        const config = managedConfig();
        await (0, oura_js_1.exchangeManagedOuraCode)(config, "one-time-code", STATE, fetchImpl);
        await (0, oura_js_1.refreshManagedOuraToken)(config, "refresh-old", fetchImpl);
        assert.strictEqual(calls[0].url, `${API_URL}/device/oura/oauth/exchange`);
        assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
            code: "one-time-code",
            state: STATE,
        });
        assert.strictEqual(calls[1].url, `${API_URL}/device/oura/oauth/refresh`);
        assert.deepStrictEqual(JSON.parse(String(calls[1].init?.body)), {
            refresh_token: "refresh-old",
        });
        for (const call of calls) {
            const headers = new Headers(call.init?.headers);
            assert.strictEqual(headers.get("authorization"), `Bearer ${DEVICE_CREDENTIAL}`);
            assert.strictEqual(headers.get("x-device-id"), null);
            assert.strictEqual(headers.get("content-type"), "application/json");
            assert.doesNotMatch(String(call.init?.body), /redirect|authorization_request_id|refresh_handle/);
        }
    });
    (0, node_test_1.it)("rejects unsafe or contract-divergent authorization starts before opening", async () => {
        const invalidStarts = [
            startEnvelope({ authorization_url: authorizationUrl({ state: `${STATE}x` }) }),
            startEnvelope({ authorization_url: authorizationUrl().replace("cloud.ouraring.com", "evil.example") }),
            startEnvelope({ authorization_url: `${authorizationUrl()}&client_secret=leak` }),
            startEnvelope({ redirect_uri: "http://127.0.0.1:8791/callback" }),
            startEnvelope({ scopes: ["daily"] }),
            startEnvelope({ mode: "personal" }),
        ];
        for (const payload of invalidStarts) {
            const fetchImpl = (async () => jsonResponse(payload));
            await assert.rejects((0, oura_js_1.startManagedOuraAuthorization)(managedConfig(), fetchImpl), /managed Oura/i);
        }
    });
    (0, node_test_1.it)("does not reflect backend OAuth error bodies or secrets", async () => {
        const secret = "secret-refresh-token-from-upstream";
        const fetchImpl = (async () => jsonResponse({ error: secret }, 502));
        await assert.rejects((0, oura_js_1.refreshManagedOuraToken)(managedConfig(), "refresh-old", fetchImpl), (error) => {
            assert.match(error.message, /HTTP 502/);
            assert.doesNotMatch(error.message, new RegExp(secret));
            assert.doesNotMatch(error.message, /refresh-old/);
            return true;
        });
    });
    (0, node_test_1.it)("rejects non-renewable or unbounded token payloads", async () => {
        for (const override of [
            { refresh_token: "" },
            { access_token: "x".repeat(8_193) },
            { expires_in: 0 },
            { expires_in: Number.POSITIVE_INFINITY },
        ]) {
            const fetchImpl = (async () => jsonResponse(tokenEnvelope(override)));
            await assert.rejects((0, oura_js_1.refreshManagedOuraToken)(managedConfig(), "refresh-old", fetchImpl), /managed Oura/i);
        }
    });
});
(0, node_test_1.describe)("managed Oura refresh persistence", () => {
    function oldManagedToken(ownerScopeDigest) {
        return {
            owner_scope_digest: ownerScopeDigest,
            access_token: "access-old",
            refresh_token: "refresh-old",
            expires_at: 1,
            token_type: "Bearer",
            scope: "daily heartrate",
            oauth_mode: "managed",
            authorization_generation: "auth_original",
            authorized_at: 1_700_000_000,
            saved_at: 1_700_000_001,
        };
    }
    (0, node_test_1.it)("refreshes via backend and preserves mode, grant generation, and authorization time", async () => {
        const { tokenFile, owner } = fixture();
        const old = oldManagedToken(owner.ownerScopeDigest);
        (0, node_fs_1.writeFileSync)(tokenFile, JSON.stringify(old), { mode: 0o600 });
        const fetchImpl = (async () => jsonResponse(tokenEnvelope({
            access_token: "access-new",
            refresh_token: "refresh-new",
        })));
        const refreshed = await (0, oura_js_1.refreshAccessToken)(old, {
            fetchImpl,
            nowMs: () => 2_000_000_000_000,
        });
        assert.strictEqual(refreshed.access_token, "access-new");
        assert.strictEqual(refreshed.refresh_token, "refresh-new");
        assert.strictEqual(refreshed.oauth_mode, "managed");
        assert.strictEqual(refreshed.authorization_generation, "auth_original");
        assert.strictEqual(refreshed.authorized_at, old.authorized_at);
        assert.strictEqual(refreshed.expires_at, 2_000_003_600_000);
        assert.deepStrictEqual(JSON.parse((0, node_fs_1.readFileSync)(tokenFile, "utf8")), refreshed);
    });
    (0, node_test_1.it)("rejects an in-flight refresh when device enrollment changes", async () => {
        const { tokenFile, configFile, owner } = fixture();
        const old = oldManagedToken(owner.ownerScopeDigest);
        (0, node_fs_1.writeFileSync)(tokenFile, JSON.stringify(old), { mode: 0o600 });
        const fetchImpl = (async () => {
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
                user_id: owner.userId,
                api_url: API_URL,
                device_credential: OTHER_DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
            }), { mode: 0o600 });
            return jsonResponse(tokenEnvelope({ access_token: "stale-access" }));
        });
        await assert.rejects((0, oura_js_1.refreshAccessToken)(old, {
            fetchImpl,
        }), /enrollment changed while Oura (?:authorization|refresh) was in progress/i);
        assert.deepStrictEqual(JSON.parse((0, node_fs_1.readFileSync)(tokenFile, "utf8")), old);
    });
    (0, node_test_1.it)("keeps missing-mode legacy tokens on the personal-app refresh path", async () => {
        const { tokenFile, owner } = fixture();
        const legacy = {
            ...oldManagedToken(owner.ownerScopeDigest),
            oauth_mode: undefined,
        };
        (0, node_fs_1.writeFileSync)(tokenFile, JSON.stringify(legacy), { mode: 0o600 });
        let requestUrl = "";
        let requestBody = "";
        const fetchImpl = (async (input, init) => {
            requestUrl = String(input);
            requestBody = String(init?.body);
            return jsonResponse({
                access_token: "legacy-access-new",
                refresh_token: "legacy-refresh-new",
                token_type: "Bearer",
                expires_in: 3_600,
                scope: "daily heartrate",
            });
        });
        const refreshed = await (0, oura_js_1.refreshAccessToken)(legacy, {
            fetchImpl,
            environment: {
                DAOBREW_OURA_CLIENT_ID: "personal-id",
                DAOBREW_OURA_CLIENT_SECRET: "personal-secret",
            },
            nowMs: () => 2_000_000_000_000,
        });
        assert.strictEqual(requestUrl, "https://api.ouraring.com/oauth/token");
        assert.match(requestBody, /client_id=personal-id/);
        assert.match(requestBody, /client_secret=personal-secret/);
        assert.strictEqual(refreshed.oauth_mode, undefined);
    });
});
