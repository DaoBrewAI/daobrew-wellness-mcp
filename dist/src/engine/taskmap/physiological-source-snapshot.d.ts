import { type FetchOuraTaskMapContextOptions, type OuraTaskMapBodyCategory, type OuraTaskMapContextDocument } from "../../health/oura-taskmap-context.js";
import type { TaskMapNativeSemanticEvidenceBindingV1, TaskMapNativeSemanticSourceBindingV1 } from "./native-semantic-builder-adapter.js";
import type { TaskMapNativeSafeSlice } from "./native-refresh-service.js";
import type { TaskMapOwnerCollectedSlice } from "./owner-refresh-coordinator.js";
import type { TaskMapEvent, TaskMapSourcePointer } from "./types.js";
export declare const TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION: "taskmap-physiological-source-snapshot.v1";
export declare const TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION: "taskmap-physiological-source-producer.1";
export declare const TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS: number;
export declare const TASKMAP_PHYSIOLOGICAL_SOURCE_DEFAULT_HISTORY_DAYS = 90;
export declare const TASKMAP_PHYSIOLOGICAL_SOURCE_LIMITS_V1: Readonly<{
    readonly maximumHistoryDays: 90;
    readonly maximumFileBytes: number;
    readonly maximumSourceRecordCount: 10000000;
}>;
export interface TaskMapPhysiologicalSourceSnapshotV1 {
    contractVersion: typeof TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION;
    ownerScopeDigest: string;
    snapshotId: string;
    snapshotDigest: string;
    producerVersion: typeof TASKMAP_PHYSIOLOGICAL_SOURCE_PRODUCER_VERSION;
    sourceFamily: "physiological";
    producedAt: string;
    validThrough: string;
    readReceipt: {
        mode: "live_provider_read";
        outcome: "succeeded";
        requestedAt: string;
        completedAt: string;
        sourceObservedAt: string;
        providerBindingDigest: string;
        safeContextDigest: string;
    };
    coverage: {
        startDay: string;
        endDay: string;
        observedDays: number;
        classifiedDays: number;
        unknownDays: number;
        sourceRecordCount: number;
    };
    days: Array<{
        dayKey: string;
        axis: "composite_recovery";
        category: OuraTaskMapBodyCategory;
    }>;
    privacy: {
        rawBiometricsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
        credentialsStored: false;
    };
}
export type TaskMapPhysiologicalSourceFreshnessDecision = "fresh" | "boundary_due" | "stale" | "missing" | "unknown_version" | "malformed";
export interface TaskMapPhysiologicalSourceAssessmentV1 {
    decision: TaskMapPhysiologicalSourceFreshnessDecision;
    eligibleForCurrentRefresh: boolean;
    assessedAt: string;
    snapshot: TaskMapPhysiologicalSourceSnapshotV1 | null;
    detailCode: "within_four_hour_half_open_interval" | "four_hour_boundary_due" | "four_hour_max_age_exceeded" | "assessment_precedes_production" | "unsupported_snapshot_or_producer_version" | "snapshot_contract_validation_failed" | "snapshot_file_missing" | "snapshot_path_invalid" | "snapshot_file_authentication_failed" | "snapshot_file_changed_during_read" | "snapshot_json_parse_failed" | "snapshot_serialization_noncanonical" | "snapshot_file_open_failed";
}
export type TaskMapPhysiologicalSourceFailureCode = "invalid_request" | "provider_error" | "publication_error" | "snapshot_not_fresh";
export declare class TaskMapPhysiologicalSourceUnavailableError extends Error {
    readonly code: TaskMapPhysiologicalSourceFailureCode;
    constructor(code: TaskMapPhysiologicalSourceFailureCode);
}
export type TaskMapPhysiologicalProviderReader = (options: FetchOuraTaskMapContextOptions) => Promise<OuraTaskMapContextDocument>;
export interface RefreshTaskMapPhysiologicalSourceSnapshotOptions {
    outputPath: string;
    ownerScopeDigest: string;
    /**
     * A current authenticated snapshot is reused until its half-open validity
     * interval ends. Force is reserved for an explicit operator refresh.
     */
    force?: boolean;
    historyDays?: number;
    clock?: () => Date;
    readProviderContext?: TaskMapPhysiologicalProviderReader;
}
export interface TaskMapPhysiologicalSemanticContextV1 {
    pointers: TaskMapSourcePointer[];
    events: TaskMapEvent[];
    sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
    evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
}
export declare function buildTaskMapPhysiologicalSourceSnapshot(context: OuraTaskMapContextDocument, ownerScopeDigest: string, requestedAtInput: string, completedAtInput: string): TaskMapPhysiologicalSourceSnapshotV1;
export declare function assertTaskMapPhysiologicalSourceSnapshot(value: unknown): asserts value is TaskMapPhysiologicalSourceSnapshotV1;
export declare function assessTaskMapPhysiologicalSourceSnapshot(value: unknown, assessedAtInput: string, expectedOwnerScopeDigest: string): TaskMapPhysiologicalSourceAssessmentV1;
export declare function serializeTaskMapPhysiologicalSourceSnapshot(snapshot: TaskMapPhysiologicalSourceSnapshotV1): string;
export declare function loadTaskMapPhysiologicalSourceSnapshot(snapshotPath: string, assessedAtInput: string, expectedOwnerScopeDigest: string): Promise<TaskMapPhysiologicalSourceAssessmentV1>;
export declare function writeTaskMapPhysiologicalSourceSnapshotAtomic(outputPath: string, snapshot: TaskMapPhysiologicalSourceSnapshotV1): Promise<void>;
export declare function refreshTaskMapPhysiologicalSourceSnapshot(options: RefreshTaskMapPhysiologicalSourceSnapshotOptions): Promise<TaskMapPhysiologicalSourceSnapshotV1>;
export declare function buildTaskMapPhysiologicalOwnerSlice(snapshotInput: TaskMapPhysiologicalSourceSnapshotV1, assessedAt: string, ownerScopeDigest: string): TaskMapOwnerCollectedSlice<TaskMapNativeSafeSlice>;
export declare function buildTaskMapPhysiologicalSemanticContext(snapshotInput: TaskMapPhysiologicalSourceSnapshotV1, assessedAt: string, expectedOwnerScopeDigest: string): TaskMapPhysiologicalSemanticContextV1;
