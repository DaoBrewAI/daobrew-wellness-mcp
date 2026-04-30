import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { DaoBrewClient } from "../src/client.js";

describe("DaoBrewClient", () => {
  it("constructor sets defaults", () => {
    const client = new DaoBrewClient({ apiKey: "dbk_test123" });
    assert.ok(client);
  });

  it("constructor accepts custom baseUrl and timeout", () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:8000/api/v1",
      timeoutMs: 5000,
    });
    assert.ok(client);
  });

  it("getWellnessState rejects on network error", async () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:1", // Nothing listening
      timeoutMs: 1000,
    });
    await assert.rejects(
      () => client.getWellnessState(),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      }
    );
  });

  it("getElementDetail rejects on network error", async () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getElementDetail("wood"));
  });

  it("startSession rejects on network error", async () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.startSession("fire", "text"));
  });

  it("getSessionResult rejects on network error", async () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getSessionResult("sess_test"));
  });

  it("getSessionHistory rejects on network error", async () => {
    const client = new DaoBrewClient({
      apiKey: "dbk_test",
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getSessionHistory(7));
  });
});
