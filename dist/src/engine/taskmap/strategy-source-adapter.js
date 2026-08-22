"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskMapStrategySourceUnavailableError = exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST = exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1 = exports.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME = exports.TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION = exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION = exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION = void 0;
exports.readTaskMapStrategySourceAdapter = readTaskMapStrategySourceAdapter;
const node_crypto_1 = require("node:crypto");
const harness_js_1 = require("./harness.js");
const exact_provenance_companion_js_1 = require("./exact-provenance-companion.js");
const source_contracts_js_1 = require("./source-contracts.js");
const types_js_1 = require("./types.js");
exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION = "taskmap-strategy-source-adapter.1";
exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION = "taskmap-strategy-source-adapter-result.v1";
exports.TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION = "taskmap-strategy-source-provenance.v1";
exports.TASKMAP_STRATEGY_SOURCE_EVIDENCE_FILENAME = "taskmap-strategy-source-evidence.v1.json";
exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1 = Object.freeze({
    maximumProjectionBytes: 512 * 1_024,
    maximumCurrentnessBytes: 128 * 1_024,
    maximumRepositoryFileBytes: 256 * 1_024,
    maximumResultBytes: 512 * 1_024,
    maximumTasks: 128,
    maximumRoots: 32,
});
const POLICY = Object.freeze({
    version: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
    scope: "current_strategy_owned_tasks_only_not_all_current_tasks",
    selection: "accepted_current_strategy_task_home",
    rowBinding: "owner_local_pointer_plus_canonical_row_digest",
    repository: "one_immutable_git_revision_and_remote_locator",
    semanticText: "accepted_projection_only",
    lifecycle: "accepted_projection_source_status_preserved",
    rootLink: "accepted_root_membership_digest",
    historicalSourceDayReceipts: "none",
    bodyJoinEligibility: false,
});
exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)(POLICY);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,511}$/;
const SAFE_ORIGIN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SAFE_GITHUB_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const SAFE_REPOSITORY_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const STRICT_RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const ROOT_LINK_DOMAIN = "taskmap-strategy-root-link.1";
const TASK_PROOF_DOMAIN = "taskmap-strategy-task-proof.1";
const PROVENANCE_DOMAIN = "taskmap-strategy-source-provenance.1";
const RESULT_DOMAIN = "taskmap-strategy-source-adapter-result.1";
const REPOSITORY_BINDING_DOMAIN = "taskmap-strategy-repository-binding.1";
const PRIVACY = Object.freeze({
    sourceRowsStored: false,
    sourceBodiesStored: false,
    localPathsStored: false,
    rawBiometricsStored: false,
    ownerIdentityStored: false,
});
class TaskMapStrategySourceUnavailableError extends Error {
    code;
    constructor(code) {
        super(`Task Map Strategy source unavailable: ${code}`);
        this.code = code;
        this.name = "TaskMapStrategySourceUnavailableError";
    }
}
exports.TaskMapStrategySourceUnavailableError = TaskMapStrategySourceUnavailableError;
function fail(code) {
    throw new TaskMapStrategySourceUnavailableError(code);
}
function digestBytes(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function digestText(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value, "utf8").digest("hex");
}
function isObject(value) {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype
            || Object.getPrototypeOf(value) === null);
}
function hasKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
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
function timestamp(value) {
    const match = typeof value === "string"
        ? STRICT_RFC3339.exec(value)
        : null;
    if (match === null || !Number.isFinite(Date.parse(value))) {
        return false;
    }
    return match[7] === "Z"
        || (Number(match[8]) <= 23 && Number(match[9]) <= 59);
}
function parseDocument(source, maximumBytes) {
    if (!(source instanceof Uint8Array)
        || source.byteLength === 0
        || source.byteLength > maximumBytes) {
        fail("invalid_contract");
    }
    const bytes = Uint8Array.from(source);
    try {
        return {
            value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
            digest: digestBytes(bytes),
        };
    }
    catch {
        fail("invalid_contract");
    }
}
function currentTaskIds(projection, currentness, projectionDigest) {
    if (!isObject(currentness)
        || !hasKeys(currentness, [
            "contractVersion",
            "runId",
            "inputDigest",
            "projectionDigest",
            "taskDispositions",
        ])
        || currentness.contractVersion
            !== "taskmap-native-currentness-gate.v1"
        || currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== projectionDigest
        || !Array.isArray(currentness.taskDispositions)
        || currentness.taskDispositions.length !== projection.tasks.length) {
        fail("invalid_currentness");
    }
    const expected = new Set(projection.tasks.map((task) => task.id));
    const seen = new Set();
    const current = [];
    for (const row of currentness.taskDispositions) {
        if (!isObject(row)
            || !hasKeys(row, ["taskId", "disposition"])
            || typeof row.taskId !== "string"
            || !SAFE_ID.test(row.taskId)
            || !expected.has(row.taskId)
            || seen.has(row.taskId)
            || (row.disposition !== "current"
                && row.disposition !== "needs_lifecycle_review")) {
            fail("invalid_currentness");
        }
        seen.add(row.taskId);
        if (row.disposition === "current")
            current.push(row.taskId);
    }
    if (seen.size !== expected.size || current.length === 0) {
        fail("invalid_currentness");
    }
    return current.sort();
}
function snapshotInput(input) {
    if (!SHA256.test(input.ownerScopeDigest)
        || !SHA256.test(input.expectedProjectionFileDigest)
        || !SHA256.test(input.expectedCurrentnessFileDigest)) {
        fail("invalid_contract");
    }
    const projectionDocument = parseDocument(input.projectionBytes, exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumProjectionBytes);
    const currentnessDocument = parseDocument(input.currentnessBytes, exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumCurrentnessBytes);
    if (projectionDocument.digest !== input.expectedProjectionFileDigest
        || currentnessDocument.digest !== input.expectedCurrentnessFileDigest) {
        fail("digest_mismatch");
    }
    const projection = projectionDocument.value;
    if (projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || projection.tasks.length
            > exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumTasks
        || projection.roots.length
            > exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumRoots
        || (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection).length > 0) {
        fail("invalid_projection");
    }
    let projectionDigest;
    try {
        projectionDigest =
            (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    }
    catch {
        fail("invalid_projection");
    }
    currentTaskIds(projection, currentnessDocument.value, projectionDigest);
    if (!isObject(input.binding)
        || !hasKeys(input.binding, [
            "connectionId",
            "sourceKind",
            "tenantOrWorkspaceDigest",
            "accountOrPrincipalDigest",
            "grantVersion",
        ])
        || !SAFE_ID.test(input.binding.connectionId)
        || input.binding.sourceKind !== "strategy"
        || !SHA256.test(input.binding.tenantOrWorkspaceDigest)
        || input.binding.accountOrPrincipalDigest !== input.ownerScopeDigest
        || !SAFE_ID.test(input.binding.grantVersion)) {
        fail("invalid_contract");
    }
    if (!Array.isArray(input.rowBindings)
        || input.rowBindings.length === 0
        || input.rowBindings.length
            > exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumTasks) {
        fail("invalid_contract");
    }
    const rowBindings = input.rowBindings.map((row) => {
        if (!isObject(row)
            || !hasKeys(row, ["pointerId", "canonicalRowDigest"])
            || typeof row.pointerId !== "string"
            || !SAFE_ID.test(row.pointerId)
            || typeof row.canonicalRowDigest !== "string"
            || !SHA256.test(row.canonicalRowDigest)) {
            fail("invalid_contract");
        }
        return {
            pointerId: row.pointerId,
            canonicalRowDigest: row.canonicalRowDigest,
        };
    }).sort((left, right) => left.pointerId.localeCompare(right.pointerId));
    if (new Set(rowBindings.map((row) => row.pointerId)).size
        !== rowBindings.length) {
        fail("invalid_contract");
    }
    const provider = input.repositoryProvider;
    if (typeof provider?.readImmutableRepositoryFile !== "function") {
        fail("invalid_contract");
    }
    return {
        ownerScopeDigest: input.ownerScopeDigest,
        binding: { ...input.binding },
        projection: structuredClone(projection),
        projectionFileDigest: projectionDocument.digest,
        currentness: structuredClone(currentnessDocument.value),
        currentnessFileDigest: currentnessDocument.digest,
        rowBindings,
        rowBindingSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(rowBindings),
        readRepository: provider.readImmutableRepositoryFile.bind(provider),
    };
}
function immutableLocator(source) {
    if (source.sourceVersion === undefined
        || !GIT_COMMIT.test(source.sourceVersion)) {
        fail("mutable_revision");
    }
    let url;
    let segments;
    try {
        url = new URL(source.canonicalUrl ?? "");
        segments = url.pathname
            .split("/")
            .filter(Boolean)
            .map((segment) => decodeURIComponent(segment));
    }
    catch {
        fail("repository_locator_mismatch");
    }
    if (url.protocol !== "https:"
        || url.hostname !== "github.com"
        || url.port !== ""
        || url.username !== ""
        || url.password !== ""
        || url.search !== ""
        || url.hash !== ""
        || segments.length < 5
        || !SAFE_GITHUB_SEGMENT.test(segments[0])
        || !SAFE_GITHUB_SEGMENT.test(segments[1])
        || segments[2] !== "blob"
        || segments[3] !== source.sourceVersion) {
        fail("repository_locator_mismatch");
    }
    const repositoryRelativePath = segments.slice(4).join("/");
    if (!SAFE_REPOSITORY_PATH.test(repositoryRelativePath)
        || repositoryRelativePath.split("/").some((part) => part === "." || part === "..")) {
        fail("repository_locator_mismatch");
    }
    return {
        remoteLocator: `https://github.com/${segments[0]}/${segments[1]}`,
        revision: source.sourceVersion,
        repositoryRelativePath,
    };
}
function selections(snapshot, currentIds) {
    const current = new Set(currentIds);
    const bindingByPointer = new Map(snapshot.rowBindings.map((row) => [row.pointerId, row]));
    const sourceById = new Map(snapshot.projection.sources.map((source) => [source.id, source]));
    const rootById = new Map(snapshot.projection.roots.map((root) => [root.id, root]));
    const selected = snapshot.projection.tasks.flatMap((task) => {
        if (!current.has(task.id))
            return [];
        const pointerId = task.taskHomePointerId;
        const source = pointerId === undefined
            ? undefined
            : sourceById.get(pointerId);
        if (source?.sourceKind !== "strategy")
            return [];
        const root = rootById.get(task.rootId);
        const citation = task.citations.filter((row) => row.pointerId === pointerId);
        const rowBinding = pointerId === undefined
            ? undefined
            : bindingByPointer.get(pointerId);
        if (rowBinding === undefined)
            fail("row_binding_mismatch");
        if (task.reviewState !== "accepted"
            || task.authority !== "source_system"
            || pointerId === undefined
            || !task.originPointerIds.includes(pointerId)
            || source.authority !== "source_system"
            || !source.capabilities.includes("read_task")
            || root === undefined
            || !root.taskIds.includes(task.id)
            || citation.length !== 1) {
            fail("invalid_projection");
        }
        return [{
                task,
                root,
                source,
                citation: citation[0],
                canonicalRowDigest: rowBinding.canonicalRowDigest,
            }];
    }).sort((left, right) => left.task.id.localeCompare(right.task.id));
    if (selected.length === 0)
        fail("no_current_strategy_tasks");
    const selectedPointers = new Set(selected.map((row) => row.task.taskHomePointerId));
    if (selectedPointers.size !== selected.length
        || selectedPointers.size !== snapshot.rowBindings.length
        || snapshot.rowBindings.some((row) => !selectedPointers.has(row.pointerId))) {
        fail("row_binding_mismatch");
    }
    return selected;
}
function repositoryObservation(raw, request) {
    if (!isObject(raw)
        || !hasKeys(raw, [
            "remoteLocator",
            "revision",
            "repositoryRelativePath",
            "committedAt",
            "content",
            "contentDigest",
        ])
        || raw.remoteLocator !== request.remoteLocator
        || raw.revision !== request.revision
        || raw.repositoryRelativePath !== request.repositoryRelativePath
        || !timestamp(raw.committedAt)
        || typeof raw.content !== "string"
        || raw.content.includes("\u0000")
        || typeof raw.contentDigest !== "string"
        || !SHA256.test(raw.contentDigest)) {
        fail("repository_response_malformed");
    }
    if (Buffer.byteLength(raw.content, "utf8") > request.maximumBytes) {
        fail("repository_content_limit");
    }
    if (digestText(raw.content) !== raw.contentDigest) {
        fail("digest_mismatch");
    }
    return {
        remoteLocator: raw.remoteLocator,
        revision: raw.revision,
        repositoryRelativePath: raw.repositoryRelativePath,
        committedAt: raw.committedAt,
        content: raw.content,
        contentDigest: raw.contentDigest,
    };
}
function resolveRow(observation, pointerId, expectedDigest) {
    const matches = observation.content
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .filter((row) => row.startsWith("|"))
        .filter((row) => (0, exact_provenance_companion_js_1.taskMapCanonicalRepositoryRowDigest)({
        repositoryRelativePath: observation.repositoryRelativePath,
        sourceObjectId: pointerId,
        rowText: row,
    }) === expectedDigest);
    if (matches.length !== 1)
        fail("row_resolution_failed");
}
function activity(sourceStatus) {
    if (sourceStatus === "open")
        return "task_created";
    if (sourceStatus === "in_progress"
        || sourceStatus === "blocked"
        || sourceStatus === "awaiting_review") {
        return "task_updated";
    }
    fail("lifecycle_unavailable");
}
function acceptedRootLink(root) {
    if (root.memberObjectRefs.length === 0
        || new Set(root.memberObjectRefs).size
            !== root.memberObjectRefs.length) {
        fail("root_link_unavailable");
    }
    const memberObjectRefs = [...root.memberObjectRefs].sort();
    return {
        rootId: root.id,
        rootLinkRef: `external:${(0, source_contracts_js_1.taskMapContractDigest)({
            domain: ROOT_LINK_DOMAIN,
            memberObjectRefs,
        })}`,
        memberObjectRefs,
        memberObjectRefsDigest: (0, source_contracts_js_1.taskMapContractDigest)(memberObjectRefs),
        projectionRootDigest: (0, source_contracts_js_1.taskMapContractDigest)(root),
    };
}
function buildProvenance(input) {
    const attested = new Set(input.taskProofs.map((row) => row.taskId));
    const excluded = input.currentIds
        .filter((taskId) => !attested.has(taskId))
        .sort();
    const core = {
        contractVersion: exports.TASKMAP_STRATEGY_SOURCE_PROVENANCE_VERSION,
        scope: "current_strategy_owned_tasks_only",
        projection: {
            runId: input.snapshot.projection.runId,
            inputDigest: input.snapshot.projection.inputDigest,
            projectionFileDigest: input.snapshot.projectionFileDigest,
            projectionDigest: input.projectionDigest,
            currentnessFileDigest: input.snapshot.currentnessFileDigest,
            allCurrentTaskCount: input.currentIds.length,
            attestedStrategyTaskCount: input.taskProofs.length,
            excludedCurrentTaskCount: excluded.length,
            excludedCurrentTaskSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(excluded),
        },
        repository: {
            remoteLocator: input.observation.remoteLocator,
            revision: input.observation.revision,
            repositoryRelativePath: input.observation.repositoryRelativePath,
            committedAt: input.observation.committedAt,
            fileContentDigest: input.observation.contentDigest,
            repositoryBindingDigest: input.repositoryBindingDigest,
        },
        producer: {
            version: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
            policyDigest: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
            rowBindingSetDigest: input.snapshot.rowBindingSetDigest,
        },
        sourceSnapshotDigest: input.sourceSnapshot.sourceSnapshotDigest,
        tasks: input.taskProofs,
        rootLinks: input.rootLinks,
        privacy: { ...PRIVACY },
    };
    return {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: PROVENANCE_DOMAIN,
            ...core,
        }),
    };
}
async function readTaskMapStrategySourceAdapter(input) {
    const snapshot = snapshotInput(input);
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, snapshot.projection).currentProjectionDigest;
    const currentIds = currentTaskIds(snapshot.projection, snapshot.currentness, projectionDigest);
    const selected = selections(snapshot, currentIds);
    const locators = selected.map((row) => immutableLocator(row.source));
    const locator = locators[0];
    if (locators.some((row) => row.remoteLocator !== locator.remoteLocator
        || row.revision !== locator.revision
        || row.repositoryRelativePath !== locator.repositoryRelativePath)) {
        fail("repository_locator_mismatch");
    }
    const request = deepFreeze({
        ...locator,
        maximumBytes: exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumRepositoryFileBytes,
    });
    let rawObservation;
    try {
        rawObservation = await snapshot.readRepository(request);
    }
    catch {
        fail("repository_read_failed");
    }
    const observation = repositoryObservation(rawObservation, request);
    const repositoryBindingDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: REPOSITORY_BINDING_DOMAIN,
        remoteLocator: observation.remoteLocator,
        revision: observation.revision,
        repositoryRelativePath: observation.repositoryRelativePath,
        fileContentDigest: observation.contentDigest,
    });
    const rootLinks = new Map();
    const pointers = [];
    const events = [];
    const sourceBindings = [];
    const evidenceBindings = [];
    const envelopes = [];
    const taskProofs = [];
    for (const row of selected) {
        resolveRow(observation, row.task.taskHomePointerId, row.canonicalRowDigest);
        if (Date.parse(observation.committedAt)
            < Date.parse(row.citation.occurredAt)) {
            fail("repository_response_malformed");
        }
        const envelope = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ownerScopeDigest: snapshot.ownerScopeDigest,
            binding: snapshot.binding,
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: row.task.taskHomePointerId,
            sourceRevision: observation.revision,
            eventTime: observation.committedAt,
            contentDigest: row.canonicalRowDigest,
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
        const link = rootLinks.get(row.root.id) ?? acceptedRootLink(row.root);
        rootLinks.set(row.root.id, link);
        const pointerId = row.task.taskHomePointerId;
        if (!SAFE_ORIGIN.test(pointerId)
            || !SHA256.test(row.citation.sourceRefHash)) {
            fail("invalid_projection");
        }
        pointers.push({
            id: pointerId,
            sourceKind: "strategy",
            sourceObjectId: pointerId,
            sourceRefHash: row.citation.sourceRefHash,
            canonicalUrl: row.source.canonicalUrl,
            sourceVersion: row.canonicalRowDigest,
            authority: "source_system",
            syncMode: row.source.syncMode,
            capabilities: [...row.source.capabilities].sort(),
        });
        events.push({
            id: row.citation.eventId,
            pointerId,
            recordKind: "authoritative_task",
            activity: activity(row.task.sourceStatus),
            occurredAt: row.citation.occurredAt,
            observedAt: observation.committedAt,
            objectRefs: [link.rootLinkRef],
            title: row.task.title,
            summary: row.task.summary,
            extractionConfidence: row.citation.extractionConfidence,
            sourceStatus: row.task.sourceStatus,
        });
        sourceBindings.push({
            pointerId,
            semanticClass: "source_authoritative",
            semanticOriginId: pointerId,
            semanticIdentityDigest: row.citation.sourceRefHash,
            sourceIdentityDigest: envelope.sourceIdentityDigest,
            observedRevision: observation.revision,
            evidenceRevision: observation.revision,
            observedContentDigest: row.canonicalRowDigest,
            evidenceContentDigest: row.canonicalRowDigest,
        });
        evidenceBindings.push({
            eventId: row.citation.eventId,
            disposition: "source_authoritative",
            rootLinkRefs: [link.rootLinkRef],
        });
        envelopes.push(envelope);
        const proofCore = {
            taskId: row.task.id,
            rootId: row.root.id,
            pointerId,
            eventId: row.citation.eventId,
            rootLinkRef: link.rootLinkRef,
            sourceEnvelopeId: envelope.envelopeId,
            sourceIdentityDigest: envelope.sourceIdentityDigest,
            sourceRevision: observation.revision,
            canonicalRowDigest: row.canonicalRowDigest,
            projectionTaskDigest: (0, source_contracts_js_1.taskMapContractDigest)(row.task),
            projectionCitationDigest: (0, source_contracts_js_1.taskMapContractDigest)([row.citation]),
        };
        taskProofs.push({
            ...proofCore,
            proofDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                domain: TASK_PROOF_DOMAIN,
                adapterPolicyDigest: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
                rowBindingSetDigest: snapshot.rowBindingSetDigest,
                repositoryBindingDigest,
                ...proofCore,
            }),
        });
    }
    const sourceSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(envelopes, []);
    const acceptedRootLinks = [...rootLinks.values()].sort((left, right) => left.rootId.localeCompare(right.rootId));
    const exactProvenance = buildProvenance({
        snapshot,
        projectionDigest,
        currentIds,
        observation,
        sourceSnapshot,
        taskProofs: taskProofs.sort((left, right) => left.taskId.localeCompare(right.taskId)),
        rootLinks: acceptedRootLinks,
        repositoryBindingDigest,
    });
    const core = {
        contractVersion: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_RESULT_VERSION,
        adapterVersion: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_VERSION,
        adapterPolicyDigest: exports.TASKMAP_STRATEGY_SOURCE_ADAPTER_POLICY_DIGEST,
        rowBindingSetDigest: snapshot.rowBindingSetDigest,
        ownerScopeDigest: snapshot.ownerScopeDigest,
        taskMapInput: {
            contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
            generatedAt: observation.committedAt,
            pointers: pointers.sort((left, right) => left.id.localeCompare(right.id)),
            events: events.sort((left, right) => left.id.localeCompare(right.id)),
        },
        sourceBindings: sourceBindings.sort((left, right) => left.pointerId.localeCompare(right.pointerId)),
        evidenceBindings: evidenceBindings.sort((left, right) => left.eventId.localeCompare(right.eventId)),
        sourceSnapshot,
        exactProvenance,
        privacy: { ...PRIVACY },
    };
    const result = deepFreeze({
        ...core,
        resultDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: RESULT_DOMAIN,
            ...core,
        }),
    });
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(result), "utf8")
        > exports.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumResultBytes) {
        fail("result_limit_exceeded");
    }
    return result;
}
