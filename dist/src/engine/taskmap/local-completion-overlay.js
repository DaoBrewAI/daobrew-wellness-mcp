"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1 = exports.TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1 = exports.TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION = exports.TASKMAP_LOCAL_COMPLETION_REVIEW_STATE_VERSION = exports.TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION = exports.TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION = exports.TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION = exports.TASKMAP_LOCAL_REOPEN_DECISION_VERSION = exports.TASKMAP_LOCAL_CLOSE_DECISION_VERSION = exports.TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION = void 0;
exports.buildTaskMapLocalCompletionIdentity = buildTaskMapLocalCompletionIdentity;
exports.decideTaskMapLocalCompletion = decideTaskMapLocalCompletion;
exports.buildTaskMapExternalCompletion = buildTaskMapExternalCompletion;
exports.buildTaskMapExplicitReopen = buildTaskMapExplicitReopen;
exports.buildTaskMapExplicitExternalReopen = buildTaskMapExplicitExternalReopen;
exports.assertTaskMapLocalLifecycleDecision = assertTaskMapLocalLifecycleDecision;
exports.taskMapLocalLifecycleDecisionCanonicalBytes = taskMapLocalLifecycleDecisionCanonicalBytes;
exports.summarizeTaskMapLocalLifecycleHistory = summarizeTaskMapLocalLifecycleHistory;
exports.assertTaskMapLocalLifecycleMutationAllowed = assertTaskMapLocalLifecycleMutationAllowed;
exports.readTaskMapLocalClosedTaskIds = readTaskMapLocalClosedTaskIds;
exports.readTaskMapLocalCompletionReviewState = readTaskMapLocalCompletionReviewState;
exports.applyTaskMapLocalCompletionOverlay = applyTaskMapLocalCompletionOverlay;
exports.taskMapLocalCompletionOverlayCanonicalBytes = taskMapLocalCompletionOverlayCanonicalBytes;
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION = "taskmap-local-completion-identity.v1";
exports.TASKMAP_LOCAL_CLOSE_DECISION_VERSION = "taskmap-local-close-decision.v1";
exports.TASKMAP_LOCAL_REOPEN_DECISION_VERSION = "taskmap-local-reopen-decision.v1";
exports.TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION = "taskmap-local-external-completion-decision.v1";
exports.TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION = "taskmap-local-external-reopen-decision.v1";
exports.TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION = "taskmap-local-completion-overlay.v1";
exports.TASKMAP_LOCAL_COMPLETION_REVIEW_STATE_VERSION = "taskmap-local-completion-review-state.v1";
exports.TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION = "taskmap-agent-execution-inspection.v1";
exports.TASKMAP_LOCAL_COMPLETION_PRODUCT_SEAM_V1 = Object.freeze({
    storageRecommendation: {
        decisionsDirectoryRelativeToOwnerRoot: "taskmap-local-execution/completion-decisions",
        immutableDecisionFilePattern: "<decision-id>.json",
        derivedOverlayRelativeToOwnerRoot: "taskmap-local-execution/completion-overlay.v1.json",
    },
    cliRecommendation: {
        source: "src/engine/taskmap/local-completion-cli.ts",
        compiled: "dist/src/engine/taskmap/local-completion-cli.js",
        commands: [
            "review",
            "close",
            "keep-open",
            "complete-elsewhere",
            "reopen",
            "overlay",
        ],
    },
    requiredClosePrecondition: "report_ready",
    persistenceImplementedHere: false,
    persistenceOwner: "command_center_cli",
    keepOpenWritesTerminalRecord: false,
    sourceWritebackSupported: false,
    outcomeVerificationSupported: false,
});
exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1 = Object.freeze({
    maxAliasSourceObjectKeys: 8,
    maxReturnedArtifacts: 8,
    maxGraphNodes: 1_024,
    maxLifecycleRecords: 256,
    maxTextCharacters: 512,
});
const DIGEST = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._#-]{0,511}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const CLOSE_ID = /^tmlocalclose_([a-f0-9]{64})$/;
const REOPEN_ID = /^tmlocalreopen_([a-f0-9]{64})$/;
const EXTERNAL_COMPLETION_ID = /^tmlocalexternalcompletion_([a-f0-9]{64})$/;
const EXTERNAL_REOPEN_ID = /^tmlocalexternalreopen_([a-f0-9]{64})$/;
const ALIAS_DOMAIN = "taskmap-local-completion-alias-signature.1";
const IDENTITY_DOMAIN = "taskmap-local-completion-stable-identity.1";
const PACKAGE_DOMAIN = "taskmap-local-execution-package.1";
const CLOSE_DOMAIN = "taskmap-local-close-decision.1";
const REOPEN_DOMAIN = "taskmap-local-reopen-decision.1";
const EXTERNAL_COMPLETION_DOMAIN = "taskmap-local-external-completion-decision.1";
const EXTERNAL_REOPEN_DOMAIN = "taskmap-local-external-reopen-decision.1";
const CONFLICT_DOMAIN = "taskmap-local-completion-source-conflict.1";
const OVERLAY_DOMAIN = "taskmap-local-completion-overlay.1";
function fail(message) {
    throw new Error(`Task Map local completion failed: ${message}`);
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
        fail(`${label} keys are invalid`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !DIGEST.test(value)) {
        fail(`${label} is not a SHA-256 digest`);
    }
}
function assertText(value, label, maximum = exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1.maxTextCharacters) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || /[\u0000-\u001f\u007f]/u.test(value)) {
        fail(`${label} is invalid`);
    }
}
function assertSafeId(value, label) {
    if (typeof value !== "string" || !SAFE_ID.test(value)) {
        fail(`${label} is invalid`);
    }
}
function assertTimestamp(value, label) {
    if (typeof value !== "string"
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value))) {
        fail(`${label} is not a strict timestamp`);
    }
}
function timestampMs(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        fail("timestamp is invalid");
    return parsed;
}
function assertBeforeOrEqual(earlier, later, label) {
    if (timestampMs(earlier) > timestampMs(later)) {
        fail(`${label} is out of order`);
    }
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function sortedUniqueDigests(values, canonical) {
    if (!Array.isArray(values)
        || values.length > exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1
            .maxAliasSourceObjectKeys) {
        fail("alias source identity count is invalid");
    }
    for (const [index, value] of values.entries()) {
        assertDigest(value, `alias source identity ${index}`);
        if (value === canonical) {
            fail("canonical source identity cannot also be an alias");
        }
    }
    const sorted = [...values].sort();
    if (new Set(sorted).size !== sorted.length) {
        fail("alias source identities must be unique");
    }
    return sorted;
}
function buildTaskMapLocalCompletionIdentity(input) {
    assertPlainObject(input, "identity input");
    assertExactKeys(input, [
        "taskId",
        "rootId",
        "workId",
        "canonicalSourceObjectKeyDigest",
        "aliasSourceObjectKeyDigests",
        "sourceIdentityDigest",
        "sourceRevision",
        "sourceRevisionObservedAt",
    ], "identity input");
    if (!TASK_ID.test(input.taskId))
        fail("taskId is invalid");
    if (!ROOT_ID.test(input.rootId))
        fail("rootId is invalid");
    assertSafeId(input.workId, "workId");
    assertDigest(input.canonicalSourceObjectKeyDigest, "canonical source object key");
    assertDigest(input.sourceIdentityDigest, "source identity");
    assertText(input.sourceRevision, "source revision");
    assertTimestamp(input.sourceRevisionObservedAt, "source revision observedAt");
    const aliases = sortedUniqueDigests(input.aliasSourceObjectKeyDigests, input.canonicalSourceObjectKeyDigest);
    const aliasSignatureDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ALIAS_DOMAIN,
        canonicalSourceObjectKeyDigest: input.canonicalSourceObjectKeyDigest,
        aliasSourceObjectKeyDigests: aliases,
    });
    const completionIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: IDENTITY_DOMAIN,
        taskId: input.taskId,
        rootId: input.rootId,
        workId: input.workId,
        aliasSignatureDigest,
    });
    return deepFreeze({
        contractVersion: exports.TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION,
        taskId: input.taskId,
        rootId: input.rootId,
        workId: input.workId,
        canonicalSourceObjectKeyDigest: input.canonicalSourceObjectKeyDigest,
        aliasSourceObjectKeyDigests: aliases,
        aliasSignatureDigest,
        sourceIdentityDigest: input.sourceIdentityDigest,
        sourceRevision: input.sourceRevision,
        sourceRevisionObservedAt: input.sourceRevisionObservedAt,
        completionIdentityDigest,
    });
}
function assertIdentity(value) {
    assertPlainObject(value, "completion identity");
    assertExactKeys(value, [
        "contractVersion",
        "taskId",
        "rootId",
        "workId",
        "canonicalSourceObjectKeyDigest",
        "aliasSourceObjectKeyDigests",
        "aliasSignatureDigest",
        "sourceIdentityDigest",
        "sourceRevision",
        "sourceRevisionObservedAt",
        "completionIdentityDigest",
    ], "completion identity");
    if (value.contractVersion !== exports.TASKMAP_LOCAL_COMPLETION_IDENTITY_VERSION) {
        fail("completion identity version is invalid");
    }
    const rebuilt = buildTaskMapLocalCompletionIdentity({
        taskId: value.taskId,
        rootId: value.rootId,
        workId: value.workId,
        canonicalSourceObjectKeyDigest: value.canonicalSourceObjectKeyDigest,
        aliasSourceObjectKeyDigests: value.aliasSourceObjectKeyDigests,
        sourceIdentityDigest: value.sourceIdentityDigest,
        sourceRevision: value.sourceRevision,
        sourceRevisionObservedAt: value.sourceRevisionObservedAt,
    });
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(rebuilt)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)) {
        fail("completion identity seal is invalid");
    }
}
function assertProjectionBinding(value) {
    assertPlainObject(value, "projection binding");
    assertExactKeys(value, [
        "projectionContractVersion",
        "runId",
        "inputDigest",
        "generatedAt",
        "projectionDigest",
    ], "projection binding");
    assertText(value.projectionContractVersion, "projection contract version", 128);
    assertSafeId(value.runId, "projection runId");
    assertDigest(value.inputDigest, "projection input digest");
    assertTimestamp(value.generatedAt, "projection generatedAt");
    assertDigest(value.projectionDigest, "projection digest");
}
function projectionFromApprovedPackage(value, localOwnerScopeDigest, identity) {
    assertPlainObject(value, "approved package");
    assertExactKeys(value, [
        "contractVersion",
        "packageId",
        "packageDigest",
        "approvalAuthorizationId",
        "approvalAuthorizationDigest",
        "localOwnerScopeDigest",
        "proofDigest",
        "quartet",
        "task",
        "executionBoundary",
        "privacy",
    ], "approved package");
    if (value.contractVersion !== "taskmap-local-execution-package.v1"
        || value.localOwnerScopeDigest !== localOwnerScopeDigest) {
        fail("approved package boundary is invalid");
    }
    assertDigest(value.packageDigest, "approved package digest");
    if (typeof value.packageId !== "string"
        || PACKAGE_ID.exec(value.packageId)?.[1] !== value.packageDigest) {
        fail("approved package id is invalid");
    }
    const core = { ...value };
    delete core.packageId;
    delete core.packageDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({ domain: PACKAGE_DOMAIN, ...core })
        !== value.packageDigest) {
        fail("approved package seal is invalid");
    }
    assertPlainObject(value.task, "approved package task");
    if (value.task.taskId !== identity.taskId
        || value.task.rootId !== identity.rootId) {
        fail("approved package does not bind the completion task/root");
    }
    assertPlainObject(value.quartet, "approved package quartet");
    const projection = {
        projectionContractVersion: "taskmap.v1",
        runId: value.quartet.runId,
        inputDigest: value.quartet.inputDigest,
        generatedAt: value.quartet.generatedAt,
        projectionDigest: value.quartet.projectionDigest,
    };
    assertProjectionBinding(projection);
    assertPlainObject(value.executionBoundary, "approved package execution boundary");
    if (value.executionBoundary.state !== "prepared_not_started"
        || value.executionBoundary.approvalRecorded !== true
        || value.executionBoundary.deliveryStatus !== "not_started"
        || value.executionBoundary.taskStarted !== false
        || value.executionBoundary.taskExecuted !== false
        || value.executionBoundary.dispatchAuthorized !== false
        || value.executionBoundary.sourceWritebackAuthorized !== false
        || value.executionBoundary.codexTaskStartAuthorized !== false) {
        fail("approved package execution boundary is invalid");
    }
    assertPlainObject(value.privacy, "approved package privacy");
    if (value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.rawBiometricsStored !== false
        || value.privacy.ownerIdentityStored !== false) {
        fail("approved package privacy boundary is invalid");
    }
    return {
        package: value,
        projection,
    };
}
function assertExecutionInspectionBoundary(value) {
    assertPlainObject(value, "execution inspection");
    if (value.contractVersion
        !== exports.TASKMAP_LOCAL_COMPLETION_REQUIRED_EXECUTION_INSPECTION_VERSION
        || !UUID.test(value.sessionId)
        || ![
            "not_started",
            "started",
            "finished_without_artifact",
            "failed_without_artifact",
            "artifact_delivered",
            "report_ready",
        ].includes(value.progressState)
        || !["not_started", "running", "finished", "failed"].includes(value.sessionStatus)
        || !Number.isSafeInteger(value.artifactCount)
        || value.artifactCount < 0
        || value.artifactCount
            > exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1.maxReturnedArtifacts
        || value.sourceWritebackAttempted !== false
        || value.sourceCompletion !== false
        || value.outcomeVerified !== false) {
        fail("execution inspection boundary is invalid");
    }
}
function assertReportReady(value, identity, decidedAt) {
    assertExecutionInspectionBoundary(value);
    if (value.progressState !== "report_ready"
        || value.sessionStatus !== "finished"
        || value.taskId !== identity.taskId
        || value.rootId !== identity.rootId
        || value.packageId === null
        || value.packageDigest === null
        || PACKAGE_ID.exec(value.packageId)?.[1] !== value.packageDigest
        || value.workspaceBindingDigest === null
        || value.launchedAdapter === null
        || value.startedAt === null
        || value.finishedAt === null
        || value.artifactCount < 1
        || !Number.isSafeInteger(value.artifactCount)
        || value.artifactReceiptDigest === null
        || value.reportReceiptDigest === null
        || value.reportRelativePaths.length !== 2
        || value.reportRelativePaths[0] !== "report.md"
        || value.reportRelativePaths[1] !== "report.html") {
        fail("execution is not an exact report_ready binding");
    }
    assertDigest(value.packageDigest, "package digest");
    assertDigest(value.workspaceBindingDigest, "workspace binding digest");
    assertDigest(value.artifactReceiptDigest, "artifact receipt digest");
    assertDigest(value.reportReceiptDigest, "report receipt digest");
    assertTimestamp(value.startedAt, "session startedAt");
    assertTimestamp(value.finishedAt, "session finishedAt");
    assertBeforeOrEqual(value.startedAt, value.finishedAt, "session");
    assertBeforeOrEqual(value.finishedAt, decidedAt, "completion decision");
}
const PRIVACY = Object.freeze({
    storage: "owner_local_only",
    ownerIdentityStored: false,
    sourceBodiesStored: false,
    localPathsStored: false,
});
function decideTaskMapLocalCompletion(input) {
    assertPlainObject(input, "completion decision input");
    assertExactKeys(input, [
        "decision",
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "identity",
        "approvedPackage",
        "reportReady",
        "decidedAt",
    ], "completion decision input");
    if (input.explicitOwnerAction !== true
        || (input.decision !== "close" && input.decision !== "keep_open")) {
        fail("completion requires an explicit local-owner decision");
    }
    assertDigest(input.localOwnerScopeDigest, "local owner scope");
    assertIdentity(input.identity);
    const approved = projectionFromApprovedPackage(input.approvedPackage, input.localOwnerScopeDigest, input.identity);
    assertTimestamp(input.decidedAt, "decidedAt");
    assertBeforeOrEqual(approved.projection.generatedAt, input.decidedAt, "projection binding");
    assertBeforeOrEqual(input.identity.sourceRevisionObservedAt, input.decidedAt, "source revision binding");
    assertReportReady(input.reportReady, input.identity, input.decidedAt);
    if (input.reportReady.packageId !== approved.package.packageId
        || input.reportReady.packageDigest !== approved.package.packageDigest) {
        fail("report_ready execution does not bind the approved package");
    }
    if (input.decision === "keep_open") {
        return deepFreeze({
            decision: "keep_open",
            lifecycleState: "open",
            displayState: "Kept open",
            decidedAt: input.decidedAt,
            terminalLifecycleChanged: false,
            closeRecord: null,
            sourceWritebackAttempted: false,
            sourceCompletion: false,
            outcomeVerified: false,
        });
    }
    const reportReady = input.reportReady;
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_CLOSE_DECISION_VERSION,
        decision: "close",
        lifecycleState: "closed_in_daobrew",
        displayState: "Closed in DaoBrew",
        authority: "explicit_local_owner",
        explicitOwnerAction: true,
        localOwnerScopeDigest: input.localOwnerScopeDigest,
        identity: structuredClone(input.identity),
        binding: {
            projection: structuredClone(approved.projection),
            package: {
                packageId: approved.package.packageId,
                packageDigest: approved.package.packageDigest,
            },
            session: {
                sessionId: reportReady.sessionId,
                workspaceBindingDigest: reportReady.workspaceBindingDigest,
                launchedAdapter: reportReady.launchedAdapter,
                startedAt: reportReady.startedAt,
                finishedAt: reportReady.finishedAt,
            },
            artifact: {
                artifactReceiptDigest: reportReady.artifactReceiptDigest,
                artifactCount: reportReady.artifactCount,
            },
            report: {
                reportReceiptDigest: reportReady.reportReceiptDigest,
                relativePaths: ["report.md", "report.html"],
            },
        },
        closedAt: input.decidedAt,
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
        privacy: { ...PRIVACY },
    };
    const closeDecisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: CLOSE_DOMAIN,
        ...core,
    });
    const closeRecord = {
        ...core,
        closeDecisionId: `tmlocalclose_${closeDecisionDigest}`,
        closeDecisionDigest,
    };
    assertTaskMapLocalLifecycleDecision(closeRecord);
    return deepFreeze({
        decision: "close",
        lifecycleState: "closed_in_daobrew",
        terminalLifecycleChanged: true,
        closeRecord,
    });
}
function buildTaskMapExternalCompletion(input) {
    assertPlainObject(input, "external completion input");
    assertExactKeys(input, [
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "identity",
        "projection",
        "completedAt",
    ], "external completion input");
    if (input.explicitOwnerAction !== true) {
        fail("external completion requires an explicit local-owner action");
    }
    assertDigest(input.localOwnerScopeDigest, "local owner scope");
    assertIdentity(input.identity);
    assertProjectionBinding(input.projection);
    assertTimestamp(input.completedAt, "completedAt");
    assertBeforeOrEqual(input.projection.generatedAt, input.completedAt, "external completion projection binding");
    assertBeforeOrEqual(input.identity.sourceRevisionObservedAt, input.completedAt, "external completion source revision binding");
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION,
        decision: "complete_elsewhere",
        lifecycleState: "completed_elsewhere",
        displayState: "Completed by you",
        authority: "explicit_local_owner",
        explicitOwnerAction: true,
        localOwnerScopeDigest: input.localOwnerScopeDigest,
        identity: structuredClone(input.identity),
        binding: {
            projection: structuredClone(input.projection),
        },
        completedAt: input.completedAt,
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
        privacy: { ...PRIVACY },
    };
    const externalCompletionDecisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: EXTERNAL_COMPLETION_DOMAIN,
        ...core,
    });
    const record = {
        ...core,
        externalCompletionDecisionId: `tmlocalexternalcompletion_${externalCompletionDecisionDigest}`,
        externalCompletionDecisionDigest,
    };
    assertTaskMapLocalLifecycleDecision(record);
    return deepFreeze(record);
}
function buildTaskMapExplicitReopen(input) {
    assertPlainObject(input, "reopen input");
    assertExactKeys(input, ["closeRecord", "explicitOwnerAction", "reopenedAt"], "reopen input");
    if (input.explicitOwnerAction !== true) {
        fail("reopen requires an explicit local-owner action");
    }
    assertTaskMapLocalLifecycleDecision(input.closeRecord);
    if (input.closeRecord.decision !== "close") {
        fail("reopen must reference a close record");
    }
    assertTimestamp(input.reopenedAt, "reopenedAt");
    if (timestampMs(input.reopenedAt)
        <= timestampMs(input.closeRecord.closedAt)) {
        fail("reopen must occur after close");
    }
    const close = input.closeRecord;
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_REOPEN_DECISION_VERSION,
        decision: "reopen",
        lifecycleState: "open_in_daobrew",
        displayState: "Reopened in DaoBrew",
        authority: "explicit_local_owner",
        explicitOwnerAction: true,
        localOwnerScopeDigest: close.localOwnerScopeDigest,
        completionIdentityDigest: close.identity.completionIdentityDigest,
        taskId: close.identity.taskId,
        rootId: close.identity.rootId,
        workId: close.identity.workId,
        previousCloseDecisionId: close.closeDecisionId,
        previousCloseDecisionDigest: close.closeDecisionDigest,
        reopenedAt: input.reopenedAt,
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
        privacy: { ...PRIVACY },
    };
    const reopenDecisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: REOPEN_DOMAIN,
        ...core,
    });
    const record = {
        ...core,
        reopenDecisionId: `tmlocalreopen_${reopenDecisionDigest}`,
        reopenDecisionDigest,
    };
    assertTaskMapLocalLifecycleDecision(record);
    return deepFreeze(record);
}
function buildTaskMapExplicitExternalReopen(input) {
    assertPlainObject(input, "external reopen input");
    assertExactKeys(input, ["completionRecord", "explicitOwnerAction", "reopenedAt"], "external reopen input");
    if (input.explicitOwnerAction !== true) {
        fail("external reopen requires an explicit local-owner action");
    }
    assertTaskMapLocalLifecycleDecision(input.completionRecord);
    if (input.completionRecord.decision !== "complete_elsewhere") {
        fail("external reopen must reference an external completion record");
    }
    assertTimestamp(input.reopenedAt, "reopenedAt");
    if (timestampMs(input.reopenedAt)
        <= timestampMs(input.completionRecord.completedAt)) {
        fail("external reopen must occur after completion");
    }
    const completion = input.completionRecord;
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION,
        decision: "reopen_external_completion",
        lifecycleState: "open_in_daobrew",
        displayState: "Reopened in DaoBrew",
        authority: "explicit_local_owner",
        explicitOwnerAction: true,
        localOwnerScopeDigest: completion.localOwnerScopeDigest,
        completionIdentityDigest: completion.identity.completionIdentityDigest,
        taskId: completion.identity.taskId,
        rootId: completion.identity.rootId,
        workId: completion.identity.workId,
        previousExternalCompletionDecisionId: completion.externalCompletionDecisionId,
        previousExternalCompletionDecisionDigest: completion.externalCompletionDecisionDigest,
        reopenedAt: input.reopenedAt,
        sourceWritebackAttempted: false,
        sourceCompletion: false,
        outcomeVerified: false,
        privacy: { ...PRIVACY },
    };
    const externalReopenDecisionDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: EXTERNAL_REOPEN_DOMAIN,
        ...core,
    });
    const record = {
        ...core,
        externalReopenDecisionId: `tmlocalexternalreopen_${externalReopenDecisionDigest}`,
        externalReopenDecisionDigest,
    };
    assertTaskMapLocalLifecycleDecision(record);
    return deepFreeze(record);
}
function assertPrivacy(value) {
    assertPlainObject(value, "decision privacy");
    assertExactKeys(value, [
        "storage",
        "ownerIdentityStored",
        "sourceBodiesStored",
        "localPathsStored",
    ], "decision privacy");
    if (value.storage !== "owner_local_only"
        || value.ownerIdentityStored !== false
        || value.sourceBodiesStored !== false
        || value.localPathsStored !== false) {
        fail("decision privacy boundary is invalid");
    }
}
function assertCloseRecord(value) {
    assertPlainObject(value, "close decision");
    assertExactKeys(value, [
        "contractVersion",
        "closeDecisionId",
        "closeDecisionDigest",
        "decision",
        "lifecycleState",
        "displayState",
        "authority",
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "identity",
        "binding",
        "closedAt",
        "sourceWritebackAttempted",
        "sourceCompletion",
        "outcomeVerified",
        "privacy",
    ], "close decision");
    if (value.contractVersion !== exports.TASKMAP_LOCAL_CLOSE_DECISION_VERSION
        || value.decision !== "close"
        || value.lifecycleState !== "closed_in_daobrew"
        || value.displayState !== "Closed in DaoBrew"
        || value.authority !== "explicit_local_owner"
        || value.explicitOwnerAction !== true
        || value.sourceWritebackAttempted !== false
        || value.sourceCompletion !== false
        || value.outcomeVerified !== false) {
        fail("close decision boundary is invalid");
    }
    assertDigest(value.localOwnerScopeDigest, "local owner scope");
    assertIdentity(value.identity);
    assertTimestamp(value.closedAt, "closedAt");
    assertBeforeOrEqual(value.identity.sourceRevisionObservedAt, value.closedAt, "close source revision binding");
    assertPrivacy(value.privacy);
    assertPlainObject(value.binding, "close binding");
    assertExactKeys(value.binding, ["projection", "package", "session", "artifact", "report"], "close binding");
    assertProjectionBinding(value.binding.projection);
    assertBeforeOrEqual(value.binding.projection.generatedAt, value.closedAt, "close projection binding");
    assertPlainObject(value.binding.package, "package binding");
    assertExactKeys(value.binding.package, ["packageId", "packageDigest"], "package binding");
    assertDigest(value.binding.package.packageDigest, "package digest");
    if (typeof value.binding.package.packageId !== "string"
        || PACKAGE_ID.exec(value.binding.package.packageId)?.[1]
            !== value.binding.package.packageDigest) {
        fail("package binding is invalid");
    }
    assertPlainObject(value.binding.session, "session binding");
    assertExactKeys(value.binding.session, [
        "sessionId",
        "workspaceBindingDigest",
        "launchedAdapter",
        "startedAt",
        "finishedAt",
    ], "session binding");
    if (typeof value.binding.session.sessionId !== "string"
        || !UUID.test(value.binding.session.sessionId)
        || (value.binding.session.launchedAdapter !== "claude_code"
            && value.binding.session.launchedAdapter !== "codex_cli")) {
        fail("session binding is invalid");
    }
    assertDigest(value.binding.session.workspaceBindingDigest, "workspace binding digest");
    assertTimestamp(value.binding.session.startedAt, "session startedAt");
    assertTimestamp(value.binding.session.finishedAt, "session finishedAt");
    assertBeforeOrEqual(value.binding.session.startedAt, value.binding.session.finishedAt, "session binding");
    assertBeforeOrEqual(value.binding.session.finishedAt, value.closedAt, "close decision");
    assertPlainObject(value.binding.artifact, "artifact binding");
    assertExactKeys(value.binding.artifact, ["artifactReceiptDigest", "artifactCount"], "artifact binding");
    assertDigest(value.binding.artifact.artifactReceiptDigest, "artifact receipt digest");
    if (typeof value.binding.artifact.artifactCount !== "number"
        || !Number.isSafeInteger(value.binding.artifact.artifactCount)
        || value.binding.artifact.artifactCount < 1) {
        fail("artifact count is invalid");
    }
    assertPlainObject(value.binding.report, "report binding");
    assertExactKeys(value.binding.report, ["reportReceiptDigest", "relativePaths"], "report binding");
    assertDigest(value.binding.report.reportReceiptDigest, "report receipt digest");
    if (!Array.isArray(value.binding.report.relativePaths)
        || value.binding.report.relativePaths.length !== 2
        || value.binding.report.relativePaths[0] !== "report.md"
        || value.binding.report.relativePaths[1] !== "report.html") {
        fail("report binding is invalid");
    }
    assertDigest(value.closeDecisionDigest, "close decision digest");
    if (typeof value.closeDecisionId !== "string"
        || CLOSE_ID.exec(value.closeDecisionId)?.[1]
            !== value.closeDecisionDigest) {
        fail("close decision id is invalid");
    }
    const core = { ...value };
    delete core.closeDecisionId;
    delete core.closeDecisionDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({ domain: CLOSE_DOMAIN, ...core })
        !== value.closeDecisionDigest) {
        fail("close decision seal is invalid");
    }
}
function assertReopenRecord(value) {
    assertPlainObject(value, "reopen decision");
    assertExactKeys(value, [
        "contractVersion",
        "reopenDecisionId",
        "reopenDecisionDigest",
        "decision",
        "lifecycleState",
        "displayState",
        "authority",
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "completionIdentityDigest",
        "taskId",
        "rootId",
        "workId",
        "previousCloseDecisionId",
        "previousCloseDecisionDigest",
        "reopenedAt",
        "sourceWritebackAttempted",
        "sourceCompletion",
        "outcomeVerified",
        "privacy",
    ], "reopen decision");
    if (value.contractVersion !== exports.TASKMAP_LOCAL_REOPEN_DECISION_VERSION
        || value.decision !== "reopen"
        || value.lifecycleState !== "open_in_daobrew"
        || value.displayState !== "Reopened in DaoBrew"
        || value.authority !== "explicit_local_owner"
        || value.explicitOwnerAction !== true
        || value.sourceWritebackAttempted !== false
        || value.sourceCompletion !== false
        || value.outcomeVerified !== false) {
        fail("reopen decision boundary is invalid");
    }
    assertDigest(value.localOwnerScopeDigest, "local owner scope");
    assertDigest(value.completionIdentityDigest, "completion identity digest");
    if (typeof value.taskId !== "string" || !TASK_ID.test(value.taskId)) {
        fail("reopen taskId is invalid");
    }
    if (typeof value.rootId !== "string" || !ROOT_ID.test(value.rootId)) {
        fail("reopen rootId is invalid");
    }
    assertSafeId(value.workId, "reopen workId");
    assertDigest(value.previousCloseDecisionDigest, "previous close digest");
    if (typeof value.previousCloseDecisionId !== "string"
        || CLOSE_ID.exec(value.previousCloseDecisionId)?.[1]
            !== value.previousCloseDecisionDigest) {
        fail("previous close decision binding is invalid");
    }
    assertTimestamp(value.reopenedAt, "reopenedAt");
    assertPrivacy(value.privacy);
    assertDigest(value.reopenDecisionDigest, "reopen decision digest");
    if (typeof value.reopenDecisionId !== "string"
        || REOPEN_ID.exec(value.reopenDecisionId)?.[1]
            !== value.reopenDecisionDigest) {
        fail("reopen decision id is invalid");
    }
    const core = { ...value };
    delete core.reopenDecisionId;
    delete core.reopenDecisionDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({ domain: REOPEN_DOMAIN, ...core })
        !== value.reopenDecisionDigest) {
        fail("reopen decision seal is invalid");
    }
}
function assertExternalCompletionRecord(value) {
    assertPlainObject(value, "external completion decision");
    assertExactKeys(value, [
        "contractVersion",
        "externalCompletionDecisionId",
        "externalCompletionDecisionDigest",
        "decision",
        "lifecycleState",
        "displayState",
        "authority",
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "identity",
        "binding",
        "completedAt",
        "sourceWritebackAttempted",
        "sourceCompletion",
        "outcomeVerified",
        "privacy",
    ], "external completion decision");
    if (value.contractVersion
        !== exports.TASKMAP_LOCAL_EXTERNAL_COMPLETION_DECISION_VERSION
        || value.decision !== "complete_elsewhere"
        || value.lifecycleState !== "completed_elsewhere"
        || value.displayState !== "Completed by you"
        || value.authority !== "explicit_local_owner"
        || value.explicitOwnerAction !== true
        || value.sourceWritebackAttempted !== false
        || value.sourceCompletion !== false
        || value.outcomeVerified !== false) {
        fail("external completion decision boundary is invalid");
    }
    assertDigest(value.localOwnerScopeDigest, "local owner scope");
    assertIdentity(value.identity);
    assertPlainObject(value.binding, "external completion binding");
    assertExactKeys(value.binding, ["projection"], "external completion binding");
    assertProjectionBinding(value.binding.projection);
    assertTimestamp(value.completedAt, "completedAt");
    assertBeforeOrEqual(value.binding.projection.generatedAt, value.completedAt, "external completion projection binding");
    assertBeforeOrEqual(value.identity.sourceRevisionObservedAt, value.completedAt, "external completion source revision binding");
    assertPrivacy(value.privacy);
    assertDigest(value.externalCompletionDecisionDigest, "external completion decision digest");
    if (typeof value.externalCompletionDecisionId !== "string"
        || EXTERNAL_COMPLETION_ID.exec(value.externalCompletionDecisionId)?.[1]
            !== value.externalCompletionDecisionDigest) {
        fail("external completion decision id is invalid");
    }
    const core = { ...value };
    delete core.externalCompletionDecisionId;
    delete core.externalCompletionDecisionDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({ domain: EXTERNAL_COMPLETION_DOMAIN, ...core })
        !== value.externalCompletionDecisionDigest) {
        fail("external completion decision seal is invalid");
    }
}
function assertExternalReopenRecord(value) {
    assertPlainObject(value, "external reopen decision");
    assertExactKeys(value, [
        "contractVersion",
        "externalReopenDecisionId",
        "externalReopenDecisionDigest",
        "decision",
        "lifecycleState",
        "displayState",
        "authority",
        "explicitOwnerAction",
        "localOwnerScopeDigest",
        "completionIdentityDigest",
        "taskId",
        "rootId",
        "workId",
        "previousExternalCompletionDecisionId",
        "previousExternalCompletionDecisionDigest",
        "reopenedAt",
        "sourceWritebackAttempted",
        "sourceCompletion",
        "outcomeVerified",
        "privacy",
    ], "external reopen decision");
    if (value.contractVersion !== exports.TASKMAP_LOCAL_EXTERNAL_REOPEN_DECISION_VERSION
        || value.decision !== "reopen_external_completion"
        || value.lifecycleState !== "open_in_daobrew"
        || value.displayState !== "Reopened in DaoBrew"
        || value.authority !== "explicit_local_owner"
        || value.explicitOwnerAction !== true
        || value.sourceWritebackAttempted !== false
        || value.sourceCompletion !== false
        || value.outcomeVerified !== false) {
        fail("external reopen decision boundary is invalid");
    }
    assertDigest(value.localOwnerScopeDigest, "local owner scope");
    assertDigest(value.completionIdentityDigest, "completion identity digest");
    if (typeof value.taskId !== "string" || !TASK_ID.test(value.taskId))
        fail("external reopen taskId is invalid");
    if (typeof value.rootId !== "string" || !ROOT_ID.test(value.rootId))
        fail("external reopen rootId is invalid");
    assertSafeId(value.workId, "external reopen workId");
    assertDigest(value.previousExternalCompletionDecisionDigest, "previous external completion digest");
    if (typeof value.previousExternalCompletionDecisionId !== "string"
        || EXTERNAL_COMPLETION_ID.exec(value.previousExternalCompletionDecisionId)?.[1] !== value.previousExternalCompletionDecisionDigest) {
        fail("previous external completion binding is invalid");
    }
    assertTimestamp(value.reopenedAt, "reopenedAt");
    assertPrivacy(value.privacy);
    assertDigest(value.externalReopenDecisionDigest, "external reopen decision digest");
    if (typeof value.externalReopenDecisionId !== "string"
        || EXTERNAL_REOPEN_ID.exec(value.externalReopenDecisionId)?.[1]
            !== value.externalReopenDecisionDigest) {
        fail("external reopen decision id is invalid");
    }
    const core = { ...value };
    delete core.externalReopenDecisionId;
    delete core.externalReopenDecisionDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)({ domain: EXTERNAL_REOPEN_DOMAIN, ...core })
        !== value.externalReopenDecisionDigest) {
        fail("external reopen decision seal is invalid");
    }
}
function assertTaskMapLocalLifecycleDecision(value) {
    assertPlainObject(value, "local lifecycle decision");
    if (value.decision === "close") {
        assertCloseRecord(value);
    }
    else if (value.decision === "reopen") {
        assertReopenRecord(value);
    }
    else if (value.decision === "complete_elsewhere") {
        assertExternalCompletionRecord(value);
    }
    else if (value.decision === "reopen_external_completion") {
        assertExternalReopenRecord(value);
    }
    else {
        fail("local lifecycle decision kind is invalid");
    }
}
function taskMapLocalLifecycleDecisionCanonicalBytes(value) {
    assertTaskMapLocalLifecycleDecision(value);
    return Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8");
}
function decisionId(value) {
    switch (value.decision) {
        case "close": return value.closeDecisionId;
        case "reopen": return value.reopenDecisionId;
        case "complete_elsewhere":
            return value.externalCompletionDecisionId;
        case "reopen_external_completion":
            return value.externalReopenDecisionId;
    }
}
function decisionAt(value) {
    switch (value.decision) {
        case "close": return value.closedAt;
        case "complete_elsewhere": return value.completedAt;
        case "reopen":
        case "reopen_external_completion":
            return value.reopenedAt;
    }
}
function normalizeHistory(values) {
    if (!Array.isArray(values)
        || values.length > exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1.maxLifecycleRecords) {
        fail("lifecycle history count is invalid");
    }
    const byId = new Map();
    for (const value of values) {
        assertTaskMapLocalLifecycleDecision(value);
        const id = decisionId(value);
        const prior = byId.get(id);
        if (prior !== undefined
            && (0, source_contracts_js_1.taskMapContractCanonicalJson)(prior)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)) {
            fail("a lifecycle decision id has conflicting contents");
        }
        byId.set(id, value);
    }
    const history = [...byId.values()].sort((left, right) => timestampMs(decisionAt(left)) - timestampMs(decisionAt(right))
        || decisionId(left).localeCompare(decisionId(right)));
    const closes = new Map(history
        .filter((row) => row.decision === "close")
        .map((row) => [row.closeDecisionId, row]));
    const externalCompletions = new Map(history
        .filter((row) => row.decision === "complete_elsewhere")
        .map((row) => [row.externalCompletionDecisionId, row]));
    for (const row of history) {
        if (row.decision === "reopen") {
            const close = closes.get(row.previousCloseDecisionId);
            if (close === undefined
                || close.closeDecisionDigest !== row.previousCloseDecisionDigest
                || close.localOwnerScopeDigest !== row.localOwnerScopeDigest
                || close.identity.completionIdentityDigest
                    !== row.completionIdentityDigest
                || close.identity.taskId !== row.taskId
                || close.identity.rootId !== row.rootId
                || close.identity.workId !== row.workId
                || timestampMs(row.reopenedAt) <= timestampMs(close.closedAt)) {
                fail("reopen record does not match its close record");
            }
        }
        else if (row.decision === "reopen_external_completion") {
            const completion = externalCompletions.get(row.previousExternalCompletionDecisionId);
            if (completion === undefined
                || completion.externalCompletionDecisionDigest
                    !== row.previousExternalCompletionDecisionDigest
                || completion.localOwnerScopeDigest !== row.localOwnerScopeDigest
                || completion.identity.completionIdentityDigest
                    !== row.completionIdentityDigest
                || completion.identity.taskId !== row.taskId
                || completion.identity.rootId !== row.rootId
                || completion.identity.workId !== row.workId
                || timestampMs(row.reopenedAt)
                    <= timestampMs(completion.completedAt)) {
                fail("external reopen does not match its completion record");
            }
        }
    }
    return history.map((row) => structuredClone(row));
}
function activeCloseRecords(history) {
    const reopenedCloseIds = new Set(history
        .filter((row) => row.decision === "reopen")
        .map((row) => row.previousCloseDecisionId));
    return history
        .filter((row) => row.decision === "close"
        && !reopenedCloseIds.has(row.closeDecisionId))
        .sort((left, right) => timestampMs(right.closedAt) - timestampMs(left.closedAt)
        || right.closeDecisionId.localeCompare(left.closeDecisionId));
}
function activeExternalCompletionRecords(history) {
    const reopenedIds = new Set(history
        .filter((row) => row.decision === "reopen_external_completion")
        .map((row) => row.previousExternalCompletionDecisionId));
    return history
        .filter((row) => row.decision === "complete_elsewhere"
        && !reopenedIds.has(row.externalCompletionDecisionId))
        .sort((left, right) => timestampMs(right.completedAt) - timestampMs(left.completedAt)
        || right.externalCompletionDecisionId.localeCompare(left.externalCompletionDecisionId));
}
/**
 * Validate a sealed lifecycle history without binding it to the current
 * owner. This is used only to quarantine pre-owner local state: callers may
 * suppress matching task IDs, but must not treat the result as current-owner
 * completion authority or rewrite any decision seal.
 */
function summarizeTaskMapLocalLifecycleHistory(lifecycleHistory) {
    const history = normalizeHistory(lifecycleHistory);
    if (history.length === 0) {
        fail("lifecycle history is empty");
    }
    const ownerDigests = new Set(history.map((row) => row.localOwnerScopeDigest));
    if (ownerDigests.size !== 1) {
        fail("lifecycle history crosses the local owner scope");
    }
    const localOwnerScopeDigest = history[0].localOwnerScopeDigest;
    assertDigest(localOwnerScopeDigest, "local owner scope");
    const activeTerminalTaskIds = [...new Set([
            ...activeCloseRecords(history).map((row) => row.identity.taskId),
            ...activeExternalCompletionRecords(history).map((row) => row.identity.taskId),
        ])].sort();
    return deepFreeze({
        localOwnerScopeDigest,
        activeTerminalTaskIds,
    });
}
function ownerScopedHistory(localOwnerScopeDigest, lifecycleHistory) {
    assertDigest(localOwnerScopeDigest, "local owner scope");
    const history = normalizeHistory(lifecycleHistory);
    if (history.some((row) => row.localOwnerScopeDigest !== localOwnerScopeDigest)) {
        fail("lifecycle history crosses the local owner scope");
    }
    return history;
}
function assertCandidate(value) {
    assertPlainObject(value, "leaf candidate");
    assertExactKeys(value, ["identity", "evidenceKind"], "leaf candidate");
    assertIdentity(value.identity);
    if (value.evidenceKind !== "authoritative_source"
        && value.evidenceKind !== "agent_session"
        && value.evidenceKind !== "meeting") {
        fail("leaf evidence kind is invalid");
    }
}
function normalizeNodes(values) {
    if (!Array.isArray(values)
        || values.length === 0
        || values.length > exports.TASKMAP_LOCAL_COMPLETION_LIMITS_V1.maxGraphNodes) {
        fail("active graph node count is invalid");
    }
    const nodes = values.map((row) => structuredClone(row));
    const byId = new Map();
    for (const node of nodes) {
        assertPlainObject(node, "active graph node");
        assertExactKeys(node, ["nodeId", "title", "kind", "parentNodeId", "candidate"], "active graph node");
        assertSafeId(node.nodeId, "active graph nodeId");
        assertText(node.title, "active graph title");
        if (byId.has(node.nodeId))
            fail("active graph repeats a nodeId");
        if (node.kind === "root") {
            if (node.parentNodeId !== null || node.candidate !== null) {
                fail("root shape is invalid");
            }
            if (!ROOT_ID.test(node.nodeId))
                fail("root nodeId is invalid");
        }
        else if (node.kind === "intermediate") {
            assertSafeId(node.parentNodeId, "intermediate parent");
            if (node.candidate !== null)
                fail("intermediate cannot be executable");
        }
        else if (node.kind === "leaf") {
            assertSafeId(node.parentNodeId, "leaf parent");
            if (!TASK_ID.test(node.nodeId))
                fail("leaf nodeId is invalid");
            assertCandidate(node.candidate);
            if (node.candidate.identity.taskId !== node.nodeId) {
                fail("leaf nodeId does not match its stable task identity");
            }
        }
        else {
            fail("active graph node kind is invalid");
        }
        byId.set(node.nodeId, node);
    }
    const children = new Map();
    for (const node of nodes) {
        children.set(node.nodeId, []);
    }
    for (const node of nodes) {
        if (node.parentNodeId === null)
            continue;
        if (!byId.has(node.parentNodeId)) {
            fail("active graph parent is missing");
        }
        children.get(node.parentNodeId).push(node.nodeId);
    }
    for (const [nodeId, rows] of children) {
        rows.sort();
        if (byId.get(nodeId)?.kind === "leaf" && rows.length > 0) {
            fail("leaf cannot contain descendants");
        }
    }
    for (const node of nodes) {
        const visited = new Set();
        let cursor = node;
        let root;
        while (cursor !== undefined) {
            if (visited.has(cursor.nodeId))
                fail("active graph contains a cycle");
            visited.add(cursor.nodeId);
            if (cursor.parentNodeId === null) {
                root = cursor;
                break;
            }
            cursor = byId.get(cursor.parentNodeId);
        }
        if (root?.kind !== "root")
            fail("active graph path has no root");
        if (node.kind === "leaf"
            && node.candidate.identity.rootId !== root.nodeId) {
            fail("leaf root identity does not match its active graph path");
        }
    }
    return { nodes, byId, children };
}
function identityKeys(value) {
    return new Set([
        value.canonicalSourceObjectKeyDigest,
        ...value.aliasSourceObjectKeyDigests,
    ]);
}
function matchBasis(candidate, terminal) {
    if (candidate.taskId === terminal.identity.taskId)
        return "task_id";
    if (candidate.workId === terminal.identity.workId)
        return "work_id";
    if (candidate.canonicalSourceObjectKeyDigest
        === terminal.identity.canonicalSourceObjectKeyDigest) {
        return "canonical_source_object_key";
    }
    const terminalKeys = identityKeys(terminal.identity);
    if ([...identityKeys(candidate)].some((key) => terminalKeys.has(key))) {
        return "bounded_source_alias";
    }
    return null;
}
function sourceRevisionConflict(candidate, close) {
    return (candidate.evidenceKind === "authoritative_source"
        && candidate.identity.sourceIdentityDigest
            !== close.identity.sourceIdentityDigest
        && timestampMs(candidate.identity.sourceRevisionObservedAt)
            > timestampMs(close.identity.sourceRevisionObservedAt));
}
/**
 * Enforces the single-terminal lifecycle invariant at the command boundary.
 * Stable task/work/source aliases are deliberately matched before any new
 * non-Reopen decision is built, so a terminal task cannot accumulate a
 * second hidden terminal disposition.
 */
function assertTaskMapLocalLifecycleMutationAllowed(input) {
    assertPlainObject(input, "lifecycle mutation input");
    assertExactKeys(input, ["localOwnerScopeDigest", "lifecycleHistory", "identity"], "lifecycle mutation input");
    assertIdentity(input.identity);
    const history = ownerScopedHistory(input.localOwnerScopeDigest, input.lifecycleHistory);
    const matched = [
        ...activeCloseRecords(history),
        ...activeExternalCompletionRecords(history),
    ].find((terminal) => matchBasis(input.identity, terminal) !== null);
    if (matched !== undefined) {
        fail("task already has an active terminal disposition; explicit Reopen is required");
    }
}
function readTaskMapLocalClosedTaskIds(input) {
    assertPlainObject(input, "closed task ids input");
    assertExactKeys(input, ["localOwnerScopeDigest", "lifecycleHistory"], "closed task ids input");
    const history = ownerScopedHistory(input.localOwnerScopeDigest, input.lifecycleHistory);
    return deepFreeze([
        ...new Set([
            ...activeCloseRecords(history),
            ...activeExternalCompletionRecords(history),
        ].map((row) => row.identity.taskId)),
    ].sort());
}
function readTaskMapLocalCompletionReviewState(input) {
    assertPlainObject(input, "completion review-state input");
    assertExactKeys(input, [
        "localOwnerScopeDigest",
        "lifecycleHistory",
        "candidate",
        "approvedPackage",
        "executionInspection",
        "observedAt",
    ], "completion review-state input");
    assertCandidate(input.candidate);
    const approved = projectionFromApprovedPackage(input.approvedPackage, input.localOwnerScopeDigest, input.candidate.identity);
    assertExecutionInspectionBoundary(input.executionInspection);
    assertTimestamp(input.observedAt, "review-state observedAt");
    assertBeforeOrEqual(approved.projection.generatedAt, input.observedAt, "review-state projection");
    assertBeforeOrEqual(input.candidate.identity.sourceRevisionObservedAt, input.observedAt, "review-state source revision");
    const history = ownerScopedHistory(input.localOwnerScopeDigest, input.lifecycleHistory);
    const closes = activeCloseRecords(history);
    const matched = closes
        .map((close) => ({
        close,
        basis: matchBasis(input.candidate.identity, close),
    }))
        .find((row) => row.basis !== null);
    const closedTaskIds = [
        ...new Set(closes.map((row) => row.identity.taskId)),
    ].sort();
    let reviewState;
    let canClose = false;
    let canKeepOpen = false;
    let canReopen = false;
    let reportBinding = null;
    if (matched !== undefined) {
        reviewState = sourceRevisionConflict(input.candidate, matched.close)
            ? "authoritative_source_conflict"
            : "closed_in_daobrew";
        canReopen = true;
        reportBinding = {
            projectionDigest: matched.close.binding.projection.projectionDigest,
            packageId: matched.close.binding.package.packageId,
            packageDigest: matched.close.binding.package.packageDigest,
            sessionId: matched.close.binding.session.sessionId,
            artifactReceiptDigest: matched.close.binding.artifact.artifactReceiptDigest,
            reportReceiptDigest: matched.close.binding.report.reportReceiptDigest,
        };
    }
    else if (input.executionInspection.progressState !== "report_ready") {
        reviewState = "awaiting_report";
    }
    else {
        assertReportReady(input.executionInspection, input.candidate.identity, input.observedAt);
        if (input.executionInspection.packageId !== approved.package.packageId
            || input.executionInspection.packageDigest
                !== approved.package.packageDigest) {
            fail("report_ready execution does not bind the approved package");
        }
        reviewState = "awaiting_review";
        canClose = true;
        canKeepOpen = true;
        reportBinding = {
            projectionDigest: approved.projection.projectionDigest,
            packageId: approved.package.packageId,
            packageDigest: approved.package.packageDigest,
            sessionId: input.executionInspection.sessionId,
            artifactReceiptDigest: input.executionInspection.artifactReceiptDigest,
            reportReceiptDigest: input.executionInspection.reportReceiptDigest,
        };
    }
    return deepFreeze({
        contractVersion: exports.TASKMAP_LOCAL_COMPLETION_REVIEW_STATE_VERSION,
        taskId: input.candidate.identity.taskId,
        rootId: input.candidate.identity.rootId,
        reviewState,
        canClose,
        canKeepOpen,
        canReopen,
        matchedCloseDecisionId: matched?.close.closeDecisionId ?? null,
        closedTaskIds,
        reportBinding,
        sourceWritebackAttempted: false,
        outcomeVerified: false,
    });
}
function applyTaskMapLocalCompletionOverlay(input) {
    assertPlainObject(input, "completion overlay input");
    assertExactKeys(input, ["localOwnerScopeDigest", "nodes", "lifecycleHistory"], "completion overlay input");
    const graph = normalizeNodes(input.nodes);
    const history = ownerScopedHistory(input.localOwnerScopeDigest, input.lifecycleHistory);
    const activeCloses = activeCloseRecords(history);
    const activeExternalCompletions = activeExternalCompletionRecords(history);
    const retained = new Set();
    const dispositions = [];
    const conflicts = [];
    for (const node of graph.nodes) {
        if (node.kind !== "leaf")
            continue;
        const externalMatch = activeExternalCompletions
            .map((completion) => ({
            completion,
            basis: matchBasis(node.candidate.identity, completion),
        }))
            .find((row) => row.basis !== null);
        if (externalMatch !== undefined) {
            dispositions.push({
                leafNodeId: node.nodeId,
                state: "completed_elsewhere",
                // Legacy field name retained for response compatibility. It contains
                // the matched terminal decision ID for either lifecycle kind.
                matchedCloseDecisionId: externalMatch.completion.externalCompletionDecisionId,
                matchBasis: externalMatch.basis,
            });
            continue;
        }
        let matched;
        for (const close of activeCloses) {
            const basis = matchBasis(node.candidate.identity, close);
            if (basis !== null) {
                matched = { close, basis };
                break;
            }
        }
        if (matched === undefined) {
            dispositions.push({
                leafNodeId: node.nodeId,
                state: "active",
                matchedCloseDecisionId: null,
                matchBasis: null,
            });
            let cursor = node;
            while (cursor !== undefined) {
                retained.add(cursor.nodeId);
                cursor = cursor.parentNodeId === null
                    ? undefined
                    : graph.byId.get(cursor.parentNodeId);
            }
            continue;
        }
        if (sourceRevisionConflict(node.candidate, matched.close)) {
            const conflictCore = {
                leafNodeId: node.nodeId,
                closeDecisionId: matched.close.closeDecisionId,
                matchBasis: matched.basis,
                closedSourceIdentityDigest: matched.close.identity.sourceIdentityDigest,
                closedSourceRevision: matched.close.identity.sourceRevision,
                closedSourceRevisionObservedAt: matched.close.identity.sourceRevisionObservedAt,
                candidateSourceIdentityDigest: node.candidate.identity.sourceIdentityDigest,
                candidateSourceRevision: node.candidate.identity.sourceRevision,
                candidateSourceRevisionObservedAt: node.candidate.identity.sourceRevisionObservedAt,
                resolution: "explicit_reopen_required",
            };
            conflicts.push({
                conflictId: `tmlocalconflict_${(0, source_contracts_js_1.taskMapContractDigest)({
                    domain: CONFLICT_DOMAIN,
                    ...conflictCore,
                })}`,
                ...conflictCore,
            });
            dispositions.push({
                leafNodeId: node.nodeId,
                state: "authoritative_source_conflict",
                matchedCloseDecisionId: matched.close.closeDecisionId,
                matchBasis: matched.basis,
            });
        }
        else {
            dispositions.push({
                leafNodeId: node.nodeId,
                state: "closed_in_daobrew",
                matchedCloseDecisionId: matched.close.closeDecisionId,
                matchBasis: matched.basis,
            });
        }
    }
    const activeNodes = graph.nodes
        .filter((node) => retained.has(node.nodeId))
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const prunedNodeIds = graph.nodes
        .filter((node) => !retained.has(node.nodeId))
        .map((node) => node.nodeId)
        .sort();
    dispositions.sort((left, right) => left.leafNodeId.localeCompare(right.leafNodeId));
    conflicts.sort((left, right) => left.leafNodeId.localeCompare(right.leafNodeId)
        || left.closeDecisionId.localeCompare(right.closeDecisionId));
    const core = {
        contractVersion: exports.TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION,
        localOwnerScopeDigest: input.localOwnerScopeDigest,
        activeGraph: { nodes: activeNodes },
        prunedNodeIds,
        leafDispositions: dispositions,
        sourceRevisionConflicts: conflicts,
        completionHistory: history,
        sourceWritebackAttempted: false,
        outcomeVerified: false,
    };
    const result = {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: OVERLAY_DOMAIN,
            ...core,
        }),
    };
    return deepFreeze(result);
}
function taskMapLocalCompletionOverlayCanonicalBytes(value) {
    assertPlainObject(value, "completion overlay");
    assertDigest(value.artifactDigest, "completion overlay digest");
    const core = { ...value };
    delete core.artifactDigest;
    if (value.contractVersion !== exports.TASKMAP_LOCAL_COMPLETION_OVERLAY_VERSION
        || value.sourceWritebackAttempted !== false
        || value.outcomeVerified !== false
        || (0, source_contracts_js_1.taskMapContractDigest)({ domain: OVERLAY_DOMAIN, ...core })
            !== value.artifactDigest) {
        fail("completion overlay seal is invalid");
    }
    return Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(value), "utf8");
}
