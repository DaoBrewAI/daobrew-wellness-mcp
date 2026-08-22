import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  buildTaskMapProjection,
  taskMapInputDigest,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInputDigest,
} from "./harness.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type RootCausalGateInput,
  type SemanticBrainOutput,
  type TaskMapInput,
  type TaskMapProjectionV1,
} from "./types.js";

export const TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION =
  "taskmap-native-predecessor-evidence.v1" as const;

export const TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1 = Object.freeze({
  maxEvidenceFileBytes: 32 * 1024 * 1024,
  maxProjectionFileBytes: 2 * 1024 * 1024,
  maxCurrentnessFileBytes: 2 * 1024 * 1024,
  maxInputBytes: 16 * 1024 * 1024,
  maxBrainBytes: 16 * 1024 * 1024,
  maxPreviousProjectionBytes: 2 * 1024 * 1024,
  maxPointers: 8_192,
  maxEvents: 32_768,
  maxBrainRoots: 2_048,
  maxBrainTasks: 4_096,
  maxBrainEdges: 8_192,
  maxCausalInputs: 2_048,
  maxArrayLength: 32_768,
  maxObjectKeys: 64,
  maxDepth: 32,
  maxStringCharacters: 65_536,
} as const);

const EVIDENCE_FILENAME = "taskmap-predecessor-evidence.v1.json";
const PROJECTION_FILENAME = "taskmap-projection.v1.json";
const CURRENTNESS_FILENAME = "taskmap-currentness.v1.json";
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL_CHARACTER =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const ARTIFACT_DIGEST_DOMAIN =
  "taskmap-native-predecessor-evidence-artifact.1";

type JsonObject = Record<string, unknown>;

export interface TaskMapNativePredecessorCurrentnessV1 {
  contractVersion: "taskmap-native-currentness-gate.v1";
  runId: string;
  inputDigest: string;
  projectionDigest: string;
  taskDispositions: Array<{
    taskId: string;
    disposition: "current" | "needs_lifecycle_review";
  }>;
}

export interface TaskMapNativePredecessorReplayV1 {
  previousProjection: TaskMapProjectionV1 | null;
  causalInputs: RootCausalGateInput[];
}

export interface TaskMapNativePredecessorBindingV1 {
  runId: string;
  inputDigest: string;
  semanticInputDigest: string;
  brainOutputDigest: string;
  replayDigest: string;
  projectionDigest: string;
  projectionFileDigest: string;
  currentnessFileDigest: string;
}

export interface TaskMapNativePredecessorEvidenceV1 {
  contractVersion: typeof TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION;
  binding: TaskMapNativePredecessorBindingV1;
  replay: TaskMapNativePredecessorReplayV1;
  taskMapInput: TaskMapInput;
  semanticBrainOutput: SemanticBrainOutput;
  artifactDigest: string;
}

export interface TaskMapNativePredecessorEvidenceContextV1 {
  projection: TaskMapProjectionV1;
  currentness: TaskMapNativePredecessorCurrentnessV1;
  projectionFileBytes: Buffer;
  currentnessFileBytes: Buffer;
}

export interface BuildTaskMapNativePredecessorEvidenceInputV1
  extends TaskMapNativePredecessorEvidenceContextV1 {
  replay: TaskMapNativePredecessorReplayV1;
  taskMapInput: TaskMapInput;
  semanticBrainOutput: SemanticBrainOutput;
}

export interface TaskMapNativePredecessorEvidenceVerificationV1 {
  binding: TaskMapNativePredecessorBindingV1;
  taskMapInput: TaskMapInput;
  semanticBrainOutput: SemanticBrainOutput;
}

export interface TaskMapNativePredecessorEvidenceLocationV1 {
  homeDirectory: string;
}

export interface WriteTaskMapNativePredecessorEvidenceInputV1
  extends TaskMapNativePredecessorEvidenceLocationV1 {
  evidence: TaskMapNativePredecessorEvidenceV1;
}

function fail(message: string): never {
  throw new Error(`Task Map native predecessor evidence: ${message}`);
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

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is JsonObject {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    fail(`${label} must be a plain object`);
  }
}

function assertKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  if (
    actual.some((key) => !allowed.has(key))
    || required.some((key) => !Object.prototype.hasOwnProperty.call(
      value,
      key,
    ))
  ) {
    fail(`${label} has unsupported or missing fields`);
  }
}

function assertExactKeys(
  value: JsonObject,
  keys: readonly string[],
  label: string,
): void {
  assertKeys(value, keys, [], label);
  if (Object.keys(value).length !== keys.length) {
    fail(`${label} has unsupported or missing fields`);
  }
}

function assertDigest(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a lowercase sha256 digest`);
  }
}

function assertBoundedString(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxStringCharacters
    || CONTROL_CHARACTER.test(value)
  ) {
    fail(`${label} must be a bounded non-empty string`);
  }
}

function assertJsonTree(
  value: unknown,
  label: string,
  depth = 0,
  seen = new WeakSet<object>(),
): void {
  if (
    depth > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxDepth
  ) {
    fail(`${label} exceeds the maximum JSON depth`);
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number`);
    return;
  }
  if (typeof value === "string") {
    if (
      value.length
        > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxStringCharacters
      || CONTROL_CHARACTER.test(value)
    ) {
      fail(`${label} contains an invalid string`);
    }
    return;
  }
  if (typeof value !== "object") {
    fail(`${label} must contain JSON values only`);
  }
  if (seen.has(value)) fail(`${label} must be an acyclic JSON tree`);
  seen.add(value);
  if (Array.isArray(value)) {
    if (
      value.length
        > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxArrayLength
    ) {
      fail(`${label} contains an oversized array`);
    }
    for (const [index, item] of value.entries()) {
      assertJsonTree(item, `${label}[${index}]`, depth + 1, seen);
    }
    return;
  }
  assertPlainObject(value, label);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxObjectKeys
    || ownKeys.some((key) => typeof key !== "string")
  ) {
    fail(`${label} contains invalid object keys`);
  }
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || descriptor.get !== undefined
      || descriptor.set !== undefined
      || !descriptor.enumerable
      || descriptor.value === undefined
    ) {
      fail(`${label}.${key} is not a JSON data property`);
    }
    assertJsonTree(
      descriptor.value,
      `${label}.${key}`,
      depth + 1,
      seen,
    );
  }
}

function assertCanonicalSize(
  value: unknown,
  maximumBytes: number,
  label: string,
): void {
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(value), "utf8")
      > maximumBytes
  ) {
    fail(`${label} exceeds its byte limit`);
  }
}

function assertTaskMapInputShape(
  value: unknown,
): asserts value is TaskMapInput {
  assertJsonTree(value, "taskMapInput");
  assertPlainObject(value, "taskMapInput");
  assertExactKeys(
    value,
    ["contractVersion", "generatedAt", "pointers", "events"],
    "taskMapInput",
  );
  if (value.contractVersion !== TASKMAP_CONTRACT_VERSION) {
    fail("taskMapInput contractVersion is unsupported");
  }
  assertBoundedString(value.generatedAt, "taskMapInput.generatedAt");
  if (
    !Array.isArray(value.pointers)
    || value.pointers.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxPointers
    || !Array.isArray(value.events)
    || value.events.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxEvents
  ) {
    fail("taskMapInput collections exceed their bounds");
  }
  for (const [index, pointer] of value.pointers.entries()) {
    assertPlainObject(pointer, `taskMapInput.pointers[${index}]`);
    assertKeys(
      pointer,
      [
        "id",
        "sourceKind",
        "sourceObjectId",
        "sourceRefHash",
        "authority",
        "syncMode",
        "capabilities",
      ],
      ["canonicalUrl", "sourceVersion"],
      `taskMapInput.pointers[${index}]`,
    );
  }
  for (const [index, event] of value.events.entries()) {
    assertPlainObject(event, `taskMapInput.events[${index}]`);
    assertKeys(
      event,
      [
        "id",
        "pointerId",
        "recordKind",
        "activity",
        "occurredAt",
        "observedAt",
        "objectRefs",
        "title",
        "summary",
        "extractionConfidence",
      ],
      [
        "dayKey",
        "sourceStatus",
        "priority",
        "deadlineAt",
        "supersedesEventId",
        "retractsEventId",
        "bodyCategory",
        "bodyAxis",
        "bodyJoinEligible",
        "corpusCoverage",
      ],
      `taskMapInput.events[${index}]`,
    );
  }
  assertCanonicalSize(
    value,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxInputBytes,
    "taskMapInput",
  );
}

function assertSemanticBrainShape(
  value: unknown,
): asserts value is SemanticBrainOutput {
  assertJsonTree(value, "semanticBrainOutput");
  assertPlainObject(value, "semanticBrainOutput");
  assertExactKeys(
    value,
    [
      "contractVersion",
      "provider",
      "model",
      "promptHash",
      "inputDigest",
      "generatedAt",
      "roots",
      "tasks",
      "edges",
    ],
    "semanticBrainOutput",
  );
  if (value.contractVersion !== TASKMAP_CONTRACT_VERSION) {
    fail("semanticBrainOutput contractVersion is unsupported");
  }
  if (
    !Array.isArray(value.roots)
    || value.roots.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainRoots
    || !Array.isArray(value.tasks)
    || value.tasks.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainTasks
    || !Array.isArray(value.edges)
    || value.edges.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainEdges
  ) {
    fail("semanticBrainOutput collections exceed their bounds");
  }
  for (const [index, root] of value.roots.entries()) {
    assertPlainObject(root, `semanticBrainOutput.roots[${index}]`);
    assertExactKeys(
      root,
      [
        "proposalId",
        "title",
        "summary",
        "evidenceEventIds",
        "memberObjectRefs",
        "confidence",
      ],
      `semanticBrainOutput.roots[${index}]`,
    );
  }
  for (const [index, task] of value.tasks.entries()) {
    assertPlainObject(task, `semanticBrainOutput.tasks[${index}]`);
    assertKeys(
      task,
      [
        "proposalId",
        "rootProposalId",
        "title",
        "summary",
        "evidenceEventIds",
        "openState",
        "confidence",
      ],
      ["authoritativeTaskEventId", "proposedReturnPointerId"],
      `semanticBrainOutput.tasks[${index}]`,
    );
  }
  for (const [index, edge] of value.edges.entries()) {
    assertPlainObject(edge, `semanticBrainOutput.edges[${index}]`);
    assertExactKeys(
      edge,
      [
        "proposalId",
        "fromProposalId",
        "toProposalId",
        "relation",
        "evidenceEventIds",
        "confidence",
      ],
      `semanticBrainOutput.edges[${index}]`,
    );
  }
  assertCanonicalSize(
    value,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainBytes,
    "semanticBrainOutput",
  );
}

function assertCausalInputShape(
  value: unknown,
  index: number,
): asserts value is RootCausalGateInput {
  const label = `replay.causalInputs[${index}]`;
  assertPlainObject(value, label);
  assertExactKeys(
    value,
    ["rootProposalId", "bodyAxis", "bodyCategory", "enrichment"],
    label,
  );
  assertBoundedString(value.rootProposalId, `${label}.rootProposalId`);
  assertPlainObject(value.enrichment, `${label}.enrichment`);
  assertExactKeys(
    value.enrichment,
    [
      "theme",
      "targetHits",
      "targetN",
      "referenceRate",
      "referenceN",
      "citedDays",
      "rtmSuspected",
    ],
    `${label}.enrichment`,
  );
  if (!Array.isArray(value.enrichment.citedDays)) {
    fail(`${label}.enrichment.citedDays must be an array`);
  }
  for (
    const [dayIndex, day] of value.enrichment.citedDays.entries()
  ) {
    assertPlainObject(
      day,
      `${label}.enrichment.citedDays[${dayIndex}]`,
    );
    assertExactKeys(
      day,
      ["date", "backed", "sources"],
      `${label}.enrichment.citedDays[${dayIndex}]`,
    );
  }
}

function assertAcceptedProjection(
  projection: TaskMapProjectionV1,
  label: string,
  maximumBytes: number,
): void {
  const durableProjection = jsonRoundTrip(projection, label);
  assertJsonTree(durableProjection, label);
  assertPlainObject(durableProjection, label);
  assertExactKeys(
    durableProjection,
    [
      "contractVersion",
      "algorithmPolicyVersion",
      "algorithmPolicyDigest",
      "runStatus",
      "arm",
      "runId",
      "generatedAt",
      "inputDigest",
      "brain",
      "sources",
      "roots",
      "tasks",
      "edges",
      "rejections",
      "privacy",
    ],
    label,
  );
  if (
    !Array.isArray(durableProjection.sources)
    || !Array.isArray(durableProjection.roots)
    || !Array.isArray(durableProjection.tasks)
    || !Array.isArray(durableProjection.edges)
    || !Array.isArray(durableProjection.rejections)
  ) {
    fail(`${label} collections must be arrays`);
  }
  assertCanonicalSize(durableProjection, maximumBytes, label);
  const accepted = durableProjection as unknown as TaskMapProjectionV1;
  const reasons = taskMapProjectionArtifactValidationReasons(accepted);
  if (
    reasons.length > 0
    || accepted.runStatus !== "accepted"
    || accepted.rejections.length !== 0
  ) {
    fail(`${label} is not one accepted harness artifact`);
  }
}

function assertReplay(
  value: unknown,
  projection: TaskMapProjectionV1,
  brain: SemanticBrainOutput,
): asserts value is TaskMapNativePredecessorReplayV1 {
  assertJsonTree(value, "replay");
  assertPlainObject(value, "replay");
  assertExactKeys(
    value,
    ["previousProjection", "causalInputs"],
    "replay",
  );
  if (value.previousProjection !== null) {
    assertAcceptedProjection(
      value.previousProjection as TaskMapProjectionV1,
      "replay.previousProjection",
      TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxPreviousProjectionBytes,
    );
    if (
      Date.parse((value.previousProjection as TaskMapProjectionV1).generatedAt)
        > Date.parse(projection.generatedAt)
    ) {
      fail("replay.previousProjection is newer than the accepted projection");
    }
  }
  if (
    !Array.isArray(value.causalInputs)
    || value.causalInputs.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxCausalInputs
  ) {
    fail("replay.causalInputs exceed their bound");
  }
  const brainRootIds = new Set(brain.roots.map((root) => root.proposalId));
  const seenRootIds = new Set<string>();
  for (const [index, causalInput] of value.causalInputs.entries()) {
    assertCausalInputShape(causalInput, index);
    if (
      !brainRootIds.has(causalInput.rootProposalId)
      || seenRootIds.has(causalInput.rootProposalId)
    ) {
      fail("replay.causalInputs must name unique semantic brain roots");
    }
    seenRootIds.add(causalInput.rootProposalId);
  }
}

function canonicalProjectionDigest(
  projection: TaskMapProjectionV1,
): string {
  try {
    return diffTaskMapProjections(
      null,
      projection,
    ).currentProjectionDigest;
  } catch {
    fail("projection cannot produce its canonical digest");
  }
}

function assertCurrentness(
  value: unknown,
  projection: TaskMapProjectionV1,
): asserts value is TaskMapNativePredecessorCurrentnessV1 {
  assertJsonTree(value, "currentness");
  assertPlainObject(value, "currentness");
  assertExactKeys(
    value,
    [
      "contractVersion",
      "runId",
      "inputDigest",
      "projectionDigest",
      "taskDispositions",
    ],
    "currentness",
  );
  if (
    value.contractVersion !== "taskmap-native-currentness-gate.v1"
    || value.runId !== projection.runId
    || value.inputDigest !== projection.inputDigest
    || value.projectionDigest !== canonicalProjectionDigest(projection)
    || !Array.isArray(value.taskDispositions)
    || value.taskDispositions.length !== projection.tasks.length
    || value.taskDispositions.length
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxBrainTasks
  ) {
    fail("currentness is not bound to the accepted projection");
  }
  const projectionTaskIds = projection.tasks.map((task) => task.id).sort();
  const dispositionTaskIds: string[] = [];
  for (const [index, row] of value.taskDispositions.entries()) {
    assertPlainObject(row, `currentness.taskDispositions[${index}]`);
    assertExactKeys(
      row,
      ["taskId", "disposition"],
      `currentness.taskDispositions[${index}]`,
    );
    assertBoundedString(
      row.taskId,
      `currentness.taskDispositions[${index}].taskId`,
    );
    if (
      row.disposition !== "current"
      && row.disposition !== "needs_lifecycle_review"
    ) {
      fail("currentness contains an unsupported disposition");
    }
    dispositionTaskIds.push(row.taskId);
  }
  dispositionTaskIds.sort();
  if (
    new Set(dispositionTaskIds).size !== dispositionTaskIds.length
    || dispositionTaskIds.some(
      (taskId, index) => taskId !== projectionTaskIds[index],
    )
  ) {
    fail("currentness must classify every projected task exactly once");
  }
}

function parseRawFile(
  bytes: Buffer,
  expected: unknown,
  maximumBytes: number,
  label: string,
): void {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.length < 2
    || bytes.length > maximumBytes
  ) {
    fail(`${label} bytes exceed their bound`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label} bytes are not valid JSON`);
  }
  if (
    taskMapContractCanonicalJson(parsed)
      !== taskMapContractCanonicalJson(expected)
  ) {
    fail(`${label} bytes do not encode the supplied artifact`);
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return taskMapContractCanonicalJson(left)
    === taskMapContractCanonicalJson(right);
}

function verifySourcePair(
  input: BuildTaskMapNativePredecessorEvidenceInputV1,
): TaskMapNativePredecessorBindingV1 {
  assertTaskMapInputShape(input.taskMapInput);
  assertSemanticBrainShape(input.semanticBrainOutput);
  assertAcceptedProjection(
    input.projection,
    "projection",
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
      .maxProjectionFileBytes,
  );
  if (
    input.projection.arm !== "E4"
    || input.projection.brain === null
  ) {
    fail("projection must be a semantic E4 artifact");
  }
  assertReplay(
    input.replay,
    input.projection,
    input.semanticBrainOutput,
  );
  assertCurrentness(input.currentness, input.projection);
  parseRawFile(
    input.projectionFileBytes,
    input.projection,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
      .maxProjectionFileBytes,
    "projection file",
  );
  parseRawFile(
    input.currentnessFileBytes,
    input.currentness,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
      .maxCurrentnessFileBytes,
    "currentness file",
  );

  const inputDigest = taskMapInputDigest(input.taskMapInput);
  const semanticInputDigest = taskMapSemanticInputDigest(
    input.taskMapInput,
  );
  const brainOutputDigest = taskMapContractDigest(
    input.semanticBrainOutput,
  );
  if (
    input.projection.inputDigest !== inputDigest
    || input.semanticBrainOutput.inputDigest !== semanticInputDigest
  ) {
    fail("taskMapInput is not bound to the projection and semantic brain");
  }
  const projectionBrain = input.projection.brain;
  if (
    projectionBrain.provider !== input.semanticBrainOutput.provider
    || projectionBrain.model !== input.semanticBrainOutput.model
    || projectionBrain.promptHash !== input.semanticBrainOutput.promptHash
    || projectionBrain.outputDigest !== brainOutputDigest
  ) {
    fail("semanticBrainOutput is not bound to the projection");
  }

  let rebuilt: TaskMapProjectionV1;
  try {
    rebuilt = buildTaskMapProjection(
      input.taskMapInput,
      input.semanticBrainOutput,
      {
        arm: "E4",
        now: input.projection.generatedAt,
        ...(input.replay.previousProjection === null
          ? {}
          : { previousProjection: input.replay.previousProjection }),
        causalInputs: input.replay.causalInputs,
      },
    );
  } catch {
    fail("harness replay failed");
  }
  if (!sameCanonical(rebuilt, input.projection)) {
    fail("projection is not canonically equal to its harness replay");
  }

  return {
    runId: input.projection.runId,
    inputDigest,
    semanticInputDigest,
    brainOutputDigest,
    replayDigest: taskMapContractDigest(input.replay),
    projectionDigest: canonicalProjectionDigest(input.projection),
    projectionFileDigest: sha256(input.projectionFileBytes),
    currentnessFileDigest: sha256(input.currentnessFileBytes),
  };
}

function artifactDigest(
  value: Omit<TaskMapNativePredecessorEvidenceV1, "artifactDigest">,
): string {
  return taskMapContractDigest({
    domain: ARTIFACT_DIGEST_DOMAIN,
    ...value,
  });
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null
    && typeof value === "object"
    && !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function cloneFrozen<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function jsonRoundTrip<T>(value: T, label: string): T {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) fail(`${label} must be JSON serializable`);
    return JSON.parse(serialized) as T;
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("Task Map native predecessor evidence:")
    ) {
      throw error;
    }
    fail(`${label} must be JSON serializable`);
  }
}

function assertBuildInput(
  input: unknown,
): asserts input is BuildTaskMapNativePredecessorEvidenceInputV1 {
  assertPlainObject(input, "build input");
  assertExactKeys(
    input,
    [
      "taskMapInput",
      "semanticBrainOutput",
      "replay",
      "projection",
      "currentness",
      "projectionFileBytes",
      "currentnessFileBytes",
    ],
    "build input",
  );
}

export function buildTaskMapNativePredecessorEvidence(
  input: BuildTaskMapNativePredecessorEvidenceInputV1,
): TaskMapNativePredecessorEvidenceV1 {
  assertBuildInput(input);
  // Harness projections may carry optional own-properties with `undefined`.
  // The durable replay is the exact JSON value that can be read back later.
  const replay = jsonRoundTrip(input.replay, "replay");
  const binding = verifySourcePair({ ...input, replay });
  const core = {
    contractVersion: TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION,
    binding,
    replay,
    taskMapInput: structuredClone(input.taskMapInput),
    semanticBrainOutput: structuredClone(input.semanticBrainOutput),
  };
  return cloneFrozen({
    ...core,
    artifactDigest: artifactDigest(core),
  });
}

function assertContext(
  context: unknown,
): asserts context is TaskMapNativePredecessorEvidenceContextV1 {
  assertPlainObject(context, "verification context");
  assertExactKeys(
    context,
    [
      "projection",
      "currentness",
      "projectionFileBytes",
      "currentnessFileBytes",
    ],
    "verification context",
  );
}

function assertBindingShape(
  value: unknown,
): asserts value is TaskMapNativePredecessorBindingV1 {
  assertPlainObject(value, "binding");
  assertExactKeys(
    value,
    [
      "runId",
      "inputDigest",
      "semanticInputDigest",
      "brainOutputDigest",
      "replayDigest",
      "projectionDigest",
      "projectionFileDigest",
      "currentnessFileDigest",
    ],
    "binding",
  );
  assertBoundedString(value.runId, "binding.runId");
  for (const key of [
    "inputDigest",
    "semanticInputDigest",
    "brainOutputDigest",
    "replayDigest",
    "projectionDigest",
    "projectionFileDigest",
    "currentnessFileDigest",
  ] as const) {
    assertDigest(value[key], `binding.${key}`);
  }
}

export function assertTaskMapNativePredecessorEvidence(
  value: unknown,
  context: TaskMapNativePredecessorEvidenceContextV1,
): TaskMapNativePredecessorEvidenceVerificationV1 {
  assertContext(context);
  assertJsonTree(value, "evidence");
  assertPlainObject(value, "evidence");
  assertExactKeys(
    value,
    [
      "contractVersion",
      "binding",
      "replay",
      "taskMapInput",
      "semanticBrainOutput",
      "artifactDigest",
    ],
    "evidence",
  );
  if (
    value.contractVersion
      !== TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION
  ) {
    fail("evidence contractVersion is unsupported");
  }
  assertBindingShape(value.binding);
  assertDigest(value.artifactDigest, "artifactDigest");
  assertTaskMapInputShape(value.taskMapInput);
  assertSemanticBrainShape(value.semanticBrainOutput);
  assertReplay(
    value.replay,
    context.projection,
    value.semanticBrainOutput,
  );
  const evidence = value as unknown as TaskMapNativePredecessorEvidenceV1;
  const {
    artifactDigest: storedArtifactDigest,
    ...core
  } = evidence;
  if (artifactDigest(core) !== storedArtifactDigest) {
    fail("artifactDigest does not authenticate the evidence");
  }
  const expectedBinding = verifySourcePair({
    taskMapInput: evidence.taskMapInput,
    semanticBrainOutput: evidence.semanticBrainOutput,
    replay: evidence.replay,
    ...context,
  });
  if (!sameCanonical(evidence.binding, expectedBinding)) {
    fail("binding digests do not match the fixed predecessor pair");
  }
  return cloneFrozen({
    binding: expectedBinding,
    taskMapInput: evidence.taskMapInput,
    semanticBrainOutput: evidence.semanticBrainOutput,
  });
}

function assertHomeDirectory(
  value: unknown,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || !path.isAbsolute(value)
    || path.normalize(value) !== value
    || Buffer.byteLength(value, "utf8") > 4_096
    || CONTROL_CHARACTER.test(value)
  ) {
    fail("homeDirectory must be a normalized absolute path");
  }
}

export function taskMapNativePredecessorEvidencePath(
  homeDirectory: string,
): string {
  assertHomeDirectory(homeDirectory);
  return path.join(
    homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap",
    EVIDENCE_FILENAME,
  );
}

function fixedPaths(homeDirectory: string): {
  directory: string;
  evidencePath: string;
  projectionPath: string;
  currentnessPath: string;
} {
  const evidencePath = taskMapNativePredecessorEvidencePath(homeDirectory);
  const directory = path.dirname(evidencePath);
  return {
    directory,
    evidencePath,
    projectionPath: path.join(directory, PROJECTION_FILENAME),
    currentnessPath: path.join(directory, CURRENTNESS_FILENAME),
  };
}

async function assertPrivateDirectory(directory: string): Promise<{
  dev: bigint;
  ino: bigint;
}> {
  const stats = await lstat(directory, { bigint: true });
  const currentUid = typeof process.getuid === "function"
    ? BigInt(process.getuid())
    : stats.uid;
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.uid !== currentUid
    || Number(stats.mode & 0o777n) !== DIRECTORY_MODE
    || await realpath(directory) !== directory
  ) {
    fail("fixed taskmap directory must be an owner-only real 0700 directory");
  }
  return { dev: stats.dev, ino: stats.ino };
}

async function readOwnerOnlyFile(
  filePath: string,
  maximumBytes: number,
  label: string,
): Promise<{ parsed: unknown; bytes: Buffer }> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    const currentUid = typeof process.getuid === "function"
      ? BigInt(process.getuid())
      : before.uid;
    if (
      !before.isFile()
      || before.uid !== currentUid
      || Number(before.mode & 0o777n) !== FILE_MODE
      || before.nlink !== 1n
      || before.size < 2n
      || before.size > BigInt(maximumBytes)
    ) {
      fail(`${label} must be an owner-only 0600 regular file`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs
    ) {
      fail(`${label} changed during read`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail(`${label} is not valid JSON`);
    }
    return { parsed, bytes };
  } catch (error) {
    if (errnoCode(error) === "ELOOP") {
      fail(`${label} must not be a symbolic link`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readFixedContext(homeDirectory: string): Promise<{
  paths: ReturnType<typeof fixedPaths>;
  context: TaskMapNativePredecessorEvidenceContextV1;
}> {
  const paths = fixedPaths(homeDirectory);
  await assertPrivateDirectory(paths.directory);
  const projectionFile = await readOwnerOnlyFile(
    paths.projectionPath,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
      .maxProjectionFileBytes,
    "fixed projection",
  );
  const currentnessFile = await readOwnerOnlyFile(
    paths.currentnessPath,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
      .maxCurrentnessFileBytes,
    "fixed currentness",
  );
  return {
    paths,
    context: {
      projection: projectionFile.parsed as TaskMapProjectionV1,
      currentness:
        currentnessFile.parsed as TaskMapNativePredecessorCurrentnessV1,
      projectionFileBytes: projectionFile.bytes,
      currentnessFileBytes: currentnessFile.bytes,
    },
  };
}

function assertLocationInput(
  input: unknown,
  label: string,
): asserts input is TaskMapNativePredecessorEvidenceLocationV1 {
  assertPlainObject(input, label);
  assertExactKeys(input, ["homeDirectory"], label);
  assertHomeDirectory(input.homeDirectory);
}

export async function loadTaskMapNativePredecessorEvidence(
  input: TaskMapNativePredecessorEvidenceLocationV1,
): Promise<TaskMapNativePredecessorEvidenceVerificationV1> {
  assertLocationInput(input, "load input");
  const { paths, context } = await readFixedContext(input.homeDirectory);
  const evidenceFile = await readOwnerOnlyFile(
    paths.evidencePath,
    TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1.maxEvidenceFileBytes,
    "fixed predecessor evidence",
  );
  if (
    taskMapContractCanonicalJson(evidenceFile.parsed)
      !== evidenceFile.bytes.toString("utf8")
  ) {
    fail("fixed predecessor evidence bytes are not canonical");
  }
  return assertTaskMapNativePredecessorEvidence(
    evidenceFile.parsed,
    context,
  );
}

async function assertExistingEvidenceTarget(
  evidencePath: string,
): Promise<void> {
  try {
    const stats = await lstat(evidencePath, { bigint: true });
    const currentUid = typeof process.getuid === "function"
      ? BigInt(process.getuid())
      : stats.uid;
    if (
      stats.isSymbolicLink()
      || !stats.isFile()
      || stats.uid !== currentUid
      || Number(stats.mode & 0o777n) !== FILE_MODE
      || stats.nlink !== 1n
      || stats.size < 2n
      || stats.size > BigInt(
        TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
          .maxEvidenceFileBytes,
      )
    ) {
      fail("existing predecessor evidence target is unsafe");
    }
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
}

function assertWriteInput(
  input: unknown,
): asserts input is WriteTaskMapNativePredecessorEvidenceInputV1 {
  assertPlainObject(input, "write input");
  assertExactKeys(input, ["homeDirectory", "evidence"], "write input");
  assertHomeDirectory(input.homeDirectory);
}

export async function writeTaskMapNativePredecessorEvidence(
  input: WriteTaskMapNativePredecessorEvidenceInputV1,
): Promise<TaskMapNativePredecessorEvidenceVerificationV1> {
  assertWriteInput(input);
  const { paths, context } = await readFixedContext(input.homeDirectory);
  assertTaskMapNativePredecessorEvidence(input.evidence, context);
  const bytes = taskMapContractCanonicalJson(input.evidence);
  if (
    Buffer.byteLength(bytes, "utf8")
      > TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1
        .maxEvidenceFileBytes
  ) {
    fail("predecessor evidence exceeds its file bound");
  }
  const parentReceipt = await assertPrivateDirectory(paths.directory);
  await assertExistingEvidenceTarget(paths.evidencePath);
  const stagePath = path.join(
    paths.directory,
    `.predecessor-evidence-${randomBytes(16).toString("hex")}.tmp`,
  );
  let stageExists = false;
  let stageHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    stageHandle = await open(
      stagePath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      FILE_MODE,
    );
    stageExists = true;
    await stageHandle.writeFile(bytes, "utf8");
    await stageHandle.sync();
    const stageStats = await stageHandle.stat({ bigint: true });
    if (
      !stageStats.isFile()
      || Number(stageStats.mode & 0o777n) !== FILE_MODE
      || stageStats.nlink !== 1n
      || stageStats.size !== BigInt(Buffer.byteLength(bytes, "utf8"))
    ) {
      fail("staged predecessor evidence is unsafe");
    }
    await stageHandle.close();
    stageHandle = undefined;
    const parentNow = await lstat(paths.directory, { bigint: true });
    if (
      parentNow.dev !== parentReceipt.dev
      || parentNow.ino !== parentReceipt.ino
      || Number(parentNow.mode & 0o777n) !== DIRECTORY_MODE
    ) {
      fail("fixed taskmap directory changed during write");
    }
    await assertExistingEvidenceTarget(paths.evidencePath);
    await rename(stagePath, paths.evidencePath);
    stageExists = false;
    const directoryHandle = await open(paths.directory, fsConstants.O_RDONLY);
    await directoryHandle.sync().finally(() => directoryHandle.close());
  } finally {
    await stageHandle?.close().catch(() => undefined);
    if (stageExists) {
      await unlink(stagePath).catch(() => undefined);
    }
  }
  return loadTaskMapNativePredecessorEvidence({
    homeDirectory: input.homeDirectory,
  });
}
