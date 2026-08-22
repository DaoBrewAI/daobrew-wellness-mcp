// tests/biometric-endorsement.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBiometricEndorsement,
  type EndorsementSample,
  type MetricBaseline,
} from "../src/engine/reasoner/biometric-endorsement.js";

const HOUR = 3_600_000;
const T0 = 1_783_400_000_000; // arbitrary fixed epoch ms — never Date.now()

function hr(ts: number, value: number): EndorsementSample {
  return { metric_type: "heart_rate", value, unit: "bpm", start_time_ts: ts };
}
function hrv(ts: number, value: number): EndorsementSample {
  return { metric_type: "hrv", value, unit: "ms", start_time_ts: ts };
}

const BASELINES: MetricBaseline[] = [
  { metric_type: "heart_rate", baseline_avg: 79, day_count: 30 },
  { metric_type: "hrv", baseline_avg: 36, day_count: 30 },
];

describe("buildBiometricEndorsement", () => {
  it("computes avg + delta_pct per metric and a prebuilt summary string", () => {
    const samples = [hr(T0, 92), hr(T0 + HOUR, 96), hrv(T0, 28)];
    const out = buildBiometricEndorsement({
      samples, baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
      patterns: ["overdrive", "tension"],
      claimLevel: "context_only",
      timeZone: "America/Los_Angeles",
    });
    const hrMetric = out.biometric_summary.metrics.find(m => m.type === "heart_rate")!;
    assert.equal(hrMetric.avg, 94);            // (92+96)/2
    assert.equal(hrMetric.baseline_avg, 79);
    assert.equal(hrMetric.delta_pct, 19);      // round((94-79)/79*100)
    assert.equal(out.biometric_summary.sample_count, 3);
    assert.match(out.biometric_summary.summary, /HR 94 bpm avg/);
    assert.match(out.biometric_summary.summary, /19% above your 30-day baseline/);
    assert.match(out.biometric_summary.summary, /HRV 28 ?ms/);
  });

  it("young baseline (<7 days) → null baseline fields and absolute-only string", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94)],
      baselines: [{ metric_type: "heart_rate", baseline_avg: 79, day_count: 4 }],
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    const m = out.biometric_summary.metrics[0];
    assert.equal(m.baseline_avg, null);
    assert.equal(m.delta_pct, null);
    assert.doesNotMatch(out.biometric_summary.summary, /%/);           // no fabricated percentages
    assert.match(out.biometric_summary.summary, /HR 94 bpm avg/);
  });

  it("sparse window (<10 samples) appends the (sparse) qualifier", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 91), hr(T0 + HOUR, 91)],
      baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
      patterns: ["tension"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.match(out.biometric_summary.summary, /\(sparse\)/);
  });

  it("missing metric is omitted entirely — no n/a noise", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94)], baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.equal(out.biometric_summary.metrics.length, 1);
    assert.doesNotMatch(out.biometric_summary.summary, /hrv/i);
  });

  it("dedupes samples by (metric_type,start_time_ts) against device overlap", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 90), hr(T0, 90), hr(T0 + HOUR, 98)],   // first two = same reading, two devices
      baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
      patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.equal(out.biometric_summary.sample_count, 2);
    assert.equal(out.biometric_summary.metrics[0].avg, 94);   // (90+98)/2, not (90+90+98)/3
  });

  it("pattern endorsements: context_only wording is observational, never causal", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94), hrv(T0, 28)], baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["tension", "overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.equal(out.pattern_endorsements.length, 2);
    const tension = out.pattern_endorsements.find(p => p.key === "tension")!;
    assert.match(tension.summary, /HRV .*below your 30-day baseline/);
    for (const p of out.pattern_endorsements) {
      assert.doesNotMatch(p.summary, /caused|because of|due to|coincided/i);
    }
  });

  it("attribution_candidate may say 'coincided with'; still never 'caused'", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94)], baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["overdrive"], claimLevel: "attribution_candidate", timeZone: "UTC",
    });
    assert.doesNotMatch(out.pattern_endorsements[0].summary, /caused/i);
  });

  // Real-fixture regression (Task 4): the live pipeline emits the CANONICAL
  // metric name "heart_rate_variability" (DEFAULT_BIOMETRIC_METRICS), not "hrv".
  // It must render as HRV/ms, drive the tension picker, and never leave a
  // double space when a metric has no unit.
  it("recognizes the canonical heart_rate_variability metric name as HRV", () => {
    const hrvCanon = (ts: number, value: number): EndorsementSample =>
      ({ metric_type: "heart_rate_variability", value, unit: "ms", start_time_ts: ts });
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94), hrvCanon(T0, 28)],
      baselines: [
        { metric_type: "heart_rate", baseline_avg: 79, day_count: 30 },
        { metric_type: "heart_rate_variability", baseline_avg: 36, day_count: 30 },
      ],
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["tension", "overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.match(out.biometric_summary.summary, /HRV 28 ?ms/);
    const tension = out.pattern_endorsements.find(p => p.key === "tension")!;
    assert.match(tension.summary, /HRV .*below your 30-day baseline/);
  });

  it("never renders a double space when a metric has no unit", () => {
    const noUnit = (ts: number, value: number): EndorsementSample =>
      ({ metric_type: "step_count", value, unit: "", start_time_ts: ts });
    const out = buildBiometricEndorsement({
      samples: [noUnit(T0, 480)], baselines: [],
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["stagnation"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.doesNotMatch(out.biometric_summary.summary, /  /); // no doubled spaces
    for (const p of out.pattern_endorsements) assert.doesNotMatch(p.summary, /  /);
  });

  // --- Task 1 (review #1): omit zero metrics, sum cumulative metrics as totals ---

  it("omits metrics whose aggregate rounds to zero — no 'Energy 0 kcal' noise", () => {
    const out = buildBiometricEndorsement({
      samples: [hr(T0, 94), { metric_type: "active_energy_burned", value: 0.004, unit: "kcal", start_time_ts: T0 }],
      baselines: BASELINES, window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    assert.doesNotMatch(out.biometric_summary.summary, /Energy/i);
    assert.equal(out.biometric_summary.metrics.find(m => m.type === "active_energy_burned"), undefined);
  });

  it("cumulative metrics (energy, steps) SUM over the window and label as totals, no baseline pct", () => {
    const out = buildBiometricEndorsement({
      samples: [
        { metric_type: "step_count", value: 200, unit: "count", start_time_ts: T0 },
        { metric_type: "step_count", value: 280, unit: "count", start_time_ts: T0 + HOUR },
        hr(T0, 94),
      ],
      baselines: [...BASELINES, { metric_type: "step_count", baseline_avg: 300, day_count: 30 }],
      window: { start_ts: T0, end_ts: T0 + 2 * HOUR },
      patterns: ["overdrive"], claimLevel: "context_only", timeZone: "UTC",
    });
    const steps = out.biometric_summary.metrics.find(m => m.type === "step_count")!;
    assert.equal(steps.avg, 480);                    // SUM, not mean 240 (field name stays `avg` for contract compat)
    assert.equal(steps.delta_pct, null);             // per-sample baseline is not comparable to a window sum
    assert.match(out.biometric_summary.summary, /steps 480/);
    // Totals are not labeled "avg": no "avg" between "steps 480" and the next
    // " · " separator (scope to the steps segment, not the whole string — a
    // later instantaneous metric like "HR 94 bpm avg" legitimately carries avg).
    assert.doesNotMatch(out.biometric_summary.summary, /steps 480[^·]*avg/);
  });

  // --- Task 2 (review #2): structured metric.unit is self-contained ---

  it("structured metric carries a unit even when samples omit it (canonical names)", () => {
    const bare = (metric_type: string, value: number): EndorsementSample =>
      ({ metric_type, value, unit: "", start_time_ts: T0 });
    const out = buildBiometricEndorsement({
      samples: [
        bare("heart_rate_variability", 45),
        bare("resting_heart_rate", 58),
        bare("respiratory_rate", 14),
      ],
      baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["tension"], claimLevel: "context_only", timeZone: "UTC",
    });
    const byType = (t: string) => out.biometric_summary.metrics.find(m => m.type === t)!;
    assert.equal(byType("heart_rate_variability").unit, "ms");   // DEFAULT_UNITS fallback reaches the chip
    assert.equal(byType("resting_heart_rate").unit, "bpm");
    assert.equal(byType("respiratory_rate").unit, "brpm");
  });

  // --- Task 3 (review #5): fallback patterns must not duplicate endorsement lines ---

  it("distinct fallback patterns take distinct metrics — no duplicated endorsement lines", () => {
    const out = buildBiometricEndorsement({
      samples: [
        { metric_type: "heart_rate", value: 99, unit: "bpm", start_time_ts: T0 },
        { metric_type: "heart_rate_variability", value: 45, unit: "ms", start_time_ts: T0 },
      ],
      baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["depletion", "stagnation"], claimLevel: "context_only", timeZone: "UTC",
    });
    const [a, b] = out.pattern_endorsements;
    assert.notEqual(a.summary, b.summary);           // the two chips read differently
  });

  it("single available metric + two fallback patterns → second pattern falls back to state-scoring line, not a repeat", () => {
    const out = buildBiometricEndorsement({
      samples: [{ metric_type: "heart_rate", value: 99, unit: "bpm", start_time_ts: T0 }],
      baselines: [], window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["depletion", "stagnation"], claimLevel: "context_only", timeZone: "UTC",
    });
    const [a, b] = out.pattern_endorsements;
    assert.notEqual(a.summary, b.summary);                       // still not identical
    assert.match(a.summary, /HR 99 bpm/);                        // first pattern gets the one metric
    assert.match(b.summary, /flagged by state scoring/);         // second falls back, no repeat
    assert.deepEqual(b.metrics, []);                             // no metric attached to the fallback line
  });

  it("uses median for sparse instantaneous metric windows while mean remains default for dense windows", () => {
    const sparse = buildBiometricEndorsement({
      samples: [hr(T0, 60), hr(T0 + HOUR, 200), hr(T0 + 2 * HOUR, 62)],
      baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + 3 * HOUR },
      patterns: ["overdrive"],
      claimLevel: "context_only",
      timeZone: "UTC",
    });
    assert.equal(sparse.biometric_summary.metrics.find(m => m.type === "heart_rate")!.avg, 62);

    const dense = buildBiometricEndorsement({
      samples: Array.from({ length: 10 }, (_, index) => hr(T0 + index, index === 0 ? 200 : 60)),
      baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + HOUR },
      patterns: ["overdrive"],
      claimLevel: "context_only",
      timeZone: "UTC",
    });
    assert.equal(dense.biometric_summary.metrics.find(m => m.type === "heart_rate")!.avg, 74);
  });

  it("uses the median gate per metric, not across the total mixed window", () => {
    const mixed = buildBiometricEndorsement({
      samples: [
        hr(T0, 60), hr(T0 + HOUR, 200), hr(T0 + 2 * HOUR, 62),
        ...Array.from({ length: 7 }, (_, index) => hrv(T0 + index, 30 + index)),
      ],
      baselines: BASELINES,
      window: { start_ts: T0, end_ts: T0 + 3 * HOUR },
      patterns: ["overdrive"],
      claimLevel: "context_only",
      timeZone: "UTC",
    });
    assert.equal(mixed.biometric_summary.sample_count, 10);
    assert.equal(mixed.biometric_summary.metrics.find(m => m.type === "heart_rate")!.avg, 62);
  });
});
