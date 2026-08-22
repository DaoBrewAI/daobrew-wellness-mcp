import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  DORMANCY_THRESHOLD,
  HALF_LIFE_WEEKS,
  WEEK_SECONDS,
  computeStrength,
  decayStateFor,
} from "../src/engine/memory/strength.js";

const NOW = 1_800_000_000;

describe("Layer 2 strength math", () => {
  it("counts fresh evidence at full weight and halves it at one half-life", () => {
    assert.equal(computeStrength([{ observed_at_ts: NOW, weight: 1 }], "correlation", NOW), 1);
    const oneHalfLife = NOW - HALF_LIFE_WEEKS.correlation * WEEK_SECONDS;
    const s = computeStrength([{ observed_at_ts: oneHalfLife, weight: 1 }], "correlation", NOW);
    assert.ok(Math.abs(s - 0.5) < 0.001);
  });

  it("reinforces with more evidence and recomputes idempotently", () => {
    const one = computeStrength([{ observed_at_ts: NOW - WEEK_SECONDS, weight: 1 }], "correlation", NOW);
    const two = computeStrength(
      [
        { observed_at_ts: NOW - WEEK_SECONDS, weight: 1 },
        { observed_at_ts: NOW, weight: 2.5 },
      ],
      "correlation",
      NOW,
    );
    assert.ok(two > one);
    assert.equal(one, computeStrength([{ observed_at_ts: NOW - WEEK_SECONDS, weight: 1 }], "correlation", NOW));
  });

  it("floors validated patterns at 0.5 while weak levels decay toward zero", () => {
    const ancient = NOW - 500 * WEEK_SECONDS;
    assert.equal(computeStrength([{ observed_at_ts: ancient, weight: 1 }], "validated_pattern", NOW), 0.5);
    assert.ok(computeStrength([{ observed_at_ts: ancient, weight: 1 }], "correlation", NOW) < 0.01);
  });

  it("flips decay state exactly at the dormancy boundary", () => {
    assert.equal(decayStateFor(DORMANCY_THRESHOLD - 0.01), "dormant");
    assert.equal(decayStateFor(DORMANCY_THRESHOLD), "active");
  });

  it("ignores evidence without timestamps", () => {
    assert.equal(computeStrength([{ observed_at_ts: null, weight: 5 }], "correlation", NOW), 0);
  });
});
