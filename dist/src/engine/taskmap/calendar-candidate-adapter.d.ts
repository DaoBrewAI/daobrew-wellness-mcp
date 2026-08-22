import type { TaskMapCalendarProducerResultV1 } from "./calendar-producer-freshness.js";
import type { TaskMapCalendarExtractionReportV1 } from "./calendar-refresh-llm-replay.js";
import { type TaskMapNativeCandidateReviewV1, type TaskMapNativeCandidateShelfV2 } from "./native-candidate-review.js";
export declare const TASKMAP_CALENDAR_CANDIDATE_EVIDENCE_DOMAIN: "taskmap-calendar-candidate-evidence.1";
export interface BuildTaskMapCalendarCandidateReviewInputV1 {
    result: TaskMapCalendarProducerResultV1;
    extraction: TaskMapCalendarExtractionReportV1;
    previous: TaskMapNativeCandidateReviewV1 | null;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
}
export interface BuildTaskMapCalendarCandidateShelfInputV1 {
    result: TaskMapCalendarProducerResultV1;
    extraction: TaskMapCalendarExtractionReportV1;
    overlay: TaskMapNativeCandidateReviewV1;
    expectedOwnerScopeDigest: string;
    assessedAt: string;
}
export interface TaskMapCalendarCandidateReviewProjectionV1 {
    overlay: TaskMapNativeCandidateReviewV1;
    shelf: TaskMapNativeCandidateShelfV2;
}
export declare function buildTaskMapCalendarCandidateShelf(input: BuildTaskMapCalendarCandidateShelfInputV1): TaskMapNativeCandidateShelfV2;
export declare function buildTaskMapCalendarCandidateReview(input: BuildTaskMapCalendarCandidateReviewInputV1): TaskMapCalendarCandidateReviewProjectionV1;
