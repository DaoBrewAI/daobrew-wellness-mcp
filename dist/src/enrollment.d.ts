export declare const DEFAULT_API_URL = "https://daobrew-backend-iaupcwo6dq-uw.a.run.app/api/v1";
export interface EnrollmentMetadata {
    surface: string;
    platform: string;
}
export interface DeviceEnrollment {
    deviceCredential: string;
    /** Returned only by a fresh exchange for response-integrity validation. */
    userId?: string;
    /** Returned only by a fresh exchange for response-integrity validation. */
    deviceId?: string;
    apiUrl: string;
}
export interface EnsureDeviceEnrollmentOptions {
    configFile: string;
    apiUrl?: string;
    metadata: EnrollmentMetadata;
    enrollmentGrant?: string;
    fetchImpl?: typeof fetch;
    existingConfig?: Record<string, unknown>;
}
export interface EnsuredDeviceEnrollment {
    enrollment: DeviceEnrollment;
    config: Record<string, unknown>;
    enrolled: boolean;
}
export type CredentialBoundClientConfig = {
    deviceCredential: string;
    apiUrl: string;
} | {
    deviceCredential?: undefined;
    apiUrl?: string;
};
export declare class EnrollmentNeededError extends Error {
    readonly reason: "no_migration_credential" | "legacy_exchange_rejected" | "grant_rejected";
    readonly code: "ENROLLMENT_NEEDED";
    constructor(reason: "no_migration_credential" | "legacy_exchange_rejected" | "grant_rejected", message: string);
}
export declare class BackendIncompatibleError extends Error {
    readonly route: "/version" | "/device/exchange" | "/device/enroll";
    readonly reason: "missing_route" | "contract_mismatch" | "old_contract";
    readonly code: "backend_incompatible";
    constructor(route: "/version" | "/device/exchange" | "/device/enroll", reason: "missing_route" | "contract_mismatch" | "old_contract");
}
export declare function normalizeApiUrl(raw: unknown): string;
export declare function isValidDeviceCredential(value: unknown): value is string;
export declare function isValidEnrollmentGrant(value: unknown): value is string;
export declare function isValidInstallationNonce(value: unknown): value is string;
export declare function newInstallationNonce(): string;
export declare function isValidLegacyApiKey(value: unknown): value is string;
/**
 * Resolve an authenticated HTTP client without ever rebinding a persisted
 * bearer to a caller-controlled environment URL.
 *
 * Project-local MCP configuration can set process environment variables. Once
 * an installation has a file-backed credential, its server-provisioned URL is
 * therefore part of the same authority record and both environment overrides
 * are ignored. A paired environment credential+URL remains available only when
 * no persisted credential exists, which keeps explicit test/development seams
 * without exposing the installed user's bearer.
 */
export declare function resolveCredentialBoundClientConfig(config: {
    device_credential?: unknown;
    api_url?: unknown;
}, environment?: {
    deviceCredential?: unknown;
    apiUrl?: unknown;
}): CredentialBoundClientConfig;
export declare function isValidEnrollmentId(value: unknown): value is string;
export declare function isValidEnrollmentUserId(value: unknown): value is string;
export declare function scrubLegacyClientSecrets(config: Record<string, unknown>): Record<string, unknown>;
export declare function scrubLegacyDatabaseSecrets(config: Record<string, unknown>): Record<string, unknown>;
export declare function hasLegacyClientSecrets(config: Record<string, unknown>): boolean;
export declare function readClientConfigFile(configFile: string): Record<string, unknown>;
export declare function writeSecureClientConfig(configFile: string, config: Record<string, unknown>): void;
/** Re-read and atomically replace config.json while holding config.lock. */
export declare function mutateSecureClientConfig(configFile: string, updater: (current: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown>;
export declare function enrollmentFromConfig(config: Record<string, unknown>, apiUrl: string): DeviceEnrollment | null;
export declare function parseEnrollmentResponse(body: unknown): DeviceEnrollment;
export declare function assertBackendContractCompatible(apiUrl: string, fetchImpl?: typeof fetch): Promise<number>;
export declare function requestLegacyDeviceExchange(apiUrl: string, legacyApiKey: string, metadata: EnrollmentMetadata, installationNonce: string, fetchImpl?: typeof fetch): Promise<DeviceEnrollment>;
export declare function requestDeviceEnrollment(apiUrl: string, enrollmentGrant: string, metadata: EnrollmentMetadata, installationNonce: string, fetchImpl?: typeof fetch): Promise<DeviceEnrollment>;
export declare function requestDeviceConfirmation(apiUrl: string, deviceCredential: string, installationNonce: string, fetchImpl?: typeof fetch): Promise<{
    userId?: string;
    deviceId?: string;
}>;
export declare function ensureDeviceEnrollment(options: EnsureDeviceEnrollmentOptions): Promise<EnsuredDeviceEnrollment>;
