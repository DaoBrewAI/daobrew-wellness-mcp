import assert from "node:assert";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertTaskMapExactProvenance,
  buildTaskMapExactProvenance,
  taskMapCanonicalRepositoryRowDigest,
  taskMapExactProvenanceDigest,
  TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST,
  TASKMAP_EXACT_PROVENANCE_VERSION,
  type BuildTaskMapExactProvenanceInputV1,
  type TaskMapExactProvenanceCurrentnessV1,
} from "../src/engine/taskmap/exact-provenance-companion.js";
import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";

const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REPOSITORY_PATH = "tasks/TASKS.md";
const OWNER_SCOPE_DIGEST = taskMapContractDigest("synthetic-owner");
const ADAPTER_POLICY_DIGEST = taskMapContractDigest({
  version: "strategy-row-adapter.1",
  binding: "explicit-pointer-to-immutable-row",
});
const STRATEGY_BINDING = {
  connectionId: "strategy-read",
  sourceKind: "strategy" as const,
  tenantOrWorkspaceDigest: taskMapContractDigest("strategy-repository"),
  accountOrPrincipalDigest: taskMapContractDigest("strategy-principal"),
  grantVersion: "strategy-read-v1",
};

function sourceRef(pointerId: string): string {
  return taskMapContractDigest(`source:${pointerId}`);
}

function fixture(
  contextRelation: "related_to" | "blocks" = "related_to",
): BuildTaskMapExactProvenanceInputV1 {
  const pointerIds = [
    "ptr-strategy-source-aware-e2e",
    "ptr-strategy-connector-session-foundation",
    "ptr-strategy-taskmap-product-prototype",
  ];
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: "2026-07-29T07:15:00.000Z",
    pointers: [
      ...pointerIds.map((pointerId) => ({
        id: pointerId,
        sourceKind: "strategy" as const,
        sourceObjectId: pointerId,
        sourceRefHash: sourceRef(pointerId),
        canonicalUrl:
          `https://github.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`,
        sourceVersion: COMMIT,
        authority: "source_system" as const,
        syncMode: "return_only" as const,
        capabilities: ["read_task" as const, "deep_link" as const],
      })),
      {
        id: "ptr-granola-context",
        sourceKind: "granola",
        sourceObjectId: "bounded-context",
        sourceRefHash: taskMapContractDigest("granola-context"),
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      ...pointerIds.map((pointerId, index) => ({
        id: `event-${index}`,
        pointerId,
        recordKind: "authoritative_task" as const,
        activity: "task_created" as const,
        occurredAt: `2026-07-${20 + index}T17:00:00.000Z`,
        observedAt: "2026-07-29T07:15:00.000Z",
        objectRefs: [`task:${index}`],
        title: `Source task ${index}`,
        summary: `One bounded source task ${index}.`,
        extractionConfidence: 1,
        sourceStatus: "open" as const,
        priority: 1,
      })),
      {
        id: "event-context",
        pointerId: "ptr-granola-context",
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-24T17:00:00.000Z",
        observedAt: "2026-07-29T07:15:00.000Z",
        objectRefs: ["context:related"],
        title: "Bounded context",
        summary: "This context may explain a relation but cannot prove execution.",
        extractionConfidence: 1,
      },
    ],
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: taskMapContractDigest("exact-provenance-fixture"),
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: input.generatedAt,
    roots: [{
      proposalId: "root-current",
      title: "Current source-linked work",
      summary: "Three accepted tasks share one derived workstream.",
      evidenceEventIds: ["event-0", "event-1", "event-2", "event-context"],
      memberObjectRefs: ["task:0", "task:1", "task:2"],
      confidence: 1,
    }],
    tasks: pointerIds.map((_pointerId, index) => ({
      proposalId: `task-${index}`,
      rootProposalId: "root-current",
      title: `Source task ${index}`,
      summary: `One bounded source task ${index}.`,
      evidenceEventIds:
        index < 2
          ? [`event-${index}`, "event-context"]
          : [`event-${index}`],
      authoritativeTaskEventId: `event-${index}`,
      openState: "open",
      confidence: 1,
    })),
    edges: [
      ...pointerIds.map((_pointerId, index) => ({
        proposalId: `edge-${index}`,
        fromProposalId: "root-current",
        toProposalId: `task-${index}`,
        relation: "advances" as const,
        evidenceEventIds: [`event-${index}`],
        confidence: 1,
      })),
      {
        proposalId: "edge-context",
        fromProposalId: "task-0",
        toProposalId: "task-1",
        relation: contextRelation,
        evidenceEventIds: ["event-context"],
        confidence: 1,
      },
    ],
  };
  const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
  const taskByPointer = new Map(
    projection.tasks.map((task) => [task.taskHomePointerId, task]),
  );
  const currentTaskIds = pointerIds.slice(0, 2).map(
    (pointerId) => taskByPointer.get(pointerId)!.id,
  );
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentness: TaskMapExactProvenanceCurrentnessV1 = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: currentTaskIds.includes(task.id)
        ? "current" as const
        : "needs_lifecycle_review" as const,
    })),
  };
  const envelopes = pointerIds.slice(0, 2).map((pointerId, index) => {
    const rowDigest = taskMapCanonicalRepositoryRowDigest({
      repositoryRelativePath: REPOSITORY_PATH,
      sourceObjectId: pointerId,
      rowText:
        `| P0 | **Source task ${index}** | Owner | Checkpoint | Done means |`,
    });
    return buildTaskMapSourceEnvelope({
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      binding: STRATEGY_BINDING,
      sourceKind: "strategy",
      objectType: "authoritative_task",
      sourceObjectId: pointerId,
      sourceRevision: COMMIT,
      eventTime: `2026-07-${20 + index}T17:00:00.000Z`,
      contentDigest: rowDigest,
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    });
  });
  const sourceSnapshot = buildTaskMapSourceSnapshot(envelopes, []);
  return {
    projection,
    currentness,
    currentnessFileDigest: taskMapContractDigest(currentness),
    expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
    expectedAdapterVersion: "strategy-row-adapter.1",
    expectedAdapterPolicyDigest: ADAPTER_POLICY_DIGEST,
    sourceSnapshot,
    taskBindings: currentTaskIds.map((taskId, index) => ({
      taskId,
      sourceEnvelopeId: envelopes[index]!.envelopeId,
      repositoryRelativePath: REPOSITORY_PATH,
      adapterVersion: "strategy-row-adapter.1",
      adapterPolicyDigest: ADAPTER_POLICY_DIGEST,
    })),
  };
}

function assertionContext(input: BuildTaskMapExactProvenanceInputV1) {
  return {
    projection: input.projection,
    currentness: input.currentness,
    currentnessFileDigest: input.currentnessFileDigest,
    expectedSourceSnapshotDigest: input.expectedSourceSnapshotDigest,
    expectedAdapterVersion: input.expectedAdapterVersion,
    expectedAdapterPolicyDigest: input.expectedAdapterPolicyDigest,
  };
}

function withCurrentSourceCanonicalUrl(
  input: BuildTaskMapExactProvenanceInputV1,
  canonicalUrl: string | undefined,
): BuildTaskMapExactProvenanceInputV1 {
  const projection = structuredClone(input.projection);
  const taskId = input.taskBindings[0]!.taskId;
  const pointerId = projection.tasks.find((task) => task.id === taskId)!
    .taskHomePointerId!;
  const source = projection.sources.find((row) => row.id === pointerId)!;
  if (canonicalUrl === undefined) {
    delete source.canonicalUrl;
  } else {
    source.canonicalUrl = canonicalUrl;
  }
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  const currentness = {
    ...input.currentness,
    projectionDigest,
  };
  return {
    ...input,
    projection,
    currentness,
    currentnessFileDigest: taskMapContractDigest(currentness),
  };
}

describe("Task Map exact provenance companion", () => {
  it("binds every current task to one immutable row and labels roots and edges as derived", () => {
    const input = fixture();
    const artifact = buildTaskMapExactProvenance(input);
    const replay = buildTaskMapExactProvenance({
      ...input,
      taskBindings: [...input.taskBindings].reverse(),
      sourceSnapshot: buildTaskMapSourceSnapshot(
        [...input.sourceSnapshot.envelopes].reverse(),
        [],
      ),
    });

    assert.strictEqual(artifact.contractVersion, TASKMAP_EXACT_PROVENANCE_VERSION);
    assert.strictEqual(artifact.tasks.length, 2);
    assert.strictEqual(artifact.roots.length, 1);
    assert.strictEqual(artifact.producer.policyDigest,
      TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST);
    assert.ok(artifact.tasks.every((row) => (
      row.bindingAuthority === "adapter_attested"
      && row.sourceRevision === COMMIT
      && row.repositoryRelativePath === REPOSITORY_PATH
    )));
    assert.ok(artifact.roots.every((row) => (
      row.factKind === "derived_projection"
      && row.algorithmPolicyDigest === input.projection.algorithmPolicyDigest
    )));
    assert.strictEqual(
      artifact.edges.filter((edge) => edge.relation === "advances").length,
      2,
    );
    assert.ok(
      artifact.edges
        .filter((edge) => edge.relation === "advances")
        .every((edge) => edge.executionEvidence === "exact_task_source"),
    );
    assert.strictEqual(
      artifact.edges.find((edge) => edge.relation === "related_to")
        ?.executionEvidence,
      "context_only",
    );
    assert.deepStrictEqual(replay, artifact);
    assert.strictEqual(taskMapExactProvenanceDigest(artifact), artifact.artifactDigest);
    assert.deepStrictEqual(
      assertTaskMapExactProvenance(artifact, assertionContext(input)),
      artifact,
    );
    assert.ok(Object.isFrozen(artifact));

    const serialized = taskMapContractCanonicalJson(artifact);
    assert.ok(!serialized.includes("Done means"));
    assert.ok(!serialized.includes("/Users/"));
    assert.ok(!serialized.includes("Bounded context"));
    assert.ok(!serialized.includes("sourceRowsStored\":true"));
  });

  it("fails closed on incomplete coverage, unsafe paths, and coordinated proof tampering", () => {
    const input = fixture();
    assert.throws(
      () => buildTaskMapExactProvenance({
        ...input,
        taskBindings: input.taskBindings.slice(0, 1),
      }),
      /every current task requires one exact source binding/,
    );
    assert.throws(
      () => buildTaskMapExactProvenance({
        ...input,
        taskBindings: input.taskBindings.map((binding, index) => (
          index === 0
            ? { ...binding, repositoryRelativePath: "../TASKS.md" }
            : binding
        )),
      }),
      /canonical repository-relative path/,
    );

    const artifact = structuredClone(buildTaskMapExactProvenance(input));
    artifact.tasks[0]!.canonicalRowDigest = "f".repeat(64);
    artifact.artifactDigest = taskMapExactProvenanceDigest(artifact);
    assert.throws(
      () => assertTaskMapExactProvenance(
        artifact,
        assertionContext(input),
      ),
      /artifact digest or derived proof is invalid/,
    );

    const unknown = structuredClone(buildTaskMapExactProvenance(input)) as
      typeof artifact & { sourceBody?: string };
    unknown.sourceBody = "private source text";
    unknown.artifactDigest = taskMapExactProvenanceDigest(unknown);
    assert.throws(
      () => assertTaskMapExactProvenance(
        unknown,
        assertionContext(input),
      ),
      /artifact fields are invalid/,
    );
  });

  it("requires external snapshot and adapter expectations, exact locators, and exact operational edges", () => {
    const input = fixture();
    const originalEnvelope = input.sourceSnapshot.envelopes[0]!;
    const replacementEnvelope = buildTaskMapSourceEnvelope({
      ownerScopeDigest: originalEnvelope.ownerScopeDigest,
      binding: originalEnvelope.binding,
      sourceKind: originalEnvelope.sourceKind,
      objectType: originalEnvelope.objectType,
      sourceObjectId: originalEnvelope.sourceObjectId,
      sourceRevision: originalEnvelope.sourceRevision,
      eventTime: originalEnvelope.eventTime,
      contentDigest: taskMapContractDigest("coordinated replacement row"),
      authority: originalEnvelope.authority,
    });
    const replacementSnapshot = buildTaskMapSourceSnapshot(
      input.sourceSnapshot.envelopes.map((envelope) => (
        envelope.envelopeId === originalEnvelope.envelopeId
          ? replacementEnvelope
          : envelope
      )),
      [],
    );
    const replacementBindings = input.taskBindings.map((binding) => (
      binding.sourceEnvelopeId === originalEnvelope.envelopeId
        ? {
            ...binding,
            sourceEnvelopeId: replacementEnvelope.envelopeId,
          }
        : binding
    ));
    assert.throws(
      () => buildTaskMapExactProvenance({
        ...input,
        sourceSnapshot: replacementSnapshot,
        taskBindings: replacementBindings,
      }),
      /externally expected digest/,
    );
    const replacementArtifact = buildTaskMapExactProvenance({
      ...input,
      expectedSourceSnapshotDigest:
        replacementSnapshot.sourceSnapshotDigest,
      sourceSnapshot: replacementSnapshot,
      taskBindings: replacementBindings,
    });
    assert.throws(
      () => assertTaskMapExactProvenance(
        replacementArtifact,
        assertionContext(input),
      ),
      /externally expected digest/,
    );

    const replacementAdapterVersion = "strategy-row-adapter.2";
    const replacementAdapterPolicyDigest =
      taskMapContractDigest("strategy-row-adapter.2");
    assert.throws(
      () => buildTaskMapExactProvenance({
        ...input,
        expectedAdapterVersion: replacementAdapterVersion,
        expectedAdapterPolicyDigest: replacementAdapterPolicyDigest,
      }),
      /externally expected adapter policy/,
    );
    const replacementAdapterArtifact = buildTaskMapExactProvenance({
      ...input,
      expectedAdapterVersion: replacementAdapterVersion,
      expectedAdapterPolicyDigest: replacementAdapterPolicyDigest,
      taskBindings: input.taskBindings.map((binding) => ({
        ...binding,
        adapterVersion: replacementAdapterVersion,
        adapterPolicyDigest: replacementAdapterPolicyDigest,
      })),
    });
    assert.throws(
      () => assertTaskMapExactProvenance(
        replacementAdapterArtifact,
        assertionContext(input),
      ),
      /externally expected adapter policy/,
    );

    assert.throws(
      () => buildTaskMapExactProvenance(
        withCurrentSourceCanonicalUrl(input, undefined),
      ),
      /immutable repository locator/,
    );
    assert.throws(
      () => buildTaskMapExactProvenance(
        withCurrentSourceCanonicalUrl(
          input,
          `https://example.com/DaoBrewAI/DaoBrewStrategy/blob/${COMMIT}/${REPOSITORY_PATH}`,
        ),
      ),
      /immutable repository locator/,
    );
    assert.throws(
      () => buildTaskMapExactProvenance(fixture("blocks")),
      /operational route edge lacks exact task-source proof/,
    );
  });

  it("accepts any structurally valid immutable GitHub repository locator", () => {
    const input = withCurrentSourceCanonicalUrl(
      fixture(),
      `https://github.com/ExampleOrganization/PlanningRepository/blob/${COMMIT}/${REPOSITORY_PATH}`,
    );
    assert.doesNotThrow(() => buildTaskMapExactProvenance(input));
  });

  it("reproduces the immutable nine-task owner proof when explicit local read-only roots are supplied", {
    skip:
      process.env.TASKMAP_M4P_STRATEGY_REPO === undefined
      || process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT === undefined,
  }, () => {
    const strategyRepo = process.env.TASKMAP_M4P_STRATEGY_REPO!;
    const taskMapRoot = process.env.TASKMAP_M4P_OWNER_TASKMAP_ROOT!;
    const projectionBytes = readFileSync(
      path.join(taskMapRoot, "taskmap-projection.v1.json"),
    );
    const currentnessBytes = readFileSync(
      path.join(taskMapRoot, "taskmap-currentness.v1.json"),
    );
    const projection = JSON.parse(
      projectionBytes.toString("utf8"),
    ) as TaskMapProjectionV1;
    const currentness = JSON.parse(
      currentnessBytes.toString("utf8"),
    ) as TaskMapExactProvenanceCurrentnessV1;
    const sourceText = execFileSync(
      "git",
      ["-C", strategyRepo, "show", `${COMMIT}:${REPOSITORY_PATH}`],
      { encoding: "utf8" },
    );
    const eventTime = execFileSync(
      "git",
      ["-C", strategyRepo, "show", "-s", "--format=%cI", COMMIT],
      { encoding: "utf8" },
    ).trim();
    const selectors = new Map([
      ["ptr-strategy-source-aware-e2e", "**Source-aware E2E**"],
      [
        "ptr-strategy-connector-session-foundation",
        "**Connector + session foundation**",
      ],
      [
        "ptr-strategy-taskmap-product-prototype",
        "**Task Map product prototype**",
      ],
      [
        "ptr-strategy-migration-blocker-ledger",
        "**Migration blocker ledger**",
      ],
      [
        "ptr-strategy-meeting-capture-workflow",
        "**Meeting capture workflow**",
      ],
      ["ptr-strategy-spc-application", "SPC 申请"],
      ["ptr-strategy-nyx-contact-onepager", "NYX intro"],
      ["ptr-strategy-yc-closeout", "YC 状态收尾"],
      ["ptr-strategy-market-test-ledger", "Market-test ledger"],
    ]);
    const adapterPolicyDigest = taskMapContractDigest({
      version: "strategy-owner-pointer-row-attestation.1",
      commit: COMMIT,
      repositoryRelativePath: REPOSITORY_PATH,
      selectors: [...selectors].sort(([left], [right]) =>
        left.localeCompare(right)
      ),
      mappingAuthority: "adapter_attested_not_source_native",
    });
    const ownerScopeDigest = taskMapContractDigest({
      domain: "taskmap-owner-local.1",
      uid: process.getuid?.() ?? 0,
    });
    const binding = {
      connectionId: "strategy-owner-read",
      sourceKind: "strategy" as const,
      tenantOrWorkspaceDigest: taskMapContractDigest("DaoBrewStrategy"),
      accountOrPrincipalDigest: ownerScopeDigest,
      grantVersion: "strategy-immutable-git-read-v1",
    };
    const currentTaskIds = new Set(
      currentness.taskDispositions
        .filter((row) => row.disposition === "current")
        .map((row) => row.taskId),
    );
    const tasks = projection.tasks
      .filter((task) => currentTaskIds.has(task.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    assert.strictEqual(tasks.length, 9);
    const lines = sourceText.replace(/\r\n?/g, "\n").split("\n");
    const envelopeByTask = tasks.map((task) => {
      const pointerId = task.taskHomePointerId;
      assert.ok(pointerId);
      const selector = selectors.get(pointerId);
      assert.ok(selector);
      const rows = lines.filter(
        (line) => line.startsWith("|") && line.includes(selector),
      );
      assert.strictEqual(rows.length, 1);
      const canonicalRowDigest = taskMapCanonicalRepositoryRowDigest({
        repositoryRelativePath: REPOSITORY_PATH,
        sourceObjectId: pointerId,
        rowText: rows[0]!,
      });
      const envelope = buildTaskMapSourceEnvelope({
        ownerScopeDigest,
        binding,
        sourceKind: "strategy",
        objectType: "authoritative_task",
        sourceObjectId: pointerId,
        sourceRevision: COMMIT,
        eventTime,
        contentDigest: canonicalRowDigest,
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "source_status",
          completion: "source_status",
          rank: "accepted_work",
        },
      });
      return { taskId: task.id, envelope };
    });
    const sourceSnapshot = buildTaskMapSourceSnapshot(
      envelopeByTask.map((row) => row.envelope),
      [],
    );
    const currentnessFileDigest = createHash("sha256")
      .update(currentnessBytes)
      .digest("hex");
    const adapterVersion = "strategy-owner-pointer-row-attestation.1";
    const taskBindings = envelopeByTask.map((row) => ({
      taskId: row.taskId,
      sourceEnvelopeId: row.envelope.envelopeId,
      repositoryRelativePath: REPOSITORY_PATH,
      adapterVersion,
      adapterPolicyDigest,
    }));
    const exactInput: BuildTaskMapExactProvenanceInputV1 = {
      projection,
      currentness,
      currentnessFileDigest,
      expectedSourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
      expectedAdapterVersion: adapterVersion,
      expectedAdapterPolicyDigest: adapterPolicyDigest,
      sourceSnapshot,
      taskBindings,
    };
    const cycledBindings = taskBindings.map((binding, index) => ({
      ...binding,
      sourceEnvelopeId:
        taskBindings[(index + 1) % taskBindings.length]!.sourceEnvelopeId,
    }));
    assert.throws(
      () => buildTaskMapExactProvenance({
        ...exactInput,
        taskBindings: cycledBindings,
      }),
      /does not match the task home pointer/,
    );

    const artifact = buildTaskMapExactProvenance(exactInput);
    assertTaskMapExactProvenance(artifact, assertionContext(exactInput));
    assert.strictEqual(
      artifact.artifactDigest,
      "0f904f97cf015e1c076d4c805920270b3dfbac3335816e80a3ba2fe423725884",
    );
    assert.deepStrictEqual(
      [artifact.tasks.length, artifact.roots.length, artifact.edges.length],
      [9, 2, 9],
    );
    assert.ok(
      artifact.edges.every(
        (edge) => edge.executionEvidence === "exact_task_source",
      ),
    );
    const serialized = taskMapContractCanonicalJson(artifact);
    assert.ok(!serialized.includes(strategyRepo));
    assert.ok(!serialized.includes("/Users/"));
    assert.ok(!serialized.includes("Source-aware E2E"));
  });
});
