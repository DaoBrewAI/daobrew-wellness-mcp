/**
 * Corpus-axis constructor — handoff debt #1, the sole blocker between
 * live memory and automatic attribution candidates.
 *
 * The 7th gate (EnrichmentGate.ts) is fully built but never fires in
 * live runs: run.ts calls buildV2Context() with no enrichmentAxes, so
 * the gate's input defaults to []. Only the offline dry-run script
 * hand-feeds axes. This module derives them from live signals so a
 * later run.ts wiring step can close the loop.
 *
 * Class definitions (per day, from the v2 pattern signatures):
 * - TARGET class:    quality === "real_inference" && dominant !== "BALANCED"
 * - REFERENCE class: quality === "real_inference" && dominant === "BALANCED"
 * Unworn / sparse / synthetic days belong to neither class — a day
 * without real biometric backing can neither accuse nor exonerate.
 *
 * Reference-class mapping note: the Python provenance
 * (fixtures/causal-engine-v2/scripts/reunify/enrichment_unified.py)
 * had no balanced pattern class with power (balanced_flag n=1), so it
 * operationalized "lowest-stress baseline" as the RECHARGING quadrant
 * of worn days (`d["quadrant"] == "recharging"`, n~9). In the TS
 * signature world there is no quadrant layer; the analogous
 * not-under-a-dominant-pattern class is worn real_inference days whose
 * raw dominant is BALANCED. Same intent, different operationalization.
 *
 * Themes come from MEMORY topics; meetings (granola) and calendar are
 * corroborating sources only. Per the real-data findings (EnrichmentGate
 * header, findings F5/F7), the memory axis is what carried real signal
 * (causal 1.61x / pricing 1.46x) while the calendar axis alone washed
 * out to noise — so calendar/granola never mint a theme, they only add
 * per-day source corroboration toward the gate's >=2-source rule.
 *
 * rtmSuspected is always true in v1: cited days are self-selected
 * extremes (the user wrote about what was bothering them), so mean
 * reversion can't be ruled out without a symmetric sampling design.
 * Conservative by construction — the flag annotates the surviving
 * claim, it never rejects it (see enrichmentGate condition ordering).
 */
import type { PatternSignature } from "../signals/patterns.js";
import { type EnrichmentAxisInput } from "./v2Context.js";
export interface CorpusAxesInput {
    /** date -> signature, as in ReasonerV2Context.signaturesByDate. */
    signatures: Map<string, PatternSignature>;
    insights: readonly {
        topics: string[];
        occurred_at_ts: number | null;
        /** Optional insight body — llm_proposed themes may only mint a cited day
         *  through a literal whole-word match on this text (or the topics). */
        insight_text?: string | null;
    }[];
    meetings: readonly {
        title: string;
        summary: string | null;
        occurred_at_ts: number | null;
    }[];
    calendarEvents: readonly {
        title: string;
        start_ts: number;
    }[];
    timezoneOffsetHours: number;
    /** Default 8; the Reasoner consumes axes[0] as the primary axis. */
    maxAxes?: number;
    /** LLM-proposed candidate themes (proposer.ts) — propose-only, never
     *  assert: a proposed theme mints a cited day ONLY via the same literal
     *  whole-word matching against memory-insight rows that meetings/calendar
     *  use for corroboration. Themes already minted by a memory topic are
     *  skipped, so the LLM can never re-brand (or double-count) real topics. */
    proposedThemes?: readonly {
        theme: string;
        terms?: readonly string[];
    }[];
}
/**
 * Derive enrichment axes for the 7th gate from live corpus signals.
 * Pure: no I/O, no thresholds — gating stays in EnrichmentGate.
 */
export declare function buildCorpusAxes(input: CorpusAxesInput): EnrichmentAxisInput[];
