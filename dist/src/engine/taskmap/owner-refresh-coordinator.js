"use strict";
/**
 * Small host-side coordinator for refreshing the owner Task Map.
 *
 * The coordinator owns orchestration only:
 * - collectors are injected read-only functions;
 * - collected slices remain opaque here;
 * - one injected identity/dedupe barrier sees all four settled sources;
 * - one injected graph builder may run only after that barrier succeeds;
 * - no connector, task inference, publication, or external write happens here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMapOwnerRefreshCoordinator = exports.TASKMAP_OWNER_REFRESH_SOURCES = exports.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS = exports.TASKMAP_OWNER_REFRESH_POLICY_VERSION = void 0;
exports.taskMapOwnerRefreshDueStatus = taskMapOwnerRefreshDueStatus;
exports.TASKMAP_OWNER_REFRESH_POLICY_VERSION = "taskmap-owner-refresh-policy.1";
/**
 * Product cadence requested for owner freshness. This is a due-status policy,
 * not a timer, timeout, retry loop, or resource limit.
 */
exports.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS = 4 * 60 * 60 * 1_000;
exports.TASKMAP_OWNER_REFRESH_SOURCES = [
    "agent_session",
    "meeting_notes",
    "calendar",
    "body",
];
const TRIGGER_ORDER = [
    "launch",
    "manual",
    "timer",
];
function assertTimestamp(value) {
    if (!Number.isFinite(value)) {
        throw new TypeError("Task Map owner refresh time must be finite");
    }
}
function isNonEmpty(value) {
    return typeof value === "string" && value.length > 0;
}
function isCollectedSlice(value, expectedOwnerScopeDigest) {
    if (value === null || typeof value !== "object")
        return false;
    const candidate = value;
    return isNonEmpty(candidate.revision)
        && isNonEmpty(candidate.sliceDigest)
        && candidate.ownerScopeDigest === expectedOwnerScopeDigest
        && Object.prototype.hasOwnProperty.call(candidate, "value");
}
function orderedTriggers(values) {
    return TRIGGER_ORDER.filter((trigger) => values.has(trigger));
}
function taskMapOwnerRefreshDueStatus(nowMs, lastSuccessfulRefreshAtMs) {
    assertTimestamp(nowMs);
    if (lastSuccessfulRefreshAtMs === null) {
        return {
            policyVersion: exports.TASKMAP_OWNER_REFRESH_POLICY_VERSION,
            intervalMs: exports.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
            state: "never_refreshed",
            due: true,
            lastSuccessfulRefreshAtMs: null,
            nextDueAtMs: null,
        };
    }
    assertTimestamp(lastSuccessfulRefreshAtMs);
    const nextDueAtMs = lastSuccessfulRefreshAtMs + exports.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
    const due = nowMs >= nextDueAtMs;
    return {
        policyVersion: exports.TASKMAP_OWNER_REFRESH_POLICY_VERSION,
        intervalMs: exports.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
        state: due ? "due" : "current",
        due,
        lastSuccessfulRefreshAtMs,
        nextDueAtMs,
    };
}
/**
 * Coalescing in-memory owner-refresh coordinator.
 *
 * Host code may call requestRefresh from launch, a timer, or a manual action.
 * Overlapping calls share the exact same Promise and one collector/barrier/
 * builder pass. The host remains responsible for scheduling and publication.
 */
class TaskMapOwnerRefreshCoordinator {
    dependencies;
    lastGood = new Map();
    activeRun;
    lastVerifiedGraphInputDigest;
    lastVerifiedPublication;
    lastSuccessfulRefreshAtMs = null;
    constructor(dependencies) {
        this.dependencies = dependencies;
        if (!/^[a-f0-9]{64}$/u.test(dependencies.expectedOwnerScopeDigest)) {
            throw new TypeError("Task Map owner refresh requires an exact owner scope digest");
        }
    }
    dueStatus(nowMs) {
        return taskMapOwnerRefreshDueStatus(nowMs, this.lastSuccessfulRefreshAtMs);
    }
    /**
     * Advance the coordinator's no-op baseline only after the host has
     * atomically published and independently verified the candidate.
     *
     * Candidate construction alone is deliberately insufficient: callers may
     * crash, fail validation, or lose a publication race after graph building.
     */
    acknowledgeVerifiedPublication(publication, publishedAtMs) {
        assertTimestamp(publishedAtMs);
        if (!isNonEmpty(publication.graphInputDigest)
            || !isNonEmpty(publication.candidateDigest)) {
            throw new TypeError("Task Map verified publication digests must be non-empty");
        }
        this.lastVerifiedGraphInputDigest = publication.graphInputDigest;
        this.lastVerifiedPublication = publication;
        this.lastSuccessfulRefreshAtMs = publishedAtMs;
    }
    /// Restore one host-persisted accepted slice before a run. A failed
    /// collector may retain it, but a merely collected/unpublished slice must
    /// never be supplied here.
    restoreLastGoodSource(source, slice) {
        if (!isCollectedSlice(slice, this.dependencies.expectedOwnerScopeDigest)) {
            throw new TypeError("Task Map restored source slice is invalid");
        }
        this.lastGood.set(source, {
            ownerScopeDigest: slice.ownerScopeDigest,
            revision: slice.revision,
            sliceDigest: slice.sliceDigest,
            value: slice.value,
        });
    }
    requestRefresh(request) {
        assertTimestamp(request.nowMs);
        if (this.activeRun !== undefined) {
            this.activeRun.triggers.add(request.trigger);
            this.activeRun.requestCount += 1;
            return this.activeRun.promise;
        }
        const run = {
            triggers: new Set([request.trigger]),
            requestCount: 1,
            promise: undefined,
        };
        run.promise = this.executeRun(run, request.nowMs).finally(() => {
            if (this.activeRun === run) {
                this.activeRun = undefined;
            }
        });
        this.activeRun = run;
        return run.promise;
    }
    async executeRun(run, requestedAtMs) {
        const attempts = exports.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => (Promise.resolve().then(() => this.dependencies.collectors[source]())));
        const settled = await Promise.allSettled(attempts);
        const sources = exports.TASKMAP_OWNER_REFRESH_SOURCES.map((source, index) => {
            const result = settled[index];
            if (result.status === "fulfilled"
                && isCollectedSlice(result.value, this.dependencies.expectedOwnerScopeDigest)) {
                const slice = {
                    ownerScopeDigest: result.value.ownerScopeDigest,
                    revision: result.value.revision,
                    sliceDigest: result.value.sliceDigest,
                    value: result.value.value,
                };
                this.lastGood.set(source, slice);
                return {
                    source,
                    disposition: "fresh",
                    slice,
                };
            }
            const retained = this.lastGood.get(source);
            if (retained !== undefined) {
                return {
                    source,
                    disposition: "retained_last_good",
                    slice: retained,
                };
            }
            return {
                source,
                disposition: "unavailable",
            };
        });
        let barrier;
        try {
            barrier = await this.dependencies.identityDedupeBarrier({ sources });
            if (!isNonEmpty(barrier.graphInputDigest)) {
                throw new TypeError("Task Map identity/dedupe barrier digest must be non-empty");
            }
        }
        catch {
            return this.result(run, requestedAtMs, sources, "blocked", null, null, null, "identity_dedupe_barrier");
        }
        if (this.lastVerifiedGraphInputDigest === barrier.graphInputDigest
            && this.lastVerifiedPublication !== undefined) {
            this.lastSuccessfulRefreshAtMs = requestedAtMs;
            return this.result(run, requestedAtMs, sources, "no_op", barrier.graphInputDigest, this.lastVerifiedPublication.candidateDigest, this.lastVerifiedPublication, null);
        }
        let built;
        try {
            built = await this.dependencies.graphBuilder(barrier);
            if (!isNonEmpty(built.candidateDigest)) {
                throw new TypeError("Task Map graph candidate digest must be non-empty");
            }
        }
        catch {
            return this.result(run, requestedAtMs, sources, "blocked", barrier.graphInputDigest, null, null, "graph_builder");
        }
        const candidate = {
            graphInputDigest: barrier.graphInputDigest,
            candidateDigest: built.candidateDigest,
            candidate: built.candidate,
        };
        return this.result(run, requestedAtMs, sources, "publication_candidate_ready", barrier.graphInputDigest, built.candidateDigest, candidate, null);
    }
    result(run, requestedAtMs, sources, status, graphInputDigest, candidateDigest, publicationCandidate, failureStage) {
        return {
            policyVersion: exports.TASKMAP_OWNER_REFRESH_POLICY_VERSION,
            status,
            requestedAtMs,
            triggers: orderedTriggers(run.triggers),
            coalescedRequestCount: run.requestCount,
            sourceStatuses: sources.map((source) => ({
                source: source.source,
                disposition: source.disposition,
            })),
            graphInputDigest,
            candidateDigest,
            publicationCandidate,
            failureStage,
            dueStatus: this.dueStatus(requestedAtMs),
        };
    }
}
exports.TaskMapOwnerRefreshCoordinator = TaskMapOwnerRefreshCoordinator;
