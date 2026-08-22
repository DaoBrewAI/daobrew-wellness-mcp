import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildProposerCorpusSample,
  buildProposerPrompt,
  lintProposedThemes,
  parseProposerResponse,
  proposeThemes,
  ProposedTheme,
  PROPOSER_MAX_SAMPLE_ROWS,
  PROPOSER_MAX_TERMS_PER_THEME,
  PROPOSER_MAX_THEMES,
  THEME_PROPOSER_PROMPT,
} from "../src/engine/reasoner/proposer.js";
import { buildCorpusAxes } from "../src/engine/reasoner/corpusAxes.js";
import { enrichmentGate } from "../src/engine/reasoner/EnrichmentGate.js";
import type { PatternLabel, PatternSignature } from "../src/engine/signals/patterns.js";
import { ensureSchema } from "../src/engine/schema.js";
import { runEngineOnce } from "../src/engine/run.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const TZ = -7;
const PROPOSER_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";

function sig(date: string, dominant: PatternLabel): PatternSignature {
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
function ts(date: string): number {
  return Math.floor(Date.parse(`${date}T12:00:00-07:00`) / 1000);
}

function dayRange(startIso: string, n: number): string[] {
  const out: string[] = [];
  const start = Date.parse(`${startIso}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(new Date(start + i * 86400_000).toISOString().slice(0, 10));
  }
  return out;
}

function stubLlm(payload: unknown | (() => unknown)): { llm: { generateJson(prompt: string): Promise<unknown>; callsUsed(): number }; prompts: string[] } {
  const prompts: string[] = [];
  let calls = 0;
  return {
    prompts,
    llm: {
      async generateJson(prompt: string) {
        prompts.push(prompt);
        calls += 1;
        return typeof payload === "function" ? (payload as () => unknown)() : payload;
      },
      callsUsed: () => calls,
    },
  };
}

// ---------------------------------------------------------------------------
// prompt
// ---------------------------------------------------------------------------

describe("proposer prompt", () => {
  it("exports the tunable prompt constant and embeds the bounded sample", () => {
    assert.equal(typeof THEME_PROPOSER_PROMPT, "string");
    assert.match(THEME_PROPOSER_PROMPT, /JSON/);
    const prompt = buildProposerPrompt([
      { source: "memory", text: "pricing pressure keeps resurfacing" },
      { source: "granola", text: "Q3 pricing sync" },
    ]);
    assert.ok(prompt.startsWith(THEME_PROPOSER_PROMPT));
    assert.match(prompt, /pricing pressure keeps resurfacing/);
    assert.match(prompt, /Q3 pricing sync/);
  });

  it("hard-caps the sample rows embedded in the prompt", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ source: "memory" as const, text: `row-${i}` }));
    const prompt = buildProposerPrompt(rows);
    assert.match(prompt, /row-0\b/);
    assert.match(prompt, new RegExp(`row-${PROPOSER_MAX_SAMPLE_ROWS - 1}\\b`));
    assert.ok(!prompt.includes(`row-${PROPOSER_MAX_SAMPLE_ROWS}\n`) && !new RegExp(`row-${PROPOSER_MAX_SAMPLE_ROWS}\\b`).test(prompt));
  });
});

// ---------------------------------------------------------------------------
// parsing + linting (pure, fixture-driven)
// ---------------------------------------------------------------------------

describe("parseProposerResponse", () => {
  it("extracts {theme, terms} entries from a valid response", () => {
    const parsed = parseProposerResponse([
      { theme: "pricing_pressure", terms: ["pricing", "monetization"] },
      { theme: "fundraise", terms: [] },
    ]);
    assert.deepEqual(parsed, [
      { theme: "pricing_pressure", terms: ["pricing", "monetization"] },
      { theme: "fundraise", terms: [] },
    ]);
  });

  it("drops non-object entries, missing themes, and non-string terms", () => {
    const parsed = parseProposerResponse([
      "just a string",
      { terms: ["orphan"] },
      { theme: 42, terms: ["x"] },
      { theme: "ok_theme", terms: ["good", 7, null, "also good"] },
      null,
    ]);
    assert.deepEqual(parsed, [{ theme: "ok_theme", terms: ["good", "also good"] }]);
  });

  it("returns [] for non-array payloads (fail closed)", () => {
    assert.deepEqual(parseProposerResponse({ themes: [] }), []);
    assert.deepEqual(parseProposerResponse("nope"), []);
    assert.deepEqual(parseProposerResponse(null), []);
    assert.deepEqual(parseProposerResponse(undefined), []);
  });
});

describe("lintProposedThemes", () => {
  it("accepts lowercase word-char themes, normalizing spaces to underscores", () => {
    const linted = lintProposedThemes(
      [
        { theme: "pricing pressure", terms: ["pricing"] },
        { theme: "deep_work", terms: ["focus block"] },
      ],
      [],
    );
    assert.deepEqual(linted.map((t) => t.theme), ["pricing_pressure", "deep_work"]);
  });

  it("drops themes with uppercase, punctuation, or emptiness", () => {
    const linted = lintProposedThemes(
      [
        { theme: "Pricing", terms: ["pricing"] },
        { theme: "ship-it!", terms: [] },
        { theme: "", terms: ["x"] },
        { theme: "ok", terms: [] },
      ],
      [],
    );
    assert.deepEqual(linted.map((t) => t.theme), ["ok"]);
  });

  it("drops invalid terms but keeps the theme; caps terms per theme", () => {
    const linted = lintProposedThemes(
      [{
        theme: "pricing",
        terms: [
          "MONETIZATION",              // uppercase -> dropped
          "seven words is one too many for sure", // >6 words -> dropped
          "tier review",               // ok (2 words)
          "a b c d e f",               // ok (6 words)
          "t1", "t2", "t3", "t4", "t5", "t6", "t7", // overflow beyond the cap
        ],
      }],
      [],
    );
    assert.equal(linted.length, 1);
    assert.equal(linted[0].terms.length, PROPOSER_MAX_TERMS_PER_THEME);
    assert.ok(!linted[0].terms.includes("MONETIZATION"));
    assert.ok(linted[0].terms.includes("tier review"));
  });

  it("dedupes against existing memory-topic themes and within the proposal list, then caps", () => {
    const proposals: ProposedTheme[] = [
      { theme: "pricing_monetization", terms: [] }, // collides with memory topic
      { theme: "pricing monetization", terms: [] }, // same after normalization
      { theme: "unique_a", terms: [] },
      { theme: "unique_a", terms: [] },             // intra-list dupe
      { theme: "b1", terms: [] },
      { theme: "b2", terms: [] },
      { theme: "b3", terms: [] },
      { theme: "b4", terms: [] },
      { theme: "b5", terms: [] },
      { theme: "b6", terms: [] },
    ];
    const linted = lintProposedThemes(proposals, ["#Pricing-Monetization"]);
    assert.ok(!linted.some((t) => t.theme === "pricing_monetization"));
    assert.equal(linted.filter((t) => t.theme === "unique_a").length, 1);
    assert.equal(linted.length, PROPOSER_MAX_THEMES);
  });
});

// ---------------------------------------------------------------------------
// corpus sample
// ---------------------------------------------------------------------------

describe("buildProposerCorpusSample", () => {
  it("mixes insight topics/text, meeting titles, and semantic neighbors under the 40-row cap", () => {
    const sample = buildProposerCorpusSample({
      insights: Array.from({ length: 30 }, (_, i) => ({
        insight_text: `insight ${i} about pricing`,
        topics: [`#topic-${i}`],
      })),
      meetings: Array.from({ length: 20 }, (_, i) => ({ title: `meeting ${i}` })),
      neighbors: Array.from({ length: 10 }, (_, i) => ({
        table: "meeting_notes" as const,
        id: `n-${i}`,
        source_ref: null,
        snippet: `neighbor snippet ${i}`,
        distance: 0.1,
      })),
    });
    assert.ok(sample.length <= PROPOSER_MAX_SAMPLE_ROWS);
    assert.ok(sample.some((row) => row.source === "memory" && /insight 0/.test(row.text)));
    assert.ok(sample.some((row) => row.source === "granola" && /meeting 0/.test(row.text)));
    assert.ok(sample.some((row) => row.source === "semantic" && /neighbor snippet 0/.test(row.text)));
    assert.ok(sample.some((row) => /#topic-0/.test(row.text)), "insight topics ride along");
  });

  it("skips empty rows", () => {
    const sample = buildProposerCorpusSample({
      insights: [{ insight_text: "   ", topics: [] }],
      meetings: [{ title: "" }],
      neighbors: [],
    });
    assert.deepEqual(sample, []);
  });
});

// ---------------------------------------------------------------------------
// proposeThemes (fail-closed orchestration)
// ---------------------------------------------------------------------------

describe("proposeThemes", () => {
  const sample = [{ source: "memory" as const, text: "pricing pressure keeps resurfacing" }];

  it("returns linted themes from a valid LLM response", async () => {
    const { llm, prompts } = stubLlm([
      { theme: "pricing pressure", terms: ["pricing", "tier review"] },
      { theme: "BAD THEME", terms: [] },
    ]);
    const result = await proposeThemes({ userId: "u1", corpusSample: sample, llm });
    assert.deepEqual(result.themes, [{ theme: "pricing_pressure", terms: ["pricing", "tier review"] }]);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /pricing pressure keeps resurfacing/);
  });

  it("folds semantic neighbors into the sample", async () => {
    const { llm, prompts } = stubLlm([]);
    await proposeThemes({
      userId: "u1",
      corpusSample: sample,
      semanticNeighbors: [{ table: "user_insights", id: "i1", source_ref: null, snippet: "deadline crunch neighbor", distance: 0.2 }],
      llm,
    });
    assert.match(prompts[0], /deadline crunch neighbor/);
  });

  it("fails closed to zero themes when the LLM throws", async () => {
    const result = await proposeThemes({
      userId: "u1",
      corpusSample: sample,
      llm: { generateJson: async () => { throw new Error("429 quota"); }, callsUsed: () => 1 },
    });
    assert.deepEqual(result.themes, []);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /theme proposer failed/);
    assert.match(result.warnings[0], /429 quota/);
  });

  it("fails closed to zero themes on a malformed response shape", async () => {
    const { llm } = stubLlm({ not: "an array" });
    const result = await proposeThemes({ userId: "u1", corpusSample: sample, llm });
    assert.deepEqual(result.themes, []);
  });

  it("skips the LLM call entirely on an empty corpus sample", async () => {
    const { llm, prompts } = stubLlm([]);
    const result = await proposeThemes({ userId: "u1", corpusSample: [], llm });
    assert.deepEqual(result.themes, []);
    assert.equal(prompts.length, 0);
    assert.match(result.warnings[0], /empty corpus sample/);
  });

  it("dedupes proposals against existing memory-topic themes", async () => {
    const { llm } = stubLlm([
      { theme: "pricing_monetization", terms: [] },
      { theme: "novel_theme", terms: [] },
    ]);
    const result = await proposeThemes({
      userId: "u1",
      corpusSample: sample,
      existingThemes: ["pricing_monetization"],
      llm,
    });
    assert.deepEqual(result.themes.map((t) => t.theme), ["novel_theme"]);
  });
});

// ---------------------------------------------------------------------------
// buildCorpusAxes origin plumbing — proposed themes join the SAME literal
// matching + gate chain as memory topics; origin is observability only.
// ---------------------------------------------------------------------------

describe("buildCorpusAxes with llm_proposed themes", () => {
  function scenario() {
    const targetDays = dayRange("2026-03-01", 6);
    const referenceDays = dayRange("2026-04-01", 6);
    const signatures = new Map<string, PatternSignature>();
    for (const d of targetDays) signatures.set(d, sig(d, "TENSION"));
    for (const d of referenceDays) signatures.set(d, sig(d, "BALANCED"));
    return { targetDays, referenceDays, signatures };
  }

  it("memory-topic axes default to origin memory_topic", () => {
    const { targetDays, signatures } = scenario();
    const axes = buildCorpusAxes({
      signatures,
      insights: targetDays.slice(0, 3).map((d) => ({ topics: ["pricing"], occurred_at_ts: ts(d) })),
      meetings: [],
      calendarEvents: [],
      timezoneOffsetHours: TZ,
    });
    assert.equal(axes.length, 1);
    assert.equal(axes[0].origin, "memory_topic");
  });

  it("proposed themes mint axes via literal whole-word matches on insight text — LLM text is never evidence", () => {
    const { targetDays, signatures } = scenario();
    const axes = buildCorpusAxes({
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
    assert.equal(axes.length, 1);
    const axis = axes[0];
    assert.equal(axis.theme, "deadline_crunch");
    assert.equal(axis.origin, "llm_proposed");
    assert.equal(axis.targetHits, 2);
    assert.deepEqual(axis.citedDays.map((d) => d.date), [targetDays[0], targetDays[1]]);
    // Cited days are literal insight rows -> the mint source stays "memory".
    assert.deepEqual(axis.citedDays[0].sources, ["memory"]);
  });

  it("stopword/short-token protection applies to proposed terms exactly as to memory themes", () => {
    const { targetDays, signatures } = scenario();
    const axes = buildCorpusAxes({
      signatures,
      insights: [{ topics: [], occurred_at_ts: ts(targetDays[0]), insight_text: "we shipped the deck for review" }],
      meetings: [],
      calendarEvents: [],
      timezoneOffsetHours: TZ,
      // "the" is a stopword and "it" is under the token-length floor — the
      // phrase itself is absent, so nothing can ride function words in.
      proposedThemes: [{ theme: "own_the_room", terms: ["it"] }],
    });
    assert.deepEqual(axes, []);
  });

  it("a proposed theme duplicating a memory topic never double-mints", () => {
    const { targetDays, signatures } = scenario();
    const axes = buildCorpusAxes({
      signatures,
      insights: targetDays.slice(0, 3).map((d) => ({ topics: ["pricing"], occurred_at_ts: ts(d), insight_text: "pricing talk" })),
      meetings: [],
      calendarEvents: [],
      timezoneOffsetHours: TZ,
      proposedThemes: [{ theme: "pricing", terms: ["pricing"] }],
    });
    assert.equal(axes.length, 1);
    assert.equal(axes[0].origin, "memory_topic", "memory minting wins; the duplicate proposal is ignored");
  });

  it("granola/calendar corroborate proposed-theme days under the identical never-mint rule", () => {
    const { targetDays, signatures } = scenario();
    const axes = buildCorpusAxes({
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
    assert.equal(axes.length, 1);
    assert.deepEqual(axes[0].citedDays, [{ date: targetDays[0], sources: ["granola", "memory"] }]);
  });

  it("an llm_proposed axis passes/fails the EnrichmentGate identically to a memory-topic axis with the same data", () => {
    const { targetDays, signatures } = scenario();
    const days = targetDays.slice(0, 3);
    const viaMemoryTopic = buildCorpusAxes({
      signatures,
      insights: days.map((d) => ({ topics: ["deadline_crunch"], occurred_at_ts: ts(d) })),
      meetings: days.map((d) => ({ title: "deadline crunch sync", summary: null, occurred_at_ts: ts(d) })),
      calendarEvents: [],
      timezoneOffsetHours: TZ,
    });
    const viaProposer = buildCorpusAxes({
      signatures,
      insights: days.map((d) => ({ topics: [], occurred_at_ts: ts(d), insight_text: "deadline crunch notes" })),
      meetings: days.map((d) => ({ title: "deadline crunch sync", summary: null, occurred_at_ts: ts(d) })),
      calendarEvents: [],
      timezoneOffsetHours: TZ,
      proposedThemes: [{ theme: "deadline_crunch", terms: ["deadline"] }],
    });
    assert.equal(viaMemoryTopic.length, 1);
    assert.equal(viaProposer.length, 1);
    const [memAxis] = viaMemoryTopic;
    const [llmAxis] = viaProposer;
    assert.equal(memAxis.origin, "memory_topic");
    assert.equal(llmAxis.origin, "llm_proposed");
    // Same numbers in -> same axis out (origin is the only difference).
    assert.deepEqual({ ...llmAxis, origin: undefined }, { ...memAxis, origin: undefined });
    // And the 7th gate treats them identically: verdicts byte-equal.
    const gateOf = (axis: typeof memAxis) => enrichmentGate({
      theme: axis.theme,
      targetHits: axis.targetHits,
      targetN: axis.targetN,
      referenceRate: axis.referenceRate,
      referenceN: axis.referenceN,
      citedDays: axis.citedDays.map((d) => ({ date: d.date, backed: true, sources: d.sources })),
      rtmSuspected: axis.rtmSuspected,
    });
    assert.deepEqual(gateOf(llmAxis), gateOf(memAxis));
  });
});

// ---------------------------------------------------------------------------
// run.ts hook: window/replay runs propose (injected LLM seam), fail-soft
// ---------------------------------------------------------------------------

function sqliteCliPresent(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function withSqliteStore(run: (dbPath: string) => Promise<void>): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "daobrew-proposer-"));
  const dbPath = join(tmpDir, "sentinel-graph.db");
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
    ensureSchema(dbPath);
    await run(dbPath);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("run.ts proposer hook (window/replay runs)", () => {
  it("replay run with an injected LLM proposes themes and reports the count; run proceeds", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    await withSqliteStore(async (dbPath) => {
      const nowSec = Math.floor(Date.now() / 1000);
      execFileSync("sqlite3", [dbPath, `
        INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
        VALUES ('mem-1', '${PROPOSER_TEST_USER}', 'claude_project_session', 's1', 'Deadline crunch dominated the week.', '["#deadline"]', 0.8, 1.0, ${nowSec - 86400}, NULL, ${nowSec - 86400});
      `]);
      const { llm, prompts } = stubLlm([{ theme: "deadline_crunch", terms: ["deadline"] }]);
      const result = await runEngineOnce({
        once: true,
        userId: PROPOSER_TEST_USER,
        startTs: nowSec - 30 * 86400,
        endTs: nowSec,
        proposerLlm: llm,
      });
      // No biometrics on this store -> no_signal, but the proposer already ran.
      assert.equal(result.status, "no_signal");
      assert.equal(result.proposed_theme_count, 1);
      assert.equal(prompts.length, 1);
      assert.match(prompts[0], /Deadline crunch dominated the week/);
      // v2 never activated -> surviving-axis count stays omitted (0 would be ambiguous).
      assert.equal(result.llm_proposed_axes_count, undefined);
    });
  });

  it("replay run without a Gemini key skips the proposer with a loud warning and zero proposals", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    await withSqliteStore(async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const result = await runEngineOnce({
        once: true,
        userId: PROPOSER_TEST_USER,
        startTs: nowSec - 30 * 86400,
        endTs: nowSec,
      });
      assert.equal(result.proposed_theme_count, undefined);
      assert.ok(result.warnings.some((w) => /theme proposer skipped: no Gemini key/.test(w)));
    });
  });

  it("live (non-window) runs never invoke the proposer", async () => {
    await withSqliteStore(async () => {
      const { llm, prompts } = stubLlm([{ theme: "x_theme", terms: [] }]);
      const result = await runEngineOnce({
        once: true,
        demo: true,
        userId: PROPOSER_TEST_USER,
        proposerLlm: llm,
      });
      assert.equal(prompts.length, 0);
      assert.equal(result.proposed_theme_count, undefined);
    });
  });

  it("a throwing LLM yields zero proposals and the run still completes", async (t) => {
    if (!sqliteCliPresent()) return t.skip("sqlite3 CLI not available");
    await withSqliteStore(async (dbPath) => {
      const nowSec = Math.floor(Date.now() / 1000);
      execFileSync("sqlite3", [dbPath, `
        INSERT INTO user_insights (id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts)
        VALUES ('mem-1', '${PROPOSER_TEST_USER}', 'claude_project_session', 's1', 'Some insight.', '[]', 0.8, 1.0, ${nowSec - 86400}, NULL, ${nowSec - 86400});
      `]);
      const result = await runEngineOnce({
        once: true,
        userId: PROPOSER_TEST_USER,
        startTs: nowSec - 30 * 86400,
        endTs: nowSec,
        proposerLlm: { generateJson: async () => { throw new Error("boom"); }, callsUsed: () => 1 },
      });
      assert.equal(result.status, "no_signal");
      assert.equal(result.proposed_theme_count, 0);
      assert.ok(result.warnings.some((w) => /theme proposer failed/.test(w)));
    });
  });
});
