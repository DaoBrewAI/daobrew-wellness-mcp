import type { TaskMapNativeSemanticEvidenceBindingV1, TaskMapNativeSemanticSourceBindingV1 } from "./native-semantic-builder-adapter.js";
import { type TaskMapInput, type TaskMapSourceAuthorityBindingV1, type TaskMapSourceSnapshotV1 } from "./types.js";
export declare const TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION: "taskmap-strategy-source-adapter.1";
export declare const TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION: "taskmap-strategy-source-adapter-result.v1";
export declare const TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION: "taskmap-strategy-source-provenance.v1";
export declare const TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME: "taskmap-strategy-source-evidence.v1.json";
export declare const TASKMAP_STRATEGY_SOURCE_LIMITS_V1: Readonly<{
    readonly maximumProjectionBytes: number;
    readonly maximumCurrentnessBytes: number;
    readonly maximumRepositoryFileBytes: number;
    readonly maximumResultBytes: number;
    readonly maximumTasks: 128;
    readonly maximumRoots: 32;
}>;
export declare const TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST: string;
declare const PRIVACY: Readonly<{
    readonly sourceRowsStored: false;
    readonly sourceBodiesStored: false;
    readonly localPathsStored: false;
    readonly rawBiometricsStored: false;
    readonly ownerIdentityStored: false;
}>;
export type TaskMapStrategySourceFailureCode = "invalid_contract" | "digest_mismatch" | "invalid_projection" | "invalid_currentness" | "no_current_strategy_tasks" | "row_binding_mismatch" | "mutable_revision" | "repository_locator_mismatch" | "repository_read_failed" | "repository_response_malformed" | "repository_content_limit" | "row_resolution_failed" | "lifecycle_unavailable" | "root_link_unavailable" | "result_limit_exceeded";
export declare class TaskMapStrategySourceUnavailableError extends Error {
    readonly code: TaskMapStrategySourceFailureCode;
    constructor(code: TaskMapStrategySourceFailureCode);
}
export interface TaskMapStrategyRowBindingV1 {
    pointerId: string;
    canonicalRowDigest: string;
}
export interface TaskMapStrategyRepositoryReadRequestV1 {
    remoteLocator: string;
    revision: string;
    repositoryRelativePath: string;
    maximumBytes: number;
}
export interface TaskMapStrategyRepositoryObservationV1 extends Omit<TaskMapStrategyRepositoryReadRequestV1, "maximumBytes"> {
    committedAt: string;
    content: string;
    contentDigest: string;
}
export interface TaskMapStrategyRepositoryProviderV1 {
    readImmutableRepositoryFile(request: Readonly<TaskMapStrategyRepositoryReadRequestV1>): Promise<unknown>;
}
export interface ReadTaskMapStrategySourceAdapterInputV1 {
    ownerScopeDigest: string;
    binding: TaskMapSourceAuthorityBindingV1;
    projectionBytes: Uint8Array;
    currentnessBytes: Uint8Array;
    expectedProjectionFileDigest: string;
    expectedCurrentnessFileDigest: string;
    rowBindings: TaskMapStrategyRowBindingV1[];
    repositoryProvider: TaskMapStrategyRepositoryProviderV1;
}
export interface TaskMapStrategyAcceptedRootLinkV1 {
    rootId: string;
    rootLinkRef: string;
    memberObjectRefs: string[];
    memberObjectRefsDigest: string;
    projectionRootDigest: string;
}
export interface TaskMapStrategySourceTaskProofV1 {
    taskId: string;
    rootId: string;
    pointerId: string;
    eventId: string;
    rootLinkRef: string;
    sourceEnvelopeId: string;
    sourceIdentityDigest: string;
    sourceRevision: string;
    canonicalRowDigest: string;
    projectionTaskDigest: string;
    projectionCitationDigest: string;
    proofDigest: string;
}
export interface TaskMapStrategySourceProvenanceV1 {
    contractVersion: typeof TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION;
    artifactDigest: string;
    scope: "current_strategy_owned_tasks_only";
    projection: {
        runId: string;
        inputDigest: string;
        projectionFileDigest: string;
        projectionDigest: string;
        currentnessFileDigest: string;
        allCurrentTaskCount: number;
        attestedStrategyTaskCount: number;
        excludedCurrentTaskCount: number;
        excludedCurrentTaskSetDigest: string;
    };
    repository: {
        remoteLocator: string;
        revision: string;
        repositoryRelativePath: string;
        committedAt: string;
        fileContentDigest: string;
        repositoryBindingDigest: string;
    };
    producer: {
        version: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION;
        policyDigest: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST;
        rowBindingSetDigest: string;
    };
    sourceSnapshotDigest: string;
    tasks: TaskMapStrategySourceTaskProofV1[];
    rootLinks: TaskMapStrategyAcceptedRootLinkV1[];
    privacy: typeof PRIVACY;
}
export interface TaskMapStrategySourceAdapterResultV1 {
    contractVersion: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION;
    resultDigest: string;
    adapterVersion: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION;
    adapterPolicyDigest: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST;
    rowBindingSetDigest: string;
    ownerScopeDigest: string;
    taskMapInput: TaskMapInput;
    sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
    evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
    sourceSnapshot: TaskMapSourceSnapshotV1;
    exactProvenance: TaskMapStrategySourceProvenanceV1;
    privacy: typeof PRIVACY;
}
export declare function readTaskMapStrategySourceAdapter(input: ReadTaskMapStrategySourceAdapterInputV1): Promise<TaskMapStrategySourceAdapterResultV1>;
export {};
