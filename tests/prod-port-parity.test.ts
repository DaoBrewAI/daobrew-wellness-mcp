/**
 * Numeric parity test: src/engine/signals/prodPort.ts vs the committed golden
 * timeline produced by the Python driver
 * fixtures/causal-engine-v2/scripts/reunify/reconstruct_unified.py running the
 * EXACT production inference code (prod_features_main.py sha 5701517 +
 * daobrew_backend/state_inference).
 *
 * Re-runs the full daily walk (2026-03-18 .. 2026-07-02, fixed PDT -7h day
 * boundaries, rolling EMA baselines updated only on worn days,
 * previous_state=None, min_hr_samples=3) in TypeScript and asserts:
 *  - source_quality matches the golden for every one of the 107 days
 *  - dominant_pattern_raw_pre_gate matches day-by-day on worn (real_inference) days
 *  - the aggregate raw distribution is exactly
 *    TENSION 40 / OVERDRIVE 18 / STAGNATION 4 / CONSTRICTION 1 / DEPLETION 0
 *  - yin_score / yang_score within +/-1 of golden on worn days. Both sides are
 *    IEEE754 doubles and in practice match exactly (Python statistics.mean is
 *    exact-fraction arithmetic vs Neumaier-compensated summation in the port —
 *    a <=1 ulp difference that could in principle flip a round()/int()
 *    boundary, hence the spec'd tolerance).
 */
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Baselines,
  HkWindow,
  WUXING_ELEMENTS,
  extractIntradayFeatures,
  inferWuxingStates,
  inferYinYangState,
  normalizeForWuxing,
  updateBaselinesFromFeatures,
} from "../src/engine/signals/prodPort.js";

const FIXTURES = join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "causal-engine-v2",
  "data",
  "reunified",
);

const unified = JSON.parse(readFileSync(join(FIXTURES, "unified_v2.json"), "utf-8"));
const golden = JSON.parse(
  readFileSync(join(FIXTURES, "pattern_timeline_v2.json"), "utf-8"),
);

// DaobrewIOS Models.swift:136-168 element -> pattern vocabulary
const PATTERN_NAME: Record<string, string> = {
  wood: "TENSION",
  fire: "OVERDRIVE",
  earth: "STAGNATION",
  metal: "CONSTRICTION",
  water: "DEPLETION",
};

const EXPECTED_RAW_DISTRIBUTION: Record<string, number> = {
  TENSION: 40,
  OVERDRIVE: 18,
  STAGNATION: 4,
  CONSTRICTION: 1,
  DEPLETION: 0,
};

type Series = Array<[number, number]>;

/** Mirrors reconstruct_unified.load(): (epoch_seconds, value) sorted as Python tuples. */
function loadSeries(metric: string): Series {
  const samples: Array<{ ts: string; value: number }> = unified.metrics[metric] ?? [];
  const out: Series = samples.map((s) => [Date.parse(s.ts) / 1000, Number(s.value)]);
  // Python sorted() on (ts, value) tuples: ts first, value tie-break.
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out;
}

function inRange(series: Series, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (const [t, v] of series) {
    if (lo <= t && t < hi) out.push(v);
  }
  return out;
}

interface WalkDay {
  date: string;
  source_quality: string;
  dominant_pattern_raw_pre_gate: string | null;
  yin_score: number | null;
  yang_score: number | null;
}

/** Re-runs the reconstruct_unified.py daily walk via the TS port. */
function runDailyWalk(nDays: number): WalkDay[] {
  const hr = loadSeries("heart_rate");
  const hrv = loadSeries("heart_rate_variability");
  const steps = loadSeries("step_count");
  const energy = loadSeries("active_energy_burned");
  const resp = loadSeries("respiratory_rate");

  // Pacific local day boundaries, fixed PDT -7h for the whole window
  // (Mar-Jul all DST): day start = 2026-03-18T00:00:00-07:00.
  const DAY_SECONDS = 86400;
  const startSec = Date.UTC(2026, 2, 18, 7, 0, 0) / 1000;

  const baselines: Baselines = {};
  const timeline: WalkDay[] = [];

  for (let i = 0; i < nDays; i++) {
    const lo = startSec + i * DAY_SECONDS;
    const hi = lo + DAY_SECONDS;
    const hk: HkWindow = {
      heart_rate: inRange(hr, lo, hi),
      heart_rate_variability: inRange(hrv, lo, hi),
      step_count: inRange(steps, lo, hi),
      active_energy_burned: inRange(energy, lo, hi),
      respiratory_rate: inRange(resp, lo, hi),
    };

    const feats = extractIntradayFeatures(hk, baselines, 12.0);
    const nHr = hk.heart_rate.length;
    const nSteps = hk.step_count.length;

    const yy = inferYinYangState(feats, baselines);
    const wxf = normalizeForWuxing(feats, baselines);
    const wxRaw = inferWuxingStates(wxf, yy.yin_score, yy.yang_score);

    // source_quality rules from reconstruct_unified.classify_window (day
    // windows use min_hr_samples=3).
    const dataOk = feats.heart_rate.data_available || feats.hrv.data_available;
    const quality =
      dataOk && nHr >= 3
        ? "real_inference"
        : nHr > 0 || nSteps > 0
          ? "sparse_data"
          : "no_data";
    const hasBio = quality === "real_inference" || quality === "sparse_data";

    // Python max(raw_scores, key=raw_scores.get): FIRST key with the max
    // value in insertion order wood, fire, earth, metal, water.
    let dominantRaw: string | null = null;
    if (hasBio) {
      let best: (typeof WUXING_ELEMENTS)[number] = WUXING_ELEMENTS[0];
      for (const element of WUXING_ELEMENTS) {
        if (wxRaw[element].score > wxRaw[best].score) best = element;
      }
      if (wxRaw[best].score > 0) dominantRaw = PATTERN_NAME[best];
    }

    // Rolling baselines updated only from worn days (skip empty windows).
    if (hasBio) updateBaselinesFromFeatures(baselines, feats);

    timeline.push({
      date: new Date(lo * 1000).toISOString().slice(0, 10),
      source_quality: quality,
      dominant_pattern_raw_pre_gate: dominantRaw,
      yin_score: hasBio ? yy.yin_score : null,
      yang_score: hasBio ? yy.yang_score : null,
    });
  }

  return timeline;
}

describe("prod port parity vs golden pattern_timeline_v2.json", () => {
  const goldenDays: any[] = golden.timeline;
  const walk = runDailyWalk(goldenDays.length);

  it("golden fixture has the expected shape (107 days, 63 worn)", () => {
    assert.strictEqual(golden.n_days, 107);
    assert.strictEqual(goldenDays.length, 107);
    const worn = goldenDays.filter((d) => d.source_quality === "real_inference");
    assert.strictEqual(worn.length, 63);
  });

  it("walk covers the same dates as the golden timeline", () => {
    assert.strictEqual(walk.length, goldenDays.length);
    assert.strictEqual(walk[0].date, "2026-03-18");
    assert.strictEqual(walk[walk.length - 1].date, "2026-07-02");
    for (let i = 0; i < walk.length; i++) {
      assert.strictEqual(walk[i].date, goldenDays[i].date, `date drift at index ${i}`);
    }
  });

  it("source_quality matches the golden for every day", () => {
    for (let i = 0; i < walk.length; i++) {
      assert.strictEqual(
        walk[i].source_quality,
        goldenDays[i].source_quality,
        `source_quality mismatch on ${walk[i].date}`,
      );
    }
  });

  it("raw dominant pattern matches the golden day-by-day on worn days", () => {
    for (let i = 0; i < walk.length; i++) {
      if (goldenDays[i].source_quality !== "real_inference") continue;
      assert.strictEqual(
        walk[i].dominant_pattern_raw_pre_gate,
        goldenDays[i].dominant_pattern_raw_pre_gate,
        `dominant_pattern_raw_pre_gate mismatch on ${walk[i].date}`,
      );
    }
  });

  it("aggregate raw distribution is exactly TENSION 40 / OVERDRIVE 18 / STAGNATION 4 / CONSTRICTION 1 / DEPLETION 0", () => {
    const distribution: Record<string, number> = {
      TENSION: 0,
      OVERDRIVE: 0,
      STAGNATION: 0,
      CONSTRICTION: 0,
      DEPLETION: 0,
    };
    for (let i = 0; i < walk.length; i++) {
      if (walk[i].source_quality !== "real_inference") continue;
      const pattern = walk[i].dominant_pattern_raw_pre_gate;
      assert.ok(pattern !== null, `worn day ${walk[i].date} has no raw dominant pattern`);
      distribution[pattern as string] += 1;
    }
    assert.deepStrictEqual(distribution, EXPECTED_RAW_DISTRIBUTION);
  });

  it("yin/yang scores within +/-1 of golden on worn days", () => {
    for (let i = 0; i < walk.length; i++) {
      if (goldenDays[i].source_quality !== "real_inference") continue;
      const day = walk[i];
      assert.ok(
        Math.abs((day.yin_score as number) - goldenDays[i].yin_score) <= 1,
        `yin_score off on ${day.date}: got ${day.yin_score}, golden ${goldenDays[i].yin_score}`,
      );
      assert.ok(
        Math.abs((day.yang_score as number) - goldenDays[i].yang_score) <= 1,
        `yang_score off on ${day.date}: got ${day.yang_score}, golden ${goldenDays[i].yang_score}`,
      );
    }
  });
});
