#!/usr/bin/env node
import { type TaskMapNativeCandidatePromotionReceiptV1 } from "./native-candidate-acceptance.js";
export declare const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN: "taskmap-native-candidate-acceptance-cli-idempotency.1";
export declare const TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES: number;
export interface TaskMapNativeCandidateAcceptanceCommandV1 {
    candidateId: string;
    candidateRevisionDigest: string;
    statementReferenceDigest: string;
    evidenceProofDigests: string[];
    idempotencyKey: string;
}
export interface TaskMapAgentSessionCandidateAcceptanceCommandV2 extends TaskMapNativeCandidateAcceptanceCommandV1 {
    candidateFamily: "agent_session";
}
export interface TaskMapCalendarCandidateAcceptanceCommandV2 extends TaskMapNativeCandidateAcceptanceCommandV1 {
    candidateFamily: "calendar";
}
export declare function parseTaskMapNativeCandidateAcceptanceCommand(argv: readonly string[]): TaskMapNativeCandidateAcceptanceCommandV1 | TaskMapAgentSessionCandidateAcceptanceCommandV2 | TaskMapCalendarCandidateAcceptanceCommandV2;
export declare function taskMapNativeCandidateAcceptanceStorePath(taskMapRoot: string): string;
export declare function runTaskMapNativeCandidateAcceptanceCommand(argv: readonly string[]): Promise<TaskMapNativeCandidatePromotionReceiptV1>;
export declare function taskMapNativeCandidateAcceptanceOutput(receipt: TaskMapNativeCandidatePromotionReceiptV1): string;
