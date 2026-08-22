"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiTextProvider = exports.GeminiTextProviderResponseError = exports.GeminiTextProviderHttpError = exports.GEMINI_TEXT_MAX_RESPONSE_BYTES = exports.GEMINI_TEXT_MAX_OUTPUT_TOKENS = exports.GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS = void 0;
const local_config_js_1 = require("../local-config.js");
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
exports.GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
exports.GEMINI_TEXT_MAX_OUTPUT_TOKENS = 16_384;
exports.GEMINI_TEXT_MAX_RESPONSE_BYTES = 1_048_576;
class GeminiTextProviderHttpError extends Error {
    status;
    constructor(status) {
        super(`Gemini text request failed (${status})`);
        this.status = status;
        this.name = "GeminiTextProviderHttpError";
    }
}
exports.GeminiTextProviderHttpError = GeminiTextProviderHttpError;
class GeminiTextProviderResponseError extends Error {
    constructor() {
        super("Gemini text response wrapper was invalid");
        this.name = "GeminiTextProviderResponseError";
    }
}
exports.GeminiTextProviderResponseError = GeminiTextProviderResponseError;
class GeminiTextProviderResponseTooLargeError extends Error {
    constructor() {
        super("Gemini text response exceeded bounded byte limit");
        this.name = "GeminiTextProviderResponseTooLargeError";
    }
}
async function cancelResponseBody(response) {
    if (response.body === null || response.body === undefined)
        return;
    try {
        await response.body.cancel();
    }
    catch {
        // Cancellation is best-effort after the response has already failed.
    }
}
async function readBoundedResponseText(response, maxResponseBytes) {
    if (response.body === null || response.body === undefined)
        return "";
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const result = await reader.read();
            if (result.done)
                break;
            const chunk = result.value;
            if (totalBytes + chunk.byteLength > maxResponseBytes) {
                try {
                    await reader.cancel();
                }
                catch {
                    // The bounded failure below remains authoritative.
                }
                throw new GeminiTextProviderResponseTooLargeError();
            }
            chunks.push(chunk);
            totalBytes += chunk.byteLength;
        }
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch {
            // The reader may already have released during cancellation.
        }
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
class GeminiTextProvider {
    #apiKey;
    #model;
    #maxOutputTokens;
    #maxResponseBytes;
    #temperature;
    #fetchImpl;
    #calls = 0;
    constructor(options = {}) {
        const key = options.apiKey ?? (0, local_config_js_1.resolveGeminiApiKey)() ?? undefined;
        if (!key)
            throw new Error("Gemini text generation requires GEMINI_API_KEY / GOOGLE_API_KEY or gemini_api_key in ~/.daobrew/config.json");
        const maxOutputTokens = options.maxOutputTokens
            ?? exports.GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS;
        if (!Number.isSafeInteger(maxOutputTokens)
            || maxOutputTokens <= 0
            || maxOutputTokens > exports.GEMINI_TEXT_MAX_OUTPUT_TOKENS) {
            throw new RangeError(`Gemini maxOutputTokens must be between 1 and ${exports.GEMINI_TEXT_MAX_OUTPUT_TOKENS}`);
        }
        const maxResponseBytes = options.maxResponseBytes
            ?? exports.GEMINI_TEXT_MAX_RESPONSE_BYTES;
        if (!Number.isSafeInteger(maxResponseBytes)
            || maxResponseBytes <= 0
            || maxResponseBytes > exports.GEMINI_TEXT_MAX_RESPONSE_BYTES) {
            throw new RangeError(`Gemini maxResponseBytes must be between 1 and ${exports.GEMINI_TEXT_MAX_RESPONSE_BYTES}`);
        }
        this.#apiKey = key;
        this.#model = options.model ?? process.env.DAOBREW_SNAPSHOT_MODEL ?? DEFAULT_MODEL;
        this.#maxOutputTokens = maxOutputTokens;
        this.#maxResponseBytes = maxResponseBytes;
        this.#temperature = options.temperature ?? 0.2;
        this.#fetchImpl = options.fetchImpl ?? fetch;
    }
    callsUsed() {
        return this.#calls;
    }
    async generateRawJson(prompt, options = {}) {
        const url = `${GEMINI_ENDPOINT}/${this.#model}:generateContent`;
        this.#calls += 1;
        const response = await this.#fetchImpl(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": this.#apiKey,
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: this.#temperature,
                    maxOutputTokens: this.#maxOutputTokens,
                },
            }),
            signal: options.signal,
        });
        if (!response.ok) {
            await cancelResponseBody(response);
            throw new GeminiTextProviderHttpError(response.status);
        }
        const responseText = await readBoundedResponseText(response, this.#maxResponseBytes);
        let payload;
        try {
            payload = JSON.parse(responseText);
        }
        catch {
            throw new GeminiTextProviderResponseError();
        }
        return payload.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? "")
            .join("") ?? "";
    }
    async generateJson(prompt) {
        const text = await this.generateRawJson(prompt);
        try {
            return JSON.parse(text);
        }
        catch {
            throw new Error("Gemini did not return valid JSON");
        }
    }
}
exports.GeminiTextProvider = GeminiTextProvider;
