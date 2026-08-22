import { type TaskMapEdge, type TaskMapProjectionV1, type TaskMapSourceSnapshotV1 } from "./types.js";
export declare const TASKMAP_EXACT_PROVENANCE_VERSION: "taskmap-exact-provenance.v1";
export declare const TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION: "taskmap-exact-provenance-producer.1";
export declare const TASKMAP_EXACT_PROVENANCE_LIMITS_V1: Readonly<{
    readonly maximumArtifactBytes: number;
    readonly maximumTasks: 4096;
    readonly maximumRoots: 1024;
    readonly maximumEdges: 16384;
    readonly maximumRepositoryRelativePathBytes: 512;
    readonly maximumCanonicalRowBytes: number;
}>;
export declare const TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST: string;
export declare const TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION: "taskmap-owner-receipt-adapter.1";
export declare const TASKMAP_MANUAL_RECEIPT_LOCATOR: "owner-receipts/native-candidate-acceptance.v1.json";
export declare const TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST: string;
export declare const TASKMAP_MIXED_SOURCE_ADAPTER_VERSION: "taskmap-mixed-current-source-adapter.1";
export interface TaskMapExactProvenanceCurrentnessV1 {
    contractVersion: "taskmap-native-currentness-gate.v1";
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    taskDispositions: Array<{
        taskId: string;
        disposition: "current" | "needs_lifecycle_review";
    }>;
}
export interface TaskMapExactProvenanceTaskBindingDraftV1 {
    taskId: string;
    sourceEnvelopeId: string;
    repositoryRelativePath: string;
    adapterVersion: string;
    adapterPolicyDigest: string;
}
export interface TaskMapExactProvenanceTaskProofV1 {
    taskId: string;
    pointerId: string;
    projectionSourceRefHash: string;
    projectionCitationDigest: string;
    sourceEnvelopeId: string;
    sourceObjectKeyDigest: string;
    sourceIdentityDigest: string;
    sourceRevision: string;
    canonicalRowDigest: string;
    repositoryBindingDigest: string;
    repositoryRelativePath: string;
    bindingAuthority: "adapter_attested";
    adapterVersion: string;
    adapterPolicyDigest: string;
    adapterAttestationDigest: string;
    proofDigest: string;
}
export interface TaskMapExactProvenanceRootProofV1 {
    rootId: string;
    factKind: "derived_projection";
    currentTaskIds: string[];
    currentTaskProofDigests: string[];
    producerDigest: typeof TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST;
    algorithmPolicyDigest: string;
    projectionRootDigest: string;
    derivationDigest: string;
}
export interface TaskMapExactProvenanceEdgeProofV1 {
    edgeId: string;
    factKind: "derived_projection";
    from: string;
    to: string;
    relation: TaskMapEdge["relation"];
    executionEvidence: "exact_task_source" | "context_only";
    exactTaskProofDigests: string[];
    producerDigest: typeof TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST;
    algorithmPolicyDigest: string;
    projectionEdgeDigest: string;
    derivationDigest: string;
}
export interface TaskMapExactProvenanceV1 {
    contractVersion: typeof TASKMAP_EXACT_PROVENANCE_VERSION;
    artifactDigest: string;
    projection: {
        contractVersion: string;
        runId: string;
        inputDigest: string;
        projectionDigest: string;
        currentnessFileDigest: string;
        currentTaskSetDigest: string;
    };
    producer: {
        version: typeof TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION;
        policyDigest: typeof TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST;
    };
    sourceSnapshot: TaskMapSourceSnapshotV1;
    tasks: TaskMapExactProvenanceTaskProofV1[];
    roots: TaskMapExactProvenanceRootProofV1[];
    edges: TaskMapExactProvenanceEdgeProofV1[];
    privacy: {
        sourceRowsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
        providerFactsInvented: false;
    };
}
export interface BuildTaskMapExactProvenanceInputV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapExactProvenanceCurrentnessV1;
    currentnessFileDigest: string;
    expectedSourceSnapshotDigest: string;
    expectedAdapterVersion: string;
    expectedAdapterPolicyDigest: string;
    sourceSnapshot: TaskMapSourceSnapshotV1;
    taskBindings: TaskMapExactProvenanceTaskBindingDraftV1[];
}
export interface AssertTaskMapExactProvenanceContextV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapExactProvenanceCurrentnessV1;
    currentnessFileDigest: string;
    expectedSourceSnapshotDigest: string;
    expectedAdapterVersion: string;
    expectedAdapterPolicyDigest: string;
}
export interface TaskMapCanonicalRepositoryRowDigestInputV1 {
    repositoryRelativePath: string;
    sourceObjectId: string;
    rowText: string;
}
export declare function taskMapExactProvenanceAdapterExpectation(bindings: readonly TaskMapExactProvenanceTaskBindingDraftV1[]): {
    adapterVersion: string;
    adapterPolicyDigest: string;
};
export declare function taskMapCanonicalRepositoryRowDigest(input: TaskMapCanonicalRepositoryRowDigestInputV1): string;
export declare function buildTaskMapExactProvenance(input: BuildTaskMapExactProvenanceInputV1): TaskMapExactProvenanceV1;
export declare function taskMapExactProvenanceDigest(artifact: TaskMapExactProvenanceV1): string;
export declare function assertTaskMapExactProvenance(artifact: TaskMapExactProvenanceV1, context: AssertTaskMapExactProvenanceContextV1): TaskMapExactProvenanceV1;
