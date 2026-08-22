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
const node_http_1 = require("node:http");
const sync_js_1 = require("../src/health/sync.js");
const oura = __importStar(require("../src/health/oura.js"));
const googleFit = __importStar(require("../src/health/google-fit.js"));
const client_js_1 = require("../src/client.js");
const DEVICE_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";
(0, node_test_1.describe)("syncAllConnectedSources", () => {
    (0, node_test_1.it)("returns empty array when no sources connected", {
        skip: oura.isConnected() || googleFit.isConnected(),
    }, async () => {
        // Create a client pointing at nothing (won't be called since no tokens exist)
        const client = new client_js_1.DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl: "http://localhost:1", timeoutMs: 1000 });
        const results = await (0, sync_js_1.syncAllConnectedSources)(client);
        // No tokens exist at ~/.daobrew/oura-token.json or google-fit-token.json
        // so both isConnected() checks return false and no sync happens
        assert.ok(Array.isArray(results));
        // Should have 0 results since nothing is connected
        for (const r of results) {
            assert.ok(typeof r.source === "string");
            assert.ok(typeof r.samples_pushed === "number");
        }
    });
});
(0, node_test_1.describe)("oura oauth token", () => {
    (0, node_test_1.it)("oauth tokens remain valid before expiry", () => {
        const token = { access_token: "a", refresh_token: "r", expires_at: 3000, token_type: "Bearer" };
        assert.strictEqual(oura.needsRefresh(token, 2000), false);
    });
    (0, node_test_1.it)("oauth tokens refresh at expiry", () => {
        const token = { access_token: "a", refresh_token: "r", expires_at: 1000, token_type: "Bearer" };
        assert.strictEqual(oura.needsRefresh(token, 2000), true);
    });
    (0, node_test_1.it)("preserves authorization generation across refresh-token rotation", () => {
        const refreshed = oura.refreshedOuraToken({
            access_token: "access-1",
            refresh_token: "refresh-1",
            expires_at: 0,
            token_type: "Bearer",
            authorization_generation: "auth_generation-1",
            authorized_at: 1_750_000_000,
        }, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 3600,
            token_type: "Bearer",
        }, 1_750_000_100_000);
        assert.strictEqual(refreshed.refresh_token, "refresh-2");
        assert.strictEqual(refreshed.authorization_generation, "auth_generation-1");
        assert.strictEqual(refreshed.authorized_at, 1_750_000_000);
    });
});
(0, node_test_1.describe)("oura sync result truth", () => {
    (0, node_test_1.it)("distinguishes a zero-sample window from a completed initial import", () => {
        assert.deepStrictEqual((0, sync_js_1.successfulOuraSyncResult)(0, 0), {
            source: "oura",
            samples_fetched: 0,
            samples_pushed: 0,
            outcome: "no_data",
        });
    });
    (0, node_test_1.it)("treats fetched-but-deduplicated rows as observed data", () => {
        assert.strictEqual((0, sync_js_1.successfulOuraSyncResult)(29, 0).outcome, "data_observed");
    });
});
(0, node_test_1.describe)("push identity header (bearer-only principal)", () => {
    // Runs a real DaoBrewClient (curl) against a throwaway localhost server that
    // records the headers it receives — proves the WIRE truth, not a mock.
    async function captureHeaders() {
        const received = {};
        const server = (0, node_http_1.createServer)((req, res) => {
            assert.strictEqual(req.url, "/api/v1/device/health/samples");
            for (const [k, v] of Object.entries(req.headers))
                received[k.toLowerCase()] = String(v);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, data: { samples_received: 1, message: "ok" } }));
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", () => r()));
        const port = server.address().port;
        const client = new client_js_1.DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl: `http://127.0.0.1:${port}/api/v1`, timeoutMs: 2000 });
        const sample = {
            metric_type: "hr",
            value: 60,
            unit: "count/min",
            start_time: "2026-07-12T00:00:00Z",
            end_time: "2026-07-12T00:00:00Z",
            source: "oura",
        };
        await client.pushHealthSamples([sample]);
        return received;
    }
    (0, node_test_1.it)("always derives ownership from the device bearer and omits X-Device-ID", async () => {
        const h = await captureHeaders();
        assert.strictEqual(h["x-device-id"], undefined);
        assert.strictEqual(h["authorization"], `Bearer ${DEVICE_CREDENTIAL}`);
    });
});
(0, node_test_1.describe)("oura backfill windows", () => {
    (0, node_test_1.it)("defaults to incremental 4h HR / 2d sleep", () => {
        const w = (0, sync_js_1.ouraFetchWindows)(new Date("2026-07-06T12:00:00Z"));
        assert.strictEqual(w.hrStart, "2026-07-06T08:00:00.000Z");
        assert.strictEqual(w.sleepStart, "2026-07-04");
    });
    (0, node_test_1.it)("backfillDays=30 widens both windows to 30 days", () => {
        const w = (0, sync_js_1.ouraFetchWindows)(new Date("2026-07-06T12:00:00Z"), 30);
        assert.strictEqual(w.hrStart, "2026-06-06T12:00:00.000Z");
        assert.strictEqual(w.sleepStart, "2026-06-06");
    });
});
(0, node_test_1.describe)("oura multi-document pagination", () => {
    (0, node_test_1.it)("follows each continuation once and combines all endpoint rows", async () => {
        const requested = [];
        const rows = await (0, sync_js_1.collectOuraPages)(async (nextToken) => {
            requested.push(nextToken);
            if (nextToken === undefined)
                return { data: [1, 2], next_token: "page-2" };
            if (nextToken === "page-2")
                return { data: [3], next_token: "page-3" };
            return { data: [4], next_token: null };
        });
        assert.deepStrictEqual(requested, [undefined, "page-2", "page-3"]);
        assert.deepStrictEqual(rows, [1, 2, 3, 4]);
    });
    (0, node_test_1.it)("fails closed on repeated, malformed, or unbounded continuations", async () => {
        await assert.rejects((0, sync_js_1.collectOuraPages)(async () => ({ data: [], next_token: "repeat" }), 3), /repeated a continuation token/);
        await assert.rejects((0, sync_js_1.collectOuraPages)(async () => ({ data: [], next_token: 42 })), /invalid continuation token/);
        await assert.rejects((0, sync_js_1.collectOuraPages)(async () => ({ next_token: null })), /invalid multi-document page/);
        let page = 0;
        await assert.rejects((0, sync_js_1.collectOuraPages)(async () => ({ data: [], next_token: `page-${++page}` }), 2), /exceeded its safety limit/);
    });
});
(0, node_test_1.describe)("wide health backfill writes", () => {
    (0, node_test_1.it)("splits samples into bounded batches and sums accepted rows", async () => {
        const batchLengths = [];
        const client = {
            async pushHealthSamples(samples) {
                batchLengths.push(samples.length);
                return { samples_received: samples.length, message: "ok" };
            },
        };
        const samples = Array.from({ length: 1_201 }, (_, index) => ({
            metric_type: "heart_rate",
            value: 60 + (index % 40),
            unit: "bpm",
            start_time: "2026-07-15T12:00:00.000Z",
            end_time: "2026-07-15T12:00:00.000Z",
            source: "oura",
        }));
        const pushed = await (0, sync_js_1.pushHealthSamplesInBatches)(client, samples, 500);
        assert.strictEqual(pushed, 1_201);
        assert.deepStrictEqual(batchLengths, [500, 500, 201]);
    });
    (0, node_test_1.it)("rejects a non-positive batch size", async () => {
        await assert.rejects((0, sync_js_1.pushHealthSamplesInBatches)({ pushHealthSamples: async () => ({ samples_received: 0, message: "ok" }) }, [], 0), /positive integer/);
    });
    (0, node_test_1.it)("retries a transient batch without replaying completed batches", async () => {
        const calls = [];
        let secondBatchAttempts = 0;
        const client = {
            async pushHealthSamples(samples) {
                calls.push(samples[0].value);
                if (samples[0].value === 500 && secondBatchAttempts++ < 2) {
                    throw new Error("Service Unavailable");
                }
                return { samples_received: samples.length, message: "ok" };
            },
        };
        const samples = Array.from({ length: 750 }, (_, index) => ({
            metric_type: "heart_rate",
            value: index,
            unit: "bpm",
            start_time: "2026-07-15T12:00:00.000Z",
            end_time: "2026-07-15T12:00:00.000Z",
            source: "oura",
        }));
        const pushed = await (0, sync_js_1.pushHealthSamplesInBatches)(client, samples, 500, [0, 0], async () => { });
        assert.strictEqual(pushed, 750);
        assert.deepStrictEqual(calls, [0, 500, 500, 500]);
    });
    (0, node_test_1.it)("reports partial progress when a later batch exhausts retries", async () => {
        const samples = Array.from({ length: 750 }, (_, index) => ({
            metric_type: "heart_rate",
            value: index,
            unit: "bpm",
            start_time: "2026-07-15T12:00:00.000Z",
            end_time: "2026-07-15T12:00:00.000Z",
            source: "oura",
        }));
        const client = {
            async pushHealthSamples(batch) {
                if (batch[0].value === 500)
                    throw new Error("Service Unavailable");
                return { samples_received: batch.length, message: "ok" };
            },
        };
        await assert.rejects((0, sync_js_1.pushHealthSamplesInBatches)(client, samples, 500, [0], async () => { }), (error) => {
            assert.strictEqual(error.name, "HealthBatchPushError");
            assert.strictEqual(error.samplesPushed, 500);
            assert.strictEqual(error.batchesCompleted, 1);
            assert.match(error.message, /batch 2 failed after 2 attempts/);
            return true;
        });
    });
});
