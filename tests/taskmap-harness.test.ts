import assert from "node:assert";
import { describe, it } from "node:test";
import {
  buildTaskMapProjection,
  runTaskMapAblation,
  taskMapMembershipSignature,
  taskMapSemanticInput,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  SemanticBrainOutput,
  TASKMAP_CONTRACT_VERSION,
  TaskMapInput,
} from "../src/engine/taskmap/types.js";

function fixture(): { input: TaskMapInput; brain: SemanticBrainOutput } {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: "2026-07-26T20:00:00.000Z",
    pointers: [
      {
        id: "strategy-task",
        sourceKind: "strategy",
        sourceObjectId: "taskmap-mvp",
        sourceRefHash: "1111111111111111",
        authority: "source_system",
        syncMode: "return_only",
        capabilities: ["read_task", "deep_link"],
      },
      {
        id: "granola-note",
        sourceKind: "granola",
        sourceObjectId: "meeting-1",
        sourceRefHash: "2222222222222222",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "codex-session",
        sourceKind: "codex_session",
        sourceObjectId: "session-1",
        sourceRefHash: "3333333333333333",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "oura-day",
        sourceKind: "oura",
        sourceObjectId: "day-1",
        sourceRefHash: "4444444444444444",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      {
        id: "task-created",
        pointerId: "strategy-task",
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: "2026-07-20T17:00:00.000Z",
        observedAt: "2026-07-26T20:00:00.000Z",
        objectRefs: ["task:taskmap-mvp"],
        title: "Ship the Task Map harness",
        summary: "Build the source-linked discovery harness before the visual pass.",
        extractionConfidence: 1,
        sourceStatus: "in_progress",
        priority: 1,
        deadlineAt: "2026-07-27T17:00:00.000Z",
      },
      {
        id: "meeting-context",
        pointerId: "granola-note",
        recordKind: "work_context",
        activity: "decision_deferred",
        occurredAt: "2026-07-15T23:00:00.000Z",
        observedAt: "2026-07-26T20:00:00.000Z",
        dayKey: "2026-07-15",
        objectRefs: ["workstream:taskmap", "decision:summary-v-detail"],
        title: "Task output scope remains open",
        summary: "The meeting left summary versus detailed task output unresolved.",
        extractionConfidence: 0.84,
        bodyJoinEligible: true,
      },
      {
        id: "session-context",
        pointerId: "codex-session",
        recordKind: "work_context",
        activity: "commitment_stated",
        occurredAt: "2026-07-25T20:00:00.000Z",
        observedAt: "2026-07-26T20:00:00.000Z",
        dayKey: "2026-07-25",
        objectRefs: ["workstream:taskmap", "task:explain-path"],
        title: "Explain every task placement",
        summary: "The graph needs a bounded root-to-task explanation path.",
        extractionConfidence: 0.96,
        bodyJoinEligible: true,
      },
      {
        id: "body-context",
        pointerId: "oura-day",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-25T20:00:00.000Z",
        observedAt: "2026-07-26T20:00:00.000Z",
        dayKey: "2026-07-25",
        objectRefs: ["body-day:2026-07-25"],
        title: "Body window below personal baseline",
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
    generatedAt: input.generatedAt,
    roots: [{
      proposalId: "root-taskmap",
      title: "Task Map product truth",
      summary: "One workstream connects the harness, output contract, and explanation path.",
      evidenceEventIds: ["task-created", "meeting-context", "session-context"],
      memberObjectRefs: ["workstream:taskmap", "task:taskmap-mvp", "decision:summary-v-detail"],
      confidence: 0.93,
    }],
    tasks: [
      {
        proposalId: "task-harness",
        rootProposalId: "root-taskmap",
        title: "Ship the Task Map harness",
        summary: "Implement and verify the versioned discovery contract.",
        evidenceEventIds: ["task-created", "session-context"],
        authoritativeTaskEventId: "task-created",
        openState: "open",
        confidence: 0.98,
      },
      {
        proposalId: "task-output-contract",
        rootProposalId: "root-taskmap",
        title: "Resolve summary versus detail",
        summary: "Choose the first user-facing task output level.",
        evidenceEventIds: ["meeting-context", "session-context"],
        openState: "possibly_open",
        confidence: 0.82,
      },
    ],
    edges: [{
      proposalId: "edge-root-harness",
      fromProposalId: "root-taskmap",
      toProposalId: "task-harness",
      relation: "advances",
      evidenceEventIds: ["task-created"],
      confidence: 1,
    }],
  };
  return { input, brain };
}

describe("Task Map deterministic harness", () => {
  it("keeps source-owned and discovered work distinct", () => {
    const { input, brain } = fixture();
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    assert.strictEqual(projection.roots.length, 1);
    assert.strictEqual(projection.tasks.length, 2);
    assert.strictEqual(projection.tasks[0].reviewState, "accepted");
    assert.strictEqual(projection.tasks[1].reviewState, "proposed");
    assert.strictEqual(projection.tasks[0].authority, "source_system");
    const owned = projection.tasks.find((task) => task.reviewState === "accepted")!;
    const discovered = projection.tasks.find((task) => task.reviewState === "proposed")!;
    assert.strictEqual(owned.returnRoute.state, "source_owned");
    assert.strictEqual(owned.returnRoute.requiresApproval, true);
    assert.ok(owned.originPointerIds.includes("strategy-task"));
    assert.deepStrictEqual(discovered.returnRoute, {
      state: "user_destination_required",
      requiresApproval: true,
    });
  });

  it("does not advertise a source-owned route for a read-only task home", () => {
    const { input } = fixture();
    const taskHome = input.pointers.find((pointer) => pointer.id === "strategy-task")!;
    taskHome.syncMode = "reference_only";
    taskHome.capabilities = ["read_task"];
    const projection = buildTaskMapProjection(input, null, { arm: "E0" });
    const task = projection.tasks[0];
    assert.strictEqual(projection.runStatus, "accepted");
    assert.strictEqual(task.authority, "source_system");
    assert.strictEqual(task.taskHomePointerId, "strategy-task");
    assert.deepStrictEqual(task.returnRoute, {
      state: "user_destination_required",
      requiresApproval: true,
    });
  });

  it("body context joins after membership and never changes it", () => {
    const { input, brain } = fixture();
    const report = runTaskMapAblation(input, brain);
    assert.strictEqual(report.controls.bodyMaskMembershipStable, true);
    assert.strictEqual(report.controls.bodyShuffleMembershipStable, true);
  });

  it("rejects body-only roots and tasks", () => {
    const { input, brain } = fixture();
    brain.roots = [{
      proposalId: "body-root",
      title: "Urgent body root",
      summary: "This must not be accepted.",
      evidenceEventIds: ["body-context"],
      memberObjectRefs: ["body-day:2026-07-25"],
      confidence: 1,
    }];
    brain.tasks = [{
      proposalId: "body-task",
      rootProposalId: "body-root",
      title: "Do something because body changed",
      summary: "This must not be accepted.",
      evidenceEventIds: ["body-context"],
      openState: "open",
      confidence: 1,
    }];
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    assert.strictEqual(projection.roots.length, 0);
    assert.strictEqual(projection.tasks.length, 0);
    assert.ok(projection.rejections.some((item) => item.reasons.includes("body context cannot create a root")));
  });

  it("rejects unsupported completion and privacy leaks", () => {
    const { input, brain } = fixture();
    brain.tasks[1] = {
      ...brain.tasks[1],
      title: "Read /Users/example/private.txt",
      openState: "completed",
    };
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    assert.strictEqual(projection.tasks.length, 1);
    const rejected = projection.rejections.find((item) => item.proposalId === "task-output-contract");
    assert.ok(rejected?.reasons.includes("privacy leak: local_path"));
    assert.ok(rejected?.reasons.includes("completion cannot be inferred without a source completion event"));
  });

  it("reuses a root only when member overlap clears the versioned heuristic", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E4" });
    const firstId = first.roots[0].id;
    brain.roots[0] = {
      ...brain.roots[0],
      title: "Renamed Task Map workstream",
      memberObjectRefs: ["workstream:taskmap", "task:taskmap-mvp"],
    };
    const next = buildTaskMapProjection(input, brain, {
      arm: "E4",
      previousProjection: first,
    });
    assert.strictEqual(next.roots[0].id, firstId);
  });

  it("explicit baseline still works without a semantic brain", () => {
    const { input } = fixture();
    const projection = buildTaskMapProjection(input, null, { arm: "E0" });
    assert.strictEqual(projection.roots.length, 1);
    assert.strictEqual(projection.tasks.length, 1);
    assert.strictEqual(projection.brain, null);
  });

  it("membership signature ignores score and body presentation changes", () => {
    const { input, brain } = fixture();
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    const changed = structuredClone(projection);
    changed.tasks[0].score.bodyBonus = 0.08;
    changed.roots[0].bodyContextCount = 99;
    assert.strictEqual(taskMapMembershipSignature(projection), taskMapMembershipSignature(changed));
  });

  it("removes body events and body-only pointers from the semantic brain contract", () => {
    const { input } = fixture();
    const original = taskMapSemanticInputDigest(input);
    const changed = structuredClone(input);
    const body = changed.events.find((event) => event.recordKind === "body_context")!;
    body.occurredAt = "2025-01-01T00:00:00.000Z";
    body.title = "Body window above personal baseline";
    body.bodyCategory = "above_baseline";
    const ouraPointer = changed.pointers.find((pointer) => pointer.sourceKind === "oura")!;
    ouraPointer.sourceObjectId = "different-private-body-window";
    assert.strictEqual(taskMapSemanticInputDigest(changed), original);
    assert.ok(taskMapSemanticInput(input).events.every((event) => event.recordKind !== "body_context"));
    assert.ok(taskMapSemanticInput(input).pointers.every((pointer) => pointer.sourceKind !== "oura"));
  });

  it("fails closed when the semantic brain digest is stale", () => {
    const { input, brain } = fixture();
    brain.inputDigest = "0000000000000000";
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    assert.strictEqual(projection.roots.length, 0);
    assert.strictEqual(projection.tasks.length, 0);
    assert.strictEqual(projection.brain, null);
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "brain"
      && item.reasons.includes("brain semantic input digest does not match")
    )));
  });

  it("rejects body citations even when work evidence is also present", () => {
    const { input, brain } = fixture();
    brain.roots[0].evidenceEventIds.push("body-context");
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    assert.strictEqual(projection.roots.length, 0);
    assert.strictEqual(projection.tasks.length, 0);
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "root-taskmap"
      && item.reasons.includes("body context must be joined after root membership")
    )));
  });

  it("adds body urgency only to tasks with a joined work window and a passing causal gate", () => {
    const { input, brain } = fixture();
    const corroboration = [
      ["work-granola-23", "granola-note", "2026-07-23T20:00:00.000Z"],
      ["work-codex-23", "codex-session", "2026-07-23T21:00:00.000Z"],
      ["work-granola-24", "granola-note", "2026-07-24T20:00:00.000Z"],
      ["work-strategy-24", "strategy-task", "2026-07-24T21:00:00.000Z"],
      ["work-strategy-25", "strategy-task", "2026-07-25T21:00:00.000Z"],
    ] as const;
    for (const [id, pointerId, occurredAt] of corroboration) {
      input.events.push({
        id,
        pointerId,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt,
        observedAt: input.generatedAt,
        dayKey: occurredAt.slice(0, 10),
        objectRefs: ["workstream:taskmap"],
        title: "Corroborating Task Map work context",
        summary: "A bounded source event supports the same workstream on this day.",
        extractionConfidence: 0.9,
        bodyJoinEligible: true,
      });
      brain.roots[0].evidenceEventIds.push(id);
    }
    for (const [id, occurredAt] of [
      ["body-context-23", "2026-07-23T20:00:00.000Z"],
      ["body-context-24", "2026-07-24T20:00:00.000Z"],
    ] as const) {
      input.events.push({
        id,
        pointerId: "oura-day",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt,
        observedAt: input.generatedAt,
        dayKey: occurredAt.slice(0, 10),
        objectRefs: [`body-day:${occurredAt.slice(0, 10)}`],
        title: "Body window below personal baseline",
        summary: "Relative category only; no raw biometric value is stored.",
        extractionConfidence: 1,
        bodyCategory: "below_baseline",
        bodyAxis: "composite_recovery",
      });
    }
    input.events.push({
      id: "body-context-25-above",
      pointerId: "oura-day",
      recordKind: "body_context",
      activity: "body_window_observed",
      occurredAt: "2026-07-25T20:00:00.000Z",
      observedAt: input.generatedAt,
      dayKey: "2026-07-25",
      objectRefs: ["body-day:2026-07-25-above"],
      title: "Body window above personal baseline",
      summary: "Relative category only; no raw biometric value is stored.",
      extractionConfidence: 1,
      bodyCategory: "above_baseline",
      bodyAxis: "composite_recovery",
    });
    for (const date of [
      "2026-07-18",
      "2026-07-19",
      "2026-07-20",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]) {
      for (const [suffix, pointerId] of [
        ["granola", "granola-note"],
        ["codex", "codex-session"],
        ["strategy", "strategy-task"],
      ] as const) {
        input.events.push({
          id: `coverage-${suffix}-${date}`,
          pointerId,
          recordKind: "receipt",
          activity: "receipt_observed",
          occurredAt: `${date}T18:00:00.000Z`,
          observedAt: input.generatedAt,
          dayKey: date,
          objectRefs: [`coverage:${date}`],
          title: "Comparable work corpus coverage",
          summary: "The connector reported complete bounded availability for this source-local day.",
          extractionConfidence: 0.9,
          corpusCoverage: "complete",
        });
      }
      if (!["2026-07-18", "2026-07-19", "2026-07-20"].includes(date)) continue;
      input.events.push({
        id: `body-neutral-${date}`,
        pointerId: "oura-day",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: `${date}T20:00:00.000Z`,
        observedAt: input.generatedAt,
        dayKey: date,
        objectRefs: [`body-day:${date}`],
        title: "Body window within personal baseline",
        summary: "Relative category only; no raw biometric value is stored.",
        extractionConfidence: 1,
        bodyCategory: "within_baseline",
        bodyAxis: "composite_recovery",
      });
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.tasks.push({
      proposalId: "task-old-context",
      rootProposalId: "root-taskmap",
      title: "Resolve the earlier output question",
      summary: "Review the unresolved decision from the earlier product meeting.",
      evidenceEventIds: ["meeting-context"],
      openState: "possibly_open",
      confidence: 0.8,
    });
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map product truth",
          targetHits: 3,
          targetN: 3,
          referenceRate: 0,
          referenceN: 3,
          citedDays: [
            { date: "2026-07-23", backed: true, sources: ["granola", "codex_session"] },
            { date: "2026-07-24", backed: true, sources: ["granola", "strategy"] },
            { date: "2026-07-25", backed: true, sources: ["codex_session", "strategy"] },
          ],
          rtmSuspected: true,
        },
      }],
    });
    const joined = projection.tasks.find((task) => task.title === "Ship the Task Map harness")!;
    const old = projection.tasks.find((task) => task.title === "Resolve the earlier output question")!;
    assert.strictEqual(joined.bodyContextCount, 2);
    assert.strictEqual(joined.score.bodyBonus, 0.03);
    assert.strictEqual(old.bodyContextCount, 0);
    assert.strictEqual(old.score.bodyBonus, 0);
    assert.strictEqual(projection.roots[0].causalGate?.ratio, null);
    assert.strictEqual(projection.roots[0].causalGate?.enrichmentInfinite, true);
    const rootScore = projection.roots[0].scoreBreakdown;
    const maxChildWithoutBody = Math.max(
      ...projection.tasks.map((task) => task.score.total - task.score.bodyBonus),
    );
    assert.strictEqual(rootScore.maxChildActionability, Math.round(maxChildWithoutBody * 1_000) / 1_000);
    assert.strictEqual(rootScore.bodyBonus, 0.03);
    const weightedRootWithoutBody = (
      rootScore.maxChildActionability * 0.50
      + rootScore.rootRecurrence * 0.20
      + rootScore.evidenceStrength * 0.10
      + rootScore.sourceBreadth * 0.10
      + rootScore.actionableLoad * 0.05
      + rootScore.dependencyBreadth * 0.05
    );
    assert.ok(Math.abs(rootScore.total - (weightedRootWithoutBody + 0.03)) < 0.002);
    assert.doesNotThrow(() => JSON.stringify(projection));
  });

  it("does not let a different source pointer retract an authoritative task", () => {
    const { input } = fixture();
    input.events.push({
      id: "bad-cross-source-retraction",
      pointerId: "granola-note",
      recordKind: "authoritative_task",
      activity: "task_updated",
      occurredAt: "2026-07-26T18:00:00.000Z",
      observedAt: "2026-07-26T20:00:01.000Z",
      objectRefs: ["task:taskmap-mvp"],
      title: "Cross-source retraction attempt",
      summary: "A context source must not deactivate a source-owned task.",
      extractionConfidence: 1,
      retractsEventId: "task-created",
    });
    const projection = buildTaskMapProjection(input, null, { arm: "E0" });
    assert.strictEqual(projection.roots.length, 1);
    assert.strictEqual(projection.tasks.length, 1);
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "bad-cross-source-retraction"
      && item.reasons.includes("retracts must stay within one source pointer")
    )));
  });

  it("uses every replay-affecting input in the run identity", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, {
      arm: "E2",
      now: "2026-07-26T20:00:00.000Z",
    });
    const replay = buildTaskMapProjection(input, brain, {
      arm: "E2",
      now: "2026-07-26T20:00:00.000Z",
    });
    assert.strictEqual(first.runId, replay.runId);

    const changedBrain = structuredClone(brain);
    changedBrain.tasks[0].summary = "A materially different but still bounded semantic proposal.";
    const changed = buildTaskMapProjection(input, changedBrain, {
      arm: "E2",
      now: "2026-07-26T20:00:00.000Z",
    });
    const later = buildTaskMapProjection(input, brain, {
      arm: "E2",
      now: "2026-07-26T20:00:01.000Z",
    });
    assert.notStrictEqual(first.runId, changed.runId);
    assert.notStrictEqual(first.runId, later.runId);
  });

  it("rejects forged causal statistics, custom thresholds, and private source labels", () => {
    const { input, brain } = fixture();
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map delivery pressure",
          targetHits: 99,
          targetN: 1,
          referenceRate: -1,
          referenceN: -5,
          citedDays: [{
            date: "not-a-day",
            backed: true,
            sources: ["/Users/private/source"],
          }],
          rtmSuspected: false,
          thresholds: {
            minRatio: 0,
            minBackedDays: 0,
            minSourcesPerDay: 0,
          },
        },
      }],
    });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.strictEqual(projection.roots[0].causalGrade, "C0_NO_DATA");
    assert.ok(projection.tasks.every((task) => task.score.bodyBonus === 0));
    assert.ok(projection.rejections.some((item) => (
      item.reasons.includes("causal thresholds are fixed by the versioned gate")
      && item.reasons.includes("privacy leak: local_path")
    )));
    assert.ok(!JSON.stringify(projection).includes("/Users/private/source"));
  });

  it("rejects duplicate relations before they can inflate dependency impact", () => {
    const { input, brain } = fixture();
    brain.edges = [
      {
        proposalId: "edge-block-one",
        fromProposalId: "task-harness",
        toProposalId: "task-output-contract",
        relation: "blocks",
        evidenceEventIds: ["session-context"],
        confidence: 0.9,
      },
      {
        proposalId: "edge-block-two",
        fromProposalId: "task-harness",
        toProposalId: "task-output-contract",
        relation: "blocks",
        evidenceEventIds: ["session-context"],
        confidence: 0.8,
      },
    ];
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.strictEqual(projection.edges.length, 0);
    assert.strictEqual(
      projection.tasks.find((task) => task.title === "Ship the Task Map harness")!.score.dependencyImpact,
      0,
    );
    assert.strictEqual(
      projection.rejections.filter((item) => item.reasons.includes("duplicate edge relation")).length,
      2,
    );
  });

  it("rejects semantic state that contradicts the latest source status", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.activity = "task_completed";
    source.sourceStatus = "completed";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const rejected = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(rejected.rejections.some((item) => (
      item.proposalId === "task-harness"
      && item.reasons.includes("brain open state conflicts with source status")
    )));

    brain.tasks[0].openState = "completed";
    const accepted = buildTaskMapProjection(input, brain, { arm: "E2" });
    const task = accepted.tasks.find((candidate) => candidate.title === "Ship the Task Map harness")!;
    assert.strictEqual(task.openState, "completed");
    assert.strictEqual(task.reviewState, "source_complete");
  });

  it("never reuses an unsafe previous root identity", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E3" });
    const previous = structuredClone(first);
    previous.roots[0].id = "/Users/private/root";
    const next = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: previous,
    });
    assert.strictEqual(next.runStatus, "rejected");
    assert.match(next.roots[0].id, /^tmr_[a-f0-9]{16}$/);
    assert.ok(!JSON.stringify(next).includes("/Users/private/root"));
  });

  it("rejects malformed, duplicate, and orphaned previous projection identities", () => {
    const { input, brain } = fixture();
    const accepted = buildTaskMapProjection(input, brain, { arm: "E3" });
    const cases: Array<{
      reason: string;
      mutate: (previous: typeof accepted) => void;
    }> = [
      {
        reason: "previous root id is invalid",
        mutate: (previous) => { previous.roots[0].id = "tmr_not_versioned"; },
      },
      {
        reason: "previous task id is invalid",
        mutate: (previous) => {
          const priorId = previous.tasks[1].id;
          previous.tasks[1].id = "tmc_not_a_versioned_id";
          previous.roots[0].taskIds = previous.roots[0].taskIds.map((id) => (
            id === priorId ? previous.tasks[1].id : id
          ));
        },
      },
      {
        reason: "previous task ids must be globally unique",
        mutate: (previous) => { previous.tasks[1].id = previous.tasks[0].id; },
      },
      {
        reason: "previous task rootId must reference a previous root",
        mutate: (previous) => { previous.tasks[1].rootId = "tmr_9999999999999999"; },
      },
      {
        reason: "previous root taskIds must reference previous tasks",
        mutate: (previous) => { previous.roots[0].taskIds.push("tmc_9999999999999999"); },
      },
      {
        reason: "previous edge id is invalid",
        mutate: (previous) => { previous.edges[0].id = "tme_not_versioned"; },
      },
      {
        reason: "previous edge endpoints must reference previous roots or tasks",
        mutate: (previous) => { previous.edges[0].from = "tmr_9999999999999999"; },
      },
    ];
    for (const testCase of cases) {
      const previous = structuredClone(accepted);
      testCase.mutate(previous);
      const projection = buildTaskMapProjection(input, brain, {
        arm: "E3",
        previousProjection: previous,
      });
      assert.strictEqual(projection.runStatus, "rejected", testCase.reason);
      assert.ok(projection.rejections.some((item) => (
        item.proposalId === "previous-projection"
        && item.reasons.includes(testCase.reason)
      )), testCase.reason);
      assert.ok(!projection.tasks.some((task) => task.id === "tmc_not_a_versioned_id"));
    }
  });

  it("uses maximum-cardinality weighted matching for persistent root IDs", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.objectRefs.push("member:a", "member:b", "member:c", "member:d", "member:e", "member:f");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots = [
      {
        proposalId: "root-a",
        title: "First workstream",
        summary: "This root has two viable prior identities.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: ["member:a", "member:b", "member:c", "member:e"],
        confidence: 0.9,
      },
      {
        proposalId: "root-b",
        title: "Second workstream",
        summary: "This root has only one viable prior identity.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: ["member:c", "member:d"],
        confidence: 0.9,
      },
    ];
    brain.tasks = [];
    brain.edges = [];
    const template = buildTaskMapProjection(input, null, { arm: "E0" });
    const previous = structuredClone(template);
    previous.roots = [
      {
        ...template.roots[0],
        id: "tmr_1111111111111111",
        title: "Prior one",
        taskIds: [],
        memberObjectRefs: ["member:a", "member:b", "member:c", "member:d"],
      },
      {
        ...template.roots[0],
        id: "tmr_2222222222222222",
        title: "Prior two",
        taskIds: [],
        memberObjectRefs: ["member:a", "member:b", "member:e", "member:f"],
      },
    ];
    previous.tasks = [];
    previous.edges = [];
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: previous,
    });
    const rootA = projection.roots.find((root) => root.title === "First workstream")!;
    const rootB = projection.roots.find((root) => root.title === "Second workstream")!;
    assert.strictEqual(rootA.id, "tmr_2222222222222222");
    assert.strictEqual(rootB.id, "tmr_1111111111111111");
  });

  it("keeps maximum cardinality ahead of aggregate overlap on a seven-root chain", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    const priorMembers = [
      ["member:a", "member:b", "member:c"],
      ["member:b", "member:c", "member:e"],
      ["member:c", "member:e", "member:f"],
      ["member:e", "member:f", "member:g"],
      ["member:f", "member:g", "member:h"],
      ["member:g", "member:h", "member:i"],
      ["member:h", "member:i", "member:j"],
    ];
    source.objectRefs.push(...new Set(priorMembers.flat()), "member:d");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots = [
      ...priorMembers.slice(0, 6).map((members, index) => ({
        proposalId: `chain-root-${index + 1}`,
        title: `Chain workstream ${index + 1}`,
        summary: "This root participates in the alternating identity chain.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: members,
        confidence: 0.9,
      })),
      {
        proposalId: "chain-root-7",
        title: "Chain workstream 7",
        summary: "This root can only reuse the first prior identity.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: ["member:a", "member:b", "member:d"],
        confidence: 0.9,
      },
    ];
    brain.tasks = [{
      ...brain.tasks[0],
      rootProposalId: "chain-root-1",
    }];
    brain.edges = [];
    const template = buildTaskMapProjection(input, null, { arm: "E0" });
    const previous = structuredClone(template);
    previous.roots = priorMembers.map((memberObjectRefs, index) => ({
      ...template.roots[0],
      id: `tmr_${String(index + 1).repeat(16)}`,
      title: `Prior chain ${index + 1}`,
      taskIds: [],
      memberObjectRefs,
    }));
    previous.tasks = [];
    previous.edges = [];
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: previous,
    });
    assert.strictEqual(projection.runStatus, "accepted");
    assert.strictEqual(new Set(projection.roots.map((root) => root.id)).size, 7);
    for (let index = 1; index <= 6; index += 1) {
      const root = projection.roots.find((candidate) => candidate.title === `Chain workstream ${index}`)!;
      assert.strictEqual(root.id, `tmr_${String(index + 1).repeat(16)}`);
    }
    assert.strictEqual(
      projection.roots.find((root) => root.title === "Chain workstream 7")!.id,
      "tmr_1111111111111111",
    );
  });

  it("derives causal counts, neutral reference, cited days, and sources from the input", () => {
    const { input, brain } = fixture();
    input.events.push(
      {
        ...input.events.find((event) => event.id === "body-context")!,
        id: "body-within-reference",
        occurredAt: "2026-07-24T20:00:00.000Z",
        dayKey: "2026-07-24",
        objectRefs: ["body-day:2026-07-24"],
        title: "Body window within personal baseline",
        bodyCategory: "within_baseline",
      },
      {
        ...input.events.find((event) => event.id === "body-context")!,
        id: "body-opposite-extreme",
        occurredAt: "2026-07-23T20:00:00.000Z",
        dayKey: "2026-07-23",
        objectRefs: ["body-day:2026-07-23"],
        title: "Body window above personal baseline",
        bodyCategory: "above_baseline",
      },
    );
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map delivery pressure",
          targetHits: 1,
          targetN: 1,
          referenceRate: 0.1,
          referenceN: 2,
          citedDays: [{
            date: "2026-07-25",
            backed: true,
            sources: ["granola"],
          }],
          rtmSuspected: true,
        },
      }],
    });
    const rejection = projection.rejections.find((item) => item.proposalId === "causal:root-taskmap");
    assert.strictEqual(projection.runStatus, "rejected");
    assert.ok(rejection?.reasons.includes("causal referenceN does not match neutral baseline input"));
    assert.ok(rejection?.reasons.includes("causal referenceRate does not match neutral baseline input"));
    assert.ok(rejection?.reasons.includes("causal citedDays and sources do not match Task Map input"));
    assert.ok(rejection?.reasons.includes("causal theme must match the accepted root title"));
    assert.strictEqual(projection.roots[0].causalGrade, "C0_NO_DATA");
    assert.ok(projection.tasks.every((task) => task.score.bodyBonus === 0));
  });

  it("rejects authoritative activity and status contradictions", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.activity = "task_completed";
    source.sourceStatus = "in_progress";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "task-created"
      && item.reasons.includes("task_completed activity requires completed source status")
    )));
  });

  it("uses unknown rather than brain state when an update has no source status", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.activity = "task_updated";
    delete source.sourceStatus;
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const rejected = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(rejected.rejections.some((item) => (
      item.proposalId === "task-harness"
      && item.reasons.includes("brain open state conflicts with source status")
    )));

    brain.tasks[0].openState = "unknown";
    const accepted = buildTaskMapProjection(input, brain, { arm: "E2" });
    const task = accepted.tasks.find((candidate) => candidate.title === "Ship the Task Map harness")!;
    assert.strictEqual(accepted.runStatus, "accepted");
    assert.strictEqual(task.openState, "unknown");
    assert.strictEqual(task.sourceStatus, undefined);
  });

  it("rejects encoded URL leaks without echoing credential or path values", () => {
    const { input, brain } = fixture();
    const pointer = input.pointers.find((candidate) => candidate.id === "strategy-task")!;
    pointer.canonicalUrl = "https://example.com/review/%2FUsers%2Fyz%2Fprivate?redirect=sk-proj-secretvalue&person=neo%40example.com#Bearer%20secretsecret";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    const rejection = projection.rejections.find((item) => item.proposalId === "strategy-task");
    assert.strictEqual(projection.runStatus, "rejected");
    assert.ok(rejection?.reasons.includes("privacy leak: local_path"));
    assert.ok(rejection?.reasons.includes("privacy leak: api_key"));
    assert.ok(rejection?.reasons.includes("privacy leak: email"));
    assert.ok(rejection?.reasons.includes("privacy leak: bearer"));
    const serialized = JSON.stringify(projection);
    assert.ok(!serialized.includes("secretvalue"));
    assert.ok(!serialized.includes("%2FUsers"));
    assert.ok(!serialized.includes("neo%40example.com"));
  });

  it("catches a local path next to punctuation in semantic text", () => {
    const { input, brain } = fixture();
    brain.roots[0].title = "Review(/Users/example/private/task-map)";
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "root-taskmap"
      && item.reasons.includes("privacy leak: local_path")
    )));
    assert.ok(!JSON.stringify(projection).includes("/Users/example/private"));
  });

  it("requires explicit RFC3339 zones for every replay-affecting timestamp", () => {
    const { input, brain } = fixture();
    input.generatedAt = "2026-07-26T20:00:00";
    input.events[0].occurredAt = "2026-07-20T17:00:00";
    brain.generatedAt = "2026-07-26T20:00:00";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.strictEqual(projection.generatedAt, "1970-01-01T00:00:00.000Z");
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "input-generated-at"
      && item.reasons.includes("input generatedAt must be strict RFC3339 with Z or an offset")
    )));
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "task-created"
      && item.reasons.includes("event timestamps must be strict RFC3339 with Z or an offset")
    )));
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "brain"
      && item.reasons.includes("brain generatedAt must be strict RFC3339 with Z or an offset")
    )));
  });

  it("excludes body-source records from the semantic brain even if mislabeled as work", () => {
    const { input, brain } = fixture();
    const fake = input.events.find((event) => event.id === "body-context")!;
    fake.recordKind = "work_context";
    fake.activity = "context_observed";
    delete fake.bodyCategory;
    fake.bodyJoinEligible = true;
    fake.title = "Mislabeled Oura work context";
    const semantic = taskMapSemanticInput(input);
    assert.ok(!semantic.events.some((event) => event.id === fake.id));
    assert.ok(!semantic.pointers.some((pointer) => pointer.sourceKind === "oura"));

    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots[0].evidenceEventIds = [fake.id];
    brain.roots[0].memberObjectRefs = fake.objectRefs;
    brain.tasks = [];
    brain.edges = [];
    const projection = buildTaskMapProjection(input, brain, { arm: "E1" });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.strictEqual(projection.roots.length, 0);
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === fake.id
      && item.reasons.includes("body-source pointers may only emit body context or receipts")
    )));
  });

  it("does not treat an incomplete semantic brain as a successful empty Task Map", () => {
    const { input, brain } = fixture();
    brain.roots = [];
    brain.tasks = [];
    brain.edges = [];
    const projection = buildTaskMapProjection(input, brain, { arm: "E1" });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.strictEqual(projection.tasks.length, 0);
    assert.ok(projection.rejections.some((item) => (
      item.kind === "input"
      && item.reasons.includes("latest authoritative task must have exactly one accepted semantic task")
    )));
  });

  it("keeps discovered task identity stable across proposal labels but changes it with meaning", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E2" });
    const firstId = first.tasks.find((task) => task.title === "Resolve summary versus detail")!.id;

    const relabeled = structuredClone(brain);
    relabeled.tasks[1].proposalId = "different-model-local-label";
    const second = buildTaskMapProjection(input, relabeled, { arm: "E2" });
    assert.strictEqual(
      second.tasks.find((task) => task.title === "Resolve summary versus detail")!.id,
      firstId,
    );

    const changedMeaning = structuredClone(brain);
    changedMeaning.tasks[1].title = "Choose the public demo audience";
    changedMeaning.tasks[1].summary = "Make a different product decision with the same local proposal label.";
    const third = buildTaskMapProjection(input, changedMeaning, { arm: "E2" });
    assert.notStrictEqual(
      third.tasks.find((task) => task.title === "Choose the public demo audience")!.id,
      firstId,
    );
  });

  it("keeps ordinary non-Agent work-item references on the legacy discovered-task path", () => {
    const { input, brain } = fixture();
    for (const eventId of ["meeting-context", "session-context"]) {
      input.events.find((event) => event.id === eventId)!
        .objectRefs.push("work-item:JIRA-123");
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);

    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });

    assert.strictEqual(projection.runStatus, "accepted");
    assert.ok(
      projection.tasks.some(
        (task) => task.title === "Resolve summary versus detail",
      ),
    );
    assert.ok(!projection.rejections.some((rejection) =>
      rejection.reasons.includes("source-owned work item ref is invalid")
    ));
  });

  it("does not let a non-Agent 64-hex work-item reference override discovered-task identity", () => {
    const { input, brain } = fixture();
    const nonAgentWorkItemRef = `work-item:${"a".repeat(64)}`;
    for (const eventId of ["meeting-context", "session-context"]) {
      input.events.find((event) => event.id === eventId)!
        .objectRefs.push(nonAgentWorkItemRef);
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const first = buildTaskMapProjection(input, brain, { arm: "E2" });
    const firstId = first.tasks.find(
      (task) => task.title === "Resolve summary versus detail",
    )!.id;

    const changedMeaning = structuredClone(brain);
    changedMeaning.tasks[1] = {
      ...changedMeaning.tasks[1],
      title: "Choose the public demo audience",
      summary: "Make a different product decision from the same non-Agent evidence.",
    };
    const second = buildTaskMapProjection(input, changedMeaning, {
      arm: "E2",
    });
    const secondId = second.tasks.find(
      (task) => task.title === "Choose the public demo audience",
    )!.id;

    assert.notStrictEqual(
      secondId,
      firstId,
      "a non-Agent object ref must not alias unrelated discovered tasks",
    );
  });

  it("does not let a non-Agent 64-hex workstream reference override root identity", () => {
    const { input, brain } = fixture();
    const nonAgentWorkstreamRef = `workstream:${"b".repeat(64)}`;
    for (const eventId of ["meeting-context", "session-context"]) {
      input.events.find((event) => event.id === eventId)!
        .objectRefs.push(nonAgentWorkstreamRef);
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots[0].memberObjectRefs = [nonAgentWorkstreamRef];
    const first = buildTaskMapProjection(input, brain, { arm: "E2" });
    const firstRootId = first.roots[0].id;

    const changedMeaning = structuredClone(brain);
    changedMeaning.roots[0] = {
      ...changedMeaning.roots[0],
      title: "A semantically different workstream",
      summary: "This non-Agent root must retain the legacy title-aware identity.",
    };
    const second = buildTaskMapProjection(input, changedMeaning, {
      arm: "E2",
    });

    assert.notStrictEqual(
      second.roots[0].id,
      firstRootId,
      "a non-Agent workstream ref must not alias unrelated roots",
    );
  });

  it("ignores previous projections completely outside E3 and E4", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E1" });
    const unsafePrevious = structuredClone(first);
    unsafePrevious.roots[0].id = "/Users/private/injected-root";
    const replay = buildTaskMapProjection(input, brain, {
      arm: "E1",
      previousProjection: unsafePrevious,
    });
    assert.strictEqual(replay.runStatus, "accepted");
    assert.strictEqual(replay.runId, first.runId);
    assert.ok(!replay.rejections.some((item) => item.proposalId === "previous-projection"));
    assert.ok(!JSON.stringify(replay).includes("/Users/private"));
  });

  it("prevents a safe previous ID from colliding with a newly generated final root ID", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.objectRefs.push("member:a", "member:b", "member:c", "member:d");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots = [
      {
        proposalId: "collision-root-a",
        title: "Collision workstream A",
        summary: "This root intentionally reuses the prior identity.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: ["member:a", "member:b"],
        confidence: 0.9,
      },
      {
        proposalId: "collision-root-b",
        title: "Collision workstream B",
        summary: "Its natural generated ID is injected into the prior root.",
        evidenceEventIds: ["task-created"],
        memberObjectRefs: ["member:c", "member:d"],
        confidence: 0.9,
      },
    ];
    brain.tasks = [{
      ...brain.tasks[0],
      rootProposalId: "collision-root-a",
    }];
    brain.edges = [];
    const withoutPrevious = buildTaskMapProjection(input, brain, { arm: "E3" });
    const naturalB = withoutPrevious.roots.find((root) => root.title === "Collision workstream B")!.id;
    const previous = structuredClone(withoutPrevious);
    previous.roots = [{
      ...withoutPrevious.roots.find((root) => root.title === "Collision workstream A")!,
      id: naturalB,
    }];
    previous.tasks = previous.tasks.map((task) => ({ ...task, rootId: naturalB }));
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: previous,
    });
    const rootA = projection.roots.find((root) => root.title === "Collision workstream A")!;
    const rootB = projection.roots.find((root) => root.title === "Collision workstream B")!;
    assert.strictEqual(rootA.id, naturalB);
    assert.notStrictEqual(rootB.id, naturalB);
    assert.strictEqual(new Set(projection.roots.map((root) => root.id)).size, 2);
  });

  it("rejects duplicate member refs inside one root", () => {
    const { input, brain } = fixture();
    brain.roots[0].memberObjectRefs = ["workstream:taskmap", "workstream:taskmap"];
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "root-taskmap"
      && item.reasons.includes("root member object refs must be unique")
    )));
  });

  it("reports rejected ablation arms and does not claim stable controls", () => {
    const { input, brain } = fixture();
    brain.inputDigest = "0000000000000000";
    brain.provider = "/Users/private/provider";
    const report = runTaskMapAblation(input, brain);
    assert.strictEqual(report.arms.find((arm) => arm.arm === "E0")!.runStatus, "accepted");
    const semanticArm = report.arms.find((arm) => arm.arm === "E1")!;
    assert.strictEqual(semanticArm.runStatus, "rejected");
    assert.ok(semanticArm.rejectionCount > 0);
    assert.ok(semanticArm.rejectionSummary.some((item) => item.kind === "input"));
    assert.match(report.inputDigest, /^[a-f0-9]{64}$/);
    assert.match(report.semanticInputDigest, /^[a-f0-9]{64}$/);
    assert.match(semanticArm.runId, /^tmrun_[a-f0-9]{16}$/);
    assert.strictEqual(report.brain.provider, "rejected");
    assert.ok(!JSON.stringify(report).includes("/Users/private"));
    assert.match(report.controls.bodyMaskRunId, /^tmrun_[a-f0-9]{16}$/);
    assert.strictEqual(report.controls.bodyMaskMembershipStable, null);
    assert.strictEqual(report.controls.bodyShuffleMembershipStable, null);
  });

  it("makes completed work non-actionable in score, why-now, and root urgency", () => {
    const { input, brain } = fixture();
    const source = input.events.find((event) => event.id === "task-created")!;
    source.activity = "task_completed";
    source.sourceStatus = "completed";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.tasks = [{
      ...brain.tasks[0],
      openState: "completed",
    }];
    brain.edges = [];
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E2",
      now: "2026-08-30T20:00:00.000Z",
    });
    assert.strictEqual(projection.runStatus, "accepted");
    assert.strictEqual(projection.tasks[0].score.total, 0);
    assert.deepStrictEqual(projection.tasks[0].whyNow, []);
    assert.strictEqual(projection.roots[0].score, 0);
    assert.deepStrictEqual(projection.roots[0].scoreBreakdown, {
      maxChildActionability: 0,
      rootRecurrence: 0,
      evidenceStrength: 0,
      sourceBreadth: 0,
      actionableLoad: 0,
      dependencyBreadth: 0,
      bodyBonus: 0,
      total: 0,
    });
    assert.deepStrictEqual(projection.roots[0].whyNow, []);
  });

  it("raises root rank when the same leaf gains cross-day cross-source evidence", () => {
    const baseline = fixture();
    baseline.brain.roots[0].evidenceEventIds = ["task-created", "session-context"];
    baseline.brain.roots[0].memberObjectRefs = ["workstream:taskmap", "task:taskmap-mvp"];
    const first = buildTaskMapProjection(baseline.input, baseline.brain, { arm: "E2" });
    const leafScores = first.tasks.map((task) => task.score.total);

    const expanded = fixture();
    expanded.brain.roots[0].evidenceEventIds = ["task-created", "session-context"];
    expanded.brain.roots[0].memberObjectRefs = ["workstream:taskmap", "task:taskmap-mvp"];
    for (const [index, sourceKind] of ["github", "slack", "google_calendar"].entries()) {
      const pointerId = `root-source-${index}`;
      expanded.input.pointers.push({
        id: pointerId,
        sourceKind: sourceKind as "github" | "slack" | "google_calendar",
        sourceObjectId: `root-evidence-${index}`,
        sourceRefHash: `${index + 7}`.repeat(16),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      });
      const eventId = `root-evidence-${index}`;
      expanded.input.events.push({
        id: eventId,
        pointerId,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: `2026-07-${17 + index}T18:00:00.000Z`,
        observedAt: expanded.input.generatedAt,
        dayKey: `2026-07-${17 + index}`,
        objectRefs: ["workstream:taskmap"],
        title: "Additional root evidence",
        summary: "A separate source and day supports the same workstream without changing its leaf tasks.",
        extractionConfidence: 1,
        bodyJoinEligible: true,
      });
      expanded.brain.roots[0].evidenceEventIds.push(eventId);
    }
    expanded.brain.inputDigest = taskMapSemanticInputDigest(expanded.input);
    const second = buildTaskMapProjection(expanded.input, expanded.brain, { arm: "E2" });
    assert.deepStrictEqual(second.tasks.map((task) => task.score.total), leafScores);
    assert.ok(second.roots[0].score > first.roots[0].score);
    assert.ok(
      second.roots[0].scoreBreakdown.rootRecurrence
      > first.roots[0].scoreBreakdown.rootRecurrence,
    );
  });

  it("keeps every projected string behind the privacy firewall", () => {
    const { input, brain } = fixture();
    input.pointers[0].canonicalUrl = "https://example.com/tasks/taskmap-mvp";
    input.pointers[0].sourceVersion = "revision-17";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
    const strings: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === "string") {
        strings.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };
    visit(projection);
    for (const raw of strings) {
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        // Invalid encodings are not expected in an accepted projection.
      }
      assert.ok(!/(?:\/Users\/|\/home\/|\/tmp\/|\/private\/|\/var\/folders\/|\/Volumes\/|[A-Z]:\\Users\\|~\/|file:\/\/|\.codex\/)/i.test(decoded));
      assert.ok(!/\b(?:sk-proj-|dbk_|grn_|ghp_|github_pat_|xox[baprs]-|AIza|AKIA)[A-Za-z0-9_-]{6,}\b/i.test(decoded));
      assert.ok(!/\b(?:token|secret|api[_-]?key|password)\s*[=:]\s*[A-Za-z0-9._-]{6,}\b/i.test(decoded));
      assert.ok(!/\bBearer\s+[A-Za-z0-9._-]{8,}\b/i.test(decoded));
      assert.ok(!/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(decoded));
    }
    assert.strictEqual(projection.privacy.localPathsStored, false);
  });

  it("rejects a semantic run when proposals exist but none survive validation", () => {
    const { input, brain } = fixture();
    input.events = input.events.filter((event) => event.recordKind !== "authoritative_task");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.roots = [{
      ...brain.roots[0],
      title: "",
      evidenceEventIds: ["meeting-context", "session-context"],
      memberObjectRefs: ["workstream:taskmap"],
    }];
    brain.tasks = [];
    brain.edges = [];
    const projection = buildTaskMapProjection(input, brain, { arm: "E1" });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.strictEqual(projection.roots.length, 0);
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "semantic-empty-after-validation"
      && item.reasons.includes("semantic proposals were present but none survived validation")
    )));
  });

  it("rebuilds semantic input from an allowlist and rejects unknown runtime fields", () => {
    const { input, brain } = fixture();
    (input as TaskMapInput & { rawTranscript: string }).rawTranscript = "Bearer topsecretvalue";
    (input.pointers[0] as typeof input.pointers[0] & { accessToken: string }).accessToken = "sk-proj-secretvalue";
    (input.events[0] as typeof input.events[0] & { sourceBody: string }).sourceBody = "neo@example.com full transcript";
    const semantic = taskMapSemanticInput(input);
    const semanticJson = JSON.stringify(semantic);
    assert.ok(!semanticJson.includes("topsecretvalue"));
    assert.ok(!semanticJson.includes("secretvalue"));
    assert.ok(!semanticJson.includes("neo@example.com"));
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E2",
      extraSecret: "/Users/private/options",
    } as any);
    assert.strictEqual(projection.runStatus, "rejected");
    const serialized = JSON.stringify(projection);
    assert.ok(!serialized.includes("topsecretvalue"));
    assert.ok(!serialized.includes("secretvalue"));
    assert.ok(!serialized.includes("/Users/private/options"));
    assert.ok(projection.rejections.some((item) => item.proposalId === "input-schema"));
    assert.ok(projection.rejections.some((item) => item.proposalId === "options-schema"));
  });

  it("rejects Zoom password links and raw biometric values but permits relative window counts", () => {
    const { input, brain } = fixture();
    input.pointers[0].canonicalUrl = "https://zoom.us/j/123456789?pwd=VerySecretMeetingPassword";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const unsafeUrl = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.strictEqual(unsafeUrl.runStatus, "rejected");
    assert.ok(unsafeUrl.rejections.some((item) => (
      item.proposalId === "strategy-task"
      && item.reasons.includes("canonical URL must not contain credential-like query parameters")
    )));
    assert.ok(!JSON.stringify(unsafeUrl).includes("VerySecretMeetingPassword"));

    for (const raw of [
      "HRV reading of 23 ms and resting heart rate 52 bpm",
      "Sleep duration was 5.5 hours",
      "Steps reached 8532",
      "Average HRV was twenty-three milliseconds",
      "Heart-rate low was 48",
    ]) {
      const current = fixture();
      current.brain.roots[0].summary = raw;
      const projection = buildTaskMapProjection(current.input, current.brain, { arm: "E2" });
      assert.ok(projection.rejections.some((item) => (
        item.proposalId === "root-taskmap"
        && item.reasons.includes("privacy leak: raw_biometric")
      )), raw);
      assert.ok(!JSON.stringify(projection).includes(raw));
    }

    const safe = fixture();
    safe.brain.roots[0].title = "2 HRV-below windows";
    safe.brain.roots[0].summary = "HRV stayed below the personal baseline in 3 windows; no raw value is retained.";
    const accepted = buildTaskMapProjection(safe.input, safe.brain, { arm: "E2" });
    assert.strictEqual(accepted.runStatus, "accepted");
    assert.strictEqual(accepted.roots[0].title, "2 HRV-below windows");
  });

  it("enforces the 200-character persisted snippet boundary", () => {
    const { input, brain } = fixture();
    brain.roots[0].summary = "x".repeat(201);
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "root-taskmap"
      && item.reasons.includes("summary exceeds 200 characters")
    )));
  });

  it("rejects future source, brain, and previous artifacts and rejected previous runs", () => {
    const futureSource = fixture();
    futureSource.input.events[0].occurredAt = "2030-01-01T00:00:00.000Z";
    futureSource.input.events[0].observedAt = "2030-01-02T00:00:00.000Z";
    futureSource.brain.inputDigest = taskMapSemanticInputDigest(futureSource.input);
    const sourceProjection = buildTaskMapProjection(futureSource.input, null, { arm: "E0" });
    assert.strictEqual(sourceProjection.runStatus, "rejected");
    assert.ok(sourceProjection.rejections.some((item) => (
      item.proposalId === "task-created"
      && item.reasons.includes("event observedAt must not be after input generatedAt")
    )));

    const futureBrain = fixture();
    futureBrain.brain.generatedAt = "2030-01-01T00:00:00.000Z";
    const brainProjection = buildTaskMapProjection(futureBrain.input, futureBrain.brain, { arm: "E2" });
    assert.strictEqual(brainProjection.runStatus, "rejected");
    assert.ok(brainProjection.rejections.some((item) => (
      item.proposalId === "brain"
      && item.reasons.includes("brain generatedAt must not be after run generatedAt")
    )));

    const priorFixture = fixture();
    const prior = buildTaskMapProjection(priorFixture.input, priorFixture.brain, { arm: "E3" });
    const rejectedPrior = structuredClone(prior);
    rejectedPrior.runStatus = "rejected";
    rejectedPrior.generatedAt = "2030-01-01T00:00:00.000Z";
    const priorProjection = buildTaskMapProjection(priorFixture.input, priorFixture.brain, {
      arm: "E3",
      previousProjection: rejectedPrior,
    });
    assert.strictEqual(priorProjection.runStatus, "rejected");
    assert.ok(priorProjection.rejections.some((item) => (
      item.proposalId === "previous-projection"
      && item.reasons.includes("previous projection must be accepted")
      && item.reasons.includes("previous projection must not be newer than the current run")
    )));
  });

  it("treats a retraction record as a tombstone rather than live work", () => {
    const { input } = fixture();
    input.events.push({
      ...input.events[0],
      id: "task-retraction",
      activity: "task_updated",
      occurredAt: "2026-07-26T18:00:00.000Z",
      observedAt: "2026-07-26T20:00:00.000Z",
      sourceStatus: "unknown",
      title: "Retraction tombstone",
      summary: "The source withdrew the prior task record.",
      retractsEventId: "task-created",
    });
    const projection = buildTaskMapProjection(input, null, { arm: "E0" });
    assert.strictEqual(projection.runStatus, "accepted");
    assert.strictEqual(projection.roots.length, 0);
    assert.strictEqual(projection.tasks.length, 0);
  });

  it("requires explicit connector coverage and a neutral reference before C2", () => {
    const { input, brain } = fixture();
    const targetDays = ["2026-07-23", "2026-07-24", "2026-07-25"];
    const citedDays: Array<{ date: string; backed: boolean; sources: string[] }> = [];
    for (const date of targetDays) {
      const workPointers = date === "2026-07-25"
        ? [["codex-session", "codex_session"], ["strategy-task", "strategy"]] as const
        : [["granola-note", "granola"], ["codex-session", "codex_session"]] as const;
      const sourceEvents: string[] = [];
      for (const [pointerId, sourceKind] of workPointers) {
        const id = `target-${sourceKind}-${date}`;
        input.events.push({
          id,
          pointerId,
          recordKind: "work_context",
          activity: "context_observed",
          occurredAt: `${date}T18:00:00.000Z`,
          observedAt: input.generatedAt,
          dayKey: date,
          objectRefs: ["workstream:taskmap"],
          title: "Target-day work context",
          summary: "Bounded context supports the selected root on this explicitly covered day.",
          extractionConfidence: 0.9,
          bodyJoinEligible: true,
        });
        sourceEvents.push(id);
      }
      brain.roots[0].evidenceEventIds.push(...sourceEvents);
      citedDays.push({
        date,
        backed: true,
        sources: [...workPointers.map(([, sourceKind]) => sourceKind)].sort(),
      });
      if (date !== "2026-07-25") {
        input.events.push({
          ...input.events.find((event) => event.id === "body-context")!,
          id: `target-body-${date}`,
          occurredAt: `${date}T20:00:00.000Z`,
          dayKey: date,
          objectRefs: [`body-day:${date}`],
        });
      }
      for (const [pointerId, sourceKind] of [
        ["granola-note", "granola"],
        ["codex-session", "codex"],
        ["strategy-task", "strategy"],
      ] as const) {
        input.events.push({
          id: `target-coverage-${sourceKind}-${date}`,
          pointerId,
          recordKind: "receipt",
          activity: "receipt_observed",
          occurredAt: `${date}T17:00:00.000Z`,
          observedAt: input.generatedAt,
          dayKey: date,
          objectRefs: [`coverage:${date}`],
          title: "Complete connector coverage",
          summary: "This receipt states that the source-local day was fully available.",
          extractionConfidence: 1,
          corpusCoverage: "complete",
        });
      }
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map product truth",
          targetHits: 3,
          targetN: 3,
          referenceRate: 0,
          referenceN: 0,
          citedDays,
          rtmSuspected: true,
        },
      }],
    });
    assert.strictEqual(projection.runStatus, "accepted");
    assert.strictEqual(projection.roots[0].causalGrade, "C1_CORRELATION");
    assert.strictEqual(projection.roots[0].causalGate?.verdict, "insufficient_power");
    assert.ok(projection.tasks.every((task) => task.score.bodyBonus === 0));
  });

  it("does not use unrelated connector receipts as root corpus coverage", () => {
    const { input, brain } = fixture();
    const bodyTemplate = input.events.find((event) => event.id === "body-context")!;
    input.events = input.events.filter((event) => event.id !== bodyTemplate.id);
    const session = input.events.find((event) => event.id === "session-context")!;
    session.occurredAt = "2026-07-16T20:00:00.000Z";
    session.dayKey = "2026-07-16";
    input.pointers.push(
      {
        id: "gmail-coverage",
        sourceKind: "gmail",
        sourceObjectId: "gmail-corpus",
        sourceRefHash: "5555555555555555",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "calendar-coverage",
        sourceKind: "google_calendar",
        sourceObjectId: "calendar-corpus",
        sourceRefHash: "6666666666666666",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    );
    const targetDates = ["2026-07-20", "2026-07-21", "2026-07-22"];
    const referenceDates = ["2026-07-23", "2026-07-24", "2026-07-25"];
    for (const date of targetDates) {
      for (const [pointerId, suffix] of [
        ["granola-note", "granola"],
        ["codex-session", "codex"],
      ] as const) {
        const id = `scoped-work-${suffix}-${date}`;
        input.events.push({
          id,
          pointerId,
          recordKind: "work_context",
          activity: "context_observed",
          occurredAt: `${date}T18:00:00.000Z`,
          observedAt: input.generatedAt,
          dayKey: date,
          objectRefs: ["workstream:taskmap"],
          title: "Target-day root work",
          summary: "The selected root had bounded work context on this target day.",
          extractionConfidence: 0.9,
          bodyJoinEligible: true,
        });
        brain.roots[0].evidenceEventIds.push(id);
      }
    }
    for (const [date, category] of [
      ...targetDates.map((date) => [date, "below_baseline"] as const),
      ...referenceDates.map((date) => [date, "within_baseline"] as const),
    ]) {
      input.events.push({
        ...bodyTemplate,
        id: `scoped-body-${date}`,
        occurredAt: `${date}T20:00:00.000Z`,
        dayKey: date,
        objectRefs: [`body-day:${date}`],
        bodyCategory: category,
      });
      for (const pointerId of ["gmail-coverage", "calendar-coverage"]) {
        input.events.push({
          id: `unrelated-coverage-${pointerId}-${date}`,
          pointerId,
          recordKind: "receipt",
          activity: "receipt_observed",
          occurredAt: `${date}T17:00:00.000Z`,
          observedAt: input.generatedAt,
          dayKey: date,
          objectRefs: [`coverage:${date}`],
          title: "Complete connector coverage",
          summary: "This unrelated connector reports a complete source-local day.",
          extractionConfidence: 1,
          corpusCoverage: "complete",
        });
      }
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map product truth",
          targetHits: 3,
          targetN: 3,
          referenceRate: 0,
          referenceN: 3,
          citedDays: targetDates.map((date) => ({
            date,
            backed: true,
            sources: ["codex_session", "granola"],
          })),
          rtmSuspected: true,
        },
      }],
    });
    assert.strictEqual(projection.runStatus, "rejected");
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "causal:root-taskmap"
      && item.reasons.includes("causal targetN does not match Task Map input")
    )));
    assert.strictEqual(projection.roots[0].causalGrade, "C0_NO_DATA");
    assert.ok(projection.tasks.every((task) => task.score.bodyBonus === 0));
  });

  it("uses explicit dayKey and body axis for causal joins", () => {
    const { input, brain } = fixture();
    const body = input.events.find((event) => event.id === "body-context")!;
    body.occurredAt = "2026-07-25T06:30:00.000Z";
    body.dayKey = "2026-07-24";
    for (const [pointerId, suffix] of [["granola-note", "granola"], ["codex-session", "codex"]] as const) {
      const workId = `local-day-work-${suffix}`;
      input.events.push({
        id: workId,
        pointerId,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-24T23:30:00.000-07:00",
        observedAt: input.generatedAt,
        dayKey: "2026-07-24",
        objectRefs: ["workstream:taskmap"],
        title: "Source-local work day",
        summary: "The explicit day key prevents UTC and local-day buckets from drifting.",
        extractionConfidence: 0.9,
        bodyJoinEligible: true,
      });
      brain.roots[0].evidenceEventIds.push(workId);
      input.events.push({
        id: `local-day-coverage-${suffix}`,
        pointerId,
        recordKind: "receipt",
        activity: "receipt_observed",
        occurredAt: "2026-07-24T22:00:00.000-07:00",
        observedAt: input.generatedAt,
        dayKey: "2026-07-24",
        objectRefs: ["coverage:2026-07-24"],
        title: "Complete connector coverage",
        summary: "The source-local day had explicit complete availability.",
        extractionConfidence: 1,
        corpusCoverage: "complete",
      });
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, {
      arm: "E4",
      causalInputs: [{
        rootProposalId: "root-taskmap",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        enrichment: {
          theme: "Task Map product truth",
          targetHits: 1,
          targetN: 1,
          referenceRate: 0,
          referenceN: 0,
          citedDays: [{
            date: "2026-07-24",
            backed: true,
            sources: ["codex_session", "granola"],
          }],
          rtmSuspected: true,
        },
      }],
    });
    assert.ok(!projection.rejections.some((item) => (
      item.proposalId === "causal:root-taskmap"
      && item.reasons.includes("causal citedDays and sources do not match Task Map input")
    )));
    assert.strictEqual(projection.roots[0].causalGrade, "C1_CORRELATION");
  });

  it("omits stale body context just beyond the 72-hour freshness boundary", () => {
    const fresh = fixture();
    const freshBody = fresh.input.events.find((event) => event.id === "body-context")!;
    const freshWork = fresh.input.events.find((event) => event.id === "session-context")!;
    freshBody.occurredAt = "2026-07-23T20:01:00.000Z";
    freshBody.dayKey = "2026-07-23";
    freshWork.occurredAt = freshBody.occurredAt;
    freshWork.dayKey = freshBody.dayKey;
    fresh.brain.inputDigest = taskMapSemanticInputDigest(fresh.input);
    const freshProjection = buildTaskMapProjection(fresh.input, fresh.brain, { arm: "E4" });
    assert.ok(freshProjection.tasks.find((task) => task.title === "Ship the Task Map harness")!.bodyContextCount > 0);

    const stale = fixture();
    const staleBody = stale.input.events.find((event) => event.id === "body-context")!;
    const staleWork = stale.input.events.find((event) => event.id === "session-context")!;
    staleBody.occurredAt = "2026-07-23T19:59:00.000Z";
    staleBody.dayKey = "2026-07-23";
    staleWork.occurredAt = staleBody.occurredAt;
    staleWork.dayKey = staleBody.dayKey;
    stale.brain.inputDigest = taskMapSemanticInputDigest(stale.input);
    const staleProjection = buildTaskMapProjection(stale.input, stale.brain, { arm: "E4" });
    assert.strictEqual(
      staleProjection.tasks.find((task) => task.title === "Ship the Task Map harness")!.bodyContextCount,
      0,
    );
  });

  it("rejects directed execution cycles before dependency scoring", () => {
    const { input, brain } = fixture();
    brain.edges = [
      {
        proposalId: "cycle-one",
        fromProposalId: "task-harness",
        toProposalId: "task-output-contract",
        relation: "depends_on",
        evidenceEventIds: ["session-context"],
        confidence: 0.9,
      },
      {
        proposalId: "cycle-two",
        fromProposalId: "task-output-contract",
        toProposalId: "task-harness",
        relation: "blocks",
        evidenceEventIds: ["session-context"],
        confidence: 0.9,
      },
    ];
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.strictEqual(projection.edges.length, 0);
    assert.strictEqual(
      projection.rejections.filter((item) => (
        item.reasons.includes("execution-order edge participates in a directed cycle")
      )).length,
      2,
    );
    assert.ok(projection.tasks.every((task) => task.score.dependencyImpact === 0));
  });

  it("requires semantic supersedes targets to be explicitly superseded discovered tasks", () => {
    const discovered = fixture();
    discovered.brain.tasks.push({
      proposalId: "task-new-output",
      rootProposalId: "root-taskmap",
      title: "Publish the replacement output contract",
      summary: "Create the newer bounded output after the earlier decision is closed.",
      evidenceEventIds: ["session-context"],
      openState: "open",
      confidence: 0.9,
    });
    discovered.brain.edges = [{
      proposalId: "edge-discovered-supersedes",
      fromProposalId: "task-new-output",
      toProposalId: "task-output-contract",
      relation: "supersedes",
      evidenceEventIds: ["session-context"],
      confidence: 0.9,
    }];
    const discoveredProjection = buildTaskMapProjection(
      discovered.input,
      discovered.brain,
      { arm: "E2" },
    );
    assert.ok(discoveredProjection.rejections.some((item) => (
      item.proposalId === "edge-discovered-supersedes"
      && item.reasons.includes("semantic supersedes target must be explicitly superseded")
    )));
    assert.strictEqual(discoveredProjection.edges.length, 0);
    assert.notStrictEqual(
      discoveredProjection.tasks.find((task) => task.title === "Resolve summary versus detail")!.reviewState,
      "superseded",
    );

    const sourceOwned = fixture();
    sourceOwned.brain.edges = [{
      proposalId: "edge-source-supersedes",
      fromProposalId: "task-output-contract",
      toProposalId: "task-harness",
      relation: "supersedes",
      evidenceEventIds: ["session-context"],
      confidence: 0.9,
    }];
    const sourceProjection = buildTaskMapProjection(
      sourceOwned.input,
      sourceOwned.brain,
      { arm: "E2" },
    );
    assert.ok(sourceProjection.rejections.some((item) => (
      item.proposalId === "edge-source-supersedes"
      && item.reasons.includes("semantic supersedes cannot override a source-owned task")
    )));
    assert.strictEqual(sourceProjection.edges.length, 0);
  });

  it("rejects execution relations with root endpoints", () => {
    const { input, brain } = fixture();
    brain.edges = [{
      proposalId: "edge-root-blocks-task",
      fromProposalId: "root-taskmap",
      toProposalId: "task-harness",
      relation: "blocks",
      evidenceEventIds: ["task-created"],
      confidence: 0.9,
    }];
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    assert.ok(projection.rejections.some((item) => (
      item.proposalId === "edge-root-blocks-task"
      && item.reasons.includes("edge relation requires task-to-task endpoints")
    )));
    assert.strictEqual(projection.edges.length, 0);
    assert.strictEqual(
      projection.tasks.find((task) => task.title === "Ship the Task Map harness")!
        .score.dependencyImpact,
      0,
    );
  });

  it("keeps ablation membership canonical when equal-title roots reorder", () => {
    const { input, brain } = fixture();
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    const first = structuredClone(projection);
    const rootA = { ...first.roots[0], title: "Same title", taskIds: [], memberObjectRefs: ["member:a"] };
    const rootB = {
      ...first.roots[0],
      id: "tmr_9999999999999999",
      title: "Same title",
      taskIds: [],
      memberObjectRefs: ["member:b"],
    };
    first.roots = [rootA, rootB];
    first.tasks = [];
    const reversed = structuredClone(first);
    reversed.roots.reverse();
    assert.strictEqual(taskMapMembershipSignature(first), taskMapMembershipSignature(reversed));
  });

  it("reuses a discovered task across punctuation and bounded paraphrase in E3", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E3" });
    const firstTask = first.tasks.find((task) => task.title === "Resolve summary versus detail")!;
    const firstId = firstTask.id;
    brain.tasks[1].title = "Decide the summary detail level";
    brain.tasks[1].summary = "Choose how much detail belongs in the first task output.";
    const next = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: first,
    });
    const nextTask = next.tasks.find((task) => task.title === "Decide the summary detail level")!;
    assert.strictEqual(nextTask.id, firstId);
    assert.strictEqual(nextTask.score.recurrence, firstTask.score.recurrence);
    assert.strictEqual(next.roots[0].scoreBreakdown.rootRecurrence, first.roots[0].scoreBreakdown.rootRecurrence);
  });

  it("reuses a discovered task when only local pointer IDs are renamed", () => {
    const { input, brain } = fixture();
    const first = buildTaskMapProjection(input, brain, { arm: "E3" });
    const firstTask = first.tasks.find((task) => task.title === "Resolve summary versus detail")!;
    const firstId = firstTask.id;
    const pointer = input.pointers.find((item) => item.id === "granola-note")!;
    pointer.id = "granola-renamed";
    for (const event of input.events) {
      if (event.pointerId === "granola-note") event.pointerId = pointer.id;
    }
    brain.tasks[1].title = "Decide the summary detail level";
    brain.tasks[1].summary = "Choose how much detail belongs in the first task output.";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const next = buildTaskMapProjection(input, brain, {
      arm: "E3",
      previousProjection: first,
    });
    assert.strictEqual(next.runStatus, "accepted");
    const nextTask = next.tasks.find((task) => task.title === "Decide the summary detail level")!;
    assert.strictEqual(nextTask.id, firstId);
    assert.strictEqual(nextTask.score.recurrence, firstTask.score.recurrence);
    assert.strictEqual(next.roots[0].scoreBreakdown.rootRecurrence, first.roots[0].scoreBreakdown.rootRecurrence);
  });

  it("automatically returns discovered work to its sole eligible cited origin", () => {
    const { input, brain } = fixture();
    const strategy = input.pointers.find((pointer) => pointer.id === "strategy-task")!;
    strategy.capabilities.push("comment_or_reply");
    brain.tasks[1].evidenceEventIds.push("task-created");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const projection = buildTaskMapProjection(input, brain, { arm: "E2" });
    const task = projection.tasks.find((item) => item.title === "Resolve summary versus detail")!;
    assert.deepStrictEqual(task.returnRoute, {
      state: "source_return",
      pointerId: "strategy-task",
      requiresApproval: true,
    });
  });

  it("validates return destinations and keeps all routes approval-gated", () => {
    const { input, brain } = fixture();
    input.pointers[0].capabilities.push("comment_or_reply");
    brain.inputDigest = taskMapSemanticInputDigest(input);
    brain.tasks[1].evidenceEventIds.push("task-created");
    brain.tasks[1].proposedReturnPointerId = "strategy-task";
    const accepted = buildTaskMapProjection(input, brain, { arm: "E2" });
    const discovered = accepted.tasks.find((task) => task.title === "Resolve summary versus detail")!;
    assert.deepStrictEqual(discovered.returnRoute, {
      state: "source_return",
      pointerId: "strategy-task",
      requiresApproval: true,
    });

    const invalid = fixture();
    invalid.brain.tasks[1].proposedReturnPointerId = "granola-note";
    const rejected = buildTaskMapProjection(invalid.input, invalid.brain, { arm: "E2" });
    assert.ok(rejected.rejections.some((item) => (
      item.proposalId === "task-output-contract"
      && item.reasons.includes("proposed return pointer is reference-only")
    )));
  });

  it("rejects impossible routing capabilities and orders why-now by weighted contribution", () => {
    const invalid = fixture();
    invalid.input.pointers[1].capabilities.push("publish_or_send", "update_status");
    invalid.brain.inputDigest = taskMapSemanticInputDigest(invalid.input);
    const rejected = buildTaskMapProjection(invalid.input, invalid.brain, { arm: "E2" });
    assert.strictEqual(rejected.runStatus, "rejected");
    assert.ok(rejected.rejections.some((item) => (
      item.proposalId === "granola-note"
      && item.reasons.includes("source capability conflicts with sync mode")
      && item.reasons.includes("authority none cannot declare write capabilities")
    )));

    const weighted = fixture();
    const source = weighted.input.events.find((event) => event.id === "task-created")!;
    source.priority = 0;
    source.deadlineAt = "2026-08-05T20:00:00.000Z";
    weighted.brain.inputDigest = taskMapSemanticInputDigest(weighted.input);
    const projection = buildTaskMapProjection(weighted.input, weighted.brain, { arm: "E2" });
    assert.strictEqual(
      projection.tasks.find((task) => task.title === "Ship the Task Map harness")!.whyNow[0],
      "deadline pressure",
    );
  });
});
