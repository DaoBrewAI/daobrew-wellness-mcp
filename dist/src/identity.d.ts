import type { LocalFileConfig } from "./engine/local-config.js";
import { type TaskMapOwnerScope } from "./engine/taskmap/owner-scope.js";
export type IdentityPlan = {
    ok: true;
    userId: string;
} | {
    ok: false;
    reason: string;
};
export declare function resolveUserId(config: LocalFileConfig, explicit?: string): IdentityPlan;
export declare function clientOptionsFor(config: LocalFileConfig, userId: string): {
    apiKey: string;
    baseUrl: string | undefined;
    deviceId: string;
};
declare const CONFIRMED_TASKMAP_OWNER_AUTHORITY: unique symbol;
export interface TaskMapOwnerEnrollment extends TaskMapOwnerScope {
    readonly deviceCredential: string;
    readonly issuerUrl: string;
}
export interface ConfirmedTaskMapOwner extends TaskMapOwnerEnrollment {
    readonly [CONFIRMED_TASKMAP_OWNER_AUTHORITY]: true;
}
export type ConfirmedTaskMapOwnerPlan = {
    ok: true;
    owner: ConfirmedTaskMapOwner;
} | {
    ok: false;
    reason: string;
};
export type TaskMapOwnerEnrollmentPlan = {
    ok: true;
    owner: TaskMapOwnerEnrollment;
} | {
    ok: false;
    reason: string;
};
export interface TaskMapOwnerEnvironmentSelection {
    userId?: unknown;
    apiUrl?: unknown;
}
export interface TaskMapConfirmedOwnerConfig {
    user_id?: unknown;
    api_url?: unknown;
    device_credential?: unknown;
    device_credential_confirmed?: unknown;
}
export type CredentialBoundClientPlan = {
    ok: true;
    deviceCredential: string;
    apiUrl: string;
} | {
    ok: false;
    reason: string;
};
/**
 * Resolve an absolute backend route against the credential issuer origin.
 * Persisted enrollment URLs intentionally include `/api/v1`; treating that
 * value as a string prefix would duplicate the API path for device endpoints.
 */
export declare function credentialBoundApiEndpoint(apiUrl: string, route: `/api/v1/${string}`): string;
/**
 * Resolve the immutable, persisted enrollment used by production Task Map.
 * Environment values may confirm an already-persisted UUID but can never
 * supply or rebind its credential/issuer authority record.
 */
export declare function validateTaskMapOwnerEnrollment(config: TaskMapConfirmedOwnerConfig, environment: TaskMapOwnerEnvironmentSelection | undefined, homeDirectory: string): TaskMapOwnerEnrollmentPlan;
export declare function assertConfirmedTaskMapOwner(value: unknown): asserts value is ConfirmedTaskMapOwner;
/**
 * Load one installation-persisted enrollment. The path is fixed beneath the
 * supplied OS home; environment values can only confirm its UUID and can
 * never redirect or replace the credential/issuer authority record.
 */
export declare function loadConfirmedTaskMapOwner(homeDirectory: string, environment?: TaskMapOwnerEnvironmentSelection, afterDirectoryOpenForTesting?: () => Promise<void>): Promise<ConfirmedTaskMapOwnerPlan>;
/** Synchronous equivalent for startup/test harnesses that construct services. */
export declare function loadConfirmedTaskMapOwnerSync(homeDirectory: string, environment?: TaskMapOwnerEnvironmentSelection, afterDirectoryOpenForTesting?: () => void): ConfirmedTaskMapOwnerPlan;
/**
 * Bind a persisted bearer to the persisted URL that issued it. Environment
 * values are accepted only as an explicit paired development seam when no
 * credential is present in the owner-only config file.
 */
export declare function resolveCredentialBoundClient(config: LocalFileConfig, environment?: {
    deviceCredential?: unknown;
    apiUrl?: unknown;
}): CredentialBoundClientPlan;
export {};
