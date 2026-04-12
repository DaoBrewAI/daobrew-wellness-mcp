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
const tools_js_1 = require("../src/tools.js");
const preferences_js_1 = require("../src/preferences.js");
const session_js_1 = require("../src/session.js");
const cooldown = __importStar(require("../src/cooldown.js"));
/**
 * End-to-end verification: exercises the full mock-mode flow
 * through the tool handler, covering all 9 tools and key guard paths.
 * Audio playback will fail in test (no audio files), so we verify the error status.
 */
(0, node_test_1.describe)("e2e mock-mode flow", () => {
    (0, node_test_1.before)(() => {
        // Reset shared state before all e2e tests
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false, headphones_trusted: true, voiceover: true, session_count: 0, preferred_volume: 0.3, cooldown_minutes: 30 });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("lists all 9 tool definitions", () => {
        assert.strictEqual(tools_js_1.toolDefinitions.length, 9);
        const names = tools_js_1.toolDefinitions.map(t => t.name);
        assert.ok(names.includes("daobrew_get_wellness_state"));
        assert.ok(names.includes("daobrew_start_breathing_session"));
        assert.ok(names.includes("daobrew_stop_session"));
        assert.ok(names.includes("daobrew_status"));
        assert.ok(names.includes("daobrew_set_monitoring"));
        assert.ok(names.includes("daobrew_connect_source"));
    });
    (0, node_test_1.it)("get_wellness_state returns MCP schema with cache_age_seconds", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_get_wellness_state", { force_refresh: true }, true);
        assert.ok(typeof result.yin === "number");
        assert.ok(typeof result.yang === "number");
        assert.ok(typeof result.quadrant === "string");
        assert.strictEqual(result.cache_age_seconds, 0);
        assert.ok(Array.isArray(result.active_elements));
        assert.strictEqual(result.data_source, "mock");
    });
    (0, node_test_1.it)("get_element_detail returns valid detail", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_get_element_detail", { element: "fire" }, true);
        assert.strictEqual(result.element, "fire");
        assert.ok(typeof result.score === "number");
        assert.ok(typeof result.headline === "string");
        assert.ok(typeof result._warning === "string");
    });
    (0, node_test_1.it)("start_breathing_session plays audio or errors when no files", async () => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false, headphones_trusted: true });
        cooldown.clearAll();
        (0, session_js_1.clearSession)();
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ondemand",
        }, true);
        // With audio files: status=started+audio_status=playing; without: status=audio_error
        assert.ok(result.audio_status === "playing" || result.status === "audio_error", `Expected playing or audio_error, got status=${result.status}, audio_status=${result.audio_status}`);
        // Clean up if session started
        if (result.audio_status === "playing") {
            await (0, tools_js_1.handleToolCall)("daobrew_stop_session", {}, true);
        }
    });
    (0, node_test_1.it)("start_breathing_session rejects ambient without optin", async () => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false });
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ambient",
        }, true);
        assert.strictEqual(result.status, "requires_optin");
    });
    (0, node_test_1.it)("stop_session returns no_active_session when idle", async () => {
        (0, session_js_1.clearSession)();
        const result = await (0, tools_js_1.handleToolCall)("daobrew_stop_session", {}, true);
        assert.strictEqual(result.status, "no_active_session");
    });
    (0, node_test_1.it)("status returns mock mode with preferences", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_status", {}, true);
        assert.strictEqual(result.mode, "mock");
        assert.ok(typeof result.preferences === "object");
        assert.ok(typeof result.headphones === "object");
        assert.ok(result.data_sources);
    });
    (0, node_test_1.it)("set_monitoring updates preferences", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_set_monitoring", {
            preferred_volume: 0.7,
        }, true);
        assert.strictEqual(result.status, "updated");
        assert.strictEqual(result.preferences.preferred_volume, 0.7);
    });
    (0, node_test_1.it)("connect_source apple_watch returns mock_mode in mock", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_connect_source", {
            source: "apple_watch",
        }, true);
        assert.strictEqual(result.status, "mock_mode");
        assert.ok(result.install_url);
    });
    (0, node_test_1.it)("connect_source oura returns error without client ID", async () => {
        // Temporarily clear env var to ensure no client ID is available
        const origEnv = process.env.DAOBREW_OURA_CLIENT_ID;
        delete process.env.DAOBREW_OURA_CLIENT_ID;
        // handleToolCall in mock mode should not read config file for oura
        // Pass isMock=true and no client — should return error
        const { handleToolCall: handle } = await import("../src/tools.js");
        const result = await handle("daobrew_connect_source", {
            source: "oura",
        }, true);
        // Restore
        if (origEnv)
            process.env.DAOBREW_OURA_CLIENT_ID = origEnv;
        assert.strictEqual(result.status, "error");
    });
    (0, node_test_1.it)("get_session_result returns mock data", async () => {
        const { mockStartSession } = await import("../src/mock.js");
        const session = mockStartSession("earth", "audio");
        const result = await (0, tools_js_1.handleToolCall)("daobrew_get_session_result", {
            session_id: session.session_id,
        }, true);
        assert.strictEqual(result.completed, true);
        assert.ok(result.summary.includes("[SIMULATED]"));
    });
    (0, node_test_1.it)("get_session_history returns entries", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_get_session_history", { days: 7 }, true);
        assert.ok(Array.isArray(result));
        assert.ok(result.length >= 3);
    });
    (0, node_test_1.it)("rejects invalid element", async () => {
        await assert.rejects(() => (0, tools_js_1.handleToolCall)("daobrew_get_element_detail", { element: "invalid" }, true), /Invalid element/);
    });
    (0, node_test_1.it)("rejects unknown tool", async () => {
        await assert.rejects(() => (0, tools_js_1.handleToolCall)("nonexistent_tool", {}, true), /Unknown tool/);
    });
});
