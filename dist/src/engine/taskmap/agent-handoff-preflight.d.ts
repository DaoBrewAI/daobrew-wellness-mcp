import { inspectTaskMapAgentHandoff, type TaskMapAgentHandoffManifestV1, type TaskMapAgentHandoffRuntimeRequestV1 } from "./agent-handoff-manifest.js";
import { type TaskMapExactProvenanceTaskProofV1, type TaskMapExactProvenanceV1 } from "./exact-provenance-companion.js";
import { inspectTaskMapLocalApprovalOperationalContext, type InspectTaskMapLocalApprovalInputV1, type TaskMapLocalOperationalSourceEvidenceV1, type TaskMapLocalQuartetBindingV1 } from "./local-approval-package.js";
export declare const TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION: "taskmap-agent-handoff-preflight.v1";
export declare const TASKMAP_AGENT_WORKSPACE_BINDING_VERSION: "taskmap-agent-workspace-binding.v1";
export declare const TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION: "taskmap-operational-criteria-assessment.v1";
export declare const TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION: "taskmap-operational-criteria-policy.1";
export declare const TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION: "taskmap-agent-handoff-preflight-summary.v1";
export declare const TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION: "taskmap-agent-adapter-handoff-preflight.v1";
export declare const TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION: "taskmap-agent-adapter-runtime-request.v1";
export declare const TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1: Readonly<{
    readonly maxArtifactBytes: number;
    readonly maxSummaryBytes: number;
    readonly maxTitleCharacters: 240;
    readonly maxVersionedContextRows: number;
    readonly maxCriteria: 12;
}>;
export interface TaskMapAgentWorkspaceBindingDraftV1 {
    projectId: string;
    repositoryIdentityDigest: string;
    workspaceRevisionDigest: string;
}
export interface TaskMapAgentWorkspaceBindingV1 {
    contractVersion: typeof TASKMAP_AGENT_WORKSPACE_BINDING_VERSION;
    bindingId: string;
    bindingDigest: string;
    projectId: string;
    repositoryIdentityDigest: string;
    workspaceRevisionDigest: string;
    capabilities: ["read", "write", "test"];
    localPathStored: false;
}
export type TaskMapOperationalCriterionState = "met" | "unmet" | "unknown";
export interface TaskMapOperationalCriterionAssessmentDraftV1 {
    criterionIndex: number;
    state: TaskMapOperationalCriterionState;
    evidenceDigest: string;
}
export interface BuildTaskMapOperationalCriteriaAssessmentInputV1 {
    handoffManifestDigest: string;
    operationalContextDigest: string;
    exactProvenanceDigest: string;
    workspaceBindingDigest: string;
    workspaceRevisionDigest: string;
    currentWorkArtifactDigest: string;
    taskId: string;
    rootId: string;
    doneDefinition: string[];
    criteria: TaskMapOperationalCriterionAssessmentDraftV1[];
}
export interface TaskMapOperationalCriteriaAssessmentV1 {
    contractVersion: typeof TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION;
    assessmentDigest: string;
    policyVersion: typeof TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION;
    handoffManifestDigest: string;
    operationalContextDigest: string;
    exactProvenanceDigest: string;
    workspaceBindingDigest: string;
    workspaceRevisionDigest: string;
    currentWorkArtifactDigest: string;
    taskId: string;
    rootId: string;
    doneDefinitionDigest: string;
    criteria: TaskMapOperationalCriterionAssessmentDraftV1[];
}
export interface InspectTaskMapAgentHandoffPreflightInputV1 extends InspectTaskMapLocalApprovalInputV1 {
    exactProvenance: TaskMapExactProvenanceV1;
    expectedProvenance: {
        sourceSnapshotDigest: string;
        adapterVersion: string;
        adapterPolicyDigest: string;
    };
    expectedOperational: {
        workspaceBindingDigest: string;
        criteriaAssessmentDigest: string;
    };
    workspaceBinding: TaskMapAgentWorkspaceBindingV1;
    criteriaAssessment: TaskMapOperationalCriteriaAssessmentV1;
}
export interface TaskMapAgentHandoffPreflightDependenciesV1 {
    inspectHandoff: typeof inspectTaskMapAgentHandoff;
    inspectOperationalContext: typeof inspectTaskMapLocalApprovalOperationalContext;
}
export interface TaskMapAgentHandoffPreflightV1 {
    contractVersion: typeof TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION;
    preflightId: string;
    preflightDigest: string;
    handoffManifestDigest: string;
    operationalExpectationDigest: string;
    localOwnerScopeDigest: string;
    quartet: TaskMapLocalQuartetBindingV1;
    task: {
        taskId: string;
        rootId: string;
        taskTitle: string;
        rootTitle: string;
        outcome: string;
        input: TaskMapAgentHandoffManifestV1["task"]["input"];
        predecessors: TaskMapAgentHandoffManifestV1["task"]["predecessors"];
        doneDefinition: string[];
        returnTarget: TaskMapAgentHandoffManifestV1["task"]["returnTarget"];
        routeNodeIds: string[];
    };
    provenance: {
        artifactDigest: string;
        producerVersion: string;
        producerPolicyDigest: string;
        expectationDigest: string;
        expectedSourceSnapshotDigest: string;
        expectedAdapterVersion: string;
        expectedAdapterPolicyDigest: string;
        taskProof: TaskMapExactProvenanceTaskProofV1;
        rootDerivationDigest: string;
        routeEdgeDerivationDigests: string[];
        sourceEvidenceDigest: string;
        versionedContext: Array<{
            pointerId: string;
            roles: TaskMapLocalOperationalSourceEvidenceV1["roles"];
            sourceKind: TaskMapLocalOperationalSourceEvidenceV1["sourceKind"];
            sourceVersion: string;
            evidenceDigest: string;
        }>;
        excludedUnversionedContextPointerIds: string[];
    };
    workspaceBinding: TaskMapAgentWorkspaceBindingV1;
    criteriaAssessment: TaskMapOperationalCriteriaAssessmentV1;
    runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
    startIdempotencyKey: string;
    boundary: {
        state: "validated_not_started";
        humanApprovalRequired: true;
        dispatchAuthorized: false;
        processStartAuthorized: false;
        codexTaskStartAuthorized: false;
        taskCreated: false;
        codexTaskId: null;
        sourceWritebackAuthorized: false;
        sourceCompletionAuthorized: false;
        outcomeVerificationAuthorized: false;
    };
    privacy: {
        sourceRowsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
        credentialsStored: false;
        participantIdentitiesStored: false;
        unboundedWorkspaceContextStored: false;
    };
}
export interface TaskMapAgentHandoffPreflightSummaryV1 {
    contractVersion: typeof TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION;
    state: "validated_not_started";
    preflightId: string;
    preflightDigest: string;
    handoffManifestDigest: string;
    packageId: string;
    packageDigest: string;
    taskId: string;
    rootId: string;
    exactProvenanceDigest: string;
    workspaceBindingDigest: string;
    criteriaAssessmentDigest: string;
    runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
    startIdempotencyKey: string;
    taskCreated: false;
    codexTaskId: null;
    processStartAuthorized: false;
    codexTaskStartAuthorized: false;
    dispatchAuthorized: false;
    sourceWritebackAuthorized: false;
    returnActionsAuthorized: false;
    sourceCompletionAuthorized: false;
    outcomeVerificationAuthorized: false;
}
export type TaskMapAgentHandoffAdapterV1 = "codex" | "claude_code";
export type TaskMapAgentAdapterOperationV1 = "create_fresh_codex_task" | "create_fresh_claude_code_session";
export interface InspectTaskMapAgentAdapterHandoffPreflightInputV1 {
    adapter: TaskMapAgentHandoffAdapterV1;
    preflightInput: InspectTaskMapAgentHandoffPreflightInputV1;
}
export interface TaskMapAgentAdapterRuntimeRequestV1 {
    contractVersion: typeof TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION;
    adapter: TaskMapAgentHandoffAdapterV1;
    operation: TaskMapAgentAdapterOperationV1;
    taskMode: "fresh";
    packageId: string;
    packageDigest: string;
    packagePayloadDigest: string;
    corePreflightId: string;
    corePreflightDigest: string;
    taskId: string;
    rootId: string;
    workspaceBindingDigest: string;
    requestDigest: string;
}
export interface TaskMapAgentAdapterHandoffPreflightV1 {
    contractVersion: typeof TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION;
    adapterPreflightId: string;
    adapterPreflightDigest: string;
    adapter: TaskMapAgentHandoffAdapterV1;
    packageId: string;
    packageDigest: string;
    corePreflightId: string;
    corePreflightDigest: string;
    taskId: string;
    rootId: string;
    workspaceBindingDigest: string;
    runtimeRequest: TaskMapAgentAdapterRuntimeRequestV1;
    startIdempotencyKey: string;
    boundary: {
        state: "validated_not_started";
        humanApprovalRequired: true;
        dispatchAuthorized: false;
        processStartAuthorized: false;
        adapterSessionStartAuthorized: false;
        taskCreated: false;
        adapterSessionId: null;
        sourceWritebackAuthorized: false;
        sourceCompletionAuthorized: false;
        outcomeVerificationAuthorized: false;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        credentialsStored: false;
        participantIdentitiesStored: false;
        unboundedWorkspaceContextStored: false;
    };
}
export declare function buildTaskMapAgentWorkspaceBinding(input: TaskMapAgentWorkspaceBindingDraftV1): TaskMapAgentWorkspaceBindingV1;
export declare function assertTaskMapAgentWorkspaceBinding(value: TaskMapAgentWorkspaceBindingV1): TaskMapAgentWorkspaceBindingV1;
export declare function buildTaskMapOperationalCriteriaAssessment(input: BuildTaskMapOperationalCriteriaAssessmentInputV1): TaskMapOperationalCriteriaAssessmentV1;
export declare function taskMapAgentHandoffPreflightDigest(preflight: Omit<TaskMapAgentHandoffPreflightV1, "preflightId" | "preflightDigest">): string;
export declare function inspectTaskMapAgentHandoffPreflight(input: InspectTaskMapAgentHandoffPreflightInputV1, dependencies?: Partial<TaskMapAgentHandoffPreflightDependenciesV1>): Promise<TaskMapAgentHandoffPreflightV1>;
export declare function buildTaskMapAgentHandoffPreflightSummary(preflight: TaskMapAgentHandoffPreflightV1, handoffManifest: TaskMapAgentHandoffManifestV1): TaskMapAgentHandoffPreflightSummaryV1;
export declare function assertTaskMapAgentAdapterHandoffPreflight(value: unknown): asserts value is TaskMapAgentAdapterHandoffPreflightV1;
export declare function inspectTaskMapAgentAdapterHandoffPreflight(input: InspectTaskMapAgentAdapterHandoffPreflightInputV1): Promise<TaskMapAgentAdapterHandoffPreflightV1>;
export interface InspectTaskMapAdoptedAgentAdapterPreflightInputV1 {
    adapter: TaskMapAgentHandoffAdapterV1;
    taskMapRoot: string;
    ownerRoot: string;
    expectedCandidateOwnerScopeDigest: string;
    taskId: string;
    workspaceBinding: TaskMapAgentWorkspaceBindingV1;
}
/**
 * Build one adapter proof from the exact post-approval owner state.
 *
 * The selected adopted task remains closed to its durable manual receipt. All
 * other current tasks must independently resolve to an exact supported source
 * envelope; unrelated source work cannot weaken the selected task proof.
 */
export declare function inspectTaskMapAdoptedAgentAdapterPreflight(input: InspectTaskMapAdoptedAgentAdapterPreflightInputV1): Promise<TaskMapAgentAdapterHandoffPreflightV1>;
