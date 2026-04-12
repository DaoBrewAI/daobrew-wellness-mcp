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
const session_js_1 = require("../src/session.js");
(0, node_test_1.describe)("session state", () => {
    (0, node_test_1.beforeEach)(() => {
        (0, session_js_1.clearSession)();
    });
    (0, node_test_1.it)("starts with no active session", () => {
        assert.strictEqual((0, session_js_1.getActiveSession)(), null);
        assert.strictEqual((0, session_js_1.isSessionRunning)(), false);
        assert.strictEqual((0, session_js_1.durationPlayed)(), null);
    });
    (0, node_test_1.it)("startSession/getActiveSession round-trips", () => {
        const session = {
            sessionId: "sess_test", pid: 0, element: "wood",
            genre: "ambient_downtempo", duration: 300, startTime: Date.now(), mode: "ondemand",
        };
        (0, session_js_1.startSession)(session);
        assert.strictEqual((0, session_js_1.isSessionRunning)(), true);
        assert.strictEqual((0, session_js_1.getActiveSession)()?.sessionId, "sess_test");
        assert.strictEqual((0, session_js_1.getActiveSession)()?.mode, "ondemand");
    });
    (0, node_test_1.it)("clearSession returns previous and clears state", () => {
        const session = {
            sessionId: "sess_clear", pid: 99, element: "fire",
            genre: "lofi_chill_jazz", duration: 300, startTime: Date.now(), mode: "ambient",
        };
        (0, session_js_1.startSession)(session);
        const prev = (0, session_js_1.clearSession)();
        assert.strictEqual(prev?.sessionId, "sess_clear");
        assert.strictEqual((0, session_js_1.isSessionRunning)(), false);
    });
    (0, node_test_1.it)("durationPlayed returns elapsed seconds", () => {
        const session = {
            sessionId: "sess_dur", pid: 0, element: "earth",
            genre: "acoustic_folk_calm", duration: 300, startTime: Date.now() - 5000, mode: "ondemand",
        };
        (0, session_js_1.startSession)(session);
        const played = (0, session_js_1.durationPlayed)();
        assert.ok(played !== null && played >= 4 && played <= 6);
    });
    (0, node_test_1.it)("declines second session when one is already running", () => {
        const s1 = {
            sessionId: "sess_1", pid: 0, element: "wood",
            genre: "ambient_downtempo", duration: 300, startTime: Date.now(), mode: "ondemand",
        };
        (0, session_js_1.startSession)(s1);
        assert.strictEqual((0, session_js_1.isSessionRunning)(), true);
    });
});
