import { TextGenerationProvider } from "../memory/llm.js";
import { SemanticNeighbor } from "../retrieval/semantic.js";

/**
 * LLM theme proposer — pipeline-completeness stage 2 (MVP MUST, design doc
 * 2026-07-06).
 *
 * Propose-only, never assert: Gemini suggests candidate themes from a bounded
 * sample of the user's own corpus rows + semantic neighbors, and those themes
 * enter buildCorpusAxes tagged origin='llm_proposed'. From there they pass
 * the IDENTICAL literal whole-word matching + enrichment/7-gate/verification
 * chain as memory-topic themes — LLM text never becomes evidence and
 * citations stay literal corpus rows. Fail-closed like memory/llm.ts callers:
 * any LLM failure, malformed response, or lint rejection degrades to zero
 * proposals and the run proceeds.
 */

export interface ProposedTheme {
  theme: string;
  terms: string[];
}

export const PROPOSER_MAX_THEMES = 6;
export const PROPOSER_MAX_TERMS_PER_THEME = 6;
export const PROPOSER_MAX_TERM_WORDS = 6;
export const PROPOSER_MAX_SAMPLE_ROWS = 40;
/** Per-row text cap in the prompt sample (mirrors the semantic snippet cap). */
export const PROPOSER_ROW_TEXT_MAX = 200;
/** Per-source allocation under the 40-row cap so one chatty source cannot
 *  crowd the others out of the sample: 20 insights + 12 meetings + 8 neighbors. */
export const PROPOSER_SAMPLE_ALLOCATION = { memory: 20, granola: 12, semantic: 8 } as const;

/**
 * Tunable LLM-helper prompt (joins the memory/llm.ts snapshot/nightly prompt
 * set). The sample rows are appended by buildProposerPrompt.
 */
export const THEME_PROPOSER_PROMPT = [
  "You extract recurring WORK THEMES from a founder's own notes.",
  "Below is a sample of the user's memory insights, meeting titles, and semantically similar rows.",
  "Propose at most 6 candidate themes that recur across the rows.",
  "Rules:",
  "- Use ONLY words that literally appear in the rows; do not invent vocabulary.",
  "- theme: a short snake_case tag, lowercase letters/digits/underscores only (e.g. pricing_pressure).",
  "- terms: up to 6 short search terms (each at most 6 lowercase words) that literally appear in the rows.",
  "Return STRICT JSON only, no prose: an array like",
  '[{"theme": "pricing_pressure", "terms": ["pricing", "tier review"]}]',
  "Return [] if no theme recurs.",
  "",
  "Rows:",
].join("\n");

export interface ProposerCorpusRow {
  source: "memory" | "granola" | "semantic";
  text: string;
}

/** Bounded prompt: header + up to PROPOSER_MAX_SAMPLE_ROWS sample rows. */
export function buildProposerPrompt(sampleRows: readonly ProposerCorpusRow[]): string {
  const rows = sampleRows
    .slice(0, PROPOSER_MAX_SAMPLE_ROWS)
    .map((row) => `- [${row.source}] ${row.text.slice(0, PROPOSER_ROW_TEXT_MAX)}`);
  return `${THEME_PROPOSER_PROMPT}\n${rows.join("\n")}`;
}

export interface ProposerSampleInput {
  insights: readonly { insight_text?: string | null; topics?: readonly string[] }[];
  meetings: readonly { title: string }[];
  neighbors?: readonly SemanticNeighbor[];
}

/**
 * Build the bounded corpus sample: recent insight topics/text snippets +
 * meeting titles + Task-A semantic neighbors, per-source capped so the total
 * stays <= 40 rows. Deterministic given the (already recency-ordered) inputs.
 */
export function buildProposerCorpusSample(input: ProposerSampleInput): ProposerCorpusRow[] {
  const rows: ProposerCorpusRow[] = [];
  const push = (source: ProposerCorpusRow["source"], text: string) => {
    const trimmed = text.trim();
    if (trimmed !== "") rows.push({ source, text: trimmed.slice(0, PROPOSER_ROW_TEXT_MAX) });
  };
  for (const ins of input.insights.slice(0, PROPOSER_SAMPLE_ALLOCATION.memory)) {
    push("memory", `${(ins.topics ?? []).join(" ")} ${ins.insight_text ?? ""}`);
  }
  for (const meeting of input.meetings.slice(0, PROPOSER_SAMPLE_ALLOCATION.granola)) {
    push("granola", meeting.title);
  }
  for (const neighbor of (input.neighbors ?? []).slice(0, PROPOSER_SAMPLE_ALLOCATION.semantic)) {
    push("semantic", neighbor.snippet);
  }
  return rows.slice(0, PROPOSER_MAX_SAMPLE_ROWS);
}

/** Structural extraction only — no linting here. Non-array payloads and
 *  entries without a string theme are dropped; non-string terms are dropped. */
export function parseProposerResponse(payload: unknown): ProposedTheme[] {
  if (!Array.isArray(payload)) return [];
  const parsed: ProposedTheme[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const theme = (entry as Record<string, unknown>).theme;
    if (typeof theme !== "string") continue;
    const rawTerms = (entry as Record<string, unknown>).terms;
    const terms = Array.isArray(rawTerms) ? rawTerms.filter((t): t is string => typeof t === "string") : [];
    parsed.push({ theme, terms });
  }
  return parsed;
}

const THEME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const TERM_WORD_PATTERN = /^[a-z0-9]+$/;

/** Normalize an existing-theme key the same way lint normalizes proposals:
 *  lowercase, non-alphanumeric runs collapse to single underscores. */
function themeKey(theme: string): string {
  return theme
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Hard lint (drop, never fix beyond whitespace->underscore normalization):
 * lowercase word chars only, <= 6 tokens per theme, <= 6 terms of <= 6
 * lowercase words each; dedupe against existing memory-topic themes and
 * within the list; cap at PROPOSER_MAX_THEMES.
 */
export function lintProposedThemes(
  themes: readonly ProposedTheme[],
  existingThemes: Iterable<string>,
): ProposedTheme[] {
  const seen = new Set<string>();
  for (const existing of existingThemes) {
    const key = themeKey(existing);
    if (key !== "") seen.add(key);
  }
  const linted: ProposedTheme[] = [];
  for (const candidate of themes) {
    if (linted.length >= PROPOSER_MAX_THEMES) break;
    const theme = candidate.theme.trim().replace(/\s+/g, "_");
    if (!THEME_PATTERN.test(theme)) continue;
    if (theme.split("_").length > PROPOSER_MAX_TERM_WORDS) continue;
    if (seen.has(theme)) continue;
    const terms: string[] = [];
    for (const rawTerm of candidate.terms) {
      if (terms.length >= PROPOSER_MAX_TERMS_PER_THEME) break;
      const term = rawTerm.trim().replace(/\s+/g, " ");
      const words = term.split(" ");
      if (term === "" || words.length > PROPOSER_MAX_TERM_WORDS) continue;
      if (!words.every((word) => TERM_WORD_PATTERN.test(word))) continue;
      if (!terms.includes(term)) terms.push(term);
    }
    seen.add(theme);
    linted.push({ theme, terms });
  }
  return linted;
}

export interface ProposeThemesInput {
  userId: string;
  corpusSample: readonly ProposerCorpusRow[];
  /** Task-A neighbors, folded into the sample under the same 40-row cap. */
  semanticNeighbors?: readonly SemanticNeighbor[];
  /** Existing memory-topic themes; proposals colliding with them are dropped. */
  existingThemes?: Iterable<string>;
  llm: TextGenerationProvider;
}

export interface ProposeThemesResult {
  themes: ProposedTheme[];
  warnings: string[];
}

/**
 * Propose candidate themes via the LLM. Fail-closed: empty sample skips the
 * call, any LLM/parse failure returns zero themes with one warning — the
 * caller's run always proceeds.
 */
export async function proposeThemes(input: ProposeThemesInput): Promise<ProposeThemesResult> {
  const warnings: string[] = [];
  const rows = [
    ...input.corpusSample,
    ...(input.semanticNeighbors ?? []).map((neighbor): ProposerCorpusRow => ({
      source: "semantic",
      text: neighbor.snippet,
    })),
  ]
    .filter((row) => row.text.trim() !== "")
    .slice(0, PROPOSER_MAX_SAMPLE_ROWS);
  if (rows.length === 0) {
    warnings.push("theme proposer skipped: empty corpus sample — nothing to propose from");
    return { themes: [], warnings };
  }

  let payload: unknown;
  try {
    payload = await input.llm.generateJson(buildProposerPrompt(rows));
  } catch (err: any) {
    warnings.push(`theme proposer failed; zero proposals this run: ${err?.message ?? err}`);
    return { themes: [], warnings };
  }
  const parsed = parseProposerResponse(payload);
  const themes = lintProposedThemes(parsed, input.existingThemes ?? []);
  if (parsed.length > themes.length) {
    warnings.push(`theme proposer dropped ${parsed.length - themes.length} candidate(s) failing lint/dedupe`);
  }
  return { themes, warnings };
}
