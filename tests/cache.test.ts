import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { get, set, invalidate, ageSeconds } from "../src/cache.js";

describe("cache", () => {
  beforeEach(() => {
    invalidate("test_key");
  });

  it("returns null for missing key", () => {
    assert.strictEqual(get("nonexistent"), null);
  });

  it("set/get round-trips with age_seconds", () => {
    set("test_key", { yin: 50, yang: 60 });
    const result = get<{ yin: number; yang: number }>("test_key");
    assert.ok(result !== null);
    assert.strictEqual(result.data.yin, 50);
    assert.ok(result.age_seconds >= 0 && result.age_seconds < 2);
  });

  it("invalidate removes entry", () => {
    set("test_key", "data");
    invalidate("test_key");
    assert.strictEqual(get("test_key"), null);
  });

  it("ageSeconds returns -1 for missing key", () => {
    assert.strictEqual(ageSeconds("missing"), -1);
  });
});
