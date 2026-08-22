import assert from "node:assert";
import { describe, it } from "node:test";
import {
  TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
  TASKMAP_OWNER_REFRESH_SOURCES,
  TaskMapOwnerRefreshCoordinator as ProductionTaskMapOwnerRefreshCoordinator,
  taskMapOwnerRefreshDueStatus,
  type TaskMapOwnerCollectedSlice,
  type TaskMapOwnerIdentityBarrierInput,
  type TaskMapOwnerIdentityBarrierResult,
  type TaskMapOwnerRefreshCollectors,
  type TaskMapOwnerRefreshCoordinatorDependencies,
  type TaskMapOwnerRefreshSource,
} from "../src/engine/taskmap/owner-refresh-coordinator.js";

const OWNER_SCOPE_DIGEST = "a".repeat(64);

class TaskMapOwnerRefreshCoordinator<TSlice, TGraphInput, TCandidate>
  extends ProductionTaskMapOwnerRefreshCoordinator<
    TSlice,
    TGraphInput,
    TCandidate
  > {
  constructor(dependencies: Omit<
    TaskMapOwnerRefreshCoordinatorDependencies<
      TSlice,
      TGraphInput,
      TCandidate
    >,
    "expectedOwnerScopeDigest"
  >) {
    super({ expectedOwnerScopeDigest: OWNER_SCOPE_DIGEST, ...dependencies });
  }
}

interface SourcePayload {
  source: TaskMapOwnerRefreshSource;
  revision: string;
  rawCount?: number;
}

interface GraphInput {
  revisions: string[];
}

interface Candidate {
  roots: string[];
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function slice(
  source: TaskMapOwnerRefreshSource,
  revision: string,
  rawCount?: number,
): TaskMapOwnerCollectedSlice<SourcePayload> {
  return {
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    revision,
    sliceDigest: `slice:${source}:${revision}`,
    value: {
      source,
      revision,
      ...(rawCount === undefined ? {} : { rawCount }),
    },
  };
}

function collectors(
  read: (
    source: TaskMapOwnerRefreshSource,
  ) => Promise<TaskMapOwnerCollectedSlice<SourcePayload>>,
): TaskMapOwnerRefreshCollectors<SourcePayload> {
  return {
    agent_session: () => read("agent_session"),
    meeting_notes: () => read("meeting_notes"),
    calendar: () => read("calendar"),
    body: () => read("body"),
  };
}

function barrierResult(
  input: TaskMapOwnerIdentityBarrierInput<SourcePayload>,
): TaskMapOwnerIdentityBarrierResult<GraphInput> {
  const revisions = input.sources.map((source) => (
    source.slice?.revision ?? "unavailable"
  ));
  return {
    graphInputDigest: `identity:${revisions.join("|")}`,
    graphInput: { revisions },
  };
}

describe("TaskMapOwnerRefreshCoordinator", () => {
  it("coalesces overlapping launch, timer, and manual requests", async () => {
    const held = deferred<TaskMapOwnerCollectedSlice<SourcePayload>>();
    const calls = new Map<TaskMapOwnerRefreshSource, number>();
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => {
        calls.set(source, (calls.get(source) ?? 0) + 1);
        if (source === "agent_session") return held.promise;
        return slice(source, "r1");
      }),
      identityDedupeBarrier: async (input) => barrierResult(input),
      graphBuilder: async (input) => ({
        candidateDigest: `candidate:${input.graphInputDigest}`,
        candidate: { roots: ["root-1"] },
      }),
    });

    const launch = coordinator.requestRefresh({
      trigger: "launch",
      nowMs: 1_000,
    });
    const timer = coordinator.requestRefresh({
      trigger: "timer",
      nowMs: 1_001,
    });
    const manual = coordinator.requestRefresh({
      trigger: "manual",
      nowMs: 1_002,
    });

    assert.strictEqual(timer, launch);
    assert.strictEqual(manual, launch);
    held.resolve(slice("agent_session", "r1"));
    const result = await launch;

    assert.deepEqual(result.triggers, ["launch", "manual", "timer"]);
    assert.equal(result.coalescedRequestCount, 3);
    assert.equal(result.status, "publication_candidate_ready");
    assert.deepEqual(
      Object.fromEntries(calls),
      Object.fromEntries(TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
        source,
        1,
      ])),
    );
  });

  it("retains each source's last good slice after a partial failure", async () => {
    let run = 1;
    let secondBarrier:
      TaskMapOwnerIdentityBarrierInput<SourcePayload> | undefined;
    let barrierCalls = 0;
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => {
        if (run === 2 && source === "meeting_notes") {
          throw new Error("meeting provider unavailable");
        }
        return slice(source, run === 1 ? "r1" : "r2");
      }),
      identityDedupeBarrier: async (input) => {
        barrierCalls += 1;
        if (barrierCalls === 2) secondBarrier = input;
        return barrierResult(input);
      },
      graphBuilder: async (input) => ({
        candidateDigest: `candidate:${input.graphInputDigest}`,
        candidate: { roots: ["root-1"] },
      }),
    });

    await coordinator.requestRefresh({ trigger: "launch", nowMs: 1_000 });
    run = 2;
    const second = await coordinator.requestRefresh({
      trigger: "timer",
      nowMs: 2_000,
    });

    const meeting = secondBarrier?.sources.find(
      (source) => source.source === "meeting_notes",
    );
    assert.equal(meeting?.disposition, "retained_last_good");
    assert.equal(meeting?.slice?.revision, "r1");
    assert.equal(
      second.sourceStatuses.find(
        (source) => source.source === "meeting_notes",
      )?.disposition,
      "retained_last_good",
    );
    assert.equal(second.status, "publication_candidate_ready");
  });

  it("settles all four sources before calling the identity barrier once", async () => {
    let barrierCalls = 0;
    let observed:
      TaskMapOwnerIdentityBarrierInput<SourcePayload> | undefined;
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => {
        if (source === "calendar") throw new Error("calendar unavailable");
        return slice(source, "r1");
      }),
      identityDedupeBarrier: async (input) => {
        barrierCalls += 1;
        observed = input;
        return barrierResult(input);
      },
      graphBuilder: async (input) => ({
        candidateDigest: `candidate:${input.graphInputDigest}`,
        candidate: { roots: [] },
      }),
    });

    await coordinator.requestRefresh({ trigger: "manual", nowMs: 1_000 });

    assert.equal(barrierCalls, 1);
    assert.deepEqual(
      observed?.sources.map((source) => source.source),
      TASKMAP_OWNER_REFRESH_SOURCES,
    );
    assert.deepEqual(
      observed?.sources.map((source) => source.disposition),
      ["fresh", "fresh", "unavailable", "fresh"],
    );
  });

  it("calls the graph builder only after the barrier completes", async () => {
    const events: string[] = [];
    const barrier = deferred<
      TaskMapOwnerIdentityBarrierResult<GraphInput>
    >();
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async () => {
        events.push("barrier:start");
        const value = await barrier.promise;
        events.push("barrier:end");
        return value;
      },
      graphBuilder: async () => {
        events.push("graph:build");
        return {
          candidateDigest: "candidate:r1",
          candidate: { roots: ["root-1"] },
        };
      },
    });

    const refresh = coordinator.requestRefresh({
      trigger: "manual",
      nowMs: 1_000,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(events, ["barrier:start"]);

    barrier.resolve({
      graphInputDigest: "identity:r1",
      graphInput: { revisions: ["r1", "r1", "r1", "r1"] },
    });
    await refresh;

    assert.deepEqual(events, [
      "barrier:start",
      "barrier:end",
      "graph:build",
    ]);
  });

  it("does not turn an unacknowledged candidate into a no-op baseline", async () => {
    let barrierCalls = 0;
    let graphBuilds = 0;
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async (input) => {
        barrierCalls += 1;
        return barrierResult(input);
      },
      graphBuilder: async (input) => {
        graphBuilds += 1;
        return {
          candidateDigest: `candidate:${input.graphInputDigest}`,
          candidate: { roots: ["root-1"] },
        };
      },
    });

    const first = await coordinator.requestRefresh({
      trigger: "launch",
      nowMs: 1_000,
    });
    const second = await coordinator.requestRefresh({
      trigger: "timer",
      nowMs: 2_000,
    });

    assert.equal(first.status, "publication_candidate_ready");
    assert.notEqual(first.publicationCandidate, null);
    assert.equal(second.status, "publication_candidate_ready");
    assert.notStrictEqual(
      second.publicationCandidate,
      first.publicationCandidate,
    );
    assert.equal(second.candidateDigest, first.candidateDigest);
    assert.equal(barrierCalls, 2);
    assert.equal(graphBuilds, 2);
  });

  it("uses only an explicitly verified publication as its no-op baseline", async () => {
    let graphBuilds = 0;
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async (input) => barrierResult(input),
      graphBuilder: async (input) => {
        graphBuilds += 1;
        return {
          candidateDigest: `candidate:${input.graphInputDigest}`,
          candidate: { roots: ["root-1"] },
        };
      },
    });
    const first = await coordinator.requestRefresh({
      trigger: "launch",
      nowMs: 1_000,
    });
    assert.ok(first.publicationCandidate);
    coordinator.acknowledgeVerifiedPublication(
      first.publicationCandidate,
      1_500,
    );

    const second = await coordinator.requestRefresh({
      trigger: "timer",
      nowMs: 2_000,
    });

    assert.equal(second.status, "no_op");
    assert.strictEqual(
      second.publicationCandidate,
      first.publicationCandidate,
    );
    assert.equal(graphBuilds, 1);
  });

  it("never returns a publication candidate when barrier or build fails", async () => {
    const barrierFailure = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async () => {
        throw new Error("identity failure");
      },
      graphBuilder: async () => ({
        candidateDigest: "must-not-run",
        candidate: { roots: ["must-not-run"] },
      }),
    });
    const barrierResultValue = await barrierFailure.requestRefresh({
      trigger: "manual",
      nowMs: 1_000,
    });
    assert.equal(barrierResultValue.status, "blocked");
    assert.equal(
      barrierResultValue.failureStage,
      "identity_dedupe_barrier",
    );
    assert.equal(barrierResultValue.publicationCandidate, null);
    assert.equal(barrierResultValue.candidateDigest, null);

    const buildFailure = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async (input) => barrierResult(input),
      graphBuilder: async () => {
        throw new Error("graph failure");
      },
    });
    const buildResultValue = await buildFailure.requestRefresh({
      trigger: "manual",
      nowMs: 1_000,
    });
    assert.equal(buildResultValue.status, "blocked");
    assert.equal(buildResultValue.failureStage, "graph_builder");
    assert.equal(buildResultValue.publicationCandidate, null);
    assert.equal(buildResultValue.candidateDigest, null);
  });

  it("treats collector payloads as opaque instead of deriving tasks from counts", async () => {
    let observedCounts: Array<number | undefined> = [];
    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1", 50_000)),
      identityDedupeBarrier: async (input) => {
        observedCounts = input.sources.map(
          (source) => source.slice?.value.rawCount,
        );
        return {
          graphInputDigest: "identity:opaque-counts",
          graphInput: { revisions: ["r1", "r1", "r1", "r1"] },
        };
      },
      graphBuilder: async () => ({
        candidateDigest: "candidate:barrier-owned",
        candidate: { roots: [] },
      }),
    });

    const result = await coordinator.requestRefresh({
      trigger: "manual",
      nowMs: 1_000,
    });

    assert.deepEqual(observedCounts, [50_000, 50_000, 50_000, 50_000]);
    assert.deepEqual(result.publicationCandidate?.candidate.roots, []);
  });

  it("reports the deterministic four-hour due boundary", async () => {
    assert.deepEqual(taskMapOwnerRefreshDueStatus(1_000, null), {
      policyVersion: "taskmap-owner-refresh-policy.1",
      intervalMs: TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
      state: "never_refreshed",
      due: true,
      lastSuccessfulRefreshAtMs: null,
      nextDueAtMs: null,
    });

    const coordinator = new TaskMapOwnerRefreshCoordinator({
      collectors: collectors(async (source) => slice(source, "r1")),
      identityDedupeBarrier: async (input) => barrierResult(input),
      graphBuilder: async () => ({
        candidateDigest: "candidate:r1",
        candidate: { roots: [] },
      }),
    });
    const completedAt = 2_000;
    const built = await coordinator.requestRefresh({
      trigger: "launch",
      nowMs: completedAt,
    });
    assert.ok(built.publicationCandidate);
    coordinator.acknowledgeVerifiedPublication(
      built.publicationCandidate,
      completedAt,
    );

    const before = coordinator.dueStatus(
      completedAt + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS - 1,
    );
    const atBoundary = coordinator.dueStatus(
      completedAt + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
    );
    assert.equal(before.state, "current");
    assert.equal(before.due, false);
    assert.equal(atBoundary.state, "due");
    assert.equal(atBoundary.due, true);
    assert.equal(
      atBoundary.nextDueAtMs,
      completedAt + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
    );
  });
});
