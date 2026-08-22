import type {
  TaskMapAgentSessionProposalClusterV2,
} from "./agent-session-semantic-admission.js";
import {
  TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES,
  TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES,
  type TaskMapRenderedMentionPromptV1,
} from "./native-meeting-extraction.js";
import {
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER =
  "\n<<<BEGIN_UNTRUSTED_AGENT_SESSION_V1>>>\n";
export const TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER =
  "\n<<<END_UNTRUSTED_AGENT_SESSION_V1>>>\n";

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function renderTaskMapAgentSessionMentionPrompt(
  promptTemplate: string,
  body: string,
): TaskMapRenderedMentionPromptV1 {
  if (
    typeof promptTemplate !== "string"
    || promptTemplate.length === 0
    || byteLength(promptTemplate) > TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map prompt template");
  }
  if (
    typeof body !== "string"
    || body.length === 0
    || byteLength(body) > TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES
  ) {
    throw new Error("Invalid Task Map agent-session body");
  }
  const promptText = promptTemplate
    + TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER
    + body
    + TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER;
  return Object.freeze({
    promptText,
    promptTemplateDigest: taskMapContractDigest(promptTemplate),
    inputDigest: taskMapContractDigest(body),
    promptDigest: taskMapContractDigest(promptText),
  });
}

export function taskMapAgentSessionExtractionBody(
  cluster: TaskMapAgentSessionProposalClusterV2,
): string {
  return cluster.userDirectiveSummary
    + "\n\n"
    + (cluster.assistantOutcomeSummary ?? "No agent outcome was recorded.");
}
