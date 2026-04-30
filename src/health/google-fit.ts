import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PREFS_DIR = join(homedir(), ".daobrew");
const TOKEN_FILE = join(PREFS_DIR, "google-fit-token.json");
const FITNESS_API_BASE = "https://www.googleapis.com/fitness/v1/users/me";

export interface GoogleFitToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

export function isConnected(): boolean {
  return existsSync(TOKEN_FILE);
}

export function loadToken(): GoogleFitToken | null {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveToken(token: GoogleFitToken): void {
  if (!existsSync(PREFS_DIR)) mkdirSync(PREFS_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GoogleFitToken> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const token: GoogleFitToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type ?? "Bearer",
  };
  saveToken(token);
  return token;
}

export async function refreshAccessToken(
  token: GoogleFitToken,
  clientId: string,
  clientSecret: string,
): Promise<GoogleFitToken> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
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
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  const data = await response.json() as any;
  const newToken: GoogleFitToken = {
    access_token: data.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type ?? "Bearer",
  };
  saveToken(newToken);
  return newToken;
}

export async function fetchDataSources(token: GoogleFitToken): Promise<any> {
  const response = await fetch(`${FITNESS_API_BASE}/dataSources`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Google Fit API error: ${response.status}`);
  return response.json();
}

export async function fetchHeartRate(token: GoogleFitToken, startTimeMs: number, endTimeMs: number): Promise<any> {
  const response = await fetch(
    `${FITNESS_API_BASE}/dataset:aggregate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }],
        bucketByTime: { durationMillis: 3600000 },
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
      }),
    },
  );
  if (!response.ok) throw new Error(`Google Fit API error: ${response.status}`);
  return response.json();
}
