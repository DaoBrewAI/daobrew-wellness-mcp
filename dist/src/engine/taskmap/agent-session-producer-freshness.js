"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V2 = exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1 = exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1 = exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN = exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN = exports.TASKMAP_AGENT_SESSION_REPOSITORY_ROUTING_DOMAIN = exports.TASKMAP_AGENT_SESSION_PROJECT_ROUTING_DOMAIN = exports.TASKMAP_AGENT_SESSION_DIRECTIVE_SEMANTIC_DOMAIN = exports.TASKMAP_AGENT_SESSION_TURN_LINEAGE_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_EPISODE_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_IDENTITY_DOMAIN = exports.TASKMAP_AGENT_SESSION_OWNER_SCOPE_DOMAIN = exports.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS = exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS = exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION = exports.TASKMAP_AGENT_SESSION_PRODUCER_RESULT_VERSION = exports.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION = void 0;
exports.classifyTaskMapAgentSessionDirectiveForGraph = classifyTaskMapAgentSessionDirectiveForGraph;
exports.isTaskMapAgentSessionDiscoveryPathEligible = isTaskMapAgentSessionDiscoveryPathEligible;
exports.compactTaskMapAgentSessionJsonlLine = compactTaskMapAgentSessionJsonlLine;
exports.buildTaskMapAgentSessionProducerSnapshot = buildTaskMapAgentSessionProducerSnapshot;
exports.selectTaskMapAgentSessionGraphEpisodeCandidates = selectTaskMapAgentSessionGraphEpisodeCandidates;
exports.assertTaskMapAgentSessionProducerSnapshot = assertTaskMapAgentSessionProducerSnapshot;
exports.selectLatestTaskMapAgentSessionWorkEpisodesByRoot = selectLatestTaskMapAgentSessionWorkEpisodesByRoot;
exports.assessTaskMapAgentSessionProducerSnapshot = assessTaskMapAgentSessionProducerSnapshot;
exports.taskMapAgentSessionOwnerScopeDigest = taskMapAgentSessionOwnerScopeDigest;
exports.taskMapAgentSessionProducerSnapshotPath = taskMapAgentSessionProducerSnapshotPath;
exports.writeTaskMapAgentSessionProducerSnapshot = writeTaskMapAgentSessionProducerSnapshot;
exports.loadTaskMapAgentSessionProducerResult = loadTaskMapAgentSessionProducerResult;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const source_contracts_js_1 = require("./source-contracts.js");
const owner_scope_js_1 = require("./owner-scope.js");
const text_contract_js_1 = require("./text-contract.js");
/**
 * Local, bounded semantic evidence from Codex and Claude Code sessions.
 *
 * This contract deliberately does not carry a transcript, a local path, tool
 * arguments, reasoning, credentials, lifecycle state, or accepted Task Map
 * membership. It is only candidate/context input for a later semantic gate.
 */
exports.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION = "taskmap-agent-session-producer-snapshot.v2";
exports.TASKMAP_AGENT_SESSION_PRODUCER_RESULT_VERSION = "taskmap-agent-session-producer-result.v2";
exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION = "taskmap-agent-session-producer.2";
exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS = 14_400_000;
exports.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
exports.TASKMAP_AGENT_SESSION_OWNER_SCOPE_DOMAIN = "taskmap-agent-session-owner-local.1";
exports.TASKMAP_AGENT_SESSION_IDENTITY_DOMAIN = "taskmap-agent-session-identity.1";
exports.TASKMAP_AGENT_SESSION_EPISODE_IDENTITY_DOMAIN = "taskmap-agent-session-work-episode-identity.2";
exports.TASKMAP_AGENT_SESSION_TURN_LINEAGE_IDENTITY_DOMAIN = "taskmap-agent-session-turn-lineage-identity.2";
exports.TASKMAP_AGENT_SESSION_DIRECTIVE_SEMANTIC_DOMAIN = "taskmap-agent-session-directive-semantic.2";
exports.TASKMAP_AGENT_SESSION_PROJECT_ROUTING_DOMAIN = "taskmap-agent-session-project-routing.1";
exports.TASKMAP_AGENT_SESSION_REPOSITORY_ROUTING_DOMAIN = "taskmap-agent-session-repository-routing.1";
exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN = "taskmap-agent-session-provider-neutral-project-routing.2";
exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN = "taskmap-agent-session-provider-neutral-repository-routing.2";
exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1 = Object.freeze({
    maxObservations: 128,
    maxEpisodesPerRootSession: 16,
    maxEpisodesGlobal: 64,
    maxRawBytesPerObservation: 256 * 1_024,
    maxRawBytesGlobal: 8 * 1_024 * 1_024,
    maxHeadScanBytes: 64 * 1_024,
    maxTailScanBytes: 64 * 1_024 * 1_024,
    maxLinesPerObservation: 4_096,
    maxLineBytes: 64 * 1_024,
    maxNativeIdentityBytes: 1_024,
    maxRoutingIdentityDigestsPerKind: 2,
    maxUserDirectiveCharacters: 360,
    maxAssistantOutcomeCharacters: 480,
    maxSnapshotBytes: 256 * 1_024,
});
/**
 * Separate, graph-only ingestion bounds. These do not widen the persisted
 * producer snapshot or the native semantic builder input.
 */
exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1 = Object.freeze({
    maxObservations: 512,
    maxEpisodesGlobal: 256,
    maxRawBytesPerObservation: 256 * 1_024,
    maxRawBytesGlobal: 32 * 1_024 * 1_024,
});
/** Preferred v2 name; V1 is retained for downstream source compatibility. */
exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V2 = exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1;
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z][a-z0-9_]{1,31}_[a-f0-9]{16}$/;
const STRICT_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi;
const URL = /\b(?:https?|ftp):\/\/[^\s<>"')\]]+/gi;
const FILE_URI = /\bfile:\/\/\/[^\s<>"')\]]+/gi;
const FILE_URI_PREFIX = /\bfile:\/\//gi;
const OWNER_LOCAL_PATH = /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)[^\s<>"')\]]+/g;
const GENERIC_ABSOLUTE_POSIX_PATH = /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/g;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi;
const CREDENTIAL_ASSIGNMENT = /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*["']?[^\s"',;]{4,}/gi;
const BEARER_SECRET = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PROVIDER_TOKEN = /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|grn_[A-Za-z0-9_-]{12,}|dbk_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16})\b/g;
const PROVIDER_TOKEN_PREFIX = /\b(?:sk-(?:proj-)?|ghp_|gho_|ghu_|ghs_|ghr_|grn_|dbk_|xox[baprs]-)/gi;
const JWT_SECRET = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const LONG_OPAQUE_TOKEN = /\b[A-Za-z0-9_+=-]{32,}\b/g;
const PERSISTED_SENSITIVE = [
    /\b(?:https?|ftp):\/\//i,
    /\bfile:\/\//i,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:sk-(?:proj-)?|gh[pousr]_|grn_|dbk_|xox[baprs]-)/i,
    /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[:=]/i,
    /(?:^|[\s("'`])(?:~\/|\/(?:Users|home|private|var|tmp|Volumes|Applications|Library|opt|etc)\/|[A-Za-z]:[\\/]|\\\\)/,
    /(?:^|[\s("'`:=])\/(?!\/)(?!(?:quit|exit)(?:\(\))?(?=$|[\s.,;:!?]))[^\s<>"')\],;]+/,
];
const PRIVACY = Object.freeze({
    fullAgentSessionBodiesStored: false,
    localPathsStored: false,
    credentialsStored: false,
    toolArgumentsStored: false,
    chainOfThoughtStored: false,
    participantDetailsStored: false,
});
function isPlainObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function hasOwn(value, key) {
    return value !== null && Object.prototype.hasOwnProperty.call(value, key);
}
function assertPlainObject(value, label) {
    if (!isPlainObject(value))
        throw new Error(`${label} must be an object`);
}
function assertClosedKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    if (actual.length !== sortedExpected.length
        || actual.some((key, index) => key !== sortedExpected[index])) {
        throw new Error(`${label} has unexpected or missing fields`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertStableId(value, label) {
    if (typeof value !== "string" || !STABLE_ID.test(value)) {
        throw new Error(`${label} is invalid`);
    }
}
function canonicalTimestamp(value, label) {
    if (typeof value !== "string"
        || !STRICT_RFC3339.test(value)
        || !Number.isFinite(Date.parse(value))) {
        throw new Error(`${label} must be an RFC3339 timestamp`);
    }
    return new Date(Date.parse(value)).toISOString();
}
function stableId(prefix, value) {
    return `${prefix}_${(0, source_contracts_js_1.taskMapContractDigest)(value).slice(0, 16)}`;
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
function privacySanitizedText(value) {
    return (0, text_contract_js_1.toWellFormedText)(value)
        .replace(PRIVATE_KEY, "[credential]")
        .replace(FILE_URI, "[local-path]")
        .replace(FILE_URI_PREFIX, "[local-path]")
        .replace(URL, "[url]")
        .replace(EMAIL_ADDRESS, "[email]")
        .replace(CREDENTIAL_ASSIGNMENT, "[credential]")
        .replace(BEARER_SECRET, "Bearer [credential]")
        .replace(PROVIDER_TOKEN, "[credential]")
        .replace(PROVIDER_TOKEN_PREFIX, "[credential]")
        .replace(JWT_SECRET, "[credential]")
        .replace(OWNER_LOCAL_PATH, (match) => {
        const prefix = /^[\s("'`:=]/.exec(match)?.[0] ?? "";
        return `${prefix}[local-path]`;
    })
        .replace(GENERIC_ABSOLUTE_POSIX_PATH, (match) => {
        const prefix = /^[\s("'`:=]/.exec(match)?.[0] ?? "";
        return `${prefix}[local-path]`;
    })
        .replace(LONG_OPAQUE_TOKEN, "[opaque]")
        .replace(/<[^>\n]{1,160}>/g, " ")
        .replace(CONTROL_CHARACTERS, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function sanitizedSummary(value, maximum) {
    return (0, text_contract_js_1.boundedUtf16)(privacySanitizedText(value), maximum);
}
function directiveSemanticDigest(value) {
    const canonicalDirective = privacySanitizedText(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_DIRECTIVE_SEMANTIC_DOMAIN,
        canonicalDirective,
    });
}
function assertPersistedSummary(value, maximum, label, nullable = false) {
    if (nullable && value === null)
        return;
    if (typeof value !== "string"
        || value.length === 0
        || value.length > maximum
        || (0, text_contract_js_1.toWellFormedText)(value) !== value
        || CONTROL_CHARACTER.test(value)
        || PERSISTED_SENSITIVE.some((pattern) => pattern.test(value))) {
        throw new Error(`${label} is not privacy-bounded`);
    }
}
function contentText(content) {
    if (typeof content === "string")
        return content;
    if (!Array.isArray(content))
        return "";
    const allowedTypes = new Set(["text", "input_text", "output_text"]);
    return content.map((part) => {
        if (!isPlainObject(part))
            return "";
        if (typeof part.type !== "string"
            || !allowedTypes.has(part.type)) {
            return "";
        }
        if (typeof part.text === "string")
            return part.text;
        if (typeof part.input_text === "string")
            return part.input_text;
        if (typeof part.output_text === "string")
            return part.output_text;
        return "";
    }).filter(Boolean).join("\n");
}
const CONTINUITY_WRAPPER_BLOCKS = [
    /<recommended_plugins\b[^>]*>[\s\S]*?<\/recommended_plugins>/gi,
    /<environment_context\b[^>]*>[\s\S]*?<\/environment_context>/gi,
    /<permissions instructions\b[^>]*>[\s\S]*?<\/permissions instructions>/gi,
    /<appshot\b[^>]*>[\s\S]*?<\/appshot>/gi,
    /<apps_instructions\b[^>]*>[\s\S]*?<\/apps_instructions>/gi,
    /<skills_instructions\b[^>]*>[\s\S]*?<\/skills_instructions>/gi,
    /<plugins_instructions\b[^>]*>[\s\S]*?<\/plugins_instructions>/gi,
    /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi,
    /<heartbeat\b[^>]*>[\s\S]*?<\/heartbeat>/gi,
    /<summary\b[^>]*>[\s\S]*?<\/summary>/gi,
    /# AGENTS\.md instructions(?: for [^\r\n]+)?\s*<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi,
];
const CONTINUITY_ONLY_USER_TEXT = [
    /^Message Type:\s*(?:NEW_TASK|MESSAGE|FINAL_ANSWER)\b/im,
    /^The following is the Codex agent history (?:added since your last approval assessment|whose request action you are assessing)\b/i,
    /^This session is being continued from a previous conversation that ran out of context\b/i,
    /^The (?:conversation|chat) history (?:was|has been) compacted\b/i,
    /^Conversation summary(?: for continuation)?\s*:/i,
    /^You have \d[\d,]* weighted tokens left\b/i,
];
const CONTINUITY_WRAPPER_PREFIXES = [
    /^Continue working toward the active thread goal\.\s*The objective below is user-provided data\.\s*Treat it as the task to pursue, not as higher-priority instructions\.\s*/i,
];
const CODEX_IMAGE_PLACEHOLDER = /\[Image:\s*[^\]\r\n]+\]\s*\uFFFC?/giu;
const TASKMAP_AGENT_SESSION_COMPACTED_MARKER = "taskmap_agent_session_compacted_v2";
const TASKMAP_AGENT_SESSION_DISPOSITIONS = new Set([
    "acknowledgement_only",
    "continuity_only",
    "option_only",
    "terminal_control",
    "work_candidate",
]);
const TERMINAL_CONTROL_DIRECTIVES = new Set([
    "exit", "/exit", "exit()", "quit", "/quit", "quit()", "stop",
    ":q", ":q!", ":qa", ":qa!", ":cq", ":cq!", ":wq", ":wq!",
    ":x", ":x!", "zz", "zq",
]);
const ACKNOWLEDGEMENT_DIRECTIVES = new Set([
    "ok", "okay", "yes", "no", "好的", "收到",
]);
const TASKMAP_EXECUTION_RECEIPT_DIRECTIVES = [
    /package_tmauthorization_[a-f0-9]{64}\.json/i,
    /\buse the immutable task map package at this exact path\s*:/i,
    /\bapproved local task map package\s*:/i,
];
function compactedDirectiveMetadata(item) {
    const payload = isPlainObject(item.payload) ? item.payload : null;
    const source = item.taskMapAgentCompacted === TASKMAP_AGENT_SESSION_COMPACTED_MARKER
        ? item
        : payload?.taskMapAgentCompacted === TASKMAP_AGENT_SESSION_COMPACTED_MARKER
            ? payload
            : null;
    if (source === null)
        return null;
    const disposition = source.taskMapAgentDisposition;
    const semanticDigest = source.taskMapAgentDirectiveSemanticDigest;
    const message = messageRoleAndContent(item, item.type === "response_item" ? "codex" : "claude");
    const summary = sanitizedSummary(message === null ? "" : contentText(message.content), exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxUserDirectiveCharacters);
    if (!TASKMAP_AGENT_SESSION_DISPOSITIONS.has(disposition)
        || typeof semanticDigest !== "string"
        || !SHA256.test(semanticDigest)
        || !summary) {
        return null;
    }
    return {
        disposition: disposition,
        directiveSemanticDigest: semanticDigest,
        userDirectiveSummary: summary,
    };
}
function classifyDirective(privacySafeDirective) {
    const canonical = privacySafeDirective
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    if (TERMINAL_CONTROL_DIRECTIVES.has(canonical)) {
        return "terminal_control";
    }
    if (ACKNOWLEDGEMENT_DIRECTIVES.has(canonical)) {
        return "acknowledgement_only";
    }
    if (/^\d{1,2}$/.test(canonical))
        return "option_only";
    return "work_candidate";
}
function isTaskMapExecutionReceiptDirective(value) {
    const canonical = (0, text_contract_js_1.toWellFormedText)(value)
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
    return TASKMAP_EXECUTION_RECEIPT_DIRECTIVES.some((pattern) => pattern.test(canonical));
}
function classifyTaskMapAgentSessionDirectiveForGraph(value) {
    if (isTaskMapExecutionReceiptDirective(value)) {
        return "execution_receipt";
    }
    return classifyDirective(privacySanitizedText(value));
}
/**
 * Pure traversal guard for the native collector. Claude stores delegated
 * sessions below `subagents/`; those files are receipts of delegation rather
 * than independent owner work. Codex paths retain their existing behavior.
 */
function isTaskMapAgentSessionDiscoveryPathEligible(provider, candidatePath) {
    if (provider !== "claude")
        return true;
    return !candidatePath
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .some((segment) => segment.normalize("NFKC").toLowerCase() === "subagents");
}
function analyzeUserDirective(item, text) {
    const compacted = compactedDirectiveMetadata(item);
    if (compacted !== null)
        return compacted;
    const message = isPlainObject(item.message) ? item.message : null;
    if (item.isMeta === true
        || item.is_meta === true
        || message?.isMeta === true
        || message?.is_meta === true) {
        return null;
    }
    const trimmed = text.trim();
    if (!trimmed)
        return null;
    const explicitContinuity = CONTINUITY_ONLY_USER_TEXT.some((pattern) => pattern.test(trimmed));
    let removedContinuityWrapper = false;
    let unwrapped = trimmed;
    for (const pattern of CONTINUITY_WRAPPER_BLOCKS) {
        const before = unwrapped;
        unwrapped = unwrapped.replace(pattern, " ");
        removedContinuityWrapper ||= before !== unwrapped;
    }
    for (const pattern of CONTINUITY_WRAPPER_PREFIXES) {
        unwrapped = unwrapped.replace(pattern, "");
    }
    const beforeImageRemoval = unwrapped;
    unwrapped = unwrapped.replace(CODEX_IMAGE_PLACEHOLDER, " ");
    unwrapped = unwrapped.replace(/\s+/g, " ").trim();
    if (!unwrapped
        && beforeImageRemoval !== unwrapped
        && !explicitContinuity
        && !removedContinuityWrapper) {
        return null;
    }
    const continuityOnly = !unwrapped
        || explicitContinuity
        || CONTINUITY_ONLY_USER_TEXT.some((pattern) => pattern.test(unwrapped));
    const privacySafeDirective = continuityOnly
        ? "Session continuity"
        : privacySanitizedText(unwrapped);
    if (!privacySafeDirective)
        return null;
    const disposition = continuityOnly
        ? "continuity_only"
        : classifyDirective(privacySafeDirective);
    return {
        disposition,
        directiveSemanticDigest: directiveSemanticDigest(continuityOnly ? "" : privacySafeDirective),
        userDirectiveSummary: (0, text_contract_js_1.boundedUtf16)(privacySafeDirective, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxUserDirectiveCharacters),
    };
}
function opaqueIdentity(value, label) {
    if (typeof value !== "string"
        || value.length === 0
        || CONTROL_CHARACTER.test(value)
        || Buffer.byteLength(value, "utf8")
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxNativeIdentityBytes) {
        return null;
    }
    return value;
}
function identityDigest(provider, nativeIdentity) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_AGENT_SESSION_IDENTITY_DOMAIN,
        provider,
        nativeIdentity,
    });
}
function routingIdentityDigest(domain, provider, nativeIdentity) {
    return (0, source_contracts_js_1.taskMapContractDigest)({ domain, provider, nativeIdentity });
}
function providerNeutralRoutingIdentityDigest(domain, ownerScopeDigest, nativeIdentity) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain,
        ownerScopeDigest,
        nativeIdentity: nativeIdentity.normalize("NFKC"),
    });
}
function boundedRoutingIdentities(values) {
    const unique = new Set();
    for (const value of values) {
        const bounded = opaqueIdentity(value, "routing identity");
        if (bounded !== null)
            unique.add(bounded);
    }
    return [...unique]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
        .maxRoutingIdentityDigestsPerKind);
}
function routingIdentities(item, provider, ownerScopeDigest) {
    const payload = isPlainObject(item.payload) ? item.payload : null;
    const projectKeys = ["cwd", "project", "projectPath", "project_path"];
    const repositoryKeys = [
        "repository",
        "repositoryPath",
        "repository_path",
        "repo",
        "repoPath",
        "repo_path",
    ];
    const projectRoutingPresent = projectKeys.some((key) => hasOwn(item, key) || hasOwn(payload, key));
    const repositoryRoutingPresent = repositoryKeys.some((key) => hasOwn(item, key) || hasOwn(payload, key)) || hasOwn(payload, "workspace_roots")
        || hasOwn(payload, "workspaceRoots");
    const workspaceRoots = Array.isArray(payload?.workspace_roots)
        ? payload.workspace_roots
        : Array.isArray(payload?.workspaceRoots)
            ? payload.workspaceRoots
            : [];
    const projects = boundedRoutingIdentities([
        item.cwd,
        item.project,
        item.projectPath,
        item.project_path,
        payload?.cwd,
        payload?.project,
        payload?.projectPath,
        payload?.project_path,
    ]);
    const repositories = boundedRoutingIdentities([
        ...workspaceRoots,
        item.repository,
        item.repositoryPath,
        item.repository_path,
        item.repo,
        item.repoPath,
        item.repo_path,
        payload?.repository,
        payload?.repositoryPath,
        payload?.repository_path,
        payload?.repo,
        payload?.repoPath,
        payload?.repo_path,
    ]);
    return {
        project: !projectRoutingPresent
            ? null
            : projects.map((value) => routingIdentityDigest(exports.TASKMAP_AGENT_SESSION_PROJECT_ROUTING_DOMAIN, provider, value)).sort((left, right) => left.localeCompare(right)),
        repository: !repositoryRoutingPresent
            ? null
            : repositories.map((value) => routingIdentityDigest(exports.TASKMAP_AGENT_SESSION_REPOSITORY_ROUTING_DOMAIN, provider, value)).sort((left, right) => left.localeCompare(right)),
        providerNeutralProject: !projectRoutingPresent
            ? null
            : projects.map((value) => providerNeutralRoutingIdentityDigest(exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN, ownerScopeDigest, value)).sort((left, right) => left.localeCompare(right)),
        providerNeutralRepository: !repositoryRoutingPresent
            ? null
            : repositories.map((value) => providerNeutralRoutingIdentityDigest(exports.TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN, ownerScopeDigest, value)).sort((left, right) => left.localeCompare(right)),
    };
}
function nativeUserTurnIdentity(item) {
    const payload = isPlainObject(item.payload) ? item.payload : null;
    const message = isPlainObject(item.message) ? item.message : null;
    const candidates = [
        item.uuid,
        item.id,
        item.messageId,
        item.message_id,
        payload?.uuid,
        payload?.id,
        payload?.messageId,
        payload?.message_id,
        payload?.turnId,
        payload?.turn_id,
        message?.uuid,
        message?.id,
    ];
    for (const candidate of candidates) {
        const bounded = opaqueIdentity(candidate, "user turn identity");
        if (bounded !== null)
            return bounded;
    }
    return null;
}
function messageRoleAndContent(item, provider) {
    if (provider === "codex"
        && item.type === "response_item"
        && isPlainObject(item.payload)
        && item.payload.type === "message") {
        return {
            role: item.payload.role,
            content: item.payload.content,
        };
    }
    if (provider !== "claude")
        return null;
    const message = isPlainObject(item.message) ? item.message : null;
    if (item.type !== "user"
        && item.type !== "assistant"
        && message?.role !== "user"
        && message?.role !== "assistant") {
        return null;
    }
    return {
        role: item.type === "user" || item.type === "assistant"
            ? item.type
            : message?.role,
        content: message?.content ?? item.content,
    };
}
const COMPACTED_ROUTING_SCALAR_KEYS = [
    "cwd",
    "project",
    "projectPath",
    "project_path",
    "repository",
    "repositoryPath",
    "repository_path",
    "repo",
    "repoPath",
    "repo_path",
];
function compactedTimestamp(item) {
    try {
        return canonicalTimestamp(item.timestamp, "session timestamp");
    }
    catch {
        return null;
    }
}
function compactedRoutingFields(value) {
    if (value === null)
        return {};
    const fields = {};
    for (const key of COMPACTED_ROUTING_SCALAR_KEYS) {
        const bounded = opaqueIdentity(value[key], "routing identity");
        if (bounded !== null)
            fields[key] = bounded;
    }
    for (const key of ["workspace_roots", "workspaceRoots"]) {
        if (!Array.isArray(value[key]))
            continue;
        fields[key] = boundedRoutingIdentities(value[key]);
    }
    return fields;
}
function compactedClaudeSessionFields(item) {
    const fields = {};
    const sessionIdentity = opaqueIdentity(item.sessionId ?? item.session_id, "Claude session identity");
    const parentIdentity = opaqueIdentity(item.parentSessionId ?? item.parent_session_id, "Claude parent session identity");
    if (sessionIdentity !== null)
        fields.sessionId = sessionIdentity;
    if (parentIdentity !== null)
        fields.parentSessionId = parentIdentity;
    return fields;
}
/**
 * Reduces one already byte-bounded JSONL row to only the fields consumed by
 * the episode parser. Tool/system/reasoning/compaction/delegation rows return
 * null. User and assistant text is privacy-sanitized and character-bounded
 * before it can enter the in-memory compacted observation.
 */
function compactTaskMapAgentSessionJsonlLine(provider, rawLine) {
    let parsed;
    try {
        parsed = JSON.parse(rawLine);
    }
    catch {
        return null;
    }
    if (!isPlainObject(parsed))
        return null;
    const item = parsed;
    const payload = isPlainObject(item.payload) ? item.payload : null;
    const timestamp = compactedTimestamp(item);
    if (provider === "codex" && item.type === "session_meta") {
        const nativeIdentity = opaqueIdentity(payload?.id, "Codex session identity");
        if (nativeIdentity === null)
            return null;
        const compactedPayload = {
            id: nativeIdentity,
        };
        const parentIdentity = opaqueIdentity(payload?.parent_id ?? payload?.parentId, "Codex parent session identity");
        if (parentIdentity !== null) {
            compactedPayload.parent_id = parentIdentity;
        }
        const compacted = {
            type: "session_meta",
            payload: compactedPayload,
        };
        if (timestamp !== null)
            compacted.timestamp = timestamp;
        return {
            kind: "identity",
            jsonlLine: (0, source_contracts_js_1.taskMapContractCanonicalJson)(compacted),
        };
    }
    const topLevelRouting = compactedRoutingFields(item);
    const payloadRouting = compactedRoutingFields(payload);
    const routingPresent = Object.keys(topLevelRouting).length > 0
        || Object.keys(payloadRouting).length > 0;
    const message = messageRoleAndContent(item, provider);
    if (message === null) {
        if (!routingPresent)
            return null;
        const compacted = provider === "codex"
            ? {
                ...topLevelRouting,
                type: "turn_context",
                payload: payloadRouting,
            }
            : {
                ...compactedClaudeSessionFields(item),
                ...topLevelRouting,
                type: "routing",
                payload: payloadRouting,
            };
        if (timestamp !== null)
            compacted.timestamp = timestamp;
        return {
            kind: "routing",
            jsonlLine: (0, source_contracts_js_1.taskMapContractCanonicalJson)(compacted),
        };
    }
    if (timestamp === null)
        return null;
    let summary;
    let kind;
    let analyzedDirective = null;
    if (message.role === "user") {
        analyzedDirective = analyzeUserDirective(item, contentText(message.content));
        if (analyzedDirective === null)
            return null;
        summary = analyzedDirective.userDirectiveSummary;
        kind = "user";
    }
    else if (message.role === "assistant") {
        summary = sanitizedSummary(contentText(message.content), exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
            .maxAssistantOutcomeCharacters);
        kind = "assistant";
    }
    else {
        return null;
    }
    if (!summary)
        return null;
    let compacted;
    if (provider === "codex") {
        const compactedPayload = {
            ...payloadRouting,
            type: "message",
            role: message.role,
            content: [{
                    type: kind === "user" ? "input_text" : "output_text",
                    text: summary,
                }],
        };
        if (kind === "user") {
            compactedPayload.taskMapAgentCompacted =
                TASKMAP_AGENT_SESSION_COMPACTED_MARKER;
            compactedPayload.taskMapAgentDisposition =
                analyzedDirective?.disposition;
            compactedPayload.taskMapAgentDirectiveSemanticDigest =
                analyzedDirective?.directiveSemanticDigest;
            const nativeTurnIdentity = nativeUserTurnIdentity(item);
            if (nativeTurnIdentity !== null) {
                compactedPayload.id = nativeTurnIdentity;
            }
        }
        compacted = {
            ...topLevelRouting,
            timestamp,
            type: "response_item",
            payload: compactedPayload,
        };
    }
    else {
        compacted = {
            ...compactedClaudeSessionFields(item),
            ...topLevelRouting,
            timestamp,
            type: message.role,
            message: {
                role: message.role,
                content: [{ type: "text", text: summary }],
            },
        };
        if (Object.keys(payloadRouting).length > 0) {
            compacted.payload = payloadRouting;
        }
        if (kind === "user") {
            compacted.taskMapAgentCompacted =
                TASKMAP_AGENT_SESSION_COMPACTED_MARKER;
            compacted.taskMapAgentDisposition = analyzedDirective?.disposition;
            compacted.taskMapAgentDirectiveSemanticDigest =
                analyzedDirective?.directiveSemanticDigest;
            const nativeTurnIdentity = nativeUserTurnIdentity(item);
            if (nativeTurnIdentity !== null) {
                compacted.uuid = nativeTurnIdentity;
            }
        }
    }
    return {
        kind,
        jsonlLine: (0, source_contracts_js_1.taskMapContractCanonicalJson)(compacted),
    };
}
function freezeWorkEpisode(draft) {
    const base = {
        episodeIdentityDigest: draft.episodeIdentityDigest,
        turnLineageIdentityDigest: draft.turnLineageIdentityDigest,
        directiveSemanticDigest: draft.directiveSemanticDigest,
        disposition: draft.disposition,
        rootSessionIdentityDigest: draft.rootSessionIdentityDigest,
        parentRootSessionIdentityDigest: draft.parentRootSessionIdentityDigest,
        provider: draft.provider,
        semanticUnit: "bounded_user_turn_work_episode",
        recordKind: "work_context",
        proposalDisposition: "candidate_or_context_only",
        authority: "none",
        acceptedMembershipAuthority: false,
        lifecycleAuthority: false,
        completionAuthority: false,
        verificationAuthority: false,
        occurredAt: draft.occurredAt,
        observedAt: draft.observedAt,
        routing: draft.routing,
        userDirectiveSummary: draft.userDirectiveSummary,
        assistantOutcomeSummary: draft.assistantOutcomeSummary,
    };
    const episodeRevisionDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    return {
        ...base,
        episodeId: stableId("tmaepisode", draft.episodeIdentityDigest),
        episodeRevisionDigest,
    };
}
function compareEpisodeRecency(left, right) {
    const occurred = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    if (occurred !== 0)
        return occurred;
    const observed = Date.parse(right.observedAt) - Date.parse(left.observedAt);
    if (observed !== 0)
        return observed;
    return left.episodeId.localeCompare(right.episodeId);
}
function parseObservation(observation, ownerScopeDigest, producedAt, remainingGlobalBytes, limits) {
    if (!isPlainObject(observation)
        || (observation.provider !== "codex" && observation.provider !== "claude")
        || typeof observation.rawJsonl !== "string"
        || (observation.coverage !== undefined
            && observation.coverage !== "complete"
            && observation.coverage !== "partial")) {
        return { status: "rejected", reason: "malformed" };
    }
    const rawBytes = Buffer.byteLength(observation.rawJsonl, "utf8");
    if (rawBytes === 0
        || rawBytes
            > limits.maxRawBytesPerObservation
        || rawBytes > remainingGlobalBytes) {
        return { status: "rejected", reason: "oversize" };
    }
    const lines = observation.rawJsonl.split(/\r?\n/);
    if (lines.length
        > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxLinesPerObservation) {
        return { status: "rejected", reason: "oversize" };
    }
    let nativeSessionIdentity = null;
    let nativeParentIdentity = null;
    const parsedLines = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        if (Buffer.byteLength(line, "utf8")
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxLineBytes) {
            return { status: "rejected", reason: "oversize" };
        }
        let item;
        try {
            item = JSON.parse(line);
        }
        catch {
            return { status: "rejected", reason: "malformed" };
        }
        if (!isPlainObject(item)) {
            return { status: "rejected", reason: "malformed" };
        }
        let timestamp = null;
        if (typeof item.timestamp === "string") {
            try {
                timestamp = canonicalTimestamp(item.timestamp, "session timestamp");
                if (Date.parse(timestamp) > Date.parse(producedAt)) {
                    return { status: "rejected", reason: "malformed" };
                }
            }
            catch {
                return { status: "rejected", reason: "malformed" };
            }
        }
        if (observation.provider === "codex" && item.type === "session_meta") {
            const payload = isPlainObject(item.payload) ? item.payload : null;
            const candidate = opaqueIdentity(payload?.id, "Codex session identity");
            if (candidate !== null
                && nativeSessionIdentity !== null
                && candidate !== nativeSessionIdentity) {
                return { status: "rejected", reason: "malformed" };
            }
            nativeSessionIdentity = candidate ?? nativeSessionIdentity;
            const parent = opaqueIdentity(payload?.parent_id ?? payload?.parentId, "Codex parent session identity");
            if (parent !== null
                && nativeParentIdentity !== null
                && parent !== nativeParentIdentity) {
                return { status: "rejected", reason: "malformed" };
            }
            nativeParentIdentity = parent ?? nativeParentIdentity;
        }
        if (observation.provider === "claude") {
            const candidate = opaqueIdentity(item.sessionId ?? item.session_id, "Claude session identity");
            if (candidate !== null
                && nativeSessionIdentity !== null
                && candidate !== nativeSessionIdentity) {
                return { status: "rejected", reason: "malformed" };
            }
            nativeSessionIdentity = candidate ?? nativeSessionIdentity;
            const parent = opaqueIdentity(item.parentSessionId ?? item.parent_session_id, "Claude parent session identity");
            if (parent !== null
                && nativeParentIdentity !== null
                && parent !== nativeParentIdentity) {
                return { status: "rejected", reason: "malformed" };
            }
            nativeParentIdentity = parent ?? nativeParentIdentity;
        }
        parsedLines.push({ item, timestamp });
    }
    if (nativeSessionIdentity === null) {
        return { status: "rejected", reason: "missingIdentity" };
    }
    const rootSessionIdentityDigest = identityDigest(observation.provider, nativeSessionIdentity);
    const parentRootSessionIdentityDigest = nativeParentIdentity === null
        ? null
        : identityDigest(observation.provider, nativeParentIdentity);
    let projectIdentityDigests = [];
    let repositoryIdentityDigests = [];
    let providerNeutralProjectIdentityDigests = [];
    let providerNeutralRepositoryIdentityDigests = [];
    let current = null;
    const workEpisodes = [];
    let userOrdinal = 0;
    let graphExecutionReceiptSeen = false;
    const finishCurrent = () => {
        if (current === null)
            return;
        workEpisodes.push(freezeWorkEpisode(current));
        current = null;
    };
    for (const { item, timestamp } of parsedLines) {
        const routing = routingIdentities(item, observation.provider, ownerScopeDigest);
        if (routing.project !== null) {
            projectIdentityDigests = routing.project;
        }
        if (routing.repository !== null) {
            repositoryIdentityDigests = routing.repository;
        }
        if (routing.providerNeutralProject !== null) {
            providerNeutralProjectIdentityDigests =
                routing.providerNeutralProject;
        }
        if (routing.providerNeutralRepository !== null) {
            providerNeutralRepositoryIdentityDigests =
                routing.providerNeutralRepository;
        }
        const message = messageRoleAndContent(item, observation.provider);
        if (message === null)
            continue;
        const text = contentText(message.content);
        if (message.role === "user") {
            const graphExecutionReceipt = limits.excludeExecutionReceipts
                && isTaskMapExecutionReceiptDirective(text);
            const analyzedDirective = analyzeUserDirective(item, text);
            if (analyzedDirective === null || timestamp === null)
                continue;
            finishCurrent();
            if (graphExecutionReceipt) {
                graphExecutionReceiptSeen = true;
                userOrdinal += 1;
                continue;
            }
            const nativeTurnIdentity = nativeUserTurnIdentity(item);
            const fallbackIdentity = nativeTurnIdentity === null
                ? {
                    occurredAt: timestamp,
                    userOrdinal,
                    directiveSemanticDigest: analyzedDirective.directiveSemanticDigest,
                }
                : null;
            const episodeIdentityDigest = (0, source_contracts_js_1.taskMapContractDigest)({
                domain: exports.TASKMAP_AGENT_SESSION_EPISODE_IDENTITY_DOMAIN,
                provider: observation.provider,
                rootSessionIdentityDigest,
                nativeTurnIdentity,
                fallbackIdentity,
            });
            const turnLineageIdentityDigest = nativeTurnIdentity === null
                ? analyzedDirective.directiveSemanticDigest
                : (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: exports.TASKMAP_AGENT_SESSION_TURN_LINEAGE_IDENTITY_DOMAIN,
                    provider: observation.provider,
                    nativeUserTurnIdentity: nativeTurnIdentity,
                });
            current = {
                episodeIdentityDigest,
                turnLineageIdentityDigest,
                directiveSemanticDigest: analyzedDirective.directiveSemanticDigest,
                disposition: analyzedDirective.disposition,
                rootSessionIdentityDigest,
                parentRootSessionIdentityDigest,
                provider: observation.provider,
                occurredAt: timestamp,
                observedAt: timestamp,
                routing: {
                    role: "routing_metadata_only",
                    projectIdentityDigests: [...projectIdentityDigests],
                    repositoryIdentityDigests: [...repositoryIdentityDigests],
                    providerNeutralProjectIdentityDigests: [
                        ...providerNeutralProjectIdentityDigests,
                    ],
                    providerNeutralRepositoryIdentityDigests: [
                        ...providerNeutralRepositoryIdentityDigests,
                    ],
                },
                userDirectiveSummary: analyzedDirective.userDirectiveSummary,
                assistantOutcomeSummary: null,
            };
            userOrdinal += 1;
            continue;
        }
        if (message.role !== "assistant" || current === null || timestamp === null) {
            continue;
        }
        const assistantOutcomeSummary = sanitizedSummary(text, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
            .maxAssistantOutcomeCharacters);
        if (!assistantOutcomeSummary)
            continue;
        current.assistantOutcomeSummary = assistantOutcomeSummary;
        current.observedAt = timestamp;
    }
    finishCurrent();
    if (workEpisodes.length === 0) {
        if (graphExecutionReceiptSeen) {
            return {
                status: "accepted",
                sessions: [],
                episodeOverflow: 0,
                coverage: observation.coverage ?? "complete",
            };
        }
        return { status: "rejected", reason: "missingUserRequest" };
    }
    const contextCutoffMs = Date.parse(producedAt) - exports.TASKMAP_AGENT_SESSION_CONTEXT_WINDOW_MS;
    const newest = workEpisodes
        .filter((episode) => Date.parse(episode.occurredAt) >= contextCutoffMs)
        .sort(compareEpisodeRecency);
    const retained = limits.maxEpisodesPerRootSession === null
        ? newest
        : newest.slice(0, limits.maxEpisodesPerRootSession);
    return {
        status: "accepted",
        sessions: retained,
        episodeOverflow: newest.length - retained.length,
        coverage: observation.coverage ?? "complete",
    };
}
function snapshotPayload(snapshot) {
    return snapshot;
}
function buildTaskMapAgentSessionProducerSnapshot(input) {
    assertPlainObject(input, "agent session producer draft");
    assertClosedKeys(input, ["ownerScopeDigest", "observations", "producedAt"], "agent session producer draft");
    assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
    const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
    if (!Array.isArray(input.observations)
        || input.observations.length
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxObservations) {
        throw new Error("observations exceed their producer limit");
    }
    const rejections = {
        malformed: 0,
        oversize: 0,
        missingIdentity: 0,
        missingUserRequest: 0,
        episodeOverflow: 0,
    };
    const acceptedByIdentity = new Map();
    let chargedBytes = 0;
    let partialObservationAccepted = false;
    let acceptedObservation = false;
    for (const observation of input.observations) {
        const remaining = exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxRawBytesGlobal
            - chargedBytes;
        const parsed = parseObservation(observation, input.ownerScopeDigest, producedAt, remaining, {
            maxRawBytesPerObservation: exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxRawBytesPerObservation,
            maxEpisodesPerRootSession: exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxEpisodesPerRootSession,
            excludeExecutionReceipts: false,
        });
        if (isPlainObject(observation)
            && typeof observation.rawJsonl === "string") {
            chargedBytes += Math.min(Buffer.byteLength(observation.rawJsonl, "utf8"), Math.max(remaining, 0));
        }
        if (parsed.status === "rejected") {
            rejections[parsed.reason] += 1;
            continue;
        }
        acceptedObservation = true;
        rejections.episodeOverflow += parsed.episodeOverflow;
        partialObservationAccepted ||= parsed.coverage === "partial";
        for (const episode of parsed.sessions) {
            const previous = acceptedByIdentity.get(episode.episodeIdentityDigest);
            if (previous === undefined
                || Date.parse(episode.observedAt) > Date.parse(previous.observedAt)
                || (episode.observedAt === previous.observedAt
                    && episode.episodeRevisionDigest
                        < previous.episodeRevisionDigest)) {
                acceptedByIdentity.set(episode.episodeIdentityDigest, episode);
            }
        }
    }
    if (input.observations.length > 0 && !acceptedObservation) {
        throw new Error("no bounded agent session evidence was accepted");
    }
    const byRoot = new Map();
    for (const episode of acceptedByIdentity.values()) {
        const rootEpisodes = byRoot.get(episode.rootSessionIdentityDigest) ?? [];
        rootEpisodes.push(episode);
        byRoot.set(episode.rootSessionIdentityDigest, rootEpisodes);
    }
    const perRootBounded = [];
    for (const rootEpisodes of byRoot.values()) {
        const newest = rootEpisodes.sort(compareEpisodeRecency);
        const retained = newest.slice(0, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxEpisodesPerRootSession);
        rejections.episodeOverflow += newest.length - retained.length;
        perRootBounded.push(...retained);
    }
    const globallyNewest = perRootBounded.sort(compareEpisodeRecency);
    const globallyBounded = globallyNewest.slice(0, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxEpisodesGlobal);
    rejections.episodeOverflow += globallyNewest.length - globallyBounded.length;
    const sessions = globallyBounded.sort((left, right) => left.episodeId.localeCompare(right.episodeId));
    const rejectedCount = Object.values(rejections).reduce((sum, count) => sum + count, 0);
    const coverage = input.observations.length === 0
        ? "fresh_empty"
        : rejectedCount > 0 || partialObservationAccepted
            ? "partial"
            : "complete";
    const validThrough = new Date(Date.parse(producedAt)
        + exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS).toISOString();
    const watermarkRows = sessions.map((episode) => ({
        episodeIdentityDigest: episode.episodeIdentityDigest,
        episodeRevisionDigest: episode.episodeRevisionDigest,
    }));
    const observedThrough = sessions.length === 0
        ? producedAt
        : sessions.map((session) => session.observedAt)
            .reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
    const base = snapshotPayload({
        contractVersion: exports.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION,
        producerVersion: exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION,
        ownerScopeDigest: input.ownerScopeDigest,
        producedAt,
        validThrough,
        maxAgeMs: exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS,
        coverage,
        observedCount: input.observations.length,
        rejections,
        watermark: {
            kind: "episode_revision",
            valueDigest: (0, source_contracts_js_1.taskMapContractDigest)(watermarkRows),
            observedThrough,
        },
        sessions,
        privacy: PRIVACY,
    });
    const snapshotDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    const snapshot = {
        ...base,
        snapshotId: stableId("tmassnapshot", snapshotDigest),
        snapshotDigest,
    };
    assertTaskMapAgentSessionProducerSnapshot(snapshot);
    return deepFreeze(snapshot);
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
function compareGraphEpisodeChronology(left, right) {
    const occurred = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (occurred !== 0)
        return occurred;
    const observed = Date.parse(left.observedAt) - Date.parse(right.observedAt);
    if (observed !== 0)
        return observed;
    return compareCodePoint(left.episodeId, right.episodeId);
}
/**
 * Validates the wider graph-only observation feed, deduplicates immutable
 * episode revisions, and retains the first and latest real directive for each
 * native root. It intentionally does not call or widen the persisted producer.
 */
function selectTaskMapAgentSessionGraphEpisodeCandidates(input) {
    assertPlainObject(input, "agent session graph episode selection draft");
    assertClosedKeys(input, ["ownerScopeDigest", "observations", "producedAt"], "agent session graph episode selection draft");
    assertDigest(input.ownerScopeDigest, "ownerScopeDigest");
    const producedAt = canonicalTimestamp(input.producedAt, "producedAt");
    if (!Array.isArray(input.observations)
        || input.observations.length > exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxObservations) {
        throw new Error("observations exceed their graph feed limit");
    }
    let totalRawBytes = 0;
    input.observations.forEach((observation, index) => {
        if (isPlainObject(observation)
            && typeof observation.rawJsonl === "string") {
            const rawBytes = Buffer.byteLength(observation.rawJsonl, "utf8");
            if (rawBytes > exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesPerObservation) {
                throw new Error(`graph observation ${index} exceeds its byte limit`);
            }
            totalRawBytes += rawBytes;
            if (totalRawBytes > exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesGlobal) {
                throw new Error("observations exceed their graph feed byte limit");
            }
        }
    });
    const acceptedByIdentity = new Map();
    let chargedBytes = 0;
    input.observations.forEach((observation, index) => {
        const parsed = parseObservation(observation, input.ownerScopeDigest, producedAt, exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesGlobal - chargedBytes, {
            maxRawBytesPerObservation: exports.TASKMAP_GRAPH_BRAIN_LIMITS_V1.maxRawBytesPerObservation,
            maxEpisodesPerRootSession: null,
            excludeExecutionReceipts: true,
        });
        if (parsed.status === "rejected") {
            throw new Error(`graph observation ${index} is not eligible: ${parsed.reason}`);
        }
        chargedBytes += Buffer.byteLength(observation.rawJsonl, "utf8");
        for (const episode of parsed.sessions) {
            const previous = acceptedByIdentity.get(episode.episodeIdentityDigest);
            if (previous === undefined
                || Date.parse(episode.observedAt) > Date.parse(previous.observedAt)
                || (episode.observedAt === previous.observedAt
                    && compareCodePoint(episode.episodeRevisionDigest, previous.episodeRevisionDigest) < 0)) {
                acceptedByIdentity.set(episode.episodeIdentityDigest, episode);
            }
        }
    });
    const recurrenceEpisodes = [...acceptedByIdentity.values()]
        .filter((episode) => !(episode.disposition !== "work_candidate"
        || classifyTaskMapAgentSessionDirectiveForGraph(episode.userDirectiveSummary) === "execution_receipt"))
        .sort((left, right) => compareCodePoint(left.episodeId, right.episodeId));
    const byRoot = new Map();
    for (const episode of recurrenceEpisodes) {
        const rootEpisodes = byRoot.get(episode.rootSessionIdentityDigest) ?? [];
        rootEpisodes.push(episode);
        byRoot.set(episode.rootSessionIdentityDigest, rootEpisodes);
    }
    const boundaryEpisodes = new Map();
    for (const rootEpisodes of byRoot.values()) {
        rootEpisodes.sort(compareGraphEpisodeChronology);
        const first = rootEpisodes[0];
        const latest = rootEpisodes.at(-1);
        if (first !== undefined) {
            boundaryEpisodes.set(first.episodeIdentityDigest, first);
        }
        if (latest !== undefined) {
            boundaryEpisodes.set(latest.episodeIdentityDigest, latest);
        }
    }
    const episodes = [...boundaryEpisodes.values()].sort((left, right) => compareCodePoint(left.episodeId, right.episodeId));
    episodes.forEach((episode, index) => assertSession(episode, `graph episodes[${index}]`));
    return deepFreeze({
        ownerScopeDigest: input.ownerScopeDigest,
        producedAt,
        observedCount: input.observations.length,
        recurrenceEpisodes,
        episodes,
    });
}
function assertRouting(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, [
        "projectIdentityDigests",
        "providerNeutralProjectIdentityDigests",
        "providerNeutralRepositoryIdentityDigests",
        "repositoryIdentityDigests",
        "role",
    ], label);
    if (value.role !== "routing_metadata_only") {
        throw new Error(`${label}.role is invalid`);
    }
    for (const key of [
        "projectIdentityDigests",
        "providerNeutralProjectIdentityDigests",
        "providerNeutralRepositoryIdentityDigests",
        "repositoryIdentityDigests",
    ]) {
        const digests = value[key];
        if (!Array.isArray(digests)
            || digests.length
                > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                    .maxRoutingIdentityDigestsPerKind) {
            throw new Error(`${label}.${key} exceeds its limit`);
        }
        digests.forEach((digest, index) => assertDigest(digest, `${label}.${key}[${index}]`));
        const expected = [...digests].sort((left, right) => left.localeCompare(right));
        if (new Set(digests).size !== digests.length
            || digests.some((digest, index) => digest !== expected[index])) {
            throw new Error(`${label}.${key} is not canonical`);
        }
    }
}
function assertSession(value, label) {
    assertPlainObject(value, label);
    assertClosedKeys(value, [
        "acceptedMembershipAuthority",
        "assistantOutcomeSummary",
        "authority",
        "completionAuthority",
        "directiveSemanticDigest",
        "disposition",
        "episodeId",
        "episodeIdentityDigest",
        "episodeRevisionDigest",
        "lifecycleAuthority",
        "observedAt",
        "occurredAt",
        "parentRootSessionIdentityDigest",
        "proposalDisposition",
        "provider",
        "recordKind",
        "rootSessionIdentityDigest",
        "routing",
        "semanticUnit",
        "turnLineageIdentityDigest",
        "userDirectiveSummary",
        "verificationAuthority",
    ], label);
    assertStableId(value.episodeId, `${label}.episodeId`);
    assertDigest(value.episodeIdentityDigest, `${label}.episodeIdentityDigest`);
    assertDigest(value.turnLineageIdentityDigest, `${label}.turnLineageIdentityDigest`);
    assertDigest(value.directiveSemanticDigest, `${label}.directiveSemanticDigest`);
    assertDigest(value.rootSessionIdentityDigest, `${label}.rootSessionIdentityDigest`);
    if (value.parentRootSessionIdentityDigest !== null) {
        assertDigest(value.parentRootSessionIdentityDigest, `${label}.parentRootSessionIdentityDigest`);
    }
    assertDigest(value.episodeRevisionDigest, `${label}.episodeRevisionDigest`);
    if (value.provider !== "codex" && value.provider !== "claude") {
        throw new Error(`${label}.provider is invalid`);
    }
    if (!TASKMAP_AGENT_SESSION_DISPOSITIONS.has(value.disposition)) {
        throw new Error(`${label}.disposition is invalid`);
    }
    if (value.semanticUnit !== "bounded_user_turn_work_episode"
        || value.recordKind !== "work_context"
        || value.proposalDisposition !== "candidate_or_context_only"
        || value.authority !== "none"
        || value.acceptedMembershipAuthority !== false
        || value.lifecycleAuthority !== false
        || value.completionAuthority !== false
        || value.verificationAuthority !== false) {
        throw new Error(`${label} exceeds agent session source authority`);
    }
    const occurredAt = canonicalTimestamp(value.occurredAt, `${label}.occurredAt`);
    const observedAt = canonicalTimestamp(value.observedAt, `${label}.observedAt`);
    if (Date.parse(occurredAt) > Date.parse(observedAt)) {
        throw new Error(`${label} timestamps are inconsistent`);
    }
    assertPersistedSummary(value.userDirectiveSummary, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxUserDirectiveCharacters, `${label}.userDirectiveSummary`);
    assertPersistedSummary(value.assistantOutcomeSummary, exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
        .maxAssistantOutcomeCharacters, `${label}.assistantOutcomeSummary`, true);
    assertRouting(value.routing, `${label}.routing`);
    const { episodeId, episodeRevisionDigest, ...base } = value;
    if (episodeId !== stableId("tmaepisode", value.episodeIdentityDigest)
        || episodeRevisionDigest !== (0, source_contracts_js_1.taskMapContractDigest)(base)) {
        throw new Error(`${label} identity or revision is inconsistent`);
    }
}
function assertTaskMapAgentSessionProducerSnapshot(value) {
    assertPlainObject(value, "agent session producer snapshot");
    assertClosedKeys(value, [
        "contractVersion",
        "coverage",
        "maxAgeMs",
        "observedCount",
        "ownerScopeDigest",
        "privacy",
        "producedAt",
        "producerVersion",
        "rejections",
        "sessions",
        "snapshotDigest",
        "snapshotId",
        "validThrough",
        "watermark",
    ], "agent session producer snapshot");
    if (value.contractVersion !== exports.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION
        || value.producerVersion !== exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION) {
        throw new Error("agent session producer version is unsupported");
    }
    assertStableId(value.snapshotId, "snapshotId");
    assertDigest(value.snapshotDigest, "snapshotDigest");
    assertDigest(value.ownerScopeDigest, "ownerScopeDigest");
    const producedAt = canonicalTimestamp(value.producedAt, "producedAt");
    const validThrough = canonicalTimestamp(value.validThrough, "validThrough");
    if (value.maxAgeMs !== exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS
        || Date.parse(validThrough) - Date.parse(producedAt)
            !== exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS) {
        throw new Error("agent session producer freshness interval is invalid");
    }
    if (value.coverage !== "complete"
        && value.coverage !== "partial"
        && value.coverage !== "fresh_empty") {
        throw new Error("coverage is invalid");
    }
    if (!Number.isSafeInteger(value.observedCount)
        || value.observedCount < 0
        || value.observedCount
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxObservations) {
        throw new Error("observedCount is invalid");
    }
    const observedCount = value.observedCount;
    assertPlainObject(value.rejections, "rejections");
    assertClosedKeys(value.rejections, [
        "episodeOverflow",
        "malformed",
        "missingIdentity",
        "missingUserRequest",
        "oversize",
    ], "rejections");
    const rejectionValues = [
        value.rejections.malformed,
        value.rejections.oversize,
        value.rejections.missingIdentity,
        value.rejections.missingUserRequest,
        value.rejections.episodeOverflow,
    ];
    if (rejectionValues.some((count) => !Number.isSafeInteger(count) || count < 0)) {
        throw new Error("rejection counts are invalid");
    }
    const rejectedCount = rejectionValues.reduce((sum, count) => sum + count, 0);
    const rejectedObservationCount = [
        value.rejections.malformed,
        value.rejections.oversize,
        value.rejections.missingIdentity,
        value.rejections.missingUserRequest,
    ].reduce((sum, count) => sum + count, 0);
    if (!Array.isArray(value.sessions))
        throw new Error("sessions must be an array");
    if (value.sessions.length
        > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxEpisodesGlobal) {
        throw new Error("sessions exceed their limit");
    }
    const identities = new Set();
    const rootCounts = new Map();
    value.sessions.forEach((session, index) => {
        assertSession(session, `sessions[${index}]`);
        if (Date.parse(session.observedAt) > Date.parse(producedAt)) {
            throw new Error("session observation follows producer time");
        }
        if (identities.has(session.episodeIdentityDigest)) {
            throw new Error("duplicate stable episode identity");
        }
        identities.add(session.episodeIdentityDigest);
        rootCounts.set(session.rootSessionIdentityDigest, (rootCounts.get(session.rootSessionIdentityDigest) ?? 0) + 1);
    });
    if (observedCount < rejectedObservationCount
        || [...rootCounts.values()].some((count) => count
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1
                .maxEpisodesPerRootSession)) {
        throw new Error("observation accounting is inconsistent");
    }
    const canonicalEpisodeIds = value.sessions.map((episode) => episode.episodeId)
        .sort((left, right) => left.localeCompare(right));
    if (value.sessions.some((episode, index) => episode.episodeId !== canonicalEpisodeIds[index])) {
        throw new Error("sessions are not canonically ordered");
    }
    if ((value.coverage === "fresh_empty"
        && (observedCount !== 0
            || value.sessions.length !== 0
            || rejectedCount !== 0))
        || (value.coverage === "complete" && rejectedCount !== 0)) {
        throw new Error("coverage and rejection accounting are inconsistent");
    }
    assertPlainObject(value.watermark, "watermark");
    assertClosedKeys(value.watermark, ["kind", "observedThrough", "valueDigest"], "watermark");
    if (value.watermark.kind !== "episode_revision") {
        throw new Error("watermark.kind is invalid");
    }
    assertDigest(value.watermark.valueDigest, "watermark.valueDigest");
    const observedThrough = canonicalTimestamp(value.watermark.observedThrough, "watermark.observedThrough");
    const expectedObservedThrough = value.sessions.length === 0
        ? producedAt
        : value.sessions.map((session) => session.observedAt)
            .reduce((latest, timestamp) => Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest);
    if (observedThrough !== expectedObservedThrough
        || value.watermark.valueDigest !== (0, source_contracts_js_1.taskMapContractDigest)(value.sessions.map((episode) => ({
            episodeIdentityDigest: episode.episodeIdentityDigest,
            episodeRevisionDigest: episode.episodeRevisionDigest,
        })))) {
        throw new Error("watermark is inconsistent");
    }
    assertPlainObject(value.privacy, "privacy");
    assertClosedKeys(value.privacy, [
        "chainOfThoughtStored",
        "credentialsStored",
        "fullAgentSessionBodiesStored",
        "localPathsStored",
        "participantDetailsStored",
        "toolArgumentsStored",
    ], "privacy");
    if (Object.values(value.privacy).some((stored) => stored !== false)) {
        throw new Error("privacy contract is invalid");
    }
    const { snapshotId, snapshotDigest, ...base } = value;
    if (snapshotDigest !== (0, source_contracts_js_1.taskMapContractDigest)(base)
        || snapshotId !== stableId("tmassnapshot", snapshotDigest)
        || Buffer.byteLength(JSON.stringify(value), "utf8")
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxSnapshotBytes) {
        throw new Error("snapshot digest or byte limit is invalid");
    }
}
/**
 * Semantic admission may use this view for "current topic" selection while
 * the producer snapshot retains earlier bounded episodes for continuity and
 * later anti-resurrection matching.
 */
function selectLatestTaskMapAgentSessionWorkEpisodesByRoot(sessions) {
    if (!Array.isArray(sessions)
        || sessions.length
            > exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxEpisodesGlobal) {
        throw new Error("sessions exceed their episode selection limit");
    }
    const latestByRoot = new Map();
    sessions.forEach((episode, index) => {
        assertSession(episode, `sessions[${index}]`);
        const previous = latestByRoot.get(episode.rootSessionIdentityDigest);
        if (previous === undefined
            || compareEpisodeRecency(episode, previous) < 0) {
            latestByRoot.set(episode.rootSessionIdentityDigest, episode);
        }
    });
    return [...latestByRoot.values()].sort((left, right) => left.episodeId.localeCompare(right.episodeId));
}
function buildResult(input) {
    const available = input.decision === "fresh";
    const snapshot = available ? input.snapshot ?? null : null;
    const hasValidatedInterval = input.snapshot !== undefined
        && (input.decision === "fresh"
            || input.decision === "boundary_due"
            || input.decision === "stale");
    const base = {
        contractVersion: exports.TASKMAP_AGENT_SESSION_PRODUCER_RESULT_VERSION,
        producerVersion: exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION,
        availability: available ? "available" : "unavailable",
        coverage: available
            ? input.snapshot?.coverage ?? "unavailable"
            : "unavailable",
        freshness: {
            decision: input.decision,
            interval: "[producedAt,validThrough)",
            assessedAt: input.assessedAt,
            producedAt: hasValidatedInterval
                ? input.snapshot?.producedAt ?? null
                : null,
            validThrough: hasValidatedInterval
                ? input.snapshot?.validThrough ?? null
                : null,
            maxAgeMs: exports.TASKMAP_AGENT_SESSION_PRODUCER_MAX_AGE_MS,
            currentSemanticInputEligible: available,
        },
        snapshot,
        reasonDetailDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            decision: input.decision,
            detailCode: input.detailCode,
        }),
        privacy: PRIVACY,
    };
    const resultDigest = (0, source_contracts_js_1.taskMapContractDigest)(base);
    return deepFreeze({
        ...base,
        resultId: stableId("tmasresult", resultDigest),
        resultDigest,
    });
}
function isUnknownVersion(value) {
    if (!isPlainObject(value))
        return false;
    return (typeof value.contractVersion === "string"
        && value.contractVersion !== exports.TASKMAP_AGENT_SESSION_PRODUCER_SNAPSHOT_VERSION) || (typeof value.producerVersion === "string"
        && value.producerVersion !== exports.TASKMAP_AGENT_SESSION_PRODUCER_VERSION);
}
function assessTaskMapAgentSessionProducerSnapshot(value, assessedAtInput) {
    const assessedAt = canonicalTimestamp(assessedAtInput, "assessedAt");
    if (isUnknownVersion(value)) {
        return buildResult({
            decision: "unknown_version",
            assessedAt,
            detailCode: "unsupported_snapshot_or_producer_version",
        });
    }
    try {
        assertTaskMapAgentSessionProducerSnapshot(value);
    }
    catch {
        return buildResult({
            decision: "malformed",
            assessedAt,
            detailCode: "snapshot_contract_validation_failed",
        });
    }
    const snapshot = value;
    if (Date.parse(assessedAt) < Date.parse(snapshot.producedAt)) {
        return buildResult({
            decision: "malformed",
            assessedAt,
            detailCode: "assessment_precedes_production",
        });
    }
    if (assessedAt === snapshot.validThrough) {
        return buildResult({
            decision: "boundary_due",
            assessedAt,
            snapshot,
            detailCode: "four_hour_boundary_due",
        });
    }
    if (Date.parse(assessedAt) > Date.parse(snapshot.validThrough)) {
        return buildResult({
            decision: "stale",
            assessedAt,
            snapshot,
            detailCode: "four_hour_max_age_exceeded",
        });
    }
    return buildResult({
        decision: "fresh",
        assessedAt,
        snapshot,
        detailCode: "within_four_hour_half_open_interval",
    });
}
function taskMapAgentSessionOwnerScopeDigest(userId) {
    return (0, owner_scope_js_1.taskMapOwnerScopeDigest)(userId);
}
function taskMapAgentSessionProducerSnapshotPath(homeDirectory) {
    if (typeof homeDirectory !== "string"
        || !node_path_1.default.isAbsolute(homeDirectory)
        || node_path_1.default.normalize(homeDirectory) !== homeDirectory
        || CONTROL_CHARACTER.test(homeDirectory)) {
        throw new Error("homeDirectory must be a normalized absolute path");
    }
    return node_path_1.default.join(homeDirectory, ".daobrew", "taskmap", "agent-session-producer-snapshot.v2.json");
}
function assertAbsoluteSnapshotPath(snapshotPath) {
    if (typeof snapshotPath !== "string"
        || !node_path_1.default.isAbsolute(snapshotPath)
        || node_path_1.default.normalize(snapshotPath) !== snapshotPath
        || CONTROL_CHARACTER.test(snapshotPath)) {
        throw new Error("snapshotPath must be a normalized absolute local path");
    }
}
/**
 * Explicit local writer. The canonical artifact is owner-only (0600), while
 * the containing product directory is owner-only (0700).
 */
async function writeTaskMapAgentSessionProducerSnapshot(input) {
    assertPlainObject(input, "agent session producer write input");
    assertClosedKeys(input, ["snapshot", "snapshotPath"], "write input");
    assertAbsoluteSnapshotPath(input.snapshotPath);
    assertTaskMapAgentSessionProducerSnapshot(input.snapshot);
    const parent = node_path_1.default.dirname(input.snapshotPath);
    await (0, promises_1.mkdir)(parent, { recursive: true, mode: 0o700 });
    await (0, promises_1.chmod)(parent, 0o700);
    const temporary = node_path_1.default.join(parent, `.${node_path_1.default.basename(input.snapshotPath)}.${(0, node_crypto_1.randomUUID)()}.tmp`);
    try {
        const bytes = `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(input.snapshot)}\n`;
        const handle = await (0, promises_1.open)(temporary, node_fs_1.constants.O_WRONLY
            | node_fs_1.constants.O_CREAT
            | node_fs_1.constants.O_EXCL
            | node_fs_1.constants.O_NOFOLLOW, 0o600);
        try {
            await handle.writeFile(bytes, "utf8");
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        await (0, promises_1.chmod)(temporary, 0o600);
        await (0, promises_1.rename)(temporary, input.snapshotPath);
        await (0, promises_1.chmod)(input.snapshotPath, 0o600);
    }
    finally {
        await (0, promises_1.unlink)(temporary).catch(() => undefined);
    }
}
function unavailableResult(decision, assessedAt, detailCode) {
    return buildResult({ decision, assessedAt, detailCode });
}
function errorCode(error) {
    if (error !== null
        && typeof error === "object"
        && "code" in error
        && typeof error.code === "string") {
        return error.code;
    }
    return null;
}
/**
 * Authenticated local read only. The returned result never includes the local
 * path and never turns retained or malformed bytes into semantic input.
 */
async function loadTaskMapAgentSessionProducerResult(input) {
    assertPlainObject(input, "agent session producer load input");
    assertClosedKeys(input, ["assessedAt", "expectedOwnerScopeDigest", "snapshotPath"], "load input");
    const assessedAt = canonicalTimestamp(input.assessedAt, "assessedAt");
    assertDigest(input.expectedOwnerScopeDigest, "expectedOwnerScopeDigest");
    try {
        assertAbsoluteSnapshotPath(input.snapshotPath);
    }
    catch {
        return unavailableResult("malformed", assessedAt, "snapshot_path_invalid");
    }
    let handle;
    try {
        handle = await (0, promises_1.open)(input.snapshotPath, node_fs_1.constants.O_RDONLY | node_fs_1.constants.O_NOFOLLOW);
        const before = await handle.stat({ bigint: true });
        const currentUid = typeof process.getuid === "function"
            ? process.getuid()
            : before.uid;
        if (!before.isFile()
            || before.uid !== BigInt(currentUid)
            || (before.mode & 4095n) !== 384n
            || before.nlink !== 1n
            || before.size < 2n
            || before.size
                > BigInt(exports.TASKMAP_AGENT_SESSION_PRODUCER_LIMITS_V1.maxSnapshotBytes)) {
            return unavailableResult("malformed", assessedAt, "snapshot_file_authentication_failed");
        }
        const bytes = await handle.readFile();
        const after = await handle.stat({ bigint: true });
        if (after.dev !== before.dev
            || after.ino !== before.ino
            || after.size !== before.size
            || after.mode !== before.mode
            || after.nlink !== before.nlink
            || after.uid !== before.uid
            || after.mtimeNs !== before.mtimeNs
            || after.ctimeNs !== before.ctimeNs
            || BigInt(bytes.byteLength) !== before.size) {
            return unavailableResult("malformed", assessedAt, "snapshot_file_changed_during_read");
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString("utf8"));
        }
        catch {
            return unavailableResult("malformed", assessedAt, "snapshot_json_parse_failed");
        }
        if (!isPlainObject(parsed)
            || parsed.ownerScopeDigest !== input.expectedOwnerScopeDigest) {
            return unavailableResult("malformed", assessedAt, "snapshot_owner_scope_mismatch");
        }
        return assessTaskMapAgentSessionProducerSnapshot(parsed, assessedAt);
    }
    catch (error) {
        return unavailableResult(errorCode(error) === "ENOENT" ? "missing" : "malformed", assessedAt, errorCode(error) === "ENOENT"
            ? "snapshot_file_missing"
            : "snapshot_file_open_failed");
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
