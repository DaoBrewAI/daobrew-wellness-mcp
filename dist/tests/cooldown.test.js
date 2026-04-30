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
const cooldown_js_1 = require("../src/cooldown.js");
(0, node_test_1.describe)("cooldown", () => {
    (0, node_test_1.beforeEach)(() => { (0, cooldown_js_1.clearAll)(); });
    (0, node_test_1.it)("ambient and ondemand are independent", () => {
        (0, cooldown_js_1.activate)("ambient", 60000);
        assert.strictEqual((0, cooldown_js_1.isActive)("ambient"), true);
        assert.strictEqual((0, cooldown_js_1.isActive)("ondemand"), false);
    });
    (0, node_test_1.it)("remainingMinutes returns correct value", () => {
        (0, cooldown_js_1.activate)("ondemand", 120000);
        const remaining = (0, cooldown_js_1.remainingMinutes)("ondemand");
        assert.ok(remaining === 2, `Expected 2, got ${remaining}`);
        assert.strictEqual((0, cooldown_js_1.remainingMinutes)("ambient"), 0);
    });
    (0, node_test_1.it)("clear resets only the specified mode", () => {
        (0, cooldown_js_1.activate)("ambient", 60000);
        (0, cooldown_js_1.activate)("ondemand", 60000);
        (0, cooldown_js_1.clear)("ambient");
        assert.strictEqual((0, cooldown_js_1.isActive)("ambient"), false);
        assert.strictEqual((0, cooldown_js_1.isActive)("ondemand"), true);
    });
    (0, node_test_1.it)("clearAll resets both modes", () => {
        (0, cooldown_js_1.activate)("ambient", 60000);
        (0, cooldown_js_1.activate)("ondemand", 60000);
        (0, cooldown_js_1.clearAll)();
        assert.strictEqual((0, cooldown_js_1.isActive)("ambient"), false);
        assert.strictEqual((0, cooldown_js_1.isActive)("ondemand"), false);
    });
});
