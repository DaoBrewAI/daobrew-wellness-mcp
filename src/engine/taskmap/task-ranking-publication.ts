import { createHash } from "node:crypto";
import {
  TASKMAP_OWNER_REFRESH_SOURCES,
  type TaskMapOwnerRefreshSource,
} from "./owner-refresh-coordinator.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type {
  TaskMapCitation,
  TaskMapProjectionV1,
  TaskMapSourceKind,
} from "./types.js";
import {
  TASKMAP_WORK_CONTROL_POLICY_DIGEST,
  TASKMAP_WORK_CONTROL_POLICY_VERSION,
  rankAcceptedOpenProjectionTasks,
  type TaskMapAcceptedOpenTaskRankV1,
} from "./work-control-decision.js";

export const TASKMAP_TASK_RANKING_PUBLICATION_VERSION =
  "taskmap-task-ranking.v1" as const;
export const TASKMAP_TASK_RANKING_FILENAME =
  "taskmap-task-ranking.v1.json" as const;
export const TASKMAP_TASK_RANKING_MAX_BYTES = 2 * 1_024 * 1_024;

export type TaskMapTaskRankingCoverageState = "current" | "unavailable";

export interface TaskMapTaskRankingCoverageV1 {
  source: TaskMapOwnerRefreshSource;
  state: TaskMapTaskRankingCoverageState;
  sliceDigest: string | null;
}

export interface TaskMapTaskRankingRowV1
  extends TaskMapAcceptedOpenTaskRankV1 {
  citations: TaskMapCitation[];
}

export interface TaskMapTaskRankingPublicationV1 {
  contractVersion: typeof TASKMAP_TASK_RANKING_PUBLICATION_VERSION;
  artifactDigest: string;
  ownerScopeDigest: string;
  projection: {
    contractVersion: string;
    runId: string;
    inputDigest: string;
    projectionDigest: string;
  };
  policy: {
    version: typeof TASKMAP_WORK_CONTROL_POLICY_VERSION;
    digest: string;
  };
  coverage: TaskMapTaskRankingCoverageV1[];
  rankedAcceptedOpen: TaskMapTaskRankingRowV1[];
  privacy: {
    sourceBodiesStored: false;
    localPathsStored: false;
    rawOwnerIdentifiersStored: false;
    rawSourceObjectIdentifiersStored: false;
    rawBiometricsStored: false;
    connectorSecretsStored: false;
  };
}

export interface TaskMapTaskRankingSourceStatus {
  source: TaskMapOwnerRefreshSource;
  disposition: "fresh" | "retained_last_good" | "unavailable";
  sliceDigest: string | null;
}

const SHA256 = /^[a-f0-9]{64}$/;
const FORBIDDEN_MARKER_FINGERPRINTS = Object.freeze([
  { length: 19, sha256: "2a6ab24aadadb5db8f101113dfcbaec170bc8d69b9f9c8b0ee6c3a74004d2f5c" },
  { length: 26, sha256: "c6f395f80225412ddbcc7880ab8123e869a9f8a47053d2c4afbe08c6779738e3" },
  { length: 24, sha256: "77099b4f3710a4f1ee29e1666adb7e35b576af29053684a703d43f6d276f21a7" },
  { length: 15, sha256: "3361a7530704f4841ac63a9b096ec30c0e6fbb21f3ccc7be835f90e03fbbb82b" },
  { length: 12, sha256: "d13f204287564e8acf012bb205be49458fd035536e2d2aed627cddb4df8fd81c" },
]);

const SOURCE_FAMILY_BY_KIND: Partial<
  Record<TaskMapSourceKind, TaskMapOwnerRefreshSource>
> = Object.freeze({
  codex_session: "agent_session",
  claude_session: "agent_session",
  cursor_session: "agent_session",
  gemini_meet: "meeting_notes",
  granola: "meeting_notes",
  google_calendar: "calendar",
  local_calendar: "calendar",
  oura: "body",
});

function fail(message: string): never {
  throw new Error(`Task Map task ranking invalid: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys`);
  }
}

function stringHasForbiddenMarker(value: string): boolean {
  const normalized = value.toLowerCase();
  for (const fingerprint of FORBIDDEN_MARKER_FINGERPRINTS) {
    if (normalized.length < fingerprint.length) continue;
    for (let start = 0; start <= normalized.length - fingerprint.length; start += 1) {
      const candidate = normalized.slice(start, start + fingerprint.length);
      const sha256 = createHash("sha256").update(candidate).digest("hex");
      if (sha256 === fingerprint.sha256) return true;
    }
  }
  return false;
}

function assertNoForbiddenMarkers(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === "string") {
      if (stringHasForbiddenMarker(next)) fail("demo marker");
    } else if (Array.isArray(next)) {
      pending.push(...next);
    } else if (isPlainObject(next)) {
      for (const [key, child] of Object.entries(next)) {
        if (stringHasForbiddenMarker(key)) fail("demo marker");
        pending.push(child);
      }
    }
  }
}

function projectionDigest(projection: TaskMapProjectionV1): string {
  return diffTaskMapProjections(null, projection).currentProjectionDigest;
}

function normalizeCoverage(
  statuses: readonly TaskMapTaskRankingSourceStatus[],
): TaskMapTaskRankingCoverageV1[] {
  const statusBySource = new Map<
    TaskMapOwnerRefreshSource,
    TaskMapTaskRankingSourceStatus
  >();
  for (const status of statuses) {
    if (statusBySource.has(status.source)) fail("duplicate coverage source");
    statusBySource.set(status.source, status);
  }
  if (statusBySource.size !== TASKMAP_OWNER_REFRESH_SOURCES.length) {
    fail("coverage must contain all source families");
  }
  return TASKMAP_OWNER_REFRESH_SOURCES.map((source) => {
    const status = statusBySource.get(source);
    if (status === undefined) fail("missing coverage source");
    if (status.disposition === "fresh") {
      if (status.sliceDigest === null || !SHA256.test(status.sliceDigest)) {
        fail("current coverage digest");
      }
      return { source, state: "current" as const, sliceDigest: status.sliceDigest };
    }
    // Retained last-good is deliberately unavailable to this publication. It
    // must never silently become current content or a ranking citation.
    return { source, state: "unavailable" as const, sliceDigest: null };
  });
}

function assertCitationsCovered(
  rows: readonly TaskMapTaskRankingRowV1[],
  coverage: readonly TaskMapTaskRankingCoverageV1[],
  projection: TaskMapProjectionV1,
): void {
  const current = new Set(
    coverage.filter((row) => row.state === "current").map((row) => row.source),
  );
  for (const row of rows) {
    if (row.citations.length === 0) {
      fail("ranked task citation is required");
    }
    for (const citation of row.citations) {
      const family = SOURCE_FAMILY_BY_KIND[citation.sourceKind];
      if (
        family !== undefined
        && current.has(family)
      ) continue;
      const task = projection.tasks.find((candidate) =>
        candidate.id === row.taskId
      );
      const source = projection.sources.find((candidate) =>
        candidate.id === citation.pointerId
      );
      const pointerMatch = /^tmcandidatepromotion_([a-f0-9]{64})$/.exec(
        citation.pointerId,
      );
      const promotionDigest = pointerMatch?.[1];
      const exactManualReceipt = promotionDigest !== undefined
        && citation.sourceKind === "manual"
        && citation.eventId
          === `tmcandidatepromotionevent_${promotionDigest}`
        && citation.sourceRefHash === promotionDigest
        && task?.reviewState === "accepted"
        && task.authority === "user"
        && task.taskHomePointerId === citation.pointerId
        && task.originPointerIds.includes(citation.pointerId)
        && source?.sourceKind === "manual"
        && source.sourceVersion === promotionDigest
        && source.authority === "user"
        && source.syncMode === "personal_fork"
        && source.canonicalUrl === undefined
        && source.capabilities.length === 1
        && source.capabilities[0] === "read_task";
      if (!exactManualReceipt) {
        fail("citation from unavailable source family");
      }
    }
  }
}

function coreFor(
  projection: TaskMapProjectionV1,
  ownerScopeDigest: string,
  coverage: TaskMapTaskRankingCoverageV1[],
): Omit<TaskMapTaskRankingPublicationV1, "artifactDigest"> {
  if (projection.runStatus !== "accepted" || projection.rejections.length !== 0) {
    fail("projection is not accepted");
  }
  if (!SHA256.test(ownerScopeDigest)) fail("owner scope digest");
  const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
  const rankedAcceptedOpen = rankAcceptedOpenProjectionTasks(projection)
    .map((rank): TaskMapTaskRankingRowV1 => {
      const task = taskById.get(rank.taskId);
      if (task === undefined) fail("rank task missing from projection");
      return { ...rank, citations: structuredClone(task.citations) };
    });
  assertCitationsCovered(rankedAcceptedOpen, coverage, projection);
  return {
    contractVersion: TASKMAP_TASK_RANKING_PUBLICATION_VERSION,
    ownerScopeDigest,
    projection: {
      contractVersion: projection.contractVersion,
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest: projectionDigest(projection),
    },
    policy: {
      version: TASKMAP_WORK_CONTROL_POLICY_VERSION,
      digest: TASKMAP_WORK_CONTROL_POLICY_DIGEST,
    },
    coverage,
    rankedAcceptedOpen,
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawOwnerIdentifiersStored: false,
      rawSourceObjectIdentifiersStored: false,
      rawBiometricsStored: false,
      connectorSecretsStored: false,
    },
  };
}

export function buildTaskMapTaskRankingPublication(input: {
  projection: TaskMapProjectionV1;
  ownerScopeDigest: string;
  sourceStatuses: readonly TaskMapTaskRankingSourceStatus[];
}): TaskMapTaskRankingPublicationV1 {
  const core = coreFor(
    input.projection,
    input.ownerScopeDigest,
    normalizeCoverage(input.sourceStatuses),
  );
  assertNoForbiddenMarkers(core);
  const result = { ...core, artifactDigest: taskMapContractDigest(core) };
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_TASK_RANKING_MAX_BYTES
  ) {
    fail("artifact size bound");
  }
  return result;
}

export function validateTaskMapTaskRankingPublication(
  value: unknown,
  projection: TaskMapProjectionV1,
  expectedOwnerScopeDigest: string,
): TaskMapTaskRankingPublicationV1 {
  if (!isPlainObject(value)) fail("document shape");
  assertExactKeys(value, [
    "contractVersion",
    "artifactDigest",
    "ownerScopeDigest",
    "projection",
    "policy",
    "coverage",
    "rankedAcceptedOpen",
    "privacy",
  ], "document");
  if (
    value.contractVersion !== TASKMAP_TASK_RANKING_PUBLICATION_VERSION
    || typeof value.artifactDigest !== "string"
    || !SHA256.test(value.artifactDigest)
    || typeof value.ownerScopeDigest !== "string"
    || !SHA256.test(value.ownerScopeDigest)
    || value.ownerScopeDigest !== expectedOwnerScopeDigest
    || !Array.isArray(value.coverage)
  ) {
    fail("document binding");
  }
  const statuses = value.coverage.map((item): TaskMapTaskRankingSourceStatus => {
    if (!isPlainObject(item)) fail("coverage row shape");
    assertExactKeys(item, ["source", "state", "sliceDigest"], "coverage row");
    if (!TASKMAP_OWNER_REFRESH_SOURCES.includes(
      item.source as TaskMapOwnerRefreshSource,
    )) fail("coverage source");
    if (item.state === "current") {
      if (typeof item.sliceDigest !== "string" || !SHA256.test(item.sliceDigest)) {
        fail("coverage current digest");
      }
      return {
        source: item.source as TaskMapOwnerRefreshSource,
        disposition: "fresh",
        sliceDigest: item.sliceDigest,
      };
    }
    if (item.state !== "unavailable" || item.sliceDigest !== null) {
      fail("coverage unavailable state");
    }
    return {
      source: item.source as TaskMapOwnerRefreshSource,
      disposition: "unavailable",
      sliceDigest: null,
    };
  });
  const expectedCore = coreFor(projection, value.ownerScopeDigest, normalizeCoverage(statuses));
  const expected = {
    ...expectedCore,
    artifactDigest: taskMapContractDigest(expectedCore),
  };
  assertNoForbiddenMarkers(value);
  if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(expected)) {
    fail("canonical projection/rank mismatch");
  }
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(expected), "utf8")
      > TASKMAP_TASK_RANKING_MAX_BYTES
  ) {
    fail("artifact size bound");
  }
  return structuredClone(expected);
}
