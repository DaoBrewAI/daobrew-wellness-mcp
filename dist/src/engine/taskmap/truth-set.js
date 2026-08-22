"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_OWNER_TRUTH_SET_VERSION = void 0;
exports.taskMapTruthTextContainsSecret = taskMapTruthTextContainsSecret;
exports.buildTaskMapTruthSet = buildTaskMapTruthSet;
exports.assertTaskMapTruthSet = assertTaskMapTruthSet;
exports.taskMapTruthSetCanonicalJson = taskMapTruthSetCanonicalJson;
exports.taskMapTruthSetMembershipSignature = taskMapTruthSetMembershipSignature;
exports.buildTaskMapTruthProjectionTarget = buildTaskMapTruthProjectionTarget;
exports.compareTaskMapTruthSetProjectionParity = compareTaskMapTruthSetProjectionParity;
const source_contracts_js_1 = require("./source-contracts.js");
const types_js_1 = require("./types.js");
Object.defineProperty(exports, "TASKMAP_OWNER_TRUTH_SET_VERSION", { enumerable: true, get: function () { return types_js_1.TASKMAP_OWNER_TRUTH_SET_VERSION; } });
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CASE_KEY = /^[a-z][a-z0-9_]{2,95}$/;
const SAFE_REFERENCE = /^(?:synthetic:[a-z0-9][a-z0-9._:-]{1,191}|digest:[a-f0-9]{64})$/;
const PRIVATE_TEXT = /(?:@|(?:^|[^A-Za-z0-9_])[a-z][a-z0-9+.-]*:\/\/)/i;
const COMMON_SECRET_TEXT = /(?:\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,255}\b|\bxox[baprs]-[A-Za-z0-9-]{10,255}\b|\bAIza[A-Za-z0-9_-]{20,64}\b|\bsk_live_[A-Za-z0-9]{16,255}\b|\bnpm_[A-Za-z0-9]{20,255}\b|\beyJ[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\.[A-Za-z0-9_-]{5,255}\b|bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|BEGIN [A-Z0-9 ]*PRIVATE KEY)/i;
const LOCAL_PATH_TEXT = /(?:^|[^A-Za-z0-9_])(?:~[\\/]|(?:\.\.?[\\/])+|\/|[A-Za-z]:[\\/]|\\\\)[^\s"'`()\[\]{}]+/i;
const PRIVACY = {
    sourceBodiesStored: false,
    emailBodiesStored: false,
    participantDetailsStored: false,
    rawBiometricsStored: false,
    fullAgentSessionBodiesStored: false,
    localPathsStored: false,
    secretsStored: false,
};
function taskMapTruthTextContainsSecret(value) {
    return COMMON_SECRET_TEXT.test(value);
}
const DRAFT_KEYS = new Set([
    "contractVersion",
    "splitPolicyVersion",
    "splitBoundaries",
    "asOf",
    "reviewedAt",
    "labels",
    "expectedSplitMetrics",
    "expectedOverallMetrics",
]);
const FINAL_KEYS = new Set([
    "contractVersion",
    "truthSetId",
    "truthSetDigest",
    "labelPolicyVersion",
    "splitPolicyVersion",
    "reviewBatchPolicyVersion",
    "reviewBatchDigest",
    "sourceContractVersion",
    "splitBoundaries",
    "asOf",
    "reviewedAt",
    "labels",
    "splitMetrics",
    "overallMetrics",
    "privacy",
]);
const LABEL_DRAFT_KEYS = new Set([
    "caseKey",
    "subject",
    "timeSplit",
    "sourceKind",
    "sourceRecordRef",
    "canonicalEventRef",
    "canonicalWorkRef",
    "discoveryChannel",
    "sessionRole",
    "workClass",
    "evidenceRole",
    "adjudication",
    "lifecycle",
    "expectedProjection",
    "expectedDelta",
    "recurrenceContribution",
    "membershipContribution",
    "reasonCodes",
    "labelAuthority",
]);
const LABEL_KEYS = new Set(["labelId", ...LABEL_DRAFT_KEYS]);
const EXPECTED_PROJECTION_KEYS = new Set(["strategy", "taskMap"]);
const SPLIT_METRICS_KEYS = new Set(["timeSplit", "metrics"]);
const SPLIT_BOUNDARY_KEYS = new Set([
    "timeSplit",
    "startAt",
    "endAt",
    "semantics",
]);
const METRICS_KEYS = new Set([
    "labelCount",
    "canonicalMeetingCount",
    "newRootCount",
    "newAcceptedWorkCount",
    "updatedExistingWorkCount",
    "candidateReviewCount",
    "automaticAcceptedFromMeetingOrSessionCount",
    "recurrenceContribution",
    "membershipContribution",
    "mergeIntoExistingCount",
    "duplicateExclusionCount",
    "pollutionRejectionCount",
    "falseReopenCount",
]);
const PRIVACY_KEYS = new Set(Object.keys(PRIVACY));
const TIME_SPLITS = ["T0", "T1", "T2", "T3", "T4"];
const SOURCE_KINDS = new Set([
    "linear",
    "jira",
    "github",
    "slack",
    "google_chat",
    "gmail",
    "google_calendar",
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
const WORK_CLASSES = new Set([
    "explicit_work",
    "inferred_candidate",
    "context_only",
    "non_work",
]);
const EVIDENCE_ROLES = new Set([
    "primary_authority",
    "corroborating_variant",
    "identity_anchor",
    "discovery_pointer",
    "delegated_execution",
]);
const ADJUDICATIONS = new Set([
    "accepted_work",
    "candidate_review",
    "context_only",
    "merge_into_existing",
    "exclude_duplicate",
    "reject_pollution",
]);
const LIFECYCLES = new Set([
    "open",
    "blocked",
    "awaiting_review",
    "completed",
    "superseded",
    "unknown",
]);
const EXPECTED_DELTAS = new Set([
    "none",
    "new_root",
    "new_accepted_work",
    "update_existing_work",
    "new_candidate",
    "merge_existing_work",
]);
const LABEL_AUTHORITIES = new Set([
    "source_authority",
    "reviewed_truth",
    "deterministic_policy",
]);
const SESSION_ROLES = new Set([
    "root",
    "subagent",
    "wrapper",
]);
const DISCOVERY_CHANNELS = new Set([
    "gmail_direct",
    "gmail_forwarded",
]);
const STRATEGY_PROJECTIONS = new Set([
    "shared_accepted_work",
    "strategy_durable_context",
    "excluded",
]);
const TASK_MAP_PROJECTIONS = new Set([
    "shared_accepted_work",
    "taskmap_candidate_review",
    "taskmap_operational_detail",
    "excluded",
]);
const REASON_CODES = new Set([
    "source_native_open_work",
    "source_native_blocked_work",
    "strategy_durable_context",
    "provider_corroborates_existing",
    "gmail_discovery_semantically_neutral",
    "no_bounded_calendar_anchor",
    "calendar_identity_anchor",
    "structured_meeting_primary",
    "provider_variant_deduped",
    "meeting_recurrence_counted_once",
    "existing_work_match",
    "owner_missing_candidate_review",
    "strategy_reviewed_existing_work_merge",
    "strategy_blocker_candidate_review",
    "asr_pollution",
    "numeric_asr_pollution",
    "session_continues_existing_root",
    "delegated_subagent_not_independent_work",
    "wrapper_not_work",
    "source_completion_terminal",
    "superseded_terminal",
    "body_context_post_membership_only",
    "unlinked_body_coverage",
    "existing_work_updated",
    "strategy_source_authority",
    "no_automatic_task_acceptance",
]);
const MEETING_SOURCE_KINDS = new Set([
    "gmail",
    "google_calendar",
    "gemini_meet",
    "granola",
]);
const SESSION_SOURCE_KINDS = new Set([
    "codex_session",
    "claude_session",
    "cursor_session",
]);
const AUTOMATIC_EVIDENCE_SOURCE_KINDS = new Set([
    ...MEETING_SOURCE_KINDS,
    ...SESSION_SOURCE_KINDS,
]);
const ACCEPTED_WORK_AUTHORITY_SOURCE_KINDS = new Set([
    "linear",
    "jira",
    "github",
    "google_tasks",
    "strategy",
    "manual",
]);
const POLLUTION_REASON_CODES = new Set([
    "asr_pollution",
    "numeric_asr_pollution",
    "wrapper_not_work",
]);
function assertPlainObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
}
function assertOnlyKeys(value, allowed, label) {
    assertPlainObject(value, label);
    const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
    if (unknown.length > 0) {
        throw new Error(`${label} contains forbidden or unknown fields: ${unknown.join(", ")}`);
    }
}
function assertTimestamp(value, label) {
    const match = STRICT_RFC3339.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) {
        throw new Error(`${label} must be strict RFC3339`);
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, offsetHour, offsetMinute] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (month < 1
        || month > 12
        || day < 1
        || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
        || Number(hourText) > 23
        || Number(minuteText) > 59
        || Number(secondText) > 59
        || (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) {
        throw new Error(`${label} must be a real RFC3339 instant`);
    }
}
function assertDigest(value, label) {
    if (!SHA256.test(value))
        throw new Error(`${label} must be a lowercase SHA-256 digest`);
}
function assertRequiredReference(value, label) {
    if (typeof value !== "string" || !SAFE_REFERENCE.test(value)) {
        throw new Error(`${label} is required and must be a synthetic or digest-only reference`);
    }
}
function assertOptionalReference(value, label) {
    if (value !== undefined && (typeof value !== "string" || !SAFE_REFERENCE.test(value))) {
        throw new Error(`${label} must be a synthetic or digest-only reference`);
    }
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
function stableId(prefix, value) {
    return `${prefix}_${(0, source_contracts_js_1.taskMapContractDigest)(value).slice(0, 16)}`;
}
function timeSplitIndex(split) {
    return TIME_SPLITS.indexOf(split);
}
function assertProjection(projection) {
    assertOnlyKeys(projection, EXPECTED_PROJECTION_KEYS, "truth expectedProjection");
    if (!STRATEGY_PROJECTIONS.has(projection.strategy)) {
        throw new Error("truth expectedProjection has an unsupported Strategy role");
    }
    if (!TASK_MAP_PROJECTIONS.has(projection.taskMap)) {
        throw new Error("truth expectedProjection has an unsupported Task Map role");
    }
    if ((projection.strategy === "shared_accepted_work")
        !== (projection.taskMap === "shared_accepted_work")) {
        throw new Error("shared accepted work must remain shared across Strategy and Task Map");
    }
    return { strategy: projection.strategy, taskMap: projection.taskMap };
}
function assertLabelSemantics(label) {
    const projection = label.expectedProjection;
    const terminal = label.lifecycle === "completed" || label.lifecycle === "superseded";
    const noProjection = projection.strategy === "excluded" && projection.taskMap === "excluded";
    const sharedAcceptedProjection = projection.strategy === "shared_accepted_work"
        && projection.taskMap === "shared_accepted_work";
    if ((label.workClass === "non_work")
        !== (label.adjudication === "reject_pollution")) {
        throw new Error("non_work is exactly the reject_pollution lane");
    }
    if (MEETING_SOURCE_KINDS.has(label.sourceKind) && !label.canonicalEventRef) {
        throw new Error("meeting and discovery source rows require a canonicalEventRef");
    }
    if (sharedAcceptedProjection
        && (label.labelAuthority !== "source_authority"
            || !ACCEPTED_WORK_AUTHORITY_SOURCE_KINDS.has(label.sourceKind))) {
        throw new Error("shared_accepted_work projection requires closed-list source authority");
    }
    if (projection.strategy === "strategy_durable_context"
        && (label.sourceKind !== "strategy"
            || label.labelAuthority !== "source_authority")) {
        throw new Error("strategy_durable_context projection requires Strategy source authority");
    }
    if (projection.taskMap === "taskmap_candidate_review"
        && (label.sourceKind !== "strategy"
            || label.labelAuthority !== "source_authority"
            || label.adjudication !== "candidate_review")) {
        throw new Error("taskmap_candidate_review projection requires Strategy candidate authority");
    }
    if (projection.taskMap === "taskmap_operational_detail"
        && (label.sourceKind !== "strategy"
            || label.labelAuthority !== "source_authority"
            || label.adjudication !== "merge_into_existing"
            || !label.canonicalWorkRef
            || label.membershipContribution !== 0)) {
        throw new Error("taskmap_operational_detail projection requires authoritative Strategy detail");
    }
    if (label.adjudication === "accepted_work") {
        const expectedMembershipContribution = terminal
            ? 0
            : label.expectedDelta === "update_existing_work"
                ? 0
                : 1;
        if (label.workClass !== "explicit_work"
            || label.evidenceRole !== "primary_authority"
            || label.labelAuthority !== "source_authority"
            || !ACCEPTED_WORK_AUTHORITY_SOURCE_KINDS.has(label.sourceKind)
            || !label.canonicalWorkRef
            || projection.strategy !== "shared_accepted_work"
            || projection.taskMap !== "shared_accepted_work"
            || label.lifecycle === "unknown"
            || label.lifecycle === "awaiting_review"
            || ![
                "none",
                "new_root",
                "new_accepted_work",
                "update_existing_work",
            ].includes(label.expectedDelta)
            || label.membershipContribution !== expectedMembershipContribution) {
            throw new Error("accepted_work requires source-authoritative explicit work, a shared lifecycle projection, an accepted-work delta, and derived membership contribution");
        }
    }
    if (label.adjudication === "candidate_review") {
        if (label.workClass !== "inferred_candidate"
            || !label.canonicalWorkRef
            || label.lifecycle !== "awaiting_review"
            || projection.strategy !== "excluded"
            || projection.taskMap !== "taskmap_candidate_review"
            || label.expectedDelta !== "new_candidate"
            || label.membershipContribution !== 1) {
            throw new Error("candidate_review requires one awaiting-review Task Map candidate");
        }
    }
    if (label.adjudication === "context_only") {
        if (label.workClass !== "context_only"
            || projection.strategy === "shared_accepted_work"
            || ["shared_accepted_work", "taskmap_candidate_review"].includes(projection.taskMap)
            || label.expectedDelta !== "none"
            || label.membershipContribution !== 0) {
            throw new Error("context_only cannot become accepted or candidate work");
        }
    }
    if (label.adjudication === "merge_into_existing") {
        if (!["explicit_work", "inferred_candidate"].includes(label.workClass)
            || !label.canonicalWorkRef
            || label.expectedDelta !== "merge_existing_work"
            || label.membershipContribution !== 0
            || terminal) {
            throw new Error("merge_into_existing requires live canonical work and no new membership");
        }
    }
    if (label.adjudication === "exclude_duplicate") {
        if (!noProjection
            || label.expectedDelta !== "none"
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0) {
            throw new Error("exclude_duplicate must be projection- and contribution-neutral");
        }
    }
    if (label.adjudication === "reject_pollution") {
        if (label.workClass !== "non_work"
            || label.lifecycle !== "unknown"
            || !noProjection
            || label.expectedDelta !== "none"
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0
            || !label.reasonCodes.some((reason) => POLLUTION_REASON_CODES.has(reason))) {
            throw new Error("reject_pollution must remain non-work, pollution-reasoned, and projection-neutral");
        }
    }
    if (terminal
        && (label.expectedDelta !== "none"
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0)) {
        throw new Error("completed or superseded work cannot reopen or contribute membership");
    }
    if (label.evidenceRole === "identity_anchor") {
        if (label.sourceKind !== "google_calendar"
            || label.adjudication !== "context_only"
            || label.recurrenceContribution !== 0) {
            throw new Error("identity_anchor must be Calendar context with zero recurrence");
        }
    }
    if (label.evidenceRole === "discovery_pointer") {
        if (label.sourceKind !== "gmail"
            || !label.discoveryChannel
            || label.adjudication !== "exclude_duplicate") {
            throw new Error("discovery_pointer must be a duplicate-suppressed Gmail link");
        }
    }
    if (label.sourceKind === "gmail") {
        if (label.evidenceRole !== "discovery_pointer"
            || label.adjudication !== "exclude_duplicate"
            || !noProjection
            || label.expectedDelta !== "none"
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0) {
            throw new Error("Gmail discovery must remain semantically neutral");
        }
    }
    if (label.discoveryChannel !== undefined && label.sourceKind !== "gmail") {
        throw new Error("only Gmail truth labels may declare a discoveryChannel");
    }
    if (SESSION_SOURCE_KINDS.has(label.sourceKind)
        && label.sessionRole === undefined) {
        throw new Error("every local agent-session source requires an explicit sessionRole");
    }
    if (SESSION_SOURCE_KINDS.has(label.sourceKind) && !label.canonicalWorkRef) {
        throw new Error("every local agent-session source requires a canonicalWorkRef");
    }
    if (label.sessionRole !== undefined) {
        if (!SESSION_SOURCE_KINDS.has(label.sourceKind)) {
            throw new Error("sessionRole requires a local agent-session source");
        }
        if (label.sessionRole === "root"
            && (label.evidenceRole === "delegated_execution"
                || ["new_root", "new_accepted_work"].includes(label.expectedDelta))) {
            throw new Error("a continuing root session cannot become delegated work or a new root");
        }
        if (label.sessionRole === "subagent"
            && (label.evidenceRole !== "delegated_execution"
                || label.adjudication !== "exclude_duplicate"
                || label.recurrenceContribution !== 0)) {
            throw new Error("subagent sessions are delegated duplicates with zero recurrence");
        }
        if (label.sessionRole === "wrapper"
            && (label.evidenceRole !== "delegated_execution"
                || label.adjudication !== "reject_pollution")) {
            throw new Error("session wrappers must be rejected as non-work");
        }
    }
    else if (label.evidenceRole === "delegated_execution") {
        throw new Error("delegated_execution requires an explicit sessionRole");
    }
    if (label.sourceKind === "oura") {
        const explicitlyUnlinked = label.reasonCodes.includes("unlinked_body_coverage");
        if (label.workClass !== "context_only"
            || label.evidenceRole !== "corroborating_variant"
            || label.adjudication !== "context_only"
            || !noProjection
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0
            || label.canonicalEventRef !== undefined
            || ((label.canonicalWorkRef === undefined) !== explicitlyUnlinked)) {
            throw new Error("Oura is corroborating post-membership context or explicit unlinked coverage only");
        }
    }
    if (label.labelAuthority === "source_authority"
        && !ACCEPTED_WORK_AUTHORITY_SOURCE_KINDS.has(label.sourceKind)) {
        throw new Error("source authority is limited to the closed authoritative-work source allowlist");
    }
    if (label.sourceKind === "strategy" && label.labelAuthority !== "source_authority") {
        throw new Error("Strategy truth labels must retain Strategy source authority");
    }
    if (label.sourceKind === "manual"
        && label.labelAuthority === "source_authority"
        && !["completed", "superseded"].includes(label.lifecycle)) {
        throw new Error("manual source authority is bounded to reviewed terminal rows");
    }
    if (label.adjudication === "candidate_review") {
        if (label.sourceKind !== "strategy"
            || label.evidenceRole !== "primary_authority"
            || label.labelAuthority !== "source_authority"
            || label.canonicalEventRef !== undefined) {
            throw new Error("candidate_review must be Strategy-backed source authority with no meeting-event claim");
        }
    }
    if (AUTOMATIC_EVIDENCE_SOURCE_KINDS.has(label.sourceKind)
        && (label.adjudication === "accepted_work"
            || label.expectedDelta === "new_accepted_work")) {
        throw new Error("meeting and session evidence cannot automatically create accepted work");
    }
    if (AUTOMATIC_EVIDENCE_SOURCE_KINDS.has(label.sourceKind)
        && label.adjudication === "merge_into_existing"
        && !noProjection) {
        throw new Error("meeting and session merge evidence cannot claim shared accepted work");
    }
    if (label.recurrenceContribution === 1 && (!label.canonicalEventRef
        || label.evidenceRole !== "primary_authority"
        || !["gemini_meet", "granola"].includes(label.sourceKind))) {
        throw new Error("recurrence requires one primary meeting evidence variant");
    }
}
function normalizeLabel(draft) {
    assertOnlyKeys(draft, LABEL_DRAFT_KEYS, "truth label");
    if (!CASE_KEY.test(draft.caseKey))
        throw new Error("truth caseKey is invalid");
    if (typeof draft.subject !== "string"
        || draft.subject.length === 0
        || draft.subject.length > 96
        || PRIVATE_TEXT.test(draft.subject)
        || taskMapTruthTextContainsSecret(draft.subject)
        || LOCAL_PATH_TEXT.test(draft.subject)) {
        throw new Error("truth subject must be bounded and privacy-safe");
    }
    if (!TIME_SPLITS.includes(draft.timeSplit))
        throw new Error("unsupported truth time split");
    if (!SOURCE_KINDS.has(draft.sourceKind))
        throw new Error("unsupported truth source kind");
    assertRequiredReference(draft.sourceRecordRef, "sourceRecordRef");
    assertOptionalReference(draft.canonicalEventRef, "canonicalEventRef");
    assertOptionalReference(draft.canonicalWorkRef, "canonicalWorkRef");
    if (MEETING_SOURCE_KINDS.has(draft.sourceKind) && !draft.canonicalEventRef) {
        throw new Error("meeting and discovery source rows require a canonicalEventRef");
    }
    if (!draft.canonicalEventRef
        && !draft.canonicalWorkRef
        && !(draft.sourceKind === "oura"
            && Array.isArray(draft.reasonCodes)
            && draft.reasonCodes.includes("unlinked_body_coverage"))) {
        throw new Error("truth label requires a canonical event or work reference");
    }
    if (draft.discoveryChannel !== undefined
        && !DISCOVERY_CHANNELS.has(draft.discoveryChannel)) {
        throw new Error("unsupported truth discovery channel");
    }
    if (draft.sessionRole !== undefined && !SESSION_ROLES.has(draft.sessionRole)) {
        throw new Error("unsupported truth session role");
    }
    if (!WORK_CLASSES.has(draft.workClass))
        throw new Error("unsupported truth workClass");
    if (!EVIDENCE_ROLES.has(draft.evidenceRole))
        throw new Error("unsupported truth evidenceRole");
    if (!ADJUDICATIONS.has(draft.adjudication))
        throw new Error("unsupported truth adjudication");
    if (!LIFECYCLES.has(draft.lifecycle))
        throw new Error("unsupported truth lifecycle");
    if (!EXPECTED_DELTAS.has(draft.expectedDelta))
        throw new Error("unsupported truth expectedDelta");
    if (!LABEL_AUTHORITIES.has(draft.labelAuthority)) {
        throw new Error("unsupported truth labelAuthority");
    }
    if (![0, 1].includes(draft.recurrenceContribution)) {
        throw new Error("truth recurrenceContribution must be zero or one");
    }
    if (![0, 1].includes(draft.membershipContribution)) {
        throw new Error("truth membershipContribution must be zero or one");
    }
    if (!Array.isArray(draft.reasonCodes) || draft.reasonCodes.length === 0) {
        throw new Error("truth reasonCodes must be a non-empty array");
    }
    const reasonCodes = [...new Set(draft.reasonCodes)].sort();
    if (reasonCodes.some((reason) => !REASON_CODES.has(reason))) {
        throw new Error("truth reasonCodes contain an unsupported value");
    }
    const normalized = {
        caseKey: draft.caseKey,
        subject: draft.subject,
        timeSplit: draft.timeSplit,
        sourceKind: draft.sourceKind,
        sourceRecordRef: draft.sourceRecordRef,
        ...(draft.canonicalEventRef === undefined
            ? {}
            : { canonicalEventRef: draft.canonicalEventRef }),
        ...(draft.canonicalWorkRef === undefined
            ? {}
            : { canonicalWorkRef: draft.canonicalWorkRef }),
        ...(draft.discoveryChannel === undefined
            ? {}
            : { discoveryChannel: draft.discoveryChannel }),
        ...(draft.sessionRole === undefined ? {} : { sessionRole: draft.sessionRole }),
        workClass: draft.workClass,
        evidenceRole: draft.evidenceRole,
        adjudication: draft.adjudication,
        lifecycle: draft.lifecycle,
        expectedProjection: assertProjection(draft.expectedProjection),
        expectedDelta: draft.expectedDelta,
        recurrenceContribution: draft.recurrenceContribution,
        membershipContribution: draft.membershipContribution,
        reasonCodes,
        labelAuthority: draft.labelAuthority,
    };
    assertLabelSemantics(normalized);
    return deepFreeze({
        labelId: stableId("tmtruthlabel", normalized),
        ...normalized,
    });
}
function zeroMetrics() {
    return {
        labelCount: 0,
        canonicalMeetingCount: 0,
        newRootCount: 0,
        newAcceptedWorkCount: 0,
        updatedExistingWorkCount: 0,
        candidateReviewCount: 0,
        automaticAcceptedFromMeetingOrSessionCount: 0,
        recurrenceContribution: 0,
        membershipContribution: 0,
        mergeIntoExistingCount: 0,
        duplicateExclusionCount: 0,
        pollutionRejectionCount: 0,
        falseReopenCount: 0,
    };
}
function metricsFor(labels) {
    const metrics = zeroMetrics();
    metrics.labelCount = labels.length;
    metrics.canonicalMeetingCount = new Set(labels
        .filter((label) => MEETING_SOURCE_KINDS.has(label.sourceKind))
        .map((label) => label.canonicalEventRef)
        .filter((value) => value !== undefined)).size;
    metrics.newRootCount = new Set(labels
        .filter((label) => label.expectedDelta === "new_root")
        .map((label) => label.canonicalWorkRef)
        .filter((value) => value !== undefined)).size;
    metrics.newAcceptedWorkCount = new Set(labels
        .filter((label) => label.expectedDelta === "new_accepted_work")
        .map((label) => label.canonicalWorkRef)
        .filter((value) => value !== undefined)).size;
    metrics.updatedExistingWorkCount = new Set(labels
        .filter((label) => label.expectedDelta === "update_existing_work")
        .map((label) => label.canonicalWorkRef)
        .filter((value) => value !== undefined)).size;
    metrics.candidateReviewCount = new Set(labels
        .filter((label) => label.adjudication === "candidate_review")
        .map((label) => label.canonicalWorkRef)
        .filter((value) => value !== undefined)).size;
    metrics.automaticAcceptedFromMeetingOrSessionCount = labels.filter((label) => (AUTOMATIC_EVIDENCE_SOURCE_KINDS.has(label.sourceKind)
        && (label.adjudication === "accepted_work"
            || label.expectedDelta === "new_accepted_work"))).length;
    metrics.recurrenceContribution = labels.reduce((sum, label) => sum + label.recurrenceContribution, 0);
    metrics.membershipContribution = new Set(labels
        .filter((label) => label.membershipContribution === 1)
        .map((label) => label.canonicalWorkRef)
        .filter((value) => value !== undefined)).size;
    metrics.mergeIntoExistingCount = labels
        .filter((label) => label.expectedDelta === "merge_existing_work").length;
    metrics.duplicateExclusionCount = labels
        .filter((label) => label.adjudication === "exclude_duplicate").length;
    metrics.pollutionRejectionCount = labels
        .filter((label) => label.adjudication === "reject_pollution").length;
    metrics.falseReopenCount = labels.filter((label) => (["completed", "superseded"].includes(label.lifecycle)
        && (label.expectedDelta !== "none"
            || label.recurrenceContribution !== 0
            || label.membershipContribution !== 0))).length;
    return metrics;
}
function normalizeMetrics(value, label) {
    assertOnlyKeys(value, METRICS_KEYS, label);
    const normalized = {};
    for (const key of METRICS_KEYS) {
        const metric = value[key];
        if (!Number.isSafeInteger(metric) || metric < 0) {
            throw new Error(`${label}.${key} must be a non-negative safe integer`);
        }
        normalized[key] = metric;
    }
    return normalized;
}
function normalizeSplitBoundaries(values, asOf) {
    if (!Array.isArray(values) || values.length !== TIME_SPLITS.length) {
        throw new Error("truth set must declare exact T0-T4 split boundaries");
    }
    const rows = values.map((value) => {
        assertOnlyKeys(value, SPLIT_BOUNDARY_KEYS, "truth split boundary");
        if (!TIME_SPLITS.includes(value.timeSplit)) {
            throw new Error("truth split boundaries contain an unsupported split");
        }
        assertTimestamp(value.startAt, `${value.timeSplit} startAt`);
        assertTimestamp(value.endAt, `${value.timeSplit} endAt`);
        if (Date.parse(value.startAt) >= Date.parse(value.endAt)) {
            throw new Error("truth split boundary startAt must precede endAt");
        }
        if (value.semantics !== "inclusive_start_exclusive_end") {
            throw new Error("truth split boundary semantics are unsupported");
        }
        return {
            timeSplit: value.timeSplit,
            startAt: new Date(value.startAt).toISOString(),
            endAt: new Date(value.endAt).toISOString(),
            semantics: value.semantics,
        };
    }).sort((left, right) => timeSplitIndex(left.timeSplit) - timeSplitIndex(right.timeSplit));
    if (new Set(rows.map((row) => row.timeSplit)).size !== TIME_SPLITS.length) {
        throw new Error("truth split boundaries must contain each T0-T4 split exactly once");
    }
    for (let index = 1; index < rows.length; index += 1) {
        if (rows[index - 1].endAt !== rows[index].startAt) {
            throw new Error("truth split boundaries must be contiguous");
        }
    }
    if (rows.at(-1)?.endAt !== new Date(asOf).toISOString()) {
        throw new Error("T4 endAt must equal the truth asOf cutoff");
    }
    return rows;
}
function normalizeExpectedSplitMetrics(values) {
    if (!Array.isArray(values) || values.length !== TIME_SPLITS.length) {
        throw new Error("truth set must declare exact T0-T4 split metrics");
    }
    const rows = values.map((value) => {
        assertOnlyKeys(value, SPLIT_METRICS_KEYS, "truth split metrics");
        if (!TIME_SPLITS.includes(value.timeSplit)) {
            throw new Error("truth split metrics contain an unsupported split");
        }
        return {
            timeSplit: value.timeSplit,
            metrics: normalizeMetrics(value.metrics, `${value.timeSplit} metrics`),
        };
    }).sort((left, right) => timeSplitIndex(left.timeSplit) - timeSplitIndex(right.timeSplit));
    if (new Set(rows.map((row) => row.timeSplit)).size !== TIME_SPLITS.length) {
        throw new Error("truth split metrics must contain each T0-T4 split exactly once");
    }
    return rows;
}
function assertMetricExpectations(labels, expectedSplits, expectedOverall) {
    const splits = TIME_SPLITS.map((timeSplit) => ({
        timeSplit,
        metrics: metricsFor(labels.filter((label) => label.timeSplit === timeSplit)),
    }));
    for (const expected of expectedSplits) {
        const actual = splits.find((row) => row.timeSplit === expected.timeSplit);
        if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(actual.metrics)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expected.metrics)) {
            throw new Error(`${expected.timeSplit} exact metrics do not match the reviewed truth`);
        }
    }
    const overall = metricsFor(labels);
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(overall)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(expectedOverall)) {
        throw new Error("overall exact metrics do not match the reviewed truth");
    }
    return { splits, overall };
}
function assertRecurrenceOne(labels) {
    const recurrenceByEvent = new Map();
    for (const label of labels) {
        if (!label.canonicalEventRef)
            continue;
        recurrenceByEvent.set(label.canonicalEventRef, (recurrenceByEvent.get(label.canonicalEventRef) ?? 0)
            + label.recurrenceContribution);
    }
    for (const contribution of recurrenceByEvent.values()) {
        if (contribution > 1) {
            throw new Error("one canonical event cannot contribute recurrence more than once");
        }
    }
}
function assertExistingWorkResolution(labels) {
    const requiresExistingWork = (label) => (label.adjudication === "merge_into_existing"
        || label.expectedDelta === "merge_existing_work"
        || label.expectedDelta === "update_existing_work");
    for (const label of labels.filter(requiresExistingWork)) {
        const resolvesToPriorAuthority = labels.some((candidate) => (candidate.canonicalWorkRef === label.canonicalWorkRef
            && candidate.adjudication === "accepted_work"
            && candidate.evidenceRole === "primary_authority"
            && candidate.labelAuthority === "source_authority"
            && ["open", "blocked"].includes(candidate.lifecycle)
            && timeSplitIndex(candidate.timeSplit) < timeSplitIndex(label.timeSplit)));
        if (!resolvesToPriorAuthority) {
            throw new Error("merge or update does not resolve to prior authoritative accepted work");
        }
    }
}
function assertTerminalReferenceStability(labels) {
    const terminalRows = labels.filter((label) => (label.canonicalWorkRef !== undefined
        && ["completed", "superseded"].includes(label.lifecycle)));
    for (const terminal of terminalRows) {
        for (const candidate of labels) {
            if (candidate.canonicalWorkRef !== terminal.canonicalWorkRef
                || ["completed", "superseded"].includes(candidate.lifecycle)) {
                continue;
            }
            const hasLiveSemantics = (["open", "blocked", "awaiting_review"].includes(candidate.lifecycle)
                || ["accepted_work", "candidate_review", "merge_into_existing"].includes(candidate.adjudication)
                || candidate.expectedDelta !== "none"
                || candidate.membershipContribution !== 0
                || candidate.recurrenceContribution !== 0);
            if (hasLiveSemantics
                && timeSplitIndex(candidate.timeSplit) >= timeSplitIndex(terminal.timeSplit)) {
                throw new Error("terminal work rejects same-split or later live semantics");
            }
        }
    }
}
function assertUniqueMembershipReferences(labels) {
    const contributingRefs = labels
        .filter((label) => label.membershipContribution === 1)
        .map((label) => label.canonicalWorkRef);
    if (contributingRefs.some((value) => value === undefined)) {
        throw new Error("membership contribution requires a canonical work reference");
    }
    if (new Set(contributingRefs).size !== contributingRefs.length) {
        throw new Error("each canonical work reference may contribute Task Map membership at most once");
    }
}
function assertAcceptedDeltaChronology(labels) {
    const createdRefs = new Set();
    for (const label of labels) {
        if (["new_root", "new_accepted_work"].includes(label.expectedDelta)
            && label.canonicalWorkRef) {
            if (createdRefs.has(label.canonicalWorkRef)) {
                throw new Error("a canonical work reference may contribute a creation delta at most once");
            }
            createdRefs.add(label.canonicalWorkRef);
        }
        if (label.adjudication !== "accepted_work"
            || ["completed", "superseded"].includes(label.lifecycle)) {
            continue;
        }
        if (label.timeSplit !== "T0" && label.expectedDelta === "none") {
            throw new Error("nonterminal accepted_work with delta none is limited to the T0 baseline");
        }
        const hasPriorAuthoritativeLiveWork = labels.some((candidate) => (candidate.canonicalWorkRef === label.canonicalWorkRef
            && candidate.adjudication === "accepted_work"
            && candidate.evidenceRole === "primary_authority"
            && candidate.labelAuthority === "source_authority"
            && ["open", "blocked"].includes(candidate.lifecycle)
            && timeSplitIndex(candidate.timeSplit) < timeSplitIndex(label.timeSplit)));
        if (label.timeSplit !== "T0"
            && !hasPriorAuthoritativeLiveWork
            && !["new_root", "new_accepted_work"].includes(label.expectedDelta)) {
            throw new Error("a first later accepted work reference requires a new-root or new-work delta");
        }
    }
}
function assertOuraWorkResolution(labels) {
    for (const label of labels.filter((candidate) => (candidate.sourceKind === "oura" && candidate.canonicalWorkRef !== undefined))) {
        const resolvesToEarlierMembership = labels.some((candidate) => (candidate.canonicalWorkRef === label.canonicalWorkRef
            && candidate.adjudication === "accepted_work"
            && candidate.membershipContribution === 1
            && timeSplitIndex(candidate.timeSplit) < timeSplitIndex(label.timeSplit)));
        if (!resolvesToEarlierMembership) {
            throw new Error("linked Oura context requires earlier membership-bearing accepted work");
        }
    }
}
function assertSessionWorkResolution(labels) {
    for (const label of labels.filter((candidate) => (SESSION_SOURCE_KINDS.has(candidate.sourceKind)))) {
        const resolvesToEarlierMembership = labels.some((candidate) => (candidate.canonicalWorkRef === label.canonicalWorkRef
            && candidate.adjudication === "accepted_work"
            && candidate.evidenceRole === "primary_authority"
            && candidate.labelAuthority === "source_authority"
            && candidate.membershipContribution === 1
            && timeSplitIndex(candidate.timeSplit) < timeSplitIndex(label.timeSplit)));
        if (!resolvesToEarlierMembership) {
            throw new Error("agent-session canonicalWorkRef requires earlier authoritative membership");
        }
    }
}
function assertReviewedMeetingMapping(labels) {
    const directPointers = labels.filter((label) => (label.sourceKind === "gmail" && label.discoveryChannel === "gmail_direct"));
    const forwardedPointers = labels.filter((label) => (label.sourceKind === "gmail" && label.discoveryChannel === "gmail_forwarded"));
    if (directPointers.length !== 1 || forwardedPointers.length !== 1) {
        throw new Error("reviewed truth requires one direct and one forwarded Gmail pointer");
    }
    const designEventRef = directPointers[0].canonicalEventRef;
    const weeklyEventRef = forwardedPointers[0].canonicalEventRef;
    if (!designEventRef
        || !weeklyEventRef
        || designEventRef === weeklyEventRef) {
        throw new Error("reviewed design and weekly meetings require distinct event refs");
    }
    const designHasPrimaryGemini = labels.some((label) => (label.sourceKind === "gemini_meet"
        && label.canonicalEventRef === designEventRef
        && label.evidenceRole === "primary_authority"
        && label.recurrenceContribution === 1));
    const designHasCalendar = labels.some((label) => (label.sourceKind === "google_calendar"
        && label.canonicalEventRef === designEventRef
        && label.evidenceRole === "identity_anchor"));
    const designHasGranola = labels.some((label) => (label.sourceKind === "granola"
        && label.canonicalEventRef === designEventRef
        && label.evidenceRole === "corroborating_variant"
        && label.adjudication === "exclude_duplicate"));
    const weeklyHasGemini = labels.some((label) => (label.sourceKind === "gemini_meet"
        && label.canonicalEventRef === weeklyEventRef));
    const weeklyHasFalseAnchor = labels.some((label) => (["google_calendar", "granola"].includes(label.sourceKind)
        && label.canonicalEventRef === weeklyEventRef));
    if (!designHasPrimaryGemini
        || !designHasCalendar
        || !designHasGranola
        || !weeklyHasGemini
        || weeklyHasFalseAnchor) {
        throw new Error("reviewed direct design and forwarded weekly provider rows must retain exact canonical-event parity");
    }
}
function assertCanonicalEventSplitIntegrity(labels) {
    const splitByEvent = new Map();
    for (const label of labels) {
        if (!label.canonicalEventRef)
            continue;
        const prior = splitByEvent.get(label.canonicalEventRef);
        if (prior !== undefined && prior !== label.timeSplit) {
            throw new Error("one canonical event cannot span multiple truth time splits");
        }
        splitByEvent.set(label.canonicalEventRef, label.timeSplit);
    }
}
function buildTaskMapTruthSet(draft) {
    assertOnlyKeys(draft, DRAFT_KEYS, "truth set draft");
    if (draft.contractVersion !== types_js_1.TASKMAP_TRUTH_SET_DRAFT_VERSION) {
        throw new Error("unsupported truth set draft version");
    }
    if (draft.splitPolicyVersion !== types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION) {
        throw new Error("unsupported truth time-split policy version");
    }
    assertTimestamp(draft.asOf, "truth set asOf");
    assertTimestamp(draft.reviewedAt, "truth set reviewedAt");
    if (Date.parse(draft.asOf) > Date.parse(draft.reviewedAt)) {
        throw new Error("truth set asOf cannot follow reviewedAt");
    }
    if (!Array.isArray(draft.labels) || draft.labels.length === 0 || draft.labels.length > 4_096) {
        throw new Error("truth set labels must be a bounded non-empty array");
    }
    const labels = draft.labels.map(normalizeLabel).sort((left, right) => (timeSplitIndex(left.timeSplit) - timeSplitIndex(right.timeSplit)
        || left.caseKey.localeCompare(right.caseKey)));
    if (new Set(labels.map((label) => label.caseKey)).size !== labels.length) {
        throw new Error("truth caseKey must be unique");
    }
    if (new Set(labels.map((label) => label.labelId)).size !== labels.length) {
        throw new Error("truth label identity must be unique");
    }
    if (new Set(labels.map((label) => label.sourceRecordRef)).size !== labels.length) {
        throw new Error("truth sourceRecordRef must be unique");
    }
    assertTerminalReferenceStability(labels);
    assertUniqueMembershipReferences(labels);
    assertAcceptedDeltaChronology(labels);
    assertOuraWorkResolution(labels);
    assertSessionWorkResolution(labels);
    assertExistingWorkResolution(labels);
    assertCanonicalEventSplitIntegrity(labels);
    assertReviewedMeetingMapping(labels);
    assertRecurrenceOne(labels);
    const splitBoundaries = normalizeSplitBoundaries(draft.splitBoundaries, draft.asOf);
    const expectedSplits = normalizeExpectedSplitMetrics(draft.expectedSplitMetrics);
    const expectedOverall = normalizeMetrics(draft.expectedOverallMetrics, "expected overall metrics");
    const { splits, overall } = assertMetricExpectations(labels, expectedSplits, expectedOverall);
    const asOf = new Date(draft.asOf).toISOString();
    const reviewedAt = new Date(draft.reviewedAt).toISOString();
    const reviewBatchDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        reviewBatchPolicyVersion: types_js_1.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION,
        labelPolicyVersion: types_js_1.TASKMAP_TRUTH_LABEL_POLICY_VERSION,
        splitPolicyVersion: types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
        sourceContractVersion: types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION,
        splitBoundaries,
        asOf,
        reviewedAt,
        labelIds: labels.map((label) => label.labelId),
    });
    const core = {
        labelPolicyVersion: types_js_1.TASKMAP_TRUTH_LABEL_POLICY_VERSION,
        splitPolicyVersion: types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
        reviewBatchPolicyVersion: types_js_1.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION,
        reviewBatchDigest,
        sourceContractVersion: types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION,
        splitBoundaries,
        asOf,
        reviewedAt,
        labels,
        splitMetrics: splits,
        overallMetrics: overall,
        privacy: PRIVACY,
    };
    const truthSetDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_TRUTH_SET_VERSION,
        truthSetId: stableId("tmtruthset", truthSetDigest),
        truthSetDigest,
        ...core,
    });
}
function assertTaskMapTruthSet(value) {
    assertOnlyKeys(value, FINAL_KEYS, "built truth set");
    if (value.contractVersion !== types_js_1.TASKMAP_TRUTH_SET_VERSION) {
        throw new Error("unsupported built truth set version");
    }
    if (value.labelPolicyVersion !== types_js_1.TASKMAP_TRUTH_LABEL_POLICY_VERSION) {
        throw new Error("unsupported truth label policy version");
    }
    if (value.splitPolicyVersion !== types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION) {
        throw new Error("unsupported truth time-split policy version");
    }
    if (value.reviewBatchPolicyVersion
        !== types_js_1.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION) {
        throw new Error("unsupported truth review-batch policy version");
    }
    if (value.sourceContractVersion !== types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION) {
        throw new Error("unsupported truth source contract version");
    }
    assertOnlyKeys(value.privacy, PRIVACY_KEYS, "truth set privacy");
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(value.privacy) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(PRIVACY)) {
        throw new Error("truth set privacy contract is invalid");
    }
    const labels = value.labels.map((label) => {
        assertOnlyKeys(label, LABEL_KEYS, "built truth label");
        const { labelId, ...draft } = label;
        const rebuilt = normalizeLabel(draft);
        if (rebuilt.labelId !== labelId) {
            throw new Error("truth label derived identity is invalid");
        }
        return rebuilt;
    });
    const rebuilt = buildTaskMapTruthSet({
        contractVersion: types_js_1.TASKMAP_TRUTH_SET_DRAFT_VERSION,
        splitPolicyVersion: value.splitPolicyVersion,
        splitBoundaries: value.splitBoundaries,
        asOf: value.asOf,
        reviewedAt: value.reviewedAt,
        labels: labels.map(({ labelId: _labelId, ...label }) => label),
        expectedSplitMetrics: value.splitMetrics,
        expectedOverallMetrics: value.overallMetrics,
    });
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(rebuilt) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(value)) {
        throw new Error("truth set is not canonical or has invalid derived fields");
    }
    return rebuilt;
}
function taskMapTruthSetCanonicalJson(value) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)(assertTaskMapTruthSet(value));
}
function taskMapTruthSetMembershipSignature(value, maskBody = false) {
    const truthSet = assertTaskMapTruthSet(value);
    const memberRefs = truthSet.labels
        .filter((label) => !maskBody || label.sourceKind !== "oura")
        .filter((label) => label.membershipContribution === 1)
        .map((label) => label.canonicalWorkRef)
        .filter((item) => item !== undefined)
        .sort();
    return (0, source_contracts_js_1.taskMapContractDigest)([...new Set(memberRefs)]);
}
function projectionLifecycle(label, role) {
    if (role === "taskmap_candidate_review")
        return "candidate";
    if (role === "strategy_durable_context"
        || label.lifecycle === "completed"
        || label.lifecycle === "superseded") {
        return "resolved";
    }
    return "accepted_open";
}
function truthProjectionRecords(truthSet, target) {
    const selected = new Map();
    for (const label of truthSet.labels) {
        const projection = target === "strategy"
            ? label.expectedProjection.strategy
            : label.expectedProjection.taskMap;
        if (projection === "excluded")
            continue;
        const canonicalRecordId = label.canonicalWorkRef ?? label.canonicalEventRef;
        if (!canonicalRecordId)
            continue;
        const existing = selected.get(canonicalRecordId);
        if (existing) {
            const existingTerminal = ["completed", "superseded"].includes(existing.label.lifecycle);
            const nextTerminal = ["completed", "superseded"].includes(label.lifecycle);
            if (existingTerminal !== nextTerminal) {
                const validForwardResolution = (!existingTerminal
                    && nextTerminal
                    && timeSplitIndex(existing.label.timeSplit) < timeSplitIndex(label.timeSplit));
                if (!validForwardResolution) {
                    throw new Error("a projection record cannot overwrite a terminal lifecycle");
                }
            }
        }
        selected.set(canonicalRecordId, { label, role: projection });
    }
    return [...selected.entries()].map(([canonicalReference, selection]) => {
        const { label, role } = selection;
        const lifecycle = projectionLifecycle(label, role);
        const canonicalRecordId = stableId("tmtruthrecord", canonicalReference);
        return {
            canonicalRecordId,
            role,
            sourceIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`truth-source:${canonicalReference}`),
            lifecycle,
            recordDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                target,
                canonicalReference,
                canonicalRecordId,
                role,
                lifecycle,
                labelId: label.labelId,
            }),
        };
    });
}
function buildTaskMapTruthProjectionTarget(value, target) {
    const truthSet = assertTaskMapTruthSet(value);
    const acceptedDeltaDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        truthSetDigest: truthSet.truthSetDigest,
        overallMetrics: truthSet.overallMetrics,
    });
    return (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
        target,
        acceptedDeltaDigest,
        records: truthProjectionRecords(truthSet, target),
    });
}
function compareTaskMapTruthSetProjectionParity(value) {
    const truthSet = assertTaskMapTruthSet(value);
    return (0, source_contracts_js_1.compareTaskMapProjectionTargets)(buildTaskMapTruthProjectionTarget(truthSet, "strategy"), buildTaskMapTruthProjectionTarget(truthSet, "task_map"));
}
