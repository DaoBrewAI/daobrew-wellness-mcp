"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskMapContractCanonicalJson = taskMapContractCanonicalJson;
exports.taskMapContractDigest = taskMapContractDigest;
exports.attestTaskMapSemanticBrain = attestTaskMapSemanticBrain;
exports.buildTaskMapSourceEnvelope = buildTaskMapSourceEnvelope;
exports.canonicalGoogleDocumentId = canonicalGoogleDocumentId;
exports.buildGeminiMeetSource = buildGeminiMeetSource;
exports.advanceTaskMapConnectorCheckpoint = advanceTaskMapConnectorCheckpoint;
exports.assertTaskMapConnectorCheckpoint = assertTaskMapConnectorCheckpoint;
exports.canonicalizeTaskMapMeetings = canonicalizeTaskMapMeetings;
exports.buildTaskMapSourceSnapshot = buildTaskMapSourceSnapshot;
exports.assertTaskMapSourceSnapshot = assertTaskMapSourceSnapshot;
exports.buildTaskMapSemanticProposalReference = buildTaskMapSemanticProposalReference;
exports.assertTaskMapSemanticProposalCurrent = assertTaskMapSemanticProposalCurrent;
exports.buildTaskMapGateDecision = buildTaskMapGateDecision;
exports.diffTaskMapProjections = diffTaskMapProjections;
exports.buildTaskMapProjectionTarget = buildTaskMapProjectionTarget;
exports.compareTaskMapProjectionTargets = compareTaskMapProjectionTargets;
exports.buildTaskMapReplayManifest = buildTaskMapReplayManifest;
const node_crypto_1 = require("node:crypto");
const harness_js_1 = require("./harness.js");
const types_js_1 = require("./types.js");
const SHA256 = /^[a-f0-9]{64}$/;
const IMMUTABLE_GIT_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._#-]{0,511}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const PRIVACY = {
    sourceBodiesStored: false,
    emailBodiesStored: false,
    participantDetailsStored: false,
    rawBiometricsStored: false,
    fullAgentSessionBodiesStored: false,
    localPathsStored: false,
};
const ENVELOPE_KEYS = new Set([
    "ownerScopeDigest",
    "binding",
    "sourceKind",
    "objectType",
    "sourceObjectId",
    "sourceRevision",
    "eventTime",
    "contentDigest",
    "authority",
    "meetingIdentity",
]);
const BINDING_KEYS = new Set([
    "connectionId",
    "sourceKind",
    "tenantOrWorkspaceDigest",
    "accountOrPrincipalDigest",
    "grantVersion",
]);
const AUTHORITY_KEYS = new Set(["evidence", "quality", "lifecycle", "completion", "rank"]);
const MEETING_HINT_KEYS = new Set([
    "fingerprintVersion",
    "startAt",
    "endAt",
    "calendarEventIdDigest",
    "normalizedTitleDigest",
    "participantSetDigest",
]);
const GEMINI_KEYS = new Set([
    "ownerScopeDigest",
    "binding",
    "documentId",
    "revisionId",
    "eventTime",
    "contentDigest",
    "quality",
    "meetingIdentity",
    "gmailDiscoveries",
]);
const GMAIL_DISCOVERY_KEYS = new Set([
    "binding",
    "channel",
    "opaqueMessageId",
    "resolvedDocumentUrl",
]);
const SEMANTIC_REFERENCE_KEYS = new Set([
    "sourceSnapshot",
    "semanticBrainArtifact",
    "semanticBrainAttestationKey",
]);
const SEMANTIC_BRAIN_ARTIFACT_KEYS = new Set([
    "sourceSemanticInputDigest",
    "attestationKeyId",
    "attestationMac",
    "brain",
]);
const BUILT_SEMANTIC_REFERENCE_KEYS = new Set([
    "contractVersion",
    "semanticInputDigest",
    "semanticBrainDigest",
    "rootProposalIds",
    "candidateProposalIds",
    "relationProposalIds",
]);
const GATE_DECISION_KEYS = new Set(["subjectId", "gate", "outcome", "reasonCodes"]);
const BUILT_GATE_DECISION_KEYS = new Set([
    "contractVersion",
    "decisionId",
    "subjectId",
    "gate",
    "outcome",
    "reasonCodes",
]);
const BUILT_ENVELOPE_KEYS = new Set([
    "contractVersion",
    "envelopeId",
    "ownerScopeDigest",
    "sourceObjectKeyDigest",
    "sourceIdentityDigest",
    "binding",
    "sourceKind",
    "objectType",
    "sourceObjectId",
    "sourceRevision",
    "eventTime",
    "contentDigest",
    "authority",
    "meetingIdentity",
    "privacy",
]);
const BUILT_DISCOVERY_KEYS = new Set([
    "contractVersion",
    "discoveryId",
    "ownerScopeDigest",
    "binding",
    "channel",
    "opaqueMessageId",
    "targetSourceKind",
    "targetSourceObjectId",
    "targetSourceIdentityDigest",
    "resolvedTargetUrlDigest",
    "duplicateContentSuppressed",
]);
const PRIVACY_KEYS = new Set([
    "sourceBodiesStored",
    "emailBodiesStored",
    "participantDetailsStored",
    "rawBiometricsStored",
    "fullAgentSessionBodiesStored",
    "localPathsStored",
]);
const CHECKPOINT_KEYS = new Set([
    "contractVersion",
    "checkpointId",
    "binding",
    "sourceKind",
    "adapterVersion",
    "capabilities",
    "state",
    "lastAttemptAt",
    "lastSuccessfulPollAt",
    "watermark",
    "watermarkHistoryDigests",
    "acceptedSourceIdentityDigests",
    "error",
]);
const WATERMARK_KEYS = new Set(["kind", "valueDigest", "observedThrough"]);
const CHECKPOINT_ERROR_KEYS = new Set(["code", "detailDigest"]);
const CANONICAL_MEETING_KEYS = new Set([
    "contractVersion",
    "canonicalMeetingId",
    "identityMethod",
    "identityKeyDigest",
    "identityAliases",
    "fingerprintDigest",
    "startAt",
    "reviewState",
    "conflictCodes",
    "calendarEnvelopeIds",
    "evidenceVariantEnvelopeIds",
]);
const SOURCE_SNAPSHOT_KEYS = new Set([
    "contractVersion",
    "snapshotId",
    "ownerScopeDigest",
    "sourceSnapshotDigest",
    "semanticInputDigest",
    "bodyContextDigest",
    "discoveryProvenanceDigest",
    "envelopes",
    "discoveryPointers",
    "canonicalMeetings",
    "privacy",
]);
const ENVELOPE_REQUIRED_KEYS = new Set([...ENVELOPE_KEYS].filter((key) => key !== "meetingIdentity"));
const MEETING_HINT_REQUIRED_KEYS = new Set([...MEETING_HINT_KEYS].filter((key) => (key !== "endAt" && key !== "calendarEventIdDigest")));
const BUILT_ENVELOPE_REQUIRED_KEYS = new Set([...BUILT_ENVELOPE_KEYS].filter((key) => key !== "meetingIdentity"));
const CHECKPOINT_REQUIRED_KEYS = new Set([
    "contractVersion",
    "checkpointId",
    "binding",
    "sourceKind",
    "adapterVersion",
    "capabilities",
    "state",
    "lastAttemptAt",
    "watermarkHistoryDigests",
    "acceptedSourceIdentityDigests",
]);
const WATERMARK_REQUIRED_KEYS = new Set(["kind", "valueDigest"]);
const PROJECTION_TARGET_DRAFT_KEYS = new Set(["target", "acceptedDeltaDigest", "records"]);
const PROJECTION_TARGET_KEYS = new Set([
    "contractVersion",
    "target",
    "acceptedDeltaDigest",
    "records",
    "privacy",
]);
const PROJECTION_TARGET_RECORD_KEYS = new Set([
    "canonicalRecordId",
    "role",
    "sourceIdentityDigest",
    "lifecycle",
    "recordDigest",
]);
const PROJECTION_TARGET_PRIVACY_KEYS = new Set([
    "sourceBodiesStored",
    "strategyProseStored",
    "localPathsStored",
]);
const POLICY_BINDING_KEYS = new Set(["name", "version", "digest"]);
const PROJECTION_PARITY_KEYS = new Set([
    "contractVersion",
    "comparisonId",
    "acceptedDeltaDigest",
    "intentionalDifferences",
    "failures",
]);
const PROJECTION_PARITY_FINDING_KEYS = new Set(["canonicalRecordId", "code"]);
const VALID_PARITY_CODES = new Set([
    "strategy_durable_context_only",
    "taskmap_candidate_review_only",
    "taskmap_operational_detail_only",
    "shared_work_missing_strategy",
    "shared_work_missing_task_map",
    "source_identity_mismatch",
    "role_mismatch",
    "lifecycle_mismatch",
    "accepted_delta_mismatch",
]);
const REPLAY_MANIFEST_DRAFT_KEYS = new Set([
    "fixedNow",
    "sourceSnapshot",
    "semanticBrainArtifact",
    "semanticBrainAttestationKey",
    "previousProjection",
    "currentProjection",
    "policyBindings",
    "connectorCheckpoints",
    "gateDecisions",
    "projectionParity",
]);
const PROJECTION_KEYS = new Set([
    "contractVersion",
    "algorithmPolicyVersion",
    "algorithmPolicyDigest",
    "runStatus",
    "arm",
    "runId",
    "generatedAt",
    "inputDigest",
    "brain",
    "sources",
    "roots",
    "tasks",
    "edges",
    "rejections",
    "privacy",
]);
const PROJECTION_BRAIN_KEYS = new Set([
    "provider",
    "model",
    "promptHash",
    "outputDigest",
]);
const PROJECTION_PRIVACY_KEYS = new Set([
    "sourceBodiesStored",
    "localPathsStored",
    "rawBiometricsStored",
]);
const MAX_ARTIFACT_ROWS = 4_096;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
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
const VALID_OBJECT_TYPES = new Set([
    "authoritative_task",
    "meeting_note",
    "calendar_event",
    "agent_session",
    "body_context",
    "strategy_context",
]);
const VALID_EVIDENCE = new Set([
    "authoritative_task",
    "explicit_commitment",
    "provider_generated_summary",
    "context_only",
    "body_context_only",
]);
const VALID_QUALITY = new Set([
    "source_native",
    "structured_generated",
    "provider_summary",
    "degraded_summary",
    "bounded_context",
    "coverage_only",
]);
const VALID_LIFECYCLE = new Set([
    "source_status",
    "explicit_user_policy",
    "none",
]);
const VALID_COMPLETION = new Set([
    "source_status",
    "explicit_user_policy",
    "none",
]);
const VALID_RANK = new Set([
    "accepted_work",
    "candidate_only",
    "context_only",
    "body_bonus_only",
]);
const SOURCE_OBJECT_TYPES = {
    linear: new Set(["authoritative_task"]),
    jira: new Set(["authoritative_task"]),
    github: new Set(["authoritative_task"]),
    slack: new Set(["strategy_context"]),
    google_chat: new Set(["strategy_context"]),
    gmail: new Set(["strategy_context"]),
    google_calendar: new Set(["calendar_event"]),
    local_calendar: new Set(["calendar_event"]),
    google_tasks: new Set(["authoritative_task"]),
    gemini_meet: new Set(["meeting_note"]),
    granola: new Set(["meeting_note"]),
    codex_session: new Set(["agent_session"]),
    claude_session: new Set(["agent_session"]),
    cursor_session: new Set(["agent_session"]),
    oura: new Set(["body_context"]),
    strategy: new Set(["authoritative_task", "strategy_context"]),
    manual: new Set(["authoritative_task", "strategy_context"]),
    unknown: new Set(["strategy_context"]),
};
const LOCAL_OR_BODY_SOURCE_KINDS = new Set([
    "codex_session",
    "claude_session",
    "cursor_session",
    "oura",
]);
const VALID_GATES = new Set([
    "identity",
    "privacy",
    "dedupe",
    "authority",
    "lifecycle",
    "completion",
    "supersede",
    "dependency",
    "rank",
]);
const VALID_GATE_OUTCOMES = new Set([
    "accepted",
    "rejected",
    "candidate_only",
    "context_only",
    "body_bonus_only",
]);
const REQUIRED_POLICY_NAMES = new Set([
    "source",
    "normalization",
    "identity",
    "privacy",
    "dedupe",
    "authority",
    "lifecycle",
    "completion",
    "supersede",
    "dependency",
    "rank",
    "algorithm",
]);
function taskMapContractCanonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(taskMapContractCanonicalJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            // Unicode scalar order to stay byte-identical with the Swift reader's
            // TaskMapLifecycleCanonicalJSON; localeCompare flips case-mixed sibling
            // keys (currentWork/currentness) and is locale-dependent.
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, item]) => `${JSON.stringify(key)}:${taskMapContractCanonicalJson(item)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function taskMapContractDigest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(taskMapContractCanonicalJson(value)).digest("hex");
}
function stableId(prefix, value) {
    return `${prefix}_${taskMapContractDigest(value).slice(0, 16)}`;
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
const SEMANTIC_ATTESTATION_DOMAIN = "taskmap-semantic-brain-attestation.1";
function assertSemanticAttestationKey(key) {
    if (typeof key !== "string"
        || Buffer.byteLength(key, "utf8") < 32
        || Buffer.byteLength(key, "utf8") > 512) {
        throw new Error("semantic brain attestation key must be 32-512 bytes");
    }
}
function semanticBrainAttestationMac(sourceSemanticInputDigest, brain, key) {
    return (0, node_crypto_1.createHmac)("sha256", key)
        .update(taskMapContractCanonicalJson({
        domain: SEMANTIC_ATTESTATION_DOMAIN,
        sourceSemanticInputDigest,
        brain,
    }))
        .digest("hex");
}
function attestTaskMapSemanticBrain(sourceSemanticInputDigest, brain, semanticBrainAttestationKey) {
    assertDigest(sourceSemanticInputDigest, "sourceSemanticInputDigest");
    assertSemanticAttestationKey(semanticBrainAttestationKey);
    return deepFreeze({
        sourceSemanticInputDigest,
        attestationKeyId: (0, node_crypto_1.createHmac)("sha256", semanticBrainAttestationKey)
            .update(`${SEMANTIC_ATTESTATION_DOMAIN}:key-id`)
            .digest("hex"),
        attestationMac: semanticBrainAttestationMac(sourceSemanticInputDigest, brain, semanticBrainAttestationKey),
        brain: structuredClone(brain),
    });
}
function assertSemanticBrainAttestation(artifact, key) {
    assertSemanticAttestationKey(key);
    assertDigest(artifact.attestationKeyId, "semantic brain attestationKeyId");
    assertDigest(artifact.attestationMac, "semantic brain attestationMac");
    const expected = attestTaskMapSemanticBrain(artifact.sourceSemanticInputDigest, artifact.brain, key);
    const keyIdMatches = (0, node_crypto_1.timingSafeEqual)(Buffer.from(artifact.attestationKeyId, "hex"), Buffer.from(expected.attestationKeyId, "hex"));
    const macMatches = (0, node_crypto_1.timingSafeEqual)(Buffer.from(artifact.attestationMac, "hex"), Buffer.from(expected.attestationMac, "hex"));
    if (!keyIdMatches || !macMatches) {
        throw new Error("semantic brain attestation is invalid");
    }
}
function assertBoundedArtifact(value, label) {
    if (Buffer.byteLength(taskMapContractCanonicalJson(value), "utf8") > MAX_ARTIFACT_BYTES) {
        throw new Error(`${label} exceeds the bounded artifact size`);
    }
}
function assertBoundedRows(values, label) {
    if (!Array.isArray(values) || values.length > MAX_ARTIFACT_ROWS) {
        throw new Error(`${label} exceeds the bounded row count`);
    }
}
function assertPlainObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${label} must be a plain object`);
    }
}
function assertOnlyKeys(value, allowed, label) {
    assertPlainObject(value, label);
    const prototype = Object.getPrototypeOf(value);
    for (const key of allowed) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined
            && prototype !== null
            && Object.getOwnPropertyDescriptor(prototype, key) !== undefined) {
            throw new Error(`${label}.${key} must not be inherited`);
        }
        if (descriptor !== undefined
            && (!descriptor.enumerable
                || !("value" in descriptor))) {
            throw new Error(`${label}.${key} must be an enumerable data property`);
        }
    }
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
        throw new Error(`${label} contains forbidden or unknown fields: ${unknown.sort().join(", ")}`);
    }
}
function assertRequiredKeys(value, required, label) {
    assertPlainObject(value, label);
    const missing = [...required].filter((key) => {
        if (!Object.prototype.hasOwnProperty.call(value, key))
            return true;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (descriptor === undefined
            || !descriptor.enumerable
            || !("value" in descriptor));
    });
    if (missing.length > 0) {
        throw new Error(`${label} is missing required fields: ${missing.sort().join(", ")}`);
    }
}
function assertContractKeys(value, allowed, required, label) {
    assertOnlyKeys(value, allowed, label);
    assertRequiredKeys(value, required, label);
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertOpaque(value, label) {
    if (typeof value !== "string" || !SAFE_OPAQUE.test(value)) {
        throw new Error(`${label} must be a bounded opaque identifier`);
    }
}
function assertDigestOnlyIdentifier(value, label) {
    assertDigest(value, label);
}
function assertPrivacy(value) {
    assertContractKeys(value, PRIVACY_KEYS, PRIVACY_KEYS, "privacy contract");
    if (taskMapContractCanonicalJson(value) !== taskMapContractCanonicalJson(PRIVACY)) {
        throw new Error("privacy contract cannot claim or retain private source content");
    }
}
function assertTimestamp(value, label) {
    if (typeof value !== "string") {
        throw new Error(`${label} must be strict RFC3339`);
    }
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
function assertBinding(binding, expectedSourceKind) {
    assertContractKeys(binding, BINDING_KEYS, BINDING_KEYS, "source binding");
    assertOpaque(binding.connectionId, "connectionId");
    if (!VALID_SOURCE_KINDS.has(binding.sourceKind)) {
        throw new Error("source binding has an unsupported source kind");
    }
    if (expectedSourceKind && binding.sourceKind !== expectedSourceKind) {
        throw new Error("source binding is not authorized for the requested source kind");
    }
    assertOpaque(binding.grantVersion, "grantVersion");
    assertDigest(binding.tenantOrWorkspaceDigest, "tenantOrWorkspaceDigest");
    assertDigest(binding.accountOrPrincipalDigest, "accountOrPrincipalDigest");
}
function assertMeetingHint(hint) {
    assertContractKeys(hint, MEETING_HINT_KEYS, MEETING_HINT_REQUIRED_KEYS, "meeting identity hint");
    if (hint.fingerprintVersion !== "taskmap-meeting-fingerprint.1") {
        throw new Error("unsupported meeting fingerprint version");
    }
    assertTimestamp(hint.startAt, "meeting startAt");
    if (hint.endAt !== undefined) {
        assertTimestamp(hint.endAt, "meeting endAt");
        if (Date.parse(hint.endAt) < Date.parse(hint.startAt)) {
            throw new Error("meeting endAt must not precede startAt");
        }
    }
    if (hint.calendarEventIdDigest !== undefined) {
        assertDigest(hint.calendarEventIdDigest, "calendarEventIdDigest");
    }
    assertDigest(hint.normalizedTitleDigest, "normalizedTitleDigest");
    assertDigest(hint.participantSetDigest, "participantSetDigest");
}
function assertAuthority(sourceKind, objectType, authority) {
    assertContractKeys(authority, AUTHORITY_KEYS, AUTHORITY_KEYS, "authority contract");
    if (!VALID_EVIDENCE.has(authority.evidence)
        || !VALID_QUALITY.has(authority.quality)
        || !VALID_LIFECYCLE.has(authority.lifecycle)
        || !VALID_COMPLETION.has(authority.completion)
        || !VALID_RANK.has(authority.rank)) {
        throw new Error("authority contract contains an unsupported enum value");
    }
    if (objectType === "body_context") {
        if (authority.evidence !== "body_context_only"
            || authority.quality !== "coverage_only"
            || authority.lifecycle !== "none"
            || authority.completion !== "none"
            || authority.rank !== "body_bonus_only") {
            throw new Error("body context can only provide a post-membership body bonus");
        }
        return;
    }
    if (objectType === "calendar_event") {
        if (authority.evidence !== "context_only"
            || authority.quality !== "source_native"
            || authority.lifecycle !== "none"
            || authority.completion !== "none"
            || authority.rank !== "context_only") {
            throw new Error("Calendar is timing context and cannot own task completion");
        }
        return;
    }
    if (objectType === "meeting_note") {
        if (!["provider_generated_summary", "explicit_commitment", "context_only"].includes(authority.evidence)
            || ![
                "structured_generated",
                "provider_summary",
                "degraded_summary",
                "bounded_context",
            ].includes(authority.quality)
            || authority.lifecycle !== "none"
            || authority.completion !== "none"
            || !["candidate_only", "context_only"].includes(authority.rank)) {
            throw new Error("meeting notes are evidence variants, not lifecycle or completion authority");
        }
        return;
    }
    if (objectType === "agent_session") {
        if (!["explicit_commitment", "context_only"].includes(authority.evidence)
            || authority.quality !== "bounded_context"
            || authority.lifecycle !== "none"
            || authority.completion !== "none"
            || !["candidate_only", "context_only"].includes(authority.rank)) {
            throw new Error("agent sessions are context/candidates and not task completion authority");
        }
        return;
    }
    if (objectType === "authoritative_task") {
        if (authority.evidence !== "authoritative_task"
            || authority.quality !== "source_native"
            || authority.rank !== "accepted_work"
            || authority.lifecycle === "none"
            || authority.completion === "none") {
            throw new Error("authoritative tasks require deterministic lifecycle and completion authority");
        }
        const expectedAuthority = sourceKind === "manual"
            ? "explicit_user_policy"
            : "source_status";
        if (authority.lifecycle !== expectedAuthority
            || authority.completion !== expectedAuthority) {
            throw new Error("authoritative task lifecycle must match its source kind");
        }
        return;
    }
    if (objectType === "strategy_context") {
        if (!["explicit_commitment", "provider_generated_summary", "context_only"].includes(authority.evidence)
            || authority.lifecycle !== "none"
            || authority.completion !== "none"
            || !["candidate_only", "context_only"].includes(authority.rank)
            || ![
                "source_native",
                "structured_generated",
                "provider_summary",
                "degraded_summary",
                "bounded_context",
            ].includes(authority.quality)) {
            throw new Error("strategy context can only provide bounded context or candidates");
        }
        return;
    }
    throw new Error("unsupported source authority object type");
}
function buildTaskMapSourceEnvelope(draft) {
    assertContractKeys(draft, ENVELOPE_KEYS, ENVELOPE_REQUIRED_KEYS, "source envelope draft");
    assertDigest(draft.ownerScopeDigest, "ownerScopeDigest");
    assertBinding(draft.binding, draft.sourceKind);
    if (!VALID_SOURCE_KINDS.has(draft.sourceKind))
        throw new Error("unsupported source kind");
    if (!VALID_OBJECT_TYPES.has(draft.objectType))
        throw new Error("unsupported source object type");
    if (!SOURCE_OBJECT_TYPES[draft.sourceKind].has(draft.objectType)) {
        throw new Error(`${draft.sourceKind} cannot emit ${draft.objectType}`);
    }
    if (LOCAL_OR_BODY_SOURCE_KINDS.has(draft.sourceKind)) {
        assertDigestOnlyIdentifier(draft.sourceObjectId, "sourceObjectId");
        assertDigestOnlyIdentifier(draft.sourceRevision, "sourceRevision");
    }
    else {
        assertOpaque(draft.sourceObjectId, "sourceObjectId");
        assertOpaque(draft.sourceRevision, "sourceRevision");
    }
    if (draft.sourceKind === "strategy"
        && draft.objectType === "authoritative_task"
        && !IMMUTABLE_GIT_COMMIT.test(draft.sourceRevision)) {
        throw new Error("Strategy authoritative tasks require an immutable 40-hex Git sourceRevision");
    }
    assertTimestamp(draft.eventTime, "eventTime");
    assertDigest(draft.contentDigest, "contentDigest");
    assertAuthority(draft.sourceKind, draft.objectType, draft.authority);
    if (["meeting_note", "calendar_event"].includes(draft.objectType)) {
        if (!draft.meetingIdentity)
            throw new Error("meeting sources require a bounded identity hint");
        assertMeetingHint(draft.meetingIdentity);
    }
    else if (draft.meetingIdentity !== undefined) {
        throw new Error("only meeting notes and Calendar events may carry meeting identity hints");
    }
    const sourceObjectKeyDigest = taskMapContractDigest({
        ownerScopeDigest: draft.ownerScopeDigest,
        connectionId: draft.binding.connectionId,
        tenantOrWorkspaceDigest: draft.binding.tenantOrWorkspaceDigest,
        accountOrPrincipalDigest: draft.binding.accountOrPrincipalDigest,
        sourceKind: draft.sourceKind,
        objectType: draft.objectType,
        sourceObjectId: draft.sourceObjectId,
    });
    const sourceIdentityDigest = taskMapContractDigest({
        sourceObjectKeyDigest,
        sourceRevision: draft.sourceRevision,
    });
    const envelopeId = stableId("tmsrc", {
        sourceIdentityDigest,
        eventTime: draft.eventTime,
        contentDigest: draft.contentDigest,
        authority: draft.authority,
        meetingIdentity: draft.meetingIdentity ?? null,
    });
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION,
        envelopeId,
        ownerScopeDigest: draft.ownerScopeDigest,
        sourceObjectKeyDigest,
        sourceIdentityDigest,
        binding: { ...draft.binding },
        sourceKind: draft.sourceKind,
        objectType: draft.objectType,
        sourceObjectId: draft.sourceObjectId,
        sourceRevision: draft.sourceRevision,
        eventTime: draft.eventTime,
        contentDigest: draft.contentDigest,
        authority: { ...draft.authority },
        ...(draft.meetingIdentity === undefined
            ? {}
            : { meetingIdentity: { ...draft.meetingIdentity } }),
        privacy: { ...PRIVACY },
    });
}
function canonicalGoogleDocumentId(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new Error("resolved Google Doc URL is invalid");
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== "docs.google.com") {
        throw new Error("resolved meeting-notes URL must use https://docs.google.com");
    }
    const match = /^\/document\/d\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(parsed.pathname);
    if (!match)
        throw new Error("resolved meeting-notes URL has no canonical document ID");
    return match[1];
}
function buildGeminiMeetSource(draft) {
    assertOnlyKeys(draft, GEMINI_KEYS, "Gemini Meet draft");
    if (!Array.isArray(draft.gmailDiscoveries)) {
        throw new Error("gmailDiscoveries must be an array");
    }
    const envelope = buildTaskMapSourceEnvelope({
        ownerScopeDigest: draft.ownerScopeDigest,
        binding: draft.binding,
        sourceKind: "gemini_meet",
        objectType: "meeting_note",
        sourceObjectId: draft.documentId,
        sourceRevision: draft.revisionId,
        eventTime: draft.eventTime,
        contentDigest: draft.contentDigest,
        authority: {
            evidence: "provider_generated_summary",
            quality: draft.quality,
            lifecycle: "none",
            completion: "none",
            rank: draft.quality === "degraded_summary" ? "context_only" : "candidate_only",
        },
        meetingIdentity: draft.meetingIdentity,
    });
    const discoveryPointers = draft.gmailDiscoveries.map((discovery) => {
        assertOnlyKeys(discovery, GMAIL_DISCOVERY_KEYS, "Gmail discovery");
        assertBinding(discovery.binding, "gmail");
        assertOpaque(discovery.opaqueMessageId, "opaqueMessageId");
        const documentId = canonicalGoogleDocumentId(discovery.resolvedDocumentUrl);
        if (documentId !== draft.documentId) {
            throw new Error("Gmail discovery must resolve to the Drive-owned document ID");
        }
        const pointer = {
            contractVersion: types_js_1.TASKMAP_DISCOVERY_POINTER_VERSION,
            discoveryId: stableId("tmdiscovery", {
                ownerScopeDigest: draft.ownerScopeDigest,
                connectionId: discovery.binding.connectionId,
                channel: discovery.channel,
                opaqueMessageId: discovery.opaqueMessageId,
                targetSourceIdentityDigest: envelope.sourceIdentityDigest,
            }),
            ownerScopeDigest: draft.ownerScopeDigest,
            binding: { ...discovery.binding },
            channel: discovery.channel,
            opaqueMessageId: discovery.opaqueMessageId,
            targetSourceKind: "gemini_meet",
            targetSourceObjectId: draft.documentId,
            targetSourceIdentityDigest: envelope.sourceIdentityDigest,
            resolvedTargetUrlDigest: taskMapContractDigest(discovery.resolvedDocumentUrl),
            duplicateContentSuppressed: true,
        };
        return pointer;
    }).sort((left, right) => left.discoveryId.localeCompare(right.discoveryId));
    return deepFreeze({ envelope, discoveryPointers });
}
function normalizeSourceEnvelope(envelope) {
    assertContractKeys(envelope, BUILT_ENVELOPE_KEYS, BUILT_ENVELOPE_REQUIRED_KEYS, "built source envelope");
    if (envelope.contractVersion !== types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION) {
        throw new Error("unsupported built source envelope version");
    }
    assertPrivacy(envelope.privacy);
    const rebuilt = buildTaskMapSourceEnvelope({
        ownerScopeDigest: envelope.ownerScopeDigest,
        binding: envelope.binding,
        sourceKind: envelope.sourceKind,
        objectType: envelope.objectType,
        sourceObjectId: envelope.sourceObjectId,
        sourceRevision: envelope.sourceRevision,
        eventTime: envelope.eventTime,
        contentDigest: envelope.contentDigest,
        authority: envelope.authority,
        ...(envelope.meetingIdentity === undefined
            ? {}
            : { meetingIdentity: envelope.meetingIdentity }),
    });
    if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(envelope)) {
        throw new Error("source envelope derived identity or privacy contract is invalid");
    }
    return rebuilt;
}
function normalizeDiscoveryPointer(pointer) {
    assertContractKeys(pointer, BUILT_DISCOVERY_KEYS, BUILT_DISCOVERY_KEYS, "built discovery pointer");
    if (pointer.contractVersion !== types_js_1.TASKMAP_DISCOVERY_POINTER_VERSION) {
        throw new Error("unsupported discovery pointer version");
    }
    assertDigest(pointer.ownerScopeDigest, "discovery ownerScopeDigest");
    assertBinding(pointer.binding);
    if (!["gmail_direct", "gmail_forwarded"].includes(pointer.channel)) {
        throw new Error("unsupported discovery channel");
    }
    assertOpaque(pointer.opaqueMessageId, "opaqueMessageId");
    if (pointer.targetSourceKind !== "gemini_meet") {
        throw new Error("Gmail discovery can only target Gemini Meet");
    }
    assertOpaque(pointer.targetSourceObjectId, "targetSourceObjectId");
    assertDigest(pointer.targetSourceIdentityDigest, "targetSourceIdentityDigest");
    assertDigest(pointer.resolvedTargetUrlDigest, "resolvedTargetUrlDigest");
    if (pointer.duplicateContentSuppressed !== true) {
        throw new Error("Gmail discovery content must remain suppressed");
    }
    const expectedId = stableId("tmdiscovery", {
        ownerScopeDigest: pointer.ownerScopeDigest,
        connectionId: pointer.binding.connectionId,
        channel: pointer.channel,
        opaqueMessageId: pointer.opaqueMessageId,
        targetSourceIdentityDigest: pointer.targetSourceIdentityDigest,
    });
    if (pointer.discoveryId !== expectedId) {
        throw new Error("discovery pointer derived identity is invalid");
    }
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_DISCOVERY_POINTER_VERSION,
        discoveryId: pointer.discoveryId,
        ownerScopeDigest: pointer.ownerScopeDigest,
        binding: { ...pointer.binding },
        channel: pointer.channel,
        opaqueMessageId: pointer.opaqueMessageId,
        targetSourceKind: "gemini_meet",
        targetSourceObjectId: pointer.targetSourceObjectId,
        targetSourceIdentityDigest: pointer.targetSourceIdentityDigest,
        resolvedTargetUrlDigest: pointer.resolvedTargetUrlDigest,
        duplicateContentSuppressed: true,
    });
}
function sameBinding(left, right) {
    return taskMapContractCanonicalJson(left) === taskMapContractCanonicalJson(right);
}
function assertWatermark(watermark) {
    assertContractKeys(watermark, WATERMARK_KEYS, WATERMARK_REQUIRED_KEYS, "connector watermark");
    if (!["revision", "cursor", "event_time", "composite"].includes(watermark.kind)) {
        throw new Error("unsupported connector watermark kind");
    }
    assertDigest(watermark.valueDigest, "watermark valueDigest");
    if (watermark.observedThrough !== undefined) {
        assertTimestamp(watermark.observedThrough, "watermark observedThrough");
    }
}
function advanceTaskMapConnectorCheckpoint(previous, poll) {
    if (previous)
        previous = normalizeConnectorCheckpoint(previous);
    assertBinding(poll.binding, poll.sourceKind);
    if (!VALID_SOURCE_KINDS.has(poll.sourceKind))
        throw new Error("unsupported checkpoint source kind");
    if (!["success", "partial", "failed"].includes(poll.state)) {
        throw new Error("unsupported connector poll state");
    }
    assertOpaque(poll.adapterVersion, "adapterVersion");
    assertTimestamp(poll.attemptedAt, "attemptedAt");
    assertBoundedRows(poll.capabilities, "connector capabilities");
    const capabilities = [...new Set(poll.capabilities)].sort();
    for (const capability of capabilities) {
        if (!VALID_CAPABILITIES.has(capability))
            throw new Error("unsupported connector capability");
    }
    if (previous) {
        if (!sameBinding(previous.binding, poll.binding) || previous.sourceKind !== poll.sourceKind) {
            throw new Error("checkpoint cannot cross a connection, tenant, principal, grant, or source");
        }
        if (previous.adapterVersion !== poll.adapterVersion) {
            throw new Error("checkpoint cannot cross an adapter version");
        }
        if (Date.parse(poll.attemptedAt) < Date.parse(previous.lastAttemptAt)) {
            throw new Error("checkpoint attempt time must be monotonic");
        }
    }
    let watermark;
    let watermarkHistoryDigests;
    let lastSuccessfulPollAt;
    let acceptedSourceIdentityDigests;
    let error;
    if (poll.state === "success") {
        if (!poll.proposedWatermark)
            throw new Error("successful polls require a watermark");
        if (poll.errorCode !== undefined || poll.errorDetailDigest !== undefined) {
            throw new Error("successful polls cannot carry an error");
        }
        assertWatermark(poll.proposedWatermark);
        if (previous?.watermark && previous.watermark.kind !== poll.proposedWatermark.kind) {
            throw new Error("watermark kind cannot change within one checkpoint lineage");
        }
        if (previous?.watermark?.observedThrough && !poll.proposedWatermark.observedThrough) {
            throw new Error("watermark observedThrough cannot be dropped");
        }
        if (previous?.watermark?.observedThrough
            && poll.proposedWatermark.observedThrough
            && Date.parse(poll.proposedWatermark.observedThrough)
                < Date.parse(previous.watermark.observedThrough)) {
            throw new Error("watermark observedThrough must be monotonic");
        }
        if (previous?.watermark
            && poll.proposedWatermark.valueDigest !== previous.watermark.valueDigest
            && previous.watermarkHistoryDigests.includes(poll.proposedWatermark.valueDigest)) {
            throw new Error("watermark value cannot roll back to an earlier checkpoint value");
        }
        watermark = { ...poll.proposedWatermark };
        watermarkHistoryDigests = [
            ...new Set([
                ...(previous?.watermarkHistoryDigests ?? []),
                poll.proposedWatermark.valueDigest,
            ]),
        ].sort();
        lastSuccessfulPollAt = poll.attemptedAt;
        acceptedSourceIdentityDigests = [
            ...new Set(poll.acceptedSourceIdentityDigests ?? []),
        ].sort();
        for (const digest of acceptedSourceIdentityDigests) {
            assertDigest(digest, "accepted source identity");
        }
    }
    else {
        if (!poll.errorCode || !poll.errorDetailDigest) {
            throw new Error("partial and failed polls require a bounded error code and digest");
        }
        assertOpaque(poll.errorCode, "checkpoint error code");
        assertDigest(poll.errorDetailDigest, "checkpoint error detailDigest");
        watermark = previous?.watermark ? { ...previous.watermark } : undefined;
        watermarkHistoryDigests = [...(previous?.watermarkHistoryDigests ?? [])];
        lastSuccessfulPollAt = previous?.lastSuccessfulPollAt;
        acceptedSourceIdentityDigests = [...(previous?.acceptedSourceIdentityDigests ?? [])];
        error = { code: poll.errorCode, detailDigest: poll.errorDetailDigest };
    }
    const checkpointCore = {
        binding: poll.binding,
        sourceKind: poll.sourceKind,
        adapterVersion: poll.adapterVersion,
        capabilities,
        state: poll.state,
        lastAttemptAt: poll.attemptedAt,
        lastSuccessfulPollAt,
        watermark,
        watermarkHistoryDigests,
        acceptedSourceIdentityDigests,
        error,
    };
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_CONNECTOR_CHECKPOINT_VERSION,
        checkpointId: stableId("tmcheckpoint", checkpointCore),
        binding: { ...poll.binding },
        sourceKind: poll.sourceKind,
        adapterVersion: poll.adapterVersion,
        capabilities,
        state: poll.state,
        lastAttemptAt: poll.attemptedAt,
        ...(lastSuccessfulPollAt === undefined ? {} : { lastSuccessfulPollAt }),
        ...(watermark === undefined ? {} : { watermark }),
        watermarkHistoryDigests,
        acceptedSourceIdentityDigests,
        ...(error === undefined ? {} : { error }),
    });
}
function normalizeConnectorCheckpoint(checkpoint) {
    assertContractKeys(checkpoint, CHECKPOINT_KEYS, CHECKPOINT_REQUIRED_KEYS, "connector checkpoint");
    if (checkpoint.contractVersion !== types_js_1.TASKMAP_CONNECTOR_CHECKPOINT_VERSION) {
        throw new Error("unsupported connector checkpoint version");
    }
    assertOpaque(checkpoint.checkpointId, "checkpointId");
    assertBinding(checkpoint.binding, checkpoint.sourceKind);
    if (!VALID_SOURCE_KINDS.has(checkpoint.sourceKind)) {
        throw new Error("unsupported checkpoint source kind");
    }
    assertOpaque(checkpoint.adapterVersion, "adapterVersion");
    if (!["success", "partial", "failed"].includes(checkpoint.state)) {
        throw new Error("unsupported connector checkpoint state");
    }
    assertTimestamp(checkpoint.lastAttemptAt, "lastAttemptAt");
    if (checkpoint.lastSuccessfulPollAt !== undefined) {
        assertTimestamp(checkpoint.lastSuccessfulPollAt, "lastSuccessfulPollAt");
        if (Date.parse(checkpoint.lastSuccessfulPollAt) > Date.parse(checkpoint.lastAttemptAt)) {
            throw new Error("lastSuccessfulPollAt cannot follow lastAttemptAt");
        }
    }
    assertBoundedRows(checkpoint.capabilities, "connector capabilities");
    const capabilities = [...new Set(checkpoint.capabilities)].sort();
    for (const capability of capabilities) {
        if (!VALID_CAPABILITIES.has(capability))
            throw new Error("unsupported connector capability");
    }
    if (checkpoint.watermark !== undefined) {
        assertWatermark(checkpoint.watermark);
    }
    assertBoundedRows(checkpoint.watermarkHistoryDigests, "watermark history");
    const watermarkHistoryDigests = [...new Set(checkpoint.watermarkHistoryDigests)].sort();
    for (const digest of watermarkHistoryDigests) {
        assertDigest(digest, "watermark history digest");
    }
    assertBoundedRows(checkpoint.acceptedSourceIdentityDigests, "accepted source identities");
    const acceptedSourceIdentityDigests = [
        ...new Set(checkpoint.acceptedSourceIdentityDigests),
    ].sort();
    for (const digest of acceptedSourceIdentityDigests) {
        assertDigest(digest, "accepted source identity");
    }
    if (checkpoint.error !== undefined) {
        assertContractKeys(checkpoint.error, CHECKPOINT_ERROR_KEYS, CHECKPOINT_ERROR_KEYS, "checkpoint error");
        assertOpaque(checkpoint.error.code, "checkpoint error code");
        assertDigest(checkpoint.error.detailDigest, "checkpoint error detailDigest");
    }
    if ((checkpoint.state === "success" && (!checkpoint.watermark
        || checkpoint.lastSuccessfulPollAt !== checkpoint.lastAttemptAt
        || checkpoint.error !== undefined))
        || (checkpoint.state !== "success" && checkpoint.error === undefined)
        || Boolean(checkpoint.watermark) !== Boolean(checkpoint.lastSuccessfulPollAt)
        || (!checkpoint.watermark && watermarkHistoryDigests.length > 0)
        || (checkpoint.watermark
            && !watermarkHistoryDigests.includes(checkpoint.watermark.valueDigest))) {
        throw new Error("connector checkpoint state fields are inconsistent");
    }
    const core = {
        binding: checkpoint.binding,
        sourceKind: checkpoint.sourceKind,
        adapterVersion: checkpoint.adapterVersion,
        capabilities,
        state: checkpoint.state,
        lastAttemptAt: checkpoint.lastAttemptAt,
        lastSuccessfulPollAt: checkpoint.lastSuccessfulPollAt,
        watermark: checkpoint.watermark,
        watermarkHistoryDigests,
        acceptedSourceIdentityDigests,
        error: checkpoint.error,
    };
    const expectedId = stableId("tmcheckpoint", core);
    if (checkpoint.checkpointId !== expectedId) {
        throw new Error("connector checkpoint derived identity is invalid");
    }
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_CONNECTOR_CHECKPOINT_VERSION,
        checkpointId: checkpoint.checkpointId,
        binding: { ...checkpoint.binding },
        sourceKind: checkpoint.sourceKind,
        adapterVersion: checkpoint.adapterVersion,
        capabilities,
        state: checkpoint.state,
        lastAttemptAt: checkpoint.lastAttemptAt,
        ...(checkpoint.lastSuccessfulPollAt === undefined
            ? {}
            : { lastSuccessfulPollAt: checkpoint.lastSuccessfulPollAt }),
        ...(checkpoint.watermark === undefined ? {} : { watermark: { ...checkpoint.watermark } }),
        watermarkHistoryDigests,
        acceptedSourceIdentityDigests,
        ...(checkpoint.error === undefined ? {} : { error: { ...checkpoint.error } }),
    });
}
function assertTaskMapConnectorCheckpoint(checkpoint) {
    return normalizeConnectorCheckpoint(checkpoint);
}
function meetingFingerprint(ownerScopeDigest, hint) {
    return taskMapContractDigest({
        ownerScopeDigest,
        fingerprintVersion: hint.fingerprintVersion,
        startAt: new Date(hint.startAt).toISOString(),
        normalizedTitleDigest: hint.normalizedTitleDigest,
        participantSetDigest: hint.participantSetDigest,
    });
}
function fallbackIdentityKeyDigest(fingerprintDigest) {
    return taskMapContractDigest(`fingerprint:${fingerprintDigest}`);
}
function canonicalMeetingId(identityKeyDigest) {
    return stableId("tmmeeting", { identityKeyDigest });
}
function normalizePriorCanonicalMeeting(meeting) {
    assertContractKeys(meeting, CANONICAL_MEETING_KEYS, CANONICAL_MEETING_KEYS, "prior canonical meeting");
    if (meeting.contractVersion !== types_js_1.TASKMAP_CANONICAL_MEETING_VERSION) {
        throw new Error("unsupported prior canonical meeting version");
    }
    if (!["calendar_event", "bounded_fingerprint"].includes(meeting.identityMethod)) {
        throw new Error("unsupported prior canonical meeting identity method");
    }
    assertDigest(meeting.identityKeyDigest, "prior meeting identityKeyDigest");
    assertDigest(meeting.fingerprintDigest, "prior meeting fingerprintDigest");
    assertTimestamp(meeting.startAt, "prior meeting startAt");
    if (!["resolved", "needs_review"].includes(meeting.reviewState)) {
        throw new Error("unsupported prior canonical meeting review state");
    }
    const identityAliases = [...new Set(meeting.identityAliases)].sort();
    for (const alias of identityAliases)
        assertDigest(alias, "prior meeting identity alias");
    if (!identityAliases.includes(meeting.identityKeyDigest)
        || !identityAliases.includes(meeting.fingerprintDigest)) {
        throw new Error("prior canonical meeting aliases are incomplete");
    }
    const conflictCodes = [...new Set(meeting.conflictCodes)].sort();
    const calendarEnvelopeIds = [...new Set(meeting.calendarEnvelopeIds)].sort();
    const evidenceVariantEnvelopeIds = [...new Set(meeting.evidenceVariantEnvelopeIds)].sort();
    for (const code of conflictCodes)
        assertOpaque(code, "prior meeting conflict code");
    for (const id of calendarEnvelopeIds)
        assertOpaque(id, "prior Calendar envelope ID");
    for (const id of evidenceVariantEnvelopeIds)
        assertOpaque(id, "prior evidence envelope ID");
    if (meeting.identityMethod === "bounded_fingerprint"
        && meeting.identityKeyDigest !== fallbackIdentityKeyDigest(meeting.fingerprintDigest)) {
        throw new Error("prior bounded meeting identity is not derived from its fingerprint");
    }
    if (meeting.canonicalMeetingId !== canonicalMeetingId(meeting.identityKeyDigest)) {
        throw new Error("prior canonical meeting ID is not derived from its identity key");
    }
    const normalized = {
        contractVersion: types_js_1.TASKMAP_CANONICAL_MEETING_VERSION,
        canonicalMeetingId: meeting.canonicalMeetingId,
        identityMethod: meeting.identityMethod,
        identityKeyDigest: meeting.identityKeyDigest,
        identityAliases,
        fingerprintDigest: meeting.fingerprintDigest,
        startAt: new Date(meeting.startAt).toISOString(),
        reviewState: meeting.reviewState,
        conflictCodes,
        calendarEnvelopeIds,
        evidenceVariantEnvelopeIds,
    };
    if (taskMapContractCanonicalJson(normalized) !== taskMapContractCanonicalJson(meeting)) {
        throw new Error("prior canonical meeting is not canonical");
    }
    return deepFreeze(normalized);
}
function canonicalizeTaskMapMeetings(envelopes, previousMeetings = []) {
    assertBoundedRows(envelopes, "meeting envelopes");
    assertBoundedRows(previousMeetings, "prior canonical meetings");
    const normalizedPreviousMeetings = previousMeetings.map(normalizePriorCanonicalMeeting);
    const meetingEnvelopes = envelopes.filter((envelope) => (envelope.objectType === "meeting_note" || envelope.objectType === "calendar_event"));
    for (const envelope of meetingEnvelopes) {
        if (!envelope.meetingIdentity)
            throw new Error("meeting envelope lacks an identity hint");
    }
    const calendarKeysByFingerprint = new Map();
    for (const envelope of meetingEnvelopes) {
        const hint = envelope.meetingIdentity;
        const fingerprint = meetingFingerprint(envelope.ownerScopeDigest, hint);
        if (hint.calendarEventIdDigest) {
            const keys = calendarKeysByFingerprint.get(fingerprint) ?? new Set();
            keys.add(`${envelope.ownerScopeDigest}:${hint.calendarEventIdDigest}`);
            calendarKeysByFingerprint.set(fingerprint, keys);
        }
    }
    const groups = new Map();
    for (const envelope of meetingEnvelopes) {
        const hint = envelope.meetingIdentity;
        const fingerprint = meetingFingerprint(envelope.ownerScopeDigest, hint);
        const calendarKeys = calendarKeysByFingerprint.get(fingerprint);
        const uniqueCalendarKey = calendarKeys?.size === 1
            ? [...calendarKeys][0]
            : undefined;
        const key = hint.calendarEventIdDigest
            ? `calendar:${envelope.ownerScopeDigest}:${hint.calendarEventIdDigest}`
            : uniqueCalendarKey
                ? `calendar:${uniqueCalendarKey}`
                : `fingerprint:${fingerprint}`;
        groups.set(key, [...(groups.get(key) ?? []), envelope]);
    }
    const canonical = [...groups.entries()].map(([key, variants]) => {
        variants.sort((left, right) => left.envelopeId.localeCompare(right.envelopeId));
        const fingerprintDigests = [...new Set(variants.map((variant) => (meetingFingerprint(variant.ownerScopeDigest, variant.meetingIdentity))))].sort();
        const fingerprintDigest = fingerprintDigests[0];
        const calendarEventIdDigest = key.startsWith("calendar:")
            ? key.split(":").at(-1)
            : undefined;
        const identityKeyDigest = taskMapContractDigest(key);
        const fallbackIdentityKeys = fingerprintDigests.map(fallbackIdentityKeyDigest);
        const conflictingCalendarKeys = Math.max(...fingerprintDigests.map((fingerprint) => (calendarKeysByFingerprint.get(fingerprint)?.size ?? 0)));
        const reviewState = conflictingCalendarKeys > 1
            ? "needs_review"
            : "resolved";
        const conflictCodes = [
            ...(conflictingCalendarKeys > 1 ? ["conflicting_calendar_identity"] : []),
            ...(calendarEventIdDigest && fingerprintDigests.length > 1
                ? ["fallback_metadata_disagreement"]
                : []),
        ];
        const reusablePriorIds = new Set(normalizedPreviousMeetings
            .filter((meeting) => (meeting.identityMethod === "bounded_fingerprint"
            && meeting.reviewState === "resolved"
            && fallbackIdentityKeys.includes(meeting.identityKeyDigest)))
            .map((meeting) => meeting.canonicalMeetingId));
        const resolvedCanonicalMeetingId = reusablePriorIds.size === 1
            ? [...reusablePriorIds][0]
            : canonicalMeetingId(identityKeyDigest);
        const aliases = new Set([
            identityKeyDigest,
            ...fingerprintDigests,
            ...fallbackIdentityKeys,
        ]);
        const primaryVariant = variants.find((variant) => variant.objectType === "calendar_event")
            ?? variants[0];
        return {
            contractVersion: types_js_1.TASKMAP_CANONICAL_MEETING_VERSION,
            canonicalMeetingId: resolvedCanonicalMeetingId,
            identityMethod: calendarEventIdDigest
                ? "calendar_event"
                : "bounded_fingerprint",
            identityKeyDigest,
            identityAliases: [...aliases].sort(),
            fingerprintDigest,
            startAt: new Date(primaryVariant.meetingIdentity.startAt).toISOString(),
            reviewState,
            conflictCodes,
            calendarEnvelopeIds: variants
                .filter((variant) => variant.objectType === "calendar_event")
                .map((variant) => variant.envelopeId)
                .sort(),
            evidenceVariantEnvelopeIds: variants
                .filter((variant) => variant.objectType === "meeting_note")
                .map((variant) => variant.envelopeId)
                .sort(),
        };
    }).sort((left, right) => left.canonicalMeetingId.localeCompare(right.canonicalMeetingId));
    return deepFreeze(canonical);
}
function uniqueById(values, id, label) {
    const rows = new Map();
    for (const value of values) {
        const key = id(value);
        const current = rows.get(key);
        if (current && taskMapContractCanonicalJson(current) !== taskMapContractCanonicalJson(value)) {
            throw new Error(`${label} reuses an ID for different content`);
        }
        rows.set(key, value);
    }
    return [...rows.values()].sort((left, right) => id(left).localeCompare(id(right)));
}
function buildTaskMapSourceSnapshot(envelopesInput, discoveryInput, previousMeetings = []) {
    assertBoundedRows(envelopesInput, "source envelopes");
    assertBoundedRows(discoveryInput, "discovery pointers");
    if (envelopesInput.length === 0)
        throw new Error("source snapshot requires at least one envelope");
    const envelopes = uniqueById(envelopesInput.map(normalizeSourceEnvelope), (row) => row.envelopeId, "source envelope");
    const ownerScopes = new Set(envelopes.map((envelope) => envelope.ownerScopeDigest));
    if (ownerScopes.size !== 1) {
        throw new Error("one source snapshot cannot cross owner dedupe scopes");
    }
    const ownerScopeDigest = [...ownerScopes][0];
    const objectRevisionOwners = new Map();
    for (const envelope of envelopes) {
        const current = objectRevisionOwners.get(envelope.sourceIdentityDigest);
        if (current && current !== envelope.envelopeId) {
            throw new Error("one source revision cannot produce multiple immutable envelopes");
        }
        objectRevisionOwners.set(envelope.sourceIdentityDigest, envelope.envelopeId);
    }
    const discoveryPointers = uniqueById(discoveryInput.map(normalizeDiscoveryPointer), (row) => row.discoveryId, "discovery pointer");
    for (const pointer of discoveryPointers) {
        const target = envelopes.find((envelope) => (envelope.sourceIdentityDigest === pointer.targetSourceIdentityDigest));
        if (!target) {
            throw new Error("discovery pointer target is absent from the source snapshot");
        }
        if (pointer.ownerScopeDigest !== ownerScopeDigest
            || target.ownerScopeDigest !== pointer.ownerScopeDigest
            || target.sourceKind !== pointer.targetSourceKind
            || target.sourceObjectId !== pointer.targetSourceObjectId) {
            throw new Error("discovery pointer cannot cross owner scope or source identity");
        }
    }
    const canonicalMeetings = canonicalizeTaskMapMeetings(envelopes, previousMeetings);
    const meetingEnvelopeIds = new Set(canonicalMeetings.flatMap((meeting) => [
        ...meeting.calendarEnvelopeIds,
        ...meeting.evidenceVariantEnvelopeIds,
    ]));
    const unbarrieredMeeting = envelopes.find((envelope) => (["meeting_note", "calendar_event"].includes(envelope.objectType)
        && !meetingEnvelopeIds.has(envelope.envelopeId)));
    if (unbarrieredMeeting)
        throw new Error("meeting evidence cannot bypass canonical identity");
    const sourceSnapshotDigest = taskMapContractDigest({
        ownerScopeDigest,
        envelopes,
        discoveryPointers,
        canonicalMeetings,
    });
    const standaloneEvidence = envelopes
        .filter((envelope) => (envelope.objectType !== "body_context"
        && !meetingEnvelopeIds.has(envelope.envelopeId)))
        .map((envelope) => ({
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        objectType: envelope.objectType,
        eventTime: envelope.eventTime,
        contentDigest: envelope.contentDigest,
        authority: envelope.authority,
    }));
    const canonicalMeetingEvidence = canonicalMeetings.map((meeting) => ({
        canonicalMeetingId: meeting.canonicalMeetingId,
        startAt: meeting.startAt,
        reviewState: meeting.reviewState,
        variants: meeting.evidenceVariantEnvelopeIds.map((envelopeId) => {
            const envelope = envelopes.find((candidate) => candidate.envelopeId === envelopeId);
            return {
                sourceKind: envelope.sourceKind,
                sourceIdentityDigest: envelope.sourceIdentityDigest,
                contentDigest: envelope.contentDigest,
                authority: envelope.authority,
            };
        }).sort((left, right) => left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)),
        calendarEvidence: meeting.calendarEnvelopeIds.map((envelopeId) => {
            const envelope = envelopes.find((candidate) => candidate.envelopeId === envelopeId);
            return {
                sourceKind: envelope.sourceKind,
                sourceIdentityDigest: envelope.sourceIdentityDigest,
                eventTime: envelope.eventTime,
                contentDigest: envelope.contentDigest,
                authority: envelope.authority,
                meetingIdentity: envelope.meetingIdentity,
            };
        }).sort((left, right) => left.sourceIdentityDigest.localeCompare(right.sourceIdentityDigest)),
    }));
    const semanticInputDigest = taskMapContractDigest({
        ownerScopeDigest,
        standaloneEvidence,
        canonicalMeetingEvidence,
    });
    const bodyContextDigest = taskMapContractDigest(envelopes
        .filter((envelope) => envelope.objectType === "body_context")
        .map((envelope) => ({
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        eventTime: envelope.eventTime,
        contentDigest: envelope.contentDigest,
    })));
    const discoveryProvenanceDigest = taskMapContractDigest(discoveryPointers);
    const snapshot = {
        contractVersion: types_js_1.TASKMAP_SOURCE_SNAPSHOT_VERSION,
        snapshotId: stableId("tmsnapshot", sourceSnapshotDigest),
        ownerScopeDigest,
        sourceSnapshotDigest,
        semanticInputDigest,
        bodyContextDigest,
        discoveryProvenanceDigest,
        envelopes,
        discoveryPointers,
        canonicalMeetings,
        privacy: { ...PRIVACY },
    };
    assertBoundedArtifact(snapshot, "source snapshot");
    return deepFreeze(snapshot);
}
function canonicalMeetingWithoutId(meeting) {
    const { canonicalMeetingId: _canonicalMeetingId, ...rest } = meeting;
    return rest;
}
function currentEvidenceContinuityProofs(storedMeetings, baselineMeetings, envelopes) {
    assertBoundedRows(storedMeetings, "stored canonical meetings");
    if (storedMeetings.length !== baselineMeetings.length) {
        throw new Error("source snapshot canonical meeting count is invalid");
    }
    const storedByIdentityKey = new Map();
    for (const stored of storedMeetings) {
        assertContractKeys(stored, CANONICAL_MEETING_KEYS, CANONICAL_MEETING_KEYS, "stored canonical meeting");
        assertDigest(stored.identityKeyDigest, "stored meeting identityKeyDigest");
        if (storedByIdentityKey.has(stored.identityKeyDigest)) {
            throw new Error("source snapshot repeats a canonical meeting identity");
        }
        storedByIdentityKey.set(stored.identityKeyDigest, stored);
    }
    const proofs = [];
    for (const baseline of baselineMeetings) {
        const stored = storedByIdentityKey.get(baseline.identityKeyDigest);
        if (!stored
            || taskMapContractCanonicalJson(canonicalMeetingWithoutId(stored))
                !== taskMapContractCanonicalJson(canonicalMeetingWithoutId(baseline))) {
            throw new Error("source snapshot canonical meeting evidence is invalid");
        }
        if (stored.canonicalMeetingId === baseline.canonicalMeetingId)
            continue;
        const currentEnvelopeIds = new Set([
            ...baseline.calendarEnvelopeIds,
            ...baseline.evidenceVariantEnvelopeIds,
        ]);
        const currentFingerprints = [...new Set(envelopes
                .filter((envelope) => currentEnvelopeIds.has(envelope.envelopeId))
                .map((envelope) => meetingFingerprint(envelope.ownerScopeDigest, envelope.meetingIdentity)))].sort();
        const matchingFallbacks = currentFingerprints
            .map((fingerprintDigest) => ({
            fingerprintDigest,
            identityKeyDigest: fallbackIdentityKeyDigest(fingerprintDigest),
        }))
            .filter(({ identityKeyDigest }) => (canonicalMeetingId(identityKeyDigest) === stored.canonicalMeetingId));
        if (matchingFallbacks.length !== 1) {
            throw new Error("source snapshot canonical meeting ID lacks current evidence lineage");
        }
        const match = matchingFallbacks[0];
        proofs.push({
            contractVersion: types_js_1.TASKMAP_CANONICAL_MEETING_VERSION,
            canonicalMeetingId: canonicalMeetingId(match.identityKeyDigest),
            identityMethod: "bounded_fingerprint",
            identityKeyDigest: match.identityKeyDigest,
            identityAliases: [match.fingerprintDigest, match.identityKeyDigest].sort(),
            fingerprintDigest: match.fingerprintDigest,
            startAt: baseline.startAt,
            reviewState: "resolved",
            conflictCodes: [],
            calendarEnvelopeIds: [],
            evidenceVariantEnvelopeIds: [],
        });
    }
    return proofs;
}
function normalizeSourceSnapshotArtifact(snapshot) {
    assertContractKeys(snapshot, SOURCE_SNAPSHOT_KEYS, SOURCE_SNAPSHOT_KEYS, "source snapshot");
    if (snapshot.contractVersion !== types_js_1.TASKMAP_SOURCE_SNAPSHOT_VERSION) {
        throw new Error("unsupported source snapshot version");
    }
    assertOpaque(snapshot.snapshotId, "source snapshotId");
    assertDigest(snapshot.ownerScopeDigest, "source snapshot ownerScopeDigest");
    assertDigest(snapshot.sourceSnapshotDigest, "source snapshot digest");
    assertDigest(snapshot.semanticInputDigest, "source semanticInputDigest");
    assertDigest(snapshot.bodyContextDigest, "source bodyContextDigest");
    assertDigest(snapshot.discoveryProvenanceDigest, "source discoveryProvenanceDigest");
    assertPrivacy(snapshot.privacy);
    const baseline = buildTaskMapSourceSnapshot(snapshot.envelopes, snapshot.discoveryPointers);
    const continuityProofs = currentEvidenceContinuityProofs(snapshot.canonicalMeetings, baseline.canonicalMeetings, baseline.envelopes);
    const rebuilt = continuityProofs.length === 0
        ? baseline
        : buildTaskMapSourceSnapshot(snapshot.envelopes, snapshot.discoveryPointers, continuityProofs);
    if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(snapshot)) {
        throw new Error("source snapshot derived digests or identity are invalid");
    }
    return rebuilt;
}
function assertTaskMapSourceSnapshot(snapshot) {
    return normalizeSourceSnapshotArtifact(snapshot);
}
function sortedUniqueOpaque(values, label) {
    const sorted = [...new Set(values)].sort();
    for (const value of sorted)
        assertOpaque(value, label);
    return sorted;
}
function buildTaskMapSemanticProposalReference(draft) {
    assertOnlyKeys(draft, SEMANTIC_REFERENCE_KEYS, "semantic proposal reference");
    const snapshot = normalizeSourceSnapshotArtifact(draft.sourceSnapshot);
    assertOnlyKeys(draft.semanticBrainArtifact, SEMANTIC_BRAIN_ARTIFACT_KEYS, "semantic brain artifact");
    assertDigest(draft.semanticBrainArtifact.sourceSemanticInputDigest, "sourceSemanticInputDigest");
    assertSemanticBrainAttestation(draft.semanticBrainArtifact, draft.semanticBrainAttestationKey);
    if (draft.semanticBrainArtifact.sourceSemanticInputDigest !== snapshot.semanticInputDigest) {
        throw new Error("semantic brain artifact is stale for the source snapshot");
    }
    const brain = draft.semanticBrainArtifact.brain;
    assertPlainObject(brain, "semantic brain artifact");
    if (brain.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION) {
        throw new Error("semantic brain artifact uses an unsupported contract");
    }
    assertDigest(brain.inputDigest, "semantic brain inputDigest");
    assertTimestamp(brain.generatedAt, "semantic brain generatedAt");
    assertBoundedRows(brain.roots, "semantic brain roots");
    assertBoundedRows(brain.tasks, "semantic brain candidates");
    assertBoundedRows(brain.edges, "semantic brain relations");
    assertBoundedArtifact(brain, "semantic brain artifact");
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION,
        semanticInputDigest: snapshot.semanticInputDigest,
        semanticBrainDigest: taskMapContractDigest({
            sourceSemanticInputDigest: snapshot.semanticInputDigest,
            attestationKeyId: draft.semanticBrainArtifact.attestationKeyId,
            attestationMac: draft.semanticBrainArtifact.attestationMac,
            brainArtifactDigest: taskMapContractDigest(brain),
        }),
        rootProposalIds: sortedUniqueOpaque(brain.roots.map((root) => root.proposalId), "root proposal ID"),
        candidateProposalIds: sortedUniqueOpaque(brain.tasks.map((task) => task.proposalId), "candidate proposal ID"),
        relationProposalIds: sortedUniqueOpaque(brain.edges.map((edge) => edge.proposalId), "relation proposal ID"),
    });
}
function normalizeSemanticProposalReference(proposal) {
    assertOnlyKeys(proposal, BUILT_SEMANTIC_REFERENCE_KEYS, "built semantic proposal reference");
    if (proposal.contractVersion !== types_js_1.TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION) {
        throw new Error("unsupported semantic proposal reference version");
    }
    assertDigest(proposal.semanticInputDigest, "semanticInputDigest");
    assertDigest(proposal.semanticBrainDigest, "semanticBrainDigest");
    const normalized = {
        contractVersion: types_js_1.TASKMAP_SEMANTIC_PROPOSAL_REFERENCE_VERSION,
        semanticInputDigest: proposal.semanticInputDigest,
        semanticBrainDigest: proposal.semanticBrainDigest,
        rootProposalIds: sortedUniqueOpaque(proposal.rootProposalIds, "root proposal ID"),
        candidateProposalIds: sortedUniqueOpaque(proposal.candidateProposalIds, "candidate proposal ID"),
        relationProposalIds: sortedUniqueOpaque(proposal.relationProposalIds, "relation proposal ID"),
    };
    if (taskMapContractCanonicalJson(normalized) !== taskMapContractCanonicalJson(proposal)) {
        throw new Error("semantic proposal reference is not canonical");
    }
    return deepFreeze(normalized);
}
function assertTaskMapSemanticProposalCurrent(snapshot, proposal) {
    const normalizedSnapshot = normalizeSourceSnapshotArtifact(snapshot);
    const normalizedProposal = normalizeSemanticProposalReference(proposal);
    if (normalizedProposal.semanticInputDigest !== normalizedSnapshot.semanticInputDigest) {
        throw new Error("semantic brain is stale for the canonical non-body evidence snapshot");
    }
}
function buildTaskMapGateDecision(draft) {
    assertOnlyKeys(draft, GATE_DECISION_KEYS, "gate decision");
    assertOpaque(draft.subjectId, "gate decision subjectId");
    if (!VALID_GATES.has(draft.gate))
        throw new Error("unsupported deterministic gate");
    if (!VALID_GATE_OUTCOMES.has(draft.outcome))
        throw new Error("unsupported gate outcome");
    const reasonCodes = sortedUniqueOpaque(draft.reasonCodes, "gate reason code");
    const core = {
        subjectId: draft.subjectId,
        gate: draft.gate,
        outcome: draft.outcome,
        reasonCodes,
    };
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_GATE_DECISION_VERSION,
        decisionId: stableId("tmdecision", core),
        ...core,
    });
}
function normalizeGateDecision(decision) {
    assertOnlyKeys(decision, BUILT_GATE_DECISION_KEYS, "built gate decision");
    if (decision.contractVersion !== types_js_1.TASKMAP_GATE_DECISION_VERSION) {
        throw new Error("unsupported gate decision version");
    }
    const rebuilt = buildTaskMapGateDecision({
        subjectId: decision.subjectId,
        gate: decision.gate,
        outcome: decision.outcome,
        reasonCodes: decision.reasonCodes,
    });
    if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(decision)) {
        throw new Error("gate decision derived identity is invalid");
    }
    return rebuilt;
}
function assertProjectionArtifact(projection, label) {
    assertOnlyKeys(projection, PROJECTION_KEYS, label);
    if (projection.contractVersion !== types_js_1.TASKMAP_CONTRACT_VERSION
        || projection.algorithmPolicyVersion !== types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION) {
        throw new Error(`${label} uses an unsupported contract or algorithm policy`);
    }
    assertDigest(projection.algorithmPolicyDigest, `${label} algorithmPolicyDigest`);
    if (!["accepted", "rejected"].includes(projection.runStatus)) {
        throw new Error(`${label} has an unsupported run status`);
    }
    if (!["E0", "E1", "E2", "E3", "E4"].includes(projection.arm)) {
        throw new Error(`${label} has an unsupported experiment arm`);
    }
    assertOpaque(projection.runId, `${label} runId`);
    assertTimestamp(projection.generatedAt, `${label} generatedAt`);
    assertDigest(projection.inputDigest, `${label} inputDigest`);
    if (projection.brain) {
        assertOnlyKeys(projection.brain, PROJECTION_BRAIN_KEYS, `${label} brain`);
        assertOpaque(projection.brain.provider, `${label} brain provider`);
        assertOpaque(projection.brain.model, `${label} brain model`);
        assertOpaque(projection.brain.promptHash, `${label} brain promptHash`);
        assertDigest(projection.brain.outputDigest, `${label} brain outputDigest`);
    }
    assertOnlyKeys(projection.privacy, PROJECTION_PRIVACY_KEYS, `${label} privacy`);
    if (projection.privacy.sourceBodiesStored !== false
        || projection.privacy.localPathsStored !== false
        || projection.privacy.rawBiometricsStored !== false) {
        throw new Error(`${label} privacy contract is invalid`);
    }
    for (const [rows, rowLabel] of [
        [projection.sources, "source"],
        [projection.roots, "root"],
        [projection.tasks, "task"],
        [projection.edges, "edge"],
    ]) {
        assertBoundedRows(rows, `${label} ${rowLabel}s`);
        for (const row of rows)
            assertOpaque(row.id, `${label} ${rowLabel} id`);
    }
    assertBoundedRows(projection.rejections, `${label} rejections`);
    for (const rejection of projection.rejections) {
        assertOpaque(rejection.proposalId, `${label} rejection proposalId`);
    }
    assertBoundedArtifact(projection, label);
    const harnessValidationReasons = (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection);
    if (harnessValidationReasons.length > 0) {
        throw new Error(`${label} fails Task Map projection schema/privacy validation: ${harnessValidationReasons.join("; ")}`);
    }
}
function projectionRows(projection) {
    const rows = [
        ...projection.sources.map((value) => ({ kind: "source", id: value.id, value })),
        ...projection.roots.map((value) => ({ kind: "root", id: value.id, value })),
        ...projection.tasks.map((value) => ({ kind: "task", id: value.id, value })),
        ...projection.edges.map((value) => ({ kind: "edge", id: value.id, value })),
        ...projection.rejections.map((value) => ({
            kind: "rejection",
            id: `${value.kind}:${value.proposalId}`,
            value,
        })),
    ];
    return rows.sort((left, right) => (left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)));
}
function projectionRowMap(projection) {
    const rows = new Map();
    for (const row of projectionRows(projection)) {
        const key = `${row.kind}:${row.id}`;
        if (rows.has(key))
            throw new Error("projection contains duplicate diff identities");
        rows.set(key, row);
    }
    return rows;
}
function projectionDigest(projection) {
    if (projection === null)
        return taskMapContractDigest(null);
    const { sources: _sources, roots: _roots, tasks: _tasks, edges: _edges, rejections: _rejections, ...metadata } = projection;
    return taskMapContractDigest({
        metadata,
        rows: projectionRows(projection),
    });
}
function changedFields(beforeValue, afterValue) {
    const before = beforeValue;
    const after = afterValue;
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((key) => (taskMapContractCanonicalJson(before[key]) !== taskMapContractCanonicalJson(after[key])))
        .sort();
}
function diffTaskMapProjections(previous, current) {
    if (previous)
        assertProjectionArtifact(previous, "previous projection");
    assertProjectionArtifact(current, "current projection");
    const previousProjectionDigest = projectionDigest(previous);
    const currentProjectionDigest = projectionDigest(current);
    const before = previous ? projectionRowMap(previous) : new Map();
    const after = projectionRowMap(current);
    const added = [];
    const removed = [];
    const changed = [];
    for (const [key, row] of after) {
        const prior = before.get(key);
        if (!prior) {
            added.push({
                kind: row.kind,
                id: row.id,
                afterDigest: taskMapContractDigest(row.value),
                changedFields: [],
            });
            continue;
        }
        const fields = changedFields(prior.value, row.value);
        if (fields.length > 0) {
            changed.push({
                kind: row.kind,
                id: row.id,
                beforeDigest: taskMapContractDigest(prior.value),
                afterDigest: taskMapContractDigest(row.value),
                changedFields: fields,
            });
        }
    }
    for (const [key, row] of before) {
        if (!after.has(key)) {
            removed.push({
                kind: row.kind,
                id: row.id,
                beforeDigest: taskMapContractDigest(row.value),
                changedFields: [],
            });
        }
    }
    const sortEntries = (values) => values.sort((left, right) => (left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)));
    const core = {
        previousProjectionDigest,
        currentProjectionDigest,
        added: sortEntries(added),
        removed: sortEntries(removed),
        changed: sortEntries(changed),
    };
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_PROJECTION_DIFF_VERSION,
        diffId: stableId("tmdiff", core),
        ...core,
    });
}
function buildTaskMapProjectionTarget(draft) {
    assertOnlyKeys(draft, PROJECTION_TARGET_DRAFT_KEYS, "projection target draft");
    if (!["strategy", "task_map"].includes(draft.target)) {
        throw new Error("unsupported projection target");
    }
    assertDigest(draft.acceptedDeltaDigest, "acceptedDeltaDigest");
    assertBoundedRows(draft.records, "projection target records");
    const records = uniqueById(draft.records.map((record) => {
        assertOnlyKeys(record, PROJECTION_TARGET_RECORD_KEYS, "projection target record");
        return { ...record };
    }), (record) => record.canonicalRecordId, "projection target record");
    for (const record of records) {
        assertOpaque(record.canonicalRecordId, "canonicalRecordId");
        assertDigest(record.sourceIdentityDigest, "projection sourceIdentityDigest");
        assertDigest(record.recordDigest, "projection recordDigest");
        if (!["candidate", "accepted_open", "resolved"].includes(record.lifecycle)) {
            throw new Error("unsupported projection lifecycle");
        }
        const strategyRole = record.role === "shared_accepted_work"
            || record.role === "strategy_durable_context";
        const taskMapRole = record.role === "shared_accepted_work"
            || record.role === "taskmap_candidate_review"
            || record.role === "taskmap_operational_detail";
        if ((draft.target === "strategy" && !strategyRole)
            || (draft.target === "task_map" && !taskMapRole)) {
            throw new Error(`${record.role} is incompatible with the ${draft.target} projection`);
        }
        if ((record.role === "shared_accepted_work"
            || record.role === "strategy_durable_context"
            || record.role === "taskmap_operational_detail")
            && record.lifecycle === "candidate") {
            throw new Error(`${record.role} cannot use candidate lifecycle`);
        }
        if (record.role === "taskmap_candidate_review" && record.lifecycle !== "candidate") {
            throw new Error("taskmap_candidate_review requires candidate lifecycle");
        }
    }
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_PROJECTION_TARGET_VERSION,
        target: draft.target,
        acceptedDeltaDigest: draft.acceptedDeltaDigest,
        records,
        privacy: {
            sourceBodiesStored: false,
            strategyProseStored: false,
            localPathsStored: false,
        },
    });
}
function normalizeProjectionTarget(target) {
    assertOnlyKeys(target, PROJECTION_TARGET_KEYS, "built projection target");
    if (target.contractVersion !== types_js_1.TASKMAP_PROJECTION_TARGET_VERSION) {
        throw new Error("unsupported projection target version");
    }
    assertOnlyKeys(target.privacy, PROJECTION_TARGET_PRIVACY_KEYS, "projection target privacy");
    if (target.privacy.sourceBodiesStored !== false
        || target.privacy.strategyProseStored !== false
        || target.privacy.localPathsStored !== false) {
        throw new Error("projection target privacy contract is invalid");
    }
    const rebuilt = buildTaskMapProjectionTarget({
        target: target.target,
        acceptedDeltaDigest: target.acceptedDeltaDigest,
        records: target.records,
    });
    if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(target)) {
        throw new Error("projection target is not canonical");
    }
    return rebuilt;
}
function parityFinding(canonicalRecordId, code) {
    return { canonicalRecordId, code };
}
function compareTaskMapProjectionTargets(strategy, taskMap) {
    strategy = normalizeProjectionTarget(strategy);
    taskMap = normalizeProjectionTarget(taskMap);
    if (strategy.target !== "strategy" || taskMap.target !== "task_map") {
        throw new Error("projection parity requires Strategy and Task Map targets");
    }
    const sameDelta = strategy.acceptedDeltaDigest === taskMap.acceptedDeltaDigest;
    const acceptedDeltaDigest = sameDelta
        ? strategy.acceptedDeltaDigest
        : taskMapContractDigest([strategy.acceptedDeltaDigest, taskMap.acceptedDeltaDigest].sort());
    const strategyRows = new Map(strategy.records.map((record) => [record.canonicalRecordId, record]));
    const taskMapRows = new Map(taskMap.records.map((record) => [record.canonicalRecordId, record]));
    const intentionalDifferences = [];
    const failures = [];
    if (!sameDelta)
        failures.push(parityFinding("accepted-delta", "accepted_delta_mismatch"));
    for (const record of strategy.records) {
        const operational = taskMapRows.get(record.canonicalRecordId);
        if (!operational) {
            if (record.role === "strategy_durable_context") {
                intentionalDifferences.push(parityFinding(record.canonicalRecordId, "strategy_durable_context_only"));
            }
            else if (record.role === "shared_accepted_work") {
                failures.push(parityFinding(record.canonicalRecordId, "shared_work_missing_task_map"));
            }
            continue;
        }
        if (record.sourceIdentityDigest !== operational.sourceIdentityDigest) {
            failures.push(parityFinding(record.canonicalRecordId, "source_identity_mismatch"));
        }
        if (record.role !== operational.role) {
            failures.push(parityFinding(record.canonicalRecordId, "role_mismatch"));
        }
        else if (record.role === "shared_accepted_work"
            && record.lifecycle !== operational.lifecycle) {
            failures.push(parityFinding(record.canonicalRecordId, "lifecycle_mismatch"));
        }
    }
    for (const record of taskMap.records) {
        if (strategyRows.has(record.canonicalRecordId))
            continue;
        if (record.role === "taskmap_candidate_review") {
            intentionalDifferences.push(parityFinding(record.canonicalRecordId, "taskmap_candidate_review_only"));
        }
        else if (record.role === "taskmap_operational_detail") {
            intentionalDifferences.push(parityFinding(record.canonicalRecordId, "taskmap_operational_detail_only"));
        }
        else if (record.role === "shared_accepted_work") {
            failures.push(parityFinding(record.canonicalRecordId, "shared_work_missing_strategy"));
        }
    }
    const sortFindings = (rows) => rows.sort((left, right) => (left.canonicalRecordId.localeCompare(right.canonicalRecordId)
        || left.code.localeCompare(right.code)));
    const core = {
        acceptedDeltaDigest,
        intentionalDifferences: sortFindings(intentionalDifferences),
        failures: sortFindings(failures),
    };
    return deepFreeze({
        contractVersion: types_js_1.TASKMAP_PROJECTION_PARITY_VERSION,
        comparisonId: stableId("tmparity", core),
        ...core,
    });
}
function sortedPolicies(bindings) {
    assertBoundedRows(bindings, "replay policy bindings");
    const names = new Set();
    const rows = bindings.map((binding) => {
        assertOnlyKeys(binding, POLICY_BINDING_KEYS, "replay policy binding");
        if (!REQUIRED_POLICY_NAMES.has(binding.name)) {
            throw new Error("unsupported replay policy family");
        }
        if (names.has(binding.name))
            throw new Error("replay policy name must be unique");
        names.add(binding.name);
        assertOpaque(binding.version, "replay policy version");
        assertDigest(binding.digest, "replay policy digest");
        return { ...binding };
    }).sort((left, right) => left.name.localeCompare(right.name));
    if (names.size !== REQUIRED_POLICY_NAMES.size
        || [...REQUIRED_POLICY_NAMES].some((name) => !names.has(name))) {
        throw new Error("replay manifest must bind every deterministic policy family");
    }
    return rows;
}
function normalizeProjectionParity(parity) {
    assertOnlyKeys(parity, PROJECTION_PARITY_KEYS, "projection parity");
    if (parity.contractVersion !== types_js_1.TASKMAP_PROJECTION_PARITY_VERSION) {
        throw new Error("unsupported projection parity version");
    }
    assertDigest(parity.acceptedDeltaDigest, "parity acceptedDeltaDigest");
    const normalizeFindings = (findings, label) => {
        assertBoundedRows(findings, label);
        return findings.map((finding) => {
            assertOnlyKeys(finding, PROJECTION_PARITY_FINDING_KEYS, label);
            assertOpaque(finding.canonicalRecordId, "parity canonicalRecordId");
            if (!VALID_PARITY_CODES.has(finding.code))
                throw new Error("unsupported parity finding");
            return { ...finding };
        }).sort((left, right) => (left.canonicalRecordId.localeCompare(right.canonicalRecordId)
            || left.code.localeCompare(right.code)));
    };
    const core = {
        acceptedDeltaDigest: parity.acceptedDeltaDigest,
        intentionalDifferences: normalizeFindings(parity.intentionalDifferences, "intentional parity findings"),
        failures: normalizeFindings(parity.failures, "parity failures"),
    };
    const rebuilt = {
        contractVersion: types_js_1.TASKMAP_PROJECTION_PARITY_VERSION,
        comparisonId: stableId("tmparity", core),
        ...core,
    };
    if (taskMapContractCanonicalJson(rebuilt) !== taskMapContractCanonicalJson(parity)) {
        throw new Error("projection parity derived identity is invalid");
    }
    return deepFreeze(rebuilt);
}
function buildTaskMapReplayManifest(draft) {
    assertOnlyKeys(draft, REPLAY_MANIFEST_DRAFT_KEYS, "replay manifest draft");
    assertTimestamp(draft.fixedNow, "fixedNow");
    const sourceSnapshot = normalizeSourceSnapshotArtifact(draft.sourceSnapshot);
    const semanticProposal = buildTaskMapSemanticProposalReference({
        sourceSnapshot,
        semanticBrainArtifact: draft.semanticBrainArtifact,
        semanticBrainAttestationKey: draft.semanticBrainAttestationKey,
    });
    const projectionDiff = diffTaskMapProjections(draft.previousProjection, draft.currentProjection);
    const previousProjectionDigest = projectionDiff.previousProjectionDigest;
    const currentProjectionDigest = projectionDiff.currentProjectionDigest;
    const brain = draft.semanticBrainArtifact.brain;
    if (draft.currentProjection.inputDigest !== brain.inputDigest
        || !draft.currentProjection.brain
        || draft.currentProjection.brain.provider !== brain.provider
        || draft.currentProjection.brain.model !== brain.model
        || draft.currentProjection.brain.promptHash !== brain.promptHash
        || draft.currentProjection.brain.outputDigest !== taskMapContractDigest(brain)
        || draft.currentProjection.generatedAt !== draft.fixedNow) {
        throw new Error("current projection is not bound to the semantic brain artifact");
    }
    const policyBindings = sortedPolicies(draft.policyBindings);
    assertBoundedRows(draft.connectorCheckpoints, "connector checkpoints");
    const connectorCheckpoints = uniqueById(draft.connectorCheckpoints.map(normalizeConnectorCheckpoint), (checkpoint) => checkpoint.checkpointId, "connector checkpoint");
    const snapshotSourceIdentities = new Set(sourceSnapshot.envelopes.map((envelope) => envelope.sourceIdentityDigest));
    for (const checkpoint of connectorCheckpoints) {
        if (checkpoint.acceptedSourceIdentityDigests.some((digest) => !snapshotSourceIdentities.has(digest))) {
            throw new Error("connector checkpoint accepts a source outside the snapshot");
        }
    }
    const connectorCheckpointDigests = connectorCheckpoints
        .map(taskMapContractDigest)
        .sort();
    assertBoundedRows(draft.gateDecisions, "gate decisions");
    const gateDecisions = uniqueById(draft.gateDecisions.map(normalizeGateDecision), (decision) => decision.decisionId, "gate decision");
    const subjectGateOwners = new Set();
    const allowedSubjects = new Set([
        ...semanticProposal.rootProposalIds,
        ...semanticProposal.candidateProposalIds,
        ...semanticProposal.relationProposalIds,
        ...sourceSnapshot.envelopes.map((envelope) => envelope.envelopeId),
        ...sourceSnapshot.canonicalMeetings.map((meeting) => meeting.canonicalMeetingId),
        ...draft.currentProjection.sources.map((source) => source.id),
        ...draft.currentProjection.roots.map((root) => root.id),
        ...draft.currentProjection.tasks.map((task) => task.id),
        ...draft.currentProjection.edges.map((edge) => edge.id),
        ...draft.currentProjection.rejections.map((rejection) => rejection.proposalId),
    ]);
    for (const decision of gateDecisions) {
        const key = `${decision.subjectId}:${decision.gate}`;
        if (subjectGateOwners.has(key)) {
            throw new Error("replay manifest has conflicting decisions for one subject and gate");
        }
        subjectGateOwners.add(key);
        if (!allowedSubjects.has(decision.subjectId)) {
            throw new Error("gate decision subject is absent from semantic/source/projection artifacts");
        }
    }
    const gateDecisionDigest = taskMapContractDigest(gateDecisions);
    const projectionParity = draft.projectionParity
        ? normalizeProjectionParity(draft.projectionParity)
        : undefined;
    const acceptedDeltaDigest = taskMapContractDigest({
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        semanticBrainDigest: semanticProposal.semanticBrainDigest,
        gateDecisionIds: gateDecisions.map((decision) => decision.decisionId),
        currentProjectionDigest,
    });
    if (projectionParity && (projectionParity.failures.length > 0
        || projectionParity.acceptedDeltaDigest !== acceptedDeltaDigest)) {
        throw new Error("projection parity must pass for the replay manifest accepted delta");
    }
    const projectionParityDigest = projectionParity
        ? taskMapContractDigest(projectionParity)
        : undefined;
    const replaySeed = {
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        semanticBrainDigest: semanticProposal.semanticBrainDigest,
        previousProjectionDigest,
        currentProjectionDigest,
        policyBindings,
        connectorCheckpointDigests,
        gateDecisionDigest,
        projectionParityDigest,
        fixedNow: draft.fixedNow,
    };
    const replayKey = taskMapContractDigest(replaySeed);
    const manifestCore = {
        replayKey,
        fixedNow: draft.fixedNow,
        sourceSnapshotDigest: sourceSnapshot.sourceSnapshotDigest,
        semanticInputDigest: sourceSnapshot.semanticInputDigest,
        semanticProposal,
        previousProjectionDigest,
        policyBindings,
        connectorCheckpointDigests,
        gateDecisions,
        projectionDiff,
        projectionParityDigest,
    };
    const manifest = {
        contractVersion: types_js_1.TASKMAP_REPLAY_MANIFEST_VERSION,
        manifestId: stableId("tmmanifest", manifestCore),
        ...manifestCore,
        privacy: { ...PRIVACY },
    };
    assertBoundedArtifact(manifest, "replay manifest");
    return deepFreeze(manifest);
}
