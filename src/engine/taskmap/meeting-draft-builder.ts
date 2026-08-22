import type {
  LlmStationEnvelope,
} from "./llm-station.js";
import {
  validateMentionExtraction,
  type MentionSpeechActClass,
} from "./mention-extraction.js";
import {
  normalizeMentionText,
} from "./mention-normalization.js";
import {
  TASKMAP_MEETING_PRODUCER_LIMITS_V1,
  type TaskMapMeetingProducerEvidenceDraftV1,
  type TaskMapMeetingProducerEvidenceKind,
} from "./meeting-producer-freshness.js";
import {
  taskMapContractDigest,
} from "./source-contracts.js";
import { boundedUtf16 } from "./text-contract.js";

export const TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN =
  "taskmap-meeting-mention-identity.1" as const;

export interface TaskMapMeetingEvidenceDraftNoteV1 {
  sourceText: string;
  occurredAt: string;
  observedAt: string;
}

function boundedSummary(value: string): string {
  const canonical = value.trim().replace(/\s+/gu, " ");
  return boundedUtf16(
    canonical,
    TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters,
  );
}

function meetingEvidenceKind(
  speechActClass: MentionSpeechActClass,
): TaskMapMeetingProducerEvidenceKind {
  switch (speechActClass) {
    case "request":
    case "other":
      return "action_item";
    case "commitment":
      return "commitment";
    case "decision":
      return "decision";
  }
  const exhaustive: never = speechActClass;
  return exhaustive;
}

/**
 * Convert a validated recorded extraction into the bounded producer-draft
 * contract. The exact note and model output remain inputs only.
 */
export function buildMeetingEvidenceDrafts(
  note: TaskMapMeetingEvidenceDraftNoteV1,
  envelope: LlmStationEnvelope,
): TaskMapMeetingProducerEvidenceDraftV1[] {
  if (envelope.inputDigest !== taskMapContractDigest(note.sourceText)) {
    throw new Error("Task Map meeting draft envelope input digest mismatch");
  }
  const extraction = validateMentionExtraction(
    envelope.outputJson,
    note.sourceText,
  );
  const extractionEnvelopeDigest = taskMapContractDigest(envelope);

  return extraction.mentions.map((mention) => {
    const normalizedText = normalizeMentionText(mention.text);
    if (normalizedText.length === 0) {
      throw new Error("Task Map normalized mention identity is empty");
    }
    const mentionIdentityDigest = taskMapContractDigest({
      domain: TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN,
      normalizedText,
    });
    return {
      kind: meetingEvidenceKind(mention.class),
      title: mention.title,
      summary: boundedSummary(mention.text),
      occurredAt: note.occurredAt,
      observedAt: note.observedAt,
      quality: "structured_generated",
      coverage: "partial",
      confidence: mention.confidence,
      speechActClass: mention.class,
      speechActActor: mention.actor,
      mentionIdentityDigest,
      extractionEnvelopeDigest,
    };
  });
}
