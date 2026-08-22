"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiRemoteLlmStation = void 0;
exports.resolveTaskMapRemoteLlmPlan = resolveTaskMapRemoteLlmPlan;
const identity_js_1 = require("../../identity.js");
const local_config_js_1 = require("../local-config.js");
const llm_station_js_1 = require("./llm-station.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
const INPUT_DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_GROUP_ID = /^[A-Za-z0-9_-]{16,96}$/;
const REMOTE_PROVIDER_ARGS = Object.freeze([]);
/** Resolve the consent and bearer/url pair from one consistent config read. */
function resolveTaskMapRemoteLlmPlan(overrides = {}) {
    const config = (0, local_config_js_1.readLocalConfig)();
    return {
        consent: overrides.remoteConsent ?? (0, local_config_js_1.resolveRemoteLlmConsent)(config),
        credentialPlan: overrides.remoteCredentialPlan
            ?? (0, identity_js_1.resolveCredentialBoundClient)(config),
    };
}
function validModel(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= 256
        && !/[\u0000-\u001f\u007f]/.test(value);
}
function responseReason(status) {
    if (status === 401 || status === 403) {
        return new llm_station_js_1.LlmStationUnavailableError("provider_unauthenticated", "gemini-remote");
    }
    if (status === 429) {
        return new llm_station_js_1.LlmStationUnavailableError("provider_rate_limited", "gemini-remote");
    }
    return new llm_station_js_1.LlmStationUnavailableError("runner_failure", "gemini-remote");
}
class GeminiRemoteLlmStation {
    options;
    model = "gemini-remote";
    fetchImpl;
    constructor(options) {
        this.options = options;
        if (options.requestGroupId !== undefined
            && !REQUEST_GROUP_ID.test(options.requestGroupId)) {
            throw new llm_station_js_1.LlmStationUnavailableError("runner_failure", "gemini-remote");
        }
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    get provider() {
        return Object.freeze({
            transport: "gemini-remote",
            executable: "",
            args: REMOTE_PROVIDER_ARGS,
            model: this.model,
        });
    }
    async run(request) {
        if (!(0, llm_station_js_1.isValidLlmStationId)(request.stationId)) {
            throw new llm_station_js_1.LlmStationUnavailableError("invalid_station", "gemini-remote");
        }
        if (!INPUT_DIGEST.test(request.inputDigest)) {
            throw new llm_station_js_1.LlmStationUnavailableError("invalid_input_digest", "gemini-remote");
        }
        const abortController = new AbortController();
        const abortFromCaller = () => abortController.abort(request.signal?.reason);
        request.signal?.addEventListener("abort", abortFromCaller, { once: true });
        if (request.signal?.aborted)
            abortFromCaller();
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                abortController.abort();
                reject(new llm_station_js_1.LlmStationUnavailableError("timeout", "gemini-remote"));
            }, this.options.timeoutMs);
        });
        timer?.unref();
        let response;
        let responseText;
        try {
            [response, responseText] = await Promise.race([
                (async () => {
                    const fetched = await this.fetchImpl((0, identity_js_1.credentialBoundApiEndpoint)(this.options.credentialPlan.apiUrl, "/api/v1/device/llm/gemini/generate"), {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.options.credentialPlan.deviceCredential}`,
                        },
                        body: JSON.stringify({
                            station_id: request.stationId,
                            prompt_text: request.promptText,
                            ...(this.options.requestGroupId === undefined
                                ? {}
                                : { request_group_id: this.options.requestGroupId }),
                        }),
                        signal: abortController.signal,
                    });
                    if (!fetched.ok)
                        throw responseReason(fetched.status);
                    const declaredLength = Number(fetched.headers.get("Content-Length"));
                    if (Number.isFinite(declaredLength)
                        && declaredLength > llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES) {
                        throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
                    }
                    return [fetched, await fetched.text()];
                })(),
                timeout,
            ]);
        }
        catch (error) {
            if (error instanceof llm_station_js_1.LlmStationUnavailableError)
                throw error;
            if (abortController.signal.aborted) {
                throw new llm_station_js_1.LlmStationUnavailableError("timeout", "gemini-remote");
            }
            throw new llm_station_js_1.LlmStationUnavailableError("runner_failure", "gemini-remote");
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            request.signal?.removeEventListener("abort", abortFromCaller);
        }
        void response;
        if (Buffer.byteLength(responseText, "utf8") > llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES) {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        let wrapper;
        try {
            (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(responseText);
            wrapper = JSON.parse(responseText);
        }
        catch {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        if (wrapper === null || Array.isArray(wrapper) || typeof wrapper !== "object") {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        const record = wrapper;
        const data = record.data;
        if (record.status !== "success"
            || data === null
            || Array.isArray(data)
            || typeof data !== "object") {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        const dataRecord = data;
        if (typeof dataRecord.output_json !== "string"
            || !validModel(dataRecord.model)) {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        const outputJson = (0, llm_station_js_1.stripTaskMapModelOutputFences)(dataRecord.output_json);
        if (Buffer.byteLength(outputJson, "utf8") > llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES) {
            throw new llm_station_js_1.LlmStationUnavailableError("malformed_wrapper", "gemini-remote");
        }
        if (outputJson.trim().length === 0) {
            throw new llm_station_js_1.LlmStationUnavailableError("empty_final_output", "gemini-remote");
        }
        this.model = dataRecord.model;
        return Object.freeze({
            stationId: request.stationId,
            model: dataRecord.model,
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
            inputDigest: request.inputDigest,
            outputJson,
            producedAt: (0, llm_station_js_1.strictLlmProducedAt)(this.options.clock),
            transport: "gemini-remote",
        });
    }
}
exports.GeminiRemoteLlmStation = GeminiRemoteLlmStation;
