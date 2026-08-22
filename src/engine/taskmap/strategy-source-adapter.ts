import { createHash } from "node:crypto";

import {
  taskMapProjectionArtifactValidationReasons,
} from "./harness.js";
import {
  taskMapCanonicalRepositoryRowDigest,
  type TaskMapExactProvenanceCurrentnessV1,
} from "./exact-provenance-companion.js";
import {
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type {
  TaskMapNativeSemanticEvidenceBindingV1,
  TaskMapNativeSemanticSourceBindingV1,
} from "./native-semantic-builder-adapter.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceSnapshotV1,
  type TaskMapSourceStatus,
} from "./types.js";

export const TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION =
  "taskmap-strategy-source-adapter.1" as const;
export const TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION =
  "taskmap-strategy-source-adapter-result.v1" as const;
export const TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION =
  "taskmap-strategy-source-provenance.v1" as const;
export const TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME =
  "taskmap-strategy-source-evidence.v1.json" as const;
export const TASKMAP_STRATEGY_SOURCE_LIMITS_V1 = Object.freeze({
  maximumProjectionBytes: 512 * 1_024,
  maximumCurrentnessBytes: 128 * 1_024,
  maximumRepositoryFileBytes: 256 * 1_024,
  maximumResultBytes: 512 * 1_024,
  maximumTasks: 128,
  maximumRoots: 32,
} as const);

const POLICY = Object.freeze({
  version: TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
  scope: "current_strategy_owned_tasks_only_not_all_current_tasks",
  selection: "accepted_current_strategy_task_home",
  rowBinding: "owner_local_pointer_plus_canonical_row_digest",
  repository: "one_immutable_git_revision_and_remote_locator",
  semanticText: "accepted_projection_only",
  lifecycle: "accepted_projection_source_status_preserved",
  rootLink: "accepted_root_membership_digest",
  historicalSourceDayReceipts: "none",
  bodyJoinEligibility: false,
});
export const TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST =
  taskMapContractDigest(POLICY);

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,511}$/;
const SAFE_ORIGIN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_GITHUB_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_REPOSITORY_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const ROOT_LINK_DOMAIN = "taskmap-strategy-root-link.1";
const TASK_PROOF_DOMAIN = "taskmap-strategy-task-proof.1";
const PROVENANCE_DOMAIN = "taskmap-strategy-source-provenance.1";
const RESULT_DOMAIN = "taskmap-strategy-source-adapter-result.1";
const REPOSITORY_BINDING_DOMAIN = "taskmap-strategy-repository-binding.1";
const PRIVACY = Object.freeze({
  sourceRowsStored: false,
  sourceBodiesStored: false,
  localPathsStored: false,
  rawBiometricsStored: false,
  ownerIdentityStored: false,
} as const);

export type TaskMapStrategySourceFailureCode =
  | "invalid_contract"
  | "digest_mismatch"
  | "invalid_projection"
  | "invalid_currentness"
  | "no_current_strategy_tasks"
  | "row_binding_mismatch"
  | "mutable_revision"
  | "repository_locator_mismatch"
  | "repository_read_failed"
  | "repository_response_malformed"
  | "repository_content_limit"
  | "row_resolution_failed"
  | "lifecycle_unavailable"
  | "root_link_unavailable"
  | "result_limit_exceeded";

export class TaskMapStrategySourceUnavailableError extends Error {
  constructor(readonly code: TaskMapStrategySourceFailureCode) {
    super(`Task Map Strategy source unavailable: ${code}`);
    this.name = "TaskMapStrategySourceUnavailableError";
  }
}

export interface TaskMapStrategyRowBindingV1 {
  pointerId: string;
  canonicalRowDigest: string;
}

export interface TaskMapStrategyRepositoryReadRequestV1 {
  remoteLocator: string;
  revision: string;
  repositoryRelativePath: string;
  maximumBytes: number;
}

export interface TaskMapStrategyRepositoryObservationV1
  extends Omit<TaskMapStrategyRepositoryReadRequestV1, "maximumBytes"> {
  committedAt: string;
  content: string;
  contentDigest: string;
}

export interface TaskMapStrategyRepositoryProviderV1 {
  readImmutableRepositoryFile(
    request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
  ): Promise<unknown>;
}

export interface ReadTaskMapStrategySourceAdapterInputV1 {
  ownerScopeDigest: string;
  binding: TaskMapSourceAuthorityBindingV1;
  projectionBytes: Uint8Array;
  currentnessBytes: Uint8Array;
  expectedProjectionFileDigest: string;
  expectedCurrentnessFileDigest: string;
  rowBindings: TaskMapStrategyRowBindingV1[];
  repositoryProvider: TaskMapStrategyRepositoryProviderV1;
}

export interface TaskMapStrategyAcceptedRootLinkV1 {
  rootId: string;
  rootLinkRef: string;
  memberObjectRefs: string[];
  memberObjectRefsDigest: string;
  projectionRootDigest: string;
}

export interface TaskMapStrategySourceTaskProofV1 {
  taskId: string;
  rootId: string;
  pointerId: string;
  eventId: string;
  rootLinkRef: string;
  sourceEnvelopeId: string;
  sourceIdentityDigest: string;
  sourceRevision: string;
  canonicalRowDigest: string;
  projectionTaskDigest: string;
  projectionCitationDigest: string;
  proofDigest: string;
}

export interface TaskMapStrategySourceProvenanceV1 {
  contractVersion: typeof TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION;
  artifactDigest: string;
  scope: "current_strategy_owned_tasks_only";
  projection: {
    runId: string;
    inputDigest: string;
    projectionFileDigest: string;
    projectionDigest: string;
    currentnessFileDigest: string;
    allCurrentTaskCount: number;
    attestedStrategyTaskCount: number;
    excludedCurrentTaskCount: number;
    excludedCurrentTaskSetDigest: string;
  };
  repository: {
    remoteLocator: string;
    revision: string;
    repositoryRelativePath: string;
    committedAt: string;
    fileContentDigest: string;
    repositoryBindingDigest: string;
  };
  producer: {
    version: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION;
    policyDigest:
      typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST;
    rowBindingSetDigest: string;
  };
  sourceSnapshotDigest: string;
  tasks: TaskMapStrategySourceTaskProofV1[];
  rootLinks: TaskMapStrategyAcceptedRootLinkV1[];
  privacy: typeof PRIVACY;
}

export interface TaskMapStrategySourceAdapterResultV1 {
  contractVersion: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION;
  resultDigest: string;
  adapterVersion: typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION;
  adapterPolicyDigest:
    typeof TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST;
  rowBindingSetDigest: string;
  ownerScopeDigest: string;
  taskMapInput: TaskMapInput;
  sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
  evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
  sourceSnapshot: TaskMapSourceSnapshotV1;
  exactProvenance: TaskMapStrategySourceProvenanceV1;
  privacy: typeof PRIVACY;
}

type Currentness = TaskMapExactProvenanceCurrentnessV1;
type ProjectionTask = TaskMapProjectionV1["tasks"][number];
type ProjectionRoot = TaskMapProjectionV1["roots"][number];
type ProjectionSource = TaskMapProjectionV1["sources"][number];
type ProjectionCitation = ProjectionTask["citations"][number];

interface InputSnapshot {
  ownerScopeDigest: string;
  binding: TaskMapSourceAuthorityBindingV1;
  projection: TaskMapProjectionV1;
  projectionFileDigest: string;
  currentness: Currentness;
  currentnessFileDigest: string;
  rowBindings: TaskMapStrategyRowBindingV1[];
  rowBindingSetDigest: string;
  readRepository:
    TaskMapStrategyRepositoryProviderV1["readImmutableRepositoryFile"];
}

interface Selection {
  task: ProjectionTask;
  root: ProjectionRoot;
  source: ProjectionSource;
  citation: ProjectionCitation;
  canonicalRowDigest: string;
}

function fail(code: TaskMapStrategySourceFailureCode): never {
  throw new TaskMapStrategySourceUnavailableError(code);
}

function digestBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && (
      Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null
    );
}

function hasKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function timestamp(value: unknown): value is string {
  const match = typeof value === "string"
    ? STRICT_RFC3339.exec(value)
    : null;
  if (match === null || !Number.isFinite(Date.parse(value as string))) {
    return false;
  }
  return match[7] === "Z"
    || (Number(match[8]) <= 23 && Number(match[9]) <= 59);
}

function parseDocument<T>(
  source: Uint8Array,
  maximumBytes: number,
): { value: T; digest: string } {
  if (
    !(source instanceof Uint8Array)
    || source.byteLength === 0
    || source.byteLength > maximumBytes
  ) {
    fail("invalid_contract");
  }
  const bytes = Uint8Array.from(source);
  try {
    return {
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as T,
      digest: digestBytes(bytes),
    };
  } catch {
    fail("invalid_contract");
  }
}

function currentTaskIds(
  projection: TaskMapProjectionV1,
  currentness: Currentness,
  projectionDigest: string,
): string[] {
  if (
    !isObject(currentness)
    || !hasKeys(currentness, [
      "contractVersion",
      "runId",
      "inputDigest",
      "projectionDigest",
      "taskDispositions",
    ])
    || currentness.contractVersion
      !== "taskmap-native-currentness-gate.v1"
    || currentness.runId !== projection.runId
    || currentness.inputDigest !== projection.inputDigest
    || currentness.projectionDigest !== projectionDigest
    || !Array.isArray(currentness.taskDispositions)
    || currentness.taskDispositions.length !== projection.tasks.length
  ) {
    fail("invalid_currentness");
  }
  const expected = new Set(projection.tasks.map((task) => task.id));
  const seen = new Set<string>();
  const current: string[] = [];
  for (const row of currentness.taskDispositions) {
    if (
      !isObject(row)
      || !hasKeys(row, ["taskId", "disposition"])
      || typeof row.taskId !== "string"
      || !SAFE_ID.test(row.taskId)
      || !expected.has(row.taskId)
      || seen.has(row.taskId)
      || (
        row.disposition !== "current"
        && row.disposition !== "needs_lifecycle_review"
      )
    ) {
      fail("invalid_currentness");
    }
    seen.add(row.taskId);
    if (row.disposition === "current") current.push(row.taskId);
  }
  if (seen.size !== expected.size || current.length === 0) {
    fail("invalid_currentness");
  }
  return current.sort();
}

function snapshotInput(
  input: ReadTaskMapStrategySourceAdapterInputV1,
): InputSnapshot {
  if (
    !SHA256.test(input.ownerScopeDigest)
    || !SHA256.test(input.expectedProjectionFileDigest)
    || !SHA256.test(input.expectedCurrentnessFileDigest)
  ) {
    fail("invalid_contract");
  }
  const projectionDocument = parseDocument<TaskMapProjectionV1>(
    input.projectionBytes,
    TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumProjectionBytes,
  );
  const currentnessDocument = parseDocument<Currentness>(
    input.currentnessBytes,
    TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumCurrentnessBytes,
  );
  if (
    projectionDocument.digest !== input.expectedProjectionFileDigest
    || currentnessDocument.digest !== input.expectedCurrentnessFileDigest
  ) {
    fail("digest_mismatch");
  }
  const projection = projectionDocument.value;
  if (
    projection.runStatus !== "accepted"
    || projection.rejections.length !== 0
    || projection.tasks.length
      > TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumTasks
    || projection.roots.length
      > TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumRoots
    || taskMapProjectionArtifactValidationReasons(projection).length > 0
  ) {
    fail("invalid_projection");
  }
  let projectionDigest: string;
  try {
    projectionDigest =
      diffTaskMapProjections(null, projection).currentProjectionDigest;
  } catch {
    fail("invalid_projection");
  }
  currentTaskIds(
    projection,
    currentnessDocument.value,
    projectionDigest,
  );
  if (
    !isObject(input.binding)
    || !hasKeys(input.binding, [
      "connectionId",
      "sourceKind",
      "tenantOrWorkspaceDigest",
      "accountOrPrincipalDigest",
      "grantVersion",
    ])
    || !SAFE_ID.test(input.binding.connectionId)
    || input.binding.sourceKind !== "strategy"
    || !SHA256.test(input.binding.tenantOrWorkspaceDigest)
    || input.binding.accountOrPrincipalDigest !== input.ownerScopeDigest
    || !SAFE_ID.test(input.binding.grantVersion)
  ) {
    fail("invalid_contract");
  }
  if (
    !Array.isArray(input.rowBindings)
    || input.rowBindings.length === 0
    || input.rowBindings.length
      > TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumTasks
  ) {
    fail("invalid_contract");
  }
  const rowBindings = input.rowBindings.map((row) => {
    if (
      !isObject(row)
      || !hasKeys(row, ["pointerId", "canonicalRowDigest"])
      || typeof row.pointerId !== "string"
      || !SAFE_ID.test(row.pointerId)
      || typeof row.canonicalRowDigest !== "string"
      || !SHA256.test(row.canonicalRowDigest)
    ) {
      fail("invalid_contract");
    }
    return {
      pointerId: row.pointerId,
      canonicalRowDigest: row.canonicalRowDigest,
    };
  }).sort((left, right) => left.pointerId.localeCompare(right.pointerId));
  if (
    new Set(rowBindings.map((row) => row.pointerId)).size
      !== rowBindings.length
  ) {
    fail("invalid_contract");
  }
  const provider = input.repositoryProvider;
  if (typeof provider?.readImmutableRepositoryFile !== "function") {
    fail("invalid_contract");
  }
  return {
    ownerScopeDigest: input.ownerScopeDigest,
    binding: { ...input.binding },
    projection: structuredClone(projection),
    projectionFileDigest: projectionDocument.digest,
    currentness: structuredClone(currentnessDocument.value),
    currentnessFileDigest: currentnessDocument.digest,
    rowBindings,
    rowBindingSetDigest: taskMapContractDigest(rowBindings),
    readRepository:
      provider.readImmutableRepositoryFile.bind(provider),
  };
}

function immutableLocator(source: ProjectionSource): {
  remoteLocator: string;
  revision: string;
  repositoryRelativePath: string;
} {
  if (
    source.sourceVersion === undefined
    || !GIT_COMMIT.test(source.sourceVersion)
  ) {
    fail("mutable_revision");
  }
  let url: URL;
  let segments: string[];
  try {
    url = new URL(source.canonicalUrl ?? "");
    segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    fail("repository_locator_mismatch");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "github.com"
    || url.port !== ""
    || url.username !== ""
    || url.password !== ""
    || url.search !== ""
    || url.hash !== ""
    || segments.length < 5
    || !SAFE_GITHUB_SEGMENT.test(segments[0]!)
    || !SAFE_GITHUB_SEGMENT.test(segments[1]!)
    || segments[2] !== "blob"
    || segments[3] !== source.sourceVersion
  ) {
    fail("repository_locator_mismatch");
  }
  const repositoryRelativePath = segments.slice(4).join("/");
  if (
    !SAFE_REPOSITORY_PATH.test(repositoryRelativePath)
    || repositoryRelativePath.split("/").some((part) =>
      part === "." || part === ".."
    )
  ) {
    fail("repository_locator_mismatch");
  }
  return {
    remoteLocator:
      `https://github.com/${segments[0]}/${segments[1]}`,
    revision: source.sourceVersion,
    repositoryRelativePath,
  };
}

function selections(
  snapshot: InputSnapshot,
  currentIds: readonly string[],
): Selection[] {
  const current = new Set(currentIds);
  const bindingByPointer = new Map(
    snapshot.rowBindings.map((row) => [row.pointerId, row]),
  );
  const sourceById = new Map(
    snapshot.projection.sources.map((source) => [source.id, source]),
  );
  const rootById = new Map(
    snapshot.projection.roots.map((root) => [root.id, root]),
  );
  const selected = snapshot.projection.tasks.flatMap((task): Selection[] => {
    if (!current.has(task.id)) return [];
    const pointerId = task.taskHomePointerId;
    const source = pointerId === undefined
      ? undefined
      : sourceById.get(pointerId);
    if (source?.sourceKind !== "strategy") return [];
    const root = rootById.get(task.rootId);
    const citation = task.citations.filter(
      (row) => row.pointerId === pointerId,
    );
    const rowBinding = pointerId === undefined
      ? undefined
      : bindingByPointer.get(pointerId);
    if (rowBinding === undefined) fail("row_binding_mismatch");
    if (
      task.reviewState !== "accepted"
      || task.authority !== "source_system"
      || pointerId === undefined
      || !task.originPointerIds.includes(pointerId)
      || source.authority !== "source_system"
      || !source.capabilities.includes("read_task")
      || root === undefined
      || !root.taskIds.includes(task.id)
      || citation.length !== 1
    ) {
      fail("invalid_projection");
    }
    return [{
      task,
      root,
      source,
      citation: citation[0]!,
      canonicalRowDigest: rowBinding.canonicalRowDigest,
    }];
  }).sort((left, right) => left.task.id.localeCompare(right.task.id));
  if (selected.length === 0) fail("no_current_strategy_tasks");
  const selectedPointers = new Set(
    selected.map((row) => row.task.taskHomePointerId!),
  );
  if (
    selectedPointers.size !== selected.length
    || selectedPointers.size !== snapshot.rowBindings.length
    || snapshot.rowBindings.some((row) =>
      !selectedPointers.has(row.pointerId)
    )
  ) {
    fail("row_binding_mismatch");
  }
  return selected;
}

function repositoryObservation(
  raw: unknown,
  request: TaskMapStrategyRepositoryReadRequestV1,
): TaskMapStrategyRepositoryObservationV1 {
  if (
    !isObject(raw)
    || !hasKeys(raw, [
      "remoteLocator",
      "revision",
      "repositoryRelativePath",
      "committedAt",
      "content",
      "contentDigest",
    ])
    || raw.remoteLocator !== request.remoteLocator
    || raw.revision !== request.revision
    || raw.repositoryRelativePath !== request.repositoryRelativePath
    || !timestamp(raw.committedAt)
    || typeof raw.content !== "string"
    || raw.content.includes("\u0000")
    || typeof raw.contentDigest !== "string"
    || !SHA256.test(raw.contentDigest)
  ) {
    fail("repository_response_malformed");
  }
  if (
    Buffer.byteLength(raw.content, "utf8") > request.maximumBytes
  ) {
    fail("repository_content_limit");
  }
  if (digestText(raw.content) !== raw.contentDigest) {
    fail("digest_mismatch");
  }
  return {
    remoteLocator: raw.remoteLocator,
    revision: raw.revision,
    repositoryRelativePath: raw.repositoryRelativePath,
    committedAt: raw.committedAt,
    content: raw.content,
    contentDigest: raw.contentDigest,
  };
}

function resolveRow(
  observation: TaskMapStrategyRepositoryObservationV1,
  pointerId: string,
  expectedDigest: string,
): void {
  const matches = observation.content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((row) => row.startsWith("|"))
    .filter((row) =>
      taskMapCanonicalRepositoryRowDigest({
        repositoryRelativePath: observation.repositoryRelativePath,
        sourceObjectId: pointerId,
        rowText: row,
      }) === expectedDigest
    );
  if (matches.length !== 1) fail("row_resolution_failed");
}

function activity(
  sourceStatus: TaskMapSourceStatus | undefined,
): "task_created" | "task_updated" {
  if (sourceStatus === "open") return "task_created";
  if (
    sourceStatus === "in_progress"
    || sourceStatus === "blocked"
    || sourceStatus === "awaiting_review"
  ) {
    return "task_updated";
  }
  fail("lifecycle_unavailable");
}

function acceptedRootLink(
  root: ProjectionRoot,
): TaskMapStrategyAcceptedRootLinkV1 {
  if (
    root.memberObjectRefs.length === 0
    || new Set(root.memberObjectRefs).size
      !== root.memberObjectRefs.length
  ) {
    fail("root_link_unavailable");
  }
  const memberObjectRefs = [...root.memberObjectRefs].sort();
  return {
    rootId: root.id,
    rootLinkRef: `external:${taskMapContractDigest({
      domain: ROOT_LINK_DOMAIN,
      memberObjectRefs,
    })}`,
    memberObjectRefs,
    memberObjectRefsDigest: taskMapContractDigest(memberObjectRefs),
    projectionRootDigest: taskMapContractDigest(root),
  };
}

function buildProvenance(input: {
  snapshot: InputSnapshot;
  projectionDigest: string;
  currentIds: string[];
  observation: TaskMapStrategyRepositoryObservationV1;
  sourceSnapshot: TaskMapSourceSnapshotV1;
  taskProofs: TaskMapStrategySourceTaskProofV1[];
  rootLinks: TaskMapStrategyAcceptedRootLinkV1[];
  repositoryBindingDigest: string;
}): TaskMapStrategySourceProvenanceV1 {
  const attested = new Set(input.taskProofs.map((row) => row.taskId));
  const excluded = input.currentIds
    .filter((taskId) => !attested.has(taskId))
    .sort();
  const core: Omit<TaskMapStrategySourceProvenanceV1, "artifactDigest"> = {
    contractVersion: TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION,
    scope: "current_strategy_owned_tasks_only",
    projection: {
      runId: input.snapshot.projection.runId,
      inputDigest: input.snapshot.projection.inputDigest,
      projectionFileDigest: input.snapshot.projectionFileDigest,
      projectionDigest: input.projectionDigest,
      currentnessFileDigest: input.snapshot.currentnessFileDigest,
      allCurrentTaskCount: input.currentIds.length,
      attestedStrategyTaskCount: input.taskProofs.length,
      excludedCurrentTaskCount: excluded.length,
      excludedCurrentTaskSetDigest: taskMapContractDigest(excluded),
    },
    repository: {
      remoteLocator: input.observation.remoteLocator,
      revision: input.observation.revision,
      repositoryRelativePath: input.observation.repositoryRelativePath,
      committedAt: input.observation.committedAt,
      fileContentDigest: input.observation.contentDigest,
      repositoryBindingDigest: input.repositoryBindingDigest,
    },
    producer: {
      version: TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
      policyDigest: TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
      rowBindingSetDigest: input.snapshot.rowBindingSetDigest,
    },
    sourceSnapshotDigest: input.sourceSnapshot.sourceSnapshotDigest,
    tasks: input.taskProofs,
    rootLinks: input.rootLinks,
    privacy: { ...PRIVACY },
  };
  return {
    ...core,
    artifactDigest: taskMapContractDigest({
      domain: PROVENANCE_DOMAIN,
      ...core,
    }),
  };
}

export async function readTaskMapStrategySourceAdapter(
  input: ReadTaskMapStrategySourceAdapterInputV1,
): Promise<TaskMapStrategySourceAdapterResultV1> {
  const snapshot = snapshotInput(input);
  const projectionDigest =
    diffTaskMapProjections(
      null,
      snapshot.projection,
    ).currentProjectionDigest;
  const currentIds = currentTaskIds(
    snapshot.projection,
    snapshot.currentness,
    projectionDigest,
  );
  const selected = selections(snapshot, currentIds);
  const locators = selected.map((row) => immutableLocator(row.source));
  const locator = locators[0]!;
  if (
    locators.some((row) =>
      row.remoteLocator !== locator.remoteLocator
      || row.revision !== locator.revision
      || row.repositoryRelativePath !== locator.repositoryRelativePath
    )
  ) {
    fail("repository_locator_mismatch");
  }
  const request = deepFreeze<TaskMapStrategyRepositoryReadRequestV1>({
    ...locator,
    maximumBytes:
      TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumRepositoryFileBytes,
  });
  let rawObservation: unknown;
  try {
    rawObservation = await snapshot.readRepository(request);
  } catch {
    fail("repository_read_failed");
  }
  const observation = repositoryObservation(rawObservation, request);
  const repositoryBindingDigest = taskMapContractDigest({
    domain: REPOSITORY_BINDING_DOMAIN,
    remoteLocator: observation.remoteLocator,
    revision: observation.revision,
    repositoryRelativePath: observation.repositoryRelativePath,
    fileContentDigest: observation.contentDigest,
  });
  const rootLinks = new Map<string, TaskMapStrategyAcceptedRootLinkV1>();
  const pointers: TaskMapInput["pointers"] = [];
  const events: TaskMapEvent[] = [];
  const sourceBindings: TaskMapNativeSemanticSourceBindingV1[] = [];
  const evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[] = [];
  const envelopes = [];
  const taskProofs: TaskMapStrategySourceTaskProofV1[] = [];

  for (const row of selected) {
    resolveRow(
      observation,
      row.task.taskHomePointerId!,
      row.canonicalRowDigest,
    );
    if (
      Date.parse(observation.committedAt)
        < Date.parse(row.citation.occurredAt)
    ) {
      fail("repository_response_malformed");
    }
    const envelope = buildTaskMapSourceEnvelope({
      ownerScopeDigest: snapshot.ownerScopeDigest,
      binding: snapshot.binding,
      sourceKind: "strategy",
      objectType: "authoritative_task",
      sourceObjectId: row.task.taskHomePointerId!,
      sourceRevision: observation.revision,
      eventTime: observation.committedAt,
      contentDigest: row.canonicalRowDigest,
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    });
    const link = rootLinks.get(row.root.id) ?? acceptedRootLink(row.root);
    rootLinks.set(row.root.id, link);
    const pointerId = row.task.taskHomePointerId!;
    if (
      !SAFE_ORIGIN.test(pointerId)
      || !SHA256.test(row.citation.sourceRefHash)
    ) {
      fail("invalid_projection");
    }
    pointers.push({
      id: pointerId,
      sourceKind: "strategy",
      sourceObjectId: pointerId,
      sourceRefHash: row.citation.sourceRefHash,
      canonicalUrl: row.source.canonicalUrl,
      sourceVersion: row.canonicalRowDigest,
      authority: "source_system",
      syncMode: row.source.syncMode,
      capabilities: [...row.source.capabilities].sort(),
    });
    events.push({
      id: row.citation.eventId,
      pointerId,
      recordKind: "authoritative_task",
      activity: activity(row.task.sourceStatus),
      occurredAt: row.citation.occurredAt,
      observedAt: observation.committedAt,
      objectRefs: [link.rootLinkRef],
      title: row.task.title,
      summary: row.task.summary,
      extractionConfidence: row.citation.extractionConfidence,
      sourceStatus: row.task.sourceStatus!,
    });
    sourceBindings.push({
      pointerId,
      semanticClass: "source_authoritative",
      semanticOriginId: pointerId,
      semanticIdentityDigest: row.citation.sourceRefHash,
      sourceIdentityDigest: envelope.sourceIdentityDigest,
      observedRevision: observation.revision,
      evidenceRevision: observation.revision,
      observedContentDigest: row.canonicalRowDigest,
      evidenceContentDigest: row.canonicalRowDigest,
    });
    evidenceBindings.push({
      eventId: row.citation.eventId,
      disposition: "source_authoritative",
      rootLinkRefs: [link.rootLinkRef],
    });
    envelopes.push(envelope);
    const proofCore = {
      taskId: row.task.id,
      rootId: row.root.id,
      pointerId,
      eventId: row.citation.eventId,
      rootLinkRef: link.rootLinkRef,
      sourceEnvelopeId: envelope.envelopeId,
      sourceIdentityDigest: envelope.sourceIdentityDigest,
      sourceRevision: observation.revision,
      canonicalRowDigest: row.canonicalRowDigest,
      projectionTaskDigest: taskMapContractDigest(row.task),
      projectionCitationDigest: taskMapContractDigest([row.citation]),
    };
    taskProofs.push({
      ...proofCore,
      proofDigest: taskMapContractDigest({
        domain: TASK_PROOF_DOMAIN,
        adapterPolicyDigest:
          TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
        rowBindingSetDigest: snapshot.rowBindingSetDigest,
        repositoryBindingDigest,
        ...proofCore,
      }),
    });
  }

  const sourceSnapshot = buildTaskMapSourceSnapshot(envelopes, []);
  const acceptedRootLinks = [...rootLinks.values()].sort((left, right) =>
    left.rootId.localeCompare(right.rootId)
  );
  const exactProvenance = buildProvenance({
    snapshot,
    projectionDigest,
    currentIds,
    observation,
    sourceSnapshot,
    taskProofs: taskProofs.sort((left, right) =>
      left.taskId.localeCompare(right.taskId)
    ),
    rootLinks: acceptedRootLinks,
    repositoryBindingDigest,
  });
  const core: Omit<TaskMapStrategySourceAdapterResultV1, "resultDigest"> = {
    contractVersion: TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION,
    adapterVersion: TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
    adapterPolicyDigest:
      TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
    rowBindingSetDigest: snapshot.rowBindingSetDigest,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    taskMapInput: {
      contractVersion: TASKMAP_CONTRACT_VERSION,
      generatedAt: observation.committedAt,
      pointers: pointers.sort((left, right) => left.id.localeCompare(right.id)),
      events: events.sort((left, right) => left.id.localeCompare(right.id)),
    },
    sourceBindings: sourceBindings.sort((left, right) =>
      left.pointerId.localeCompare(right.pointerId)
    ),
    evidenceBindings: evidenceBindings.sort((left, right) =>
      left.eventId.localeCompare(right.eventId)
    ),
    sourceSnapshot,
    exactProvenance,
    privacy: { ...PRIVACY },
  };
  const result = deepFreeze<TaskMapStrategySourceAdapterResultV1>({
    ...core,
    resultDigest: taskMapContractDigest({
      domain: RESULT_DOMAIN,
      ...core,
    }),
  });
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(result), "utf8")
      > TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumResultBytes
  ) {
    fail("result_limit_exceeded");
  }
  return result;
}
