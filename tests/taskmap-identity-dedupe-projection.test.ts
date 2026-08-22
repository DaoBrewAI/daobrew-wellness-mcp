import assert from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  advanceTaskMapConnectorCheckpoint,
  buildGeminiMeetSource,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_REFRESH_LANE_VERSION,
  TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
  TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
  buildTaskMapRefreshPlan,
  selectTaskMapReadyBatch,
  type TaskMapRefreshPlanDraftV1,
} from "../src/engine/taskmap/refresh-plan.js";
import {
  buildTaskMapRefreshRunSourceSliceProof,
  materializeTaskMapRefreshRunBundle,
  prepareTaskMapRefreshRunBundle,
  type PreparedTaskMapRefreshRunBundle,
  type VerifiedTaskMapRefreshRunBundle,
} from "../src/engine/taskmap/refresh-run-bundle.js";
import {
  TASKMAP_REFRESH_CURRENT_LIMITS_V1,
  TASKMAP_REFRESH_CURRENT_REF_VERSION,
  assertTaskMapRefreshCurrentRef,
  initializeTaskMapRefreshCurrentStore,
  publishTaskMapRefreshRunCurrent,
  readTaskMapRefreshCurrent,
  rollbackTaskMapRefreshCurrent,
  type TaskMapRefreshCurrentRefV1,
  type TaskMapRefreshCurrentSnapshotV1,
} from "../src/engine/taskmap/refresh-current-ref.js";
import {
  TASKMAP_IDENTITY_DEDUPE_LIMITS_V1,
  TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
  assertTaskMapIdentityDedupeDiff,
  assertTaskMapIdentityDedupeProjection,
  assertTaskMapIdentityDedupeStoreAppendCapacity,
  assertTaskMapIdentityDedupeStoreEntry,
  backfillTaskMapIdentityDedupeNoAcceptedGeneration,
  backfillTaskMapIdentityDedupeProjectionGeneration,
  buildAndPublishTaskMapIdentityDedupeProjection,
  buildTaskMapIdentityDedupeProjection as
    buildTaskMapIdentityDedupeProjectionFromStore,
  unsafeBuildTaskMapIdentityDedupeProjectionFromVerifiedInputsForTest as
    buildTaskMapIdentityDedupeProjection,
  initializeTaskMapIdentityDedupeProjectionStore,
  readTaskMapIdentityDedupeProjectionStore,
  recoverTaskMapIdentityDedupeProjectionStore,
  publishTaskMapIdentityDedupeRollbackObservation,
  taskMapIdentityDedupeProjectionCanonicalBytes,
  taskMapIdentityDedupeReplayClosureDigest,
  taskMapIdentityDedupeUtf8WriteChunks,
  unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest,
  type BuildTaskMapIdentityDedupeProjectionInput,
  type TaskMapIdentityAliasV1,
  type TaskMapIdentityDedupeProjectionV1,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapLifecycleAdjudicationV1,
  type TaskMapProjectionWorkBindingV1,
  type TaskMapSessionLineageV1,
} from "../src/engine/taskmap/identity-dedupe-projection.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapMeetingIdentityHintV1,
  type TaskMapProjectionV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceEnvelopeV1,
  type TaskMapSourceKind,
  type TaskMapSourceSnapshotV1,
  type TaskMapInput,
} from "../src/engine/taskmap/types.js";

function identityStoreRoots(
  currentRoot: string,
  runRoot: string,
  sidecarRoot: string,
) {
  return { currentRoot, runRoot, sidecarRoot };
}

const digest = (label: string): string =>
  taskMapContractDigest(`p10.2-test:${label}`);
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
} as const;

function binding(
  sourceKind: TaskMapSourceKind,
  label: string = sourceKind,
): TaskMapSourceAuthorityBindingV1 {
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
    evidence: "authoritative_task" as const,
    quality: "source_native" as const,
    lifecycle: "source_status" as const,
    completion: "source_status" as const,
    rank: "accepted_work" as const,
  };
}

function contextAuthority() {
  return {
    evidence: "context_only" as const,
    quality: "bounded_context" as const,
    lifecycle: "none" as const,
    completion: "none" as const,
    rank: "context_only" as const,
  };
}

function envelope(
  value: {
    binding: TaskMapSourceAuthorityBindingV1;
    sourceKind: TaskMapSourceKind;
    objectType:
      | "authoritative_task"
      | "meeting_note"
      | "calendar_event"
      | "agent_session"
      | "strategy_context";
    sourceObjectId: string;
    sourceRevision: string;
    eventTime?: string;
    contentLabel?: string;
    meetingIdentity?: TaskMapMeetingIdentityHintV1;
    authority?: ReturnType<typeof workAuthority> | ReturnType<typeof contextAuthority>;
  },
): TaskMapSourceEnvelopeV1 {
  return buildTaskMapSourceEnvelope({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    binding: value.binding,
    sourceKind: value.sourceKind,
    objectType: value.objectType,
    sourceObjectId: value.sourceObjectId,
    sourceRevision: value.sourceRevision,
    eventTime: value.eventTime ?? GENERATED_AT,
    contentDigest: digest(
      value.contentLabel
        ?? `${value.sourceObjectId}-${value.sourceRevision}-content`,
    ),
    authority: value.authority
      ?? (
        value.objectType === "authoritative_task"
          ? workAuthority()
          : value.objectType === "calendar_event"
            ? {
              ...contextAuthority(),
              quality: "source_native" as const,
            }
            : contextAuthority()
      ),
    ...(value.meetingIdentity === undefined
      ? {}
      : { meetingIdentity: value.meetingIdentity }),
  });
}

function designMeetingHint(
  overrides: Partial<TaskMapMeetingIdentityHintV1> = {},
): TaskMapMeetingIdentityHintV1 {
  const hint: TaskMapMeetingIdentityHintV1 = {
    fingerprintVersion: "taskmap-meeting-fingerprint.1",
    startAt: "2026-07-28T01:30:00.000Z",
    endAt: "2026-07-28T02:00:00.000Z",
    calendarEventIdDigest: digest("design-calendar-event"),
    normalizedTitleDigest: digest("design-weekly-title"),
    participantSetDigest: digest("design-participant-set"),
    ...overrides,
  };
  if (hint.endAt === undefined) delete hint.endAt;
  if (hint.calendarEventIdDigest === undefined) {
    delete hint.calendarEventIdDigest;
  }
  return hint;
}

function fallbackMeetingHint(
  hint: TaskMapMeetingIdentityHintV1,
): TaskMapMeetingIdentityHintV1 {
  const {
    endAt: _endAt,
    calendarEventIdDigest: _calendarEventIdDigest,
    ...fallback
  } = hint;
  return fallback;
}

type SourceFixtureOptions = {
  revision?: string;
  includeCalendar?: boolean;
  discoveryMessageId?: string;
  reverseEnvelopes?: boolean;
  distinctSessionWorkRefOnly?: boolean;
  ambiguousFallback?: boolean;
  includeSecondWork?: boolean;
};

type SourceFixture = {
  snapshot: TaskMapSourceSnapshotV1;
  workCanonical: TaskMapSourceEnvelopeV1;
  workAlias: TaskMapSourceEnvelopeV1;
  codexRoot: TaskMapSourceEnvelopeV1;
  claudeRoot: TaskMapSourceEnvelopeV1;
  cursorSubagent: TaskMapSourceEnvelopeV1;
  wrapper: TaskMapSourceEnvelopeV1;
  secondWork?: TaskMapSourceEnvelopeV1;
};

function sourceFixture(options: SourceFixtureOptions = {}): SourceFixture {
  const revision = options.revision ?? "v1";
  const includeCalendar = options.includeCalendar ?? true;
  const baseHint = designMeetingHint(
    includeCalendar
      ? {}
      : { calendarEventIdDigest: undefined, endAt: undefined },
  );
  const gemini = buildGeminiMeetSource({
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
        resolvedDocumentUrl:
          "https://docs.google.com/document/d/synthetic-design-doc/edit",
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
  const snapshot = buildTaskMapSourceSnapshot(
    options.reverseEnvelopes ? [...rows].reverse() : rows,
    gemini.discoveryPointers,
  );
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

function contextOnlyWorkSourceFixture(): SourceFixture {
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
    snapshot: buildTaskMapSourceSnapshot([
      ...source.snapshot.envelopes.filter(
        (sourceEnvelope) => !replacedEnvelopeIds.has(
          sourceEnvelope.envelopeId,
        ),
      ),
      gmailContext,
      strategyContext,
    ], source.snapshot.discoveryPointers),
    workCanonical: gmailContext,
    workAlias: strategyContext,
  };
}

function projectionFixture(includeSecondWork = false): TaskMapProjectionV1 {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
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
          sourceKind: "linear" as const,
          sourceObjectId: "synthetic-work-secondary",
          sourceRefHash: "3333333333333333",
          sourceVersion: "synthetic-v1",
          authority: "source_system" as const,
          syncMode: "reference_only" as const,
          capabilities: ["read_task" as const],
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
          recordKind: "authoritative_task" as const,
          activity: "task_created" as const,
          occurredAt: "2026-07-27T22:00:00.000Z",
          observedAt: GENERATED_AT,
          objectRefs: ["work:secondary"],
          title: "Review the rollback observation",
          summary: "A later-added accepted work item.",
          extractionConfidence: 1,
          sourceStatus: "in_progress" as const,
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
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "synthetic-brain",
    model: "synthetic-model-v1",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
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
          openState: "open" as const,
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
          relation: "advances" as const,
          evidenceEventIds: ["linear-work-secondary-open"],
          confidence: 1,
        }]
        : []),
    ],
  };
  return buildTaskMapProjection(input, brain, {
    arm: "E4",
    now: GENERATED_AT,
  });
}

function rejectionOnlySecondWorkProjectionFixture(): TaskMapProjectionV1 {
  const projection = clone(projectionFixture(true));
  const rejectedTask = projection.tasks.find(
    (task) => task.title === "Review the rollback observation",
  );
  assert.ok(rejectedTask);
  projection.tasks = projection.tasks.filter(
    (task) => task.id !== rejectedTask.id,
  );
  projection.edges = projection.edges.filter((edge) => (
    edge.from !== rejectedTask.id && edge.to !== rejectedTask.id
  ));
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

function policyBindings(): TaskMapRefreshPlanDraftV1["policyBindings"] {
  return [
    "identity",
    "normalization",
    "publication",
    "scheduling",
    "source",
  ].map((name) => ({
    name: `${name}-policy` as TaskMapRefreshPlanDraftV1[
      "policyBindings"
    ][number]["name"],
    version: `${name}-policy.1`,
    digest: digest(`policy-${name}`),
  }));
}

function revisionSets(
  revisions: TaskMapRefreshPlanDraftV1["sourceRevisions"],
  bindingDigests: string[],
): TaskMapRefreshPlanDraftV1["sourceRevisionSets"] {
  return [...bindingDigests].sort().map((bindingDigest) => ({
    bindingDigest,
    revisionSetDigest: taskMapContractDigest(
      revisions
        .filter((revision) => revision.bindingDigest === bindingDigest)
        .map((revision) => ({
          sourceIdentityDigest: revision.sourceIdentityDigest,
          sourceRevisionDigest: revision.sourceRevisionDigest,
          contentDigest: revision.contentDigest,
        }))
        .sort((left, right) => (
          left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
          || left.sourceRevisionDigest.localeCompare(
            right.sourceRevisionDigest,
          )
          || left.contentDigest.localeCompare(right.contentDigest)
        )),
    ),
  }));
}

function lanesFor(
  bindingRows: Array<{
    bindingDigest: string;
    sourceKind: TaskMapSourceKind;
  }>,
  priorProviderArtifacts: Array<{
    bindingDigest: string;
    checkpointDigest: string;
    sourceSliceDigest: string;
  }> = [],
): TaskMapRefreshPlanDraftV1["lanes"] {
  const lane = (
    value: Omit<
      TaskMapRefreshPlanDraftV1["lanes"][number],
      "contractVersion"
    >,
  ): TaskMapRefreshPlanDraftV1["lanes"][number] => ({
    contractVersion: TASKMAP_REFRESH_LANE_VERSION,
    ...value,
  });
  const inputDigestsFor = (bindingDigest: string): string[] => {
    const prior = priorProviderArtifacts.find(
      (artifact) => artifact.bindingDigest === bindingDigest,
    );
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

function originFixture(
  snapshot: TaskMapSourceSnapshotV1,
  projection: TaskMapProjectionV1,
  suppliedProofs: Pick<
    BuildTaskMapIdentityDedupeProjectionInput,
    | "aliases"
    | "workBindings"
    | "sessionLineage"
    | "lifecycleAdjudications"
  >,
  replayDigestOverride?: string,
  prior?: {
    origin: VerifiedTaskMapRefreshRunBundle;
    providerOrigin?: VerifiedTaskMapRefreshRunBundle;
    baselineSnapshot?: TaskMapRefreshCurrentSnapshotV1;
    currentSnapshot: TaskMapRefreshCurrentSnapshotV1;
    sourceSnapshot: TaskMapSourceSnapshotV1;
  },
  reviewAttestationDigest = REVIEW_ATTESTATION_DIGEST,
): {
  origin: VerifiedTaskMapRefreshRunBundle;
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1;
  prepared: PreparedTaskMapRefreshRunBundle;
} {
  const bindingsByDigest = new Map<string, {
    bindingDigest: string;
    binding: TaskMapSourceAuthorityBindingV1;
    sourceKind: TaskMapSourceKind;
    envelopes: TaskMapSourceEnvelopeV1[];
  }>();
  for (const sourceEnvelope of snapshot.envelopes) {
    const bindingDigest = taskMapContractDigest(sourceEnvelope.binding);
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
    bindingDigest: taskMapContractDigest(sourceEnvelope.binding),
    sourceIdentityDigest: sourceEnvelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(
      sourceEnvelope.sourceRevision,
    ),
    contentDigest: sourceEnvelope.contentDigest,
  })).sort((left, right) => (
    left.bindingDigest.localeCompare(right.bindingDigest)
    || left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)
    || left.sourceRevisionDigest.localeCompare(right.sourceRevisionDigest)
    || left.contentDigest.localeCompare(right.contentDigest)
  ));
  const priorProviderArtifacts = prior === undefined
    ? []
    : (
      prior.baselineSnapshot ?? prior.currentSnapshot
    ).head!.connectorHeads.map((head) => ({
      bindingDigest: head.bindingDigest,
      checkpointDigest: head.latestCheckpoint.checkpointDigest,
      sourceSliceDigest: head.latestCheckpoint.sourceSliceDigest,
    })).sort((left, right) => (
      left.bindingDigest.localeCompare(right.bindingDigest)
    ));
  const draft: TaskMapRefreshPlanDraftV1 = {
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
        priorCheckpointDigests: (
          prior.baselineSnapshot ?? prior.currentSnapshot
        ).head!.connectorHeads
          .map((head) => head.latestCheckpoint.checkpointDigest)
          .sort(),
        priorSourceSliceDigests: (
          prior.baselineSnapshot ?? prior.currentSnapshot
        ).head!.connectorHeads
          .map((head) => head.latestCheckpoint.sourceSliceDigest)
          .sort(),
        priorProviderArtifacts,
        priorAcceptedStateDigest:
          prior.origin.plan.candidateAcceptedStateDigest,
        priorOwnerScopeDigest: prior.origin.plan.ownerScopeDigest,
        priorSourceSnapshotDigest:
          prior.sourceSnapshot.sourceSnapshotDigest,
        priorReviewedEvidenceDigest:
          prior.origin.plan.reviewedEvidenceDigest,
        priorPolicyBundleDigest: prior.origin.plan.policyBundleDigest,
        priorSemanticImplementationDigest:
          prior.origin.plan.semanticImplementationDigest,
        acceptedSourceRevisions: prior.origin.plan.sourceRevisions,
        acceptedSourceRevisionSets:
          prior.origin.plan.sourceRevisionSets,
        acceptedSemanticInputDigests:
          prior.origin.plan.semanticInputDigests,
        acceptedDeterministicReplayDigest:
          prior.origin.plan.deterministicReplayDigest,
      },
    reviewedDigests: {
      truthSetDigest: digest("truth"),
      reviewBatchDigest: digest("review-batch"),
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest,
      sourceManifestDigest: digest("source-manifest"),
    },
    sourceBindings: bindingRows.map((row) => ({
      bindingDigest: row.bindingDigest,
      sourceKind: row.sourceKind,
      sourceContractVersion: row.envelopes[0]!.contractVersion,
      adapterVersion: `${row.sourceKind}-adapter.1`,
    })),
    sourceRevisions,
    sourceRevisionSets: revisionSets(
      sourceRevisions,
      bindingRows.map((row) => row.bindingDigest),
    ),
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest:
      replayDigestOverride
      ?? taskMapIdentityDedupeReplayClosureDigest(
        snapshot,
        projection,
        suppliedProofs,
        reviewAttestationDigest,
      ),
    policyBindings: policyBindings(),
    lanes: lanesFor(bindingRows, priorProviderArtifacts),
  };
  const plan = buildTaskMapRefreshPlan(draft);
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 4,
    laneStates: plan.lanes.map((lane) => ({
      laneId: lane.laneId,
      status: "succeeded",
    })),
  });
  assert.strictEqual(batch.publication.state, "complete");
  const checkpoints = bindingRows.map((row, index) => {
    const priorCheckpoint = (
      prior?.providerOrigin ?? prior?.origin
    )?.checkpoints.checkpoints.find(
      (record) => (
        taskMapContractDigest(record.checkpoint.binding)
          === row.bindingDigest
      ),
    )?.checkpoint ?? null;
    const attemptedAt = prior === undefined
      ? GENERATED_AT
      : prior.currentSnapshot.head!.generation === FIRST_GENERATION
        ? "2026-07-28T06:00:00.000Z"
        : "2026-07-28T07:00:00.000Z";
    const checkpoint = advanceTaskMapConnectorCheckpoint(priorCheckpoint, {
      binding: row.binding,
      sourceKind: row.sourceKind,
      adapterVersion: `${row.sourceKind}-adapter.1`,
      capabilities: ["read_context"],
      state: "success",
      attemptedAt,
      proposedWatermark: {
        kind: "revision",
        valueDigest: digest(
          `${prior === undefined ? "watermark" : "successor-watermark"}-${index}`,
        ),
        observedThrough: attemptedAt,
      },
      acceptedSourceIdentityDigests:
        row.envelopes.map((sourceEnvelope) => (
          sourceEnvelope.sourceIdentityDigest
        )).sort(),
    });
    const revisions = sourceRevisions.filter((revision) => (
      revision.bindingDigest === row.bindingDigest
    ));
    const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
      ownerScopeDigest: snapshot.ownerScopeDigest,
      bindingDigest: row.bindingDigest,
      sourceRevisions: revisions,
      acceptedSourceIdentityDigests:
        checkpoint.acceptedSourceIdentityDigests,
    });
    return {
      row,
      checkpoint,
      sourceSlice,
      laneId: `collect-${index}`,
    };
  });
  const prepared = prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints:
      checkpoints.map((checkpoint) => checkpoint.checkpoint),
    attemptOutputs: checkpoints.map((checkpoint) => ({
      laneId: checkpoint.laneId,
      checkpointDigest: taskMapContractDigest(checkpoint.checkpoint),
      sourceSliceDigest: checkpoint.sourceSlice.sourceSliceDigest,
    })),
    sourceSliceProofs:
      checkpoints.map((checkpoint) => checkpoint.sourceSlice),
    sourceSnapshot: snapshot,
  });
  const parseMember = <T>(name: keyof typeof prepared.members): T =>
    JSON.parse(prepared.members[name]!) as T;
  const origin: VerifiedTaskMapRefreshRunBundle = {
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
    : (BigInt(prior.currentSnapshot.head!.generation) + 1n)
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
      checkpointDigest: taskMapContractDigest(checkpoint.checkpoint),
      sourceSliceDigest: checkpoint.sourceSlice.sourceSliceDigest,
    };
    return {
      connectorKeyDigest: taskMapContractDigest({
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
  }).sort((left, right) => (
    left.connectorKeyDigest.localeCompare(right.connectorKeyDigest)
  ));
  const refCore: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    generation,
    ...(prior === undefined
      ? {}
      : { predecessorRefId: prior.currentSnapshot.head!.refId }),
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
  const ref = assertTaskMapRefreshCurrentRef({
    ...refCore,
    refId: `tmrefreshcurrent_${taskMapContractDigest(refCore)}`,
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

function blockedGenesisOriginFixture(
  snapshot: TaskMapSourceSnapshotV1,
): PreparedTaskMapRefreshRunBundle {
  const bindingsByDigest = new Map<string, {
    bindingDigest: string;
    binding: TaskMapSourceAuthorityBindingV1;
    sourceKind: TaskMapSourceKind;
    envelopes: TaskMapSourceEnvelopeV1[];
  }>();
  for (const sourceEnvelope of snapshot.envelopes) {
    const bindingDigest = taskMapContractDigest(sourceEnvelope.binding);
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
    .sort((left, right) => left.bindingDigest.localeCompare(
      right.bindingDigest,
    ));
  const failed = bindingRows[0]!;
  const sourceRevisions = snapshot.envelopes.map((sourceEnvelope) => ({
    bindingDigest: taskMapContractDigest(sourceEnvelope.binding),
    sourceIdentityDigest: sourceEnvelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(
      sourceEnvelope.sourceRevision,
    ),
    contentDigest: sourceEnvelope.contentDigest,
  })).sort((left, right) => (
    left.bindingDigest.localeCompare(right.bindingDigest)
    || left.sourceIdentityDigest.localeCompare(
      right.sourceIdentityDigest,
    )
    || left.sourceRevisionDigest.localeCompare(
      right.sourceRevisionDigest,
    )
    || left.contentDigest.localeCompare(right.contentDigest)
  ));
  const plan = buildTaskMapRefreshPlan({
    contractVersion: TASKMAP_REFRESH_PLAN_DRAFT_VERSION,
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
      reviewAttestationVersion:
        TASKMAP_REFRESH_REVIEW_ATTESTATION_VERSION,
      reviewAttestationDigest: digest("blocked-review-attestation"),
      sourceManifestDigest: digest("blocked-source-manifest"),
    },
    sourceBindings: bindingRows.map((row) => ({
      bindingDigest: row.bindingDigest,
      sourceKind: row.sourceKind,
      sourceContractVersion: row.envelopes[0]!.contractVersion,
      adapterVersion: `${row.sourceKind}-adapter.1`,
    })),
    sourceRevisions,
    sourceRevisionSets: revisionSets(
      sourceRevisions,
      bindingRows.map((row) => row.bindingDigest),
    ),
    semanticInputDigests: [snapshot.semanticInputDigest],
    deterministicReplayDigest: digest("blocked-replay"),
    policyBindings: policyBindings(),
    lanes: lanesFor(bindingRows),
  });
  const failedLaneId = "collect-0";
  const failureDigest = digest("blocked-provider-unavailable");
  const batch = selectTaskMapReadyBatch(plan, {
    maxConcurrency: 4,
    laneStates: plan.lanes.map((lane) => (
      lane.laneId === failedLaneId
        ? {
          laneId: lane.laneId,
          status: "failed" as const,
          errorCode: "provider_unavailable" as const,
          errorDetailDigest: failureDigest,
        }
        : {
          laneId: lane.laneId,
          status: "pending" as const,
        }
    )),
  });
  assert.strictEqual(batch.publication.state, "blocked");
  const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
    binding: failed.binding,
    sourceKind: failed.sourceKind,
    adapterVersion: `${failed.sourceKind}-adapter.1`,
    capabilities: ["read_context"],
    state: "failed",
    attemptedAt: GENERATED_AT,
    errorCode: "provider_unavailable",
    errorDetailDigest: failureDigest,
  });
  const sourceSlice = buildTaskMapRefreshRunSourceSliceProof({
    sliceRole: "observed_non_serving",
    ownerScopeDigest: snapshot.ownerScopeDigest,
    bindingDigest: failed.bindingDigest,
    sourceRevisions: [],
    acceptedSourceIdentityDigests: [],
  });
  return prepareTaskMapRefreshRunBundle({
    plan,
    batch,
    connectorCheckpoints: [checkpoint],
    attemptOutputs: [{
      laneId: failedLaneId,
      checkpointDigest: taskMapContractDigest(checkpoint),
      sourceSliceDigest: sourceSlice.sourceSliceDigest,
    }],
    sourceSliceProofs: [sourceSlice],
    sourceSnapshot: snapshot,
  });
}

function aliasesFor(source: SourceFixture): TaskMapIdentityAliasV1[] {
  return [
    {
      identityKind: "work",
      canonicalSourceObjectKeyDigest:
        source.workCanonical.sourceObjectKeyDigest,
      aliasSourceObjectKeyDigest: source.workAlias.sourceObjectKeyDigest,
    },
    {
      identityKind: "session",
      canonicalSourceObjectKeyDigest:
        source.codexRoot.sourceObjectKeyDigest,
      aliasSourceObjectKeyDigest: source.claudeRoot.sourceObjectKeyDigest,
    },
  ];
}

function workBindingsFor(
  projection: TaskMapProjectionV1,
  source: SourceFixture,
): TaskMapProjectionWorkBindingV1[] {
  assert.strictEqual(
    projection.tasks.length,
    source.secondWork === undefined ? 2 : 3,
    taskMapContractCanonicalJson(projection),
  );
  const bindings: TaskMapProjectionWorkBindingV1[] = [
    {
      projectionKind: "task",
      projectionId: projection.tasks[0]!.id,
      sourceEnvelopeId: source.workCanonical.envelopeId,
    },
    {
      projectionKind: "task",
      projectionId: projection.tasks[1]!.id,
      sourceEnvelopeId: source.workAlias.envelopeId,
    },
  ];
  if (source.secondWork !== undefined) {
    const secondary = projection.tasks.find(
      (task) => task.title === "Review the rollback observation",
    );
    assert.ok(secondary);
    bindings.push({
      projectionKind: "task",
      projectionId: secondary.id,
      sourceEnvelopeId: source.secondWork.envelopeId,
    });
  }
  return bindings;
}

function rejectionOnlyWorkBindingsFor(
  projection: TaskMapProjectionV1,
  source: SourceFixture,
): TaskMapProjectionWorkBindingV1[] {
  assert.ok(source.secondWork);
  const primary = projection.tasks.find(
    (task) => task.title === "Ship the bounded identity barrier",
  );
  const mirror = projection.tasks.find(
    (task) => task.title === "Mirror of the bounded identity barrier",
  );
  assert.ok(primary);
  assert.ok(mirror);
  assert.ok(projection.rejections.some((rejection) => (
    rejection.kind === "task"
    && rejection.proposalId === "task-secondary"
  )));
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

function sessionLineageFor(source: SourceFixture): TaskMapSessionLineageV1[] {
  return [
    {
      sessionEnvelopeId: source.codexRoot.envelopeId,
      role: "root",
      workSourceObjectKeyDigest:
        source.workCanonical.sourceObjectKeyDigest,
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

function lifecycleFor(
  source: SourceFixture,
  overrides: Partial<TaskMapLifecycleAdjudicationV1> = {},
): TaskMapLifecycleAdjudicationV1[] {
  return [{
    canonicalSourceObjectKeyDigest: [
      source.workCanonical.sourceObjectKeyDigest,
      source.workAlias.sourceObjectKeyDigest,
    ].sort()[0]!,
    previousState: "absent",
    currentState: "open",
    currentSourceIdentityDigest: source.workCanonical.sourceIdentityDigest,
    adjudicatedDelta: "open",
    ...overrides,
  }];
}

function twoWorkLifecycleFor(
  source: SourceFixture,
  previousPrimary: TaskMapSourceEnvelopeV1,
  includeSecondaryPrior: boolean,
): TaskMapLifecycleAdjudicationV1[] {
  assert.ok(source.secondWork);
  return [
    {
      canonicalSourceObjectKeyDigest: [
        source.workCanonical.sourceObjectKeyDigest,
        source.workAlias.sourceObjectKeyDigest,
      ].sort()[0]!,
      previousState: "open",
      currentState: "open",
      previousSourceIdentityDigest:
        previousPrimary.sourceIdentityDigest,
      currentSourceIdentityDigest:
        source.workCanonical.sourceIdentityDigest,
      adjudicatedDelta: "no_op",
    },
    {
      canonicalSourceObjectKeyDigest:
        source.secondWork.sourceObjectKeyDigest,
      ...(includeSecondaryPrior
        ? {
          previousState: "open" as const,
          previousSourceIdentityDigest:
            source.secondWork.sourceIdentityDigest,
          adjudicatedDelta: "no_op" as const,
        }
        : {
          previousState: "absent" as const,
          adjudicatedDelta: "open" as const,
        }),
      currentState: "open",
      currentSourceIdentityDigest:
        source.secondWork.sourceIdentityDigest,
    },
  ];
}

function validInput(
  options: SourceFixtureOptions & {
    source?: SourceFixture;
    projection?: TaskMapProjectionV1;
    aliases?: TaskMapIdentityAliasV1[];
    workBindings?: TaskMapProjectionWorkBindingV1[];
    sessionLineage?: TaskMapSessionLineageV1[];
    lifecycle?: TaskMapLifecycleAdjudicationV1[];
    replayDigestOverride?: string;
  } = {},
): BuildTaskMapIdentityDedupeProjectionInput & {
  source: SourceFixture;
} {
  const source = options.source ?? sourceFixture(options);
  const projection = options.projection
    ?? projectionFixture(options.includeSecondWork ?? false);
  const workBindings =
    options.workBindings ?? workBindingsFor(projection, source);
  const aliases = options.aliases ?? aliasesFor(source);
  const sessionLineage =
    options.sessionLineage ?? sessionLineageFor(source);
  const lifecycleAdjudications =
    options.lifecycle ?? lifecycleFor(source);
  const origin = originFixture(
    source.snapshot,
    projection,
    {
      workBindings,
      aliases,
      sessionLineage,
      lifecycleAdjudications,
    },
    options.replayDigestOverride,
  );
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

function withoutSource<T extends { source: SourceFixture }>(
  value: T,
): Omit<T, "source"> {
  const { source: _source, ...input } = value;
  return input;
}

function rebindAcceptedOrigin(
  input: BuildTaskMapIdentityDedupeProjectionInput,
): void {
  const origin = originFixture(
    input.sourceSnapshot,
    input.projection,
    {
      aliases: input.aliases,
      workBindings: input.workBindings,
      sessionLineage: input.sessionLineage,
      lifecycleAdjudications: input.lifecycleAdjudications,
    },
  );
  input.acceptedOrigin = origin.origin;
  input.currentSnapshot = origin.currentSnapshot;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rebindSidecarId(
  sidecar: TaskMapIdentityDedupeProjectionV1,
): void {
  const { sidecarId: _sidecarId, ...core } = sidecar;
  sidecar.sidecarId =
    `tmidentityprojection_${taskMapContractDigest(core)}`;
}

function rebindDiffId(
  diff: ReturnType<
    typeof buildTaskMapIdentityDedupeProjection
  >["diff"],
): void {
  const {
    diffId: _diffId,
    contractVersion: _contractVersion,
    ...core
  } = diff;
  diff.diffId = `tmidentitydiff_${taskMapContractDigest(core)}`;
}

function semanticRowsDigestForTest(
  sidecar: TaskMapIdentityDedupeProjectionV1,
): string {
  return taskMapContractDigest({
    contractVersion: sidecar.contractVersion,
    policyVersion: sidecar.policyVersion,
    works: sidecar.works,
    events: sidecar.events,
    lifecycleDeltas: sidecar.lifecycleDeltas,
    rejectedVariants: sidecar.rejectedVariants,
    privacy: sidecar.privacy,
  });
}

function generationOneDiffRowsForTest(
  sidecar: TaskMapIdentityDedupeProjectionV1,
): TaskMapIdentityDedupeProjectionStoreEntryV1["diff"]["added"] {
  const rows: Array<{
    kind: TaskMapIdentityDedupeProjectionStoreEntryV1[
      "diff"
    ]["added"][number]["kind"];
    id: string;
    value: object;
  }> = [{
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
    kind: "work" as const,
    id: value.workId,
    value,
  })), ...sidecar.events.map((value) => ({
    kind: "event" as const,
    id: value.eventId,
    value,
  })), ...sidecar.lifecycleDeltas.map((value) => ({
    kind: "lifecycle_delta" as const,
    id: value.deltaId,
    value,
  })), ...sidecar.rejectedVariants.map((value) => ({
    kind: "rejected_variant" as const,
    id: value.rejectionId,
    value,
  }))];
  return rows
    .sort((left, right) => (
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
    ))
    .map((row) => ({
      kind: row.kind,
      id: row.id,
      afterDigest: taskMapContractDigest(row.value),
    }));
}

function rehashGenerationOneSemanticAttack(
  source: TaskMapIdentityDedupeProjectionStoreEntryV1,
  mutate: (sidecar: TaskMapIdentityDedupeProjectionV1) => void,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  const entry = clone(source);
  assert.strictEqual(entry.generation, FIRST_GENERATION);
  assert.strictEqual(entry.predecessor, null);
  mutate(entry.sidecar);
  entry.sidecar.replayClosure.semanticRowsDigest =
    semanticRowsDigestForTest(entry.sidecar);
  entry.sidecar.origin.replayClosureDigest =
    taskMapContractDigest(entry.sidecar.replayClosure);
  rebindSidecarId(entry.sidecar);
  entry.sidecarId = entry.sidecar.sidecarId;
  entry.sidecarDigest = taskMapContractDigest(entry.sidecar);
  entry.replayClosureDigest =
    entry.sidecar.origin.replayClosureDigest;
  entry.semanticHead = {
    ...entry.semanticHead!,
    sidecarId: entry.sidecarId,
    sidecarDigest: entry.sidecarDigest,
  };
  entry.diff.previousSidecarDigest = taskMapContractDigest(null);
  entry.diff.currentSidecarDigest = entry.sidecarDigest;
  entry.diff.added = generationOneDiffRowsForTest(entry.sidecar);
  entry.diff.removed = [];
  entry.diff.changed = [];
  rebindDiffId(entry.diff);
  entry.diffId = entry.diff.diffId;
  entry.diffDigest = taskMapContractDigest(entry.diff);
  const { entryId: _entryId, ...core } = entry;
  entry.entryId = `tmidentityentry_${taskMapContractDigest(core)}`;
  return assertTaskMapIdentityDedupeStoreEntry(entry) as
    TaskMapIdentityDedupeProjectionStoreEntryV1;
}

function rebuildCurrentRef(
  currentSnapshot: TaskMapRefreshCurrentSnapshotV1,
  mutate: (core: Omit<TaskMapRefreshCurrentRefV1, "refId">) => void,
): TaskMapRefreshCurrentSnapshotV1 {
  const current = currentSnapshot.head!;
  const { refId: _refId, ...core } = clone(current);
  mutate(core);
  const ref = {
    ...core,
    refId: `tmrefreshcurrent_${taskMapContractDigest(core)}`,
  } as TaskMapRefreshCurrentRefV1;
  return {
    status: "healthy",
    head: ref,
    generations: [ref],
    unknownGenerationNames: [],
    unknownObjectNames: [],
  };
}

function continueFromPrevious(
  input: BuildTaskMapIdentityDedupeProjectionInput,
  previousSnapshot: TaskMapRefreshCurrentSnapshotV1,
  previousSidecar: TaskMapIdentityDedupeProjectionV1,
  previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle,
): void {
  const previousRef = previousSnapshot.head!;
  const current = input.currentSnapshot.head!;
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
  const ref = assertTaskMapRefreshCurrentRef({
    ...core,
    refId: `tmrefreshcurrent_${taskMapContractDigest(core)}`,
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

function continueWithVerifiedAcceptedOrigin(
  input: BuildTaskMapIdentityDedupeProjectionInput,
  previousInput: BuildTaskMapIdentityDedupeProjectionInput,
  previousSidecar: TaskMapIdentityDedupeProjectionV1,
  reviewAttestationDigest = REVIEW_ATTESTATION_DIGEST,
): VerifiedTaskMapRefreshRunBundle {
  const origin = originFixture(
    input.sourceSnapshot,
    input.projection,
    {
      aliases: input.aliases,
      workBindings: input.workBindings,
      sessionLineage: input.sessionLineage,
      lifecycleAdjudications: input.lifecycleAdjudications,
    },
    undefined,
    {
      origin: previousInput.acceptedOrigin,
      currentSnapshot: previousInput.currentSnapshot,
      sourceSnapshot: previousInput.sourceSnapshot,
    },
    reviewAttestationDigest,
  );
  input.currentSnapshot = origin.currentSnapshot;
  input.acceptedOrigin = origin.origin;
  input.previousSidecar = previousSidecar;
  input.previousAcceptedOrigin = previousInput.acceptedOrigin;
  return origin.origin;
}

function continueWithInheritedAcceptedGeneration(
  input: BuildTaskMapIdentityDedupeProjectionInput,
  previousSnapshot: TaskMapRefreshCurrentSnapshotV1,
  previousSidecar: TaskMapIdentityDedupeProjectionV1,
  previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle,
  operation: "no_op" | "blocked",
): void {
  const previousRef = previousSnapshot.head!;
  const generation = (BigInt(previousRef.generation) + 1n)
    .toString()
    .padStart(20, "0");
  const attempt = clone(previousRef.attempt!);
  attempt.generation = generation;
  attempt.publicationState = operation;
  const core: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    generation,
    predecessorRefId: previousRef.refId,
    ownerScopeDigest: previousRef.ownerScopeDigest,
    operation,
    attempt,
    accepted: clone(previousRef.accepted!),
    connectorHeads: clone(previousRef.connectorHeads),
    privacy: clone(previousRef.privacy),
  };
  const ref = assertTaskMapRefreshCurrentRef({
    ...core,
    refId: `tmrefreshcurrent_${taskMapContractDigest(core)}`,
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

function continueWithRollbackGeneration(
  input: BuildTaskMapIdentityDedupeProjectionInput,
  previousSnapshot: TaskMapRefreshCurrentSnapshotV1,
  previousSidecar: TaskMapIdentityDedupeProjectionV1,
  previousAcceptedOrigin: VerifiedTaskMapRefreshRunBundle,
  targetGeneration: string,
  targetAcceptedOrigin: VerifiedTaskMapRefreshRunBundle,
): void {
  const previousRef = previousSnapshot.head!;
  const targetRef = previousSnapshot.generations.find(
    (ref) => ref.generation === targetGeneration,
  )!;
  const generation = (BigInt(previousRef.generation) + 1n)
    .toString()
    .padStart(20, "0");
  const core: Omit<TaskMapRefreshCurrentRefV1, "refId"> = {
    contractVersion: TASKMAP_REFRESH_CURRENT_REF_VERSION,
    generation,
    predecessorRefId: previousRef.refId,
    ownerScopeDigest: previousRef.ownerScopeDigest,
    operation: "rollback",
    ...(previousRef.attempt === undefined
      ? {}
      : { attempt: clone(previousRef.attempt) }),
    accepted: clone(targetRef.accepted!),
    connectorHeads: clone(previousRef.connectorHeads),
    rollback: {
      targetGeneration,
      targetRefId: targetRef.refId,
      targetAcceptedStateDigest:
        targetRef.accepted!.acceptedStateDigest,
    },
    privacy: clone(previousRef.privacy),
  };
  const ref = assertTaskMapRefreshCurrentRef({
    ...core,
    refId: `tmrefreshcurrent_${taskMapContractDigest(core)}`,
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

describe("Task Map P10.2 identity/dedupe projection", () => {
  it("closes a healthy active P10.1C origin to the exact source snapshot and projection replay", () => {
    const built = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    assert.strictEqual(
      built.sidecar.contractVersion,
      TASKMAP_IDENTITY_DEDUPE_PROJECTION_VERSION,
    );
    assert.strictEqual(built.sidecar.works.length, 1);
    assert.strictEqual(built.sidecar.works[0]!.projectionReferences.length, 2);
    assert.strictEqual(
      built.sidecar.origin.replayClosureDigest,
      taskMapContractDigest(built.sidecar.replayClosure),
    );
    assert.deepStrictEqual(assertTaskMapIdentityDedupeProjection(
      built.sidecar,
    ), built.sidecar);
    assert.deepStrictEqual(assertTaskMapIdentityDedupeDiff(built.diff), built.diff);
  });

  it("domain-binds every semantic row class and rejects the superseded pre-anchor schema", () => {
    const baseline = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    ).sidecar;
    const baselineDigest = semanticRowsDigestForTest(baseline);
    const mutations: Array<(sidecar: TaskMapIdentityDedupeProjectionV1) => void> = [
      (sidecar) => {
        sidecar.works[0]!.variantSourceIdentityDigests[0] =
          digest("semantic-work-rehash");
      },
      (sidecar) => {
        const meeting = sidecar.events.find(
          (event) => event.eventKind === "meeting",
        );
        if (meeting === undefined || meeting.eventKind !== "meeting") {
          assert.fail("expected meeting row");
        }
        meeting.reviewState = meeting.reviewState === "resolved"
          ? "needs_review"
          : "resolved";
      },
      (sidecar) => {
        sidecar.lifecycleDeltas[0]!.adjudicationDigest =
          digest("semantic-lifecycle-rehash");
      },
      (sidecar) => {
        sidecar.rejectedVariants[0]!.proofDigest =
          digest("semantic-rejection-rehash");
      },
      (sidecar) => {
        (
          sidecar.privacy as {
            sourceBodiesStored: boolean;
          }
        ).sourceBodiesStored = true;
      },
    ];
    for (const mutate of mutations) {
      const changed = clone(baseline);
      mutate(changed);
      assert.notStrictEqual(
        semanticRowsDigestForTest(changed),
        baselineDigest,
      );
    }

    const staleAnchor = clone(baseline);
    delete (
      staleAnchor.replayClosure as Partial<
        TaskMapIdentityDedupeProjectionV1["replayClosure"]
      >
    ).semanticRowsDigest;
    assert.throws(
      () => assertTaskMapIdentityDedupeProjection(staleAnchor),
      /missing=semanticRowsDigest/,
    );
  });

  it("uses the production entrypoint to read P10.1C and verify the immutable P10.1B origin from owner stores", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-store-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
      const input = validInput();
      await assert.rejects(
        buildTaskMapIdentityDedupeProjectionFromStore({
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
        } as unknown as Parameters<
          typeof buildTaskMapIdentityDedupeProjectionFromStore
        >[0]),
        /invalid fields/,
      );
      const origin = originFixture(
        input.sourceSnapshot,
        input.projection,
        {
          aliases: input.aliases,
          workBindings: input.workBindings,
          sessionLineage: input.sessionLineage,
          lifecycleAdjudications: input.lifecycleAdjudications,
        },
      );
      const materialized = await materializeTaskMapRefreshRunBundle(
        runRoot,
        origin.prepared,
      );
      assert.strictEqual(materialized.status, "created");
      const published = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: origin.prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
          operationToken: "10101010101010101010101010101010",
        },
      });
      assert.strictEqual(published.status, "published");
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
        ),
        /not caught up to the P10\.1 head/,
      );
      const built = await buildTaskMapIdentityDedupeProjectionFromStore({
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
      assert.strictEqual(
        built.sidecar.origin.currentRefId,
        published.ref.refId,
      );
      assert.strictEqual(
        built.sidecar.origin.bundleId,
        origin.prepared.bundleId,
      );
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
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
          {
            faultInjection: (point) => {
              if (point === "after_stage_partial_write") {
                throw new Error("synthetic interrupted partial write");
              }
            },
          },
        ),
        /synthetic interrupted partial write/,
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot)),
        /recovery is required/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "11".repeat(32),
        abandonWriterClaims: true,
        externalExclusivityAsserted: true,
      });
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
          {
            faultInjection: async (point) => {
              if (point === "after_stage_sync") {
                const beforeRecovery = await readdir(
                  path.join(sidecarRoot, "staging"),
                );
                await assert.rejects(
                  recoverTaskMapIdentityDedupeProjectionStore(
                    identityStoreRoots(currentRoot, runRoot, sidecarRoot),
                    { operationToken: "22".repeat(32) },
                  ),
                  /refuses active writer claims/,
                );
                assert.deepStrictEqual(
                  await readdir(path.join(sidecarRoot, "staging")),
                  beforeRecovery,
                );
                throw new Error("synthetic interrupted stage");
              }
            },
          },
        ),
        /synthetic interrupted stage/,
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot)),
        /recovery is required/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "33".repeat(32),
        abandonWriterClaims: true,
        externalExclusivityAsserted: true,
      });
      assert.deepStrictEqual(
        await unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest(
          sidecarRoot,
        ),
        {
          entries: [],
          canonicalByteLength: 0,
          remainingByteCapacity:
            TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes,
        },
      );
      const claimsRoot = path.join(sidecarRoot, "claims");
      const recoveryClaimPath = path.join(
        claimsRoot,
        "recovery.claim",
      );
      await writeFile(recoveryClaimPath, "", { mode: 0o600 });
      await chmod(recoveryClaimPath, 0o000);
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
          operationToken: "77".repeat(32),
        }),
        /recovery claim is already active/,
      );
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
        ),
        /recovery claim is not fully materialized/,
      );
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
          operationToken: "77".repeat(32),
          takeOverRecoveryClaim: true,
        }),
        /requires external exclusivity assertion/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "77".repeat(32),
        takeOverRecoveryClaim: true,
        externalExclusivityAsserted: true,
      });
      let recoveryGetterInvoked = false;
      const getterOptions = Object.defineProperty(
        {},
        "operationToken",
        {
          enumerable: true,
          get() {
            recoveryGetterInvoked = true;
            return "78".repeat(32);
          },
        },
      );
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
          getterOptions as {
            operationToken: string;
          },
        ),
        /unknown or executable fields/,
      );
      assert.strictEqual(recoveryGetterInvoked, false);
      const abandonedToken = "ab".repeat(32);
      const abandonedClaimPath = path.join(
        claimsRoot,
        `writer_${abandonedToken}.claim`,
      );
      const abandonedAdmissionPath = path.join(
        claimsRoot,
        "writer-admission.claim",
      );
      const abandonedStagePath = path.join(
        sidecarRoot,
        "staging",
        `stage_${abandonedToken}.json`,
      );
      await writeFile(abandonedClaimPath, "", { mode: 0o600 });
      await writeFile(abandonedAdmissionPath, "", { mode: 0o600 });
      await writeFile(abandonedStagePath, "", { mode: 0o600 });
      await chmod(abandonedClaimPath, 0o000);
      await chmod(abandonedAdmissionPath, 0o000);
      await chmod(abandonedStagePath, 0o000);
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
          operationToken: "79".repeat(32),
        }),
        /refuses active writer claims/,
      );
      assert.strictEqual((await lstat(abandonedClaimPath)).isFile(), true);
      assert.strictEqual(
        (await lstat(abandonedAdmissionPath)).isFile(),
        true,
      );
      assert.strictEqual((await lstat(abandonedStagePath)).isFile(), true);
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
          {
            operationToken: "7a".repeat(32),
            abandonWriterClaims: true,
            externalExclusivityAsserted: true,
          },
        ),
        /no exact durable writer-journal binding/,
      );
      assert.strictEqual((await lstat(abandonedClaimPath)).isFile(), true);
      assert.strictEqual(
        (await lstat(abandonedAdmissionPath)).isFile(),
        true,
      );
      assert.strictEqual((await lstat(abandonedStagePath)).isFile(), true);
      await unlink(abandonedStagePath);
      await unlink(abandonedClaimPath);
      await unlink(abandonedAdmissionPath);
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
          {
            faultInjection: async (point) => {
              if (point !== "after_stage_sync") return;
              const stagingRoot = path.join(sidecarRoot, "staging");
              const [stageName] = await readdir(stagingRoot);
              assert.ok(stageName?.startsWith("stage_"));
              const stagePath = path.join(stagingRoot, stageName);
              const replacementPath = path.join(
                stagingRoot,
                "replacement.tmp",
              );
              const bytes = await readFile(stagePath);
              await writeFile(replacementPath, bytes, { mode: 0o600 });
              await chmod(replacementPath, 0o600);
              await rename(replacementPath, stagePath);
            },
          },
        ),
        /staged entry changed before generation CAS/,
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot)),
        /recovery is required/,
      );
      const [replacedStageName] = await readdir(
        path.join(sidecarRoot, "staging"),
      );
      assert.match(replacedStageName!, /^stage_[0-9a-f]{64}\.json$/);
      const replacedStagePath = path.join(
        sidecarRoot,
        "staging",
        replacedStageName!,
      );
      const replacedWriterClaimPath = path.join(
        claimsRoot,
        `writer_${replacedStageName!.slice(6, -5)}.claim`,
      );
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
          {
            operationToken: "34".repeat(32),
            abandonWriterClaims: true,
            externalExclusivityAsserted: true,
          },
        ),
        /no exact durable writer-journal binding/,
      );
      assert.strictEqual((await lstat(replacedStagePath)).isFile(), true);
      assert.strictEqual(
        (await lstat(replacedWriterClaimPath)).isFile(),
        true,
      );
      await unlink(replacedStagePath);
      await unlink(replacedWriterClaimPath);
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
          {
            faultInjection: async (point) => {
              if (point !== "after_stage_sync") return;
              const stagingRoot = path.join(sidecarRoot, "staging");
              const [stageName] = await readdir(stagingRoot);
              assert.ok(stageName?.startsWith("stage_"));
              const stagePath = path.join(stagingRoot, stageName);
              const bytes = await readFile(stagePath);
              bytes[Math.floor(bytes.byteLength / 2)] = 0x80;
              await writeFile(stagePath, bytes);
              await chmod(stagePath, 0o600);
            },
          },
        ),
        /not valid UTF-8/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "35".repeat(32),
        abandonWriterClaims: true,
        externalExclusivityAsserted: true,
      });
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstArrived!: () => void;
      const firstArrival = new Promise<void>((resolve) => {
        firstArrived = resolve;
      });
      const priorUmask = process.umask(0o777);
      let firstPublication;
      let retryPublication;
      const firstPromise =
        buildAndPublishTaskMapIdentityDedupeProjection(
          { ...publicationInput },
          {
            faultInjection: async (point) => {
              if (point !== "after_stage_sync") return;
              firstArrived();
              await firstGate;
            },
          },
        );
      try {
        await firstArrival;
        await assert.rejects(
          buildAndPublishTaskMapIdentityDedupeProjection(
            { ...publicationInput },
          ),
          /recovery is required/,
        );
        assert.strictEqual(
          (await readdir(path.join(sidecarRoot, "staging"))).length,
          TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries,
        );
        releaseFirst();
        firstPublication = await firstPromise;
        retryPublication =
          await buildAndPublishTaskMapIdentityDedupeProjection(
            { ...publicationInput },
          );
        assert.deepStrictEqual(
          await readdir(path.join(sidecarRoot, "staging")),
          [],
        );
        assert.deepStrictEqual(
          await readdir(path.join(sidecarRoot, "claims")),
          [],
        );
      } finally {
        releaseFirst();
        await firstPromise.catch(() => undefined);
        process.umask(priorUmask);
      }
      assert.deepStrictEqual(
        [
          firstPublication.publication.status,
          retryPublication.publication.status,
        ].sort(),
        ["already_published", "published"],
      );
      const committed = firstPublication;
      assert.strictEqual(committed.publication.status, "published");
      assert.strictEqual(
        Number((
          await lstat(path.join(
            sidecarRoot,
            "generations",
            `${FIRST_GENERATION}.entry.json`,
          ))
        ).mode & 0o777),
        0o600,
      );
      assert.deepStrictEqual(
        assertTaskMapIdentityDedupeStoreEntry(
          committed.publication.entry,
        ),
        committed.publication.entry,
      );
      const store = await readTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, sidecarRoot),
      );
      assert.strictEqual(store.entries.length, 1);
      assert.strictEqual(
        store.entries[0]!.currentRefId,
        published.ref.refId,
      );
      const exactRetry =
        await buildAndPublishTaskMapIdentityDedupeProjection({
          ...publicationInput,
        });
      assert.strictEqual(
        exactRetry.publication.status,
        "already_published",
      );
      const hookMutationRoot = path.join(
        parent,
        "post-link-hook-mutation-sidecars",
      );
      await mkdir(hookMutationRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, hookMutationRoot),
      );
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          {
            ...publicationInput,
            sidecarRoot: hookMutationRoot,
          },
          {
            faultInjection: async (point) => {
              if (point !== "after_generation_link") return;
              const stagingRoot = path.join(hookMutationRoot, "staging");
              const [stageName] = await readdir(stagingRoot);
              assert.ok(stageName?.startsWith("stage_"));
              const stagePath = path.join(stagingRoot, stageName);
              const bytes = await readFile(stagePath);
              bytes[bytes.byteLength - 1] ^= 1;
              await writeFile(stagePath, bytes);
            },
          },
        ),
        /not valid JSON|not exact canonical JSON|exact staged hardlink peer/,
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, hookMutationRoot),
        ),
        /recovery is required|not valid JSON|not exact canonical JSON/,
      );
      const semanticAttackRoot = path.join(
        parent,
        "coordinated-semantic-rehash-sidecars",
      );
      await mkdir(semanticAttackRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, semanticAttackRoot),
      );
      const semanticAttackPublication =
        await buildAndPublishTaskMapIdentityDedupeProjection({
          ...publicationInput,
          sidecarRoot: semanticAttackRoot,
        });
      if (semanticAttackPublication.publication.entry.entryKind
        !== "projection") {
        assert.fail("expected a projection store entry");
      }
      const coordinatedSemanticAttack =
        rehashGenerationOneSemanticAttack(
          semanticAttackPublication.publication.entry,
          (sidecar) => {
            const meeting = sidecar.events.find(
              (event) => event.eventKind === "meeting",
            );
            if (meeting === undefined || meeting.eventKind !== "meeting") {
              assert.fail("expected a meeting event");
            }
            meeting.reviewState = meeting.reviewState === "resolved"
              ? "needs_review"
              : "resolved";
          },
        );
      await writeFile(
        path.join(
          semanticAttackRoot,
          "generations",
          `${FIRST_GENERATION}.entry.json`,
        ),
        taskMapContractCanonicalJson(coordinatedSemanticAttack),
        { encoding: "utf8", mode: 0o600 },
      );
      const structurallyValidAttack =
        await unsafeReadTaskMapIdentityDedupeProjectionStoreStructuralForTest(
          semanticAttackRoot,
        );
      assert.strictEqual(structurallyValidAttack.entries.length, 1);
      assert.deepStrictEqual(
        structurallyValidAttack.entries[0],
        coordinatedSemanticAttack,
      );
      for (const operation of [
        () => readTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, semanticAttackRoot),
        ),
        () => buildTaskMapIdentityDedupeProjectionFromStore({
          ...publicationInput,
          sidecarRoot: semanticAttackRoot,
        }),
        () => buildAndPublishTaskMapIdentityDedupeProjection({
          ...publicationInput,
          sidecarRoot: semanticAttackRoot,
        }),
        () => backfillTaskMapIdentityDedupeProjectionGeneration({
          ...publicationInput,
          sidecarRoot: semanticAttackRoot,
          targetGeneration: FIRST_GENERATION,
        }),
      ]) {
        await assert.rejects(
          operation(),
          /not bound to its accepted P10\.1 ref|does not close to the immediate predecessor bundle/,
        );
      }
      const tamperedEntry = clone(store.entries[0]!);
      if (tamperedEntry.entryKind !== "projection") {
        assert.fail("expected a projection store entry");
      }
      tamperedEntry.diff.added.pop();
      rebindDiffId(tamperedEntry.diff);
      tamperedEntry.diffId = tamperedEntry.diff.diffId;
      tamperedEntry.diffDigest =
        taskMapContractDigest(tamperedEntry.diff);
      const {
        entryId: _entryId,
        ...tamperedEntryCore
      } = tamperedEntry;
      tamperedEntry.entryId =
        `tmidentityentry_${taskMapContractDigest(tamperedEntryCore)}`;
      assert.deepStrictEqual(
        assertTaskMapIdentityDedupeStoreEntry(tamperedEntry),
        tamperedEntry,
      );
      await writeFile(
        path.join(
          sidecarRoot,
          "generations",
          `${FIRST_GENERATION}.entry.json`,
        ),
        taskMapContractCanonicalJson(tamperedEntry),
        "utf8",
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot)),
        /diff is not derived from semantic history/,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("preserves the exact stage and writer claim at every normal cleanup site when the pathname inode is replaced", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-exact-unlink-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      const input = validInput();
      const origin = originFixture(
        input.sourceSnapshot,
        input.projection,
        {
          aliases: input.aliases,
          workBindings: input.workBindings,
          sessionLineage: input.sessionLineage,
          lifecycleAdjudications: input.lifecycleAdjudications,
        },
      );
      await materializeTaskMapRefreshRunBundle(runRoot, origin.prepared);
      await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: origin.prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
          operationToken: "91919191919191919191919191919191",
        },
      });
      const publicationInputFor = (sidecarRoot: string) => ({
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
      const replaceCurrentStage = async (sidecarRoot: string) => {
        const stagingRoot = path.join(sidecarRoot, "staging");
        const stageNames = await readdir(stagingRoot);
        assert.strictEqual(stageNames.length, 1);
        const stageName = stageNames[0]!;
        assert.match(stageName, /^stage_[0-9a-f]{64}\.json$/);
        const stagePath = path.join(stagingRoot, stageName);
        const replacementPath = path.join(stagingRoot, "replacement.tmp");
        await writeFile(
          replacementPath,
          await readFile(stagePath),
          { mode: 0o600 },
        );
        await chmod(replacementPath, 0o600);
        await rename(replacementPath, stagePath);
        const token = stageName.slice(6, -5);
        return {
          stagePath,
          claimPath: path.join(
            sidecarRoot,
            "claims",
            `writer_${token}.claim`,
          ),
          replacementInode: (await lstat(stagePath, { bigint: true })).ino,
        };
      };
      const assertExactResidue = async (
        residue: Awaited<ReturnType<typeof replaceCurrentStage>>,
      ) => {
        assert.strictEqual(
          (await lstat(residue.stagePath, { bigint: true })).ino,
          residue.replacementInode,
        );
        assert.strictEqual((await lstat(residue.claimPath)).isFile(), true);
      };

      const preJournalRoot = path.join(parent, "pre-journal-sidecars");
      await mkdir(preJournalRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, preJournalRoot),
      );
      let preJournalResidue:
        Awaited<ReturnType<typeof replaceCurrentStage>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(preJournalRoot),
          {
            faultInjection: async (point) => {
              if (point !== "before_stage_journal_bind") return;
              preJournalResidue = await replaceCurrentStage(preJournalRoot);
              throw new Error("synthetic pre-journal cleanup failure");
            },
          },
        ),
        /synthetic pre-journal cleanup failure/,
      );
      assert.ok(preJournalResidue);
      await assertExactResidue(preJournalResidue);

      const capacityRoot = path.join(parent, "capacity-sidecars");
      await mkdir(capacityRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, capacityRoot),
      );
      let capacityResidue:
        Awaited<ReturnType<typeof replaceCurrentStage>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(capacityRoot),
          {
            faultInjection: async (point) => {
              if (point !== "after_stage_sync") return;
              capacityResidue = await replaceCurrentStage(capacityRoot);
              await writeFile(
                path.join(
                  capacityRoot,
                  "generations",
                  "unexpected.entry",
                ),
                "",
                { mode: 0o600 },
              );
            },
          },
        ),
        /explicit recovery is required/,
      );
      assert.ok(capacityResidue);
      await assertExactResidue(capacityResidue);

      const beforeCasRoot = path.join(parent, "before-cas-sidecars");
      await mkdir(beforeCasRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, beforeCasRoot),
      );
      let beforeCasResidue:
        Awaited<ReturnType<typeof replaceCurrentStage>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(beforeCasRoot),
          {
            faultInjection: async (point) => {
              if (point !== "before_generation_cas") return;
              beforeCasResidue = await replaceCurrentStage(beforeCasRoot);
              throw new Error("synthetic pre-CAS failure");
            },
          },
        ),
        /explicit recovery is required/,
      );
      assert.ok(beforeCasResidue);
      await assertExactResidue(beforeCasResidue);

      const swapGenerationsDirectory = async (
        sidecarRoot: string,
        detachedName: string,
      ) => {
        const generationsRoot = path.join(sidecarRoot, "generations");
        const detachedRoot = path.join(parent, detachedName);
        await rename(generationsRoot, detachedRoot);
        await mkdir(generationsRoot, { mode: 0o700 });
        return { generationsRoot, detachedRoot };
      };

      const preLinkParentSwapRoot = path.join(
        parent,
        "pre-link-parent-swap-sidecars",
      );
      await mkdir(preLinkParentSwapRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, preLinkParentSwapRoot),
      );
      let preLinkParentSwap:
        Awaited<ReturnType<typeof swapGenerationsDirectory>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(preLinkParentSwapRoot),
          {
            faultInjection: async (point) => {
              if (point !== "before_generation_cas") return;
              preLinkParentSwap = await swapGenerationsDirectory(
                preLinkParentSwapRoot,
                "pre-link-parent-swap-detached-generations",
              );
            },
          },
        ),
        /generations directory was replaced after validation/,
      );
      assert.ok(preLinkParentSwap);
      assert.deepStrictEqual(
        await readdir(preLinkParentSwap.generationsRoot),
        [],
      );
      assert.deepStrictEqual(
        await readdir(preLinkParentSwap.detachedRoot),
        [],
      );
      assert.deepStrictEqual(
        await readdir(path.join(preLinkParentSwapRoot, "staging")),
        [],
      );
      assert.deepStrictEqual(
        await readdir(path.join(preLinkParentSwapRoot, "claims")),
        [],
      );

      const linkWindowParentSwapRoot = path.join(
        parent,
        "link-window-parent-swap-sidecars",
      );
      await mkdir(linkWindowParentSwapRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, linkWindowParentSwapRoot),
      );
      let linkWindowParentSwap:
        Awaited<ReturnType<typeof swapGenerationsDirectory>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(linkWindowParentSwapRoot),
          {
            faultInjection: async (point) => {
              if (point !== "after_generation_parent_check") return;
              linkWindowParentSwap = await swapGenerationsDirectory(
                linkWindowParentSwapRoot,
                "link-window-parent-swap-detached-generations",
              );
            },
          },
        ),
        /generations directory was replaced after validation/,
      );
      assert.ok(linkWindowParentSwap);
      assert.deepStrictEqual(
        await readdir(linkWindowParentSwap.generationsRoot),
        [],
      );
      assert.deepStrictEqual(
        await readdir(linkWindowParentSwap.detachedRoot),
        [],
      );
      assert.deepStrictEqual(
        await readdir(path.join(linkWindowParentSwapRoot, "staging")),
        [],
      );
      assert.deepStrictEqual(
        await readdir(path.join(linkWindowParentSwapRoot, "claims")),
        [],
      );

      const existingRoot = path.join(parent, "existing-sidecars");
      await mkdir(existingRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, existingRoot),
      );
      let existingResidue:
        Awaited<ReturnType<typeof replaceCurrentStage>> | undefined;
      let plantedExistingGeneration = false;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(existingRoot),
          {
            faultInjection: async (point) => {
              if (point === "before_generation_cas") {
                const stagingRoot = path.join(existingRoot, "staging");
                const [stageName] = await readdir(stagingRoot);
                assert.ok(stageName);
                await writeFile(
                  path.join(
                    existingRoot,
                    "generations",
                    `${FIRST_GENERATION}.entry.json`,
                  ),
                  await readFile(path.join(stagingRoot, stageName)),
                  { mode: 0o600 },
                );
                plantedExistingGeneration = true;
              }
              if (point === "before_existing_stage_cleanup") {
                existingResidue = await replaceCurrentStage(existingRoot);
              }
            },
          },
        ),
        /explicit recovery is required/,
      );
      assert.strictEqual(plantedExistingGeneration, true);
      assert.ok(existingResidue);
      await assertExactResidue(existingResidue);

      const finalRoot = path.join(parent, "final-sidecars");
      await mkdir(finalRoot, { mode: 0o700 });
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, finalRoot),
      );
      let finalResidue:
        Awaited<ReturnType<typeof replaceCurrentStage>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(finalRoot),
          {
            faultInjection: async (point) => {
              if (point !== "before_stage_cleanup") return;
              finalResidue = await replaceCurrentStage(finalRoot);
            },
          },
        ),
        /explicit recovery is required/,
      );
      assert.ok(finalResidue);
      await assertExactResidue(finalResidue);
      assert.strictEqual(
        (
          await lstat(path.join(
            finalRoot,
            "generations",
            `${FIRST_GENERATION}.entry.json`,
          ))
        ).isFile(),
        true,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects overlapping P10.1/P10.2 roots before contaminating reservations", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-root-isolation-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      const reservationsRoot = path.join(currentRoot, "reservations");
      const reservationsAlias = path.join(parent, "reservations-alias");
      await symlink(reservationsRoot, reservationsAlias);
      for (const contaminatedSidecarRoot of [
        reservationsRoot,
        path.join(currentRoot, "..", "current", "reservations"),
        `${reservationsRoot}${path.sep}`,
        reservationsAlias,
      ]) {
        await assert.rejects(
          initializeTaskMapIdentityDedupeProjectionStore(
            identityStoreRoots(
              currentRoot,
              runRoot,
              contaminatedSidecarRoot,
            ),
          ),
          /store roots must be realpath-disjoint/,
        );
        assert.deepStrictEqual(await readdir(reservationsRoot), []);
      }
      const nestedRunRoot = path.join(currentRoot, "nested-run");
      await mkdir(nestedRunRoot, { mode: 0o700 });
      await assert.rejects(
        initializeTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, nestedRunRoot, sidecarRoot),
        ),
        /currentRoot overlaps runRoot/,
      );
      assert.deepStrictEqual(await readdir(sidecarRoot), []);
      await assert.rejects(
        initializeTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, parent),
        ),
        /store roots must be realpath-disjoint/,
      );
      assert.deepStrictEqual(await readdir(sidecarRoot), []);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("revalidates roots on an already-published no-op retry after a release-gated swap", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-root-swap-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, sidecarRoot),
      );
      const input = validInput();
      const origin = originFixture(
        input.sourceSnapshot,
        input.projection,
        {
          aliases: input.aliases,
          workBindings: input.workBindings,
          sessionLineage: input.sessionLineage,
          lifecycleAdjudications: input.lifecycleAdjudications,
        },
      );
      await materializeTaskMapRefreshRunBundle(runRoot, origin.prepared);
      await publishTaskMapRefreshRunCurrent({
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
      const published =
        await buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInput,
        );
      assert.strictEqual(published.publication.status, "published");

      let releaseRetry!: () => void;
      const retryGate = new Promise<void>((resolve) => {
        releaseRetry = resolve;
      });
      let retryArrived!: () => void;
      const retryArrival = new Promise<void>((resolve) => {
        retryArrived = resolve;
      });
      const retry = buildAndPublishTaskMapIdentityDedupeProjection(
        publicationInput,
        {
          faultInjection: async (point) => {
            if (point !== "before_retry_revalidation") return;
            retryArrived();
            await retryGate;
          },
        },
      );
      await retryArrival;
      const detachedRoot = path.join(parent, "detached-sidecars");
      await rename(sidecarRoot, detachedRoot);
      await mkdir(sidecarRoot, { mode: 0o700 });
      releaseRetry();
      await assert.rejects(
        retry,
        /sidecarRoot was replaced after store-root isolation/,
      );
      assert.deepStrictEqual(await readdir(sidecarRoot), []);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("preflights bounded recovery options and preserves unbound or unvalidated residue", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-recovery-preflight-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      const roots = identityStoreRoots(currentRoot, runRoot, sidecarRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(roots);
      const claimsRoot = path.join(sidecarRoot, "claims");
      let wideGetterInvoked = false;
      for (const kind of ["enumerable", "non_enumerable", "symbol"] as const) {
        const options: Record<PropertyKey, unknown> = {};
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
        await assert.rejects(
          recoverTaskMapIdentityDedupeProjectionStore(
            roots,
            options as unknown as { operationToken: string },
          ),
          /unknown or executable fields/,
        );
      }
      assert.strictEqual(wideGetterInvoked, false);
      assert.deepStrictEqual(await readdir(claimsRoot), []);

      const unboundToken = "bc".repeat(32);
      const unboundStagePath = path.join(
        sidecarRoot,
        "staging",
        `stage_${unboundToken}.json`,
      );
      await writeFile(unboundStagePath, "", { mode: 0o600 });
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(roots, {
          operationToken: "82".repeat(32),
        }),
        /no exact durable writer-journal binding/,
      );
      assert.strictEqual((await lstat(unboundStagePath)).isFile(), true);
      await unlink(unboundStagePath);

      const boundToken = "cd".repeat(32);
      const boundStagePath = path.join(
        sidecarRoot,
        "staging",
        `stage_${boundToken}.json`,
      );
      const boundClaimPath = path.join(
        claimsRoot,
        `writer_${boundToken}.claim`,
      );
      await writeFile(boundStagePath, "", { mode: 0o600 });
      const boundStageStats = await lstat(boundStagePath, { bigint: true });
      await writeFile(
        boundClaimPath,
        taskMapContractCanonicalJson({
          contractVersion: "taskmap-identity-dedupe-writer-journal.v1",
          writerToken: boundToken,
          stageFileName: `stage_${boundToken}.json`,
          stageDevice: boundStageStats.dev.toString(),
          stageInode: boundStageStats.ino.toString(),
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      const invalidGenerationPath = path.join(
        sidecarRoot,
        "generations",
        `${FIRST_GENERATION}.entry.json`,
      );
      await writeFile(
        invalidGenerationPath,
        "{}",
        { encoding: "utf8", mode: 0o600 },
      );
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(roots, {
          operationToken: "83".repeat(32),
          abandonWriterClaims: true,
          externalExclusivityAsserted: true,
        }),
        /sidecar store entry|invalid fields|unsupported kind/,
      );
      assert.strictEqual((await lstat(boundStagePath)).isFile(), true);
      assert.strictEqual((await lstat(boundClaimPath)).isFile(), true);
      await unlink(invalidGenerationPath);
      await recoverTaskMapIdentityDedupeProjectionStore(roots, {
        operationToken: "84".repeat(32),
        abandonWriterClaims: true,
        externalExclusivityAsserted: true,
      });
      await assert.rejects(lstat(boundStagePath), /ENOENT/);
      await assert.rejects(lstat(boundClaimPath), /ENOENT/);

      const replacedRecoveryToken = "de".repeat(32);
      const replacedRecoveryStagePath = path.join(
        sidecarRoot,
        "staging",
        `stage_${replacedRecoveryToken}.json`,
      );
      const replacedRecoveryClaimPath = path.join(
        claimsRoot,
        `writer_${replacedRecoveryToken}.claim`,
      );
      await writeFile(
        replacedRecoveryStagePath,
        Buffer.from([0x80]),
        { mode: 0o600 },
      );
      const replacedRecoveryStageStats = await lstat(
        replacedRecoveryStagePath,
        { bigint: true },
      );
      await writeFile(
        replacedRecoveryClaimPath,
        taskMapContractCanonicalJson({
          contractVersion: "taskmap-identity-dedupe-writer-journal.v1",
          writerToken: replacedRecoveryToken,
          stageFileName: `stage_${replacedRecoveryToken}.json`,
          stageDevice: replacedRecoveryStageStats.dev.toString(),
          stageInode: replacedRecoveryStageStats.ino.toString(),
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      let replacementInode: bigint | undefined;
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          roots,
          {
            operationToken: "85".repeat(32),
            abandonWriterClaims: true,
            externalExclusivityAsserted: true,
          },
          {
            faultInjection: async (point) => {
              if (point !== "before_recovery_stage_cleanup") return;
              const replacementPath = path.join(
                sidecarRoot,
                "staging",
                "recovery-replacement.tmp",
              );
              await writeFile(
                replacementPath,
                Buffer.from([0x80]),
                { mode: 0o600 },
              );
              await rename(
                replacementPath,
                replacedRecoveryStagePath,
              );
              replacementInode = (
                await lstat(replacedRecoveryStagePath, { bigint: true })
              ).ino;
            },
          },
        ),
        /explicit recovery is required/,
      );
      assert.ok(replacementInode !== undefined);
      assert.strictEqual(
        (await lstat(replacedRecoveryStagePath, { bigint: true })).ino,
        replacementInode,
      );
      assert.strictEqual(
        (await lstat(replacedRecoveryClaimPath)).isFile(),
        true,
      );
      await unlink(replacedRecoveryStagePath);
      await unlink(replacedRecoveryClaimPath);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("guards every sidecar pathname mutation against deterministic root replacement", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-root-swap-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      const input = validInput();
      const origin = originFixture(
        input.sourceSnapshot,
        input.projection,
        {
          aliases: input.aliases,
          workBindings: input.workBindings,
          sessionLineage: input.sessionLineage,
          lifecycleAdjudications: input.lifecycleAdjudications,
        },
      );
      await materializeTaskMapRefreshRunBundle(runRoot, origin.prepared);
      await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: origin.prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
          operationToken: "92929292929292929292929292929292",
        },
      });
      const publicationInputFor = (sidecarRoot: string) => ({
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
      const snapshotTree = async (
        root: string,
        includeFileContents = true,
      ): Promise<Array<Record<string, string>>> => {
        const result: Array<Record<string, string>> = [];
        const walk = async (
          directory: string,
          relativeDirectory: string,
        ): Promise<void> => {
          const names = (await readdir(directory)).sort();
          for (const name of names) {
            const entryPath = path.join(directory, name);
            const relativePath = path.join(relativeDirectory, name);
            const stats = await lstat(entryPath, { bigint: true });
            const entry: Record<string, string> = {
              path: relativePath,
              kind: stats.isDirectory() ? "directory" : "file",
              device: stats.dev.toString(),
              inode: stats.ino.toString(),
              mode: (stats.mode & 0o777n).toString(8),
              links: stats.nlink.toString(),
            };
            if (stats.isDirectory()) {
              result.push(entry);
              await walk(entryPath, relativePath);
            } else {
              if (includeFileContents) {
                const bytes = await readFile(entryPath);
                entry.size = stats.size.toString();
                entry.digest = createHash("sha256")
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
      const createInitializedRoot = async (
        label: string,
      ): Promise<string> => {
        const sidecarRoot = path.join(parent, `${label}-sidecars`);
        await mkdir(sidecarRoot, { mode: 0o700 });
        await initializeTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
        );
        return sidecarRoot;
      };
      const replaceWholeRoot = async (
        sidecarRoot: string,
        label: string,
        initializeReplacement = true,
      ) => {
        const detachedRoot = path.join(parent, `${label}-detached`);
        await rename(sidecarRoot, detachedRoot);
        await mkdir(sidecarRoot, { mode: 0o700 });
        if (initializeReplacement) {
          for (const name of ["claims", "generations", "staging"]) {
            await mkdir(path.join(sidecarRoot, name), { mode: 0o700 });
          }
        }
        return {
          detachedRoot,
          replacementRoot: sidecarRoot,
          exactAtSwap: await snapshotTree(detachedRoot),
          namespaceAtSwap: await snapshotTree(detachedRoot, false),
        };
      };
      const replaceChildDirectory = async (
        sidecarRoot: string,
        childName: "claims" | "generations" | "staging",
        label: string,
      ) => {
        const replacementRoot = path.join(sidecarRoot, childName);
        const detachedRoot = path.join(
          parent,
          `${label}-detached-${childName}`,
        );
        await rename(replacementRoot, detachedRoot);
        await mkdir(replacementRoot, { mode: 0o700 });
        return {
          detachedRoot,
          replacementRoot,
          exactAtSwap: await snapshotTree(detachedRoot),
          namespaceAtSwap: await snapshotTree(detachedRoot, false),
        };
      };
      const assertCleanInitializedReplacement = async (
        replacementRoot: string,
      ): Promise<void> => {
        assert.deepStrictEqual(
          (await readdir(replacementRoot)).sort(),
          ["claims", "generations", "staging"],
        );
        for (const name of ["claims", "generations", "staging"]) {
          assert.deepStrictEqual(
            await readdir(path.join(replacementRoot, name)),
            [],
          );
        }
      };
      const assertExactDetachedTree = async (
        swapped: Awaited<ReturnType<typeof replaceWholeRoot>>,
      ): Promise<void> => {
        assert.deepStrictEqual(
          await snapshotTree(swapped.detachedRoot),
          swapped.exactAtSwap,
        );
      };
      const assertExactDetachedChild = async (
        swapped: Awaited<ReturnType<typeof replaceChildDirectory>>,
      ): Promise<void> => {
        assert.deepStrictEqual(
          await snapshotTree(swapped.detachedRoot),
          swapped.exactAtSwap,
        );
        assert.deepStrictEqual(
          await readdir(swapped.replacementRoot),
          [],
        );
      };

      const initializationRoot = path.join(
        parent,
        "initialization-sidecars",
      );
      await mkdir(initializationRoot, { mode: 0o700 });
      let initializationCalls = 0;
      let initializationSwap:
        Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
      await assert.rejects(
        initializeTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, initializationRoot),
          {
            faultInjection: async (point) => {
              if (point !== "before_initialize_directory_create") return;
              initializationCalls += 1;
              initializationSwap = await replaceWholeRoot(
                initializationRoot,
                "initialization",
                false,
              );
            },
          },
        ),
      );
      assert.strictEqual(initializationCalls, 1);
      assert.ok(initializationSwap);
      assert.deepStrictEqual(
        await readdir(initializationSwap.replacementRoot),
        [],
      );
      await assertExactDetachedTree(initializationSwap);

      for (const blockedChild of ["staging", "claims"] as const) {
        const rollbackRoot = path.join(
          parent,
          `initialization-${blockedChild}-rollback-sidecars`,
        );
        await mkdir(rollbackRoot, { mode: 0o700 });
        await writeFile(
          path.join(rollbackRoot, blockedChild),
          "synthetic occupied child",
          { mode: 0o600 },
        );
        const beforeInitialization = await snapshotTree(rollbackRoot);
        await assert.rejects(
          initializeTaskMapIdentityDedupeProjectionStore(
            identityStoreRoots(currentRoot, runRoot, rollbackRoot),
          ),
        );
        assert.deepStrictEqual(
          await snapshotTree(rollbackRoot),
          beforeInitialization,
        );
        assert.deepStrictEqual(
          await readdir(rollbackRoot),
          [blockedChild],
        );
      }

      const recoveryCreateRoot =
        await createInitializedRoot("recovery-create");
      let recoveryCreateSwap:
        Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(
            currentRoot,
            runRoot,
            recoveryCreateRoot,
          ),
          { operationToken: "93".repeat(32) },
          {
            faultInjection: async (point) => {
              if (
                point !== "before_recovery_claim_create"
                || recoveryCreateSwap !== undefined
              ) return;
              recoveryCreateSwap = await replaceWholeRoot(
                recoveryCreateRoot,
                "recovery-create",
              );
            },
          },
        ),
      );
      assert.ok(recoveryCreateSwap);
      await assertCleanInitializedReplacement(
        recoveryCreateSwap.replacementRoot,
      );
      await assertExactDetachedTree(recoveryCreateSwap);

      const recoveryTakeoverRoot =
        await createInitializedRoot("recovery-takeover");
      const recoveryTakeoverClaim = path.join(
        recoveryTakeoverRoot,
        "claims",
        "recovery.claim",
      );
      await writeFile(recoveryTakeoverClaim, "", { mode: 0o600 });
      await chmod(recoveryTakeoverClaim, 0o000);
      let recoveryTakeoverCalls = 0;
      let recoveryTakeoverSwap:
        Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(
            currentRoot,
            runRoot,
            recoveryTakeoverRoot,
          ),
          {
            operationToken: "94".repeat(32),
            takeOverRecoveryClaim: true,
            externalExclusivityAsserted: true,
          },
          {
            faultInjection: async (point) => {
              if (point !== "before_recovery_claim_create") return;
              recoveryTakeoverCalls += 1;
              if (recoveryTakeoverCalls !== 2) return;
              recoveryTakeoverSwap = await replaceWholeRoot(
                recoveryTakeoverRoot,
                "recovery-takeover",
              );
            },
          },
        ),
      );
      assert.strictEqual(recoveryTakeoverCalls, 2);
      assert.ok(recoveryTakeoverSwap);
      await assertCleanInitializedReplacement(
        recoveryTakeoverSwap.replacementRoot,
      );
      await assertExactDetachedTree(recoveryTakeoverSwap);

      const recoveryReleaseRoot =
        await createInitializedRoot("recovery-release");
      let recoveryReleaseSwap:
        Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
      await assert.rejects(
        recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(
            currentRoot,
            runRoot,
            recoveryReleaseRoot,
          ),
          { operationToken: "95".repeat(32) },
          {
            faultInjection: async (point) => {
              if (
                point !== "before_recovery_stage_cleanup"
                || recoveryReleaseSwap !== undefined
              ) return;
              recoveryReleaseSwap = await replaceWholeRoot(
                recoveryReleaseRoot,
                "recovery-release",
              );
            },
          },
        ),
      );
      assert.ok(recoveryReleaseSwap);
      await assertCleanInitializedReplacement(
        recoveryReleaseSwap.replacementRoot,
      );
      await assertExactDetachedTree(recoveryReleaseSwap);

      for (const faultPoint of [
        "before_writer_admission_create",
        "before_writer_claim_create",
        "before_stage_create",
        "before_stage_journal_bind",
        "before_generation_cas",
        "after_generation_parent_check",
      ] as const) {
        const label = faultPoint.replaceAll("_", "-");
        const sidecarRoot = await createInitializedRoot(label);
        let swapped:
          Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
        await assert.rejects(
          buildAndPublishTaskMapIdentityDedupeProjection(
            publicationInputFor(sidecarRoot),
            {
              faultInjection: async (point) => {
                if (point !== faultPoint || swapped !== undefined) return;
                swapped = await replaceWholeRoot(sidecarRoot, label);
              },
            },
          ),
        );
        assert.ok(swapped, `${faultPoint} did not execute`);
        await assertCleanInitializedReplacement(
          swapped.replacementRoot,
        );
        await assertExactDetachedTree(swapped);
      }

      for (const faultPoint of [
        "before_writer_admission_create",
        "before_writer_claim_create",
        "before_stage_journal_bind",
      ] as const) {
        const label = `${faultPoint.replaceAll("_", "-")}-claims-child`;
        const sidecarRoot = await createInitializedRoot(label);
        let swapped:
          Awaited<ReturnType<typeof replaceChildDirectory>> | undefined;
        await assert.rejects(
          buildAndPublishTaskMapIdentityDedupeProjection(
            publicationInputFor(sidecarRoot),
            {
              faultInjection: async (point) => {
                if (point !== faultPoint || swapped !== undefined) return;
                swapped = await replaceChildDirectory(
                  sidecarRoot,
                  "claims",
                  label,
                );
              },
            },
          ),
        );
        assert.ok(swapped, `${faultPoint} did not execute`);
        await assertExactDetachedChild(swapped);
      }

      const stageCreateChildRoot =
        await createInitializedRoot("before-stage-create-staging-child");
      let stageCreateChildSwap:
        Awaited<ReturnType<typeof replaceChildDirectory>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(stageCreateChildRoot),
          {
            faultInjection: async (point) => {
              if (
                point !== "before_stage_create"
                || stageCreateChildSwap !== undefined
              ) return;
              stageCreateChildSwap = await replaceChildDirectory(
                stageCreateChildRoot,
                "staging",
                "before-stage-create-staging-child",
              );
            },
          },
        ),
      );
      assert.ok(stageCreateChildSwap);
      await assertExactDetachedChild(stageCreateChildSwap);
      assert.deepStrictEqual(
        await readdir(path.join(stageCreateChildRoot, "claims")),
        [],
      );

      const generationStagingSwapRoot =
        await createInitializedRoot("generation-staging-child");
      let generationStagingSwap:
        Awaited<ReturnType<typeof replaceChildDirectory>> | undefined;
      let sameNameFixtureAtSwap:
        Array<Record<string, string>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(generationStagingSwapRoot),
          {
            faultInjection: async (point) => {
              if (
                point !== "after_generation_parent_check"
                || generationStagingSwap !== undefined
              ) return;
              generationStagingSwap = await replaceChildDirectory(
                generationStagingSwapRoot,
                "staging",
                "generation-staging-child",
              );
              const [stageName] = await readdir(
                generationStagingSwap.detachedRoot,
              );
              assert.ok(stageName);
              await writeFile(
                path.join(
                  generationStagingSwap.replacementRoot,
                  stageName,
                ),
                await readFile(path.join(
                  generationStagingSwap.detachedRoot,
                  stageName,
                )),
                { mode: 0o600 },
              );
              sameNameFixtureAtSwap = await snapshotTree(
                generationStagingSwap.replacementRoot,
              );
            },
          },
        ),
      );
      assert.ok(generationStagingSwap);
      assert.ok(sameNameFixtureAtSwap);
      assert.deepStrictEqual(
        await snapshotTree(generationStagingSwap.replacementRoot),
        sameNameFixtureAtSwap,
      );
      assert.deepStrictEqual(
        await snapshotTree(generationStagingSwap.detachedRoot),
        generationStagingSwap.exactAtSwap,
      );
      assert.deepStrictEqual(
        await readdir(path.join(
          generationStagingSwapRoot,
          "generations",
        )),
        [],
      );

      const partialWriteChildRoot =
        await createInitializedRoot("partial-write-staging-child");
      let partialWriteChildSwap:
        Awaited<ReturnType<typeof replaceChildDirectory>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(partialWriteChildRoot),
          {
            faultInjection: async (point) => {
              if (
                point !== "after_stage_partial_write"
                || partialWriteChildSwap !== undefined
              ) return;
              partialWriteChildSwap = await replaceChildDirectory(
                partialWriteChildRoot,
                "staging",
                "partial-write-staging-child",
              );
            },
          },
        ),
      );
      assert.ok(partialWriteChildSwap);
      assert.deepStrictEqual(
        await readdir(partialWriteChildSwap.replacementRoot),
        [],
      );
      // The namespace and inode are frozen at the swap. Only the stage file
      // already open by descriptor may receive its remaining bytes.
      assert.deepStrictEqual(
        await snapshotTree(partialWriteChildSwap.detachedRoot, false),
        partialWriteChildSwap.namespaceAtSwap,
      );
      assert.notDeepStrictEqual(
        await snapshotTree(partialWriteChildSwap.detachedRoot),
        partialWriteChildSwap.exactAtSwap,
      );
      const preservedStagingReplacement = path.join(
        parent,
        "partial-write-staging-child-replacement-preserved",
      );
      await rename(
        partialWriteChildSwap.replacementRoot,
        preservedStagingReplacement,
      );
      await rename(
        partialWriteChildSwap.detachedRoot,
        partialWriteChildSwap.replacementRoot,
      );
      assert.deepStrictEqual(
        await readdir(preservedStagingReplacement),
        [],
      );
      await recoverTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(
          currentRoot,
          runRoot,
          partialWriteChildRoot,
        ),
        {
          operationToken: "98".repeat(32),
          abandonWriterClaims: true,
          externalExclusivityAsserted: true,
        },
      );
      const partialWriteRetry =
        await buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(partialWriteChildRoot),
        );
      assert.strictEqual(
        partialWriteRetry.publication.status,
        "published",
      );

      const generationCleanupChildRoot =
        await createInitializedRoot("generation-cleanup-child");
      let generationCleanupChildSwap:
        Awaited<ReturnType<typeof replaceChildDirectory>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(generationCleanupChildRoot),
          {
            faultInjection: async (point) => {
              if (
                point !== "before_stage_cleanup"
                || generationCleanupChildSwap !== undefined
              ) return;
              generationCleanupChildSwap = await replaceChildDirectory(
                generationCleanupChildRoot,
                "generations",
                "generation-cleanup-child",
              );
            },
          },
        ),
      );
      assert.ok(generationCleanupChildSwap);
      await assertExactDetachedChild(generationCleanupChildSwap);
      const preservedGenerationReplacement = path.join(
        parent,
        "generation-cleanup-child-replacement-preserved",
      );
      await rename(
        generationCleanupChildSwap.replacementRoot,
        preservedGenerationReplacement,
      );
      await rename(
        generationCleanupChildSwap.detachedRoot,
        generationCleanupChildSwap.replacementRoot,
      );
      assert.deepStrictEqual(
        await readdir(preservedGenerationReplacement),
        [],
      );
      await recoverTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(
          currentRoot,
          runRoot,
          generationCleanupChildRoot,
        ),
        {
          operationToken: "99".repeat(32),
          abandonWriterClaims: true,
          externalExclusivityAsserted: true,
        },
      );
      const generationCleanupRetry =
        await buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(generationCleanupChildRoot),
        );
      assert.strictEqual(
        generationCleanupRetry.publication.status,
        "already_published",
      );

      for (const faultPoint of [
        "after_generation_link",
        "before_stage_cleanup",
      ] as const) {
        const label = `${faultPoint.replaceAll("_", "-")}-convergence`;
        const sidecarRoot = await createInitializedRoot(label);
        let swapped:
          Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
        await assert.rejects(
          buildAndPublishTaskMapIdentityDedupeProjection(
            publicationInputFor(sidecarRoot),
            {
              faultInjection: async (point) => {
                if (point !== faultPoint || swapped !== undefined) return;
                swapped = await replaceWholeRoot(sidecarRoot, label);
              },
            },
          ),
        );
        assert.ok(swapped, `${faultPoint} did not execute`);
        await assertCleanInitializedReplacement(
          swapped.replacementRoot,
        );
        await assertExactDetachedTree(swapped);
        const preservedReplacement = path.join(
          parent,
          `${label}-replacement-preserved`,
        );
        const replacementAtRestore = await snapshotTree(
          swapped.replacementRoot,
        );
        await rename(swapped.replacementRoot, preservedReplacement);
        await rename(swapped.detachedRoot, swapped.replacementRoot);
        assert.deepStrictEqual(
          await snapshotTree(preservedReplacement),
          replacementAtRestore,
        );
        await recoverTaskMapIdentityDedupeProjectionStore(
          identityStoreRoots(currentRoot, runRoot, sidecarRoot),
          {
            operationToken: (
              faultPoint === "after_generation_link" ? "96" : "97"
            ).repeat(32),
            abandonWriterClaims: true,
            externalExclusivityAsserted: true,
          },
        );
        const retry = await buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(sidecarRoot),
        );
        assert.strictEqual(
          retry.publication.status,
          "already_published",
        );
      }

      const openStageWriteRoot =
        await createInitializedRoot("open-stage-write");
      let openStageWriteSwap:
        Awaited<ReturnType<typeof replaceWholeRoot>> | undefined;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          publicationInputFor(openStageWriteRoot),
          {
            faultInjection: async (point) => {
              if (
                point !== "after_stage_create"
                || openStageWriteSwap !== undefined
              ) return;
              openStageWriteSwap = await replaceWholeRoot(
                openStageWriteRoot,
                "open-stage-write",
              );
            },
          },
        ),
      );
      assert.ok(openStageWriteSwap);
      await assertCleanInitializedReplacement(
        openStageWriteSwap.replacementRoot,
      );
      // This is the one intentional post-swap mutation: the stage inode was
      // opened before the root moved, so writes remain descriptor-anchored.
      // No pathname or inode is added to either tree after the swap.
      assert.deepStrictEqual(
        await snapshotTree(openStageWriteSwap.detachedRoot, false),
        openStageWriteSwap.namespaceAtSwap,
      );
      const detachedStageNames = await readdir(
        path.join(openStageWriteSwap.detachedRoot, "staging"),
      );
      assert.strictEqual(detachedStageNames.length, 1);
      assert.ok(
        (
          await readFile(path.join(
            openStageWriteSwap.detachedRoot,
            "staging",
            detachedStageNames[0]!,
          ))
        ).byteLength > 0,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("represents a blocked no-accepted prefix before the first reviewed semantic projection", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-no-accepted-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
      const input = validInput();
      const blocked = blockedGenesisOriginFixture(
        input.sourceSnapshot,
      );
      const complete = originFixture(
        input.sourceSnapshot,
        input.projection,
        {
          aliases: input.aliases,
          workBindings: input.workBindings,
          sessionLineage: input.sessionLineage,
          lifecycleAdjudications: input.lifecycleAdjudications,
        },
      );
      await materializeTaskMapRefreshRunBundle(runRoot, blocked);
      await materializeTaskMapRefreshRunBundle(
        runRoot,
        complete.prepared,
      );
      const g1 = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: blocked.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
          operationToken: "71717171717171717171717171717171",
        },
      });
      assert.strictEqual(g1.ref.operation, "blocked");
      assert.strictEqual(g1.ref.accepted, undefined);
      const g2 = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: complete.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: g1.ref.refId,
        options: {
          operationToken: "72727272727272727272727272727272",
        },
      });
      assert.strictEqual(g2.ref.operation, "complete");
      assert.strictEqual(
        g2.ref.accepted?.originGeneration,
        SECOND_GENERATION,
      );

      const tombstone =
        await backfillTaskMapIdentityDedupeNoAcceptedGeneration({
          currentRoot,
          runRoot,
          sidecarRoot,
          targetGeneration: FIRST_GENERATION,
        });
      assert.strictEqual(tombstone.entry.entryKind, "no_accepted_origin");
      assert.strictEqual(tombstone.entry.semanticHead, null);
      const projected =
        await buildAndPublishTaskMapIdentityDedupeProjection({
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
      assert.strictEqual(projected.publication.entry.entryKind, "projection");
      const store = await readTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, sidecarRoot),
      );
      assert.strictEqual(store.entries.length, 2);
      assert.strictEqual(
        store.entries[1]!.predecessor!.entryId,
        store.entries[0]!.entryId,
      );
      if (store.entries[1]!.entryKind !== "projection") {
        assert.fail("expected first reviewed semantic projection");
      }
      assert.strictEqual(
        store.entries[1]!.diff.previousSidecarDigest,
        taskMapContractDigest(null),
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("records rollback as review-required without changing A+B semantics and resumes from the semantic head", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-rollback-store-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot));

      const g1Input = validInput();
      const g1Origin = originFixture(
        g1Input.sourceSnapshot,
        g1Input.projection,
        {
          aliases: g1Input.aliases,
          workBindings: g1Input.workBindings,
          sessionLineage: g1Input.sessionLineage,
          lifecycleAdjudications: g1Input.lifecycleAdjudications,
        },
      );
      const g2Source = sourceFixture({ includeSecondWork: true });
      const g2Projection = projectionFixture(true);
      const g2Input = validInput({
        source: g2Source,
        projection: g2Projection,
        lifecycle: twoWorkLifecycleFor(
          g2Source,
          g1Input.source.workCanonical,
          false,
        ),
      });
      const g2Origin = originFixture(
        g2Input.sourceSnapshot,
        g2Input.projection,
        {
          aliases: g2Input.aliases,
          workBindings: g2Input.workBindings,
          sessionLineage: g2Input.sessionLineage,
          lifecycleAdjudications: g2Input.lifecycleAdjudications,
        },
        undefined,
        {
          origin: g1Origin.origin,
          currentSnapshot: g1Origin.currentSnapshot,
          sourceSnapshot: g1Input.sourceSnapshot,
        },
      );
      await materializeTaskMapRefreshRunBundle(
        runRoot,
        g1Origin.prepared,
      );
      await materializeTaskMapRefreshRunBundle(
        runRoot,
        g2Origin.prepared,
      );
      const g1 = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g1Origin.prepared.bundleId,
        expectedGeneration: "00000000000000000000",
        options: {
          operationToken: "81818181818181818181818181818181",
        },
      });
      const g1Published =
        await buildAndPublishTaskMapIdentityDedupeProjection({
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
      const g2 = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g2Origin.prepared.bundleId,
        expectedGeneration: FIRST_GENERATION,
        expectedRefId: g1.ref.refId,
        options: {
          operationToken: "82828282828282828282828282828282",
        },
      });
      const g2Published =
        await buildAndPublishTaskMapIdentityDedupeProjection({
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
      assert.strictEqual(g2Published.sidecar.works.length, 2);

      const g3 = await rollbackTaskMapRefreshCurrent({
        currentRoot,
        runRoot,
        targetGeneration: FIRST_GENERATION,
        expectedGeneration: SECOND_GENERATION,
        expectedRefId: g2.ref.refId,
        options: {
          operationToken: "83838383838383838383838383838383",
        },
      });
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection({
          currentRoot,
          runRoot,
          sidecarRoot,
          sourceSnapshot: g1Input.sourceSnapshot,
          projection: g1Input.projection,
          aliases: g1Input.aliases,
          workBindings: g1Input.workBindings,
          sessionLineage: g1Input.sessionLineage,
          lifecycleAdjudications: g1Input.lifecycleAdjudications,
        }),
        /publish a rollback observation instead/,
      );
      const rollbackObservation =
        await publishTaskMapIdentityDedupeRollbackObservation({
          currentRoot,
          runRoot,
          sidecarRoot,
          targetGeneration: g3.ref.generation,
        });
      assert.strictEqual(
        rollbackObservation.entry.entryKind,
        "rollback_observed",
      );
      if (rollbackObservation.entry.entryKind !== "rollback_observed") {
        assert.fail("expected rollback observation");
      }
      assert.strictEqual(
        rollbackObservation.entry.publicationState,
        "review_required",
      );
      assert.strictEqual(
        rollbackObservation.entry.semanticHead!.sidecarDigest,
        g2Published.publication.entry.semanticHead!.sidecarDigest,
      );
      assert.notStrictEqual(
        rollbackObservation.entry.semanticHead!.sidecarDigest,
        g1Published.publication.entry.semanticHead!.sidecarDigest,
      );
      assert.strictEqual(
        rollbackObservation.entry.accepted!.bundleId,
        g1Origin.origin.bundleId,
      );
      assert.strictEqual(
        rollbackObservation.entry.rollback!.targetRefId,
        g1.ref.refId,
      );

      const rollbackSnapshot = await readTaskMapRefreshCurrent(
        currentRoot,
        runRoot,
      );
      const g4Input = validInput({
        source: g2Source,
        projection: g2Projection,
        lifecycle: twoWorkLifecycleFor(
          g2Source,
          g2Source.workCanonical,
          true,
        ),
      });
      const g4Origin = originFixture(
        g4Input.sourceSnapshot,
        g4Input.projection,
        {
          aliases: g4Input.aliases,
          workBindings: g4Input.workBindings,
          sessionLineage: g4Input.sessionLineage,
          lifecycleAdjudications: g4Input.lifecycleAdjudications,
        },
        undefined,
        {
          origin: g1Origin.origin,
          providerOrigin: g2Origin.origin,
          baselineSnapshot: g1Origin.currentSnapshot,
          currentSnapshot: rollbackSnapshot,
          sourceSnapshot: g1Input.sourceSnapshot,
        },
      );
      await materializeTaskMapRefreshRunBundle(
        runRoot,
        g4Origin.prepared,
      );
      const g4 = await publishTaskMapRefreshRunCurrent({
        currentRoot,
        runRoot,
        bundleId: g4Origin.prepared.bundleId,
        expectedGeneration: g3.ref.generation,
        expectedRefId: g3.ref.refId,
        options: {
          operationToken: "84848484848484848484848484848484",
        },
      });
      const g4Published =
        await buildAndPublishTaskMapIdentityDedupeProjection({
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
      assert.strictEqual(
        g4Published.sidecar.origin.currentRefId,
        g4.ref.refId,
      );
      assert.strictEqual(g4Published.sidecar.works.length, 2);
      assert.strictEqual(
        g4Published.publication.entry.predecessor!.entryId,
        rollbackObservation.entry.entryId,
      );
      if (g4Published.publication.entry.entryKind !== "projection") {
        assert.fail("expected resumed reviewed projection");
      }
      assert.strictEqual(
        g4Published.publication.entry.diff.previousSidecarDigest,
        g2Published.publication.entry.semanticHead!.sidecarDigest,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects a concurrently advanced P10.1 head and recovers through exact sequential backfill", async () => {
    const canonicalTmp = await realpath(tmpdir());
    const parent = await mkdtemp(
      path.join(canonicalTmp, "taskmap-identity-race-test-"),
    );
    const runRoot = path.join(parent, "runs");
    const currentRoot = path.join(parent, "current");
    const sidecarRoot = path.join(parent, "sidecars");
    await chmod(parent, 0o700);
    await mkdir(runRoot, { mode: 0o700 });
    await mkdir(currentRoot, { mode: 0o700 });
    await mkdir(sidecarRoot, { mode: 0o700 });
    try {
      await initializeTaskMapRefreshCurrentStore(currentRoot);
      await initializeTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot));
      const g1Input = validInput({ revision: "v1" });
      const g2Input = validInput({ revision: "v2" });
      g2Input.lifecycleAdjudications = lifecycleFor(g2Input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        currentSourceIdentityDigest:
          g2Input.source.workCanonical.sourceIdentityDigest,
        adjudicatedDelta: "updated",
      });
      const g2Origin = originFixture(
        g2Input.sourceSnapshot,
        g2Input.projection,
        {
          aliases: g2Input.aliases,
          workBindings: g2Input.workBindings,
          sessionLineage: g2Input.sessionLineage,
          lifecycleAdjudications: g2Input.lifecycleAdjudications,
        },
        undefined,
        {
          origin: g1Input.acceptedOrigin,
          currentSnapshot: g1Input.currentSnapshot,
          sourceSnapshot: g1Input.sourceSnapshot,
        },
      );
      g2Input.acceptedOrigin = g2Origin.origin;
      g2Input.currentSnapshot = g2Origin.currentSnapshot;

      await materializeTaskMapRefreshRunBundle(
        runRoot,
        originFixture(
          g1Input.sourceSnapshot,
          g1Input.projection,
          {
            aliases: g1Input.aliases,
            workBindings: g1Input.workBindings,
            sessionLineage: g1Input.sessionLineage,
            lifecycleAdjudications: g1Input.lifecycleAdjudications,
          },
        ).prepared,
      );
      await materializeTaskMapRefreshRunBundle(runRoot, g2Origin.prepared);
      const g1Current = await publishTaskMapRefreshRunCurrent({
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
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          g1PublicationInput,
          {
            faultInjection: async (point) => {
              if (point !== "after_stage_sync" || advanced) return;
              advanced = true;
              await publishTaskMapRefreshRunCurrent({
                currentRoot,
                runRoot,
                bundleId: g2Origin.origin.bundleId,
                expectedGeneration: FIRST_GENERATION,
                expectedRefId: g1Current.ref.refId,
                options: {
                  operationToken:
                    "30303030303030303030303030303030",
                },
              });
            },
          },
        ),
        /current head advanced before sidecar generation CAS/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "44".repeat(32),
      });
      await assert.rejects(
        buildTaskMapIdentityDedupeProjectionFromStore({
          currentRoot,
          runRoot,
          sidecarRoot,
          sourceSnapshot: g2Input.sourceSnapshot,
          projection: g2Input.projection,
          aliases: g2Input.aliases,
          workBindings: g2Input.workBindings,
          sessionLineage: g2Input.sessionLineage,
          lifecycleAdjudications: g2Input.lifecycleAdjudications,
        }),
        /reviewed sequential backfill/,
      );

      const backfilled =
        await backfillTaskMapIdentityDedupeProjectionGeneration({
          ...g1PublicationInput,
          targetGeneration: FIRST_GENERATION,
        });
      assert.strictEqual(backfilled.publication.status, "published");
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
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          g2PublicationInput,
          {
            faultInjection: async (point) => {
              if (point === "after_generation_link") {
                await assert.rejects(
                  buildAndPublishTaskMapIdentityDedupeProjection(
                    g2PublicationInput,
                  ),
                  /recovery is required/,
                );
                await assert.rejects(
                  recoverTaskMapIdentityDedupeProjectionStore(
                    identityStoreRoots(currentRoot, runRoot, sidecarRoot),
                    { operationToken: "55".repeat(32) },
                  ),
                  /refuses active writer claims/,
                );
                throw new Error("synthetic post-CAS interruption");
              }
            },
          },
        ),
        /synthetic post-CAS interruption/,
      );
      await assert.rejects(
        readTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot)),
        /recovery is required/,
      );
      await recoverTaskMapIdentityDedupeProjectionStore(identityStoreRoots(currentRoot, runRoot, sidecarRoot), {
        operationToken: "66".repeat(32),
        abandonWriterClaims: true,
        externalExclusivityAsserted: true,
      });
      const g2Published =
        await buildAndPublishTaskMapIdentityDedupeProjection(
          g2PublicationInput,
        );
      assert.strictEqual(
        g2Published.publication.status,
        "already_published",
      );
      const store = await readTaskMapIdentityDedupeProjectionStore(
        identityStoreRoots(currentRoot, runRoot, sidecarRoot),
      );
      assert.strictEqual(store.entries.length, 2);
      assert.strictEqual(
        store.entries[1]!.predecessor!.entryId,
        store.entries[0]!.entryId,
      );
      if (
        store.entries[0]!.entryKind !== "projection"
        || store.entries[1]!.entryKind !== "projection"
      ) {
        assert.fail("expected projection entries");
      }
      assert.strictEqual(
        store.entries[1]!.diff.previousSidecarDigest,
        store.entries[0]!.sidecarDigest,
      );
      let retryAdvanced = false;
      await assert.rejects(
        buildAndPublishTaskMapIdentityDedupeProjection(
          g2PublicationInput,
          {
            faultInjection: async (point) => {
              if (
                point !== "before_retry_revalidation"
                || retryAdvanced
              ) {
                return;
              }
              retryAdvanced = true;
              const current = await readTaskMapRefreshCurrent(
                currentRoot,
                runRoot,
              );
              await rollbackTaskMapRefreshCurrent({
                currentRoot,
                runRoot,
                targetGeneration: FIRST_GENERATION,
                expectedGeneration: SECOND_GENERATION,
                expectedRefId: current.head!.refId,
                options: {
                  operationToken:
                    "67676767676767676767676767676767",
                },
              });
            },
          },
        ),
        /current head advanced during sidecar retry/,
      );
      assert.strictEqual(retryAdvanced, true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("derives and binds every alias, binding, lineage, and lifecycle decision into the accepted replay", () => {
    const baseline = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    const changedProof = validInput();
    changedProof.aliases = changedProof.aliases.filter(
      (alias) => alias.identityKind !== "session",
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(changedProof),
      ),
      /projection replay closure/,
    );

    rebindAcceptedOrigin(changedProof);
    const acceptedChange = buildTaskMapIdentityDedupeProjection(
      withoutSource(changedProof),
    );
    assert.notStrictEqual(
      baseline.sidecar.suppliedIdentityProofDigest,
      acceptedChange.sidecar.suppliedIdentityProofDigest,
    );
    assert.notStrictEqual(
      baseline.sidecar.origin.replayClosureDigest,
      acceptedChange.sidecar.origin.replayClosureDigest,
    );
  });

  it("correlates alias, work-binding, session, and lifecycle evidence to closed source/projection facts", () => {
    const cases: Array<
      (input: ReturnType<typeof validInput>) => void
    > = [
      (input) => {
        input.aliases = input.aliases.filter(
          (alias) => alias.identityKind !== "session",
        );
      },
      (input) => {
        input.workBindings[0]!.sourceEnvelopeId =
          input.source.workAlias.envelopeId;
      },
      (input) => {
        const subagent = input.sessionLineage.find(
          (lineage) => lineage.role === "subagent",
        )!;
        subagent.parentSessionEnvelopeId =
          input.source.codexRoot.envelopeId;
      },
      (input) => {
        input.lifecycleAdjudications[0]!.currentSourceIdentityDigest =
          input.source.workAlias.sourceIdentityDigest;
      },
    ];
    for (const mutate of cases) {
      const input = validInput();
      mutate(input);
      assert.throws(
        () => buildTaskMapIdentityDedupeProjection(
          withoutSource(input),
        ),
        /projection replay closure/,
      );
    }
  });

  it("fails closed for empty, degraded, and healthy snapshots without an accepted origin", () => {
    const base = validInput();
    const empty = withoutSource(base);
    empty.currentSnapshot = {
      status: "empty",
      generations: [],
      unknownGenerationNames: [],
      unknownObjectNames: [],
    };
    assert.throws(() => buildTaskMapIdentityDedupeProjection(empty));

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
    assert.throws(() => buildTaskMapIdentityDedupeProjection(degraded));

    const noAccepted = withoutSource(validInput());
    noAccepted.currentSnapshot = rebuildCurrentRef(
      noAccepted.currentSnapshot,
      (core) => {
        delete core.accepted;
      },
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(noAccepted),
      /no active accepted origin/,
    );
  });

  it("rejects owner, snapshot proof, accepted-state, and replay-digest mismatch", () => {
    const owner = withoutSource(validInput());
    owner.sourceSnapshot = {
      ...owner.sourceSnapshot,
      ownerScopeDigest: digest("wrong-owner"),
    };
    assert.throws(() => buildTaskMapIdentityDedupeProjection(owner));

    const proof = withoutSource(validInput());
    proof.acceptedOrigin.sourceSnapshotProof = {
      ...proof.acceptedOrigin.sourceSnapshotProof!,
      snapshotId: "tmsnapshot_tampered",
    };
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(proof),
      /source snapshot does not match/,
    );

    const accepted = withoutSource(validInput());
    accepted.acceptedOrigin.manifest = {
      ...accepted.acceptedOrigin.manifest,
      candidateAcceptedStateDigest: digest("wrong-accepted-state"),
    };
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(accepted),
      /accepted-state closure/,
    );

    const immutable = withoutSource(validInput());
    immutable.acceptedOrigin.manifest = clone(
      immutable.acceptedOrigin.manifest,
    );
    immutable.acceptedOrigin.manifest.members[0]!.byteSha256 =
      digest("tampered-member-bytes");
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(immutable),
      /immutable bundle closure/,
    );

    const replay = withoutSource(validInput({
      replayDigestOverride: digest("unbound-replay"),
    }));
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(replay),
      /projection replay closure/,
    );
  });

  it("rejects a recomputed contiguous current history that crosses owner scope", () => {
    const input = withoutSource(validInput());
    const first = input.currentSnapshot.head!;
    const { refId: _firstId, ...foreignCore } = clone(first);
    foreignCore.ownerScopeDigest = digest("foreign-owner");
    const foreign = assertTaskMapRefreshCurrentRef({
      ...foreignCore,
      refId: `tmrefreshcurrent_${taskMapContractDigest(foreignCore)}`,
    });
    const { refId: _headId, ...headCore } = clone(first);
    headCore.generation = SECOND_GENERATION;
    headCore.predecessorRefId = foreign.refId;
    if (headCore.attempt !== undefined) {
      headCore.attempt.generation = SECOND_GENERATION;
    }
    const head = assertTaskMapRefreshCurrentRef({
      ...headCore,
      refId: `tmrefreshcurrent_${taskMapContractDigest(headCore)}`,
    });
    input.currentSnapshot = {
      status: "healthy",
      head,
      generations: [foreign, head],
      unknownGenerationNames: [],
      unknownObjectNames: [],
    };
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(input),
      /cross owner scope/,
    );
  });

  it("canonicalizes Calendar + Gemini + Granola independently of adapter order", () => {
    const forward = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    const reversed = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput({ reverseEnvelopes: true })),
    );
    const forwardMeeting = forward.sidecar.events.filter(
      (event) => event.eventKind === "meeting",
    );
    const reverseMeeting = reversed.sidecar.events.filter(
      (event) => event.eventKind === "meeting",
    );
    assert.deepStrictEqual(reverseMeeting, forwardMeeting);
    assert.strictEqual(forwardMeeting.length, 1);
    assert.strictEqual(forwardMeeting[0]!.variantEnvelopeIds.length, 3);
  });

  it("uses bounded fallback identity and keeps ambiguous participant sets separate", () => {
    const fallback = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput({ includeCalendar: false })),
    );
    const meetings = fallback.sidecar.events.filter(
      (event) => event.eventKind === "meeting",
    );
    assert.strictEqual(meetings.length, 1);
    assert.strictEqual(meetings[0]!.identityMethod, "bounded_fingerprint");

    const ambiguous = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput({
        includeCalendar: false,
        ambiguousFallback: true,
      })),
    );
    assert.strictEqual(
      ambiguous.sidecar.events.filter(
        (event) => event.eventKind === "meeting",
      ).length,
      2,
    );
  });

  it("keeps Gmail discovery identifiers neutral to work, meeting, session, and lifecycle identities", () => {
    const first = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput({ discoveryMessageId: "synthetic-message-a" })),
    );
    const second = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput({ discoveryMessageId: "synthetic-message-b" })),
    );
    assert.notStrictEqual(
      first.sidecar.sourceSnapshotDigest,
      second.sidecar.sourceSnapshotDigest,
    );
    assert.deepStrictEqual(first.sidecar.works, second.sidecar.works);
    assert.deepStrictEqual(first.sidecar.events, second.sidecar.events);
    assert.deepStrictEqual(
      first.sidecar.lifecycleDeltas,
      second.sidecar.lifecycleDeltas,
    );
    assert.ok(!first.sidecarCanonicalBytes.includes("synthetic-message-a"));
    assert.ok(!second.sidecarCanonicalBytes.includes("synthetic-message-b"));
  });

  it("rejects Gmail and Strategy context-only envelopes as canonical work", () => {
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(withoutSource(
        validInput({ source: contextOnlyWorkSourceFixture() }),
      )),
      /incompatible semantic object types|work source envelope/,
    );
  });

  it("merges only explicit work/session aliases and explicit delegation lineage", () => {
    const input = validInput();
    const built = buildTaskMapIdentityDedupeProjection(withoutSource(input));
    const sessions = built.sidecar.events.filter(
      (event) => event.eventKind === "session",
    );
    assert.strictEqual(built.sidecar.works.length, 1);
    assert.strictEqual(
      built.sidecar.works[0]!.variantSourceObjectKeyDigests.length,
      2,
    );
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0]!.variantEnvelopeIds.length, 3);
    assert.strictEqual(built.sidecar.rejectedVariants.length, 1);
    assert.strictEqual(
      built.sidecar.rejectedVariants[0]!.reasonCode,
      "wrapper_transport_not_semantic_session",
    );
    assert.strictEqual(
      sessions[0]!.variantSourceObjectKeyDigests.length,
      3,
    );
    assert.strictEqual(
      built.sidecar.rejectedVariants[0]!.sourceObjectKeyDigest,
      input.source.wrapper.sourceObjectKeyDigest,
    );
  });

  it("keeps wrapper rejection stable across revision and attestation replay", () => {
    const g1Input = validInput({ revision: "v1" });
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    const exactReplay = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    assert.strictEqual(
      exactReplay.sidecarCanonicalBytes,
      g1.sidecarCanonicalBytes,
    );
    assert.deepStrictEqual(
      exactReplay.sidecar.rejectedVariants,
      g1.sidecar.rejectedVariants,
    );

    const g2Input = validInput({
      revision: "v2",
      lifecycle: lifecycleFor(sourceFixture({ revision: "v2" })),
    });
    g2Input.lifecycleAdjudications = lifecycleFor(g2Input.source, {
      previousState: "open",
      previousSourceIdentityDigest:
        g1Input.source.workCanonical.sourceIdentityDigest,
      currentState: "open",
      currentSourceIdentityDigest:
        g2Input.source.workCanonical.sourceIdentityDigest,
      adjudicatedDelta: "updated",
    });
    continueWithVerifiedAcceptedOrigin(
      g2Input,
      g1Input,
      g1.sidecar,
    );
    const g2 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g2Input),
    );
    const g1Rejection = g1.sidecar.rejectedVariants[0]!;
    const g2Rejection = g2.sidecar.rejectedVariants[0]!;
    assert.strictEqual(g2Rejection.rejectionId, g1Rejection.rejectionId);
    assert.strictEqual(
      g2Rejection.sourceObjectKeyDigest,
      g1Rejection.sourceObjectKeyDigest,
    );
    assert.notStrictEqual(g2Rejection.envelopeId, g1Rejection.envelopeId);
    assert.notStrictEqual(g2Rejection.proofDigest, g1Rejection.proofDigest);

    const g3Input = validInput({
      source: g2Input.source,
      projection: g2Input.projection,
      lifecycle: lifecycleFor(g2Input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          g2Input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        currentSourceIdentityDigest:
          g2Input.source.workCanonical.sourceIdentityDigest,
        adjudicatedDelta: "no_op",
      }),
    });
    continueWithVerifiedAcceptedOrigin(
      g3Input,
      g2Input,
      g2.sidecar,
      digest("rotated-review-attestation"),
    );
    const g3 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g3Input),
    );
    const g3Rejection = g3.sidecar.rejectedVariants[0]!;
    assert.strictEqual(g3Rejection.rejectionId, g2Rejection.rejectionId);
    assert.notStrictEqual(g3Rejection.proofDigest, g2Rejection.proofDigest);
    assert.ok(g3.diff.changed.some((entry) => (
      entry.kind === "rejected_variant"
      && entry.id === g2Rejection.rejectionId
    )));
    assert.ok(![...g3.diff.added, ...g3.diff.removed].some((entry) => (
      entry.kind === "rejected_variant"
      && entry.id === g2Rejection.rejectionId
    )));
  });

  it("rejects wrapper promotion to root/subagent across same and revised envelopes, and accepted-to-wrapper reversal", () => {
    const g1Input = validInput({ revision: "v1" });
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    for (const revision of ["v1", "v2"] as const) {
      for (const promotedRole of ["root", "subagent"] as const) {
        const source = sourceFixture({ revision });
        const lifecycle = lifecycleFor(source, revision === "v1"
          ? {
            previousState: "open",
            previousSourceIdentityDigest:
              g1Input.source.workCanonical.sourceIdentityDigest,
            currentState: "open",
            adjudicatedDelta: "no_op",
          }
          : {
            previousState: "open",
            previousSourceIdentityDigest:
              g1Input.source.workCanonical.sourceIdentityDigest,
            currentState: "open",
            currentSourceIdentityDigest:
              source.workCanonical.sourceIdentityDigest,
            adjudicatedDelta: "updated",
          });
        const sessionLineage = sessionLineageFor(source).map((lineage) => (
          lineage.role !== "wrapper"
            ? lineage
            : promotedRole === "root"
              ? {
                sessionEnvelopeId: lineage.sessionEnvelopeId,
                role: "root" as const,
                workSourceObjectKeyDigest:
                  source.workCanonical.sourceObjectKeyDigest,
              }
              : {
                sessionEnvelopeId: lineage.sessionEnvelopeId,
                role: "subagent" as const,
                parentSessionEnvelopeId: source.codexRoot.envelopeId,
              }
        ));
        const promoted = validInput({
          source,
          projection: g1Input.projection,
          sessionLineage,
          lifecycle,
        });
        continueWithVerifiedAcceptedOrigin(
          promoted,
          g1Input,
          g1.sidecar,
        );
        assert.throws(
          () => buildTaskMapIdentityDedupeProjection(
            withoutSource(promoted),
          ),
          /cannot change its accepted\/rejected role/,
        );
      }
    }

    const reversedSource = sourceFixture({ revision: "v2" });
    const reversed = validInput({
      source: reversedSource,
      projection: g1Input.projection,
      sessionLineage: sessionLineageFor(reversedSource).map((lineage) => (
        lineage.sessionEnvelopeId
            === reversedSource.cursorSubagent.envelopeId
          ? {
            sessionEnvelopeId: lineage.sessionEnvelopeId,
            role: "wrapper" as const,
          }
          : lineage
      )),
      lifecycle: lifecycleFor(reversedSource, {
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        currentSourceIdentityDigest:
          reversedSource.workCanonical.sourceIdentityDigest,
        adjudicatedDelta: "updated",
      }),
    });
    continueWithVerifiedAcceptedOrigin(
      reversed,
      g1Input,
      g1.sidecar,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(reversed),
      ),
      /cannot change its accepted\/rejected role/,
    );
  });

  it("uses a direction-independent representative for every explicit two-member alias", () => {
    const forwardInput = validInput();
    const forward = buildTaskMapIdentityDedupeProjection(
      withoutSource(forwardInput),
    );
    const reversedInput = validInput({
      source: forwardInput.source,
      projection: forwardInput.projection,
      aliases: forwardInput.aliases.map((alias) => ({
        identityKind: alias.identityKind,
        canonicalSourceObjectKeyDigest:
          alias.aliasSourceObjectKeyDigest,
        aliasSourceObjectKeyDigest:
          alias.canonicalSourceObjectKeyDigest,
      })),
      workBindings: forwardInput.workBindings,
      sessionLineage: forwardInput.sessionLineage,
      lifecycle: forwardInput.lifecycleAdjudications,
    });
    const reversed = buildTaskMapIdentityDedupeProjection(
      withoutSource(reversedInput),
    );
    assert.strictEqual(
      reversed.sidecar.works[0]!.workId,
      forward.sidecar.works[0]!.workId,
    );
    assert.deepStrictEqual(reversed.sidecar, forward.sidecar);
  });

  it("preserves exact work/session alias membership and the session-to-work binding", () => {
    const g1Input = validInput();
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    const removedSessionAlias = validInput({
      source: g1Input.source,
      projection: g1Input.projection,
      aliases: aliasesFor(g1Input.source).filter(
        (alias) => alias.identityKind === "work",
      ),
      lifecycle: lifecycleFor(g1Input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        adjudicatedDelta: "no_op",
      }),
    });
    continueFromPrevious(
      removedSessionAlias,
      g1Input.currentSnapshot,
      g1.sidecar,
      g1Input.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(removedSessionAlias),
      ),
      /session alias membership .* cannot change|session alias identity cannot split/,
    );

    const survivingWork = g1Input.source.workAlias;
    const rekeyedWork = validInput({
      source: g1Input.source,
      projection: g1Input.projection,
      aliases: aliasesFor(g1Input.source).filter(
        (alias) => alias.identityKind === "session",
      ),
      workBindings: g1Input.workBindings.map((binding) => ({
        ...binding,
        sourceEnvelopeId: survivingWork.envelopeId,
      })),
      sessionLineage: g1Input.sessionLineage.map((lineage) => (
        lineage.role === "root"
          ? {
            ...lineage,
            workSourceObjectKeyDigest:
              survivingWork.sourceObjectKeyDigest,
          }
          : lineage
      )),
      lifecycle: [{
        canonicalSourceObjectKeyDigest:
          survivingWork.sourceObjectKeyDigest,
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        currentSourceIdentityDigest:
          survivingWork.sourceIdentityDigest,
        adjudicatedDelta: "updated",
      }],
    });
    continueFromPrevious(
      rekeyedWork,
      g1Input.currentSnapshot,
      g1.sidecar,
      g1Input.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(rekeyedWork),
      ),
      /work alias membership cannot change/,
    );

    const twoWorkSource = sourceFixture({ includeSecondWork: true });
    const twoWorkProjection = projectionFixture(true);
    assert.ok(twoWorkSource.secondWork);
    const initialTwoWorkLifecycle: TaskMapLifecycleAdjudicationV1[] = [
      ...lifecycleFor(twoWorkSource),
      {
        canonicalSourceObjectKeyDigest:
          twoWorkSource.secondWork.sourceObjectKeyDigest,
        previousState: "absent",
        currentState: "open",
        currentSourceIdentityDigest:
          twoWorkSource.secondWork.sourceIdentityDigest,
        adjudicatedDelta: "open",
      },
    ];
    const boundToPrimary = validInput({
      source: twoWorkSource,
      projection: twoWorkProjection,
      lifecycle: initialTwoWorkLifecycle,
    });
    const primary = buildTaskMapIdentityDedupeProjection(
      withoutSource(boundToPrimary),
    );
    const reboundToSecond = validInput({
      source: twoWorkSource,
      projection: twoWorkProjection,
      sessionLineage: sessionLineageFor(twoWorkSource).map((lineage) => (
        lineage.role === "root"
          ? {
            ...lineage,
            workSourceObjectKeyDigest:
              twoWorkSource.secondWork!.sourceObjectKeyDigest,
          }
          : lineage
      )),
      lifecycle: [{
        ...lifecycleFor(twoWorkSource)[0]!,
        previousState: "open",
        previousSourceIdentityDigest:
          twoWorkSource.workCanonical.sourceIdentityDigest,
        adjudicatedDelta: "no_op",
      }, {
        canonicalSourceObjectKeyDigest:
          twoWorkSource.secondWork.sourceObjectKeyDigest,
        previousState: "open",
        currentState: "open",
        previousSourceIdentityDigest:
          twoWorkSource.secondWork.sourceIdentityDigest,
        currentSourceIdentityDigest:
          twoWorkSource.secondWork.sourceIdentityDigest,
        adjudicatedDelta: "no_op",
      }],
    });
    continueFromPrevious(
      reboundToSecond,
      boundToPrimary.currentSnapshot,
      primary.sidecar,
      boundToPrimary.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(reboundToSecond),
      ),
      /session alias membership or work binding cannot change/,
    );
  });

  it("does not merge root sessions by timestamp, content, or shared work reference", () => {
    const input = validInput({ distinctSessionWorkRefOnly: true });
    input.aliases = input.aliases.filter(
      (alias) => alias.identityKind !== "session",
    );
    rebindAcceptedOrigin(input);
    const built = buildTaskMapIdentityDedupeProjection(withoutSource(input));
    const sessions = built.sidecar.events.filter(
      (event) => event.eventKind === "session",
    );
    assert.strictEqual(sessions.length, 2);
    assert.ok(sessions.every((session) => (
      session.corroboratesWorkId === built.sidecar.works[0]!.workId
    )));
  });

  it("rejects session alias chains, delegation cycles, missing lineage, and wrapper promotion", () => {
    const chained = validInput();
    chained.aliases.push({
      identityKind: "session",
      canonicalSourceObjectKeyDigest:
        chained.source.claudeRoot.sourceObjectKeyDigest,
      aliasSourceObjectKeyDigest:
        chained.source.cursorSubagent.sourceObjectKeyDigest,
    });
    assert.throws(
      () => {
        rebindAcceptedOrigin(chained);
        buildTaskMapIdentityDedupeProjection(withoutSource(chained));
      },
      /one-hop|repeats or chains/,
    );

    const cycle = validInput();
    cycle.sessionLineage = cycle.sessionLineage.map((lineage) => (
      lineage.sessionEnvelopeId === cycle.source.claudeRoot.envelopeId
        ? {
          sessionEnvelopeId: lineage.sessionEnvelopeId,
          role: "subagent" as const,
          parentSessionEnvelopeId:
            cycle.source.cursorSubagent.envelopeId,
        }
        : lineage.sessionEnvelopeId === cycle.source.cursorSubagent.envelopeId
          ? {
            ...lineage,
            parentSessionEnvelopeId: cycle.source.claudeRoot.envelopeId,
          }
          : lineage
    ));
    cycle.aliases = cycle.aliases.filter(
      (alias) => alias.identityKind !== "session",
    );
    assert.throws(
      () => {
        rebindAcceptedOrigin(cycle);
        buildTaskMapIdentityDedupeProjection(withoutSource(cycle));
      },
      /cycle/,
    );

    const missing = validInput();
    missing.sessionLineage.pop();
    assert.throws(
      () => {
        rebindAcceptedOrigin(missing);
        buildTaskMapIdentityDedupeProjection(withoutSource(missing));
      },
      /every local session/,
    );

    const wrapper = validInput();
    wrapper.sessionLineage = wrapper.sessionLineage.map((lineage) => (
      lineage.role === "wrapper"
        ? {
          ...lineage,
          workSourceObjectKeyDigest:
            wrapper.source.workCanonical.sourceObjectKeyDigest,
        }
        : lineage
    ));
    assert.throws(
      () => {
        rebindAcceptedOrigin(wrapper);
        buildTaskMapIdentityDedupeProjection(withoutSource(wrapper));
      },
      /wrappers cannot claim work/,
    );
  });

  it("preserves work ID across a source revision while changing lifecycle event and update delta", () => {
    const firstInput = validInput({ revision: "v1" });
    const first = buildTaskMapIdentityDedupeProjection(
      withoutSource(firstInput),
    );
    const secondInput = validInput({ revision: "v2" });
    secondInput.lifecycleAdjudications = lifecycleFor(secondInput.source, {
      previousState: "open",
      previousSourceIdentityDigest:
        firstInput.source.workCanonical.sourceIdentityDigest,
      currentState: "open",
      currentSourceIdentityDigest:
        secondInput.source.workCanonical.sourceIdentityDigest,
      adjudicatedDelta: "updated",
    });
    rebindAcceptedOrigin(secondInput);
    continueFromPrevious(
      secondInput,
      firstInput.currentSnapshot,
      first.sidecar,
      firstInput.acceptedOrigin,
    );
    const second = buildTaskMapIdentityDedupeProjection(
      withoutSource(secondInput),
    );
    assert.strictEqual(
      first.sidecar.works[0]!.workId,
      second.sidecar.works[0]!.workId,
    );
    assert.notStrictEqual(
      first.sidecar.works[0]!.lifecycleEventId,
      second.sidecar.works[0]!.lifecycleEventId,
    );
    assert.strictEqual(
      second.sidecar.lifecycleDeltas[0]!.adjudicatedDelta,
      "updated",
    );
    assert.notStrictEqual(
      first.sidecar.lifecycleDeltas[0]!.deltaId,
      second.sidecar.lifecycleDeltas[0]!.deltaId,
    );
  });

  it("accepts a rejection-only work at genesis, preserves terminal no-op continuity, and forbids reopen", () => {
    const source = sourceFixture({ includeSecondWork: true });
    const projection = rejectionOnlySecondWorkProjectionFixture();
    const workBindings = rejectionOnlyWorkBindingsFor(projection, source);
    assert.ok(source.secondWork);
    const g1Input = validInput({
      source,
      projection,
      workBindings,
      lifecycle: [
        ...lifecycleFor(source),
        {
          canonicalSourceObjectKeyDigest:
            source.secondWork.sourceObjectKeyDigest,
          previousState: "absent",
          currentState: "rejected",
          currentSourceIdentityDigest:
            source.secondWork.sourceIdentityDigest,
          adjudicatedDelta: "rejected",
        },
      ],
    });
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    const rejectedWork = g1.sidecar.works.find((work) => (
      work.variantSourceObjectKeyDigests.includes(
        source.secondWork!.sourceObjectKeyDigest,
      )
    ));
    assert.ok(rejectedWork);
    assert.strictEqual(rejectedWork.lifecycleState, "rejected");
    assert.deepStrictEqual(
      rejectedWork.projectionReferences.map((reference) => reference.kind),
      ["rejection"],
    );
    const rejectedDelta = g1.sidecar.lifecycleDeltas.find(
      (delta) => delta.workId === rejectedWork.workId,
    );
    assert.strictEqual(rejectedDelta?.previousState, "absent");
    assert.strictEqual(rejectedDelta?.currentState, "rejected");
    assert.strictEqual(rejectedDelta?.adjudicatedDelta, "rejected");

    const g2Input = validInput({
      source,
      projection,
      workBindings,
      lifecycle: [{
        ...lifecycleFor(source)[0]!,
        previousState: "open",
        previousSourceIdentityDigest:
          source.workCanonical.sourceIdentityDigest,
        adjudicatedDelta: "no_op",
      }, {
        canonicalSourceObjectKeyDigest:
          source.secondWork.sourceObjectKeyDigest,
        previousState: "rejected",
        currentState: "rejected",
        previousSourceIdentityDigest:
          source.secondWork.sourceIdentityDigest,
        currentSourceIdentityDigest:
          source.secondWork.sourceIdentityDigest,
        adjudicatedDelta: "no_op",
      }],
    });
    continueWithVerifiedAcceptedOrigin(
      g2Input,
      g1Input,
      g1.sidecar,
    );
    const g2 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g2Input),
    );
    const continuedRejected = g2.sidecar.works.find(
      (work) => work.workId === rejectedWork.workId,
    );
    assert.strictEqual(continuedRejected?.lifecycleState, "rejected");
    assert.strictEqual(
      g2.sidecar.lifecycleDeltas.find(
        (delta) => delta.workId === rejectedWork.workId,
      )?.adjudicatedDelta,
      "no_op",
    );

    const reopened = clone(g2Input);
    reopened.lifecycleAdjudications =
      reopened.lifecycleAdjudications.map((adjudication) => (
        adjudication.canonicalSourceObjectKeyDigest
            === source.secondWork!.sourceObjectKeyDigest
          ? {
            ...adjudication,
            currentState: "open" as const,
            adjudicatedDelta: "updated" as const,
          }
          : adjudication
      ));
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(reopened as typeof g2Input),
      ),
      /terminal work variant cannot reopen/,
    );
  });

  it("exposes only mechanically supplied open, updated, resolved, superseded, rejected, and no-op deltas", () => {
    const base = validInput();
    const previousIdentity =
      base.source.workCanonical.sourceIdentityDigest;
    const cases: Array<{
      delta: TaskMapLifecycleAdjudicationV1["adjudicatedDelta"];
      overrides: Partial<TaskMapLifecycleAdjudicationV1>;
    }> = [
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
          previousSourceIdentityDigest:
            base.source.workCanonical.sourceIdentityDigest,
          currentState: "open",
        },
      },
    ];
    for (const testCase of cases) {
      const input = validInput(
        testCase.delta === "updated" ? { revision: "v2" } : {},
      );
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
            previousSourceIdentityDigest:
              priorInput.source.workCanonical.sourceIdentityDigest,
          }),
        adjudicatedDelta: testCase.delta,
      });
      rebindAcceptedOrigin(input);
      if (priorInput !== undefined) {
        const prior = buildTaskMapIdentityDedupeProjection(
          withoutSource(priorInput),
        );
        continueFromPrevious(
          input,
          priorInput.currentSnapshot,
          prior.sidecar,
          priorInput.acceptedOrigin,
        );
      }
      const built = buildTaskMapIdentityDedupeProjection(
        withoutSource(input),
      );
      assert.strictEqual(
        built.sidecar.lifecycleDeltas[0]!.adjudicatedDelta,
        testCase.delta,
      );
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
    assert.throws(
      () => {
        const rejectedOrigin = originFixture(
          rejected.sourceSnapshot,
          rejectedProjection,
          {
            aliases: rejected.aliases,
            workBindings: rejected.workBindings,
            sessionLineage: rejected.sessionLineage,
            lifecycleAdjudications: rejected.lifecycleAdjudications,
          },
        );
        rejected.acceptedOrigin = rejectedOrigin.origin;
        rejected.currentSnapshot = rejectedOrigin.currentSnapshot;
        buildTaskMapIdentityDedupeProjection(withoutSource(rejected));
      },
      /mixed task\/rejection projection dispositions/,
    );
  });

  it("forbids terminal variants from reopening and rejects caller-invented lifecycle transitions", () => {
    const reopened = validInput();
    reopened.lifecycleAdjudications = lifecycleFor(reopened.source, {
      previousState: "resolved",
      previousSourceIdentityDigest: digest("resolved-source-identity"),
      currentState: "open",
      adjudicatedDelta: "updated",
    });
    assert.throws(
      () => {
        rebindAcceptedOrigin(reopened);
        buildTaskMapIdentityDedupeProjection(withoutSource(reopened));
      },
      /cannot reopen/,
    );

    const invented = validInput();
    invented.lifecycleAdjudications = lifecycleFor(invented.source, {
      previousState: "absent",
      currentState: "resolved",
      adjudicatedDelta: "resolved",
    });
    assert.throws(
      () => {
        rebindAcceptedOrigin(invented);
        buildTaskMapIdentityDedupeProjection(withoutSource(invented));
      },
      /mechanically closed/,
    );
  });

  it("rejects alias splits and merges across every prior work variant in open and terminal states", () => {
    const source = sourceFixture();
    const projection = projectionFixture();
    const sessionAliases = aliasesFor(source).filter(
      (alias) => alias.identityKind === "session",
    );
    const sessionLineage = sessionLineageFor(source).map((lineage) => (
      lineage.role === "root"
        ? {
          ...lineage,
          workSourceObjectKeyDigest:
            source.workCanonical.sourceObjectKeyDigest,
        }
        : lineage
    ));
    const absentSeparateLifecycle = (): TaskMapLifecycleAdjudicationV1[] => (
      [source.workCanonical, source.workAlias].map((work) => ({
        canonicalSourceObjectKeyDigest: work.sourceObjectKeyDigest,
        previousState: "absent" as const,
        currentState: "open" as const,
        currentSourceIdentityDigest: work.sourceIdentityDigest,
        adjudicatedDelta: "open" as const,
      }))
    );
    const continuedSeparateLifecycle = (
      previousState: "open" | "resolved",
      currentState: "open" | "resolved",
    ): TaskMapLifecycleAdjudicationV1[] => (
      [source.workCanonical, source.workAlias].map((work) => ({
        canonicalSourceObjectKeyDigest: work.sourceObjectKeyDigest,
        previousState,
        currentState,
        previousSourceIdentityDigest: work.sourceIdentityDigest,
        currentSourceIdentityDigest: work.sourceIdentityDigest,
        adjudicatedDelta: (
          previousState === "open" && currentState === "resolved"
            ? "resolved"
            : "no_op"
        ) as "resolved" | "no_op",
      }))
    );
    const splitLifecycle = (
      previousState: "open" | "resolved",
    ): TaskMapLifecycleAdjudicationV1[] => [{
      canonicalSourceObjectKeyDigest:
        source.workCanonical.sourceObjectKeyDigest,
      previousState,
      currentState: previousState,
      previousSourceIdentityDigest:
        source.workCanonical.sourceIdentityDigest,
      currentSourceIdentityDigest:
        source.workCanonical.sourceIdentityDigest,
      adjudicatedDelta: "no_op",
    }, {
      canonicalSourceObjectKeyDigest:
        source.workAlias.sourceObjectKeyDigest,
      previousState: "absent",
      currentState: "open",
      currentSourceIdentityDigest:
        source.workAlias.sourceIdentityDigest,
      adjudicatedDelta: "open",
    }];

    const aliasedOpenInput = validInput({
      source,
      projection,
      sessionLineage,
    });
    const aliasedOpen = buildTaskMapIdentityDedupeProjection(
      withoutSource(aliasedOpenInput),
    );
    const splitOpenInput = validInput({
      source,
      projection,
      aliases: sessionAliases,
      sessionLineage,
      lifecycle: splitLifecycle("open"),
    });
    continueFromPrevious(
      splitOpenInput,
      aliasedOpenInput.currentSnapshot,
      aliasedOpen.sidecar,
      aliasedOpenInput.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(splitOpenInput),
      ),
      /work alias membership cannot change/,
    );

    const aliasedTerminalInput = validInput({
      source,
      projection,
      sessionLineage,
      lifecycle: lifecycleFor(source, {
        previousState: "open",
        previousSourceIdentityDigest:
          source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "resolved",
      }),
    });
    continueFromPrevious(
      aliasedTerminalInput,
      aliasedOpenInput.currentSnapshot,
      aliasedOpen.sidecar,
      aliasedOpenInput.acceptedOrigin,
    );
    const aliasedTerminal = buildTaskMapIdentityDedupeProjection(
      withoutSource(aliasedTerminalInput),
    );
    const splitTerminalInput = validInput({
      source,
      projection,
      aliases: sessionAliases,
      sessionLineage,
      lifecycle: splitLifecycle("resolved"),
    });
    continueFromPrevious(
      splitTerminalInput,
      aliasedTerminalInput.currentSnapshot,
      aliasedTerminal.sidecar,
      aliasedTerminalInput.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(splitTerminalInput),
      ),
      /work alias membership cannot change/,
    );

    const separateOpenInput = validInput({
      source,
      projection,
      aliases: sessionAliases,
      sessionLineage,
      lifecycle: absentSeparateLifecycle(),
    });
    const separateOpen = buildTaskMapIdentityDedupeProjection(
      withoutSource(separateOpenInput),
    );
    const mergedOpenInput = validInput({
      source,
      projection,
      sessionLineage,
      lifecycle: lifecycleFor(source, {
        previousState: "open",
        previousSourceIdentityDigest:
          source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        adjudicatedDelta: "no_op",
      }),
    });
    continueFromPrevious(
      mergedOpenInput,
      separateOpenInput.currentSnapshot,
      separateOpen.sidecar,
      separateOpenInput.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(mergedOpenInput),
      ),
      /merges distinct prior lifecycle identities/,
    );

    const separateTerminalInput = validInput({
      source,
      projection,
      aliases: sessionAliases,
      sessionLineage,
      lifecycle: continuedSeparateLifecycle("open", "resolved"),
    });
    continueFromPrevious(
      separateTerminalInput,
      separateOpenInput.currentSnapshot,
      separateOpen.sidecar,
      separateOpenInput.acceptedOrigin,
    );
    const separateTerminal = buildTaskMapIdentityDedupeProjection(
      withoutSource(separateTerminalInput),
    );
    const mergedTerminalInput = validInput({
      source,
      projection,
      sessionLineage,
      lifecycle: lifecycleFor(source, {
        previousState: "resolved",
        previousSourceIdentityDigest:
          source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "no_op",
      }),
    });
    continueFromPrevious(
      mergedTerminalInput,
      separateTerminalInput.currentSnapshot,
      separateTerminal.sidecar,
      separateTerminalInput.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(mergedTerminalInput),
      ),
      /merges distinct prior lifecycle identities/,
    );
  });

  it("binds a previous sidecar to the exact current-ref lineage and terminal lifecycle", () => {
    const terminalInput = validInput();
    terminalInput.lifecycleAdjudications = lifecycleFor(
      terminalInput.source,
      {
        previousState: "open",
        previousSourceIdentityDigest:
          terminalInput.source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "resolved",
      },
    );
    rebindAcceptedOrigin(terminalInput);
    const priorInput = validInput({
      source: terminalInput.source,
      projection: terminalInput.projection,
    });
    const prior = buildTaskMapIdentityDedupeProjection(
      withoutSource(priorInput),
    );
    continueFromPrevious(
      terminalInput,
      priorInput.currentSnapshot,
      prior.sidecar,
      priorInput.acceptedOrigin,
    );
    const terminal = buildTaskMapIdentityDedupeProjection(
      withoutSource(terminalInput),
    );

    const attemptedReopen = clone(terminalInput);
    attemptedReopen.lifecycleAdjudications = lifecycleFor(
      attemptedReopen.source,
    );
    attemptedReopen.previousSidecar = terminal.sidecar;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(attemptedReopen),
      ),
      /not the latest semantic predecessor/,
    );
    const nullPredecessor = clone(attemptedReopen);
    nullPredecessor.previousSidecar = null;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(nullPredecessor),
      ),
      /previous sidecar may be null only/,
    );
    const omittedPredecessor = withoutSource(clone(attemptedReopen));
    delete (
      omittedPredecessor as Partial<
        BuildTaskMapIdentityDedupeProjectionInput
      >
    ).previousSidecar;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(omittedPredecessor),
      /missing=previousSidecar/,
    );

    const forkInput = validInput({ distinctSessionWorkRefOnly: true });
    const fork = buildTaskMapIdentityDedupeProjection(
      withoutSource(forkInput),
    );
    const currentBranch = validInput();
    currentBranch.previousSidecar = fork.sidecar;
    currentBranch.previousAcceptedOrigin = forkInput.acceptedOrigin;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(currentBranch),
      ),
      /not the latest semantic predecessor/,
    );
  });

  it("rejects stale G1 and fabricated G2 predecessors at G3, including terminal reopen", () => {
    const g1Input = validInput();
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    const g2Input = validInput({
      source: g1Input.source,
      projection: g1Input.projection,
      lifecycle: lifecycleFor(g1Input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "resolved",
      }),
    });
    rebindAcceptedOrigin(g2Input);
    continueFromPrevious(
      g2Input,
      g1Input.currentSnapshot,
      g1.sidecar,
      g1Input.acceptedOrigin,
    );
    const g2 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g2Input),
    );

    const staleG1 = clone(g2Input);
    continueWithInheritedAcceptedGeneration(
      staleG1,
      g2Input.currentSnapshot,
      g1.sidecar,
      g1Input.acceptedOrigin,
      "blocked",
    );
    staleG1.acceptedOrigin = g2Input.acceptedOrigin;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(staleG1),
      ),
      /not the latest semantic predecessor/,
    );

    const fabricatedG2 = clone(staleG1);
    fabricatedG2.previousSidecar = clone(g2.sidecar);
    fabricatedG2.previousSidecar.origin.currentRefId =
      `tmrefreshcurrent_${digest("fabricated-g2-ref")}`;
    rebindSidecarId(fabricatedG2.previousSidecar);
    fabricatedG2.previousAcceptedOrigin = g2Input.acceptedOrigin;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(fabricatedG2),
      ),
      /not the latest semantic predecessor/,
    );

    const wrongFrozenBundle = clone(staleG1);
    wrongFrozenBundle.previousSidecar = g2.sidecar;
    wrongFrozenBundle.previousAcceptedOrigin = g1Input.acceptedOrigin;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(wrongFrozenBundle),
      ),
      /immediate predecessor bundle/,
    );

    const divergentNonRollback = clone(staleG1);
    divergentNonRollback.previousSidecar = clone(g2.sidecar);
    divergentNonRollback.previousSidecar.replayClosure
      .projectionInputDigest = digest("forged-predecessor-replay");
    divergentNonRollback.previousSidecar.origin.replayClosureDigest =
      taskMapContractDigest(
        divergentNonRollback.previousSidecar.replayClosure,
      );
    rebindSidecarId(divergentNonRollback.previousSidecar);
    divergentNonRollback.previousAcceptedOrigin =
      g2Input.acceptedOrigin;
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(divergentNonRollback),
      ),
      /immediate predecessor bundle/,
    );

    const reopen = clone(staleG1);
    reopen.previousSidecar = g2.sidecar;
    reopen.previousAcceptedOrigin = g2Input.acceptedOrigin;
    reopen.lifecycleAdjudications = lifecycleFor(reopen.source, {
      previousState: "open",
      previousSourceIdentityDigest:
        reopen.source.workCanonical.sourceIdentityDigest,
      currentState: "open",
      adjudicatedDelta: "no_op",
    });
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(reopen),
      ),
      /does not continue the previous sidecar/,
    );
  });

  it("rejects caller-authored identity decisions on a rollback generation", () => {
    const g1Input = validInput();
    const g1 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g1Input),
    );
    const g2Input = validInput({
      source: g1Input.source,
      projection: g1Input.projection,
      lifecycle: lifecycleFor(g1Input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "resolved",
      }),
    });
    rebindAcceptedOrigin(g2Input);
    continueFromPrevious(
      g2Input,
      g1Input.currentSnapshot,
      g1.sidecar,
      g1Input.acceptedOrigin,
    );
    const g2 = buildTaskMapIdentityDedupeProjection(
      withoutSource(g2Input),
    );

    const rollbackInput = validInput({
      source: g1Input.source,
      projection: g1Input.projection,
      lifecycle: lifecycleFor(g1Input.source, {
        previousState: "resolved",
        previousSourceIdentityDigest:
          g1Input.source.workCanonical.sourceIdentityDigest,
        currentState: "resolved",
        adjudicatedDelta: "no_op",
      }),
    });
    continueWithRollbackGeneration(
      rollbackInput,
      g2Input.currentSnapshot,
      g2.sidecar,
      g2Input.acceptedOrigin,
      FIRST_GENERATION,
      g1Input.acceptedOrigin,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(
        withoutSource(rollbackInput),
      ),
      /rollback cannot accept caller-authored identity or lifecycle decisions/,
    );
  });

  it("emits one deterministic no-op sidecar per contiguous generation and sorted changes", () => {
    const input = validInput();
    const first = buildTaskMapIdentityDedupeProjection(
      withoutSource(input),
    );
    const reordered = withoutSource(validInput({
      source: input.source,
      projection: input.projection,
      aliases: [...input.aliases].reverse(),
      workBindings: [...input.workBindings].reverse(),
      sessionLineage: [...input.sessionLineage].reverse(),
      lifecycle: [...input.lifecycleAdjudications].reverse(),
    }));
    const second = buildTaskMapIdentityDedupeProjection(reordered);
    assert.strictEqual(first.sidecarCanonicalBytes, second.sidecarCanonicalBytes);

    const noOpInput = validInput({
      source: input.source,
      projection: input.projection,
      aliases: input.aliases,
      workBindings: input.workBindings,
      sessionLineage: input.sessionLineage,
      lifecycle: lifecycleFor(input.source, {
        previousState: "open",
        previousSourceIdentityDigest:
          input.source.workCanonical.sourceIdentityDigest,
        currentState: "open",
        adjudicatedDelta: "no_op",
      }),
    });
    rebindAcceptedOrigin(noOpInput);
    continueFromPrevious(
      noOpInput,
      input.currentSnapshot,
      first.sidecar,
      input.acceptedOrigin,
    );
    const noOp = buildTaskMapIdentityDedupeProjection(
      withoutSource(noOpInput),
    );
    const repeated = buildTaskMapIdentityDedupeProjection(
      withoutSource(clone(noOpInput)),
    );
    assert.strictEqual(
      noOp.sidecarCanonicalBytes,
      repeated.sidecarCanonicalBytes,
    );
    const blockedInput = clone(noOpInput);
    continueWithInheritedAcceptedGeneration(
      blockedInput,
      noOpInput.currentSnapshot,
      noOp.sidecar,
      noOpInput.acceptedOrigin,
      "blocked",
    );
    const blocked = buildTaskMapIdentityDedupeProjection(
      withoutSource(blockedInput),
    );
    assert.deepStrictEqual(blocked.diff.added, []);
    assert.deepStrictEqual(blocked.diff.removed, []);
    assert.deepStrictEqual(
      blocked.diff.changed.map((entry) => `${entry.kind}:${entry.id}`),
      ["metadata:identity-sidecar-metadata"],
    );
    assert.strictEqual(
      blocked.sidecarCanonicalBytes,
      taskMapIdentityDedupeProjectionCanonicalBytes(blocked.sidecar),
    );
  });

  it("rejects raw title/body/transcript/email/participant/raw-ID/path/secret fields and never emits source IDs", () => {
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
      (input.aliases[0] as unknown as Record<string, unknown>)[field]
        = "synthetic-private-value";
      assert.throws(
        () => buildTaskMapIdentityDedupeProjection(input),
        /invalid fields/,
      );
    }

    const privateProjection = withoutSource(validInput());
    privateProjection.projection.tasks[0]!.summary =
      "/Users/synthetic/private/task";
    assert.throws(() => buildTaskMapIdentityDedupeProjection(privateProjection));

    const built = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    for (const raw of [
      "synthetic-work-primary",
      "synthetic-work-mirror",
      "synthetic-design-doc",
      "synthetic-design-revision",
      "synthetic-message",
    ]) {
      assert.ok(!built.sidecarCanonicalBytes.includes(raw));
    }
    for (const token of [
      "AIza0123456789abcdefghijklmnopqrstuvwxyz",
      ["sk_", "live_0123456789abcdefghijklmnopqrstuv"].join(""),
      "npm_0123456789abcdefghijklmnopqrstuvwxyz",
    ]) {
      const leaked = clone(built.sidecar);
      leaked.sourceSnapshotId = token;
      rebindSidecarId(leaked);
      assert.throws(
        () => assertTaskMapIdentityDedupeProjection(leaked),
        /contract-derived hashed identifier|contains a (?:Google API key|Stripe secret|npm token)/,
      );
    }
  });

  it("rejects tampered stable IDs, unknown output fields, and noncanonical diff order", () => {
    const built = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    const tampered = clone(built.sidecar);
    tampered.works[0]!.workId = `tmwork_${digest("tampered")}`;
    rebindSidecarId(tampered);
    assert.throws(
      () => assertTaskMapIdentityDedupeProjection(tampered),
      /canonical work identity/,
    );

    const nestedUnknown = clone(built.sidecar);
    (
      nestedUnknown.works[0] as unknown as Record<string, unknown>
    ).unexpected = true;
    rebindSidecarId(nestedUnknown);
    assert.throws(
      () => assertTaskMapIdentityDedupeProjection(nestedUnknown),
      /invalid fields/,
    );

    const overlap = clone(built.sidecar);
    const session = overlap.events.find(
      (event) => event.eventKind === "session",
    )!;
    overlap.rejectedVariants[0]!.envelopeId =
      session.variantEnvelopeIds[0]!;
    rebindSidecarId(overlap);
    assert.throws(
      () => assertTaskMapIdentityDedupeProjection(overlap),
      /both accepted and rejected/,
    );

    const crossAcceptedSets = clone(built.sidecar);
    const meeting = crossAcceptedSets.events.find(
      (event) => event.eventKind === "meeting",
    )!;
    const acceptedSession = crossAcceptedSets.events.find(
      (event) => event.eventKind === "session",
    )!;
    acceptedSession.variantEnvelopeIds[0] =
      meeting.variantEnvelopeIds[0]!;
    acceptedSession.variantEnvelopeIds.sort();
    rebindSidecarId(crossAcceptedSets);
    assert.throws(
      () => assertTaskMapIdentityDedupeProjection(crossAcceptedSets),
      /more than one meeting\/session identity/,
    );

    const unknown = clone(built.sidecar) as unknown as Record<string, unknown>;
    unknown.unexpected = true;
    assert.throws(() => assertTaskMapIdentityDedupeProjection(
      unknown as unknown as typeof built.sidecar,
    ), /invalid fields/);

    const diff = clone(built.diff);
    if (diff.added.length > 1) {
      diff.added.reverse();
      assert.throws(() => assertTaskMapIdentityDedupeDiff(diff));
    }
    const contradictory = clone(built.diff);
    const repeated = contradictory.added[0]!;
    contradictory.changed = [{
      kind: repeated.kind,
      id: repeated.id,
      beforeDigest: digest("contradictory-before"),
      afterDigest: repeated.afterDigest,
    }];
    rebindDiffId(contradictory);
    assert.throws(
      () => assertTaskMapIdentityDedupeDiff(contradictory),
      /repeats one record/,
    );

    const falseNoOp = clone(built.diff);
    falseNoOp.previousSidecarDigest = falseNoOp.currentSidecarDigest;
    rebindDiffId(falseNoOp);
    assert.throws(
      () => assertTaskMapIdentityDedupeDiff(falseNoOp),
      /exact no-op state/,
    );

    const inherited = withoutSource(validInput());
    const inheritedKey = "previousSidecar";
    delete (
      inherited as Partial<BuildTaskMapIdentityDedupeProjectionInput>
    ).previousSidecar;
    const priorDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      inheritedKey,
    );
    let getterReads = 0;
    try {
      Object.defineProperty(Object.prototype, inheritedKey, {
        configurable: true,
        get: () => {
          getterReads += 1;
          return digest("inherited-lifecycle-identity");
        },
      });
      assert.strictEqual(Object.hasOwn(inherited, inheritedKey), false);
      assert.notStrictEqual(
        Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(inherited),
          inheritedKey,
        ),
        undefined,
      );
      assert.throws(
        () => buildTaskMapIdentityDedupeProjection(inherited),
        /missing=previousSidecar|must not be inherited/,
      );
      assert.strictEqual(getterReads, 0);
    } finally {
      if (priorDescriptor === undefined) {
        delete (Object.prototype as Record<string, unknown>)[inheritedKey];
      } else {
        Object.defineProperty(
          Object.prototype,
          inheritedKey,
          priorDescriptor,
        );
      }
    }
  });

  it("rejects proxies and Array prototype drift before attacker code executes", () => {
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
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(proxied),
      /must not be proxy-backed/,
    );
    assert.strictEqual(proxyTrapReads, 0);

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
    assert.throws(
      () => taskMapIdentityDedupeReplayClosureDigest(
        replayInput.sourceSnapshot,
        replayInput.projection,
        proxiedReplayProofs,
        REVIEW_ATTESTATION_DIGEST,
      ),
      /must not be proxy-backed/,
    );
    assert.strictEqual(replayProxyTrapReads, 0);

    const customArrayInput = withoutSource(validInput());
    let customArrayMethodReads = 0;
    const customArrayPrototype = Object.create(Array.prototype) as unknown[];
    Object.defineProperty(customArrayPrototype, "entries", {
      configurable: true,
      get: () => {
        customArrayMethodReads += 1;
        return Array.prototype.entries;
      },
    });
    Object.setPrototypeOf(
      customArrayInput.aliases,
      customArrayPrototype,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(customArrayInput),
      /intrinsic Array prototype/,
    );
    assert.strictEqual(customArrayMethodReads, 0);

    const mapDescriptor = Object.getOwnPropertyDescriptor(
      Array.prototype,
      "map",
    )!;
    let pollutedMapCalls = 0;
    let pollutionError: unknown;
    try {
      Object.defineProperty(Array.prototype, "map", {
        ...mapDescriptor,
        value: function pollutedMap(...args: unknown[]) {
          pollutedMapCalls += 1;
          Object.defineProperty(Array.prototype, "map", mapDescriptor);
          return (
            mapDescriptor.value as (
              this: unknown[],
              ...values: unknown[]
            ) => unknown
          ).apply(this, args);
        },
      });
      try {
        buildTaskMapIdentityDedupeProjection(input);
      } catch (error) {
        pollutionError = error;
      }
    } finally {
      Object.defineProperty(Array.prototype, "map", mapDescriptor);
    }
    assert.match(String(pollutionError), /dependency set is not intact/);
    assert.strictEqual(pollutedMapCalls, 0);
  });

  it("enforces count, string, and pre-clone canonical byte bounds", () => {
    const mib = 1024 * 1024;
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalInputBytes,
      80 * mib,
    );
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes,
      4 * mib,
    );
    assert.ok(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes
        >= (
          2
            * TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxCanonicalArtifactBytes
          + 2 * mib
        ),
    );
    assert.ok(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes
        <= 7
          * TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes,
    );
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries,
      TASKMAP_REFRESH_CURRENT_LIMITS_V1.maxGenerations,
    );
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxConcurrentWriters,
      1,
    );
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingEntries,
      1,
    );
    assert.strictEqual(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStagingBytes,
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes,
    );
    assert.doesNotThrow(() => (
      assertTaskMapIdentityDedupeStoreAppendCapacity(
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes - 1,
        1,
      )
    ));
    assert.throws(
      () => assertTaskMapIdentityDedupeStoreAppendCapacity(
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes - 1,
        2,
      ),
      /aggregate history byte bound/,
    );
    assert.doesNotThrow(() => (
      assertTaskMapIdentityDedupeStoreAppendCapacity(
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreHistoryBytes,
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntryBytes,
        true,
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries,
      )
    ));
    assert.doesNotThrow(() => (
      assertTaskMapIdentityDedupeStoreAppendCapacity(
        0,
        1,
        false,
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries - 1,
      )
    ));
    assert.throws(
      () => assertTaskMapIdentityDedupeStoreAppendCapacity(
        0,
        1,
        false,
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStoreEntries,
      ),
      /generation count bound/,
    );
    const tooWideObject = withoutSource(validInput());
    let wideGetterReads = 0;
    for (
      let index = 0;
      index < TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys;
      index += 1
    ) {
      Object.defineProperty(tooWideObject.aliases[0]!, `extra${index}`, {
        configurable: true,
        enumerable: true,
        value: index,
      });
    }
    Object.defineProperty(tooWideObject.aliases[0]!, "attackerGetter", {
      configurable: true,
      enumerable: true,
      get: () => {
        wideGetterReads += 1;
        return "must-not-run";
      },
    });
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(tooWideObject),
      /too many object fields/,
    );
    assert.strictEqual(wideGetterReads, 0);

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
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(namedEmptyArray),
      /array contains named fields/,
    );
    assert.strictEqual(namedArrayGetterReads, 0);

    const tooManyAliases = withoutSource(validInput());
    tooManyAliases.aliases = Array.from(
      {
        length:
          TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxAliases + 1,
      },
      () => clone(tooManyAliases.aliases[0]!),
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(tooManyAliases),
      /aliases must be an array of at most/,
    );

    const oversizedString = withoutSource(validInput());
    oversizedString.aliases[0]!.canonicalSourceObjectKeyDigest = "a".repeat(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength + 1,
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(oversizedString),
      /oversized string/,
    );

    const oversizedBytes = withoutSource(validInput());
    const largeProof = "a".repeat(
      TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength,
    );
    oversizedBytes.aliases = Array.from(
      { length: 2_100 },
      () => ({
        ...oversizedBytes.aliases[0]!,
        canonicalSourceObjectKeyDigest: largeProof,
      }),
    );
    assert.throws(
      () => buildTaskMapIdentityDedupeProjection(oversizedBytes),
      /pre-clone canonical byte bound/,
    );
  });

  it("charges undefined-valued own fields before descriptors can reach clone", () => {
    const keyBytesOverflow = withoutSource(validInput());
    const descriptorOverflow = withoutSource(validInput());
    const cloneDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "structuredClone",
    )!;
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
      const maximumKeyLength =
        TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxStringLength;
      const longUndefinedDescriptors: PropertyDescriptorMap =
        Object.create(null) as PropertyDescriptorMap;
      for (
        let index = 0;
        index < TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys;
        index += 1
      ) {
        const prefix = index.toString(16).padStart(4, "0");
        Object.defineProperty(
          longUndefinedDescriptors,
          `${prefix}${"k".repeat(maximumKeyLength - prefix.length)}`,
          {
            configurable: true,
            enumerable: true,
            value: {
              configurable: true,
              enumerable: true,
              value: undefined,
            },
          },
        );
      }
      const unreachableGetter = Object.defineProperty(
        {},
        "attackerGetter",
        {
          enumerable: true,
          get() {
            attackerGetterReads += 1;
            return "must-not-run";
          },
        },
      );
      keyBytesOverflow.currentSnapshot.generations = [
        ...Array.from(
          { length: 1_000 },
          () => Object.create(null, longUndefinedDescriptors),
        ),
        unreachableGetter,
      ] as unknown as TaskMapRefreshCurrentSnapshotV1["generations"];
      assert.throws(
        () => buildTaskMapIdentityDedupeProjection(keyBytesOverflow),
        /pre-clone canonical byte bound/,
      );
      assert.strictEqual(structuredCloneCalls, 0);
      assert.strictEqual(attackerGetterReads, 0);

      const shortUndefinedDescriptors: PropertyDescriptorMap =
        Object.create(null) as PropertyDescriptorMap;
      for (
        let index = 0;
        index < TASKMAP_IDENTITY_DEDUPE_LIMITS_V1.maxObjectKeys;
        index += 1
      ) {
        Object.defineProperty(
          shortUndefinedDescriptors,
          `u${index.toString(16).padStart(3, "0")}`,
          {
            configurable: true,
            enumerable: true,
            value: {
              configurable: true,
              enumerable: true,
              value: undefined,
            },
          },
        );
      }
      descriptorOverflow.currentSnapshot.generations = Array.from(
        { length: 1_000 },
        () => Object.create(null, shortUndefinedDescriptors),
      ) as unknown as TaskMapRefreshCurrentSnapshotV1["generations"];
      assert.throws(
        () => buildTaskMapIdentityDedupeProjection(descriptorOverflow),
        /pre-clone descriptor bound/,
      );
      assert.strictEqual(structuredCloneCalls, 0);
      assert.strictEqual(attackerGetterReads, 0);
    } finally {
      Object.defineProperty(
        globalThis,
        "structuredClone",
        cloneDescriptor,
      );
    }
  });

  it("preserves the frozen P10.1B golden and Swift flat v1 bytes", () => {
    const sha256 = (filePath: string): string =>
      createHash("sha256").update(readFileSync(filePath)).digest("hex");
    const goldenPath = path.resolve(
      process.cwd(),
      "tests/fixtures/taskmap-p10.1b/golden-v1.json",
    );
    const swiftPath = path.resolve(
      process.cwd(),
      "../DaobrewSentinelMac/Sources/SentinelMac/Models/"
      + "TaskMapProjectionDocumentV1.swift",
    );
    // 2026-08-04: golden re-cut for the Unicode-scalar canonical key sort
    // (see taskmap-refresh-run-bundle.test.ts golden fixture note).
    assert.strictEqual(
      sha256(goldenPath),
      "b538c226d5f57713a6cca78d2111a7cddc95ce4447461870b50b3186d6c9acd9",
    );
    // 2026-08-13: Swift pin re-cut for the optional visibleTaskIds root
    // view hint. Absence remains byte-compatible with old projections.
    assert.strictEqual(
      sha256(swiftPath),
      "1e207fad6cf860d8b3e4ab2512ed8a5521ce09cbda552c39bcdcdbff6b708180",
    );
  });

  it("keeps canonical artifacts newline-free and hash-stable", () => {
    const first = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    const second = buildTaskMapIdentityDedupeProjection(
      withoutSource(validInput()),
    );
    assert.ok(!first.sidecarCanonicalBytes.endsWith("\n"));
    assert.ok(!first.diffCanonicalBytes.endsWith("\n"));
    assert.strictEqual(
      createHash("sha256").update(first.sidecarCanonicalBytes).digest("hex"),
      createHash("sha256").update(second.sidecarCanonicalBytes).digest("hex"),
    );
    assert.strictEqual(
      taskMapContractCanonicalJson(first.sidecar),
      first.sidecarCanonicalBytes,
    );
  });

  it("splits staged UTF-8 bytes without corrupting a midpoint surrogate pair", () => {
    const value = `${"a".repeat(10)}😀${"b".repeat(10)}`;
    assert.strictEqual(value.length % 2, 0);
    const [first, second] =
      taskMapIdentityDedupeUtf8WriteChunks(value);
    assert.deepStrictEqual(
      Buffer.concat([first, second]),
      Buffer.from(value, "utf8"),
    );
  });
});
