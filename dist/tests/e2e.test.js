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
 * through the tool handler, covering all 6 tools and key guard paths.
 * Audio playback will fail in test (no audio files), so we verify the error status.
 */
(0, node_test_1.describe)("e2e mock-mode flow (6-tool surface)", () => {
    (0, node_test_1.before)(() => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false, headphones_trusted: true, voiceover: true, session_count: 0, preferred_volume: 0.3, cooldown_minutes: 30 });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("lists all 7 tool definitions (check, breathe, stop, history, status, settings, connect_watch)", () => {
        assert.strictEqual(tools_js_1.toolDefinitions.length, 7);
        const names = tools_js_1.toolDefinitions.map(t => t.name);
        assert.ok(names.includes("daobrew_check"));
        assert.ok(names.includes("daobrew_breathe"));
        assert.ok(names.includes("daobrew_stop"));
        assert.ok(names.includes("daobrew_history"));
        assert.ok(names.includes("daobrew_status"));
        assert.ok(names.includes("daobrew_settings"));
        assert.ok(names.includes("daobrew_connect_watch"));
    });
    (0, node_test_1.it)("daobrew_check returns content blocks (text-only when no session)", async () => {
        (0, session_js_1.clearSession)();
        const result = await (0, tools_js_1.handleToolCall)("daobrew_check", { force_refresh: true }, true);
        assert.ok(result.__mcp_content__, "expected MCP content marker");
        assert.ok(Array.isArray(result.content));
        assert.ok(result.content.length >= 1);
        assert.strictEqual(result.content[0].type, "text");
    });
    (0, node_test_1.it)("daobrew_breathe rejects ambient without optin", async () => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false });
        const result = await (0, tools_js_1.handleToolCall)("daobrew_breathe", {
            stress_pattern: "tension", mode: "ambient",
        }, true);
        assert.strictEqual(result.status, "requires_optin");
    });
    (0, node_test_1.it)("daobrew_stop returns no_active_session when idle", async () => {
        (0, session_js_1.clearSession)();
        const result = await (0, tools_js_1.handleToolCall)("daobrew_stop", {}, true);
        assert.strictEqual(result.status, "no_active_session");
    });
    (0, node_test_1.it)("daobrew_status returns mock mode with preferences", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_status", {}, true);
        assert.strictEqual(result.mode, "mock");
        assert.ok(typeof result.preferences === "object");
        assert.ok(typeof result.headphones === "object");
        assert.ok(result.data_sources);
    });
    (0, node_test_1.it)("daobrew_settings updates preferences", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_settings", {
            preferred_volume: 0.7,
        }, true);
        assert.strictEqual(result.status, "updated");
        assert.strictEqual(result.preferences.preferred_volume, 0.7);
    });
    (0, node_test_1.it)("daobrew_connect_watch returns mock_mode in mock", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_connect_watch", {}, true);
        assert.strictEqual(result.status, "mock_mode");
        assert.ok(result.install_url);
    });
    (0, node_test_1.it)("daobrew_history returns entries", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_history", { days: 7 }, true);
        assert.ok(Array.isArray(result));
        assert.ok(result.length >= 3);
    });
    (0, node_test_1.it)("rejects invalid stress_pattern", async () => {
        await assert.rejects(() => (0, tools_js_1.handleToolCall)("daobrew_breathe", { stress_pattern: "invalid" }, true), /Invalid stress_pattern/);
    });
    (0, node_test_1.it)("rejects unknown tool", async () => {
        await assert.rejects(() => (0, tools_js_1.handleToolCall)("nonexistent_tool", {}, true), /Unknown tool/);
    });
});
