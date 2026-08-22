import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeLocalConfig } from "../src/engine/local-config.js";

describe("local config merge writes", () => {
  it("preserves unrelated fields while using the persistent secure config lock", () => {
    const directory = mkdtempSync(join(tmpdir(), "daobrew-local-config-"));
    const configFile = join(directory, "config.json");
    try {
      writeFileSync(configFile, JSON.stringify({
        license_key: "existing-license",
        memory_project_paths: ["/tmp/project"],
      }));

      const merged = mergeLocalConfig({
        granola_api_token: "new-token",
        removed_value: undefined,
      }, configFile) as Record<string, unknown>;

      assert.equal(merged.license_key, "existing-license");
      assert.deepEqual(merged.memory_project_paths, ["/tmp/project"]);
      assert.equal(merged.granola_api_token, "new-token");
      assert.equal(Object.prototype.hasOwnProperty.call(merged, "removed_value"), false);
      assert.ok(existsSync(join(directory, "config.lock")));
      assert.equal(existsSync(`${configFile}.lock`), false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);

      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.deepEqual(persisted, merged);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
