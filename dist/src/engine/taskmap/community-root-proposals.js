"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY = exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1 = exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD = exports.TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION = void 0;
exports.taskMapCommunityRootNodeLookupDigest = taskMapCommunityRootNodeLookupDigest;
exports.buildTaskMapCommunityRootProposals = buildTaskMapCommunityRootProposals;
exports.taskMapCommunityTitleBatchRequestDigests = taskMapCommunityTitleBatchRequestDigests;
exports.taskMapCommunityRecordedTitleEnvelope = taskMapCommunityRecordedTitleEnvelope;
const community_graph_brain_js_1 = require("./community-graph-brain.js");
const mention_extraction_js_1 = require("./mention-extraction.js");
const llm_station_js_1 = require("./llm-station.js");
const source_contracts_js_1 = require("./source-contracts.js");
const text_contract_js_1 = require("./text-contract.js");
exports.TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION = "taskmap-community-root-proposals.v1";
exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD = 0.5;
exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1 = Object.freeze({
    maxRoots: 384,
    maxPreviousRoots: 384,
    maxMembersPerPreviousRoot: 384,
    maxPreviousMembersTotal: 4_096,
    maxPreviousRootsBytes: 1 * 1_024 * 1_024,
    maxOutputBytes: 256 * 1_024,
    maxTitlePromptBytes: 64 * 1_024,
    maxTitleOutputBytes: 64 * 1_024,
    titleBatchTimeoutMs: 30_000,
    maxNodeTextCharacters: 480,
    maxNodeTextBytes: 3 * 480,
});
const MAX_TITLE_CHARACTERS = 80;
const MAX_MEMBER_TEXT_CHARACTERS = 480;
const SHA256 = /^[a-f0-9]{64}$/;
const TITLE_TRANSPORTS = new Set([
    "claude-cli",
    "codex-cli",
    "cursor-cli",
    "gemini-remote",
]);
const CONTROL_CHARACTER = /\p{Cc}/u;
const URL = /\b(?:https?|ftp):\/\/[^\s<>"]+/giu;
const FILE_URI = /\bfile:\/\/\/[^\s<>"')\]]+/giu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu;
const OWNER_LOCAL_PATH = /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)[^\s<>"')\]]+/gu;
const GENERIC_ABSOLUTE_POSIX_PATH = /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/gu;
const CREDENTIAL = /\b(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*["']?[^\s"',;]+/giu;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/giu;
const PROVIDER_TOKEN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/giu;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu;
const TRUNCATED_PEM_CONTENT = /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*/giu;
const UNSAFE_TITLE = [
    /\b(?:https?|ftp):\/\//iu,
    /\bfile:\/\/\//iu,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/iu,
    /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)/u,
    /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/u,
    /\b(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key|aws[_-]?session[_-]?token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]/iu,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
    /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/iu,
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
    /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/u,
    /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/iu,
];
const STOP_WORDS = new Set([
    "a", "an", "and", "as", "at", "by", "for", "from", "in", "of",
    "on", "or", "the", "to", "with",
]);
function fail(message) {
    throw new TypeError(`Task Map community root proposals: ${message}`);
}
function compareText(left, right) {
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
function compareStringArrays(left, right) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
        const difference = compareText(left[index], right[index]);
        if (difference !== 0)
            return difference;
    }
    return left.length - right.length;
}
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function assertBoundedId(value, label) {
    if (typeof value !== "string"
        || value.trim().length === 0
        || value.length > 512
        || CONTROL_CHARACTER.test(value))
        fail(`${label} is invalid`);
}
function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) {
            deepFreeze(child);
        }
        Object.freeze(value);
    }
    return value;
}
function sanitizeText(value) {
    return (0, text_contract_js_1.boundedUtf16)((0, text_contract_js_1.toWellFormedText)(value)
        .replace(PRIVATE_KEY, "[private-key]")
        .replace(TRUNCATED_PEM_CONTENT, "[private-key]")
        .replace(FILE_URI, "[file-uri]")
        .replace(URL, "[url]")
        .replace(EMAIL, "[email]")
        .replace(BEARER_SECRET, "[credential]")
        .replace(PROVIDER_TOKEN, "[credential]")
        .replace(AWS_ACCESS_KEY, "[credential]")
        .replace(JWT_SECRET, "[credential]")
        .replace(CREDENTIAL, "[credential]")
        .replace(OWNER_LOCAL_PATH, " [path]")
        .replace(GENERIC_ABSOLUTE_POSIX_PATH, " [path]")
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/g, " ")
        .trim(), MAX_MEMBER_TEXT_CHARACTERS);
}
function assertNodeTextBounded(value) {
    if (typeof value !== "string" || value.length === 0) {
        fail("node text is invalid");
    }
    if (value.length
        > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxNodeTextCharacters)
        fail("node text exceeds its character limit");
    if (Buffer.byteLength(value, "utf8")
        > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxNodeTextBytes)
        fail("node text exceeds its UTF-8 byte limit");
}
function taskMapCommunityRootNodeLookupDigest(nodeLookup) {
    if (!(nodeLookup instanceof Map)
        || nodeLookup.size > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxRoots)
        fail("nodeLookup is invalid");
    const rows = [...nodeLookup.entries()]
        .sort(([left], [right]) => compareText(left, right))
        .map(([lookupId, candidate]) => {
        assertBoundedId(lookupId, "node lookup id");
        if (!isPlainObject(candidate) || candidate.nodeId !== lookupId) {
            fail("nodeLookup entry is invalid");
        }
        assertNodeTextBounded(candidate.text);
        return candidate;
    });
    (0, community_graph_brain_js_1.buildTaskMapCommunityGraph)({ nodes: rows });
    return (0, source_contracts_js_1.taskMapContractDigest)(rows);
}
function boundedTitle(value) {
    const normalized = (0, text_contract_js_1.toWellFormedText)(value).replace(/\s+/g, " ").trim();
    const scalars = Array.from(normalized);
    if (scalars.length <= MAX_TITLE_CHARACTERS)
        return normalized;
    return scalars.slice(0, MAX_TITLE_CHARACTERS).join("").trim();
}
function safeTitle(value) {
    return typeof value === "string"
        && value === (0, text_contract_js_1.toWellFormedText)(value)
        && value.trim() === value
        && value.length > 0
        && Array.from(value).length <= MAX_TITLE_CHARACTERS
        && !CONTROL_CHARACTER.test(value)
        && !UNSAFE_TITLE.some((pattern) => pattern.test(value));
}
function tokens(value) {
    return value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}
function includesTokenSequence(haystack, needle) {
    if (needle.length > haystack.length)
        return false;
    for (let start = 0; start <= haystack.length - needle.length; start += 1) {
        if (needle.every((token, index) => token.normalize("NFKC").toLowerCase()
            === haystack[start + index].normalize("NFKC").toLowerCase()))
            return true;
    }
    return false;
}
function meaningful(token) {
    const canonical = token.normalize("NFKC").toLowerCase();
    return !STOP_WORDS.has(canonical)
        && (Array.from(token).length > 1 || /[^\u0000-\u007f]/u.test(token));
}
function deterministicFallbackTitle(memberTexts) {
    const tokenRows = memberTexts.map(tokens).filter((row) => row.length > 0);
    if (tokenRows.length > 0) {
        const candidates = [];
        const first = tokenRows[0];
        for (let length = first.length; length >= 1; length -= 1) {
            for (let start = 0; start <= first.length - length; start += 1) {
                const candidate = first.slice(start, start + length);
                if (!candidate.some(meaningful))
                    continue;
                if (tokenRows.every((row) => includesTokenSequence(row, candidate))) {
                    candidates.push(candidate.join(" "));
                }
            }
            if (candidates.length > 0) {
                return boundedTitle(candidates.sort(compareText)[0]);
            }
        }
    }
    const stable = [...memberTexts].sort((left, right) => {
        const length = Array.from(right).length - Array.from(left).length;
        return length !== 0 ? length : compareText(left, right);
    })[0] ?? "Untitled work community";
    return boundedTitle(stable) || "Untitled work community";
}
function normalizePreviousRoots(value) {
    if (!Array.isArray(value)
        || value.length
            > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRoots) {
        fail("previousAcceptedRoots exceeds its count limit");
    }
    const seenRootIds = new Set();
    let aggregateMembers = 0;
    const normalized = value.map((candidate, index) => {
        if (!isPlainObject(candidate))
            fail(`previousAcceptedRoots[${index}] is invalid`);
        if (Object.keys(candidate).sort().join(":")
            !== "memberNodeIds:rootProposalId")
            fail(`previousAcceptedRoots[${index}] has unexpected fields`);
        assertBoundedId(candidate.rootProposalId, "previous rootProposalId");
        if (seenRootIds.has(candidate.rootProposalId)) {
            fail("duplicate previous rootProposalId");
        }
        seenRootIds.add(candidate.rootProposalId);
        if (!Array.isArray(candidate.memberNodeIds) || candidate.memberNodeIds.length === 0) {
            fail("previous memberNodeIds is invalid");
        }
        if (candidate.memberNodeIds.length
            > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                .maxMembersPerPreviousRoot)
            fail("previous root exceeds its member limit");
        aggregateMembers += candidate.memberNodeIds.length;
        if (aggregateMembers
            > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1
                .maxPreviousMembersTotal)
            fail("previous roots exceed their aggregate member limit");
        candidate.memberNodeIds.forEach((memberNodeId) => assertBoundedId(memberNodeId, "previous memberNodeId"));
        if (new Set(candidate.memberNodeIds).size !== candidate.memberNodeIds.length) {
            fail("duplicate previous memberNodeId");
        }
        return {
            rootProposalId: candidate.rootProposalId,
            memberNodeIds: [...candidate.memberNodeIds].sort(compareText),
        };
    }).sort((left, right) => compareText(left.rootProposalId, right.rootProposalId));
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(normalized), "utf8")
        > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxPreviousRootsBytes)
        fail("previous roots exceed their canonical byte limit");
    return normalized;
}
function normalizeCommunities(graphOutput, nodeLookup) {
    if (!isPlainObject(graphOutput) || !Array.isArray(graphOutput.communities)) {
        fail("graphOutput is invalid");
    }
    if (!(nodeLookup instanceof Map)
        || nodeLookup.size > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxRoots) {
        fail("nodeLookup is invalid");
    }
    if (graphOutput.resourceUsage?.nodeCount !== nodeLookup.size) {
        fail("nodeLookup does not cover the validated graph");
    }
    const normalized = [];
    graphOutput.communities.forEach((candidate, communityIndex) => {
        if (!isPlainObject(candidate) || !Array.isArray(candidate.memberNodeIds)) {
            fail(`community ${communityIndex} is invalid`);
        }
        if (candidate.memberNodeIds.length === 0)
            return;
        candidate.memberNodeIds.forEach((memberNodeId) => assertBoundedId(memberNodeId, "community memberNodeId"));
        if (new Set(candidate.memberNodeIds).size !== candidate.memberNodeIds.length) {
            fail("duplicate community memberNodeId");
        }
        const memberNodeIds = [...candidate.memberNodeIds].sort(compareText);
        const memberTexts = memberNodeIds.map((memberNodeId) => {
            const member = nodeLookup.get(memberNodeId);
            if (member === undefined || member.nodeId !== memberNodeId) {
                fail("community references an unknown memberNodeId");
            }
            assertNodeTextBounded(member.text);
            return sanitizeText(member.text);
        });
        const baseRootProposalId = `graph-root-${(0, source_contracts_js_1.taskMapContractDigest)(memberNodeIds).slice(0, 16)}`;
        normalized.push({
            memberNodeIds,
            memberTexts,
            baseRootProposalId,
        });
    });
    const baseRootProposalIds = normalized.map((community) => community.baseRootProposalId);
    if (new Set(baseRootProposalIds).size !== baseRootProposalIds.length) {
        fail("duplicate baseRootProposalId across communities");
    }
    const globallySeenMembers = new Set();
    for (const candidate of normalized) {
        for (const memberNodeId of candidate.memberNodeIds) {
            if (globallySeenMembers.has(memberNodeId)) {
                fail("duplicate memberNodeId across communities");
            }
            globallySeenMembers.add(memberNodeId);
        }
    }
    return normalized.sort((left, right) => compareStringArrays(left.memberNodeIds, right.memberNodeIds));
}
function truncateScalars(value, maximum) {
    return Array.from(value).slice(0, maximum).join("");
}
function titleBatchRequest(communities) {
    const render = (maximumSnippetCharacters) => {
        const payload = {
            communities: communities.map((community) => ({
                baseRootProposalId: community.baseRootProposalId,
                memberTexts: community.memberTexts.slice(0, 5).map((text) => truncateScalars(text, maximumSnippetCharacters)),
            })),
        };
        const promptText = [
            "Create one concise Task Map root title for each community.",
            "Return strict JSON with exactly this schema:",
            "{\"titles\":[{\"baseRootProposalId\":\"graph-root-...\",\"title\":\"...\"}]}",
            "Each title must be at most 80 characters and contain no paths or secrets.",
            "Missing communities use deterministic fallback; do not invent IDs.",
            JSON.stringify(payload),
        ].join("\n");
        return { payload, promptText };
    };
    let low = 0;
    let high = MAX_MEMBER_TEXT_CHARACTERS;
    let best = render(0);
    if (Buffer.byteLength(best.promptText, "utf8")
        > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitlePromptBytes) {
        fail("community title batch cannot fit its prompt budget");
    }
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = render(middle);
        if (Buffer.byteLength(candidate.promptText, "utf8")
            <= exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitlePromptBytes) {
            best = candidate;
            low = middle + 1;
        }
        else {
            high = middle - 1;
        }
    }
    return {
        promptText: best.promptText,
        inputDigest: (0, source_contracts_js_1.taskMapContractDigest)(best.payload),
    };
}
function parseTitleBatch(outputJson, communities) {
    (0, mention_extraction_js_1.assertTaskMapStrictJsonSyntaxAndUniqueKeys)(outputJson);
    const parsed = JSON.parse(outputJson);
    if (!isPlainObject(parsed)
        || Object.keys(parsed).length !== 1
        || !Array.isArray(parsed.titles)
        || parsed.titles.length > communities.length)
        throw new Error("invalid title batch output");
    const expectedIds = new Set(communities.map((community) => community.baseRootProposalId));
    const titles = new Map();
    for (const candidate of parsed.titles) {
        if (!isPlainObject(candidate)
            || Object.keys(candidate).sort().join(":")
                !== "baseRootProposalId:title"
            || typeof candidate.baseRootProposalId !== "string"
            || !expectedIds.has(candidate.baseRootProposalId)
            || titles.has(candidate.baseRootProposalId)
            || !safeTitle(candidate.title))
            throw new Error("invalid title batch mapping");
        titles.set(candidate.baseRootProposalId, candidate.title);
    }
    return titles;
}
function canonicalTimestamp(value) {
    return typeof value === "string"
        && Number.isFinite(Date.parse(value))
        && new Date(Date.parse(value)).toISOString() === value;
}
function safeModel(value) {
    return typeof value === "string"
        && /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value)
        && !UNSAFE_TITLE.some((pattern) => pattern.test(value));
}
function validateTitleEnvelope(envelope, request, communities, source, expectedTransport) {
    if (!isPlainObject(envelope)
        || Object.keys(envelope).sort().join(":")
            !== "inputDigest:model:outputJson:producedAt:promptDigest:stationId:transport"
        || envelope.stationId !== "community-title-v1"
        || envelope.inputDigest !== request.inputDigest
        || envelope.promptDigest !== (0, source_contracts_js_1.taskMapContractDigest)(request.promptText)
        || typeof envelope.outputJson !== "string"
        || Buffer.byteLength(envelope.outputJson, "utf8")
            > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxTitleOutputBytes
        || !TITLE_TRANSPORTS.has(envelope.transport)
        || (expectedTransport !== undefined
            && envelope.transport !== expectedTransport)
        || !safeModel(envelope.model)
        || !canonicalTimestamp(envelope.producedAt))
        throw new Error("invalid community title envelope");
    const titles = parseTitleBatch(envelope.outputJson, communities);
    const typedEnvelope = envelope;
    return {
        titles,
        titleGeneration: {
            source,
            stationId: "community-title-v1",
            inputDigest: typedEnvelope.inputDigest,
            promptDigest: typedEnvelope.promptDigest,
            outputDigest: (0, source_contracts_js_1.taskMapContractDigest)(typedEnvelope.outputJson),
            envelopeDigest: (0, source_contracts_js_1.taskMapContractDigest)(typedEnvelope),
            transport: typedEnvelope.transport,
            model: typedEnvelope.model,
            producedAt: typedEnvelope.producedAt,
        },
        titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
        titleOutputBytes: Buffer.byteLength(typedEnvelope.outputJson, "utf8"),
        titleBatchAttempted: source === "live_station",
        titleBatchTimedOut: false,
        titleFallbackReason: titles.size === communities.length
            ? "none"
            : "missing_titles",
    };
}
async function batchTitlesForCommunities(communities, llmStation, recordedTitleEnvelope, titleBatchTimeoutMs, signal) {
    if (communities.length === 0) {
        if (recordedTitleEnvelope !== undefined && recordedTitleEnvelope !== null) {
            fail("recorded title envelope has no communities");
        }
        return {
            titles: new Map(),
            titleGeneration: null,
            titlePromptBytes: 0,
            titleOutputBytes: 0,
            titleBatchAttempted: false,
            titleBatchTimedOut: false,
            titleFallbackReason: "none",
        };
    }
    const request = titleBatchRequest(communities);
    if (recordedTitleEnvelope !== undefined && recordedTitleEnvelope !== null) {
        try {
            return validateTitleEnvelope(recordedTitleEnvelope, request, communities, "recorded_replay");
        }
        catch {
            fail("recorded title envelope is invalid");
        }
    }
    if (llmStation === undefined || llmStation === null) {
        return {
            titles: new Map(),
            titleGeneration: null,
            titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
            titleOutputBytes: 0,
            titleBatchAttempted: false,
            titleBatchTimedOut: false,
            titleFallbackReason: "no_station",
        };
    }
    let timer;
    let timedOut = false;
    let outputBytes = 0;
    const abortController = new AbortController();
    const abortFromCaller = () => abortController.abort(signal?.reason);
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted)
        abortFromCaller();
    try {
        const timeout = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                abortController.abort();
                reject(new Error("community title batch timeout"));
            }, titleBatchTimeoutMs);
        });
        const envelope = await Promise.race([
            llmStation.run({
                stationId: "community-title-v1",
                promptText: request.promptText,
                inputDigest: request.inputDigest,
                signal: abortController.signal,
            }),
            timeout,
        ]);
        outputBytes = typeof envelope.outputJson === "string"
            ? Buffer.byteLength(envelope.outputJson, "utf8")
            : 0;
        return validateTitleEnvelope(envelope, request, communities, "live_station", llmStation.provider.transport);
    }
    catch (error) {
        const stationTimedOut = timedOut
            || (error instanceof llm_station_js_1.LlmStationUnavailableError
                && error.reason === "timeout");
        return {
            titles: new Map(),
            titleGeneration: null,
            titlePromptBytes: Buffer.byteLength(request.promptText, "utf8"),
            titleOutputBytes: outputBytes,
            titleBatchAttempted: true,
            titleBatchTimedOut: stationTimedOut,
            titleFallbackReason: stationTimedOut
                ? "station_timeout"
                : "station_unavailable_or_invalid",
        };
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromCaller);
    }
}
function jaccardSimilarity(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let intersection = 0;
    for (const member of leftSet) {
        if (rightSet.has(member))
            intersection += 1;
    }
    const union = leftSet.size + rightSet.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
/** Hungarian minimum-cost assignment for rows <= columns. */
function hungarian(costs) {
    const rowCount = costs.length;
    if (rowCount === 0)
        return [];
    const columnCount = costs[0].length;
    if (columnCount < rowCount)
        fail("identity assignment is not rectangular");
    if (costs.some((row) => row.length !== columnCount)) {
        fail("identity assignment rows are inconsistent");
    }
    const u = Array(rowCount + 1).fill(0);
    const v = Array(columnCount + 1).fill(0);
    const p = Array(columnCount + 1).fill(0);
    const way = Array(columnCount + 1).fill(0);
    for (let row = 1; row <= rowCount; row += 1) {
        p[0] = row;
        let column0 = 0;
        const minimum = Array(columnCount + 1)
            .fill(Number.POSITIVE_INFINITY);
        const used = Array(columnCount + 1).fill(false);
        do {
            used[column0] = true;
            const row0 = p[column0];
            let delta = Number.POSITIVE_INFINITY;
            let column1 = 0;
            for (let column = 1; column <= columnCount; column += 1) {
                if (used[column])
                    continue;
                const reduced = costs[row0 - 1][column - 1]
                    - u[row0]
                    - v[column];
                if (reduced < minimum[column]) {
                    minimum[column] = reduced;
                    way[column] = column0;
                }
                if (minimum[column] < delta
                    || (minimum[column] === delta && column < column1)) {
                    delta = minimum[column];
                    column1 = column;
                }
            }
            for (let column = 0; column <= columnCount; column += 1) {
                if (used[column]) {
                    u[p[column]] += delta;
                    v[column] -= delta;
                }
                else {
                    minimum[column] -= delta;
                }
            }
            column0 = column1;
        } while (p[column0] !== 0);
        do {
            const column1 = way[column0];
            p[column0] = p[column1];
            column0 = column1;
        } while (column0 !== 0);
    }
    const assignment = Array(rowCount).fill(-1);
    for (let column = 1; column <= columnCount; column += 1) {
        if (p[column] !== 0)
            assignment[p[column] - 1] = column - 1;
    }
    return assignment;
}
function matchPreviousRoots(communities, previousRoots) {
    if (communities.length === 0 || previousRoots.length === 0) {
        return {
            matches: communities.map(() => null),
            eligiblePairCount: 0,
        };
    }
    const similarities = communities.map((community) => previousRoots.map((previous) => jaccardSimilarity(community.memberNodeIds, previous.memberNodeIds)));
    const cardinalityBonus = communities.length + 1;
    const costs = similarities.map((row) => [
        ...row.map((similarity) => similarity
            >= exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD
            ? -(cardinalityBonus + similarity)
            : cardinalityBonus),
        ...Array(communities.length).fill(0),
    ]);
    const assignment = hungarian(costs);
    const matches = assignment.map((column, communityIndex) => {
        if (column < 0 || column >= previousRoots.length)
            return null;
        const similarity = similarities[communityIndex][column];
        if (similarity < exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD)
            return null;
        return {
            previous: previousRoots[column],
            similarity: Math.round(similarity * 1_000_000_000_000)
                / 1_000_000_000_000,
        };
    });
    return {
        matches,
        eligiblePairCount: similarities.reduce((count, row) => count + row.filter((similarity) => similarity
            >= exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD).length, 0),
    };
}
function proposalSetPayload(value) {
    return value;
}
async function buildTaskMapCommunityRootProposalsInternal(input, titleBatchTimeoutMs) {
    if (!isPlainObject(input))
        fail("input is invalid");
    if (!Number.isSafeInteger(titleBatchTimeoutMs)
        || titleBatchTimeoutMs < 1
        || titleBatchTimeoutMs
            > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs)
        fail("title batch timeout is invalid");
    const actualKeys = Object.keys(input);
    const allowedKeys = new Set([
        "graphOutput", "llmStation", "nodeLookup", "nodeLookupDigest",
        "previousAcceptedRoots", "recordedTitleEnvelope", "signal",
    ]);
    if (!Object.prototype.hasOwnProperty.call(input, "graphOutput")
        || !Object.prototype.hasOwnProperty.call(input, "nodeLookup")
        || !Object.prototype.hasOwnProperty.call(input, "nodeLookupDigest")
        || !Object.prototype.hasOwnProperty.call(input, "previousAcceptedRoots")
        || actualKeys.some((key) => !allowedKeys.has(key)))
        fail("input has unexpected or missing fields");
    if (input.llmStation !== undefined
        && input.llmStation !== null
        && input.recordedTitleEnvelope !== undefined
        && input.recordedTitleEnvelope !== null)
        fail("live and recorded title sources are mutually exclusive");
    if (typeof input.nodeLookupDigest !== "string"
        || !SHA256.test(input.nodeLookupDigest))
        fail("nodeLookupDigest is invalid");
    const computedNodeLookupDigest = taskMapCommunityRootNodeLookupDigest(input.nodeLookup);
    if (computedNodeLookupDigest !== input.nodeLookupDigest) {
        fail("nodeLookupDigest does not match nodeLookup");
    }
    const communities = normalizeCommunities(input.graphOutput, input.nodeLookup);
    const previousRoots = normalizePreviousRoots(input.previousAcceptedRoots);
    const { matches, eligiblePairCount } = matchPreviousRoots(communities, previousRoots);
    const matchedPreviousIds = new Set(matches.flatMap((match) => match === null ? [] : [match.previous.rootProposalId]));
    const unmatchedPreviousIds = new Set(previousRoots
        .map((previous) => previous.rootProposalId)
        .filter((rootProposalId) => !matchedPreviousIds.has(rootProposalId)));
    communities.forEach((community, index) => {
        if (matches[index] === null
            && unmatchedPreviousIds.has(community.baseRootProposalId))
            fail("base ID collides with an unmatched historical root");
    });
    const proposals = [];
    const lifecycle = [];
    const titleBatchResult = await batchTitlesForCommunities(communities, input.llmStation, input.recordedTitleEnvelope, titleBatchTimeoutMs, input.signal);
    for (let index = 0; index < communities.length; index += 1) {
        const community = communities[index];
        const match = matches[index];
        const modelTitle = titleBatchResult.titles.get(community.baseRootProposalId);
        const title = modelTitle ?? deterministicFallbackTitle(community.memberTexts.slice(0, 5));
        const titleSource = modelTitle === undefined
            ? "deterministic_fallback"
            : "llm_community_title_v1";
        const rootProposalId = match?.previous.rootProposalId
            ?? community.baseRootProposalId;
        const base = {
            rootProposalId,
            baseRootProposalId: community.baseRootProposalId,
            memberNodeIds: community.memberNodeIds,
            title,
            titleSource,
            recordKind: "review_only_root_proposal",
            proposalDisposition: "review_only",
            authority: "none",
            requiresOwnerAcceptance: true,
            acceptedMembershipAuthority: false,
        };
        proposals.push({
            ...base,
            proposalDigest: (0, source_contracts_js_1.taskMapContractDigest)(base),
        });
        if (match !== null) {
            lifecycle.push({
                kind: "identity_reuse_proposed",
                rootProposalId,
                baseRootProposalId: community.baseRootProposalId,
                previousMemberNodeIds: match.previous.memberNodeIds,
                currentMemberNodeIds: community.memberNodeIds,
                jaccardSimilarity: match.similarity,
                recordKind: "review_only_identity_reuse_proposal",
                proposalDisposition: "review_only",
                authority: "none",
                requiresOwnerAcceptance: true,
                lifecycleAuthority: false,
            });
        }
    }
    proposals.sort((left, right) => compareText(left.rootProposalId, right.rootProposalId));
    if (new Set(proposals.map((proposal) => proposal.rootProposalId)).size
        !== proposals.length) {
        fail("root proposal identity collision");
    }
    lifecycle.sort((left, right) => compareText(left.rootProposalId, right.rootProposalId));
    const identityReuseProposedCount = matches.filter((match) => match !== null).length;
    const reuseMetrics = {
        reuseThreshold: exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_IDENTITY_REUSE_THRESHOLD,
        communityCount: communities.length,
        previousAcceptedRootCount: previousRoots.length,
        eligiblePairCount,
        identityReuseProposedCount,
        unmatchedCommunityCount: communities.length - identityReuseProposedCount,
        unmatchedPreviousRootCount: previousRoots.length - matchedPreviousIds.size,
    };
    const monitoring = {
        titlePromptBytes: titleBatchResult.titlePromptBytes,
        titleOutputBytes: titleBatchResult.titleOutputBytes,
        titleBatchAttempted: titleBatchResult.titleBatchAttempted,
        titleBatchTimedOut: titleBatchResult.titleBatchTimedOut,
        titleFallbackReason: titleBatchResult.titleFallbackReason,
        llmTitleCount: titleBatchResult.titles.size,
        fallbackTitleCount: communities.length - titleBatchResult.titles.size,
    };
    const base = proposalSetPayload({
        contractVersion: exports.TASKMAP_COMMUNITY_ROOT_PROPOSALS_VERSION,
        authority: "none",
        requiresOwnerAcceptance: true,
        nodeLookupDigest: input.nodeLookupDigest,
        titleGeneration: titleBatchResult.titleGeneration,
        monitoring,
        reuseMetrics,
        proposals,
        lifecycle,
    });
    const proposalSetDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const result = {
        ...base,
        proposalSetId: `tmcrpset_${proposalSetDigest.slice(0, 16)}`,
        proposalSetDigest,
    };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.maxOutputBytes)
        fail("proposal output exceeds its canonical byte limit");
    return deepFreeze(result);
}
function buildTaskMapCommunityRootProposals(input) {
    return buildTaskMapCommunityRootProposalsInternal(input, exports.TASKMAP_COMMUNITY_ROOT_PROPOSAL_LIMITS_V1.titleBatchTimeoutMs);
}
/**
 * The batch title request digests for one validated community graph, or null
 * when there is no community to title. Callers use this to key the recorded
 * title-envelope store before invoking the proposal builder.
 */
function taskMapCommunityTitleBatchRequestDigests(input) {
    const communities = normalizeCommunities(input.graphOutput, input.nodeLookup);
    if (communities.length === 0)
        return null;
    const request = titleBatchRequest(communities);
    return {
        inputDigest: request.inputDigest,
        promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
    };
}
/**
 * Full replay-side validation of a recorded community title envelope against
 * the current community set. Returns the frozen envelope when it would
 * satisfy the recorded-replay path, and null on any mismatch, so callers can
 * fall back to the live station instead of failing the whole proposal build.
 */
function taskMapCommunityRecordedTitleEnvelope(candidate, input) {
    try {
        const communities = normalizeCommunities(input.graphOutput, input.nodeLookup);
        if (communities.length === 0)
            return null;
        const request = titleBatchRequest(communities);
        validateTitleEnvelope(candidate, request, communities, "recorded_replay");
        return deepFreeze({
            ...candidate,
        });
    }
    catch {
        return null;
    }
}
/** @internal One bounded seam for run-level title timeout tests. */
exports.TASKMAP_COMMUNITY_ROOT_PROPOSALS_TEST_ONLY = Object.freeze({
    buildWithTitleTimeout(input, titleBatchTimeoutMs) {
        return buildTaskMapCommunityRootProposalsInternal(input, titleBatchTimeoutMs);
    },
});
