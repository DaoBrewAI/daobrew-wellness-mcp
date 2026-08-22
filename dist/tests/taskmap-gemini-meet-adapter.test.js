"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const gemini_meet_adapter_js_1 = require("../src/engine/taskmap/gemini-meet-adapter.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const refresh_run_bundle_js_1 = require("../src/engine/taskmap/refresh-run-bundle.js");
const OWNER_SCOPE_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)("synthetic-gemini-adapter-owner");
const DRIVE_BINDING = {
    connectionId: "synthetic-drive-primary",
    sourceKind: "gemini_meet",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-google-workspace"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-google-principal"),
    grantVersion: "synthetic-drive-read-v1",
};
function meetingDocument(documentId = "synthetic-gemini-doc-1", revisionId = "synthetic-drive-revision-1", contentSeed = "synthetic-content-1") {
    return {
        documentId,
        revisionId,
        eventTime: "2026-07-28T16:00:00.000Z",
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)(contentSeed),
        quality: "structured_generated",
        meetingIdentity: {
            fingerprintVersion: "taskmap-meeting-fingerprint.1",
            startAt: "2026-07-28T16:00:00.000Z",
            endAt: "2026-07-28T16:30:00.000Z",
            calendarEventIdDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-calendar-event-1"),
            normalizedTitleDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-weekly-sync"),
            participantSetDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-participant-set"),
        },
    };
}
function driveProvider(documents, options = {}) {
    const byId = new Map(documents.map((document) => [document.documentId, document]));
    return {
        async listCurrentMeetingDocumentRefs(request) {
            options.calls?.push(`list:${request.limit}`);
            node_assert_1.default.ok(Object.isFrozen(request));
            if (options.listResponse !== undefined) {
                return options.listResponse;
            }
            return {
                documents: documents.map((document) => ({
                    documentId: document.documentId,
                    revisionId: document.revisionId,
                })),
            };
        },
        async readMeetingDocumentMetadata(request) {
            options.calls?.push(`read:${request.documentId}`);
            node_assert_1.default.ok(Object.isFrozen(request));
            if (options.failDocumentIds?.has(request.documentId)) {
                throw new Error("synthetic sensitive provider detail");
            }
            const document = byId.get(request.documentId);
            node_assert_1.default.ok(document);
            node_assert_1.default.strictEqual(document.revisionId, request.revisionId);
            return options.mutateReadResponse?.(structuredClone(document))
                ?? { document: structuredClone(document) };
        },
    };
}
function adapterInput(drive, attemptedAt = "2026-07-28T17:00:00.000Z", extra = {}) {
    return {
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        attemptedAt,
        driveBinding: DRIVE_BINDING,
        driveProvider: drive,
        ...extra,
    };
}
(0, node_test_1.describe)("Task Map P12.1a Gemini Meet adapter", () => {
    (0, node_test_1.it)("uses Drive document identity and revision for immutable P9 and P10 inputs", async () => {
        const calls = [];
        const document = meetingDocument();
        const result = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document], { calls })));
        node_assert_1.default.strictEqual(result.state, "success");
        node_assert_1.default.strictEqual(result.envelopes.length, 1);
        node_assert_1.default.strictEqual(result.envelopes[0].sourceObjectId, document.documentId);
        node_assert_1.default.strictEqual(result.envelopes[0].sourceRevision, document.revisionId);
        node_assert_1.default.strictEqual(result.discoveryPointers.length, 0);
        node_assert_1.default.strictEqual(result.canonicalMeetings.length, 1);
        node_assert_1.default.strictEqual(result.sourceSnapshot?.canonicalMeetings.length, 1);
        node_assert_1.default.strictEqual(result.checkpoint.state, "success");
        node_assert_1.default.strictEqual(result.checkpoint.adapterVersion, gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_ADAPTER_VERSION);
        node_assert_1.default.deepStrictEqual(result.checkpoint.acceptedSourceIdentityDigests, [result.envelopes[0].sourceIdentityDigest]);
        node_assert_1.default.strictEqual(result.refreshInputs.sourceBinding.bindingDigest, (0, source_contracts_js_1.taskMapContractDigest)(DRIVE_BINDING));
        node_assert_1.default.strictEqual(result.refreshInputs.sourceRevisions[0].sourceRevisionDigest, (0, source_contracts_js_1.taskMapContractDigest)(document.revisionId));
        node_assert_1.default.strictEqual(result.refreshInputs.sourceRevisionSet.revisionSetDigest, result.refreshInputs.sourceSliceProof.sourceRevisionSetDigest);
        node_assert_1.default.strictEqual(result.refreshInputs.checkpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(result.checkpoint));
        node_assert_1.default.strictEqual(result.refreshInputs.servingDisposition, "current_source");
        node_assert_1.default.strictEqual(result.refreshInputs.semanticInputDigest, result.sourceSnapshot?.semanticInputDigest);
        node_assert_1.default.strictEqual(result.refreshInputs.emptyObservationDigest, undefined);
        node_assert_1.default.deepStrictEqual(calls, [
            `list:${gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments}`,
            `read:${document.documentId}`,
        ]);
        node_assert_1.default.ok(Object.isFrozen(result));
        node_assert_1.default.ok(Object.isFrozen(result.envelopes[0]));
        node_assert_1.default.ok(Object.isFrozen(result.refreshInputs));
    });
    (0, node_test_1.it)("keeps an authoritative empty Drive observation non-serving or retained for review", async () => {
        const genesisEmpty = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([])));
        node_assert_1.default.strictEqual(genesisEmpty.state, "empty_requires_review");
        node_assert_1.default.strictEqual(genesisEmpty.checkpoint.state, "partial");
        node_assert_1.default.strictEqual(genesisEmpty.checkpoint.error?.code, "provider_partial_result");
        node_assert_1.default.strictEqual(genesisEmpty.envelopes.length, 0);
        node_assert_1.default.strictEqual(genesisEmpty.sourceSnapshot, undefined);
        node_assert_1.default.strictEqual(genesisEmpty.failures.length, 0);
        node_assert_1.default.strictEqual(genesisEmpty.emptyObservation?.contractVersion, gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION);
        node_assert_1.default.strictEqual(genesisEmpty.emptyObservation?.disposition, "non_serving");
        node_assert_1.default.strictEqual(genesisEmpty.emptyObservation?.authoritativeDocumentCount, 0);
        node_assert_1.default.strictEqual(genesisEmpty.checkpoint.error?.detailDigest, genesisEmpty.emptyObservation?.observationDigest);
        node_assert_1.default.strictEqual(genesisEmpty.refreshInputs.servingDisposition, "non_serving");
        node_assert_1.default.strictEqual(genesisEmpty.refreshInputs.sourceSliceProof.sliceRole, "observed_non_serving");
        node_assert_1.default.deepStrictEqual(genesisEmpty.refreshInputs.sourceRevisions, []);
        node_assert_1.default.strictEqual(genesisEmpty.refreshInputs.semanticInputDigest, undefined);
        node_assert_1.default.strictEqual(genesisEmpty.refreshInputs.emptyObservationDigest, genesisEmpty.emptyObservation?.observationDigest);
        node_assert_1.default.deepStrictEqual((0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(genesisEmpty.checkpoint), genesisEmpty.checkpoint);
        node_assert_1.default.deepStrictEqual((0, refresh_run_bundle_js_1.assertTaskMapRefreshRunSourceSliceProof)(genesisEmpty.refreshInputs.sourceSliceProof), genesisEmpty.refreshInputs.sourceSliceProof);
        const repeatedEmpty = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([]), "2026-07-28T18:00:00.000Z", {
            previous: {
                checkpoint: genesisEmpty.checkpoint,
                sourceSliceProof: genesisEmpty.refreshInputs.sourceSliceProof,
            },
        }));
        node_assert_1.default.strictEqual(repeatedEmpty.emptyObservation?.disposition, "non_serving");
        node_assert_1.default.strictEqual(repeatedEmpty.emptyObservation?.retainedSourceSliceDigest, undefined);
        node_assert_1.default.strictEqual(repeatedEmpty.refreshInputs.servingDisposition, "non_serving");
        const document = meetingDocument();
        const baseline = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document])));
        const retainedEmpty = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([]), "2026-07-28T18:00:00.000Z", {
            previous: {
                checkpoint: baseline.checkpoint,
                sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: baseline.canonicalMeetings,
        }));
        node_assert_1.default.strictEqual(retainedEmpty.state, "empty_requires_review");
        node_assert_1.default.strictEqual(retainedEmpty.emptyObservation?.disposition, "retained_last_good");
        node_assert_1.default.strictEqual(retainedEmpty.emptyObservation?.priorCheckpointDigest, (0, source_contracts_js_1.taskMapContractDigest)(baseline.checkpoint));
        node_assert_1.default.strictEqual(retainedEmpty.emptyObservation?.retainedSourceSliceDigest, baseline.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.strictEqual(retainedEmpty.refreshInputs.servingDisposition, "retained_last_good");
        node_assert_1.default.strictEqual(retainedEmpty.refreshInputs.sourceSliceProof.sourceSliceDigest, baseline.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.deepStrictEqual(retainedEmpty.checkpoint.watermark, baseline.checkpoint.watermark);
        node_assert_1.default.deepStrictEqual(retainedEmpty.checkpoint.acceptedSourceIdentityDigests, baseline.checkpoint.acceptedSourceIdentityDigests);
        node_assert_1.default.strictEqual(retainedEmpty.refreshInputs.semanticInputDigest, undefined);
        node_assert_1.default.deepStrictEqual((0, refresh_run_bundle_js_1.assertTaskMapRefreshRunSourceSliceProof)(retainedEmpty.refreshInputs.sourceSliceProof), retainedEmpty.refreshInputs.sourceSliceProof);
    });
    (0, node_test_1.it)("keeps a full 64-document Drive page incomplete when a 65th may be hidden", async () => {
        const documents = Array.from({ length: 65 }, (_, index) => (meetingDocument(`synthetic-capped-page-doc-${index}`, `synthetic-capped-page-revision-${index}`, `synthetic-capped-page-content-${index}`)));
        const requestedLimits = [];
        const cappedProvider = () => {
            const byId = new Map(documents.map((document) => [document.documentId, document]));
            return {
                async listCurrentMeetingDocumentRefs(request) {
                    requestedLimits.push(request.limit);
                    return {
                        documents: documents
                            .slice(0, request.limit)
                            .map((document) => ({
                            documentId: document.documentId,
                            revisionId: document.revisionId,
                        })),
                    };
                },
                async readMeetingDocumentMetadata(request) {
                    const document = byId.get(request.documentId);
                    node_assert_1.default.ok(document);
                    return { document: structuredClone(document) };
                },
            };
        };
        const genesis = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(cappedProvider()));
        node_assert_1.default.strictEqual(genesis.state, "incomplete_requires_review");
        node_assert_1.default.strictEqual(genesis.envelopes.length, 64);
        node_assert_1.default.ok(!genesis.envelopes.some((envelope) => (envelope.sourceObjectId === documents[64].documentId)));
        node_assert_1.default.strictEqual(genesis.sourceSnapshot, undefined);
        node_assert_1.default.strictEqual(genesis.refreshInputs.semanticInputDigest, undefined);
        node_assert_1.default.strictEqual(genesis.refreshInputs.servingDisposition, "non_serving");
        node_assert_1.default.strictEqual(genesis.refreshInputs.sourceSliceProof.sliceRole, "observed_non_serving");
        node_assert_1.default.deepStrictEqual(genesis.refreshInputs.sourceRevisions, []);
        node_assert_1.default.strictEqual(genesis.checkpoint.state, "partial");
        node_assert_1.default.strictEqual(genesis.checkpoint.error?.code, "provider_partial_result");
        node_assert_1.default.strictEqual(genesis.failures.length, 1);
        node_assert_1.default.strictEqual(genesis.failures[0].code, "drive_list_incomplete");
        node_assert_1.default.strictEqual(genesis.failures[0].blockingForServing, true);
        node_assert_1.default.strictEqual(genesis.failures[0].retryable, true);
        node_assert_1.default.deepStrictEqual((0, refresh_run_bundle_js_1.assertTaskMapRefreshRunSourceSliceProof)(genesis.refreshInputs.sourceSliceProof), genesis.refreshInputs.sourceSliceProof);
        const baseline = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([meetingDocument()])));
        const retained = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(cappedProvider(), "2026-07-28T18:00:00.000Z", {
            previous: {
                checkpoint: baseline.checkpoint,
                sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: baseline.canonicalMeetings,
        }));
        node_assert_1.default.strictEqual(retained.state, "incomplete_requires_review");
        node_assert_1.default.strictEqual(retained.sourceSnapshot, undefined);
        node_assert_1.default.strictEqual(retained.refreshInputs.semanticInputDigest, undefined);
        node_assert_1.default.strictEqual(retained.refreshInputs.servingDisposition, "retained_last_good");
        node_assert_1.default.strictEqual(retained.refreshInputs.sourceSliceProof.sourceSliceDigest, baseline.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.deepStrictEqual(retained.checkpoint.watermark, baseline.checkpoint.watermark);
        node_assert_1.default.deepStrictEqual(retained.checkpoint.acceptedSourceIdentityDigests, baseline.checkpoint.acceptedSourceIdentityDigests);
        node_assert_1.default.strictEqual(retained.failures[0].code, "drive_list_incomplete");
        node_assert_1.default.deepStrictEqual(requestedLimits, [
            gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
            gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
        ]);
    });
    (0, node_test_1.it)("treats Drive revisions as the sole primary source and detects exact no-ops", async () => {
        const document = meetingDocument();
        const first = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document])));
        const noEmail = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document]), "2026-07-28T18:00:00.000Z", {
            previous: {
                checkpoint: first.checkpoint,
                sourceSliceProof: first.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: first.canonicalMeetings,
        }));
        node_assert_1.default.strictEqual(noEmail.state, "success");
        node_assert_1.default.strictEqual(noEmail.isExactNoOp, true);
        node_assert_1.default.strictEqual(noEmail.envelopes[0].sourceIdentityDigest, first.envelopes[0].sourceIdentityDigest);
        node_assert_1.default.strictEqual(noEmail.checkpoint.watermark?.valueDigest, first.checkpoint.watermark?.valueDigest);
        node_assert_1.default.strictEqual(noEmail.refreshInputs.sourceSliceProof.sourceSliceDigest, first.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.notStrictEqual(noEmail.checkpoint.checkpointId, first.checkpoint.checkpointId);
        node_assert_1.default.deepStrictEqual(noEmail.canonicalMeetings, first.canonicalMeetings);
        const correctedMeetingTime = {
            ...document,
            meetingIdentity: {
                ...document.meetingIdentity,
                startAt: "2026-07-28T16:05:00.000Z",
                endAt: "2026-07-28T16:35:00.000Z",
            },
        };
        const corrected = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([correctedMeetingTime]), "2026-07-28T18:30:00.000Z", {
            previous: {
                checkpoint: noEmail.checkpoint,
                sourceSliceProof: noEmail.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: noEmail.canonicalMeetings,
        }));
        node_assert_1.default.strictEqual(corrected.envelopes[0].sourceIdentityDigest, noEmail.envelopes[0].sourceIdentityDigest);
        node_assert_1.default.strictEqual(corrected.refreshInputs.sourceSliceProof.sourceSliceDigest, noEmail.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.notStrictEqual(corrected.checkpoint.watermark?.valueDigest, noEmail.checkpoint.watermark?.valueDigest);
        node_assert_1.default.strictEqual(corrected.isExactNoOp, false);
        const changedDocument = meetingDocument(document.documentId, "synthetic-drive-revision-2", "synthetic-content-2");
        const changed = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([changedDocument]), "2026-07-28T19:00:00.000Z", {
            previous: {
                checkpoint: corrected.checkpoint,
                sourceSliceProof: corrected.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: corrected.canonicalMeetings,
        }));
        node_assert_1.default.strictEqual(changed.isExactNoOp, false);
        node_assert_1.default.notStrictEqual(changed.envelopes[0].sourceIdentityDigest, first.envelopes[0].sourceIdentityDigest);
        node_assert_1.default.notStrictEqual(changed.checkpoint.watermark?.valueDigest, first.checkpoint.watermark?.valueDigest);
        node_assert_1.default.notStrictEqual(changed.refreshInputs.sourceRevisionSet.revisionSetDigest, first.refreshInputs.sourceRevisionSet.revisionSetDigest);
        node_assert_1.default.strictEqual(changed.canonicalMeetings[0].canonicalMeetingId, first.canonicalMeetings[0].canonicalMeetingId);
    });
    (0, node_test_1.it)("snapshots owner, binding, provider methods, and previous state before the first await", async () => {
        const document = meetingDocument();
        const baseline = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document])));
        const ownerB = (0, source_contracts_js_1.taskMapContractDigest)("synthetic-mutated-owner-b");
        const mutableBindingA = structuredClone(DRIVE_BINDING);
        const expectedBindingA = structuredClone(mutableBindingA);
        const bindingB = {
            connectionId: "synthetic-drive-mutated-b",
            sourceKind: "gemini_meet",
            tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-mutated-workspace-b"),
            accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-mutated-principal-b"),
            grantVersion: "synthetic-drive-read-b",
        };
        const maliciousDocument = meetingDocument("synthetic-mutated-doc-b", "synthetic-mutated-revision-b", "synthetic-mutated-content-b");
        let mutableInput;
        const provider = {
            async listCurrentMeetingDocumentRefs() {
                mutableInput.ownerScopeDigest = ownerB;
                mutableInput.attemptedAt = "2026-07-28T20:00:00.000Z";
                mutableBindingA.tenantOrWorkspaceDigest =
                    bindingB.tenantOrWorkspaceDigest;
                mutableBindingA.accountOrPrincipalDigest =
                    bindingB.accountOrPrincipalDigest;
                mutableInput.driveBinding = bindingB;
                mutableInput.previous = undefined;
                mutableInput.previousCanonicalMeetings = [];
                provider.readMeetingDocumentMetadata = async () => ({
                    document: maliciousDocument,
                });
                mutableInput.driveProvider = driveProvider([maliciousDocument]);
                return {
                    documents: [{
                            documentId: document.documentId,
                            revisionId: document.revisionId,
                        }],
                };
            },
            async readMeetingDocumentMetadata() {
                return { document: structuredClone(document) };
            },
        };
        mutableInput = {
            ownerScopeDigest: OWNER_SCOPE_DIGEST,
            attemptedAt: "2026-07-28T18:00:00.000Z",
            driveBinding: mutableBindingA,
            driveProvider: provider,
            previous: {
                checkpoint: baseline.checkpoint,
                sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
            },
            previousCanonicalMeetings: baseline.canonicalMeetings,
        };
        const result = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(mutableInput);
        node_assert_1.default.strictEqual(result.state, "success");
        node_assert_1.default.strictEqual(result.isExactNoOp, true);
        node_assert_1.default.strictEqual(result.envelopes[0].ownerScopeDigest, OWNER_SCOPE_DIGEST);
        node_assert_1.default.strictEqual(result.envelopes[0].sourceObjectId, document.documentId);
        node_assert_1.default.deepStrictEqual(result.checkpoint.binding, expectedBindingA);
        node_assert_1.default.strictEqual(result.checkpoint.lastAttemptAt, "2026-07-28T18:00:00.000Z");
        node_assert_1.default.strictEqual(result.refreshInputs.sourceBinding.bindingDigest, (0, source_contracts_js_1.taskMapContractDigest)(expectedBindingA));
        node_assert_1.default.deepStrictEqual(result.canonicalMeetings, baseline.canonicalMeetings);
        node_assert_1.default.ok(!JSON.stringify(result).includes(ownerB));
        node_assert_1.default.ok(!JSON.stringify(result).includes(maliciousDocument.documentId));
    });
    (0, node_test_1.it)("retains the last-good P10 slice and emits digest-only retryable per-source failure", async () => {
        const firstDocument = meetingDocument();
        const secondDocument = meetingDocument("synthetic-gemini-doc-2", "synthetic-drive-revision-2", "synthetic-content-2");
        const baseline = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([firstDocument, secondDocument])));
        const partial = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([firstDocument, secondDocument], { failDocumentIds: new Set([secondDocument.documentId]) }), "2026-07-28T18:00:00.000Z", {
            previous: {
                checkpoint: baseline.checkpoint,
                sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
            },
        }));
        node_assert_1.default.strictEqual(partial.state, "partial");
        node_assert_1.default.strictEqual(partial.envelopes.length, 1);
        node_assert_1.default.strictEqual(partial.sourceSnapshot, undefined);
        node_assert_1.default.strictEqual(partial.failures.length, 1);
        node_assert_1.default.strictEqual(partial.failures[0].code, "drive_document_unavailable");
        node_assert_1.default.strictEqual(partial.failures[0].retryable, true);
        node_assert_1.default.strictEqual(partial.failures[0].blockingForServing, true);
        node_assert_1.default.strictEqual(partial.checkpoint.error?.code, "provider_partial_result");
        node_assert_1.default.deepStrictEqual(partial.checkpoint.watermark, baseline.checkpoint.watermark);
        node_assert_1.default.deepStrictEqual(partial.checkpoint.acceptedSourceIdentityDigests, baseline.checkpoint.acceptedSourceIdentityDigests);
        node_assert_1.default.strictEqual(partial.refreshInputs.sourceSliceProof.sourceSliceDigest, baseline.refreshInputs.sourceSliceProof.sourceSliceDigest);
        node_assert_1.default.strictEqual(partial.refreshInputs.servingDisposition, "retained_last_good");
        node_assert_1.default.strictEqual(partial.refreshInputs.semanticInputDigest, undefined);
        node_assert_1.default.ok(!JSON.stringify(partial).includes("synthetic sensitive provider detail"));
    });
    (0, node_test_1.it)("denies source and email bodies in Drive metadata", async () => {
        const document = meetingDocument();
        for (const forbiddenField of [
            "body",
            "transcript",
            "summary",
            "emailBody",
        ]) {
            const result = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document], {
                mutateReadResponse: (value) => ({
                    document: {
                        ...value,
                        [forbiddenField]: "synthetic-private-body-value",
                    },
                }),
            })));
            node_assert_1.default.strictEqual(result.state, "failed");
            node_assert_1.default.strictEqual(result.failures[0].code, "drive_document_malformed");
            node_assert_1.default.strictEqual(result.envelopes.length, 0);
            node_assert_1.default.ok(!JSON.stringify(result).includes(forbiddenField));
            node_assert_1.default.ok(!JSON.stringify(result).includes("synthetic-private-body-value"));
        }
        const clean = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([document])));
        node_assert_1.default.deepStrictEqual(clean.privacy, {
            sourceBodiesStored: false,
            emailBodiesStored: false,
            participantDetailsStored: false,
            credentialsStored: false,
            rawProviderResponsesStored: false,
            localPathsStored: false,
        });
    });
    (0, node_test_1.it)("fails closed on malformed, proxy-backed, and over-limit provider responses", async () => {
        const malformed = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([], { listResponse: { documents: "not-an-array" } })));
        node_assert_1.default.strictEqual(malformed.state, "failed");
        node_assert_1.default.strictEqual(malformed.failures[0].code, "drive_list_malformed");
        let proxyTraps = 0;
        const proxy = new Proxy({
            documentId: "synthetic-proxy-document",
            revisionId: "synthetic-proxy-revision",
        }, {
            get() {
                proxyTraps += 1;
                throw new Error("proxy get must not run");
            },
            ownKeys() {
                proxyTraps += 1;
                throw new Error("proxy ownKeys must not run");
            },
        });
        const proxied = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(driveProvider([], { listResponse: { documents: [proxy] } })));
        node_assert_1.default.strictEqual(proxied.state, "failed");
        node_assert_1.default.strictEqual(proxied.failures[0].code, "drive_list_proxy");
        node_assert_1.default.strictEqual(proxyTraps, 0);
        let readCalls = 0;
        const overLimitProvider = {
            async listCurrentMeetingDocumentRefs() {
                return {
                    documents: Array.from({
                        length: gemini_meet_adapter_js_1.TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments + 1,
                    }, (_, index) => ({
                        documentId: `synthetic-doc-${index}`,
                        revisionId: "synthetic-revision",
                    })),
                };
            },
            async readMeetingDocumentMetadata() {
                readCalls += 1;
                return { document: meetingDocument() };
            },
        };
        const overLimit = await (0, gemini_meet_adapter_js_1.readTaskMapGeminiMeetAdapter)(adapterInput(overLimitProvider));
        node_assert_1.default.strictEqual(overLimit.state, "failed");
        node_assert_1.default.strictEqual(overLimit.failures[0].code, "drive_list_limit");
        node_assert_1.default.strictEqual(readCalls, 0);
        node_assert_1.default.strictEqual(overLimit.checkpoint.error?.code, "provider_unavailable");
        node_assert_1.default.strictEqual(overLimit.refreshInputs.sourceSliceProof.sliceRole, "observed_non_serving");
    });
});
