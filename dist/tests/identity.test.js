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
const identity_js_1 = require("../src/identity.js");
const FLAG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const ENV_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const CONFIG_UUID = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
(0, node_test_1.describe)("shared identity resolver", () => {
    let savedUserId;
    let savedApiKey;
    let savedApiUrl;
    (0, node_test_1.beforeEach)(() => {
        savedUserId = process.env.DAOBREW_USER_ID;
        savedApiKey = process.env.DAOBREW_API_KEY;
        savedApiUrl = process.env.DAOBREW_API_URL;
        delete process.env.DAOBREW_USER_ID;
        delete process.env.DAOBREW_API_KEY;
        delete process.env.DAOBREW_API_URL;
    });
    (0, node_test_1.afterEach)(() => {
        if (savedUserId === undefined)
            delete process.env.DAOBREW_USER_ID;
        else
            process.env.DAOBREW_USER_ID = savedUserId;
        if (savedApiKey === undefined)
            delete process.env.DAOBREW_API_KEY;
        else
            process.env.DAOBREW_API_KEY = savedApiKey;
        if (savedApiUrl === undefined)
            delete process.env.DAOBREW_API_URL;
        else
            process.env.DAOBREW_API_URL = savedApiUrl;
    });
    (0, node_test_1.it)("resolves explicit flag before env and config", () => {
        process.env.DAOBREW_USER_ID = ENV_UUID;
        assert.deepStrictEqual((0, identity_js_1.resolveUserId)({ user_id: CONFIG_UUID }, FLAG_UUID), { ok: true, userId: FLAG_UUID });
    });
    (0, node_test_1.it)("resolves env before config when no explicit flag is provided", () => {
        process.env.DAOBREW_USER_ID = ENV_UUID;
        assert.deepStrictEqual((0, identity_js_1.resolveUserId)({ user_id: CONFIG_UUID }), { ok: true, userId: ENV_UUID });
    });
    (0, node_test_1.it)("resolves config when explicit and env are absent", () => {
        assert.deepStrictEqual((0, identity_js_1.resolveUserId)({ user_id: CONFIG_UUID }), { ok: true, userId: CONFIG_UUID });
    });
    (0, node_test_1.it)("trims and normalizes the winning identity source", () => {
        assert.deepStrictEqual((0, identity_js_1.resolveUserId)({ user_id: `  ${CONFIG_UUID.toLowerCase()}  ` }), { ok: true, userId: CONFIG_UUID });
    });
    (0, node_test_1.it)("fails closed for empty, local, api-key, and non-UUID identities", () => {
        for (const candidate of ["", "   ", "local", "LOCAL", "dbk_test", "apikey:dbk_test", "config-user"]) {
            const plan = (0, identity_js_1.resolveUserId)({ user_id: candidate });
            assert.equal(plan.ok, false);
            assert.match(plan.reason, /no canonical UUID identity/);
        }
    });
    (0, node_test_1.it)("does not let an explicit empty identity fall through to env or config", () => {
        process.env.DAOBREW_USER_ID = ENV_UUID;
        for (const explicit of ["", "   "]) {
            const plan = (0, identity_js_1.resolveUserId)({ user_id: CONFIG_UUID }, explicit);
            assert.equal(plan.ok, false);
            assert.match(plan.reason, /no canonical UUID identity/);
        }
    });
    (0, node_test_1.it)("builds client options with the user id as X-Device-ID identity", () => {
        const options = (0, identity_js_1.clientOptionsFor)({ api_url: "https://api.example.test" }, CONFIG_UUID);
        assert.deepStrictEqual(options, {
            apiKey: "",
            baseUrl: "https://api.example.test",
            deviceId: CONFIG_UUID,
        });
    });
    (0, node_test_1.it)("keeps api key auth-only and lets env override config URL/key", () => {
        process.env.DAOBREW_API_KEY = "env-key";
        process.env.DAOBREW_API_URL = "https://env.example.test";
        const options = (0, identity_js_1.clientOptionsFor)({ api_key: "config-key", api_url: "https://config.example.test" }, CONFIG_UUID);
        assert.deepStrictEqual(options, {
            apiKey: "env-key",
            baseUrl: "https://env.example.test",
            deviceId: CONFIG_UUID,
        });
    });
});
