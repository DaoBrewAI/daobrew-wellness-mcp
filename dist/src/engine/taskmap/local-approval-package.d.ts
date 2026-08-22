import { type TaskMapProjectionV1, type TaskMapTask } from "./types.js";
import { type TaskMapBodySignalAssessmentV1 } from "./native-refresh-service.js";
import { type TaskMapNativeAgentSessionEpisodeAdmissionV1, type TaskMapNativeAgentSessionTaskProofV1 } from "./native-current-work-successor.js";
export declare const TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION: "taskmap-local-approval-inspection.v1";
export declare const TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION: "taskmap-local-approval-authorization.v1";
export declare const TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION: "taskmap-local-execution-package.v1";
export declare const TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION: "taskmap-local-preparation-receipt.v1";
export declare const TASKMAP_LOCAL_APPROVAL_RESPONSE_VERSION: "taskmap-local-approval-response.v1";
export declare const TASKMAP_LOCAL_OPERATIONAL_CONTEXT_VERSION: "taskmap-local-operational-context.v1";
export declare const TASKMAP_READY_PROOF_TARGETS_FILENAME: "taskmap-ready-proof-targets.v1.json";
export declare const TASKMAP_READY_FRONTIER_FILENAME: "ready-frontier.v1.json";
export declare const TASKMAP_LOCAL_APPROVAL_LIMITS_V1: Readonly<{
    readonly maxProjectionBytes: number;
    readonly maxCurrentnessBytes: number;
    readonly maxCurrentWorkBytes: number;
    readonly maxBodyBytes: number;
    readonly maxBodyAssessmentBytes: number;
    readonly maxReadyProofTargetsBytes: number;
    readonly maxReadyFrontierBytes: number;
    readonly maxArtifactBytes: number;
    readonly maxRouteNodes: 6;
    readonly maxDoneItems: 12;
    readonly maxContextPointers: 128;
    readonly maxTextCharacters: 4096;
}>;
export declare const TASKMAP_FIXED_ARTIFACT_NAMES: Readonly<{
    readonly projection: "taskmap-projection.v1.json";
    readonly currentness: "taskmap-currentness.v1.json";
    readonly currentWork: "taskmap-current-work.v1.json";
    readonly body: "taskmap-body-context.v1.json";
    readonly bodyAssessment: "taskmap-body-signal-assessment.v1.json";
}>;
export interface TaskMapLocalQuartetBindingV1 {
    runId: string;
    inputDigest: string;
    generatedAt: string;
    projectionDigest: string;
    projectionFileDigest: string;
    currentnessFileDigest: string;
    currentWorkFileDigest: string;
    bodyFileDigest: string;
    bodyAssessmentFileDigest: string;
    bodyAssessmentArtifactDigest: string;
    physiologicalSnapshotDigest: string;
    currentWorkArtifactDigest: string;
}
export interface TaskMapLocalBodySignalContextV1 {
    assessmentArtifactDigest: string;
    physiologicalSnapshotDigest: string;
    relationship: "body_informed" | "repeated_association" | "not_established";
    signal: TaskMapBodySignalAssessmentV1["signal"];
    coverage: TaskMapBodySignalAssessmentV1["coverage"];
    observedSignalDates: string[];
    matchedWorkDates: string[];
    matchedWorkSources: string[];
    signalSummary: string;
    relevanceSummary: string;
    boundary: TaskMapBodySignalAssessmentV1["boundary"];
}
export interface TaskMapLocalApprovalTaskV1 {
    taskId: string;
    rootId: string;
    outcome: string;
    input: {
        summary: string;
        contextPointerIds: string[];
    };
    predecessors: Array<{
        taskId: string;
        relation: "depends_on" | "blocks";
        reviewState: string;
        openState: string;
    }>;
    doneDefinition: string[];
    returnTarget: {
        state: "source_owned";
        pointerId: string;
    } | {
        state: "source_return";
        pointerId: string;
    } | {
        state: "personal_fork";
        pointerId: string;
    } | {
        state: "user_destination_required";
    };
    routeNodeIds: string[];
    sourceEvidence: TaskMapLocalOperationalSourceEvidenceV1[];
    bodySignal: TaskMapLocalBodySignalContextV1;
}
export interface TaskMapLocalOperationalSourceEvidenceV1 {
    pointerId: string;
    roles: Array<"task_home" | "context" | "return_target">;
    sourceKind: TaskMapProjectionV1["sources"][number]["sourceKind"];
    sourceVersion: string | null;
    authority: TaskMapProjectionV1["sources"][number]["authority"];
    syncMode: TaskMapProjectionV1["sources"][number]["syncMode"];
    capabilities: TaskMapProjectionV1["sources"][number]["capabilities"];
    citations: Array<{
        eventId: string;
        sourceRefHash: string;
        occurredAt: string;
        extractionConfidence: number;
    }>;
}
export interface TaskMapLocalOperationalContextV1 {
    contractVersion: typeof TASKMAP_LOCAL_OPERATIONAL_CONTEXT_VERSION;
    quartet: TaskMapLocalQuartetBindingV1;
    task: {
        taskId: string;
        rootId: string;
        taskTitle: string;
        rootTitle: string;
        reviewState: TaskMapTask["reviewState"];
        openState: TaskMapTask["openState"];
        sourceStatus: TaskMapTask["sourceStatus"];
        authority: TaskMapTask["authority"];
        taskHomePointerId: string;
    };
    sourceEvidence: TaskMapLocalOperationalSourceEvidenceV1[];
    contextDigest: string;
}
export interface TaskMapLocalApprovalInspectionV1 {
    contractVersion: typeof TASKMAP_LOCAL_APPROVAL_INSPECTION_VERSION;
    localOwnerScopeDigest: string;
    proofDigest: string;
    prepareIdempotencyKey: string;
    quartet: TaskMapLocalQuartetBindingV1;
    task: TaskMapLocalApprovalTaskV1;
    readyForLocalApproval: true;
    currentWorkApprovalGranted: false;
    currentWorkExecutable: false;
    authorizationScope: "prepare_local_package_only";
    dispatchAuthorized: false;
    sourceWritebackAuthorized: false;
    codexTaskStartAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
}
export interface TaskMapLocalApprovalAuthorizationV1 {
    contractVersion: typeof TASKMAP_LOCAL_APPROVAL_AUTHORIZATION_VERSION;
    approvalAuthorizationId: string;
    approvalAuthorizationDigest: string;
    localOwnerScopeDigest: string;
    idempotencyKey: string;
    requestDigest: string;
    authorizedAt: string;
    proofDigest: string;
    quartet: TaskMapLocalQuartetBindingV1;
    taskId: string;
    rootId: string;
    approvalRecorded: true;
    currentWorkApprovalGranted: false;
    currentWorkExecutable: false;
    authorizationScope: "prepare_local_package_only";
    dispatchAuthorized: false;
    sourceWritebackAuthorized: false;
    codexTaskStartAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
}
export interface TaskMapLocalExecutionPackageV1 {
    contractVersion: typeof TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION;
    packageId: string;
    packageDigest: string;
    approvalAuthorizationId: string;
    approvalAuthorizationDigest: string;
    localOwnerScopeDigest: string;
    proofDigest: string;
    quartet: TaskMapLocalQuartetBindingV1;
    task: TaskMapLocalApprovalTaskV1;
    executionBoundary: {
        state: "prepared_not_started";
        approvalRecorded: true;
        deliveryStatus: "not_started";
        taskStarted: false;
        taskExecuted: false;
        dispatchAuthorized: false;
        sourceWritebackAuthorized: false;
        codexTaskStartAuthorized: false;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
        ownerIdentityStored: false;
    };
}
export interface TaskMapLocalPreparationReceiptV1 {
    contractVersion: typeof TASKMAP_LOCAL_PREPARATION_RECEIPT_VERSION;
    preparationReceiptId: string;
    preparationReceiptDigest: string;
    packageId: string;
    packageDigest: string;
    approvalAuthorizationId: string;
    approvalAuthorizationDigest: string;
    localOwnerScopeDigest: string;
    proofDigest: string;
    preparedAt: string;
    preparationStatus: "package_ready";
    deliveryStatus: "not_started";
    taskStarted: false;
    taskExecuted: false;
    noDispatch: true;
    sourceMutationAttempted: false;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface TaskMapLocalApprovalResponseV1 {
    contractVersion: typeof TASKMAP_LOCAL_APPROVAL_RESPONSE_VERSION;
    status: "ready_for_approval" | "package_ready";
    taskId: string;
    rootId: string;
    runId: string;
    localOwnerScopeDigest: string;
    prepareIdempotencyKey: string;
    projectionFileDigest: string;
    currentnessFileDigest: string;
    currentWorkFileDigest: string;
    bodyFileDigest: string;
    bodyAssessmentFileDigest: string;
    bodyAssessmentArtifactDigest: string;
    physiologicalSnapshotDigest: string;
    proofDigest: string;
    approvalRecorded: boolean;
    approvalAuthorizationId: string | null;
    approvalAuthorizationDigest: string | null;
    packageId: string | null;
    packageDigest: string | null;
    preparationReceiptId: string | null;
    artifactAccess: {
        revealDirectoryPath: string;
        packagePath: string;
        receiptPath: string;
    } | null;
    deliveryStatus: "not_started";
    taskStarted: false;
    noDispatch: true;
    sourceCompletion: false;
    outcomeVerified: false;
}
export interface InspectTaskMapLocalApprovalInputV1 {
    taskMapRoot: string;
    ownerRoot: string;
    expectedOwnerScopeDigest?: string;
    taskId?: string;
}
export interface InspectTaskMapLocalLifecycleContextInputV1 {
    taskMapRoot: string;
    ownerRoot: string;
}
export interface TaskMapLocalLifecycleContextV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapLocalCurrentnessV1;
    localOwnerScopeDigest: string;
    projectionFileDigest: string;
    currentnessFileDigest: string;
}
export interface ApproveAndPrepareTaskMapLocalPackageInputV1 {
    taskMapRoot: string;
    ownerRoot: string;
    executionRoot: string;
    expectedOwnerScopeDigest: string;
    expectedProofDigest: string;
    taskId: string;
    idempotencyKey: string;
    authorizedAt: string;
}
export interface ApproveAndPrepareTaskMapLocalPackageResultV1 {
    response: TaskMapLocalApprovalResponseV1;
    authorization: TaskMapLocalApprovalAuthorizationV1;
    package: TaskMapLocalExecutionPackageV1;
    receipt: TaskMapLocalPreparationReceiptV1;
    replayed: boolean;
}
export interface TaskMapLocalCurrentnessV1 {
    contractVersion: "taskmap-native-currentness-gate.v1";
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    taskDispositions: Array<{
        taskId: string;
        disposition: "current" | "needs_lifecycle_review";
    }>;
}
export declare function deriveTaskMapLocalOwnerScopeDigest(ownerRoot: string): Promise<string>;
export declare function inspectTaskMapLocalApproval(input: InspectTaskMapLocalApprovalInputV1): Promise<{
    inspection: TaskMapLocalApprovalInspectionV1;
    response: TaskMapLocalApprovalResponseV1;
}>;
/**
 * Exact lifecycle context for overlay, external completion, and Reopen.
 * Deliberately reads no current-work, approval, body, package, session,
 * artifact, or report state.
 */
export declare function inspectTaskMapLocalLifecycleContext(input: InspectTaskMapLocalLifecycleContextInputV1): Promise<TaskMapLocalLifecycleContextV1>;
export declare function inspectTaskMapLocalApprovalOperationalContext(input: InspectTaskMapLocalApprovalInputV1): Promise<{
    inspection: TaskMapLocalApprovalInspectionV1;
    response: TaskMapLocalApprovalResponseV1;
    projection: TaskMapProjectionV1;
    currentness: TaskMapLocalCurrentnessV1;
    agentSessionEpisode: TaskMapNativeAgentSessionEpisodeAdmissionV1 | null;
    agentSessionTaskProof: TaskMapNativeAgentSessionTaskProofV1 | null;
    context: TaskMapLocalOperationalContextV1;
}>;
export declare function approveAndPrepareTaskMapLocalPackage(input: ApproveAndPrepareTaskMapLocalPackageInputV1): Promise<ApproveAndPrepareTaskMapLocalPackageResultV1>;
