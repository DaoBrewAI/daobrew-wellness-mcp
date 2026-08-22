import { type TaskMapCalendarProducerResultV1 } from "./calendar-producer-freshness.js";
import type { TaskMapNativeSemanticBuilderInputV1 } from "./native-semantic-builder-adapter.js";
import { type MentionActor, type MentionSpeechActClass } from "./mention-extraction.js";
import { type TaskMapLlmStationFactory, type TaskMapMeetingExtractionDegradationCode } from "./meeting-refresh-llm-replay.js";
import { type TaskMapInput } from "./types.js";
export declare const TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION: "taskmap-calendar-extraction-report.v1";
export declare const TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME: "taskmap-calendar-extraction-report.v1.json";
export declare const TASKMAP_CALENDAR_ENVELOPE_NAMESPACE: "calendar";
export declare const TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN: "taskmap-calendar-mention-identity.1";
export interface TaskMapCalendarExtractionMentionV1 {
    text: string;
    title: string;
    speechActClass: MentionSpeechActClass;
    speechActActor: MentionActor;
    confidence: number;
    mentionIdentityDigest: string;
    proposalDisposition: "context_only" | "candidate_only";
    promotionEligible: boolean;
}
export interface TaskMapCalendarExtractionSegmentReportV1 {
    segmentIndex: number;
    inputDigest: string;
    eventIdentityDigests: string[];
    status: "extracted" | "degraded";
    degradationCode: TaskMapMeetingExtractionDegradationCode | null;
    envelopeDigest: string | null;
    envelopeModel: string | null;
    envelopeTransport: "claude-cli" | "codex-cli" | "gemini-remote" | null;
    mentions: TaskMapCalendarExtractionMentionV1[];
}
export interface TaskMapCalendarExtractionReportV1 {
    contractVersion: typeof TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION;
    ownerScopeDigest: string;
    resultDigest: string;
    promptTemplateDigest: string;
    assessedAt: string;
    segments: TaskMapCalendarExtractionSegmentReportV1[];
    pendingCount: number;
    reportDigest: string;
}
export interface TaskMapCalendarSemanticFragmentV1 {
    ownerScopeDigest: string;
    taskMapInput: TaskMapInput;
    sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"];
    evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"];
}
export interface RefreshTaskMapCalendarExtractionInputV1 {
    result: TaskMapCalendarProducerResultV1;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
    assessedAt: string;
    createStation?: TaskMapLlmStationFactory;
    signal?: AbortSignal;
    persist?: boolean;
}
export interface LoadVerifiedTaskMapCalendarExtractionReportInputV1 {
    result: TaskMapCalendarProducerResultV1;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
}
export interface LoadCurrentTaskMapCalendarExtractionProofInputV1 {
    localExportPath: string;
    googleSnapshotPath: string;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
    currentAssessedAt: string;
}
export interface TaskMapCalendarExtractionProofV1 {
    result: TaskMapCalendarProducerResultV1;
    extraction: TaskMapCalendarExtractionReportV1;
}
export declare function refreshTaskMapCalendarExtraction(input: RefreshTaskMapCalendarExtractionInputV1): Promise<TaskMapCalendarExtractionReportV1>;
/**
 * Reconstructs the producer result at the authenticated report's original
 * assessment instant, then delegates every proof check to the verified loader.
 */
export declare function loadCurrentTaskMapCalendarExtractionProof(input: LoadCurrentTaskMapCalendarExtractionProofInputV1): Promise<TaskMapCalendarExtractionProofV1 | null>;
export declare function loadVerifiedTaskMapCalendarExtractionReport(input: LoadVerifiedTaskMapCalendarExtractionReportInputV1): Promise<TaskMapCalendarExtractionReportV1 | null>;
export declare function buildTaskMapCalendarSemanticFragment(result: TaskMapCalendarProducerResultV1, report: TaskMapCalendarExtractionReportV1): TaskMapCalendarSemanticFragmentV1;
