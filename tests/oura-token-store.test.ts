import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  compareAndSwapOuraRefresh,
  createAuthorizationGeneration,
  normalizeAuthorizationGeneration,
  ouraTokenLockPath,
  ouraTokenTemporaryPath,
  readOuraTokenFile,
  saveNewOuraAuthorization,
  StoredOuraToken,
} from "../src/health/oura-token-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; tokenFile: string } {
  const root = mkdtempSync(join(tmpdir(), "daobrew-oura-token-store-"));
  roots.push(root);
  const prefs = join(root, ".daobrew");
  mkdirSync(prefs, { mode: 0o700 });
  return { root, tokenFile: join(prefs, "oura-token.json") };
}

function token(
  access: string,
  refresh: string,
  generation?: string | number,
): StoredOuraToken {
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: 4_000_000_000_000,
    token_type: "Bearer",
    authorization_generation: generation,
    authorized_at: 1_750_000_000,
    saved_at: 1_750_000_000,
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Oura token store concurrency", () => {
  it("rejects an in-flight browser grant after OAuth application credentials change", async () => {
    const { tokenFile } = fixture();
    const old = await saveNewOuraAuthorization(tokenFile, token("access-old", "refresh-old"), {
      generation: () => "auth_old",
    });
    let credentialsStillMatch = false;

    await assert.rejects(
      saveNewOuraAuthorization(tokenFile, token("access-stale", "refresh-stale"), {
        generation: () => "auth_stale",
        validateBeforeSave: () => {
          assert.strictEqual(existsSync(ouraTokenLockPath(tokenFile)), true);
          if (!credentialsStillMatch) {
            throw new Error(
              "Oura application credentials changed while authorization was in progress. Start Connect again.",
            );
          }
        },
      }),
      /credentials changed while authorization was in progress/i,
    );

    assert.deepStrictEqual(readOuraTokenFile(tokenFile), old);
    assert.strictEqual(existsSync(ouraTokenLockPath(tokenFile)), false);
  });

  it("discards a stale refresh response after a concurrent browser authorization", async () => {
    const { tokenFile } = fixture();
    const old = await saveNewOuraAuthorization(tokenFile, token("access-old", "refresh-old"), {
      generation: () => "auth_old",
    });
    const network = deferred();
    const refresh = (async () => {
      await network.promise;
      return compareAndSwapOuraRefresh(
        tokenFile,
        old,
        token("access-stale", "refresh-stale", old.authorization_generation),
      );
    })();

    const newest = await saveNewOuraAuthorization(tokenFile, token("access-new", "refresh-new"), {
      generation: () => "auth_new",
    });
    network.resolve();
    const result = await refresh;

    assert.strictEqual(result.saved, false);
    assert.deepStrictEqual(result.token, newest);
    assert.deepStrictEqual(readOuraTokenFile(tokenFile), newest);
  });

  it("fails closed when credentials deletion wins against an in-flight refresh", async () => {
    const { tokenFile } = fixture();
    const old = await saveNewOuraAuthorization(tokenFile, token("access-old", "refresh-old"), {
      generation: () => "auth_old",
    });
    const network = deferred();
    const refresh = (async () => {
      await network.promise;
      return compareAndSwapOuraRefresh(
        tokenFile,
        old,
        token("access-stale", "refresh-stale", old.authorization_generation),
      );
    })();

    unlinkSync(tokenFile);
    network.resolve();
    await assert.rejects(refresh, /authorization changed during token refresh/i);
    assert.strictEqual(existsSync(tokenFile), false);
  });

  it("serializes concurrent same-process grants and leaves no temporary files", async () => {
    const { root, tokenFile } = fixture();
    const [first, second] = await Promise.all([
      saveNewOuraAuthorization(tokenFile, token("access-1", "refresh-1"), {
        generation: () => "auth_first",
      }),
      saveNewOuraAuthorization(tokenFile, token("access-2", "refresh-2"), {
        generation: () => "auth_second",
      }),
    ]);
    assert.notStrictEqual(first.authorization_generation, second.authorization_generation);
    assert.ok(["auth_first", "auth_second"].includes(
      String(readOuraTokenFile(tokenFile)?.authorization_generation),
    ));
    assert.deepStrictEqual(
      readdirSync(join(root, ".daobrew")).filter((name) => name.includes(".tmp-")),
      [],
    );
    assert.strictEqual(statSync(join(root, ".daobrew")).mode & 0o777, 0o700);
    assert.strictEqual(statSync(tokenFile).mode & 0o777, 0o600);
    assert.strictEqual(existsSync(ouraTokenLockPath(tokenFile)), false);
  });

  it("uses a random nonce beyond PID for each temporary path", () => {
    const path = "/tmp/oura-token.json";
    assert.notStrictEqual(
      ouraTokenTemporaryPath(path, 42, "nonce-a"),
      ouraTokenTemporaryPath(path, 42, "nonce-b"),
    );
  });

  it("CAS-refreshes legacy tokens without inventing a reconnect generation", async () => {
    const { tokenFile } = fixture();
    const legacy = token("legacy-access", "legacy-refresh");
    writeFileSync(tokenFile, JSON.stringify(legacy), { mode: 0o600 });
    const refreshed = token("next-access", "next-refresh");

    const result = await compareAndSwapOuraRefresh(tokenFile, legacy, refreshed);

    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.token.authorization_generation, undefined);
    const stored = readOuraTokenFile(tokenFile);
    assert.strictEqual(stored?.access_token, refreshed.access_token);
    assert.strictEqual(stored?.refresh_token, refreshed.refresh_token);
    assert.strictEqual(stored?.authorization_generation, undefined);
  });

  it("includes oauth_mode in the refresh snapshot so authorities cannot cross", async () => {
    const { tokenFile } = fixture();
    const personal = {
      ...token("same-access", "same-refresh", "auth_same"),
      oauth_mode: "personal" as const,
    };
    writeFileSync(tokenFile, JSON.stringify(personal), { mode: 0o600 });
    const staleManagedExpectation = {
      ...personal,
      oauth_mode: "managed" as const,
    };

    const result = await compareAndSwapOuraRefresh(
      tokenFile,
      staleManagedExpectation,
      { ...staleManagedExpectation, access_token: "stale-managed-access" },
    );

    assert.strictEqual(result.saved, false);
    assert.strictEqual(result.token.oauth_mode, "personal");
    assert.deepStrictEqual(readOuraTokenFile(tokenFile), personal);
  });

  it("rejects unknown oauth modes while preserving legacy missing-mode records", () => {
    const { tokenFile } = fixture();
    const legacy = token("legacy-access", "legacy-refresh");
    writeFileSync(tokenFile, JSON.stringify(legacy), { mode: 0o600 });
    const readableLegacy = readOuraTokenFile(tokenFile);
    assert.strictEqual(readableLegacy?.access_token, legacy.access_token);
    assert.strictEqual(readableLegacy?.oauth_mode, undefined);

    writeFileSync(tokenFile, JSON.stringify({ ...legacy, oauth_mode: "future-mode" }), { mode: 0o600 });
    assert.strictEqual(readOuraTokenFile(tokenFile), null);
  });

  it("keeps lock failures credential-free", async () => {
    const { tokenFile } = fixture();
    const lock = ouraTokenLockPath(tokenFile);
    writeFileSync(tokenFile, JSON.stringify(token("secret-access", "secret-refresh")), { mode: 0o600 });
    // A non-directory at the shared lock path makes acquisition fail without
    // ever including token material in the surfaced error.
    writeFileSync(lock, "occupied", { mode: 0o600 });
    chmodSync(lock, 0o600);
    await assert.rejects(
      saveNewOuraAuthorization(tokenFile, token("new-secret-access", "new-secret-refresh"), {
        timeoutMs: 0,
      }),
      (error: any) => {
        assert.doesNotMatch(error.message, /secret-access|secret-refresh|new-secret/i);
        return true;
      },
    );
  });
});

describe("Oura authorization generations", () => {
  it("uses collision-safe opaque values while accepting safe legacy numbers", () => {
    assert.notStrictEqual(
      createAuthorizationGeneration(() => "uuid-a"),
      createAuthorizationGeneration(() => "uuid-b"),
    );
    assert.strictEqual(normalizeAuthorizationGeneration(42), "42");
    assert.strictEqual(normalizeAuthorizationGeneration("auth_uuid-a"), "auth_uuid-a");
    assert.strictEqual(normalizeAuthorizationGeneration(true), undefined);
    assert.strictEqual(normalizeAuthorizationGeneration(Number.MAX_SAFE_INTEGER + 1), undefined);
  });
});
