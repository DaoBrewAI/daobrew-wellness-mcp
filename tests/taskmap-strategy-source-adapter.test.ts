import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildTaskMapProjection,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  taskMapCanonicalRepositoryRowDigest,
  type TaskMapExactProvenanceCurrentnessV1,
} from "../src/engine/taskmap/exact-provenance-companion.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  readTaskMapStrategySourceAdapter,
  TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
  TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION,
  TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
  type ReadTaskMapStrategySourceAdapterInputV1,
  type TaskMapStrategyRepositoryReadRequestV1,
} from "../src/engine/taskmap/strategy-source-adapter.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
} from "../src/engine/taskmap/types.js";

const COMMIT = "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57";
const REMOTE = "https://github.com/Example/FounderStrategy";
const REPOSITORY_PATH = "tasks/TASKS.md";
const COMMITTED_AT = "2026-07-28T18:40:25-07:00";
const OWNER_SCOPE = taskMapContractDigest("owner");
const STRATEGY_POINTERS = Array.from(
  { length: 9 },
  (_, index) => `strategy-task-${index + 1}`,
);
const MANUAL_POINTERS = Array.from(
  { length: 4 },
  (_, index) => `manual-body-task-${index + 1}`,
);

interface Fixture {
  input: ReadTaskMapStrategySourceAdapterInputV1;
  projection: TaskMapProjectionV1;
  currentness: TaskMapExactProvenanceCurrentnessV1;
  repositoryText: string;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function projectionFixture(): {
  projection: TaskMapProjectionV1;
  currentness: TaskMapExactProvenanceCurrentnessV1;
} {
  const pointers: TaskMapInput["pointers"] = [
    ...STRATEGY_POINTERS.map((pointerId, index) => ({
      id: pointerId,
      sourceKind: "strategy" as const,
      sourceObjectId: pointerId,
      sourceRefHash: taskMapContractDigest(`strategy:${pointerId}`),
      canonicalUrl:
        `${REMOTE}/blob/${COMMIT}/${REPOSITORY_PATH}`,
      sourceVersion: COMMIT,
      authority: "source_system" as const,
      syncMode: "return_only" as const,
      capabilities: ["read_task" as const, "deep_link" as const],
    })),
    ...MANUAL_POINTERS.map((pointerId) => ({
      id: pointerId,
      sourceKind: "manual" as const,
      sourceObjectId: pointerId,
      sourceRefHash: taskMapContractDigest(`manual:${pointerId}`),
      sourceVersion: "manual.1",
      authority: "user" as const,
      syncMode: "personal_fork" as const,
      capabilities: ["read_task" as const],
    })),
  ];
  const events: TaskMapInput["events"] = pointers.map((pointer, index) => ({
    id: `event-${pointer.id}`,
    pointerId: pointer.id,
    recordKind: "authoritative_task",
    activity: index % 2 === 0 ? "task_created" : "task_updated",
    occurredAt: `2026-07-${20 + (index % 7)}T17:00:00.000Z`,
    observedAt: "2026-07-27T23:00:00.000Z",
    objectRefs:
      index < 5
        ? ["contract:return", "workstream:product"]
        : index < 9
          ? ["proof:receipt", "workstream:company"]
          : ["workstream:body"],
    title: `Accepted task ${index + 1}`,
    summary: `Bounded accepted task ${index + 1}.`,
    extractionConfidence: 1,
    sourceStatus: index % 2 === 0 ? "open" : "in_progress",
  }));
  const rootDefinitions = [
    {
      proposalId: "root-product",
      title: "Product work",
      summary: "Current source-linked product work.",
      memberObjectRefs: ["contract:return", "workstream:product"],
      eventIds: events.slice(0, 5).map((event) => event.id),
    },
    {
      proposalId: "root-company",
      title: "Company work",
      summary: "Current company commitments.",
      memberObjectRefs: ["proof:receipt", "workstream:company"],
      eventIds: events.slice(5, 9).map((event) => event.id),
    },
    {
      proposalId: "root-body",
      title: "Body reliability",
      summary: "Current manually accepted body work.",
      memberObjectRefs: ["workstream:body"],
      eventIds: events.slice(9).map((event) => event.id),
    },
  ];
  const rootForEvent = new Map(
    rootDefinitions.flatMap((root) =>
      root.eventIds.map((eventId) => [eventId, root.proposalId] as const)
    ),
  );
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: "2026-07-27T23:00:00.000Z",
    pointers,
    events,
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "fixture",
    promptHash: taskMapContractDigest("strategy-adapter-fixture"),
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: input.generatedAt,
    roots: rootDefinitions.map((root) => ({
      proposalId: root.proposalId,
      title: root.title,
      summary: root.summary,
      evidenceEventIds: root.eventIds,
      memberObjectRefs: root.memberObjectRefs,
      confidence: 1,
    })),
    tasks: events.map((event, index) => ({
      proposalId: `task-${index}`,
      rootProposalId: rootForEvent.get(event.id)!,
      title: event.title,
      summary: event.summary,
      evidenceEventIds: [event.id],
      authoritativeTaskEventId: event.id,
      openState: "open",
      confidence: 1,
    })),
    edges: events.map((event, index) => ({
      proposalId: `edge-${index}`,
      fromProposalId: rootForEvent.get(event.id)!,
      toProposalId: `task-${index}`,
      relation: "advances",
      evidenceEventIds: [event.id],
      confidence: 1,
    })),
  };
  const projection = buildTaskMapProjection(input, brain, { arm: "E4" });
  assert.strictEqual(
    projection.runStatus,
    "accepted",
    JSON.stringify(projection.rejections),
  );
  assert.deepStrictEqual(
    taskMapProjectionArtifactValidationReasons(projection),
    [],
  );
  const currentness: TaskMapExactProvenanceCurrentnessV1 = {
    contractVersion: "taskmap-native-currentness-gate.v1",
    runId: projection.runId,
    inputDigest: projection.inputDigest,
    projectionDigest:
      diffTaskMapProjections(null, projection).currentProjectionDigest,
    taskDispositions: projection.tasks.map((task) => ({
      taskId: task.id,
      disposition: "current",
    })),
  };
  return { projection, currentness };
}

function fixture(): Fixture {
  const { projection, currentness } = projectionFixture();
  const repositoryRows = STRATEGY_POINTERS.map(
    (pointerId, index) =>
      `| P${index} | Private owner label ${index} | PRIVATE_ROW_BODY_${index} |`,
  );
  const repositoryText = [
    "# Private task board",
    "| Priority | Goal | Private detail |",
    "| --- | --- | --- |",
    ...repositoryRows,
  ].join("\n");
  const rowBindings = STRATEGY_POINTERS.map((pointerId, index) => ({
    pointerId,
    canonicalRowDigest: taskMapCanonicalRepositoryRowDigest({
      repositoryRelativePath: REPOSITORY_PATH,
      sourceObjectId: pointerId,
      rowText: repositoryRows[index]!,
    }),
  }));
  const projectionBytes = Buffer.from(
    `${JSON.stringify(projection, null, 2)}\n`,
  );
  const currentnessBytes = Buffer.from(
    `${JSON.stringify(currentness, null, 2)}\n`,
  );
  const input: ReadTaskMapStrategySourceAdapterInputV1 = {
    ownerScopeDigest: OWNER_SCOPE,
    binding: {
      connectionId: "strategy-owner-read",
      sourceKind: "strategy",
      tenantOrWorkspaceDigest: taskMapContractDigest("strategy-workspace"),
      accountOrPrincipalDigest: OWNER_SCOPE,
      grantVersion: "strategy-read-v1",
    },
    projectionBytes,
    currentnessBytes,
    expectedProjectionFileDigest: sha256(projectionBytes),
    expectedCurrentnessFileDigest: sha256(currentnessBytes),
    rowBindings,
    repositoryProvider: {
      async readImmutableRepositoryFile(
        request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
      ) {
        assert.deepStrictEqual(request, {
          remoteLocator: REMOTE,
          revision: COMMIT,
          repositoryRelativePath: REPOSITORY_PATH,
          maximumBytes: 256 * 1_024,
        });
        return {
          remoteLocator: REMOTE,
          revision: COMMIT,
          repositoryRelativePath: REPOSITORY_PATH,
          committedAt: COMMITTED_AT,
          content: repositoryText,
          contentDigest: sha256(repositoryText),
        };
      },
    },
  };
  return { input, projection, currentness, repositoryText };
}

function encodeFixture(
  original: Fixture,
  projection: TaskMapProjectionV1,
  currentness: TaskMapExactProvenanceCurrentnessV1,
): ReadTaskMapStrategySourceAdapterInputV1 {
  const projectionBytes = Buffer.from(`${JSON.stringify(projection)}\n`);
  const currentnessBytes = Buffer.from(`${JSON.stringify(currentness)}\n`);
  return {
    ...original.input,
    projectionBytes,
    currentnessBytes,
    expectedProjectionFileDigest: sha256(projectionBytes),
    expectedCurrentnessFileDigest: sha256(currentnessBytes),
  };
}

describe("Task Map Strategy source adapter", () => {
  it("attests only the nine current Strategy tasks from thirteen current tasks", async () => {
    const built = fixture();
    const result = await readTaskMapStrategySourceAdapter(built.input);

    assert.strictEqual(
      result.contractVersion,
      TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION,
    );
    assert.strictEqual(
      result.adapterVersion,
      TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
    );
    assert.strictEqual(
      result.adapterPolicyDigest,
      TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
    );
    assert.deepStrictEqual(
      [
        result.taskMapInput.pointers.length,
        result.taskMapInput.events.length,
        result.sourceBindings.length,
        result.evidenceBindings.length,
        result.sourceSnapshot.envelopes.length,
        result.exactProvenance.tasks.length,
      ],
      [9, 9, 9, 9, 9, 9],
    );
    assert.deepStrictEqual(
      [
        result.exactProvenance.projection.allCurrentTaskCount,
        result.exactProvenance.projection.attestedStrategyTaskCount,
        result.exactProvenance.projection.excludedCurrentTaskCount,
        result.exactProvenance.rootLinks.length,
      ],
      [13, 9, 4, 2],
    );
    assert.strictEqual(
      result.exactProvenance.scope,
      "current_strategy_owned_tasks_only",
    );
    assert.ok(result.taskMapInput.pointers.every(
      (pointer) =>
        pointer.sourceKind === "strategy"
        && pointer.authority === "source_system"
        && pointer.sourceVersion?.length === 64,
    ));
    assert.ok(result.taskMapInput.events.every(
      (event) =>
        event.recordKind === "authoritative_task"
        && event.corpusCoverage === undefined
        && event.bodyJoinEligible === undefined
        && event.objectRefs.length === 1
        && event.objectRefs[0]!.startsWith("external:"),
    ));
    assert.ok(result.sourceBindings.every(
      (binding) =>
        binding.semanticClass === "source_authoritative"
        && binding.observedRevision === COMMIT
        && binding.evidenceRevision === COMMIT,
    ));
    assert.ok(result.evidenceBindings.every(
      (binding) =>
        binding.disposition === "source_authoritative"
        && binding.rootLinkRefs.length === 1,
    ));
    assert.ok(Object.isFrozen(result));

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("PRIVATE_ROW_BODY"));
    assert.ok(!serialized.includes("Private owner label"));
    assert.ok(!serialized.includes(built.repositoryText));
    assert.ok(!serialized.includes("/Users/"));
    assert.ok(!serialized.includes("receipt_observed"));
  });

  it("fails closed on mutable locators and projection/currentness digest drift", async () => {
    const built = fixture();
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter({
        ...built.input,
        expectedProjectionFileDigest: "f".repeat(64),
      }),
      /digest_mismatch/,
    );

    const mutable = structuredClone(built.projection);
    for (const source of mutable.sources) {
      if (source.sourceKind !== "strategy") continue;
      source.sourceVersion = "HEAD";
      source.canonicalUrl =
        `${REMOTE}/blob/HEAD/${REPOSITORY_PATH}`;
    }
    const mutableDigest =
      diffTaskMapProjections(null, mutable).currentProjectionDigest;
    const mutableCurrentness = {
      ...built.currentness,
      projectionDigest: mutableDigest,
    };
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(
        encodeFixture(built, mutable, mutableCurrentness),
      ),
      /mutable_revision/,
    );

    const malformedLocator = structuredClone(built.projection);
    for (const source of malformedLocator.sources) {
      if (source.sourceKind === "strategy") {
        source.canonicalUrl =
          `${REMOTE}/blob/${COMMIT}/tasks/%ZZ.md`;
      }
    }
    const malformedCurrentness = {
      ...built.currentness,
      projectionDigest:
        diffTaskMapProjections(
          null,
          malformedLocator,
        ).currentProjectionDigest,
    };
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(
        encodeFixture(
          built,
          malformedLocator,
          malformedCurrentness,
        ),
      ),
      /repository_locator_mismatch/,
    );

    const encodedSlashLocator = structuredClone(built.projection);
    for (const source of encodedSlashLocator.sources) {
      if (source.sourceKind === "strategy") {
        source.canonicalUrl =
          `https://github.com/Example%2FFounderStrategy`
          + `/blob/${COMMIT}/${REPOSITORY_PATH}`;
      }
    }
    const encodedSlashCurrentness = {
      ...built.currentness,
      projectionDigest:
        diffTaskMapProjections(
          null,
          encodedSlashLocator,
        ).currentProjectionDigest,
    };
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(
        encodeFixture(
          built,
          encodedSlashLocator,
          encodedSlashCurrentness,
        ),
      ),
      /repository_locator_mismatch/,
    );

    const mismatchedCurrentness = structuredClone(built.currentness);
    mismatchedCurrentness.projectionDigest = "e".repeat(64);
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(
        encodeFixture(
          built,
          built.projection,
          mismatchedCurrentness,
        ),
      ),
      /invalid_currentness/,
    );
  });

  it("requires an exhaustive digest-only binding and exactly one matching row", async () => {
    const built = fixture();
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter({
        ...built.input,
        rowBindings: built.input.rowBindings.slice(0, 8),
      }),
      /row_binding_mismatch/,
    );
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter({
        ...built.input,
        rowBindings: built.input.rowBindings.map((row, index) => (
          index === 0
            ? { ...row, canonicalRowDigest: "f".repeat(64) }
            : row
        )),
      }),
      /row_resolution_failed/,
    );

    const duplicated = {
      ...built.input,
      repositoryProvider: {
        async readImmutableRepositoryFile(
          request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
        ) {
          const firstRow = built.repositoryText.split("\n")[3]!;
          const content = `${built.repositoryText}\n${firstRow}`;
          return {
            remoteLocator: request.remoteLocator,
            revision: request.revision,
            repositoryRelativePath: request.repositoryRelativePath,
            committedAt: COMMITTED_AT,
            content,
            contentDigest: sha256(content),
          };
        },
      },
    };
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(duplicated),
      /row_resolution_failed/,
    );
  });

  it("rejects repository identity, content digest, and lifecycle contradictions", async () => {
    const built = fixture();
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter({
        ...built.input,
        repositoryProvider: {
          async readImmutableRepositoryFile(
            request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
          ) {
            return {
              remoteLocator: "https://github.com/Other/Repository",
              revision: request.revision,
              repositoryRelativePath: request.repositoryRelativePath,
              committedAt: COMMITTED_AT,
              content: built.repositoryText,
              contentDigest: sha256(built.repositoryText),
            };
          },
        },
      }),
      /repository_response_malformed/,
    );
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter({
        ...built.input,
        repositoryProvider: {
          async readImmutableRepositoryFile(
            request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
          ) {
            return {
              remoteLocator: request.remoteLocator,
              revision: request.revision,
              repositoryRelativePath: request.repositoryRelativePath,
              committedAt: COMMITTED_AT,
              content: built.repositoryText,
              contentDigest: "a".repeat(64),
            };
          },
        },
      }),
      /digest_mismatch/,
    );

    const contradiction = structuredClone(built.projection);
    const strategyTask = contradiction.tasks.find(
      (task) => task.taskHomePointerId === STRATEGY_POINTERS[0],
    )!;
    strategyTask.sourceStatus = "completed";
    const contradictionCurrentness = {
      ...built.currentness,
      projectionDigest:
        diffTaskMapProjections(
          null,
          contradiction,
        ).currentProjectionDigest,
    };
    await assert.rejects(
      () => readTaskMapStrategySourceAdapter(
        encodeFixture(
          built,
          contradiction,
          contradictionCurrentness,
        ),
      ),
      /lifecycle_unavailable/,
    );
  });

  it("reproduces the owner 9-of-13 proof only when explicit read-only inputs are supplied", {
    skip:
      process.env.TASKMAP_M6_STRATEGY_REPO === undefined
      || process.env.TASKMAP_M6_OWNER_TASKMAP_ROOT === undefined
      || process.env.TASKMAP_M6_STRATEGY_BINDINGS === undefined,
  }, async () => {
    const repositoryRoot = process.env.TASKMAP_M6_STRATEGY_REPO!;
    const ownerRoot = process.env.TASKMAP_M6_OWNER_TASKMAP_ROOT!;
    const rowBindings = JSON.parse(
      readFileSync(
        process.env.TASKMAP_M6_STRATEGY_BINDINGS!,
        "utf8",
      ),
    );
    const projectionBytes = readFileSync(
      path.join(ownerRoot, "taskmap-projection.v1.json"),
    );
    const currentnessBytes = readFileSync(
      path.join(ownerRoot, "taskmap-currentness.v1.json"),
    );
    const projection = JSON.parse(
      projectionBytes.toString("utf8"),
    ) as TaskMapProjectionV1;
    const source = projection.sources.find(
      (row) => row.sourceKind === "strategy",
    )!;
    const url = new URL(source.canonicalUrl!);
    const segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
    const remoteLocator =
      `https://github.com/${segments[0]}/${segments[1]}`;
    const repositoryRelativePath = segments.slice(4).join("/");
    const revision = source.sourceVersion!;
    const repositoryText = execFileSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "show",
        `${revision}:${repositoryRelativePath}`,
      ],
      { encoding: "utf8" },
    );
    const committedAt = execFileSync(
      "git",
      ["-C", repositoryRoot, "show", "-s", "--format=%cI", revision],
      { encoding: "utf8" },
    ).trim();
    const result = await readTaskMapStrategySourceAdapter({
      ownerScopeDigest: OWNER_SCOPE,
      binding: {
        connectionId: "strategy-owner-read",
        sourceKind: "strategy",
        tenantOrWorkspaceDigest: taskMapContractDigest("strategy-owner"),
        accountOrPrincipalDigest: OWNER_SCOPE,
        grantVersion: "strategy-read-v1",
      },
      projectionBytes,
      currentnessBytes,
      expectedProjectionFileDigest: sha256(projectionBytes),
      expectedCurrentnessFileDigest: sha256(currentnessBytes),
      rowBindings,
      repositoryProvider: {
        async readImmutableRepositoryFile(request) {
          assert.strictEqual(request.remoteLocator, remoteLocator);
          return {
            remoteLocator,
            revision: request.revision,
            repositoryRelativePath,
            committedAt,
            content: repositoryText,
            contentDigest: sha256(repositoryText),
          };
        },
      },
    });
    assert.deepStrictEqual(
      [
        result.exactProvenance.projection.allCurrentTaskCount,
        result.exactProvenance.projection.attestedStrategyTaskCount,
      ],
      [13, 9],
    );
  });
});
