import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLIENT_SCRIPT = join(__dirname, "..", "..", "scripts", "granola-mcp-client.mjs");

// --non-interactive is the daemon/headless contract: when a login would be
// required (no valid cached token), the client must FAIL FAST with a non-zero
// exit instead of spinning up the OAuth callback server and hanging forever.
// A short subprocess timeout is the assertion that it never blocks on that
// server: if getToken fell through to login(), the callback server would keep
// the process alive past the timeout and execFileSync would kill it with a
// signal (status null) instead of the expected clean non-zero exit.
describe("granola-mcp-client --non-interactive", () => {
  it("fails fast (non-zero exit, no login) when no cached token exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "granola-mcp-noninteractive-"));
    const tokenFile = join(dir, "does-not-exist-token.json");
    let threw = false;
    try {
      execFileSync(
        process.execPath,
        [CLIENT_SCRIPT, "--list-tools", "--non-interactive", "--token-file", tokenFile],
        { encoding: "utf-8", timeout: 8000, stdio: "pipe" },
      );
    } catch (err: any) {
      threw = true;
      // Clean non-zero exit (numeric status), NOT a timeout kill (signal set).
      assert.strictEqual(err.signal, null, `expected clean non-zero exit, got signal ${err.signal}`);
      assert.strictEqual(typeof err.status, "number");
      assert.notStrictEqual(err.status, 0);
      const stderr = String(err.stderr ?? "");
      assert.match(stderr, /non-interactive/i);
      assert.match(stderr, /login/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.ok(threw, "expected the client to exit non-zero under --non-interactive");
  });
});
