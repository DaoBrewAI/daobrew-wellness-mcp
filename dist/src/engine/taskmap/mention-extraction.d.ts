export declare const MENTION_EXTRACTION_LIMITS: Readonly<{
    readonly maxMentions: 20;
    readonly maxTitleCharacters: 80;
}>;
export type MentionSpeechActClass = "request" | "commitment" | "decision" | "other";
export type MentionActor = "self" | "other" | "unknown";
export interface ValidatedMentionExtractionV1 {
    text: string;
    title: string;
    class: MentionSpeechActClass;
    actor: MentionActor;
    confidence: number;
}
export interface ValidatedMentionExtractionResultV1 {
    mentions: ValidatedMentionExtractionV1[];
}
export type MentionExtractionFailureReason = "invalid_json" | "invalid_source" | "invalid_top_level" | "invalid_mention" | "invalid_span" | "invalid_title" | "invalid_class" | "invalid_actor" | "invalid_confidence";
/**
 * A deliberately privacy-safe validation failure. The reason is suitable for
 * a per-note degradation report and never includes model output or note text.
 */
export declare class MentionExtractionValidationError extends Error {
    readonly reason: MentionExtractionFailureReason;
    constructor(reason: MentionExtractionFailureReason);
}
/**
 * Canonical safety gate for persisted mention-derived display text. Non-bidi
 * format controls needed by legitimate emoji/Indic shaping remain allowed only
 * when another meaningful scalar is present; Cc and bidi controls never are.
 */
export declare function isTaskMapMentionDisplayTextSafe(value: string): boolean;
export declare function assertTaskMapStrictJsonSyntaxAndUniqueKeys(outputJson: string): void;
/**
 * Strictly validates one station response against the exact source note.
 * Every entry is validated before the deterministic first-20 projection so a
 * malformed later entry can never be hidden by truncation.
 */
export declare function validateMentionExtraction(outputJson: string, sourceText: string): ValidatedMentionExtractionResultV1;
