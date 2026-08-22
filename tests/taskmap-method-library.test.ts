import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASKMAP_DECOMPOSITION_STATION_ID,
  TASKMAP_METHOD_LIBRARY_LIMITS_V1,
  TASKMAP_METHOD_LIBRARY_VERSION,
  buildTaskMapMethodLibrary,
  proposeTaskMapDecomposition,
  type TaskMapDecompositionReplayRunner,
  type TaskMapDecompositionStation,
  type TaskMapMethodLibraryV1,
} from "../src/engine/taskmap/method-library.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";

const knownItem = () => ({
  taskId: "tmt_release",
  domainSignature: "software.release",
  title: "Release the signed desktop build",
  summary: "Prepare, verify, and publish the accepted release.",
  citationPointerIds: ["session-release"],
});

const unknownItem = () => ({
  ...knownItem(),
  taskId: "tmt_unknown",
  domainSignature: "unknown.specialty",
  title: "Handle a novel specialty workflow",
  summary: "Use bounded evidence to propose one decomposition level.",
});

function seededLibrary() {
  return buildTaskMapMethodLibrary({
    templates: [{
      templateId: "release-checklist-v1",
      domainSignature: "software.release",
      methodId: "verified-release",
      subtasks: [
        { title: "Prepare release candidate", summary: "Create the bounded release candidate." },
        { title: "Verify release candidate", summary: "Run the accepted verification contract." },
      ],
    }],
  });
}

function resealLibrary(
  draft: TaskMapMethodLibraryV1,
): TaskMapMethodLibraryV1 {
  const { artifactDigest: _artifactDigest, ...core } = draft;
  draft.artifactDigest = taskMapContractDigest(core);
  return draft;
}

const fiveProposals = () => ({
  proposals: Array.from({ length: 5 }, (_, index) => ({
    methodId: `novel-method-${index + 1}`,
    subtasks: [{
      title: `Novel step ${index + 1}`,
      summary: `Execute bounded novel step ${index + 1}.`,
      citationPointerIds: ["session-release"],
    }],
  })),
});

const replayRunner = (
  payload: unknown = fiveProposals(),
  onRequest?: (request: unknown) => void,
): TaskMapDecompositionReplayRunner => async (request) => {
  onRequest?.(request);
  return { outputJson: JSON.stringify(payload) };
};

describe("Task Map Station-3 method library", () => {
  it("uses a deterministic sealed library template without invoking an LLM", async () => {
    const library = seededLibrary();
    let calls = 0;
    const result = await proposeTaskMapDecomposition({
      workItem: knownItem(),
      library,
      llmModelId: "offline-replay-v1",
      runner: async () => {
        calls += 1;
        throw new Error("must not be called");
      },
    });

    assert.equal(TASKMAP_METHOD_LIBRARY_VERSION, "taskmap-method-library.v1");
    assert.equal(calls, 0);
    assert.equal(result.source, "method_library");
    assert.equal(result.proposals.length, 1);
    assert.equal(result.llm.invocationState, "not_invoked");
    assert.equal(result.libraryDigest, library.artifactDigest);
    const { artifactDigest, ...core } = result;
    assert.equal(artifactDigest, taskMapContractDigest(core));
    assert.deepEqual(library.authority, {
      edgesWritten: false,
      requiresOwnerAcceptance: true,
    });
    assert.deepEqual(library.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    });
    assert.ok(Object.isFrozen(library));
    assert.ok(Object.isFrozen(library.templates));
  });

  it("caps an offline replay miss at three one-level proposals", async () => {
    let captured: Record<string, unknown> | undefined;
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner(fiveProposals(), (request) => {
        captured = request as Record<string, unknown>;
      }),
    });

    assert.equal(result.source, "llm_station");
    assert.equal(result.proposals.length, 3);
    assert.ok(result.proposals.every((proposal) =>
      proposal.subtasks.every((subtask) => !("subtasks" in subtask))
    ));
    assert.equal(captured?.stationId, TASKMAP_DECOMPOSITION_STATION_ID);
    assert.ok(!("executable" in (captured ?? {})));
    assert.equal(result.llm.modelId, "offline-replay-v1");
    assert.equal(result.llm.providerId, "offline-replay");
    assert.equal(result.llm.transport, "injected-offline");
    assert.match(result.llm.promptDigest ?? "", /^[a-f0-9]{64}$/);
    assert.match(result.llm.inputDigest, /^[a-f0-9]{64}$/);
    assert.match(result.llm.outputDigest ?? "", /^[a-f0-9]{64}$/);
  });

  it("uses the production-compatible high-level station seam with full provenance", async () => {
    let stationCalls = 0;
    class FixtureStation implements TaskMapDecompositionStation {
      readonly provider = {
        transport: "claude-cli",
        executable: "/fixture/claude",
        args: [],
        model: "configured-model",
      } as const;

      async run(request: Parameters<TaskMapDecompositionStation["run"]>[0]) {
        stationCalls += 1;
        return {
          stationId: TASKMAP_DECOMPOSITION_STATION_ID,
          model: "returned-model",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify(fiveProposals()),
          producedAt: "2026-08-14T12:00:00.000Z",
          transport: "claude-cli",
        } as const;
      }
    }
    const station = new FixtureStation();
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      station,
    });

    assert.equal(stationCalls, 1);
    assert.equal(result.proposals.length, 3);
    assert.deepEqual(
      {
        state: result.llm.invocationState,
        stationId: result.llm.stationId,
        model: result.llm.modelId,
        provider: result.llm.providerId,
        transport: result.llm.transport,
      },
      {
        state: "invoked",
        stationId: "task-decomposition-v1",
        model: "returned-model",
        provider: "claude-cli",
        transport: "claude-cli",
      },
    );
  });

  it("accepts and deterministically records matching remote station provenance", async () => {
    const station: TaskMapDecompositionStation = {
      provider: {
        transport: "gemini-remote",
        executable: "",
        args: [],
        model: "gemini-remote",
      },
      run: async (request) => ({
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        model: "gemini-fixture",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: " " + JSON.stringify(fiveProposals()) + " ",
        producedAt: "2026-08-14T12:00:00.000Z",
        transport: "gemini-remote",
      }),
    };
    const run = () => proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      station,
    });

    const first = await run();
    const replayed = await run();
    assert.equal(first.proposals.length, 3);
    assert.equal(first.unavailableReason, null);
    assert.equal(first.llm.providerId, "gemini-remote");
    assert.equal(first.llm.transport, "gemini-remote");
    assert.equal(first.llm.modelId, "gemini-fixture");
    assert.match(first.llm.outputDigest ?? "", /^[a-f0-9]{64}$/);
    assert.deepEqual(replayed, first);
  });

  it("fails closed when a station envelope carries unknown keys", async () => {
    const station: TaskMapDecompositionStation = {
      provider: {
        transport: "claude-cli",
        executable: "/fixture/claude",
        args: [],
        model: "configured-model",
      },
      run: async (request) => ({
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        model: "returned-model",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify(fiveProposals()),
        producedAt: "2026-08-14T12:00:00.000Z",
        transport: "claude-cli",
        localPath: "/forbidden/provider-state",
      }),
    };
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      station,
    });

    assert.deepEqual(result.proposals, []);
    assert.equal(result.unavailableReason, "llm_station_unavailable");
  });

  it("emits typed zero-proposal safe behavior when the LLM is unavailable", async () => {
    for (const providerFailure of [
      new Error("no provider"),
      "provider unavailable",
      { sensitiveProviderState: "must-not-leak" },
    ]) {
      const result = await proposeTaskMapDecomposition({
        workItem: unknownItem(),
        library: seededLibrary(),
        llmModelId: "offline-replay-v1",
        runner: async () => {
          throw providerFailure;
        },
      });

      assert.deepEqual(result.proposals, []);
      assert.equal(result.unavailableReason, "llm_station_unavailable");
      assert.equal(result.llm.invocationState, "unavailable");
      assert.doesNotMatch(JSON.stringify(result), /no provider|provider unavailable|sensitiveProviderState|must-not-leak/);
    }
  });

  it("rejects nested subtasks and malformed exact-key output as typed invalid output", async () => {
    for (const payload of [
      {
        proposals: [{
          methodId: "nested",
          subtasks: [{
            title: "Nested",
            summary: "Must be rejected.",
            citationPointerIds: ["session-release"],
            subtasks: [],
          }],
        }],
      },
      { proposals: [], unexpected: true },
      { proposals: [] },
    ]) {
      const result = await proposeTaskMapDecomposition({
        workItem: unknownItem(),
        library: seededLibrary(),
        llmModelId: "offline-replay-v1",
        runner: replayRunner(payload),
      });
      assert.deepEqual(result.proposals, []);
      assert.equal(result.unavailableReason, "llm_station_invalid_output");
    }
  });

  it("rejects unbounded proposal collections instead of silently truncating them", async () => {
    const payload = {
      proposals: Array.from({ length: 17 }, (_, index) => ({
        methodId: `method-${index}`,
        subtasks: [{
          title: `Step ${index}`,
          summary: "Bounded step.",
          citationPointerIds: ["session-release"],
        }],
      })),
    };
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner(payload),
    });
    assert.deepEqual(result.proposals, []);
    assert.equal(result.unavailableReason, "llm_station_invalid_output");
  });

  it("rejects oversized provider output before recording an output digest", async () => {
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: async () => ({
        outputJson: "x".repeat(TASKMAP_METHOD_LIBRARY_LIMITS_V1.maxOutputBytes + 1),
      }),
    });

    assert.deepEqual(result.proposals, []);
    assert.equal(result.unavailableReason, "llm_station_invalid_output");
    assert.equal(result.llm.outputDigest, null);
  });

  it("validates malformed candidates after the publication cap", async () => {
    const payload = fiveProposals();
    payload.proposals[3]!.subtasks[0] = {
      ...payload.proposals[3]!.subtasks[0]!,
      subtasks: [],
    } as unknown as (typeof payload.proposals)[number]["subtasks"][number];
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner(payload),
    });

    assert.deepEqual(result.proposals, []);
    assert.equal(result.unavailableReason, "llm_station_invalid_output");
  });

  it("fails closed for provider shape and transport forgery", async () => {
    for (const provider of [
      {
        transport: "claude-cli",
        executable: "/fixture/claude",
        args: [],
        model: "configured-model",
        localPath: "/forbidden/provider-state",
      },
      {
        transport: "forged-cli",
        executable: "/fixture/forged",
        args: [],
        model: "configured-model",
      },
      {
        transport: "local-rules",
        executable: "builtin",
        args: [],
        model: "local-rules-v1",
      },
    ]) {
      const station = {
        provider,
        run: async (request: Parameters<TaskMapDecompositionStation["run"]>[0]) => ({
          stationId: TASKMAP_DECOMPOSITION_STATION_ID,
          model: "returned-model",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify(fiveProposals()),
          producedAt: "2026-08-14T12:00:00.000Z",
          transport: provider.transport,
        }),
      } as unknown as TaskMapDecompositionStation;
      const result = await proposeTaskMapDecomposition({
        workItem: unknownItem(),
        library: seededLibrary(),
        station,
      });
      assert.deepEqual(result.proposals, []);
      assert.equal(result.unavailableReason, "llm_station_unavailable");
    }
  });

  it("rejects an impossible calendar date in a station envelope", async () => {
    const station: TaskMapDecompositionStation = {
      provider: {
        transport: "claude-cli",
        executable: "/fixture/claude",
        args: [],
        model: "configured-model",
      },
      run: async (request) => ({
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        model: "returned-model",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify(fiveProposals()),
        producedAt: "2026-02-31T12:00:00.000Z",
        transport: "claude-cli",
      }),
    };
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      station,
    });

    assert.deepEqual(result.proposals, []);
    assert.equal(result.unavailableReason, "llm_station_unavailable");
  });

  it("is deterministic for identical recorded replay output", async () => {
    const input = {
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner(fiveProposals()),
    };
    assert.deepEqual(
      await proposeTaskMapDecomposition(input),
      await proposeTaskMapDecomposition(input),
    );
  });

  it("never grants graph or acceptance authority", async () => {
    const result = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner(),
    });
    assert.deepEqual(result.authority, {
      edgesWritten: false,
      requiresOwnerAcceptance: true,
    });
    assert.ok(result.proposals.every((proposal) => !("edges" in proposal)));
  });

  it("stores no raw input body, prompt, provider output, local path, or biometrics", async () => {
    const item = unknownItem();
    const rawOutput = JSON.stringify(fiveProposals());
    const result = await proposeTaskMapDecomposition({
      workItem: item,
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: async () => ({ outputJson: rawOutput }),
    });
    const serialized = JSON.stringify(result);

    assert.doesNotMatch(serialized, new RegExp(item.title));
    assert.doesNotMatch(serialized, new RegExp(item.summary));
    assert.ok(!serialized.includes(rawOutput));
    assert.deepEqual(result.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    });
    assert.ok(result.proposals[0]!.subtasks[0]!.title.length > 0);
  });

  it("rejects tampered or unbounded libraries and invalid work before any runner call", async () => {
    const tampered = structuredClone(seededLibrary());
    tampered.templates[0]!.domainSignature = "forged";
    let calls = 0;
    for (const fixture of [
      { workItem: knownItem(), library: tampered },
      {
        workItem: { ...knownItem(), title: "x".repeat(257) },
        library: seededLibrary(),
      },
    ]) {
      await assert.rejects(
        () => proposeTaskMapDecomposition({
          workItem: fixture.workItem,
          library: fixture.library,
          llmModelId: "offline-replay-v1",
          runner: async () => {
            calls += 1;
            return { outputJson: "{}" };
          },
        }),
        /library|work item|bounded|invalid/i,
      );
    }
    assert.equal(calls, 0);
  });

  it("rejects re-sealed library authority/privacy tampering before any runner call", async () => {
    const mutations: Array<(draft: TaskMapMethodLibraryV1) => void> = [
      (draft) => {
        (draft.authority as unknown as { edgesWritten: boolean }).edgesWritten = true;
      },
      (draft) => {
        (draft.privacy as unknown as { localPathsStored: boolean }).localPathsStored = true;
      },
      (draft) => {
        (draft.authority as unknown as Record<string, unknown>).unknown = false;
      },
      (draft) => {
        (draft.privacy as unknown as Record<string, unknown>).unknown = false;
      },
    ];
    let calls = 0;
    for (const mutate of mutations) {
      const forged = structuredClone(seededLibrary());
      mutate(forged);
      resealLibrary(forged);
      await assert.rejects(
        () => proposeTaskMapDecomposition({
          workItem: unknownItem(),
          library: forged,
          llmModelId: "offline-replay-v1",
          runner: async () => {
            calls += 1;
            return { outputJson: JSON.stringify(fiveProposals()) };
          },
        }),
        /library|authority|privacy|canonical|keys/i,
      );
    }
    assert.equal(calls, 0);
  });

  it("rejects whitespace-only bounded strings and identifiers", async () => {
    assert.throws(
      () => buildTaskMapMethodLibrary({
        templates: [{
          templateId: " ",
          domainSignature: "software.release",
          methodId: "verified-release",
          subtasks: [{ title: "Prepare", summary: "Prepare the release." }],
        }],
      }),
      /invalid|bounded/i,
    );
    await assert.rejects(
      () => proposeTaskMapDecomposition({
        workItem: { ...knownItem(), taskId: "\t " },
        library: seededLibrary(),
      }),
      /work item|invalid|bounded/i,
    );
    const invalidOutput = await proposeTaskMapDecomposition({
      workItem: unknownItem(),
      library: seededLibrary(),
      llmModelId: "offline-replay-v1",
      runner: replayRunner({
        proposals: [{
          methodId: " ",
          subtasks: [{
            title: "Step",
            summary: "Bounded step.",
            citationPointerIds: ["session-release"],
          }],
        }],
      }),
    });
    assert.deepEqual(invalidOutput.proposals, []);
    assert.equal(invalidOutput.unavailableReason, "llm_station_invalid_output");
  });

  it("rejects identifiers and model provenance with outer whitespace", async () => {
    await assert.rejects(
      () => proposeTaskMapDecomposition({
        workItem: { ...knownItem(), taskId: " padded-task " },
        library: seededLibrary(),
      }),
      /work item|invalid|bounded/i,
    );
    let runnerCalls = 0;
    await assert.rejects(
      () => proposeTaskMapDecomposition({
        workItem: unknownItem(),
        library: seededLibrary(),
        llmModelId: " padded-model ",
        runner: async () => {
          runnerCalls += 1;
          return { outputJson: JSON.stringify(fiveProposals()) };
        },
      }),
      /model|provenance|invalid/i,
    );
    assert.equal(runnerCalls, 0);

    for (const payload of [
      {
        proposals: [{
          methodId: " padded-method ",
          subtasks: [{
            title: "Step",
            summary: "Bounded step.",
            citationPointerIds: ["session-release"],
          }],
        }],
      },
      {
        proposals: [{
          methodId: "method",
          subtasks: [{
            title: "Step",
            summary: "Bounded step.",
            citationPointerIds: [" padded-citation "],
          }],
        }],
      },
    ]) {
      const result = await proposeTaskMapDecomposition({
        workItem: unknownItem(),
        library: seededLibrary(),
        llmModelId: "offline-replay-v1",
        runner: replayRunner(payload),
      });
      assert.deepEqual(result.proposals, []);
      assert.equal(result.unavailableReason, "llm_station_invalid_output");
    }
  });

  it("preserves nonblank human titles and summaries with outer whitespace", async () => {
    const library = buildTaskMapMethodLibrary({
      templates: [{
        templateId: "spaced-content",
        domainSignature: "human.content",
        methodId: "spaced-method",
        subtasks: [{ title: " Padded title ", summary: " Padded summary " }],
      }],
    });
    const result = await proposeTaskMapDecomposition({
      workItem: {
        ...knownItem(),
        domainSignature: "human.content",
        title: " Padded work title ",
        summary: " Padded work summary ",
      },
      library,
    });

    assert.equal(result.proposals[0]!.subtasks[0]!.title, " Padded title ");
    assert.equal(result.proposals[0]!.subtasks[0]!.summary, " Padded summary ");
  });

  it("enforces the library artifact byte ceiling before returning", () => {
    const summary = "x".repeat(1_024);
    assert.throws(
      () => buildTaskMapMethodLibrary({
        templates: Array.from({ length: 128 }, (_, templateIndex) => ({
          templateId: `template-${templateIndex}`,
          domainSignature: `domain.${templateIndex}`,
          methodId: `method-${templateIndex}`,
          subtasks: Array.from({ length: 16 }, (_, subtaskIndex) => ({
            title: `Step ${subtaskIndex}`,
            summary,
          })),
        })),
      }),
      /artifact|bounded|ceiling/i,
    );
  });

  it("rejects duplicate template identities across domain signatures", () => {
    assert.throws(
      () => buildTaskMapMethodLibrary({
        templates: ["one", "two"].map((suffix) => ({
          templateId: "shared-template-id",
          domainSignature: `software.${suffix}`,
          methodId: `method-${suffix}`,
          subtasks: [{ title: `Step ${suffix}`, summary: "Bounded step." }],
        })),
      }),
      /template|unique|repeat/i,
    );
  });
});
