import type {
  TaskMapCalendarProducerEventV1,
} from "./calendar-producer-freshness.js";
import {
  TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES,
  TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES,
  type TaskMapRenderedMentionPromptV1,
} from "./native-meeting-extraction.js";
import {
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS = 24 as const;
export const TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER =
  "\n<<<BEGIN_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";
export const TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER =
  "\n<<<END_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";

export interface TaskMapCalendarExtractionSegmentV1 {
  segmentIndex: number;
  body: string;
  inputDigest: string;
  eventIdentityDigests: string[];
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function buildTaskMapCalendarExtractionSegments(
  events: readonly TaskMapCalendarProducerEventV1[],
): TaskMapCalendarExtractionSegmentV1[] {
  const ordered = [...events].sort((left, right) =>
    left.startAt.localeCompare(right.startAt)
    || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest)
  );
  const segments: TaskMapCalendarExtractionSegmentV1[] = [];
  for (
    let offset = 0;
    offset < ordered.length;
    offset += TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS
  ) {
    const members = ordered.slice(
      offset,
      offset + TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS,
    );
    const body = members.map((event) =>
      `- ${event.title} (${event.startAt} to ${event.endAt})\n`
    ).join("");
    segments.push(Object.freeze({
      segmentIndex: segments.length,
      body,
      inputDigest: taskMapContractDigest(body),
      eventIdentityDigests: Object.freeze(
        members.map((event) => event.eventIdentityDigest),
      ) as unknown as string[],
    }));
  }
  return segments;
}

export function renderTaskMapCalendarMentionPrompt(
  promptTemplate: string,
  body: string,
): TaskMapRenderedMentionPromptV1 {
  if (
    typeof promptTemplate !== "string"
    || promptTemplate.length === 0
    || byteLength(promptTemplate) > TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map prompt template");
  }
  if (
    typeof body !== "string"
    || body.length === 0
    || byteLength(body) > TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map calendar segment body");
  }
  const promptText = promptTemplate
    + TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER
    + body
    + TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER;
  return Object.freeze({
    promptText,
    promptTemplateDigest: taskMapContractDigest(promptTemplate),
    inputDigest: taskMapContractDigest(body),
    promptDigest: taskMapContractDigest(promptText),
  });
}
