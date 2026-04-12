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
// Restore prefs to defaults after all tests in this file
(0, node_test_1.after)(() => {
    (0, preferences_js_1.save)({ disabled: false, ambient_optin: false, preferred_volume: 0.3, cooldown_minutes: 30, headphones_trusted: false, voiceover: true, session_count: 0 });
    (0, session_js_1.clearSession)();
    cooldown.clearAll();
});
(0, node_test_1.describe)("start_breathing_session guard: disabled", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("rejects when globally disabled", async () => {
        (0, preferences_js_1.save)({ disabled: true });
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ondemand",
        }, true);
        assert.strictEqual(result.status, "disabled");
    });
});
(0, node_test_1.describe)("start_breathing_session guard: session_active", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: true });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("rejects when a session is already running", async () => {
        // Simulate an active session with PID 0 (won't be checked as alive)
        (0, session_js_1.startSession)({
            sessionId: "sess_guard_test", pid: 0, element: "fire",
            genre: "lofi_chill_jazz", duration: 300, startTime: Date.now(), mode: "ondemand",
        });
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ondemand",
        }, true);
        assert.strictEqual(result.status, "session_active");
        (0, session_js_1.clearSession)();
    });
});
(0, node_test_1.describe)("start_breathing_session guard: cooldown", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: true, headphones_trusted: true });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("rejects when cooldown is active", async () => {
        cooldown.activate("ondemand", 60000);
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ondemand",
        }, true);
        assert.strictEqual(result.status, "cooldown");
        assert.ok(result.remaining_minutes > 0);
        cooldown.clearAll();
    });
    (0, node_test_1.it)("force=true bypasses cooldown", async () => {
        cooldown.activate("ondemand", 60000);
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ondemand", force: true,
        }, true);
        // Will be audio_error (no audio files in test) or started — either means cooldown bypassed
        assert.ok(result.status !== "cooldown", `Expected non-cooldown status, got ${result.status}`);
        cooldown.clearAll();
    });
});
(0, node_test_1.describe)("start_breathing_session guard: ambient requires optin", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, preferences_js_1.save)({ disabled: false, ambient_optin: false, headphones_trusted: true });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("rejects ambient without optin", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "wood", mode: "ambient",
        }, true);
        assert.strictEqual(result.status, "requires_optin");
    });
    (0, node_test_1.it)("accepts ambient with optin (audio_error in test env)", async () => {
        (0, preferences_js_1.save)({ ambient_optin: true, headphones_trusted: true });
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "water", mode: "ambient",
        }, true);
        // In test env without audio files, we get audio_error (not requires_optin — that's the point)
        assert.ok(result.status !== "requires_optin", `Expected non-requires_optin, got ${result.status}`);
        cooldown.clearAll();
    });
});
(0, node_test_1.describe)("start_breathing_session audio error", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, preferences_js_1.save)({ disabled: false, headphones_trusted: true });
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
    (0, node_test_1.it)("attempts audio playback (playing or error depending on files)", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_start_breathing_session", {
            element: "metal", mode: "ondemand",
        }, true);
        // With audio files: audio_status=playing; without: status=audio_error
        assert.ok(result.audio_status === "playing" || result.status === "audio_error", `Expected playing or audio_error, got status=${result.status}`);
        // Clean up
        if (result.audio_status === "playing") {
            await (0, tools_js_1.handleToolCall)("daobrew_stop_session", {}, true);
        }
        (0, session_js_1.clearSession)();
        cooldown.clearAll();
    });
});
(0, node_test_1.describe)("set_monitoring validation", () => {
    (0, node_test_1.it)("clamps volume to 0-1 range", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_set_monitoring", {
            preferred_volume: 5.0,
        }, true);
        assert.strictEqual(result.preferences.preferred_volume, 1.0);
    });
    (0, node_test_1.it)("clamps negative volume to 0", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_set_monitoring", {
            preferred_volume: -1,
        }, true);
        assert.strictEqual(result.preferences.preferred_volume, 0);
    });
    (0, node_test_1.it)("clamps cooldown_minutes minimum to 1", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_set_monitoring", {
            cooldown_minutes: -5,
        }, true);
        assert.strictEqual(result.preferences.cooldown_minutes, 1);
    });
    (0, node_test_1.it)("sets ambient_optin_date when enabling ambient", async () => {
        const result = await (0, tools_js_1.handleToolCall)("daobrew_set_monitoring", {
            ambient_optin: true,
        }, true);
        assert.ok(result.preferences.ambient_optin_date);
        assert.ok(!isNaN(Date.parse(result.preferences.ambient_optin_date)));
    });
});
