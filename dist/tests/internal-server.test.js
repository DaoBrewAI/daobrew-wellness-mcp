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
const node_child_process_1 = require("node:child_process");
const node_stream_1 = require("node:stream");
const internal_server_js_1 = require("../src/engine/internal-server.js");
const ENV_KEYS = [
    "DAOBREW_CONFIG_FILE",
    "DAOBREW_GRAPH_STORE",
    "DAOBREW_INTERNAL_TOKEN",
    "DAOBREW_INTERNAL_USER",
    "DAOBREW_USER_ID",
];
const PAYLOAD_CAMEL_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const PAYLOAD_SNAKE_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const ENV_UUID = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
const INTERNAL_UUID = "783A7344-AE06-4125-8A37-D452A9C1C92F";
const CONFIG_UUID = "0B0CFD38-264B-4CBE-8B9C-5613428A9D25";
class FakeResponse {
    status = 0;
    headers = {};
    body = "";
    writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
    }
    end(chunk) {
        if (chunk)
            this.body += chunk;
    }
}
async function postInternal(path, payload, options) {
    const req = node_stream_1.Readable.from([JSON.stringify(payload)]);
    req.method = "POST";
    req.url = path;
    req.headers = { "content-type": "application/json" };
    const res = new FakeResponse();
    await (0, internal_server_js_1.handleRequest)(req, res, options);
    return { status: res.status, json: JSON.parse(res.body) };
}
(0, node_test_1.describe)("internal server identity resolution", () => {
    const savedEnv = new Map();
    (0, node_test_1.beforeEach)(() => {
        for (const key of ENV_KEYS) {
            savedEnv.set(key, process.env[key]);
            delete process.env[key];
        }
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-internal-server-test-config.json";
    });
    (0, node_test_1.afterEach)(() => {
        for (const key of ENV_KEYS) {
            const value = savedEnv.get(key);
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    });
    (0, node_test_1.it)("uses payload userId, payload user_id, DAOBREW_USER_ID, DAOBREW_INTERNAL_USER, then config user_id", () => {
        process.env.DAOBREW_USER_ID = ENV_UUID;
        process.env.DAOBREW_INTERNAL_USER = INTERNAL_UUID;
        assert.deepStrictEqual((0, internal_server_js_1.resolveInternalUserId)({ userId: PAYLOAD_CAMEL_UUID.toLowerCase() }, { user_id: CONFIG_UUID }), {
            ok: true,
            userId: PAYLOAD_CAMEL_UUID,
        });
        assert.deepStrictEqual((0, internal_server_js_1.resolveInternalUserId)({ user_id: PAYLOAD_SNAKE_UUID.toLowerCase() }, { user_id: CONFIG_UUID }), {
            ok: true,
            userId: PAYLOAD_SNAKE_UUID,
        });
        assert.deepStrictEqual((0, internal_server_js_1.resolveInternalUserId)({}, { user_id: CONFIG_UUID }), {
            ok: true,
            userId: ENV_UUID,
        });
        delete process.env.DAOBREW_USER_ID;
        assert.deepStrictEqual((0, internal_server_js_1.resolveInternalUserId)({}, { user_id: CONFIG_UUID }), {
            ok: true,
            userId: INTERNAL_UUID,
        });
        delete process.env.DAOBREW_INTERNAL_USER;
        assert.deepStrictEqual((0, internal_server_js_1.resolveInternalUserId)({}, { user_id: CONFIG_UUID.toLowerCase() }), {
            ok: true,
            userId: CONFIG_UUID,
        });
    });
    (0, node_test_1.it)("rejects empty and local request identities instead of falling back", () => {
        process.env.DAOBREW_USER_ID = ENV_UUID;
        for (const candidate of ["", "   ", "local", "LOCAL"]) {
            const plan = (0, internal_server_js_1.resolveInternalUserId)({ userId: candidate }, { user_id: CONFIG_UUID });
            assert.equal(plan.ok, false, `${JSON.stringify(candidate)} must fail closed`);
            if (!plan.ok)
                assert.match(plan.reason, /no canonical UUID identity/);
        }
    });
    (0, node_test_1.it)("returns 400 for identity-bearing ingest without a resolved identity", async () => {
        process.env.DAOBREW_GRAPH_STORE = "sqlite";
        const { status, json } = await postInternal("/internal/ingest/calendar", { rawEvents: [] });
        assert.equal(status, 400);
        assert.equal(json.status, "error");
        assert.match(json.error, /no canonical UUID identity/);
    });
    (0, node_test_1.it)("keeps allUsers fan-out independent of single-user identity", async () => {
        const server = (0, internal_server_js_1.createInternalServer)({ discover: async () => [] });
        assert.ok(server);
        const { status, json } = await postInternal("/internal/layer2/nightly", { allUsers: true }, { discover: async () => [] });
        assert.equal(status, 200);
        assert.equal(json.status, "ok");
        assert.equal(json.mode, "all_users");
        assert.deepEqual(json.results, []);
    });
    (0, node_test_1.it)("skips single-user layer2 CLI jobs without identity instead of writing local", () => {
        const out = (0, node_child_process_1.execFileSync)(process.execPath, [
            "dist/src/engine/internal-server.js",
            "--run",
            "layer2-nightly",
        ], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                DAOBREW_CONFIG_FILE: "/nonexistent/daobrew-internal-server-test-config.json",
                DAOBREW_GRAPH_STORE: "sqlite",
                DAOBREW_INTERNAL_USER: "",
                DAOBREW_USER_ID: "",
            },
            encoding: "utf-8",
        });
        const json = JSON.parse(out);
        assert.equal(json.status, "skipped");
        assert.match(json.reason, /no canonical UUID identity/);
    });
    (0, node_test_1.it)("skips HTTP bootstrap without identity before enforcing postgres store", async () => {
        process.env.DAOBREW_GRAPH_STORE = "sqlite";
        const { status, json } = await postInternal("/internal/bootstrap", {});
        assert.equal(status, 200);
        assert.equal(json.status, "skipped");
        assert.match(json.reason, /no canonical UUID identity/);
    });
    (0, node_test_1.it)("skips CLI bootstrap without identity before enforcing postgres store", () => {
        const out = (0, node_child_process_1.execFileSync)(process.execPath, [
            "dist/src/engine/internal-server.js",
            "--run",
            "bootstrap",
        ], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                DAOBREW_CONFIG_FILE: "/nonexistent/daobrew-internal-server-test-config.json",
                DAOBREW_GRAPH_STORE: "sqlite",
                DAOBREW_INTERNAL_USER: "",
                DAOBREW_USER_ID: "",
            },
            encoding: "utf-8",
        });
        const json = JSON.parse(out);
        assert.equal(json.status, "skipped");
        assert.match(json.reason, /no canonical UUID identity/);
    });
});
