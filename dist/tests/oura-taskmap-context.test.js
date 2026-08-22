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
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const oura_taskmap_context_js_1 = require("../src/health/oura-taskmap-context.js");
const oura_taskmap_context_cli_js_1 = require("../src/health/oura-taskmap-context-cli.js");
const TOKEN = {
    access_token: "private-access-token-sentinel",
    refresh_token: "private-refresh-token-sentinel",
    expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
    token_type: "Bearer",
};
function emptyDependencies(overrides = {}) {
    const emptyPage = async () => ({ data: [], next_token: null });
    return {
        loadToken: () => TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("unexpected token refresh");
        },
        fetchDailyReadiness: emptyPage,
        fetchDailySleep: emptyPage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
        ...overrides,
    };
}
(0, node_test_1.describe)("Oura Task Map read-only context", () => {
    (0, node_test_1.it)("follows every page and every provider-safe heartrate window", async () => {
        const calls = new Map();
        const paged = (endpoint, firstDay, secondDay) => async (_token, _start, _end, nextToken) => {
            const endpointCalls = calls.get(endpoint) ?? [];
            endpointCalls.push(nextToken);
            calls.set(endpoint, endpointCalls);
            return nextToken === undefined
                ? { data: [{ day: firstDay, score: 80 }], next_token: `${endpoint}-2` }
                : { data: [{ day: secondDay, score: 82 }], next_token: null };
        };
        const activityBounds = [];
        const heartRateWindows = new Set();
        let refreshCalls = 0;
        const dependencies = emptyDependencies({
            refreshAccessToken: async (token) => {
                refreshCalls += 1;
                return token;
            },
            fetchDailyReadiness: paged("daily-readiness", "2026-01-02", "2026-03-02"),
            fetchDailySleep: paged("daily-sleep", "2026-01-02", "2026-03-02"),
            fetchDailyActivity: async (_token, start, end, nextToken) => {
                activityBounds.push([start, end]);
                return nextToken === undefined
                    ? {
                        data: [{ day: "2026-01-02", steps: 123_456_789 }],
                        next_token: "activity-2",
                    }
                    : {
                        data: [{ day: "2026-03-02", active_calories: 98_765.4321 }],
                        next_token: null,
                    };
            },
            fetchSleep: paged("sleep", "2026-01-02", "2026-03-02"),
            fetchHeartRate: async (_token, start, end, nextToken) => {
                heartRateWindows.add(`${start}|${end}`);
                return nextToken === undefined
                    ? {
                        data: [{
                                id: `first-${start}`,
                                timestamp: start,
                                bpm: 41.234567,
                            }],
                        next_token: "heart-rate-2",
                    }
                    : {
                        data: [{
                                id: `second-${end}`,
                                timestamp: end,
                                bpm: 98.765432,
                            }],
                        next_token: null,
                    };
            },
        });
        const document = await (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)({
            startDate: "2026-01-01",
            endDate: "2026-03-05",
            now: new Date("2026-03-06T00:00:00.000Z"),
        }, dependencies);
        assert.strictEqual(refreshCalls, 0);
        assert.deepStrictEqual(calls.get("daily-readiness"), [
            undefined,
            "daily-readiness-2",
        ]);
        assert.deepStrictEqual(calls.get("daily-sleep"), [
            undefined,
            "daily-sleep-2",
        ]);
        assert.deepStrictEqual(calls.get("sleep"), [undefined, "sleep-2"]);
        assert.deepStrictEqual(activityBounds, [
            ["2025-12-31", "2026-03-06"],
            ["2025-12-31", "2026-03-06"],
        ]);
        assert.strictEqual(heartRateWindows.size, 3);
        assert.strictEqual(document.coverage.dailyReadinessDays, 2);
        assert.strictEqual(document.coverage.dailySleepDays, 2);
        assert.strictEqual(document.coverage.dailyActivityDays, 2);
        assert.strictEqual(document.coverage.sleepRecords, 2);
        assert.strictEqual(document.coverage.heartRateSamples, 6);
        assert.strictEqual(document.coverage.classifiedDays, 0);
        assert.strictEqual(document.coverage.unknownDays, 64);
    });
    (0, node_test_1.it)("refreshes the local token only after actual expiry", async () => {
        const expired = {
            ...TOKEN,
            expires_at: Date.parse("2026-01-01T00:00:00.000Z"),
        };
        const refreshed = {
            ...TOKEN,
            access_token: "refreshed-private-token",
            expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
        };
        let refreshCalls = 0;
        const tokensSeen = [];
        const dependencies = emptyDependencies({
            loadToken: () => expired,
            refreshAccessToken: async () => {
                refreshCalls += 1;
                return refreshed;
            },
            fetchDailyReadiness: async (token) => {
                tokensSeen.push(token);
                return { data: [], next_token: null };
            },
        });
        await (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)({
            startDate: "2026-01-01",
            endDate: "2026-01-01",
            now: new Date("2026-01-02T00:00:00.000Z"),
        }, dependencies);
        assert.strictEqual(refreshCalls, 1);
        assert.strictEqual(tokensSeen[0], refreshed);
    });
    (0, node_test_1.it)("classifies deterministically against the trailing personal baseline", () => {
        const rows = Array.from({ length: 10 }, (_, index) => {
            const day = `2026-01-${String(index + 1).padStart(2, "0")}`;
            const score = index < 7 ? 80 : [70, 80, 90][index - 7];
            return { day, score };
        });
        const forward = (0, oura_taskmap_context_js_1.classifyCompositeRecoveryDays)("2026-01-01", "2026-01-10", rows, rows);
        const reversed = (0, oura_taskmap_context_js_1.classifyCompositeRecoveryDays)("2026-01-01", "2026-01-10", [...rows].reverse(), [...rows].reverse());
        assert.deepStrictEqual(reversed, forward);
        assert.deepStrictEqual(forward.map((day) => day.category), [
            "unknown",
            "unknown",
            "unknown",
            "unknown",
            "unknown",
            "unknown",
            "unknown",
            "below_baseline",
            "within_baseline",
            "above_baseline",
        ]);
    });
    (0, node_test_1.it)("does not carry sparse observations beyond the 28-calendar-day baseline", () => {
        const rows = [
            ...Array.from({ length: 7 }, (_, index) => ({
                day: `2026-01-${String(index + 1).padStart(2, "0")}`,
                score: 80,
            })),
            { day: "2026-03-10", score: 60 },
        ];
        const classified = (0, oura_taskmap_context_js_1.classifyCompositeRecoveryDays)("2026-01-01", "2026-03-10", rows, rows);
        assert.equal(classified.at(-1)?.dayKey, "2026-03-10");
        assert.equal(classified.at(-1)?.category, "unknown");
    });
    (0, node_test_1.it)("resolves an exact inclusive backfill range and requires an absolute output", () => {
        const args = (0, oura_taskmap_context_cli_js_1.parseOuraTaskMapContextCliArgs)([
            "--output",
            "/tmp/owner-safe-oura-context.json",
            "--backfill-days",
            "90",
            "--now",
            "2026-07-27T12:00:00.000Z",
        ]);
        assert.deepStrictEqual((0, oura_taskmap_context_cli_js_1.resolveOuraTaskMapContextRange)(args), {
            startDate: "2026-04-29",
            endDate: "2026-07-27",
            now: new Date("2026-07-27T12:00:00.000Z"),
        });
        assert.throws(() => (0, oura_taskmap_context_cli_js_1.parseOuraTaskMapContextCliArgs)([
            "--output",
            "relative.json",
        ]), /absolute/);
    });
    (0, node_test_1.it)("serializes only bounded categories/counts and writes atomically as 0600", async () => {
        const document = await (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)({
            startDate: "2026-07-26",
            endDate: "2026-07-26",
            now: new Date("2026-07-27T00:00:00.000Z"),
        }, emptyDependencies({
            fetchDailyReadiness: async () => ({
                data: [{
                        day: "2026-07-26",
                        score: 73.456789,
                        temperature_deviation: 0.123456789,
                    }],
                next_token: null,
            }),
            fetchDailySleep: async () => ({
                data: [{ day: "2026-07-26", score: 81.234567 }],
                next_token: null,
            }),
            fetchDailyActivity: async () => ({
                data: [{
                        day: "2026-07-26",
                        steps: 123_456_789,
                        active_calories: 98_765.4321,
                    }],
                next_token: null,
            }),
            fetchSleep: async () => ({
                data: [{
                        day: "2026-07-26",
                        average_hrv: 41.234567,
                        lowest_heart_rate: 49.876543,
                    }],
                next_token: null,
            }),
            fetchHeartRate: async () => ({
                data: [{
                        id: "private-heart-rate-row",
                        timestamp: "2026-07-26T12:00:00.000Z",
                        bpm: 98.765432,
                    }],
                next_token: null,
            }),
        }));
        const serialized = (0, oura_taskmap_context_js_1.serializeOuraTaskMapContext)(document);
        for (const secret of [
            TOKEN.access_token,
            TOKEN.refresh_token,
            "73.456789",
            "81.234567",
            "123456789",
            "98765.4321",
            "41.234567",
            "49.876543",
            "98.765432",
        ]) {
            assert.ok(!serialized.includes(secret), `serialized raw sentinel ${secret}`);
        }
        const forbiddenKeys = new Set([
            "access_token",
            "refresh_token",
            "score",
            "temperature_deviation",
            "steps",
            "active_calories",
            "average_hrv",
            "lowest_heart_rate",
            "bpm",
            "value",
        ]);
        const visit = (value) => {
            if (Array.isArray(value)) {
                value.forEach(visit);
            }
            else if (value && typeof value === "object") {
                for (const [key, child] of Object.entries(value)) {
                    assert.ok(!forbiddenKeys.has(key), `serialized forbidden key ${key}`);
                    visit(child);
                }
            }
        };
        visit(JSON.parse(serialized));
        const temporaryRoot = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "oura-taskmap-context-"));
        try {
            const output = (0, node_path_1.join)(temporaryRoot, "private", "context.json");
            (0, oura_taskmap_context_js_1.writeOuraTaskMapContextAtomic)(output, document);
            assert.strictEqual((0, node_fs_1.statSync)(output).mode & 0o777, 0o600);
            assert.deepStrictEqual(JSON.parse((0, node_fs_1.readFileSync)(output, "utf8")), document);
            assert.throws(() => (0, oura_taskmap_context_js_1.writeOuraTaskMapContextAtomic)("relative-context.json", document), /absolute/);
        }
        finally {
            (0, node_fs_1.rmSync)(temporaryRoot, { recursive: true, force: true });
        }
    });
});
