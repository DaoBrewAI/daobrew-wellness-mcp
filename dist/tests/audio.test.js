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
const audio_js_1 = require("../src/audio.js");
(0, node_test_1.describe)("generateTextBreathingScript", () => {
    (0, node_test_1.it)("generates correct cycle count and format", () => {
        const script = (0, audio_js_1.generateTextBreathingScript)("wood", 300, 6);
        assert.ok(script.includes("Wood"));
        assert.ok(script.includes("Liver"));
        assert.ok(script.includes("Cycle 1/"));
        assert.ok(script.includes("Inhale..."));
        assert.ok(script.includes("Exhale slowly..."));
        assert.ok(script.includes("daobrew_get_session_result"));
    });
    (0, node_test_1.it)("shows max 6 cycles with ellipsis", () => {
        const script = (0, audio_js_1.generateTextBreathingScript)("fire", 600, 6);
        assert.ok(script.includes("Cycle 6/"));
        assert.ok(script.includes("more cycles"));
        assert.ok(!script.includes("Cycle 7/"));
    });
    (0, node_test_1.it)("handles each element", () => {
        const elements = ["wood", "fire", "earth", "metal", "water"];
        for (const el of elements) {
            const script = (0, audio_js_1.generateTextBreathingScript)(el, 300, 6);
            assert.ok(script.length > 50, `${el} script too short`);
        }
    });
});
(0, node_test_1.describe)("stopPlayback", () => {
    (0, node_test_1.it)("returns false when nothing is playing", () => {
        assert.strictEqual((0, audio_js_1.stopPlayback)(), false);
    });
});
