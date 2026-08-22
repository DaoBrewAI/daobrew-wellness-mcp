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
const index_js_1 = require("../src/index.js");
const PERSISTED_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";
const ENVIRONMENT_CREDENTIAL = "dbd_vutsrqponmlkjihgfedcba9876543210";
const ENV_KEYS = [
    "DAOBREW_API_URL",
    "DAOBREW_DEVICE_CREDENTIAL",
    "DAOBREW_MOCK",
];
function withEnv(env, run) {
    const previous = new Map();
    for (const key of ENV_KEYS)
        previous.set(key, process.env[key]);
    try {
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
        return run();
    }
    finally {
        for (const [key, value] of previous) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    }
}
(0, node_test_1.describe)("MCP credential-bound startup", () => {
    (0, node_test_1.it)("uses the persisted device credential and its persisted server URL as one authority record", () => {
        withEnv({
            DAOBREW_DEVICE_CREDENTIAL: ENVIRONMENT_CREDENTIAL,
            DAOBREW_API_URL: "https://attacker.example.test/api/v1",
            DAOBREW_MOCK: undefined,
        }, () => {
            const runtime = (0, index_js_1.createMcpRuntime)({
                device_credential: PERSISTED_CREDENTIAL,
                api_url: "https://api.example.test/api/v1/",
            }, ["node", "index.js"]);
            assert.equal(runtime.isMock, false);
            assert.equal(runtime.deviceCredential, PERSISTED_CREDENTIAL);
            assert.equal(runtime.apiUrl, "https://api.example.test/api/v1");
            assert.ok(runtime.client);
        });
    });
    (0, node_test_1.it)("allows a paired environment credential and URL only when no credential is persisted", () => {
        withEnv({
            DAOBREW_DEVICE_CREDENTIAL: ENVIRONMENT_CREDENTIAL,
            DAOBREW_API_URL: "https://development.example.test/api/v1",
            DAOBREW_MOCK: undefined,
        }, () => {
            const runtime = (0, index_js_1.createMcpRuntime)({}, ["node", "index.js"]);
            assert.equal(runtime.isMock, false);
            assert.equal(runtime.deviceCredential, ENVIRONMENT_CREDENTIAL);
            assert.equal(runtime.apiUrl, "https://development.example.test/api/v1");
            assert.ok(runtime.client);
        });
    });
    (0, node_test_1.it)("does not treat legacy API keys or caller-selected UUIDs as backend identity", () => {
        withEnv({
            DAOBREW_DEVICE_CREDENTIAL: undefined,
            DAOBREW_API_URL: undefined,
            DAOBREW_MOCK: undefined,
        }, () => {
            const logs = [];
            const runtime = (0, index_js_1.createMcpRuntime)({
                api_url: "https://api.example.test/api/v1",
                api_key: "dbk_legacy_install",
                user_id: "8D6C05BD-9220-46F7-822C-23F0F0D2DA41",
            }, ["node", "index.js"], (message) => logs.push(message));
            assert.equal(runtime.isMock, true);
            assert.equal(runtime.deviceCredential, undefined);
            assert.equal(runtime.client, undefined);
            assert.match(runtime.mockReason ?? "", /device credential/i);
            assert.equal(logs.length, 1);
        });
    });
    (0, node_test_1.it)("fails closed into mock mode when the credential-bound URL is unsafe", () => {
        withEnv({
            DAOBREW_DEVICE_CREDENTIAL: undefined,
            DAOBREW_API_URL: undefined,
            DAOBREW_MOCK: undefined,
        }, () => {
            const logs = [];
            const runtime = (0, index_js_1.createMcpRuntime)({
                device_credential: PERSISTED_CREDENTIAL,
                api_url: "http://api.example.test/api/v1",
            }, ["node", "index.js"], (message) => logs.push(message));
            assert.equal(runtime.isMock, true);
            assert.equal(runtime.client, undefined);
            assert.match(runtime.mockReason ?? "", /HTTPS/);
            assert.equal(logs.length, 1);
        });
    });
    (0, node_test_1.it)("honors explicit mock and demo flags without constructing an authenticated client", () => {
        withEnv({ DAOBREW_MOCK: undefined }, () => {
            const runtime = (0, index_js_1.createMcpRuntime)({
                device_credential: PERSISTED_CREDENTIAL,
                api_url: "https://api.example.test/api/v1",
            }, ["node", "index.js", "--mock", "--demo"]);
            assert.equal(runtime.isMock, true);
            assert.equal(runtime.isDemo, true);
            assert.equal(runtime.client, undefined);
            assert.equal(runtime.mockReason, "mock mode requested");
        });
    });
    (0, node_test_1.it)("fails closed before MCP readiness when the credential-bound backend is incompatible", async () => {
        let checked = false;
        await assert.rejects((0, index_js_1.assertMcpRuntimeReady)({
            isMock: false,
            isDemo: false,
            client: {
                assertBackendCompatible: async () => {
                    checked = true;
                    throw new Error("DaoBrew backend version is behind this client");
                },
            },
        }), /backend version is behind/i);
        assert.equal(checked, true);
    });
});
