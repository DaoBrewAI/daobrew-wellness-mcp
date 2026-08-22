#!/usr/bin/env node

import { homedir } from "node:os";
import path from "node:path";

import { loadConfirmedTaskMapOwner } from "../../identity.js";
import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  loadTaskMapAgentSessionProducerResult,
} from "./agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
  buildTaskMapAgentSessionGraphFeedFromSnapshot,
  type TaskMapAgentSessionSemanticAdmissionV2,
} from "./agent-session-semantic-admission.js";
import {
  loadVerifiedTaskMapAgentSessionExtractionReport,
  type TaskMapAgentSessionExtractionReportV1,
} from "./agent-session-refresh-llm-replay.js";
import {
  buildTaskMapAgentSessionCandidateReview,
} from "./agent-session-candidate-adapter.js";
import {
  buildTaskMapCalendarCandidateReview,
} from "./calendar-candidate-adapter.js";
import {
  loadTaskMapCalendarProducerResult,
} from "./calendar-producer-freshness.js";
import {
  buildTaskMapCalendarSemanticFragment,
  loadCurrentTaskMapCalendarExtractionProof,
  type TaskMapCalendarExtractionReportV1,
} from "./calendar-refresh-llm-replay.js";
import {
  loadTaskMapMeetingProducerResult,
} from "./meeting-producer-freshness.js";
import {
  buildTaskMapGranolaSemanticFragment,
  buildTaskMapUnifiedMeetingCandidateContext,
} from "./meeting-refresh-llm-replay.js";
import {
  acceptedPromotionIdsInVerifiedTaskMapProjection,
  emptyTaskMapSemanticInputForAcceptedReceipts,
  loadCurrentTaskMapOwnerGranolaExtractionReport,
  mergeTaskMapSemanticFragment,
} from "./native-refresh-service.js";
import {
  taskMapNativeSemanticInputFromMeetingProducerResult,
  type TaskMapNativeSemanticBuilderInputV1,
} from "./native-semantic-builder-adapter.js";
import {
  buildTaskMapNativeCommunityPlan,
  buildTaskMapNativeCommunityRootEvidence,
  taskMapNativeCommunityCandidateNodeBindings,
  TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1,
  TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
  type TaskMapNativeCommunityGraphCoverageV1,
} from "./native-community-shadow.js";
import {
  loadTaskMapCommunityTaskDigestionReport,
} from "./community-task-digestion.js";
import {
  TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME,
} from "./native-refresh-service.js";
import {
  buildTaskMapNativeCandidateHierarchy,
} from "./native-candidate-hierarchy.js";
import {
  filterTaskMapNativeCandidateShelfAgainstAcceptanceStore,
  loadTaskMapNativeCandidateAcceptanceStore,
  type TaskMapNativeCandidateAcceptanceStoreV1,
} from "./native-candidate-acceptance.js";
import {
  applyTaskMapNativeCandidateReviewToProofRows,
  assertTaskMapNativeCandidateShelfV2,
  assertTaskMapNativeCandidateShelfV3,
  buildTaskMapNativeCandidateReview,
  buildTaskMapNativeCandidateReviewFromProofRows,
  buildTaskMapNativeCandidateShelf,
  loadTaskMapNativeCandidateReview,
  reduceTaskMapNativeCandidateReview,
  reduceTaskMapNativeCandidateReviewFromProofRows,
  TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION,
  TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
  TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3,
  taskMapNativeCandidateReviewCanonicalBytes,
  upgradeTaskMapNativeCandidateShelfV1,
  withTaskMapNativeCandidateReviewTransaction,
  writeTaskMapNativeCandidateReview,
  type TaskMapNativeCandidateReviewAction,
  type TaskMapNativeCandidateReviewV1,
  type TaskMapNativeCandidateShelfV1,
  type TaskMapNativeCandidateShelfRowV1,
  type TaskMapNativeCandidateShelfRowV2,
  type TaskMapNativeCandidateAcceptedPendingShelfRowV2,
  type TaskMapNativeCandidateShelfV2,
  type TaskMapNativeCandidateShelfV3,
  type TaskMapNativeCandidateProofRowsContextV1,
} from "./native-candidate-review.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN =
  "taskmap-native-candidate-review-cli-idempotency.1" as const;
export const TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES =
  128 * 1024;

const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const OVERLAY_FILE_NAME = "native-candidate-review.v1.json";
const ACCEPTANCE_FILE_NAME = "native-candidate-acceptance.v1.json";
const USAGE =
  "usage: native-candidate-review-cli --list | "
  + "--review <candidateId> --revision <64hex> "
  + "--action accept_for_review|dismiss";

export function retainReceiptBackedPendingRows(
  candidates: readonly TaskMapNativeCandidateShelfRowV2[],
  acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null,
  publishedPromotionIds: ReadonlySet<string>,
): {
  candidates: TaskMapNativeCandidateShelfRowV2[];
  durableConfirmedCandidateIds: string[];
} {
  if (acceptanceStore === null) {
    return { candidates: [...candidates], durableConfirmedCandidateIds: [] };
  }
  const byCandidateId = new Map(candidates.map((candidate) => [
    candidate.candidateId,
    candidate,
  ] as const));
  for (const receipt of acceptanceStore.receipts) {
    if (publishedPromotionIds.has(receipt.promotionId)) continue;
    const current = byCandidateId.get(receipt.candidateId);
    const currentMatchesReceipt = current !== undefined
      && current.candidateRevisionDigest === receipt.candidateRevisionDigest
      && current.statementReferenceDigest === receipt.statementReferenceDigest
      && current.evidenceProofDigests.length === receipt.evidenceProofDigests.length
      && current.evidenceProofDigests.every((proof, index) =>
        proof === receipt.evidenceProofDigests[index]
      );
    if (currentMatchesReceipt) continue;
    const pending: TaskMapNativeCandidateAcceptedPendingShelfRowV2 = {
      candidateId: receipt.candidateId,
      candidateRevisionDigest: receipt.candidateRevisionDigest,
      statementReferenceDigest: receipt.statementReferenceDigest,
      evidenceProofDigests: [...receipt.evidenceProofDigests],
      candidateFamily: "accepted_pending",
      kind: receipt.accepted.kind,
      title: receipt.accepted.title,
      summary: receipt.accepted.summary,
      speechActClass: receipt.accepted.speechActClass,
      speechActActor: receipt.accepted.speechActActor,
      confidence: receipt.accepted.confidence,
      mentionIdentityDigest: receipt.accepted.mentionIdentityDigest,
      sourceKinds: ["accepted_pending"],
      occurredAt: receipt.accepted.occurredAt,
      observedAt: receipt.accepted.observedAt,
      reviewState: "unreviewed",
      reviewedAt: null,
      reviewedOnly: false,
      promotionEligible: false,
      acceptedWork: false,
      sourceWritebackEligible: false,
      rankEligible: false,
      routeEligible: false,
      proveEligible: false,
      runEligible: false,
    };
    byCandidateId.set(pending.candidateId, pending);
  }
  const retained = [...byCandidateId.values()].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  );
  const durableConfirmedCandidateIds = [...new Set(
    acceptanceStore.receipts.flatMap((receipt) =>
      !publishedPromotionIds.has(receipt.promotionId)
        && byCandidateId.has(receipt.candidateId)
        ? [receipt.candidateId]
        : []
    ),
  )].sort();
  return { candidates: retained, durableConfirmedCandidateIds };
}

export type TaskMapNativeCandidateReviewCommand =
  | { kind: "list" }
  | {
    kind: "review";
    candidateId: string;
    candidateRevisionDigest: string;
    action: Exclude<TaskMapNativeCandidateReviewAction, "defer">;
  };

function usageError(): never {
  throw new TypeError(USAGE);
}

export function parseTaskMapNativeCandidateReviewCommand(
  argv: readonly string[],
): TaskMapNativeCandidateReviewCommand {
  if (argv.length === 1 && argv[0] === "--list") {
    return { kind: "list" };
  }
  if (
    argv.length !== 6
    || argv[0] !== "--review"
    || !CANDIDATE_ID.test(argv[1] ?? "")
    || argv[2] !== "--revision"
    || !SHA256.test(argv[3] ?? "")
    || argv[4] !== "--action"
    || (argv[5] !== "accept_for_review" && argv[5] !== "dismiss")
  ) {
    usageError();
  }
  return {
    kind: "review",
    candidateId: argv[1],
    candidateRevisionDigest: argv[3],
    action: argv[5],
  };
}

async function resolveConfirmedOwner(homeDirectory: string) {
  const environment = (process.env.DAOBREW_USER_ID ?? "").trim();
  const plan = await loadConfirmedTaskMapOwner(
    homeDirectory,
    environment.length === 0 ? {} : { userId: environment },
  );
  if (!plan.ok) {
    throw new Error("candidate review owner is unavailable");
  }
  return plan.owner;
}

export function taskMapNativeCandidateReviewOverlayPath(
  taskMapRoot: string,
): string {
  const overlayPath = path.join(taskMapRoot, OVERLAY_FILE_NAME);
  if (
    !path.isAbsolute(overlayPath)
    || path.normalize(overlayPath) !== overlayPath
  ) {
    throw new Error("candidate review storage is unavailable");
  }
  return overlayPath;
}

function idempotencyKeyDigest(input: {
  ownerScopeDigest: string;
  candidateId: string;
  candidateRevisionDigest: string;
  action: "accept_for_review" | "dismiss";
}): string {
  return taskMapContractDigest({
    domain: TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN,
    ownerScopeDigest: input.ownerScopeDigest,
    candidateId: input.candidateId,
    candidateRevisionDigest: input.candidateRevisionDigest,
    action: input.action,
  });
}

async function persistWhenChanged(
  overlayPath: string,
  expectedOwnerScopeDigest: string,
  previous: TaskMapNativeCandidateReviewV1 | null,
  current: TaskMapNativeCandidateReviewV1,
): Promise<void> {
  if (
    previous !== null
    && taskMapNativeCandidateReviewCanonicalBytes(previous)
      === taskMapNativeCandidateReviewCanonicalBytes(current)
  ) {
    return;
  }
  await writeTaskMapNativeCandidateReview({
    overlayPath,
    expectedOwnerScopeDigest,
    overlay: current,
  });
}

function reviewHierarchyCoverage(
  inputObservations: number,
  selectedEpisodes: number,
  deduplicatedEpisodes: number,
): TaskMapNativeCommunityGraphCoverageV1 {
  return {
    contractVersion: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
    discovery: {
      directoriesVisited: 0,
      candidatesDiscovered: inputObservations,
      directoryLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.directoryLimit,
      candidateLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.candidateLimit,
      directoryLimitReached: false,
      candidateLimitReached: false,
    },
    reads: {
      attemptedFiles: 0,
      attemptLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.attemptLimit,
      droppedAttemptLimit: 0,
      droppedInvalid: 0,
    },
    scan: {
      chargedBytes: 0,
      globalByteLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.globalScanByteLimit,
      perFileByteLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.perFileScanByteLimit,
      droppedScanBudget: 0,
    },
    observations: {
      selectedObservations: inputObservations,
      observationLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.observationLimit,
      droppedObservationLimit: 0,
      rawBytesSelected: 0,
      rawByteLimit: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.rawByteLimit,
      droppedRawByteBudget: 0,
      graphEpisodesSelected: selectedEpisodes,
      maxGraphEpisodes: TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.maxGraphEpisodes,
      droppedGraphEpisodes: Math.max(0, deduplicatedEpisodes - selectedEpisodes),
    },
    distribution: { codexSelected: 0, claudeSelected: 0, isoWeeksSelected: 0 },
    completeness: "unknown",
    truncationReasons: ["not_collected"],
    authority: "none",
    privacy: {
      pathsPersisted: false,
      textPersisted: false,
      secretsPersisted: false,
      vectorsPersisted: false,
    },
  };
}

const DETERMINISTIC_TOPIC_STOPWORDS = new Set([
  "about", "add", "after", "again", "also", "and", "before", "build",
  "can", "complete", "create", "current", "decide", "ensure", "fix",
  "for", "from", "implement", "into", "local", "make", "new", "now",
  "replace", "review", "run", "task", "tasks", "taskmap", "test", "that",
  "the", "this", "tdd", "then", "use", "using", "with", "work",
]);

function deterministicTopicTokens(value: string): string[] {
  return [...new Set(value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) =>
      token.length > 2 && !DETERMINISTIC_TOPIC_STOPWORDS.has(token)
    ))].sort();
}

function deterministicCandidateFallback(input: {
  candidates: readonly TaskMapNativeCandidateShelfRowV2[];
  candidateNodeBindings: ReadonlyArray<{
    candidateId: string;
    nodeIds: string[];
  }>;
  candidateIds: readonly string[];
}): {
  proposals: Array<{
    rootProposalId: string;
    title: string;
    titleSource: "deterministic_fallback";
    memberNodeIds: string[];
  }>;
  candidateNodeBindings: Array<{ candidateId: string; nodeIds: string[] }>;
} {
  const candidates = input.candidates
    .filter((candidate) => input.candidateIds.includes(candidate.candidateId))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const existingBindings = new Map(input.candidateNodeBindings.map((binding) => [
    binding.candidateId,
    binding.nodeIds,
  ] as const));
  const bindings = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    nodeIds: existingBindings.get(candidate.candidateId)
      ?? [`candidate-fallback:${candidate.candidateId}`],
  }));
  const tokenSets = candidates.map((candidate) => new Set(
    deterministicTopicTokens(`${candidate.title} ${candidate.summary}`),
  ));
  const parents = candidates.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[index] !== index) {
      const next = parents[index]!;
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const join = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const leftCandidate = candidates[left]!;
      const rightCandidate = candidates[right]!;
      const sameExtractedTopic =
        "originIdentityDigest" in leftCandidate
        && "originIdentityDigest" in rightCandidate
        && leftCandidate.originIdentityDigest === rightCandidate.originIdentityDigest;
      const sharedSemanticToken = [...tokenSets[left]!].some((token) =>
        tokenSets[right]!.has(token)
      );
      if (sameExtractedTopic || sharedSemanticToken) join(left, right);
    }
  }
  const grouped = new Map<number, number[]>();
  for (let index = 0; index < candidates.length; index += 1) {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), index]);
  }
  const singletonIndexes: number[] = [];
  const clusters = [...grouped.values()].filter((indexes) => {
    if (indexes.length > 1) return true;
    singletonIndexes.push(indexes[0]!);
    return false;
  });
  if (singletonIndexes.length > 0) clusters.push(singletonIndexes);
  const proposalRows = clusters.map((indexes) => {
    const clusterCandidates = indexes.map((index) => candidates[index]!);
    const memberCandidateIds = clusterCandidates.map((row) => row.candidateId).sort();
    const tokenCounts = new Map<string, number>();
    for (const index of indexes) {
      for (const token of tokenSets[index]!) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
    const commonTokens = [...tokenCounts]
      .filter(([, count]) => count >= Math.max(2, Math.ceil(indexes.length / 2)))
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([token]) => token);
    const title = commonTokens.length > 0
      ? commonTokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" · ")
      : indexes.length === 1
        ? clusterCandidates[0]!.title.slice(0, 120)
        : "Other work";
    const rootProposalId = `tmcandidatefallback_${taskMapContractDigest({
      memberCandidateIds,
      title,
    }).slice(0, 32)}`;
    const memberNodeIds = bindings
      .filter((binding) => memberCandidateIds.includes(binding.candidateId))
      .flatMap((binding) => binding.nodeIds)
      .filter((nodeId, index, values) => values.indexOf(nodeId) === index)
      .sort();
    return {
      rootProposalId,
      title,
      titleSource: "deterministic_fallback" as const,
      memberNodeIds,
    };
  }).sort((left, right) => left.rootProposalId.localeCompare(right.rootProposalId));
  return { proposals: proposalRows, candidateNodeBindings: bindings };
}

async function addEngineAuthoredCandidateHierarchy(input: {
  shelf: TaskMapNativeCandidateShelfV2;
  durableConfirmedCandidateIds: string[];
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  assessedAt: string;
  meetingResult: Awaited<ReturnType<typeof loadTaskMapMeetingProducerResult>> | null;
  granolaReport: Awaited<ReturnType<typeof loadCurrentTaskMapOwnerGranolaExtractionReport>> | null;
  calendarResult: Awaited<ReturnType<typeof loadTaskMapCalendarProducerResult>>;
  calendarExtraction: TaskMapCalendarExtractionReportV1 | null;
  agentSnapshot: Parameters<typeof buildTaskMapAgentSessionSemanticAdmission>[0] | null;
  agentAdmission: TaskMapAgentSessionSemanticAdmissionV2 | null;
}): Promise<TaskMapNativeCandidateShelfV3> {
  let hierarchy: ReturnType<typeof buildTaskMapNativeCandidateHierarchy>;
  try {
    let semanticFragment: TaskMapNativeSemanticBuilderInputV1 =
      input.meetingResult === null
        ? emptyTaskMapSemanticInputForAcceptedReceipts(
            input.ownerScopeDigest,
            input.assessedAt,
          )
        : taskMapNativeSemanticInputFromMeetingProducerResult(
            input.meetingResult,
            input.ownerScopeDigest,
          );
    if (input.granolaReport !== null) {
      semanticFragment = mergeTaskMapSemanticFragment(
        semanticFragment,
        buildTaskMapGranolaSemanticFragment(input.granolaReport),
      );
    }
    if (input.calendarExtraction !== null) {
      semanticFragment = mergeTaskMapSemanticFragment(
        semanticFragment,
        buildTaskMapCalendarSemanticFragment(
          input.calendarResult,
          input.calendarExtraction,
        ),
      );
    }
    const feed = input.agentSnapshot === null
      ? null
      : buildTaskMapAgentSessionGraphFeedFromSnapshot(input.agentSnapshot);
    const plan = await buildTaskMapNativeCommunityPlan({
      ownerScopeDigest: input.ownerScopeDigest,
      requestedAt: input.assessedAt,
      agentSessionGraphFeed: feed,
      graphCollectionCoverage: reviewHierarchyCoverage(
        feed?.counts.inputObservations ?? 0,
        feed?.counts.selectedEpisodes ?? 0,
        feed?.counts.deduplicatedEpisodes ?? 0,
      ),
      candidateSemanticFragment: semanticFragment,
      semanticEvidence: {
        station: null,
        embeddingProvider: null,
        embeddingModelId: null,
        groupingReplayPath: path.join(
          input.taskMapRoot,
          "llm-envelopes",
          "community-grouping-v1",
        ),
        embeddingCachePath: path.join(
          input.taskMapRoot,
          "llm-envelopes",
          "community-embeddings.v1.json",
        ),
        titleReplayPath: path.join(
          input.taskMapRoot,
          "llm-envelopes",
          "community-title-v1",
        ),
      },
      previousAcceptedRoots: [],
    });
    const semanticBindings = taskMapNativeCommunityCandidateNodeBindings(
      semanticFragment,
      input.ownerScopeDigest,
      input.assessedAt,
    );
    const semanticNodeByStatement = new Map(semanticBindings.map((binding) => [
      binding.statementReferenceDigest,
      binding.nodeId,
    ] as const));
    const candidateNodeBindings = input.shelf.candidates.map((candidate) => {
      if (candidate.candidateFamily !== "agent_session") {
        const nodeId = semanticNodeByStatement.get(
          candidate.statementReferenceDigest,
        );
        return { candidateId: candidate.candidateId, nodeIds: nodeId === undefined ? [] : [nodeId] };
      }
      const cluster = input.agentAdmission?.clusters.find((value) =>
        value.clusterIdentityDigest === candidate.originIdentityDigest
      );
      const nodeIds = cluster === undefined || feed === null ? [] : feed.episodes
        .filter((episode) =>
          episode.workstreamIdentityDigest === cluster.workstreamIdentityDigest
          && episode.directiveSemanticDigest === cluster.directiveSemanticDigest
        )
        .map((episode) => episode.graphEpisodeId)
        .sort();
      return { candidateId: candidate.candidateId, nodeIds };
    }).filter((binding) => binding.nodeIds.length > 0);
    const subtasks: Array<{
      rootProposalId: string;
      subtaskId: string;
      title: string;
      summary: string;
      memberNodeIds: string[];
    }> = [];
    if (feed !== null && plan.groupingAvailable) {
      const rootEvidence = buildTaskMapNativeCommunityRootEvidence({
        plan,
        feed,
        generatedAt: input.assessedAt,
        currentAdmission: input.agentAdmission,
      });
      const report = await loadTaskMapCommunityTaskDigestionReport(
        path.join(
          input.runtimeRoot,
          TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME,
        ),
      );
      const episodeByRef = new Map<string, string>(feed.episodes.map((episode) => [
        `episode:${episode.episodeIdentityDigest}`,
        episode.graphEpisodeId,
      ] as const));
      const nodeByEvidence = new Map(rootEvidence.taskMapInput.events.flatMap(
        (event) => {
          const nodeId = event.objectRefs.map((reference) =>
            episodeByRef.get(reference)
          ).find((value) => value !== undefined);
          return nodeId === undefined ? [] : [[event.id, nodeId] as const];
        },
      ));
      const currentRootIDs = new Set(
        rootEvidence.rootProposals.map((root) => root.proposalId),
      );
      for (const root of report?.roots ?? []) {
        if (!currentRootIDs.has(root.rootProposalId)) continue;
        for (const task of root.tasks) {
          const memberNodeIds = task.evidenceEventIds.flatMap((eventId) => {
            const nodeId = nodeByEvidence.get(eventId);
            return nodeId === undefined ? [] : [nodeId];
          });
          if (memberNodeIds.length === 0) continue;
          subtasks.push({
            rootProposalId: root.rootProposalId,
            subtaskId: task.taskProposalId,
            title: task.title,
            summary: task.summary,
            memberNodeIds: [...new Set(memberNodeIds)].sort(),
          });
        }
      }
    }
    const baseHierarchy = buildTaskMapNativeCandidateHierarchy({
      producerSnapshotDigest: input.shelf.producerSnapshotDigest,
      candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
      groupingAvailable:
        plan.groupingAvailable || plan.proposalSet.proposals.length > 0,
      proposals: plan.proposalSet.proposals,
      candidateNodeBindings,
      subtasks,
    });
    if (baseHierarchy.ungroupedCandidateIds.length === 0) {
      hierarchy = baseHierarchy;
    } else {
      const fallback = deterministicCandidateFallback({
        candidates: input.shelf.candidates,
        candidateNodeBindings,
        candidateIds: baseHierarchy.ungroupedCandidateIds,
      });
      hierarchy = buildTaskMapNativeCandidateHierarchy({
        producerSnapshotDigest: input.shelf.producerSnapshotDigest,
        candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
        groupingAvailable: true,
        proposals: [...plan.proposalSet.proposals, ...fallback.proposals],
        candidateNodeBindings: [
          ...candidateNodeBindings.filter((binding) =>
            !baseHierarchy.ungroupedCandidateIds.includes(binding.candidateId)
          ),
          ...fallback.candidateNodeBindings,
        ],
        subtasks,
      });
    }
  } catch {
    hierarchy = buildTaskMapNativeCandidateHierarchy({
      producerSnapshotDigest: input.shelf.producerSnapshotDigest,
      candidateIds: input.shelf.candidates.map((candidate) => candidate.candidateId),
      groupingAvailable: false,
      proposals: [],
      candidateNodeBindings: [],
      subtasks: [],
    });
  }
  const shelf: TaskMapNativeCandidateShelfV3 = {
    ...input.shelf,
    contractVersion: TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3,
    durableConfirmedCandidateIds: input.durableConfirmedCandidateIds,
    hierarchy,
  };
  assertTaskMapNativeCandidateShelfV3(shelf);
  return shelf;
}

export async function runTaskMapNativeCandidateReviewCommand(
  argv: readonly string[],
): Promise<TaskMapNativeCandidateShelfV3> {
  const command = parseTaskMapNativeCandidateReviewCommand(argv);
  const ownerHome = homedir();
  const owner = await resolveConfirmedOwner(ownerHome);
  const expectedOwnerScopeDigest = owner.ownerScopeDigest;
  const producerPath = path.join(
    owner.sourceRoot,
    "meeting-producer-snapshot.v1.json",
  );
  const overlayPath = taskMapNativeCandidateReviewOverlayPath(
    owner.taskMapRoot,
  );
  return withTaskMapNativeCandidateReviewTransaction({
    overlayPath,
    expectedOwnerScopeDigest,
  }, async () => {
    const previous = await loadTaskMapNativeCandidateReview({
      overlayPath,
      expectedOwnerScopeDigest,
    });
    const assessedAt = new Date().toISOString();
    const agentResult = await loadTaskMapAgentSessionProducerResult({
      snapshotPath: path.join(
        owner.sourceRoot,
        "agent-session-producer-snapshot.v1.json",
      ),
      assessedAt,
      expectedOwnerScopeDigest,
    });
    let agentAdmission: ReturnType<
      typeof buildTaskMapAgentSessionSemanticAdmission
    > | null = null;
    let agentExtraction: TaskMapAgentSessionExtractionReportV1 | null = null;
    if (agentResult.freshness.decision !== "missing") {
      if (
        agentResult.availability !== "available"
        || agentResult.snapshot === null
        || agentResult.freshness.decision !== "fresh"
        || agentResult.freshness.currentSemanticInputEligible !== true
      ) {
        throw new Error("agent candidate evidence is unavailable");
      }
      agentAdmission = buildTaskMapAgentSessionSemanticAdmission(
        agentResult.snapshot,
      );
      agentExtraction = await loadVerifiedTaskMapAgentSessionExtractionReport({
        admission: agentAdmission,
        taskMapRoot: owner.taskMapRoot,
        runtimeRoot: owner.runtimeRoot,
        ownerScopeDigest: expectedOwnerScopeDigest,
        promptTemplatePath: path.resolve(
          __dirname,
          "../../../../prompts/agent-session-extraction-v1.md",
        ),
      });
      if (agentExtraction === null) {
        throw new Error("agent candidate extraction proof is unavailable");
      }
    }
    const localCalendarExportPath = path.join(
      owner.sourceRoot,
      "calendar-export.json",
    );
    const googleCalendarSnapshotPath = path.join(
      owner.sourceRoot,
      "calendar-google-provider-snapshot.v1.json",
    );
    let calendarResult = await loadTaskMapCalendarProducerResult({
      localExportPath: localCalendarExportPath,
      googleSnapshotPath: googleCalendarSnapshotPath,
      assessedAt,
      expectedOwnerScopeDigest,
    });
    let calendarExtraction: TaskMapCalendarExtractionReportV1 | null = null;
    if (calendarResult.availability === "available") {
      const proof = await loadCurrentTaskMapCalendarExtractionProof({
        localExportPath: localCalendarExportPath,
        googleSnapshotPath: googleCalendarSnapshotPath,
        taskMapRoot: owner.taskMapRoot,
        runtimeRoot: owner.runtimeRoot,
        ownerScopeDigest: expectedOwnerScopeDigest,
        promptTemplatePath: path.resolve(
          __dirname,
          "../../../../prompts/calendar-extraction-v1.md",
        ),
        currentAssessedAt: assessedAt,
      });
      if (proof === null) {
        throw new Error("calendar candidate extraction proof is unavailable");
      }
      calendarResult = proof.result;
      calendarExtraction = proof.extraction;
    }
    let result: Awaited<ReturnType<typeof loadTaskMapMeetingProducerResult>> | null = null;
    try {
      result = await loadTaskMapMeetingProducerResult({
        snapshotPath: producerPath,
        assessedAt,
        expectedOwnerScopeDigest,
      });
      if (
        result.availability !== "available"
        || result.snapshot === null
        || result.freshness.decision !== "fresh"
      ) result = null;
    } catch {
      result = null;
    }
    let rawReport: Awaited<
      ReturnType<typeof loadCurrentTaskMapOwnerGranolaExtractionReport>
    > | null = null;
    try {
      rawReport = await loadCurrentTaskMapOwnerGranolaExtractionReport({
        snapshotPath: path.join(
          owner.sourceRoot,
          "granola-mcp-snapshot.json",
        ),
        residentReceiptPath: path.join(
          owner.sourceRoot,
          "taskmap-resident-receipt.v1.json",
        ),
        assessedAt,
        taskMapRoot: owner.taskMapRoot,
        runtimeRoot: owner.runtimeRoot,
        ownerScopeDigest: expectedOwnerScopeDigest,
        promptTemplatePath: path.resolve(
          __dirname,
          "../../../../prompts/mention-extraction-v1.md",
        ),
      });
    } catch {
      rawReport = null;
    }
    const finalizeShelf = (
      shelf: TaskMapNativeCandidateShelfV2,
      durableConfirmedCandidateIds: string[],
    ) =>
      addEngineAuthoredCandidateHierarchy({
        shelf,
        durableConfirmedCandidateIds,
        taskMapRoot: owner.taskMapRoot,
        runtimeRoot: owner.runtimeRoot,
        ownerScopeDigest: expectedOwnerScopeDigest,
        assessedAt,
        meetingResult: result,
        granolaReport: rawReport,
        calendarResult,
        calendarExtraction,
        agentSnapshot: agentResult.snapshot,
        agentAdmission,
      });
    if (agentAdmission !== null || calendarExtraction !== null) {
      let meetingContext: TaskMapNativeCandidateProofRowsContextV1 | null = null;
      if (rawReport !== null) {
        let googleCandidates: TaskMapNativeCandidateShelfV1["candidates"] = [];
        if (result !== null) {
          const googleOverlay = buildTaskMapNativeCandidateReview({
            result,
            previous: null,
            expectedOwnerScopeDigest,
            assessedAt,
          });
          googleCandidates = buildTaskMapNativeCandidateShelf(
            result,
            googleOverlay,
            assessedAt,
          ).candidates;
        }
        meetingContext = buildTaskMapUnifiedMeetingCandidateContext({
          ownerScopeDigest: expectedOwnerScopeDigest,
          assessedAt,
          googleCandidates,
          googleResultDigest: result?.resultDigest ?? null,
          googleSnapshotDigest: result?.snapshot?.snapshotDigest ?? null,
          googleProducedAt: result?.snapshot?.producedAt ?? null,
          rawReport,
        });
      } else if (result !== null && result.snapshot !== null) {
        const meetingOverlay = buildTaskMapNativeCandidateReview({
          result,
          previous: null,
          expectedOwnerScopeDigest,
          assessedAt,
        });
        const meetingShelf = buildTaskMapNativeCandidateShelf(
          result,
          meetingOverlay,
          assessedAt,
        );
        meetingContext = {
          ownerScopeDigest: expectedOwnerScopeDigest,
          producerResultDigest: result.resultDigest,
          producerSnapshotDigest: result.snapshot.snapshotDigest,
          producedAt: result.snapshot.producedAt,
          assessedAt,
          candidates: meetingShelf.candidates,
        };
      }
      const agentProjection = agentAdmission === null
        ? null
        : buildTaskMapAgentSessionCandidateReview({
            admission: agentAdmission,
            extraction: agentExtraction!,
            previous: null,
            expectedOwnerScopeDigest,
            assessedAt,
          });
      const calendarProjection = calendarExtraction === null
        ? null
        : buildTaskMapCalendarCandidateReview({
            result: calendarResult,
            extraction: calendarExtraction,
            previous: null,
            expectedOwnerScopeDigest,
            assessedAt: calendarResult.assessedAt,
          });
      const meetingRows = (meetingContext?.candidates ?? []).map((row) => ({
        ...row,
        evidenceProofDigests: [...row.evidenceProofDigests],
        sourceKinds: [...row.sourceKinds],
        candidateFamily: "meeting" as const,
      }));
      const combinedRows = [
        ...meetingRows,
        ...(agentProjection?.shelf.candidates ?? []),
        ...(calendarProjection?.shelf.candidates ?? []),
      ].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
      const candidateResultDigest = calendarProjection === null
        ? meetingContext === null
          ? agentProjection!.shelf.producerResultDigest
          : taskMapContractDigest({
              domain: "taskmap-unified-candidate-review-result.2",
              meetingResultDigest: meetingContext.producerResultDigest,
              agentResultDigest: agentProjection!.shelf.producerResultDigest,
            })
        : taskMapContractDigest({
            domain: "taskmap-unified-candidate-review-result.3",
            meetingResultDigest: meetingContext?.producerResultDigest ?? null,
            agentResultDigest:
              agentProjection?.shelf.producerResultDigest ?? null,
            calendarResultDigest:
              calendarProjection.shelf.producerResultDigest,
          });
      const candidateSnapshotDigest = calendarProjection === null
        ? meetingContext === null
          ? agentProjection!.shelf.producerSnapshotDigest
          : taskMapContractDigest({
              domain: "taskmap-unified-candidate-review-snapshot.2",
              meetingSnapshotDigest: meetingContext.producerSnapshotDigest,
              agentSnapshotDigest:
                agentProjection!.shelf.producerSnapshotDigest,
            })
        : taskMapContractDigest({
            domain: "taskmap-unified-candidate-review-snapshot.3",
            meetingSnapshotDigest:
              meetingContext?.producerSnapshotDigest ?? null,
            agentSnapshotDigest:
              agentProjection?.shelf.producerSnapshotDigest ?? null,
            calendarSnapshotDigest:
              calendarProjection.shelf.producerSnapshotDigest,
          });
      const producedAt = [
        meetingContext?.producedAt,
        agentAdmission?.producedAt,
        calendarProjection === null ? undefined : calendarResult.assessedAt,
      ].filter((value): value is string => value !== undefined)
        .sort()
        .at(-1)!;
      const context: TaskMapNativeCandidateProofRowsContextV1 = {
        ownerScopeDigest: expectedOwnerScopeDigest,
        producerResultDigest: candidateResultDigest,
        producerSnapshotDigest: candidateSnapshotDigest,
        producedAt,
        assessedAt,
        candidates: combinedRows as unknown as TaskMapNativeCandidateShelfRowV1[],
      };
      const current = buildTaskMapNativeCandidateReviewFromProofRows({
        context,
        previous,
      });
      const reviewed = command.kind === "list"
        ? current
        : reduceTaskMapNativeCandidateReviewFromProofRows({
            context,
            overlay: current,
            candidateId: command.candidateId,
            expectedCandidateRevisionDigest: command.candidateRevisionDigest,
            action: command.action,
            idempotencyKeyDigest: idempotencyKeyDigest({
              ownerScopeDigest: expectedOwnerScopeDigest,
              candidateId: command.candidateId,
              candidateRevisionDigest: command.candidateRevisionDigest,
              action: command.action,
            }),
            decidedAt: assessedAt,
          });
      await persistWhenChanged(
        overlayPath,
        expectedOwnerScopeDigest,
        previous,
        reviewed,
      );
      const acceptanceStore = await loadTaskMapNativeCandidateAcceptanceStore({
        storePath: path.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
        expectedOwnerScopeDigest,
      });
      const publishedPromotionIds =
        await acceptedPromotionIdsInVerifiedTaskMapProjection(
          owner.taskMapRoot,
          expectedOwnerScopeDigest,
        );
      const reviewedRows = applyTaskMapNativeCandidateReviewToProofRows({
        context,
        overlay: reviewed,
      }) as unknown as TaskMapNativeCandidateShelfRowV2[];
      const currentCandidates = filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
        reviewedRows as unknown as TaskMapNativeCandidateShelfRowV1[],
        acceptanceStore,
        expectedOwnerScopeDigest,
        publishedPromotionIds,
      ) as unknown as TaskMapNativeCandidateShelfRowV2[];
      const retained = retainReceiptBackedPendingRows(
        currentCandidates,
        acceptanceStore,
        publishedPromotionIds,
      );
      const shelf: TaskMapNativeCandidateShelfV2 = {
        contractVersion: TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
        ownerScopeDigest: expectedOwnerScopeDigest,
        producerResultDigest: context.producerResultDigest,
        producerSnapshotDigest: context.producerSnapshotDigest,
        assessedAt,
        candidates: retained.candidates,
        displayTextPersistence: "memory_only",
      };
      assertTaskMapNativeCandidateShelfV2(shelf);
      return finalizeShelf(shelf, retained.durableConfirmedCandidateIds);
    }
    if (rawReport === null) {
      if (result === null) throw new Error("candidate evidence is unavailable");
      const current = buildTaskMapNativeCandidateReview({
        result,
        previous,
        expectedOwnerScopeDigest,
        assessedAt,
      });
      const reviewed = command.kind === "list"
        ? current
        : reduceTaskMapNativeCandidateReview({
            result,
            overlay: current,
            expectedOwnerScopeDigest,
            assessedAt,
            candidateId: command.candidateId,
            expectedCandidateRevisionDigest: command.candidateRevisionDigest,
            action: command.action,
            idempotencyKeyDigest: idempotencyKeyDigest({
              ownerScopeDigest: expectedOwnerScopeDigest,
              candidateId: command.candidateId,
              candidateRevisionDigest: command.candidateRevisionDigest,
              action: command.action,
            }),
            decidedAt: assessedAt,
          });
      await persistWhenChanged(
        overlayPath,
        expectedOwnerScopeDigest,
        previous,
        reviewed,
      );
      const shelf = buildTaskMapNativeCandidateShelf(result, reviewed, assessedAt);
      const acceptanceStore = await loadTaskMapNativeCandidateAcceptanceStore({
        storePath: path.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
        expectedOwnerScopeDigest,
      });
      const publishedPromotionIds =
        await acceptedPromotionIdsInVerifiedTaskMapProjection(
          owner.taskMapRoot,
          expectedOwnerScopeDigest,
        );
      const candidates = filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
        shelf.candidates,
        acceptanceStore,
        expectedOwnerScopeDigest,
        publishedPromotionIds,
      );
      const upgraded = upgradeTaskMapNativeCandidateShelfV1({
        ...shelf,
        candidates,
      });
      const retained = retainReceiptBackedPendingRows(
        upgraded.candidates,
        acceptanceStore,
        publishedPromotionIds,
      );
      return finalizeShelf({
        ...upgraded,
        candidates: retained.candidates,
      }, retained.durableConfirmedCandidateIds);
    }
    let googleCandidates: TaskMapNativeCandidateShelfV1["candidates"] = [];
    if (result !== null) {
      const googleOverlay = buildTaskMapNativeCandidateReview({
        result,
        previous,
        expectedOwnerScopeDigest,
        assessedAt,
      });
      googleCandidates = buildTaskMapNativeCandidateShelf(
        result,
        googleOverlay,
        assessedAt,
      ).candidates;
    }
    const context = buildTaskMapUnifiedMeetingCandidateContext({
      ownerScopeDigest: expectedOwnerScopeDigest,
      assessedAt,
      googleCandidates,
      googleResultDigest: result?.resultDigest ?? null,
      googleSnapshotDigest: result?.snapshot?.snapshotDigest ?? null,
      googleProducedAt: result?.snapshot?.producedAt ?? null,
      rawReport,
    });
    const current = buildTaskMapNativeCandidateReviewFromProofRows({
      context,
      previous,
    });
    const reviewed = command.kind === "list"
      ? current
      : reduceTaskMapNativeCandidateReviewFromProofRows({
          context,
          overlay: current,
          candidateId: command.candidateId,
          expectedCandidateRevisionDigest: command.candidateRevisionDigest,
          action: command.action,
          idempotencyKeyDigest: idempotencyKeyDigest({
            ownerScopeDigest: expectedOwnerScopeDigest,
            candidateId: command.candidateId,
            candidateRevisionDigest: command.candidateRevisionDigest,
            action: command.action,
          }),
          decidedAt: assessedAt,
        });
    await persistWhenChanged(
      overlayPath,
      expectedOwnerScopeDigest,
      previous,
      reviewed,
    );
    const acceptanceStore = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath: path.join(owner.taskMapRoot, ACCEPTANCE_FILE_NAME),
      expectedOwnerScopeDigest,
    });
    const publishedPromotionIds =
      await acceptedPromotionIdsInVerifiedTaskMapProjection(
        owner.taskMapRoot,
        expectedOwnerScopeDigest,
      );
    const candidates = filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
      applyTaskMapNativeCandidateReviewToProofRows({ context, overlay: reviewed }),
      acceptanceStore,
      expectedOwnerScopeDigest,
      publishedPromotionIds,
    );
    const upgraded = upgradeTaskMapNativeCandidateShelfV1({
      contractVersion: TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION,
      ownerScopeDigest: expectedOwnerScopeDigest,
      producerResultDigest: context.producerResultDigest,
      producerSnapshotDigest: context.producerSnapshotDigest,
      assessedAt,
      candidates,
      displayTextPersistence: "memory_only",
    });
    const retained = retainReceiptBackedPendingRows(
      upgraded.candidates,
      acceptanceStore,
      publishedPromotionIds,
    );
    return finalizeShelf({
      ...upgraded,
      candidates: retained.candidates,
    }, retained.durableConfirmedCandidateIds);
  });
}

export function taskMapNativeCandidateShelfOutput(
  shelf: TaskMapNativeCandidateShelfV1 | TaskMapNativeCandidateShelfV2 | TaskMapNativeCandidateShelfV3,
): string {
  if (shelf.contractVersion === TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V3) {
    assertTaskMapNativeCandidateShelfV3(shelf);
  } else if (shelf.contractVersion === TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2) {
    assertTaskMapNativeCandidateShelfV2(shelf);
  }
  const output = taskMapContractCanonicalJson(shelf);
  if (
    Buffer.byteLength(output, "utf8")
      > TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES
  ) {
    throw new Error("candidate review output is unavailable");
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const shelf = await runTaskMapNativeCandidateReviewCommand(
      process.argv.slice(2),
    );
    process.stdout.write(`${taskMapNativeCandidateShelfOutput(shelf)}\n`);
  } catch (error) {
    process.stderr.write(
      `taskmap-native-candidate-review: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
