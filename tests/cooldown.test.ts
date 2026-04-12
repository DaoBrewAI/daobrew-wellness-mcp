import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { activate, isActive, remainingMinutes, clear, clearAll } from "../src/cooldown.js";

describe("cooldown", () => {
  beforeEach(() => { clearAll(); });

  it("ambient and ondemand are independent", () => {
    activate("ambient", 60000);
    assert.strictEqual(isActive("ambient"), true);
    assert.strictEqual(isActive("ondemand"), false);
  });

  it("remainingMinutes returns correct value", () => {
    activate("ondemand", 120000);
    const remaining = remainingMinutes("ondemand");
    assert.ok(remaining === 2, `Expected 2, got ${remaining}`);
    assert.strictEqual(remainingMinutes("ambient"), 0);
  });

  it("clear resets only the specified mode", () => {
    activate("ambient", 60000);
    activate("ondemand", 60000);
    clear("ambient");
    assert.strictEqual(isActive("ambient"), false);
    assert.strictEqual(isActive("ondemand"), true);
  });

  it("clearAll resets both modes", () => {
    activate("ambient", 60000);
    activate("ondemand", 60000);
    clearAll();
    assert.strictEqual(isActive("ambient"), false);
    assert.strictEqual(isActive("ondemand"), false);
  });
});
