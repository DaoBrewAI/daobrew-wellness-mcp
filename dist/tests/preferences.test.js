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
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const preferences_js_1 = require("../src/preferences.js");
const PREFS_FILE = (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "prefs.json");
(0, node_test_1.describe)("preferences", () => {
    (0, node_test_1.beforeEach)(() => {
        if ((0, fs_1.existsSync)(PREFS_FILE))
            (0, fs_1.unlinkSync)(PREFS_FILE);
    });
    (0, node_test_1.it)("load() returns defaults when no file exists", () => {
        const prefs = (0, preferences_js_1.load)();
        assert.strictEqual(prefs.ambient_optin, false);
        assert.strictEqual(prefs.preferred_volume, 0.3);
        assert.strictEqual(prefs.session_count, 0);
        assert.strictEqual(prefs.voiceover, true);
    });
    (0, node_test_1.it)("save() persists and load() reads back", () => {
        (0, preferences_js_1.save)({ ambient_optin: true, preferred_volume: 0.5 });
        const prefs = (0, preferences_js_1.load)();
        assert.strictEqual(prefs.ambient_optin, true);
        assert.strictEqual(prefs.preferred_volume, 0.5);
        assert.strictEqual(prefs.disabled, false);
    });
    (0, node_test_1.it)("incrementSessionCount auto-disables voiceover at 3", () => {
        (0, preferences_js_1.save)({ session_count: 0, voiceover: true });
        (0, preferences_js_1.incrementSessionCount)(); // 1
        assert.strictEqual((0, preferences_js_1.load)().voiceover, true);
        (0, preferences_js_1.incrementSessionCount)(); // 2
        assert.strictEqual((0, preferences_js_1.load)().voiceover, true);
        (0, preferences_js_1.incrementSessionCount)(); // 3
        assert.strictEqual((0, preferences_js_1.load)().voiceover, false);
    });
});
