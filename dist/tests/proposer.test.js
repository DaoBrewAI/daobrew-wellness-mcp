"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const proposer_js_1 = require("../src/engine/reasoner/proposer.js");
const corpusAxes_js_1 = require("../src/engine/reasoner/corpusAxes.js");
const EnrichmentGate_js_1 = require("../src/engine/reasoner/EnrichmentGate.js");
const schema_js_1 = require("../src/engine/schema.js");
const run_js_1 = require("../src/engine/run.js");
// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TZ = -7;
const PROPOSER_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
function sig(date, dominant) {
    return {
        date,
        dominant,
        scores: {
            TENSION: dominant === "TENSION" ? 0.6 : 0,
            OVERDRIVE: 0,
            STAGNATION: 0,
            CONSTRICTION: 0,
            DEPLETION: 0,
            BALANCED: dominant === "BALANCED" ? 0.6 : 0,
        },
        confidence: 0.5,
        coverage: 0.8,
        measurability: "hr-separable",
        flaggedUnmeasurable: false,
        quality: "real_inference",
    };
}
/** Epoch seconds at local noon of the given date (TZ = -7). */
function ts(date) {
    return Math.floor(Date.parse(`${date}T12:00:00-07:00`) / 1000);
}
function dayRange(startIso, n) {
    const out = [];
    const start = Date.parse(`${startIso}T00:00:00Z`);
    for (let i = 0; i < n; i++) {
        out.push(new Date(start + i * 86400_000).toISOString().slice(0, 10));
    }
    return out;
}
function stubLlm(payload) {
    const prompts = [];
    let calls = 0;
    return {
        prompts,
        llm: {
            async generateJson(prompt) {
                prompts.push(prompt);
                calls += 1;
                return typeof payload === "function" ? payload() : payload;
            },
            callsUsed: () => calls,
        },
    };
}
// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("proposer prompt", () => {
    (0, node_test_1.it)("exports the tunable prompt constant and embeds the bounded sample", () => {
        strict_1.default.equal(typeof proposer_js_1.THEME_PROPOSER_PROMPT, "string");
        strict_1.default.match(proposer_js_1.THEME_PROPOSER_PROMPT, /JSON/);
        const prompt = (0, proposer_js_1.buildProposerPrompt)([
            { source: "memory", text: "pricing pressure keeps resurfacing" },
            { source: "granola", text: "Q3 pricing sync" },
        ]);
        strict_1.default.ok(prompt.startsWith(proposer_js_1.THEME_PROPOSER_PROMPT));
        strict_1.default.match(prompt, /pricing pressure keeps resurfacing/);
        strict_1.default.match(prompt, /Q3 pricing sync/);
    });
    (0, node_test_1.it)("hard-caps the sample rows embedded in the prompt", () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ source: "memory", text: `row-${i}` }));
        const prompt = (0, proposer_js_1.buildProposerPrompt)(rows);
        strict_1.default.match(prompt, /row-0\b/);
        strict_1.default.match(prompt, new RegExp(`row-${proposer_js_1.PROPOSER_MAX_SAMPLE_ROWS - 1}\\b`));
        strict_1.default.ok(!prompt.includes(`row-${proposer_js_1.PROPOSER_MAX_SAMPLE_ROWS}\n`) && !new RegExp(`row-${proposer_js_1.PROPOSER_MAX_SAMPLE_ROWS}\\b`).test(prompt));
    });
});
// ---------------------------------------------------------------------------
// parsing + linting (pure, fixture-driven)
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("parseProposerResponse", () => {
    (0, node_test_1.it)("extracts {theme, terms} entries from a valid response", () => {
        const parsed = (0, proposer_js_1.parseProposerResponse)([
            { theme: "pricing_pressure", terms: ["pricing", "monetization"] },
            { theme: "fundraise", terms: [] },
        ]);
        strict_1.default.deepEqual(parsed, [
            { theme: "pricing_pressure", terms: ["pricing", "monetization"] },
            { theme: "fundraise", terms: [] },
        ]);
    });
    (0, node_test_1.it)("drops non-object entries, missing themes, and non-string terms", () => {
        const parsed = (0, proposer_js_1.parseProposerResponse)([
            "just a string",
            { terms: ["orphan"] },
            { theme: 42, terms: ["x"] },
            { theme: "ok_theme", terms: ["good", 7, null, "also good"] },
            null,
        ]);
        strict_1.default.deepEqual(parsed, [{ theme: "ok_theme", terms: ["good", "also good"] }]);
    });
    (0, node_test_1.it)("returns [] for non-array payloads (fail closed)", () => {
        strict_1.default.deepEqual((0, proposer_js_1.parseProposerResponse)({ themes: [] }), []);
        strict_1.default.deepEqual((0, proposer_js_1.parseProposerResponse)("nope"), []);
        strict_1.default.deepEqual((0, proposer_js_1.parseProposerResponse)(null), []);
        strict_1.default.deepEqual((0, proposer_js_1.parseProposerResponse)(undefined), []);
    });
});
(0, node_test_1.describe)("lintProposedThemes", () => {
    (0, node_test_1.it)("accepts lowercase word-char themes, normalizing spaces to underscores", () => {
        const linted = (0, proposer_js_1.lintProposedThemes)([
            { theme: "pricing pressure", terms: ["pricing"] },
            { theme: "deep_work", terms: ["focus block"] },
        ], []);
        strict_1.default.deepEqual(linted.map((t) => t.theme), ["pricing_pressure", "deep_work"]);
    });
    (0, node_test_1.it)("drops themes with uppercase, punctuation, or emptiness", () => {
        const linted = (0, proposer_js_1.lintProposedThemes)([
            { theme: "Pricing", terms: ["pricing"] },
            { theme: "ship-it!", terms: [] },
            { theme: "", terms: ["x"] },
            { theme: "ok", terms: [] },
        ], []);
        strict_1.default.deepEqual(linted.map((t) => t.theme), ["ok"]);
    });
    (0, node_test_1.it)("drops invalid terms but keeps the theme; caps terms per theme", () => {
        const linted = (0, proposer_js_1.lintProposedThemes)([{
                theme: "pricing",
                terms: [
                    "MONETIZATION", // uppercase -> dropped
                    "seven words is one too many for sure", // >6 words -> dropped
                    "tier review", // ok (2 words)
                    "a b c d e f", // ok (6 words)
                    "t1", "t2", "t3", "t4", "t5", "t6", "t7", // overflow beyond the cap
                ],
            }], []);
        strict_1.default.equal(linted.length, 1);
        strict_1.default.equal(linted[0].terms.length, proposer_js_1.PROPOSER_MAX_TERMS_PER_THEME);
        strict_1.default.ok(!linted[0].terms.includes("MONETIZATION"));
        strict_1.default.ok(linted[0].terms.includes("tier review"));
    });
    (0, node_test_1.it)("dedupes against existing memory-topic themes and within the proposal list, then caps", () => {
        const proposals = [
            { theme: "pricing_monetization", terms: [] }, // collides with memory topic
            { theme: "pricing monetization", terms: [] }, // same after normalization
            { theme: "unique_a", terms: [] },
            { theme: "unique_a", terms: [] }, // intra-list dupe
            { theme: "b1", terms: [] },
            { theme: "b2", terms: [] },
            { theme: "b3", terms: [] },
            { theme: "b4", terms: [] },
            { theme: "b5", terms: [] },
            { theme: "b6", terms: [] },
        ];
        const linted = (0, proposer_js_1.lintProposedThemes)(proposals, ["#Pricing-Monetization"]);
        strict_1.default.ok(!linted.some((t) => t.theme === "pricing_monetization"));
        strict_1.default.equal(linted.filter((t) => t.theme === "unique_a").length, 1);
        strict_1.default.equal(linted.length, proposer_js_1.PROPOSER_MAX_THEMES);
    });
});
// ---------------------------------------------------------------------------
// corpus sample
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("buildProposerCorpusSample", () => {
    (0, node_test_1.it)("mixes insight topics/text, meeting titles, and semantic neighbors under the 40-row cap", () => {
        const sample = (0, proposer_js_1.buildProposerCorpusSample)({
            insights: Array.from({ length: 30 }, (_, i) => ({
                insight_text: `insight ${i} about pricing`,
                topics: [`#topic-${i}`],
            })),
            meetings: Array.from({ length: 20 }, (_, i) => ({ title: `meeting ${i}` })),
            neighbors: Array.from({ length: 10 }, (_, i) => ({
                table: "meeting_notes",
                id: `n-${i}`,
                source_ref: null,
                snippet: `neighbor snippet ${i}`,
                distance: 0.1,
            })),
        });
        strict_1.default.ok(sample.length <= proposer_js_1.PROPOSER_MAX_SAMPLE_ROWS);
        strict_1.default.ok(sample.some((row) => row.source === "memory" && /insight 0/.test(row.text)));
        strict_1.default.ok(sample.some((row) => row.source === "granola" && /meeting 0/.test(row.text)));
        strict_1.default.ok(sample.some((row) => row.source === "semantic" && /neighbor snippet 0/.test(row.text)));
        strict_1.default.ok(sample.some((row) => /#topic-0/.test(row.text)), "insight topics ride along");
    });
    (0, node_test_1.it)("skips empty rows", () => {
        const sample = (0, proposer_js_1.buildProposerCorpusSample)({
            insights: [{ insight_text: "   ", topics: [] }],
            meetings: [{ title: "" }],
            neighbors: [],
        });
        strict_1.default.deepEqual(sample, []);
    });
});
// ---------------------------------------------------------------------------
// proposeThemes (fail-closed orchestration)
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("proposeThemes", () => {
    const sample = [{ source: "memory", text: "pricing pressure keeps resurfacing" }];
    (0, node_test_1.it)("returns linted themes from a valid LLM response", async () => {
        const { llm, prompts } = stubLlm([
            { theme: "pricing pressure", terms: ["pricing", "tier review"] },
            { theme: "BAD THEME", terms: [] },
        ]);
        const result = await (0, proposer_js_1.proposeThemes)({ userId: "u1", corpusSample: sample, llm });
        strict_1.default.deepEqual(result.themes, [{ theme: "pricing_pressure", terms: ["pricing", "tier review"] }]);
        strict_1.default.equal(prompts.length, 1);
        strict_1.default.match(prompts[0], /pricing pressure keeps resurfacing/);
    });
    (0, node_test_1.it)("folds semantic neighbors into the sample", async () => {
        const { llm, prompts } = stubLlm([]);
        await (0, proposer_js_1.proposeThemes)({
            userId: "u1",
            corpusSample: sample,
            semanticNeighbors: [{ table: "user_insights", id: "i1", source_ref: null, snippet: "deadline crunch neighbor", distance: 0.2 }],
            llm,
        });
        strict_1.default.match(prompts[0], /deadline crunch neighbor/);
    });
    (0, node_test_1.it)("fails closed to zero themes when the LLM throws", async () => {
        const result = await (0, proposer_js_1.proposeThemes)({
            userId: "u1",
            corpusSample: sample,
            llm: { generateJson: async () => { throw new Error("429 quota"); }, callsUsed: () => 1 },
        });
        strict_1.default.deepEqual(result.themes, []);
        strict_1.default.equal(result.warnings.length, 1);
        strict_1.default.match(result.warnings[0], /theme proposer failed/);
        strict_1.default.match(result.warnings[0], /429 quota/);
    });
    (0, node_test_1.it)("fails closed to zero themes on a malformed response shape", async () => {
        const { llm } = stubLlm({ not: "an array" });
        const result = await (0, proposer_js_1.proposeThemes)({ userId: "u1", corpusSample: sample, llm });
        strict_1.default.deepEqual(result.themes, []);
    });
    (0, node_test_1.it)("skips the LLM call entirely on an empty corpus sample", async () => {
        const { llm, prompts } = stubLlm([]);
        const result = await (0, proposer_js_1.proposeThemes)({ userId: "u1", corpusSample: [], llm });
        strict_1.default.deepEqual(result.themes, []);
        strict_1.default.equal(prompts.length, 0);
        strict_1.default.match(result.warnings[0], /empty corpus sample/);
    });
    (0, node_test_1.it)("dedupes proposals against existing memory-topic themes", async () => {
        const { llm } = stubLlm([
            { theme: "pricing_monetization", terms: [] },
            { theme: "novel_theme", terms: [] },
        ]);
        const result = await (0, proposer_js_1.proposeThemes)({
            userId: "u1",
            corpusSample: sample,
            existingThemes: ["pricing_monetization"],
            llm,
        });
        strict_1.default.deepEqual(result.themes.map((t) => t.theme), ["novel_theme"]);
    });
});
// ---------------------------------------------------------------------------
// buildCorpusAxes origin plumbing — proposed themes join the SAME literal
// matching + gate chain as memory topics; origin is observability only.
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("buildCorpusAxes with llm_proposed themes", () => {
    function scenario() {
        const targetDays = dayRange("2026-03-01", 6);
        const referenceDays = dayRange("2026-04-01", 6);
        const signatures = new Map();
        for (const d of targetDays)
            signatures.set(d, sig(d, "TENSION"));
        for (const d of referenceDays)
            signatures.set(d, sig(d, "BALANCED"));
        return { targetDays, referenceDays, signatures };
    }
    (0, node_test_1.it)("memory-topic axes default to origin memory_topic", () => {
        const { targetDays, signatures } = scenario();
        const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: targetDays.slice(0, 3).map((d) => ({ topics: ["pricing"], occurred_at_ts: ts(d) })),
            meetings: [],
            calendarEvents: [],
            timezoneOffsetHours: TZ,
        });
        strict_1.default.equal(axes.length, 1);
        strict_1.default.equal(axes[0].origin, "memory_topic");
    });
    (0, node_test_1.it)("proposed themes mint axes via literal whole-word matches on insight text — LLM text is never evidence", () => {
        const { targetDays, signatures } = scenario();
        const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: [
                { topics: [], occurred_at_ts: ts(targetDays[0]), insight_text: "deadline crunch before the launch" },
                { topics: [], occurred_at_ts: ts(targetDays[1]), insight_text: "another deadline scramble" },
                // No literal match on this one — the LLM cannot will a citation into being.
                { topics: [], occurred_at_ts: ts(targetDays[2]), insight_text: "calm architecture review" },
            ],
            meetings: [],
            calendarEvents: [],
            timezoneOffsetHours: TZ,
            proposedThemes: [
                { theme: "deadline_crunch", terms: ["deadline"] },
                // Theme with zero literal corpus hits -> no axis at all.
                { theme: "hallucinated_theme", terms: ["hallucinated"] },
            ],
        });
        strict_1.default.equal(axes.length, 1);
        const axis = axes[0];
        strict_1.default.equal(axis.theme, "deadline_crunch");
        strict_1.default.equal(axis.origin, "llm_proposed");
        strict_1.default.equal(axis.targetHits, 2);
        strict_1.default.deepEqual(axis.citedDays.map((d) => d.date), [targetDays[0], targetDays[1]]);
        // Cited days are literal insight rows -> the mint source stays "memory".
        strict_1.default.deepEqual(axis.citedDays[0].sources, ["memory"]);
    });
    (0, node_test_1.it)("stopword/short-token protection applies to proposed terms exactly as to memory themes", () => {
        const { targetDays, signatures } = scenario();
        const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: [{ topics: [], occurred_at_ts: ts(targetDays[0]), insight_text: "we shipped the deck for review" }],
            meetings: [],
            calendarEvents: [],
            timezoneOffsetHours: TZ,
            // "the" is a stopword and "it" is under the token-length floor — the
            // phrase itself is absent, so nothing can ride function words in.
            proposedThemes: [{ theme: "own_the_room", terms: ["it"] }],
        });
        strict_1.default.deepEqual(axes, []);
    });
    (0, node_test_1.it)("a proposed theme duplicating a memory topic never double-mints", () => {
        const { targetDays, signatures } = scenario();
        const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: targetDays.slice(0, 3).map((d) => ({ topics: ["pricing"], occurred_at_ts: ts(d), insight_text: "pricing talk" })),
            meetings: [],
            calendarEvents: [],
            timezoneOffsetHours: TZ,
            proposedThemes: [{ theme: "pricing", terms: ["pricing"] }],
        });
        strict_1.default.equal(axes.length, 1);
        strict_1.default.equal(axes[0].origin, "memory_topic", "memory minting wins; the duplicate proposal is ignored");
    });
    (0, node_test_1.it)("granola/calendar corroborate proposed-theme days under the identical never-mint rule", () => {
        const { targetDays, signatures } = scenario();
        const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: [{ topics: [], occurred_at_ts: ts(targetDays[0]), insight_text: "deadline crunch again" }],
            meetings: [
                { title: "deadline planning", summary: null, occurred_at_ts: ts(targetDays[0]) }, // corroborates a cited day
                { title: "deadline planning", summary: null, occurred_at_ts: ts(targetDays[1]) }, // uncited day -> must NOT mint
            ],
            calendarEvents: [],
            timezoneOffsetHours: TZ,
            proposedThemes: [{ theme: "deadline_crunch", terms: ["deadline"] }],
        });
        strict_1.default.equal(axes.length, 1);
        strict_1.default.deepEqual(axes[0].citedDays, [{ date: targetDays[0], sources: ["granola", "memory"] }]);
    });
    (0, node_test_1.it)("an llm_proposed axis passes/fails the EnrichmentGate identically to a memory-topic axis with the same data", () => {
        const { targetDays, signatures } = scenario();
        const days = targetDays.slice(0, 3);
        const viaMemoryTopic = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: days.map((d) => ({ topics: ["deadline_crunch"], occurred_at_ts: ts(d) })),
            meetings: days.map((d) => ({ title: "deadline crunch sync", summary: null, occurred_at_ts: ts(d) })),
            calendarEvents: [],
            timezoneOffsetHours: TZ,
        });
        const viaProposer = (0, corpusAxes_js_1.buildCorpusAxes)({
            signatures,
            insights: days.map((d) => ({ topics: [], occurred_at_ts: ts(d), insight_text: "deadline crunch notes" })),
            meetings: days.map((d) => ({ title: "deadline crunch sync", summary: null, occurred_at_ts: ts(d) })),
            calendarEvents: [],
            timezoneOffsetHours: TZ,
            proposedThemes: [{ theme: "deadline_crunch", terms: ["deadline"] }],
        });
        strict_1.default.equal(viaMemoryTopic.length, 1);
        strict_1.default.equal(viaProposer.length, 1);
        const [memAxis] = viaMemoryTopic;
        const [llmAxis] = viaProposer;
        strict_1.default.equal(memAxis.origin, "memory_topic");
        strict_1.default.equal(llmAxis.origin, "llm_proposed");
        // Same numbers in -> same axis out (origin is the only difference).
        strict_1.default.deepEqual({ ...llmAxis, origin: undefined }, { ...memAxis, origin: undefined });
        // And the 7th gate treats them identically: verdicts byte-equal.
        const gateOf = (axis) => (0, EnrichmentGate_js_1.enrichmentGate)({
            theme: axis.theme,
            targetHits: axis.targetHits,
            targetN: axis.targetN,
            referenceRate: axis.referenceRate,
            referenceN: axis.referenceN,
            citedDays: axis.citedDays.map((d) => ({ date: d.date, backed: true, sources: d.sources })),
            rtmSuspected: axis.rtmSuspected,
        });
        strict_1.default.deepEqual(gateOf(llmAxis), gateOf(memAxis));
    });
});
// ---------------------------------------------------------------------------
// run.ts hook: window/replay runs propose (injected LLM seam), fail-soft
// ---------------------------------------------------------------------------
function sqliteCliPresent() {
    try {
        (0, node_child_process_1.execFileSync)("sqlite3", ["-version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
async function withSqliteStore(run) {
    const tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-proposer-"));
    const dbPath = (0, node_path_1.join)(tmpDir, "sentinel-graph.db");
    const saved = {
        DAOBREW_GRAPH_DB: process.env.DAOBREW_GRAPH_DB,
        DAOBREW_GRAPH_STORE: process.env.DAOBREW_GRAPH_STORE,
        DAOBREW_API_KEY: process.env.DAOBREW_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    };
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    process.env.DAOBREW_GRAPH_DB = dbPath;
    delete process.env.DAOBREW_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
        (0, schema_js_1.ensureSchema)(dbPath);
        await run(dbPath);
    }
    finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
        (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
    }
}
(0, node_test_1.describe)("run.ts proposer hook (window/replay runs)", () => {
    (0, node_test_1.it)("replay run with an injected LLM proposes themes and reports the count; run proceeds", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withSqliteStore(async (dbPath) => {
            const nowSec = Math.floor(Date.now() / 1000);
            (0, node_child_process_1.execFileSync)("sqlite3", [dbPath, `
        INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
        VALUES ('mem-1', '${PROPOSER_TEST_USER}', 'claude_project_session', 's1', 'Deadline crunch dominated the week.', '["#deadline"]', 0.8, 1.0, ${nowSec - 86400}, NULL, ${nowSec - 86400});
      `]);
            const { llm, prompts } = stubLlm([{ theme: "deadline_crunch", terms: ["deadline"] }]);
            const result = await (0, run_js_1.runEngineOnce)({
                once: true,
                userId: PROPOSER_TEST_USER,
                startTs: nowSec - 30 * 86400,
                endTs: nowSec,
                proposerLlm: llm,
            });
            // No biometrics on this store -> no_signal, but the proposer already ran.
            strict_1.default.equal(result.status, "no_signal");
            strict_1.default.equal(result.proposed_theme_count, 1);
            strict_1.default.equal(prompts.length, 1);
            strict_1.default.match(prompts[0], /Deadline crunch dominated the week/);
            // v2 never activated -> surviving-axis count stays omitted (0 would be ambiguous).
            strict_1.default.equal(result.llm_proposed_axes_count, undefined);
        });
    });
    (0, node_test_1.it)("replay run without a Gemini key skips the proposer with a loud warning and zero proposals", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withSqliteStore(async () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const result = await (0, run_js_1.runEngineOnce)({
                once: true,
                userId: PROPOSER_TEST_USER,
                startTs: nowSec - 30 * 86400,
                endTs: nowSec,
            });
            strict_1.default.equal(result.proposed_theme_count, undefined);
            strict_1.default.ok(result.warnings.some((w) => /theme proposer skipped: no Gemini key/.test(w)));
        });
    });
    (0, node_test_1.it)("live (non-window) runs never invoke the proposer", async () => {
        await withSqliteStore(async () => {
            const { llm, prompts } = stubLlm([{ theme: "x_theme", terms: [] }]);
            const result = await (0, run_js_1.runEngineOnce)({
                once: true,
                demo: true,
                userId: PROPOSER_TEST_USER,
                proposerLlm: llm,
            });
            strict_1.default.equal(prompts.length, 0);
            strict_1.default.equal(result.proposed_theme_count, undefined);
        });
    });
    (0, node_test_1.it)("a throwing LLM yields zero proposals and the run still completes", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withSqliteStore(async (dbPath) => {
            const nowSec = Math.floor(Date.now() / 1000);
            (0, node_child_process_1.execFileSync)("sqlite3", [dbPath, `
        INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
        VALUES ('mem-1', '${PROPOSER_TEST_USER}', 'claude_project_session', 's1', 'Some insight.', '[]', 0.8, 1.0, ${nowSec - 86400}, NULL, ${nowSec - 86400});
      `]);
            const result = await (0, run_js_1.runEngineOnce)({
                once: true,
                userId: PROPOSER_TEST_USER,
                startTs: nowSec - 30 * 86400,
                endTs: nowSec,
                proposerLlm: { generateJson: async () => { throw new Error("boom"); }, callsUsed: () => 1 },
            });
            strict_1.default.equal(result.status, "no_signal");
            strict_1.default.equal(result.proposed_theme_count, 0);
            strict_1.default.ok(result.warnings.some((w) => /theme proposer failed/.test(w)));
        });
    });
});
