import { type TaskMapIdentityDedupeStoreRoots, type TaskMapIdentityDedupeStoreSnapshotV1 } from "./identity-dedupe-projection.js";
import type { BrainRelation, TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_WORK_CONTROL_DECISION_VERSION: "taskmap-work-control-decision.v1";
export declare const TASKMAP_WORK_CONTROL_POLICY_VERSION: "taskmap-work-control-policy.1";
/**
 * P10.3a is intentionally a read-only decision seam. Candidate evidence is
 * not present in the authenticated P10.2 v1 sidecar, so this contract cannot
 * manufacture REVIEW NEXT rows.
 */
export declare const TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE: "unavailable_in_p10_2_v1";
export declare const TASKMAP_WORK_CONTROL_LIMITS_V1: Readonly<{
    maxCanonicalInputBytes: number;
    maxCanonicalArtifactBytes: number;
    maxNodes: 100000;
    maxDescriptors: 100000;
    maxDepth: 32;
    maxObjectKeys: 128;
    maxArrayLength: 8192;
    maxStringLength: 4096;
    maxWorks: 2048;
    maxRelations: 8192;
}>;
export declare const TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER: readonly ["sourcePriority", "deadlinePressure", "dependencyImpact", "recurrence", "staleOpen", "evidenceStrength", "bodyBonus"];
export type TaskMapWorkControlRankFactor = (typeof TASKMAP_WORK_CONTROL_RANK_FACTOR_ORDER)[number];
export type TaskMapWorkControlRankReasonCode = "source_priority" | "deadline_pressure" | "dependency_impact" | "recurrence" | "stale_open" | "evidence_strength" | "body_context_not_causal";
export declare const TASKMAP_WORK_CONTROL_POLICY_V1: Readonly<{
    contractVersion: "taskmap-work-control-policy.1";
    scoreScale: "integer_basis_points";
    rounding: "nearest_integer_half_up";
    scoreCapBasisPoints: 10000;
    bodyBonusCapBasisPoints: 800;
    dependencyCountCap: 3;
    weightsBasisPoints: Readonly<{
        sourcePriority: 2500;
        deadlinePressure: 2500;
        dependencyImpact: 1500;
        recurrence: 1500;
        staleOpen: 1000;
        evidenceStrength: 1000;
    }>;
    legacyProjectionTotal: "ignored";
    canonicalAliasRank: "highest_recomputed_whole_row_then_code_point_task_id_then_row_digest";
    dependencyImpact: "recomputed_from_validated_normalized_dag";
    dependencyDirection: Readonly<{
        depends_on: "B_to_A_for_A_depends_on_B";
        blocks: "A_to_B_for_A_blocks_B";
        supersedes: "lifecycle_only_excluded_from_execution_dag";
    }>;
    tieBreak: "score_desc_then_code_point_work_id";
    candidateCoverage: "unavailable_in_p10_2_v1";
}>;
export declare const TASKMAP_WORK_CONTROL_POLICY_DIGEST: string;
export interface TaskMapWorkControlPredecessorV1 {
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
    replayClosureDigest: string;
    sourceSnapshotDigest: string;
    sourceSemanticInputDigest: string;
    projectionRunId: string;
    projectionInputDigest: string;
    projectionDigest: string;
    inputDomainBinding: "separate_authenticated_domains";
}
export type TaskMapWorkControlLifecycleDecision = "accepted_open" | "source_complete" | "superseded" | "rejected";
export interface TaskMapWorkControlWorkDecisionV1 {
    workId: string;
    lifecycleDecision: TaskMapWorkControlLifecycleDecision;
    rankEligible: boolean;
    rootId: string | null;
    projectionTaskRows: Array<{
        taskId: string;
        projectionRowDigest: string;
    }>;
    projectionRejectionRows: Array<{
        projectionReferenceId: string;
        projectionRowDigest: string;
    }>;
    projectionTaskIds: string[];
    projectionRejectionReferenceIds: string[];
    projectionRowDigests: string[];
}
export type TaskMapWorkControlRelationOutcome = "execution_dependency" | "lifecycle_only" | "ignored_non_control";
export interface TaskMapWorkControlRelationDecisionV1 {
    edgeId: string;
    relation: BrainRelation | "body_context_for";
    outcome: TaskMapWorkControlRelationOutcome;
    prerequisiteWorkId?: string;
    dependentWorkId?: string;
    supersedingWorkId?: string;
    supersededWorkId?: string;
}
export interface TaskMapWorkControlExecutionDependencyV1 {
    prerequisiteWorkId: string;
    dependentWorkId: string;
    edgeId: string;
}
export interface TaskMapWorkControlAliasRankProofV1 {
    taskId: string;
    projectionRowDigest: string;
    scoreBasisPoints: number;
    factorBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
    contributionBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
    reasonCodes: TaskMapWorkControlRankReasonCode[];
}
export interface TaskMapAcceptedOpenTaskRankV1 extends TaskMapWorkControlAliasRankProofV1 {
    rank: number;
}
export interface TaskMapWorkControlRankDecisionV1 {
    rank: number;
    workId: string;
    representativeProjectionTaskId: string;
    representativeProjectionRowDigest: string;
    scoreBasisPoints: number;
    factorBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
    contributionBasisPoints: Record<TaskMapWorkControlRankFactor, number>;
    reasonCodes: TaskMapWorkControlRankReasonCode[];
    aliasRankProofRows: TaskMapWorkControlAliasRankProofV1[];
}
export interface TaskMapWorkControlDecisionPrivacyV1 {
    sourceBodiesStored: false;
    candidateTextStored: false;
    rawOwnerIdentifiersStored: false;
    rawSourceObjectIdentifiersStored: false;
    rawSourceRevisionsStored: false;
    rawBiometricsStored: false;
    localPathsStored: false;
    connectorSecretsStored: false;
    executionStateStored: false;
}
export interface TaskMapWorkControlDecisionV1 {
    contractVersion: typeof TASKMAP_WORK_CONTROL_DECISION_VERSION;
    artifactId: string;
    artifactDigest: string;
    originDigest: string;
    policyVersion: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
    policyDigest: string;
    predecessor: TaskMapWorkControlPredecessorV1;
    candidateCoverage: typeof TASKMAP_WORK_CONTROL_CANDIDATE_COVERAGE;
    reviewNext: [];
    workDecisions: TaskMapWorkControlWorkDecisionV1[];
    relationDecisions: TaskMapWorkControlRelationDecisionV1[];
    executionDependencies: TaskMapWorkControlExecutionDependencyV1[];
    rankedAcceptedOpen: TaskMapWorkControlRankDecisionV1[];
    privacy: TaskMapWorkControlDecisionPrivacyV1;
}
export interface BuiltTaskMapWorkControlDecision {
    artifact: TaskMapWorkControlDecisionV1;
    canonicalBytes: string;
}
export interface BuildTaskMapWorkControlDecisionInput extends TaskMapIdentityDedupeStoreRoots {
    projection: TaskMapProjectionV1;
}
export interface UnsafeBuildTaskMapWorkControlDecisionInputForTest {
    firstStore: TaskMapIdentityDedupeStoreSnapshotV1;
    secondStore: TaskMapIdentityDedupeStoreSnapshotV1;
    projection: TaskMapProjectionV1;
}
/**
 * TEST-ONLY selected-entry probe. The preceding rows are deliberately treated
 * as already authenticated by P10.2 so a retained-history regression can
 * prove P10.3a never reclones or recanonicalizes the whole 64 MiB store.
 */
export declare function unsafeSelectedTaskMapWorkControlEntryIdForTest(store: TaskMapIdentityDedupeStoreSnapshotV1): string;
export declare function rankAcceptedOpenProjectionTasks(projection: TaskMapProjectionV1): TaskMapAcceptedOpenTaskRankV1[];
export declare function buildTaskMapWorkControlDecision(input: BuildTaskMapWorkControlDecisionInput): Promise<BuiltTaskMapWorkControlDecision>;
/**
 * TEST-ONLY product-wiring seam. Authentication remains the real public P10.2
 * reader; the sole hook permits a deterministic temporary-filesystem swap
 * after its first successful read.
 */
export declare function unsafeBuildTaskMapWorkControlDecisionWithAfterFirstAuthenticatedReadForTest(input: BuildTaskMapWorkControlDecisionInput, afterFirstAuthenticatedRead: () => void | Promise<void>): Promise<BuiltTaskMapWorkControlDecision>;
/**
 * TEST-ONLY root-receipt exerciser. It performs no Task Map reads or writes;
 * the callback exists only to deterministically replace a temporary test root
 * between receipt acquisition and revalidation.
 */
export declare function unsafeExerciseTaskMapWorkControlRootReceiptForTest(rootsInput: TaskMapIdentityDedupeStoreRoots, between: () => void | Promise<void>): Promise<void>;
/**
 * TEST-ONLY. This bypasses P10.2 filesystem/authentication and must never be
 * used as a product reader. It preserves the same exact projection, lifecycle,
 * row-bijection, head-stability, DAG, rank, and privacy decisions.
 */
export declare function unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest(input: UnsafeBuildTaskMapWorkControlDecisionInputForTest): BuiltTaskMapWorkControlDecision;
/**
 * Self-contained semantic/canonical validator. It does not authenticate the
 * predecessor against P10.1/P10.2 storage. Product trust requires rebuilding
 * through buildTaskMapWorkControlDecision and its authenticated store reads.
 */
export declare function assertTaskMapWorkControlDecision(value: TaskMapWorkControlDecisionV1): TaskMapWorkControlDecisionV1;
export declare function taskMapWorkControlDecisionCanonicalBytes(value: TaskMapWorkControlDecisionV1): string;
