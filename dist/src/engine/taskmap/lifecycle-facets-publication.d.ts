import { type TaskMapIdentityDedupeStorePredecessorV1, type TaskMapIdentityDedupeStoreRoots } from "./identity-dedupe-projection.js";
import { type BuiltTaskMapLifecycleFacets, type TaskMapLifecycleFacetsPredecessorV1 } from "./lifecycle-facets.js";
import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION: "taskmap-lifecycle-facets-publication.v1";
export declare const TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1: Readonly<{
    maxInputBytes: number;
    maxMemberBytes: number;
    maxCapsuleBytes: number;
    maxGenerations: 4096;
    maxHistoryBytes: number;
    maxStagingEntries: 32;
    maxStagingBytes: number;
    maxPathBytes: 4096;
    maxJsonNodes: 200000;
    maxJsonDepth: 64;
    maxObjectKeys: 256;
    maxArrayLength: 100000;
    maxStringBytes: number;
}>;
export interface TaskMapLifecycleFacetsPublicationPredecessorV1 {
    generation: string;
    publicationId: string;
    publicationDigest: string;
}
export interface TaskMapLifecycleFacetsProjectionMemberV1 {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    byteLength: number;
    byteSha256: string;
    canonicalBytes: string;
}
export interface TaskMapLifecycleFacetsArtifactMemberV1 {
    contractVersion: string;
    artifactId: string;
    artifactDigest: string;
    originDigest: string;
    byteLength: number;
    byteSha256: string;
    canonicalBytes: string;
}
export interface TaskMapLifecycleFacetsPublicationPrivacyV1 {
    sourceBodiesStored: false;
    candidateTokensStored: false;
    candidateTextStored: false;
    additionalRouteDataStored: false;
    rawOwnerIdentifiersStored: false;
    rawSourceObjectIdentifiersStored: false;
    rawSourceRevisionsStored: false;
    rawBiometricsStored: false;
    localPathsStored: false;
    connectorSecretsStored: false;
    executionStateStored: false;
}
/**
 * One immutable P11 capsule. `p10Head` is the exact predecessor tuple emitted
 * by the authenticated lifecycle builder. `p10StorePredecessor` and
 * `p10EntryDigest` additionally bind that head to its exact P10 store entry,
 * without copying the P10 store or mutating its current reference.
 */
export interface TaskMapLifecycleFacetsPublicationV1 {
    contractVersion: typeof TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION;
    publicationId: string;
    publicationDigest: string;
    generation: string;
    predecessorPublication: TaskMapLifecycleFacetsPublicationPredecessorV1 | null;
    p10Head: TaskMapLifecycleFacetsPredecessorV1;
    p10StorePredecessor: TaskMapIdentityDedupeStorePredecessorV1 | null;
    p10EntryDigest: string;
    projectionMember: TaskMapLifecycleFacetsProjectionMemberV1;
    lifecycleMember: TaskMapLifecycleFacetsArtifactMemberV1;
    privacy: TaskMapLifecycleFacetsPublicationPrivacyV1;
}
export interface TaskMapLifecycleFacetsPublicationStoreRoots extends TaskMapIdentityDedupeStoreRoots {
    publicationRoot: string;
}
export interface BuildAndPublishTaskMapLifecycleFacetsInput extends TaskMapLifecycleFacetsPublicationStoreRoots {
    projection: TaskMapProjectionV1;
}
export type TaskMapLifecycleFacetsPublicationStatus = "published" | "already_published" | "committed_head_advanced_retry";
export interface TaskMapLifecycleFacetsPublicationReceiptV1 {
    status: TaskMapLifecycleFacetsPublicationStatus;
    committed: true;
    publication: TaskMapLifecycleFacetsPublicationV1;
    processCrashAtomic: true;
    powerLossDurabilityClaimed: false;
}
export interface BuiltAndPublishedTaskMapLifecycleFacets extends BuiltTaskMapLifecycleFacets {
    projectionCanonicalBytes: string;
    capsule: TaskMapLifecycleFacetsPublicationV1;
    capsuleCanonicalBytes: string;
    publication: TaskMapLifecycleFacetsPublicationReceiptV1;
}
export interface TaskMapLifecycleFacetsPublicationStoreSnapshotV1 {
    publications: TaskMapLifecycleFacetsPublicationV1[];
    canonicalByteLength: number;
    remainingByteCapacity: number;
    headStatus: "empty" | "current" | "p10_head_advanced_retry";
}
export type TaskMapLifecycleFacetsPublicationFaultPoint = "after_lifecycle_build" | "after_stage_sync" | "before_final_p10_read" | "after_generation_link" | "before_stage_cleanup" | "before_post_commit_p10_read" | "before_retry_p10_read";
export interface TaskMapLifecycleFacetsPublicationWriteOptions {
    faultInjection?: (point: TaskMapLifecycleFacetsPublicationFaultPoint) => void | Promise<void>;
}
export interface TaskMapLifecycleFacetsPublicationRecoveryOptions {
    /**
     * Recovery cannot infer that another writer is dead. The caller must first
     * quiesce P11 publishers through an out-of-process exclusivity mechanism.
     */
    externalExclusivityAsserted: true;
}
export interface TaskMapLifecycleFacetsPublicationRecoveryReceiptV1 {
    removedStageCount: number;
    retainedPublicationCount: number;
}
export declare function assertTaskMapLifecycleFacetsPublication(value: TaskMapLifecycleFacetsPublicationV1): TaskMapLifecycleFacetsPublicationV1;
export declare function taskMapLifecycleFacetsPublicationCanonicalBytes(value: TaskMapLifecycleFacetsPublicationV1): string;
/**
 * Initializes only the additive P11 directory shape. The caller owns and
 * pre-creates `publicationRoot` as a same-owner 0700 directory.
 */
export declare function initializeTaskMapLifecycleFacetsPublicationStore(publicationRoot: string): Promise<void>;
/**
 * Authenticated product reader. It verifies every immutable P11 capsule
 * against the corresponding authenticated P10 history member. A lagging P11
 * head remains readable as historical state and reports that a retry is due.
 */
export declare function readTaskMapLifecycleFacetsPublicationStore(roots: TaskMapLifecycleFacetsPublicationStoreRoots): Promise<TaskMapLifecycleFacetsPublicationStoreSnapshotV1>;
/**
 * Builds and publishes one immutable P11 capsule. The final authenticated P10
 * reread is the final await before the synchronous no-replace hardlink CAS.
 * A P10 advance after the committed CAS is returned honestly; the generation
 * remains an authenticated immutable historical publication.
 */
export declare function buildAndPublishTaskMapLifecycleFacets(input: BuildAndPublishTaskMapLifecycleFacetsInput, options?: TaskMapLifecycleFacetsPublicationWriteOptions): Promise<BuiltAndPublishedTaskMapLifecycleFacets>;
/**
 * Removes only bound P11 staging residue under asserted external exclusivity.
 * A linked stage is removed only after its immutable generation peer is proven
 * byte- and inode-identical. An unlinked complete stage is discarded without
 * publishing it; recovery never invents authority or performs a CAS.
 */
export declare function recoverTaskMapLifecycleFacetsPublicationStore(publicationRoot: string, options: TaskMapLifecycleFacetsPublicationRecoveryOptions): Promise<TaskMapLifecycleFacetsPublicationRecoveryReceiptV1>;
