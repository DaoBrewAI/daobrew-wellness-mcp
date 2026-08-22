/**
 * prodPort.ts — TypeScript port of the production biometric inference chain.
 *
 * Provenance (ported faithfully — same formulas, thresholds, and edge cases):
 * - fixtures/causal-engine-v2/scripts/prod_features_main.py (vendored from
 *   origin/main sha 5701517) — FeatureExtractor.extract_intraday_features,
 *   update_rolling_baseline, normalize_for_wuxing, and the per-metric feature
 *   extractors + activation score they depend on.
 * - daobrew_backend/state_inference/yinyang.py — YinYangStateInference
 *   .infer_state (compute_yin_score / compute_yang_score / apply_smoothing /
 *   determine_category) with the interpretation helpers it uses from
 *   daobrew_backend/state_inference/interpretation.py (English bands only).
 * - daobrew_backend/state_inference/wuxing.py — infer_states RAW element
 *   scores with yin/yang modulation.
 * - fixtures/causal-engine-v2/scripts/reunify/reconstruct_unified.py — the
 *   daily-walk driver conventions wrapped by inferYinYangState (yin_yang_features
 *   sub-dicts with fallbacks, previous_state=None) and
 *   updateBaselinesFromFeatures (mirrors update_baseline).
 *
 * Deliberately NOT ported:
 * - update_cycle.py::_enforce_element_eligibility (the quadrant step-gate).
 *   causal-engine-v2 consumes the RAW pre-gate wuxing scores; the gate is
 *   exactly what v2 bypasses.
 * - extract_nightly_features (sleep path — not part of the intraday chain).
 * - Chinese interpretation bands / locale handling (v2 only needs scores and
 *   category; English strings kept for dict-shape fidelity).
 *
 * Numeric fidelity notes:
 * - Python statistics.mean/stdev use exact Fraction accumulation; here they
 *   are replicated with Neumaier-compensated summation (parity within 1 ulp,
 *   verified day-by-day against the committed golden timeline).
 * - Python builtin sum() (activity totals) is naive left-to-right float
 *   summation — replicated as such, NOT compensated, because sample order
 *   affects the result.
 * - Python round() is banker's rounding (ties to even) — see pythonRound.
 * - Python int() truncates toward zero — replicated with Math.trunc.
 * - Python max(d, key=d.get) returns the FIRST key with the max value in
 *   insertion order (wood, fire, earth, metal, water) — callers walking the
 *   element scores must iterate WUXING_ELEMENTS in that order.
 */

// ---------------------------------------------------------------------------
// Public types (contract shared with modules written against this port)
// ---------------------------------------------------------------------------

export interface HkWindow {
  heart_rate: number[];
  heart_rate_variability: number[];
  step_count: number[];
  active_energy_burned: number[];
  respiratory_rate: number[];
}

export interface RollingBaseline {
  baseline_mean: number;
  baseline_std: number;
  sample_count: number;
}

// Keys used by prod: "heart_rate", "hrv", "respiratory_rate"
export type Baselines = Record<string, RollingBaseline>;

// Faithful to the Python dict shape returned by extract_intraday_features
export type IntradayFeatures = Record<string, any>;

export interface YinYangResult {
  yin_score: number;
  yang_score: number;
  category: string;
  [k: string]: any;
}

export interface ElementState {
  score: number;
  active: boolean;
  [k: string]: any;
}

export type WuxingStates = Record<
  "wood" | "fire" | "earth" | "metal" | "water",
  ElementState
>;

/** Insertion order used by wuxing.infer_states — load-bearing for max() tie-breaks. */
export const WUXING_ELEMENTS = ["wood", "fire", "earth", "metal", "water"] as const;

// ---------------------------------------------------------------------------
// Python-semantics numeric helpers
// ---------------------------------------------------------------------------

/**
 * Python round() for finite doubles: round half to even on the exact value.
 * (JS Math.round rounds halves toward +Infinity — diverges on exact .5 ties,
 * e.g. round(48.5): Python 48, Math.round 49.)
 */
function pythonRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** Python builtin sum(): naive left-to-right float accumulation from 0. */
function naiveSum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Neumaier-compensated sum — stands in for statistics._sum's exact Fractions. */
function compensatedSum(values: number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const v of values) {
    const t = sum + v;
    if (Math.abs(sum) >= Math.abs(v)) compensation += sum - t + v;
    else compensation += v - t + sum;
    sum = t;
  }
  return sum + compensation;
}

/** Python statistics.mean (exact-fraction mean, within 1 ulp). */
function pyMean(values: number[]): number {
  return compensatedSum(values) / values.length;
}

/** Python statistics.stdev — SAMPLE standard deviation (n - 1 divisor). */
function pyStdev(values: number[]): number {
  const mean = pyMean(values);
  const squares = values.map((v) => (v - mean) * (v - mean));
  return Math.sqrt(compensatedSum(squares) / (values.length - 1));
}

// ---------------------------------------------------------------------------
// FeatureExtractor port (prod_features_main.py)
// ---------------------------------------------------------------------------

function extractHeartRateFeatures(samples: number[]): Record<string, any> {
  if (samples.length === 0) {
    return {
      mean_hr: null,
      min_hr: null,
      max_hr: null,
      std_hr: null,
      data_available: false,
    };
  }
  return {
    mean_hr: pyMean(samples),
    min_hr: Math.min(...samples),
    max_hr: Math.max(...samples),
    std_hr: samples.length > 1 ? pyStdev(samples) : 0,
    sample_count: samples.length,
    data_available: true,
  };
}

function extractHrvFeatures(samples: number[]): Record<string, any> {
  if (samples.length === 0) {
    return {
      mean_hrv: null,
      min_hrv: null,
      max_hrv: null,
      data_available: false,
    };
  }
  return {
    mean_hrv: pyMean(samples),
    min_hrv: Math.min(...samples),
    max_hrv: Math.max(...samples),
    std_hrv: samples.length > 1 ? pyStdev(samples) : 0,
    sample_count: samples.length,
    data_available: true,
  };
}

function extractActivityFeatures(
  stepsSamples: number[],
  energySamples: number[],
): Record<string, any> {
  const features: Record<string, any> = {};

  if (stepsSamples.length > 0) {
    const totalSteps = naiveSum(stepsSamples);
    features.total_steps = totalSteps;
    features.avg_steps_per_hour = totalSteps / stepsSamples.length;
  } else {
    features.total_steps = null;
    features.avg_steps_per_hour = null;
  }

  if (energySamples.length > 0) {
    const totalEnergy = naiveSum(energySamples);
    features.total_active_energy = totalEnergy;
    features.avg_energy_per_hour = totalEnergy / energySamples.length;
  } else {
    features.total_active_energy = null;
    features.avg_energy_per_hour = null;
  }

  features.data_available = stepsSamples.length > 0 || energySamples.length > 0;
  return features;
}

function extractRespiratoryFeatures(samples: number[]): Record<string, any> {
  if (samples.length === 0) {
    return { mean_respiratory_rate: null, data_available: false };
  }
  return {
    mean_respiratory_rate: pyMean(samples),
    min_respiratory_rate: Math.min(...samples),
    max_respiratory_rate: Math.max(...samples),
    std_respiratory_rate: samples.length > 1 ? pyStdev(samples) : 0,
    sample_count: samples.length,
    data_available: true,
  };
}

function computeMetricDeviation(
  currentValue: number,
  baselineMean: number,
  baselineStd: number,
): number {
  if (baselineStd === 0) return 0.0;
  return (currentValue - baselineMean) / baselineStd;
}

function computeActivationScore(
  hrFeatures: Record<string, any>,
  hrvFeatures: Record<string, any>,
  activityFeatures: Record<string, any>,
  baselines: Baselines,
  windowHours: number,
): number {
  let score = 50.0;

  const hrBaseline = baselines["heart_rate"] ?? {};
  const hrMean = (hrBaseline as any).baseline_mean ?? 70;
  const hrStd = (hrBaseline as any).baseline_std ?? 0;

  const hrvBaseline = baselines["hrv"] ?? {};
  const hrvMean = (hrvBaseline as any).baseline_mean ?? 50;
  const hrvStd = (hrvBaseline as any).baseline_std ?? 0;

  if (hrFeatures.data_available) {
    const meanHr = hrFeatures.mean_hr ?? hrMean;
    let hrComponent: number;
    if (hrStd > 0) {
      hrComponent = computeMetricDeviation(meanHr, hrMean, hrStd) * 10;
    } else {
      hrComponent = ((meanHr - hrMean) / Math.max(hrMean, 1)) * 30;
    }
    score += hrComponent;
  }

  if (hrvFeatures.data_available) {
    const meanHrv = hrvFeatures.mean_hrv ?? hrvMean;
    let hrvComponent: number;
    if (hrvStd > 0) {
      hrvComponent = -computeMetricDeviation(meanHrv, hrvMean, hrvStd) * 8;
    } else {
      hrvComponent = ((hrvMean - meanHrv) / Math.max(hrvMean, 1)) * 20;
    }
    score += hrvComponent;
  }

  if (activityFeatures.data_available) {
    const totalSteps = activityFeatures.total_steps ?? 0;
    // Normalize to hourly rate so the activation component is
    // independent of the data window length.
    const stepsPerHour = (totalSteps || 0) / Math.max(windowHours, 0.1);
    const activityComponent = Math.min((stepsPerHour / 500) * 15, 15);
    score += activityComponent;
  }

  return Math.max(0, Math.min(100, score));
}

export function extractIntradayFeatures(
  hk: HkWindow,
  baselines: Baselines,
  windowHours: number,
): IntradayFeatures {
  const hrFeatures = extractHeartRateFeatures(hk.heart_rate ?? []);
  const hrvFeatures = extractHrvFeatures(hk.heart_rate_variability ?? []);
  const activityFeatures = extractActivityFeatures(
    hk.step_count ?? [],
    hk.active_energy_burned ?? [],
  );
  const respFeatures = extractRespiratoryFeatures(hk.respiratory_rate ?? []);

  const activationScore = computeActivationScore(
    hrFeatures,
    hrvFeatures,
    activityFeatures,
    baselines,
    windowHours,
  );

  const hasSensorData =
    hrFeatures.data_available ||
    hrvFeatures.data_available ||
    activityFeatures.data_available ||
    respFeatures.data_available;
  const sourceQuality = hasSensorData ? "data_verified" : "fallback";

  // Phase 1: separate feature references for independent Yin/Yang scoring
  const yinYangFeatures = {
    hrv_features: hrvFeatures,
    hr_features: hrFeatures,
    activity_features: activityFeatures,
  };

  return {
    heart_rate: hrFeatures,
    hrv: hrvFeatures,
    activity: activityFeatures,
    respiratory: respFeatures,
    activation_score: activationScore,
    yin_yang_features: yinYangFeatures,
    source_quality: sourceQuality,
    timestamp: new Date().toISOString(),
  };
}

const BASELINE_MAX_WINDOW = 168; // 7 days * 24 hours

export function updateRollingBaseline(
  mean: number,
  std: number,
  count: number,
  value: number,
): [number, number, number] {
  const newCount = Math.min(count + 1, BASELINE_MAX_WINDOW);
  const alpha = 1.0 / newCount;

  const newMean = mean + alpha * (value - mean);
  const newVar = (1 - alpha) * (std ** 2 + alpha * (value - mean) ** 2);
  const newStd = Math.max(newVar ** 0.5, 0.01);

  return [newMean, newStd, newCount];
}

export function normalizeForWuxing(
  features: IntradayFeatures,
  baselines: Baselines,
): Record<string, any> {
  const hr = features.heart_rate ?? {};
  const hrv = features.hrv ?? {};
  const activity = features.activity ?? {};
  const respiratory = features.respiratory ?? {};

  const out: Record<string, any> = {};

  // --- HRV ratio to baseline ---
  const meanHrv = hrv.mean_hrv;
  const hrvBlMean = baselines["hrv"]?.baseline_mean;
  if (meanHrv !== null && meanHrv !== undefined && hrvBlMean && hrvBlMean > 0) {
    out.hrv_ratio_to_baseline = meanHrv / hrvBlMean;
  } else {
    out.hrv_ratio_to_baseline = null;
  }

  // --- HR coefficient of variation ---
  const meanHr = hr.mean_hr;
  const stdHr = hr.std_hr;
  if (meanHr && meanHr > 0 && stdHr !== null && stdHr !== undefined) {
    out.hr_cv = stdHr / meanHr;
  } else {
    out.hr_cv = null;
  }
  out.hr_cv_at_rest = out.hr_cv;

  // --- Resting HR ratio to baseline ---
  const hrBlMean = baselines["heart_rate"]?.baseline_mean;
  if (meanHr !== null && meanHr !== undefined && hrBlMean && hrBlMean > 0) {
    out.resting_hr_ratio_to_baseline = meanHr / hrBlMean;
  } else {
    out.resting_hr_ratio_to_baseline = null;
  }

  // --- Steps ratio to baseline (population default ~7000 steps/day ≈ 1200/4h) ---
  const totalSteps = activity.total_steps;
  const stepsDefault = 1200.0;
  if (totalSteps !== null && totalSteps !== undefined) {
    out.steps_ratio_to_baseline = totalSteps / stepsDefault;
  } else {
    out.steps_ratio_to_baseline = null;
  }

  // --- Active energy ratio (population default ~120 kcal/4h) ---
  const totalEnergy = activity.total_active_energy;
  const energyDefault = 120.0;
  if (totalEnergy !== null && totalEnergy !== undefined) {
    out.active_energy_ratio = totalEnergy / energyDefault;
  } else {
    out.active_energy_ratio = null;
  }

  // --- Respiratory rate deviation (normalized 0-1) ---
  const meanRr = respiratory.mean_respiratory_rate;
  const stdRr = respiratory.std_respiratory_rate;
  const rrBl = baselines["respiratory_rate"];
  const rrBlMean = rrBl !== undefined ? rrBl.baseline_mean : 16.0;
  if (meanRr !== null && meanRr !== undefined && rrBlMean) {
    out.resp_rate_deviation = Math.min(1.0, Math.abs(meanRr - rrBlMean) / 6.0);
  } else {
    out.resp_rate_deviation = null;
  }

  // --- Breath variability (from respiratory std, normalized 0-1) ---
  if (stdRr !== null && stdRr !== undefined) {
    out.breath_variability = Math.min(1.0, stdRr / 4.0);
  } else {
    out.breath_variability = null;
  }

  // Signals not available from HealthKit (screen time, social, location, trends)
  out.movement_entropy = null;
  out.screen_hours = null;
  out.late_screen_hours = null;
  out.social_app_ratio = null;
  out.home_ratio = null;
  out.sedentary_bout_hours = null;
  out.hrv_trend_ratio_2w = null;
  out.resting_hr_trend_ratio = null;
  out.steps_trend_ratio_2w = null;

  return out;
}

// ---------------------------------------------------------------------------
// YinYangStateInference port (yinyang.py + interpretation.py)
// ---------------------------------------------------------------------------

const POPULATION_DEFAULTS: Record<string, { baseline_mean: number; baseline_std: number }> = {
  hrv: { baseline_mean: 50.0, baseline_std: 20.0 },
  heart_rate: { baseline_mean: 70.0, baseline_std: 10.0 },
};

// Tudor-Locke & Bassett (2004) step breakpoints
const TUDOR_LOCKE_BREAKPOINTS: Array<[number, number]> = [
  [0, 0], // basal
  [2500, 10], // limited activity
  [5000, 30], // sedentary
  [7500, 55], // somewhat active
  [10000, 75], // active
  [12500, 90], // highly active
];

const HRV_WEIGHT = 15.0; // points per SD of HRV z-score
const HR_WEIGHT = 8.0; // points per SD of resting HR z-score (inverted)
const ENERGY_BOOST_CAP = 10.0; // max points from active energy
const ENERGY_DIVISOR = 500.0; // kcal needed for full boost
const SMOOTHING_ALPHA = 0.3;

function interpolateTudorLocke(steps: number): number {
  if (steps <= 0) return 0.0;
  const last = TUDOR_LOCKE_BREAKPOINTS[TUDOR_LOCKE_BREAKPOINTS.length - 1];
  if (steps >= last[0]) return last[1];

  for (let i = 0; i < TUDOR_LOCKE_BREAKPOINTS.length - 1; i++) {
    const [lowSteps, lowScore] = TUDOR_LOCKE_BREAKPOINTS[i];
    const [highSteps, highScore] = TUDOR_LOCKE_BREAKPOINTS[i + 1];
    if (lowSteps <= steps && steps < highSteps) {
      const fraction = (steps - lowSteps) / (highSteps - lowSteps);
      return lowScore + fraction * (highScore - lowScore);
    }
  }
  return last[1];
}

function computeYinScore(
  hrvFeatures: Record<string, any>,
  hrFeatures: Record<string, any>,
  baselines: Baselines,
): number {
  let score = 50.0;

  // Resolve baselines (user -> population default)
  const hrvBaseline = baselines["hrv"] ?? POPULATION_DEFAULTS.hrv;
  const hrvMean = hrvBaseline.baseline_mean ?? POPULATION_DEFAULTS.hrv.baseline_mean;
  const hrvStd = hrvBaseline.baseline_std ?? POPULATION_DEFAULTS.hrv.baseline_std;

  const hrBaseline = baselines["heart_rate"] ?? POPULATION_DEFAULTS.heart_rate;
  const hrMean = hrBaseline.baseline_mean ?? POPULATION_DEFAULTS.heart_rate.baseline_mean;
  const hrStd = hrBaseline.baseline_std ?? POPULATION_DEFAULTS.heart_rate.baseline_std;

  // HRV component: higher HRV = more parasympathetic = higher Yin
  if (hrvFeatures.data_available && hrvStd > 0) {
    const currentHrv = hrvFeatures.mean_hrv ?? hrvMean;
    const hrvZ = (currentHrv - hrvMean) / hrvStd;
    score += hrvZ * HRV_WEIGHT;
  }

  // HR component: LOWER HR = more parasympathetic = higher Yin (inverted z-score)
  if (hrFeatures.data_available && hrStd > 0) {
    const currentHr = hrFeatures.mean_hr ?? hrMean;
    const hrZInverted = -(currentHr - hrMean) / hrStd;
    score += hrZInverted * HR_WEIGHT;
  }

  return Math.max(0, Math.min(100, pythonRound(score)));
}

function computeYangScore(activityFeatures: Record<string, any>): number {
  if (!activityFeatures.data_available) {
    return 50; // No data -> neutral
  }

  const totalSteps = activityFeatures.total_steps ?? 0;
  const totalEnergy = activityFeatures.total_active_energy ?? 0;

  // Tudor-Locke step mapping (Python int() truncates toward zero)
  const tudorScore = interpolateTudorLocke(Math.trunc(totalSteps || 0));

  // Active energy boost (capped)
  const energyBoost = Math.min(
    ((totalEnergy || 0) / ENERGY_DIVISOR) * ENERGY_BOOST_CAP,
    ENERGY_BOOST_CAP,
  );

  const yang = tudorScore + energyBoost;
  return Math.max(0, Math.min(100, pythonRound(yang)));
}

function applySmoothing(
  newYin: number,
  newYang: number,
  prevYin: number,
  prevYang: number,
): [number, number] {
  const alpha = SMOOTHING_ALPHA;

  let smoothedYin = pythonRound(alpha * newYin + (1 - alpha) * prevYin);
  let smoothedYang = pythonRound(alpha * newYang + (1 - alpha) * prevYang);

  smoothedYin = Math.max(0, Math.min(100, smoothedYin));
  smoothedYang = Math.max(0, Math.min(100, smoothedYang));

  return [smoothedYin, smoothedYang];
}

function determineCategory(yinScore: number, yangScore: number): string {
  const yinOk = yinScore >= 50;
  const yangOk = yangScore >= 50;

  if (yinOk && yangOk) return "in_flow";
  if (!yinOk && yangOk) return "pushing_it";
  if (yinOk && !yangOk) return "recharging";
  return "running_on_empty";
}

// interpretation.py (English bands)
const YIN_BANDS: Array<[number, number, string]> = [
  [0, 19, "Severely depleted parasympathetic reserve"],
  [20, 39, "Below-average recovery indicators"],
  [40, 59, "Moderate parasympathetic tone"],
  [60, 79, "Strong recovery signals"],
  [80, 100, "Excellent parasympathetic reserve"],
];

const YANG_BANDS: Array<[number, number, string]> = [
  [0, 19, "Very low physical output today"],
  [20, 39, "Below-average activity level"],
  [40, 59, "Moderate activity level"],
  [60, 79, "Good physical engagement"],
  [80, 100, "Highly active and energized"],
];

const QUADRANT_LABELS: Record<string, string> = {
  in_flow: "In Flow",
  pushing_it: "Pushing It",
  recharging: "Recharging",
  running_on_empty: "Running on Empty",
};

function interpretScore(score: number, bands: Array<[number, number, string]>): string {
  const clamped = Math.max(0, Math.min(100, score));
  for (const [low, high, text] of bands) {
    if (low <= clamped && clamped <= high) return text;
  }
  return bands[bands.length - 1][2];
}

function yinYangInferState(
  hrvFeatures: Record<string, any>,
  hrFeatures: Record<string, any>,
  activityFeatures: Record<string, any>,
  baselines: Baselines,
  previousState: Record<string, any> | null,
): YinYangResult {
  const prev = previousState ?? { yin_score: 50, yang_score: 50, category: "in_flow" };
  const prevYin = prev.yin_score ?? 50;
  const prevYang = prev.yang_score ?? 50;

  // Compute raw scores
  const rawYin = computeYinScore(hrvFeatures, hrFeatures, baselines);
  const rawYang = computeYangScore(activityFeatures);

  // Apply smoothing
  const [smoothedYin, smoothedYang] = applySmoothing(rawYin, rawYang, prevYin, prevYang);

  // Classify
  const category = determineCategory(smoothedYin, smoothedYang);

  return {
    yin_score: smoothedYin,
    yang_score: smoothedYang,
    category,
    quadrant_label: QUADRANT_LABELS[category] ?? category,
    yin_interpretation: interpretScore(smoothedYin, YIN_BANDS),
    yang_interpretation: interpretScore(smoothedYang, YANG_BANDS),
    timestamp: Date.now() / 1000,
  };
}

/**
 * Wraps yy_engine.infer_state exactly as reconstruct_unified.py calls it:
 * yin_yang_features sub-dicts with fallbacks to the top-level feature dicts,
 * previous_state=None (each window classified independently — the production
 * 0.3 EMA is designed for intraday 4h continuity, not multi-day watch gaps).
 */
export function inferYinYangState(
  features: IntradayFeatures,
  baselines: Baselines,
): YinYangResult {
  const yyf = features.yin_yang_features ?? {};
  return yinYangInferState(
    yyf.hrv_features ?? features.hrv ?? {},
    yyf.hr_features ?? features.heart_rate ?? {},
    yyf.activity_features ?? features.activity ?? {},
    baselines,
    null,
  );
}

// ---------------------------------------------------------------------------
// Wu Xing port (wuxing.py) — RAW scores only; eligibility gate NOT ported
// ---------------------------------------------------------------------------

function signalIntensity(
  value: number | null | undefined,
  baseline: number,
  inverted: boolean,
): number {
  if (value === null || value === undefined) return 0.0;
  let intensity: number;
  if (inverted) {
    // value at or above baseline => 0 intensity; value at 0 => 1.0 intensity
    if (baseline === 0) return 0.0;
    intensity = Math.max(0.0, 1.0 - value / baseline);
  } else {
    // value at 0 => 0 intensity; value at or above baseline => 1.0 intensity
    if (baseline === 0) return 0.0;
    intensity = value / baseline;
  }
  return Math.min(1.0, Math.max(0.0, intensity));
}

function computeWoodScore(f: Record<string, any>): number {
  let score = 0.0;
  // HRV below baseline: 35 points. ratio=1.0 => no stress, ratio=0.0 => full stress
  score += 35 * signalIntensity(f.hrv_ratio_to_baseline, 1.0, true);
  // HR instability: 25 points. cv=0.0 => stable, cv>=0.20 => max stress
  score += 25 * signalIntensity(f.hr_cv, 0.2, false);
  // Erratic movement: 15 points. entropy 0.0 => calm, 1.0 => max
  score += 15 * signalIntensity(f.movement_entropy, 1.0, false);
  // Screen time: 5 points. 0h => none, >=12h => max
  score += 5 * signalIntensity(f.screen_hours, 12.0, false);
  return Math.min(100, Math.trunc(score));
}

function computeFireScore(f: Record<string, any>): number {
  let score = 0.0;
  // Resting HR above baseline: 35 points. ratio=1.0 => normal, >=1.3 => max stress
  const restingHrRatio = f.resting_hr_ratio_to_baseline;
  if (restingHrRatio !== null && restingHrRatio !== undefined) {
    const elevation = Math.max(0.0, restingHrRatio - 1.0);
    score += 35 * Math.min(1.0, elevation / 0.3); // 0.3 above baseline = full stress
  }
  // HR instability at rest: 25 points.
  score += 25 * signalIntensity(f.hr_cv_at_rest, 0.2, false);
  // Late-night screen: 15 points. 0h => none, >=4h => max
  score += 15 * signalIntensity(f.late_screen_hours, 4.0, false);
  // Low HRV: 10 points. ratio=1.0 => no stress, ratio=0.0 => full stress
  score += 10 * signalIntensity(f.hrv_ratio_to_baseline, 1.0, true);
  return Math.min(100, Math.trunc(score));
}

function computeEarthScore(f: Record<string, any>): number {
  let score = 0.0;
  // Low daily steps: 40 points. ratio=1.0+ => normal, ratio=0.0 => max stress
  score += 40 * signalIntensity(f.steps_ratio_to_baseline, 1.0, true);
  // Low active energy: 20 points. ratio=1.0+ => normal, ratio=0.0 => max stress
  score += 20 * signalIntensity(f.active_energy_ratio, 1.0, true);
  // Sedentary bouts: 10 points. 0h => none, >=8h => max
  score += 10 * signalIntensity(f.sedentary_bout_hours, 8.0, false);
  return Math.min(100, Math.trunc(score));
}

function computeMetalScore(f: Record<string, any>): number {
  let score = 0.0;
  // Abnormal respiratory rate: 35 points. 0.0 => normal, 1.0 => max deviation
  score += 35 * signalIntensity(f.resp_rate_deviation, 1.0, false);
  // High breath variability: 20 points. 0.0 => stable, 1.0 => max variability
  score += 20 * signalIntensity(f.breath_variability, 1.0, false);
  // Social withdrawal: 15 points. ratio=1.0 => normal social, 0.0 => withdrawn
  score += 15 * signalIntensity(f.social_app_ratio, 1.0, true);
  // Home time: 10 points. 0.0 => out and about, 1.0 => always home
  score += 10 * signalIntensity(f.home_ratio, 1.0, false);
  return Math.min(100, Math.trunc(score));
}

function computeWaterScore(f: Record<string, any>): number {
  let score = 0.0;
  // HRV suppressed over 2 weeks: 30 points. ratio=1.0+ => normal, 0.0 => full suppression
  score += 30 * signalIntensity(f.hrv_trend_ratio_2w, 1.0, true);
  // Rising resting HR: 20 points. ratio=1.0 => stable, >=1.3 => max stress
  const restingHrTrend = f.resting_hr_trend_ratio;
  if (restingHrTrend !== null && restingHrTrend !== undefined) {
    const elevation = Math.max(0.0, restingHrTrend - 1.0);
    score += 20 * Math.min(1.0, elevation / 0.3);
  }
  // Declining steps: 10 points. ratio=1.0+ => stable, 0.0 => fully declined
  score += 10 * signalIntensity(f.steps_trend_ratio_2w, 1.0, true);
  return Math.min(100, Math.trunc(score));
}

const ELEMENT_ACTIVATION_THRESHOLD = 50;
const YIN_YANG_LOW_THRESHOLD = 40;
const YIN_YANG_AMPLIFICATION = 1.3;

/**
 * wuxing.infer_states — RAW element scores with yin/yang modulation.
 * Result keys are in insertion order wood, fire, earth, metal, water; callers
 * replicating Python max(d, key=d.get) must take the FIRST max in that order.
 */
export function inferWuxingStates(
  features: Record<string, any>,
  yinScore: number,
  yangScore: number,
): WuxingStates {
  // Compute raw scores (insertion order is load-bearing)
  const raw: Record<string, number> = {
    wood: computeWoodScore(features),
    fire: computeFireScore(features),
    earth: computeEarthScore(features),
    metal: computeMetalScore(features),
    water: computeWaterScore(features),
  };

  // Apply Yin/Yang modulation (Python int() truncates)
  const modulated: Record<string, number> = { ...raw };
  if (yinScore < YIN_YANG_LOW_THRESHOLD) {
    modulated.wood = Math.trunc(raw.wood * YIN_YANG_AMPLIFICATION);
    modulated.water = Math.trunc(raw.water * YIN_YANG_AMPLIFICATION);
  }
  if (yangScore < YIN_YANG_LOW_THRESHOLD) {
    modulated.earth = Math.trunc(raw.earth * YIN_YANG_AMPLIFICATION);
  }

  // Clamp and determine activation
  const result = {} as WuxingStates;
  for (const element of WUXING_ELEMENTS) {
    const clamped = Math.min(100, Math.max(0, modulated[element]));
    result[element] = {
      score: clamped,
      active: clamped >= ELEMENT_ACTIVATION_THRESHOLD,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Daily-walk baseline driver (reconstruct_unified.py::update_baseline)
// ---------------------------------------------------------------------------

/**
 * Mirrors reconstruct_unified.update_baseline: fold the window's mean HR /
 * mean HRV / mean respiratory rate into the rolling EMA baselines. The daily
 * walk calls this only on worn days (real_inference or sparse_data). First
 * observation of a metric seeds (value, 0.01, 1).
 */
export function updateBaselinesFromFeatures(
  baselines: Baselines,
  features: IntradayFeatures,
): void {
  const metricMap: Array<[string, number | null | undefined]> = [
    ["heart_rate", features.heart_rate?.mean_hr],
    ["hrv", features.hrv?.mean_hrv],
    ["respiratory_rate", features.respiratory?.mean_respiratory_rate],
  ];

  for (const [name, value] of metricMap) {
    if (value === null || value === undefined) continue;
    let mean: number;
    let std: number;
    let count: number;
    const existing = baselines[name];
    if (existing !== undefined) {
      [mean, std, count] = updateRollingBaseline(
        existing.baseline_mean,
        existing.baseline_std,
        existing.sample_count,
        value,
      );
    } else {
      mean = value;
      std = 0.01;
      count = 1;
    }
    baselines[name] = { baseline_mean: mean, baseline_std: std, sample_count: count };
  }
}
