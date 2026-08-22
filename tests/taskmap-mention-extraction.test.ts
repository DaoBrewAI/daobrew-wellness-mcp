import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MENTION_EXTRACTION_LIMITS,
  MentionExtractionValidationError,
  validateMentionExtraction,
  type MentionExtractionFailureReason,
} from "../src/engine/taskmap/mention-extraction.js";
import { toWellFormedText } from "../src/engine/taskmap/text-contract.js";

const SOURCE = [
  "I will send the launch brief today.",
  "Linh, please approve the launch brief.",
  "We decided to use the local agent.",
  "The weather was pleasant.",
].join("\n");

function mention(overrides: Record<string, unknown> = {}) {
  return {
    text: "I will send the launch brief today.",
    title: "Send the launch brief",
    class: "commitment",
    actor: "self",
    confidence: 0.92,
    ...overrides,
  };
}

function output(mentions: readonly unknown[]): string {
  return JSON.stringify({ mentions });
}

function expectFailure(
  action: () => unknown,
  reason: MentionExtractionFailureReason,
): MentionExtractionValidationError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof MentionExtractionValidationError);
  assert.equal(caught.reason, reason);
  assert.match(caught.message, /^Task Map mention extraction rejected: [a-z_]+$/);
  assert.doesNotMatch(caught.message, /launch brief|weather|private/i);
  return caught;
}

describe("Task Map mention extraction contract", () => {
  it("strictly parses all four classes and preserves verbatim spans and real confidence", () => {
    const parsed = validateMentionExtraction(output([
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

  it("rejects missing, extra, and wrong-type top-level fields", () => {
    expectFailure(() => validateMentionExtraction("{}", SOURCE), "invalid_top_level");
    expectFailure(
      () => validateMentionExtraction(JSON.stringify({ mentions: [], note: "private" }), SOURCE),
      "invalid_top_level",
    );
    for (const malformed of [null, [], { mentions: null }, { mentions: {} }, { mentions: "[]" }]) {
      expectFailure(
        () => validateMentionExtraction(JSON.stringify(malformed), SOURCE),
        "invalid_top_level",
      );
    }
  });

  it("rejects duplicate decoded member names before JSON.parse can overwrite them", () => {
    const duplicateTopLevel = '{"mentions":[],"mentions":[]}';
    const escapedDuplicateTopLevel =
      String.raw`{"mentions":[],"mentio\u006es":[]}`;
    const duplicateMention =
      '{"mentions":[{"text":"The weather was pleasant.","text":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":0.5}]}';
    const escapedDuplicateMention =
      String.raw`{"mentions":[{"text":"The weather was pleasant.","te\u0078t":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":0.5}]}`;

    for (const json of [
      duplicateTopLevel,
      escapedDuplicateTopLevel,
      duplicateMention,
      escapedDuplicateMention,
    ]) {
      expectFailure(
        () => validateMentionExtraction(json, SOURCE),
        "invalid_json",
      );
    }

    assert.deepEqual(
      validateMentionExtraction(String.raw`{"mentio\u006es":[]}`, SOURCE),
      { mentions: [] },
    );
    const jsonLookingSpan = 'Quoted {"text":"x","text":"y"} stays content.';
    assert.equal(
      validateMentionExtraction(
        output([mention({ text: jsonLookingSpan })]),
        jsonLookingSpan,
      ).mentions[0]?.text,
      jsonLookingSpan,
    );
  });

  it("rejects mention objects with extra, missing, or wrong-type fields", () => {
    const requiredKeys = ["text", "title", "class", "actor", "confidence"] as const;
    for (const key of requiredKeys) {
      const missing = mention();
      delete missing[key];
      expectFailure(
        () => validateMentionExtraction(output([missing]), SOURCE),
        "invalid_mention",
      );
    }

    expectFailure(
      () => validateMentionExtraction(output([mention({ deadline: "tomorrow" })]), SOURCE),
      "invalid_mention",
    );

    for (const [key, value] of [
      ["text", 7],
      ["title", false],
      ["class", null],
      ["actor", []],
      ["confidence", "0.8"],
    ] as const) {
      expectFailure(
        () => validateMentionExtraction(output([mention({ [key]: value })]), SOURCE),
        "invalid_mention",
      );
    }
  });

  it("accepts only the four-class and three-actor enums", () => {
    for (const speechAct of ["promise", "action_item", "question", ""] as const) {
      expectFailure(
        () => validateMentionExtraction(output([mention({ class: speechAct })]), SOURCE),
        "invalid_class",
      );
    }
    for (const actor of ["owner", "team", "both", ""] as const) {
      expectFailure(
        () => validateMentionExtraction(output([mention({ actor })]), SOURCE),
        "invalid_actor",
      );
    }
  });

  it("requires exact, non-empty verbatim source spans without an invented length cap", () => {
    expectFailure(
      () => validateMentionExtraction(output([mention({
        text: "i will send the launch brief today.",
      })]), SOURCE),
      "invalid_span",
    );
    expectFailure(
      () => validateMentionExtraction(output([mention({ text: "" })]), SOURCE),
      "invalid_span",
    );
    expectFailure(
      () => validateMentionExtraction(output([mention({ text: "   " })]), "prefix    suffix"),
      "invalid_span",
    );

    const longExactSpan = "x".repeat(201);
    assert.equal(
      validateMentionExtraction(
        output([mention({ text: longExactSpan })]),
        longExactSpan,
      ).mentions[0]?.text,
      longExactSpan,
    );

    const visuallyBlankSpan = "\u200b";
    expectFailure(
      () => validateMentionExtraction(
        output([mention({ text: visuallyBlankSpan })]),
        visuallyBlankSpan,
      ),
      "invalid_span",
    );
  });

  it("does not impose a validator output ceiling on an exact span over one MiB", () => {
    const exactSpan = "x".repeat(1_048_577);
    const parsed = validateMentionExtraction(
      output([mention({ text: exactSpan })]),
      exactSpan,
    );

    assert.equal(parsed.mentions[0]?.text, exactSpan);
  });

  it("rejects an exact span containing only a Unicode control scalar", () => {
    const nulOnlySpan = "\u0000";
    expectFailure(
      () => validateMentionExtraction(
        output([mention({ text: nulOnlySpan })]),
        nulOnlySpan,
      ),
      "invalid_span",
    );
  });

  it("requires a bounded non-empty imperative title field", () => {
    for (const title of ["", "   ", "Approve it?", "Line one\nLine two"] as const) {
      expectFailure(
        () => validateMentionExtraction(output([mention({ title })]), SOURCE),
        "invalid_title",
      );
    }
    const tooLong = "做".repeat(MENTION_EXTRACTION_LIMITS.maxTitleCharacters + 1);
    const bounded = validateMentionExtraction(
      output([mention({ title: tooLong })]),
      SOURCE,
    ).mentions[0]?.title;
    assert.equal(bounded?.length, MENTION_EXTRACTION_LIMITS.maxTitleCharacters);
    assert.equal(bounded?.endsWith("…"), true);
    assert.equal(MENTION_EXTRACTION_LIMITS.maxTitleCharacters, 80);
  });

  it("normalizes lone surrogates and bounds astral titles by UTF-16 units", () => {
    const loneHighSurrogate = String.fromCharCode(0xd83d);
    const source = `Ship ${loneHighSurrogate} safely`;
    const parsed = validateMentionExtraction(
      output([mention({
        text: source,
        title: `${"😀".repeat(50)}${loneHighSurrogate}`,
      })]),
      source,
    ).mentions[0];

    assert.equal(parsed?.text, "Ship � safely");
    assert.ok((parsed?.title.length ?? 0) <= MENTION_EXTRACTION_LIMITS.maxTitleCharacters);
    assert.equal(toWellFormedText(parsed?.title ?? ""), parsed?.title);
    assert.equal(parsed?.title.endsWith("…"), true);
  });

  it("rejects format or default-ignorable-only titles", () => {
    for (const title of [
      "\u200b",
      "\ufe0e",
      "\ufe0f",
      "\u{e0100}",
      "\u034f",
      "\u180b",
    ]) {
      expectFailure(
        () => validateMentionExtraction(
          output([mention({ title })]),
          SOURCE,
        ),
        "invalid_title",
      );
    }
  });

  it("rejects every Unicode Cc scalar anywhere in a title", () => {
    const unicodeControlCharacters = [
      ...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCodePoint(codePoint)),
      ...Array.from(
        { length: 0x21 },
        (_, offset) => String.fromCodePoint(0x7f + offset),
      ),
    ];
    for (const control of unicodeControlCharacters) {
      expectFailure(
        () => validateMentionExtraction(
          output([mention({ title: `Review ${control}context` })]),
          SOURCE,
        ),
        "invalid_title",
      );
    }
  });

  it("allows legitimate non-bidi format controls inside meaningful emoji and Indic text", () => {
    const legitimateZwjText = "Review ✈️, 👩‍💻, and क्‍ष output.";
    const parsed = validateMentionExtraction(
      output([mention({
        text: legitimateZwjText,
        title: "Review ✈️, 👩‍💻, and क्‍ष output",
      })]),
      legitimateZwjText,
    );

    assert.equal(parsed.mentions[0]?.text, legitimateZwjText);
    assert.equal(parsed.mentions[0]?.title, "Review ✈️, 👩‍💻, and क्‍ष output");
  });

  it("rejects the complete Unicode bidi-control set in titles", () => {
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
      expectFailure(
        () => validateMentionExtraction(
          output([mention({ title: `Review ${bidiControl}context` })]),
          SOURCE,
        ),
        "invalid_title",
      );
    }
  });

  it("rejects non-finite and out-of-range confidence without clamping", () => {
    for (const confidence of [-Number.EPSILON, 1 + Number.EPSILON]) {
      expectFailure(
        () => validateMentionExtraction(output([mention({ confidence })]), SOURCE),
        "invalid_confidence",
      );
    }
    expectFailure(
      () => validateMentionExtraction(
        '{"mentions":[{"text":"The weather was pleasant.","title":"Review context","class":"other","actor":"unknown","confidence":1e309}]}',
        SOURCE,
      ),
      "invalid_confidence",
    );
  });

  it("validates every entry before deterministically truncating to the first 20", () => {
    const sourceText = Array.from({ length: 22 }, (_, index) => `Item ${index}.`).join("\n");
    const mentions = Array.from({ length: 22 }, (_, index) => mention({
      text: `Item ${index}.`,
      title: `Handle item ${index}`,
      confidence: index / 22,
    }));

    const parsed = validateMentionExtraction(output(mentions), sourceText);
    assert.equal(parsed.mentions.length, MENTION_EXTRACTION_LIMITS.maxMentions);
    assert.deepEqual(
      parsed.mentions.map((entry) => entry.text),
      Array.from({ length: 20 }, (_, index) => `Item ${index}.`),
    );

    mentions[21] = mention({ text: "hallucinated" });
    expectFailure(
      () => validateMentionExtraction(output(mentions), sourceText),
      "invalid_span",
    );
  });

  it("rejects garbage JSON with a typed privacy-safe reason", () => {
    expectFailure(
      () => validateMentionExtraction("the private output was not JSON", SOURCE),
      "invalid_json",
    );
  });

  it("ships a one-note prompt that fixes the trust, taxonomy, actor, span, and deadline rules", async () => {
    const promptPath = path.resolve(process.cwd(), "prompts/mention-extraction-v1.md");
    const prompt = await readFile(promptPath, "utf8");

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
