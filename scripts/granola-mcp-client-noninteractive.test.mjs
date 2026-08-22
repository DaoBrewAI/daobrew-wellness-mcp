import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GRANOLA_NON_INTERACTIVE_AUTH_ERROR_CODE,
  GRANOLA_NON_INTERACTIVE_AUTH_ERROR_MESSAGE,
  GRANOLA_TOKEN_MAX_BYTES,
  exportGranolaSnapshot,
  getToken,
  loadToken,
  parseArgs,
  saveToken,
  startCallbackServer,
  withMcp,
} from "./granola-mcp-client.mjs";
import {
  parseTaskMapRawGranolaSnapshot,
} from "../dist/src/engine/taskmap/native-meeting-extraction.js";

const CLIENT_PATH = fileURLToPath(new URL("./granola-mcp-client.mjs", import.meta.url));
const FIXED_NOW_MS = Date.parse("2026-07-29T20:00:00.000Z");

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "granola-noninteractive-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function optionsFor(tokenFile, overrides = {}) {
  return {
    login: false,
    nonInteractive: true,
    tokenFile,
    ...overrides,
  };
}

function assertStableAuthError(error, forbidden = []) {
  assert.equal(error?.code, GRANOLA_NON_INTERACTIVE_AUTH_ERROR_CODE);
  assert.equal(error?.message, GRANOLA_NON_INTERACTIVE_AUTH_ERROR_MESSAGE);
  for (const value of forbidden) {
    assert.doesNotMatch(error.message, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  return true;
}

test("snapshot export canonicalizes dates and drops only invalid notes", async (t) => {
  const root = tempRoot(t);
  const loneHighSurrogate = String.fromCharCode(0xd83d);
  const snapshotPath = join(root, "granola-mcp-snapshot.json");
  const listXml = `
    <meeting id="pdt" title="PDT meeting" date="Aug 3, 2026 7:30 PM PDT">
      <known_participants>Ada</known_participants>
    </meeting>
    <meeting id="iso" title="ISO meeting" date="2026-08-03T20:00:00.000Z">
      <known_participants>Lin</known_participants>
    </meeting>
    <meeting id="invalid" title="Invalid meeting" date="not-a-date">
      <known_participants>Grace</known_participants>
    </meeting>`;
  const detailsXml = `
    <meeting id="pdt" title="PDT ${loneHighSurrogate} meeting" date="Aug 3, 2026 7:30 PM PDT">
      <known_participants>Ada ${loneHighSurrogate}</known_participants>
      <summary>Review ${loneHighSurrogate} the launch plan.</summary>
    </meeting>
    <meeting id="iso" title="ISO meeting" date="2026-08-03T20:00:00.000Z">
      <known_participants>Lin</known_participants>
      <summary>Confirm the release checklist.</summary>
    </meeting>
    <meeting id="invalid" title="Invalid meeting" date="not-a-date">
      <known_participants>Grace</known_participants>
      <summary>This row must be dropped.</summary>
    </meeting>`;
  const response = await exportGranolaSnapshot(
    {
      exportSnapshot: snapshotPath,
      timeRange: "last_30_days",
      importPostgres: false,
      dryRun: false,
      synthesizeSpans: false,
      userId: null,
    },
    { access_token: "TEST" },
    "test-session",
    {
      mcpToolCallFn: async (_token, _sessionId, name) => ({
        content: [{ text: name === "list_meetings" ? listXml : detailsXml }],
      }),
      logFn: () => {},
    },
  );

  assert.equal(response.meeting_notes, 2);
  assert.equal(response.dropped_meeting_notes, 1);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  assert.deepEqual(
    snapshot.meeting_notes.map((note) => [note.id, note.created_at, note.occurred_at]),
    [
      ["pdt", "2026-08-04T02:30:00.000Z", "2026-08-04T02:30:00.000Z"],
      ["iso", "2026-08-03T20:00:00.000Z", "2026-08-03T20:00:00.000Z"],
    ],
  );
  assert.equal(snapshot.meeting_notes[0].title, "PDT � meeting");
  assert.deepEqual(snapshot.meeting_notes[0].participants, ["Ada �"]);
  assert.equal(snapshot.meeting_notes[0].summary, "Review � the launch plan.");
  assert.equal(snapshot.meeting_notes[0].body, "Review � the launch plan.");
  const parsed = parseTaskMapRawGranolaSnapshot(snapshot);
  assert.equal(parsed.notes.length, 2);
  assert.deepEqual(parsed.invalidRows, []);
});

test("interactive login defaults to an OS-assigned callback port", async () => {
  const options = parseArgs(["--login", "--no-open"]);
  assert.equal(options.port, 0);

  const fakeServer = {
    _handler: null,
    _error: null,
    on(_event, handler) { this._error = handler; return this; },
    listen(port, host, callback) {
      assert.equal(port, 0);
      assert.equal(host, "127.0.0.1");
      callback();
      return this;
    },
    address() { return { port: 49152 }; },
    close() {},
  };
  const callback = await startCallbackServer(
    options.port,
    "synthetic-state",
    (handler) => {
      fakeServer._handler = handler;
      return fakeServer;
    },
  );
  assert.equal(callback.port, 49152);
  callback.server.close();
});

test("Postgres import requires an explicit canonical owner UUID", () => {
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

async function assertRejectedBeforeAuthOrProvider(t, tokenContents, forbidden = []) {
  const root = tempRoot(t);
  const tokenFile = join(root, "private-token-cache.json");
  if (tokenContents !== null) writeFileSync(tokenFile, tokenContents, { mode: 0o600 });

  let loginCalls = 0;
  let providerCalls = 0;
  let refreshCalls = 0;
  await assert.rejects(
    withMcp(
      optionsFor(tokenFile),
      async () => {
        throw new Error("handler must not run");
      },
      {
        getTokenFn: (options) => getToken(options, {
          loginFn: async () => {
            loginCalls += 1;
            throw new Error("login must not run");
          },
        }),
        connectAndRunFn: async () => {
          providerCalls += 1;
          throw new Error("provider must not run");
        },
        refreshTokenFn: async () => {
          refreshCalls += 1;
          throw new Error("refresh must not run");
        },
      },
    ),
    (error) => assertStableAuthError(error, [tokenFile, ...forbidden]),
  );

  assert.equal(loginCalls, 0);
  assert.equal(providerCalls, 0);
  assert.equal(refreshCalls, 0);
}

test("missing token fails closed before login or provider calls", async (t) => {
  await assertRejectedBeforeAuthOrProvider(t, null);
});

test("invalid tokens fail closed before login or provider calls", async (t) => {
  await t.test("malformed token JSON", async (t) => {
    await assertRejectedBeforeAuthOrProvider(t, "{\"access_token\":\"RAW_SECRET\"", ["RAW_SECRET"]);
  });

  await t.test("missing access token", async (t) => {
    await assertRejectedBeforeAuthOrProvider(
      t,
      JSON.stringify({ refresh_token: "PRIVATE_REFRESH_TOKEN", saved_at: FIXED_NOW_MS / 1000, expires_in: 3600 }),
      ["PRIVATE_REFRESH_TOKEN"],
    );
  });
});

test("CLI emits one stable path-safe error without reaching the provider", (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "sensitive-token-location.json");
  const preloadFile = join(root, "deny-provider.mjs");
  writeFileSync(
    tokenFile,
    JSON.stringify({
      refresh_token: "CLI_PRIVATE_REFRESH_TOKEN",
    }),
    { mode: 0o600 },
  );
  writeFileSync(
    preloadFile,
    "globalThis.fetch = async () => { throw new Error('PROVIDER_CALL_SENTINEL'); };\n",
  );
  const symlinkPath = join(root, "granola-client-symlink.mjs");
  symlinkSync(CLIENT_PATH, symlinkPath);

  for (const invocationPath of [CLIENT_PATH, symlinkPath]) {
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(preloadFile).href,
        invocationPath,
        "--list-tools",
        "--non-interactive",
        "--token-file",
        tokenFile,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: root },
      },
    );

    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.deepEqual(JSON.parse(child.stderr), {
      error: GRANOLA_NON_INTERACTIVE_AUTH_ERROR_MESSAGE,
    });
    for (const forbidden of [
      tokenFile,
      "CLI_PRIVATE_REFRESH_TOKEN",
      "PROVIDER_CALL_SENTINEL",
    ]) {
      assert.doesNotMatch(child.stderr, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("valid cached token remains callable through the injected no-network seam", async (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "valid-token.json");
  writeFileSync(
    tokenFile,
    JSON.stringify({
      access_token: "VALID_TEST_ACCESS_TOKEN",
      saved_at: FIXED_NOW_MS / 1000,
      expires_in: 3600,
    }),
    { mode: 0o600 },
  );

  let providerCalls = 0;
  let refreshCalls = 0;
  const result = await withMcp(
    optionsFor(tokenFile),
    async ({ token, sessionId }) => ({
      accessToken: token.access_token,
      sessionId,
    }),
    {
      getTokenFn: (options) => getToken(options),
      connectAndRunFn: async (token, fn) => {
        providerCalls += 1;
        return fn({ token, sessionId: "injected-session" });
      },
      refreshTokenFn: async () => {
        refreshCalls += 1;
        throw new Error("refresh must not run");
      },
    },
  );

  assert.deepEqual(result, {
    accessToken: "VALID_TEST_ACCESS_TOKEN",
    sessionId: "injected-session",
  });
  assert.equal(providerCalls, 1);
  assert.equal(refreshCalls, 0);
});

test("token cache rejects symlinks, hard links, loose modes, and oversized files", (t) => {
  const root = tempRoot(t);
  const privateFile = join(root, "private.json");
  writeFileSync(privateFile, JSON.stringify({ access_token: "PRIVATE" }), { mode: 0o600 });
  assert.equal(loadToken(privateFile).access_token, "PRIVATE");

  const symlinkFile = join(root, "symlink.json");
  symlinkSync(privateFile, symlinkFile);
  assert.equal(loadToken(symlinkFile), null);

  const hardLinkFile = join(root, "hardlink.json");
  linkSync(privateFile, hardLinkFile);
  assert.equal(loadToken(privateFile), null);
  assert.equal(loadToken(hardLinkFile), null);
  rmSync(hardLinkFile);

  chmodSync(privateFile, 0o644);
  assert.equal(loadToken(privateFile), null);

  const oversized = join(root, "oversized.json");
  writeFileSync(oversized, Buffer.alloc(GRANOLA_TOKEN_MAX_BYTES + 1), { mode: 0o600 });
  assert.equal(loadToken(oversized), null);
});

test("token save atomically replaces only a private regular owner file", (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "token.json");
  saveToken(tokenFile, { access_token: "FIRST" });
  saveToken(tokenFile, { access_token: "SECOND" });
  assert.equal(JSON.parse(readFileSync(tokenFile, "utf8")).access_token, "SECOND");
  assert.equal(lstatSync(tokenFile).mode & 0o7777, 0o600);

  const victim = join(root, "victim.json");
  const unsafe = join(root, "unsafe.json");
  writeFileSync(victim, "DO_NOT_OVERWRITE", { mode: 0o600 });
  symlinkSync(victim, unsafe);
  assert.throws(
    () => saveToken(unsafe, { access_token: "ATTACK" }),
    /not a private owner file/,
  );
  assert.equal(readFileSync(victim, "utf8"), "DO_NOT_OVERWRITE");
  assert.equal(lstatSync(unsafe).isSymbolicLink(), true);
});

test("non-interactive cached token preserves 401 refresh without invoking login", async (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "refreshable-token.json");
  writeFileSync(
    tokenFile,
    JSON.stringify({
      access_token: "EXPIRED_CACHED_ACCESS_TOKEN",
      refresh_token: "CACHED_REFRESH_TOKEN",
      client_id: "cached-client",
      saved_at: FIXED_NOW_MS / 1000 - 7200,
      expires_in: 3600,
    }),
    { mode: 0o600 },
  );

  let loginCalls = 0;
  let providerCalls = 0;
  let refreshCalls = 0;
  const result = await withMcp(
    optionsFor(tokenFile),
    async ({ token }) => token.access_token,
    {
      getTokenFn: (options) => getToken(options, {
        loginFn: async () => {
          loginCalls += 1;
          throw new Error("login must not run");
        },
      }),
      connectAndRunFn: async (token, fn) => {
        providerCalls += 1;
        if (providerCalls === 1) {
          const unauthorized = new Error("synthetic unauthorized");
          unauthorized.status = 401;
          throw unauthorized;
        }
        return fn({ token, sessionId: "refreshed-session" });
      },
      refreshTokenFn: async (_options, token) => {
        refreshCalls += 1;
        assert.equal(token.access_token, "EXPIRED_CACHED_ACCESS_TOKEN");
        return { ...token, access_token: "REFRESHED_ACCESS_TOKEN" };
      },
    },
  );

  assert.equal(result, "REFRESHED_ACCESS_TOKEN");
  assert.equal(loginCalls, 0);
  assert.equal(providerCalls, 2);
  assert.equal(refreshCalls, 1);
});

test("non-interactive failed refresh replaces raw provider auth errors with the stable surface", async (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "rejected-token.json");
  writeFileSync(
    tokenFile,
    JSON.stringify({
      access_token: "REJECTED_PRIVATE_ACCESS_TOKEN",
      refresh_token: "REJECTED_PRIVATE_REFRESH_TOKEN",
    }),
    { mode: 0o600 },
  );

  let loginCalls = 0;
  let providerCalls = 0;
  let refreshCalls = 0;
  await assert.rejects(
    withMcp(
      optionsFor(tokenFile),
      async () => {
        throw new Error("handler must not run");
      },
      {
        getTokenFn: (options) => getToken(options, {
          loginFn: async () => {
            loginCalls += 1;
            throw new Error("login must not run");
          },
        }),
        connectAndRunFn: async () => {
          providerCalls += 1;
          const unauthorized = new Error("RAW_PROVIDER_AUTH_RESPONSE");
          unauthorized.status = 401;
          throw unauthorized;
        },
        refreshTokenFn: async () => {
          refreshCalls += 1;
          return null;
        },
      },
    ),
    (error) => assertStableAuthError(error, [
      tokenFile,
      "REJECTED_PRIVATE_ACCESS_TOKEN",
      "REJECTED_PRIVATE_REFRESH_TOKEN",
      "RAW_PROVIDER_AUTH_RESPONSE",
    ]),
  );

  assert.equal(loginCalls, 0);
  assert.equal(providerCalls, 1);
  assert.equal(refreshCalls, 1);
});

test("interactive mode still invokes login for missing-cache and forced-login flows", async (t) => {
  const root = tempRoot(t);
  const tokenFile = join(root, "missing-token.json");
  let loginCalls = 0;
  const loginFn = async () => {
    loginCalls += 1;
    return { access_token: `INTERACTIVE_TEST_TOKEN_${loginCalls}` };
  };
  const missingCacheToken = await getToken(
    optionsFor(tokenFile, { nonInteractive: false }),
    { loginFn },
  );
  const forcedLoginToken = await getToken(
    optionsFor(tokenFile, { nonInteractive: false, login: true }),
    { loginFn },
  );

  assert.deepEqual(missingCacheToken, { access_token: "INTERACTIVE_TEST_TOKEN_1" });
  assert.deepEqual(forcedLoginToken, { access_token: "INTERACTIVE_TEST_TOKEN_2" });
  assert.equal(loginCalls, 2);
});
