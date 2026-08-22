"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1 = exports.TASKMAP_AGENT_HANDOFF_LIMITS_V1 = exports.TASKMAP_DRY_RUN_RETURN_PLAN_VERSION = exports.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION = exports.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION = void 0;
exports.inspectTaskMapAgentHandoff = inspectTaskMapAgentHandoff;
const harness_js_1 = require("./harness.js");
const local_approval_package_js_1 = require("./local-approval-package.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION = "taskmap-agent-handoff-manifest.v1";
exports.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION = "taskmap-agent-handoff-summary.v1";
exports.TASKMAP_DRY_RUN_RETURN_PLAN_VERSION = "taskmap-dry-run-return-plan.v1";
exports.TASKMAP_AGENT_HANDOFF_LIMITS_V1 = Object.freeze({
    maxManifestBytes: local_approval_package_js_1.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes,
    maxSummaryBytes: 16 * 1024,
});
const AUTHORIZATION_ID = /^tmauthorization_([a-f0-9]{64})$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const PREPARATION_RECEIPT_ID = /^tmpreparationreceipt_([a-f0-9]{64})$/;
const RETURN_PLAN_DOMAIN = "taskmap-dry-run-return-plan.1";
const ROUTE_IDEMPOTENCY_DOMAIN = "taskmap-codex-route-idempotency.1";
const MANIFEST_DOMAIN = "taskmap-agent-handoff-manifest.1";
exports.TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1 = Object.freeze({
    adapter: "codex_task",
    taskMode: "fresh",
    model: "gpt-5.6-sol",
    reasoningEffort: "ultra",
    serviceTier: "priority",
    fastMode: true,
});
function fail(message) {
    throw new Error(`Task Map agent handoff unavailable: ${message}`);
}
function assertBoundDigestId(id, digest, pattern, label) {
    if (pattern.exec(id)?.[1] !== digest) {
        fail(`${label} does not match its digest`);
    }
}
function buildDryRunReturnPlan(primaryTarget) {
    const core = {
        contractVersion: exports.TASKMAP_DRY_RUN_RETURN_PLAN_VERSION,
        state: "dry_run",
        primaryTarget: { ...primaryTarget },
        actions: [],
        perActionApprovalRequired: true,
        sourceVersionCheckRequired: true,
        outboxRequiredBeforeMutation: true,
        aggregateStatus: "not_started",
        sourceMutationAuthorized: false,
    };
    const returnPlanDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: RETURN_PLAN_DOMAIN,
        ...core,
    });
    return {
        ...core,
        returnPlanId: `tmreturnplan_${returnPlanDigest}`,
        returnPlanDigest,
    };
}
function buildSummary(manifest) {
    const summary = {
        contractVersion: exports.TASKMAP_AGENT_HANDOFF_SUMMARY_VERSION,
        status: "handoff_ready",
        handoffManifestId: manifest.handoffManifestId,
        handoffManifestDigest: manifest.handoffManifestDigest,
        boundPackageDigest: manifest.preparation.packageDigest,
        routeIdempotencyKey: manifest.routeIdempotencyKey,
        runtimeRequest: { ...manifest.runtimeRequest },
        returnPlan: {
            mode: "dry_run_only",
            returnActionsAuthorized: false,
            sourceWritebackAuthorized: false,
        },
        codexTaskCreated: false,
        codexTaskId: null,
        codexTaskStartAuthorized: false,
        dispatchAuthorized: false,
    };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(summary), "utf8")
        > exports.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxSummaryBytes) {
        fail("handoff summary exceeds the byte limit");
    }
    return summary;
}
async function inspectTaskMapAgentHandoff(input) {
    const { inspection, response } = await (0, local_approval_package_js_1.inspectTaskMapLocalApproval)(input);
    if (response.status !== "package_ready"
        || response.approvalRecorded !== true
        || response.approvalAuthorizationId === null
        || response.approvalAuthorizationDigest === null
        || response.packageId === null
        || response.packageDigest === null
        || response.preparationReceiptId === null
        || response.deliveryStatus !== "not_started"
        || response.taskStarted !== false
        || response.noDispatch !== true
        || response.sourceCompletion !== false
        || response.outcomeVerified !== false) {
        fail("the exact M3 package is not ready");
    }
    if (response.taskId !== inspection.task.taskId
        || response.rootId !== inspection.task.rootId
        || response.runId !== inspection.quartet.runId
        || response.localOwnerScopeDigest !== inspection.localOwnerScopeDigest
        || response.prepareIdempotencyKey !== inspection.prepareIdempotencyKey
        || response.proofDigest !== inspection.proofDigest
        || response.projectionFileDigest !== inspection.quartet.projectionFileDigest
        || response.currentnessFileDigest !== inspection.quartet.currentnessFileDigest
        || response.currentWorkFileDigest !== inspection.quartet.currentWorkFileDigest
        || response.bodyFileDigest !== inspection.quartet.bodyFileDigest
        || inspection.dispatchAuthorized !== false
        || inspection.sourceWritebackAuthorized !== false
        || inspection.codexTaskStartAuthorized !== false
        || inspection.sourceCompletionAuthorized !== false
        || inspection.outcomeVerificationAuthorized !== false) {
        fail("the prepared response does not match the current inspection");
    }
    assertBoundDigestId(response.approvalAuthorizationId, response.approvalAuthorizationDigest, AUTHORIZATION_ID, "approval authorization id");
    assertBoundDigestId(response.packageId, response.packageDigest, PACKAGE_ID, "package id");
    const preparationReceiptDigest = PREPARATION_RECEIPT_ID.exec(response.preparationReceiptId)?.[1];
    if (preparationReceiptDigest === undefined) {
        fail("preparation receipt id is invalid");
    }
    const runtimeRequest = { ...exports.TASKMAP_AGENT_HANDOFF_RUNTIME_REQUEST_V1 };
    const dryRunReturnPlan = buildDryRunReturnPlan(inspection.task.returnTarget);
    const routeIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ROUTE_IDEMPOTENCY_DOMAIN,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        proofDigest: inspection.proofDigest,
        packageDigest: response.packageDigest,
        runtimeRequest,
        returnPlanDigest: dryRunReturnPlan.returnPlanDigest,
        operation: "create_fresh_codex_task",
    });
    const core = {
        contractVersion: exports.TASKMAP_AGENT_HANDOFF_MANIFEST_VERSION,
        localOwnerScopeDigest: inspection.localOwnerScopeDigest,
        proofDigest: inspection.proofDigest,
        preparation: {
            prepareIdempotencyKey: inspection.prepareIdempotencyKey,
            approvalAuthorizationId: response.approvalAuthorizationId,
            approvalAuthorizationDigest: response.approvalAuthorizationDigest,
            packageId: response.packageId,
            packageDigest: response.packageDigest,
            preparationReceiptId: response.preparationReceiptId,
            preparationReceiptDigest,
        },
        quartet: { ...inspection.quartet },
        task: {
            ...inspection.task,
            input: {
                ...inspection.task.input,
                contextPointerIds: [...inspection.task.input.contextPointerIds],
            },
            predecessors: inspection.task.predecessors.map((row) => ({ ...row })),
            doneDefinition: [...inspection.task.doneDefinition],
            returnTarget: { ...inspection.task.returnTarget },
            routeNodeIds: [...inspection.task.routeNodeIds],
        },
        runtimeRequest,
        routeIdempotencyKey,
        dryRunReturnPlan,
        boundary: {
            state: "prepared_not_dispatched",
            dispatchAuthorized: false,
            processStartAuthorized: false,
            codexTaskStartAuthorized: false,
            taskCreated: false,
            codexTaskId: null,
            deliveryStatus: "not_started",
            returnActionExecutionAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
            ownerIdentityStored: false,
            credentialsStored: false,
            participantIdentitiesStored: false,
            unboundedWorkspaceContextStored: false,
        },
    };
    const handoffManifestDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: MANIFEST_DOMAIN,
        ...core,
    });
    const manifest = {
        ...core,
        handoffManifestId: `tmhandoff_${handoffManifestDigest}`,
        handoffManifestDigest,
    };
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(manifest).length > 0) {
        fail("handoff manifest violates the privacy boundary");
    }
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(manifest), "utf8")
        > exports.TASKMAP_AGENT_HANDOFF_LIMITS_V1.maxManifestBytes) {
        fail("handoff manifest exceeds the byte limit");
    }
    return {
        manifest,
        summary: buildSummary(manifest),
    };
}
