import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1,
  TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY,
  buildTaskMapCommunityRootProposals,
  taskMapCommunityRootNodeLookupDigest,
  type TaskMapPreviousAcceptedRootV1,
} from "../src/engine/taskmap/community-root-proposals.js";
import {
  type TaskMapCommunityGraphCommunityV1,
  type TaskMapCommunityGraphNodeInputV1,
  type TaskMapCommunityGraphOutputV1,
} from "../src/engine/taskmap/community-graph-brain.js";
import {
  LlmStationUnavailableError,
  type LlmStation,
  type LlmStationEnvelope,
  type LlmStationRequest,
} from "../src/engine/taskmap/llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const OCCURRED_AT = "2026-08-16T12:00:00.000Z";

function digest(label: string): string {
  return taskMapContractDigest(`community-root-test:${label}`);
}

function baseRootId(memberNodeIds: readonly string[]): string {
  return `graph-root-${taskMapContractDigest([...memberNodeIds].sort()).slice(0, 16)}`;
}

function titleBatch(
  entries: Array<{ baseRootProposalId: string; title: string }>,
): string {
  return JSON.stringify({ titles: entries });
}

function node(
  nodeId: string,
  text = `Work represented by ${nodeId}`,
  sourceFamily: "agent" | "meeting" | "calendar" = "agent",
): TaskMapCommunityGraphNodeInputV1 {
  return {
    nodeId,
    text,
    sourceFamily,
    routingDigest: digest(`routing:${nodeId}`),
    occurredAt: OCCURRED_AT,
    externalRefs: [],
    embedding: null,
    isCalendarCommitment: false,
  };
}

function community(
  memberNodeIds: string[],
): TaskMapCommunityGraphCommunityV1 {
  return {
    memberNodeIds,
    contextNodeIds: [],
    internalEdgeCount: Math.max(0, memberNodeIds.length - 1),
    dateSpan: { startAt: OCCURRED_AT, endAt: OCCURRED_AT },
    sourceFamilies: ["agent"],
    quality: {
      internalDensity: memberNodeIds.length > 1 ? 1 : 0,
      cutEdgeRatio: 0,
      weakestMemberSimilarity: null,
    },
  };
}

function graph(
  communities: TaskMapCommunityGraphCommunityV1[],
  nodeCount: number,
): TaskMapCommunityGraphOutputV1 {
  return {
    edges: [],
    communities,
    unclustered: [],
    semanticGroupProvenance: [],
    optimization: {
      algorithm: "deterministic_louvain_local_modularity",
      passes: 1,
      passLimit: 1,
      converged: true,
      finalPassModularityGain: 0,
    },
    resourceUsage: {
      nodeCount,
      pairComparisons: 0,
      embeddingSimilarityComputations: 0,
      emittedEdgeCount: 0,
      semanticPairMemberships: 0,
    },
  };
}

function lookup(
  nodes: readonly TaskMapCommunityGraphNodeInputV1[],
): ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1> {
  return new Map(nodes.map((candidate) => [candidate.nodeId, candidate]));
}

function boundLookup(
  nodes: readonly TaskMapCommunityGraphNodeInputV1[],
): {
  nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
  nodeLookupDigest: string;
} {
  const nodeLookup = lookup(nodes);
  return {
    nodeLookup,
    nodeLookupDigest: taskMapCommunityRootNodeLookupDigest(nodeLookup),
  };
}

function station(
  outputJson: string | Error,
  calls: LlmStationRequest[] = [],
): LlmStation {
  return {
    provider: {
      transport: "gemini-remote",
      executable: "injected-test-station",
      args: [],
      model: "injected-title-test",
    },
    async run(request): Promise<LlmStationEnvelope> {
      calls.push(request);
      if (outputJson instanceof Error) throw outputJson;
      return {
        stationId: request.stationId,
        model: "injected-title-test",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson,
        producedAt: OCCURRED_AT,
        transport: "gemini-remote",
      };
    },
  };
}

describe("Task Map community root proposals", () => {
  it("reserves a measured thirty-second title batch inside the 120s shadow budget", () => {
    assert.equal(
      TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs,
      30_000,
    );
  });
  it("emits one deterministic review-only proposal and titles the top five members through the injected station", async () => {
    const nodes = [
      node("a", "Ship the durable Task Map"),
      node("b", "Verify the durable Task Map"),
      node("c", "Review the durable Task Map"),
      node("d", "Test the durable Task Map"),
      node("e", "Document the durable Task Map"),
      node("f", "This sixth member must not enter the title prompt"),
    ];
    const calls: LlmStationRequest[] = [];
    const sortedMembers = ["a", "b", "c", "d", "e", "f"];
    const baseId = baseRootId(sortedMembers);
    const binding = boundLookup(nodes);
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 6),
      ...binding,
      previousAcceptedRoots: [],
      llmStation: station(titleBatch([{
        baseRootProposalId: baseId,
        title: "Durable Task Map Delivery",
      }]), calls),
    });

    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].rootProposalId, baseId);
    assert.equal(result.proposals[0].baseRootProposalId, baseId);
    assert.equal(result.proposals[0].title, "Durable Task Map Delivery");
    assert.equal(result.proposals[0].titleSource, "llm_community_title_v1");
    assert.equal(result.proposals[0].recordKind, "review_only_root_proposal");
    assert.equal(result.proposals[0].authority, "none");
    assert.equal(result.proposals[0].requiresOwnerAcceptance, true);
    assert.equal(result.proposals[0].acceptedMembershipAuthority, false);
    assert.equal(result.authority, "none");
    assert.equal(result.requiresOwnerAcceptance, true);
    assert.equal(result.lifecycle.length, 0);
    assert.equal(result.nodeLookupDigest, binding.nodeLookupDigest);
    assert.equal(result.monitoring.titleBatchAttempted, true);
    assert.equal(result.monitoring.titleBatchTimedOut, false);
    assert.equal(result.monitoring.llmTitleCount, 1);
    assert.equal(result.monitoring.fallbackTitleCount, 0);
    assert.ok(result.monitoring.titlePromptBytes > 0);
    assert.ok(result.monitoring.titleOutputBytes > 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].stationId, "community-title-v1");
    assert.match(calls[0].inputDigest, /^[a-f0-9]{64}$/);
    for (const candidate of nodes.slice(0, 5)) {
      assert.ok(calls[0].promptText.includes(candidate.text));
    }
    assert.equal(calls[0].promptText.includes(nodes[5].text), false);
  });

  it("falls back deterministically on unavailable or invalid title output and keeps prompts and titles private", async () => {
    const unsafe = node(
      "unsafe",
      "Launch Task Map review from /Users/neo/private with api_key=super-secret-value and sk-proj-abcdefghijklmnop",
    );
    const sibling = node(
      "sibling",
      "Launch Task Map review safely this week",
    );
    const unavailableCalls: LlmStationRequest[] = [];
    const input = {
      graphOutput: graph([community(["unsafe", "sibling"])], 2),
      ...boundLookup([unsafe, sibling]),
      previousAcceptedRoots: [] as TaskMapPreviousAcceptedRootV1[],
    };
    const unavailable = await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(
        new LlmStationUnavailableError("no_provider"),
        unavailableCalls,
      ),
    });
    const invalid = await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(
        JSON.stringify({
          titles: [{
            baseRootProposalId: baseRootId(["sibling", "unsafe"]),
            title: "/Users/neo/private",
            unexpected: true,
          }],
        }),
      ),
    });
    assert.equal(unavailable.proposals[0].title, "Launch Task Map review");
    assert.equal(invalid.proposals[0].title, "Launch Task Map review");
    assert.equal(unavailable.proposals[0].titleSource, "deterministic_fallback");
    assert.ok(unavailable.proposals[0].title.length <= 80);
    assert.equal(JSON.stringify(unavailable).includes("/Users/"), false);
    assert.equal(JSON.stringify(unavailable).includes("super-secret"), false);
    assert.equal(JSON.stringify(unavailable).includes("sk-proj-"), false);
    assert.equal(unavailableCalls[0].promptText.includes("/Users/"), false);
    assert.equal(unavailableCalls[0].promptText.includes("super-secret"), false);
    assert.equal(unavailableCalls[0].promptText.includes("sk-proj-"), false);
  });

  it("is byte-identical under community, member, prior-root, and node-map permutations", async () => {
    const nodes = [
      node("a", "Alpha launch work"),
      node("b", "Alpha verification work"),
      node("c", "Beta launch work"),
      node("d", "Beta verification work"),
    ];
    const communities = [community(["a", "b"]), community(["c", "d"])];
    const previousAcceptedRoots: TaskMapPreviousAcceptedRootV1[] = [
      {
        rootProposalId: "accepted-alpha",
        memberNodeIds: ["a", "b"],
      },
      {
        rootProposalId: "accepted-beta",
        memberNodeIds: ["c", "d"],
      },
    ];
    const forward = await buildTaskMapCommunityRootProposals({
      graphOutput: graph(communities, 4),
      ...boundLookup(nodes),
      previousAcceptedRoots,
    });
    const reversed = await buildTaskMapCommunityRootProposals({
      graphOutput: graph(
        [...communities].reverse().map((candidate) => ({
          ...candidate,
          memberNodeIds: [...candidate.memberNodeIds].reverse(),
        })),
        4,
      ),
      ...boundLookup([...nodes].reverse()),
      previousAcceptedRoots: [...previousAcceptedRoots].reverse().map(
        (candidate) => ({
          ...candidate,
          memberNodeIds: [...candidate.memberNodeIds].reverse(),
        }),
      ),
    });
    assert.equal(
      taskMapContractCanonicalJson(forward),
      taskMapContractCanonicalJson(reversed),
    );
    assert.equal(forward.proposalSetDigest, reversed.proposalSetDigest);
  });

  it("does not invent a root when the validated graph has no community", async () => {
    const calendarNodes = [
      node("calendar-a", "Calendar context A", "calendar"),
      node("calendar-b", "Calendar context B", "calendar"),
    ];
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([], calendarNodes.length),
      ...boundLookup(calendarNodes),
      previousAcceptedRoots: [],
    });
    assert.deepEqual(result.proposals, []);
    assert.deepEqual(result.lifecycle, []);
  });

  it("reuses an accepted root identity after a twenty-percent membership change without granting authority", async () => {
    const nodes = ["a", "b", "c", "d"].map((nodeId) => node(nodeId));
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(["a", "b", "c", "d"])], 4),
      ...boundLookup(nodes),
      previousAcceptedRoots: [{
        rootProposalId: "accepted-existing-root",
        memberNodeIds: ["a", "b", "c", "d", "removed"],
      }],
    });
    assert.equal(result.proposals[0].rootProposalId, "accepted-existing-root");
    assert.notEqual(
      result.proposals[0].baseRootProposalId,
      result.proposals[0].rootProposalId,
    );
    assert.equal(result.proposals[0].authority, "none");
    assert.equal(result.proposals[0].requiresOwnerAcceptance, true);
    assert.deepEqual(result.lifecycle, [{
      kind: "identity_reuse_proposed",
      rootProposalId: "accepted-existing-root",
      baseRootProposalId: result.proposals[0].baseRootProposalId,
      previousMemberNodeIds: ["a", "b", "c", "d", "removed"],
      currentMemberNodeIds: ["a", "b", "c", "d"],
      jaccardSimilarity: 0.8,
      recordKind: "review_only_identity_reuse_proposal",
      proposalDisposition: "review_only",
      authority: "none",
      requiresOwnerAcceptance: true,
      lifecycleAuthority: false,
    }]);
    assert.deepEqual(result.reuseMetrics, {
      reuseThreshold: 0.5,
      communityCount: 1,
      previousAcceptedRootCount: 1,
      eligiblePairCount: 1,
      identityReuseProposedCount: 1,
      unmatchedCommunityCount: 0,
      unmatchedPreviousRootCount: 0,
    });
  });

  it("does not reuse identity below the Jaccard threshold", async () => {
    const nodes = [node("a"), node("b")];
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(["a", "b"])], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [{
        rootProposalId: "accepted-low-overlap",
        memberNodeIds: ["a", "c", "d"],
      }],
    });
    assert.match(result.proposals[0].rootProposalId, /^graph-root-[a-f0-9]{16}$/);
    assert.notEqual(result.proposals[0].rootProposalId, "accepted-low-overlap");
    assert.deepEqual(result.lifecycle, []);
    assert.equal(result.reuseMetrics.eligiblePairCount, 0);
    assert.equal(result.reuseMetrics.identityReuseProposedCount, 0);
  });

  it("uses global maximum-cardinality assignment instead of a locally ambiguous match", async () => {
    const nodes = [node("a"), node("b"), node("c")];
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([
        community(["a"]),
        community(["b"]),
        community(["c"]),
      ], 3),
      ...boundLookup(nodes),
      previousAcceptedRoots: [
        {
          rootProposalId: "accepted-shared",
          memberNodeIds: ["a", "b"],
        },
        {
          rootProposalId: "accepted-a-alternative",
          memberNodeIds: ["a", "x"],
        },
      ],
    });
    const rootByMember = new Map(result.proposals.map((proposal) => [
      proposal.memberNodeIds[0],
      proposal.rootProposalId,
    ]));
    assert.equal(rootByMember.get("a"), "accepted-a-alternative");
    assert.equal(rootByMember.get("b"), "accepted-shared");
    assert.match(rootByMember.get("c") ?? "", /^graph-root-[a-f0-9]{16}$/);
    assert.equal(result.lifecycle.length, 2);
  });

  it("reuses at exactly 0.5 and breaks equal global assignments by code point", async () => {
    const nodes = [node("tie-a"), node("tie-b")];
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([
        community(["tie-a"]),
        community(["tie-b"]),
      ], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [
        {
          rootProposalId: "accepted-a",
          memberNodeIds: ["tie-a", "tie-b"],
        },
        {
          rootProposalId: "accepted-b",
          memberNodeIds: ["tie-a", "tie-b"],
        },
      ],
    });
    const rootByMember = new Map(result.proposals.map((proposal) => [
      proposal.memberNodeIds[0],
      proposal.rootProposalId,
    ]));
    assert.equal(rootByMember.get("tie-a"), "accepted-a");
    assert.equal(rootByMember.get("tie-b"), "accepted-b");
    assert.ok(result.lifecycle.every(
      (record) => record.jaccardSimilarity === 0.5,
    ));
    assert.deepEqual(result.reuseMetrics, {
      reuseThreshold: 0.5,
      communityCount: 2,
      previousAcceptedRootCount: 2,
      eligiblePairCount: 4,
      identityReuseProposedCount: 2,
      unmatchedCommunityCount: 0,
      unmatchedPreviousRootCount: 0,
    });
  });

  it("fails closed on duplicate previous roots and duplicate community or history members", async () => {
    const nodes = [node("a"), node("b")];
    const base = {
      graphOutput: graph([community(["a", "b"])], 2),
      ...boundLookup(nodes),
    };
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        ...base,
        previousAcceptedRoots: [
          { rootProposalId: "same-root", memberNodeIds: ["a"] },
          { rootProposalId: "same-root", memberNodeIds: ["b"] },
        ],
      }),
      /duplicate previous rootProposalId/,
    );
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        ...base,
        previousAcceptedRoots: [{
          rootProposalId: "history-duplicate-member",
          memberNodeIds: ["a", "a"],
        }],
      }),
      /duplicate previous memberNodeId/,
    );
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph([community(["a", "a"])], 2),
        ...boundLookup(nodes),
        previousAcceptedRoots: [],
      }),
      /duplicate community memberNodeId/,
    );
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph([
          community(["a"]),
          community(["a", "b"]),
        ], 2),
        ...boundLookup(nodes),
        previousAcceptedRoots: [],
      }),
      /duplicate memberNodeId across communities/,
    );
  });

  it("rejects duplicate-key and overlong LLM title payloads into the bounded fallback", async () => {
    const nodes = [
      node("a", "Stable bounded fallback title"),
      node("b", "Stable bounded fallback title"),
    ];
    const input = {
      graphOutput: graph([community(["a", "b"])], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [] as TaskMapPreviousAcceptedRootV1[],
    };
    const duplicate = await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station('{"titles":[],"titles":[]}'),
    });
    const overlong = await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(titleBatch([{
        baseRootProposalId: baseRootId(["a", "b"]),
        title: "x".repeat(81),
      }])),
    });
    for (const result of [duplicate, overlong]) {
      assert.equal(
        result.proposals[0].title,
        "Stable bounded fallback title",
      );
      assert.equal(
        result.proposals[0].titleSource,
        "deterministic_fallback",
      );
      assert.ok(result.proposals[0].title.length <= 80);
    }
  });

  it("sanitizes cross-platform paths and AWS credentials from prompts and returned titles", async () => {
    const awsAccessKey = "AKIA1234567890ABCDEF";
    const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const granolaToken = "grn_abcdefghijklmnop";
    const dbkToken = "dbk_abcdefghijklmnop";
    const githubToken = "ghp_abcdefghijklmnop";
    const slackToken = "xoxb-1234567890123456";
    const openAiToken = "sk-proj-abcdefghijklmnop";
    const jwt = "abcdefgh.ijklmnop.qrstuvwx";
    const unsafeText = [
      "Launch Task Map review",
      "file:///Users/neo/private/report.md",
      "C:\\Users\\neo\\private\\report.md",
      "\\\\server\\share\\private\\report.md",
      "/repo/private/report.md",
      awsAccessKey,
      `aws_secret_access_key=${awsSecret}`,
      granolaToken,
      dbkToken,
      githubToken,
      slackToken,
      openAiToken,
      jwt,
      "-----BEGIN PRIVATE KEY----- truncated-private-content",
      "password=visible-password",
    ].join(" ");
    const nodes = [
      node("unsafe-platform", unsafeText),
      node("safe-platform", "Launch Task Map review safely"),
    ];
    const input = {
      graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [] as TaskMapPreviousAcceptedRootV1[],
    };
    const calls: LlmStationRequest[] = [];
    const unavailable = await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(
        new LlmStationUnavailableError("no_provider"),
        calls,
      ),
    });
    for (const secret of [
      "file://",
      "C:\\Users",
      "\\\\server\\share",
      "/repo/private",
      awsAccessKey,
      awsSecret,
      granolaToken,
      dbkToken,
      githubToken,
      slackToken,
      openAiToken,
      jwt,
      "-----BEGIN PRIVATE KEY-----",
      "visible-password",
    ]) {
      assert.equal(calls[0].promptText.includes(secret), false, secret);
      assert.equal(JSON.stringify(unavailable).includes(secret), false, secret);
    }

    const invalidTitles = [
      "file:///Users/neo/private/report.md",
      "C:\\Users\\neo\\private\\report.md",
      "\\\\server\\share\\private\\report.md",
      "/repo/private/report.md",
      awsAccessKey,
      `aws_secret_access_key=${awsSecret}`,
      granolaToken,
      dbkToken,
      githubToken,
      slackToken,
      openAiToken,
      jwt,
      "-----BEGIN PRIVATE KEY----- truncated-private-content",
      "password=visible-password",
    ];
    for (const title of invalidTitles) {
      const result = await buildTaskMapCommunityRootProposals({
        ...input,
        llmStation: station(titleBatch([{
          baseRootProposalId: baseRootId([
            "safe-platform",
            "unsafe-platform",
          ]),
          title,
        }])),
      });
      assert.equal(result.proposals[0].titleSource, "deterministic_fallback");
      assert.equal(result.proposals[0].title, "Launch Task Map review");
      assert.equal(JSON.stringify(result).includes(title), false);
    }
  });

  it("preserves commit SHAs and technical identifiers as non-secret title input", async () => {
    const sha40 = "a".repeat(40);
    const sha64 = "b".repeat(64);
    const technicalId = "taskmap_agent_session_compacted_v2";
    const nodes = [
      node("technical-a", `Review commit ${sha40} ${technicalId}`),
      node("technical-b", `Compare digest ${sha64} ${technicalId}`),
    ];
    const calls: LlmStationRequest[] = [];
    await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [],
      llmStation: station(new LlmStationUnavailableError("no_provider"), calls),
    });
    assert.ok(calls[0].promptText.includes(sha40));
    assert.ok(calls[0].promptText.includes(sha64));
    assert.ok(calls[0].promptText.includes(technicalId));
    const titled = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(nodes.map((candidate) => candidate.nodeId))], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [],
      llmStation: station(titleBatch([{
        baseRootProposalId: baseRootId(nodes.map((candidate) => candidate.nodeId)),
        title: sha40,
      }])),
    });
    assert.equal(titled.proposals[0].title, sha40);
    assert.equal(titled.proposals[0].titleSource, "llm_community_title_v1");
  });

  it("uses one bounded station call for a production-shaped maximum root batch", async () => {
    const nodes = Array.from({ length: 384 }, (_, index) => node(
      `max-root-${String(index).padStart(3, "0")}`,
      `Bounded title evidence ${index} ${"context ".repeat(50)}`,
    ));
    const calls: LlmStationRequest[] = [];
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph(
        nodes.map((candidate) => community([candidate.nodeId])),
        nodes.length,
      ),
      ...boundLookup(nodes),
      previousAcceptedRoots: [],
      llmStation: station('{"titles":[]}', calls),
    });
    assert.equal(result.proposals.length, 384);
    assert.equal(calls.length, 1);
    assert.ok(Buffer.byteLength(calls[0].promptText, "utf8") <= 64 * 1_024);
    assert.ok(result.proposals.every(
      (proposal) => proposal.titleSource === "deterministic_fallback",
    ));
    assert.equal(result.monitoring.titleBatchAttempted, true);
    assert.equal(result.monitoring.fallbackTitleCount, 384);
    assert.ok(result.monitoring.titlePromptBytes <= 64 * 1_024);
  });

  it("opens one run-level circuit after a bounded title-batch timeout", async () => {
    const calls: LlmStationRequest[] = [];
    const hangingStation: LlmStation = {
      provider: {
        transport: "gemini-remote",
        executable: "hanging-test-station",
        args: [],
        model: "hanging-title-test",
      },
      run(request): Promise<LlmStationEnvelope> {
        calls.push(request);
        return new Promise(() => {});
      },
    };
    const result = await TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY
      .buildWithTitleTimeout({
        graphOutput: graph([community(["timeout-node"])], 1),
        ...boundLookup([node("timeout-node", "Timeout fallback title")]),
        previousAcceptedRoots: [],
        llmStation: hangingStation,
      }, 5);
    assert.equal(calls.length, 1);
    assert.equal(result.proposals[0].title, "Timeout fallback title");
    assert.equal(result.proposals[0].titleSource, "deterministic_fallback");
    assert.equal(result.titleGeneration, null);
    assert.equal(result.monitoring.titleBatchAttempted, true);
    assert.equal(result.monitoring.titleBatchTimedOut, true);
    assert.equal(result.monitoring.fallbackTitleCount, 1);
  });

  it("records a station-originated timeout as the title fallback reason", async () => {
    const timedOutStation = station(
      new LlmStationUnavailableError("timeout", "gemini-remote"),
    );
    const result = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community(["station-timeout-node"])], 1),
      ...boundLookup([node("station-timeout-node", "Station timeout fallback")]),
      previousAcceptedRoots: [],
      llmStation: timedOutStation,
    });
    assert.equal(result.monitoring.titleBatchTimedOut, true);
    assert.equal(result.monitoring.titleFallbackReason, "station_timeout");
    assert.equal(result.proposals[0].titleSource, "deterministic_fallback");
  });

  it("replays a fully bound recorded title envelope deterministically", async () => {
    const nodes = [
      node("replay-a", "Replay stable root title"),
      node("replay-b", "Replay stable root evidence"),
    ];
    const memberNodeIds = nodes.map((candidate) => candidate.nodeId);
    const outputJson = titleBatch([{
      baseRootProposalId: baseRootId(memberNodeIds),
      title: "Replay Stable Root",
    }]);
    const calls: LlmStationRequest[] = [];
    const input = {
      graphOutput: graph([community(memberNodeIds)], 2),
      ...boundLookup(nodes),
      previousAcceptedRoots: [] as TaskMapPreviousAcceptedRootV1[],
    };
    await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(outputJson, calls),
    });
    const recordedEnvelope: LlmStationEnvelope = {
      stationId: "community-title-v1",
      model: "recorded-title-model",
      promptDigest: taskMapContractDigest(calls[0].promptText),
      inputDigest: calls[0].inputDigest,
      outputJson,
      producedAt: OCCURRED_AT,
      transport: "gemini-remote",
    };
    const first = await buildTaskMapCommunityRootProposals({
      ...input,
      recordedTitleEnvelope: recordedEnvelope,
    });
    const second = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community([...memberNodeIds].reverse())], 2),
      ...boundLookup([...nodes].reverse()),
      previousAcceptedRoots: [],
      recordedTitleEnvelope: structuredClone(recordedEnvelope),
    });
    assert.equal(
      taskMapContractCanonicalJson(first),
      taskMapContractCanonicalJson(second),
    );
    assert.equal(first.proposals[0].title, "Replay Stable Root");
    assert.equal(first.titleGeneration?.source, "recorded_replay");
    assert.equal(first.titleGeneration?.transport, "gemini-remote");
    assert.equal(first.titleGeneration?.model, "recorded-title-model");
    assert.match(first.titleGeneration?.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
    assert.match(first.titleGeneration?.outputDigest ?? "", /^[a-f0-9]{64}$/);
    const otherModel = await buildTaskMapCommunityRootProposals({
      ...input,
      recordedTitleEnvelope: {
        ...recordedEnvelope,
        model: "recorded-title-model-v2",
      },
    });
    assert.equal(otherModel.proposals[0].title, first.proposals[0].title);
    assert.notEqual(otherModel.proposalSetDigest, first.proposalSetDigest);
  });

  it("fails closed on every tampered recorded title-envelope binding", async () => {
    const nodes = [node("tamper-a", "Tamper stable title")];
    const memberNodeIds = ["tamper-a"];
    const calls: LlmStationRequest[] = [];
    const outputJson = titleBatch([{
      baseRootProposalId: baseRootId(memberNodeIds),
      title: "Tamper Stable Title",
    }]);
    const input = {
      graphOutput: graph([community(memberNodeIds)], 1),
      ...boundLookup(nodes),
      previousAcceptedRoots: [] as TaskMapPreviousAcceptedRootV1[],
    };
    await buildTaskMapCommunityRootProposals({
      ...input,
      llmStation: station(outputJson, calls),
    });
    const valid: LlmStationEnvelope = {
      stationId: "community-title-v1",
      model: "recorded-title-model",
      promptDigest: taskMapContractDigest(calls[0].promptText),
      inputDigest: calls[0].inputDigest,
      outputJson,
      producedAt: OCCURRED_AT,
      transport: "gemini-remote",
    };
    const tampered: LlmStationEnvelope[] = [
      { ...valid, stationId: "community-grouping-v1" },
      { ...valid, inputDigest: digest("wrong-input") },
      { ...valid, promptDigest: digest("wrong-prompt") },
      { ...valid, transport: "unsafe-transport" as "gemini-remote" },
      { ...valid, model: "/private/model" },
      { ...valid, model: "sk-proj-abcdefghijklmnop" },
      { ...valid, producedAt: "2026-08-16T05:00:00-07:00" },
      { ...valid, outputJson: '{"titles":[{"baseRootProposalId":"unknown","title":"Wrong"}]}' },
    ];
    for (const recordedTitleEnvelope of tampered) {
      await assert.rejects(
        () => buildTaskMapCommunityRootProposals({
          ...input,
          recordedTitleEnvelope,
        }),
        /recorded title envelope/i,
      );
    }
  });

  it("fails closed when a new base ID collides with an unmatched historical root", async () => {
    const nodes = [node("collision-current")];
    const collidingId = baseRootId(["collision-current"]);
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph([community(["collision-current"])], 1),
        ...boundLookup(nodes),
        previousAcceptedRoots: [{
          rootProposalId: collidingId,
          memberNodeIds: ["different-history-member"],
        }],
      }),
      /base ID collides with an unmatched historical root/,
    );
  });

  it("fails closed on every previous-root budget before title generation", async () => {
    const calls: LlmStationRequest[] = [];
    const base = {
      graphOutput: graph([community(["bounded-current"])], 1),
      ...boundLookup([node("bounded-current")]),
      llmStation: station('{"titles":[]}', calls),
    };
    const countOverflow = Array.from(
      { length: TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots + 1 },
      (_, index) => ({
        rootProposalId: `count-root-${index}`,
        memberNodeIds: [`count-member-${index}`],
      }),
    );
    const perRootOverflow = [{
      rootProposalId: "per-root-overflow",
      memberNodeIds: Array.from(
        {
          length:
            TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
              .maxMembersPerPreviousRoot + 1,
        },
        (_, index) => `per-root-member-${index}`,
      ),
    }];
    const aggregateOverflow: TaskMapPreviousAcceptedRootV1[] = [];
    let aggregateMember = 0;
    while (
      aggregateMember
        <= TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal
    ) {
      const memberNodeIds = Array.from(
        {
          length: Math.min(
            TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
              .maxMembersPerPreviousRoot,
            TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
              .maxPreviousMembersTotal + 1 - aggregateMember,
          ),
        },
        () => `aggregate-member-${aggregateMember++}`,
      );
      aggregateOverflow.push({
        rootProposalId: `aggregate-root-${aggregateOverflow.length}`,
        memberNodeIds,
      });
    }
    const byteHeavyMembers = Array.from(
      {
        length:
          TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
            .maxPreviousMembersTotal,
      },
      (_, index) => {
        const prefix = `byte-member-${String(index).padStart(4, "0")}-`;
        return `${prefix}${"x".repeat(300 - prefix.length)}`;
      },
    );
    const byteOverflow: TaskMapPreviousAcceptedRootV1[] = [];
    for (
      let offset = 0;
      offset < byteHeavyMembers.length;
      offset += TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
        .maxMembersPerPreviousRoot
    ) {
      byteOverflow.push({
        rootProposalId: `byte-root-${byteOverflow.length}`,
        memberNodeIds: byteHeavyMembers.slice(
          offset,
          offset + TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
            .maxMembersPerPreviousRoot,
        ),
      });
    }
    for (const [previousAcceptedRoots, expected] of [
      [countOverflow, /previousAcceptedRoots exceeds its count limit/],
      [perRootOverflow, /previous root exceeds its member limit/],
      [aggregateOverflow, /previous roots exceed their aggregate member limit/],
      [byteOverflow, /previous roots exceed their canonical byte limit/],
    ] as const) {
      await assert.rejects(
        () => buildTaskMapCommunityRootProposals({
          ...base,
          previousAcceptedRoots,
        }),
        expected,
      );
    }
    assert.equal(calls.length, 0);
  });

  it("fails closed when canonical proposal output exceeds its byte budget", async () => {
    const nodes = Array.from({ length: 200 }, (_, index) => {
      const prefix = `output-node-${String(index).padStart(3, "0")}-`;
      return node(
        `${prefix}${"n".repeat(500 - prefix.length)}`,
        `Output byte fixture ${index}`,
      );
    });
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph(
          nodes.map((candidate) => community([candidate.nodeId])),
          nodes.length,
        ),
        ...boundLookup(nodes),
        previousAcceptedRoots: nodes.map((candidate, index) => ({
          rootProposalId: `accepted-output-${index}`,
          memberNodeIds: [candidate.nodeId],
        })),
      }),
      /proposal output exceeds its canonical byte limit/,
    );
  });

  it("binds a canonical privacy-safe node lookup and rejects mutation or text overflow at entry", async () => {
    const mutable = node(
      "digest-bound-node",
      "Bound lookup from /Users/neo/private with password=first-secret",
    );
    const binding = boundLookup([mutable]);
    mutable.text = "Mutated title evidence";
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph([community([mutable.nodeId])], 1),
        ...binding,
        previousAcceptedRoots: [],
      }),
      /nodeLookupDigest does not match/,
    );
    for (const [text, expected] of [
      ["x".repeat(481), /node text exceeds its character limit/],
    ] as const) {
      const oversized = node("oversized-node", text);
      await assert.rejects(
        () => buildTaskMapCommunityRootProposals({
          graphOutput: graph([community([oversized.nodeId])], 1),
          nodeLookup: lookup([oversized]),
          nodeLookupDigest: digest("fabricated-node-lookup"),
          previousAcceptedRoots: [],
        }),
        expected,
      );
    }
    const utf8Boundary = node("utf8-boundary", "界".repeat(480));
    const boundaryResult = await buildTaskMapCommunityRootProposals({
      graphOutput: graph([community([utf8Boundary.nodeId])], 1),
      ...boundLookup([utf8Boundary]),
      previousAcceptedRoots: [],
    });
    assert.equal(boundaryResult.proposals.length, 1);
  });

  it("binds every exact node field including embedding and delegates fabricated-row rejection to A1", async () => {
    const embedding = Array<number>(768).fill(0);
    embedding[0] = 1;
    const original = {
      ...node("all-fields-node", "All fields title", "calendar"),
      externalRefs: [digest("all-fields-ref")],
      embedding,
    };
    const originalBinding = boundLookup([original]);
    const mutations: TaskMapCommunityGraphNodeInputV1[] = [
      { ...original, nodeId: "all-fields-node-mutated" },
      { ...original, text: "All fields title mutated" },
      { ...original, sourceFamily: "meeting" },
      { ...original, routingDigest: digest("mutated-routing") },
      { ...original, occurredAt: "2026-08-15T12:00:00.000Z" },
      { ...original, externalRefs: [digest("mutated-ref")] },
      {
        ...original,
        embedding: original.embedding.map((coordinate, index) =>
          index === 0 ? coordinate + 0.25 : coordinate
        ),
      },
      { ...original, isCalendarCommitment: true },
    ];
    for (const mutated of mutations) {
      await assert.rejects(
        () => buildTaskMapCommunityRootProposals({
          graphOutput: graph([community([original.nodeId])], 1),
          nodeLookup: lookup([mutated]),
          nodeLookupDigest: originalBinding.nodeLookupDigest,
          previousAcceptedRoots: [],
        }),
        /nodeLookupDigest does not match/,
      );
    }

    const invalidRows: TaskMapCommunityGraphNodeInputV1[] = [
      { ...original, routingDigest: "not-a-digest" },
      { ...original, occurredAt: "yesterday" },
      { ...original, externalRefs: ["https://example.com/private"] },
      { ...original, embedding: [1] },
      {
        ...original,
        embedding: original.embedding.map((coordinate, index) =>
          index === 1 ? Number.NaN : coordinate
        ),
      },
      {
        ...original,
        sourceFamily: "agent",
        isCalendarCommitment: true,
      },
      { ...original, nodeId: "lone-surrogate-\uD800" },
    ];
    for (const invalid of invalidRows) {
      assert.throws(
        () => taskMapCommunityRootNodeLookupDigest(lookup([invalid])),
        /Task Map community graph brain/,
      );
    }
    const extraField = {
      ...original,
      unexpected: true,
    } as TaskMapCommunityGraphNodeInputV1;
    assert.throws(
      () => taskMapCommunityRootNodeLookupDigest(lookup([extraField])),
      /Task Map community graph brain/,
    );
  });

  it("rejects duplicate base root proposal identities before matching or titles", async () => {
    const nodes = [node("duplicate-base-member")];
    const calls: LlmStationRequest[] = [];
    await assert.rejects(
      () => buildTaskMapCommunityRootProposals({
        graphOutput: graph([
          community(["duplicate-base-member"]),
          community(["duplicate-base-member"]),
        ], 1),
        ...boundLookup(nodes),
        previousAcceptedRoots: [],
        llmStation: station('{"titles":[]}', calls),
      }),
      /duplicate baseRootProposalId/,
    );
    assert.equal(calls.length, 0);
  });
});
