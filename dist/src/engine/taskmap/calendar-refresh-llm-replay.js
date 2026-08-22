"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN = exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE = exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME = exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION = void 0;
exports.refreshTaskMapCalendarExtraction = refreshTaskMapCalendarExtraction;
exports.loadCurrentTaskMapCalendarExtractionProof = loadCurrentTaskMapCalendarExtractionProof;
exports.loadVerifiedTaskMapCalendarExtractionReport = loadVerifiedTaskMapCalendarExtractionReport;
exports.buildTaskMapCalendarSemanticFragment = buildTaskMapCalendarSemanticFragment;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const calendar_extraction_js_1 = require("./calendar-extraction.js");
const calendar_producer_freshness_js_1 = require("./calendar-producer-freshness.js");
const llm_station_js_1 = require("./llm-station.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const mention_normalization_js_1 = require("./mention-normalization.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
const types_js_1 = require("./types.js");
exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION = "taskmap-calendar-extraction-report.v1";
exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME = "taskmap-calendar-extraction-report.v1.json";
exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE = "calendar";
exports.TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN = "taskmap-calendar-mention-identity.1";
const SHA256 = /^[a-f0-9]{64}$/;
const REPORT_KEYS = new Set([
    "contractVersion", "ownerScopeDigest", "resultDigest",
    "promptTemplateDigest", "assessedAt", "segments", "pendingCount",
    "reportDigest",
]);
const SEGMENT_KEYS = new Set([
    "segmentIndex", "inputDigest", "eventIdentityDigests", "status",
    "degradationCode", "envelopeDigest", "envelopeModel",
    "envelopeTransport", "mentions",
]);
const MENTION_KEYS = new Set([
    "text", "title", "speechActClass", "speechActActor", "confidence",
    "mentionIdentityDigest", "proposalDisposition", "promotionEligible",
]);
const SPEECH_ACT_CLASSES = new Set([
    "request", "commitment", "decision", "other",
]);
const SPEECH_ACT_ACTORS = new Set([
    "self", "other", "unknown",
]);
const DEGRADATION_CODES = new Set([
    "raw_snapshot_unavailable", "raw_snapshot_malformed",
    "raw_snapshot_limit_exceeded", "invalid_note_contract", "no_provider",
    "provider_unauthenticated", "provider_rate_limited", "provider_timeout",
    "provider_nonzero_exit",
    "provider_malformed_wrapper", "provider_empty_output",
    "provider_runner_failure", "invalid_extraction_output",
    "remote_consent_required",
    "envelope_tampered", "envelope_store_unavailable",
]);
function unavailable(code, cause) {
    const error = new meeting_refresh_llm_replay_js_1.TaskMapMeetingExtractionUnavailableError(code);
    if (cause !== undefined)
        error.cause = cause;
    throw error;
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const keys = Object.keys(value);
    return keys.length === expected.size && keys.every((key) => expected.has(key));
}
function validTimestamp(value) {
    if (typeof value !== "string" || value.length > 64)
        return false;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
function envelopeDigest(envelope) {
    return (0, source_contracts_js_1.taskMapContractDigest)(envelope);
}
function reportEnvelopeTransport(envelope) {
    if (envelope.transport !== "claude-cli"
        && envelope.transport !== "codex-cli"
        && envelope.transport !== "gemini-remote")
        unavailable("invalid_extraction_output");
    return envelope.transport;
}
function mentionsFromEnvelope(envelope, body) {
    const byIdentity = new Map();
    for (const mention of (0, mention_extraction_js_1.validateMentionExtraction)(envelope.outputJson, body).mentions) {
        const mentionIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            domain: exports.TASKMAP_CALENDAR_MENTION_IDENTITY_DOMAIN,
            normalizedText: (0, mention_normalization_js_1.normalizeMentionText)(mention.text),
        });
        const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(mention.class, mention.actor);
        const current = byIdentity.get(mentionIdentityDigest);
        if (current === undefined) {
            byIdentity.set(mentionIdentityDigest, {
                representative: mention,
                promotionEligible: gate.promotionEligible,
            });
            continue;
        }
        current.promotionEligible &&= gate.promotionEligible;
        if (mention.confidence > current.representative.confidence) {
            current.representative = mention;
        }
    }
    return [...byIdentity.entries()].map(([mentionIdentityDigest, folded,]) => {
        const mention = folded.representative;
        const gate = (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(mention.class, mention.actor);
        return Object.freeze({
            text: mention.text,
            title: mention.title,
            speechActClass: mention.class,
            speechActActor: mention.actor,
            confidence: mention.confidence,
            mentionIdentityDigest,
            proposalDisposition: gate.proposalDisposition,
            promotionEligible: folded.promotionEligible,
        });
    });
}
function degradedRow(segment, degradationCode) {
    return {
        segmentIndex: segment.segmentIndex,
        inputDigest: segment.inputDigest,
        eventIdentityDigests: [...segment.eventIdentityDigests],
        status: "degraded",
        degradationCode,
        envelopeDigest: null,
        envelopeModel: null,
        envelopeTransport: null,
        mentions: [],
    };
}
function extractionFailureCode(error) {
    if (error instanceof meeting_refresh_llm_replay_js_1.TaskMapMeetingExtractionUnavailableError) {
        if (error.code === "invalid_extraction_output") {
            return "invalid_extraction_output";
        }
        if (error.code === "envelope_tampered")
            return "envelope_tampered";
        return "envelope_store_unavailable";
    }
    return (0, meeting_refresh_llm_replay_js_1.stationDegradationCode)(error);
}
function finalizeReport(report) {
    return deepFreeze({
        ...report,
        reportDigest: (0, source_contracts_js_1.taskMapContractDigest)(report),
    });
}
function assertMention(value) {
    if (!isRecord(value) || !hasExactKeys(value, MENTION_KEYS)) {
        unavailable("calendar_extraction_report_malformed");
    }
    if (typeof value.text !== "string" || value.text.length === 0
        || typeof value.title !== "string" || value.title.length === 0
        || !SPEECH_ACT_CLASSES.has(value.speechActClass)
        || !SPEECH_ACT_ACTORS.has(value.speechActActor)
        || typeof value.confidence !== "number"
        || !Number.isFinite(value.confidence)
        || value.confidence < 0 || value.confidence > 1
        || typeof value.mentionIdentityDigest !== "string"
        || !SHA256.test(value.mentionIdentityDigest)
        || (value.proposalDisposition !== "candidate_only"
            && value.proposalDisposition !== "context_only")
        || typeof value.promotionEligible !== "boolean")
        unavailable("calendar_extraction_report_malformed");
}
function parseReport(bytes) {
    let value;
    try {
        const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(decoded);
        value = JSON.parse(decoded);
    }
    catch (error) {
        unavailable("calendar_extraction_report_malformed", error);
    }
    if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
        unavailable("calendar_extraction_report_malformed");
    }
    if (value.contractVersion !== exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION
        || typeof value.ownerScopeDigest !== "string"
        || !SHA256.test(value.ownerScopeDigest)
        || typeof value.resultDigest !== "string" || !SHA256.test(value.resultDigest)
        || typeof value.promptTemplateDigest !== "string"
        || !SHA256.test(value.promptTemplateDigest)
        || !validTimestamp(value.assessedAt)
        || !Array.isArray(value.segments) || value.segments.length > 22
        || !Number.isSafeInteger(value.pendingCount)
        || value.pendingCount < 0
        || typeof value.reportDigest !== "string" || !SHA256.test(value.reportDigest))
        unavailable("calendar_extraction_report_malformed");
    let pendingCount = 0;
    for (let index = 0; index < value.segments.length; index += 1) {
        const row = value.segments[index];
        if (!isRecord(row) || !hasExactKeys(row, SEGMENT_KEYS)) {
            unavailable("calendar_extraction_report_malformed");
        }
        if (row.segmentIndex !== index
            || typeof row.inputDigest !== "string" || !SHA256.test(row.inputDigest)
            || !Array.isArray(row.eventIdentityDigests)
            || row.eventIdentityDigests.length === 0
            || row.eventIdentityDigests.length > 24
            || row.eventIdentityDigests.some((digest) => typeof digest !== "string" || !SHA256.test(digest))
            || (row.status !== "extracted" && row.status !== "degraded")
            || !Array.isArray(row.mentions) || row.mentions.length > 20)
            unavailable("calendar_extraction_report_malformed");
        row.mentions.forEach(assertMention);
        const seenMentionIdentities = new Set();
        for (const mention of row.mentions) {
            const mentionIdentityDigest = mention.mentionIdentityDigest;
            if (seenMentionIdentities.has(mentionIdentityDigest)) {
                unavailable("calendar_extraction_report_malformed");
            }
            seenMentionIdentities.add(mentionIdentityDigest);
        }
        if (row.status === "degraded")
            pendingCount += 1;
        if (row.status === "extracted") {
            if (row.degradationCode !== null
                || typeof row.envelopeDigest !== "string"
                || !SHA256.test(row.envelopeDigest)
                || typeof row.envelopeModel !== "string" || row.envelopeModel.length === 0
                || (row.envelopeTransport !== "claude-cli"
                    && row.envelopeTransport !== "codex-cli"
                    && row.envelopeTransport !== "gemini-remote"))
                unavailable("calendar_extraction_report_malformed");
        }
        else if (typeof row.degradationCode !== "string"
            || !DEGRADATION_CODES.has(row.degradationCode)
            || row.envelopeDigest !== null || row.envelopeModel !== null
            || row.envelopeTransport !== null || row.mentions.length !== 0)
            unavailable("calendar_extraction_report_malformed");
    }
    if (pendingCount !== value.pendingCount) {
        unavailable("calendar_extraction_report_malformed");
    }
    const { reportDigest, ...payload } = value;
    if ((0, source_contracts_js_1.taskMapContractDigest)(payload) !== reportDigest) {
        unavailable("calendar_extraction_report_tampered");
    }
    return value;
}
function assertInput(result, ownerScopeDigest) {
    if (!SHA256.test(ownerScopeDigest)
        || result.ownerScopeDigest !== ownerScopeDigest
        || !SHA256.test(result.resultDigest)
        || result.availability !== "available")
        unavailable("calendar_result_invalid");
}
async function refreshTaskMapCalendarExtraction(input) {
    const assertNotAborted = () => {
        if (input.signal?.aborted)
            unavailable("extraction_aborted");
    };
    assertNotAborted();
    assertInput(input.result, input.ownerScopeDigest);
    if (!validTimestamp(input.assessedAt)
        || input.result.assessedAt !== input.assessedAt)
        unavailable("assessed_at_invalid");
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(input.runtimeRoot, false);
    let template;
    try {
        template = await (0, meeting_refresh_llm_replay_js_1.readPromptTemplate)(input.promptTemplatePath);
    }
    catch (error) {
        throw new meeting_refresh_llm_replay_js_1.TaskMapPromptTemplateUnavailableError({ cause: error });
    }
    const sourceSegments = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(input.result.events);
    const createStation = input.createStation
        ?? ((signal) => (0, llm_station_js_1.createLlmStation)({ signal }));
    let stationPromise;
    const segments = [];
    for (const segment of sourceSegments) {
        const rendered = (0, calendar_extraction_js_1.renderTaskMapCalendarMentionPrompt)(template.bytes, segment.body);
        let envelope;
        try {
            envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, segment.body, exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
        }
        catch (error) {
            segments.push(degradedRow(segment, extractionFailureCode(error)));
            continue;
        }
        if (envelope === null) {
            stationPromise ??= createStation(input.signal);
            let station;
            try {
                station = await stationPromise;
            }
            catch (error) {
                segments.push(degradedRow(segment, (0, meeting_refresh_llm_replay_js_1.stationDegradationCode)(error)));
                continue;
            }
            try {
                assertNotAborted();
                const candidate = await station.run({
                    stationId: llm_station_js_1.LLM_STATION_ID,
                    promptText: rendered.promptText,
                    inputDigest: rendered.inputDigest,
                    signal: input.signal,
                });
                assertNotAborted();
                envelope = (0, meeting_refresh_llm_replay_js_1.validateEnvelope)(candidate, rendered, segment.body, "invalid_extraction_output");
                if (input.persist !== false) {
                    assertNotAborted();
                    await (0, meeting_refresh_llm_replay_js_1.atomicPrivateWriteNew)((0, meeting_refresh_llm_replay_js_1.taskMapMentionExtractionEnvelopePath)(input.taskMapRoot, rendered.inputDigest, exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE), envelope);
                    assertNotAborted();
                    const durable = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, segment.body, exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
                    if (durable === null)
                        unavailable("envelope_store_unavailable");
                    envelope = durable;
                }
            }
            catch (error) {
                segments.push(degradedRow(segment, extractionFailureCode(error)));
                continue;
            }
        }
        segments.push({
            segmentIndex: segment.segmentIndex,
            inputDigest: segment.inputDigest,
            eventIdentityDigests: [...segment.eventIdentityDigests],
            status: "extracted",
            degradationCode: null,
            envelopeDigest: envelopeDigest(envelope),
            envelopeModel: envelope.model,
            envelopeTransport: reportEnvelopeTransport(envelope),
            mentions: mentionsFromEnvelope(envelope, segment.body),
        });
    }
    const report = finalizeReport({
        contractVersion: exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        resultDigest: input.result.resultDigest,
        promptTemplateDigest: template.digest,
        assessedAt: input.assessedAt,
        segments,
        pendingCount: segments.filter((segment) => segment.status === "degraded").length,
    });
    assertNotAborted();
    if (input.persist === false)
        return report;
    await (0, meeting_refresh_llm_replay_js_1.replacePrivateFile)(node_path_1.default.join(input.runtimeRoot, exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME), report);
    const verified = await loadVerifiedTaskMapCalendarExtractionReport({
        result: input.result,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
    });
    if (verified === null)
        unavailable("calendar_extraction_report_stale");
    return verified;
}
/**
 * Reconstructs the producer result at the authenticated report's original
 * assessment instant, then delegates every proof check to the verified loader.
 */
async function loadCurrentTaskMapCalendarExtractionProof(input) {
    const current = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath: input.localExportPath,
        googleSnapshotPath: input.googleSnapshotPath,
        assessedAt: input.currentAssessedAt,
        expectedOwnerScopeDigest: input.ownerScopeDigest,
    });
    if (current.availability !== "available")
        return null;
    const reportPath = node_path_1.default.join(input.runtimeRoot, exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME);
    try {
        await (0, promises_1.lstat)(reportPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    let persisted;
    try {
        const reportFile = await (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(reportPath, meeting_refresh_llm_replay_js_1.TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES, "owner_private");
        persisted = parseReport(reportFile.bytes);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    if (persisted.ownerScopeDigest !== input.ownerScopeDigest)
        return null;
    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath: input.localExportPath,
        googleSnapshotPath: input.googleSnapshotPath,
        assessedAt: persisted.assessedAt,
        expectedOwnerScopeDigest: input.ownerScopeDigest,
    });
    if (result.availability !== "available")
        return null;
    const extraction = await loadVerifiedTaskMapCalendarExtractionReport({
        result,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
    });
    return extraction === null ? null : deepFreeze({ result, extraction });
}
async function loadVerifiedTaskMapCalendarExtractionReport(input) {
    assertInput(input.result, input.ownerScopeDigest);
    const reportPath = node_path_1.default.join(input.runtimeRoot, exports.TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME);
    try {
        await (0, promises_1.lstat)(reportPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        unavailable("calendar_extraction_report_unavailable", error);
    }
    const [template, reportFile] = await Promise.all([
        (0, meeting_refresh_llm_replay_js_1.readPromptTemplate)(input.promptTemplatePath),
        (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(reportPath, meeting_refresh_llm_replay_js_1.TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES, "owner_private"),
    ]);
    const report = parseReport(reportFile.bytes);
    if (report.ownerScopeDigest !== input.ownerScopeDigest
        || report.resultDigest !== input.result.resultDigest
        || report.promptTemplateDigest !== template.digest)
        return null;
    const sourceSegments = (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(input.result.events);
    if (report.segments.length !== sourceSegments.length)
        return null;
    for (const [index, row] of report.segments.entries()) {
        const segment = sourceSegments[index];
        if (segment === undefined
            || row.inputDigest !== segment.inputDigest
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(row.eventIdentityDigests)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(segment.eventIdentityDigests))
            return null;
        if (row.status === "extracted") {
            const rendered = (0, calendar_extraction_js_1.renderTaskMapCalendarMentionPrompt)(template.bytes, segment.body);
            const envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, segment.body, exports.TASKMAP_CALENDAR_ENVELOPE_NAMESPACE);
            if (envelope === null
                || row.envelopeDigest !== envelopeDigest(envelope)
                || row.envelopeModel !== envelope.model
                || row.envelopeTransport !== envelope.transport
                || (0, source_contracts_js_1.taskMapContractCanonicalJson)(row.mentions)
                    !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(mentionsFromEnvelope(envelope, segment.body)))
                unavailable("calendar_extraction_report_tampered");
        }
    }
    return deepFreeze(report);
}
function buildTaskMapCalendarSemanticFragment(result, report) {
    assertInput(result, report.ownerScopeDigest);
    if (report.resultDigest !== result.resultDigest
        || report.ownerScopeDigest !== result.ownerScopeDigest)
        unavailable("calendar_extraction_report_stale");
    const eventByIdentity = new Map(result.events.map((event) => [
        event.eventIdentityDigest,
        event,
    ]));
    const representativeByMention = new Map();
    for (const segment of report.segments) {
        if (segment.status !== "extracted")
            continue;
        for (const mention of segment.mentions) {
            const current = representativeByMention.get(mention.mentionIdentityDigest);
            if (current === undefined
                || mention.confidence > current.confidence
                || (mention.confidence === current.confidence
                    && mention.title.localeCompare(current.title) < 0)) {
                representativeByMention.set(mention.mentionIdentityDigest, mention);
            }
        }
    }
    const pointers = new Map();
    const sourceBindings = new Map();
    const events = [];
    const evidenceBindings = [];
    for (const segment of report.segments) {
        if (segment.status !== "extracted")
            continue;
        for (const eventIdentityDigest of segment.eventIdentityDigests) {
            const calendarEvent = eventByIdentity.get(eventIdentityDigest);
            if (calendarEvent === undefined) {
                unavailable("calendar_extraction_report_stale");
            }
            const pointerId = `tmcalptr_${eventIdentityDigest.slice(0, 16)}`;
            pointers.set(pointerId, {
                id: pointerId,
                sourceKind: calendarEvent.provider,
                sourceObjectId: eventIdentityDigest,
                sourceRefHash: eventIdentityDigest,
                sourceVersion: calendarEvent.revisionDigest,
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            });
            sourceBindings.set(pointerId, {
                pointerId,
                semanticClass: "context_only",
                semanticOriginId: `calendar-${segment.segmentIndex}`,
                semanticIdentityDigest: eventIdentityDigest,
                sourceIdentityDigest: eventIdentityDigest,
                observedRevision: calendarEvent.revisionDigest,
                evidenceRevision: calendarEvent.revisionDigest,
                observedContentDigest: calendarEvent.revisionDigest,
                evidenceContentDigest: calendarEvent.revisionDigest,
            });
            for (const mention of segment.mentions) {
                const representative = representativeByMention.get(mention.mentionIdentityDigest);
                const eventId = `tmcalevent_${(0, source_contracts_js_1.taskMapContractDigest)({
                    eventIdentityDigest,
                    mentionIdentityDigest: mention.mentionIdentityDigest,
                    segmentIndex: segment.segmentIndex,
                }).slice(0, 16)}`;
                const candidateKind = mention.speechActClass === "commitment"
                    ? "commitment"
                    : "action_item";
                const candidateIdentityRef = `external:${(0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
                    kind: candidateKind,
                    title: representative.title,
                    summary: representative.text,
                    explicitExternalReferenceDigests: [],
                    mentionIdentityDigest: mention.mentionIdentityDigest,
                })}`;
                events.push({
                    id: eventId,
                    pointerId,
                    recordKind: "work_context",
                    activity: mention.proposalDisposition === "candidate_only"
                        ? "commitment_stated"
                        : "context_observed",
                    occurredAt: calendarEvent.startAt < report.assessedAt
                        ? calendarEvent.startAt
                        : report.assessedAt,
                    observedAt: report.assessedAt,
                    objectRefs: mention.proposalDisposition === "candidate_only"
                        ? [candidateIdentityRef]
                        : [],
                    title: representative.title,
                    summary: representative.text,
                    extractionConfidence: mention.confidence,
                    bodyJoinEligible: false,
                });
                evidenceBindings.push(mention.proposalDisposition === "candidate_only"
                    ? {
                        eventId,
                        disposition: "candidate_only",
                        candidateIdentityRef,
                        candidateKind,
                        mentionIdentityDigest: mention.mentionIdentityDigest,
                        rootLinkRefs: [],
                    }
                    : {
                        eventId,
                        disposition: "context_only",
                        rootLinkRefs: [],
                    });
            }
        }
    }
    return deepFreeze({
        ownerScopeDigest: report.ownerScopeDigest,
        taskMapInput: {
            contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
            generatedAt: report.assessedAt,
            pointers: [...pointers.values()].sort((left, right) => left.id.localeCompare(right.id)),
            events: events.sort((left, right) => left.id.localeCompare(right.id)),
        },
        sourceBindings: [...sourceBindings.values()].sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
        evidenceBindings: evidenceBindings.sort((left, right) => left.eventId.localeCompare(right.eventId)),
    });
}
