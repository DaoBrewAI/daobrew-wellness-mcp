export declare const THREAD_KEY_VERSION = 1;
export declare function sha24(basis: string): string;
export interface ThreadKeyInput {
    graphRootId?: string | null;
    topics?: string[];
    sourceKind?: string;
    patternKeys?: string[];
}
export declare function deriveThreadKey(input: ThreadKeyInput): string;
export declare function threadId(userId: string, threadKey: string): string;
export declare function snapshotId(userId: string, version: number): string;
export interface EvidenceIdInput {
    threadId: string;
    sourceTable: string | null;
    sourceId: string | null;
    graphNodeId: string | null;
    graphEdgeId: string | null;
    evidenceRole: string;
}
export declare function evidenceId(input: EvidenceIdInput): string;
export interface VerificationIdInput {
    threadId: string;
    kind: "observation" | "verdict";
    /** observed_week_start (same_thread_trigger) · local day (engine_ran_no_trigger) · String(handled_at_ts) (verdict) */
    bucket: string;
}
export declare function verificationId(input: VerificationIdInput): string;
/** Salted HMAC of the user id (5B): lets opt-out purge find a contributor's
 *  transfer_records without any stored identity. The salt is server custody
 *  (DAOBREW_TRANSFER_SALT) — callers fail closed when it is absent. */
export declare function contributorHash(userId: string, salt: string): string;
export interface TransferRecordIdInput {
    contributorHash: string;
    threadKey: string;
    /** The settled cycle's handled_at_ts — same bucket as the verdict row, so
     *  one record per completed thread cycle and idempotent nightly re-runs. */
    handledAtTs: number;
}
export declare function transferRecordId(input: TransferRecordIdInput): string;
