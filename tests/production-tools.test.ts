import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  handleToolCall,
  toolDefinitions,
} from "../src/tools.js";

describe("production MCP tool router", () => {
  it("keeps simulation out of the production tool surface", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "tools.ts"),
      "utf8",
    );
    assert.match(source, /isMock: boolean/);
    assert.doesNotMatch(
      JSON.stringify(toolDefinitions),
      /mock|simulat|showcase/i,
    );
  });

  it("fails closed when an authenticated provider client is absent", async () => {
    await assert.rejects(
      () => handleToolCall(
        "daobrew_check",
        { force_refresh: true },
        false,
        undefined,
        false,
        undefined,
      ),
      /not initialized|sign in to DaoBrew/i,
    );
  });
});
