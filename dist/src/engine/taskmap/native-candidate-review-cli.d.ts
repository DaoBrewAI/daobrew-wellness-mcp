#!/usr/bin/env node
import { type TaskMapNativeCandidateAcceptanceStoreV1 } from "./native-candidate-acceptance.js";
import { type TaskMapNativeCandidateReviewAction, type TaskMapNativeCandidateShelfV1, type TaskMapNativeCandidateShelfRowV2, type TaskMapNativeCandidateShelfV2, type TaskMapNativeCandidateShelfV3 } from "./native-candidate-review.js";
export declare const TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN: "taskmap-native-candidate-review-cli-idempotency.1";
export declare const TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES: number;
export declare function retainReceiptBackedPendingRows(candidates: readonly TaskMapNativeCandidateShelfRowV2[], acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null, publishedPromotionIds: ReadonlySet<string>): {
    candidates: TaskMapNativeCandidateShelfRowV2[];
    durableConfirmedCandidateIds: string[];
};
export type TaskMapNativeCandidateReviewCommand = {
    kind: "list";
} | {
    kind: "review";
    candidateId: string;
    candidateRevisionDigest: string;
    action: Exclude<TaskMapNativeCandidateReviewAction, "defer">;
};
export declare function parseTaskMapNativeCandidateReviewCommand(argv: readonly string[]): TaskMapNativeCandidateReviewCommand;
export declare function taskMapNativeCandidateReviewOverlayPath(taskMapRoot: string): string;
export declare function runTaskMapNativeCandidateReviewCommand(argv: readonly string[]): Promise<TaskMapNativeCandidateShelfV3>;
export declare function taskMapNativeCandidateShelfOutput(shelf: TaskMapNativeCandidateShelfV1 | TaskMapNativeCandidateShelfV2 | TaskMapNativeCandidateShelfV3): string;
