import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { EmbeddingProvider } from "../src/engine/embeddings/provider.js";
import {
  buildTaskMapProjection,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION,
  buildTaskMapAgentSessionGraphFeed,
  buildTaskMapAgentSessionSemanticAdmission,
  type TaskMapAgentSessionGraphFeedEpisodeV1,
  type TaskMapAgentSessionGraphFeedV1,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1 as TASKMAP_AGENT_GRAPH_LIMITS_V1,
  buildTaskMapAgentSessionProducerSnapshot,
  type TaskMapAgentSessionObservationV1,
  type TaskMapAgentSessionWorkEpisodeV1,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1,
} from "../src/engine/taskmap/community-graph-brain.js";
import {
  TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1,
} from "../src/engine/taskmap/community-root-proposals.js";
import type {
  LlmStation,
  LlmStationEnvelope,
  LlmStationRequest,
} from "../src/engine/taskmap/llm-station.js";
import {
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  taskMapMeetingStatementReferenceDigest,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
  type TaskMapNativeSemanticBuilderInputV1,
  type TaskMapNativeSemanticEvidenceBindingV1,
  type TaskMapNativeSemanticSourceBindingV1,
} from "../src/engine/taskmap/native-semantic-builder-adapter.js";
import {
  TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1,
  TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION,
  TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION,
  TaskMapNativeCommunityShadowUnavailableError,
  buildTaskMapNativeCommunityPlan,
  buildTaskMapNativeCommunityRootEvidence,
  buildTaskMapNativeCommunityShadow,
  buildTaskMapNativeCommunityShadowUnavailableReceipt,
  mapTaskMapNativeCommunityPlanToAgentRoots,
  type TaskMapNativeCommunityShadowInputV1,
} from "../src/engine/taskmap/native-community-shadow.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapEvent,
  type TaskMapSourcePointer,
} from "../src/engine/taskmap/types.js";

const REQUESTED_AT = "2026-08-17T12:00:00.000Z";
const OWNER_SCOPE_DIGEST = digest("owner");
const SHARED_REF_DIGEST = digest("shared-work");
const SECRET = "sk-proj-abcdefghijklmnop";
const OWNER_PATH = "/Users/neo/private/community-shadow.txt";

function digest(label: string): string {
  return taskMapContractDigest(`native-community-shadow-test:${label}`);
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${value.slice(0, 16)}`;
}

function agentEpisode(
  label: string,
  occurredAt = "2026-08-11T10:00:00.000Z",
  directiveSemanticDigest = SHARED_REF_DIGEST,
  userDirectiveSummary = `Ship the bounded ${label} adapter`,
): TaskMapAgentSessionGraphFeedEpisodeV1 {
  const episodeIdentityDigest = digest(`episode-identity:${label}`);
  const graphEpisodeDigest = digest(`graph-episode:${label}`);
  const producerEpisodeBase: Omit<
    TaskMapAgentSessionWorkEpisodeV1,
    "episodeId" | "episodeRevisionDigest"
  > = {
    episodeIdentityDigest,
    turnLineageIdentityDigest: digest(`lineage:${label}`),
    directiveSemanticDigest,
    disposition: "work_candidate",
    rootSessionIdentityDigest: digest(`root-session:${label}`),
    parentRootSessionIdentityDigest: null,
    provider: "codex",
    semanticUnit: "bounded_user_turn_work_episode",
    recordKind: "work_context",
    proposalDisposition: "candidate_or_context_only",
    authority: "none",
    acceptedMembershipAuthority: false,
    lifecycleAuthority: false,
    completionAuthority: false,
    verificationAuthority: false,
    occurredAt,
    observedAt: occurredAt,
    routing: {
      role: "routing_metadata_only",
      projectIdentityDigests: [],
      repositoryIdentityDigests: [],
      providerNeutralProjectIdentityDigests: [],
      providerNeutralRepositoryIdentityDigests: [],
    },
    userDirectiveSummary,
    assistantOutcomeSummary: null,
  };
  return {
    ...producerEpisodeBase,
    episodeId: `tmaepisode_${
      taskMapContractDigest(episodeIdentityDigest).slice(0, 16)
    }`,
    episodeRevisionDigest: taskMapContractDigest(producerEpisodeBase),
    graphEpisodeId: stableId("tmagraph", graphEpisodeDigest),
    graphEpisodeDigest,
    graphEpisodeRevisionDigest: digest(`graph-revision:${label}`),
    workstreamIdentityDigest: digest(`workstream:${label}`),
    routingKind: "repository",
    providerNeutralRoutingDigest: digest(`routing:${label}`),
    isoWeek: "2026-W33",
    recurrenceCount: 1,
    firstSeenAt: occurredAt,
  };
}

function agentFeed(
  episodes: TaskMapAgentSessionGraphFeedEpisodeV1[],
): TaskMapAgentSessionGraphFeedV1 {
  const canonicalEpisodes = [...episodes].sort((left, right) =>
    left.graphEpisodeId < right.graphEpisodeId
      ? -1
      : left.graphEpisodeId > right.graphEpisodeId
        ? 1
        : 0
  );
  const base = {
    contractVersion: TASKMAP_AGENT_SESSION_GRAPH_FEED_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    producedAt: REQUESTED_AT,
    authority: "none" as const,
    acceptedMembershipAuthority: false as const,
    limits: TASKMAP_AGENT_GRAPH_LIMITS_V1,
    counts: {
      inputObservations: canonicalEpisodes.length,
      eligibleEpisodes: canonicalEpisodes.length,
      deduplicatedEpisodes: canonicalEpisodes.length,
      selectedEpisodes: canonicalEpisodes.length,
    },
    episodes: canonicalEpisodes,
  };
  const feedDigest = taskMapContractDigest(base);
  return {
    ...base,
    feedId: stableId("tmagraphfeed", feedDigest),
    feedDigest,
  };
}

function agentFeedWithSummaries(
  summaries: readonly string[],
  directiveSemanticDigest = SHARED_REF_DIGEST,
): TaskMapAgentSessionGraphFeedV1 {
  return agentFeed(summaries.map((summary, index) => {
    const episode = agentEpisode(
      `summary-${index}`,
      `2026-08-${String(11 + index).padStart(2, "0")}T10:00:00.000Z`,
      directiveSemanticDigest,
      summary,
    );
    return episode;
  }));
}

function realAgentGraphFeed(): TaskMapAgentSessionGraphFeedV1 {
  const observation = realAgentObservation("real-shadow");
  return buildTaskMapAgentSessionGraphFeed({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    producedAt: REQUESTED_AT,
    observations: [observation],
  });
}

function realAgentObservation(
  label: string,
): TaskMapAgentSessionObservationV1 {
  return {
    provider: "codex",
    rawJsonl: [
      {
        timestamp: "2026-08-17T09:59:00.000Z",
        type: "session_meta",
        payload: { id: `${label}-session` },
      },
      {
        timestamp: "2026-08-17T09:59:30.000Z",
        type: "turn_context",
        payload: { repository: `/repo/${label}` },
      },
      {
        timestamp: "2026-08-17T10:00:00.000Z",
        type: "response_item",
        payload: {
          id: `${label}-turn`,
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `Validate the real Agent graph feed ${label}`,
          }],
        },
      },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  };
}

interface CandidateDraft {
  id: string;
  pointerId: string;
  sourceKind: "gemini_meet" | "granola" | "google_calendar" | "local_calendar";
  semanticOriginId: string;
  candidateKind: "action_item" | "commitment";
  occurredAt: string;
  title?: string;
  summary?: string;
  sharedRefDigest?: string;
  candidateIdentityDigest?: string;
}

function pointer(draft: CandidateDraft): TaskMapSourcePointer {
  return {
    id: draft.pointerId,
    sourceKind: draft.sourceKind,
    sourceObjectId: `opaque-${digest(`object:${draft.pointerId}`)}`,
    sourceRefHash: digest(`semantic:${draft.pointerId}`),
    sourceVersion: digest(`content:${draft.pointerId}`),
    authority: "none",
    syncMode: "reference_only",
    capabilities: ["read_context"],
  };
}

function sourceBinding(
  draft: CandidateDraft,
  source: TaskMapSourcePointer,
): TaskMapNativeSemanticSourceBindingV1 {
  const revision = `revision-${digest(`revision:${draft.pointerId}`).slice(0, 16)}`;
  return {
    pointerId: draft.pointerId,
    semanticClass:
      draft.sourceKind === "gemini_meet" || draft.sourceKind === "granola"
        ? "meeting_context"
        : "context_only",
    semanticOriginId: draft.semanticOriginId,
    semanticIdentityDigest: source.sourceRefHash,
    sourceIdentityDigest: digest(`source:${draft.pointerId}`),
    observedRevision: revision,
    evidenceRevision: revision,
    observedContentDigest: source.sourceVersion!,
    evidenceContentDigest: source.sourceVersion!,
  };
}

function candidateRows(draft: CandidateDraft): {
  pointer: TaskMapSourcePointer;
  event: TaskMapEvent;
  sourceBinding: TaskMapNativeSemanticSourceBindingV1;
  evidenceBinding: TaskMapNativeSemanticEvidenceBindingV1;
} {
  const source = pointer(draft);
  const title = draft.title ?? `Candidate ${draft.id}`;
  const summary = draft.summary ?? `Bounded work context for ${draft.id}`;
  const externalReferenceDigests = [
    draft.sharedRefDigest ?? digest(`shared:${draft.id}`),
  ];
  const candidateDigest = draft.candidateIdentityDigest
    ?? taskMapMeetingStatementReferenceDigest({
      kind: draft.candidateKind,
      title,
      summary,
      explicitExternalReferenceDigests: externalReferenceDigests,
    });
  const candidateIdentityRef = `external:${candidateDigest}`;
  const event: TaskMapEvent = {
    id: draft.id,
    pointerId: draft.pointerId,
    recordKind: "work_context",
    activity: "commitment_stated",
    occurredAt: draft.occurredAt,
    observedAt: draft.occurredAt,
    dayKey: draft.occurredAt.slice(0, 10),
    objectRefs: [
      draft.sharedRefDigest ?? digest(`shared:${draft.id}`),
      `external:${externalReferenceDigests[0]}`,
      candidateIdentityRef,
      `canonical-meeting:${draft.semanticOriginId}`,
      `source-object:${digest(`source-object:${draft.id}`)}`,
    ],
    title,
    summary,
    extractionConfidence: 0.9,
    bodyJoinEligible: true,
  };
  return {
    pointer: source,
    event,
    sourceBinding: sourceBinding(draft, source),
    evidenceBinding: {
      eventId: draft.id,
      disposition: "candidate_only",
      candidateIdentityRef,
      candidateKind: draft.candidateKind,
      rootLinkRefs: [`external:${externalReferenceDigests[0]}`],
    },
  };
}

function semanticFragment(
  drafts: CandidateDraft[],
): TaskMapNativeSemanticBuilderInputV1 {
  const rows = drafts.map(candidateRows);
  const pointers = [...new Map(rows.map((row) => [
    row.pointer.id,
    row.pointer,
  ])).values()];
  const sourceBindings = [...new Map(rows.map((row) => [
    row.sourceBinding.pointerId,
    row.sourceBinding,
  ])).values()];
  return {
    contractVersion: TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    producer: {
      id: TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
      version: TASKMAP_MEETING_PRODUCER_VERSION,
    },
    freshness: {
      decision: "fresh",
      available: true,
      retainedLastGood: false,
      producedAt: "2026-08-17T10:00:00.000Z",
      validThrough: "2026-08-17T14:00:00.000Z",
      assessedAt: "2026-08-17T12:00:00.000Z",
    },
    sourceBindings,
    evidenceBindings: rows.map((row) => row.evidenceBinding),
    taskMapInput: {
      contractVersion: TASKMAP_CONTRACT_VERSION,
      generatedAt: REQUESTED_AT,
      pointers,
      events: rows.map((row) => row.event),
    },
  };
}

function baseInput(
  overrides: Partial<TaskMapNativeCommunityShadowInputV1> = {},
): TaskMapNativeCommunityShadowInputV1 {
  const feed = overrides.agentSessionGraphFeed ?? null;
  const inputObservations = feed?.counts.inputObservations ?? 0;
  const selectedEpisodes = feed?.counts.selectedEpisodes ?? 0;
  return {
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    requestedAt: REQUESTED_AT,
    legacyBindings: {
      graphInputDigest: digest("legacy-graph-input"),
      candidateDigest: digest("legacy-candidate"),
      projectionDigest: digest("legacy-projection"),
      promotionReceiptHeadDigest: digest("legacy-promotion-head"),
    },
    agentSessionGraphFeed: feed,
    graphCollectionCoverage: {
      contractVersion: "taskmap-native-community-graph-coverage.v1",
      discovery: { directoriesVisited: 0, candidatesDiscovered: inputObservations, directoryLimit: 1_024, candidateLimit: 4_096, directoryLimitReached: false, candidateLimitReached: false },
      reads: { attemptedFiles: inputObservations, attemptLimit: 1_024, droppedAttemptLimit: 0, droppedInvalid: 0 },
      scan: { chargedBytes: 0, globalByteLimit: 64 * 1_024 * 1_024, perFileByteLimit: 512 * 1_024, droppedScanBudget: 0 },
      observations: { selectedObservations: inputObservations, observationLimit: 512, droppedObservationLimit: 0, rawBytesSelected: 0, rawByteLimit: 32 * 1_024 * 1_024, droppedRawByteBudget: 0, graphEpisodesSelected: selectedEpisodes, maxGraphEpisodes: 256, droppedGraphEpisodes: Math.max(0, (feed?.counts.deduplicatedEpisodes ?? 0) - selectedEpisodes) },
      distribution: { codexSelected: 0, claudeSelected: 0, isoWeeksSelected: 0 },
      completeness: "unknown",
      truncationReasons: ["not_collected"],
      authority: "none",
      privacy: { pathsPersisted: false, textPersisted: false, secretsPersisted: false, vectorsPersisted: false },
    },
    semanticEvidence: {},
    previousAcceptedRoots: [],
    expectedLegacyFlags: {
      readAuthority: false,
      rankingMutated: false,
      bodyMutated: false,
      acceptanceStoreMutated: false,
    },
    ...overrides,
  };
}

function vector(): number[] {
  const result = new Array<number>(
    TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions,
  ).fill(0);
  result[0] = 1;
  return result;
}

function station(calls: LlmStationRequest[]): LlmStation {
  return {
    provider: {
      transport: "gemini-remote",
      executable: "injected-shadow-station",
      args: [],
      model: "shadow-grouping-fixture",
    },
    async run(request): Promise<LlmStationEnvelope> {
      calls.push(request);
      if (request.stationId === "community-title-v1") {
        const payload = JSON.parse(
          request.promptText.split("\n").at(-1) ?? "{}",
        ) as {
          communities?: Array<{ baseRootProposalId?: string }>;
        };
        return {
          stationId: request.stationId,
          model: "shadow-grouping-fixture",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify({
            titles: (payload.communities ?? []).map((community) => ({
              baseRootProposalId: community.baseRootProposalId,
              title: "Ship the grouped shadow workstream",
            })),
          }),
          producedAt: REQUESTED_AT,
          transport: "gemini-remote",
        };
      }
      return {
        stationId: request.stationId,
        model: "shadow-grouping-fixture",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: '{"groups":[]}',
        producedAt: REQUESTED_AT,
        transport: "gemini-remote",
      };
    },
  };
}

async function reusableCommunityFixture(): Promise<{
  input: TaskMapNativeCommunityShadowInputV1;
  memberNodeIds: string[];
}> {
  const input = baseInput({
    agentSessionGraphFeed: agentFeed([
      agentEpisode("previous-root-privacy", undefined, SHARED_REF_DIGEST),
    ]),
    candidateSemanticFragment: semanticFragment([{
      id: "previous-root-privacy-event",
      pointerId: "previous-root-privacy-pointer",
      sourceKind: "gemini_meet",
      semanticOriginId: digest("previous-root-privacy-origin"),
      candidateKind: "commitment",
      occurredAt: "2026-08-12T10:00:00.000Z",
      sharedRefDigest: SHARED_REF_DIGEST,
    }]),
  });
  const baseline = await buildTaskMapNativeCommunityShadow(input);
  assert.equal(baseline.proposalSet.proposals.length, 1);
  return {
    input,
    memberNodeIds: [...baseline.proposalSet.proposals[0]!.memberNodeIds],
  };
}

async function assertPreviousRootPrivacyRejected(
  input: TaskMapNativeCommunityShadowInputV1,
  unsafeValue: string,
): Promise<void> {
  await assert.rejects(
    buildTaskMapNativeCommunityShadow(input),
    (error: unknown) => {
      assert.ok(error instanceof TaskMapNativeCommunityShadowUnavailableError);
      assert.equal(error.code, "invalid_input");
      assert.equal(
        error.message,
        "Task Map native community shadow unavailable: invalid_input",
      );
      assert.equal(error.message.includes(unsafeValue), false);
      return true;
    },
  );
}

async function assertShadowInvalidInput(
  input: TaskMapNativeCommunityShadowInputV1,
): Promise<void> {
  await assert.rejects(
    buildTaskMapNativeCommunityShadow(input),
    (error: unknown) => {
      assert.ok(error instanceof TaskMapNativeCommunityShadowUnavailableError);
      assert.equal(error.code, "invalid_input");
      assert.equal(
        error.message,
        "Task Map native community shadow unavailable: invalid_input",
      );
      return true;
    },
  );
}

describe("Task Map pure native community shadow adapter", () => {
  it("builds deterministic bounded root evidence without historical tasks", async () => {
    const feed = agentFeed(Array.from({ length: 6 }, (_, index) =>
      agentEpisode(
        `historical-${index}`,
        `2026-08-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`,
        digest(`historical-directive-${index}`),
      )
    ));
    const prepared = baseInput({ agentSessionGraphFeed: feed });
    const groupingStation: LlmStation = {
      provider: {
        transport: "gemini-remote",
        executable: "injected-history-station",
        args: [],
        model: "history-projection-fixture",
      },
      async run(request) {
        const payload = JSON.parse(
          request.promptText.split("\n").at(-1) ?? "{}",
        ) as {
          nodes?: Array<{ nodeId: string }>;
          communities?: Array<{ baseRootProposalId?: string }>;
        };
        return {
          stationId: request.stationId,
          model: "history-projection-fixture",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: request.stationId === "community-title-v1"
            ? JSON.stringify({
                titles: (payload.communities ?? []).map((community) => ({
                  baseRootProposalId: community.baseRootProposalId,
                  title: "Historical delivery",
                })),
              })
            : JSON.stringify({
                groups: [{
                  nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
                }],
              }),
          producedAt: REQUESTED_AT,
          transport: "gemini-remote",
        };
      },
    };
    const plan = await buildTaskMapNativeCommunityPlan({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      requestedAt: REQUESTED_AT,
      agentSessionGraphFeed: feed,
      graphCollectionCoverage: prepared.graphCollectionCoverage,
      semanticEvidence: { station: groupingStation },
      previousAcceptedRoots: [],
    });

    const evidence = buildTaskMapNativeCommunityRootEvidence({
      plan,
      feed,
      generatedAt: REQUESTED_AT,
    });
    const brain = {
      contractVersion: TASKMAP_CONTRACT_VERSION,
      provider: "root-evidence-test",
      model: "root-evidence-test",
      promptHash: plan.planDigest,
      inputDigest: taskMapSemanticInputDigest(evidence.taskMapInput),
      generatedAt: REQUESTED_AT,
      roots: evidence.rootProposals,
      tasks: [],
      edges: [],
    };
    const first = buildTaskMapProjection(
      evidence.taskMapInput,
      brain,
      { arm: "E4", now: REQUESTED_AT },
    );
    const replay = buildTaskMapProjection(
      evidence.taskMapInput,
      brain,
      { arm: "E4", now: REQUESTED_AT },
    );

    assert.equal(first.runStatus, "accepted", JSON.stringify(first.rejections));
    assert.deepEqual(taskMapProjectionArtifactValidationReasons(first), []);
    assert.deepEqual(replay, first);
    assert.equal(first.roots.length, 1);
    assert.equal(first.roots[0]?.title, "Historical delivery");
    assert.equal(first.tasks.length, 0);
    assert.equal(first.edges.length, 0);
    assert.equal(first.sources.length, 5);
    assert.equal(first.roots[0]?.taskIds.length, 0);
    assert.equal(first.roots[0]?.citations.length, 5);
  });

  it("maps only exact unambiguous Plan2 members and leaves ambiguous or unmapped clusters for legacy fallback", async () => {
    const observations = [
      realAgentObservation("plan-map-alpha"),
      realAgentObservation("plan-map-beta"),
      realAgentObservation("plan-map-gamma"),
      realAgentObservation("plan-map-delta"),
    ];
    const feed = buildTaskMapAgentSessionGraphFeed({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      producedAt: REQUESTED_AT,
      observations,
    });
    const admission = buildTaskMapAgentSessionSemanticAdmission(
      buildTaskMapAgentSessionProducerSnapshot({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        producedAt: REQUESTED_AT,
        observations,
      }),
    );
    const prepared = baseInput({ agentSessionGraphFeed: feed });
    const singletonStation: LlmStation = {
      provider: {
        transport: "gemini-remote",
        executable: "injected-plan-station",
        args: [],
        model: "plan-mapping-fixture",
      },
      async run(request) {
        const payload = JSON.parse(
          request.promptText.split("\n").at(-1) ?? "{}",
        ) as {
          nodes?: Array<{ nodeId: string }>;
          communities?: Array<{ baseRootProposalId?: string }>;
        };
        return {
          stationId: request.stationId,
          model: "plan-mapping-fixture",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: request.stationId === "community-title-v1"
            ? JSON.stringify({
                titles: (payload.communities ?? []).map(
                  (community, index) => ({
                    baseRootProposalId: community.baseRootProposalId,
                    title: `Mapped root ${index + 1}`,
                  }),
                ),
              })
            : JSON.stringify({
                groups: [
                  { nodeIds: (payload.nodes ?? []).slice(0, 2).map(
                    (node) => node.nodeId,
                  ) },
                  { nodeIds: (payload.nodes ?? []).slice(2).map(
                    (node) => node.nodeId,
                  ) },
                ],
              }),
          producedAt: REQUESTED_AT,
          transport: "gemini-remote",
        };
      },
    };
    const plan = await buildTaskMapNativeCommunityPlan({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      requestedAt: REQUESTED_AT,
      agentSessionGraphFeed: feed,
      graphCollectionCoverage: prepared.graphCollectionCoverage,
      semanticEvidence: { station: singletonStation },
      previousAcceptedRoots: [],
    });
    assert.equal(plan.proposalSet.proposals.length, 2);
    const altered = structuredClone(plan);
    const ambiguousEpisode = feed.episodes[0]!;
    const ambiguousRoot = altered.proposalSet.proposals.find((proposal) =>
      proposal.memberNodeIds.includes(ambiguousEpisode.graphEpisodeId)
    )!;
    const mappedRoot = altered.proposalSet.proposals.find((proposal) =>
      proposal.rootProposalId !== ambiguousRoot.rootProposalId
    )!;
    const episodeById = new Map(feed.episodes.map((episode) => [
      episode.graphEpisodeId,
      episode,
    ] as const));
    const secondMappedEpisode = episodeById.get(
      ambiguousRoot.memberNodeIds.find((nodeId) =>
        nodeId !== ambiguousEpisode.graphEpisodeId
      )!,
    )!;
    const [mappedEpisode, unmappedEpisode] = mappedRoot.memberNodeIds.map(
      (nodeId) => episodeById.get(nodeId)!,
    );
    assert.notEqual(ambiguousRoot.rootProposalId, mappedRoot.rootProposalId);
    mappedRoot.memberNodeIds = [...mappedRoot.memberNodeIds,
      ambiguousEpisode.graphEpisodeId].sort();
    for (const proposal of altered.proposalSet.proposals) {
      proposal.memberNodeIds = proposal.memberNodeIds.filter(
        (nodeId) => nodeId !== unmappedEpisode.graphEpisodeId,
      );
    }

    const mapped = mapTaskMapNativeCommunityPlanToAgentRoots({
      plan: altered,
      feed,
      admission,
    });
    const mappedClusterIds = mapped.roots.flatMap(
      (root) => root.clusterIdentityDigests,
    );
    const clusterForEpisode = (episode: typeof feed.episodes[number]) =>
      admission.clusters.find((cluster) =>
        cluster.workstreamIdentityDigest === episode.workstreamIdentityDigest
        && cluster.directiveSemanticDigest === episode.directiveSemanticDigest
      )!;
    assert.deepEqual(mappedClusterIds.sort(), [
      clusterForEpisode(mappedEpisode).clusterIdentityDigest,
      clusterForEpisode(secondMappedEpisode).clusterIdentityDigest,
    ].sort());
    assert.equal(mappedClusterIds.includes(
      clusterForEpisode(ambiguousEpisode).clusterIdentityDigest,
    ), false);
    assert.equal(mappedClusterIds.includes(
      clusterForEpisode(unmappedEpisode).clusterIdentityDigest,
    ), false);
  });

  it("adapts Agent plus mixed meeting/calendar candidates and preserves the calendar context boundary", async () => {
    const origin = digest("canonical-meeting");
    const fragment = semanticFragment([
      {
        id: "meeting-event",
        pointerId: "meeting-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: origin,
        candidateKind: "action_item",
        occurredAt: "2026-08-12T10:00:00.000Z",
        sharedRefDigest: SHARED_REF_DIGEST,
      },
      {
        id: "calendar-context-event",
        pointerId: "calendar-context-pointer",
        sourceKind: "google_calendar",
        semanticOriginId: origin,
        candidateKind: "action_item",
        occurredAt: "2026-08-13T10:00:00.000Z",
        sharedRefDigest: SHARED_REF_DIGEST,
      },
      {
        id: "calendar-commitment-event",
        pointerId: "calendar-commitment-pointer",
        sourceKind: "local_calendar",
        semanticOriginId: origin,
        candidateKind: "commitment",
        occurredAt: "2026-08-14T10:00:00.000Z",
        sharedRefDigest: SHARED_REF_DIGEST,
      },
    ]);

    const result = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeed([agentEpisode("agent")]),
      candidateSemanticFragment: fragment,
    }));

    assert.equal(result.contractVersion, TASKMAP_NATIVE_COMMUNITY_SHADOW_VERSION);
    assert.deepEqual(result.sourceFamilyCounts, {
      agent: 1,
      meeting: 1,
      calendar: 2,
    });
    assert.equal(result.resourceUsage.nodeCount, 4);
    assert.equal(result.communities.length, 1);
    assert.equal(result.communities[0]?.memberNodeIds.length, 3);
    assert.equal(result.communities[0]?.contextNodeIds.length, 1);
    assert.deepEqual(result.communities[0]?.sourceFamilies, [
      "agent", "calendar", "meeting",
    ]);
    assert.equal(result.proposalSet.proposals.length, 1);
    assert.equal(result.proposalSet.proposals[0]?.memberNodeIds.length, 3);
    assert.ok((result.proposalSet.proposals[0]?.title.length ?? 0) > 0);
    assert.equal(
      result.proposalSet.proposals[0]?.titleSource,
      "deterministic_fallback",
    );
    assert.equal(result.proposalSet.titleGeneration, null);
    assert.equal(result.proposalSet.monitoring.titleBatchAttempted, false);
    assert.equal(
      result.proposalSet.proposals[0]?.memberNodeIds.includes(
        result.communities[0]!.contextNodeIds[0]!,
      ),
      false,
    );
  });

  it("accepts official feed counts when one observation yields multiple eligible episodes", async () => {
    const feed = agentFeed([
      agentEpisode("multi-a"),
      agentEpisode("multi-b"),
    ]);
    feed.counts.inputObservations = 1;
    const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
    feed.feedDigest = taskMapContractDigest(base);
    feed.feedId = stableId("tmagraphfeed", feed.feedDigest);

    const result = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: feed,
    }));

    assert.equal(result.feed.counts.inputObservations, 1);
    assert.equal(result.feed.counts.eligibleEpisodes, 2);
    assert.equal(result.sourceFamilyCounts.agent, 2);
  });

  it("accepts real producer-domain episode IDs while rejecting arbitrary stable-shaped IDs", async () => {
    const feed = realAgentGraphFeed();
    assert.equal(feed.episodes.length, 1);
    assert.notEqual(
      feed.episodes[0]!.episodeId,
      stableId("tmaepisode", feed.episodes[0]!.episodeIdentityDigest),
    );
    const accepted = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: feed,
    }));
    assert.equal(accepted.sourceFamilyCounts.agent, 1);

    const arbitrary = structuredClone(feed);
    arbitrary.episodes[0]!.episodeId = "tmaepisode_0000000000000000";
    const { feedDigest: _feedDigest, feedId: _feedId, ...base } = arbitrary;
    arbitrary.feedDigest = taskMapContractDigest(base);
    arbitrary.feedId = stableId("tmagraphfeed", arbitrary.feedDigest);
    await assertShadowInvalidInput(baseInput({
      agentSessionGraphFeed: arbitrary,
    }));
  });

  it("rejects a recomputed Agent feed whose episodes are not in canonical graphEpisodeId order", async () => {
    const feed = agentFeed([
      agentEpisode("canonical-order-a"),
      agentEpisode("canonical-order-b"),
      agentEpisode("canonical-order-c"),
    ]);
    feed.episodes.reverse();
    const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
    feed.feedDigest = taskMapContractDigest(base);
    feed.feedId = stableId("tmagraphfeed", feed.feedDigest);

    await assertShadowInvalidInput(baseInput({
      agentSessionGraphFeed: feed,
    }));
  });

  it("rejects an Agent graph feed produced after artifact requestedAt", async () => {
    const feed = agentFeed([agentEpisode("future-feed")]);
    feed.producedAt = "2026-08-17T12:00:00.001Z";
    const { feedDigest: _feedDigest, feedId: _feedId, ...base } = feed;
    feed.feedDigest = taskMapContractDigest(base);
    feed.feedId = stableId("tmagraphfeed", feed.feedDigest);

    await assertShadowInvalidInput(baseInput({
      agentSessionGraphFeed: feed,
    }));
  });

  it("deduplicates candidate identity plus semantic origin by code-point-smallest event id", async () => {
    const origin = digest("dedupe-origin");
    const sharedRefDigest = digest("dedupe-shared-ref");
    const fragment = semanticFragment([
      {
        id: "z-event",
        pointerId: "z-pointer",
        sourceKind: "granola",
        semanticOriginId: origin,
        candidateKind: "commitment",
        occurredAt: "2026-08-16T10:00:00.000Z",
        title: "Same explicit statement",
        summary: "Same exact normalized semantic candidate",
        sharedRefDigest,
      },
      {
        id: "a-event",
        pointerId: "a-pointer",
        sourceKind: "granola",
        semanticOriginId: origin,
        candidateKind: "commitment",
        occurredAt: "2026-08-10T10:00:00.000Z",
        title: "Same explicit statement",
        summary: "Same exact normalized semantic candidate",
        sharedRefDigest,
      },
    ]);

    const result = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeed([
        agentEpisode(
          "dedupe-agent",
          "2026-08-11T10:00:00.000Z",
          sharedRefDigest,
        ),
      ]),
      candidateSemanticFragment: fragment,
    }));

    assert.deepEqual(result.sourceFamilyCounts, {
      agent: 1,
      meeting: 1,
      calendar: 0,
    });
    assert.equal(result.resourceUsage.nodeCount, 2);
    assert.equal(result.communities.length, 1);
    assert.deepEqual(result.communities[0]?.dateSpan, {
      startAt: "2026-08-10T10:00:00.000Z",
      endAt: "2026-08-11T10:00:00.000Z",
    });
  });

  it("excludes superseded, retracted, and retracting candidate evidence", async () => {
    const supersession = semanticFragment([
      {
        id: "superseded-event",
        pointerId: "supersession-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: digest("supersession-origin"),
        candidateKind: "commitment",
        occurredAt: "2026-08-11T10:00:00.000Z",
      },
      {
        id: "replacement-event",
        pointerId: "supersession-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: digest("supersession-origin"),
        candidateKind: "commitment",
        occurredAt: "2026-08-12T10:00:00.000Z",
      },
    ]);
    supersession.taskMapInput.events[1]!.supersedesEventId =
      "superseded-event";
    const replaced = await buildTaskMapNativeCommunityShadow(baseInput({
      candidateSemanticFragment: supersession,
    }));
    assert.deepEqual(replaced.sourceFamilyCounts, {
      agent: 0,
      meeting: 1,
      calendar: 0,
    });
    assert.equal(replaced.resourceUsage.nodeCount, 1);

    const retraction = semanticFragment([
      {
        id: "retracted-event",
        pointerId: "retraction-pointer",
        sourceKind: "granola",
        semanticOriginId: digest("retraction-origin"),
        candidateKind: "action_item",
        occurredAt: "2026-08-11T10:00:00.000Z",
      },
      {
        id: "retractor-event",
        pointerId: "retraction-pointer",
        sourceKind: "granola",
        semanticOriginId: digest("retraction-origin"),
        candidateKind: "action_item",
        occurredAt: "2026-08-12T10:00:00.000Z",
      },
    ]);
    retraction.taskMapInput.events[1]!.retractsEventId = "retracted-event";
    const retracted = await buildTaskMapNativeCommunityShadow(baseInput({
      candidateSemanticFragment: retraction,
    }));
    assert.deepEqual(retracted.sourceFamilyCounts, {
      agent: 0,
      meeting: 0,
      calendar: 0,
    });
    assert.equal(retracted.resourceUsage.nodeCount, 0);
  });

  it("rejects cross-pointer supersession before active-event filtering", async () => {
    const fragment = semanticFragment([
      {
        id: "cross-pointer-target",
        pointerId: "cross-pointer-target-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: digest("cross-pointer-target-origin"),
        candidateKind: "commitment",
        occurredAt: "2026-08-11T10:00:00.000Z",
      },
      {
        id: "cross-pointer-superseder",
        pointerId: "cross-pointer-superseder-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: digest("cross-pointer-superseder-origin"),
        candidateKind: "commitment",
        occurredAt: "2026-08-12T10:00:00.000Z",
      },
    ]);
    fragment.taskMapInput.events[1]!.supersedesEventId =
      "cross-pointer-target";
    await assertShadowInvalidInput(baseInput({
      candidateSemanticFragment: fragment,
    }));
  });

  it("preserves same-identity meeting and calendar nodes without widening calendar membership", async () => {
    const origin = digest("cross-family-origin");
    const sharedRefDigest = digest("cross-family-shared-ref");
    const crossFamilyFragment = (
      candidateKind: "action_item" | "commitment",
    ) => semanticFragment([
      {
        id: "a-calendar-event",
        pointerId: `calendar-${candidateKind}-pointer`,
        sourceKind: "google_calendar",
        semanticOriginId: origin,
        candidateKind,
        occurredAt: "2026-08-12T10:00:00.000Z",
        title: "Same cross-family candidate",
        summary: "Exact shared semantic statement",
        sharedRefDigest,
      },
      {
        id: "z-meeting-event",
        pointerId: `meeting-${candidateKind}-pointer`,
        sourceKind: "gemini_meet",
        semanticOriginId: origin,
        candidateKind,
        occurredAt: "2026-08-12T10:00:00.000Z",
        title: "Same cross-family candidate",
        summary: "Exact shared semantic statement",
        sharedRefDigest,
      },
    ]);

    const commitment = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeed([
        agentEpisode(
          "cross-family-agent",
          "2026-08-11T10:00:00.000Z",
          sharedRefDigest,
        ),
      ]),
      candidateSemanticFragment: crossFamilyFragment("commitment"),
    }));
    assert.deepEqual(commitment.sourceFamilyCounts, {
      agent: 1,
      meeting: 1,
      calendar: 1,
    });
    assert.equal(commitment.resourceUsage.nodeCount, 3);
    assert.equal(commitment.communities[0]?.memberNodeIds.length, 3);
    assert.equal(commitment.communities[0]?.contextNodeIds.length, 0);

    const context = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeed([
        agentEpisode(
          "cross-family-agent",
          "2026-08-11T10:00:00.000Z",
          sharedRefDigest,
        ),
      ]),
      candidateSemanticFragment: crossFamilyFragment("action_item"),
    }));
    assert.deepEqual(context.sourceFamilyCounts, {
      agent: 1,
      meeting: 1,
      calendar: 1,
    });
    assert.equal(context.resourceUsage.nodeCount, 3);
    assert.equal(context.communities[0]?.memberNodeIds.length, 2);
    assert.equal(context.communities[0]?.contextNodeIds.length, 1);
  });

  it("caps meeting/calendar nodes fairly across both families and weeks", async () => {
    const drafts: CandidateDraft[] = [];
    for (const sourceKind of ["gemini_meet", "google_calendar"] as const) {
      const familyOrigin = digest(`${sourceKind}:fair-origin`);
      for (let index = 0; index < 75; index += 1) {
        const day = index % 2 === 0 ? "03" : "10";
        drafts.push({
          id: `${sourceKind}-${String(index).padStart(3, "0")}`,
          pointerId: `${sourceKind}-fair-pointer`,
          sourceKind,
          semanticOriginId: familyOrigin,
          candidateKind: "commitment",
          occurredAt: `2026-08-${day}T10:00:00.000Z`,
        });
      }
    }

    const result = await buildTaskMapNativeCommunityShadow(baseInput({
      candidateSemanticFragment: semanticFragment(drafts),
    }));

    assert.equal(
      result.sourceFamilyCounts.meeting + result.sourceFamilyCounts.calendar,
      TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumMeetingCalendarNodes,
    );
    assert.deepEqual(result.sourceFamilyCounts, {
      agent: 0,
      meeting: 64,
      calendar: 64,
    });
    assert.ok(result.communities.length >= 1);
    assert.ok(result.communities.every((community) =>
      community.dateSpan.startAt === "2026-08-03T10:00:00.000Z"
      && community.dateSpan.endAt === "2026-08-10T10:00:00.000Z"
    ));
  });

  it("is fully deterministic across candidate input permutations and canonicalizes its digest", async () => {
    const drafts: CandidateDraft[] = [
      {
        id: "meeting-b",
        pointerId: "meeting-b-pointer",
        sourceKind: "gemini_meet",
        semanticOriginId: digest("permutation-origin-b"),
        candidateKind: "action_item",
        occurredAt: "2026-08-12T10:00:00.000Z",
      },
      {
        id: "calendar-a",
        pointerId: "calendar-a-pointer",
        sourceKind: "google_calendar",
        semanticOriginId: digest("permutation-origin-a"),
        candidateKind: "commitment",
        occurredAt: "2026-08-05T10:00:00.000Z",
      },
    ];
    const firstFragment = semanticFragment(drafts);
    const secondFragment = structuredClone(firstFragment);
    secondFragment.sourceBindings.reverse();
    secondFragment.evidenceBindings.reverse();
    secondFragment.taskMapInput.pointers.reverse();
    secondFragment.taskMapInput.events.reverse();
    secondFragment.taskMapInput.events.forEach((event) => event.objectRefs.reverse());
    secondFragment.evidenceBindings.forEach((binding) => binding.rootLinkRefs.reverse());

    const first = await buildTaskMapNativeCommunityShadow(baseInput({
      candidateSemanticFragment: firstFragment,
    }));
    const second = await buildTaskMapNativeCommunityShadow(baseInput({
      candidateSemanticFragment: secondFragment,
    }));

    assert.deepEqual(second, first);
    const { artifactId: _artifactId, artifactDigest: _artifactDigest, ...base } = first;
    assert.equal(first.artifactDigest, taskMapContractDigest(base));
    assert.equal(first.artifactId, stableId("tmcommunityshadow", first.artifactDigest));
  });

  it("runs the A/B semantic pipeline through injected station and embedding adapters", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "taskmap-native-shadow-"));
    const stationCalls: LlmStationRequest[] = [];
    const embeddingCalls: string[][] = [];
    const embeddingProvider: EmbeddingProvider = {
      async embed(texts) {
        embeddingCalls.push([...texts]);
        return texts.map(() => vector());
      },
    };
    try {
      const fragment = semanticFragment([
        {
          id: "ab-meeting-a",
          pointerId: "ab-meeting-a-pointer",
          sourceKind: "gemini_meet",
          semanticOriginId: digest("ab-origin-a"),
          candidateKind: "commitment",
          occurredAt: "2026-08-11T10:00:00.000Z",
        },
        {
          id: "ab-meeting-b",
          pointerId: "ab-meeting-b-pointer",
          sourceKind: "granola",
          semanticOriginId: digest("ab-origin-b"),
          candidateKind: "commitment",
          occurredAt: "2026-08-12T10:00:00.000Z",
        },
      ]);
      const baseline = await buildTaskMapNativeCommunityShadow(baseInput({
        candidateSemanticFragment: fragment,
      }));
      const semantic = await buildTaskMapNativeCommunityShadow(baseInput({
        candidateSemanticFragment: fragment,
        semanticEvidence: {
          station: station(stationCalls),
          embeddingProvider,
          embeddingModelId: "shadow-embedding-fixture",
          groupingReplayPath: path.join(root, "grouping"),
          embeddingCachePath: path.join(root, "embedding-cache.json"),
        },
      }));

      assert.deepEqual(
        stationCalls.map((call) => call.stationId),
        ["community-grouping-v1", "community-title-v1"],
      );
      assert.equal(embeddingCalls.length, 1);
      assert.equal(
        semantic.semanticEvidenceReport.grouping.state,
        "available",
        JSON.stringify(semantic.semanticEvidenceReport.grouping),
      );
      assert.equal(
        semantic.semanticEvidenceReport.embedding.state,
        "available",
        JSON.stringify(semantic.semanticEvidenceReport.embedding),
      );
      assert.notEqual(semantic.edges.digest, baseline.edges.digest);
      assert.ok(semantic.edges.count > baseline.edges.count);
      assert.deepEqual(
        semantic.proposalSet.proposals.map((proposal) => proposal.title),
        ["Ship the grouped shadow workstream"],
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists no node text, vectors, raw events, paths, or credentials", async () => {
    const privateText = "PRIVATE_SENTINEL_NEVER_PERSISTED";
    const fragment = semanticFragment([{
      id: "private-event",
      pointerId: "private-pointer",
      sourceKind: "gemini_meet",
      semanticOriginId: digest("private-origin"),
      candidateKind: "commitment",
      occurredAt: "2026-08-12T10:00:00.000Z",
      title: `Ship ${privateText}`,
      summary: `Bounded semantic context ${privateText}`,
      sharedRefDigest: SHARED_REF_DIGEST,
    }]);
    const result = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeed([
        agentEpisode("private agent", undefined, SHARED_REF_DIGEST),
      ]),
      candidateSemanticFragment: fragment,
      semanticEvidence: {
        groupingReplayPath: OWNER_PATH,
        station: {
          provider: {
            transport: "gemini-remote",
            executable: SECRET,
            args: [],
            model: "privacy-fixture-model",
          },
          async run(request) {
            return {
              stationId: request.stationId,
              model: "privacy-fixture-model",
              promptDigest: taskMapContractDigest(request.promptText),
              inputDigest: request.inputDigest,
              outputJson: '{"groups":[]}',
              producedAt: REQUESTED_AT,
              transport: "gemini-remote",
            };
          },
        },
      },
    }));
    const serialized = taskMapContractCanonicalJson(result);

    assert.equal(serialized.includes("private agent"), false);
    assert.equal(serialized.includes("private-event"), false);
    assert.equal(serialized.includes(privateText), false);
    assert.equal(serialized.includes(OWNER_PATH), false);
    assert.equal(serialized.includes(SECRET), false);
    assert.equal(serialized.includes("embedding"), true);
    assert.equal(serialized.includes('"embedding":['), false);
    assert.equal(serialized.includes('"text":'), false);
    assert.equal(serialized.includes('"taskMapInput":'), false);
  });

  it("removes repeated embedded secrets and owner-path tokens from fallback titles while preserving ordinary titles", async () => {
    const embeddedSecret = "prefixsk-proj-abcdefghijklmnop";
    const embeddedPath = "prefix/Users/neo/private-roadmap";
    const unsafe = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeedWithSummaries([
        `Ship ${embeddedSecret} ${embeddedPath}`,
        `Review ${embeddedSecret} ${embeddedPath}`,
      ]),
    }));
    const unsafeSerialized = taskMapContractCanonicalJson(unsafe);
    assert.equal(unsafeSerialized.includes(embeddedSecret), false);
    assert.equal(unsafeSerialized.includes(embeddedPath), false);
    assert.equal(unsafeSerialized.includes("Users neo private-roadmap"), false);

    const safe = await buildTaskMapNativeCommunityShadow(baseInput({
      agentSessionGraphFeed: agentFeedWithSummaries([
        "Ship ordinary roadmap",
        "Review ordinary roadmap",
      ]),
    }));
    assert.equal(
      safe.proposalSet.proposals[0]?.title,
      "ordinary roadmap",
    );
    assert.equal(
      safe.proposalSet.proposals[0]?.titleSource,
      "deterministic_fallback",
    );
  });

  it("rejects sensitive grouping and embedding model provenance anywhere in the artifact base", async () => {
    const unsafeGroupingModel = "semantic-owner@example.com";
    let unsafeGroupingCalls = 0;
    const unsafeGrouping = baseInput({
      semanticEvidence: {
        station: {
          provider: {
            transport: "gemini-remote",
            executable: "remote-api",
            args: [],
            model: unsafeGroupingModel,
          },
          async run(request) {
            unsafeGroupingCalls += 1;
            return {
              stationId: request.stationId,
              model: unsafeGroupingModel,
              promptDigest: taskMapContractDigest(request.promptText),
              inputDigest: request.inputDigest,
              outputJson: '{"groups":[]}',
              producedAt: REQUESTED_AT,
              transport: "gemini-remote",
            };
          },
        },
      },
    });
    const unsafeEmbedding = baseInput({
      semanticEvidence: {
        embeddingModelId:
          "model-prefix-sk-proj-abcdefghijklmnop-suffix",
      },
    });

    await assertShadowInvalidInput(unsafeGrouping);
    await assertShadowInvalidInput(unsafeEmbedding);
    assert.equal(unsafeGroupingCalls, 0);
  });

  it("binds exact legacy digests and exposes only non-authoritative shadow flags", async () => {
    const input = baseInput();
    const result = await buildTaskMapNativeCommunityShadow(input);

    assert.deepEqual(result.legacyBindings, input.legacyBindings);
    assert.equal(result.authority, "none");
    assert.equal(result.readAuthority, false);
    assert.equal(result.rankingMutated, false);
    assert.equal(result.bodyMutated, false);
    assert.equal(result.acceptanceStoreMutated, false);
    assert.equal(result.proposalSet.authority, "none");
    assert.equal(result.proposalSet.requiresOwnerAcceptance, true);
    assert.ok(
      Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
        <= TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumOutputBytes,
    );
  });

  it("rejects contradictory or non-canonical graph coverage claims", async () => {
    const baseline = baseInput().graphCollectionCoverage;
    for (const graphCollectionCoverage of [
      { ...structuredClone(baseline), completeness: "complete" as const },
      { ...structuredClone(baseline), completeness: "unknown" as const, truncationReasons: [] },
      {
        ...structuredClone(baseline),
        completeness: "bounded_partial" as const,
        truncationReasons: ["directory_limit" as const],
      },
      {
        ...structuredClone(baseline),
        discovery: {
          ...structuredClone(baseline.discovery),
          directoryLimit: 999,
        },
      },
    ]) {
      await assertShadowInvalidInput(baseInput({ graphCollectionCoverage }));
    }
    const feed = agentFeed([agentEpisode("coverage-feed")]);
    const bound = baseInput({ agentSessionGraphFeed: feed });
    for (const graphCollectionCoverage of [
      {
        ...structuredClone(bound.graphCollectionCoverage),
        observations: {
          ...structuredClone(bound.graphCollectionCoverage.observations),
          selectedObservations:
            bound.graphCollectionCoverage.observations.selectedObservations + 1,
        },
      },
      {
        ...structuredClone(bound.graphCollectionCoverage),
        observations: {
          ...structuredClone(bound.graphCollectionCoverage.observations),
          graphEpisodesSelected:
            bound.graphCollectionCoverage.observations.graphEpisodesSelected + 1,
        },
      },
      {
        ...structuredClone(bound.graphCollectionCoverage),
        observations: {
          ...structuredClone(bound.graphCollectionCoverage.observations),
          droppedGraphEpisodes:
            bound.graphCollectionCoverage.observations.droppedGraphEpisodes + 1,
        },
      },
      {
        ...structuredClone(bound.graphCollectionCoverage),
        discovery: {
          ...structuredClone(bound.graphCollectionCoverage.discovery),
          directoriesVisited: 1_025,
        },
      },
      {
        ...structuredClone(bound.graphCollectionCoverage),
        discovery: {
          ...structuredClone(bound.graphCollectionCoverage.discovery),
          candidatesDiscovered: 4_097,
        },
      },
      {
        ...structuredClone(bound.graphCollectionCoverage),
        observations: {
          ...structuredClone(bound.graphCollectionCoverage.observations),
          graphEpisodesSelected: 257,
        },
      },
    ]) {
      await assertShadowInvalidInput(baseInput({
        agentSessionGraphFeed: feed,
        graphCollectionCoverage,
      }));
    }
  });

  it("fails closed for malformed, unexpected, authority-widening, and oversized inputs", async () => {
    const invalidProducerFragment = semanticFragment([{
      id: "invalid-producer-event",
      pointerId: "invalid-producer-pointer",
      sourceKind: "gemini_meet",
      semanticOriginId: digest("invalid-producer-origin"),
      candidateKind: "commitment",
      occurredAt: "2026-08-12T10:00:00.000Z",
    }]);
    invalidProducerFragment.producer.id = "wrong-producer" as typeof invalidProducerFragment.producer.id;
    const invalidFreshnessFragment = semanticFragment([{
      id: "invalid-freshness-event",
      pointerId: "invalid-freshness-pointer",
      sourceKind: "gemini_meet",
      semanticOriginId: digest("invalid-freshness-origin"),
      candidateKind: "commitment",
      occurredAt: "2026-08-12T10:00:00.000Z",
    }]);
    invalidFreshnessFragment.freshness.validThrough =
      "2026-08-17T13:59:59.999Z";
    const malformedCases: unknown[] = [
      { ...baseInput(), unexpected: true },
      { ...baseInput(), requestedAt: "2026-08-17T12:00:00Z" },
      {
        ...baseInput(),
        expectedLegacyFlags: {
          ...baseInput().expectedLegacyFlags,
          readAuthority: true,
        },
      },
      {
        ...baseInput(),
        candidateSemanticFragment: {
          ...semanticFragment([{
            id: "bad-event",
            pointerId: "bad-pointer",
            sourceKind: "gemini_meet",
            semanticOriginId: digest("bad-origin"),
            candidateKind: "commitment",
            occurredAt: "2026-08-12T10:00:00.000Z",
          }]),
          ownerScopeDigest: digest("wrong-owner"),
        },
      },
      {
        ...baseInput(),
        candidateSemanticFragment: invalidProducerFragment,
      },
      {
        ...baseInput(),
        candidateSemanticFragment: invalidFreshnessFragment,
      },
      {
        ...baseInput(),
        previousAcceptedRoots: [{
          rootProposalId: "x".repeat(
            TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumInputBytes,
          ),
          memberNodeIds: [],
        }],
      },
    ];
    for (const malformed of malformedCases) {
      await assert.rejects(
        buildTaskMapNativeCommunityShadow(
          malformed as TaskMapNativeCommunityShadowInputV1,
        ),
        /Task Map native community shadow/,
      );
    }
  });

  it("rejects semantic evidence timestamps that are not canonical UTC milliseconds", async () => {
    await assert.rejects(
      buildTaskMapNativeCommunityShadow(baseInput({
        semanticEvidence: {
          station: {
            provider: {
              transport: "gemini-remote",
              executable: "remote-api",
              args: [],
              model: "timestamp-fixture-model",
            },
            async run(request) {
              return {
                stationId: request.stationId,
                model: "timestamp-fixture-model",
                promptDigest: taskMapContractDigest(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: '{"groups":[]}',
                producedAt: "2026-08-17T05:00:00.000-07:00",
                transport: "gemini-remote",
              };
            },
          },
        },
      })),
      /Task Map native community shadow/,
    );
  });

  it("binds semantic fragment freshness to the artifact requestedAt instant", async () => {
    const fragment = () => semanticFragment([{
      id: "freshness-bound-event",
      pointerId: "freshness-bound-pointer",
      sourceKind: "gemini_meet",
      semanticOriginId: digest("freshness-bound-origin"),
      candidateKind: "commitment",
      occurredAt: "2026-08-12T10:00:00.000Z",
    }]);
    const future = fragment();
    future.freshness = {
      ...future.freshness,
      producedAt: "2026-08-17T13:00:00.000Z",
      validThrough: "2026-08-17T17:00:00.000Z",
      assessedAt: "2026-08-17T13:00:00.000Z",
    };
    const expired = fragment();
    expired.freshness = {
      ...expired.freshness,
      producedAt: "2026-08-17T08:00:00.000Z",
      validThrough: REQUESTED_AT,
      assessedAt: "2026-08-17T09:00:00.000Z",
    };

    for (const invalidFragment of [future, expired]) {
      await assert.rejects(
        buildTaskMapNativeCommunityShadow(baseInput({
          candidateSemanticFragment: invalidFragment,
        })),
        (error: unknown) => {
          assert.ok(error instanceof TaskMapNativeCommunityShadowUnavailableError);
          assert.equal(error.code, "invalid_input");
          return true;
        },
      );
    }
  });

  it("rejects exact POSIX owner paths in previous root and member IDs", async () => {
    const fixture = await reusableCommunityFixture();
    const safeReuse = await buildTaskMapNativeCommunityShadow(baseInput({
      ...fixture.input,
      previousAcceptedRoots: [{
        rootProposalId: "historical-safe-root",
        memberNodeIds: fixture.memberNodeIds,
      }],
    }));
    assert.equal(
      safeReuse.proposalSet.proposals[0]?.rootProposalId,
      "historical-safe-root",
    );

    const unsafeRootId = "/Users/neo/private/root-proposal";
    await assertPreviousRootPrivacyRejected(baseInput({
      ...fixture.input,
      previousAcceptedRoots: [{
        rootProposalId: unsafeRootId,
        memberNodeIds: fixture.memberNodeIds,
      }],
    }), unsafeRootId);

    const unsafeMemberId = "/Users/neo/private/member-node";
    await assertPreviousRootPrivacyRejected(baseInput({
      ...fixture.input,
      previousAcceptedRoots: [{
        rootProposalId: "historical-safe-root",
        memberNodeIds: [...fixture.memberNodeIds, unsafeMemberId],
      }],
    }), unsafeMemberId);
  });

  it("rejects Windows paths, file URIs, credentials, tokens, and ill-formed Unicode in previous roots", async () => {
    const fixture = await reusableCommunityFixture();
    const unsafeCases = [
      "C:\\Users\\neo\\private\\root",
      "file:///Users/neo/private/member-node",
      "token=super-secret-value",
      "ghp_abcdefghijklmnop1234567890",
      "prefix-sk-proj-abcdefghijklmnop-suffix",
      "prefix-grn_abcdefghijkl-suffix",
      "prefix-dbk_abcdefghijkl-suffix",
      "prefix-abcdefgh.ijklmnop.qrstuvwx-suffix",
      "prefix/Users/neo/private-root",
      "historical-owner@example.com",
      "lone-surrogate-\uD800",
    ];
    for (const [index, unsafeValue] of unsafeCases.entries()) {
      await assertPreviousRootPrivacyRejected(baseInput({
        ...fixture.input,
        previousAcceptedRoots: [{
          rootProposalId: index % 2 === 0
            ? unsafeValue
            : `historical-safe-root-${index}`,
          memberNodeIds: index % 2 === 0
            ? fixture.memberNodeIds
            : [...fixture.memberNodeIds, unsafeValue],
        }],
      }), unsafeValue);
    }
  });

  it("rejects every malformed previous-root invariant locally as invalid_input", async () => {
    const fixture = await reusableCommunityFixture();
    const member = fixture.memberNodeIds[0]!;
    const maximumRoots =
      TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots;
    const maximumMembers =
      TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxMembersPerPreviousRoot;
    const aggregateLimit =
      TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal;
    const memberIds = (
      rootIndex: number,
      count: number,
      length = 0,
    ): string[] => Array.from({ length: count }, (_unused, memberIndex) => {
      const prefix = `member-${rootIndex}-${memberIndex}-`;
      return length === 0
        ? prefix.slice(0, -1)
        : prefix + "x".repeat(Math.max(0, length - prefix.length));
    });
    const tooManyRoots = Array.from(
      { length: maximumRoots + 1 },
      (_unused, index) => ({
        rootProposalId: `root-${index}`,
        memberNodeIds: [`member-${index}`],
      }),
    );
    const aggregateRoots = Array.from(
      { length: Math.ceil((aggregateLimit + 1) / maximumMembers) },
      (_unused, index) => {
        const retainedBefore = index * maximumMembers;
        const remaining = aggregateLimit + 1 - retainedBefore;
        return {
          rootProposalId: `aggregate-root-${index}`,
          memberNodeIds: memberIds(
            index,
            Math.min(maximumMembers, Math.max(0, remaining)),
          ),
        };
      },
    );
    const byteBoundRoots = Array.from({ length: 11 }, (_unused, index) => ({
      rootProposalId: `byte-root-${index}`,
      memberNodeIds: memberIds(index, 372, 280),
    }));
    assert.ok(
      Buffer.byteLength(
        taskMapContractCanonicalJson(byteBoundRoots),
        "utf8",
      ) > TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRootsBytes,
    );
    assert.ok(
      Buffer.byteLength(
        taskMapContractCanonicalJson(baseInput({
          ...fixture.input,
          previousAcceptedRoots: byteBoundRoots,
        })),
        "utf8",
      ) < TASKMAP_NATIVE_COMMUNITY_SHADOW_LIMITS_V1.maximumInputBytes,
    );

    const malformedPreviousRoots = [
      [{ rootProposalId: "", memberNodeIds: [member] }],
      [{ rootProposalId: "empty-members", memberNodeIds: [] }],
      [{ rootProposalId: "duplicate-members", memberNodeIds: [member, member] }],
      [
        { rootProposalId: "duplicate-root", memberNodeIds: [member] },
        { rootProposalId: "duplicate-root", memberNodeIds: [member] },
      ],
      [{
        rootProposalId: "too-many-members",
        memberNodeIds: memberIds(0, maximumMembers + 1),
      }],
      tooManyRoots,
      aggregateRoots,
      byteBoundRoots,
    ];
    for (const previousAcceptedRoots of malformedPreviousRoots) {
      await assertShadowInvalidInput(baseInput({
        ...fixture.input,
        previousAcceptedRoots,
      }));
    }
  });

  it("builds a deterministic, bounded unavailable receipt without error strings", () => {
    const input = baseInput();
    const first = buildTaskMapNativeCommunityShadowUnavailableReceipt({
      ownerScopeDigest: input.ownerScopeDigest,
      requestedAt: input.requestedAt,
      legacyBindings: input.legacyBindings,
      graphCollectionCoverage: input.graphCollectionCoverage,
    });
    const second = buildTaskMapNativeCommunityShadowUnavailableReceipt({
      ownerScopeDigest: input.ownerScopeDigest,
      requestedAt: input.requestedAt,
      legacyBindings: input.legacyBindings,
      graphCollectionCoverage: input.graphCollectionCoverage,
    });

    assert.deepEqual(second, first);
    assert.equal(
      first.contractVersion,
      TASKMAP_NATIVE_COMMUNITY_SHADOW_UNAVAILABLE_VERSION,
    );
    assert.equal(first.availability, "unavailable");
    assert.equal(first.authority, "none");
    assert.equal(first.readAuthority, false);
    assert.equal(Object.hasOwn(first, "error"), false);
    assert.equal(Object.hasOwn(first, "reason"), false);
    assert.ok(
      Buffer.byteLength(taskMapContractCanonicalJson(first), "utf8") < 2_048,
    );
  });

  it("records the community title envelope and replays it without the title station", async () => {
    const replayRoot = await mkdtemp(
      path.join(tmpdir(), "taskmap-title-replay-"),
    );
    try {
      const titleReplayPath = path.join(
        replayRoot,
        "llm-envelopes",
        "community-title-v1",
      );
      const feed = agentFeed([
        agentEpisode(
          "title-replay-a",
          undefined,
          digest("title-replay-directive-a"),
        ),
        agentEpisode(
          "title-replay-b",
          "2026-08-12T10:00:00.000Z",
          digest("title-replay-directive-b"),
        ),
      ]);
      let titleCalls = 0;
      const liveStation = (
        onTitle: () => LlmStationEnvelope | never,
      ): LlmStation => ({
        provider: {
          transport: "gemini-remote",
          executable: "injected-title-replay-station",
          args: [],
          model: "title-replay-fixture",
        },
        async run(request) {
          if (request.stationId === "community-title-v1") {
            return onTitle();
          }
          const payload = JSON.parse(
            request.promptText.split("\n").at(-1) ?? "{}",
          ) as { nodes?: Array<{ nodeId: string }> };
          return {
            stationId: request.stationId,
            model: "title-replay-fixture",
            promptDigest: taskMapContractDigest(request.promptText),
            inputDigest: request.inputDigest,
            outputJson: JSON.stringify({
              groups: [{
                nodeIds: (payload.nodes ?? []).map((node) => node.nodeId),
              }],
            }),
            producedAt: REQUESTED_AT,
            transport: "gemini-remote",
          };
        },
      });
      const titleEnvelope = (promptText: string, inputDigest: string) => {
        titleCalls += 1;
        const payload = JSON.parse(
          promptText.split("\n").at(-1) ?? "{}",
        ) as { communities?: Array<{ baseRootProposalId?: string }> };
        return {
          stationId: "community-title-v1" as const,
          model: "title-replay-fixture",
          promptDigest: taskMapContractDigest(promptText),
          inputDigest,
          outputJson: JSON.stringify({
            titles: (payload.communities ?? []).map((community) => ({
              baseRootProposalId: community.baseRootProposalId,
              title: "Recorded replay workstream",
            })),
          }),
          producedAt: REQUESTED_AT,
          transport: "gemini-remote" as const,
        };
      };
      const recordingStation: LlmStation = {
        ...liveStation(() => {
          throw new Error("unused");
        }),
        async run(request) {
          if (request.stationId === "community-title-v1") {
            return titleEnvelope(request.promptText, request.inputDigest);
          }
          return liveStation(() => {
            throw new Error("unused");
          }).run(request);
        },
      };
      const first = await buildTaskMapNativeCommunityShadow(baseInput({
        agentSessionGraphFeed: feed,
        semanticEvidence: {
          station: recordingStation,
          titleReplayPath,
        },
      }));
      assert.equal(titleCalls, 1);
      assert.equal(
        first.proposalSet.titleGeneration?.source,
        "live_station",
      );
      assert.equal(
        first.proposalSet.proposals[0]?.title,
        "Recorded replay workstream",
      );
      const recordedFiles = await readdir(titleReplayPath);
      assert.equal(recordedFiles.length, 1);
      assert.match(recordedFiles[0]!, /^[a-f0-9]{64}\.json$/);

      const throwingTitleStation: LlmStation = {
        ...recordingStation,
        async run(request) {
          if (request.stationId === "community-title-v1") {
            throw new Error("title station must replay from disk");
          }
          return recordingStation.run(request);
        },
      };
      const second = await buildTaskMapNativeCommunityShadow(baseInput({
        agentSessionGraphFeed: feed,
        semanticEvidence: {
          station: throwingTitleStation,
          titleReplayPath,
        },
      }));
      assert.equal(titleCalls, 1);
      assert.equal(
        second.proposalSet.titleGeneration?.source,
        "recorded_replay",
      );
      assert.deepEqual(
        second.proposalSet.proposals,
        first.proposalSet.proposals,
      );

      // A corrupted recording must fall back to the live station instead of
      // failing the plan.
      await writeFile(
        path.join(titleReplayPath, recordedFiles[0]!),
        "{\"not\":\"an envelope\"}",
        { mode: 0o600 },
      );
      const third = await buildTaskMapNativeCommunityShadow(baseInput({
        agentSessionGraphFeed: feed,
        semanticEvidence: {
          station: recordingStation,
          titleReplayPath,
        },
      }));
      assert.equal(titleCalls, 2);
      assert.equal(
        third.proposalSet.titleGeneration?.source,
        "live_station",
      );
      assert.deepEqual(
        third.proposalSet.proposals,
        first.proposalSet.proposals,
      );

      // The corrupted recording was evicted and re-recorded, so replay
      // works again without the station.
      const fourth = await buildTaskMapNativeCommunityShadow(baseInput({
        agentSessionGraphFeed: feed,
        semanticEvidence: {
          station: throwingTitleStation,
          titleReplayPath,
        },
      }));
      assert.equal(titleCalls, 2);
      assert.equal(
        fourth.proposalSet.titleGeneration?.source,
        "recorded_replay",
      );
    } finally {
      await rm(replayRoot, { recursive: true, force: true });
    }
  });
});
