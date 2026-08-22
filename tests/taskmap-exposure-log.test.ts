import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskMapCodRankingPublication,
  type BuildTaskMapCodRankingPublicationInputV2,
  type TaskMapCodRankingPublicationV2,
} from "../src/engine/taskmap/cod-ranking-publication.js";
import {
  buildTaskMapExposureLog,
  TASKMAP_EXPOSURE_LOG_LIMITS_V1,
  validateTaskMapExposureLog,
  type BuildTaskMapExposureLogInputV1,
  type TaskMapExposureLogV1,
} from "../src/engine/taskmap/exposure-log.js";
import { TASKMAP_ALGORITHM_POLICY_DIGEST } from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_COD_RANKING_POLICY_DIGEST,
  TASKMAP_COD_RANKING_POLICY_VERSION,
} from "../src/engine/taskmap/cod-ranking-policy.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type TaskMapProjectionV1,
  type TaskMapScoreBreakdown,
  type TaskMapTask,
} from "../src/engine/taskmap/types.js";
import {
  TASKMAP_WORK_CONTROL_POLICY_DIGEST,
  TASKMAP_WORK_CONTROL_POLICY_VERSION,
} from "../src/engine/taskmap/work-control-decision.js";

const digest = (label: string): string =>
  taskMapContractDigest(`exposure-log:${label}`);
const ROOT_ID = `tmr_${digest("root").slice(0, 16)}`;

const ZERO_SCORE: TaskMapScoreBreakdown = {
  sourcePriority: 0,
  deadlinePressure: 0,
  dependencyImpact: 0,
  recurrence: 0,
  staleOpen: 0,
  evidenceStrength: 0,
  bodyBonus: 0,
  total: 0,
};

function rankedTask(label: string, sourcePriority: number): TaskMapTask {
  const id = `tmt_${digest(`task:${label}`).slice(0, 16)}`;
  return {
    id,
    rootId: ROOT_ID,
    title: `Owner work ${label}`,
    summary: `Current owner evidence ${label}`,
    reviewState: "accepted",
    openState: "open",
    authority: "source_system",
    taskHomePointerId: `session-${label}`,
    originPointerIds: [`session-${label}`],
    returnRoute: {
      state: "source_return",
      pointerId: `session-${label}`,
      requiresApproval: true,
    },
    citations: [{
      eventId: `event-${label}`,
      pointerId: `session-${label}`,
      sourceKind: "codex_session",
      sourceRefHash: digest(`ref:${label}`).slice(0, 16),
      occurredAt: "2026-08-14T12:00:00.000Z",
      extractionConfidence: 1,
    }],
    score: { ...ZERO_SCORE, sourcePriority, total: sourcePriority },
    whyNow: [],
    discoveredBy: ["agent_session"],
    bodyContextCount: 0,
  };
}

function rankingInputFixture(count = 10): BuildTaskMapCodRankingPublicationInputV2 {
  const tasks = Array.from({ length: count }, (_unused, index) =>
    rankedTask(`candidate-${index + 1}`, (count - index) / Math.max(count, 1))
  );
  const projection: TaskMapProjectionV1 = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: "tmrun_exposure_ranking",
    generatedAt: "2026-08-14T12:00:00.000Z",
    inputDigest: digest("ranking-input"),
    brain: null,
    sources: tasks.map((_task, index) => ({
      label: `candidate-${index + 1}`,
    })).map(({ label }) => ({
      id: `session-${label}`,
      sourceKind: "codex_session" as const,
      authority: "source_system" as const,
      syncMode: "reference_only" as const,
      capabilities: ["read_task" as const],
    })),
    roots: [{
      id: ROOT_ID,
      title: "Owner work",
      summary: "Current accepted work",
      taskIds: tasks.map((task) => task.id),
      memberObjectRefs: tasks.map((_task, index) => `work-candidate-${index + 1}`),
      citations: [],
      causalGrade: "C0_NO_DATA",
      bodyContextCount: 0,
      scoreBreakdown: {
        maxChildActionability: 0,
        rootRecurrence: 0,
        evidenceStrength: 0,
        sourceBreadth: 0,
        actionableLoad: 0,
        dependencyBreadth: 0,
        bodyBonus: 0,
        total: 0,
      },
      score: 0,
      whyNow: [],
    }],
    tasks,
    edges: [],
    rejections: [],
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
  return {
    projection,
    ownerScopeDigest: digest("ranking-owner"),
    sourceStatuses: [
      { source: "agent_session", disposition: "fresh", sliceDigest: digest("agent") },
      { source: "meeting_notes", disposition: "unavailable", sliceDigest: null },
      { source: "calendar", disposition: "unavailable", sliceDigest: null },
      { source: "body", disposition: "unavailable", sliceDigest: null },
    ],
    factors: tasks.map((task, index) => ({
      taskId: task.id,
      costOfDelayBasisPoints: (index + 1) * 1_000,
      effort: 1,
    })),
  };
}

function policy2Identity() {
  return {
    version: TASKMAP_COD_RANKING_POLICY_VERSION,
    digest: TASKMAP_COD_RANKING_POLICY_DIGEST,
  };
}

function policy1Identity() {
  return {
    version: TASKMAP_WORK_CONTROL_POLICY_VERSION,
    digest: TASKMAP_WORK_CONTROL_POLICY_DIGEST,
  };
}

function boundedCandidates(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    taskId: `tmt_${String(index + 1).padStart(4, "0")}`,
    pinned: false,
  }));
}

function fixture(
  patch: Partial<BuildTaskMapExposureLogInputV1> = {},
): BuildTaskMapExposureLogInputV1 {
  const rankingInput = rankingInputFixture();
  const rankingPublication = buildTaskMapCodRankingPublication(rankingInput);
  return {
    candidates: rankingPublication.rankedAcceptedOpen.map((row) => ({
      taskId: row.taskId,
      pinned: false,
    })),
    displayedCount: 3,
    rankingPublication,
    rankingInput,
    ...patch,
  };
}

function policy1Fixture(): BuildTaskMapExposureLogInputV1 {
  const rankingInput = rankingInputFixture();
  rankingInput.factors[0]!.effort = null;
  const rankingPublication = buildTaskMapCodRankingPublication(rankingInput);
  return {
    rankingInput,
    rankingPublication,
    candidates: rankingPublication.rankedAcceptedOpen.map((row) => ({
      taskId: row.taskId,
      pinned: false,
    })),
    displayedCount: 3,
  };
}

function reseal(draft: TaskMapExposureLogV1): TaskMapExposureLogV1 {
  const { artifactDigest: _artifactDigest, ...core } = draft;
  draft.artifactDigest = taskMapContractDigest(core);
  return draft;
}

function resealRanking(
  draft: TaskMapCodRankingPublicationV2,
): TaskMapCodRankingPublicationV2 {
  const { artifactDigest: _artifactDigest, ...core } = draft;
  draft.artifactDigest = taskMapContractDigest(core);
  return draft;
}

describe("Task Map exposure log", () => {
  it("logs the complete ordered candidate set and displays exactly its prefix", () => {
    const input = fixture();
    const log = buildTaskMapExposureLog(input);

    assert.equal(log.entries.length, 10);
    assert.deepEqual(
      log.entries.map((entry) => entry.taskId),
      input.candidates.map((candidate) => candidate.taskId),
    );
    assert.deepEqual(
      log.entries.map((entry) => entry.displayPosition),
      [1, 2, 3, null, null, null, null, null, null, null],
    );
  });

  it("records exact policy.2 and run/projection/ranking bindings", () => {
    const input = fixture();
    const log = buildTaskMapExposureLog(input);

    assert.deepEqual(log.policy, policy2Identity());
    assert.deepEqual(log.projection, input.rankingPublication.projection);
    assert.equal(log.ownerScopeDigest, input.rankingPublication.ownerScopeDigest);
    assert.equal(
      log.sourceRankingArtifactDigest,
      input.rankingPublication.artifactDigest,
    );
  });

  it("supports the exact policy.1 fallback identity without mixing identities", () => {
    const log = buildTaskMapExposureLog(policy1Fixture());

    assert.deepEqual(log.policy, policy1Identity());
    assert.ok(log.entries.every((entry) =>
      Object.keys(entry).sort().join(",")
        === "displayPosition,eligibleForTraining,pinned,propensity,taskId"
    ));

  });

  it("gives pinned rows no propensity and excludes them from training", () => {
    const input = fixture();
    const pinnedCandidates = input.candidates.map((candidate) => ({ ...candidate }));
    pinnedCandidates[0] = { ...pinnedCandidates[0]!, pinned: true };
    pinnedCandidates[7] = { ...pinnedCandidates[7]!, pinned: true };
    const log = buildTaskMapExposureLog({ ...input, candidates: pinnedCandidates });

    for (const entry of log.entries.filter((candidate) => candidate.pinned)) {
      assert.equal(entry.propensity, null);
      assert.equal(entry.eligibleForTraining, false);
    }
  });

  it("uses deterministic-display propensity 1 and keeps non-displayed negatives trainable", () => {
    const log = buildTaskMapExposureLog(fixture());

    assert.equal(log.propensitySemantics, "deterministic_display_probability.v1");
    for (const entry of log.entries) {
      if (entry.displayPosition !== null && !entry.pinned) {
        assert.equal(entry.propensity, 1);
        assert.equal(entry.eligibleForTraining, true);
      } else if (entry.pinned) {
        assert.equal(entry.propensity, null);
        assert.equal(entry.eligibleForTraining, false);
      } else {
        assert.equal(entry.propensity, 0);
        assert.equal(entry.eligibleForTraining, true);
      }
    }
  });

  it("derives every binding from a validated Task 6 publication and rejects candidate drift", () => {
    const rankingInput = rankingInputFixture();
    const rankingPublication = buildTaskMapCodRankingPublication(rankingInput);
    const exactCandidates = rankingPublication.rankedAcceptedOpen.map((row) => ({
      taskId: row.taskId,
      pinned: false,
    }));
    const reviewedInput = {
      rankingPublication,
      rankingInput,
      candidates: exactCandidates,
      displayedCount: 1,
    } satisfies BuildTaskMapExposureLogInputV1;

    const log = buildTaskMapExposureLog(reviewedInput);
    assert.equal(log.sourceRankingArtifactDigest, rankingPublication.artifactDigest);
    assert.equal(log.ownerScopeDigest, rankingPublication.ownerScopeDigest);
    assert.deepEqual(log.projection, rankingPublication.projection);
    assert.deepEqual(log.policy, rankingPublication.policy);

    const candidateDrift = [
      [...reviewedInput.candidates].reverse(),
      reviewedInput.candidates.slice(0, -1),
      [...reviewedInput.candidates, { taskId: "tmt_extra", pinned: false }],
    ];
    for (const candidates of candidateDrift) {
      assert.throws(
        () => buildTaskMapExposureLog({ ...reviewedInput, candidates }),
        /candidate.*order|ranking/i,
      );
    }
  });

  it("is deterministic and has no learned-ranking path to ordering or eligibility", () => {
    const input = fixture();
    const rankingBefore = structuredClone(input.rankingPublication);
    const first = buildTaskMapExposureLog(input);
    const replay = buildTaskMapExposureLog(structuredClone(input));

    assert.deepEqual(replay, first);
    assert.deepEqual(first.authority, {
      orderingChanged: false,
      eligibilityChanged: false,
      learnedRankingApplied: false,
      pinnedRowsUsedForTraining: false,
      executionGranted: false,
    });
    assert.deepEqual(input.rankingPublication, rankingBefore);
    assert.equal(
      input.rankingPublication.artifactDigest,
      rankingBefore.artifactDigest,
    );
    assert.deepEqual(first.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawOwnerIdentifiersStored: false,
      rawSourceObjectIdentifiersStored: false,
      rawBiometricsStored: false,
      connectorSecretsStored: false,
    });
  });

  it("rejects duplicate or non-canonical task IDs and invalid collection/count bounds", () => {
    const base = fixture();
    const duplicate = base.candidates.map((candidate) => ({ ...candidate }));
    duplicate[1] = { ...duplicate[1]!, taskId: duplicate[0]!.taskId };
    const invalidIds = ["", " padded", "padded ", "line\nbreak", "x".repeat(513)];

    assert.throws(
      () => buildTaskMapExposureLog({ ...base, candidates: duplicate }),
      /candidate.*duplicate/i,
    );
    for (const taskId of invalidIds) {
      const rows = base.candidates.map((candidate) => ({ ...candidate }));
      rows[0] = { taskId, pinned: false };
      assert.throws(
        () => buildTaskMapExposureLog({ ...base, candidates: rows }),
        /candidate.*task id/i,
      );
    }
    for (const displayedCount of [-1, 0.5, Number.NaN, 11]) {
      assert.throws(
        () => buildTaskMapExposureLog(fixture({ displayedCount })),
        /displayed count/i,
      );
    }
    assert.throws(
      () => buildTaskMapExposureLog(fixture({
        candidates: boundedCandidates(TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxCandidates + 1),
      })),
      /candidate.*bounded/i,
    );
    assert.throws(
      () => buildTaskMapExposureLog(fixture({
        candidates: boundedCandidates(TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount + 1),
        displayedCount: TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount + 1,
      })),
      /displayed count/i,
    );
  });

  it("rejects unknown candidate keys and mismatched or re-sealed ranking bindings", () => {
    const unknownCandidate = fixture() as unknown as {
      candidates: Array<Record<string, unknown>>;
    };
    unknownCandidate.candidates[0]!.rank = 1;
    assert.throws(
      () => buildTaskMapExposureLog(
        unknownCandidate as unknown as BuildTaskMapExposureLogInputV1,
      ),
      /candidate.*keys/i,
    );

    const canonical = fixture();
    const otherInput = structuredClone(canonical.rankingInput);
    otherInput.ownerScopeDigest = digest("other-owner");
    const mismatched = {
      ...canonical,
      rankingPublication: buildTaskMapCodRankingPublication(otherInput),
    };
    assert.throws(
      () => buildTaskMapExposureLog(mismatched),
      /canonical|ranking|publication/i,
    );

    const rankingMutations: Array<
      (draft: TaskMapCodRankingPublicationV2) => void
    > = [
      (draft) => { draft.ownerScopeDigest = "0".repeat(64); },
      (draft) => { draft.projection.runId = "tmrun_resealed_forgery"; },
      (draft) => {
        draft.policy.digest = draft.policy.version === TASKMAP_COD_RANKING_POLICY_VERSION
          ? TASKMAP_WORK_CONTROL_POLICY_DIGEST
          : TASKMAP_COD_RANKING_POLICY_DIGEST;
      },
      (draft) => { draft.rankedAcceptedOpen[0]!.taskId = "tmt_resealed_forgery"; },
    ];
    for (const mutate of rankingMutations) {
      const forged = structuredClone(canonical);
      mutate(forged.rankingPublication);
      resealRanking(forged.rankingPublication);
      assert.throws(
        () => buildTaskMapExposureLog(forged),
        /canonical|policy|ranking|publication/i,
      );
    }
  });

  it("validates by exact keys and canonical rebuild, rejecting re-sealed tampering", () => {
    const input = fixture();
    const original = buildTaskMapExposureLog(input);
    assert.deepEqual(validateTaskMapExposureLog(original, input), original);

    const mutations: Array<(draft: TaskMapExposureLogV1) => void> = [
      (draft) => { draft.entries.reverse(); },
      (draft) => { draft.entries[0]!.displayPosition = 2; },
      (draft) => { draft.entries[0]!.propensity = 0.25; },
      (draft) => { draft.entries[0]!.eligibleForTraining = false; },
      (draft) => { draft.entries[0]!.pinned = true; },
      (draft) => { draft.policy.digest = "0".repeat(64); },
      (draft) => { draft.projection.runId = "tmrun_forged"; },
      (draft) => {
        (draft.authority as unknown as { orderingChanged: boolean }).orderingChanged = true;
      },
      (draft) => {
        (draft.authority as unknown as { executionGranted: boolean }).executionGranted = true;
      },
      (draft) => {
        (draft.privacy as unknown as { sourceBodiesStored: boolean }).sourceBodiesStored = true;
      },
      (draft) => {
        (draft.entries[0] as unknown as Record<string, unknown>).score = 10;
      },
      (draft) => {
        (draft as unknown as Record<string, unknown>).unknown = true;
      },
    ];

    for (const mutate of mutations) {
      const forged = structuredClone(original);
      mutate(forged);
      reseal(forged);
      assert.throws(
        () => validateTaskMapExposureLog(forged, input),
        /canonical|keys|digest|binding|entry|policy|authority|privacy/i,
      );
    }
  });
});
