"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaoBrewClient = void 0;
exports.buildCurlRequestSpec = buildCurlRequestSpec;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const enrollment_js_1 = require("./enrollment.js");
const backend_contract_js_1 = require("./backend-contract.js");
const DEFAULT_TIMEOUT_MS = 15000;
/**
 * The request body uses stdin so wide wearable backfills never hit macOS'
 * argv limit. Authorization headers use inherited fd 3 so the bearer token is
 * absent from curl's argv/process listing and does not compete with body stdin.
 * A random 0700 directory and 0600 header file avoid Node's platform-specific
 * extra-pipe semantics; the path, but never the credential, appears in argv.
 * Both are removed as soon as curl exits or the request times out.
 */
function execCurl(spec, timeoutMs) {
    return new Promise((resolve, reject) => {
        const headerDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-curl-"));
        const headerPath = (0, node_path_1.join)(headerDir, "headers");
        try {
            (0, node_fs_1.writeFileSync)(headerPath, spec.headerInput, { encoding: "utf8", flag: "wx", mode: 0o600 });
        }
        catch (error) {
            (0, node_fs_1.rmSync)(headerDir, { force: true, recursive: true });
            throw error;
        }
        const args = spec.args.map((arg) => arg === "@/dev/fd/3" ? `@${headerPath}` : arg);
        let child;
        try {
            child = (0, node_child_process_1.spawn)("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
        }
        catch (error) {
            (0, node_fs_1.rmSync)(headerDir, { force: true, recursive: true });
            throw error;
        }
        const { stdin, stdout: childStdout, stderr: childStderr } = child;
        if (!stdin || !childStdout || !childStderr) {
            child.kill("SIGTERM");
            throw new Error("could not open curl request streams");
        }
        let stdout = "";
        let stderr = "";
        let settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            (0, node_fs_1.rmSync)(headerDir, { force: true, recursive: true });
            if (error)
                reject(error);
            else
                resolve({ stdout });
        };
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            finish(new Error(`curl timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        childStdout.setEncoding("utf8");
        childStderr.setEncoding("utf8");
        childStdout.on("data", (chunk) => { stdout += chunk; });
        childStderr.on("data", (chunk) => { stderr += chunk; });
        child.once("error", (error) => finish(error));
        child.once("close", (code, signal) => {
            if (code === 0)
                finish();
            else
                finish(new Error(stderr.trim() || `curl exited with ${signal ?? code}`));
        });
        stdin.on("error", (error) => {
            // curl may close stdin after an HTTP/network failure; the close handler
            // carries the useful curl error in that case.
            if (error.code !== "EPIPE" && error.code !== "ECONNRESET")
                finish(error);
        });
        stdin.end(spec.body ?? "");
    });
}
function buildCurlRequestSpec(config, path, options = {}) {
    const credential = config.deviceCredential.trim();
    if (!(0, enrollment_js_1.isValidDeviceCredential)(credential)) {
        throw new Error("DaoBrew device credential is invalid; enroll this installation first");
    }
    const baseUrl = (0, enrollment_js_1.normalizeApiUrl)(config.baseUrl ?? enrollment_js_1.DEFAULT_API_URL);
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const args = [
        "-sS", "--fail-with-body", "--max-time", String(Math.ceil(timeoutMs / 1000)),
        "-H", "Content-Type: application/json",
        "-H", "@/dev/fd/3",
    ];
    if (options.method === "POST") {
        args.push("-X", "POST");
        if (options.body !== undefined)
            args.push("--data-binary", "@-");
    }
    args.push(`${baseUrl}${path}`);
    const headers = [`Authorization: Bearer ${credential}`];
    return {
        args,
        headerInput: `${headers.join("\n")}\n`,
        ...(options.body !== undefined ? { body: options.body } : {}),
    };
}
class DaoBrewClient {
    config;
    timeoutMs;
    constructor(config) {
        // Validate at construction so callers fail closed before a sync starts.
        buildCurlRequestSpec(config, "/");
        this.config = {
            ...config,
            baseUrl: (0, enrollment_js_1.normalizeApiUrl)(config.baseUrl ?? enrollment_js_1.DEFAULT_API_URL),
            deviceCredential: config.deviceCredential.trim(),
        };
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    async request(path, options = {}) {
        const timeoutMs = this.timeoutMs + 2000;
        const spec = buildCurlRequestSpec(this.config, path, options);
        const { stdout } = await execCurl(spec, timeoutMs);
        const json = JSON.parse(stdout);
        if (json.success === false) {
            throw new Error(`DaoBrew API error: ${json.error?.message ?? json.error ?? "Unknown error"}`);
        }
        return json.data;
    }
    async getWellnessState() {
        return this.request("/state/current?format=mcp");
    }
    async assertBackendCompatible() {
        const payload = await this.request("/version");
        const actual = payload?.contract_version;
        if (typeof actual !== "number" || !Number.isSafeInteger(actual)) {
            throw new Error("DaoBrew backend version response is invalid");
        }
        if (actual < backend_contract_js_1.REQUIRED_BACKEND_CONTRACT_VERSION) {
            throw new Error("DaoBrew backend version is behind this client; wait for the server update");
        }
        return actual;
    }
    async getElementDetail(element) {
        return this.request(`/element/${element}/detail`);
    }
    async startSession(element, tier = "audio") {
        return this.request("/session/start", {
            method: "POST",
            body: JSON.stringify({ element, tier }),
        });
    }
    async getSessionResult(sessionId) {
        return this.request(`/session/${sessionId}/outcome`);
    }
    async getSessionHistory(days = 7) {
        return this.request(`/session/logs?limit=${days * 5}`);
    }
    async getHealthkitHistory(metric, range) {
        const query = new URLSearchParams({ metric, range });
        return this.request(`/device/health/history?${query.toString()}`);
    }
    async getStateHistory(limit, start_ts, end_ts) {
        const query = new URLSearchParams();
        if (limit !== undefined)
            query.set("limit", String(limit));
        if (start_ts !== undefined)
            query.set("start_ts", String(start_ts));
        if (end_ts !== undefined)
            query.set("end_ts", String(end_ts));
        const suffix = query.toString();
        return this.request(`/state/history${suffix ? `?${suffix}` : ""}`);
    }
    async pushHealthSamples(samples) {
        if (samples.length === 0)
            return { samples_received: 0, message: "No samples to push" };
        return this.request("/device/health/samples", {
            method: "POST",
            body: JSON.stringify({ samples }),
        });
    }
    /** Run the server-owned causal engine for the authenticated principal. */
    async runCausalGraph() {
        return this.request("/causal/run", {
            method: "POST",
            // Deliberately no body: the backend derives identity and run policy.
        });
    }
    /** Fetch the authenticated principal's exact graph projection for mirroring. */
    async getGraphSnapshot() {
        return this.request("/graph/snapshot");
    }
    async createPairingCode() {
        return this.request("/pair/create", {
            method: "POST",
        });
    }
    async sendHeartbeat() {
        await this.request("/pair/heartbeat", {
            method: "POST",
        });
    }
    /**
     * Fetch the latest live heart-rate sample from the backend.
     * Schema (Track B contract):
     *   { hr: float|null, age_seconds: float|null, stale: bool }
     *
     * On HTTP/parse failure, returns `{hr: null, stale: true}` rather than throwing —
     * `daobrew_check` is auto-polled every 2s and we do not want to break the dashboard
     * stream on a transient backend hiccup.
     */
    async getLiveHR() {
        try {
            return await this.request("/session/live-hr");
        }
        catch {
            return { hr: null, stale: true };
        }
    }
    /**
     * Tell the backend to begin cycle-boundary breath-param feedback for this user.
     * Pattern is locked for the session; backend computes new params at every breath
     * cycle boundary using the just-completed cycle's HR. MCP polls `getBreathState()`
     * to render the retro bar.
     */
    async startLiveSession(pattern, durationSec, initialParams) {
        return this.request("/session/live/start", {
            method: "POST",
            body: JSON.stringify({
                pattern,
                ...(durationSec !== undefined && { duration_sec: durationSec }),
                ...(initialParams && { initial_params: initialParams }),
            }),
        });
    }
    async stopLiveSession() {
        try {
            return await this.request("/session/live/stop", { method: "POST" });
        }
        catch {
            return { stopped: false, reason: "request_failed" };
        }
    }
    /**
     * Fetch the live breath-state for retro-bar rendering.
     * Returns `{active: false}` if no session is running.
     */
    async getBreathState() {
        try {
            return await this.request("/session/breath-state");
        }
        catch {
            return { active: false };
        }
    }
    async notifyDisconnect() {
        try {
            await this.request("/pair/disconnect", {
                method: "POST",
            });
        }
        catch {
            // Best-effort — process may be dying
        }
    }
}
exports.DaoBrewClient = DaoBrewClient;
