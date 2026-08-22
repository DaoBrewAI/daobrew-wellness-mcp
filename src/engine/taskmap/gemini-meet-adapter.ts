import { types as nodeUtilTypes } from "node:util";
import {
  advanceTaskMapConnectorCheckpoint,
  assertTaskMapConnectorCheckpoint,
  buildGeminiMeetSource,
  buildTaskMapSourceSnapshot,
  canonicalizeTaskMapMeetings,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  buildTaskMapRefreshRunSourceSliceProof,
  assertTaskMapRefreshRunSourceSliceProof,
  type TaskMapRefreshRunSourceSliceProofV1,
} from "./refresh-run-bundle.js";
import {
  type TaskMapRefreshSourceBindingV1,
  type TaskMapRefreshSourceRevisionSetV1,
  type TaskMapRefreshSourceRevisionV1,
} from "./refresh-plan.js";
import {
  TASKMAP_SOURCE_ENVELOPE_VERSION,
  type TaskMapCanonicalMeetingV1,
  type TaskMapConnectorCheckpointV1,
  type TaskMapDiscoveryPointerV1,
  type TaskMapMeetingIdentityHintV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapSourceEnvelopeV1,
  type TaskMapSourceSnapshotV1,
} from "./types.js";

/**
 * P12.1a is a bounded, read-only adapter. Providers are injected by a caller;
 * this module owns no connector client, credentials, clock, scheduler,
 * persistence, writeback, or source mutation.
 */
export const TASKMAP_GEMINI_MEET_ADAPTER_VERSION =
  "taskmap-gemini-meet-adapter.1" as const;
export const TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION =
  "taskmap-gemini-meet-adapter-result.v1" as const;
export const TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION =
  "taskmap-gemini-meet-adapter-failure.v1" as const;
export const TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION =
  "taskmap-gemini-meet-empty-observation.v1" as const;

export const TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1 = Object.freeze({
  maxDocuments: 64,
  maxArrayLength: 256,
  maxObjectKeys: 16,
  maxDepth: 8,
  maxNodes: 4_096,
  maxStringBytes: 2_048,
  maxProviderResponseBytes: 256 * 1_024,
} as const);

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._#-]{0,511}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;

const ADAPTER_PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  emailBodiesStored: false,
  participantDetailsStored: false,
  credentialsStored: false,
  rawProviderResponsesStored: false,
  localPathsStored: false,
});

const DRIVE_LIST_KEYS = new Set(["documents"]);
const DRIVE_REF_KEYS = new Set(["documentId", "revisionId"]);
const DRIVE_READ_KEYS = new Set(["document"]);
const DRIVE_DOCUMENT_KEYS = new Set([
  "documentId",
  "revisionId",
  "eventTime",
  "contentDigest",
  "quality",
  "meetingIdentity",
]);
const MEETING_IDENTITY_KEYS = new Set([
  "fingerprintVersion",
  "startAt",
  "endAt",
  "calendarEventIdDigest",
  "normalizedTitleDigest",
  "participantSetDigest",
]);
const BINDING_KEYS = new Set([
  "connectionId",
  "sourceKind",
  "tenantOrWorkspaceDigest",
  "accountOrPrincipalDigest",
  "grantVersion",
]);

export interface TaskMapGeminiMeetDriveDocumentRefV1 {
  documentId: string;
  revisionId: string;
}

export interface TaskMapGeminiMeetDriveListResponseV1 {
  documents: TaskMapGeminiMeetDriveDocumentRefV1[];
}

export interface TaskMapGeminiMeetDriveDocumentMetadataV1 {
  documentId: string;
  revisionId: string;
  eventTime: string;
  contentDigest: string;
  quality: "structured_generated" | "degraded_summary";
  meetingIdentity: TaskMapMeetingIdentityHintV1;
}

export interface TaskMapGeminiMeetDriveReadResponseV1 {
  document: TaskMapGeminiMeetDriveDocumentMetadataV1;
}

export interface TaskMapGeminiMeetDriveListRequestV1 {
  limit: number;
}

export interface TaskMapGeminiMeetDriveReadRequestV1 {
  documentId: string;
  revisionId: string;
}

export interface TaskMapGeminiMeetDriveProviderV1 {
  listCurrentMeetingDocumentRefs(
    request: Readonly<TaskMapGeminiMeetDriveListRequestV1>,
  ): Promise<unknown>;
  readMeetingDocumentMetadata(
    request: Readonly<TaskMapGeminiMeetDriveReadRequestV1>,
  ): Promise<unknown>;
}

export interface TaskMapGeminiMeetPreviousServingInputV1 {
  checkpoint: TaskMapConnectorCheckpointV1;
  sourceSliceProof: TaskMapRefreshRunSourceSliceProofV1;
}

export interface TaskMapGeminiMeetAdapterInputV1 {
  ownerScopeDigest: string;
  attemptedAt: string;
  driveBinding: TaskMapSourceAuthorityBindingV1;
  driveProvider: TaskMapGeminiMeetDriveProviderV1;
  previous?: TaskMapGeminiMeetPreviousServingInputV1;
  previousCanonicalMeetings?: readonly TaskMapCanonicalMeetingV1[];
}

export type TaskMapGeminiMeetAdapterFailureCode =
  | "drive_list_unavailable"
  | "drive_list_malformed"
  | "drive_list_proxy"
  | "drive_list_limit"
  | "drive_list_incomplete"
  | "drive_document_unavailable"
  | "drive_document_malformed"
  | "drive_document_proxy"
  | "drive_document_limit";

export interface TaskMapGeminiMeetAdapterFailureV1 {
  contractVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION;
  failureId: string;
  provider: "drive";
  sourceObjectKeyDigest: string;
  code: TaskMapGeminiMeetAdapterFailureCode;
  detailDigest: string;
  retryable: true;
  blockingForServing: boolean;
}

export interface TaskMapGeminiMeetEmptyObservationV1 {
  contractVersion: typeof TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION;
  observationId: string;
  observationDigest: string;
  ownerScopeDigest: string;
  bindingDigest: string;
  adapterVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_VERSION;
  attemptedAt: string;
  authoritativeDocumentCount: 0;
  disposition: "retained_last_good" | "non_serving";
  priorCheckpointDigest?: string;
  retainedSourceSliceDigest?: string;
  privacy: typeof ADAPTER_PRIVACY;
}

export interface TaskMapGeminiMeetRefreshInputsV1 {
  sourceBinding: TaskMapRefreshSourceBindingV1;
  sourceRevisions: TaskMapRefreshSourceRevisionV1[];
  sourceRevisionSet: TaskMapRefreshSourceRevisionSetV1;
  sourceSliceProof: TaskMapRefreshRunSourceSliceProofV1;
  checkpointDigest: string;
  servingDisposition:
    | "current_source"
    | "retained_last_good"
    | "non_serving";
  semanticInputDigest?: string;
  emptyObservationDigest?: string;
}

export interface TaskMapGeminiMeetAdapterResultV1 {
  contractVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION;
  adapterVersion: typeof TASKMAP_GEMINI_MEET_ADAPTER_VERSION;
  state:
    | "success"
    | "partial"
    | "failed"
    | "empty_requires_review"
    | "incomplete_requires_review";
  isExactNoOp: boolean;
  envelopes: TaskMapSourceEnvelopeV1[];
  discoveryPointers: TaskMapDiscoveryPointerV1[];
  canonicalMeetings: TaskMapCanonicalMeetingV1[];
  sourceSnapshot?: TaskMapSourceSnapshotV1;
  emptyObservation?: TaskMapGeminiMeetEmptyObservationV1;
  checkpoint: TaskMapConnectorCheckpointV1;
  failures: TaskMapGeminiMeetAdapterFailureV1[];
  refreshInputs: TaskMapGeminiMeetRefreshInputsV1;
  privacy: typeof ADAPTER_PRIVACY;
}

type ProviderFailureCategory =
  | "unavailable"
  | "malformed"
  | "proxy"
  | "limit"
  | "incomplete";
type ProviderFailureStage =
  | "drive_list"
  | "drive_document";

class ProviderResponseError extends Error {
  constructor(readonly category: Exclude<ProviderFailureCategory, "unavailable">) {
    super(category);
  }
}

type JsonPreflightState = {
  nodes: number;
  bytes: number;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertOpaque(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SAFE_OPAQUE.test(value)) {
    throw new ProviderResponseError("malformed");
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be strict RFC3339`);
  }
  const match = STRICT_RFC3339.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be strict RFC3339`);
  }
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    zone,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || Number(hourText) > 23
    || Number(minuteText) > 59
    || Number(secondText) > 59
    || (zone !== "Z"
      && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    throw new Error(`${label} must be a real RFC3339 instant`);
  }
}

function assertExactKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
  required: ReadonlySet<string>,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderResponseError("malformed");
  }
  const keys = Object.keys(value);
  if (
    keys.some((key) => !allowed.has(key))
    || [...required].some((key) => !Object.hasOwn(value, key))
  ) {
    throw new ProviderResponseError("malformed");
  }
}

function preflightProviderJson(
  value: unknown,
  state: JsonPreflightState,
  depth = 0,
): void {
  state.nodes += 1;
  if (
    state.nodes > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxNodes
    || depth > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDepth
  ) {
    throw new ProviderResponseError("limit");
  }
  const charge = (bytes: number): void => {
    state.bytes += bytes;
    if (
      state.bytes
      > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxProviderResponseBytes
    ) {
      throw new ProviderResponseError("limit");
    }
  };
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new ProviderResponseError("malformed");
    }
    charge(Buffer.byteLength(String(value), "utf8"));
    return;
  }
  if (typeof value === "string") {
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxStringBytes) {
      throw new ProviderResponseError("limit");
    }
    charge(bytes + 2);
    return;
  }
  if (!value || typeof value !== "object") {
    throw new ProviderResponseError("malformed");
  }
  if (nodeUtilTypes.isProxy(value)) {
    throw new ProviderResponseError("proxy");
  }
  if (Array.isArray(value)) {
    if (GET_PROTOTYPE_OF(value) !== Array.prototype) {
      throw new ProviderResponseError("malformed");
    }
    if (
      value.length > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxArrayLength
    ) {
      throw new ProviderResponseError("limit");
    }
    const ownKeys = REFLECT_OWN_KEYS(value);
    if (ownKeys.length !== value.length + 1) {
      throw new ProviderResponseError("malformed");
    }
    for (const key of ownKeys) {
      if (
        typeof key !== "string"
        || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key))
      ) {
        throw new ProviderResponseError("malformed");
      }
      const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (
        descriptor === undefined
        || !("value" in descriptor)
        || descriptor.get !== undefined
        || descriptor.set !== undefined
        || (key !== "length" && !descriptor.enumerable)
      ) {
        throw new ProviderResponseError("malformed");
      }
      if (key !== "length") {
        preflightProviderJson(descriptor.value, state, depth + 1);
      }
    }
    charge(2 + Math.max(0, value.length - 1));
    return;
  }
  const prototype = GET_PROTOTYPE_OF(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ProviderResponseError("malformed");
  }
  const ownKeys = REFLECT_OWN_KEYS(value);
  if (
    ownKeys.length > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxObjectKeys
  ) {
    throw new ProviderResponseError("limit");
  }
  charge(2 + Math.max(0, ownKeys.length - 1));
  for (const key of ownKeys) {
    if (typeof key !== "string") {
      throw new ProviderResponseError("malformed");
    }
    if (
      Buffer.byteLength(key, "utf8")
      > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxStringBytes
    ) {
      throw new ProviderResponseError("limit");
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      throw new ProviderResponseError("malformed");
    }
    charge(Buffer.byteLength(key, "utf8") + 3);
    preflightProviderJson(descriptor.value, state, depth + 1);
  }
}

function clonePreflightedJson(value: unknown): unknown {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((_, index) => clonePreflightedJson(
      GET_OWN_PROPERTY_DESCRIPTOR(value, String(index))!.value,
    ));
  }
  const cloned: Record<string, unknown> = {};
  for (const key of REFLECT_OWN_KEYS(value as object)) {
    const stringKey = key as string;
    cloned[stringKey] = clonePreflightedJson(
      GET_OWN_PROPERTY_DESCRIPTOR(value as object, stringKey)!.value,
    );
  }
  return cloned;
}

function snapshotProviderJson(value: unknown): unknown {
  preflightProviderJson(value, { nodes: 0, bytes: 0 });
  return deepFreeze(clonePreflightedJson(value));
}

function normalizeDriveList(
  value: unknown,
): {
  refs: TaskMapGeminiMeetDriveDocumentRefV1[];
  failures: Array<{ documentId: string }>;
  fullPage: boolean;
} {
  const snapshot = snapshotProviderJson(value);
  assertExactKeys(snapshot, DRIVE_LIST_KEYS, DRIVE_LIST_KEYS);
  if (!Array.isArray(snapshot.documents)) {
    throw new ProviderResponseError("malformed");
  }
  if (
    snapshot.documents.length
    > TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments
  ) {
    throw new ProviderResponseError("limit");
  }
  const revisionsByDocument = new Map<string, Set<string>>();
  for (const item of snapshot.documents) {
    assertExactKeys(item, DRIVE_REF_KEYS, DRIVE_REF_KEYS);
    assertOpaque(item.documentId, "documentId");
    assertOpaque(item.revisionId, "revisionId");
    const revisions = revisionsByDocument.get(item.documentId) ?? new Set();
    revisions.add(item.revisionId);
    revisionsByDocument.set(item.documentId, revisions);
  }
  const refs: TaskMapGeminiMeetDriveDocumentRefV1[] = [];
  const failures: Array<{ documentId: string }> = [];
  for (const [documentId, revisions] of revisionsByDocument) {
    if (revisions.size !== 1) {
      failures.push({ documentId });
      continue;
    }
    refs.push({ documentId, revisionId: [...revisions][0] });
  }
  refs.sort((left, right) => (
    compareText(left.documentId, right.documentId)
    || compareText(left.revisionId, right.revisionId)
  ));
  failures.sort((left, right) => compareText(
    left.documentId,
    right.documentId,
  ));
  return {
    refs,
    failures,
    fullPage: snapshot.documents.length
      === TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
  };
}

function normalizeDriveDocument(
  value: unknown,
  expected: TaskMapGeminiMeetDriveDocumentRefV1,
): TaskMapGeminiMeetDriveDocumentMetadataV1 {
  const snapshot = snapshotProviderJson(value);
  assertExactKeys(snapshot, DRIVE_READ_KEYS, DRIVE_READ_KEYS);
  assertExactKeys(snapshot.document, DRIVE_DOCUMENT_KEYS, DRIVE_DOCUMENT_KEYS);
  const document = snapshot.document;
  assertOpaque(document.documentId, "documentId");
  assertOpaque(document.revisionId, "revisionId");
  if (
    document.documentId !== expected.documentId
    || document.revisionId !== expected.revisionId
  ) {
    throw new ProviderResponseError("malformed");
  }
  if (
    document.quality !== "structured_generated"
    && document.quality !== "degraded_summary"
  ) {
    throw new ProviderResponseError("malformed");
  }
  assertExactKeys(
    document.meetingIdentity,
    MEETING_IDENTITY_KEYS,
    new Set([
      "fingerprintVersion",
      "startAt",
      "normalizedTitleDigest",
      "participantSetDigest",
    ]),
  );
  return document as unknown as TaskMapGeminiMeetDriveDocumentMetadataV1;
}

function validateBinding(
  value: TaskMapSourceAuthorityBindingV1,
  sourceKind: "gemini_meet",
): TaskMapSourceAuthorityBindingV1 {
  const snapshot = snapshotProviderJson(value);
  assertExactKeys(snapshot, BINDING_KEYS, BINDING_KEYS);
  const binding = snapshot as unknown as TaskMapSourceAuthorityBindingV1;
  if (binding.sourceKind !== sourceKind) {
    throw new Error(`binding must authorize ${sourceKind}`);
  }
  if (
    typeof binding.connectionId !== "string"
    || !SAFE_OPAQUE.test(binding.connectionId)
    || typeof binding.grantVersion !== "string"
    || !SAFE_OPAQUE.test(binding.grantVersion)
  ) {
    throw new Error("binding contains an invalid opaque identifier");
  }
  assertDigest(
    binding.tenantOrWorkspaceDigest,
    "tenantOrWorkspaceDigest",
  );
  assertDigest(
    binding.accountOrPrincipalDigest,
    "accountOrPrincipalDigest",
  );
  return deepFreeze(binding);
}

function sourceObjectKeyDigest(
  ownerScopeDigest: string,
  binding: TaskMapSourceAuthorityBindingV1,
  documentId?: string,
): string {
  if (documentId === undefined) {
    return taskMapContractDigest({
      ownerScopeDigest,
      binding,
      sourceKind: "gemini_meet",
    });
  }
  return taskMapContractDigest({
    ownerScopeDigest,
    connectionId: binding.connectionId,
    tenantOrWorkspaceDigest: binding.tenantOrWorkspaceDigest,
    accountOrPrincipalDigest: binding.accountOrPrincipalDigest,
    sourceKind: "gemini_meet",
    objectType: "meeting_note",
    sourceObjectId: documentId,
  });
}

function failureCategory(error: unknown): ProviderFailureCategory {
  if (error instanceof ProviderResponseError) return error.category;
  return "unavailable";
}

function failureCode(
  stage: ProviderFailureStage,
  category: ProviderFailureCategory,
): TaskMapGeminiMeetAdapterFailureCode {
  return `${stage}_${category}` as TaskMapGeminiMeetAdapterFailureCode;
}

function buildFailure(
  stage: ProviderFailureStage,
  error: unknown,
  sourceKeyDigest: string,
  blockingForServing: boolean,
): TaskMapGeminiMeetAdapterFailureV1 {
  const category = failureCategory(error);
  const code = failureCode(stage, category);
  const detailDigest = taskMapContractDigest({
    adapterVersion: TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
    stage,
    category,
    sourceObjectKeyDigest: sourceKeyDigest,
  });
  return deepFreeze({
    contractVersion: TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION,
    failureId: `tmgeminifailure_${taskMapContractDigest({
      code,
      detailDigest,
      sourceObjectKeyDigest: sourceKeyDigest,
    }).slice(0, 16)}`,
    provider: "drive",
    sourceObjectKeyDigest: sourceKeyDigest,
    code,
    detailDigest,
    retryable: true,
    blockingForServing,
  });
}

function normalizePrevious(
  previous: TaskMapGeminiMeetPreviousServingInputV1 | undefined,
  ownerScopeDigest: string,
  driveBinding: TaskMapSourceAuthorityBindingV1,
): TaskMapGeminiMeetPreviousServingInputV1 | undefined {
  if (!previous) return undefined;
  const checkpoint = assertTaskMapConnectorCheckpoint(previous.checkpoint);
  const sourceSliceProof = assertTaskMapRefreshRunSourceSliceProof(
    previous.sourceSliceProof,
  );
  const bindingDigest = taskMapContractDigest(driveBinding);
  if (
    checkpoint.sourceKind !== "gemini_meet"
    || checkpoint.adapterVersion !== TASKMAP_GEMINI_MEET_ADAPTER_VERSION
    || taskMapContractCanonicalJson(checkpoint.binding)
      !== taskMapContractCanonicalJson(driveBinding)
    || sourceSliceProof.ownerScopeDigest !== ownerScopeDigest
    || sourceSliceProof.bindingDigest !== bindingDigest
    || taskMapContractCanonicalJson(
      sourceSliceProof.acceptedSourceIdentityDigests,
    ) !== taskMapContractCanonicalJson(
      checkpoint.acceptedSourceIdentityDigests,
    )
  ) {
    throw new Error(
      "previous Gemini checkpoint and source slice must share one owner, binding, adapter, and accepted identity set",
    );
  }
  if (
    (checkpoint.watermark === undefined
      && sourceSliceProof.sliceRole !== "observed_non_serving")
    || (checkpoint.watermark !== undefined
      && sourceSliceProof.sliceRole !== "serving")
  ) {
    throw new Error(
      "previous Gemini checkpoint and source slice have inconsistent serving state",
    );
  }
  return deepFreeze({ checkpoint, sourceSliceProof });
}

function currentSourceRevisions(
  bindingDigest: string,
  envelopes: readonly TaskMapSourceEnvelopeV1[],
): TaskMapRefreshSourceRevisionV1[] {
  return envelopes.map((envelope) => ({
    bindingDigest,
    sourceIdentityDigest: envelope.sourceIdentityDigest,
    sourceRevisionDigest: taskMapContractDigest(envelope.sourceRevision),
    contentDigest: envelope.contentDigest,
  })).sort((left, right) => (
    compareText(left.bindingDigest, right.bindingDigest)
    || compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
    || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
    || compareText(left.contentDigest, right.contentDigest)
  ));
}

function uniqueFailures(
  failures: readonly TaskMapGeminiMeetAdapterFailureV1[],
): TaskMapGeminiMeetAdapterFailureV1[] {
  const byId = new Map<string, TaskMapGeminiMeetAdapterFailureV1>();
  for (const failure of failures) byId.set(failure.failureId, failure);
  return [...byId.values()].sort((left, right) => compareText(
    left.failureId,
    right.failureId,
  ));
}

interface TaskMapGeminiMeetAdapterInputSnapshot {
  ownerScopeDigest: string;
  attemptedAt: string;
  driveBinding: TaskMapSourceAuthorityBindingV1;
  listDriveDocumentRefs: (
    request: Readonly<TaskMapGeminiMeetDriveListRequestV1>,
  ) => Promise<unknown>;
  readDriveDocument: (
    request: Readonly<TaskMapGeminiMeetDriveReadRequestV1>,
  ) => Promise<unknown>;
  previous?: TaskMapGeminiMeetPreviousServingInputV1;
  previousCanonicalMeetings: TaskMapCanonicalMeetingV1[];
}

function bindDriveListProvider(
  provider: TaskMapGeminiMeetDriveProviderV1,
): TaskMapGeminiMeetAdapterInputSnapshot["listDriveDocumentRefs"] {
  if (nodeUtilTypes.isProxy(provider)) {
    throw new Error("Drive provider must not be proxy-backed");
  }
  const method = provider.listCurrentMeetingDocumentRefs;
  if (typeof method !== "function") {
    throw new Error("Drive provider list method is required");
  }
  return method.bind(provider);
}

function bindDriveReadProvider(
  provider: TaskMapGeminiMeetDriveProviderV1,
): TaskMapGeminiMeetAdapterInputSnapshot["readDriveDocument"] {
  if (nodeUtilTypes.isProxy(provider)) {
    throw new Error("Drive provider must not be proxy-backed");
  }
  const method = provider.readMeetingDocumentMetadata;
  if (typeof method !== "function") {
    throw new Error("Drive provider read method is required");
  }
  return method.bind(provider);
}

function snapshotAdapterInput(
  input: TaskMapGeminiMeetAdapterInputV1,
): TaskMapGeminiMeetAdapterInputSnapshot {
  if (nodeUtilTypes.isProxy(input)) {
    throw new Error("Gemini adapter input must not be proxy-backed");
  }
  const ownerScopeDigest = input.ownerScopeDigest;
  const attemptedAt = input.attemptedAt;
  const driveBinding = validateBinding(
    input.driveBinding,
    "gemini_meet",
  );
  const driveProvider = input.driveProvider;
  const listDriveDocumentRefs = bindDriveListProvider(driveProvider);
  const readDriveDocument = bindDriveReadProvider(driveProvider);
  const previous = normalizePrevious(
    input.previous,
    ownerScopeDigest,
    driveBinding,
  );
  const previousCanonicalMeetings =
    input.previousCanonicalMeetings === undefined
      ? []
      : snapshotProviderJson(
          input.previousCanonicalMeetings,
        ) as TaskMapCanonicalMeetingV1[];
  assertDigest(ownerScopeDigest, "ownerScopeDigest");
  assertTimestamp(attemptedAt, "attemptedAt");
  return Object.freeze({
    ownerScopeDigest,
    attemptedAt,
    driveBinding,
    listDriveDocumentRefs,
    readDriveDocument,
    ...(previous === undefined ? {} : { previous }),
    previousCanonicalMeetings,
  });
}

function buildEmptyObservation(
  snapshot: TaskMapGeminiMeetAdapterInputSnapshot,
  bindingDigest: string,
): TaskMapGeminiMeetEmptyObservationV1 {
  const retainsLastGood = (
    snapshot.previous?.sourceSliceProof.sliceRole === "serving"
  );
  const disposition = retainsLastGood
    ? "retained_last_good" as const
    : "non_serving" as const;
  const core = {
    contractVersion: TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION,
    ownerScopeDigest: snapshot.ownerScopeDigest,
    bindingDigest,
    adapterVersion: TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
    attemptedAt: snapshot.attemptedAt,
    authoritativeDocumentCount: 0 as const,
    disposition,
    ...(snapshot.previous === undefined
      ? {}
      : {
          priorCheckpointDigest: taskMapContractDigest(
            snapshot.previous.checkpoint,
          ),
        }),
    ...(retainsLastGood
      ? {
          retainedSourceSliceDigest:
            snapshot.previous!.sourceSliceProof.sourceSliceDigest,
        }
      : {}),
    privacy: { ...ADAPTER_PRIVACY },
  };
  const observationDigest = taskMapContractDigest(core);
  return deepFreeze({
    ...core,
    observationId: `tmgeminiempty_${observationDigest}`,
    observationDigest,
  });
}

export async function readTaskMapGeminiMeetAdapter(
  input: TaskMapGeminiMeetAdapterInputV1,
): Promise<TaskMapGeminiMeetAdapterResultV1> {
  const snapshot = snapshotAdapterInput(input);
  const {
    ownerScopeDigest,
    attemptedAt,
    driveBinding,
    listDriveDocumentRefs,
    readDriveDocument,
    previous,
    previousCanonicalMeetings,
  } = snapshot;
  const bindingDigest = taskMapContractDigest(driveBinding);
  const failures: TaskMapGeminiMeetAdapterFailureV1[] = [];
  let refs: TaskMapGeminiMeetDriveDocumentRefV1[] = [];
  let listFailed = false;
  let drivePageIncomplete = false;

  try {
    const response = await listDriveDocumentRefs(
      deepFreeze({
        limit: TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
      }),
    );
    const normalized = normalizeDriveList(response);
    refs = normalized.refs;
    drivePageIncomplete = normalized.fullPage;
    if (drivePageIncomplete) {
      failures.push(buildFailure(
        "drive_list",
        new ProviderResponseError("incomplete"),
        sourceObjectKeyDigest(ownerScopeDigest, driveBinding),
        true,
      ));
    }
    for (const duplicate of normalized.failures) {
      failures.push(buildFailure(
        "drive_document",
        new ProviderResponseError("malformed"),
        sourceObjectKeyDigest(
          ownerScopeDigest,
          driveBinding,
          duplicate.documentId,
        ),
        true,
      ));
    }
  } catch (error) {
    listFailed = true;
    failures.push(buildFailure(
      "drive_list",
      error,
      sourceObjectKeyDigest(ownerScopeDigest, driveBinding),
      true,
    ));
  }

  const documents: TaskMapGeminiMeetDriveDocumentMetadataV1[] = [];
  if (!listFailed) {
    for (const ref of refs) {
      try {
        const response = await readDriveDocument(
          deepFreeze({ ...ref }),
        );
        documents.push(normalizeDriveDocument(response, ref));
      } catch (error) {
        failures.push(buildFailure(
          "drive_document",
          error,
          sourceObjectKeyDigest(
            ownerScopeDigest,
            driveBinding,
            ref.documentId,
          ),
          true,
        ));
      }
    }
  }

  const envelopes: TaskMapSourceEnvelopeV1[] = [];
  const discoveryPointers: TaskMapDiscoveryPointerV1[] = [];
  for (const document of documents.sort((left, right) => (
    compareText(left.documentId, right.documentId)
  ))) {
    let baseEnvelope: TaskMapSourceEnvelopeV1;
    try {
      baseEnvelope = buildGeminiMeetSource({
        ownerScopeDigest,
        binding: driveBinding,
        documentId: document.documentId,
        revisionId: document.revisionId,
        eventTime: document.eventTime,
        contentDigest: document.contentDigest,
        quality: document.quality,
        meetingIdentity: document.meetingIdentity,
        gmailDiscoveries: [],
      }).envelope;
    } catch (error) {
      failures.push(buildFailure(
        "drive_document",
        error instanceof ProviderResponseError
          ? error
          : new ProviderResponseError("malformed"),
        sourceObjectKeyDigest(
          ownerScopeDigest,
          driveBinding,
          document.documentId,
        ),
        true,
      ));
      continue;
    }
    envelopes.push(baseEnvelope);
  }
  envelopes.sort((left, right) => compareText(
    left.envelopeId,
    right.envelopeId,
  ));
  discoveryPointers.sort((left, right) => compareText(
    left.discoveryId,
    right.discoveryId,
  ));

  const normalizedFailures = uniqueFailures(failures);
  const blockingFailures = normalizedFailures.filter(
    (failure) => failure.blockingForServing,
  );
  const authoritativeEmpty = (
    !listFailed
    && refs.length === 0
    && blockingFailures.length === 0
  );
  const state = authoritativeEmpty
    ? "empty_requires_review" as const
    : drivePageIncomplete
      ? "incomplete_requires_review" as const
      : blockingFailures.length === 0
        ? "success" as const
        : envelopes.length === 0
          ? "failed" as const
          : "partial" as const;
  const checkpointState = (
    state === "empty_requires_review"
    || state === "incomplete_requires_review"
  )
    ? "partial" as const
    : state;
  const emptyObservation = authoritativeEmpty
    ? buildEmptyObservation(snapshot, bindingDigest)
    : undefined;
  const acceptedSourceIdentityDigests = envelopes
    .map((envelope) => envelope.sourceIdentityDigest)
    .sort(compareText);
  const proposedWatermark = state === "success"
    ? {
        kind: "composite" as const,
        valueDigest: taskMapContractDigest(envelopes.map((envelope) => ({
          envelopeId: envelope.envelopeId,
          sourceIdentityDigest: envelope.sourceIdentityDigest,
        }))),
        observedThrough: attemptedAt,
      }
    : undefined;
  const checkpoint = advanceTaskMapConnectorCheckpoint(
    previous?.checkpoint ?? null,
    {
      binding: driveBinding,
      sourceKind: "gemini_meet",
      adapterVersion: TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
      capabilities: ["read_context", "deep_link"],
      state: checkpointState,
      attemptedAt,
      ...(proposedWatermark === undefined
        ? {}
        : {
            proposedWatermark,
            acceptedSourceIdentityDigests,
          }),
      ...(state === "success"
        ? {}
        : {
            errorCode: (
              state === "partial"
              || state === "empty_requires_review"
              || state === "incomplete_requires_review"
            )
              ? "provider_partial_result"
              : "provider_unavailable",
            errorDetailDigest: emptyObservation?.observationDigest
              ?? taskMapContractDigest(blockingFailures),
          }),
    },
  );

  const currentRevisions = currentSourceRevisions(
    bindingDigest,
    envelopes,
  );
  const currentSourceSlice = state === "success"
    ? buildTaskMapRefreshRunSourceSliceProof({
        sliceRole: "serving",
        ownerScopeDigest,
        bindingDigest,
        sourceRevisions: currentRevisions,
        acceptedSourceIdentityDigests,
      })
    : previous?.sourceSliceProof
      ?? buildTaskMapRefreshRunSourceSliceProof({
        sliceRole: "observed_non_serving",
        ownerScopeDigest,
        bindingDigest,
        sourceRevisions: [],
        acceptedSourceIdentityDigests: [],
      });
  const sourceBinding: TaskMapRefreshSourceBindingV1 = deepFreeze({
    bindingDigest,
    sourceKind: "gemini_meet",
    sourceContractVersion: TASKMAP_SOURCE_ENVELOPE_VERSION,
    adapterVersion: TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
  });
  const sourceRevisionSet: TaskMapRefreshSourceRevisionSetV1 = deepFreeze({
    bindingDigest,
    revisionSetDigest: currentSourceSlice.sourceRevisionSetDigest,
  });
  const canonicalMeetings = envelopes.length === 0
    ? []
    : canonicalizeTaskMapMeetings(
        envelopes,
        previousCanonicalMeetings,
      );
  const sourceSnapshot = state === "success" && envelopes.length > 0
    ? buildTaskMapSourceSnapshot(
        envelopes,
        discoveryPointers,
        previousCanonicalMeetings,
      )
    : undefined;
  const isExactNoOp = Boolean(
    state === "success"
    && previous?.checkpoint.watermark
    && previous.checkpoint.watermark.valueDigest
      === proposedWatermark?.valueDigest
    && previous.sourceSliceProof.sourceSliceDigest
      === currentSourceSlice.sourceSliceDigest,
  );
  const servingDisposition = state === "success"
    ? "current_source" as const
    : currentSourceSlice.sliceRole === "serving"
      ? "retained_last_good" as const
      : "non_serving" as const;
  const refreshInputs: TaskMapGeminiMeetRefreshInputsV1 = deepFreeze({
    sourceBinding,
    sourceRevisions: currentSourceSlice.sourceRevisions,
    sourceRevisionSet,
    sourceSliceProof: currentSourceSlice,
    checkpointDigest: taskMapContractDigest(checkpoint),
    servingDisposition,
    ...(sourceSnapshot === undefined
      ? {}
      : { semanticInputDigest: sourceSnapshot.semanticInputDigest }),
    ...(emptyObservation === undefined
      ? {}
      : { emptyObservationDigest: emptyObservation.observationDigest }),
  });
  return deepFreeze({
    contractVersion: TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION,
    adapterVersion: TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
    state,
    isExactNoOp,
    envelopes,
    discoveryPointers,
    canonicalMeetings,
    ...(sourceSnapshot === undefined ? {} : { sourceSnapshot }),
    ...(emptyObservation === undefined ? {} : { emptyObservation }),
    checkpoint,
    failures: normalizedFailures,
    refreshInputs,
    privacy: { ...ADAPTER_PRIVACY },
  });
}
