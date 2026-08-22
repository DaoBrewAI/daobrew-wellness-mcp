import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildMeetingEvidenceDrafts,
  TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN,
} from "../src/engine/taskmap/meeting-draft-builder.js";
import {
  buildTaskMapMeetingProducerSnapshot,
  TASKMAP_MEETING_PRODUCER_VERSION,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import type {
  LlmStationEnvelope,
} from "../src/engine/taskmap/llm-station.js";

const OCCURRED_AT = "2026-07-29T09:00:00.000Z";
const OBSERVED_AT = "2026-07-29T11:00:00.000Z";
const PRODUCED_AT = "2026-07-29T12:00:00.000Z";

function extractionOutput(mentions: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ mentions });
}

function envelope(
  sourceText: string,
  mentions: readonly Record<string, unknown>[],
  overrides: Partial<LlmStationEnvelope> = {},
): LlmStationEnvelope {
  return {
    stationId: "mention-extraction-v1",
    model: "test-model-private",
    promptDigest: taskMapContractDigest("prompt-v1"),
    inputDigest: taskMapContractDigest(sourceText),
    outputJson: extractionOutput(mentions),
    producedAt: PRODUCED_AT,
    transport: "claude-cli",
    ...overrides,
  };
}

function note(sourceText: string) {
  return {
    sourceText,
    occurredAt: OCCURRED_AT,
    observedAt: OBSERVED_AT,
  };
}

describe("Task Map meeting draft builder", () => {
  it("maps all four speech acts in extraction order with exact confidence and provenance", () => {
    const sourceText = [
      "Please ship the launch brief.",
      "I will send the launch brief.",
      "We decided to use the local agent.",
      "The weather was pleasant.",
    ].join("\n");
    const mentions = [
      {
        text: "Please ship the launch brief.",
        title: "Ship the launch brief",
        class: "request",
        actor: "self",
        confidence: 0.91,
      },
      {
        text: "I will send the launch brief.",
        title: "Send the launch brief",
        class: "commitment",
        actor: "other",
        confidence: 0.82,
      },
      {
        text: "We decided to use the local agent.",
        title: "Use the local agent",
        class: "decision",
        actor: "unknown",
        confidence: 0.73,
      },
      {
        text: "The weather was pleasant.",
        title: "Review the meeting context",
        class: "other",
        actor: "unknown",
        confidence: 0.34,
      },
    ];
    const extractionEnvelope = envelope(sourceText, mentions);

    const drafts = buildMeetingEvidenceDrafts(
      note(sourceText),
      extractionEnvelope,
    );

    assert.deepEqual(drafts.map((draft) => draft.kind), [
      "action_item",
      "commitment",
      "decision",
      "action_item",
    ]);
    assert.deepEqual(drafts.map((draft) => ({
      title: draft.title,
      summary: draft.summary,
      occurredAt: draft.occurredAt,
      observedAt: draft.observedAt,
      speechActClass: draft.speechActClass,
      speechActActor: draft.speechActActor,
      confidence: draft.confidence,
      quality: draft.quality,
      coverage: draft.coverage,
    })), mentions.map((mention) => ({
      title: mention.title,
      summary: mention.text,
      occurredAt: OCCURRED_AT,
      observedAt: OBSERVED_AT,
      speechActClass: mention.class,
      speechActActor: mention.actor,
      confidence: mention.confidence,
      quality: "structured_generated",
      coverage: "partial",
    })));
    assert.ok(drafts.every((draft) =>
      draft.extractionEnvelopeDigest === taskMapContractDigest(extractionEnvelope)
      && /^[a-f0-9]{64}$/.test(draft.mentionIdentityDigest ?? "")
      && draft.objectRefs === undefined
    ));
  });

  it("normalizes only the new mention identity and remains deterministic", () => {
    const sourceText = "Ship  the DMG!\nship the dmg\nShip another DMG.";
    const mentions = [
      { text: "Ship  the DMG!", title: "Ship the DMG", class: "request", actor: "self", confidence: 0.7 },
      { text: "ship the dmg", title: "Ship the DMG again", class: "other", actor: "unknown", confidence: 0.6 },
      { text: "Ship another DMG.", title: "Ship another DMG", class: "commitment", actor: "self", confidence: 0.9 },
    ];
    const inputEnvelope = envelope(sourceText, mentions);
    const first = buildMeetingEvidenceDrafts(note(sourceText), inputEnvelope);
    const second = buildMeetingEvidenceDrafts(note(sourceText), inputEnvelope);

    assert.deepEqual(first, second);
    assert.equal(first[0].mentionIdentityDigest, first[1].mentionIdentityDigest);
    assert.notEqual(first[0].mentionIdentityDigest, first[2].mentionIdentityDigest);
    assert.equal(
      first[0].mentionIdentityDigest,
      taskMapContractDigest({
        domain: TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN,
        normalizedText: "ship the dmg",
      }),
    );
  });

  it("binds the exact note input and the complete extraction envelope", () => {
    const sourceText = "I will ship the brief.";
    const mentions = [{
      text: sourceText,
      title: "Ship the brief",
      class: "commitment",
      actor: "self",
      confidence: 0.88,
    }];
    const firstEnvelope = envelope(sourceText, mentions);
    const rotatedEnvelope = envelope(sourceText, mentions, {
      producedAt: "2026-07-29T12:00:01.000Z",
    });
    const first = buildMeetingEvidenceDrafts(note(sourceText), firstEnvelope)[0];
    const rotated = buildMeetingEvidenceDrafts(note(sourceText), rotatedEnvelope)[0];
    assert.equal(
      first.extractionEnvelopeDigest,
      taskMapContractDigest(firstEnvelope),
    );
    assert.equal(
      rotated.extractionEnvelopeDigest,
      taskMapContractDigest(rotatedEnvelope),
    );
    assert.notEqual(first.extractionEnvelopeDigest, rotated.extractionEnvelopeDigest);

    assert.throws(
      () => buildMeetingEvidenceDrafts(note(sourceText), {
        ...firstEnvelope,
        inputDigest: taskMapContractDigest("different exact note"),
      }),
      /input digest/i,
    );
  });

  it("rejects a verbatim span whose normalized mention identity is empty", () => {
    const sourceText = ".";
    assert.throws(
      () => buildMeetingEvidenceDrafts(note(sourceText), envelope(sourceText, [{
        text: sourceText,
        title: "Review the meeting context",
        class: "other",
        actor: "unknown",
        confidence: 0.1,
      }])),
      /normalized mention identity is empty/i,
    );
  });

  it("persists a deterministic 200-unit summary without raw tails or envelope payloads", () => {
    const rawTail = "RAW-PRIVATE-TAIL";
    const sourceText = `${"🙂".repeat(205)}${rawTail}`;
    const inputEnvelope = envelope(sourceText, [{
      text: sourceText,
      title: "Review the bounded long mention",
      class: "other",
      actor: "unknown",
      confidence: 0.4,
    }]);
    const draft = buildMeetingEvidenceDrafts(note(sourceText), inputEnvelope)[0];
    const serialized = JSON.stringify(draft);

    assert.ok(draft.summary.length <= 200);
    assert.equal(draft.summary.endsWith("…"), true);
    assert.equal(draft.summary.includes(rawTail), false);
    for (const forbidden of [
      rawTail,
      "sourceText",
      "outputJson",
      "test-model-private",
      "claude-cli",
      "deadline",
      PRODUCED_AT,
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  });

  it("preserves all 20 validated mentions through one producer variant", () => {
    const spans = Array.from({ length: 20 }, (_, index) =>
      `Please complete bounded item ${index}.`
    );
    const sourceText = spans.join("\n");
    const drafts = buildMeetingEvidenceDrafts(note(sourceText), envelope(
      sourceText,
      spans.map((text, index) => ({
        text,
        title: `Complete bounded item ${index}`,
        class: "request",
        actor: "self",
        confidence: 0.75,
      })),
    ));
    const snapshot = buildTaskMapMeetingProducerSnapshot({
      ownerScopeDigest: taskMapContractDigest("task4-owner"),
      producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
      producedAt: PRODUCED_AT,
      meetings: [{
        binding: {
          connectionId: "gemini-owner",
          sourceKind: "gemini_meet",
          tenantOrWorkspaceDigest: taskMapContractDigest("workspace"),
          accountOrPrincipalDigest: taskMapContractDigest("principal"),
          grantVersion: "grant-1",
        },
        documentId: "bounded-note",
        revisionId: "revision-1",
        contentDigest: taskMapContractDigest("bounded-content"),
        modifiedAt: OBSERVED_AT,
        eventTime: OCCURRED_AT,
        observedAt: OBSERVED_AT,
        evidence: drafts,
      }],
    });

    assert.equal(drafts.length, 20);
    assert.equal(snapshot.meetings[0].evidence.length, 20);
  });
});
