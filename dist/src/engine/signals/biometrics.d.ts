import { DaoBrewClient } from "../../client.js";
import type { MetricBaseline } from "../reasoner/biometric-endorsement.js";
import { HealthkitHistory, StateHistoryEntry } from "../../types.js";
export declare const DEFAULT_BIOMETRIC_METRICS: readonly ["heart_rate", "heart_rate_variability", "resting_heart_rate", "respiratory_rate", "step_count", "active_energy_burned"];
export interface BiometricsSignalOptions {
    metrics?: readonly string[];
    range?: string;
    stateLimit?: number;
    startTs?: number;
    endTs?: number;
    stateChunkDays?: number;
}
export interface BiometricSampleSignal {
    metric: string;
    value: number;
    timestamp: string;
    graph_source_ref: string;
    carried?: boolean;
}
export interface BiometricMetricSeries {
    metric: string;
    range: string;
    samples: BiometricSampleSignal[];
    aggregated: HealthkitHistory["aggregated"];
}
export interface StateSignal extends StateHistoryEntry {
    graph_source_ref: string;
}
export interface BiometricsSignals {
    metrics: BiometricMetricSeries[];
    states: StateSignal[];
}
/**
 * readBiometricSignals's return shape: the shared signals PLUS optional 30-day
 * per-metric baselines computed on the HTTP path. Declared locally (not imported
 * from biometricsDb.ts) to avoid an import cycle — biometricsDb.ts already
 * imports from this module, so the baseline type must NOT flow back the other way.
 */
export interface HttpBiometricsSignals extends BiometricsSignals {
    baselines?: MetricBaseline[];
}
export type BiometricsClient = Pick<DaoBrewClient, "getHealthkitHistory" | "getStateHistory">;
/** Epoch SECONDS for an ISO timestamp string, or NaN when unparseable. */
export declare function epochSecondsOf(iso: string): number;
/**
 * Pure 30-day per-metric baseline aggregate for the HTTP/non-Postgres path.
 * Parity with the Postgres aggregate at biometricsDb.ts (avg(value) +
 * count(DISTINCT UTC day)):
 *  - baseline_avg = mean(value) over samples with a finite value AND a
 *    parseable timestamp (single pass; divide by that filtered count `n`, never
 *    the raw length).
 *  - day_count = number of DISTINCT UTC calendar days among those same samples.
 *    Postgres buckets by `start_time_ts / 86400` (UNIX-seconds → UTC day); here
 *    each ISO string is converted to epoch seconds and bucketed by
 *    Math.floor(epochSec / 86400) — the SAME UTC-day bucket (UTC, not local).
 *  - Rows whose baseline_avg / day_count are non-finite (or n === 0) are dropped
 *    (parity with the psql NULL-avg filter). The >=7-day maturity gate is NOT
 *    applied here — the endorsement builder owns it; this just supplies day_count.
 */
export declare function computeHttpBaselines(samplesByMetric: Map<string, {
    value: number;
    timestamp: string;
}[]>): MetricBaseline[];
export declare function readBiometricSignals(client: BiometricsClient, options?: BiometricsSignalOptions): Promise<HttpBiometricsSignals>;
