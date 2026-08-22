import { type VerifiedTaskMapRefreshRunBundle } from "./refresh-run-bundle.js";
import { type TaskMapRefreshCurrentAcceptedV1, type TaskMapRefreshCurrentRefV1, type TaskMapRefreshCurrentSnapshotV1 } from "./refresh-current-ref.js";
import type { TaskMapProjectionV1, TaskMapSourceSnapshotV1 } from "./types.js";
export declare const TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION: "taskmap-identity-dedupe-projection.v1";
export declare const TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION: "taskmap-identity-dedupe-diff.v1";
export declare const TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION: "taskmap-identity-dedupe-replay-closure.v1";
export declare const TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION: "taskmap-identity-dedupe-policy.1";
export declare const TASKMAP_IDENTITY_DECISION_PROOF_VERSION: "taskmap-identity-decision-proof.v1";
export declare const TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION: "taskmap-identity-dedupe-store-entry.v1";
export declare const TASKMAP_IDENTITY_DEDUPE_LIMITS_V1: Readonly<{
    maxCanonicalInputBytes: number;
    maxSuppliedIdentityProofBytes: number;
    maxCanonicalArtifactBytes: number;
    maxStoreEntryBytes: number;
    maxStoreHistoryBytes: number;
    maxStoreEntries: 4096;
    maxConcurrentWriters: 1;
    maxStagingEntries: 1;
    maxStagingBytes: number;
    maxNodes: 100000;
    maxDescriptors: 100000;
    maxDepth: 32;
    maxObjectKeys: 128;
    maxArrayLength: 8192;
    maxStringLength: 4096;
    maxAliases: 2048;
    maxWorkBindings: 2048;
    maxSessionLineage: 2048;
    maxLifecycleAdjudications: 2048;
    maxVariantsPerIdentity: 128;
    maxDelegationDepth: 8;
}>;
declare const STORE_PRIVACY: Readonly<{
    sourceBodiesStored: false;
    rawOwnerIdentifiersStored: false;
    rawSourceObjectIdentifiersStored: false;
    connectorSecretsStored: false;
    localPathsStored: false;
}>;
declare const PRIVACY: Readonly<{
    sourceBodiesStored: false;
    emailBodiesStored: false;
    participantDetailsStored: false;
    rawSourceObjectIdentifiersStored: false;
    rawSourceRevisionsStored: false;
    rawBiometricsStored: false;
    fullAgentSessionBodiesStored: false;
    localPathsStored: false;
    connectorSecretsStored: false;
}>;
export type TaskMapIdentityAliasKind = "work" | "session";
export type TaskMapSessionRole = "root" | "subagent" | "wrapper";
export type TaskMapProjectionWorkReferenceKind = "task" | "rejection";
export type TaskMapAdjudicatedLifecycleState = "open" | "resolved" | "superseded" | "rejected";
export type TaskMapAdjudicatedPreviousLifecycleState = "absent" | TaskMapAdjudicatedLifecycleState;
export type TaskMapAdjudicatedLifecycleDelta = "open" | "updated" | "resolved" | "superseded" | "rejected" | "no_op";
export interface TaskMapIdentityAliasV1 {
    identityKind: TaskMapIdentityAliasKind;
    canonicalSourceObjectKeyDigest: string;
    aliasSourceObjectKeyDigest: string;
}
export interface TaskMapProjectionWorkBindingV1 {
    projectionKind: TaskMapProjectionWorkReferenceKind;
    projectionId: string;
    sourceEnvelopeId: string;
}
export interface TaskMapSessionLineageV1 {
    sessionEnvelopeId: string;
    role: TaskMapSessionRole;
    workSourceObjectKeyDigest?: string;
    parentSessionEnvelopeId?: string;
}
export interface TaskMapLifecycleAdjudicationV1 {
    canonicalSourceObjectKeyDigest: string;
    previousState: TaskMapAdjudicatedPreviousLifecycleState;
    currentState: TaskMapAdjudicatedLifecycleState;
    previousSourceIdentityDigest?: string;
    currentSourceIdentityDigest: string;
    adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
}
export interface TaskMapIdentityDedupeReplayClosureV1 {
    contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_REPLAY_CLOSURE_VERSION;
    ownerScopeDigest: string;
    sourceSnapshotDigest: string;
    sourceSemanticInputDigest: string;
    projectionDigest: string;
    projectionRunId: string;
    projectionInputDigest: string;
    suppliedIdentityProofDigest: string;
    semanticRowsDigest: string;
}
export interface TaskMapIdentityDedupeOriginProofV1 {
    currentRefId: string;
    currentGeneration: string;
    acceptedOriginGeneration: string;
    acceptedStateDigest: string;
    bundleId: string;
    planId: string;
    batchId: string;
    sourceSnapshotProofId: string;
    acceptedOriginReplayDigest: string;
    replayClosureDigest: string;
}
export interface TaskMapIdentityProjectionReferenceV1 {
    kind: TaskMapProjectionWorkReferenceKind;
    id: string;
    projectionRowDigest: string;
}
export interface TaskMapIdentityDedupeWorkV1 {
    workId: string;
    canonicalSourceObjectKeyDigest: string;
    variantSourceObjectKeyDigests: string[];
    variantSourceIdentityDigests: string[];
    projectionReferences: TaskMapIdentityProjectionReferenceV1[];
    corroboratingSessionEventIds: string[];
    lifecycleEventId: string;
    lifecycleState: TaskMapAdjudicatedLifecycleState;
}
export interface TaskMapIdentityDedupeMeetingEventV1 {
    eventKind: "meeting";
    eventId: string;
    canonicalMeetingId: string;
    identityMethod: "calendar_event" | "bounded_fingerprint";
    reviewState: "resolved" | "needs_review";
    variantEnvelopeIds: string[];
}
export interface TaskMapIdentityDedupeSessionEventV1 {
    eventKind: "session";
    eventId: string;
    canonicalSourceObjectKeyDigest: string;
    corroboratesWorkId: string;
    identitySourceObjectKeyDigests: string[];
    variantSourceObjectKeyDigests: string[];
    variantEnvelopeIds: string[];
}
export interface TaskMapIdentityDedupeLifecycleEventV1 {
    eventKind: "work_lifecycle";
    eventId: string;
    workId: string;
    sourceIdentityDigest: string;
    lifecycleState: TaskMapAdjudicatedLifecycleState;
    adjudicationDigest: string;
}
export type TaskMapIdentityDedupeEventV1 = TaskMapIdentityDedupeMeetingEventV1 | TaskMapIdentityDedupeSessionEventV1 | TaskMapIdentityDedupeLifecycleEventV1;
export interface TaskMapIdentityDedupeLifecycleDeltaV1 {
    deltaId: string;
    workId: string;
    previousState: TaskMapAdjudicatedPreviousLifecycleState;
    currentState: TaskMapAdjudicatedLifecycleState;
    previousSourceIdentityDigest?: string;
    currentSourceIdentityDigest: string;
    adjudicatedDelta: TaskMapAdjudicatedLifecycleDelta;
    adjudicationDigest: string;
    lifecycleEventId: string;
}
export interface TaskMapIdentityDedupeRejectedVariantV1 {
    rejectionId: string;
    sourceObjectKeyDigest: string;
    envelopeId: string;
    reasonCode: "wrapper_transport_not_semantic_session";
    proofDigest: string;
}
export interface TaskMapIdentityDedupeProjectionV1 {
    contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION;
    sidecarId: string;
    ownerScopeDigest: string;
    policyVersion: typeof TASKMAP_IDENTITY_DEDUPE_POLICY_VERSION;
    suppliedIdentityProofDigest: string;
    sourceSnapshotId: string;
    sourceSnapshotDigest: string;
    projectionRunId: string;
    projectionDigest: string;
    origin: TaskMapIdentityDedupeOriginProofV1;
    replayClosure: TaskMapIdentityDedupeReplayClosureV1;
    works: TaskMapIdentityDedupeWorkV1[];
    events: TaskMapIdentityDedupeEventV1[];
    lifecycleDeltas: TaskMapIdentityDedupeLifecycleDeltaV1[];
    rejectedVariants: TaskMapIdentityDedupeRejectedVariantV1[];
    privacy: typeof PRIVACY;
}
export type TaskMapIdentityDedupeDiffRecordKind = "metadata" | "work" | "event" | "lifecycle_delta" | "rejected_variant";
export interface TaskMapIdentityDedupeDiffEntryV1 {
    kind: TaskMapIdentityDedupeDiffRecordKind;
    id: string;
    beforeDigest?: string;
    afterDigest?: string;
}
export interface TaskMapIdentityDedupeDiffV1 {
    contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_DIFF_VERSION;
    diffId: string;
    previousSidecarDigest: string;
    currentSidecarDigest: string;
    added: TaskMapIdentityDedupeDiffEntryV1[];
    removed: TaskMapIdentityDedupeDiffEntryV1[];
    changed: TaskMapIdentityDedupeDiffEntryV1[];
}
export interface BuildTaskMapIdentityDedupeProjectionInput {
    currentSnapshot: TaskMapRefreshCurrentSnapshotV1;
    acceptedOrigin: VerifiedTaskMapRefreshRunBundle;
    sourceSnapshot: TaskMapSourceSnapshotV1;
    projection: TaskMapProjectionV1;
    workBindings: TaskMapProjectionWorkBindingV1[];
    aliases: TaskMapIdentityAliasV1[];
    sessionLineage: TaskMapSessionLineageV1[];
    lifecycleAdjudications: TaskMapLifecycleAdjudicationV1[];
    previousSidecar: TaskMapIdentityDedupeProjectionV1 | null;
    previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle | null;
}
export interface BuildTaskMapIdentityDedupeProjectionFromStoreInput extends Omit<BuildTaskMapIdentityDedupeProjectionInput, "currentSnapshot" | "acceptedOrigin" | "previousSidecar" | "previousAcceptedOrigin"> {
    currentRoot: string;
    runRoot: string;
    sidecarRoot: string;
}
export interface TaskMapIdentityDedupeStoreRoots {
    currentRoot: string;
    runRoot: string;
    sidecarRoot: string;
}
export interface BackfillTaskMapIdentityDedupeProjectionInput extends BuildTaskMapIdentityDedupeProjectionFromStoreInput {
    targetGeneration: string;
}
export interface TaskMapIdentityDedupeGenerationObservationInput {
    currentRoot: string;
    runRoot: string;
    sidecarRoot: string;
    targetGeneration: string;
}
export interface BuiltTaskMapIdentityDedupeProjection {
    sidecar: TaskMapIdentityDedupeProjectionV1;
    diff: TaskMapIdentityDedupeDiffV1;
    sidecarCanonicalBytes: string;
    diffCanonicalBytes: string;
}
export interface TaskMapIdentityDedupeStorePredecessorV1 {
    generation: string;
    currentRefId: string;
    entryId: string;
}
export interface TaskMapIdentityDedupeSemanticHeadV1 {
    generation: string;
    currentRefId: string;
    sidecarId: string;
    sidecarDigest: string;
}
interface TaskMapIdentityDedupeStoreEntryBaseV1 {
    contractVersion: typeof TASKMAP_IDENTITY_DEDUPE_STORE_ENTRY_VERSION;
    entryId: string;
    ownerScopeDigest: string;
    generation: string;
    currentRefId: string;
    currentRefDigest: string;
    predecessor: TaskMapIdentityDedupeStorePredecessorV1 | null;
    semanticHead: TaskMapIdentityDedupeSemanticHeadV1 | null;
    privacy: typeof STORE_PRIVACY;
}
export interface TaskMapIdentityDedupeProjectionStoreEntryV1 extends TaskMapIdentityDedupeStoreEntryBaseV1 {
    entryKind: "projection";
    acceptedOriginBundleId: string;
    acceptedOriginReplayDigest: string;
    replayClosureDigest: string;
    sidecarId: string;
    sidecarDigest: string;
    diffId: string;
    diffDigest: string;
    sidecar: TaskMapIdentityDedupeProjectionV1;
    diff: TaskMapIdentityDedupeDiffV1;
}
export interface TaskMapIdentityDedupeObservationStoreEntryV1 extends TaskMapIdentityDedupeStoreEntryBaseV1 {
    entryKind: "no_accepted_origin" | "rollback_observed";
    publicationState: "no_accepted_origin" | "review_required";
    operation: TaskMapRefreshCurrentRefV1["operation"];
    accepted: TaskMapRefreshCurrentAcceptedV1 | null;
    rollback: TaskMapRefreshCurrentRefV1["rollback"] | null;
    reasonCode: "p10_1_has_no_accepted_origin" | "rollback_requires_reviewed_identity_adjudication";
}
export type TaskMapIdentityDedupeStoreEntryV1 = TaskMapIdentityDedupeProjectionStoreEntryV1 | TaskMapIdentityDedupeObservationStoreEntryV1;
export interface TaskMapIdentityDedupeStoreSnapshotV1 {
    entries: TaskMapIdentityDedupeStoreEntryV1[];
    canonicalByteLength: number;
    remainingByteCapacity: number;
}
export interface TaskMapIdentityDedupePublicationV1 {
    status: "published" | "already_published";
    entry: TaskMapIdentityDedupeStoreEntryV1;
    processCrashAtomic: true;
    powerLossDurabilityClaimed: false;
}
export interface BuiltAndPublishedTaskMapIdentityDedupeProjection extends BuiltTaskMapIdentityDedupeProjection {
    publication: TaskMapIdentityDedupePublicationV1;
}
export declare function taskMapIdentityDedupeUtf8WriteChunks(value: string): readonly [Buffer, Buffer];
export declare function assertTaskMapIdentityDedupeProjection(value: TaskMapIdentityDedupeProjectionV1): TaskMapIdentityDedupeProjectionV1;
export declare function assertTaskMapIdentityDedupeDiff(value: TaskMapIdentityDedupeDiffV1): TaskMapIdentityDedupeDiffV1;
export declare function taskMapIdentityDedupeProjectionCanonicalBytes(value: TaskMapIdentityDedupeProjectionV1): string;
export declare function taskMapIdentityDedupeDiffCanonicalBytes(value: TaskMapIdentityDedupeDiffV1): string;
export declare function taskMapIdentityDedupeReplayClosureDigest(sourceSnapshot: TaskMapSourceSnapshotV1, projection: TaskMapProjectionV1, suppliedProofs: Pick<BuildTaskMapIdentityDedupeProjectionInput, "aliases" | "workBindings" | "sessionLineage" | "lifecycleAdjudications">, reviewAttestationDigest: string): string;
/**
 * TEST-ONLY deterministic seam. It cannot establish filesystem origin,
 * freshness, or append-only history and therefore must never be wired into a
 * product/runtime path. Runtime callers must use the store-backed entrypoint.
 */
export declare function unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest(input: BuildTaskMapIdentityDedupeProjectionInput): BuiltTaskMapIdentityDedupeProjection;
export declare function assertTaskMapIdentityDedupeStoreEntry(value: TaskMapIdentityDedupeStoreEntryV1): TaskMapIdentityDedupeStoreEntryV1;
export declare function initializeTaskMapIdentityDedupeProjectionStore(roots: TaskMapIdentityDedupeStoreRoots, writeOptions?: TaskMapIdentityDedupeWriteOptions): Promise<void>;
/**
 * TEST-ONLY structural parser. It validates sidecar bytes and local history,
 * but cannot authenticate semantic rows against P10.1 accepted bundles.
 */
export declare function unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest(sidecarRoot: string): Promise<TaskMapIdentityDedupeStoreSnapshotV1>;
/**
 * Product/authenticated reader. Every semantic entry is checked against the
 * exact immutable P10.1 accepted bundle and deterministic replay digest.
 */
export declare function readTaskMapIdentityDedupeProjectionStore(roots: TaskMapIdentityDedupeStoreRoots): Promise<TaskMapIdentityDedupeStoreSnapshotV1>;
export interface TaskMapIdentityDedupeRecoveryOptions {
    /** Stable caller-owned token identifying this recovery attempt. */
    operationToken: string;
    /**
     * Explicit takeover of a recovery claim left by a crashed process. This is
     * accepted only together with externalExclusivityAsserted.
     */
    takeOverRecoveryClaim?: boolean;
    /** Assertion that an out-of-process mechanism has quiesced recoverers. */
    externalExclusivityAsserted?: boolean;
    /**
     * Explicit assertion that every writer is quiescent under an external
     * exclusivity mechanism. Recovery never infers process death.
     */
    abandonWriterClaims?: boolean;
}
export declare function recoverTaskMapIdentityDedupeProjectionStore(roots: TaskMapIdentityDedupeStoreRoots, options: TaskMapIdentityDedupeRecoveryOptions, writeOptions?: TaskMapIdentityDedupeWriteOptions): Promise<void>;
export type TaskMapIdentityDedupeFaultPoint = "before_initialize_directory_create" | "before_retry_revalidation" | "before_recovery_claim_create" | "before_recovery_stage_cleanup" | "before_writer_admission_create" | "before_writer_claim_create" | "before_stage_create" | "before_stage_journal_bind" | "after_stage_create" | "after_stage_partial_write" | "after_stage_sync" | "before_generation_cas" | "after_generation_parent_check" | "before_existing_stage_cleanup" | "after_generation_link" | "before_stage_cleanup";
export interface TaskMapIdentityDedupeWriteOptions {
    faultInjection?: (point: TaskMapIdentityDedupeFaultPoint) => void | Promise<void>;
}
export declare function assertTaskMapIdentityDedupeStoreAppendCapacity(committedBytes: number, candidateBytes: number, targetAlreadyExists?: boolean, committedEntries?: number): void;
/**
 * Store-backed read/verify/build path. It reads the exact authenticated
 * generation N-1 sidecar from the append-only P10.2 store; callers cannot
 * inject lifecycle history. It is intentionally non-publishing.
 */
export declare function buildTaskMapIdentityDedupeProjection(input: BuildTaskMapIdentityDedupeProjectionFromStoreInput): Promise<BuiltTaskMapIdentityDedupeProjection>;
/**
 * Production publication path. Each P10.1 generation receives exactly one
 * immutable sidecar+diff entry. The P10.1 current head is reread as the final
 * asynchronous operation before the no-replace generation link.
 */
export declare function buildAndPublishTaskMapIdentityDedupeProjection(input: BuildTaskMapIdentityDedupeProjectionFromStoreInput, options?: TaskMapIdentityDedupeWriteOptions): Promise<BuiltAndPublishedTaskMapIdentityDedupeProjection>;
/**
 * Explicit reviewed adoption path for an existing P10.1 history. Backfill is
 * strictly sequential from generation one and never skips a P10.1 generation.
 * The target ref must remain an exact member of the healthy append-only P10.1
 * history through the P10.2 generation CAS.
 */
export declare function backfillTaskMapIdentityDedupeProjectionGeneration(input: BackfillTaskMapIdentityDedupeProjectionInput, options?: TaskMapIdentityDedupeWriteOptions): Promise<BuiltAndPublishedTaskMapIdentityDedupeProjection>;
/**
 * Represents a valid P10.1 generation whose history has no accepted origin.
 * It advances only the authenticated generation chain and carries no semantic
 * projection.
 */
export declare function backfillTaskMapIdentityDedupeNoAcceptedGeneration(input: TaskMapIdentityDedupeGenerationObservationInput, options?: TaskMapIdentityDedupeWriteOptions): Promise<TaskMapIdentityDedupePublicationV1>;
/**
 * Records an exact P10.1 rollback tuple while preserving the last reviewed
 * semantic sidecar. Caller-authored identity and lifecycle decisions are not
 * accepted on this path.
 */
export declare function publishTaskMapIdentityDedupeRollbackObservation(input: TaskMapIdentityDedupeGenerationObservationInput, options?: TaskMapIdentityDedupeWriteOptions): Promise<TaskMapIdentityDedupePublicationV1>;
export declare const backfillTaskMapIdentityDedupeRollbackObservation: typeof publishTaskMapIdentityDedupeRollbackObservation;
export {};
