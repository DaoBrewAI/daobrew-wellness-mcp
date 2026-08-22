"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES = void 0;
exports.validateTaskMapNativeAgentSessionEpisodeAdmission = validateTaskMapNativeAgentSessionEpisodeAdmission;
exports.validateTaskMapNativeAgentSessionTaskProof = validateTaskMapNativeAgentSessionTaskProof;
exports.validateTaskMapNativeCurrentWork = validateTaskMapNativeCurrentWork;
exports.buildTaskMapNativeCurrentWorkSuccessor = buildTaskMapNativeCurrentWorkSuccessor;
const harness_js_1 = require("./harness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
exports.TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES = 256 * 1_024;
const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const MAX_TEXT_CHARACTERS = 4_096;
const MAX_CONTEXT_POINTERS = 128;
const MAX_DONE_ITEMS = 12;
function fail() {
    throw new Error("Task Map native current-work continuity failed");
}
function assertPlainObject(value) {
    if (value === null
        || typeof value !== "object"
        || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        fail();
    }
}
function assertExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length
        || actual.some((key, index) => key !== wanted[index])) {
        fail();
    }
}
function assertString(value, maximum = MAX_TEXT_CHARACTERS) {
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
        fail();
    }
}
function assertDigest(value) {
    if (typeof value !== "string" || !SHA256.test(value))
        fail();
}
function assertStrictTimestamp(value) {
    if (typeof value !== "string"
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value))) {
        fail();
    }
}
function validateTaskMapNativeAgentSessionEpisodeAdmission(value) {
    assertPlainObject(value);
    assertExactKeys(value, [
        "admission",
        "directive",
        "userDirectiveSummary",
        "episodeId",
        "episodeIdentityDigest",
        "episodeRevisionDigest",
        "rootSessionIdentityDigest",
        "occurredAt",
        "provider",
        "routingIdentityKind",
        "routingIdentityDigest",
        "completionAuthority",
        "reopenAuthority",
    ]);
    assertDigest(value.episodeIdentityDigest);
    assertDigest(value.episodeRevisionDigest);
    assertDigest(value.rootSessionIdentityDigest);
    assertDigest(value.routingIdentityDigest);
    assertStrictTimestamp(value.occurredAt);
    assertString(value.userDirectiveSummary, 360);
    if ((0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(value.userDirectiveSummary).length > 0) {
        fail();
    }
    if (value.admission !== "authenticated_fresh_agent_session"
        || value.directive !== "user_directive"
        || value.episodeId
            !== `tmaepisode_${(0, source_contracts_js_1.taskMapContractDigest)(value.episodeIdentityDigest).slice(0, 16)}`
        || (value.provider !== "codex" && value.provider !== "claude")
        || (value.routingIdentityKind !== "project"
            && value.routingIdentityKind !== "repository")
        || value.completionAuthority !== false
        || value.reopenAuthority !== false) {
        fail();
    }
    return structuredClone(value);
}
function validateTaskMapNativeAgentSessionTaskProof(value) {
    assertPlainObject(value);
    assertExactKeys(value, [
        "taskId",
        "candidateId",
        "candidateRevisionDigest",
        "evidenceProofDigests",
        "promotionId",
        "promotionDigest",
        "supportIdentityDigest",
        "supportEvidenceProofDigest",
        "episode",
    ]);
    assertString(value.taskId, 256);
    assertString(value.candidateId, 256);
    assertDigest(value.candidateRevisionDigest);
    assertDigest(value.promotionDigest);
    assertDigest(value.supportIdentityDigest);
    assertDigest(value.supportEvidenceProofDigest);
    if (!Array.isArray(value.evidenceProofDigests)
        || value.evidenceProofDigests.length === 0
        || value.evidenceProofDigests.length > 128)
        fail();
    value.evidenceProofDigests.forEach(assertDigest);
    const canonicalProofs = [...value.evidenceProofDigests].sort();
    if (new Set(canonicalProofs).size !== canonicalProofs.length
        || !sameCanonical(value.evidenceProofDigests, canonicalProofs)
        || !canonicalProofs.includes(value.supportEvidenceProofDigest)
        || value.candidateRevisionDigest !== (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(value.candidateId, canonicalProofs)
        || value.promotionId
            !== "tmcandidatepromotion_" + value.promotionDigest)
        fail();
    const episode = validateTaskMapNativeAgentSessionEpisodeAdmission(value.episode);
    return structuredClone({
        ...value,
        episode,
    });
}
function assertStringArray(value, maximumLength, maximumItemLength) {
    if (!Array.isArray(value) || value.length > maximumLength)
        fail();
    for (const item of value)
        assertString(item, maximumItemLength);
    if (new Set(value).size !== value.length)
        fail();
}
function sameCanonical(left, right) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(left)
        === (0, source_contracts_js_1.taskMapContractCanonicalJson)(right);
}
function expectedContextPointerIds(projection, task) {
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    return [...new Set([
            ...task.originPointerIds.filter((pointerId) => sourceById.get(pointerId)?.sourceKind !== "oura"),
            ...task.citations
                .filter((citation) => citation.sourceKind !== "oura")
                .map((citation) => citation.pointerId),
        ])].sort();
}
function expectedPredecessors(projection, taskId) {
    const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
    const predecessors = [];
    for (const edge of projection.edges) {
        let predecessorId;
        let relation;
        if (edge.relation === "depends_on" && edge.from === taskId) {
            predecessorId = edge.to;
            relation = "depends_on";
        }
        else if (edge.relation === "blocks" && edge.to === taskId) {
            predecessorId = edge.from;
            relation = "blocks";
        }
        if (predecessorId === undefined || relation === undefined)
            continue;
        const task = tasks.get(predecessorId);
        if (task === undefined)
            fail();
        predecessors.push({
            taskId: task.id,
            relation,
            reviewState: task.reviewState,
            openState: task.openState,
        });
    }
    return predecessors.sort((left, right) => left.taskId.localeCompare(right.taskId)
        || left.relation.localeCompare(right.relation));
}
function currentSourceBacks(projection, task) {
    const homeId = task.taskHomePointerId;
    if (task.reviewState !== "accepted"
        || task.openState !== "open"
        || (task.sourceStatus !== "open" && task.sourceStatus !== "in_progress")
        || task.authority === "none"
        || homeId === undefined
        || !task.originPointerIds.includes(homeId)) {
        return false;
    }
    const source = projection.sources.find((row) => row.id === homeId);
    return (source !== undefined
        && source.authority === task.authority
        && source.sourceKind !== "oura"
        && source.sourceKind !== "codex_session"
        && source.sourceKind !== "claude_session"
        && source.capabilities.includes("read_task")
        && typeof source.sourceVersion === "string"
        && source.sourceVersion.trim().length > 0
        && task.citations.some((citation) => citation.pointerId === homeId
            && citation.sourceKind === source.sourceKind));
}
function assertCurrentness(projection, currentness) {
    if (currentness.contractVersion !== "taskmap-native-currentness-gate.v1"
        || currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest
            !== (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest
        || currentness.taskDispositions.length !== projection.tasks.length) {
        fail();
    }
    const dispositions = new Map(currentness.taskDispositions.map((row) => [
        row.taskId,
        row.disposition,
    ]));
    if (dispositions.size !== projection.tasks.length
        || projection.tasks.some((task) => !dispositions.has(task.id))) {
        fail();
    }
}
function validateTaskMapNativeCurrentWork(value, rawBytes, projection, currentness) {
    assertPlainObject(value);
    assertExactKeys(value, [
        "contractVersion",
        "projection",
        "currentGoal",
        ...(Object.prototype.hasOwnProperty.call(value, "agentSessionTaskProofs") ? ["agentSessionTaskProofs"] : []),
        "nextTaskToProve",
        "privacy",
        "artifactDigest",
    ]);
    if (value.contractVersion !== "taskmap-current-work.v1"
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(value) !== rawBytes.toString("utf8")) {
        fail();
    }
    assertDigest(value.artifactDigest);
    const digestCore = { ...value };
    delete digestCore.artifactDigest;
    if ((0, source_contracts_js_1.taskMapContractDigest)(digestCore) !== value.artifactDigest)
        fail();
    assertPlainObject(value.projection);
    assertExactKeys(value.projection, [
        "contractVersion",
        "runId",
        "inputDigest",
        "generatedAt",
        "projectionDigest",
    ]);
    assertString(value.projection.contractVersion, 128);
    assertString(value.projection.runId, 256);
    assertDigest(value.projection.inputDigest);
    assertStrictTimestamp(value.projection.generatedAt);
    assertDigest(value.projection.projectionDigest);
    assertPlainObject(value.currentGoal);
    assertExactKeys(value.currentGoal, ["rootId", "title", "accepted"]);
    assertString(value.currentGoal.rootId, 256);
    assertString(value.currentGoal.title);
    if (value.currentGoal.accepted !== true)
        fail();
    if (Object.prototype.hasOwnProperty.call(value, "agentSessionTaskProofs")) {
        if (!Array.isArray(value.agentSessionTaskProofs)
            || value.agentSessionTaskProofs.length > 128)
            fail();
        const rows = value.agentSessionTaskProofs.map(validateTaskMapNativeAgentSessionTaskProof);
        const taskIds = rows.map((row) => row.taskId);
        if (new Set(taskIds).size !== taskIds.length
            || !sameCanonical(taskIds, [...taskIds].sort())
            || taskIds.some((taskId) => !projection.tasks.some((task) => task.id === taskId)))
            fail();
    }
    assertPlainObject(value.nextTaskToProve);
    assertExactKeys(value.nextTaskToProve, [
        "taskId",
        "rootId",
        "outcome",
        "input",
        "predecessors",
        "doneDefinition",
        "permission",
        "returnTarget",
        "executable",
    ]);
    assertString(value.nextTaskToProve.taskId, 256);
    assertString(value.nextTaskToProve.rootId, 256);
    assertString(value.nextTaskToProve.outcome, 320);
    assertPlainObject(value.nextTaskToProve.input);
    const inputKeys = [
        "summary",
        "contextPointerIds",
        ...(Object.prototype.hasOwnProperty.call(value.nextTaskToProve.input, "agentSessionEpisode")
            ? ["agentSessionEpisode"]
            : []),
    ];
    assertExactKeys(value.nextTaskToProve.input, inputKeys);
    assertString(value.nextTaskToProve.input.summary, 320);
    assertStringArray(value.nextTaskToProve.input.contextPointerIds, MAX_CONTEXT_POINTERS, 512);
    if (Object.prototype.hasOwnProperty.call(value.nextTaskToProve.input, "agentSessionEpisode")) {
        validateTaskMapNativeAgentSessionEpisodeAdmission(value.nextTaskToProve.input.agentSessionEpisode);
    }
    assertStringArray(value.nextTaskToProve.doneDefinition, MAX_DONE_ITEMS, 240);
    if (value.nextTaskToProve.doneDefinition.length === 0)
        fail();
    if (!Array.isArray(value.nextTaskToProve.predecessors)
        || value.nextTaskToProve.predecessors.length > 256) {
        fail();
    }
    for (const predecessor of value.nextTaskToProve.predecessors) {
        assertPlainObject(predecessor);
        assertExactKeys(predecessor, [
            "taskId",
            "relation",
            "reviewState",
            "openState",
        ]);
        assertString(predecessor.taskId, 256);
        if (predecessor.relation !== "depends_on"
            && predecessor.relation !== "blocks") {
            fail();
        }
        assertString(predecessor.reviewState, 64);
        assertString(predecessor.openState, 64);
    }
    assertPlainObject(value.nextTaskToProve.permission);
    assertExactKeys(value.nextTaskToProve.permission, [
        "requiresExplicitApproval",
        "approvalGranted",
    ]);
    if (value.nextTaskToProve.permission.requiresExplicitApproval !== true
        || value.nextTaskToProve.permission.approvalGranted !== false
        || value.nextTaskToProve.executable !== false) {
        fail();
    }
    assertPlainObject(value.nextTaskToProve.returnTarget);
    const target = value.nextTaskToProve.returnTarget;
    if (target.state === "user_destination_required") {
        assertExactKeys(target, ["state"]);
    }
    else if (target.state === "source_owned"
        || target.state === "source_return"
        || target.state === "personal_fork") {
        assertExactKeys(target, ["state", "pointerId"]);
        assertString(target.pointerId, 512);
    }
    else {
        fail();
    }
    assertPlainObject(value.privacy);
    assertExactKeys(value.privacy, [
        "sourceBodiesStored",
        "localPathsStored",
        "rawBiometricsStored",
    ]);
    if (value.privacy.sourceBodiesStored !== false
        || value.privacy.localPathsStored !== false
        || value.privacy.rawBiometricsStored !== false) {
        fail();
    }
    assertCurrentness(projection, currentness);
    if (projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || value.projection.contractVersion !== projection.contractVersion
        || value.projection.runId !== projection.runId
        || value.projection.inputDigest !== projection.inputDigest
        || value.projection.generatedAt !== projection.generatedAt
        || value.projection.projectionDigest !== currentness.projectionDigest) {
        fail();
    }
    const currentWork = value;
    const leaf = currentWork.nextTaskToProve;
    if (!TASK_ID.test(leaf.taskId)
        || !ROOT_ID.test(leaf.rootId)
        || !ROOT_ID.test(currentWork.currentGoal.rootId)
        || currentWork.currentGoal.rootId !== leaf.rootId) {
        fail();
    }
    const root = projection.roots.find((row) => row.id === leaf.rootId);
    const task = projection.tasks.find((row) => row.id === leaf.taskId);
    const disposition = currentness.taskDispositions.find((row) => row.taskId === leaf.taskId)?.disposition;
    if (root === undefined
        || task === undefined
        || disposition !== "current"
        || task.rootId !== root.id
        || !root.taskIds.includes(task.id)
        || !currentSourceBacks(projection, task)
        || task.citations.every((citation) => citation.sourceKind === "oura")) {
        fail();
    }
    if (leaf.returnTarget.state === "user_destination_required"
        || !projection.sources.some((source) => "pointerId" in leaf.returnTarget
            && source.id === leaf.returnTarget.pointerId)) {
        fail();
    }
    const expectedReturnTarget = task.returnRoute.state === "user_destination_required"
        ? { state: task.returnRoute.state }
        : {
            state: task.returnRoute.state,
            pointerId: task.returnRoute.pointerId,
        };
    if (task.returnRoute.requiresApproval !== true
        || !sameCanonical(leaf.returnTarget, expectedReturnTarget)
        || !sameCanonical(leaf.input.contextPointerIds, expectedContextPointerIds(projection, task))
        || !sameCanonical(leaf.predecessors, expectedPredecessors(projection, task.id))
        || (0, harness_js_1.taskMapProjectionPrivacyLeakReasons)(leaf).length > 0) {
        fail();
    }
    return currentWork;
}
function buildTaskMapNativeCurrentWorkSuccessor(predecessorValue, predecessorBytes, predecessorProjection, predecessorCurrentness, successorProjection, successorCurrentness, agentSessionEpisode = null, agentSessionTaskProofs) {
    const predecessor = validateTaskMapNativeCurrentWork(predecessorValue, predecessorBytes, predecessorProjection, predecessorCurrentness);
    const { artifactDigest: _predecessorArtifactDigest, ...predecessorCore } = structuredClone(predecessor);
    const successorCore = {
        ...predecessorCore,
        projection: {
            contractVersion: successorProjection.contractVersion,
            runId: successorProjection.runId,
            inputDigest: successorProjection.inputDigest,
            generatedAt: successorProjection.generatedAt,
            projectionDigest: successorCurrentness.projectionDigest,
        },
        nextTaskToProve: {
            ...predecessorCore.nextTaskToProve,
            input: {
                summary: predecessorCore.nextTaskToProve.input.summary,
                contextPointerIds: [
                    ...predecessorCore.nextTaskToProve.input.contextPointerIds,
                ],
                ...(agentSessionEpisode === null
                    ? {}
                    : {
                        agentSessionEpisode: structuredClone(agentSessionEpisode),
                    }),
            },
        },
    };
    if (agentSessionTaskProofs !== undefined) {
        successorCore.agentSessionTaskProofs = agentSessionTaskProofs
            .map((row) => validateTaskMapNativeAgentSessionTaskProof(row))
            .sort((left, right) => left.taskId.localeCompare(right.taskId));
    }
    const successor = {
        ...successorCore,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(successorCore),
    };
    return validateTaskMapNativeCurrentWork(successor, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(successor), "utf8"), successorProjection, successorCurrentness);
}
