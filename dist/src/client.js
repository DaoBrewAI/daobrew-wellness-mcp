"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaoBrewClient = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const DEFAULT_BASE_URL = "https://api.daobrew.com/api/v1";
const DEFAULT_TIMEOUT_MS = 15000;
class DaoBrewClient {
    apiKey;
    baseUrl;
    timeoutMs;
    constructor(config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const args = [
            "-sS", "--max-time", String(Math.ceil(this.timeoutMs / 1000)),
            "-H", `Authorization: Bearer ${this.apiKey}`,
            "-H", "Content-Type: application/json",
        ];
        if (options.method === "POST") {
            args.push("-X", "POST");
            if (options.body)
                args.push("-d", options.body);
        }
        args.push(url);
        const { stdout } = await execFileAsync("curl", args, { timeout: this.timeoutMs + 2000 });
        const json = JSON.parse(stdout);
        if (json.success === false) {
            throw new Error(`DaoBrew API error: ${json.error?.message ?? json.error ?? "Unknown error"}`);
        }
        return json.data;
    }
    async getWellnessState() {
        return this.request("/state/current?format=mcp");
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
    async pushHealthSamples(samples) {
        if (samples.length === 0)
            return { samples_received: 0, message: "No samples to push" };
        return this.request("/healthkit/samples", {
            method: "POST",
            body: JSON.stringify({ samples }),
        });
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
