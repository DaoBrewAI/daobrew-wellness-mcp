import { type TaskMapAgentSessionProposalClusterV2, type TaskMapAgentSessionSemanticAdmissionV2 } from "./agent-session-semantic-admission.js";
import type { TaskMapAgentSessionExtractionReportV1 } from "./agent-session-refresh-llm-replay.js";
import { type TaskMapNativeCandidateReviewV1, type TaskMapNativeCandidateShelfV2 } from "./native-candidate-review.js";
export { TASKMAP_AGENT_SESSION_CANDIDATE_STATEMENT_DOMAIN, } from "./native-candidate-review.js";
export declare const TASKMAP_AGENT_SESSION_CANDIDATE_EVIDENCE_DOMAIN: "taskmap-agent-session-candidate-evidence.3";
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
export declare function taskMapAgentSessionCandidateEvidenceProofDigest(ownerScopeDigest: string, cluster: TaskMapAgentSessionProposalClusterV2, support: TaskMapAgentSessionProposalClusterV2["supports"][number], mentionIdentityDigest: string, envelopeDigest: string): string;
export declare function buildTaskMapAgentSessionCandidateShelf(input: BuildTaskMapAgentSessionCandidateShelfInputV2): TaskMapNativeCandidateShelfV2;
export declare function buildTaskMapAgentSessionCandidateReview(input: BuildTaskMapAgentSessionCandidateReviewInputV2): TaskMapAgentSessionCandidateReviewProjectionV2;
