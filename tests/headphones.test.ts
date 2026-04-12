import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { detectHeadphones, HeadphoneStatus } from "../src/headphones.js";

describe("headphones", () => {
  it("detectHeadphones() returns valid HeadphoneStatus shape", async () => {
    const status: HeadphoneStatus = await detectHeadphones();
    assert.strictEqual(typeof status.connected, "boolean");
    assert.ok(["switchaudio", "system_profiler", "pactl", "none"].includes(status.detection_method));
    assert.ok(status.device === null || typeof status.device === "string");
  });
});
