#!/usr/bin/env node
// Oura bridge. Installed Sentinel uses DaoBrew-managed OAuth by default: the
// backend owns the shared Oura client secret while this Mac authenticates with
// its opaque device credential. A personal/BYO OAuth application remains as an
// explicit advanced compatibility mode.
//
// Usage:
//   node scripts/oura-client.mjs --login
//   node scripts/oura-client.mjs --login --managed
//   node scripts/oura-client.mjs --login --personal-app
//   node scripts/oura-client.mjs --help

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ouraModule from "../dist/src/health/oura.js";
import tokenStore from "../dist/src/health/oura-token-store.js";
import {
  missingRequiredScopes,
  publicAuthorizationError,
  resolveGrantedScopes,
  verifyGrantedScopes,
  waitForAuthorizationCallback,
} from "./oura-oauth-flow.mjs";

const {
  exchangeManagedOuraCode,
  loadCurrentConfirmedOuraOwner,
  ouraTokenFileForConfirmedOwner,
  resolveManagedOuraClientConfig,
  startManagedOuraAuthorization,
} = ouraModule;
const { saveNewOuraAuthorization } = tokenStore;

const AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const SCOPES = "daily heartrate";
const REDIRECT_PORT = 8791;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const CONFIG_PATH = join(homedir(), ".daobrew", "config.json");
const CALLBACK_TIMEOUT_MS = 180_000;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;

function usage() {
  return [
    "Usage:",
    "  node scripts/oura-client.mjs --login",
    "  node scripts/oura-client.mjs --login --managed",
    "  node scripts/oura-client.mjs --login --personal-app",
    "",
    "Default:",
    "  Uses DaoBrew-managed Oura OAuth with this installation's device enrollment.",
    "  No Oura client secret is required or stored on this Mac.",
    "",
    "Personal app (advanced/legacy):",
    "  1. Create an application at https://developer.ouraring.com/applications",
    `  2. Register this exact Redirect URI: ${REDIRECT_URI}`,
    "  3. Save oura_client_id and oura_client_secret in ~/.daobrew/config.json",
    "",
    "Options:",
    "  --login          Open Oura, authorize Daily + Heartrate, and cache the token",
    "  --managed        Explicit alias for the default managed OAuth flow",
    "  --personal-app   Use personal/BYO Oura OAuth credentials instead of managed OAuth",
    "  --no-open        Do not launch the browser (the one-time URL is never printed)",
    "  --help           Show this help",
  ].join("\n");
}

export function parseArgs(argv) {
  const options = { login: false, openBrowser: true, managed: false, personalApp: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--login") {
      options.login = true;
    } else if (arg === "--managed") {
      options.managed = true;
    } else if (arg === "--personal-app") {
      options.personalApp = true;
    } else if (arg === "--no-open") {
      options.openBrowser = false;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.managed && options.personalApp) {
    throw new Error("Choose either --managed or --personal-app, not both");
  }
  if (!options.login) {
    console.log(usage());
    process.exit(0);
  }
  return options;
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function configuredPersonalCredentials(config) {
  const clientId = typeof config?.oura_client_id === "string" ? config.oura_client_id.trim() : "";
  const clientSecret = typeof config?.oura_client_secret === "string"
    ? config.oura_client_secret.trim()
    : "";
  return { clientId, clientSecret };
}

function clientCredentials(config = readConfig()) {
  const credentials = configuredPersonalCredentials(config);
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error(
      "Personal-app Oura OAuth needs oura_client_id and oura_client_secret in " +
      "~/.daobrew/config.json.",
    );
  }
  return credentials;
}

function assertSelectableManagedAuthority(config) {
  const credential = typeof config?.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  if (!/^dbd_[A-Za-z0-9_-]{28,}$/.test(credential)) {
    throw new Error("DaoBrew device enrollment is required before connecting Oura");
  }
  let apiUrl;
  try {
    apiUrl = new URL(typeof config?.api_url === "string" ? config.api_url.trim() : "");
  } catch {
    throw new Error("DaoBrew device enrollment is required before connecting Oura");
  }
  if (
    apiUrl.protocol !== "https:"
    || apiUrl.username
    || apiUrl.password
    || apiUrl.search
    || apiUrl.hash
  ) {
    throw new Error("DaoBrew device enrollment is required before connecting Oura");
  }
}

/** Exported for a side-effect-free mode-selection regression test. */
export function selectOuraOAuthMode(config, forcePersonalApp = false, forceManaged = false) {
  const configuredMode = config?.oura_oauth_mode;
  if (configuredMode !== undefined && configuredMode !== "managed" && configuredMode !== "personal") {
    throw new Error("oura_oauth_mode must be either managed or personal");
  }
  if (forcePersonalApp) {
    if (forceManaged) throw new Error("Choose either managed or personal-app Oura OAuth");
    clientCredentials(config);
    return "personal";
  }

  if (forceManaged) {
    assertSelectableManagedAuthority(config);
    return "managed";
  }
  if (configuredMode === "personal") {
    clientCredentials(config);
    return "personal";
  }

  const hasDeviceCredential = typeof config?.device_credential === "string"
    && Boolean(config.device_credential.trim());
  if (configuredMode === "managed" || hasDeviceCredential) {
    // The actual login resolves a runtime-branded confirmed owner. Selection
    // remains side-effect-free but may never silently downgrade an enrollment.
    assertSelectableManagedAuthority(config);
    return "managed";
  }

  const personal = configuredPersonalCredentials(config);
  if (personal.clientId || personal.clientSecret) {
    clientCredentials(config);
    return "personal";
  }
  throw new Error("DaoBrew device enrollment is required before connecting Oura");
}

function randomUrlSafe(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function openUrl(url) {
  return new Promise((resolve, reject) => {
    // Release apps inherit launchd's minimal PATH. Use macOS' fixed executable
    // and observe spawn failure so the listeners close immediately instead of
    // crashing on an unhandled ChildProcess error or waiting three minutes.
    const child = spawn("/usr/bin/open", [url], { stdio: "ignore", detached: true });
    child.once("error", () => reject(new Error("Sentinel could not open the Oura authorization page")));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${label} returned an invalid response`);
  }
  if (!response.ok) {
    // OAuth providers may echo request details in error bodies. Status is
    // enough at this boundary and never reflects a code/client secret.
    throw new Error(`${label} failed (HTTP ${response.status})`);
  }
  return payload;
}

function boundedToken(value) {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= MAX_TOKEN_LENGTH;
}

function assertSaveableTokenPayload(payload) {
  if (!boundedToken(payload?.access_token) || !boundedToken(payload?.refresh_token)) {
    throw new Error("Oura token response did not include renewable access and refresh tokens");
  }
  const expiresIn = Number(payload.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_EXPIRES_IN_SECONDS) {
    throw new Error("Oura token response included an invalid lifetime");
  }
  return expiresIn;
}

function sameConfirmedOwner(current, expected) {
  return current?.userId === expected.userId
    && current?.ownerScopeDigest === expected.ownerScopeDigest
    && current?.deviceCredential === expected.deviceCredential
    && current?.issuerUrl === expected.issuerUrl;
}

async function saveToken(payload, mode, expectedAuthority, expectedOwner) {
  const expiresIn = assertSaveableTokenPayload(payload);
  const nowMs = Date.now();
  const token = {
    owner_scope_digest: expectedOwner.ownerScopeDigest,
    access_token: payload.access_token.trim(),
    refresh_token: payload.refresh_token.trim(),
    token_type: typeof payload.token_type === "string" && payload.token_type.trim()
      ? payload.token_type.trim()
      : "Bearer",
    expires_at: nowMs + expiresIn * 1000,
    scope: typeof payload.scope === "string" && payload.scope.trim() ? payload.scope.trim() : SCOPES,
    oauth_mode: mode,
    authorized_at: Number(payload.authorized_at ?? Math.trunc(nowMs / 1000)),
    saved_at: Math.trunc(nowMs / 1000),
  };
  const tokenPath = ouraTokenFileForConfirmedOwner(expectedOwner);
  return saveNewOuraAuthorization(tokenPath, token, {
    validateBeforeSave: () => {
      const currentOwner = loadCurrentConfirmedOuraOwner();
      if (!sameConfirmedOwner(currentOwner, expectedOwner)) {
        throw new Error(
          "DaoBrew owner enrollment changed while Oura authorization was in progress. Start Connect again.",
        );
      }
      if (mode === "managed") {
        const current = resolveManagedOuraClientConfig(currentOwner);
        if (
          current.apiUrl !== expectedAuthority.apiUrl
          || current.deviceCredential !== expectedAuthority.deviceCredential
          || current.ownerScopeDigest !== expectedAuthority.ownerScopeDigest
        ) {
          throw new Error(
            "DaoBrew device enrollment changed while Oura authorization was in progress. Start Connect again.",
          );
        }
        return;
      }
      const current = configuredPersonalCredentials(readConfig());
      if (
        current.clientId !== expectedAuthority.clientId
        || current.clientSecret !== expectedAuthority.clientSecret
      ) {
        throw new Error(
          "Oura application credentials changed while authorization was in progress. Start Connect again.",
        );
      }
    },
  });
}

async function verifyAndSaveToken(
  payload,
  callback,
  mode,
  expectedAuthority,
  expectedOwner,
) {
  const resolved = resolveGrantedScopes({
    tokenScope: payload?.scope,
    tokenScopeProvided: Object.prototype.hasOwnProperty.call(payload ?? {}, "scope"),
    callbackScopes: callback.callbackScopes,
    callbackScopeProvided: callback.callbackScopeProvided,
    requestedScopes: SCOPES,
  });
  const granted = await verifyGrantedScopes({
    grantedScopes: resolved,
    accessToken: payload?.access_token,
    requiredScopes: SCOPES,
  });
  const missingScopes = missingRequiredScopes(granted.scopes, SCOPES);
  if (missingScopes.length > 0) {
    const detail = granted.source === "probe" ? "could not verify" : "omitted";
    throw new Error(`Oura authorization ${detail} required scopes: ${missingScopes.join(", ")}`);
  }
  return saveToken(
    { ...payload, scope: granted.scopes.join(" ") },
    mode,
    expectedAuthority,
    expectedOwner,
  );
}

async function launchAuthorizationPage(url, options) {
  console.log("Oura authorization is ready in your browser. Complete the consent screen to continue.");
  if (options.openBrowser) {
    await openUrl(url);
  } else {
    // Intentionally do not print the one-time URL: it carries OAuth state.
    console.log("Browser launch is disabled; the one-time authorization URL remains private.");
  }
}

async function managedLogin(options, owner) {
  const authority = resolveManagedOuraClientConfig(owner);
  const start = await startManagedOuraAuthorization(authority);
  return waitForAuthorizationCallback(start.state, async () => {
    await launchAuthorizationPage(start.authorizationUrl, options);
  }, async (callback) => {
    const payload = await exchangeManagedOuraCode(
      authority,
      callback.code,
      start.state,
    );
    return verifyAndSaveToken(payload, callback, "managed", authority, owner);
  }, { redirectPort: REDIRECT_PORT, timeoutMs: CALLBACK_TIMEOUT_MS });
}

async function personalLogin(options, config, owner) {
  const { clientId, clientSecret } = clientCredentials(config);
  const state = randomUrlSafe(24);
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);

  return waitForAuthorizationCallback(state, async () => {
    await launchAuthorizationPage(authUrl.toString(), options);
  }, async (callback) => {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const payload = await readJson(response, "Oura token exchange");
    return verifyAndSaveToken(
      payload,
      callback,
      "personal",
      { clientId, clientSecret },
      owner,
    );
  }, { redirectPort: REDIRECT_PORT, timeoutMs: CALLBACK_TIMEOUT_MS });
}

async function login(options) {
  const config = readConfig();
  const owner = loadCurrentConfirmedOuraOwner();
  if (owner === null) {
    throw new Error("DaoBrew confirmed owner enrollment is required before connecting Oura");
  }
  const mode = selectOuraOAuthMode(config, options.personalApp, options.managed);
  const token = mode === "managed"
    ? await managedLogin(options, owner)
    : await personalLogin(options, config, owner);
  console.log(JSON.stringify({
    status: "connected",
    source: "oura",
    oauth_mode: mode,
    token_file: ouraTokenFileForConfirmedOwner(owner),
    scopes: SCOPES.split(" "),
    has_refresh_token: Boolean(token.refresh_token),
  }, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await login(options);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ status: "error", error: publicAuthorizationError(error) }));
    process.exitCode = 1;
  });
}
