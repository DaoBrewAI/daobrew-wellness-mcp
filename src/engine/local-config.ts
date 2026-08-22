/**
 * Shared reader for the local DaoBrew config file (~/.daobrew/config.json,
 * overridable via DAOBREW_CONFIG_FILE). Mirrors the private readConfig() in
 * run.ts exactly: silent {} on a missing or malformed file — local config is
 * always optional and must never crash a run.
 *
 * Key resolution is env-first: explicit environment variables beat the config
 * file, and both resolvers return null (never throw) when nothing is set.
 * Empty-string env vars are treated as unset — the || chains are intentional;
 * do not "fix" them to ??.
 *
 * Engine and offline callers use this permissive reader. Authenticated client
 * paths use enrollment.ts instead so device credentials remain bound to the
 * API URL that issued them.
 *
 * LocalFileConfig is a PARTIAL view — the file may contain other keys written
 * by SentinelMac (memory_project_paths) or the engine (license_key); writers
 * must merge, never truncate.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mutateSecureClientConfig } from "../enrollment.js";
import { canonicalUserId } from "../user-id.js";

export interface LocalFileConfig {
  /** @deprecated Retained only while legacy local readers are removed. */
  api_key?: string;
  api_url?: string;
  /** Opaque server-issued device credential. Never a Postgres connection URL. */
  device_credential?: string;
  /** True only after the enrollment exchange confirms the credential. */
  device_credential_confirmed?: boolean;
  /** Legacy local selector retained in the partial type; backend clients ignore it. */
  device_id?: string;
  device_uuid?: string;
  /** Legacy/local graph selector; never sent to the authenticated backend. */
  user_id?: string;
  gemini_api_key?: string;
  remote_llm_consent?: "granted" | "declined";
  remote_llm_consent_at?: string;
  granola_api_token?: string;
  internal_port?: number;
  internal_token?: string;
  /** Self-managed Google Docs connector (BYO OAuth client). */
  gdocs_client_id?: string;
  gdocs_client_secret?: string;
  gdocs_folder_id?: string;
  /**
   * Managed OAuth is the installed-app default. `personal` is the explicit
   * advanced fallback for users who bring their own Oura OAuth application.
   */
  oura_oauth_mode?: "managed" | "personal";
  /** Advanced/legacy personal Oura OAuth application credentials. */
  oura_client_id?: string;
  oura_client_secret?: string;
}

export function localConfigPath(): string {
  return process.env.DAOBREW_CONFIG_FILE || join(homedir(), ".daobrew", "config.json");
}

export function readLocalConfig(configFile: string = localConfigPath()): LocalFileConfig {
  if (!existsSync(configFile)) return {};
  try {
    return JSON.parse(readFileSync(configFile, "utf-8")) as LocalFileConfig;
  } catch {
    return {};
  }
}

function validAdoptedUserId(userId: string): string | null {
  return canonicalUserId(userId);
}

export function mergeLocalConfig(
  updates: Record<string, unknown>,
  configFile: string = localConfigPath(),
): LocalFileConfig {
  return mutateSecureClientConfig(configFile, (current) => {
    const next: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  }) as LocalFileConfig;
}

export function adoptCanonicalUserId(
  userId: string,
  configFile: string = localConfigPath(),
): { adopted: boolean; userId?: string; reason?: string } {
  const validUserId = validAdoptedUserId(userId);
  if (!validUserId) return { adopted: false, reason: "invalid anchor user_id" };

  const config = readLocalConfig(configFile) as Record<string, unknown>;
  if (config.user_id === validUserId) {
    return { adopted: false, userId: validUserId, reason: "already current" };
  }

  mergeLocalConfig({ user_id: validUserId }, configFile);
  return { adopted: true, userId: validUserId };
}

/** GEMINI_API_KEY || GOOGLE_API_KEY || config.gemini_api_key || null */
export function resolveGeminiApiKey(): string | null {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    readLocalConfig().gemini_api_key ||
    null
  );
}

export type RemoteLlmConsent = "granted" | "declined" | "undecided";

/** Resolve only the two durable user choices; malformed values fail closed. */
export function resolveRemoteLlmConsent(
  config: LocalFileConfig = readLocalConfig(),
): RemoteLlmConsent {
  return config.remote_llm_consent === "granted"
      || config.remote_llm_consent === "declined"
    ? config.remote_llm_consent
    : "undecided";
}

/** GRANOLA_API_TOKEN || config.granola_api_token || null */
export function resolveGranolaToken(): string | null {
  return (
    process.env.GRANOLA_API_TOKEN ||
    readLocalConfig().granola_api_token ||
    null
  );
}
