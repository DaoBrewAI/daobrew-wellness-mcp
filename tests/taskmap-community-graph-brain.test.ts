import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1,
  TASKMAP_GRAPH_BRAIN_POLICY_V1,
  TASKMAP_GRAPH_BRAIN_TEST_ONLY,
  buildTaskMapCommunityGraph,
  splitTaskMapCommunityConnectedComponents,
  type TaskMapCommunityGraphInputV1,
  type TaskMapCommunityGraphNodeInputV1,
} from "../src/engine/taskmap/community-graph-brain.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const occurredAt = "2026-08-16T12:00:00.000Z";

function digest(label: string): string {
  return taskMapContractDigest(`community-graph-test:${label}`);
}

function vector(first: number, second = 0): number[] {
  const embedding = Array<number>(768).fill(0);
  embedding[0] = first;
  embedding[1] = second;
  return embedding;
}

function basisVector(index: number): number[] {
  const embedding = Array<number>(768).fill(0);
  embedding[index] = 1;
  return embedding;
}

function node(
  nodeId: string,
  overrides: Partial<TaskMapCommunityGraphNodeInputV1> = {},
): TaskMapCommunityGraphNodeInputV1 {
  return {
    nodeId,
    text: `Work represented by ${nodeId}`,
    sourceFamily: "agent",
    routingDigest: digest(`routing:${nodeId}`),
    occurredAt,
    externalRefs: [],
    embedding: null,
    isCalendarCommitment: false,
    ...overrides,
  };
}

function twelveNodeFixture(): TaskMapCommunityGraphInputV1 {
  const nodes: TaskMapCommunityGraphNodeInputV1[] = [];
  for (let community = 0; community < 3; community += 1) {
    for (let member = 0; member < 4; member += 1) {
      const nodeId = `c${community + 1}-n${member + 1}`;
      nodes.push(node(nodeId, {
        sourceFamily: member % 2 === 0 ? "agent" : "meeting",
        occurredAt: `2026-08-${String(10 + community * 2 + member).padStart(2, "0")}T12:00:00.000Z`,
        externalRefs: [digest(`community:${community + 1}`)],
      }));
    }
  }
  return { nodes };
}

describe("Task Map deterministic community graph brain", () => {
  it("exports the frozen initial graph policy", () => {
    assert.deepEqual(TASKMAP_GRAPH_BRAIN_POLICY_V1, {
      semanticSimilarityThreshold: 0.60,
      externalRefWeight: 3.0,
      semanticEmbeddingWeight: 2.0,
      semanticGroupingWeight: 1.5,
      routingWeight: 0.3,
      minimumEdgeWeight: 1.0,
      convergenceEpsilon: 1e-6,
    });
    assert.ok(Object.isFrozen(TASKMAP_GRAPH_BRAIN_POLICY_V1));
  });

  it("exports frozen operational budgets for the bounded graph head", () => {
    assert.deepEqual(TASKMAP_GRAPH_BRAIN_LIMITS_V1, {
      agentEpisodeCapacity: 256,
      meetingCalendarHeadroom: 128,
      maxNodes: 384,
      maxOpaqueIdCharacters: 512,
      maxNodeTextCharacters: 480,
      embeddingDimensions: 768,
      maxEmbeddingCoordinates: 294_912,
      maxExternalRefsPerNode: 32,
      maxExternalRefCharacters: 82,
      maxExternalRefsTotal: 4_096,
      maxSemanticGroups: 128,
      maxSemanticGroupMembers: 64,
      maxSemanticPairMemberships: 16_384,
      maxPairComparisons: 73_536,
      maxEdges: 16_384,
      maxOutputBytes: 16 * 1_024 * 1_024,
      maxOptimizationPasses: 128,
    });
    assert.ok(Object.isFrozen(TASKMAP_GRAPH_BRAIN_LIMITS_V1));
    assert.equal(
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes,
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.agentEpisodeCapacity
        + TASKMAP_GRAPH_BRAIN_LIMITS_V1.meetingCalendarHeadroom,
    );
    assert.equal(
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEmbeddingCoordinates,
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes
        * TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions,
    );
    assert.ok(
      TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEdges
        < TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxPairComparisons,
    );
  });

  it("finds three dense communities in a twelve-node fixture", () => {
    const result = buildTaskMapCommunityGraph(twelveNodeFixture());

    assert.deepEqual(
      result.communities.map((community) => community.memberNodeIds),
      [
        ["c1-n1", "c1-n2", "c1-n3", "c1-n4"],
        ["c2-n1", "c2-n2", "c2-n3", "c2-n4"],
        ["c3-n1", "c3-n2", "c3-n3", "c3-n4"],
      ],
    );
    assert.deepEqual(
      result.communities.map((community) => ({
        internalEdgeCount: community.internalEdgeCount,
        internalDensity: community.quality.internalDensity,
        cutEdgeRatio: community.quality.cutEdgeRatio,
        weakestMemberSimilarity: community.quality.weakestMemberSimilarity,
        sourceFamilies: community.sourceFamilies,
      })),
      [0, 1, 2].map(() => ({
        internalEdgeCount: 6,
        internalDensity: 1,
        cutEdgeRatio: 0,
        weakestMemberSimilarity: null,
        sourceFamilies: ["agent", "meeting"],
      })),
    );
    assert.deepEqual(result.unclustered, []);
  });

  it("is byte-identical across repeated runs and canonical digests", () => {
    const input = twelveNodeFixture();
    const first = buildTaskMapCommunityGraph(input);
    const second = buildTaskMapCommunityGraph(input);

    assert.equal(
      taskMapContractCanonicalJson(first),
      taskMapContractCanonicalJson(second),
    );
    assert.equal(taskMapContractDigest(first), taskMapContractDigest(second));
  });

  it("is deterministic under node, external-ref, group, and member permutations", () => {
    const sharedGroupDigest = digest("group-source");
    const forward: TaskMapCommunityGraphInputV1 = {
      nodes: [
        node("B", { externalRefs: [digest("ref-b"), digest("ref-shared")] }),
        node("a", { externalRefs: [digest("ref-a"), digest("ref-shared")] }),
        node("\u{E000}", { embedding: vector(1) }),
        node("\u{10000}", { embedding: vector(0.8, 0.6) }),
      ],
      semanticGroups: [
        {
          groupId: "group-1",
          source: "llm_grouping",
          sourceDigest: sharedGroupDigest,
          memberNodeIds: ["B", "a"],
        },
        {
          groupId: "group-2",
          source: "llm_grouping",
          sourceDigest: digest("group-source-2"),
          memberNodeIds: ["\u{E000}", "\u{10000}"],
        },
      ],
    };
    const reversed: TaskMapCommunityGraphInputV1 = {
      nodes: [...forward.nodes].reverse().map((candidate) => ({
        ...candidate,
        externalRefs: [...candidate.externalRefs].reverse(),
      })),
      semanticGroups: forward.semanticGroups?.map((group) => ({
        ...group,
        memberNodeIds: [...group.memberNodeIds].reverse(),
      })).reverse(),
    };

    assert.equal(
      taskMapContractCanonicalJson(buildTaskMapCommunityGraph(forward)),
      taskMapContractCanonicalJson(buildTaskMapCommunityGraph(reversed)),
    );
  });

  it("orders node ids by raw Unicode scalar value", () => {
    const privateUseBmp = "\u{E000}";
    const astral = "\u{10000}";
    const result = buildTaskMapCommunityGraph({
      nodes: [node(astral), node(privateUseBmp)],
    });

    assert.deepEqual(result.unclustered, [privateUseBmp, astral]);
  });

  it("breaks equal Louvain gains by the target community node id", () => {
    const ac = digest("tie-edge:a-c");
    const ae = digest("tie-edge:a-e");
    const be = digest("tie-edge:b-e");
    const cd = digest("tie-edge:c-d");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("e", { externalRefs: [ae, be] }),
        node("c", { externalRefs: [ac, cd] }),
        node("a", { externalRefs: [ac, ae] }),
        node("d", { externalRefs: [cd] }),
        node("b", { externalRefs: [be] }),
      ],
    });

    assert.deepEqual(
      result.communities.map((community) => community.memberNodeIds),
      [["a", "b", "e"], ["c", "d"]],
    );
    assert.equal(result.optimization.converged, true);
    assert.ok(result.optimization.passes >= 2);
    assert.ok(
      result.optimization.finalPassModularityGain
        < TASKMAP_GRAPH_BRAIN_POLICY_V1.convergenceEpsilon,
    );
    assert.ok(
      result.optimization.passLimit
        <= TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxOptimizationPasses,
    );
  });

  it("fails closed when the Louvain pass cap is reached before convergence", () => {
    const exact = digest("pass-cap-edge");
    assert.throws(
      () => TASKMAP_GRAPH_BRAIN_TEST_ONLY.buildWithPassLimit({
        nodes: [
          node("a", { externalRefs: [exact] }),
          node("b", { externalRefs: [exact] }),
        ],
      }, 1),
      /did not converge within the pass budget/,
    );
  });

  it("splits every proposed community into sorted connected components", () => {
    assert.deepEqual(
      splitTaskMapCommunityConnectedComponents(
        ["d", "b", "c", "a"],
        [
          { fromNodeId: "c", toNodeId: "d" },
          { fromNodeId: "a", toNodeId: "b" },
        ],
      ),
      [["a", "b"], ["c", "d"]],
    );
  });

  it("bounds the exported connected-component helper", () => {
    assert.deepEqual(
      splitTaskMapCommunityConnectedComponents(["i".repeat(512)], []),
      [["i".repeat(512)]],
    );
    assert.throws(
      () => splitTaskMapCommunityConnectedComponents(
        Array.from({ length: 385 }, (_, index) => `node-${index}`),
        [],
      ),
      /connected-component node budget/,
    );
    assert.throws(
      () => splitTaskMapCommunityConnectedComponents(
        ["a", "b"],
        Array.from({ length: 16_385 }, () => ({
          fromNodeId: "a",
          toNodeId: "b",
        })),
      ),
      /connected-component edge budget/,
    );
  });

  it("shelves singleton nodes in canonical order", () => {
    const shared = digest("paired");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("z-singleton"),
        node("b", { externalRefs: [shared] }),
        node("a", { externalRefs: [shared] }),
        node("A-singleton"),
      ],
    });

    assert.deepEqual(result.communities.map((row) => row.memberNodeIds), [["a", "b"]]);
    assert.deepEqual(result.unclustered, ["A-singleton", "z-singleton"]);
  });

  it("rejects input beyond the 384-node operational head", () => {
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: Array.from(
          { length: TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes + 1 },
          (_, index) => node(`overflow-${index}`),
        ),
      }),
      /node budget/,
    );
  });

  it("handles a production-shaped sparse embedded graph with one similarity per pair", () => {
    const nodes = Array.from({ length: 96 }, (_, index) => node(
      `embedded-${String(index).padStart(3, "0")}`,
      { embedding: basisVector(index) },
    ));
    const result = buildTaskMapCommunityGraph({ nodes });

    assert.equal(result.edges.length, 0);
    assert.equal(result.unclustered.length, 96);
    assert.equal(result.resourceUsage.pairComparisons, 4_560);
    assert.equal(result.resourceUsage.embeddingSimilarityComputations, 4_560);
  });

  it("fails closed before Louvain when a dense graph exceeds the edge budget", () => {
    const exact = digest("dense-edge-budget");
    const nodes = Array.from({ length: 183 }, (_, index) => node(
      `dense-${String(index).padStart(3, "0")}`,
      { externalRefs: [exact] },
    ));

    assert.throws(
      () => buildTaskMapCommunityGraph({ nodes }),
      /edge budget/,
    );
  });

  it("fails closed before Louvain when a bounded dense artifact exceeds 16 MiB", () => {
    const exact = digest("dense-output-budget");
    const nodes = Array.from({ length: 181 }, (_, index) => node(
      `${String(index).padStart(3, "0")}-${"x".repeat(508)}`,
      {
        text: "Production-shaped dense output budget fixture",
        externalRefs: [exact],
      },
    ));

    assert.throws(
      () => buildTaskMapCommunityGraph({ nodes }),
      /output byte budget/,
    );
  });

  it("requires exact 768-dimensional embeddings", () => {
    assert.doesNotThrow(() => buildTaskMapCommunityGraph({
      nodes: [node("exact-embedding", { embedding: vector(1) })],
    }));
    for (const dimensions of [767, 769]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("wrong-dimensions", {
            embedding: Array<number>(dimensions).fill(1),
          })],
        }),
        /embedding.*exactly 768 dimensions/,
      );
    }
  });

  it("separates 512-character opaque ids from 480-character node text", () => {
    const maxNodeId = "n".repeat(512);
    const maxGroupId = "g".repeat(512);
    assert.doesNotThrow(() => buildTaskMapCommunityGraph({
      nodes: [node(maxNodeId, { text: "t".repeat(480) })],
    }));
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("n".repeat(513), { text: "bounded" })],
      }),
      /nodeId.*512/,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("text-overflow", { text: "t".repeat(481) })],
      }),
      /text.*480/,
    );

    const groupedNodes = [node("group-a"), node("group-b")];
    assert.doesNotThrow(() => buildTaskMapCommunityGraph({
      nodes: groupedNodes,
      semanticGroups: [{
        groupId: maxGroupId,
        source: "llm_grouping",
        sourceDigest: digest("max-group-id"),
        memberNodeIds: ["group-a", "group-b"],
      }],
    }));
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: groupedNodes,
        semanticGroups: [{
          groupId: "g".repeat(513),
          source: "llm_grouping",
          sourceDigest: digest("group-id-overflow"),
          memberNodeIds: ["group-a", "group-b"],
        }],
      }),
      /groupId.*512/,
    );
  });

  it("rejects lone UTF-16 surrogates in opaque ids but accepts astral scalars", () => {
    const loneHigh = JSON.parse('"\\ud800"') as string;
    const loneLow = JSON.parse('"\\udc00"') as string;
    for (const malformed of [loneHigh, loneLow]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node(malformed, { text: "Malformed opaque node id" })],
        }),
        /nodeId.*well-formed Unicode/,
      );
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("member-a"), node("member-b")],
          semanticGroups: [{
            groupId: malformed,
            source: "llm_grouping",
            sourceDigest: digest("malformed-group-id"),
            memberNodeIds: ["member-a", "member-b"],
          }],
        }),
        /groupId.*well-formed Unicode/,
      );
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("member-a"), node("member-b")],
          semanticGroups: [{
            groupId: "malformed-member-group",
            source: "llm_grouping",
            sourceDigest: digest("malformed-member-id"),
            memberNodeIds: ["member-a", malformed],
          }],
        }),
        /memberNodeIds\[1\].*well-formed Unicode/,
      );
    }

    const astral = "\u{10000}";
    assert.doesNotThrow(() => buildTaskMapCommunityGraph({
      nodes: [node(astral), node("astral-peer")],
      semanticGroups: [{
        groupId: `astral-${astral}`,
        source: "llm_grouping",
        sourceDigest: digest("astral-group"),
        memberNodeIds: [astral, "astral-peer"],
      }],
    }));
  });

  it("preflights aggregate external-ref and semantic pair budgets", () => {
    const externalRefs = Array.from(
      { length: TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxExternalRefsPerNode },
      (_, index) => digest(`aggregate-ref:${index}`),
    );
    const refHeavyNodes = Array.from({ length: 129 }, (_, index) => node(
      `ref-heavy-${index}`,
      {
        externalRefs: externalRefs.map((_, refIndex) => (
          digest(`aggregate-ref:${index}:${refIndex}`)
        )),
      },
    ));
    assert.throws(
      () => buildTaskMapCommunityGraph({ nodes: refHeavyNodes }),
      /aggregate external-ref budget/,
    );

    const groupNodes = Array.from({ length: 64 }, (_, index) => node(`group-node-${index}`));
    const memberNodeIds = groupNodes.map((candidate) => candidate.nodeId);
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: groupNodes,
        semanticGroups: Array.from({ length: 9 }, (_, index) => ({
          groupId: `pair-heavy-${index}`,
          source: "llm_grouping" as const,
          sourceDigest: digest(`pair-heavy-source:${index}`),
          memberNodeIds,
        })),
      }),
      /semantic pair-membership budget/,
    );
  });

  it("enforces semantic group-count and per-group member budgets", () => {
    const pair = [node("a"), node("b")];
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: pair,
        semanticGroups: Array.from({ length: 129 }, (_, index) => ({
          groupId: `group-${index}`,
          source: "llm_grouping" as const,
          sourceDigest: digest(`group-source:${index}`),
          memberNodeIds: ["a", "b"],
        })),
      }),
      /semantic group budget/,
    );

    const tooManyMembers = Array.from({ length: 65 }, (_, index) => node(`member-${index}`));
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: tooManyMembers,
        semanticGroups: [{
          groupId: "member-heavy",
          source: "llm_grouping",
          sourceDigest: digest("member-heavy-source"),
          memberNodeIds: tooManyMembers.map((candidate) => candidate.nodeId),
        }],
      }),
      /semantic group member budget/,
    );
  });

  it("never creates an edge from routing support alone", () => {
    const routingDigest = digest("same-routing");
    const result = buildTaskMapCommunityGraph({
      nodes: [node("a", { routingDigest }), node("b", { routingDigest })],
    });

    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.communities, []);
    assert.deepEqual(result.unclustered, ["a", "b"]);
  });

  it("uses exact canonical ref digests and never URL domains", () => {
    const exact = digest("exact-ref");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("a", { externalRefs: [exact] }),
        node("b", { externalRefs: [exact] }),
        node("c", { externalRefs: [taskMapContractDigest("https://example.com/one")] }),
        node("d", { externalRefs: [taskMapContractDigest("https://example.com/two")] }),
      ],
    });

    assert.deepEqual(result.edges, [{
      fromNodeId: "a",
      toNodeId: "b",
      weight: 3,
      sharedExternalRefDigests: [exact],
      sharedSemanticGroupIds: [],
      embeddingSimilarity: null,
      sameRoutingDigest: false,
    }]);
    assert.deepEqual(result.unclustered, ["c", "d"]);
  });

  it("accepts only raw or explicitly prefixed canonical external-ref digests", () => {
    const raw = digest("raw-canonical-ref");
    const external = `external:${digest("external-canonical-ref")}`;
    const meeting = `canonical-meeting:${digest("meeting-canonical-ref")}`;
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("raw-a", { externalRefs: [raw] }),
        node("raw-b", { externalRefs: [raw] }),
        node("external-a", { externalRefs: [external] }),
        node("external-b", { externalRefs: [external] }),
        node("meeting-a", { externalRefs: [meeting] }),
        node("meeting-b", { externalRefs: [meeting] }),
      ],
    });

    assert.deepEqual(
      result.edges.map((edge) => edge.sharedExternalRefDigests),
      [[external], [meeting], [raw]],
    );
    for (const invalid of [
      "https://example.com/task",
      "example.com",
      "/private/task",
      "external:not-a-digest",
      "free text",
    ]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("invalid-ref", { externalRefs: [invalid] })],
        }),
        /canonical external-ref digest/,
      );
    }
  });

  it("adds thresholded embedding similarity and routing only as support", () => {
    const sameRouting = digest("embedding-route");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("a", { embedding: vector(1), routingDigest: sameRouting }),
        node("b", { embedding: vector(0.8, 0.6), routingDigest: sameRouting }),
        node("c", {
          embedding: vector(0.59, Math.sqrt(1 - 0.59 ** 2)),
          routingDigest: sameRouting,
        }),
      ],
    });

    const edge = result.edges.find((candidate) => (
      candidate.fromNodeId === "a" && candidate.toNodeId === "b"
    ));
    assert.ok(edge);
    assert.ok(Math.abs(edge.weight - 1.9) < 1e-12);
    assert.ok(Math.abs((edge.embeddingSimilarity ?? 0) - 0.8) < 1e-12);
    assert.equal(
      result.edges.some((candidate) => (
        candidate.fromNodeId === "a" && candidate.toNodeId === "c"
      )),
      false,
    );
  });

  it("partitions a connected weighted graph and reports nonzero cut ratios", () => {
    const leftRef = digest("weighted-left");
    const rightRef = digest("weighted-right");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("a", { externalRefs: [leftRef] }),
        node("b", { externalRefs: [leftRef], embedding: vector(1) }),
        node("c", { externalRefs: [rightRef], embedding: vector(0.6, 0.8) }),
        node("d", { externalRefs: [rightRef] }),
      ],
    });

    assert.deepEqual(
      result.communities.map((community) => community.memberNodeIds),
      [["a", "b"], ["c", "d"]],
    );
    assert.deepEqual(
      result.communities.map((community) => community.quality.cutEdgeRatio),
      [0.5, 0.5],
    );
    assert.equal(result.edges.length, 3);
  });

  it("reports sparse internal density and formal-member date spans", () => {
    const refs = [digest("star-a"), digest("star-b"), digest("star-c")];
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("agent-a", {
          occurredAt: "2026-08-10T12:00:00.000Z",
          externalRefs: [refs[0]!],
        }),
        node("agent-b", {
          occurredAt: "2026-08-12T12:00:00.000Z",
          externalRefs: [refs[1]!],
        }),
        node("agent-c", {
          occurredAt: "2026-08-14T12:00:00.000Z",
          externalRefs: [refs[2]!],
        }),
        node("calendar-context", {
          sourceFamily: "calendar",
          occurredAt: "2026-08-01T12:00:00.000Z",
          externalRefs: refs,
        }),
      ],
    });

    assert.deepEqual(result.communities[0]?.memberNodeIds, [
      "agent-a",
      "agent-b",
      "agent-c",
    ]);
    assert.deepEqual(result.communities[0]?.contextNodeIds, ["calendar-context"]);
    assert.equal(result.communities[0]?.internalEdgeCount, 3);
    assert.equal(result.communities[0]?.quality.internalDensity, 0.5);
    assert.deepEqual(result.communities[0]?.dateSpan, {
      startAt: "2026-08-10T12:00:00.000Z",
      endAt: "2026-08-14T12:00:00.000Z",
    });
  });

  it("reports the weakest formal-member embedding similarity", () => {
    const exact = digest("weakest-similarity");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("a", { externalRefs: [exact], embedding: vector(1) }),
        node("b", { externalRefs: [exact], embedding: vector(0.8, 0.6) }),
      ],
    });

    assert.ok(
      Math.abs(
        (result.communities[0]?.quality.weakestMemberSimilarity ?? 0) - 0.8,
      ) < 1e-12,
    );
  });

  it("accepts deterministic LLM semantic groups as an independent edge signal", () => {
    const sourceDigest = digest("llm-group-source");
    const forward = buildTaskMapCommunityGraph({
      nodes: [node("meeting-node", { sourceFamily: "meeting" }), node("agent-node")],
      semanticGroups: [{
        groupId: "semantic-group",
        source: "llm_grouping",
        sourceDigest,
        memberNodeIds: ["meeting-node", "agent-node"],
      }],
    });
    const reversed = buildTaskMapCommunityGraph({
      nodes: [node("agent-node"), node("meeting-node", { sourceFamily: "meeting" })],
      semanticGroups: [{
        groupId: "semantic-group",
        source: "llm_grouping",
        sourceDigest,
        memberNodeIds: ["agent-node", "meeting-node"],
      }],
    });

    assert.equal(taskMapContractCanonicalJson(forward), taskMapContractCanonicalJson(reversed));
    assert.equal(forward.edges[0]?.weight, 1.5);
    assert.deepEqual(forward.edges[0]?.sharedSemanticGroupIds, ["semantic-group"]);
    assert.deepEqual(forward.semanticGroupProvenance, [{
      groupId: "semantic-group",
      source: "llm_grouping",
      sourceDigest,
    }]);
    assert.deepEqual(forward.communities[0]?.memberNodeIds, ["agent-node", "meeting-node"]);
  });

  it("keeps calendar context out of formal membership while allowing relation support", () => {
    const leftRef = digest("calendar-left");
    const rightRef = digest("calendar-right");
    const supported = buildTaskMapCommunityGraph({
      nodes: [
        node("agent-a", { externalRefs: [leftRef] }),
        node("agent-b", { externalRefs: [rightRef] }),
        node("calendar-context", {
          sourceFamily: "calendar",
          externalRefs: [leftRef, rightRef],
        }),
      ],
    });

    assert.deepEqual(supported.communities[0]?.memberNodeIds, ["agent-a", "agent-b"]);
    assert.deepEqual(supported.communities[0]?.contextNodeIds, ["calendar-context"]);
    assert.deepEqual(supported.communities[0]?.sourceFamilies, ["agent"]);

    const pureCalendar = buildTaskMapCommunityGraph({
      nodes: [
        node("calendar-a", { sourceFamily: "calendar", externalRefs: [leftRef] }),
        node("calendar-b", { sourceFamily: "calendar", externalRefs: [leftRef] }),
      ],
    });
    assert.deepEqual(pureCalendar.communities, []);
    assert.deepEqual(pureCalendar.unclustered, ["calendar-a", "calendar-b"]);
  });

  it("allows an explicit calendar commitment to become a formal member", () => {
    const exact = digest("calendar-commitment");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("agent", { externalRefs: [exact] }),
        node("calendar", {
          sourceFamily: "calendar",
          externalRefs: [exact],
          isCalendarCommitment: true,
        }),
      ],
    });

    assert.deepEqual(result.communities[0]?.memberNodeIds, ["agent", "calendar"]);
    assert.deepEqual(result.communities[0]?.contextNodeIds, []);
    assert.deepEqual(result.communities[0]?.sourceFamilies, ["agent", "calendar"]);
  });

  it("never emits a pure-calendar root even when its nodes are commitments", () => {
    const exact = digest("pure-calendar-commitments");
    const result = buildTaskMapCommunityGraph({
      nodes: [
        node("calendar-a", {
          sourceFamily: "calendar",
          externalRefs: [exact],
          isCalendarCommitment: true,
        }),
        node("calendar-b", {
          sourceFamily: "calendar",
          externalRefs: [exact],
          isCalendarCommitment: true,
        }),
      ],
    });

    assert.deepEqual(result.communities, []);
    assert.deepEqual(result.unclustered, ["calendar-a", "calendar-b"]);
  });

  it("fails closed on duplicate or malformed nodes", () => {
    assert.throws(
      () => buildTaskMapCommunityGraph({ nodes: [node("same"), node("same")] }),
      /duplicate nodeId/,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("calendar-lie", { isCalendarCommitment: true })],
      }),
      /calendar commitment/i,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("bad-ref", { externalRefs: ["https://example.com/task"] })],
      }),
      /externalRefs.*canonical external-ref digest/,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("bad-time", { occurredAt: "yesterday" })],
      }),
      /occurredAt/,
    );
  });

  it("accepts only plain enumerable data objects at the graph boundary", () => {
    class NodeRecord {
      nodeId = "class-node";
      text = "Class instances are not boundary records";
      sourceFamily = "agent" as const;
      routingDigest = digest("class-node-routing");
      occurredAt = "2026-08-16T12:00:00.000Z";
      externalRefs: string[] = [];
      embedding: number[] | null = null;
      isCalendarCommitment = false;
    }
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [new NodeRecord()],
      }),
      /plain enumerable object/,
    );

    const hiddenFieldNode = node("hidden-field");
    Object.defineProperty(hiddenFieldNode, "text", {
      configurable: true,
      enumerable: false,
      value: hiddenFieldNode.text,
      writable: true,
    });
    assert.throws(
      () => buildTaskMapCommunityGraph({ nodes: [hiddenFieldNode] }),
      /plain enumerable object/,
    );
  });

  it("never reflects raw node or group ids in validation errors", () => {
    const secretDuplicate = "secret-duplicate-node-id";
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node(secretDuplicate), node(secretDuplicate)],
      }),
      (error: unknown) => (
        error instanceof TypeError
        && /duplicate nodeId/.test(error.message)
        && !error.message.includes(secretDuplicate)
      ),
    );

    const secretMissing = "secret-missing-node-id";
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [node("known-a"), node("known-b")],
        semanticGroups: [{
          groupId: "unknown-node-group",
          source: "llm_grouping",
          sourceDigest: digest("unknown-node-source"),
          memberNodeIds: ["known-a", secretMissing],
        }],
      }),
      (error: unknown) => (
        error instanceof TypeError
        && /unknown nodeId/.test(error.message)
        && !error.message.includes(secretMissing)
      ),
    );

    const secretGroup = "secret-semantic-group-id";
    const groupNodes = [node("redacted-a"), node("redacted-b")];
    const semanticGroup = {
      groupId: secretGroup,
      source: "llm_grouping" as const,
      sourceDigest: digest("redacted-group-source"),
      memberNodeIds: ["redacted-a", "redacted-b"],
    };
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: groupNodes,
        semanticGroups: [semanticGroup, { ...semanticGroup }],
      }),
      (error: unknown) => (
        error instanceof TypeError
        && /duplicate semantic groupId/.test(error.message)
        && !error.message.includes(secretGroup)
      ),
    );
  });

  it("rejects RFC3339-shaped timestamps with invalid civil components", () => {
    for (const occurredAt of [
      "2026-02-31T12:00:00Z",
      "2026-01-01T24:00:00Z",
    ]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("invalid-civil-time", { occurredAt })],
        }),
        /occurredAt.*canonical UTC millisecond timestamp/,
      );
    }
  });

  it("requires canonical UTC millisecond occurredAt timestamps", () => {
    for (const occurredAt of [
      "2026-08-16T12:00:00.000000001Z",
      "2026-08-16T05:00:00.000-07:00",
      "2026-08-16T12:00:00Z",
    ]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({
          nodes: [node("noncanonical-time", { occurredAt })],
        }),
        /occurredAt.*canonical UTC millisecond timestamp/,
      );
    }
  });

  it("fails closed on malformed semantic groups", () => {
    const sourceDigest = digest("bad-group-source");
    const nodes = [node("a"), node("b")];
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes,
        semanticGroups: [{
          groupId: "unknown-member",
          source: "llm_grouping",
          sourceDigest,
          memberNodeIds: ["a", "missing"],
        }],
      }),
      /unknown nodeId/,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes,
        semanticGroups: [{
          groupId: "duplicate-member",
          source: "llm_grouping",
          sourceDigest,
          memberNodeIds: ["a", "a"],
        }],
      }),
      /duplicate member nodeId/,
    );
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes,
        semanticGroups: [
          {
            groupId: "same",
            source: "llm_grouping",
            sourceDigest,
            memberNodeIds: ["a", "b"],
          },
          {
            groupId: "same",
            source: "llm_grouping",
            sourceDigest,
            memberNodeIds: ["b", "a"],
          },
        ],
      }),
      /duplicate semantic groupId/,
    );
  });

  it("fails closed on inconsistent, non-finite, or zero-norm embeddings", () => {
    assert.throws(
      () => buildTaskMapCommunityGraph({
        nodes: [
          node("a", { embedding: vector(1) }),
          node("b", { embedding: Array<number>(767).fill(1) }),
        ],
      }),
      /embedding.*exactly 768 dimensions/,
    );
    for (const embedding of [
      vector(Number.NaN),
      vector(Number.POSITIVE_INFINITY),
      Array<number>(768).fill(0),
    ]) {
      assert.throws(
        () => buildTaskMapCommunityGraph({ nodes: [node("bad", { embedding })] }),
        /embedding/,
      );
    }
  });

  it("registers the focused graph-brain suite in pretest and test", () => {
    const packageJson = JSON.parse(
      readFileSync(`${process.cwd()}/package.json`, "utf8"),
    ) as { scripts: { pretest: string; test: string } };
    for (const scriptName of ["pretest", "test"] as const) {
      assert.match(
        packageJson.scripts[scriptName],
        /dist\/tests\/taskmap-community-graph-brain\.test\.js/,
      );
    }
  });
});
