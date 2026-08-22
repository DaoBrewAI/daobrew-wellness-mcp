import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1,
  TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
  digestTaskMapCommunityRootTasks,
  renderTaskMapCommunityTaskExtractionPrompt,
  taskMapCommunityTaskExtractionBody,
  taskMapCommunityTaskExtractionEnvelopePath,
  type TaskMapCommunityTaskDigestionV1,
} from "../src/engine/taskmap/community-task-digestion.js";
import type {
  TaskMapNativeCommunityRootEvidenceV1,
} from "../src/engine/taskmap/native-community-shadow.js";
import type {
  LlmStation,
  LlmStationRequest,
} from "../src/engine/taskmap/llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const PRODUCED_AT = "2026-08-17T08:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";

interface EvidenceFixture {
  id: string;
  title: string;
  summary: string;
}

function rootEvidenceFixture(
  roots: readonly { proposalId: string; evidence: EvidenceFixture[] }[],
): TaskMapNativeCommunityRootEvidenceV1 {
  const events = roots.flatMap((root) => root.evidence.map((row) => ({
    id: row.id,
    pointerId: `pointer-${row.id}`,
    recordKind: "work_context" as const,
    activity: "context_observed" as const,
    occurredAt: PRODUCED_AT,
    observedAt: PRODUCED_AT,
    objectRefs: [`community:${taskMapContractDigest(root.proposalId)}`],
    title: row.title,
    summary: row.summary,
    extractionConfidence: 0.8,
  })));
  const pointers = [...new Set(events.map((event) => event.pointerId))].map(
    (pointerId) => ({
      id: pointerId,
      sourceKind: "codex_session" as const,
      sourceObjectId: `episode:${taskMapContractDigest(pointerId)}`,
      sourceRefHash: taskMapContractDigest(`ref-${pointerId}`),
      authority: "none" as const,
      syncMode: "reference_only" as const,
      capabilities: ["read_context"],
    }),
  );
  return {
    taskMapInput: {
      contractVersion: "taskmap-input.v1",
      generatedAt: PRODUCED_AT,
      pointers,
      events,
    },
    rootProposals: roots.map((root) => ({
      proposalId: root.proposalId,
      title: `Theme ${root.proposalId}`,
      summary: root.evidence.map((row) => row.title).join(" · "),
      evidenceEventIds: root.evidence.map((row) => row.id),
      memberObjectRefs: [`workstream:${taskMapContractDigest(root.proposalId)}`],
      confidence: 0.8,
    })),
  } as unknown as TaskMapNativeCommunityRootEvidenceV1;
}

type StationMention = {
  text: string;
  title: string;
  class: "request" | "commitment" | "decision" | "other";
  actor: "self" | "other" | "unknown";
  confidence: number;
};

function station(
  outputForBody: (body: string) => StationMention[],
  calls: LlmStationRequest[] = [],
): LlmStation {
  return {
    provider: {
      transport: "gemini-remote",
      executable: "",
      args: [],
      model: "digestion-fixture",
    },
    async run(request) {
      calls.push(request);
      const body = request.promptText
        .split("<<<BEGIN_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n")[1]!
        .split("\n<<<END_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>")[0]!;
      return {
        stationId: request.stationId,
        model: "digestion-fixture",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify({ mentions: outputForBody(body) }),
        producedAt: PRODUCED_AT,
        transport: "gemini-remote",
      };
    },
  };
}

async function fixture(): Promise<{
  taskMapRoot: string;
  promptTemplatePath: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(
    path.join(tmpdir(), "taskmap-community-task-digestion-"),
  );
  const taskMapRoot = path.join(root, "taskmap");
  const promptTemplatePath = path.join(
    root,
    "community-task-extraction-v1.md",
  );
  await mkdir(taskMapRoot, { mode: 0o700 });
  await writeFile(promptTemplatePath, TEMPLATE, { mode: 0o600 });
  return {
    taskMapRoot,
    promptTemplatePath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function onlyRoot(digestion: TaskMapCommunityTaskDigestionV1) {
  assert.equal(digestion.roots.length, 1);
  return digestion.roots[0]!;
}

describe("Task Map community task digestion", () => {
  it("folds five evidence rows describing one action into one task with five citations", async () => {
    const f = await fixture();
    try {
      const evidence = Array.from({ length: 5 }, (_, index) => ({
        id: `event-repair-${index}`,
        title: `Fix the approval routing regression (report ${index})`,
        summary: `Session ${index} traced the approval routing regression.`,
      }));
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-aaaa", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => evidence.map((row, index) => ({
          text: `(report ${index})`,
          title: "Fix the approval routing regression",
          class: "request" as const,
          actor: "self" as const,
          confidence: 0.6 + index * 0.05,
        }))),
      });
      const row = onlyRoot(digestion);
      assert.equal(row.status, "digested");
      assert.equal(row.tasks.length, 1);
      const task = row.tasks[0]!;
      assert.equal(task.title, "Fix the approval routing regression");
      assert.deepEqual(
        task.evidenceEventIds,
        evidence.map((candidate) => candidate.id).sort(),
      );
      assert.equal(task.confidence, 0.8);
      assert.equal(task.rootProposalId, "graph-root-aaaa");
      assert.match(task.taskProposalId, /^community-task-[a-f0-9]{16}$/);
    } finally {
      await f.cleanup();
    }
  });

  it("keeps three distinct actions from five evidence rows as three tasks", async () => {
    const f = await fixture();
    try {
      const evidence = Array.from({ length: 5 }, (_, index) => ({
        id: `event-multi-${index}`,
        title: `Directive ${index}`,
        summary: `Body ${index}: advance the workstream.`,
      }));
      const titles = [
        "Repair the release gate",
        "Restore the YC application card",
        "Ship the dismissal interaction",
      ];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-bbbb", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => evidence.map((row, index) => ({
          text: `Directive ${index}`,
          title: titles[index % titles.length]!,
          class: "request" as const,
          actor: "self" as const,
          confidence: 0.7,
        }))),
      });
      const row = onlyRoot(digestion);
      assert.equal(row.tasks.length, 3);
      assert.deepEqual(
        [...row.tasks.map((task) => task.title)].sort(),
        [...titles].sort(),
      );
      const repair = row.tasks.find((task) =>
        task.title === "Repair the release gate");
      assert.deepEqual(repair?.evidenceEventIds, [
        "event-multi-0",
        "event-multi-3",
      ]);
    } finally {
      await f.cleanup();
    }
  });

  it("emits two tasks when one evidence row describes two actions", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-dual",
        title: "Restore the YC card and ship dismissal",
        summary: "Restore the YC application card. Ship the dismissal flow.",
      }];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-cccc", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [
          {
            text: "Restore the YC application card.",
            title: "Restore the YC application card",
            class: "request",
            actor: "self",
            confidence: 0.8,
          },
          {
            text: "Ship the dismissal flow.",
            title: "Ship the dismissal flow",
            class: "request",
            actor: "self",
            confidence: 0.7,
          },
        ]),
      });
      const row = onlyRoot(digestion);
      assert.equal(row.tasks.length, 2);
      for (const task of row.tasks) {
        assert.deepEqual(task.evidenceEventIds, ["event-dual"]);
      }
    } finally {
      await f.cleanup();
    }
  });

  it("fails closed on ambiguous spans, cross-excerpt spans, and non-actionable mentions", async () => {
    const f = await fixture();
    try {
      const evidence = [
        {
          id: "event-shared-0",
          title: "shared phrase alpha",
          summary: "First body with the shared phrase alpha inside.",
        },
        {
          id: "event-shared-1",
          title: "shared phrase alpha again",
          summary: "Second body with the shared phrase alpha inside.",
        },
      ];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-dddd", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station((body) => [
          {
            // Present in both excerpts: ambiguous, must fail closed.
            text: "shared phrase alpha",
            title: "Bind the ambiguous span",
            class: "request",
            actor: "self",
            confidence: 0.9,
          },
          {
            // Crosses the excerpt boundary: valid against the whole body but
            // inside no single excerpt, must fail closed.
            text: body.slice(
              body.indexOf("inside."),
              body.indexOf("[EVIDENCE 2]") + "[EVIDENCE 2]".length,
            ),
            title: "Bind the crossing span",
            class: "request",
            actor: "self",
            confidence: 0.9,
          },
          {
            // Non-actionable context is never a task.
            text: "First body",
            title: "Keep ambient context",
            class: "other",
            actor: "unknown",
            confidence: 0.9,
          },
        ]),
      });
      const row = onlyRoot(digestion);
      assert.equal(row.status, "degraded");
      assert.equal(row.degradationCode, "invalid_extraction_output");
      assert.deepEqual(row.tasks, []);
      assert.equal(
        digestion.digestedRootCount,
        0,
        "an extraction with no actionable leaves must not claim a digested root",
      );
      assert.equal(digestion.degradedRootCount, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("emits tasks only for owner-actionable speech acts", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-authority",
        title: "Authority examples",
        summary: "Ship owner work. Record the settled choice. Ask Pat to deploy. Track an unknown commitment.",
      }];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-authority", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [
          {
            text: "Ship owner work.",
            title: "Ship owner work",
            class: "request",
            actor: "self",
            confidence: 0.9,
          },
          {
            text: "Record the settled choice.",
            title: "Record the settled choice",
            class: "decision",
            actor: "self",
            confidence: 0.9,
          },
          {
            text: "Ask Pat to deploy.",
            title: "Ask Pat to deploy",
            class: "request",
            actor: "other",
            confidence: 0.9,
          },
          {
            text: "Track an unknown commitment.",
            title: "Track an unknown commitment",
            class: "commitment",
            actor: "unknown",
            confidence: 0.9,
          },
        ]),
      });

      assert.deepEqual(
        onlyRoot(digestion).tasks.map((task) => task.title),
        ["Ship owner work"],
      );
    } finally {
      await f.cleanup();
    }
  });

  it("caps each root at five tasks preferring higher confidence", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-cap",
        title: "Directive bundle",
        summary: "alpha beta gamma delta epsilon zeta",
      }];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([
          { proposalId: "graph-root-eeee", evidence },
        ]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [
          "alpha",
          "beta",
          "gamma",
          "delta",
          "epsilon",
          "zeta",
        ].map((word, index) => ({
          text: word,
          title: `Advance workstream ${word}`,
          class: "request" as const,
          actor: "self" as const,
          confidence: index === 5 ? 0.2 : 0.9,
        }))),
      });
      const row = onlyRoot(digestion);
      assert.equal(
        row.tasks.length,
        TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot,
      );
      assert.equal(
        row.tasks.some((task) =>
          task.title === "Advance workstream zeta"),
        false,
        "the low-confidence overflow mention must be the one dropped",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("replays recorded envelopes byte-identically without a station", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-replay",
        title: "Repair the projection loader",
        summary: "Repair the projection loader for canonical ordering.",
      }];
      const rootEvidence = rootEvidenceFixture([
        { proposalId: "graph-root-ffff", evidence },
      ]);
      const calls: LlmStationRequest[] = [];
      const first = await digestTaskMapCommunityRootTasks({
        rootEvidence,
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [{
          text: "Repair the projection loader",
          title: "Repair the projection loader",
          class: "request",
          actor: "self",
          confidence: 0.9,
        }], calls),
      });
      assert.equal(calls.length, 1);
      assert.equal(
        calls[0]!.stationId,
        TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
      );
      const throwingStation: LlmStation = {
        provider: {
          transport: "gemini-remote",
          executable: "must-not-run",
          args: [],
          model: "must-not-run",
        },
        async run() {
          throw new Error("station must not be consulted on replay");
        },
      };
      const replay = await digestTaskMapCommunityRootTasks({
        rootEvidence,
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: throwingStation,
      });
      assert.equal(
        taskMapContractCanonicalJson(replay),
        taskMapContractCanonicalJson(first),
      );
      const offline = await digestTaskMapCommunityRootTasks({
        rootEvidence,
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: null,
      });
      assert.equal(
        taskMapContractCanonicalJson(offline),
        taskMapContractCanonicalJson(first),
      );
    } finally {
      await f.cleanup();
    }
  });

  it("degrades to zero tasks without inventing placeholders when no station and no envelope exist", async () => {
    const f = await fixture();
    try {
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([{
          proposalId: "graph-root-gggg",
          evidence: [{
            id: "event-degraded",
            title: "Unreachable work",
            summary: "Unreachable work body.",
          }],
        }]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: null,
      });
      const row = onlyRoot(digestion);
      assert.equal(row.status, "degraded");
      assert.equal(row.degradationCode, "no_provider");
      assert.deepEqual(row.tasks, []);
      assert.equal(digestion.degradedRootCount, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("marks a root degraded when the station returns spans outside the body", async () => {
    const f = await fixture();
    try {
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([{
          proposalId: "graph-root-hhhh",
          evidence: [{
            id: "event-invalid",
            title: "Real directive",
            summary: "Real directive body.",
          }],
        }]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [{
          text: "fabricated span that never appeared",
          title: "Reject the fabricated span",
          class: "request",
          actor: "self",
          confidence: 0.9,
        }]),
      });
      const row = onlyRoot(digestion);
      assert.equal(row.status, "degraded");
      assert.equal(row.degradationCode, "invalid_extraction_output");
      assert.deepEqual(row.tasks, []);
    } finally {
      await f.cleanup();
    }
  });

  it("retries and atomically heals a persisted taskless community envelope", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-poisoned-community",
        title: "Recover poisoned community envelope",
        summary: "Recover poisoned community envelope after provider recovery.",
      }];
      const rootEvidence = rootEvidenceFixture([{
        proposalId: "graph-root-poisoned-community",
        evidence,
      }]);
      const body = taskMapCommunityTaskExtractionBody(evidence.map((row) => ({
        evidenceEventId: row.id,
        matchText: `${row.title}\n${row.summary}`,
        summary: row.summary,
      })));
      const rendered = renderTaskMapCommunityTaskExtractionPrompt(
        TEMPLATE,
        body,
      );
      const envelopePath = taskMapCommunityTaskExtractionEnvelopePath(
        f.taskMapRoot,
        rendered.inputDigest,
      );
      await mkdir(path.dirname(envelopePath), { recursive: true, mode: 0o700 });
      await writeFile(envelopePath, taskMapContractCanonicalJson({
        stationId: TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
        model: "persisted-taskless-community-fixture",
        promptDigest: rendered.promptDigest,
        inputDigest: rendered.inputDigest,
        outputJson: JSON.stringify({ mentions: [{
          text: "Recover poisoned community envelope",
          title: "Ambient poisoned envelope context",
          class: "other",
          actor: "unknown",
          confidence: 0.9,
        }] }),
        producedAt: PRODUCED_AT,
        transport: "gemini-remote",
      }), { mode: 0o600 });
      const poisonedBytes = await readFile(envelopePath);

      const recoveryCalls: LlmStationRequest[] = [];
      const recovered = await digestTaskMapCommunityRootTasks({
        rootEvidence,
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [{
          text: "Recover poisoned community envelope",
          title: "Recover poisoned community envelope",
          class: "request",
          actor: "self",
          confidence: 0.95,
        }], recoveryCalls),
      });
      assert.equal(recoveryCalls.length, 1);
      assert.equal(onlyRoot(recovered).status, "digested");
      assert.deepEqual(onlyRoot(recovered).tasks[0]?.evidenceEventIds, [
        "event-poisoned-community",
      ]);
      const healedBytes = await readFile(envelopePath);
      assert.notDeepEqual(healedBytes, poisonedBytes);

      const replayed = await digestTaskMapCommunityRootTasks({
        rootEvidence,
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: null,
      });
      assert.equal(
        taskMapContractCanonicalJson(replayed),
        taskMapContractCanonicalJson(recovered),
      );
      assert.deepEqual(await readFile(envelopePath), healedBytes);
    } finally {
      await f.cleanup();
    }
  });

  it("does not persist a taskless community extraction", async () => {
    const f = await fixture();
    try {
      const evidence = [{
        id: "event-nondurable-community",
        title: "Keep taskless output nondurable",
        summary: "Keep taskless output nondurable after validation.",
      }];
      const digestion = await digestTaskMapCommunityRootTasks({
        rootEvidence: rootEvidenceFixture([{
          proposalId: "graph-root-nondurable-community",
          evidence,
        }]),
        taskMapRoot: f.taskMapRoot,
        promptTemplatePath: f.promptTemplatePath,
        station: station(() => [{
          text: "Keep taskless output nondurable",
          title: "Ambient taskless context",
          class: "other",
          actor: "unknown",
          confidence: 0.9,
        }]),
      });
      assert.equal(onlyRoot(digestion).status, "degraded");
      const body = taskMapCommunityTaskExtractionBody(evidence.map((row) => ({
        evidenceEventId: row.id,
        matchText: `${row.title}\n${row.summary}`,
        summary: row.summary,
      })));
      const rendered = renderTaskMapCommunityTaskExtractionPrompt(
        TEMPLATE,
        body,
      );
      await assert.rejects(
        lstat(taskMapCommunityTaskExtractionEnvelopePath(
          f.taskMapRoot,
          rendered.inputDigest,
        )),
        (error: unknown) =>
          (error as NodeJS.ErrnoException).code === "ENOENT",
        "a taskless community extraction must not become durable replay authority",
      );
    } finally {
      await f.cleanup();
    }
  });
});
