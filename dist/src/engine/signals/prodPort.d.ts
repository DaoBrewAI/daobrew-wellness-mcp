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
export type Baselines = Record<string, RollingBaseline>;
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
export type WuxingStates = Record<"wood" | "fire" | "earth" | "metal" | "water", ElementState>;
/** Insertion order used by wuxing.infer_states — load-bearing for max() tie-breaks. */
export declare const WUXING_ELEMENTS: readonly ["wood", "fire", "earth", "metal", "water"];
export declare function extractIntradayFeatures(hk: HkWindow, baselines: Baselines, windowHours: number): IntradayFeatures;
export declare function updateRollingBaseline(mean: number, std: number, count: number, value: number): [number, number, number];
export declare function normalizeForWuxing(features: IntradayFeatures, baselines: Baselines): Record<string, any>;
/**
 * Wraps yy_engine.infer_state exactly as reconstruct_unified.py calls it:
 * yin_yang_features sub-dicts with fallbacks to the top-level feature dicts,
 * previous_state=None (each window classified independently — the production
 * 0.3 EMA is designed for intraday 4h continuity, not multi-day watch gaps).
 */
export declare function inferYinYangState(features: IntradayFeatures, baselines: Baselines): YinYangResult;
/**
 * wuxing.infer_states — RAW element scores with yin/yang modulation.
 * Result keys are in insertion order wood, fire, earth, metal, water; callers
 * replicating Python max(d, key=d.get) must take the FIRST max in that order.
 */
export declare function inferWuxingStates(features: Record<string, any>, yinScore: number, yangScore: number): WuxingStates;
/**
 * Mirrors reconstruct_unified.update_baseline: fold the window's mean HR /
 * mean HRV / mean respiratory rate into the rolling EMA baselines. The daily
 * walk calls this only on worn days (real_inference or sparse_data). First
 * observation of a metric seeds (value, 0.01, 1).
 */
export declare function updateBaselinesFromFeatures(baselines: Baselines, features: IntradayFeatures): void;
