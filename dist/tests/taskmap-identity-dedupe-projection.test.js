"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const refresh_plan_js_1 = require("../src/engine/taskmap/refresh-plan.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const refresh_current_ref_js_1 = require("../src/engine/taskmap/refresh-current-ref.js");
const identity_dedupe_projection_js_1 = require("../src/engine/taskmap/identity-dedupe-projection.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
function identityStoreRoots(currentRoot, runRoot, sidecarRoot) {
    return { currentRoot, runRoot, sidecarRoot };
}
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`p10.2-test:${label}`);
const OWNER_SCOPE_DIGEST = digest("owner");
const REVIEW_ATTESTATION_DIGEST = digest("review-attestation");
const GENERATED_AT = "2026-07-28T05:00:00.000Z";
const FIRST_GENERATION = "00000000000000000001";
const SECOND_GENERATION = "00000000000000000002";
const CURRENT_PRIVACY = {
    sourceBodiesStored: false,
    rawOwnerIdentifiersStored: false,
    connectorSecretsStored: false,
    localPathsStored: false,
};
function binding(sourceKind, label = sourceKind) {
    return {
        connectionId: `synthetic-${label}-connection`,
        sourceKind,
        tenantOrWorkspaceDigest: digest(`${label}-workspace`),
        accountOrPrincipalDigest: digest(`${label}-principal`),
        grantVersion: "synthetic-read-v1",
    };
}
const LINEAR_BINDING = binding("linear");
const GITHUB_BINDING = binding("github");
const GEMINI_BINDING = binding("gemini_meet");
const CALENDAR_BINDING = binding("google_calendar");
const GRANOLA_BINDING = binding("granola");
const GMAIL_BINDING = binding("gmail");
const CODEX_BINDING = binding("codex_session");
const CLAUDE_BINDING = binding("claude_session");
const CURSOR_BINDING = binding("cursor_session");
function workAuthority() {
    return {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
    };
}
function contextAuthority() {
    return {
        evidence: "context_only",
        quality: "bounded_context",
        lifecycle: "none",
        completion: "none",
        rank: "context_only",
    };
}
function envelope(value) {
    return (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        binding: value.binding,
        sourceKind: value.sourceKind,
        objectType: value.objectType,
        sourceObjectId: value.sourceObjectId,
        sourceRevision: value.sourceRevision,
        eventTime: value.eventTime ?? GENERATED_AT,
        contentDigest: digest(value.contentLabel
            ?? `${value.sourceObjectId}-${value.sourceRevision}-content`),
        authority: value.authority
            ?? (value.objectType === "authoritative_task"
                ? workAuthority()
                : value.objectType === "calendar_event"
                    ? {
                        ...contextAuthority(),
                        quality: "source_native",
                    }
                    : contextAuthority()),
        ...(value.meetingIdentity === undefined
            ? {}
            : { meetingIdentity: value.meetingIdentity }),
    });
}
function designMeetingHint(overrides = {}) {
    const hint = {
        fingerprintVersion: "taskmap-meeting-fingerprint.1",
        startAt: "2026-07-28T01:30:00.000Z",
        endAt: "2026-07-28T02:00:00.000Z",
        calendarEventIdDigest: digest("design-calendar-event"),
        normalizedTitleDigest: digest("design-weekly-title"),
        participantSetDigest: digest("design-participant-set"),
        ...overrides,
    };
    if (hint.endAt === undefined)
        delete hint.endAt;
    if (hint.calendarEventIdDigest === undefined) {
        delete hint.calendarEventIdDigest;
    }
    return hint;
}
function fallbackMeetingHint(hint) {
    const { endAt: _endAt, calendarEventIdDigest: _calendarEventIdDigest, ...fallback } = hint;
    return fallback;
}
function sourceFixture(options = {}) {
    const revision = options.revision ?? "v1";
    const includeCalendar = options.includeCalendar ?? true;
    const baseHint = designMeetingHint(includeCalendar
        ? {}
        : { calendarEventIdDigest: undefined, endAt: undefined });
    const gemini = (0, source_contracts_js_1.buildGeminiMeetSource)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        binding: GEMINI_BINDING,
        documentId: "synthetic-design-doc",
        revisionId: `synthetic-design-revision-${revision}`,
        eventTime: baseHint.startAt,
        contentDigest: digest(`gemini-design-${revision}`),
        quality: "structured_generated",
        meetingIdentity: baseHint,
        gmailDiscoveries: options.discoveryMessageId === undefined
            ? []
            : [{
                    binding: GMAIL_BINDING,
                    channel: "gmail_direct",
                    opaqueMessageId: options.discoveryMessageId,
                    resolvedDocumentUrl: "https://docs.google.com/document/d/synthetic-design-doc/edit",
                }],
    });
    const calendar = envelope({
        binding: CALENDAR_BINDING,
        sourceKind: "google_calendar",
        objectType: "calendar_event",
        sourceObjectId: "synthetic-calendar-event",
        sourceRevision: `synthetic-calendar-revision-${revision}`,
        eventTime: baseHint.startAt,
        meetingIdentity: designMeetingHint(),
    });
    const granola = envelope({
        binding: GRANOLA_BINDING,
        sourceKind: "granola",
        objectType: "meeting_note",
        sourceObjectId: "synthetic-granola-meeting",
        sourceRevision: `synthetic-granola-revision-${revision}`,
        eventTime: baseHint.startAt,
        meetingIdentity: {
            ...fallbackMeetingHint(baseHint),
        },
    });
    const ambiguous = envelope({
        binding: binding("granola", "granola-ambiguous"),
        sourceKind: "granola",
        objectType: "meeting_note",
        sourceObjectId: "synthetic-granola-ambiguous",
        sourceRevision: `synthetic-granola-ambiguous-${revision}`,
        eventTime: baseHint.startAt,
        meetingIdentity: {
            ...fallbackMeetingHint(baseHint),
            participantSetDigest: digest("different-participant-set"),
        },
    });
    const workCanonical = envelope({
        binding: LINEAR_BINDING,
        sourceKind: "linear",
        objectType: "authoritative_task",
        sourceObjectId: "synthetic-work-primary",
        sourceRevision: `synthetic-work-primary-${revision}`,
        contentLabel: `work-primary-${revision}`,
    });
    const workAlias = envelope({
        binding: GITHUB_BINDING,
        sourceKind: "github",
        objectType: "authoritative_task",
        sourceObjectId: "synthetic-work-mirror",
        sourceRevision: `synthetic-work-mirror-${revision}`,
        contentLabel: `work-mirror-${revision}`,
    });
    const secondWork = options.includeSecondWork
        ? envelope({
            binding: LINEAR_BINDING,
            sourceKind: "linear",
            objectType: "authoritative_task",
            sourceObjectId: "synthetic-work-secondary",
            sourceRevision: `synthetic-work-secondary-${revision}`,
            contentLabel: `work-secondary-${revision}`,
        })
        : undefined;
    const codexRoot = envelope({
        binding: CODEX_BINDING,
        sourceKind: "codex_session",
        objectType: "agent_session",
        sourceObjectId: digest("synthetic-codex-root"),
        sourceRevision: digest(`synthetic-codex-root-${revision}`),
    });
    const claudeRoot = envelope({
        binding: CLAUDE_BINDING,
        sourceKind: "claude_session",
        objectType: "agent_session",
        sourceObjectId: digest("synthetic-claude-root"),
        sourceRevision: digest(`synthetic-claude-root-${revision}`),
        contentLabel: options.distinctSessionWorkRefOnly
            ? `same-session-content-${revision}`
            : undefined,
    });
    const cursorSubagent = envelope({
        binding: CURSOR_BINDING,
        sourceKind: "cursor_session",
        objectType: "agent_session",
        sourceObjectId: digest("synthetic-cursor-subagent"),
        sourceRevision: digest(`synthetic-cursor-subagent-${revision}`),
    });
    const wrapper = envelope({
        binding: CODEX_BINDING,
        sourceKind: "codex_session",
        objectType: "agent_session",
        sourceObjectId: digest("synthetic-codex-wrapper"),
        sourceRevision: digest(`synthetic-codex-wrapper-${revision}`),
    });
    const rows = [
        gemini.envelope,
        ...(includeCalendar ? [calendar] : []),
        granola,
        ...(options.ambiguousFallback ? [ambiguous] : []),
        workCanonical,
        workAlias,
        ...(secondWork === undefined ? [] : [secondWork]),
        codexRoot,
        claudeRoot,
        cursorSubagent,
        wrapper,
    ];
    const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(options.reverseEnvelopes ? [...rows].reverse() : rows, gemini.discoveryPointers);
    return {
        snapshot,
        workCanonical,
        workAlias,
        codexRoot,
        claudeRoot,
        cursorSubagent,
        wrapper,
        ...(secondWork === undefined ? {} : { secondWork }),
    };
}
function contextOnlyWorkSourceFixture() {
    const source = sourceFixture();
    const gmailContext = envelope({
        binding: GMAIL_BINDING,
        sourceKind: "gmail",
        objectType: "strategy_context",
        sourceObjectId: "synthetic-gmail-context",
        sourceRevision: "synthetic-gmail-context-v1",
    });
    const strategyContext = envelope({
        binding: binding("strategy"),
        sourceKind: "strategy",
        objectType: "strategy_context",
        sourceObjectId: "synthetic-strategy-context",
        sourceRevision: "synthetic-strategy-context-v1",
    });
    const replacedEnvelopeIds = new Set([
        source.workCanonical.envelopeId,
        source.workAlias.envelopeId,
    ]);
    return {
        ...source,
        snapshot: (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([
            ...source.snapshot.envelopes.filter((sourceEnvelope) => !replacedEnvelopeIds.has(sourceEnvelope.envelopeId)),
            gmailContext,
            strategyContext,
        ], source.snapshot.discoveryPointers),
        workCanonical: gmailContext,
        workAlias: strategyContext,
    };
}
function projectionFixture(includeSecondWork = false) {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt: GENERATED_AT,
        pointers: [
            {
                id: "linear-work",
                sourceKind: "linear",
                sourceObjectId: "synthetic-work-primary",
                sourceRefHash: "1111111111111111",
                sourceVersion: "synthetic-v1",
                authority: "source_system",
                syncMode: "reference_only",
                capabilities: ["read_task"],
            },
            ...(includeSecondWork
                ? [{
                        id: "linear-work-secondary",
                        sourceKind: "linear",
                        sourceObjectId: "synthetic-work-secondary",
                        sourceRefHash: "3333333333333333",
                        sourceVersion: "synthetic-v1",
                        authority: "source_system",
                        syncMode: "reference_only",
                        capabilities: ["read_task"],
                    }]
                : []),
            {
                id: "github-work",
                sourceKind: "github",
                sourceObjectId: "synthetic-work-mirror",
                sourceRefHash: "2222222222222222",
                sourceVersion: "synthetic-v1",
                authority: "source_system",
                syncMode: "reference_only",
                capabilities: ["read_task"],
            },
        ],
        events: [
            {
                id: "linear-work-open",
                pointerId: "linear-work",
                recordKind: "authoritative_task",
                activity: "task_created",
                occurredAt: "2026-07-27T20:00:00.000Z",
                observedAt: GENERATED_AT,
                objectRefs: ["work:primary"],
                title: "Ship the bounded identity barrier",
                summary: "One canonical accepted work item.",
                extractionConfidence: 1,
                sourceStatus: "in_progress",
                priority: 1,
            },
            ...(includeSecondWork
                ? [{
                        id: "linear-work-secondary-open",
                        pointerId: "linear-work-secondary",
                        recordKind: "authoritative_task",
                        activity: "task_created",
                        occurredAt: "2026-07-27T22:00:00.000Z",
                        observedAt: GENERATED_AT,
                        objectRefs: ["work:secondary"],
                        title: "Review the rollback observation",
                        summary: "A later-added accepted work item.",
                        extractionConfidence: 1,
                        sourceStatus: "in_progress",
                        priority: 1,
                    }]
                : []),
            {
                id: "github-work-open",
                pointerId: "github-work",
                recordKind: "authoritative_task",
                activity: "task_updated",
                occurredAt: "2026-07-27T21:00:00.000Z",
                observedAt: GENERATED_AT,
                objectRefs: ["work:mirror"],
                title: "Mirror of the bounded identity barrier",
                summary: "Explicitly aliased provider variant.",
                extractionConfidence: 1,
                sourceStatus: "in_progress",
                priority: 1,
            },
        ],
    };
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "synthetic-brain",
        model: "synthetic-model-v1",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt: GENERATED_AT,
        roots: [{
                proposalId: "root-identity",
                title: "Identity boundary",
                summary: "Accepted work after identity and dedupe.",
                evidenceEventIds: [
                    "linear-work-open",
                    "github-work-open",
                    ...(includeSecondWork ? ["linear-work-secondary-open"] : []),
                ],
                memberObjectRefs: [
                    "work:primary",
                    "work:mirror",
                    ...(includeSecondWork ? ["work:secondary"] : []),
                ],
                confidence: 1,
            }],
        tasks: [
            {
                proposalId: "task-primary",
                rootProposalId: "root-identity",
                title: "Ship the bounded identity barrier",
                summary: "Primary provider work variant.",
                evidenceEventIds: ["linear-work-open"],
                authoritativeTaskEventId: "linear-work-open",
                openState: "open",
                confidence: 1,
            },
            ...(includeSecondWork
                ? [{
                        proposalId: "task-secondary",
                        rootProposalId: "root-identity",
                        title: "Review the rollback observation",
                        summary: "Later-added accepted work.",
                        evidenceEventIds: ["linear-work-secondary-open"],
                        authoritativeTaskEventId: "linear-work-secondary-open",
                        openState: "open",
                        confidence: 1,
                    }]
                : []),
            {
                proposalId: "task-mirror",
                rootProposalId: "root-identity",
                title: "Mirror of the bounded identity barrier",
                summary: "Explicit provider mirror.",
                evidenceEventIds: ["github-work-open"],
                authoritativeTaskEventId: "github-work-open",
                openState: "open",
                confidence: 1,
            },
        ],
        edges: [
            {
                proposalId: "edge-primary",
                fromProposalId: "root-identity",
                toProposalId: "task-primary",
                relation: "advances",
                evidenceEventIds: ["linear-work-open"],
                confidence: 1,
            },
            {
                proposalId: "edge-mirror",
                fromProposalId: "root-identity",
                toProposalId: "task-mirror",
                relation: "advances",
                evidenceEventIds: ["github-work-open"],
                confidence: 1,
            },
            ...(includeSecondWork
                ? [{
                        proposalId: "edge-secondary",
                        fromProposalId: "root-identity",
                        toProposalId: "task-secondary",
                        relation: "advances",
                        evidenceEventIds: ["linear-work-secondary-open"],
                        confidence: 1,
                    }]
                : []),
        ],
    };
    return (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: GENERATED_AT,
    });
}
function rejectionOnlySecondWorkProjectionFixture() {
    const projection = clone(projectionFixture(true));
    const rejectedTask = projection.tasks.find((task) => task.title === "Review the rollback observation");
    node_assert_1.default.ok(rejectedTask);
    projection.tasks = projection.tasks.filter((task) => task.id !== rejectedTask.id);
    projection.edges = projection.edges.filter((edge) => (edge.from !== rejectedTask.id && edge.to !== rejectedTask.id));
    projection.roots = projection.roots.map((root) => ({
        ...root,
        taskIds: root.taskIds.filter((taskId) => taskId !== rejectedTask.id),
    }));
    projection.rejections.push({
        proposalId: "task-secondary",
        kind: "task",
        reasons: ["already_adjudicated"],
    });
    return projection;
}
function policyBindings() {
    return [
        "identity",
        "normalization",
        "publication",
        "scheduling",
        "source",
    ].map((name) => ({
        name: `${name}-policy`,
        version: `${name}-policy.1`,
        digest: digest(`policy-${name}`),
    }));
}
function revisionSets(revisions, bindingDigests) {
    return [...bindingDigests].sort().map((bindingDigest) => ({
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
function lanesFor(bindingRows, priorProviderArtifacts = []) {
    const lane = (value) => ({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_LANE_VERSION,
        ...value,
    });
    const inputDigestsFor = (bindingDigest) => {
        const prior = priorProviderArtifacts.find((artifact) => artifact.bindingDigest === bindingDigest);
        return [
            bindingDigest,
            ...(prior === undefined
                ? []
                : [prior.checkpointDigest, prior.sourceSliceDigest]),
        ].sort();
    };
    const collect = bindingRows.map((row, index) => lane({
        laneId: `collect-${index}`,
        goal: "provider_collect",
        operationVersion: `${row.sourceKind}-collect.1`,
        priority: "P0",
        priorityReasonCodes: ["source_freshness"],
        predecessorLaneIds: [],
        resourceClaims: [{
                resourceId: `provider:${row.sourceKind}:${index}`,
                mode: "shared",
            }],
        effect: "read_only",
        requiredForPublication: true,
        inputDigests: inputDigestsFor(row.bindingDigest),
        outputKinds: ["connector_checkpoint", "source_slice"],
    }));
    const normalize = bindingRows.map((row, index) => lane({
        laneId: `normalize-${index}`,
        goal: "source_normalize",
        operationVersion: `${row.sourceKind}-normalize.1`,
        priority: "P0",
        priorityReasonCodes: ["identity_integrity"],
        predecessorLaneIds: [`collect-${index}`],
        resourceClaims: [{
                resourceId: `normalization:${row.sourceKind}:${index}`,
                mode: "shared",
            }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: inputDigestsFor(row.bindingDigest),
        outputKinds: ["normalized_source"],
    }));
    const identity = lane({
        laneId: "identity",
        goal: "identity_dedupe_barrier",
        operationVersion: "identity.2",
        priority: "P0",
        priorityReasonCodes: ["identity_integrity"],
        predecessorLaneIds: normalize.map((row) => row.laneId),
        resourceClaims: [{
                resourceId: "taskmap:identity",
                mode: "exclusive",
            }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: bindingRows.map((row) => row.bindingDigest),
        outputKinds: ["identity_set"],
    });
    const gate = lane({
        laneId: "gate",
        goal: "deterministic_gate",
        operationVersion: "gate.2",
        priority: "P0",
        priorityReasonCodes: ["deterministic_replay"],
        predecessorLaneIds: ["identity"],
        resourceClaims: [{
                resourceId: "taskmap:gates",
                mode: "shared",
            }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("gate-input")],
        outputKinds: ["gate_decision"],
    });
    const projection = lane({
        laneId: "projection",
        goal: "taskmap_projection",
        operationVersion: "projection.2",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["gate"],
        resourceClaims: [{
                resourceId: "taskmap:projection",
                mode: "exclusive",
            }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("projection-input")],
        outputKinds: ["taskmap_projection"],
    });
    const publication = lane({
        laneId: "publication",
        goal: "publication",
        operationVersion: "publication.2",
        priority: "P0",
        priorityReasonCodes: ["publication_safety"],
        predecessorLaneIds: ["projection"],
        resourceClaims: [{
                resourceId: "taskmap:accepted-head",
                mode: "exclusive",
            }],
        effect: "local_state",
        requiredForPublication: true,
        inputDigests: [digest("publication-input")],
        outputKinds: ["accepted_state"],
    });
    return [...collect, ...normalize, identity, gate, projection, publication];
}
function originFixture(snapshot, projection, suppliedProofs, replayDigestOverride, prior, reviewAttestationDigest = REVIEW_ATTESTATION_DIGEST) {
    const bindingsByDigest = new Map();
    for (const sourceEnvelope of snapshot.envelopes) {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.binding);
        const current = bindingsByDigest.get(bindingDigest) ?? {
            bindingDigest,
            binding: sourceEnvelope.binding,
            sourceKind: sourceEnvelope.sourceKind,
            envelopes: [],
        };
        current.envelopes.push(sourceEnvelope);
        bindingsByDigest.set(bindingDigest, current);
    }
    const bindingRows = [...bindingsByDigest.values()]
        .sort((left, right) => left.bindingDigest.localeCompare(right.bindingDigest));
    const sourceRevisions = snapshot.envelopes.map((sourceEnvelope) => ({
        bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.binding),
        sourceIdentityDigest: sourceEnvelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.sourceRevision),
        contentDigest: sourceEnvelope.contentDigest,
    })).sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)
        || left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
        || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
        || left.contentDigest.localeCompare(right.contentDigest)));
    const priorProviderArtifacts = prior === undefined
        ? []
        : (prior.baselineSnapshot ?? prior.currentSnapshot).head.connectorHeads.map((head) => ({
            bindingDigest: head.bindingDigest,
            checkpointDigest: head.latestCheckpoint.checkpointDigest,
            sourceSliceDigest: head.latestCheckpoint.sourceSliceDigest,
        })).sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)));
    const draft = {
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        baseline: prior === undefined
            ? {
                kind: "genesis",
                priorCheckpointDigests: [],
                priorSourceSliceDigests: [],
                priorProviderArtifacts: [],
                acceptedSourceRevisions: [],
                acceptedSourceRevisionSets: [],
                acceptedSemanticInputDigests: [],
            }
            : {
                kind: "accepted",
                priorCheckpointDigests: (prior.baselineSnapshot ?? prior.currentSnapshot).head.connectorHeads
                    .map((head) => head.latestCheckpoint.checkpointDigest)
                    .sort(),
                priorSourceSliceDigests: (prior.baselineSnapshot ?? prior.currentSnapshot).head.connectorHeads
                    .map((head) => head.latestCheckpoint.sourceSliceDigest)
                    .sort(),
                priorProviderArtifacts,
                priorAcceptedStateDigest: prior.origin.plan.candidateAcceptedStateDigest,
                priorOwnerScopeDigest: prior.origin.plan.ownerScopeDigest,
                priorSourceSnapshotDigest: prior.sourceSnapshot.sourceSnapshotDigest,
                priorReviewedEvidenceDigest: prior.origin.plan.reviewedEvidenceDigest,
                priorPolicyBundleDigest: prior.origin.plan.policyBundleDigest,
                priorSemanticImplementationDigest: prior.origin.plan.semanticImplementationDigest,
                acceptedSourceRevisions: prior.origin.plan.sourceRevisions,
                acceptedSourceRevisionSets: prior.origin.plan.sourceRevisionSets,
                acceptedSemanticInputDigests: prior.origin.plan.semanticInputDigests,
                acceptedDeterministicReplayDigest: prior.origin.plan.deterministicReplayDigest,
            },
        reviewedDigests: {
            truthSetDigest: digest("truth"),
            reviewBatchDigest: digest("review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest,
            sourceManifestDigest: digest("source-manifest"),
        },
        sourceBindings: bindingRows.map((row) => ({
            bindingDigest: row.bindingDigest,
            sourceKind: row.sourceKind,
            sourceContractVersion: row.envelopes[0].contractVersion,
            adapterVersion: `${row.sourceKind}-adapter.1`,
        })),
        sourceRevisions,
        sourceRevisionSets: revisionSets(sourceRevisions, bindingRows.map((row) => row.bindingDigest)),
        semanticInputDigests: [snapshot.semanticInputDigest],
        deterministicReplayDigest: replayDigestOverride
            ?? (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeReplayClosureDigest)(snapshot, projection, suppliedProofs, reviewAttestationDigest),
        policyBindings: policyBindings(),
        lanes: lanesFor(bindingRows, priorProviderArtifacts),
    };
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)(draft);
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 4,
        laneStates: plan.lanes.map((lane) => ({
            laneId: lane.laneId,
            status: "succeeded",
        })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "complete");
    const checkpoints = bindingRows.map((row, index) => {
        const priorCheckpoint = (prior?.providerOrigin ?? prior?.origin)?.checkpoints.checkpoints.find((record) => ((0, source_contracts_js_1.taskMapContractDigest)(record.checkpoint.binding)
            === row.bindingDigest))?.checkpoint ?? null;
        const attemptedAt = prior === undefined
            ? GENERATED_AT
            : prior.currentSnapshot.head.generation === FIRST_GENERATION
                ? "2026-07-28T06:00:00.000Z"
                : "2026-07-28T07:00:00.000Z";
        const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(priorCheckpoint, {
            binding: row.binding,
            sourceKind: row.sourceKind,
            adapterVersion: `${row.sourceKind}-adapter.1`,
            capabilities: ["read_context"],
            state: "success",
            attemptedAt,
            proposedWatermark: {
                kind: "revision",
                valueDigest: digest(`${prior === undefined ? "watermark" : "successor-watermark"}-${index}`),
                observedThrough: attemptedAt,
            },
            acceptedSourceIdentityDigests: row.envelopes.map((sourceEnvelope) => (sourceEnvelope.sourceIdentityDigest)).sort(),
        });
        const revisions = sourceRevisions.filter((revision) => (revision.bindingDigest === row.bindingDigest));
        const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
            ownerScopeDigest: snapshot.ownerScopeDigest,
            bindingDigest: row.bindingDigest,
            sourceRevisions: revisions,
            acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
        });
        return {
            row,
            checkpoint,
            sourceSlice,
            laneId: `collect-${index}`,
        };
    });
    const prepared = (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: checkpoints.map((checkpoint) => checkpoint.checkpoint),
        attemptOutputs: checkpoints.map((checkpoint) => ({
            laneId: checkpoint.laneId,
            checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint.checkpoint),
            sourceSliceDigest: checkpoint.sourceSlice.sourceSliceDigest,
        })),
        sourceSliceProofs: checkpoints.map((checkpoint) => checkpoint.sourceSlice),
        sourceSnapshot: snapshot,
    });
    const parseMember = (name) => JSON.parse(prepared.members[name]);
    const origin = {
        bundleId: prepared.bundleId,
        manifest: prepared.manifest,
        commitMarker: prepared.commitMarker,
        plan: parseMember("plan.json"),
        batch: parseMember("batch.json"),
        checkpoints: parseMember("checkpoints.json"),
        sourceSnapshotProof: parseMember("source-snapshot.json"),
    };
    const generation = prior === undefined
        ? FIRST_GENERATION
        : (BigInt(prior.currentSnapshot.head.generation) + 1n)
            .toString()
            .padStart(20, "0");
    const accepted = {
        acceptedStateDigest: plan.candidateAcceptedStateDigest,
        bundleId: origin.bundleId,
        planId: plan.planId,
        batchId: batch.batchId,
        originGeneration: generation,
    };
    const connectorHeads = checkpoints.map((checkpoint) => {
        const artifact = {
            bundleId: origin.bundleId,
            checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint.checkpoint),
            sourceSliceDigest: checkpoint.sourceSlice.sourceSliceDigest,
        };
        return {
            connectorKeyDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                binding: checkpoint.checkpoint.binding,
                sourceKind: checkpoint.checkpoint.sourceKind,
                adapterVersion: checkpoint.checkpoint.adapterVersion,
            }),
            bindingDigest: checkpoint.row.bindingDigest,
            sourceKind: checkpoint.row.sourceKind,
            adapterVersion: checkpoint.checkpoint.adapterVersion,
            latestCheckpoint: artifact,
            lastGood: artifact,
        };
    }).sort((left, right) => (left.connectorKeyDigest.localeCompare(right.connectorKeyDigest)));
    const refCore = {
        contractVersion: refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_REF_VERSION,
        generation,
        ...(prior === undefined
            ? {}
            : { predecessorRefId: prior.currentSnapshot.head.refId }),
        ownerScopeDigest: snapshot.ownerScopeDigest,
        operation: "complete",
        attempt: {
            generation,
            bundleId: origin.bundleId,
            planId: plan.planId,
            batchId: batch.batchId,
            publicationState: "complete",
            candidateAcceptedStateDigest: plan.candidateAcceptedStateDigest,
        },
        accepted,
        connectorHeads,
        privacy: CURRENT_PRIVACY,
    };
    const ref = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
        ...refCore,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(refCore)}`,
    });
    return {
        origin,
        prepared,
        currentSnapshot: {
            status: "healthy",
            head: ref,
            generations: [
                ...(prior?.currentSnapshot.generations ?? []),
                ref,
            ],
            unknownGenerationNames: [],
            unknownObjectNames: [],
        },
    };
}
function blockedGenesisOriginFixture(snapshot) {
    const bindingsByDigest = new Map();
    for (const sourceEnvelope of snapshot.envelopes) {
        const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.binding);
        const current = bindingsByDigest.get(bindingDigest) ?? {
            bindingDigest,
            binding: sourceEnvelope.binding,
            sourceKind: sourceEnvelope.sourceKind,
            envelopes: [],
        };
        current.envelopes.push(sourceEnvelope);
        bindingsByDigest.set(bindingDigest, current);
    }
    const bindingRows = [...bindingsByDigest.values()]
        .sort((left, right) => left.bindingDigest.localeCompare(right.bindingDigest));
    const failed = bindingRows[0];
    const sourceRevisions = snapshot.envelopes.map((sourceEnvelope) => ({
        bindingDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.binding),
        sourceIdentityDigest: sourceEnvelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(sourceEnvelope.sourceRevision),
        contentDigest: sourceEnvelope.contentDigest,
    })).sort((left, right) => (left.bindingDigest.localeCompare(right.bindingDigest)
        || left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
        || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
        || left.contentDigest.localeCompare(right.contentDigest)));
    const plan = (0, refresh_plan_js_1.buildTaskMapRefreshPlan)({
        contractVersion: refresh_plan_js_1.TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        baseline: {
            kind: "genesis",
            priorCheckpointDigests: [],
            priorSourceSliceDigests: [],
            priorProviderArtifacts: [],
            acceptedSourceRevisions: [],
            acceptedSourceRevisionSets: [],
            acceptedSemanticInputDigests: [],
        },
        reviewedDigests: {
            truthSetDigest: digest("blocked-truth"),
            reviewBatchDigest: digest("blocked-review-batch"),
            reviewAttestationVersion: refresh_plan_js_1.TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
            reviewAttestationDigest: digest("blocked-review-attestation"),
            sourceManifestDigest: digest("blocked-source-manifest"),
        },
        sourceBindings: bindingRows.map((row) => ({
            bindingDigest: row.bindingDigest,
            sourceKind: row.sourceKind,
            sourceContractVersion: row.envelopes[0].contractVersion,
            adapterVersion: `${row.sourceKind}-adapter.1`,
        })),
        sourceRevisions,
        sourceRevisionSets: revisionSets(sourceRevisions, bindingRows.map((row) => row.bindingDigest)),
        semanticInputDigests: [snapshot.semanticInputDigest],
        deterministicReplayDigest: digest("blocked-replay"),
        policyBindings: policyBindings(),
        lanes: lanesFor(bindingRows),
    });
    const failedLaneId = "collect-0";
    const failureDigest = digest("blocked-provider-unavailable");
    const batch = (0, refresh_plan_js_1.selectTaskMapReadyBatch)(plan, {
        maxConcurrency: 4,
        laneStates: plan.lanes.map((lane) => (lane.laneId === failedLaneId
            ? {
                laneId: lane.laneId,
                status: "failed",
                errorCode: "provider_unavailable",
                errorDetailDigest: failureDigest,
            }
            : {
                laneId: lane.laneId,
                status: "pending",
            })),
    });
    node_assert_1.default.strictEqual(batch.publication.state, "blocked");
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
        binding: failed.binding,
        sourceKind: failed.sourceKind,
        adapterVersion: `${failed.sourceKind}-adapter.1`,
        capabilities: ["read_context"],
        state: "failed",
        attemptedAt: GENERATED_AT,
        errorCode: "provider_unavailable",
        errorDetailDigest: failureDigest,
    });
    const sourceSlice = (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
        sliceRole: "observed_non_serving",
        ownerScopeDigest: snapshot.ownerScopeDigest,
        bindingDigest: failed.bindingDigest,
        sourceRevisions: [],
        acceptedSourceIdentityDigests: [],
    });
    return (0, refresh_run_bundle_js_1.prepareTaskMapRefreshRunBundle)({
        plan,
        batch,
        connectorCheckpoints: [checkpoint],
        attemptOutputs: [{
                laneId: failedLaneId,
                checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
                sourceSliceDigest: sourceSlice.sourceSliceDigest,
            }],
        sourceSliceProofs: [sourceSlice],
        sourceSnapshot: snapshot,
    });
}
function aliasesFor(source) {
    return [
        {
            identityKind: "work",
            canonicalSourceObjectKeyDigest: source.workCanonical.sourceObjectKeyDigest,
            aliasSourceObjectKeyDigest: source.workAlias.sourceObjectKeyDigest,
        },
        {
            identityKind: "session",
            canonicalSourceObjectKeyDigest: source.codexRoot.sourceObjectKeyDigest,
            aliasSourceObjectKeyDigest: source.claudeRoot.sourceObjectKeyDigest,
        },
    ];
}
function workBindingsFor(projection, source) {
    node_assert_1.default.strictEqual(projection.tasks.length, source.secondWork === undefined ? 2 : 3, (0, source_contracts_js_1.taskMapContractCanonicalJson)(projection));
    const bindings = [
        {
            projectionKind: "task",
            projectionId: projection.tasks[0].id,
            sourceEnvelopeId: source.workCanonical.envelopeId,
        },
        {
            projectionKind: "task",
            projectionId: projection.tasks[1].id,
            sourceEnvelopeId: source.workAlias.envelopeId,
        },
    ];
    if (source.secondWork !== undefined) {
        const secondary = projection.tasks.find((task) => task.title === "Review the rollback observation");
        node_assert_1.default.ok(secondary);
        bindings.push({
            projectionKind: "task",
            projectionId: secondary.id,
            sourceEnvelopeId: source.secondWork.envelopeId,
        });
    }
    return bindings;
}
function rejectionOnlyWorkBindingsFor(projection, source) {
    node_assert_1.default.ok(source.secondWork);
    const primary = projection.tasks.find((task) => task.title === "Ship the bounded identity barrier");
    const mirror = projection.tasks.find((task) => task.title === "Mirror of the bounded identity barrier");
    node_assert_1.default.ok(primary);
    node_assert_1.default.ok(mirror);
    node_assert_1.default.ok(projection.rejections.some((rejection) => (rejection.kind === "task"
        && rejection.proposalId === "task-secondary")));
    return [{
            projectionKind: "task",
            projectionId: primary.id,
            sourceEnvelopeId: source.workCanonical.envelopeId,
        }, {
            projectionKind: "task",
            projectionId: mirror.id,
            sourceEnvelopeId: source.workAlias.envelopeId,
        }, {
            projectionKind: "rejection",
            projectionId: "task-secondary",
            sourceEnvelopeId: source.secondWork.envelopeId,
        }];
}
function sessionLineageFor(source) {
    return [
        {
            sessionEnvelopeId: source.codexRoot.envelopeId,
            role: "root",
            workSourceObjectKeyDigest: source.workCanonical.sourceObjectKeyDigest,
        },
        {
            sessionEnvelopeId: source.claudeRoot.envelopeId,
            role: "root",
            workSourceObjectKeyDigest: source.workAlias.sourceObjectKeyDigest,
        },
        {
            sessionEnvelopeId: source.cursorSubagent.envelopeId,
            role: "subagent",
            parentSessionEnvelopeId: source.claudeRoot.envelopeId,
        },
        {
            sessionEnvelopeId: source.wrapper.envelopeId,
            role: "wrapper",
        },
    ];
}
function lifecycleFor(source, overrides = {}) {
    return [{
            canonicalSourceObjectKeyDigest: [
                source.workCanonical.sourceObjectKeyDigest,
                source.workAlias.sourceObjectKeyDigest,
            ].sort()[0],
            previousState: "absent",
            currentState: "open",
            currentSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
            adjudicatedDelta: "open",
            ...overrides,
        }];
}
function twoWorkLifecycleFor(source, previousPrimary, includeSecondaryPrior) {
    node_assert_1.default.ok(source.secondWork);
    return [
        {
            canonicalSourceObjectKeyDigest: [
                source.workCanonical.sourceObjectKeyDigest,
                source.workAlias.sourceObjectKeyDigest,
            ].sort()[0],
            previousState: "open",
            currentState: "open",
            previousSourceIdentityDigest: previousPrimary.sourceIdentityDigest,
            currentSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
            adjudicatedDelta: "no_op",
        },
        {
            canonicalSourceObjectKeyDigest: source.secondWork.sourceObjectKeyDigest,
            ...(includeSecondaryPrior
                ? {
                    previousState: "open",
                    previousSourceIdentityDigest: source.secondWork.sourceIdentityDigest,
                    adjudicatedDelta: "no_op",
                }
                : {
                    previousState: "absent",
                    adjudicatedDelta: "open",
                }),
            currentState: "open",
            currentSourceIdentityDigest: source.secondWork.sourceIdentityDigest,
        },
    ];
}
function validInput(options = {}) {
    const source = options.source ?? sourceFixture(options);
    const projection = options.projection
        ?? projectionFixture(options.includeSecondWork ?? false);
    const workBindings = options.workBindings ?? workBindingsFor(projection, source);
    const aliases = options.aliases ?? aliasesFor(source);
    const sessionLineage = options.sessionLineage ?? sessionLineageFor(source);
    const lifecycleAdjudications = options.lifecycle ?? lifecycleFor(source);
    const origin = originFixture(source.snapshot, projection, {
        workBindings,
        aliases,
        sessionLineage,
        lifecycleAdjudications,
    }, options.replayDigestOverride);
    return {
        currentSnapshot: origin.currentSnapshot,
        acceptedOrigin: origin.origin,
        sourceSnapshot: source.snapshot,
        projection,
        workBindings,
        aliases,
        sessionLineage,
        lifecycleAdjudications,
        previousSidecar: null,
        previousAcceptedOrigin: null,
        source,
    };
}
function withoutSource(value) {
    const { source: _source, ...input } = value;
    return input;
}
function rebindAcceptedOrigin(input) {
    const origin = originFixture(input.sourceSnapshot, input.projection, {
        aliases: input.aliases,
        workBindings: input.workBindings,
        sessionLineage: input.sessionLineage,
        lifecycleAdjudications: input.lifecycleAdjudications,
    });
    input.acceptedOrigin = origin.origin;
    input.currentSnapshot = origin.currentSnapshot;
}
function clone(value) {
    return structuredClone(value);
}
function rebindSidecarId(sidecar) {
    const { sidecarId: _sidecarId, ...core } = sidecar;
    sidecar.sidecarId =
        `tmidentityprojection_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`;
}
function rebindDiffId(diff) {
    const { diffId: _diffId, contractVersion: _contractVersion, ...core } = diff;
    diff.diffId = `tmidentitydiff_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`;
}
function semanticRowsDigestForTest(sidecar) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        contractVersion: sidecar.contractVersion,
        policyVersion: sidecar.policyVersion,
        works: sidecar.works,
        events: sidecar.events,
        lifecycleDeltas: sidecar.lifecycleDeltas,
        rejectedVariants: sidecar.rejectedVariants,
        privacy: sidecar.privacy,
    });
}
function generationOneDiffRowsForTest(sidecar) {
    const rows = [{
            kind: "metadata",
            id: "identity-sidecar-metadata",
            value: {
                contractVersion: sidecar.contractVersion,
                ownerScopeDigest: sidecar.ownerScopeDigest,
                policyVersion: sidecar.policyVersion,
                suppliedIdentityProofDigest: sidecar.suppliedIdentityProofDigest,
                sourceSnapshotId: sidecar.sourceSnapshotId,
                sourceSnapshotDigest: sidecar.sourceSnapshotDigest,
                projectionRunId: sidecar.projectionRunId,
                projectionDigest: sidecar.projectionDigest,
                origin: sidecar.origin,
                replayClosure: sidecar.replayClosure,
                privacy: sidecar.privacy,
            },
        }, ...sidecar.works.map((value) => ({
            kind: "work",
            id: value.workId,
            value,
        })), ...sidecar.events.map((value) => ({
            kind: "event",
            id: value.eventId,
            value,
        })), ...sidecar.lifecycleDeltas.map((value) => ({
            kind: "lifecycle_delta",
            id: value.deltaId,
            value,
        })), ...sidecar.rejectedVariants.map((value) => ({
            kind: "rejected_variant",
            id: value.rejectionId,
            value,
        }))];
    return rows
        .sort((left, right) => (left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)))
        .map((row) => ({
        kind: row.kind,
        id: row.id,
        afterDigest: (0, source_contracts_js_1.taskMapContractDigest)(row.value),
    }));
}
function rehashGenerationOneSemanticAttack(source, mutate) {
    const entry = clone(source);
    node_assert_1.default.strictEqual(entry.generation, FIRST_GENERATION);
    node_assert_1.default.strictEqual(entry.predecessor, null);
    mutate(entry.sidecar);
    entry.sidecar.replayClosure.semanticRowsDigest =
        semanticRowsDigestForTest(entry.sidecar);
    entry.sidecar.origin.replayClosureDigest =
        (0, source_contracts_js_1.taskMapContractDigest)(entry.sidecar.replayClosure);
    rebindSidecarId(entry.sidecar);
    entry.sidecarId = entry.sidecar.sidecarId;
    entry.sidecarDigest = (0, source_contracts_js_1.taskMapContractDigest)(entry.sidecar);
    entry.replayClosureDigest =
        entry.sidecar.origin.replayClosureDigest;
    entry.semanticHead = {
        ...entry.semanticHead,
        sidecarId: entry.sidecarId,
        sidecarDigest: entry.sidecarDigest,
    };
    entry.diff.previousSidecarDigest = (0, source_contracts_js_1.taskMapContractDigest)(null);
    entry.diff.currentSidecarDigest = entry.sidecarDigest;
    entry.diff.added = generationOneDiffRowsForTest(entry.sidecar);
    entry.diff.removed = [];
    entry.diff.changed = [];
    rebindDiffId(entry.diff);
    entry.diffId = entry.diff.diffId;
    entry.diffDigest = (0, source_contracts_js_1.taskMapContractDigest)(entry.diff);
    const { entryId: _entryId, ...core } = entry;
    entry.entryId = `tmidentityentry_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`;
    return (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreEntry)(entry);
}
function rebuildCurrentRef(currentSnapshot, mutate) {
    const current = currentSnapshot.head;
    const { refId: _refId, ...core } = clone(current);
    mutate(core);
    const ref = {
        ...core,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`,
    };
    return {
        status: "healthy",
        head: ref,
        generations: [ref],
        unknownGenerationNames: [],
        unknownObjectNames: [],
    };
}
function continueFromPrevious(input, previousSnapshot, previousSidecar, previousAcceptedOrigin) {
    const previousRef = previousSnapshot.head;
    const current = input.currentSnapshot.head;
    const { refId: _refId, ...core } = clone(current);
    const nextGeneration = (BigInt(previousRef.generation) + 1n)
        .toString()
        .padStart(20, "0");
    core.generation = nextGeneration;
    core.predecessorRefId = previousRef.refId;
    if (core.attempt !== undefined) {
        core.attempt.generation = nextGeneration;
    }
    if (core.accepted !== undefined) {
        core.accepted.originGeneration = nextGeneration;
    }
    const ref = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
        ...core,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`,
    });
    input.currentSnapshot = {
        status: "healthy",
        head: ref,
        generations: [...previousSnapshot.generations, ref],
        unknownGenerationNames: [],
        unknownObjectNames: [],
    };
    input.previousSidecar = previousSidecar;
    input.previousAcceptedOrigin = previousAcceptedOrigin;
}
function continueWithVerifiedAcceptedOrigin(input, previousInput, previousSidecar, reviewAttestationDigest = REVIEW_ATTESTATION_DIGEST) {
    const origin = originFixture(input.sourceSnapshot, input.projection, {
        aliases: input.aliases,
        workBindings: input.workBindings,
        sessionLineage: input.sessionLineage,
        lifecycleAdjudications: input.lifecycleAdjudications,
    }, undefined, {
        origin: previousInput.acceptedOrigin,
        currentSnapshot: previousInput.currentSnapshot,
        sourceSnapshot: previousInput.sourceSnapshot,
    }, reviewAttestationDigest);
    input.currentSnapshot = origin.currentSnapshot;
    input.acceptedOrigin = origin.origin;
    input.previousSidecar = previousSidecar;
    input.previousAcceptedOrigin = previousInput.acceptedOrigin;
    return origin.origin;
}
function continueWithInheritedAcceptedGeneration(input, previousSnapshot, previousSidecar, previousAcceptedOrigin, operation) {
    const previousRef = previousSnapshot.head;
    const generation = (BigInt(previousRef.generation) + 1n)
        .toString()
        .padStart(20, "0");
    const attempt = clone(previousRef.attempt);
    attempt.generation = generation;
    attempt.publicationState = operation;
    const core = {
        contractVersion: refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_REF_VERSION,
        generation,
        predecessorRefId: previousRef.refId,
        ownerScopeDigest: previousRef.ownerScopeDigest,
        operation,
        attempt,
        accepted: clone(previousRef.accepted),
        connectorHeads: clone(previousRef.connectorHeads),
        privacy: clone(previousRef.privacy),
    };
    const ref = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
        ...core,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`,
    });
    input.currentSnapshot = {
        status: "healthy",
        head: ref,
        generations: [...previousSnapshot.generations, ref],
        unknownGenerationNames: [],
        unknownObjectNames: [],
    };
    input.acceptedOrigin = previousAcceptedOrigin;
    input.previousSidecar = previousSidecar;
    input.previousAcceptedOrigin = previousAcceptedOrigin;
}
function continueWithRollbackGeneration(input, previousSnapshot, previousSidecar, previousAcceptedOrigin, targetGeneration, targetAcceptedOrigin) {
    const previousRef = previousSnapshot.head;
    const targetRef = previousSnapshot.generations.find((ref) => ref.generation === targetGeneration);
    const generation = (BigInt(previousRef.generation) + 1n)
        .toString()
        .padStart(20, "0");
    const core = {
        contractVersion: refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_REF_VERSION,
        generation,
        predecessorRefId: previousRef.refId,
        ownerScopeDigest: previousRef.ownerScopeDigest,
        operation: "rollback",
        ...(previousRef.attempt === undefined
            ? {}
            : { attempt: clone(previousRef.attempt) }),
        accepted: clone(targetRef.accepted),
        connectorHeads: clone(previousRef.connectorHeads),
        rollback: {
            targetGeneration,
            targetRefId: targetRef.refId,
            targetAcceptedStateDigest: targetRef.accepted.acceptedStateDigest,
        },
        privacy: clone(previousRef.privacy),
    };
    const ref = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
        ...core,
        refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(core)}`,
    });
    input.currentSnapshot = {
        status: "healthy",
        head: ref,
        generations: [...previousSnapshot.generations, ref],
        unknownGenerationNames: [],
        unknownObjectNames: [],
    };
    input.acceptedOrigin = targetAcceptedOrigin;
    input.previousSidecar = previousSidecar;
    input.previousAcceptedOrigin = previousAcceptedOrigin;
}
(0, node_test_1.describe)("Task Map P10.2 identity/dedupe projection", () => {
    (0, node_test_1.it)("closes a healthy active P10.1C origin to the exact source snapshot and projection replay", () => {
        const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        node_assert_1.default.strictEqual(built.sidecar.contractVersion, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION);
        node_assert_1.default.strictEqual(built.sidecar.works.length, 1);
        node_assert_1.default.strictEqual(built.sidecar.works[0].projectionReferences.length, 2);
        node_assert_1.default.strictEqual(built.sidecar.origin.replayClosureDigest, (0, source_contracts_js_1.taskMapContractDigest)(built.sidecar.replayClosure));
        node_assert_1.default.deepStrictEqual((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(built.sidecar), built.sidecar);
        node_assert_1.default.deepStrictEqual((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeDiff)(built.diff), built.diff);
    });
    (0, node_test_1.it)("domain-binds every semantic row class and rejects the superseded pre-anchor schema", () => {
        const baseline = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput())).sidecar;
        const baselineDigest = semanticRowsDigestForTest(baseline);
        const mutations = [
            (sidecar) => {
                sidecar.works[0].variantSourceIdentityDigests[0] =
                    digest("semantic-work-rehash");
            },
            (sidecar) => {
                const meeting = sidecar.events.find((event) => event.eventKind === "meeting");
                if (meeting === undefined || meeting.eventKind !== "meeting") {
                    node_assert_1.default.fail("expected meeting row");
                }
                meeting.reviewState = meeting.reviewState === "resolved"
                    ? "needs_review"
                    : "resolved";
            },
            (sidecar) => {
                sidecar.lifecycleDeltas[0].adjudicationDigest =
                    digest("semantic-lifecycle-rehash");
            },
            (sidecar) => {
                sidecar.rejectedVariants[0].proofDigest =
                    digest("semantic-rejection-rehash");
            },
            (sidecar) => {
                sidecar.privacy.sourceBodiesStored = true;
            },
        ];
        for (const mutate of mutations) {
            const changed = clone(baseline);
            mutate(changed);
            node_assert_1.default.notStrictEqual(semanticRowsDigestForTest(changed), baselineDigest);
        }
        const staleAnchor = clone(baseline);
        delete staleAnchor.replayClosure.semanticRowsDigest;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(staleAnchor), /missing=semanticRowsDigest/);
    });
    (0, node_test_1.it)("uses the production entrypoint to read P10.1C and verify the immutable P10.1B origin from owner stores", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-store-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            const input = validInput();
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
                previousSidecar: null,
                currentSnapshot: input.currentSnapshot,
                acceptedOrigin: input.acceptedOrigin,
            }), /invalid fields/);
            const origin = originFixture(input.sourceSnapshot, input.projection, {
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            const materialized = await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, origin.prepared);
            node_assert_1.default.strictEqual(materialized.status, "created");
            const published = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: origin.prepared.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "10101010101010101010101010101010",
                },
            });
            node_assert_1.default.strictEqual(published.status, "published");
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /not caught up to the P10\.1 head/);
            const built = await (0, identity_dedupe_projection_js_1.buildTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            node_assert_1.default.strictEqual(built.sidecar.origin.currentRefId, published.ref.refId);
            node_assert_1.default.strictEqual(built.sidecar.origin.bundleId, origin.prepared.bundleId);
            const publicationInput = {
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            };
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput, {
                faultInjection: (point) => {
                    if (point === "after_stage_partial_write") {
                        throw new Error("synthetic interrupted partial write");
                    }
                },
            }), /synthetic interrupted partial write/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /recovery is required/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "11".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput, {
                faultInjection: async (point) => {
                    if (point === "after_stage_sync") {
                        const beforeRecovery = await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "staging"));
                        await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), { operationToken: "22".repeat(32) }), /refuses active writer claims/);
                        node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "staging")), beforeRecovery);
                        throw new Error("synthetic interrupted stage");
                    }
                },
            }), /synthetic interrupted stage/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /recovery is required/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "33".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            node_assert_1.default.deepStrictEqual(await (0, identity_dedupe_projection_js_1.unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest)(sidecarRoot), {
                entries: [],
                canonicalByteLength: 0,
                remainingByteCapacity: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes,
            });
            const claimsRoot = node_path_1.default.join(sidecarRoot, "claims");
            const recoveryClaimPath = node_path_1.default.join(claimsRoot, "recovery.claim");
            await (0, promises_1.writeFile)(recoveryClaimPath, "", { mode: 0o600 });
            await (0, promises_1.chmod)(recoveryClaimPath, 0o000);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "77".repeat(32),
            }), /recovery claim is already active/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput), /recovery claim is not fully materialized/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "77".repeat(32),
                takeOverRecoveryClaim: true,
            }), /requires external exclusivity assertion/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "77".repeat(32),
                takeOverRecoveryClaim: true,
                externalExclusivityAsserted: true,
            });
            let recoveryGetterInvoked = false;
            const getterOptions = Object.defineProperty({}, "operationToken", {
                enumerable: true,
                get() {
                    recoveryGetterInvoked = true;
                    return "78".repeat(32);
                },
            });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), getterOptions), /unknown or executable fields/);
            node_assert_1.default.strictEqual(recoveryGetterInvoked, false);
            const abandonedToken = "ab".repeat(32);
            const abandonedClaimPath = node_path_1.default.join(claimsRoot, `writer_${abandonedToken}.claim`);
            const abandonedAdmissionPath = node_path_1.default.join(claimsRoot, "writer-admission.claim");
            const abandonedStagePath = node_path_1.default.join(sidecarRoot, "staging", `stage_${abandonedToken}.json`);
            await (0, promises_1.writeFile)(abandonedClaimPath, "", { mode: 0o600 });
            await (0, promises_1.writeFile)(abandonedAdmissionPath, "", { mode: 0o600 });
            await (0, promises_1.writeFile)(abandonedStagePath, "", { mode: 0o600 });
            await (0, promises_1.chmod)(abandonedClaimPath, 0o000);
            await (0, promises_1.chmod)(abandonedAdmissionPath, 0o000);
            await (0, promises_1.chmod)(abandonedStagePath, 0o000);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "79".repeat(32),
            }), /refuses active writer claims/);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedClaimPath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedAdmissionPath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedStagePath)).isFile(), true);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "7a".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            }), /no exact durable writer-journal binding/);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedClaimPath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedAdmissionPath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(abandonedStagePath)).isFile(), true);
            await (0, promises_1.unlink)(abandonedStagePath);
            await (0, promises_1.unlink)(abandonedClaimPath);
            await (0, promises_1.unlink)(abandonedAdmissionPath);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput, {
                faultInjection: async (point) => {
                    if (point !== "after_stage_sync")
                        return;
                    const stagingRoot = node_path_1.default.join(sidecarRoot, "staging");
                    const [stageName] = await (0, promises_1.readdir)(stagingRoot);
                    node_assert_1.default.ok(stageName?.startsWith("stage_"));
                    const stagePath = node_path_1.default.join(stagingRoot, stageName);
                    const replacementPath = node_path_1.default.join(stagingRoot, "replacement.tmp");
                    const bytes = await (0, promises_1.readFile)(stagePath);
                    await (0, promises_1.writeFile)(replacementPath, bytes, { mode: 0o600 });
                    await (0, promises_1.chmod)(replacementPath, 0o600);
                    await (0, promises_1.rename)(replacementPath, stagePath);
                },
            }), /staged entry changed before generation CAS/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /recovery is required/);
            const [replacedStageName] = await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "staging"));
            node_assert_1.default.match(replacedStageName, /^stage_[0-9a-f]{64}\.json$/);
            const replacedStagePath = node_path_1.default.join(sidecarRoot, "staging", replacedStageName);
            const replacedWriterClaimPath = node_path_1.default.join(claimsRoot, `writer_${replacedStageName.slice(6, -5)}.claim`);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "34".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            }), /no exact durable writer-journal binding/);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(replacedStagePath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(replacedWriterClaimPath)).isFile(), true);
            await (0, promises_1.unlink)(replacedStagePath);
            await (0, promises_1.unlink)(replacedWriterClaimPath);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput, {
                faultInjection: async (point) => {
                    if (point !== "after_stage_sync")
                        return;
                    const stagingRoot = node_path_1.default.join(sidecarRoot, "staging");
                    const [stageName] = await (0, promises_1.readdir)(stagingRoot);
                    node_assert_1.default.ok(stageName?.startsWith("stage_"));
                    const stagePath = node_path_1.default.join(stagingRoot, stageName);
                    const bytes = await (0, promises_1.readFile)(stagePath);
                    bytes[Math.floor(bytes.byteLength / 2)] = 0x80;
                    await (0, promises_1.writeFile)(stagePath, bytes);
                    await (0, promises_1.chmod)(stagePath, 0o600);
                },
            }), /not valid UTF-8/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "35".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            let releaseFirst;
            const firstGate = new Promise((resolve) => {
                releaseFirst = resolve;
            });
            let firstArrived;
            const firstArrival = new Promise((resolve) => {
                firstArrived = resolve;
            });
            const priorUmask = process.umask(0o777);
            let firstPublication;
            let retryPublication;
            const firstPromise = (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({ ...publicationInput }, {
                faultInjection: async (point) => {
                    if (point !== "after_stage_sync")
                        return;
                    firstArrived();
                    await firstGate;
                },
            });
            try {
                await firstArrival;
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({ ...publicationInput }), /recovery is required/);
                node_assert_1.default.strictEqual((await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "staging"))).length, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries);
                releaseFirst();
                firstPublication = await firstPromise;
                retryPublication =
                    await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({ ...publicationInput });
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "staging")), []);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(sidecarRoot, "claims")), []);
            }
            finally {
                releaseFirst();
                await firstPromise.catch(() => undefined);
                process.umask(priorUmask);
            }
            node_assert_1.default.deepStrictEqual([
                firstPublication.publication.status,
                retryPublication.publication.status,
            ].sort(), ["already_published", "published"]);
            const committed = firstPublication;
            node_assert_1.default.strictEqual(committed.publication.status, "published");
            node_assert_1.default.strictEqual(Number((await (0, promises_1.lstat)(node_path_1.default.join(sidecarRoot, "generations", `${FIRST_GENERATION}.entry.json`))).mode & 0o777), 0o600);
            node_assert_1.default.deepStrictEqual((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreEntry)(committed.publication.entry), committed.publication.entry);
            const store = await (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            node_assert_1.default.strictEqual(store.entries.length, 1);
            node_assert_1.default.strictEqual(store.entries[0].currentRefId, published.ref.refId);
            const exactRetry = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                ...publicationInput,
            });
            node_assert_1.default.strictEqual(exactRetry.publication.status, "already_published");
            const hookMutationRoot = node_path_1.default.join(parent, "post-link-hook-mutation-sidecars");
            await (0, promises_1.mkdir)(hookMutationRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, hookMutationRoot));
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                ...publicationInput,
                sidecarRoot: hookMutationRoot,
            }, {
                faultInjection: async (point) => {
                    if (point !== "after_generation_link")
                        return;
                    const stagingRoot = node_path_1.default.join(hookMutationRoot, "staging");
                    const [stageName] = await (0, promises_1.readdir)(stagingRoot);
                    node_assert_1.default.ok(stageName?.startsWith("stage_"));
                    const stagePath = node_path_1.default.join(stagingRoot, stageName);
                    const bytes = await (0, promises_1.readFile)(stagePath);
                    bytes[bytes.byteLength - 1] ^= 1;
                    await (0, promises_1.writeFile)(stagePath, bytes);
                },
            }), /not valid JSON|not exact canonical JSON|exact staged hardlink peer/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, hookMutationRoot)), /recovery is required|not valid JSON|not exact canonical JSON/);
            const semanticAttackRoot = node_path_1.default.join(parent, "coordinated-semantic-rehash-sidecars");
            await (0, promises_1.mkdir)(semanticAttackRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, semanticAttackRoot));
            const semanticAttackPublication = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                ...publicationInput,
                sidecarRoot: semanticAttackRoot,
            });
            if (semanticAttackPublication.publication.entry.entryKind
                !== "projection") {
                node_assert_1.default.fail("expected a projection store entry");
            }
            const coordinatedSemanticAttack = rehashGenerationOneSemanticAttack(semanticAttackPublication.publication.entry, (sidecar) => {
                const meeting = sidecar.events.find((event) => event.eventKind === "meeting");
                if (meeting === undefined || meeting.eventKind !== "meeting") {
                    node_assert_1.default.fail("expected a meeting event");
                }
                meeting.reviewState = meeting.reviewState === "resolved"
                    ? "needs_review"
                    : "resolved";
            });
            await (0, promises_1.writeFile)(node_path_1.default.join(semanticAttackRoot, "generations", `${FIRST_GENERATION}.entry.json`), (0, source_contracts_js_1.taskMapContractCanonicalJson)(coordinatedSemanticAttack), { encoding: "utf8", mode: 0o600 });
            const structurallyValidAttack = await (0, identity_dedupe_projection_js_1.unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest)(semanticAttackRoot);
            node_assert_1.default.strictEqual(structurallyValidAttack.entries.length, 1);
            node_assert_1.default.deepStrictEqual(structurallyValidAttack.entries[0], coordinatedSemanticAttack);
            for (const operation of [
                () => (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, semanticAttackRoot)),
                () => (0, identity_dedupe_projection_js_1.buildTaskMapIdentityDedupeProjection)({
                    ...publicationInput,
                    sidecarRoot: semanticAttackRoot,
                }),
                () => (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                    ...publicationInput,
                    sidecarRoot: semanticAttackRoot,
                }),
                () => (0, identity_dedupe_projection_js_1.backfillTaskMapIdentityDedupeProjectionGeneration)({
                    ...publicationInput,
                    sidecarRoot: semanticAttackRoot,
                    targetGeneration: FIRST_GENERATION,
                }),
            ]) {
                await node_assert_1.default.rejects(operation(), /not bound to its accepted P10\.1 ref|does not close to the immediate predecessor bundle/);
            }
            const tamperedEntry = clone(store.entries[0]);
            if (tamperedEntry.entryKind !== "projection") {
                node_assert_1.default.fail("expected a projection store entry");
            }
            tamperedEntry.diff.added.pop();
            rebindDiffId(tamperedEntry.diff);
            tamperedEntry.diffId = tamperedEntry.diff.diffId;
            tamperedEntry.diffDigest =
                (0, source_contracts_js_1.taskMapContractDigest)(tamperedEntry.diff);
            const { entryId: _entryId, ...tamperedEntryCore } = tamperedEntry;
            tamperedEntry.entryId =
                `tmidentityentry_${(0, source_contracts_js_1.taskMapContractDigest)(tamperedEntryCore)}`;
            node_assert_1.default.deepStrictEqual((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreEntry)(tamperedEntry), tamperedEntry);
            await (0, promises_1.writeFile)(node_path_1.default.join(sidecarRoot, "generations", `${FIRST_GENERATION}.entry.json`), (0, source_contracts_js_1.taskMapContractCanonicalJson)(tamperedEntry), "utf8");
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /diff is not derived from semantic history/);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preserves the exact stage and writer claim at every normal cleanup site when the pathname inode is replaced", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-exact-unlink-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            const input = validInput();
            const origin = originFixture(input.sourceSnapshot, input.projection, {
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, origin.prepared);
            await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: origin.prepared.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "91919191919191919191919191919191",
                },
            });
            const publicationInputFor = (sidecarRoot) => ({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            const replaceCurrentStage = async (sidecarRoot) => {
                const stagingRoot = node_path_1.default.join(sidecarRoot, "staging");
                const stageNames = await (0, promises_1.readdir)(stagingRoot);
                node_assert_1.default.strictEqual(stageNames.length, 1);
                const stageName = stageNames[0];
                node_assert_1.default.match(stageName, /^stage_[0-9a-f]{64}\.json$/);
                const stagePath = node_path_1.default.join(stagingRoot, stageName);
                const replacementPath = node_path_1.default.join(stagingRoot, "replacement.tmp");
                await (0, promises_1.writeFile)(replacementPath, await (0, promises_1.readFile)(stagePath), { mode: 0o600 });
                await (0, promises_1.chmod)(replacementPath, 0o600);
                await (0, promises_1.rename)(replacementPath, stagePath);
                const token = stageName.slice(6, -5);
                return {
                    stagePath,
                    claimPath: node_path_1.default.join(sidecarRoot, "claims", `writer_${token}.claim`),
                    replacementInode: (await (0, promises_1.lstat)(stagePath, { bigint: true })).ino,
                };
            };
            const assertExactResidue = async (residue) => {
                node_assert_1.default.strictEqual((await (0, promises_1.lstat)(residue.stagePath, { bigint: true })).ino, residue.replacementInode);
                node_assert_1.default.strictEqual((await (0, promises_1.lstat)(residue.claimPath)).isFile(), true);
            };
            const preJournalRoot = node_path_1.default.join(parent, "pre-journal-sidecars");
            await (0, promises_1.mkdir)(preJournalRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, preJournalRoot));
            let preJournalResidue;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(preJournalRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_stage_journal_bind")
                        return;
                    preJournalResidue = await replaceCurrentStage(preJournalRoot);
                    throw new Error("synthetic pre-journal cleanup failure");
                },
            }), /synthetic pre-journal cleanup failure/);
            node_assert_1.default.ok(preJournalResidue);
            await assertExactResidue(preJournalResidue);
            const capacityRoot = node_path_1.default.join(parent, "capacity-sidecars");
            await (0, promises_1.mkdir)(capacityRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, capacityRoot));
            let capacityResidue;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(capacityRoot), {
                faultInjection: async (point) => {
                    if (point !== "after_stage_sync")
                        return;
                    capacityResidue = await replaceCurrentStage(capacityRoot);
                    await (0, promises_1.writeFile)(node_path_1.default.join(capacityRoot, "generations", "unexpected.entry"), "", { mode: 0o600 });
                },
            }), /explicit recovery is required/);
            node_assert_1.default.ok(capacityResidue);
            await assertExactResidue(capacityResidue);
            const beforeCasRoot = node_path_1.default.join(parent, "before-cas-sidecars");
            await (0, promises_1.mkdir)(beforeCasRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, beforeCasRoot));
            let beforeCasResidue;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(beforeCasRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_generation_cas")
                        return;
                    beforeCasResidue = await replaceCurrentStage(beforeCasRoot);
                    throw new Error("synthetic pre-CAS failure");
                },
            }), /explicit recovery is required/);
            node_assert_1.default.ok(beforeCasResidue);
            await assertExactResidue(beforeCasResidue);
            const swapGenerationsDirectory = async (sidecarRoot, detachedName) => {
                const generationsRoot = node_path_1.default.join(sidecarRoot, "generations");
                const detachedRoot = node_path_1.default.join(parent, detachedName);
                await (0, promises_1.rename)(generationsRoot, detachedRoot);
                await (0, promises_1.mkdir)(generationsRoot, { mode: 0o700 });
                return { generationsRoot, detachedRoot };
            };
            const preLinkParentSwapRoot = node_path_1.default.join(parent, "pre-link-parent-swap-sidecars");
            await (0, promises_1.mkdir)(preLinkParentSwapRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, preLinkParentSwapRoot));
            let preLinkParentSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(preLinkParentSwapRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_generation_cas")
                        return;
                    preLinkParentSwap = await swapGenerationsDirectory(preLinkParentSwapRoot, "pre-link-parent-swap-detached-generations");
                },
            }), /generations directory was replaced after validation/);
            node_assert_1.default.ok(preLinkParentSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(preLinkParentSwap.generationsRoot), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(preLinkParentSwap.detachedRoot), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(preLinkParentSwapRoot, "staging")), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(preLinkParentSwapRoot, "claims")), []);
            const linkWindowParentSwapRoot = node_path_1.default.join(parent, "link-window-parent-swap-sidecars");
            await (0, promises_1.mkdir)(linkWindowParentSwapRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, linkWindowParentSwapRoot));
            let linkWindowParentSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(linkWindowParentSwapRoot), {
                faultInjection: async (point) => {
                    if (point !== "after_generation_parent_check")
                        return;
                    linkWindowParentSwap = await swapGenerationsDirectory(linkWindowParentSwapRoot, "link-window-parent-swap-detached-generations");
                },
            }), /generations directory was replaced after validation/);
            node_assert_1.default.ok(linkWindowParentSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(linkWindowParentSwap.generationsRoot), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(linkWindowParentSwap.detachedRoot), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(linkWindowParentSwapRoot, "staging")), []);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(linkWindowParentSwapRoot, "claims")), []);
            const existingRoot = node_path_1.default.join(parent, "existing-sidecars");
            await (0, promises_1.mkdir)(existingRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, existingRoot));
            let existingResidue;
            let plantedExistingGeneration = false;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(existingRoot), {
                faultInjection: async (point) => {
                    if (point === "before_generation_cas") {
                        const stagingRoot = node_path_1.default.join(existingRoot, "staging");
                        const [stageName] = await (0, promises_1.readdir)(stagingRoot);
                        node_assert_1.default.ok(stageName);
                        await (0, promises_1.writeFile)(node_path_1.default.join(existingRoot, "generations", `${FIRST_GENERATION}.entry.json`), await (0, promises_1.readFile)(node_path_1.default.join(stagingRoot, stageName)), { mode: 0o600 });
                        plantedExistingGeneration = true;
                    }
                    if (point === "before_existing_stage_cleanup") {
                        existingResidue = await replaceCurrentStage(existingRoot);
                    }
                },
            }), /explicit recovery is required/);
            node_assert_1.default.strictEqual(plantedExistingGeneration, true);
            node_assert_1.default.ok(existingResidue);
            await assertExactResidue(existingResidue);
            const finalRoot = node_path_1.default.join(parent, "final-sidecars");
            await (0, promises_1.mkdir)(finalRoot, { mode: 0o700 });
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, finalRoot));
            let finalResidue;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(finalRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_stage_cleanup")
                        return;
                    finalResidue = await replaceCurrentStage(finalRoot);
                },
            }), /explicit recovery is required/);
            node_assert_1.default.ok(finalResidue);
            await assertExactResidue(finalResidue);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(node_path_1.default.join(finalRoot, "generations", `${FIRST_GENERATION}.entry.json`))).isFile(), true);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects overlapping P10.1/P10.2 roots before contaminating reservations", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-root-isolation-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            const reservationsRoot = node_path_1.default.join(currentRoot, "reservations");
            const reservationsAlias = node_path_1.default.join(parent, "reservations-alias");
            await (0, promises_1.symlink)(reservationsRoot, reservationsAlias);
            for (const contaminatedSidecarRoot of [
                reservationsRoot,
                node_path_1.default.join(currentRoot, "..", "current", "reservations"),
                `${reservationsRoot}${node_path_1.default.sep}`,
                reservationsAlias,
            ]) {
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, contaminatedSidecarRoot)), /store roots must be realpath-disjoint/);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(reservationsRoot), []);
            }
            const nestedRunRoot = node_path_1.default.join(currentRoot, "nested-run");
            await (0, promises_1.mkdir)(nestedRunRoot, { mode: 0o700 });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, nestedRunRoot, sidecarRoot)), /currentRoot overlaps runRoot/);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(sidecarRoot), []);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, parent)), /store roots must be realpath-disjoint/);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(sidecarRoot), []);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("revalidates roots on an already-published no-op retry after a release-gated swap", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-root-swap-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            const input = validInput();
            const origin = originFixture(input.sourceSnapshot, input.projection, {
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, origin.prepared);
            await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: origin.prepared.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "85858585858585858585858585858585",
                },
            });
            const publicationInput = {
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            };
            const published = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput);
            node_assert_1.default.strictEqual(published.publication.status, "published");
            let releaseRetry;
            const retryGate = new Promise((resolve) => {
                releaseRetry = resolve;
            });
            let retryArrived;
            const retryArrival = new Promise((resolve) => {
                retryArrived = resolve;
            });
            const retry = (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInput, {
                faultInjection: async (point) => {
                    if (point !== "before_retry_revalidation")
                        return;
                    retryArrived();
                    await retryGate;
                },
            });
            await retryArrival;
            const detachedRoot = node_path_1.default.join(parent, "detached-sidecars");
            await (0, promises_1.rename)(sidecarRoot, detachedRoot);
            await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
            releaseRetry();
            await node_assert_1.default.rejects(retry, /sidecarRoot was replaced after store-root isolation/);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(sidecarRoot), []);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("preflights bounded recovery options and preserves unbound or unvalidated residue", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-recovery-preflight-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            const roots = identityStoreRoots(currentRoot, runRoot, sidecarRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(roots);
            const claimsRoot = node_path_1.default.join(sidecarRoot, "claims");
            let wideGetterInvoked = false;
            for (const kind of ["enumerable", "non_enumerable", "symbol"]) {
                const options = {};
                Object.defineProperty(options, "operationToken", {
                    enumerable: true,
                    get() {
                        wideGetterInvoked = true;
                        return "81".repeat(32);
                    },
                });
                for (let index = 0; index < 20_000; index += 1) {
                    const key = kind === "symbol"
                        ? Symbol(`unknown-${index}`)
                        : `unknown_${index}`;
                    Object.defineProperty(options, key, {
                        enumerable: kind === "enumerable",
                        value: index,
                    });
                }
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(roots, options), /unknown or executable fields/);
            }
            node_assert_1.default.strictEqual(wideGetterInvoked, false);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(claimsRoot), []);
            const unboundToken = "bc".repeat(32);
            const unboundStagePath = node_path_1.default.join(sidecarRoot, "staging", `stage_${unboundToken}.json`);
            await (0, promises_1.writeFile)(unboundStagePath, "", { mode: 0o600 });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(roots, {
                operationToken: "82".repeat(32),
            }), /no exact durable writer-journal binding/);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(unboundStagePath)).isFile(), true);
            await (0, promises_1.unlink)(unboundStagePath);
            const boundToken = "cd".repeat(32);
            const boundStagePath = node_path_1.default.join(sidecarRoot, "staging", `stage_${boundToken}.json`);
            const boundClaimPath = node_path_1.default.join(claimsRoot, `writer_${boundToken}.claim`);
            await (0, promises_1.writeFile)(boundStagePath, "", { mode: 0o600 });
            const boundStageStats = await (0, promises_1.lstat)(boundStagePath, { bigint: true });
            await (0, promises_1.writeFile)(boundClaimPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)({
                contractVersion: "taskmap-identity-dedupe-writer-journal.v1",
                writerToken: boundToken,
                stageFileName: `stage_${boundToken}.json`,
                stageDevice: boundStageStats.dev.toString(),
                stageInode: boundStageStats.ino.toString(),
            }), { encoding: "utf8", mode: 0o600 });
            const invalidGenerationPath = node_path_1.default.join(sidecarRoot, "generations", `${FIRST_GENERATION}.entry.json`);
            await (0, promises_1.writeFile)(invalidGenerationPath, "{}", { encoding: "utf8", mode: 0o600 });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(roots, {
                operationToken: "83".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            }), /sidecar store entry|invalid fields|unsupported kind/);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(boundStagePath)).isFile(), true);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(boundClaimPath)).isFile(), true);
            await (0, promises_1.unlink)(invalidGenerationPath);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(roots, {
                operationToken: "84".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            await node_assert_1.default.rejects((0, promises_1.lstat)(boundStagePath), /ENOENT/);
            await node_assert_1.default.rejects((0, promises_1.lstat)(boundClaimPath), /ENOENT/);
            const replacedRecoveryToken = "de".repeat(32);
            const replacedRecoveryStagePath = node_path_1.default.join(sidecarRoot, "staging", `stage_${replacedRecoveryToken}.json`);
            const replacedRecoveryClaimPath = node_path_1.default.join(claimsRoot, `writer_${replacedRecoveryToken}.claim`);
            await (0, promises_1.writeFile)(replacedRecoveryStagePath, Buffer.from([0x80]), { mode: 0o600 });
            const replacedRecoveryStageStats = await (0, promises_1.lstat)(replacedRecoveryStagePath, { bigint: true });
            await (0, promises_1.writeFile)(replacedRecoveryClaimPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)({
                contractVersion: "taskmap-identity-dedupe-writer-journal.v1",
                writerToken: replacedRecoveryToken,
                stageFileName: `stage_${replacedRecoveryToken}.json`,
                stageDevice: replacedRecoveryStageStats.dev.toString(),
                stageInode: replacedRecoveryStageStats.ino.toString(),
            }), { encoding: "utf8", mode: 0o600 });
            let replacementInode;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(roots, {
                operationToken: "85".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            }, {
                faultInjection: async (point) => {
                    if (point !== "before_recovery_stage_cleanup")
                        return;
                    const replacementPath = node_path_1.default.join(sidecarRoot, "staging", "recovery-replacement.tmp");
                    await (0, promises_1.writeFile)(replacementPath, Buffer.from([0x80]), { mode: 0o600 });
                    await (0, promises_1.rename)(replacementPath, replacedRecoveryStagePath);
                    replacementInode = (await (0, promises_1.lstat)(replacedRecoveryStagePath, { bigint: true })).ino;
                },
            }), /explicit recovery is required/);
            node_assert_1.default.ok(replacementInode !== undefined);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(replacedRecoveryStagePath, { bigint: true })).ino, replacementInode);
            node_assert_1.default.strictEqual((await (0, promises_1.lstat)(replacedRecoveryClaimPath)).isFile(), true);
            await (0, promises_1.unlink)(replacedRecoveryStagePath);
            await (0, promises_1.unlink)(replacedRecoveryClaimPath);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("guards every sidecar pathname mutation against deterministic root replacement", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-root-swap-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            const input = validInput();
            const origin = originFixture(input.sourceSnapshot, input.projection, {
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, origin.prepared);
            await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: origin.prepared.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "92929292929292929292929292929292",
                },
            });
            const publicationInputFor = (sidecarRoot) => ({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            const snapshotTree = async (root, includeFileContents = true) => {
                const result = [];
                const walk = async (directory, relativeDirectory) => {
                    const names = (await (0, promises_1.readdir)(directory)).sort();
                    for (const name of names) {
                        const entryPath = node_path_1.default.join(directory, name);
                        const relativePath = node_path_1.default.join(relativeDirectory, name);
                        const stats = await (0, promises_1.lstat)(entryPath, { bigint: true });
                        const entry = {
                            path: relativePath,
                            kind: stats.isDirectory() ? "directory" : "file",
                            device: stats.dev.toString(),
                            inode: stats.ino.toString(),
                            mode: (stats.mode & 511n).toString(8),
                            links: stats.nlink.toString(),
                        };
                        if (stats.isDirectory()) {
                            result.push(entry);
                            await walk(entryPath, relativePath);
                        }
                        else {
                            if (includeFileContents) {
                                const bytes = await (0, promises_1.readFile)(entryPath);
                                entry.size = stats.size.toString();
                                entry.digest = (0, node_crypto_1.createHash)("sha256")
                                    .update(bytes)
                                    .digest("hex");
                            }
                            result.push(entry);
                        }
                    }
                };
                await walk(root, ".");
                return result;
            };
            const createInitializedRoot = async (label) => {
                const sidecarRoot = node_path_1.default.join(parent, `${label}-sidecars`);
                await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
                await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
                return sidecarRoot;
            };
            const replaceWholeRoot = async (sidecarRoot, label, initializeReplacement = true) => {
                const detachedRoot = node_path_1.default.join(parent, `${label}-detached`);
                await (0, promises_1.rename)(sidecarRoot, detachedRoot);
                await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
                if (initializeReplacement) {
                    for (const name of ["claims", "generations", "staging"]) {
                        await (0, promises_1.mkdir)(node_path_1.default.join(sidecarRoot, name), { mode: 0o700 });
                    }
                }
                return {
                    detachedRoot,
                    replacementRoot: sidecarRoot,
                    exactAtSwap: await snapshotTree(detachedRoot),
                    namespaceAtSwap: await snapshotTree(detachedRoot, false),
                };
            };
            const replaceChildDirectory = async (sidecarRoot, childName, label) => {
                const replacementRoot = node_path_1.default.join(sidecarRoot, childName);
                const detachedRoot = node_path_1.default.join(parent, `${label}-detached-${childName}`);
                await (0, promises_1.rename)(replacementRoot, detachedRoot);
                await (0, promises_1.mkdir)(replacementRoot, { mode: 0o700 });
                return {
                    detachedRoot,
                    replacementRoot,
                    exactAtSwap: await snapshotTree(detachedRoot),
                    namespaceAtSwap: await snapshotTree(detachedRoot, false),
                };
            };
            const assertCleanInitializedReplacement = async (replacementRoot) => {
                node_assert_1.default.deepStrictEqual((await (0, promises_1.readdir)(replacementRoot)).sort(), ["claims", "generations", "staging"]);
                for (const name of ["claims", "generations", "staging"]) {
                    node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(replacementRoot, name)), []);
                }
            };
            const assertExactDetachedTree = async (swapped) => {
                node_assert_1.default.deepStrictEqual(await snapshotTree(swapped.detachedRoot), swapped.exactAtSwap);
            };
            const assertExactDetachedChild = async (swapped) => {
                node_assert_1.default.deepStrictEqual(await snapshotTree(swapped.detachedRoot), swapped.exactAtSwap);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(swapped.replacementRoot), []);
            };
            const initializationRoot = node_path_1.default.join(parent, "initialization-sidecars");
            await (0, promises_1.mkdir)(initializationRoot, { mode: 0o700 });
            let initializationCalls = 0;
            let initializationSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, initializationRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_initialize_directory_create")
                        return;
                    initializationCalls += 1;
                    initializationSwap = await replaceWholeRoot(initializationRoot, "initialization", false);
                },
            }));
            node_assert_1.default.strictEqual(initializationCalls, 1);
            node_assert_1.default.ok(initializationSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(initializationSwap.replacementRoot), []);
            await assertExactDetachedTree(initializationSwap);
            for (const blockedChild of ["staging", "claims"]) {
                const rollbackRoot = node_path_1.default.join(parent, `initialization-${blockedChild}-rollback-sidecars`);
                await (0, promises_1.mkdir)(rollbackRoot, { mode: 0o700 });
                await (0, promises_1.writeFile)(node_path_1.default.join(rollbackRoot, blockedChild), "synthetic occupied child", { mode: 0o600 });
                const beforeInitialization = await snapshotTree(rollbackRoot);
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, rollbackRoot)));
                node_assert_1.default.deepStrictEqual(await snapshotTree(rollbackRoot), beforeInitialization);
                node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(rollbackRoot), [blockedChild]);
            }
            const recoveryCreateRoot = await createInitializedRoot("recovery-create");
            let recoveryCreateSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, recoveryCreateRoot), { operationToken: "93".repeat(32) }, {
                faultInjection: async (point) => {
                    if (point !== "before_recovery_claim_create"
                        || recoveryCreateSwap !== undefined)
                        return;
                    recoveryCreateSwap = await replaceWholeRoot(recoveryCreateRoot, "recovery-create");
                },
            }));
            node_assert_1.default.ok(recoveryCreateSwap);
            await assertCleanInitializedReplacement(recoveryCreateSwap.replacementRoot);
            await assertExactDetachedTree(recoveryCreateSwap);
            const recoveryTakeoverRoot = await createInitializedRoot("recovery-takeover");
            const recoveryTakeoverClaim = node_path_1.default.join(recoveryTakeoverRoot, "claims", "recovery.claim");
            await (0, promises_1.writeFile)(recoveryTakeoverClaim, "", { mode: 0o600 });
            await (0, promises_1.chmod)(recoveryTakeoverClaim, 0o000);
            let recoveryTakeoverCalls = 0;
            let recoveryTakeoverSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, recoveryTakeoverRoot), {
                operationToken: "94".repeat(32),
                takeOverRecoveryClaim: true,
                externalExclusivityAsserted: true,
            }, {
                faultInjection: async (point) => {
                    if (point !== "before_recovery_claim_create")
                        return;
                    recoveryTakeoverCalls += 1;
                    if (recoveryTakeoverCalls !== 2)
                        return;
                    recoveryTakeoverSwap = await replaceWholeRoot(recoveryTakeoverRoot, "recovery-takeover");
                },
            }));
            node_assert_1.default.strictEqual(recoveryTakeoverCalls, 2);
            node_assert_1.default.ok(recoveryTakeoverSwap);
            await assertCleanInitializedReplacement(recoveryTakeoverSwap.replacementRoot);
            await assertExactDetachedTree(recoveryTakeoverSwap);
            const recoveryReleaseRoot = await createInitializedRoot("recovery-release");
            let recoveryReleaseSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, recoveryReleaseRoot), { operationToken: "95".repeat(32) }, {
                faultInjection: async (point) => {
                    if (point !== "before_recovery_stage_cleanup"
                        || recoveryReleaseSwap !== undefined)
                        return;
                    recoveryReleaseSwap = await replaceWholeRoot(recoveryReleaseRoot, "recovery-release");
                },
            }));
            node_assert_1.default.ok(recoveryReleaseSwap);
            await assertCleanInitializedReplacement(recoveryReleaseSwap.replacementRoot);
            await assertExactDetachedTree(recoveryReleaseSwap);
            for (const faultPoint of [
                "before_writer_admission_create",
                "before_writer_claim_create",
                "before_stage_create",
                "before_stage_journal_bind",
                "before_generation_cas",
                "after_generation_parent_check",
            ]) {
                const label = faultPoint.replaceAll("_", "-");
                const sidecarRoot = await createInitializedRoot(label);
                let swapped;
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(sidecarRoot), {
                    faultInjection: async (point) => {
                        if (point !== faultPoint || swapped !== undefined)
                            return;
                        swapped = await replaceWholeRoot(sidecarRoot, label);
                    },
                }));
                node_assert_1.default.ok(swapped, `${faultPoint} did not execute`);
                await assertCleanInitializedReplacement(swapped.replacementRoot);
                await assertExactDetachedTree(swapped);
            }
            for (const faultPoint of [
                "before_writer_admission_create",
                "before_writer_claim_create",
                "before_stage_journal_bind",
            ]) {
                const label = `${faultPoint.replaceAll("_", "-")}-claims-child`;
                const sidecarRoot = await createInitializedRoot(label);
                let swapped;
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(sidecarRoot), {
                    faultInjection: async (point) => {
                        if (point !== faultPoint || swapped !== undefined)
                            return;
                        swapped = await replaceChildDirectory(sidecarRoot, "claims", label);
                    },
                }));
                node_assert_1.default.ok(swapped, `${faultPoint} did not execute`);
                await assertExactDetachedChild(swapped);
            }
            const stageCreateChildRoot = await createInitializedRoot("before-stage-create-staging-child");
            let stageCreateChildSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(stageCreateChildRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_stage_create"
                        || stageCreateChildSwap !== undefined)
                        return;
                    stageCreateChildSwap = await replaceChildDirectory(stageCreateChildRoot, "staging", "before-stage-create-staging-child");
                },
            }));
            node_assert_1.default.ok(stageCreateChildSwap);
            await assertExactDetachedChild(stageCreateChildSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(stageCreateChildRoot, "claims")), []);
            const generationStagingSwapRoot = await createInitializedRoot("generation-staging-child");
            let generationStagingSwap;
            let sameNameFixtureAtSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(generationStagingSwapRoot), {
                faultInjection: async (point) => {
                    if (point !== "after_generation_parent_check"
                        || generationStagingSwap !== undefined)
                        return;
                    generationStagingSwap = await replaceChildDirectory(generationStagingSwapRoot, "staging", "generation-staging-child");
                    const [stageName] = await (0, promises_1.readdir)(generationStagingSwap.detachedRoot);
                    node_assert_1.default.ok(stageName);
                    await (0, promises_1.writeFile)(node_path_1.default.join(generationStagingSwap.replacementRoot, stageName), await (0, promises_1.readFile)(node_path_1.default.join(generationStagingSwap.detachedRoot, stageName)), { mode: 0o600 });
                    sameNameFixtureAtSwap = await snapshotTree(generationStagingSwap.replacementRoot);
                },
            }));
            node_assert_1.default.ok(generationStagingSwap);
            node_assert_1.default.ok(sameNameFixtureAtSwap);
            node_assert_1.default.deepStrictEqual(await snapshotTree(generationStagingSwap.replacementRoot), sameNameFixtureAtSwap);
            node_assert_1.default.deepStrictEqual(await snapshotTree(generationStagingSwap.detachedRoot), generationStagingSwap.exactAtSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(node_path_1.default.join(generationStagingSwapRoot, "generations")), []);
            const partialWriteChildRoot = await createInitializedRoot("partial-write-staging-child");
            let partialWriteChildSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(partialWriteChildRoot), {
                faultInjection: async (point) => {
                    if (point !== "after_stage_partial_write"
                        || partialWriteChildSwap !== undefined)
                        return;
                    partialWriteChildSwap = await replaceChildDirectory(partialWriteChildRoot, "staging", "partial-write-staging-child");
                },
            }));
            node_assert_1.default.ok(partialWriteChildSwap);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(partialWriteChildSwap.replacementRoot), []);
            // The namespace and inode are frozen at the swap. Only the stage file
            // already open by descriptor may receive its remaining bytes.
            node_assert_1.default.deepStrictEqual(await snapshotTree(partialWriteChildSwap.detachedRoot, false), partialWriteChildSwap.namespaceAtSwap);
            node_assert_1.default.notDeepStrictEqual(await snapshotTree(partialWriteChildSwap.detachedRoot), partialWriteChildSwap.exactAtSwap);
            const preservedStagingReplacement = node_path_1.default.join(parent, "partial-write-staging-child-replacement-preserved");
            await (0, promises_1.rename)(partialWriteChildSwap.replacementRoot, preservedStagingReplacement);
            await (0, promises_1.rename)(partialWriteChildSwap.detachedRoot, partialWriteChildSwap.replacementRoot);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(preservedStagingReplacement), []);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, partialWriteChildRoot), {
                operationToken: "98".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            const partialWriteRetry = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(partialWriteChildRoot));
            node_assert_1.default.strictEqual(partialWriteRetry.publication.status, "published");
            const generationCleanupChildRoot = await createInitializedRoot("generation-cleanup-child");
            let generationCleanupChildSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(generationCleanupChildRoot), {
                faultInjection: async (point) => {
                    if (point !== "before_stage_cleanup"
                        || generationCleanupChildSwap !== undefined)
                        return;
                    generationCleanupChildSwap = await replaceChildDirectory(generationCleanupChildRoot, "generations", "generation-cleanup-child");
                },
            }));
            node_assert_1.default.ok(generationCleanupChildSwap);
            await assertExactDetachedChild(generationCleanupChildSwap);
            const preservedGenerationReplacement = node_path_1.default.join(parent, "generation-cleanup-child-replacement-preserved");
            await (0, promises_1.rename)(generationCleanupChildSwap.replacementRoot, preservedGenerationReplacement);
            await (0, promises_1.rename)(generationCleanupChildSwap.detachedRoot, generationCleanupChildSwap.replacementRoot);
            node_assert_1.default.deepStrictEqual(await (0, promises_1.readdir)(preservedGenerationReplacement), []);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, generationCleanupChildRoot), {
                operationToken: "99".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            const generationCleanupRetry = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(generationCleanupChildRoot));
            node_assert_1.default.strictEqual(generationCleanupRetry.publication.status, "already_published");
            for (const faultPoint of [
                "after_generation_link",
                "before_stage_cleanup",
            ]) {
                const label = `${faultPoint.replaceAll("_", "-")}-convergence`;
                const sidecarRoot = await createInitializedRoot(label);
                let swapped;
                await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(sidecarRoot), {
                    faultInjection: async (point) => {
                        if (point !== faultPoint || swapped !== undefined)
                            return;
                        swapped = await replaceWholeRoot(sidecarRoot, label);
                    },
                }));
                node_assert_1.default.ok(swapped, `${faultPoint} did not execute`);
                await assertCleanInitializedReplacement(swapped.replacementRoot);
                await assertExactDetachedTree(swapped);
                const preservedReplacement = node_path_1.default.join(parent, `${label}-replacement-preserved`);
                const replacementAtRestore = await snapshotTree(swapped.replacementRoot);
                await (0, promises_1.rename)(swapped.replacementRoot, preservedReplacement);
                await (0, promises_1.rename)(swapped.detachedRoot, swapped.replacementRoot);
                node_assert_1.default.deepStrictEqual(await snapshotTree(preservedReplacement), replacementAtRestore);
                await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                    operationToken: (faultPoint === "after_generation_link" ? "96" : "97").repeat(32),
                    abandonWriterClaims: true,
                    externalExclusivityAsserted: true,
                });
                const retry = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(sidecarRoot));
                node_assert_1.default.strictEqual(retry.publication.status, "already_published");
            }
            const openStageWriteRoot = await createInitializedRoot("open-stage-write");
            let openStageWriteSwap;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(publicationInputFor(openStageWriteRoot), {
                faultInjection: async (point) => {
                    if (point !== "after_stage_create"
                        || openStageWriteSwap !== undefined)
                        return;
                    openStageWriteSwap = await replaceWholeRoot(openStageWriteRoot, "open-stage-write");
                },
            }));
            node_assert_1.default.ok(openStageWriteSwap);
            await assertCleanInitializedReplacement(openStageWriteSwap.replacementRoot);
            // This is the one intentional post-swap mutation: the stage inode was
            // opened before the root moved, so writes remain descriptor-anchored.
            // No pathname or inode is added to either tree after the swap.
            node_assert_1.default.deepStrictEqual(await snapshotTree(openStageWriteSwap.detachedRoot, false), openStageWriteSwap.namespaceAtSwap);
            const detachedStageNames = await (0, promises_1.readdir)(node_path_1.default.join(openStageWriteSwap.detachedRoot, "staging"));
            node_assert_1.default.strictEqual(detachedStageNames.length, 1);
            node_assert_1.default.ok((await (0, promises_1.readFile)(node_path_1.default.join(openStageWriteSwap.detachedRoot, "staging", detachedStageNames[0]))).byteLength > 0);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("represents a blocked no-accepted prefix before the first reviewed semantic projection", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-no-accepted-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            const input = validInput();
            const blocked = blockedGenesisOriginFixture(input.sourceSnapshot);
            const complete = originFixture(input.sourceSnapshot, input.projection, {
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, blocked);
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, complete.prepared);
            const g1 = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: blocked.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "71717171717171717171717171717171",
                },
            });
            node_assert_1.default.strictEqual(g1.ref.operation, "blocked");
            node_assert_1.default.strictEqual(g1.ref.accepted, undefined);
            const g2 = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: complete.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: g1.ref.refId,
                options: {
                    operationToken: "72727272727272727272727272727272",
                },
            });
            node_assert_1.default.strictEqual(g2.ref.operation, "complete");
            node_assert_1.default.strictEqual(g2.ref.accepted?.originGeneration, SECOND_GENERATION);
            const tombstone = await (0, identity_dedupe_projection_js_1.backfillTaskMapIdentityDedupeNoAcceptedGeneration)({
                currentRoot,
                runRoot,
                sidecarRoot,
                targetGeneration: FIRST_GENERATION,
            });
            node_assert_1.default.strictEqual(tombstone.entry.entryKind, "no_accepted_origin");
            node_assert_1.default.strictEqual(tombstone.entry.semanticHead, null);
            const projected = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: input.sourceSnapshot,
                projection: input.projection,
                aliases: input.aliases,
                workBindings: input.workBindings,
                sessionLineage: input.sessionLineage,
                lifecycleAdjudications: input.lifecycleAdjudications,
            });
            node_assert_1.default.strictEqual(projected.publication.entry.entryKind, "projection");
            const store = await (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            node_assert_1.default.strictEqual(store.entries.length, 2);
            node_assert_1.default.strictEqual(store.entries[1].predecessor.entryId, store.entries[0].entryId);
            if (store.entries[1].entryKind !== "projection") {
                node_assert_1.default.fail("expected first reviewed semantic projection");
            }
            node_assert_1.default.strictEqual(store.entries[1].diff.previousSidecarDigest, (0, source_contracts_js_1.taskMapContractDigest)(null));
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("records rollback as review-required without changing A+B semantics and resumes from the semantic head", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-rollback-store-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            const g1Input = validInput();
            const g1Origin = originFixture(g1Input.sourceSnapshot, g1Input.projection, {
                aliases: g1Input.aliases,
                workBindings: g1Input.workBindings,
                sessionLineage: g1Input.sessionLineage,
                lifecycleAdjudications: g1Input.lifecycleAdjudications,
            });
            const g2Source = sourceFixture({ includeSecondWork: true });
            const g2Projection = projectionFixture(true);
            const g2Input = validInput({
                source: g2Source,
                projection: g2Projection,
                lifecycle: twoWorkLifecycleFor(g2Source, g1Input.source.workCanonical, false),
            });
            const g2Origin = originFixture(g2Input.sourceSnapshot, g2Input.projection, {
                aliases: g2Input.aliases,
                workBindings: g2Input.workBindings,
                sessionLineage: g2Input.sessionLineage,
                lifecycleAdjudications: g2Input.lifecycleAdjudications,
            }, undefined, {
                origin: g1Origin.origin,
                currentSnapshot: g1Origin.currentSnapshot,
                sourceSnapshot: g1Input.sourceSnapshot,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, g1Origin.prepared);
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, g2Origin.prepared);
            const g1 = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g1Origin.prepared.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "81818181818181818181818181818181",
                },
            });
            const g1Published = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g1Input.sourceSnapshot,
                projection: g1Input.projection,
                aliases: g1Input.aliases,
                workBindings: g1Input.workBindings,
                sessionLineage: g1Input.sessionLineage,
                lifecycleAdjudications: g1Input.lifecycleAdjudications,
            });
            const g2 = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g2Origin.prepared.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: g1.ref.refId,
                options: {
                    operationToken: "82828282828282828282828282828282",
                },
            });
            const g2Published = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g2Input.sourceSnapshot,
                projection: g2Input.projection,
                aliases: g2Input.aliases,
                workBindings: g2Input.workBindings,
                sessionLineage: g2Input.sessionLineage,
                lifecycleAdjudications: g2Input.lifecycleAdjudications,
            });
            node_assert_1.default.strictEqual(g2Published.sidecar.works.length, 2);
            const g3 = await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: SECOND_GENERATION,
                expectedRefId: g2.ref.refId,
                options: {
                    operationToken: "83838383838383838383838383838383",
                },
            });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g1Input.sourceSnapshot,
                projection: g1Input.projection,
                aliases: g1Input.aliases,
                workBindings: g1Input.workBindings,
                sessionLineage: g1Input.sessionLineage,
                lifecycleAdjudications: g1Input.lifecycleAdjudications,
            }), /publish a rollback observation instead/);
            const rollbackObservation = await (0, identity_dedupe_projection_js_1.publishTaskMapIdentityDedupeRollbackObservation)({
                currentRoot,
                runRoot,
                sidecarRoot,
                targetGeneration: g3.ref.generation,
            });
            node_assert_1.default.strictEqual(rollbackObservation.entry.entryKind, "rollback_observed");
            if (rollbackObservation.entry.entryKind !== "rollback_observed") {
                node_assert_1.default.fail("expected rollback observation");
            }
            node_assert_1.default.strictEqual(rollbackObservation.entry.publicationState, "review_required");
            node_assert_1.default.strictEqual(rollbackObservation.entry.semanticHead.sidecarDigest, g2Published.publication.entry.semanticHead.sidecarDigest);
            node_assert_1.default.notStrictEqual(rollbackObservation.entry.semanticHead.sidecarDigest, g1Published.publication.entry.semanticHead.sidecarDigest);
            node_assert_1.default.strictEqual(rollbackObservation.entry.accepted.bundleId, g1Origin.origin.bundleId);
            node_assert_1.default.strictEqual(rollbackObservation.entry.rollback.targetRefId, g1.ref.refId);
            const rollbackSnapshot = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
            const g4Input = validInput({
                source: g2Source,
                projection: g2Projection,
                lifecycle: twoWorkLifecycleFor(g2Source, g2Source.workCanonical, true),
            });
            const g4Origin = originFixture(g4Input.sourceSnapshot, g4Input.projection, {
                aliases: g4Input.aliases,
                workBindings: g4Input.workBindings,
                sessionLineage: g4Input.sessionLineage,
                lifecycleAdjudications: g4Input.lifecycleAdjudications,
            }, undefined, {
                origin: g1Origin.origin,
                providerOrigin: g2Origin.origin,
                baselineSnapshot: g1Origin.currentSnapshot,
                currentSnapshot: rollbackSnapshot,
                sourceSnapshot: g1Input.sourceSnapshot,
            });
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, g4Origin.prepared);
            const g4 = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g4Origin.prepared.bundleId,
                expectedGeneration: g3.ref.generation,
                expectedRefId: g3.ref.refId,
                options: {
                    operationToken: "84848484848484848484848484848484",
                },
            });
            const g4Published = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g4Input.sourceSnapshot,
                projection: g4Input.projection,
                aliases: g4Input.aliases,
                workBindings: g4Input.workBindings,
                sessionLineage: g4Input.sessionLineage,
                lifecycleAdjudications: g4Input.lifecycleAdjudications,
            });
            node_assert_1.default.strictEqual(g4Published.sidecar.origin.currentRefId, g4.ref.refId);
            node_assert_1.default.strictEqual(g4Published.sidecar.works.length, 2);
            node_assert_1.default.strictEqual(g4Published.publication.entry.predecessor.entryId, rollbackObservation.entry.entryId);
            if (g4Published.publication.entry.entryKind !== "projection") {
                node_assert_1.default.fail("expected resumed reviewed projection");
            }
            node_assert_1.default.strictEqual(g4Published.publication.entry.diff.previousSidecarDigest, g2Published.publication.entry.semanticHead.sidecarDigest);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a concurrently advanced P10.1 head and recovers through exact sequential backfill", async () => {
        const canonicalTmp = await (0, promises_1.realpath)((0, node_os_1.tmpdir)());
        const parent = await (0, promises_1.mkdtemp)(node_path_1.default.join(canonicalTmp, "taskmap-identity-race-test-"));
        const runRoot = node_path_1.default.join(parent, "runs");
        const currentRoot = node_path_1.default.join(parent, "current");
        const sidecarRoot = node_path_1.default.join(parent, "sidecars");
        await (0, promises_1.chmod)(parent, 0o700);
        await (0, promises_1.mkdir)(runRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(currentRoot, { mode: 0o700 });
        await (0, promises_1.mkdir)(sidecarRoot, { mode: 0o700 });
        try {
            await (0, refresh_current_ref_js_1.initializeTaskMapRefreshCurrentStore)(currentRoot);
            await (0, identity_dedupe_projection_js_1.initializeTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            const g1Input = validInput({ revision: "v1" });
            const g2Input = validInput({ revision: "v2" });
            g2Input.lifecycleAdjudications = lifecycleFor(g2Input.source, {
                previousState: "open",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                currentSourceIdentityDigest: g2Input.source.workCanonical.sourceIdentityDigest,
                adjudicatedDelta: "updated",
            });
            const g2Origin = originFixture(g2Input.sourceSnapshot, g2Input.projection, {
                aliases: g2Input.aliases,
                workBindings: g2Input.workBindings,
                sessionLineage: g2Input.sessionLineage,
                lifecycleAdjudications: g2Input.lifecycleAdjudications,
            }, undefined, {
                origin: g1Input.acceptedOrigin,
                currentSnapshot: g1Input.currentSnapshot,
                sourceSnapshot: g1Input.sourceSnapshot,
            });
            g2Input.acceptedOrigin = g2Origin.origin;
            g2Input.currentSnapshot = g2Origin.currentSnapshot;
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, originFixture(g1Input.sourceSnapshot, g1Input.projection, {
                aliases: g1Input.aliases,
                workBindings: g1Input.workBindings,
                sessionLineage: g1Input.sessionLineage,
                lifecycleAdjudications: g1Input.lifecycleAdjudications,
            }).prepared);
            await (0, refresh_run_bundle_js_1.materializeTaskMapRefreshRunBundle)(runRoot, g2Origin.prepared);
            const g1Current = await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                currentRoot,
                runRoot,
                bundleId: g1Input.acceptedOrigin.bundleId,
                expectedGeneration: "00000000000000000000",
                options: {
                    operationToken: "20202020202020202020202020202020",
                },
            });
            const g1PublicationInput = {
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g1Input.sourceSnapshot,
                projection: g1Input.projection,
                aliases: g1Input.aliases,
                workBindings: g1Input.workBindings,
                sessionLineage: g1Input.sessionLineage,
                lifecycleAdjudications: g1Input.lifecycleAdjudications,
            };
            let advanced = false;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(g1PublicationInput, {
                faultInjection: async (point) => {
                    if (point !== "after_stage_sync" || advanced)
                        return;
                    advanced = true;
                    await (0, refresh_current_ref_js_1.publishTaskMapRefreshRunCurrent)({
                        currentRoot,
                        runRoot,
                        bundleId: g2Origin.origin.bundleId,
                        expectedGeneration: FIRST_GENERATION,
                        expectedRefId: g1Current.ref.refId,
                        options: {
                            operationToken: "30303030303030303030303030303030",
                        },
                    });
                },
            }), /current head advanced before sidecar generation CAS/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "44".repeat(32),
            });
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildTaskMapIdentityDedupeProjection)({
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g2Input.sourceSnapshot,
                projection: g2Input.projection,
                aliases: g2Input.aliases,
                workBindings: g2Input.workBindings,
                sessionLineage: g2Input.sessionLineage,
                lifecycleAdjudications: g2Input.lifecycleAdjudications,
            }), /reviewed sequential backfill/);
            const backfilled = await (0, identity_dedupe_projection_js_1.backfillTaskMapIdentityDedupeProjectionGeneration)({
                ...g1PublicationInput,
                targetGeneration: FIRST_GENERATION,
            });
            node_assert_1.default.strictEqual(backfilled.publication.status, "published");
            const g2PublicationInput = {
                currentRoot,
                runRoot,
                sidecarRoot,
                sourceSnapshot: g2Input.sourceSnapshot,
                projection: g2Input.projection,
                aliases: g2Input.aliases,
                workBindings: g2Input.workBindings,
                sessionLineage: g2Input.sessionLineage,
                lifecycleAdjudications: g2Input.lifecycleAdjudications,
            };
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(g2PublicationInput, {
                faultInjection: async (point) => {
                    if (point === "after_generation_link") {
                        await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(g2PublicationInput), /recovery is required/);
                        await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), { operationToken: "55".repeat(32) }), /refuses active writer claims/);
                        throw new Error("synthetic post-CAS interruption");
                    }
                },
            }), /synthetic post-CAS interruption/);
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot)), /recovery is required/);
            await (0, identity_dedupe_projection_js_1.recoverTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
                operationToken: "66".repeat(32),
                abandonWriterClaims: true,
                externalExclusivityAsserted: true,
            });
            const g2Published = await (0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(g2PublicationInput);
            node_assert_1.default.strictEqual(g2Published.publication.status, "already_published");
            const store = await (0, identity_dedupe_projection_js_1.readTaskMapIdentityDedupeProjectionStore)(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
            node_assert_1.default.strictEqual(store.entries.length, 2);
            node_assert_1.default.strictEqual(store.entries[1].predecessor.entryId, store.entries[0].entryId);
            if (store.entries[0].entryKind !== "projection"
                || store.entries[1].entryKind !== "projection") {
                node_assert_1.default.fail("expected projection entries");
            }
            node_assert_1.default.strictEqual(store.entries[1].diff.previousSidecarDigest, store.entries[0].sidecarDigest);
            let retryAdvanced = false;
            await node_assert_1.default.rejects((0, identity_dedupe_projection_js_1.buildAndPublishTaskMapIdentityDedupeProjection)(g2PublicationInput, {
                faultInjection: async (point) => {
                    if (point !== "before_retry_revalidation"
                        || retryAdvanced) {
                        return;
                    }
                    retryAdvanced = true;
                    const current = await (0, refresh_current_ref_js_1.readTaskMapRefreshCurrent)(currentRoot, runRoot);
                    await (0, refresh_current_ref_js_1.rollbackTaskMapRefreshCurrent)({
                        currentRoot,
                        runRoot,
                        targetGeneration: FIRST_GENERATION,
                        expectedGeneration: SECOND_GENERATION,
                        expectedRefId: current.head.refId,
                        options: {
                            operationToken: "67676767676767676767676767676767",
                        },
                    });
                },
            }), /current head advanced during sidecar retry/);
            node_assert_1.default.strictEqual(retryAdvanced, true);
        }
        finally {
            await (0, promises_1.rm)(parent, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("derives and binds every alias, binding, lineage, and lifecycle decision into the accepted replay", () => {
        const baseline = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        const changedProof = validInput();
        changedProof.aliases = changedProof.aliases.filter((alias) => alias.identityKind !== "session");
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(changedProof)), /projection replay closure/);
        rebindAcceptedOrigin(changedProof);
        const acceptedChange = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(changedProof));
        node_assert_1.default.notStrictEqual(baseline.sidecar.suppliedIdentityProofDigest, acceptedChange.sidecar.suppliedIdentityProofDigest);
        node_assert_1.default.notStrictEqual(baseline.sidecar.origin.replayClosureDigest, acceptedChange.sidecar.origin.replayClosureDigest);
    });
    (0, node_test_1.it)("correlates alias, work-binding, session, and lifecycle evidence to closed source/projection facts", () => {
        const cases = [
            (input) => {
                input.aliases = input.aliases.filter((alias) => alias.identityKind !== "session");
            },
            (input) => {
                input.workBindings[0].sourceEnvelopeId =
                    input.source.workAlias.envelopeId;
            },
            (input) => {
                const subagent = input.sessionLineage.find((lineage) => lineage.role === "subagent");
                subagent.parentSessionEnvelopeId =
                    input.source.codexRoot.envelopeId;
            },
            (input) => {
                input.lifecycleAdjudications[0].currentSourceIdentityDigest =
                    input.source.workAlias.sourceIdentityDigest;
            },
        ];
        for (const mutate of cases) {
            const input = validInput();
            mutate(input);
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(input)), /projection replay closure/);
        }
    });
    (0, node_test_1.it)("fails closed for empty, degraded, and healthy snapshots without an accepted origin", () => {
        const base = validInput();
        const empty = withoutSource(base);
        empty.currentSnapshot = {
            status: "empty",
            generations: [],
            unknownGenerationNames: [],
            unknownObjectNames: [],
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(empty));
        const degraded = withoutSource(validInput());
        degraded.currentSnapshot = {
            ...degraded.currentSnapshot,
            status: "degraded",
            fault: {
                generation: FIRST_GENERATION,
                code: "generation_corrupt",
                detail: "synthetic corruption",
            },
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(degraded));
        const noAccepted = withoutSource(validInput());
        noAccepted.currentSnapshot = rebuildCurrentRef(noAccepted.currentSnapshot, (core) => {
            delete core.accepted;
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(noAccepted), /no active accepted origin/);
    });
    (0, node_test_1.it)("rejects owner, snapshot proof, accepted-state, and replay-digest mismatch", () => {
        const owner = withoutSource(validInput());
        owner.sourceSnapshot = {
            ...owner.sourceSnapshot,
            ownerScopeDigest: digest("wrong-owner"),
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(owner));
        const proof = withoutSource(validInput());
        proof.acceptedOrigin.sourceSnapshotProof = {
            ...proof.acceptedOrigin.sourceSnapshotProof,
            snapshotId: "tmsnapshot_tampered",
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(proof), /source snapshot does not match/);
        const accepted = withoutSource(validInput());
        accepted.acceptedOrigin.manifest = {
            ...accepted.acceptedOrigin.manifest,
            candidateAcceptedStateDigest: digest("wrong-accepted-state"),
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(accepted), /accepted-state closure/);
        const immutable = withoutSource(validInput());
        immutable.acceptedOrigin.manifest = clone(immutable.acceptedOrigin.manifest);
        immutable.acceptedOrigin.manifest.members[0].byteSha256 =
            digest("tampered-member-bytes");
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(immutable), /immutable bundle closure/);
        const replay = withoutSource(validInput({
            replayDigestOverride: digest("unbound-replay"),
        }));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(replay), /projection replay closure/);
    });
    (0, node_test_1.it)("rejects a recomputed contiguous current history that crosses owner scope", () => {
        const input = withoutSource(validInput());
        const first = input.currentSnapshot.head;
        const { refId: _firstId, ...foreignCore } = clone(first);
        foreignCore.ownerScopeDigest = digest("foreign-owner");
        const foreign = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
            ...foreignCore,
            refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(foreignCore)}`,
        });
        const { refId: _headId, ...headCore } = clone(first);
        headCore.generation = SECOND_GENERATION;
        headCore.predecessorRefId = foreign.refId;
        if (headCore.attempt !== undefined) {
            headCore.attempt.generation = SECOND_GENERATION;
        }
        const head = (0, refresh_current_ref_js_1.assertTaskMapRefreshCurrentRef)({
            ...headCore,
            refId: `tmrefreshcurrent_${(0, source_contracts_js_1.taskMapContractDigest)(headCore)}`,
        });
        input.currentSnapshot = {
            status: "healthy",
            head,
            generations: [foreign, head],
            unknownGenerationNames: [],
            unknownObjectNames: [],
        };
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(input), /cross owner scope/);
    });
    (0, node_test_1.it)("canonicalizes Calendar + Gemini + Granola independently of adapter order", () => {
        const forward = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        const reversed = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({ reverseEnvelopes: true })));
        const forwardMeeting = forward.sidecar.events.filter((event) => event.eventKind === "meeting");
        const reverseMeeting = reversed.sidecar.events.filter((event) => event.eventKind === "meeting");
        node_assert_1.default.deepStrictEqual(reverseMeeting, forwardMeeting);
        node_assert_1.default.strictEqual(forwardMeeting.length, 1);
        node_assert_1.default.strictEqual(forwardMeeting[0].variantEnvelopeIds.length, 3);
    });
    (0, node_test_1.it)("uses bounded fallback identity and keeps ambiguous participant sets separate", () => {
        const fallback = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({ includeCalendar: false })));
        const meetings = fallback.sidecar.events.filter((event) => event.eventKind === "meeting");
        node_assert_1.default.strictEqual(meetings.length, 1);
        node_assert_1.default.strictEqual(meetings[0].identityMethod, "bounded_fingerprint");
        const ambiguous = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({
            includeCalendar: false,
            ambiguousFallback: true,
        })));
        node_assert_1.default.strictEqual(ambiguous.sidecar.events.filter((event) => event.eventKind === "meeting").length, 2);
    });
    (0, node_test_1.it)("keeps Gmail discovery identifiers neutral to work, meeting, session, and lifecycle identities", () => {
        const first = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({ discoveryMessageId: "synthetic-message-a" })));
        const second = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({ discoveryMessageId: "synthetic-message-b" })));
        node_assert_1.default.notStrictEqual(first.sidecar.sourceSnapshotDigest, second.sidecar.sourceSnapshotDigest);
        node_assert_1.default.deepStrictEqual(first.sidecar.works, second.sidecar.works);
        node_assert_1.default.deepStrictEqual(first.sidecar.events, second.sidecar.events);
        node_assert_1.default.deepStrictEqual(first.sidecar.lifecycleDeltas, second.sidecar.lifecycleDeltas);
        node_assert_1.default.ok(!first.sidecarCanonicalBytes.includes("synthetic-message-a"));
        node_assert_1.default.ok(!second.sidecarCanonicalBytes.includes("synthetic-message-b"));
    });
    (0, node_test_1.it)("rejects Gmail and Strategy context-only envelopes as canonical work", () => {
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput({ source: contextOnlyWorkSourceFixture() }))), /incompatible semantic object types|work source envelope/);
    });
    (0, node_test_1.it)("merges only explicit work/session aliases and explicit delegation lineage", () => {
        const input = validInput();
        const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(input));
        const sessions = built.sidecar.events.filter((event) => event.eventKind === "session");
        node_assert_1.default.strictEqual(built.sidecar.works.length, 1);
        node_assert_1.default.strictEqual(built.sidecar.works[0].variantSourceObjectKeyDigests.length, 2);
        node_assert_1.default.strictEqual(sessions.length, 1);
        node_assert_1.default.strictEqual(sessions[0].variantEnvelopeIds.length, 3);
        node_assert_1.default.strictEqual(built.sidecar.rejectedVariants.length, 1);
        node_assert_1.default.strictEqual(built.sidecar.rejectedVariants[0].reasonCode, "wrapper_transport_not_semantic_session");
        node_assert_1.default.strictEqual(sessions[0].variantSourceObjectKeyDigests.length, 3);
        node_assert_1.default.strictEqual(built.sidecar.rejectedVariants[0].sourceObjectKeyDigest, input.source.wrapper.sourceObjectKeyDigest);
    });
    (0, node_test_1.it)("keeps wrapper rejection stable across revision and attestation replay", () => {
        const g1Input = validInput({ revision: "v1" });
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        const exactReplay = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        node_assert_1.default.strictEqual(exactReplay.sidecarCanonicalBytes, g1.sidecarCanonicalBytes);
        node_assert_1.default.deepStrictEqual(exactReplay.sidecar.rejectedVariants, g1.sidecar.rejectedVariants);
        const g2Input = validInput({
            revision: "v2",
            lifecycle: lifecycleFor(sourceFixture({ revision: "v2" })),
        });
        g2Input.lifecycleAdjudications = lifecycleFor(g2Input.source, {
            previousState: "open",
            previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
            currentState: "open",
            currentSourceIdentityDigest: g2Input.source.workCanonical.sourceIdentityDigest,
            adjudicatedDelta: "updated",
        });
        continueWithVerifiedAcceptedOrigin(g2Input, g1Input, g1.sidecar);
        const g2 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g2Input));
        const g1Rejection = g1.sidecar.rejectedVariants[0];
        const g2Rejection = g2.sidecar.rejectedVariants[0];
        node_assert_1.default.strictEqual(g2Rejection.rejectionId, g1Rejection.rejectionId);
        node_assert_1.default.strictEqual(g2Rejection.sourceObjectKeyDigest, g1Rejection.sourceObjectKeyDigest);
        node_assert_1.default.notStrictEqual(g2Rejection.envelopeId, g1Rejection.envelopeId);
        node_assert_1.default.notStrictEqual(g2Rejection.proofDigest, g1Rejection.proofDigest);
        const g3Input = validInput({
            source: g2Input.source,
            projection: g2Input.projection,
            lifecycle: lifecycleFor(g2Input.source, {
                previousState: "open",
                previousSourceIdentityDigest: g2Input.source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                currentSourceIdentityDigest: g2Input.source.workCanonical.sourceIdentityDigest,
                adjudicatedDelta: "no_op",
            }),
        });
        continueWithVerifiedAcceptedOrigin(g3Input, g2Input, g2.sidecar, digest("rotated-review-attestation"));
        const g3 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g3Input));
        const g3Rejection = g3.sidecar.rejectedVariants[0];
        node_assert_1.default.strictEqual(g3Rejection.rejectionId, g2Rejection.rejectionId);
        node_assert_1.default.notStrictEqual(g3Rejection.proofDigest, g2Rejection.proofDigest);
        node_assert_1.default.ok(g3.diff.changed.some((entry) => (entry.kind === "rejected_variant"
            && entry.id === g2Rejection.rejectionId)));
        node_assert_1.default.ok(![...g3.diff.added, ...g3.diff.removed].some((entry) => (entry.kind === "rejected_variant"
            && entry.id === g2Rejection.rejectionId)));
    });
    (0, node_test_1.it)("rejects wrapper promotion to root/subagent across same and revised envelopes, and accepted-to-wrapper reversal", () => {
        const g1Input = validInput({ revision: "v1" });
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        for (const revision of ["v1", "v2"]) {
            for (const promotedRole of ["root", "subagent"]) {
                const source = sourceFixture({ revision });
                const lifecycle = lifecycleFor(source, revision === "v1"
                    ? {
                        previousState: "open",
                        previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                        currentState: "open",
                        adjudicatedDelta: "no_op",
                    }
                    : {
                        previousState: "open",
                        previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                        currentState: "open",
                        currentSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                        adjudicatedDelta: "updated",
                    });
                const sessionLineage = sessionLineageFor(source).map((lineage) => (lineage.role !== "wrapper"
                    ? lineage
                    : promotedRole === "root"
                        ? {
                            sessionEnvelopeId: lineage.sessionEnvelopeId,
                            role: "root",
                            workSourceObjectKeyDigest: source.workCanonical.sourceObjectKeyDigest,
                        }
                        : {
                            sessionEnvelopeId: lineage.sessionEnvelopeId,
                            role: "subagent",
                            parentSessionEnvelopeId: source.codexRoot.envelopeId,
                        }));
                const promoted = validInput({
                    source,
                    projection: g1Input.projection,
                    sessionLineage,
                    lifecycle,
                });
                continueWithVerifiedAcceptedOrigin(promoted, g1Input, g1.sidecar);
                node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(promoted)), /cannot change its accepted\/rejected role/);
            }
        }
        const reversedSource = sourceFixture({ revision: "v2" });
        const reversed = validInput({
            source: reversedSource,
            projection: g1Input.projection,
            sessionLineage: sessionLineageFor(reversedSource).map((lineage) => (lineage.sessionEnvelopeId
                === reversedSource.cursorSubagent.envelopeId
                ? {
                    sessionEnvelopeId: lineage.sessionEnvelopeId,
                    role: "wrapper",
                }
                : lineage)),
            lifecycle: lifecycleFor(reversedSource, {
                previousState: "open",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                currentSourceIdentityDigest: reversedSource.workCanonical.sourceIdentityDigest,
                adjudicatedDelta: "updated",
            }),
        });
        continueWithVerifiedAcceptedOrigin(reversed, g1Input, g1.sidecar);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reversed)), /cannot change its accepted\/rejected role/);
    });
    (0, node_test_1.it)("uses a direction-independent representative for every explicit two-member alias", () => {
        const forwardInput = validInput();
        const forward = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(forwardInput));
        const reversedInput = validInput({
            source: forwardInput.source,
            projection: forwardInput.projection,
            aliases: forwardInput.aliases.map((alias) => ({
                identityKind: alias.identityKind,
                canonicalSourceObjectKeyDigest: alias.aliasSourceObjectKeyDigest,
                aliasSourceObjectKeyDigest: alias.canonicalSourceObjectKeyDigest,
            })),
            workBindings: forwardInput.workBindings,
            sessionLineage: forwardInput.sessionLineage,
            lifecycle: forwardInput.lifecycleAdjudications,
        });
        const reversed = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reversedInput));
        node_assert_1.default.strictEqual(reversed.sidecar.works[0].workId, forward.sidecar.works[0].workId);
        node_assert_1.default.deepStrictEqual(reversed.sidecar, forward.sidecar);
    });
    (0, node_test_1.it)("preserves exact work/session alias membership and the session-to-work binding", () => {
        const g1Input = validInput();
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        const removedSessionAlias = validInput({
            source: g1Input.source,
            projection: g1Input.projection,
            aliases: aliasesFor(g1Input.source).filter((alias) => alias.identityKind === "work"),
            lifecycle: lifecycleFor(g1Input.source, {
                previousState: "open",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                adjudicatedDelta: "no_op",
            }),
        });
        continueFromPrevious(removedSessionAlias, g1Input.currentSnapshot, g1.sidecar, g1Input.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(removedSessionAlias)), /session alias membership .* cannot change|session alias identity cannot split/);
        const survivingWork = g1Input.source.workAlias;
        const rekeyedWork = validInput({
            source: g1Input.source,
            projection: g1Input.projection,
            aliases: aliasesFor(g1Input.source).filter((alias) => alias.identityKind === "session"),
            workBindings: g1Input.workBindings.map((binding) => ({
                ...binding,
                sourceEnvelopeId: survivingWork.envelopeId,
            })),
            sessionLineage: g1Input.sessionLineage.map((lineage) => (lineage.role === "root"
                ? {
                    ...lineage,
                    workSourceObjectKeyDigest: survivingWork.sourceObjectKeyDigest,
                }
                : lineage)),
            lifecycle: [{
                    canonicalSourceObjectKeyDigest: survivingWork.sourceObjectKeyDigest,
                    previousState: "open",
                    previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                    currentState: "open",
                    currentSourceIdentityDigest: survivingWork.sourceIdentityDigest,
                    adjudicatedDelta: "updated",
                }],
        });
        continueFromPrevious(rekeyedWork, g1Input.currentSnapshot, g1.sidecar, g1Input.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(rekeyedWork)), /work alias membership cannot change/);
        const twoWorkSource = sourceFixture({ includeSecondWork: true });
        const twoWorkProjection = projectionFixture(true);
        node_assert_1.default.ok(twoWorkSource.secondWork);
        const initialTwoWorkLifecycle = [
            ...lifecycleFor(twoWorkSource),
            {
                canonicalSourceObjectKeyDigest: twoWorkSource.secondWork.sourceObjectKeyDigest,
                previousState: "absent",
                currentState: "open",
                currentSourceIdentityDigest: twoWorkSource.secondWork.sourceIdentityDigest,
                adjudicatedDelta: "open",
            },
        ];
        const boundToPrimary = validInput({
            source: twoWorkSource,
            projection: twoWorkProjection,
            lifecycle: initialTwoWorkLifecycle,
        });
        const primary = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(boundToPrimary));
        const reboundToSecond = validInput({
            source: twoWorkSource,
            projection: twoWorkProjection,
            sessionLineage: sessionLineageFor(twoWorkSource).map((lineage) => (lineage.role === "root"
                ? {
                    ...lineage,
                    workSourceObjectKeyDigest: twoWorkSource.secondWork.sourceObjectKeyDigest,
                }
                : lineage)),
            lifecycle: [{
                    ...lifecycleFor(twoWorkSource)[0],
                    previousState: "open",
                    previousSourceIdentityDigest: twoWorkSource.workCanonical.sourceIdentityDigest,
                    adjudicatedDelta: "no_op",
                }, {
                    canonicalSourceObjectKeyDigest: twoWorkSource.secondWork.sourceObjectKeyDigest,
                    previousState: "open",
                    currentState: "open",
                    previousSourceIdentityDigest: twoWorkSource.secondWork.sourceIdentityDigest,
                    currentSourceIdentityDigest: twoWorkSource.secondWork.sourceIdentityDigest,
                    adjudicatedDelta: "no_op",
                }],
        });
        continueFromPrevious(reboundToSecond, boundToPrimary.currentSnapshot, primary.sidecar, boundToPrimary.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reboundToSecond)), /session alias membership or work binding cannot change/);
    });
    (0, node_test_1.it)("does not merge root sessions by timestamp, content, or shared work reference", () => {
        const input = validInput({ distinctSessionWorkRefOnly: true });
        input.aliases = input.aliases.filter((alias) => alias.identityKind !== "session");
        rebindAcceptedOrigin(input);
        const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(input));
        const sessions = built.sidecar.events.filter((event) => event.eventKind === "session");
        node_assert_1.default.strictEqual(sessions.length, 2);
        node_assert_1.default.ok(sessions.every((session) => (session.corroboratesWorkId === built.sidecar.works[0].workId)));
    });
    (0, node_test_1.it)("rejects session alias chains, delegation cycles, missing lineage, and wrapper promotion", () => {
        const chained = validInput();
        chained.aliases.push({
            identityKind: "session",
            canonicalSourceObjectKeyDigest: chained.source.claudeRoot.sourceObjectKeyDigest,
            aliasSourceObjectKeyDigest: chained.source.cursorSubagent.sourceObjectKeyDigest,
        });
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(chained);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(chained));
        }, /one-hop|repeats or chains/);
        const cycle = validInput();
        cycle.sessionLineage = cycle.sessionLineage.map((lineage) => (lineage.sessionEnvelopeId === cycle.source.claudeRoot.envelopeId
            ? {
                sessionEnvelopeId: lineage.sessionEnvelopeId,
                role: "subagent",
                parentSessionEnvelopeId: cycle.source.cursorSubagent.envelopeId,
            }
            : lineage.sessionEnvelopeId === cycle.source.cursorSubagent.envelopeId
                ? {
                    ...lineage,
                    parentSessionEnvelopeId: cycle.source.claudeRoot.envelopeId,
                }
                : lineage));
        cycle.aliases = cycle.aliases.filter((alias) => alias.identityKind !== "session");
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(cycle);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(cycle));
        }, /cycle/);
        const missing = validInput();
        missing.sessionLineage.pop();
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(missing);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(missing));
        }, /every local session/);
        const wrapper = validInput();
        wrapper.sessionLineage = wrapper.sessionLineage.map((lineage) => (lineage.role === "wrapper"
            ? {
                ...lineage,
                workSourceObjectKeyDigest: wrapper.source.workCanonical.sourceObjectKeyDigest,
            }
            : lineage));
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(wrapper);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(wrapper));
        }, /wrappers cannot claim work/);
    });
    (0, node_test_1.it)("preserves work ID across a source revision while changing lifecycle event and update delta", () => {
        const firstInput = validInput({ revision: "v1" });
        const first = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(firstInput));
        const secondInput = validInput({ revision: "v2" });
        secondInput.lifecycleAdjudications = lifecycleFor(secondInput.source, {
            previousState: "open",
            previousSourceIdentityDigest: firstInput.source.workCanonical.sourceIdentityDigest,
            currentState: "open",
            currentSourceIdentityDigest: secondInput.source.workCanonical.sourceIdentityDigest,
            adjudicatedDelta: "updated",
        });
        rebindAcceptedOrigin(secondInput);
        continueFromPrevious(secondInput, firstInput.currentSnapshot, first.sidecar, firstInput.acceptedOrigin);
        const second = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(secondInput));
        node_assert_1.default.strictEqual(first.sidecar.works[0].workId, second.sidecar.works[0].workId);
        node_assert_1.default.notStrictEqual(first.sidecar.works[0].lifecycleEventId, second.sidecar.works[0].lifecycleEventId);
        node_assert_1.default.strictEqual(second.sidecar.lifecycleDeltas[0].adjudicatedDelta, "updated");
        node_assert_1.default.notStrictEqual(first.sidecar.lifecycleDeltas[0].deltaId, second.sidecar.lifecycleDeltas[0].deltaId);
    });
    (0, node_test_1.it)("accepts a rejection-only work at genesis, preserves terminal no-op continuity, and forbids reopen", () => {
        const source = sourceFixture({ includeSecondWork: true });
        const projection = rejectionOnlySecondWorkProjectionFixture();
        const workBindings = rejectionOnlyWorkBindingsFor(projection, source);
        node_assert_1.default.ok(source.secondWork);
        const g1Input = validInput({
            source,
            projection,
            workBindings,
            lifecycle: [
                ...lifecycleFor(source),
                {
                    canonicalSourceObjectKeyDigest: source.secondWork.sourceObjectKeyDigest,
                    previousState: "absent",
                    currentState: "rejected",
                    currentSourceIdentityDigest: source.secondWork.sourceIdentityDigest,
                    adjudicatedDelta: "rejected",
                },
            ],
        });
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        const rejectedWork = g1.sidecar.works.find((work) => (work.variantSourceObjectKeyDigests.includes(source.secondWork.sourceObjectKeyDigest)));
        node_assert_1.default.ok(rejectedWork);
        node_assert_1.default.strictEqual(rejectedWork.lifecycleState, "rejected");
        node_assert_1.default.deepStrictEqual(rejectedWork.projectionReferences.map((reference) => reference.kind), ["rejection"]);
        const rejectedDelta = g1.sidecar.lifecycleDeltas.find((delta) => delta.workId === rejectedWork.workId);
        node_assert_1.default.strictEqual(rejectedDelta?.previousState, "absent");
        node_assert_1.default.strictEqual(rejectedDelta?.currentState, "rejected");
        node_assert_1.default.strictEqual(rejectedDelta?.adjudicatedDelta, "rejected");
        const g2Input = validInput({
            source,
            projection,
            workBindings,
            lifecycle: [{
                    ...lifecycleFor(source)[0],
                    previousState: "open",
                    previousSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                    adjudicatedDelta: "no_op",
                }, {
                    canonicalSourceObjectKeyDigest: source.secondWork.sourceObjectKeyDigest,
                    previousState: "rejected",
                    currentState: "rejected",
                    previousSourceIdentityDigest: source.secondWork.sourceIdentityDigest,
                    currentSourceIdentityDigest: source.secondWork.sourceIdentityDigest,
                    adjudicatedDelta: "no_op",
                }],
        });
        continueWithVerifiedAcceptedOrigin(g2Input, g1Input, g1.sidecar);
        const g2 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g2Input));
        const continuedRejected = g2.sidecar.works.find((work) => work.workId === rejectedWork.workId);
        node_assert_1.default.strictEqual(continuedRejected?.lifecycleState, "rejected");
        node_assert_1.default.strictEqual(g2.sidecar.lifecycleDeltas.find((delta) => delta.workId === rejectedWork.workId)?.adjudicatedDelta, "no_op");
        const reopened = clone(g2Input);
        reopened.lifecycleAdjudications =
            reopened.lifecycleAdjudications.map((adjudication) => (adjudication.canonicalSourceObjectKeyDigest
                === source.secondWork.sourceObjectKeyDigest
                ? {
                    ...adjudication,
                    currentState: "open",
                    adjudicatedDelta: "updated",
                }
                : adjudication));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reopened)), /terminal work variant cannot reopen/);
    });
    (0, node_test_1.it)("exposes only mechanically supplied open, updated, resolved, superseded, rejected, and no-op deltas", () => {
        const base = validInput();
        const previousIdentity = base.source.workCanonical.sourceIdentityDigest;
        const cases = [
            {
                delta: "open",
                overrides: {},
            },
            {
                delta: "updated",
                overrides: {
                    previousState: "open",
                    previousSourceIdentityDigest: previousIdentity,
                    currentState: "open",
                },
            },
            {
                delta: "resolved",
                overrides: {
                    previousState: "open",
                    previousSourceIdentityDigest: previousIdentity,
                    currentState: "resolved",
                },
            },
            {
                delta: "superseded",
                overrides: {
                    previousState: "open",
                    previousSourceIdentityDigest: previousIdentity,
                    currentState: "superseded",
                },
            },
            {
                delta: "no_op",
                overrides: {
                    previousState: "open",
                    previousSourceIdentityDigest: base.source.workCanonical.sourceIdentityDigest,
                    currentState: "open",
                },
            },
        ];
        for (const testCase of cases) {
            const input = validInput(testCase.delta === "updated" ? { revision: "v2" } : {});
            const priorInput = (testCase.overrides.previousState ?? "absent")
                === "absent"
                ? undefined
                : validInput({
                    source: testCase.delta === "updated"
                        ? sourceFixture({ revision: "v1" })
                        : input.source,
                    projection: input.projection,
                });
            input.lifecycleAdjudications = lifecycleFor(input.source, {
                ...testCase.overrides,
                ...(priorInput === undefined
                    ? {}
                    : {
                        previousSourceIdentityDigest: priorInput.source.workCanonical.sourceIdentityDigest,
                    }),
                adjudicatedDelta: testCase.delta,
            });
            rebindAcceptedOrigin(input);
            if (priorInput !== undefined) {
                const prior = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(priorInput));
                continueFromPrevious(input, priorInput.currentSnapshot, prior.sidecar, priorInput.acceptedOrigin);
            }
            const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(input));
            node_assert_1.default.strictEqual(built.sidecar.lifecycleDeltas[0].adjudicatedDelta, testCase.delta);
        }
        const rejected = validInput();
        const rejectedProjection = clone(rejected.projection);
        rejectedProjection.rejections.push({
            proposalId: "adjudicated-rejection",
            kind: "task",
            reasons: ["already_adjudicated"],
        });
        rejected.projection = rejectedProjection;
        rejected.workBindings.push({
            projectionKind: "rejection",
            projectionId: "adjudicated-rejection",
            sourceEnvelopeId: rejected.source.workCanonical.envelopeId,
        });
        rejected.lifecycleAdjudications = lifecycleFor(rejected.source, {
            previousState: "absent",
            currentState: "rejected",
            adjudicatedDelta: "rejected",
        });
        node_assert_1.default.throws(() => {
            const rejectedOrigin = originFixture(rejected.sourceSnapshot, rejectedProjection, {
                aliases: rejected.aliases,
                workBindings: rejected.workBindings,
                sessionLineage: rejected.sessionLineage,
                lifecycleAdjudications: rejected.lifecycleAdjudications,
            });
            rejected.acceptedOrigin = rejectedOrigin.origin;
            rejected.currentSnapshot = rejectedOrigin.currentSnapshot;
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(rejected));
        }, /mixed task\/rejection projection dispositions/);
    });
    (0, node_test_1.it)("forbids terminal variants from reopening and rejects caller-invented lifecycle transitions", () => {
        const reopened = validInput();
        reopened.lifecycleAdjudications = lifecycleFor(reopened.source, {
            previousState: "resolved",
            previousSourceIdentityDigest: digest("resolved-source-identity"),
            currentState: "open",
            adjudicatedDelta: "updated",
        });
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(reopened);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reopened));
        }, /cannot reopen/);
        const invented = validInput();
        invented.lifecycleAdjudications = lifecycleFor(invented.source, {
            previousState: "absent",
            currentState: "resolved",
            adjudicatedDelta: "resolved",
        });
        node_assert_1.default.throws(() => {
            rebindAcceptedOrigin(invented);
            (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(invented));
        }, /mechanically closed/);
    });
    (0, node_test_1.it)("rejects alias splits and merges across every prior work variant in open and terminal states", () => {
        const source = sourceFixture();
        const projection = projectionFixture();
        const sessionAliases = aliasesFor(source).filter((alias) => alias.identityKind === "session");
        const sessionLineage = sessionLineageFor(source).map((lineage) => (lineage.role === "root"
            ? {
                ...lineage,
                workSourceObjectKeyDigest: source.workCanonical.sourceObjectKeyDigest,
            }
            : lineage));
        const absentSeparateLifecycle = () => ([source.workCanonical, source.workAlias].map((work) => ({
            canonicalSourceObjectKeyDigest: work.sourceObjectKeyDigest,
            previousState: "absent",
            currentState: "open",
            currentSourceIdentityDigest: work.sourceIdentityDigest,
            adjudicatedDelta: "open",
        })));
        const continuedSeparateLifecycle = (previousState, currentState) => ([source.workCanonical, source.workAlias].map((work) => ({
            canonicalSourceObjectKeyDigest: work.sourceObjectKeyDigest,
            previousState,
            currentState,
            previousSourceIdentityDigest: work.sourceIdentityDigest,
            currentSourceIdentityDigest: work.sourceIdentityDigest,
            adjudicatedDelta: (previousState === "open" && currentState === "resolved"
                ? "resolved"
                : "no_op"),
        })));
        const splitLifecycle = (previousState) => [{
                canonicalSourceObjectKeyDigest: source.workCanonical.sourceObjectKeyDigest,
                previousState,
                currentState: previousState,
                previousSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                currentSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                adjudicatedDelta: "no_op",
            }, {
                canonicalSourceObjectKeyDigest: source.workAlias.sourceObjectKeyDigest,
                previousState: "absent",
                currentState: "open",
                currentSourceIdentityDigest: source.workAlias.sourceIdentityDigest,
                adjudicatedDelta: "open",
            }];
        const aliasedOpenInput = validInput({
            source,
            projection,
            sessionLineage,
        });
        const aliasedOpen = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(aliasedOpenInput));
        const splitOpenInput = validInput({
            source,
            projection,
            aliases: sessionAliases,
            sessionLineage,
            lifecycle: splitLifecycle("open"),
        });
        continueFromPrevious(splitOpenInput, aliasedOpenInput.currentSnapshot, aliasedOpen.sidecar, aliasedOpenInput.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(splitOpenInput)), /work alias membership cannot change/);
        const aliasedTerminalInput = validInput({
            source,
            projection,
            sessionLineage,
            lifecycle: lifecycleFor(source, {
                previousState: "open",
                previousSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                currentState: "resolved",
                adjudicatedDelta: "resolved",
            }),
        });
        continueFromPrevious(aliasedTerminalInput, aliasedOpenInput.currentSnapshot, aliasedOpen.sidecar, aliasedOpenInput.acceptedOrigin);
        const aliasedTerminal = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(aliasedTerminalInput));
        const splitTerminalInput = validInput({
            source,
            projection,
            aliases: sessionAliases,
            sessionLineage,
            lifecycle: splitLifecycle("resolved"),
        });
        continueFromPrevious(splitTerminalInput, aliasedTerminalInput.currentSnapshot, aliasedTerminal.sidecar, aliasedTerminalInput.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(splitTerminalInput)), /work alias membership cannot change/);
        const separateOpenInput = validInput({
            source,
            projection,
            aliases: sessionAliases,
            sessionLineage,
            lifecycle: absentSeparateLifecycle(),
        });
        const separateOpen = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(separateOpenInput));
        const mergedOpenInput = validInput({
            source,
            projection,
            sessionLineage,
            lifecycle: lifecycleFor(source, {
                previousState: "open",
                previousSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                adjudicatedDelta: "no_op",
            }),
        });
        continueFromPrevious(mergedOpenInput, separateOpenInput.currentSnapshot, separateOpen.sidecar, separateOpenInput.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(mergedOpenInput)), /merges distinct prior lifecycle identities/);
        const separateTerminalInput = validInput({
            source,
            projection,
            aliases: sessionAliases,
            sessionLineage,
            lifecycle: continuedSeparateLifecycle("open", "resolved"),
        });
        continueFromPrevious(separateTerminalInput, separateOpenInput.currentSnapshot, separateOpen.sidecar, separateOpenInput.acceptedOrigin);
        const separateTerminal = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(separateTerminalInput));
        const mergedTerminalInput = validInput({
            source,
            projection,
            sessionLineage,
            lifecycle: lifecycleFor(source, {
                previousState: "resolved",
                previousSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
                currentState: "resolved",
                adjudicatedDelta: "no_op",
            }),
        });
        continueFromPrevious(mergedTerminalInput, separateTerminalInput.currentSnapshot, separateTerminal.sidecar, separateTerminalInput.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(mergedTerminalInput)), /merges distinct prior lifecycle identities/);
    });
    (0, node_test_1.it)("binds a previous sidecar to the exact current-ref lineage and terminal lifecycle", () => {
        const terminalInput = validInput();
        terminalInput.lifecycleAdjudications = lifecycleFor(terminalInput.source, {
            previousState: "open",
            previousSourceIdentityDigest: terminalInput.source.workCanonical.sourceIdentityDigest,
            currentState: "resolved",
            adjudicatedDelta: "resolved",
        });
        rebindAcceptedOrigin(terminalInput);
        const priorInput = validInput({
            source: terminalInput.source,
            projection: terminalInput.projection,
        });
        const prior = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(priorInput));
        continueFromPrevious(terminalInput, priorInput.currentSnapshot, prior.sidecar, priorInput.acceptedOrigin);
        const terminal = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(terminalInput));
        const attemptedReopen = clone(terminalInput);
        attemptedReopen.lifecycleAdjudications = lifecycleFor(attemptedReopen.source);
        attemptedReopen.previousSidecar = terminal.sidecar;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(attemptedReopen)), /not the latest semantic predecessor/);
        const nullPredecessor = clone(attemptedReopen);
        nullPredecessor.previousSidecar = null;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(nullPredecessor)), /previous sidecar may be null only/);
        const omittedPredecessor = withoutSource(clone(attemptedReopen));
        delete omittedPredecessor.previousSidecar;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(omittedPredecessor), /missing=previousSidecar/);
        const forkInput = validInput({ distinctSessionWorkRefOnly: true });
        const fork = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(forkInput));
        const currentBranch = validInput();
        currentBranch.previousSidecar = fork.sidecar;
        currentBranch.previousAcceptedOrigin = forkInput.acceptedOrigin;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(currentBranch)), /not the latest semantic predecessor/);
    });
    (0, node_test_1.it)("rejects stale G1 and fabricated G2 predecessors at G3, including terminal reopen", () => {
        const g1Input = validInput();
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        const g2Input = validInput({
            source: g1Input.source,
            projection: g1Input.projection,
            lifecycle: lifecycleFor(g1Input.source, {
                previousState: "open",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "resolved",
                adjudicatedDelta: "resolved",
            }),
        });
        rebindAcceptedOrigin(g2Input);
        continueFromPrevious(g2Input, g1Input.currentSnapshot, g1.sidecar, g1Input.acceptedOrigin);
        const g2 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g2Input));
        const staleG1 = clone(g2Input);
        continueWithInheritedAcceptedGeneration(staleG1, g2Input.currentSnapshot, g1.sidecar, g1Input.acceptedOrigin, "blocked");
        staleG1.acceptedOrigin = g2Input.acceptedOrigin;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(staleG1)), /not the latest semantic predecessor/);
        const fabricatedG2 = clone(staleG1);
        fabricatedG2.previousSidecar = clone(g2.sidecar);
        fabricatedG2.previousSidecar.origin.currentRefId =
            `tmrefreshcurrent_${digest("fabricated-g2-ref")}`;
        rebindSidecarId(fabricatedG2.previousSidecar);
        fabricatedG2.previousAcceptedOrigin = g2Input.acceptedOrigin;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(fabricatedG2)), /not the latest semantic predecessor/);
        const wrongFrozenBundle = clone(staleG1);
        wrongFrozenBundle.previousSidecar = g2.sidecar;
        wrongFrozenBundle.previousAcceptedOrigin = g1Input.acceptedOrigin;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(wrongFrozenBundle)), /immediate predecessor bundle/);
        const divergentNonRollback = clone(staleG1);
        divergentNonRollback.previousSidecar = clone(g2.sidecar);
        divergentNonRollback.previousSidecar.replayClosure
            .projectionInputDigest = digest("forged-predecessor-replay");
        divergentNonRollback.previousSidecar.origin.replayClosureDigest =
            (0, source_contracts_js_1.taskMapContractDigest)(divergentNonRollback.previousSidecar.replayClosure);
        rebindSidecarId(divergentNonRollback.previousSidecar);
        divergentNonRollback.previousAcceptedOrigin =
            g2Input.acceptedOrigin;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(divergentNonRollback)), /immediate predecessor bundle/);
        const reopen = clone(staleG1);
        reopen.previousSidecar = g2.sidecar;
        reopen.previousAcceptedOrigin = g2Input.acceptedOrigin;
        reopen.lifecycleAdjudications = lifecycleFor(reopen.source, {
            previousState: "open",
            previousSourceIdentityDigest: reopen.source.workCanonical.sourceIdentityDigest,
            currentState: "open",
            adjudicatedDelta: "no_op",
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(reopen)), /does not continue the previous sidecar/);
    });
    (0, node_test_1.it)("rejects caller-authored identity decisions on a rollback generation", () => {
        const g1Input = validInput();
        const g1 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g1Input));
        const g2Input = validInput({
            source: g1Input.source,
            projection: g1Input.projection,
            lifecycle: lifecycleFor(g1Input.source, {
                previousState: "open",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "resolved",
                adjudicatedDelta: "resolved",
            }),
        });
        rebindAcceptedOrigin(g2Input);
        continueFromPrevious(g2Input, g1Input.currentSnapshot, g1.sidecar, g1Input.acceptedOrigin);
        const g2 = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(g2Input));
        const rollbackInput = validInput({
            source: g1Input.source,
            projection: g1Input.projection,
            lifecycle: lifecycleFor(g1Input.source, {
                previousState: "resolved",
                previousSourceIdentityDigest: g1Input.source.workCanonical.sourceIdentityDigest,
                currentState: "resolved",
                adjudicatedDelta: "no_op",
            }),
        });
        continueWithRollbackGeneration(rollbackInput, g2Input.currentSnapshot, g2.sidecar, g2Input.acceptedOrigin, FIRST_GENERATION, g1Input.acceptedOrigin);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(rollbackInput)), /rollback cannot accept caller-authored identity or lifecycle decisions/);
    });
    (0, node_test_1.it)("emits one deterministic no-op sidecar per contiguous generation and sorted changes", () => {
        const input = validInput();
        const first = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(input));
        const reordered = withoutSource(validInput({
            source: input.source,
            projection: input.projection,
            aliases: [...input.aliases].reverse(),
            workBindings: [...input.workBindings].reverse(),
            sessionLineage: [...input.sessionLineage].reverse(),
            lifecycle: [...input.lifecycleAdjudications].reverse(),
        }));
        const second = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(reordered);
        node_assert_1.default.strictEqual(first.sidecarCanonicalBytes, second.sidecarCanonicalBytes);
        const noOpInput = validInput({
            source: input.source,
            projection: input.projection,
            aliases: input.aliases,
            workBindings: input.workBindings,
            sessionLineage: input.sessionLineage,
            lifecycle: lifecycleFor(input.source, {
                previousState: "open",
                previousSourceIdentityDigest: input.source.workCanonical.sourceIdentityDigest,
                currentState: "open",
                adjudicatedDelta: "no_op",
            }),
        });
        rebindAcceptedOrigin(noOpInput);
        continueFromPrevious(noOpInput, input.currentSnapshot, first.sidecar, input.acceptedOrigin);
        const noOp = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(noOpInput));
        const repeated = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(clone(noOpInput)));
        node_assert_1.default.strictEqual(noOp.sidecarCanonicalBytes, repeated.sidecarCanonicalBytes);
        const blockedInput = clone(noOpInput);
        continueWithInheritedAcceptedGeneration(blockedInput, noOpInput.currentSnapshot, noOp.sidecar, noOpInput.acceptedOrigin, "blocked");
        const blocked = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(blockedInput));
        node_assert_1.default.deepStrictEqual(blocked.diff.added, []);
        node_assert_1.default.deepStrictEqual(blocked.diff.removed, []);
        node_assert_1.default.deepStrictEqual(blocked.diff.changed.map((entry) => `${entry.kind}:${entry.id}`), ["metadata:identity-sidecar-metadata"]);
        node_assert_1.default.strictEqual(blocked.sidecarCanonicalBytes, (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeProjectionCanonicalBytes)(blocked.sidecar));
    });
    (0, node_test_1.it)("rejects raw title/body/transcript/email/participant/raw-ID/path/secret fields and never emits source IDs", () => {
        const forbiddenFields = [
            "rawTitle",
            "body",
            "transcript",
            "email",
            "participants",
            "sourceObjectId",
            "sourceRevision",
        ];
        for (const field of forbiddenFields) {
            const input = withoutSource(validInput());
            input.aliases[0][field]
                = "synthetic-private-value";
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(input), /invalid fields/);
        }
        const privateProjection = withoutSource(validInput());
        privateProjection.projection.tasks[0].summary =
            "/Users/synthetic/private/task";
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(privateProjection));
        const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        for (const raw of [
            "synthetic-work-primary",
            "synthetic-work-mirror",
            "synthetic-design-doc",
            "synthetic-design-revision",
            "synthetic-message",
        ]) {
            node_assert_1.default.ok(!built.sidecarCanonicalBytes.includes(raw));
        }
        for (const token of [
            "AIza0123456789abcdefghijklmnopqrstuvwxyz",
            ["sk_", "live_0123456789abcdefghijklmnopqrstuv"].join(""),
            "npm_0123456789abcdefghijklmnopqrstuvwxyz",
        ]) {
            const leaked = clone(built.sidecar);
            leaked.sourceSnapshotId = token;
            rebindSidecarId(leaked);
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(leaked), /contract-derived hashed identifier|contains a (?:Google API key|Stripe secret|npm token)/);
        }
    });
    (0, node_test_1.it)("rejects tampered stable IDs, unknown output fields, and noncanonical diff order", () => {
        const built = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        const tampered = clone(built.sidecar);
        tampered.works[0].workId = `tmwork_${digest("tampered")}`;
        rebindSidecarId(tampered);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(tampered), /canonical work identity/);
        const nestedUnknown = clone(built.sidecar);
        nestedUnknown.works[0].unexpected = true;
        rebindSidecarId(nestedUnknown);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(nestedUnknown), /invalid fields/);
        const overlap = clone(built.sidecar);
        const session = overlap.events.find((event) => event.eventKind === "session");
        overlap.rejectedVariants[0].envelopeId =
            session.variantEnvelopeIds[0];
        rebindSidecarId(overlap);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(overlap), /both accepted and rejected/);
        const crossAcceptedSets = clone(built.sidecar);
        const meeting = crossAcceptedSets.events.find((event) => event.eventKind === "meeting");
        const acceptedSession = crossAcceptedSets.events.find((event) => event.eventKind === "session");
        acceptedSession.variantEnvelopeIds[0] =
            meeting.variantEnvelopeIds[0];
        acceptedSession.variantEnvelopeIds.sort();
        rebindSidecarId(crossAcceptedSets);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(crossAcceptedSets), /more than one meeting\/session identity/);
        const unknown = clone(built.sidecar);
        unknown.unexpected = true;
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeProjection)(unknown), /invalid fields/);
        const diff = clone(built.diff);
        if (diff.added.length > 1) {
            diff.added.reverse();
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeDiff)(diff));
        }
        const contradictory = clone(built.diff);
        const repeated = contradictory.added[0];
        contradictory.changed = [{
                kind: repeated.kind,
                id: repeated.id,
                beforeDigest: digest("contradictory-before"),
                afterDigest: repeated.afterDigest,
            }];
        rebindDiffId(contradictory);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeDiff)(contradictory), /repeats one record/);
        const falseNoOp = clone(built.diff);
        falseNoOp.previousSidecarDigest = falseNoOp.currentSidecarDigest;
        rebindDiffId(falseNoOp);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeDiff)(falseNoOp), /exact no-op state/);
        const inherited = withoutSource(validInput());
        const inheritedKey = "previousSidecar";
        delete inherited.previousSidecar;
        const priorDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, inheritedKey);
        let getterReads = 0;
        try {
            Object.defineProperty(Object.prototype, inheritedKey, {
                configurable: true,
                get: () => {
                    getterReads += 1;
                    return digest("inherited-lifecycle-identity");
                },
            });
            node_assert_1.default.strictEqual(Object.hasOwn(inherited, inheritedKey), false);
            node_assert_1.default.notStrictEqual(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inherited), inheritedKey), undefined);
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(inherited), /missing=previousSidecar|must not be inherited/);
            node_assert_1.default.strictEqual(getterReads, 0);
        }
        finally {
            if (priorDescriptor === undefined) {
                delete Object.prototype[inheritedKey];
            }
            else {
                Object.defineProperty(Object.prototype, inheritedKey, priorDescriptor);
            }
        }
    });
    (0, node_test_1.it)("rejects proxies and Array prototype drift before attacker code executes", () => {
        const input = withoutSource(validInput());
        let proxyTrapReads = 0;
        const proxied = new Proxy(input, {
            ownKeys: () => {
                proxyTrapReads += 1;
                return Reflect.ownKeys(input);
            },
            getOwnPropertyDescriptor: (target, key) => {
                proxyTrapReads += 1;
                return Object.getOwnPropertyDescriptor(target, key);
            },
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(proxied), /must not be proxy-backed/);
        node_assert_1.default.strictEqual(proxyTrapReads, 0);
        const replayInput = validInput();
        const replayProofs = {
            aliases: replayInput.aliases,
            workBindings: replayInput.workBindings,
            sessionLineage: replayInput.sessionLineage,
            lifecycleAdjudications: replayInput.lifecycleAdjudications,
        };
        let replayProxyTrapReads = 0;
        const proxiedReplayProofs = new Proxy(replayProofs, {
            ownKeys: () => {
                replayProxyTrapReads += 1;
                return Reflect.ownKeys(replayProofs);
            },
            get: (target, key) => {
                replayProxyTrapReads += 1;
                return Reflect.get(target, key);
            },
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeReplayClosureDigest)(replayInput.sourceSnapshot, replayInput.projection, proxiedReplayProofs, REVIEW_ATTESTATION_DIGEST), /must not be proxy-backed/);
        node_assert_1.default.strictEqual(replayProxyTrapReads, 0);
        const customArrayInput = withoutSource(validInput());
        let customArrayMethodReads = 0;
        const customArrayPrototype = Object.create(Array.prototype);
        Object.defineProperty(customArrayPrototype, "entries", {
            configurable: true,
            get: () => {
                customArrayMethodReads += 1;
                return Array.prototype.entries;
            },
        });
        Object.setPrototypeOf(customArrayInput.aliases, customArrayPrototype);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(customArrayInput), /intrinsic Array prototype/);
        node_assert_1.default.strictEqual(customArrayMethodReads, 0);
        const mapDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "map");
        let pollutedMapCalls = 0;
        let pollutionError;
        try {
            Object.defineProperty(Array.prototype, "map", {
                ...mapDescriptor,
                value: function pollutedMap(...args) {
                    pollutedMapCalls += 1;
                    Object.defineProperty(Array.prototype, "map", mapDescriptor);
                    return mapDescriptor.value.apply(this, args);
                },
            });
            try {
                (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(input);
            }
            catch (error) {
                pollutionError = error;
            }
        }
        finally {
            Object.defineProperty(Array.prototype, "map", mapDescriptor);
        }
        node_assert_1.default.match(String(pollutionError), /dependency set is not intact/);
        node_assert_1.default.strictEqual(pollutedMapCalls, 0);
    });
    (0, node_test_1.it)("enforces count, string, and pre-clone canonical byte bounds", () => {
        const mib = 1024 * 1024;
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes, 80 * mib);
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes, 4 * mib);
        node_assert_1.default.ok(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes
            >= (2
                * identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes
                + 2 * mib));
        node_assert_1.default.ok(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes
            <= 7
                * identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes);
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries, refresh_current_ref_js_1.TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations);
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters, 1);
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries, 1);
        node_assert_1.default.strictEqual(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingBytes, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes);
        node_assert_1.default.doesNotThrow(() => ((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreAppendCapacity)(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes - 1, 1)));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreAppendCapacity)(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes - 1, 2), /aggregate history byte bound/);
        node_assert_1.default.doesNotThrow(() => ((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreAppendCapacity)(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes, true, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries)));
        node_assert_1.default.doesNotThrow(() => ((0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreAppendCapacity)(0, 1, false, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries - 1)));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.assertTaskMapIdentityDedupeStoreAppendCapacity)(0, 1, false, identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries), /generation count bound/);
        const tooWideObject = withoutSource(validInput());
        let wideGetterReads = 0;
        for (let index = 0; index < identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys; index += 1) {
            Object.defineProperty(tooWideObject.aliases[0], `extra${index}`, {
                configurable: true,
                enumerable: true,
                value: index,
            });
        }
        Object.defineProperty(tooWideObject.aliases[0], "attackerGetter", {
            configurable: true,
            enumerable: true,
            get: () => {
                wideGetterReads += 1;
                return "must-not-run";
            },
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(tooWideObject), /too many object fields/);
        node_assert_1.default.strictEqual(wideGetterReads, 0);
        const namedEmptyArray = withoutSource(validInput());
        namedEmptyArray.aliases = [];
        let namedArrayGetterReads = 0;
        Object.defineProperty(namedEmptyArray.aliases, "attackerGetter", {
            configurable: true,
            enumerable: true,
            get: () => {
                namedArrayGetterReads += 1;
                return "must-not-run";
            },
        });
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(namedEmptyArray), /array contains named fields/);
        node_assert_1.default.strictEqual(namedArrayGetterReads, 0);
        const tooManyAliases = withoutSource(validInput());
        tooManyAliases.aliases = Array.from({
            length: identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxAliases + 1,
        }, () => clone(tooManyAliases.aliases[0]));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(tooManyAliases), /aliases must be an array of at most/);
        const oversizedString = withoutSource(validInput());
        oversizedString.aliases[0].canonicalSourceObjectKeyDigest = "a".repeat(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength + 1);
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(oversizedString), /oversized string/);
        const oversizedBytes = withoutSource(validInput());
        const largeProof = "a".repeat(identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength);
        oversizedBytes.aliases = Array.from({ length: 2_100 }, () => ({
            ...oversizedBytes.aliases[0],
            canonicalSourceObjectKeyDigest: largeProof,
        }));
        node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(oversizedBytes), /pre-clone canonical byte bound/);
    });
    (0, node_test_1.it)("charges undefined-valued own fields before descriptors can reach clone", () => {
        const keyBytesOverflow = withoutSource(validInput());
        const descriptorOverflow = withoutSource(validInput());
        const cloneDescriptor = Object.getOwnPropertyDescriptor(globalThis, "structuredClone");
        let structuredCloneCalls = 0;
        let attackerGetterReads = 0;
        Object.defineProperty(globalThis, "structuredClone", {
            ...cloneDescriptor,
            value: () => {
                structuredCloneCalls += 1;
                throw new Error("structuredClone must not run for preflight overflow");
            },
        });
        try {
            const maximumKeyLength = identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength;
            const longUndefinedDescriptors = Object.create(null);
            for (let index = 0; index < identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys; index += 1) {
                const prefix = index.toString(16).padStart(4, "0");
                Object.defineProperty(longUndefinedDescriptors, `${prefix}${"k".repeat(maximumKeyLength - prefix.length)}`, {
                    configurable: true,
                    enumerable: true,
                    value: {
                        configurable: true,
                        enumerable: true,
                        value: undefined,
                    },
                });
            }
            const unreachableGetter = Object.defineProperty({}, "attackerGetter", {
                enumerable: true,
                get() {
                    attackerGetterReads += 1;
                    return "must-not-run";
                },
            });
            keyBytesOverflow.currentSnapshot.generations = [
                ...Array.from({ length: 1_000 }, () => Object.create(null, longUndefinedDescriptors)),
                unreachableGetter,
            ];
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(keyBytesOverflow), /pre-clone canonical byte bound/);
            node_assert_1.default.strictEqual(structuredCloneCalls, 0);
            node_assert_1.default.strictEqual(attackerGetterReads, 0);
            const shortUndefinedDescriptors = Object.create(null);
            for (let index = 0; index < identity_dedupe_projection_js_1.TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys; index += 1) {
                Object.defineProperty(shortUndefinedDescriptors, `u${index.toString(16).padStart(3, "0")}`, {
                    configurable: true,
                    enumerable: true,
                    value: {
                        configurable: true,
                        enumerable: true,
                        value: undefined,
                    },
                });
            }
            descriptorOverflow.currentSnapshot.generations = Array.from({ length: 1_000 }, () => Object.create(null, shortUndefinedDescriptors));
            node_assert_1.default.throws(() => (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(descriptorOverflow), /pre-clone descriptor bound/);
            node_assert_1.default.strictEqual(structuredCloneCalls, 0);
            node_assert_1.default.strictEqual(attackerGetterReads, 0);
        }
        finally {
            Object.defineProperty(globalThis, "structuredClone", cloneDescriptor);
        }
    });
    (0, node_test_1.it)("preserves the frozen P10.1B golden and Swift flat v1 bytes", () => {
        const sha256 = (filePath) => (0, node_crypto_1.createHash)("sha256").update((0, node_fs_1.readFileSync)(filePath)).digest("hex");
        const goldenPath = node_path_1.default.resolve(process.cwd(), "tests/fixtures/taskmap-p10.1b/golden-v1.json");
        const swiftPath = node_path_1.default.resolve(process.cwd(), "../DaobrewSentinelMac/Sources/SentinelMac/Models/"
            + "TaskMapProjectionDocumentV1.swift");
        // 2026-08-04: golden re-cut for the Unicode-scalar canonical key sort
        // (see taskmap-refresh-run-bundle.test.ts golden fixture note).
        node_assert_1.default.strictEqual(sha256(goldenPath), "b538c226d5f57713a6cca78d2111a7cddc95ce4447461870b50b3186d6c9acd9");
        // 2026-08-13: Swift pin re-cut for the optional visibleTaskIds root
        // view hint. Absence remains byte-compatible with old projections.
        node_assert_1.default.strictEqual(sha256(swiftPath), "1e207fad6cf860d8b3e4ab2512ed8a5521ce09cbda552c39bcdcdbff6b708180");
    });
    (0, node_test_1.it)("keeps canonical artifacts newline-free and hash-stable", () => {
        const first = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        const second = (0, identity_dedupe_projection_js_1.unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest)(withoutSource(validInput()));
        node_assert_1.default.ok(!first.sidecarCanonicalBytes.endsWith("\n"));
        node_assert_1.default.ok(!first.diffCanonicalBytes.endsWith("\n"));
        node_assert_1.default.strictEqual((0, node_crypto_1.createHash)("sha256").update(first.sidecarCanonicalBytes).digest("hex"), (0, node_crypto_1.createHash)("sha256").update(second.sidecarCanonicalBytes).digest("hex"));
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)(first.sidecar), first.sidecarCanonicalBytes);
    });
    (0, node_test_1.it)("splits staged UTF-8 bytes without corrupting a midpoint surrogate pair", () => {
        const value = `${"a".repeat(10)}😀${"b".repeat(10)}`;
        node_assert_1.default.strictEqual(value.length % 2, 0);
        const [first, second] = (0, identity_dedupe_projection_js_1.taskMapIdentityDedupeUtf8WriteChunks)(value);
        node_assert_1.default.deepStrictEqual(Buffer.concat([first, second]), Buffer.from(value, "utf8"));
    });
});
