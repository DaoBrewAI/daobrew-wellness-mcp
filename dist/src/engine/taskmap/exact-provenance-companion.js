"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_MIXED_SOURCE_ADAPTER_VERSION = exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST = exports.TASKMAP_MANUAL_RECEIPT_LOCATOR = exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION = exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST = exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1 = exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION = exports.TASKMAP_EXACT_PROVENANCE_VERSION = void 0;
exports.taskMapExactProvenanceAdapterExpectation = taskMapExactProvenanceAdapterExpectation;
exports.taskMapCanonicalRepositoryRowDigest = taskMapCanonicalRepositoryRowDigest;
exports.buildTaskMapExactProvenance = buildTaskMapExactProvenance;
exports.taskMapExactProvenanceDigest = taskMapExactProvenanceDigest;
exports.assertTaskMapExactProvenance = assertTaskMapExactProvenance;
const node_path_1 = __importDefault(require("node:path"));
const harness_js_1 = require("./harness.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_EXACT_PROVENANCE_VERSION = "taskmap-exact-provenance.v1";
exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION = "taskmap-exact-provenance-producer.1";
exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1 = Object.freeze({
    maximumArtifactBytes: 256 * 1_024,
    maximumTasks: 4_096,
    maximumRoots: 1_024,
    maximumEdges: 16_384,
    maximumRepositoryRelativePathBytes: 512,
    maximumCanonicalRowBytes: 16 * 1_024,
});
const PRODUCER_POLICY = Object.freeze({
    version: exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION,
    taskBinding: "projection_task_to_source_envelope_and_immutable_git_row_locator",
    legacyPointerMapping: "adapter_attested_not_source_native",
    currentness: "exhaustive_projection_bound_current_rows_only",
    rootMembership: "derived_from_projection_and_exact_current_task_proof_digests",
    edgeMembership: "derived_from_projection_and_exact_current_node_membership",
    executionEdgeEvidence: "operational_edge_requires_an_exact_task_source_citation",
    unversionedContext: "context_only_never_execution_provenance",
    privacy: "no_source_row_text_no_source_body_no_local_path_no_provider_fact_invention",
});
exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)(PRODUCER_POLICY);
const TASK_PROOF_DOMAIN = "taskmap-exact-task-provenance.1";
const ROOT_PROOF_DOMAIN = "taskmap-derived-root-provenance.1";
const EDGE_PROOF_DOMAIN = "taskmap-derived-edge-provenance.1";
const ARTIFACT_DOMAIN = "taskmap-exact-provenance-artifact.1";
const ADAPTER_ATTESTATION_DOMAIN = "taskmap-exact-provenance-adapter-attestation.1";
const REPOSITORY_BINDING_DOMAIN = "taskmap-exact-provenance-repository-binding.1";
const CANONICAL_ROW_DOMAIN = "taskmap-canonical-repository-row.1";
exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION = "taskmap-owner-receipt-adapter.1";
exports.TASKMAP_MANUAL_RECEIPT_LOCATOR = "owner-receipts/native-candidate-acceptance.v1.json";
exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)({
    adapterVersion: exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION,
    policy: "durable-owner-receipt-store-v1",
});
exports.TASKMAP_MIXED_SOURCE_ADAPTER_VERSION = "taskmap-mixed-current-source-adapter.1";
const MIXED_SOURCE_ADAPTER_POLICY_DOMAIN = "taskmap-mixed-current-source-adapter-policy.1";
const DIGEST = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,511}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OPERATIONAL_RELATIONS = new Set([
    "advances",
    "depends_on",
    "blocks",
    "supersedes",
]);
function fail(message) {
    throw new Error(`Task Map exact provenance unavailable: ${message}`);
}
function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function assertRecord(value, label) {
    if (!isRecord(value))
        fail(`${label} must be a plain object`);
}
function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    if (actual.length !== keys.length
        || actual.some((key, index) => key !== keys[index])) {
        fail(`${label} fields are invalid`);
    }
}
function assertDigest(value, label) {
    if (typeof value !== "string" || !DIGEST.test(value)) {
        fail(`${label} must be a lowercase SHA-256 digest`);
    }
}
function assertId(value, label) {
    if (typeof value !== "string" || !SAFE_ID.test(value)) {
        fail(`${label} is invalid`);
    }
}
function assertVersion(value, label) {
    if (typeof value !== "string" || !SAFE_VERSION.test(value)) {
        fail(`${label} is invalid`);
    }
}
function taskMapExactProvenanceAdapterExpectation(bindings) {
    if (bindings.length === 0) {
        fail("adapter expectation requires task bindings");
    }
    const policies = new Map();
    const rows = bindings.map((binding) => {
        assertId(binding.taskId, "task binding taskId");
        assertVersion(binding.adapterVersion, "task binding adapterVersion");
        assertDigest(binding.adapterPolicyDigest, "task binding adapterPolicyDigest");
        policies.set(binding.adapterVersion + ":" + binding.adapterPolicyDigest, {
            adapterVersion: binding.adapterVersion,
            adapterPolicyDigest: binding.adapterPolicyDigest,
        });
        return {
            taskId: binding.taskId,
            adapterVersion: binding.adapterVersion,
            adapterPolicyDigest: binding.adapterPolicyDigest,
        };
    }).sort((left, right) => left.taskId.localeCompare(right.taskId));
    if (policies.size === 1)
        return [...policies.values()][0];
    return {
        adapterVersion: exports.TASKMAP_MIXED_SOURCE_ADAPTER_VERSION,
        adapterPolicyDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: MIXED_SOURCE_ADAPTER_POLICY_DOMAIN,
            bindings: rows,
        }),
    };
}
function assertRepositoryRelativePath(value) {
    if (value.length === 0
        || Buffer.byteLength(value, "utf8")
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1
                .maximumRepositoryRelativePathBytes
        || value.includes("\\")
        || value.includes("\u0000")
        || value.startsWith("~")
        || node_path_1.default.posix.isAbsolute(value)
        || node_path_1.default.posix.normalize(value) !== value
        || value.split("/").some((component) => (component.length === 0
            || component === "."
            || component === ".."))) {
        fail("repositoryRelativePath must be one canonical repository-relative path");
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
function currentTaskIds(projection, currentness) {
    const projectionDigest = (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
    if (currentness.contractVersion
        !== "taskmap-native-currentness-gate.v1"
        || currentness.runId !== projection.runId
        || currentness.inputDigest !== projection.inputDigest
        || currentness.projectionDigest !== projectionDigest) {
        fail("currentness is not bound to the projection");
    }
    if (!Array.isArray(currentness.taskDispositions)
        || currentness.taskDispositions.length !== projection.tasks.length
        || currentness.taskDispositions.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumTasks) {
        fail("currentness must classify every projected task exactly once");
    }
    const seen = new Set();
    for (const row of currentness.taskDispositions) {
        assertRecord(row, "currentness disposition");
        assertExactKeys(row, ["taskId", "disposition"], "currentness disposition");
        assertId(row.taskId, "currentness taskId");
        if (row.disposition !== "current"
            && row.disposition !== "needs_lifecycle_review") {
            fail("currentness disposition is invalid");
        }
        if (seen.has(row.taskId))
            fail("currentness taskId is duplicated");
        seen.add(row.taskId);
    }
    const projectionIds = new Set(projection.tasks.map((task) => task.id));
    if (seen.size !== projectionIds.size
        || [...seen].some((taskId) => !projectionIds.has(taskId))) {
        fail("currentness task set does not match the projection");
    }
    const current = currentness.taskDispositions
        .filter((row) => row.disposition === "current")
        .map((row) => row.taskId)
        .sort();
    if (current.length === 0)
        fail("exact provenance requires current tasks");
    return current;
}
function validateProjection(projection) {
    if (projection.runStatus !== "accepted"
        || projection.rejections.length !== 0
        || projection.tasks.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumTasks
        || projection.roots.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumRoots
        || projection.edges.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumEdges) {
        fail("projection is not an accepted bounded artifact");
    }
    const reasons = (0, harness_js_1.taskMapProjectionArtifactValidationReasons)(projection);
    if (reasons.length > 0) {
        fail("projection schema or privacy validation failed");
    }
    return (0, source_contracts_js_1.diffTaskMapProjections)(null, projection).currentProjectionDigest;
}
function repositoryBindingDigest(envelope) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: REPOSITORY_BINDING_DOMAIN,
        sourceKind: envelope.sourceKind,
        binding: envelope.binding,
    });
}
function canonicalProjectionCitations(projection, taskId, pointerId) {
    const task = projection.tasks.find((row) => row.id === taskId);
    if (task === undefined)
        fail("task binding targets an absent task");
    const citations = task.citations
        .filter((citation) => citation.pointerId === pointerId)
        .sort((left, right) => (left.eventId.localeCompare(right.eventId)
        || left.sourceRefHash.localeCompare(right.sourceRefHash)
        || left.occurredAt.localeCompare(right.occurredAt)));
    if (citations.length === 0) {
        fail("task binding has no exact home-pointer citation");
    }
    const sourceRefHashes = new Set(citations.map((row) => row.sourceRefHash));
    if (sourceRefHashes.size !== 1) {
        fail("task binding citations disagree on source identity");
    }
    const sourceRefHash = [...sourceRefHashes][0];
    assertDigest(sourceRefHash, "projection sourceRefHash");
    return {
        sourceRefHash,
        citationDigest: (0, source_contracts_js_1.taskMapContractDigest)(citations),
    };
}
function assertExactTaskEnvelope(envelope) {
    const strategyRow = (envelope.sourceKind !== "strategy"
        ? false
        : envelope.authority.lifecycle === "source_status"
            && envelope.authority.completion === "source_status"
            && GIT_COMMIT.test(envelope.sourceRevision));
    const manualReceipt = (envelope.sourceKind !== "manual"
        ? false
        : envelope.authority.lifecycle === "explicit_user_policy"
            && envelope.authority.completion === "explicit_user_policy"
            && DIGEST.test(envelope.sourceRevision));
    if (envelope.objectType !== "authoritative_task"
        || envelope.authority.evidence !== "authoritative_task"
        || envelope.authority.quality !== "source_native"
        || envelope.authority.rank !== "accepted_work"
        || !DIGEST.test(envelope.contentDigest)
        || (!strategyRow && !manualReceipt)) {
        fail("task source envelope is not an immutable task authority record");
    }
}
function canonicalUrlBindsLocator(canonicalUrl, commit, repositoryRelativePath) {
    if (canonicalUrl === undefined)
        return false;
    try {
        const url = new URL(canonicalUrl);
        const segments = decodeURIComponent(url.pathname)
            .split("/")
            .filter(Boolean);
        return url.protocol === "https:"
            && url.hostname === "github.com"
            && url.port === ""
            && url.username === ""
            && url.password === ""
            && segments.length >= 5
            && segments[0].length > 0
            && segments[1].length > 0
            && segments[2] === "blob"
            && segments[3] === commit
            && segments.slice(4).join("/") === repositoryRelativePath
            && url.search === ""
            && url.hash === "";
    }
    catch {
        return false;
    }
}
function buildTaskProof(projection, envelope, binding) {
    assertId(binding.taskId, "task binding taskId");
    assertId(binding.sourceEnvelopeId, "task binding sourceEnvelopeId");
    assertVersion(binding.adapterVersion, "task binding adapterVersion");
    assertDigest(binding.adapterPolicyDigest, "task binding adapterPolicyDigest");
    assertRepositoryRelativePath(binding.repositoryRelativePath);
    if (envelope.envelopeId !== binding.sourceEnvelopeId) {
        fail("task binding envelope identity is inconsistent");
    }
    assertExactTaskEnvelope(envelope);
    const task = projection.tasks.find((row) => row.id === binding.taskId);
    const manualReceipt = envelope.sourceKind === "manual";
    if (manualReceipt
        && (binding.repositoryRelativePath !== exports.TASKMAP_MANUAL_RECEIPT_LOCATOR
            || binding.adapterVersion !== exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_VERSION
            || binding.adapterPolicyDigest
                !== exports.TASKMAP_MANUAL_RECEIPT_ADAPTER_POLICY_DIGEST
            || envelope.binding.connectionId !== "owner-receipt"
            || envelope.binding.sourceKind !== "manual"
            || envelope.binding.tenantOrWorkspaceDigest !== (0, source_contracts_js_1.taskMapContractDigest)({
                domain: "taskmap-owner-receipt-store.1",
                ownerScopeDigest: envelope.ownerScopeDigest,
            })
            || envelope.binding.accountOrPrincipalDigest
                !== envelope.ownerScopeDigest
            || envelope.binding.grantVersion !== "owner-confirmed-receipt-v1"
            || envelope.contentDigest !== envelope.sourceRevision
            || envelope.sourceObjectId
                !== "tmcandidatepromotion_" + envelope.sourceRevision))
        fail("manual task provenance lacks the fixed durable receipt invariant");
    if (task === undefined
        || task.reviewState !== "accepted"
        || task.authority !== (manualReceipt ? "user" : "source_system")
        || task.taskHomePointerId === undefined
        || !task.originPointerIds.includes(task.taskHomePointerId)) {
        fail("current task does not match its accepted authority record");
    }
    if (envelope.sourceObjectId !== task.taskHomePointerId) {
        fail("task source envelope does not match the task home pointer");
    }
    const source = projection.sources.find((row) => row.id === task.taskHomePointerId);
    if (source === undefined
        || source.sourceKind !== envelope.sourceKind
        || source.authority !== (manualReceipt ? "user" : "source_system")
        || source.sourceVersion !== envelope.sourceRevision
        || !source.capabilities.includes("read_task")
        || (manualReceipt
            ? source.syncMode !== "personal_fork"
            : !canonicalUrlBindsLocator(source.canonicalUrl, envelope.sourceRevision, binding.repositoryRelativePath))) {
        fail(manualReceipt
            ? "projection source does not bind the immutable authority locator"
            : "projection source does not bind the immutable repository locator");
    }
    const citation = canonicalProjectionCitations(projection, task.id, task.taskHomePointerId);
    const repositoryDigest = repositoryBindingDigest(envelope);
    const attestationCore = {
        domain: ADAPTER_ATTESTATION_DOMAIN,
        bindingAuthority: "adapter_attested",
        adapterVersion: binding.adapterVersion,
        adapterPolicyDigest: binding.adapterPolicyDigest,
        taskId: task.id,
        pointerId: task.taskHomePointerId,
        projectionSourceRefHash: citation.sourceRefHash,
        sourceEnvelopeId: envelope.envelopeId,
        sourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevision: envelope.sourceRevision,
        canonicalRowDigest: envelope.contentDigest,
        repositoryBindingDigest: repositoryDigest,
        repositoryRelativePath: binding.repositoryRelativePath,
    };
    const adapterAttestationDigest = (0, source_contracts_js_1.taskMapContractDigest)(attestationCore);
    const core = {
        taskId: task.id,
        pointerId: task.taskHomePointerId,
        projectionSourceRefHash: citation.sourceRefHash,
        projectionCitationDigest: citation.citationDigest,
        sourceEnvelopeId: envelope.envelopeId,
        sourceObjectKeyDigest: envelope.sourceObjectKeyDigest,
        sourceIdentityDigest: envelope.sourceIdentityDigest,
        sourceRevision: envelope.sourceRevision,
        canonicalRowDigest: envelope.contentDigest,
        repositoryBindingDigest: repositoryDigest,
        repositoryRelativePath: binding.repositoryRelativePath,
        bindingAuthority: "adapter_attested",
        adapterVersion: binding.adapterVersion,
        adapterPolicyDigest: binding.adapterPolicyDigest,
        adapterAttestationDigest,
    };
    return {
        ...core,
        proofDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: TASK_PROOF_DOMAIN,
            ...core,
        }),
    };
}
function buildRootProofs(projection, currentIds, tasks) {
    const currentSet = new Set(currentIds);
    const proofByTask = new Map(tasks.map((row) => [row.taskId, row]));
    return projection.roots.flatMap((root) => {
        const currentTaskIds = root.taskIds
            .filter((taskId) => currentSet.has(taskId))
            .sort();
        if (currentTaskIds.length === 0)
            return [];
        for (const taskId of currentTaskIds) {
            const task = projection.tasks.find((row) => row.id === taskId);
            if (task === undefined
                || task.rootId !== root.id
                || !proofByTask.has(taskId)) {
                fail("derived root membership is inconsistent");
            }
        }
        const currentTaskProofDigests = currentTaskIds.map((taskId) => proofByTask.get(taskId).proofDigest);
        const projectionRootDigest = (0, source_contracts_js_1.taskMapContractDigest)(root);
        const core = {
            rootId: root.id,
            factKind: "derived_projection",
            currentTaskIds,
            currentTaskProofDigests,
            producerDigest: exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST,
            algorithmPolicyDigest: projection.algorithmPolicyDigest,
            projectionRootDigest,
        };
        return [{
                ...core,
                derivationDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                    domain: ROOT_PROOF_DOMAIN,
                    ...core,
                }),
            }];
    }).sort((left, right) => left.rootId.localeCompare(right.rootId));
}
function buildEdgeProofs(projection, roots, tasks) {
    const visible = new Set([
        ...roots.map((root) => root.rootId),
        ...tasks.map((task) => task.taskId),
    ]);
    const proofByCitationIdentity = new Map();
    for (const task of tasks) {
        const key = `${task.pointerId}:${task.projectionSourceRefHash}`;
        const values = proofByCitationIdentity.get(key) ?? new Set();
        values.add(task.proofDigest);
        proofByCitationIdentity.set(key, values);
    }
    return projection.edges
        .filter((edge) => visible.has(edge.from) && visible.has(edge.to))
        .map((edge) => {
        const exactTaskProofDigests = [...new Set(edge.citations.flatMap((citation) => [
                ...(proofByCitationIdentity.get(`${citation.pointerId}:${citation.sourceRefHash}`) ?? []),
            ]))].sort();
        if (OPERATIONAL_RELATIONS.has(edge.relation)
            && exactTaskProofDigests.length === 0) {
            fail("operational route edge lacks exact task-source proof");
        }
        const executionEvidence = OPERATIONAL_RELATIONS.has(edge.relation)
            ? "exact_task_source"
            : "context_only";
        const projectionEdgeDigest = (0, source_contracts_js_1.taskMapContractDigest)(edge);
        const core = {
            edgeId: edge.id,
            factKind: "derived_projection",
            from: edge.from,
            to: edge.to,
            relation: edge.relation,
            executionEvidence,
            exactTaskProofDigests,
            producerDigest: exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST,
            algorithmPolicyDigest: projection.algorithmPolicyDigest,
            projectionEdgeDigest,
        };
        return {
            ...core,
            derivationDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                domain: EDGE_PROOF_DOMAIN,
                ...core,
            }),
        };
    })
        .sort((left, right) => left.edgeId.localeCompare(right.edgeId));
}
function artifactCore(artifact) {
    const { artifactDigest: _artifactDigest, ...core } = artifact;
    return core;
}
function taskMapCanonicalRepositoryRowDigest(input) {
    assertRepositoryRelativePath(input.repositoryRelativePath);
    assertId(input.sourceObjectId, "sourceObjectId");
    if (typeof input.rowText !== "string"
        || Buffer.byteLength(input.rowText, "utf8")
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumCanonicalRowBytes) {
        fail("canonical repository row is invalid");
    }
    const canonicalRow = input.rowText
        .replace(/\r\n?/g, "\n")
        .normalize("NFKC")
        .trim();
    if (canonicalRow.length === 0
        || canonicalRow.includes("\n")
        || canonicalRow.includes("\u0000")) {
        fail("canonical repository row must be one non-empty logical row");
    }
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: CANONICAL_ROW_DOMAIN,
        repositoryRelativePath: input.repositoryRelativePath,
        sourceObjectId: input.sourceObjectId,
        canonicalRow,
    });
}
function buildTaskMapExactProvenance(input) {
    const projectionDigest = validateProjection(input.projection);
    assertDigest(input.currentnessFileDigest, "currentnessFileDigest");
    assertDigest(input.expectedSourceSnapshotDigest, "expectedSourceSnapshotDigest");
    assertVersion(input.expectedAdapterVersion, "expectedAdapterVersion");
    assertDigest(input.expectedAdapterPolicyDigest, "expectedAdapterPolicyDigest");
    const currentIds = currentTaskIds(input.projection, input.currentness);
    const snapshot = (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(input.sourceSnapshot);
    if (snapshot.sourceSnapshotDigest !== input.expectedSourceSnapshotDigest) {
        fail("source snapshot does not match the externally expected digest");
    }
    if (snapshot.discoveryPointers.length !== 0
        || snapshot.canonicalMeetings.length !== 0
        || snapshot.envelopes.length !== currentIds.length) {
        fail("execution provenance snapshot must contain only current task envelopes");
    }
    if (!Array.isArray(input.taskBindings)
        || input.taskBindings.length !== currentIds.length) {
        fail("every current task requires one exact source binding");
    }
    const adapterExpectation = taskMapExactProvenanceAdapterExpectation(input.taskBindings);
    if (adapterExpectation.adapterVersion !== input.expectedAdapterVersion
        || adapterExpectation.adapterPolicyDigest
            !== input.expectedAdapterPolicyDigest) {
        fail("task binding does not match the externally expected adapter policy");
    }
    const bindingTaskIds = input.taskBindings.map((binding) => binding.taskId);
    const bindingEnvelopeIds = input.taskBindings.map((binding) => binding.sourceEnvelopeId);
    if (new Set(bindingTaskIds).size !== bindingTaskIds.length
        || new Set(bindingEnvelopeIds).size !== bindingEnvelopeIds.length
        || currentIds.some((taskId) => !bindingTaskIds.includes(taskId))
        || snapshot.envelopes.some((envelope) => !bindingEnvelopeIds.includes(envelope.envelopeId))) {
        fail("task and source envelope bindings must be exhaustive and unique");
    }
    const envelopeById = new Map(snapshot.envelopes.map((envelope) => [envelope.envelopeId, envelope]));
    const tasks = input.taskBindings
        .map((binding) => {
        const envelope = envelopeById.get(binding.sourceEnvelopeId);
        if (envelope === undefined)
            fail("task binding envelope is absent");
        return buildTaskProof(input.projection, envelope, binding);
    })
        .sort((left, right) => left.taskId.localeCompare(right.taskId));
    const roots = buildRootProofs(input.projection, currentIds, tasks);
    const rootedTaskIds = new Set(roots.flatMap((root) => root.currentTaskIds));
    if (rootedTaskIds.size !== currentIds.length
        || currentIds.some((taskId) => !rootedTaskIds.has(taskId))) {
        fail("derived roots do not cover every current task");
    }
    const edges = buildEdgeProofs(input.projection, roots, tasks);
    const core = {
        contractVersion: exports.TASKMAP_EXACT_PROVENANCE_VERSION,
        projection: {
            contractVersion: input.projection.contractVersion,
            runId: input.projection.runId,
            inputDigest: input.projection.inputDigest,
            projectionDigest,
            currentnessFileDigest: input.currentnessFileDigest,
            currentTaskSetDigest: (0, source_contracts_js_1.taskMapContractDigest)(currentIds),
        },
        producer: {
            version: exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION,
            policyDigest: exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST,
        },
        sourceSnapshot: snapshot,
        tasks,
        roots,
        edges,
        privacy: {
            sourceRowsStored: false,
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
            providerFactsInvented: false,
        },
    };
    const artifact = {
        ...core,
        artifactDigest: (0, source_contracts_js_1.taskMapContractDigest)({
            domain: ARTIFACT_DOMAIN,
            ...core,
        }),
    };
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact), "utf8")
        > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumArtifactBytes) {
        fail("artifact exceeds the byte limit");
    }
    return deepFreeze(artifact);
}
function assertArtifactShape(artifact) {
    assertRecord(artifact, "artifact");
    assertExactKeys(artifact, [
        "contractVersion",
        "artifactDigest",
        "projection",
        "producer",
        "sourceSnapshot",
        "tasks",
        "roots",
        "edges",
        "privacy",
    ], "artifact");
    if (artifact.contractVersion !== exports.TASKMAP_EXACT_PROVENANCE_VERSION) {
        fail("artifact version is unsupported");
    }
    assertDigest(artifact.artifactDigest, "artifactDigest");
    assertRecord(artifact.projection, "projection binding");
    assertExactKeys(artifact.projection, [
        "contractVersion",
        "runId",
        "inputDigest",
        "projectionDigest",
        "currentnessFileDigest",
        "currentTaskSetDigest",
    ], "projection binding");
    assertId(artifact.projection.contractVersion, "projection contractVersion");
    assertId(artifact.projection.runId, "projection runId");
    assertDigest(artifact.projection.inputDigest, "projection inputDigest");
    assertDigest(artifact.projection.projectionDigest, "projectionDigest");
    assertDigest(artifact.projection.currentnessFileDigest, "currentnessFileDigest");
    assertDigest(artifact.projection.currentTaskSetDigest, "currentTaskSetDigest");
    assertRecord(artifact.producer, "producer");
    assertExactKeys(artifact.producer, ["version", "policyDigest"], "producer");
    if (artifact.producer.version
        !== exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_VERSION
        || artifact.producer.policyDigest
            !== exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST) {
        fail("producer policy is unsupported");
    }
    if (!Array.isArray(artifact.tasks)
        || artifact.tasks.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumTasks
        || !Array.isArray(artifact.roots)
        || artifact.roots.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumRoots
        || !Array.isArray(artifact.edges)
        || artifact.edges.length
            > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumEdges) {
        fail("artifact rows exceed their bounds");
    }
    for (const task of artifact.tasks) {
        assertRecord(task, "task proof");
        assertExactKeys(task, [
            "taskId",
            "pointerId",
            "projectionSourceRefHash",
            "projectionCitationDigest",
            "sourceEnvelopeId",
            "sourceObjectKeyDigest",
            "sourceIdentityDigest",
            "sourceRevision",
            "canonicalRowDigest",
            "repositoryBindingDigest",
            "repositoryRelativePath",
            "bindingAuthority",
            "adapterVersion",
            "adapterPolicyDigest",
            "adapterAttestationDigest",
            "proofDigest",
        ], "task proof");
        assertId(task.taskId, "task proof taskId");
        assertId(task.pointerId, "task proof pointerId");
        assertDigest(task.projectionSourceRefHash, "task proof projectionSourceRefHash");
        assertDigest(task.projectionCitationDigest, "task proof projectionCitationDigest");
        assertId(task.sourceEnvelopeId, "task proof sourceEnvelopeId");
        assertDigest(task.sourceObjectKeyDigest, "task proof sourceObjectKeyDigest");
        assertDigest(task.sourceIdentityDigest, "task proof sourceIdentityDigest");
        if (!GIT_COMMIT.test(task.sourceRevision)
            && !DIGEST.test(task.sourceRevision)) {
            fail("task proof sourceRevision is not an immutable authority revision");
        }
        assertDigest(task.canonicalRowDigest, "task proof canonicalRowDigest");
        assertDigest(task.repositoryBindingDigest, "task proof repositoryBindingDigest");
        assertRepositoryRelativePath(task.repositoryRelativePath);
        if (task.bindingAuthority !== "adapter_attested") {
            fail("task proof binding authority is invalid");
        }
        assertVersion(task.adapterVersion, "task proof adapterVersion");
        assertDigest(task.adapterPolicyDigest, "task proof adapterPolicyDigest");
        assertDigest(task.adapterAttestationDigest, "task proof adapterAttestationDigest");
        assertDigest(task.proofDigest, "task proof proofDigest");
    }
    for (const root of artifact.roots) {
        assertRecord(root, "root proof");
        assertExactKeys(root, [
            "rootId",
            "factKind",
            "currentTaskIds",
            "currentTaskProofDigests",
            "producerDigest",
            "algorithmPolicyDigest",
            "projectionRootDigest",
            "derivationDigest",
        ], "root proof");
        assertId(root.rootId, "root proof rootId");
        if (root.factKind !== "derived_projection"
            || root.producerDigest
                !== exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST) {
            fail("root proof derivation label is invalid");
        }
        if (!Array.isArray(root.currentTaskIds)
            || !Array.isArray(root.currentTaskProofDigests)
            || root.currentTaskIds.length !== root.currentTaskProofDigests.length) {
            fail("root proof membership is invalid");
        }
        root.currentTaskIds.forEach((id) => assertId(id, "root proof taskId"));
        root.currentTaskProofDigests.forEach((digest) => assertDigest(digest, "root proof task digest"));
        assertDigest(root.algorithmPolicyDigest, "root algorithmPolicyDigest");
        assertDigest(root.projectionRootDigest, "root projectionRootDigest");
        assertDigest(root.derivationDigest, "root derivationDigest");
    }
    for (const edge of artifact.edges) {
        assertRecord(edge, "edge proof");
        assertExactKeys(edge, [
            "edgeId",
            "factKind",
            "from",
            "to",
            "relation",
            "executionEvidence",
            "exactTaskProofDigests",
            "producerDigest",
            "algorithmPolicyDigest",
            "projectionEdgeDigest",
            "derivationDigest",
        ], "edge proof");
        assertId(edge.edgeId, "edge proof edgeId");
        assertId(edge.from, "edge proof from");
        assertId(edge.to, "edge proof to");
        if (edge.factKind !== "derived_projection"
            || edge.producerDigest
                !== exports.TASKMAP_EXACT_PROVENANCE_PRODUCER_POLICY_DIGEST
            || ![
                "exact_task_source",
                "context_only",
            ].includes(edge.executionEvidence)
            || !Array.isArray(edge.exactTaskProofDigests)) {
            fail("edge proof derivation is invalid");
        }
        edge.exactTaskProofDigests.forEach((digest) => assertDigest(digest, "edge proof task digest"));
        assertDigest(edge.algorithmPolicyDigest, "edge algorithmPolicyDigest");
        assertDigest(edge.projectionEdgeDigest, "edge projectionEdgeDigest");
        assertDigest(edge.derivationDigest, "edge derivationDigest");
    }
    assertRecord(artifact.privacy, "privacy");
    assertExactKeys(artifact.privacy, [
        "sourceRowsStored",
        "sourceBodiesStored",
        "localPathsStored",
        "rawBiometricsStored",
        "providerFactsInvented",
    ], "privacy");
    if (artifact.privacy.sourceRowsStored !== false
        || artifact.privacy.sourceBodiesStored !== false
        || artifact.privacy.localPathsStored !== false
        || artifact.privacy.rawBiometricsStored !== false
        || artifact.privacy.providerFactsInvented !== false) {
        fail("artifact privacy boundary is invalid");
    }
}
function taskMapExactProvenanceDigest(artifact) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: ARTIFACT_DOMAIN,
        ...artifactCore(artifact),
    });
}
function assertTaskMapExactProvenance(artifact, context) {
    assertArtifactShape(artifact);
    if (Buffer.byteLength((0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact), "utf8")
        > exports.TASKMAP_EXACT_PROVENANCE_LIMITS_V1.maximumArtifactBytes) {
        fail("artifact exceeds the byte limit");
    }
    (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(artifact.sourceSnapshot);
    const rebuilt = buildTaskMapExactProvenance({
        projection: context.projection,
        currentness: context.currentness,
        currentnessFileDigest: context.currentnessFileDigest,
        expectedSourceSnapshotDigest: context.expectedSourceSnapshotDigest,
        expectedAdapterVersion: context.expectedAdapterVersion,
        expectedAdapterPolicyDigest: context.expectedAdapterPolicyDigest,
        sourceSnapshot: artifact.sourceSnapshot,
        taskBindings: artifact.tasks.map((task) => ({
            taskId: task.taskId,
            sourceEnvelopeId: task.sourceEnvelopeId,
            repositoryRelativePath: task.repositoryRelativePath,
            adapterVersion: task.adapterVersion,
            adapterPolicyDigest: task.adapterPolicyDigest,
        })),
    });
    if ((0, source_contracts_js_1.taskMapContractCanonicalJson)(rebuilt)
        !== (0, source_contracts_js_1.taskMapContractCanonicalJson)(artifact)
        || taskMapExactProvenanceDigest(artifact) !== artifact.artifactDigest) {
        fail("artifact digest or derived proof is invalid");
    }
    return rebuilt;
}
