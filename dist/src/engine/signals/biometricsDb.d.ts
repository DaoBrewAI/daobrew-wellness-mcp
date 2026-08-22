import { GraphStoreKind } from "../../graph-db.js";
import type { MetricBaseline } from "../reasoner/biometric-endorsement.js";
import { BiometricsClient, BiometricsSignalOptions, BiometricsSignals } from "./biometrics.js";
/**
 * The direct read augments the shared BiometricsSignals shape with 30-day
 * per-metric baselines (design 2026-07-07). The shared type stays untouched;
 * callers that don't care ignore the extra field. The HTTP path also populates
 * baselines now (from a month-range fetch — see readBiometricSignals, D-16); it
 * still degrades gracefully to an empty list (endorsement falls back to
 * absolute-only) when no baselines can be computed.
 */
export interface BiometricsSignalsWithBaselines extends BiometricsSignals {
    baselines?: MetricBaseline[];
}
/**
 * Direct Neon/Postgres biometrics source.
 *
 * The deployed backend writes its biometric tables (intraday_state,
 * health_samples) into the SAME warm-tier database the engine already reaches
 * through graph-db's server/operator environment URL mode. Reading them directly by
 * user_id sidesteps the backend HTTP API's windowing/identity quirks that
 * live-verified starved the reasoner (/state/history returned zero buckets
 * for a window Neon holds continuous 12h buckets for).
 *
 * Identity: rows are read under the resolved UUID anchor only. Historical
 * `apikey:` and raw device buckets are folded into that anchor by merge-on-claim
 * and the explicit remerge path; normal readers do not keep those legacy buckets
 * live.
 *
 * Scoping: these reads run through the plain graph-db executor, NOT
 * scopedQuery. The backend tables are backend-owned (no engine RLS policies)
 * and their in-table identity is the canonical UUID anchor.
 *
 */
/** Same executor shape graph-db exports; injectable for tests. */
export type SqlExecutor = <T = Record<string, any>>(sql: string) => Promise<T[]>;
export type BiometricSource = "neon-direct" | "api" | "none";
export interface DirectBiometricsOptions extends BiometricsSignalOptions {
    userId: string;
    /** Injectable executor; defaults to graph-db queryJson (call-time resolved). */
    query?: SqlExecutor;
    /** Injectable clock for the now-anchored sample window; unix seconds. */
    nowTs?: number;
}
export declare function readBiometricSignalsFromDb(options: DirectBiometricsOptions): Promise<BiometricsSignalsWithBaselines>;
export interface SelectBiometricsOptions extends DirectBiometricsOptions {
    /** HTTP fallback client; absent (no API key) means no fallback exists. */
    client?: BiometricsClient;
    /** Store-kind override for tests; defaults to graph-db resolution. */
    storeKind?: GraphStoreKind;
}
export interface BiometricsRead {
    signals: BiometricsSignalsWithBaselines;
    source: BiometricSource;
}
/**
 * Source selection: Postgres stores read biometrics directly from the warm
 * tier; ANY direct-path failure (connection, missing backend tables) falls
 * back to the HTTP client path with a warning, so cloud deploys and dev
 * machines keep working unchanged. SQLite stores go straight to HTTP.
 */
export declare function readBiometricSignalsPreferDirect(options: SelectBiometricsOptions, warnings: string[]): Promise<BiometricsRead>;
