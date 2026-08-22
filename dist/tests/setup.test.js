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
const node_path_1 = require("node:path");
const setup_js_1 = require("../src/setup.js");
const enrollment_js_1 = require("../src/enrollment.js");
const identity_js_1 = require("../src/identity.js");
const API_URL = "https://api.example.test/api/v1";
const PROVISIONED_API_URL = "https://provisioned.example.test/api/v1";
const DEVICE_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";
const ROTATED_DEVICE_CREDENTIAL = "dbd_vwxyz0123456789abcdefghijklmnop";
const LEGACY_API_KEY = "dbk_legacy-session-12345";
const ENROLLMENT_GRANT = "dbe_0123456789abcdefghijklmnopqrstuv";
const INSTALLATION_NONCE = "dbi_0123456789abcdefghijklmnopqrstuv";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const LEGACY_USER_ID = "apikey:dbk_ab12cd34";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
function enrollmentResponse(overrides = {}) {
    return {
        ok: true,
        status: 200,
        json: async () => ({
            success: true,
            data: {
                api_url: API_URL,
                device_credential: DEVICE_CREDENTIAL,
                user_id: USER_ID,
                device_id: DEVICE_ID,
                ...overrides,
            },
        }),
    };
}
function confirmationResponse(status = 200, data = { status: "confirmed" }) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ success: status >= 200 && status < 300, data }),
    };
}
function versionResponse(contractVersion, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({
            success: status >= 200 && status < 300,
            data: { contract_version: contractVersion },
        }),
    };
}
function compatibleBackendFetch(handler) {
    return (async (input, init) => {
        if (String(input).endsWith("/version"))
            return versionResponse(1);
        return handler(input, init);
    });
}
function testTmpRoot() {
    const root = (0, node_path_1.join)(process.cwd(), ".test-tmp", "setup");
    (0, node_fs_1.mkdirSync)(root, { recursive: true });
    return root;
}
(0, node_test_1.describe)("setup MCP registration", () => {
    (0, node_test_1.it)("registers the published package through npx", () => {
        const config = (0, setup_js_1.applyMcpRuntimeRegistration)({
            mcpServers: {
                existing: { command: "example", args: ["--flag"] },
            },
        });
        assert.deepStrictEqual(config.mcpServers[setup_js_1.MCP_SERVER_NAME], {
            command: setup_js_1.MCP_RUNTIME_COMMAND,
            args: [...setup_js_1.MCP_RUNTIME_ARGS],
        });
        assert.deepStrictEqual(config.mcpServers.existing, {
            command: "example",
            args: ["--flag"],
        });
    });
});
(0, node_test_1.describe)("setup config", () => {
    (0, node_test_1.it)("adds a blank license placeholder to an enrolled config", () => {
        const config = (0, setup_js_1.buildSetupConfig)({}, {
            device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
            api_url: "https://api.example.test",
            sources: [],
        });
        assert.deepStrictEqual(config, {
            device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
            api_url: "https://api.example.test",
            sources: [],
            license_key: "",
        });
    });
    (0, node_test_1.it)("preserves canonical identity while scrubbing legacy DB, auth, and non-canonical identity fields", () => {
        const config = (0, setup_js_1.buildSetupConfig)({
            api_key: "dbk_existing",
            postgres_url: "postgresql://shared-secret",
            postgres_maintenance_url: "postgresql://owner-secret",
            database_url: "postgresql://legacy-secret",
            user_id: "caller-selected-user",
            device_id: "caller-selected-device",
            engine_dist_path: "/tmp/published-package/dist",
            enrollment_grant: "dbe_consumed-grant-0123456789",
            license_key: "dbw_v1.payload.signature",
            entitlement_public_key: "public-key",
            checkout_url: "https://checkout.example.test",
        }, {
            device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
            api_url: "https://api.example.test",
            sources: ["oura"],
        });
        assert.equal(config.license_key, "dbw_v1.payload.signature");
        assert.equal(config.entitlement_public_key, "public-key");
        assert.equal(config.checkout_url, "https://checkout.example.test");
        assert.deepStrictEqual(config.sources, ["oura"]);
        for (const key of [
            "api_key",
            "postgres_url",
            "postgres_maintenance_url",
            "database_url",
            "user_id",
            "device_id",
            "engine_dist_path",
        ]) {
            assert.equal(Object.prototype.hasOwnProperty.call(config, key), false, key);
        }
        assert.equal(Object.prototype.hasOwnProperty.call(config, "enrollment_grant"), false);
        const canonicalConfig = (0, setup_js_1.buildSetupConfig)({
            user_id: USER_ID,
            device_id: DEVICE_ID,
        }, {
            device_credential: DEVICE_CREDENTIAL,
            api_url: API_URL,
        });
        assert.equal(canonicalConfig.user_id, USER_ID);
        assert.equal(canonicalConfig.device_id, DEVICE_ID);
    });
    (0, node_test_1.it)("secure config mutation preserves a canonical confirmed owner tuple", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-confirmed-owner-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            installation_nonce: INSTALLATION_NONCE,
            user_id: USER_ID,
            device_id: DEVICE_ID,
        }), { mode: 0o600 });
        try {
            const mutated = (0, enrollment_js_1.mutateSecureClientConfig)(configFile, (current) => ({
                ...current,
                sources: ["granola"],
            }));
            assert.equal(mutated.user_id, USER_ID);
            assert.equal(mutated.device_id, DEVICE_ID);
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.user_id, USER_ID);
            assert.equal(persisted.device_id, DEVICE_ID);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
});
(0, node_test_1.describe)("authenticated device enrollment", () => {
    let savedEnrollmentGrant;
    (0, node_test_1.beforeEach)(() => {
        savedEnrollmentGrant = process.env.DAOBREW_ENROLLMENT_GRANT;
        delete process.env.DAOBREW_ENROLLMENT_GRANT;
    });
    (0, node_test_1.afterEach)(() => {
        if (savedEnrollmentGrant === undefined)
            delete process.env.DAOBREW_ENROLLMENT_GRANT;
        else
            process.env.DAOBREW_ENROLLMENT_GRANT = savedEnrollmentGrant;
    });
    (0, node_test_1.it)("prefers the legacy authenticated exchange and persists no tenant selector or legacy secret", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        const backupFile = `${configFile}.bak`;
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            installation_nonce: INSTALLATION_NONCE,
            enrollment_grant: ENROLLMENT_GRANT,
            postgres_url: "postgresql://shared-secret",
            postgres_maintenance_url: "postgresql://owner-secret",
            database_url: "postgresql://other-secret",
            user_id: "caller-user",
            device_id: "caller-device",
            sources: ["oura"],
        }), { mode: 0o600 });
        (0, node_fs_1.writeFileSync)(backupFile, "postgresql://backup-secret", { mode: 0o600 });
        const calls = [];
        try {
            const result = await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                apiUrl: "https://attacker.example.test/api/v1",
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    calls.push({ url: String(input), init });
                    if (String(input).endsWith("/device/confirm"))
                        return confirmationResponse();
                    return enrollmentResponse({ user_id: LEGACY_USER_ID });
                })),
            });
            assert.equal(result.enrolled, true);
            assert.equal(result.enrollment.userId, LEGACY_USER_ID, "the exact retired /register principal remains transiently available");
            assert.equal(calls.length, 2);
            assert.equal(calls[0].url, `${API_URL}/device/exchange`);
            assert.equal((calls[0].init?.headers).Authorization, `Bearer ${LEGACY_API_KEY}`);
            assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
                surface: "wellness-mcp",
                platform: "darwin",
                installation_nonce: INSTALLATION_NONCE,
            });
            assert.equal(calls[1].url, `${API_URL}/device/confirm`);
            assert.equal((calls[1].init?.headers).Authorization, `Bearer ${DEVICE_CREDENTIAL}`);
            assert.deepStrictEqual(JSON.parse(String(calls[1].init?.body)), {
                installation_nonce: INSTALLATION_NONCE,
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.deepStrictEqual(persisted, {
                api_url: API_URL,
                sources: ["oura"],
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                installation_nonce: INSTALLATION_NONCE,
            });
            assert.equal((0, node_fs_1.statSync)(configFile).mode & 0o777, 0o600);
            assert.equal((0, node_fs_1.statSync)(tempDir).mode & 0o777, 0o700);
            assert.equal((0, node_fs_1.existsSync)(backupFile), false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("uses a trusted dbe provisioning path only when no legacy session exists", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            enrollment_grant: ENROLLMENT_GRANT,
            installation_nonce: INSTALLATION_NONCE,
            sources: ["oura"],
        }), { mode: 0o600 });
        const calls = [];
        try {
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                apiUrl: "https://attacker.example.test/api/v1",
                metadata: { surface: "sentinel-mac", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    calls.push({ url: String(input), init });
                    if (String(input).endsWith("/device/confirm"))
                        return confirmationResponse();
                    return enrollmentResponse();
                })),
            });
            assert.equal(calls[0].url, `${API_URL}/device/enroll`);
            assert.equal((calls[0].init?.headers).Authorization, `Bearer ${ENROLLMENT_GRANT}`);
            assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
                surface: "sentinel-mac",
                platform: "darwin",
                installation_nonce: INSTALLATION_NONCE,
            });
            assert.equal(calls[1].url, `${API_URL}/device/confirm`);
            assert.deepStrictEqual(JSON.parse(String(calls[1].init?.body)), {
                installation_nonce: INSTALLATION_NONCE,
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.deepStrictEqual(persisted, {
                api_url: API_URL,
                sources: ["oura"],
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                installation_nonce: INSTALLATION_NONCE,
            });
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("uses an already-confirmed credential after one backend contract readiness check", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            installation_nonce: INSTALLATION_NONCE,
            user_id: USER_ID,
            device_id: DEVICE_ID,
            sources: ["oura"],
        }), { mode: 0o600 });
        const calls = [];
        try {
            const result = await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: (async (input) => {
                    calls.push(String(input));
                    return versionResponse(1);
                }),
            });
            assert.equal(result.enrolled, false);
            assert.equal(result.enrollment.deviceCredential, DEVICE_CREDENTIAL);
            assert.deepStrictEqual(calls, [`${API_URL}/version`]);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("confirm persists the server-returned owner tuple and opens the owner gate", async () => {
        const home = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-confirm-owner-"));
        const configDir = (0, node_path_1.join)(home, ".daobrew");
        (0, node_fs_1.mkdirSync)(configDir, { mode: 0o700 });
        const configFile = (0, node_path_1.join)(configDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            enrollment_grant: ENROLLMENT_GRANT,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        try {
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input) => {
                    if (String(input).endsWith("/device/confirm")) {
                        return confirmationResponse(200, {
                            status: "confirmed",
                            user_id: USER_ID,
                            device_id: DEVICE_ID,
                        });
                    }
                    return enrollmentResponse();
                })),
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.user_id, USER_ID);
            assert.equal(persisted.device_id, DEVICE_ID);
            assert.equal(persisted.device_credential_confirmed, true);
            const owner = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home);
            assert.equal(owner.ok, true);
            if (owner.ok)
                assert.equal(owner.owner.userId, USER_ID);
        }
        finally {
            (0, node_fs_1.rmSync)(home, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("confirmed config missing user_id self-heals via idempotent re-confirm", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-confirm-self-heal-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        let confirmationCalls = 0;
        try {
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input) => {
                    if (String(input).endsWith("/device/confirm")) {
                        confirmationCalls += 1;
                        return confirmationResponse(200, {
                            status: "confirmed",
                            user_id: USER_ID,
                            device_id: DEVICE_ID,
                        });
                    }
                    throw new Error("unexpected enrollment request");
                })),
            });
            assert.equal(confirmationCalls, 1);
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.user_id, USER_ID);
            assert.equal(persisted.device_id, DEVICE_ID);
            assert.equal(persisted.device_credential_confirmed, true);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps a confirmed credential durable when owner repair is temporarily unavailable", async () => {
        for (const outageAt of ["version", "confirm"]) {
            const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), `daobrew-confirm-${outageAt}-outage-`));
            const configFile = (0, node_path_1.join)(tempDir, "config.json");
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
                api_url: API_URL,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                installation_nonce: INSTALLATION_NONCE,
            }), { mode: 0o600 });
            try {
                await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                    configFile,
                    metadata: { surface: "wellness-mcp", platform: "darwin" },
                    fetchImpl: (async (input) => {
                        if (String(input).endsWith("/version")) {
                            if (outageAt === "version")
                                throw new Error("synthetic version outage");
                            return versionResponse(1);
                        }
                        throw new Error("synthetic confirm outage");
                    }),
                }), (error) => {
                    assert.match(error.message, outageAt === "version" ? /temporarily unavailable/ : /backend is unreachable/);
                    return true;
                });
                const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
                assert.equal(persisted.device_credential, DEVICE_CREDENTIAL);
                assert.equal(persisted.device_credential_confirmed, true);
                assert.equal("user_id" in persisted, false);
            }
            finally {
                (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
            }
        }
    });
    (0, node_test_1.it)("confirm response without user_id keeps the confirmed credential", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-confirm-compatible-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: false,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        try {
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input) => {
                    assert.equal(String(input), `${API_URL}/device/confirm`);
                    return confirmationResponse();
                })),
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.device_credential_confirmed, true);
            assert.equal("user_id" in persisted, false);
            assert.equal("device_id" in persisted, false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed for older, missing, malformed, and missing-route backend contract versions", async () => {
        await (0, enrollment_js_1.assertBackendContractCompatible)(API_URL, (async () => versionResponse(1)));
        await (0, enrollment_js_1.assertBackendContractCompatible)(API_URL, (async () => versionResponse(2)));
        for (const response of [
            versionResponse(0),
            versionResponse(undefined),
            versionResponse("1"),
            { ok: true, status: 200, json: async () => ({ success: true, data: {} }) },
            { ok: false, status: 404, json: async () => ({}) },
        ]) {
            await assert.rejects((0, enrollment_js_1.assertBackendContractCompatible)(API_URL, (async () => response)), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
        }
    });
    (0, node_test_1.it)("never rebinds a persisted bearer to an environment API URL", () => {
        assert.deepStrictEqual((0, enrollment_js_1.resolveCredentialBoundClientConfig)({
            device_credential: DEVICE_CREDENTIAL,
            api_url: API_URL,
        }, {
            apiUrl: "https://attacker.example.test/api/v1",
        }), {
            deviceCredential: DEVICE_CREDENTIAL,
            apiUrl: API_URL,
        });
        assert.deepStrictEqual((0, enrollment_js_1.resolveCredentialBoundClientConfig)({}, {
            deviceCredential: DEVICE_CREDENTIAL,
            apiUrl: "http://127.0.0.1:8787/api/v1",
        }), {
            deviceCredential: DEVICE_CREDENTIAL,
            apiUrl: "http://127.0.0.1:8787/api/v1",
        });
    });
    (0, node_test_1.it)("keeps recovery authority through a confirmation outage, then resumes without re-exchange", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            installation_nonce: INSTALLATION_NONCE,
            sources: ["oura"],
        }), { mode: 0o600 });
        const firstCalls = [];
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input) => {
                    const url = String(input);
                    firstCalls.push(url);
                    return url.endsWith("/device/confirm")
                        ? confirmationResponse(503)
                        : enrollmentResponse({ user_id: LEGACY_USER_ID });
                })),
            }), /confirmation is temporarily unavailable/);
            assert.deepStrictEqual(firstCalls, [
                `${API_URL}/device/exchange`,
                `${API_URL}/device/confirm`,
            ]);
            const unconfirmed = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(unconfirmed.api_key, LEGACY_API_KEY);
            assert.equal(unconfirmed.device_credential, DEVICE_CREDENTIAL);
            assert.equal(unconfirmed.device_credential_confirmed, false);
            assert.equal(unconfirmed.installation_nonce, INSTALLATION_NONCE);
            const retryCalls = [];
            const result = await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    retryCalls.push({ url: String(input), init });
                    return confirmationResponse();
                })),
            });
            assert.equal(result.enrolled, false);
            assert.deepStrictEqual(retryCalls.map((call) => call.url), [
                `${API_URL}/device/confirm`,
            ]);
            assert.deepStrictEqual(JSON.parse(String(retryCalls[0].init?.body)), {
                installation_nonce: INSTALLATION_NONCE,
            });
            const confirmed = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(confirmed.device_credential_confirmed, true);
            assert.equal("api_key" in confirmed, false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("reuses the same installation nonce after a lost exchange response", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        let firstBody;
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (_input, init) => {
                    firstBody = JSON.parse(String(init?.body));
                    throw new Error("response lost");
                })),
            }), /backend is unreachable/);
            assert.equal(firstBody?.installation_nonce, INSTALLATION_NONCE);
            const afterLoss = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(afterLoss.api_key, LEGACY_API_KEY);
            assert.equal(afterLoss.installation_nonce, INSTALLATION_NONCE);
            const retryBodies = [];
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    retryBodies.push(JSON.parse(String(init?.body)));
                    return String(input).endsWith("/device/confirm")
                        ? confirmationResponse()
                        : enrollmentResponse({ user_id: LEGACY_USER_ID });
                })),
            });
            assert.equal(retryBodies[0].installation_nonce, INSTALLATION_NONCE);
            assert.equal(retryBodies[1].installation_nonce, INSTALLATION_NONCE);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rotates a rejected unconfirmed credential through the retained legacy source", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: false,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        const calls = [];
        try {
            const result = await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    const url = String(input);
                    calls.push({ url, init });
                    if (url.endsWith("/device/confirm") && calls.length === 1) {
                        return confirmationResponse(401);
                    }
                    if (url.endsWith("/device/exchange")) {
                        return enrollmentResponse({
                            user_id: LEGACY_USER_ID,
                            device_credential: ROTATED_DEVICE_CREDENTIAL,
                        });
                    }
                    return confirmationResponse();
                })),
            });
            assert.deepStrictEqual(calls.map((call) => call.url), [
                `${API_URL}/device/confirm`,
                `${API_URL}/device/exchange`,
                `${API_URL}/device/confirm`,
            ]);
            for (const call of calls) {
                assert.equal(JSON.parse(String(call.init?.body)).installation_nonce, INSTALLATION_NONCE);
            }
            assert.equal(result.enrollment.deviceCredential, ROTATED_DEVICE_CREDENTIAL);
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.device_credential, ROTATED_DEVICE_CREDENTIAL);
            assert.equal(persisted.device_credential_confirmed, true);
            assert.equal("api_key" in persisted, false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps a rejected confirmed bearer after the secure writer scrubs its legacy source", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        const calls = [];
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async (input, init) => {
                    calls.push({ url: String(input), init });
                    return confirmationResponse(401);
                })),
            }), (error) => {
                assert.ok(error instanceof enrollment_js_1.EnrollmentNeededError);
                assert.equal(error.reason, "no_migration_credential");
                return true;
            });
            assert.deepStrictEqual(calls.map((call) => call.url), [
                `${API_URL}/device/confirm`,
            ]);
            for (const call of calls) {
                assert.equal(JSON.parse(String(call.init?.body)).installation_nonce, INSTALLATION_NONCE);
            }
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.deepStrictEqual(persisted, {
                api_url: API_URL,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                installation_nonce: INSTALLATION_NONCE,
            });
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("checks backend contract before accepting a concurrently confirmed credential", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: false,
            installation_nonce: INSTALLATION_NONCE,
        }), { mode: 0o600 });
        const calls = [];
        try {
            const result = await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: (async (input) => {
                    const url = String(input);
                    calls.push(url);
                    if (url.endsWith("/version"))
                        return versionResponse(1);
                    if (url.endsWith("/device/confirm")) {
                        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
                            api_url: PROVISIONED_API_URL,
                            device_credential: ROTATED_DEVICE_CREDENTIAL,
                            device_credential_confirmed: true,
                            installation_nonce: INSTALLATION_NONCE,
                        }), { mode: 0o600 });
                        return confirmationResponse(401);
                    }
                    throw new Error(`unexpected request ${url}`);
                }),
            });
            assert.equal(result.enrolled, false);
            assert.equal(result.enrollment.deviceCredential, ROTATED_DEVICE_CREDENTIAL);
            assert.equal(result.enrollment.apiUrl, PROVISIONED_API_URL);
            assert.deepStrictEqual(calls, [
                `${API_URL}/version`,
                `${API_URL}/device/confirm`,
                `${PROVISIONED_API_URL}/version`,
            ]);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("returns typed ENROLLMENT_NEEDED without silently minting", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        let fetchCalls = 0;
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                apiUrl: API_URL,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: (async () => {
                    fetchCalls += 1;
                    return enrollmentResponse();
                }),
            }), (error) => {
                assert.ok(error instanceof enrollment_js_1.EnrollmentNeededError);
                assert.equal(error.code, "ENROLLMENT_NEEDED");
                assert.equal(error.reason, "no_migration_credential");
                assert.match(error.message, /sign in again|support/i);
                assert.doesNotMatch(error.message, /grant|paste/i);
                return true;
            });
            assert.equal(fetchCalls, 0);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preserves a rejected legacy credential for re-auth recovery", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: API_URL,
            api_key: LEGACY_API_KEY,
            postgres_url: "postgresql://must-be-removed",
        }), { mode: 0o600 });
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async () => ({ ok: false, status: 401 }))),
            }), (error) => {
                assert.ok(error instanceof enrollment_js_1.EnrollmentNeededError);
                assert.equal(error.reason, "legacy_exchange_rejected");
                return true;
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.api_key, LEGACY_API_KEY);
            assert.equal("postgres_url" in persisted, false);
            assert.equal((0, node_fs_1.statSync)(configFile).mode & 0o777, 0o600);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps a temporary exchange outage distinct from invalid authentication", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({ api_url: API_URL, api_key: LEGACY_API_KEY }), { mode: 0o600 });
        try {
            await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl: compatibleBackendFetch((async () => ({ ok: false, status: 503 }))),
            }), (error) => {
                assert.equal(error instanceof enrollment_js_1.EnrollmentNeededError, false);
                assert.match(error.message, /temporarily unavailable/);
                return true;
            });
            const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
            assert.equal(persisted.api_key, LEGACY_API_KEY);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("classifies enrollment route 404s and malformed success bodies as backend incompatible", async () => {
        const metadata = { surface: "wellness-mcp", platform: "darwin" };
        await assert.rejects((0, enrollment_js_1.requestLegacyDeviceExchange)(API_URL, LEGACY_API_KEY, metadata, INSTALLATION_NONCE, (async () => ({ ok: false, status: 404 }))), (error) => {
            assert.ok(error instanceof enrollment_js_1.BackendIncompatibleError);
            assert.equal(error.code, "backend_incompatible");
            assert.match(error.message, /backend version/i);
            return true;
        });
        await assert.rejects((0, enrollment_js_1.requestDeviceEnrollment)(API_URL, ENROLLMENT_GRANT, metadata, INSTALLATION_NONCE, (async () => ({ ok: false, status: 404 }))), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
        await assert.rejects((0, enrollment_js_1.requestDeviceEnrollment)(API_URL, ENROLLMENT_GRANT, metadata, INSTALLATION_NONCE, (async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { api_url: API_URL } }),
        }))), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
        await assert.rejects((0, enrollment_js_1.requestLegacyDeviceExchange)(API_URL, LEGACY_API_KEY, metadata, INSTALLATION_NONCE, (async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError("invalid json");
            },
        }))), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
        await assert.rejects((0, enrollment_js_1.requestDeviceEnrollment)(API_URL, ENROLLMENT_GRANT, metadata, INSTALLATION_NONCE, (async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError("invalid json");
            },
        }))), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
    });
    (0, node_test_1.it)("keeps 5xx enrollment failures on the transient retry path", async () => {
        await assert.rejects((0, enrollment_js_1.requestDeviceEnrollment)(API_URL, ENROLLMENT_GRANT, { surface: "sentinel-mac", platform: "darwin" }, INSTALLATION_NONCE, (async () => ({ ok: false, status: 503 }))), (error) => {
            assert.equal(error instanceof enrollment_js_1.BackendIncompatibleError, false);
            assert.match(error.message, /temporarily unavailable/);
            return true;
        });
    });
    (0, node_test_1.it)("rejects missing or malformed device fields in a successful exchange", async () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({ api_url: API_URL, api_key: LEGACY_API_KEY }), { mode: 0o600 });
        try {
            for (const response of [
                enrollmentResponse({ device_credential: "dbk_not-a-device-token" }),
                enrollmentResponse({ user_id: "caller-chosen" }),
                enrollmentResponse({ user_id: "apikey:victim" }),
                enrollmentResponse({ user_id: "apikey:dbk_too_short" }),
                enrollmentResponse({ device_id: undefined }),
                enrollmentResponse({ api_url: "https://user:secret@api.example.test/api/v1" }),
            ]) {
                await assert.rejects((0, enrollment_js_1.ensureDeviceEnrollment)({
                    configFile,
                    metadata: { surface: "wellness-mcp", platform: "darwin" },
                    fetchImpl: compatibleBackendFetch((async () => response)),
                }), (error) => error instanceof enrollment_js_1.BackendIncompatibleError);
                const persisted = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
                assert.equal(persisted.api_key, LEGACY_API_KEY);
                assert.equal("device_credential" in persisted, false);
            }
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed on malformed config and clears possible embedded secrets", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, "{ not-json postgresql://shared-secret", { mode: 0o644 });
        try {
            assert.throws(() => (0, enrollment_js_1.readClientConfigFile)(configFile), /malformed.*securely cleared/i);
            assert.deepStrictEqual(JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8")), { config_repair_required: true });
            assert.equal((0, node_fs_1.readFileSync)(configFile, "utf8").includes("postgresql"), false);
            assert.equal((0, node_fs_1.statSync)(configFile).mode & 0o777, 0o600);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("clears an existing config with an unsafe credential-bearing API URL", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            api_url: "https://user:secret@api.example.test/api/v1",
            postgres_url: "postgresql://shared-secret",
        }), { mode: 0o600 });
        try {
            assert.throws(() => (0, enrollment_js_1.readClientConfigFile)(configFile), /unsafe API URL.*securely cleared/i);
            const contents = (0, node_fs_1.readFileSync)(configFile, "utf8");
            assert.deepStrictEqual(JSON.parse(contents), { config_repair_required: true });
            assert.equal(/secret|postgresql/.test(contents), false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("accepts HTTPS and loopback HTTP only, with no embedded credentials/query/fragment", () => {
        assert.equal((0, enrollment_js_1.normalizeApiUrl)("https://api.example.test/api/v1/"), API_URL);
        assert.equal((0, enrollment_js_1.normalizeApiUrl)("http://127.0.0.1:8000/api/v1"), "http://127.0.0.1:8000/api/v1");
        for (const value of [
            "http://api.example.test/api/v1",
            "https://user:secret@api.example.test/api/v1",
            "https://api.example.test/api/v1?token=secret",
            "https://api.example.test/api/v1#fragment",
        ]) {
            assert.throws(() => (0, enrollment_js_1.normalizeApiUrl)(value));
        }
    });
    (0, node_test_1.it)("secure writer rejects a credential-bearing API URL", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        try {
            assert.throws(() => (0, enrollment_js_1.writeSecureClientConfig)(configFile, {
                api_url: "https://user:secret@api.example.test/api/v1",
            }), /embedded credentials/);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps one persistent owner-only config lock inode", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        const lockFile = (0, node_path_1.join)(tempDir, "config.lock");
        try {
            (0, enrollment_js_1.writeSecureClientConfig)(configFile, { first: true });
            const firstLock = (0, node_fs_1.statSync)(lockFile);
            assert.equal(firstLock.isFile(), true);
            assert.equal(firstLock.mode & 0o777, 0o600);
            assert.equal((0, node_fs_1.statSync)(tempDir).mode & 0o777, 0o700);
            (0, enrollment_js_1.writeSecureClientConfig)(configFile, { second: true });
            assert.equal((0, node_fs_1.statSync)(lockFile).ino, firstLock.ino);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a config lock symlink without touching its target", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-enrollment-"));
        const configFile = (0, node_path_1.join)(tempDir, "config.json");
        const target = (0, node_path_1.join)(tempDir, "outside-target");
        (0, node_fs_1.writeFileSync)(target, "unchanged", { mode: 0o600 });
        (0, node_fs_1.symlinkSync)(target, (0, node_path_1.join)(tempDir, "config.lock"));
        try {
            assert.throws(() => (0, enrollment_js_1.writeSecureClientConfig)(configFile, { must_not_write: true }), /could not be opened safely/);
            assert.equal((0, node_fs_1.readFileSync)(target, "utf8"), "unchanged");
            assert.equal((0, node_fs_1.existsSync)(configFile), false);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
});
(0, node_test_1.describe)("setup engine dist path", () => {
    (0, node_test_1.it)("resolves the dist dir containing the built internal server", () => {
        const tmp = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-setup-"));
        // Layout mirrors the published package: <pkg>/dist/src/setup.js is baseDir.
        const distDir = (0, node_path_1.join)(tmp, "dist");
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(distDir, "src", "engine"), { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(distDir, "src", "engine", "internal-server.js"), "// built");
        const baseDir = (0, node_path_1.join)(distDir, "src"); // where setup.js lives at runtime
        assert.strictEqual((0, setup_js_1.resolveEngineDistPath)(baseDir), distDir);
        (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
    });
    (0, node_test_1.it)("returns null when the engine is not built", () => {
        const tmp = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-setup-"));
        assert.strictEqual((0, setup_js_1.resolveEngineDistPath)((0, node_path_1.join)(tmp, "dist", "src")), null);
        (0, node_fs_1.rmSync)(tmp, { recursive: true, force: true });
    });
});
(0, node_test_1.describe)("setup skill installation", () => {
    (0, node_test_1.it)("packages the canonical Detonator skill", () => {
        const source = (0, setup_js_1.resolvePackagedFile)(setup_js_1.DETONATOR_SKILL_PACKAGE_PATH);
        assert.ok(source);
        assert.match((0, node_fs_1.readFileSync)(source, "utf-8"), /name: detonator/);
        assert.match((0, node_fs_1.readFileSync)(source, "utf-8"), /daobrew_detonate/);
    });
    (0, node_test_1.it)("installs the Detonator skill to a skill directory", () => {
        const tempDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "daobrew-skill-install-"));
        try {
            const destinationDir = (0, node_path_1.join)(tempDir, ".codex", "skills", "detonator");
            const result = (0, setup_js_1.installPackagedSkill)(setup_js_1.DETONATOR_SKILL_PACKAGE_PATH, destinationDir);
            assert.ok(result);
            assert.equal(result.destination, (0, node_path_1.join)(destinationDir, "SKILL.md"));
            assert.match((0, node_fs_1.readFileSync)(result.destination, "utf-8"), /name: detonator/);
            assert.match((0, node_fs_1.readFileSync)(result.destination, "utf-8"), /daobrew_detonate_done/);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    });
});
