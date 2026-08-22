import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  compareClaimLevels,
  gateThreadInfluence,
  influenceForClaim,
  lintCausalLanguage,
  mapGraphClaimLevel,
  promotedClaimLevel,
} from "../src/engine/memory/claims.js";
import { MemoryClaimLevel } from "../src/engine/memory/types.js";

describe("Layer 2 claim ladder", () => {
  it("maps graph claim levels onto the four-rung ladder", () => {
    assert.equal(mapGraphClaimLevel("source_backed_hypothesis_not_settled_causality"), "attribution_candidate");
    assert.equal(mapGraphClaimLevel("insufficient_evidence"), "correlation");
    assert.equal(mapGraphClaimLevel(undefined), "correlation");
    assert.equal(mapGraphClaimLevel("garbage"), "correlation");
  });

  it("gates influence per the design ladder", () => {
    assert.equal(influenceForClaim("correlation"), "background_context");
    assert.equal(influenceForClaim("attribution_candidate"), "candidate_ranking");
    assert.equal(influenceForClaim("causal_hypothesis"), "recommendation");
    assert.equal(influenceForClaim("validated_pattern"), "personalization");
  });

  it("demotes memory-only threads to background context", () => {
    assert.equal(gateThreadInfluence("causal_hypothesis", ["user_insights"]), "background_context");
    assert.equal(gateThreadInfluence("causal_hypothesis", ["user_insights", "meeting_notes"]), "recommendation");
    assert.equal(gateThreadInfluence("attribution_candidate", []), "background_context");
  });

  it("lints causal language per claim level", () => {
    assert.ok(lintCausalLanguage("Late meetings cause poor sleep", "correlation").length > 0);
    assert.equal(lintCausalLanguage("Late meetings co-occur with poor sleep", "correlation").length, 0);
    assert.ok(lintCausalLanguage("This proves meetings ruin sleep", "causal_hypothesis").length > 0);
    assert.equal(lintCausalLanguage("Late meetings may contribute to poor sleep", "causal_hypothesis").length, 0);
  });

  it("compares claim levels by ladder rank", () => {
    assert.ok(compareClaimLevels("validated_pattern", "correlation") > 0);
    assert.equal(compareClaimLevels("correlation", "correlation"), 0);
  });
});

describe("promotedClaimLevel (D1 thresholds, pure re-evaluation)", () => {
  // [base, confirmations, contradictions, expected]
  const table: Array<[MemoryClaimLevel, number, number, MemoryClaimLevel]> = [
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
    it(`(${base}, C=${confirmations}, X=${contradictions}) -> ${expected}`, () => {
      assert.equal(promotedClaimLevel(base, confirmations, contradictions), expected);
    });
  }
});
