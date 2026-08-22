import { createHash, createHmac } from "node:crypto";

export const THREAD_KEY_VERSION = 1;

export function sha24(basis: string): string {
  return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function normalizeTerms(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const term = value.trim().toLowerCase().replace(/^#+/, "");
    if (term) seen.add(term);
  }
  return [...seen].sort();
}

export interface ThreadKeyInput {
  graphRootId?: string | null;
  topics?: string[];
  sourceKind?: string;
  patternKeys?: string[];
}

export function deriveThreadKey(input: ThreadKeyInput): string {
  if (input.graphRootId) return `root:${input.graphRootId}`;
  const basis = [
    input.sourceKind ?? "",
    normalizeTerms(input.topics).join(","),
    normalizeTerms(input.patternKeys).join(","),
  ].join("|");
  return `sem:v${THREAD_KEY_VERSION}:${sha24(basis)}`;
}

export function threadId(userId: string, threadKey: string): string {
  return `cmt_${sha24(`${userId}|${threadKey}`)}`;
}

export function snapshotId(userId: string, version: number): string {
  return `ums_${sha24(`${userId}|${version}`)}`;
}

export interface EvidenceIdInput {
  threadId: string;
  sourceTable: string | null;
  sourceId: string | null;
  graphNodeId: string | null;
  graphEdgeId: string | null;
  evidenceRole: string;
}

export function evidenceId(input: EvidenceIdInput): string {
  const basis = [
    input.threadId,
    input.sourceTable ?? "",
    input.sourceId ?? "",
    input.graphNodeId ?? "",
    input.graphEdgeId ?? "",
    input.evidenceRole,
  ].join("|");
  return `cte_${sha24(basis)}`;
}

export interface VerificationIdInput {
  threadId: string;
  kind: "observation" | "verdict";
  /** observed_week_start (same_thread_trigger) · local day (engine_ran_no_trigger) · String(handled_at_ts) (verdict) */
  bucket: string;
}

export function verificationId(input: VerificationIdInput): string {
  return `tvf_${sha24([input.threadId, input.kind, input.bucket].join("|"))}`;
}

/** Salted HMAC of the user id (5B): lets opt-out purge find a contributor's
 *  transfer_records without any stored identity. The salt is server custody
 *  (DAOBREW_TRANSFER_SALT) — callers fail closed when it is absent. */
export function contributorHash(userId: string, salt: string): string {
  return createHmac("sha256", salt).update(userId).digest("hex").slice(0, 24);
}

export interface TransferRecordIdInput {
  contributorHash: string;
  threadKey: string;
  /** The settled cycle's handled_at_ts — same bucket as the verdict row, so
   *  one record per completed thread cycle and idempotent nightly re-runs. */
  handledAtTs: number;
}

export function transferRecordId(input: TransferRecordIdInput): string {
  return `trf_${sha24([input.contributorHash, input.threadKey, String(input.handledAtTs)].join("|"))}`;
}
