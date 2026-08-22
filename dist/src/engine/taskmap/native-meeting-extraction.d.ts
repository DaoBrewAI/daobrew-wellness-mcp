export declare const TASKMAP_GRANOLA_RAW_NOTE_LIMIT = 64;
export declare const TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES = 65536;
export declare const TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES = 262144;
export declare const TASKMAP_MENTION_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_MEETING_NOTE_V1>>>\n";
export declare const TASKMAP_MENTION_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_MEETING_NOTE_V1>>>\n";
export interface TaskMapRawGranolaNoteV1 {
    sourceIdentityDigest: string;
    title: string;
    body: string;
    createdAt: string;
    occurredAt: string;
}
export interface TaskMapRawGranolaParseResultV1 {
    notes: readonly TaskMapRawGranolaNoteV1[];
    invalidRows: readonly never[];
}
export interface TaskMapRenderedMentionPromptV1 {
    promptText: string;
    promptTemplateDigest: string;
    inputDigest: string;
    promptDigest: string;
}
export declare class TaskMapRawGranolaSnapshotError extends Error {
    constructor(reason: string);
}
export declare function parseTaskMapRawGranolaSnapshot(value: unknown): TaskMapRawGranolaParseResultV1;
export declare function renderTaskMapMentionExtractionPrompt(promptTemplate: string, noteBody: string): TaskMapRenderedMentionPromptV1;
