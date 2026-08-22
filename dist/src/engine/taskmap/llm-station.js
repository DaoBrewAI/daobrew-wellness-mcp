"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionLlmStationRunner = exports.LlmStationUnavailableError = exports.DEFAULT_LLM_PROVIDER_ORDER = exports.LLM_STATION_MAX_OUTPUT_BYTES = exports.LLM_STATION_DISCOVERY_TIMEOUT_MS = exports.LLM_STATION_TIMEOUT_MS = exports.LLM_STATION_IDS = exports.LLM_STATION_ID = void 0;
exports.isValidLlmStationId = isValidLlmStationId;
exports.detectProvider = detectProvider;
exports.strictLlmProducedAt = strictLlmProducedAt;
exports.stripTaskMapModelOutputFences = stripTaskMapModelOutputFences;
exports.createLlmStation = createLlmStation;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const source_contracts_js_1 = require("./source-contracts.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
exports.LLM_STATION_ID = "mention-extraction-v1";
exports.LLM_STATION_IDS = Object.freeze([
    "mention-extraction-v1",
    "identity-adjudication-v1",
    "task-decomposition-v1",
    "community-grouping-v1",
    "community-title-v1",
    "community-task-extraction-v1",
]);
exports.LLM_STATION_TIMEOUT_MS = 60_000;
exports.LLM_STATION_DISCOVERY_TIMEOUT_MS = 5_000;
exports.LLM_STATION_MAX_OUTPUT_BYTES = 1_048_576;
exports.DEFAULT_LLM_PROVIDER_ORDER = Object.freeze([
    "claude-cli",
    "codex-cli",
    "cursor-cli",
]);
class LlmStationUnavailableError extends Error {
    reason;
    transport;
    exitCode;
    constructor(reason, transport, exitCode) {
        super(`Task Map LLM station unavailable: ${reason}`
            + (transport === undefined ? "" : ` (${transport})`));
        this.reason = reason;
        this.transport = transport;
        this.exitCode = exitCode;
        this.name = "LlmStationUnavailableError";
    }
}
exports.LlmStationUnavailableError = LlmStationUnavailableError;
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CODEX_MODEL = "gpt-5.6-luna";
const PROVIDER_BINARY = Object.freeze({
    "claude-cli": "claude",
    "codex-cli": "codex",
    "cursor-cli": "cursor-agent",
    "gemini-remote": "",
});
const PROVIDER_ARGS = Object.freeze({
    "claude-cli": Object.freeze([
        "-p",
        "--model",
        CLAUDE_MODEL,
        "--output-format",
        "json",
        "--no-session-persistence",
        "--tools",
        "",
    ]),
    "codex-cli": Object.freeze([
        "exec",
        "--json",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--model",
        CODEX_MODEL,
        "-c",
        'model_reasoning_effort="low"',
        "--disable",
        "shell_tool",
        "--disable",
        "unified_exec",
        "--disable",
        "browser_use",
        "--disable",
        "in_app_browser",
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--disable",
        "memories",
        "--disable",
        "multi_agent",
        "-c",
        "mcp_servers={}",
        "--sandbox",
        "read-only",
        "-",
    ]),
    // Cursor has no verified headless invocation in graph-build v1.
    "cursor-cli": Object.freeze([]),
    "gemini-remote": Object.freeze([]),
});
const PROVIDER_MODEL = Object.freeze({
    "claude-cli": CLAUDE_MODEL,
    "codex-cli": CODEX_MODEL,
    "cursor-cli": "unavailable",
    "gemini-remote": "gemini-remote",
});
const PROVIDER_AUTH_ARGS = Object.freeze({
    "claude-cli": Object.freeze(["auth", "status"]),
    "codex-cli": Object.freeze(["login", "status"]),
});
const LOGIN_SHELL_EXECUTABLE = "/bin/zsh";
const LOGIN_SHELL_ARGS = Object.freeze([
    "-lc",
    "command -v claude codex",
]);
const LOGIN_SHELL_MAX_OUTPUT_BYTES = 4_096;
function isValidLlmStationId(value) {
    return typeof value === "string"
        && exports.LLM_STATION_IDS.includes(value);
}
function providerTrustedPaths(provider, ownerHome) {
    if (provider === "claude-cli") {
        return [
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            node_path_1.default.join(ownerHome, ".local", "bin", "claude"),
        ];
    }
    if (provider === "codex-cli") {
        return [
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex",
            node_path_1.default.join(ownerHome, ".local", "bin", "codex"),
            "/Applications/ChatGPT.app/Contents/Resources/codex",
        ];
    }
    return [];
}
async function defaultExecutableProbe(candidate) {
    try {
        const details = await (0, promises_1.stat)(candidate);
        if (!details.isFile())
            return false;
        await (0, promises_1.access)(candidate, node_fs_1.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function uniqueCandidates(values) {
    return [...new Set(values)];
}
function providerCandidates(provider, options) {
    const override = options.executableOverrides?.[provider];
    if (override !== undefined && !node_path_1.default.isAbsolute(override)) {
        throw new LlmStationUnavailableError("invalid_executable_override", provider);
    }
    const binary = PROVIDER_BINARY[provider];
    const pathCandidates = options.pathEnv
        .split(node_path_1.default.delimiter)
        .filter((entry) => entry.length > 0)
        .map((entry) => node_path_1.default.resolve(entry, binary));
    return uniqueCandidates([
        ...(override === undefined ? [] : [override]),
        ...pathCandidates,
        ...providerTrustedPaths(provider, options.ownerHome),
    ]);
}
async function loginShellProviderCandidates(options, isExecutable) {
    const timeoutMs = options.discoveryTimeoutMs
        ?? exports.LLM_STATION_DISCOVERY_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return new Map();
    const abortController = new AbortController();
    const abortFromCaller = () => abortController.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (options.signal?.aborted)
        abortFromCaller();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            abortController.abort();
            reject(new Error("Login-shell provider discovery timed out"));
        }, timeoutMs);
    });
    timer?.unref();
    let result;
    try {
        result = await Promise.race([
            (options.loginShellRunner ?? exports.productionLlmStationRunner)({
                executable: LOGIN_SHELL_EXECUTABLE,
                args: LOGIN_SHELL_ARGS,
                stdin: "",
                timeoutMs,
                signal: abortController.signal,
            }),
            timeout,
        ]);
    }
    catch {
        return new Map();
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortFromCaller);
    }
    if ((result.exitCode !== 0 && result.exitCode !== 1)
        || Buffer.byteLength(result.stdout, "utf8") > LOGIN_SHELL_MAX_OUTPUT_BYTES
        || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(result.stdout)) {
        return new Map();
    }
    const lines = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
    if (lines.length > 2 || lines.some((line) => line !== line.trim())) {
        return new Map();
    }
    const providers = new Map();
    for (const candidate of lines) {
        if (!node_path_1.default.isAbsolute(candidate))
            return new Map();
        const binary = node_path_1.default.basename(candidate);
        const provider = binary === PROVIDER_BINARY["claude-cli"]
            ? "claude-cli"
            : binary === PROVIDER_BINARY["codex-cli"]
                ? "codex-cli"
                : undefined;
        if (provider === undefined || providers.has(provider))
            return new Map();
        let available = false;
        try {
            available = await isExecutable(candidate);
        }
        catch {
            return new Map();
        }
        if (!available)
            return new Map();
        providers.set(provider, candidate);
    }
    return providers;
}
/** Resolve one provider deterministically. Cursor is deliberately unsupported. */
async function detectProvider(options = {}) {
    const order = options.order ?? exports.DEFAULT_LLM_PROVIDER_ORDER;
    const ownerHome = options.ownerHome ?? (0, node_os_1.homedir)();
    const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
    const isExecutable = options.isExecutable ?? defaultExecutableProbe;
    const seen = new Set();
    let loginShellProviders;
    for (const provider of order) {
        if (seen.has(provider))
            continue;
        seen.add(provider);
        // Task 0 found no Cursor headless CLI. An executable name alone is not proof
        // of a safe non-interactive invocation, so v1 never guesses one.
        if (provider === "cursor-cli" || provider === "gemini-remote")
            continue;
        const candidates = providerCandidates(provider, {
            executableOverrides: options.executableOverrides,
            ownerHome,
            pathEnv,
        });
        for (const candidate of candidates) {
            let available = false;
            try {
                available = await isExecutable(candidate);
            }
            catch {
                available = false;
            }
            if (!available)
                continue;
            return Object.freeze({
                transport: provider,
                executable: candidate,
                args: PROVIDER_ARGS[provider],
                model: PROVIDER_MODEL[provider],
            });
        }
        loginShellProviders ??= await loginShellProviderCandidates(options, isExecutable);
        const executable = loginShellProviders.get(provider);
        if (executable === undefined)
            continue;
        return Object.freeze({
            transport: provider,
            executable,
            args: PROVIDER_ARGS[provider],
            model: PROVIDER_MODEL[provider],
        });
    }
    throw new LlmStationUnavailableError("no_provider");
}
function strictLlmProducedAt(clock) {
    let instant;
    try {
        instant = clock();
    }
    catch {
        throw new LlmStationUnavailableError("invalid_clock");
    }
    if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
        throw new LlmStationUnavailableError("invalid_clock");
    }
    let producedAt;
    try {
        producedAt = instant.toISOString();
    }
    catch {
        throw new LlmStationUnavailableError("invalid_clock");
    }
    if (!STRICT_RFC3339.test(producedAt) || !Number.isFinite(Date.parse(producedAt))) {
        throw new LlmStationUnavailableError("invalid_clock");
    }
    return producedAt;
}
function unwrapClaude(stdout) {
    let wrapper;
    try {
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(stdout.trim());
        wrapper = JSON.parse(stdout.trim());
    }
    catch {
        throw new LlmStationUnavailableError("malformed_wrapper", "claude-cli");
    }
    if (wrapper === null
        || Array.isArray(wrapper)
        || typeof wrapper !== "object"
        || wrapper.type !== "result") {
        throw new LlmStationUnavailableError("malformed_wrapper", "claude-cli");
    }
    const record = wrapper;
    if (record.is_error === true
        && typeof record.result === "string"
        && /(?:usage|rate)\s*limit/i.test(record.result)) {
        throw new LlmStationUnavailableError("provider_rate_limited", "claude-cli");
    }
    if (record.is_error === true
        || (typeof record.subtype === "string" && record.subtype !== "success")) {
        throw new LlmStationUnavailableError("malformed_wrapper", "claude-cli");
    }
    const result = typeof record.result === "string" ? record.result : undefined;
    if (result === undefined) {
        throw new LlmStationUnavailableError("malformed_wrapper", "claude-cli");
    }
    return { outputJson: result };
}
function boundedModel(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= 256
        && !/[\u0000-\u001f\u007f]/.test(value)
        ? value
        : undefined;
}
function unwrapCodex(stdout) {
    const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
    let outputJson;
    let model;
    for (const line of lines) {
        let event;
        try {
            (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(line);
            event = JSON.parse(line);
        }
        catch {
            throw new LlmStationUnavailableError("malformed_wrapper", "codex-cli");
        }
        if (event === null || Array.isArray(event) || typeof event !== "object") {
            throw new LlmStationUnavailableError("malformed_wrapper", "codex-cli");
        }
        const record = event;
        model = boundedModel(record.model) ?? model;
        if (record.type !== "item.completed")
            continue;
        const item = record.item;
        if (item === null || Array.isArray(item) || typeof item !== "object")
            continue;
        const itemRecord = item;
        model = boundedModel(itemRecord.model) ?? model;
        if (itemRecord.type !== "agent_message")
            continue;
        if (typeof itemRecord.text !== "string") {
            throw new LlmStationUnavailableError("malformed_wrapper", "codex-cli");
        }
        outputJson = itemRecord.text;
    }
    return { outputJson: outputJson ?? "", ...(model === undefined ? {} : { model }) };
}
function unwrapProviderOutput(provider, stdout) {
    return provider.transport === "claude-cli"
        ? unwrapClaude(stdout)
        : unwrapCodex(stdout);
}
const MODEL_OUTPUT_FENCE = /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/i;
/**
 * Tolerantly removes exactly one outer markdown code fence (```json or bare
 * ```) that some models wrap around their final payload despite prompt
 * instructions. One pass, outermost pair only, inner content byte-preserved.
 * Everything else — interior fences, trailing prose, single-line fences —
 * passes through unchanged into the unchanged strict validation chain.
 */
function stripTaskMapModelOutputFences(outputText) {
    const match = MODEL_OUTPUT_FENCE.exec(outputText);
    return match === null ? outputText : match[1];
}
function abortError() {
    const error = new Error("LLM station runner aborted");
    error.name = "AbortError";
    return error;
}
/** Spawn without a shell; abort terminates the child and escalates if necessary. */
const productionLlmStationRunner = (request) => new Promise((resolve, reject) => {
    const isolatesProcessGroup = process.platform !== "win32";
    const child = (0, node_child_process_1.spawn)(request.executable, [...request.args], {
        stdio: ["pipe", "pipe", "pipe"],
        detached: isolatesProcessGroup,
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let forceKill;
    const finish = (error, result, preserveForceKill = false) => {
        if (settled)
            return;
        settled = true;
        request.signal.removeEventListener("abort", terminate);
        if (forceKill !== undefined && !preserveForceKill)
            clearTimeout(forceKill);
        if (error !== undefined)
            reject(error);
        else
            resolve(result);
    };
    const signalProcessTree = (signal) => {
        let groupSignaled = false;
        const pid = child.pid;
        if (isolatesProcessGroup
            && Number.isSafeInteger(pid)
            && (pid ?? 0) > 0) {
            try {
                process.kill(-pid, signal);
                groupSignaled = true;
            }
            catch {
                // ESRCH, missing permission, and platform gaps all take the safe
                // direct-child fallback below.
            }
        }
        if (groupSignaled)
            return;
        try {
            child.kill(signal);
        }
        catch {
            // The child may have closed between the bounded runner checks.
        }
    };
    const terminateWith = (error) => {
        if (settled)
            return;
        signalProcessTree("SIGTERM");
        forceKill = setTimeout(() => {
            // The direct child may already be closed while a descendant remains
            // in the isolated group, so escalation must always target the group.
            signalProcessTree("SIGKILL");
        }, 250);
        forceKill.unref();
        // The promise may reject immediately, but the independent escalation
        // timer must survive settlement until a stubborn child is terminated.
        finish(error, undefined, true);
    };
    const terminate = () => terminateWith(abortError());
    const outputLimitError = () => new Error("LLM station runner exceeded bounded output limit");
    child.stdout.on("data", (chunk) => {
        if (settled)
            return;
        stdoutBytes += chunk.length;
        if (stdoutBytes > exports.LLM_STATION_MAX_OUTPUT_BYTES) {
            terminateWith(outputLimitError());
            return;
        }
        stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
        if (settled)
            return;
        stderrBytes += chunk.length;
        if (stderrBytes > exports.LLM_STATION_MAX_OUTPUT_BYTES) {
            terminateWith(outputLimitError());
            return;
        }
        stderrChunks.push(chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
        try {
            const decoder = new TextDecoder("utf-8", { fatal: true });
            const stdout = decoder.decode(Buffer.concat(stdoutChunks));
            const stderr = new TextDecoder("utf-8", { fatal: true })
                .decode(Buffer.concat(stderrChunks));
            finish(undefined, { stdout, stderr, exitCode: code });
        }
        catch {
            finish(new Error("LLM station runner received invalid UTF-8"));
        }
    });
    child.stdin.on("error", (error) => {
        if (error.code !== "EPIPE" && error.code !== "ECONNRESET")
            finish(error);
    });
    request.signal.addEventListener("abort", terminate, { once: true });
    if (request.signal.aborted) {
        terminate();
        return;
    }
    child.stdin.end(request.stdin);
});
exports.productionLlmStationRunner = productionLlmStationRunner;
class FixedProviderLlmStation {
    provider;
    runner;
    clock;
    timeoutMs;
    constructor(provider, runner, clock, timeoutMs) {
        this.provider = provider;
        this.runner = runner;
        this.clock = clock;
        this.timeoutMs = timeoutMs;
    }
    async run(request) {
        if (!isValidLlmStationId(request.stationId)) {
            throw new LlmStationUnavailableError("invalid_station", this.provider.transport);
        }
        if (typeof request.inputDigest !== "string" || !SHA256.test(request.inputDigest)) {
            throw new LlmStationUnavailableError("invalid_input_digest", this.provider.transport);
        }
        const abortController = new AbortController();
        const abortFromCaller = () => abortController.abort(request.signal?.reason);
        request.signal?.addEventListener("abort", abortFromCaller, { once: true });
        if (request.signal?.aborted)
            abortFromCaller();
        let timer;
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(new LlmStationUnavailableError("timeout", this.provider.transport));
                abortController.abort();
            }, this.timeoutMs);
        });
        timer?.unref();
        let result;
        try {
            result = await Promise.race([
                this.runner({
                    executable: this.provider.executable,
                    args: this.provider.args,
                    stdin: request.promptText,
                    timeoutMs: this.timeoutMs,
                    signal: abortController.signal,
                }),
                timeout,
            ]);
        }
        catch (error) {
            if (error instanceof LlmStationUnavailableError)
                throw error;
            if (abortController.signal.aborted) {
                throw new LlmStationUnavailableError("timeout", this.provider.transport);
            }
            throw new LlmStationUnavailableError("runner_failure", this.provider.transport);
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            request.signal?.removeEventListener("abort", abortFromCaller);
        }
        if (result.exitCode !== 0) {
            throw new LlmStationUnavailableError("nonzero_exit", this.provider.transport, result.exitCode);
        }
        const finalOutput = unwrapProviderOutput(this.provider, result.stdout);
        const outputJson = stripTaskMapModelOutputFences(finalOutput.outputJson);
        if (outputJson.trim().length === 0) {
            throw new LlmStationUnavailableError("empty_final_output", this.provider.transport);
        }
        return Object.freeze({
            stationId: request.stationId,
            model: finalOutput.model ?? this.provider.model,
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
            inputDigest: request.inputDigest,
            outputJson,
            producedAt: strictLlmProducedAt(this.clock),
            transport: this.provider.transport,
        });
    }
}
const PREBINDING_RETRYABLE_REASONS = new Set([
    "provider_unauthenticated",
    "provider_rate_limited",
    "malformed_wrapper",
    "nonzero_exit",
    "timeout",
    "empty_final_output",
    "runner_failure",
]);
/**
 * Authentication proves account state, not that inference is currently usable.
 * Keep selection provisional through the first successful request, then pin the
 * transport for the rest of the refresh so later failures cannot silently mix
 * providers inside one station lifetime.
 */
class PrebindingLlmStation {
    candidates;
    runner;
    clock;
    timeoutMs;
    remoteStation;
    terminalError;
    currentIndex;
    currentStation;
    bound = false;
    constructor(candidates, initialIndex, runner, clock, timeoutMs, remoteStation, terminalError) {
        this.candidates = candidates;
        this.runner = runner;
        this.clock = clock;
        this.timeoutMs = timeoutMs;
        this.remoteStation = remoteStation;
        this.terminalError = terminalError;
        this.currentIndex = initialIndex;
        this.currentStation = this.fixedStation(candidates[initialIndex]);
    }
    get provider() {
        return this.currentStation.provider;
    }
    fixedStation(provider) {
        if (provider.transport === "gemini-remote") {
            if (this.remoteStation === undefined) {
                throw new LlmStationUnavailableError("provider_unauthenticated", "gemini-remote");
            }
            return this.remoteStation;
        }
        return new FixedProviderLlmStation(provider, this.runner, this.clock, this.timeoutMs);
    }
    async run(request) {
        if (request.signal?.aborted) {
            throw new LlmStationUnavailableError("timeout");
        }
        if (this.bound)
            return this.currentStation.run(request);
        let lastInferenceError;
        for (let index = this.currentIndex; index < this.candidates.length; index += 1) {
            const provider = this.candidates[index];
            if (index !== this.currentIndex) {
                try {
                    await authenticateProvider(provider, this.runner, this.timeoutMs, request.signal);
                }
                catch (error) {
                    if (error instanceof LlmStationUnavailableError
                        && error.reason === "provider_unauthenticated") {
                        continue;
                    }
                    throw error;
                }
                this.currentIndex = index;
                this.currentStation = this.fixedStation(provider);
            }
            try {
                const envelope = await this.currentStation.run(request);
                this.bound = true;
                return envelope;
            }
            catch (error) {
                if (!(error instanceof LlmStationUnavailableError)
                    || !PREBINDING_RETRYABLE_REASONS.has(error.reason)) {
                    throw error;
                }
                lastInferenceError = error;
            }
        }
        if (this.terminalError !== undefined)
            throw this.terminalError;
        if (lastInferenceError !== undefined)
            throw lastInferenceError;
        throw new LlmStationUnavailableError("provider_unauthenticated", this.provider.transport);
    }
}
async function authenticateProvider(provider, runner, timeoutMs, signal) {
    if (provider.transport === "gemini-remote")
        return;
    const args = PROVIDER_AUTH_ARGS[provider.transport];
    if (args === undefined) {
        throw new LlmStationUnavailableError("provider_unauthenticated", provider.transport);
    }
    const abortController = new AbortController();
    const abortFromCaller = () => abortController.abort(signal?.reason);
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted)
        abortFromCaller();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            abortController.abort();
            reject(new Error("Provider authentication probe timed out"));
        }, timeoutMs);
    });
    timer?.unref();
    let result;
    try {
        result = await Promise.race([
            runner({
                executable: provider.executable,
                args,
                stdin: "",
                timeoutMs,
                signal: abortController.signal,
            }),
            timeout,
        ]);
    }
    catch {
        throw new LlmStationUnavailableError("provider_unauthenticated", provider.transport);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
    }
    if (result.exitCode !== 0) {
        throw new LlmStationUnavailableError("provider_unauthenticated", provider.transport);
    }
    if (provider.transport === "claude-cli") {
        let status;
        try {
            status = JSON.parse(result.stdout);
        }
        catch {
            status = undefined;
        }
        if (status !== null
            && typeof status === "object"
            && !Array.isArray(status)
            && status.loggedIn === false) {
            throw new LlmStationUnavailableError("provider_unauthenticated", provider.transport);
        }
    }
    if (provider.transport === "codex-cli"
        && /\bnot logged in\b/i.test(result.stdout)) {
        throw new LlmStationUnavailableError("provider_unauthenticated", provider.transport);
    }
}
/**
 * Select the first authenticated provider, but keep that choice provisional
 * until its first inference succeeds. A refresh that wants to re-detect after
 * the station is bound creates a new station explicitly.
 */
async function createLlmStation(options = {}) {
    const assertNotAborted = () => {
        if (options.signal?.aborted) {
            throw new LlmStationUnavailableError("timeout");
        }
    };
    assertNotAborted();
    const timeoutMs = options.timeoutMs ?? exports.LLM_STATION_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new RangeError("LLM station timeoutMs must be positive");
    }
    const runner = options.runner ?? exports.productionLlmStationRunner;
    const clock = options.clock ?? (() => new Date());
    const order = options.order ?? exports.DEFAULT_LLM_PROVIDER_ORDER;
    const seen = new Set();
    const candidates = [];
    let lastAuthenticationError;
    let remoteStation;
    let terminalError;
    // Executable discovery is not provider readiness. Collect the deterministic
    // local candidates first so the provisional station can recover from either
    // an auth failure or a first-inference availability failure.
    for (const transport of order) {
        assertNotAborted();
        if (seen.has(transport))
            continue;
        seen.add(transport);
        let provider;
        try {
            provider = await detectProvider({ ...options, order: [transport] });
            assertNotAborted();
        }
        catch (error) {
            if (error instanceof LlmStationUnavailableError
                && error.reason === "no_provider") {
                continue;
            }
            throw error;
        }
        candidates.push(provider);
    }
    const { GeminiRemoteLlmStation, resolveTaskMapRemoteLlmPlan, } = await import("./gemini-remote.js");
    const remotePlan = resolveTaskMapRemoteLlmPlan({
        remoteConsent: options.remoteConsent,
        remoteCredentialPlan: options.remoteCredentialPlan,
    });
    if (remotePlan.consent === "granted") {
        if (remotePlan.credentialPlan.ok) {
            remoteStation = new GeminiRemoteLlmStation({
                credentialPlan: remotePlan.credentialPlan,
                fetchImpl: options.remoteFetch,
                clock,
                timeoutMs,
                requestGroupId: options.remoteRequestGroupId,
            });
            candidates.push(remoteStation.provider);
        }
        else {
            terminalError = new LlmStationUnavailableError("provider_unauthenticated", "gemini-remote");
        }
    }
    else if (remotePlan.consent === "undecided") {
        terminalError = new LlmStationUnavailableError("remote_consent_required");
    }
    for (let index = 0; index < candidates.length; index += 1) {
        const provider = candidates[index];
        try {
            assertNotAborted();
            await authenticateProvider(provider, runner, timeoutMs, options.signal);
            assertNotAborted();
        }
        catch (error) {
            if (error instanceof LlmStationUnavailableError
                && error.reason === "provider_unauthenticated") {
                lastAuthenticationError = error;
                continue;
            }
            throw error;
        }
        return new PrebindingLlmStation(candidates, index, runner, clock, timeoutMs, remoteStation, terminalError);
    }
    if (terminalError !== undefined)
        throw terminalError;
    if (lastAuthenticationError !== undefined)
        throw lastAuthenticationError;
    throw new LlmStationUnavailableError("no_provider");
}
