import { IncomingMessage, Server, ServerResponse } from "node:http";
import { LocalFileConfig } from "./local-config.js";
import { IdentityPlan } from "../identity.js";
import { graphStoreKind } from "../graph-db.js";
import type { EngineRunOptions, EngineRunResult } from "./run.js";
import type { TaskMapNativeRefreshResponse } from "./taskmap/native-refresh-service.js";
import type { TaskMapOwnerRefreshTrigger } from "./taskmap/owner-refresh-coordinator.js";
/**
 * Multi-user mode (deliverable 2): run a per-user job across EVERY active
 * identity in the data instead of a single configured user. Entered only on
 * explicit opt-in (`{"allUsers": true}` on the HTTP route, `DAOBREW_MULTI_USER=1`
 * for the --run CLI); single-user invocation stays byte-identical.
 *
 * Identities come from the unscoped owner-path discovery (identity-discovery.ts
 * — DISTINCT user_id over recent biometric + insight activity, deduped). Each
 * identity's per-user job still runs GUC-scoped to ITS user (layer2ScopedDeps),
 * so cross-user discovery never leaks into per-user reads/writes. One
 * identity's failure must NOT stop the rest: outcomes are collected per
 * identity and reported as counts.
 */
export interface PerIdentityOutcome {
    userId: string;
    status: "ok" | "error";
    result?: unknown;
    error?: string;
}
export interface MultiUserRunReport {
    usersTotal: number;
    usersOk: number;
    usersFailed: number;
    results: PerIdentityOutcome[];
}
export interface MultiUserRunOptions {
    /** Injectable identity source for tests; defaults to discoverActiveIdentities. */
    discover?: () => Promise<string[]>;
}
export declare function runForAllUsers(runOne: (userId: string) => Promise<unknown>, opts?: MultiUserRunOptions): Promise<MultiUserRunReport>;
export declare function resolveInternalUserId(payload?: Record<string, any>, config?: LocalFileConfig): IdentityPlan;
export type InternalRequestUserIdPlan = {
    ok: true;
    userId: string;
} | {
    ok: false;
    reason: string;
};
/** Task Map refresh is a single-owner local control-plane route. Keep its
 * identity contract stricter than the multi-user engine/maintenance routes:
 * the configured owner must be canonical, and a supplied payload identity
 * may only confirm that same owner. */
export declare function resolveInternalRequestUserId(payload: Record<string, unknown>, configuredRaw: unknown): InternalRequestUserIdPlan;
export declare function handleRequest(req: IncomingMessage, res: ServerResponse, serverOpts?: InternalServerOptions): Promise<void>;
export interface EmbedSweepRunOptions {
    tables?: string[];
    batchSize?: number;
    limit?: number;
}
export declare function runEmbedSweep(options?: EmbedSweepRunOptions): Promise<{
    rowsEmbedded: number;
    geminiCallsUsed: number;
    warnings: string[];
    alerts: string[];
    tables: Record<string, {
        rowsEmbedded: number;
        geminiCallsUsed: number;
    }>;
}>;
/**
 * Server-construction options. `discover` is a test/injection seam for the
 * multi-user routes: it overrides how active identities are enumerated so a
 * route test can exercise the `allUsers` branch without a live database. In
 * production it is omitted and runForAllUsers falls back to the real
 * discoverActiveIdentities.
 */
export interface InternalServerOptions extends MultiUserRunOptions {
    /** Test seam and deployment boundary for the token-gated engine proxy. */
    runEngineOnce?: (options: EngineRunOptions) => Promise<EngineRunResult>;
    enableDebugTaskMapRefresh?: boolean;
    taskMapRefresh?: (trigger: TaskMapOwnerRefreshTrigger) => Promise<TaskMapNativeRefreshResponse>;
    /** Hermetic server-test seam. Production uses DAOBREW_INTERNAL_USER. */
    expectedUserId?: string;
}
export declare function createInternalServer(options?: InternalServerOptions): Server;
/** DAOBREW_INTERNAL_PORT wins; Cloud Run's injected PORT is the fallback so
 *  the container listens where the platform routes; 8787 for local/launchd. */
export declare function resolveInternalPort(): number;
/**
 * Fail-closed storage gate invoked before the HTTP socket is opened. Injectable
 * dependencies keep the ordering contract unit-testable without a live DB.
 */
export declare function prepareInternalServerStorage(storeKind?: () => ReturnType<typeof graphStoreKind>, ensure?: () => void): void;
