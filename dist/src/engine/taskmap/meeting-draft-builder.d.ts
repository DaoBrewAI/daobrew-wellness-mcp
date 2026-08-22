import type { LlmStationEnvelope } from "./llm-station.js";
import { type TaskMapMeetingProducerEvidenceDraftV1 } from "./meeting-producer-freshness.js";
export declare const TASKMAP_MEETING_MENTION_IDENTITY_DOMAIN: "taskmap-meeting-mention-identity.1";
export interface TaskMapMeetingEvidenceDraftNoteV1 {
    sourceText: string;
    occurredAt: string;
    observedAt: string;
}
/**
 * Convert a validated recorded extraction into the bounded producer-draft
 * contract. The exact note and model output remain inputs only.
 */
export declare function buildMeetingEvidenceDrafts(note: TaskMapMeetingEvidenceDraftNoteV1, envelope: LlmStationEnvelope): TaskMapMeetingProducerEvidenceDraftV1[];
