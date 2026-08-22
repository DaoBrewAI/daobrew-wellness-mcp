import assert from "node:assert";
import { describe, it } from "node:test";

import {
  TASKMAP_ALGORITHM_POLICY_DIGEST,
} from "../src/engine/taskmap/harness.js";
import {
  buildTaskMapTaskRankingPublication,
  validateTaskMapTaskRankingPublication,
} from "../src/engine/taskmap/task-ranking-publication.js";
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
import {
  TASKMAP_OWNER_REFRESH_SOURCES,
  type TaskMapOwnerRefreshSource,
} from "../src/engine/taskmap/owner-refresh-coordinator.js";

const digest = (label: string): string => taskMapContractDigest(`ranking:${label}`);
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
      occurredAt: "2026-08-02T12:00:00.000Z",
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
    total: 0.999,
  });
  const beta = task("beta", { ...ZERO_SCORE });
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: `tmrun_${digest("run").slice(0, 16)}`,
    generatedAt: "2026-08-02T12:00:00.000Z",
    inputDigest: digest("input"),
    brain: null,
    sources: [{
      id: "session-alpha",
      sourceKind: "codex_session",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task"],
    }, {
      id: "session-beta",
      sourceKind: "codex_session",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task"],
    }],
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

function statuses(agentDisposition: "fresh" | "retained_last_good" = "fresh") {
  return [
    {
      source: "agent_session" as const,
      disposition: agentDisposition,
      sliceDigest: digest("agent"),
    },
    { source: "meeting_notes" as const, disposition: "unavailable" as const, sliceDigest: null },
    { source: "calendar" as const, disposition: "unavailable" as const, sliceDigest: null },
    { source: "body" as const, disposition: "unavailable" as const, sliceDigest: null },
  ];
}

describe("task-level ranking publication", () => {
  it("admits only an exact proof-bound manual owner receipt without changing scoring", () => {
    const source = projection();
    const promotionDigest = digest("owner-promotion");
    const pointerId = `tmcandidatepromotion_${promotionDigest}`;
    const eventId = `tmcandidatepromotionevent_${promotionDigest}`;
    const promoted = source.tasks[0]!;
    source.tasks = [{
      ...promoted,
      reviewState: "accepted",
      authority: "user",
      taskHomePointerId: pointerId,
      originPointerIds: [pointerId],
      returnRoute: {
        state: "user_destination_required",
        requiresApproval: true,
      },
      citations: [{
        ...promoted.citations[0]!,
        eventId,
        pointerId,
        sourceKind: "manual",
        sourceRefHash: promotionDigest,
      }],
      discoveredBy: ["manual"],
    }];
    source.roots = source.roots.map((root) => ({
      ...root,
      taskIds: [promoted.id],
    }));
    source.sources = [{
      id: pointerId,
      sourceKind: "manual",
      sourceVersion: promotionDigest,
      authority: "user",
      syncMode: "personal_fork",
      capabilities: ["read_task"],
    }];
    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses("retained_last_good"),
    });
    assert.equal(ranking.rankedAcceptedOpen.length, 1);
    assert.equal(
      ranking.rankedAcceptedOpen[0]!.scoreBasisPoints,
      2_500,
    );

    for (const mutate of [
      (draft: TaskMapProjectionV1) => { draft.tasks[0]!.authority = "none"; },
      (draft: TaskMapProjectionV1) => { draft.tasks[0]!.taskHomePointerId = "other"; },
      (draft: TaskMapProjectionV1) => { draft.tasks[0]!.citations[0]!.eventId = `event_${promotionDigest}`; },
      (draft: TaskMapProjectionV1) => { draft.tasks[0]!.citations[0]!.sourceRefHash = digest("other"); },
      (draft: TaskMapProjectionV1) => { draft.sources[0]!.sourceVersion = digest("other"); },
      (draft: TaskMapProjectionV1) => { draft.sources[0]!.authority = "source_system"; },
      (draft: TaskMapProjectionV1) => { draft.sources[0]!.syncMode = "reference_only"; },
      (draft: TaskMapProjectionV1) => { draft.sources[0]!.capabilities = ["read_task", "read_context"]; },
      (draft: TaskMapProjectionV1) => { draft.sources[0]!.canonicalUrl = "https://example.invalid"; },
    ]) {
      const forged = structuredClone(source);
      mutate(forged);
      assert.throws(() => buildTaskMapTaskRankingPublication({
        projection: forged,
        ownerScopeDigest: OWNER,
        sourceStatuses: statuses("retained_last_good"),
      }), /citation from unavailable source family|manual receipt proof/);
    }
  });

  it("publishes an exact no-imputation matrix for every current connector subset", () => {
    const workFamilyByTask = new Map([
      [taskId("alpha"), "agent_session" as const],
      [taskId("beta"), "meeting_notes" as const],
    ]);
    const sourceKindByWorkFamily = {
      agent_session: "codex_session" as const,
      meeting_notes: "gemini_meet" as const,
    };

    for (let mask = 0; mask < (1 << TASKMAP_OWNER_REFRESH_SOURCES.length); mask += 1) {
      const current = new Set<TaskMapOwnerRefreshSource>(
        TASKMAP_OWNER_REFRESH_SOURCES.filter((_, index) =>
          (mask & (1 << index)) !== 0
        ),
      );
      const source = projection();
      source.tasks = source.tasks.filter((candidate) => {
        const family = workFamilyByTask.get(candidate.id);
        return family !== undefined && current.has(family);
      }).map((candidate) => {
        const family = workFamilyByTask.get(candidate.id)!;
        const sourceKind = sourceKindByWorkFamily[family];
        return {
          ...candidate,
          citations: candidate.citations.map((citation) => ({
            ...citation,
            sourceKind,
          })),
          discoveredBy: [family],
        };
      });
      source.roots = source.tasks.length === 0
        ? []
        : source.roots.map((root) => ({
            ...root,
            taskIds: source.tasks.map((candidate) => candidate.id),
          }));
      const sourceStatuses = TASKMAP_OWNER_REFRESH_SOURCES.map((family) => ({
        source: family,
        disposition: current.has(family)
          ? "fresh" as const
          : "unavailable" as const,
        sliceDigest: current.has(family) ? digest(`slice:${family}`) : null,
      }));

      const ranking = buildTaskMapTaskRankingPublication({
        projection: source,
        ownerScopeDigest: OWNER,
        sourceStatuses,
      });

      assert.deepStrictEqual(
        ranking.rankedAcceptedOpen.map((row) => row.taskId).sort(),
        source.tasks.map((candidate) => candidate.id).sort(),
      );
      assert.ok(ranking.rankedAcceptedOpen.every((row) =>
        row.citations.every((citation) => {
          const family = citation.sourceKind === "codex_session"
            ? "agent_session"
            : "meeting_notes";
          return current.has(family);
        })
      ));
      assert.deepStrictEqual(
        ranking.coverage.map((row) => ({
          source: row.source,
          state: row.state,
          sliceDigest: row.sliceDigest,
        })),
        sourceStatuses.map((row) => ({
          source: row.source,
          state: row.disposition === "fresh" ? "current" : "unavailable",
          sliceDigest: row.sliceDigest,
        })),
      );
      assert.ok(ranking.coverage.every((row) =>
        row.state === "current"
          ? row.sliceDigest !== null
          : row.sliceDigest === null
      ));
      if (!current.has("agent_session") && !current.has("meeting_notes")) {
        assert.deepStrictEqual(ranking.rankedAcceptedOpen, []);
      }
    }
  });

  it("binds every accepted-open task to the exact scorer, projection, policy, citations, and coverage", () => {
    const source = projection();
    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    });
    assert.deepStrictEqual(ranking.rankedAcceptedOpen.map((row) => row.taskId), [
      taskId("alpha"),
      taskId("beta"),
    ]);
    assert.strictEqual(ranking.rankedAcceptedOpen[0]!.scoreBasisPoints, 2_500);
    assert.strictEqual(ranking.rankedAcceptedOpen[1]!.scoreBasisPoints, 0);
    assert.strictEqual(ranking.rankedAcceptedOpen[1]!.reasonCodes.length, 0);
    assert.strictEqual(ranking.policy.version, TASKMAP_WORK_CONTROL_POLICY_VERSION);
    assert.strictEqual(ranking.policy.digest, TASKMAP_WORK_CONTROL_POLICY_DIGEST);
    assert.deepStrictEqual(validateTaskMapTaskRankingPublication(ranking, source, OWNER), ranking);
  });

  it("treats missing evidence as zero without renormalizing and ignores legacy total", () => {
    const source = projection();
    const alpha = source.tasks[0]! as unknown as Record<string, unknown>;
    const score = alpha.score as Record<string, unknown>;
    delete score.evidenceStrength;
    score.total = 1;
    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    });
    assert.strictEqual(ranking.rankedAcceptedOpen[0]!.scoreBasisPoints, 2_500);
    assert.strictEqual(
      ranking.rankedAcceptedOpen[0]!.factorBasisPoints.evidenceStrength,
      0,
    );
  });

  it("does not confuse a real demographic citation identifier with a demo marker", () => {
    const source = projection();
    source.tasks[0]!.citations[0]!.eventId = "demographic-owner-event";
    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    });
    assert.strictEqual(
      ranking.rankedAcceptedOpen[0]!.citations[0]!.eventId,
      "demographic-owner-event",
    );
  });

  it("matches Swift case-insensitive synthetic-marker containment without rejecting legitimate identifiers", () => {
    for (const legitimate of [
      "event-demo-owner",
      "synthetic-data-review",
      "showcase-planning",
      "fixture-repair",
      "event-demonstration-2026-08-02",
    ]) {
      const source = projection();
      source.tasks[0]!.citations[0]!.eventId = legitimate;
      assert.doesNotThrow(() => buildTaskMapTaskRankingPublication({
        projection: source,
        ownerScopeDigest: OWNER,
        sourceStatuses: statuses(),
      }));
    }
    for (const forbidden of [
      "wednesday-demo-leaf",
      "REVIEWER-ALPHA-UNVERSIONED",
      "taskrankingsnapshot.demo",
      "showcase-source",
      "DEMO_USER_ID",
    ]) {
      const source = projection();
      source.tasks[0]!.citations[0]!.eventId = `event-${forbidden}`;
      assert.throws(() => buildTaskMapTaskRankingPublication({
        projection: source,
        ownerScopeDigest: OWNER,
        sourceStatuses: statuses(),
      }), /demo marker/);
    }
  });

  it("accepts a legitimate real citation observed on the former fixture date", () => {
    const source = projection();
    source.tasks[0]!.citations[0]!.occurredAt =
      "2025-02-26T19:30:00.000Z";
    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    });
    assert.strictEqual(
      ranking.rankedAcceptedOpen[0]!.citations[0]!.occurredAt,
      "2025-02-26T19:30:00.000Z",
    );
  });

  it("fails closed on retained/stale citations, unknown keys, and row mismatch", () => {
    const source = projection();
    assert.throws(() => buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses("retained_last_good"),
    }), /unavailable source family/);

    const ranking = buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    });
    assert.throws(() => validateTaskMapTaskRankingPublication(
      { ...ranking, extra: true },
      source,
      OWNER,
    ), /document keys/);
    const tampered = structuredClone(ranking);
    tampered.rankedAcceptedOpen[0]!.scoreBasisPoints += 1;
    assert.throws(() => validateTaskMapTaskRankingPublication(
      tampered,
      source,
      OWNER,
    ), /canonical projection\/rank mismatch/);
  });

  it("rejects an accepted-open ranked task without a projection citation", () => {
    const source = projection();
    source.tasks[0]!.citations = [];
    assert.throws(() => buildTaskMapTaskRankingPublication({
      projection: source,
      ownerScopeDigest: OWNER,
      sourceStatuses: statuses(),
    }), /ranked task citation/);
  });
});
