import { type TaskMapAgentSessionSemanticAdmissionV2 } from "./agent-session-semantic-admission.js";
import { type MentionActor, type MentionSpeechActClass } from "./mention-extraction.js";
import { type TaskMapLlmStationFactory, type TaskMapMeetingExtractionDegradationCode } from "./meeting-refresh-llm-replay.js";
export declare const TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION: "taskmap-agent-session-extraction-report.v1";
export declare const TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME: "taskmap-agent-session-extraction-report.v1.json";
export declare const TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE: "agent-session";
export declare const TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN: "taskmap-agent-session-mention-identity.1";
export interface TaskMapAgentSessionExtractionMentionV1 {
    text: string;
    title: string;
    speechActClass: MentionSpeechActClass;
    speechActActor: MentionActor;
    confidence: number;
    mentionIdentityDigest: string;
    proposalDisposition: "context_only" | "candidate_only";
    promotionEligible: boolean;
}
export interface TaskMapAgentSessionExtractionClusterV1 {
    clusterIdentityDigest: string;
    workstreamIdentityDigest: string;
    inputDigest: string;
    status: "extracted" | "degraded";
    degradationCode: TaskMapMeetingExtractionDegradationCode | null;
    envelopeDigest: string | null;
    envelopeModel: string | null;
    envelopeTransport: "claude-cli" | "codex-cli" | "gemini-remote" | null;
    mentions: TaskMapAgentSessionExtractionMentionV1[];
}
export interface TaskMapAgentSessionExtractionReportV1 {
    contractVersion: typeof TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION;
    ownerScopeDigest: string;
    admissionDigest: string;
    promptTemplateDigest: string;
    assessedAt: string;
    clusters: TaskMapAgentSessionExtractionClusterV1[];
    pendingCount: number;
    reportDigest: string;
}
export interface RefreshTaskMapAgentSessionExtractionInputV1 {
    admission: TaskMapAgentSessionSemanticAdmissionV2;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
    assessedAt: string;
    createStation?: TaskMapLlmStationFactory;
    signal?: AbortSignal;
    persist?: boolean;
}
export interface LoadVerifiedTaskMapAgentSessionExtractionReportInputV1 {
    admission: TaskMapAgentSessionSemanticAdmissionV2;
    taskMapRoot: string;
    runtimeRoot: string;
    ownerScopeDigest: string;
    promptTemplatePath: string;
}
export declare function refreshTaskMapAgentSessionExtraction(input: RefreshTaskMapAgentSessionExtractionInputV1): Promise<TaskMapAgentSessionExtractionReportV1>;
export declare function loadVerifiedTaskMapAgentSessionExtractionReport(input: LoadVerifiedTaskMapAgentSessionExtractionReportInputV1): Promise<TaskMapAgentSessionExtractionReportV1 | null>;
