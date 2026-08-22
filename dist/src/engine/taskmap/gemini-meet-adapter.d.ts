import { type TaskMapRefreshRunSourceSliceProofV1 } from "./refresh-run-bundle.js";
import { type TaskMapRefreshSourceBindingV1, type TaskMapRefreshSourceRevisionSetV1, type TaskMapRefreshSourceRevisionV1 } from "./refresh-plan.js";
import { type TaskMapCanonicalMeetingV1, type TaskMapConnectorCheckpointV1, type TaskMapDiscoveryPointerV1, type TaskMapMeetingIdentityHintV1, type TaskMapSourceAuthorityBindingV1, type TaskMapSourceEnvelopeV1, type TaskMapSourceSnapshotV1 } from "./types.js";
/**
 * P12.1a is a bounded, read-only adapter. Providers are injected by a caller;
 * this module owns no connector client, credentials, clock, scheduler,
 * persistence, writeback, or source mutation.
 */
export declare const TASKMAP_GEMINI_MEET_ADAPTER_VERSION: "taskmap-gemini-meet-adapter.1";
export declare const TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION: "taskmap-gemini-meet-adapter-result.v1";
export declare const TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION: "taskmap-gemini-meet-adapter-failure.v1";
export declare const TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION: "taskmap-gemini-meet-empty-observation.v1";
export declare const TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1: Readonly<{
    readonly maxDocuments: 64;
    readonly maxArrayLength: 256;
    readonly maxObjectKeys: 16;
    readonly maxDepth: 8;
    readonly maxNodes: 4096;
    readonly maxStringBytes: 2048;
    readonly maxProviderResponseBytes: number;
}>;
declare const ADAPTER_PRIVACY: Readonly<{
    sourceBodiesStored: false;
    emailBodiesStored: false;
    participantDetailsStored: false;
    credentialsStored: false;
    rawProviderResponsesStored: false;
    localPathsStored: false;
}>;
export interface TaskMapGeminiMeetDriveDocumentRefV1 {
    documentId: string;
    revisionId: string;
}
export interface TaskMapGeminiMeetDriveListResponseV1 {
    documents: TaskMapGeminiMeetDriveDocumentRefV1[];
}
export interface TaskMapGeminiMeetDriveDocumentMetadataV1 {
    documentId: string;
    revisionId: string;
    eventTime: string;
    contentDigest: string;
    quality: "structured_generated" | "degraded_summary";
    meetingIdentity: TaskMapMeetingIdentityHintV1;
}
export interface TaskMapGeminiMeetDriveReadResponseV1 {
    document: TaskMapGeminiMeetDriveDocumentMetadataV1;
}
export interface TaskMapGeminiMeetDriveListRequestV1 {
    limit: number;
}
export interface TaskMapGeminiMeetDriveReadRequestV1 {
    documentId: string;
    revisionId: string;
}
export interface TaskMapGeminiMeetDriveProviderV1 {
    listCurrentMeetingDocumentRefs(request: Readonly<TaskMapGeminiMeetDriveListRequestV1>): Promise<unknown>;
    readMeetingDocumentMetadata(request: Readonly<TaskMapGeminiMeetDriveReadRequestV1>): Promise<unknown>;
}
export interface TaskMapGeminiMeetPreviousServingInputV1 {
    checkpoint: TaskMapConnectorCheckpointV1;
    sourceSliceProof: TaskMapRefreshRunSourceSliceProofV1;
}
export interface TaskMapGeminiMeetAdapterInputV1 {
    ownerScopeDigest: string;
    attemptedAt: string;
    driveBinding: TaskMapSourceAuthorityBindingV1;
    driveProvider: TaskMapGeminiMeetDriveProviderV1;
    previous?: TaskMapGeminiMeetPreviousServingInputV1;
    previousCanonicalMeetings?: readonly TaskMapCanonicalMeetingV1[];
}
export type TaskMapGeminiMeetAdapterFailureCode = "drive_list_unavailable" | "drive_list_malformed" | "drive_list_proxy" | "drive_list_limit" | "drive_list_incomplete" | "drive_document_unavailable" | "drive_document_malformed" | "drive_document_proxy" | "drive_document_limit";
export interface TaskMapGeminiMeetAdapterFailureV1 {
    contractVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION;
    failureId: string;
    provider: "drive";
    sourceObjectKeyDigest: string;
    code: TaskMapGeminiMeetAdapterFailureCode;
    detailDigest: string;
    retryable: true;
    blockingForServing: boolean;
}
export interface TaskMapGeminiMeetEmptyObservationV1 {
    contractVersion: typeof TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION;
    observationId: string;
    observationDigest: string;
    ownerScopeDigest: string;
    bindingDigest: string;
    adapterVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_VERSION;
    attemptedAt: string;
    authoritativeDocumentCount: 0;
    disposition: "retained_last_good" | "non_serving";
    priorCheckpointDigest?: string;
    retainedSourceSliceDigest?: string;
    privacy: typeof ADAPTER_PRIVACY;
}
export interface TaskMapGeminiMeetRefreshInputsV1 {
    sourceBinding: TaskMapRefreshSourceBindingV1;
    sourceRevisions: TaskMapRefreshSourceRevisionV1[];
    sourceRevisionSet: TaskMapRefreshSourceRevisionSetV1;
    sourceSliceProof: TaskMapRefreshRunSourceSliceProofV1;
    checkpointDigest: string;
    servingDisposition: "current_source" | "retained_last_good" | "non_serving";
    semanticInputDigest?: string;
    emptyObservationDigest?: string;
}
export interface TaskMapGeminiMeetAdapterResultV1 {
    contractVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION;
    adapterVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_VERSION;
    state: "success" | "partial" | "failed" | "empty_requires_review" | "incomplete_requires_review";
    isExactNoOp: boolean;
    envelopes: TaskMapSourceEnvelopeV1[];
    discoveryPointers: TaskMapDiscoveryPointerV1[];
    canonicalMeetings: TaskMapCanonicalMeetingV1[];
    sourceSnapshot?: TaskMapSourceSnapshotV1;
    emptyObservation?: TaskMapGeminiMeetEmptyObservationV1;
    checkpoint: TaskMapConnectorCheckpointV1;
    failures: TaskMapGeminiMeetAdapterFailureV1[];
    refreshInputs: TaskMapGeminiMeetRefreshInputsV1;
    privacy: typeof ADAPTER_PRIVACY;
}
export declare function readTaskMapGeminiMeetAdapter(input: TaskMapGeminiMeetAdapterInputV1): Promise<TaskMapGeminiMeetAdapterResultV1>;
export {};
