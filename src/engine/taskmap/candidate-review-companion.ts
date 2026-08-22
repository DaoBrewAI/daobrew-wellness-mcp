import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  buildTaskMapProjection,
  taskMapInputDigest,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInput,
  taskMapSemanticInputDigest,
} from "./harness.js";
import {
  assertTaskMapSourceSnapshot,
  buildTaskMapSemanticProposalReference,
  taskMapContractDigest,
  type TaskMapSemanticBrainArtifactV1,
} from "./source-contracts.js";
import {
  buildTaskMapWorkControlDecision,
  taskMapWorkControlDecisionCanonicalBytes,
  type TaskMapWorkControlDecisionV1,
} from "./work-control-decision.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type BrainEdgeProposal,
  type BrainRootProposal,
  type BrainTaskProposal,
  type SemanticBrainOutput,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapProjectionV1,
  type TaskMapSourceEnvelopeV1,
  type TaskMapSourcePointer,
  type TaskMapSourceSnapshotV1,
} from "./types.js";

export const TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION =
  "taskmap-candidate-evidence-bridge.v1" as const;
export const TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION =
  "taskmap-candidate-review-companion.v1" as const;
export const TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION =
  "taskmap-candidate-review-policy.1" as const;

export const TASKMAP_CANDIDATE_REVIEW_LIMITS_V1 = Object.freeze({
  maxCanonicalInputBytes: 16 * 1024 * 1024,
  maxCanonicalArtifactBytes: 4 * 1024 * 1024,
  maxNodes: 120_000,
  maxDescriptors: 120_000,
  maxDepth: 32,
  maxObjectKeys: 128,
  maxArrayLength: 8_192,
  maxStringLength: 4_096,
  maxBrainRoots: 2_048,
  maxBrainTasks: 4_096,
  maxBrainEdges: 8_192,
  maxEvidence: 8_192,
});

const BRIDGE_ATTESTATION_DOMAIN =
  "taskmap-candidate-evidence-bridge-attestation.1";
const BRIDGE_KEY_ID_DOMAIN =
  "taskmap-candidate-evidence-bridge-key-id.1";
const EVENT_TOKEN_DOMAIN = "taskmap-candidate-event-token.1";
const ENVELOPE_TOKEN_DOMAIN = "taskmap-candidate-envelope-token.1";
const CANDIDATE_ID_DOMAIN = "taskmap-candidate-reference.1";
const CANDIDATE_GROUP_ID_DOMAIN =
  "taskmap-candidate-group-reference.1";
const CANDIDATE_EVIDENCE_ID_DOMAIN =
  "taskmap-candidate-evidence-reference.1";
const CANDIDATE_ARTIFACT_ATTESTATION_DOMAIN =
  "taskmap-candidate-review-artifact-attestation.1";
const CANDIDATE_ARTIFACT_KEY_ID_DOMAIN =
  "taskmap-candidate-review-artifact-key-id.1";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._#:/-]{0,511}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const EVENT_TOKEN = /^tmcandidateevent_[a-f0-9]{64}$/;
const ENVELOPE_TOKEN = /^tmcandidateenvelope_[a-f0-9]{64}$/;
const BRIDGE_ID = /^tmcandidatebridge_[a-f0-9]{64}$/;
const ARTIFACT_ID = /^tmcandidatereview_[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmcandidate_[a-f0-9]{64}$/;
const CANDIDATE_GROUP_ID = /^tmcandidategroup_[a-f0-9]{64}$/;
const CANDIDATE_EVIDENCE_ID =
  /^tmcandidateevidence_[a-f0-9]{64}$/;

const SOURCE_KINDS = new Set([
  "linear",
  "jira",
  "github",
  "slack",
  "google_chat",
  "gmail",
  "google_calendar",
  "local_calendar",
  "google_tasks",
  "gemini_meet",
  "granola",
  "codex_session",
  "claude_session",
  "cursor_session",
  "oura",
  "strategy",
  "manual",
  "unknown",
]);
const AUTHORITIES = new Set(["source_system", "user", "none"]);
const SYNC_MODES = new Set([
  "native_agent",
  "writeback",
  "return_only",
  "reference_only",
  "personal_fork",
]);
const CAPABILITIES = new Set([
  "read_task",
  "read_context",
  "create_task",
  "update_status",
  "comment_or_reply",
  "create_source_draft",
  "publish_or_send",
  "delegate_native_agent",
  "attach_or_link_artifact",
  "deep_link",
  "webhook_or_incremental_sync",
  "optimistic_version_check",
]);
const RECORD_KINDS = new Set([
  "authoritative_task",
  "work_context",
  "body_context",
  "receipt",
]);
const ACTIVITIES = new Set([
  "task_created",
  "task_updated",
  "task_completed",
  "task_reopened",
  "commitment_stated",
  "decision_deferred",
  "decision_made",
  "artifact_delivered",
  "receipt_observed",
  "context_observed",
  "body_window_observed",
]);
const SOURCE_STATUSES = new Set([
  "open",
  "in_progress",
  "blocked",
  "awaiting_review",
  "completed",
  "cancelled",
  "unknown",
]);
const BODY_CATEGORIES = new Set([
  "below_baseline",
  "within_baseline",
  "above_baseline",
  "unknown",
]);
const BODY_AXES = new Set([
  "hrv",
  "resting_heart_rate",
  "sleep",
  "readiness",
  "activity",
  "composite_recovery",
  "unknown",
]);
const OPEN_STATES = new Set([
  "open",
  "possibly_open",
  "blocked",
  "awaiting_review",
  "completed",
  "superseded",
  "unknown",
]);
const RELATIONS = new Set([
  "advances",
  "depends_on",
  "blocks",
  "informed_by",
  "related_to",
  "supersedes",
]);
const CANDIDATE_REASON_CODES = Object.freeze([
  "attested_candidate_only",
  "owner_review_required",
] as const);

const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const STRUCTURED_CLONE = structuredClone;
const JSON_STRINGIFY = JSON.stringify;
const ARRAY_IS_ARRAY = Array.isArray;
const HAS_OWN = Object.prototype.hasOwnProperty;
const OBJECT_KEYS = Object.keys;
const OBJECT_VALUES = Object.values;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_IS_FROZEN = Object.isFrozen;
const BUFFER_BYTE_LENGTH = Buffer.byteLength;
const BUFFER_FROM = Buffer.from;
const SET_CONSTRUCTOR = Set;
const MAP_CONSTRUCTOR = Map;
const WEAK_SET_CONSTRUCTOR = WeakSet;
const IS_PROXY = nodeUtilTypes.isProxy;
const CREATE_HASH = createHash;
const CREATE_HMAC = createHmac;
const TIMING_SAFE_EQUAL = timingSafeEqual;
const BUILD_TASKMAP_WORK_CONTROL_DECISION =
  buildTaskMapWorkControlDecision;
const TASKMAP_WORK_CONTROL_DECISION_CANONICAL_BYTES =
  taskMapWorkControlDecisionCanonicalBytes;

type PreflightState = {
  nodes: number;
  descriptors: number;
  bytes: number;
  byteLimit: number;
  seen: WeakSet<object>;
};

type PrototypeDescriptor = Readonly<{
  key: string | symbol;
  descriptor: PropertyDescriptor;
}>;

function snapshotPrototype(prototype: object): readonly PrototypeDescriptor[] {
  return OBJECT_FREEZE(REFLECT_OWN_KEYS(prototype).map((key) => OBJECT_FREEZE({
    key,
    descriptor: OBJECT_FREEZE({
      ...GET_OWN_PROPERTY_DESCRIPTOR(prototype, key)!,
    }),
  })));
}

const ARRAY_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Array.prototype);
const OBJECT_PROTOTYPE_DESCRIPTORS = snapshotPrototype(Object.prototype);
const SET_PROTOTYPE_DESCRIPTORS =
  snapshotPrototype(SET_CONSTRUCTOR.prototype);
const MAP_PROTOTYPE_DESCRIPTORS =
  snapshotPrototype(MAP_CONSTRUCTOR.prototype);
const WEAK_SET_PROTOTYPE_DESCRIPTORS =
  snapshotPrototype(WEAK_SET_CONSTRUCTOR.prototype);
const HASH_PROTOTYPE = GET_PROTOTYPE_OF(CREATE_HASH("sha256"));
const HMAC_PROTOTYPE = GET_PROTOTYPE_OF(CREATE_HMAC(
  "sha256",
  BUFFER_FROM("taskmap-p10.3b-prototype-receipt", "utf8"),
));
const HASH_PROTOTYPE_DESCRIPTORS =
  snapshotPrototype(HASH_PROTOTYPE);
const HMAC_PROTOTYPE_DESCRIPTORS =
  snapshotPrototype(HMAC_PROTOTYPE);

function fail(message: string): never {
  throw new Error(`P10.3b candidate-review companion: ${message}`);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameDescriptor(
  left: PropertyDescriptor | undefined,
  right: PropertyDescriptor,
): boolean {
  return left !== undefined
    && left.configurable === right.configurable
    && left.enumerable === right.enumerable
    && left.writable === right.writable
    && left.value === right.value
    && left.get === right.get
    && left.set === right.set;
}

function assertPrototypeIntegrity(
  prototype: object,
  expected: readonly PrototypeDescriptor[],
  label: string,
): void {
  const keys = REFLECT_OWN_KEYS(prototype);
  if (keys.length !== expected.length) {
    fail(`${label} prototype changed during validation`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const row = expected[index]!;
    if (
      keys[index] !== row.key
      || !sameDescriptor(
        GET_OWN_PROPERTY_DESCRIPTOR(prototype, row.key),
        row.descriptor,
      )
    ) {
      fail(`${label} prototype changed during validation`);
    }
  }
}

function assertRuntimeIntegrity(): void {
  if (
    Array.isArray !== ARRAY_IS_ARRAY
    || Object.keys !== OBJECT_KEYS
    || Object.values !== OBJECT_VALUES
    || Object.freeze !== OBJECT_FREEZE
    || Object.isFrozen !== OBJECT_IS_FROZEN
    || Buffer.byteLength !== BUFFER_BYTE_LENGTH
    || Buffer.from !== BUFFER_FROM
    || Set !== SET_CONSTRUCTOR
    || Map !== MAP_CONSTRUCTOR
    || WeakSet !== WEAK_SET_CONSTRUCTOR
    || nodeUtilTypes.isProxy !== IS_PROXY
  ) {
    fail("runtime static intrinsics changed during validation");
  }
  if (
    createHash !== CREATE_HASH
    || createHmac !== CREATE_HMAC
    || timingSafeEqual !== TIMING_SAFE_EQUAL
    || buildTaskMapWorkControlDecision
      !== BUILD_TASKMAP_WORK_CONTROL_DECISION
    || taskMapWorkControlDecisionCanonicalBytes
      !== TASKMAP_WORK_CONTROL_DECISION_CANONICAL_BYTES
  ) {
    fail("runtime module callables changed during validation");
  }
  assertPrototypeIntegrity(
    Array.prototype,
    ARRAY_PROTOTYPE_DESCRIPTORS,
    "Array",
  );
  assertPrototypeIntegrity(
    Object.prototype,
    OBJECT_PROTOTYPE_DESCRIPTORS,
    "Object",
  );
  assertPrototypeIntegrity(
    SET_CONSTRUCTOR.prototype,
    SET_PROTOTYPE_DESCRIPTORS,
    "Set",
  );
  assertPrototypeIntegrity(
    MAP_CONSTRUCTOR.prototype,
    MAP_PROTOTYPE_DESCRIPTORS,
    "Map",
  );
  assertPrototypeIntegrity(
    WEAK_SET_CONSTRUCTOR.prototype,
    WEAK_SET_PROTOTYPE_DESCRIPTORS,
    "WeakSet",
  );
  assertPrototypeIntegrity(
    HASH_PROTOTYPE,
    HASH_PROTOTYPE_DESCRIPTORS,
    "Hash",
  );
  assertPrototypeIntegrity(
    HMAC_PROTOTYPE,
    HMAC_PROTOTYPE_DESCRIPTORS,
    "Hmac",
  );
}

function addBytes(
  state: PreflightState,
  bytes: number,
  label: string,
): void {
  state.bytes += bytes;
  if (state.bytes > state.byteLimit) {
    fail(`${label} exceeds the pre-clone byte ceiling`);
  }
}

function countNode(state: PreflightState, label: string): void {
  state.nodes += 1;
  if (state.nodes > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxNodes) {
    fail(`${label} exceeds the pre-clone node ceiling`);
  }
}

function chargeKey(
  state: PreflightState,
  key: string,
  label: string,
): void {
  state.descriptors += 1;
  if (
    state.descriptors
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxDescriptors
  ) {
    fail(`${label} exceeds the pre-clone descriptor ceiling`);
  }
  if (key.length > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxStringLength) {
    fail(`${label} contains an oversized key`);
  }
  addBytes(
    state,
    BUFFER_BYTE_LENGTH(JSON_STRINGIFY(key), "utf8") + 1,
    label,
  );
}

function preflightJson(
  value: unknown,
  label: string,
  state: PreflightState,
  depth = 0,
): void {
  if (depth > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxDepth) {
    fail(`${label} exceeds the pre-clone depth ceiling`);
  }
  countNode(state, label);
  if (value === null) {
    addBytes(state, 4, label);
    return;
  }
  if (typeof value === "string") {
    if (value.length > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxStringLength) {
      fail(`${label} exceeds the string ceiling`);
    }
    addBytes(
      state,
      BUFFER_BYTE_LENGTH(JSON_STRINGIFY(value), "utf8"),
      label,
    );
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(`${label} contains a non-finite number`);
    }
    addBytes(
      state,
      BUFFER_BYTE_LENGTH(JSON_STRINGIFY(value), "utf8"),
      label,
    );
    return;
  }
  if (typeof value === "boolean") {
    addBytes(state, value ? 4 : 5, label);
    return;
  }
  if (typeof value !== "object") {
    fail(`${label} contains a non-JSON value`);
  }
  if (IS_PROXY(value)) {
    fail(`${label} contains a proxy`);
  }
  if (state.seen.has(value)) {
    fail(`${label} contains a cycle or object alias`);
  }
  state.seen.add(value);
  const prototype = GET_PROTOTYPE_OF(value);
  const keys = REFLECT_OWN_KEYS(value);
  if (ARRAY_IS_ARRAY(value)) {
    if (prototype !== Array.prototype) {
      fail(`${label} array has a custom prototype`);
    }
    if (
      value.length
        > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxArrayLength
    ) {
      fail(`${label} exceeds the array ceiling`);
    }
    if (keys.length !== value.length + 1 || !keys.includes("length")) {
      fail(`${label} array contains holes or named fields`);
    }
    addBytes(state, 2 + Math.max(0, value.length - 1), label);
    for (const key of keys) {
      if (typeof key !== "string") {
        fail(`${label} contains a symbol key`);
      }
      chargeKey(state, key, label);
      if (
        key !== "length"
        && (
          !/^(0|[1-9]\d*)$/.test(key)
          || Number(key) >= value.length
        )
      ) {
        fail(`${label} array contains holes or named fields`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor =
        GET_OWN_PROPERTY_DESCRIPTOR(value, String(index));
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || descriptor.enumerable !== true
        || descriptor.value === undefined
      ) {
        fail(`${label} array must contain enumerable data elements`);
      }
      preflightJson(
        descriptor.value,
        `${label}[${index}]`,
        state,
        depth + 1,
      );
    }
    state.seen.delete(value);
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must use a plain or null prototype`);
  }
  if (
    keys.length
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxObjectKeys
  ) {
    fail(`${label} exceeds the object-key ceiling`);
  }
  addBytes(state, 2 + Math.max(0, keys.length - 1), label);
  for (const key of keys) {
    if (typeof key !== "string") {
      fail(`${label} contains a symbol key`);
    }
    // Charge every own key before reading its descriptor/value. Undefined is
    // rejected below, but it still consumes both descriptor and byte budget.
    chargeKey(state, key, label);
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.enumerable !== true
    ) {
      fail(`${label} must contain enumerable data properties`);
    }
    if (descriptor.value === undefined) {
      fail(`${label} contains an undefined data property`);
    }
    preflightJson(
      descriptor.value,
      `${label}.${key}`,
      state,
      depth + 1,
    );
  }
  state.seen.delete(value);
}

function snapshotJson<T>(
  value: T,
  label: string,
  byteLimit =
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxCanonicalInputBytes,
): T {
  assertRuntimeIntegrity();
  preflightJson(value, label, {
    nodes: 0,
    descriptors: 0,
    bytes: 0,
    byteLimit,
    seen: new WEAK_SET_CONSTRUCTOR<object>(),
  });
  let snapshot: T;
  try {
    snapshot = STRUCTURED_CLONE(value);
  } catch {
    fail(`${label} must be independently cloneable`);
  }
  const bytes = canonicalJson(snapshot);
  if (BUFFER_BYTE_LENGTH(bytes, "utf8") > byteLimit) {
    fail(`${label} exceeds the canonical byte ceiling`);
  }
  assertRuntimeIntegrity();
  return snapshot;
}

function canonicalJson(value: unknown): string {
  if (ARRAY_IS_ARRAY(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${
      OBJECT_KEYS(value as Record<string, unknown>)
        .sort(compareText)
        .map((key) => (
          `${JSON_STRINGIFY(key)}:${
            canonicalJson((value as Record<string, unknown>)[key])
          }`
        ))
        .join(",")
    }}`;
  }
  return JSON_STRINGIFY(value) ?? "null";
}

function digestCanonical(value: unknown): string {
  return CREATE_HASH("sha256").update(canonicalJson(value)).digest("hex");
}

function hmacCanonical(
  key: string,
  domain: string,
  value: unknown,
): string {
  return CREATE_HMAC("sha256", key)
    .update(canonicalJson({ domain, value }))
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null
    && typeof value === "object"
    && !OBJECT_IS_FROZEN(value)
  ) {
    for (const child of OBJECT_VALUES(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    OBJECT_FREEZE(value);
  }
  return value;
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || ARRAY_IS_ARRAY(value)) {
    fail(`${label} must be an object`);
  }
  const prototype = GET_PROTOTYPE_OF(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${label} must be a plain object`);
  }
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  assertRecord(value, label);
  const expected = new SET_CONSTRUCTOR([...required, ...optional]);
  const keys = OBJECT_KEYS(value);
  if (
    keys.some((key) => !expected.has(key))
    || required.some((key) => !HAS_OWN.call(value, key))
  ) {
    fail(`${label} has missing or unknown fields`);
  }
}

function assertArray(
  value: unknown,
  label: string,
  max: number = TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxArrayLength,
): asserts value is unknown[] {
  if (!ARRAY_IS_ARRAY(value) || value.length > max) {
    fail(`${label} must be a bounded array`);
  }
}

function assertString(
  value: unknown,
  label: string,
  allowEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string"
    || (!allowEmpty && value.length === 0)
    || value.length
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxStringLength
  ) {
    fail(`${label} must be a bounded string`);
  }
}

function assertOpaque(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_OPAQUE.test(value)) {
    fail(`${label} must be a bounded opaque value`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a SHA-256 digest`);
  }
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || !STRICT_RFC3339.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} must be a strict RFC3339 timestamp`);
  }
}

function assertNumber01(value: unknown, label: string): void {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
    || value > 1
  ) {
    fail(`${label} must be finite and between zero and one`);
  }
}

function assertSortedUniqueStrings(
  value: unknown,
  label: string,
  pattern?: RegExp,
): asserts value is string[] {
  assertArray(value, label);
  let previous: string | undefined;
  for (const row of value) {
    assertString(row, label);
    if (
      (pattern !== undefined && !pattern.test(row))
      || (previous !== undefined && compareText(previous, row) >= 0)
    ) {
      fail(`${label} must be strictly code-point sorted and unique`);
    }
    previous = row;
  }
}

function assertUniqueStrings(
  value: unknown,
  label: string,
  requireNonEmpty = false,
): asserts value is string[] {
  assertArray(value, label);
  if (requireNonEmpty && value.length === 0) {
    fail(`${label} cannot be empty`);
  }
  const seen = new SET_CONSTRUCTOR<string>();
  for (const row of value) {
    assertOpaque(row, label);
    if (seen.has(row)) fail(`${label} contains a duplicate`);
    seen.add(row);
  }
}

function assertAttestationKey(key: unknown, label: string): asserts key is string {
  if (
    typeof key !== "string"
    || BUFFER_BYTE_LENGTH(key, "utf8") < 32
    || BUFFER_BYTE_LENGTH(key, "utf8") > 512
  ) {
    fail(`${label} must be 32-512 bytes`);
  }
}

function sameUtf8KeyBytes(left: string, right: string): boolean {
  const leftBytes = BUFFER_FROM(left, "utf8");
  const rightBytes = BUFFER_FROM(right, "utf8");
  return leftBytes.length === rightBytes.length
    && TIMING_SAFE_EQUAL(leftBytes, rightBytes);
}

function safeEqualDigest(
  left: string,
  right: string,
): boolean {
  if (!SHA256.test(left) || !SHA256.test(right)) return false;
  return TIMING_SAFE_EQUAL(
    BUFFER_FROM(left, "hex"),
    BUFFER_FROM(right, "hex"),
  );
}

function normalizeTaskMapInput(input: TaskMapInput): {
  input: TaskMapInput;
  pointerById: Map<string, TaskMapSourcePointer>;
  eventById: Map<string, TaskMapEvent>;
} {
  assertExactKeys(
    input,
    ["contractVersion", "generatedAt", "pointers", "events"],
    [],
    "Task Map input",
  );
  if (input.contractVersion !== TASKMAP_CONTRACT_VERSION) {
    fail("Task Map input contract is unsupported");
  }
  assertTimestamp(input.generatedAt, "Task Map input generatedAt");
  assertArray(input.pointers, "Task Map input pointers");
  assertArray(input.events, "Task Map input events");
  const pointerById =
    new MAP_CONSTRUCTOR<string, TaskMapSourcePointer>();
  for (const pointer of input.pointers) {
    assertExactKeys(
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
      "Task Map pointer",
    );
    assertOpaque(pointer.id, "Task Map pointer ID");
    assertOpaque(pointer.sourceObjectId, "Task Map pointer source object ID");
    assertOpaque(pointer.sourceRefHash, "Task Map pointer source ref hash");
    if (!SOURCE_KINDS.has(pointer.sourceKind)) {
      fail("Task Map pointer source kind is unsupported");
    }
    if (!AUTHORITIES.has(pointer.authority)) {
      fail("Task Map pointer authority is unsupported");
    }
    if (!SYNC_MODES.has(pointer.syncMode)) {
      fail("Task Map pointer sync mode is unsupported");
    }
    if (pointer.canonicalUrl !== undefined) {
      assertString(pointer.canonicalUrl, "Task Map pointer canonical URL");
    }
    if (pointer.sourceVersion !== undefined) {
      assertOpaque(pointer.sourceVersion, "Task Map pointer source version");
    }
    assertArray(pointer.capabilities, "Task Map pointer capabilities");
    const capabilities = new SET_CONSTRUCTOR<string>();
    for (const capability of pointer.capabilities) {
      assertString(capability, "Task Map pointer capability");
      if (
        !CAPABILITIES.has(capability)
        || capabilities.has(capability)
      ) {
        fail("Task Map pointer capabilities are invalid");
      }
      capabilities.add(capability);
    }
    if (pointerById.has(pointer.id)) {
      fail("Task Map pointer ID is duplicated");
    }
    pointerById.set(pointer.id, pointer);
  }
  const eventById = new MAP_CONSTRUCTOR<string, TaskMapEvent>();
  for (const event of input.events) {
    assertExactKeys(
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
        "corpusCoverage",
        "bodyJoinEligible",
      ],
      "Task Map event",
    );
    assertOpaque(event.id, "Task Map event ID");
    assertOpaque(event.pointerId, "Task Map event pointer ID");
    if (!pointerById.has(event.pointerId)) {
      fail("Task Map event pointer is absent");
    }
    if (!RECORD_KINDS.has(event.recordKind)) {
      fail("Task Map event record kind is unsupported");
    }
    if (!ACTIVITIES.has(event.activity)) {
      fail("Task Map event activity is unsupported");
    }
    assertTimestamp(event.occurredAt, "Task Map event occurredAt");
    assertTimestamp(event.observedAt, "Task Map event observedAt");
    assertUniqueStrings(event.objectRefs, "Task Map event object refs");
    assertString(event.title, "Task Map event title", true);
    assertString(event.summary, "Task Map event summary", true);
    assertNumber01(
      event.extractionConfidence,
      "Task Map event extraction confidence",
    );
    if (event.dayKey !== undefined) {
      if (
        typeof event.dayKey !== "string"
        || !/^\d{4}-\d{2}-\d{2}$/.test(event.dayKey)
      ) {
        fail("Task Map event dayKey is invalid");
      }
    }
    if (
      event.sourceStatus !== undefined
      && !SOURCE_STATUSES.has(event.sourceStatus)
    ) {
      fail("Task Map event source status is unsupported");
    }
    if (
      event.priority !== undefined
      && (
        typeof event.priority !== "number"
        || !Number.isInteger(event.priority)
        || event.priority < 0
        || event.priority > 4
      )
    ) {
      fail("Task Map event priority is invalid");
    }
    if (event.deadlineAt !== undefined) {
      assertTimestamp(event.deadlineAt, "Task Map event deadlineAt");
    }
    if (event.supersedesEventId !== undefined) {
      assertOpaque(
        event.supersedesEventId,
        "Task Map event supersedes ID",
      );
    }
    if (event.retractsEventId !== undefined) {
      assertOpaque(event.retractsEventId, "Task Map event retracts ID");
    }
    if (
      event.bodyCategory !== undefined
      && !BODY_CATEGORIES.has(event.bodyCategory)
    ) {
      fail("Task Map event body category is unsupported");
    }
    if (
      event.bodyAxis !== undefined
      && !BODY_AXES.has(event.bodyAxis)
    ) {
      fail("Task Map event body axis is unsupported");
    }
    if (
      event.corpusCoverage !== undefined
      && event.corpusCoverage !== "complete"
    ) {
      fail("Task Map event corpus coverage is unsupported");
    }
    if (
      event.bodyJoinEligible !== undefined
      && typeof event.bodyJoinEligible !== "boolean"
    ) {
      fail("Task Map event body-join flag is invalid");
    }
    if (eventById.has(event.id)) {
      fail("Task Map event ID is duplicated");
    }
    eventById.set(event.id, event);
  }
  return { input, pointerById, eventById };
}

type NormalizedBrain = {
  brain: SemanticBrainOutput;
  rootById: Map<string, BrainRootProposal>;
  taskById: Map<string, BrainTaskProposal>;
  edgeById: Map<string, BrainEdgeProposal>;
  evidenceEventIds: string[];
};

function normalizeBrain(
  brain: SemanticBrainOutput,
  normalizedInput: ReturnType<typeof normalizeTaskMapInput>,
): NormalizedBrain {
  assertExactKeys(
    brain,
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
    [],
    "semantic brain",
  );
  if (brain.contractVersion !== TASKMAP_CONTRACT_VERSION) {
    fail("semantic brain contract is unsupported");
  }
  assertString(brain.provider, "semantic brain provider");
  assertString(brain.model, "semantic brain model");
  assertOpaque(brain.promptHash, "semantic brain prompt hash");
  assertDigest(brain.inputDigest, "semantic brain input digest");
  assertTimestamp(brain.generatedAt, "semantic brain generatedAt");
  assertArray(
    brain.roots,
    "semantic brain roots",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxBrainRoots,
  );
  assertArray(
    brain.tasks,
    "semantic brain tasks",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxBrainTasks,
  );
  assertArray(
    brain.edges,
    "semantic brain edges",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxBrainEdges,
  );
  const rootById = new MAP_CONSTRUCTOR<string, BrainRootProposal>();
  const taskById = new MAP_CONSTRUCTOR<string, BrainTaskProposal>();
  const edgeById = new MAP_CONSTRUCTOR<string, BrainEdgeProposal>();
  const proposalIds = new SET_CONSTRUCTOR<string>();
  const evidence = new SET_CONSTRUCTOR<string>();
  const exactSemanticInput = taskMapSemanticInput(
    normalizedInput.input,
  );
  const semanticEventById = new MAP_CONSTRUCTOR(
    exactSemanticInput.events.map((event) => [event.id, event]),
  );
  const semanticObjectRefs = new SET_CONSTRUCTOR(
    exactSemanticInput.events
      .flatMap((event) => event.objectRefs),
  );
  const validateEvidence = (
    values: string[],
    label: string,
  ): void => {
    assertUniqueStrings(values, label, true);
    for (const eventId of values) {
      const event = semanticEventById.get(eventId);
      const pointer = event === undefined
        ? undefined
        : normalizedInput.pointerById.get(event.pointerId);
      if (
        event === undefined
        || pointer === undefined
        || event.recordKind === "body_context"
        || pointer.sourceKind === "oura"
      ) {
        fail(`${label} cites missing or body-derived evidence`);
      }
      evidence.add(eventId);
    }
  };
  for (const root of brain.roots) {
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
      [],
      "semantic brain root",
    );
    assertOpaque(root.proposalId, "semantic brain root proposal ID");
    assertString(root.title, "semantic brain root title");
    assertString(root.summary, "semantic brain root summary", true);
    validateEvidence(
      root.evidenceEventIds,
      "semantic brain root evidence",
    );
    assertUniqueStrings(
      root.memberObjectRefs,
      "semantic brain root member refs",
      true,
    );
    for (const member of root.memberObjectRefs) {
      if (!semanticObjectRefs.has(member)) {
        fail("semantic brain root member ref is absent from semantic input");
      }
    }
    assertNumber01(root.confidence, "semantic brain root confidence");
    if (proposalIds.has(root.proposalId)) {
      fail("semantic brain proposal ID is reused across kinds");
    }
    proposalIds.add(root.proposalId);
    rootById.set(root.proposalId, root);
  }
  for (const task of brain.tasks) {
    assertExactKeys(
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
      "semantic brain task",
    );
    assertOpaque(task.proposalId, "semantic brain task proposal ID");
    assertOpaque(
      task.rootProposalId,
      "semantic brain task root proposal ID",
    );
    assertString(task.title, "semantic brain task title");
    assertString(task.summary, "semantic brain task summary", true);
    validateEvidence(
      task.evidenceEventIds,
      "semantic brain task evidence",
    );
    if (!OPEN_STATES.has(task.openState)) {
      fail("semantic brain task open state is unsupported");
    }
    assertNumber01(task.confidence, "semantic brain task confidence");
    if (task.authoritativeTaskEventId !== undefined) {
      assertOpaque(
        task.authoritativeTaskEventId,
        "semantic brain authoritative event ID",
      );
      const authoritative = normalizedInput.eventById.get(
        task.authoritativeTaskEventId,
      );
      if (
        authoritative?.recordKind !== "authoritative_task"
        || !task.evidenceEventIds.includes(
          task.authoritativeTaskEventId,
        )
      ) {
        fail("semantic brain authoritative event is not authoritative evidence");
      }
    }
    if (task.proposedReturnPointerId !== undefined) {
      assertOpaque(
        task.proposedReturnPointerId,
        "semantic brain return pointer ID",
      );
      if (!normalizedInput.pointerById.has(task.proposedReturnPointerId)) {
        fail("semantic brain return pointer is absent");
      }
    }
    if (proposalIds.has(task.proposalId)) {
      fail("semantic brain proposal ID is reused across kinds");
    }
    proposalIds.add(task.proposalId);
    taskById.set(task.proposalId, task);
  }
  for (const task of brain.tasks) {
    if (!rootById.has(task.rootProposalId)) {
      fail("semantic brain task has a dangling root proposal");
    }
  }
  for (const edge of brain.edges) {
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
      [],
      "semantic brain edge",
    );
    assertOpaque(edge.proposalId, "semantic brain edge proposal ID");
    assertOpaque(edge.fromProposalId, "semantic brain edge from proposal");
    assertOpaque(edge.toProposalId, "semantic brain edge to proposal");
    if (
      !RELATIONS.has(edge.relation)
      || edge.fromProposalId === edge.toProposalId
      || (
        !rootById.has(edge.fromProposalId)
        && !taskById.has(edge.fromProposalId)
      )
      || (
        !rootById.has(edge.toProposalId)
        && !taskById.has(edge.toProposalId)
      )
    ) {
      fail("semantic brain edge relation or endpoint is invalid");
    }
    validateEvidence(
      edge.evidenceEventIds,
      "semantic brain edge evidence",
    );
    assertNumber01(edge.confidence, "semantic brain edge confidence");
    if (proposalIds.has(edge.proposalId)) {
      fail("semantic brain proposal ID is reused across kinds");
    }
    proposalIds.add(edge.proposalId);
    edgeById.set(edge.proposalId, edge);
  }
  const evidenceEventIds = [...evidence].sort(compareText);
  if (
    evidenceEventIds.length
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxEvidence
  ) {
    fail("semantic brain evidence exceeds the policy ceiling");
  }
  return {
    brain,
    rootById,
    taskById,
    edgeById,
    evidenceEventIds,
  };
}

function assertSemanticBrainArtifactShape(
  artifact: TaskMapSemanticBrainArtifactV1,
): void {
  assertExactKeys(
    artifact,
    [
      "sourceSemanticInputDigest",
      "attestationKeyId",
      "attestationMac",
      "brain",
    ],
    [],
    "semantic brain artifact",
  );
  assertDigest(
    artifact.sourceSemanticInputDigest,
    "semantic brain source digest",
  );
  assertDigest(artifact.attestationKeyId, "semantic brain key ID");
  assertDigest(artifact.attestationMac, "semantic brain MAC");
}

type VerifiedSemanticCompanion = {
  sourceSnapshot: TaskMapSourceSnapshotV1;
  normalizedBrain: NormalizedBrain;
  semanticBrainDigest: string;
  brainOutputDigest: string;
};

function verifySemanticCompanion(
  taskMapInput: TaskMapInput,
  sourceSnapshotInput: TaskMapSourceSnapshotV1,
  semanticBrainArtifact: TaskMapSemanticBrainArtifactV1,
  semanticBrainAttestationKey: string,
): VerifiedSemanticCompanion {
  const normalizedInput = normalizeTaskMapInput(taskMapInput);
  const sourceSnapshot =
    assertTaskMapSourceSnapshot(sourceSnapshotInput);
  assertSemanticBrainArtifactShape(semanticBrainArtifact);
  assertAttestationKey(
    semanticBrainAttestationKey,
    "semantic brain attestation key",
  );
  const normalizedBrain = normalizeBrain(
    semanticBrainArtifact.brain,
    normalizedInput,
  );
  // Freeze the complete harness semantic gates without retaining or reusing
  // any proposed projection row, score, route, or identifier. This companion
  // is separately attested and is deliberately not compared to P10.2 rows.
  const semanticGateProjection = buildTaskMapProjection(
    normalizedInput.input,
    normalizedBrain.brain,
    {
      arm: "E2",
      now: normalizedBrain.brain.generatedAt,
    },
  );
  if (
    semanticGateProjection.runStatus !== "accepted"
    || semanticGateProjection.rejections.length !== 0
    || taskMapProjectionArtifactValidationReasons(
      semanticGateProjection,
    ).length !== 0
  ) {
    fail("semantic brain fails the frozen harness semantic gates");
  }
  // The frozen P9.2 helper authenticates the semantic artifact only after the
  // complete hostile caller input has been snapshotted and closed above.
  const semanticReference = buildTaskMapSemanticProposalReference({
    sourceSnapshot,
    semanticBrainArtifact,
    semanticBrainAttestationKey,
  });
  const harnessSemanticDigest =
    taskMapSemanticInputDigest(normalizedInput.input);
  if (
    semanticBrainArtifact.brain.inputDigest !== harnessSemanticDigest
    || semanticBrainArtifact.sourceSemanticInputDigest
      !== sourceSnapshot.semanticInputDigest
  ) {
    fail("semantic brain, harness, and source digest domains are misbound");
  }
  return {
    sourceSnapshot,
    normalizedBrain,
    semanticBrainDigest: semanticReference.semanticBrainDigest,
    brainOutputDigest: taskMapContractDigest(
      semanticBrainArtifact.brain,
    ),
  };
}

function sourceEnvelopeMatchesEvent(
  sourceKind: TaskMapSourcePointer["sourceKind"],
  objectType: TaskMapSourceEnvelopeV1["objectType"],
  recordKind: TaskMapEvent["recordKind"],
): boolean {
  if (recordKind === "authoritative_task") {
    return objectType === "authoritative_task"
      && [
        "linear",
        "jira",
        "github",
        "google_tasks",
        "manual",
      ].includes(sourceKind);
  }
  if (recordKind === "body_context") {
    return sourceKind === "oura" && objectType === "body_context";
  }
  if (recordKind === "work_context") {
    if (["gemini_meet", "granola"].includes(sourceKind)) {
      return objectType === "meeting_note";
    }
    if (sourceKind === "google_calendar" || sourceKind === "local_calendar") {
      return objectType === "calendar_event";
    }
    if (
      ["codex_session", "claude_session", "cursor_session"]
        .includes(sourceKind)
    ) {
      return objectType === "agent_session";
    }
    return [
      "slack",
      "google_chat",
      "gmail",
      "strategy",
      "manual",
      "unknown",
    ].includes(sourceKind) && objectType === "strategy_context";
  }
  // Receipts prove delivery/availability rather than candidate semantics and
  // cannot be promoted into bridge evidence in v1.
  return false;
}

function resolveEvidenceEnvelope(
  event: TaskMapEvent,
  pointer: TaskMapSourcePointer,
  sourceSnapshot: TaskMapSourceSnapshotV1,
): TaskMapSourceEnvelopeV1 {
  if (pointer.sourceVersion === undefined) {
    fail("reviewed evidence pointer lacks an exact source revision");
  }
  if (
    [
      "codex_session",
      "claude_session",
      "cursor_session",
      "oura",
    ].includes(pointer.sourceKind)
    && (
      !SHA256.test(pointer.sourceObjectId)
      || !SHA256.test(pointer.sourceVersion)
    )
  ) {
    fail("local-agent or body evidence identity is not digest-bounded");
  }
  const matches = sourceSnapshot.envelopes.filter((envelope) => (
    envelope.sourceKind === pointer.sourceKind
    && envelope.sourceObjectId === pointer.sourceObjectId
    && envelope.sourceRevision === pointer.sourceVersion
    && sourceEnvelopeMatchesEvent(
      pointer.sourceKind,
      envelope.objectType,
      event.recordKind,
    )
  ));
  if (matches.length !== 1) {
    fail("reviewed evidence does not resolve to exactly one source envelope");
  }
  const envelope = matches[0]!;
  if (
    envelope.objectType === "body_context"
    || envelope.sourceKind === "oura"
    || envelope.authority.evidence === "body_context_only"
    || envelope.authority.rank === "body_bonus_only"
  ) {
    fail("body-derived evidence cannot enter candidate review");
  }
  return envelope;
}

function bridgeEventToken(
  key: string,
  ownerScopeDigest: string,
  sourceSemanticInputDigest: string,
  brainOutputDigest: string,
  eventId: string,
): string {
  return `tmcandidateevent_${hmacCanonical(
    key,
    EVENT_TOKEN_DOMAIN,
    {
      ownerScopeDigest,
      sourceSemanticInputDigest,
      brainOutputDigest,
      eventId,
    },
  )}`;
}

function bridgeEnvelopeToken(
  key: string,
  ownerScopeDigest: string,
  sourceSemanticInputDigest: string,
  brainOutputDigest: string,
  envelope: TaskMapSourceEnvelopeV1,
): string {
  return `tmcandidateenvelope_${hmacCanonical(
    key,
    ENVELOPE_TOKEN_DOMAIN,
    {
      ownerScopeDigest,
      sourceSemanticInputDigest,
      brainOutputDigest,
      envelopeId: envelope.envelopeId,
      sourceIdentityDigest: envelope.sourceIdentityDigest,
      sourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
    },
  )}`;
}

export interface TaskMapCandidateEvidenceTokenMappingV1 {
  eventToken: string;
  envelopeToken: string;
}

export interface TaskMapCandidateEvidenceBridgePrivacyV1 {
  rawEventIdentifiersStored: false;
  rawEnvelopeIdentifiersStored: false;
  rawProposalIdentifiersStored: false;
  sourceBodiesStored: false;
  rawBiometricsStored: false;
  sourceObjectIdentifiersStored: false;
  sourceRevisionsStored: false;
  candidateTextStored: false;
  localPathsStored: false;
  secretsStored: false;
}

export interface TaskMapCandidateEvidenceBridgeV1 {
  contractVersion: typeof TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION;
  bridgeId: string;
  bridgeDigest: string;
  attestationKeyId: string;
  attestationMac: string;
  ownerScopeDigest: string;
  sourceSemanticInputDigest: string;
  brainInputDigest: string;
  brainOutputDigest: string;
  semanticBrainDigest: string;
  evidenceCount: number;
  evidenceMappings: TaskMapCandidateEvidenceTokenMappingV1[];
  privacy: TaskMapCandidateEvidenceBridgePrivacyV1;
}

export interface TaskMapCandidateEvidenceReviewMappingDraftV1 {
  eventId: string;
  sourceEnvelopeId: string;
}

export interface BuildTaskMapCandidateEvidenceBridgeInput {
  taskMapInput: TaskMapInput;
  sourceSnapshot: TaskMapSourceSnapshotV1;
  semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
  semanticBrainAttestationKey: string;
  bridgeAttestationKey: string;
  reviewedMappings: TaskMapCandidateEvidenceReviewMappingDraftV1[];
}

const BRIDGE_PRIVACY: TaskMapCandidateEvidenceBridgePrivacyV1 =
  OBJECT_FREEZE({
    rawEventIdentifiersStored: false,
    rawEnvelopeIdentifiersStored: false,
    rawProposalIdentifiersStored: false,
    sourceBodiesStored: false,
    rawBiometricsStored: false,
    sourceObjectIdentifiersStored: false,
    sourceRevisionsStored: false,
    candidateTextStored: false,
    localPathsStored: false,
    secretsStored: false,
  });

function bridgeCore(
  bridge: Omit<
    TaskMapCandidateEvidenceBridgeV1,
    "bridgeId" | "bridgeDigest" | "attestationMac"
  >,
): Omit<
  TaskMapCandidateEvidenceBridgeV1,
  "bridgeId" | "bridgeDigest" | "attestationMac"
> {
  return bridge;
}

function bridgeMac(
  key: string,
  core: ReturnType<typeof bridgeCore>,
): string {
  return hmacCanonical(key, BRIDGE_ATTESTATION_DOMAIN, core);
}

function expectedBridgeKeyId(key: string): string {
  return CREATE_HMAC("sha256", key)
    .update(BRIDGE_KEY_ID_DOMAIN)
    .digest("hex");
}

function buildBridgeFromTokenRows(
  ownerScopeDigest: string,
  sourceSemanticInputDigest: string,
  brainInputDigest: string,
  brainOutputDigest: string,
  semanticBrainDigest: string,
  rows: TaskMapCandidateEvidenceTokenMappingV1[],
  key: string,
): TaskMapCandidateEvidenceBridgeV1 {
  const core = bridgeCore({
    contractVersion: TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION,
    attestationKeyId: expectedBridgeKeyId(key),
    ownerScopeDigest,
    sourceSemanticInputDigest,
    brainInputDigest,
    brainOutputDigest,
    semanticBrainDigest,
    evidenceCount: rows.length,
    evidenceMappings: rows,
    privacy: { ...BRIDGE_PRIVACY },
  });
  const attestationMac = bridgeMac(key, core);
  const digestCore = {
    ...core,
    attestationMac,
  };
  const bridgeDigest = digestCanonical(digestCore);
  return deepFreeze({
    ...digestCore,
    bridgeId: `tmcandidatebridge_${bridgeDigest}`,
    bridgeDigest,
  });
}

function normalizeBridge(
  bridge: TaskMapCandidateEvidenceBridgeV1,
  key: string,
): TaskMapCandidateEvidenceBridgeV1 {
  assertAttestationKey(key, "candidate evidence bridge key");
  assertExactKeys(
    bridge,
    [
      "contractVersion",
      "bridgeId",
      "bridgeDigest",
      "attestationKeyId",
      "attestationMac",
      "ownerScopeDigest",
      "sourceSemanticInputDigest",
      "brainInputDigest",
      "brainOutputDigest",
      "semanticBrainDigest",
      "evidenceCount",
      "evidenceMappings",
      "privacy",
    ],
    [],
    "candidate evidence bridge",
  );
  if (
    bridge.contractVersion
      !== TASKMAP_CANDIDATE_EVIDENCE_BRIDGE_VERSION
  ) {
    fail("candidate evidence bridge version is unsupported");
  }
  if (!BRIDGE_ID.test(bridge.bridgeId)) {
    fail("candidate evidence bridge ID is invalid");
  }
  assertDigest(bridge.bridgeDigest, "candidate evidence bridge digest");
  assertDigest(bridge.attestationKeyId, "candidate evidence bridge key ID");
  assertDigest(bridge.attestationMac, "candidate evidence bridge MAC");
  assertDigest(bridge.ownerScopeDigest, "candidate evidence owner scope");
  assertDigest(
    bridge.sourceSemanticInputDigest,
    "candidate evidence source semantic digest",
  );
  assertDigest(bridge.brainInputDigest, "candidate evidence brain input");
  assertDigest(bridge.brainOutputDigest, "candidate evidence brain output");
  assertDigest(
    bridge.semanticBrainDigest,
    "candidate evidence semantic brain digest",
  );
  if (
    typeof bridge.evidenceCount !== "number"
    || !Number.isSafeInteger(bridge.evidenceCount)
    || bridge.evidenceCount < 0
    || bridge.evidenceCount
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxEvidence
  ) {
    fail("candidate evidence count is invalid");
  }
  assertArray(
    bridge.evidenceMappings,
    "candidate evidence mappings",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxEvidence,
  );
  if (bridge.evidenceMappings.length !== bridge.evidenceCount) {
    fail("candidate evidence count does not match mappings");
  }
  let previous = "";
  for (const row of bridge.evidenceMappings) {
    assertExactKeys(
      row,
      ["eventToken", "envelopeToken"],
      [],
      "candidate evidence token mapping",
    );
    if (
      typeof row.eventToken !== "string"
      || !EVENT_TOKEN.test(row.eventToken)
      || typeof row.envelopeToken !== "string"
      || !ENVELOPE_TOKEN.test(row.envelopeToken)
    ) {
      fail("candidate evidence token mapping is invalid");
    }
    const order = `${row.eventToken}\u0000${row.envelopeToken}`;
    if (previous !== "" && compareText(previous, order) >= 0) {
      fail("candidate evidence mappings are duplicated or unsorted");
    }
    previous = order;
  }
  assertExactKeys(
    bridge.privacy,
    OBJECT_KEYS(BRIDGE_PRIVACY),
    [],
    "candidate evidence privacy",
  );
  if (canonicalJson(bridge.privacy) !== canonicalJson(BRIDGE_PRIVACY)) {
    fail("candidate evidence privacy boundary is invalid");
  }
  const rebuilt = buildBridgeFromTokenRows(
    bridge.ownerScopeDigest,
    bridge.sourceSemanticInputDigest,
    bridge.brainInputDigest,
    bridge.brainOutputDigest,
    bridge.semanticBrainDigest,
    bridge.evidenceMappings.map((row) => ({ ...row })),
    key,
  );
  if (
    !safeEqualDigest(bridge.attestationKeyId, rebuilt.attestationKeyId)
    || !safeEqualDigest(bridge.attestationMac, rebuilt.attestationMac)
    || canonicalJson(bridge) !== canonicalJson(rebuilt)
  ) {
    fail("candidate evidence bridge attestation or identity is invalid");
  }
  return deepFreeze(bridge);
}

export function buildTaskMapCandidateEvidenceBridge(
  input: BuildTaskMapCandidateEvidenceBridgeInput,
): TaskMapCandidateEvidenceBridgeV1 {
  const snapshot = snapshotJson(
    input,
    "candidate evidence bridge build input",
  );
  assertExactKeys(
    snapshot,
    [
      "taskMapInput",
      "sourceSnapshot",
      "semanticBrainArtifact",
      "semanticBrainAttestationKey",
      "bridgeAttestationKey",
      "reviewedMappings",
    ],
    [],
    "candidate evidence bridge build input",
  );
  assertAttestationKey(
    snapshot.bridgeAttestationKey,
    "candidate evidence bridge key",
  );
  assertAttestationKey(
    snapshot.semanticBrainAttestationKey,
    "semantic brain attestation key",
  );
  if (
    sameUtf8KeyBytes(
      snapshot.bridgeAttestationKey,
      snapshot.semanticBrainAttestationKey,
    )
  ) {
    fail("semantic brain and bridge attestation keys must be distinct");
  }
  const normalizedInput = normalizeTaskMapInput(snapshot.taskMapInput);
  const verified = verifySemanticCompanion(
    snapshot.taskMapInput,
    snapshot.sourceSnapshot,
    snapshot.semanticBrainArtifact,
    snapshot.semanticBrainAttestationKey,
  );
  assertArray(
    snapshot.reviewedMappings,
    "reviewed evidence mappings",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxEvidence,
  );
  const mappingByEvent = new MAP_CONSTRUCTOR<
    string,
    TaskMapCandidateEvidenceReviewMappingDraftV1
  >();
  for (const mapping of snapshot.reviewedMappings) {
    assertExactKeys(
      mapping,
      ["eventId", "sourceEnvelopeId"],
      [],
      "reviewed evidence mapping",
    );
    assertOpaque(mapping.eventId, "reviewed evidence event ID");
    assertOpaque(
      mapping.sourceEnvelopeId,
      "reviewed evidence source envelope ID",
    );
    if (mappingByEvent.has(mapping.eventId)) {
      fail("reviewed evidence mapping is duplicated");
    }
    mappingByEvent.set(mapping.eventId, mapping);
  }
  if (
    mappingByEvent.size
      !== verified.normalizedBrain.evidenceEventIds.length
  ) {
    fail("reviewed evidence mappings are incomplete or contain extras");
  }
  const rows =
    verified.normalizedBrain.evidenceEventIds.map((eventId) => {
      const mapping = mappingByEvent.get(eventId);
      const event = normalizedInput.eventById.get(eventId)!;
      const pointer = normalizedInput.pointerById.get(event.pointerId)!;
      const envelope = resolveEvidenceEnvelope(
        event,
        pointer,
        verified.sourceSnapshot,
      );
      if (
        mapping === undefined
        || mapping.sourceEnvelopeId !== envelope.envelopeId
      ) {
        fail("reviewed evidence mapping is missing, unknown, or ambiguous");
      }
      return {
        eventToken: bridgeEventToken(
          snapshot.bridgeAttestationKey,
          verified.sourceSnapshot.ownerScopeDigest,
          verified.sourceSnapshot.semanticInputDigest,
          verified.brainOutputDigest,
          eventId,
        ),
        envelopeToken: bridgeEnvelopeToken(
          snapshot.bridgeAttestationKey,
          verified.sourceSnapshot.ownerScopeDigest,
          verified.sourceSnapshot.semanticInputDigest,
          verified.brainOutputDigest,
          envelope,
        ),
      };
    }).sort((left, right) => (
      compareText(left.eventToken, right.eventToken)
      || compareText(left.envelopeToken, right.envelopeToken)
    ));
  return buildBridgeFromTokenRows(
    verified.sourceSnapshot.ownerScopeDigest,
    verified.sourceSnapshot.semanticInputDigest,
    verified.normalizedBrain.brain.inputDigest,
    verified.brainOutputDigest,
    verified.semanticBrainDigest,
    rows,
    snapshot.bridgeAttestationKey,
  );
}

export function assertTaskMapCandidateEvidenceBridge(
  value: TaskMapCandidateEvidenceBridgeV1,
  bridgeAttestationKey: string,
): TaskMapCandidateEvidenceBridgeV1 {
  const snapshot = snapshotJson(
    { value, bridgeAttestationKey },
    "candidate evidence bridge validation input",
  );
  assertExactKeys(
    snapshot,
    ["value", "bridgeAttestationKey"],
    [],
    "candidate evidence bridge validation input",
  );
  return normalizeBridge(snapshot.value, snapshot.bridgeAttestationKey);
}

export interface TaskMapCandidateReviewRowV1 {
  candidateId: string;
  candidateGroupId: string;
  evidenceIds: string[];
  evidenceCount: number;
  evidenceComplete: true;
  reasonCodes: Array<(typeof CANDIDATE_REASON_CODES)[number]>;
}

export interface TaskMapCandidateReviewPrivacyV1 {
  candidateTextStored: false;
  rawProposalIdentifiersStored: false;
  rawEventIdentifiersStored: false;
  rawEnvelopeIdentifiersStored: false;
  sourceBodiesStored: false;
  rawBiometricsStored: false;
  rawOwnerIdentifiersStored: false;
  sourceObjectIdentifiersStored: false;
  sourceRevisionsStored: false;
  routesStored: false;
  lifecycleAuthorityStored: false;
  rankStored: false;
  executionStateStored: false;
  localPathsStored: false;
  secretsStored: false;
}

export type TaskMapCandidateReviewCoverage =
  | "unavailable_missing_companion"
  | "available_attested_candidate_only";

export interface TaskMapCandidateReviewCompanionV1 {
  contractVersion: typeof TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION;
  artifactId: string;
  artifactDigest: string;
  originDigest: string;
  policyVersion: typeof TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION;
  attestationKeyId: string | null;
  attestationMac: string | null;
  taskMapInputDigest: string;
  workControlArtifactDigest: string;
  workControlOriginDigest: string;
  projectionInputDigest: string;
  sourceSnapshotDigest: string;
  sourceSemanticInputDigest: string;
  bridgeDigest: string | null;
  semanticBrainDigest: string | null;
  candidateCoverage: TaskMapCandidateReviewCoverage;
  reviewNext: TaskMapCandidateReviewRowV1[];
  privacy: TaskMapCandidateReviewPrivacyV1;
}

export interface TaskMapCandidateReviewAttestedCompanionInput {
  sourceSnapshot: TaskMapSourceSnapshotV1;
  semanticBrainArtifact: TaskMapSemanticBrainArtifactV1;
  semanticBrainAttestationKey: string;
  evidenceBridge: TaskMapCandidateEvidenceBridgeV1;
  bridgeAttestationKey: string;
}

export interface BuildTaskMapCandidateReviewCompanionInput {
  currentRoot: string;
  runRoot: string;
  sidecarRoot: string;
  projection: TaskMapProjectionV1;
  taskMapInput: TaskMapInput;
  workControlDecision: TaskMapWorkControlDecisionV1;
  companion?: TaskMapCandidateReviewAttestedCompanionInput;
}

export interface BuiltTaskMapCandidateReviewCompanion {
  artifact: TaskMapCandidateReviewCompanionV1;
  canonicalBytes: string;
}

const REVIEW_PRIVACY: TaskMapCandidateReviewPrivacyV1 = OBJECT_FREEZE({
  candidateTextStored: false,
  rawProposalIdentifiersStored: false,
  rawEventIdentifiersStored: false,
  rawEnvelopeIdentifiersStored: false,
  sourceBodiesStored: false,
  rawBiometricsStored: false,
  rawOwnerIdentifiersStored: false,
  sourceObjectIdentifiersStored: false,
  sourceRevisionsStored: false,
  routesStored: false,
  lifecycleAuthorityStored: false,
  rankStored: false,
  executionStateStored: false,
  localPathsStored: false,
  secretsStored: false,
});

function candidateGroupId(
  key: string,
  semanticBrainDigest: string,
  root: BrainRootProposal,
): string {
  return `tmcandidategroup_${hmacCanonical(
    key,
    CANDIDATE_GROUP_ID_DOMAIN,
    {
      semanticBrainDigest,
      rootCanonicalDigest: digestCanonical(root),
    },
  )}`;
}

function candidateId(
  key: string,
  semanticBrainDigest: string,
  task: BrainTaskProposal,
): string {
  return `tmcandidate_${hmacCanonical(
    key,
    CANDIDATE_ID_DOMAIN,
    {
      semanticBrainDigest,
      taskCanonicalDigest: digestCanonical(task),
    },
  )}`;
}

function publicEvidenceId(
  key: string,
  semanticBrainDigest: string,
  mapping: TaskMapCandidateEvidenceTokenMappingV1,
): string {
  return `tmcandidateevidence_${hmacCanonical(
    key,
    CANDIDATE_EVIDENCE_ID_DOMAIN,
    {
      semanticBrainDigest,
      eventToken: mapping.eventToken,
      envelopeToken: mapping.envelopeToken,
    },
  )}`;
}

function expectedBridgeRows(
  normalizedInput: ReturnType<typeof normalizeTaskMapInput>,
  verified: VerifiedSemanticCompanion,
  bridgeKey: string,
): {
  rows: TaskMapCandidateEvidenceTokenMappingV1[];
  mappingByEventId: Map<string, TaskMapCandidateEvidenceTokenMappingV1>;
} {
  const mappingByEventId =
    new MAP_CONSTRUCTOR<
      string,
      TaskMapCandidateEvidenceTokenMappingV1
    >();
  for (const eventId of verified.normalizedBrain.evidenceEventIds) {
    const event = normalizedInput.eventById.get(eventId)!;
    const pointer = normalizedInput.pointerById.get(event.pointerId)!;
    const envelope = resolveEvidenceEnvelope(
      event,
      pointer,
      verified.sourceSnapshot,
    );
    mappingByEventId.set(eventId, {
      eventToken: bridgeEventToken(
        bridgeKey,
        verified.sourceSnapshot.ownerScopeDigest,
        verified.sourceSnapshot.semanticInputDigest,
        verified.brainOutputDigest,
        eventId,
      ),
      envelopeToken: bridgeEnvelopeToken(
        bridgeKey,
        verified.sourceSnapshot.ownerScopeDigest,
        verified.sourceSnapshot.semanticInputDigest,
        verified.brainOutputDigest,
        envelope,
      ),
    });
  }
  const rows = [...mappingByEventId.values()].sort((left, right) => (
    compareText(left.eventToken, right.eventToken)
    || compareText(left.envelopeToken, right.envelopeToken)
  ));
  return { rows, mappingByEventId };
}

function buildReviewRows(
  verified: VerifiedSemanticCompanion,
  bridgeKey: string,
  mappingByEventId:
    ReadonlyMap<string, TaskMapCandidateEvidenceTokenMappingV1>,
): TaskMapCandidateReviewRowV1[] {
  return verified.normalizedBrain.brain.tasks
    .filter((task) => task.authoritativeTaskEventId === undefined)
    .map((task) => {
      const root = verified.normalizedBrain.rootById.get(
        task.rootProposalId,
      )!;
      const evidenceIds = task.evidenceEventIds.map((eventId) => {
        const mapping = mappingByEventId.get(eventId);
        if (mapping === undefined) {
          fail("candidate task evidence is absent from the exact bridge");
        }
        return publicEvidenceId(
          bridgeKey,
          verified.semanticBrainDigest,
          mapping,
        );
      }).sort(compareText);
      if (
        new SET_CONSTRUCTOR(evidenceIds).size !== evidenceIds.length
      ) {
        fail("candidate evidence references collide");
      }
      return {
        candidateId: candidateId(
          bridgeKey,
          verified.semanticBrainDigest,
          task,
        ),
        candidateGroupId: candidateGroupId(
          bridgeKey,
          verified.semanticBrainDigest,
          root,
        ),
        evidenceIds,
        evidenceCount: evidenceIds.length,
        evidenceComplete: true as const,
        reasonCodes: [...CANDIDATE_REASON_CODES],
      };
    }).sort((left, right) => compareText(
      left.candidateId,
      right.candidateId,
    ));
}

function artifactCore(
  value: Omit<
    TaskMapCandidateReviewCompanionV1,
    "artifactId" | "artifactDigest"
  >,
): Omit<
  TaskMapCandidateReviewCompanionV1,
  "artifactId" | "artifactDigest"
> {
  return value;
}

type UnsignedCandidateArtifact = Omit<
  TaskMapCandidateReviewCompanionV1,
  "artifactId"
  | "artifactDigest"
  | "attestationKeyId"
  | "attestationMac"
>;

function candidateArtifactKeyId(key: string): string {
  return CREATE_HMAC("sha256", key)
    .update(CANDIDATE_ARTIFACT_KEY_ID_DOMAIN)
    .digest("hex");
}

function candidateArtifactMac(
  key: string,
  unsigned: UnsignedCandidateArtifact,
): string {
  return hmacCanonical(
    key,
    CANDIDATE_ARTIFACT_ATTESTATION_DOMAIN,
    unsigned,
  );
}

function buildArtifact(
  workControl: TaskMapWorkControlDecisionV1,
  fullInputDigest: string,
  sourceSnapshotDigest: string,
  sourceSemanticInputDigest: string,
  bridgeDigest: string | null,
  semanticBrainDigest: string | null,
  candidateCoverage: TaskMapCandidateReviewCoverage,
  reviewNext: TaskMapCandidateReviewRowV1[],
  artifactAttestationKey: string | null,
): BuiltTaskMapCandidateReviewCompanion {
  const originDigest = digestCanonical({
    taskMapInputDigest: fullInputDigest,
    workControlArtifactDigest: workControl.artifactDigest,
    workControlOriginDigest: workControl.originDigest,
    projectionInputDigest:
      workControl.predecessor.projectionInputDigest,
    sourceSnapshotDigest,
    sourceSemanticInputDigest,
    bridgeDigest,
    semanticBrainDigest,
  });
  const unsigned: UnsignedCandidateArtifact = {
    contractVersion: TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION,
    originDigest,
    policyVersion: TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION,
    taskMapInputDigest: fullInputDigest,
    workControlArtifactDigest: workControl.artifactDigest,
    workControlOriginDigest: workControl.originDigest,
    projectionInputDigest:
      workControl.predecessor.projectionInputDigest,
    sourceSnapshotDigest,
    sourceSemanticInputDigest,
    bridgeDigest,
    semanticBrainDigest,
    candidateCoverage,
    reviewNext,
    privacy: { ...REVIEW_PRIVACY },
  };
  const core = artifactCore({
    ...unsigned,
    attestationKeyId: artifactAttestationKey === null
      ? null
      : candidateArtifactKeyId(artifactAttestationKey),
    attestationMac: artifactAttestationKey === null
      ? null
      : candidateArtifactMac(artifactAttestationKey, unsigned),
  });
  const artifactDigest = digestCanonical(core);
  const artifact = assertTaskMapCandidateReviewCompanionInternal(
    {
      ...core,
      artifactId: `tmcandidatereview_${artifactDigest}`,
      artifactDigest,
    },
    artifactAttestationKey ?? undefined,
  );
  return {
    artifact,
    canonicalBytes: canonicalJson(artifact),
  };
}

function assertTaskMapCandidateReviewCompanionInternal(
  artifact: TaskMapCandidateReviewCompanionV1,
  artifactAttestationKey?: string,
): TaskMapCandidateReviewCompanionV1 {
  assertExactKeys(
    artifact,
    [
      "contractVersion",
      "artifactId",
      "artifactDigest",
      "originDigest",
      "policyVersion",
      "attestationKeyId",
      "attestationMac",
      "taskMapInputDigest",
      "workControlArtifactDigest",
      "workControlOriginDigest",
      "projectionInputDigest",
      "sourceSnapshotDigest",
      "sourceSemanticInputDigest",
      "bridgeDigest",
      "semanticBrainDigest",
      "candidateCoverage",
      "reviewNext",
      "privacy",
    ],
    [],
    "candidate review artifact",
  );
  if (
    artifact.contractVersion
      !== TASKMAP_CANDIDATE_REVIEW_COMPANION_VERSION
    || artifact.policyVersion
      !== TASKMAP_CANDIDATE_REVIEW_POLICY_VERSION
    || !ARTIFACT_ID.test(artifact.artifactId)
  ) {
    fail("candidate review artifact version or ID is invalid");
  }
  for (const [value, label] of [
    [artifact.artifactDigest, "artifact digest"],
    [artifact.originDigest, "origin digest"],
    [artifact.taskMapInputDigest, "full input digest"],
    [artifact.workControlArtifactDigest, "work-control artifact digest"],
    [artifact.workControlOriginDigest, "work-control origin digest"],
    [artifact.projectionInputDigest, "projection input digest"],
    [artifact.sourceSnapshotDigest, "source snapshot digest"],
    [artifact.sourceSemanticInputDigest, "source semantic digest"],
  ] as const) {
    assertDigest(value, label);
  }
  if (artifact.bridgeDigest !== null) {
    assertDigest(artifact.bridgeDigest, "bridge digest");
  }
  if (artifact.semanticBrainDigest !== null) {
    assertDigest(artifact.semanticBrainDigest, "semantic brain digest");
  }
  if (artifact.attestationKeyId !== null) {
    assertDigest(artifact.attestationKeyId, "artifact attestation key ID");
  }
  if (artifact.attestationMac !== null) {
    assertDigest(artifact.attestationMac, "artifact attestation MAC");
  }
  if (
    ![
      "unavailable_missing_companion",
      "available_attested_candidate_only",
    ].includes(artifact.candidateCoverage)
  ) {
    fail("candidate review coverage is unsupported");
  }
  assertArray(
    artifact.reviewNext,
    "candidate review rows",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxBrainTasks,
  );
  let previousCandidateId = "";
  const candidateIds = new SET_CONSTRUCTOR<string>();
  for (const row of artifact.reviewNext) {
    assertExactKeys(
      row,
      [
        "candidateId",
        "candidateGroupId",
        "evidenceIds",
        "evidenceCount",
        "evidenceComplete",
        "reasonCodes",
      ],
      [],
      "candidate review row",
    );
    if (
      typeof row.candidateId !== "string"
      || !CANDIDATE_ID.test(row.candidateId)
      || typeof row.candidateGroupId !== "string"
      || !CANDIDATE_GROUP_ID.test(row.candidateGroupId)
      || (
        previousCandidateId !== ""
        && compareText(previousCandidateId, row.candidateId) >= 0
      )
      || candidateIds.has(row.candidateId)
    ) {
      fail("candidate review IDs are invalid, duplicated, or unsorted");
    }
    previousCandidateId = row.candidateId;
    candidateIds.add(row.candidateId);
    assertSortedUniqueStrings(
      row.evidenceIds,
      "candidate review evidence IDs",
      CANDIDATE_EVIDENCE_ID,
    );
    if (
      typeof row.evidenceCount !== "number"
      || !Number.isSafeInteger(row.evidenceCount)
      || row.evidenceCount !== row.evidenceIds.length
      || row.evidenceCount === 0
      || row.evidenceComplete !== true
      || canonicalJson(row.reasonCodes)
        !== canonicalJson(CANDIDATE_REASON_CODES)
    ) {
      fail("candidate review evidence closure or reason codes are invalid");
    }
  }
  if (
    artifact.candidateCoverage === "unavailable_missing_companion"
      ? (
        artifact.reviewNext.length !== 0
        || artifact.bridgeDigest !== null
        || artifact.semanticBrainDigest !== null
        || artifact.attestationKeyId !== null
        || artifact.attestationMac !== null
      )
      : (
        artifact.bridgeDigest === null
        || artifact.semanticBrainDigest === null
        || artifact.attestationKeyId === null
        || artifact.attestationMac === null
      )
  ) {
    fail("candidate coverage does not match companion evidence");
  }
  if (artifact.candidateCoverage === "available_attested_candidate_only") {
    assertAttestationKey(
      artifactAttestationKey,
      "candidate artifact attestation key",
    );
    const {
      artifactId: _artifactId,
      artifactDigest: _artifactDigest,
      attestationKeyId: _attestationKeyId,
      attestationMac: _attestationMac,
      ...unsigned
    } = artifact;
    const expectedKeyId = candidateArtifactKeyId(
      artifactAttestationKey,
    );
    const expectedMac = candidateArtifactMac(
      artifactAttestationKey,
      unsigned,
    );
    if (
      !safeEqualDigest(artifact.attestationKeyId!, expectedKeyId)
      || !safeEqualDigest(artifact.attestationMac!, expectedMac)
    ) {
      fail("candidate artifact attestation is invalid");
    }
  }
  assertExactKeys(
    artifact.privacy,
    OBJECT_KEYS(REVIEW_PRIVACY),
    [],
    "candidate review privacy",
  );
  if (canonicalJson(artifact.privacy) !== canonicalJson(REVIEW_PRIVACY)) {
    fail("candidate review privacy boundary is invalid");
  }
  const {
    artifactId: _artifactId,
    artifactDigest: _artifactDigest,
    ...core
  } = artifact;
  const expectedDigest = digestCanonical(core);
  if (
    artifact.artifactDigest !== expectedDigest
    || artifact.artifactId !== `tmcandidatereview_${expectedDigest}`
  ) {
    fail("candidate review artifact identity is not canonical");
  }
  const bytes = canonicalJson(artifact);
  if (
    BUFFER_BYTE_LENGTH(bytes, "utf8")
      > TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxCanonicalArtifactBytes
  ) {
    fail("candidate review artifact exceeds the byte ceiling");
  }
  return deepFreeze(artifact);
}

export function assertTaskMapCandidateReviewCompanion(
  value: TaskMapCandidateReviewCompanionV1,
  artifactAttestationKey?: string,
): TaskMapCandidateReviewCompanionV1 {
  const snapshot = snapshotJson(
    artifactAttestationKey === undefined
      ? { value }
      : { value, artifactAttestationKey },
    "candidate review artifact",
    TASKMAP_CANDIDATE_REVIEW_LIMITS_V1.maxCanonicalArtifactBytes,
  );
  return assertTaskMapCandidateReviewCompanionInternal(
    snapshot.value,
    snapshot.artifactAttestationKey,
  );
}

export function taskMapCandidateReviewCompanionCanonicalBytes(
  value: TaskMapCandidateReviewCompanionV1,
  artifactAttestationKey?: string,
): string {
  return canonicalJson(assertTaskMapCandidateReviewCompanion(
    value,
    artifactAttestationKey,
  ));
}

async function buildTaskMapCandidateReviewCompanionCore(
  input: BuildTaskMapCandidateReviewCompanionInput,
  afterWorkControlStarted?: () => void | Promise<void>,
): Promise<BuiltTaskMapCandidateReviewCompanion> {
  // This is the single complete hostile-input snapshot. No helper and no
  // await observes caller-owned state before this boundary closes.
  const snapshot = snapshotJson(
    input,
    "candidate review companion build input",
  );
  assertExactKeys(
    snapshot,
    [
      "currentRoot",
      "runRoot",
      "sidecarRoot",
      "projection",
      "taskMapInput",
      "workControlDecision",
    ],
    ["companion"],
    "candidate review companion build input",
  );
  const hasCompanion = HAS_OWN.call(snapshot, "companion");
  if (hasCompanion && snapshot.companion === undefined) {
    fail("an explicit undefined companion is invalid");
  }
  const normalizedInput = normalizeTaskMapInput(snapshot.taskMapInput);
  const fullInputDigest = taskMapInputDigest(normalizedInput.input);
  if (
    fullInputDigest !== snapshot.projection.inputDigest
    || fullInputDigest
      !== snapshot.workControlDecision.predecessor.projectionInputDigest
  ) {
    fail("full input, projection, and work-control domains are misbound");
  }

  let verified: VerifiedSemanticCompanion | undefined;
  let bridge: TaskMapCandidateEvidenceBridgeV1 | undefined;
  let expectedRows:
    ReturnType<typeof expectedBridgeRows> | undefined;
  if (hasCompanion) {
    assertExactKeys(
      snapshot.companion,
      [
        "sourceSnapshot",
        "semanticBrainArtifact",
        "semanticBrainAttestationKey",
        "evidenceBridge",
        "bridgeAttestationKey",
      ],
      [],
      "attested candidate companion",
    );
    assertAttestationKey(
      snapshot.companion.semanticBrainAttestationKey,
      "semantic brain attestation key",
    );
    assertAttestationKey(
      snapshot.companion.bridgeAttestationKey,
      "candidate evidence bridge key",
    );
    if (
      sameUtf8KeyBytes(
        snapshot.companion.semanticBrainAttestationKey,
        snapshot.companion.bridgeAttestationKey,
      )
    ) {
      fail("semantic brain and bridge attestation keys must be distinct");
    }
    verified = verifySemanticCompanion(
      normalizedInput.input,
      snapshot.companion.sourceSnapshot,
      snapshot.companion.semanticBrainArtifact,
      snapshot.companion.semanticBrainAttestationKey,
    );
    bridge = normalizeBridge(
      snapshot.companion.evidenceBridge,
      snapshot.companion.bridgeAttestationKey,
    );
    expectedRows = expectedBridgeRows(
      normalizedInput,
      verified,
      snapshot.companion.bridgeAttestationKey,
    );
    const expectedBridge = buildBridgeFromTokenRows(
      verified.sourceSnapshot.ownerScopeDigest,
      verified.sourceSnapshot.semanticInputDigest,
      verified.normalizedBrain.brain.inputDigest,
      verified.brainOutputDigest,
      verified.semanticBrainDigest,
      expectedRows.rows,
      snapshot.companion.bridgeAttestationKey,
    );
    if (
      canonicalJson(bridge) !== canonicalJson(expectedBridge)
      || verified.sourceSnapshot.sourceSnapshotDigest
        !== snapshot.workControlDecision.predecessor.sourceSnapshotDigest
      || verified.sourceSnapshot.semanticInputDigest
        !== snapshot.workControlDecision.predecessor
          .sourceSemanticInputDigest
    ) {
      fail("candidate companion does not close the exact predecessor evidence set");
    }
  }

  // Product authority comes only from the real store-backed P10.3a builder.
  const rebuiltWorkControlPromise = BUILD_TASKMAP_WORK_CONTROL_DECISION({
    currentRoot: snapshot.currentRoot,
    runRoot: snapshot.runRoot,
    sidecarRoot: snapshot.sidecarRoot,
    projection: snapshot.projection,
  });
  if (afterWorkControlStarted !== undefined) {
    await afterWorkControlStarted();
  }
  const rebuiltWorkControl = await rebuiltWorkControlPromise;
  assertRuntimeIntegrity();
  const suppliedWorkControlBytes =
    TASKMAP_WORK_CONTROL_DECISION_CANONICAL_BYTES(
      snapshot.workControlDecision,
    );
  if (rebuiltWorkControl.canonicalBytes !== suppliedWorkControlBytes) {
    fail("supplied work-control decision is not the exact store-backed result");
  }
  const authenticatedWorkControl = rebuiltWorkControl.artifact;
  if (
    authenticatedWorkControl.predecessor.projectionInputDigest
      !== fullInputDigest
  ) {
    fail("authenticated work-control predecessor changed input domains");
  }
  if (
    verified === undefined
    || bridge === undefined
    || expectedRows === undefined
    || snapshot.companion === undefined
  ) {
    return buildArtifact(
      authenticatedWorkControl,
      fullInputDigest,
      authenticatedWorkControl.predecessor.sourceSnapshotDigest,
      authenticatedWorkControl.predecessor.sourceSemanticInputDigest,
      null,
      null,
      "unavailable_missing_companion",
      [],
      null,
    );
  }
  const reviewNext = buildReviewRows(
    verified,
    snapshot.companion.bridgeAttestationKey,
    expectedRows.mappingByEventId,
  );
  return buildArtifact(
    authenticatedWorkControl,
    fullInputDigest,
    verified.sourceSnapshot.sourceSnapshotDigest,
    verified.sourceSnapshot.semanticInputDigest,
    bridge.bridgeDigest,
    verified.semanticBrainDigest,
    "available_attested_candidate_only",
    reviewNext,
    snapshot.companion.bridgeAttestationKey,
  );
}

export async function buildTaskMapCandidateReviewCompanion(
  input: BuildTaskMapCandidateReviewCompanionInput,
): Promise<BuiltTaskMapCandidateReviewCompanion> {
  return buildTaskMapCandidateReviewCompanionCore(input);
}

/**
 * TEST-ONLY deterministic seam. Product authority still comes from the real
 * store-backed P10.3a builder; the hook can only exercise runtime-integrity
 * failure between starting and accepting that authenticated read.
 */
export async function unsafeBuildTaskMapCandidateReviewCompanionWithAfterWorkControlStartedForTest(
  input: BuildTaskMapCandidateReviewCompanionInput,
  afterWorkControlStarted: () => void | Promise<void>,
): Promise<BuiltTaskMapCandidateReviewCompanion> {
  return buildTaskMapCandidateReviewCompanionCore(
    input,
    afterWorkControlStarted,
  );
}
