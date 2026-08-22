export type OuraOAuthMode = "managed" | "personal";
export interface StoredOuraToken {
    /** Exact Task Map owner scope that authorized this provider grant. */
    owner_scope_digest?: string;
    access_token: string;
    refresh_token?: string;
    expires_at: number;
    token_type: string;
    scope?: string;
    oauth_mode?: OuraOAuthMode;
    authorization_generation?: string | number;
    authorized_at?: number;
    saved_at?: number;
}
export interface OuraTokenLockOptions {
    timeoutMs?: number;
    staleMs?: number;
    retryDelayMs?: number;
    now?: () => number;
    sleep?: (delayMs: number) => Promise<void>;
    nonce?: () => string;
}
export interface RefreshSaveResult<T extends StoredOuraToken> {
    token: T;
    saved: boolean;
}
export declare function normalizeAuthorizationGeneration(value: unknown): string | undefined;
export declare function createAuthorizationGeneration(nonce?: () => string): string;
export declare function ouraTokenLockPath(tokenFile: string): string;
export declare function ouraTokenTemporaryPath(tokenFile: string, pid?: number, nonce?: string): string;
export declare function readOuraTokenFile<T extends StoredOuraToken = StoredOuraToken>(tokenFile: string): T | null;
export declare function saveNewOuraAuthorization<T extends StoredOuraToken>(tokenFile: string, token: Omit<T, "authorization_generation">, options?: OuraTokenLockOptions & {
    generation?: () => string;
    validateBeforeSave?: () => void;
}): Promise<T>;
export declare function compareAndSwapOuraRefresh<T extends StoredOuraToken>(tokenFile: string, expected: T, refreshed: T, options?: OuraTokenLockOptions & {
    validateBeforeSave?: () => void;
}): Promise<RefreshSaveResult<T>>;
