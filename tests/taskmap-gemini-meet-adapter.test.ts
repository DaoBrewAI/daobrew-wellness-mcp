import assert from "node:assert";
import { describe, it } from "node:test";
import {
  TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1,
  TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
  TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION,
  readTaskMapGeminiMeetAdapter,
  type TaskMapGeminiMeetAdapterInputV1,
  type TaskMapGeminiMeetDriveDocumentMetadataV1,
  type TaskMapGeminiMeetDriveProviderV1,
} from "../src/engine/taskmap/gemini-meet-adapter.js";
import {
  assertTaskMapConnectorCheckpoint,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  assertTaskMapRefreshRunSourceSliceProof,
} from "../src/engine/taskmap/refresh-run-bundle.js";
import type {
  TaskMapSourceAuthorityBindingV1,
} from "../src/engine/taskmap/types.js";

const OWNER_SCOPE_DIGEST = taskMapContractDigest(
  "synthetic-gemini-adapter-owner",
);
const DRIVE_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "synthetic-drive-primary",
  sourceKind: "gemini_meet",
  tenantOrWorkspaceDigest: taskMapContractDigest(
    "synthetic-google-workspace",
  ),
  accountOrPrincipalDigest: taskMapContractDigest(
    "synthetic-google-principal",
  ),
  grantVersion: "synthetic-drive-read-v1",
};
function meetingDocument(
  documentId = "synthetic-gemini-doc-1",
  revisionId = "synthetic-drive-revision-1",
  contentSeed = "synthetic-content-1",
): TaskMapGeminiMeetDriveDocumentMetadataV1 {
  return {
    documentId,
    revisionId,
    eventTime: "2026-07-28T16:00:00.000Z",
    contentDigest: taskMapContractDigest(contentSeed),
    quality: "structured_generated",
    meetingIdentity: {
      fingerprintVersion: "taskmap-meeting-fingerprint.1",
      startAt: "2026-07-28T16:00:00.000Z",
      endAt: "2026-07-28T16:30:00.000Z",
      calendarEventIdDigest: taskMapContractDigest(
        "synthetic-calendar-event-1",
      ),
      normalizedTitleDigest: taskMapContractDigest(
        "synthetic-weekly-sync",
      ),
      participantSetDigest: taskMapContractDigest(
        "synthetic-participant-set",
      ),
    },
  };
}

function driveProvider(
  documents: readonly TaskMapGeminiMeetDriveDocumentMetadataV1[],
  options: {
    failDocumentIds?: ReadonlySet<string>;
    listResponse?: unknown;
    mutateReadResponse?: (
      document: TaskMapGeminiMeetDriveDocumentMetadataV1,
    ) => unknown;
    calls?: string[];
  } = {},
): TaskMapGeminiMeetDriveProviderV1 {
  const byId = new Map(
    documents.map((document) => [document.documentId, document]),
  );
  return {
    async listCurrentMeetingDocumentRefs(request) {
      options.calls?.push(`list:${request.limit}`);
      assert.ok(Object.isFrozen(request));
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
      assert.ok(Object.isFrozen(request));
      if (options.failDocumentIds?.has(request.documentId)) {
        throw new Error("synthetic sensitive provider detail");
      }
      const document = byId.get(request.documentId);
      assert.ok(document);
      assert.strictEqual(document.revisionId, request.revisionId);
      return options.mutateReadResponse?.(structuredClone(document))
        ?? { document: structuredClone(document) };
    },
  };
}

function adapterInput(
  drive: TaskMapGeminiMeetDriveProviderV1,
  attemptedAt = "2026-07-28T17:00:00.000Z",
  extra: Partial<TaskMapGeminiMeetAdapterInputV1> = {},
): TaskMapGeminiMeetAdapterInputV1 {
  return {
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    attemptedAt,
    driveBinding: DRIVE_BINDING,
    driveProvider: drive,
    ...extra,
  };
}

describe("Task Map P12.1a Gemini Meet adapter", () => {
  it("uses Drive document identity and revision for immutable P9 and P10 inputs", async () => {
    const calls: string[] = [];
    const document = meetingDocument();
    const result = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([document], { calls })),
    );

    assert.strictEqual(result.state, "success");
    assert.strictEqual(result.envelopes.length, 1);
    assert.strictEqual(result.envelopes[0].sourceObjectId, document.documentId);
    assert.strictEqual(result.envelopes[0].sourceRevision, document.revisionId);
    assert.strictEqual(result.discoveryPointers.length, 0);
    assert.strictEqual(result.canonicalMeetings.length, 1);
    assert.strictEqual(result.sourceSnapshot?.canonicalMeetings.length, 1);
    assert.strictEqual(result.checkpoint.state, "success");
    assert.strictEqual(
      result.checkpoint.adapterVersion,
      TASKMAP_GEMINI_MEET_ADAPTER_VERSION,
    );
    assert.deepStrictEqual(
      result.checkpoint.acceptedSourceIdentityDigests,
      [result.envelopes[0].sourceIdentityDigest],
    );
    assert.strictEqual(
      result.refreshInputs.sourceBinding.bindingDigest,
      taskMapContractDigest(DRIVE_BINDING),
    );
    assert.strictEqual(
      result.refreshInputs.sourceRevisions[0].sourceRevisionDigest,
      taskMapContractDigest(document.revisionId),
    );
    assert.strictEqual(
      result.refreshInputs.sourceRevisionSet.revisionSetDigest,
      result.refreshInputs.sourceSliceProof.sourceRevisionSetDigest,
    );
    assert.strictEqual(
      result.refreshInputs.checkpointDigest,
      taskMapContractDigest(result.checkpoint),
    );
    assert.strictEqual(
      result.refreshInputs.servingDisposition,
      "current_source",
    );
    assert.strictEqual(
      result.refreshInputs.semanticInputDigest,
      result.sourceSnapshot?.semanticInputDigest,
    );
    assert.strictEqual(result.refreshInputs.emptyObservationDigest, undefined);
    assert.deepStrictEqual(calls, [
      `list:${TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments}`,
      `read:${document.documentId}`,
    ]);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.envelopes[0]));
    assert.ok(Object.isFrozen(result.refreshInputs));
  });

  it("keeps an authoritative empty Drive observation non-serving or retained for review", async () => {
    const genesisEmpty = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([])),
    );
    assert.strictEqual(genesisEmpty.state, "empty_requires_review");
    assert.strictEqual(genesisEmpty.checkpoint.state, "partial");
    assert.strictEqual(
      genesisEmpty.checkpoint.error?.code,
      "provider_partial_result",
    );
    assert.strictEqual(genesisEmpty.envelopes.length, 0);
    assert.strictEqual(genesisEmpty.sourceSnapshot, undefined);
    assert.strictEqual(genesisEmpty.failures.length, 0);
    assert.strictEqual(
      genesisEmpty.emptyObservation?.contractVersion,
      TASKMAP_GEMINI_MEET_EMPTY_OBSERVATION_VERSION,
    );
    assert.strictEqual(
      genesisEmpty.emptyObservation?.disposition,
      "non_serving",
    );
    assert.strictEqual(
      genesisEmpty.emptyObservation?.authoritativeDocumentCount,
      0,
    );
    assert.strictEqual(
      genesisEmpty.checkpoint.error?.detailDigest,
      genesisEmpty.emptyObservation?.observationDigest,
    );
    assert.strictEqual(
      genesisEmpty.refreshInputs.servingDisposition,
      "non_serving",
    );
    assert.strictEqual(
      genesisEmpty.refreshInputs.sourceSliceProof.sliceRole,
      "observed_non_serving",
    );
    assert.deepStrictEqual(
      genesisEmpty.refreshInputs.sourceRevisions,
      [],
    );
    assert.strictEqual(
      genesisEmpty.refreshInputs.semanticInputDigest,
      undefined,
    );
    assert.strictEqual(
      genesisEmpty.refreshInputs.emptyObservationDigest,
      genesisEmpty.emptyObservation?.observationDigest,
    );
    assert.deepStrictEqual(
      assertTaskMapConnectorCheckpoint(genesisEmpty.checkpoint),
      genesisEmpty.checkpoint,
    );
    assert.deepStrictEqual(
      assertTaskMapRefreshRunSourceSliceProof(
        genesisEmpty.refreshInputs.sourceSliceProof,
      ),
      genesisEmpty.refreshInputs.sourceSliceProof,
    );
    const repeatedEmpty = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([]),
      "2026-07-28T18:00:00.000Z",
      {
        previous: {
          checkpoint: genesisEmpty.checkpoint,
          sourceSliceProof:
            genesisEmpty.refreshInputs.sourceSliceProof,
        },
      },
    ));
    assert.strictEqual(
      repeatedEmpty.emptyObservation?.disposition,
      "non_serving",
    );
    assert.strictEqual(
      repeatedEmpty.emptyObservation?.retainedSourceSliceDigest,
      undefined,
    );
    assert.strictEqual(
      repeatedEmpty.refreshInputs.servingDisposition,
      "non_serving",
    );

    const document = meetingDocument();
    const baseline = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([document])),
    );
    const retainedEmpty = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([]),
      "2026-07-28T18:00:00.000Z",
      {
        previous: {
          checkpoint: baseline.checkpoint,
          sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
        },
        previousCanonicalMeetings: baseline.canonicalMeetings,
      },
    ));
    assert.strictEqual(retainedEmpty.state, "empty_requires_review");
    assert.strictEqual(
      retainedEmpty.emptyObservation?.disposition,
      "retained_last_good",
    );
    assert.strictEqual(
      retainedEmpty.emptyObservation?.priorCheckpointDigest,
      taskMapContractDigest(baseline.checkpoint),
    );
    assert.strictEqual(
      retainedEmpty.emptyObservation?.retainedSourceSliceDigest,
      baseline.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.strictEqual(
      retainedEmpty.refreshInputs.servingDisposition,
      "retained_last_good",
    );
    assert.strictEqual(
      retainedEmpty.refreshInputs.sourceSliceProof.sourceSliceDigest,
      baseline.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.deepStrictEqual(
      retainedEmpty.checkpoint.watermark,
      baseline.checkpoint.watermark,
    );
    assert.deepStrictEqual(
      retainedEmpty.checkpoint.acceptedSourceIdentityDigests,
      baseline.checkpoint.acceptedSourceIdentityDigests,
    );
    assert.strictEqual(
      retainedEmpty.refreshInputs.semanticInputDigest,
      undefined,
    );
    assert.deepStrictEqual(
      assertTaskMapRefreshRunSourceSliceProof(
        retainedEmpty.refreshInputs.sourceSliceProof,
      ),
      retainedEmpty.refreshInputs.sourceSliceProof,
    );
  });

  it("keeps a full 64-document Drive page incomplete when a 65th may be hidden", async () => {
    const documents = Array.from({ length: 65 }, (_, index) => (
      meetingDocument(
        `synthetic-capped-page-doc-${index}`,
        `synthetic-capped-page-revision-${index}`,
        `synthetic-capped-page-content-${index}`,
      )
    ));
    const requestedLimits: number[] = [];
    const cappedProvider = (): TaskMapGeminiMeetDriveProviderV1 => {
      const byId = new Map(
        documents.map((document) => [document.documentId, document]),
      );
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
          assert.ok(document);
          return { document: structuredClone(document) };
        },
      };
    };

    const genesis = await readTaskMapGeminiMeetAdapter(
      adapterInput(cappedProvider()),
    );
    assert.strictEqual(genesis.state, "incomplete_requires_review");
    assert.strictEqual(genesis.envelopes.length, 64);
    assert.ok(
      !genesis.envelopes.some(
        (envelope) => (
          envelope.sourceObjectId === documents[64].documentId
        ),
      ),
    );
    assert.strictEqual(genesis.sourceSnapshot, undefined);
    assert.strictEqual(genesis.refreshInputs.semanticInputDigest, undefined);
    assert.strictEqual(
      genesis.refreshInputs.servingDisposition,
      "non_serving",
    );
    assert.strictEqual(
      genesis.refreshInputs.sourceSliceProof.sliceRole,
      "observed_non_serving",
    );
    assert.deepStrictEqual(genesis.refreshInputs.sourceRevisions, []);
    assert.strictEqual(genesis.checkpoint.state, "partial");
    assert.strictEqual(
      genesis.checkpoint.error?.code,
      "provider_partial_result",
    );
    assert.strictEqual(genesis.failures.length, 1);
    assert.strictEqual(
      genesis.failures[0].code,
      "drive_list_incomplete",
    );
    assert.strictEqual(genesis.failures[0].blockingForServing, true);
    assert.strictEqual(genesis.failures[0].retryable, true);
    assert.deepStrictEqual(
      assertTaskMapRefreshRunSourceSliceProof(
        genesis.refreshInputs.sourceSliceProof,
      ),
      genesis.refreshInputs.sourceSliceProof,
    );

    const baseline = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([meetingDocument()])),
    );
    const retained = await readTaskMapGeminiMeetAdapter(adapterInput(
      cappedProvider(),
      "2026-07-28T18:00:00.000Z",
      {
        previous: {
          checkpoint: baseline.checkpoint,
          sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
        },
        previousCanonicalMeetings: baseline.canonicalMeetings,
      },
    ));
    assert.strictEqual(retained.state, "incomplete_requires_review");
    assert.strictEqual(retained.sourceSnapshot, undefined);
    assert.strictEqual(retained.refreshInputs.semanticInputDigest, undefined);
    assert.strictEqual(
      retained.refreshInputs.servingDisposition,
      "retained_last_good",
    );
    assert.strictEqual(
      retained.refreshInputs.sourceSliceProof.sourceSliceDigest,
      baseline.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.deepStrictEqual(
      retained.checkpoint.watermark,
      baseline.checkpoint.watermark,
    );
    assert.deepStrictEqual(
      retained.checkpoint.acceptedSourceIdentityDigests,
      baseline.checkpoint.acceptedSourceIdentityDigests,
    );
    assert.strictEqual(
      retained.failures[0].code,
      "drive_list_incomplete",
    );
    assert.deepStrictEqual(requestedLimits, [
      TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
      TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments,
    ]);
  });

  it("treats Drive revisions as the sole primary source and detects exact no-ops", async () => {
    const document = meetingDocument();
    const first = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([document])),
    );
    const noEmail = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([document]),
      "2026-07-28T18:00:00.000Z",
      {
        previous: {
          checkpoint: first.checkpoint,
          sourceSliceProof: first.refreshInputs.sourceSliceProof,
        },
        previousCanonicalMeetings: first.canonicalMeetings,
      },
    ));

    assert.strictEqual(noEmail.state, "success");
    assert.strictEqual(noEmail.isExactNoOp, true);
    assert.strictEqual(
      noEmail.envelopes[0].sourceIdentityDigest,
      first.envelopes[0].sourceIdentityDigest,
    );
    assert.strictEqual(
      noEmail.checkpoint.watermark?.valueDigest,
      first.checkpoint.watermark?.valueDigest,
    );
    assert.strictEqual(
      noEmail.refreshInputs.sourceSliceProof.sourceSliceDigest,
      first.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.notStrictEqual(
      noEmail.checkpoint.checkpointId,
      first.checkpoint.checkpointId,
    );
    assert.deepStrictEqual(noEmail.canonicalMeetings, first.canonicalMeetings);

    const correctedMeetingTime = {
      ...document,
      meetingIdentity: {
        ...document.meetingIdentity,
        startAt: "2026-07-28T16:05:00.000Z",
        endAt: "2026-07-28T16:35:00.000Z",
      },
    };
    const corrected = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([correctedMeetingTime]),
      "2026-07-28T18:30:00.000Z",
      {
        previous: {
          checkpoint: noEmail.checkpoint,
          sourceSliceProof: noEmail.refreshInputs.sourceSliceProof,
        },
        previousCanonicalMeetings: noEmail.canonicalMeetings,
      },
    ));
    assert.strictEqual(
      corrected.envelopes[0].sourceIdentityDigest,
      noEmail.envelopes[0].sourceIdentityDigest,
    );
    assert.strictEqual(
      corrected.refreshInputs.sourceSliceProof.sourceSliceDigest,
      noEmail.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.notStrictEqual(
      corrected.checkpoint.watermark?.valueDigest,
      noEmail.checkpoint.watermark?.valueDigest,
    );
    assert.strictEqual(corrected.isExactNoOp, false);

    const changedDocument = meetingDocument(
      document.documentId,
      "synthetic-drive-revision-2",
      "synthetic-content-2",
    );
    const changed = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([changedDocument]),
      "2026-07-28T19:00:00.000Z",
      {
        previous: {
          checkpoint: corrected.checkpoint,
          sourceSliceProof: corrected.refreshInputs.sourceSliceProof,
        },
        previousCanonicalMeetings: corrected.canonicalMeetings,
      },
    ));
    assert.strictEqual(changed.isExactNoOp, false);
    assert.notStrictEqual(
      changed.envelopes[0].sourceIdentityDigest,
      first.envelopes[0].sourceIdentityDigest,
    );
    assert.notStrictEqual(
      changed.checkpoint.watermark?.valueDigest,
      first.checkpoint.watermark?.valueDigest,
    );
    assert.notStrictEqual(
      changed.refreshInputs.sourceRevisionSet.revisionSetDigest,
      first.refreshInputs.sourceRevisionSet.revisionSetDigest,
    );
    assert.strictEqual(
      changed.canonicalMeetings[0].canonicalMeetingId,
      first.canonicalMeetings[0].canonicalMeetingId,
    );
  });

  it("snapshots owner, binding, provider methods, and previous state before the first await", async () => {
    const document = meetingDocument();
    const baseline = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([document])),
    );
    const ownerB = taskMapContractDigest("synthetic-mutated-owner-b");
    const mutableBindingA = structuredClone(DRIVE_BINDING);
    const expectedBindingA = structuredClone(mutableBindingA);
    const bindingB: TaskMapSourceAuthorityBindingV1 = {
      connectionId: "synthetic-drive-mutated-b",
      sourceKind: "gemini_meet",
      tenantOrWorkspaceDigest: taskMapContractDigest(
        "synthetic-mutated-workspace-b",
      ),
      accountOrPrincipalDigest: taskMapContractDigest(
        "synthetic-mutated-principal-b",
      ),
      grantVersion: "synthetic-drive-read-b",
    };
    const maliciousDocument = meetingDocument(
      "synthetic-mutated-doc-b",
      "synthetic-mutated-revision-b",
      "synthetic-mutated-content-b",
    );
    let mutableInput: TaskMapGeminiMeetAdapterInputV1;
    const provider: TaskMapGeminiMeetDriveProviderV1 = {
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

    const result = await readTaskMapGeminiMeetAdapter(mutableInput);
    assert.strictEqual(result.state, "success");
    assert.strictEqual(result.isExactNoOp, true);
    assert.strictEqual(
      result.envelopes[0].ownerScopeDigest,
      OWNER_SCOPE_DIGEST,
    );
    assert.strictEqual(
      result.envelopes[0].sourceObjectId,
      document.documentId,
    );
    assert.deepStrictEqual(result.checkpoint.binding, expectedBindingA);
    assert.strictEqual(
      result.checkpoint.lastAttemptAt,
      "2026-07-28T18:00:00.000Z",
    );
    assert.strictEqual(
      result.refreshInputs.sourceBinding.bindingDigest,
      taskMapContractDigest(expectedBindingA),
    );
    assert.deepStrictEqual(result.canonicalMeetings, baseline.canonicalMeetings);
    assert.ok(!JSON.stringify(result).includes(ownerB));
    assert.ok(
      !JSON.stringify(result).includes(maliciousDocument.documentId),
    );
  });

  it("retains the last-good P10 slice and emits digest-only retryable per-source failure", async () => {
    const firstDocument = meetingDocument();
    const secondDocument = meetingDocument(
      "synthetic-gemini-doc-2",
      "synthetic-drive-revision-2",
      "synthetic-content-2",
    );
    const baseline = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([firstDocument, secondDocument])),
    );
    const partial = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider(
        [firstDocument, secondDocument],
        { failDocumentIds: new Set([secondDocument.documentId]) },
      ),
      "2026-07-28T18:00:00.000Z",
      {
        previous: {
          checkpoint: baseline.checkpoint,
          sourceSliceProof: baseline.refreshInputs.sourceSliceProof,
        },
      },
    ));

    assert.strictEqual(partial.state, "partial");
    assert.strictEqual(partial.envelopes.length, 1);
    assert.strictEqual(partial.sourceSnapshot, undefined);
    assert.strictEqual(partial.failures.length, 1);
    assert.strictEqual(
      partial.failures[0].code,
      "drive_document_unavailable",
    );
    assert.strictEqual(partial.failures[0].retryable, true);
    assert.strictEqual(partial.failures[0].blockingForServing, true);
    assert.strictEqual(
      partial.checkpoint.error?.code,
      "provider_partial_result",
    );
    assert.deepStrictEqual(
      partial.checkpoint.watermark,
      baseline.checkpoint.watermark,
    );
    assert.deepStrictEqual(
      partial.checkpoint.acceptedSourceIdentityDigests,
      baseline.checkpoint.acceptedSourceIdentityDigests,
    );
    assert.strictEqual(
      partial.refreshInputs.sourceSliceProof.sourceSliceDigest,
      baseline.refreshInputs.sourceSliceProof.sourceSliceDigest,
    );
    assert.strictEqual(
      partial.refreshInputs.servingDisposition,
      "retained_last_good",
    );
    assert.strictEqual(partial.refreshInputs.semanticInputDigest, undefined);
    assert.ok(
      !JSON.stringify(partial).includes(
        "synthetic sensitive provider detail",
      ),
    );
  });

  it("denies source and email bodies in Drive metadata", async () => {
    const document = meetingDocument();
    for (const forbiddenField of [
      "body",
      "transcript",
      "summary",
      "emailBody",
    ]) {
      const result = await readTaskMapGeminiMeetAdapter(adapterInput(
        driveProvider([document], {
          mutateReadResponse: (value) => ({
            document: {
              ...value,
              [forbiddenField]: "synthetic-private-body-value",
            },
          }),
        }),
      ));
      assert.strictEqual(result.state, "failed");
      assert.strictEqual(
        result.failures[0].code,
        "drive_document_malformed",
      );
      assert.strictEqual(result.envelopes.length, 0);
      assert.ok(!JSON.stringify(result).includes(forbiddenField));
      assert.ok(
        !JSON.stringify(result).includes("synthetic-private-body-value"),
      );
    }

    const clean = await readTaskMapGeminiMeetAdapter(
      adapterInput(driveProvider([document])),
    );
    assert.deepStrictEqual(clean.privacy, {
      sourceBodiesStored: false,
      emailBodiesStored: false,
      participantDetailsStored: false,
      credentialsStored: false,
      rawProviderResponsesStored: false,
      localPathsStored: false,
    });
  });

  it("fails closed on malformed, proxy-backed, and over-limit provider responses", async () => {
    const malformed = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([], { listResponse: { documents: "not-an-array" } }),
    ));
    assert.strictEqual(malformed.state, "failed");
    assert.strictEqual(
      malformed.failures[0].code,
      "drive_list_malformed",
    );

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
    const proxied = await readTaskMapGeminiMeetAdapter(adapterInput(
      driveProvider([], { listResponse: { documents: [proxy] } }),
    ));
    assert.strictEqual(proxied.state, "failed");
    assert.strictEqual(proxied.failures[0].code, "drive_list_proxy");
    assert.strictEqual(proxyTraps, 0);

    let readCalls = 0;
    const overLimitProvider: TaskMapGeminiMeetDriveProviderV1 = {
      async listCurrentMeetingDocumentRefs() {
        return {
          documents: Array.from({
            length:
              TASKMAP_GEMINI_MEET_ADAPTER_LIMITS_V1.maxDocuments + 1,
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
    const overLimit = await readTaskMapGeminiMeetAdapter(
      adapterInput(overLimitProvider),
    );
    assert.strictEqual(overLimit.state, "failed");
    assert.strictEqual(overLimit.failures[0].code, "drive_list_limit");
    assert.strictEqual(readCalls, 0);
    assert.strictEqual(overLimit.checkpoint.error?.code, "provider_unavailable");
    assert.strictEqual(
      overLimit.refreshInputs.sourceSliceProof.sliceRole,
      "observed_non_serving",
    );
  });
});
