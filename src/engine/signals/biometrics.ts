import { DaoBrewClient } from "../../client.js";
import type { MetricBaseline } from "../reasoner/biometric-endorsement.js";
import {
  HealthkitHistory,
  StateHistory,
  StateHistoryEntry,
} from "../../types.js";

/** Days of history the per-metric HTTP baseline aggregates over. Mirrors the
 *  Postgres direct read's BASELINE_WINDOW_DAYS (biometricsDb.ts). */
const BASELINE_WINDOW_DAYS = 30;
/** Seconds per UTC day — the day bucket AND the 30-day span both divide by
 *  seconds (health timestamps are UNIX seconds once parsed). */
const SECONDS_PER_DAY = 86_400;

export const DEFAULT_BIOMETRIC_METRICS = [
  "heart_rate",
  "heart_rate_variability",
  "resting_heart_rate",
  "respiratory_rate",
  "step_count",
  "active_energy_burned",
] as const;

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

export type BiometricsClient = Pick<
  DaoBrewClient,
  "getHealthkitHistory" | "getStateHistory"
>;

/** Epoch SECONDS for an ISO timestamp string, or NaN when unparseable. */
export function epochSecondsOf(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

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
export function computeHttpBaselines(
  samplesByMetric: Map<string, { value: number; timestamp: string }[]>,
): MetricBaseline[] {
  const baselines: MetricBaseline[] = [];
  for (const [metric_type, samples] of samplesByMetric) {
    let n = 0;
    let sum = 0;
    const days = new Set<number>();
    for (const sample of samples) {
      if (!Number.isFinite(sample.value)) continue;
      const epochSec = epochSecondsOf(sample.timestamp);
      if (!Number.isFinite(epochSec)) continue;
      n += 1;
      sum += sample.value;
      days.add(Math.floor(epochSec / SECONDS_PER_DAY));
    }
    if (n === 0) continue;
    const baseline_avg = sum / n;
    const day_count = days.size;
    if (!Number.isFinite(baseline_avg) || !Number.isFinite(day_count)) continue;
    baselines.push({ metric_type, baseline_avg, day_count });
  }
  return baselines;
}

async function readStateHistory(
  client: BiometricsClient,
  limit: number,
  startTs?: number,
  endTs?: number,
  chunkDays?: number,
): Promise<StateHistory> {
  if (
    startTs === undefined ||
    endTs === undefined ||
    chunkDays === undefined ||
    chunkDays <= 0 ||
    endTs <= startTs
  ) {
    return client.getStateHistory(limit, startTs, endTs);
  }

  const chunkSec = Math.max(1, Math.trunc(chunkDays * 24 * 60 * 60));
  const byBucket = new Map<number, StateHistoryEntry>();
  let totalCount = 0;

  for (let chunkStart = startTs; chunkStart <= endTs; chunkStart += chunkSec) {
    const chunkEnd = Math.min(endTs, chunkStart + chunkSec - 1);
    const history = await client.getStateHistory(limit, chunkStart, chunkEnd);
    totalCount += history.total_count ?? history.states.length;
    for (const state of history.states) {
      const previous = byBucket.get(state.bucket_ts);
      if (!previous || state.updated_at_ts >= previous.updated_at_ts) {
        byBucket.set(state.bucket_ts, state);
      }
    }
  }

  const states = [...byBucket.values()].sort((a, b) => a.bucket_ts - b.bucket_ts);
  return {
    states,
    total_count: totalCount,
    limit,
  };
}

export async function readBiometricSignals(
  client: BiometricsClient,
  options: BiometricsSignalOptions = {},
): Promise<HttpBiometricsSignals> {
  const metrics = options.metrics ?? DEFAULT_BIOMETRIC_METRICS;
  const range = options.range ?? "week";
  const stateLimit = options.stateLimit ?? 24;

  // 30-day baseline fetch: a SEPARATE per-metric month-range history, distinct
  // from the display-`range` fetch below, so the episode's own window samples
  // (driving `avg`) stay on the caller's range while the baseline is always
  // ~30 days. getHealthkitHistory resolves "month" server-side against NOW and
  // takes no explicit bounds (client.ts), so replay is best-effort filtered
  // below — a known HTTP-path limitation the Postgres direct read doesn't have.
  // Isolated from the primary read (own await + catch): the baseline is a
  // SUPPLEMENTARY signal, so a month-fetch failure must only null the baselines,
  // never sink the display/state read the caller previously got.
  const baselineHistories = await Promise.all(
    metrics.map((metric) => client.getHealthkitHistory(metric, "month")),
  ).catch(() => [] as HealthkitHistory[]);

  const [metricHistories, stateHistory] = await Promise.all([
    Promise.all(metrics.map((metric) => client.getHealthkitHistory(metric, range))),
    readStateHistory(client, stateLimit, options.startTs, options.endTs, options.stateChunkDays),
  ]);

  // Baseline windowing/anchoring. `endTs`/`startTs` are UNIX SECONDS.
  //  - endTs undefined (live run): "month" already == the last 30 days ending
  //    now, so use all returned samples.
  //  - endTs set (replay): the month response is anchored on NOW (the client
  //    cannot pass bounds), so filter in-process to [endTs - 30d, endTs) so the
  //    baseline honors the replay window as best-effort. HTTP replay baselines
  //    are therefore bounded by whatever the now-anchored month response holds.
  const baselineEndTs = options.endTs;
  const baselineStartTs =
    baselineEndTs === undefined ? undefined : baselineEndTs - BASELINE_WINDOW_DAYS * SECONDS_PER_DAY;
  const samplesByMetric = new Map<string, { value: number; timestamp: string }[]>();
  for (const history of baselineHistories) {
    const inWindow = history.samples.filter((sample) => {
      if (baselineEndTs === undefined) return true;
      const epochSec = epochSecondsOf(sample.timestamp);
      if (!Number.isFinite(epochSec)) return false;
      return epochSec >= (baselineStartTs as number) && epochSec < baselineEndTs;
    });
    samplesByMetric.set(
      history.metric,
      inWindow.map((sample) => ({ value: sample.value, timestamp: sample.timestamp })),
    );
  }
  const baselines = computeHttpBaselines(samplesByMetric);

  return {
    metrics: metricHistories.map((history) => ({
      metric: history.metric,
      range: history.range,
      aggregated: history.aggregated,
      samples: history.samples.map((sample) => ({
        metric: history.metric,
        value: sample.value,
        timestamp: sample.timestamp,
        graph_source_ref: `healthkit:${history.metric}:${sample.timestamp}`,
      })),
    })),
    states: stateHistory.states.map((state) => ({
      ...state,
      graph_source_ref: `state:${state.bucket_ts}`,
    })),
    baselines,
  };
}
