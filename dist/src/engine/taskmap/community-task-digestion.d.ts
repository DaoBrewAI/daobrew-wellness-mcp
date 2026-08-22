import { type LlmStation, type LlmProviderId } from "./llm-station.js";
import { type TaskMapMeetingExtractionDegradationCode } from "./meeting-refresh-llm-replay.js";
import { type TaskMapRenderedMentionPromptV1 } from "./native-meeting-extraction.js";
import type { TaskMapNativeCommunityRootEvidenceV1 } from "./native-community-shadow.js";
export declare const TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID: "community-task-extraction-v1";
export declare const TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION: "taskmap-community-task-digestion.v1";
export declare const TASKMAP_COMMUNITY_TASK_IDENTITY_DOMAIN: "taskmap-community-task-identity.1";
export declare const TASKMAP_COMMUNITY_TASK_PROPOSAL_DOMAIN: "taskmap-community-task-proposal.1";
export declare const TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1: Readonly<{
    readonly maxTasksPerRoot: 5;
    readonly maxEvidencePerRoot: 5;
}>;
export declare const TASKMAP_COMMUNITY_TASK_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n";
export declare const TASKMAP_COMMUNITY_TASK_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n";
export interface TaskMapCommunityTaskDigestionTaskV1 {
    taskProposalId: string;
    rootProposalId: string;
    taskIdentityDigest: string;
    title: string;
    summary: string;
    evidenceEventIds: string[];
    confidence: number;
}
export interface TaskMapCommunityTaskDigestionRootV1 {
    rootProposalId: string;
    inputDigest: string;
    status: "digested" | "degraded";
    degradationCode: TaskMapMeetingExtractionDegradationCode | null;
    envelopeDigest: string | null;
    envelopeModel: string | null;
    envelopeTransport: LlmProviderId | null;
    tasks: TaskMapCommunityTaskDigestionTaskV1[];
}
export interface TaskMapCommunityTaskDigestionV1 {
    contractVersion: typeof TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION;
    promptTemplateDigest: string;
    roots: TaskMapCommunityTaskDigestionRootV1[];
    digestedRootCount: number;
    degradedRootCount: number;
    digestionDigest: string;
}
export interface DigestTaskMapCommunityRootTasksInputV1 {
    rootEvidence: TaskMapNativeCommunityRootEvidenceV1;
    taskMapRoot: string;
    promptTemplatePath: string;
    station?: LlmStation | null;
    signal?: AbortSignal;
    persist?: boolean;
}
/**
 * Read-only consumer for the authoritative refresh report. Candidate review
 * must never create a second provider path; it may only reuse this closed,
 * digest-verified artifact and then re-bind its evidence IDs to the current
 * semantic plan.
 */
export declare function loadTaskMapCommunityTaskDigestionReport(reportPath: string): Promise<TaskMapCommunityTaskDigestionV1 | null>;
interface DigestionEvidenceRowV1 {
    evidenceEventId: string;
    matchText: string;
    summary: string;
}
/**
 * Task identity is the normalized imperative title, shared with the current
 * Plan2 tasks so digested leaves dedupe against current work deterministically.
 */
export declare function taskMapCommunityTaskIdentityDigest(title: string): string;
/** One bounded per-root evidence bundle rendered for the extraction station. */
export declare function taskMapCommunityTaskExtractionBody(rows: readonly DigestionEvidenceRowV1[]): string;
export declare function renderTaskMapCommunityTaskExtractionPrompt(promptTemplate: string, body: string): TaskMapRenderedMentionPromptV1;
export declare function taskMapCommunityTaskExtractionEnvelopePath(taskMapRoot: string, inputDigest: string): string;
/**
 * Digests every Plan2 root's selected evidence into at most five semantic
 * review leaves per root. Envelopes are recorded under
 * `<taskMapRoot>/llm-envelopes/community-task-extraction-v1/` keyed by the
 * per-root body digest, so identical input replays byte-identically without
 * a live station. A root with no replayable envelope and no usable station
 * degrades to zero tasks; callers must then drop the root rather than invent
 * placeholder work.
 */
export declare function digestTaskMapCommunityRootTasks(input: DigestTaskMapCommunityRootTasksInputV1): Promise<TaskMapCommunityTaskDigestionV1>;
export {};
