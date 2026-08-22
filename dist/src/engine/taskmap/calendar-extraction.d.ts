import type { TaskMapCalendarProducerEventV1 } from "./calendar-producer-freshness.js";
import { type TaskMapRenderedMentionPromptV1 } from "./native-meeting-extraction.js";
export declare const TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS: 24;
export declare const TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";
export declare const TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";
export interface TaskMapCalendarExtractionSegmentV1 {
    segmentIndex: number;
    body: string;
    inputDigest: string;
    eventIdentityDigests: string[];
}
export declare function buildTaskMapCalendarExtractionSegments(events: readonly TaskMapCalendarProducerEventV1[]): TaskMapCalendarExtractionSegmentV1[];
export declare function renderTaskMapCalendarMentionPrompt(promptTemplate: string, body: string): TaskMapRenderedMentionPromptV1;
