import { describe, it, beforeEach, after } from "node:test";
import * as assert from "node:assert/strict";
import { handleToolCall } from "../src/tools.js";
import { save as savePrefs } from "../src/preferences.js";
import { startSession, clearSession } from "../src/session.js";
import * as cooldown from "../src/cooldown.js";

// Restore prefs to defaults after all tests in this file
after(() => {
  savePrefs({ disabled: false, ambient_optin: false, preferred_volume: 0.3, cooldown_minutes: 30, headphones_trusted: false, voiceover: true, session_count: 0 });
  clearSession();
  cooldown.clearAll();
});

describe("daobrew_breathe guard: disabled", () => {
  beforeEach(() => {
    savePrefs({ disabled: false, ambient_optin: false });
    clearSession();
    cooldown.clearAll();
  });

  it("rejects when globally disabled", async () => {
    savePrefs({ disabled: true });
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ondemand",
    }, true);
    assert.strictEqual(result.status, "disabled");
  });
});

describe("daobrew_breathe guard: session_active", () => {
  beforeEach(() => {
    savePrefs({ disabled: false, ambient_optin: true });
    clearSession();
    cooldown.clearAll();
  });

  it("rejects when a session is already running", async () => {
    startSession({
      sessionId: "sess_guard_test", pid: 0, element: "fire",
      genre: "lofi_chill_jazz", duration: 300, startTime: Date.now(), mode: "ondemand",
    });
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ondemand",
    }, true);
    assert.strictEqual(result.status, "session_active");
    clearSession();
  });
});

describe("daobrew_breathe guard: cooldown", () => {
  beforeEach(() => {
    savePrefs({ disabled: false, ambient_optin: true, headphones_trusted: true });
    clearSession();
    cooldown.clearAll();
  });

  it("rejects when cooldown is active", async () => {
    cooldown.activate("ondemand", 60000);
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ondemand",
    }, true);
    assert.strictEqual(result.status, "cooldown");
    assert.ok(result.remaining_minutes > 0);
    cooldown.clearAll();
  });

  it("force=true bypasses cooldown", async () => {
    cooldown.activate("ondemand", 60000);
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ondemand", force: true,
    }, true);
    assert.ok(result.status !== "cooldown", `Expected non-cooldown status, got ${result.status}`);
    cooldown.clearAll();
  });
});

describe("daobrew_breathe guard: ambient requires optin", () => {
  beforeEach(() => {
    savePrefs({ disabled: false, ambient_optin: false, headphones_trusted: true });
    clearSession();
    cooldown.clearAll();
  });

  it("rejects ambient without optin", async () => {
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ambient",
    }, true);
    assert.strictEqual(result.status, "requires_optin");
  });

  it("accepts ambient with optin (audio_error in test env)", async () => {
    savePrefs({ ambient_optin: true, headphones_trusted: true });
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "depletion", mode: "ambient",
    }, true);
    assert.ok(result.status !== "requires_optin", `Expected non-requires_optin, got ${result.status}`);
    cooldown.clearAll();
  });
});

describe("daobrew_breathe audio error", () => {
  beforeEach(() => {
    savePrefs({ disabled: false, headphones_trusted: true });
    clearSession();
    cooldown.clearAll();
  });

  it("attempts audio playback (playing or error depending on files)", async () => {
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "constriction", mode: "ondemand",
    }, true);
    assert.ok(
      result.audio_status === "playing" || result.status === "audio_error",
      `Expected playing or audio_error, got status=${result.status}`,
    );
    if (result.audio_status === "playing") {
      await handleToolCall("daobrew_stop", {}, true);
    }
    clearSession();
    cooldown.clearAll();
  });
});

describe("daobrew_settings validation", () => {
  it("clamps volume to 0-1 range", async () => {
    const result = await handleToolCall("daobrew_settings", {
      preferred_volume: 5.0,
    }, true);
    assert.strictEqual(result.preferences.preferred_volume, 1.0);
  });

  it("clamps negative volume to 0", async () => {
    const result = await handleToolCall("daobrew_settings", {
      preferred_volume: -1,
    }, true);
    assert.strictEqual(result.preferences.preferred_volume, 0);
  });

  it("clamps cooldown_minutes minimum to 1", async () => {
    const result = await handleToolCall("daobrew_settings", {
      cooldown_minutes: -5,
    }, true);
    assert.strictEqual(result.preferences.cooldown_minutes, 1);
  });

  it("sets ambient_optin_date when enabling ambient", async () => {
    const result = await handleToolCall("daobrew_settings", {
      ambient_optin: true,
    }, true);
    assert.ok(result.preferences.ambient_optin_date);
    assert.ok(!isNaN(Date.parse(result.preferences.ambient_optin_date)));
  });
});
