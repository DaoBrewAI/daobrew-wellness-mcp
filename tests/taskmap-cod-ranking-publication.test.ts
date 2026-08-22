import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASKMAP_ALGORITHM_POLICY_DIGEST,
} from "../src/engine/taskmap/harness.js";
import {
  buildTaskMapCodRankingPublication,
  type BuildTaskMapCodRankingPublicationInputV2,
  TASKMAP_COD_RANKING_FILENAME,
  validateTaskMapCodRankingPublication,
} from "../src/engine/taskmap/cod-ranking-publication.js";
import {
  buildTaskMapTaskRankingPublication,
  TASKMAP_TASK_RANKING_FILENAME,
} from "../src/engine/taskmap/task-ranking-publication.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type TaskMapProjectionV1,
  type TaskMapScoreBreakdown,
  type TaskMapTask,
} from "../src/engine/taskmap/types.js";

const digest = (label: string): string => taskMapContractDigest(`cod-ranking:${label}`);
const OWNER = digest("owner");
const ROOT_ID = `tmr_${digest("root").slice(0, 16)}`;
const taskId = (label: string): string =>
  `tmt_${digest(`task:${label}`).slice(0, 16)}`;

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

function task(label: string, score: TaskMapScoreBreakdown): TaskMapTask {
  return {
    id: taskId(label),
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
    score,
    whyNow: [],
    discoveredBy: ["agent_session"],
    bodyContextCount: 0,
  };
}

function projection(): TaskMapProjectionV1 {
  const alpha = task("alpha", {
    ...ZERO_SCORE,
    sourcePriority: 1,
    total: 1,
  });
  const beta = task("beta", { ...ZERO_SCORE });
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: `tmrun_${digest("run").slice(0, 16)}`,
    generatedAt: "2026-08-14T12:00:00.000Z",
    inputDigest: digest("input"),
    brain: null,
    sources: ["alpha", "beta"].map((label) => ({
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
      taskIds: [alpha.id, beta.id],
      memberObjectRefs: ["work-alpha", "work-beta"],
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
    tasks: [alpha, beta],
    edges: [],
    rejections: [],
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    },
  };
}

function statuses() {
  return [
    { source: "agent_session" as const, disposition: "fresh" as const, sliceDigest: digest("agent") },
    { source: "meeting_notes" as const, disposition: "unavailable" as const, sliceDigest: null },
    { source: "calendar" as const, disposition: "unavailable" as const, sliceDigest: null },
    { source: "body" as const, disposition: "unavailable" as const, sliceDigest: null },
  ];
}

function v1Input() {
  return {
    projection: projection(),
    ownerScopeDigest: OWNER,
    sourceStatuses: statuses(),
  };
}

function completeFixture() {
  return {
    ...v1Input(),
    factors: [
      { taskId: taskId("alpha"), costOfDelayBasisPoints: 4_000, effort: 4 },
      { taskId: taskId("beta"), costOfDelayBasisPoints: 3_000, effort: 1 },
    ],
  };
}

function oneTaskMissingEffortFixture() {
  return {
    ...v1Input(),
    factors: [
      { taskId: taskId("alpha"), costOfDelayBasisPoints: 4_000, effort: 4 },
      { taskId: taskId("beta"), costOfDelayBasisPoints: 3_000, effort: null },
    ],
  };
}

function reseal<T extends { artifactDigest: string }>(draft: T): T {
  const { artifactDigest: _artifactDigest, ...core } = draft;
  draft.artifactDigest = taskMapContractDigest(core);
  return draft;
}

describe("Task Map policy.2 publication", () => {
  it("publishes policy.2 when every required factor is present", () => {
    const doc = buildTaskMapCodRankingPublication(completeFixture());

    assert.equal(doc.policy.version, "taskmap-work-control-policy.2");
    assert.equal(doc.fallback.applied, false);
    assert.equal(doc.fallback.reason, null);
    assert.deepEqual(doc.authorityBoundary, {
      membershipCreated: false,
      readinessCreatedByCausalData: false,
      approvalGranted: false,
      executionStarted: false,
      completionGranted: false,
    });
    assert.deepEqual(doc.rankedAcceptedOpen.map((row) => row.taskId), [
      taskId("beta"),
      taskId("alpha"),
    ]);
  });

  it("falls the WHOLE run back to policy.1 when any task lacks effort", () => {
    const doc = buildTaskMapCodRankingPublication(oneTaskMissingEffortFixture());

    assert.equal(doc.policy.version, "taskmap-work-control-policy.1");
    assert.equal(doc.fallback.applied, true);
    assert.equal(doc.fallback.reason, "required_factor_unavailable");
    assert.ok(doc.rankedAcceptedOpen.every((row) =>
      row.policyVersion === "taskmap-work-control-policy.1"
    ));
    assert.deepEqual(doc.rankedAcceptedOpen.map((row) => row.taskId), [
      taskId("alpha"),
      taskId("beta"),
    ]);
  });

  it("falls the whole run back when cost of delay or a factor row is unavailable", () => {
    const missingCost = completeFixture();
    missingCost.factors[0]!.costOfDelayBasisPoints = null as unknown as number;
    const missingRow = completeFixture();
    missingRow.factors.pop();

    for (const input of [missingCost, missingRow]) {
      const doc = buildTaskMapCodRankingPublication(input);
      assert.equal(doc.policy.version, "taskmap-work-control-policy.1");
      assert.equal(doc.fallback.applied, true);
      assert.ok(doc.rankedAcceptedOpen.every((row) =>
        row.policyVersion === "taskmap-work-control-policy.1"
      ));
    }
  });

  it("never mixes policies in one artifact", () => {
    for (const fixture of [completeFixture(), oneTaskMissingEffortFixture()]) {
      const doc = buildTaskMapCodRankingPublication(fixture);
      assert.equal(
        new Set(doc.rankedAcceptedOpen.map((row) => row.policyVersion)).size,
        1,
      );
      assert.ok(doc.rankedAcceptedOpen.every((row) =>
        row.policyVersion === doc.policy.version
        && row.policyDigest === doc.policy.digest
      ));
    }
  });

  it("writes to a distinct filename from the v1 publication", () => {
    assert.notEqual(TASKMAP_COD_RANKING_FILENAME, TASKMAP_TASK_RANKING_FILENAME);
    assert.equal(TASKMAP_COD_RANKING_FILENAME, "taskmap-task-ranking.v2.json");
  });

  it("leaves the v1 publication byte-identical for the same projection", () => {
    const input = v1Input();
    const before = buildTaskMapTaskRankingPublication(input);
    buildTaskMapCodRankingPublication(completeFixture());
    const after = buildTaskMapTaskRankingPublication(input);

    assert.equal(before.artifactDigest, after.artifactDigest);
    assert.deepEqual(before, after);
  });

  it("seals a replayable artifact and rejects a tampered row", () => {
    const input = completeFixture();
    const doc = buildTaskMapCodRankingPublication(input);
    assert.deepEqual(validateTaskMapCodRankingPublication(doc, input), doc);

    const forged = structuredClone(doc);
    forged.rankedAcceptedOpen[0]!.scoreBasisPoints += 1;
    assert.throws(
      () => validateTaskMapCodRankingPublication(forged, input),
      /canonical|digest|ranking/i,
    );
  });

  it("is factor-order independent and rejects duplicate, extra, and malformed factor rows", () => {
    const canonical = completeFixture();
    const reversed = completeFixture();
    reversed.factors.reverse();
    assert.deepEqual(
      buildTaskMapCodRankingPublication(reversed),
      buildTaskMapCodRankingPublication(canonical),
    );

    const duplicate = completeFixture();
    duplicate.factors.push({ ...duplicate.factors[0]! });
    const extra = completeFixture();
    extra.factors.push({
      taskId: taskId("not-ranked"),
      costOfDelayBasisPoints: 1,
      effort: 1,
    });
    const malformed = [
      { costOfDelayBasisPoints: -1 },
      { costOfDelayBasisPoints: 0.5 },
      { costOfDelayBasisPoints: Number.NaN },
      { effort: 0 },
      { effort: Number.POSITIVE_INFINITY },
    ];

    for (const input of [duplicate, extra]) {
      assert.throws(
        () => buildTaskMapCodRankingPublication(input),
        /factor.*invalid|duplicate|ranked set|factor collection.*bounded/i,
      );
    }
    for (const patch of malformed) {
      const input = completeFixture() as BuildTaskMapCodRankingPublicationInputV2;
      Object.assign(input.factors[0]!, patch);
      assert.throws(
        () => buildTaskMapCodRankingPublication(input),
        /factor.*invalid/i,
      );
    }

    const unknownKey = completeFixture() as unknown as {
      factors: Array<Record<string, unknown>>;
    };
    unknownKey.factors[0]!.unexpected = true;
    assert.throws(
      () => buildTaskMapCodRankingPublication(
        unknownKey as unknown as BuildTaskMapCodRankingPublicationInputV2,
      ),
      /factor.*keys/i,
    );
  });

  it("rejects re-sealed policy, fallback, coverage, privacy, citation, and row mutations", () => {
    const input = completeFixture();
    const original = buildTaskMapCodRankingPublication(input);
    type MutableDocument = typeof original;
    const mutations: Array<(draft: MutableDocument) => void> = [
      (draft) => { draft.policy.digest = "0".repeat(64); },
      (draft) => {
        draft.fallback = {
          applied: true,
          reason: "required_factor_unavailable",
        };
      },
      (draft) => {
        draft.coverage[0]!.state = "unavailable";
        draft.coverage[0]!.sliceDigest = null;
      },
      (draft) => {
        (draft.privacy as unknown as { sourceBodiesStored: boolean })
          .sourceBodiesStored = true;
      },
      (draft) => {
        (draft.authorityBoundary as unknown as { approvalGranted: boolean })
          .approvalGranted = true;
      },
      (draft) => {
        draft.rankedAcceptedOpen[0]!.citations[0]!.sourceRefHash = "forged";
      },
      (draft) => {
        const row = draft.rankedAcceptedOpen[0]!;
        if (!("factorInputs" in row)) throw new Error("expected policy.2 row");
        row.factorInputs.effort = 16;
      },
      (draft) => { draft.rankedAcceptedOpen[0]!.scoreBasisPoints += 1; },
      (draft) => {
        (draft.rankedAcceptedOpen[0] as unknown as Record<string, unknown>)
          .unexpected = true;
      },
    ];

    for (const mutate of mutations) {
      const forged = structuredClone(original);
      mutate(forged);
      reseal(forged);
      assert.throws(
        () => validateTaskMapCodRankingPublication(forged, input),
        /canonical|keys|ranking/i,
      );
    }
  });
});
