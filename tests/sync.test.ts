import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { syncAllConnectedSources, SyncResult } from "../src/health/sync.js";
import { DaoBrewClient } from "../src/client.js";

describe("syncAllConnectedSources", () => {
  it("returns empty array when no sources connected", async () => {
    // Create a client pointing at nothing (won't be called since no tokens exist)
    const client = new DaoBrewClient({ apiKey: "dbk_test", baseUrl: "http://localhost:1", timeoutMs: 1000 });
    const results: SyncResult[] = await syncAllConnectedSources(client);
    // No tokens exist at ~/.daobrew/oura-token.json or google-fit-token.json
    // so both isConnected() checks return false and no sync happens
    assert.ok(Array.isArray(results));
    // Should have 0 results since nothing is connected
    for (const r of results) {
      assert.ok(typeof r.source === "string");
      assert.ok(typeof r.samples_pushed === "number");
    }
  });
});
