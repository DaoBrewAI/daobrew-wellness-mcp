"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const OWNER_SCOPE_DIGEST = "a".repeat(64);
class TaskMapOwnerRefreshCoordinator extends owner_refresh_coordinator_js_1.TaskMapOwnerRefreshCoordinator {
    constructor(dependencies) {
        super({ expectedOwnerScopeDigest: OWNER_SCOPE_DIGEST, ...dependencies });
    }
}
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}
function slice(source, revision, rawCount) {
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
function collectors(read) {
    return {
        agent_session: () => read("agent_session"),
        meeting_notes: () => read("meeting_notes"),
        calendar: () => read("calendar"),
        body: () => read("body"),
    };
}
function barrierResult(input) {
    const revisions = input.sources.map((source) => (source.slice?.revision ?? "unavailable"));
    return {
        graphInputDigest: `identity:${revisions.join("|")}`,
        graphInput: { revisions },
    };
}
(0, node_test_1.describe)("TaskMapOwnerRefreshCoordinator", () => {
    (0, node_test_1.it)("coalesces overlapping launch, timer, and manual requests", async () => {
        const held = deferred();
        const calls = new Map();
        const coordinator = new TaskMapOwnerRefreshCoordinator({
            collectors: collectors(async (source) => {
                calls.set(source, (calls.get(source) ?? 0) + 1);
                if (source === "agent_session")
                    return held.promise;
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
        node_assert_1.default.strictEqual(timer, launch);
        node_assert_1.default.strictEqual(manual, launch);
        held.resolve(slice("agent_session", "r1"));
        const result = await launch;
        node_assert_1.default.deepEqual(result.triggers, ["launch", "manual", "timer"]);
        node_assert_1.default.equal(result.coalescedRequestCount, 3);
        node_assert_1.default.equal(result.status, "publication_candidate_ready");
        node_assert_1.default.deepEqual(Object.fromEntries(calls), Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
            source,
            1,
        ])));
    });
    (0, node_test_1.it)("retains each source's last good slice after a partial failure", async () => {
        let run = 1;
        let secondBarrier;
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
                if (barrierCalls === 2)
                    secondBarrier = input;
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
        const meeting = secondBarrier?.sources.find((source) => source.source === "meeting_notes");
        node_assert_1.default.equal(meeting?.disposition, "retained_last_good");
        node_assert_1.default.equal(meeting?.slice?.revision, "r1");
        node_assert_1.default.equal(second.sourceStatuses.find((source) => source.source === "meeting_notes")?.disposition, "retained_last_good");
        node_assert_1.default.equal(second.status, "publication_candidate_ready");
    });
    (0, node_test_1.it)("settles all four sources before calling the identity barrier once", async () => {
        let barrierCalls = 0;
        let observed;
        const coordinator = new TaskMapOwnerRefreshCoordinator({
            collectors: collectors(async (source) => {
                if (source === "calendar")
                    throw new Error("calendar unavailable");
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
        node_assert_1.default.equal(barrierCalls, 1);
        node_assert_1.default.deepEqual(observed?.sources.map((source) => source.source), owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES);
        node_assert_1.default.deepEqual(observed?.sources.map((source) => source.disposition), ["fresh", "fresh", "unavailable", "fresh"]);
    });
    (0, node_test_1.it)("calls the graph builder only after the barrier completes", async () => {
        const events = [];
        const barrier = deferred();
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
        await new Promise((resolve) => setImmediate(resolve));
        node_assert_1.default.deepEqual(events, ["barrier:start"]);
        barrier.resolve({
            graphInputDigest: "identity:r1",
            graphInput: { revisions: ["r1", "r1", "r1", "r1"] },
        });
        await refresh;
        node_assert_1.default.deepEqual(events, [
            "barrier:start",
            "barrier:end",
            "graph:build",
        ]);
    });
    (0, node_test_1.it)("does not turn an unacknowledged candidate into a no-op baseline", async () => {
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
        node_assert_1.default.equal(first.status, "publication_candidate_ready");
        node_assert_1.default.notEqual(first.publicationCandidate, null);
        node_assert_1.default.equal(second.status, "publication_candidate_ready");
        node_assert_1.default.notStrictEqual(second.publicationCandidate, first.publicationCandidate);
        node_assert_1.default.equal(second.candidateDigest, first.candidateDigest);
        node_assert_1.default.equal(barrierCalls, 2);
        node_assert_1.default.equal(graphBuilds, 2);
    });
    (0, node_test_1.it)("uses only an explicitly verified publication as its no-op baseline", async () => {
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
        node_assert_1.default.ok(first.publicationCandidate);
        coordinator.acknowledgeVerifiedPublication(first.publicationCandidate, 1_500);
        const second = await coordinator.requestRefresh({
            trigger: "timer",
            nowMs: 2_000,
        });
        node_assert_1.default.equal(second.status, "no_op");
        node_assert_1.default.strictEqual(second.publicationCandidate, first.publicationCandidate);
        node_assert_1.default.equal(graphBuilds, 1);
    });
    (0, node_test_1.it)("never returns a publication candidate when barrier or build fails", async () => {
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
        node_assert_1.default.equal(barrierResultValue.status, "blocked");
        node_assert_1.default.equal(barrierResultValue.failureStage, "identity_dedupe_barrier");
        node_assert_1.default.equal(barrierResultValue.publicationCandidate, null);
        node_assert_1.default.equal(barrierResultValue.candidateDigest, null);
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
        node_assert_1.default.equal(buildResultValue.status, "blocked");
        node_assert_1.default.equal(buildResultValue.failureStage, "graph_builder");
        node_assert_1.default.equal(buildResultValue.publicationCandidate, null);
        node_assert_1.default.equal(buildResultValue.candidateDigest, null);
    });
    (0, node_test_1.it)("treats collector payloads as opaque instead of deriving tasks from counts", async () => {
        let observedCounts = [];
        const coordinator = new TaskMapOwnerRefreshCoordinator({
            collectors: collectors(async (source) => slice(source, "r1", 50_000)),
            identityDedupeBarrier: async (input) => {
                observedCounts = input.sources.map((source) => source.slice?.value.rawCount);
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
        node_assert_1.default.deepEqual(observedCounts, [50_000, 50_000, 50_000, 50_000]);
        node_assert_1.default.deepEqual(result.publicationCandidate?.candidate.roots, []);
    });
    (0, node_test_1.it)("reports the deterministic four-hour due boundary", async () => {
        node_assert_1.default.deepEqual((0, owner_refresh_coordinator_js_1.taskMapOwnerRefreshDueStatus)(1_000, null), {
            policyVersion: "taskmap-owner-refresh-policy.1",
            intervalMs: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
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
        node_assert_1.default.ok(built.publicationCandidate);
        coordinator.acknowledgeVerifiedPublication(built.publicationCandidate, completedAt);
        const before = coordinator.dueStatus(completedAt + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS - 1);
        const atBoundary = coordinator.dueStatus(completedAt + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
        node_assert_1.default.equal(before.state, "current");
        node_assert_1.default.equal(before.due, false);
        node_assert_1.default.equal(atBoundary.state, "due");
        node_assert_1.default.equal(atBoundary.due, true);
        node_assert_1.default.equal(atBoundary.nextDueAtMs, completedAt + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
    });
});
