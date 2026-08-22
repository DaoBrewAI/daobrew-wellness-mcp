import { type ConfirmedTaskMapOwner } from "../identity.js";
import { StoredOuraToken } from "./oura-token-store.js";
declare const MANAGED_REDIRECT_URI = "http://localhost:8791/callback";
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
export interface OuraToken extends StoredOuraToken {
}
declare const CURRENT_OURA_OWNER_GUARD_AUTHORITY: unique symbol;
export interface CurrentOuraOwnerGuard {
    readonly [CURRENT_OURA_OWNER_GUARD_AUTHORITY]: true;
    readonly ownerScopeDigest: string;
}
export declare function needsRefresh(token: OuraToken, nowMs: number): boolean;
export declare function isConnected(): boolean;
export declare function loadCurrentConfirmedOuraOwner(): ConfirmedTaskMapOwner | null;
export declare function ouraTokenFileForConfirmedOwner(owner: ConfirmedTaskMapOwner): string;
export declare function loadOuraTokenForConfirmedOwner(owner: ConfirmedTaskMapOwner): OuraToken | null;
export declare function assertCurrentOuraTokenOwner(token: OuraToken): void;
export declare function captureCurrentOuraOwnerGuard(token: OuraToken): CurrentOuraOwnerGuard;
export declare function assertCurrentOuraOwnerGuard(guard: CurrentOuraOwnerGuard): void;
export declare function loadToken(): OuraToken | null;
export declare function resolveManagedOuraClientConfig(owner: ConfirmedTaskMapOwner): ManagedOuraClientConfig;
export declare function startManagedOuraAuthorization(config: ManagedOuraClientConfig, fetchImpl?: typeof fetch): Promise<ManagedOuraAuthorizationStart>;
export declare function exchangeManagedOuraCode(config: ManagedOuraClientConfig, code: string, state: string, fetchImpl?: typeof fetch): Promise<OuraOAuthTokenPayload>;
export declare function refreshManagedOuraToken(config: ManagedOuraClientConfig, refreshToken: string, fetchImpl?: typeof fetch): Promise<OuraOAuthTokenPayload>;
export declare function saveToken(token: OuraToken): Promise<OuraToken>;
export declare function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<OuraToken>;
export declare function refreshAccessToken(token: OuraToken, options?: OuraRefreshOptions): Promise<OuraToken>;
/** Pure refresh merge: token rotation must never masquerade as reconnect. */
export declare function refreshedOuraToken(token: OuraToken, data: any, nowMs?: number, authorizedAt?: number | undefined): OuraToken;
export declare function fetchDailyReadiness(token: OuraToken, startDate?: string, endDate?: string, nextToken?: string, fetchImpl?: typeof fetch): Promise<any>;
export declare function fetchDailyActivity(token: OuraToken, startDate?: string, endDate?: string, nextToken?: string, fetchImpl?: typeof fetch): Promise<any>;
/**
 * Read daily sleep documents for read-only context consumers. The sync adapter
 * continues to use `/sleep` for canonical interval metrics; daily scores stay
 * provider-linked context rather than being invented as backend metric types.
 */
export declare function fetchDailySleep(token: OuraToken, startDate?: string, endDate?: string, nextToken?: string, fetchImpl?: typeof fetch): Promise<any>;
export declare function fetchHeartRate(token: OuraToken, startDate?: string, endDate?: string, nextToken?: string, fetchImpl?: typeof fetch): Promise<any>;
export declare function fetchSleep(token: OuraToken, startDate?: string, endDate?: string, nextToken?: string, fetchImpl?: typeof fetch): Promise<any>;
export {};
