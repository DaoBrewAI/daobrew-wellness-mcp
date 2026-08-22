import type { TaskMapAgentSessionProposalClusterV2 } from "./agent-session-semantic-admission.js";
import { type TaskMapRenderedMentionPromptV1 } from "./native-meeting-extraction.js";
export declare const TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_AGENT_SESSION_V1>>>\n";
export declare const TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_AGENT_SESSION_V1>>>\n";
export declare function renderTaskMapAgentSessionMentionPrompt(promptTemplate: string, body: string): TaskMapRenderedMentionPromptV1;
export declare function taskMapAgentSessionExtractionBody(cluster: TaskMapAgentSessionProposalClusterV2): string;
