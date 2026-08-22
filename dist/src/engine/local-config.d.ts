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
export declare function localConfigPath(): string;
export declare function readLocalConfig(configFile?: string): LocalFileConfig;
export declare function mergeLocalConfig(updates: Record<string, unknown>, configFile?: string): LocalFileConfig;
export declare function adoptCanonicalUserId(userId: string, configFile?: string): {
    adopted: boolean;
    userId?: string;
    reason?: string;
};
/** GEMINI_API_KEY || GOOGLE_API_KEY || config.gemini_api_key || null */
export declare function resolveGeminiApiKey(): string | null;
export type RemoteLlmConsent = "granted" | "declined" | "undecided";
/** Resolve only the two durable user choices; malformed values fail closed. */
export declare function resolveRemoteLlmConsent(config?: LocalFileConfig): RemoteLlmConsent;
/** GRANOLA_API_TOKEN || config.granola_api_token || null */
export declare function resolveGranolaToken(): string | null;
