import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  adjudicateTaskMapIdentityPairs,
  type AdjudicateTaskMapIdentityPairsInputV1,
  buildTaskMapIdentityAdjudicationProposals as buildTaskMapIdentityAdjudicationProposalsWithModel,
  type BuildTaskMapIdentityAdjudicationProposalsInputV1,
  TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1,
  TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1,
  TASKMAP_IDENTITY_ADJUDICATION_VERSION,
} from "../src/engine/taskmap/identity-adjudication-proposal.js";
import {
  createLlmStation,
  LLM_STATION_ID,
  LLM_STATION_IDS,
  type LlmProviderId,
  type LlmStationRequest,
} from "../src/engine/taskmap/llm-station.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";

function paddedVector(values: number[]): number[] {
  assert.ok(
    values.length <= TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions,
  );
  return [
    ...values,
    ...Array(
      TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.embeddingDimensions
        - values.length,
    ).fill(0),
  ];
}

function fixedProvider(vectors: Record<string, number[]>) {
  return {
    embed: async (texts: string[]) => texts.map((text) => {
      const vector = vectors[text];
      if (vector === undefined) throw new Error(`no fixture vector: ${text}`);
      return paddedVector(vector);
    }),
  };
}

function buildTaskMapIdentityAdjudicationProposals(
  input: Omit<BuildTaskMapIdentityAdjudicationProposalsInputV1, "embeddingModelId">,
) {
  return buildTaskMapIdentityAdjudicationProposalsWithModel({
    ...input,
    embeddingModelId: "fixture-embedding-v1",
  });
}

describe("Task Map Station-2 blocking", () => {
  it("publishes the frozen version, limits, and embedding policy", () => {
    assert.equal(
      TASKMAP_IDENTITY_ADJUDICATION_VERSION,
      "taskmap-identity-adjudication.v1",
    );
    assert.deepEqual(TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1, {
      maxCandidates: 512,
      maxPairs: 2_048,
      maxTextCharacters: 512,
    });
    assert.equal(Object.isFrozen(TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1), true);
    assert.deepEqual(TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1, {
      blockThreshold: 0.82,
      autoBand: 0.95,
      embeddingDimensions: 768,
      similarity: "cosine_dot_product_l2_normalized",
    });
    assert.equal(Object.isFrozen(TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1), true);
  });

  it("proposes only same-root pairs at or above the threshold and never merges", async () => {
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "a", rootId: "r1", text: "ship the billing fix" },
        { candidateId: "b", rootId: "r1", text: "ship billing fix" },
        { candidateId: "c", rootId: "r1", text: "write the launch post" },
        { candidateId: "d", rootId: "r1", text: "slightly similar billing" },
      ],
      embeddingProvider: fixedProvider({
        "ship the billing fix": [2, 0],
        "ship billing fix": [4, 0],
        "write the launch post": [0, 3],
        "slightly similar billing": [0.81, Math.sqrt(1 - 0.81 ** 2)],
      }),
      inputDigest: "a".repeat(64),
    });

    assert.equal(result.blockingState, "current");
    assert.equal(result.unavailableReason, null);
    assert.equal(result.pairs.length, 1);
    assert.deepEqual(result.pairs[0], {
      pairId: result.pairs[0]!.pairId,
      leftCandidateId: "a",
      rightCandidateId: "b",
      rootId: "r1",
      similarity: 1,
      confidence: "high",
    });
    assert.match(result.pairs[0]!.pairId, /^tmidentitypair_[a-f0-9]{64}$/);
    assert.equal(result.authority.mergeApplied, false);
    assert.equal(result.authority.aliasesWritten, false);
    assert.equal(result.authority.requiresOwnerAcceptance, true);
    assert.equal(result.embeddingModelId, "fixture-embedding-v1");
    assert.deepEqual(
      (result as unknown as {
        evidenceManifest: Array<{
          candidateId: string;
          rootId: string;
          textDigest: string;
        }>;
      }).evidenceManifest,
      [
        {
          candidateId: "a",
          rootId: "r1",
          textDigest: taskMapContractDigest("ship the billing fix"),
        },
        {
          candidateId: "b",
          rootId: "r1",
          textDigest: taskMapContractDigest("ship billing fix"),
        },
        {
          candidateId: "c",
          rootId: "r1",
          textDigest: taskMapContractDigest("write the launch post"),
        },
        {
          candidateId: "d",
          rootId: "r1",
          textDigest: taskMapContractDigest("slightly similar billing"),
        },
      ],
    );
    assert.deepEqual(result.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    });
  });

  it("is order-independent and normalizes each pair to sorted candidate ids", async () => {
    const vectors = {
      "alpha task": [1, 0],
      "alpha task copy": [0.99, 0.141],
    };
    const forward = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "x", rootId: "r1", text: "alpha task" },
        { candidateId: "y", rootId: "r1", text: "alpha task copy" },
      ],
      embeddingProvider: fixedProvider(vectors),
      inputDigest: "b".repeat(64),
    });
    const reversed = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "y", rootId: "r1", text: "alpha task copy" },
        { candidateId: "x", rootId: "r1", text: "alpha task" },
      ],
      embeddingProvider: fixedProvider(vectors),
      inputDigest: "b".repeat(64),
    });

    assert.equal(forward.artifactDigest, reversed.artifactDigest);
    assert.deepEqual(
      [forward.pairs[0]!.leftCandidateId, forward.pairs[0]!.rightCandidateId],
      ["x", "y"],
    );
    assert.equal(forward.pairs[0]!.confidence, "high");
  });

  it("emits zero pairs and an explicit sealed state when embeddings are unavailable", async () => {
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "a", rootId: "r1", text: "one" },
        { candidateId: "b", rootId: "r1", text: "two" },
      ],
      embeddingProvider: {
        embed: async () => { throw new Error("network down"); },
      },
      inputDigest: "c".repeat(64),
    });

    assert.equal(result.blockingState, "unavailable");
    assert.deepEqual(result.pairs, []);
    assert.deepEqual(result.crossRootFlagged, []);
    assert.equal(result.unavailableReason, "embedding_provider_failed");
    assert.deepEqual(result.evidenceManifest, [
      {
        candidateId: "a",
        rootId: "r1",
        textDigest: taskMapContractDigest("one"),
      },
      {
        candidateId: "b",
        rootId: "r1",
        textDigest: taskMapContractDigest("two"),
      },
    ]);
    assert.match(result.artifactDigest, /^[a-f0-9]{64}$/);
  });

  it("flags cross-root pairs instead of proposing them", async () => {
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "z", rootId: "r2", text: "same words" },
        { candidateId: "a", rootId: "r1", text: "same words" },
      ],
      embeddingProvider: fixedProvider({ "same words": [1, 0] }),
      inputDigest: "d".repeat(64),
    });

    assert.deepEqual(result.pairs, []);
    assert.equal(result.crossRootFlagged.length, 1);
    assert.deepEqual(
      [
        result.crossRootFlagged[0]!.leftCandidateId,
        result.crossRootFlagged[0]!.rightCandidateId,
      ],
      ["a", "z"],
    );
  });

  it("sorts proposal output by normalized candidate pair", async () => {
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "c", rootId: "r1", text: "copy c" },
        { candidateId: "a", rootId: "r1", text: "copy a" },
        { candidateId: "b", rootId: "r1", text: "copy b" },
      ],
      embeddingProvider: fixedProvider({
        "copy a": [1, 0],
        "copy b": [1, 0],
        "copy c": [1, 0],
      }),
      inputDigest: "1".repeat(64),
    });

    assert.deepEqual(
      result.pairs.map((pair) => [
        pair.leftCandidateId,
        pair.rightCandidateId,
      ]),
      [["a", "b"], ["a", "c"], ["b", "c"]],
    );
  });

  it("accepts an EmbeddingProvider implemented as a class instance", async () => {
    class FixtureProvider {
      async embed(texts: string[]): Promise<number[][]> {
        return texts.map(() => paddedVector([1, 0]));
      }
    }
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "a", rootId: "r1", text: "one" },
        { candidateId: "b", rootId: "r1", text: "two" },
      ],
      embeddingProvider: new FixtureProvider(),
      inputDigest: "2".repeat(64),
    });

    assert.equal(result.blockingState, "current");
    assert.equal(result.pairs.length, 1);
  });

  it("fails closed when a provider returns vectors outside the frozen width", async () => {
    const result = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "a", rootId: "r1", text: "one" },
        { candidateId: "b", rootId: "r1", text: "two" },
      ],
      embeddingProvider: {
        embed: async (texts: string[]) => texts.map(() => [1, 0]),
      },
      inputDigest: "3".repeat(64),
    });

    assert.equal(result.blockingState, "unavailable");
    assert.equal(result.unavailableReason, "embedding_provider_failed");
    assert.deepEqual(result.pairs, []);
    assert.deepEqual(result.crossRootFlagged, []);
    assert.match(result.artifactDigest, /^[a-f0-9]{64}$/);
  });

  it("applies the block and confidence thresholds at their exact boundaries", async () => {
    const cases = [
      {
        similarity: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.blockThreshold,
        confidence: "ambiguous" as const,
        inputDigest: "4".repeat(64),
      },
      {
        similarity: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand,
        confidence: "high" as const,
        inputDigest: "5".repeat(64),
      },
      {
        similarity: TASKMAP_IDENTITY_ADJUDICATION_POLICY_V1.autoBand - 0.000_001,
        confidence: "ambiguous" as const,
        inputDigest: "6".repeat(64),
      },
    ];

    for (const boundary of cases) {
      const result = await buildTaskMapIdentityAdjudicationProposals({
        candidates: [
          { candidateId: "a", rootId: "r1", text: "baseline" },
          { candidateId: "b", rootId: "r1", text: "boundary" },
        ],
        embeddingProvider: fixedProvider({
          baseline: [1, 0],
          boundary: [
            boundary.similarity,
            Math.sqrt(1 - boundary.similarity ** 2),
          ],
        }),
        inputDigest: boundary.inputDigest,
      });

      assert.equal(result.pairs.length, 1);
      assert.equal(result.pairs[0]!.similarity, boundary.similarity);
      assert.equal(result.pairs[0]!.confidence, boundary.confidence);
    }
  });

  it("seals malformed provider output as unavailable", async () => {
    const valid = paddedVector([1, 0]);
    const malformedProviders = [
      { embed: async () => [valid] },
      { embed: async () => [valid, [1, 0]] },
      { embed: async () => [valid, paddedVector([Number.NaN, 0])] },
      { embed: async () => [valid, paddedVector([0, 0])] },
    ];

    for (let index = 0; index < malformedProviders.length; index += 1) {
      const result = await buildTaskMapIdentityAdjudicationProposals({
        candidates: [
          { candidateId: "a", rootId: "r1", text: "one" },
          { candidateId: "b", rootId: "r1", text: "two" },
        ],
        embeddingProvider: malformedProviders[index]!,
        inputDigest: (index + 7).toString(16).repeat(64),
      });

      assert.equal(result.blockingState, "unavailable");
      assert.equal(result.unavailableReason, "embedding_provider_failed");
      assert.deepEqual(result.pairs, []);
      assert.deepEqual(result.crossRootFlagged, []);
      assert.match(result.artifactDigest, /^[a-f0-9]{64}$/);
    }
  });

  it("validates bounded input before calling the embedding provider", async () => {
    let providerCalls = 0;
    const provider = {
      embed: async (_texts: string[]) => {
        providerCalls += 1;
        return [];
      },
    };
    const tooMany = Array.from(
      { length: TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxCandidates + 1 },
      (_unused, index) => ({
        candidateId: `c${index}`, rootId: "r1", text: `t${index}`,
      }),
    );

    await assert.rejects(
      () => buildTaskMapIdentityAdjudicationProposals({
        candidates: tooMany,
        embeddingProvider: provider,
        inputDigest: "e".repeat(64),
      }),
      /bounded/,
    );
    await assert.rejects(
      () => buildTaskMapIdentityAdjudicationProposals({
        candidates: [{
          candidateId: "a",
          rootId: "r1",
          text: "x".repeat(
            TASKMAP_IDENTITY_ADJUDICATION_LIMITS_V1.maxTextCharacters + 1,
          ),
        }],
        embeddingProvider: provider,
        inputDigest: "f".repeat(64),
      }),
      /bounded/,
    );
    assert.equal(providerCalls, 0);
  });

  it("requires explicit bounded embedding-model provenance before calling the provider", async () => {
    let providerCalls = 0;
    const base = {
      candidates: [{ candidateId: "a", rootId: "r1", text: "one" }],
      embeddingProvider: {
        embed: async () => {
          providerCalls += 1;
          return [paddedVector([1, 0])];
        },
      },
      inputDigest: "9".repeat(64),
    };

    await assert.rejects(
      () => buildTaskMapIdentityAdjudicationProposalsWithModel({
        ...base,
      } as unknown as BuildTaskMapIdentityAdjudicationProposalsInputV1),
      /embedding model/i,
    );
    await assert.rejects(
      () => buildTaskMapIdentityAdjudicationProposalsWithModel({
        ...base,
        embeddingModelId: "bad\nmodel",
      }),
      /embedding model/i,
    );
    assert.equal(providerCalls, 0);
  });
});

async function adjudicationFixture(confidence: "ambiguous" | "high" = "ambiguous") {
  const similarity = confidence === "ambiguous" ? 0.9 : 1;
  const candidates = [
    { candidateId: "a", rootId: "r1", text: "ship the billing fix" },
    { candidateId: "b", rootId: "r1", text: "finish billing correction" },
  ] as const;
  const proposals = await buildTaskMapIdentityAdjudicationProposals({
    candidates,
    embeddingProvider: fixedProvider({
      "ship the billing fix": [1, 0],
      "finish billing correction": [
        similarity,
        Math.sqrt(1 - similarity ** 2),
      ],
    }),
    inputDigest: (confidence === "ambiguous" ? "a" : "b").repeat(64),
  });
  assert.equal(proposals.pairs[0]!.confidence, confidence);
  const candidateEvidence = candidates.map(({ candidateId, text }) => ({
    candidateId,
    text,
  }));
  return { candidateEvidence, proposals, pairId: proposals.pairs[0]!.pairId };
}

describe("Task Map Station-2 adjudication", () => {
  it("publishes all bounded station ids without changing the Station-1 literal", () => {
    assert.equal(LLM_STATION_ID, "mention-extraction-v1");
    assert.deepEqual(LLM_STATION_IDS, [
      "mention-extraction-v1",
      "identity-adjudication-v1",
      "task-decomposition-v1",
      "community-grouping-v1",
      "community-title-v1",
      "community-task-extraction-v1",
    ]);
    assert.equal(Object.isFrozen(LLM_STATION_IDS), true);
  });

  it("runs identity-adjudication-v1 through the generalized fixed-provider station", async () => {
    let calls = 0;
    const station = await createLlmStation({
      order: ["claude-cli"],
      ownerHome: "/Users/owner",
      pathEnv: "",
      isExecutable: (candidate) =>
        candidate === "/Users/owner/.local/bin/claude",
      runner: async () => {
        calls += 1;
        return calls === 1
          ? { stdout: JSON.stringify({ loggedIn: true }), stderr: "", exitCode: 0 }
          : {
              stdout: JSON.stringify({
                type: "result",
                subtype: "success",
                result: JSON.stringify({ verdicts: [] }),
              }),
              stderr: "",
              exitCode: 0,
            };
      },
      clock: () => new Date("2026-08-14T12:00:00.000Z"),
    });

    const envelope = await station.run({
      stationId: "identity-adjudication-v1",
      promptText: "bounded prompt",
      inputDigest: "8".repeat(64),
    });

    assert.equal(calls, 2);
    assert.equal(envelope.stationId, "identity-adjudication-v1");
    assert.equal(envelope.promptDigest, taskMapContractDigest("bounded prompt"));
  });

  it("adjudicates ambiguous pairs to same_work and still never merges automatically", async () => {
    const fixture = await adjudicationFixture();
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      llmModelId: "fixture-offline-llm-v1",
      runner: async () => ({
        stdout: JSON.stringify({
          verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
        }),
        stderr: "",
        exitCode: 0,
      }),
    });

    assert.equal(result.pairs[0]!.adjudication, "same_work");
    assert.equal(result.pairs[0]!.adjudicationSource, "llm_identity_adjudication");
    assert.equal(result.mergeCandidates.length, 1);
    assert.equal(result.authority.mergeApplied, false);
    assert.equal(result.authority.aliasesWritten, false);
    assert.equal(result.authority.requiresOwnerAcceptance, true);
    assert.deepEqual(result.embedding, {
      modelId: "fixture-embedding-v1",
      dimensions: 768,
      similarity: "cosine_dot_product_l2_normalized",
      blockThreshold: 0.82,
      autoBand: 0.95,
    });
    assert.deepEqual(result.llm, {
      invocationState: "invoked",
      stationId: "identity-adjudication-v1",
      modelId: "fixture-offline-llm-v1",
      transport: "injected-offline",
      promptDigest: result.llm.promptDigest,
    });
  });

  it("uses a high-level station request and records its real model provenance", async () => {
    const fixture = await adjudicationFixture();
    let stationRequest: LlmStationRequest | undefined;
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      station: {
        provider: {
          transport: "claude-cli",
          executable: "/fixture/claude",
          args: [],
          model: "configured-model",
        },
        run: async (request) => {
          stationRequest = request;
          return {
            stationId: "identity-adjudication-v1",
            model: "real-station-model-v1",
            promptDigest: taskMapContractDigest(request.promptText),
            inputDigest: request.inputDigest,
            outputJson: JSON.stringify({
              verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
            }),
            producedAt: "2026-08-14T12:00:00.000Z",
            transport: "claude-cli",
          };
        },
      },
    });

    assert.equal(stationRequest?.stationId, "identity-adjudication-v1");
    assert.equal(stationRequest?.inputDigest, fixture.proposals.inputDigest);
    assert.match(stationRequest?.promptText ?? "", /ship the billing fix/);
    assert.deepEqual(result.llm, {
      invocationState: "invoked",
      stationId: "identity-adjudication-v1",
      modelId: "real-station-model-v1",
      transport: "claude-cli",
      promptDigest: taskMapContractDigest(stationRequest?.promptText ?? ""),
    });
  });

  it("accepts matching gemini-remote metadata deterministically", async () => {
    const fixture = await adjudicationFixture();
    const station = {
      provider: {
        transport: "gemini-remote" as const,
        executable: "",
        args: [] as const,
        model: "gemini-remote",
      },
      run: async (request: LlmStationRequest) => ({
        stationId: "identity-adjudication-v1" as const,
        model: "gemini-fixture",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: ' {"verdicts":[{"pairId":"' + fixture.pairId
          + '","verdict":"same_work"}]} ',
        producedAt: "2026-08-14T12:00:00.000Z",
        transport: "gemini-remote" as const,
      }),
    };
    const run = () => adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      station,
    });

    const first = await run();
    const replayed = await run();
    assert.equal(first.pairs[0]?.adjudication, "same_work");
    assert.equal(first.llm.transport, "gemini-remote");
    assert.equal(first.llm.modelId, "gemini-fixture");
    assert.deepEqual(replayed, first);
  });

  it("keeps unknown station transports invalid for live identity adjudication", async () => {
    const fixture = await adjudicationFixture();
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      station: {
        provider: {
          transport: "local-rules" as unknown as LlmProviderId,
          executable: "builtin",
          args: [],
          model: "local-rules-v1",
        },
        run: async (request) => ({
          stationId: "identity-adjudication-v1",
          model: "local-rules-v1",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify({ verdicts: [] }),
          producedAt: "2026-08-14T12:00:00.000Z",
          transport: "local-rules" as unknown as LlmProviderId,
        }),
      },
    });
    assert.equal(result.llm.invocationState, "unavailable");
    assert.equal(result.llm.transport, null);
  });

  it("defers ambiguous pairs when a station envelope does not match the request", async () => {
    const fixture = await adjudicationFixture();
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      station: {
        provider: {
          transport: "codex-cli",
          executable: "/fixture/codex",
          args: [],
          model: "configured-model",
        },
        run: async (request) => ({
          stationId: "identity-adjudication-v1",
          model: "real-station-model-v1",
          promptDigest: "0".repeat(64),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify({
            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
          }),
          producedAt: "2026-08-14T12:00:00.000Z",
          transport: "codex-cli",
        }),
      },
    });

    assert.equal(result.pairs[0]!.adjudication, "deferred");
    assert.equal(result.llm.invocationState, "unavailable");
    assert.equal(result.llm.modelId, null);
    assert.equal(result.llm.transport, null);
  });

  it("defers when envelope transport disagrees with the selected station provider", async () => {
    const fixture = await adjudicationFixture();
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      station: {
        provider: {
          transport: "claude-cli",
          executable: "/fixture/claude",
          args: [],
          model: "configured-model",
        },
        run: async (request) => ({
          stationId: "identity-adjudication-v1",
          model: "returned-model",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: JSON.stringify({
            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
          }),
          producedAt: "2026-08-14T12:00:00.000Z",
          transport: "codex-cli",
        }),
      },
    });

    assert.equal(result.pairs[0]!.adjudication, "deferred");
    assert.equal(result.llm.invocationState, "unavailable");
    assert.equal(result.llm.transport, null);
    assert.doesNotMatch(JSON.stringify(result), /"transport":"codex-cli"/);
  });

  it("defers station envelopes with malformed or non-real producedAt values", async () => {
    const fixture = await adjudicationFixture();
    for (const producedAt of [
      "not-a-timestamp",
      "2026-08-14T12:00:00+99:00",
      "2026-02-31T12:00:00.000Z",
    ]) {
      const result = await adjudicateTaskMapIdentityPairs({
        proposals: fixture.proposals,
        candidateEvidence: fixture.candidateEvidence,
        station: {
          provider: {
            transport: "claude-cli",
            executable: "/fixture/claude",
            args: [],
            model: "configured-model",
          },
          run: async (request) => ({
            stationId: "identity-adjudication-v1",
            model: "returned-model",
            promptDigest: taskMapContractDigest(request.promptText),
            inputDigest: request.inputDigest,
            outputJson: JSON.stringify({
              verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
            }),
            producedAt,
            transport: "claude-cli",
          }),
        },
      });

      assert.equal(result.pairs[0]!.adjudication, "deferred");
      assert.equal(result.llm.invocationState, "unavailable");
      assert.equal(result.llm.modelId, null);
    }
  });

  it("requires exactly one station seam and explicit offline model provenance", async () => {
    const fixture = await adjudicationFixture();
    let runnerCalls = 0;
    const runner = async () => {
      runnerCalls += 1;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const station = {
      provider: {
        transport: "claude-cli" as const,
        executable: "/fixture/claude",
        args: [] as const,
        model: "configured-model",
      },
      run: async () => { throw new Error("not reached"); },
    };

    for (const invalid of [
      {
        proposals: fixture.proposals,
        candidateEvidence: fixture.candidateEvidence,
        station,
        runner,
        llmModelId: "offline-model",
      },
      {
        proposals: fixture.proposals,
        candidateEvidence: fixture.candidateEvidence,
        runner,
      },
      {
        proposals: fixture.proposals,
        candidateEvidence: fixture.candidateEvidence,
        runner: "not-a-runner",
        llmModelId: "offline-model",
      },
    ]) {
      await assert.rejects(
        () => adjudicateTaskMapIdentityPairs(
          invalid as unknown as AdjudicateTaskMapIdentityPairsInputV1,
        ),
        /station.*runner|runner seam|model provenance/i,
      );
    }
    assert.equal(runnerCalls, 0);
  });

  it("rejects a re-sealed proposal whose derived pair, policy, and authority were forged", async () => {
    const similarity = 0.83;
    const original = await buildTaskMapIdentityAdjudicationProposals({
      candidates: [
        { candidateId: "a", rootId: "r1", text: "original alpha" },
        { candidateId: "b", rootId: "r1", text: "original beta" },
      ],
      embeddingProvider: fixedProvider({
        "original alpha": [1, 0],
        "original beta": [similarity, Math.sqrt(1 - similarity ** 2)],
      }),
      inputDigest: "7".repeat(64),
    });
    assert.equal(original.pairs[0]!.confidence, "ambiguous");
    const { artifactDigest: _artifactDigest, ...base } = original;
    const forgedBase = {
      ...base,
      policy: { ...base.policy, autoBand: 0.82 },
      pairs: base.pairs.map((pair) => ({
        ...pair,
        pairId: "attacker_pair_id",
        confidence: "high" as const,
      })),
      authority: {
        mergeApplied: true,
        aliasesWritten: true,
        requiresOwnerAcceptance: false,
      },
    };
    const forged = {
      ...forgedBase,
      artifactDigest: taskMapContractDigest(forgedBase),
    };
    let runnerCalls = 0;

    await assert.rejects(
      () => adjudicateTaskMapIdentityPairs({
        proposals: forged as unknown as typeof original,
        candidateEvidence: [
          { candidateId: "a", text: "original alpha" },
          { candidateId: "b", text: "original beta" },
        ],
        llmModelId: "fixture-offline-llm-v1",
        runner: async () => {
          runnerCalls += 1;
          return { stdout: "", stderr: "", exitCode: 0 };
        },
      }),
      /proposal|policy|authority/i,
    );
    assert.equal(runnerCalls, 0);
  });

  it("defers before the runner when candidate evidence is substituted", async () => {
    const fixture = await adjudicationFixture();
    let runnerCalls = 0;
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: [
        { candidateId: "a", text: "substituted attacker text" },
        { candidateId: "b", text: "finish billing correction" },
      ],
      llmModelId: "fixture-offline-llm-v1",
      runner: async () => {
        runnerCalls += 1;
        return {
          stdout: JSON.stringify({
            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    });

    assert.equal(runnerCalls, 0);
    assert.equal(result.pairs[0]!.adjudication, "deferred");
    assert.equal(result.pairs[0]!.deferredReason, "llm_station_unavailable");
    assert.deepEqual(result.mergeCandidates, []);
  });

  it("does not send high-confidence pairs to the LLM and keeps them owner-gated", async () => {
    const fixture = await adjudicationFixture("high");
    let runnerCalls = 0;
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      llmModelId: "fixture-offline-llm-v1",
      runner: async () => {
        runnerCalls += 1;
        throw new Error("high-confidence pairs must not reach the runner");
      },
    });

    assert.equal(runnerCalls, 0);
    assert.equal(result.pairs[0]!.adjudication, "same_work");
    assert.equal(result.pairs[0]!.adjudicationSource, "embedding_high_confidence");
    assert.equal(result.mergeCandidates.length, 1);
    assert.equal(result.authority.mergeApplied, false);
    assert.equal(result.authority.requiresOwnerAcceptance, true);
    assert.deepEqual(result.llm, {
      invocationState: "not_invoked",
      stationId: "identity-adjudication-v1",
      modelId: null,
      transport: null,
      promptDigest: null,
    });
  });

  it("defers, not guesses, when the injected runner throws", async () => {
    const fixture = await adjudicationFixture();
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      llmModelId: "fixture-offline-llm-v1",
      runner: async () => { throw new Error("no provider"); },
    });

    assert.equal(result.pairs[0]!.adjudication, "deferred");
    assert.equal(result.pairs[0]!.deferredReason, "llm_station_unavailable");
    assert.equal(result.mergeCandidates.length, 0);
  });

  it("replays identical runner output to a byte-identical sealed artifact", async () => {
    const fixture = await adjudicationFixture();
    const recorded = async () => ({
      stdout: JSON.stringify({
        verdicts: [{ pairId: fixture.pairId, verdict: "different_work" }],
      }),
      stderr: "",
      exitCode: 0,
    });

    const once = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      llmModelId: "fixture-offline-llm-v1",
      runner: recorded,
    });
    const twice = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      llmModelId: "fixture-offline-llm-v1",
      runner: recorded,
    });

    assert.equal(once.artifactDigest, twice.artifactDigest);
    assert.deepEqual(once, twice);
  });

  it("fails closed for malformed, duplicate-key, unknown-pair, and missing verdict output", async () => {
    const fixture = await adjudicationFixture();
    const invalidOutputs = [
      "not json",
      `{"verdicts":[{"pairId":"${fixture.pairId}","verdict":"same_work","verdict":"different_work"}]}`,
      JSON.stringify({
        verdicts: [{ pairId: "unknown_pair", verdict: "same_work" }],
      }),
      JSON.stringify({ verdicts: [] }),
    ];

    for (const stdout of invalidOutputs) {
      const result = await adjudicateTaskMapIdentityPairs({
        proposals: fixture.proposals,
        candidateEvidence: fixture.candidateEvidence,
        llmModelId: "fixture-offline-llm-v1",
        runner: async () => ({ stdout, stderr: "", exitCode: 0 }),
      });
      assert.equal(result.pairs[0]!.adjudication, "deferred");
      assert.equal(result.pairs[0]!.deferredReason, "llm_station_unavailable");
      assert.deepEqual(result.mergeCandidates, []);
    }
  });

  it("builds a bounded evidence-carrying prompt without persisting candidate text", async () => {
    const fixture = await adjudicationFixture();
    let prompt = "";
    const result = await adjudicateTaskMapIdentityPairs({
      proposals: fixture.proposals,
      candidateEvidence: fixture.candidateEvidence,
      llmModelId: "fixture-offline-llm-v1",
      runner: async (request) => {
        prompt = request.stdin;
        return {
          stdout: JSON.stringify({
            verdicts: [{ pairId: fixture.pairId, verdict: "same_work" }],
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    });

    assert.match(prompt, /ship the billing fix/);
    assert.match(prompt, /finish billing correction/);
    assert.match(prompt, new RegExp(fixture.pairId));
    assert.ok(prompt.length > 0 && prompt.length <= 1_048_576);
    const persisted = JSON.stringify(result);
    assert.doesNotMatch(persisted, /ship the billing fix/);
    assert.doesNotMatch(persisted, /finish billing correction/);
    assert.equal(result.privacy.sourceBodiesStored, false);
  });

  it("rejects an off-contract proposal pair instead of copying injected source text", async () => {
    const fixture = await adjudicationFixture();
    const { artifactDigest: _artifactDigest, ...base } = fixture.proposals;
    const forgedBase = {
      ...base,
      pairs: base.pairs.map((pair) => ({ ...pair, text: "private source body" })),
    };
    const forged = {
      ...forgedBase,
      artifactDigest: taskMapContractDigest(forgedBase),
    };

    await assert.rejects(
      () => adjudicateTaskMapIdentityPairs({
        proposals: forged,
        candidateEvidence: fixture.candidateEvidence,
        llmModelId: "fixture-offline-llm-v1",
        runner: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      }),
      /keys are invalid/,
    );
  });
});
