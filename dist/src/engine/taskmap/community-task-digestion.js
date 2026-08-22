"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COMMUNITY_TASK_PROMPT_CLOSE_DELIMITER = exports.TASKMAP_COMMUNITY_TASK_PROMPT_OPEN_DELIMITER = exports.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1 = exports.TASKMAP_COMMUNITY_TASK_PROPOSAL_DOMAIN = exports.TASKMAP_COMMUNITY_TASK_IDENTITY_DOMAIN = exports.TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION = exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID = void 0;
exports.loadTaskMapCommunityTaskDigestionReport = loadTaskMapCommunityTaskDigestionReport;
exports.taskMapCommunityTaskIdentityDigest = taskMapCommunityTaskIdentityDigest;
exports.taskMapCommunityTaskExtractionBody = taskMapCommunityTaskExtractionBody;
exports.renderTaskMapCommunityTaskExtractionPrompt = renderTaskMapCommunityTaskExtractionPrompt;
exports.taskMapCommunityTaskExtractionEnvelopePath = taskMapCommunityTaskExtractionEnvelopePath;
exports.digestTaskMapCommunityRootTasks = digestTaskMapCommunityRootTasks;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const native_meeting_extraction_js_1 = require("./native-meeting-extraction.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const mention_normalization_js_1 = require("./mention-normalization.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID = "community-task-extraction-v1";
exports.TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION = "taskmap-community-task-digestion.v1";
exports.TASKMAP_COMMUNITY_TASK_IDENTITY_DOMAIN = "taskmap-community-task-identity.1";
exports.TASKMAP_COMMUNITY_TASK_PROPOSAL_DOMAIN = "taskmap-community-task-proposal.1";
exports.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1 = Object.freeze({
    maxTasksPerRoot: 5,
    maxEvidencePerRoot: 5,
});
exports.TASKMAP_COMMUNITY_TASK_PROMPT_OPEN_DELIMITER = "\n<<<BEGIN_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n";
exports.TASKMAP_COMMUNITY_TASK_PROMPT_CLOSE_DELIMITER = "\n<<<END_UNTRUSTED_COMMUNITY_EVIDENCE_V1>>>\n";
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const ENVELOPE_KEYS = new Set([
    "inputDigest",
    "model",
    "outputJson",
    "producedAt",
    "promptDigest",
    "stationId",
    "transport",
]);
const DIGESTION_TRANSPORTS = new Set([
    "claude-cli",
    "codex-cli",
    "cursor-cli",
    "gemini-remote",
]);
const TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_MAX_BYTES = 1_048_576;
/**
 * Read-only consumer for the authoritative refresh report. Candidate review
 * must never create a second provider path; it may only reuse this closed,
 * digest-verified artifact and then re-bind its evidence IDs to the current
 * semantic plan.
 */
async function loadTaskMapCommunityTaskDigestionReport(reportPath) {
    let file;
    try {
        file = await (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(reportPath, TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_MAX_BYTES, "owner_private");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        return null;
    }
    let value;
    try {
        const decoded = new TextDecoder("utf-8", { fatal: true })
            .decode(file.bytes);
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(decoded);
        value = JSON.parse(decoded);
    }
    catch {
        return null;
    }
    if (!isRecord(value))
        return null;
    const keys = Object.keys(value).sort();
    if (keys.join("\0") !== [
        "contractVersion", "degradedRootCount", "digestedRootCount",
        "digestionDigest", "promptTemplateDigest", "roots",
    ].sort().join("\0"))
        return null;
    if (value.contractVersion !== exports.TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION
        || typeof value.promptTemplateDigest !== "string"
        || !/^[a-f0-9]{64}$/.test(value.promptTemplateDigest)
        || !Array.isArray(value.roots)
        || !Number.isSafeInteger(value.digestedRootCount)
        || !Number.isSafeInteger(value.degradedRootCount))
        return null;
    const roots = [];
    const rootIDs = new Set();
    for (const row of value.roots) {
        if (!isRecord(row))
            return null;
        if (Object.keys(row).sort().join("\0") !== [
            "degradationCode", "envelopeDigest", "envelopeModel",
            "envelopeTransport", "inputDigest", "rootProposalId", "status",
            "tasks",
        ].sort().join("\0"))
            return null;
        if (typeof row.rootProposalId !== "string"
            || row.rootProposalId.length === 0
            || row.rootProposalId.length > 192
            || rootIDs.has(row.rootProposalId)
            || typeof row.inputDigest !== "string"
            || !/^[a-f0-9]{64}$/.test(row.inputDigest)
            || (row.status !== "digested" && row.status !== "degraded")
            || !Array.isArray(row.tasks)
            || (row.envelopeTransport !== null
                && !DIGESTION_TRANSPORTS.has(row.envelopeTransport)))
            return null;
        rootIDs.add(row.rootProposalId);
        const tasks = [];
        const taskIDs = new Set();
        for (const task of row.tasks) {
            if (!isRecord(task))
                return null;
            if (Object.keys(task).sort().join("\0") !== [
                "confidence", "evidenceEventIds", "rootProposalId", "summary",
                "taskIdentityDigest", "taskProposalId", "title",
            ].sort().join("\0"))
                return null;
            if (typeof task.taskProposalId !== "string"
                || task.taskProposalId.length === 0
                || task.taskProposalId.length > 192
                || taskIDs.has(task.taskProposalId)
                || task.rootProposalId !== row.rootProposalId
                || typeof task.taskIdentityDigest !== "string"
                || !/^[a-f0-9]{64}$/.test(task.taskIdentityDigest)
                || typeof task.title !== "string"
                || task.title.trim().length === 0
                || task.title.length > 120
                || typeof task.summary !== "string"
                || task.summary.trim().length === 0
                || task.summary.length > 240
                || !Array.isArray(task.evidenceEventIds)
                || task.evidenceEventIds.some((id) => typeof id !== "string")
                || typeof task.confidence !== "number"
                || !Number.isFinite(task.confidence))
                return null;
            taskIDs.add(task.taskProposalId);
            tasks.push(task);
        }
        roots.push({
            ...row,
            tasks,
        });
    }
    if (roots.filter((row) => row.status === "digested" && row.tasks.length > 0).length
        !== value.digestedRootCount
        || roots.filter((row) => row.status === "degraded").length
            !== value.degradedRootCount)
        return null;
    const payload = {
        contractVersion: value.contractVersion,
        promptTemplateDigest: value.promptTemplateDigest,
        roots,
        digestedRootCount: value.digestedRootCount,
        degradedRootCount: value.degradedRootCount,
    };
    if (typeof value.digestionDigest !== "string"
        || value.digestionDigest !== (0, source_contracts_js_1.taskMapContractDigest)(payload))
        return null;
    return deepFreeze({
        ...payload,
        digestionDigest: value.digestionDigest,
    });
}
function unavailable(code, cause) {
    const error = new meeting_refresh_llm_replay_js_1.TaskMapMeetingExtractionUnavailableError(code);
    if (cause !== undefined)
        error.cause = cause;
    throw error;
}
function compareCodePoint(left, right) {
    const leftScalars = Array.from(left);
    const rightScalars = Array.from(right);
    const sharedLength = Math.min(leftScalars.length, rightScalars.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = leftScalars[index].codePointAt(0)
            - rightScalars[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftScalars.length - rightScalars.length;
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function validTimestamp(value) {
    if (typeof value !== "string" || !STRICT_RFC3339.test(value))
        return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
/**
 * Task identity is the normalized imperative title, shared with the current
 * Plan2 tasks so digested leaves dedupe against current work deterministically.
 */
function taskMapCommunityTaskIdentityDigest(title) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_COMMUNITY_TASK_IDENTITY_DOMAIN,
        normalizedTitle: (0, mention_normalization_js_1.normalizeMentionText)(title),
    });
}
/** One bounded per-root evidence bundle rendered for the extraction station. */
function taskMapCommunityTaskExtractionBody(rows) {
    return rows.map((row, index) => `[EVIDENCE ${index + 1}]\n${row.matchText}`).join("\n\n");
}
function renderTaskMapCommunityTaskExtractionPrompt(promptTemplate, body) {
    if (typeof promptTemplate !== "string" || promptTemplate.length === 0) {
        throw new Error("Invalid Task Map community task prompt template");
    }
    if (typeof body !== "string"
        || body.length === 0
        || Buffer.byteLength(body, "utf8") > native_meeting_extraction_js_1.TASKMAP_GRANOLA_NOTE_BODY_MAX_BYTES) {
        throw new Error("Invalid Task Map community task extraction body");
    }
    const promptText = promptTemplate
        + exports.TASKMAP_COMMUNITY_TASK_PROMPT_OPEN_DELIMITER
        + body
        + exports.TASKMAP_COMMUNITY_TASK_PROMPT_CLOSE_DELIMITER;
    return Object.freeze({
        promptText,
        promptTemplateDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptTemplate),
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(body),
        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(promptText),
    });
}
function taskMapCommunityTaskExtractionEnvelopePath(taskMapRoot, inputDigest) {
    if (!/^[a-f0-9]{64}$/.test(inputDigest))
        unavailable("invalid_input_digest");
    return node_path_1.default.join(taskMapRoot, "llm-envelopes", exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID, `${inputDigest}.json`);
}
function validateDigestionEnvelope(value, expected, body, failureCode = "envelope_tampered") {
    if (!isRecord(value)
        || Object.keys(value).length !== ENVELOPE_KEYS.size
        || Object.keys(value).some((key) => !ENVELOPE_KEYS.has(key))) {
        unavailable(failureCode);
    }
    if (value.stationId !== exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID
        || value.promptDigest !== expected.promptDigest
        || value.inputDigest !== expected.inputDigest
        || !DIGESTION_TRANSPORTS.has(value.transport)
        || typeof value.model !== "string"
        || value.model.length === 0
        || value.model.length > 256
        || /[\u0000-\u001f\u007f]/.test(value.model)
        || typeof value.outputJson !== "string"
        || Buffer.byteLength(value.outputJson, "utf8")
            > meeting_refresh_llm_replay_js_1.TASKMAP_LLM_ENVELOPE_MAX_BYTES
        || !validTimestamp(value.producedAt)) {
        unavailable(failureCode);
    }
    try {
        (0, mention_extraction_js_1.validateMentionExtraction)(value.outputJson, body);
    }
    catch (error) {
        unavailable(failureCode, error);
    }
    return Object.freeze({
        stationId: exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
        model: value.model,
        promptDigest: value.promptDigest,
        inputDigest: value.inputDigest,
        outputJson: value.outputJson,
        producedAt: value.producedAt,
        transport: value.transport,
    });
}
async function ensureDigestionEnvelopeDirectory(taskMapRoot) {
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(taskMapRoot, false);
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(node_path_1.default.join(taskMapRoot, "llm-envelopes"), true);
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(node_path_1.default.join(taskMapRoot, "llm-envelopes", exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID), true);
}
async function loadDigestionEnvelope(taskMapRoot, expected, body) {
    await ensureDigestionEnvelopeDirectory(taskMapRoot);
    const envelopePath = taskMapCommunityTaskExtractionEnvelopePath(taskMapRoot, expected.inputDigest);
    try {
        await (0, promises_1.lstat)(envelopePath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        unavailable("envelope_store_unavailable", error);
    }
    const file = await (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(envelopePath, meeting_refresh_llm_replay_js_1.TASKMAP_LLM_ENVELOPE_MAX_BYTES, "owner_private");
    let parsed;
    try {
        const decoded = new TextDecoder("utf-8", { fatal: true })
            .decode(file.bytes);
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(decoded);
        parsed = JSON.parse(decoded);
    }
    catch (error) {
        unavailable("envelope_tampered", error);
    }
    return validateDigestionEnvelope(parsed, expected, body);
}
function extractionFailureCode(error) {
    if (error instanceof meeting_refresh_llm_replay_js_1.TaskMapMeetingExtractionUnavailableError) {
        if (error.code === "invalid_extraction_output") {
            return "invalid_extraction_output";
        }
        if (error.code === "envelope_tampered")
            return "envelope_tampered";
        if (error.code === "extraction_aborted")
            return "provider_timeout";
        return "envelope_store_unavailable";
    }
    return (0, meeting_refresh_llm_replay_js_1.stationDegradationCode)(error);
}
function degradedRow(rootProposalId, inputDigest, degradationCode) {
    return {
        rootProposalId,
        inputDigest,
        status: "degraded",
        degradationCode,
        envelopeDigest: null,
        envelopeModel: null,
        envelopeTransport: null,
        tasks: [],
    };
}
/**
 * Deterministic mention→evidence binding. A mention survives only when its
 * verbatim span lies inside exactly one evidence excerpt; ambiguous or
 * unlocatable spans fail closed. Task identity comes from the normalized
 * imperative title, never from evidence identity, so repeated mentions of the
 * same work item fold into one task with merged citations.
 */
function tasksFromMentions(rootProposalId, rows, mentions) {
    const folded = new Map();
    mentions.forEach((mention, index) => {
        const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(mention.class, mention.actor);
        if (gate.promotionEligible === false)
            return;
        const matches = rows.filter((row) => (0, text_contract_js_1.toWellFormedText)(row.matchText).includes(mention.text));
        if (matches.length !== 1)
            return;
        const bound = matches[0];
        const taskIdentityDigest = taskMapCommunityTaskIdentityDigest(mention.title);
        const current = folded.get(taskIdentityDigest);
        if (current === undefined) {
            folded.set(taskIdentityDigest, {
                representative: mention,
                representativeSummary: bound.summary,
                firstIndex: index,
                evidenceEventIds: new Set([bound.evidenceEventId]),
                confidence: mention.confidence,
            });
            return;
        }
        current.evidenceEventIds.add(bound.evidenceEventId);
        current.confidence = Math.max(current.confidence, mention.confidence);
        if (mention.confidence > current.representative.confidence) {
            current.representative = mention;
            current.representativeSummary = bound.summary;
        }
    });
    return [...folded.entries()]
        .sort(([leftDigest, left], [rightDigest, right]) => right.confidence - left.confidence
        || left.firstIndex - right.firstIndex
        || compareCodePoint(leftDigest, rightDigest))
        .slice(0, exports.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot)
        .map(([taskIdentityDigest, fold]) => ({
        taskProposalId: `community-task-${(0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_COMMUNITY_TASK_PROPOSAL_DOMAIN,
            rootProposalId,
            taskIdentityDigest,
        }).slice(0, 16)}`,
        rootProposalId,
        taskIdentityDigest,
        title: fold.representative.title,
        summary: fold.representativeSummary,
        evidenceEventIds: [...fold.evidenceEventIds].sort(compareCodePoint),
        confidence: fold.confidence,
    }))
        .sort((left, right) => compareCodePoint(left.taskProposalId, right.taskProposalId));
}
/**
 * Digests every Plan2 root's selected evidence into at most five semantic
 * review leaves per root. Envelopes are recorded under
 * `<taskMapRoot>/llm-envelopes/community-task-extraction-v1/` keyed by the
 * per-root body digest, so identical input replays byte-identically without
 * a live station. A root with no replayable envelope and no usable station
 * degrades to zero tasks; callers must then drop the root rather than invent
 * placeholder work.
 */
async function digestTaskMapCommunityRootTasks(input) {
    const assertNotAborted = () => {
        if (input.signal?.aborted)
            unavailable("extraction_aborted");
    };
    assertNotAborted();
    const template = await (0, meeting_refresh_llm_replay_js_1.readPromptTemplate)(input.promptTemplatePath);
    const eventById = new Map(input.rootEvidence.taskMapInput.events.map((event) => [event.id, event]));
    const rootRows = [];
    const sortedRoots = [...input.rootEvidence.rootProposals].sort((left, right) => compareCodePoint(left.proposalId, right.proposalId));
    for (const root of sortedRoots) {
        const rows = [];
        for (const evidenceEventId of root.evidenceEventIds) {
            const event = eventById.get(evidenceEventId);
            if (event === undefined)
                continue;
            rows.push({
                evidenceEventId,
                matchText: `${event.title}\n${event.summary}`,
                summary: event.summary,
            });
        }
        if (rows.length === 0) {
            rootRows.push(degradedRow(root.proposalId, (0, source_contracts_js_1.taskMapContractDigest)({ emptyEvidence: root.proposalId }), "invalid_extraction_output"));
            continue;
        }
        const body = taskMapCommunityTaskExtractionBody(rows);
        const rendered = renderTaskMapCommunityTaskExtractionPrompt(template.bytes, body);
        let envelope;
        try {
            envelope = await loadDigestionEnvelope(input.taskMapRoot, rendered, body);
        }
        catch (error) {
            rootRows.push(degradedRow(root.proposalId, rendered.inputDigest, extractionFailureCode(error)));
            continue;
        }
        let tasks = null;
        if (envelope !== null) {
            const mentions = (0, mention_extraction_js_1.validateMentionExtraction)(envelope.outputJson, body).mentions;
            tasks = tasksFromMentions(root.proposalId, rows, mentions);
        }
        const healingPersistedEnvelope = envelope !== null
            && tasks?.length === 0;
        if (envelope === null || healingPersistedEnvelope) {
            const station = input.station ?? null;
            if (station === null) {
                rootRows.push(degradedRow(root.proposalId, rendered.inputDigest, "no_provider"));
                continue;
            }
            try {
                assertNotAborted();
                const candidate = await station.run({
                    stationId: exports.TASKMAP_COMMUNITY_TASK_EXTRACTION_STATION_ID,
                    promptText: rendered.promptText,
                    inputDigest: rendered.inputDigest,
                    signal: input.signal,
                });
                assertNotAborted();
                envelope = validateDigestionEnvelope(candidate, rendered, body, "invalid_extraction_output");
                const candidateMentions = (0, mention_extraction_js_1.validateMentionExtraction)(envelope.outputJson, body).mentions;
                tasks = tasksFromMentions(root.proposalId, rows, candidateMentions);
                if (tasks.length === 0)
                    unavailable("invalid_extraction_output");
                if (input.persist !== false) {
                    assertNotAborted();
                    const envelopePath = taskMapCommunityTaskExtractionEnvelopePath(input.taskMapRoot, rendered.inputDigest);
                    if (healingPersistedEnvelope) {
                        await (0, meeting_refresh_llm_replay_js_1.replacePrivateFile)(envelopePath, envelope);
                    }
                    else {
                        await (0, meeting_refresh_llm_replay_js_1.atomicPrivateWriteNew)(envelopePath, envelope);
                    }
                    assertNotAborted();
                    const durable = await loadDigestionEnvelope(input.taskMapRoot, rendered, body);
                    if (durable === null)
                        unavailable("envelope_store_unavailable");
                    envelope = durable;
                    const durableMentions = (0, mention_extraction_js_1.validateMentionExtraction)(envelope.outputJson, body).mentions;
                    tasks = tasksFromMentions(root.proposalId, rows, durableMentions);
                    if (tasks.length === 0)
                        unavailable("envelope_store_unavailable");
                }
            }
            catch (error) {
                rootRows.push(degradedRow(root.proposalId, rendered.inputDigest, extractionFailureCode(error)));
                continue;
            }
        }
        if (envelope === null || tasks === null || tasks.length === 0) {
            rootRows.push(degradedRow(root.proposalId, rendered.inputDigest, "invalid_extraction_output"));
            continue;
        }
        rootRows.push({
            rootProposalId: root.proposalId,
            inputDigest: rendered.inputDigest,
            status: "digested",
            degradationCode: null,
            envelopeDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope),
            envelopeModel: envelope.model,
            envelopeTransport: envelope.transport,
            tasks,
        });
    }
    const payload = {
        contractVersion: exports.TASKMAP_COMMUNITY_TASK_DIGESTION_VERSION,
        promptTemplateDigest: template.digest,
        roots: rootRows,
        digestedRootCount: rootRows.filter((row) => row.status === "digested" && row.tasks.length > 0).length,
        degradedRootCount: rootRows.filter((row) => row.status === "degraded").length,
    };
    return deepFreeze({
        ...payload,
        digestionDigest: (0, source_contracts_js_1.taskMapContractDigest)(payload),
    });
}
