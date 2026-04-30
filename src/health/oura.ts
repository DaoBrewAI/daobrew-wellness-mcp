import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PREFS_DIR = join(homedir(), ".daobrew");
const TOKEN_FILE = join(PREFS_DIR, "oura-token.json");
const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";

export interface OuraToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export function isConnected(): boolean {
  return existsSync(TOKEN_FILE);
}

export function loadToken(): OuraToken | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveToken(token: OuraToken): void {
  if (!existsSync(PREFS_DIR)) mkdirSync(PREFS_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<OuraToken> {
  const response = await fetch("https://api.ouraring.com/oauth/token", {
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
  const token: OuraToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
    token_type: data.token_type ?? "Bearer",
  };
  saveToken(token);
  return token;
}

export async function refreshAccessToken(token: OuraToken): Promise<OuraToken> {
  // Read from env or config file
  let fileConfig: any = {};
  const configFile = join(homedir(), ".daobrew", "config.json");
  try { fileConfig = JSON.parse(readFileSync(configFile, "utf-8")); } catch {}
  const clientId = process.env.DAOBREW_OURA_CLIENT_ID ?? fileConfig.oura_client_id ?? "";
  const clientSecret = process.env.DAOBREW_OURA_CLIENT_SECRET ?? fileConfig.oura_client_secret ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Cannot refresh Oura token: oura_client_id/oura_client_secret not set in ~/.daobrew/config.json");
  }

  const response = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Oura token refresh failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const newToken: OuraToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 86400) * 1000,
    token_type: data.token_type ?? "Bearer",
  };
  saveToken(newToken);
  return newToken;
}

export async function fetchDailyReadiness(token: OuraToken, startDate?: string, endDate?: string): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${OURA_API_BASE}/daily_readiness${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

export async function fetchHeartRate(token: OuraToken, startDate?: string, endDate?: string): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_datetime", startDate);
  if (endDate) params.set("end_datetime", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${OURA_API_BASE}/heartrate${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}

export async function fetchSleep(token: OuraToken, startDate?: string, endDate?: string): Promise<any> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${OURA_API_BASE}/sleep${qs}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Oura API error: ${response.status}`);
  return response.json();
}
