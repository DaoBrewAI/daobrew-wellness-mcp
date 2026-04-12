import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  mockWellnessState, mockElementDetail, mockStartSession,
  mockSessionResult, mockSessionHistory, _resetWellnessCallCount,
} from "../src/mock.js";
import { Element, ELEMENT_GENRES, ELEMENT_LABELS, ELEMENT_ORGANS } from "../src/types.js";

const ELEMENTS: Element[] = ["wood", "fire", "earth", "metal", "water"];
const QUADRANTS = ["peak", "pushing_it", "recharging", "burnout"];

describe("daobrew_get_wellness_state", () => {
  it("returns all required fields with correct types", () => {
    const state = mockWellnessState();
    assert.ok(typeof state.yin === "number" && state.yin >= 0 && state.yin <= 100);
    assert.ok(typeof state.yang === "number" && state.yang >= 0 && state.yang <= 100);
    assert.ok(QUADRANTS.includes(state.quadrant));
    assert.ok(typeof state.quadrant_label === "string" && state.quadrant_label.length > 0);
    assert.ok(typeof state.quadrant_description === "string" && state.quadrant_description.length > 0);
    assert.ok(typeof state.yin_label === "string" && state.yin_label.length > 0);
    assert.ok(typeof state.yang_label === "string" && state.yang_label.length > 0);
    assert.ok(Array.isArray(state.active_elements));
    ELEMENTS.forEach(e => assert.ok(typeof state.element_scores[e] === "number"));
    assert.ok(typeof state.top_signal === "string");
    assert.ok(typeof state.recommendation === "string");
    assert.strictEqual(state.data_source, "mock");
    assert.ok(typeof state._warning === "string" && state._warning!.length > 0);
    assert.ok(!isNaN(Date.parse(state.last_updated)));  // valid ISO 8601
  });

  it("quadrant matches yin/yang thresholds", () => {
    for (let i = 0; i < 20; i++) {
      const state = mockWellnessState();
      if (state.yin >= 50 && state.yang >= 50) assert.strictEqual(state.quadrant, "peak");
      if (state.yin < 50 && state.yang >= 50) assert.strictEqual(state.quadrant, "pushing_it");
      if (state.yin >= 50 && state.yang < 50) assert.strictEqual(state.quadrant, "recharging");
      if (state.yin < 50 && state.yang < 50) assert.strictEqual(state.quadrant, "burnout");
    }
  });

  it("active_elements matches elements with score >= 50", () => {
    for (let i = 0; i < 10; i++) {
      const state = mockWellnessState();
      const expected = ELEMENTS.filter(e => state.element_scores[e] >= 50);
      assert.deepStrictEqual(state.active_elements.sort(), expected.sort());
    }
  });

  it("cycles through different quadrants across calls", () => {
    const quadrants = new Set<string>();
    for (let i = 0; i < 12; i++) quadrants.add(mockWellnessState().quadrant);
    assert.ok(quadrants.size >= 2, `Expected >= 2 quadrants, got ${quadrants.size}`);
  });
});

describe("daobrew_get_element_detail", () => {
  ELEMENTS.forEach(element => {
    it(`returns valid detail for ${element}`, () => {
      const detail = mockElementDetail(element);
      assert.strictEqual(detail.element, element);
      assert.strictEqual(detail.label, `${ELEMENT_LABELS[element]} · ${ELEMENT_ORGANS[element]}`);
      assert.strictEqual(detail.intervention.genre, ELEMENT_GENRES[element]);
      assert.strictEqual(detail.intervention.type, "breathing");
      assert.strictEqual(detail.intervention.breathing_rate_bpm, 6.0);
      assert.ok(detail.evidence.length > 0);
      assert.ok(typeof detail.headline === "string");
      assert.ok(typeof detail.why_this_practice === "string");
    });
  });
});

describe("daobrew_start_breathing_session", () => {
  it("audio tier returns valid session", () => {
    const session = mockStartSession("wood", "audio");
    assert.strictEqual(session.status, "started");
    assert.ok(session.session_id.startsWith("sess_"));
    assert.strictEqual(session.element, "wood");
    assert.strictEqual(session.genre, "ambient_downtempo");
    assert.strictEqual(session.tier, "audio");
  });

  it("different elements return correct genres", () => {
    const session = mockStartSession("fire", "audio");
    assert.strictEqual(session.status, "started");
    assert.strictEqual(session.genre, "lofi_chill_jazz");
  });
});

describe("daobrew_get_session_result", () => {
  it("returns simulated result with null biometrics", () => {
    const session = mockStartSession("earth", "audio");
    const result = mockSessionResult(session.session_id);
    assert.strictEqual(result.completed, true);
    assert.strictEqual(result.hrv_before, null);
    assert.strictEqual(result.hrv_after, null);
    assert.strictEqual(result.hrv_change_pct, null);
    assert.strictEqual(result.hr_before, null);
    assert.strictEqual(result.hr_after, null);
    assert.ok(typeof result.summary === "string" && result.summary.includes("SIMULATED"));
  });
});

describe("daobrew_get_session_history", () => {
  it("returns sorted entries within date range", () => {
    const entries = mockSessionHistory(7);
    assert.ok(entries.length >= 3 && entries.length <= 14);
    for (let i = 1; i < entries.length; i++) {
      assert.ok(new Date(entries[i-1].timestamp) >= new Date(entries[i].timestamp), "not sorted desc");
    }
    entries.forEach(e => {
      assert.ok(ELEMENTS.includes(e.element as Element));
      assert.ok(e.session_id.length > 0);
      assert.ok(typeof e.hrv_change_pct === "number");
    });
  });
});

describe("mock first call always stressed", () => {
  it("first mockWellnessState() call has active_elements.length > 0", () => {
    _resetWellnessCallCount();
    const state = mockWellnessState();
    assert.ok(state.active_elements.length > 0, "First call should always be stressed");
  });
});

describe("mock demo mode", () => {
  it("isDemo=true always produces stressed output", () => {
    _resetWellnessCallCount();
    for (let i = 0; i < 5; i++) {
      const state = mockWellnessState(true);
      assert.ok(state.active_elements.length > 0, `Demo call ${i + 1} should be stressed`);
    }
  });
});

describe("mock session result labeled", () => {
  it("summary contains [SIMULATED]", () => {
    const session = mockStartSession("earth", "audio");
    const result = mockSessionResult(session.session_id);
    assert.ok(result.summary.includes("[SIMULATED]"), `Expected [SIMULATED] in summary, got: ${result.summary.substring(0, 30)}`);
  });
});

describe("daobrew_stop_session", () => {
  it("returns no_active_session when nothing playing", async () => {
    const { handleToolCall } = await import("../src/tools.js");
    const result = await handleToolCall("daobrew_stop_session", {}, true);
    assert.strictEqual(result.status, "no_active_session");
    assert.strictEqual(result.duration_played, null);
  });
});

describe("get_wellness_state caching", () => {
  it("returns cache_age_seconds = 0 on first call", async () => {
    const { handleToolCall } = await import("../src/tools.js");
    const result = await handleToolCall("daobrew_get_wellness_state", { force_refresh: true }, true);
    assert.strictEqual(result.cache_age_seconds, 0);
  });

  it("returns cached data on second call without force_refresh", async () => {
    const { handleToolCall } = await import("../src/tools.js");
    const r1 = await handleToolCall("daobrew_get_wellness_state", { force_refresh: true }, true);
    const r2 = await handleToolCall("daobrew_get_wellness_state", {}, true);
    assert.ok(r2.cache_age_seconds >= 0);
    assert.strictEqual(r2.yin, r1.yin);
    assert.strictEqual(r2.yang, r1.yang);
  });
});

describe("start_breathing_session guards", () => {
  it("rejects ambient mode without optin", async () => {
    const { save } = await import("../src/preferences.js");
    save({ disabled: false, ambient_optin: false });
    const { handleToolCall } = await import("../src/tools.js");
    const result = await handleToolCall("daobrew_start_breathing_session", { element: "wood", mode: "ambient" }, true);
    assert.strictEqual(result.status, "requires_optin");
  });
});
