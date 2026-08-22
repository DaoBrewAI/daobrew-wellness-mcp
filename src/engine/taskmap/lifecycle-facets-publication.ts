import { createHash, randomBytes } from "node:crypto";
import {
  constants as FS_CONSTANTS,
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeSync,
  type BigIntStats,
} from "node:fs";
import path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  readTaskMapIdentityDedupeProjectionStore,
  type TaskMapIdentityDedupeProjectionStoreEntryV1,
  type TaskMapIdentityDedupeStorePredecessorV1,
  type TaskMapIdentityDedupeStoreRoots,
  type TaskMapIdentityDedupeStoreSnapshotV1,
} from "./identity-dedupe-projection.js";
import {
  assertTaskMapLifecycleFacets,
  buildTaskMapLifecycleFacets,
  taskMapLifecycleFacetsCanonicalBytes,
  type BuiltTaskMapLifecycleFacets,
  type TaskMapLifecycleFacetsPredecessorV1,
  type TaskMapLifecycleFacetsV1,
} from "./lifecycle-facets.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import type { TaskMapProjectionV1 } from "./types.js";
import {
  unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest,
} from "./work-control-decision.js";

export const TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION =
  "taskmap-lifecycle-facets-publication.v1" as const;

export const TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1 = Object.freeze({
  maxInputBytes: 16 * 1024 * 1024,
  maxMemberBytes: 4 * 1024 * 1024,
  maxCapsuleBytes: 16 * 1024 * 1024,
  maxGenerations: 4_096,
  maxHistoryBytes: 64 * 1024 * 1024,
  maxStagingEntries: 32,
  maxStagingBytes: 64 * 1024 * 1024,
  maxPathBytes: 4_096,
  maxJsonNodes: 200_000,
  maxJsonDepth: 64,
  maxObjectKeys: 256,
  maxArrayLength: 100_000,
  maxStringBytes: 4 * 1024 * 1024,
});

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const GENERATIONS_DIRECTORY = "generations";
const STAGING_DIRECTORY = "staging";
const GENERATION_FILE = /^([0-9]{20})\.publication\.json$/;
const STAGE_FILE = /^stage_([a-f0-9]{32})\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PUBLICATION_ID = /^tmlifecyclepublication_[a-f0-9]{64}$/;
const FIXED_GENERATION = /^[0-9]{20}$/;

export interface TaskMapLifecycleFacetsPublicationPredecessorV1 {
  generation: string;
  publicationId: string;
  publicationDigest: string;
}

export interface TaskMapLifecycleFacetsProjectionMemberV1 {
  contractVersion: string;
  runId: string;
  inputDigest: string;
  projectionDigest: string;
  byteLength: number;
  byteSha256: string;
  canonicalBytes: string;
}

export interface TaskMapLifecycleFacetsArtifactMemberV1 {
  contractVersion: string;
  artifactId: string;
  artifactDigest: string;
  originDigest: string;
  byteLength: number;
  byteSha256: string;
  canonicalBytes: string;
}

export interface TaskMapLifecycleFacetsPublicationPrivacyV1 {
  sourceBodiesStored: false;
  candidateTokensStored: false;
  candidateTextStored: false;
  additionalRouteDataStored: false;
  rawOwnerIdentifiersStored: false;
  rawSourceObjectIdentifiersStored: false;
  rawSourceRevisionsStored: false;
  rawBiometricsStored: false;
  localPathsStored: false;
  connectorSecretsStored: false;
  executionStateStored: false;
}

/**
 * One immutable P11 capsule. `p10Head` is the exact predecessor tuple emitted
 * by the authenticated lifecycle builder. `p10StorePredecessor` and
 * `p10EntryDigest` additionally bind that head to its exact P10 store entry,
 * without copying the P10 store or mutating its current reference.
 */
export interface TaskMapLifecycleFacetsPublicationV1 {
  contractVersion: typeof TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION;
  publicationId: string;
  publicationDigest: string;
  generation: string;
  predecessorPublication:
    | TaskMapLifecycleFacetsPublicationPredecessorV1
    | null;
  p10Head: TaskMapLifecycleFacetsPredecessorV1;
  p10StorePredecessor: TaskMapIdentityDedupeStorePredecessorV1 | null;
  p10EntryDigest: string;
  projectionMember: TaskMapLifecycleFacetsProjectionMemberV1;
  lifecycleMember: TaskMapLifecycleFacetsArtifactMemberV1;
  privacy: TaskMapLifecycleFacetsPublicationPrivacyV1;
}

export interface TaskMapLifecycleFacetsPublicationStoreRoots
  extends TaskMapIdentityDedupeStoreRoots {
  publicationRoot: string;
}

export interface BuildAndPublishTaskMapLifecycleFacetsInput
  extends TaskMapLifecycleFacetsPublicationStoreRoots {
  projection: TaskMapProjectionV1;
}

export type TaskMapLifecycleFacetsPublicationStatus =
  | "published"
  | "already_published"
  | "committed_head_advanced_retry";

export interface TaskMapLifecycleFacetsPublicationReceiptV1 {
  status: TaskMapLifecycleFacetsPublicationStatus;
  committed: true;
  publication: TaskMapLifecycleFacetsPublicationV1;
  processCrashAtomic: true;
  powerLossDurabilityClaimed: false;
}

export interface BuiltAndPublishedTaskMapLifecycleFacets
  extends BuiltTaskMapLifecycleFacets {
  projectionCanonicalBytes: string;
  capsule: TaskMapLifecycleFacetsPublicationV1;
  capsuleCanonicalBytes: string;
  publication: TaskMapLifecycleFacetsPublicationReceiptV1;
}

export interface TaskMapLifecycleFacetsPublicationStoreSnapshotV1 {
  publications: TaskMapLifecycleFacetsPublicationV1[];
  canonicalByteLength: number;
  remainingByteCapacity: number;
  headStatus: "empty" | "current" | "p10_head_advanced_retry";
}

export type TaskMapLifecycleFacetsPublicationFaultPoint =
  | "after_lifecycle_build"
  | "after_stage_sync"
  | "before_final_p10_read"
  | "after_generation_link"
  | "before_stage_cleanup"
  | "before_post_commit_p10_read"
  | "before_retry_p10_read";

export interface TaskMapLifecycleFacetsPublicationWriteOptions {
  faultInjection?: (
    point: TaskMapLifecycleFacetsPublicationFaultPoint,
  ) => void | Promise<void>;
}

export interface TaskMapLifecycleFacetsPublicationRecoveryOptions {
  /**
   * Recovery cannot infer that another writer is dead. The caller must first
   * quiesce P11 publishers through an out-of-process exclusivity mechanism.
   */
  externalExclusivityAsserted: true;
}

export interface TaskMapLifecycleFacetsPublicationRecoveryReceiptV1 {
  removedStageCount: number;
  retainedPublicationCount: number;
}

type CheckedDirectory = {
  directory: string;
  stats: BigIntStats;
};

type OpenPublicationStore = {
  root: CheckedDirectory;
  generations: CheckedDirectory;
  staging: CheckedDirectory;
};

type PublicationFile = {
  publication: TaskMapLifecycleFacetsPublicationV1;
  bytes: string;
  stats: BigIntStats;
};

type PublicationStoreRead = {
  publications: TaskMapLifecycleFacetsPublicationV1[];
  bytesByGeneration: Map<string, string>;
  canonicalByteLength: number;
};

type RootIdentity = {
  path: string;
  realPath: string;
  dev: bigint;
  ino: bigint;
};

type StagedPublication = {
  stagePath: string;
  bytes: string;
  stats: BigIntStats;
};

const PRIVACY: TaskMapLifecycleFacetsPublicationPrivacyV1 = Object.freeze({
  sourceBodiesStored: false,
  candidateTokensStored: false,
  candidateTextStored: false,
  additionalRouteDataStored: false,
  rawOwnerIdentifiersStored: false,
  rawSourceObjectIdentifiersStored: false,
  rawSourceRevisionsStored: false,
  rawBiometricsStored: false,
  localPathsStored: false,
  connectorSecretsStored: false,
  executionStateStored: false,
});

function fail(message: string): never {
  throw new Error(`P11 lifecycle-facets publication: ${message}`);
}

function errnoCode(error: unknown): string | undefined {
  if (
    error !== null
    && typeof error === "object"
    && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function modeBits(stats: BigIntStats): number {
  return Number(stats.mode & 0o777n);
}

function currentUid(): bigint {
  if (typeof process.getuid !== "function") {
    fail("owner-only publication requires a POSIX owner identity");
  }
  return BigInt(process.getuid());
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest`);
  }
}

function assertFixedGeneration(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !FIXED_GENERATION.test(value)) {
    fail(`${label} must be a fixed-width generation`);
  }
}

function assertExactKeys(
  value: object,
  expectedKeys: readonly string[],
  label: string,
): void {
  const keys = Object.keys(value).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} has invalid fields`);
  }
}

function assertBoundedPath(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || !path.isAbsolute(value)
    || Buffer.byteLength(value, "utf8")
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxPathBytes
  ) {
    fail(`${label} must be a bounded absolute path`);
  }
}

function assertJsonValue(
  value: unknown,
  label: string,
  state: { nodes: number },
  depth = 0,
): void {
  state.nodes += 1;
  if (
    state.nodes
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxJsonNodes
    || depth
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxJsonDepth
  ) {
    fail(`${label} exceeds the JSON structure bound`);
  }
  if (
    value === null
    || typeof value === "boolean"
    || (
      typeof value === "number"
      && Number.isFinite(value)
    )
  ) {
    return;
  }
  if (typeof value === "string") {
    if (
      Buffer.byteLength(value, "utf8")
        > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStringBytes
    ) {
      fail(`${label} contains an oversized string`);
    }
    return;
  }
  if (
    value === undefined
    || typeof value === "bigint"
    || typeof value === "function"
    || typeof value === "symbol"
  ) {
    fail(`${label} is not strict JSON`);
  }
  if (nodeUtilTypes.isProxy(value)) {
    fail(`${label} must not contain proxies`);
  }
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype
      || value.length
        > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxArrayLength
    ) {
      fail(`${label} contains a non-plain or oversized array`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) {
        fail(`${label} contains a sparse or accessor array`);
      }
      assertJsonValue(descriptor.value, label, state, depth + 1);
    }
    return;
  }
  if (
    typeof value !== "object"
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must contain only plain JSON objects`);
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxObjectKeys
    || keys.some((key) => typeof key !== "string")
  ) {
    fail(`${label} contains invalid object keys`);
  }
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      fail(`${label} contains an accessor property`);
    }
    assertJsonValue(descriptor.value, label, state, depth + 1);
  }
}

function snapshotJson<T>(
  value: T,
  label: string,
  byteLimit = TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxInputBytes,
): T {
  assertJsonValue(value, label, { nodes: 0 });
  let snapshot: T;
  try {
    snapshot = structuredClone(value);
  } catch {
    fail(`${label} must be independently cloneable`);
  }
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(snapshot), "utf8")
      > byteLimit
  ) {
    fail(`${label} exceeds its canonical byte bound`);
  }
  return snapshot;
}

function sha256Bytes(bytes: string): string {
  return createHash("sha256").update(Buffer.from(bytes, "utf8")).digest("hex");
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left)
    === taskMapContractCanonicalJson(right);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function snapshotPublishInput(
  input: BuildAndPublishTaskMapLifecycleFacetsInput,
): BuildAndPublishTaskMapLifecycleFacetsInput {
  const snapshot = snapshotJson(input, "publication input");
  assertExactKeys(
    snapshot,
    [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
      "publicationRoot",
      "projection",
    ],
    "publication input",
  );
  assertBoundedPath(snapshot.currentRoot, "current root");
  assertBoundedPath(snapshot.runRoot, "run root");
  assertBoundedPath(snapshot.sidecarRoot, "sidecar root");
  assertBoundedPath(snapshot.publicationRoot, "publication root");
  return snapshot;
}

function snapshotReadRoots(
  roots: TaskMapLifecycleFacetsPublicationStoreRoots,
): TaskMapLifecycleFacetsPublicationStoreRoots {
  const snapshot = snapshotJson(roots, "publication read roots");
  assertExactKeys(
    snapshot,
    ["currentRoot", "runRoot", "sidecarRoot", "publicationRoot"],
    "publication read roots",
  );
  assertBoundedPath(snapshot.currentRoot, "current root");
  assertBoundedPath(snapshot.runRoot, "run root");
  assertBoundedPath(snapshot.sidecarRoot, "sidecar root");
  assertBoundedPath(snapshot.publicationRoot, "publication root");
  return snapshot;
}

function checkedDirectory(directory: string, label: string): CheckedDirectory {
  let observed: BigIntStats;
  let descriptor: number | undefined;
  try {
    observed = lstatSync(directory, { bigint: true });
    if (
      !observed.isDirectory()
      || observed.isSymbolicLink()
      || observed.uid !== currentUid()
      || modeBits(observed) !== DIRECTORY_MODE
    ) {
      fail(`${label} must be a same-owner 0700 directory`);
    }
    descriptor = openSync(
      directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isDirectory()
      || opened.uid !== observed.uid
      || modeBits(opened) !== DIRECTORY_MODE
      || opened.dev !== observed.dev
      || opened.ino !== observed.ino
    ) {
      fail(`${label} changed while opening`);
    }
    return { directory, stats: opened };
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("P11 lifecycle-facets publication:")
    ) {
      throw error;
    }
    fail(`${label} cannot be opened safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return fail(`${label} cannot be opened safely`);
}

function revalidateDirectory(directory: CheckedDirectory, label: string): void {
  const observed = checkedDirectory(directory.directory, label);
  if (
    observed.stats.dev !== directory.stats.dev
    || observed.stats.ino !== directory.stats.ino
  ) {
    fail(`${label} was replaced`);
  }
}

function listDirectory(
  directory: CheckedDirectory,
  label: string,
  maximumEntries: number,
): string[] {
  revalidateDirectory(directory, label);
  let names: string[];
  try {
    names = readdirSync(directory.directory);
  } catch {
    fail(`${label} cannot be listed`);
  }
  if (names.length > maximumEntries) {
    fail(`${label} exceeds its entry bound`);
  }
  return names.sort(compareText);
}

function assertRootNames(root: CheckedDirectory): void {
  for (const name of listDirectory(root, "publication root", 2)) {
    if (name !== GENERATIONS_DIRECTORY && name !== STAGING_DIRECTORY) {
      fail("publication root contains an unknown entry");
    }
  }
}

function openPublicationStore(publicationRoot: string): OpenPublicationStore {
  assertBoundedPath(publicationRoot, "publication root");
  const root = checkedDirectory(publicationRoot, "publication root");
  assertRootNames(root);
  const generations = checkedDirectory(
    path.join(root.directory, GENERATIONS_DIRECTORY),
    "publication generations directory",
  );
  const staging = checkedDirectory(
    path.join(root.directory, STAGING_DIRECTORY),
    "publication staging directory",
  );
  revalidateDirectory(root, "publication root");
  return { root, generations, staging };
}

function revalidateOpenStore(store: OpenPublicationStore): void {
  revalidateDirectory(store.root, "publication root");
  assertRootNames(store.root);
  revalidateDirectory(
    store.generations,
    "publication generations directory",
  );
  revalidateDirectory(store.staging, "publication staging directory");
}

function rootIdentity(rootPath: string, label: string): RootIdentity {
  assertBoundedPath(rootPath, label);
  const checked = checkedDirectory(rootPath, label);
  let realPath: string;
  try {
    realPath = realpathSync.native(rootPath);
  } catch {
    fail(`${label} cannot be resolved`);
  }
  return {
    path: rootPath,
    realPath,
    dev: checked.stats.dev,
    ino: checked.stats.ino,
  };
}

function pathContains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    )
  );
}

function captureDisjointRoots(
  roots: TaskMapLifecycleFacetsPublicationStoreRoots,
): RootIdentity[] {
  const identities = [
    rootIdentity(roots.currentRoot, "current root"),
    rootIdentity(roots.runRoot, "run root"),
    rootIdentity(roots.sidecarRoot, "sidecar root"),
    rootIdentity(roots.publicationRoot, "publication root"),
  ];
  for (let left = 0; left < identities.length; left += 1) {
    for (let right = left + 1; right < identities.length; right += 1) {
      if (
        pathContains(identities[left]!.realPath, identities[right]!.realPath)
        || pathContains(
          identities[right]!.realPath,
          identities[left]!.realPath,
        )
      ) {
        fail("P10 and P11 store roots must be disjoint");
      }
    }
  }
  return identities;
}

function revalidateRootIdentities(identities: readonly RootIdentity[]): void {
  for (const identity of identities) {
    const observed = rootIdentity(identity.path, "store root");
    if (
      observed.realPath !== identity.realPath
      || observed.dev !== identity.dev
      || observed.ino !== identity.ino
    ) {
      fail("a P10 or P11 store root was replaced");
    }
  }
}

function assertFileStats(
  filePath: string,
  label: string,
  expectedDevice: bigint,
  allowedLinks: readonly bigint[],
  maximumBytes: number,
): BigIntStats {
  let stats: BigIntStats;
  try {
    stats = lstatSync(filePath, { bigint: true });
  } catch {
    fail(`${label} cannot be inspected`);
  }
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || stats.uid !== currentUid()
    || modeBits(stats) !== FILE_MODE
    || stats.dev !== expectedDevice
    || !allowedLinks.includes(stats.nlink)
    || stats.size < 1n
    || stats.size > BigInt(maximumBytes)
  ) {
    fail(`${label} is not a bounded same-owner 0600 regular file`);
  }
  return stats;
}

function readPublicationFile(
  filePath: string,
  label: string,
  expectedDevice: bigint,
  allowedLinks: readonly bigint[],
): PublicationFile {
  const observed = assertFileStats(
    filePath,
    label,
    expectedDevice,
    allowedLinks,
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      filePath,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      opened.dev !== observed.dev
      || opened.ino !== observed.ino
      || opened.uid !== observed.uid
      || opened.size !== observed.size
      || opened.nlink !== observed.nlink
      || modeBits(opened) !== FILE_MODE
    ) {
      fail(`${label} changed while opening`);
    }
    const buffer = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(buffer.byteLength) !== opened.size
      || after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || after.nlink !== opened.nlink
    ) {
      fail(`${label} changed while reading`);
    }
    let bytes: string;
    try {
      bytes = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      fail(`${label} is not valid UTF-8`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      fail(`${label} is not JSON`);
    }
    const publication = assertTaskMapLifecycleFacetsPublication(
      parsed as TaskMapLifecycleFacetsPublicationV1,
    );
    if (
      taskMapLifecycleFacetsPublicationCanonicalBytes(publication) !== bytes
    ) {
      fail(`${label} is not exact canonical JSON`);
    }
    return { publication, bytes, stats: opened };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function generationPath(
  store: OpenPublicationStore,
  generation: string,
): string {
  assertFixedGeneration(generation, "publication generation");
  return path.join(
    store.generations.directory,
    `${generation}.publication.json`,
  );
}

function publicationPredecessor(
  publication: TaskMapLifecycleFacetsPublicationV1,
): TaskMapLifecycleFacetsPublicationPredecessorV1 {
  return {
    generation: publication.generation,
    publicationId: publication.publicationId,
    publicationDigest: publication.publicationDigest,
  };
}

function readPublicationStoreFromOpen(
  store: OpenPublicationStore,
  allowStaging: boolean,
): PublicationStoreRead {
  revalidateOpenStore(store);
  const stageNames = listDirectory(
    store.staging,
    "publication staging directory",
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingEntries,
  );
  const linkedStageInodes = new Set<string>();
  let stagingBytes = 0n;
  for (const name of stageNames) {
    if (!STAGE_FILE.test(name)) {
      fail("publication staging directory contains an unknown entry");
    }
    const stage = readPublicationFile(
      path.join(store.staging.directory, name),
      `publication stage ${name}`,
      store.staging.stats.dev,
      [1n, 2n],
    );
    stagingBytes += stage.stats.size;
    if (
      stagingBytes
        > BigInt(
          TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingBytes,
        )
    ) {
      fail("publication staging exceeds its aggregate byte bound");
    }
    if (stage.stats.nlink === 2n) {
      linkedStageInodes.add(`${stage.stats.dev}:${stage.stats.ino}`);
    }
  }
  if (!allowStaging && stageNames.length > 0) {
    fail("publication store has interrupted staging state; recovery is required");
  }

  const names = listDirectory(
    store.generations,
    "publication generations directory",
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxGenerations,
  );
  const publications: TaskMapLifecycleFacetsPublicationV1[] = [];
  const bytesByGeneration = new Map<string, string>();
  let canonicalByteLength = 0n;
  let previousGeneration: bigint | undefined;
  for (const name of names) {
    const match = GENERATION_FILE.exec(name);
    if (match === null) {
      fail("publication generations directory contains an unknown entry");
    }
    const generation = match[1]!;
    const numericGeneration = BigInt(generation);
    if (
      numericGeneration < 1n
      || (
        previousGeneration !== undefined
        && numericGeneration <= previousGeneration
      )
    ) {
      fail("publication generations are not strictly increasing");
    }
    previousGeneration = numericGeneration;
    const filePath = path.join(store.generations.directory, name);
    const observedStats = lstatSync(filePath, { bigint: true });
    const inodeKey = `${observedStats.dev}:${observedStats.ino}`;
    const allowedLinks = allowStaging && linkedStageInodes.has(inodeKey)
      ? [1n, 2n]
      : [1n];
    const observed = readPublicationFile(
      filePath,
      `publication generation ${generation}`,
      store.generations.stats.dev,
      allowedLinks,
    );
    if (
      observed.stats.nlink === 2n
      && !linkedStageInodes.has(inodeKey)
    ) {
      fail("publication generation has an unbound extra hardlink");
    }
    if (observed.publication.generation !== generation) {
      fail("publication generation filename/content mismatch");
    }
    const predecessor = publications.at(-1);
    if (
      predecessor === undefined
        ? observed.publication.predecessorPublication !== null
        : !canonicalEqual(
          observed.publication.predecessorPublication,
          publicationPredecessor(predecessor),
        )
    ) {
      fail("publication predecessor chain is inconsistent");
    }
    if (
      predecessor !== undefined
      && predecessor.p10Head.ownerScopeDigest
        !== observed.publication.p10Head.ownerScopeDigest
    ) {
      fail("publication history crosses owner scope");
    }
    canonicalByteLength += observed.stats.size;
    if (
      canonicalByteLength
        > BigInt(
          TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxHistoryBytes,
        )
    ) {
      fail("publication history exceeds its aggregate byte bound");
    }
    publications.push(observed.publication);
    bytesByGeneration.set(generation, observed.bytes);
  }
  revalidateOpenStore(store);
  return {
    publications,
    bytesByGeneration,
    canonicalByteLength: Number(canonicalByteLength),
  };
}

function parseCanonicalMember<T>(
  memberBytes: string,
  byteLength: number,
  byteSha256: string,
  label: string,
): T {
  if (
    typeof memberBytes !== "string"
    || !Number.isSafeInteger(byteLength)
    || byteLength < 1
    || byteLength
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxMemberBytes
    || Buffer.byteLength(memberBytes, "utf8") !== byteLength
    || sha256Bytes(memberBytes) !== byteSha256
  ) {
    fail(`${label} byte binding is invalid`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(memberBytes);
  } catch {
    fail(`${label} is not JSON`);
  }
  if (taskMapContractCanonicalJson(parsed) !== memberBytes) {
    fail(`${label} is not exact canonical JSON`);
  }
  return parsed as T;
}

function publicationCore(
  publication: Omit<
    TaskMapLifecycleFacetsPublicationV1,
    "publicationId" | "publicationDigest"
  >,
): Omit<
  TaskMapLifecycleFacetsPublicationV1,
  "publicationId" | "publicationDigest"
> {
  return publication;
}

function assertPublicationPredecessor(
  value: TaskMapLifecycleFacetsPublicationPredecessorV1,
): void {
  assertExactKeys(
    value,
    ["generation", "publicationId", "publicationDigest"],
    "publication predecessor",
  );
  assertFixedGeneration(value.generation, "publication predecessor generation");
  if (!PUBLICATION_ID.test(value.publicationId)) {
    fail("publication predecessor ID is invalid");
  }
  assertDigest(value.publicationDigest, "publication predecessor digest");
  if (
    value.publicationId
      !== `tmlifecyclepublication_${value.publicationDigest}`
  ) {
    fail("publication predecessor ID/digest binding is invalid");
  }
}

function assertStorePredecessor(
  value: TaskMapIdentityDedupeStorePredecessorV1 | null,
): void {
  if (value === null) return;
  assertExactKeys(
    value,
    ["generation", "currentRefId", "entryId"],
    "P10 store predecessor",
  );
  assertFixedGeneration(value.generation, "P10 store predecessor generation");
  if (
    typeof value.currentRefId !== "string"
    || typeof value.entryId !== "string"
    || value.currentRefId.length === 0
    || value.entryId.length === 0
  ) {
    fail("P10 store predecessor identifiers are invalid");
  }
}

function assertPrivacy(
  privacy: TaskMapLifecycleFacetsPublicationPrivacyV1,
): void {
  assertExactKeys(privacy, Object.keys(PRIVACY), "publication privacy");
  for (const key of Object.keys(PRIVACY) as Array<
    keyof TaskMapLifecycleFacetsPublicationPrivacyV1
  >) {
    if (privacy[key] !== false) {
      fail("publication privacy flags are not fail closed");
    }
  }
}

export function assertTaskMapLifecycleFacetsPublication(
  value: TaskMapLifecycleFacetsPublicationV1,
): TaskMapLifecycleFacetsPublicationV1 {
  const publication = snapshotJson(
    value,
    "publication capsule",
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes,
  );
  assertExactKeys(
    publication,
    [
      "contractVersion",
      "publicationId",
      "publicationDigest",
      "generation",
      "predecessorPublication",
      "p10Head",
      "p10StorePredecessor",
      "p10EntryDigest",
      "projectionMember",
      "lifecycleMember",
      "privacy",
    ],
    "publication capsule",
  );
  if (
    publication.contractVersion
      !== TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION
  ) {
    fail("publication contract version is unsupported");
  }
  if (!PUBLICATION_ID.test(publication.publicationId)) {
    fail("publication ID is invalid");
  }
  assertDigest(publication.publicationDigest, "publication digest");
  assertFixedGeneration(publication.generation, "publication generation");
  if (BigInt(publication.generation) < 1n) {
    fail("publication generation must be positive");
  }
  if (publication.predecessorPublication !== null) {
    assertPublicationPredecessor(publication.predecessorPublication);
    if (
      BigInt(publication.predecessorPublication.generation)
        >= BigInt(publication.generation)
    ) {
      fail("publication predecessor is not historical");
    }
  }
  assertStorePredecessor(publication.p10StorePredecessor);
  assertDigest(publication.p10EntryDigest, "P10 entry digest");

  assertExactKeys(
    publication.projectionMember,
    [
      "contractVersion",
      "runId",
      "inputDigest",
      "projectionDigest",
      "byteLength",
      "byteSha256",
      "canonicalBytes",
    ],
    "projection member",
  );
  assertDigest(
    publication.projectionMember.inputDigest,
    "projection input digest",
  );
  assertDigest(
    publication.projectionMember.projectionDigest,
    "projection digest",
  );
  assertDigest(
    publication.projectionMember.byteSha256,
    "projection byte digest",
  );
  const projection = parseCanonicalMember<TaskMapProjectionV1>(
    publication.projectionMember.canonicalBytes,
    publication.projectionMember.byteLength,
    publication.projectionMember.byteSha256,
    "projection member",
  );
  const projectionDiff = diffTaskMapProjections(null, projection);
  if (
    publication.projectionMember.contractVersion !== projection.contractVersion
    || publication.projectionMember.runId !== projection.runId
    || publication.projectionMember.inputDigest !== projection.inputDigest
    || publication.projectionMember.projectionDigest
      !== projectionDiff.currentProjectionDigest
  ) {
    fail("projection member metadata does not bind its exact bytes");
  }

  assertExactKeys(
    publication.lifecycleMember,
    [
      "contractVersion",
      "artifactId",
      "artifactDigest",
      "originDigest",
      "byteLength",
      "byteSha256",
      "canonicalBytes",
    ],
    "lifecycle member",
  );
  assertDigest(
    publication.lifecycleMember.artifactDigest,
    "lifecycle artifact digest",
  );
  assertDigest(
    publication.lifecycleMember.originDigest,
    "lifecycle origin digest",
  );
  assertDigest(
    publication.lifecycleMember.byteSha256,
    "lifecycle byte digest",
  );
  const lifecycle = assertTaskMapLifecycleFacets(
    parseCanonicalMember<TaskMapLifecycleFacetsV1>(
      publication.lifecycleMember.canonicalBytes,
      publication.lifecycleMember.byteLength,
      publication.lifecycleMember.byteSha256,
      "lifecycle member",
    ),
  );
  if (
    taskMapLifecycleFacetsCanonicalBytes(lifecycle)
      !== publication.lifecycleMember.canonicalBytes
    || publication.lifecycleMember.contractVersion
      !== lifecycle.contractVersion
    || publication.lifecycleMember.artifactId !== lifecycle.artifactId
    || publication.lifecycleMember.artifactDigest
      !== lifecycle.artifactDigest
    || publication.lifecycleMember.originDigest !== lifecycle.originDigest
  ) {
    fail("lifecycle member metadata does not bind its exact bytes");
  }
  if (
    !canonicalEqual(publication.p10Head, lifecycle.predecessor)
    || publication.generation !== lifecycle.predecessor.generation
    || publication.projectionMember.runId
      !== lifecycle.predecessor.projectionRunId
    || publication.projectionMember.inputDigest
      !== lifecycle.predecessor.projectionInputDigest
    || publication.projectionMember.projectionDigest
      !== lifecycle.predecessor.projectionDigest
  ) {
    fail("publication members do not share the exact P10 predecessor");
  }
  assertPrivacy(publication.privacy);

  const core = publicationCore({
    contractVersion: publication.contractVersion,
    generation: publication.generation,
    predecessorPublication: publication.predecessorPublication,
    p10Head: publication.p10Head,
    p10StorePredecessor: publication.p10StorePredecessor,
    p10EntryDigest: publication.p10EntryDigest,
    projectionMember: publication.projectionMember,
    lifecycleMember: publication.lifecycleMember,
    privacy: publication.privacy,
  });
  const digest = taskMapContractDigest(core);
  if (
    publication.publicationDigest !== digest
    || publication.publicationId !== `tmlifecyclepublication_${digest}`
  ) {
    fail("publication ID/digest is not canonical-core-derived");
  }
  const bytes = taskMapContractCanonicalJson(publication);
  if (
    Buffer.byteLength(bytes, "utf8")
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes
  ) {
    fail("publication capsule exceeds its canonical byte bound");
  }
  return deepFreeze(publication);
}

export function taskMapLifecycleFacetsPublicationCanonicalBytes(
  value: TaskMapLifecycleFacetsPublicationV1,
): string {
  return taskMapContractCanonicalJson(
    assertTaskMapLifecycleFacetsPublication(value),
  );
}

function latestProjectionEntry(
  store: TaskMapIdentityDedupeStoreSnapshotV1,
  label: string,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  const latest = store.entries.at(-1);
  if (latest === undefined || latest.entryKind !== "projection") {
    fail(`${label} has no authenticated P10 projection head`);
  }
  return latest;
}

function entryMatchesLifecyclePredecessor(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  predecessor: TaskMapLifecycleFacetsPredecessorV1,
): boolean {
  const workControlOriginDigest = taskMapContractDigest({
    ownerScopeDigest: predecessor.ownerScopeDigest,
    generation: predecessor.generation,
    currentRefId: predecessor.currentRefId,
    currentRefDigest: predecessor.currentRefDigest,
    entryId: predecessor.entryId,
    acceptedOriginBundleId: predecessor.acceptedOriginBundleId,
    acceptedOriginReplayDigest: predecessor.acceptedOriginReplayDigest,
    acceptedStateDigest: predecessor.acceptedStateDigest,
    sidecarId: predecessor.sidecarId,
    sidecarDigest: predecessor.sidecarDigest,
    replayClosureDigest: predecessor.replayClosureDigest,
    sourceSnapshotDigest: predecessor.sourceSnapshotDigest,
    sourceSemanticInputDigest: predecessor.sourceSemanticInputDigest,
    projectionRunId: predecessor.projectionRunId,
    projectionInputDigest: predecessor.projectionInputDigest,
    projectionDigest: predecessor.projectionDigest,
    inputDomainBinding: "separate_authenticated_domains",
  });
  return (
    entry.ownerScopeDigest === predecessor.ownerScopeDigest
    && entry.generation === predecessor.generation
    && entry.currentRefId === predecessor.currentRefId
    && entry.currentRefDigest === predecessor.currentRefDigest
    && entry.entryId === predecessor.entryId
    && entry.acceptedOriginBundleId === predecessor.acceptedOriginBundleId
    && entry.acceptedOriginReplayDigest
      === predecessor.acceptedOriginReplayDigest
    && entry.sidecarId === predecessor.sidecarId
    && entry.sidecarDigest === predecessor.sidecarDigest
    && entry.diffId === predecessor.diffId
    && entry.diffDigest === predecessor.diffDigest
    && entry.replayClosureDigest === predecessor.replayClosureDigest
    && entry.sidecar.origin.acceptedStateDigest
      === predecessor.acceptedStateDigest
    && entry.sidecar.sourceSnapshotDigest
      === predecessor.sourceSnapshotDigest
    && entry.sidecar.replayClosure.sourceSemanticInputDigest
      === predecessor.sourceSemanticInputDigest
    && entry.sidecar.projectionRunId === predecessor.projectionRunId
    && entry.sidecar.replayClosure.projectionRunId
      === predecessor.projectionRunId
    && entry.sidecar.replayClosure.projectionInputDigest
      === predecessor.projectionInputDigest
    && entry.sidecar.projectionDigest === predecessor.projectionDigest
    && entry.sidecar.replayClosure.projectionDigest
      === predecessor.projectionDigest
    && predecessor.workControlOriginDigest === workControlOriginDigest
  );
}

function assertLifecycleRowsMatchAuthenticatedP10(
  entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  publication: TaskMapLifecycleFacetsPublicationV1,
): void {
  const projection = JSON.parse(
    publication.projectionMember.canonicalBytes,
  ) as TaskMapProjectionV1;
  const lifecycle = assertTaskMapLifecycleFacets(
    JSON.parse(
      publication.lifecycleMember.canonicalBytes,
    ) as TaskMapLifecycleFacetsV1,
  );
  const tasks = new Map(projection.tasks.map((task) => [task.id, task]));
  const taskIdByRowDigest = new Map(
    projection.tasks.map((task) => [taskMapContractDigest(task), task.id]),
  );
  const rows = new Map(lifecycle.rows.map((row) => [row.workId, row]));
  const deltas = new Map(
    entry.sidecar.lifecycleDeltas.map((delta) => [delta.workId, delta]),
  );
  if (
    rows.size !== lifecycle.rows.length
    || rows.size !== entry.sidecar.works.length
    || deltas.size !== entry.sidecar.works.length
  ) {
    fail("lifecycle rows do not cover the authenticated P10 work set");
  }
  for (const work of entry.sidecar.works) {
    const row = rows.get(work.workId);
    const delta = deltas.get(work.workId);
    if (row === undefined || delta === undefined) {
      fail("lifecycle row is absent from the authenticated P10 work set");
    }
    const expectedLifecycle = work.lifecycleState === "open"
      ? "accepted_open"
      : work.lifecycleState === "resolved"
        ? "source_complete"
        : work.lifecycleState;
    const expectedTaskIds = work.projectionReferences
      .filter((reference) => reference.kind === "task")
      .map((reference) => (
        taskIdByRowDigest.get(reference.projectionRowDigest) ?? ""
      ))
      .sort(compareText);
    const expectedRoots = new Set(
      expectedTaskIds.map((taskId) => tasks.get(taskId)?.rootId),
    );
    const expectedRootId = expectedRoots.size === 1
      ? [...expectedRoots][0]
      : undefined;
    if (
      row.lifecycle !== expectedLifecycle
      || row.lifecycleDelta.deltaId !== delta.deltaId
      || row.lifecycleDelta.previousState !== delta.previousState
      || row.lifecycleDelta.currentState !== delta.currentState
      || row.lifecycleDelta.adjudicatedDelta !== delta.adjudicatedDelta
      || row.lifecycleDelta.adjudicationDigest !== delta.adjudicationDigest
      || row.lifecycleDelta.lifecycleEventId !== delta.lifecycleEventId
      || !canonicalEqual(row.projectionTaskIds, expectedTaskIds)
      || (
        expectedLifecycle === "rejected"
          ? row.rootId !== null || expectedTaskIds.length !== 0
          : (
            expectedRootId === undefined
            || row.rootId !== expectedRootId
            || expectedTaskIds.length === 0
          )
      )
    ) {
      fail("lifecycle row diverges from authenticated P10 authority");
    }
  }
}

function assertCurrentP10Head(
  store: TaskMapIdentityDedupeStoreSnapshotV1,
  publication: TaskMapLifecycleFacetsPublicationV1,
  label: string,
): TaskMapIdentityDedupeProjectionStoreEntryV1 {
  const entry = latestProjectionEntry(store, label);
  if (
    !entryMatchesLifecyclePredecessor(entry, publication.p10Head)
    || taskMapContractDigest(entry) !== publication.p10EntryDigest
    || !canonicalEqual(entry.predecessor, publication.p10StorePredecessor)
  ) {
    fail(`${label} does not match the publication P10 head`);
  }
  return entry;
}

function assertHistoricalP10Membership(
  store: TaskMapIdentityDedupeStoreSnapshotV1,
  publication: TaskMapLifecycleFacetsPublicationV1,
): void {
  const entryIndex = store.entries.findIndex(
    (candidate) => candidate.generation === publication.generation,
  );
  const entry = store.entries[entryIndex];
  if (
    entry === undefined
    || entry.entryKind !== "projection"
    || !entryMatchesLifecyclePredecessor(entry, publication.p10Head)
    || taskMapContractDigest(entry) !== publication.p10EntryDigest
    || !canonicalEqual(entry.predecessor, publication.p10StorePredecessor)
  ) {
    fail("publication does not resolve to an authenticated P10 history member");
  }
  const projection = JSON.parse(
    publication.projectionMember.canonicalBytes,
  ) as TaskMapProjectionV1;
  const authenticatedPrefix: TaskMapIdentityDedupeStoreSnapshotV1 = {
    entries: store.entries.slice(0, entryIndex + 1),
    canonicalByteLength: store.canonicalByteLength,
    remainingByteCapacity: store.remainingByteCapacity,
  };
  /*
   * This pure seam does not establish product authority. The product P10
   * reader above already authenticated the exact prefix; the seam is used
   * only to deterministically rederive the frozen P10.3a artifact identity
   * for a historical generation that the current-head builder cannot reopen.
   */
  const expectedWorkControl =
    unsafeBuildTaskMapWorkControlDecisionFromAuthenticatedP10_2ForTest({
      firstStore: authenticatedPrefix,
      secondStore: authenticatedPrefix,
      projection,
    }).artifact;
  if (
    publication.p10Head.workControlArtifactId
      !== expectedWorkControl.artifactId
    || publication.p10Head.workControlArtifactDigest
      !== expectedWorkControl.artifactDigest
    || publication.p10Head.workControlOriginDigest
      !== expectedWorkControl.originDigest
  ) {
    fail("publication work-control artifact is not P10-derived");
  }
  assertLifecycleRowsMatchAuthenticatedP10(entry, publication);
}

function buildCapsule(
  projection: TaskMapProjectionV1,
  lifecycle: BuiltTaskMapLifecycleFacets,
  p10Entry: TaskMapIdentityDedupeProjectionStoreEntryV1,
  predecessor:
    | TaskMapLifecycleFacetsPublicationPredecessorV1
    | null,
): {
  capsule: TaskMapLifecycleFacetsPublicationV1;
  projectionCanonicalBytes: string;
  capsuleCanonicalBytes: string;
} {
  const projectionCanonicalBytes = taskMapContractCanonicalJson(projection);
  const projectionByteLength = Buffer.byteLength(
    projectionCanonicalBytes,
    "utf8",
  );
  const lifecycleByteLength = Buffer.byteLength(
    lifecycle.canonicalBytes,
    "utf8",
  );
  if (
    projectionByteLength
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxMemberBytes
    || lifecycleByteLength
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxMemberBytes
  ) {
    fail("publication member exceeds its byte bound");
  }
  const projectionDigest =
    diffTaskMapProjections(null, projection).currentProjectionDigest;
  if (
    !entryMatchesLifecyclePredecessor(p10Entry, lifecycle.artifact.predecessor)
    || projection.runId
      !== lifecycle.artifact.predecessor.projectionRunId
    || projection.inputDigest
      !== lifecycle.artifact.predecessor.projectionInputDigest
    || projectionDigest !== lifecycle.artifact.predecessor.projectionDigest
  ) {
    fail("authenticated P10 entry, projection, and lifecycle artifact diverge");
  }
  const core = publicationCore({
    contractVersion: TASKMAP_LIFECYCLE_FACETS_PUBLICATION_VERSION,
    generation: lifecycle.artifact.predecessor.generation,
    predecessorPublication: predecessor,
    p10Head: lifecycle.artifact.predecessor,
    p10StorePredecessor: p10Entry.predecessor,
    p10EntryDigest: taskMapContractDigest(p10Entry),
    projectionMember: {
      contractVersion: projection.contractVersion,
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest,
      byteLength: projectionByteLength,
      byteSha256: sha256Bytes(projectionCanonicalBytes),
      canonicalBytes: projectionCanonicalBytes,
    },
    lifecycleMember: {
      contractVersion: lifecycle.artifact.contractVersion,
      artifactId: lifecycle.artifact.artifactId,
      artifactDigest: lifecycle.artifact.artifactDigest,
      originDigest: lifecycle.artifact.originDigest,
      byteLength: lifecycleByteLength,
      byteSha256: sha256Bytes(lifecycle.canonicalBytes),
      canonicalBytes: lifecycle.canonicalBytes,
    },
    privacy: { ...PRIVACY },
  });
  const publicationDigest = taskMapContractDigest(core);
  const capsule = assertTaskMapLifecycleFacetsPublication({
    ...core,
    publicationId: `tmlifecyclepublication_${publicationDigest}`,
    publicationDigest,
  });
  return {
    capsule,
    projectionCanonicalBytes,
    capsuleCanonicalBytes:
      taskMapLifecycleFacetsPublicationCanonicalBytes(capsule),
  };
}

function writeAll(descriptor: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const written = writeSync(
      descriptor,
      buffer,
      offset,
      buffer.byteLength - offset,
      offset,
    );
    if (written < 1) fail("publication stage write made no progress");
    offset += written;
  }
}

function createStage(
  store: OpenPublicationStore,
  capsule: TaskMapLifecycleFacetsPublicationV1,
): StagedPublication {
  const bytes = taskMapLifecycleFacetsPublicationCanonicalBytes(capsule);
  const buffer = Buffer.from(bytes, "utf8");
  if (
    buffer.byteLength
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes
  ) {
    fail("publication stage exceeds its byte bound");
  }
  const existingNames = listDirectory(
    store.staging,
    "publication staging directory",
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingEntries,
  );
  let existingBytes = 0n;
  for (const name of existingNames) {
    if (!STAGE_FILE.test(name)) {
      fail("publication staging directory contains an unknown entry");
    }
    const stats = assertFileStats(
      path.join(store.staging.directory, name),
      `publication stage ${name}`,
      store.staging.stats.dev,
      [1n, 2n],
      TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes,
    );
    existingBytes += stats.size;
  }
  if (
    existingNames.length
      >= TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingEntries
    || existingBytes + BigInt(buffer.byteLength)
      > BigInt(
        TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingBytes,
      )
  ) {
    fail("publication staging has no bounded capacity");
  }
  const stagePath = path.join(
    store.staging.directory,
    `stage_${randomBytes(16).toString("hex")}.json`,
  );
  let descriptor: number | undefined;
  let createdStats: BigIntStats | undefined;
  try {
    descriptor = openSync(
      stagePath,
      FS_CONSTANTS.O_WRONLY
        | FS_CONSTANTS.O_CREAT
        | FS_CONSTANTS.O_EXCL
        | FS_CONSTANTS.O_NOFOLLOW,
      FILE_MODE,
    );
    fchmodSync(descriptor, FILE_MODE);
    writeAll(descriptor, buffer);
    fsyncSync(descriptor);
    createdStats = fstatSync(descriptor, { bigint: true });
    if (
      !createdStats.isFile()
      || createdStats.uid !== currentUid()
      || modeBits(createdStats) !== FILE_MODE
      || createdStats.nlink !== 1n
      || createdStats.size !== BigInt(buffer.byteLength)
      || createdStats.dev !== store.staging.stats.dev
    ) {
      fail("publication stage creation was not exact");
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Exact cleanup below remains inode-bound.
      }
      descriptor = undefined;
    }
    if (createdStats !== undefined) {
      removeExactStage(
        store,
        { stagePath, bytes, stats: createdStats },
        [1n],
      );
    }
    if (
      error instanceof Error
      && error.message.startsWith("P11 lifecycle-facets publication:")
    ) {
      throw error;
    }
    fail("publication stage cannot be created and synced");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fsyncDirectory(store.staging, "publication staging directory");
  if (createdStats === undefined) fail("publication stage has no inode");
  return { stagePath, bytes, stats: createdStats };
}

function fsyncDirectory(directory: CheckedDirectory, label: string): void {
  revalidateDirectory(directory, label);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      directory.directory,
      FS_CONSTANTS.O_RDONLY
        | FS_CONSTANTS.O_NOFOLLOW
        | FS_CONSTANTS.O_NONBLOCK,
    );
    const stats = fstatSync(descriptor, { bigint: true });
    if (
      stats.dev !== directory.stats.dev
      || stats.ino !== directory.stats.ino
      || stats.uid !== currentUid()
      || modeBits(stats) !== DIRECTORY_MODE
    ) {
      fail(`${label} changed before sync`);
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function verifyStage(
  store: OpenPublicationStore,
  staged: StagedPublication,
  allowedLinks: readonly bigint[],
): PublicationFile {
  const observed = readPublicationFile(
    staged.stagePath,
    "publication stage",
    store.staging.stats.dev,
    allowedLinks,
  );
  if (
    observed.stats.dev !== staged.stats.dev
    || observed.stats.ino !== staged.stats.ino
    || observed.stats.size !== staged.stats.size
    || observed.bytes !== staged.bytes
  ) {
    fail("publication stage changed");
  }
  return observed;
}

function removeExactStage(
  store: OpenPublicationStore,
  staged: StagedPublication,
  allowedLinks: readonly bigint[],
): void {
  const observed = verifyStage(store, staged, allowedLinks);
  try {
    unlinkSync(staged.stagePath);
  } catch {
    fail("publication stage cannot be removed exactly");
  }
  fsyncDirectory(store.staging, "publication staging directory");
  if (
    observed.stats.nlink === 2n
    && allowedLinks.includes(2n)
  ) {
    const generation = generationPath(
      store,
      observed.publication.generation,
    );
    const retained = readPublicationFile(
      generation,
      "retained publication generation",
      store.generations.stats.dev,
      [1n],
    );
    if (
      retained.bytes !== staged.bytes
      || retained.stats.dev !== staged.stats.dev
      || retained.stats.ino !== staged.stats.ino
    ) {
      fail("publication stage cleanup did not retain the exact generation");
    }
  }
}

function assertAppendCapacity(
  read: PublicationStoreRead,
  candidateBytes: number,
  targetAlreadyExists: boolean,
): void {
  if (
    !Number.isSafeInteger(candidateBytes)
    || candidateBytes < 1
    || candidateBytes
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxCapsuleBytes
  ) {
    fail("publication candidate byte accounting is invalid");
  }
  if (
    !targetAlreadyExists
    && read.publications.length
      >= TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxGenerations
  ) {
    fail("publication store exceeds its generation bound");
  }
  const growth = targetAlreadyExists ? 0 : candidateBytes;
  if (
    read.canonicalByteLength + growth
      > TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxHistoryBytes
  ) {
    fail("publication store exceeds its aggregate history byte bound");
  }
}

function samePublicationRead(
  left: PublicationStoreRead,
  right: PublicationStoreRead,
): boolean {
  return (
    left.canonicalByteLength === right.canonicalByteLength
    && canonicalEqual(left.publications, right.publications)
  );
}

function authenticatedHeadStatus(
  publications: readonly TaskMapLifecycleFacetsPublicationV1[],
  p10: TaskMapIdentityDedupeStoreSnapshotV1,
): TaskMapLifecycleFacetsPublicationStoreSnapshotV1["headStatus"] {
  const latest = publications.at(-1);
  if (latest === undefined) return "empty";
  assertHistoricalP10Membership(p10, latest);
  const p10Latest = p10.entries.at(-1);
  return (
    p10Latest !== undefined
    && p10Latest.generation === latest.generation
    && p10Latest.entryKind === "projection"
    && taskMapContractDigest(p10Latest) === latest.p10EntryDigest
  )
    ? "current"
    : "p10_head_advanced_retry";
}

/**
 * Initializes only the additive P11 directory shape. The caller owns and
 * pre-creates `publicationRoot` as a same-owner 0700 directory.
 */
export async function initializeTaskMapLifecycleFacetsPublicationStore(
  publicationRoot: string,
): Promise<void> {
  assertBoundedPath(publicationRoot, "publication root");
  const root = checkedDirectory(publicationRoot, "publication root");
  assertRootNames(root);
  const created: Array<{ path: string; stats: BigIntStats }> = [];
  try {
    for (const name of [GENERATIONS_DIRECTORY, STAGING_DIRECTORY]) {
      const directory = path.join(root.directory, name);
      try {
        mkdirSync(directory, { mode: DIRECTORY_MODE });
        const stats = checkedDirectory(
          directory,
          `publication ${name} directory`,
        ).stats;
        if (stats.dev !== root.stats.dev) {
          fail(`publication ${name} directory crosses devices`);
        }
        created.push({ path: directory, stats });
      } catch (error) {
        if (errnoCode(error) !== "EEXIST") throw error;
        checkedDirectory(directory, `publication ${name} directory`);
      }
      revalidateDirectory(root, "publication root");
    }
    fsyncDirectory(root, "publication root");
    openPublicationStore(publicationRoot);
  } catch (error) {
    for (const receipt of [...created].reverse()) {
      try {
        const observed = lstatSync(receipt.path, { bigint: true });
        if (
          observed.dev === receipt.stats.dev
          && observed.ino === receipt.stats.ino
          && readdirSync(receipt.path).length === 0
        ) {
          rmdirSync(receipt.path);
        }
      } catch {
        // Initialization remains failed closed; never remove an unbound path.
      }
    }
    throw error;
  }
}

/**
 * Authenticated product reader. It verifies every immutable P11 capsule
 * against the corresponding authenticated P10 history member. A lagging P11
 * head remains readable as historical state and reports that a retry is due.
 */
export async function readTaskMapLifecycleFacetsPublicationStore(
  roots: TaskMapLifecycleFacetsPublicationStoreRoots,
): Promise<TaskMapLifecycleFacetsPublicationStoreSnapshotV1> {
  const snapshot = snapshotReadRoots(roots);
  const identities = captureDisjointRoots(snapshot);
  const firstStore = openPublicationStore(snapshot.publicationRoot);
  const first = readPublicationStoreFromOpen(firstStore, false);
  const p10 = await readTaskMapIdentityDedupeProjectionStore({
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
  });
  for (const publication of first.publications) {
    assertHistoricalP10Membership(p10, publication);
  }
  revalidateRootIdentities(identities);
  const second = readPublicationStoreFromOpen(
    openPublicationStore(snapshot.publicationRoot),
    false,
  );
  if (!samePublicationRead(first, second)) {
    fail("publication store changed during authenticated read");
  }
  return deepFreeze({
    publications: second.publications,
    canonicalByteLength: second.canonicalByteLength,
    remainingByteCapacity:
      TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxHistoryBytes
        - second.canonicalByteLength,
    headStatus: authenticatedHeadStatus(second.publications, p10),
  });
}

/**
 * Builds and publishes one immutable P11 capsule. The final authenticated P10
 * reread is the final await before the synchronous no-replace hardlink CAS.
 * A P10 advance after the committed CAS is returned honestly; the generation
 * remains an authenticated immutable historical publication.
 */
export async function buildAndPublishTaskMapLifecycleFacets(
  input: BuildAndPublishTaskMapLifecycleFacetsInput,
  options: TaskMapLifecycleFacetsPublicationWriteOptions = {},
): Promise<BuiltAndPublishedTaskMapLifecycleFacets> {
  const snapshot = snapshotPublishInput(input);
  const roots: TaskMapLifecycleFacetsPublicationStoreRoots = {
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
    publicationRoot: snapshot.publicationRoot,
  };
  const identities = captureDisjointRoots(roots);
  const lifecycle = await buildTaskMapLifecycleFacets({
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
    projection: snapshot.projection,
  });
  await options.faultInjection?.("after_lifecycle_build");
  const initialP10 = await readTaskMapIdentityDedupeProjectionStore({
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
  });
  const p10Entry = latestProjectionEntry(initialP10, "initial P10 read");
  if (
    !entryMatchesLifecyclePredecessor(
      p10Entry,
      lifecycle.artifact.predecessor,
    )
  ) {
    fail("P10 head advanced after lifecycle construction");
  }
  revalidateRootIdentities(identities);
  const store = openPublicationStore(snapshot.publicationRoot);
  const priorRead = readPublicationStoreFromOpen(store, true);
  const prior = priorRead.publications.at(-1);
  const targetGeneration = lifecycle.artifact.predecessor.generation;
  const existingIndex = priorRead.publications.findIndex(
    (publication) => publication.generation === targetGeneration,
  );
  const capsulePredecessor = existingIndex >= 0
    ? priorRead.publications[existingIndex - 1]
    : prior;
  const built = buildCapsule(
    snapshot.projection,
    lifecycle,
    p10Entry,
    capsulePredecessor === undefined
      ? null
      : publicationPredecessor(capsulePredecessor),
  );
  const targetBytes = built.capsuleCanonicalBytes;
  const existingBytes = priorRead.bytesByGeneration.get(
    built.capsule.generation,
  );
  assertAppendCapacity(
    priorRead,
    Buffer.byteLength(targetBytes, "utf8"),
    existingBytes !== undefined,
  );
  if (existingBytes !== undefined) {
    if (existingBytes !== targetBytes) {
      fail("publication generation already exists with different contents");
    }
    await options.faultInjection?.("before_retry_p10_read");
    const retryP10 = await readTaskMapIdentityDedupeProjectionStore({
      currentRoot: snapshot.currentRoot,
      runRoot: snapshot.runRoot,
      sidecarRoot: snapshot.sidecarRoot,
    });
    assertCurrentP10Head(retryP10, built.capsule, "retry P10 head");
    revalidateRootIdentities(identities);
    const retryRead = readPublicationStoreFromOpen(
      openPublicationStore(snapshot.publicationRoot),
      true,
    );
    if (
      retryRead.bytesByGeneration.get(built.capsule.generation)
        !== targetBytes
    ) {
      fail("publication generation changed before exact retry return");
    }
    return {
      ...lifecycle,
      projectionCanonicalBytes: built.projectionCanonicalBytes,
      capsule: built.capsule,
      capsuleCanonicalBytes: targetBytes,
      publication: {
        status: "already_published",
        committed: true,
        publication: built.capsule,
        processCrashAtomic: true,
        powerLossDurabilityClaimed: false,
      },
    };
  }
  if (
    prior !== undefined
    && BigInt(prior.generation) >= BigInt(built.capsule.generation)
  ) {
    fail("publication target is not after the current P11 head");
  }

  const staged = createStage(store, built.capsule);
  let linked = false;
  let stageRemoved = false;
  try {
    await options.faultInjection?.("after_stage_sync");
    revalidateOpenStore(store);
    verifyStage(store, staged, [1n]);
    await options.faultInjection?.("before_final_p10_read");

    // This authenticated P10 read is intentionally the final await before CAS.
    const finalP10 = await readTaskMapIdentityDedupeProjectionStore({
      currentRoot: snapshot.currentRoot,
      runRoot: snapshot.runRoot,
      sidecarRoot: snapshot.sidecarRoot,
    });
    assertCurrentP10Head(finalP10, built.capsule, "final pre-CAS P10 head");
    revalidateRootIdentities(identities);
    revalidateOpenStore(store);
    verifyStage(store, staged, [1n]);
    const targetPath = generationPath(store, built.capsule.generation);
    try {
      linkSync(staged.stagePath, targetPath);
      linked = true;
    } catch (error) {
      if (errnoCode(error) !== "EEXIST") {
        fail("publication generation no-replace CAS failed");
      }
      const existing = readPublicationFile(
        targetPath,
        `publication generation ${built.capsule.generation}`,
        store.generations.stats.dev,
        [1n, 2n],
      );
      removeExactStage(store, staged, [1n]);
      stageRemoved = true;
      if (existing.bytes !== targetBytes) {
        fail("publication generation no-replace CAS conflict");
      }
      return {
        ...lifecycle,
        projectionCanonicalBytes: built.projectionCanonicalBytes,
        capsule: existing.publication,
        capsuleCanonicalBytes: existing.bytes,
        publication: {
          status: "already_published",
          committed: true,
          publication: existing.publication,
          processCrashAtomic: true,
          powerLossDurabilityClaimed: false,
        },
      };
    }
    const stagePeer = verifyStage(store, staged, [2n]);
    const generationPeer = readPublicationFile(
      targetPath,
      `publication generation ${built.capsule.generation}`,
      store.generations.stats.dev,
      [2n],
    );
    if (
      stagePeer.bytes !== targetBytes
      || generationPeer.bytes !== targetBytes
      || stagePeer.stats.dev !== generationPeer.stats.dev
      || stagePeer.stats.ino !== generationPeer.stats.ino
      || stagePeer.stats.nlink !== 2n
      || generationPeer.stats.nlink !== 2n
    ) {
      fail("publication generation is not the exact staged hardlink peer");
    }
    fsyncDirectory(store.generations, "publication generations directory");
    await options.faultInjection?.("after_generation_link");
    await options.faultInjection?.("before_stage_cleanup");
    removeExactStage(store, staged, [2n]);
    stageRemoved = true;
  } catch (error) {
    if (!linked && !stageRemoved) {
      removeExactStage(store, staged, [1n]);
      stageRemoved = true;
    }
    throw error;
  }

  await options.faultInjection?.("before_post_commit_p10_read");
  const postCommitP10 = await readTaskMapIdentityDedupeProjectionStore({
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
  });
  assertHistoricalP10Membership(postCommitP10, built.capsule);
  const postCommitHead = postCommitP10.entries.at(-1);
  const postCommitCurrent = (
    postCommitHead !== undefined
    && postCommitHead.entryKind === "projection"
    && postCommitHead.generation === built.capsule.generation
    && taskMapContractDigest(postCommitHead)
      === built.capsule.p10EntryDigest
  );
  revalidateRootIdentities(identities);
  const committed = readPublicationStoreFromOpen(
    openPublicationStore(snapshot.publicationRoot),
    false,
  );
  if (
    committed.bytesByGeneration.get(built.capsule.generation) !== targetBytes
  ) {
    fail("committed publication changed before return");
  }
  const status: TaskMapLifecycleFacetsPublicationStatus =
    postCommitCurrent ? "published" : "committed_head_advanced_retry";
  return {
    ...lifecycle,
    projectionCanonicalBytes: built.projectionCanonicalBytes,
    capsule: built.capsule,
    capsuleCanonicalBytes: targetBytes,
    publication: {
      status,
      committed: true,
      publication: built.capsule,
      processCrashAtomic: true,
      powerLossDurabilityClaimed: false,
    },
  };
}

/**
 * Removes only bound P11 staging residue under asserted external exclusivity.
 * A linked stage is removed only after its immutable generation peer is proven
 * byte- and inode-identical. An unlinked complete stage is discarded without
 * publishing it; recovery never invents authority or performs a CAS.
 */
export async function recoverTaskMapLifecycleFacetsPublicationStore(
  publicationRoot: string,
  options: TaskMapLifecycleFacetsPublicationRecoveryOptions,
): Promise<TaskMapLifecycleFacetsPublicationRecoveryReceiptV1> {
  assertBoundedPath(publicationRoot, "publication root");
  if (
    options === null
    || typeof options !== "object"
    || options.externalExclusivityAsserted !== true
    || Object.keys(options).length !== 1
  ) {
    fail("publication recovery requires explicit external exclusivity");
  }
  const store = openPublicationStore(publicationRoot);
  const stageNames = listDirectory(
    store.staging,
    "publication staging directory",
    TASKMAP_LIFECYCLE_FACETS_PUBLICATION_LIMITS_V1.maxStagingEntries,
  );
  let removedStageCount = 0;
  for (const name of stageNames) {
    if (!STAGE_FILE.test(name)) {
      fail("publication staging directory contains an unknown entry");
    }
    const stagePath = path.join(store.staging.directory, name);
    const observed = readPublicationFile(
      stagePath,
      `publication recovery stage ${name}`,
      store.staging.stats.dev,
      [1n, 2n],
    );
    const staged: StagedPublication = {
      stagePath,
      bytes: observed.bytes,
      stats: observed.stats,
    };
    if (observed.stats.nlink === 2n) {
      const committed = readPublicationFile(
        generationPath(store, observed.publication.generation),
        `publication recovery generation ${observed.publication.generation}`,
        store.generations.stats.dev,
        [2n],
      );
      if (
        committed.bytes !== observed.bytes
        || committed.stats.dev !== observed.stats.dev
        || committed.stats.ino !== observed.stats.ino
      ) {
        fail("publication recovery stage has no exact generation peer");
      }
      removeExactStage(store, staged, [2n]);
    } else {
      const targetPath = generationPath(
        store,
        observed.publication.generation,
      );
      try {
        const committed = readPublicationFile(
          targetPath,
          `publication recovery generation ${observed.publication.generation}`,
          store.generations.stats.dev,
          [1n],
        );
        if (committed.bytes !== observed.bytes) {
          fail("publication recovery stage conflicts with its generation");
        }
      } catch (error) {
        if (
          error instanceof Error
          && error.message.startsWith("P11 lifecycle-facets publication:")
          && !error.message.endsWith("cannot be inspected")
        ) {
          throw error;
        }
      }
      removeExactStage(store, staged, [1n]);
    }
    removedStageCount += 1;
  }
  const recovered = readPublicationStoreFromOpen(
    openPublicationStore(publicationRoot),
    false,
  );
  return {
    removedStageCount,
    retainedPublicationCount: recovered.publications.length,
  };
}
