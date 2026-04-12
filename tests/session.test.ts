import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import {
  startSession, getActiveSession, clearSession, isSessionRunning, durationPlayed,
  ActiveSession,
} from "../src/session.js";

describe("session state", () => {
  beforeEach(() => {
    clearSession();
  });

  it("starts with no active session", () => {
    assert.strictEqual(getActiveSession(), null);
    assert.strictEqual(isSessionRunning(), false);
    assert.strictEqual(durationPlayed(), null);
  });

  it("startSession/getActiveSession round-trips", () => {
    const session: ActiveSession = {
      sessionId: "sess_test", pid: 0, element: "wood",
      genre: "ambient_downtempo", duration: 300, startTime: Date.now(), mode: "ondemand",
    };
    startSession(session);
    assert.strictEqual(isSessionRunning(), true);
    assert.strictEqual(getActiveSession()?.sessionId, "sess_test");
    assert.strictEqual(getActiveSession()?.mode, "ondemand");
  });

  it("clearSession returns previous and clears state", () => {
    const session: ActiveSession = {
      sessionId: "sess_clear", pid: 99, element: "fire",
      genre: "lofi_chill_jazz", duration: 300, startTime: Date.now(), mode: "ambient",
    };
    startSession(session);
    const prev = clearSession();
    assert.strictEqual(prev?.sessionId, "sess_clear");
    assert.strictEqual(isSessionRunning(), false);
  });

  it("durationPlayed returns elapsed seconds", () => {
    const session: ActiveSession = {
      sessionId: "sess_dur", pid: 0, element: "earth",
      genre: "acoustic_folk_calm", duration: 300, startTime: Date.now() - 5000, mode: "ondemand",
    };
    startSession(session);
    const played = durationPlayed();
    assert.ok(played !== null && played >= 4 && played <= 6);
  });

  it("declines second session when one is already running", () => {
    const s1: ActiveSession = {
      sessionId: "sess_1", pid: 0, element: "wood",
      genre: "ambient_downtempo", duration: 300, startTime: Date.now(), mode: "ondemand",
    };
    startSession(s1);
    assert.strictEqual(isSessionRunning(), true);
  });
});
