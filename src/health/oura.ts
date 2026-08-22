import { statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  assertConfirmedTaskMapOwner,
  loadConfirmedTaskMapOwnerSync,
  type ConfirmedTaskMapOwner,
} from "../identity.js";
import {
  type LocalFileConfig,
  readLocalConfig,
} from "../engine/local-config.js";
import {
  compareAndSwapOuraRefresh,
  readOuraTokenFile,
  saveNewOuraAuthorization,
  StoredOuraToken,
} from "./oura-token-store.js";

const OURA_TOKEN_FILE_NAME = "oura-token.json";
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const MANAGED_REDIRECT_URI = "http://localhost:8791/callback";
const REQUIRED_OURA_SCOPES = ["daily", "heartrate"] as const;
const STATE_RE = /^[A-Za-z0-9._~-]{16,512}$/;
const MAX_TOKEN_LENGTH = 8_192;
const MAX_SCOPE_LENGTH = 1_024;
const MAX_TOKEN_TYPE_LENGTH = 64;
const MAX_EXPIRES_IN_SECONDS = 365 * 24 * 60 * 60;

export interface ManagedOuraClientConfig {
  apiUrl: string;
  deviceCredential: string;
  ownerScopeDigest: string;
}

export interface ManagedOuraAuthorizationStart {
  authorizationUrl: string;
  state: string;
  redirectUri: typeof MANAGED_REDIRECT_URI;
  scopes: string[];
  mode: "managed";
}

export interface OuraOAuthTokenPayload {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface OuraRefreshOptions {
  fetchImpl?: typeof fetch;
  environment?: Record<string, string | undefined>;
  nowMs?: () => number;
}

export interface OuraToken extends StoredOuraToken {}

const CURRENT_OURA_OWNER_GUARD_AUTHORITY: unique symbol = Symbol(
  "CurrentOuraOwnerGuardAuthority",
);
const currentOuraOwnerGuards = new WeakSet<object>();

export interface CurrentOuraOwnerGuard {
  readonly [CURRENT_OURA_OWNER_GUARD_AUTHORITY]: true;
  readonly ownerScopeDigest: string;
}

export function needsRefresh(token: OuraToken, nowMs: number): boolean {
  return nowMs >= token.expires_at;
}

export function isConnected(): boolean {
  return loadToken() !== null;
}

export function loadCurrentConfirmedOuraOwner(): ConfirmedTaskMapOwner | null {
  const plan = loadConfirmedTaskMapOwnerSync(homedir());
  return plan.ok ? plan.owner : null;
}

function requireCurrentConfirmedOuraOwner(): ConfirmedTaskMapOwner {
  const owner = loadCurrentConfirmedOuraOwner();
  if (owner === null) {
    throw new Error("DaoBrew confirmed owner enrollment is required for Oura");
  }
  return owner;
}

export function ouraTokenFileForConfirmedOwner(
  owner: ConfirmedTaskMapOwner,
): string {
  assertConfirmedTaskMapOwner(owner);
  return join(owner.sourceRoot, OURA_TOKEN_FILE_NAME);
}

export function loadOuraTokenForConfirmedOwner(
  owner: ConfirmedTaskMapOwner,
): OuraToken | null {
  assertConfirmedTaskMapOwner(owner);
  const token = readOuraTokenFile<OuraToken>(
    ouraTokenFileForConfirmedOwner(owner),
  );
  if (token?.owner_scope_digest !== owner.ownerScopeDigest) return null;
  return token;
}

export function assertCurrentOuraTokenOwner(token: OuraToken): void {
  const owner = requireCurrentConfirmedOuraOwner();
  if (token.owner_scope_digest !== owner.ownerScopeDigest) {
    throw new Error("Oura authorization belongs to a different confirmed owner");
  }
}

export function captureCurrentOuraOwnerGuard(
  token: OuraToken,
): CurrentOuraOwnerGuard {
  const owner = requireCurrentConfirmedOuraOwner();
  if (token.owner_scope_digest !== owner.ownerScopeDigest) {
    throw new Error("Oura authorization belongs to a different confirmed owner");
  }
  const guard = Object.freeze({
    [CURRENT_OURA_OWNER_GUARD_AUTHORITY]: true as const,
    ownerScopeDigest: owner.ownerScopeDigest,
    owner,
  });
  currentOuraOwnerGuards.add(guard);
  return guard;
}

export function assertCurrentOuraOwnerGuard(
  guard: CurrentOuraOwnerGuard,
): void {
  if (!currentOuraOwnerGuards.has(guard)) {
    throw new Error("Oura owner guard is not trusted");
  }
  const expected = (guard as CurrentOuraOwnerGuard & {
    readonly owner: ConfirmedTaskMapOwner;
  }).owner;
  assertSameCurrentOwner(expected);
}

export function loadToken(): OuraToken | null {
  const owner = loadCurrentConfirmedOuraOwner();
  return owner === null ? null : loadOuraTokenForConfirmedOwner(owner);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} is invalid`);
  return normalized;
}

function normalizedScopes(value: unknown, label: string): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  if (values.length === 0 || values.length > 64) throw new Error(`${label} are invalid`);
  const scopes = values.flatMap((entry) => {
    if (typeof entry !== "string") throw new Error(`${label} are invalid`);
    return entry.split(/[\s,]+/);
  }).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (scopes.length === 0 || scopes.some((scope) => scope.length > 128)) {
    throw new Error(`${label} are invalid`);
  }
  return [...new Set(scopes)];
}

function requireOuraScopes(scopes: string[], label: string): void {
  for (const required of REQUIRED_OURA_SCOPES) {
    if (!scopes.includes(required)) throw new Error(`${label} omitted required Oura scopes`);
  }
}

export function resolveManagedOuraClientConfig(
  owner: ConfirmedTaskMapOwner,
): ManagedOuraClientConfig {
  assertConfirmedTaskMapOwner(owner);
  return {
    apiUrl: owner.issuerUrl,
    deviceCredential: owner.deviceCredential,
    ownerScopeDigest: owner.ownerScopeDigest,
  };
}

async function managedBackendRequest<T>(
  config: ManagedOuraClientConfig,
  path: "/device/oura/oauth/start" | "/device/oura/oauth/exchange" | "/device/oura/oauth/refresh",
  body: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${config.apiUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.deviceCredential}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("DaoBrew managed Oura service is unreachable");
  }
  if (!response.ok) {
    throw new Error(`DaoBrew managed Oura service failed (HTTP ${response.status})`);
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Error("DaoBrew managed Oura service returned an invalid response");
  }
  if (!isRecord(envelope) || envelope.success !== true || !isRecord(envelope.data)) {
    throw new Error("DaoBrew managed Oura service returned an invalid response");
  }
  return envelope.data as T;
}

function validateManagedAuthorizationStart(data: unknown): ManagedOuraAuthorizationStart {
  if (!isRecord(data) || data.mode !== "managed") {
    throw new Error("DaoBrew managed Oura authorization response is invalid");
  }
  const authorizationUrl = boundedString(
    data.authorization_url,
    "DaoBrew managed Oura authorization URL",
    4_096,
  );
  const state = boundedString(data.state, "DaoBrew managed Oura state", 512);
  if (!STATE_RE.test(state)) throw new Error("DaoBrew managed Oura state is invalid");
  const redirectUri = boundedString(data.redirect_uri, "DaoBrew managed Oura redirect URI", 256);
  if (redirectUri !== MANAGED_REDIRECT_URI) {
    throw new Error("DaoBrew managed Oura redirect URI is invalid");
  }
  const scopes = normalizedScopes(data.scopes, "DaoBrew managed Oura scopes");
  requireOuraScopes(scopes, "DaoBrew managed Oura authorization");
  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    throw new Error("DaoBrew managed Oura authorization URL is invalid");
  }
  if (
    url.origin !== "https://cloud.ouraring.com"
    || url.pathname !== "/oauth/authorize"
    || url.username
    || url.password
    || url.hash
    || url.searchParams.has("client_secret")
    || url.searchParams.getAll("response_type").length !== 1
    || url.searchParams.get("response_type") !== "code"
    || url.searchParams.getAll("client_id").length !== 1
    || !url.searchParams.get("client_id")?.trim()
    || url.searchParams.getAll("state").length !== 1
    || url.searchParams.get("state") !== state
    || url.searchParams.getAll("redirect_uri").length !== 1
    || url.searchParams.get("redirect_uri") !== redirectUri
    || url.searchParams.getAll("scope").length !== 1
  ) {
    throw new Error("DaoBrew managed Oura authorization URL is invalid");
  }
  requireOuraScopes(
    normalizedScopes(url.searchParams.get("scope"), "DaoBrew managed Oura URL scopes"),
    "DaoBrew managed Oura authorization URL",
  );
  return { authorizationUrl, state, redirectUri: MANAGED_REDIRECT_URI, scopes, mode: "managed" };
}

function validateManagedTokenPayload(data: unknown): OuraOAuthTokenPayload {
  if (!isRecord(data) || !isRecord(data.token)) {
    throw new Error("DaoBrew managed Oura token response is invalid");
  }
  const token = data.token;
  const expiresIn = token.expires_in;
  if (
    typeof expiresIn !== "number"
    || !Number.isFinite(expiresIn)
    || expiresIn <= 0
    || expiresIn > MAX_EXPIRES_IN_SECONDS
  ) {
    throw new Error("DaoBrew managed Oura token lifetime is invalid");
  }
  return {
    access_token: boundedString(token.access_token, "Managed Oura access token", MAX_TOKEN_LENGTH),
    refresh_token: boundedString(token.refresh_token, "Managed Oura refresh token", MAX_TOKEN_LENGTH),
    token_type: boundedString(token.token_type, "Managed Oura token type", MAX_TOKEN_TYPE_LENGTH),
    expires_in: expiresIn,
    scope: boundedString(token.scope, "Managed Oura token scope", MAX_SCOPE_LENGTH),
  };
}

export async function startManagedOuraAuthorization(
  config: ManagedOuraClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ManagedOuraAuthorizationStart> {
  return validateManagedAuthorizationStart(await managedBackendRequest(
    config,
    "/device/oura/oauth/start",
    undefined,
    fetchImpl,
  ));
}

export async function exchangeManagedOuraCode(
  config: ManagedOuraClientConfig,
  code: string,
  state: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OuraOAuthTokenPayload> {
  const normalizedState = boundedString(state, "Oura authorization state", 512);
  if (!STATE_RE.test(normalizedState)) throw new Error("Oura authorization state is invalid");
  return validateManagedTokenPayload(await managedBackendRequest(
    config,
    "/device/oura/oauth/exchange",
    { code: boundedString(code, "Oura authorization code", MAX_TOKEN_LENGTH), state: normalizedState },
    fetchImpl,
  ));
}

export async function refreshManagedOuraToken(
  config: ManagedOuraClientConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OuraOAuthTokenPayload> {
  return validateManagedTokenPayload(await managedBackendRequest(
    config,
    "/device/oura/oauth/refresh",
    { refresh_token: boundedString(refreshToken, "Managed Oura refresh token", MAX_TOKEN_LENGTH) },
    fetchImpl,
  ));
}

export async function saveToken(token: OuraToken): Promise<OuraToken> {
  if (!token.access_token || !token.refresh_token) {
    throw new Error("Refusing to save an Oura token without access_token and refresh_token");
  }
  const owner = requireCurrentConfirmedOuraOwner();
  if (token.owner_scope_digest !== owner.ownerScopeDigest) {
    throw new Error("Refusing to save an Oura token for a different owner");
  }
  const tokenFile = ouraTokenFileForConfirmedOwner(owner);
  const {
    authorization_generation: _authorizationGeneration,
    ...newAuthorization
  } = token;
  return saveNewOuraAuthorization<OuraToken>(tokenFile, newAuthorization, {
    validateBeforeSave: () => assertSameCurrentOwner(owner),
  });
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OuraToken> {
  const response = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Oura token exchange failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const savedAt = Math.trunc(Date.now() / 1000);
  const owner = requireCurrentConfirmedOuraOwner();
  const token: Omit<OuraToken, "authorization_generation"> = {
    owner_scope_digest: owner.ownerScopeDigest,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
    token_type: data.token_type ?? "Bearer",
    scope: data.scope,
    oauth_mode: "personal",
    authorized_at: savedAt,
    saved_at: savedAt,
  };
  return saveNewOuraAuthorization<OuraToken>(
    ouraTokenFileForConfirmedOwner(owner),
    token,
    { validateBeforeSave: () => assertSameCurrentOwner(owner) },
  );
}

function resolvePersonalOuraCredentials(
  config: LocalFileConfig,
  environment: Record<string, string | undefined>,
): { clientId: string; clientSecret: string } {
  const clientId = (environment.DAOBREW_OURA_CLIENT_ID || config.oura_client_id || "").trim();
  const clientSecret = (environment.DAOBREW_OURA_CLIENT_SECRET || config.oura_client_secret || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Cannot refresh personal-app Oura token: oura_client_id/oura_client_secret are not configured",
    );
  }
  return { clientId, clientSecret };
}

function sameManagedAuthority(
  current: ManagedOuraClientConfig,
  expected: ManagedOuraClientConfig,
): boolean {
  return current.apiUrl === expected.apiUrl
    && current.deviceCredential === expected.deviceCredential
    && current.ownerScopeDigest === expected.ownerScopeDigest;
}

function sameConfirmedOwner(
  current: ConfirmedTaskMapOwner,
  expected: ConfirmedTaskMapOwner,
): boolean {
  return current.userId === expected.userId
    && current.ownerScopeDigest === expected.ownerScopeDigest
    && current.deviceCredential === expected.deviceCredential
    && current.issuerUrl === expected.issuerUrl;
}

function assertSameCurrentOwner(expected: ConfirmedTaskMapOwner): void {
  const current = loadCurrentConfirmedOuraOwner();
  if (current === null || !sameConfirmedOwner(current, expected)) {
    throw new Error(
      "DaoBrew owner enrollment changed while Oura authorization was in progress. Reconnect Oura.",
    );
  }
}

export async function refreshAccessToken(
  token: OuraToken,
  options: OuraRefreshOptions = {},
): Promise<OuraToken> {
  if (!token.refresh_token) {
    throw new Error("Cannot refresh Oura token: no refresh_token");
  }
  const owner = requireCurrentConfirmedOuraOwner();
  assertCurrentOuraTokenOwner(token);
  const tokenFile = ouraTokenFileForConfirmedOwner(owner);
  const fetchImpl = options.fetchImpl ?? fetch;
  const environment = options.environment ?? process.env;
  const nowMs = options.nowMs ?? Date.now;
  let data: OuraOAuthTokenPayload | Record<string, unknown>;
  let validateAuthority: () => void;

  if (token.oauth_mode === "managed") {
    const authority = resolveManagedOuraClientConfig(owner);
    data = await refreshManagedOuraToken(authority, token.refresh_token, fetchImpl);
    validateAuthority = () => {
      assertSameCurrentOwner(owner);
      const currentOwner = requireCurrentConfirmedOuraOwner();
      const current = resolveManagedOuraClientConfig(currentOwner);
      if (!sameManagedAuthority(current, authority)) {
        throw new Error(
          "DaoBrew device enrollment changed while Oura refresh was in progress. Reconnect Oura.",
        );
      }
    };
  } else {
    // Missing oauth_mode is the pre-managed on-disk format and intentionally
    // remains a personal-app refresh for backward compatibility.
    const authority = resolvePersonalOuraCredentials(readLocalConfig(), environment);
    let response: Response;
    try {
      response = await fetchImpl(OURA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
          client_id: authority.clientId,
          client_secret: authority.clientSecret,
        }),
      });
    } catch {
      throw new Error("Oura token refresh service is unreachable");
    }
    if (!response.ok) throw new Error(`Oura token refresh failed: ${response.status}`);
    try {
      const payload = await response.json();
      if (!isRecord(payload)) throw new Error();
      boundedString(payload.access_token, "Oura access token", MAX_TOKEN_LENGTH);
      data = payload;
    } catch {
      throw new Error("Oura token refresh returned an invalid response");
    }
    validateAuthority = () => {
      assertSameCurrentOwner(owner);
      const current = resolvePersonalOuraCredentials(readLocalConfig(), environment);
      if (current.clientId !== authority.clientId || current.clientSecret !== authority.clientSecret) {
        throw new Error(
          "Oura application credentials changed while token refresh was in progress. Reconnect Oura.",
        );
      }
    };
  }

  const refreshedAtMs = nowMs();
  const savedAt = Math.trunc(refreshedAtMs / 1000);
  let authorizedAt = token.authorized_at ?? token.saved_at;
  if (!Number.isFinite(authorizedAt)) {
    try {
      authorizedAt = Math.trunc(statSync(tokenFile).mtimeMs / 1000);
    } catch {
      authorizedAt = savedAt;
    }
  }
  const newToken = refreshedOuraToken(token, data, refreshedAtMs, authorizedAt);
  const saved = await compareAndSwapOuraRefresh(tokenFile, token, newToken, {
    validateBeforeSave: validateAuthority,
  });
  return saved.token;
}

/** Pure refresh merge: token rotation must never masquerade as reconnect. */
export function refreshedOuraToken(
  token: OuraToken,
  data: any,
  nowMs = Date.now(),
  authorizedAt: number | undefined = token.authorized_at ?? token.saved_at,
): OuraToken {
  const savedAt = Math.trunc(nowMs / 1000);
  return {
    owner_scope_digest: token.owner_scope_digest,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: nowMs + (data.expires_in ?? 86400) * 1000,
    token_type: data.token_type ?? "Bearer",
    scope: data.scope ?? token.scope,
    oauth_mode: token.oauth_mode,
    authorization_generation: token.authorization_generation,
    authorized_at: authorizedAt,
    saved_at: savedAt,
  };
}

export async function fetchDailyReadiness(
  token: OuraToken,
  startDate?: string,
  endDate?: string,
  nextToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (nextToken) params.set("next_token", nextToken);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`${OURA_API_BASE}/daily_readiness${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

export async function fetchDailyActivity(
  token: OuraToken,
  startDate?: string,
  endDate?: string,
  nextToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (nextToken) params.set("next_token", nextToken);
  // Avoid fetching the large provider-specific MET/classification payload that
  // the canonical health adapter deliberately does not ingest.
  params.set("fields", "active_calories,steps,timestamp");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`${OURA_API_BASE}/daily_activity${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

/**
 * Read daily sleep documents for read-only context consumers. The sync adapter
 * continues to use `/sleep` for canonical interval metrics; daily scores stay
 * provider-linked context rather than being invented as backend metric types.
 */
export async function fetchDailySleep(
  token: OuraToken,
  startDate?: string,
  endDate?: string,
  nextToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (nextToken) params.set("next_token", nextToken);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`${OURA_API_BASE}/daily_sleep${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

export async function fetchHeartRate(
  token: OuraToken,
  startDate?: string,
  endDate?: string,
  nextToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_datetime", startDate);
  if (endDate) params.set("end_datetime", endDate);
  // The v2 heartrate route pages via next_token — a 30-day backfill will page.
  if (nextToken) params.set("next_token", nextToken);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`${OURA_API_BASE}/heartrate${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

export async function fetchSleep(
  token: OuraToken,
  startDate?: string,
  endDate?: string,
  nextToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (nextToken) params.set("next_token", nextToken);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetchImpl(`${OURA_API_BASE}/sleep${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}
