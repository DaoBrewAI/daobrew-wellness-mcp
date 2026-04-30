import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";
import { handleToolCall, toolDefinitions } from "../src/tools.js";
import { save as savePrefs } from "../src/preferences.js";
import { clearSession } from "../src/session.js";
import * as cooldown from "../src/cooldown.js";

/**
 * End-to-end verification: exercises the full mock-mode flow
 * through the tool handler, covering all 6 tools and key guard paths.
 * Audio playback will fail in test (no audio files), so we verify the error status.
 */
describe("e2e mock-mode flow (6-tool surface)", () => {
  before(() => {
    savePrefs({ disabled: false, ambient_optin: false, headphones_trusted: true, voiceover: true, session_count: 0, preferred_volume: 0.3, cooldown_minutes: 30 });
    clearSession();
    cooldown.clearAll();
  });
  it("lists all 7 tool definitions (check, breathe, stop, history, status, settings, connect_watch)", () => {
    assert.strictEqual(toolDefinitions.length, 7);
    const names = toolDefinitions.map(t => t.name);
    assert.ok(names.includes("daobrew_check"));
    assert.ok(names.includes("daobrew_breathe"));
    assert.ok(names.includes("daobrew_stop"));
    assert.ok(names.includes("daobrew_history"));
    assert.ok(names.includes("daobrew_status"));
    assert.ok(names.includes("daobrew_settings"));
    assert.ok(names.includes("daobrew_connect_watch"));
  });

  it("daobrew_check returns content blocks (text-only when no session)", async () => {
    clearSession();
    const result = await handleToolCall("daobrew_check", { force_refresh: true }, true);
    assert.ok(result.__mcp_content__, "expected MCP content marker");
    assert.ok(Array.isArray(result.content));
    assert.ok(result.content.length >= 1);
    assert.strictEqual(result.content[0].type, "text");
  });

  it("daobrew_breathe rejects ambient without optin", async () => {
    savePrefs({ disabled: false, ambient_optin: false });
    const result = await handleToolCall("daobrew_breathe", {
      stress_pattern: "tension", mode: "ambient",
    }, true);
    assert.strictEqual(result.status, "requires_optin");
  });

  it("daobrew_stop returns no_active_session when idle", async () => {
    clearSession();
    const result = await handleToolCall("daobrew_stop", {}, true);
    assert.strictEqual(result.status, "no_active_session");
  });

  it("daobrew_status returns mock mode with preferences", async () => {
    const result = await handleToolCall("daobrew_status", {}, true);
    assert.strictEqual(result.mode, "mock");
    assert.ok(typeof result.preferences === "object");
    assert.ok(typeof result.headphones === "object");
    assert.ok(result.data_sources);
  });

  it("daobrew_settings updates preferences", async () => {
    const result = await handleToolCall("daobrew_settings", {
      preferred_volume: 0.7,
    }, true);
    assert.strictEqual(result.status, "updated");
    assert.strictEqual(result.preferences.preferred_volume, 0.7);
  });

  it("daobrew_connect_watch returns mock_mode in mock", async () => {
    const result = await handleToolCall("daobrew_connect_watch", {}, true);
    assert.strictEqual(result.status, "mock_mode");
    assert.ok(result.install_url);
  });

  it("daobrew_history returns entries", async () => {
    const result = await handleToolCall("daobrew_history", { days: 7 }, true);
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 3);
  });

  it("rejects invalid stress_pattern", async () => {
    await assert.rejects(
      () => handleToolCall("daobrew_breathe", { stress_pattern: "invalid" }, true),
      /Invalid stress_pattern/
    );
  });

  it("rejects unknown tool", async () => {
    await assert.rejects(
      () => handleToolCall("nonexistent_tool", {}, true),
      /Unknown tool/
    );
  });
});
