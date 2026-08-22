/**
 * Pattern Signature v2 — causal-engine-v2 P1.
 *
 * Computes a stress-pattern signature straight from raw health samples,
 * bypassing the backend's step-driven eligibility gate. This is the
 * documented replacement for the Reasoner's biometricPatternScores
 * (Reasoner.ts:449, which re-encodes the gated quadrant into patterns)
 * and its .depletion fallback (:503).
 *
 * Three disciplines from the reasoner-redesign direction (findings F3/F6):
 *
 * 1. RAW, not gated. Patterns come from prodPort's ungated WuXing raw
 *    scores over a 14-day personal rolling baseline — never the
 *    step-gated display value. On the committed snapshot the raw
 *    dominant distribution is TENSION 40 / OVERDRIVE 18 / STAGNATION 4
 *    / CONSTRICTION 1 / DEPLETION 0; DEPLETION is never emitted by day-
 *    time signal (it needs a nighttime-recovery layer that doesn't exist
 *    yet).
 *
 * 2. Measurability is explicit. TENSION vs OVERDRIVE separate cleanly on
 *    all-day HR (Hedges g = -3.26) but NOT on HRV/RHR (CI crosses 0), so
 *    those axes carry a low measurability tag. CONSTRICTION is
 *    unmeasurable with current sensors (needs respiration/location);
 *    DEPLETION is unmeasurable in daytime signal. The signature says so
 *    rather than inventing a state.
 *
 * 3. Every signature carries confidence + coverage. A pattern is a
 *    triple — label, how sure, how much wear backs it — never a bare
 *    label. No-activation resolves to an explicit low-confidence
 *    `balanced` state, not a collapse to depletion.
 */

import { CoverageTable, DayCoverage } from "../coverage.js";
import {
  Baselines,
  HkWindow,
  IntradayFeatures,
  WUXING_ELEMENTS,
  extractIntradayFeatures,
  inferWuxingStates,
  inferYinYangState,
  normalizeForWuxing,
  updateBaselinesFromFeatures,
} from "./prodPort.js";

export type PatternLabel =
  | "TENSION"
  | "OVERDRIVE"
  | "STAGNATION"
  | "CONSTRICTION"
  | "DEPLETION"
  | "BALANCED";

/** wood→fire→earth→metal→water, aligned to WUXING_ELEMENTS insertion order. */
const ELEMENT_TO_PATTERN: Record<string, PatternLabel> = {
  wood: "TENSION",
  fire: "OVERDRIVE",
  earth: "STAGNATION",
  metal: "CONSTRICTION",
  water: "DEPLETION",
};

/** Patterns that current sensors cannot actually measure — flagged, never
 *  emitted as a confident daytime dominant. */
export const UNMEASURABLE_PATTERNS: ReadonlySet<PatternLabel> = new Set([
  "CONSTRICTION", // needs respiration / location
  "DEPLETION", // needs nighttime recovery layer
]);

export type Measurability = "hr-separable" | "low" | "unmeasurable";

export interface PatternSignature {
  date: string;
  /** The raw dominant pattern, or BALANCED when nothing activates. */
  dominant: PatternLabel;
  /** Per-pattern raw scores (pre-gate), wood→water order preserved. */
  scores: Record<PatternLabel, number>;
  /** 0..1 — separation strength of the dominant, discounted for wear. */
  confidence: number;
  /** Wear fraction of the day (from the coverage table). */
  coverage: number;
  /** How trustworthy the dominant's axis is (see class doc). */
  measurability: Measurability;
  /** True when the dominant is a sensor-unmeasurable pattern — callers
   *  must not treat it as a confident physiological read. */
  flaggedUnmeasurable: boolean;
  quality: DayCoverage["quality"];
}

export interface SignatureOptions {
  timezoneOffsetHours?: number;
  minHrSamples?: number;
}

const DEFAULT_OFFSET_HOURS = -7;
const DEFAULT_MIN_HR = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HR_SEPARABLE: ReadonlySet<PatternLabel> = new Set([
  "TENSION",
  "OVERDRIVE",
]);

export interface RawSample {
  metric: string;
  value: number;
  timestamp: string;
}

function emptyWindow(): HkWindow {
  return {
    heart_rate: [],
    heart_rate_variability: [],
    step_count: [],
    active_energy_burned: [],
    respiratory_rate: [],
  };
}

function measurabilityOf(dominant: PatternLabel): Measurability {
  if (UNMEASURABLE_PATTERNS.has(dominant)) return "unmeasurable";
  if (HR_SEPARABLE.has(dominant)) return "hr-separable";
  return "low";
}

/**
 * Confidence: how far the dominant raw score sits above the runner-up,
 * normalized, then discounted by wear coverage. A clean separation on a
 * fully-worn day approaches 1; a marginal lead on a half-worn day stays
 * low. Unmeasurable dominants are hard-capped so they can never read as
 * confident.
 */
function confidenceOf(
  sorted: number[],
  dominant: PatternLabel,
  coverage: number,
): number {
  const top = sorted[0] ?? 0;
  const second = sorted[1] ?? 0;
  if (top <= 0) return 0;
  const separation = (top - second) / top; // 0..1
  const base = separation * Math.min(1, Math.max(0, coverage) + 0.25);
  const capped = UNMEASURABLE_PATTERNS.has(dominant)
    ? Math.min(base, 0.2)
    : base;
  return Math.round(capped * 100) / 100;
}

function localDayKey(epochMs: number, offsetHours: number): string {
  return new Date(epochMs + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Walk a date span day by day and emit one signature per day. Baselines
 * update only on worn days (mirrors the reconstruction driver); windows
 * are classified independently (no cross-day EMA smoothing over gaps).
 * Coverage/quality are read from a prebuilt CoverageTable so the mock-
 * contamination and wear rules stay in one place.
 */
export function computePatternSignatures(
  samples: readonly RawSample[],
  coverage: CoverageTable,
  options: SignatureOptions = {},
): PatternSignature[] {
  const offset = options.timezoneOffsetHours ?? DEFAULT_OFFSET_HOURS;

  // bucket raw samples into local days
  const byDay = new Map<string, HkWindow>();
  for (const s of samples) {
    const ms = Date.parse(s.timestamp);
    if (!Number.isFinite(ms)) continue;
    const day = localDayKey(ms, offset);
    const win = byDay.get(day) ?? emptyWindow();
    const bucket = (win as unknown as Record<string, number[]>)[s.metric];
    if (bucket) bucket.push(s.value);
    byDay.set(day, win);
  }

  if (!coverage.span) return [];
  const startMs = Date.parse(`${coverage.span.start}T00:00:00Z`);
  const endMs = Date.parse(`${coverage.span.end}T00:00:00Z`);

  const baselines: Baselines = {};
  const out: PatternSignature[] = [];

  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = new Date(ms).toISOString().slice(0, 10);
    const day = coverage.days[date];
    const window = byDay.get(date) ?? emptyWindow();
    const quality = day?.quality ?? "no_data";
    const cov = day?.coverageFraction ?? 0;

    if (!day || quality === "no_data") {
      out.push({
        date,
        dominant: "BALANCED",
        scores: zeroScores(),
        confidence: 0,
        coverage: cov,
        measurability: "unmeasurable",
        flaggedUnmeasurable: false,
        quality,
      });
      continue;
    }

    const features: IntradayFeatures = extractIntradayFeatures(
      window,
      baselines,
      12,
    );
    const yy = inferYinYangState(features, baselines);
    // WuXing scores read the wuxing-normalized features, not the raw
    // intraday dict (mirrors the reconstruction driver exactly).
    const wuxingFeatures = normalizeForWuxing(features, baselines);
    const wuxing = inferWuxingStates(
      wuxingFeatures,
      yy.yin_score,
      yy.yang_score,
    );

    const scores = zeroScores();
    for (const element of WUXING_ELEMENTS) {
      scores[ELEMENT_TO_PATTERN[element]] = wuxing[element].score;
    }
    // max() first-key-wins in wood→water order (matches prodPort/backend)
    let dominant: PatternLabel = "BALANCED";
    let topScore = 0;
    for (const element of WUXING_ELEMENTS) {
      const score = wuxing[element].score;
      if (score > topScore) {
        topScore = score;
        dominant = ELEMENT_TO_PATTERN[element];
      }
    }
    if (topScore <= 0) dominant = "BALANCED";

    const sortedScores = WUXING_ELEMENTS.map((e) => wuxing[e].score).sort(
      (a, b) => b - a,
    );

    out.push({
      date,
      dominant,
      scores,
      confidence:
        dominant === "BALANCED" ? 0 : confidenceOf(sortedScores, dominant, cov),
      coverage: cov,
      measurability:
        dominant === "BALANCED" ? "low" : measurabilityOf(dominant),
      flaggedUnmeasurable: UNMEASURABLE_PATTERNS.has(dominant),
      quality,
    });

    if (day.worn) updateBaselinesFromFeatures(baselines, features);
  }

  return out;
}

function zeroScores(): Record<PatternLabel, number> {
  return {
    TENSION: 0,
    OVERDRIVE: 0,
    STAGNATION: 0,
    CONSTRICTION: 0,
    DEPLETION: 0,
    BALANCED: 0,
  };
}

/** Distribution of raw dominant patterns over worn days — the P1 gate metric. */
export function wornDominantDistribution(
  signatures: readonly PatternSignature[],
): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const sig of signatures) {
    if (sig.quality !== "real_inference") continue;
    dist[sig.dominant] = (dist[sig.dominant] ?? 0) + 1;
  }
  return dist;
}
