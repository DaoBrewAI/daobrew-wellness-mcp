"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1 = exports.TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION = exports.TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION = exports.TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION = exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION = void 0;
exports.readTaskMapGeminiMeetAdapter = readTaskMapGeminiMeetAdapter;
const node_util_1 = require("node:util");
const source_contracts_js_1 = require("./source-contracts.js");
const refresh_run_bundle_js_1 = require("./refresh-run-bundle.js");
const types_js_1 = require("./types.js");
/**
 * P12.1a is a bounded, read-only adapter. Providers are injected by a caller;
 * this module owns no connector client, credentials, clock, scheduler,
 * persistence, writeback, or source mutation.
 */
exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION = "taskmap-gemini-meet-adapter.1";
exports.TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION = "taskmap-gemini-meet-adapter-result.v1";
exports.TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION = "taskmap-gemini-meet-adapter-failure.v1";
exports.TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION = "taskmap-gemini-meet-empty-observation.v1";
exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1 = Object.freeze({
    maxDocuments: 64,
    maxArrayLength: 256,
    maxObjectKeys: 16,
    maxDepth: 8,
    maxNodes: 4_096,
    maxStringBytes: 2_048,
    maxProviderResponseBytes: 256 * 1_024,
});
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._#-]{0,511}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Object.getPrototypeOf;
const ADAPTER_PRIVACY = Object.freeze({
    sourceBodiesStored: false,
    emailBodiesStored: false,
    participantDetailsStored: false,
    credentialsStored: false,
    rawProviderResponsesStored: false,
    localPathsStored: false,
});
const DRIVE_LIST_KEYS = new Set(["documents"]);
const DRIVE_REF_KEYS = new Set(["documentId", "revisionId"]);
const DRIVE_READ_KEYS = new Set(["document"]);
const DRIVE_DOCUMENT_KEYS = new Set([
    "documentId",
    "revisionId",
    "eventTime",
    "contentDigest",
    "quality",
    "meetingIdentity",
]);
const MEETING_IDENTITY_KEYS = new Set([
    "fingerprintVersion",
    "startAt",
    "endAt",
    "calendarEventIdDigest",
    "normalizedTitleDigest",
    "participantSetDigest",
]);
const BINDING_KEYS = new Set([
    "connectionId",
    "sourceKind",
    "tenantOrWorkspaceDigest",
    "accountOrPrincipalDigest",
    "grantVersion",
]);
class ProviderResponseError extends Error {
    category;
    constructor(category) {
        super(category);
        this.category = category;
    }
}
function compareText(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
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
function assertDigest(value, label) {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertOpaque(value, label) {
    if (typeof value !== "string" || !SAFE_OPAQUE.test(value)) {
        throw new ProviderResponseError("malformed");
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
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, offsetHour, offsetMinute,] = match;
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
        || (zone !== "Z"
            && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) {
        throw new Error(`${label} must be a real RFC3339 instant`);
    }
}
function assertExactKeys(value, allowed, required) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ProviderResponseError("malformed");
    }
    const keys = Object.keys(value);
    if (keys.some((key) => !allowed.has(key))
        || [...required].some((key) => !Object.hasOwn(value, key))) {
        throw new ProviderResponseError("malformed");
    }
}
function preflightProviderJson(value, state, depth = 0) {
    state.nodes += 1;
    if (state.nodes > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxNodes
        || depth > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDepth) {
        throw new ProviderResponseError("limit");
    }
    const charge = (bytes) => {
        state.bytes += bytes;
        if (state.bytes
            > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxProviderResponseBytes) {
            throw new ProviderResponseError("limit");
        }
    };
    if (value === null
        || typeof value === "boolean"
        || typeof value === "number") {
        if (typeof value === "number" && !Number.isFinite(value)) {
            throw new ProviderResponseError("malformed");
        }
        charge(Buffer.byteLength(String(value), "utf8"));
        return;
    }
    if (typeof value === "string") {
        const bytes = Buffer.byteLength(value, "utf8");
        if (bytes > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxStringBytes) {
            throw new ProviderResponseError("limit");
        }
        charge(bytes + 2);
        return;
    }
    if (!value || typeof value !== "object") {
        throw new ProviderResponseError("malformed");
    }
    if (node_util_1.types.isProxy(value)) {
        throw new ProviderResponseError("proxy");
    }
    if (Array.isArray(value)) {
        if (GET_PROTOTYPE_OF(value) !== Array.prototype) {
            throw new ProviderResponseError("malformed");
        }
        if (value.length > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxArrayLength) {
            throw new ProviderResponseError("limit");
        }
        const ownKeys = REFLECT_OWN_KEYS(value);
        if (ownKeys.length !== value.length + 1) {
            throw new ProviderResponseError("malformed");
        }
        for (const key of ownKeys) {
            if (typeof key !== "string"
                || (key !== "length" && !/^(0|[1-9]\d*)$/.test(key))) {
                throw new ProviderResponseError("malformed");
            }
            const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
            if (descriptor === undefined
                || !("value" in descriptor)
                || descriptor.get !== undefined
                || descriptor.set !== undefined
                || (key !== "length" && !descriptor.enumerable)) {
                throw new ProviderResponseError("malformed");
            }
            if (key !== "length") {
                preflightProviderJson(descriptor.value, state, depth + 1);
            }
        }
        charge(2 + Math.max(0, value.length - 1));
        return;
    }
    const prototype = GET_PROTOTYPE_OF(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new ProviderResponseError("malformed");
    }
    const ownKeys = REFLECT_OWN_KEYS(value);
    if (ownKeys.length > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxObjectKeys) {
        throw new ProviderResponseError("limit");
    }
    charge(2 + Math.max(0, ownKeys.length - 1));
    for (const key of ownKeys) {
        if (typeof key !== "string") {
            throw new ProviderResponseError("malformed");
        }
        if (Buffer.byteLength(key, "utf8")
            > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxStringBytes) {
            throw new ProviderResponseError("limit");
        }
        const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(value, key);
        if (descriptor === undefined
            || !descriptor.enumerable
            || !("value" in descriptor)
            || descriptor.get !== undefined
            || descriptor.set !== undefined) {
            throw new ProviderResponseError("malformed");
        }
        charge(Buffer.byteLength(key, "utf8") + 3);
        preflightProviderJson(descriptor.value, state, depth + 1);
    }
}
function clonePreflightedJson(value) {
    if (value === null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((_, index) => clonePreflightedJson(GET_OWN_PROPERTY_DESCRIPTOR(value, String(index)).value));
    }
    const cloned = {};
    for (const key of REFLECT_OWN_KEYS(value)) {
        const stringKey = key;
        cloned[stringKey] = clonePreflightedJson(GET_OWN_PROPERTY_DESCRIPTOR(value, stringKey).value);
    }
    return cloned;
}
function snapshotProviderJson(value) {
    preflightProviderJson(value, { nodes: 0, bytes: 0 });
    return deepFreeze(clonePreflightedJson(value));
}
function normalizeDriveList(value) {
    const snapshot = snapshotProviderJson(value);
    assertExactKeys(snapshot, DRIVE_LIST_KEYS, DRIVE_LIST_KEYS);
    if (!Array.isArray(snapshot.documents)) {
        throw new ProviderResponseError("malformed");
    }
    if (snapshot.documents.length
        > exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments) {
        throw new ProviderResponseError("limit");
    }
    const revisionsByDocument = new Map();
    for (const item of snapshot.documents) {
        assertExactKeys(item, DRIVE_REF_KEYS, DRIVE_REF_KEYS);
        assertOpaque(item.documentId, "documentId");
        assertOpaque(item.revisionId, "revisionId");
        const revisions = revisionsByDocument.get(item.documentId) ?? new Set();
        revisions.add(item.revisionId);
        revisionsByDocument.set(item.documentId, revisions);
    }
    const refs = [];
    const failures = [];
    for (const [documentId, revisions] of revisionsByDocument) {
        if (revisions.size !== 1) {
            failures.push({ documentId });
            continue;
        }
        refs.push({ documentId, revisionId: [...revisions][0] });
    }
    refs.sort((left, right) => (compareText(left.documentId, right.documentId)
        || compareText(left.revisionId, right.revisionId)));
    failures.sort((left, right) => compareText(left.documentId, right.documentId));
    return {
        refs,
        failures,
        fullPage: snapshot.documents.length
            === exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
    };
}
function normalizeDriveDocument(value, expected) {
    const snapshot = snapshotProviderJson(value);
    assertExactKeys(snapshot, DRIVE_READ_KEYS, DRIVE_READ_KEYS);
    assertExactKeys(snapshot.document, DRIVE_DOCUMENT_KEYS, DRIVE_DOCUMENT_KEYS);
    const document = snapshot.document;
    assertOpaque(document.documentId, "documentId");
    assertOpaque(document.revisionId, "revisionId");
    if (document.documentId !== expected.documentId
        || document.revisionId !== expected.revisionId) {
        throw new ProviderResponseError("malformed");
    }
    if (document.quality !== "structured_generated"
        && document.quality !== "degraded_summary") {
        throw new ProviderResponseError("malformed");
    }
    assertExactKeys(document.meetingIdentity, MEETING_IDENTITY_KEYS, new Set([
        "fingerprintVersion",
        "startAt",
        "normalizedTitleDigest",
        "participantSetDigest",
    ]));
    return document;
}
function validateBinding(value, sourceKind) {
    const snapshot = snapshotProviderJson(value);
    assertExactKeys(snapshot, BINDING_KEYS, BINDING_KEYS);
    const binding = snapshot;
    if (binding.sourceKind !== sourceKind) {
        throw new Error(`binding must authorize ${sourceKind}`);
    }
    if (typeof binding.connectionId !== "string"
        || !SAFE_OPAQUE.test(binding.connectionId)
        || typeof binding.grantVersion !== "string"
        || !SAFE_OPAQUE.test(binding.grantVersion)) {
        throw new Error("binding contains an invalid opaque identifier");
    }
    assertDigest(binding.tenantOrWorkspaceDigest, "tenantOrWorkspaceDigest");
    assertDigest(binding.accountOrPrincipalDigest, "accountOrPrincipalDigest");
    return deepFreeze(binding);
}
function sourceObjectKeyDigest(ownerScopeDigest, binding, documentId) {
    if (documentId === undefined) {
        return (0, source_contracts_js_1.taskMapContractDigest)({
            ownerScopeDigest,
            binding,
            sourceKind: "gemini_meet",
        });
    }
    return (0, source_contracts_js_1.taskMapContractDigest)({
        ownerScopeDigest,
        connectionId: binding.connectionId,
        tenantOrWorkspaceDigest: binding.tenantOrWorkspaceDigest,
        accountOrPrincipalDigest: binding.accountOrPrincipalDigest,
        sourceKind: "gemini_meet",
        objectType: "meeting_note",
        sourceObjectId: documentId,
    });
}
function failureCategory(error) {
    if (error instanceof ProviderResponseError)
        return error.category;
    return "unavailable";
}
function failureCode(stage, category) {
    return `${stage}_${category}`;
}
function buildFailure(stage, error, sourceKeyDigest, blockingForServing) {
    const category = failureCategory(error);
    const code = failureCode(stage, category);
    const detailDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        adapterVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
        stage,
        category,
        sourceObjectKeyDigest: sourceKeyDigest,
    });
    return deepFreeze({
        contractVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_FAILURE_VERSION,
        failureId: `tmgeminifailure_${(0, source_contracts_js_1.taskMapContractDigest)({
            code,
            detailDigest,
            sourceObjectKeyDigest: sourceKeyDigest,
        }).slice(0, 16)}`,
        provider: "drive",
        sourceObjectKeyDigest: sourceKeyDigest,
        code,
        detailDigest,
        retryable: true,
        blockingForServing,
    });
}
function normalizePrevious(previous, ownerScopeDigest, driveBinding) {
    if (!previous)
        return undefined;
    const checkpoint = (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(previous.checkpoint);
    const sourceSliceProof = (0, refresh_run_bundle_js_1.assertTaskMapRefreshRunSourceSliceProof)(previous.sourceSliceProof);
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(driveBinding);
    if (checkpoint.sourceKind !== "gemini_meet"
        || checkpoint.adapterVersion !== exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(checkpoint.binding)
            !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(driveBinding)
        || sourceSliceProof.ownerScopeDigest !== ownerScopeDigest
        || sourceSliceProof.bindingDigest !== bindingDigest
        || (0, source_contracts_js_1.taskMapContractCanonicalJson)(sourceSliceProof.acceptedSourceIdentityDigests) !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(checkpoint.acceptedSourceIdentityDigests)) {
        throw new Error("previous Gemini checkpoint and source slice must share one owner, binding, adapter, and accepted identity set");
    }
    if ((checkpoint.watermark === undefined
        && sourceSliceProof.sliceRole !== "observed_non_serving")
        || (checkpoint.watermark !== undefined
            && sourceSliceProof.sliceRole !== "serving")) {
        throw new Error("previous Gemini checkpoint and source slice have inconsistent serving state");
    }
    return deepFreeze({ checkpoint, sourceSliceProof });
}
function currentSourceRevisions(bindingDigest, envelopes) {
    return envelopes.map((envelope) => ({
        bindingDigest,
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevisionDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelope.sourceRevision),
        contentDigest: envelope.contentDigest,
    })).sort((left, right) => (compareText(left.bindingDigest, right.bindingDigest)
        || compareText(left.sourceIdentityDigest, right.sourceIdentityDigest)
        || compareText(left.sourceRevisionDigest, right.sourceRevisionDigest)
        || compareText(left.contentDigest, right.contentDigest)));
}
function uniqueFailures(failures) {
    const byId = new Map();
    for (const failure of failures)
        byId.set(failure.failureId, failure);
    return [...byId.values()].sort((left, right) => compareText(left.failureId, right.failureId));
}
function bindDriveListProvider(provider) {
    if (node_util_1.types.isProxy(provider)) {
        throw new Error("Drive provider must not be proxy-backed");
    }
    const method = provider.listCurrentMeetingDocumentRefs;
    if (typeof method !== "function") {
        throw new Error("Drive provider list method is required");
    }
    return method.bind(provider);
}
function bindDriveReadProvider(provider) {
    if (node_util_1.types.isProxy(provider)) {
        throw new Error("Drive provider must not be proxy-backed");
    }
    const method = provider.readMeetingDocumentMetadata;
    if (typeof method !== "function") {
        throw new Error("Drive provider read method is required");
    }
    return method.bind(provider);
}
function snapshotAdapterInput(input) {
    if (node_util_1.types.isProxy(input)) {
        throw new Error("Gemini adapter input must not be proxy-backed");
    }
    const ownerScopeDigest = input.ownerScopeDigest;
    const attemptedAt = input.attemptedAt;
    const driveBinding = validateBinding(input.driveBinding, "gemini_meet");
    const driveProvider = input.driveProvider;
    const listDriveDocumentRefs = bindDriveListProvider(driveProvider);
    const readDriveDocument = bindDriveReadProvider(driveProvider);
    const previous = normalizePrevious(input.previous, ownerScopeDigest, driveBinding);
    const previousCanonicalMeetings = input.previousCanonicalMeetings === undefined
        ? []
        : snapshotProviderJson(input.previousCanonicalMeetings);
    assertDigest(ownerScopeDigest, "ownerScopeDigest");
    assertTimestamp(attemptedAt, "attemptedAt");
    return Object.freeze({
        ownerScopeDigest,
        attemptedAt,
        driveBinding,
        listDriveDocumentRefs,
        readDriveDocument,
        ...(previous === undefined ? {} : { previous }),
        previousCanonicalMeetings,
    });
}
function buildEmptyObservation(snapshot, bindingDigest) {
    const retainsLastGood = (snapshot.previous?.sourceSliceProof.sliceRole === "serving");
    const disposition = retainsLastGood
        ? "retained_last_good"
        : "non_serving";
    const core = {
        contractVersion: exports.TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        bindingDigest,
        adapterVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
        attemptedAt: snapshot.attemptedAt,
        authoritativeDocumentCount: 0,
        disposition,
        ...(snapshot.previous === undefined
            ? {}
            : {
                priorCheckpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(snapshot.previous.checkpoint),
            }),
        ...(retainsLastGood
            ? {
                retainedSourceSliceDigest: snapshot.previous.sourceSliceProof.sourceSliceDigest,
            }
            : {}),
        privacy: { ...ADAPTER_PRIVACY },
    };
    const observationDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return deepFreeze({
        ...core,
        observationId: `tmgeminiempty_${observationDigest}`,
        observationDigest,
    });
}
async function readTaskMapGeminiMeetAdapter(input) {
    const snapshot = snapshotAdapterInput(input);
    const { ownerScopeDigest, attemptedAt, driveBinding, listDriveDocumentRefs, readDriveDocument, previous, previousCanonicalMeetings, } = snapshot;
    const bindingDigest = (0, source_contracts_js_1.taskMapContractDigest)(driveBinding);
    const failures = [];
    let refs = [];
    let listFailed = false;
    let drivePageIncomplete = false;
    try {
        const response = await listDriveDocumentRefs(deepFreeze({
            limit: exports.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
        }));
        const normalized = normalizeDriveList(response);
        refs = normalized.refs;
        drivePageIncomplete = normalized.fullPage;
        if (drivePageIncomplete) {
            failures.push(buildFailure("drive_list", new ProviderResponseError("incomplete"), sourceObjectKeyDigest(ownerScopeDigest, driveBinding), true));
        }
        for (const duplicate of normalized.failures) {
            failures.push(buildFailure("drive_document", new ProviderResponseError("malformed"), sourceObjectKeyDigest(ownerScopeDigest, driveBinding, duplicate.documentId), true));
        }
    }
    catch (error) {
        listFailed = true;
        failures.push(buildFailure("drive_list", error, sourceObjectKeyDigest(ownerScopeDigest, driveBinding), true));
    }
    const documents = [];
    if (!listFailed) {
        for (const ref of refs) {
            try {
                const response = await readDriveDocument(deepFreeze({ ...ref }));
                documents.push(normalizeDriveDocument(response, ref));
            }
            catch (error) {
                failures.push(buildFailure("drive_document", error, sourceObjectKeyDigest(ownerScopeDigest, driveBinding, ref.documentId), true));
            }
        }
    }
    const envelopes = [];
    const discoveryPointers = [];
    for (const document of documents.sort((left, right) => (compareText(left.documentId, right.documentId)))) {
        let baseEnvelope;
        try {
            baseEnvelope = (0, source_contracts_js_1.buildGeminiMeetSource)({
                ownerScopeDigest,
                binding: driveBinding,
                documentId: document.documentId,
                revisionId: document.revisionId,
                eventTime: document.eventTime,
                contentDigest: document.contentDigest,
                quality: document.quality,
                meetingIdentity: document.meetingIdentity,
                gmailDiscoveries: [],
            }).envelope;
        }
        catch (error) {
            failures.push(buildFailure("drive_document", error instanceof ProviderResponseError
                ? error
                : new ProviderResponseError("malformed"), sourceObjectKeyDigest(ownerScopeDigest, driveBinding, document.documentId), true));
            continue;
        }
        envelopes.push(baseEnvelope);
    }
    envelopes.sort((left, right) => compareText(left.envelopeId, right.envelopeId));
    discoveryPointers.sort((left, right) => compareText(left.discoveryId, right.discoveryId));
    const normalizedFailures = uniqueFailures(failures);
    const blockingFailures = normalizedFailures.filter((failure) => failure.blockingForServing);
    const authoritativeEmpty = (!listFailed
        && refs.length === 0
        && blockingFailures.length === 0);
    const state = authoritativeEmpty
        ? "empty_requires_review"
        : drivePageIncomplete
            ? "incomplete_requires_review"
            : blockingFailures.length === 0
                ? "success"
                : envelopes.length === 0
                    ? "failed"
                    : "partial";
    const checkpointState = (state === "empty_requires_review"
        || state === "incomplete_requires_review")
        ? "partial"
        : state;
    const emptyObservation = authoritativeEmpty
        ? buildEmptyObservation(snapshot, bindingDigest)
        : undefined;
    const acceptedSourceIdentityDigests = envelopes
        .map((envelope) => envelope.sourceIdentityDigest)
        .sort(compareText);
    const proposedWatermark = state === "success"
        ? {
            kind: "composite",
            valueDigest: (0, source_contracts_js_1.taskMapContractDigest)(envelopes.map((envelope) => ({
                envelopeId: envelope.envelopeId,
                sourceIdentityDigest: envelope.sourceIdentityDigest,
            }))),
            observedThrough: attemptedAt,
        }
        : undefined;
    const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(previous?.checkpoint ?? null, {
        binding: driveBinding,
        sourceKind: "gemini_meet",
        adapterVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
        capabilities: ["read_context", "deep_link"],
        state: checkpointState,
        attemptedAt,
        ...(proposedWatermark === undefined
            ? {}
            : {
                proposedWatermark,
                acceptedSourceIdentityDigests,
            }),
        ...(state === "success"
            ? {}
            : {
                errorCode: (state === "partial"
                    || state === "empty_requires_review"
                    || state === "incomplete_requires_review")
                    ? "provider_partial_result"
                    : "provider_unavailable",
                errorDetailDigest: emptyObservation?.observationDigest
                    ?? (0, source_contracts_js_1.taskMapContractDigest)(blockingFailures),
            }),
    });
    const currentRevisions = currentSourceRevisions(bindingDigest, envelopes);
    const currentSourceSlice = state === "success"
        ? (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
            sliceRole: "serving",
            ownerScopeDigest,
            bindingDigest,
            sourceRevisions: currentRevisions,
            acceptedSourceIdentityDigests,
        })
        : previous?.sourceSliceProof
            ?? (0, refresh_run_bundle_js_1.buildTaskMapRefreshRunSourceSliceProof)({
                sliceRole: "observed_non_serving",
                ownerScopeDigest,
                bindingDigest,
                sourceRevisions: [],
                acceptedSourceIdentityDigests: [],
            });
    const sourceBinding = deepFreeze({
        bindingDigest,
        sourceKind: "gemini_meet",
        sourceContractVersion: types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION,
        adapterVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
    });
    const sourceRevisionSet = deepFreeze({
        bindingDigest,
        revisionSetDigest: currentSourceSlice.sourceRevisionSetDigest,
    });
    const canonicalMeetings = envelopes.length === 0
        ? []
        : (0, source_contracts_js_1.canonicalizeTaskMapMeetings)(envelopes, previousCanonicalMeetings);
    const sourceSnapshot = state === "success" && envelopes.length > 0
        ? (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, discoveryPointers, previousCanonicalMeetings)
        : undefined;
    const isExactNoOp = Boolean(state === "success"
        && previous?.checkpoint.watermark
        && previous.checkpoint.watermark.valueDigest
            === proposedWatermark?.valueDigest
        && previous.sourceSliceProof.sourceSliceDigest
            === currentSourceSlice.sourceSliceDigest);
    const servingDisposition = state === "success"
        ? "current_source"
        : currentSourceSlice.sliceRole === "serving"
            ? "retained_last_good"
            : "non_serving";
    const refreshInputs = deepFreeze({
        sourceBinding,
        sourceRevisions: currentSourceSlice.sourceRevisions,
        sourceRevisionSet,
        sourceSliceProof: currentSourceSlice,
        checkpointDigest: (0, source_contracts_js_1.taskMapContractDigest)(checkpoint),
        servingDisposition,
        ...(sourceSnapshot === undefined
            ? {}
            : { semanticInputDigest: sourceSnapshot.semanticInputDigest }),
        ...(emptyObservation === undefined
            ? {}
            : { emptyObservationDigest: emptyObservation.observationDigest }),
    });
    return deepFreeze({
        contractVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_RESULT_VERSION,
        adapterVersion: exports.TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
        state,
        isExactNoOp,
        envelopes,
        discoveryPointers,
        canonicalMeetings,
        ...(sourceSnapshot === undefined ? {} : { sourceSnapshot }),
        ...(emptyObservation === undefined ? {} : { emptyObservation }),
        checkpoint,
        failures: normalizedFailures,
        refreshInputs,
        privacy: { ...ADAPTER_PRIVACY },
    });
}
