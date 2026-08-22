"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER = exports.TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER = exports.TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS = void 0;
exports.buildTaskMapCalendarExtractionSegments = buildTaskMapCalendarExtractionSegments;
exports.renderTaskMapCalendarMentionPrompt = renderTaskMapCalendarMentionPrompt;
const native_meeting_extraction_js_1 = require("./native-meeting-extraction.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS = 24;
exports.TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";
exports.TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_CALENDAR_SEGMENT_V1>>>\n";
function byteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
function buildTaskMapCalendarExtractionSegments(events) {
    const ordered = [...events].sort((left, right) => left.startAt.localeCompare(right.startAt)
        || left.eventIdentityDigest.localeCompare(right.eventIdentityDigest));
    const segments = [];
    for (let offset = 0; offset < ordered.length; offset += exports.TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS) {
        const members = ordered.slice(offset, offset + exports.TASKMAP_CALENDAR_SEGMENT_MAX_EVENTS);
        const body = members.map((event) => `- ${event.title} (${event.startAt} to ${event.endAt})\n`).join("");
        segments.push(Object.freeze({
            segmentIndex: segments.length,
            body,
            inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(body),
            eventIdentityDigests: Object.freeze(members.map((event) => event.eventIdentityDigest)),
        }));
    }
    return segments;
}
function renderTaskMapCalendarMentionPrompt(promptTemplate, body) {
    if (typeof promptTemplate !== "string"
        || promptTemplate.length === 0
        || byteLength(promptTemplate) > native_meeting_extraction_js_1.TASKMAP_MENTION_PROMPT_TEMPLATE_MAX_BYTES) {
        throw new Error("Invalid Task Map prompt template");
    }
    if (typeof body !== "string"
        || body.length === 0
        || byteLength(body) > native_meeting_extraction_js_1.TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES) {
        throw new Error("Invalid Task Map calendar segment body");
    }
    const promptText = promptTemplate
        + exports.TASKMAP_CALENDAR_PROMPT_OPEN_DELIMITER
        + body
        + exports.TASKMAP_CALENDAR_PROMPT_CLOSE_DELIMITER;
    return Object.freeze({
        promptText,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptTemplate),
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(body),
        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptText),
    });
}
