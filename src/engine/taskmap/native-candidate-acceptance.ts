import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  buildTaskMapAgentSessionCandidateReview,
} from "./agent-session-candidate-adapter.js";
import type {
  TaskMapAgentSessionSemanticAdmissionV2,
} from "./agent-session-semantic-admission.js";
import type {
  TaskMapAgentSessionExtractionReportV1,
} from "./agent-session-refresh-llm-replay.js";
import {
  buildTaskMapCalendarCandidateReview,
} from "./calendar-candidate-adapter.js";
import type {
  TaskMapCalendarProducerResultV1,
} from "./calendar-producer-freshness.js";
import type {
  TaskMapCalendarExtractionReportV1,
} from "./calendar-refresh-llm-replay.js";
import {
  applyTaskMapNativeCandidateReviewToProofRows,
  buildTaskMapNativeCandidateReview,
  buildTaskMapNativeCandidateShelf,
  resolveTaskMapNativeCandidateProof,
  taskMapNativeCandidateId,
  taskMapNativeCandidateRevisionDigest,
  withTaskMapNativeCandidateReviewTransaction,
  type TaskMapNativeCandidateReviewV1,
  type TaskMapNativeCandidateShelfRowV1,
} from "./native-candidate-review.js";
import {
  buildTaskMapUnifiedMeetingCandidateContext,
  type VerifiedTaskMapGranolaExtractionReportV1,
} from "./meeting-refresh-llm-replay.js";
import { isTaskMapMentionDisplayTextSafe } from "./mention-extraction.js";
import type { TaskMapMeetingProducerResultV1 } from "./meeting-producer-freshness.js";
import { toWellFormedText } from "./text-contract.js";
import type {
  TaskMapNativeSemanticBuilderInputV1,
  TaskMapNativeSemanticEvidenceBindingV1,
  TaskMapNativeSemanticSourceBindingV1,
} from "./native-semantic-builder-adapter.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapEvent,
  type TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION =
  "taskmap-native-candidate-acceptance.v1" as const;
export const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION =
  "taskmap-native-candidate-acceptance-policy.1" as const;
export const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1 = Object.freeze({
  maxReceipts: 128,
  maxEvidenceProofsPerReceipt: 128,
  maxFileBytes: 2 * 1_024 * 1_024,
  maxTitleCharacters: 96,
  maxSummaryCharacters: 200,
} as const);

const PROMOTION_DIGEST_DOMAIN = "taskmap-native-candidate-promotion.1";
const EMPTY_HEAD_DIGEST_DOMAIN = "taskmap-native-candidate-promotion-empty-head.1";
const SHA256 = /^[a-f0-9]{64}$/;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const PROMOTION_ID = /^tmcandidatepromotion_[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const PATH_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const EMAIL_ADDRESS =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i;
const HTTP_URL = /(?:^|[^A-Za-z0-9_])https?:\/\/[^\s]+/i;
const CREDENTIAL_ASSIGNMENT =
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]{4,}/i;
const BEARER_SECRET =
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,.;)])/i;
const PROVIDER_TOKEN =
  /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b)/;
const JWT_SECRET =
  /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const LOCAL_FILE_URI =
  /(?:^|[^A-Za-z0-9_])file:\/\/\/[^\s]+/i;
const OWNER_LOCAL_ABSOLUTE_PATH =
  /(?:^|[^A-Za-z0-9_:/\\])(?:\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+|\\\\[^\\\s]+\\[^\s]+)/;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const FIXED_AUTHORITY = Object.freeze({
  sourceKind: "manual" as const,
  authority: "user" as const,
  syncMode: "personal_fork" as const,
  capabilities: ["read_task"] as const,
  recordKind: "authoritative_task" as const,
  lifecycle: "explicit_user_policy" as const,
  sourceStatus: "open" as const,
});

const PRIVACY = Object.freeze({
  boundedAcceptedDisplayTextStored: true as const,
  sourceBodiesStored: false as const,
  participantDetailsStored: false as const,
  rawUrlsStored: false as const,
  credentialsStored: false as const,
  localPathsStored: false as const,
  callerDisplayTextStored: false as const,
  sourceWritebackPerformed: false as const,
});

export interface TaskMapNativeCandidateAcceptedPayloadV1 {
  kind: "decision" | "action_item" | "commitment";
  title: string;
  summary: string;
  speechActClass: "request" | "commitment" | "decision" | "other";
  speechActActor: "self" | "other" | "unknown";
  mentionIdentityDigest: string;
  confidence: number;
  occurredAt: string;
  observedAt: string;
}

export interface TaskMapNativeCandidatePromotionReceiptV1 {
  promotionId: string;
  promotionDigest: string;
  previousReceiptDigest: string | null;
  ownerScopeDigest: string;
  candidateId: string;
  candidateRevisionDigest: string;
  statementReferenceDigest: string;
  evidenceProofDigests: string[];
  idempotencyKeyDigest: string;
  confirmedAt: string;
  accepted: TaskMapNativeCandidateAcceptedPayloadV1;
  authority: {
    sourceKind: "manual";
    authority: "user";
    syncMode: "personal_fork";
    capabilities: readonly ["read_task"];
    recordKind: "authoritative_task";
    lifecycle: "explicit_user_policy";
    sourceStatus: "open";
  };
  sourceWritebackAttempted: false;
}

export interface TaskMapNativeCandidateAcceptanceStoreV1 {
  contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION;
  policyVersion: typeof TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION;
  ownerScopeDigest: string;
  headReceiptDigest: string;
  receipts: TaskMapNativeCandidatePromotionReceiptV1[];
  privacy: typeof PRIVACY;
}

export interface PromoteTaskMapNativeCandidateInputV1 {
  result: TaskMapMeetingProducerResultV1 | null;
  overlay: TaskMapNativeCandidateReviewV1 | null;
  previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
  candidateId: string;
  expectedCandidateRevisionDigest: string;
  expectedStatementReferenceDigest: string;
  expectedEvidenceProofDigests: readonly string[];
  idempotencyKeyDigest: string;
  confirmedAt: string;
}

export interface TaskMapNativeCandidatePromotionResultV1 {
  store: TaskMapNativeCandidateAcceptanceStoreV1;
  receipt: TaskMapNativeCandidatePromotionReceiptV1;
}

export interface PromoteTaskMapVerifiedMeetingCandidateInputV1 {
  result: TaskMapMeetingProducerResultV1 | null;
  overlay: TaskMapNativeCandidateReviewV1 | null;
  rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
  previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
  candidateId: string;
  expectedCandidateRevisionDigest: string;
  expectedStatementReferenceDigest: string;
  expectedEvidenceProofDigests: readonly string[];
  idempotencyKeyDigest: string;
  confirmedAt: string;
}

export interface PromoteTaskMapAgentSessionCandidateInputV2 {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  extraction: TaskMapAgentSessionExtractionReportV1;
  overlay: TaskMapNativeCandidateReviewV1 | null;
  previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
  expectedOwnerScopeDigest: string;
  expectedAcceptanceHeadDigest: string;
  assessedAt: string;
  candidateId: string;
  expectedCandidateRevisionDigest: string;
  expectedStatementReferenceDigest: string;
  expectedEvidenceProofDigests: readonly string[];
  idempotencyKeyDigest: string;
  confirmedAt: string;
}

export interface PromoteTaskMapCalendarCandidateInputV1 {
  result: TaskMapCalendarProducerResultV1;
  extraction: TaskMapCalendarExtractionReportV1;
  overlay: TaskMapNativeCandidateReviewV1 | null;
  previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
  expectedOwnerScopeDigest: string;
  expectedAcceptanceHeadDigest: string;
  assessedAt: string;
  candidateId: string;
  expectedCandidateRevisionDigest: string;
  expectedStatementReferenceDigest: string;
  expectedEvidenceProofDigests: readonly string[];
  idempotencyKeyDigest: string;
  confirmedAt: string;
}

export interface LoadTaskMapNativeCandidateAcceptanceStoreInputV1 {
  storePath: string;
  expectedOwnerScopeDigest: string;
  afterAuthenticatedReadForTesting?: (
    storePath: string,
  ) => void | Promise<void>;
}

export interface WriteTaskMapNativeCandidateAcceptanceStoreInputV1 {
  storePath: string;
  expectedOwnerScopeDigest: string;
  store: TaskMapNativeCandidateAcceptanceStoreV1;
}

function fail(message: string): never {
  throw new Error(`Task Map candidate acceptance: ${message}`);
}

function errnoCode(error: unknown): string | undefined {
  return error !== null
      && typeof error === "object"
      && "code" in error
      && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) fail(`${label} must be a plain object`);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (
    actual.length !== expected.size
    || actual.some((key) => !expected.has(key))
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) fail(`${label} has unsupported or missing fields`);
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a sha256 digest`);
  }
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length > 64
    || !STRICT_RFC3339.test(value)
    || !Number.isFinite(Date.parse(value))
  ) fail(`${label} must be an RFC3339 timestamp`);
  const canonical = new Date(Date.parse(value as string)).toISOString();
  if (canonical !== value) fail(`${label} must be canonical`);
  return canonical;
}

function assertBoundedText(
  value: unknown,
  maximum: number,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maximum
    || toWellFormedText(value) !== value
  ) fail(`${label} exceeds its bounded text contract`);
  if (value !== value.trim().replace(/\s+/gu, " ")) {
    fail(`${label} must use canonical display whitespace`);
  }
  if (!isTaskMapMentionDisplayTextSafe(value)) {
    fail(`${label} violates the canonical display-text safety contract`);
  }
  if (
    EMAIL_ADDRESS.test(value)
    || HTTP_URL.test(value)
    || CREDENTIAL_ASSIGNMENT.test(value)
    || BEARER_SECRET.test(value)
    || PROVIDER_TOKEN.test(value)
    || JWT_SECRET.test(value)
    || LOCAL_FILE_URI.test(value)
    || OWNER_LOCAL_ABSOLUTE_PATH.test(value)
  ) fail(`${label} violates the standalone privacy boundary`);
}

function assertSortedUniqueDigests(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length
      > TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1
        .maxEvidenceProofsPerReceipt
  ) fail(`${label} exceeds its bounded proof contract`);
  let prior: string | undefined;
  for (const [index, item] of value.entries()) {
    assertDigest(item, `${label}[${index}]`);
    if (prior !== undefined && prior >= item) {
      fail(`${label} must be sorted and unique`);
    }
    prior = item;
  }
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

function acceptedPayload(
  proof: TaskMapNativeCandidateShelfRowV1,
): TaskMapNativeCandidateAcceptedPayloadV1 {
  if (
    proof.speechActClass === undefined
    || proof.speechActActor === undefined
    || proof.mentionIdentityDigest === undefined
  ) fail("candidate lacks authenticated speech-act provenance");
  return {
    kind: proof.kind,
    title: proof.title,
    summary: proof.summary,
    speechActClass: proof.speechActClass,
    speechActActor: proof.speechActActor,
    mentionIdentityDigest: proof.mentionIdentityDigest,
    confidence: proof.confidence,
    occurredAt: proof.occurredAt,
    observedAt: proof.observedAt,
  };
}

function receiptBase(input: Omit<
  TaskMapNativeCandidatePromotionReceiptV1,
  "promotionId" | "promotionDigest"
>): TaskMapNativeCandidatePromotionReceiptV1 {
  const promotionDigest = taskMapContractDigest({
    domain: PROMOTION_DIGEST_DOMAIN,
    ...input,
  });
  return deepFreeze({
    promotionId: `tmcandidatepromotion_${promotionDigest}`,
    promotionDigest,
    ...input,
  });
}

function assertAcceptedPayload(
  value: unknown,
): asserts value is TaskMapNativeCandidateAcceptedPayloadV1 {
  assertPlainObject(value, "accepted payload");
  assertExactKeys(value, [
    "kind",
    "title",
    "summary",
    "speechActClass",
    "speechActActor",
    "mentionIdentityDigest",
    "confidence",
    "occurredAt",
    "observedAt",
  ], "accepted payload");
  if (!["decision", "action_item", "commitment"].includes(String(value.kind))) {
    fail("accepted payload kind is invalid");
  }
  assertBoundedText(
    value.title,
    TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxTitleCharacters,
    "accepted title",
  );
  assertBoundedText(
    value.summary,
    TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxSummaryCharacters,
    "accepted summary",
  );
  if (
    !["request", "commitment", "decision", "other"].includes(
      String(value.speechActClass),
    )
    || !["self", "other", "unknown"].includes(String(value.speechActActor))
  ) fail("accepted speech-act provenance is invalid");
  const expectedKind = value.speechActClass === "commitment"
    ? "commitment"
    : value.speechActClass === "decision"
      ? "decision"
      : "action_item";
  const promotionEligible = (
    value.speechActClass === "request"
    || value.speechActClass === "commitment"
  ) && value.speechActActor === "self";
  if (value.kind !== expectedKind || !promotionEligible) {
    fail("accepted speech-act payload is not promotion eligible");
  }
  assertDigest(value.mentionIdentityDigest, "accepted mention identity");
  if (
    typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence)
    || value.confidence < 0
    || value.confidence > 1
  ) fail("accepted confidence is invalid");
  const occurredAt = canonicalTimestamp(value.occurredAt, "accepted occurredAt");
  const observedAt = canonicalTimestamp(value.observedAt, "accepted observedAt");
  if (Date.parse(occurredAt) > Date.parse(observedAt)) {
    fail("accepted timestamp chronology is invalid");
  }
}

function assertReceipt(
  value: unknown,
  expectedOwnerScopeDigest: string,
  expectedPreviousReceiptDigest: string | null,
): asserts value is TaskMapNativeCandidatePromotionReceiptV1 {
  assertPlainObject(value, "promotion receipt");
  assertExactKeys(value, [
    "promotionId",
    "promotionDigest",
    "previousReceiptDigest",
    "ownerScopeDigest",
    "candidateId",
    "candidateRevisionDigest",
    "statementReferenceDigest",
    "evidenceProofDigests",
    "idempotencyKeyDigest",
    "confirmedAt",
    "accepted",
    "authority",
    "sourceWritebackAttempted",
  ], "promotion receipt");
  assertDigest(value.promotionDigest, "promotion digest");
  if (value.previousReceiptDigest !== null) {
    assertDigest(value.previousReceiptDigest, "previous receipt digest");
  }
  if (
    typeof value.promotionId !== "string"
    || !PROMOTION_ID.test(value.promotionId)
    || value.promotionId !== `tmcandidatepromotion_${value.promotionDigest}`
    || value.previousReceiptDigest !== expectedPreviousReceiptDigest
    || value.ownerScopeDigest !== expectedOwnerScopeDigest
    || typeof value.candidateId !== "string"
    || !CANDIDATE_ID.test(value.candidateId)
  ) fail("promotion receipt chain or identity is invalid");
  assertDigest(value.candidateRevisionDigest, "candidate revision");
  assertDigest(value.statementReferenceDigest, "statement reference");
  assertSortedUniqueDigests(value.evidenceProofDigests, "evidence proofs");
  if (
    value.candidateId !== taskMapNativeCandidateId(
      value.ownerScopeDigest as string,
      value.statementReferenceDigest as string,
    )
  ) fail("promotion candidate identity is inconsistent");
  if (
    value.candidateRevisionDigest !== taskMapNativeCandidateRevisionDigest(
      value.candidateId as string,
      value.evidenceProofDigests,
    )
  ) fail("promotion candidate revision is inconsistent");
  assertDigest(value.idempotencyKeyDigest, "idempotency key digest");
  canonicalTimestamp(value.confirmedAt, "confirmedAt");
  assertAcceptedPayload(value.accepted);
  assertPlainObject(value.authority, "promotion authority");
  assertExactKeys(value.authority, [
    "sourceKind",
    "authority",
    "syncMode",
    "capabilities",
    "recordKind",
    "lifecycle",
    "sourceStatus",
  ], "promotion authority");
  if (
    taskMapContractCanonicalJson(value.authority)
      !== taskMapContractCanonicalJson(FIXED_AUTHORITY)
    || value.sourceWritebackAttempted !== false
  ) fail("promotion authority policy is invalid");
  const receipt = value as unknown as TaskMapNativeCandidatePromotionReceiptV1;
  const expected = receiptBase({
    previousReceiptDigest: receipt.previousReceiptDigest,
    ownerScopeDigest: receipt.ownerScopeDigest,
    candidateId: receipt.candidateId,
    candidateRevisionDigest: receipt.candidateRevisionDigest,
    statementReferenceDigest: receipt.statementReferenceDigest,
    evidenceProofDigests: receipt.evidenceProofDigests,
    idempotencyKeyDigest: receipt.idempotencyKeyDigest,
    confirmedAt: receipt.confirmedAt,
    accepted: receipt.accepted,
    authority: receipt.authority,
    sourceWritebackAttempted: false,
  });
  if (expected.promotionDigest !== value.promotionDigest) {
    fail("promotion receipt digest or chain is inconsistent");
  }
}

export function assertTaskMapNativeCandidateAcceptanceStore(
  value: unknown,
): asserts value is TaskMapNativeCandidateAcceptanceStoreV1 {
  assertPlainObject(value, "candidate acceptance store");
  assertExactKeys(value, [
    "contractVersion",
    "policyVersion",
    "ownerScopeDigest",
    "headReceiptDigest",
    "receipts",
    "privacy",
  ], "candidate acceptance store");
  if (
    value.contractVersion !== TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION
    || value.policyVersion
      !== TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION
  ) fail("candidate acceptance version is invalid");
  assertDigest(value.ownerScopeDigest, "store owner scope");
  assertDigest(value.headReceiptDigest, "store head receipt");
  if (
    !Array.isArray(value.receipts)
    || value.receipts.length === 0
    || value.receipts.length
      > TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxReceipts
  ) fail("candidate acceptance receipts exceed their bounded limit");
  let previous: string | null = null;
  const idempotencyKeys = new Set<string>();
  const candidates = new Set<string>();
  for (const receipt of value.receipts) {
    assertReceipt(receipt, value.ownerScopeDigest, previous);
    if (idempotencyKeys.has(receipt.idempotencyKeyDigest)) {
      fail("duplicate idempotency key in promotion chain");
    }
    if (candidates.has(receipt.candidateId)) {
      fail("duplicate candidate in promotion chain");
    }
    idempotencyKeys.add(receipt.idempotencyKeyDigest);
    candidates.add(receipt.candidateId);
    previous = receipt.promotionDigest;
  }
  if (value.headReceiptDigest !== previous) {
    fail("candidate acceptance head digest is inconsistent");
  }
  assertPlainObject(value.privacy, "candidate acceptance privacy");
  if (
    taskMapContractCanonicalJson(value.privacy)
      !== taskMapContractCanonicalJson(PRIVACY)
  ) fail("candidate acceptance privacy contract is invalid");
  if (
    Buffer.byteLength(taskMapContractCanonicalJson(value), "utf8")
      > TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes
  ) fail("candidate acceptance store exceeds its byte limit");
}

function sameProof(
  receipt: TaskMapNativeCandidatePromotionReceiptV1,
  input: Pick<
    PromoteTaskMapNativeCandidateInputV1,
    | "expectedOwnerScopeDigest"
    | "candidateId"
    | "expectedCandidateRevisionDigest"
    | "expectedStatementReferenceDigest"
    | "expectedEvidenceProofDigests"
  >,
): boolean {
  return receipt.ownerScopeDigest === input.expectedOwnerScopeDigest
    && receipt.candidateId === input.candidateId
    && receipt.candidateRevisionDigest
      === input.expectedCandidateRevisionDigest
    && receipt.statementReferenceDigest
      === input.expectedStatementReferenceDigest
    && taskMapContractCanonicalJson(receipt.evidenceProofDigests)
      === taskMapContractCanonicalJson(input.expectedEvidenceProofDigests);
}

export function promoteTaskMapNativeCandidate(
  input: PromoteTaskMapNativeCandidateInputV1,
): TaskMapNativeCandidatePromotionResultV1 {
  assertPlainObject(input, "promotion input");
  assertExactKeys(input, [
    "result",
    "overlay",
    "previousStore",
    "expectedOwnerScopeDigest",
    "assessedAt",
    "candidateId",
    "expectedCandidateRevisionDigest",
    "expectedStatementReferenceDigest",
    "expectedEvidenceProofDigests",
    "idempotencyKeyDigest",
    "confirmedAt",
  ], "promotion input");
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
  assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
  assertSortedUniqueDigests(
    input.expectedEvidenceProofDigests,
    "expected evidence proofs",
  );
  assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
  canonicalTimestamp(input.confirmedAt, "confirmedAt");
  if (!CANDIDATE_ID.test(input.candidateId)) fail("candidate ID is invalid");
  if (input.previousStore !== null) {
    assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
    if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
      fail("promotion store belongs to another owner");
    }
    const keyed = input.previousStore.receipts.find((receipt) =>
      receipt.idempotencyKeyDigest === input.idempotencyKeyDigest
    );
    if (keyed !== undefined) {
      if (!sameProof(keyed, input)) fail("idempotency key conflicts with another proof");
      return deepFreeze({ store: input.previousStore, receipt: keyed });
    }
    if (input.previousStore.receipts.some((receipt) =>
      receipt.candidateId === input.candidateId
    )) fail("candidate was already promoted under a different key");
  }
  if (input.result === null || input.overlay === null) {
    fail("current authenticated candidate proof is unavailable");
  }
  const proof = resolveTaskMapNativeCandidateProof({
    result: input.result,
    overlay: input.overlay,
    expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    assessedAt: input.assessedAt,
    candidateId: input.candidateId,
  });
  if (!proof.promotionEligible) fail("candidate is not promotion eligible");
  if (
    proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
    || proof.statementReferenceDigest
      !== input.expectedStatementReferenceDigest
    || taskMapContractCanonicalJson(proof.evidenceProofDigests)
      !== taskMapContractCanonicalJson(input.expectedEvidenceProofDigests)
  ) fail("exact current candidate proof does not match confirmation");
  const previousReceiptDigest = input.previousStore?.headReceiptDigest ?? null;
  const receipt = receiptBase({
    previousReceiptDigest,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    candidateId: proof.candidateId,
    candidateRevisionDigest: proof.candidateRevisionDigest,
    statementReferenceDigest: proof.statementReferenceDigest,
    evidenceProofDigests: [...proof.evidenceProofDigests],
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    confirmedAt: input.confirmedAt,
    accepted: acceptedPayload(proof),
    authority: FIXED_AUTHORITY,
    sourceWritebackAttempted: false,
  });
  const store = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
    policyVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    headReceiptDigest: receipt.promotionDigest,
    receipts: [...(input.previousStore?.receipts ?? []), receipt],
    privacy: PRIVACY,
  };
  assertTaskMapNativeCandidateAcceptanceStore(store);
  return deepFreeze({ store, receipt });
}

/**
 * Re-resolves one ephemeral v2 agent proposal and appends the existing
 * byte-compatible v1 owner receipt. This grants only local manual-task
 * authority; it does not approve, export, route, select, or start an agent.
 */
export function promoteTaskMapAgentSessionCandidate(
  input: PromoteTaskMapAgentSessionCandidateInputV2,
): TaskMapNativeCandidatePromotionResultV1 {
  assertPlainObject(input, "agent candidate promotion input");
  assertExactKeys(input, [
    "admission",
    "extraction",
    "overlay",
    "previousStore",
    "expectedOwnerScopeDigest",
    "expectedAcceptanceHeadDigest",
    "assessedAt",
    "candidateId",
    "expectedCandidateRevisionDigest",
    "expectedStatementReferenceDigest",
    "expectedEvidenceProofDigests",
    "idempotencyKeyDigest",
    "confirmedAt",
  ], "agent candidate promotion input");
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  assertDigest(
    input.expectedAcceptanceHeadDigest,
    "expected acceptance head",
  );
  assertDigest(
    input.expectedCandidateRevisionDigest,
    "expected candidate revision",
  );
  assertDigest(
    input.expectedStatementReferenceDigest,
    "expected statement reference",
  );
  assertSortedUniqueDigests(
    input.expectedEvidenceProofDigests,
    "expected evidence proofs",
  );
  assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
  canonicalTimestamp(input.confirmedAt, "confirmedAt");
  if (!CANDIDATE_ID.test(input.candidateId)) fail("candidate ID is invalid");
  if (input.previousStore !== null) {
    assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
    if (
      input.previousStore.ownerScopeDigest
        !== input.expectedOwnerScopeDigest
    ) fail("promotion store belongs to another owner");
  }
  if (
    taskMapNativeCandidateAcceptanceHeadDigest(input.previousStore)
      !== input.expectedAcceptanceHeadDigest
  ) fail("current receipt head does not match confirmation");
  if (input.previousStore !== null) {
    const keyed = input.previousStore.receipts.find((receipt) =>
      receipt.idempotencyKeyDigest === input.idempotencyKeyDigest
    );
    if (keyed !== undefined) {
      if (!sameProof(keyed, input)) {
        fail("idempotency key conflicts with another proof");
      }
      return deepFreeze({ store: input.previousStore, receipt: keyed });
    }
    if (input.previousStore.receipts.some((receipt) =>
      receipt.candidateId === input.candidateId
    )) fail("candidate was already promoted under a different key");
  }
  const projection = buildTaskMapAgentSessionCandidateReview({
    admission: input.admission,
    extraction: input.extraction,
    previous: input.overlay,
    expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    assessedAt: input.assessedAt,
  });
  const proof = projection.shelf.candidates.find((candidate) =>
    candidate.candidateId === input.candidateId
  );
  if (
    proof === undefined
    || proof.candidateFamily !== "agent_session"
    || proof.promotionEligible !== true
  ) fail("agent candidate is unavailable or not promotion eligible");
  if (
    proof.candidateRevisionDigest
      !== input.expectedCandidateRevisionDigest
    || proof.statementReferenceDigest
      !== input.expectedStatementReferenceDigest
    || taskMapContractCanonicalJson(proof.evidenceProofDigests)
      !== taskMapContractCanonicalJson(input.expectedEvidenceProofDigests)
  ) fail("exact current agent candidate proof does not match confirmation");
  const receipt = receiptBase({
    previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    candidateId: proof.candidateId,
    candidateRevisionDigest: proof.candidateRevisionDigest,
    statementReferenceDigest: proof.statementReferenceDigest,
    evidenceProofDigests: [...proof.evidenceProofDigests],
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    confirmedAt: input.confirmedAt,
    accepted: {
      kind: proof.kind,
      title: proof.title,
      summary: proof.summary,
      speechActClass: proof.speechActClass,
      speechActActor: proof.speechActActor,
      mentionIdentityDigest: proof.mentionIdentityDigest,
      confidence: proof.confidence,
      occurredAt: proof.occurredAt,
      observedAt: proof.observedAt,
    },
    authority: FIXED_AUTHORITY,
    sourceWritebackAttempted: false,
  });
  const store = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
    policyVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    headReceiptDigest: receipt.promotionDigest,
    receipts: [...(input.previousStore?.receipts ?? []), receipt],
    privacy: PRIVACY,
  };
  assertTaskMapNativeCandidateAcceptanceStore(store);
  return deepFreeze({ store, receipt });
}

/** Re-resolves one calendar proposal before granting local manual authority. */
export function promoteTaskMapCalendarCandidate(
  input: PromoteTaskMapCalendarCandidateInputV1,
): TaskMapNativeCandidatePromotionResultV1 {
  assertPlainObject(input, "calendar candidate promotion input");
  assertExactKeys(input, [
    "result",
    "extraction",
    "overlay",
    "previousStore",
    "expectedOwnerScopeDigest",
    "expectedAcceptanceHeadDigest",
    "assessedAt",
    "candidateId",
    "expectedCandidateRevisionDigest",
    "expectedStatementReferenceDigest",
    "expectedEvidenceProofDigests",
    "idempotencyKeyDigest",
    "confirmedAt",
  ], "calendar candidate promotion input");
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  assertDigest(input.expectedAcceptanceHeadDigest, "expected acceptance head");
  assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
  assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
  assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
  assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
  canonicalTimestamp(input.confirmedAt, "confirmedAt");
  if (!CANDIDATE_ID.test(input.candidateId)) fail("candidate ID is invalid");
  if (input.previousStore !== null) {
    assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
    if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
      fail("promotion store belongs to another owner");
    }
  }
  if (
    taskMapNativeCandidateAcceptanceHeadDigest(input.previousStore)
      !== input.expectedAcceptanceHeadDigest
  ) fail("current receipt head does not match confirmation");
  if (input.previousStore !== null) {
    const keyed = input.previousStore.receipts.find((receipt) =>
      receipt.idempotencyKeyDigest === input.idempotencyKeyDigest
    );
    if (keyed !== undefined) {
      if (!sameProof(keyed, input)) {
        fail("idempotency key conflicts with another proof");
      }
      return deepFreeze({ store: input.previousStore, receipt: keyed });
    }
    if (input.previousStore.receipts.some((receipt) =>
      receipt.candidateId === input.candidateId
    )) fail("candidate was already promoted under a different key");
  }
  const projection = buildTaskMapCalendarCandidateReview({
    result: input.result,
    extraction: input.extraction,
    previous: input.overlay,
    expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    assessedAt: input.assessedAt,
  });
  const proof = projection.shelf.candidates.find((candidate) =>
    candidate.candidateId === input.candidateId
  );
  if (
    proof === undefined
    || proof.candidateFamily !== "calendar"
    || proof.promotionEligible !== true
  ) fail("calendar candidate is unavailable or not promotion eligible");
  if (
    proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
    || proof.statementReferenceDigest !== input.expectedStatementReferenceDigest
    || taskMapContractCanonicalJson(proof.evidenceProofDigests)
      !== taskMapContractCanonicalJson(input.expectedEvidenceProofDigests)
  ) fail("exact current calendar candidate proof does not match confirmation");
  const receipt = receiptBase({
    previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    candidateId: proof.candidateId,
    candidateRevisionDigest: proof.candidateRevisionDigest,
    statementReferenceDigest: proof.statementReferenceDigest,
    evidenceProofDigests: [...proof.evidenceProofDigests],
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    confirmedAt: input.confirmedAt,
    accepted: {
      kind: proof.kind,
      title: proof.title,
      summary: proof.summary,
      speechActClass: proof.speechActClass,
      speechActActor: proof.speechActActor,
      mentionIdentityDigest: proof.mentionIdentityDigest,
      confidence: proof.confidence,
      occurredAt: proof.occurredAt,
      observedAt: proof.observedAt,
    },
    authority: FIXED_AUTHORITY,
    sourceWritebackAttempted: false,
  });
  const store = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
    policyVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    headReceiptDigest: receipt.promotionDigest,
    receipts: [...(input.previousStore?.receipts ?? []), receipt],
    privacy: PRIVACY,
  };
  assertTaskMapNativeCandidateAcceptanceStore(store);
  return deepFreeze({ store, receipt });
}

/**
 * Task 7 promotion resolver. Raw evidence can enter only through the
 * process-local verified-report capability; candidate proof is always
 * recomputed and never supplied by the caller.
 */
export function promoteTaskMapVerifiedMeetingCandidate(
  input: PromoteTaskMapVerifiedMeetingCandidateInputV1,
): TaskMapNativeCandidatePromotionResultV1 {
  assertPlainObject(input, "verified meeting promotion input");
  assertExactKeys(input, [
    "result",
    "overlay",
    "rawReport",
    "previousStore",
    "expectedOwnerScopeDigest",
    "assessedAt",
    "candidateId",
    "expectedCandidateRevisionDigest",
    "expectedStatementReferenceDigest",
    "expectedEvidenceProofDigests",
    "idempotencyKeyDigest",
    "confirmedAt",
  ], "verified meeting promotion input");
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  assertDigest(input.expectedCandidateRevisionDigest, "expected candidate revision");
  assertDigest(input.expectedStatementReferenceDigest, "expected statement reference");
  assertSortedUniqueDigests(input.expectedEvidenceProofDigests, "expected evidence proofs");
  assertDigest(input.idempotencyKeyDigest, "idempotency key digest");
  canonicalTimestamp(input.confirmedAt, "confirmedAt");
  if (!CANDIDATE_ID.test(input.candidateId)) fail("candidate ID is invalid");
  if (input.previousStore !== null) {
    assertTaskMapNativeCandidateAcceptanceStore(input.previousStore);
    if (input.previousStore.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
      fail("promotion store belongs to another owner");
    }
    const keyed = input.previousStore.receipts.find((receipt) =>
      receipt.idempotencyKeyDigest === input.idempotencyKeyDigest
    );
    if (keyed !== undefined) {
      if (!sameProof(keyed, input)) fail("idempotency key conflicts with another proof");
      return deepFreeze({ store: input.previousStore, receipt: keyed });
    }
    if (input.previousStore.receipts.some((receipt) =>
      receipt.candidateId === input.candidateId
    )) fail("candidate was already promoted under a different key");
  }
  if (input.overlay === null || (input.result === null && input.rawReport === null)) {
    fail("current authenticated candidate proof is unavailable");
  }
  let googleCandidates: TaskMapNativeCandidateShelfRowV1[] = [];
  if (input.result !== null) {
    const googleOverlay = buildTaskMapNativeCandidateReview({
      result: input.result,
      previous: input.overlay,
      expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
      assessedAt: input.assessedAt,
    });
    googleCandidates = buildTaskMapNativeCandidateShelf(
      input.result,
      googleOverlay,
      input.assessedAt,
    ).candidates;
  }
  const context = buildTaskMapUnifiedMeetingCandidateContext({
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    assessedAt: input.assessedAt,
    googleCandidates,
    googleResultDigest: input.result?.resultDigest ?? null,
    googleSnapshotDigest: input.result?.snapshot?.snapshotDigest ?? null,
    googleProducedAt: input.result?.snapshot?.producedAt ?? null,
    rawReport: input.rawReport,
  });
  const proof = applyTaskMapNativeCandidateReviewToProofRows({
    context,
    overlay: input.overlay,
  }).find((row) => row.candidateId === input.candidateId);
  if (proof === undefined || !proof.promotionEligible) {
    fail("candidate is unavailable or not promotion eligible");
  }
  if (
    proof.candidateRevisionDigest !== input.expectedCandidateRevisionDigest
    || proof.statementReferenceDigest !== input.expectedStatementReferenceDigest
    || taskMapContractCanonicalJson(proof.evidenceProofDigests)
      !== taskMapContractCanonicalJson(input.expectedEvidenceProofDigests)
  ) fail("exact current candidate proof does not match confirmation");
  const receipt = receiptBase({
    previousReceiptDigest: input.previousStore?.headReceiptDigest ?? null,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    candidateId: proof.candidateId,
    candidateRevisionDigest: proof.candidateRevisionDigest,
    statementReferenceDigest: proof.statementReferenceDigest,
    evidenceProofDigests: [...proof.evidenceProofDigests],
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    confirmedAt: input.confirmedAt,
    accepted: acceptedPayload(proof),
    authority: FIXED_AUTHORITY,
    sourceWritebackAttempted: false,
  });
  const store = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_VERSION,
    policyVersion: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_POLICY_VERSION,
    ownerScopeDigest: input.expectedOwnerScopeDigest,
    headReceiptDigest: receipt.promotionDigest,
    receipts: [...(input.previousStore?.receipts ?? []), receipt],
    privacy: PRIVACY,
  };
  assertTaskMapNativeCandidateAcceptanceStore(store);
  return deepFreeze({ store, receipt });
}

export function taskMapNativeCandidateAcceptanceHeadDigest(
  store: TaskMapNativeCandidateAcceptanceStoreV1 | null,
): string {
  if (store === null) {
    return taskMapContractDigest({ domain: EMPTY_HEAD_DIGEST_DOMAIN });
  }
  assertTaskMapNativeCandidateAcceptanceStore(store);
  return store.headReceiptDigest;
}

/** Presentation-only omission behind the authenticated receipt-store gate. */
export function filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
  rows: readonly TaskMapNativeCandidateShelfRowV1[],
  store: TaskMapNativeCandidateAcceptanceStoreV1 | null,
  expectedOwnerScopeDigest: string,
  publishedPromotionIds?: ReadonlySet<string>,
): TaskMapNativeCandidateShelfRowV1[] {
  assertDigest(expectedOwnerScopeDigest, "expected owner scope");
  if (store === null) return [...rows];
  assertTaskMapNativeCandidateAcceptanceStore(store);
  if (store.ownerScopeDigest !== expectedOwnerScopeDigest) {
    fail("candidate shelf acceptance store belongs to another owner");
  }
  const promoted = new Set(store.receipts.flatMap((receipt) =>
    publishedPromotionIds === undefined
      || publishedPromotionIds.has(receipt.promotionId)
      ? [receipt.candidateId]
      : []
  ));
  return rows.filter((row) => !promoted.has(row.candidateId));
}

export interface TaskMapNativeCandidateAcceptanceManualRecordsV1 {
  ownerScopeDigest: string;
  generatedAt: string;
  pointers: TaskMapSourcePointer[];
  events: TaskMapEvent[];
  sourceBindings: TaskMapNativeSemanticSourceBindingV1[];
  evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[];
}

export function taskMapNativeCandidateAcceptanceManualAuthorityRecords(
  store: TaskMapNativeCandidateAcceptanceStoreV1,
): TaskMapNativeCandidateAcceptanceManualRecordsV1 {
  assertTaskMapNativeCandidateAcceptanceStore(store);
  const pointers: TaskMapSourcePointer[] = [];
  const events: TaskMapEvent[] = [];
  const sourceBindings: TaskMapNativeSemanticSourceBindingV1[] = [];
  const evidenceBindings: TaskMapNativeSemanticEvidenceBindingV1[] = [];
  for (const receipt of store.receipts) {
    const pointerId = `tmcandidatepromotion_${receipt.promotionDigest}`;
    const eventId = `tmcandidatepromotionevent_${receipt.promotionDigest}`;
    pointers.push({
      id: pointerId,
      sourceKind: "manual",
      sourceObjectId: receipt.promotionDigest,
      sourceRefHash: receipt.promotionDigest,
      sourceVersion: receipt.promotionDigest,
      authority: "user",
      syncMode: "personal_fork",
      capabilities: ["read_task"],
    });
    events.push({
      id: eventId,
      pointerId,
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: receipt.confirmedAt,
      observedAt: receipt.confirmedAt,
      objectRefs: [
        `external:${receipt.statementReferenceDigest}`,
        `promotion-proof:${receipt.promotionDigest}`,
      ],
      title: receipt.accepted.title,
      summary: receipt.accepted.summary,
      extractionConfidence: receipt.accepted.confidence,
      sourceStatus: "open",
      bodyJoinEligible: false,
    });
    sourceBindings.push({
      pointerId,
      semanticClass: "source_authoritative",
      semanticOriginId: receipt.promotionDigest,
      semanticIdentityDigest: receipt.promotionDigest,
      sourceIdentityDigest: receipt.promotionDigest,
      observedRevision: receipt.promotionDigest,
      evidenceRevision: receipt.promotionDigest,
      observedContentDigest: receipt.promotionDigest,
      evidenceContentDigest: receipt.promotionDigest,
    });
    evidenceBindings.push({
      eventId,
      disposition: "source_authoritative",
      rootLinkRefs: [`external:${receipt.statementReferenceDigest}`],
    });
  }
  return deepFreeze({
    ownerScopeDigest: store.ownerScopeDigest,
    generatedAt: store.receipts.reduce(
      (latest, receipt) => receipt.confirmedAt > latest
        ? receipt.confirmedAt
        : latest,
      store.receipts[0]!.confirmedAt,
    ),
    pointers,
    events,
    sourceBindings,
    evidenceBindings,
  });
}

/**
 * The sole Task 6 authority merge. Manual records are rehydrated internally
 * from a fully validated receipt store; callers cannot supply raw authority.
 */
export function mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
  base: TaskMapNativeSemanticBuilderInputV1,
  store: TaskMapNativeCandidateAcceptanceStoreV1,
): TaskMapNativeSemanticBuilderInputV1 {
  assertTaskMapNativeCandidateAcceptanceStore(store);
  if (base.ownerScopeDigest !== store.ownerScopeDigest) {
    fail("semantic input and acceptance store belong to different owners");
  }
  const manual = taskMapNativeCandidateAcceptanceManualAuthorityRecords(store);
  return {
    ...base,
    sourceBindings: [...base.sourceBindings, ...manual.sourceBindings]
      .sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
    evidenceBindings: [...base.evidenceBindings, ...manual.evidenceBindings]
      .sort((left, right) => left.eventId.localeCompare(right.eventId)),
    taskMapInput: {
      ...base.taskMapInput,
      generatedAt: manual.generatedAt > base.taskMapInput.generatedAt
        ? manual.generatedAt
        : base.taskMapInput.generatedAt,
      pointers: [...base.taskMapInput.pointers, ...manual.pointers]
        .map((pointer) => ({
          ...pointer,
          capabilities: [...pointer.capabilities].sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      events: [...base.taskMapInput.events, ...manual.events]
        .map((event) => ({
          ...event,
          objectRefs: [...event.objectRefs].sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
  };
}

function assertStorePath(storePath: string): void {
  if (
    typeof storePath !== "string"
    || !path.isAbsolute(storePath)
    || path.normalize(storePath) !== storePath
    || PATH_CONTROL_CHARACTER.test(storePath)
  ) fail("store path is invalid");
}

async function ensurePrivateParent(
  storePath: string,
): Promise<{ parent: string; dev: bigint; ino: bigint }> {
  const parent = path.dirname(storePath);
  try {
    await mkdir(parent, { recursive: false, mode: DIRECTORY_MODE });
  } catch (error) {
    if (errnoCode(error) !== "EEXIST") throw error;
  }
  const stats = await lstat(parent, { bigint: true });
  const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.uid !== uid
    || Number(stats.mode & 0o777n) !== DIRECTORY_MODE
    || await realpath(parent) !== parent
  ) fail("store parent must be an owner-only real 0700 directory");
  return { parent, dev: stats.dev, ino: stats.ino };
}

async function privateParentIfPresent(
  storePath: string,
): Promise<{ parent: string; dev: bigint; ino: bigint } | null> {
  const parent = path.dirname(storePath);
  let stats: Awaited<ReturnType<typeof lstat>>;
  try {
    stats = await lstat(parent, { bigint: true });
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  }
  const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
  if (
    stats.isSymbolicLink()
    || !stats.isDirectory()
    || stats.uid !== uid
    || Number(stats.mode & 0o777n) !== DIRECTORY_MODE
    || await realpath(parent) !== parent
  ) fail("store parent must be an owner-only real 0700 directory");
  return { parent, dev: stats.dev, ino: stats.ino };
}

async function assertExistingTargetSafe(storePath: string): Promise<void> {
  try {
    const stats = await lstat(storePath, { bigint: true });
    const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : stats.uid;
    if (
      stats.isSymbolicLink()
      || !stats.isFile()
      || stats.uid !== uid
      || Number(stats.mode & 0o777n) !== FILE_MODE
      || stats.nlink !== 1n
      || stats.size < 2n
      || stats.size > BigInt(TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes)
    ) fail("existing store target is not an owner-only 0600 regular file");
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return;
    throw error;
  }
}

export async function loadTaskMapNativeCandidateAcceptanceStore(
  input: LoadTaskMapNativeCandidateAcceptanceStoreInputV1,
): Promise<TaskMapNativeCandidateAcceptanceStoreV1 | null> {
  assertPlainObject(input, "load store input");
  const inputKeys = Object.keys(input).sort();
  const allowedInputKeys = [
    "afterAuthenticatedReadForTesting",
    "expectedOwnerScopeDigest",
    "storePath",
  ];
  if (
    !inputKeys.includes("storePath")
    || !inputKeys.includes("expectedOwnerScopeDigest")
    || inputKeys.some((key) => !allowedInputKeys.includes(key))
    || (
      input.afterAuthenticatedReadForTesting !== undefined
      && typeof input.afterAuthenticatedReadForTesting !== "function"
    )
  ) fail("load store input keys");
  assertStorePath(input.storePath);
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  const authenticatedParent = await privateParentIfPresent(input.storePath);
  if (authenticatedParent === null) return null;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(input.storePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat({ bigint: true });
    const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : before.uid;
    if (
      !before.isFile()
      || before.uid !== uid
      || Number(before.mode & 0o777n) !== FILE_MODE
      || before.nlink !== 1n
      || before.size < 2n
      || before.size > BigInt(TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes)
    ) fail("store file authentication failed");
    const maximumBytes =
      TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes;
    const bounded = Buffer.allocUnsafe(maximumBytes + 1);
    let byteLength = 0;
    while (byteLength < bounded.length) {
      const { bytesRead } = await handle.read(
        bounded,
        byteLength,
        bounded.length - byteLength,
        byteLength,
      );
      if (bytesRead === 0) break;
      byteLength += bytesRead;
    }
    if (byteLength > maximumBytes) {
      fail("store file authentication failed");
    }
    const bytes = bounded.subarray(0, byteLength);
    await input.afterAuthenticatedReadForTesting?.(input.storePath);
    const after = await handle.stat({ bigint: true });
    let current: typeof before;
    try {
      current = await lstat(input.storePath, { bigint: true });
    } catch {
      fail("store file changed during read");
    }
    const currentParent = await privateParentIfPresent(input.storePath);
    const metadataMatchesBefore = (metadata: typeof before): boolean =>
      metadata.isFile()
      && !metadata.isSymbolicLink()
      && metadata.dev === before.dev
      && metadata.ino === before.ino
      && metadata.size === before.size
      && metadata.mtimeNs === before.mtimeNs
      && metadata.ctimeNs === before.ctimeNs
      && metadata.mode === before.mode
      && metadata.uid === before.uid
      && metadata.nlink === before.nlink
      && metadata.nlink === 1n
      && Number(metadata.mode & 0o777n) === FILE_MODE
      && metadata.uid === uid;
    if (
      BigInt(bytes.byteLength) !== before.size
      || !metadataMatchesBefore(after)
      || !metadataMatchesBefore(current)
      || currentParent === null
      || currentParent.dev !== authenticatedParent.dev
      || currentParent.ino !== authenticatedParent.ino
    ) fail("store file changed during read");
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      fail("store bytes are invalid UTF-8");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      fail("store bytes are invalid JSON");
    }
    assertTaskMapNativeCandidateAcceptanceStore(parsed);
    if (
      parsed.ownerScopeDigest !== input.expectedOwnerScopeDigest
      || taskMapContractCanonicalJson(parsed) !== decoded
    ) fail("store bytes are noncanonical or belong to another owner");
    return deepFreeze(parsed);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function writeTaskMapNativeCandidateAcceptanceStore(
  input: WriteTaskMapNativeCandidateAcceptanceStoreInputV1,
): Promise<void> {
  assertPlainObject(input, "write store input");
  assertExactKeys(input, ["storePath", "expectedOwnerScopeDigest", "store"], "write store input");
  assertStorePath(input.storePath);
  assertDigest(input.expectedOwnerScopeDigest, "expected owner scope");
  assertTaskMapNativeCandidateAcceptanceStore(input.store);
  if (input.store.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
    fail("store belongs to another owner");
  }
  const preflightCurrent = await loadTaskMapNativeCandidateAcceptanceStore({
    storePath: input.storePath,
    expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
  });
  if (
    preflightCurrent === null
    && (
      input.store.receipts.length !== 1
      || input.store.receipts[0]!.previousReceiptDigest !== null
    )
  ) fail("initial store must contain exactly one genesis receipt");
  await withTaskMapNativeCandidateReviewTransaction(
    {
      overlayPath: input.storePath,
      expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    },
    async () => writeTaskMapNativeCandidateAcceptanceStoreUnderLock(input),
  );
}

function isExactOneReceiptExtension(
  current: TaskMapNativeCandidateAcceptanceStoreV1,
  proposed: TaskMapNativeCandidateAcceptanceStoreV1,
): boolean {
  if (proposed.receipts.length !== current.receipts.length + 1) return false;
  if (
    proposed.contractVersion !== current.contractVersion
    || proposed.policyVersion !== current.policyVersion
    || proposed.ownerScopeDigest !== current.ownerScopeDigest
    || taskMapContractCanonicalJson(proposed.privacy)
      !== taskMapContractCanonicalJson(current.privacy)
  ) return false;
  return current.receipts.every((receipt, index) =>
    taskMapContractCanonicalJson(receipt)
      === taskMapContractCanonicalJson(proposed.receipts[index])
  ) && proposed.receipts[current.receipts.length]!.previousReceiptDigest
    === current.headReceiptDigest;
}

async function writeTaskMapNativeCandidateAcceptanceStoreUnderLock(
  input: WriteTaskMapNativeCandidateAcceptanceStoreInputV1,
): Promise<void> {
  const bytes = taskMapContractCanonicalJson(input.store);
  const current = await loadTaskMapNativeCandidateAcceptanceStore({
    storePath: input.storePath,
    expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
  });
  const currentBytes = current === null
    ? null
    : taskMapContractCanonicalJson(current);
  if (
    current === null
    && (
      input.store.receipts.length !== 1
      || input.store.receipts[0]!.previousReceiptDigest !== null
    )
  ) fail("initial store must contain exactly one genesis receipt");
  if (currentBytes === bytes) return;
  if (current !== null && !isExactOneReceiptExtension(current, input.store)) {
    fail("store update is stale, rolled back, or not an exact one-receipt append");
  }
  const parent = await ensurePrivateParent(input.storePath);
  await assertExistingTargetSafe(input.storePath);
  const stagePath = path.join(parent.parent, `.candidate-acceptance-${randomBytes(16).toString("hex")}.tmp`);
  let stageExists = false;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      stagePath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      FILE_MODE,
    );
    stageExists = true;
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
    const stats = await handle.stat({ bigint: true });
    if (
      !stats.isFile()
      || Number(stats.mode & 0o777n) !== FILE_MODE
      || stats.nlink !== 1n
      || stats.size !== BigInt(Buffer.byteLength(bytes, "utf8"))
    ) fail("staged store authentication failed");
    await handle.close();
    handle = undefined;
    const parentNow = await lstat(parent.parent, { bigint: true });
    if (
      parentNow.dev !== parent.dev
      || parentNow.ino !== parent.ino
      || Number(parentNow.mode & 0o777n) !== DIRECTORY_MODE
    ) fail("store parent changed during write");
    await assertExistingTargetSafe(input.storePath);
    const currentBeforeRename = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath: input.storePath,
      expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    });
    const currentBeforeRenameBytes = currentBeforeRename === null
      ? null
      : taskMapContractCanonicalJson(currentBeforeRename);
    if (currentBeforeRenameBytes !== currentBytes) {
      fail("store append became stale before rename");
    }
    await rename(stagePath, input.storePath);
    stageExists = false;
    const directoryHandle = await open(parent.parent, fsConstants.O_RDONLY);
    await directoryHandle.sync().finally(() => directoryHandle.close());
    const loaded = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath: input.storePath,
      expectedOwnerScopeDigest: input.expectedOwnerScopeDigest,
    });
    if (loaded === null || taskMapContractCanonicalJson(loaded) !== bytes) {
      fail("store readback does not match staged bytes");
    }
  } finally {
    await handle?.close().catch(() => undefined);
    if (stageExists) await unlink(stagePath).catch(() => undefined);
  }
}
