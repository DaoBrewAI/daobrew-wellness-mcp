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
const strength_js_1 = require("../src/engine/memory/strength.js");
const NOW = 1_800_000_000;
(0, node_test_1.describe)("Layer 2 strength math", () => {
    (0, node_test_1.it)("counts fresh evidence at full weight and halves it at one half-life", () => {
        assert.equal((0, strength_js_1.computeStrength)([{ observed_at_ts: NOW, weight: 1 }], "correlation", NOW), 1);
        const oneHalfLife = NOW - strength_js_1.HALF_LIFE_WEEKS.correlation * strength_js_1.WEEK_SECONDS;
        const s = (0, strength_js_1.computeStrength)([{ observed_at_ts: oneHalfLife, weight: 1 }], "correlation", NOW);
        assert.ok(Math.abs(s - 0.5) < 0.001);
    });
    (0, node_test_1.it)("reinforces with more evidence and recomputes idempotently", () => {
        const one = (0, strength_js_1.computeStrength)([{ observed_at_ts: NOW - strength_js_1.WEEK_SECONDS, weight: 1 }], "correlation", NOW);
        const two = (0, strength_js_1.computeStrength)([
            { observed_at_ts: NOW - strength_js_1.WEEK_SECONDS, weight: 1 },
            { observed_at_ts: NOW, weight: 2.5 },
        ], "correlation", NOW);
        assert.ok(two > one);
        assert.equal(one, (0, strength_js_1.computeStrength)([{ observed_at_ts: NOW - strength_js_1.WEEK_SECONDS, weight: 1 }], "correlation", NOW));
    });
    (0, node_test_1.it)("floors validated patterns at 0.5 while weak levels decay toward zero", () => {
        const ancient = NOW - 500 * strength_js_1.WEEK_SECONDS;
        assert.equal((0, strength_js_1.computeStrength)([{ observed_at_ts: ancient, weight: 1 }], "validated_pattern", NOW), 0.5);
        assert.ok((0, strength_js_1.computeStrength)([{ observed_at_ts: ancient, weight: 1 }], "correlation", NOW) < 0.01);
    });
    (0, node_test_1.it)("flips decay state exactly at the dormancy boundary", () => {
        assert.equal((0, strength_js_1.decayStateFor)(strength_js_1.DORMANCY_THRESHOLD - 0.01), "dormant");
        assert.equal((0, strength_js_1.decayStateFor)(strength_js_1.DORMANCY_THRESHOLD), "active");
    });
    (0, node_test_1.it)("ignores evidence without timestamps", () => {
        assert.equal((0, strength_js_1.computeStrength)([{ observed_at_ts: null, weight: 5 }], "correlation", NOW), 0);
    });
});
