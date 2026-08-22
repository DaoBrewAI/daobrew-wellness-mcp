import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  buildTaskMapAgentSessionProducerSnapshot,
  type TaskMapAgentSessionObservationV1,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import {
  type TaskMapAgentSessionExtractionMentionV1,
} from "../src/engine/taskmap/agent-session-refresh-llm-replay.js";
import {
  taskMapMeetingObligationGate,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  normalizeMentionText,
} from "../src/engine/taskmap/mention-normalization.js";
import {
  taskMapProjectionArtifactValidationReasons,
} from "../src/engine/taskmap/harness.js";
import {
  buildAgentSessionOnlyProjection,
  reconcileTaskMapProjectionMembership,
} from "../src/engine/taskmap/native-refresh-service.js";
import {
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  buildAgentSessionExtractionFixture,
} from "./taskmap-agent-session-extraction-fixture.js";
import { testOwnerScopeDigest } from "./support/confirmed-owner.js";

const GENERATED_AT = "2026-08-12T19:20:17.000Z";

function observation(
  root: string,
  repository: string,
  directive: string,
): TaskMapAgentSessionObservationV1 {
  return {
    provider: "codex",
    rawJsonl: [
      {
        timestamp: "2026-08-12T19:00:00.000Z",
        type: "session_meta",
        payload: { id: root },
      },
      {
        timestamp: "2026-08-12T19:00:01.000Z",
        type: "turn_context",
        payload: { repository },
      },
      {
        timestamp: "2026-08-12T19:00:02.000Z",
        type: "response_item",
        payload: {
          id: `turn-${root}`,
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: directive }],
        },
      },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n",
  };
}

function mention(input: {
  title: string;
  speechActClass: "request" | "other";
  confidence: number;
}): TaskMapAgentSessionExtractionMentionV1 {
  const actor = input.speechActClass === "request" ? "self" : "unknown";
  const gate = taskMapMeetingObligationGate(input.speechActClass, actor);
  return {
    text: input.title,
    title: input.title,
    speechActClass: input.speechActClass,
    speechActActor: actor,
    confidence: input.confidence,
    mentionIdentityDigest: taskMapContractDigest({
      fixture: "roadmap-abstraction-level",
      title: input.title,
    }),
    proposalDisposition: gate.proposalDisposition,
    promotionEligible: gate.promotionEligible,
  };
}

type RoadmapMentionInput = Parameters<typeof mention>[0];

function roadmapProjection(
  includeSecondRoot = true,
  roadmapMentions?: readonly RoadmapMentionInput[],
  options: {
    previousProjection?: Parameters<
      typeof buildAgentSessionOnlyProjection
    >[3];
    degradeRoadmapCluster?: boolean;
    duplicateRoadmapWorkstream?: boolean;
  } = {},
) {
  const ownerScopeDigest = testOwnerScopeDigest("roadmap-abstraction-level");
  const observations = [
    observation(
      "roadmap-root",
      "/repo/task-roadmap",
      "Improve the Task Roadmap feature",
    ),
    ...(options.duplicateRoadmapWorkstream === true
      ? [observation(
        "roadmap-refresh-root",
        "/repo/task-roadmap",
        "Investigate artifact validation failure",
      )]
      : []),
    ...(includeSecondRoot
      ? [observation(
        "release-root",
        "/repo/release",
        "Prepare the release brief",
      )]
      : []),
  ];
  const admission = buildTaskMapAgentSessionSemanticAdmission(
    buildTaskMapAgentSessionProducerSnapshot({
      ownerScopeDigest,
      producedAt: GENERATED_AT,
      observations,
    }),
  );
  assert.equal(
    admission.clusters.length,
    (includeSecondRoot ? 2 : 1)
      + (options.duplicateRoadmapWorkstream === true ? 1 : 0),
  );

  const fixture = buildAgentSessionExtractionFixture(
    admission,
    GENERATED_AT,
  );
  const roadmapCluster = admission.clusters.find((cluster) =>
    cluster.userDirectiveSummary.includes("Task Roadmap")
  );
  assert.ok(roadmapCluster);
  const clusters = fixture.clusters.map((cluster) => {
    if (cluster.clusterIdentityDigest !== roadmapCluster.clusterIdentityDigest) {
      return cluster;
    }
    if (options.degradeRoadmapCluster === true) {
      return {
        ...cluster,
        status: "degraded" as const,
        degradationCode: "no_provider" as const,
        envelopeDigest: null,
        envelopeModel: null,
        envelopeTransport: null,
        mentions: [],
      };
    }
    return {
      ...cluster,
      mentions: (roadmapMentions ?? [
          mention({
            title: "OpenAPI snapshot check passed",
            speechActClass: "other",
            confidence: 0.99,
          }),
          mention({
            title: "Full pytest results passed",
            speechActClass: "other",
            confidence: 0.98,
          }),
          mention({
            title: "Changes span 98 files across 24 commits",
            speechActClass: "other",
            confidence: 0.97,
          }),
          mention({
            title: "No planted hooks accidentally committed",
            speechActClass: "other",
            confidence: 0.96,
          }),
          mention({
            title: "Fix the code review findings F12 and F13",
            speechActClass: "request",
            confidence: 0.9,
          }),
          mention({
            title: "Fix code review findings F12 and F13",
            speechActClass: "request",
            confidence: 0.94,
          }),
          mention({
            title: "Rename Task Map to Task Roadmap in current mission",
            speechActClass: "request",
            confidence: 0.92,
          }),
          mention({
            title: "Design the onboarding flow",
            speechActClass: "request",
            confidence: 0.89,
          }),
          mention({
            title: "Document migration steps",
            speechActClass: "request",
            confidence: 0.88,
          }),
          mention({
            title: "Prepare release notes",
            speechActClass: "request",
            confidence: 0.87,
          }),
          mention({
            title: "Audit accessibility labels",
            speechActClass: "request",
            confidence: 0.86,
          }),
          mention({
            title: "Schedule the founder walkthrough",
            speechActClass: "request",
            confidence: 0.85,
          }),
      ]).map((entry) => "mentionIdentityDigest" in entry
        ? entry
        : mention(entry)),
    };
  });
  const { reportDigest: _oldReportDigest, ...reportBase } = {
    ...fixture,
    clusters,
  };
  const extraction = {
    ...reportBase,
    reportDigest: taskMapContractDigest(reportBase),
  };

  const projection = buildAgentSessionOnlyProjection(
    admission,
    extraction,
    GENERATED_AT,
    options.previousProjection,
    new Set(clusters.filter((cluster) =>
      cluster.status === "degraded"
    ).map((cluster) => cluster.workstreamIdentityDigest)),
  );
  assert.deepEqual(
    taskMapProjectionArtifactValidationReasons(projection),
    [],
    "every roadmap task mutation fixture must remain artifact-valid",
  );
  return projection;
}

type RoadmapProjection = ReturnType<typeof roadmapProjection>;
type RoadmapRoot = RoadmapProjection["roots"][number] & {
  visibleTaskIds?: string[];
};

function roadmapProjectionWithNChildren(count: number): RoadmapProjection {
  return roadmapProjection(false, Array.from({ length: count }, (_, index) => ({
    title: `Implement roadmap child ${String(index + 1).padStart(2, "0")}`,
    speechActClass: "request" as const,
    confidence: 0.99 - (index * 0.01),
  })));
}

function onlyRoot(projection: RoadmapProjection): RoadmapRoot {
  assert.equal(projection.roots.length, 1);
  return projection.roots[0] as RoadmapRoot;
}

function highestCitationConfidence(
  task: RoadmapProjection["tasks"][number],
): number {
  return task.citations.reduce(
    (highest, citation) => Math.max(highest, citation.extractionConfidence),
    -1,
  );
}

function anchorTaskId(
  projection: RoadmapProjection,
  root: RoadmapRoot,
): string {
  const synthesizedPrefix = "Workstream:";
  const rootSubject = normalizeMentionText(
    root.title.startsWith(synthesizedPrefix)
      ? root.title.slice(synthesizedPrefix.length)
      : root.title,
  );
  const rootTasks = projection.tasks.filter((task) => task.rootId === root.id);
  const structuralMatches = rootTasks.filter((task) =>
    normalizeMentionText(task.title) === rootSubject
  );
  const anchor = [...(
    structuralMatches.length > 0 ? structuralMatches : rootTasks
  )].sort((left, right) =>
    highestCitationConfidence(right) - highestCitationConfidence(left)
    || left.id.localeCompare(right.id)
  )[0];
  assert.ok(anchor);
  return anchor.id;
}

function roadmapProjectionWithLegacyPredecessor() {
  const previousProjection = structuredClone(roadmapProjection(false, [
    {
      title: "OpenAPI snapshot check passed",
      speechActClass: "request",
      confidence: 0.99,
    },
    {
      title: "Full pytest results passed",
      speechActClass: "request",
      confidence: 0.98,
    },
    {
      title: "Changes span 98 files across 24 commits",
      speechActClass: "request",
      confidence: 0.97,
    },
    {
      title: "All quality gates passed, awaiting merge decision",
      speechActClass: "request",
      confidence: 0.96,
    },
    {
      title: "Extract founder-stress pattern from reports",
      speechActClass: "request",
      confidence: 0.95,
    },
    {
      title: "Founder-approved legacy task",
      speechActClass: "request",
      confidence: 0.94,
    },
    {
      title: "Lifecycle review already underway",
      speechActClass: "request",
      confidence: 0.93,
    },
  ]));
  const legacyRoot = previousProjection.roots[0];
  assert.ok(legacyRoot);
  legacyRoot.title = "All quality gates passed, awaiting merge decision";
  const acceptedTask = previousProjection.tasks.find((task) =>
    task.title === "All quality gates passed, awaiting merge decision"
  );
  assert.ok(acceptedTask);
  assert.ok(acceptedTask.whyNow.length > 0);
  acceptedTask.reviewState = "accepted";
  const narratedBareProposal = previousProjection.tasks.find((task) =>
    task.title === "OpenAPI snapshot check passed"
  );
  assert.ok(narratedBareProposal);
  assert.ok(narratedBareProposal.whyNow.length > 0);

  return roadmapProjection(true, undefined, {
    previousProjection,
    degradeRoadmapCluster: true,
    // Production can retain one degraded cluster while extracting a newer
    // cluster for the same repository/workstream in the same report.
    duplicateRoadmapWorkstream: true,
  });
}

function roadmapProjectionWithStatusOnlyPredecessor() {
  const previousProjection = structuredClone(roadmapProjection(false, [
    {
      title: "OpenAPI snapshot check passed",
      speechActClass: "request",
      confidence: 0.9,
    },
    {
      title: "All quality gates passed, awaiting merge decision",
      speechActClass: "request",
      confidence: 0.99,
    },
  ]));
  previousProjection.roots[0]!.title =
    "Workstream: OpenAPI snapshot check passed";
  return roadmapProjection(true, undefined, {
    previousProjection,
    degradeRoadmapCluster: true,
  });
}

describe("Task Map agent-session roadmap abstraction level", () => {
  it("bounds visible children and rolls the remainder up", () => {
    const projection = roadmapProjectionWithNChildren(8);
    const root = projection.roots.find((candidate) =>
      candidate.taskIds.length === 8
    ) as RoadmapRoot | undefined;
    assert.ok(root, "membership must still hold every admitted task");
    assert.equal(
      root.visibleTaskIds?.length,
      5,
      "bound is 5 when >= 7 children",
    );
    assert.equal(root.taskIds.length, 8, "nothing disappears from membership");
    for (const id of root.visibleTaskIds ?? []) {
      assert.ok(root.taskIds.includes(id), "visible must be a subset of members");
    }
    assert.ok(
      root.visibleTaskIds?.includes(anchorTaskId(projection, root)),
      "the structural anchor must always be visible",
    );
  });

  it("omits the marker at and below the collapse threshold", () => {
    for (const count of [1, 5, 6]) {
      const root = onlyRoot(roadmapProjectionWithNChildren(count));
      assert.equal(
        root.visibleTaskIds,
        undefined,
        `n=${count} must show all`,
      );
    }
    const seven = onlyRoot(roadmapProjectionWithNChildren(7));
    assert.equal(
      seven.visibleTaskIds?.length,
      5,
      "n=7 collapses to 5 (+2 more)",
    );
  });

  it("orders visible children deterministically and title-agnostically", () => {
    const first = roadmapProjectionWithNChildren(8);
    const second = roadmapProjectionWithNChildren(8);
    assert.equal(
      onlyRoot(first).visibleTaskIds?.length,
      5,
      "determinism is meaningful only for an emitted bounded set",
    );
    assert.deepEqual(
      onlyRoot(first).visibleTaskIds,
      onlyRoot(second).visibleTaskIds,
      "identical input must produce byte-identical visible sets",
    );
  });

  it("ranks lifecycle engagement ahead of a higher-scoring bare proposal", () => {
    const projection = structuredClone(roadmapProjectionWithNChildren(8));
    const root = onlyRoot(projection);
    const anchorID = anchorTaskId(projection, root);
    const rankedCandidates = projection.tasks.filter((task) =>
      task.id !== anchorID
    );
    assert.equal(rankedCandidates.length, 7);
    for (const [index, task] of rankedCandidates.entries()) {
      task.reviewState = "proposed";
      task.whyNow = [];
      task.taskHomePointerId = undefined;
      task.sourceStatus = undefined;
      task.returnRoute = {
        state: "user_destination_required",
        requiresApproval: true,
      };
      task.score.total = 0.9 - (index * 0.1);
    }
    const accepted = rankedCandidates.at(-1)!;
    accepted.reviewState = "accepted";
    accepted.score.total = 0.01;
    const higherScoringBareProposal = rankedCandidates[3]!;
    assert.ok(higherScoringBareProposal.score.total > accepted.score.total);

    const reconciled = reconcileTaskMapProjectionMembership(projection);
    const visibleTaskIds = onlyRoot(reconciled).visibleTaskIds ?? [];
    assert.ok(visibleTaskIds.includes(accepted.id));
    assert.ok(!visibleTaskIds.includes(higherScoringBareProposal.id));
  });

  it("validates the bounded visibility marker invariants", () => {
    const projection = roadmapProjectionWithNChildren(8);
    assert.deepEqual(
      taskMapProjectionArtifactValidationReasons(projection),
      [],
      "every task-mutating projection must remain contract-valid",
    );
    const root = onlyRoot(projection);
    const malformedMarkers = [
      { value: [] as string[], reason: "previous root visibleTaskIds must not be empty" },
      {
        value: [root.taskIds[0]!, root.taskIds[0]!],
        reason: "previous root visibleTaskIds must be unique",
      },
      {
        value: [...root.taskIds.slice(0, 5), "tmc_ffffffffffffffff"],
        reason: "previous root visibleTaskIds must reference root taskIds",
      },
      {
        value: root.taskIds.slice(0, 6),
        reason: "previous root visibleTaskIds must contain at most 5 tasks",
      },
    ];
    for (const malformed of malformedMarkers) {
      const copy = structuredClone(projection);
      (copy.roots[0] as RoadmapRoot).visibleTaskIds = malformed.value;
      assert.ok(
        taskMapProjectionArtifactValidationReasons(copy).includes(
          malformed.reason,
        ),
        malformed.reason,
      );
    }
  });

  it("repairs stale membership on every root in a predecessor composition", () => {
    const composed = structuredClone(roadmapProjectionWithLegacyPredecessor());
    const freshTask = composed.tasks.find((task) =>
      task.title === "Prepare the release brief"
    );
    assert.ok(freshTask);
    const freshRoot = composed.roots.find((root) => root.id === freshTask.rootId);
    assert.ok(freshRoot);
    freshRoot.taskIds = [];
    assert.deepEqual(
      taskMapProjectionArtifactValidationReasons(composed),
      ["previous task must appear exactly once in its root taskIds"],
      "the production-shaped fixture must reproduce stale fresh-root membership",
    );

    const reconciled = reconcileTaskMapProjectionMembership(composed);

    assert.deepEqual(
      taskMapProjectionArtifactValidationReasons(reconciled),
      [],
      "a projection composed against a real predecessor must remain publishable",
    );
  });

  it("normalizes predecessor-derived roots and tasks", () => {
    const projection = roadmapProjectionWithLegacyPredecessor();

    assert.deepEqual(
      taskMapProjectionArtifactValidationReasons(projection),
      [],
      "a projection composed against a real predecessor must remain publishable",
    );
    assert.deepEqual(
      projection.roots.map((root) => ({
        rootId: root.id,
        taskIds: root.taskIds,
      })),
      projection.roots.map((root) => ({
        rootId: root.id,
        taskIds: projection.tasks.filter((task) => task.rootId === root.id)
          .map((task) => task.id),
      })),
      "every composed root must derive membership from the final merged tasks",
    );

    const rootTitleCollisions = projection.roots.flatMap((root) => {
      const childTitles = projection.tasks
        .filter((task) => task.rootId === root.id)
        .map((task) => normalizeMentionText(task.title));
      return childTitles.includes(normalizeMentionText(root.title))
        ? [root.title]
        : [];
    });

    const titles = projection.tasks.map((task) => task.title);
    const survivingExhaust = [
      "OpenAPI snapshot check passed",
      "Full pytest results passed",
      "Changes span 98 files across 24 commits",
    ].filter((title) => titles.includes(title));
    assert.ok(titles.includes("Extract founder-stress pattern from reports"));
    assert.ok(titles.includes("Founder-approved legacy task"));
    assert.ok(titles.includes("Lifecycle review already underway"));
    assert.ok(titles.includes("All quality gates passed, awaiting merge decision"));
    assert.deepEqual(
      { rootTitleCollisions, survivingExhaust },
      { rootTitleCollisions: [], survivingExhaust: [] },
      "legacy roots and verification exhaust must be normalized together",
    );
  });

  it("does not treat engine-generated whyNow as proposal engagement", () => {
    const projection = roadmapProjectionWithLegacyPredecessor();
    assert.deepEqual(taskMapProjectionArtifactValidationReasons(projection), []);
    const titles = new Set(projection.tasks.map((task) => task.title));

    assert.equal(
      titles.has("OpenAPI snapshot check passed"),
      false,
      "a bare status proposal with ranking narration must be filtered",
    );
    assert.equal(
      titles.has("All quality gates passed, awaiting merge decision"),
      true,
      "an accepted status row with ranking narration must be retained",
    );
  });

  it("keeps one structural anchor when every predecessor child is status-shaped", () => {
    const projection = roadmapProjectionWithStatusOnlyPredecessor();
    assert.deepEqual(taskMapProjectionArtifactValidationReasons(projection), []);
    const retainedTasks = projection.tasks.filter((task) =>
      task.title === "OpenAPI snapshot check passed"
      || task.title === "All quality gates passed, awaiting merge decision"
    );
    assert.deepEqual(
      retainedTasks.map((task) => task.title),
      ["OpenAPI snapshot check passed"],
      "the task matching the synthesized root subject must be the sole anchor",
    );
    const retainedRoot = projection.roots.find((root) =>
      retainedTasks.some((task) => task.rootId === root.id)
    );
    assert.ok(retainedRoot);
    assert.deepEqual(retainedRoot.taskIds, retainedTasks.map((task) => task.id));
    assert.equal(
      normalizeMentionText(retainedRoot.title),
      normalizeMentionText(`Workstream: ${retainedTasks[0]!.title}`),
    );
  });

  it("uses synthesized root summaries rather than copying a child", () => {
    const projection = roadmapProjection();
    for (const root of projection.roots) {
      const childTitles = projection.tasks
        .filter((task) => task.rootId === root.id)
        .map((task) => normalizeMentionText(task.title));
      assert.ok(
        !childTitles.includes(normalizeMentionText(root.title)),
        `root title must be a summary, not a copy of child: ${root.title}`,
      );
    }
  });

  it("does not turn status narration into roadmap tasks", () => {
    const projection = roadmapProjection(false, [
      {
        title: "OpenAPI snapshot check passed",
        speechActClass: "other",
        confidence: 0.99,
      },
      {
        title: "Implement roadmap filtering",
        speechActClass: "request",
        confidence: 0.9,
      },
    ]);
    assert.deepEqual(
      projection.tasks.map((task) => task.title),
      ["Implement roadmap filtering"],
      "the one admitted mention must be the one task",
    );
    assert.equal(
      projection.tasks[0]?.citations.length,
      1,
      "the admitted task keeps its own evidence",
    );
    assert.equal(
      projection.roots[0]?.citations.length,
      3,
      "the filtered status mention remains in root evidence",
    );
  });

  it("collapses near-duplicate tasks inside a workstream", () => {
    const projection = roadmapProjection();
    const titles = projection.tasks.map((task) => task.title);
    assert.equal(titles.filter((title) => /F13/u.test(title)).length, 1);
    assert.ok(
      titles.includes(
        "Fix the code review findings F12 and F13",
      ),
      "the visible survivor must subsume the folded title",
    );
    assert.equal(
      projection.tasks.find((task) => /F13/u.test(task.title))
        ?.citations.length,
      2,
      "the visible subsuming row must retain both mentions' evidence",
    );
  });

  it("keeps titles with one load-bearing token difference distinct", () => {
    const distinctTitles = [
      "Fix login timeout on iOS",
      "Fix login timeout on Android",
      "Write tests for auth module",
      "Write tests for billing module",
      "Deploy service A to staging",
      "Deploy service B to staging",
      "Update API docs for v2",
      "Update API docs for v3",
      "Migrate DB to Postgres 15",
      "Migrate DB to Postgres 16",
    ];
    const projection = roadmapProjection(
      false,
      distinctTitles.map((title, index) => ({
        title,
        speechActClass: "request",
        confidence: 0.99 - (index * 0.01),
      })),
    );
    assert.deepEqual(
      new Set(projection.tasks.map((task) => task.title)),
      new Set(distinctTitles),
      "a semantically load-bearing token must prevent D3 collapse",
    );
  });

  it("does not treat a shared issue identifier as duplicate work", () => {
    const distinctTitles = [
      "Fix code review findings F12 and F13",
      "Fix UX defect F13",
    ];
    const projection = roadmapProjection(
      false,
      distinctTitles.map((title) => ({
        title,
        speechActClass: "request",
        confidence: 0.9,
      })),
    );
    assert.deepEqual(
      new Set(projection.tasks.map((task) => task.title)),
      new Set(distinctTitles),
      "an issue reference alone cannot prove two titles describe one task",
    );
  });

  it("keeps overflow work visible when no rollup affordance exists", () => {
    const admittedTitles = [
      "Design the onboarding flow",
      "Document migration steps",
      "Prepare release notes",
      "Audit accessibility labels",
      "Schedule the founder walkthrough",
      "Implement billing reconciliation",
      "Investigate crash telemetry",
      "Update localization catalog",
    ];
    const projection = roadmapProjection(
      true,
      admittedTitles.map((title, index) => ({
        title,
        speechActClass: "request",
        confidence: 0.99 - (index * 0.01),
      })),
    );
    const visibleTitles = new Set(
      projection.tasks.map((task) => task.title),
    );
    for (const title of admittedTitles) {
      assert.ok(visibleTitles.has(title), `overflow title disappeared: ${title}`);
    }
  });

  it("keeps every admitted single-root task visible", () => {
    const projection = roadmapProjection(false);
    assert.equal(projection.roots.length, 1);
    assert.equal(projection.tasks.length, 7);
  });
});
