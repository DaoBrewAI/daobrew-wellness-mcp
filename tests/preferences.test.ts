import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { load, save, incrementSessionCount } from "../src/preferences.js";

const PREFS_FILE = join(homedir(), ".daobrew", "prefs.json");

describe("preferences", () => {
  beforeEach(() => {
    if (existsSync(PREFS_FILE)) unlinkSync(PREFS_FILE);
  });

  it("load() returns defaults when no file exists", () => {
    const prefs = load();
    assert.strictEqual(prefs.ambient_optin, false);
    assert.strictEqual(prefs.preferred_volume, 0.3);
    assert.strictEqual(prefs.session_count, 0);
    assert.strictEqual(prefs.voiceover, true);
  });

  it("save() persists and load() reads back", () => {
    save({ ambient_optin: true, preferred_volume: 0.5 });
    const prefs = load();
    assert.strictEqual(prefs.ambient_optin, true);
    assert.strictEqual(prefs.preferred_volume, 0.5);
    assert.strictEqual(prefs.disabled, false);
  });

  it("incrementSessionCount auto-disables voiceover at 3", () => {
    save({ session_count: 0, voiceover: true });
    incrementSessionCount(); // 1
    assert.strictEqual(load().voiceover, true);
    incrementSessionCount(); // 2
    assert.strictEqual(load().voiceover, true);
    incrementSessionCount(); // 3
    assert.strictEqual(load().voiceover, false);
  });
});
