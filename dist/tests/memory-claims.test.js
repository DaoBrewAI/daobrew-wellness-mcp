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
const claims_js_1 = require("../src/engine/memory/claims.js");
(0, node_test_1.describe)("Layer 2 claim ladder", () => {
    (0, node_test_1.it)("maps graph claim levels onto the four-rung ladder", () => {
        assert.equal((0, claims_js_1.mapGraphClaimLevel)("source_backed_hypothesis_not_settled_causality"), "attribution_candidate");
        assert.equal((0, claims_js_1.mapGraphClaimLevel)("insufficient_evidence"), "correlation");
        assert.equal((0, claims_js_1.mapGraphClaimLevel)(undefined), "correlation");
        assert.equal((0, claims_js_1.mapGraphClaimLevel)("garbage"), "correlation");
    });
    (0, node_test_1.it)("gates influence per the design ladder", () => {
        assert.equal((0, claims_js_1.influenceForClaim)("correlation"), "background_context");
        assert.equal((0, claims_js_1.influenceForClaim)("attribution_candidate"), "candidate_ranking");
        assert.equal((0, claims_js_1.influenceForClaim)("causal_hypothesis"), "recommendation");
        assert.equal((0, claims_js_1.influenceForClaim)("validated_pattern"), "personalization");
    });
    (0, node_test_1.it)("demotes memory-only threads to background context", () => {
        assert.equal((0, claims_js_1.gateThreadInfluence)("causal_hypothesis", ["user_insights"]), "background_context");
        assert.equal((0, claims_js_1.gateThreadInfluence)("causal_hypothesis", ["user_insights", "meeting_notes"]), "recommendation");
        assert.equal((0, claims_js_1.gateThreadInfluence)("attribution_candidate", []), "background_context");
    });
    (0, node_test_1.it)("lints causal language per claim level", () => {
        assert.ok((0, claims_js_1.lintCausalLanguage)("Late meetings cause poor sleep", "correlation").length > 0);
        assert.equal((0, claims_js_1.lintCausalLanguage)("Late meetings co-occur with poor sleep", "correlation").length, 0);
        assert.ok((0, claims_js_1.lintCausalLanguage)("This proves meetings ruin sleep", "causal_hypothesis").length > 0);
        assert.equal((0, claims_js_1.lintCausalLanguage)("Late meetings may contribute to poor sleep", "causal_hypothesis").length, 0);
    });
    (0, node_test_1.it)("compares claim levels by ladder rank", () => {
        assert.ok((0, claims_js_1.compareClaimLevels)("validated_pattern", "correlation") > 0);
        assert.equal((0, claims_js_1.compareClaimLevels)("correlation", "correlation"), 0);
    });
});
(0, node_test_1.describe)("promotedClaimLevel (D1 thresholds, pure re-evaluation)", () => {
    // [base, confirmations, contradictions, expected]
    const table = [
        // correlation base never promotes, whatever the verdict mix
        ["correlation", 0, 0, "correlation"],
        ["correlation", 2, 0, "correlation"],
        ["correlation", 5, 0, "correlation"],
        ["correlation", 9, 1, "correlation"],
        // attribution_candidate ladder
        ["attribution_candidate", 0, 0, "attribution_candidate"],
        ["attribution_candidate", 1, 0, "attribution_candidate"],
        ["attribution_candidate", 2, 0, "causal_hypothesis"],
        ["attribution_candidate", 2, 1, "causal_hypothesis"],
        ["attribution_candidate", 4, 0, "causal_hypothesis"],
        ["attribution_candidate", 5, 0, "validated_pattern"],
        ["attribution_candidate", 9, 0, "validated_pattern"],
        // X>=1 blocks validated; X<=1 still allows hypothesis
        ["attribution_candidate", 5, 1, "causal_hypothesis"],
        ["attribution_candidate", 9, 1, "causal_hypothesis"],
        // X>=2 drops all the way back to base
        ["attribution_candidate", 2, 2, "attribution_candidate"],
        ["attribution_candidate", 9, 2, "attribution_candidate"],
        ["attribution_candidate", 0, 2, "attribution_candidate"],
        ["attribution_candidate", 1, 1, "attribution_candidate"],
        // higher bases: re-evaluated by the same rules
        ["causal_hypothesis", 5, 0, "validated_pattern"],
        ["causal_hypothesis", 2, 2, "causal_hypothesis"],
        ["causal_hypothesis", 0, 0, "causal_hypothesis"],
    ];
    for (const [base, confirmations, contradictions, expected] of table) {
        (0, node_test_1.it)(`(${base}, C=${confirmations}, X=${contradictions}) -> ${expected}`, () => {
            assert.equal((0, claims_js_1.promotedClaimLevel)(base, confirmations, contradictions), expected);
        });
    }
});
