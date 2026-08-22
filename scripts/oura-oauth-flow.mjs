import { createServer } from "node:http";

const DEFAULT_REQUIRED_SCOPES = ["daily", "heartrate"];
const DEFAULT_API_BASE = "https://api.ouraring.com/v2/usercollection";
const SCOPE_PROBE_ENDPOINTS = new Map([
  ["daily", "daily_readiness"],
  ["heartrate", "heartrate"],
]);

export class AuthorizationCallbackError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "AuthorizationCallbackError";
    this.kind = kind;
  }
}

export function parseScopeValues(values) {
  const source = Array.isArray(values) ? values : [values];
  return [...new Set(source
    .filter((value) => typeof value === "string")
    .flatMap((value) => value.split(/[\s,]+/))
    .map((scope) => scope.trim().toLowerCase())
    .filter(Boolean))];
}

export function parseAuthorizationCallback(requestUrl, expectedState, redirectPort = 8791) {
  const url = new URL(requestUrl || "/", `http://127.0.0.1:${redirectPort}`);
  if (url.pathname !== "/callback") {
    throw new AuthorizationCallbackError("path", "Oura returned to an unexpected callback path");
  }
  if (url.searchParams.get("state") !== expectedState) {
    throw new AuthorizationCallbackError("state", "Invalid OAuth state");
  }

  const providerError = url.searchParams.get("error");
  if (providerError) {
    throw new AuthorizationCallbackError(
      "provider",
      providerError === "access_denied"
        ? "Oura authorization was cancelled"
        : "Oura authorization was not completed",
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    throw new AuthorizationCallbackError("code", "Oura callback did not include an authorization code");
  }

  return {
    code,
    callbackScopeProvided: url.searchParams.has("scope"),
    callbackScopes: parseScopeValues(url.searchParams.getAll("scope")),
  };
}

/**
 * Only messages created by this connector cross the browser/AppKit boundary.
 * Provider bodies, callback query values, fetch causes, credentials, and URLs
 * are deliberately never reflected into the local callback page or Sentinel.
 */
export function publicAuthorizationError(error) {
  if (error?.code === "EADDRINUSE") {
    return "Local Oura callback port 8791 is already in use. Close the other Oura authorization window and try again.";
  }
  const message = typeof error?.message === "string" ? error.message : "";
  const safePatterns = [
    /^Invalid OAuth state$/,
    /^Oura authorization (?:was cancelled|was not completed|timed out after 3 minutes)$/,
    /^Oura callback did not include an authorization code$/,
    /^Oura token exchange (?:failed \(HTTP [1-5][0-9]{2}\)|returned an invalid response)$/,
    /^Oura (?:daily|heartrate) permission probe failed(?: \((?:[1-5][0-9]{2}|no response)\))?$/,
    /^Oura authorization (?:omitted|could not verify) required scopes: (?:daily|heartrate)(?:, (?:daily|heartrate))*$/,
    /^Oura application credentials changed while authorization was in progress\. Start Connect again\.$/,
    /^Sentinel could not open the Oura authorization page$/,
    /^(?:Could not acquire|Timed out waiting for) the local Oura token lock$/,
    /^Refusing to save an incomplete Oura OAuth token$/,
  ];
  return safePatterns.some((pattern) => pattern.test(message))
    ? message
    : "Local Oura authorization failed. Return to Sentinel and try again.";
}

export function resolveGrantedScopes({
  tokenScope,
  tokenScopeProvided = false,
  callbackScopes = [],
  callbackScopeProvided = false,
  requestedScopes = DEFAULT_REQUIRED_SCOPES,
}) {
  const required = new Set(parseScopeValues(requestedScopes));
  if (tokenScopeProvided) {
    const scopes = parseScopeValues(tokenScope);
    if (scopes.some((scope) => required.has(scope))) {
      return { scopes, source: "token" };
    }
  }
  if (callbackScopeProvided) {
    const scopes = parseScopeValues(callbackScopes);
    if (scopes.some((scope) => required.has(scope))) {
      return { scopes, source: "callback" };
    }
  }
  return { scopes: [], source: "probe" };
}

export function missingRequiredScopes(grantedScopes, requiredScopes = DEFAULT_REQUIRED_SCOPES) {
  const granted = new Set(parseScopeValues(grantedScopes));
  return parseScopeValues(requiredScopes).filter((scope) => !granted.has(scope));
}

function scopeProbeUrl(scope, apiBase, nowMs) {
  const endpoint = SCOPE_PROBE_ENDPOINTS.get(scope);
  if (!endpoint) {
    throw new Error(`No Oura permission probe is defined for scope: ${scope}`);
  }

  const end = new Date(nowMs);
  const start = new Date(nowMs - 24 * 60 * 60 * 1000);
  const url = new URL(`${apiBase}/${endpoint}`);
  if (scope === "daily") {
    url.searchParams.set("start_date", start.toISOString().slice(0, 10));
    url.searchParams.set("end_date", end.toISOString().slice(0, 10));
  } else {
    url.searchParams.set("start_datetime", start.toISOString());
    url.searchParams.set("end_datetime", end.toISOString());
  }
  return url;
}

export async function verifyGrantedScopes({
  grantedScopes,
  accessToken,
  requiredScopes = DEFAULT_REQUIRED_SCOPES,
  fetchImpl = globalThis.fetch,
  apiBase = DEFAULT_API_BASE,
  nowMs = Date.now(),
}) {
  if (grantedScopes?.source !== "probe") return grantedScopes;
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("Oura permission probes require an access token");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Oura permission probes require fetch support");
  }

  const verified = [];
  for (const scope of parseScopeValues(requiredScopes)) {
    const url = scopeProbeUrl(scope, apiBase, nowMs);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      throw new Error(`Oura ${scope} permission probe failed`, { cause: error });
    }

    if (response?.ok) {
      verified.push(scope);
    } else if (response?.status !== 403) {
      throw new Error(`Oura ${scope} permission probe failed (${response?.status ?? "no response"})`);
    }
  }

  return { scopes: verified, source: "probe" };
}

export function authorizationPage({ succeeded, detail = "" }) {
  const safeDetail = String(detail).slice(0, 240)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const title = succeeded ? "Oura is connected" : "Connection needs attention";
  const message = succeeded
    ? "Sentinel received your approval and saved the connection on this Mac."
    : (safeDetail || "Return to Sentinel and try the authorization again.");
  const accent = succeeded ? "#4fcb7d" : "#ffd38a";
  const icon = succeeded ? "&#10003;" : "!";
  const autoClose = succeeded ? "setTimeout(() => window.close(), 900);" : "";
  const pageScript = `<script>history.replaceState({}, document.title, "/callback");${autoClose}</script>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 18% 10%, #3a2913 0, #130d08 42%, #090706 100%); color: #f1d3ba; }
    main { width: min(540px, calc(100vw - 40px)); padding: 42px; border: 1px solid rgba(241,211,186,.22); border-radius: 24px; background: rgba(18,13,10,.88); box-shadow: 0 28px 80px rgba(0,0,0,.45); }
    .mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 50%; border: 1px solid ${accent}; color: ${accent}; font: 700 22px ui-monospace, monospace; }
    .eyebrow { margin: 26px 0 8px; color: #a88b72; font: 700 12px ui-monospace, monospace; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 7vw, 44px); line-height: 1.04; letter-spacing: -.035em; }
    p { margin: 18px 0 0; color: #bea58f; font-size: 17px; line-height: 1.55; }
    .return { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(241,211,186,.12); color: ${accent}; font: 700 13px ui-monospace, monospace; letter-spacing: .06em; }
  </style>
</head>
<body>
  <main>
    <div class="mark">${icon}</div>
    <div class="eyebrow">DaoBrew Sentinel</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="return">${succeeded ? "You can return to Sentinel. This tab may close automatically." : "Return to Sentinel to retry."}</div>
  </main>
  ${pageScript}
</body>
</html>`;
}

const CALLBACK_HOSTS = Object.freeze([
  Object.freeze({ host: "127.0.0.1", family: 4 }),
  Object.freeze({ host: "::1", family: 6, ipv6Only: true }),
]);

function listen(server, options) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
    server.listen(options);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function writeAuthorizationResponse(res, status, options) {
  return new Promise((resolve, reject) => {
    res.once("error", reject);
    res.writeHead(status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      connection: "close",
    });
    res.end(authorizationPage(options), resolve);
  });
}

/**
 * Wait for the exact registered localhost callback on both loopback families.
 *
 * macOS may resolve `localhost` to either ::1 or 127.0.0.1. Binding only one
 * family turns a successful Oura redirect into a three-minute timeout. The
 * two explicit listeners below share one processing/settlement state, never
 * bind a wildcard interface, and call `onListening` only after both binds
 * succeed. A partial bind therefore fails closed before the browser opens and
 * closes whichever listener already started.
 *
 * `redirectPort: 0` is a test-only convenience: the IPv4 listener selects an
 * ephemeral port and the IPv6 listener binds that same port. Production calls
 * this with the registered fixed port, 8791.
 */
export function waitForAuthorizationCallback(
  state,
  onListening,
  completeAuthorization,
  {
    redirectPort = 8791,
    timeoutMs = 180_000,
    createServerImpl = createServer,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const servers = [];
    let settled = false;
    let processing = false;
    let timer;

    const closeAll = () => Promise.all(servers.map(closeServer));
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      void closeAll().then(() => {
        if (error) reject(error);
        else resolve(result);
      });
    };

    const handler = async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${redirectPort}`);
        if (url.pathname !== "/callback") {
          res.writeHead(404, { connection: "close" });
          res.end("Not found");
          return;
        }
        if (processing || settled) {
          res.writeHead(409, { connection: "close" });
          res.end("Authorization is already being completed");
          return;
        }
        processing = true;
        const callback = parseAuthorizationCallback(req.url, state, redirectPort);
        const result = await completeAuthorization(callback);
        await writeAuthorizationResponse(res, 200, { succeeded: true });
        finish(null, result);
      } catch (error) {
        try {
          await writeAuthorizationResponse(res, 400, {
            succeeded: false,
            detail: publicAuthorizationError(error),
          });
        } catch {
          // The original callback error remains the actionable failure.
        }
        if (error?.kind === "state" && !settled) {
          processing = false;
          return;
        }
        finish(error);
      }
    };

    void (async () => {
      try {
        let effectivePort = redirectPort;
        for (const target of CALLBACK_HOSTS) {
          const server = createServerImpl(handler);
          servers.push(server);
          await listen(server, {
            port: effectivePort,
            host: target.host,
            ipv6Only: target.ipv6Only === true,
            exclusive: true,
          });
          server.on("error", (error) => finish(error));
          if (effectivePort === 0) {
            const address = server.address();
            if (!address || typeof address === "string") {
              throw new Error("Could not determine the local Oura callback port");
            }
            effectivePort = address.port;
          }
        }

        timer = setTimeout(
          () => finish(new Error("Oura authorization timed out after 3 minutes")),
          timeoutMs,
        );
        await onListening({
          port: effectivePort,
          hosts: CALLBACK_HOSTS.map(({ host, family }) => ({ host, family })),
        });
      } catch (error) {
        finish(error);
      }
    })();
  });
}
