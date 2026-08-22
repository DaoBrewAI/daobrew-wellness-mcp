import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTaskMapBodyContextDisclosure,
  PrivacySafeOuraContext,
} from "../src/engine/taskmap/body-context.js";
import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  SemanticBrainOutput,
  TASKMAP_CONTRACT_VERSION,
  TaskMapInput,
} from "../src/engine/taskmap/types.js";

function fixture(): {
  input: TaskMapInput;
  brain: SemanticBrainOutput;
  context: PrivacySafeOuraContext;
} {
  const generatedAt = "2026-07-27T18:00:00.000Z";
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt,
    pointers: [
      {
        id: "task-home",
        sourceKind: "strategy",
        sourceObjectId: "task-safe-ref",
        sourceRefHash: "0000000000000000",
        authority: "source_system",
        syncMode: "return_only",
        capabilities: ["read_task", "deep_link"],
      },
      {
        id: "work",
        sourceKind: "granola",
        sourceObjectId: "meeting-safe-ref",
        sourceRefHash: "1111111111111111",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "body",
        sourceKind: "oura",
        sourceObjectId: "relative-window",
        sourceRefHash: "2222222222222222",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      {
        id: "task-created",
        pointerId: "task-home",
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: "2026-07-26T14:00:00.000Z",
        observedAt: generatedAt,
        objectRefs: ["task:safe-ref"],
        title: "Close the Task Map decision",
        summary: "Use bounded source evidence to close the open implementation decision.",
        extractionConfidence: 1,
        sourceStatus: "open",
      },
      {
        id: "meeting",
        pointerId: "work",
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-27T14:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-27",
        objectRefs: ["meeting:safe-ref"],
        title: "Task Map decision",
        summary: "The accepted work context identifies one open implementation decision.",
        extractionConfidence: 1,
        bodyJoinEligible: true,
      },
      {
        id: "body-day",
        pointerId: "body",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-27T12:00:00.000Z",
        observedAt: generatedAt,
        dayKey: "2026-07-27",
        objectRefs: ["body-day:2026-07-27"],
        title: "Body window was below personal baseline",
        summary: "Relative category only; no raw biometric value is stored.",
        extractionConfidence: 1,
        bodyCategory: "below_baseline",
        bodyAxis: "composite_recovery",
      },
    ],
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt,
    roots: [{
      proposalId: "root",
      title: "Task Map implementation",
      summary: "Finish the source-backed Task Map implementation.",
      evidenceEventIds: ["task-created", "meeting"],
      memberObjectRefs: ["task:safe-ref", "meeting:safe-ref"],
      confidence: 1,
    }],
    tasks: [{
      proposalId: "task",
      rootProposalId: "root",
      title: "Close the Task Map decision",
      summary: "Use the bounded source evidence to close the open decision.",
      evidenceEventIds: ["task-created", "meeting"],
      authoritativeTaskEventId: "task-created",
      openState: "open",
      confidence: 1,
    }],
    edges: [{
      proposalId: "edge",
      fromProposalId: "root",
      toProposalId: "task",
      relation: "advances",
      evidenceEventIds: ["meeting"],
      confidence: 1,
    }],
  };
  const context: PrivacySafeOuraContext = {
    contractVersion: "oura-taskmap-context.v1",
    generatedAt,
    sourceKind: "oura",
    coverage: {
      startDay: "2026-07-01",
      endDay: "2026-07-27",
      dailyActivityDays: 27,
      dailyReadinessDays: 27,
      dailySleepDays: 26,
      sleepRecords: 40,
      heartRateSamples: 12_000,
      classifiedDays: 1,
      unknownDays: 0,
    },
    classifier: {
      version: "oura-relative-recovery.1",
      axis: "composite_recovery",
      method: "Robust personal-window median and MAD; relative context only.",
      minimumMetricsPerDay: 2,
      lowerThreshold: -1,
      upperThreshold: 1,
    },
    days: [{
      dayKey: "2026-07-27",
      axis: "composite_recovery",
      category: "below_baseline",
    }],
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  };
  return { input, brain, context };
}

describe("Task Map body-context disclosure", () => {
  function acceptedProjection(input: TaskMapInput, brain: SemanticBrainOutput) {
    const stable = buildTaskMapProjection(input, brain, {
      arm: "E2",
      now: input.generatedAt,
    });
    assert.equal(stable.runStatus, "accepted", JSON.stringify(stable.rejections));
    return buildTaskMapProjection(input, brain, {
      arm: "E4",
      now: input.generatedAt,
      previousProjection: stable,
    });
  }

  it("binds safe Oura dates to accepted nodes after membership is fixed", () => {
    const { input, brain, context } = fixture();
    const projection = acceptedProjection(input, brain);
    assert.equal(projection.runStatus, "accepted", JSON.stringify(projection.rejections));
    assert.equal(projection.roots[0].bodyContextCount, 1);
    assert.equal(projection.tasks[0].bodyContextCount, 1);

    const disclosure = buildTaskMapBodyContextDisclosure(input, projection, context);
    assert.equal(disclosure.projectionRunId, projection.runId);
    assert.equal(disclosure.nodes.length, 2);
    assert.deepEqual(disclosure.nodes.map((node) => node.matches[0]), [
      {
        dayKey: "2026-07-27",
        axis: "composite_recovery",
        category: "below_baseline",
        backingSourceCount: 1,
        sourceKind: "oura",
      },
      {
        dayKey: "2026-07-27",
        axis: "composite_recovery",
        category: "below_baseline",
        backingSourceCount: 1,
        sourceKind: "oura",
      },
    ]);
  });

  it("serializes no raw biometric fields or values", () => {
    const { input, brain, context } = fixture();
    const projection = acceptedProjection(input, brain);
    const serialized = JSON.stringify(
      buildTaskMapBodyContextDisclosure(input, projection, context),
    );
    for (const forbidden of [
      "\"score\"",
      "\"bpm\"",
      "\"hrv\"",
      "\"steps\"",
      "\"value\"",
      "\"access_token\"",
      "\"refresh_token\"",
      "/Users/",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  });

  it("fails closed when projection, input, or relative categories diverge", () => {
    const { input, brain, context } = fixture();
    const projection = acceptedProjection(input, brain);
    assert.throws(
      () => buildTaskMapBodyContextDisclosure(
        { ...input, generatedAt: "2026-07-27T19:00:00.000Z" },
        projection,
        context,
      ),
      /accepted matching/,
    );
    assert.throws(
      () => buildTaskMapBodyContextDisclosure(input, projection, {
        ...context,
        days: [{
          ...context.days[0],
          category: "above_baseline",
        }],
      }),
      /do not match/,
    );
  });
});
