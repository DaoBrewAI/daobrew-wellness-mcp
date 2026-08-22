import {
  TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS,
} from "./agent-session-producer-freshness.js";
import {
  assertTaskMapAgentSessionSemanticAdmission,
  type TaskMapAgentSessionProposalClusterV2,
  type TaskMapAgentSessionSemanticAdmissionV2,
} from "./agent-session-semantic-admission.js";
import type {
  TaskMapAgentSessionExtractionMentionV1,
  TaskMapAgentSessionExtractionReportV1,
} from "./agent-session-refresh-llm-replay.js";
import {
  TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1,
  TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
  applyTaskMapNativeCandidateReviewToProofRows,
  assertTaskMapNativeCandidateReview,
  assertTaskMapNativeCandidateShelfV2,
  buildTaskMapNativeCandidateReviewFromProofRows,
  taskMapAgentSessionCandidateStatementReferenceDigest,
  taskMapNativeCandidateId,
  taskMapNativeCandidateRevisionDigest,
  type TaskMapNativeCandidateAgentShelfRowV2,
  type TaskMapNativeCandidateReviewV1,
  type TaskMapNativeCandidateShelfRowV1,
  type TaskMapNativeCandidateShelfV2,
  type TaskMapNativeCandidateProofRowsContextV1,
} from "./native-candidate-review.js";
import { taskMapContractDigest } from "./source-contracts.js";
import { boundedUtf16 } from "./text-contract.js";

export {
  TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN,
} from "./native-candidate-review.js";
export const TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN =
  "taskmap-agent-session-candidate-evidence.3" as const;

export interface BuildTaskMapAgentSessionCandidateReviewInputV2 {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  extraction: TaskMapAgentSessionExtractionReportV1;
  previous: TaskMapNativeCandidateReviewV1 | null;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
}

export interface BuildTaskMapAgentSessionCandidateShelfInputV2 {
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  extraction: TaskMapAgentSessionExtractionReportV1;
  overlay: TaskMapNativeCandidateReviewV1;
  expectedOwnerScopeDigest: string;
  assessedAt: string;
}

export interface TaskMapAgentSessionCandidateReviewProjectionV2 {
  overlay: TaskMapNativeCandidateReviewV1;
  shelf: TaskMapNativeCandidateShelfV2;
}

interface DerivedAgentCandidates {
  context: TaskMapNativeCandidateProofRowsContextV1;
  rows: TaskMapNativeCandidateAgentShelfRowV2[];
}

function fail(message: string): never {
  throw new Error(`Task Map agent candidate adapter: ${message}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length
    || actual.some((key, index) => key !== keys[index])
  ) fail(`${label} has unexpected or missing fields`);
}

function canonicalAssessedAt(value: unknown): string {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail("assessedAt must be a canonical timestamp");
  return value;
}

function assertCurrentAdmission(
  admission: TaskMapAgentSessionSemanticAdmissionV2,
  expectedOwnerScopeDigest: string,
  assessedAtInput: string,
): string {
  assertTaskMapAgentSessionSemanticAdmission(admission);
  if (admission.ownerScopeDigest !== expectedOwnerScopeDigest) {
    fail("admission belongs to another owner");
  }
  const assessedAt = canonicalAssessedAt(assessedAtInput);
  const produced = Date.parse(admission.producedAt);
  const assessed = Date.parse(assessedAt);
  if (
    assessed < produced
    || assessed >= produced + TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS
  ) fail("admission is stale at assessedAt");
  return assessedAt;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

export function taskMapAgentSessionCandidateEvidenceProofDigest(
  ownerScopeDigest: string,
  cluster: TaskMapAgentSessionProposalClusterV2,
  support: TaskMapAgentSessionProposalClusterV2["supports"][number],
  mentionIdentityDigest: string,
  envelopeDigest: string,
): string {
  return taskMapContractDigest({
    domain: TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN,
    ownerScopeDigest,
    clusterIdentityDigest: cluster.clusterIdentityDigest,
    workstreamIdentityDigest: cluster.workstreamIdentityDigest,
    supportIdentityDigest: support.supportIdentityDigest,
    provider: support.provider,
    mentionIdentityDigest,
    envelopeDigest,
  });
}

function evidenceProofs(
  ownerScopeDigest: string,
  cluster: TaskMapAgentSessionProposalClusterV2,
  mentionIdentityDigest: string,
  envelopeDigest: string,
): string[] {
  return [...new Set(cluster.supports.map((support) =>
    taskMapAgentSessionCandidateEvidenceProofDigest(
      ownerScopeDigest,
      cluster,
      support,
      mentionIdentityDigest,
      envelopeDigest,
    )
  ))].sort(compareCodePoints);
}

function deriveAgentCandidates(
  admission: TaskMapAgentSessionSemanticAdmissionV2,
  extraction: TaskMapAgentSessionExtractionReportV1,
  expectedOwnerScopeDigest: string,
  assessedAtInput: string,
): DerivedAgentCandidates {
  const assessedAt = assertCurrentAdmission(
    admission,
    expectedOwnerScopeDigest,
    assessedAtInput,
  );
  if (
    extraction.ownerScopeDigest !== admission.ownerScopeDigest
    || extraction.admissionDigest !== admission.admissionDigest
  ) fail("extraction does not match current admission");
  const rows = extraction.clusters.flatMap((extractedCluster) => {
    const cluster = admission.clusters.find((candidate) =>
      candidate.clusterIdentityDigest === extractedCluster.clusterIdentityDigest
      && candidate.workstreamIdentityDigest
        === extractedCluster.workstreamIdentityDigest
    );
    if (cluster === undefined) fail("extraction cluster has no current admission");
    if (extractedCluster.status === "degraded") return [];
    if (extractedCluster.envelopeDigest === null) {
      fail("extracted cluster has no station envelope");
    }
    const envelopeDigest = extractedCluster.envelopeDigest;
    return extractedCluster.mentions.map((mention) => {
      const statementReferenceDigest =
        taskMapAgentSessionCandidateStatementReferenceDigest(
          admission.ownerScopeDigest,
          cluster.clusterIdentityDigest,
          mention.mentionIdentityDigest,
        );
      const candidateId = taskMapNativeCandidateId(
        admission.ownerScopeDigest,
        statementReferenceDigest,
      );
      const proofDigests = evidenceProofs(
        admission.ownerScopeDigest,
        cluster,
        mention.mentionIdentityDigest,
        envelopeDigest,
      );
      const candidateRevisionDigest = taskMapNativeCandidateRevisionDigest(
        candidateId,
        proofDigests,
      );
      const sourceKinds = [...new Set(cluster.supports.map((support) =>
        support.provider === "codex" ? "codex_session" as const
          : "claude_session" as const
      ))].sort(compareCodePoints);
      return {
        candidateId,
        candidateRevisionDigest,
        statementReferenceDigest,
        evidenceProofDigests: proofDigests,
        candidateFamily: "agent_session" as const,
        kind: mentionKind(mention),
        title: boundedUtf16(
          mention.title,
          TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxTitleCharacters,
        ),
        summary: boundedUtf16(
          mention.text,
          TASKMAP_NATIVE_CANDIDATE_REVIEW_LIMITS_V1.maxSummaryCharacters,
        ),
        sourceKinds,
        speechActClass: mention.speechActClass,
        speechActActor: mention.speechActActor,
        confidence: mention.confidence,
        mentionIdentityDigest: mention.mentionIdentityDigest,
        originIdentityDigest: cluster.clusterIdentityDigest,
        supportSetRevisionDigest: candidateRevisionDigest,
        workstreamIdentityDigest: cluster.workstreamIdentityDigest,
        proposalDisposition: mention.proposalDisposition,
        occurredAt: cluster.occurredAt,
        observedAt: cluster.observedAt,
        reviewState: "unreviewed" as const,
        reviewedAt: null,
        reviewedOnly: false,
        promotionEligible: mention.promotionEligible,
        acceptedWork: false as const,
        sourceWritebackEligible: false as const,
        rankEligible: false as const,
        routeEligible: false as const,
        proveEligible: false as const,
        runEligible: false as const,
      } satisfies TaskMapNativeCandidateAgentShelfRowV2;
    });
  }).sort((left, right) => compareCodePoints(left.candidateId, right.candidateId));
  const context: TaskMapNativeCandidateProofRowsContextV1 = {
    ownerScopeDigest: admission.ownerScopeDigest,
    producerResultDigest: extraction.reportDigest,
    producerSnapshotDigest: admission.sourceSnapshotDigest,
    producedAt: admission.producedAt,
    assessedAt,
    candidates: rows as unknown as TaskMapNativeCandidateShelfRowV1[],
  };
  return { context, rows };
}

function mentionKind(
  mention: TaskMapAgentSessionExtractionMentionV1,
): "action_item" | "commitment" | "decision" {
  return mention.speechActClass === "commitment" ? "commitment"
    : mention.speechActClass === "decision" ? "decision"
      : "action_item";
}

function shelfFromDerived(
  derived: DerivedAgentCandidates,
  overlay: TaskMapNativeCandidateReviewV1,
): TaskMapNativeCandidateShelfV2 {
  assertTaskMapNativeCandidateReview(overlay);
  if (
    overlay.ownerScopeDigest !== derived.context.ownerScopeDigest
    || overlay.producerResultDigest !== derived.context.producerResultDigest
    || overlay.producerSnapshotDigest !== derived.context.producerSnapshotDigest
  ) fail("candidate overlay does not match current support evidence");
  const reviewed = applyTaskMapNativeCandidateReviewToProofRows({
    context: derived.context,
    overlay,
  });
  const candidates = reviewed.map((reviewedRow) => {
    const display = derived.rows.find((row) =>
      row.candidateId === reviewedRow.candidateId
    );
    if (display === undefined) fail("review row has no current candidate proof");
    return {
      ...display,
      reviewState: reviewedRow.reviewState,
      reviewedAt: reviewedRow.reviewedAt,
      reviewedOnly: reviewedRow.reviewedOnly,
    };
  });
  const shelf: TaskMapNativeCandidateShelfV2 = {
    contractVersion: TASKMAP_NATIVE_CANDIDATE_SHELF_VERSION_V2,
    ownerScopeDigest: derived.context.ownerScopeDigest,
    producerResultDigest: derived.context.producerResultDigest,
    producerSnapshotDigest: derived.context.producerSnapshotDigest,
    assessedAt: derived.context.assessedAt,
    candidates,
    displayTextPersistence: "memory_only",
  };
  assertTaskMapNativeCandidateShelfV2(shelf);
  return deepFreeze(shelf);
}

export function buildTaskMapAgentSessionCandidateShelf(
  input: BuildTaskMapAgentSessionCandidateShelfInputV2,
): TaskMapNativeCandidateShelfV2 {
  assertExactKeys(input, [
    "admission",
    "assessedAt",
    "expectedOwnerScopeDigest",
    "extraction",
    "overlay",
  ], "candidate shelf input");
  const derived = deriveAgentCandidates(
    input.admission,
    input.extraction,
    input.expectedOwnerScopeDigest,
    input.assessedAt,
  );
  return shelfFromDerived(derived, input.overlay);
}

export function buildTaskMapAgentSessionCandidateReview(
  input: BuildTaskMapAgentSessionCandidateReviewInputV2,
): TaskMapAgentSessionCandidateReviewProjectionV2 {
  assertExactKeys(input, [
    "admission",
    "assessedAt",
    "expectedOwnerScopeDigest",
    "extraction",
    "previous",
  ], "candidate review input");
  const derived = deriveAgentCandidates(
    input.admission,
    input.extraction,
    input.expectedOwnerScopeDigest,
    input.assessedAt,
  );
  const overlay = buildTaskMapNativeCandidateReviewFromProofRows({
    context: derived.context,
    previous: input.previous,
  });
  const shelf = shelfFromDerived(derived, overlay);
  return deepFreeze({ overlay, shelf });
}
