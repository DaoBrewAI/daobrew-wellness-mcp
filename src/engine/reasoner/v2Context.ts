/**
 * Reasoner v2 context — causal-engine-v2 P3.
 *
 * Bundles the three P1/P2 layers into one optional input the Reasoner
 * activates on: raw multi-metric pattern signatures (patterns.ts), the
 * wear-coverage table (coverage.ts), and the corpus enrichment axes fed
 * to the 7th gate (EnrichmentGate.ts).
 *
 * v2 is INPUT-ACTIVATED: when a run has raw samples, run.ts (or the
 * dry-run) builds this context and the Reasoner swaps its pattern layer
 * from the legacy gated-quadrant re-encoding to the raw signature, caps
 * claims by coverage, and runs the enrichment gate. Runs without raw
 * samples keep the legacy path untouched (and their outputs keep the
 * legacy `watch_data_only` provenance tag so nothing masquerades as v2).
 */

import {
  buildCoverageTable,
  capClaimByCoverage,
  CappedClaim,
  CoverageTable,
} from "../coverage.js";
import {
  computePatternSignatures,
  PatternSignature,
  RawSample,
} from "../signals/patterns.js";
import {
  CitedDayEvidence,
  DEFAULT_ENRICHMENT_THRESHOLDS,
  enrichmentGate,
  EnrichmentGateResult,
  EnrichmentThresholds,
} from "./EnrichmentGate.js";

/** One corpus axis to test at the 7th gate. `citedDays.backed` is filled
 *  from the coverage table — callers only supply dates and sources. */
export interface EnrichmentAxisInput {
  theme: string;
  targetHits: number;
  targetN: number;
  referenceRate: number;
  referenceN: number;
  citedDays: { date: string; sources: string[] }[];
  rtmSuspected: boolean;
  /** Who minted the theme — observability ONLY. 'memory_topic' (default) or
   *  'llm_proposed' (proposer.ts). The gate/matching semantics are IDENTICAL
   *  for both origins: hits stay literal whole-word corpus matches and
   *  citations stay literal rows; LLM text is never evidence. */
  origin?: "memory_topic" | "llm_proposed";
}

export interface ReasonerV2Context {
  coverage: CoverageTable;
  signaturesByDate: Map<string, PatternSignature>;
  timezoneOffsetHours: number;
  /** Candidate axes for the 7th gate; the primary (root) axis first. */
  enrichmentAxes: EnrichmentAxisInput[];
  thresholds: EnrichmentThresholds;
}

export interface V2ContextOptions {
  timezoneOffsetHours?: number;
  enrichmentAxes?: EnrichmentAxisInput[];
  thresholds?: EnrichmentThresholds;
}

const DEFAULT_OFFSET_HOURS = -7;

/** Local day key for an epoch-seconds timestamp, matching coverage.ts. */
export function localDayKey(epochSeconds: number, offsetHours: number): string {
  return new Date((epochSeconds + offsetHours * 3600) * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Build the v2 context from raw samples. Returns null when there are no
 * usable samples — the caller stays on the legacy path, honestly.
 */
export function buildV2Context(
  samples: readonly RawSample[],
  options: V2ContextOptions = {},
): ReasonerV2Context | null {
  if (samples.length === 0) return null;
  const offset = options.timezoneOffsetHours ?? DEFAULT_OFFSET_HOURS;
  const coverage = buildCoverageTable(
    samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })),
    { timezoneOffsetHours: offset },
  );
  if (coverage.wornDays.length === 0) return null;
  const signatures = computePatternSignatures(samples, coverage, {
    timezoneOffsetHours: offset,
  });
  return {
    coverage,
    signaturesByDate: new Map(signatures.map((sig) => [sig.date, sig])),
    timezoneOffsetHours: offset,
    enrichmentAxes: options.enrichmentAxes ?? [],
    thresholds: options.thresholds ?? DEFAULT_ENRICHMENT_THRESHOLDS,
  };
}

export interface GatedAxisResult {
  gate: EnrichmentGateResult;
  coverageCap: CappedClaim;
}

/**
 * Run one axis through the 7th gate with coverage-derived backing:
 * a cited day is backed iff the coverage table calls it worn.
 */
export function runEnrichmentGateWithCoverage(
  axis: EnrichmentAxisInput,
  coverage: CoverageTable,
  thresholds?: EnrichmentThresholds,
): GatedAxisResult {
  const citedDays: CitedDayEvidence[] = axis.citedDays.map((day) => ({
    date: day.date,
    backed: coverage.days[day.date]?.worn ?? false,
    sources: day.sources,
  }));
  const gate = enrichmentGate({
    theme: axis.theme,
    targetHits: axis.targetHits,
    targetN: axis.targetN,
    referenceRate: axis.referenceRate,
    referenceN: axis.referenceN,
    citedDays,
    rtmSuspected: axis.rtmSuspected,
    thresholds,
  });
  const coverageCap = capClaimByCoverage(
    "attribution_candidate",
    axis.citedDays.map((day) => day.date),
    coverage,
  );
  return { gate, coverageCap };
}

/** Map a gate verdict to the claim string written on the root node.
 *  The ceiling never rises above the deterministic reasoner's cap. */
export function claimLevelForVerdict(
  verdict: EnrichmentGateResult["verdict"],
  ceiling: string,
): string {
  switch (verdict) {
    case "attribution_candidate":
      return ceiling;
    case "context_only":
      return "context_only";
    case "insufficient_power":
      return "insufficient_power";
    case "no_data":
      return "no_data";
  }
}
