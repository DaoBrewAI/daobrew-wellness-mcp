"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMapNativeRefreshService = exports.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME = exports.TASKMAP_COMMUNITY_TASK_DIGESTION_BUDGET_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_MAX_DEADLINE_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS = exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABELS = exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND = exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME = exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION = exports.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME = exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME = exports.TASKMAP_NATIVE_GENERATIONS_DIRECTORY = exports.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME = exports.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION = exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION = exports.TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION = exports.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION = exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION = exports.TASKMAP_NATIVE_GRAPH_INPUT_VERSION = exports.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION = exports.TASKMAP_NATIVE_REFRESH_STATUS_VERSION = exports.TASKMAP_NATIVE_REFRESH_STATE_VERSION = void 0;
exports.resolveCurrentTaskMapOwnerGranolaEvidence = resolveCurrentTaskMapOwnerGranolaEvidence;
exports.loadCurrentTaskMapOwnerGranolaExtractionReport = loadCurrentTaskMapOwnerGranolaExtractionReport;
exports.acceptedPromotionIdsInVerifiedTaskMapProjection = acceptedPromotionIdsInVerifiedTaskMapProjection;
exports.taskMapNativeReadyProofTargetsPath = taskMapNativeReadyProofTargetsPath;
exports.nativeTaskMapGenerationReferencePath = nativeTaskMapGenerationReferencePath;
exports.nativeTaskRankingPath = nativeTaskRankingPath;
exports.boundedHistoricalGenerationIdsForRecovery = boundedHistoricalGenerationIdsForRecovery;
exports.mergeAcceptedAgentSessionTaskProofHistory = mergeAcceptedAgentSessionTaskProofHistory;
exports.currentnessForNativeProjection = currentnessForNativeProjection;
exports.publishTaskMapNativeProjection = publishTaskMapNativeProjection;
exports.reconcileTaskMapProjectionMembership = reconcileTaskMapProjectionMembership;
exports.buildAgentSessionOnlyProjection = buildAgentSessionOnlyProjection;
exports.agentCommunitySubtreeOf = agentCommunitySubtreeOf;
exports.previousAcceptedCommunityRootsFromProjection = previousAcceptedCommunityRootsFromProjection;
exports.acceptedAgentSessionTaskProofs = acceptedAgentSessionTaskProofs;
exports.acceptedMembershipPredecessorProjection = acceptedMembershipPredecessorProjection;
exports.composeCurrentWorkProjections = composeCurrentWorkProjections;
exports.retainedSemanticGroupingMarker = retainedSemanticGroupingMarker;
exports.acceptedAgentMigrationResultUnavailable = acceptedAgentMigrationResultUnavailable;
exports.acceptedAgentTopicMembershipEdgeShouldBeReplaced = acceptedAgentTopicMembershipEdgeShouldBeReplaced;
exports.mergeTaskMapSemanticFragment = mergeTaskMapSemanticFragment;
exports.emptyTaskMapSemanticInputForAcceptedReceipts = emptyTaskMapSemanticInputForAcceptedReceipts;
exports.taskMapBodyAssessmentPreservesAcceptedMembership = taskMapBodyAssessmentPreservesAcceptedMembership;
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const identity_js_1 = require("../../identity.js");
const gemini_js_1 = require("../embeddings/gemini.js");
const gemini_remote_js_1 = require("../embeddings/gemini-remote.js");
const llm_station_js_1 = require("./llm-station.js");
const body_causal_assessment_js_1 = require("./body-causal-assessment.js");
const owner_refresh_coordinator_js_1 = require("./owner-refresh-coordinator.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const agent_session_candidate_adapter_js_1 = require("./agent-session-candidate-adapter.js");
const agent_session_semantic_admission_js_1 = require("./agent-session-semantic-admission.js");
const native_community_shadow_js_1 = require("./native-community-shadow.js");
const community_task_digestion_js_1 = require("./community-task-digestion.js");
const community_root_proposals_js_1 = require("./community-root-proposals.js");
const agent_session_refresh_llm_replay_js_1 = require("./agent-session-refresh-llm-replay.js");
const calendar_producer_freshness_js_1 = require("./calendar-producer-freshness.js");
const calendar_refresh_llm_replay_js_1 = require("./calendar-refresh-llm-replay.js");
const calendar_extraction_js_1 = require("./calendar-extraction.js");
const native_semantic_builder_adapter_js_1 = require("./native-semantic-builder-adapter.js");
const native_predecessor_evidence_js_1 = require("./native-predecessor-evidence.js");
const physiological_source_snapshot_js_1 = require("./physiological-source-snapshot.js");
const strategy_source_adapter_js_1 = require("./strategy-source-adapter.js");
const harness_js_1 = require("./harness.js");
const native_current_work_successor_js_1 = require("./native-current-work-successor.js");
const ready_frontier_js_1 = require("./ready-frontier.js");
const source_contracts_js_1 = require("./source-contracts.js");
const owner_scope_js_1 = require("./owner-scope.js");
const native_candidate_acceptance_js_1 = require("./native-candidate-acceptance.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const meeting_refresh_llm_replay_js_1 = require("./meeting-refresh-llm-replay.js");
const task_ranking_publication_js_1 = require("./task-ranking-publication.js");
const types_js_1 = require("./types.js");
const mention_normalization_js_1 = require("./mention-normalization.js");
const text_contract_js_1 = require("./text-contract.js");
const identity_adjudication_refresh_js_1 = require("./identity-adjudication-refresh.js");
const decomposition_refresh_js_1 = require("./decomposition-refresh.js");
const llm_proposal_surface_js_1 = require("./llm-proposal-surface.js");
exports.TASKMAP_NATIVE_REFRESH_STATE_VERSION = "taskmap-native-refresh-state.v1";
exports.TASKMAP_NATIVE_REFRESH_STATUS_VERSION = "taskmap-native-refresh-status.v1";
exports.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION = "taskmap-native-refresh-candidate.v1";
exports.TASKMAP_NATIVE_GRAPH_INPUT_VERSION = "taskmap-native-graph-input.v1";
exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION = "taskmap-native-publication-candidate.v1";
exports.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION = "taskmap-native-currentness-gate.v1";
exports.TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION = "taskmap-native-context-only-retirement.v1";
exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION = "taskmap-native-generation-reference.v1";
exports.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION = "taskmap-native-generation-manifest.v1";
exports.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME = "taskmap-current-generation.v1.json";
exports.TASKMAP_NATIVE_GENERATIONS_DIRECTORY = "taskmap-generations";
exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME = "taskmap-generation-manifest.v1.json";
exports.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME = "taskmap-ready-proof-targets.v1.json";
exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION = "taskmap-body-signal-assessment.v1";
exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME = "taskmap-body-signal-assessment.v1.json";
exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND = Object.freeze({
    codex_session: "Codex sessions",
    claude_session: "Claude sessions",
    cursor_session: "Cursor sessions",
    gemini_meet: "Gemini meeting notes",
    granola: "Granola meeting notes",
    google_calendar: "Google Calendar",
    gmail: "Gmail",
    slack: "Slack",
    google_chat: "Google Chat",
    linear: "Linear",
    jira: "Jira",
    github: "GitHub",
    google_tasks: "Google Tasks",
    strategy: "Strategy",
    manual: "Manual work records",
});
exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABELS = Object.freeze([
    ...Object.values(exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND),
    "Another work source",
]);
const MAX_JSON_BYTES = 16 * 1_024 * 1_024;
const MAX_SESSION_FILES = native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.candidateLimit;
const MAX_SESSION_DIRECTORIES = native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.directoryLimit;
const SESSION_SCAN_CHUNK_BYTES = 64 * 1_024;
const MAX_GRAPH_SESSION_SCAN_BYTES_PER_FILE = native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.perFileScanByteLimit;
const MAX_GRAPH_SESSION_SCAN_BYTES_GLOBAL = native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.globalScanByteLimit;
const MAX_GRAPH_SESSION_READ_ATTEMPTS = native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_POLICY_V1.attemptLimit;
const GRAPH_SESSION_HEAD_SCAN_BYTES = 64 * 1_024;
const GRAPH_SESSION_TAIL_SCAN_BYTES = MAX_GRAPH_SESSION_SCAN_BYTES_PER_FILE - GRAPH_SESSION_HEAD_SCAN_BYTES;
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS = 5_000;
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS = 80_000;
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS = community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs;
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS = 5_000;
/** Discovery/auth + measured grouping + bounded title + publication headroom. */
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS = exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS
    + exports.TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS
    + exports.TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS
    + exports.TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS;
exports.TASKMAP_NATIVE_COMMUNITY_PLAN_MAX_DEADLINE_MS = 120_000;
const TASKMAP_NATIVE_COMMUNITY_PLAN_MIN_DEADLINE_MS = 10;
/** Bounded first-generation budget for per-root community task digestion. */
exports.TASKMAP_COMMUNITY_TASK_DIGESTION_BUDGET_MS = 240_000;
exports.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME = "taskmap-community-task-digestion-report.v1.json";
const MAX_FIXED_TASKMAP_ARTIFACT_BYTES = 2 * 1_024 * 1_024;
const MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES = 8 * 1_024 * 1_024;
const MAX_TASKMAP_BODY_SIGNAL_ASSESSMENT_BYTES = 512 * 1_024;
const DEFAULT_LOCK_WAIT_MS = 10 * 60 * 1_000;
const LOCK_POLL_MS = 50;
const TASKMAP_RESIDENT_RECEIPT_VERSION = "taskmap-resident-receipt.v1";
const TASKMAP_GRANOLA_SUCCESS_RECEIPT_KEY = "granola_mcp_success";
const TASKMAP_GRANOLA_SNAPSHOT_DIGEST_RECEIPT_KEY = "granola_mcp_snapshot_sha256";
const TASKMAP_GRANOLA_MAX_AGE_MS = 4 * 60 * 60 * 1_000;
const TASKMAP_GRANOLA_TIMESTAMP_TOLERANCE_MS = 2_000;
function acceptedTopicLineageFromCommunityPlan(plan, feed) {
    const episodeById = new Map();
    for (const episode of feed.episodes) {
        if (episodeById.has(episode.graphEpisodeId))
            return [];
        episodeById.set(episode.graphEpisodeId, episode);
    }
    const lineage = [];
    for (const proposal of plan.proposalSet.proposals) {
        const members = proposal.memberNodeIds.map((graphEpisodeId) => {
            const episode = episodeById.get(graphEpisodeId);
            return episode === undefined ? null : {
                graphEpisodeId,
                supportIdentityDigest: episode.turnLineageIdentityDigest,
            };
        });
        if (members.some((member) => member === null))
            return [];
        lineage.push({
            rootProposalId: proposal.rootProposalId,
            members: members
                .sort((left, right) => compareCodePoint(left.graphEpisodeId, right.graphEpisodeId)),
        });
    }
    return lineage.sort((left, right) => compareCodePoint(left.rootProposalId, right.rootProposalId));
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value === null || typeof value !== "object")
        return value;
    const input = value;
    return Object.fromEntries(Object.keys(input)
        .sort()
        .filter((key) => input[key] !== undefined)
        .map((key) => [key, canonicalize(input[key])]));
}
function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function finiteTimestamp(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function safeTimestamp(value) {
    if (finiteTimestamp(value))
        return value;
    if (typeof value !== "string" || value.length === 0)
        return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function defaultSourcePaths(ownerScope) {
    const ownerHome = ownerScope.homeDirectory;
    const daobrewState = ownerScope.sourceRoot;
    return {
        agentSessionRoots: [
            {
                sourceLabel: "codex",
                rootPath: node_path_1.default.join(ownerHome, ".codex", "sessions"),
            },
            {
                sourceLabel: "claude",
                rootPath: node_path_1.default.join(ownerHome, ".claude", "projects"),
            },
        ],
        agentSessionProducerSnapshotPath: node_path_1.default.join(ownerScope.sourceRoot, "agent-session-producer-snapshot.v1.json"),
        meetingSnapshotPaths: [
            {
                sourceLabel: "gdocs",
                filePath: node_path_1.default.join(ownerScope.sourceRoot, "meeting-producer-snapshot.v1.json"),
            },
            {
                sourceLabel: "granola",
                filePath: node_path_1.default.join(ownerScope.sourceRoot, "granola-mcp-snapshot.json"),
            },
        ],
        residentReceiptPath: node_path_1.default.join(ownerScope.sourceRoot, "taskmap-resident-receipt.v1.json"),
        calendarExportPath: node_path_1.default.join(daobrewState, "calendar-export.json"),
        googleCalendarSnapshotPath: node_path_1.default.join(ownerScope.sourceRoot, "calendar-google-provider-snapshot.v1.json"),
        physiologicalSnapshotPath: node_path_1.default.join(ownerScope.sourceRoot, "taskmap-physiological-source-snapshot.v1.json"),
    };
}
function mergeSourcePaths(overrides, ownerScope) {
    return { ...defaultSourcePaths(ownerScope), ...overrides };
}
async function readRegularJson(filePath, maximumBytes = MAX_JSON_BYTES) {
    return readOwnerOnlyJson(filePath, maximumBytes);
}
function safeRecord(namespace, identity, revision, occurredAtMs) {
    return {
        identityDigest: sha256(`${namespace}\0${identity}`),
        revision,
        occurredAtMs,
    };
}
function collectedSlice(source, value, revision, ownerScopeDigest) {
    const ownedValue = { ...value, ownerScopeDigest };
    return {
        ownerScopeDigest,
        revision,
        sliceDigest: sha256(canonicalJson(ownedValue)),
        value: ownedValue,
    };
}
function nativeSafeSliceMatches(expected, actual) {
    return (expected.revision === actual.revision
        && expected.sliceDigest === actual.sliceDigest
        && expected.value?.ownerScopeDigest === actual.ownerScopeDigest
        && expected.value !== null
        && canonicalJson(expected.value) === canonicalJson(actual.value));
}
function bindAgentSessionCommunityPlanIdentity(slice, graphFeed, graphMetrics) {
    if (graphFeed === null || graphMetrics === null)
        return slice;
    const { feedId: _feedId, feedDigest: _feedDigest, producedAt: _producedAt, ...stableGraphFeed } = graphFeed;
    const graphFeedDigest = (0, source_contracts_js_1.taskMapContractDigest)(stableGraphFeed);
    const graphCoverageDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        contractVersion: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
        feedCounts: graphFeed.counts,
        collection: graphMetrics,
    });
    const graphBoundValue = {
        ...slice.value,
        metadata: {
            ...slice.value.metadata,
            plan2GraphFeedDigest: graphFeedDigest,
            plan2GraphCoverageDigest: graphCoverageDigest,
        },
    };
    return {
        ...slice,
        sliceDigest: sha256(canonicalJson(graphBoundValue)),
        value: graphBoundValue,
    };
}
function agentSessionFileMetadataReceipt(metadata) {
    return {
        dev: metadata.dev,
        ino: metadata.ino,
        size: metadata.size,
        mode: metadata.mode,
        nlink: metadata.nlink,
        uid: metadata.uid,
        mtimeNs: metadata.mtimeNs,
        ctimeNs: metadata.ctimeNs,
    };
}
function sameAgentSessionFileMetadata(left, right) {
    return left.dev === right.dev
        && left.ino === right.ino
        && left.size === right.size
        && left.mode === right.mode
        && left.nlink === right.nlink
        && left.uid === right.uid
        && left.mtimeNs === right.mtimeNs
        && left.ctimeNs === right.ctimeNs;
}
async function readExactAgentSessionBytes(handle, byteLength) {
    const bytes = Buffer.allocUnsafe(byteLength);
    let offset = 0;
    while (offset < byteLength) {
        const read = await handle.read(bytes, offset, byteLength - offset, offset);
        if (read.bytesRead === 0)
            return null;
        offset += read.bytesRead;
    }
    return bytes;
}
function acceptCompactedAgentSessionLine(compacted, provider, rawLine, includeEpisodes) {
    const record = (0, agent_session_producer_freshness_js_1.compactTaskMapAgentSessionJsonlLine)(provider, rawLine);
    if (record === null)
        return;
    switch (record.kind) {
        case "identity":
            compacted.identityLine ??= record.jsonlLine;
            return;
        case "routing":
            compacted.latestRoutingLine = record.jsonlLine;
            return;
        case "user":
            if (!includeEpisodes)
                return;
            compacted.episodes.push({
                routingLine: compacted.latestRoutingLine,
                userLine: record.jsonlLine,
                assistantLine: null,
            });
            if (compacted.episodes.length
                > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                    .maxEpisodesPerRootSession) {
                compacted.episodes.shift();
            }
            return;
        case "assistant": {
            if (!includeEpisodes)
                return;
            const current = compacted.episodes.at(-1);
            if (current !== undefined) {
                current.assistantLine = record.jsonlLine;
            }
        }
    }
}
async function scanAgentSessionJsonlRange(handle, start, end, fileSize, onLine) {
    if (start >= end)
        return;
    const chunk = Buffer.allocUnsafe(Math.min(SESSION_SCAN_CHUNK_BYTES, end - start));
    let position = start;
    let discardCurrentLine = false;
    if (start > 0) {
        const precedingByte = Buffer.allocUnsafe(1);
        const read = await handle.read(precedingByte, 0, 1, start - 1);
        discardCurrentLine =
            read.bytesRead !== 1 || precedingByte[0] !== 0x0a;
    }
    let lineParts = [];
    let lineBytes = 0;
    const resetLine = () => {
        lineParts = [];
        lineBytes = 0;
    };
    const appendPart = (part) => {
        if (discardCurrentLine || part.byteLength === 0)
            return;
        if (lineBytes + part.byteLength
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxLineBytes) {
            discardCurrentLine = true;
            resetLine();
            return;
        }
        lineParts.push(Buffer.from(part));
        lineBytes += part.byteLength;
    };
    const finishLine = () => {
        if (discardCurrentLine) {
            discardCurrentLine = false;
            resetLine();
            return;
        }
        if (lineBytes === 0)
            return;
        let line = Buffer.concat(lineParts, lineBytes);
        if (line.at(-1) === 0x0d)
            line = line.subarray(0, -1);
        if (line.byteLength > 0)
            onLine(line.toString("utf8"));
        resetLine();
    };
    while (position < end) {
        const requested = Math.min(chunk.byteLength, end - position);
        const read = await handle.read(chunk, 0, requested, position);
        if (read.bytesRead === 0)
            break;
        const current = chunk.subarray(0, read.bytesRead);
        let partStart = 0;
        while (partStart < current.byteLength) {
            const newline = current.indexOf(0x0a, partStart);
            if (newline === -1) {
                appendPart(current.subarray(partStart));
                break;
            }
            appendPart(current.subarray(partStart, newline));
            finishLine();
            partStart = newline + 1;
        }
        position += read.bytesRead;
    }
    if (end === fileSize && !discardCurrentLine && lineBytes > 0) {
        finishLine();
    }
}
function compactedAgentSessionObservation(provider, compacted) {
    const episodes = [...compacted.episodes];
    const lines = () => [
        ...(compacted.identityLine === null ? [] : [compacted.identityLine]),
        ...episodes.flatMap((episode) => [
            ...(episode.routingLine === null ? [] : [episode.routingLine]),
            episode.userLine,
            ...(episode.assistantLine === null ? [] : [episode.assistantLine]),
        ]),
    ];
    let retainedLines = lines();
    while (episodes.length > 1
        && (Buffer.byteLength(`${retainedLines.join("\n")}\n`, "utf8")
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxRawBytesPerObservation
            || retainedLines.length + 1
                > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                    .maxLinesPerObservation)) {
        episodes.shift();
        retainedLines = lines();
    }
    if (retainedLines.length === 0
        || Buffer.byteLength(`${retainedLines.join("\n")}\n`, "utf8")
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxRawBytesPerObservation
        || retainedLines.length + 1
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxLinesPerObservation) {
        return null;
    }
    return {
        provider,
        rawJsonl: `${retainedLines.join("\n")}\n`,
        coverage: "partial",
    };
}
function compareCodePoint(left, right) {
    const leftScalars = Array.from(left);
    const rightScalars = Array.from(right);
    const length = Math.min(leftScalars.length, rightScalars.length);
    for (let index = 0; index < length; index += 1) {
        const difference = leftScalars[index].codePointAt(0)
            - rightScalars[index].codePointAt(0);
        if (difference !== 0)
            return difference;
    }
    return leftScalars.length - rightScalars.length;
}
function utcIsoWeek(timestampMs) {
    const source = new Date(timestampMs);
    const day = source.getUTCDay() || 7;
    const thursday = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate() + 4 - day));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
    return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function fairAgentSessionGraphQueue(candidates) {
    const buckets = new Map();
    for (const candidate of candidates) {
        if (!(0, agent_session_producer_freshness_js_1.isTaskMapAgentSessionDiscoveryPathEligible)(candidate.provider, candidate.filePath))
            continue;
        const key = `${candidate.provider}:${utcIsoWeek(candidate.modifiedAtMs)}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(candidate);
        buckets.set(key, bucket);
    }
    const ordered = [...buckets.entries()]
        .sort(([left], [right]) => compareCodePoint(left, right))
        .map(([, bucket]) => bucket.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs
        || compareCodePoint(left.filePath, right.filePath)));
    const queue = [];
    for (let round = 0;; round += 1) {
        let added = false;
        for (const bucket of ordered) {
            const candidate = bucket[round];
            if (candidate === undefined)
                continue;
            queue.push(candidate);
            added = true;
        }
        if (!added)
            return queue;
    }
}
function acceptGraphCompactedAgentSessionLine(compacted, provider, rawLine) {
    const record = (0, agent_session_producer_freshness_js_1.compactTaskMapAgentSessionJsonlLine)(provider, rawLine);
    if (record === null)
        return;
    switch (record.kind) {
        case "identity":
            compacted.identityLine ??= record.jsonlLine;
            return;
        case "routing":
            compacted.latestRoutingLine = record.jsonlLine;
            return;
        case "user": {
            const episode = {
                routingLine: compacted.latestRoutingLine,
                userLine: record.jsonlLine,
                assistantLine: null,
            };
            compacted.firstEpisode ??= episode;
            compacted.latestEpisode = episode;
            compacted.activeEpisode = episode;
            return;
        }
        case "assistant": {
            const episode = compacted.activeEpisode;
            if (episode === null)
                return;
            episode.assistantLine = record.jsonlLine;
            if (compacted.firstEpisode?.userLine === episode.userLine) {
                compacted.firstEpisode.assistantLine = record.jsonlLine;
            }
            if (compacted.latestEpisode?.userLine === episode.userLine) {
                compacted.latestEpisode.assistantLine = record.jsonlLine;
            }
        }
    }
}
function compactedAgentSessionGraphObservation(provider, compacted) {
    const episodes = [
        ...(compacted.firstEpisode === null ? [] : [compacted.firstEpisode]),
        ...(compacted.latestEpisode === null
            || compacted.latestEpisode.userLine
                === compacted.firstEpisode?.userLine
            ? []
            : [compacted.latestEpisode]),
    ];
    const lines = [
        ...(compacted.identityLine === null ? [] : [compacted.identityLine]),
        ...episodes.flatMap((episode) => [
            ...(episode.routingLine === null ? [] : [episode.routingLine]),
            episode.userLine,
            ...(episode.assistantLine === null ? [] : [episode.assistantLine]),
        ]),
    ];
    const rawJsonl = `${lines.join("\n")}\n`;
    if (episodes.length === 0
        || Buffer.byteLength(rawJsonl, "utf8")
            > agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesPerObservation)
        return null;
    return { provider, rawJsonl, coverage: "partial" };
}
async function readBoundedAgentSessionGraphObservation(candidate, reusableObservation) {
    let handle;
    try {
        handle = await (0, promises_1.open)(candidate.filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : before.uid;
        if (!before.isFile()
            || before.uid !== currentUid
            || before.nlink !== 1n
            || !sameAgentSessionFileMetadata(candidate.discoveryReceipt, agentSessionFileMetadataReceipt(before)))
            return null;
        const fileSize = Number(before.size);
        let observation;
        if (fileSize
            <= agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesPerObservation) {
            if (reusableObservation !== undefined) {
                observation = reusableObservation;
            }
            else {
                const bytes = await readExactAgentSessionBytes(handle, fileSize);
                observation = bytes === null
                    ? null
                    : { provider: candidate.provider, rawJsonl: bytes.toString("utf8") };
            }
        }
        else {
            const compacted = {
                identityLine: null,
                latestRoutingLine: null,
                firstEpisode: null,
                latestEpisode: null,
                activeEpisode: null,
            };
            const headEnd = Math.min(fileSize, GRAPH_SESSION_HEAD_SCAN_BYTES);
            await scanAgentSessionJsonlRange(handle, 0, headEnd, fileSize, (line) => acceptGraphCompactedAgentSessionLine(compacted, candidate.provider, line));
            if (fileSize > headEnd) {
                compacted.activeEpisode = null;
                await scanAgentSessionJsonlRange(handle, Math.max(headEnd, fileSize - GRAPH_SESSION_TAIL_SCAN_BYTES), fileSize, fileSize, (line) => acceptGraphCompactedAgentSessionLine(compacted, candidate.provider, line));
            }
            observation = compactedAgentSessionGraphObservation(candidate.provider, compacted);
        }
        const after = await handle.stat({ bigint: true });
        if (observation === null
            || after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mode !== before.mode
            || after.nlink !== before.nlink
            || after.uid !== before.uid
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs)
            return null;
        return {
            observation,
            receipt: {
                ...agentSessionFileMetadataReceipt(before),
                filePath: candidate.filePath,
                observationDigest: (0, source_contracts_js_1.taskMapContractDigest)(observation),
            },
        };
    }
    catch {
        return null;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function readBoundedAgentSessionObservation(candidate) {
    let handle;
    try {
        handle = await (0, promises_1.open)(candidate.filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? BigInt(process.getuid())
            : before.uid;
        if (!before.isFile()
            || before.uid !== currentUid
            || before.nlink !== 1n
            || before.size < 1n
            || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
            return null;
        }
        const fileSize = Number(before.size);
        let observation;
        if (fileSize
            <= agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxRawBytesPerObservation) {
            const bytes = await readExactAgentSessionBytes(handle, fileSize);
            observation = bytes === null
                ? null
                : {
                    provider: candidate.provider,
                    rawJsonl: bytes.toString("utf8"),
                };
        }
        else {
            const compacted = {
                identityLine: null,
                latestRoutingLine: null,
                episodes: [],
            };
            const tailBytes = agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxTailScanBytes;
            if (fileSize <= tailBytes) {
                await scanAgentSessionJsonlRange(handle, 0, fileSize, fileSize, (line) => acceptCompactedAgentSessionLine(compacted, candidate.provider, line, true));
            }
            else {
                const headEnd = Math.min(fileSize, agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxHeadScanBytes);
                await scanAgentSessionJsonlRange(handle, 0, headEnd, fileSize, (line) => acceptCompactedAgentSessionLine(compacted, candidate.provider, line, false));
                await scanAgentSessionJsonlRange(handle, fileSize - tailBytes, fileSize, fileSize, (line) => acceptCompactedAgentSessionLine(compacted, candidate.provider, line, true));
            }
            observation = compactedAgentSessionObservation(candidate.provider, compacted);
        }
        const after = await handle.stat({ bigint: true });
        if (observation === null
            || after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mode !== before.mode
            || after.nlink !== before.nlink
            || after.uid !== before.uid
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs) {
            return null;
        }
        return observation;
    }
    catch {
        return null;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function loadAgentSessionSlice(snapshotPath, assessedAtMs, expectedOwnerScopeDigest) {
    const result = await (0, agent_session_producer_freshness_js_1.loadTaskMapAgentSessionProducerResult)({
        snapshotPath,
        assessedAt: new Date(assessedAtMs).toISOString(),
        expectedOwnerScopeDigest,
    });
    if (result.availability !== "available"
        || result.freshness.decision !== "fresh"
        || result.freshness.currentSemanticInputEligible !== true
        || result.snapshot === null) {
        throw new Error("fresh agent-session producer artifact is unavailable");
    }
    const semanticAdmission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(result.snapshot);
    const records = result.snapshot.sessions.map((session) => safeRecord("agent_session", session.episodeIdentityDigest, session.episodeRevisionDigest, Date.parse(session.occurredAt))).sort((left, right) => left.identityDigest.localeCompare(right.identityDigest));
    const providerCounts = result.snapshot.sessions.reduce((counts, session) => {
        counts[session.provider] += 1;
        return counts;
    }, { codex: 0, claude: 0 });
    return collectedSlice("agent_session", {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        source: "agent_session",
        recordCount: records.length,
        records,
        semanticAdmission,
        metadata: {
            producerResultDigest: result.resultDigest,
            producedAtMs: Date.parse(result.snapshot.producedAt),
            validThroughMs: Date.parse(result.snapshot.validThrough),
            coverage: result.snapshot.coverage,
            observedCount: result.snapshot.observedCount,
            codexSessionCount: providerCounts.codex,
            claudeSessionCount: providerCounts.claude,
            contextOnly: true,
        },
    }, result.resultDigest, expectedOwnerScopeDigest);
}
async function nextAgentSessionDiscoveryCandidate(lane, contextCutoffMs, visited) {
    while (!lane.exhausted) {
        if (lane.pendingFiles.length === 0) {
            if (lane.pendingDirectories.length === 0
                || visited.directories >= MAX_SESSION_DIRECTORIES) {
                lane.exhausted = true;
                return { kind: "exhausted" };
            }
            const directory = lane.pendingDirectories.shift();
            visited.directories += 1;
            let entries;
            try {
                entries = await (0, promises_1.readdir)(directory, { withFileTypes: true });
            }
            catch {
                visited.invalid += 1;
                return lane.pendingDirectories.length === 0
                    ? { kind: "exhausted" }
                    : { kind: "yielded" };
            }
            entries.sort((left, right) => compareCodePoint(left.name, right.name));
            for (const entry of entries) {
                if (entry.isSymbolicLink())
                    continue;
                const childPath = node_path_1.default.join(directory, entry.name);
                if (entry.isDirectory()) {
                    lane.pendingDirectories.push(childPath);
                }
                else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
                    lane.pendingFiles.push(childPath);
                }
            }
            if (lane.pendingFiles.length === 0)
                return { kind: "yielded" };
        }
        const filePath = lane.pendingFiles.shift();
        let metadata;
        try {
            metadata = await (0, promises_1.lstat)(filePath, { bigint: true });
        }
        catch {
            visited.invalid += 1;
            continue;
        }
        if (!metadata.isFile()
            || metadata.isSymbolicLink()
            || metadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
            visited.invalid += 1;
            continue;
        }
        const modifiedAtMs = Number(metadata.mtimeNs / 1000000n);
        if (modifiedAtMs < contextCutoffMs)
            continue;
        return {
            kind: "candidate",
            candidate: {
                provider: lane.provider,
                filePath,
                modifiedAtMs,
                sizeBytes: Number(metadata.size),
                discoveryReceipt: agentSessionFileMetadataReceipt(metadata),
            },
        };
    }
    return { kind: "exhausted" };
}
async function discoverAgentSessionCandidates(roots, contextCutoffMs) {
    const lanesByProvider = new Map();
    for (const root of [...roots].sort((left, right) => compareCodePoint(left.sourceLabel, right.sourceLabel)
        || compareCodePoint(left.rootPath, right.rootPath))) {
        const lanes = lanesByProvider.get(root.sourceLabel) ?? [];
        lanes.push({
            provider: root.sourceLabel,
            pendingDirectories: [root.rootPath],
            pendingFiles: [],
            exhausted: false,
        });
        lanesByProvider.set(root.sourceLabel, lanes);
    }
    const providers = [...lanesByProvider.keys()].sort(compareCodePoint);
    const laneCursor = new Map(providers.map((provider) => [provider, 0]));
    const visited = { directories: 0, invalid: 0 };
    const candidates = [];
    while (candidates.length < MAX_SESSION_FILES) {
        let progressed = false;
        for (const provider of providers) {
            const lanes = lanesByProvider.get(provider);
            if (lanes.every((lane) => lane.exhausted))
                continue;
            const start = laneCursor.get(provider) ?? 0;
            for (let offset = 0; offset < lanes.length; offset += 1) {
                const index = (start + offset) % lanes.length;
                const step = await nextAgentSessionDiscoveryCandidate(lanes[index], contextCutoffMs, visited);
                laneCursor.set(provider, (index + 1) % lanes.length);
                if (step.kind === "candidate") {
                    candidates.push(step.candidate);
                    progressed = true;
                    break;
                }
                if (step.kind === "yielded") {
                    progressed = true;
                    break;
                }
            }
            if (candidates.length >= MAX_SESSION_FILES)
                break;
        }
        if (!progressed)
            break;
    }
    const allLanes = [...lanesByProvider.values()].flat();
    const exhausted = allLanes.every((lane) => lane.exhausted);
    return {
        candidates,
        directoriesVisited: visited.directories,
        exhausted,
        directoryLimitReached: visited.directories >= MAX_SESSION_DIRECTORIES
            && allLanes.some((lane) => lane.pendingDirectories.length > 0),
        candidateLimitReached: candidates.length >= MAX_SESSION_FILES && !exhausted,
        invalidDiscoveries: visited.invalid,
    };
}
async function collectAgentSessions(roots, snapshotPath, assessedAtMs, expectedOwnerScopeDigest, includeGraphFeed) {
    // Product acceptance intentionally covers one month of session context:
    // the exact 30-day boundary is eligible; anything older stays out of scope.
    const contextCutoffMs = assessedAtMs - agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS;
    const discovery = await discoverAgentSessionCandidates(roots, contextCutoffMs);
    const candidates = discovery.candidates;
    candidates.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs
        || compareCodePoint(left.filePath, right.filePath));
    const observations = [];
    const reusableGraphObservations = new Map();
    let chargedBytes = 0;
    for (const candidate of candidates) {
        if (observations.length
            >= agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxObservations) {
            break;
        }
        const observation = await readBoundedAgentSessionObservation(candidate);
        if (observation === null)
            continue;
        const bytes = Buffer.byteLength(observation.rawJsonl, "utf8");
        if (chargedBytes + bytes
            > agent_session_producer_freshness_js_1.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxRawBytesGlobal) {
            break;
        }
        observations.push(observation);
        if (candidate.sizeBytes
            <= agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesPerObservation) {
            reusableGraphObservations.set(candidate.filePath, observation);
        }
        chargedBytes += bytes;
    }
    const snapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: expectedOwnerScopeDigest,
        producedAt: new Date(assessedAtMs).toISOString(),
        observations,
    });
    await (0, agent_session_producer_freshness_js_1.writeTaskMapAgentSessionProducerSnapshot)({
        snapshotPath,
        snapshot,
    });
    const slice = await loadAgentSessionSlice(snapshotPath, assessedAtMs, expectedOwnerScopeDigest);
    if (!includeGraphFeed) {
        return {
            slice,
            graphFeed: null,
            graphFileReceipts: [],
            graphMetrics: null,
        };
    }
    const graphObservations = [];
    const graphFileReceipts = [];
    const selectedProviderCounts = { codex: 0, claude: 0 };
    const selectedIsoWeeks = new Set();
    let graphChargedBytes = 0;
    let attemptedFiles = 0;
    let chargedScanBytes = 0;
    let droppedAttemptLimit = 0;
    let droppedScanBudget = 0;
    let droppedInvalid = discovery.invalidDiscoveries;
    let droppedRawByteBudget = 0;
    let droppedObservationLimit = 0;
    const graphQueue = fairAgentSessionGraphQueue(candidates);
    for (let index = 0; index < graphQueue.length; index += 1) {
        if (graphObservations.length
            >= agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxObservations) {
            droppedObservationLimit = graphQueue.length - index;
            break;
        }
        if (attemptedFiles >= MAX_GRAPH_SESSION_READ_ATTEMPTS) {
            droppedAttemptLimit = graphQueue.length - index;
            break;
        }
        const candidate = graphQueue[index];
        attemptedFiles += 1;
        const scanCharge = Math.min(candidate.sizeBytes, MAX_GRAPH_SESSION_SCAN_BYTES_PER_FILE);
        if (chargedScanBytes + scanCharge
            > MAX_GRAPH_SESSION_SCAN_BYTES_GLOBAL) {
            droppedScanBudget += 1;
            continue;
        }
        chargedScanBytes += scanCharge;
        const read = await readBoundedAgentSessionGraphObservation(candidate, reusableGraphObservations.get(candidate.filePath));
        if (read === null) {
            droppedInvalid += 1;
            continue;
        }
        const { observation } = read;
        const bytes = Buffer.byteLength(observation.rawJsonl, "utf8");
        if (graphChargedBytes + bytes
            > agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesGlobal) {
            droppedRawByteBudget += 1;
            continue;
        }
        try {
            (0, agent_session_producer_freshness_js_1.selectTaskMapAgentSessionGraphEpisodeCandidates)({
                ownerScopeDigest: expectedOwnerScopeDigest,
                producedAt: new Date(assessedAtMs).toISOString(),
                observations: [observation],
            });
        }
        catch {
            droppedInvalid += 1;
            continue;
        }
        graphObservations.push(observation);
        graphFileReceipts.push(read.receipt);
        selectedProviderCounts[candidate.provider] += 1;
        selectedIsoWeeks.add(utcIsoWeek(candidate.modifiedAtMs));
        graphChargedBytes += bytes;
    }
    const graphFeed = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionGraphFeed)({
        ownerScopeDigest: expectedOwnerScopeDigest,
        producedAt: new Date(assessedAtMs).toISOString(),
        observations: graphObservations,
    });
    const graphMetrics = {
        discoveredCandidates: candidates.length,
        directoriesVisited: discovery.directoriesVisited,
        discoveryExhausted: discovery.exhausted,
        directoryLimitReached: discovery.directoryLimitReached,
        candidateLimitReached: discovery.candidateLimitReached,
        attemptedFiles,
        chargedScanBytes,
        droppedAttemptLimit,
        droppedScanBudget,
        droppedInvalid,
        rawBytesSelected: graphChargedBytes,
        droppedRawByteBudget,
        selectedObservations: graphObservations.length,
        droppedObservationLimit,
        selectedProviderCounts,
        selectedIsoWeeks: [...selectedIsoWeeks].sort(compareCodePoint),
    };
    return {
        slice: bindAgentSessionCommunityPlanIdentity(slice, graphFeed, graphMetrics),
        graphFeed,
        graphFileReceipts,
        graphMetrics,
    };
}
function meetingRows(parsed) {
    if (parsed === null || typeof parsed !== "object")
        return [];
    const value = parsed;
    if (Array.isArray(value.meeting_notes))
        return value.meeting_notes;
    if (Array.isArray(value.notes))
        return value.notes;
    return [];
}
async function resolveCurrentTaskMapOwnerGranolaEvidence(snapshotPath, residentReceiptPath, assessedAtMs, expectedOwnerScopeDigest) {
    const [file, receiptFile] = await Promise.all([
        readRegularJson(snapshotPath),
        readRegularJson(residentReceiptPath),
    ]);
    if (receiptFile.parsed === null
        || typeof receiptFile.parsed !== "object"
        || Array.isArray(receiptFile.parsed)) {
        throw new Error("Granola resident receipt is malformed");
    }
    const receipt = receiptFile.parsed;
    if (receipt.contractVersion !== TASKMAP_RESIDENT_RECEIPT_VERSION
        || receipt.ownerScopeDigest !== expectedOwnerScopeDigest
        || typeof receipt[TASKMAP_GRANOLA_SUCCESS_RECEIPT_KEY] !== "string"
        || typeof receipt[TASKMAP_GRANOLA_SNAPSHOT_DIGEST_RECEIPT_KEY]
            !== "string"
        || !/^[a-f0-9]{64}$/.test(receipt[TASKMAP_GRANOLA_SNAPSHOT_DIGEST_RECEIPT_KEY])) {
        throw new Error("Granola resident receipt is not owner-bound");
    }
    const successAtMs = safeTimestamp(receipt[TASKMAP_GRANOLA_SUCCESS_RECEIPT_KEY]);
    const validThroughMs = successAtMs === null
        ? null
        : successAtMs + TASKMAP_GRANOLA_MAX_AGE_MS;
    if (successAtMs === null
        || validThroughMs === null
        || assessedAtMs < successAtMs
        || assessedAtMs >= validThroughMs) {
        throw new Error("Granola producer success is not current");
    }
    if (file.parsed === null
        || typeof file.parsed !== "object"
        || Array.isArray(file.parsed)) {
        throw new Error("Granola snapshot is malformed");
    }
    const snapshot = file.parsed;
    if (!Array.isArray(snapshot.events)
        || !Array.isArray(snapshot.meeting_notes)
        || sha256(file.bytes)
            !== receipt[TASKMAP_GRANOLA_SNAPSHOT_DIGEST_RECEIPT_KEY]
        || file.modifiedAtMs
            < successAtMs - TASKMAP_GRANOLA_TIMESTAMP_TOLERANCE_MS
        || file.modifiedAtMs
            > assessedAtMs + TASKMAP_GRANOLA_TIMESTAMP_TOLERANCE_MS) {
        throw new Error("Granola snapshot is not bound to the current success");
    }
    return {
        snapshotPath,
        residentReceiptPath,
        snapshot: file,
        snapshotDigest: sha256(file.bytes),
        successAtMs,
        validThroughMs,
    };
}
async function loadCurrentTaskMapOwnerGranolaExtractionReport(input) {
    const assessedAtMs = safeTimestamp(input.assessedAt);
    if (assessedAtMs === null) {
        throw new Error("Granola evidence assessment time is invalid");
    }
    const before = await resolveCurrentTaskMapOwnerGranolaEvidence(input.snapshotPath, input.residentReceiptPath, assessedAtMs, input.ownerScopeDigest);
    const report = await (0, meeting_refresh_llm_replay_js_1.loadVerifiedTaskMapGranolaExtractionReport)({
        snapshotPath: before.snapshotPath,
        taskMapRoot: input.taskMapRoot,
        runtimeRoot: input.runtimeRoot,
        ownerScopeDigest: input.ownerScopeDigest,
        promptTemplatePath: input.promptTemplatePath,
    });
    (0, meeting_refresh_llm_replay_js_1.assertVerifiedTaskMapGranolaExtractionReportFresh)(report, input.assessedAt);
    const after = await resolveCurrentTaskMapOwnerGranolaEvidence(input.snapshotPath, input.residentReceiptPath, assessedAtMs, input.ownerScopeDigest);
    if (after.snapshotDigest !== before.snapshotDigest
        || after.successAtMs !== before.successAtMs
        || after.validThroughMs !== before.validThroughMs) {
        throw new Error("Granola evidence changed while its report was verified");
    }
    return report;
}
function meetingSliceHasCurrentGranola(slice) {
    return slice?.value.metadata.granolaCurrent === true;
}
function meetingSliceGranolaValidThroughMs(slice) {
    const value = slice?.value.metadata.granolaValidThroughMs;
    return finiteTimestamp(value) ? value : null;
}
async function collectMeetingNotes(snapshots, residentReceiptPath, assessedAtMs, expectedOwnerScopeDigest) {
    const recordsByIdentity = new Map();
    const snapshotRevisions = [];
    let availableSnapshots = 0;
    let gdocsAvailable = false;
    let granolaSuccessAtMs = null;
    let granolaValidThroughMs = null;
    for (const snapshot of snapshots) {
        let file;
        try {
            if (snapshot.sourceLabel === "granola") {
                const current = await resolveCurrentTaskMapOwnerGranolaEvidence(snapshot.filePath, residentReceiptPath, assessedAtMs, expectedOwnerScopeDigest);
                file = current.snapshot;
                granolaSuccessAtMs = current.successAtMs;
                granolaValidThroughMs = current.validThroughMs;
            }
            else {
                file = await readRegularJson(snapshot.filePath);
                (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(file.parsed);
                if (file.parsed.ownerScopeDigest !== expectedOwnerScopeDigest) {
                    throw new Error("GDocs snapshot is not owner-bound");
                }
                gdocsAvailable = true;
            }
        }
        catch {
            continue;
        }
        availableSnapshots += 1;
        const contentDigest = sha256(file.bytes);
        snapshotRevisions.push(snapshot.sourceLabel === "granola"
            ? `${snapshot.sourceLabel}:${file.modifiedAtMs}:${contentDigest}:${granolaSuccessAtMs}`
            : `${snapshot.sourceLabel}:${file.modifiedAtMs}:${contentDigest}`);
        for (const row of meetingRows(file.parsed)) {
            if (row === null || typeof row !== "object")
                continue;
            const value = row;
            const sourceIdentity = String(value.source_ref ?? value.id ?? value.document_id ?? "");
            if (!sourceIdentity)
                continue;
            const occurredAtMs = safeTimestamp(value.occurred_at
                ?? value.created_at
                ?? value.modified_time
                ?? value.updated_at);
            const record = safeRecord("meeting_note", sourceIdentity, contentDigest, occurredAtMs);
            const previous = recordsByIdentity.get(record.identityDigest);
            if (previous === undefined
                || (record.occurredAtMs ?? 0) > (previous.occurredAtMs ?? 0)) {
                recordsByIdentity.set(record.identityDigest, record);
            }
        }
    }
    if (availableSnapshots === 0) {
        throw new Error("no local meeting-note snapshot is available");
    }
    const records = [...recordsByIdentity.values()].sort((left, right) => left.identityDigest.localeCompare(right.identityDigest));
    const revision = sha256(snapshotRevisions.sort().join("\n"));
    return collectedSlice("meeting_notes", {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        source: "meeting_notes",
        recordCount: records.length,
        records,
        metadata: {
            availableSnapshots,
            gdocsAvailable,
            granolaCurrent: granolaSuccessAtMs !== null,
            granolaSuccessAtMs,
            granolaValidThroughMs,
            contextOnly: true,
        },
    }, revision, expectedOwnerScopeDigest);
}
async function collectCalendar(localExportPath, googleSnapshotPath, nowMs, expectedOwnerScopeDigest) {
    const assessedAt = new Date(nowMs).toISOString();
    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath,
        googleSnapshotPath,
        assessedAt,
        expectedOwnerScopeDigest,
    });
    if (result.availability !== "available") {
        return {
            slice: null,
            providerStatuses: result.providers,
            result,
        };
    }
    const records = result.events.map((event) => safeRecord("calendar_event", event.eventIdentityDigest, event.revisionDigest, Date.parse(event.startAt)));
    records.sort((left, right) => left.identityDigest.localeCompare(right.identityDigest));
    const currentProducedAtMs = result.providers
        .filter((provider) => provider.currentInputEligible)
        .map((provider) => Date.parse(provider.producedAt ?? ""))
        .filter(finiteTimestamp);
    const producedAtMs = currentProducedAtMs.length === 0
        ? nowMs
        : Math.max(...currentProducedAtMs);
    const local = result.providers.find((provider) => provider.provider === "local_calendar");
    const google = result.providers.find((provider) => provider.provider === "google_calendar");
    return {
        slice: collectedSlice("calendar", {
            contractVersion: "taskmap-native-safe-source-slice.v1",
            source: "calendar",
            recordCount: records.length,
            records,
            metadata: {
                producedAtMs,
                localProviderFreshness: local?.freshness ?? "missing",
                localProviderProducedAtMs: safeTimestamp(local?.producedAt) ?? null,
                localProviderValidThroughMs: safeTimestamp(local?.validThrough) ?? null,
                localProviderEventCount: local?.eventCount ?? 0,
                googleProviderFreshness: google?.freshness ?? "missing",
                googleProviderProducedAtMs: safeTimestamp(google?.producedAt) ?? null,
                googleProviderValidThroughMs: safeTimestamp(google?.validThrough) ?? null,
                googleProviderEventCount: google?.eventCount ?? 0,
                boundedSemanticTitleCount: result.events.length,
                contextOnly: true,
            },
        }, result.resultDigest, expectedOwnerScopeDigest),
        providerStatuses: result.providers,
        result,
    };
}
const TASKMAP_NATIVE_CALENDAR_PROVIDERS = [
    "local_calendar",
    "google_calendar",
];
function defaultCalendarProviderStatuses() {
    return TASKMAP_NATIVE_CALENDAR_PROVIDERS.map((provider) => ({
        provider,
        state: "unavailable",
        freshness: "missing",
        lastSuccessAtMs: null,
        nextDueAtMs: null,
        eventCount: 0,
    }));
}
function isCalendarProviderFreshness(value) {
    return (value === "current"
        || value === "boundary_due"
        || value === "stale"
        || value === "missing"
        || value === "malformed");
}
function normalizeCalendarProviderStatuses(value) {
    if (!Array.isArray(value))
        return defaultCalendarProviderStatuses();
    const byProvider = new Map();
    for (const row of value) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
            return defaultCalendarProviderStatuses();
        }
        const raw = row;
        if ((raw.provider !== "local_calendar"
            && raw.provider !== "google_calendar")
            || byProvider.has(raw.provider)
            || (raw.state !== "current"
                && raw.state !== "retained"
                && raw.state !== "unavailable")
            || !isCalendarProviderFreshness(raw.freshness)
            || (raw.lastSuccessAtMs !== null
                && !finiteTimestamp(raw.lastSuccessAtMs))
            || (raw.nextDueAtMs !== null
                && !finiteTimestamp(raw.nextDueAtMs))
            || !Number.isSafeInteger(raw.eventCount)
            || raw.eventCount < 0
            || raw.eventCount > 256
            || (raw.state === "current"
                && (raw.freshness !== "current"
                    || !finiteTimestamp(raw.lastSuccessAtMs)
                    || !finiteTimestamp(raw.nextDueAtMs)))
            || (raw.state !== "current"
                && raw.freshness === "current")
            || (raw.state !== "unavailable"
                && (!finiteTimestamp(raw.lastSuccessAtMs)
                    || raw.nextDueAtMs
                        !== raw.lastSuccessAtMs
                            + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS))
            || (raw.state === "unavailable"
                && (raw.lastSuccessAtMs !== null
                    || raw.nextDueAtMs !== null
                    || raw.eventCount !== 0))
            || (raw.lastSuccessAtMs === null
                && raw.nextDueAtMs !== null)) {
            return defaultCalendarProviderStatuses();
        }
        byProvider.set(raw.provider, {
            provider: raw.provider,
            state: raw.state,
            freshness: raw.freshness,
            lastSuccessAtMs: raw.lastSuccessAtMs,
            nextDueAtMs: raw.nextDueAtMs,
            eventCount: raw.eventCount,
        });
    }
    if (byProvider.size !== TASKMAP_NATIVE_CALENDAR_PROVIDERS.length) {
        return defaultCalendarProviderStatuses();
    }
    return TASKMAP_NATIVE_CALENDAR_PROVIDERS.map((provider) => byProvider.get(provider));
}
function mergeCalendarProviderStatuses(previous, assessed) {
    const previousByProvider = new Map(normalizeCalendarProviderStatuses(previous).map((row) => [
        row.provider,
        row,
    ]));
    const assessedByProvider = new Map(assessed.map((row) => [row.provider, row]));
    return TASKMAP_NATIVE_CALENDAR_PROVIDERS.map((provider) => {
        const current = assessedByProvider.get(provider);
        const prior = previousByProvider.get(provider);
        const producedAtMs = safeTimestamp(current?.producedAt);
        const validThroughMs = safeTimestamp(current?.validThrough);
        if (current?.freshness === "current"
            && current.currentInputEligible
            && producedAtMs !== null
            && validThroughMs !== null
            && validThroughMs
                === producedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS
            && Number.isSafeInteger(current.eventCount)
            && current.eventCount >= 0
            && current.eventCount <= 256) {
            return {
                provider,
                state: "current",
                freshness: "current",
                lastSuccessAtMs: producedAtMs,
                nextDueAtMs: validThroughMs,
                eventCount: current.eventCount,
            };
        }
        const freshness = current?.freshness ?? "malformed";
        if (prior.lastSuccessAtMs !== null) {
            return {
                provider,
                state: "retained",
                freshness,
                lastSuccessAtMs: prior.lastSuccessAtMs,
                nextDueAtMs: prior.nextDueAtMs,
                eventCount: prior.eventCount,
            };
        }
        return {
            provider,
            state: "unavailable",
            freshness,
            lastSuccessAtMs: null,
            nextDueAtMs: null,
            eventCount: 0,
        };
    });
}
function ageCalendarProviderStatuses(value, assessedAtMs) {
    if (!finiteTimestamp(assessedAtMs)) {
        return defaultCalendarProviderStatuses();
    }
    return normalizeCalendarProviderStatuses(value).map((row) => {
        if (row.nextDueAtMs === null || assessedAtMs < row.nextDueAtMs) {
            return row;
        }
        if (row.state === "current") {
            return {
                ...row,
                state: "retained",
                freshness: assessedAtMs === row.nextDueAtMs
                    ? "boundary_due"
                    : "stale",
            };
        }
        if (row.state === "retained"
            && row.freshness === "boundary_due"
            && assessedAtMs > row.nextDueAtMs) {
            return {
                ...row,
                freshness: "stale",
            };
        }
        return row;
    });
}
function defaultState(ownerScopeDigest) {
    return {
        contractVersion: exports.TASKMAP_NATIVE_REFRESH_STATE_VERSION,
        ownerScopeDigest,
        lastAttemptAtMs: null,
        lastSuccessfulRefreshAtMs: null,
        lastRefreshStatus: "unavailable",
        lastPublicationBlockReason: null,
        verifiedGraphInputDigest: null,
        verifiedCandidateDigest: null,
        verifiedProjectionDigest: null,
        verifiedRankingDigest: null,
        processedPromotionReceiptHeadDigest: null,
        lastSourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
            source,
            disposition: "unavailable",
        })),
        lastSourceSuccessAtMs: {},
        calendarProviderStatuses: defaultCalendarProviderStatuses(),
        sources: {},
    };
}
function isSource(value) {
    return (typeof value === "string"
        && owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.includes(value));
}
function isDisposition(value) {
    return (value === "fresh"
        || value === "retained_last_good"
        || value === "unavailable");
}
function isMeetingExtractionDegradationCode(value) {
    return value === "no_provider"
        || value === "provider_unauthenticated"
        || value === "remote_consent_required";
}
function isSafeSlice(source, value, expectedOwnerScopeDigest) {
    if (value === null || typeof value !== "object")
        return false;
    const slice = value;
    const safeValue = slice.value;
    return (typeof slice.revision === "string"
        && slice.revision.length > 0
        && typeof slice.sliceDigest === "string"
        && slice.sliceDigest.length > 0
        && slice.ownerScopeDigest === expectedOwnerScopeDigest
        && safeValue?.ownerScopeDigest
            === expectedOwnerScopeDigest
        && safeValue !== null
        && typeof safeValue === "object"
        && safeValue.source === source
        && safeValue.contractVersion
            === "taskmap-native-safe-source-slice.v1");
}
async function loadState(statePath, expectedOwnerScopeDigest) {
    try {
        const file = await readRegularJson(statePath, 8 * 1_024 * 1_024);
        if (file.parsed === null || typeof file.parsed !== "object") {
            return defaultState(expectedOwnerScopeDigest);
        }
        const raw = file.parsed;
        if (raw.contractVersion !== exports.TASKMAP_NATIVE_REFRESH_STATE_VERSION) {
            return defaultState(expectedOwnerScopeDigest);
        }
        if (raw.ownerScopeDigest !== expectedOwnerScopeDigest) {
            return defaultState(expectedOwnerScopeDigest);
        }
        const state = defaultState(expectedOwnerScopeDigest);
        state.lastAttemptAtMs = finiteTimestamp(raw.lastAttemptAtMs)
            ? raw.lastAttemptAtMs
            : null;
        state.lastSuccessfulRefreshAtMs =
            finiteTimestamp(raw.lastSuccessfulRefreshAtMs)
                ? raw.lastSuccessfulRefreshAtMs
                : null;
        state.lastRefreshStatus =
            raw.lastRefreshStatus === "published"
                || raw.lastRefreshStatus === "no_op"
                || raw.lastRefreshStatus === "unavailable"
                ? raw.lastRefreshStatus
                : "unavailable";
        state.lastPublicationBlockReason =
            raw.lastPublicationBlockReason === "semantic_provider_unavailable"
                || raw.lastPublicationBlockReason
                    === "accepted_membership_migration_unavailable"
                || raw.lastPublicationBlockReason
                    === "currentness_companion_required"
                || raw.lastPublicationBlockReason
                    === "predecessor_continuity_required"
                || raw.lastPublicationBlockReason === "loader_incompatible"
                || raw.lastPublicationBlockReason === "publication_failed"
                ? raw.lastPublicationBlockReason
                : null;
        state.verifiedGraphInputDigest =
            typeof raw.verifiedGraphInputDigest === "string"
                ? raw.verifiedGraphInputDigest
                : null;
        state.verifiedCandidateDigest =
            typeof raw.verifiedCandidateDigest === "string"
                ? raw.verifiedCandidateDigest
                : null;
        state.verifiedProjectionDigest =
            typeof raw.verifiedProjectionDigest === "string"
                ? raw.verifiedProjectionDigest
                : null;
        state.verifiedRankingDigest =
            typeof raw.verifiedRankingDigest === "string"
                ? raw.verifiedRankingDigest
                : null;
        state.processedPromotionReceiptHeadDigest =
            typeof raw.processedPromotionReceiptHeadDigest === "string"
                && /^[a-f0-9]{64}$/.test(raw.processedPromotionReceiptHeadDigest)
                ? raw.processedPromotionReceiptHeadDigest
                : null;
        if (Array.isArray(raw.lastSourceStatuses)) {
            state.lastSourceStatuses = raw.lastSourceStatuses
                .filter((item) => (item !== null
                && typeof item === "object"
                && isSource(item.source)
                && isDisposition(item.disposition)))
                .map((item) => {
                const record = item;
                const source = record.source;
                return {
                    source,
                    disposition: record.disposition,
                    ...(source === "meeting_notes"
                        && isMeetingExtractionDegradationCode(record.extractionDegradationCode)
                        ? {
                            extractionDegradationCode: record.extractionDegradationCode,
                        }
                        : {}),
                    ...((source === "agent_session" || source === "calendar")
                        && isStationDegradationCode(record.stationDegradationCode)
                        && Number.isSafeInteger(record.stationPendingCount)
                        && record.stationPendingCount > 0
                        ? {
                            stationDegradationCode: record.stationDegradationCode,
                            stationPendingCount: record.stationPendingCount,
                        }
                        : {}),
                };
            });
        }
        if (raw.lastSourceSuccessAtMs !== null
            && typeof raw.lastSourceSuccessAtMs === "object"
            && !Array.isArray(raw.lastSourceSuccessAtMs)) {
            for (const source of owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES) {
                const timestamp = raw.lastSourceSuccessAtMs[source];
                if (finiteTimestamp(timestamp)) {
                    state.lastSourceSuccessAtMs[source] = timestamp;
                }
            }
        }
        state.calendarProviderStatuses = normalizeCalendarProviderStatuses(raw.calendarProviderStatuses);
        if (raw.sources !== null && typeof raw.sources === "object") {
            for (const source of owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES) {
                const candidate = raw.sources[source];
                if (isSafeSlice(source, candidate, expectedOwnerScopeDigest)) {
                    state.sources[source] = candidate;
                }
            }
        }
        return state;
    }
    catch {
        return defaultState(expectedOwnerScopeDigest);
    }
}
async function ensurePrivateDirectory(directory) {
    try {
        const metadata = await (0, promises_1.lstat)(directory);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new Error("Task Map native refresh root must be a real directory");
        }
        const owner = process.getuid?.();
        if (owner !== undefined && metadata.uid !== owner) {
            throw new Error("Task Map native refresh root has the wrong owner");
        }
    }
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
        await (0, promises_1.mkdir)(directory, { recursive: true, mode: 0o700 });
    }
    await (0, promises_1.chmod)(directory, 0o700);
}
async function atomicOwnerTextWrite(directory, filename, contents) {
    await ensurePrivateDirectory(directory);
    const temporaryPath = node_path_1.default.join(directory, `.${filename}.${(0, node_crypto_1.randomUUID)()}.tmp`);
    const destinationPath = node_path_1.default.join(directory, filename);
    const handle = await (0, promises_1.open)(temporaryPath, "wx", 0o600);
    let renamed = false;
    try {
        await handle.writeFile(contents, "utf8");
        await handle.chmod(0o600);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        await (0, promises_1.rename)(temporaryPath, destinationPath);
        renamed = true;
        await syncOwnerDirectory(directory);
    }
    finally {
        if (!renamed)
            await (0, promises_1.rm)(temporaryPath, { force: true });
    }
}
async function syncOwnerDirectory(directory) {
    const handle = await (0, promises_1.open)(directory, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_DIRECTORY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat({ bigint: true });
        const owner = process.getuid?.();
        if (!metadata.isDirectory()
            || (owner !== undefined && metadata.uid !== BigInt(owner))
            || (metadata.mode & 63n) !== 0n) {
            throw new Error("owner artifact directory metadata is unsafe");
        }
        await handle.sync();
    }
    finally {
        await handle.close();
    }
}
async function durableOwnerRemove(filePath) {
    const directory = node_path_1.default.dirname(filePath);
    await (0, promises_1.rm)(filePath, { force: true });
    await syncOwnerDirectory(directory);
}
async function atomicOwnerWrite(directory, filename, value) {
    await atomicOwnerTextWrite(directory, filename, `${JSON.stringify(value, null, 2)}\n`);
}
async function atomicOwnerCanonicalWrite(directory, filename, value) {
    await atomicOwnerTextWrite(directory, filename, (0, source_contracts_js_1.taskMapContractCanonicalJson)(value));
}
async function readOwnerOnlyJson(filePath, maximumBytes) {
    const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat({ bigint: true });
        const owner = process.getuid?.();
        if (!metadata.isFile()
            || metadata.nlink !== 1n
            || (owner !== undefined && metadata.uid !== BigInt(owner))
            || (metadata.mode & 4095n) !== 384n
            || metadata.size > BigInt(maximumBytes)) {
            throw new Error("owner artifact metadata is unsafe");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (BigInt(bytes.byteLength) !== metadata.size
            || after.dev !== metadata.dev
            || after.ino !== metadata.ino
            || after.size !== metadata.size
            || after.mode !== metadata.mode
            || after.nlink !== metadata.nlink
            || after.uid !== metadata.uid
            || after.mtimeNs !== metadata.mtimeNs
            || after.ctimeNs !== metadata.ctimeNs) {
            throw new Error("owner artifact changed while it was read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            throw new Error("owner artifact is not valid JSON");
        }
        return {
            parsed,
            bytes,
            modifiedAtMs: Number(metadata.mtimeNs / 1000000n),
            device: metadata.dev,
            inode: metadata.ino,
        };
    }
    finally {
        await handle.close();
    }
}
/**
 * Read the one mutable generation selector without turning its atomic rename
 * boundary into an unavailable window. The descriptor must begin as the sole
 * link to a private owner file. After the read, only an otherwise-identical
 * descriptor whose link count stayed at one or dropped exactly to zero is
 * accepted; the latter is the opened predecessor after pathname replacement.
 */
async function readOwnerOnlyAtomicReferenceJson(filePath, maximumBytes) {
    const handle = await (0, promises_1.open)(filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat({ bigint: true });
        const owner = process.getuid?.();
        if (!metadata.isFile()
            || metadata.nlink !== 1n
            || (owner !== undefined && metadata.uid !== BigInt(owner))
            || (metadata.mode & 4095n) !== 384n
            || metadata.size > BigInt(maximumBytes)) {
            throw new Error("owner atomic reference metadata is unsafe");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        const unchangedLink = after.nlink === metadata.nlink
            && after.ctimeNs === metadata.ctimeNs;
        const atomicallyUnlinked = metadata.nlink === 1n
            && after.nlink === 0n;
        if (BigInt(bytes.byteLength) !== metadata.size
            || after.dev !== metadata.dev
            || after.ino !== metadata.ino
            || after.size !== metadata.size
            || after.mode !== metadata.mode
            || after.uid !== metadata.uid
            || after.mtimeNs !== metadata.mtimeNs
            || (!unchangedLink && !atomicallyUnlinked)) {
            throw new Error("owner atomic reference changed while it was read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            throw new Error("owner atomic reference is not valid JSON");
        }
        return {
            parsed,
            bytes,
            modifiedAtMs: Number(metadata.mtimeNs / 1000000n),
            device: metadata.dev,
            inode: metadata.ino,
        };
    }
    finally {
        await handle.close();
    }
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
}
function taskMapProjectionDigest(projection) {
    return (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
}
function rankingForNativeGraphInput(projection, ownerScopeDigest, graphInput) {
    return (0, task_ranking_publication_js_1.buildTaskMapTaskRankingPublication)({
        projection,
        ownerScopeDigest,
        sourceStatuses: graphInput.sources.map((source) => ({
            source: source.source,
            disposition: source.disposition,
            sliceDigest: source.sliceDigest,
        })),
    });
}
function contextOnlyRetirementCandidate(graphInputDigest, graphInput, ownerScopeDigest, generatedAt) {
    const projection = (0, harness_js_1.buildTaskMapProjection)({
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt,
        pointers: [],
        events: [],
    }, null, {
        arm: "E0",
        now: generatedAt,
    });
    if (projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || projection.sources.length !== 0
        || projection.roots.length !== 0
        || projection.tasks.length !== 0
        || projection.edges.length !== 0) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    const ranking = rankingForNativeGraphInput(projection, ownerScopeDigest, graphInput);
    const candidate = {
        contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection,
        currentness: currentnessForNativeProjection(projection, null),
        ranking,
        contextOnlyRetirement: {
            contractVersion: exports.TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION,
            reason: "verified_no_eligible_work",
            graphInputDigest,
            coverageDigest: (0, source_contracts_js_1.taskMapContractDigest)(ranking.coverage),
        },
    };
    return verifiedNativePublicationCandidate(candidate, ownerScopeDigest);
}
function verifiedCurrentnessCompanion(projection, value) {
    if (value === null || typeof value !== "object") {
        throw new TaskMapNativePublicationError("currentness_companion_required");
    }
    const currentness = value;
    if (!hasExactKeys(currentness, [
        "contractVersion",
        "runId",
        "inputDigest",
        "projectionDigest",
        "taskDispositions",
    ])
        || currentness.contractVersion !== exports.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION
        || currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== taskMapProjectionDigest(projection)
        || !Array.isArray(currentness.taskDispositions)) {
        throw new TaskMapNativePublicationError("currentness_companion_required");
    }
    const taskDispositions = currentness.taskDispositions.map((item) => {
        if (item === null || typeof item !== "object") {
            throw new TaskMapNativePublicationError("currentness_companion_required");
        }
        const row = item;
        if (!hasExactKeys(row, ["taskId", "disposition"])
            || typeof row.taskId !== "string"
            || (row.disposition !== "current"
                && row.disposition !== "needs_lifecycle_review")) {
            throw new TaskMapNativePublicationError("currentness_companion_required");
        }
        return {
            taskId: row.taskId,
            disposition: row.disposition,
        };
    });
    const projectionTaskIds = projection.tasks.map((task) => task.id).sort();
    const dispositionTaskIds = taskDispositions
        .map((item) => item.taskId)
        .sort();
    if (taskDispositions.length !== projectionTaskIds.length
        || new Set(dispositionTaskIds).size !== dispositionTaskIds.length
        || dispositionTaskIds.some((taskId, index) => taskId !== projectionTaskIds[index])) {
        throw new TaskMapNativePublicationError("currentness_companion_required");
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION,
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest: taskMapProjectionDigest(projection),
        taskDispositions: taskDispositions.sort((left, right) => left.taskId.localeCompare(right.taskId)),
    };
}
async function readVerifiedProjection(projectionPath, expectedDigest) {
    const file = await readOwnerOnlyJson(projectionPath, MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
    const projection = file.parsed;
    const reasons = (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection);
    if (reasons.length > 0
        || projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || (projection.brain !== null
            && !/^[a-f0-9]{64}$/.test(projection.brain.outputDigest ?? ""))) {
        throw new Error("fixed Task Map projection failed product validation");
    }
    const projectionDigest = sha256(file.bytes);
    if (expectedDigest !== undefined
        && expectedDigest !== null
        && projectionDigest !== expectedDigest) {
        throw new Error("fixed Task Map projection digest changed");
    }
    return { projection, projectionDigest };
}
/**
 * Promotion receipts whose authoritative tasks have already been published.
 * Candidate presentation uses this fail-closed handoff boundary: an absent or
 * invalid publication hides nothing, so a durable adoption cannot disappear
 * merely because refresh or relaunch happened before publication succeeded.
 */
async function acceptedPromotionIdsInVerifiedTaskMapProjection(taskMapRoot, expectedOwnerScopeDigest) {
    try {
        const projectionPath = node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json");
        const { projection } = await readVerifiedPublicationBundle(projectionPath, node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json"), undefined, false, expectedOwnerScopeDigest);
        return new Set(projection.tasks.flatMap((task) => task.reviewState === "accepted"
            && task.authority === "user"
            && typeof task.taskHomePointerId === "string"
            && /^tmcandidatepromotion_[a-f0-9]{64}$/.test(task.taskHomePointerId)
            ? [task.taskHomePointerId]
            : []));
    }
    catch {
        return new Set();
    }
}
class TaskMapNativePublicationError extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
    }
}
class TaskMapNativeSourceChangedError extends Error {
    source;
    constructor(source, message) {
        super(message);
        this.source = source;
    }
}
function verifiedNativePublicationCandidate(value, expectedOwnerScopeDigest) {
    const candidate = value;
    const candidateKeys = [
        "contractVersion",
        "projection",
        "currentness",
        ...(candidate !== null
            && typeof candidate === "object"
            && Object.prototype.hasOwnProperty.call(candidate, "ranking")
            ? ["ranking"]
            : []),
        ...(candidate !== null
            && typeof candidate === "object"
            && Object.prototype.hasOwnProperty.call(candidate, "agentSessionEpisode")
            ? ["agentSessionEpisode"]
            : []),
        ...(candidate !== null
            && typeof candidate === "object"
            && Object.prototype.hasOwnProperty.call(candidate, "agentSessionTaskProofs")
            ? ["agentSessionTaskProofs"]
            : []),
        ...(candidate !== null
            && typeof candidate === "object"
            && Object.prototype.hasOwnProperty.call(candidate, "contextOnlyRetirement")
            ? ["contextOnlyRetirement"]
            : []),
    ];
    if (candidate === null
        || typeof candidate !== "object"
        || !hasExactKeys(candidate, candidateKeys)
        || candidate.contractVersion
            !== exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    const projection = candidate.projection;
    const reasons = (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection);
    if (reasons.length > 0
        || projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || (projection.brain !== null
            && !/^[a-f0-9]{64}$/.test(projection.brain.outputDigest ?? ""))) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    let ranking;
    if (candidate.ranking !== undefined) {
        if (expectedOwnerScopeDigest === undefined) {
            throw new TaskMapNativePublicationError("loader_incompatible");
        }
        try {
            ranking = (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(candidate.ranking, projection, expectedOwnerScopeDigest);
        }
        catch {
            throw new TaskMapNativePublicationError("loader_incompatible");
        }
    }
    let contextOnlyRetirement;
    if (candidate.contextOnlyRetirement !== undefined) {
        const marker = candidate.contextOnlyRetirement;
        if (marker === null
            || typeof marker !== "object"
            || !hasExactKeys(marker, [
                "contractVersion",
                "reason",
                "graphInputDigest",
                "coverageDigest",
            ])
            || marker.contractVersion
                !== exports.TASKMAP_NATIVE_CONTEXT_ONLY_RETIREMENT_VERSION
            || marker.reason !== "verified_no_eligible_work"
            || !/^[a-f0-9]{64}$/.test(marker.graphInputDigest)
            || !/^[a-f0-9]{64}$/.test(marker.coverageDigest)
            || candidate.agentSessionEpisode !== undefined
            || candidate.agentSessionTaskProofs !== undefined
            || projection.sources.length !== 0
            || projection.roots.length !== 0
            || projection.tasks.length !== 0
            || projection.edges.length !== 0
            || ranking === undefined
            || ranking.rankedAcceptedOpen.length !== 0
            || marker.coverageDigest !== (0, source_contracts_js_1.taskMapContractDigest)(ranking.coverage)) {
            throw new TaskMapNativePublicationError("loader_incompatible");
        }
        contextOnlyRetirement = structuredClone(marker);
    }
    let agentSessionTaskProofs;
    if (candidate.agentSessionTaskProofs !== undefined) {
        if (!Array.isArray(candidate.agentSessionTaskProofs)
            || candidate.agentSessionTaskProofs.length > 128)
            throw new TaskMapNativePublicationError("loader_incompatible");
        agentSessionTaskProofs = candidate.agentSessionTaskProofs
            .map(native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)
            .sort((left, right) => left.taskId.localeCompare(right.taskId));
        if (new Set(agentSessionTaskProofs.map((row) => row.taskId)).size
            !== agentSessionTaskProofs.length
            || agentSessionTaskProofs.some((row) => !projection.tasks.some((task) => task.id === row.taskId)))
            throw new TaskMapNativePublicationError("loader_incompatible");
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection,
        currentness: verifiedCurrentnessCompanion(projection, candidate.currentness),
        ...(ranking === undefined ? {} : { ranking }),
        ...(agentSessionTaskProofs === undefined
            ? {} : { agentSessionTaskProofs }),
        ...(contextOnlyRetirement === undefined
            ? {}
            : { contextOnlyRetirement }),
        ...(candidate.agentSessionEpisode === undefined
            ? {}
            : {
                agentSessionEpisode: (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionEpisodeAdmission)(candidate.agentSessionEpisode),
            }),
    };
}
function isContextOnlyRetirementCandidate(candidate) {
    return candidate.contextOnlyRetirement !== undefined;
}
function serializedOwnerArtifactBytes(value) {
    return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function assertNativePublicationArtifactLimits(candidate) {
    if (serializedOwnerArtifactBytes(candidate.projection)
        > MAX_FIXED_TASKMAP_ARTIFACT_BYTES
        || serializedOwnerArtifactBytes(candidate.currentness)
            > MAX_FIXED_TASKMAP_ARTIFACT_BYTES
        || (candidate.ranking !== undefined
            && serializedOwnerArtifactBytes(candidate.ranking)
                > task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES)) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
}
async function preflightTaskMapNativePublicationCandidate(projectionPath, currentnessPath, graphInputDigest, candidateDigest, candidateValue, expectedOwnerScopeDigest) {
    const candidate = verifiedNativePublicationCandidate(candidateValue, expectedOwnerScopeDigest);
    assertNativePublicationArtifactLimits(candidate);
    if (!/^[a-f0-9]{64}$/.test(graphInputDigest)
        || (candidate.contextOnlyRetirement !== undefined
            && candidate.contextOnlyRetirement.graphInputDigest !== graphInputDigest)
        ||
            !/^[a-f0-9]{64}$/.test(candidateDigest)
        || sha256(canonicalJson(candidateValue)) !== candidateDigest) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    const predecessor = await readOptionalNativePredecessor(projectionPath, currentnessPath, expectedOwnerScopeDigest);
    if (predecessor === null)
        return;
    if (isContextOnlyRetirementCandidate(candidate))
        return;
    const candidateTaskIds = new Set(candidate.projection.tasks.map((task) => task.id));
    const replacesPredecessorWork = predecessor.projection.tasks.some((task) => !candidateTaskIds.has(task.id));
    const replacesAcceptedPredecessorWork = predecessor.projection.tasks.some((task) => task.reviewState === "accepted"
        && !candidateTaskIds.has(task.id));
    if (replacesAcceptedPredecessorWork
        && candidate.agentSessionEpisode === undefined) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    if (predecessor.currentWork !== null && !replacesPredecessorWork) {
        try {
            (0, native_current_work_successor_js_1.buildTaskMapNativeCurrentWorkSuccessor)(predecessor.currentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(predecessor.currentWork), "utf8"), predecessor.projection, predecessor.currentness, candidate.projection, candidate.currentness, candidate.agentSessionEpisode ?? null, candidate.agentSessionTaskProofs);
        }
        catch {
            if (candidate.ranking === undefined) {
                throw new TaskMapNativePublicationError("predecessor_continuity_required");
            }
            rebuildNativeCurrentWorkForSemanticReparent({
                predecessorCurrentWork: predecessor.currentWork,
                predecessorProjection: predecessor.projection,
                projection: candidate.projection,
                currentness: candidate.currentness,
                ranking: candidate.ranking,
                agentSessionEpisode: candidate.agentSessionEpisode ?? null,
                agentSessionTaskProofs: candidate.agentSessionTaskProofs,
            });
        }
    }
}
const TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V1 = "taskmap-native-publication-journal.v1";
const TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V2 = "taskmap-native-publication-journal.v2";
const TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V3 = "taskmap-native-publication-journal.v3";
const TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V4 = "taskmap-native-publication-journal.v4";
const TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION = "taskmap-native-publication-journal.v5";
const LOCK_GENERATION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function lockOwnerFilename(generation) {
    if (!LOCK_GENERATION_RE.test(generation)) {
        throw new Error("Task Map native lock generation is invalid");
    }
    return `owner.${generation}.json`;
}
async function tryAcquireTaskMapNativeLock(lockPath, contractVersion, readStartMarker) {
    const generation = (0, node_crypto_1.randomUUID)();
    const candidateReceiptPath = `${lockPath}.candidate.${generation}.json`;
    const owner = {
        contractVersion,
        generation,
        pid: process.pid,
        createdAtMs: Date.now(),
        processStartMarker: await readStartMarker(process.pid),
    };
    await atomicOwnerWrite(node_path_1.default.dirname(lockPath), node_path_1.default.basename(candidateReceiptPath), owner);
    let receiptInstalled = false;
    try {
        try {
            await (0, promises_1.mkdir)(lockPath, { mode: 0o700 });
        }
        catch (error) {
            const code = error.code;
            if (code === "EEXIST")
                return null;
            throw error;
        }
        try {
            await (0, promises_1.rename)(candidateReceiptPath, node_path_1.default.join(lockPath, lockOwnerFilename(generation)));
            receiptInstalled = true;
            return owner;
        }
        catch (error) {
            await (0, promises_1.rmdir)(lockPath).catch(() => undefined);
            throw error;
        }
    }
    finally {
        if (!receiptInstalled) {
            await (0, promises_1.rm)(candidateReceiptPath, { force: true });
        }
    }
}
async function readTaskMapNativeLockOwner(lockPath, contractVersion) {
    try {
        const directory = await (0, promises_1.lstat)(lockPath);
        const expectedUid = process.getuid?.();
        if (!directory.isDirectory()
            || directory.isSymbolicLink()
            || (expectedUid !== undefined && directory.uid !== expectedUid)
            || (directory.mode & 0o777) !== 0o700) {
            return null;
        }
        const entries = await (0, promises_1.readdir)(lockPath, { withFileTypes: true });
        if (entries.length !== 1 || !entries[0]?.isFile())
            return null;
        const match = /^owner\.([0-9a-f-]+)\.json$/u.exec(entries[0].name);
        if (match === null || !LOCK_GENERATION_RE.test(match[1] ?? "")) {
            return null;
        }
        const generation = match[1];
        const file = await readOwnerOnlyJson(node_path_1.default.join(lockPath, entries[0].name), 4 * 1_024);
        return parsedTaskMapNativeLockOwner(file.parsed, contractVersion, generation);
    }
    catch {
        return null;
    }
}
function parsedTaskMapNativeLockOwner(parsed, contractVersion, generation) {
    if (parsed === null || typeof parsed !== "object")
        return null;
    const raw = parsed;
    if (!hasExactKeys(raw, [
        "contractVersion", "generation", "pid", "createdAtMs",
        "processStartMarker",
    ])
        || raw.contractVersion !== contractVersion
        || raw.generation !== generation
        || !Number.isSafeInteger(raw.pid)
        || !finiteTimestamp(raw.createdAtMs)
        || (raw.processStartMarker !== null
            && typeof raw.processStartMarker !== "string")) {
        return null;
    }
    return {
        contractVersion,
        generation,
        pid: raw.pid,
        createdAtMs: raw.createdAtMs,
        processStartMarker: raw.processStartMarker,
    };
}
function sameTaskMapNativeLockOwner(left, right) {
    return left.contractVersion === right.contractVersion
        && left.generation === right.generation
        && left.pid === right.pid
        && left.createdAtMs === right.createdAtMs
        && left.processStartMarker === right.processStartMarker;
}
async function recoverEmptyTaskMapNativeLock(lockPath, contractVersion, readStartMarker, afterReceiptClaimForTesting) {
    const parent = node_path_1.default.dirname(lockPath);
    const base = node_path_1.default.basename(lockPath);
    const external = [];
    let directoryDevice;
    let directoryInode;
    try {
        const directory = await (0, promises_1.lstat)(lockPath, { bigint: true });
        const expectedUid = process.getuid?.();
        if (!directory.isDirectory()
            || directory.isSymbolicLink()
            || (expectedUid !== undefined && directory.uid !== BigInt(expectedUid))
            || (directory.mode & 511n) !== 448n
            || (await (0, promises_1.readdir)(lockPath)).length !== 0) {
            return false;
        }
        directoryDevice = directory.dev;
        directoryInode = directory.ino;
        const entries = await (0, promises_1.readdir)(parent, { withFileTypes: true });
        for (const entry of entries) {
            let generation = null;
            if (entry.name.startsWith(`${base}.candidate.`)
                && entry.name.endsWith(".json")) {
                generation = entry.name.slice(`${base}.candidate.`.length, -".json".length);
            }
            else if (entry.name.startsWith(`${base}.claim.`)
                || entry.name.startsWith(`${base}.recovery.`)) {
                const prefix = entry.name.startsWith(`${base}.claim.`)
                    ? `${base}.claim.`
                    : `${base}.recovery.`;
                const remainder = entry.name.slice(prefix.length);
                generation = remainder.slice(0, 36);
                const claimGeneration = remainder.slice(37);
                if (remainder[36] !== "."
                    || !LOCK_GENERATION_RE.test(claimGeneration)) {
                    return false;
                }
            }
            else {
                continue;
            }
            if (generation === null
                || !entry.isFile()
                || !LOCK_GENERATION_RE.test(generation)) {
                return false;
            }
            const receiptPath = node_path_1.default.join(parent, entry.name);
            const file = await readOwnerOnlyJson(receiptPath, 4 * 1_024);
            const owner = parsedTaskMapNativeLockOwner(file.parsed, contractVersion, generation);
            if (owner === null)
                return false;
            external.push({
                path: receiptPath,
                owner,
                device: file.device,
                inode: file.inode,
            });
        }
    }
    catch {
        return false;
    }
    if (external.length === 0)
        return false;
    for (const receipt of external) {
        if (await processLockOwnerIsCurrent(receipt.owner.pid, receipt.owner.processStartMarker, readStartMarker)) {
            return false;
        }
    }
    const recoveryGeneration = (0, node_crypto_1.randomUUID)();
    const recoveryOwner = {
        contractVersion,
        generation: recoveryGeneration,
        pid: process.pid,
        createdAtMs: Date.now(),
        processStartMarker: await readStartMarker(process.pid),
    };
    const recoveryGuardPath = `${lockPath}.recovery.${recoveryGeneration}.${(0, node_crypto_1.randomUUID)()}`;
    const claimed = [];
    let recoveryGuard = null;
    try {
        await atomicOwnerWrite(parent, node_path_1.default.basename(recoveryGuardPath), recoveryOwner);
        const guardFile = await readOwnerOnlyJson(recoveryGuardPath, 4 * 1_024);
        const parsedGuard = parsedTaskMapNativeLockOwner(guardFile.parsed, contractVersion, recoveryGeneration);
        if (parsedGuard === null
            || !sameTaskMapNativeLockOwner(parsedGuard, recoveryOwner)) {
            throw new Error("Task Map native recovery guard is invalid");
        }
        recoveryGuard = {
            path: recoveryGuardPath,
            owner: recoveryOwner,
            device: guardFile.device,
            inode: guardFile.inode,
        };
        for (const receipt of external) {
            const recovery = `${lockPath}.recovery.${receipt.owner.generation}.${(0, node_crypto_1.randomUUID)()}`;
            await (0, promises_1.rename)(receipt.path, recovery);
            claimed.push({
                original: receipt.path,
                recovery,
                owner: receipt.owner,
                device: receipt.device,
                inode: receipt.inode,
            });
            const claimedFile = await readOwnerOnlyJson(recovery, 4 * 1_024);
            const claimedOwner = parsedTaskMapNativeLockOwner(claimedFile.parsed, contractVersion, receipt.owner.generation);
            if (claimedOwner === null
                || !sameTaskMapNativeLockOwner(claimedOwner, receipt.owner)
                || claimedFile.device !== receipt.device
                || claimedFile.inode !== receipt.inode) {
                throw new Error("Task Map native recovery receipt changed");
            }
        }
        await afterReceiptClaimForTesting?.();
        const ownedReceipts = [
            recoveryGuard,
            ...claimed.map((receipt) => ({
                path: receipt.recovery,
                owner: receipt.owner,
                device: receipt.device,
                inode: receipt.inode,
            })),
        ].filter((receipt) => receipt !== null);
        for (const receipt of ownedReceipts) {
            const file = await readOwnerOnlyJson(receipt.path, 4 * 1_024);
            const owner = parsedTaskMapNativeLockOwner(file.parsed, contractVersion, receipt.owner.generation);
            if (owner === null
                || !sameTaskMapNativeLockOwner(owner, receipt.owner)
                || file.device !== receipt.device
                || file.inode !== receipt.inode) {
                throw new Error("Task Map native recovery ownership was lost");
            }
        }
        if ((await (0, promises_1.readdir)(lockPath)).length !== 0) {
            throw new Error("Task Map native lock initialization resumed");
        }
        const directory = await (0, promises_1.lstat)(lockPath, { bigint: true });
        const expectedUid = process.getuid?.();
        if (!directory.isDirectory()
            || directory.isSymbolicLink()
            || (expectedUid !== undefined && directory.uid !== BigInt(expectedUid))
            || (directory.mode & 511n) !== 448n
            || directory.dev !== directoryDevice
            || directory.ino !== directoryInode) {
            throw new Error("Task Map native lock directory generation changed");
        }
        await (0, promises_1.rmdir)(lockPath);
        for (const receipt of claimed) {
            await (0, promises_1.rm)(receipt.recovery, { force: true });
        }
        await (0, promises_1.rm)(recoveryGuardPath, { force: true });
        return true;
    }
    catch {
        for (const receipt of claimed.reverse()) {
            await (0, promises_1.rename)(receipt.recovery, receipt.original).catch(() => undefined);
        }
        await (0, promises_1.rm)(recoveryGuardPath, { force: true });
        return false;
    }
}
/**
 * Claim the exact generation receipt before removing its directory. If A was
 * released and B acquired, A's generation-specific filename is absent and B
 * is untouched. Once the claim rename succeeds, no new generation can enter
 * until this owner removes the now-empty lock directory.
 */
async function removeTaskMapNativeLockGeneration(lockPath, generation, afterReceiptClaimForTesting) {
    const receiptPath = node_path_1.default.join(lockPath, lockOwnerFilename(generation));
    const claimPath = `${lockPath}.claim.${generation}.${(0, node_crypto_1.randomUUID)()}`;
    try {
        await (0, promises_1.rename)(receiptPath, claimPath);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
    try {
        await afterReceiptClaimForTesting?.();
        await (0, promises_1.rmdir)(lockPath);
        await (0, promises_1.rm)(claimPath, { force: true });
        return true;
    }
    catch (error) {
        try {
            await (0, promises_1.rename)(claimPath, receiptPath);
        }
        catch {
            // Preserve the original failure; the lock remains fail-closed.
        }
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function withTaskMapNativePublicationTargetLock(projectionPath, operation) {
    const directory = node_path_1.default.dirname(node_path_1.default.resolve(projectionPath));
    await ensurePrivateDirectory(node_path_1.default.dirname(directory));
    await ensurePrivateDirectory(directory);
    const lockPath = node_path_1.default.join(directory, ".taskmap-native-publication.lock");
    const deadline = Date.now() + DEFAULT_LOCK_WAIT_MS;
    let acquired = null;
    while (true) {
        acquired = await tryAcquireTaskMapNativeLock(lockPath, "taskmap-native-publication-lock.v2", processStartMarker);
        if (acquired !== null)
            break;
        const owner = await readTaskMapNativeLockOwner(lockPath, "taskmap-native-publication-lock.v2");
        if (owner === null
            && await recoverEmptyTaskMapNativeLock(lockPath, "taskmap-native-publication-lock.v2", processStartMarker)) {
            continue;
        }
        if (owner !== null
            && !(await processLockOwnerIsCurrent(owner.pid, owner.processStartMarker))
            && await removeTaskMapNativeLockGeneration(lockPath, owner.generation)) {
            continue;
        }
        if (Date.now() >= deadline) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        await sleep(LOCK_POLL_MS);
    }
    try {
        return await operation();
    }
    finally {
        if (acquired !== null) {
            await removeTaskMapNativeLockGeneration(lockPath, acquired.generation);
        }
    }
}
async function readVerifiedCurrentness(currentnessPath, projection) {
    const file = await readOwnerOnlyJson(currentnessPath, MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
    return verifiedCurrentnessCompanion(projection, file.parsed);
}
function nativeCurrentWorkPath(projectionPath) {
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), "taskmap-current-work.v1.json");
}
function taskMapNativeReadyProofTargetsPath(projectionPath) {
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME);
}
const TASKMAP_READY_PROOF_TARGET_APPROVAL_BOUNDARY = Object.freeze({
    contractVersion: "taskmap-local-approval-inspection.v1",
    readyForLocalApproval: true,
    currentWorkApprovalGranted: false,
    currentWorkExecutable: false,
    authorizationScope: "prepare_local_package_only",
    dispatchAuthorized: false,
    sourceWritebackAuthorized: false,
    codexTaskStartAuthorized: false,
    sourceCompletionAuthorized: false,
    outcomeVerificationAuthorized: false,
});
function readyProofTargetFromCurrentWork(currentWork) {
    return {
        ...structuredClone(currentWork.nextTaskToProve),
        approvalPackage: {
            ...TASKMAP_READY_PROOF_TARGET_APPROVAL_BOUNDARY,
        },
    };
}
function initialNativeCurrentWork(projection, currentness, ranking, agentSessionEpisode, agentSessionTaskProofs) {
    const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
    const rootById = new Map(projection.roots.map((root) => [root.id, root]));
    const sourceById = new Map(projection.sources.map((source) => [source.id, source]));
    for (const ranked of ranking.rankedAcceptedOpen) {
        const task = taskById.get(ranked.taskId);
        const root = task === undefined ? undefined : rootById.get(task.rootId);
        if (task === undefined || root === undefined)
            continue;
        const contextPointerIds = [...new Set([
                ...task.originPointerIds.filter((pointerId) => sourceById.get(pointerId)?.sourceKind !== "oura"),
                ...task.citations
                    .filter((citation) => citation.sourceKind !== "oura")
                    .map((citation) => citation.pointerId),
            ])].sort();
        const predecessors = [];
        for (const edge of projection.edges) {
            let predecessorId;
            let relation;
            if (edge.relation === "depends_on" && edge.from === task.id) {
                predecessorId = edge.to;
                relation = "depends_on";
            }
            else if (edge.relation === "blocks" && edge.to === task.id) {
                predecessorId = edge.from;
                relation = "blocks";
            }
            if (predecessorId === undefined || relation === undefined)
                continue;
            const predecessor = taskById.get(predecessorId);
            if (predecessor === undefined)
                continue;
            predecessors.push({
                taskId: predecessor.id,
                relation,
                reviewState: predecessor.reviewState,
                openState: predecessor.openState,
            });
        }
        predecessors.sort((left, right) => left.taskId.localeCompare(right.taskId)
            || left.relation.localeCompare(right.relation));
        const returnTarget = task.returnRoute.state === "user_destination_required"
            ? { state: task.returnRoute.state }
            : {
                state: task.returnRoute.state,
                pointerId: task.returnRoute.pointerId,
            };
        const core = {
            contractVersion: "taskmap-current-work.v1",
            projection: {
                contractVersion: projection.contractVersion,
                runId: projection.runId,
                inputDigest: projection.inputDigest,
                generatedAt: projection.generatedAt,
                projectionDigest: currentness.projectionDigest,
            },
            currentGoal: {
                rootId: root.id,
                title: root.title,
                accepted: true,
            },
            ...(agentSessionTaskProofs === undefined ? {} : {
                agentSessionTaskProofs: agentSessionTaskProofs
                    .map((row) => (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)(row))
                    .sort((left, right) => left.taskId.localeCompare(right.taskId)),
            }),
            nextTaskToProve: {
                taskId: task.id,
                rootId: root.id,
                outcome: task.title,
                input: {
                    summary: task.summary,
                    contextPointerIds,
                    ...(agentSessionEpisode === null
                        ? {}
                        : {
                            agentSessionEpisode: structuredClone(agentSessionEpisode),
                        }),
                },
                predecessors,
                doneDefinition: [task.summary],
                permission: {
                    requiresExplicitApproval: true,
                    approvalGranted: false,
                },
                returnTarget,
                executable: false,
            },
            privacy: {
                sourceBodiesStored: false,
                localPathsStored: false,
                rawBiometricsStored: false,
            },
        };
        const currentWork = {
            ...core,
            artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(core),
        };
        try {
            return (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(currentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(currentWork), "utf8"), projection, currentness);
        }
        catch {
            // Ranking is broader than executable source-owned current work. Continue
            // deterministically until the first row satisfies the existing contract.
        }
    }
    return null;
}
function rebuildNativeCurrentWorkForSemanticReparent(input) {
    const taskId = input.predecessorCurrentWork.nextTaskToProve.taskId;
    const predecessorTask = input.predecessorProjection.tasks.find((task) => task.id === taskId);
    const successorTask = input.projection.tasks.find((task) => task.id === taskId);
    if (predecessorTask === undefined
        || successorTask === undefined
        || predecessorTask.rootId === successorTask.rootId) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    const { rootId: _predecessorRootId, ...predecessorTaskSemantics } = predecessorTask;
    const { rootId: _successorRootId, ...successorTaskSemantics } = successorTask;
    if (canonicalJson(predecessorTaskSemantics)
        !== canonicalJson(successorTaskSemantics)) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    const relatedNonMembershipEdges = (projection) => projection.edges.filter((edge) => edge.relation !== "advances"
        && (edge.from === taskId || edge.to === taskId)).map((edge) => structuredClone(edge)).sort((left, right) => left.id.localeCompare(right.id));
    if (canonicalJson(relatedNonMembershipEdges(input.predecessorProjection))
        !== canonicalJson(relatedNonMembershipEdges(input.projection))) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    const contextPointerIds = new Set([
        ...predecessorTask.originPointerIds,
        ...predecessorTask.citations.map((citation) => citation.pointerId),
    ]);
    const relevantSources = (projection) => projection.sources.filter((source) => contextPointerIds.has(source.id)).map((source) => structuredClone(source)).sort((left, right) => left.id.localeCompare(right.id));
    if (canonicalJson(relevantSources(input.predecessorProjection))
        !== canonicalJson(relevantSources(input.projection))) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    const rebuilt = initialNativeCurrentWork(input.projection, input.currentness, input.ranking, input.agentSessionEpisode, input.agentSessionTaskProofs);
    if (rebuilt?.nextTaskToProve.taskId !== taskId) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    return rebuilt;
}
function emptyReadyProofTargets(projection, currentness) {
    return (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
        projection,
        currentness,
        proofTargets: [],
    });
}
function successorReadyProofTargets(input) {
    // A missing, torn, or mismatched predecessor companion deliberately
    // publishes an empty bound collection. No predecessor is the distinct clean
    // enrollment case: its validated initial current work anchors the complete
    // structurally eligible proof frontier derived below.
    if (input.predecessor !== null && !input.predecessorVerified) {
        return emptyReadyProofTargets(input.projection, input.currentness);
    }
    const taskIds = new Set(input.projection.tasks.map((task) => task.id));
    const byTaskId = new Map((input.predecessor?.proofTargets ?? [])
        .filter((target) => taskIds.has(target.taskId))
        .map((target) => [target.taskId, structuredClone(target)]));
    if (input.currentWork !== null) {
        const target = readyProofTargetFromCurrentWork(input.currentWork);
        byTaskId.set(target.taskId, target);
    }
    if (!input.deriveMissing) {
        return (0, ready_frontier_js_1.buildTaskMapReadyProofTargets)({
            projection: input.projection,
            currentness: input.currentness,
            proofTargets: [...byTaskId.values()],
        });
    }
    return (0, ready_frontier_js_1.deriveTaskMapReadyProofTargets)({
        projection: input.projection,
        currentness: input.currentness,
        existingProofTargets: [...byTaskId.values()],
    });
}
function nativeTaskMapGenerationReferencePath(projectionPath) {
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME);
}
function nativeTaskMapGenerationDirectory(projectionPath, generationId) {
    if (!/^[a-f0-9]{64}$/.test(generationId)) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATIONS_DIRECTORY, generationId);
}
function nativeTaskRankingPath(projectionPath) {
    return node_path_1.default.join(node_path_1.default.dirname(projectionPath), task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME);
}
async function readVerifiedTaskRanking(rankingPath, projection, expectedOwnerScopeDigest) {
    const file = await readOwnerOnlyJson(rankingPath, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES);
    const validated = (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(file.parsed, projection, expectedOwnerScopeDigest);
    const canonicalBytes = Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(validated), "utf8");
    if (!file.bytes.equals(canonicalBytes)) {
        throw new Error("Task Map task ranking bytes are not canonical");
    }
    return validated;
}
async function readVerifiedCurrentWork(currentWorkPath, projection, currentness) {
    const file = await readOwnerOnlyJson(currentWorkPath, native_current_work_successor_js_1.TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES);
    return (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(file.parsed, file.bytes, projection, currentness);
}
async function readVerifiedReadyProofTargets(readyProofTargetsPath, projection, currentness) {
    const file = await readOwnerOnlyJson(readyProofTargetsPath, MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
    const validated = (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(file.parsed, projection, currentness);
    if (!file.bytes.equals(Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(validated), "utf8"))) {
        throw new Error("Task Map ready proof targets bytes are not canonical");
    }
    return validated;
}
async function readReadyProofTargetsOrEmpty(readyProofTargetsPath, projection, currentness) {
    try {
        return {
            readyProofTargets: await readVerifiedReadyProofTargets(readyProofTargetsPath, projection, currentness),
            readyProofTargetsVerified: true,
        };
    }
    catch {
        return {
            readyProofTargets: emptyReadyProofTargets(projection, currentness),
            readyProofTargetsVerified: false,
        };
    }
}
async function readVerifiedPublicationFiles(projectionPath, currentnessPath, expectedProjectionDigest, verifyRanking = true, expectedOwnerScopeDigest) {
    const verified = await readVerifiedProjection(projectionPath, expectedProjectionDigest);
    let currentness;
    try {
        currentness = await readVerifiedCurrentness(currentnessPath, verified.projection);
    }
    catch {
        throw new TaskMapNativePublicationError("currentness_companion_required");
    }
    const currentWorkPath = nativeCurrentWorkPath(projectionPath);
    const rankingPath = nativeTaskRankingPath(projectionPath);
    const readyProofTargetsPath = taskMapNativeReadyProofTargetsPath(projectionPath);
    const currentWork = await ownerArtifactExists(currentWorkPath)
        ? await readVerifiedCurrentWork(currentWorkPath, verified.projection, currentness)
        : null;
    const rankingExists = verifyRanking
        && await ownerArtifactExists(rankingPath);
    if (rankingExists && expectedOwnerScopeDigest === undefined) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    const ranking = rankingExists
        ? await readVerifiedTaskRanking(rankingPath, verified.projection, expectedOwnerScopeDigest)
        : null;
    const readyProofTargets = await readReadyProofTargetsOrEmpty(readyProofTargetsPath, verified.projection, currentness);
    return {
        ...verified,
        currentness,
        currentWork,
        ranking,
        ...readyProofTargets,
    };
}
function generationArtifactReceipt(value, filename) {
    if (value === null)
        return null;
    if (typeof value !== "object"
        || !hasExactKeys(value, ["filename", "sha256"])) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    const raw = value;
    if (raw.filename !== filename || !/^[a-f0-9]{64}$/.test(String(raw.sha256))) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    return { filename, sha256: raw.sha256 };
}
function legacyGenerationManifestCanonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(legacyGenerationManifestCanonicalJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => {
            // Before db7bd55, localeCompare placed this case-mixed pair in the
            // opposite order. Accept only that known legacy manifest ordering so
            // an intact predecessor can be migrated by the next publication.
            if (left === "currentness" && right === "currentWork")
                return -1;
            if (left === "currentWork" && right === "currentness")
                return 1;
            return left < right ? -1 : left > right ? 1 : 0;
        })
            .map(([key, item]) => `${JSON.stringify(key)}:${legacyGenerationManifestCanonicalJson(item)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
async function resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest, referenceOverride) {
    const referencePath = nativeTaskMapGenerationReferencePath(projectionPath);
    if (referenceOverride === undefined
        && !(await ownerArtifactExists(referencePath)))
        return null;
    try {
        const referenceFile = referenceOverride === undefined
            ? await readOwnerOnlyAtomicReferenceJson(referencePath, 16 * 1_024)
            : null;
        const rawReference = referenceOverride === undefined
            ? referenceFile.parsed
            : referenceOverride;
        if (rawReference === null
            || typeof rawReference !== "object"
            || !hasExactKeys(rawReference, [
                "contractVersion",
                "generationId",
                "ownerScopeDigest",
                "manifestDigest",
            ])
            || rawReference.contractVersion
                !== exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION
            || !/^[a-f0-9]{64}$/.test(String(rawReference.generationId))
            || rawReference.ownerScopeDigest
                !== expectedOwnerScopeDigest
            || !/^[a-f0-9]{64}$/.test(String(rawReference.manifestDigest))
            || (referenceFile !== null
                && !referenceFile.bytes.equals(Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(referenceFile.parsed), "utf8")))) {
            throw new Error("invalid generation reference");
        }
        const reference = rawReference;
        const directory = nativeTaskMapGenerationDirectory(projectionPath, reference.generationId);
        const manifestPath = node_path_1.default.join(directory, exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME);
        const manifestFile = await readOwnerOnlyJson(manifestPath, MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES);
        if (sha256(manifestFile.bytes) !== reference.manifestDigest
            || manifestFile.parsed === null
            || typeof manifestFile.parsed !== "object"
            || !hasExactKeys(manifestFile.parsed, [
                "contractVersion",
                "generationId",
                "ownerScopeDigest",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "artifacts",
            ])
            || (!manifestFile.bytes.equals(Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(manifestFile.parsed), "utf8"))
                && !manifestFile.bytes.equals(Buffer.from(legacyGenerationManifestCanonicalJson(manifestFile.parsed), "utf8")))) {
            throw new Error("invalid generation manifest");
        }
        const rawManifest = manifestFile.parsed;
        if (rawManifest.contractVersion !== exports.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION
            || rawManifest.generationId !== reference.generationId
            || rawManifest.ownerScopeDigest !== expectedOwnerScopeDigest
            || !/^[a-f0-9]{64}$/.test(String(rawManifest.graphInputDigest))
            || rawManifest.candidateDigest !== reference.generationId
            || !finiteTimestamp(rawManifest.requestedAtMs)
            || rawManifest.artifacts === null
            || typeof rawManifest.artifacts !== "object"
            || !hasExactKeys(rawManifest.artifacts, [
                "projection",
                "currentness",
                "currentWork",
                "ranking",
            ])) {
            throw new Error("invalid generation manifest");
        }
        const rawArtifacts = rawManifest.artifacts;
        const projection = generationArtifactReceipt(rawArtifacts.projection, node_path_1.default.basename(projectionPath));
        const currentness = generationArtifactReceipt(rawArtifacts.currentness, "taskmap-currentness.v1.json");
        const currentWork = generationArtifactReceipt(rawArtifacts.currentWork, "taskmap-current-work.v1.json");
        const ranking = generationArtifactReceipt(rawArtifacts.ranking, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME);
        if (projection === null || currentness === null || ranking === null) {
            throw new Error("generation is incomplete");
        }
        const receipts = [projection, currentness, currentWork, ranking]
            .filter((value) => value !== null);
        for (const receipt of receipts) {
            const artifactFile = await readOwnerOnlyJson(node_path_1.default.join(directory, receipt.filename), receipt.filename === task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME
                ? task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES
                : MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
            if (sha256(artifactFile.bytes) !== receipt.sha256) {
                throw new Error("generation artifact digest mismatch");
            }
        }
        return {
            reference,
            manifest: rawManifest,
            directory,
            projectionPath: node_path_1.default.join(directory, projection.filename),
            currentnessPath: node_path_1.default.join(directory, currentness.filename),
            currentWorkPath: node_path_1.default.join(directory, "taskmap-current-work.v1.json"),
            rankingPath: node_path_1.default.join(directory, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME),
            readyProofTargetsPath: node_path_1.default.join(directory, exports.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME),
        };
    }
    catch {
        throw new TaskMapNativePublicationError("publication_failed");
    }
}
async function readVerifiedPublicationBundle(projectionPath, currentnessPath, expectedProjectionDigest, verifyRanking = true, expectedOwnerScopeDigest) {
    if (expectedOwnerScopeDigest !== undefined) {
        const generation = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest);
        if (generation === null) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        return readVerifiedPublicationFiles(generation.projectionPath, generation.currentnessPath, expectedProjectionDigest, verifyRanking, expectedOwnerScopeDigest);
    }
    return readVerifiedPublicationFiles(projectionPath, currentnessPath, expectedProjectionDigest, verifyRanking, expectedOwnerScopeDigest);
}
async function ownerArtifactExists(filePath) {
    try {
        await (0, promises_1.lstat)(filePath);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function readOptionalNativePredecessor(projectionPath, currentnessPath, expectedOwnerScopeDigest) {
    const committedGeneration = expectedOwnerScopeDigest === undefined
        ? null
        : await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest);
    if (expectedOwnerScopeDigest !== undefined
        && committedGeneration === null) {
        return null;
    }
    const selectedProjectionPath = committedGeneration?.projectionPath
        ?? projectionPath;
    const selectedCurrentnessPath = committedGeneration?.currentnessPath
        ?? currentnessPath;
    const currentWorkPath = committedGeneration?.currentWorkPath
        ?? nativeCurrentWorkPath(projectionPath);
    const rankingPath = committedGeneration?.rankingPath
        ?? nativeTaskRankingPath(projectionPath);
    const readyProofTargetsPath = committedGeneration?.readyProofTargetsPath
        ?? taskMapNativeReadyProofTargetsPath(projectionPath);
    const [projectionExists, currentnessExists, currentWorkExists, rankingExists, readyProofTargetsExists,] = committedGeneration === null
        ? await Promise.all([
            ownerArtifactExists(selectedProjectionPath),
            ownerArtifactExists(selectedCurrentnessPath),
            ownerArtifactExists(currentWorkPath),
            ownerArtifactExists(rankingPath),
            ownerArtifactExists(readyProofTargetsPath),
        ])
        : [
            true,
            true,
            committedGeneration.manifest.artifacts.currentWork !== null,
            committedGeneration.manifest.artifacts.ranking !== null,
            await ownerArtifactExists(readyProofTargetsPath),
        ];
    if (!projectionExists
        && !currentnessExists
        && !currentWorkExists
        && !rankingExists
        && !readyProofTargetsExists) {
        return null;
    }
    if (projectionExists !== currentnessExists) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    if (!projectionExists || !currentnessExists) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    try {
        const predecessor = await readVerifiedProjection(selectedProjectionPath);
        const currentnessFile = await readOwnerOnlyJson(selectedCurrentnessPath, MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
        const currentness = verifiedCurrentnessCompanion(predecessor.projection, currentnessFile.parsed);
        const currentWork = currentWorkExists
            ? await readVerifiedCurrentWork(currentWorkPath, predecessor.projection, currentness)
            : null;
        const rankingFile = rankingExists
            ? await readOwnerOnlyJson(rankingPath, task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES)
            : null;
        const ranking = rankingFile === null
            ? null
            : (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(rankingFile.parsed, predecessor.projection, expectedOwnerScopeDigest ?? (() => {
                throw new Error("expected ranking owner is required");
            })());
        if (ranking !== null
            && !rankingFile.bytes.equals(Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(ranking), "utf8"))) {
            throw new Error("Task Map predecessor ranking bytes are not canonical");
        }
        const readyProofTargets = await readReadyProofTargetsOrEmpty(readyProofTargetsPath, predecessor.projection, currentness);
        return {
            projection: predecessor.projection,
            projectionFileDigest: predecessor.projectionDigest,
            currentness,
            currentnessFileDigest: sha256(currentnessFile.bytes),
            rawCurrentness: currentnessFile.parsed,
            currentWork,
            ranking,
            rawRanking: rankingFile?.parsed ?? null,
            generationId: committedGeneration?.reference.generationId ?? null,
            ...readyProofTargets,
        };
    }
    catch {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
}
async function readVerifiedHistoricalAgentSessionTaskProofs(projectionPath, expectedOwnerScopeDigest) {
    const generationsDirectory = node_path_1.default.join(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATIONS_DIRECTORY);
    let entries;
    try {
        entries = await (0, promises_1.readdir)(generationsDirectory, { withFileTypes: true });
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw error;
    }
    const generationIds = boundedHistoricalGenerationIdsForRecovery(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    // An arbitrary prefix cannot prove global uniqueness: a conflicting proof
    // might sit just outside it. Until there is an authenticated history index,
    // stores beyond the verified scan bound carry no historical authority.
    if (generationIds === null)
        return [];
    const proofByTaskId = new Map();
    const ambiguousTaskIds = new Set();
    for (const generationId of generationIds) {
        try {
            const manifestFile = await readOwnerOnlyJson(node_path_1.default.join(generationsDirectory, generationId, exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME), MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES);
            const manifest = manifestFile.parsed;
            if (manifest === null
                || typeof manifest !== "object"
                || manifest.generationId !== generationId
                || manifest.ownerScopeDigest !== expectedOwnerScopeDigest)
                continue;
            const resolved = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest, {
                contractVersion: exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
                generationId,
                ownerScopeDigest: expectedOwnerScopeDigest,
                manifestDigest: sha256(manifestFile.bytes),
            });
            if (resolved === null || resolved.manifest.artifacts.currentWork === null) {
                continue;
            }
            const verified = await readVerifiedPublicationFiles(resolved.projectionPath, resolved.currentnessPath, undefined, true, expectedOwnerScopeDigest);
            for (const rawProof of verified.currentWork?.agentSessionTaskProofs ?? []) {
                const proof = (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)(rawProof);
                if (ambiguousTaskIds.has(proof.taskId))
                    continue;
                const previous = proofByTaskId.get(proof.taskId);
                if (previous !== undefined
                    && canonicalJson(previous) !== canonicalJson(proof)) {
                    proofByTaskId.delete(proof.taskId);
                    ambiguousTaskIds.add(proof.taskId);
                    continue;
                }
                proofByTaskId.set(proof.taskId, proof);
            }
        }
        catch {
            // Historical generations are optional recovery evidence. A torn,
            // legacy-incompatible, or unauthenticated generation contributes no
            // authority; other independently verified generations remain usable.
        }
    }
    return [...proofByTaskId.values()].sort((left, right) => compareCodePoint(left.taskId, right.taskId));
}
function boundedHistoricalGenerationIdsForRecovery(generationIds) {
    const eligible = generationIds.filter((generationId) => /^[a-f0-9]{64}$/.test(generationId)).sort(compareCodePoint);
    return eligible.length > 128 ? null : eligible;
}
function mergeAcceptedAgentSessionTaskProofHistory(immediate, historical) {
    const proofByTaskId = new Map();
    const ambiguousTaskIds = new Set();
    for (const rawProof of [...immediate, ...historical]) {
        const proof = (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)(rawProof);
        if (ambiguousTaskIds.has(proof.taskId))
            continue;
        const previous = proofByTaskId.get(proof.taskId);
        if (previous !== undefined
            && canonicalJson(previous) !== canonicalJson(proof)) {
            proofByTaskId.delete(proof.taskId);
            ambiguousTaskIds.add(proof.taskId);
            continue;
        }
        proofByTaskId.set(proof.taskId, proof);
    }
    return [...proofByTaskId.values()].sort((left, right) => compareCodePoint(left.taskId, right.taskId)).slice(0, 128);
}
async function taskMapNativeArtifactReceipt(filePath) {
    const file = await readOwnerOnlyJson(filePath, node_path_1.default.basename(filePath) === task_ranking_publication_js_1.TASKMAP_TASK_RANKING_FILENAME
        ? task_ranking_publication_js_1.TASKMAP_TASK_RANKING_MAX_BYTES
        : MAX_FIXED_TASKMAP_ARTIFACT_BYTES);
    return {
        filename: node_path_1.default.basename(filePath),
        sha256: sha256(file.bytes),
    };
}
async function mirrorCommittedTaskMapGeneration(projectionPath, currentnessPath, candidate, currentWork, ranking, readyProofTargets) {
    const directory = node_path_1.default.dirname(projectionPath);
    try {
        await atomicOwnerCanonicalWrite(directory, node_path_1.default.basename(currentnessPath), candidate.currentness);
        if (currentWork === null) {
            await durableOwnerRemove(nativeCurrentWorkPath(projectionPath));
        }
        else {
            await atomicOwnerCanonicalWrite(directory, node_path_1.default.basename(nativeCurrentWorkPath(projectionPath)), currentWork);
        }
        await atomicOwnerCanonicalWrite(directory, node_path_1.default.basename(nativeTaskRankingPath(projectionPath)), ranking);
        await atomicOwnerCanonicalWrite(directory, node_path_1.default.basename(projectionPath), candidate.projection);
        // This is a compatibility output only. The immutable owner-selected
        // generation remains authoritative, and readers validate this mirror's
        // projection/currentness seal before exposing any ready leaf.
        await atomicOwnerCanonicalWrite(directory, exports.TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME, readyProofTargets);
    }
    catch {
        // Compatibility mirrors are not a visibility boundary. Swift and all new
        // Node reads use the already-committed immutable generation reference.
    }
}
async function installTaskMapNativeGeneration(projectionPath, currentnessPath, input, candidate, candidateCurrentWork, candidateRanking, candidateReadyProofTargets, dependencies = {}) {
    const expectedOwnerScopeDigest = input.expectedOwnerScopeDigest;
    if (expectedOwnerScopeDigest === undefined) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    const current = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest);
    if (current?.reference.generationId === input.candidateDigest) {
        const verified = await readVerifiedPublicationFiles(current.projectionPath, current.currentnessPath, undefined, true, expectedOwnerScopeDigest);
        await mirrorCommittedTaskMapGeneration(projectionPath, currentnessPath, candidate, verified.currentWork, candidateRanking, verified.readyProofTargets);
        return {
            verified,
            reference: current.reference,
        };
    }
    const root = node_path_1.default.join(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATIONS_DIRECTORY);
    const directory = nativeTaskMapGenerationDirectory(projectionPath, input.candidateDigest);
    await ensurePrivateDirectory(root);
    const manifestPath = node_path_1.default.join(directory, exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME);
    if (await ownerArtifactExists(manifestPath)) {
        const manifestFile = await readOwnerOnlyJson(manifestPath, MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES);
        const existingReference = {
            contractVersion: exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
            generationId: input.candidateDigest,
            ownerScopeDigest: expectedOwnerScopeDigest,
            manifestDigest: sha256(manifestFile.bytes),
        };
        const existing = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest, existingReference);
        if (existing === null
            || existing.manifest.graphInputDigest !== input.graphInputDigest
            || existing.manifest.candidateDigest !== input.candidateDigest
            || existing.manifest.requestedAtMs !== input.requestedAtMs) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        const verifiedExisting = await readVerifiedPublicationFiles(existing.projectionPath, existing.currentnessPath, undefined, true, expectedOwnerScopeDigest);
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(verifiedExisting.projection)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(candidate.projection)
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(verifiedExisting.currentness)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(candidate.currentness)
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(verifiedExisting.currentWork)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(candidateCurrentWork)
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(verifiedExisting.ranking)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(candidateRanking)
            || (0, source_contracts_js_1.taskMapContractCanonicalJson)(verifiedExisting.readyProofTargets)
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(candidateReadyProofTargets)) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        await (dependencies.writeGenerationReference ?? atomicOwnerCanonicalWrite)(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME, existingReference);
        const committedExisting = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest);
        if (committedExisting?.reference.generationId !== input.candidateDigest) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        await mirrorCommittedTaskMapGeneration(projectionPath, currentnessPath, candidate, candidateCurrentWork, candidateRanking, candidateReadyProofTargets);
        return {
            verified: verifiedExisting,
            reference: existingReference,
        };
    }
    await ensurePrivateDirectory(directory);
    const generationProjectionPath = node_path_1.default.join(directory, node_path_1.default.basename(projectionPath));
    const generationCurrentnessPath = node_path_1.default.join(directory, node_path_1.default.basename(currentnessPath));
    const generationCurrentWorkPath = nativeCurrentWorkPath(generationProjectionPath);
    const generationRankingPath = nativeTaskRankingPath(generationProjectionPath);
    const generationReadyProofTargetsPath = taskMapNativeReadyProofTargetsPath(generationProjectionPath);
    await (dependencies.writeCurrentness ?? atomicOwnerCanonicalWrite)(directory, node_path_1.default.basename(generationCurrentnessPath), candidate.currentness);
    await readVerifiedCurrentness(generationCurrentnessPath, candidate.projection);
    if (candidateCurrentWork === null) {
        await durableOwnerRemove(generationCurrentWorkPath);
    }
    else {
        await (dependencies.writeCurrentWork ?? atomicOwnerCanonicalWrite)(directory, node_path_1.default.basename(generationCurrentWorkPath), candidateCurrentWork);
        await readVerifiedCurrentWork(generationCurrentWorkPath, candidate.projection, candidate.currentness);
    }
    await (dependencies.writeReadyProofTargets ?? atomicOwnerCanonicalWrite)(directory, node_path_1.default.basename(generationReadyProofTargetsPath), candidateReadyProofTargets);
    const verifiedReadyProofTargets = await readVerifiedReadyProofTargets(generationReadyProofTargetsPath, candidate.projection, candidate.currentness);
    if (verifiedReadyProofTargets.artifactDigest
        !== candidateReadyProofTargets.artifactDigest) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    await (dependencies.writeRanking ?? atomicOwnerCanonicalWrite)(directory, node_path_1.default.basename(generationRankingPath), candidateRanking);
    await readVerifiedTaskRanking(generationRankingPath, candidate.projection, expectedOwnerScopeDigest);
    await (dependencies.writeProjection ?? atomicOwnerCanonicalWrite)(directory, node_path_1.default.basename(generationProjectionPath), candidate.projection);
    const verified = await readVerifiedPublicationFiles(generationProjectionPath, generationCurrentnessPath, undefined, true, expectedOwnerScopeDigest);
    const manifest = {
        contractVersion: exports.TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION,
        generationId: input.candidateDigest,
        ownerScopeDigest: expectedOwnerScopeDigest,
        graphInputDigest: input.graphInputDigest,
        candidateDigest: input.candidateDigest,
        requestedAtMs: input.requestedAtMs,
        artifacts: {
            projection: await taskMapNativeArtifactReceipt(generationProjectionPath),
            currentness: await taskMapNativeArtifactReceipt(generationCurrentnessPath),
            currentWork: candidateCurrentWork === null
                ? null
                : await taskMapNativeArtifactReceipt(generationCurrentWorkPath),
            ranking: await taskMapNativeArtifactReceipt(generationRankingPath),
        },
    };
    await (dependencies.writeGenerationManifest ?? atomicOwnerCanonicalWrite)(directory, exports.TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME, manifest);
    const manifestFile = await readOwnerOnlyJson(manifestPath, MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES);
    if (!manifestFile.bytes.equals(Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(manifest), "utf8"))) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    const reference = {
        contractVersion: exports.TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
        generationId: input.candidateDigest,
        ownerScopeDigest: expectedOwnerScopeDigest,
        manifestDigest: sha256(manifestFile.bytes),
    };
    await (dependencies.writeGenerationReference ?? atomicOwnerCanonicalWrite)(node_path_1.default.dirname(projectionPath), exports.TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME, reference);
    const committed = await resolveTaskMapNativeGeneration(projectionPath, expectedOwnerScopeDigest);
    if (committed?.reference.generationId !== input.candidateDigest) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    await mirrorCommittedTaskMapGeneration(projectionPath, currentnessPath, candidate, candidateCurrentWork, candidateRanking, candidateReadyProofTargets);
    return { verified, reference };
}
function currentnessForNativeProjection(projection, predecessor) {
    const priorDispositions = new Map(predecessor?.taskDispositions.map((item) => [
        item.taskId,
        item.disposition,
    ]) ?? []);
    const dispositions = new Map(projection.tasks.map((task) => [
        task.id,
        task.reviewState === "proposed"
            ? "needs_lifecycle_review"
            : priorDispositions.get(task.id)
                ?? "current",
    ]));
    const currentSourceRefs = new Set();
    for (const task of projection.tasks) {
        if (dispositions.get(task.id) !== "current"
            || task.reviewState === "proposed"
            || task.authority === "none") {
            continue;
        }
        if (task.taskHomePointerId !== undefined) {
            currentSourceRefs.add(task.taskHomePointerId);
        }
        for (const pointerId of task.originPointerIds) {
            currentSourceRefs.add(pointerId);
        }
    }
    for (const task of projection.tasks) {
        if (dispositions.get(task.id) !== "needs_lifecycle_review"
            || task.reviewState !== "proposed"
            || task.openState === "completed"
            || task.openState === "superseded") {
            continue;
        }
        const supportRefs = [...new Set(task.originPointerIds)].sort();
        if (supportRefs.length >= 2
            && supportRefs.every((pointerId) => currentSourceRefs.has(pointerId))) {
            dispositions.set(task.id, "current");
        }
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_CURRENTNESS_GATE_VERSION,
        runId: projection.runId,
        inputDigest: projection.inputDigest,
        projectionDigest: taskMapProjectionDigest(projection),
        taskDispositions: projection.tasks.map((task) => ({
            taskId: task.id,
            disposition: dispositions.get(task.id),
        })).sort((left, right) => left.taskId.localeCompare(right.taskId)),
    };
}
async function recoverPublicationPairUnlocked(projectionPath, currentnessPath, journalPath, expectedOwnerScopeDigest, expectedPromotionReceiptHeadDigest) {
    let journal;
    try {
        const file = await readOwnerOnlyJson(journalPath, MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES);
        if (file.parsed === null || typeof file.parsed !== "object") {
            throw new Error("Task Map publication journal is invalid");
        }
        const raw = file.parsed;
        const legacyJournal = raw.contractVersion === TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V1
            && hasExactKeys(raw, [
                "contractVersion",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "candidateProjectionDigest",
                "candidate",
                "previousCurrentness",
            ]);
        const legacyCurrentWorkJournal = raw.contractVersion === TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V2
            && hasExactKeys(raw, [
                "contractVersion",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "candidateProjectionDigest",
                "candidate",
                "previousCurrentness",
                "candidateCurrentWork",
                "previousCurrentWork",
            ]);
        const rankingJournal = raw.contractVersion === TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V3
            && hasExactKeys(raw, [
                "contractVersion",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "candidateProjectionDigest",
                "candidate",
                "previousCurrentness",
                "candidateCurrentWork",
                "previousCurrentWork",
                "candidateRanking",
                "previousRanking",
            ]);
        const readyProofJournal = raw.contractVersion === TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V4
            && hasExactKeys(raw, [
                "contractVersion",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "candidateProjectionDigest",
                "candidate",
                "previousCurrentness",
                "candidateCurrentWork",
                "previousCurrentWork",
                "candidateRanking",
                "previousRanking",
                "candidateReadyProofTargets",
            ]);
        const currentJournal = raw.contractVersion === TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION
            && hasExactKeys(raw, [
                "contractVersion",
                "graphInputDigest",
                "candidateDigest",
                "requestedAtMs",
                "promotionReceiptHeadDigest",
                "candidateProjectionDigest",
                "candidate",
                "previousCurrentness",
                "candidateCurrentWork",
                "previousCurrentWork",
                "candidateRanking",
                "previousRanking",
                "candidateReadyProofTargets",
            ]);
        const ownerJournal = rankingJournal || readyProofJournal || currentJournal;
        if (expectedOwnerScopeDigest !== undefined && !ownerJournal) {
            throw new Error("Task Map owner publication journal ranking is missing");
        }
        if ((!legacyJournal
            && !legacyCurrentWorkJournal
            && !rankingJournal
            && !readyProofJournal
            && !currentJournal)
            || typeof raw.graphInputDigest !== "string"
            || !/^[a-f0-9]{64}$/.test(raw.graphInputDigest)
            || typeof raw.candidateDigest !== "string"
            || !/^[a-f0-9]{64}$/.test(raw.candidateDigest)
            || !finiteTimestamp(raw.requestedAtMs)
            || (currentJournal
                && !/^[a-f0-9]{64}$/.test(String(raw.promotionReceiptHeadDigest)))
            || typeof raw.candidateProjectionDigest !== "string"
            || !/^[a-f0-9]{64}$/.test(raw.candidateProjectionDigest)) {
            throw new Error("Task Map publication journal is invalid");
        }
        const candidate = verifiedNativePublicationCandidate(raw.candidate, expectedOwnerScopeDigest);
        if (sha256(canonicalJson(raw.candidate)) !== raw.candidateDigest
            || taskMapProjectionDigest(candidate.projection)
                !== raw.candidateProjectionDigest) {
            throw new Error("Task Map publication journal candidate is invalid");
        }
        let candidateCurrentWork = null;
        let previousCurrentWork = null;
        if (legacyCurrentWorkJournal || ownerJournal) {
            if (raw.candidateCurrentWork !== null
                && (raw.candidateCurrentWork === undefined
                    || typeof raw.candidateCurrentWork !== "object")) {
                throw new Error("Task Map publication journal is invalid");
            }
            if (raw.candidateCurrentWork !== null) {
                candidateCurrentWork = (0, native_current_work_successor_js_1.validateTaskMapNativeCurrentWork)(raw.candidateCurrentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(raw.candidateCurrentWork), "utf8"), candidate.projection, candidate.currentness);
            }
            if (raw.previousCurrentWork !== null
                && (raw.previousCurrentWork === undefined
                    || typeof raw.previousCurrentWork !== "object")) {
                throw new Error("Task Map publication journal is invalid");
            }
            previousCurrentWork = raw.previousCurrentWork;
        }
        let candidateRanking = null;
        if (ownerJournal && raw.candidateRanking === null) {
            throw new Error("Task Map publication journal ranking is missing");
        }
        if (ownerJournal && raw.candidateRanking !== null) {
            candidateRanking = (0, task_ranking_publication_js_1.validateTaskMapTaskRankingPublication)(raw.candidateRanking, candidate.projection, expectedOwnerScopeDigest ?? (() => {
                throw new Error("expected ranking owner is required");
            })());
            if (candidate.ranking === undefined
                || candidateRanking.artifactDigest !== candidate.ranking.artifactDigest) {
                throw new Error("Task Map publication journal ranking is invalid");
            }
        }
        const candidateReadyProofTargets = (readyProofJournal || currentJournal)
            ? (0, ready_frontier_js_1.validateTaskMapReadyProofTargets)(raw.candidateReadyProofTargets, candidate.projection, candidate.currentness)
            : emptyReadyProofTargets(candidate.projection, candidate.currentness);
        journal = {
            contractVersion: raw.contractVersion,
            graphInputDigest: raw.graphInputDigest,
            candidateDigest: raw.candidateDigest,
            requestedAtMs: raw.requestedAtMs,
            promotionReceiptHeadDigest: currentJournal
                ? raw.promotionReceiptHeadDigest
                : null,
            candidateProjectionDigest: raw.candidateProjectionDigest,
            candidate: raw.candidate,
            previousCurrentness: raw.previousCurrentness,
            candidateCurrentWork,
            previousCurrentWork,
            candidateRanking,
            previousRanking: ownerJournal ? raw.previousRanking : null,
            candidateReadyProofTargets,
            tracksCurrentWork: legacyCurrentWorkJournal || ownerJournal,
            tracksRanking: ownerJournal,
            tracksReadyProofTargets: readyProofJournal || currentJournal,
            tracksPromotionReceiptHead: currentJournal,
        };
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    const verifiedCandidate = verifiedNativePublicationCandidate(journal.candidate, expectedOwnerScopeDigest);
    if (expectedPromotionReceiptHeadDigest !== undefined
        && (journal.tracksPromotionReceiptHead
            ? journal.promotionReceiptHeadDigest
                !== expectedPromotionReceiptHeadDigest
            : expectedPromotionReceiptHeadDigest
                !== (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null))) {
        await durableOwnerRemove(journalPath);
        return null;
    }
    const projection = verifiedCandidate.projection;
    const currentness = verifiedCurrentnessCompanion(projection, verifiedCandidate.currentness);
    const recoveredRanking = journal.candidateRanking;
    if (recoveredRanking === null) {
        throw new Error("Task Map owner publication journal ranking is missing");
    }
    const installed = await installTaskMapNativeGeneration(projectionPath, currentnessPath, {
        graphInputDigest: journal.graphInputDigest,
        candidateDigest: journal.candidateDigest,
        candidate: journal.candidate,
        requestedAtMs: journal.requestedAtMs,
        expectedOwnerScopeDigest,
    }, verifiedCandidate, journal.candidateCurrentWork, recoveredRanking, journal.candidateReadyProofTargets);
    const recovered = installed.verified;
    if (taskMapProjectionDigest(recovered.projection)
        !== journal.candidateProjectionDigest
        || (journal.candidateCurrentWork !== null
            && recovered.currentWork?.artifactDigest
                !== journal.candidateCurrentWork.artifactDigest)) {
        throw new Error("Task Map publication generation recovery failed");
    }
    if (recovered.ranking?.artifactDigest !== recoveredRanking.artifactDigest) {
        throw new Error("Task Map publication ranking recovery failed");
    }
    if (recovered.readyProofTargets.artifactDigest
        !== journal.candidateReadyProofTargets.artifactDigest) {
        throw new Error("Task Map ready proof target recovery failed");
    }
    return {
        graphInputDigest: journal.graphInputDigest,
        candidateDigest: journal.candidateDigest,
        requestedAtMs: journal.requestedAtMs,
        promotionReceiptHeadDigest: journal.tracksPromotionReceiptHead
            ? journal.promotionReceiptHeadDigest
            : (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null),
        projectionDigest: recovered.projectionDigest,
        rankingDigest: recoveredRanking.artifactDigest,
        readyProofTargetsDigest: recovered.readyProofTargets.artifactDigest,
        candidate: journal.candidate,
    };
}
async function recoverPublicationPair(projectionPath, currentnessPath, journalPath, expectedOwnerScopeDigest, expectedPromotionReceiptHeadDigest) {
    if (!(await ownerArtifactExists(journalPath)))
        return null;
    return withTaskMapNativePublicationTargetLock(projectionPath, () => recoverPublicationPairUnlocked(projectionPath, currentnessPath, journalPath, expectedOwnerScopeDigest, expectedPromotionReceiptHeadDigest));
}
async function publishTaskMapNativeProjection(projectionPath, currentnessPath, journalPath, input, dependencies = {}) {
    const candidate = verifiedNativePublicationCandidate(input.candidate, input.expectedOwnerScopeDigest);
    assertNativePublicationArtifactLimits(candidate);
    if (input.expectedOwnerScopeDigest === undefined
        || candidate.ranking === undefined) {
        throw new TaskMapNativePublicationError("loader_incompatible");
    }
    const requiredRanking = candidate.ranking;
    const projection = candidate.projection;
    if (sha256(canonicalJson(input.candidate)) !== input.candidateDigest) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    if (!/^[a-f0-9]{64}$/.test(input.graphInputDigest)
        || (candidate.contextOnlyRetirement !== undefined
            && candidate.contextOnlyRetirement.graphInputDigest
                !== input.graphInputDigest)
        || !finiteTimestamp(input.requestedAtMs)
        || (input.promotionReceiptHeadDigest !== undefined
            && !/^[a-f0-9]{64}$/.test(input.promotionReceiptHeadDigest))) {
        throw new TaskMapNativePublicationError("publication_failed");
    }
    const currentness = candidate.currentness;
    if (node_path_1.default.dirname(currentnessPath) !== node_path_1.default.dirname(projectionPath)) {
        throw new TaskMapNativePublicationError("currentness_companion_required");
    }
    const directory = node_path_1.default.dirname(projectionPath);
    const currentWorkPath = nativeCurrentWorkPath(projectionPath);
    const rankingPath = nativeTaskRankingPath(projectionPath);
    await ensurePrivateDirectory(node_path_1.default.dirname(directory));
    await ensurePrivateDirectory(directory);
    return withTaskMapNativePublicationTargetLock(projectionPath, async () => {
        const predecessor = await readOptionalNativePredecessor(projectionPath, currentnessPath, input.expectedOwnerScopeDigest);
        if (predecessor !== null
            && !isContextOnlyRetirementCandidate(candidate)) {
            const candidateTaskIds = new Set(projection.tasks.map((task) => task.id));
            const replacesAcceptedPredecessorWork = predecessor.projection.tasks.some((task) => task.reviewState === "accepted"
                && !candidateTaskIds.has(task.id));
            if (replacesAcceptedPredecessorWork
                && candidate.agentSessionEpisode === undefined) {
                throw new TaskMapNativePublicationError("predecessor_continuity_required");
            }
        }
        let candidateCurrentWork = null;
        if (!isContextOnlyRetirementCandidate(candidate)
            && (predecessor === null
                || predecessor.currentWork === null
                || predecessor.currentWork === undefined)) {
            candidateCurrentWork = initialNativeCurrentWork(projection, currentness, requiredRanking, candidate.agentSessionEpisode ?? null, candidate.agentSessionTaskProofs);
        }
        else if (!isContextOnlyRetirementCandidate(candidate)
            && predecessor?.currentWork !== null
            && predecessor?.currentWork !== undefined
            && predecessor.projection.tasks.every((task) => projection.tasks.some((candidateTask) => candidateTask.id === task.id))) {
            try {
                candidateCurrentWork = (0, native_current_work_successor_js_1.buildTaskMapNativeCurrentWorkSuccessor)(predecessor.currentWork, Buffer.from((0, source_contracts_js_1.taskMapContractCanonicalJson)(predecessor.currentWork), "utf8"), predecessor.projection, predecessor.currentness, projection, currentness, candidate.agentSessionEpisode ?? null, candidate.agentSessionTaskProofs);
            }
            catch {
                // A verified semantic reparent can keep every accepted task while
                // changing the root that owns the ranked leaf. The old current-work
                // pointer is then structurally stale even though task continuity is
                // intact; rebuild it from the verified successor graph and ranking.
                candidateCurrentWork = rebuildNativeCurrentWorkForSemanticReparent({
                    predecessorCurrentWork: predecessor.currentWork,
                    predecessorProjection: predecessor.projection,
                    projection,
                    currentness,
                    ranking: requiredRanking,
                    agentSessionEpisode: candidate.agentSessionEpisode ?? null,
                    agentSessionTaskProofs: candidate.agentSessionTaskProofs,
                });
            }
        }
        const previousCurrentness = predecessor?.rawCurrentness ?? null;
        const previousCurrentWork = predecessor?.currentWork ?? null;
        const candidateRanking = requiredRanking;
        const previousRanking = predecessor?.rawRanking ?? null;
        const candidateReadyProofTargets = successorReadyProofTargets({
            projection,
            currentness,
            predecessor: predecessor?.readyProofTargets ?? null,
            predecessorVerified: predecessor?.readyProofTargetsVerified === true,
            deriveMissing: predecessor?.generationId !== input.candidateDigest,
            currentWork: candidateCurrentWork,
        });
        const journal = {
            contractVersion: input.promotionReceiptHeadDigest === undefined
                ? TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION_V4
                : TASKMAP_NATIVE_PUBLICATION_JOURNAL_VERSION,
            graphInputDigest: input.graphInputDigest,
            candidateDigest: input.candidateDigest,
            requestedAtMs: input.requestedAtMs,
            ...(input.promotionReceiptHeadDigest === undefined
                ? {}
                : {
                    promotionReceiptHeadDigest: input.promotionReceiptHeadDigest,
                }),
            candidateProjectionDigest: taskMapProjectionDigest(projection),
            candidate: input.candidate,
            previousCurrentness,
            candidateCurrentWork,
            previousCurrentWork,
            candidateRanking,
            previousRanking,
            candidateReadyProofTargets,
        };
        if ((candidateCurrentWork !== null
            && serializedOwnerArtifactBytes(candidateCurrentWork)
                > native_current_work_successor_js_1.TASKMAP_NATIVE_CURRENT_WORK_MAX_BYTES)
            || serializedOwnerArtifactBytes(candidateReadyProofTargets)
                > MAX_FIXED_TASKMAP_ARTIFACT_BYTES
            ||
                serializedOwnerArtifactBytes(journal)
                    > MAX_TASKMAP_PUBLICATION_JOURNAL_BYTES) {
            throw new TaskMapNativePublicationError("publication_failed");
        }
        await atomicOwnerWrite(node_path_1.default.dirname(journalPath), node_path_1.default.basename(journalPath), journal);
        try {
            const installed = await installTaskMapNativeGeneration(projectionPath, currentnessPath, input, candidate, candidateCurrentWork, candidateRanking, candidateReadyProofTargets, dependencies);
            const fixed = installed.verified;
            if (taskMapProjectionDigest(fixed.projection)
                !== currentness.projectionDigest
                || (candidateCurrentWork !== null
                    && fixed.currentWork?.artifactDigest
                        !== candidateCurrentWork.artifactDigest)
                || (candidateCurrentWork === null
                    && fixed.currentWork !== null)
                || (fixed.ranking?.artifactDigest !== candidateRanking.artifactDigest)
                || fixed.readyProofTargets.artifactDigest
                    !== candidateReadyProofTargets.artifactDigest) {
                throw new TaskMapNativePublicationError("publication_failed");
            }
            return {
                projectionDigest: fixed.projectionDigest,
                candidateDigest: input.candidateDigest,
                currentnessPreserved: true,
                rankingDigest: candidateRanking.artifactDigest,
                readyProofTargetsDigest: candidateReadyProofTargets.artifactDigest,
            };
        }
        catch (error) {
            // The reference was not switched unless a complete immutable generation
            // verified. Leave the journal for restart recovery and preserve the exact
            // previously referenced generation for every concurrent reader.
            throw error;
        }
    });
}
function isStationDegradationCode(value) {
    return value === "no_provider"
        || value === "provider_unauthenticated"
        || value === "remote_consent_required"
        || value === "prompt_template_missing"
        || value === "provider_rate_limited"
        || value === "provider_timeout"
        || value === "provider_malformed_output"
        || value === "invalid_extraction_output"
        || value === "runner_failure";
}
function nativeStationDegradationCode(value) {
    if (value === "no_provider"
        || value === "provider_unauthenticated"
        || value === "remote_consent_required") {
        return value;
    }
    if (value === "provider_rate_limited")
        return "provider_rate_limited";
    if (value === "provider_timeout")
        return "provider_timeout";
    if (value === "provider_malformed_wrapper"
        || value === "provider_empty_output")
        return "provider_malformed_output";
    if (value === "invalid_extraction_output") {
        return "invalid_extraction_output";
    }
    return "runner_failure";
}
function exactSourceStatuses(statuses) {
    const bySource = new Map(statuses.map((status) => [status.source, status]));
    return owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => {
        const status = bySource.get(source);
        return {
            source,
            disposition: status?.disposition ?? "unavailable",
            ...(source === "meeting_notes"
                && isMeetingExtractionDegradationCode(status?.extractionDegradationCode)
                ? {
                    extractionDegradationCode: status.extractionDegradationCode,
                }
                : {}),
            ...((source === "agent_session" || source === "calendar")
                && isStationDegradationCode(status?.stationDegradationCode)
                && Number.isSafeInteger(status?.stationPendingCount)
                && (status?.stationPendingCount ?? 0) > 0
                ? {
                    stationDegradationCode: status.stationDegradationCode,
                    stationPendingCount: status.stationPendingCount,
                }
                : {}),
        };
    });
}
function hasRemoteConsentRequired(statuses) {
    return statuses.some((status) => status.extractionDegradationCode === "remote_consent_required"
        || status.stationDegradationCode === "remote_consent_required");
}
function reportWideMeetingExtractionDegradationCode(report) {
    if (report.notes.length === 0)
        return null;
    let shared = null;
    for (const note of report.notes) {
        if (note.status !== "degraded"
            || !isMeetingExtractionDegradationCode(note.degradationCode)) {
            return null;
        }
        if (shared === null)
            shared = note.degradationCode;
        else if (shared !== note.degradationCode)
            return null;
    }
    return shared;
}
function withMeetingExtractionDegradationCode(statuses, degradationCode) {
    return exactSourceStatuses(statuses).map((status) => {
        if (status.source !== "meeting_notes")
            return status;
        const { extractionDegradationCode: _discarded, ...withoutDegradation } = status;
        return degradationCode === null
            ? withoutDegradation
            : { ...withoutDegradation, extractionDegradationCode: degradationCode };
    });
}
function withStationExtractionStatuses(statuses, agentReport, calendarReport, agentUnavailablePendingCount = 0, calendarUnavailablePendingCount = 0, agentUnavailableDegradationCode = "runner_failure", calendarUnavailableDegradationCode = "runner_failure") {
    return exactSourceStatuses(statuses).map((status) => {
        const report = status.source === "agent_session"
            ? agentReport
            : status.source === "calendar"
                ? calendarReport
                : null;
        const rows = status.source === "agent_session"
            ? agentReport?.clusters
            : status.source === "calendar"
                ? calendarReport?.segments
                : undefined;
        const unavailablePendingCount = status.source === "agent_session"
            ? agentUnavailablePendingCount
            : status.source === "calendar"
                ? calendarUnavailablePendingCount
                : 0;
        const pendingCount = report?.pendingCount ?? unavailablePendingCount;
        if (pendingCount === 0) {
            const { stationDegradationCode: _stationCode, stationPendingCount: _stationPending, ...withoutStation } = status;
            return withoutStation;
        }
        const firstDegraded = rows?.find((row) => row.status === "degraded");
        return {
            ...status,
            stationDegradationCode: report === null
                ? (status.source === "agent_session"
                    ? agentUnavailableDegradationCode
                    : calendarUnavailableDegradationCode)
                : nativeStationDegradationCode(firstDegraded?.degradationCode ?? null),
            stationPendingCount: pendingCount,
        };
    });
}
function sourceSuccessAtMs(source, slice, fallbackAtMs) {
    if (source === "body") {
        const producedAtMs = slice.value.metadata.producedAtMs;
        if (finiteTimestamp(producedAtMs))
            return producedAtMs;
    }
    if (source === "calendar") {
        const producedAtMs = slice.value.metadata.producedAtMs;
        if (finiteTimestamp(producedAtMs))
            return producedAtMs;
    }
    if (source === "meeting_notes") {
        const granolaSuccessAtMs = slice.value.metadata.granolaSuccessAtMs;
        if (finiteTimestamp(granolaSuccessAtMs)) {
            return granolaSuccessAtMs;
        }
    }
    return fallbackAtMs;
}
function recordSourceSuccesses(state, freshSlices, requestedAtMs, meetingProducerReady) {
    for (const [source, slice] of freshSlices) {
        if (source === "meeting_notes" && !meetingProducerReady)
            continue;
        state.lastSourceSuccessAtMs[source] = sourceSuccessAtMs(source, slice, requestedAtMs);
    }
}
function sourceReceiptStatuses(statuses, lastSourceSuccessAtMs, calendarProviderStatuses, forcedUnavailableSources = new Set()) {
    const hasCurrentCalendarProvider = normalizeCalendarProviderStatuses(calendarProviderStatuses).some((provider) => provider.state === "current"
        && provider.freshness === "current");
    return exactSourceStatuses(statuses).map((status) => {
        const lastSuccessAtMs = lastSourceSuccessAtMs[status.source] ?? null;
        const effectiveDisposition = status.source === "calendar"
            && status.disposition !== "fresh"
            && !hasCurrentCalendarProvider
            ? lastSuccessAtMs === null
                ? "unavailable"
                : "retained_last_good"
            : status.disposition;
        const state = forcedUnavailableSources.has(status.source)
            ? "unavailable"
            : effectiveDisposition === "fresh"
                ? "current"
                : effectiveDisposition === "retained_last_good"
                    || lastSuccessAtMs !== null
                    ? "retained"
                    : "unavailable";
        return {
            ...status,
            disposition: effectiveDisposition,
            state,
            lastSuccessAtMs,
            nextDueAtMs: lastSuccessAtMs === null
                ? null
                : lastSuccessAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
            proof: lastSuccessAtMs === null
                ? null
                : status.source === "body"
                    ? "live_provider_read"
                    : "local_source_read",
        };
    });
}
function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function processStartMarker(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        return null;
    return new Promise((resolve) => {
        try {
            (0, node_child_process_1.execFile)("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { timeout: 1_000, maxBuffer: 4 * 1_024 }, (error, stdout) => {
                if (error !== null) {
                    resolve(null);
                    return;
                }
                const marker = stdout.trim().replace(/\s+/g, " ");
                resolve(marker.length > 0 ? marker : null);
            });
        }
        catch {
            // A restricted local runtime may deny spawning `ps`. PID liveness is
            // still checked independently; a missing start marker simply disables
            // the extra PID-reuse discriminator for this lock owner.
            resolve(null);
        }
    });
}
async function processIsAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === "EPERM";
    }
}
async function processLockOwnerIsCurrent(pid, expectedStartMarker, readStartMarker = processStartMarker) {
    if (!(await processIsAlive(pid)))
        return false;
    if (expectedStartMarker === null)
        return true;
    const actualStartMarker = await readStartMarker(pid);
    return actualStartMarker === null || actualStartMarker === expectedStartMarker;
}
function identityDedupeBarrier(input, promotionReceiptHeadDigest, strategyFallback) {
    const seen = new Set();
    const sources = input.sources.map((settled) => {
        if (settled.slice === undefined) {
            return {
                source: settled.source,
                disposition: settled.disposition,
                revision: null,
                sliceDigest: null,
                value: null,
            };
        }
        const records = settled.slice.value.records.filter((record) => {
            if (seen.has(record.identityDigest))
                return false;
            seen.add(record.identityDigest);
            return true;
        });
        return {
            source: settled.source,
            disposition: settled.disposition,
            revision: settled.slice.revision,
            sliceDigest: settled.slice.sliceDigest,
            value: {
                ...settled.slice.value,
                recordCount: records.length,
                records,
            },
        };
    });
    const graphInput = {
        contractVersion: exports.TASKMAP_NATIVE_GRAPH_INPUT_VERSION,
        promotionReceiptHeadDigest,
        ...(strategyFallback === undefined ? {} : strategyFallback),
        sources,
    };
    return {
        graphInputDigest: sha256(canonicalJson(graphInput)),
        graphInput,
    };
}
function admittedAgentSessionSemanticAdmission(graphInput) {
    const source = graphInput.sources.find((entry) => entry.source === "agent_session");
    const admission = source?.value?.semanticAdmission;
    if (source?.disposition !== "fresh" || admission === undefined) {
        return null;
    }
    (0, agent_session_semantic_admission_js_1.assertTaskMapAgentSessionSemanticAdmission)(admission);
    return admission;
}
const TASKMAP_ROOT_VISIBLE_TASK_LIMIT = 5;
const TASKMAP_ROOT_COLLAPSE_THRESHOLD = 7;
function normalizedSynthesizedRootSubject(title) {
    const synthesizedPrefix = "Workstream:";
    return (0, mention_normalization_js_1.normalizeMentionText)(title.startsWith(synthesizedPrefix)
        ? title.slice(synthesizedPrefix.length)
        : title);
}
function highestTaskCitationConfidence(task) {
    return task.citations.reduce((highest, citation) => Math.max(highest, citation.extractionConfidence), -1);
}
function compareRetainedAnchorPriority(left, right) {
    return highestTaskCitationConfidence(right)
        - highestTaskCitationConfidence(left)
        || left.id.localeCompare(right.id);
}
function taskMapRootAnchorTask(root, tasks) {
    const rootSubject = normalizedSynthesizedRootSubject(root.title);
    const structuralMatches = tasks.filter((task) => (0, mention_normalization_js_1.normalizeMentionText)(task.title) === rootSubject);
    return [...(structuralMatches.length > 0 ? structuralMatches : tasks)].sort(compareRetainedAnchorPriority)[0];
}
function taskMapLifecycleEngagement(task) {
    if (task.reviewState === "accepted")
        return 2;
    return task.whyNow.length > 0
        || task.sourceStatus !== undefined
        || task.taskHomePointerId !== undefined
        || task.returnRoute.state !== "user_destination_required"
        ? 1
        : 0;
}
function compareVisibleTaskPriority(left, right) {
    return taskMapLifecycleEngagement(right) - taskMapLifecycleEngagement(left)
        || right.score.total - left.score.total
        || highestTaskCitationConfidence(right) - highestTaskCitationConfidence(left)
        || left.id.localeCompare(right.id);
}
function boundedVisibleTaskIds(root, tasks) {
    if (tasks.length < TASKMAP_ROOT_COLLAPSE_THRESHOLD)
        return undefined;
    const anchor = taskMapRootAnchorTask(root, tasks);
    const ranked = tasks
        .filter((task) => task.id !== anchor?.id)
        .sort(compareVisibleTaskPriority);
    return [
        ...(anchor === undefined ? [] : [anchor]),
        ...ranked,
    ].slice(0, TASKMAP_ROOT_VISIBLE_TASK_LIMIT).map((task) => task.id);
}
function reconcileTaskMapProjectionMembership(projection) {
    const knownRootIds = new Set(projection.roots.map((root) => root.id));
    const tasks = projection.tasks.filter((task) => knownRootIds.has(task.rootId));
    const taskIdsByRoot = new Map();
    for (const task of tasks) {
        const taskIds = taskIdsByRoot.get(task.rootId) ?? [];
        taskIds.push(task.id);
        taskIdsByRoot.set(task.rootId, taskIds);
    }
    const roots = projection.roots.flatMap((root) => {
        const taskIds = taskIdsByRoot.get(root.id) ?? [];
        if (taskIds.length === 0)
            return [];
        const rootTasks = tasks.filter((task) => task.rootId === root.id);
        const visibleTaskIds = boundedVisibleTaskIds(root, rootTasks);
        const { visibleTaskIds: _staleVisibleTaskIds, ...rootWithoutViewHint } = root;
        return [{
                ...rootWithoutViewHint,
                taskIds,
                ...(visibleTaskIds === undefined ? {} : { visibleTaskIds }),
            }];
    });
    const retainedEntityIds = new Set([
        ...roots.map((root) => root.id),
        ...tasks.map((task) => task.id),
    ]);
    return {
        ...projection,
        roots,
        tasks,
        edges: projection.edges.filter((edge) => retainedEntityIds.has(edge.from) && retainedEntityIds.has(edge.to)),
    };
}
function finalizeTaskMapProjectionMutation(projection, failureCode) {
    const reconciled = reconcileTaskMapProjectionMembership(projection);
    if ((0, harness_js_1.taskMapProjectionArtifactValidationReasons)(reconciled).length !== 0) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError(failureCode);
    }
    return reconciled;
}
function buildAgentSessionOnlyProjection(admission, extraction, generatedAt, previousProjection, pendingWorkstreamDigests = new Set(), communityRootPlan = { roots: [] }, rootEvidence = null, taskDigestion = null) {
    (0, agent_session_semantic_admission_js_1.assertTaskMapAgentSessionSemanticAdmission)(admission);
    if (extraction.ownerScopeDigest !== admission.ownerScopeDigest
        || extraction.admissionDigest !== admission.admissionDigest) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
    }
    const clusterByIdentity = new Map(admission.clusters.map((cluster) => [
        cluster.clusterIdentityDigest,
        cluster,
    ]));
    const extractedRows = extraction.clusters.flatMap((row) => {
        const cluster = clusterByIdentity.get(row.clusterIdentityDigest);
        if (row.status !== "extracted"
            || row.mentions.length === 0
            || cluster === undefined
            || row.workstreamIdentityDigest !== cluster.workstreamIdentityDigest)
            return [];
        return [{ cluster, row }];
    });
    if (extractedRows.length === 0) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("no_eligible_work");
    }
    const evidenceMentionOccurrences = extractedRows.flatMap(({ cluster, row }) => row.mentions.map((mention) => ({ cluster, row, mention })));
    const admittedMentionOccurrences = evidenceMentionOccurrences.filter(({ mention }) => !(mention.promotionEligible === false
        && mention.speechActClass === "other"));
    if (admittedMentionOccurrences.length === 0) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("no_eligible_work");
    }
    const mentionTokens = (title) => (0, mention_normalization_js_1.normalizeMentionText)(title).match(/[a-z0-9]+/gu) ?? [];
    const tokenSubsequenceRemainder = (candidate, container) => {
        if (candidate.length === 0 || candidate.length > container.length) {
            return undefined;
        }
        let candidateIndex = 0;
        const remainder = [];
        for (const token of container) {
            if (token === candidate[candidateIndex]) {
                candidateIndex += 1;
            }
            else {
                remainder.push(token);
            }
        }
        return candidateIndex === candidate.length ? remainder : undefined;
    };
    const insignificantTokens = new Set([
        "a",
        "an",
        "and",
        "for",
        "from",
        "in",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
    ]);
    const titleSafelySubsumes = (container, candidate) => {
        if ((0, mention_normalization_js_1.normalizeMentionText)(container) === (0, mention_normalization_js_1.normalizeMentionText)(candidate)) {
            return true;
        }
        const remainder = tokenSubsequenceRemainder(mentionTokens(candidate), mentionTokens(container));
        return remainder?.every((token) => insignificantTokens.has(token))
            === true;
    };
    const titlesDescribeSameWork = (left, right) => titleSafelySubsumes(left, right)
        || titleSafelySubsumes(right, left);
    const compareMentionPriority = (left, right) => Number(right.mention.promotionEligible)
        - Number(left.mention.promotionEligible)
        || right.mention.confidence - left.mention.confidence
        || (0, source_contracts_js_1.taskMapContractDigest)({
            clusterIdentityDigest: left.cluster.clusterIdentityDigest,
            mentionIdentityDigest: left.mention.mentionIdentityDigest,
        }).localeCompare((0, source_contracts_js_1.taskMapContractDigest)({
            clusterIdentityDigest: right.cluster.clusterIdentityDigest,
            mentionIdentityDigest: right.mention.mentionIdentityDigest,
        }));
    const admittedByWorkstream = new Map();
    for (const occurrence of admittedMentionOccurrences) {
        const workstreamIdentityDigest = occurrence.cluster.workstreamIdentityDigest;
        const existing = admittedByWorkstream.get(workstreamIdentityDigest) ?? [];
        existing.push(occurrence);
        admittedByWorkstream.set(workstreamIdentityDigest, existing);
    }
    const collapsedByWorkstream = new Map();
    for (const [workstreamIdentityDigest, occurrences] of admittedByWorkstream) {
        const groups = [];
        for (const occurrence of [...occurrences].sort(compareMentionPriority)) {
            const existingIndex = groups.findIndex((group) => titlesDescribeSameWork(group.mention.title, occurrence.mention.title));
            if (existingIndex >= 0) {
                const existing = groups[existingIndex];
                if (titleSafelySubsumes(occurrence.mention.title, existing.mention.title)
                    && !titleSafelySubsumes(existing.mention.title, occurrence.mention.title)) {
                    groups[existingIndex] = {
                        ...occurrence,
                        evidenceOccurrences: [
                            ...existing.evidenceOccurrences,
                            occurrence,
                        ],
                    };
                }
                else {
                    existing.evidenceOccurrences.push(occurrence);
                }
                continue;
            }
            const group = {
                ...occurrence,
                evidenceOccurrences: [occurrence],
            };
            groups.push(group);
        }
        collapsedByWorkstream.set(workstreamIdentityDigest, groups);
    }
    for (const [workstreamIdentityDigest, groups] of collapsedByWorkstream) {
        // The current projection contract has no hidden/overflow marker. Keep the
        // full priority order visible until a schema-reviewed "+N more" affordance
        // can make every overflow item reachable without deleting its title.
        collapsedByWorkstream.set(workstreamIdentityDigest, [...groups].sort(compareMentionPriority));
    }
    const collapsedGroupByMentionIdentity = new Map();
    for (const groups of collapsedByWorkstream.values()) {
        for (const group of groups) {
            for (const occurrence of group.evidenceOccurrences) {
                collapsedGroupByMentionIdentity.set(occurrence.mention.mentionIdentityDigest, group);
            }
        }
    }
    const mentionOccurrences = [...collapsedByWorkstream.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, groups]) => groups);
    const admittedWorkstreamDigests = new Set(mentionOccurrences.map(({ cluster }) => cluster.workstreamIdentityDigest));
    const evidenceOccurrences = evidenceMentionOccurrences.filter(({ cluster }) => admittedWorkstreamDigests.has(cluster.workstreamIdentityDigest));
    const plannedRootByClusterIdentity = new Map();
    const ambiguouslyPlannedClusterIdentities = new Set();
    for (const root of communityRootPlan.roots) {
        for (const clusterIdentityDigest of root.clusterIdentityDigests) {
            if (ambiguouslyPlannedClusterIdentities.has(clusterIdentityDigest)) {
                continue;
            }
            const existing = plannedRootByClusterIdentity.get(clusterIdentityDigest);
            if (existing !== undefined
                && existing.rootProposalId !== root.rootProposalId) {
                plannedRootByClusterIdentity.delete(clusterIdentityDigest);
                ambiguouslyPlannedClusterIdentities.add(clusterIdentityDigest);
                continue;
            }
            plannedRootByClusterIdentity.set(clusterIdentityDigest, {
                rootProposalId: root.rootProposalId,
                title: root.title,
            });
        }
    }
    const clusterIdentity = (cluster, mentionIdentityDigest) => {
        const occurrenceDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            clusterIdentityDigest: cluster.clusterIdentityDigest,
            mentionIdentityDigest,
        });
        const plannedRoot = plannedRootByClusterIdentity.get(cluster.clusterIdentityDigest);
        return {
            rootProposalId: plannedRoot?.rootProposalId
                ?? "agent-root-proposal-" + cluster.workstreamIdentityDigest.slice(0, 16),
            taskProposalId: "agent-task-proposal-" + occurrenceDigest.slice(0, 16),
            edgeProposalId: "agent-edge-proposal-" + occurrenceDigest.slice(0, 16),
            workstreamRef: "workstream:" + cluster.workstreamIdentityDigest,
            workItemRef: "work-item:" + occurrenceDigest,
            proposalSummary: (0, text_contract_js_1.boundedUtf16)(cluster.assistantOutcomeSummary ?? cluster.userDirectiveSummary, 200),
        };
    };
    const supportIdentity = (support, mentionIdentityDigest) => ({
        // One pointer per session episode: the pointer's identity must match its
        // sourceRefHash (support.episodeIdentityDigest). Mixing the mention in here
        // produced several pointers sharing one sourceKind:sourceRefHash, which the
        // harness rejects as a duplicate source identity.
        pointerId: "agent-support-" + (0, source_contracts_js_1.taskMapContractDigest)({
            episodeIdentityDigest: support.episodeIdentityDigest,
        }).slice(0, 16),
        // Events stay one per (support x mention) and hang off the shared pointer;
        // the harness forbids duplicate event ids, not event reuse of a pointerId.
        eventId: "agent-event-" + (0, source_contracts_js_1.taskMapContractDigest)({
            supportIdentityDigest: support.supportIdentityDigest,
            mentionIdentityDigest,
        }).slice(0, 16),
        rootPointerId: "agent-root-" + support.supportIdentityDigest.slice(0, 16),
        rootEventId: "agent-root-event-" + support.supportIdentityDigest.slice(0, 16),
        episodeRef: "episode:" + support.episodeIdentityDigest,
        sourceKind: support.provider === "codex"
            ? "codex_session"
            : "claude_session",
    });
    const workstreamMentions = new Map();
    for (const occurrence of mentionOccurrences) {
        const existing = workstreamMentions.get(occurrence.cluster.workstreamIdentityDigest) ?? [];
        existing.push(occurrence);
        workstreamMentions.set(occurrence.cluster.workstreamIdentityDigest, existing);
    }
    const representativeMention = (workstreamIdentityDigest) => {
        const mentions = workstreamMentions.get(workstreamIdentityDigest) ?? [];
        const preferred = mentions.filter(({ mention }) => mention.promotionEligible);
        return [...(preferred.length > 0 ? preferred : mentions)].sort((left, right) => right.mention.confidence - left.mention.confidence
            || left.mention.mentionIdentityDigest.localeCompare(right.mention.mentionIdentityDigest))[0].mention;
    };
    const synthesizedRootTitle = (childTitles, fallbackTitle) => {
        const firstTokens = childTitles[0]?.match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? [];
        const normalizedTokenRows = childTitles.map(mentionTokens);
        let sharedPhrase;
        for (let length = firstTokens.length; length >= 2; length -= 1) {
            for (let start = 0; start + length <= firstTokens.length; start += 1) {
                const phraseTokens = firstTokens.slice(start, start + length);
                const normalizedPhrase = phraseTokens.map((token) => (0, mention_normalization_js_1.normalizeMentionText)(token));
                if (normalizedPhrase.every((token) => insignificantTokens.has(token)))
                    continue;
                const appearsInEveryTitle = normalizedTokenRows.slice(1).every((tokens) => {
                    for (let index = 0; index + normalizedPhrase.length <= tokens.length; index += 1) {
                        if (normalizedPhrase.every((token, offset) => tokens[index + offset] === token))
                            return true;
                    }
                    return false;
                });
                if (appearsInEveryTitle) {
                    sharedPhrase = phraseTokens.join(" ");
                    break;
                }
            }
            if (sharedPhrase !== undefined)
                break;
        }
        const candidate = sharedPhrase
            ?? fallbackTitle;
        const normalizedChildren = new Set(childTitles.map(mention_normalization_js_1.normalizeMentionText));
        const synthesized = normalizedChildren.has((0, mention_normalization_js_1.normalizeMentionText)(candidate))
            ? `Workstream: ${candidate}`
            : candidate;
        return (0, text_contract_js_1.boundedUtf16)(synthesized, 96);
    };
    const rootTitleForWorkstream = (workstreamIdentityDigest) => {
        const mentions = workstreamMentions.get(workstreamIdentityDigest) ?? [];
        return synthesizedRootTitle(mentions.map(({ mention }) => mention.title), representativeMention(workstreamIdentityDigest).title);
    };
    const rootTitleForCluster = (cluster) => plannedRootByClusterIdentity.get(cluster.clusterIdentityDigest)?.title ?? rootTitleForWorkstream(cluster.workstreamIdentityDigest);
    const rootPointerRows = new Map();
    const taskPointerRows = new Map();
    for (const occurrence of evidenceOccurrences) {
        for (const support of occurrence.cluster.supports) {
            const supportIds = supportIdentity(support, occurrence.mention.mentionIdentityDigest);
            const rootIds = supportIdentity(support);
            rootPointerRows.set(rootIds.rootPointerId, {
                id: rootIds.rootPointerId,
                sourceKind: rootIds.sourceKind,
                sourceObjectId: `session:${support.rootSessionIdentityDigest}`,
                sourceRefHash: support.rootSessionIdentityDigest,
                sourceVersion: support.supportIdentityDigest,
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            });
            // Episode-scoped: sourceObjectId must describe the same object the
            // pointer's sourceRefHash identifies, so several mentions supported by
            // one episode collapse onto a single pointer row.
            taskPointerRows.set(supportIds.pointerId, {
                id: supportIds.pointerId,
                sourceKind: supportIds.sourceKind,
                sourceObjectId: `episode:${support.episodeIdentityDigest}`,
                sourceRefHash: support.episodeIdentityDigest,
                sourceVersion: support.supportIdentityDigest,
                authority: "none",
                syncMode: "reference_only",
                capabilities: ["read_context"],
            });
        }
    }
    const pointers = [
        ...rootPointerRows.values(),
        ...taskPointerRows.values(),
    ];
    const rootEventRows = new Map();
    const taskEvents = evidenceOccurrences.flatMap(({ cluster, mention }) => {
        const collapsedGroup = collapsedGroupByMentionIdentity.get(mention.mentionIdentityDigest);
        const taskOccurrence = collapsedGroup ?? { cluster, mention };
        const ids = clusterIdentity(taskOccurrence.cluster, taskOccurrence.mention.mentionIdentityDigest);
        const rootTitle = rootTitleForCluster(cluster);
        return cluster.supports.map((support) => {
            const supportIds = supportIdentity(support, mention.mentionIdentityDigest);
            const rootIds = supportIdentity(support);
            rootEventRows.set(rootIds.rootEventId, {
                id: rootIds.rootEventId,
                pointerId: rootIds.rootPointerId,
                recordKind: "work_context",
                activity: "context_observed",
                occurredAt: support.occurredAt,
                observedAt: support.observedAt,
                objectRefs: [ids.workstreamRef, rootIds.episodeRef],
                title: rootTitle,
                summary: "A local agent session observed this workstream.",
                extractionConfidence: mention.confidence,
            });
            return {
                id: supportIds.eventId,
                pointerId: supportIds.pointerId,
                recordKind: "work_context",
                activity: collapsedGroup === undefined
                    ? "context_observed"
                    : "commitment_stated",
                occurredAt: support.occurredAt,
                observedAt: support.observedAt,
                objectRefs: collapsedGroup === undefined
                    ? [ids.workstreamRef, supportIds.episodeRef]
                    : [
                        ids.workstreamRef,
                        ids.workItemRef,
                        supportIds.episodeRef,
                    ],
                title: (0, text_contract_js_1.boundedUtf16)(mention.title, 96),
                summary: ids.proposalSummary,
                extractionConfidence: mention.confidence,
            };
        });
    });
    const events = [
        ...rootEventRows.values(),
        ...taskEvents,
    ];
    let input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        generatedAt,
        pointers,
        events,
    };
    const rootGroups = new Map();
    for (const { cluster, mention } of mentionOccurrences) {
        const identity = clusterIdentity(cluster, mention.mentionIdentityDigest);
        const current = rootGroups.get(identity.rootProposalId) ?? {
            title: rootTitleForCluster(cluster),
            clusterIdentityDigests: new Set(),
            workstreamIdentityDigests: new Set(),
        };
        current.clusterIdentityDigests.add(cluster.clusterIdentityDigest);
        current.workstreamIdentityDigests.add(cluster.workstreamIdentityDigest);
        rootGroups.set(identity.rootProposalId, current);
    }
    const representativeEnvelope = [...extractedRows].sort((left, right) => left.row.inputDigest.localeCompare(right.row.inputDigest))[0].row;
    let brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: representativeEnvelope.envelopeTransport,
        model: representativeEnvelope.envelopeModel,
        promptHash: extraction.promptTemplateDigest,
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
        generatedAt,
        roots: [...rootGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([rootProposalId, group]) => {
            const clusters = admission.clusters.filter((cluster) => group.clusterIdentityDigests.has(cluster.clusterIdentityDigest));
            const representative = mentionOccurrences.filter(({ cluster }) => group.clusterIdentityDigests.has(cluster.clusterIdentityDigest)).map(({ mention }) => mention).sort((left, right) => right.confidence - left.confidence
                || left.mentionIdentityDigest.localeCompare(right.mentionIdentityDigest))[0];
            return {
                proposalId: rootProposalId,
                title: group.title,
                summary: "Review-only proposals observed in this local workstream.",
                evidenceEventIds: [...new Set(clusters.flatMap((cluster) => evidenceOccurrences.filter(({ cluster: candidate }) => candidate.clusterIdentityDigest === cluster.clusterIdentityDigest).flatMap(({ mention }) => cluster.supports.flatMap((support) => {
                        const rootIds = supportIdentity(support);
                        const supportIds = supportIdentity(support, mention.mentionIdentityDigest);
                        return [rootIds.rootEventId, supportIds.eventId];
                    }))))].sort(),
                memberObjectRefs: [...group.workstreamIdentityDigests].sort().map((digest) => `workstream:${digest}`),
                confidence: representative.confidence,
            };
        }),
        tasks: mentionOccurrences.map(({ cluster, mention, evidenceOccurrences, }) => {
            const ids = clusterIdentity(cluster, mention.mentionIdentityDigest);
            return {
                proposalId: ids.taskProposalId,
                rootProposalId: ids.rootProposalId,
                title: (0, text_contract_js_1.boundedUtf16)(mention.title, 96),
                summary: ids.proposalSummary,
                evidenceEventIds: evidenceOccurrences.flatMap((occurrence) => occurrence.cluster.supports.map((support) => supportIdentity(support, occurrence.mention.mentionIdentityDigest).eventId)).sort(),
                openState: "possibly_open",
                confidence: mention.confidence,
            };
        }),
        edges: mentionOccurrences.map(({ cluster, mention, evidenceOccurrences, }) => {
            const ids = clusterIdentity(cluster, mention.mentionIdentityDigest);
            return {
                proposalId: ids.edgeProposalId,
                fromProposalId: ids.rootProposalId,
                toProposalId: ids.taskProposalId,
                relation: "advances",
                evidenceEventIds: evidenceOccurrences.flatMap((occurrence) => occurrence.cluster.supports.map((support) => supportIdentity(support, occurrence.mention.mentionIdentityDigest).eventId)).sort(),
                confidence: mention.confidence,
            };
        }),
    };
    const plan2RootProposalIds = new Set([
        ...communityRootPlan.roots.map((root) => root.rootProposalId),
        ...(rootEvidence?.rootProposals.map((root) => root.proposalId) ?? []),
    ]);
    if (plan2RootProposalIds.size > 0) {
        const mergeRowsById = (historical, current) => {
            const merged = new Map();
            for (const row of [...historical, ...current]) {
                const previous = merged.get(row.id);
                if (previous !== undefined
                    && canonicalJson(previous) !== canonicalJson(row)) {
                    throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
                }
                merged.set(row.id, structuredClone(row));
            }
            return [...merged.values()].sort((left, right) => compareCodePoint(left.id, right.id));
        };
        if (rootEvidence !== null) {
            input = {
                contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
                generatedAt,
                pointers: mergeRowsById(rootEvidence.taskMapInput.pointers, input.pointers),
                events: mergeRowsById(rootEvidence.taskMapInput.events, input.events),
            };
        }
        const currentPlan2Tasks = [...plan2RootProposalIds].flatMap((rootProposalId) => brain.tasks
            .filter((task) => task.rootProposalId === rootProposalId)
            .sort((left, right) => compareCodePoint(left.proposalId, right.proposalId))
            .slice(0, community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot));
        const currentPlan2TaskIds = new Set(currentPlan2Tasks.map((task) => task.proposalId));
        const currentPlan2Edges = brain.edges.filter((edge) => plan2RootProposalIds.has(edge.fromProposalId)
            && currentPlan2TaskIds.has(edge.toProposalId));
        const roots = new Map((rootEvidence?.rootProposals ?? []).map((root) => [
            root.proposalId,
            structuredClone(root),
        ]));
        for (const currentRoot of brain.roots.filter((root) => plan2RootProposalIds.has(root.proposalId))) {
            const historicalRoot = roots.get(currentRoot.proposalId);
            roots.set(currentRoot.proposalId, historicalRoot === undefined
                ? structuredClone(currentRoot)
                : {
                    ...structuredClone(currentRoot),
                    title: historicalRoot.title,
                    evidenceEventIds: [...new Set([
                            ...historicalRoot.evidenceEventIds,
                            ...currentRoot.evidenceEventIds,
                        ])].sort(),
                    memberObjectRefs: [...new Set([
                            ...historicalRoot.memberObjectRefs,
                            ...currentRoot.memberObjectRefs,
                        ])].sort(),
                    confidence: Math.max(historicalRoot.confidence, currentRoot.confidence),
                });
        }
        const digestionRowsByRoot = new Map((taskDigestion?.roots ?? []).map((row) => [row.rootProposalId, row]));
        const currentTaskIdentitiesByRoot = new Map();
        for (const task of currentPlan2Tasks) {
            const identities = currentTaskIdentitiesByRoot.get(task.rootProposalId)
                ?? new Set();
            identities.add((0, community_task_digestion_js_1.taskMapCommunityTaskIdentityDigest)(task.title));
            currentTaskIdentitiesByRoot.set(task.rootProposalId, identities);
        }
        // One review leaf per unique actionable mention (<=5/root), deduped
        // against current Plan2 tasks by normalized-title identity so current
        // work wins. Evidence identity never mints tasks, and an undigested
        // root gets no placeholder.
        const digestedLeafRows = [...roots.keys()].flatMap((rootProposalId) => {
            const digestionRow = digestionRowsByRoot.get(rootProposalId);
            if (digestionRow === undefined)
                return [];
            const currentIdentities = currentTaskIdentitiesByRoot.get(rootProposalId)
                ?? new Set();
            const remainingSlots = Math.max(0, community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot
                - (currentPlan2Tasks.filter((task) => task.rootProposalId === rootProposalId).length));
            return digestionRow.tasks.filter((task) => !currentIdentities.has(task.taskIdentityDigest)).slice(0, remainingSlots).map((task) => ({
                task: {
                    proposalId: task.taskProposalId,
                    rootProposalId,
                    title: task.title,
                    summary: task.summary,
                    evidenceEventIds: [...task.evidenceEventIds],
                    openState: "possibly_open",
                    confidence: task.confidence,
                },
                edge: {
                    proposalId: `community-task-edge-${(0, source_contracts_js_1.taskMapContractDigest)({
                        domain: "taskmap-community-task-edge.1",
                        rootProposalId,
                        taskProposalId: task.taskProposalId,
                    }).slice(0, 16)}`,
                    fromProposalId: rootProposalId,
                    toProposalId: task.taskProposalId,
                    relation: "advances",
                    evidenceEventIds: [...task.evidenceEventIds],
                    confidence: task.confidence,
                },
            }));
        });
        const mergedTasks = [
            ...currentPlan2Tasks,
            ...digestedLeafRows.map((row) => row.task),
        ].sort((left, right) => compareCodePoint(left.proposalId, right.proposalId));
        // A theme that yields no task is not a legitimate root: drop the root
        // outright instead of emitting a placeholder or an empty card.
        const taskCountByRoot = new Map();
        for (const task of mergedTasks) {
            taskCountByRoot.set(task.rootProposalId, (taskCountByRoot.get(task.rootProposalId) ?? 0) + 1);
        }
        for (const rootProposalId of [...roots.keys()]) {
            if ((taskCountByRoot.get(rootProposalId) ?? 0) === 0) {
                roots.delete(rootProposalId);
            }
        }
        // The root summary previews the work plan (its tasks' imperative
        // titles), never stitched transcript fragments.
        for (const [rootProposalId, root] of roots) {
            const titles = mergedTasks.filter((task) => task.rootProposalId === rootProposalId).map((task) => task.title);
            if (titles.length > 0) {
                root.summary = (0, text_contract_js_1.boundedUtf16)(titles.join("; "), 200);
            }
        }
        brain = {
            ...brain,
            promptHash: (0, source_contracts_js_1.taskMapContractDigest)({
                currentPromptHash: brain.promptHash,
                communityRootEvidenceDigest: rootEvidence === null
                    ? null
                    : (0, source_contracts_js_1.taskMapContractDigest)(rootEvidence),
                communityTaskDigestionDigest: taskDigestion?.digestionDigest ?? null,
                plan2RootProposalIds: [...plan2RootProposalIds].sort(compareCodePoint),
            }),
            inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
            roots: [...roots.values()].sort((left, right) => compareCodePoint(left.proposalId, right.proposalId)),
            tasks: mergedTasks,
            edges: [
                ...currentPlan2Edges,
                ...digestedLeafRows.map((row) => row.edge),
            ].sort((left, right) => compareCodePoint(left.proposalId, right.proposalId)),
        };
        if ((rootEvidence?.rootProposals.length ?? 0) > 0
            && (brain.roots.length === 0 || brain.tasks.length === 0)) {
            // Degradation is not itself tasklessness: extracted mention tasks may
            // still form a useful deterministic Roadmap. Fail closed only when the
            // resulting graph is actually empty.
            throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
        }
    }
    let projection = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
        arm: "E4",
        now: generatedAt,
        ...(previousProjection === undefined ? {} : { previousProjection }),
    });
    if (projection.runStatus !== "accepted"
        || projection.roots.length !== brain.roots.length
        || projection.tasks.length !== brain.tasks.length
        || projection.edges.length !== brain.edges.length
        || projection.tasks.some((task) => task.reviewState !== "proposed" || task.authority !== "none")
        || projection.rejections.length !== 0
        || (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection).length !== 0) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
    }
    if (previousProjection !== undefined && pendingWorkstreamDigests.size > 0) {
        const pendingRefs = new Set([...pendingWorkstreamDigests].map((digest) => `workstream:${digest}`));
        const retainedRoots = previousProjection.roots.filter((root) => root.memberObjectRefs.some((ref) => pendingRefs.has(ref)));
        const retainedRootIds = new Set(retainedRoots.map((root) => root.id));
        const retainedTasks = previousProjection.tasks.filter((task) => retainedRootIds.has(task.rootId));
        const retainedTaskIdsBeforeNormalization = new Set(retainedTasks.map((task) => task.id));
        const retainedEntityIdsBeforeNormalization = new Set([
            ...retainedRootIds,
            ...retainedTaskIdsBeforeNormalization,
        ]);
        const retainedEdgesBeforeNormalization = previousProjection.edges.filter((edge) => retainedEntityIdsBeforeNormalization.has(edge.from)
            && retainedEntityIdsBeforeNormalization.has(edge.to));
        const retainedPointerIds = new Set([
            ...retainedRoots.flatMap((root) => root.citations.map((citation) => citation.pointerId)),
            ...retainedTasks.flatMap((task) => [
                ...task.originPointerIds,
                ...task.citations.map((citation) => citation.pointerId),
            ]),
            ...retainedEdgesBeforeNormalization.flatMap((edge) => edge.citations.map((citation) => citation.pointerId)),
        ]);
        // Predecessor rows bypassed fresh D1/D2. Normalize only confidently
        // classified bare proposals before merging, while retaining their source
        // evidence and every row with lifecycle engagement.
        const imperativeTitleHeads = new Set([
            "add",
            "audit",
            "build",
            "create",
            "deploy",
            "design",
            "document",
            "extract",
            "fix",
            "implement",
            "investigate",
            "migrate",
            "prepare",
            "publish",
            "rename",
            "schedule",
            "ship",
            "strengthen",
            "update",
            "validate",
            "verify",
            "write",
        ]);
        const verificationStatusHeads = new Set([
            "all",
            "changes",
            "frontend",
            "full",
            "no",
            "openapi",
        ]);
        const retainedTitleShape = (title) => {
            const head = mentionTokens(title)[0];
            if (head === undefined)
                return "unknown";
            if (imperativeTitleHeads.has(head))
                return "imperative";
            if (verificationStatusHeads.has(head))
                return "status";
            return "unknown";
        };
        const isBareProposedVerificationStatus = (task) => task.reviewState === "proposed"
            && task.authority === "none"
            && task.sourceStatus === undefined
            && task.taskHomePointerId === undefined
            && task.returnRoute.state === "user_destination_required"
            && retainedTitleShape(task.title) === "status";
        const normalizedRetainedTasks = retainedRoots.flatMap((root) => {
            const rootTasks = retainedTasks.filter((task) => task.rootId === root.id);
            const surviving = rootTasks.filter((task) => !isBareProposedVerificationStatus(task));
            if (surviving.length > 0)
                return surviving;
            const anchor = taskMapRootAnchorTask(root, rootTasks);
            return anchor === undefined ? [] : [anchor];
        });
        const normalizedRetainedTaskIds = new Set(normalizedRetainedTasks.map((task) => task.id));
        const normalizedRetainedRoots = retainedRoots.map((root) => {
            const childTasks = normalizedRetainedTasks.filter((task) => task.rootId === root.id);
            return {
                ...root,
                title: synthesizedRootTitle(childTasks.map((task) => task.title), childTasks[0]?.title ?? root.title),
            };
        });
        const normalizedRetainedEntityIds = new Set([
            ...retainedRootIds,
            ...normalizedRetainedTaskIds,
        ]);
        const normalizedRetainedEdges = retainedEdgesBeforeNormalization.filter((edge) => normalizedRetainedEntityIds.has(edge.from)
            && normalizedRetainedEntityIds.has(edge.to));
        const mergeById = (current, retained) => [...new Map([...retained, ...current].map((row) => [row.id, structuredClone(row)])).values()].sort((left, right) => left.id.localeCompare(right.id));
        const retainedSources = previousProjection.sources.filter((source) => retainedPointerIds.has(source.id));
        const mergedTasks = mergeById(projection.tasks, normalizedRetainedTasks);
        const mergeRootsById = (current, retained) => {
            const merged = new Map(retained.map((root) => [
                root.id,
                structuredClone(root),
            ]));
            for (const root of current) {
                const prior = merged.get(root.id);
                if (prior === undefined) {
                    merged.set(root.id, structuredClone(root));
                    continue;
                }
                const citations = new Map([
                    ...prior.citations,
                    ...root.citations,
                ].map((citation) => [
                    canonicalJson(citation),
                    structuredClone(citation),
                ]));
                merged.set(root.id, {
                    ...structuredClone(root),
                    memberObjectRefs: [...new Set([
                            ...prior.memberObjectRefs,
                            ...root.memberObjectRefs,
                        ])].sort(),
                    citations: [...citations.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, citation]) => citation),
                });
            }
            return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
        };
        projection = {
            ...projection,
            runId: `tmrun_${(0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-agent-pending-workstream-retention.1",
                currentRunId: projection.runId,
                predecessorRunId: previousProjection.runId,
                pendingWorkstreamDigests: [...pendingWorkstreamDigests].sort(),
            }).slice(0, 16)}`,
            inputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                currentInputDigest: projection.inputDigest,
                predecessorInputDigest: previousProjection.inputDigest,
                pendingWorkstreamDigests: [...pendingWorkstreamDigests].sort(),
            }),
            sources: mergeById(projection.sources, retainedSources),
            roots: mergeRootsById(projection.roots, normalizedRetainedRoots),
            tasks: mergedTasks,
            edges: mergeById(projection.edges, normalizedRetainedEdges),
        };
    }
    return finalizeTaskMapProjectionMutation(projection, previousProjection !== undefined && pendingWorkstreamDigests.size > 0
        ? "invalid_predecessor"
        : "harness_rejected");
}
function preservedPredecessorPublicationCandidate(predecessor) {
    if (predecessor.ranking === null) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection: structuredClone(predecessor.projection),
        currentness: structuredClone(predecessor.currentness),
        ranking: structuredClone(predecessor.ranking),
    };
}
function isReplaceableAgentProposal(predecessor) {
    if (predecessor === null)
        return false;
    if (predecessor.projection.tasks.length === 0) {
        return predecessor.projection.roots.length === 0
            && predecessor.projection.edges.length === 0;
    }
    return predecessor.projection.tasks.length > 0
        && predecessor.projection.tasks.every((task) => task.reviewState === "proposed" && task.authority === "none")
        && predecessor.projection.sources.length > 0
        && predecessor.projection.sources.every((source) => source.sourceKind === "codex_session"
            || source.sourceKind === "claude_session");
}
/**
 * True when the predecessor projection carries Plan2 community roots. Only
 * such a predecessor is preserved across a degraded Plan2 layer; a legacy
 * deployment without any community station keeps its replace semantics.
 */
function predecessorHasCommunityRoots(predecessor) {
    return predecessor.projection.roots.some((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")));
}
/**
 * Extract only the proposal-only Agent community component from a verified
 * mixed-source projection. This lets a degraded Agent refresh retain semantic
 * work without reviving stale Meeting or Calendar roots.
 */
function agentCommunitySubtreeOf(projection) {
    const roots = projection.roots.filter((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:"))).map((root) => structuredClone(root));
    if (roots.length === 0)
        return null;
    const rootIds = new Set(roots.map((root) => root.id));
    const tasks = projection.tasks.filter((task) => rootIds.has(task.rootId))
        .map((task) => structuredClone(task));
    if (tasks.length === 0
        || tasks.some((task) => task.reviewState !== "proposed" || task.authority !== "none"))
        return null;
    const entityIds = new Set([
        ...rootIds,
        ...tasks.map((task) => task.id),
    ]);
    const edges = projection.edges.filter((edge) => entityIds.has(edge.from) && entityIds.has(edge.to)).map((edge) => structuredClone(edge));
    const pointerIds = new Set();
    for (const root of roots) {
        for (const citation of root.citations)
            pointerIds.add(citation.pointerId);
    }
    for (const task of tasks) {
        if (task.taskHomePointerId !== undefined) {
            pointerIds.add(task.taskHomePointerId);
        }
        for (const pointerId of task.originPointerIds)
            pointerIds.add(pointerId);
        if ("pointerId" in task.returnRoute) {
            pointerIds.add(task.returnRoute.pointerId);
        }
        for (const citation of task.citations)
            pointerIds.add(citation.pointerId);
    }
    for (const edge of edges) {
        for (const citation of edge.citations)
            pointerIds.add(citation.pointerId);
    }
    const sources = projection.sources.filter((source) => pointerIds.has(source.id))
        .map((source) => structuredClone(source));
    if (sources.length !== pointerIds.size
        || sources.some((source) => source.sourceKind !== "codex_session"
            && source.sourceKind !== "claude_session"))
        return null;
    const componentBinding = {
        domain: "taskmap-agent-community-subtree.v1",
        predecessorProjectionDigest: taskMapProjectionDigest(projection),
        sourceIds: sources.map((source) => source.id).sort(compareCodePoint),
        rootIds: [...rootIds].sort(compareCodePoint),
        taskIds: tasks.map((task) => task.id).sort(compareCodePoint),
        edgeIds: edges.map((edge) => edge.id).sort(compareCodePoint),
    };
    const componentDigest = (0, source_contracts_js_1.taskMapContractDigest)(componentBinding);
    try {
        return finalizeTaskMapProjectionMutation({
            ...structuredClone(projection),
            runId: `tmrun_${componentDigest.slice(0, 16)}`,
            inputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                ...componentBinding,
                purpose: "projection-input",
            }),
            brain: {
                provider: "taskmap-agent-community-subtree",
                model: "deterministic-extraction-v1",
                promptHash: (0, source_contracts_js_1.taskMapContractDigest)("taskmap-agent-community-subtree.prompt.v1"),
                outputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    ...componentBinding,
                    purpose: "semantic-output",
                }),
            },
            sources,
            roots,
            tasks,
            edges,
            rejections: [],
        }, "invalid_predecessor");
    }
    catch {
        return null;
    }
}
/**
 * Reconstruct the published community membership identity that Plan2 needs
 * for cross-generation root reuse. Projection citations contain only local,
 * opaque episode digests; the current feed maps those digests back to the
 * graph node IDs consumed by the Hungarian/Jaccard reuse harness.
 */
function previousAcceptedCommunityRootsFromProjection(projection, feed) {
    if (projection === null || feed === null || projection.runStatus !== "accepted") {
        return [];
    }
    const nodeByEpisodeIdentity = new Map(feed.episodes.map((episode) => [
        episode.episodeIdentityDigest,
        episode.graphEpisodeId,
    ]));
    const tasksByRoot = new Map();
    for (const task of projection.tasks) {
        const tasks = tasksByRoot.get(task.rootId) ?? [];
        tasks.push(task);
        tasksByRoot.set(task.rootId, tasks);
    }
    const roots = [...projection.roots]
        .filter((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")))
        .sort((left, right) => compareCodePoint(left.id, right.id));
    const result = [];
    let aggregateMembers = 0;
    for (const root of roots) {
        if (result.length
            >= community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots)
            break;
        const episodeIdentities = new Set();
        for (const ref of root.memberObjectRefs) {
            if (ref.startsWith("episode:")) {
                episodeIdentities.add(ref.slice("episode:".length));
            }
        }
        for (const citation of root.citations) {
            episodeIdentities.add(citation.sourceRefHash);
        }
        for (const task of tasksByRoot.get(root.id) ?? []) {
            for (const citation of task.citations) {
                episodeIdentities.add(citation.sourceRefHash);
            }
        }
        const persistedMemberNodeIds = root.memberObjectRefs
            .filter((ref) => ref.startsWith("community:member:"))
            .map((ref) => ref.slice("community:member:".length))
            .filter((value) => value.length > 0);
        const memberNodeIds = [...new Set(persistedMemberNodeIds.length > 0
                ? persistedMemberNodeIds
                : [...episodeIdentities]
                    .map((identity) => nodeByEpisodeIdentity.get(identity))
                    .filter((nodeId) => nodeId !== undefined))].sort(compareCodePoint);
        if (memberNodeIds.length === 0
            || memberNodeIds.length
                > community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxMembersPerPreviousRoot
            || aggregateMembers + memberNodeIds.length
                > community_root_proposals_js_1.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousMembersTotal)
            continue;
        const persistedRootProposalIds = [...new Set(root.memberObjectRefs
                .filter((ref) => ref.startsWith("community:root:"))
                .map((ref) => ref.slice("community:root:".length))
                .filter((value) => value.length > 0))];
        if (persistedRootProposalIds.length > 1)
            continue;
        result.push({
            rootProposalId: persistedRootProposalIds[0] ?? root.id,
            memberNodeIds,
        });
        aggregateMembers += memberNodeIds.length;
    }
    return result;
}
function agentSessionPublicationCandidate(admission, extraction, generatedAt, predecessor, ownerScopeDigest, graphInput, agentPlan) {
    // Fresh Agent Sessions can bootstrap an empty owner or replace an older
    // Agent-only proposal. They must not erase accepted or non-Agent work while
    // Meeting Notes are temporarily unavailable or empty.
    const predecessorIsReplaceableAgentProposal = isReplaceableAgentProposal(predecessor);
    if (predecessor !== null && !predecessorIsReplaceableAgentProposal) {
        return preservedPredecessorPublicationCandidate(predecessor);
    }
    // A degraded Plan2 layer is not evidence that an already-published semantic
    // tree vanished. Preserve only a real community predecessor: a plain legacy
    // proposal remains replaceable by the latest admitted directive. On first
    // run, extracted clusters still provide deterministic Topic -> Task
    // structure; the projection builder below rejects an actually empty graph.
    if (agentPlan.plan2Unavailable
        && predecessor !== null
        && predecessor.projection.tasks.length > 0
        && predecessorHasCommunityRoots(predecessor)) {
        return preservedPredecessorPublicationCandidate(predecessor);
    }
    const projection = buildAgentSessionOnlyProjection(admission, extraction, generatedAt, predecessor?.projection, new Set(extraction.clusters.filter((row) => row.status === "degraded").map((row) => row.workstreamIdentityDigest)), agentPlan.currentRootPlan, agentPlan.rootEvidence, agentPlan.taskDigestion);
    const ranking = rankingForNativeGraphInput(projection, ownerScopeDigest, graphInput);
    const currentness = currentnessForNativeProjection(projection, null);
    if (ranking.rankedAcceptedOpen.length !== 0
        || currentness.taskDispositions.some((row) => row.disposition !== "needs_lifecycle_review")) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection,
        currentness,
        ranking,
    };
}
function acceptedAgentSessionTaskProofs(admission, extraction, acceptanceStore, projection, ranking) {
    if (admission === null || extraction === null || acceptanceStore === null) {
        return [];
    }
    const rows = ranking.rankedAcceptedOpen.flatMap((ranked) => {
        const task = projection.tasks.find((candidate) => candidate.id === ranked.taskId);
        if (task?.taskHomePointerId === undefined)
            return [];
        const receipts = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === task.taskHomePointerId);
        if (receipts.length !== 1)
            return [];
        const receipt = receipts[0];
        const matches = extraction.clusters.flatMap((extractedCluster) => {
            if (extractedCluster.status !== "extracted"
                || extractedCluster.envelopeDigest === null)
                return [];
            const envelopeDigest = extractedCluster.envelopeDigest;
            const cluster = admission.clusters.find((candidate) => candidate.clusterIdentityDigest === extractedCluster.clusterIdentityDigest);
            if (cluster === undefined)
                return [];
            return extractedCluster.mentions.flatMap((mention) => {
                const statementReferenceDigest = (0, native_candidate_review_js_1.taskMapAgentSessionCandidateStatementReferenceDigest)(admission.ownerScopeDigest, cluster.clusterIdentityDigest, mention.mentionIdentityDigest);
                return (0, native_candidate_review_js_1.taskMapNativeCandidateId)(admission.ownerScopeDigest, statementReferenceDigest) === receipt.candidateId
                    ? [{ cluster, mention, envelopeDigest }]
                    : [];
            });
        });
        if (matches.length !== 1 || matches[0].cluster.supports.length === 0) {
            return [];
        }
        const { cluster, mention, envelopeDigest } = matches[0];
        const supportProofs = cluster.supports.map((support) => ({
            support,
            proofDigest: (0, agent_session_candidate_adapter_js_1.taskMapAgentSessionCandidateEvidenceProofDigest)(admission.ownerScopeDigest, cluster, support, mention.mentionIdentityDigest, envelopeDigest),
        }));
        const evidenceProofDigests = [...new Set(supportProofs.map((row) => row.proofDigest))].sort();
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(evidenceProofDigests)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt.evidenceProofDigests)
            || receipt.candidateRevisionDigest !== (0, native_candidate_review_js_1.taskMapNativeCandidateRevisionDigest)(receipt.candidateId, evidenceProofDigests))
            return [];
        const selected = [...supportProofs].sort((left, right) => left.support.supportIdentityDigest.localeCompare(right.support.supportIdentityDigest)
            || left.support.episodeIdentityDigest.localeCompare(right.support.episodeIdentityDigest))[0];
        const support = selected.support;
        const episode = (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionEpisodeAdmission)({
            admission: "authenticated_fresh_agent_session",
            directive: "user_directive",
            userDirectiveSummary: cluster.userDirectiveSummary,
            episodeId: support.episodeId,
            episodeIdentityDigest: support.episodeIdentityDigest,
            episodeRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-accepted-agent-session-episode-revision.1",
                admissionDigest: admission.admissionDigest,
                candidateRevisionDigest: receipt.candidateRevisionDigest,
                promotionDigest: receipt.promotionDigest,
                supportIdentityDigest: support.supportIdentityDigest,
            }),
            rootSessionIdentityDigest: support.rootSessionIdentityDigest,
            occurredAt: support.occurredAt,
            provider: support.provider,
            routingIdentityKind: cluster.routingKind,
            routingIdentityDigest: cluster.providerNeutralRoutingDigest,
            completionAuthority: false,
            reopenAuthority: false,
        });
        return [(0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)({
                taskId: task.id,
                candidateId: receipt.candidateId,
                candidateRevisionDigest: receipt.candidateRevisionDigest,
                evidenceProofDigests,
                promotionId: receipt.promotionId,
                promotionDigest: receipt.promotionDigest,
                supportIdentityDigest: support.supportIdentityDigest,
                supportEvidenceProofDigest: selected.proofDigest,
                episode,
            })];
    });
    return rows.sort((left, right) => left.taskId.localeCompare(right.taskId));
}
function carryForwardAcceptedAgentSessionTaskProofs(freshProofs, predecessorProofs, acceptanceStore, projection, ranking) {
    if (acceptanceStore === null || predecessorProofs.length === 0) {
        return freshProofs.map((proof) => structuredClone(proof));
    }
    const rankedAcceptedOpenTaskIds = new Set(ranking.rankedAcceptedOpen.map((row) => row.taskId));
    const proofByTaskId = new Map(freshProofs.map((proof) => [
        proof.taskId,
        structuredClone(proof),
    ]));
    for (const predecessorProof of predecessorProofs) {
        if (proofByTaskId.has(predecessorProof.taskId))
            continue;
        const proof = (0, native_current_work_successor_js_1.validateTaskMapNativeAgentSessionTaskProof)(predecessorProof);
        const task = projection.tasks.find((candidate) => candidate.id === proof.taskId);
        if (task === undefined
            || task.reviewState !== "accepted"
            || task.authority !== "user"
            || task.taskHomePointerId !== proof.promotionId
            || !rankedAcceptedOpenTaskIds.has(task.id))
            continue;
        const matchingReceipts = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === proof.promotionId
            && receipt.promotionDigest === proof.promotionDigest
            && receipt.candidateId === proof.candidateId
            && receipt.candidateRevisionDigest === proof.candidateRevisionDigest
            && canonicalJson(receipt.evidenceProofDigests)
                === canonicalJson(proof.evidenceProofDigests)
            && receipt.evidenceProofDigests.includes(proof.supportEvidenceProofDigest));
        if (matchingReceipts.length !== 1)
            continue;
        proofByTaskId.set(proof.taskId, structuredClone(proof));
    }
    return [...proofByTaskId.values()].sort((left, right) => left.taskId.localeCompare(right.taskId));
}
function acceptedMembershipPredecessorProjection(projection, excludedTaskIds = new Set()) {
    const retainedTasks = projection.tasks.filter((task) => task.reviewState === "accepted" && !excludedTaskIds.has(task.id));
    if (retainedTasks.length === 0)
        return null;
    const retainedTaskIds = new Set(retainedTasks.map((task) => task.id));
    const retainedTaskRootIds = new Set(retainedTasks.map((task) => task.rootId));
    const retainedRoots = projection.roots.filter((root) => retainedTaskRootIds.has(root.id)).map((root) => structuredClone(root));
    const retainedRootIds = new Set(retainedRoots.map((root) => root.id));
    const retainedEntityIds = new Set([
        ...retainedTaskIds,
        ...retainedRootIds,
    ]);
    const retainedEdges = projection.edges.filter((edge) => retainedEntityIds.has(edge.from) && retainedEntityIds.has(edge.to));
    const retainedPointerIds = new Set();
    for (const task of retainedTasks) {
        if (task.taskHomePointerId !== undefined) {
            retainedPointerIds.add(task.taskHomePointerId);
        }
        for (const pointerId of task.originPointerIds) {
            retainedPointerIds.add(pointerId);
        }
        if ("pointerId" in task.returnRoute) {
            retainedPointerIds.add(task.returnRoute.pointerId);
        }
        for (const citation of task.citations) {
            retainedPointerIds.add(citation.pointerId);
        }
    }
    for (const root of retainedRoots) {
        for (const citation of root.citations) {
            retainedPointerIds.add(citation.pointerId);
        }
    }
    for (const edge of retainedEdges) {
        for (const citation of edge.citations) {
            retainedPointerIds.add(citation.pointerId);
        }
    }
    const retainedProjection = {
        ...structuredClone(projection),
        sources: projection.sources.filter((source) => retainedPointerIds.has(source.id)).map((source) => structuredClone(source)),
        roots: retainedRoots,
        tasks: retainedTasks.map((task) => structuredClone(task)),
        edges: retainedEdges.map((edge) => structuredClone(edge)),
        rejections: [],
    };
    return finalizeTaskMapProjectionMutation(retainedProjection, "invalid_predecessor");
}
function composeCurrentWorkProjections(meetingProjection, agentProjection) {
    if (meetingProjection.contractVersion !== agentProjection.contractVersion
        || meetingProjection.algorithmPolicyVersion
            !== agentProjection.algorithmPolicyVersion
        || meetingProjection.algorithmPolicyDigest
            !== agentProjection.algorithmPolicyDigest
        || meetingProjection.runStatus !== "accepted"
        || agentProjection.runStatus !== "accepted"
        || meetingProjection.rejections.length !== 0
        || agentProjection.rejections.length !== 0) {
        throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("harness_rejected");
    }
    const componentBinding = {
        domain: "taskmap-native-current-work-composition.v1",
        meetingProjectionDigest: taskMapProjectionDigest(meetingProjection),
        agentProjectionDigest: taskMapProjectionDigest(agentProjection),
    };
    const compositionDigest = (0, source_contracts_js_1.taskMapContractDigest)(componentBinding);
    const projection = {
        ...meetingProjection,
        runId: `tmrun_${compositionDigest.slice(0, 16)}`,
        generatedAt: [
            meetingProjection.generatedAt,
            agentProjection.generatedAt,
        ].sort().at(-1),
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            ...componentBinding,
            purpose: "projection-input",
        }),
        brain: {
            provider: "taskmap-native-current-work-composer",
            model: "deterministic-composition-v1",
            promptHash: (0, source_contracts_js_1.taskMapContractDigest)("taskmap-native-current-work-composition.prompt.v1"),
            outputDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                ...componentBinding,
                purpose: "semantic-output",
            }),
        },
        sources: [...meetingProjection.sources, ...agentProjection.sources],
        roots: [...meetingProjection.roots, ...agentProjection.roots],
        tasks: [...meetingProjection.tasks, ...agentProjection.tasks],
        edges: [...meetingProjection.edges, ...agentProjection.edges],
        rejections: [],
    };
    return finalizeTaskMapProjectionMutation(projection, "harness_rejected");
}
function receiptBackedAcceptedAgentExternalSingletonTaskIds(projection, acceptanceStore, agentTaskProofs, admission) {
    if (acceptanceStore === null)
        return new Set();
    const sourceById = new Map(projection.sources.map((source) => [
        source.id,
        source,
    ]));
    const rootById = new Map(projection.roots.map((root) => [root.id, root]));
    const provenAgentTaskIds = new Set(agentTaskProofs.flatMap((proof) => {
        const receiptMatches = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === proof.promotionId
            && receipt.candidateId === proof.candidateId
            && receipt.promotionDigest === proof.promotionDigest);
        return receiptMatches.length === 1 ? [proof.taskId] : [];
    }));
    const currentAgentCandidateIds = new Set(admission === null ? [] : acceptanceStore.receipts.flatMap((receipt) => admission.clusters.flatMap((cluster) => {
        const statementReferenceDigest = (0, native_candidate_review_js_1.taskMapAgentSessionCandidateStatementReferenceDigest)(admission.ownerScopeDigest, cluster.clusterIdentityDigest, receipt.accepted.mentionIdentityDigest);
        return statementReferenceDigest === receipt.statementReferenceDigest
            && (0, native_candidate_review_js_1.taskMapNativeCandidateId)(admission.ownerScopeDigest, statementReferenceDigest) === receipt.candidateId
            ? [receipt.candidateId]
            : [];
    })));
    return new Set(projection.tasks.flatMap((task) => {
        if (task.reviewState !== "accepted"
            || task.authority !== "user"
            || task.taskHomePointerId === undefined)
            return [];
        const receipts = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === task.taskHomePointerId);
        if (receipts.length !== 1)
            return [];
        const root = rootById.get(task.rootId);
        if (root === undefined
            || root.taskIds.length !== 1
            || root.taskIds[0] !== task.id
            || root.memberObjectRefs.length === 0
            || !root.memberObjectRefs.every((ref) => ref.startsWith("external:")))
            return [];
        const evidencePointerIds = new Set([
            ...task.originPointerIds,
            ...task.citations.map((citation) => citation.pointerId),
        ]);
        const hasAgentSource = [...evidencePointerIds].some((pointerId) => {
            const source = sourceById.get(pointerId);
            return source?.sourceKind === "codex_session"
                || source?.sourceKind === "claude_session";
        });
        return hasAgentSource
            || provenAgentTaskIds.has(task.id)
            || currentAgentCandidateIds.has(receipts[0].candidateId)
            ? [task.id]
            : [];
    }));
}
function retainedSemanticGroupingMarker(projection, projectionDigest, acceptanceStore, blockReason) {
    if (blockReason !== "semantic_provider_unavailable"
        && blockReason !== "accepted_membership_migration_unavailable")
        return null;
    if (!/^[a-f0-9]{64}$/.test(projectionDigest))
        return null;
    if (acceptanceStore === null)
        return null;
    const rootById = new Map(projection.roots.map((root) => [root.id, root]));
    const retainedTaskIds = new Set(projection.tasks.flatMap((task) => {
        if (task.reviewState !== "accepted"
            || task.authority !== "user"
            || task.taskHomePointerId === undefined
            || acceptanceStore.receipts.filter((receipt) => receipt.promotionId === task.taskHomePointerId).length !== 1)
            return [];
        const root = rootById.get(task.rootId);
        return root !== undefined
            && root.taskIds.length === 1
            && root.taskIds[0] === task.id
            && root.memberObjectRefs.length > 0
            && root.memberObjectRefs.every((ref) => ref.startsWith("external:"))
            ? [task.id]
            : [];
    }));
    if (retainedTaskIds.size < 2)
        return null;
    return {
        state: "retained_predecessor",
        reason: "plan2_unavailable",
        projectionDigest,
        acceptedTaskCount: retainedTaskIds.size,
    };
}
function acceptedAgentMigrationResultUnavailable(beforeRecovery, unresolvedAfterRecovery, survivingTaskIds, multiMemberSemanticPlanAvailable = true) {
    const resolvedCount = [...beforeRecovery].filter((taskId) => !unresolvedAfterRecovery.has(taskId) && survivingTaskIds.has(taskId)).length;
    if (beforeRecovery.size === 0 || unresolvedAfterRecovery.size === 0) {
        return false;
    }
    return multiMemberSemanticPlanAvailable
        ? resolvedCount === 0
        : unresolvedAfterRecovery.size >= 2;
}
function acceptedAgentEvidenceEventId(supportIdentityDigest, mentionIdentityDigest) {
    return `agent-event-${(0, source_contracts_js_1.taskMapContractDigest)({
        supportIdentityDigest,
        mentionIdentityDigest,
    }).slice(0, 16)}`;
}
function communityEvidenceEventId(rootProposalId, graphEpisodeId) {
    return `agent-community-event-${(0, source_contracts_js_1.taskMapContractDigest)({
        rootProposalId,
        graphEpisodeId,
    }).slice(0, 16)}`;
}
function acceptedAgentSessionTopicBindings(admission, extraction, acceptanceStore, projection, acceptedTopicLineage, predecessorTaskProofs) {
    const clusterByIdentity = new Map(admission.clusters.map((cluster) => [
        cluster.clusterIdentityDigest,
        cluster,
    ]));
    const currentBindings = projection.tasks.flatMap((task) => {
        if (task.reviewState !== "accepted"
            || task.authority !== "user"
            || task.taskHomePointerId === undefined)
            return [];
        const receipts = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === task.taskHomePointerId);
        if (receipts.length !== 1)
            return [];
        const receipt = receipts[0];
        const matches = extraction.clusters.flatMap((extractedCluster) => {
            if (extractedCluster.status !== "extracted"
                || extractedCluster.envelopeDigest === null)
                return [];
            const cluster = clusterByIdentity.get(extractedCluster.clusterIdentityDigest);
            if (cluster === undefined
                || cluster.workstreamIdentityDigest
                    !== extractedCluster.workstreamIdentityDigest
                || cluster.supports.length === 0)
                return [];
            return extractedCluster.mentions.flatMap((mention) => {
                const statementReferenceDigest = (0, native_candidate_review_js_1.taskMapAgentSessionCandidateStatementReferenceDigest)(admission.ownerScopeDigest, cluster.clusterIdentityDigest, mention.mentionIdentityDigest);
                const candidateId = (0, native_candidate_review_js_1.taskMapNativeCandidateId)(admission.ownerScopeDigest, statementReferenceDigest);
                if (candidateId !== receipt.candidateId)
                    return [];
                return [{
                        acceptedTaskId: task.id,
                        candidateId,
                        shadowEvidenceEventIds: cluster.supports.map((support) => acceptedAgentEvidenceEventId(support.supportIdentityDigest, mention.mentionIdentityDigest)).sort(),
                        targetRootRef: `workstream:${cluster.workstreamIdentityDigest}`,
                    }];
            });
        });
        return matches.length === 1 ? matches : [];
    });
    if (acceptedTopicLineage.length === 0) {
        return currentBindings.sort((left, right) => left.acceptedTaskId.localeCompare(right.acceptedTaskId));
    }
    const currentlyBoundTaskIds = new Set(currentBindings.map((binding) => binding.acceptedTaskId));
    const historicalBindings = projection.tasks.flatMap((task) => {
        if (task.reviewState !== "accepted"
            || task.authority !== "user"
            || task.taskHomePointerId === undefined
            || currentlyBoundTaskIds.has(task.id))
            return [];
        const receipts = acceptanceStore.receipts.filter((receipt) => receipt.promotionId === task.taskHomePointerId);
        if (receipts.length !== 1)
            return [];
        const receipt = receipts[0];
        const supportIdentityDigests = new Set(predecessorTaskProofs.filter((proof) => proof.taskId === task.id
            && proof.candidateId === receipt.candidateId
            && proof.promotionId === receipt.promotionId).map((proof) => proof.supportIdentityDigest));
        if (supportIdentityDigests.size === 0)
            return [];
        const matches = acceptedTopicLineage.flatMap((root) => {
            const members = root.members.filter((member) => supportIdentityDigests.has(member.supportIdentityDigest));
            return members.length === 0 ? [] : [{ root, members }];
        });
        // The full source graph must bind the accepted task to exactly one topic.
        // Duplicate lineage across topics is authority ambiguity, so fail closed.
        if (matches.length !== 1)
            return [];
        const match = matches[0];
        return [{
                acceptedTaskId: task.id,
                candidateId: receipt.candidateId,
                shadowEvidenceEventIds: match.members.map((member) => communityEvidenceEventId(match.root.rootProposalId, member.graphEpisodeId)).sort(),
                targetRootRef: `community:root:${match.root.rootProposalId}`,
            }];
    });
    return [...currentBindings, ...historicalBindings].sort((left, right) => left.acceptedTaskId.localeCompare(right.acceptedTaskId));
}
/**
 * Restore only the semantic roots required by exact, receipt-proven accepted
 * tasks when the current bounded extraction/digestion artifacts contain no
 * leaves. Historical proof chooses membership. A verified external singleton
 * is repurposed as the community root, preserving every accepted task and its
 * citations without inventing a proposed shadow or new source evidence.
 */
function restoreAcceptedAgentSessionTopicRecoveryRoots(admission, extraction, acceptanceStore, projection, acceptedTopicLineage, predecessorTaskProofs, communityRootPlan, rootEvidence) {
    if (admission === null
        || extraction === null
        || acceptanceStore === null)
        return projection;
    const bindings = acceptedAgentSessionTopicBindings(admission, extraction, acceptanceStore, projection, acceptedTopicLineage, predecessorTaskProofs).filter((binding) => !projection.roots.some((root) => root.memberObjectRefs.includes(binding.targetRootRef)));
    if (bindings.length === 0)
        return projection;
    const rootTitleByRef = new Map([
        ...communityRootPlan.roots.map((root) => [
            `community:root:${root.rootProposalId}`,
            root.title,
        ]),
        ...(rootEvidence?.rootProposals.map((root) => [
            `community:root:${root.proposalId}`,
            root.title,
        ]) ?? []),
    ]);
    const acceptedTaskById = new Map(projection.tasks.map((task) => [
        task.id,
        task,
    ]));
    const bindingsByRootRef = new Map();
    for (const binding of bindings) {
        if (!rootTitleByRef.has(binding.targetRootRef))
            continue;
        const acceptedTask = acceptedTaskById.get(binding.acceptedTaskId);
        if (acceptedTask === undefined)
            continue;
        const sourceRoot = projection.roots.find((root) => root.id === acceptedTask.rootId);
        if (sourceRoot === undefined
            || sourceRoot.taskIds.length !== 1
            || sourceRoot.taskIds[0] !== acceptedTask.id
            || sourceRoot.memberObjectRefs.some((ref) => ref.startsWith("community:"))) {
            continue;
        }
        const selected = bindingsByRootRef.get(binding.targetRootRef) ?? [];
        if (selected.length
            >= community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot)
            continue;
        selected.push(binding);
        bindingsByRootRef.set(binding.targetRootRef, selected);
    }
    if (bindingsByRootRef.size === 0)
        return projection;
    const recoveredRootById = new Map();
    for (const [rootRef, selected] of [...bindingsByRootRef.entries()].sort(([left], [right]) => compareCodePoint(left, right))) {
        const selectedTasks = selected.map((binding) => acceptedTaskById.get(binding.acceptedTaskId));
        const canonicalTask = [...selectedTasks].sort((left, right) => compareCodePoint(left.id, right.id))[0];
        const canonicalRoot = projection.roots.find((root) => root.id === canonicalTask.rootId);
        recoveredRootById.set(canonicalRoot.id, {
            ...structuredClone(canonicalRoot),
            title: rootTitleByRef.get(rootRef),
            summary: (0, text_contract_js_1.boundedUtf16)(selectedTasks.map((task) => task.title).sort(compareCodePoint).join("; "), 200),
            memberObjectRefs: [...new Set([
                    ...canonicalRoot.memberObjectRefs,
                    rootRef,
                ])].sort(compareCodePoint),
        });
    }
    return finalizeTaskMapProjectionMutation({
        ...structuredClone(projection),
        roots: projection.roots.map((root) => recoveredRootById.get(root.id) ?? structuredClone(root)),
    }, "harness_rejected");
}
function acceptedAgentTopicMembershipEdgeShouldBeReplaced(edge, movedTaskIds) {
    return edge.relation === "advances" && movedTaskIds.has(edge.to);
}
/**
 * Adoption grants task authority, not topic authority. Reattach each exact,
 * receipt-proven Agent Session personal fork to the engine-derived root that
 * already contains its workstream, and replace only its exact proposed shadow.
 */
function reconcileAcceptedAgentSessionTopicMembership(admission, extraction, acceptanceStore, projection, acceptedTopicLineage, predecessorTaskProofs) {
    if (admission === null || extraction === null || acceptanceStore === null) {
        return projection;
    }
    const bindings = acceptedAgentSessionTopicBindings(admission, extraction, acceptanceStore, projection, acceptedTopicLineage, predecessorTaskProofs);
    if (bindings.length === 0)
        return projection;
    const movedRootByTaskId = new Map();
    const removedShadowTaskIds = new Set();
    const replacementEdges = [];
    const plannedTaskCountByRoot = new Map(projection.roots.map((root) => [
        root.id,
        projection.tasks.filter((task) => task.rootId === root.id).length,
    ]));
    for (const binding of bindings) {
        const targetRoots = projection.roots.filter((root) => root.memberObjectRefs.includes(binding.targetRootRef));
        if (targetRoots.length !== 1)
            continue;
        const targetRoot = targetRoots[0];
        const acceptedTask = projection.tasks.find((task) => task.id === binding.acceptedTaskId);
        if (acceptedTask === undefined)
            continue;
        const membershipEdges = projection.edges.filter((edge) => edge.to === acceptedTask.id && edge.relation === "advances");
        if (membershipEdges.length > 1)
            continue;
        if (acceptedTask.rootId === targetRoot.id)
            continue;
        const shadowEdges = projection.edges.filter((edge) => edge.from === targetRoot.id
            && edge.relation === "advances"
            && !removedShadowTaskIds.has(edge.to)
            && binding.shadowEvidenceEventIds.some((eventId) => edge.citations.some((citation) => citation.eventId === eventId))).filter((edge) => projection.tasks.some((task) => task.id === edge.to
            && task.rootId === targetRoot.id
            && task.reviewState === "proposed"
            && task.authority === "none"));
        let exactShadowEdge = shadowEdges.length === 1
            ? shadowEdges[0]
            : null;
        let evictedProposedTaskId = null;
        const targetCount = plannedTaskCountByRoot.get(targetRoot.id) ?? 0;
        if (exactShadowEdge === null
            && targetCount
                >= community_task_digestion_js_1.TASKMAP_COMMUNITY_TASK_DIGESTION_LIMITS_V1.maxTasksPerRoot) {
            // User-authoritative adopted work wins the bounded topic slots. If its
            // exact proposed shadow was not selected into the latest top-five
            // digestion, evict one deterministic unaccepted leaf rather than leave
            // the accepted task stranded in a synthetic singleton root.
            const removable = projection.tasks.filter((task) => task.rootId === targetRoot.id
                && task.reviewState === "proposed"
                && task.authority === "none"
                && !removedShadowTaskIds.has(task.id)).sort((left, right) => compareCodePoint(right.id, left.id))[0];
            if (removable === undefined)
                continue;
            removedShadowTaskIds.add(removable.id);
            evictedProposedTaskId = removable.id;
            exactShadowEdge = projection.edges.find((edge) => edge.from === targetRoot.id
                && edge.to === removable.id
                && edge.relation === "advances") ?? null;
        }
        movedRootByTaskId.set(binding.acceptedTaskId, targetRoot.id);
        if (exactShadowEdge !== null) {
            removedShadowTaskIds.add(exactShadowEdge.to);
        }
        else if (evictedProposedTaskId === null) {
            plannedTaskCountByRoot.set(targetRoot.id, targetCount + 1);
        }
        const edgeTemplate = exactShadowEdge
            ?? membershipEdges[0]
            ?? {
                id: `tme_${(0, source_contracts_js_1.taskMapContractDigest)({
                    domain: "taskmap-accepted-agent-topic-membership-template.1",
                    rootId: targetRoot.id,
                    taskId: binding.acceptedTaskId,
                }).slice(0, 16)}`,
                from: targetRoot.id,
                to: binding.acceptedTaskId,
                relation: "advances",
                citations: structuredClone(acceptedTask.citations),
            };
        const citations = [
            ...structuredClone(edgeTemplate.citations),
            ...structuredClone(acceptedTask.citations),
        ];
        replacementEdges.push({
            ...structuredClone(edgeTemplate),
            id: `tme_${(0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-accepted-agent-topic-membership.1",
                rootId: targetRoot.id,
                taskId: binding.acceptedTaskId,
                candidateId: binding.candidateId,
            }).slice(0, 16)}`,
            from: targetRoot.id,
            to: binding.acceptedTaskId,
            citations: [...new Map(citations.map((citation) => [
                    canonicalJson(citation),
                    citation,
                ])).values()].sort((left, right) => left.pointerId.localeCompare(right.pointerId)
                || left.eventId.localeCompare(right.eventId)),
        });
    }
    if (movedRootByTaskId.size === 0)
        return projection;
    const movedTaskIds = new Set(movedRootByTaskId.keys());
    const reconciled = {
        ...structuredClone(projection),
        tasks: projection.tasks.flatMap((task) => {
            if (removedShadowTaskIds.has(task.id))
                return [];
            const rootId = movedRootByTaskId.get(task.id);
            return [{
                    ...structuredClone(task),
                    ...(rootId === undefined ? {} : { rootId }),
                }];
        }),
        edges: [
            ...projection.edges.filter((edge) => !removedShadowTaskIds.has(edge.from)
                && !removedShadowTaskIds.has(edge.to)
                && !acceptedAgentTopicMembershipEdgeShouldBeReplaced(edge, movedTaskIds)).map((edge) => structuredClone(edge)),
            ...replacementEdges,
        ],
    };
    return finalizeTaskMapProjectionMutation(reconciled, "harness_rejected");
}
function mergeTaskMapSemanticFragment(base, fragment) {
    if (base.ownerScopeDigest !== fragment.ownerScopeDigest) {
        throw new Error("Task Map raw meeting semantic owner mismatch");
    }
    return {
        ...base,
        sourceBindings: [...base.sourceBindings, ...fragment.sourceBindings]
            .sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
        evidenceBindings: [...base.evidenceBindings, ...fragment.evidenceBindings]
            .sort((left, right) => left.eventId.localeCompare(right.eventId)),
        taskMapInput: {
            ...base.taskMapInput,
            generatedAt: base.taskMapInput.generatedAt
                > fragment.taskMapInput.generatedAt
                ? base.taskMapInput.generatedAt
                : fragment.taskMapInput.generatedAt,
            pointers: [
                ...base.taskMapInput.pointers,
                ...fragment.taskMapInput.pointers,
            ].sort((left, right) => left.id.localeCompare(right.id)),
            events: [
                ...base.taskMapInput.events,
                ...fragment.taskMapInput.events,
            ].sort((left, right) => left.id.localeCompare(right.id)),
        },
    };
}
function emptyTaskMapSemanticInputForAcceptedReceipts(ownerScopeDigest, assessedAt) {
    return {
        contractVersion: "taskmap-native-semantic-builder-input.v1",
        ownerScopeDigest,
        producer: {
            id: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
            version: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
        },
        freshness: {
            decision: "fresh",
            available: true,
            retainedLastGood: false,
            producedAt: assessedAt,
            validThrough: new Date(Date.parse(assessedAt) + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS).toISOString(),
            assessedAt,
        },
        sourceBindings: [],
        evidenceBindings: [],
        taskMapInput: {
            contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
            generatedAt: assessedAt,
            pointers: [],
            events: [],
        },
    };
}
/**
 * Bind an accepted personal fork to its exact durable receipt pointer.
 * Proposal-only Agent Session rows remain untouched and non-authoritative.
 */
function bindCandidateAcceptancePersonalForkRoutes(projection, store) {
    const receiptPointerIds = new Set(store.receipts.map((receipt) => receipt.promotionId));
    const personalForkPointers = new Set(projection.sources
        .filter((source) => receiptPointerIds.has(source.id)
        && source.sourceKind === "manual"
        && source.authority === "user"
        && source.syncMode === "personal_fork")
        .map((source) => source.id));
    const bound = structuredClone(projection);
    bound.tasks = bound.tasks.map((task) => {
        const pointerId = task.taskHomePointerId;
        if (task.reviewState !== "accepted"
            || task.authority !== "user"
            || pointerId === undefined
            || !personalForkPointers.has(pointerId)
            || !task.originPointerIds.includes(pointerId))
            return task;
        return {
            ...task,
            returnRoute: {
                state: "personal_fork",
                pointerId,
                requiresApproval: true,
            },
        };
    });
    return finalizeTaskMapProjectionMutation(bound, "harness_rejected");
}
function sameStringSet(left, right) {
    return canonicalJson([...new Set(left)].sort())
        === canonicalJson([...new Set(right)].sort());
}
function assertStrategyFallbackFixedPredecessorBinding(prepared, fixed) {
    const binding = prepared.predecessor.binding;
    if (fixed.projection.runId !== binding.runId
        || fixed.projection.inputDigest !== binding.inputDigest
        || taskMapProjectionDigest(fixed.projection) !== binding.projectionDigest
        || fixed.projectionFileDigest !== binding.projectionFileDigest
        || fixed.currentnessFileDigest !== binding.currentnessFileDigest) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
}
function strategyFallbackCandidate(prepared, fixed) {
    const provenance = prepared.source.exactProvenance;
    const binding = prepared.predecessor.binding;
    if (provenance.projection.runId !== binding.runId
        || provenance.projection.inputDigest !== binding.inputDigest
        || provenance.projection.projectionDigest !== binding.projectionDigest
        || provenance.projection.projectionFileDigest
            !== binding.projectionFileDigest
        || provenance.projection.currentnessFileDigest
            !== binding.currentnessFileDigest) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    assertStrategyFallbackFixedPredecessorBinding(prepared, fixed);
    const predecessorInput = prepared.predecessor.taskMapInput;
    const predecessorPointerById = new Map(predecessorInput.pointers.map((pointer) => [pointer.id, pointer]));
    const projectionSourceById = new Map(fixed.projection.sources.map((source) => [source.id, source]));
    const currentTaskIds = new Set(fixed.currentness.taskDispositions
        .filter((row) => row.disposition === "current")
        .map((row) => row.taskId));
    const currentStrategyPointerIds = new Set(fixed.projection.tasks
        .filter((task) => currentTaskIds.has(task.id))
        .map((task) => task.taskHomePointerId)
        .filter((pointerId) => (pointerId !== undefined
        && projectionSourceById.get(pointerId)?.sourceKind === "strategy"
        && predecessorPointerById.get(pointerId)?.sourceKind === "strategy")));
    const strategyPointers = predecessorInput.pointers.filter((pointer) => currentStrategyPointerIds.has(pointer.id));
    const strategyPointerIds = new Set(strategyPointers.map((pointer) => pointer.id));
    const freshEventIds = new Set(prepared.source.taskMapInput.events.map((event) => event.id));
    const strategyEvents = predecessorInput.events.filter((event) => strategyPointerIds.has(event.pointerId)
        && freshEventIds.has(event.id));
    if (strategyPointers.length === 0
        || !sameStringSet(strategyPointers.map((pointer) => pointer.id), prepared.source.taskMapInput.pointers.map((pointer) => pointer.id))
        || !sameStringSet(strategyEvents.map((event) => event.id), prepared.source.taskMapInput.events.map((event) => event.id))) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    const freshPointerById = new Map(prepared.source.taskMapInput.pointers.map((pointer) => [
        pointer.id,
        pointer,
    ]));
    for (const pointer of strategyPointers) {
        const fresh = freshPointerById.get(pointer.id);
        if (fresh === undefined
            || fresh.sourceKind !== pointer.sourceKind
            || fresh.sourceRefHash !== pointer.sourceRefHash
            || fresh.canonicalUrl !== pointer.canonicalUrl
            || pointer.sourceVersion !== provenance.repository.revision
            || fresh.authority !== pointer.authority
            || fresh.syncMode !== pointer.syncMode
            || !sameStringSet(fresh.capabilities, pointer.capabilities)) {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
    }
    const freshEventById = new Map(prepared.source.taskMapInput.events.map((event) => [event.id, event]));
    for (const event of strategyEvents) {
        const fresh = freshEventById.get(event.id);
        if (fresh === undefined
            || fresh.pointerId !== event.pointerId
            || fresh.occurredAt !== event.occurredAt
            || fresh.title !== event.title
            || fresh.extractionConfidence !== event.extractionConfidence
            || fresh.sourceStatus !== event.sourceStatus) {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
    }
    const taskById = new Map(fixed.projection.tasks.map((task) => [task.id, task]));
    if (provenance.tasks.some((proof) => {
        const task = taskById.get(proof.taskId);
        return task === undefined
            || task.rootId !== proof.rootId
            || task.taskHomePointerId !== proof.pointerId
            || !task.citations.some((citation) => citation.eventId === proof.eventId
                && citation.pointerId === proof.pointerId);
    })) {
        throw new TaskMapNativePublicationError("predecessor_continuity_required");
    }
    return {
        contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
        projection: structuredClone(fixed.projection),
        currentness: structuredClone(fixed.currentness),
    };
}
function latestTimestamp(...values) {
    const parsed = values.map((value) => Date.parse(value));
    if (parsed.some((value) => !Number.isFinite(value))) {
        throw new Error("Task Map body assessment timestamp is invalid");
    }
    return new Date(Math.max(...parsed)).toISOString();
}
function taskMapBodyAssessmentPreservesAcceptedMembership(baseline, fixed) {
    if (baseline.runStatus !== "accepted"
        || baseline.rejections.length !== 0
        || (0, harness_js_1.taskMapMembershipSignature)(baseline)
            !== (0, harness_js_1.taskMapMembershipSignature)(fixed)) {
        return false;
    }
    // Root continuity follows the accepted member set rather than a
    // title-seeded identifier, so an owner retitle does not become a false
    // membership change during body-context reassessment.
    const refsKey = (root) => JSON.stringify([...root.memberObjectRefs].sort());
    const baselineKeys = baseline.roots.map(refsKey).sort();
    const fixedKeys = fixed.roots.map(refsKey).sort();
    return baselineKeys.length === fixedKeys.length
        && baselineKeys.every((key, index) => key === fixedKeys[index]);
}
function bodyAssessmentInput(prepared, fixed, snapshot, assessedAt) {
    const predecessorInput = prepared.predecessor.taskMapInput;
    const predecessorBrain = prepared.predecessor.semanticBrainOutput;
    const physiological = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalSemanticContext)(snapshot, assessedAt, snapshot.ownerScopeDigest);
    const priorBodyPointerIds = new Set(predecessorInput.pointers
        .filter((pointer) => pointer.sourceKind === "oura")
        .map((pointer) => pointer.id));
    const retainedPointers = predecessorInput.pointers.filter((pointer) => !priorBodyPointerIds.has(pointer.id));
    const retainedEvents = predecessorInput.events.filter((event) => (event.recordKind !== "body_context"
        && !priorBodyPointerIds.has(event.pointerId)));
    const retainedPointerIds = new Set(retainedPointers.map((pointer) => pointer.id));
    const retainedEventIds = new Set(retainedEvents.map((event) => event.id));
    if (physiological.pointers.some((pointer) => retainedPointerIds.has(pointer.id))
        || physiological.events.some((event) => retainedEventIds.has(event.id))) {
        throw new Error("Task Map physiological identity collides with work");
    }
    const removedEventIds = new Set(predecessorInput.events
        .filter((event) => !retainedEventIds.has(event.id))
        .map((event) => event.id));
    const citedByBrain = [
        ...predecessorBrain.roots.flatMap((root) => root.evidenceEventIds),
        ...predecessorBrain.tasks.flatMap((task) => task.evidenceEventIds),
        ...predecessorBrain.edges.flatMap((edge) => edge.evidenceEventIds),
    ];
    if (citedByBrain.some((eventId) => removedEventIds.has(eventId))) {
        throw new Error("Task Map body refresh cannot remove semantic work evidence");
    }
    const generatedAt = latestTimestamp(predecessorInput.generatedAt, snapshot.readReceipt.completedAt);
    const taskMapInput = {
        ...structuredClone(predecessorInput),
        generatedAt,
        pointers: [
            ...structuredClone(retainedPointers),
            ...structuredClone(physiological.pointers),
        ].sort((left, right) => left.id.localeCompare(right.id)),
        events: [
            ...structuredClone(retainedEvents),
            ...structuredClone(physiological.events),
        ].sort((left, right) => left.id.localeCompare(right.id)),
    };
    const brain = {
        ...structuredClone(predecessorBrain),
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(taskMapInput),
        generatedAt,
    };
    const baseline = (0, harness_js_1.buildTaskMapProjection)(taskMapInput, brain, {
        arm: "E2",
        now: generatedAt,
    });
    if (!taskMapBodyAssessmentPreservesAcceptedMembership(baseline, fixed.projection)) {
        throw new Error("Task Map body assessment cannot change accepted membership");
    }
    const evaluation = (0, body_causal_assessment_js_1.evaluateTaskMapOwnerBodyPatterns)({
        taskMapInput,
        brain,
        now: generatedAt,
        verifiedProviderRead: {
            snapshotDigest: snapshot.snapshotDigest,
            completedAt: snapshot.readReceipt.completedAt,
            validThrough: snapshot.validThrough,
        },
    });
    return {
        taskMapInput,
        brain,
        results: evaluation.results,
    };
}
function bodySignalSummary(observedDates, coverage) {
    if (observedDates.length === 0) {
        return `No below-baseline Readiness + Sleep day was observed from ${coverage.startDay} through ${coverage.endDay}.`;
    }
    return `Readiness + Sleep was below your recent personal range on ${observedDates.join(", ")} within ${coverage.startDay} through ${coverage.endDay}.`;
}
function workSourceLabels(sourceKinds) {
    const label = (sourceKind) => exports.TASKMAP_BODY_SIGNAL_WORK_SOURCE_LABEL_BY_KIND[sourceKind] ?? "Another work source";
    return [...new Set(sourceKinds.map(label))].sort();
}
function bodyRelevanceSummary(result, workSources) {
    if (result.status === "body_informed") {
        return `Body-informed: accepted work in this workstream occurred on ${result.matchedDates.join(", ")}, when recovery was below your recent personal range${workSources.length === 0 ? "" : ` in ${workSources.join(" and ")}`}. This is an association, not proof of cause.`;
    }
    if (result.status === "repeated_pattern") {
        return `Eligible work in this workstream repeated on ${result.matchedDates.join(", ")} across ${workSources.join(" and ")}. This is an association, not proof of cause.`;
    }
    switch (result.reasonCode) {
        case "body_provider_read_unverified":
            return "Body data was checked, but no verified current provider read was available for matching.";
        case "body_provider_read_stale":
            return "The last verified body read is no longer current, so no work relationship is shown.";
        case "body_provider_read_not_bound":
            return "The verified body read could not be bound to this accepted Task Map input.";
        case "contradictory_body_classification":
            return "The same signal day has conflicting body classifications, so no relationship is shown.";
        case "no_exact_root_work_overlap":
            return "No accepted work timestamp for this workstream fell on a below-personal-range day.";
        case "no_eligible_work_evidence":
            return "No accepted work timestamp in this workstream was eligible for comparison, so no body-work relationship is shown.";
        case "no_comparable_source_day_coverage":
            return "The work sources did not provide complete comparable days, so no body-work relationship is shown.";
        case "no_covered_target_body_days":
            return "No below-baseline Readiness + Sleep day fell inside complete work-source coverage, so no relationship is shown.";
        case "no_target_work_overlap":
            return "Eligible work did not overlap a comparably covered below-baseline day, so no relationship is shown.";
        case "insufficient_target_backed_days":
            return "The overlap appeared on fewer than three days, so no repeated relationship is shown.";
        case "enrichment_below_fixed_threshold":
            return "The work did not recur more often on below-baseline days than on comparison days, so no relationship is shown.";
        case "insufficient_multi_source_backing":
            return "Fewer than three overlap days had two independent work sources, so no repeated relationship is shown.";
        case "insufficient_neutral_reference_days":
            return "There were too few within-range comparison days to establish a repeated relationship.";
        case "root_not_found":
        case "input_or_brain_not_accepted":
        case "root_not_accepted":
        case "harness_causal_input_rejected":
            return "The accepted workstream could not be compared safely, so no body-work relationship is shown.";
    }
    return "The available evidence did not establish a repeated body-work relationship.";
}
function buildTaskMapBodySignalAssessment(prepared, fixed, snapshot, assessedAt) {
    const evaluated = bodyAssessmentInput(prepared, fixed, snapshot, assessedAt);
    const resultByProposalId = new Map(evaluated.results.map((result) => [result.rootProposalId, result]));
    const roots = prepared.predecessor.semanticBrainOutput.roots.map((proposal) => {
        const matches = fixed.projection.roots.filter((root) => (root.title === proposal.title
            && root.summary === proposal.summary
            && sameStringSet(root.memberObjectRefs, proposal.memberObjectRefs)));
        const result = resultByProposalId.get(proposal.proposalId);
        if (matches.length !== 1 || result === undefined) {
            throw new Error("Task Map body assessment root binding is ambiguous");
        }
        const matchedWorkSources = workSourceLabels(result.matchedSourceKinds ?? []);
        return {
            rootId: matches[0].id,
            relationship: result.status === "repeated_pattern"
                ? "repeated_association"
                : result.status === "body_informed"
                    ? "body_informed"
                    : "not_established",
            evidenceLevel: result.evidenceLevel ?? "not_established",
            observedSignalDates: [...result.observedTargetDates],
            matchedWorkDates: [...result.matchedDates],
            matchedWorkSources,
            matchedDateCount: result.matchedDateCount,
            signalSummary: bodySignalSummary(result.observedTargetDates, snapshot.coverage),
            relevanceSummary: bodyRelevanceSummary(result, matchedWorkSources),
            reasonCode: result.reasonCode,
        };
    }).sort((left, right) => left.rootId.localeCompare(right.rootId));
    if (roots.length !== fixed.projection.roots.length
        || new Set(roots.map((root) => root.rootId)).size !== roots.length) {
        throw new Error("Task Map body assessment must cover every accepted root once");
    }
    const base = {
        contractVersion: exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
        projection: {
            runId: fixed.projection.runId,
            inputDigest: fixed.projection.inputDigest,
            projectionDigest: taskMapProjectionDigest(fixed.projection),
        },
        physiologicalSnapshotDigest: snapshot.snapshotDigest,
        assessedAt,
        sourceFamily: "physiological",
        signal: {
            axis: "composite_recovery",
            displayName: "Readiness + Sleep",
            comparison: "relative_to_recent_personal_range",
            targetCategory: "below_baseline",
        },
        coverage: {
            startDay: snapshot.coverage.startDay,
            endDay: snapshot.coverage.endDay,
            classifiedDays: snapshot.coverage.classifiedDays,
            unknownDays: snapshot.coverage.unknownDays,
        },
        roots,
        boundary: "Body-informed context only. Association is not proof of cause.",
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
            providerIdentityStored: false,
        },
    };
    return {
        ...base,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)(base),
    };
}
function bodySignalAssessmentDigest(document) {
    const { artifactDigest: _artifactDigest, ...base } = document;
    return (0, source_contracts_js_1.taskMapContractDigest)(base);
}
class TaskMapNativeRefreshService {
    runtimeRoot;
    statePath;
    statusPath;
    candidatePath;
    lockPath;
    projectionPath;
    currentnessPath;
    bodySignalAssessmentPath;
    publicationJournalPath;
    candidateAcceptanceStorePath;
    sourcePaths;
    meetingProducerSnapshotPath;
    ownerScope;
    usesDefaultGraphBuilder;
    nowMs;
    readPhysiologicalProviderContext;
    strategyFallback;
    collectorOverrides;
    graphBuilder;
    publisher;
    lockWaitMs;
    readProcessStartMarker;
    afterLockReceiptClaimForTesting;
    afterLockAcquisitionMissForTesting;
    afterEmptyLockRecoveryReceiptClaimForTesting;
    readCandidateAcceptanceHeadDigest;
    rawGranolaSnapshotPath;
    meetingExtractionPromptTemplatePath;
    createMeetingExtractionStation;
    agentSessionExtractionPromptTemplatePath;
    communityTaskExtractionPromptTemplatePath;
    calendarExtractionPromptTemplatePath;
    createAgentSessionExtractionStation;
    createCalendarExtractionStation;
    identityEmbeddingProvider;
    identityEmbeddingModelId;
    createIdentityAdjudicationStation;
    createDecompositionStation;
    defaultLlmStationOptions;
    defaultRemoteEmbeddingOptions;
    activeRemoteRequestGroupId = null;
    identityStationStatus = {
        stationId: "identity-adjudication-v1",
        state: "unavailable",
        pendingCount: 0,
        degradationCode: "embedding_provider_failed",
        lastSuccessAtMs: null,
    };
    decompositionStationStatus = {
        stationId: "task-decomposition-v1",
        state: "unavailable",
        pendingCount: 0,
        degradationCode: "llm_station_unavailable",
        lastSuccessAtMs: null,
    };
    createCommunityGroupingStation;
    communityPlanEmbeddingProvider;
    communityPlanEmbeddingModelId;
    communityPlanDeadlineMs;
    agentSessionGraphFeedForTesting;
    afterAgentSessionGraphCollectionForTesting;
    communityPlanCircuitOpen = false;
    pendingRawGranolaReport = null;
    pendingAgentSessionExtraction = null;
    pendingCalendarExtraction = null;
    pendingCalendarResult = null;
    pendingAgentSessionGraphFeed = null;
    pendingAgentSessionGraphFileReceipts = [];
    pendingAgentSessionGraphMetrics = null;
    pendingAgentExtractionUnavailableCount = 0;
    pendingCalendarExtractionUnavailableCount = 0;
    pendingAgentExtractionUnavailableCode = "runner_failure";
    pendingCalendarExtractionUnavailableCode = "runner_failure";
    pendingRawGranolaCandidateReportDigest = null;
    afterDefaultContextBarrierForTesting;
    afterDefaultContextFreshSlicesForTesting;
    pendingBodySignalAssessment = null;
    pendingCalendarProviderStatuses = null;
    constructor(options) {
        (0, identity_js_1.assertConfirmedTaskMapOwner)(options.confirmedOwner);
        this.ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(options.confirmedOwner.userId, options.confirmedOwner.homeDirectory);
        this.runtimeRoot =
            options.runtimeRoot
                ?? this.ownerScope.runtimeRoot;
        this.statePath = node_path_1.default.join(this.runtimeRoot, "taskmap-refresh-state.v1.json");
        this.statusPath = node_path_1.default.join(this.runtimeRoot, "taskmap-refresh-status.v1.json");
        this.candidatePath = node_path_1.default.join(this.runtimeRoot, "taskmap-refresh-candidate.v1.json");
        this.lockPath = node_path_1.default.join(this.runtimeRoot, "taskmap-refresh.lock");
        this.projectionPath =
            options.projectionPath
                ?? node_path_1.default.join(this.ownerScope.taskMapRoot, "taskmap-projection.v1.json");
        this.currentnessPath =
            options.currentnessPath
                ?? node_path_1.default.join(node_path_1.default.dirname(this.projectionPath), "taskmap-currentness.v1.json");
        this.bodySignalAssessmentPath = node_path_1.default.join(node_path_1.default.dirname(this.projectionPath), exports.TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME);
        this.publicationJournalPath = node_path_1.default.join(this.runtimeRoot, "taskmap-publication-journal.v1.json");
        this.candidateAcceptanceStorePath = node_path_1.default.join(this.ownerScope.taskMapRoot, "native-candidate-acceptance.v1.json");
        const sourcePaths = mergeSourcePaths(options.sourcePaths, this.ownerScope);
        this.meetingProducerSnapshotPath =
            options.meetingProducerSnapshotPath
                ?? sourcePaths.meetingSnapshotPaths.find((snapshot) => snapshot.sourceLabel === "gdocs")?.filePath
                ?? (0, meeting_producer_freshness_js_1.taskMapMeetingProducerSnapshotPath)(this.ownerScope.homeDirectory);
        this.sourcePaths = {
            ...sourcePaths,
            meetingSnapshotPaths: sourcePaths.meetingSnapshotPaths.some((snapshot) => snapshot.filePath === this.meetingProducerSnapshotPath)
                ? sourcePaths.meetingSnapshotPaths
                : [
                    ...sourcePaths.meetingSnapshotPaths,
                    {
                        sourceLabel: "gdocs",
                        filePath: this.meetingProducerSnapshotPath,
                    },
                ],
        };
        this.usesDefaultGraphBuilder = options.graphBuilder === undefined;
        this.nowMs = options.nowMs ?? Date.now;
        this.readPhysiologicalProviderContext =
            options.readPhysiologicalProviderContext;
        this.strategyFallback = options.strategyFallback;
        this.collectorOverrides = options.collectors ?? {};
        this.graphBuilder =
            options.graphBuilder
                ?? ((input) => this.buildDefaultGraphCandidate(input));
        this.publisher = options.publisher ?? ((input) => publishTaskMapNativeProjection(this.projectionPath, this.currentnessPath, this.publicationJournalPath, input));
        this.lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
        this.readProcessStartMarker =
            options.readProcessStartMarker ?? processStartMarker;
        this.afterLockReceiptClaimForTesting =
            options.afterLockReceiptClaimForTesting;
        this.afterLockAcquisitionMissForTesting =
            options.afterLockAcquisitionMissForTesting;
        this.afterEmptyLockRecoveryReceiptClaimForTesting =
            options.afterEmptyLockRecoveryReceiptClaimForTesting;
        this.readCandidateAcceptanceHeadDigest =
            options.readCandidateAcceptanceHeadDigest
                ?? (async () => {
                    const store = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
                        storePath: this.candidateAcceptanceStorePath,
                        expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
                    });
                    return (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(store);
                });
        this.rawGranolaSnapshotPath = options.rawGranolaSnapshotPath
            ?? sourcePaths.meetingSnapshotPaths.find((snapshot) => snapshot.sourceLabel === "granola")?.filePath
            ?? node_path_1.default.join(this.ownerScope.sourceRoot, "granola-mcp-snapshot.json");
        this.meetingExtractionPromptTemplatePath =
            options.meetingExtractionPromptTemplatePath
                ?? node_path_1.default.resolve(__dirname, "../../../../prompts/mention-extraction-v1.md");
        this.createMeetingExtractionStation =
            options.createMeetingExtractionStation;
        this.agentSessionExtractionPromptTemplatePath =
            options.agentSessionExtractionPromptTemplatePath
                ?? node_path_1.default.resolve(__dirname, "../../../../prompts/agent-session-extraction-v1.md");
        this.communityTaskExtractionPromptTemplatePath =
            options.communityTaskExtractionPromptTemplatePath
                ?? node_path_1.default.resolve(__dirname, "../../../../prompts/community-task-extraction-v1.md");
        this.calendarExtractionPromptTemplatePath =
            options.calendarExtractionPromptTemplatePath
                ?? node_path_1.default.resolve(__dirname, "../../../../prompts/calendar-extraction-v1.md");
        this.createAgentSessionExtractionStation =
            options.createAgentSessionExtractionStation;
        this.createCalendarExtractionStation =
            options.createCalendarExtractionStation;
        this.identityEmbeddingProvider = options.identityEmbeddingProvider;
        this.identityEmbeddingModelId = options.identityEmbeddingModelId;
        this.createIdentityAdjudicationStation =
            options.createIdentityAdjudicationStation;
        this.createDecompositionStation = options.createDecompositionStation;
        this.defaultLlmStationOptions = options.defaultLlmStationOptions ?? {};
        this.defaultRemoteEmbeddingOptions =
            options.defaultRemoteEmbeddingOptions ?? {};
        this.createCommunityGroupingStation =
            options.createCommunityGroupingStation;
        this.communityPlanEmbeddingProvider =
            options.communityPlanEmbeddingProvider;
        this.communityPlanEmbeddingModelId =
            options.communityPlanEmbeddingModelId ?? null;
        this.communityPlanDeadlineMs =
            options.communityPlanDeadlineMs
                ?? exports.TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS;
        if (!Number.isSafeInteger(this.communityPlanDeadlineMs)
            || this.communityPlanDeadlineMs
                < TASKMAP_NATIVE_COMMUNITY_PLAN_MIN_DEADLINE_MS
            || this.communityPlanDeadlineMs
                > exports.TASKMAP_NATIVE_COMMUNITY_PLAN_MAX_DEADLINE_MS) {
            throw new TypeError("community plan deadline is outside its bounded range");
        }
        this.agentSessionGraphFeedForTesting =
            options.agentSessionGraphFeedForTesting;
        this.afterAgentSessionGraphCollectionForTesting =
            options.afterAgentSessionGraphCollectionForTesting;
        this.afterDefaultContextBarrierForTesting =
            options.afterDefaultContextBarrierForTesting;
        this.afterDefaultContextFreshSlicesForTesting =
            options.afterDefaultContextFreshSlicesForTesting;
    }
    async readDefaultMeetingProducer(assessedAtMs) {
        const expectedOwnerScopeDigest = this.ownerScope.ownerScopeDigest;
        if (!finiteTimestamp(assessedAtMs)) {
            throw new Error("Task Map meeting assessment time is invalid");
        }
        const result = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: this.meetingProducerSnapshotPath,
            assessedAt: new Date(assessedAtMs).toISOString(),
            expectedOwnerScopeDigest,
        });
        const validThroughMs = Date.parse(result.freshness.validThrough ?? "");
        if (result.availability !== "available"
            || result.freshness.decision !== "fresh"
            || result.freshness.currentSemanticInputEligible !== true
            || result.snapshot === null
            || result.retainedLastGood !== null
            || !finiteTimestamp(validThroughMs)
            || assessedAtMs >= validThroughMs) {
            throw new Error("fresh meeting evidence is unavailable");
        }
        return { result, expectedOwnerScopeDigest, validThroughMs };
    }
    async readDefaultContextSourceSlice(source, assessedAtMs) {
        if (source === "agent_session") {
            return bindAgentSessionCommunityPlanIdentity(await loadAgentSessionSlice(this.sourcePaths.agentSessionProducerSnapshotPath, assessedAtMs, this.ownerScope.ownerScopeDigest), this.pendingAgentSessionGraphFeed, this.pendingAgentSessionGraphMetrics);
        }
        if (source === "meeting_notes") {
            return collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, assessedAtMs, this.ownerScope.ownerScopeDigest);
        }
        const result = await collectCalendar(this.sourcePaths.calendarExportPath, this.sourcePaths.googleCalendarSnapshotPath, assessedAtMs, this.ownerScope.ownerScopeDigest);
        if (result.slice === null) {
            throw new Error("fresh Calendar producer artifact is unavailable");
        }
        return result.slice;
    }
    async assertDefaultContextBarrierBindings(barrier, assessedAtMs) {
        for (const source of [
            "agent_session",
            "meeting_notes",
            "calendar",
        ]) {
            if (this.collectorOverrides[source] !== undefined)
                continue;
            const expected = barrier.graphInput.sources.find((entry) => entry.source === source);
            if (expected?.disposition !== "fresh")
                continue;
            let actual;
            try {
                actual = await this.readDefaultContextSourceSlice(source, assessedAtMs);
            }
            catch {
                throw new TaskMapNativeSourceChangedError(source, `${source} evidence became unavailable after the source barrier`);
            }
            if (!nativeSafeSliceMatches(expected, actual)) {
                throw new TaskMapNativeSourceChangedError(source, `${source} evidence changed after the source barrier`);
            }
        }
    }
    async assertDefaultContextFreshSlices(freshSlices, assessedAtMs) {
        for (const source of [
            "agent_session",
            "meeting_notes",
            "calendar",
        ]) {
            if (this.collectorOverrides[source] !== undefined)
                continue;
            const expected = freshSlices.get(source);
            if (expected === undefined)
                continue;
            let actual;
            try {
                actual = await this.readDefaultContextSourceSlice(source, assessedAtMs);
            }
            catch {
                throw new TaskMapNativeSourceChangedError(source, `${source} evidence became unavailable during refresh validation`);
            }
            if (expected.revision !== actual.revision
                || expected.sliceDigest !== actual.sliceDigest
                || canonicalJson(expected.value) !== canonicalJson(actual.value)) {
                throw new TaskMapNativeSourceChangedError(source, `${source} evidence changed during refresh validation`);
            }
        }
    }
    async readDefaultStrategyFallback() {
        const fallback = this.strategyFallback;
        if (fallback === undefined
            || typeof fallback.readAdapterInput !== "function") {
            throw new Error("Task Map Strategy fallback is unavailable");
        }
        const evidencePath = (0, native_predecessor_evidence_js_1.taskMapNativePredecessorEvidencePath)(fallback.homeDirectory);
        const fixedDirectory = node_path_1.default.dirname(evidencePath);
        if (node_path_1.default.resolve(this.projectionPath)
            !== node_path_1.default.join(fixedDirectory, "taskmap-projection.v1.json")
            || node_path_1.default.resolve(this.currentnessPath)
                !== node_path_1.default.join(fixedDirectory, "taskmap-currentness.v1.json")) {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
        try {
            const [predecessor, source] = await Promise.all([
                (0, native_predecessor_evidence_js_1.loadTaskMapNativePredecessorEvidence)({
                    homeDirectory: fallback.homeDirectory,
                }),
                fallback.readAdapterInput().then((input) => (0, strategy_source_adapter_js_1.readTaskMapStrategySourceAdapter)(input)),
            ]);
            if (source.exactProvenance.projection.runId
                !== predecessor.binding.runId
                || source.exactProvenance.projection.inputDigest
                    !== predecessor.binding.inputDigest
                || source.exactProvenance.projection.projectionDigest
                    !== predecessor.binding.projectionDigest
                || source.exactProvenance.projection.projectionFileDigest
                    !== predecessor.binding.projectionFileDigest
                || source.exactProvenance.projection.currentnessFileDigest
                    !== predecessor.binding.currentnessFileDigest) {
                throw new Error("Strategy source and predecessor do not match");
            }
            await atomicOwnerTextWrite(fixedDirectory, strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME, canonicalJson(source.sourceSnapshot) + "\n");
            return {
                source,
                predecessor,
                strategyProofDigest: source.exactProvenance.artifactDigest,
                predecessorEvidenceBindingDigest: sha256(canonicalJson(predecessor.binding)),
            };
        }
        catch {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
    }
    async assertDefaultStrategyFallbackFixedPredecessor(prepared) {
        const fixed = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
        if (fixed === null) {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
        assertStrategyFallbackFixedPredecessorBinding(prepared, fixed);
    }
    async revalidatePendingRawGranolaReport(assessedAtMs) {
        if (this.pendingRawGranolaReport === null)
            return null;
        try {
            const verified = await loadCurrentTaskMapOwnerGranolaExtractionReport({
                snapshotPath: this.rawGranolaSnapshotPath,
                residentReceiptPath: this.sourcePaths.residentReceiptPath,
                assessedAt: new Date(assessedAtMs).toISOString(),
                taskMapRoot: this.ownerScope.taskMapRoot,
                runtimeRoot: this.runtimeRoot,
                ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                promptTemplatePath: this.meetingExtractionPromptTemplatePath,
            });
            this.pendingRawGranolaReport = verified;
            return verified;
        }
        catch {
            this.pendingRawGranolaReport = null;
            return null;
        }
    }
    async refreshPendingStationExtractions(graphInput, assessedAtMs) {
        const assessedAt = new Date(assessedAtMs).toISOString();
        const admission = admittedAgentSessionSemanticAdmission(graphInput);
        this.pendingAgentSessionExtraction = null;
        this.pendingAgentExtractionUnavailableCount = 0;
        this.pendingAgentExtractionUnavailableCode = "runner_failure";
        if (admission !== null) {
            try {
                await ensurePrivateDirectory(this.ownerScope.taskMapRoot);
                const extraction = await (0, agent_session_refresh_llm_replay_js_1.refreshTaskMapAgentSessionExtraction)({
                    admission,
                    taskMapRoot: this.ownerScope.taskMapRoot,
                    runtimeRoot: this.runtimeRoot,
                    ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                    promptTemplatePath: this.agentSessionExtractionPromptTemplatePath,
                    assessedAt,
                    createStation: this.llmStationFactory(this.createAgentSessionExtractionStation),
                });
                this.pendingAgentSessionExtraction = extraction;
            }
            catch (error) {
                this.pendingAgentSessionExtraction = null;
                this.pendingAgentExtractionUnavailableCount =
                    admission.clusters.length;
                this.pendingAgentExtractionUnavailableCode =
                    error instanceof meeting_refresh_llm_replay_js_1.TaskMapPromptTemplateUnavailableError
                        ? "prompt_template_missing"
                        : "runner_failure";
            }
        }
        this.pendingCalendarExtraction = null;
        this.pendingCalendarExtractionUnavailableCount = 0;
        this.pendingCalendarExtractionUnavailableCode = "runner_failure";
        if (this.pendingCalendarResult?.availability === "available") {
            try {
                await ensurePrivateDirectory(this.ownerScope.taskMapRoot);
                const extraction = await (0, calendar_refresh_llm_replay_js_1.refreshTaskMapCalendarExtraction)({
                    result: this.pendingCalendarResult,
                    taskMapRoot: this.ownerScope.taskMapRoot,
                    runtimeRoot: this.runtimeRoot,
                    ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                    promptTemplatePath: this.calendarExtractionPromptTemplatePath,
                    assessedAt,
                    createStation: this.llmStationFactory(this.createCalendarExtractionStation),
                });
                this.pendingCalendarExtraction = extraction;
            }
            catch (error) {
                this.pendingCalendarExtraction = null;
                this.pendingCalendarExtractionUnavailableCount =
                    (0, calendar_extraction_js_1.buildTaskMapCalendarExtractionSegments)(this.pendingCalendarResult.events).length;
                this.pendingCalendarExtractionUnavailableCode =
                    error instanceof meeting_refresh_llm_replay_js_1.TaskMapPromptTemplateUnavailableError
                        ? "prompt_template_missing"
                        : "runner_failure";
            }
        }
    }
    identityEmbeddingSelection() {
        if (this.identityEmbeddingProvider !== undefined) {
            return {
                provider: this.identityEmbeddingProvider,
                modelId: this.identityEmbeddingModelId ?? "injected-embedding-v1",
            };
        }
        try {
            return {
                provider: new gemini_remote_js_1.RemoteGeminiEmbeddingProvider({
                    ...this.defaultRemoteEmbeddingOptions,
                    ...(this.activeRemoteRequestGroupId === null
                        ? {}
                        : { requestGroupId: this.activeRemoteRequestGroupId }),
                }),
                modelId: "gemini-embedding-001",
            };
        }
        catch {
            try {
                return {
                    provider: new gemini_js_1.GeminiEmbeddingProvider(),
                    modelId: "gemini-embedding-001-local-key",
                };
            }
            catch {
                return {
                    provider: {
                        async embed() {
                            throw new Error("embedding provider unavailable");
                        },
                    },
                    modelId: "gemini-embedding-unavailable",
                };
            }
        }
    }
    llmStationFactory(configured) {
        if (configured !== undefined)
            return configured;
        return (signal) => (0, llm_station_js_1.createLlmStation)({
            ...this.defaultLlmStationOptions,
            ...(this.activeRemoteRequestGroupId === null
                ? {}
                : { remoteRequestGroupId: this.activeRemoteRequestGroupId }),
            signal,
        });
    }
    async refreshIdentityAdjudicationStation(projection, assessedAtMs) {
        const candidates = (0, identity_adjudication_refresh_js_1.taskMapIdentityCandidatesFromProjection)(projection);
        const inputDigest = this.identityAdjudicationInputDigest(candidates);
        const embedding = this.identityEmbeddingSelection();
        let artifact;
        try {
            artifact = await (0, identity_adjudication_refresh_js_1.refreshTaskMapIdentityAdjudication)({
                taskMapRoot: node_path_1.default.dirname(this.projectionPath),
                ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                inputDigest,
                candidates,
                embeddingProvider: embedding.provider,
                embeddingModelId: embedding.modelId,
                createStation: this.llmStationFactory(this.createIdentityAdjudicationStation),
            });
        }
        catch {
            this.identityStationStatus = {
                stationId: "identity-adjudication-v1",
                state: "unavailable",
                pendingCount: candidates.length,
                degradationCode: "embedding_provider_failed",
                lastSuccessAtMs: null,
            };
            return null;
        }
        this.identityStationStatus = {
            stationId: "identity-adjudication-v1",
            state: artifact.state,
            pendingCount: artifact.pendingCount,
            degradationCode: artifact.degradationCode,
            lastSuccessAtMs: artifact.state === "current" ? assessedAtMs : null,
        };
        return artifact;
    }
    identityAdjudicationInputDigest(candidates) {
        return (0, source_contracts_js_1.taskMapContractDigest)({
            stationId: "identity-adjudication-v1",
            candidates,
        });
    }
    async restoreIdentityAdjudicationStationStatus(lastSuccessAtMs) {
        this.identityStationStatus = {
            stationId: "identity-adjudication-v1",
            state: "unavailable",
            pendingCount: 0,
            degradationCode: "embedding_provider_failed",
            lastSuccessAtMs: null,
        };
        let predecessor;
        try {
            predecessor = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
        }
        catch {
            return;
        }
        if (predecessor === null)
            return;
        const candidates = (0, identity_adjudication_refresh_js_1.taskMapIdentityCandidatesFromProjection)(predecessor.projection);
        const artifact = await (0, identity_adjudication_refresh_js_1.loadTaskMapIdentityAdjudicationRefreshArtifact)(node_path_1.default.dirname(this.projectionPath), this.ownerScope.ownerScopeDigest, this.identityAdjudicationInputDigest(candidates));
        if (artifact === null)
            return;
        this.identityStationStatus = {
            stationId: "identity-adjudication-v1",
            state: "current",
            pendingCount: 0,
            degradationCode: null,
            lastSuccessAtMs,
        };
    }
    stationStatuses() {
        return [this.identityStationStatus, this.decompositionStationStatus];
    }
    async semanticGroupingRetention(blockReason) {
        if (blockReason !== "semantic_provider_unavailable"
            && blockReason !== "accepted_membership_migration_unavailable")
            return null;
        try {
            const [selected, acceptanceStore] = await Promise.all([
                readVerifiedProjection(this.projectionPath),
                (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
                    storePath: this.candidateAcceptanceStorePath,
                    expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
                }),
            ]);
            if (acceptanceStore === null)
                return null;
            return retainedSemanticGroupingMarker(selected.projection, selected.projectionDigest, acceptanceStore, blockReason);
        }
        catch {
            // This marker is explanatory only. Any malformed predecessor or receipt
            // remains governed by the existing publication/currentness gates.
            return null;
        }
    }
    async restoreDecompositionStationStatus(lastSuccessAtMs) {
        this.decompositionStationStatus = {
            stationId: "task-decomposition-v1",
            state: "unavailable",
            pendingCount: 0,
            degradationCode: "llm_station_unavailable",
            lastSuccessAtMs: null,
        };
        let predecessor;
        try {
            predecessor = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
        }
        catch {
            // Station status is an ancillary read-only surface. Existing recovery,
            // continuity, and owner-scope paths remain authoritative for malformed,
            // legacy, or foreign predecessor pairs and must report their own stable
            // fail-closed outcome instead of being preempted here.
            return;
        }
        if (predecessor === null)
            return;
        const artifact = await (0, decomposition_refresh_js_1.loadTaskMapDecompositionRefreshArtifact)(node_path_1.default.dirname(this.projectionPath), this.ownerScope.ownerScopeDigest, (0, source_contracts_js_1.taskMapContractDigest)(predecessor.projection));
        if (artifact === null)
            return;
        this.decompositionStationStatus = {
            stationId: "task-decomposition-v1",
            state: "current",
            pendingCount: 0,
            degradationCode: null,
            lastSuccessAtMs,
        };
    }
    async refreshDecompositionStation(projection, assessedAtMs) {
        let artifact;
        try {
            artifact = await (0, decomposition_refresh_js_1.refreshTaskMapDecomposition)({
                taskMapRoot: node_path_1.default.dirname(this.projectionPath),
                ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                projection,
                createStation: this.llmStationFactory(this.createDecompositionStation),
            });
        }
        catch {
            this.decompositionStationStatus = {
                stationId: "task-decomposition-v1",
                state: "unavailable",
                pendingCount: 0,
                degradationCode: "llm_station_unavailable",
                lastSuccessAtMs: null,
            };
            return null;
        }
        this.decompositionStationStatus = {
            stationId: "task-decomposition-v1",
            state: artifact.state,
            pendingCount: artifact.pendingCount,
            degradationCode: artifact.degradationCode,
            lastSuccessAtMs: artifact.state === "current" ? assessedAtMs : null,
        };
        return artifact;
    }
    communityGraphCoverage() {
        const metrics = this.pendingAgentSessionGraphMetrics;
        const feed = this.pendingAgentSessionGraphFeed;
        const privacy = {
            pathsPersisted: false,
            textPersisted: false,
            secretsPersisted: false,
            vectorsPersisted: false,
        };
        if (metrics === null) {
            const inputObservations = Math.min(feed?.counts.inputObservations ?? 0, agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxObservations);
            const selectedEpisodes = Math.min(feed?.counts.selectedEpisodes ?? 0, agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEpisodesGlobal);
            return {
                contractVersion: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
                discovery: { directoriesVisited: 0, candidatesDiscovered: inputObservations, directoryLimit: MAX_SESSION_DIRECTORIES, candidateLimit: MAX_SESSION_FILES, directoryLimitReached: false, candidateLimitReached: false },
                reads: { attemptedFiles: inputObservations, attemptLimit: MAX_GRAPH_SESSION_READ_ATTEMPTS, droppedAttemptLimit: 0, droppedInvalid: 0 },
                scan: { chargedBytes: 0, globalByteLimit: MAX_GRAPH_SESSION_SCAN_BYTES_GLOBAL, perFileByteLimit: MAX_GRAPH_SESSION_SCAN_BYTES_PER_FILE, droppedScanBudget: 0 },
                observations: { selectedObservations: inputObservations, observationLimit: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxObservations, droppedObservationLimit: 0, rawBytesSelected: 0, rawByteLimit: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesGlobal, droppedRawByteBudget: 0, graphEpisodesSelected: selectedEpisodes, maxGraphEpisodes: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEpisodesGlobal, droppedGraphEpisodes: Math.max(0, (feed?.counts.deduplicatedEpisodes ?? 0) - selectedEpisodes) },
                distribution: { codexSelected: 0, claudeSelected: 0, isoWeeksSelected: 0 },
                completeness: "unknown",
                truncationReasons: ["not_collected"],
                authority: "none",
                privacy,
            };
        }
        const droppedGraphEpisodes = Math.max(0, (feed?.counts.deduplicatedEpisodes ?? 0) - (feed?.counts.selectedEpisodes ?? 0));
        const reasons = [
            ...(metrics.candidateLimitReached ? ["candidate_limit"] : []),
            ...(metrics.directoryLimitReached ? ["directory_limit"] : []),
            ...(metrics.droppedAttemptLimit > 0 ? ["read_attempt_limit"] : []),
            ...(metrics.droppedScanBudget > 0 ? ["scan_byte_limit"] : []),
            ...(metrics.droppedRawByteBudget > 0 ? ["raw_byte_limit"] : []),
            ...(metrics.droppedObservationLimit > 0 ? ["observation_limit"] : []),
            ...(droppedGraphEpisodes > 0 ? ["graph_episode_limit"] : []),
            ...(metrics.droppedInvalid > 0 ? ["invalid_or_raced"] : []),
        ].sort(compareCodePoint);
        return {
            contractVersion: native_community_shadow_js_1.TASKMAP_NATIVE_COMMUNITY_GRAPH_COVERAGE_VERSION,
            discovery: { directoriesVisited: metrics.directoriesVisited, candidatesDiscovered: metrics.discoveredCandidates, directoryLimit: MAX_SESSION_DIRECTORIES, candidateLimit: MAX_SESSION_FILES, directoryLimitReached: metrics.directoryLimitReached, candidateLimitReached: metrics.candidateLimitReached },
            reads: { attemptedFiles: metrics.attemptedFiles, attemptLimit: MAX_GRAPH_SESSION_READ_ATTEMPTS, droppedAttemptLimit: metrics.droppedAttemptLimit, droppedInvalid: metrics.droppedInvalid },
            scan: { chargedBytes: metrics.chargedScanBytes, globalByteLimit: MAX_GRAPH_SESSION_SCAN_BYTES_GLOBAL, perFileByteLimit: MAX_GRAPH_SESSION_SCAN_BYTES_PER_FILE, droppedScanBudget: metrics.droppedScanBudget },
            observations: { selectedObservations: metrics.selectedObservations, observationLimit: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxObservations, droppedObservationLimit: metrics.droppedObservationLimit, rawBytesSelected: metrics.rawBytesSelected, rawByteLimit: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesGlobal, droppedRawByteBudget: metrics.droppedRawByteBudget, graphEpisodesSelected: feed?.counts.selectedEpisodes ?? 0, maxGraphEpisodes: agent_session_producer_freshness_js_1.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxEpisodesGlobal, droppedGraphEpisodes },
            distribution: { codexSelected: metrics.selectedProviderCounts.codex, claudeSelected: metrics.selectedProviderCounts.claude, isoWeeksSelected: metrics.selectedIsoWeeks.length },
            completeness: reasons.length === 0 && metrics.discoveryExhausted ? "complete" : "bounded_partial",
            truncationReasons: reasons,
            authority: "none",
            privacy,
        };
    }
    async buildAuthoritativeAgentRootPlan(admission, assessedAtMs, predecessorProjection) {
        const feed = this.pendingAgentSessionGraphFeed;
        if (admission === null || feed === null) {
            return {
                currentRootPlan: { roots: [] },
                rootEvidence: null,
                taskDigestion: null,
                acceptedTopicLineage: [],
                semanticRootsAvailable: false,
                plan2Unavailable: true,
            };
        }
        let timeout;
        const abortController = new AbortController();
        let planPromise;
        let station = null;
        try {
            const build = async () => {
                if (!this.communityPlanCircuitOpen) {
                    try {
                        station = await this.llmStationFactory(this.createCommunityGroupingStation)(abortController.signal);
                    }
                    catch {
                        // Deterministic structural grouping remains a valid bounded plan.
                    }
                }
                const embeddingProvider = this.communityPlanCircuitOpen
                    ? null
                    : this.communityPlanEmbeddingProvider ?? null;
                const embeddingModelId = embeddingProvider === null
                    ? null
                    : this.communityPlanEmbeddingModelId ?? "gemini-embedding-001";
                const plan = await (0, native_community_shadow_js_1.buildTaskMapNativeCommunityPlan)({
                    ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                    requestedAt: new Date(assessedAtMs).toISOString(),
                    agentSessionGraphFeed: feed,
                    graphCollectionCoverage: this.communityGraphCoverage(),
                    semanticEvidence: {
                        station,
                        embeddingProvider,
                        embeddingModelId,
                        groupingReplayPath: node_path_1.default.join(this.ownerScope.taskMapRoot, "llm-envelopes", "community-grouping-v1"),
                        embeddingCachePath: node_path_1.default.join(this.ownerScope.taskMapRoot, "llm-envelopes", "community-embeddings.v1.json"),
                        titleReplayPath: node_path_1.default.join(this.ownerScope.taskMapRoot, "llm-envelopes", "community-title-v1"),
                        signal: abortController.signal,
                    },
                    previousAcceptedRoots: previousAcceptedCommunityRootsFromProjection(predecessorProjection, feed),
                });
                if (abortController.signal.aborted) {
                    return {
                        currentRootPlan: { roots: [] },
                        rootEvidence: null,
                        taskDigestion: null,
                        acceptedTopicLineage: [],
                        semanticRootsAvailable: false,
                        plan2Unavailable: true,
                    };
                }
                return {
                    currentRootPlan: (0, native_community_shadow_js_1.mapTaskMapNativeCommunityPlanToAgentRoots)({
                        plan,
                        feed,
                        admission,
                    }),
                    rootEvidence: (0, native_community_shadow_js_1.buildTaskMapNativeCommunityRootEvidence)({
                        plan,
                        feed,
                        generatedAt: new Date(assessedAtMs).toISOString(),
                        currentAdmission: admission,
                    }),
                    taskDigestion: null,
                    acceptedTopicLineage: acceptedTopicLineageFromCommunityPlan(plan, feed),
                    semanticRootsAvailable: plan.groupingAvailable,
                    plan2Unavailable: !plan.groupingAvailable,
                };
            };
            const deadline = new Promise((_resolve, reject) => {
                timeout = setTimeout(() => {
                    abortController.abort(new Error("community plan deadline exceeded"));
                    reject(new Error("community plan deadline exceeded"));
                }, this.communityPlanDeadlineMs);
            });
            planPromise = build();
            const resolved = await Promise.race([planPromise, deadline]);
            if (timeout !== undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
            if (resolved.rootEvidence === null)
                return resolved;
            // Task digestion runs outside the plan deadline on its own bounded
            // budget: a slow first-generation station must degrade single roots,
            // never the whole community plan.
            const taskDigestion = await this.digestCommunityRootTasks(resolved.rootEvidence, station);
            return {
                ...resolved,
                taskDigestion,
                plan2Unavailable: resolved.plan2Unavailable
                    || (resolved.rootEvidence.rootProposals.length > 0
                        && (taskDigestion?.digestedRootCount ?? 0) === 0),
            };
        }
        catch {
            abortController.abort();
            if (planPromise !== undefined) {
                void planPromise.catch(() => undefined);
            }
            this.communityPlanCircuitOpen = true;
            return {
                currentRootPlan: { roots: [] },
                rootEvidence: null,
                taskDigestion: null,
                acceptedTopicLineage: [],
                semanticRootsAvailable: false,
                plan2Unavailable: true,
            };
        }
        finally {
            if (timeout !== undefined)
                clearTimeout(timeout);
        }
    }
    /**
     * Digests each Plan2 root's selected evidence into semantic review leaves.
     * Recorded envelopes replay byte-identically without a station; a failed
     * digestion returns null and the projection then drops taskless roots
     * instead of inventing placeholder tasks.
     */
    async digestCommunityRootTasks(rootEvidence, station) {
        if (rootEvidence.rootProposals.length === 0)
            return null;
        const controller = new AbortController();
        const budget = setTimeout(() => controller.abort(new Error("community task digestion budget exceeded")), exports.TASKMAP_COMMUNITY_TASK_DIGESTION_BUDGET_MS);
        try {
            const digestion = await (0, community_task_digestion_js_1.digestTaskMapCommunityRootTasks)({
                rootEvidence,
                taskMapRoot: this.ownerScope.taskMapRoot,
                promptTemplatePath: this.communityTaskExtractionPromptTemplatePath,
                station,
                signal: controller.signal,
            });
            await (0, meeting_refresh_llm_replay_js_1.replacePrivateFile)(node_path_1.default.join(this.runtimeRoot, exports.TASKMAP_COMMUNITY_TASK_DIGESTION_REPORT_FILENAME), digestion).catch(() => undefined);
            return digestion;
        }
        catch {
            return null;
        }
        finally {
            clearTimeout(budget);
        }
    }
    async pendingAgentSessionGraphFilesAreCurrent() {
        for (const receipt of this.pendingAgentSessionGraphFileReceipts) {
            let handle;
            try {
                handle = await (0, promises_1.open)(receipt.filePath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
                const metadata = await handle.stat({ bigint: true });
                if (!sameAgentSessionFileMetadata(receipt, agentSessionFileMetadataReceipt(metadata))
                    || !/^[a-f0-9]{64}$/.test(receipt.observationDigest))
                    return false;
            }
            catch {
                return false;
            }
            finally {
                await handle?.close().catch(() => undefined);
            }
        }
        return true;
    }
    async finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs) {
        const candidateDigest = sha256(canonicalJson(candidate));
        if (!(await this.pendingAgentSessionGraphFilesAreCurrent())) {
            throw new TaskMapNativeSourceChangedError("agent_session", "Agent graph input changed before authoritative publication");
        }
        // Plan2 work is inside the source barrier. A long Station or embedding
        // call cannot bind a candidate to source bytes that changed.
        await this.assertDefaultContextBarrierBindings(barrier, assessedAtMs);
        return {
            candidateDigest,
            candidate: candidate,
        };
    }
    async buildDefaultGraphCandidate(barrier, strategyFallback = null, assessedAtMs = this.nowMs(), meetingSemanticProducerReady = true, meetingContextProviderReady = false) {
        this.pendingRawGranolaCandidateReportDigest = null;
        // Authenticate context-only producers before any semantic work. A graph
        // builder failure must not hide a producer swap behind an unrelated
        // no-eligible-work or continuity result. The matching checks at each
        // return below close the second window while semantic work is running.
        await this.assertDefaultContextBarrierBindings(barrier, assessedAtMs);
        await this.afterDefaultContextBarrierForTesting?.();
        if (strategyFallback !== null) {
            const fixed = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
            if (fixed === null) {
                throw new TaskMapNativePublicationError("predecessor_continuity_required");
            }
            const baseCandidate = strategyFallbackCandidate(strategyFallback, fixed);
            // Strategy is not one of the four receipt-settled production families.
            // Retain the last verified bundle as stale/unavailable; never republish
            // it with old coverage under a newly successful refresh timestamp.
            void baseCandidate;
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
        const meetingSource = barrier.graphInput.sources.find((source) => source.source === "meeting_notes");
        const expectedOwnerScopeDigest = this.ownerScope.ownerScopeDigest;
        const calendarSemanticFragment = this.pendingCalendarResult?.availability === "available"
            && this.pendingCalendarExtraction !== null
            ? (0, calendar_refresh_llm_replay_js_1.buildTaskMapCalendarSemanticFragment)(this.pendingCalendarResult, this.pendingCalendarExtraction)
            : null;
        const candidateAcceptanceStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath: this.candidateAcceptanceStorePath,
            expectedOwnerScopeDigest,
        });
        if ((0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(candidateAcceptanceStore)
            !== barrier.graphInput.promotionReceiptHeadDigest) {
            throw new Error("candidate acceptance changed after the source barrier");
        }
        const agentSessionAdmission = admittedAgentSessionSemanticAdmission(barrier.graphInput);
        const planningPredecessor = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
        const authoritativeAgentPlan = await this.buildAuthoritativeAgentRootPlan(agentSessionAdmission, assessedAtMs, planningPredecessor?.projection ?? null);
        const predecessor = await readOptionalNativePredecessor(this.projectionPath, this.currentnessPath, this.ownerScope.ownerScopeDigest);
        if ((planningPredecessor === null) !== (predecessor === null)
            || (planningPredecessor !== null
                && predecessor !== null
                && taskMapProjectionDigest(planningPredecessor.projection)
                    !== taskMapProjectionDigest(predecessor.projection))) {
            throw new TaskMapNativePublicationError("predecessor_continuity_required");
        }
        const durableAgentSessionTaskProofs = mergeAcceptedAgentSessionTaskProofHistory(predecessor?.currentWork?.agentSessionTaskProofs ?? [], await readVerifiedHistoricalAgentSessionTaskProofs(this.projectionPath, this.ownerScope.ownerScopeDigest));
        if ((meetingSource === undefined
            || meetingSource.disposition !== "fresh"
            || meetingSource.revision === null
            || meetingSource.sliceDigest === null
            || meetingSource.value === null
            || (!meetingSemanticProducerReady
                && meetingContextProviderReady))
            && candidateAcceptanceStore === null
            && calendarSemanticFragment === null) {
            const agentSessionExtraction = this.pendingAgentSessionExtraction;
            const extractedAgentClusters = agentSessionExtraction?.clusters.filter((row) => row.status === "extracted" && row.mentions.length > 0) ?? [];
            if (agentSessionAdmission === null
                || extractedAgentClusters.length === 0) {
                // Calendar and Body are context-only. An unavailable work source is
                // not evidence that accepted work completed or disappeared. Keep the
                // exact verified owner generation; an owner without a predecessor
                // remains unavailable until a fresh authoritative work source can
                // either build work or explicitly prove there is none.
                if (predecessor === null) {
                    throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("invalid_freshness");
                }
                const candidate = agentSessionAdmission !== null
                    && agentSessionAdmission.clusters.length === 0
                    && (agentSessionExtraction?.pendingCount ?? 0) === 0
                    && isReplaceableAgentProposal(predecessor)
                    ? contextOnlyRetirementCandidate(barrier.graphInputDigest, barrier.graphInput, this.ownerScope.ownerScopeDigest, new Date(assessedAtMs).toISOString())
                    : preservedPredecessorPublicationCandidate(predecessor);
                return this.finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs);
            }
            const candidate = agentSessionPublicationCandidate(agentSessionAdmission, agentSessionExtraction, new Date(assessedAtMs).toISOString(), predecessor, this.ownerScope.ownerScopeDigest, barrier.graphInput, authoritativeAgentPlan);
            return this.finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs);
        }
        let producerResult = null;
        try {
            producerResult = (await this.readDefaultMeetingProducer(assessedAtMs)).result;
        }
        catch {
            if (this.pendingRawGranolaReport === null
                && candidateAcceptanceStore === null
                && calendarSemanticFragment === null) {
                throw new TaskMapNativeSourceChangedError("meeting_notes", "meeting evidence became unavailable after the source barrier");
            }
        }
        // The metadata-only collector is still the source barrier. Recollect it
        // after the authenticated semantic read so a file swap cannot bind a
        // candidate to different bytes than the coordinator observed.
        if (meetingSource?.disposition === "fresh"
            && meetingSource.revision !== null
            && meetingSource.sliceDigest !== null
            && meetingSource.value !== null) {
            let recheckedMeetingSlice;
            try {
                recheckedMeetingSlice = await collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, assessedAtMs, expectedOwnerScopeDigest);
            }
            catch {
                throw new TaskMapNativeSourceChangedError("meeting_notes", "meeting evidence became unavailable after semantic collection");
            }
            if (!nativeSafeSliceMatches(meetingSource, recheckedMeetingSlice)) {
                throw new TaskMapNativeSourceChangedError("meeting_notes", "meeting evidence changed after the source barrier");
            }
        }
        let rawGranolaFragment = null;
        await this.revalidatePendingRawGranolaReport(assessedAtMs);
        if (this.pendingRawGranolaReport !== null) {
            const fragment = (0, meeting_refresh_llm_replay_js_1.buildTaskMapGranolaSemanticFragment)(this.pendingRawGranolaReport);
            if (fragment.taskMapInput.pointers.length > 0) {
                rawGranolaFragment = fragment;
                this.pendingRawGranolaCandidateReportDigest =
                    this.pendingRawGranolaReport.reportDigest;
            }
        }
        let physiologicalContext;
        const bodySource = barrier.graphInput.sources.find((source) => source.source === "body");
        if (bodySource?.disposition === "fresh"
            && bodySource.value?.metadata.sourceSnapshotVersion
                === physiological_source_snapshot_js_1.TASKMAP_PHYSIOLOGICAL_SOURCE_SNAPSHOT_VERSION) {
            if (bodySource.revision === null
                || bodySource.sliceDigest === null) {
                throw new Error("fresh physiological evidence is incomplete");
            }
            const assessedAt = new Date(assessedAtMs).toISOString();
            const loadedPhysiological = await (0, physiological_source_snapshot_js_1.loadTaskMapPhysiologicalSourceSnapshot)(this.sourcePaths.physiologicalSnapshotPath, assessedAt, this.ownerScope.ownerScopeDigest);
            if (loadedPhysiological.decision !== "fresh"
                || loadedPhysiological.snapshot === null) {
                throw new Error("fresh physiological evidence is unavailable");
            }
            const recheckedBodySlice = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalOwnerSlice)(loadedPhysiological.snapshot, assessedAt, this.ownerScope.ownerScopeDigest);
            if (recheckedBodySlice.revision !== bodySource.revision
                || recheckedBodySlice.sliceDigest !== bodySource.sliceDigest
                || canonicalJson(recheckedBodySlice.value)
                    !== canonicalJson(bodySource.value)) {
                throw new Error("physiological evidence changed after the source barrier");
            }
            physiologicalContext = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalSemanticContext)(loadedPhysiological.snapshot, assessedAt, this.ownerScope.ownerScopeDigest);
        }
        const noEligibleWorkCandidate = () => {
            const extractedAgentClusters = this.pendingAgentSessionExtraction?.clusters.filter((row) => row.status === "extracted" && row.mentions.length > 0) ?? [];
            if (agentSessionAdmission !== null
                && this.pendingAgentSessionExtraction !== null
                && extractedAgentClusters.length > 0) {
                return agentSessionPublicationCandidate(agentSessionAdmission, this.pendingAgentSessionExtraction, new Date(assessedAtMs).toISOString(), predecessor, this.ownerScope.ownerScopeDigest, barrier.graphInput, authoritativeAgentPlan);
            }
            if (predecessor !== null && !isReplaceableAgentProposal(predecessor)) {
                return preservedPredecessorPublicationCandidate(predecessor);
            }
            if ((this.pendingAgentSessionExtraction?.pendingCount
                ?? this.pendingAgentExtractionUnavailableCount) > 0) {
                if (predecessor === null) {
                    throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("invalid_freshness");
                }
                return preservedPredecessorPublicationCandidate(predecessor);
            }
            return contextOnlyRetirementCandidate(barrier.graphInputDigest, barrier.graphInput, this.ownerScope.ownerScopeDigest, new Date(assessedAtMs).toISOString());
        };
        if (producerResult?.snapshot?.meetings.length === 0
            && rawGranolaFragment === null
            && calendarSemanticFragment === null
            && candidateAcceptanceStore === null) {
            const candidate = noEligibleWorkCandidate();
            return this.finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs);
        }
        let projection;
        const predecessorContainsAgentSession = predecessor !== null
            && predecessor.projection.sources.some((source) => source.sourceKind === "codex_session"
                || source.sourceKind === "claude_session");
        try {
            const semanticPredecessorProjection = predecessor === null
                || predecessor.projection.tasks.length === 0
                || predecessorContainsAgentSession
                ? null
                : predecessor.projection;
            const builderOptions = {
                expectedOwnerScopeDigest,
                ...(semanticPredecessorProjection === null
                    ? {}
                    : {
                        previousProjection: semanticPredecessorProjection,
                        previousProjectionDigest: taskMapProjectionDigest(semanticPredecessorProjection),
                    }),
            };
            if (producerResult !== null
                && rawGranolaFragment === null
                && calendarSemanticFragment === null
                && candidateAcceptanceStore === null) {
                projection = physiologicalContext === undefined
                    ? (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjectionFromMeetingProducerResult)(producerResult, builderOptions)
                    : (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjectionFromMeetingAndPhysiologicalContext)(producerResult, physiologicalContext, builderOptions).projection;
            }
            else {
                let semanticInput = producerResult === null
                    ? this.pendingRawGranolaReport === null
                        ? emptyTaskMapSemanticInputForAcceptedReceipts(expectedOwnerScopeDigest, new Date(assessedAtMs).toISOString())
                        : (0, meeting_refresh_llm_replay_js_1.taskMapNativeSemanticInputFromGranolaReport)(this.pendingRawGranolaReport)
                    : (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputFromMeetingProducerResult)(producerResult, expectedOwnerScopeDigest);
                if (producerResult !== null && rawGranolaFragment !== null) {
                    semanticInput = mergeTaskMapSemanticFragment(semanticInput, rawGranolaFragment);
                }
                if (calendarSemanticFragment !== null) {
                    semanticInput = mergeTaskMapSemanticFragment(semanticInput, calendarSemanticFragment);
                }
                if (candidateAcceptanceStore !== null) {
                    semanticInput =
                        (0, native_candidate_acceptance_js_1.mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput)(semanticInput, candidateAcceptanceStore);
                }
                if (physiologicalContext !== undefined) {
                    semanticInput = (0, native_semantic_builder_adapter_js_1.taskMapNativeSemanticInputWithPhysiologicalContext)(semanticInput, physiologicalContext, candidateAcceptanceStore ?? undefined);
                }
                projection = (0, native_semantic_builder_adapter_js_1.buildTaskMapNativeSemanticProjection)(semanticInput, {
                    ...builderOptions,
                    ...(candidateAcceptanceStore === null
                        ? {}
                        : { candidateAcceptanceStore }),
                });
            }
        }
        catch (error) {
            if (error instanceof native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError
                && error.code === "no_eligible_work") {
                const candidate = noEligibleWorkCandidate();
                return this.finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs);
            }
            if (error instanceof native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError
                && (error.code === "invalid_predecessor"
                    || error.code === "predecessor_continuity_required")) {
                throw new TaskMapNativePublicationError("predecessor_continuity_required");
            }
            throw error;
        }
        if (candidateAcceptanceStore !== null) {
            projection = bindCandidateAcceptancePersonalForkRoutes(projection, candidateAcceptanceStore);
        }
        const acceptedMixedSourcePredecessor = predecessorContainsAgentSession
            && predecessor !== null
            ? acceptedMembershipPredecessorProjection(predecessor.projection, new Set(projection.tasks.map((task) => task.id)))
            : null;
        if (acceptedMixedSourcePredecessor !== null) {
            projection = composeCurrentWorkProjections(projection, acceptedMixedSourcePredecessor);
        }
        const extractedAgentClusters = this.pendingAgentSessionExtraction?.clusters.filter((row) => row.status === "extracted" && row.mentions.length > 0) ?? [];
        const predecessorAgentCommunity = predecessor === null
            ? null
            : agentCommunitySubtreeOf(predecessor.projection);
        const mustRetainAgentCommunity = predecessorAgentCommunity !== null
            && (authoritativeAgentPlan.plan2Unavailable
                || agentSessionAdmission === null
                || this.pendingAgentSessionExtraction === null
                || extractedAgentClusters.length === 0);
        if (mustRetainAgentCommunity || (agentSessionAdmission !== null
            && this.pendingAgentSessionExtraction !== null
            && extractedAgentClusters.length > 0)) {
            // Degraded or retained Agent input is not evidence that its semantic
            // work disappeared. Preserve only the Agent community component of a
            // mixed predecessor; fresh Meeting/Calendar work remains replaceable.
            const agentOverlay = mustRetainAgentCommunity
                ? predecessorAgentCommunity
                : buildAgentSessionOnlyProjection(agentSessionAdmission, this.pendingAgentSessionExtraction, new Date(assessedAtMs).toISOString(), isReplaceableAgentProposal(predecessor)
                    ? predecessor.projection
                    : undefined, new Set(this.pendingAgentSessionExtraction.clusters.filter((row) => row.status === "degraded").map((row) => row.workstreamIdentityDigest)), authoritativeAgentPlan.currentRootPlan, authoritativeAgentPlan.rootEvidence, authoritativeAgentPlan.taskDigestion);
            if (agentOverlay === null) {
                throw new native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError("invalid_predecessor");
            }
            projection = composeCurrentWorkProjections(projection, agentOverlay);
        }
        const acceptedAgentSingletonsBeforeRecovery = predecessor === null
            ? new Set()
            : receiptBackedAcceptedAgentExternalSingletonTaskIds(predecessor.projection, candidateAcceptanceStore, durableAgentSessionTaskProofs, agentSessionAdmission);
        projection = restoreAcceptedAgentSessionTopicRecoveryRoots(agentSessionAdmission, this.pendingAgentSessionExtraction, candidateAcceptanceStore, projection, authoritativeAgentPlan.acceptedTopicLineage, durableAgentSessionTaskProofs, authoritativeAgentPlan.currentRootPlan, authoritativeAgentPlan.rootEvidence);
        projection = reconcileAcceptedAgentSessionTopicMembership(agentSessionAdmission, this.pendingAgentSessionExtraction, candidateAcceptanceStore, projection, authoritativeAgentPlan.acceptedTopicLineage, durableAgentSessionTaskProofs);
        const unresolvedAcceptedAgentSingletons = receiptBackedAcceptedAgentExternalSingletonTaskIds(projection, candidateAcceptanceStore, durableAgentSessionTaskProofs, agentSessionAdmission);
        if (acceptedAgentMigrationResultUnavailable(acceptedAgentSingletonsBeforeRecovery, unresolvedAcceptedAgentSingletons, new Set(projection.tasks.map((task) => task.id)), authoritativeAgentPlan.semanticRootsAvailable
            && authoritativeAgentPlan.acceptedTopicLineage.some((root) => root.members.length > 1))) {
            throw new TaskMapNativePublicationError("accepted_membership_migration_unavailable");
        }
        projection = finalizeTaskMapProjectionMutation(projection, "harness_rejected");
        const ranking = rankingForNativeGraphInput(projection, this.ownerScope.ownerScopeDigest, barrier.graphInput);
        const freshAgentSessionTaskProofs = acceptedAgentSessionTaskProofs(agentSessionAdmission, this.pendingAgentSessionExtraction, candidateAcceptanceStore, projection, ranking);
        const agentSessionTaskProofs = carryForwardAcceptedAgentSessionTaskProofs(freshAgentSessionTaskProofs, durableAgentSessionTaskProofs, candidateAcceptanceStore, projection, ranking);
        const primaryTaskId = ranking.rankedAcceptedOpen[0]?.taskId;
        const agentSessionEpisode = primaryTaskId === undefined
            ? null
            : agentSessionTaskProofs.find((row) => row.taskId === primaryTaskId)
                ?.episode ?? null;
        const candidate = {
            contractVersion: exports.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
            projection,
            currentness: currentnessForNativeProjection(projection, predecessor?.currentness ?? null),
            ranking,
            ...(agentSessionEpisode === null
                ? {}
                : { agentSessionEpisode }),
            ...(agentSessionAdmission === null || candidateAcceptanceStore === null
                ? {}
                : { agentSessionTaskProofs }),
        };
        return this.finalizeDefaultGraphCandidate(barrier, candidate, assessedAtMs);
    }
    async publishPendingBodySignalAssessment(candidateDigest, projection) {
        const pending = this.pendingBodySignalAssessment;
        if (pending === null)
            return;
        const document = pending.document;
        if (pending.candidateDigest !== candidateDigest
            || document.projection.runId !== projection.runId
            || document.projection.inputDigest !== projection.inputDigest
            || document.projection.projectionDigest
                !== taskMapProjectionDigest(projection)
            || document.artifactDigest
                !== bodySignalAssessmentDigest(document)
            || document.roots.length !== projection.roots.length
            || !sameStringSet(document.roots.map((root) => root.rootId), projection.roots.map((root) => root.id))) {
            throw new Error("Task Map body assessment does not match the verified projection");
        }
        const directory = node_path_1.default.dirname(this.bodySignalAssessmentPath);
        await atomicOwnerCanonicalWrite(directory, node_path_1.default.basename(this.bodySignalAssessmentPath), document);
        const written = await readOwnerOnlyJson(this.bodySignalAssessmentPath, MAX_TASKMAP_BODY_SIGNAL_ASSESSMENT_BYTES);
        if (canonicalJson(written.parsed) !== canonicalJson(document)
            || written.bytes.toString("utf8")
                !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(document)) {
            throw new Error("Task Map body assessment publication could not be verified");
        }
        this.pendingBodySignalAssessment = null;
    }
    requestRefresh(trigger) {
        // Cross-process overlap is strict one-at-a-time execution, not receipt
        // replay: a waiter reacquires after the owner exits and evaluates its own
        // trigger against durable state. Launch/timer requests usually collapse at
        // the success-based due gate; overlapping manual requests intentionally
        // serialize and may both execute.
        return this.executeWithLock(trigger);
    }
    /**
     * Reconcile only a durable publication generation. This is intentionally
     * separate from refresh so an application can repair a crash boundary
     * before any fixed-path reader is allowed to load Task Map artifacts.
     */
    async recoverPendingPublication() {
        const requestedAtMs = this.nowMs();
        if (!finiteTimestamp(requestedAtMs)) {
            throw new TypeError("Task Map native recovery time must be finite");
        }
        await ensurePrivateDirectory(this.runtimeRoot);
        await ensurePrivateDirectory(this.ownerScope.taskMapRoot);
        let acquired = null;
        while (true) {
            acquired = await tryAcquireTaskMapNativeLock(this.lockPath, "taskmap-native-refresh-lock.v2", this.readProcessStartMarker);
            if (acquired !== null)
                break;
            const waited = await this.waitForLockOwner(requestedAtMs);
            if (waited !== null) {
                throw new Error("Task Map publication recovery lock is unavailable");
            }
        }
        try {
            const recovered = await (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
                overlayPath: this.candidateAcceptanceStorePath,
                expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
            }, async () => {
                const currentHead = await this.readCandidateAcceptanceHeadDigest();
                return recoverPublicationPair(this.projectionPath, this.currentnessPath, this.publicationJournalPath, this.ownerScope.ownerScopeDigest, currentHead);
            });
            if (recovered === null)
                return false;
            const state = await loadState(this.statePath, this.ownerScope.ownerScopeDigest);
            state.lastAttemptAtMs = Math.max(state.lastAttemptAtMs ?? 0, recovered.requestedAtMs);
            state.lastSuccessfulRefreshAtMs = Math.max(state.lastSuccessfulRefreshAtMs ?? 0, recovered.requestedAtMs);
            state.lastRefreshStatus = "published";
            state.lastPublicationBlockReason = null;
            state.verifiedGraphInputDigest = recovered.graphInputDigest;
            state.verifiedCandidateDigest = recovered.candidateDigest;
            state.verifiedProjectionDigest = recovered.projectionDigest;
            state.verifiedRankingDigest = recovered.rankingDigest;
            state.processedPromotionReceiptHeadDigest =
                recovered.promotionReceiptHeadDigest;
            await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.candidatePath), {
                contractVersion: exports.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION,
                requestedAtMs: recovered.requestedAtMs,
                graphInputDigest: recovered.graphInputDigest,
                candidateDigest: recovered.candidateDigest,
                candidate: recovered.candidate,
            });
            await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
            await durableOwnerRemove(this.publicationJournalPath);
            return true;
        }
        finally {
            if (acquired !== null) {
                await removeTaskMapNativeLockGeneration(this.lockPath, acquired.generation, this.afterLockReceiptClaimForTesting);
            }
        }
    }
    collectSource(source, trigger, assessedAtMs) {
        const override = this.collectorOverrides[source];
        if (override !== undefined)
            return override();
        switch (source) {
            case "agent_session": {
                return collectAgentSessions(this.sourcePaths.agentSessionRoots, this.sourcePaths.agentSessionProducerSnapshotPath, assessedAtMs, this.ownerScope.ownerScopeDigest, true).then(({ slice, graphFeed, graphFileReceipts, graphMetrics, }) => {
                    this.pendingAgentSessionGraphFeed = graphFeed;
                    this.pendingAgentSessionGraphFileReceipts = graphFileReceipts;
                    this.pendingAgentSessionGraphMetrics = graphMetrics;
                    if (graphMetrics !== null) {
                        this.afterAgentSessionGraphCollectionForTesting?.(graphMetrics);
                    }
                    return slice;
                });
            }
            case "meeting_notes":
                return collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, assessedAtMs, this.ownerScope.ownerScopeDigest);
            case "calendar":
                {
                    return collectCalendar(this.sourcePaths.calendarExportPath, this.sourcePaths.googleCalendarSnapshotPath, assessedAtMs, this.ownerScope.ownerScopeDigest).then((result) => {
                        this.pendingCalendarProviderStatuses =
                            result.providerStatuses;
                        this.pendingCalendarResult = result.result;
                        if (result.slice === null) {
                            throw new Error("no fresh Calendar provider artifact is available");
                        }
                        return result.slice;
                    });
                }
            case "body": {
                const clock = () => new Date(assessedAtMs);
                return (0, physiological_source_snapshot_js_1.refreshTaskMapPhysiologicalSourceSnapshot)({
                    outputPath: this.sourcePaths.physiologicalSnapshotPath,
                    ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                    force: trigger === "manual",
                    clock,
                    ...(this.readPhysiologicalProviderContext === undefined
                        ? {}
                        : {
                            readProviderContext: this.readPhysiologicalProviderContext,
                        }),
                }).then((snapshot) => (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalOwnerSlice)(snapshot, new Date(assessedAtMs).toISOString(), this.ownerScope.ownerScopeDigest));
            }
        }
    }
    async executeWithLock(trigger) {
        const requestedAtMs = this.nowMs();
        if (!finiteTimestamp(requestedAtMs)) {
            throw new TypeError("Task Map native refresh time must be finite");
        }
        await ensurePrivateDirectory(this.runtimeRoot);
        let acquired = null;
        while (true) {
            acquired = await tryAcquireTaskMapNativeLock(this.lockPath, "taskmap-native-refresh-lock.v2", this.readProcessStartMarker);
            if (acquired !== null)
                break;
            this.afterLockAcquisitionMissForTesting?.();
            const coalesced = await this.waitForLockOwner(requestedAtMs);
            if (coalesced !== null)
                return coalesced;
        }
        try {
            this.activeRemoteRequestGroupId =
                `refresh_${(0, node_crypto_1.randomUUID)().replaceAll("-", "")}`;
            return await this.executeLocked(trigger, requestedAtMs);
        }
        finally {
            this.activeRemoteRequestGroupId = null;
            if (acquired !== null) {
                await removeTaskMapNativeLockGeneration(this.lockPath, acquired.generation, this.afterLockReceiptClaimForTesting);
            }
        }
    }
    async waitForLockOwner(waitingSinceMs) {
        const deadline = Date.now() + this.lockWaitMs;
        while (Date.now() < deadline) {
            const owner = await readTaskMapNativeLockOwner(this.lockPath, "taskmap-native-refresh-lock.v2");
            if (owner === null
                && await recoverEmptyTaskMapNativeLock(this.lockPath, "taskmap-native-refresh-lock.v2", this.readProcessStartMarker, this.afterEmptyLockRecoveryReceiptClaimForTesting)) {
                return null;
            }
            if (owner !== null) {
                const reclaim = !(await processLockOwnerIsCurrent(owner.pid, owner.processStartMarker, this.readProcessStartMarker));
                if (reclaim
                    && await removeTaskMapNativeLockGeneration(this.lockPath, owner.generation)) {
                    return null;
                }
            }
            await sleep(LOCK_POLL_MS);
            try {
                await (0, promises_1.lstat)(this.lockPath);
            }
            catch (error) {
                if (error.code === "ENOENT") {
                    return null;
                }
                throw error;
            }
        }
        const state = await loadState(this.statePath, this.ownerScope.ownerScopeDigest);
        await this.restoreIdentityAdjudicationStationStatus(state.lastSuccessfulRefreshAtMs);
        await this.restoreDecompositionStationStatus(state.lastSuccessfulRefreshAtMs);
        state.calendarProviderStatuses = ageCalendarProviderStatuses(state.calendarProviderStatuses, waitingSinceMs);
        return {
            status: "partial",
            refreshStatus: "unavailable",
            sourceStatuses: sourceReceiptStatuses(state.lastSourceStatuses, state.lastSourceSuccessAtMs, state.calendarProviderStatuses),
            calendarProviderStatuses: state.calendarProviderStatuses,
            stationStatuses: this.stationStatuses(),
            requestedAtMs: waitingSinceMs,
            nextDueAtMs: waitingSinceMs,
            publicationVerified: false,
            publicationBlockReason: "publication_failed",
        };
    }
    async executeLocked(trigger, requestedAtMs) {
        this.pendingAgentSessionGraphFeed =
            this.agentSessionGraphFeedForTesting ?? null;
        this.pendingAgentSessionGraphFileReceipts = [];
        this.pendingAgentSessionGraphMetrics = null;
        await ensurePrivateDirectory(this.ownerScope.taskMapRoot);
        const obsoleteCommunitySidecarPath = node_path_1.default.join(this.runtimeRoot, "taskmap-community-shadow.v1.json");
        await durableOwnerRemove(obsoleteCommunitySidecarPath);
        try {
            await (0, promises_1.lstat)(obsoleteCommunitySidecarPath);
            throw new Error("obsolete Task Map community sidecar still exists");
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        let capturedPromotionReceiptHeadDigest = await this.readCandidateAcceptanceHeadDigest();
        if (!/^[a-f0-9]{64}$/.test(capturedPromotionReceiptHeadDigest)) {
            throw new Error("Task Map promotion receipt head is unavailable");
        }
        const state = await loadState(this.statePath, this.ownerScope.ownerScopeDigest);
        await this.restoreIdentityAdjudicationStationStatus(state.lastSuccessfulRefreshAtMs);
        await this.restoreDecompositionStationStatus(state.lastSuccessfulRefreshAtMs);
        state.calendarProviderStatuses = ageCalendarProviderStatuses(state.calendarProviderStatuses, requestedAtMs);
        state.lastSourceStatuses = exactSourceStatuses(state.lastSourceStatuses);
        try {
            const recovered = await (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
                overlayPath: this.candidateAcceptanceStorePath,
                expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
            }, async () => {
                capturedPromotionReceiptHeadDigest =
                    await this.readCandidateAcceptanceHeadDigest();
                return recoverPublicationPair(this.projectionPath, this.currentnessPath, this.publicationJournalPath, this.ownerScope.ownerScopeDigest, capturedPromotionReceiptHeadDigest);
            });
            if (recovered !== null) {
                state.lastAttemptAtMs = Math.max(state.lastAttemptAtMs ?? 0, recovered.requestedAtMs);
                state.lastSuccessfulRefreshAtMs = Math.max(state.lastSuccessfulRefreshAtMs ?? 0, recovered.requestedAtMs);
                state.lastRefreshStatus = "published";
                state.lastPublicationBlockReason = null;
                state.verifiedGraphInputDigest = recovered.graphInputDigest;
                state.verifiedCandidateDigest = recovered.candidateDigest;
                state.verifiedProjectionDigest = recovered.projectionDigest;
                state.verifiedRankingDigest = recovered.rankingDigest;
                state.processedPromotionReceiptHeadDigest =
                    recovered.promotionReceiptHeadDigest;
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.candidatePath), {
                    contractVersion: exports.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION,
                    requestedAtMs: recovered.requestedAtMs,
                    graphInputDigest: recovered.graphInputDigest,
                    candidateDigest: recovered.candidateDigest,
                    candidate: recovered.candidate,
                });
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
                await durableOwnerRemove(this.publicationJournalPath);
            }
        }
        catch {
            state.lastAttemptAtMs = requestedAtMs;
            state.lastRefreshStatus = "unavailable";
            state.lastPublicationBlockReason = "publication_failed";
            await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
            const response = {
                status: "partial",
                refreshStatus: "unavailable",
                sourceStatuses: sourceReceiptStatuses(state.lastSourceStatuses, state.lastSourceSuccessAtMs, state.calendarProviderStatuses),
                calendarProviderStatuses: state.calendarProviderStatuses,
                stationStatuses: this.stationStatuses(),
                requestedAtMs,
                nextDueAtMs: state.lastSuccessfulRefreshAtMs === null
                    ? requestedAtMs
                    : state.lastSuccessfulRefreshAtMs
                        + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
                publicationVerified: false,
                publicationBlockReason: "publication_failed",
                semanticGroupingRetention: null,
            };
            await this.writeStatus(response, {
                candidateDigest: state.verifiedCandidateDigest,
                projectionDigest: state.verifiedProjectionDigest,
                failureStage: "publication",
            });
            return response;
        }
        const persistDefaultUnavailable = async (statuses, meetingInputReady, blockReason = "semantic_provider_unavailable", forcedUnavailableSource = null) => {
            const sourceDispositions = exactSourceStatuses(statuses).map((status) => status.source === "meeting_notes" && !meetingInputReady
                ? { ...status, disposition: "unavailable" }
                : status);
            state.lastAttemptAtMs = requestedAtMs;
            state.lastRefreshStatus = "unavailable";
            state.lastPublicationBlockReason = blockReason;
            state.lastSourceStatuses = sourceDispositions;
            await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
            const response = {
                status: "partial",
                refreshStatus: "unavailable",
                sourceStatuses: sourceReceiptStatuses(sourceDispositions, state.lastSourceSuccessAtMs, state.calendarProviderStatuses, forcedUnavailableSource === null
                    ? new Set()
                    : new Set([forcedUnavailableSource])),
                calendarProviderStatuses: state.calendarProviderStatuses,
                stationStatuses: this.stationStatuses(),
                requestedAtMs,
                nextDueAtMs: requestedAtMs,
                publicationVerified: false,
                publicationBlockReason: blockReason,
                semanticGroupingRetention: await this.semanticGroupingRetention(blockReason),
            };
            await this.writeStatus(response, {
                candidateDigest: state.verifiedCandidateDigest,
                projectionDigest: state.verifiedProjectionDigest,
                failureStage: "graph_builder",
            });
            return response;
        };
        let defaultProducerValidThroughMs = null;
        let defaultProducerReady = !this.usesDefaultGraphBuilder;
        let defaultMeetingSliceAtRequest = null;
        let defaultStrategyFallbackAtRequest = null;
        let defaultStrategyFallbackFailed = false;
        let meetingExtractionDegradationDecision;
        if (this.usesDefaultGraphBuilder) {
            this.pendingRawGranolaReport = null;
            try {
                const rawEvidenceBefore = await resolveCurrentTaskMapOwnerGranolaEvidence(this.rawGranolaSnapshotPath, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                await ensurePrivateDirectory(this.ownerScope.taskMapRoot);
                const generatedRawReport = await (0, meeting_refresh_llm_replay_js_1.refreshTaskMapGranolaMeetingExtraction)({
                    snapshotPath: this.rawGranolaSnapshotPath,
                    taskMapRoot: this.ownerScope.taskMapRoot,
                    runtimeRoot: this.runtimeRoot,
                    ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                    promptTemplatePath: this.meetingExtractionPromptTemplatePath,
                    assessedAt: new Date(requestedAtMs).toISOString(),
                    createStation: this.llmStationFactory(this.createMeetingExtractionStation),
                });
                const rawEvidenceAfter = await resolveCurrentTaskMapOwnerGranolaEvidence(this.rawGranolaSnapshotPath, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                if (rawEvidenceAfter.snapshotDigest
                    !== rawEvidenceBefore.snapshotDigest
                    || rawEvidenceAfter.successAtMs !== rawEvidenceBefore.successAtMs
                    || rawEvidenceAfter.validThroughMs
                        !== rawEvidenceBefore.validThroughMs) {
                    throw new TaskMapNativeSourceChangedError("meeting_notes", "Granola evidence changed during raw extraction");
                }
                this.pendingRawGranolaReport = generatedRawReport;
                meetingExtractionDegradationDecision =
                    reportWideMeetingExtractionDegradationCode(generatedRawReport);
            }
            catch {
                this.pendingRawGranolaReport = null;
            }
            if (meetingExtractionDegradationDecision !== undefined) {
                state.lastSourceStatuses = withMeetingExtractionDegradationCode(state.lastSourceStatuses, meetingExtractionDegradationDecision);
            }
            try {
                defaultMeetingSliceAtRequest = await collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                defaultProducerValidThroughMs =
                    meetingSliceGranolaValidThroughMs(defaultMeetingSliceAtRequest);
            }
            catch {
                defaultMeetingSliceAtRequest = null;
            }
            try {
                defaultProducerValidThroughMs = (await this.readDefaultMeetingProducer(requestedAtMs)).validThroughMs;
                defaultProducerReady = true;
                const granolaValidThroughMs = meetingSliceGranolaValidThroughMs(defaultMeetingSliceAtRequest);
                if (granolaValidThroughMs !== null) {
                    defaultProducerValidThroughMs = Math.min(defaultProducerValidThroughMs, granolaValidThroughMs);
                }
            }
            catch {
                defaultProducerReady = this.pendingRawGranolaReport !== null;
                if (defaultProducerReady) {
                    defaultProducerValidThroughMs =
                        meetingSliceGranolaValidThroughMs(defaultMeetingSliceAtRequest)
                            ?? requestedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS;
                }
                else if (!meetingSliceHasCurrentGranola(defaultMeetingSliceAtRequest)
                    && this.strategyFallback !== undefined) {
                    try {
                        defaultStrategyFallbackAtRequest =
                            await this.readDefaultStrategyFallback();
                    }
                    catch {
                        defaultStrategyFallbackFailed = true;
                    }
                }
            }
        }
        const boundedNextDueAt = (intervalDueAt) => defaultProducerValidThroughMs === null
            ? intervalDueAt
            : Math.min(intervalDueAt, defaultProducerValidThroughMs);
        let dueShortcutEligible = trigger !== "manual"
            && state.processedPromotionReceiptHeadDigest
                === capturedPromotionReceiptHeadDigest
            && state.lastRefreshStatus !== "unavailable"
            && state.lastSuccessfulRefreshAtMs !== null
            && requestedAtMs
                < state.lastSuccessfulRefreshAtMs
                    + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS
            && (!this.usesDefaultGraphBuilder
                || ((defaultProducerReady
                    || meetingSliceHasCurrentGranola(defaultMeetingSliceAtRequest))
                    &&
                        defaultMeetingSliceAtRequest !== null
                    && state.sources.meeting_notes !== undefined
                    && defaultMeetingSliceAtRequest.revision
                        === state.sources.meeting_notes.revision
                    && defaultMeetingSliceAtRequest.sliceDigest
                        === state.sources.meeting_notes.sliceDigest));
        if (dueShortcutEligible && this.usesDefaultGraphBuilder) {
            try {
                if (defaultProducerReady) {
                    const semanticValidThroughMs = (await this.readDefaultMeetingProducer(requestedAtMs)).validThroughMs;
                    defaultProducerValidThroughMs =
                        defaultProducerValidThroughMs === null
                            ? semanticValidThroughMs
                            : Math.min(defaultProducerValidThroughMs, semanticValidThroughMs);
                }
                const recheckedMeetingSlice = await collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                if (defaultMeetingSliceAtRequest === null
                    || (!defaultProducerReady
                        && !meetingSliceHasCurrentGranola(recheckedMeetingSlice))
                    || recheckedMeetingSlice.revision
                        !== defaultMeetingSliceAtRequest.revision
                    || recheckedMeetingSlice.sliceDigest
                        !== defaultMeetingSliceAtRequest.sliceDigest) {
                    dueShortcutEligible = false;
                }
            }
            catch {
                if (this.pendingRawGranolaReport === null) {
                    dueShortcutEligible = false;
                    defaultProducerReady = false;
                    defaultProducerValidThroughMs = null;
                }
                else if (capturedPromotionReceiptHeadDigest
                    !== (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null)
                    && !defaultProducerReady) {
                    if (await this.readCandidateAcceptanceHeadDigest()
                        !== capturedPromotionReceiptHeadDigest) {
                        throw new Error("candidate acceptance changed during no-op validation");
                    }
                }
                else {
                    const recheckedMeetingSlice = await collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                    if (defaultMeetingSliceAtRequest === null
                        || recheckedMeetingSlice.revision
                            !== defaultMeetingSliceAtRequest.revision
                        || recheckedMeetingSlice.sliceDigest
                            !== defaultMeetingSliceAtRequest.sliceDigest) {
                        dueShortcutEligible = false;
                    }
                }
            }
        }
        if (dueShortcutEligible) {
            if (await this.readCandidateAcceptanceHeadDigest()
                !== capturedPromotionReceiptHeadDigest) {
                dueShortcutEligible = false;
            }
        }
        if (dueShortcutEligible) {
            let refreshStatus = "unavailable";
            let publicationBlockReason = state.lastPublicationBlockReason ?? "publication_failed";
            if (state.lastRefreshStatus === "no_op"
                && state.verifiedGraphInputDigest !== null
                && state.verifiedCandidateDigest === null
                && state.verifiedProjectionDigest === null) {
                refreshStatus = "no_op";
                publicationBlockReason = null;
            }
            else if (state.verifiedProjectionDigest !== null
                && state.lastRefreshStatus !== "unavailable") {
                try {
                    const verified = await readVerifiedPublicationBundle(this.projectionPath, this.currentnessPath, state.verifiedProjectionDigest, true, this.ownerScope.ownerScopeDigest);
                    if (state.verifiedRankingDigest !== null
                        && verified.ranking?.artifactDigest
                            !== state.verifiedRankingDigest) {
                        throw new TaskMapNativePublicationError("publication_failed");
                    }
                    refreshStatus = "no_op";
                    publicationBlockReason = null;
                }
                catch (error) {
                    refreshStatus = "unavailable";
                    publicationBlockReason =
                        error instanceof TaskMapNativePublicationError
                            ? error.reason
                            : "publication_failed";
                }
            }
            const response = {
                status: refreshStatus === "unavailable"
                    || hasRemoteConsentRequired(state.lastSourceStatuses)
                    ? "partial"
                    : "ok",
                refreshStatus,
                sourceStatuses: sourceReceiptStatuses(state.lastSourceStatuses, state.lastSourceSuccessAtMs, state.calendarProviderStatuses),
                calendarProviderStatuses: state.calendarProviderStatuses,
                stationStatuses: this.stationStatuses(),
                requestedAtMs,
                nextDueAtMs: refreshStatus === "unavailable"
                    ? requestedAtMs
                    : boundedNextDueAt(state.lastSuccessfulRefreshAtMs
                        + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS),
                publicationVerified: refreshStatus === "no_op"
                    && state.verifiedProjectionDigest !== null,
                publicationBlockReason,
            };
            if (refreshStatus === "unavailable") {
                state.lastAttemptAtMs = requestedAtMs;
                state.lastRefreshStatus = "unavailable";
                state.lastPublicationBlockReason = publicationBlockReason;
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
            }
            else if (meetingExtractionDegradationDecision !== undefined) {
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
            }
            await this.writeStatus(response, {
                candidateDigest: state.verifiedCandidateDigest,
                projectionDigest: state.verifiedProjectionDigest,
                failureStage: refreshStatus === "unavailable" ? "publication" : null,
            });
            return response;
        }
        this.pendingBodySignalAssessment = null;
        this.pendingCalendarProviderStatuses = null;
        this.pendingAgentSessionExtraction = null;
        this.pendingCalendarExtraction = null;
        this.pendingCalendarResult = null;
        this.pendingAgentExtractionUnavailableCount = 0;
        this.pendingCalendarExtractionUnavailableCount = 0;
        this.pendingAgentExtractionUnavailableCode = "runner_failure";
        this.pendingCalendarExtractionUnavailableCode = "runner_failure";
        const freshSlices = new Map();
        const collectors = Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
            source,
            async () => {
                const fresh = await this.collectSource(source, trigger, requestedAtMs);
                freshSlices.set(source, fresh);
                return fresh;
            },
        ]));
        let graphBuilderBlockReason = null;
        let graphBuilderNoEligibleWork = false;
        let sourceBindingFailure = null;
        let defaultGraphBarrierForPublication = null;
        let identityProposalArtifact = null;
        let decompositionProposalArtifact = null;
        const defaultIdentityBarrierForRefresh = { current: null };
        const coordinator = new owner_refresh_coordinator_js_1.TaskMapOwnerRefreshCoordinator({
            expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
            collectors,
            identityDedupeBarrier: async (input) => {
                const barrier = await identityDedupeBarrier(input, capturedPromotionReceiptHeadDigest, defaultStrategyFallbackAtRequest === null
                    ? undefined
                    : {
                        strategyProofDigest: defaultStrategyFallbackAtRequest.strategyProofDigest,
                        predecessorEvidenceBindingDigest: defaultStrategyFallbackAtRequest
                            .predecessorEvidenceBindingDigest,
                    });
                defaultIdentityBarrierForRefresh.current = barrier;
                return barrier;
            },
            graphBuilder: async (input) => {
                try {
                    if (this.usesDefaultGraphBuilder
                        && defaultStrategyFallbackFailed) {
                        throw new TaskMapNativePublicationError("predecessor_continuity_required");
                    }
                    if (this.usesDefaultGraphBuilder) {
                        defaultGraphBarrierForPublication = input;
                        await this.refreshPendingStationExtractions(input.graphInput, requestedAtMs);
                        const built = await this.buildDefaultGraphCandidate(input, defaultStrategyFallbackAtRequest, requestedAtMs, defaultProducerReady, input.graphInput.sources.find((source) => source.source === "meeting_notes")?.value?.metadata.granolaCurrent === true);
                        const publicationCandidate = built.candidate;
                        return built;
                    }
                    return await this.graphBuilder(input);
                }
                catch (error) {
                    if (error instanceof TaskMapNativePublicationError) {
                        graphBuilderBlockReason = error.reason;
                    }
                    else if (error instanceof TaskMapNativeSourceChangedError) {
                        sourceBindingFailure = error.source;
                    }
                    else if (error instanceof native_semantic_builder_adapter_js_1.TaskMapNativeSemanticBuilderUnavailableError
                        && error.code === "no_eligible_work") {
                        graphBuilderNoEligibleWork = true;
                    }
                    throw error;
                }
            },
        });
        for (const source of owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES) {
            const retained = state.sources[source];
            if (retained !== undefined) {
                coordinator.restoreLastGoodSource(source, retained);
            }
        }
        if (state.verifiedGraphInputDigest !== null
            && state.verifiedCandidateDigest !== null
            && state.verifiedProjectionDigest !== null
            && !state.lastSourceStatuses.some((status) => (status.source === "agent_session" || status.source === "calendar")
                && Number.isSafeInteger(status.stationPendingCount)
                && (status.stationPendingCount ?? 0) > 0)) {
            try {
                const verified = await readVerifiedPublicationBundle(this.projectionPath, this.currentnessPath, state.verifiedProjectionDigest, true, this.ownerScope.ownerScopeDigest);
                if (state.verifiedRankingDigest !== null
                    && verified.ranking?.artifactDigest !== state.verifiedRankingDigest) {
                    throw new TaskMapNativePublicationError("publication_failed");
                }
                coordinator.acknowledgeVerifiedPublication({
                    graphInputDigest: state.verifiedGraphInputDigest,
                    candidateDigest: state.verifiedCandidateDigest,
                    candidate: verified.projection,
                }, state.lastSuccessfulRefreshAtMs ?? requestedAtMs);
            }
            catch {
                state.lastRefreshStatus = "unavailable";
            }
        }
        const result = await coordinator.requestRefresh({
            trigger,
            nowMs: requestedAtMs,
        });
        if (sourceBindingFailure !== null) {
            freshSlices.delete(sourceBindingFailure);
        }
        let defaultMeetingInputReady = !this.usesDefaultGraphBuilder
            || defaultProducerReady
            || meetingSliceHasCurrentGranola(freshSlices.get("meeting_notes"));
        const persistedMeetingExtractionDegradationCode = state.lastSourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode ?? null;
        let effectiveSourceStatuses = withStationExtractionStatuses(withMeetingExtractionDegradationCode(result.sourceStatuses.map((status) => status.source === sourceBindingFailure
            || (status.source === "meeting_notes"
                && this.usesDefaultGraphBuilder
                && !defaultMeetingInputReady)
            ? { ...status, disposition: "unavailable" }
            : status), persistedMeetingExtractionDegradationCode), this.pendingAgentSessionExtraction, this.pendingCalendarExtraction, this.pendingAgentExtractionUnavailableCount, this.pendingCalendarExtractionUnavailableCount, this.pendingAgentExtractionUnavailableCode, this.pendingCalendarExtractionUnavailableCode);
        const calendarProviderStatusesBeforeContextValidation = state.calendarProviderStatuses.map((status) => ({ ...status }));
        if (this.pendingCalendarProviderStatuses !== null
            && sourceBindingFailure !== "calendar") {
            state.calendarProviderStatuses = mergeCalendarProviderStatuses(state.calendarProviderStatuses, this.pendingCalendarProviderStatuses);
        }
        if (this.usesDefaultGraphBuilder && result.status === "no_op") {
            try {
                await this.assertDefaultContextFreshSlices(freshSlices, requestedAtMs);
                if (defaultStrategyFallbackAtRequest !== null) {
                    const rechecked = await this.readDefaultStrategyFallback();
                    if (rechecked.strategyProofDigest
                        !== defaultStrategyFallbackAtRequest.strategyProofDigest
                        || rechecked.predecessorEvidenceBindingDigest
                            !== defaultStrategyFallbackAtRequest
                                .predecessorEvidenceBindingDigest) {
                        throw new Error("Strategy evidence changed during no-op validation");
                    }
                    await this.assertDefaultStrategyFallbackFixedPredecessor(rechecked);
                }
                else {
                    const emptyPromotionReceiptHeadDigest = (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(null);
                    if (capturedPromotionReceiptHeadDigest
                        !== emptyPromotionReceiptHeadDigest
                        && await this.readCandidateAcceptanceHeadDigest()
                            !== capturedPromotionReceiptHeadDigest) {
                        throw new Error("candidate acceptance changed during no-op validation");
                    }
                    const originalMeetingSlice = freshSlices.get("meeting_notes");
                    if (this.pendingRawGranolaReport !== null) {
                        if (await this.revalidatePendingRawGranolaReport(requestedAtMs)
                            === null) {
                            throw new TaskMapNativeSourceChangedError("meeting_notes", "Granola extraction changed during no-op validation");
                        }
                    }
                    else if (defaultProducerReady) {
                        await this.readDefaultMeetingProducer(requestedAtMs);
                    }
                    else if (!meetingSliceHasCurrentGranola(originalMeetingSlice)
                        && capturedPromotionReceiptHeadDigest
                            === emptyPromotionReceiptHeadDigest) {
                        throw new Error("fresh meeting evidence is unavailable during no-op validation");
                    }
                    if (originalMeetingSlice !== undefined) {
                        const recheckedMeetingSlice = await collectMeetingNotes(this.sourcePaths.meetingSnapshotPaths, this.sourcePaths.residentReceiptPath, requestedAtMs, this.ownerScope.ownerScopeDigest);
                        if ((!defaultProducerReady
                            && this.pendingRawGranolaReport === null
                            && capturedPromotionReceiptHeadDigest
                                === emptyPromotionReceiptHeadDigest
                            && !meetingSliceHasCurrentGranola(recheckedMeetingSlice))
                            || originalMeetingSlice.revision
                                !== recheckedMeetingSlice.revision
                            || originalMeetingSlice.sliceDigest
                                !== recheckedMeetingSlice.sliceDigest) {
                            throw new TaskMapNativeSourceChangedError("meeting_notes", "meeting evidence changed during no-op validation");
                        }
                    }
                    else if (defaultProducerReady
                        || capturedPromotionReceiptHeadDigest
                            === emptyPromotionReceiptHeadDigest) {
                        throw new TaskMapNativeSourceChangedError("meeting_notes", "meeting evidence became unavailable during no-op validation");
                    }
                }
            }
            catch (error) {
                if (!(error instanceof TaskMapNativeSourceChangedError)
                    || error.source === "meeting_notes") {
                    defaultMeetingInputReady = false;
                }
                if (error instanceof TaskMapNativeSourceChangedError) {
                    sourceBindingFailure = error.source;
                    freshSlices.delete(error.source);
                    if (error.source === "meeting_notes") {
                        defaultMeetingInputReady = false;
                    }
                    effectiveSourceStatuses = effectiveSourceStatuses.map((status) => status.source === error.source
                        ? {
                            ...status,
                            disposition: "unavailable",
                        }
                        : status);
                    if (error.source === "calendar") {
                        state.calendarProviderStatuses =
                            calendarProviderStatusesBeforeContextValidation;
                    }
                }
                recordSourceSuccesses(state, freshSlices, requestedAtMs, defaultMeetingInputReady);
                return persistDefaultUnavailable(effectiveSourceStatuses, defaultMeetingInputReady, defaultStrategyFallbackAtRequest === null
                    ? "semantic_provider_unavailable"
                    : "predecessor_continuity_required", sourceBindingFailure);
            }
        }
        const lastSourceSuccessBeforePublication = {
            ...state.lastSourceSuccessAtMs,
        };
        recordSourceSuccesses(state, freshSlices, requestedAtMs, defaultMeetingInputReady);
        if (result.status === "no_op"
            && state.verifiedProjectionDigest !== null) {
            try {
                const verified = await readVerifiedPublicationBundle(this.projectionPath, this.currentnessPath, state.verifiedProjectionDigest, true, this.ownerScope.ownerScopeDigest);
                if (state.verifiedRankingDigest !== null
                    && verified.ranking?.artifactDigest !== state.verifiedRankingDigest) {
                    throw new TaskMapNativePublicationError("publication_failed");
                }
            }
            catch (error) {
                const publicationBlockReason = error instanceof TaskMapNativePublicationError
                    ? error.reason
                    : "publication_failed";
                state.lastAttemptAtMs = requestedAtMs;
                state.lastRefreshStatus = "unavailable";
                state.lastPublicationBlockReason = publicationBlockReason;
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
                const response = {
                    status: "partial",
                    refreshStatus: "unavailable",
                    sourceStatuses: sourceReceiptStatuses(effectiveSourceStatuses, state.lastSourceSuccessAtMs, state.calendarProviderStatuses),
                    calendarProviderStatuses: state.calendarProviderStatuses,
                    stationStatuses: this.stationStatuses(),
                    requestedAtMs,
                    nextDueAtMs: requestedAtMs,
                    publicationVerified: false,
                    publicationBlockReason,
                };
                await this.writeStatus(response, {
                    candidateDigest: state.verifiedCandidateDigest,
                    projectionDigest: state.verifiedProjectionDigest,
                    failureStage: "publication",
                });
                return response;
            }
        }
        let sourceDispositions = exactSourceStatuses(effectiveSourceStatuses);
        state.lastAttemptAtMs = requestedAtMs;
        state.lastSourceStatuses = sourceDispositions;
        let nextDueAtMs = state.lastSuccessfulRefreshAtMs === null
            ? requestedAtMs
            : boundedNextDueAt(state.lastSuccessfulRefreshAtMs
                + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
        let refreshStatus = "unavailable";
        let projectionDigest = state.verifiedProjectionDigest;
        let publicationBlockReason = result.failureStage === "graph_builder"
            ? graphBuilderBlockReason ?? "semantic_provider_unavailable"
            : result.failureStage === "identity_dedupe_barrier"
                ? "publication_failed"
                : null;
        let failureStage = result.failureStage;
        if (result.status === "no_op") {
            if (await this.readCandidateAcceptanceHeadDigest()
                !== capturedPromotionReceiptHeadDigest) {
                return persistDefaultUnavailable(effectiveSourceStatuses, defaultMeetingInputReady, "publication_failed");
            }
            refreshStatus = "no_op";
            state.lastSuccessfulRefreshAtMs = requestedAtMs;
            state.lastRefreshStatus = refreshStatus;
            state.lastPublicationBlockReason = null;
            state.processedPromotionReceiptHeadDigest =
                capturedPromotionReceiptHeadDigest;
            publicationBlockReason = null;
            nextDueAtMs = boundedNextDueAt(requestedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
            for (const [source, slice] of freshSlices) {
                state.sources[source] = slice;
            }
        }
        else if (result.status === "blocked"
            && result.failureStage === "graph_builder"
            && graphBuilderNoEligibleWork) {
            if (await this.readCandidateAcceptanceHeadDigest()
                !== capturedPromotionReceiptHeadDigest) {
                return persistDefaultUnavailable(effectiveSourceStatuses, defaultMeetingInputReady, "publication_failed");
            }
            refreshStatus = "no_op";
            failureStage = null;
            publicationBlockReason = null;
            projectionDigest = null;
            state.lastSuccessfulRefreshAtMs = requestedAtMs;
            state.lastRefreshStatus = refreshStatus;
            state.lastPublicationBlockReason = null;
            state.verifiedGraphInputDigest = result.graphInputDigest;
            state.verifiedCandidateDigest = null;
            state.verifiedProjectionDigest = null;
            state.verifiedRankingDigest = null;
            state.processedPromotionReceiptHeadDigest =
                capturedPromotionReceiptHeadDigest;
            nextDueAtMs = boundedNextDueAt(requestedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
            for (const [source, slice] of freshSlices) {
                state.sources[source] = slice;
            }
        }
        else if (result.status === "publication_candidate_ready"
            && result.publicationCandidate !== null) {
            try {
                if (await this.readCandidateAcceptanceHeadDigest()
                    !== capturedPromotionReceiptHeadDigest) {
                    throw new TaskMapNativePublicationError("publication_failed");
                }
                if (this.usesDefaultGraphBuilder
                    && this.pendingRawGranolaCandidateReportDigest !== null) {
                    const usedRawReportDigest = this.pendingRawGranolaCandidateReportDigest;
                    const currentRawReport = await this.revalidatePendingRawGranolaReport(requestedAtMs);
                    if (currentRawReport?.reportDigest !== usedRawReportDigest) {
                        if (defaultGraphBarrierForPublication === null) {
                            throw new TaskMapNativePublicationError("publication_failed");
                        }
                        const replacement = await this.buildDefaultGraphCandidate(defaultGraphBarrierForPublication, defaultStrategyFallbackAtRequest, requestedAtMs);
                        const replacementGraphInputDigest = result.publicationCandidate.graphInputDigest;
                        result.publicationCandidate = {
                            graphInputDigest: replacementGraphInputDigest,
                            candidateDigest: replacement.candidateDigest,
                            candidate: replacement.candidate,
                        };
                    }
                }
                await preflightTaskMapNativePublicationCandidate(this.projectionPath, this.currentnessPath, result.publicationCandidate.graphInputDigest, result.publicationCandidate.candidateDigest, result.publicationCandidate.candidate, this.ownerScope.ownerScopeDigest);
                const preflightCandidate = verifiedNativePublicationCandidate(result.publicationCandidate.candidate, this.ownerScope.ownerScopeDigest);
                if (this.usesDefaultGraphBuilder) {
                    identityProposalArtifact =
                        await this.refreshIdentityAdjudicationStation(preflightCandidate.projection, requestedAtMs);
                    decompositionProposalArtifact =
                        await this.refreshDecompositionStation(preflightCandidate.projection, requestedAtMs);
                }
                if ((this.usesDefaultGraphBuilder
                    && preflightCandidate.ranking === undefined)
                    || (preflightCandidate.ranking !== undefined
                        && preflightCandidate.ranking.ownerScopeDigest
                            !== this.ownerScope.ownerScopeDigest)) {
                    throw new TaskMapNativePublicationError("loader_incompatible");
                }
                if (this.usesDefaultGraphBuilder) {
                    await this.assertDefaultContextFreshSlices(freshSlices, requestedAtMs);
                    await this.afterDefaultContextFreshSlicesForTesting?.();
                    if (this.pendingRawGranolaCandidateReportDigest !== null) {
                        const usedRawReportDigest = this.pendingRawGranolaCandidateReportDigest;
                        const finalRawReport = await this.revalidatePendingRawGranolaReport(requestedAtMs);
                        if (finalRawReport?.reportDigest !== usedRawReportDigest) {
                            throw new TaskMapNativePublicationError("publication_failed");
                        }
                    }
                    if (defaultStrategyFallbackAtRequest !== null) {
                        await this.assertDefaultStrategyFallbackFixedPredecessor(defaultStrategyFallbackAtRequest);
                    }
                }
                const published = await (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
                    overlayPath: this.candidateAcceptanceStorePath,
                    expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
                }, async () => {
                    if (await this.readCandidateAcceptanceHeadDigest()
                        !== capturedPromotionReceiptHeadDigest) {
                        throw new TaskMapNativePublicationError("publication_failed");
                    }
                    return this.publisher({
                        graphInputDigest: result.publicationCandidate.graphInputDigest,
                        candidateDigest: result.publicationCandidate.candidateDigest,
                        candidate: result.publicationCandidate.candidate,
                        requestedAtMs,
                        promotionReceiptHeadDigest: capturedPromotionReceiptHeadDigest,
                        expectedOwnerScopeDigest: this.ownerScope.ownerScopeDigest,
                    });
                });
                const verified = await readVerifiedPublicationBundle(this.projectionPath, this.currentnessPath, published.projectionDigest, true, this.ownerScope.ownerScopeDigest);
                const publishedCandidate = verifiedNativePublicationCandidate(result.publicationCandidate.candidate, this.ownerScope.ownerScopeDigest);
                if (published.candidateDigest
                    !== result.publicationCandidate.candidateDigest
                    || published.currentnessPreserved !== true
                    || (this.usesDefaultGraphBuilder
                        && publishedCandidate.ranking === undefined)
                    || (publishedCandidate.ranking !== undefined
                        && verified.ranking?.artifactDigest
                            !== publishedCandidate.ranking.artifactDigest)) {
                    throw new Error("published Task Map projection does not match the candidate");
                }
                await this.publishPendingBodySignalAssessment(result.publicationCandidate.candidateDigest, verified.projection);
                if (this.usesDefaultGraphBuilder) {
                    try {
                        await (0, llm_proposal_surface_js_1.publishTaskMapLlmProposalSurface)({
                            taskMapRoot: node_path_1.default.dirname(this.projectionPath),
                            ownerScopeDigest: this.ownerScope.ownerScopeDigest,
                            projection: verified.projection,
                            identityStatus: this.identityStationStatus,
                            identityArtifact: identityProposalArtifact,
                            decompositionStatus: this.decompositionStationStatus,
                            decompositionArtifact: decompositionProposalArtifact,
                        });
                    }
                    catch {
                        // This is a derived, read-only proposal view. A failed write must
                        // never roll back or mutate the already verified graph; its strict
                        // loader rejects a stale or missing projection binding instead.
                    }
                }
                await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.candidatePath), {
                    contractVersion: exports.TASKMAP_NATIVE_REFRESH_CANDIDATE_VERSION,
                    requestedAtMs,
                    graphInputDigest: result.publicationCandidate.graphInputDigest,
                    candidateDigest: result.publicationCandidate.candidateDigest,
                    candidate: result.publicationCandidate.candidate,
                });
                refreshStatus = "published";
                projectionDigest = verified.projectionDigest;
                failureStage = null;
                publicationBlockReason = null;
                state.lastSuccessfulRefreshAtMs = requestedAtMs;
                state.lastRefreshStatus = refreshStatus;
                state.lastPublicationBlockReason = null;
                nextDueAtMs = boundedNextDueAt(requestedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS);
                state.verifiedGraphInputDigest =
                    result.publicationCandidate.graphInputDigest;
                state.verifiedCandidateDigest =
                    result.publicationCandidate.candidateDigest;
                state.verifiedProjectionDigest = projectionDigest;
                state.verifiedRankingDigest =
                    publishedCandidate.ranking?.artifactDigest ?? null;
                state.processedPromotionReceiptHeadDigest =
                    capturedPromotionReceiptHeadDigest;
                for (const [source, slice] of freshSlices) {
                    state.sources[source] = slice;
                }
            }
            catch (error) {
                refreshStatus = "unavailable";
                if (error instanceof TaskMapNativeSourceChangedError) {
                    sourceBindingFailure = error.source;
                    freshSlices.delete(error.source);
                    sourceDispositions = sourceDispositions.map((status) => status.source === error.source
                        ? {
                            ...status,
                            disposition: "unavailable",
                        }
                        : status);
                    state.lastSourceStatuses = sourceDispositions;
                    state.lastSourceSuccessAtMs = {
                        ...lastSourceSuccessBeforePublication,
                    };
                    if (error.source === "calendar") {
                        state.calendarProviderStatuses =
                            calendarProviderStatusesBeforeContextValidation;
                    }
                    failureStage = "graph_builder";
                    publicationBlockReason = "semantic_provider_unavailable";
                }
                else {
                    failureStage = "publication";
                    publicationBlockReason =
                        error instanceof TaskMapNativePublicationError
                            ? error.reason
                            : "publication_failed";
                }
                state.lastRefreshStatus = refreshStatus;
                state.lastPublicationBlockReason = publicationBlockReason;
            }
        }
        else {
            publicationBlockReason ??= "publication_failed";
            state.lastRefreshStatus = "unavailable";
            state.lastPublicationBlockReason = publicationBlockReason;
        }
        if (refreshStatus === "unavailable") {
            nextDueAtMs = requestedAtMs;
        }
        await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statePath), state);
        if (refreshStatus === "published") {
            // Keep the generation journal until verified state is durable so a
            // restart can reconcile a crash between fixed-file publication and
            // state persistence.
            await durableOwnerRemove(this.publicationJournalPath);
        }
        const response = {
            status: refreshStatus === "unavailable"
                || hasRemoteConsentRequired(sourceDispositions)
                ? "partial"
                : "ok",
            refreshStatus,
            sourceStatuses: sourceReceiptStatuses(sourceDispositions, state.lastSourceSuccessAtMs, state.calendarProviderStatuses, sourceBindingFailure === null
                ? new Set()
                : new Set([sourceBindingFailure])),
            calendarProviderStatuses: state.calendarProviderStatuses,
            stationStatuses: this.stationStatuses(),
            requestedAtMs,
            nextDueAtMs,
            publicationVerified: refreshStatus === "published"
                || (refreshStatus === "no_op" && projectionDigest !== null),
            publicationBlockReason,
            semanticGroupingRetention: await this.semanticGroupingRetention(publicationBlockReason),
        };
        await this.writeStatus(response, {
            candidateDigest: state.verifiedCandidateDigest,
            projectionDigest,
            failureStage,
        });
        return response;
    }
    async writeStatus(response, details) {
        const statusDocument = {
            contractVersion: exports.TASKMAP_NATIVE_REFRESH_STATUS_VERSION,
            status: response.status,
            refreshStatus: response.refreshStatus,
            sourceStatuses: response.sourceStatuses,
            calendarProviderStatuses: response.calendarProviderStatuses
                ?? defaultCalendarProviderStatuses(),
            stationStatuses: response.stationStatuses
                ?? this.stationStatuses(),
            requestedAtMs: response.requestedAtMs,
            completedAtMs: this.nowMs(),
            nextDueAtMs: response.nextDueAtMs,
            publicationBlockReason: response.publicationBlockReason,
            semanticGroupingRetention: response.semanticGroupingRetention ?? null,
            ...details,
        };
        await atomicOwnerWrite(this.runtimeRoot, node_path_1.default.basename(this.statusPath), statusDocument);
    }
}
exports.TaskMapNativeRefreshService = TaskMapNativeRefreshService;
