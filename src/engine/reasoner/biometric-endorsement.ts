// src/engine/reasoner/biometric-endorsement.ts
/**
 * Pure biometric endorsement builder (design 2026-07-07). Turns an episode's
 * raw samples + per-metric baselines into (a) a structured biometric_summary
 * and (b) per-pattern data-endorsement lines. NO I/O here — callers fetch;
 * this formats. Strings are DESCRIPTIVE, never causal: claim_level gates the
 * one allowed strengthening ("coincided with" at attribution_candidate).
 */

export interface EndorsementSample {
  metric_type: string;        // "heart_rate" | "hrv" | "active_energy_burned" | ...
  value: number;
  unit: string;               // "bpm" | "ms" | "kcal"
  start_time_ts: number;      // epoch ms
}
export interface MetricBaseline {
  metric_type: string;
  baseline_avg: number;
  day_count: number;          // days of history behind the average
}
export interface EndorsementInput {
  samples: EndorsementSample[];
  baselines: MetricBaseline[];
  window: { start_ts: number; end_ts: number };
  patterns: string[];         // e.g. ["overdrive","tension"] — order preserved
  claimLevel: "context_only" | "attribution_candidate";
  timeZone: string;           // for the window's HH:MM rendering
}
export interface MetricSummary {
  type: string; avg: number; unit: string;
  baseline_avg: number | null; delta_pct: number | null;
}
export interface BiometricEndorsement {
  biometric_summary: {
    window: { start_ts: number; end_ts: number };
    sample_count: number;
    metrics: MetricSummary[];
    patterns: string[];
    summary: string;
  };
  pattern_endorsements: { key: string; summary: string; metrics: MetricSummary[] }[];
}

const MIN_BASELINE_DAYS = 7;
const SPARSE_THRESHOLD = 10;
// The live pipeline emits the CANONICAL metric names from DEFAULT_BIOMETRIC_METRICS
// (e.g. "heart_rate_variability"); the "hrv" short form only appears on the
// separate prodPort path. Recognize both so real fixtures render correctly.
const DISPLAY: Record<string, string> = {
  heart_rate: "HR",
  hrv: "HRV",
  heart_rate_variability: "HRV",
  active_energy_burned: "Energy",
  step_count: "steps",
};
/** Cumulative metrics accumulate over the window: their meaningful aggregate is
 *  the SUM (window total), not a per-sample mean, so they render as totals
 *  ("steps 480", "Energy 132 kcal") with no "avg" suffix and no baseline delta
 *  (a per-sample baseline is not comparable to a window sum). */
const CUMULATIVE_TYPES = new Set(["active_energy_burned", "step_count"]);
/** Units are not carried on every sample; fall back to a per-metric default so
 *  HRV reads "45 ms", not "45  " (a doubled space with no unit). Includes the
 *  canonical metric names (heart_rate_variability, resting_heart_rate,
 *  respiratory_rate, step_count) so the structured metric.unit is self-contained
 *  and the Mac chip renders "ms"/"bpm"/etc. even when the sample omitted a unit. */
const DEFAULT_UNITS: Record<string, string> = {
  heart_rate: "bpm",
  hrv: "ms",
  heart_rate_variability: "ms",
  active_energy_burned: "kcal",
  resting_heart_rate: "bpm",
  respiratory_rate: "brpm",
  step_count: "count",
};
/** Metrics that mean HRV, whichever spelling the source used. */
const HRV_TYPES = new Set(["hrv", "heart_rate_variability"]);

function label(type: string): string {
  return DISPLAY[type] ?? type.replace(/_/g, " ");
}
/** Instantaneous metrics: "HR 94 bpm avg" (or "HRV 45 avg" with no unit).
 *  Cumulative metrics (energy, steps) are window TOTALS, rendered without the
 *  "avg" suffix: "steps 480", "Energy 132 kcal". `m.avg` holds the sum in that
 *  case (the JSON field name stays `avg` for Swift-contract compatibility). */
function metricHead(m: MetricSummary): string {
  const unit = m.unit || DEFAULT_UNITS[m.type] || "";
  const value = unit ? `${m.avg} ${unit}` : `${m.avg}`;
  if (CUMULATIVE_TYPES.has(m.type)) return `${label(m.type)} ${value}`;
  return `${label(m.type)} ${value} avg`;
}
function fmtTime(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone })
    .format(new Date(ts));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function buildBiometricEndorsement(input: EndorsementInput): BiometricEndorsement {
  // dedupe (metric_type,start_time_ts) — device overlap must not double-count
  const seen = new Set<string>();
  const samples = input.samples.filter(s => {
    const k = `${s.metric_type}@${s.start_time_ts}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const byType = new Map<string, EndorsementSample[]>();
  for (const s of samples) {
    (byType.get(s.metric_type) ?? byType.set(s.metric_type, []).get(s.metric_type)!).push(s);
  }

  const metrics: MetricSummary[] = [...byType.entries()].map(([type, arr]) => {
    // Self-contained unit: prefer the sample's unit, else the per-metric default,
    // so the structured metric (Mac chip reads from it) never ships unit "".
    const unit = arr[0].unit || DEFAULT_UNITS[type] || "";
    const sum = arr.reduce((a, s) => a + s.value, 0);
    if (CUMULATIVE_TYPES.has(type)) {
      // Cumulative metric: `avg` field carries the window SUM (contract-compat
      // name); no baseline delta (a per-sample baseline can't compare to a sum).
      return { type, avg: Math.round(sum), unit, baseline_avg: null, delta_pct: null };
    }
    const aggregate = arr.length < SPARSE_THRESHOLD
      ? median(arr.map((sample) => sample.value))
      : sum / arr.length;
    const avg = Math.round(aggregate);
    const base = input.baselines.find(b => b.metric_type === type);
    const mature = base && base.day_count >= MIN_BASELINE_DAYS;
    const delta = mature ? Math.round(((avg - base!.baseline_avg) / base!.baseline_avg) * 100) : null;
    return { type, avg, unit, baseline_avg: mature ? base!.baseline_avg : null, delta_pct: delta };
  })
    // Drop metrics whose aggregate rounds to zero — no "Energy 0 kcal" noise in
    // either the structured metrics or the summary string (both derive from here).
    .filter(m => m.avg !== 0);

  const sparse = samples.length < SPARSE_THRESHOLD;
  const parts = metrics.map(m => {
    const head = metricHead(m);
    if (m.delta_pct === null) return head;
    const dir = m.delta_pct >= 0 ? "above" : "below";
    return `${head} — ${Math.abs(m.delta_pct)}% ${dir} your 30-day baseline`;
  });
  const windowStr = `${fmtTime(input.window.start_ts, input.timeZone)}–${fmtTime(input.window.end_ts, input.timeZone)}`;
  const summary =
    `${parts.join(" · ")} · ${samples.length} samples${sparse ? " (sparse)" : ""}, ${windowStr}`;

  // per-pattern endorsement: pick the metric that best characterizes the pattern
  // (tension → HRV-below; overdrive → HR-above; fallback = largest |delta|), observational wording.
  const linkWord = input.claimLevel === "attribution_candidate" ? " — coincided with the cited work" : "";
  const byDelta = [...metrics].sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0));
  const pick = (want: (m: MetricSummary) => boolean) => byDelta.find(want) ?? byDelta[0];

  // Track metric types already spoken for, so adjacent fallback patterns don't
  // repeat the SAME endorsement line (review #5). Tension/overdrive keep their
  // targeted metric; every other pattern takes the next UNUSED metric by |delta|,
  // and once metrics run out it gets the state-scoring line instead of a repeat.
  const usedTypes = new Set<string>();
  const nextUnused = () => byDelta.find(x => !usedTypes.has(x.type));
  const pattern_endorsements = input.patterns.map(key => {
    const m = key === "tension"
      ? pick(x => HRV_TYPES.has(x.type) && (x.delta_pct ?? 0) < 0)
      : key === "overdrive"
        ? pick(x => x.type === "heart_rate" && (x.delta_pct ?? 0) > 0)
        : nextUnused();
    if (m) usedTypes.add(m.type);
    let line: string;
    if (!m) {
      line = `flagged by state scoring across the window${sparse ? " (sparse data)" : ""}`;
    } else if (m.delta_pct === null) {
      // No mature baseline → absolute-only line. Sparse windows are annotated but
      // never fabricate a percentage. When a mature delta IS present (below), the
      // baseline-relative phrasing is used even on sparse windows — the design's
      // language rule keeps the pattern line data-endorsing, with (sparse) reserved
      // for the summary string.
      line = `${metricHead(m)} during the flagged window${sparse ? " (sparse)" : ""}`;
    } else {
      const dir = m.delta_pct >= 0 ? "above" : "below";
      line = `${label(m.type)} ${Math.abs(m.delta_pct)}% ${dir} your 30-day baseline during the flagged window${linkWord}`;
    }
    return { key, summary: line, metrics: m ? [m] : [] };
  });

  return {
    biometric_summary: {
      window: input.window, sample_count: samples.length,
      metrics, patterns: input.patterns, summary,
    },
    pattern_endorsements,
  };
}
