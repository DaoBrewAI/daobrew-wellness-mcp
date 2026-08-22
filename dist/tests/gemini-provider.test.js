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
const gemini_js_1 = require("../src/engine/embeddings/gemini.js");
function stubFetch(calls, values) {
    return (async (url, init) => {
        const index = calls.length;
        calls.push({ url: String(url), body: JSON.parse(init.body) });
        return {
            ok: true,
            status: 200,
            json: async () => ({ embedding: { values: values(index) } }),
        };
    });
}
function norm(vector) {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}
(0, node_test_1.describe)("GeminiEmbeddingProvider (gemini-embedding-001 embedContent)", () => {
    (0, node_test_1.it)("defaults to gemini-embedding-001 and posts to :embedContent", async () => {
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0.5)),
        });
        await provider.embed(["hello"]);
        assert.equal(calls.length, 1);
        assert.match(calls[0].url, /\/gemini-embedding-001:embedContent$/);
    });
    (0, node_test_1.it)("respects DAOBREW_EMBED_MODEL when options.model is not given", async (t) => {
        const saved = process.env.DAOBREW_EMBED_MODEL;
        process.env.DAOBREW_EMBED_MODEL = "custom-model";
        t.after(() => {
            if (saved !== undefined)
                process.env.DAOBREW_EMBED_MODEL = saved;
            else
                delete process.env.DAOBREW_EMBED_MODEL;
        });
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0.5)),
        });
        await provider.embed(["hello"]);
        assert.match(calls[0].url, /\/custom-model:embedContent$/);
    });
    (0, node_test_1.it)("falls back to the default model when DAOBREW_EMBED_MODEL is empty or whitespace", async (t) => {
        const saved = process.env.DAOBREW_EMBED_MODEL;
        process.env.DAOBREW_EMBED_MODEL = "   ";
        t.after(() => {
            if (saved !== undefined)
                process.env.DAOBREW_EMBED_MODEL = saved;
            else
                delete process.env.DAOBREW_EMBED_MODEL;
        });
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0.5)),
        });
        await provider.embed(["hello"]);
        assert.match(calls[0].url, /\/gemini-embedding-001:embedContent$/);
    });
    (0, node_test_1.it)("options.model wins over DAOBREW_EMBED_MODEL", async (t) => {
        const saved = process.env.DAOBREW_EMBED_MODEL;
        process.env.DAOBREW_EMBED_MODEL = "env-model";
        t.after(() => {
            if (saved !== undefined)
                process.env.DAOBREW_EMBED_MODEL = saved;
            else
                delete process.env.DAOBREW_EMBED_MODEL;
        });
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            model: "explicit-model",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0.5)),
        });
        await provider.embed(["hello"]);
        assert.match(calls[0].url, /\/explicit-model:embedContent$/);
    });
    (0, node_test_1.it)("sends outputDimensionality 768 and the text in content.parts", async () => {
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0.5)),
        });
        await provider.embed(["the text to embed"]);
        assert.equal(calls[0].body.outputDimensionality, 768);
        assert.equal(calls[0].body.content.parts[0].text, "the text to embed");
    });
    (0, node_test_1.it)("L2-normalizes non-normalized responses to unit norm", async () => {
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(2)),
        });
        const [vector] = await provider.embed(["hello"]);
        assert.equal(vector.length, 768);
        assert.ok(Math.abs(norm(vector) - 1) < 1e-6, `expected unit norm, got ${norm(vector)}`);
        // All components equal in, all components equal out (direction preserved).
        assert.ok(vector.every((v) => Math.abs(v - vector[0]) < 1e-12));
    });
    (0, node_test_1.it)("makes one fetch call per text and preserves input order", async () => {
        const calls = [];
        // Distinct direction per call: basis vector e_i scaled arbitrarily.
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, (i) => {
                const values = new Array(768).fill(0);
                values[i] = 3 + i;
                return values;
            }),
        });
        const vectors = await provider.embed(["first", "second", "third"]);
        assert.equal(calls.length, 3);
        assert.deepEqual(calls.map((c) => c.body.content.parts[0].text), ["first", "second", "third"]);
        assert.equal(vectors.length, 3);
        // vectors[i] must be the normalized e_i (component i is 1, rest 0).
        for (let i = 0; i < 3; i++) {
            assert.ok(Math.abs(vectors[i][i] - 1) < 1e-6, `vector ${i} not aligned with call ${i}`);
        }
    });
    (0, node_test_1.it)("rejects the whole embed() on a mid-sequence failure with no partial result", async () => {
        const calls = [];
        const fetchImpl = (async (url, init) => {
            const index = calls.length;
            calls.push({ url: String(url), body: JSON.parse(init.body) });
            if (index === 1) {
                return { ok: false, status: 500, text: async () => "boom" };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({ embedding: { values: new Array(768).fill(0.5) } }),
            };
        });
        const provider = new gemini_js_1.GeminiEmbeddingProvider({ apiKey: "test-key", fetchImpl });
        // All-or-nothing: the sweep relies on embed() never resolving with a
        // partial vector list, so source rows stay NULL and are retried.
        await assert.rejects(() => provider.embed(["first", "second", "third"]), /Gemini embedding request failed \(500\): boom/);
        // Failed on text 2 of 3: the third request must never have been made.
        assert.equal(calls.length, 2);
    });
    (0, node_test_1.it)("throws when the response is not 768-dimensional", async () => {
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(3072).fill(0.1)),
        });
        await assert.rejects(() => provider.embed(["hello"]), /3072 dimensions, expected 768/);
    });
    (0, node_test_1.it)("throws fail-closed on a zero-norm vector", async () => {
        const calls = [];
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: stubFetch(calls, () => new Array(768).fill(0)),
        });
        await assert.rejects(() => provider.embed(["hello"]), /zero norm/i);
    });
    (0, node_test_1.it)("keeps the error style on http failures", async () => {
        const provider = new gemini_js_1.GeminiEmbeddingProvider({
            apiKey: "test-key",
            fetchImpl: (async () => ({
                ok: false,
                status: 429,
                text: async () => "quota exceeded",
            })),
        });
        await assert.rejects(() => provider.embed(["hello"]), /Gemini embedding request failed \(429\): quota exceeded/);
    });
});
