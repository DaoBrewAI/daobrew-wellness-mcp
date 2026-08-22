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

export const TASKMAP_OWNER_REFRESH_POLICY_VERSION =
  "taskmap-owner-refresh-policy.1" as const;

/**
 * Product cadence requested for owner freshness. This is a due-status policy,
 * not a timer, timeout, retry loop, or resource limit.
 */
export const TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS =
  4 * 60 * 60 * 1_000;

export const TASKMAP_OWNER_REFRESH_SOURCES = [
  "agent_session",
  "meeting_notes",
  "calendar",
  "body",
] as const;

export type TaskMapOwnerRefreshSource =
  (typeof TASKMAP_OWNER_REFRESH_SOURCES)[number];

export type TaskMapOwnerRefreshTrigger =
  | "launch"
  | "manual"
  | "timer";

export type TaskMapOwnerRefreshSourceDisposition =
  | "fresh"
  | "retained_last_good"
  | "unavailable";

export interface TaskMapOwnerCollectedSlice<TSlice> {
  /** Immutable owner binding required on every collected or restored slice. */
  ownerScopeDigest: string;
  /**
   * Provider-native or adapter-native revision. The coordinator compares
   * neither its format nor its meaning.
   */
  revision: string;
  /**
   * Digest of the bounded normalized slice. Raw counts never become work here.
   */
  sliceDigest: string;
  /**
   * Opaque normalized input for the mandatory identity/dedupe barrier.
   */
  value: TSlice;
}

export interface TaskMapOwnerSettledSource<TSlice> {
  source: TaskMapOwnerRefreshSource;
  disposition: TaskMapOwnerRefreshSourceDisposition;
  slice?: TaskMapOwnerCollectedSlice<TSlice>;
}

export interface TaskMapOwnerIdentityBarrierInput<TSlice> {
  sources: readonly TaskMapOwnerSettledSource<TSlice>[];
}

export interface TaskMapOwnerIdentityBarrierResult<TGraphInput> {
  /**
   * Deterministic identity/dedupe output digest. Equal digests are the only
   * basis for coordinator-level no-op detection.
   */
  graphInputDigest: string;
  graphInput: TGraphInput;
}

export interface TaskMapOwnerGraphBuildResult<TCandidate> {
  candidateDigest: string;
  candidate: TCandidate;
}

export type TaskMapOwnerRefreshCollectors<TSlice> = {
  [TSource in TaskMapOwnerRefreshSource]:
    () => Promise<TaskMapOwnerCollectedSlice<TSlice>>;
};

export interface TaskMapOwnerRefreshCoordinatorDependencies<
  TSlice,
  TGraphInput,
  TCandidate,
> {
  /** Reject fresh and restored slices outside this immutable owner scope. */
  expectedOwnerScopeDigest: string;
  collectors: TaskMapOwnerRefreshCollectors<TSlice>;
  identityDedupeBarrier:
    (
      input: TaskMapOwnerIdentityBarrierInput<TSlice>,
    ) => Promise<TaskMapOwnerIdentityBarrierResult<TGraphInput>>;
  graphBuilder:
    (
      input: TaskMapOwnerIdentityBarrierResult<TGraphInput>,
    ) => Promise<TaskMapOwnerGraphBuildResult<TCandidate>>;
}

export interface TaskMapOwnerRefreshRequest {
  trigger: TaskMapOwnerRefreshTrigger;
  nowMs: number;
}

export type TaskMapOwnerRefreshStatus =
  | "publication_candidate_ready"
  // Graph construction is unchanged; publication is not implied or acknowledged.
  | "no_op"
  | "blocked";

export type TaskMapOwnerRefreshFailureStage =
  | "identity_dedupe_barrier"
  | "graph_builder";

export interface TaskMapOwnerPublicationCandidate<TCandidate> {
  graphInputDigest: string;
  candidateDigest: string;
  candidate: TCandidate;
}

export interface TaskMapOwnerRefreshSourceStatus {
  source: TaskMapOwnerRefreshSource;
  disposition: TaskMapOwnerRefreshSourceDisposition;
}

export interface TaskMapOwnerRefreshDueStatus {
  policyVersion: typeof TASKMAP_OWNER_REFRESH_POLICY_VERSION;
  intervalMs: typeof TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
  state: "never_refreshed" | "current" | "due";
  due: boolean;
  lastSuccessfulRefreshAtMs: number | null;
  nextDueAtMs: number | null;
}

export interface TaskMapOwnerRefreshResult<TCandidate> {
  policyVersion: typeof TASKMAP_OWNER_REFRESH_POLICY_VERSION;
  status: TaskMapOwnerRefreshStatus;
  requestedAtMs: number;
  triggers: TaskMapOwnerRefreshTrigger[];
  coalescedRequestCount: number;
  sourceStatuses: TaskMapOwnerRefreshSourceStatus[];
  graphInputDigest: string | null;
  candidateDigest: string | null;
  publicationCandidate: TaskMapOwnerPublicationCandidate<TCandidate> | null;
  failureStage: TaskMapOwnerRefreshFailureStage | null;
  dueStatus: TaskMapOwnerRefreshDueStatus;
}

interface ActiveRun<TCandidate> {
  triggers: Set<TaskMapOwnerRefreshTrigger>;
  requestCount: number;
  promise: Promise<TaskMapOwnerRefreshResult<TCandidate>>;
}

const TRIGGER_ORDER: readonly TaskMapOwnerRefreshTrigger[] = [
  "launch",
  "manual",
  "timer",
];

function assertTimestamp(value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError("Task Map owner refresh time must be finite");
  }
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCollectedSlice<TSlice>(
  value: unknown,
  expectedOwnerScopeDigest: string,
): value is TaskMapOwnerCollectedSlice<TSlice> {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<TaskMapOwnerCollectedSlice<TSlice>>;
  return isNonEmpty(candidate.revision)
    && isNonEmpty(candidate.sliceDigest)
    && candidate.ownerScopeDigest === expectedOwnerScopeDigest
    && Object.prototype.hasOwnProperty.call(candidate, "value");
}

function orderedTriggers(
  values: ReadonlySet<TaskMapOwnerRefreshTrigger>,
): TaskMapOwnerRefreshTrigger[] {
  return TRIGGER_ORDER.filter((trigger) => values.has(trigger));
}

export function taskMapOwnerRefreshDueStatus(
  nowMs: number,
  lastSuccessfulRefreshAtMs: number | null,
): TaskMapOwnerRefreshDueStatus {
  assertTimestamp(nowMs);
  if (lastSuccessfulRefreshAtMs === null) {
    return {
      policyVersion: TASKMAP_OWNER_REFRESH_POLICY_VERSION,
      intervalMs: TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
      state: "never_refreshed",
      due: true,
      lastSuccessfulRefreshAtMs: null,
      nextDueAtMs: null,
    };
  }
  assertTimestamp(lastSuccessfulRefreshAtMs);
  const nextDueAtMs =
    lastSuccessfulRefreshAtMs + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
  const due = nowMs >= nextDueAtMs;
  return {
    policyVersion: TASKMAP_OWNER_REFRESH_POLICY_VERSION,
    intervalMs: TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
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
export class TaskMapOwnerRefreshCoordinator<
  TSlice,
  TGraphInput,
  TCandidate,
> {
  private readonly lastGood =
    new Map<TaskMapOwnerRefreshSource, TaskMapOwnerCollectedSlice<TSlice>>();

  private activeRun: ActiveRun<TCandidate> | undefined;
  private lastVerifiedGraphInputDigest: string | undefined;
  private lastVerifiedPublication:
    TaskMapOwnerPublicationCandidate<TCandidate> | undefined;
  private lastSuccessfulRefreshAtMs: number | null = null;

  constructor(
    private readonly dependencies:
      TaskMapOwnerRefreshCoordinatorDependencies<
        TSlice,
        TGraphInput,
        TCandidate
      >,
  ) {
    if (!/^[a-f0-9]{64}$/u.test(dependencies.expectedOwnerScopeDigest)) {
      throw new TypeError(
        "Task Map owner refresh requires an exact owner scope digest",
      );
    }
  }

  dueStatus(nowMs: number): TaskMapOwnerRefreshDueStatus {
    return taskMapOwnerRefreshDueStatus(
      nowMs,
      this.lastSuccessfulRefreshAtMs,
    );
  }

  /**
   * Advance the coordinator's no-op baseline only after the host has
   * atomically published and independently verified the candidate.
   *
   * Candidate construction alone is deliberately insufficient: callers may
   * crash, fail validation, or lose a publication race after graph building.
   */
  acknowledgeVerifiedPublication(
    publication: TaskMapOwnerPublicationCandidate<TCandidate>,
    publishedAtMs: number,
  ): void {
    assertTimestamp(publishedAtMs);
    if (
      !isNonEmpty(publication.graphInputDigest)
      || !isNonEmpty(publication.candidateDigest)
    ) {
      throw new TypeError(
        "Task Map verified publication digests must be non-empty",
      );
    }
    this.lastVerifiedGraphInputDigest = publication.graphInputDigest;
    this.lastVerifiedPublication = publication;
    this.lastSuccessfulRefreshAtMs = publishedAtMs;
  }

  /// Restore one host-persisted accepted slice before a run. A failed
  /// collector may retain it, but a merely collected/unpublished slice must
  /// never be supplied here.
  restoreLastGoodSource(
    source: TaskMapOwnerRefreshSource,
    slice: TaskMapOwnerCollectedSlice<TSlice>,
  ): void {
    if (!isCollectedSlice<TSlice>(
      slice,
      this.dependencies.expectedOwnerScopeDigest,
    )) {
      throw new TypeError("Task Map restored source slice is invalid");
    }
    this.lastGood.set(source, {
      ownerScopeDigest: slice.ownerScopeDigest,
      revision: slice.revision,
      sliceDigest: slice.sliceDigest,
      value: slice.value,
    });
  }

  requestRefresh(
    request: TaskMapOwnerRefreshRequest,
  ): Promise<TaskMapOwnerRefreshResult<TCandidate>> {
    assertTimestamp(request.nowMs);
    if (this.activeRun !== undefined) {
      this.activeRun.triggers.add(request.trigger);
      this.activeRun.requestCount += 1;
      return this.activeRun.promise;
    }

    const run = {
      triggers: new Set<TaskMapOwnerRefreshTrigger>([request.trigger]),
      requestCount: 1,
      promise: undefined as unknown as Promise<
        TaskMapOwnerRefreshResult<TCandidate>
      >,
    };
    run.promise = this.executeRun(run, request.nowMs).finally(() => {
      if (this.activeRun === run) {
        this.activeRun = undefined;
      }
    });
    this.activeRun = run;
    return run.promise;
  }

  private async executeRun(
    run: ActiveRun<TCandidate>,
    requestedAtMs: number,
  ): Promise<TaskMapOwnerRefreshResult<TCandidate>> {
    const attempts = TASKMAP_OWNER_REFRESH_SOURCES.map((source) => (
      Promise.resolve().then(() => this.dependencies.collectors[source]())
    ));
    const settled = await Promise.allSettled(attempts);
    const sources = TASKMAP_OWNER_REFRESH_SOURCES.map((source, index) => {
      const result = settled[index]!;
      if (
        result.status === "fulfilled"
        && isCollectedSlice<TSlice>(
          result.value,
          this.dependencies.expectedOwnerScopeDigest,
        )
      ) {
        const slice = {
          ownerScopeDigest: result.value.ownerScopeDigest,
          revision: result.value.revision,
          sliceDigest: result.value.sliceDigest,
          value: result.value.value,
        };
        this.lastGood.set(source, slice);
        return {
          source,
          disposition: "fresh" as const,
          slice,
        };
      }

      const retained = this.lastGood.get(source);
      if (retained !== undefined) {
        return {
          source,
          disposition: "retained_last_good" as const,
          slice: retained,
        };
      }
      return {
        source,
        disposition: "unavailable" as const,
      };
    });

    let barrier:
      TaskMapOwnerIdentityBarrierResult<TGraphInput>;
    try {
      barrier = await this.dependencies.identityDedupeBarrier({ sources });
      if (!isNonEmpty(barrier.graphInputDigest)) {
        throw new TypeError(
          "Task Map identity/dedupe barrier digest must be non-empty",
        );
      }
    } catch {
      return this.result(
        run,
        requestedAtMs,
        sources,
        "blocked",
        null,
        null,
        null,
        "identity_dedupe_barrier",
      );
    }

    if (
      this.lastVerifiedGraphInputDigest === barrier.graphInputDigest
      && this.lastVerifiedPublication !== undefined
    ) {
      this.lastSuccessfulRefreshAtMs = requestedAtMs;
      return this.result(
        run,
        requestedAtMs,
        sources,
        "no_op",
        barrier.graphInputDigest,
        this.lastVerifiedPublication.candidateDigest,
        this.lastVerifiedPublication,
        null,
      );
    }

    let built: TaskMapOwnerGraphBuildResult<TCandidate>;
    try {
      built = await this.dependencies.graphBuilder(barrier);
      if (!isNonEmpty(built.candidateDigest)) {
        throw new TypeError(
          "Task Map graph candidate digest must be non-empty",
        );
      }
    } catch {
      return this.result(
        run,
        requestedAtMs,
        sources,
        "blocked",
        barrier.graphInputDigest,
        null,
        null,
        "graph_builder",
      );
    }

    const candidate = {
      graphInputDigest: barrier.graphInputDigest,
      candidateDigest: built.candidateDigest,
      candidate: built.candidate,
    };
    return this.result(
      run,
      requestedAtMs,
      sources,
      "publication_candidate_ready",
      barrier.graphInputDigest,
      built.candidateDigest,
      candidate,
      null,
    );
  }

  private result(
    run: ActiveRun<TCandidate>,
    requestedAtMs: number,
    sources: readonly TaskMapOwnerSettledSource<TSlice>[],
    status: TaskMapOwnerRefreshStatus,
    graphInputDigest: string | null,
    candidateDigest: string | null,
    publicationCandidate: TaskMapOwnerPublicationCandidate<TCandidate> | null,
    failureStage: TaskMapOwnerRefreshFailureStage | null,
  ): TaskMapOwnerRefreshResult<TCandidate> {
    return {
      policyVersion: TASKMAP_OWNER_REFRESH_POLICY_VERSION,
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
