import { type TaskMapAdjudicatedLifecycleDelta, type TaskMapAdjudicatedLifecycleState, type TaskMapAdjudicatedPreviousLifecycleState, type TaskMapIdentityDedupeStoreRoots, type TaskMapIdentityDedupeStoreSnapshotV1 } from "./identity-dedupe-projection.js";
import { type TaskMapWorkControlDecisionV1 } from "./work-control-decision.js";
import type { TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_LIFECYCLE_FACETS_VERSION: "taskmap-lifecycle-facets.v1";
export declare const TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION: "taskmap-lifecycle-facets-policy.1";
export declare const TASKMAP_LIFECYCLE_FACETS_LIMITS_V1: Readonly<{
    maxCanonicalInputBytes: number;
    maxCanonicalArtifactBytes: number;
    maxNodes: 100000;
    maxDescriptors: 100000;
    maxDepth: 32;
    maxObjectKeys: 128;
    maxArrayLength: 8192;
    maxStringLength: 4096;
    maxWorks: 2048;
    maxProjectionTasks: 8192;
}>;
export type TaskMapLifecycleFacet = "accepted_open" | "source_complete" | "superseded" | "rejected";
export type TaskMapLifecycleFacetChange = "new" | "updated" | "resolved" | "superseded" | "rejected" | "unchanged";
export declare const TASKMAP_LIFECYCLE_FACETS_POLICY_V1: Readonly<{
    contractVersion: "taskmap-lifecycle-facets-policy.1";
    lifecycleAuthority: "authenticated_p10_2_lifecycle_delta";
    acceptedWorkAuthority: "store_backed_p10_3a_work_control";
    projectionAuthority: "exact_p10_2_replay_projection";
    changeMapping: Readonly<{
        open: "new";
        updated: "updated";
        resolved: "resolved";
        superseded: "superseded";
        rejected: "rejected";
        no_op: "unchanged";
    }>;
    newRule: "absent_to_open_with_open_delta_only";
    changedSinceLastRefreshRule: "adjudicated_delta_is_not_no_op";
    rankEligibilityRule: "accepted_open_only";
    candidateAuthority: "none";
    executionAuthority: "none";
}>;
export interface TaskMapLifecycleFacetsPredecessorV1 {
    ownerScopeDigest: string;
    generation: string;
    currentRefId: string;
    currentRefDigest: string;
    entryId: string;
    acceptedOriginBundleId: string;
    acceptedOriginReplayDigest: string;
    acceptedStateDigest: string;
    sidecarId: string;
    sidecarDigest: string;
    diffId: string;
    diffDigest: string;
    replayClosureDigest: string;
    sourceSnapshotDigest: string;
    sourceSemanticInputDigest: string;
    workControlArtifactId: string;
    workControlArtifactDigest: string;
    workControlOriginDigest: string;
    projectionRunId: string;
    projectionInputDigest: string;
    projectionDigest: string;
}
export interface TaskMapLifecycleFacetDeltaV1 {
    deltaId: string;
    previousState: TaskMapAdjudicatedPreviousLifecycleState;
    currentState: TaskMapAdjudicatedLifecycleState;
    adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
    adjudicationDigest: string;
    lifecycleEventId: string;
}
export interface TaskMapLifecycleFacetRowV1 {
    workId: string;
    rootId: string | null;
    projectionTaskIds: string[];
    lifecycle: TaskMapLifecycleFacet;
    change: TaskMapLifecycleFacetChange;
    changedSinceLastRefresh: boolean;
    newlyAcceptedOpen: boolean;
    rankEligible: boolean;
    lifecycleDelta: TaskMapLifecycleFacetDeltaV1;
}
export interface TaskMapLifecycleFacetsPrivacyV1 {
    sourceBodiesStored: false;
    candidateTokensStored: false;
    candidateTextStored: false;
    routeDataStored: false;
    rawOwnerIdentifiersStored: false;
    rawSourceObjectIdentifiersStored: false;
    rawSourceRevisionsStored: false;
    rawBiometricsStored: false;
    localPathsStored: false;
    connectorSecretsStored: false;
    executionStateStored: false;
}
export interface TaskMapLifecycleFacetsV1 {
    contractVersion: typeof TASKMAP_LIFECYCLE_FACETS_VERSION;
    artifactId: string;
    artifactDigest: string;
    originDigest: string;
    policyVersion: typeof TASKMAP_LIFECYCLE_FACETS_POLICY_VERSION;
    policyDigest: string;
    predecessor: TaskMapLifecycleFacetsPredecessorV1;
    rows: TaskMapLifecycleFacetRowV1[];
    privacy: TaskMapLifecycleFacetsPrivacyV1;
}
export interface BuiltTaskMapLifecycleFacets {
    artifact: TaskMapLifecycleFacetsV1;
    canonicalBytes: string;
}
export interface BuildTaskMapLifecycleFacetsInput extends TaskMapIdentityDedupeStoreRoots {
    projection: TaskMapProjectionV1;
}
/**
 * TEST-ONLY. The two P10.2 snapshots and P10.3a artifact must already have
 * been authenticated by their owning contracts. This input is deliberately
 * not a product authority boundary.
 */
export interface UnsafeBuildTaskMapLifecycleFacetsInputForTest {
    firstStore: TaskMapIdentityDedupeStoreSnapshotV1;
    secondStore: TaskMapIdentityDedupeStoreSnapshotV1;
    projection: TaskMapProjectionV1;
    workControl: TaskMapWorkControlDecisionV1;
}
/**
 * Product path. Input is snapshotted before the first await. The P10.2 head
 * must be identical before and after the real store-backed P10.3a build.
 */
export declare function buildTaskMapLifecycleFacets(input: BuildTaskMapLifecycleFacetsInput): Promise<BuiltTaskMapLifecycleFacets>;
/**
 * TEST-ONLY. This function is pure but trusts that the supplied P10.2
 * snapshots and P10.3a artifact were authenticated by their owning seams.
 * Standalone output validation is self-consistency only.
 */
export declare function unsafeBuildTaskMapLifecycleFacetsFromAuthenticatedFixturesForTest(input: UnsafeBuildTaskMapLifecycleFacetsInputForTest): BuiltTaskMapLifecycleFacets;
/**
 * Standalone validation proves schema/canonical self-consistency only.
 * Product authenticity requires buildTaskMapLifecycleFacets and its
 * authenticated P10.2/P10.3a reads.
 */
export declare function assertTaskMapLifecycleFacets(value: TaskMapLifecycleFacetsV1): TaskMapLifecycleFacetsV1;
export declare function taskMapLifecycleFacetsCanonicalBytes(value: TaskMapLifecycleFacetsV1): string;
