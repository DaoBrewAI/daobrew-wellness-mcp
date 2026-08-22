import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskMapOutcomeReward,
  TASKMAP_OUTCOME_REWARD_LIMITS_V1,
  TASKMAP_PREFERENCE_PAIR_THRESHOLD,
  TASKMAP_REWARD_STAGES,
  taskMapPreferenceLearningStatus,
  validateTaskMapOutcomeReward,
  type BuildTaskMapOutcomeRewardInputV1,
  type TaskMapOutcomeRewardV1,
} from "../src/engine/taskmap/outcome-reward.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";

function reseal(draft: TaskMapOutcomeRewardV1): TaskMapOutcomeRewardV1 {
  const { artifactDigest: _artifactDigest, ...core } = draft;
  draft.artifactDigest = taskMapContractDigest(core);
  return draft;
}

describe("Task Map outcome reward", () => {
  it("anchors reward only at the verified stage", () => {
    assert.equal(Object.isFrozen(TASKMAP_REWARD_STAGES), true);
    assert.deepEqual(TASKMAP_REWARD_STAGES, [
      "approved",
      "started",
      "artifact",
      "source",
      "verified",
    ]);
    for (const stage of ["approved", "started", "artifact", "source"] as const) {
      const result = buildTaskMapOutcomeReward({ stage });
      assert.equal(result.reward, 0);
      assert.equal(result.rewardReasonCode, "outcome_not_verified");
    }
    const verified = buildTaskMapOutcomeReward({ stage: "verified" });
    assert.equal(verified.reward, 1);
    assert.equal(verified.rewardReasonCode, "verified_lifecycle_disposition");
  });

  it("treats a click as attention, never as value", () => {
    const withoutClick = buildTaskMapOutcomeReward({
      stage: "approved",
      clicked: false,
    });
    const withClick = buildTaskMapOutcomeReward({
      stage: "approved",
      clicked: true,
    });
    assert.equal(withClick.reward, 0);
    assert.equal(withClick.reward, withoutClick.reward);
    assert.equal(withClick.attention.clicked, true);
    assert.equal(withClick.causalBackdoor.clickUsedAsValue, false);
  });

  it("structurally excludes body signal from the reward path", () => {
    const withoutBody = buildTaskMapOutcomeReward({
      stage: "verified",
      bodyBonusBasisPoints: 0,
    });
    const withBody = buildTaskMapOutcomeReward({
      stage: "verified",
      bodyBonusBasisPoints: 800,
    });
    assert.deepEqual(withBody, withoutBody);
    assert.equal(withBody.bodyEnteredReward, false);
    assert.equal(withBody.causalBackdoor.bodySignalUsed, false);
    assert.equal("bodyBonusBasisPoints" in withBody, false);
  });

  it("seals deterministic authority/privacy/causal-backdoor fields", () => {
    const input = { stage: "verified", clicked: true } as const;
    const original = buildTaskMapOutcomeReward(input);
    assert.deepEqual(buildTaskMapOutcomeReward(structuredClone(input)), original);
    assert.deepEqual(validateTaskMapOutcomeReward(original, input), original);
    assert.deepEqual(original.authority, {
      orderingChanged: false,
      eligibilityChanged: false,
      executionGranted: false,
      sourceCompletionChanged: false,
      deterministicRankingReplaced: false,
    });
    assert.deepEqual(original.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawOwnerIdentifiersStored: false,
      rawSourceObjectIdentifiersStored: false,
      rawBiometricsStored: false,
      connectorSecretsStored: false,
    });
    assert.deepEqual(original.causalBackdoor, {
      clickUsedAsValue: false,
      bodySignalUsed: false,
    });

    const mutations: Array<(draft: TaskMapOutcomeRewardV1) => void> = [
      (draft) => {
        (draft as unknown as { reward: number }).reward = 7;
      },
      (draft) => { draft.stage = "approved"; },
      (draft) => {
        (draft.causalBackdoor as unknown as { bodySignalUsed: boolean })
          .bodySignalUsed = true;
      },
      (draft) => {
        (draft.authority as unknown as { executionGranted: boolean })
          .executionGranted = true;
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
        () => validateTaskMapOutcomeReward(forged, input),
        /canonical|keys|reward|authority|causal|stage/i,
      );
    }
  });

  it("rejects invalid stages, hostile body numbers, and unknown input keys", () => {
    assert.throws(
      () => buildTaskMapOutcomeReward({
        stage: "complete",
      } as unknown as BuildTaskMapOutcomeRewardInputV1),
      /stage/i,
    );
    for (const bodyBonusBasisPoints of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxBodyBonusBasisPoints + 1,
    ]) {
      assert.throws(
        () => buildTaskMapOutcomeReward({
          stage: "verified",
          bodyBonusBasisPoints,
        }),
        /body.*basis points/i,
      );
    }
    assert.throws(
      () => buildTaskMapOutcomeReward({
        stage: "verified",
        unknown: true,
      } as unknown as BuildTaskMapOutcomeRewardInputV1),
      /input keys/i,
    );
  });
});

describe("Task Map preference-learning upgrade seam", () => {
  it("uses the exact 300-pair boundary without replacing deterministic ranking", () => {
    assert.equal(TASKMAP_PREFERENCE_PAIR_THRESHOLD, 300);
    assert.deepEqual(taskMapPreferenceLearningStatus({ preferencePairs: 299 }), {
      mode: "shadow_only",
      preferencePairs: 299,
      requiredPairs: 300,
      replacesDeterministicRanking: false,
      onlineLearnerEnabled: false,
      promotionRequiresOfflineProof: true,
      reasonCode: "insufficient_verified_preference_pairs",
    });
    assert.deepEqual(taskMapPreferenceLearningStatus({ preferencePairs: 300 }), {
      mode: "shadow_eligible",
      preferencePairs: 300,
      requiredPairs: 300,
      replacesDeterministicRanking: false,
      onlineLearnerEnabled: false,
      promotionRequiresOfflineProof: true,
      reasonCode: "offline_proof_required",
    });
    const aboveThreshold = taskMapPreferenceLearningStatus({
      preferencePairs: TASKMAP_PREFERENCE_PAIR_THRESHOLD + 1,
    });
    assert.equal(aboveThreshold.mode, "shadow_eligible");
    assert.equal(aboveThreshold.replacesDeterministicRanking, false);
    assert.equal(aboveThreshold.onlineLearnerEnabled, false);
    assert.equal(aboveThreshold.promotionRequiresOfflineProof, true);
    assert.equal(aboveThreshold.reasonCode, "offline_proof_required");
  });

  it("rejects hostile pair counts and exact-key drift", () => {
    for (const preferencePairs of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      TASKMAP_OUTCOME_REWARD_LIMITS_V1.maxPreferencePairs + 1,
    ]) {
      assert.throws(
        () => taskMapPreferenceLearningStatus({ preferencePairs }),
        /preference pair count/i,
      );
    }
    assert.throws(
      () => taskMapPreferenceLearningStatus({
        preferencePairs: 0,
        online: true,
      } as unknown as { preferencePairs: number }),
      /input keys/i,
    );
  });
});
