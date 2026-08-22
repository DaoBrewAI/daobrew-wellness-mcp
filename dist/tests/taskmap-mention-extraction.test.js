"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const mention_extraction_js_1 = require("../src/engine/taskmap/mention-extraction.js");
const text_contract_js_1 = require("../src/engine/taskmap/text-contract.js");
const SOURCE = [
    "I will send the launch brief today.",
    "Linh, please approve the launch brief.",
    "We decided to use the local agent.",
    "The weather was pleasant.",
].join("\n");
function mention(overrides = {}) {
    return {
        text: "I will send the launch brief today.",
        title: "Send the launch brief",
        class: "commitment",
        actor: "self",
        confidence: 0.92,
        ...overrides,
    };
}
function output(mentions) {
    return JSON.stringify({ mentions });
}
function expectFailure(action, reason) {
    let caught;
    try {
        action();
    }
    catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof mention_extraction_js_1.MentionExtractionValidationError);
    assert.equal(caught.reason, reason);
    assert.match(caught.message, /^Task Map mention extraction rejected: [a-z_]+$/);
    assert.doesNotMatch(caught.message, /launch brief|weather|private/i);
    return caught;
}
(0, node_test_1.describe)("Task Map mention extraction contract", () => {
    (0, node_test_1.it)("strictly parses all four classes and preserves verbatim spans and real confidence", () => {
        const parsed = (0, mention_extraction_js_1.validateMentionExtraction)(output([
            mention(),
            mention({
                text: "Linh, please approve the launch brief.",
                title: "Approve the launch brief",
                class: "request",
                actor: "self",
                confidence: 1,
            }),
            mention({
                text: "We decided to use the local agent.",
                title: "Use the local agent",
                class: "decision",
                actor: "other",
                confidence: 0,
            }),
            mention({
                text: "The weather was pleasant.",
                title: "Review the meeting context",
                class: "other",
                actor: "unknown",
                confidence: 0.34,
            }),
        ]), SOURCE);
        assert.deepEqual(parsed, {
            mentions: [
                mention(),
                mention({
                    text: "Linh, please approve the launch brief.",
                    title: "Approve the launch brief",
                    class: "request",
                    actor: "self",
                    confidence: 1,
                }),
                mention({
                    text: "We decided to use the local agent.",
                    title: "Use the local agent",
                    class: "decision",
                    actor: "other",
                    confidence: 0,
                }),
                mention({
                    text: "The weather was pleasant.",
                    title: "Review the meeting context",
                    class: "other",
                    actor: "unknown",
                    confidence: 0.34,
                }),
            ],
        });
    });
    (0, node_test_1.it)("rejects missing, extra, and wrong-type top-level fields", () => {
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)("{}", SOURCE), "invalid_top_level");
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(JSON.stringify({ mentions: [], note: "private" }), SOURCE), "invalid_top_level");
        for (const malformed of [null, [], { mentions: null }, { mentions: {} }, { mentions: "[]" }]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(JSON.stringify(malformed), SOURCE), "invalid_top_level");
        }
    });
    (0, node_test_1.it)("rejects duplicate decoded member names before JSON.parse can overwrite them", () => {
        const duplicateTopLevel = '{"mentions":[],"mentions":[]}';
        const escapedDuplicateTopLevel = String.raw `{"mentions":[],"mentio\u006es":[]}`;
        const duplicateMention = '{"mentions":[{"text":"The weather was pleasant.","text":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":0.5}]}';
        const escapedDuplicateMention = String.raw `{"mentions":[{"text":"The weather was pleasant.","te\u0078t":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":0.5}]}`;
        for (const json of [
            duplicateTopLevel,
            escapedDuplicateTopLevel,
            duplicateMention,
            escapedDuplicateMention,
        ]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(json, SOURCE), "invalid_json");
        }
        assert.deepEqual((0, mention_extraction_js_1.validateMentionExtraction)(String.raw `{"mentio\u006es":[]}`, SOURCE), { mentions: [] });
        const jsonLookingSpan = 'Quoted {"text":"x","text":"y"} stays content.';
        assert.equal((0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: jsonLookingSpan })]), jsonLookingSpan).mentions[0]?.text, jsonLookingSpan);
    });
    (0, node_test_1.it)("rejects mention objects with extra, missing, or wrong-type fields", () => {
        const requiredKeys = ["text", "title", "class", "actor", "confidence"];
        for (const key of requiredKeys) {
            const missing = mention();
            delete missing[key];
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([missing]), SOURCE), "invalid_mention");
        }
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ deadline: "tomorrow" })]), SOURCE), "invalid_mention");
        for (const [key, value] of [
            ["text", 7],
            ["title", false],
            ["class", null],
            ["actor", []],
            ["confidence", "0.8"],
        ]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ [key]: value })]), SOURCE), "invalid_mention");
        }
    });
    (0, node_test_1.it)("accepts only the four-class and three-actor enums", () => {
        for (const speechAct of ["promise", "action_item", "question", ""]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ class: speechAct })]), SOURCE), "invalid_class");
        }
        for (const actor of ["owner", "team", "both", ""]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ actor })]), SOURCE), "invalid_actor");
        }
    });
    (0, node_test_1.it)("requires exact, non-empty verbatim source spans without an invented length cap", () => {
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({
                text: "i will send the launch brief today.",
            })]), SOURCE), "invalid_span");
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: "" })]), SOURCE), "invalid_span");
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: "   " })]), "prefix    suffix"), "invalid_span");
        const longExactSpan = "x".repeat(201);
        assert.equal((0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: longExactSpan })]), longExactSpan).mentions[0]?.text, longExactSpan);
        const visuallyBlankSpan = "\u200b";
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: visuallyBlankSpan })]), visuallyBlankSpan), "invalid_span");
    });
    (0, node_test_1.it)("does not impose a validator output ceiling on an exact span over one MiB", () => {
        const exactSpan = "x".repeat(1_048_577);
        const parsed = (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: exactSpan })]), exactSpan);
        assert.equal(parsed.mentions[0]?.text, exactSpan);
    });
    (0, node_test_1.it)("rejects an exact span containing only a Unicode control scalar", () => {
        const nulOnlySpan = "\u0000";
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ text: nulOnlySpan })]), nulOnlySpan), "invalid_span");
    });
    (0, node_test_1.it)("requires a bounded non-empty imperative title field", () => {
        for (const title of ["", "   ", "Approve it?", "Line one\nLine two"]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ title })]), SOURCE), "invalid_title");
        }
        const tooLong = "做".repeat(mention_extraction_js_1.MENTION_EXTRACTION_LIMITS.maxTitleCharacters + 1);
        const bounded = (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ title: tooLong })]), SOURCE).mentions[0]?.title;
        assert.equal(bounded?.length, mention_extraction_js_1.MENTION_EXTRACTION_LIMITS.maxTitleCharacters);
        assert.equal(bounded?.endsWith("…"), true);
        assert.equal(mention_extraction_js_1.MENTION_EXTRACTION_LIMITS.maxTitleCharacters, 80);
    });
    (0, node_test_1.it)("normalizes lone surrogates and bounds astral titles by UTF-16 units", () => {
        const loneHighSurrogate = String.fromCharCode(0xd83d);
        const source = `Ship ${loneHighSurrogate} safely`;
        const parsed = (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({
                text: source,
                title: `${"😀".repeat(50)}${loneHighSurrogate}`,
            })]), source).mentions[0];
        assert.equal(parsed?.text, "Ship � safely");
        assert.ok((parsed?.title.length ?? 0) <= mention_extraction_js_1.MENTION_EXTRACTION_LIMITS.maxTitleCharacters);
        assert.equal((0, text_contract_js_1.toWellFormedText)(parsed?.title ?? ""), parsed?.title);
        assert.equal(parsed?.title.endsWith("…"), true);
    });
    (0, node_test_1.it)("rejects format or default-ignorable-only titles", () => {
        for (const title of [
            "\u200b",
            "\ufe0e",
            "\ufe0f",
            "\u{e0100}",
            "\u034f",
            "\u180b",
        ]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ title })]), SOURCE), "invalid_title");
        }
    });
    (0, node_test_1.it)("rejects every Unicode Cc scalar anywhere in a title", () => {
        const unicodeControlCharacters = [
            ...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCodePoint(codePoint)),
            ...Array.from({ length: 0x21 }, (_, offset) => String.fromCodePoint(0x7f + offset)),
        ];
        for (const control of unicodeControlCharacters) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ title: `Review ${control}context` })]), SOURCE), "invalid_title");
        }
    });
    (0, node_test_1.it)("allows legitimate non-bidi format controls inside meaningful emoji and Indic text", () => {
        const legitimateZwjText = "Review ✈️, 👩‍💻, and क्‍ष output.";
        const parsed = (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({
                text: legitimateZwjText,
                title: "Review ✈️, 👩‍💻, and क्‍ष output",
            })]), legitimateZwjText);
        assert.equal(parsed.mentions[0]?.text, legitimateZwjText);
        assert.equal(parsed.mentions[0]?.title, "Review ✈️, 👩‍💻, and क्‍ष output");
    });
    (0, node_test_1.it)("rejects the complete Unicode bidi-control set in titles", () => {
        const bidiControls = [
            "\u061c",
            "\u200e",
            "\u200f",
            "\u202a",
            "\u202b",
            "\u202c",
            "\u202d",
            "\u202e",
            "\u2066",
            "\u2067",
            "\u2068",
            "\u2069",
        ];
        for (const bidiControl of bidiControls) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ title: `Review ${bidiControl}context` })]), SOURCE), "invalid_title");
        }
    });
    (0, node_test_1.it)("rejects non-finite and out-of-range confidence without clamping", () => {
        for (const confidence of [-Number.EPSILON, 1 + Number.EPSILON]) {
            expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output([mention({ confidence })]), SOURCE), "invalid_confidence");
        }
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)('{"mentions":[{"text":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":1e309}]}', SOURCE), "invalid_confidence");
    });
    (0, node_test_1.it)("validates every entry before deterministically truncating to the first 20", () => {
        const sourceText = Array.from({ length: 22 }, (_, index) => `Item ${index}.`).join("\n");
        const mentions = Array.from({ length: 22 }, (_, index) => mention({
            text: `Item ${index}.`,
            title: `Handle item ${index}`,
            confidence: index / 22,
        }));
        const parsed = (0, mention_extraction_js_1.validateMentionExtraction)(output(mentions), sourceText);
        assert.equal(parsed.mentions.length, mention_extraction_js_1.MENTION_EXTRACTION_LIMITS.maxMentions);
        assert.deepEqual(parsed.mentions.map((entry) => entry.text), Array.from({ length: 20 }, (_, index) => `Item ${index}.`));
        mentions[21] = mention({ text: "hallucinated" });
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)(output(mentions), sourceText), "invalid_span");
    });
    (0, node_test_1.it)("rejects garbage JSON with a typed privacy-safe reason", () => {
        expectFailure(() => (0, mention_extraction_js_1.validateMentionExtraction)("the private output was not JSON", SOURCE), "invalid_json");
    });
    (0, node_test_1.it)("ships a one-note prompt that fixes the trust, taxonomy, actor, span, and deadline rules", async () => {
        const promptPath = node_path_1.default.resolve(process.cwd(), "prompts/mention-extraction-v1.md");
        const prompt = await (0, promises_1.readFile)(promptPath, "utf8");
        assert.match(prompt, /exactly ONE meeting note/);
        assert.match(prompt, /untrusted data/i);
        assert.match(prompt, /never.*instructions/i);
        assert.match(prompt, /JSON only/i);
        assert.match(prompt, /request.*commitment.*decision.*other/s);
        assert.match(prompt, /verbatim/i);
        assert.match(prompt, /commitment.*committing party/is);
        assert.match(prompt, /request.*requested party|request.*addressee/is);
        assert.match(prompt, /self.*confirmed owner/is);
        assert.match(prompt, /ambiguous.*other.*unknown/is);
        assert.match(prompt, /do not invent.*deadline/i);
        assert.match(prompt, /imperative/i);
        assert.match(prompt, /80/);
        assert.match(prompt, /byte-for-byte/i);
        assert.match(prompt, /do not correct/i);
        assert.match(prompt, /\*\*/);
    });
});
