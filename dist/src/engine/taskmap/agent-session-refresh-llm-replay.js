"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE = exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME = exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION = void 0;
exports.refreshTaskMapAgentSessionExtraction = refreshTaskMapAgentSessionExtraction;
exports.loadVerifiedTaskMapAgentSessionExtractionReport = loadVerifiedTaskMapAgentSessionExtractionReport;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const agent_session_extraction_js_1 = require("./agent-session-extraction.js");
const agent_session_semantic_admission_js_1 = require("./agent-session-semantic-admission.js");
const llm_station_js_1 = require("./llm-station.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const mention_normalization_js_1 = require("./mention-normalization.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION = "taskmap-agent-session-extraction-report.v1";
exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME = "taskmap-agent-session-extraction-report.v1.json";
exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE = "agent-session";
exports.TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN = "taskmap-agent-session-mention-identity.1";
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const REPORT_KEYS = new Set([
    "contractVersion",
    "ownerScopeDigest",
    "admissionDigest",
    "promptTemplateDigest",
    "assessedAt",
    "clusters",
    "pendingCount",
    "reportDigest",
]);
const CLUSTER_KEYS = new Set([
    "clusterIdentityDigest",
    "workstreamIdentityDigest",
    "inputDigest",
    "status",
    "degradationCode",
    "envelopeDigest",
    "envelopeModel",
    "envelopeTransport",
    "mentions",
]);
const MENTION_KEYS = new Set([
    "text",
    "title",
    "speechActClass",
    "speechActActor",
    "confidence",
    "mentionIdentityDigest",
    "proposalDisposition",
    "promotionEligible",
]);
const SPEECH_ACT_CLASSES = new Set([
    "request",
    "commitment",
    "decision",
    "other",
]);
const SPEECH_ACT_ACTORS = new Set([
    "self",
    "other",
    "unknown",
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
    if (typeof value !== "string" || !STRICT_RFC3339.test(value))
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
            domain: exports.TASKMAP_AGENT_SESSION_MENTION_IDENTITY_DOMAIN,
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
function degradedRow(cluster, inputDigest, degradationCode) {
    return {
        clusterIdentityDigest: cluster.clusterIdentityDigest,
        workstreamIdentityDigest: cluster.workstreamIdentityDigest,
        inputDigest,
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
function parseReport(bytes) {
    let decoded;
    let value;
    try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(decoded);
        value = JSON.parse(decoded);
    }
    catch (error) {
        unavailable("agent_session_extraction_report_malformed", error);
    }
    if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
        unavailable("agent_session_extraction_report_malformed");
    }
    if (value.contractVersion !== exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION
        || typeof value.ownerScopeDigest !== "string"
        || !SHA256.test(value.ownerScopeDigest)
        || typeof value.admissionDigest !== "string"
        || !SHA256.test(value.admissionDigest)
        || typeof value.promptTemplateDigest !== "string"
        || !SHA256.test(value.promptTemplateDigest)
        || !validTimestamp(value.assessedAt)
        || !Array.isArray(value.clusters)
        || value.clusters.length > 24
        || !Number.isSafeInteger(value.pendingCount)
        || value.pendingCount < 0
        || typeof value.reportDigest !== "string"
        || !SHA256.test(value.reportDigest)) {
        unavailable("agent_session_extraction_report_malformed");
    }
    const seenClusters = new Set();
    let degradedCount = 0;
    let previousIdentity = "";
    for (const row of value.clusters) {
        if (!isRecord(row) || !hasExactKeys(row, CLUSTER_KEYS)) {
            unavailable("agent_session_extraction_report_malformed");
        }
        if (typeof row.clusterIdentityDigest !== "string"
            || !SHA256.test(row.clusterIdentityDigest)
            || typeof row.workstreamIdentityDigest !== "string"
            || !SHA256.test(row.workstreamIdentityDigest)
            || typeof row.inputDigest !== "string"
            || !SHA256.test(row.inputDigest)
            || seenClusters.has(row.clusterIdentityDigest)
            || row.clusterIdentityDigest <= previousIdentity
            || (row.status !== "extracted" && row.status !== "degraded")
            || !Array.isArray(row.mentions)
            || row.mentions.length > 20) {
            unavailable("agent_session_extraction_report_malformed");
        }
        seenClusters.add(row.clusterIdentityDigest);
        previousIdentity = row.clusterIdentityDigest;
        if (row.status === "degraded")
            degradedCount += 1;
        if (row.status === "extracted") {
            if (row.degradationCode !== null
                || typeof row.envelopeDigest !== "string"
                || !SHA256.test(row.envelopeDigest)
                || typeof row.envelopeModel !== "string"
                || row.envelopeModel.length === 0
                || row.envelopeModel.length > 256
                || (row.envelopeTransport !== "claude-cli"
                    && row.envelopeTransport !== "codex-cli"
                    && row.envelopeTransport !== "gemini-remote"))
                unavailable("agent_session_extraction_report_malformed");
        }
        else if (typeof row.degradationCode !== "string"
            || row.envelopeDigest !== null
            || row.envelopeModel !== null
            || row.envelopeTransport !== null
            || row.mentions.length !== 0) {
            unavailable("agent_session_extraction_report_malformed");
        }
        const seenMentionIdentities = new Set();
        for (const mention of row.mentions) {
            if (!isRecord(mention) || !hasExactKeys(mention, MENTION_KEYS)) {
                unavailable("agent_session_extraction_report_malformed");
            }
            if (typeof mention.text !== "string"
                || mention.text.length === 0
                || typeof mention.title !== "string"
                || mention.title.length === 0
                || !SPEECH_ACT_CLASSES.has(mention.speechActClass)
                || !SPEECH_ACT_ACTORS.has(mention.speechActActor)
                || typeof mention.confidence !== "number"
                || !Number.isFinite(mention.confidence)
                || mention.confidence < 0
                || mention.confidence > 1
                || typeof mention.mentionIdentityDigest !== "string"
                || !SHA256.test(mention.mentionIdentityDigest)
                || (mention.proposalDisposition !== "candidate_only"
                    && mention.proposalDisposition !== "context_only")
                || typeof mention.promotionEligible !== "boolean")
                unavailable("agent_session_extraction_report_malformed");
            if (seenMentionIdentities.has(mention.mentionIdentityDigest)) {
                unavailable("agent_session_extraction_report_malformed");
            }
            seenMentionIdentities.add(mention.mentionIdentityDigest);
        }
    }
    if (degradedCount !== value.pendingCount) {
        unavailable("agent_session_extraction_report_malformed");
    }
    const { reportDigest, ...payload } = value;
    if ((0, source_contracts_js_1.taskMapContractDigest)(payload) !== reportDigest) {
        unavailable("agent_session_extraction_report_tampered");
    }
    return value;
}
async function refreshTaskMapAgentSessionExtraction(input) {
    const assertNotAborted = () => {
        if (input.signal?.aborted)
            unavailable("extraction_aborted");
    };
    assertNotAborted();
    (0, agent_session_semantic_admission_js_1.assertTaskMapAgentSessionSemanticAdmission)(input.admission);
    if (!SHA256.test(input.ownerScopeDigest)
        || input.admission.ownerScopeDigest !== input.ownerScopeDigest)
        unavailable("owner_scope_invalid");
    if (!validTimestamp(input.assessedAt))
        unavailable("assessed_at_invalid");
    await (0, meeting_refresh_llm_replay_js_1.assertPrivateDirectory)(input.runtimeRoot, false);
    let template;
    try {
        template = await (0, meeting_refresh_llm_replay_js_1.readPromptTemplate)(input.promptTemplatePath);
    }
    catch (error) {
        throw new meeting_refresh_llm_replay_js_1.TaskMapPromptTemplateUnavailableError({ cause: error });
    }
    const createStation = input.createStation
        ?? ((signal) => (0, llm_station_js_1.createLlmStation)({ signal }));
    let stationPromise;
    const clusters = [];
    const sortedClusters = [...input.admission.clusters].sort((left, right) => left.clusterIdentityDigest.localeCompare(right.clusterIdentityDigest));
    for (const cluster of sortedClusters) {
        const body = (0, agent_session_extraction_js_1.taskMapAgentSessionExtractionBody)(cluster);
        const rendered = (0, agent_session_extraction_js_1.renderTaskMapAgentSessionMentionPrompt)(template.bytes, body);
        let envelope;
        try {
            envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, body, exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE);
        }
        catch (error) {
            clusters.push(degradedRow(cluster, rendered.inputDigest, extractionFailureCode(error)));
            continue;
        }
        let mentions = envelope === null
            ? null
            : mentionsFromEnvelope(envelope, body);
        const healingPersistedEnvelope = envelope !== null
            && mentions !== null
            && mentions.length === 0;
        if (envelope === null || healingPersistedEnvelope) {
            stationPromise ??= createStation(input.signal);
            let station;
            try {
                station = await stationPromise;
            }
            catch (error) {
                clusters.push(degradedRow(cluster, rendered.inputDigest, (0, meeting_refresh_llm_replay_js_1.stationDegradationCode)(error)));
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
                envelope = (0, meeting_refresh_llm_replay_js_1.validateEnvelope)(candidate, rendered, body, "invalid_extraction_output");
                mentions = mentionsFromEnvelope(envelope, body);
                if (mentions.length === 0)
                    unavailable("invalid_extraction_output");
                const envelopePath = (0, meeting_refresh_llm_replay_js_1.taskMapMentionExtractionEnvelopePath)(input.taskMapRoot, rendered.inputDigest, exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE);
                if (input.persist !== false) {
                    assertNotAborted();
                    if (healingPersistedEnvelope) {
                        await (0, meeting_refresh_llm_replay_js_1.replacePrivateFile)(envelopePath, envelope);
                    }
                    else {
                        await (0, meeting_refresh_llm_replay_js_1.atomicPrivateWriteNew)(envelopePath, envelope);
                    }
                    assertNotAborted();
                    const durable = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, body, exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE);
                    if (durable === null)
                        unavailable("envelope_store_unavailable");
                    envelope = durable;
                    mentions = mentionsFromEnvelope(envelope, body);
                    if (mentions.length === 0)
                        unavailable("envelope_store_unavailable");
                }
            }
            catch (error) {
                clusters.push(degradedRow(cluster, rendered.inputDigest, extractionFailureCode(error)));
                continue;
            }
        }
        if (envelope === null || mentions === null || mentions.length === 0) {
            clusters.push(degradedRow(cluster, rendered.inputDigest, "invalid_extraction_output"));
            continue;
        }
        clusters.push({
            clusterIdentityDigest: cluster.clusterIdentityDigest,
            workstreamIdentityDigest: cluster.workstreamIdentityDigest,
            inputDigest: rendered.inputDigest,
            status: "extracted",
            degradationCode: null,
            envelopeDigest: envelopeDigest(envelope),
            envelopeModel: envelope.model,
            envelopeTransport: reportEnvelopeTransport(envelope),
            mentions,
        });
    }
    const report = finalizeReport({
        contractVersion: exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        admissionDigest: input.admission.admissionDigest,
        promptTemplateDigest: template.digest,
        assessedAt: input.assessedAt,
        clusters,
        pendingCount: clusters.filter((row) => row.status === "degraded").length,
    });
    assertNotAborted();
    if (input.persist === false)
        return report;
    await (0, meeting_refresh_llm_replay_js_1.replacePrivateFile)(node_path_1.default.join(input.runtimeRoot, exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME), report);
    const verified = await loadVerifiedTaskMapAgentSessionExtractionReport({
        admission: input.admission,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
    });
    if (verified === null)
        unavailable("agent_session_extraction_report_stale");
    return verified;
}
async function loadVerifiedTaskMapAgentSessionExtractionReport(input) {
    (0, agent_session_semantic_admission_js_1.assertTaskMapAgentSessionSemanticAdmission)(input.admission);
    if (!SHA256.test(input.ownerScopeDigest)
        || input.admission.ownerScopeDigest !== input.ownerScopeDigest)
        unavailable("owner_scope_invalid");
    const reportPath = node_path_1.default.join(input.runtimeRoot, exports.TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME);
    try {
        await (0, promises_1.lstat)(reportPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        unavailable("agent_session_extraction_report_unavailable", error);
    }
    const [template, reportFile] = await Promise.all([
        (0, meeting_refresh_llm_replay_js_1.readPromptTemplate)(input.promptTemplatePath),
        (0, meeting_refresh_llm_replay_js_1.readAuthenticatedFile)(reportPath, meeting_refresh_llm_replay_js_1.TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES, "owner_private"),
    ]);
    const report = parseReport(reportFile.bytes);
    if (report.ownerScopeDigest !== input.ownerScopeDigest
        || report.admissionDigest !== input.admission.admissionDigest
        || report.promptTemplateDigest !== template.digest)
        return null;
    if (report.clusters.length !== input.admission.clusters.length)
        return null;
    const clusterByIdentity = new Map(input.admission.clusters.map((cluster) => [
        cluster.clusterIdentityDigest,
        cluster,
    ]));
    for (const row of report.clusters) {
        const cluster = clusterByIdentity.get(row.clusterIdentityDigest);
        if (cluster === undefined
            || row.workstreamIdentityDigest !== cluster.workstreamIdentityDigest)
            return null;
        const body = (0, agent_session_extraction_js_1.taskMapAgentSessionExtractionBody)(cluster);
        const rendered = (0, agent_session_extraction_js_1.renderTaskMapAgentSessionMentionPrompt)(template.bytes, body);
        if (row.inputDigest !== rendered.inputDigest)
            return null;
        if (row.status === "extracted") {
            const envelope = await (0, meeting_refresh_llm_replay_js_1.loadEnvelope)(input.taskMapRoot, rendered, body, exports.TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE);
            if (envelope === null
                || row.envelopeDigest !== envelopeDigest(envelope)
                || row.envelopeModel !== envelope.model
                || row.envelopeTransport !== envelope.transport
                || (0, source_contracts_js_1.taskMapContractCanonicalJson)(row.mentions)
                    !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(mentionsFromEnvelope(envelope, body)))
                unavailable("agent_session_extraction_report_tampered");
        }
    }
    return deepFreeze(report);
}
