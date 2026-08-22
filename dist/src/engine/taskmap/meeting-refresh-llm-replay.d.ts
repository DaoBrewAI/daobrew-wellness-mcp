import { type LlmStation, type LlmStationEnvelope } from "./llm-station.js";
import { renderTaskMapMentionExtractionPrompt, type TaskMapRawGranolaNoteV1, type TaskMapRenderedMentionPromptV1 } from "./native-meeting-extraction.js";
import { type TaskMapMeetingProducerEvidenceV1 } from "./meeting-producer-freshness.js";
import { type TaskMapNativeCandidateProofRowsContextV1, type TaskMapNativeCandidateShelfRowV1 } from "./native-candidate-review.js";
import { type TaskMapNativeCandidateAcceptanceStoreV1 } from "./native-candidate-acceptance.js";
import type { TaskMapNativeSemanticBuilderInputV1 } from "./native-semantic-builder-adapter.js";
import { type TaskMapInput } from "./types.js";
export declare const TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES: number;
export declare const TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES: number;
export declare const TASKMAP_LLM_ENVELOPE_MAX_BYTES = 1500000;
export declare const TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME = "taskmap-meeting-extraction-report.v1.json";
export declare const TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION: "taskmap-meeting-extraction-report.v1";
declare const REPORT_PRIVACY: Readonly<{
    sourceBodiesStored: false;
    rawSourceIdsStored: false;
    participantDetailsStored: false;
    transcriptBodiesStored: false;
    topicDetailsStored: false;
    providerDiagnosticsStored: false;
    localPathsStored: false;
}>;
export type TaskMapMeetingExtractionDegradationCode = "raw_snapshot_unavailable" | "raw_snapshot_malformed" | "raw_snapshot_limit_exceeded" | "invalid_note_contract" | "no_provider" | "provider_unauthenticated" | "provider_rate_limited" | "provider_timeout" | "provider_nonzero_exit" | "provider_malformed_wrapper" | "provider_empty_output" | "provider_runner_failure" | "remote_consent_required" | "invalid_extraction_output" | "envelope_tampered" | "envelope_store_unavailable";
export interface TaskMapAuthenticatedRawGranolaSnapshotV1 {
    sourceSnapshotDigest: string;
    notes: readonly TaskMapRawGranolaNoteV1[];
}
export interface TaskMapGranolaExtractionReportNoteV1 {
    sourceIdentityDigest: string;
    inputDigest: string;
    occurredAt: string;
    observedAt: string;
    status: "extracted" | "degraded";
    degradationCode: TaskMapMeetingExtractionDegradationCode | null;
    envelopeDigest: string | null;
    evidence: TaskMapMeetingProducerEvidenceV1[];
    evidenceProofDigests: string[];
}
export interface TaskMapGranolaExtractionReportV1 {
    contractVersion: typeof TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION;
    ownerScopeDigest: string;
    sourceSnapshotDigest: string;
    promptTemplateDigest: string;
    producedAt: string;
    notes: TaskMapGranolaExtractionReportNoteV1[];
    privacy: typeof REPORT_PRIVACY;
    reportDigest: string;
}
export type VerifiedTaskMapGranolaExtractionReportV1 = TaskMapGranolaExtractionReportV1 & {
    readonly __verifiedReport?: never;
};
export type TaskMapLlmStationFactory = (signal?: AbortSignal) => Promise<LlmStation>;
export interface ReadAuthenticatedTaskMapGranolaSnapshotInputV1 {
    snapshotPath: string;
    /** Deterministic metadata-race seam; production callers omit it. */
    afterAuthenticatedReadForTesting?: (filePath: string) => void | Promise<void>;
}
export interface TaskMapGranolaExtractionContextV1 {
    snapshotPath: string;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
}
export interface RefreshTaskMapGranolaMeetingExtractionInputV1 extends TaskMapGranolaExtractionContextV1 {
    assessedAt: string;
    createStation?: TaskMapLlmStationFactory;
    signal?: AbortSignal;
}
export interface TaskMapGranolaSemanticFragmentV1 {
    ownerScopeDigest: string;
    taskMapInput: TaskMapInput;
    sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"];
    evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"];
}
export interface TaskMapRawGranolaCandidateShelfV1 {
    ownerScopeDigest: string;
    sourceSnapshotDigest: string;
    candidates: TaskMapNativeCandidateShelfRowV1[];
}
export interface BuildTaskMapUnifiedMeetingCandidateRowsInputV1 {
    ownerScopeDigest: string;
    googleCandidates: readonly TaskMapNativeCandidateShelfRowV1[];
    rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
    acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
}
export interface BuildTaskMapUnifiedMeetingCandidateContextInputV1 {
    ownerScopeDigest: string;
    assessedAt: string;
    googleCandidates: readonly TaskMapNativeCandidateShelfRowV1[];
    googleResultDigest: string | null;
    googleSnapshotDigest: string | null;
    googleProducedAt: string | null;
    rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
}
export declare class TaskMapMeetingExtractionUnavailableError extends Error {
    readonly code: string;
    constructor(code: string);
}
export declare function stationDegradationCode(error: unknown): TaskMapMeetingExtractionDegradationCode;
export declare function assertPrivateDirectory(directory: string, create: boolean): Promise<void>;
interface AuthenticatedFileRead {
    bytes: Buffer;
    digest: string;
}
export declare function readAuthenticatedFile(filePath: string, maximumBytes: number, modePolicy: "owner_private" | "immutable_prompt", afterReadForTesting?: (filePath: string) => void | Promise<void>): Promise<AuthenticatedFileRead>;
/**
 * Deployment-level marker: the bundled prompt template is missing or
 * unreadable. Thrown before any per-unit work so the whole refresh
 * fail-fasts with a single station report (D-P9 code
 * "prompt_template_missing"). The message deliberately carries no path.
 */
export declare class TaskMapPromptTemplateUnavailableError extends Error {
    constructor(options?: {
        cause?: unknown;
    });
}
export declare function readPromptTemplate(promptTemplatePath: string): Promise<{
    bytes: string;
    digest: string;
}>;
export declare function readAuthenticatedTaskMapGranolaSnapshot(input: ReadAuthenticatedTaskMapGranolaSnapshotInputV1): Promise<TaskMapAuthenticatedRawGranolaSnapshotV1>;
export { renderTaskMapMentionExtractionPrompt };
export declare function taskMapMentionExtractionEnvelopePath(taskMapRoot: string, inputDigest: string, namespace?: string): string;
export declare function validateEnvelope(value: unknown, expected: TaskMapRenderedMentionPromptV1, noteBody: string, failureCode?: string): LlmStationEnvelope;
export declare function loadEnvelope(taskMapRoot: string, expected: TaskMapRenderedMentionPromptV1, noteBody: string, namespace?: string): Promise<LlmStationEnvelope | null>;
export declare function atomicPrivateWriteNew(filePath: string, value: unknown): Promise<void>;
export declare function replacePrivateFile(filePath: string, value: unknown): Promise<void>;
export declare function refreshTaskMapGranolaMeetingExtraction(input: RefreshTaskMapGranolaMeetingExtractionInputV1): Promise<VerifiedTaskMapGranolaExtractionReportV1>;
export declare function loadVerifiedTaskMapGranolaExtractionReport(input: TaskMapGranolaExtractionContextV1): Promise<VerifiedTaskMapGranolaExtractionReportV1>;
export declare function buildTaskMapGranolaSemanticFragment(report: VerifiedTaskMapGranolaExtractionReportV1): TaskMapGranolaSemanticFragmentV1;
export declare function taskMapNativeSemanticInputFromGranolaReport(report: VerifiedTaskMapGranolaExtractionReportV1): TaskMapNativeSemanticBuilderInputV1;
export declare function buildTaskMapRawGranolaCandidateShelf(report: VerifiedTaskMapGranolaExtractionReportV1): TaskMapRawGranolaCandidateShelfV1;
/**
 * Join authenticated Google shelf rows with raw Granola rows that came through
 * the unforgeable verified-report gate. Existing Google-only rows are returned
 * unchanged. A validated acceptance store removes already-promoted IDs so a
 * restart cannot show accepted work as a suggestion again.
 */
export declare function buildTaskMapUnifiedMeetingCandidateRows(input: BuildTaskMapUnifiedMeetingCandidateRowsInputV1): TaskMapNativeCandidateShelfRowV1[];
export declare function buildTaskMapUnifiedMeetingCandidateContext(input: BuildTaskMapUnifiedMeetingCandidateContextInputV1): TaskMapNativeCandidateProofRowsContextV1;
export declare function assertVerifiedTaskMapGranolaExtractionReportFresh(report: VerifiedTaskMapGranolaExtractionReportV1, assessedAt: string): void;
