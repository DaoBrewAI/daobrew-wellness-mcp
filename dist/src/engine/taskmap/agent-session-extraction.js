"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER = exports.TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER = void 0;
exports.renderTaskMapAgentSessionMentionPrompt = renderTaskMapAgentSessionMentionPrompt;
exports.taskMapAgentSessionExtractionBody = taskMapAgentSessionExtractionBody;
const native_meeting_extraction_js_1 = require("./native-meeting-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_AGENT_SESSION_V1>>>\n";
exports.TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_AGENT_SESSION_V1>>>\n";
function byteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
function renderTaskMapAgentSessionMentionPrompt(promptTemplate, body) {
    if (typeof promptTemplate !== "string"
        || promptTemplate.length === 0
        || byteLength(promptTemplate) > native_meeting_extraction_js_1.TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES) {
        throw new Error("Invalid Task Map prompt template");
    }
    if (typeof body !== "string"
        || body.length === 0
        || byteLength(body) > native_meeting_extraction_js_1.TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES) {
        throw new Error("Invalid Task Map agent-session body");
    }
    const promptText = promptTemplate
        + exports.TASKMAP_AGENT_SESSION_PROMPT_OPEN_DELIMITER
        + body
        + exports.TASKMAP_AGENT_SESSION_PROMPT_CLOSE_DELIMITER;
    return Object.freeze({
        promptText,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptTemplate),
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(body),
        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptText),
    });
}
function taskMapAgentSessionExtractionBody(cluster) {
    return cluster.userDirectiveSummary
        + "\n\n"
        + (cluster.assistantOutcomeSummary ?? "No agent outcome was recorded.");
}
