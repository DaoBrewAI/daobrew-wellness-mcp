"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1 = exports.TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION = exports.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION = exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION = exports.TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION = exports.TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION = exports.TASKMAP_AGENT_WORKSPACE_BINDING_VERSION = exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION = void 0;
exports.buildTaskMapAgentWorkspaceBinding = buildTaskMapAgentWorkspaceBinding;
exports.assertTaskMapAgentWorkspaceBinding = assertTaskMapAgentWorkspaceBinding;
exports.buildTaskMapOperationalCriteriaAssessment = buildTaskMapOperationalCriteriaAssessment;
exports.taskMapAgentHandoffPreflightDigest = taskMapAgentHandoffPreflightDigest;
exports.inspectTaskMapAgentHandoffPreflight = inspectTaskMapAgentHandoffPreflight;
exports.buildTaskMapAgentHandoffPreflightSummary = buildTaskMapAgentHandoffPreflightSummary;
exports.assertTaskMapAgentAdapterHandoffPreflight = assertTaskMapAgentAdapterHandoffPreflight;
exports.inspectTaskMapAgentAdapterHandoffPreflight = inspectTaskMapAgentAdapterHandoffPreflight;
exports.inspectTaskMapAdoptedAgentAdapterPreflight = inspectTaskMapAdoptedAgentAdapterPreflight;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const harness_js_1 = require("./harness.js");
const agent_handoff_manifest_js_1 = require("./agent-handoff-manifest.js");
const exact_provenance_companion_js_1 = require("./exact-provenance-companion.js");
const local_approval_package_js_1 = require("./local-approval-package.js");
const source_contracts_js_1 = require("./source-contracts.js");
const native_candidate_acceptance_js_1 = require("./native-candidate-acceptance.js");
const strategy_source_adapter_js_1 = require("./strategy-source-adapter.js");
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION = "taskmap-agent-handoff-preflight.v1";
exports.TASKMAP_AGENT_WORKSPACE_BINDING_VERSION = "taskmap-agent-workspace-binding.v1";
exports.TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION = "taskmap-operational-criteria-assessment.v1";
exports.TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION = "taskmap-operational-criteria-policy.1";
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION = "taskmap-agent-handoff-preflight-summary.v1";
exports.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION = "taskmap-agent-adapter-handoff-preflight.v1";
exports.TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION = "taskmap-agent-adapter-runtime-request.v1";
exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1 = Object.freeze({
    maxArtifactBytes: local_approval_package_js_1.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxArtifactBytes,
    maxSummaryBytes: 16 * 1024,
    maxTitleCharacters: 240,
    maxVersionedContextRows: local_approval_package_js_1.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxContextPointers + 2,
    maxCriteria: local_approval_package_js_1.TASKMAP_LOCAL_APPROVAL_LIMITS_V1.maxDoneItems,
});
const DIGEST = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const PROJECT_ID = /^tmproject_[a-f0-9]{64}$/;
const WORKSPACE_ID = /^tmworkspace_[a-f0-9]{64}$/;
const WORKSPACE_BINDING_DOMAIN = "taskmap-agent-workspace-binding.1";
const CRITERIA_ASSESSMENT_DOMAIN = "taskmap-operational-criteria-assessment.1";
const START_IDEMPOTENCY_DOMAIN = "taskmap-agent-start-idempotency.1";
const PREFLIGHT_DOMAIN = "taskmap-agent-handoff-preflight.1";
const HANDOFF_MANIFEST_DOMAIN = "taskmap-agent-handoff-manifest.1";
const SOURCE_EVIDENCE_DOMAIN = "taskmap-agent-handoff-source-evidence.1";
const EXPECTED_PROVENANCE_DOMAIN = "taskmap-agent-handoff-expected-provenance.1";
const EXPECTED_OPERATIONAL_DOMAIN = "taskmap-agent-handoff-expected-operational-inputs.1";
const PREFLIGHT_ID = /^tmhandoffpreflight_([a-f0-9]{64})$/;
const HANDOFF_MANIFEST_ID = /^tmhandoff_([a-f0-9]{64})$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const ADAPTER_RUNTIME_REQUEST_DOMAIN = "taskmap-agent-adapter-runtime-request.1";
const ADAPTER_PREFLIGHT_DOMAIN = "taskmap-agent-adapter-handoff-preflight.1";
const ADAPTER_START_IDEMPOTENCY_DOMAIN = "taskmap-agent-adapter-start-idempotency.1";
const ADAPTER_PREFLIGHT_ID = /^tmadapterpreflight_([a-f0-9]{64})$/;
const OPERATIONAL_RELATIONS = new Set([
    "advances",
    "depends_on",
    "blocks",
    "supersedes",
]);
function fail(message) {
    throw new Error(`Task Map agent handoff preflight unavailable: ${message}`);
}
function assertPlainObject(value, label) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        fail(`${label} must be a plain object`);
    }
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} fields are invalid`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !DIGEST.test(value)) {
        fail(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertVersion(value, label) {
    if (typeof value !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
        fail(`${label} is invalid`);
    }
}
function sameCanonical(left, right) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(left) === (0, source_contracts_js_1.taskMapContractCanonicalJson)(right);
}
function cloneWorkspaceBinding(binding) {
    return {
        ...binding,
        capabilities: [...binding.capabilities],
    };
}
function buildTaskMapAgentWorkspaceBinding(input) {
    assertPlainObject(input, "workspace binding input");
    assertExactKeys(input, ["projectId", "repositoryIdentityDigest", "workspaceRevisionDigest"], "workspace binding input");
    if (!PROJECT_ID.test(input.projectId))
        fail("projectId is not opaque");
    assertDigest(input.repositoryIdentityDigest, "repositoryIdentityDigest");
    assertDigest(input.workspaceRevisionDigest, "workspaceRevisionDigest");
    const core = {
        contractVersion: exports.TASKMAP_AGENT_WORKSPACE_BINDING_VERSION,
        projectId: input.projectId,
        repositoryIdentityDigest: input.repositoryIdentityDigest,
        workspaceRevisionDigest: input.workspaceRevisionDigest,
        capabilities: ["read", "write", "test"],
        localPathStored: false,
    };
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: WORKSPACE_BINDING_DOMAIN,
        ...core,
    });
    return {
        ...core,
        bindingId: `tmworkspace_${bindingDigest}`,
        bindingDigest,
    };
}
function assertTaskMapAgentWorkspaceBinding(value) {
    assertPlainObject(value, "workspace binding");
    assertExactKeys(value, [
        "contractVersion",
        "bindingId",
        "bindingDigest",
        "projectId",
        "repositoryIdentityDigest",
        "workspaceRevisionDigest",
        "capabilities",
        "localPathStored",
    ], "workspace binding");
    if (value.contractVersion !== exports.TASKMAP_AGENT_WORKSPACE_BINDING_VERSION
        || typeof value.bindingId !== "string"
        || !WORKSPACE_ID.test(value.bindingId)
        || value.localPathStored !== false
        || !Array.isArray(value.capabilities)
        || !sameCanonical(value.capabilities, ["read", "write", "test"])) {
        fail("workspace binding boundary is invalid");
    }
    assertDigest(value.bindingDigest, "workspace bindingDigest");
    const rebuilt = buildTaskMapAgentWorkspaceBinding({
        projectId: value.projectId,
        repositoryIdentityDigest: value.repositoryIdentityDigest,
        workspaceRevisionDigest: value.workspaceRevisionDigest,
    });
    if (!sameCanonical(rebuilt, value)) {
        fail("workspace binding digest is invalid");
    }
    return rebuilt;
}
function validateCriteria(criteria, doneDefinition) {
    if (!Array.isArray(criteria)
        || criteria.length === 0
        || criteria.length !== doneDefinition.length
        || criteria.length > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxCriteria) {
        fail("criteria do not exhaust the done definition");
    }
    const normalized = criteria.map((criterion, index) => {
        assertPlainObject(criterion, `criterion ${index}`);
        assertExactKeys(criterion, ["criterionIndex", "state", "evidenceDigest"], `criterion ${index}`);
        if (criterion.criterionIndex !== index
            || (criterion.state !== "met"
                && criterion.state !== "unmet"
                && criterion.state !== "unknown")) {
            fail("criterion ordering or state is invalid");
        }
        assertDigest(criterion.evidenceDigest, `criterion ${index} evidenceDigest`);
        return { ...criterion };
    });
    return normalized;
}
function buildTaskMapOperationalCriteriaAssessment(input) {
    assertPlainObject(input, "criteria assessment input");
    assertExactKeys(input, [
        "handoffManifestDigest",
        "operationalContextDigest",
        "exactProvenanceDigest",
        "workspaceBindingDigest",
        "workspaceRevisionDigest",
        "currentWorkArtifactDigest",
        "taskId",
        "rootId",
        "doneDefinition",
        "criteria",
    ], "criteria assessment input");
    assertDigest(input.handoffManifestDigest, "handoffManifestDigest");
    assertDigest(input.operationalContextDigest, "operationalContextDigest");
    assertDigest(input.exactProvenanceDigest, "exactProvenanceDigest");
    assertDigest(input.workspaceBindingDigest, "workspaceBindingDigest");
    assertDigest(input.workspaceRevisionDigest, "workspaceRevisionDigest");
    assertDigest(input.currentWorkArtifactDigest, "currentWorkArtifactDigest");
    if (!TASK_ID.test(input.taskId) || !ROOT_ID.test(input.rootId)) {
        fail("criteria assessment task identity is invalid");
    }
    if (!Array.isArray(input.doneDefinition)
        || input.doneDefinition.length === 0
        || input.doneDefinition.length
            > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxCriteria) {
        fail("criteria assessment done definition is invalid");
    }
    const criteria = validateCriteria(input.criteria, input.doneDefinition);
    const core = {
        contractVersion: exports.TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION,
        policyVersion: exports.TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION,
        handoffManifestDigest: input.handoffManifestDigest,
        operationalContextDigest: input.operationalContextDigest,
        exactProvenanceDigest: input.exactProvenanceDigest,
        workspaceBindingDigest: input.workspaceBindingDigest,
        workspaceRevisionDigest: input.workspaceRevisionDigest,
        currentWorkArtifactDigest: input.currentWorkArtifactDigest,
        taskId: input.taskId,
        rootId: input.rootId,
        doneDefinitionDigest: (0, source_contracts_js_1.taskMapContractDigest)(input.doneDefinition),
        criteria,
    };
    return {
        ...core,
        assessmentDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: CRITERIA_ASSESSMENT_DOMAIN,
            ...core,
        }),
    };
}
function assertTaskMapOperationalCriteriaAssessment(value, expected) {
    assertPlainObject(value, "criteria assessment");
    assertExactKeys(value, [
        "contractVersion",
        "assessmentDigest",
        "policyVersion",
        "handoffManifestDigest",
        "operationalContextDigest",
        "exactProvenanceDigest",
        "workspaceBindingDigest",
        "workspaceRevisionDigest",
        "currentWorkArtifactDigest",
        "taskId",
        "rootId",
        "doneDefinitionDigest",
        "criteria",
    ], "criteria assessment");
    if (value.contractVersion !== exports.TASKMAP_OPERATIONAL_CRITERIA_ASSESSMENT_VERSION
        || value.policyVersion !== exports.TASKMAP_OPERATIONAL_CRITERIA_POLICY_VERSION) {
        fail("criteria assessment policy is unsupported");
    }
    assertDigest(value.assessmentDigest, "assessmentDigest");
    const rebuilt = buildTaskMapOperationalCriteriaAssessment({
        ...expected,
        criteria: value.criteria,
    });
    if (!sameCanonical(rebuilt, value)) {
        fail("criteria assessment is stale or invalid");
    }
    return rebuilt;
}
function versionedContext(rows) {
    const versioned = [];
    const excluded = [];
    for (const row of rows) {
        if (row.sourceVersion === null || row.sourceVersion.trim().length === 0) {
            excluded.push(row.pointerId);
            continue;
        }
        const core = {
            pointerId: row.pointerId,
            roles: [...row.roles],
            sourceKind: row.sourceKind,
            sourceVersion: row.sourceVersion,
        };
        versioned.push({
            ...core,
            evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                domain: SOURCE_EVIDENCE_DOMAIN,
                ...core,
                authority: row.authority,
                syncMode: row.syncMode,
                capabilities: row.capabilities,
                citations: row.citations,
            }),
        });
    }
    if (versioned.length
        > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxVersionedContextRows) {
        fail("versioned source evidence exceeds the bound");
    }
    return {
        versioned: versioned.sort((a, b) => a.pointerId.localeCompare(b.pointerId)),
        excluded: excluded.sort(),
    };
}
function terminalPredecessor(row) {
    return (row.reviewState === "source_complete"
        && row.openState === "completed");
}
function routeEdgeProofs(manifest, provenance, taskProofDigest) {
    const route = manifest.task.routeNodeIds;
    const directManualEnvelope = provenance.sourceSnapshot.envelopes.find((envelope) => (envelope.envelopeId === provenance.tasks.find((task) => task.proofDigest === taskProofDigest)?.sourceEnvelopeId
        && envelope.sourceKind === "manual"
        && envelope.objectType === "authoritative_task"));
    const directRoot = provenance.roots.find((root) => root.rootId === manifest.task.rootId);
    if (route.length === 2
        && route[0] === manifest.task.rootId
        && route[1] === manifest.task.taskId
        && directManualEnvelope !== undefined
        && directRoot?.currentTaskIds.includes(manifest.task.taskId)
        && directRoot.currentTaskProofDigests.includes(taskProofDigest)) {
        return [];
    }
    const derivations = [];
    for (let index = 0; index < route.length - 1; index += 1) {
        const left = route[index];
        const right = route[index + 1];
        const matches = provenance.edges.filter((edge) => (OPERATIONAL_RELATIONS.has(edge.relation)
            && edge.from === left
            && edge.to === right
            && edge.executionEvidence === "exact_task_source"
            && edge.exactTaskProofDigests.includes(taskProofDigest)));
        if (matches.length !== 1) {
            fail("route is not uniquely backed by exact task-source evidence");
        }
        derivations.push(matches[0].derivationDigest);
    }
    return derivations;
}
function taskMapAgentHandoffPreflightDigest(preflight) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: PREFLIGHT_DOMAIN,
        ...preflight,
    });
}
async function inspectTaskMapAgentHandoffPreflight(input, dependencies = {}) {
    assertPlainObject(input, "preflight input");
    const allowed = [
        "taskMapRoot",
        "ownerRoot",
        ...(input.expectedOwnerScopeDigest === undefined
            ? [] : ["expectedOwnerScopeDigest"]),
        ...(input.taskId === undefined ? [] : ["taskId"]),
        "exactProvenance",
        "expectedProvenance",
        "expectedOperational",
        "workspaceBinding",
        "criteriaAssessment",
    ];
    assertExactKeys(input, allowed, "preflight input");
    const localInput = {
        taskMapRoot: input.taskMapRoot,
        ownerRoot: input.ownerRoot,
        ...(input.expectedOwnerScopeDigest === undefined
            ? {}
            : { expectedOwnerScopeDigest: input.expectedOwnerScopeDigest }),
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    };
    const readHandoff = dependencies.inspectHandoff ?? agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff;
    const readOperationalContext = dependencies.inspectOperationalContext
        ?? local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext;
    const handoff = await readHandoff(localInput);
    const local = await readOperationalContext(localInput);
    if (local.response.status !== "package_ready"
        || local.response.approvalAuthorizationId === null
        || local.response.approvalAuthorizationDigest === null
        || local.response.packageId === null
        || local.response.packageDigest === null
        || local.response.preparationReceiptId === null
        || !sameCanonical(handoff.manifest.quartet, local.inspection.quartet)
        || !sameCanonical(handoff.manifest.task, local.inspection.task)
        || handoff.manifest.preparation.prepareIdempotencyKey
            !== local.response.prepareIdempotencyKey
        || handoff.manifest.preparation.approvalAuthorizationId
            !== local.response.approvalAuthorizationId
        || handoff.manifest.preparation.approvalAuthorizationDigest
            !== local.response.approvalAuthorizationDigest
        || handoff.manifest.preparation.packageId
            !== local.response.packageId
        || handoff.manifest.preparation.packageDigest
            !== local.response.packageDigest
        || handoff.manifest.preparation.preparationReceiptId
            !== local.response.preparationReceiptId
        || handoff.manifest.proofDigest !== local.response.proofDigest) {
        fail("M4A and operational context do not share one exact package");
    }
    if (handoff.manifest.localOwnerScopeDigest
        !== local.inspection.localOwnerScopeDigest
        || local.context.contextDigest.length !== 64
        || local.context.task.taskId !== handoff.manifest.task.taskId
        || local.context.task.rootId !== handoff.manifest.task.rootId) {
        fail("operational context is not bound to the M4A handoff");
    }
    if (local.context.task.reviewState !== "accepted"
        || local.context.task.openState !== "open"
        || (local.context.task.sourceStatus !== "open"
            && local.context.task.sourceStatus !== "in_progress")) {
        fail("task is terminal or no longer operational");
    }
    if (local.context.task.taskTitle.trim().length === 0
        || local.context.task.rootTitle.trim().length === 0
        || local.context.task.taskTitle.length
            > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxTitleCharacters
        || local.context.task.rootTitle.length
            > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxTitleCharacters) {
        fail("task or root title is not readable");
    }
    if (handoff.manifest.task.predecessors.some((row) => !terminalPredecessor(row))) {
        fail("task has a blocking nonterminal predecessor");
    }
    assertPlainObject(input.expectedProvenance, "expected provenance");
    assertExactKeys(input.expectedProvenance, [
        "sourceSnapshotDigest",
        "adapterVersion",
        "adapterPolicyDigest",
    ], "expected provenance");
    assertDigest(input.expectedProvenance.sourceSnapshotDigest, "expected provenance sourceSnapshotDigest");
    assertVersion(input.expectedProvenance.adapterVersion, "expected provenance adapterVersion");
    assertDigest(input.expectedProvenance.adapterPolicyDigest, "expected provenance adapterPolicyDigest");
    const expectationDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: EXPECTED_PROVENANCE_DOMAIN,
        sourceSnapshotDigest: input.expectedProvenance.sourceSnapshotDigest,
        adapterVersion: input.expectedProvenance.adapterVersion,
        adapterPolicyDigest: input.expectedProvenance.adapterPolicyDigest,
    });
    assertPlainObject(input.expectedOperational, "expected operational inputs");
    assertExactKeys(input.expectedOperational, [
        "workspaceBindingDigest",
        "criteriaAssessmentDigest",
    ], "expected operational inputs");
    assertDigest(input.expectedOperational.workspaceBindingDigest, "expected operational workspaceBindingDigest");
    assertDigest(input.expectedOperational.criteriaAssessmentDigest, "expected operational criteriaAssessmentDigest");
    const operationalExpectationDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: EXPECTED_OPERATIONAL_DOMAIN,
        workspaceBindingDigest: input.expectedOperational.workspaceBindingDigest,
        criteriaAssessmentDigest: input.expectedOperational.criteriaAssessmentDigest,
    });
    const provenance = (0, exact_provenance_companion_js_1.assertTaskMapExactProvenance)(input.exactProvenance, {
        projection: local.projection,
        currentness: local.currentness,
        currentnessFileDigest: local.inspection.quartet.currentnessFileDigest,
        expectedSourceSnapshotDigest: input.expectedProvenance.sourceSnapshotDigest,
        expectedAdapterVersion: input.expectedProvenance.adapterVersion,
        expectedAdapterPolicyDigest: input.expectedProvenance.adapterPolicyDigest,
    });
    const taskProof = provenance.tasks.find((row) => row.taskId === handoff.manifest.task.taskId);
    const rootProof = provenance.roots.find((row) => row.rootId === handoff.manifest.task.rootId);
    if (taskProof === undefined
        || rootProof === undefined
        || !rootProof.currentTaskIds.includes(taskProof.taskId)
        || !rootProof.currentTaskProofDigests.includes(taskProof.proofDigest)
        || taskProof.pointerId !== local.context.task.taskHomePointerId) {
        fail("selected task lacks exact task/root provenance");
    }
    const routeEdgeDerivationDigests = routeEdgeProofs(handoff.manifest, provenance, taskProof.proofDigest);
    const contexts = versionedContext(local.context.sourceEvidence);
    const homeContext = contexts.versioned.find((row) => row.pointerId === taskProof.pointerId);
    if (homeContext === undefined
        || homeContext.sourceVersion !== taskProof.sourceRevision) {
        fail("exact task source is absent from versioned context");
    }
    const workspaceBinding = assertTaskMapAgentWorkspaceBinding(input.workspaceBinding);
    if (workspaceBinding.bindingDigest
        !== input.expectedOperational.workspaceBindingDigest) {
        fail("workspace binding does not match the external registry expectation");
    }
    const criteriaAssessment = assertTaskMapOperationalCriteriaAssessment(input.criteriaAssessment, {
        handoffManifestDigest: handoff.manifest.handoffManifestDigest,
        operationalContextDigest: local.context.contextDigest,
        exactProvenanceDigest: provenance.artifactDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest: local.inspection.quartet.currentWorkArtifactDigest,
        taskId: handoff.manifest.task.taskId,
        rootId: handoff.manifest.task.rootId,
        doneDefinition: handoff.manifest.task.doneDefinition,
    });
    if (criteriaAssessment.assessmentDigest
        !== input.expectedOperational.criteriaAssessmentDigest) {
        fail("criteria assessment does not match the external checker expectation");
    }
    if (criteriaAssessment.criteria.some((row) => row.state === "unknown")) {
        fail("unfinishedness is unknown");
    }
    if (!criteriaAssessment.criteria.some((row) => row.state === "unmet")) {
        fail("task is already satisfied");
    }
    const sourceEvidenceDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: SOURCE_EVIDENCE_DOMAIN,
        expectationDigest,
        exactTaskProofDigest: taskProof.proofDigest,
        rootDerivationDigest: rootProof.derivationDigest,
        routeEdgeDerivationDigests,
        versionedContext: contexts.versioned,
        excludedUnversionedContextPointerIds: contexts.excluded,
    });
    const runtimeRequest = { ...handoff.manifest.runtimeRequest };
    const startIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: START_IDEMPOTENCY_DOMAIN,
        handoffManifestDigest: handoff.manifest.handoffManifestDigest,
        operationalContextDigest: local.context.contextDigest,
        exactProvenanceDigest: provenance.artifactDigest,
        expectationDigest,
        operationalExpectationDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
        sourceEvidenceDigest,
        runtimeRequest,
        operation: "create_fresh_codex_task",
    });
    const core = {
        contractVersion: exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION,
        handoffManifestDigest: handoff.manifest.handoffManifestDigest,
        operationalExpectationDigest,
        localOwnerScopeDigest: handoff.manifest.localOwnerScopeDigest,
        quartet: { ...handoff.manifest.quartet },
        task: {
            taskId: handoff.manifest.task.taskId,
            rootId: handoff.manifest.task.rootId,
            taskTitle: local.context.task.taskTitle,
            rootTitle: local.context.task.rootTitle,
            outcome: handoff.manifest.task.outcome,
            input: {
                ...handoff.manifest.task.input,
                contextPointerIds: [
                    ...handoff.manifest.task.input.contextPointerIds,
                ],
            },
            predecessors: handoff.manifest.task.predecessors.map((row) => ({ ...row })),
            doneDefinition: [...handoff.manifest.task.doneDefinition],
            returnTarget: { ...handoff.manifest.task.returnTarget },
            routeNodeIds: [...handoff.manifest.task.routeNodeIds],
        },
        provenance: {
            artifactDigest: provenance.artifactDigest,
            producerVersion: provenance.producer.version,
            producerPolicyDigest: provenance.producer.policyDigest,
            expectationDigest,
            expectedSourceSnapshotDigest: input.expectedProvenance.sourceSnapshotDigest,
            expectedAdapterVersion: input.expectedProvenance.adapterVersion,
            expectedAdapterPolicyDigest: input.expectedProvenance.adapterPolicyDigest,
            taskProof: { ...taskProof },
            rootDerivationDigest: rootProof.derivationDigest,
            routeEdgeDerivationDigests,
            sourceEvidenceDigest,
            versionedContext: contexts.versioned,
            excludedUnversionedContextPointerIds: contexts.excluded,
        },
        workspaceBinding: cloneWorkspaceBinding(workspaceBinding),
        criteriaAssessment: {
            ...criteriaAssessment,
            criteria: criteriaAssessment.criteria.map((row) => ({ ...row })),
        },
        runtimeRequest,
        startIdempotencyKey,
        boundary: {
            state: "validated_not_started",
            humanApprovalRequired: true,
            dispatchAuthorized: false,
            processStartAuthorized: false,
            codexTaskStartAuthorized: false,
            taskCreated: false,
            codexTaskId: null,
            sourceWritebackAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
        privacy: {
            sourceRowsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
            credentialsStored: false,
            participantIdentitiesStored: false,
            unboundedWorkspaceContextStored: false,
        },
    };
    const preflightDigest = taskMapAgentHandoffPreflightDigest(core);
    const preflight = {
        ...core,
        preflightId: `tmhandoffpreflight_${preflightDigest}`,
        preflightDigest,
    };
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(preflight).length > 0) {
        fail("preflight violates the privacy boundary");
    }
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(preflight), "utf8")
        > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
        fail("preflight exceeds the byte limit");
    }
    return preflight;
}
function buildTaskMapAgentHandoffPreflightSummary(preflight, handoffManifest) {
    assertPlainObject(preflight, "preflight summary source");
    assertExactKeys(preflight, [
        "contractVersion",
        "preflightId",
        "preflightDigest",
        "handoffManifestDigest",
        "operationalExpectationDigest",
        "localOwnerScopeDigest",
        "quartet",
        "task",
        "provenance",
        "workspaceBinding",
        "criteriaAssessment",
        "runtimeRequest",
        "startIdempotencyKey",
        "boundary",
        "privacy",
    ], "preflight summary source");
    assertDigest(preflight.preflightDigest, "preflight digest");
    if (preflight.contractVersion !== exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_VERSION
        || PREFLIGHT_ID.exec(preflight.preflightId)?.[1]
            !== preflight.preflightDigest) {
        fail("preflight summary source identity is invalid");
    }
    const { preflightId: _preflightId, preflightDigest: _preflightDigest, ...preflightCore } = preflight;
    if (taskMapAgentHandoffPreflightDigest(preflightCore)
        !== preflight.preflightDigest) {
        fail("preflight summary source digest is invalid");
    }
    assertPlainObject(preflight.boundary, "preflight boundary");
    assertExactKeys(preflight.boundary, [
        "state",
        "humanApprovalRequired",
        "dispatchAuthorized",
        "processStartAuthorized",
        "codexTaskStartAuthorized",
        "taskCreated",
        "codexTaskId",
        "sourceWritebackAuthorized",
        "sourceCompletionAuthorized",
        "outcomeVerificationAuthorized",
    ], "preflight boundary");
    if (preflight.boundary.state !== "validated_not_started"
        || preflight.boundary.humanApprovalRequired !== true
        || preflight.boundary.dispatchAuthorized !== false
        || preflight.boundary.processStartAuthorized !== false
        || preflight.boundary.codexTaskStartAuthorized !== false
        || preflight.boundary.taskCreated !== false
        || preflight.boundary.codexTaskId !== null
        || preflight.boundary.sourceWritebackAuthorized !== false
        || preflight.boundary.sourceCompletionAuthorized !== false
        || preflight.boundary.outcomeVerificationAuthorized !== false) {
        fail("preflight summary source is not safely unfinished");
    }
    assertPlainObject(handoffManifest, "preflight handoff manifest");
    assertExactKeys(handoffManifest, [
        "contractVersion",
        "handoffManifestId",
        "handoffManifestDigest",
        "localOwnerScopeDigest",
        "proofDigest",
        "preparation",
        "quartet",
        "task",
        "runtimeRequest",
        "routeIdempotencyKey",
        "dryRunReturnPlan",
        "boundary",
        "privacy",
    ], "preflight handoff manifest");
    assertDigest(handoffManifest.handoffManifestDigest, "handoff manifest digest");
    if (handoffManifest.contractVersion !== "taskmap-agent-handoff-manifest.v1"
        || HANDOFF_MANIFEST_ID.exec(handoffManifest.handoffManifestId)?.[1]
            !== handoffManifest.handoffManifestDigest
        || handoffManifest.handoffManifestDigest
            !== preflight.handoffManifestDigest
        || handoffManifest.localOwnerScopeDigest
            !== preflight.localOwnerScopeDigest) {
        fail("preflight and M4A handoff identities do not match");
    }
    const { handoffManifestId: _handoffManifestId, handoffManifestDigest: _handoffManifestDigest, ...handoffManifestCore } = handoffManifest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({
        domain: HANDOFF_MANIFEST_DOMAIN,
        ...handoffManifestCore,
    }) !== handoffManifest.handoffManifestDigest) {
        fail("M4A handoff manifest digest is invalid");
    }
    assertPlainObject(handoffManifest.boundary, "M4A handoff boundary");
    assertExactKeys(handoffManifest.boundary, [
        "state",
        "dispatchAuthorized",
        "processStartAuthorized",
        "codexTaskStartAuthorized",
        "taskCreated",
        "codexTaskId",
        "deliveryStatus",
        "returnActionExecutionAuthorized",
        "sourceCompletionAuthorized",
        "outcomeVerificationAuthorized",
    ], "M4A handoff boundary");
    if (handoffManifest.boundary.state !== "prepared_not_dispatched"
        || handoffManifest.boundary.dispatchAuthorized !== false
        || handoffManifest.boundary.processStartAuthorized !== false
        || handoffManifest.boundary.codexTaskStartAuthorized !== false
        || handoffManifest.boundary.taskCreated !== false
        || handoffManifest.boundary.codexTaskId !== null
        || handoffManifest.boundary.deliveryStatus !== "not_started"
        || handoffManifest.boundary.returnActionExecutionAuthorized !== false
        || handoffManifest.boundary.sourceCompletionAuthorized !== false
        || handoffManifest.boundary.outcomeVerificationAuthorized !== false) {
        fail("M4A handoff is not safely prepared and unstarted");
    }
    assertPlainObject(handoffManifest.dryRunReturnPlan, "M4A dry-run return plan");
    if (handoffManifest.dryRunReturnPlan.state !== "dry_run"
        || handoffManifest.dryRunReturnPlan.actions.length !== 0
        || handoffManifest.dryRunReturnPlan.aggregateStatus !== "not_started"
        || handoffManifest.dryRunReturnPlan.sourceMutationAuthorized !== false) {
        fail("M4A return plan is not a non-mutating dry run");
    }
    assertPlainObject(handoffManifest.preparation, "preflight package binding");
    assertExactKeys(handoffManifest.preparation, [
        "prepareIdempotencyKey",
        "approvalAuthorizationId",
        "approvalAuthorizationDigest",
        "packageId",
        "packageDigest",
        "preparationReceiptId",
        "preparationReceiptDigest",
    ], "preflight package binding");
    assertDigest(handoffManifest.preparation.packageDigest, "package digest");
    if (PACKAGE_ID.exec(handoffManifest.preparation.packageId)?.[1]
        !== handoffManifest.preparation.packageDigest
        || handoffManifest.task.taskId !== preflight.task.taskId
        || handoffManifest.task.rootId !== preflight.task.rootId
        || !sameCanonical(handoffManifest.runtimeRequest, preflight.runtimeRequest)) {
        fail("preflight package, task, or runtime binding is invalid");
    }
    const workspaceBinding = assertTaskMapAgentWorkspaceBinding(preflight.workspaceBinding);
    const criteriaAssessment = assertTaskMapOperationalCriteriaAssessment(preflight.criteriaAssessment, {
        handoffManifestDigest: preflight.handoffManifestDigest,
        operationalContextDigest: preflight.criteriaAssessment.operationalContextDigest,
        exactProvenanceDigest: preflight.provenance.artifactDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest: preflight.criteriaAssessment.currentWorkArtifactDigest,
        taskId: preflight.task.taskId,
        rootId: preflight.task.rootId,
        doneDefinition: preflight.task.doneDefinition,
    });
    const expectedStartIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: START_IDEMPOTENCY_DOMAIN,
        handoffManifestDigest: preflight.handoffManifestDigest,
        operationalContextDigest: criteriaAssessment.operationalContextDigest,
        exactProvenanceDigest: preflight.provenance.artifactDigest,
        expectationDigest: preflight.provenance.expectationDigest,
        operationalExpectationDigest: preflight.operationalExpectationDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
        sourceEvidenceDigest: preflight.provenance.sourceEvidenceDigest,
        runtimeRequest: preflight.runtimeRequest,
        operation: "create_fresh_codex_task",
    });
    if (expectedStartIdempotencyKey !== preflight.startIdempotencyKey
        || criteriaAssessment.criteria.some((row) => row.state === "unknown")
        || !criteriaAssessment.criteria.some((row) => row.state === "unmet")) {
        fail("preflight unfinishedness or start binding is invalid");
    }
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(preflight).length > 0
        || (0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(handoffManifest).length > 0) {
        fail("preflight summary source violates the privacy boundary");
    }
    const summary = {
        contractVersion: exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_SUMMARY_VERSION,
        state: "validated_not_started",
        preflightId: preflight.preflightId,
        preflightDigest: preflight.preflightDigest,
        handoffManifestDigest: preflight.handoffManifestDigest,
        packageId: handoffManifest.preparation.packageId,
        packageDigest: handoffManifest.preparation.packageDigest,
        taskId: preflight.task.taskId,
        rootId: preflight.task.rootId,
        exactProvenanceDigest: preflight.provenance.artifactDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
        runtimeRequest: { ...preflight.runtimeRequest },
        startIdempotencyKey: preflight.startIdempotencyKey,
        taskCreated: false,
        codexTaskId: null,
        processStartAuthorized: false,
        codexTaskStartAuthorized: false,
        dispatchAuthorized: false,
        sourceWritebackAuthorized: false,
        returnActionsAuthorized: false,
        sourceCompletionAuthorized: false,
        outcomeVerificationAuthorized: false,
    };
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(summary).length > 0
        || Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(summary), "utf8")
            > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxSummaryBytes) {
        fail("preflight summary violates its privacy or byte boundary");
    }
    return summary;
}
function taskMapAgentAdapterOperation(adapter) {
    if (adapter === "codex")
        return "create_fresh_codex_task";
    if (adapter === "claude_code") {
        return "create_fresh_claude_code_session";
    }
    fail("adapter must be codex or claude_code");
}
function taskMapAgentAdapterRuntimeRequestDigest(request) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ADAPTER_RUNTIME_REQUEST_DOMAIN,
        ...request,
    });
}
function taskMapAgentAdapterPreflightDigest(preflight) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ADAPTER_PREFLIGHT_DOMAIN,
        ...preflight,
    });
}
function assertTaskMapAgentAdapterHandoffPreflight(value) {
    assertPlainObject(value, "adapter preflight");
    assertExactKeys(value, [
        "contractVersion",
        "adapterPreflightId",
        "adapterPreflightDigest",
        "adapter",
        "packageId",
        "packageDigest",
        "corePreflightId",
        "corePreflightDigest",
        "taskId",
        "rootId",
        "workspaceBindingDigest",
        "runtimeRequest",
        "startIdempotencyKey",
        "boundary",
        "privacy",
    ], "adapter preflight");
    const candidate = value;
    assertDigest(candidate.adapterPreflightDigest, "adapter preflight digest");
    assertDigest(candidate.packageDigest, "adapter package digest");
    assertDigest(candidate.corePreflightDigest, "core preflight digest");
    assertDigest(candidate.workspaceBindingDigest, "adapter workspace binding digest");
    assertDigest(candidate.startIdempotencyKey, "adapter start idempotency key");
    if (candidate.contractVersion
        !== exports.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION
        || ADAPTER_PREFLIGHT_ID.exec(candidate.adapterPreflightId)?.[1]
            !== candidate.adapterPreflightDigest
        || PACKAGE_ID.exec(candidate.packageId)?.[1] !== candidate.packageDigest
        || PREFLIGHT_ID.exec(candidate.corePreflightId)?.[1]
            !== candidate.corePreflightDigest
        || !TASK_ID.test(candidate.taskId)
        || !ROOT_ID.test(candidate.rootId)) {
        fail("adapter preflight identity or task binding is invalid");
    }
    assertPlainObject(candidate.runtimeRequest, "adapter runtime request");
    assertExactKeys(candidate.runtimeRequest, [
        "contractVersion",
        "adapter",
        "operation",
        "taskMode",
        "packageId",
        "packageDigest",
        "packagePayloadDigest",
        "corePreflightId",
        "corePreflightDigest",
        "taskId",
        "rootId",
        "workspaceBindingDigest",
        "requestDigest",
    ], "adapter runtime request");
    assertDigest(candidate.runtimeRequest.packagePayloadDigest, "adapter package payload digest");
    assertDigest(candidate.runtimeRequest.requestDigest, "adapter request digest");
    const { requestDigest: _requestDigest, ...runtimeRequestCore } = candidate.runtimeRequest;
    if (candidate.runtimeRequest.contractVersion
        !== exports.TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION
        || candidate.runtimeRequest.adapter !== candidate.adapter
        || candidate.runtimeRequest.operation
            !== taskMapAgentAdapterOperation(candidate.adapter)
        || candidate.runtimeRequest.taskMode !== "fresh"
        || candidate.runtimeRequest.packageId !== candidate.packageId
        || candidate.runtimeRequest.packageDigest !== candidate.packageDigest
        || candidate.runtimeRequest.corePreflightId !== candidate.corePreflightId
        || candidate.runtimeRequest.corePreflightDigest
            !== candidate.corePreflightDigest
        || candidate.runtimeRequest.taskId !== candidate.taskId
        || candidate.runtimeRequest.rootId !== candidate.rootId
        || candidate.runtimeRequest.workspaceBindingDigest
            !== candidate.workspaceBindingDigest
        || taskMapAgentAdapterRuntimeRequestDigest(runtimeRequestCore)
            !== candidate.runtimeRequest.requestDigest) {
        fail("adapter runtime request binding is invalid");
    }
    assertPlainObject(candidate.boundary, "adapter preflight boundary");
    assertExactKeys(candidate.boundary, [
        "state",
        "humanApprovalRequired",
        "dispatchAuthorized",
        "processStartAuthorized",
        "adapterSessionStartAuthorized",
        "taskCreated",
        "adapterSessionId",
        "sourceWritebackAuthorized",
        "sourceCompletionAuthorized",
        "outcomeVerificationAuthorized",
    ], "adapter preflight boundary");
    if (candidate.boundary.state !== "validated_not_started"
        || candidate.boundary.humanApprovalRequired !== true
        || candidate.boundary.dispatchAuthorized !== false
        || candidate.boundary.processStartAuthorized !== false
        || candidate.boundary.adapterSessionStartAuthorized !== false
        || candidate.boundary.taskCreated !== false
        || candidate.boundary.adapterSessionId !== null
        || candidate.boundary.sourceWritebackAuthorized !== false
        || candidate.boundary.sourceCompletionAuthorized !== false
        || candidate.boundary.outcomeVerificationAuthorized !== false) {
        fail("adapter preflight is not safely unstarted");
    }
    assertPlainObject(candidate.privacy, "adapter preflight privacy");
    assertExactKeys(candidate.privacy, [
        "sourceBodiesStored",
        "localPathsStored",
        "credentialsStored",
        "participantIdentitiesStored",
        "unboundedWorkspaceContextStored",
    ], "adapter preflight privacy");
    if (Object.values(candidate.privacy).some((stored) => stored !== false)) {
        fail("adapter preflight privacy boundary is invalid");
    }
    const { adapterPreflightId: _adapterPreflightId, adapterPreflightDigest: _adapterPreflightDigest, ...preflightCore } = candidate;
    const expectedStartIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ADAPTER_START_IDEMPOTENCY_DOMAIN,
        adapter: candidate.adapter,
        packageDigest: candidate.packageDigest,
        corePreflightDigest: candidate.corePreflightDigest,
        requestDigest: candidate.runtimeRequest.requestDigest,
    });
    if (taskMapAgentAdapterPreflightDigest(preflightCore)
        !== candidate.adapterPreflightDigest
        || expectedStartIdempotencyKey !== candidate.startIdempotencyKey
        || (0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(candidate).length > 0
        || Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(candidate), "utf8")
            > exports.TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
        fail("adapter preflight digest, privacy, or byte boundary is invalid");
    }
}
async function inspectTaskMapAgentAdapterHandoffPreflight(input) {
    assertPlainObject(input, "adapter preflight input");
    assertExactKeys(input, ["adapter", "preflightInput"], "adapter preflight input");
    // Validate owner, package, provenance, route, currentness, and unfinishedness
    // before the caller-selected adapter can influence any derived request.
    const corePreflight = await inspectTaskMapAgentHandoffPreflight(input.preflightInput);
    const handoffInput = {
        taskMapRoot: input.preflightInput.taskMapRoot,
        ownerRoot: input.preflightInput.ownerRoot,
        ...(input.preflightInput.expectedOwnerScopeDigest === undefined
            ? {}
            : {
                expectedOwnerScopeDigest: input.preflightInput.expectedOwnerScopeDigest,
            }),
        ...(input.preflightInput.taskId === undefined
            ? {} : { taskId: input.preflightInput.taskId }),
    };
    const handoff = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)(handoffInput);
    const summary = buildTaskMapAgentHandoffPreflightSummary(corePreflight, handoff.manifest);
    const operation = taskMapAgentAdapterOperation(input.adapter);
    const packagePayloadDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        packageId: summary.packageId,
        packageDigest: summary.packageDigest,
        corePreflightDigest: corePreflight.preflightDigest,
        taskId: corePreflight.task.taskId,
        rootId: corePreflight.task.rootId,
        taskInput: corePreflight.task.input,
        outcome: corePreflight.task.outcome,
        doneDefinition: corePreflight.task.doneDefinition,
        returnTarget: corePreflight.task.returnTarget,
        exactProvenanceDigest: corePreflight.provenance.artifactDigest,
        workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
        criteriaAssessmentDigest: corePreflight.criteriaAssessment.assessmentDigest,
    });
    const runtimeRequestCore = {
        contractVersion: exports.TASKMAP_AGENT_ADAPTER_RUNTIME_REQUEST_VERSION,
        adapter: input.adapter,
        operation,
        taskMode: "fresh",
        packageId: summary.packageId,
        packageDigest: summary.packageDigest,
        packagePayloadDigest,
        corePreflightId: corePreflight.preflightId,
        corePreflightDigest: corePreflight.preflightDigest,
        taskId: corePreflight.task.taskId,
        rootId: corePreflight.task.rootId,
        workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
    };
    const runtimeRequest = {
        ...runtimeRequestCore,
        requestDigest: taskMapAgentAdapterRuntimeRequestDigest(runtimeRequestCore),
    };
    const startIdempotencyKey = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ADAPTER_START_IDEMPOTENCY_DOMAIN,
        adapter: input.adapter,
        packageDigest: summary.packageDigest,
        corePreflightDigest: corePreflight.preflightDigest,
        requestDigest: runtimeRequest.requestDigest,
    });
    const core = {
        contractVersion: exports.TASKMAP_AGENT_ADAPTER_HANDOFF_PREFLIGHT_VERSION,
        adapter: input.adapter,
        packageId: summary.packageId,
        packageDigest: summary.packageDigest,
        corePreflightId: corePreflight.preflightId,
        corePreflightDigest: corePreflight.preflightDigest,
        taskId: corePreflight.task.taskId,
        rootId: corePreflight.task.rootId,
        workspaceBindingDigest: corePreflight.workspaceBinding.bindingDigest,
        runtimeRequest,
        startIdempotencyKey,
        boundary: {
            state: "validated_not_started",
            humanApprovalRequired: true,
            dispatchAuthorized: false,
            processStartAuthorized: false,
            adapterSessionStartAuthorized: false,
            taskCreated: false,
            adapterSessionId: null,
            sourceWritebackAuthorized: false,
            sourceCompletionAuthorized: false,
            outcomeVerificationAuthorized: false,
        },
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            credentialsStored: false,
            participantIdentitiesStored: false,
            unboundedWorkspaceContextStored: false,
        },
    };
    const adapterPreflightDigest = taskMapAgentAdapterPreflightDigest(core);
    const result = {
        ...core,
        adapterPreflightId: `tmadapterpreflight_${adapterPreflightDigest}`,
        adapterPreflightDigest,
    };
    assertTaskMapAgentAdapterHandoffPreflight(result);
    return result;
}
async function loadAdoptedStrategySourceEvidence(taskMapRoot) {
    const artifactPath = node_path_1.default.join(taskMapRoot, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME);
    let handle;
    try {
        handle = await (0, promises_1.open)(artifactPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const metadata = await handle.stat();
        const owner = process.getuid?.();
        if (!metadata.isFile()
            || metadata.isSymbolicLink()
            || metadata.size <= 0
            || metadata.size > 256 * 1_024
            || (owner !== undefined && metadata.uid !== owner)
            || (metadata.mode & 0o077) !== 0) {
            fail("Strategy source evidence is not one owner-private regular file");
        }
        const text = await handle.readFile({ encoding: "utf8" });
        const value = JSON.parse(text);
        const canonical = (0, source_contracts_js_1.taskMapContractCanonicalJson)(value);
        if (text !== canonical && text !== canonical + "\n") {
            fail("Strategy source evidence is not canonical JSON");
        }
        return (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(value);
    }
    catch (error) {
        if (error instanceof Error
            && error.message.startsWith("Task Map agent handoff preflight unavailable:"))
            throw error;
        fail("Strategy source evidence is unavailable");
    }
    finally {
        await handle?.close();
    }
    fail("Strategy source evidence is unavailable");
}
function immutableStrategyRepositoryPath(canonicalUrl, revision) {
    if (canonicalUrl === undefined
        || revision.length !== 40
        || [...revision].some((character) => !"0123456789abcdef".includes(character))) {
        return null;
    }
    try {
        const url = new URL(canonicalUrl);
        const segments = decodeURIComponent(url.pathname)
            .split("/")
            .filter(Boolean);
        const repositoryRelativePath = segments.slice(4).join("/");
        return url.protocol === "https:"
            && url.hostname === "github.com"
            && url.port === ""
            && url.username === ""
            && url.password === ""
            && url.search === ""
            && url.hash === ""
            && segments.length >= 5
            && segments[2] === "blob"
            && segments[3] === revision
            && repositoryRelativePath.length > 0
            ? repositoryRelativePath
            : null;
    }
    catch {
        return null;
    }
}
const ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION = "taskmap-owner-receipt-adapter.1";
const ADOPTED_AGENT_RECEIPT_LOCATOR = "owner-receipts/native-candidate-acceptance.v1.json";
/**
 * Build one adapter proof from the exact post-approval owner state.
 *
 * The selected adopted task remains closed to its durable manual receipt. All
 * other current tasks must independently resolve to an exact supported source
 * envelope; unrelated source work cannot weaken the selected task proof.
 */
async function inspectTaskMapAdoptedAgentAdapterPreflight(input) {
    assertPlainObject(input, "adopted agent adapter preflight input");
    assertExactKeys(input, [
        "adapter",
        "taskMapRoot",
        "ownerRoot",
        "expectedCandidateOwnerScopeDigest",
        "taskId",
        "workspaceBinding",
    ], "adopted agent adapter preflight input");
    assertDigest(input.expectedCandidateOwnerScopeDigest, "candidate owner scope digest");
    const workspaceBinding = assertTaskMapAgentWorkspaceBinding(input.workspaceBinding);
    const localInput = {
        taskMapRoot: input.taskMapRoot,
        ownerRoot: input.ownerRoot,
        taskId: input.taskId,
    };
    const local = await (0, local_approval_package_js_1.inspectTaskMapLocalApprovalOperationalContext)(localInput);
    if (local.response.status !== "package_ready"
        || local.response.packageId === null
        || local.response.packageDigest === null
        || local.agentSessionEpisode === null
        || local.agentSessionTaskProof === null
        || local.agentSessionEpisode.routingIdentityDigest
            !== workspaceBinding.repositoryIdentityDigest) {
        fail("adopted agent package or workspace binding is unavailable");
    }
    const homePointerId = local.context.task.taskHomePointerId;
    const homeEvidence = local.context.sourceEvidence.filter((row) => row.pointerId === homePointerId && row.roles.includes("task_home"));
    if (homeEvidence.length !== 1
        || homeEvidence[0].sourceKind !== "manual"
        || homeEvidence[0].authority !== "user"
        || homeEvidence[0].syncMode !== "personal_fork"
        || homeEvidence[0].sourceVersion === null
        || !DIGEST.test(homeEvidence[0].sourceVersion)
        || !homeEvidence[0].capabilities.includes("read_task")) {
        fail("task is not a receipt-backed manual authority record");
    }
    const acceptanceStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
        storePath: node_path_1.default.join(input.taskMapRoot, "native-candidate-acceptance.v1.json"),
        expectedOwnerScopeDigest: input.expectedCandidateOwnerScopeDigest,
    });
    const matchingReceipts = acceptanceStore?.receipts.filter((receipt) => (receipt.promotionId === homePointerId
        && receipt.promotionDigest === homeEvidence[0].sourceVersion
        && receipt.authority.sourceKind === "manual"
        && receipt.authority.authority === "user"
        && receipt.authority.syncMode === "personal_fork"
        && receipt.authority.recordKind === "authoritative_task"
        && receipt.sourceWritebackAttempted === false)) ?? [];
    if (matchingReceipts.length !== 1) {
        fail("durable adopted-agent receipt is unavailable or ambiguous");
    }
    const receipt = matchingReceipts[0];
    const taskProof = local.agentSessionTaskProof;
    if (taskProof.taskId !== local.inspection.task.taskId
        || taskProof.promotionId !== receipt.promotionId
        || taskProof.promotionDigest !== receipt.promotionDigest
        || taskProof.candidateId !== receipt.candidateId
        || taskProof.candidateRevisionDigest !== receipt.candidateRevisionDigest
        || !sameCanonical(taskProof.evidenceProofDigests, receipt.evidenceProofDigests)
        || !receipt.evidenceProofDigests.includes(taskProof.supportEvidenceProofDigest)
        || !sameCanonical(taskProof.episode, local.agentSessionEpisode)) {
        fail("selected adopted-agent proof does not match the durable receipt");
    }
    const adapterPolicyDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        adapterVersion: ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION,
        policy: "durable-owner-receipt-store-v1",
    });
    const currentTaskIds = local.currentness.taskDispositions
        .filter((row) => row.disposition === "current")
        .map((row) => row.taskId)
        .sort();
    const currentTasks = currentTaskIds.map((taskId) => {
        const task = local.projection.tasks.find((row) => row.id === taskId);
        const pointerId = task?.taskHomePointerId;
        const source = pointerId === undefined ? undefined
            : local.projection.sources.find((row) => row.id === pointerId);
        if (task === undefined || pointerId === undefined || source === undefined) {
            fail("current task lacks one exact source authority row");
        }
        return { taskId, task, pointerId, source };
    });
    const strategyEvidence = currentTasks.some((row) => row.source.sourceKind === "strategy")
        ? await loadAdoptedStrategySourceEvidence(input.taskMapRoot)
        : null;
    const provenanceRows = currentTasks.map((row) => {
        if (row.source.sourceKind === "manual"
            && row.source.authority === "user"
            && row.source.syncMode === "personal_fork") {
            const taskReceipts = acceptanceStore?.receipts.filter((candidate) => candidate.promotionId === row.pointerId
                && candidate.promotionDigest === row.source.sourceVersion) ?? [];
            if (taskReceipts.length !== 1) {
                fail("current manual task lacks one durable owner-receipt provenance row");
            }
            const taskReceipt = taskReceipts[0];
            const taskEnvelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
                ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
                binding: {
                    connectionId: "owner-receipt",
                    sourceKind: "manual",
                    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                        domain: "taskmap-owner-receipt-store.1",
                        ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
                    }),
                    accountOrPrincipalDigest: input.expectedCandidateOwnerScopeDigest,
                    grantVersion: "owner-confirmed-receipt-v1",
                },
                sourceKind: "manual",
                objectType: "authoritative_task",
                sourceObjectId: taskReceipt.promotionId,
                sourceRevision: taskReceipt.promotionDigest,
                eventTime: taskReceipt.confirmedAt,
                contentDigest: taskReceipt.promotionDigest,
                authority: {
                    evidence: "authoritative_task",
                    quality: "source_native",
                    lifecycle: "explicit_user_policy",
                    completion: "explicit_user_policy",
                    rank: "accepted_work",
                },
            });
            return {
                taskId: row.taskId,
                taskEnvelope,
                repositoryRelativePath: ADOPTED_AGENT_RECEIPT_LOCATOR,
                adapterVersion: ADOPTED_AGENT_RECEIPT_ADAPTER_VERSION,
                adapterPolicyDigest,
            };
        }
        const repositoryRelativePath = row.source.sourceKind === "strategy"
            ? immutableStrategyRepositoryPath(row.source.canonicalUrl, row.source.sourceVersion ?? "")
            : null;
        const strategyEnvelopes = repositoryRelativePath === null
            ? []
            : strategyEvidence?.envelopes.filter((envelope) => envelope.ownerScopeDigest === input.expectedCandidateOwnerScopeDigest
                && envelope.sourceKind === "strategy"
                && envelope.objectType === "authoritative_task"
                && envelope.sourceObjectId === row.pointerId
                && envelope.sourceRevision === row.source.sourceVersion
                && envelope.binding.sourceKind === "strategy") ?? [];
        if (row.task.reviewState !== "accepted"
            || row.task.authority !== "source_system"
            || row.source.sourceKind !== "strategy"
            || row.source.authority !== "source_system"
            || row.source.syncMode !== "return_only"
            || !row.source.capabilities.includes("read_task")) {
            fail("current Strategy task authority is unsupported");
        }
        if (repositoryRelativePath === null) {
            fail("current Strategy task lacks one immutable Git locator");
        }
        if (strategyEnvelopes.length !== 1) {
            fail("current Strategy task lacks one exact source evidence row");
        }
        return {
            taskId: row.taskId,
            taskEnvelope: structuredClone(strategyEnvelopes[0]),
            repositoryRelativePath,
            adapterVersion: strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
            adapterPolicyDigest: strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
        };
    });
    const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(provenanceRows.map((row) => row.taskEnvelope), []);
    const taskBindings = provenanceRows.map((row) => ({
        taskId: row.taskId,
        sourceEnvelopeId: row.taskEnvelope.envelopeId,
        repositoryRelativePath: row.repositoryRelativePath,
        adapterVersion: row.adapterVersion,
        adapterPolicyDigest: row.adapterPolicyDigest,
    }));
    const adapterExpectation = (0, exact_provenance_companion_js_1.taskMapExactProvenanceAdapterExpectation)(taskBindings);
    const provenance = (0, exact_provenance_companion_js_1.buildTaskMapExactProvenance)({
        projection: local.projection,
        currentness: local.currentness,
        currentnessFileDigest: local.inspection.quartet.currentnessFileDigest,
        expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        expectedAdapterVersion: adapterExpectation.adapterVersion,
        expectedAdapterPolicyDigest: adapterExpectation.adapterPolicyDigest,
        sourceSnapshot,
        taskBindings,
    });
    const handoff = await (0, agent_handoff_manifest_js_1.inspectTaskMapAgentHandoff)(localInput);
    const criteriaAssessment = buildTaskMapOperationalCriteriaAssessment({
        handoffManifestDigest: handoff.manifest.handoffManifestDigest,
        operationalContextDigest: local.context.contextDigest,
        exactProvenanceDigest: provenance.artifactDigest,
        workspaceBindingDigest: workspaceBinding.bindingDigest,
        workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
        currentWorkArtifactDigest: local.inspection.quartet.currentWorkArtifactDigest,
        taskId: local.inspection.task.taskId,
        rootId: local.inspection.task.rootId,
        doneDefinition: handoff.manifest.task.doneDefinition,
        criteria: handoff.manifest.task.doneDefinition.map((_criterion, criterionIndex) => ({
            criterionIndex,
            state: "unmet",
            evidenceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-adopted-agent-unmet-criterion.1",
                criterionIndex,
                taskId: local.inspection.task.taskId,
                proofDigest: local.inspection.proofDigest,
                promotionDigest: receipt.promotionDigest,
                workspaceRevisionDigest: workspaceBinding.workspaceRevisionDigest,
            }),
        })),
    });
    return inspectTaskMapAgentAdapterHandoffPreflight({
        adapter: input.adapter,
        preflightInput: {
            ...localInput,
            exactProvenance: provenance,
            expectedProvenance: {
                sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
                adapterVersion: adapterExpectation.adapterVersion,
                adapterPolicyDigest: adapterExpectation.adapterPolicyDigest,
            },
            expectedOperational: {
                workspaceBindingDigest: workspaceBinding.bindingDigest,
                criteriaAssessmentDigest: criteriaAssessment.assessmentDigest,
            },
            workspaceBinding,
            criteriaAssessment,
        },
    });
}
