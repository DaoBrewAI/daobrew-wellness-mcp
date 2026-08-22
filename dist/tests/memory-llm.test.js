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
const llm_js_1 = require("../src/engine/memory/llm.js");
const gemini_js_1 = require("../src/engine/embeddings/gemini.js");
const local_config_js_1 = require("../src/engine/local-config.js");
function geminiResponse(obj) {
    return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
    }), { status: 200 });
}
function geminiRawResponse(text) {
    return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
    }), { status: 200 });
}
(0, node_test_1.describe)("Gemini text provider", () => {
    (0, node_test_1.it)("posts to generateContent and parses the JSON payload", async () => {
        const calls = [];
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "test-key",
            fetchImpl: (async (url, init) => {
                calls.push({
                    url: String(url),
                    body: JSON.parse(init.body),
                    headers: init.headers,
                });
                return geminiResponse({ hello: "world" });
            }),
        });
        const out = await provider.generateJson("prompt text");
        assert.deepEqual(out, { hello: "world" });
        assert.equal(provider.callsUsed(), 1);
        assert.match(calls[0].url, /:generateContent/);
        assert.ok(!calls[0].url.includes("test-key"));
        assert.equal(calls[0].headers["x-goog-api-key"], "test-key");
        assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
        assert.equal(calls[0].body.generationConfig.maxOutputTokens, 1_024);
        assert.equal(calls[0].body.contents[0].parts[0].text, "prompt text");
    });
    (0, node_test_1.it)("returns exact raw model JSON while keeping generateJson compatible", async () => {
        const raw = ' \n{ "hello": "world", "items": [1, 2] }\n ';
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "k",
            fetchImpl: (async () => geminiRawResponse(raw)),
        });
        assert.equal(await provider.generateRawJson("raw prompt"), raw);
        assert.deepEqual(await provider.generateJson("parsed prompt"), {
            hello: "world",
            items: [1, 2],
        });
        assert.equal(provider.callsUsed(), 2);
    });
    (0, node_test_1.it)("passes an AbortSignal to fetch and observes cancellation", async () => {
        let observedAbort = false;
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "k",
            fetchImpl: ((_url, init) => new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => {
                    observedAbort = true;
                    const error = new Error("aborted");
                    error.name = "AbortError";
                    reject(error);
                }, { once: true });
            })),
        });
        const controller = new AbortController();
        const pending = provider.generateRawJson("p", { signal: controller.signal });
        controller.abort();
        await assert.rejects(pending, { name: "AbortError" });
        assert.equal(observedAbort, true);
    });
    (0, node_test_1.it)("throws typed sanitized HTTP errors without response or key material", async () => {
        for (const status of [401, 403, 429, 500]) {
            const provider = new llm_js_1.GeminiTextProvider({
                apiKey: "secret-test-key",
                fetchImpl: (async () => ({
                    ok: false,
                    status,
                    text: async () => "private upstream response detail",
                })),
            });
            await assert.rejects(() => provider.generateRawJson("p"), (error) => {
                assert.ok(error instanceof llm_js_1.GeminiTextProviderHttpError);
                assert.equal(error.status, status);
                assert.ok(!error.message.includes("private upstream response detail"));
                assert.ok(!error.message.includes("secret-test-key"));
                return true;
            });
        }
    });
    (0, node_test_1.it)("cancels a non-OK response body before throwing its typed status", async () => {
        let canceled = false;
        const body = new ReadableStream({
            cancel: () => { canceled = true; },
        });
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "secret-test-key",
            fetchImpl: (async () => ({
                ok: false,
                status: 429,
                body,
            })),
        });
        await assert.rejects(() => provider.generateRawJson("p"), (error) => (error instanceof llm_js_1.GeminiTextProviderHttpError
            && error.status === 429));
        assert.equal(canceled, true);
    });
    (0, node_test_1.it)("rejects and cancels an oversized streamed response wrapper", async () => {
        let canceled = false;
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(80));
                controller.enqueue(new Uint8Array(80));
            },
            cancel: () => { canceled = true; },
        });
        const options = {
            apiKey: "secret-test-key",
            maxResponseBytes: 100,
            fetchImpl: (async () => ({
                ok: true,
                status: 200,
                body,
                json: async () => ({
                    candidates: [{ content: { parts: [{ text: "{}" }] } }],
                }),
            })),
        };
        const provider = new llm_js_1.GeminiTextProvider(options);
        await assert.rejects(() => provider.generateRawJson("p"), /response exceeded bounded byte limit/);
        assert.equal(canceled, true);
    });
    (0, node_test_1.it)("sanitizes malformed successful wrapper JSON without exposing its content", async () => {
        const secret = "secret-wrapper-fragment";
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "secret-test-key",
            fetchImpl: (async () => new Response(`{"candidate":"${secret}" trailing-private-bytes`, { status: 200 })),
        });
        await assert.rejects(() => provider.generateRawJson("p"), (error) => {
            assert.ok(error instanceof Error);
            assert.equal(error.name, "GeminiTextProviderResponseError");
            assert.equal(error.message, "Gemini text response wrapper was invalid");
            assert.ok(!error.message.includes(secret));
            assert.ok(!error.message.includes("trailing-private-bytes"));
            return true;
        });
    });
    (0, node_test_1.it)("throws when the model output is not JSON", async () => {
        const provider = new llm_js_1.GeminiTextProvider({
            apiKey: "k",
            fetchImpl: (async () => geminiRawResponse("not json")),
        });
        await assert.rejects(() => provider.generateJson("p"), /did not return valid JSON/);
    });
    (0, node_test_1.it)("throws at construction when no api key is available", () => {
        const savedGemini = process.env.GEMINI_API_KEY;
        const savedGoogle = process.env.GOOGLE_API_KEY;
        const savedConfigFile = process.env.DAOBREW_CONFIG_FILE;
        delete process.env.GEMINI_API_KEY;
        delete process.env.GOOGLE_API_KEY;
        // Point at a nonexistent config so a real ~/.daobrew/config.json with a
        // gemini_api_key cannot flip this test on developer machines.
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
        try {
            assert.throws(() => new llm_js_1.GeminiTextProvider({}), /GEMINI_API_KEY/);
        }
        finally {
            if (savedGemini !== undefined)
                process.env.GEMINI_API_KEY = savedGemini;
            if (savedGoogle !== undefined)
                process.env.GOOGLE_API_KEY = savedGoogle;
            if (savedConfigFile !== undefined)
                process.env.DAOBREW_CONFIG_FILE = savedConfigFile;
            else
                delete process.env.DAOBREW_CONFIG_FILE;
        }
    });
});
(0, node_test_1.describe)("Gemini providers fall back to local config", () => {
    const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY"];
    let savedEnv;
    let workDir;
    (0, node_test_1.beforeEach)(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        workDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-gemini-fallback-"));
    });
    (0, node_test_1.afterEach)(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] !== undefined)
                process.env[key] = savedEnv[key];
            else
                delete process.env[key];
        }
        (0, node_fs_1.rmSync)(workDir, { recursive: true, force: true });
    });
    function writeConfig(obj) {
        const configFile = (0, node_path_1.join)(workDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify(obj));
        process.env.DAOBREW_CONFIG_FILE = configFile;
    }
    (0, node_test_1.it)("GeminiTextProvider falls back to gemini_api_key in config.json", async () => {
        writeConfig({ gemini_api_key: "gm_cfg" });
        const calls = [];
        const provider = new llm_js_1.GeminiTextProvider({
            fetchImpl: (async (url, init) => {
                calls.push({ url: String(url), headers: init.headers });
                return geminiResponse({ ok: true });
            }),
        });
        await provider.generateJson("p");
        assert.ok(!calls[0].url.includes("gm_cfg"));
        assert.equal(calls[0].headers["x-goog-api-key"], "gm_cfg");
    });
    (0, node_test_1.it)("GeminiEmbeddingProvider falls back to gemini_api_key in config.json", async () => {
        writeConfig({ gemini_api_key: "gm_cfg" });
        const headers = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            fetchImpl: (async (_url, init) => {
                headers.push(init.headers);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ embedding: { values: new Array(768).fill(1) } }),
                };
            }),
        });
        await provider.embed(["t"]);
        assert.equal(headers[0]["x-goog-api-key"], "gm_cfg");
    });
    (0, node_test_1.it)("env GEMINI_API_KEY still wins over the config file", async () => {
        writeConfig({ gemini_api_key: "gm_cfg" });
        process.env.GEMINI_API_KEY = "gm_env";
        const headers = [];
        const provider = new llm_js_1.GeminiTextProvider({
            fetchImpl: (async (_url, init) => {
                headers.push(init.headers);
                return geminiResponse({ ok: true });
            }),
        });
        await provider.generateJson("p");
        assert.equal(headers[0]["x-goog-api-key"], "gm_env");
    });
    (0, node_test_1.it)("GeminiEmbeddingProvider still throws when no key exists anywhere", () => {
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
        assert.throws(() => new gemini_js_1.GeminiEmbeddingProvider(), /GEMINI_API_KEY/);
    });
});
(0, node_test_1.describe)("local config reader", () => {
    const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GRANOLA_API_TOKEN"];
    let savedEnv;
    let workDir;
    (0, node_test_1.beforeEach)(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        workDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-local-config-"));
    });
    (0, node_test_1.afterEach)(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] !== undefined)
                process.env[key] = savedEnv[key];
            else
                delete process.env[key];
        }
        (0, node_fs_1.rmSync)(workDir, { recursive: true, force: true });
    });
    (0, node_test_1.it)("reads gemini_api_key and granola_api_token from the file named by DAOBREW_CONFIG_FILE", () => {
        const configFile = (0, node_path_1.join)(workDir, "config.json");
        (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
            gemini_api_key: "gm_from_config",
            granola_api_token: "gr_from_config",
        }));
        process.env.DAOBREW_CONFIG_FILE = configFile;
        const config = (0, local_config_js_1.readLocalConfig)();
        assert.equal(config.gemini_api_key, "gm_from_config");
        assert.equal(config.granola_api_token, "gr_from_config");
        assert.equal((0, local_config_js_1.resolveGeminiApiKey)(), "gm_from_config");
        assert.equal((0, local_config_js_1.resolveGranolaToken)(), "gr_from_config");
    });
    (0, node_test_1.it)("prefers env vars over the config file", () => {
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(workDir, "does-not-exist.json");
        process.env.GEMINI_API_KEY = "gm_env";
        assert.equal((0, local_config_js_1.resolveGeminiApiKey)(), "gm_env");
    });
    (0, node_test_1.it)("never throws: missing config resolves to null/{} and malformed JSON reads as {}", () => {
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(workDir, "does-not-exist.json");
        assert.equal((0, local_config_js_1.resolveGeminiApiKey)(), null);
        assert.equal((0, local_config_js_1.resolveGranolaToken)(), null);
        assert.deepEqual((0, local_config_js_1.readLocalConfig)(), {});
        const malformedFile = (0, node_path_1.join)(workDir, "malformed.json");
        (0, node_fs_1.writeFileSync)(malformedFile, "{ not valid json !!");
        process.env.DAOBREW_CONFIG_FILE = malformedFile;
        assert.deepEqual((0, local_config_js_1.readLocalConfig)(), {});
    });
});
