import * as assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import type { EmbeddingProvider } from "../src/engine/embeddings/provider.js";
import {
  TASKMAP_GRAPH_BRAIN_LIMITS_V1,
  type TaskMapCommunityGraphNodeInputV1,
} from "../src/engine/taskmap/community-graph-brain.js";
import {
  TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1,
  buildTaskMapCommunitySemanticEvidence,
  defaultTaskMapCommunityEmbeddingCachePath,
  defaultTaskMapCommunityGroupingReplayPath,
  type TaskMapCommunitySemanticEvidenceInputV1,
} from "../src/engine/taskmap/community-semantic-evidence.js";
import type {
  LlmStation,
  LlmStationEnvelope,
  LlmStationRequest,
} from "../src/engine/taskmap/llm-station.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const PRODUCED_AT = "2026-08-17T12:00:00.000Z";
const SECRET = "secret-provider-token";

function digest(label: string): string {
  return taskMapContractDigest(`community-semantic:${label}`);
}

function node(
  nodeId: string,
  text = `Bounded semantic text for ${nodeId}`,
): TaskMapCommunityGraphNodeInputV1 {
  return {
    nodeId,
    text,
    sourceFamily: "agent",
    routingDigest: digest(`route:${nodeId}`),
    occurredAt: "2026-08-17T10:00:00.000Z",
    externalRefs: [],
    embedding: null,
    isCalendarCommitment: false,
  };
}

function vector(seed: number): number[] {
  const values = new Array<number>(TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions)
    .fill(0);
  values[0] = seed + 1;
  values[1] = 1;
  return values;
}

function fakeEmbeddingProvider(
  calls: string[][],
  implementation: (texts: string[]) => Promise<number[][]> = async (texts) =>
    texts.map((_text, index) => vector(index)),
): EmbeddingProvider {
  return {
    embed: async (texts) => {
      calls.push([...texts]);
      return implementation(texts);
    },
  };
}

function station(
  rawOutput: string,
  calls: LlmStationRequest[],
  overrides: Partial<LlmStationEnvelope> = {},
): LlmStation {
  const transport = overrides.transport ?? "gemini-remote";
  return {
    provider: {
      transport,
      executable: transport === "gemini-remote" ? "remote-api" : "/fixture/provider",
      args: [],
      model: "fixture-grouping-model",
    },
    run: async (request) => {
      calls.push(request);
      return {
        stationId: "community-grouping-v1",
        model: "fixture-grouping-model",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: rawOutput,
        producedAt: PRODUCED_AT,
        transport,
        ...overrides,
      };
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "taskmap-community-semantic-"));
  const cacheDirectory = path.join(root, "cache");
  await mkdir(cacheDirectory, { mode: 0o700 });
  return {
    root,
    groupingReplayPath: path.join(cacheDirectory, "grouping-replay"),
    embeddingCachePath: path.join(cacheDirectory, "embeddings.json"),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function replayEntryPaths(replayDirectory: string): Promise<string[]> {
  return (await readdir(replayDirectory))
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .sort()
    .map((name) => path.join(replayDirectory, name));
}

function groupingReplayKeyForNodes(
  nodes: readonly TaskMapCommunityGraphNodeInputV1[],
): string {
  const boundedNodes = [...nodes]
    .sort((left, right) => left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0)
    .map((candidate) => ({
      nodeId: candidate.nodeId,
      text: candidate.text.trim().replace(/\s+/gu, " "),
    }));
  const inputDigest = taskMapContractDigest({ nodes: boundedNodes });
  const promptText = [
    "Group nodes by one durable workstream intent that can span repositories and weeks.",
    "Do not group nodes only because they share a repository, file, operational wrapper, or shared delivery medium.",
    "Keep concurrent product, fundraising, content, event, landing, partnership, and operations work distinct when their dominant intent differs.",
    "Leave ambiguous or genuinely multi-workstream nodes ungrouped instead of mixing themes.",
    "Return strict JSON with exactly this shape: {\"groups\":[{\"nodeIds\":[\"...\"]}]}",
    "Use each known nodeId at most once. Do not invent IDs or include prose.",
    taskMapContractCanonicalJson({ nodes: boundedNodes }),
  ].join("\n");
  return taskMapContractDigest({
    inputDigest,
    promptDigest: taskMapContractDigest(promptText),
  });
}

describe("Task Map community semantic evidence bridge", () => {
  it("groups once through the bounded station and sorts strict output deterministically", async () => {
    const f = await fixture();
    const calls: LlmStationRequest[] = [];
    try {
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-c"), node("node-a"), node("node-b")],
        station: station(
          '{"groups":[{"nodeIds":["node-b","node-a"]}]}',
          calls,
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.stationId, "community-grouping-v1");
      assert.ok(Buffer.byteLength(calls[0]?.promptText ?? "") <= 64 * 1_024);
      assert.match(calls[0]?.promptText ?? "", /durable workstream intent/i);
      assert.match(calls[0]?.promptText ?? "", /span repositories and weeks/i);
      assert.match(calls[0]?.promptText ?? "", /shared delivery medium/i);
      assert.deepEqual(result.semanticGroups.map((group) => group.memberNodeIds), [
        ["node-a", "node-b"],
      ]);
      assert.ok(result.semanticGroups.every((group) =>
        group.source === "llm_grouping"
        && /^[a-f0-9]{64}$/.test(group.sourceDigest)
        && /^tmsg_[a-f0-9]{24}$/.test(group.groupId)
      ));
      assert.equal(result.report.grouping.state, "available");
      assert.equal(result.report.grouping.transport, "gemini-remote");
      assert.deepEqual(result.report.groupingCoverage, {
        groupedNodeCount: 2,
        totalNodeCount: 3,
        ratio: 2 / 3,
      });
      assert.equal(result.report.semanticEdgeCoverage.groupingPairCount, 1);
      assert.deepEqual(result.report.authority, {
        graphMutated: false,
        nodesMerged: false,
        acceptanceGranted: false,
      });
    } finally {
      await f.cleanup();
    }
  });

  it("fails open for unknown, duplicate, malformed, mismatched, and unavailable grouping", async () => {
    const invalidCases: Array<{
      output?: string;
      overrides?: Partial<LlmStationEnvelope>;
      providerTransport?: LlmStationEnvelope["transport"];
      throws?: boolean;
    }> = [
      { output: '{"groups":[{"nodeIds":["unknown"]}]}' },
      { output: '{"groups":[{"nodeIds":["node-a"]}]}' },
      { output: '{"groups":[{"nodeIds":["node-a","node-a"]}]}' },
      { output: '{"groups":[{"nodeIds":["node-a"]},{"nodeIds":["node-a"]}]}' },
      { output: '{"groups":[],"groups":[]}' },
      { output: '{"groups":[],"secret":"' + SECRET + '"}' },
      { output: "not-json" },
      {
        output: '{"groups":[]}',
        overrides: { transport: "codex-cli" },
        providerTransport: "gemini-remote",
      },
      { output: '{"groups":[]}', overrides: { producedAt: "not-a-time" } },
      { throws: true },
    ];
    for (const [index, invalid] of invalidCases.entries()) {
      const f = await fixture();
      try {
        const calls: LlmStationRequest[] = [];
        const injected = invalid.throws
          ? {
              provider: {
                transport: "gemini-remote" as const,
                executable: "remote-api",
                args: [],
                model: "fixture-grouping-model",
              },
              run: async () => { throw new Error(`${SECRET}-${index}`); },
            }
          : (() => {
              const created = station(invalid.output!, calls, invalid.overrides);
              return invalid.providerTransport === undefined
                ? created
                : {
                    ...created,
                    provider: {
                      ...created.provider,
                      transport: invalid.providerTransport,
                    },
                  };
            })();
        const result = await buildTaskMapCommunitySemanticEvidence({
          nodes: [node("node-a"), node("node-b")],
          station: injected,
          groupingReplayPath: f.groupingReplayPath,
          embeddingCachePath: f.embeddingCachePath,
        });
        assert.deepEqual(result.semanticGroups, []);
        assert.equal(result.report.grouping.state, "unavailable");
        assert.ok(!JSON.stringify(result).includes(SECRET));
      } finally {
        await f.cleanup();
      }
    }
  });

  it("drops only a group contaminated by an invented node id", async () => {
    const f = await fixture();
    try {
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a"), node("node-b"), node("node-c"), node("node-d")],
        station: station(
          '{"groups":['
          + '{"nodeIds":["node-a","node-b"]},'
          + '{"nodeIds":["node-c","invented-node"]}'
          + ']}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });

      assert.equal(result.report.grouping.state, "available");
      assert.deepEqual(
        result.semanticGroups.map((group) => group.memberNodeIds),
        [["node-a", "node-b"]],
      );
      assert.equal(
        taskMapContractCanonicalJson(result).includes("invented-node"),
        false,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("records a private replay and reproduces the complete output byte-identically without a provider", async () => {
    const f = await fixture();
    const nodes = [node("node-a", "Private source text A"), node("node-b", "Private source text B")];
    const calls: LlmStationRequest[] = [];
    try {
      const first = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        station: station('{"groups":[{"nodeIds":["node-b","node-a"]}]}', calls),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      const replayed = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });

      assert.equal(taskMapContractCanonicalJson(replayed), taskMapContractCanonicalJson(first));
      const replayEntries = await replayEntryPaths(f.groupingReplayPath);
      assert.equal(replayEntries.length, 1);
      assert.equal((await lstat(replayEntries[0]!)).mode & 0o777, 0o600);
      const persisted = await readFile(replayEntries[0]!, "utf8");
      assert.ok(!persisted.includes("Private source text"));
      assert.ok(!persisted.includes(SECRET));
      assert.ok(!persisted.includes(f.root));
    } finally {
      await f.cleanup();
    }
  });

  it("keeps concurrent distinct replay writers and bounds a full immutable replay directory", async () => {
    const f = await fixture();
    try {
      const makeInput = (index: number): TaskMapCommunitySemanticEvidenceInputV1 => ({
        nodes: [node(`node-${index}-a`), node(`node-${index}-b`)],
        station: station(
          `{"groups":[{"nodeIds":["node-${index}-a","node-${index}-b"]}]}`,
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      const concurrent = await Promise.all([
        buildTaskMapCommunitySemanticEvidence(makeInput(0)),
        buildTaskMapCommunitySemanticEvidence(makeInput(1)),
      ]);
      assert.ok(concurrent.every((result) => result.report.grouping.state === "available"));
      assert.equal((await replayEntryPaths(f.groupingReplayPath)).length, 2);

      for (
        let index = 2;
        index < TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries;
        index += 1
      ) {
        await buildTaskMapCommunitySemanticEvidence(makeInput(index));
      }
      assert.equal(
        (await replayEntryPaths(f.groupingReplayPath)).length,
        TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries,
      );
      for (const index of [0, 1, TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries - 1]) {
        const replayed = await buildTaskMapCommunitySemanticEvidence({
          ...makeInput(index),
          station: undefined,
        });
        assert.equal(replayed.report.grouping.state, "available");
      }

      const overflow = await buildTaskMapCommunitySemanticEvidence(
        makeInput(TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries),
      );
      assert.equal(overflow.report.grouping.state, "available");
      const overflowReplay = await buildTaskMapCommunitySemanticEvidence({
        ...makeInput(TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries),
        station: undefined,
      });
      assert.equal(overflowReplay.report.grouping.state, "available");
      assert.equal(
        (await replayEntryPaths(f.groupingReplayPath)).length,
        TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("protects concurrent full-capacity keys briefly, then prunes old keys deterministically", async () => {
    const f = await fixture();
    const candidates = Array.from({ length: 256 }, (_value, index) => {
      const nodes = [node(`grace-${index}-a`), node(`grace-${index}-b`)];
      return { index, nodes, replayKey: groupingReplayKeyForNodes(nodes) };
    }).sort((left, right) => (
      left.replayKey < right.replayKey ? 1 : left.replayKey > right.replayKey ? -1 : 0
    ));
    const [firstNew, secondNew, laterNew] = candidates;
    const old = candidates.slice(
      3,
      3 + TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries,
    );
    const inputFor = (
      candidate: typeof candidates[number],
      now: number,
    ): TaskMapCommunitySemanticEvidenceInputV1 => ({
      nodes: candidate.nodes,
      station: station(
        `{"groups":[{"nodeIds":["grace-${candidate.index}-a","grace-${candidate.index}-b"]}]}`,
        [],
      ),
      groupingReplayPath: f.groupingReplayPath,
      embeddingCachePath: f.embeddingCachePath,
      storageHooksForTesting: { now: () => now } as unknown as NonNullable<
        TaskMapCommunitySemanticEvidenceInputV1["storageHooksForTesting"]
      >,
    });
    try {
      for (const candidate of old) {
        await buildTaskMapCommunitySemanticEvidence(inputFor(candidate, 0));
      }
      await Promise.all([
        buildTaskMapCommunitySemanticEvidence(inputFor(firstNew!, 10_000)),
        buildTaskMapCommunitySemanticEvidence(inputFor(secondNew!, 10_000)),
      ]);
      for (const candidate of [firstNew!, secondNew!]) {
        const replayed = await buildTaskMapCommunitySemanticEvidence({
          ...inputFor(candidate, 10_000),
          station: undefined,
        });
        assert.equal(replayed.report.grouping.state, "available");
      }
      assert.ok(
        (await replayEntryPaths(f.groupingReplayPath)).length
          <= TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries + 16,
      );

      const beforeLater = await replayEntryPaths(f.groupingReplayPath);
      await buildTaskMapCommunitySemanticEvidence(inputFor(laterNew!, 20_000));
      const afterLater = await replayEntryPaths(f.groupingReplayPath);
      assert.equal(
        afterLater.length,
        TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries,
      );
      const laterPath = path.join(f.groupingReplayPath, `${laterNew!.replayKey}.json`);
      assert.ok(afterLater.includes(laterPath));
      const expected = [...beforeLater, laterPath]
        .filter((candidate, index, values) => values.indexOf(candidate) === index);
      const newerPriorPaths = new Set([
        path.join(f.groupingReplayPath, `${firstNew!.replayKey}.json`),
        path.join(f.groupingReplayPath, `${secondNew!.replayKey}.json`),
      ]);
      while (expected.length > TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries) {
        const olderCandidates = [...expected]
          .filter((candidate) => candidate !== laterPath && !newerPriorPaths.has(candidate));
        const eviction = (olderCandidates.length > 0
          ? olderCandidates
          : [...expected].filter((candidate) => candidate !== laterPath))
          .sort()
          .at(-1)!;
        expected.splice(expected.indexOf(eviction), 1);
      }
      assert.deepEqual(afterLater, expected.sort());
    } finally {
      await f.cleanup();
    }
  });

  it("serializes a seventeen-writer burst at full capacity and retains every new key", async () => {
    const f = await fixture();
    const inputFor = (prefix: string, index: number, now: number) => ({
      nodes: [node(`${prefix}-${index}-a`), node(`${prefix}-${index}-b`)],
      station: station(
        `{"groups":[{"nodeIds":["${prefix}-${index}-a","${prefix}-${index}-b"]}]}`,
        [],
      ),
      groupingReplayPath: f.groupingReplayPath,
      embeddingCachePath: f.embeddingCachePath,
      storageHooksForTesting: { now: () => now },
    });
    try {
      for (
        let index = 0;
        index < TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries;
        index += 1
      ) {
        await buildTaskMapCommunitySemanticEvidence(inputFor("old", index, 0));
      }
      const burst = Array.from({ length: 17 }, (_value, index) =>
        inputFor("new", index, 10_000));
      await Promise.all(burst.map((input) =>
        buildTaskMapCommunitySemanticEvidence(input)));
      assert.equal(
        (await replayEntryPaths(f.groupingReplayPath)).length,
        TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxGroupingReplayEntries,
      );
      for (const input of burst) {
        const replayed = await buildTaskMapCommunitySemanticEvidence({
          ...input,
          station: undefined,
        });
        assert.equal(replayed.report.grouping.state, "available");
      }
    } finally {
      await f.cleanup();
    }
  });

  it("recovers dead or expired leased locks but boundedly waits on a live lease", async () => {
    for (const owner of [
      { pid: 999_999, createdAt: "1970-01-01T00:00:10.000Z", alive: false, records: true, now: 10_000 },
      { pid: process.pid, createdAt: "1970-01-01T00:00:00.000Z", alive: true, records: true, now: 40_000 },
      { pid: process.pid, createdAt: "1970-01-01T00:00:10.000Z", alive: true, records: false, now: 10_000 },
    ]) {
      const f = await fixture();
      const lockPath = path.join(f.groupingReplayPath, ".capacity.lock");
      try {
        await mkdir(f.groupingReplayPath, { mode: 0o700 });
        await writeFile(lockPath, taskMapContractCanonicalJson({
          contractVersion: "taskmap-community-replay-capacity-lock.v1",
          createdAt: owner.createdAt,
          generation: "a".repeat(32),
          pid: owner.pid,
        }), { mode: 0o600 });
        const nodes = [node("lease-a"), node("lease-b")];
        const input = {
          nodes,
          station: station(
            '{"groups":[{"nodeIds":["lease-a","lease-b"]}]}',
            [],
          ),
          groupingReplayPath: f.groupingReplayPath,
          embeddingCachePath: f.embeddingCachePath,
          storageHooksForTesting: {
            now: () => owner.now,
            isPidAlive: () => owner.alive,
            lockRetryCount: 20,
          },
        };
        const result = await buildTaskMapCommunitySemanticEvidence(input);
        assert.equal(result.report.grouping.state, "available");
        const replayed = await buildTaskMapCommunitySemanticEvidence({
          ...input,
          station: undefined,
        });
        assert.equal(
          replayed.report.grouping.state,
          owner.records ? "available" : "unavailable",
        );
        assert.equal(
          (await readdir(f.groupingReplayPath)).includes(".capacity.lock"),
          !owner.records,
        );
      } finally {
        await f.cleanup();
      }
    }
  });

  it("creates a fresh full lease after waiting near the retry boundary", async () => {
    const f = await fixture();
    const lockPath = path.join(f.groupingReplayPath, ".capacity.lock");
    let now = 1_000;
    let acquiredCreatedAt: string | undefined;
    try {
      await mkdir(f.groupingReplayPath, { mode: 0o700 });
      await writeFile(lockPath, taskMapContractCanonicalJson({
        contractVersion: "taskmap-community-replay-capacity-lock.v1",
        createdAt: new Date(now).toISOString(),
        generation: "b".repeat(32),
        pid: process.pid,
      }), { mode: 0o600 });
      const input = {
        nodes: [node("fresh-lease-a"), node("fresh-lease-b")],
        station: station(
          '{"groups":[{"nodeIds":["fresh-lease-a","fresh-lease-b"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          now: () => now,
          isPidAlive: () => true,
          onLockRetry: async (attempt: number, fixedLockPath: string) => {
            if (attempt !== 300) return;
            now = 20_000;
            await rm(fixedLockPath, { force: true });
          },
          afterLockAcquired: async (owner: { createdAt: string }) => {
            acquiredCreatedAt = owner.createdAt;
          },
        },
      };
      const result = await buildTaskMapCommunitySemanticEvidence(input);
      assert.equal(result.report.grouping.state, "available");
      assert.equal(acquiredCreatedAt, new Date(20_000).toISOString());
      assert.equal(
        Date.parse(acquiredCreatedAt!) + 30_000 - now,
        30_000,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("quarantines atomically and never deletes a replacement generation", async () => {
    const f = await fixture();
    const lockPath = path.join(f.groupingReplayPath, ".capacity.lock");
    const displacedA = path.join(f.groupingReplayPath, "displaced-a.lock");
    const generationB = "d".repeat(32);
    let swapped = false;
    try {
      await mkdir(f.groupingReplayPath, { mode: 0o700 });
      await writeFile(lockPath, taskMapContractCanonicalJson({
        contractVersion: "taskmap-community-replay-capacity-lock.v1",
        createdAt: "1970-01-01T00:00:00.000Z",
        generation: "c".repeat(32),
        pid: 999_999,
      }), { mode: 0o600 });
      const input = {
        nodes: [node("swap-a"), node("swap-b")],
        station: station(
          '{"groups":[{"nodeIds":["swap-a","swap-b"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          now: () => 10_000,
          isPidAlive: (pid: number) => pid === process.pid,
          beforeLockQuarantine: async (fixedLockPath: string) => {
            if (swapped) return;
            swapped = true;
            await rename(fixedLockPath, displacedA);
            await writeFile(fixedLockPath, taskMapContractCanonicalJson({
              contractVersion: "taskmap-community-replay-capacity-lock.v1",
              createdAt: "1970-01-01T00:00:10.000Z",
              generation: generationB,
              pid: process.pid,
            }), { mode: 0o600 });
          },
          lockRetryCount: 20,
        },
      };
      await buildTaskMapCommunitySemanticEvidence(input);
      const surviving = JSON.parse(await readFile(lockPath, "utf8")) as {
        generation: string;
        pid: number;
      };
      assert.equal(swapped, true);
      assert.equal(surviving.generation, generationB);
      assert.equal(surviving.pid, process.pid);
    } finally {
      await f.cleanup();
    }
  });

  it("backs C off when B becomes a live quarantine between C checks", async () => {
    const f = await fixture();
    const lockPath = path.join(f.groupingReplayPath, ".capacity.lock");
    const displacedA = path.join(f.groupingReplayPath, "abc-displaced-a.lock");
    let signalBQuarantined!: () => void;
    const bQuarantined = new Promise<void>((resolve) => { signalBQuarantined = resolve; });
    let releaseQuarantineValidation!: () => void;
    const mayValidate = new Promise<void>((resolve) => {
      releaseQuarantineValidation = resolve;
    });
    let cAcquisitions = 0;
    let swapped = false;
    try {
      await mkdir(f.groupingReplayPath, { mode: 0o700 });
      await writeFile(lockPath, taskMapContractCanonicalJson({
        contractVersion: "taskmap-community-replay-capacity-lock.v1",
        createdAt: "1970-01-01T00:00:00.000Z",
        generation: "1".repeat(32),
        pid: 999_999,
      }), { mode: 0o600 });
      const aInput = {
        nodes: [node("abc-a-1"), node("abc-a-2")],
        station: station(
          '{"groups":[{"nodeIds":["abc-a-1","abc-a-2"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          now: () => 10_000,
          isPidAlive: (pid: number) => pid === process.pid,
          beforeLockQuarantine: async (fixedLockPath: string) => {
            if (swapped) return;
            swapped = true;
            await rename(fixedLockPath, displacedA);
            await writeFile(fixedLockPath, taskMapContractCanonicalJson({
              contractVersion: "taskmap-community-replay-capacity-lock.v1",
              createdAt: "1970-01-01T00:00:10.000Z",
              generation: "2".repeat(32),
              pid: process.pid,
            }), { mode: 0o600 });
          },
          afterLockQuarantined: async () => {
            signalBQuarantined();
            await mayValidate;
          },
          lockRetryCount: 600,
        },
      };
      const aRun = buildTaskMapCommunitySemanticEvidence(aInput);
      let quarantineTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          bQuarantined,
          new Promise<never>((_resolve, reject) => {
            quarantineTimeout = setTimeout(
              () => reject(new Error("B quarantine hook was not observed")),
              500,
            );
          }),
        ]);
      } finally {
        if (quarantineTimeout !== undefined) clearTimeout(quarantineTimeout);
      }

      const cInput = {
        nodes: [node("abc-c-1"), node("abc-c-2")],
        station: station(
          '{"groups":[{"nodeIds":["abc-c-1","abc-c-2"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          now: () => 10_000,
          isPidAlive: () => true,
          afterLockAcquired: async () => { cAcquisitions += 1; },
          lockRetryCount: 600,
        },
      };
      const cRun = buildTaskMapCommunitySemanticEvidence(cInput);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(cAcquisitions, 0);
      assert.ok((await readdir(f.groupingReplayPath)).some((name) =>
        name.includes(`quarantine.${"1".repeat(32)}`)
        || name.includes(`quarantine.${"2".repeat(32)}`)
      ));

      releaseQuarantineValidation();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await rm(lockPath, { force: true });
      const [aResult, cResult] = await Promise.all([aRun, cRun]);
      assert.equal(aResult.report.grouping.state, "available");
      assert.equal(cResult.report.grouping.state, "available");
      assert.ok(cAcquisitions >= 1);
    } finally {
      releaseQuarantineValidation?.();
      await f.cleanup();
    }
  });

  it("cleans only dead or expired private lock quarantines", async () => {
    const f = await fixture();
    const deadPath = path.join(
      f.groupingReplayPath,
      `.capacity.lock.quarantine.${"e".repeat(32)}.${"1".repeat(32)}`,
    );
    const livePath = path.join(
      f.groupingReplayPath,
      `.capacity.lock.quarantine.${"f".repeat(32)}.${"2".repeat(32)}`,
    );
    try {
      await mkdir(f.groupingReplayPath, { mode: 0o700 });
      for (const [filePath, pid, createdAt, generation] of [
        [deadPath, 999_999, "1970-01-01T00:00:10.000Z", "e".repeat(32)],
        [livePath, process.pid, "1970-01-01T00:00:20.000Z", "f".repeat(32)],
      ] as const) {
        await writeFile(filePath, taskMapContractCanonicalJson({
          contractVersion: "taskmap-community-replay-capacity-lock.v1",
          createdAt,
          generation,
          pid,
        }), { mode: 0o600 });
      }
      await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("quarantine-a"), node("quarantine-b")],
        station: station(
          '{"groups":[{"nodeIds":["quarantine-a","quarantine-b"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          now: () => 20_000,
          isPidAlive: (pid: number) => pid === process.pid,
          lockRetryCount: 20,
        },
      });
      const names = await readdir(f.groupingReplayPath);
      assert.ok(!names.includes(path.basename(deadPath)));
      assert.ok(names.includes(path.basename(livePath)));
    } finally {
      await f.cleanup();
    }
  });

  it("rejects future replay timestamps after clock rollback and replaces them under lease", async () => {
    const f = await fixture();
    const nodes = [node("rollback-a"), node("rollback-b")];
    const calls: LlmStationRequest[] = [];
    const inputAt = (now: number) => ({
      nodes,
      station: station(
        '{"groups":[{"nodeIds":["rollback-a","rollback-b"]}]}',
        calls,
      ),
      groupingReplayPath: f.groupingReplayPath,
      embeddingCachePath: f.embeddingCachePath,
      storageHooksForTesting: { now: () => now },
    });
    try {
      await buildTaskMapCommunitySemanticEvidence(inputAt(10_000));
      const rolledBack = await buildTaskMapCommunitySemanticEvidence({
        ...inputAt(0),
        station: undefined,
      });
      assert.equal(rolledBack.report.grouping.state, "unavailable");

      const repaired = await buildTaskMapCommunitySemanticEvidence(inputAt(0));
      assert.equal(repaired.report.grouping.state, "available");
      assert.equal(calls.length, 2);
      const replayed = await buildTaskMapCommunitySemanticEvidence({
        ...inputAt(0),
        station: undefined,
      });
      assert.equal(replayed.report.grouping.state, "available");
    } finally {
      await f.cleanup();
    }
  });

  it("rejects symlink storage boundaries and descriptor replacement races", async () => {
    const f = await fixture();
    try {
      await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      const cacheTarget = `${f.embeddingCachePath}.target`;
      await rename(f.embeddingCachePath, cacheTarget);
      const targetBefore = await readFile(cacheTarget);
      await symlink(cacheTarget, f.embeddingCachePath);
      await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-b")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal((await lstat(f.embeddingCachePath)).isSymbolicLink(), true);
      assert.deepEqual(await readFile(cacheTarget), targetBefore);

      const realParent = path.join(f.root, "real-parent");
      const linkedParent = path.join(f.root, "linked-parent");
      await mkdir(realParent, { mode: 0o700 });
      await symlink(realParent, linkedParent);
      await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-c")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: path.join(linkedParent, "replay"),
        embeddingCachePath: path.join(linkedParent, "embeddings.json"),
      });
      assert.deepEqual(await readdir(realParent), []);

      await rm(f.embeddingCachePath);
      await rename(cacheTarget, f.embeddingCachePath);
      const replacementCalls: string[][] = [];
      let replaced = false;
      const racedInput = {
        nodes: [node("node-a")],
        embeddingProvider: fakeEmbeddingProvider(replacementCalls),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
        storageHooksForTesting: {
          afterOpen: async (filePath: string) => {
            if (replaced || filePath !== f.embeddingCachePath) return;
            replaced = true;
            await rename(filePath, `${filePath}.replaced`);
            await writeFile(filePath, "{}", { mode: 0o600 });
          },
        },
      };
      const raced = await buildTaskMapCommunitySemanticEvidence(racedInput);
      assert.equal(replacementCalls.length, 1);
      assert.equal(raced.report.cache.hits, 0);
      assert.equal(raced.report.cache.misses, 1);

      const writeParent = path.join(f.root, "write-race");
      const replacedParent = path.join(f.root, "write-race-replaced");
      const writeCachePath = path.join(writeParent, "embeddings.json");
      await mkdir(writeParent, { mode: 0o700 });
      let replacedParentOnce = false;
      const writeRaceInput = {
        nodes: [node("write-race-node")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: writeCachePath,
        storageHooksForTesting: {
          beforeRename: async (filePath: string) => {
            if (replacedParentOnce || filePath !== writeCachePath) return;
            replacedParentOnce = true;
            await rename(writeParent, replacedParent);
            await mkdir(writeParent, { mode: 0o700 });
          },
        },
      };
      await buildTaskMapCommunitySemanticEvidence(writeRaceInput);
      assert.equal(replacedParentOnce, true);
      assert.ok(!(await readdir(writeParent)).includes("embeddings.json"));
      assert.ok(!(await readdir(replacedParent)).includes("embeddings.json"));
    } finally {
      await f.cleanup();
    }
  });

  it("rejects owned parent and grandparent directories with group or world permissions", async () => {
    for (const mode of [0o777, 0o770]) {
      for (const boundary of ["parent", "grandparent"] as const) {
        const f = await fixture();
        const target = boundary === "parent"
          ? path.dirname(f.embeddingCachePath)
          : f.root;
        try {
          await chmod(target, mode);
          const result = await buildTaskMapCommunitySemanticEvidence({
            nodes: [node(`mode-${mode}-${boundary}`)],
            embeddingProvider: fakeEmbeddingProvider([]),
            embeddingModelId: "embedding-model-v1",
            groupingReplayPath: f.groupingReplayPath,
            embeddingCachePath: f.embeddingCachePath,
          });
          assert.equal(result.report.embedding.state, "available");
          assert.ok(!(await readdir(path.dirname(f.embeddingCachePath))).includes(
            path.basename(f.embeddingCachePath),
          ));
          assert.ok(!(await readdir(path.dirname(f.groupingReplayPath))).includes(
            path.basename(f.groupingReplayPath),
          ));
        } finally {
          await chmod(target, 0o700);
          await f.cleanup();
        }
      }
    }
  });

  it("ignores and safely removes a stale legacy replay capacity lock", async () => {
    const f = await fixture();
    const staleLockPath = path.join(f.groupingReplayPath, ".capacity.lock");
    try {
      await mkdir(f.groupingReplayPath, { mode: 0o700 });
      await writeFile(staleLockPath, "stale legacy lock", { mode: 0o600 });
      const nodes = [node("stale-a"), node("stale-b")];
      const first = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        station: station(
          '{"groups":[{"nodeIds":["stale-a","stale-b"]}]}',
          [],
        ),
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(first.report.grouping.state, "available");
      assert.ok(!(await readdir(f.groupingReplayPath)).includes(".capacity.lock"));
      const replayed = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(replayed.report.grouping.state, "available");
    } finally {
      await f.cleanup();
    }
  });

  it("fails open before station invocation when the canonical grouping prompt exceeds 64 KiB", async () => {
    const f = await fixture();
    let stationCalls = 0;
    const nodes = Array.from(
      { length: TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes },
      (_value, index) => node(
        `node-${index.toString().padStart(3, "0")}-${"i".repeat(180)}`,
        `Text ${index} ${"x".repeat(TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodeTextCharacters - 10)}`,
      ),
    );
    try {
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        station: {
          provider: {
            transport: "gemini-remote",
            executable: "remote-api",
            args: [],
            model: "fixture-grouping-model",
          },
          run: async () => {
            stationCalls += 1;
            throw new Error("must not run");
          },
        },
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(stationCalls, 0);
      assert.equal(result.report.grouping.state, "unavailable");
      assert.equal(result.report.grouping.unavailableReason, "prompt_limit_exceeded");
    } finally {
      await f.cleanup();
    }
  });

  it("rejects path- and credential-shaped node IDs before any provider or persistence", async () => {
    const unsafeNodeIds = [
      "/Users/neo/private-task.json",
      "file:///Users/neo/private-task.json",
      "C:\\Users\\Neo\\private-task.json",
      "\\\\server\\share\\private-task.json",
      "access_token=secret-value",
      "api-key:secret-value",
      "Bearer_secret-value",
      "sk-secret-provider-token",
      "ghp_secret-provider-token",
      "xoxb-secret-provider-token",
    ];
    for (const unsafeNodeId of unsafeNodeIds) {
      const f = await fixture();
      let stationCalls = 0;
      let embeddingCalls = 0;
      try {
        await assert.rejects(
          () => buildTaskMapCommunitySemanticEvidence({
            nodes: [node(unsafeNodeId)],
            station: {
              provider: {
                transport: "gemini-remote",
                executable: "remote-api",
                args: [],
                model: "fixture-grouping-model",
              },
              run: async () => {
                stationCalls += 1;
                throw new Error("must not run");
              },
            },
            embeddingProvider: {
              embed: async () => {
                embeddingCalls += 1;
                return [vector(0)];
              },
            },
            embeddingModelId: "embedding-model-v1",
            groupingReplayPath: f.groupingReplayPath,
            embeddingCachePath: f.embeddingCachePath,
          }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /unsafe node id/i);
            assert.ok(!error.message.includes(unsafeNodeId));
            return true;
          },
        );
        assert.equal(stationCalls, 0);
        assert.equal(embeddingCalls, 0);
        assert.ok(!(await readdir(path.dirname(f.groupingReplayPath))).includes(
          path.basename(f.groupingReplayPath),
        ));
        assert.ok(!(await readdir(path.dirname(f.embeddingCachePath))).includes(
          path.basename(f.embeddingCachePath),
        ));
      } finally {
        await f.cleanup();
      }
    }
  });

  it("rejects path- and credential-shaped model provenance before persistence", async () => {
    for (const unsafeModel of [
      "/Users/neo/private-model",
      "file:///private/model",
      "C:\\Models\\private",
      "access_token=private-model-token",
      "sk-private-model-token",
    ]) {
      const f = await fixture();
      try {
        await assert.rejects(
          () => buildTaskMapCommunitySemanticEvidence({
            nodes: [node("node-a")],
            station: {
              provider: {
                transport: "gemini-remote",
                executable: "remote-api",
                args: [],
                model: unsafeModel,
              },
              run: async () => { throw new Error("must not run"); },
            },
            groupingReplayPath: f.groupingReplayPath,
            embeddingCachePath: f.embeddingCachePath,
          }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /unsafe model provenance/i);
            assert.ok(!error.message.includes(unsafeModel));
            return true;
          },
        );
        await assert.rejects(
          () => buildTaskMapCommunitySemanticEvidence({
            nodes: [node("node-a")],
            embeddingProvider: fakeEmbeddingProvider([]),
            embeddingModelId: unsafeModel,
            groupingReplayPath: f.groupingReplayPath,
            embeddingCachePath: f.embeddingCachePath,
          }),
          /unsafe model provenance/i,
        );
        await assert.rejects(
          () => buildTaskMapCommunitySemanticEvidence({
            nodes: [node("node-a"), node("node-b")],
            station: station(
              '{"groups":[{"nodeIds":["node-a","node-b"]}]}',
              [],
              { model: unsafeModel },
            ),
            groupingReplayPath: f.groupingReplayPath,
            embeddingCachePath: f.embeddingCachePath,
          }),
          /unsafe model provenance/i,
        );
        assert.deepEqual(await readdir(path.dirname(f.embeddingCachePath)), []);
      } finally {
        await f.cleanup();
      }
    }
  });

  it("batches only embedding cache misses and treats model changes as misses", async () => {
    const f = await fixture();
    try {
      const firstCalls: string[][] = [];
      const first = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a"), node("node-b")],
        embeddingProvider: fakeEmbeddingProvider(firstCalls),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(first.report.cache.hits, 0);
      assert.equal(first.report.cache.misses, 2);
      assert.equal(firstCalls.length, 1);
      assert.equal(first.report.embedding.coverage.embeddedNodeCount, 2);
      assert.deepEqual(first.report.semanticEdgeCoverage, {
        totalPairCount: 1,
        groupingPairCount: 0,
        embeddingPairCount: 1,
        coveredPairCount: 1,
        ratio: 1,
      });

      const cacheOnly = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-b"), node("node-a")],
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(cacheOnly.report.embedding.state, "available");
      assert.equal(cacheOnly.report.cache.hits, 2);
      assert.equal(cacheOnly.report.cache.misses, 0);

      const secondCalls: string[][] = [];
      const second = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-c"), node("node-b"), node("node-a")],
        embeddingProvider: fakeEmbeddingProvider(secondCalls),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(second.report.cache.hits, 2);
      assert.equal(second.report.cache.misses, 1);
      assert.deepEqual(secondCalls, [["Bounded semantic text for node-c"]]);

      const mismatchCalls: string[][] = [];
      const mismatch = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a"), node("node-b"), node("node-c")],
        embeddingProvider: fakeEmbeddingProvider(mismatchCalls),
        embeddingModelId: "embedding-model-v2",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(mismatch.report.cache.hits, 0);
      assert.equal(mismatch.report.cache.misses, 3);
      assert.equal(mismatchCalls[0]?.length, 3);
      assert.equal((await lstat(f.embeddingCachePath)).mode & 0o777, 0o600);
      const persisted = await readFile(f.embeddingCachePath, "utf8");
      assert.ok(!persisted.includes("Bounded semantic text"));
      assert.ok(!persisted.includes(f.root));
      assert.ok(!persisted.includes(SECRET));
    } finally {
      await f.cleanup();
    }
  });

  it("deduplicates equal content digests before embedding and reuses identical warm hydration", async () => {
    const f = await fixture();
    const sharedText = "Identical bounded semantic content";
    const nodes = [
      node("node-a", sharedText),
      node("node-b", sharedText),
      node("node-c", "Different bounded semantic content"),
    ];
    const calls: string[][] = [];
    try {
      const first = await buildTaskMapCommunitySemanticEvidence({
        nodes,
        embeddingProvider: fakeEmbeddingProvider(calls),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.deepEqual(calls, [[
        sharedText,
        "Different bounded semantic content",
      ]]);
      assert.deepEqual(first.nodes[0]?.embedding, first.nodes[1]?.embedding);
      assert.notDeepEqual(first.nodes[0]?.embedding, first.nodes[2]?.embedding);

      const persisted = JSON.parse(await readFile(f.embeddingCachePath, "utf8")) as {
        entries: Array<{ contentDigest: string; modelId: string; vector: number[] }>;
      };
      assert.equal(persisted.entries.length, 2);

      const warm = await buildTaskMapCommunitySemanticEvidence({
        nodes: [nodes[2]!, nodes[1]!, nodes[0]!],
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      const firstBytes = taskMapContractCanonicalJson(first.nodes);
      const warmBytes = taskMapContractCanonicalJson(warm.nodes);
      assert.equal(warmBytes, firstBytes);
      assert.equal(taskMapContractDigest(warm.nodes), taskMapContractDigest(first.nodes));
      assert.equal(warm.report.cache.hits, 3);
      assert.equal(warm.report.cache.misses, 0);
    } finally {
      await f.cleanup();
    }
  });

  it("retains cached vectors and nulls only misses after provider failure", async () => {
    const f = await fixture();
    try {
      await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-a"), node("node-b")],
        embeddingProvider: fakeEmbeddingProvider([], async () => {
          throw new Error(`${SECRET}: upstream failure`);
        }),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });

      assert.ok(result.nodes[0]?.embedding);
      assert.equal(result.nodes[1]?.embedding, null);
      assert.equal(result.report.embedding.state, "partial");
      assert.deepEqual(result.report.embedding.coverage, {
        embeddedNodeCount: 1,
        totalNodeCount: 2,
        ratio: 0.5,
      });
      assert.ok(!JSON.stringify(result).includes(SECRET));
    } finally {
      await f.cleanup();
    }
  });

  it("rejects invalid embedding batches without caching finite, dimensional, or zero-norm failures", async () => {
    for (const invalidVector of [
      [1],
      [...vector(0).slice(0, -1), Number.NaN],
      new Array<number>(TASKMAP_GRAPH_BRAIN_LIMITS_V1.embeddingDimensions).fill(0),
    ]) {
      const f = await fixture();
      try {
        const result = await buildTaskMapCommunitySemanticEvidence({
          nodes: [node("node-a")],
          embeddingProvider: fakeEmbeddingProvider([], async () => [invalidVector]),
          embeddingModelId: "embedding-model-v1",
          groupingReplayPath: f.groupingReplayPath,
          embeddingCachePath: f.embeddingCachePath,
        });
        assert.equal(result.nodes[0]?.embedding, null);
        assert.equal(result.report.embedding.state, "unavailable");
      } finally {
        await f.cleanup();
      }
    }
  });

  it("recovers from corrupt and oversized caches with private atomic replacement", async () => {
    for (const seed of [
      Buffer.from("{ corrupt cache", "utf8"),
      Buffer.alloc(TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheBytes + 1),
    ]) {
      const f = await fixture();
      try {
        await writeFile(f.embeddingCachePath, seed, { mode: 0o600 });
        const calls: string[][] = [];
        const result = await buildTaskMapCommunitySemanticEvidence({
          nodes: [node("node-a")],
          embeddingProvider: fakeEmbeddingProvider(calls),
          embeddingModelId: "embedding-model-v1",
          groupingReplayPath: f.groupingReplayPath,
          embeddingCachePath: f.embeddingCachePath,
        });
        assert.equal(result.report.cache.hits, 0);
        assert.equal(result.report.cache.misses, 1);
        assert.equal(calls.length, 1);
        assert.equal((await lstat(f.embeddingCachePath)).mode & 0o777, 0o600);
        assert.deepEqual(
          (await readdir(path.dirname(f.embeddingCachePath))).filter((name) => name.endsWith(".tmp")),
          [],
        );
      } finally {
        await f.cleanup();
      }
    }
  });

  it("rejects unsafe persisted cache model provenance and never re-persists it", async () => {
    const f = await fixture();
    const unsafeModelId = "file:///Users/neo/private-model";
    try {
      await writeFile(
        f.embeddingCachePath,
        taskMapContractCanonicalJson({
          contractVersion: "taskmap-community-embedding-cache.v1",
          entries: [{
            contentDigest: digest("unsafe-seeded-cache"),
            modelId: unsafeModelId,
            vector: vector(0),
          }],
        }),
        { mode: 0o600 },
      );
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("safe-cache-node")],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: "embedding-model-v1",
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(result.report.cache.hits, 0);
      assert.equal(result.report.cache.misses, 1);
      const persisted = await readFile(f.embeddingCachePath, "utf8");
      assert.ok(!persisted.includes(unsafeModelId));
      assert.ok(!persisted.includes("private-model"));
    } finally {
      await f.cleanup();
    }
  });

  it("trims a near-capacity embedding cache deterministically while retaining the new entry", async () => {
    const f = await fixture();
    const modelId = "embedding-model-v1";
    const entries = Array.from(
      { length: TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheEntries },
      (_value, index) => ({
        contentDigest: digest(`near-capacity:${index}`),
        modelId,
        vector: vector(index % 7),
      }),
    );
    try {
      await writeFile(
        f.embeddingCachePath,
        taskMapContractCanonicalJson({
          contractVersion: "taskmap-community-embedding-cache.v1",
          entries,
        }),
        { mode: 0o600 },
      );
      const freshText = "Fresh content retained at the cache boundary";
      const result = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("fresh-node", freshText)],
        embeddingProvider: fakeEmbeddingProvider([]),
        embeddingModelId: modelId,
        groupingReplayPath: f.groupingReplayPath,
        embeddingCachePath: f.embeddingCachePath,
      });
      assert.equal(result.report.cache.misses, 1);
      const persisted = JSON.parse(await readFile(f.embeddingCachePath, "utf8")) as {
        entries: Array<{ contentDigest: string; modelId: string; vector: number[] }>;
      };
      assert.equal(
        persisted.entries.length,
        TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheEntries,
      );
      assert.ok(persisted.entries.some((entry) =>
        entry.contentDigest === taskMapContractDigest({ text: freshText })
        && entry.modelId === modelId
      ));
      assert.ok(
        Buffer.byteLength(await readFile(f.embeddingCachePath, "utf8"), "utf8")
          <= TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1.maxEmbeddingCacheBytes,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("is permutation deterministic for nodes and grouping response order", async () => {
    const firstFixture = await fixture();
    const secondFixture = await fixture();
    try {
      const first = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-c"), node("node-a"), node("node-b")],
        station: station(
          '{"groups":[{"nodeIds":["node-b","node-a"]}]}',
          [],
        ),
        groupingReplayPath: firstFixture.groupingReplayPath,
        embeddingCachePath: firstFixture.embeddingCachePath,
      });
      const second = await buildTaskMapCommunitySemanticEvidence({
        nodes: [node("node-b"), node("node-c"), node("node-a")],
        station: station(
          '{"groups":[{"nodeIds":["node-a","node-b"]}]}',
          [],
        ),
        groupingReplayPath: secondFixture.groupingReplayPath,
        embeddingCachePath: secondFixture.embeddingCachePath,
      });
      assert.equal(taskMapContractCanonicalJson(first), taskMapContractCanonicalJson(second));
    } finally {
      await firstFixture.cleanup();
      await secondFixture.cleanup();
    }
  });

  it("publishes stable default cache helpers without reading or creating providers", () => {
    assert.match(defaultTaskMapCommunityEmbeddingCachePath(), /\.daobrew\/cache\/taskmap-embeddings\.json$/);
    assert.match(defaultTaskMapCommunityGroupingReplayPath(), /\.daobrew\/cache\/taskmap-community-grouping-replay$/);
  });

  it("retains A1 as the authoritative input budget", async () => {
    await assert.rejects(
      () => buildTaskMapCommunitySemanticEvidence({
        nodes: Array.from(
          { length: TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxNodes + 1 },
          (_value, index) => node(`over-budget-${index}`),
        ),
      }),
      /node budget/,
    );
  });
});
