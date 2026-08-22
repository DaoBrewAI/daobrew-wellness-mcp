"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_ALGORITHM_POLICY_DIGEST = exports.TASKMAP_ALGORITHM_POLICY = void 0;
exports.taskMapInputDigest = taskMapInputDigest;
exports.taskMapSemanticInput = taskMapSemanticInput;
exports.taskMapSemanticInputDigest = taskMapSemanticInputDigest;
exports.taskMapProjectionPrivacyLeakReasons = taskMapProjectionPrivacyLeakReasons;
exports.taskMapInputValidationReasons = taskMapInputValidationReasons;
exports.taskMapProjectionArtifactValidationReasons = taskMapProjectionArtifactValidationReasons;
exports.buildTaskMapProjection = buildTaskMapProjection;
exports.taskMapMembershipSignature = taskMapMembershipSignature;
exports.runTaskMapAblation = runTaskMapAblation;
const node_crypto_1 = require("node:crypto");
const EnrichmentGate_js_1 = require("../reasoner/EnrichmentGate.js");
const types_js_1 = require("./types.js");
const MAX_TITLE = 96;
const MAX_SUMMARY = 200;
exports.TASKMAP_ALGORITHM_POLICY = {
    version: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
    engineRulesVersion: "taskmap-engine-rules.3",
    validationRulesVersion: "taskmap-validation-rules.3",
    identityRulesVersion: "taskmap-identity-rules.3",
    limits: {
        titleCharacters: MAX_TITLE,
        summaryCharacters: MAX_SUMMARY,
    },
    timestamps: "strict-rfc3339-with-z-or-offset",
    privacy: {
        encodedTextIsDecodedBeforeScan: true,
        bodySourceKindsExcludedFromSemanticInput: ["oura"],
        bodySourceRecordKinds: ["body_context", "receipt"],
        rawBiometricValues: "metric-vocabulary-plus-number-redaction-with-window-count-exception",
    },
    rootReuseJaccard: 0.5,
    rootPersistence: {
        objective: "max-cardinality-then-max-overlap",
        dummyCost: "row-count-plus-two",
        ineligibleCost: "twice-dummy-cost",
        finalIdsUnique: true,
    },
    rootMembership: "unique-source-backed-object-refs",
    taskIdentity: {
        authoritative: "source-kind-and-source-ref-hash",
        discovered: "normalized-content-root-members-and-source-backed-evidence",
        previousDiscoveredEvidence: "source-kind-and-source-ref-hash-never-local-pointer-id",
    },
    bodyJoinWindowMs: 36 * 60 * 60 * 1000,
    bodyFreshnessWindowMs: 72 * 60 * 60 * 1000,
    bodyFreshnessRationale: "taskmap-context-layer uses an approximately 72-hour freshness half-life and omits stale body edges",
    bodyJoinRequiresExplicitEligibility: true,
    actionableBodyCategories: ["below_baseline", "above_baseline"],
    bodyJoinEligibleRecordKinds: ["work_context", "receipt"],
    causal: {
        statsDerivedFromInput: true,
        targetCategories: ["below_baseline", "above_baseline"],
        neutralReferenceCategory: "within_baseline",
        bodyAxisRequired: true,
        citedDays: "exact-target-and-eligible-work-date-intersection",
        sourceKinds: "derived-from-root-evidence",
        comparableCorpusCoverage: "complete-source-day-receipts-cover-every-root-join-eligible-source-kind",
        rootObservableSourceScope: "all-source-kinds-from-root-body-join-eligible-evidence-empty-is-incomparable",
        minCorpusSourcesPerDay: EnrichmentGate_js_1.DEFAULT_ENRICHMENT_THRESHOLDS.minSourcesPerDay,
        rtmSuspected: "true-when-any-extreme-target-hit-is-cited",
        minNeutralReferenceDays: EnrichmentGate_js_1.DEFAULT_ENRICHMENT_THRESHOLDS.minBackedDays,
        neutralReferenceRationale: "require at least the same three-day floor as target backed-day evidence",
        enrichmentThresholds: EnrichmentGate_js_1.DEFAULT_ENRICHMENT_THRESHOLDS,
    },
    scoreWeights: {
        sourcePriority: 0.25,
        deadlinePressure: 0.25,
        dependencyImpact: 0.15,
        recurrence: 0.15,
        staleOpen: 0.10,
        evidenceStrength: 0.10,
    },
    rootScoreWeights: {
        maxChildActionability: 0.50,
        rootRecurrence: 0.20,
        evidenceStrength: 0.10,
        sourceBreadth: 0.10,
        actionableLoad: 0.05,
        dependencyBreadth: 0.05,
    },
    rootScoreCaps: {
        sourceKinds: 3,
        actionableTasks: 5,
        dependencyEdges: 5,
        bodyBonus: 0.08,
    },
    rootClosedScoring: "all-components-zero-when-no-actionable-tasks",
    bodyBonus: {
        C2_ATTRIBUTION_CANDIDATE: 0.03,
        C3_CAUSAL_HYPOTHESIS: 0.05,
        C4_VALIDATED_PATTERN: 0.08,
    },
    deadlinePressure: [
        { maxDays: 1, score: 1 },
        { maxDays: 3, score: 0.85 },
        { maxDays: 7, score: 0.65 },
        { maxDays: 14, score: 0.4 },
        { maxDays: 30, score: 0.2 },
    ],
    staleOpenDays: 30,
    recurrence: {
        dayCap: 4,
        pointerCap: 3,
        divisor: 7,
    },
    dependencyCountCap: 3,
    closedWorkScoring: "all-components-zero",
    authoritativeStatePrecedence: [
        "task_completed",
        "source_status",
        "task_reopened",
        "task_created",
        "unknown",
    ],
    edgeIdentity: "from-relation-to",
    authoritativeCoverage: "one-to-one-latest-not-proven-closed",
    temporalOrder: "occurred-at-lte-observed-at-lte-input-lte-brain-lte-run",
    causalDayJoin: "explicit-source-local-day-key",
    retractions: "target-and-retracting-tombstone-are-not-live-work",
    routingCapabilityMatrix: "sync-mode-and-authority-v1",
    sourceOwnedRouteEligibility: "deep-link-delegate-native-agent-or-return-capability",
    returnRouting: "explicit-or-sole-eligible-cited-origin-and-always-approval-gated",
    edgeEndpointMatrix: "advances-root-to-task-execution-and-informed-by-task-to-task-related-to-same-kind",
    semanticSupersedes: "discovered-target-must-be-explicitly-superseded-source-owned-targets-rejected",
    executionEdges: "depends-on-blocks-and-supersedes-must-be-acyclic",
};
const SOURCE_OWNED_WORKSTREAM_REF = /^workstream:[a-f0-9]{64}$/;
const SOURCE_OWNED_WORK_ITEM_REF = /^work-item:[a-f0-9]{64}$/;
const SAFE_PUBLIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_SOURCE_OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,191}$/;
const SAFE_BRAIN_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,63}$/;
const SAFE_PROMPT_HASH = /^[a-f0-9]{16,64}$/i;
const VALID_ARMS = new Set(["E0", "E1", "E2", "E3", "E4"]);
const VALID_SOURCE_KINDS = new Set([
    "linear",
    "jira",
    "github",
    "slack",
    "google_chat",
    "gmail",
    "google_calendar",
    "local_calendar",
    "google_tasks",
    "gemini_meet",
    "granola",
    "codex_session",
    "claude_session",
    "cursor_session",
    "oura",
    "strategy",
    "manual",
    "unknown",
]);
const VALID_AUTHORITIES = new Set(["source_system", "user", "none"]);
const VALID_SYNC_MODES = new Set([
    "native_agent",
    "writeback",
    "return_only",
    "reference_only",
    "personal_fork",
]);
const VALID_CAPABILITIES = new Set([
    "read_task",
    "read_context",
    "create_task",
    "update_status",
    "comment_or_reply",
    "create_source_draft",
    "publish_or_send",
    "delegate_native_agent",
    "attach_or_link_artifact",
    "deep_link",
    "webhook_or_incremental_sync",
    "optimistic_version_check",
]);
const VALID_RECORD_KINDS = new Set(["authoritative_task", "work_context", "body_context", "receipt"]);
const VALID_ACTIVITIES = new Set([
    "task_created",
    "task_updated",
    "task_completed",
    "task_reopened",
    "commitment_stated",
    "decision_deferred",
    "decision_made",
    "artifact_delivered",
    "receipt_observed",
    "context_observed",
    "body_window_observed",
]);
const VALID_OPEN_STATES = new Set([
    "open",
    "possibly_open",
    "blocked",
    "awaiting_review",
    "completed",
    "superseded",
    "unknown",
]);
const VALID_RELATIONS = new Set([
    "advances",
    "depends_on",
    "blocks",
    "informed_by",
    "related_to",
    "supersedes",
]);
const VALID_SOURCE_STATUSES = new Set([
    "open",
    "in_progress",
    "blocked",
    "awaiting_review",
    "completed",
    "cancelled",
    "unknown",
]);
const VALID_BODY_CATEGORIES = new Set([
    "below_baseline",
    "within_baseline",
    "above_baseline",
    "unknown",
]);
const VALID_BODY_AXES = new Set([
    "hrv",
    "resting_heart_rate",
    "readiness",
    "sleep",
    "activity",
    "composite_recovery",
    "unknown",
]);
const BODY_SOURCE_KINDS = new Set(["oura"]);
const WRITE_CAPABILITIES = new Set([
    "create_task",
    "update_status",
    "comment_or_reply",
    "create_source_draft",
    "publish_or_send",
    "delegate_native_agent",
    "attach_or_link_artifact",
    "optimistic_version_check",
]);
const RETURN_CAPABILITIES = new Set([
    "create_task",
    "update_status",
    "comment_or_reply",
    "create_source_draft",
    "publish_or_send",
    "attach_or_link_artifact",
]);
function stableSourceIdentity(pointer) {
    return pointer ? `${pointer.sourceKind}:${pointer.sourceRefHash}` : undefined;
}
function hasReturnCapability(pointer) {
    return pointer.syncMode !== "reference_only"
        && pointer.capabilities.some((capability) => RETURN_CAPABILITIES.has(capability));
}
function hasSourceOwnedRoute(pointer) {
    return pointer.capabilities.includes("deep_link")
        || pointer.capabilities.includes("delegate_native_agent")
        || hasReturnCapability(pointer);
}
const ALLOWED_CAPABILITIES_BY_SYNC_MODE = {
    reference_only: new Set([
        "read_task",
        "read_context",
        "deep_link",
        "webhook_or_incremental_sync",
    ]),
    return_only: new Set([
        "read_task",
        "read_context",
        "comment_or_reply",
        "create_source_draft",
        "attach_or_link_artifact",
        "deep_link",
        "webhook_or_incremental_sync",
        "optimistic_version_check",
    ]),
    writeback: new Set([
        "read_task",
        "read_context",
        "create_task",
        "update_status",
        "comment_or_reply",
        "create_source_draft",
        "publish_or_send",
        "attach_or_link_artifact",
        "deep_link",
        "webhook_or_incremental_sync",
        "optimistic_version_check",
    ]),
    native_agent: new Set(VALID_CAPABILITIES),
    personal_fork: new Set([
        "read_task",
        "read_context",
        "create_task",
        "update_status",
        "attach_or_link_artifact",
        "deep_link",
        "optimistic_version_check",
    ]),
};
const TEXT_LEAK_PATTERNS = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["local_path", /(?:\/Users\/|\/home\/|\/tmp\/|\/private\/|\/var\/folders\/|\/Volumes\/|[A-Z]:\\Users\\)/i],
    ["bearer", /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i],
    ["api_key", /\b(?:sk-proj-|dbk_|grn_|ghp_|github_pat_|xox[baprs]-|AIza|AKIA)[A-Za-z0-9_-]{6,}\b/i],
    ["api_key", /\b(?:token|secret|api[_-]?key|password|pwd|sig(?:nature)?|credential)\s*[=:]\s*[A-Za-z0-9._-]{6,}\b/i],
    ["raw_biometric", /\b(?:HRV|RHR|heart\s*rate|resting\s*heart\s*rate|respiratory\s*rate|SpO2|blood\s*oxygen|body\s*temperature)\b[^\n]{0,32}\b\d+(?:\.\d+)?\s*(?:ms|bpm|%|°?[CF])\b/i],
    ["raw_biometric", /\b(?:readiness\s*score|sleep\s*score|activity\s*score)\b[^\n]{0,20}\b\d+(?:\.\d+)?(?:\s*\/\s*100)?\b/i],
    ["raw_biometric", /\b\d+(?:\.\d+)?\s*(?:ms|bpm|%|°?[CF])\b[^\n]{0,24}\b(?:HRV|RHR|heart\s*rate|resting\s*heart\s*rate|respiratory\s*rate|SpO2|blood\s*oxygen|body\s*temperature)\b/i],
    ["local_path", /(?:~\/|file:\/\/|\.codex\/)/i],
    ["wrapper", /<(?:recommended_plugins|environment_context|permissions instructions|appshot)\b/i],
];
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const BIOMETRIC_TERM = /\b(?:HRV|RHR|heart[\s-]*rate|resting\s*heart[\s-]*rate|respiratory\s*rate|SpO2|blood\s*oxygen|body\s*temperature|readiness\s*score|sleep\s*(?:score|duration)|activity\s*score|steps?)\b/i;
const BIOMETRIC_UNIT = /\b(?:milliseconds?|ms|bpm|beats?\s+per\s+minute|hours?|minutes?|steps?|percent)\b|%|°[CF]\b/i;
const NUMBER_TOKEN = /\b(?:\d+(?:\.\d+)?|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:-(?:one|two|three|four|five|six|seven|eight|nine))?)\b/i;
const INPUT_FIELDS = new Set(["contractVersion", "generatedAt", "pointers", "events"]);
const POINTER_FIELDS = new Set([
    "id", "sourceKind", "sourceObjectId", "sourceRefHash", "canonicalUrl", "sourceVersion",
    "authority", "syncMode", "capabilities",
]);
const EVENT_FIELDS = new Set([
    "id", "pointerId", "recordKind", "activity", "occurredAt", "observedAt", "objectRefs",
    "dayKey", "title", "summary", "extractionConfidence", "sourceStatus", "priority", "deadlineAt",
    "supersedesEventId", "retractsEventId", "bodyCategory", "bodyAxis", "bodyJoinEligible",
    "corpusCoverage",
]);
const BRAIN_FIELDS = new Set([
    "contractVersion", "provider", "model", "promptHash", "inputDigest", "generatedAt",
    "roots", "tasks", "edges",
]);
const ROOT_PROPOSAL_FIELDS = new Set([
    "proposalId", "title", "summary", "evidenceEventIds", "memberObjectRefs", "confidence",
]);
const TASK_PROPOSAL_FIELDS = new Set([
    "proposalId", "rootProposalId", "title", "summary", "evidenceEventIds",
    "authoritativeTaskEventId", "proposedReturnPointerId", "openState", "confidence",
]);
const EDGE_PROPOSAL_FIELDS = new Set([
    "proposalId", "fromProposalId", "toProposalId", "relation", "evidenceEventIds", "confidence",
]);
const OPTIONS_FIELDS = new Set(["arm", "now", "previousProjection", "causalInputs"]);
const CAUSAL_INPUT_FIELDS = new Set(["rootProposalId", "bodyAxis", "bodyCategory", "enrichment"]);
const ENRICHMENT_FIELDS = new Set([
    "theme", "targetHits", "targetN", "referenceRate", "referenceN", "citedDays",
    "rtmSuspected", "thresholds",
]);
const CITED_DAY_FIELDS = new Set(["date", "backed", "sources"]);
const THRESHOLD_FIELDS = new Set(["minRatio", "minBackedDays", "minSourcesPerDay"]);
const PROJECTION_FIELDS = new Set([
    "contractVersion", "algorithmPolicyVersion", "algorithmPolicyDigest", "runStatus", "arm",
    "runId", "generatedAt", "inputDigest", "brain", "sources", "roots", "tasks", "edges",
    "rejections", "privacy",
]);
const PROJECTION_BRAIN_FIELDS = new Set(["provider", "model", "promptHash", "outputDigest"]);
const PROJECTION_SOURCE_FIELDS = new Set([
    "id", "sourceKind", "canonicalUrl", "sourceVersion", "authority", "syncMode", "capabilities",
]);
const PROJECTION_ROOT_FIELDS = new Set([
    "id", "title", "summary", "taskIds", "visibleTaskIds", "memberObjectRefs", "citations", "causalGrade",
    "causalGate", "bodyContextCount", "scoreBreakdown", "score", "whyNow",
]);
const PROJECTION_TASK_FIELDS = new Set([
    "id", "rootId", "title", "summary", "reviewState", "openState", "authority",
    "taskHomePointerId", "originPointerIds", "returnRoute", "sourceStatus", "citations", "score",
    "whyNow", "discoveredBy", "bodyContextCount",
]);
const RETURN_ROUTE_FIELDS = new Set(["state", "pointerId", "requiresApproval"]);
const PROJECTION_EDGE_FIELDS = new Set(["id", "from", "to", "relation", "citations"]);
const CITATION_FIELDS = new Set([
    "eventId", "pointerId", "sourceKind", "sourceRefHash", "occurredAt", "extractionConfidence",
]);
const SCORE_FIELDS = new Set([
    "sourcePriority", "deadlinePressure", "dependencyImpact", "recurrence", "staleOpen",
    "evidenceStrength", "bodyBonus", "total",
]);
const ROOT_SCORE_FIELDS = new Set([
    "maxChildActionability", "rootRecurrence", "evidenceStrength", "sourceBreadth",
    "actionableLoad", "dependencyBreadth", "bodyBonus", "total",
]);
const REJECTION_FIELDS = new Set(["proposalId", "kind", "reasons"]);
const PRIVACY_FIELDS = new Set(["sourceBodiesStored", "localPathsStored", "rawBiometricsStored"]);
const CAUSAL_GATE_FIELDS = new Set([
    "theme", "verdict", "ratio", "enrichmentInfinite", "backedDays", "multiSourceBackedDays",
    "reasons", "flags",
]);
function round(value) {
    return Math.round(value * 1_000) / 1_000;
}
function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return Math.max(0, Math.min(1, n));
}
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
}
exports.TASKMAP_ALGORITHM_POLICY_DIGEST = digest(exports.TASKMAP_ALGORITHM_POLICY);
function taskMapInputDigest(input) {
    return digest(input);
}
/**
 * The semantic brain receives work events only. Body events and body-only
 * pointers are deliberately absent so biometrics cannot influence membership.
 */
function taskMapSemanticInput(input) {
    const pointers = pointerMap(input);
    const events = validResolvedEvents(input)
        .filter((event) => (event.recordKind !== "body_context"
        && event.corpusCoverage === undefined
        && !BODY_SOURCE_KINDS.has(pointers.get(event.pointerId)?.sourceKind ?? "")));
    const referencedPointers = new Set(events.map((event) => event.pointerId));
    return {
        contractVersion: input.contractVersion,
        generatedAt: input.generatedAt,
        pointers: input.pointers
            .filter((pointer) => referencedPointers.has(pointer.id))
            .map((pointer) => ({
            id: pointer.id,
            sourceKind: pointer.sourceKind,
            sourceObjectId: pointer.sourceObjectId,
            sourceRefHash: pointer.sourceRefHash,
            ...(pointer.canonicalUrl === undefined ? {} : { canonicalUrl: pointer.canonicalUrl }),
            ...(pointer.sourceVersion === undefined ? {} : { sourceVersion: pointer.sourceVersion }),
            authority: pointer.authority,
            syncMode: pointer.syncMode,
            capabilities: [...pointer.capabilities],
        })),
        events: events.map((event) => ({
            id: event.id,
            pointerId: event.pointerId,
            recordKind: event.recordKind,
            activity: event.activity,
            occurredAt: event.occurredAt,
            observedAt: event.observedAt,
            ...(event.dayKey === undefined ? {} : { dayKey: event.dayKey }),
            objectRefs: [...event.objectRefs],
            title: event.title,
            summary: event.summary,
            extractionConfidence: event.extractionConfidence,
            ...(event.sourceStatus === undefined ? {} : { sourceStatus: event.sourceStatus }),
            ...(event.priority === undefined ? {} : { priority: event.priority }),
            ...(event.deadlineAt === undefined ? {} : { deadlineAt: event.deadlineAt }),
            ...(event.supersedesEventId === undefined ? {} : { supersedesEventId: event.supersedesEventId }),
            ...(event.retractsEventId === undefined ? {} : { retractsEventId: event.retractsEventId }),
            ...(event.bodyCategory === undefined ? {} : { bodyCategory: event.bodyCategory }),
            ...(event.bodyAxis === undefined ? {} : { bodyAxis: event.bodyAxis }),
            ...(event.bodyJoinEligible === undefined ? {} : { bodyJoinEligible: event.bodyJoinEligible }),
        })),
    };
}
function taskMapSemanticInputDigest(input) {
    return digest(taskMapSemanticInput(input));
}
function stableId(prefix, value) {
    return `${prefix}_${(0, node_crypto_1.createHash)("sha256").update(value).digest("hex").slice(0, 16)}`;
}
function unique(values) {
    return [...new Set(values)];
}
function unknownFieldReasons(value, allowed, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [`${label} must be an object`];
    }
    return Object.keys(value).some((key) => !allowed.has(key))
        ? [`${label} contains unknown fields`]
        : [];
}
function isStrictRfc3339(value) {
    if (!value)
        return false;
    const match = STRICT_RFC3339.exec(value);
    if (!match || !Number.isFinite(Date.parse(value)))
        return false;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, offsetHour, offsetMinute] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59)
        return false;
    if (day > new Date(Date.UTC(year, month, 0)).getUTCDate())
        return false;
    if (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
        return false;
    return true;
}
function isRealDayKey(value) {
    return (typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value);
}
function decodedTextVariants(text) {
    const variants = [text];
    let current = text;
    for (let depth = 0; depth < 2; depth += 1) {
        try {
            const decoded = decodeURIComponent(current.replace(/\+/g, " "));
            if (decoded === current)
                break;
            variants.push(decoded);
            current = decoded;
        }
        catch {
            break;
        }
    }
    return unique(variants);
}
function rawBiometricLeakReasons(text) {
    if (!BIOMETRIC_TERM.test(text))
        return [];
    let residual = text.replace(/\b(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\s+(?:windows?|days?|events?|records?|sources?|matches?|signals?)\b/gi, "");
    residual = residual.replace(/\b(?:\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+[^.\n]{0,32}\bwindows?\b/gi, (match) => BIOMETRIC_UNIT.test(match) ? match : "");
    return NUMBER_TOKEN.test(residual) ? ["privacy leak: raw_biometric"] : [];
}
function textLeakReasons(text) {
    return unique(decodedTextVariants(text).flatMap((variant) => ([
        ...TEXT_LEAK_PATTERNS
            .filter(([, pattern]) => pattern.test(variant))
            .map(([name]) => `privacy leak: ${name}`),
        ...rawBiometricLeakReasons(variant),
    ])));
}
function boundedTextReasons(title, summary) {
    const reasons = [
        ...textLeakReasons(title),
        ...textLeakReasons(summary),
    ];
    if (!title.trim())
        reasons.push("title is empty");
    if (title.length > MAX_TITLE)
        reasons.push(`title exceeds ${MAX_TITLE} characters`);
    if (summary.length > MAX_SUMMARY)
        reasons.push(`summary exceeds ${MAX_SUMMARY} characters`);
    return unique(reasons);
}
function taskMapProjectionPrivacyLeakReasons(value) {
    if (typeof value === "string")
        return textLeakReasons(value);
    if (Array.isArray(value)) {
        return unique(value.flatMap(taskMapProjectionPrivacyLeakReasons));
    }
    if (value && typeof value === "object") {
        return unique(Object.values(value)
            .flatMap(taskMapProjectionPrivacyLeakReasons));
    }
    return [];
}
function safeIdReasons(label, value, pattern = SAFE_PUBLIC_ID) {
    const reasons = textLeakReasons(value);
    if (!pattern.test(value))
        reasons.push(`${label} is not a safe opaque id`);
    return unique(reasons);
}
function pointerMap(input) {
    return new Map(input.pointers.map((pointer) => [pointer.id, pointer]));
}
function eventMap(input) {
    return new Map(validResolvedEvents(input).map((event) => [event.id, event]));
}
function latestAuthoritativeEvents(input) {
    const latest = new Map();
    for (const event of validResolvedEvents(input)) {
        if (event.recordKind !== "authoritative_task")
            continue;
        const current = latest.get(event.pointerId);
        if (!current) {
            latest.set(event.pointerId, event);
            continue;
        }
        const order = Date.parse(event.occurredAt) - Date.parse(current.occurredAt)
            || Date.parse(event.observedAt) - Date.parse(current.observedAt)
            || event.id.localeCompare(current.id);
        if (order > 0)
            latest.set(event.pointerId, event);
    }
    return latest;
}
function citations(ids, events, pointers) {
    return unique(ids).flatMap((id) => {
        const event = events.get(id);
        const pointer = event ? pointers.get(event.pointerId) : undefined;
        if (!event || !pointer)
            return [];
        return [{
                eventId: event.id,
                pointerId: pointer.id,
                sourceKind: pointer.sourceKind,
                sourceRefHash: pointer.sourceRefHash,
                occurredAt: event.occurredAt,
                extractionConfidence: event.extractionConfidence,
            }];
    });
}
function nonBodyEvidence(ids, events) {
    return unique(ids)
        .map((id) => events.get(id))
        .filter((event) => Boolean(event && event.recordKind !== "body_context"));
}
function isAgentSessionReviewOnlyEvidence(evidence, pointers) {
    return evidence.length > 0 && evidence.every((event) => {
        const pointer = pointers.get(event.pointerId);
        return event.recordKind === "work_context"
            && pointer !== undefined
            && (pointer.sourceKind === "codex_session"
                || pointer.sourceKind === "claude_session")
            && pointer.authority === "none"
            && pointer.syncMode === "reference_only"
            && pointer.capabilities.includes("read_context");
    });
}
function validateInput(input) {
    const rejections = [];
    const inputShapeReasons = unknownFieldReasons(input, INPUT_FIELDS, "input");
    if (inputShapeReasons.length > 0) {
        rejections.push({
            proposalId: "input-schema",
            kind: "input",
            reasons: inputShapeReasons,
        });
    }
    if (input.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        rejections.push({
            proposalId: "input-contract",
            kind: "input",
            reasons: ["input contract version does not match"],
        });
    }
    if (!isStrictRfc3339(input.generatedAt)) {
        rejections.push({
            proposalId: "input-generated-at",
            kind: "input",
            reasons: ["input generatedAt must be strict RFC3339 with Z or an offset"],
        });
    }
    const pointerCounts = new Map();
    const sourceIdentityCounts = new Map();
    for (const pointer of input.pointers) {
        pointerCounts.set(pointer.id, (pointerCounts.get(pointer.id) ?? 0) + 1);
        const identity = `${pointer.sourceKind}:${pointer.sourceRefHash}`;
        sourceIdentityCounts.set(identity, (sourceIdentityCounts.get(identity) ?? 0) + 1);
    }
    const pointerIds = new Set(input.pointers.map((pointer) => pointer.id));
    const invalidPointerIds = new Set();
    for (const pointer of input.pointers) {
        const reasons = [
            ...unknownFieldReasons(pointer, POINTER_FIELDS, "pointer"),
            ...safeIdReasons("pointer id", pointer.id),
            ...safeIdReasons("source object id", pointer.sourceObjectId, SAFE_SOURCE_OBJECT_ID),
        ];
        if ((pointerCounts.get(pointer.id) ?? 0) > 1)
            reasons.push("duplicate pointer id");
        if ((sourceIdentityCounts.get(`${pointer.sourceKind}:${pointer.sourceRefHash}`) ?? 0) > 1) {
            reasons.push("duplicate source identity");
        }
        if (!VALID_SOURCE_KINDS.has(pointer.sourceKind))
            reasons.push("source kind is invalid");
        if (!VALID_AUTHORITIES.has(pointer.authority))
            reasons.push("source authority is invalid");
        if (!VALID_SYNC_MODES.has(pointer.syncMode))
            reasons.push("source sync mode is invalid");
        if (!/^[a-f0-9]{8,64}$/i.test(pointer.sourceRefHash)) {
            reasons.push("sourceRefHash must be an opaque hex digest");
        }
        if (!Array.isArray(pointer.capabilities)) {
            reasons.push("capabilities must be an array");
        }
        else {
            if (new Set(pointer.capabilities).size !== pointer.capabilities.length) {
                reasons.push("capabilities must not contain duplicates");
            }
            if (pointer.capabilities.some((capability) => !VALID_CAPABILITIES.has(capability))) {
                reasons.push("source capability is invalid");
            }
            const allowedForMode = ALLOWED_CAPABILITIES_BY_SYNC_MODE[pointer.syncMode];
            if (allowedForMode
                && pointer.capabilities.some((capability) => !allowedForMode.has(capability))) {
                reasons.push("source capability conflicts with sync mode");
            }
            if (pointer.authority === "none"
                && pointer.capabilities.some((capability) => WRITE_CAPABILITIES.has(capability))) {
                reasons.push("authority none cannot declare write capabilities");
            }
        }
        if (pointer.sourceVersion) {
            reasons.push(...safeIdReasons("source version", pointer.sourceVersion, SAFE_SOURCE_OBJECT_ID));
        }
        if (pointer.canonicalUrl) {
            try {
                const url = new URL(pointer.canonicalUrl);
                if (!["https:", "http:"].includes(url.protocol))
                    reasons.push("canonical URL must be http(s)");
                if (url.username || url.password)
                    reasons.push("canonical URL must not contain credentials");
                reasons.push(...textLeakReasons([
                    url.pathname,
                    url.search,
                    url.hash,
                ].join("\n")));
                for (const key of url.searchParams.keys()) {
                    if (/(?:token|secret|api[_-]?key|auth|code|pwd|pass(?:word)?|sig(?:nature)?|credential|access[_-]?key|session(?:id)?)/i
                        .test(key)) {
                        reasons.push("canonical URL must not contain credential-like query parameters");
                        break;
                    }
                }
            }
            catch {
                reasons.push("canonical URL is invalid");
            }
        }
        if (reasons.length) {
            invalidPointerIds.add(pointer.id);
            rejections.push({ proposalId: pointer.id, kind: "input", reasons: unique(reasons) });
        }
    }
    const eventCounts = new Map();
    for (const event of input.events) {
        eventCounts.set(event.id, (eventCounts.get(event.id) ?? 0) + 1);
    }
    const eventIds = new Set(input.events.map((event) => event.id));
    for (const event of input.events) {
        const reasons = [
            ...unknownFieldReasons(event, EVENT_FIELDS, "event"),
            ...boundedTextReasons(event.title, event.summary),
            ...safeIdReasons("event id", event.id),
            ...safeIdReasons("pointer id", event.pointerId),
        ];
        if ((eventCounts.get(event.id) ?? 0) > 1)
            reasons.push("duplicate event id");
        if (pointerIds.has(event.id))
            reasons.push("event id collides with pointer id");
        if (!pointerIds.has(event.pointerId))
            reasons.push("pointer does not exist");
        if (invalidPointerIds.has(event.pointerId))
            reasons.push("pointer was rejected");
        if (!isStrictRfc3339(event.occurredAt) || !isStrictRfc3339(event.observedAt)) {
            reasons.push("event timestamps must be strict RFC3339 with Z or an offset");
        }
        else {
            if (Date.parse(event.occurredAt) > Date.parse(event.observedAt)) {
                reasons.push("event occurredAt must not be after observedAt");
            }
            if (isStrictRfc3339(input.generatedAt)
                && Date.parse(event.observedAt) > Date.parse(input.generatedAt)) {
                reasons.push("event observedAt must not be after input generatedAt");
            }
        }
        if (event.deadlineAt && !isStrictRfc3339(event.deadlineAt)) {
            reasons.push("deadlineAt must be strict RFC3339 with Z or an offset");
        }
        if (event.dayKey !== undefined && !isRealDayKey(event.dayKey)) {
            reasons.push("dayKey must be a real YYYY-MM-DD source-local date");
        }
        if (!(event.extractionConfidence >= 0 && event.extractionConfidence <= 1)) {
            reasons.push("extraction confidence must be in [0,1]");
        }
        if (event.priority !== undefined
            && (!Number.isFinite(event.priority) || event.priority < 0 || event.priority > 1)) {
            reasons.push("priority must be in [0,1]");
        }
        if (!VALID_RECORD_KINDS.has(event.recordKind))
            reasons.push("record kind is invalid");
        if (!VALID_ACTIVITIES.has(event.activity))
            reasons.push("activity is invalid");
        if (event.sourceStatus !== undefined && !VALID_SOURCE_STATUSES.has(event.sourceStatus)) {
            reasons.push("source status is invalid");
        }
        if (!Array.isArray(event.objectRefs) || event.objectRefs.length === 0) {
            reasons.push("event must have at least one object ref");
        }
        else {
            for (const objectRef of event.objectRefs) {
                reasons.push(...safeIdReasons("object ref", objectRef));
            }
        }
        if (event.recordKind === "body_context" && event.activity !== "body_window_observed") {
            reasons.push("body context must use body_window_observed");
        }
        if (event.recordKind === "body_context") {
            if (!isRealDayKey(event.dayKey))
                reasons.push("body context requires an explicit source-local dayKey");
            if (!event.bodyCategory)
                reasons.push("body context must have a relative category");
            if (event.bodyCategory && !VALID_BODY_CATEGORIES.has(event.bodyCategory)) {
                reasons.push("body category is invalid");
            }
            if (!event.bodyAxis || !VALID_BODY_AXES.has(event.bodyAxis)) {
                reasons.push("body context must have a privacy-safe body axis");
            }
            if (/\b\d+(?:\.\d+)?\b/.test(`${event.title} ${event.summary}`)) {
                reasons.push("body context text must not contain raw numeric values");
            }
        }
        else {
            if (event.bodyCategory !== undefined)
                reasons.push("body category is only valid on body context");
            if (event.bodyAxis !== undefined)
                reasons.push("body axis is only valid on body context");
        }
        if (event.bodyJoinEligible !== undefined && typeof event.bodyJoinEligible !== "boolean") {
            reasons.push("bodyJoinEligible must be boolean");
        }
        if (event.corpusCoverage !== undefined && event.corpusCoverage !== "complete") {
            reasons.push("corpus coverage state is invalid");
        }
        if (event.corpusCoverage === "complete") {
            if (event.recordKind !== "receipt" || event.activity !== "receipt_observed") {
                reasons.push("corpus coverage must be an explicit receipt");
            }
            if (!isRealDayKey(event.dayKey)) {
                reasons.push("corpus coverage receipt requires a source-local dayKey");
            }
            if (event.bodyJoinEligible === true) {
                reasons.push("corpus coverage receipt cannot count as observed work");
            }
        }
        if (event.bodyJoinEligible === true
            && !["work_context", "receipt"].includes(event.recordKind)) {
            reasons.push("body joins require an explicit work-context or receipt timestamp");
        }
        if (event.bodyJoinEligible === true && !isRealDayKey(event.dayKey)) {
            reasons.push("body-join-eligible work requires an explicit source-local dayKey");
        }
        const pointer = input.pointers.find((candidate) => candidate.id === event.pointerId);
        if (pointer && BODY_SOURCE_KINDS.has(pointer.sourceKind)) {
            if (!["body_context", "receipt"].includes(event.recordKind)) {
                reasons.push("body-source pointers may only emit body context or receipts");
            }
        }
        else if (event.recordKind === "body_context") {
            reasons.push("body context must come from a body-source pointer");
        }
        if (event.recordKind === "authoritative_task" && pointer) {
            if (pointer.authority === "none")
                reasons.push("authoritative task pointer must own status");
            if (!Array.isArray(pointer.capabilities) || !pointer.capabilities.includes("read_task")) {
                reasons.push("authoritative task pointer must declare read_task");
            }
            if (event.activity === "task_completed" && event.sourceStatus !== "completed") {
                reasons.push("task_completed activity requires completed source status");
            }
            if (event.activity === "task_reopened" && ["completed", "cancelled"].includes(event.sourceStatus ?? "")) {
                reasons.push("task_reopened activity conflicts with closed source status");
            }
            if (event.activity === "task_created" && ["completed", "cancelled"].includes(event.sourceStatus ?? "")) {
                reasons.push("task_created activity conflicts with closed source status");
            }
            if (event.sourceStatus === "completed" && ["task_created", "task_reopened"].includes(event.activity)) {
                reasons.push("completed source status conflicts with task activity");
            }
            if (event.sourceStatus === "cancelled" && ["task_completed", "task_reopened"].includes(event.activity)) {
                reasons.push("cancelled source status conflicts with task activity");
            }
        }
        if (event.supersedesEventId) {
            if (!eventIds.has(event.supersedesEventId))
                reasons.push("superseded event does not exist");
            if (event.supersedesEventId === event.id)
                reasons.push("event cannot supersede itself");
            const target = input.events.find((candidate) => candidate.id === event.supersedesEventId);
            if (target) {
                if (target.pointerId !== event.pointerId)
                    reasons.push("supersedes must stay within one source pointer");
                if (target.recordKind !== event.recordKind)
                    reasons.push("supersedes must preserve record kind");
                const later = Date.parse(event.observedAt) > Date.parse(target.observedAt)
                    || (Date.parse(event.observedAt) === Date.parse(target.observedAt)
                        && Date.parse(event.occurredAt) > Date.parse(target.occurredAt));
                if (!later)
                    reasons.push("superseding event must be observed after its target");
            }
        }
        if (event.retractsEventId) {
            if (!eventIds.has(event.retractsEventId))
                reasons.push("retracted event does not exist");
            if (event.retractsEventId === event.id)
                reasons.push("event cannot retract itself");
            const target = input.events.find((candidate) => candidate.id === event.retractsEventId);
            if (target) {
                if (target.pointerId !== event.pointerId)
                    reasons.push("retracts must stay within one source pointer");
                if (target.recordKind !== event.recordKind)
                    reasons.push("retracts must preserve record kind");
                const later = Date.parse(event.observedAt) > Date.parse(target.observedAt)
                    || (Date.parse(event.observedAt) === Date.parse(target.observedAt)
                        && Date.parse(event.occurredAt) > Date.parse(target.occurredAt));
                if (!later)
                    reasons.push("retracting event must be observed after its target");
            }
        }
        if (reasons.length)
            rejections.push({ proposalId: event.id, kind: "input", reasons: unique(reasons) });
    }
    return rejections;
}
/** Read-only validation of the complete Task Map input contract. */
function taskMapInputValidationReasons(input) {
    return unique(validateInput(input).flatMap((rejection) => rejection.reasons));
}
function validResolvedEvents(input) {
    const eventIds = new Set(input.events.map((event) => event.id));
    const invalidIds = new Set(validateInput(input)
        .filter((item) => item.kind === "input" && eventIds.has(item.proposalId))
        .map((item) => item.proposalId));
    const candidates = input.events.filter((event) => !invalidIds.has(event.id));
    const inactive = new Set();
    const tombstones = new Set();
    for (const event of candidates) {
        if (event.supersedesEventId)
            inactive.add(event.supersedesEventId);
        if (event.retractsEventId) {
            inactive.add(event.retractsEventId);
            tombstones.add(event.id);
        }
    }
    return candidates.filter((event) => !inactive.has(event.id) && !tombstones.has(event.id));
}
function validateRoot(root, events, semanticEventIds) {
    const reasons = [
        ...unknownFieldReasons(root, ROOT_PROPOSAL_FIELDS, "root proposal"),
        ...boundedTextReasons(root.title, root.summary),
        ...safeIdReasons("root proposal id", root.proposalId),
    ];
    const evidence = nonBodyEvidence(root.evidenceEventIds, events);
    if (root.evidenceEventIds.some((id) => !events.has(id)))
        reasons.push("evidence event does not exist");
    if (root.evidenceEventIds.some((id) => !semanticEventIds.has(id))) {
        reasons.push("evidence event is not available to the semantic brain");
    }
    if (root.evidenceEventIds.some((id) => events.get(id)?.recordKind === "body_context")) {
        reasons.push("body context must be joined after root membership");
    }
    if (evidence.length === 0)
        reasons.push("body context cannot create a root");
    const authoritative = evidence.some((event) => event.recordKind === "authoritative_task");
    const independentPointers = new Set(evidence.map((event) => event.pointerId));
    const independentDates = new Set(evidence.map((event) => event.occurredAt.slice(0, 10)));
    if (!authoritative && independentPointers.size < 2 && independentDates.size < 2) {
        reasons.push("root needs an authoritative task or evidence across two pointers/dates");
    }
    if (evidence.every((event) => event.extractionConfidence < 0.6)) {
        reasons.push("low-confidence extraction cannot create a root");
    }
    if (!Array.isArray(root.memberObjectRefs) || root.memberObjectRefs.length === 0) {
        reasons.push("root has no member object refs");
    }
    else {
        if (new Set(root.memberObjectRefs).size !== root.memberObjectRefs.length) {
            reasons.push("root member object refs must be unique");
        }
        const evidencedObjectRefs = new Set(evidence.flatMap((event) => event.objectRefs));
        for (const memberObjectRef of root.memberObjectRefs) {
            reasons.push(...safeIdReasons("root member object ref", memberObjectRef));
            if (!evidencedObjectRefs.has(memberObjectRef)) {
                reasons.push("root member object ref is not source-backed");
            }
        }
    }
    if (!(root.confidence >= 0 && root.confidence <= 1))
        reasons.push("confidence must be in [0,1]");
    return unique(reasons);
}
function validateTask(task, acceptedRoots, events, latestAuthoritative, semanticEventIds, pointers) {
    const reasons = [
        ...unknownFieldReasons(task, TASK_PROPOSAL_FIELDS, "task proposal"),
        ...boundedTextReasons(task.title, task.summary),
        ...safeIdReasons("task proposal id", task.proposalId),
        ...safeIdReasons("root proposal id", task.rootProposalId),
    ];
    const root = acceptedRoots.get(task.rootProposalId);
    if (!root)
        reasons.push("task root was rejected or is missing");
    if (task.evidenceEventIds.some((id) => !events.has(id)))
        reasons.push("evidence event does not exist");
    if (task.evidenceEventIds.some((id) => !semanticEventIds.has(id))) {
        reasons.push("evidence event is not available to the semantic brain");
    }
    if (task.evidenceEventIds.some((id) => events.get(id)?.recordKind === "body_context")) {
        reasons.push("body context must be joined after task membership");
    }
    const evidence = nonBodyEvidence(task.evidenceEventIds, events);
    if (evidence.length === 0)
        reasons.push("body context cannot create a task");
    if (root && !task.evidenceEventIds.some((id) => root.evidenceEventIds.includes(id))) {
        reasons.push("task needs evidence shared with its root");
    }
    if (evidence.every((event) => event.extractionConfidence < 0.6)) {
        reasons.push("low-confidence extraction cannot create a task");
    }
    if (!VALID_OPEN_STATES.has(task.openState))
        reasons.push("open state is invalid");
    if (!(task.confidence >= 0 && task.confidence <= 1))
        reasons.push("confidence must be in [0,1]");
    let authoritative;
    if (task.authoritativeTaskEventId) {
        authoritative = events.get(task.authoritativeTaskEventId);
        if (!authoritative || authoritative.recordKind !== "authoritative_task") {
            reasons.push("authoritativeTaskEventId must reference an authoritative task");
        }
        else if (!task.evidenceEventIds.includes(authoritative.id)) {
            reasons.push("authoritative task must be cited");
        }
        else if (latestAuthoritative.get(authoritative.pointerId)?.id !== authoritative.id) {
            reasons.push("authoritativeTaskEventId must reference the latest source event");
        }
    }
    const authoritativeOpenState = sourceOpenState(authoritative);
    const sourceCompleted = authoritativeOpenState === "completed";
    if (authoritativeOpenState && task.openState !== authoritativeOpenState) {
        reasons.push("brain open state conflicts with source status");
    }
    if (task.openState === "completed") {
        if (!sourceCompleted)
            reasons.push("completion cannot be inferred without a source completion event");
    }
    if (isAgentSessionReviewOnlyEvidence(evidence, pointers)) {
        const workItemRefs = unique(evidence.flatMap((event) => event.objectRefs.filter((ref) => ref.startsWith("work-item:"))));
        if (workItemRefs.some((ref) => !SOURCE_OWNED_WORK_ITEM_REF.test(ref))) {
            reasons.push("source-owned work item ref is invalid");
        }
        if (workItemRefs.length > 1) {
            reasons.push("task evidence has multiple source-owned work item refs");
        }
        if (workItemRefs.length === 1 && evidence.some((event) => !event.objectRefs.includes(workItemRefs[0])))
            reasons.push("source-owned work item ref must bind every task evidence event");
    }
    if (task.proposedReturnPointerId) {
        reasons.push(...safeIdReasons("proposed return pointer id", task.proposedReturnPointerId));
        const originPointerIds = new Set(evidence.map((event) => event.pointerId));
        const proposedPointer = pointers.get(task.proposedReturnPointerId);
        if (!originPointerIds.has(task.proposedReturnPointerId)) {
            reasons.push("proposed return pointer must be a cited task origin");
        }
        if (!proposedPointer) {
            reasons.push("proposed return pointer does not exist");
        }
        else {
            if (proposedPointer.syncMode === "reference_only") {
                reasons.push("proposed return pointer is reference-only");
            }
            if (!proposedPointer.capabilities.some((capability) => RETURN_CAPABILITIES.has(capability))) {
                reasons.push("proposed return pointer has no return capability");
            }
        }
    }
    return unique(reasons);
}
function validateEdge(edge, acceptedProposals, events, semanticEventIds) {
    const reasons = [
        ...unknownFieldReasons(edge, EDGE_PROPOSAL_FIELDS, "edge proposal"),
        ...safeIdReasons("edge proposal id", edge.proposalId),
    ];
    const from = acceptedProposals.get(edge.fromProposalId);
    const to = acceptedProposals.get(edge.toProposalId);
    if (!from || !to) {
        reasons.push("edge endpoint was rejected or is missing");
    }
    if (edge.fromProposalId === edge.toProposalId)
        reasons.push("self edges are not allowed");
    if (!VALID_RELATIONS.has(edge.relation))
        reasons.push("edge relation is invalid");
    if (from && to && VALID_RELATIONS.has(edge.relation)) {
        if (edge.relation === "advances") {
            if (from.kind !== "root" || to.kind !== "task") {
                reasons.push("advances edges require root-to-task endpoints");
            }
        }
        else if (["depends_on", "blocks", "supersedes", "informed_by"].includes(edge.relation)) {
            if (from.kind !== "task" || to.kind !== "task") {
                reasons.push("edge relation requires task-to-task endpoints");
            }
        }
        else if (edge.relation === "related_to" && from.kind !== to.kind) {
            reasons.push("related_to edges require same-kind endpoints");
        }
        if (edge.relation === "supersedes" && to.kind === "task") {
            if (to.task?.authoritativeTaskEventId) {
                reasons.push("semantic supersedes cannot override a source-owned task");
            }
            else if (to.task?.openState !== "superseded") {
                reasons.push("semantic supersedes target must be explicitly superseded");
            }
        }
    }
    const evidence = nonBodyEvidence(edge.evidenceEventIds, events);
    if (edge.evidenceEventIds.some((id) => !events.has(id)))
        reasons.push("evidence event does not exist");
    if (edge.evidenceEventIds.some((id) => !semanticEventIds.has(id))) {
        reasons.push("evidence event is not available to the semantic brain");
    }
    if (edge.evidenceEventIds.some((id) => events.get(id)?.recordKind === "body_context")) {
        reasons.push("body context must be joined after edge membership");
    }
    if (evidence.length === 0)
        reasons.push("edge needs non-body evidence");
    if (from && !edge.evidenceEventIds.some((id) => from.evidenceEventIds.includes(id))) {
        reasons.push("edge evidence does not support its from endpoint");
    }
    if (to && !edge.evidenceEventIds.some((id) => to.evidenceEventIds.includes(id))) {
        reasons.push("edge evidence does not support its to endpoint");
    }
    if (!(edge.confidence >= 0 && edge.confidence <= 1))
        reasons.push("confidence must be in [0,1]");
    return unique(reasons);
}
function cyclicExecutionEdgeIds(edges) {
    const ordered = edges.filter((edge) => (["depends_on", "blocks", "supersedes"].includes(edge.relation)));
    const adjacency = new Map();
    for (const edge of ordered) {
        const next = adjacency.get(edge.fromProposalId) ?? [];
        next.push(edge.toProposalId);
        adjacency.set(edge.fromProposalId, next);
    }
    const hasPath = (start, target) => {
        const pending = [start];
        const seen = new Set();
        while (pending.length > 0) {
            const current = pending.pop();
            if (current === target)
                return true;
            if (seen.has(current))
                continue;
            seen.add(current);
            pending.push(...(adjacency.get(current) ?? []));
        }
        return false;
    };
    return new Set(ordered
        .filter((edge) => hasPath(edge.toProposalId, edge.fromProposalId))
        .map((edge) => edge.proposalId));
}
function jaccard(a, b) {
    const left = new Set(a);
    const right = new Set(b);
    const union = new Set([...left, ...right]);
    if (union.size === 0)
        return 0;
    let intersection = 0;
    for (const value of left)
        if (right.has(value))
            intersection += 1;
    return intersection / union.size;
}
function persistentRootIds(roots, previous, events, pointers) {
    const ids = new Map();
    const orderedRoots = [...roots].sort((a, b) => a.proposalId.localeCompare(b.proposalId));
    const orderedPrior = [...(previous?.roots ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    if (orderedRoots.length > 0 && orderedPrior.length > 0) {
        // Rectangular Hungarian assignment. Eligible matches receive a dominant
        // cardinality bonus plus Jaccard overlap, so the result first preserves
        // as many root identities as possible, then maximizes total overlap.
        const rowCount = orderedRoots.length;
        const realColumnCount = orderedPrior.length;
        const columnCount = realColumnCount + rowCount;
        const dummyCost = rowCount + 2;
        const ineligibleCost = 2 * dummyCost;
        const costs = orderedRoots.map((root) => [
            ...orderedPrior.map((prior) => {
                const overlap = jaccard(unique(root.memberObjectRefs), unique(prior.memberObjectRefs));
                return overlap >= exports.TASKMAP_ALGORITHM_POLICY.rootReuseJaccard ? 1 - overlap : ineligibleCost;
            }),
            ...Array(rowCount).fill(dummyCost),
        ]);
        const u = Array(rowCount + 1).fill(0);
        const v = Array(columnCount + 1).fill(0);
        const p = Array(columnCount + 1).fill(0);
        const way = Array(columnCount + 1).fill(0);
        for (let row = 1; row <= rowCount; row += 1) {
            p[0] = row;
            let column0 = 0;
            const minv = Array(columnCount + 1).fill(Infinity);
            const used = Array(columnCount + 1).fill(false);
            do {
                used[column0] = true;
                const row0 = p[column0];
                let delta = Infinity;
                let column1 = 0;
                for (let column = 1; column <= columnCount; column += 1) {
                    if (used[column])
                        continue;
                    const current = costs[row0 - 1][column - 1] - u[row0] - v[column];
                    if (current < minv[column]) {
                        minv[column] = current;
                        way[column] = column0;
                    }
                    if (minv[column] < delta || (minv[column] === delta && column < column1)) {
                        delta = minv[column];
                        column1 = column;
                    }
                }
                for (let column = 0; column <= columnCount; column += 1) {
                    if (used[column]) {
                        u[p[column]] += delta;
                        v[column] -= delta;
                    }
                    else {
                        minv[column] -= delta;
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
        for (let column = 1; column <= realColumnCount; column += 1) {
            const row = p[column];
            if (row === 0)
                continue;
            const root = orderedRoots[row - 1];
            const prior = orderedPrior[column - 1];
            if (jaccard(unique(root.memberObjectRefs), unique(prior.memberObjectRefs))
                >= exports.TASKMAP_ALGORITHM_POLICY.rootReuseJaccard) {
                ids.set(root.proposalId, prior.id);
            }
        }
    }
    const usedIds = new Set(ids.values());
    for (const root of orderedRoots) {
        if (ids.has(root.proposalId))
            continue;
        const members = unique(root.memberObjectRefs).sort();
        const sourceOwnedWorkstreamRefs = members.filter((ref) => SOURCE_OWNED_WORKSTREAM_REF.test(ref));
        const agentSessionEvidence = isAgentSessionReviewOnlyEvidence(nonBodyEvidence(root.evidenceEventIds, events), pointers);
        const seed = agentSessionEvidence
            && sourceOwnedWorkstreamRefs.length === 1
            ? sourceOwnedWorkstreamRefs[0]
            : `${root.title}\u0000${members.join("\u0000")}`;
        let candidate = stableId("tmr", seed);
        let collision = 0;
        while (usedIds.has(candidate)) {
            collision += 1;
            candidate = stableId("tmr", `${seed}\u0000${root.proposalId}\u0000${collision}`);
        }
        ids.set(root.proposalId, candidate);
        usedIds.add(candidate);
    }
    return ids;
}
function taskIdentity(task, events, pointers, root) {
    if (task.authoritativeTaskEventId) {
        const event = events.get(task.authoritativeTaskEventId);
        const pointer = event ? pointers.get(event.pointerId) : undefined;
        if (pointer)
            return stableId("tmt", `${pointer.sourceKind}:${pointer.sourceRefHash}`);
    }
    const evidence = nonBodyEvidence(task.evidenceEventIds, events);
    const sourceOwnedWorkItemRefs = isAgentSessionReviewOnlyEvidence(evidence, pointers) ? unique(evidence.flatMap((event) => event.objectRefs.filter((ref) => SOURCE_OWNED_WORK_ITEM_REF.test(ref)))) : [];
    if (sourceOwnedWorkItemRefs.length === 1)
        return stableId("tmc", sourceOwnedWorkItemRefs[0]);
    const normalizedText = (value) => semanticTokens(value).join(" ");
    const identityEvidence = evidence.map((event) => {
        const pointer = pointers.get(event.pointerId);
        return {
            sourceKind: pointer?.sourceKind ?? "unknown",
            sourceRefHash: pointer?.sourceRefHash ?? "missing",
            objectRefs: unique(event.objectRefs).sort(),
        };
    }).sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    return stableId("tmc", stableJson({
        title: normalizedText(task.title),
        summary: normalizedText(task.summary),
        rootMembers: unique(root?.memberObjectRefs ?? []).sort(),
        evidence: identityEvidence,
    }));
}
function semanticTokens(value) {
    const stopwords = new Set([
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
        "it", "of", "on", "or", "the", "this", "to", "versus", "with",
    ]);
    return unique(value
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !stopwords.has(token)))
        .sort();
}
function reusePreviousDiscoveredTaskIds(tasks, ids, rootIds, previous, events, pointers) {
    if (!previous)
        return;
    const candidates = tasks
        .filter((task) => !task.authoritativeTaskEventId)
        .sort((a, b) => a.proposalId.localeCompare(b.proposalId));
    const priorTasks = previous.tasks
        .filter((task) => task.id.startsWith("tmc_") && !task.taskHomePointerId)
        .sort((a, b) => a.id.localeCompare(b.id));
    const usedPrior = new Set();
    for (const task of candidates) {
        const rootId = rootIds.get(task.rootProposalId);
        const evidenceSourceIdentities = unique(nonBodyEvidence(task.evidenceEventIds, events)
            .map((event) => stableSourceIdentity(pointers.get(event.pointerId)))
            .filter((identity) => Boolean(identity)));
        const tokens = semanticTokens(`${task.title} ${task.summary}`);
        const matches = priorTasks
            .filter((prior) => !usedPrior.has(prior.id) && prior.rootId === rootId)
            .map((prior) => ({
            prior,
            evidenceOverlap: jaccard(evidenceSourceIdentities, prior.citations.map((citation) => `${citation.sourceKind}:${citation.sourceRefHash}`)),
            semanticOverlap: jaccard(tokens, semanticTokens(`${prior.title} ${prior.summary}`)),
        }))
            .filter((match) => match.evidenceOverlap >= 0.5 && match.semanticOverlap >= 0.25)
            .sort((a, b) => (b.evidenceOverlap - a.evidenceOverlap
            || b.semanticOverlap - a.semanticOverlap
            || a.prior.id.localeCompare(b.prior.id)));
        const best = matches[0]?.prior;
        if (!best)
            continue;
        ids.set(task.proposalId, best.id);
        usedPrior.add(best.id);
    }
    const usedFinal = new Set();
    for (const task of [...tasks].sort((a, b) => a.proposalId.localeCompare(b.proposalId))) {
        let id = ids.get(task.proposalId);
        if (!id)
            continue;
        let collision = 0;
        while (usedFinal.has(id)) {
            collision += 1;
            id = stableId("tmc", `${id}\u0000${task.proposalId}\u0000${collision}`);
        }
        ids.set(task.proposalId, id);
        usedFinal.add(id);
    }
}
function causalGrade(input) {
    if (!input)
        return { grade: "C0_NO_DATA" };
    const gateResult = (0, EnrichmentGate_js_1.enrichmentGate)(input.enrichment);
    const rawResult = (gateResult.verdict === "attribution_candidate"
        && input.enrichment.referenceN < exports.TASKMAP_ALGORITHM_POLICY.causal.minNeutralReferenceDays) ? {
        ...gateResult,
        verdict: "insufficient_power",
        reasons: [
            `only ${input.enrichment.referenceN} neutral reference day(s); need >= ${exports.TASKMAP_ALGORITHM_POLICY.causal.minNeutralReferenceDays}`,
        ],
    } : gateResult;
    const result = {
        ...rawResult,
        ratio: Number.isFinite(rawResult.ratio) ? rawResult.ratio : null,
        enrichmentInfinite: rawResult.ratio === Infinity,
    };
    switch (rawResult.verdict) {
        case "attribution_candidate":
            return { grade: "C2_ATTRIBUTION_CANDIDATE", result };
        case "context_only":
            return { grade: "C1_CORRELATION", result };
        case "insufficient_power":
            return { grade: "C1_CORRELATION", result };
        case "no_data":
        default:
            return { grade: "C0_NO_DATA", result };
    }
}
function bodyBonusFor(grade) {
    switch (grade) {
        case "C2_ATTRIBUTION_CANDIDATE": return exports.TASKMAP_ALGORITHM_POLICY.bodyBonus.C2_ATTRIBUTION_CANDIDATE;
        case "C3_CAUSAL_HYPOTHESIS": return exports.TASKMAP_ALGORITHM_POLICY.bodyBonus.C3_CAUSAL_HYPOTHESIS;
        case "C4_VALIDATED_PATTERN": return exports.TASKMAP_ALGORITHM_POLICY.bodyBonus.C4_VALIDATED_PATTERN;
        default: return 0;
    }
}
function deadlinePressure(deadlineAt, nowMs) {
    if (!deadlineAt || !isStrictRfc3339(deadlineAt))
        return 0;
    const days = (Date.parse(deadlineAt) - nowMs) / (24 * 60 * 60 * 1_000);
    if (days < 0)
        return 1;
    for (const bucket of exports.TASKMAP_ALGORITHM_POLICY.deadlinePressure) {
        if (days <= bucket.maxDays)
            return bucket.score;
    }
    return 0;
}
function staleOpenScore(evidence, nowMs) {
    const oldest = evidence.reduce((min, event) => Math.min(min, Date.parse(event.occurredAt)), Infinity);
    if (!Number.isFinite(oldest))
        return 0;
    const days = Math.max(0, (nowMs - oldest) / (24 * 60 * 60 * 1_000));
    return clamp01(days / exports.TASKMAP_ALGORITHM_POLICY.staleOpenDays);
}
function recurrenceScore(evidence, pointers) {
    const days = new Set(evidence.map((event) => (isRealDayKey(event.dayKey) ? event.dayKey : event.occurredAt.slice(0, 10)))).size;
    const sources = new Set(evidence
        .map((event) => stableSourceIdentity(pointers.get(event.pointerId)))
        .filter((identity) => Boolean(identity))).size;
    return clamp01((Math.min(days, exports.TASKMAP_ALGORITHM_POLICY.recurrence.dayCap)
        + Math.min(sources, exports.TASKMAP_ALGORITHM_POLICY.recurrence.pointerCap)) / exports.TASKMAP_ALGORITHM_POLICY.recurrence.divisor);
}
function scoreTask(task, evidence, dependencyImpact, bodyBonus, nowMs, pointers) {
    if (["completed", "superseded"].includes(task.openState)) {
        return {
            sourcePriority: 0,
            deadlinePressure: 0,
            dependencyImpact: 0,
            recurrence: 0,
            staleOpen: 0,
            evidenceStrength: 0,
            bodyBonus: 0,
            total: 0,
        };
    }
    const sourcePriority = Math.max(0, ...evidence.map((event) => clamp01(event.priority)));
    const deadline = Math.max(0, ...evidence.map((event) => deadlinePressure(event.deadlineAt, nowMs)));
    const recurrence = recurrenceScore(evidence, pointers);
    const staleOpen = staleOpenScore(evidence, nowMs);
    const evidenceStrength = evidence.length === 0
        ? 0
        : evidence.reduce((sum, event) => sum + clamp01(event.extractionConfidence), 0) / evidence.length;
    const total = (sourcePriority * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.sourcePriority
        + deadline * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.deadlinePressure
        + clamp01(dependencyImpact) * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.dependencyImpact
        + recurrence * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.recurrence
        + staleOpen * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.staleOpen
        + evidenceStrength * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.evidenceStrength
        + Math.min(exports.TASKMAP_ALGORITHM_POLICY.bodyBonus.C4_VALIDATED_PATTERN, Math.max(0, bodyBonus)));
    return {
        sourcePriority: round(sourcePriority),
        deadlinePressure: round(deadline),
        dependencyImpact: round(clamp01(dependencyImpact)),
        recurrence: round(recurrence),
        staleOpen: round(staleOpen),
        evidenceStrength: round(evidenceStrength),
        bodyBonus: round(Math.min(exports.TASKMAP_ALGORITHM_POLICY.bodyBonus.C4_VALIDATED_PATTERN, Math.max(0, bodyBonus))),
        total: round(total),
    };
}
function whyNow(score, grade) {
    const reasons = [
        [score.deadlinePressure * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.deadlinePressure, "deadline pressure"],
        [score.sourcePriority * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.sourcePriority, "source priority"],
        [score.dependencyImpact * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.dependencyImpact, "blocks downstream work"],
        [score.recurrence * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.recurrence, "recurs across work context"],
        [score.staleOpen * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.staleOpen, "old but still open"],
        [score.evidenceStrength * exports.TASKMAP_ALGORITHM_POLICY.scoreWeights.evidenceStrength, "source-backed evidence"],
    ];
    if (score.bodyBonus > 0)
        reasons.push([score.bodyBonus, `body context (${grade}; not causal)`]);
    return reasons
        .filter(([value]) => value > 0)
        .sort((a, b) => b[0] - a[0])
        .slice(0, 3)
        .map(([, label]) => label);
}
function scoreRoot(tasks, evidence, dependencyEdgeCount, joinedBodyCount, grade, pointers) {
    const actionableTasks = tasks.filter((task) => (!["source_complete", "superseded"].includes(task.reviewState)
        && !["completed", "superseded"].includes(task.openState)));
    if (actionableTasks.length === 0) {
        return {
            maxChildActionability: 0,
            rootRecurrence: 0,
            evidenceStrength: 0,
            sourceBreadth: 0,
            actionableLoad: 0,
            dependencyBreadth: 0,
            bodyBonus: 0,
            total: 0,
        };
    }
    const maxChildActionability = clamp01(Math.max(0, ...actionableTasks.map((task) => task.score.total - task.score.bodyBonus)));
    const rootRecurrence = recurrenceScore(evidence, pointers);
    const evidenceStrength = evidence.length === 0
        ? 0
        : evidence.reduce((sum, event) => sum + clamp01(event.extractionConfidence), 0) / evidence.length;
    const sourceBreadth = clamp01(new Set(evidence
        .map((event) => pointers.get(event.pointerId)?.sourceKind)
        .filter(Boolean)).size / exports.TASKMAP_ALGORITHM_POLICY.rootScoreCaps.sourceKinds);
    const actionableLoad = clamp01(actionableTasks.length / exports.TASKMAP_ALGORITHM_POLICY.rootScoreCaps.actionableTasks);
    const dependencyBreadth = clamp01(dependencyEdgeCount / exports.TASKMAP_ALGORITHM_POLICY.rootScoreCaps.dependencyEdges);
    const bodyBonus = joinedBodyCount > 0
        ? Math.min(exports.TASKMAP_ALGORITHM_POLICY.rootScoreCaps.bodyBonus, bodyBonusFor(grade))
        : 0;
    const total = clamp01(maxChildActionability * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.maxChildActionability
        + rootRecurrence * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.rootRecurrence
        + evidenceStrength * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.evidenceStrength
        + sourceBreadth * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.sourceBreadth
        + actionableLoad * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.actionableLoad
        + dependencyBreadth * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.dependencyBreadth
        + bodyBonus);
    return {
        maxChildActionability: round(maxChildActionability),
        rootRecurrence: round(rootRecurrence),
        evidenceStrength: round(evidenceStrength),
        sourceBreadth: round(sourceBreadth),
        actionableLoad: round(actionableLoad),
        dependencyBreadth: round(dependencyBreadth),
        bodyBonus: round(bodyBonus),
        total: round(total),
    };
}
function rootWhyNow(score, grade) {
    const reasons = [
        [
            score.maxChildActionability
                * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.maxChildActionability,
            "top actionable task",
        ],
        [
            score.rootRecurrence * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.rootRecurrence,
            "recurs across work context",
        ],
        [
            score.evidenceStrength * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.evidenceStrength,
            "source-backed root evidence",
        ],
        [
            score.sourceBreadth * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.sourceBreadth,
            "spans multiple sources",
        ],
        [
            score.actionableLoad * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.actionableLoad,
            "multiple open tasks",
        ],
        [
            score.dependencyBreadth * exports.TASKMAP_ALGORITHM_POLICY.rootScoreWeights.dependencyBreadth,
            "connected execution dependencies",
        ],
    ];
    if (score.bodyBonus > 0) {
        reasons.push([score.bodyBonus, `body context (${grade}; not causal)`]);
    }
    return reasons
        .filter(([value]) => value > 0)
        .sort((a, b) => b[0] - a[0])
        .slice(0, 3)
        .map(([, label]) => label);
}
function bodyContextCount(evidence, bodyEvents) {
    const joinableEvidence = evidence.filter((event) => event.bodyJoinEligible === true);
    let count = 0;
    for (const body of bodyEvents) {
        const bodyMs = Date.parse(body.occurredAt);
        if (joinableEvidence.some((event) => (Math.abs(Date.parse(event.occurredAt) - bodyMs)
            <= exports.TASKMAP_ALGORITHM_POLICY.bodyJoinWindowMs))) {
            count += 1;
        }
    }
    return count;
}
function sourceOpenState(event) {
    if (!event)
        return undefined;
    if (event.activity === "task_completed")
        return "completed";
    switch (event.sourceStatus) {
        case "completed": return "completed";
        case "cancelled": return "superseded";
        case "blocked": return "blocked";
        case "awaiting_review": return "awaiting_review";
        case "open":
        case "in_progress":
            return "open";
        default: break;
    }
    if (event.activity === "task_reopened" || event.activity === "task_created")
        return "open";
    return "unknown";
}
function explicitOnlyBrain(input) {
    const authoritative = [...latestAuthoritativeEvents(input).values()]
        .sort((a, b) => a.pointerId.localeCompare(b.pointerId));
    const roots = authoritative.map((event) => ({
        proposalId: `explicit-root:${event.id}`,
        title: event.title,
        summary: event.summary,
        evidenceEventIds: [event.id],
        memberObjectRefs: event.objectRefs,
        confidence: event.extractionConfidence,
    }));
    const tasks = authoritative.map((event) => ({
        proposalId: `explicit-task:${event.id}`,
        rootProposalId: `explicit-root:${event.id}`,
        title: event.title,
        summary: event.summary,
        evidenceEventIds: [event.id],
        authoritativeTaskEventId: event.id,
        openState: sourceOpenState(event) ?? "unknown",
        confidence: event.extractionConfidence,
    }));
    return {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "deterministic-explicit-baseline",
        model: "none",
        promptHash: "none",
        inputDigest: taskMapSemanticInputDigest(input),
        generatedAt: input.generatedAt,
        roots,
        tasks,
        edges: [],
    };
}
function effectiveBrain(input, brain, arm) {
    if (arm === "E0")
        return explicitOnlyBrain(input);
    return brain;
}
function validateBrain(brain, expectedInputDigest, inputGeneratedAt, runGeneratedAt) {
    const reasons = [
        ...unknownFieldReasons(brain, BRAIN_FIELDS, "semantic brain"),
    ];
    if (brain.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        reasons.push("brain contract version does not match");
    }
    if (brain.inputDigest !== expectedInputDigest) {
        reasons.push("brain semantic input digest does not match");
    }
    if (!SAFE_BRAIN_LABEL.test(brain.provider) || textLeakReasons(brain.provider).length > 0) {
        reasons.push("brain provider is not a safe label");
    }
    if (!SAFE_BRAIN_LABEL.test(brain.model) || textLeakReasons(brain.model).length > 0) {
        reasons.push("brain model is not a safe label");
    }
    if (!SAFE_PROMPT_HASH.test(brain.promptHash)) {
        reasons.push("brain promptHash must be an opaque hex digest");
    }
    if (!isStrictRfc3339(brain.generatedAt)) {
        reasons.push("brain generatedAt must be strict RFC3339 with Z or an offset");
    }
    else {
        if (isStrictRfc3339(inputGeneratedAt)
            && Date.parse(brain.generatedAt) < Date.parse(inputGeneratedAt)) {
            reasons.push("brain generatedAt must not be before input generatedAt");
        }
        if (isStrictRfc3339(runGeneratedAt)
            && Date.parse(brain.generatedAt) > Date.parse(runGeneratedAt)) {
            reasons.push("brain generatedAt must not be after run generatedAt");
        }
    }
    if (!Array.isArray(brain.roots) || !Array.isArray(brain.tasks) || !Array.isArray(brain.edges)) {
        reasons.push("brain proposal collections must be arrays");
    }
    return unique(reasons);
}
function validatePreviousProjection(previous, currentGeneratedAt) {
    if (!previous)
        return [];
    const reasons = [
        ...unknownFieldReasons(previous, PROJECTION_FIELDS, "previous projection"),
    ];
    if (previous.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        reasons.push("previous projection contract version does not match");
    }
    if (previous.runStatus !== "accepted") {
        reasons.push("previous projection must be accepted");
    }
    if (previous.algorithmPolicyVersion !== types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION
        || previous.algorithmPolicyDigest !== exports.TASKMAP_ALGORITHM_POLICY_DIGEST) {
        reasons.push("previous projection algorithm policy does not match");
    }
    if (!isStrictRfc3339(previous.generatedAt)) {
        reasons.push("previous projection generatedAt must be strict RFC3339 with Z or an offset");
    }
    else if (isStrictRfc3339(currentGeneratedAt)
        && Date.parse(previous.generatedAt) > Date.parse(currentGeneratedAt)) {
        reasons.push("previous projection must not be newer than the current run");
    }
    if (previous.brain) {
        reasons.push(...unknownFieldReasons(previous.brain, PROJECTION_BRAIN_FIELDS, "previous brain"));
    }
    for (const source of Array.isArray(previous.sources) ? previous.sources : []) {
        reasons.push(...unknownFieldReasons(source, PROJECTION_SOURCE_FIELDS, "previous source"));
    }
    const previousRoots = Array.isArray(previous.roots) ? previous.roots : [];
    const previousTasks = Array.isArray(previous.tasks) ? previous.tasks : [];
    const previousEdges = Array.isArray(previous.edges) ? previous.edges : [];
    const previousRejections = Array.isArray(previous.rejections) ? previous.rejections : [];
    if (!Array.isArray(previous.roots))
        reasons.push("previous projection roots must be an array");
    if (!Array.isArray(previous.tasks))
        reasons.push("previous projection tasks must be an array");
    if (!Array.isArray(previous.edges))
        reasons.push("previous projection edges must be an array");
    if (!Array.isArray(previous.rejections))
        reasons.push("previous projection rejections must be an array");
    const rootIds = new Set();
    const nodeIds = new Set();
    for (const root of previousRoots) {
        reasons.push(...unknownFieldReasons(root, PROJECTION_ROOT_FIELDS, "previous root"));
        reasons.push(...unknownFieldReasons(root.scoreBreakdown, ROOT_SCORE_FIELDS, "previous root score breakdown"));
        if (!/^tmr_[a-f0-9]{16}$/.test(root.id))
            reasons.push("previous root id is invalid");
        if (nodeIds.has(root.id))
            reasons.push("previous root ids must be globally unique");
        rootIds.add(root.id);
        nodeIds.add(root.id);
        if (!Array.isArray(root.memberObjectRefs) || root.memberObjectRefs.length === 0) {
            reasons.push("previous root members are invalid");
        }
        else {
            if (new Set(root.memberObjectRefs).size !== root.memberObjectRefs.length) {
                reasons.push("previous root members must be unique");
            }
            for (const member of root.memberObjectRefs) {
                reasons.push(...safeIdReasons("previous root member", member));
            }
        }
        if (root.causalGate) {
            reasons.push(...unknownFieldReasons(root.causalGate, CAUSAL_GATE_FIELDS, "previous causal gate"));
        }
        if (root.visibleTaskIds !== undefined) {
            if (!Array.isArray(root.visibleTaskIds)) {
                reasons.push("previous root visibleTaskIds must be an array");
            }
            else {
                if (root.visibleTaskIds.length === 0) {
                    reasons.push("previous root visibleTaskIds must not be empty");
                }
                if (root.visibleTaskIds.length > 5) {
                    reasons.push("previous root visibleTaskIds must contain at most 5 tasks");
                }
                if (new Set(root.visibleTaskIds).size !== root.visibleTaskIds.length) {
                    reasons.push("previous root visibleTaskIds must be unique");
                }
                if (Array.isArray(root.taskIds)
                    && root.visibleTaskIds.some((taskId) => !root.taskIds.includes(taskId))) {
                    reasons.push("previous root visibleTaskIds must reference root taskIds");
                }
            }
        }
        for (const citation of root.citations ?? []) {
            reasons.push(...unknownFieldReasons(citation, CITATION_FIELDS, "previous citation"));
        }
    }
    for (const task of previousTasks) {
        reasons.push(...unknownFieldReasons(task, PROJECTION_TASK_FIELDS, "previous task"));
        if (!/^tm[ct]_[a-f0-9]{16}$/.test(task.id))
            reasons.push("previous task id is invalid");
        if (nodeIds.has(task.id))
            reasons.push("previous task ids must be globally unique");
        nodeIds.add(task.id);
        if (!/^tmr_[a-f0-9]{16}$/.test(task.rootId)) {
            reasons.push("previous task rootId is invalid");
        }
        if (!rootIds.has(task.rootId)) {
            reasons.push("previous task rootId must reference a previous root");
        }
        reasons.push(...unknownFieldReasons(task.score, SCORE_FIELDS, "previous task score"));
        reasons.push(...unknownFieldReasons(task.returnRoute, RETURN_ROUTE_FIELDS, "previous return route"));
        for (const citation of task.citations ?? []) {
            reasons.push(...unknownFieldReasons(citation, CITATION_FIELDS, "previous citation"));
        }
    }
    const taskMembershipCount = new Map();
    for (const root of previousRoots) {
        if (!Array.isArray(root.taskIds)) {
            reasons.push("previous root taskIds must be an array");
            continue;
        }
        if (new Set(root.taskIds).size !== root.taskIds.length) {
            reasons.push("previous root taskIds must be unique");
        }
        for (const taskId of root.taskIds) {
            taskMembershipCount.set(taskId, (taskMembershipCount.get(taskId) ?? 0) + 1);
            const task = previousTasks.find((candidate) => candidate.id === taskId);
            if (!task) {
                reasons.push("previous root taskIds must reference previous tasks");
            }
            else if (task.rootId !== root.id) {
                reasons.push("previous root taskIds and task rootId must agree");
            }
        }
    }
    for (const task of previousTasks) {
        if ((taskMembershipCount.get(task.id) ?? 0) !== 1) {
            reasons.push("previous task must appear exactly once in its root taskIds");
        }
    }
    const edgeIds = new Set();
    for (const edge of previousEdges) {
        reasons.push(...unknownFieldReasons(edge, PROJECTION_EDGE_FIELDS, "previous edge"));
        if (!/^tme_[a-f0-9]{16}$/.test(edge.id))
            reasons.push("previous edge id is invalid");
        if (edgeIds.has(edge.id) || nodeIds.has(edge.id)) {
            reasons.push("previous edge ids must be globally unique");
        }
        edgeIds.add(edge.id);
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            reasons.push("previous edge endpoints must reference previous roots or tasks");
        }
        for (const citation of edge.citations ?? []) {
            reasons.push(...unknownFieldReasons(citation, CITATION_FIELDS, "previous citation"));
        }
    }
    for (const rejection of previousRejections) {
        reasons.push(...unknownFieldReasons(rejection, REJECTION_FIELDS, "previous rejection"));
    }
    reasons.push(...unknownFieldReasons(previous.privacy, PRIVACY_FIELDS, "previous privacy contract"));
    for (const citation of [
        ...previousRoots.flatMap((root) => root.citations ?? []),
        ...previousTasks.flatMap((task) => task.citations ?? []),
        ...previousEdges.flatMap((edge) => edge.citations ?? []),
    ]) {
        if (!isStrictRfc3339(citation.occurredAt)) {
            reasons.push("previous citation timestamp must be strict RFC3339 with Z or an offset");
        }
    }
    return unique(reasons);
}
function taskMapProjectionArtifactValidationReasons(projection) {
    return unique([
        ...validatePreviousProjection(projection, projection.generatedAt),
        ...taskMapProjectionPrivacyLeakReasons(projection),
    ]);
}
function deriveCausalEnrichment(input, root, events, bodyEvents, pointers) {
    const rootEvents = root
        ? nonBodyEvidence(root.evidenceEventIds, events)
            .filter((event) => event.bodyJoinEligible === true)
        : [];
    const workSourcesByDate = new Map();
    for (const event of rootEvents) {
        if (!isRealDayKey(event.dayKey))
            continue;
        const date = event.dayKey;
        const sourceKind = pointers.get(event.pointerId)?.sourceKind;
        if (!sourceKind)
            continue;
        const sources = workSourcesByDate.get(date) ?? new Set();
        sources.add(sourceKind);
        workSourcesByDate.set(date, sources);
    }
    const requiredRootSourceKinds = new Set(rootEvents
        .map((event) => pointers.get(event.pointerId)?.sourceKind)
        .filter((sourceKind) => sourceKind !== undefined));
    const coverageSourcesByDate = new Map();
    for (const event of events.values()) {
        if (event.recordKind !== "receipt"
            || event.activity !== "receipt_observed"
            || event.corpusCoverage !== "complete"
            || !isRealDayKey(event.dayKey))
            continue;
        const sourceKind = pointers.get(event.pointerId)?.sourceKind;
        if (!sourceKind)
            continue;
        const sources = coverageSourcesByDate.get(event.dayKey) ?? new Set();
        sources.add(sourceKind);
        coverageSourcesByDate.set(event.dayKey, sources);
    }
    const hasComparableCoverage = (date) => {
        if (requiredRootSourceKinds.size === 0)
            return false;
        const covered = coverageSourcesByDate.get(date);
        if (!covered
            || covered.size < exports.TASKMAP_ALGORITHM_POLICY.causal.minCorpusSourcesPerDay)
            return false;
        return [...requiredRootSourceKinds].every((sourceKind) => covered.has(sourceKind));
    };
    const targetDates = unique(bodyEvents
        .filter((event) => (event.bodyAxis === input.bodyAxis
        && event.bodyCategory === input.bodyCategory))
        .map((event) => event.dayKey)
        .filter(isRealDayKey))
        .filter(hasComparableCoverage)
        .sort();
    const referenceDates = unique(bodyEvents
        .filter((event) => (event.bodyAxis === input.bodyAxis
        && event.bodyCategory === exports.TASKMAP_ALGORITHM_POLICY.causal.neutralReferenceCategory))
        .map((event) => event.dayKey)
        .filter(isRealDayKey))
        .filter(hasComparableCoverage)
        .sort();
    const targetHitDates = targetDates.filter((date) => workSourcesByDate.has(date));
    const referenceHits = referenceDates.filter((date) => workSourcesByDate.has(date)).length;
    return {
        theme: root?.title ?? "",
        targetHits: targetHitDates.length,
        targetN: targetDates.length,
        referenceRate: referenceDates.length === 0 ? 0 : referenceHits / referenceDates.length,
        referenceN: referenceDates.length,
        citedDays: targetHitDates.map((date) => ({
            date,
            backed: true,
            sources: [...(workSourcesByDate.get(date) ?? [])].sort(),
        })),
        rtmSuspected: targetHitDates.length > 0,
    };
}
function validateCausalInput(input, root, events, bodyEvents, pointers) {
    const reasons = [
        ...unknownFieldReasons(input, CAUSAL_INPUT_FIELDS, "causal input"),
        ...unknownFieldReasons(input.enrichment, ENRICHMENT_FIELDS, "causal enrichment"),
        ...safeIdReasons("causal root proposal id", input.rootProposalId),
        ...boundedTextReasons(input.enrichment.theme, ""),
    ];
    if (!["below_baseline", "above_baseline"].includes(input.bodyCategory)) {
        reasons.push("causal body category must be below_baseline or above_baseline");
    }
    if (!VALID_BODY_AXES.has(input.bodyAxis) || input.bodyAxis === "unknown") {
        reasons.push("causal body axis must be a known privacy-safe domain");
    }
    const enrichment = input.enrichment;
    if (enrichment.thresholds !== undefined) {
        reasons.push(...unknownFieldReasons(enrichment.thresholds, THRESHOLD_FIELDS, "causal thresholds"));
        reasons.push("causal thresholds are fixed by the versioned gate");
    }
    const derived = deriveCausalEnrichment(input, root, events, bodyEvents, pointers);
    if (!Number.isInteger(enrichment.targetHits) || enrichment.targetHits < 0) {
        reasons.push("causal targetHits must be a non-negative integer");
    }
    if (!Number.isInteger(enrichment.targetN) || enrichment.targetN <= 0) {
        reasons.push("causal targetN must be a positive integer");
    }
    if (enrichment.targetHits > enrichment.targetN) {
        reasons.push("causal targetHits cannot exceed targetN");
    }
    if (!Number.isFinite(enrichment.referenceRate) || enrichment.referenceRate < 0 || enrichment.referenceRate > 1) {
        reasons.push("causal referenceRate must be in [0,1]");
    }
    if (!Number.isInteger(enrichment.referenceN) || enrichment.referenceN < 0) {
        reasons.push("causal referenceN must be a non-negative integer");
    }
    if (typeof enrichment.rtmSuspected !== "boolean") {
        reasons.push("causal rtmSuspected must be boolean");
    }
    if (!Array.isArray(enrichment.citedDays)) {
        reasons.push("causal citedDays must be an array");
    }
    else {
        if (enrichment.citedDays.length !== enrichment.targetHits) {
            reasons.push("causal citedDays must match targetHits");
        }
        const dates = new Set();
        for (const day of enrichment.citedDays) {
            reasons.push(...unknownFieldReasons(day, CITED_DAY_FIELDS, "causal cited day"));
            if (typeof day.date !== "string"
                || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
                || new Date(`${day.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== day.date) {
                reasons.push("causal cited day must be a real YYYY-MM-DD date");
            }
            if (dates.has(day.date))
                reasons.push("causal cited days must be unique");
            dates.add(day.date);
            if (typeof day.backed !== "boolean")
                reasons.push("causal cited day backed must be boolean");
            if (!Array.isArray(day.sources) || day.sources.length === 0) {
                reasons.push("causal cited day must have at least one source");
            }
            else {
                if (new Set(day.sources).size !== day.sources.length) {
                    reasons.push("causal cited day sources must be unique");
                }
                for (const source of day.sources) {
                    reasons.push(...safeIdReasons("causal cited day source", source, SAFE_BRAIN_LABEL));
                }
            }
        }
    }
    if (enrichment.targetHits !== derived.targetHits) {
        reasons.push("causal targetHits does not match Task Map input");
    }
    if (enrichment.targetN !== derived.targetN) {
        reasons.push("causal targetN does not match Task Map input");
    }
    if (enrichment.referenceN !== derived.referenceN) {
        reasons.push("causal referenceN does not match neutral baseline input");
    }
    if (!Number.isFinite(enrichment.referenceRate)
        || Math.abs(enrichment.referenceRate - derived.referenceRate) > Number.EPSILON) {
        reasons.push("causal referenceRate does not match neutral baseline input");
    }
    if (enrichment.rtmSuspected !== derived.rtmSuspected) {
        reasons.push("causal rtmSuspected does not match derived target-day selection");
    }
    if (enrichment.theme !== derived.theme) {
        reasons.push("causal theme must match the accepted root title");
    }
    if (Array.isArray(enrichment.citedDays)) {
        const supplied = enrichment.citedDays.map((day) => ({
            date: day.date,
            backed: day.backed,
            sources: Array.isArray(day.sources) ? unique(day.sources).sort() : [],
        })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        if (stableJson(supplied) !== stableJson(derived.citedDays)) {
            reasons.push("causal citedDays and sources do not match Task Map input");
        }
    }
    return { reasons: unique(reasons), derived };
}
function buildTaskMapProjection(input, brain, options) {
    if (!VALID_ARMS.has(options.arm)) {
        throw new Error(`Unsupported Task Map experiment arm: ${String(options.arm)}`);
    }
    const requestedGeneratedAt = options.now ?? input.generatedAt;
    const runTimestampValid = isStrictRfc3339(requestedGeneratedAt);
    const generatedAt = runTimestampValid
        ? requestedGeneratedAt
        : "1970-01-01T00:00:00.000Z";
    const nowMs = Date.parse(generatedAt);
    const inputDigest = taskMapInputDigest(input);
    const semantic = effectiveBrain(input, brain, options.arm);
    const pointers = pointerMap(input);
    const events = eventMap(input);
    const semanticEventIds = new Set(taskMapSemanticInput(input).events.map((event) => event.id));
    const rejections = validateInput(input);
    const optionReasons = unknownFieldReasons(options, OPTIONS_FIELDS, "harness options");
    if (optionReasons.length > 0) {
        rejections.push({
            proposalId: "options-schema",
            kind: "input",
            reasons: optionReasons,
        });
    }
    if (!runTimestampValid) {
        rejections.push({
            proposalId: "run-now",
            kind: "input",
            reasons: ["run timestamp must be strict RFC3339 with Z or an offset"],
        });
    }
    else if (isStrictRfc3339(input.generatedAt)
        && Date.parse(generatedAt) < Date.parse(input.generatedAt)) {
        rejections.push({
            proposalId: "run-now",
            kind: "input",
            reasons: ["run timestamp must not be before input generatedAt"],
        });
    }
    const invalidInputIds = new Set(rejections.filter((item) => item.kind === "input").map((item) => item.proposalId));
    const latestAuthoritative = latestAuthoritativeEvents(input);
    const fatalInput = [
        "input-contract",
        "input-generated-at",
        "input-schema",
        "options-schema",
        "run-now",
    ].some((id) => invalidInputIds.has(id));
    const brainReasons = options.arm === "E0"
        ? []
        : (semantic
            ? validateBrain(semantic, taskMapSemanticInputDigest(input), input.generatedAt, generatedAt)
            : ["semantic brain is required for E1-E4"]);
    if (brainReasons.length > 0) {
        rejections.push({ proposalId: "brain", kind: "input", reasons: brainReasons });
    }
    const usesPrevious = ["E3", "E4"].includes(options.arm);
    const previousReasons = usesPrevious
        ? validatePreviousProjection(options.previousProjection, generatedAt)
        : [];
    if (previousReasons.length > 0) {
        rejections.push({
            proposalId: "previous-projection",
            kind: "input",
            reasons: previousReasons,
        });
    }
    const canAcceptSemantic = Boolean(semantic && brainReasons.length === 0 && !fatalInput);
    const proposalIdCounts = new Map();
    const rootMembershipCounts = new Map();
    const edgeIdentityCounts = new Map();
    if (canAcceptSemantic && semantic) {
        for (const proposal of [...semantic.roots, ...semantic.tasks, ...semantic.edges]) {
            proposalIdCounts.set(proposal.proposalId, (proposalIdCounts.get(proposal.proposalId) ?? 0) + 1);
        }
        for (const root of semantic.roots) {
            const signature = Array.isArray(root.memberObjectRefs)
                ? digest(unique(root.memberObjectRefs).sort())
                : `invalid:${root.proposalId}`;
            rootMembershipCounts.set(signature, (rootMembershipCounts.get(signature) ?? 0) + 1);
        }
        for (const edge of semantic.edges) {
            const identity = `${edge.fromProposalId}\u0000${edge.relation}\u0000${edge.toProposalId}`;
            edgeIdentityCounts.set(identity, (edgeIdentityCounts.get(identity) ?? 0) + 1);
        }
    }
    const acceptedRoots = [];
    if (canAcceptSemantic && semantic) {
        for (const root of semantic.roots) {
            const reasons = validateRoot(root, events, semanticEventIds);
            const membershipSignature = Array.isArray(root.memberObjectRefs)
                ? digest(unique(root.memberObjectRefs).sort())
                : `invalid:${root.proposalId}`;
            if ((proposalIdCounts.get(root.proposalId) ?? 0) > 1) {
                reasons.push("duplicate or cross-kind proposal id");
            }
            if ((rootMembershipCounts.get(membershipSignature) ?? 0) > 1) {
                reasons.push("duplicate root membership");
            }
            if (root.evidenceEventIds.some((id) => invalidInputIds.has(id)))
                reasons.push("root cites rejected input");
            if (reasons.length) {
                rejections.push({ proposalId: root.proposalId, kind: "root", reasons: unique(reasons) });
            }
            else {
                acceptedRoots.push(root);
            }
        }
    }
    const acceptedRootsByProposal = new Map(acceptedRoots.map((root) => [root.proposalId, root]));
    const acceptedTasksBeforeIdentity = [];
    if (canAcceptSemantic && semantic) {
        for (const task of semantic.tasks) {
            const reasons = validateTask(task, acceptedRootsByProposal, events, latestAuthoritative, semanticEventIds, pointers);
            if ((proposalIdCounts.get(task.proposalId) ?? 0) > 1) {
                reasons.push("duplicate or cross-kind proposal id");
            }
            if (task.evidenceEventIds.some((id) => invalidInputIds.has(id)))
                reasons.push("task cites rejected input");
            if (reasons.length) {
                rejections.push({ proposalId: task.proposalId, kind: "task", reasons: unique(reasons) });
            }
            else {
                acceptedTasksBeforeIdentity.push(task);
            }
        }
    }
    const taskIdByProposal = new Map();
    const taskIdentityCounts = new Map();
    for (const task of acceptedTasksBeforeIdentity) {
        const identity = taskIdentity(task, events, pointers, acceptedRootsByProposal.get(task.rootProposalId));
        taskIdentityCounts.set(identity, (taskIdentityCounts.get(identity) ?? 0) + 1);
    }
    const acceptedTasks = [];
    for (const task of acceptedTasksBeforeIdentity) {
        const identity = taskIdentity(task, events, pointers, acceptedRootsByProposal.get(task.rootProposalId));
        if ((taskIdentityCounts.get(identity) ?? 0) > 1) {
            rejections.push({
                proposalId: task.proposalId,
                kind: "task",
                reasons: ["duplicate task identity"],
            });
            continue;
        }
        taskIdByProposal.set(task.proposalId, identity);
        acceptedTasks.push(task);
    }
    if (canAcceptSemantic
        && semantic
        && options.arm !== "E0"
        && semantic.roots.length + semantic.tasks.length > 0
        && acceptedRoots.length === 0
        && acceptedTasks.length === 0) {
        rejections.push({
            proposalId: "semantic-empty-after-validation",
            kind: "input",
            reasons: ["semantic proposals were present but none survived validation"],
        });
    }
    if (canAcceptSemantic && options.arm !== "E0") {
        for (const authoritative of latestAuthoritative.values()) {
            const state = sourceOpenState(authoritative);
            if (state === "completed" || state === "superseded")
                continue;
            const coverage = acceptedTasks.filter((task) => (task.authoritativeTaskEventId === authoritative.id)).length;
            if (coverage !== 1) {
                rejections.push({
                    proposalId: stableId("authoritative-coverage", authoritative.id),
                    kind: "input",
                    reasons: ["latest authoritative task must have exactly one accepted semantic task"],
                });
            }
        }
    }
    const acceptedRootProposalIds = new Set(acceptedRoots.map((root) => root.proposalId));
    const acceptedProposals = new Map([
        ...acceptedRoots.map((root) => [
            root.proposalId,
            { evidenceEventIds: root.evidenceEventIds, kind: "root" },
        ]),
        ...acceptedTasks.map((task) => [
            task.proposalId,
            { evidenceEventIds: task.evidenceEventIds, kind: "task", task },
        ]),
    ]);
    let acceptedEdges = [];
    if (canAcceptSemantic && semantic && ["E2", "E3", "E4"].includes(options.arm)) {
        for (const edge of semantic.edges) {
            const reasons = validateEdge(edge, acceptedProposals, events, semanticEventIds);
            if ((proposalIdCounts.get(edge.proposalId) ?? 0) > 1) {
                reasons.push("duplicate or cross-kind proposal id");
            }
            const identity = `${edge.fromProposalId}\u0000${edge.relation}\u0000${edge.toProposalId}`;
            if ((edgeIdentityCounts.get(identity) ?? 0) > 1) {
                reasons.push("duplicate edge relation");
            }
            if (reasons.length) {
                rejections.push({ proposalId: edge.proposalId, kind: "edge", reasons: unique(reasons) });
            }
            else {
                acceptedEdges.push(edge);
            }
        }
    }
    const cyclicEdgeIds = cyclicExecutionEdgeIds(acceptedEdges);
    if (cyclicEdgeIds.size > 0) {
        for (const edge of acceptedEdges) {
            if (!cyclicEdgeIds.has(edge.proposalId))
                continue;
            rejections.push({
                proposalId: edge.proposalId,
                kind: "edge",
                reasons: ["execution-order edge participates in a directed cycle"],
            });
        }
        acceptedEdges = acceptedEdges.filter((edge) => !cyclicEdgeIds.has(edge.proposalId));
    }
    const rootIdByProposal = persistentRootIds(acceptedRoots, ["E3", "E4"].includes(options.arm) && previousReasons.length === 0
        ? options.previousProjection
        : undefined, events, pointers);
    reusePreviousDiscoveredTaskIds(acceptedTasks, taskIdByProposal, rootIdByProposal, ["E3", "E4"].includes(options.arm) && previousReasons.length === 0
        ? options.previousProjection
        : undefined, events, pointers);
    const allBodyEvents = options.arm === "E4"
        ? validResolvedEvents(input).filter((event) => event.recordKind === "body_context")
        : [];
    const bodyEvents = options.arm === "E4"
        ? allBodyEvents.filter((event) => (exports.TASKMAP_ALGORITHM_POLICY.actionableBodyCategories.includes(event.bodyCategory)
            && nowMs - Date.parse(event.occurredAt) >= 0
            && nowMs - Date.parse(event.occurredAt) <= exports.TASKMAP_ALGORITHM_POLICY.bodyFreshnessWindowMs))
        : [];
    const causalByRoot = new Map();
    if (options.arm === "E4") {
        for (const item of options.causalInputs ?? []) {
            const validation = validateCausalInput(item, acceptedRootsByProposal.get(item.rootProposalId), events, allBodyEvents, pointers);
            const reasons = [...validation.reasons];
            if (!acceptedRootProposalIds.has(item.rootProposalId))
                reasons.push("causal root is not accepted");
            if (causalByRoot.has(item.rootProposalId))
                reasons.push("duplicate causal root input");
            if (reasons.length) {
                rejections.push({
                    proposalId: `causal:${item.rootProposalId}`,
                    kind: "input",
                    reasons: unique(reasons),
                });
            }
            else {
                causalByRoot.set(item.rootProposalId, {
                    ...item,
                    enrichment: validation.derived,
                });
            }
        }
    }
    const dependencyByTask = new Map();
    for (const edge of acceptedEdges) {
        if (edge.relation === "blocks") {
            dependencyByTask.set(edge.fromProposalId, (dependencyByTask.get(edge.fromProposalId) ?? 0) + 1);
        }
        else if (edge.relation === "depends_on") {
            dependencyByTask.set(edge.toProposalId, (dependencyByTask.get(edge.toProposalId) ?? 0) + 1);
        }
    }
    const taskRows = acceptedTasks.flatMap((task) => {
        const rootId = rootIdByProposal.get(task.rootProposalId);
        const id = taskIdByProposal.get(task.proposalId);
        if (!rootId || !id)
            return [];
        const evidence = nonBodyEvidence(task.evidenceEventIds, events);
        const authoritativeEvent = task.authoritativeTaskEventId
            ? events.get(task.authoritativeTaskEventId)
            : undefined;
        const taskHome = authoritativeEvent ? pointers.get(authoritativeEvent.pointerId) : undefined;
        const originPointerIds = unique(evidence.map((event) => event.pointerId)).sort();
        const eligibleReturnOrigins = originPointerIds
            .map((pointerId) => pointers.get(pointerId))
            .filter((pointer) => (pointer !== undefined && hasReturnCapability(pointer)));
        const personalForkPointer = originPointerIds
            .map((pointerId) => pointers.get(pointerId))
            .find((pointer) => pointer?.sourceKind === "manual" && pointer.syncMode === "personal_fork");
        const returnRoute = taskHome
            ? (hasSourceOwnedRoute(taskHome)
                ? { state: "source_owned", pointerId: taskHome.id, requiresApproval: true }
                : { state: "user_destination_required", requiresApproval: true })
            : task.proposedReturnPointerId
                ? { state: "source_return", pointerId: task.proposedReturnPointerId, requiresApproval: true }
                : personalForkPointer && originPointerIds.length === 1
                    ? { state: "personal_fork", pointerId: personalForkPointer.id, requiresApproval: true }
                    : eligibleReturnOrigins.length === 1
                        ? {
                            state: "source_return",
                            pointerId: eligibleReturnOrigins[0].id,
                            requiresApproval: true,
                        }
                        : { state: "user_destination_required", requiresApproval: true };
        const effectiveOpenState = sourceOpenState(authoritativeEvent) ?? task.openState;
        const causalInput = causalByRoot.get(task.rootProposalId);
        const joinedBodyEvents = causalInput
            ? bodyEvents.filter((event) => (event.bodyAxis === causalInput.bodyAxis
                && event.bodyCategory === causalInput.bodyCategory))
            : bodyEvents;
        const joinedBodyCount = bodyContextCount(evidence, joinedBodyEvents);
        const rootCausal = joinedBodyCount > 0
            ? causalGrade(causalInput)
            : { grade: "C0_NO_DATA" };
        const score = scoreTask({ ...task, openState: effectiveOpenState }, evidence, clamp01((dependencyByTask.get(task.proposalId) ?? 0) / exports.TASKMAP_ALGORITHM_POLICY.dependencyCountCap), joinedBodyCount > 0 ? bodyBonusFor(rootCausal.grade) : 0, nowMs, pointers);
        const reviewState = authoritativeEvent
            ? (effectiveOpenState === "completed"
                ? "source_complete"
                : (effectiveOpenState === "superseded" ? "superseded" : "accepted"))
            : (task.openState === "superseded" ? "superseded" : "proposed");
        return [{
                id,
                rootId,
                title: task.title,
                summary: task.summary,
                reviewState,
                openState: effectiveOpenState,
                authority: taskHome?.authority ?? "none",
                taskHomePointerId: taskHome?.id,
                originPointerIds,
                returnRoute,
                sourceStatus: authoritativeEvent?.sourceStatus,
                citations: citations(task.evidenceEventIds, events, pointers),
                score,
                whyNow: whyNow(score, rootCausal.grade),
                discoveredBy: unique(evidence.map((event) => pointers.get(event.pointerId)?.sourceKind).filter(Boolean)),
                bodyContextCount: joinedBodyCount,
            }];
    }).sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id));
    const roots = acceptedRoots.map((root) => {
        const id = rootIdByProposal.get(root.proposalId);
        const rootTasks = taskRows.filter((task) => task.rootId === id);
        const evidence = nonBodyEvidence(root.evidenceEventIds, events);
        const causalInput = causalByRoot.get(root.proposalId);
        const joinedBodyEvents = causalInput
            ? bodyEvents.filter((event) => (event.bodyAxis === causalInput.bodyAxis
                && event.bodyCategory === causalInput.bodyCategory))
            : bodyEvents;
        const joinedBodyCount = bodyContextCount(evidence, joinedBodyEvents);
        const causal = joinedBodyCount > 0
            ? causalGrade(causalInput)
            : { grade: "C0_NO_DATA" };
        const rootTaskProposalIds = new Set(acceptedTasks
            .filter((task) => task.rootProposalId === root.proposalId)
            .map((task) => task.proposalId));
        const dependencyEdgeCount = acceptedEdges.filter((edge) => (["depends_on", "blocks"].includes(edge.relation)
            && (rootTaskProposalIds.has(edge.fromProposalId)
                || rootTaskProposalIds.has(edge.toProposalId)))).length;
        const scoreBreakdown = scoreRoot(rootTasks, evidence, dependencyEdgeCount, joinedBodyCount, causal.grade, pointers);
        return {
            id,
            title: root.title,
            summary: root.summary,
            taskIds: rootTasks.map((task) => task.id),
            memberObjectRefs: unique(root.memberObjectRefs).sort(),
            citations: citations(root.evidenceEventIds, events, pointers),
            causalGrade: causal.grade,
            causalGate: causal.result,
            bodyContextCount: joinedBodyCount,
            scoreBreakdown,
            score: scoreBreakdown.total,
            whyNow: rootWhyNow(scoreBreakdown, causal.grade),
        };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const edges = acceptedEdges.flatMap((edge) => {
        const from = rootIdByProposal.get(edge.fromProposalId) ?? taskIdByProposal.get(edge.fromProposalId);
        const to = rootIdByProposal.get(edge.toProposalId) ?? taskIdByProposal.get(edge.toProposalId);
        if (!from || !to)
            return [];
        return [{
                id: stableId("tme", `${from}:${edge.relation}:${to}`),
                from,
                to,
                relation: edge.relation,
                citations: citations(edge.evidenceEventIds, events, pointers),
            }];
    });
    const replayIdentity = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: exports.TASKMAP_ALGORITHM_POLICY_DIGEST,
        arm: options.arm,
        inputDigest,
        semantic,
        generatedAt,
        runTimestampInputDigest: digest(requestedGeneratedAt),
        previousProjection: ["E3", "E4"].includes(options.arm) ? options.previousProjection ?? null : null,
        causalInputs: options.arm === "E4" ? options.causalInputs ?? [] : [],
    };
    const safeRejections = rejections.map((rejection) => ({
        ...rejection,
        proposalId: SAFE_PUBLIC_ID.test(rejection.proposalId) && textLeakReasons(rejection.proposalId).length === 0
            ? rejection.proposalId
            : stableId("tmrej", rejection.proposalId),
    }));
    const referencedPointerIds = new Set();
    for (const root of roots) {
        for (const citation of root.citations)
            referencedPointerIds.add(citation.pointerId);
    }
    for (const task of taskRows) {
        if (task.taskHomePointerId)
            referencedPointerIds.add(task.taskHomePointerId);
        for (const citation of task.citations)
            referencedPointerIds.add(citation.pointerId);
    }
    for (const edge of edges) {
        for (const citation of edge.citations)
            referencedPointerIds.add(citation.pointerId);
    }
    const pointerIdSet = new Set(input.pointers.map((pointer) => pointer.id));
    const invalidPointerIds = new Set(rejections
        .filter((item) => item.kind === "input" && pointerIdSet.has(item.proposalId))
        .map((item) => item.proposalId));
    const sources = input.pointers
        .filter((pointer) => referencedPointerIds.has(pointer.id) && !invalidPointerIds.has(pointer.id))
        .map((pointer) => ({
        id: pointer.id,
        sourceKind: pointer.sourceKind,
        canonicalUrl: pointer.canonicalUrl,
        sourceVersion: pointer.sourceVersion,
        authority: pointer.authority,
        syncMode: pointer.syncMode,
        capabilities: [...pointer.capabilities],
    }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const projection = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: exports.TASKMAP_ALGORITHM_POLICY_DIGEST,
        runStatus: rejections.some((rejection) => rejection.kind === "input")
            ? "rejected"
            : "accepted",
        arm: options.arm,
        runId: stableId("tmrun", stableJson(replayIdentity)),
        generatedAt,
        inputDigest,
        brain: canAcceptSemantic && semantic && semantic.provider !== "deterministic-explicit-baseline" ? {
            provider: semantic.provider,
            model: semantic.model,
            promptHash: semantic.promptHash,
            outputDigest: digest(semantic),
        } : null,
        sources,
        roots,
        tasks: taskRows,
        edges,
        rejections: safeRejections,
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    const projectedLeaks = taskMapProjectionPrivacyLeakReasons(projection);
    if (projectedLeaks.length === 0)
        return projection;
    return {
        ...projection,
        runStatus: "rejected",
        brain: null,
        sources: [],
        roots: [],
        tasks: [],
        edges: [],
        rejections: [
            ...projection.rejections,
            {
                proposalId: "projection-privacy-firewall",
                kind: "input",
                reasons: unique(projectedLeaks),
            },
        ],
    };
}
function taskMapMembershipSignature(projection) {
    const rows = projection.roots.map((root) => ({
        title: root.title,
        members: [...root.memberObjectRefs].sort(),
        tasks: projection.tasks
            .filter((task) => task.rootId === root.id)
            .map((task) => task.title)
            .sort(),
    }));
    return digest(rows.sort((a, b) => stableJson(a).localeCompare(stableJson(b))));
}
function runTaskMapAblation(input, brain, options) {
    const arms = ["E0", "E1", "E2", "E3", "E4"]
        .map((arm) => buildTaskMapProjection(input, brain, { ...options, arm }));
    const bodyMasked = {
        ...input,
        events: input.events.filter((event) => event.recordKind !== "body_context"),
    };
    const masked = buildTaskMapProjection(bodyMasked, brain, { ...options, arm: "E4", causalInputs: [] });
    const bodyCategories = input.events
        .filter((event) => event.recordKind === "body_context")
        .map((event) => event.bodyCategory)
        .reverse();
    let bodyCategoryIndex = 0;
    const bodyShuffled = {
        ...input,
        events: input.events.map((event) => event.recordKind === "body_context" ? {
            ...event,
            bodyCategory: bodyCategories[bodyCategoryIndex++] ?? event.bodyCategory,
        } : event),
    };
    const shuffled = buildTaskMapProjection(bodyShuffled, brain, { ...options, arm: "E4", causalInputs: [] });
    const reference = arms.find((projection) => projection.arm === "E4");
    const semanticAccepted = arms.find((projection) => projection.arm === "E1")?.runStatus === "accepted";
    const rejectionSummary = (projection) => (["input", "root", "task", "edge"].flatMap((kind) => {
        const count = projection.rejections.filter((item) => item.kind === kind).length;
        return count > 0 ? [{ kind, count }] : [];
    }));
    return {
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: exports.TASKMAP_ALGORITHM_POLICY_DIGEST,
        generatedAt: reference.generatedAt,
        inputDigest: taskMapInputDigest(input),
        semanticInputDigest: taskMapSemanticInputDigest(input),
        brain: {
            provider: semanticAccepted ? brain.provider : "rejected",
            model: semanticAccepted ? brain.model : "rejected",
            promptHash: semanticAccepted ? brain.promptHash : digest(brain.promptHash),
            inputDigest: semanticAccepted ? brain.inputDigest : digest(brain.inputDigest),
            generatedAt: semanticAccepted ? brain.generatedAt : reference.generatedAt,
            outputDigest: digest(brain),
        },
        arms: arms.map((projection) => ({
            arm: projection.arm,
            runId: projection.runId,
            runStatus: projection.runStatus,
            rejectionCount: projection.rejections.length,
            rejectionSummary: rejectionSummary(projection),
            roots: projection.roots.length,
            tasks: projection.tasks.length,
            acceptedTasks: projection.tasks.filter((task) => task.reviewState === "accepted").length,
            proposedTasks: projection.tasks.filter((task) => task.reviewState === "proposed").length,
            bodyBonusTotal: round(projection.tasks.reduce((sum, task) => sum + task.score.bodyBonus, 0)),
            membershipSignature: taskMapMembershipSignature(projection),
        })),
        controls: {
            bodyMaskRunId: masked.runId,
            bodyShuffleRunId: shuffled.runId,
            bodyMaskMembershipStable: reference.runStatus === "accepted" && masked.runStatus === "accepted"
                ? taskMapMembershipSignature(reference) === taskMapMembershipSignature(masked)
                : null,
            bodyShuffleMembershipStable: reference.runStatus === "accepted" && shuffled.runStatus === "accepted"
                ? taskMapMembershipSignature(reference) === taskMapMembershipSignature(shuffled)
                : null,
        },
    };
}
