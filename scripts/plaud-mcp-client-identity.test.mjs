import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs } from "./plaud-mcp-client.mjs";

test("Plaud Postgres import requires a canonical confirmed owner UUID", () => {
  assert.throws(
    () => parseArgs([
      "--export-snapshot", "/tmp/synthetic.json",
      "--import-postgres",
      "--user-id", "local",
    ]),
    /canonical UUID user id/,
  );
  const options = parseArgs([
    "--export-snapshot", "/tmp/synthetic.json",
    "--import-postgres",
    "--user-id", "12345678-1234-4123-8123-123456789abc",
  ]);
  assert.equal(options.userId, "12345678-1234-4123-8123-123456789ABC");
});
