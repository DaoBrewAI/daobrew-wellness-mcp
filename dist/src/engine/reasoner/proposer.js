"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_PROPOSER_PROMPT = exports.PROPOSER_SAMPLE_ALLOCATION = exports.PROPOSER_ROW_TEXT_MAX = exports.PROPOSER_MAX_SAMPLE_ROWS = exports.PROPOSER_MAX_TERM_WORDS = exports.PROPOSER_MAX_TERMS_PER_THEME = exports.PROPOSER_MAX_THEMES = void 0;
exports.buildProposerPrompt = buildProposerPrompt;
exports.buildProposerCorpusSample = buildProposerCorpusSample;
exports.parseProposerResponse = parseProposerResponse;
exports.lintProposedThemes = lintProposedThemes;
exports.proposeThemes = proposeThemes;
exports.PROPOSER_MAX_THEMES = 6;
exports.PROPOSER_MAX_TERMS_PER_THEME = 6;
exports.PROPOSER_MAX_TERM_WORDS = 6;
exports.PROPOSER_MAX_SAMPLE_ROWS = 40;
/** Per-row text cap in the prompt sample (mirrors the semantic snippet cap). */
exports.PROPOSER_ROW_TEXT_MAX = 200;
/** Per-source allocation under the 40-row cap so one chatty source cannot
 *  crowd the others out of the sample: 20 insights + 12 meetings + 8 neighbors. */
exports.PROPOSER_SAMPLE_ALLOCATION = { memory: 20, granola: 12, semantic: 8 };
/**
 * Tunable LLM-helper prompt (joins the memory/llm.ts snapshot/nightly prompt
 * set). The sample rows are appended by buildProposerPrompt.
 */
exports.THEME_PROPOSER_PROMPT = [
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
/** Bounded prompt: header + up to PROPOSER_MAX_SAMPLE_ROWS sample rows. */
function buildProposerPrompt(sampleRows) {
    const rows = sampleRows
        .slice(0, exports.PROPOSER_MAX_SAMPLE_ROWS)
        .map((row) => `- [${row.source}] ${row.text.slice(0, exports.PROPOSER_ROW_TEXT_MAX)}`);
    return `${exports.THEME_PROPOSER_PROMPT}\n${rows.join("\n")}`;
}
/**
 * Build the bounded corpus sample: recent insight topics/text snippets +
 * meeting titles + Task-A semantic neighbors, per-source capped so the total
 * stays <= 40 rows. Deterministic given the (already recency-ordered) inputs.
 */
function buildProposerCorpusSample(input) {
    const rows = [];
    const push = (source, text) => {
        const trimmed = text.trim();
        if (trimmed !== "")
            rows.push({ source, text: trimmed.slice(0, exports.PROPOSER_ROW_TEXT_MAX) });
    };
    for (const ins of input.insights.slice(0, exports.PROPOSER_SAMPLE_ALLOCATION.memory)) {
        push("memory", `${(ins.topics ?? []).join(" ")} ${ins.insight_text ?? ""}`);
    }
    for (const meeting of input.meetings.slice(0, exports.PROPOSER_SAMPLE_ALLOCATION.granola)) {
        push("granola", meeting.title);
    }
    for (const neighbor of (input.neighbors ?? []).slice(0, exports.PROPOSER_SAMPLE_ALLOCATION.semantic)) {
        push("semantic", neighbor.snippet);
    }
    return rows.slice(0, exports.PROPOSER_MAX_SAMPLE_ROWS);
}
/** Structural extraction only — no linting here. Non-array payloads and
 *  entries without a string theme are dropped; non-string terms are dropped. */
function parseProposerResponse(payload) {
    if (!Array.isArray(payload))
        return [];
    const parsed = [];
    for (const entry of payload) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            continue;
        const theme = entry.theme;
        if (typeof theme !== "string")
            continue;
        const rawTerms = entry.terms;
        const terms = Array.isArray(rawTerms) ? rawTerms.filter((t) => typeof t === "string") : [];
        parsed.push({ theme, terms });
    }
    return parsed;
}
const THEME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const TERM_WORD_PATTERN = /^[a-z0-9]+$/;
/** Normalize an existing-theme key the same way lint normalizes proposals:
 *  lowercase, non-alphanumeric runs collapse to single underscores. */
function themeKey(theme) {
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
function lintProposedThemes(themes, existingThemes) {
    const seen = new Set();
    for (const existing of existingThemes) {
        const key = themeKey(existing);
        if (key !== "")
            seen.add(key);
    }
    const linted = [];
    for (const candidate of themes) {
        if (linted.length >= exports.PROPOSER_MAX_THEMES)
            break;
        const theme = candidate.theme.trim().replace(/\s+/g, "_");
        if (!THEME_PATTERN.test(theme))
            continue;
        if (theme.split("_").length > exports.PROPOSER_MAX_TERM_WORDS)
            continue;
        if (seen.has(theme))
            continue;
        const terms = [];
        for (const rawTerm of candidate.terms) {
            if (terms.length >= exports.PROPOSER_MAX_TERMS_PER_THEME)
                break;
            const term = rawTerm.trim().replace(/\s+/g, " ");
            const words = term.split(" ");
            if (term === "" || words.length > exports.PROPOSER_MAX_TERM_WORDS)
                continue;
            if (!words.every((word) => TERM_WORD_PATTERN.test(word)))
                continue;
            if (!terms.includes(term))
                terms.push(term);
        }
        seen.add(theme);
        linted.push({ theme, terms });
    }
    return linted;
}
/**
 * Propose candidate themes via the LLM. Fail-closed: empty sample skips the
 * call, any LLM/parse failure returns zero themes with one warning — the
 * caller's run always proceeds.
 */
async function proposeThemes(input) {
    const warnings = [];
    const rows = [
        ...input.corpusSample,
        ...(input.semanticNeighbors ?? []).map((neighbor) => ({
            source: "semantic",
            text: neighbor.snippet,
        })),
    ]
        .filter((row) => row.text.trim() !== "")
        .slice(0, exports.PROPOSER_MAX_SAMPLE_ROWS);
    if (rows.length === 0) {
        warnings.push("theme proposer skipped: empty corpus sample — nothing to propose from");
        return { themes: [], warnings };
    }
    let payload;
    try {
        payload = await input.llm.generateJson(buildProposerPrompt(rows));
    }
    catch (err) {
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
