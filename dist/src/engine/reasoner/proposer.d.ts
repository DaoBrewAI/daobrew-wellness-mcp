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
export declare const PROPOSER_MAX_THEMES = 6;
export declare const PROPOSER_MAX_TERMS_PER_THEME = 6;
export declare const PROPOSER_MAX_TERM_WORDS = 6;
export declare const PROPOSER_MAX_SAMPLE_ROWS = 40;
/** Per-row text cap in the prompt sample (mirrors the semantic snippet cap). */
export declare const PROPOSER_ROW_TEXT_MAX = 200;
/** Per-source allocation under the 40-row cap so one chatty source cannot
 *  crowd the others out of the sample: 20 insights + 12 meetings + 8 neighbors. */
export declare const PROPOSER_SAMPLE_ALLOCATION: {
    readonly memory: 20;
    readonly granola: 12;
    readonly semantic: 8;
};
/**
 * Tunable LLM-helper prompt (joins the memory/llm.ts snapshot/nightly prompt
 * set). The sample rows are appended by buildProposerPrompt.
 */
export declare const THEME_PROPOSER_PROMPT: string;
export interface ProposerCorpusRow {
    source: "memory" | "granola" | "semantic";
    text: string;
}
/** Bounded prompt: header + up to PROPOSER_MAX_SAMPLE_ROWS sample rows. */
export declare function buildProposerPrompt(sampleRows: readonly ProposerCorpusRow[]): string;
export interface ProposerSampleInput {
    insights: readonly {
        insight_text?: string | null;
        topics?: readonly string[];
    }[];
    meetings: readonly {
        title: string;
    }[];
    neighbors?: readonly SemanticNeighbor[];
}
/**
 * Build the bounded corpus sample: recent insight topics/text snippets +
 * meeting titles + Task-A semantic neighbors, per-source capped so the total
 * stays <= 40 rows. Deterministic given the (already recency-ordered) inputs.
 */
export declare function buildProposerCorpusSample(input: ProposerSampleInput): ProposerCorpusRow[];
/** Structural extraction only — no linting here. Non-array payloads and
 *  entries without a string theme are dropped; non-string terms are dropped. */
export declare function parseProposerResponse(payload: unknown): ProposedTheme[];
/**
 * Hard lint (drop, never fix beyond whitespace->underscore normalization):
 * lowercase word chars only, <= 6 tokens per theme, <= 6 terms of <= 6
 * lowercase words each; dedupe against existing memory-topic themes and
 * within the list; cap at PROPOSER_MAX_THEMES.
 */
export declare function lintProposedThemes(themes: readonly ProposedTheme[], existingThemes: Iterable<string>): ProposedTheme[];
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
export declare function proposeThemes(input: ProposeThemesInput): Promise<ProposeThemesResult>;
