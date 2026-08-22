"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const SHA256 = /^[a-f0-9]{64}$/;
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`refresh-test:${label}`);
const LANE_IDS = {
    collectCalendar: "collect-google-calendar",
    collectGranola: "collect-granola",
    normalizeCalendar: "normalize-google-calendar",
    normalizeGranola: "normalize-granola",
    identityBarrier: "identity-dedupe-barrier",
    authorityGate: "deterministic-authority-gate",
    lifecycleGate: "deterministic-lifecycle-gate",
    projection: "taskmap-projection",
    publication: "publication",
};
const SOURCE_ARTIFACTS = {
    calendar: {
        bindingDigest: digest("binding-google-calendar"),
        sourceIdentityDigest: digest("identity-google-calendar"),
        currentRevisionDigest: digest("revision-google-calendar-current"),
        currentContentDigest: digest("content-google-calendar-current"),
        priorRevisionDigest: digest("revision-google-calendar-prior"),
        priorContentDigest: digest("content-google-calendar-prior"),
        priorCheckpointDigest: digest("calendar-last-good-checkpoint"),
        priorSourceSliceDigest: digest("calendar-last-good-source-slice"),
    },
    granola: {
        bindingDigest: digest("binding-granola"),
        sourceIdentityDigest: digest("identity-granola"),
        currentRevisionDigest: digest("revision-granola-current"),
        currentContentDigest: digest("content-granola-current"),
        priorRevisionDigest: digest("revision-granola-prior"),
        priorContentDigest: digest("content-granola-prior"),
        priorCheckpointDigest: digest("granola-last-good-checkpoint"),
        priorSourceSliceDigest: digest("granola-last-good-source-slice"),
    },
};
const REVIEWED_DIGESTS = {
    truthSetDigest: digest("truth-set"),
    reviewBatchDigest: digest("review-batch"),
    reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
    reviewAttestationDigest: digest("review-attestation"),
    sourceManifestDigest: digest("source-manifest"),
};
function canonicalPolicyBindings() {
    return [
        {
            name: "identity-policy",
            version: "identity-policy.1",
            digest: digest("policy-identity"),
        },
        {
            name: "normalization-policy",
            version: "normalization-policy.1",
            digest: digest("policy-normalization"),
        },
        {
            name: "publication-policy",
            version: "publication-policy.1",
            digest: digest("policy-publication"),
        },
        {
            name: "scheduling-policy",
            version: "scheduling-policy.1",
            digest: digest("policy-scheduling"),
        },
        {
            name: "source-policy",
            version: "source-policy.1",
            digest: digest("policy-source"),
        },
    ];
}
function lane(value) {
    return {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION,
        ...value,
    };
}
function canonicalLanes() {
    return [
        lane({
            laneId: LANE_IDS.collectCalendar,
            goal: "provider_collect",
            operationVersion: "google-calendar-collect.1",
            priority: "P0",
            priorityReasonCodes: ["source_freshness"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "provider:google_calendar",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: true,
            inputDigests: [
                SOURCE_ARTIFACTS.calendar.bindingDigest,
                SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            ],
            outputKinds: ["connector_checkpoint", "source_slice"],
        }),
        lane({
            laneId: LANE_IDS.collectGranola,
            goal: "provider_collect",
            operationVersion: "granola-collect.1",
            priority: "P0",
            priorityReasonCodes: ["source_freshness"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "provider:granola",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: true,
            inputDigests: [
                SOURCE_ARTIFACTS.granola.bindingDigest,
                SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
                SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
            ],
            outputKinds: ["connector_checkpoint", "source_slice"],
        }),
        lane({
            laneId: LANE_IDS.normalizeCalendar,
            goal: "source_normalize",
            operationVersion: "google-calendar-normalize.1",
            priority: "P0",
            priorityReasonCodes: ["identity_integrity"],
            predecessorLaneIds: [LANE_IDS.collectCalendar],
            resourceClaims: [{
                    resourceId: "taskmap:normalization",
                    mode: "shared",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                SOURCE_ARTIFACTS.calendar.bindingDigest,
                SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            ],
            outputKinds: ["normalized_source"],
        }),
        lane({
            laneId: LANE_IDS.normalizeGranola,
            goal: "source_normalize",
            operationVersion: "granola-normalize.1",
            priority: "P0",
            priorityReasonCodes: ["identity_integrity"],
            predecessorLaneIds: [LANE_IDS.collectGranola],
            resourceClaims: [{
                    resourceId: "taskmap:normalization",
                    mode: "shared",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                SOURCE_ARTIFACTS.granola.bindingDigest,
                SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
                SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
            ],
            outputKinds: ["normalized_source"],
        }),
        lane({
            laneId: LANE_IDS.identityBarrier,
            goal: "identity_dedupe_barrier",
            operationVersion: "taskmap-identity-dedupe.1",
            priority: "P0",
            priorityReasonCodes: ["identity_integrity"],
            predecessorLaneIds: [
                LANE_IDS.normalizeCalendar,
                LANE_IDS.normalizeGranola,
            ],
            resourceClaims: [{
                    resourceId: "taskmap:identity",
                    mode: "exclusive",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                digest("semantic-google-calendar-current"),
                digest("semantic-granola-current"),
            ],
            outputKinds: ["identity_set"],
        }),
        lane({
            laneId: LANE_IDS.authorityGate,
            goal: "deterministic_gate",
            operationVersion: "taskmap-authority-gate.1",
            priority: "P0",
            priorityReasonCodes: ["deterministic_replay"],
            predecessorLaneIds: [LANE_IDS.identityBarrier],
            resourceClaims: [{
                    resourceId: "taskmap:deterministic-gates",
                    mode: "shared",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                digest("review-attestation"),
                digest("policy-authority"),
            ],
            outputKinds: ["gate_decision"],
        }),
        lane({
            laneId: LANE_IDS.lifecycleGate,
            goal: "deterministic_gate",
            operationVersion: "taskmap-lifecycle-gate.1",
            priority: "P0",
            priorityReasonCodes: ["deterministic_replay"],
            predecessorLaneIds: [LANE_IDS.identityBarrier],
            resourceClaims: [{
                    resourceId: "taskmap:deterministic-gates",
                    mode: "shared",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                digest("truth-set"),
                digest("policy-lifecycle"),
            ],
            outputKinds: ["gate_decision"],
        }),
        lane({
            laneId: LANE_IDS.projection,
            goal: "taskmap_projection",
            operationVersion: "taskmap-projection.1",
            priority: "P0",
            priorityReasonCodes: ["publication_safety"],
            predecessorLaneIds: [
                LANE_IDS.authorityGate,
                LANE_IDS.lifecycleGate,
            ],
            resourceClaims: [{
                    resourceId: "taskmap:projection",
                    mode: "exclusive",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                digest("truth-set"),
                digest("review-batch"),
                digest("replay-current"),
            ],
            outputKinds: ["taskmap_projection"],
        }),
        lane({
            laneId: LANE_IDS.publication,
            goal: "publication",
            operationVersion: "taskmap-publication.1",
            priority: "P0",
            priorityReasonCodes: ["publication_safety"],
            predecessorLaneIds: [LANE_IDS.projection],
            resourceClaims: [{
                    resourceId: "taskmap:accepted-head",
                    mode: "exclusive",
                }],
            effect: "local_state",
            requiredForPublication: true,
            inputDigests: [
                digest("source-manifest"),
                digest("replay-current"),
            ],
            outputKinds: ["accepted_state"],
        }),
    ];
}
function revisionSetsFor(revisions, bindingDigests) {
    return [...bindingDigests]
        .sort()
        .map((bindingDigest) => ({
        bindingDigest,
        revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(revisions
            .filter((revision) => revision.bindingDigest === bindingDigest)
            .map((revision) => ({
            sourceIdentityDigest: revision.sourceIdentityDigest,
            sourceRevisionDigest: revision.sourceRevisionDigest,
            contentDigest: revision.contentDigest,
        }))
            .sort((left, right) => (left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
            || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
            || left.contentDigest.localeCompare(right.contentDigest)))),
    }));
}
function canonicalDraft() {
    const bindingDigests = [
        SOURCE_ARTIFACTS.calendar.bindingDigest,
        SOURCE_ARTIFACTS.granola.bindingDigest,
    ];
    const acceptedSourceRevisions = [
        {
            bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
            sourceIdentityDigest: SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
            sourceRevisionDigest: SOURCE_ARTIFACTS.calendar.priorRevisionDigest,
            contentDigest: SOURCE_ARTIFACTS.calendar.priorContentDigest,
        },
        {
            bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
            sourceIdentityDigest: SOURCE_ARTIFACTS.granola.sourceIdentityDigest,
            sourceRevisionDigest: SOURCE_ARTIFACTS.granola.priorRevisionDigest,
            contentDigest: SOURCE_ARTIFACTS.granola.priorContentDigest,
        },
    ];
    const sourceRevisions = [
        {
            bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
            sourceIdentityDigest: SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
            sourceRevisionDigest: SOURCE_ARTIFACTS.calendar.currentRevisionDigest,
            contentDigest: SOURCE_ARTIFACTS.calendar.currentContentDigest,
        },
        {
            bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
            sourceIdentityDigest: SOURCE_ARTIFACTS.granola.sourceIdentityDigest,
            sourceRevisionDigest: SOURCE_ARTIFACTS.granola.currentRevisionDigest,
            contentDigest: SOURCE_ARTIFACTS.granola.currentContentDigest,
        },
    ];
    return {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
        ownerScopeDigest: digest("owner-scope"),
        baseline: {
            kind: "accepted",
            priorCheckpointDigests: [
                SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
            ],
            priorSourceSliceDigests: [
                SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
            ],
            priorProviderArtifacts: [
                {
                    bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
                    checkpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                    sourceSliceDigest: SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                },
                {
                    bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
                    checkpointDigest: SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
                    sourceSliceDigest: SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
                },
            ],
            priorAcceptedStateDigest: digest("accepted-state-prior"),
            priorOwnerScopeDigest: digest("owner-scope"),
            priorSourceSnapshotDigest: digest("source-snapshot-prior"),
            priorReviewedEvidenceDigest: digest("reviewed-evidence-prior"),
            priorPolicyBundleDigest: (0, source_contracts_js_1.taskMapContractDigest)(canonicalPolicyBindings()),
            priorSemanticImplementationDigest: digest("semantic-implementation-prior"),
            acceptedSourceRevisions,
            acceptedSourceRevisionSets: revisionSetsFor(acceptedSourceRevisions, bindingDigests),
            acceptedSemanticInputDigests: [
                digest("semantic-google-calendar-prior"),
                digest("semantic-granola-prior"),
            ],
            acceptedDeterministicReplayDigest: digest("replay-prior"),
        },
        reviewedDigests: { ...REVIEWED_DIGESTS },
        sourceBindings: [
            {
                bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
                sourceKind: "google_calendar",
                sourceContractVersion: "taskmap-source-envelope.v1",
                adapterVersion: "google-calendar-adapter.1",
            },
            {
                bindingDigest: SOURCE_ARTIFACTS.granola.bindingDigest,
                sourceKind: "granola",
                sourceContractVersion: "taskmap-source-envelope.v1",
                adapterVersion: "granola-adapter.1",
            },
        ],
        sourceRevisions,
        sourceRevisionSets: revisionSetsFor(sourceRevisions, bindingDigests),
        semanticInputDigests: [
            digest("semantic-google-calendar-current"),
            digest("semantic-granola-current"),
        ],
        deterministicReplayDigest: digest("replay-current"),
        policyBindings: canonicalPolicyBindings(),
        lanes: canonicalLanes(),
    };
}
function exactNoOpDraft() {
    const draft = canonicalDraft();
    draft.baseline.acceptedSourceRevisions =
        structuredClone(draft.sourceRevisions);
    draft.baseline.acceptedSourceRevisionSets =
        structuredClone(draft.sourceRevisionSets);
    draft.baseline.acceptedSemanticInputDigests = [
        ...draft.semanticInputDigests,
    ];
    draft.baseline.acceptedDeterministicReplayDigest =
        draft.deterministicReplayDigest;
    draft.baseline.priorReviewedEvidenceDigest =
        (0, source_contracts_js_1.taskMapContractDigest)(draft.reviewedDigests);
    draft.baseline.priorPolicyBundleDigest =
        (0, source_contracts_js_1.taskMapContractDigest)(draft.policyBindings);
    draft.baseline.priorSemanticImplementationDigest =
        (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft).semanticImplementationDigest;
    return draft;
}
function laneById(draft, laneId) {
    const found = draft.lanes.find((candidate) => candidate.laneId === laneId);
    node_assert_1.default.ok(found, `missing test lane ${laneId}`);
    return found;
}
function planLaneById(plan, laneId) {
    const found = plan.lanes.find((candidate) => candidate.laneId === laneId);
    node_assert_1.default.ok(found, `missing plan lane ${laneId}`);
    return found;
}
function laneStates(plan, overrides = {}) {
    return plan.lanes.map((plannedLane) => ({
        laneId: plannedLane.laneId,
        status: "pending",
        ...overrides[plannedLane.laneId],
    }));
}
function optionalAuditLane(laneId, options = {}) {
    const priority = options.priority ?? "P2";
    return lane({
        laneId,
        goal: "refresh_audit",
        operationVersion: options.operationVersion ?? `audit.${digest(laneId).slice(0, 16)}`,
        priority,
        priorityReasonCodes: options.priorityReasonCodes
            ?? [priority === "P1" ? "optional_enrichment" : "optional_audit"],
        predecessorLaneIds: options.predecessorLaneIds ?? [],
        resourceClaims: options.resourceClaims ?? [{
                resourceId: `audit:${digest(`claim-${laneId}`)}`,
                mode: "shared",
            }],
        effect: "read_only",
        requiredForPublication: false,
        inputDigests: options.inputDigests ?? [digest(`input-${laneId}`)],
        outputKinds: ["refresh_audit"],
    });
}
function largeSelectablePlanDraft(evidenceItemCount) {
    const draft = canonicalDraft();
    draft.baseline.acceptedSourceRevisions = Array.from({ length: evidenceItemCount }, (_, index) => ({
        bindingDigest: index % 2 === 0
            ? SOURCE_ARTIFACTS.calendar.bindingDigest
            : SOURCE_ARTIFACTS.granola.bindingDigest,
        sourceIdentityDigest: digest(`boundary-accepted-identity-${index}`),
        sourceRevisionDigest: digest(`boundary-accepted-revision-${index}`),
        contentDigest: digest(`boundary-accepted-content-${index}`),
    }));
    draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(draft.baseline.acceptedSourceRevisions, draft.baseline.priorProviderArtifacts.map((artifact) => artifact.bindingDigest));
    draft.semanticInputDigests = Array.from({ length: evidenceItemCount }, (_, index) => digest(`boundary-current-semantic-${index}`));
    draft.baseline.acceptedSemanticInputDigests = Array.from({ length: evidenceItemCount }, (_, index) => digest(`boundary-accepted-semantic-${index}`));
    const rootLaneIds = [];
    const coreLaneCount = draft.lanes.length;
    while (draft.lanes.length < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes) {
        const index = draft.lanes.length - coreLaneCount;
        const laneId = longSafeIdentifier("boundarylane", index);
        if (rootLaneIds.length < 4)
            rootLaneIds.push(laneId);
        draft.lanes.push(optionalAuditLane(laneId, {
            operationVersion: longSafeIdentifier("boundaryoperation", index),
            predecessorLaneIds: index < 4 ? [] : [...rootLaneIds],
            resourceClaims: Array.from({ length: 4 }, (_, claimIndex) => ({
                resourceId: longSafeIdentifier("boundaryresource", index * 4 + claimIndex),
                mode: "shared",
            })),
            inputDigests: Array.from({ length: 4 }, (_, inputIndex) => digest(`boundary-lane-input-${index}-${inputIndex}`)),
        }));
    }
    return draft;
}
function longSafeIdentifier(prefix, index) {
    const head = `${prefix}${String(index).padStart(6, "0")}`;
    node_assert_1.default.ok(head.length <= 160);
    return `${head}${"x".repeat(160 - head.length)}`;
}
function rawLaneArrayItemCount(draft, key) {
    return draft.lanes.reduce((total, plannedLane) => total + plannedLane[key].length, 0);
}
function draftAtAggregateInputLimit() {
    const draft = canonicalDraft();
    let remaining = (refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests
        - rawLaneArrayItemCount(draft, "inputDigests"));
    let laneIndex = 0;
    while (remaining > 0) {
        const inputCount = Math.min(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxInputDigestsPerLane, remaining);
        draft.lanes.push(optionalAuditLane(`input-bound-${laneIndex}`, {
            inputDigests: Array.from({ length: inputCount }, (_, inputIndex) => digest(`input-bound-${laneIndex}-${inputIndex}`)),
        }));
        remaining -= inputCount;
        laneIndex += 1;
    }
    return draft;
}
function draftAtAggregatePredecessorLimit() {
    const draft = canonicalDraft();
    const producerLaneIds = Array.from({ length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane }, (_, index) => `edge-producer-${index}`);
    for (const laneId of producerLaneIds) {
        draft.lanes.push(optionalAuditLane(laneId));
    }
    let remaining = (refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges
        - rawLaneArrayItemCount(draft, "predecessorLaneIds"));
    let consumerIndex = 0;
    while (remaining > 0) {
        const predecessorCount = Math.min(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane, remaining);
        draft.lanes.push(optionalAuditLane(`edge-consumer-${consumerIndex}`, {
            predecessorLaneIds: producerLaneIds.slice(0, predecessorCount),
        }));
        remaining -= predecessorCount;
        consumerIndex += 1;
    }
    return draft;
}
function publicationRecord(batch) {
    const record = batch;
    if (record.publication && typeof record.publication === "object") {
        return record.publication;
    }
    return {
        state: record.publicationState,
        candidateAcceptedStateDigest: record.candidateAcceptedStateDigest,
        acceptedStateDigest: record.acceptedStateDigest,
        preservedAcceptedStateDigest: record.preservedAcceptedStateDigest,
        preservesPriorAcceptedState: record.preservesPriorAcceptedState,
    };
}
function publicationState(batch) {
    const state = publicationRecord(batch).state;
    node_assert_1.default.strictEqual(typeof state, "string", "batch must expose publication state");
    return String(state);
}
function candidateAcceptedStateDigest(plan, batch) {
    const planRecord = plan;
    const publication = batch ? publicationRecord(batch) : {};
    const value = publication.candidateAcceptedStateDigest
        ?? planRecord.candidateAcceptedStateDigest
        ?? planRecord.candidateStateDigest;
    node_assert_1.default.match(String(value), SHA256, "plan/batch must expose a full candidate accepted-state digest");
    return String(value);
}
function preservedAcceptedStateDigest(batch) {
    const publication = publicationRecord(batch);
    const value = publication.preservedAcceptedStateDigest
        ?? publication.acceptedStateDigest
        ?? publication.currentAcceptedStateDigest
        ?? publication.priorAcceptedStateDigest;
    node_assert_1.default.match(String(value), SHA256, "blocked/no-op publication must expose the preserved accepted-state digest");
    return String(value);
}
function isExactNoOp(plan) {
    const record = plan;
    return Boolean(record.isExactNoOp ?? record.exactNoOp);
}
function expectDraftRejection(mutate, expected) {
    const draft = canonicalDraft();
    mutate(draft);
    node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), expected);
}
function stateOverridesThroughBarrier() {
    return {
        [LANE_IDS.collectCalendar]: { status: "succeeded" },
        [LANE_IDS.collectGranola]: { status: "succeeded" },
        [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
        [LANE_IDS.normalizeGranola]: { status: "succeeded" },
        [LANE_IDS.identityBarrier]: { status: "succeeded" },
    };
}
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
}
function shuffleInPlace(values, random) {
    for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
}
function permutedDraft(seed) {
    const draft = structuredClone(canonicalDraft());
    const random = seededRandom(seed);
    shuffleInPlace(draft.baseline.priorCheckpointDigests, random);
    shuffleInPlace(draft.baseline.priorSourceSliceDigests, random);
    shuffleInPlace(draft.baseline.priorProviderArtifacts, random);
    shuffleInPlace(draft.baseline.acceptedSourceRevisions, random);
    shuffleInPlace(draft.baseline.acceptedSourceRevisionSets, random);
    shuffleInPlace(draft.baseline.acceptedSemanticInputDigests, random);
    shuffleInPlace(draft.sourceBindings, random);
    shuffleInPlace(draft.sourceRevisions, random);
    shuffleInPlace(draft.sourceRevisionSets, random);
    shuffleInPlace(draft.semanticInputDigests, random);
    shuffleInPlace(draft.policyBindings, random);
    shuffleInPlace(draft.lanes, random);
    for (const item of draft.lanes) {
        shuffleInPlace(item.priorityReasonCodes, random);
        shuffleInPlace(item.predecessorLaneIds, random);
        shuffleInPlace(item.resourceClaims, random);
        shuffleInPlace(item.inputDigests, random);
        shuffleInPlace(item.outputKinds, random);
    }
    return draft;
}
function schedulingOracle(plan, states, maxConcurrency) {
    const stateByLaneId = new Map(states.map((state) => [state.laneId, state]));
    const laneByLaneId = new Map(plan.lanes.map((plannedLane) => [plannedLane.laneId, plannedLane]));
    const runningLaneIds = new Set(states
        .filter((state) => state.status === "running")
        .map((state) => state.laneId));
    const reservations = plan.lanes
        .filter((plannedLane) => runningLaneIds.has(plannedLane.laneId))
        .flatMap((plannedLane) => plannedLane.resourceClaims);
    const capacity = Math.max(0, maxConcurrency - runningLaneIds.size);
    const priorityValue = (priority) => (priority === "P0" ? 0 : priority === "P1" ? 1 : 2);
    const ready = plan.lanes
        .filter((plannedLane) => (stateByLaneId.get(plannedLane.laneId)?.status === "pending"))
        .filter((plannedLane) => plannedLane.predecessorLaneIds.every((predecessorLaneId) => (stateByLaneId.get(predecessorLaneId)?.status === "succeeded")))
        .sort((left, right) => (priorityValue(left.priority) - priorityValue(right.priority)
        || left.laneId.localeCompare(right.laneId)));
    const selected = [];
    for (const plannedLane of ready) {
        if (selected.length >= capacity)
            break;
        const conflicts = plannedLane.resourceClaims.some((claim) => (reservations.some((reservation) => (claim.resourceId === reservation.resourceId
            && (claim.mode === "exclusive" || reservation.mode === "exclusive")))));
        if (conflicts)
            continue;
        selected.push(plannedLane.laneId);
        reservations.push(...laneByLaneId.get(plannedLane.laneId).resourceClaims);
    }
    return selected;
}
(0, node_test_1.describe)("Task Map refresh plan contract", () => {
    (0, node_test_1.it)("exports explicit v1 draft, plan, lane, and batch versions", () => {
        node_assert_1.default.strictEqual(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION, "taskmap-refresh-plan-draft.v1");
        node_assert_1.default.strictEqual(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_VERSION, "taskmap-refresh-plan.v1");
        node_assert_1.default.strictEqual(refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION, "taskmap-refresh-lane.v1");
        node_assert_1.default.strictEqual(refresh_plan_js_1.TASKMAP_REFRESH_BATCH_VERSION, "taskmap-refresh-ready-batch.v1");
        node_assert_1.default.strictEqual(refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION, "taskmap-owner-review-attestation.v2");
        node_assert_1.default.deepStrictEqual(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1, {
            maxLanes: 1_024,
            maxConcurrency: 64,
            maxPriorityReasonCodesPerLane: 64,
            maxOutputKindsPerLane: 64,
            maxResourceClaimsPerLane: 4_096,
            maxTotalResourceClaims: 4_096,
            maxInputDigestsPerLane: 256,
            maxPredecessorsPerLane: 256,
            maxTotalInputDigests: 4_096,
            maxTotalPredecessorEdges: 4_096,
            maxRawStringBytes: 4_096,
            maxRawNestingDepth: 64,
            maxRawObjectKeys: 64,
            maxRawNodes: 131_072,
            maxCanonicalPlanBytes: 4 * 1_024 * 1_024,
        });
    });
    (0, node_test_1.it)("canonicalizes every set-like input and produces byte-identical plans", () => {
        const firstDraft = canonicalDraft();
        const reordered = structuredClone(firstDraft);
        reordered.baseline.priorCheckpointDigests.reverse();
        reordered.baseline.priorSourceSliceDigests.reverse();
        reordered.baseline.acceptedSourceRevisions.reverse();
        reordered.baseline.acceptedSourceRevisionSets.reverse();
        reordered.baseline.acceptedSemanticInputDigests.reverse();
        reordered.sourceBindings.reverse();
        reordered.sourceRevisions.reverse();
        reordered.sourceRevisionSets.reverse();
        reordered.semanticInputDigests.reverse();
        reordered.policyBindings.reverse();
        reordered.lanes.reverse();
        for (const item of reordered.lanes) {
            item.priorityReasonCodes.reverse();
            item.predecessorLaneIds.reverse();
            item.resourceClaims.reverse();
            item.inputDigests.reverse();
            item.outputKinds.reverse();
        }
        const first = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(firstDraft);
        const second = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(reordered);
        node_assert_1.default.deepStrictEqual(second, first);
        node_assert_1.default.strictEqual(JSON.stringify(second), JSON.stringify(first));
        node_assert_1.default.match(first.planId, /^tmrefreshplan_[a-f0-9]{64}$/);
        node_assert_1.default.ok(Object.isFrozen(first));
        node_assert_1.default.ok(Object.isFrozen(first.lanes));
    });
    (0, node_test_1.it)("keeps 100 seeded plan and batch permutations byte-identical", () => {
        const expectedPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const expectedStates = laneStates(expectedPlan, {
            [LANE_IDS.collectCalendar]: { status: "succeeded" },
            [LANE_IDS.collectGranola]: { status: "succeeded" },
        });
        const expectedBatch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(expectedPlan, {
            maxConcurrency: 4,
            laneStates: expectedStates,
        });
        for (let seed = 1; seed <= 100; seed += 1) {
            const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(permutedDraft(seed));
            const states = structuredClone(expectedStates);
            shuffleInPlace(states, seededRandom(seed ^ 0x5eed));
            const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 4,
                laneStates: states,
            });
            node_assert_1.default.strictEqual(JSON.stringify(plan), JSON.stringify(expectedPlan), `plan permutation ${seed}`);
            node_assert_1.default.strictEqual(JSON.stringify(batch), JSON.stringify(expectedBatch), `batch permutation ${seed}`);
        }
    });
    (0, node_test_1.it)("rejects oversize lane child arrays before Set construction and accepts their raw limits", () => {
        const nearLimit = canonicalDraft();
        const collect = laneById(nearLimit, LANE_IDS.collectCalendar);
        collect.priorityReasonCodes = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPriorityReasonCodesPerLane).fill("source_freshness");
        collect.outputKinds = Array.from({
            length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxOutputKindsPerLane,
        }, (_, index) => (index % 2 === 0 ? "connector_checkpoint" : "source_slice"));
        const nearPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(nearLimit);
        node_assert_1.default.deepStrictEqual(planLaneById(nearPlan, LANE_IDS.collectCalendar).priorityReasonCodes, ["source_freshness"]);
        node_assert_1.default.deepStrictEqual(planLaneById(nearPlan, LANE_IDS.collectCalendar).outputKinds, ["connector_checkpoint", "source_slice"]);
        const oversizePriority = canonicalDraft();
        laneById(oversizePriority, LANE_IDS.collectCalendar).priorityReasonCodes = [
            "unknown_reason",
            ...Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1
                .maxPriorityReasonCodesPerLane).fill("source_freshness"),
        ];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(oversizePriority), /priorityReasonCodes exceed the per-lane bound of 64/i);
        const oversizeOutputs = canonicalDraft();
        laneById(oversizeOutputs, LANE_IDS.collectCalendar).outputKinds = [
            "unknown_output",
            ...Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxOutputKindsPerLane).fill("connector_checkpoint"),
        ];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(oversizeOutputs), /outputKinds exceed the per-lane bound of 64/i);
        const oversizeInputs = canonicalDraft();
        laneById(oversizeInputs, LANE_IDS.identityBarrier).inputDigests =
            Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxInputDigestsPerLane + 1).fill("not-a-digest");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(oversizeInputs), /lane inputDigests exceed the per-lane bound of 256/i);
        const oversizePredecessors = canonicalDraft();
        laneById(oversizePredecessors, LANE_IDS.identityBarrier).predecessorLaneIds = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxPredecessorsPerLane + 1).fill("NOT A SAFE IDENTIFIER");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(oversizePredecessors), /predecessorLaneIds exceed the per-lane bound of 256/i);
    });
    (0, node_test_1.it)("rejects lane count before mapping and accepts a valid 1024-lane plan", () => {
        const rawOversize = canonicalDraft();
        rawOversize.lanes = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1).fill(null);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(rawOversize), /bounded non-empty lane set/i);
        const nearLimit = canonicalDraft();
        while (nearLimit.lanes.length
            < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes) {
            nearLimit.lanes.push(optionalAuditLane(`lane-bound-${nearLimit.lanes.length}`));
        }
        node_assert_1.default.strictEqual((0, refresh_plan_js_1.buildTaskMapRefreshPlan)(nearLimit).lanes.length, refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes);
    });
    (0, node_test_1.it)("enforces aggregate input and predecessor caps before normalization with exact-limit controls", () => {
        const exactInputs = draftAtAggregateInputLimit();
        node_assert_1.default.strictEqual(rawLaneArrayItemCount(exactInputs, "inputDigests"), refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests);
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exactInputs));
        const tooManyInputs = structuredClone(exactInputs);
        tooManyInputs.lanes[0].goal =
            "invalid_goal";
        tooManyInputs.lanes.at(-1).inputDigests.push(digest("one-input-over-the-aggregate-limit"));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(tooManyInputs), /exceeds 4096 total lane input digests/i);
        const exactEdges = draftAtAggregatePredecessorLimit();
        node_assert_1.default.strictEqual(rawLaneArrayItemCount(exactEdges, "predecessorLaneIds"), refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges);
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exactEdges));
        const tooManyEdges = structuredClone(exactEdges);
        tooManyEdges.lanes[0].goal =
            "invalid_goal";
        const finalConsumer = tooManyEdges.lanes.at(-1);
        finalConsumer.predecessorLaneIds.push("edge-producer-255");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(tooManyEdges), /exceeds 4096 predecessor edges/i);
    });
    (0, node_test_1.it)("enforces the aggregate resource-claim cap with an exact-limit control", () => {
        const exact = canonicalDraft();
        const remainingClaims = (refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims
            - rawLaneArrayItemCount(exact, "resourceClaims"));
        exact.lanes.push(optionalAuditLane("claim-bound-control", {
            resourceClaims: Array.from({ length: remainingClaims }, (_, index) => ({
                resourceId: `audit:claim-bound:${String(index).padStart(4, "0")}`,
                mode: "shared",
            })),
        }));
        node_assert_1.default.strictEqual(rawLaneArrayItemCount(exact, "resourceClaims"), refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims);
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exact));
        const tooMany = structuredClone(exact);
        tooMany.lanes[0].goal =
            "invalid_goal";
        tooMany.lanes.at(-1).resourceClaims.push({
            resourceId: "audit:claim-bound:over",
            mode: "shared",
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(tooMany), /exceeds 4096 total resource claims/i);
    });
    (0, node_test_1.it)("rejects a normalized canonical plan above the 4 MiB member ceiling", () => {
        const draft = canonicalDraft();
        draft.baseline.acceptedSourceRevisions = Array.from({ length: 4_096 }, (_, index) => ({
            bindingDigest: index % 2 === 0
                ? SOURCE_ARTIFACTS.calendar.bindingDigest
                : SOURCE_ARTIFACTS.granola.bindingDigest,
            sourceIdentityDigest: digest(`large-accepted-identity-${index}`),
            sourceRevisionDigest: digest(`large-accepted-revision-${index}`),
            contentDigest: digest(`large-accepted-content-${index}`),
        }));
        draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(draft.baseline.acceptedSourceRevisions, draft.baseline.priorProviderArtifacts.map((artifact) => artifact.bindingDigest));
        draft.semanticInputDigests = Array.from({ length: 4_096 }, (_, index) => digest(`large-current-semantic-${index}`));
        draft.baseline.acceptedSemanticInputDigests = Array.from({ length: 4_096 }, (_, index) => digest(`large-accepted-semantic-${index}`));
        const rootLaneIds = [];
        const coreLaneCount = draft.lanes.length;
        while (draft.lanes.length < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes) {
            const index = draft.lanes.length - coreLaneCount;
            const laneId = longSafeIdentifier("oversizelane", index);
            if (rootLaneIds.length < 4)
                rootLaneIds.push(laneId);
            draft.lanes.push(optionalAuditLane(laneId, {
                operationVersion: longSafeIdentifier("operation", index),
                predecessorLaneIds: index < 4 ? [] : [...rootLaneIds],
                resourceClaims: Array.from({ length: 4 }, (_, claimIndex) => ({
                    resourceId: longSafeIdentifier("resource", index * 4 + claimIndex),
                    mode: "shared",
                })),
                inputDigests: Array.from({ length: 4 }, (_, inputIndex) => digest(`large-lane-input-${index}-${inputIndex}`)),
            }));
        }
        node_assert_1.default.ok(rawLaneArrayItemCount(draft, "inputDigests")
            <= refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalInputDigests);
        node_assert_1.default.ok(rawLaneArrayItemCount(draft, "predecessorLaneIds")
            <= refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalPredecessorEdges);
        node_assert_1.default.ok(rawLaneArrayItemCount(draft, "resourceClaims")
            <= refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxTotalResourceClaims);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /canonical refresh plan exceeds 4194304 bytes/i);
    });
    (0, node_test_1.it)("rejects forged derived fields through assertTaskMapRefreshPlan", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const mutations = [
            ["planId", (value) => {
                    value.planId = `tmrefreshplan_${digest("forged-plan-id")}`;
                }],
            ["laneDigest", (value) => {
                    (value.lanes[0]).laneDigest =
                        digest("forged-lane-digest");
                }],
            ["candidateAcceptedStateDigest", (value) => {
                    value.candidateAcceptedStateDigest =
                        digest("forged-candidate-accepted-state");
                }],
            ["semanticImplementationDigest", (value) => {
                    value.semanticImplementationDigest =
                        digest("forged-semantic-implementation");
                }],
            ["reviewedEvidenceDigest", (value) => {
                    value.reviewedEvidenceDigest =
                        digest("forged-reviewed-evidence");
                }],
            ["policyBundleDigest", (value) => {
                    value.policyBundleDigest = digest("forged-policy-bundle");
                }],
            ["sourceRevisionDigests", (value) => {
                    value.sourceRevisionDigests = [
                        digest("forged-source-revision-set"),
                    ];
                }],
            ["isExactNoOp", (value) => {
                    value.isExactNoOp = true;
                }],
            ["privacy", (value) => {
                    value.privacy.participantDetailsStored = true;
                }],
            ["refreshReasonCodes", (value) => {
                    value.refreshReasonCodes = ["genesis"];
                }],
            ["barrierPolicyVersion", (value) => {
                    value.barrierPolicyVersion =
                        "taskmap-refresh-all-settled-barrier.2";
                }],
            ["requirednessPolicyVersion", (value) => {
                    value.requirednessPolicyVersion =
                        "taskmap-refresh-requiredness.2";
                }],
            ["schedulingPolicyVersion", (value) => {
                    value.schedulingPolicyVersion =
                        "taskmap-refresh-scheduling.2";
                }],
            ["lane priority policy", (value) => {
                    (value.lanes[0]).priorityReasonCodes = [
                        "privacy_safety",
                    ];
                }],
        ];
        for (const [label, mutate] of mutations) {
            const forged = structuredClone(plan);
            mutate(forged);
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(forged), /canonical|derived|invalid|policy|priority/i, label);
        }
    });
    (0, node_test_1.it)("rejects oversized forged plans before validator iteration or cloning", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const tooManyLanes = structuredClone(plan);
        tooManyLanes.lanes = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1).fill(null);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(tooManyLanes), /bounded non-empty lane set/i);
        const oversizedLaneChild = structuredClone(plan);
        (oversizedLaneChild.lanes[0])
            .priorityReasonCodes = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1
            .maxPriorityReasonCodesPerLane + 1).fill("unknown_reason");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedLaneChild), /priorityReasonCodes exceed the per-lane bound of 64/i);
        const oversizedTopLevel = structuredClone(plan);
        oversizedTopLevel.semanticInputDigests = Array(4_097).fill("not-a-digest");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedTopLevel), /semanticInputDigests exceeds its raw array bound of 4096/i);
        const oversizedBaseline = structuredClone(plan);
        oversizedBaseline.baseline
            .acceptedSourceRevisions = Array(4_097).fill(null);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedBaseline), /acceptedSourceRevisions exceeds its raw array bound of 4096/i);
        const oversizedNodeGraph = structuredClone(plan);
        (oversizedNodeGraph.sourceBindings[0])
            .adapterVersion = Array(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNodes + 1).fill(0);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedNodeGraph), /raw node budget 131072/i);
        const oversizedObject = structuredClone(plan);
        (oversizedObject.sourceBindings[0])
            .adapterVersion = Object.fromEntries(Array.from({
            length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
        }, (_, index) => [`key${index}`, 0]));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedObject), /object exceeds 64 keys/i);
        const accessorBacked = structuredClone(plan);
        let accessorReads = 0;
        Object.defineProperty(accessorBacked.lanes[0], "operationVersion", {
            enumerable: true,
            configurable: true,
            get: () => {
                accessorReads += 1;
                return "forged-accessor.1";
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(accessorBacked), /accessor-backed values/i);
        node_assert_1.default.strictEqual(accessorReads, 0);
        const hiddenAccessor = structuredClone(plan);
        const originalLanes = hiddenAccessor.lanes;
        let hiddenAccessorReads = 0;
        Object.defineProperty(hiddenAccessor, "lanes", {
            enumerable: false,
            configurable: true,
            get: () => {
                hiddenAccessorReads += 1;
                return originalLanes;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(hiddenAccessor), /accessor-backed values/i);
        node_assert_1.default.strictEqual(hiddenAccessorReads, 0);
        const symbolBacked = structuredClone(plan);
        let iteratorReads = 0;
        Object.defineProperty(symbolBacked.lanes, Symbol.iterator, {
            enumerable: false,
            configurable: true,
            get: () => {
                iteratorReads += 1;
                return Array.prototype[Symbol.iterator];
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(symbolBacked), /symbol-keyed values/i);
        node_assert_1.default.strictEqual(iteratorReads, 0);
        for (const mutate of [
            (value) => {
                (value.lanes[0]).operationVersion =
                    `operation${"x".repeat(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes)}`;
            },
            (value) => {
                const firstLane = value.lanes[0];
                (firstLane.resourceClaims[0]).resourceId =
                    `resource:${"x".repeat(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes)}`;
            },
        ]) {
            const oversizedScalar = structuredClone(plan);
            mutate(oversizedScalar);
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedScalar), /raw string exceeds 4096 bytes/i);
        }
        const aggregateInputPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draftAtAggregateInputLimit());
        const oversizedAggregate = structuredClone(aggregateInputPlan);
        oversizedAggregate.lanes.at(-1)
            .inputDigests.push(digest("validator-aggregate-input-over"));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(oversizedAggregate), /exceeds 4096 total lane input digests/i);
    });
    (0, node_test_1.it)("descriptor-first preflights untrusted drafts before any property read", () => {
        const wideUnknown = canonicalDraft();
        wideUnknown.unexpectedWide = Object.fromEntries(Array.from({
            length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
        }, (_, index) => [`unknown${index}`, 0]));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(wideUnknown), /object exceeds 64 keys/i);
        const hugeScalar = canonicalDraft();
        hugeScalar.ownerScopeDigest = "x".repeat(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes + 1);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(hugeScalar), /raw string exceeds 4096 bytes/i);
        const nested = canonicalDraft();
        let nestedValue = 0;
        for (let depth = 0; depth < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNestingDepth + 2; depth += 1) {
            nestedValue = [nestedValue];
        }
        nested.unexpectedNested = nestedValue;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(nested), /raw nesting depth 64/i);
        const topLevelAccessor = canonicalDraft();
        const originalContractVersion = topLevelAccessor.contractVersion;
        let topLevelReads = 0;
        Object.defineProperty(topLevelAccessor, "contractVersion", {
            enumerable: true,
            configurable: true,
            get: () => {
                topLevelReads += 1;
                return originalContractVersion;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(topLevelAccessor), /accessor-backed values/i);
        node_assert_1.default.strictEqual(topLevelReads, 0);
        const symbolBacked = canonicalDraft();
        let symbolReads = 0;
        Object.defineProperty(symbolBacked, Symbol("forged-draft"), {
            enumerable: false,
            configurable: true,
            get: () => {
                symbolReads += 1;
                return true;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(symbolBacked), /symbol-keyed values/i);
        node_assert_1.default.strictEqual(symbolReads, 0);
        const hidden = canonicalDraft();
        Object.defineProperty(hidden, "hiddenDraftField", {
            enumerable: false,
            configurable: true,
            value: true,
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(hidden), /hidden properties/i);
        const sparse = canonicalDraft();
        const sparseLanes = new Array(sparse.lanes.length + 1);
        sparseLanes[0] = sparse.lanes[0];
        for (let index = 1; index < sparse.lanes.length; index += 1) {
            sparseLanes[index + 1] = sparse.lanes[index];
        }
        sparse.lanes = sparseLanes;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(sparse), /holes or hidden elements/i);
        const cyclic = canonicalDraft();
        cyclic.unexpectedCycle = cyclic;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(cyclic), /cyclic values/i);
        const proxiedDraft = canonicalDraft();
        let draftProxyReads = 0;
        proxiedDraft.lanes = new Proxy(proxiedDraft.lanes, {
            get: (target, property, receiver) => {
                draftProxyReads += 1;
                return Reflect.get(target, property, receiver);
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(proxiedDraft), /cannot be snapshotted as plain JSON data/i);
        node_assert_1.default.strictEqual(draftProxyReads, 0);
    });
    (0, node_test_1.it)("rejects a Proxy-backed built plan without executing get traps", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        let planProxyReads = 0;
        const proxiedPlan = new Proxy(plan, {
            get: (target, property, receiver) => {
                planProxyReads += 1;
                return Reflect.get(target, property, receiver);
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(proxiedPlan), /cannot be snapshotted as plain JSON data/i);
        node_assert_1.default.strictEqual(planProxyReads, 0);
    });
    (0, node_test_1.it)("snapshots each public refresh-plan boundary exactly once", () => {
        const originalStructuredClone = globalThis.structuredClone;
        let cloneCalls = 0;
        globalThis.structuredClone = ((value) => {
            cloneCalls += 1;
            return originalStructuredClone(value);
        });
        try {
            const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
            node_assert_1.default.strictEqual(cloneCalls, 1);
            cloneCalls = 0;
            (0, refresh_plan_js_1.assertTaskMapRefreshPlan)(plan);
            node_assert_1.default.strictEqual(cloneCalls, 1);
            cloneCalls = 0;
            (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 2,
                laneStates: laneStates(plan),
            });
            node_assert_1.default.strictEqual(cloneCalls, 1);
        }
        finally {
            globalThis.structuredClone = originalStructuredClone;
        }
    });
    (0, node_test_1.it)("binds the exact review-attestation version and ignores reviewed-field order", () => {
        const first = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const reordered = canonicalDraft();
        reordered.reviewedDigests = {
            sourceManifestDigest: REVIEWED_DIGESTS.sourceManifestDigest,
            reviewAttestationDigest: REVIEWED_DIGESTS.reviewAttestationDigest,
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewBatchDigest: REVIEWED_DIGESTS.reviewBatchDigest,
            truthSetDigest: REVIEWED_DIGESTS.truthSetDigest,
        };
        const second = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(reordered);
        node_assert_1.default.strictEqual(second.planId, first.planId);
        node_assert_1.default.strictEqual(second.reviewedEvidenceDigest, first.reviewedEvidenceDigest);
        const wrongVersion = canonicalDraft();
        wrongVersion.reviewedDigests
            .reviewAttestationVersion = "taskmap-owner-review-attestation.v1";
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(wrongVersion), /review attestation version.*unsupported/i);
        const unknownField = canonicalDraft();
        unknownField.reviewedDigests.reviewerIdentity =
            digest("must-not-enter-contract");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(unknownField), /reviewed digests.*unknown|forbidden.*reviewerIdentity/i);
    });
    (0, node_test_1.it)("rejects duplicate lanes, missing predecessors, self edges, and cycles", () => {
        const duplicate = canonicalDraft();
        duplicate.lanes.push(structuredClone(duplicate.lanes[0]));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(duplicate), /duplicate.*lane|lane.*duplicate/i);
        const missing = canonicalDraft();
        laneById(missing, LANE_IDS.identityBarrier)
            .predecessorLaneIds.push("missing-normalizer");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(missing), /missing|unknown.*predecessor/i);
        const self = canonicalDraft();
        laneById(self, LANE_IDS.normalizeCalendar)
            .predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(self), /self|cycle/i);
        const cycle = canonicalDraft();
        laneById(cycle, LANE_IDS.collectCalendar)
            .predecessorLaneIds.push(LANE_IDS.publication);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(cycle), /cycle/i);
    });
    (0, node_test_1.it)("rejects an incomplete all-settled barrier and direct pre-barrier bypass", () => {
        const omittedNormalizer = canonicalDraft();
        laneById(omittedNormalizer, LANE_IDS.identityBarrier)
            .predecessorLaneIds = [LANE_IDS.normalizeCalendar];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(omittedNormalizer), /barrier must directly all-settle every normalization lane/i);
        const directBypass = canonicalDraft();
        laneById(directBypass, LANE_IDS.authorityGate)
            .predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(directBypass), /downstream lanes cannot consume pre-barrier outputs/i);
    });
    (0, node_test_1.it)("keeps every provider ancestor binding-local until the barrier", () => {
        const crossBindingCases = [
            ["crossed replacement", (draft) => {
                    laneById(draft, LANE_IDS.normalizeCalendar).predecessorLaneIds = [LANE_IDS.collectGranola];
                    laneById(draft, LANE_IDS.normalizeGranola).predecessorLaneIds = [LANE_IDS.collectCalendar];
                }],
            ["additive collect predecessor", (draft) => {
                    laneById(draft, LANE_IDS.normalizeCalendar).predecessorLaneIds.push(LANE_IDS.collectGranola);
                }],
            ["cross-binding collect chain", (draft) => {
                    laneById(draft, LANE_IDS.collectGranola).predecessorLaneIds.push(LANE_IDS.collectCalendar);
                }],
            ["cross-binding normalize chain", (draft) => {
                    laneById(draft, LANE_IDS.normalizeGranola).predecessorLaneIds.push(LANE_IDS.normalizeCalendar);
                }],
        ];
        for (const [label, mutate] of crossBindingCases) {
            const draft = canonicalDraft();
            mutate(draft);
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /binding-local|same-binding|cross-binding/i, label);
        }
        const sameBindingChain = canonicalDraft();
        sameBindingChain.lanes.push(lane({
            laneId: "collect-google-calendar-bootstrap",
            goal: "provider_collect",
            operationVersion: "google-calendar-bootstrap.1",
            priority: "P0",
            priorityReasonCodes: ["source_freshness"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "provider:google_calendar",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: true,
            inputDigests: [
                SOURCE_ARTIFACTS.calendar.bindingDigest,
                SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            ],
            outputKinds: ["connector_checkpoint", "source_slice"],
        }));
        laneById(sameBindingChain, LANE_IDS.collectCalendar).predecessorLaneIds = ["collect-google-calendar-bootstrap"];
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(sameBindingChain));
    });
    (0, node_test_1.it)("derives core requiredness and rejects a caller-forged false value", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        for (const item of plan.lanes) {
            node_assert_1.default.strictEqual(item.requiredForPublication, true, `${item.laneId} is a core publication lane`);
        }
        const forged = canonicalDraft();
        laneById(forged, LANE_IDS.identityBarrier).requiredForPublication = false;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(forged), /requiredForPublication|core.*required/i);
    });
    (0, node_test_1.it)("derives core versus optional priority classes from closed stages", () => {
        const downgradedCore = canonicalDraft();
        const authorityGate = laneById(downgradedCore, LANE_IDS.authorityGate);
        authorityGate.priority = "P1";
        authorityGate.priorityReasonCodes = ["connector_visibility"];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(downgradedCore), /policy-derived from stage|priority/i);
        const upgradedOptional = canonicalDraft();
        upgradedOptional.lanes.push(lane({
            laneId: "optional-priority-forgery",
            goal: "refresh_audit",
            operationVersion: "optional-priority-forgery.1",
            priority: "P0",
            priorityReasonCodes: ["source_freshness"],
            predecessorLaneIds: [LANE_IDS.projection],
            resourceClaims: [{
                    resourceId: "optional:priority-forgery",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-priority-forgery")],
            outputKinds: ["refresh_audit"],
        }));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(upgradedOptional), /policy-derived from stage|priority/i);
    });
    (0, node_test_1.it)("canonicalizes identical claims and rejects contradictory modes", () => {
        const base = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const duplicated = canonicalDraft();
        const duplicatedLane = laneById(duplicated, LANE_IDS.collectCalendar);
        duplicatedLane.resourceClaims.push(structuredClone(duplicatedLane.resourceClaims[0]));
        const canonical = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(duplicated);
        node_assert_1.default.strictEqual(canonical.planId, base.planId);
        node_assert_1.default.deepStrictEqual(planLaneById(canonical, LANE_IDS.collectCalendar).resourceClaims, planLaneById(base, LANE_IDS.collectCalendar).resourceClaims);
        const contradictory = canonicalDraft();
        const contradictoryLane = laneById(contradictory, LANE_IDS.collectCalendar);
        contradictoryLane.resourceClaims.push({
            resourceId: contradictoryLane.resourceClaims[0].resourceId,
            mode: "exclusive",
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(contradictory), /contradictory.*shared.*exclusive/i);
    });
    (0, node_test_1.it)("requires explicit claims and an exclusive external-mutation claim", () => {
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft()), "parallel canonical provider/normalization claims remain valid");
        for (const [label, laneId] of [
            ["read_only", LANE_IDS.collectCalendar],
            ["local_state", LANE_IDS.normalizeCalendar],
        ]) {
            const draft = canonicalDraft();
            laneById(draft, laneId).resourceClaims = [];
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /resource claims.*must not be empty|at least one resource claim/i, label);
        }
        const emptyExternal = canonicalDraft();
        const emptyExternalPublication = laneById(emptyExternal, LANE_IDS.publication);
        emptyExternalPublication.effect = "external_mutation";
        emptyExternalPublication.approvalGateId = "approval:publication";
        emptyExternalPublication.resourceClaims = [];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(emptyExternal), /resource claims.*must not be empty|at least one resource claim/i);
        const sharedOnlyExternal = canonicalDraft();
        const sharedOnlyPublication = laneById(sharedOnlyExternal, LANE_IDS.publication);
        sharedOnlyPublication.effect = "external_mutation";
        sharedOnlyPublication.approvalGateId = "approval:publication";
        sharedOnlyPublication.resourceClaims = [{
                resourceId: "taskmap:accepted-head",
                mode: "shared",
            }];
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(sharedOnlyExternal), /external_mutation.*exclusive|exclusive.*external_mutation/i);
    });
    (0, node_test_1.it)("rejects the same source identity+revision with changed content", () => {
        const draft = canonicalDraft();
        const prior = draft.baseline.acceptedSourceRevisions[0];
        draft.sourceRevisions[0] = {
            bindingDigest: prior.bindingDigest,
            sourceIdentityDigest: prior.sourceIdentityDigest,
            sourceRevisionDigest: prior.sourceRevisionDigest,
            contentDigest: digest("forged-content-at-same-revision"),
        };
        draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, draft.sourceBindings.map((binding) => binding.bindingDigest));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /identical source identity and revision cannot change content/i);
    });
    (0, node_test_1.it)("joins every source revision to a declared binding and binds reassignment into identity", () => {
        const undeclared = canonicalDraft();
        undeclared.sourceRevisions[0].bindingDigest =
            digest("undeclared-source-binding");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(undeclared), /undeclared source binding|current source revision/i);
        const base = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exactNoOpDraft());
        const reassigned = exactNoOpDraft();
        const firstBinding = reassigned.sourceRevisions[0].bindingDigest;
        reassigned.sourceRevisions[0].bindingDigest =
            reassigned.sourceRevisions[1].bindingDigest;
        reassigned.sourceRevisions[1].bindingDigest = firstBinding;
        reassigned.sourceRevisionSets = revisionSetsFor(reassigned.sourceRevisions, reassigned.sourceBindings.map((binding) => binding.bindingDigest));
        const reassignedPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(reassigned);
        node_assert_1.default.strictEqual(reassignedPlan.isExactNoOp, false);
        node_assert_1.default.notStrictEqual(reassignedPlan.planId, base.planId);
        node_assert_1.default.notStrictEqual(reassignedPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
    });
    (0, node_test_1.it)("supports more than 253 same-binding revisions without provider-lane enumeration", () => {
        const draft = canonicalDraft();
        const calendarRevisions = Array.from({ length: 300 }, (_, index) => ({
            bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
            sourceIdentityDigest: digest(`calendar-identity-${index}`),
            sourceRevisionDigest: digest(`calendar-revision-${index}`),
            contentDigest: digest(`calendar-content-${index}`),
        }));
        draft.sourceRevisions = [
            ...calendarRevisions,
            structuredClone(draft.sourceRevisions[1]),
        ];
        draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, draft.sourceBindings.map((binding) => binding.bindingDigest));
        const first = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const reordered = structuredClone(draft);
        reordered.sourceRevisions.reverse();
        const second = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(reordered);
        node_assert_1.default.deepStrictEqual(second, first);
        node_assert_1.default.strictEqual(first.sourceRevisions.length, 301);
        node_assert_1.default.ok(Buffer.byteLength(JSON.stringify(first), "utf8")
            < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes);
        for (const laneId of [
            LANE_IDS.collectCalendar,
            LANE_IDS.normalizeCalendar,
        ]) {
            node_assert_1.default.deepStrictEqual(planLaneById(first, laneId).inputDigests, [
                SOURCE_ARTIFACTS.calendar.bindingDigest,
                SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
            ].sort());
        }
    });
    (0, node_test_1.it)("accepts a single active binding with a legitimate empty revision set", () => {
        const draft = canonicalDraft();
        draft.sourceBindings = draft.sourceBindings.filter((binding) => (binding.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest));
        draft.sourceRevisions = [];
        draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, [SOURCE_ARTIFACTS.calendar.bindingDigest]);
        draft.baseline.priorCheckpointDigests = [
            SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
        ];
        draft.baseline.priorSourceSliceDigests = [
            SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
        ];
        draft.baseline.priorProviderArtifacts =
            draft.baseline.priorProviderArtifacts.filter((artifact) => (artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest));
        draft.baseline.acceptedSourceRevisions =
            draft.baseline.acceptedSourceRevisions.filter((revision) => (revision.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest));
        draft.baseline.acceptedSourceRevisionSets = revisionSetsFor(draft.baseline.acceptedSourceRevisions, [SOURCE_ARTIFACTS.calendar.bindingDigest]);
        draft.lanes = draft.lanes.filter((plannedLane) => (plannedLane.laneId !== LANE_IDS.collectGranola
            && plannedLane.laneId !== LANE_IDS.normalizeGranola));
        laneById(draft, LANE_IDS.identityBarrier).predecessorLaneIds = [LANE_IDS.normalizeCalendar];
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.deepStrictEqual(plan.sourceRevisions, []);
        node_assert_1.default.deepStrictEqual(plan.sourceRevisionSets, [{
                bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
                revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)([]),
            }]);
        node_assert_1.default.strictEqual(plan.isExactNoOp, false);
        node_assert_1.default.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
    });
    (0, node_test_1.it)("canonicalizes mixed empty/non-empty binding revision sets and compares them for no-op", () => {
        const draft = exactNoOpDraft();
        draft.sourceRevisions = draft.sourceRevisions.filter((revision) => (revision.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest));
        draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, draft.sourceBindings.map((binding) => binding.bindingDigest));
        draft.baseline.acceptedSourceRevisions =
            structuredClone(draft.sourceRevisions);
        draft.baseline.acceptedSourceRevisionSets =
            structuredClone(draft.sourceRevisionSets);
        const first = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const permuted = structuredClone(draft);
        permuted.sourceRevisionSets.reverse();
        permuted.baseline.acceptedSourceRevisionSets.reverse();
        const second = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(permuted);
        node_assert_1.default.deepStrictEqual(second, first);
        node_assert_1.default.strictEqual(first.isExactNoOp, true);
        node_assert_1.default.deepStrictEqual(first.sourceRevisionSets.find((revisionSet) => (revisionSet.bindingDigest
            === SOURCE_ARTIFACTS.calendar.bindingDigest)), {
            bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
            revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)([]),
        });
        const changed = structuredClone(draft);
        changed.sourceRevisions.push({
            bindingDigest: SOURCE_ARTIFACTS.calendar.bindingDigest,
            sourceIdentityDigest: SOURCE_ARTIFACTS.calendar.sourceIdentityDigest,
            sourceRevisionDigest: SOURCE_ARTIFACTS.calendar.currentRevisionDigest,
            contentDigest: SOURCE_ARTIFACTS.calendar.currentContentDigest,
        });
        changed.sourceRevisionSets = revisionSetsFor(changed.sourceRevisions, changed.sourceBindings.map((binding) => binding.bindingDigest));
        const changedPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(changed);
        node_assert_1.default.strictEqual(changedPlan.isExactNoOp, false);
        node_assert_1.default.ok(changedPlan.refreshReasonCodes.includes("source_revision_changed"));
        node_assert_1.default.ok(!changedPlan.refreshReasonCodes.includes("semantic_implementation_changed"));
        node_assert_1.default.notStrictEqual(changedPlan.candidateAcceptedStateDigest, first.candidateAcceptedStateDigest);
    });
    (0, node_test_1.it)("rejects missing, duplicate, forged, or unknown revision-set evidence", () => {
        const missing = canonicalDraft();
        missing.sourceRevisionSets.pop();
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(missing), /canonical digest for every declared binding|missing evidence/i);
        const duplicate = canonicalDraft();
        duplicate.sourceRevisionSets.push(structuredClone(duplicate.sourceRevisionSets[0]));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(duplicate), /revision sets contains a duplicate binding/i);
        const forged = canonicalDraft();
        forged.sourceRevisionSets[0].revisionSetDigest =
            digest("forged-revision-set");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(forged), /does not match.*canonical sorted revision triples/i);
        const unknown = canonicalDraft();
        (unknown.sourceRevisionSets[0]).rowCount = 1;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(unknown), /unknown|field/i);
    });
    (0, node_test_1.it)("treats a removed active binding as a deterministic source/topology change", () => {
        const draft = exactNoOpDraft();
        draft.sourceBindings = draft.sourceBindings.filter((binding) => (binding.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest));
        draft.sourceRevisions = draft.sourceRevisions.filter((revision) => (revision.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest));
        draft.sourceRevisionSets = draft.sourceRevisionSets.filter((revisionSet) => (revisionSet.bindingDigest !== SOURCE_ARTIFACTS.granola.bindingDigest));
        draft.lanes = draft.lanes.filter((plannedLane) => (plannedLane.laneId !== LANE_IDS.collectGranola
            && plannedLane.laneId !== LANE_IDS.normalizeGranola));
        laneById(draft, LANE_IDS.identityBarrier).predecessorLaneIds = [LANE_IDS.normalizeCalendar];
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.strictEqual(plan.isExactNoOp, false);
        node_assert_1.default.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
        node_assert_1.default.ok(plan.refreshReasonCodes.includes("semantic_implementation_changed"));
        node_assert_1.default.ok(plan.baseline.priorProviderArtifacts.some((artifact) => (artifact.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest)));
        node_assert_1.default.ok(!plan.sourceBindings.some((binding) => (binding.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest)));
    });
    (0, node_test_1.it)("treats a binding rotation as a source/topology change without reusing the retired artifact", () => {
        const draft = exactNoOpDraft();
        const rotatedBindingDigest = digest("binding-granola-rotated");
        const rotatedBinding = draft.sourceBindings.find((binding) => (binding.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest));
        rotatedBinding.bindingDigest = rotatedBindingDigest;
        for (const revision of draft.sourceRevisions) {
            if (revision.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest) {
                revision.bindingDigest = rotatedBindingDigest;
            }
        }
        draft.sourceRevisionSets = revisionSetsFor(draft.sourceRevisions, draft.sourceBindings.map((binding) => binding.bindingDigest));
        for (const laneId of [
            LANE_IDS.collectGranola,
            LANE_IDS.normalizeGranola,
        ]) {
            laneById(draft, laneId).inputDigests = [rotatedBindingDigest];
        }
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.strictEqual(plan.isExactNoOp, false);
        node_assert_1.default.ok(plan.refreshReasonCodes.includes("source_revision_changed"));
        node_assert_1.default.ok(plan.refreshReasonCodes.includes("semantic_implementation_changed"));
        for (const laneId of [
            LANE_IDS.collectGranola,
            LANE_IDS.normalizeGranola,
        ]) {
            node_assert_1.default.deepStrictEqual(planLaneById(plan, laneId).inputDigests, [rotatedBindingDigest]);
        }
        node_assert_1.default.ok(plan.baseline.priorProviderArtifacts.some((artifact) => (artifact.bindingDigest === SOURCE_ARTIFACTS.granola.bindingDigest)));
    });
    (0, node_test_1.it)("rejects unpaired bindings in the prior accepted binding manifest", () => {
        const unpairedSet = canonicalDraft();
        unpairedSet.baseline.acceptedSourceRevisionSets.push({
            bindingDigest: digest("retired-unpaired-set"),
            revisionSetDigest: (0, source_contracts_js_1.taskMapContractDigest)([]),
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(unpairedSet), /accepted source revision sets references an undeclared source binding/i);
        const unpairedArtifact = canonicalDraft();
        const retiredBindingDigest = digest("retired-unpaired-artifact");
        const retiredCheckpointDigest = digest("retired-checkpoint");
        const retiredSourceSliceDigest = digest("retired-source-slice");
        unpairedArtifact.baseline.priorProviderArtifacts.push({
            bindingDigest: retiredBindingDigest,
            checkpointDigest: retiredCheckpointDigest,
            sourceSliceDigest: retiredSourceSliceDigest,
        });
        unpairedArtifact.baseline.priorCheckpointDigests.push(retiredCheckpointDigest);
        unpairedArtifact.baseline.priorSourceSliceDigests.push(retiredSourceSliceDigest);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(unpairedArtifact), /accepted source revision sets requires one canonical digest for every declared binding/i);
    });
    (0, node_test_1.it)("rejects an accepted baseline from a different owner scope", () => {
        const crossOwner = canonicalDraft();
        crossOwner.baseline.priorOwnerScopeDigest =
            digest("different-owner-scope");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(crossOwner), /cannot cross owner scope|owner.*baseline/i);
    });
    (0, node_test_1.it)("rejects external mutation without an explicit approval gate", () => {
        const draft = canonicalDraft();
        const publication = laneById(draft, LANE_IDS.publication);
        publication.effect = "external_mutation";
        delete publication.approvalGateId;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /approval.*gate|ungated.*mutation/i);
    });
    (0, node_test_1.it)("rejects source-shaped identity namespaces in registry-owned fields", () => {
        const mutations = [
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).laneId =
                    "participant:alice-smith";
            },
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).operationVersion =
                    "contact:alice-smith";
            },
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).resourceClaims[0].resourceId = "phone:14155551212";
            },
            (draft) => {
                laneById(draft, LANE_IDS.publication).approvalGateId =
                    "participant:alice-smith";
            },
            (draft) => {
                draft.sourceBindings[0].adapterVersion =
                    "contact:alice-smith";
            },
            (draft) => {
                draft.policyBindings[0].version = "phone:14155551212";
            },
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).laneId =
                    "user:alice-smith";
            },
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).operationVersion =
                    "guest:alice-smith";
            },
            (draft) => {
                laneById(draft, LANE_IDS.collectCalendar).resourceClaims[0].resourceId = "member:alice-smith";
            },
        ];
        for (const mutate of mutations) {
            const draft = canonicalDraft();
            mutate(draft);
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /bounded ASCII opaque identifier|private|unsafe/i);
        }
    });
    (0, node_test_1.it)("rejects an optional external mutation laundered into required ancestry", () => {
        const draft = canonicalDraft();
        draft.lanes.push(lane({
            laneId: "optional-external-predecessor",
            goal: "refresh_audit",
            operationVersion: "optional-external-predecessor.1",
            priority: "P2",
            priorityReasonCodes: ["optional_audit"],
            predecessorLaneIds: [LANE_IDS.identityBarrier],
            resourceClaims: [{
                    resourceId: "optional:external-predecessor",
                    mode: "exclusive",
                }],
            effect: "external_mutation",
            approvalGateId: "syntactic-only-gate",
            requiredForPublication: false,
            inputDigests: [digest("optional-external-predecessor")],
            outputKinds: ["refresh_audit"],
        }));
        laneById(draft, LANE_IDS.projection).predecessorLaneIds.push("optional-external-predecessor");
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /required.*cannot depend on optional ancestors|optional ancestor/i);
    });
    (0, node_test_1.it)("accepts only closed operation goals and rejects private prose", () => {
        node_assert_1.default.doesNotThrow(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft()));
        const privateGoal = canonicalDraft();
        privateGoal.lanes[0].goal =
            "review a private participant conversation";
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(privateGoal), /closed operation code|goal/i);
    });
    (0, node_test_1.it)("rejects raw/private fields, paths, secrets, task roots, routes, and readiness", () => {
        const unknownFieldCases = [
            ["top-level privacy", (draft) => {
                    draft.privacy = { rawBodiesStored: true };
                }],
            ["raw body", (draft) => {
                    draft.lanes[0].rawTranscript = "private body";
                }],
            ["task root", (draft) => {
                    draft.lanes[0].taskRootId = "task-root";
                }],
            ["route", (draft) => {
                    draft.lanes[0].sourceRoute = "writeback";
                }],
            ["readiness", (draft) => {
                    draft.lanes[0].routeReadiness = "ready";
                }],
            ["binding detail", (draft) => {
                    draft.sourceBindings[0].connectionId =
                        "raw-connection-id";
                }],
        ];
        for (const [label, mutate] of unknownFieldCases) {
            node_assert_1.default.doesNotThrow(() => label);
            expectDraftRejection(mutate, /unknown|unsupported|forbidden|field/i);
        }
        expectDraftRejection((draft) => {
            draft.lanes[0].operationVersion =
                "/Users/private/taskmap-adapter";
        }, /path|safe|operationVersion|private/i);
        expectDraftRejection((draft) => {
            draft.lanes[0].operationVersion =
                "sk-proj-abcdefghijklmnopqrstuv";
        }, /secret|safe|operationVersion|private/i);
    });
    (0, node_test_1.it)("recursively rejects encoded paths, credential URIs, secrets, and execution semantics", () => {
        const privateCorpus = [
            "/Users/neo/private/taskmap",
            "~/Library/Application Support/owner",
            "../owner/private-artifact",
            "C:\\Users\\neo\\private",
            "\\\\server\\share\\owner",
            "file:///Users/neo/private",
            "s3://private-owner-bucket/source",
            "owner%2Fprivate%2Fartifact",
            "file%3A%2F%2FUsers%2Fneo",
            "https://neo:secret@example.com/private",
            "postgres://neo:secret@localhost/taskmap",
            "https%3A%2F%2Fneo:secret@internal",
            "owner@example.com",
            "ghp_abcdefghijklmnopqrstuvwxyz123456",
            ["xo", "xb-1234567890-abcdefghijklmnop"].join(""),
            "npm_abcdefghijklmnopqrstuvwxyz123456",
            "sk-proj-abcdefghijklmnopqrstuv",
            "bearer abcdefghijklmnop",
            "-----BEGIN PRIVATE KEY-----",
            "eyJhbGciOiJIUzI1NiJ9.eyJvd25lciI6InByaXZhdGUifQ.signature123",
            "task root readiness",
            "approve & run dispatch",
        ];
        const injectors = [
            (draft, value) => {
                draft.lanes[0].goal = value;
            },
            (draft, value) => {
                draft.policyBindings[0].version = value;
            },
            (draft, value) => {
                draft.sourceBindings[0].adapterVersion = value;
            },
            (draft, value) => {
                (draft.lanes[0].resourceClaims[0])
                    .resourceId = value;
            },
        ];
        for (let index = 0; index < privateCorpus.length; index += 1) {
            const value = privateCorpus[index];
            expectDraftRejection((draft) => injectors[index % injectors.length](draft, value), /private, unsafe, or task-execution text|bounded ASCII opaque identifier|closed operation code/i);
        }
    });
    (0, node_test_1.it)("rejects unknown fields at every nested boundary and closes all enums", () => {
        const unknownNestedCases = [
            (draft) => {
                draft.baseline.unexpected = true;
            },
            (draft) => {
                draft.reviewedDigests.unexpected = true;
            },
            (draft) => {
                draft.sourceBindings[0].unexpected = true;
            },
            (draft) => {
                draft.sourceRevisions[0].unexpected = true;
            },
            (draft) => {
                draft.sourceRevisionSets[0].unexpected = true;
            },
            (draft) => {
                draft.baseline
                    .acceptedSourceRevisionSets[0].unexpected = true;
            },
            (draft) => {
                draft.policyBindings[0].unexpected = true;
            },
            (draft) => {
                draft.lanes[0].unexpected = true;
            },
            (draft) => {
                (draft.lanes[0].resourceClaims[0])
                    .unexpected = true;
            },
        ];
        for (const mutate of unknownNestedCases) {
            expectDraftRejection(mutate, /unknown|unsupported|field/i);
        }
        const invalidEnumCases = [
            (draft) => {
                draft.baseline.kind = "rolling";
            },
            (draft) => {
                draft.lanes[0].priority = "P3";
            },
            (draft) => {
                draft.lanes[0].effect = "network_write";
            },
            (draft) => {
                (draft.lanes[0].resourceClaims[0])
                    .mode = "append";
            },
            (draft) => {
                draft.lanes[0].priorityReasonCodes =
                    ["because_the_caller_said_so"];
            },
            (draft) => {
                draft.lanes[0].outputKinds = ["raw_provider_body"];
            },
        ];
        for (const mutate of invalidEnumCases) {
            expectDraftRejection(mutate, /unsupported|invalid|priority|effect|mode|reason|output|baseline/i);
        }
    });
    (0, node_test_1.it)("rejects watermark-only and fixed-time orchestration inputs", () => {
        expectDraftRejection((draft) => {
            draft.fixedNow = "2026-07-28T00:00:00.000Z";
        }, /fixedNow|unknown|time/i);
        expectDraftRejection((draft) => {
            draft.baseline.watermarkDigest =
                digest("watermark-only");
        }, /watermark|unknown/i);
        expectDraftRejection((draft) => {
            draft.sourceBindings[0].watermark =
                digest("provider-watermark");
        }, /watermark|unknown/i);
    });
    (0, node_test_1.it)("changes planId for policy, resource-claim, or predecessor changes", () => {
        const base = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const policyChanged = canonicalDraft();
        policyChanged.policyBindings[0].version = "identity-policy.2";
        policyChanged.policyBindings[0].digest = digest("policy-identity-v2");
        const claimChanged = canonicalDraft();
        laneById(claimChanged, LANE_IDS.collectCalendar)
            .resourceClaims[0].resourceId = "provider:google_calendar:v2";
        const predecessorChanged = canonicalDraft();
        laneById(predecessorChanged, LANE_IDS.lifecycleGate)
            .predecessorLaneIds.push(LANE_IDS.authorityGate);
        node_assert_1.default.notStrictEqual((0, refresh_plan_js_1.buildTaskMapRefreshPlan)(policyChanged).planId, base.planId);
        node_assert_1.default.notStrictEqual((0, refresh_plan_js_1.buildTaskMapRefreshPlan)(claimChanged).planId, base.planId);
        node_assert_1.default.notStrictEqual((0, refresh_plan_js_1.buildTaskMapRefreshPlan)(predecessorChanged).planId, base.planId);
    });
    (0, node_test_1.it)("rejects extra or changed provider inputs even on an exact no-op draft", () => {
        const extra = exactNoOpDraft();
        laneById(extra, LANE_IDS.collectCalendar).inputDigests.push(digest("arbitrary-provider-extra"));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(extra), /provider lane input digests.*derived|prior artifacts/i);
        const changed = exactNoOpDraft();
        const calendarCollect = laneById(changed, LANE_IDS.collectCalendar);
        calendarCollect.inputDigests = calendarCollect.inputDigests.map((inputDigest) => (inputDigest === SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
            ? digest("forged-provider-checkpoint-input")
            : inputDigest));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(changed), /provider lane input digests.*derived|prior artifacts/i);
    });
    (0, node_test_1.it)("separates policy/content identity from scheduling-only plan identity", () => {
        const baseDraft = exactNoOpDraft();
        const base = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(baseDraft);
        node_assert_1.default.strictEqual(base.isExactNoOp, true);
        const policyChanged = exactNoOpDraft();
        const identityPolicy = policyChanged.policyBindings.find((policy) => policy.name === "identity-policy");
        identityPolicy.version = "identity-policy.2";
        identityPolicy.digest = digest("policy-identity-v2");
        const policyPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(policyChanged);
        node_assert_1.default.strictEqual(policyPlan.isExactNoOp, false);
        node_assert_1.default.ok(policyPlan.refreshReasonCodes.includes("policy_bundle_changed"));
        node_assert_1.default.notStrictEqual(policyPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
        const adapterChanged = exactNoOpDraft();
        adapterChanged.sourceBindings[0].adapterVersion =
            "google-calendar-adapter.2";
        const adapterPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(adapterChanged);
        node_assert_1.default.strictEqual(adapterPlan.isExactNoOp, false);
        node_assert_1.default.ok(adapterPlan.refreshReasonCodes.includes("semantic_implementation_changed"));
        node_assert_1.default.notStrictEqual(adapterPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
        const bindingRolesChanged = exactNoOpDraft();
        const calendarCollectInputs = [
            ...laneById(bindingRolesChanged, LANE_IDS.collectCalendar).inputDigests,
        ];
        laneById(bindingRolesChanged, LANE_IDS.collectCalendar).inputDigests = [
            ...laneById(bindingRolesChanged, LANE_IDS.collectGranola).inputDigests,
        ];
        laneById(bindingRolesChanged, LANE_IDS.collectGranola).inputDigests = calendarCollectInputs;
        const calendarNormalizeInputs = [
            ...laneById(bindingRolesChanged, LANE_IDS.normalizeCalendar).inputDigests,
        ];
        laneById(bindingRolesChanged, LANE_IDS.normalizeCalendar).inputDigests = [
            ...laneById(bindingRolesChanged, LANE_IDS.normalizeGranola).inputDigests,
        ];
        laneById(bindingRolesChanged, LANE_IDS.normalizeGranola).inputDigests = calendarNormalizeInputs;
        const bindingRolesPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(bindingRolesChanged);
        node_assert_1.default.strictEqual(bindingRolesPlan.isExactNoOp, false);
        node_assert_1.default.notStrictEqual(bindingRolesPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
        const operationChanged = exactNoOpDraft();
        laneById(operationChanged, LANE_IDS.projection).operationVersion =
            "taskmap-projection.2";
        const operationPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(operationChanged);
        node_assert_1.default.strictEqual(operationPlan.isExactNoOp, false);
        node_assert_1.default.notStrictEqual(operationPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
        const reviewedRolesChanged = exactNoOpDraft();
        const authorityInputs = [
            ...laneById(reviewedRolesChanged, LANE_IDS.authorityGate).inputDigests,
        ];
        laneById(reviewedRolesChanged, LANE_IDS.authorityGate).inputDigests = [
            ...laneById(reviewedRolesChanged, LANE_IDS.lifecycleGate).inputDigests,
        ];
        laneById(reviewedRolesChanged, LANE_IDS.lifecycleGate).inputDigests =
            authorityInputs;
        const reviewedRolesPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(reviewedRolesChanged);
        node_assert_1.default.strictEqual(reviewedRolesPlan.isExactNoOp, false);
        node_assert_1.default.notStrictEqual(reviewedRolesPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
        const priorityBaseDraft = exactNoOpDraft();
        priorityBaseDraft.lanes.push(lane({
            laneId: "optional-scheduling-hint",
            goal: "refresh_audit",
            operationVersion: "optional-scheduling-hint.1",
            priority: "P1",
            priorityReasonCodes: ["optional_enrichment"],
            predecessorLaneIds: [LANE_IDS.projection],
            resourceClaims: [{
                    resourceId: "optional:scheduling-hint",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-scheduling-hint")],
            outputKinds: ["refresh_audit"],
        }));
        const priorityBase = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(priorityBaseDraft);
        const priorityChanged = structuredClone(priorityBaseDraft);
        const priorityLane = laneById(priorityChanged, "optional-scheduling-hint");
        priorityLane.priority = "P2";
        priorityLane.priorityReasonCodes = ["optional_audit"];
        const priorityPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(priorityChanged);
        node_assert_1.default.notStrictEqual(priorityPlan.planId, priorityBase.planId);
        node_assert_1.default.strictEqual(priorityPlan.candidateAcceptedStateDigest, priorityBase.candidateAcceptedStateDigest);
        const claimChanged = exactNoOpDraft();
        laneById(claimChanged, LANE_IDS.authorityGate)
            .resourceClaims[0].resourceId = "taskmap:deterministic-gates:v2";
        const claimPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(claimChanged);
        node_assert_1.default.notStrictEqual(claimPlan.planId, base.planId);
        node_assert_1.default.strictEqual(claimPlan.candidateAcceptedStateDigest, base.candidateAcceptedStateDigest);
    });
});
(0, node_test_1.describe)("Task Map refresh ready-batch selection", () => {
    (0, node_test_1.it)("preflights a near-limit plan and max-size selection in separate domains", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(largeSelectablePlanDraft(3_500));
        const selection = {
            maxConcurrency: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency,
            laneStates: laneStates(plan),
        };
        const planBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(plan), "utf8");
        const selectionBytes = Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(selection), "utf8");
        node_assert_1.default.strictEqual(selection.laneStates.length, refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes);
        node_assert_1.default.ok(planBytes <= refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes);
        node_assert_1.default.ok(planBytes + selectionBytes
            > refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxCanonicalPlanBytes, `expected separate valid domains to exceed a combined ceiling; `
            + `plan=${planBytes}, selection=${selectionBytes}`);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, selection);
        node_assert_1.default.ok(batch.selectedLaneIds.length
            <= refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency);
    });
    (0, node_test_1.it)("descriptor-first preflights selection and lane states before reads", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const wideUnknown = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
            unexpectedWide: Object.fromEntries(Array.from({
                length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
            }, (_, index) => [`unknown${index}`, 0])),
        };
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, wideUnknown), /object exceeds 64 keys/i);
        const wideStates = {
            maxConcurrency: 2,
            laneStates: Array.from({
                length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxLanes + 1,
            }, (_, index) => ({
                laneId: `wide-state-${index}`,
                status: "pending",
            })),
        };
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, wideStates), /laneStates must be a bounded array|laneStates.*1024/i);
        const hugeScalar = {
            maxConcurrency: "x".repeat(refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawStringBytes + 1),
            laneStates: laneStates(plan),
        };
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, hugeScalar), /raw string exceeds 4096 bytes/i);
        const nestedSelection = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        let nestedValue = 0;
        for (let depth = 0; depth < refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawNestingDepth + 2; depth += 1) {
            nestedValue = [nestedValue];
        }
        nestedSelection.unexpectedNested = nestedValue;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, nestedSelection), /raw nesting depth 64/i);
        const topLevelAccessor = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        const originalStates = topLevelAccessor.laneStates;
        let topLevelReads = 0;
        Object.defineProperty(topLevelAccessor, "laneStates", {
            enumerable: true,
            configurable: true,
            get: () => {
                topLevelReads += 1;
                return originalStates;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, topLevelAccessor), /accessor-backed values/i);
        node_assert_1.default.strictEqual(topLevelReads, 0);
        const concurrencyAccessor = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        let concurrencyReads = 0;
        Object.defineProperty(concurrencyAccessor, "maxConcurrency", {
            enumerable: true,
            configurable: true,
            get: () => {
                concurrencyReads += 1;
                return concurrencyReads === 1 ? 1 : 1_000;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, concurrencyAccessor), /accessor-backed values/i);
        node_assert_1.default.strictEqual(concurrencyReads, 0);
        const selectionTarget = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        let selectionProxyReads = 0;
        const proxiedSelection = new Proxy(selectionTarget, {
            get: (target, property, receiver) => {
                selectionProxyReads += 1;
                if (property === "maxConcurrency") {
                    return selectionProxyReads === 1 ? 1 : 1_000;
                }
                if (property === "laneStates") {
                    return selectionProxyReads === 1 ? target.laneStates : [];
                }
                return Reflect.get(target, property, receiver);
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, proxiedSelection), /cannot be snapshotted as plain JSON data/i);
        node_assert_1.default.strictEqual(selectionProxyReads, 0);
        const laneStateTarget = laneStates(plan);
        let laneStatesProxyReads = 0;
        const proxiedLaneStates = new Proxy(laneStateTarget, {
            get: (target, property, receiver) => {
                laneStatesProxyReads += 1;
                return Reflect.get(target, property, receiver);
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: proxiedLaneStates,
        }), /cannot be snapshotted as plain JSON data/i);
        node_assert_1.default.strictEqual(laneStatesProxyReads, 0);
        const stateAccessor = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        const firstState = stateAccessor.laneStates[0];
        const originalStatus = firstState.status;
        let stateReads = 0;
        Object.defineProperty(firstState, "status", {
            enumerable: true,
            configurable: true,
            get: () => {
                stateReads += 1;
                return originalStatus;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, stateAccessor), /accessor-backed values/i);
        node_assert_1.default.strictEqual(stateReads, 0);
        const wideState = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        Object.assign(wideState.laneStates[0], Object.fromEntries(Array.from({
            length: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxRawObjectKeys + 1,
        }, (_, index) => [`unknown${index}`, 0])));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, wideState), /object exceeds 64 keys/i);
        const symbolState = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        let symbolReads = 0;
        Object.defineProperty(symbolState.laneStates[0], Symbol("forged-state"), {
            enumerable: false,
            configurable: true,
            get: () => {
                symbolReads += 1;
                return true;
            },
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, symbolState), /symbol-keyed values/i);
        node_assert_1.default.strictEqual(symbolReads, 0);
        const hiddenState = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        Object.defineProperty(hiddenState.laneStates[0], "hiddenState", {
            enumerable: false,
            configurable: true,
            value: true,
        });
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, hiddenState), /hidden properties/i);
        const sparseStates = {
            maxConcurrency: 2,
            laneStates: new Array(1),
        };
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, sparseStates), /holes or hidden elements/i);
        const cyclicSelection = {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        };
        cyclicSelection.unexpectedCycle = cyclicSelection;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, cyclicSelection), /cyclic values/i);
    });
    (0, node_test_1.it)("orders runnable work by P0, then P1/P2, with a stable lane-id tie break", () => {
        const draft = canonicalDraft();
        draft.lanes.push(lane({
            laneId: "optional-p1-audit",
            goal: "refresh_audit",
            operationVersion: "audit.1",
            priority: "P1",
            priorityReasonCodes: ["optional_enrichment"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "taskmap:optional-audit",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-audit")],
            outputKinds: ["refresh_audit"],
        }), lane({
            laneId: "optional-p2-strategy",
            goal: "strategy_projection",
            operationVersion: "strategy.1",
            priority: "P2",
            priorityReasonCodes: ["optional_automation"],
            predecessorLaneIds: [
                LANE_IDS.authorityGate,
                LANE_IDS.lifecycleGate,
            ],
            resourceClaims: [{
                    resourceId: "taskmap:optional-strategy",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-strategy")],
            outputKinds: ["strategy_projection"],
        }));
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 1,
            laneStates: laneStates(plan),
        });
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [LANE_IDS.collectCalendar]);
    });
    (0, node_test_1.it)("never schedules an external mutation from a syntactically valid fake gate", () => {
        const draft = canonicalDraft();
        const publication = laneById(draft, LANE_IDS.publication);
        publication.effect = "external_mutation";
        publication.approvalGateId = "fake-receipt-gate";
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 1,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
                [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                [LANE_IDS.projection]: { status: "succeeded" },
            }),
        });
        node_assert_1.default.strictEqual(batch.publication.eligible, false);
        node_assert_1.default.strictEqual(batch.publication.state, "blocked");
        node_assert_1.default.ok(batch.publication.reasonCodes.includes("approval_authority_unavailable"));
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, []);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 1,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
                [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                [LANE_IDS.projection]: { status: "succeeded" },
                [LANE_IDS.publication]: { status: "succeeded" },
            }),
        }), /external mutation history.*receipt authority/i);
    });
    (0, node_test_1.it)("selects both independent provider reads in parallel", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        });
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [LANE_IDS.collectCalendar, LANE_IDS.collectGranola]);
        node_assert_1.default.strictEqual(publicationState(batch), "waiting");
    });
    (0, node_test_1.it)("allows shared/shared claims and serializes an exclusive claimant", () => {
        const sharedDraft = canonicalDraft();
        for (const laneId of [
            LANE_IDS.collectCalendar,
            LANE_IDS.collectGranola,
        ]) {
            laneById(sharedDraft, laneId).resourceClaims = [{
                    resourceId: "provider:shared-read-pool",
                    mode: "shared",
                }];
        }
        const sharedPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(sharedDraft);
        const shared = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(sharedPlan, {
            maxConcurrency: 2,
            laneStates: laneStates(sharedPlan),
        });
        node_assert_1.default.deepStrictEqual(shared.selectedLaneIds, [LANE_IDS.collectCalendar, LANE_IDS.collectGranola]);
        const exclusiveDraft = structuredClone(sharedDraft);
        laneById(exclusiveDraft, LANE_IDS.collectGranola)
            .resourceClaims[0].mode = "exclusive";
        const exclusivePlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exclusiveDraft);
        const exclusive = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(exclusivePlan, {
            maxConcurrency: 2,
            laneStates: laneStates(exclusivePlan),
        });
        node_assert_1.default.deepStrictEqual(exclusive.selectedLaneIds, [LANE_IDS.collectCalendar]);
    });
    (0, node_test_1.it)("skips a claim-blocked P0 and fills capacity with independent P1/P2 work", () => {
        const draft = canonicalDraft();
        laneById(draft, LANE_IDS.collectCalendar).resourceClaims = [{
                resourceId: "provider:blocked-pool",
                mode: "shared",
            }];
        laneById(draft, LANE_IDS.collectGranola).resourceClaims = [{
                resourceId: "provider:blocked-pool",
                mode: "exclusive",
            }];
        draft.lanes.push(lane({
            laneId: "optional-independent-p1",
            goal: "refresh_audit",
            operationVersion: "optional-independent-p1.1",
            priority: "P1",
            priorityReasonCodes: ["optional_enrichment"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "optional:independent:p1",
                    mode: "exclusive",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-independent-p1")],
            outputKinds: ["refresh_audit"],
        }), lane({
            laneId: "optional-independent-p2",
            goal: "refresh_audit",
            operationVersion: "optional-independent-p2.1",
            priority: "P2",
            priorityReasonCodes: ["optional_audit"],
            predecessorLaneIds: [],
            resourceClaims: [{
                    resourceId: "optional:independent:p2",
                    mode: "exclusive",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-independent-p2")],
            outputKinds: ["refresh_audit"],
        }));
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 3,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
            }),
        });
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [
            "optional-independent-p1",
            "optional-independent-p2",
        ]);
        node_assert_1.default.ok(!batch.selectedLaneIds.includes(LANE_IDS.collectGranola));
        node_assert_1.default.strictEqual(batch.activeClaims.length, 1);
    });
    (0, node_test_1.it)("honors running shared/exclusive conflicts in both directions and checks every claim", () => {
        const sharedRunningDraft = canonicalDraft();
        for (const laneId of [
            LANE_IDS.collectCalendar,
            LANE_IDS.collectGranola,
        ]) {
            laneById(sharedRunningDraft, laneId).resourceClaims = [{
                    resourceId: "provider:shared-read-pool",
                    mode: laneId === LANE_IDS.collectCalendar ? "shared" : "exclusive",
                }];
        }
        const sharedRunningPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(sharedRunningDraft);
        const sharedRunningBatch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(sharedRunningPlan, {
            maxConcurrency: 2,
            laneStates: laneStates(sharedRunningPlan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
            }),
        });
        node_assert_1.default.deepStrictEqual(sharedRunningBatch.selectedLaneIds, []);
        node_assert_1.default.ok(JSON.stringify(sharedRunningBatch.activeClaims).includes("provider:shared-read-pool"));
        const exclusiveRunningDraft = canonicalDraft();
        laneById(exclusiveRunningDraft, LANE_IDS.collectCalendar).resourceClaims = [
            { resourceId: "provider:a-running-free", mode: "shared" },
            { resourceId: "provider:z-second-claim", mode: "exclusive" },
        ];
        laneById(exclusiveRunningDraft, LANE_IDS.collectGranola).resourceClaims = [
            { resourceId: "provider:a-candidate-free", mode: "shared" },
            { resourceId: "provider:z-second-claim", mode: "shared" },
        ];
        const exclusiveRunningPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(exclusiveRunningDraft);
        const exclusiveRunningBatch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(exclusiveRunningPlan, {
            maxConcurrency: 2,
            laneStates: laneStates(exclusiveRunningPlan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
            }),
        });
        node_assert_1.default.deepStrictEqual(exclusiveRunningBatch.selectedLaneIds, []);
        node_assert_1.default.strictEqual(planLaneById(exclusiveRunningPlan, LANE_IDS.collectGranola).resourceClaims[1].resourceId, "provider:z-second-claim");
    });
    (0, node_test_1.it)("counts already-running lanes against maxConcurrency", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const states = laneStates(plan, {
            [LANE_IDS.collectCalendar]: { status: "running" },
        });
        const full = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 1,
            laneStates: states,
        });
        node_assert_1.default.deepStrictEqual(full.selectedLaneIds, []);
        const oneSlot = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: states,
        });
        node_assert_1.default.deepStrictEqual(oneSlot.selectedLaneIds, [LANE_IDS.collectGranola]);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 1,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
                [LANE_IDS.collectGranola]: { status: "running" },
            }),
        }), /already-running lanes exceed maxConcurrency/i);
    });
    (0, node_test_1.it)("accepts exactly 64 only as the selector safety ceiling", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_LIMITS_V1.maxConcurrency,
            laneStates: laneStates(plan),
        });
        node_assert_1.default.strictEqual(batch.maxConcurrency, 64);
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [
            LANE_IDS.collectCalendar,
            LANE_IDS.collectGranola,
        ]);
    });
    (0, node_test_1.it)("rejects 65 running lanes before expanding conflicting active claims", () => {
        const draft = canonicalDraft();
        const runningLaneIds = [];
        for (let index = 0; index < 65; index += 1) {
            const laneId = `running-cap-${String(index).padStart(2, "0")}`;
            runningLaneIds.push(laneId);
            draft.lanes.push(optionalAuditLane(laneId, {
                resourceClaims: [{
                        resourceId: "audit:deliberately-conflicting-running-claim",
                        mode: "exclusive",
                    }],
            }));
        }
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const running = new Set(runningLaneIds);
        const states = plan.lanes.map((plannedLane) => ({
            laneId: plannedLane.laneId,
            status: (running.has(plannedLane.laneId) ? "running" : "pending"),
        }));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 64,
            laneStates: states,
        }), /already-running lanes exceed maxConcurrency/i);
    });
    (0, node_test_1.it)("rejects contradictory claims already held by two running lanes", () => {
        const draft = canonicalDraft();
        laneById(draft, LANE_IDS.collectCalendar).resourceClaims = [{
                resourceId: "provider:running-conflict",
                mode: "exclusive",
            }];
        laneById(draft, LANE_IDS.collectGranola).resourceClaims = [{
                resourceId: "provider:running-conflict",
                mode: "shared",
            }];
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
                [LANE_IDS.collectGranola]: { status: "running" },
            }),
        }), /already-running refresh lanes hold conflicting claims/i);
    });
    (0, node_test_1.it)("handles a high-cardinality active claim set linearly and blocks a late conflict", () => {
        const draft = canonicalDraft();
        const claimCount = 2_048;
        const activeClaims = Array.from({ length: claimCount }, (_, index) => ({
            resourceId: `audit:high-cardinality:${String(index).padStart(4, "0")}`,
            mode: "shared",
        }));
        draft.lanes.push(optionalAuditLane("high-cardinality-running", {
            resourceClaims: activeClaims,
        }), optionalAuditLane("high-cardinality-candidate", {
            resourceClaims: [
                {
                    resourceId: "audit:candidate-free",
                    mode: "shared",
                },
                {
                    resourceId: `audit:high-cardinality:${String(claimCount - 1).padStart(4, "0")}`,
                    mode: "exclusive",
                },
            ],
        }));
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const states = plan.lanes.map((plannedLane) => ({
            laneId: plannedLane.laneId,
            status: (plannedLane.laneId === "high-cardinality-running"
                ? "running"
                : plannedLane.laneId === "high-cardinality-candidate"
                    ? "pending"
                    : "succeeded"),
        }));
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: states,
        });
        node_assert_1.default.strictEqual(batch.activeClaims.length, claimCount);
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, []);
    });
    (0, node_test_1.it)("derives omitted lane state as absent and rejects duplicate/extra state", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const states = laneStates(plan);
        const omittedLaneId = states[0].laneId;
        const omitted = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: states.slice(1),
        });
        node_assert_1.default.deepStrictEqual(omitted.laneStates.find((state) => state.laneId === omittedLaneId), { laneId: omittedLaneId, status: "absent" });
        node_assert_1.default.strictEqual(omitted.publication.state, "blocked");
        node_assert_1.default.strictEqual(omitted.publication.eligible, false);
        node_assert_1.default.ok(omitted.publication.reasonCodes.includes("required_lane_absent"));
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: [...states, structuredClone(states[0])],
        }), /duplicate.*state|state.*duplicate/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: [
                ...states,
                { laneId: "extra-lane", status: "pending" },
            ],
        }), /state extra-lane is extra/i);
    });
    (0, node_test_1.it)("rejects non-integer, non-number, and out-of-range concurrency", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const invalidValues = [
            -1,
            0,
            1.5,
            65,
            Number.POSITIVE_INFINITY,
            Number.NaN,
            "2",
            null,
            undefined,
        ];
        for (const value of invalidValues) {
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: value,
                laneStates: [],
            }), /maxConcurrency must be an integer from 1 to 64|finite JSON numbers|must contain JSON data values/i, `maxConcurrency=${String(value)}`);
        }
    });
    (0, node_test_1.it)("rejects running, succeeded, partial, or failed descendants before prerequisites", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const cases = [
            { laneId: LANE_IDS.authorityGate, prerequisiteStates: {} },
            {
                laneId: LANE_IDS.projection,
                prerequisiteStates: stateOverridesThroughBarrier(),
            },
            {
                laneId: LANE_IDS.publication,
                prerequisiteStates: {
                    ...stateOverridesThroughBarrier(),
                    [LANE_IDS.authorityGate]: { status: "succeeded" },
                    [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                },
            },
        ];
        for (const { laneId, prerequisiteStates } of cases) {
            for (const status of [
                "running",
                "succeeded",
                "partial",
                "failed",
            ]) {
                const target = { status };
                if (status === "partial" || status === "failed") {
                    target.errorCode = "refresh_operation_failed";
                    target.errorDetailDigest = digest(`impossible-${laneId}-${status}`);
                }
                node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                    maxConcurrency: 4,
                    laneStates: laneStates(plan, {
                        ...prerequisiteStates,
                        [laneId]: target,
                    }),
                }), /predecessor.*succeeded|active.*requires/i, `${laneId}:${status}`);
            }
        }
    });
    (0, node_test_1.it)("rejects a skipped descendant before every predecessor is terminal", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
                [LANE_IDS.projection]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("projection-skipped-too-early"),
                },
            }),
        }), /skipped refresh lane requires terminal predecessor histories/i);
    });
    (0, node_test_1.it)("requires skipped work to follow a terminal non-success predecessor", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: {
                    status: "skipped",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                    lastGoodSourceSliceDigest: SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("root-collect-cannot-skip"),
                },
            }),
        }), /skipped.*predecessor|predecessor-free.*skipped/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: {
                    status: "skipped",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                    lastGoodSourceSliceDigest: SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("normalize-cannot-skip-success"),
                },
            }),
        }), /skipped.*non-succeeded|upstream.*non-success/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "succeeded" },
                [LANE_IDS.collectGranola]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
                [LANE_IDS.normalizeGranola]: { status: "succeeded" },
                [LANE_IDS.identityBarrier]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("barrier-cannot-skip-success"),
                },
            }),
        }), /skipped identity barrier.*non-succeeded/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("gate-cannot-skip-success"),
                },
            }),
        }), /skipped.*non-succeeded|upstream.*non-success/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
                [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                [LANE_IDS.projection]: { status: "succeeded" },
                [LANE_IDS.publication]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("publication-cannot-skip-success"),
                },
            }),
        }), /skipped.*non-succeeded|upstream.*non-success/i);
        const validCascade = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: {
                    status: "failed",
                    errorCode: "deterministic_gate_failed",
                    errorDetailDigest: digest("authority-gate-failed"),
                },
                [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                [LANE_IDS.projection]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("projection-valid-skip"),
                },
            }),
        });
        node_assert_1.default.deepStrictEqual(validCascade.laneStates.find((state) => state.laneId === LANE_IDS.projection), {
            laneId: LANE_IDS.projection,
            status: "skipped",
            errorCode: "upstream_unusable",
            errorDetailDigest: digest("projection-valid-skip"),
        });
        node_assert_1.default.strictEqual(validCascade.publication.eligible, false);
    });
    (0, node_test_1.it)("rejects active or skipped barrier history before providers are usable or terminal", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                [LANE_IDS.identityBarrier]: { status: "running" },
            }),
        }), /active identity barrier requires usable all-settled provider histories/i);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "succeeded" },
                [LANE_IDS.collectGranola]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
                [LANE_IDS.identityBarrier]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("barrier-skipped-too-early"),
                },
            }),
        }), /skipped identity barrier requires terminal provider histories/i);
    });
    (0, node_test_1.it)("records a first-run provider failure but keeps the barrier unusable", () => {
        const draft = canonicalDraft();
        draft.baseline = {
            kind: "genesis",
            priorCheckpointDigests: [],
            priorSourceSliceDigests: [],
            priorProviderArtifacts: [],
            acceptedSourceRevisions: [],
            acceptedSourceRevisionSets: [],
            acceptedSemanticInputDigests: [],
        };
        for (const laneId of [
            LANE_IDS.collectCalendar,
            LANE_IDS.normalizeCalendar,
        ]) {
            const providerLane = laneById(draft, laneId);
            providerLane.inputDigests = providerLane.inputDigests.filter((inputDigest) => (inputDigest !== SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
                && inputDigest !== SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest));
        }
        for (const laneId of [
            LANE_IDS.collectGranola,
            LANE_IDS.normalizeGranola,
        ]) {
            const providerLane = laneById(draft, laneId);
            providerLane.inputDigests = providerLane.inputDigests.filter((inputDigest) => (inputDigest !== SOURCE_ARTIFACTS.granola.priorCheckpointDigest
                && inputDigest !== SOURCE_ARTIFACTS.granola.priorSourceSliceDigest));
        }
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: {
                    status: "failed",
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("first-refresh-failed"),
                },
                [LANE_IDS.collectGranola]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("upstream-unusable"),
                },
                [LANE_IDS.normalizeGranola]: { status: "succeeded" },
            }),
        });
        node_assert_1.default.deepStrictEqual((0, refresh_plan_js_1.assertTaskMapReadyBatch)(plan, batch), batch);
        node_assert_1.default.ok(!batch.selectedLaneIds.includes(LANE_IDS.identityBarrier));
        node_assert_1.default.strictEqual(batch.publication.state, "blocked");
        node_assert_1.default.ok(batch.publication.reasonCodes.includes("required_lane_failed"));
        node_assert_1.default.ok(batch.publication.reasonCodes.includes("required_lane_skipped"));
    });
    (0, node_test_1.it)("keeps the all-settled barrier waiting for every normalizer", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 3,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "succeeded" },
                [LANE_IDS.collectGranola]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
            }),
        });
        node_assert_1.default.ok(!batch.selectedLaneIds.includes(LANE_IDS.identityBarrier));
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [LANE_IDS.normalizeGranola]);
    });
    for (const settledStatus of ["failed", "partial", "skipped"]) {
        (0, node_test_1.it)(`allows the all-settled barrier after a retained-last-good ${settledStatus} normalizer`, () => {
            const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
            const granolaCollectState = settledStatus === "skipped"
                ? {
                    status: "failed",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
                    lastGoodSourceSliceDigest: SOURCE_ARTIFACTS.granola.priorSourceSliceDigest,
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("granola-upstream-failed"),
                }
                : { status: "succeeded" };
            const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 2,
                laneStates: laneStates(plan, {
                    [LANE_IDS.collectCalendar]: { status: "succeeded" },
                    [LANE_IDS.collectGranola]: granolaCollectState,
                    [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
                    [LANE_IDS.normalizeGranola]: {
                        status: settledStatus,
                        lastGoodCheckpointDigest: digest("granola-last-good-checkpoint"),
                        lastGoodSourceSliceDigest: digest("granola-last-good-source-slice"),
                        errorCode: settledStatus === "partial"
                            ? "provider_partial_result"
                            : settledStatus === "skipped"
                                ? "upstream_unusable"
                                : "provider_unavailable",
                        errorDetailDigest: digest(`granola-${settledStatus}-error`),
                    },
                }),
            });
            node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, [LANE_IDS.identityBarrier]);
        });
    }
    (0, node_test_1.it)("does not pass a failed normalizer without both retained-last-good refs", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "succeeded" },
                [LANE_IDS.collectGranola]: { status: "succeeded" },
                [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
                [LANE_IDS.normalizeGranola]: {
                    status: "failed",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("granola-error"),
                },
            }),
        }), /both last-good refs|lastGoodSourceSliceDigest.*full lowercase SHA-256/i);
    });
    (0, node_test_1.it)("rejects cross-provider last-good checkpoint/source-slice pairing", () => {
        const draft = canonicalDraft();
        laneById(draft, LANE_IDS.collectCalendar).inputDigests.push(SOURCE_ARTIFACTS.granola.priorCheckpointDigest, SOURCE_ARTIFACTS.granola.priorSourceSliceDigest);
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft), /provider lane input digests.*derived|prior artifacts/i);
    });
    (0, node_test_1.it)("waits for every deterministic gate before selecting projection", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const oneGatePending = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
            }),
        });
        node_assert_1.default.ok(!oneGatePending.selectedLaneIds.includes(LANE_IDS.projection));
        node_assert_1.default.deepStrictEqual(oneGatePending.selectedLaneIds, [LANE_IDS.lifecycleGate]);
        const gatesSettled = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                ...stateOverridesThroughBarrier(),
                [LANE_IDS.authorityGate]: { status: "succeeded" },
                [LANE_IDS.lifecycleGate]: { status: "succeeded" },
            }),
        });
        node_assert_1.default.deepStrictEqual(gatesSettled.selectedLaneIds, [LANE_IDS.projection]);
    });
    for (const blockingStatus of ["failed", "partial"]) {
        (0, node_test_1.it)(`blocks publication on a required ${blockingStatus} and preserves the accepted state`, () => {
            const draft = canonicalDraft();
            const priorAcceptedStateDigest = draft.baseline.priorAcceptedStateDigest;
            const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
            const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 2,
                laneStates: laneStates(plan, {
                    [LANE_IDS.collectCalendar]: { status: "succeeded" },
                    [LANE_IDS.collectGranola]: { status: "succeeded" },
                    [LANE_IDS.normalizeCalendar]: { status: "succeeded" },
                    [LANE_IDS.normalizeGranola]: {
                        status: blockingStatus,
                        lastGoodCheckpointDigest: digest("granola-last-good-checkpoint"),
                        lastGoodSourceSliceDigest: digest("granola-last-good-source-slice"),
                        errorCode: blockingStatus === "partial"
                            ? "provider_partial_result"
                            : "provider_unavailable",
                        errorDetailDigest: digest(`granola-${blockingStatus}-error`),
                    },
                    [LANE_IDS.identityBarrier]: { status: "succeeded" },
                    [LANE_IDS.authorityGate]: { status: "succeeded" },
                    [LANE_IDS.lifecycleGate]: { status: "succeeded" },
                    [LANE_IDS.projection]: { status: "succeeded" },
                }),
            });
            node_assert_1.default.strictEqual(publicationState(batch), "blocked");
            node_assert_1.default.ok(!batch.selectedLaneIds.includes(LANE_IDS.publication));
            node_assert_1.default.strictEqual(preservedAcceptedStateDigest(batch), priorAcceptedStateDigest);
            const publication = publicationRecord(batch);
            if (publication.preservesPriorAcceptedState !== undefined) {
                node_assert_1.default.strictEqual(publication.preservesPriorAcceptedState, true);
            }
        });
    }
    (0, node_test_1.it)("keeps every non-success required status publication-ineligible", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const targetLaneId = LANE_IDS.authorityGate;
        const cases = [
            {
                status: "absent",
                reasonCode: "required_lane_absent",
            },
            {
                status: "pending",
                reasonCode: "required_lane_pending",
            },
            {
                status: "running",
                reasonCode: "required_lane_running",
            },
            {
                status: "failed",
                reasonCode: "required_lane_failed",
            },
            {
                status: "skipped",
                reasonCode: "required_lane_skipped",
            },
        ];
        for (const row of cases) {
            const succeededLaneIds = new Set([
                LANE_IDS.collectCalendar,
                LANE_IDS.collectGranola,
                LANE_IDS.normalizeCalendar,
                LANE_IDS.normalizeGranola,
                LANE_IDS.identityBarrier,
                LANE_IDS.lifecycleGate,
            ]);
            let states = plan.lanes.map((plannedLane) => ({
                laneId: plannedLane.laneId,
                status: (succeededLaneIds.has(plannedLane.laneId)
                    ? "succeeded"
                    : "pending"),
            }));
            if (row.status === "absent") {
                states = states.filter((state) => state.laneId !== targetLaneId);
            }
            else {
                const target = states.find((state) => state.laneId === targetLaneId);
                target.status = row.status;
                if (row.status === "failed" || row.status === "skipped") {
                    Object.assign(target, {
                        errorCode: row.status === "skipped"
                            ? "upstream_unusable"
                            : "deterministic_gate_failed",
                        errorDetailDigest: digest(`required-${row.status}`),
                    });
                }
            }
            if (row.status === "skipped") {
                const barrier = states.find((state) => state.laneId === LANE_IDS.identityBarrier);
                Object.assign(barrier, {
                    status: "failed",
                    errorCode: "refresh_operation_failed",
                    errorDetailDigest: digest("barrier-upstream-failed"),
                });
                const lifecycle = states.find((state) => state.laneId === LANE_IDS.lifecycleGate);
                Object.assign(lifecycle, {
                    status: "skipped",
                    errorCode: "upstream_unusable",
                    errorDetailDigest: digest("lifecycle-upstream-skipped"),
                });
            }
            const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 4,
                laneStates: states,
            });
            node_assert_1.default.strictEqual(batch.publication.eligible, false, row.status);
            node_assert_1.default.ok(!batch.selectedLaneIds.includes(LANE_IDS.publication), row.status);
            node_assert_1.default.ok(batch.publication.reasonCodes.includes(row.reasonCode), `${row.status}: ${batch.publication.reasonCodes.join(",")}`);
        }
    });
    (0, node_test_1.it)("keeps optional failure visible without blocking publication", () => {
        const draft = canonicalDraft();
        draft.lanes.push(lane({
            laneId: "optional-refresh-audit",
            goal: "refresh_audit",
            operationVersion: "optional-audit.1",
            priority: "P2",
            priorityReasonCodes: ["optional_audit"],
            predecessorLaneIds: [LANE_IDS.projection],
            resourceClaims: [{
                    resourceId: "taskmap:optional-audit",
                    mode: "shared",
                }],
            effect: "read_only",
            requiredForPublication: false,
            inputDigests: [digest("optional-audit-input")],
            outputKinds: ["refresh_audit"],
        }));
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        const states = plan.lanes.map((plannedLane) => {
            if (plannedLane.laneId === LANE_IDS.publication) {
                return {
                    laneId: plannedLane.laneId,
                    status: "pending",
                };
            }
            if (plannedLane.laneId === "optional-refresh-audit") {
                return {
                    laneId: plannedLane.laneId,
                    status: "failed",
                    errorCode: "optional_lane_failed",
                    errorDetailDigest: digest("optional-audit-error"),
                };
            }
            return {
                laneId: plannedLane.laneId,
                status: "succeeded",
            };
        });
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: states,
        });
        node_assert_1.default.strictEqual(batch.publication.state, "ready");
        node_assert_1.default.strictEqual(batch.publication.eligible, true);
        node_assert_1.default.ok(batch.selectedLaneIds.includes(LANE_IDS.publication));
        node_assert_1.default.deepStrictEqual(batch.laneStates.find((state) => state.laneId === "optional-refresh-audit"), {
            laneId: "optional-refresh-audit",
            status: "failed",
            errorCode: "optional_lane_failed",
            errorDetailDigest: digest("optional-audit-error"),
        });
    });
    (0, node_test_1.it)("turns exact source+semantic-input+replay equality into a no-op", () => {
        const draft = exactNoOpDraft();
        const priorAcceptedStateDigest = draft.baseline.priorAcceptedStateDigest;
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.strictEqual(isExactNoOp(plan), true);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan),
        });
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, []);
        node_assert_1.default.strictEqual(publicationState(batch), "no_op");
        node_assert_1.default.strictEqual(preservedAcceptedStateDigest(batch), priorAcceptedStateDigest);
    });
    (0, node_test_1.it)("keeps semantic publication a no-op while scheduling independent optional audit work", () => {
        const draft = exactNoOpDraft();
        draft.lanes.push(optionalAuditLane("optional-noop-audit", {
            priority: "P1",
            priorityReasonCodes: ["connector_visibility"],
        }));
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.strictEqual(plan.isExactNoOp, true);
        const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 4,
            laneStates: laneStates(plan),
        });
        node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, ["optional-noop-audit"]);
        node_assert_1.default.strictEqual(batch.publication.state, "no_op");
        node_assert_1.default.strictEqual(batch.publication.eligible, false);
        node_assert_1.default.strictEqual(batch.candidateAcceptedStateDigest, draft.baseline.priorAcceptedStateDigest);
        node_assert_1.default.ok(batch.selectedLaneIds.every((laneId) => !planLaneById(plan, laneId).requiredForPublication));
    });
    (0, node_test_1.it)("keeps plan/candidate identity static while dynamic state, claims, and errors change batchId", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const pending = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan),
        });
        const running = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: { status: "running" },
            }),
        });
        const failedA = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: {
                    status: "failed",
                    lastGoodCheckpointDigest: digest("calendar-last-good-checkpoint"),
                    lastGoodSourceSliceDigest: digest("calendar-last-good-source-slice"),
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("calendar-error-a"),
                },
            }),
        });
        const failedB = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: laneStates(plan, {
                [LANE_IDS.collectCalendar]: {
                    status: "failed",
                    lastGoodCheckpointDigest: digest("calendar-last-good-checkpoint"),
                    lastGoodSourceSliceDigest: digest("calendar-last-good-source-slice"),
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("calendar-error-b"),
                },
            }),
        });
        node_assert_1.default.strictEqual(pending.planId, plan.planId);
        node_assert_1.default.strictEqual(running.planId, plan.planId);
        node_assert_1.default.strictEqual(failedA.planId, plan.planId);
        node_assert_1.default.strictEqual(failedB.planId, plan.planId);
        node_assert_1.default.notStrictEqual(pending.batchId, running.batchId);
        node_assert_1.default.notStrictEqual(running.batchId, failedA.batchId);
        node_assert_1.default.notStrictEqual(failedA.batchId, failedB.batchId);
        node_assert_1.default.strictEqual(candidateAcceptedStateDigest(plan, pending), candidateAcceptedStateDigest(plan, running));
        node_assert_1.default.strictEqual(candidateAcceptedStateDigest(plan, running), candidateAcceptedStateDigest(plan, failedA));
        node_assert_1.default.ok(JSON.stringify(running.activeClaims).includes("google_calendar"));
    });
    (0, node_test_1.it)("matches a scheduling oracle for generated DAGs with 1–64 optional lanes", () => {
        for (let count = 1; count <= 64; count += 1) {
            const draft = canonicalDraft();
            const optionalLaneIds = [];
            for (let index = 0; index < count; index += 1) {
                const laneId = `optional-node-${String(index).padStart(2, "0")}`;
                const predecessorLaneIds = [LANE_IDS.projection];
                if (index > 0 && index % 4 !== 0) {
                    predecessorLaneIds.push(optionalLaneIds[Math.floor((index - 1) / 2)]);
                }
                const willRun = index % 11 === 1;
                draft.lanes.push(lane({
                    laneId,
                    goal: "refresh_audit",
                    operationVersion: `generated-audit.${index + 1}`,
                    priority: index % 2 === 0 ? "P1" : "P2",
                    priorityReasonCodes: [
                        index % 2 === 0 ? "optional_enrichment" : "optional_audit",
                    ],
                    predecessorLaneIds,
                    resourceClaims: [{
                            resourceId: `optional:resource:${index % 11}`,
                            mode: willRun || index % 4 !== 0 ? "shared" : "exclusive",
                        }],
                    effect: "read_only",
                    requiredForPublication: false,
                    inputDigests: [digest(`optional-input-${index}`)],
                    outputKinds: ["refresh_audit"],
                }));
                optionalLaneIds.push(laneId);
            }
            const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
            const optionalLaneIdSet = new Set(optionalLaneIds);
            const optionalStatuses = new Map();
            for (let index = 0; index < optionalLaneIds.length; index += 1) {
                const plannedLane = planLaneById(plan, optionalLaneIds[index]);
                const optionalPredecessors = plannedLane.predecessorLaneIds.filter((predecessor) => optionalLaneIdSet.has(predecessor));
                const predecessorsSucceeded = optionalPredecessors.every((predecessor) => optionalStatuses.get(predecessor) === "succeeded");
                const status = !predecessorsSucceeded
                    ? "pending"
                    : index % 11 === 1
                        ? "running"
                        : index % 5 === 0
                            ? "succeeded"
                            : "pending";
                optionalStatuses.set(optionalLaneIds[index], status);
            }
            const states = plan.lanes.map((plannedLane) => {
                if (!optionalLaneIdSet.has(plannedLane.laneId)) {
                    return {
                        laneId: plannedLane.laneId,
                        status: "succeeded",
                    };
                }
                return {
                    laneId: plannedLane.laneId,
                    status: optionalStatuses.get(plannedLane.laneId),
                };
            });
            const runningCount = states.filter((state) => state.status === "running").length;
            const maxConcurrency = Math.max(runningCount, 1 + (count % 8));
            const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency,
                laneStates: states,
            });
            node_assert_1.default.deepStrictEqual(batch.selectedLaneIds, schedulingOracle(plan, states, maxConcurrency), `optional lane count ${count}`);
            const permuted = structuredClone(draft);
            const random = seededRandom(10_000 + count);
            shuffleInPlace(permuted.lanes, random);
            for (const plannedLane of permuted.lanes) {
                shuffleInPlace(plannedLane.predecessorLaneIds, random);
                shuffleInPlace(plannedLane.resourceClaims, random);
            }
            const permutedPlan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(permuted);
            const permutedStates = structuredClone(states);
            shuffleInPlace(permutedStates, random);
            const permutedBatch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(permutedPlan, {
                maxConcurrency,
                laneStates: permutedStates,
            });
            node_assert_1.default.strictEqual(permutedPlan.planId, plan.planId);
            node_assert_1.default.deepStrictEqual(permutedBatch, batch);
        }
    });
    (0, node_test_1.it)("rejects error codes that are incompatible with lane stage and status", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const cases = [
            {
                laneId: LANE_IDS.collectCalendar,
                state: {
                    status: "failed",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                    lastGoodSourceSliceDigest: SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                    errorCode: "publication_failed",
                    errorDetailDigest: digest("collect-publication-error"),
                },
            },
            {
                laneId: LANE_IDS.collectCalendar,
                state: {
                    status: "partial",
                    lastGoodCheckpointDigest: SOURCE_ARTIFACTS.calendar.priorCheckpointDigest,
                    lastGoodSourceSliceDigest: SOURCE_ARTIFACTS.calendar.priorSourceSliceDigest,
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("collect-wrong-partial-error"),
                },
            },
            {
                laneId: LANE_IDS.authorityGate,
                state: {
                    status: "failed",
                    errorCode: "provider_unavailable",
                    errorDetailDigest: digest("gate-provider-error"),
                },
            },
            {
                laneId: LANE_IDS.publication,
                state: {
                    status: "skipped",
                    errorCode: "publication_failed",
                    errorDetailDigest: digest("publication-wrong-skipped-error"),
                },
            },
        ];
        for (const row of cases) {
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 4,
                laneStates: laneStates(plan, {
                    [row.laneId]: row.state,
                }),
            }), /errorCode is incompatible with its stage and status/i, row.laneId);
        }
    });
    (0, node_test_1.it)("validates dynamic status/error enums and digest fields", () => {
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(canonicalDraft());
        const unknownStatus = laneStates(plan);
        unknownStatus[0].status = "cancelled";
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: unknownStatus,
        }), /status|unsupported|invalid/i);
        for (const errorCode of [
            "provider_timeout",
            "participant:alice-smith",
        ]) {
            const unknownErrorCode = laneStates(plan);
            Object.assign(unknownErrorCode[0], {
                status: "failed",
                errorCode,
                errorDetailDigest: digest(`unknown-error-code-${errorCode}`),
            });
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 2,
                laneStates: unknownErrorCode,
            }), /errorCode.*unknown|bounded ASCII opaque identifier/i, errorCode);
        }
        for (const unsafeErrorDetail of [
            "raw provider error",
            "/Users/neo/private/error",
            "owner@example.com",
            "ghp_abcdefghijklmnopqrstuvwxyz123456",
        ]) {
            const rawError = laneStates(plan, {
                [LANE_IDS.collectCalendar]: {
                    status: "failed",
                    errorCode: "provider_unavailable",
                    errorDetailDigest: unsafeErrorDetail,
                },
            });
            node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
                maxConcurrency: 2,
                laneStates: rawError,
            }), /digest|error/i);
        }
        const unknownStateField = laneStates(plan);
        unknownStateField[0].fixedNow = "2026-07-28T00:00:00.000Z";
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
            maxConcurrency: 2,
            laneStates: unknownStateField,
        }), /unknown|field|fixedNow/i);
    });
});
(0, node_test_1.describe)("P9.2 checkpoint integration", () => {
    (0, node_test_1.it)("references the full digest of a checkpoint built by the frozen P9.2 API", () => {
        const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: {
                connectionId: "synthetic-calendar-connection",
                sourceKind: "google_calendar",
                tenantOrWorkspaceDigest: digest("synthetic-workspace"),
                accountOrPrincipalDigest: digest("synthetic-principal"),
                grantVersion: "synthetic-read.1",
            },
            sourceKind: "google_calendar",
            adapterVersion: "google-calendar-adapter.1",
            capabilities: ["read_task", "read_context"],
            state: "success",
            attemptedAt: "2026-07-28T02:00:00.000Z",
            proposedWatermark: {
                kind: "revision",
                valueDigest: digest("calendar-watermark"),
                observedThrough: "2026-07-28T02:00:00.000Z",
            },
            acceptedSourceIdentityDigests: [digest("accepted-calendar-source")],
        });
        const checkpointDigest = (0, source_contracts_js_1.taskMapContractDigest)(checkpoint);
        node_assert_1.default.match(checkpointDigest, SHA256);
        node_assert_1.default.notStrictEqual(checkpointDigest, checkpoint.checkpointId);
        const draft = canonicalDraft();
        draft.baseline.priorCheckpointDigests = [
            checkpointDigest,
            SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
        ];
        draft.baseline.priorProviderArtifacts.find((artifact) => (artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest)).checkpointDigest = checkpointDigest;
        for (const laneId of [
            LANE_IDS.collectCalendar,
            LANE_IDS.normalizeCalendar,
        ]) {
            const checkpointLane = laneById(draft, laneId);
            checkpointLane.inputDigests = checkpointLane.inputDigests.map((inputDigest) => (inputDigest === SOURCE_ARTIFACTS.calendar.priorCheckpointDigest
                ? checkpointDigest
                : inputDigest));
        }
        const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
        node_assert_1.default.ok(plan.baseline.priorCheckpointDigests.includes(checkpointDigest));
        const truncated = canonicalDraft();
        truncated.baseline.priorCheckpointDigests = [
            checkpoint.checkpointId,
            SOURCE_ARTIFACTS.granola.priorCheckpointDigest,
        ];
        truncated.baseline.priorProviderArtifacts.find((artifact) => (artifact.bindingDigest === SOURCE_ARTIFACTS.calendar.bindingDigest)).checkpointDigest = checkpoint.checkpointId;
        node_assert_1.default.throws(() => (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(truncated), /checkpoint.*digest|digest.*checkpoint|64/i);
    });
});
