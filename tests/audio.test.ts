import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { generateTextBreathingScript, stopPlayback, PlaybackResult } from "../src/audio.js";
import { Element } from "../src/types.js";

describe("generateTextBreathingScript", () => {
  it("generates correct cycle count and format", () => {
    const script = generateTextBreathingScript("wood", 300, 6);
    assert.ok(script.includes("Wood"));
    assert.ok(script.includes("Liver"));
    assert.ok(script.includes("Cycle 1/"));
    assert.ok(script.includes("Inhale..."));
    assert.ok(script.includes("Exhale slowly..."));
    assert.ok(script.includes("daobrew_get_session_result"));
  });

  it("shows max 6 cycles with ellipsis", () => {
    const script = generateTextBreathingScript("fire", 600, 6);
    assert.ok(script.includes("Cycle 6/"));
    assert.ok(script.includes("more cycles"));
    assert.ok(!script.includes("Cycle 7/"));
  });

  it("handles each element", () => {
    const elements: Element[] = ["wood", "fire", "earth", "metal", "water"];
    for (const el of elements) {
      const script = generateTextBreathingScript(el, 300, 6);
      assert.ok(script.length > 50, `${el} script too short`);
    }
  });
});

describe("stopPlayback", () => {
  it("returns false when nothing is playing", () => {
    assert.strictEqual(stopPlayback(), false);
  });
});
