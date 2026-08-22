"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const corpusAxes_js_1 = require("../src/engine/reasoner/corpusAxes.js");
const TZ = -7;
function sig(date, dominant, quality = "real_inference") {
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
        quality,
    };
}
/** Epoch seconds at local noon of the given date (TZ = -7). */
function ts(date) {
    return Math.floor(Date.parse(`${date}T12:00:00-07:00`) / 1000);
}
function insight(date, topics) {
    return { topics, occurred_at_ts: ts(date) };
}
function meeting(date, title) {
    return { title, summary: null, occurred_at_ts: ts(date) };
}
function dayRange(startIso, n) {
    const out = [];
    const start = Date.parse(`${startIso}T00:00:00Z`);
    for (let i = 0; i < n; i++) {
        out.push(new Date(start + i * 86400_000).toISOString().slice(0, 10));
    }
    return out;
}
(0, node_test_1.test)("reproduces the documented pricing control ratio (1.46x = 0.5/0.343)", () => {
    const targetDays = dayRange("2026-03-01", 6); // TENSION-dominant
    const referenceDays = dayRange("2026-04-01", 35); // BALANCED
    const signatures = new Map();
    for (const d of targetDays)
        signatures.set(d, sig(d, "TENSION"));
    for (const d of referenceDays)
        signatures.set(d, sig(d, "BALANCED"));
    const citedTargets = targetDays.slice(0, 3);
    const insights = [
        ...citedTargets.map((d) => insight(d, ["pricing_monetization"])),
        // 12 of 35 reference days carry the theme -> reference rate 12/35.
        ...referenceDays.slice(0, 12).map((d) => insight(d, ["pricing_monetization"])),
    ];
    // Granola corroboration on 2 of the 3 cited target days.
    const meetings = [
        meeting(citedTargets[0], "pricing sync"),
        meeting(citedTargets[1], "pricing sync"),
    ];
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings,
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.equal(axes.length, 1);
    const axis = axes[0];
    strict_1.default.equal(axis.theme, "pricing_monetization");
    strict_1.default.equal(axis.targetHits, 3);
    strict_1.default.equal(axis.targetN, 6);
    strict_1.default.equal(axis.referenceN, 35);
    strict_1.default.ok(Math.abs(axis.referenceRate - 12 / 35) < 1e-9);
    const ratio = axis.targetHits / axis.targetN / axis.referenceRate;
    strict_1.default.ok(Math.abs(ratio - 1.4583) < 0.01, `ratio was ${ratio}`);
    strict_1.default.deepEqual(axis.citedDays, [
        { date: citedTargets[0], sources: ["granola", "memory"] },
        { date: citedTargets[1], sources: ["granola", "memory"] },
        { date: citedTargets[2], sources: ["memory"] },
    ]);
    strict_1.default.equal(axis.rtmSuspected, true);
});
(0, node_test_1.test)("axes are sorted primary-first (highest ratio) and skip themes absent on target days", () => {
    const targetDays = dayRange("2026-03-01", 4);
    const referenceDays = dayRange("2026-04-01", 4);
    const signatures = new Map();
    for (const d of targetDays)
        signatures.set(d, sig(d, "TENSION"));
    for (const d of referenceDays)
        signatures.set(d, sig(d, "BALANCED"));
    const insights = [
        // Target-only theme: reference rate 0 -> ratio Infinity -> primary.
        insight(targetDays[0], ["alpha_only_target"]),
        insight(targetDays[1], ["alpha_only_target"]),
        // Present in both classes: finite ratio, ranked after.
        insight(targetDays[0], ["beta_both"]),
        insight(targetDays[1], ["beta_both"]),
        insight(referenceDays[0], ["beta_both"]),
        // Reference-only theme: 0 target hits -> dropped entirely.
        insight(referenceDays[1], ["gamma_ref_only"]),
        insight(referenceDays[2], ["gamma_ref_only"]),
    ];
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings: [],
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    const themes = axes.map((a) => a.theme);
    strict_1.default.equal(themes[0], "alpha_only_target");
    strict_1.default.ok(themes.includes("beta_both"));
    strict_1.default.ok(!themes.includes("gamma_ref_only"));
});
(0, node_test_1.test)("non-real_inference and unworn days are excluded from both classes", () => {
    const signatures = new Map();
    const realTargets = ["2026-03-01", "2026-03-02"];
    for (const d of realTargets)
        signatures.set(d, sig(d, "TENSION"));
    // Target-pattern day without real biometric backing: must not count.
    signatures.set("2026-03-03", sig("2026-03-03", "TENSION", "sparse_data"));
    signatures.set("2026-04-01", sig("2026-04-01", "BALANCED"));
    signatures.set("2026-04-02", sig("2026-04-02", "BALANCED"));
    const insights = [
        insight("2026-03-01", ["pricing_monetization"]),
        insight("2026-03-02", ["pricing_monetization"]),
        insight("2026-03-03", ["pricing_monetization"]),
        insight("2026-04-01", ["pricing_monetization"]),
    ];
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings: [],
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.equal(axes.length, 1);
    const axis = axes[0];
    strict_1.default.equal(axis.targetN, 2);
    strict_1.default.equal(axis.targetHits, 2);
    strict_1.default.equal(axis.referenceN, 2);
    strict_1.default.deepEqual(axis.citedDays.map((d) => d.date), realTargets);
});
(0, node_test_1.test)("corroborating sources cannot mint cited days (review C1)", () => {
    const targetDays = dayRange("2026-03-01", 3);
    const signatures = new Map();
    for (const d of targetDays)
        signatures.set(d, sig(d, "TENSION"));
    signatures.set("2026-04-01", sig("2026-04-01", "BALANCED"));
    signatures.set("2026-04-02", sig("2026-04-02", "BALANCED"));
    // Memory cites the theme on day 1 only. The matching meeting on day 2
    // must NOT create a cited day or inflate targetHits.
    const insights = [insight(targetDays[0], ["pricing_monetization"])];
    const meetings = [
        meeting(targetDays[0], "pricing sync"),
        meeting(targetDays[1], "pricing sync"),
    ];
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings,
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.equal(axes.length, 1);
    const axis = axes[0];
    strict_1.default.equal(axis.targetHits, 1);
    strict_1.default.deepEqual(axis.citedDays, [
        { date: targetDays[0], sources: ["granola", "memory"] },
    ]);
});
(0, node_test_1.test)("theme matching requires whole words and skips stopword tokens (review C2)", () => {
    const signatures = new Map();
    signatures.set("2026-03-01", sig("2026-03-01", "TENSION"));
    signatures.set("2026-04-01", sig("2026-04-01", "BALANCED"));
    const insights = [insight("2026-03-01", ["ship_the_deck"])];
    const meetings = [
        // "the" is a stopword and only a substring of these words — none of
        // these may corroborate ship_the_deck.
        meeting("2026-03-01", "weekly themes review"),
        meeting("2026-03-01", "lunch with theo"),
        meeting("2026-03-01", "gather materials"),
        meeting("2026-03-01", "dentist appointment - other"),
        // "deck" as a whole word DOES corroborate.
        meeting("2026-03-01", "deck review"),
    ];
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings,
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.equal(axes.length, 1);
    strict_1.default.deepEqual(axes[0].citedDays, [
        { date: "2026-03-01", sources: ["granola", "memory"] },
    ]);
    // Without the legitimate "deck review" meeting: no granola at all.
    const axesNoDeck = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights,
        meetings: meetings.slice(0, 4),
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.deepEqual(axesNoDeck[0].citedDays, [
        { date: "2026-03-01", sources: ["memory"] },
    ]);
});
(0, node_test_1.test)("empty-string topics mint nothing", () => {
    const signatures = new Map();
    signatures.set("2026-03-01", sig("2026-03-01", "TENSION"));
    signatures.set("2026-04-01", sig("2026-04-01", "BALANCED"));
    const axes = (0, corpusAxes_js_1.buildCorpusAxes)({
        signatures,
        insights: [insight("2026-03-01", [""]), insight("2026-03-01", ["  "])],
        meetings: [meeting("2026-03-01", "any meeting at all")],
        calendarEvents: [],
        timezoneOffsetHours: TZ,
    });
    strict_1.default.equal(axes.length, 0);
});
