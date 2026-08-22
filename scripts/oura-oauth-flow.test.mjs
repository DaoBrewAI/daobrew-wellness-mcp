import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import {
  authorizationPage,
  missingRequiredScopes,
  parseAuthorizationCallback,
  parseScopeValues,
  publicAuthorizationError,
  resolveGrantedScopes,
  verifyGrantedScopes,
  waitForAuthorizationCallback,
} from "./oura-oauth-flow.mjs";

function listenServer(server, options) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options, resolve);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(resolve);
  });
}

function callbackRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const req = request({
      host,
      port,
      path,
      method: "GET",
      family: host === "::1" ? 6 : 4,
      agent: false,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.once("error", reject);
    req.end();
  });
}

async function startCallback(completeAuthorization) {
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const result = waitForAuthorizationCallback(
    "state-123",
    readyResolve,
    completeAuthorization,
    { redirectPort: 0, timeoutMs: 2_000 },
  );
  void result.catch(readyReject);
  const binding = await ready;
  return { ...binding, result };
}

async function assertLoopbacksCanRebind(port) {
  const ipv4 = createServer(() => {});
  const ipv6 = createServer(() => {});
  try {
    await listenServer(ipv4, { port, host: "127.0.0.1", exclusive: true });
    await listenServer(ipv6, { port, host: "::1", ipv6Only: true, exclusive: true });
  } finally {
    await Promise.all([closeServer(ipv4), closeServer(ipv6)]);
  }
}

test("callback accepts a valid code when Oura omits the optional scope parameter", () => {
  const callback = parseAuthorizationCallback("/callback?code=code-123&state=state-123", "state-123");
  assert.equal(callback.code, "code-123");
  assert.equal(callback.callbackScopeProvided, false);
  assert.deepEqual(callback.callbackScopes, []);
});

test("callback accepts the exact localhost redirect over IPv4 and cleans both listeners", async () => {
  const callback = await startCallback(async ({ code }) => code);
  assert.deepEqual(callback.hosts, [
    { host: "127.0.0.1", family: 4 },
    { host: "::1", family: 6 },
  ]);

  const response = await callbackRequest(
    "127.0.0.1", callback.port, "/callback?code=ipv4-code&state=state-123",
  );
  assert.equal(response.status, 200);
  assert.match(response.body, /Oura is connected/);
  assert.equal(await callback.result, "ipv4-code");
  await assertLoopbacksCanRebind(callback.port);
});

test("callback accepts the exact localhost redirect over IPv6 and cleans both listeners", async () => {
  const callback = await startCallback(async ({ code }) => code);
  const response = await callbackRequest(
    "::1", callback.port, "/callback?code=ipv6-code&state=state-123",
  );
  assert.equal(response.status, 200);
  assert.match(response.body, /Oura is connected/);
  assert.equal(await callback.result, "ipv6-code");
  await assertLoopbacksCanRebind(callback.port);
});

test("IPv4 and IPv6 listeners share one authorization completion", async () => {
  let enteredResolve;
  let releaseResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  let completionCalls = 0;
  const callback = await startCallback(async ({ code }) => {
    completionCalls += 1;
    enteredResolve();
    await release;
    return code;
  });

  const first = callbackRequest(
    "127.0.0.1", callback.port, "/callback?code=winner&state=state-123",
  );
  await entered;
  const duplicate = await callbackRequest(
    "::1", callback.port, "/callback?code=duplicate&state=state-123",
  );
  assert.equal(duplicate.status, 409);
  releaseResolve();
  assert.equal((await first).status, 200);
  assert.equal(await callback.result, "winner");
  assert.equal(completionCalls, 1);
});

test("invalid state remains retryable across loopback families", async () => {
  const callback = await startCallback(async ({ code }) => code);
  const rejected = await callbackRequest(
    "::1", callback.port, "/callback?code=wrong&state=attacker",
  );
  assert.equal(rejected.status, 400);
  assert.match(rejected.body, /Invalid OAuth state/);

  const accepted = await callbackRequest(
    "127.0.0.1", callback.port, "/callback?code=right&state=state-123",
  );
  assert.equal(accepted.status, 200);
  assert.equal(await callback.result, "right");
});

test("partial dual-stack bind fails before browser handoff and cleans IPv4", async () => {
  const ipv6Blocker = createServer(() => {});
  await listenServer(ipv6Blocker, {
    port: 0, host: "::1", ipv6Only: true, exclusive: true,
  });
  const blockerAddress = ipv6Blocker.address();
  assert.equal(typeof blockerAddress, "object");
  const port = blockerAddress.port;
  let handedOff = false;
  try {
    await assert.rejects(
      waitForAuthorizationCallback(
        "state-123",
        () => { handedOff = true; },
        async ({ code }) => code,
        { redirectPort: port, timeoutMs: 100 },
      ),
      (error) => error?.code === "EADDRINUSE",
    );
    assert.equal(handedOff, false);

    const ipv4 = createServer(() => {});
    try {
      await listenServer(ipv4, { port, host: "127.0.0.1", exclusive: true });
    } finally {
      await closeServer(ipv4);
    }
  } finally {
    await closeServer(ipv6Blocker);
  }
});

test("browser-handoff error closes both successfully bound loopbacks", async () => {
  let boundPort;
  await assert.rejects(
    waitForAuthorizationCallback(
      "state-123",
      ({ port }) => {
        boundPort = port;
        throw new Error("browser handoff failed");
      },
      async ({ code }) => code,
      { redirectPort: 0, timeoutMs: 100 },
    ),
    /browser handoff failed/,
  );
  assert.equal(typeof boundPort, "number");
  await assertLoopbacksCanRebind(boundPort);
});

test("scope parsing accepts current comma-separated and documented space-separated forms", () => {
  assert.deepEqual(parseScopeValues(["Daily,Heartrate", "daily heartrate"]), ["daily", "heartrate"]);
});

test("missing scope metadata requires endpoint probes instead of assuming requested scopes", () => {
  assert.deepEqual(resolveGrantedScopes({ requestedScopes: ["daily", "heartrate"] }), {
    scopes: [],
    source: "probe",
  });
});

test("empty or malformed scope metadata requires endpoint probes", () => {
  assert.deepEqual(resolveGrantedScopes({
    tokenScope: "",
    tokenScopeProvided: true,
    callbackScopes: ["[]"],
    callbackScopeProvided: true,
  }), {
    scopes: [],
    source: "probe",
  });
});

test("an empty token scope can fall back to explicit callback scope metadata", () => {
  assert.deepEqual(resolveGrantedScopes({
    tokenScope: "",
    tokenScopeProvided: true,
    callbackScopes: ["daily heartrate"],
    callbackScopeProvided: true,
  }), {
    scopes: ["daily", "heartrate"],
    source: "callback",
  });
});

test("token response scope wins over callback scope", () => {
  assert.deepEqual(resolveGrantedScopes({
    tokenScope: "daily heartrate",
    tokenScopeProvided: true,
    callbackScopes: ["daily"],
    callbackScopeProvided: true,
  }), {
    scopes: ["daily", "heartrate"],
    source: "token",
  });
});

test("an explicitly reduced scope set still fails closed", () => {
  const granted = resolveGrantedScopes({
    callbackScopes: ["daily"],
    callbackScopeProvided: true,
  });
  assert.deepEqual(missingRequiredScopes(granted.scopes), ["heartrate"]);
});

test("explicit partial metadata never falls through to endpoint probes", async () => {
  const resolved = resolveGrantedScopes({
    callbackScopes: ["daily"],
    callbackScopeProvided: true,
  });
  const granted = await verifyGrantedScopes({
    grantedScopes: resolved,
    accessToken: "test-access-token",
    fetchImpl: async () => assert.fail("explicit partial grants must not be probed"),
  });

  assert.deepEqual(granted, { scopes: ["daily"], source: "callback" });
  assert.deepEqual(missingRequiredScopes(granted.scopes), ["heartrate"]);
});

test("ambiguous metadata is accepted only after both required endpoints succeed", async () => {
  const calls = [];
  const granted = await verifyGrantedScopes({
    grantedScopes: { scopes: [], source: "probe" },
    accessToken: "test-access-token",
    nowMs: Date.parse("2026-07-15T12:00:00.000Z"),
    fetchImpl: async (url, options) => {
      calls.push({ url: url.toString(), options });
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(granted, { scopes: ["daily", "heartrate"], source: "probe" });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/daily_readiness\?start_date=2026-07-14&end_date=2026-07-15$/);
  assert.match(calls[1].url, /\/heartrate\?start_datetime=.*&end_datetime=.*/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-access-token");
});

test("endpoint probes preserve fail-closed behavior for a partial grant", async () => {
  const granted = await verifyGrantedScopes({
    grantedScopes: { scopes: [], source: "probe" },
    accessToken: "test-access-token",
    fetchImpl: async (url) => ({
      ok: !url.pathname.endsWith("/heartrate"),
      status: url.pathname.endsWith("/heartrate") ? 403 : 200,
    }),
  });

  assert.deepEqual(granted, { scopes: ["daily"], source: "probe" });
  assert.deepEqual(missingRequiredScopes(granted.scopes), ["heartrate"]);
});

test("endpoint probe authentication, rate-limit, and network failures do not become grants", async () => {
  for (const status of [401, 429]) {
    await assert.rejects(
      verifyGrantedScopes({
        grantedScopes: { scopes: [], source: "probe" },
        accessToken: "test-access-token",
        fetchImpl: async () => ({ ok: false, status }),
      }),
      new RegExp(`daily permission probe failed \\(${status}\\)`),
    );
  }

  await assert.rejects(
    verifyGrantedScopes({
      grantedScopes: { scopes: [], source: "probe" },
      accessToken: "test-access-token",
      fetchImpl: async () => { throw new Error("offline"); },
    }),
    /daily permission probe failed/,
  );
});

test("callback state and authorization code remain mandatory", () => {
  let stateError;
  try {
    parseAuthorizationCallback("/callback?code=code-123&state=wrong", "state-123");
  } catch (error) {
    stateError = error;
  }
  assert.match(stateError?.message ?? "", /Invalid OAuth state/);
  assert.equal(stateError.kind, "state");
  assert.throws(
    () => parseAuthorizationCallback("/callback?state=state-123", "state-123"),
    /authorization code/,
  );
  assert.throws(
    () => parseAuthorizationCallback("/callback?error=access_denied&state=state-123", "state-123"),
    /authorization was cancelled/,
  );
});

test("callback and child-process errors never reflect provider or credential material", () => {
  assert.equal(
    publicAuthorizationError(new Error("client_secret=super-secret&code=one-time-code")),
    "Local Oura authorization failed. Return to Sentinel and try again.",
  );
  assert.equal(
    publicAuthorizationError(Object.assign(new Error("listen failure with internals"), { code: "EADDRINUSE" })),
    "Local Oura callback port 8791 is already in use. Close the other Oura authorization window and try again.",
  );
  const reflected = authorizationPage({
    succeeded: false,
    detail: publicAuthorizationError(new Error("access_token=secret-token")),
  });
  assert.doesNotMatch(reflected, /secret-token|access_token/);
});

test("browser does not claim success until the success page is explicitly selected", () => {
  const failure = authorizationPage({ succeeded: false, detail: "Token exchange failed" });
  const success = authorizationPage({ succeeded: true });
  assert.doesNotMatch(failure, /Oura is connected/);
  assert.match(failure, /Token exchange failed/);
  assert.match(success, /Oura is connected/);
  assert.match(success, /history\.replaceState/);
});
