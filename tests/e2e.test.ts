import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";
import { handleToolCall, toolDefinitions } from "../src/tools.js";
import { save as savePrefs } from "../src/preferences.js";
import { clearSession } from "../src/session.js";
import * as cooldown from "../src/cooldown.js";

/**
 * End-to-end verification: exercises the full mock-mode flow
 * through the tool handler, covering all 9 tools and key guard paths.
 * Audio playback will fail in test (no audio files), so we verify the error status.
 */
describe("e2e mock-mode flow", () => {
  before(() => {
    // Reset shared state before all e2e tests
    savePrefs({ disabled: false, ambient_optin: false, headphones_trusted: true, voiceover: true, session_count: 0, preferred_volume: 0.3, cooldown_minutes: 30 });
    clearSession();
    cooldown.clearAll();
  });
  it("lists all 9 tool definitions", () => {
    assert.strictEqual(toolDefinitions.length, 9);
    const names = toolDefinitions.map(t => t.name);
    assert.ok(names.includes("daobrew_get_wellness_state"));
    assert.ok(names.includes("daobrew_start_breathing_session"));
    assert.ok(names.includes("daobrew_stop_session"));
    assert.ok(names.includes("daobrew_status"));
    assert.ok(names.includes("daobrew_set_monitoring"));
    assert.ok(names.includes("daobrew_connect_source"));
  });

  it("get_wellness_state returns MCP schema with cache_age_seconds", async () => {
    const result = await handleToolCall("daobrew_get_wellness_state", { force_refresh: true }, true);
    assert.ok(typeof result.yin === "number");
    assert.ok(typeof result.yang === "number");
    assert.ok(typeof result.quadrant === "string");
    assert.strictEqual(result.cache_age_seconds, 0);
    assert.ok(Array.isArray(result.active_elements));
    assert.strictEqual(result.data_source, "mock");
  });

  it("get_element_detail returns valid detail", async () => {
    const result = await handleToolCall("daobrew_get_element_detail", { element: "fire" }, true);
    assert.strictEqual(result.element, "fire");
    assert.ok(typeof result.score === "number");
    assert.ok(typeof result.headline === "string");
    assert.ok(typeof result._warning === "string");
  });

  it("start_breathing_session plays audio or errors when no files", async () => {
    savePrefs({ disabled: false, ambient_optin: false, headphones_trusted: true });
    cooldown.clearAll();
    clearSession();
    const result = await handleToolCall("daobrew_start_breathing_session", {
      element: "wood", mode: "ondemand",
    }, true);
    // With audio files: status=started+audio_status=playing; without: status=audio_error
    assert.ok(
      result.audio_status === "playing" || result.status === "audio_error",
      `Expected playing or audio_error, got status=${result.status}, audio_status=${result.audio_status}`
    );
    // Clean up if session started
    if (result.audio_status === "playing") {
      await handleToolCall("daobrew_stop_session", {}, true);
    }
  });

  it("start_breathing_session rejects ambient without optin", async () => {
    savePrefs({ disabled: false, ambient_optin: false });
    const result = await handleToolCall("daobrew_start_breathing_session", {
      element: "wood", mode: "ambient",
    }, true);
    assert.strictEqual(result.status, "requires_optin");
  });

  it("stop_session returns no_active_session when idle", async () => {
    clearSession();
    const result = await handleToolCall("daobrew_stop_session", {}, true);
    assert.strictEqual(result.status, "no_active_session");
  });

  it("status returns mock mode with preferences", async () => {
    const result = await handleToolCall("daobrew_status", {}, true);
    assert.strictEqual(result.mode, "mock");
    assert.ok(typeof result.preferences === "object");
    assert.ok(typeof result.headphones === "object");
    assert.ok(result.data_sources);
  });

  it("set_monitoring updates preferences", async () => {
    const result = await handleToolCall("daobrew_set_monitoring", {
      preferred_volume: 0.7,
    }, true);
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.preferences.preferred_volume, 0.7);
  });

  it("connect_source apple_watch returns mock_mode in mock", async () => {
    const result = await handleToolCall("daobrew_connect_source", {
      source: "apple_watch",
    }, true);
    assert.strictEqual(result.status, "mock_mode");
    assert.ok(result.install_url);
  });

  it("connect_source oura returns error without client ID", async () => {
    // Temporarily clear env var to ensure no client ID is available
    const origEnv = process.env.DAOBREW_OURA_CLIENT_ID;
    delete process.env.DAOBREW_OURA_CLIENT_ID;
    // handleToolCall in mock mode should not read config file for oura
    // Pass isMock=true and no client — should return error
    const { handleToolCall: handle } = await import("../src/tools.js");
    const result = await handle("daobrew_connect_source", {
      source: "oura",
    }, true);
    // Restore
    if (origEnv) process.env.DAOBREW_OURA_CLIENT_ID = origEnv;
    assert.strictEqual(result.status, "error");
  });

  it("get_session_result returns mock data", async () => {
    const { mockStartSession } = await import("../src/mock.js");
    const session = mockStartSession("earth", "audio");
    const result = await handleToolCall("daobrew_get_session_result", {
      session_id: session.session_id,
    }, true);
    assert.strictEqual(result.completed, true);
    assert.ok(result.summary.includes("[SIMULATED]"));
  });

  it("get_session_history returns entries", async () => {
    const result = await handleToolCall("daobrew_get_session_history", { days: 7 }, true);
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 3);
  });

  it("rejects invalid element", async () => {
    await assert.rejects(
      () => handleToolCall("daobrew_get_element_detail", { element: "invalid" }, true),
      /Invalid element/
    );
  });

  it("rejects unknown tool", async () => {
    await assert.rejects(
      () => handleToolCall("nonexistent_tool", {}, true),
      /Unknown tool/
    );
  });
});
