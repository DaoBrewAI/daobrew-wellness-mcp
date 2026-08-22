import { type InspectTaskMapLocalApprovalInputV1, type TaskMapLocalApprovalTaskV1, type TaskMapLocalQuartetBindingV1 } from "./local-approval-package.js";
export declare const TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION: "taskmap-agent-handoff-manifest.v1";
export declare const TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION: "taskmap-agent-handoff-summary.v1";
export declare const TASKMAP_DRY_RUN_RETURN_PLAN_VERSION: "taskmap-dry-run-return-plan.v1";
export declare const TASKMAP_AGENT_HANDOFF_LIMITS_V1: Readonly<{
    readonly maxManifestBytes: number;
    readonly maxSummaryBytes: number;
}>;
export interface TaskMapAgentHandoffRuntimeRequestV1 {
    adapter: "codex_task";
    taskMode: "fresh";
    model: "gpt-5.6-sol";
    reasoningEffort: "ultra";
    serviceTier: "priority";
    fastMode: true;
}
export interface TaskMapDryRunReturnPlanV1 {
    contractVersion: typeof TASKMAP_DRY_RUN_RETURN_PLAN_VERSION;
    returnPlanId: string;
    returnPlanDigest: string;
    state: "dry_run";
    primaryTarget: TaskMapLocalApprovalTaskV1["returnTarget"];
    actions: [];
    perActionApprovalRequired: true;
    sourceVersionCheckRequired: true;
    outboxRequiredBeforeMutation: true;
    aggregateStatus: "not_started";
    sourceMutationAuthorized: false;
}
export interface TaskMapAgentHandoffManifestV1 {
    contractVersion: typeof TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION;
    handoffManifestId: string;
    handoffManifestDigest: string;
    localOwnerScopeDigest: string;
    proofDigest: string;
    preparation: {
        prepareIdempotencyKey: string;
        approvalAuthorizationId: string;
        approvalAuthorizationDigest: string;
        packageId: string;
        packageDigest: string;
        preparationReceiptId: string;
        preparationReceiptDigest: string;
    };
    quartet: TaskMapLocalQuartetBindingV1;
    task: TaskMapLocalApprovalTaskV1;
    runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
    routeIdempotencyKey: string;
    dryRunReturnPlan: TaskMapDryRunReturnPlanV1;
    boundary: {
        state: "prepared_not_dispatched";
        dispatchAuthorized: false;
        processStartAuthorized: false;
        codexTaskStartAuthorized: false;
        taskCreated: false;
        codexTaskId: null;
        deliveryStatus: "not_started";
        returnActionExecutionAuthorized: false;
        sourceCompletionAuthorized: false;
        outcomeVerificationAuthorized: false;
    };
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
        ownerIdentityStored: false;
        credentialsStored: false;
        participantIdentitiesStored: false;
        unboundedWorkspaceContextStored: false;
    };
}
export interface TaskMapAgentHandoffSummaryV1 {
    contractVersion: typeof TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION;
    status: "handoff_ready";
    handoffManifestId: string;
    handoffManifestDigest: string;
    boundPackageDigest: string;
    routeIdempotencyKey: string;
    runtimeRequest: TaskMapAgentHandoffRuntimeRequestV1;
    returnPlan: {
        mode: "dry_run_only";
        returnActionsAuthorized: false;
        sourceWritebackAuthorized: false;
    };
    codexTaskCreated: false;
    codexTaskId: null;
    codexTaskStartAuthorized: false;
    dispatchAuthorized: false;
}
export interface TaskMapAgentHandoffInspectionV1 {
    manifest: TaskMapAgentHandoffManifestV1;
    summary: TaskMapAgentHandoffSummaryV1;
}
export type InspectTaskMapAgentHandoffInputV1 = InspectTaskMapLocalApprovalInputV1;
export declare const TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1: Readonly<TaskMapAgentHandoffRuntimeRequestV1>;
export declare function inspectTaskMapAgentHandoff(input: InspectTaskMapAgentHandoffInputV1): Promise<TaskMapAgentHandoffInspectionV1>;
