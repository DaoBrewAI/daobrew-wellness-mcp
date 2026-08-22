"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteGeminiEmbeddingProvider = exports.RemoteGeminiEmbeddingError = void 0;
const identity_js_1 = require("../../identity.js");
const local_config_js_1 = require("../local-config.js");
const mention_extraction_js_1 = require("../taskmap/mention-extraction.js");
const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 64;
const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 60_000;
const REQUEST_GROUP_ID = /^[A-Za-z0-9_-]{16,96}$/;
class RemoteGeminiEmbeddingError extends Error {
    code;
    constructor(code) {
        super(`Remote Gemini embeddings unavailable: ${code}`);
        this.code = code;
        this.name = "RemoteGeminiEmbeddingError";
    }
}
exports.RemoteGeminiEmbeddingError = RemoteGeminiEmbeddingError;
function l2Normalize(values) {
    let sumSquares = 0;
    for (const value of values)
        sumSquares += value * value;
    const norm = Math.sqrt(sumSquares);
    if (!Number.isFinite(norm) || norm === 0) {
        throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    return values.map((value) => value / norm);
}
function responseError(status) {
    if (status === 401 || status === 403) {
        return new RemoteGeminiEmbeddingError("provider_unauthenticated");
    }
    if (status === 429) {
        return new RemoteGeminiEmbeddingError("provider_rate_limited");
    }
    return new RemoteGeminiEmbeddingError("provider_unavailable");
}
function parseVectors(responseText, expectedCount) {
    let payload;
    try {
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(responseText);
        payload = JSON.parse(responseText);
    }
    catch {
        throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
        throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    const data = payload.data;
    if (payload.status !== "success"
        || data === null
        || Array.isArray(data)
        || typeof data !== "object") {
        throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    const vectors = data.vectors;
    if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
        throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    return vectors.map((candidate) => {
        if (!Array.isArray(candidate)
            || candidate.length !== EMBEDDING_DIMENSIONS
            || candidate.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
            throw new RemoteGeminiEmbeddingError("malformed_response");
        }
        return l2Normalize(candidate);
    });
}
class RemoteGeminiEmbeddingProvider {
    credentialPlan;
    fetchImpl;
    timeoutMs;
    requestGroupId;
    constructor(options = {}) {
        const plan = options.credentialPlan
            ?? (0, identity_js_1.resolveCredentialBoundClient)((0, local_config_js_1.readLocalConfig)());
        if (!plan.ok) {
            throw new RemoteGeminiEmbeddingError("provider_unauthenticated");
        }
        this.credentialPlan = plan;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.timeoutMs = options.timeoutMs !== undefined
            && Number.isFinite(options.timeoutMs)
            && options.timeoutMs > 0
            ? options.timeoutMs
            : DEFAULT_TIMEOUT_MS;
        if (options.requestGroupId !== undefined
            && !REQUEST_GROUP_ID.test(options.requestGroupId)) {
            throw new RemoteGeminiEmbeddingError("malformed_response");
        }
        this.requestGroupId = options.requestGroupId;
    }
    async embed(texts) {
        if (texts.length === 0)
            return [];
        const vectors = [];
        for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
            const batch = texts.slice(start, start + MAX_BATCH_SIZE);
            vectors.push(...await this.embedBatch(batch));
        }
        return vectors;
    }
    async embedBatch(texts) {
        const abortController = new AbortController();
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                abortController.abort();
                reject(new RemoteGeminiEmbeddingError("timeout"));
            }, this.timeoutMs);
        });
        timer?.unref();
        let responseText;
        try {
            responseText = await Promise.race([
                (async () => {
                    const response = await this.fetchImpl((0, identity_js_1.credentialBoundApiEndpoint)(this.credentialPlan.apiUrl, "/api/v1/device/llm/gemini/embed"), {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.credentialPlan.deviceCredential}`,
                        },
                        body: JSON.stringify({
                            texts,
                            output_dimensionality: EMBEDDING_DIMENSIONS,
                            ...(this.requestGroupId === undefined
                                ? {}
                                : { request_group_id: this.requestGroupId }),
                        }),
                        signal: abortController.signal,
                    });
                    if (!response.ok)
                        throw responseError(response.status);
                    const declaredLength = Number(response.headers.get("Content-Length"));
                    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
                        throw new RemoteGeminiEmbeddingError("malformed_response");
                    }
                    return response.text();
                })(),
                timeout,
            ]);
        }
        catch (error) {
            if (error instanceof RemoteGeminiEmbeddingError)
                throw error;
            if (abortController.signal.aborted) {
                throw new RemoteGeminiEmbeddingError("timeout");
            }
            throw new RemoteGeminiEmbeddingError("provider_unavailable");
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
        }
        if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) {
            throw new RemoteGeminiEmbeddingError("malformed_response");
        }
        return parseVectors(responseText, texts.length);
    }
}
exports.RemoteGeminiEmbeddingProvider = RemoteGeminiEmbeddingProvider;
