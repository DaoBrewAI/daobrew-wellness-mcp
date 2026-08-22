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
import { localDayKey, type EnrichmentAxisInput } from "./v2Context.js";
import { enrichmentRatio } from "./EnrichmentGate.js";

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
  calendarEvents: readonly { title: string; start_ts: number }[];
  timezoneOffsetHours: number;
  /** Default 8; the Reasoner consumes axes[0] as the primary axis. */
  maxAxes?: number;
  /** LLM-proposed candidate themes (proposer.ts) — propose-only, never
   *  assert: a proposed theme mints a cited day ONLY via the same literal
   *  whole-word matching against memory-insight rows that meetings/calendar
   *  use for corroboration. Themes already minted by a memory topic are
   *  skipped, so the LLM can never re-brand (or double-count) real topics. */
  proposedThemes?: readonly { theme: string; terms?: readonly string[] }[];
}

const DEFAULT_MAX_AXES = 8;
/** Ignore theme tokens shorter than this when matching corroborating text. */
const MIN_TOKEN_LENGTH = 3;

/** Function words that carry no theme signal — never match on these. */
const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "our", "new", "all", "any",
  "not", "are", "was", "has", "had", "this", "that", "into", "over",
  "out", "off", "per", "via", "you", "your",
]);

/**
 * Does free text mention the theme? Matches the full theme phrase
 * (underscores read as spaces) or any underscore-delimited token of it
 * — mirroring the provenance's keyword-list matching, where a theme
 * like pricing_monetization is hit by a "pricing sync" meeting title.
 * Tokens must match as WHOLE WORDS and stopwords never match, so
 * ship_the_deck cannot ride "the" into "weekly themes review".
 */
function textMatchesTheme(text: string, theme: string): boolean {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/));
  const tokens = theme.toLowerCase().split(/[_\s]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  // Full phrase: every token present as a whole word.
  if (tokens.every((tok) => words.has(tok))) return true;
  return tokens.some(
    (tok) =>
      tok.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(tok) && words.has(tok),
  );
}

/**
 * Derive enrichment axes for the 7th gate from live corpus signals.
 * Pure: no I/O, no thresholds — gating stays in EnrichmentGate.
 */
export function buildCorpusAxes(input: CorpusAxesInput): EnrichmentAxisInput[] {
  const tz = input.timezoneOffsetHours;
  const targetDays = new Set<string>();
  const referenceDays = new Set<string>();
  for (const [date, s] of input.signatures) {
    if (s.quality !== "real_inference") continue;
    (s.dominant === "BALANCED" ? referenceDays : targetDays).add(date);
  }
  // Without both classes there is no control ratio to compute.
  if (targetDays.size === 0 || referenceDays.size === 0) return [];

  // theme -> day -> sources. Memory topics mint themes; meetings and
  // calendar only corroborate themes already minted.
  const citations = new Map<string, Map<string, Set<string>>>();
  const cite = (theme: string, day: string, source: string) => {
    let days = citations.get(theme);
    if (!days) citations.set(theme, (days = new Map()));
    let sources = days.get(day);
    if (!sources) days.set(day, (sources = new Set()));
    sources.add(source);
  };

  for (const ins of input.insights) {
    if (ins.occurred_at_ts === null) continue;
    const day = localDayKey(ins.occurred_at_ts, tz);
    for (const topic of ins.topics) {
      // An empty topic would match every meeting; mint nothing from it.
      if (topic.trim() === "") continue;
      cite(topic, day, "memory");
    }
  }
  // llm_proposed themes (pipeline completeness stage 2): mint cited days
  // ONLY from literal whole-word matches on memory-insight rows — the same
  // matcher meetings/calendar corroboration uses, so LLM text never becomes
  // evidence and citations stay literal rows. A proposed theme colliding
  // with a memory-minted theme is dropped (memory minting wins), so origins
  // stay unambiguous and hits are never double-counted.
  const originByTheme = new Map<string, "memory_topic" | "llm_proposed">();
  for (const proposed of input.proposedThemes ?? []) {
    const theme = proposed.theme.trim();
    if (theme === "" || citations.has(theme)) continue;
    const terms = (proposed.terms ?? []).filter((term) => term.trim() !== "");
    for (const ins of input.insights) {
      if (ins.occurred_at_ts === null) continue;
      const text = `${ins.topics.join(" ")} ${ins.insight_text ?? ""}`;
      const hit =
        textMatchesTheme(text, theme) ||
        terms.some((term) => textMatchesTheme(text, term));
      if (!hit) continue;
      cite(theme, localDayKey(ins.occurred_at_ts, tz), "memory");
      originByTheme.set(theme, "llm_proposed");
    }
  }

  // Corroboration NEVER mints a cited day: a granola/calendar match only
  // counts on a day memory already cited for that theme (the dry-run
  // baseline's every cited day carries "memory"; anything looser would
  // be more generous than the hand-fed axes). The same rule applies on
  // the reference side, so both classes share identical citation
  // semantics — we forgo the (conservative) referenceRate inflation
  // that corroboration-only reference hits would bring.
  const themes = [...citations.keys()];
  for (const m of input.meetings) {
    if (m.occurred_at_ts === null) continue;
    const day = localDayKey(m.occurred_at_ts, tz);
    const text = `${m.title} ${m.summary ?? ""}`;
    for (const theme of themes) {
      if (!citations.get(theme)!.has(day)) continue;
      if (textMatchesTheme(text, theme)) cite(theme, day, "granola");
    }
  }
  for (const ev of input.calendarEvents) {
    const day = localDayKey(ev.start_ts, tz);
    for (const theme of themes) {
      if (!citations.get(theme)!.has(day)) continue;
      if (textMatchesTheme(ev.title, theme)) cite(theme, day, "calendar");
    }
  }

  const axes: EnrichmentAxisInput[] = [];
  for (const [theme, days] of citations) {
    const citedTargetDays = [...days.keys()]
      .filter((d) => targetDays.has(d))
      .sort();
    // A theme that never lands on a target day accuses nothing.
    if (citedTargetDays.length === 0) continue;
    const referenceHits = [...days.keys()].filter((d) =>
      referenceDays.has(d),
    ).length;
    axes.push({
      theme,
      origin: originByTheme.get(theme) ?? "memory_topic",
      targetHits: citedTargetDays.length,
      targetN: targetDays.size,
      referenceRate: referenceHits / referenceDays.size,
      referenceN: referenceDays.size,
      citedDays: citedTargetDays.map((date) => ({
        date,
        sources: [...days.get(date)!].sort(),
      })),
      rtmSuspected: true,
    });
  }

  // Precompute sort keys; Infinity (theme absent from reference) still
  // ranks first via MAX_VALUE so subtraction stays finite.
  const ratioOf = new Map(
    axes.map((a) => {
      const r = enrichmentRatio(a.targetHits, a.targetN, a.referenceRate);
      return [a.theme, Number.isFinite(r) ? r : Number.MAX_VALUE] as const;
    }),
  );
  axes.sort(
    (a, b) =>
      ratioOf.get(b.theme)! - ratioOf.get(a.theme)! ||
      b.citedDays.length - a.citedDays.length ||
      a.theme.localeCompare(b.theme),
  );
  return axes.slice(0, input.maxAxes ?? DEFAULT_MAX_AXES);
}
