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
const gemini_remote_js_1 = require("../src/engine/embeddings/gemini-remote.js");
const CREDENTIAL = "dbd_fixture_remote_embedding_credential_1234567890";
const ENROLLMENT = {
    ok: true,
    apiUrl: "https://api.daobrew.example/api/v1",
    deviceCredential: CREDENTIAL,
};
function vector(first, second = 0) {
    return [first, second, ...new Array(766).fill(0)];
}
function response(vectors, status = 200) {
    return new Response(JSON.stringify({
        status: "success",
        data: { vectors, model: "gemini-fixture" },
    }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
(0, node_test_1.describe)("RemoteGeminiEmbeddingProvider", () => {
    (0, node_test_1.it)("posts one authenticated batch and L2-normalizes exact 768-dimensional vectors", async () => {
        const calls = [];
        const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
            credentialPlan: ENROLLMENT,
            fetchImpl: (async (url, init) => {
                calls.push({ url: String(url), init });
                return response([vector(3, 4), vector(0, 7)]);
            }),
        });
        const result = await provider.embed(["first", "second"]);
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.url, "https://api.daobrew.example/api/v1/device/llm/gemini/embed");
        assert.equal(calls[0]?.init?.method, "POST");
        assert.equal((calls[0]?.init?.headers).Authorization, `Bearer ${CREDENTIAL}`);
        assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
            texts: ["first", "second"],
            output_dimensionality: 768,
        });
        assert.equal(result.length, 2);
        assert.ok(Math.abs(result[0][0] - 0.6) < 1e-12);
        assert.ok(Math.abs(result[0][1] - 0.8) < 1e-12);
        assert.equal(result[1][1], 1);
    });
    (0, node_test_1.it)("splits at 64 texts and preserves input/vector order", async () => {
        const bodies = [];
        const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
            credentialPlan: ENROLLMENT,
            requestGroupId: "refresh_0123456789abcdef",
            fetchImpl: (async (_url, init) => {
                const body = JSON.parse(String(init?.body));
                bodies.push(body);
                return response(body.texts.map((_text, index) => vector(index + 1)));
            }),
        });
        const result = await provider.embed(Array.from({ length: 65 }, (_, index) => `text-${index}`));
        assert.deepEqual(bodies.map((body) => body.texts.length), [64, 1]);
        assert.deepEqual(bodies.map((body) => body.request_group_id), ["refresh_0123456789abcdef", "refresh_0123456789abcdef"]);
        assert.equal(result.length, 65);
        assert.ok(result.every((entry) => entry[0] === 1));
    });
    (0, node_test_1.it)("throws a typed malformed-response error on dimension mismatch", async () => {
        const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
            credentialPlan: ENROLLMENT,
            fetchImpl: (async () => response([new Array(767).fill(1)])),
        });
        await assert.rejects(() => provider.embed(["first"]), (error) => error instanceof gemini_remote_js_1.RemoteGeminiEmbeddingError
            && error.code === "malformed_response");
    });
    for (const [status, code] of [
        [429, "provider_rate_limited"],
        [503, "provider_unavailable"],
    ]) {
        (0, node_test_1.it)(`maps HTTP ${status} without leaking the bearer`, async () => {
            const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
                credentialPlan: ENROLLMENT,
                fetchImpl: (async () => new Response(`private upstream failure ${CREDENTIAL}`, { status })),
            });
            let caught;
            try {
                await provider.embed(["first"]);
            }
            catch (error) {
                caught = error;
            }
            assert.ok(caught instanceof gemini_remote_js_1.RemoteGeminiEmbeddingError);
            assert.equal(caught.code, code);
            assert.ok(!caught.message.includes(CREDENTIAL));
        });
    }
    (0, node_test_1.it)("returns an empty result without resolving or calling the network", async () => {
        let calls = 0;
        const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
            credentialPlan: ENROLLMENT,
            fetchImpl: (async () => {
                calls += 1;
                throw new Error("must not be reached");
            }),
        });
        assert.deepEqual(await provider.embed([]), []);
        assert.equal(calls, 0);
    });
    (0, node_test_1.it)("fails closed on a zero-norm vector", async () => {
        const provider = new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
            credentialPlan: ENROLLMENT,
            fetchImpl: (async () => response([new Array(768).fill(0)])),
        });
        await assert.rejects(() => provider.embed(["first"]), (error) => error instanceof gemini_remote_js_1.RemoteGeminiEmbeddingError
            && error.code === "malformed_response");
    });
});
