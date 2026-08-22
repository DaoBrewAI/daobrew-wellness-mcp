import assert from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  advanceTaskMapConnectorCheckpoint,
  assertTaskMapConnectorCheckpoint,
  assertTaskMapSemanticProposalCurrent,
  assertTaskMapSourceSnapshot,
  attestTaskMapSemanticBrain,
  buildGeminiMeetSource,
  buildTaskMapGateDecision,
  buildTaskMapProjectionTarget,
  buildTaskMapReplayManifest,
  buildTaskMapSemanticProposalReference,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  canonicalizeTaskMapMeetings,
  compareTaskMapProjectionTargets,
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
  type TaskMapGeminiMeetDraftV1,
  type TaskMapSemanticBrainArtifactV1,
  type TaskMapSourceEnvelopeDraftV1,
} from "../src/engine/taskmap/source-contracts.js";
import {
  buildTaskMapProjection,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapMeetingIdentityHintV1,
  type TaskMapProjectionTargetRecordV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapInput,
} from "../src/engine/taskmap/types.js";

type GeminiFixture = {
  scenario: string;
  draft: TaskMapGeminiMeetDraftV1;
};

const OWNER_SCOPE_DIGEST = taskMapContractDigest("fixture-owner-scope");
const SEMANTIC_ATTESTATION_KEY =
  "synthetic-taskmap-semantic-attestation-key-material-v1";
const GEMINI_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "google-workspace-primary",
  sourceKind: "gemini_meet",
  tenantOrWorkspaceDigest: taskMapContractDigest("fixture-google-workspace"),
  accountOrPrincipalDigest: taskMapContractDigest("fixture-principal"),
  grantVersion: "google-read-v1",
};
const CALENDAR_BINDING: TaskMapSourceAuthorityBindingV1 = {
  ...GEMINI_BINDING,
  sourceKind: "google_calendar",
};
const GRANOLA_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "granola-primary",
  sourceKind: "granola",
  tenantOrWorkspaceDigest: taskMapContractDigest("granola-workspace"),
  accountOrPrincipalDigest: taskMapContractDigest("granola-principal"),
  grantVersion: "granola-read-v1",
};
function localAgentBinding(
  sourceKind: "codex_session" | "claude_session" | "cursor_session",
): TaskMapSourceAuthorityBindingV1 {
  return {
    connectionId: `local-${sourceKind}-index`,
    sourceKind,
    tenantOrWorkspaceDigest: taskMapContractDigest("local-workspace"),
    accountOrPrincipalDigest: taskMapContractDigest("local-principal"),
    grantVersion: "agent-read-v1",
  };
}
const OURA_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "oura-owner-read",
  sourceKind: "oura",
  tenantOrWorkspaceDigest: taskMapContractDigest("oura-owner"),
  accountOrPrincipalDigest: taskMapContractDigest("oura-principal"),
  grantVersion: "oura-read-v1",
};
const STRATEGY_BINDING: TaskMapSourceAuthorityBindingV1 = {
  connectionId: "strategy-read",
  sourceKind: "strategy",
  tenantOrWorkspaceDigest: taskMapContractDigest("strategy-workspace"),
  accountOrPrincipalDigest: taskMapContractDigest("strategy-principal"),
  grantVersion: "strategy-read-v1",
};

function readGeminiFixture(filename: string): GeminiFixture {
  return JSON.parse(readFileSync(
    path.resolve(process.cwd(), "tests/fixtures/taskmap-p9.2", filename),
    "utf8",
  )) as GeminiFixture;
}

function envelope(
  draft: Omit<TaskMapSourceEnvelopeDraftV1, "ownerScopeDigest"> & {
    ownerScopeDigest?: string;
  },
) {
  return buildTaskMapSourceEnvelope({
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    ...draft,
  });
}

function recomputeConnectorCheckpointId(
  checkpoint: ReturnType<typeof advanceTaskMapConnectorCheckpoint>,
): string {
  const core = {
    binding: checkpoint.binding,
    sourceKind: checkpoint.sourceKind,
    adapterVersion: checkpoint.adapterVersion,
    capabilities: checkpoint.capabilities,
    state: checkpoint.state,
    lastAttemptAt: checkpoint.lastAttemptAt,
    lastSuccessfulPollAt: checkpoint.lastSuccessfulPollAt,
    watermark: checkpoint.watermark,
    watermarkHistoryDigests: checkpoint.watermarkHistoryDigests,
    acceptedSourceIdentityDigests:
      checkpoint.acceptedSourceIdentityDigests,
    error: checkpoint.error,
  };
  return `tmcheckpoint_${taskMapContractDigest(core).slice(0, 16)}`;
}

function designMeetingSources() {
  const design = buildGeminiMeetSource(
    readGeminiFixture("gemini-direct-discovery.json").draft,
  );
  const hint = design.envelope.meetingIdentity!;
  const granola = envelope({
    binding: GRANOLA_BINDING,
    sourceKind: "granola",
    objectType: "meeting_note",
    sourceObjectId: "synthetic-granola-meeting-0001",
    sourceRevision: "synthetic-granola-revision-0001",
    eventTime: hint.startAt,
    contentDigest: taskMapContractDigest("granola-design-content"),
    authority: {
      evidence: "provider_generated_summary",
      quality: "provider_summary",
      lifecycle: "none",
      completion: "none",
      rank: "candidate_only",
    },
    meetingIdentity: {
      ...hint,
      calendarEventIdDigest: undefined,
      endAt: undefined,
    },
  });
  const calendar = envelope({
    binding: CALENDAR_BINDING,
    sourceKind: "google_calendar",
    objectType: "calendar_event",
    sourceObjectId: "synthetic-calendar-design-event-0001",
    sourceRevision: "synthetic-calendar-design-etag-0001",
    eventTime: hint.startAt,
    contentDigest: taskMapContractDigest("calendar-content"),
    authority: {
      evidence: "context_only",
      quality: "source_native",
      lifecycle: "none",
      completion: "none",
      rank: "context_only",
    },
    meetingIdentity: {
      ...hint,
      endAt: "2026-07-28T02:15:00.000Z",
    },
  });
  return { design, granola, calendar, hint };
}

function agentEnvelope(
  sourceKind: "codex_session" | "claude_session" | "cursor_session",
  id: string,
) {
  return envelope({
    binding: localAgentBinding(sourceKind),
    sourceKind,
    objectType: "agent_session",
    sourceObjectId: taskMapContractDigest(`synthetic-agent-session:${id}`),
    sourceRevision: taskMapContractDigest("synthetic-agent-session-revision-v1"),
    eventTime: "2026-07-27T20:00:00.000Z",
    contentDigest: taskMapContractDigest(`${sourceKind}-bounded-evidence`),
    authority: {
      evidence: "explicit_commitment",
      quality: "bounded_context",
      lifecycle: "none",
      completion: "none",
      rank: "candidate_only",
    },
  });
}

function bodyEnvelope(id = "oura-relative-2026-07-27") {
  return envelope({
    binding: OURA_BINDING,
    sourceKind: "oura",
    objectType: "body_context",
    sourceObjectId: taskMapContractDigest(`synthetic-body-context:${id}`),
    sourceRevision: taskMapContractDigest("synthetic-relative-classifier-v2"),
    eventTime: "2026-07-27T07:00:00.000Z",
    contentDigest: taskMapContractDigest(id),
    authority: {
      evidence: "body_context_only",
      quality: "coverage_only",
      lifecycle: "none",
      completion: "none",
      rank: "body_bonus_only",
    },
  });
}

function harnessFixture(): { input: TaskMapInput; brain: SemanticBrainOutput } {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: "2026-07-28T02:00:00.000Z",
    pointers: [{
      id: "strategy-task",
      sourceKind: "strategy",
      sourceObjectId: "taskmap-p9",
      sourceRefHash: "1111111111111111",
      sourceVersion: "strategy-v1",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_task", "deep_link"],
    }],
    events: [{
      id: "strategy-task-open",
      pointerId: "strategy-task",
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: "2026-07-27T17:00:00.000Z",
      observedAt: "2026-07-28T02:00:00.000Z",
      objectRefs: ["task:taskmap-p9"],
      title: "Freeze the Task Map source contract",
      summary: "Bind bounded source evidence to deterministic replay and projection decisions.",
      extractionConfidence: 1,
      sourceStatus: "in_progress",
      priority: 1,
    }],
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: input.generatedAt,
    roots: [{
      proposalId: "root-taskmap-productization",
      title: "Task Map productization",
      summary: "Source contracts and deterministic gates form one bounded workstream.",
      evidenceEventIds: ["strategy-task-open"],
      memberObjectRefs: ["task:taskmap-p9"],
      confidence: 0.98,
    }],
    tasks: [{
      proposalId: "task-source-contract",
      rootProposalId: "root-taskmap-productization",
      title: "Freeze the Task Map source contract",
      summary: "Implement and test the P9 source authority boundary.",
      evidenceEventIds: ["strategy-task-open"],
      authoritativeTaskEventId: "strategy-task-open",
      openState: "open",
      confidence: 0.99,
    }],
    edges: [{
      proposalId: "edge-root-contract",
      fromProposalId: "root-taskmap-productization",
      toProposalId: "task-source-contract",
      relation: "advances",
      evidenceEventIds: ["strategy-task-open"],
      confidence: 1,
    }],
  };
  return { input, brain };
}

function semanticBrainForSnapshot(
  brain: SemanticBrainOutput,
  semanticInputDigest: string,
): TaskMapSemanticBrainArtifactV1 {
  return attestTaskMapSemanticBrain(
    semanticInputDigest,
    brain,
    SEMANTIC_ATTESTATION_KEY,
  );
}

function replayPolicies() {
  return ([
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
  ] as const).map((name) => ({
    name,
    version: name === "algorithm" ? TASKMAP_ALGORITHM_POLICY_VERSION : `${name}.v1`,
    digest: taskMapContractDigest({ name, version: "v1" }),
  }));
}

function targetRecord(
  canonicalRecordId: string,
  role: TaskMapProjectionTargetRecordV1["role"],
  lifecycle: TaskMapProjectionTargetRecordV1["lifecycle"],
): TaskMapProjectionTargetRecordV1 {
  return {
    canonicalRecordId,
    role,
    lifecycle,
    sourceIdentityDigest: taskMapContractDigest(`source:${canonicalRecordId}`),
    recordDigest: taskMapContractDigest({ canonicalRecordId, role, lifecycle }),
  };
}

describe("Task Map P9.2 source contracts", () => {
  it("uses Drive Doc ID plus revision as Gemini identity for direct, forwarded, and no-email discovery", () => {
    const directFixture = readGeminiFixture("gemini-direct-discovery.json");
    const forwardedFixture = readGeminiFixture("gemini-forwarded-discovery.json");
    const noEmailFixture = readGeminiFixture("gemini-no-email-discovery.json");
    const direct = buildGeminiMeetSource(directFixture.draft);
    const directWithoutEmail = buildGeminiMeetSource({
      ...directFixture.draft,
      gmailDiscoveries: [],
    });
    const forwarded = buildGeminiMeetSource(forwardedFixture.draft);
    const noEmail = buildGeminiMeetSource(noEmailFixture.draft);

    assert.deepStrictEqual(direct.envelope, directWithoutEmail.envelope);
    assert.deepStrictEqual(direct.envelope, noEmail.envelope);
    assert.notStrictEqual(
      forwarded.envelope.sourceIdentityDigest,
      noEmail.envelope.sourceIdentityDigest,
    );
    assert.strictEqual(direct.discoveryPointers.length, 1);
    assert.strictEqual(direct.discoveryPointers[0].channel, "gmail_direct");
    assert.strictEqual(forwarded.discoveryPointers[0].channel, "gmail_forwarded");
    assert.strictEqual(noEmail.discoveryPointers.length, 0);
    assert.strictEqual(
      direct.discoveryPointers[0].targetSourceIdentityDigest,
      noEmail.envelope.sourceIdentityDigest,
    );
    assert.ok(direct.envelope.meetingIdentity?.calendarEventIdDigest);
    assert.ok(noEmail.envelope.meetingIdentity?.calendarEventIdDigest);
    assert.strictEqual(
      forwarded.envelope.meetingIdentity?.calendarEventIdDigest,
      undefined,
    );
    const directSnapshot = buildTaskMapSourceSnapshot(
      [direct.envelope],
      direct.discoveryPointers,
    );
    const noEmailSnapshot = buildTaskMapSourceSnapshot([noEmail.envelope], []);
    assert.strictEqual(
      directSnapshot.semanticInputDigest,
      noEmailSnapshot.semanticInputDigest,
    );
    assert.notStrictEqual(
      directSnapshot.sourceSnapshotDigest,
      noEmailSnapshot.sourceSnapshotDigest,
    );
    assert.ok(!JSON.stringify([direct, forwarded]).includes("@"));
    assert.ok(!JSON.stringify([direct, forwarded]).toLowerCase().includes("emailbody"));
    assert.ok(!JSON.stringify([direct, forwarded]).includes("\"summary\":"));

    const changedMessage = buildGeminiMeetSource({
      ...forwardedFixture.draft,
      gmailDiscoveries: [{
        ...forwardedFixture.draft.gmailDiscoveries[0],
        opaqueMessageId: "different-forward-message",
      }],
    });
    assert.strictEqual(
      changedMessage.envelope.sourceIdentityDigest,
      forwarded.envelope.sourceIdentityDigest,
    );
    const changedRevision = buildGeminiMeetSource({
      ...forwardedFixture.draft,
      revisionId: "different-drive-revision",
    });
    assert.notStrictEqual(
      changedRevision.envelope.sourceIdentityDigest,
      forwarded.envelope.sourceIdentityDigest,
    );
  });

  it("rejects duplicate email content, participant detail, transcript, raw body values, and session bodies structurally", () => {
    const direct = readGeminiFixture("gemini-direct-discovery.json").draft;
    assert.throws(
      () => buildGeminiMeetSource({
        ...direct,
        gmailDiscoveries: [{
          ...direct.gmailDiscoveries[0],
          senderAddress: "private@example.com",
        } as never],
      }),
      /forbidden or unknown fields: senderAddress/,
    );
    assert.throws(
      () => buildGeminiMeetSource({
        ...direct,
        emailBody: "duplicated summary and next steps",
      } as never),
      /forbidden or unknown fields: emailBody/,
    );
    const { granola } = designMeetingSources();
    const draft: TaskMapSourceEnvelopeDraftV1 & { transcript?: string } = {
      ownerScopeDigest: granola.ownerScopeDigest,
      binding: granola.binding,
      sourceKind: granola.sourceKind,
      objectType: granola.objectType,
      sourceObjectId: granola.sourceObjectId,
      sourceRevision: granola.sourceRevision,
      eventTime: granola.eventTime,
      contentDigest: granola.contentDigest,
      authority: granola.authority,
      meetingIdentity: {
        ...granola.meetingIdentity!,
        participants: ["private person"],
      } as never,
      transcript: "short transcript excerpt",
    };
    assert.throws(() => buildTaskMapSourceEnvelope(draft), /transcript/);
    delete draft.transcript;
    assert.throws(() => buildTaskMapSourceEnvelope(draft), /participants/);
    assert.throws(
      () => buildTaskMapSourceEnvelope({
        ...agentEnvelope("codex_session", "codex-session-1"),
        contractVersion: undefined,
        envelopeId: undefined,
        sourceObjectKeyDigest: undefined,
        sourceIdentityDigest: undefined,
        privacy: undefined,
        sessionBody: "full prompt and response",
      } as never),
      /forbidden or unknown fields/,
    );
    assert.throws(
      () => buildTaskMapSourceEnvelope({
        binding: OURA_BINDING,
        sourceKind: "oura",
        objectType: "body_context",
        sourceObjectId: "relative-day",
        sourceRevision: "v1",
        eventTime: "2026-07-27T07:00:00.000Z",
        contentDigest: taskMapContractDigest("raw-body"),
        authority: {
          evidence: "body_context_only",
          quality: "coverage_only",
          lifecycle: "none",
          completion: "none",
          rank: "body_bonus_only",
        },
        hrvMs: 37,
      } as never),
      /hrvMs/,
    );
  });

  it("admits an immutable Strategy row as a source-native authoritative task", () => {
    const source = envelope({
      binding: STRATEGY_BINDING,
      sourceKind: "strategy",
      objectType: "authoritative_task",
      sourceObjectId: "ptr-strategy-source-aware-e2e",
      sourceRevision: "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57",
      eventTime: "2026-07-29T07:15:00.000Z",
      contentDigest: taskMapContractDigest("canonical-strategy-row"),
      authority: {
        evidence: "authoritative_task",
        quality: "source_native",
        lifecycle: "source_status",
        completion: "source_status",
        rank: "accepted_work",
      },
    });
    assert.strictEqual(source.sourceKind, "strategy");
    assert.strictEqual(source.objectType, "authoritative_task");
    assert.strictEqual(
      source.sourceRevision,
      "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57",
    );
    assert.strictEqual(source.authority.rank, "accepted_work");
    assert.strictEqual(source.privacy.sourceBodiesStored, false);
    assert.strictEqual(source.privacy.localPathsStored, false);
    assert.throws(
      () => envelope({
        binding: STRATEGY_BINDING,
        sourceKind: "strategy",
        objectType: "authoritative_task",
        sourceObjectId: "ptr-strategy-source-aware-e2e",
        sourceRevision: "mutable-main",
        eventTime: "2026-07-29T07:15:00.000Z",
        contentDigest: taskMapContractDigest("canonical-strategy-row"),
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "source_status",
          completion: "source_status",
          rank: "accepted_work",
        },
      }),
      /immutable 40-hex Git sourceRevision/,
    );
  });

  it("fails closed on provider authority escalation, path-shaped local IDs, forged envelopes, and mixed owner scopes", () => {
    for (const sourceObjectId of [
      "Users/synthetic-user/.codex/sessions/private.jsonl",
      "C:/Users/synthetic-user/private-session.jsonl",
    ]) {
      assert.throws(
        () => buildTaskMapSourceEnvelope({
          ownerScopeDigest: OWNER_SCOPE_DIGEST,
          binding: localAgentBinding("codex_session"),
          sourceKind: "codex_session",
          objectType: "agent_session",
          sourceObjectId,
          sourceRevision: taskMapContractDigest("synthetic-session-revision"),
          eventTime: "2026-07-27T20:00:00.000Z",
          contentDigest: taskMapContractDigest("synthetic-session-content"),
          authority: {
            evidence: "context_only",
            quality: "bounded_context",
            lifecycle: "none",
            completion: "none",
            rank: "context_only",
          },
        }),
        /sourceObjectId must be a lowercase SHA-256 digest/,
      );
    }
    assert.throws(
      () => envelope({
        binding: OURA_BINDING,
        sourceKind: "oura",
        objectType: "authoritative_task",
        sourceObjectId: taskMapContractDigest("synthetic-body-object"),
        sourceRevision: taskMapContractDigest("synthetic-body-revision"),
        eventTime: "2026-07-27T07:00:00.000Z",
        contentDigest: taskMapContractDigest("synthetic-body-content"),
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "source_status",
          completion: "source_status",
          rank: "accepted_work",
        },
      }),
      /oura cannot emit authoritative_task/,
    );
    assert.throws(
      () => envelope({
        binding: STRATEGY_BINDING,
        sourceKind: "strategy",
        objectType: "strategy_context",
        sourceObjectId: "synthetic-strategy-context",
        sourceRevision: "synthetic-strategy-revision",
        eventTime: "2026-07-27T20:00:00.000Z",
        contentDigest: taskMapContractDigest("synthetic-strategy-content"),
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "source_status",
          completion: "source_status",
          rank: "accepted_work",
        },
      }),
      /strategy context can only provide bounded context or candidates/,
    );
    assert.throws(
      () => envelope({
        binding: GEMINI_BINDING,
        sourceKind: "linear",
        objectType: "authoritative_task",
        sourceObjectId: "synthetic-linear-task",
        sourceRevision: "synthetic-linear-revision",
        eventTime: "2026-07-27T20:00:00.000Z",
        contentDigest: taskMapContractDigest("synthetic-linear-content"),
        authority: {
          evidence: "authoritative_task",
          quality: "source_native",
          lifecycle: "source_status",
          completion: "source_status",
          rank: "accepted_work",
        },
      }),
      /source binding is not authorized/,
    );

    const { design } = designMeetingSources();
    const mutableEnvelope = structuredClone(design.envelope);
    const snapshot = buildTaskMapSourceSnapshot([mutableEnvelope], []);
    const storedContentDigest = snapshot.envelopes[0].contentDigest;
    mutableEnvelope.contentDigest = taskMapContractDigest("mutated-after-snapshot");
    assert.strictEqual(snapshot.envelopes[0].contentDigest, storedContentDigest);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.envelopes[0]));
    assert.throws(
      () => buildTaskMapSourceSnapshot([
        {
          ...structuredClone(design.envelope),
          transcript: "forged body",
        } as never,
      ], []),
      /forbidden or unknown fields: transcript/,
    );

    const otherScope = envelope({
      ownerScopeDigest: taskMapContractDigest("other-owner-scope"),
      binding: GRANOLA_BINDING,
      sourceKind: "granola",
      objectType: "meeting_note",
      sourceObjectId: "synthetic-other-scope-meeting",
      sourceRevision: "synthetic-other-scope-revision",
      eventTime: design.envelope.eventTime,
      contentDigest: taskMapContractDigest("synthetic-other-scope-content"),
      authority: {
        evidence: "provider_generated_summary",
        quality: "provider_summary",
        lifecycle: "none",
        completion: "none",
        rank: "candidate_only",
      },
      meetingIdentity: design.envelope.meetingIdentity,
    });
    assert.strictEqual(
      canonicalizeTaskMapMeetings([design.envelope, otherScope]).length,
      2,
    );
    assert.throws(
      () => buildTaskMapSourceSnapshot([design.envelope, otherScope], []),
      /cannot cross owner dedupe scopes/,
    );
  });

  it("deduplicates Gemini and Granola behind one Calendar-owned canonical meeting", () => {
    const { design, granola, calendar } = designMeetingSources();
    assert.strictEqual(granola.meetingIdentity!.endAt, undefined);
    assert.strictEqual(calendar.meetingIdentity!.endAt, "2026-07-28T02:15:00.000Z");
    assert.strictEqual(design.envelope.meetingIdentity!.endAt, "2026-07-28T02:30:00.000Z");
    const meetings = canonicalizeTaskMapMeetings([
      design.envelope,
      granola,
      calendar,
    ]);
    assert.strictEqual(meetings.length, 1);
    assert.strictEqual(meetings[0].identityMethod, "calendar_event");
    assert.strictEqual(meetings[0].reviewState, "resolved");
    assert.deepStrictEqual(
      [...meetings[0].evidenceVariantEnvelopeIds].sort(),
      [design.envelope.envelopeId, granola.envelopeId].sort(),
    );
    assert.deepStrictEqual(meetings[0].calendarEnvelopeIds, [calendar.envelopeId]);
    assert.ok(!meetings[0].evidenceVariantEnvelopeIds.some((id) => id.includes("gmail")));

    const snapshot = buildTaskMapSourceSnapshot(
      [design.envelope, granola, calendar],
      design.discoveryPointers,
    );
    assert.strictEqual(snapshot.canonicalMeetings.length, 1);
    assert.strictEqual(
      snapshot.canonicalMeetings[0].evidenceVariantEnvelopeIds.length,
      2,
    );

    const baselineCanonicalId = meetings[0].canonicalMeetingId;
    for (const permutation of [
      [calendar, granola, design.envelope],
      [granola, design.envelope, calendar],
      [design.envelope, calendar, granola],
    ]) {
      assert.strictEqual(
        canonicalizeTaskMapMeetings(permutation)[0].canonicalMeetingId,
        baselineCanonicalId,
      );
    }
    const renamedSameCalendar = envelope({
      binding: design.envelope.binding,
      sourceKind: "gemini_meet",
      objectType: "meeting_note",
      sourceObjectId: "synthetic-design-note-renamed",
      sourceRevision: "synthetic-design-note-renamed-revision",
      eventTime: design.envelope.eventTime,
      contentDigest: taskMapContractDigest("synthetic-renamed-design-content"),
      authority: design.envelope.authority,
      meetingIdentity: {
        ...design.envelope.meetingIdentity!,
        startAt: "2026-07-27T18:30:00-07:00",
        endAt: "2026-07-27T19:45:00-07:00",
        normalizedTitleDigest: taskMapContractDigest("synthetic-renamed-design-title"),
      },
    });
    const drifted = canonicalizeTaskMapMeetings([renamedSameCalendar, calendar]);
    assert.strictEqual(drifted.length, 1);
    assert.strictEqual(drifted[0].canonicalMeetingId, baselineCanonicalId);
    assert.strictEqual(drifted[0].identityMethod, "calendar_event");
    assert.ok(drifted[0].conflictCodes.includes("fallback_metadata_disagreement"));
  });

  it("keeps a unique Calendar identity when the lexically first Granola variant has no Calendar ID", () => {
    const { granola, calendar } = designMeetingSources();
    assert.strictEqual(granola.meetingIdentity!.calendarEventIdDigest, undefined);
    const granolaFirst = {
      ...granola,
      envelopeId: "tmsrc_0000000000000000",
    };
    const calendarLast = {
      ...calendar,
      envelopeId: "tmsrc_ffffffffffffffff",
    };
    assert.ok(granolaFirst.envelopeId < calendarLast.envelopeId);
    const forward = canonicalizeTaskMapMeetings([granolaFirst, calendarLast]);
    const reverse = canonicalizeTaskMapMeetings([calendarLast, granolaFirst]);
    assert.deepStrictEqual(forward, reverse);
    assert.strictEqual(forward.length, 1);
    assert.strictEqual(forward[0].identityMethod, "calendar_event");
    assert.strictEqual(forward[0].reviewState, "resolved");
    assert.deepStrictEqual(forward[0].calendarEnvelopeIds, [calendarLast.envelopeId]);
    assert.deepStrictEqual(forward[0].evidenceVariantEnvelopeIds, [granolaFirst.envelopeId]);

    const fallbackGemini = envelope({
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      objectType: "meeting_note",
      sourceObjectId: "synthetic-fallback-gemini-note",
      sourceRevision: "synthetic-fallback-gemini-revision",
      eventTime: granola.eventTime,
      contentDigest: taskMapContractDigest("synthetic-fallback-gemini-content"),
      authority: {
        evidence: "provider_generated_summary",
        quality: "structured_generated",
        lifecycle: "none",
        completion: "none",
        rank: "candidate_only",
      },
      meetingIdentity: {
        ...granola.meetingIdentity!,
        startAt: "2026-07-27T18:30:00-07:00",
        endAt: "2026-07-27T19:30:00-07:00",
      },
    });
    const fallbackOnly = canonicalizeTaskMapMeetings([fallbackGemini, granola]);
    assert.strictEqual(fallbackOnly.length, 1);
    assert.strictEqual(fallbackOnly[0].identityMethod, "bounded_fingerprint");
  });

  it("uses a privacy-hashed exact fallback, fails ambiguous Calendar identities to review, and preserves a prior alias", () => {
    const { design, hint } = designMeetingSources();
    const fallbackHint: TaskMapMeetingIdentityHintV1 = {
      ...hint,
      calendarEventIdDigest: undefined,
    };
    const fallback = envelope({
      binding: design.envelope.binding,
      sourceKind: "gemini_meet",
      objectType: "meeting_note",
      sourceObjectId: design.envelope.sourceObjectId,
      sourceRevision: design.envelope.sourceRevision,
      eventTime: design.envelope.eventTime,
      contentDigest: design.envelope.contentDigest,
      authority: design.envelope.authority,
      meetingIdentity: fallbackHint,
    });
    const prior = canonicalizeTaskMapMeetings([fallback]);
    assert.strictEqual(prior[0].identityMethod, "bounded_fingerprint");
    const strong = envelope({
      binding: fallback.binding,
      sourceKind: "gemini_meet",
      objectType: "meeting_note",
      sourceObjectId: fallback.sourceObjectId,
      sourceRevision: fallback.sourceRevision,
      eventTime: fallback.eventTime,
      contentDigest: fallback.contentDigest,
      authority: fallback.authority,
      meetingIdentity: hint,
    });
    const upgraded = canonicalizeTaskMapMeetings([strong], prior);
    assert.strictEqual(upgraded[0].canonicalMeetingId, prior[0].canonicalMeetingId);
    assert.strictEqual(upgraded[0].identityMethod, "calendar_event");
    const priorSnapshot = buildTaskMapSourceSnapshot([fallback], []);
    const upgradedSnapshot = buildTaskMapSourceSnapshot(
      [strong],
      [],
      priorSnapshot.canonicalMeetings,
    );
    assert.strictEqual(
      upgradedSnapshot.canonicalMeetings[0].canonicalMeetingId,
      priorSnapshot.canonicalMeetings[0].canonicalMeetingId,
    );
    const { brain } = harnessFixture();
    assert.doesNotThrow(() => buildTaskMapSemanticProposalReference({
      sourceSnapshot: upgradedSnapshot,
      semanticBrainArtifact: semanticBrainForSnapshot(
        brain,
        upgradedSnapshot.semanticInputDigest,
      ),
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
    }));
    assert.throws(
      () => canonicalizeTaskMapMeetings([strong], [{
        ...structuredClone(prior[0]),
        canonicalMeetingId: "tmmeeting_attackerchosen",
      }]),
      /canonical meeting ID is not derived/,
    );

    const secondCalendar = envelope({
      binding: CALENDAR_BINDING,
      sourceKind: "google_calendar",
      objectType: "calendar_event",
      sourceObjectId: "conflicting-calendar-event",
      sourceRevision: "etag-conflict",
      eventTime: hint.startAt,
      contentDigest: taskMapContractDigest("conflicting-calendar"),
      authority: {
        evidence: "context_only",
        quality: "source_native",
        lifecycle: "none",
        completion: "none",
        rank: "context_only",
      },
      meetingIdentity: {
        ...hint,
        calendarEventIdDigest: taskMapContractDigest("other-calendar-id"),
      },
    });
    const firstCalendar = designMeetingSources().calendar;
    const ambiguous = canonicalizeTaskMapMeetings([firstCalendar, secondCalendar]);
    assert.strictEqual(ambiguous.length, 2);
    assert.ok(ambiguous.every((meeting) => meeting.reviewState === "needs_review"));
    assert.ok(ambiguous.every((meeting) => (
      meeting.conflictCodes.includes("conflicting_calendar_identity")
    )));
    assert.ok(!JSON.stringify(ambiguous).includes("private person"));
  });

  it("keeps checkpoints per connection and advances watermarks only after a complete success", () => {
    const { design } = designMeetingSources();
    const first = advanceTaskMapConnectorCheckpoint(null, {
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      adapterVersion: "gemini-drive-adapter.1",
      capabilities: ["read_context", "deep_link"],
      state: "success",
      attemptedAt: "2026-07-28T02:00:00.000Z",
      proposedWatermark: {
        kind: "composite",
        valueDigest: taskMapContractDigest("watermark-1"),
        observedThrough: "2026-07-28T02:00:00.000Z",
      },
      acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
    });
    const failed = advanceTaskMapConnectorCheckpoint(first, {
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      adapterVersion: "gemini-drive-adapter.1",
      capabilities: ["deep_link", "read_context"],
      state: "failed",
      attemptedAt: "2026-07-28T03:00:00.000Z",
      proposedWatermark: {
        kind: "composite",
        valueDigest: taskMapContractDigest("must-not-advance"),
        observedThrough: "2026-07-28T03:00:00.000Z",
      },
      errorCode: "provider_unavailable",
      errorDetailDigest: taskMapContractDigest("bounded-error"),
    });
    assert.deepStrictEqual(failed.watermark, first.watermark);
    assert.strictEqual(failed.lastSuccessfulPollAt, first.lastSuccessfulPollAt);
    assert.deepStrictEqual(
      failed.acceptedSourceIdentityDigests,
      first.acceptedSourceIdentityDigests,
    );
    const noOp = advanceTaskMapConnectorCheckpoint(failed, {
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      adapterVersion: "gemini-drive-adapter.1",
      capabilities: ["read_context", "deep_link"],
      state: "success",
      attemptedAt: "2026-07-28T04:00:00.000Z",
      proposedWatermark: {
        kind: "composite",
        valueDigest: taskMapContractDigest("watermark-2"),
        observedThrough: "2026-07-28T04:00:00.000Z",
      },
      acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
    });
    assert.notDeepStrictEqual(noOp.watermark, first.watermark);
    assert.deepStrictEqual(
      noOp.acceptedSourceIdentityDigests,
      first.acceptedSourceIdentityDigests,
    );
    assert.throws(
      () => advanceTaskMapConnectorCheckpoint(noOp, {
        binding: GEMINI_BINDING,
        sourceKind: "gemini_meet",
        adapterVersion: "gemini-drive-adapter.1",
        capabilities: ["read_context", "deep_link"],
        state: "success",
        attemptedAt: "2026-07-28T04:15:00.000Z",
        proposedWatermark: {
          kind: "composite",
          valueDigest: first.watermark!.valueDigest,
          observedThrough: "2026-07-28T04:15:00.000Z",
        },
        acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
      }),
      /watermark value cannot roll back/,
    );
    assert.throws(
      () => advanceTaskMapConnectorCheckpoint(noOp, {
        binding: GEMINI_BINDING,
        sourceKind: "gemini_meet",
        adapterVersion: "gemini-drive-adapter.1",
        capabilities: ["read_context"],
        state: "success",
        attemptedAt: "2026-07-28T04:30:00.000Z",
        proposedWatermark: {
          kind: "revision",
          valueDigest: taskMapContractDigest("changed-watermark-kind"),
          observedThrough: "2026-07-28T04:30:00.000Z",
        },
        acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
      }),
      /watermark kind cannot change/,
    );
    assert.throws(
      () => advanceTaskMapConnectorCheckpoint(noOp, {
        binding: GEMINI_BINDING,
        sourceKind: "gemini_meet",
        adapterVersion: "gemini-drive-adapter.1",
        capabilities: ["read_context"],
        state: "success",
        attemptedAt: "2026-07-28T04:30:00.000Z",
        proposedWatermark: {
          kind: "composite",
          valueDigest: taskMapContractDigest("dropped-watermark-time"),
        },
        acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
      }),
      /observedThrough cannot be dropped/,
    );
    assert.throws(
      () => advanceTaskMapConnectorCheckpoint(noOp, {
        binding: { ...GEMINI_BINDING, grantVersion: "changed-grant" },
        sourceKind: "gemini_meet",
        adapterVersion: "gemini-drive-adapter.1",
        capabilities: ["read_context"],
        state: "failed",
        attemptedAt: "2026-07-28T05:00:00.000Z",
        errorCode: "grant_changed",
        errorDetailDigest: taskMapContractDigest("grant-changed"),
      }),
      /cannot cross a connection, tenant, principal, grant, or source/,
    );
  });

  it("rejects required lineage deletion and optional prototype pollution through exported assertions", () => {
    const { design } = designMeetingSources();
    const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      adapterVersion: "gemini-drive-adapter.1",
      capabilities: ["read_context", "deep_link"],
      state: "success",
      attemptedAt: "2026-07-28T02:00:00.000Z",
      proposedWatermark: {
        kind: "composite",
        valueDigest: taskMapContractDigest("required-field-watermark"),
        observedThrough: "2026-07-28T02:00:00.000Z",
      },
      acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
    });
    for (const key of [
      "connectionId",
      "grantVersion",
      "tenantOrWorkspaceDigest",
      "accountOrPrincipalDigest",
    ] as const) {
      const forged = structuredClone(checkpoint) as unknown as Record<
        string,
        unknown
      >;
      delete (forged.binding as Record<string, unknown>)[key];
      forged.checkpointId = `tmcheckpoint_${
        taskMapContractDigest(forged).slice(0, 16)
      }`;
      assert.throws(
        () => assertTaskMapConnectorCheckpoint(
          forged as unknown as typeof checkpoint,
        ),
        /required|binding|checkpoint/i,
      );
    }
    for (const key of [
      "adapterVersion",
      "state",
      "capabilities",
      "watermarkHistoryDigests",
      "acceptedSourceIdentityDigests",
    ] as const) {
      const forged = structuredClone(checkpoint) as unknown as Record<
        string,
        unknown
      >;
      delete forged[key];
      forged.checkpointId = `tmcheckpoint_${
        taskMapContractDigest(forged).slice(0, 16)
      }`;
      assert.throws(
        () => assertTaskMapConnectorCheckpoint(
          forged as unknown as typeof checkpoint,
        ),
        /required|checkpoint/i,
      );
    }

    const nullWatermark = structuredClone(checkpoint) as unknown as Record<
      string,
      unknown
    >;
    nullWatermark.watermark = null;
    nullWatermark.checkpointId = recomputeConnectorCheckpointId(
      nullWatermark as unknown as typeof checkpoint,
    );
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(
        nullWatermark as unknown as typeof checkpoint,
      ),
      /watermark|object|required/i,
    );

    const failedCheckpoint = advanceTaskMapConnectorCheckpoint(
      checkpoint,
      {
        binding: checkpoint.binding,
        sourceKind: checkpoint.sourceKind,
        adapterVersion: checkpoint.adapterVersion,
        capabilities: checkpoint.capabilities,
        state: "failed",
        attemptedAt: "2026-07-28T03:00:00.000Z",
        errorCode: "provider_unavailable",
        errorDetailDigest: taskMapContractDigest(
          "required-field-failed-detail",
        ),
      },
    );
    const nullError = structuredClone(failedCheckpoint) as unknown as Record<
      string,
      unknown
    >;
    nullError.error = null;
    nullError.checkpointId = recomputeConnectorCheckpointId(
      nullError as unknown as typeof failedCheckpoint,
    );
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(
        nullError as unknown as typeof failedCheckpoint,
      ),
      /error|object|required/i,
    );

    const accessorError = structuredClone(failedCheckpoint);
    const stableError = accessorError.error;
    let errorAccessorReads = 0;
    delete (
      accessorError as unknown as Record<string, unknown>
    ).error;
    Object.defineProperty(accessorError, "error", {
      enumerable: true,
      configurable: true,
      get: () => {
        errorAccessorReads += 1;
        return stableError;
      },
    });
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(accessorError),
      /error.*enumerable data property|data property/i,
    );
    assert.strictEqual(errorAccessorReads, 0);

    const inheritedError = structuredClone(failedCheckpoint);
    const inheritedStableError = inheritedError.error;
    let inheritedErrorReads = 0;
    delete (
      inheritedError as unknown as Record<string, unknown>
    ).error;
    const hostilePrototype = Object.create(null);
    Object.defineProperty(hostilePrototype, "error", {
      enumerable: true,
      configurable: true,
      get: () => {
        inheritedErrorReads += 1;
        return inheritedStableError;
      },
    });
    Object.setPrototypeOf(inheritedError, hostilePrototype);
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(inheritedError),
      /plain object/i,
    );
    assert.strictEqual(inheritedErrorReads, 0);

    const accessorWatermark = structuredClone(checkpoint);
    const stableWatermark = accessorWatermark.watermark;
    let watermarkAccessorReads = 0;
    delete (
      accessorWatermark as unknown as Record<string, unknown>
    ).watermark;
    Object.defineProperty(accessorWatermark, "watermark", {
      enumerable: true,
      configurable: true,
      get: () => {
        watermarkAccessorReads += 1;
        return stableWatermark;
      },
    });
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(accessorWatermark),
      /watermark.*enumerable data property|data property/i,
    );
    assert.strictEqual(watermarkAccessorReads, 0);

    const hiddenAdapterVersion = structuredClone(checkpoint);
    const adapterVersion = hiddenAdapterVersion.adapterVersion;
    delete (
      hiddenAdapterVersion as unknown as Record<string, unknown>
    ).adapterVersion;
    Object.defineProperty(hiddenAdapterVersion, "adapterVersion", {
      enumerable: false,
      configurable: true,
      writable: true,
      value: adapterVersion,
    });
    hiddenAdapterVersion.checkpointId = recomputeConnectorCheckpointId(
      hiddenAdapterVersion,
    );
    assert.throws(
      () => assertTaskMapConnectorCheckpoint(hiddenAdapterVersion),
      /required|adapterVersion/i,
    );

    for (const inheritedCase of [
      {
        key: "error",
        original: failedCheckpoint,
        inheritedValue: failedCheckpoint.error,
      },
      {
        key: "watermark",
        original: checkpoint,
        inheritedValue: checkpoint.watermark,
      },
      {
        key: "lastSuccessfulPollAt",
        original: checkpoint,
        inheritedValue: checkpoint.lastSuccessfulPollAt,
      },
    ] as const) {
      const forged = structuredClone(inheritedCase.original) as unknown as Record<
        string,
        unknown
      >;
      delete forged[inheritedCase.key];
      const priorDescriptor = Object.getOwnPropertyDescriptor(
        Object.prototype,
        inheritedCase.key,
      );
      let getterReads = 0;
      try {
        Object.defineProperty(Object.prototype, inheritedCase.key, {
          configurable: true,
          get: () => {
            getterReads += 1;
            return inheritedCase.inheritedValue;
          },
        });
        assert.throws(
          () => assertTaskMapConnectorCheckpoint(
            forged as unknown as typeof checkpoint,
          ),
          new RegExp(
            `connector checkpoint\\.${inheritedCase.key} must not be inherited`,
            "i",
          ),
        );
      } finally {
        if (priorDescriptor === undefined) {
          Reflect.deleteProperty(Object.prototype, inheritedCase.key);
        } else {
          Object.defineProperty(
            Object.prototype,
            inheritedCase.key,
            priorDescriptor,
          );
        }
      }
      assert.strictEqual(
        getterReads,
        0,
        `${inheritedCase.key} getter must not be executed`,
      );
    }

    const snapshot = buildTaskMapSourceSnapshot([design.envelope], []);
    for (const key of [
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
    ] as const) {
      const forged = structuredClone(snapshot) as unknown as Record<
        string,
        unknown
      >;
      delete forged[key];
      assert.throws(
        () => assertTaskMapSourceSnapshot(
          forged as unknown as typeof snapshot,
        ),
        /required|snapshot/i,
      );
    }

    const hiddenBindingSnapshot = structuredClone(snapshot);
    const hiddenBinding = hiddenBindingSnapshot.envelopes[0].binding;
    const grantVersion = hiddenBinding.grantVersion;
    delete (
      hiddenBinding as unknown as Record<string, unknown>
    ).grantVersion;
    Object.defineProperty(hiddenBinding, "grantVersion", {
      enumerable: false,
      configurable: true,
      writable: true,
      value: grantVersion,
    });
    hiddenBindingSnapshot.sourceSnapshotDigest = taskMapContractDigest({
      ownerScopeDigest: hiddenBindingSnapshot.ownerScopeDigest,
      envelopes: hiddenBindingSnapshot.envelopes,
      discoveryPointers: hiddenBindingSnapshot.discoveryPointers,
      canonicalMeetings: hiddenBindingSnapshot.canonicalMeetings,
    });
    hiddenBindingSnapshot.snapshotId =
      `tmsnapshot_${
        taskMapContractDigest(
          hiddenBindingSnapshot.sourceSnapshotDigest,
        ).slice(0, 16)
      }`;
    assert.throws(
      () => assertTaskMapSourceSnapshot(hiddenBindingSnapshot),
      /required|grantVersion|binding/i,
    );
    for (const key of [
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
      "privacy",
    ] as const) {
      const forged = structuredClone(snapshot);
      delete (
        forged.envelopes[0] as unknown as Record<string, unknown>
      )[key];
      assert.throws(
        () => assertTaskMapSourceSnapshot(forged),
        /required|envelope|snapshot/i,
      );
    }
  });

  it("canonicalizes parallel source order and excludes Gmail discovery, checkpoints, and optional body context from semantic invalidation", () => {
    const { design, granola, calendar } = designMeetingSources();
    const codex = agentEnvelope("codex_session", "codex-session-1");
    const claude = agentEnvelope("claude_session", "claude-session-1");
    const cursor = agentEnvelope("cursor_session", "cursor-session-1");
    const body = bodyEnvelope();
    const baseEnvelopes = [
      design.envelope,
      granola,
      calendar,
      codex,
      claude,
      cursor,
    ];
    const driveOnly = buildTaskMapSourceSnapshot(baseEnvelopes, []);
    const gmailDiscovered = buildTaskMapSourceSnapshot(
      [...baseEnvelopes].reverse(),
      design.discoveryPointers,
    );
    const withBody = buildTaskMapSourceSnapshot(
      [body, ...baseEnvelopes],
      design.discoveryPointers,
    );
    assert.notStrictEqual(driveOnly.sourceSnapshotDigest, gmailDiscovered.sourceSnapshotDigest);
    assert.strictEqual(driveOnly.semanticInputDigest, gmailDiscovered.semanticInputDigest);
    assert.notStrictEqual(
      driveOnly.discoveryProvenanceDigest,
      gmailDiscovered.discoveryProvenanceDigest,
    );
    assert.strictEqual(driveOnly.semanticInputDigest, withBody.semanticInputDigest);
    assert.notStrictEqual(driveOnly.sourceSnapshotDigest, withBody.sourceSnapshotDigest);
    assert.notStrictEqual(driveOnly.bodyContextDigest, withBody.bodyContextDigest);

    const changedCalendarContent = envelope({
      binding: calendar.binding,
      sourceKind: calendar.sourceKind,
      objectType: calendar.objectType,
      sourceObjectId: calendar.sourceObjectId,
      sourceRevision: calendar.sourceRevision,
      eventTime: calendar.eventTime,
      contentDigest: taskMapContractDigest("calendar-content-changed-with-same-revision"),
      authority: calendar.authority,
      meetingIdentity: calendar.meetingIdentity,
    });
    assert.strictEqual(
      changedCalendarContent.sourceIdentityDigest,
      calendar.sourceIdentityDigest,
    );
    const withChangedCalendarContent = buildTaskMapSourceSnapshot(
      [
        design.envelope,
        granola,
        changedCalendarContent,
        codex,
        claude,
        cursor,
      ],
      [],
    );
    assert.notStrictEqual(
      driveOnly.semanticInputDigest,
      withChangedCalendarContent.semanticInputDigest,
    );

    const newCalendarEvidence = envelope({
      binding: CALENDAR_BINDING,
      sourceKind: "google_calendar",
      objectType: "calendar_event",
      sourceObjectId: "new-calendar-context",
      sourceRevision: "new-calendar-etag",
      eventTime: "2026-07-29T17:00:00.000Z",
      contentDigest: taskMapContractDigest("new-calendar-context"),
      authority: {
        evidence: "context_only",
        quality: "source_native",
        lifecycle: "none",
        completion: "none",
        rank: "context_only",
      },
      meetingIdentity: {
        fingerprintVersion: "taskmap-meeting-fingerprint.1",
        startAt: "2026-07-29T17:00:00.000Z",
        normalizedTitleDigest: taskMapContractDigest("new-calendar-title"),
        participantSetDigest: taskMapContractDigest("new-calendar-participants"),
      },
    });
    const changed = buildTaskMapSourceSnapshot(
      [...baseEnvelopes, newCalendarEvidence],
      [],
    );
    assert.notStrictEqual(changed.semanticInputDigest, driveOnly.semanticInputDigest);
    const { brain } = harnessFixture();
    const oldBrainArtifact = semanticBrainForSnapshot(brain, driveOnly.semanticInputDigest);
    const oldProposal = buildTaskMapSemanticProposalReference({
      sourceSnapshot: driveOnly,
      semanticBrainArtifact: oldBrainArtifact,
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
    });
    assert.doesNotThrow(() => assertTaskMapSemanticProposalCurrent(withBody, oldProposal));
    assert.throws(
      () => assertTaskMapSemanticProposalCurrent(changed, oldProposal),
      /semantic brain is stale/,
    );
    assert.throws(
      () => buildTaskMapSemanticProposalReference({
        sourceSnapshot: changed,
        semanticBrainArtifact: oldBrainArtifact,
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
      }),
      /artifact is stale/,
    );
    assert.throws(
      () => buildTaskMapSemanticProposalReference({
        sourceSnapshot: changed,
        semanticBrainArtifact: {
          ...structuredClone(oldBrainArtifact),
          sourceSemanticInputDigest: changed.semanticInputDigest,
        },
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
      }),
      /attestation is invalid/,
    );
  });

  it("keeps semantic proposal references closed and deterministic gates separate", () => {
    const { design } = designMeetingSources();
    const snapshot = buildTaskMapSourceSnapshot([design.envelope], []);
    const { brain } = harnessFixture();
    const brainArtifact = semanticBrainForSnapshot(brain, snapshot.semanticInputDigest);
    const proposal = buildTaskMapSemanticProposalReference({
      sourceSnapshot: snapshot,
      semanticBrainArtifact: brainArtifact,
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
    });
    assert.deepStrictEqual(
      proposal.rootProposalIds,
      brainArtifact.brain.roots.map((root) => root.proposalId).sort(),
    );
    assert.ok(!JSON.stringify(proposal).includes("openState"));
    assert.ok(!JSON.stringify(proposal).includes("priority"));
    assert.throws(
      () => buildTaskMapSemanticProposalReference({
        sourceSnapshot: snapshot,
        semanticBrainArtifact: brainArtifact,
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        openState: "open",
      } as never),
      /openState/,
    );
    const first = buildTaskMapGateDecision({
      subjectId: "candidate-a",
      gate: "authority",
      outcome: "candidate_only",
      reasonCodes: ["meeting_context_only", "no_task_home"],
    });
    const reordered = buildTaskMapGateDecision({
      subjectId: "candidate-a",
      gate: "authority",
      outcome: "candidate_only",
      reasonCodes: ["no_task_home", "meeting_context_only"],
    });
    assert.deepStrictEqual(first, reordered);
    assert.ok(!JSON.stringify(first).includes("summary"));
  });

  it("produces stable projection diffs and classifies Strategy-vs-Task-Map differences without a Strategy runtime dependency", () => {
    const { input, brain } = harnessFixture();
    const fixedNow = "2026-07-28T02:30:00.000Z";
    const previous = buildTaskMapProjection(input, brain, { arm: "E2", now: fixedNow });
    const current = buildTaskMapProjection(input, brain, {
      arm: "E3",
      now: fixedNow,
      previousProjection: previous,
    });
    const same = diffTaskMapProjections(previous, current);
    const repeated = diffTaskMapProjections(previous, structuredClone(current));
    const permutedCurrent = {
      ...structuredClone(current),
      sources: [...current.sources].reverse(),
      roots: [...current.roots].reverse(),
      tasks: [...current.tasks].reverse(),
      edges: [...current.edges].reverse(),
      rejections: [...current.rejections].reverse(),
    };
    const permuted = diffTaskMapProjections(previous, permutedCurrent);
    assert.deepStrictEqual(same, repeated);
    assert.deepStrictEqual(same, permuted);
    assert.strictEqual(same.changed.length, 0);
    assert.strictEqual(same.added.length, 0);
    assert.strictEqual(same.removed.length, 0);

    const acceptedDeltaDigest = taskMapContractDigest("accepted-delta");
    const sharedStrategy = targetRecord(
      "work-taskmap-contract",
      "shared_accepted_work",
      "accepted_open",
    );
    const sharedTaskMap = {
      ...sharedStrategy,
      recordDigest: taskMapContractDigest("taskmap-operational-rendering"),
    };
    const strategy = buildTaskMapProjectionTarget({
      target: "strategy",
      acceptedDeltaDigest,
      records: [
        sharedStrategy,
        targetRecord("decision-connector-first", "strategy_durable_context", "resolved"),
      ],
    });
    const taskMap = buildTaskMapProjectionTarget({
      target: "task_map",
      acceptedDeltaDigest,
      records: [
        sharedTaskMap,
        targetRecord("candidate-design-system", "taskmap_candidate_review", "candidate"),
        targetRecord("root-taskmap", "taskmap_operational_detail", "accepted_open"),
      ],
    });
    const parity = compareTaskMapProjectionTargets(strategy, taskMap);
    assert.deepStrictEqual(parity.failures, []);
    assert.deepStrictEqual(
      parity.intentionalDifferences.map((finding) => finding.code).sort(),
      [
        "strategy_durable_context_only",
        "taskmap_candidate_review_only",
        "taskmap_operational_detail_only",
      ],
    );
    const brokenTaskMap = buildTaskMapProjectionTarget({
      target: "task_map",
      acceptedDeltaDigest,
      records: taskMap.records.filter((record) => record.canonicalRecordId !== sharedTaskMap.canonicalRecordId),
    });
    assert.ok(compareTaskMapProjectionTargets(strategy, brokenTaskMap).failures.some(
      (finding) => finding.code === "shared_work_missing_task_map",
    ));
    assert.throws(
      () => buildTaskMapProjectionTarget({
        target: "strategy",
        acceptedDeltaDigest,
        records: [
          targetRecord("candidate-design-system", "taskmap_candidate_review", "candidate"),
        ],
      }),
      /incompatible with the strategy projection/,
    );
    assert.throws(
      () => buildTaskMapProjectionTarget({
        target: "task_map",
        acceptedDeltaDigest,
        records: [
          targetRecord("decision-connector-first", "strategy_durable_context", "resolved"),
        ],
      }),
      /incompatible with the task_map projection/,
    );
    const downgradedTaskMap = {
      ...taskMap,
      records: taskMap.records.map((record) => (
        record.canonicalRecordId === sharedTaskMap.canonicalRecordId
          ? {
              ...record,
              role: "taskmap_candidate_review" as const,
              lifecycle: "candidate" as const,
            }
          : record
      )),
    };
    assert.ok(compareTaskMapProjectionTargets(strategy, downgradedTaskMap).failures.some(
      (finding) => finding.code === "role_mismatch",
    ));
  });

  it("replays identical snapshot, brain artifact, previous projection, policies, and fixed now byte-for-byte", () => {
    const { design, granola, calendar } = designMeetingSources();
    const snapshot = buildTaskMapSourceSnapshot(
      [
        design.envelope,
        granola,
        calendar,
        agentEnvelope("codex_session", "codex-session-1"),
        bodyEnvelope(),
      ],
      design.discoveryPointers,
    );
    const { input, brain } = harnessFixture();
    const fixedNow = "2026-07-28T02:30:00.000Z";
    const previous = buildTaskMapProjection(input, brain, { arm: "E2", now: fixedNow });
    const firstProjection = buildTaskMapProjection(input, brain, {
      arm: "E3",
      now: fixedNow,
      previousProjection: previous,
    });
    const replayProjection = buildTaskMapProjection(
      structuredClone(input),
      structuredClone(brain),
      {
        arm: "E3",
        now: fixedNow,
        previousProjection: structuredClone(previous),
      },
    );
    assert.deepStrictEqual(replayProjection, firstProjection);
    assert.strictEqual(
      taskMapContractCanonicalJson(replayProjection),
      taskMapContractCanonicalJson(firstProjection),
    );
    assert.strictEqual(replayProjection.runId, firstProjection.runId);

    const semanticBrainArtifact = semanticBrainForSnapshot(
      brain,
      snapshot.semanticInputDigest,
    );
    const semanticProposal = buildTaskMapSemanticProposalReference({
      sourceSnapshot: snapshot,
      semanticBrainArtifact,
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
    });
    const decisions = [
      buildTaskMapGateDecision({
        subjectId: "task-source-contract",
        gate: "authority",
        outcome: "accepted",
        reasonCodes: ["source_task_open"],
      }),
      buildTaskMapGateDecision({
        subjectId: "root-taskmap-productization",
        gate: "lifecycle",
        outcome: "candidate_only",
        reasonCodes: ["owner_missing"],
      }),
    ];
    const checkpoint = advanceTaskMapConnectorCheckpoint(null, {
      binding: GEMINI_BINDING,
      sourceKind: "gemini_meet",
      adapterVersion: "gemini-drive-adapter.1",
      capabilities: ["read_context", "deep_link"],
      state: "success",
      attemptedAt: fixedNow,
      proposedWatermark: {
        kind: "revision",
        valueDigest: taskMapContractDigest("drive-revision-watermark"),
        observedThrough: fixedNow,
      },
      acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
    });
    const projectionDiff = diffTaskMapProjections(previous, firstProjection);
    const acceptedDeltaDigest = taskMapContractDigest({
      sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
      semanticBrainDigest: semanticProposal.semanticBrainDigest,
      gateDecisionIds: decisions.map((decision) => decision.decisionId).sort(),
      currentProjectionDigest: projectionDiff.currentProjectionDigest,
    });
    const shared = targetRecord(
      "work-taskmap-contract",
      "shared_accepted_work",
      "accepted_open",
    );
    const parity = compareTaskMapProjectionTargets(
      buildTaskMapProjectionTarget({
        target: "strategy",
        acceptedDeltaDigest,
        records: [shared],
      }),
      buildTaskMapProjectionTarget({
        target: "task_map",
        acceptedDeltaDigest,
        records: [shared],
      }),
    );
    const firstManifest = buildTaskMapReplayManifest({
      fixedNow,
      sourceSnapshot: snapshot,
      semanticBrainArtifact,
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
      previousProjection: previous,
      currentProjection: firstProjection,
      policyBindings: replayPolicies(),
      connectorCheckpoints: [checkpoint],
      gateDecisions: decisions,
      projectionParity: parity,
    });
    const replayManifest = buildTaskMapReplayManifest({
      fixedNow,
      sourceSnapshot: structuredClone(snapshot),
      semanticBrainArtifact: structuredClone(semanticBrainArtifact),
      semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
      previousProjection: structuredClone(previous),
      currentProjection: structuredClone(firstProjection),
      policyBindings: replayPolicies().reverse(),
      connectorCheckpoints: [structuredClone(checkpoint)],
      gateDecisions: structuredClone(decisions).reverse(),
      projectionParity: structuredClone(parity),
    });
    assert.deepStrictEqual(replayManifest, firstManifest);
    assert.strictEqual(
      taskMapContractCanonicalJson(replayManifest),
      taskMapContractCanonicalJson(firstManifest),
    );
    assert.strictEqual(replayManifest.manifestId, firstManifest.manifestId);
    assert.ok(!JSON.stringify(firstManifest).includes(SEMANTIC_ATTESTATION_KEY));
    assert.deepStrictEqual(
      replayManifest.gateDecisions.map((decision) => decision.decisionId),
      firstManifest.gateDecisions.map((decision) => decision.decisionId),
    );
    assert.throws(
      () => buildTaskMapReplayManifest({
        fixedNow,
        sourceSnapshot: snapshot,
        semanticBrainArtifact,
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        previousProjection: previous,
        currentProjection: firstProjection,
        policyBindings: replayPolicies(),
        connectorCheckpoints: [checkpoint],
        gateDecisions: [
          ...decisions,
          buildTaskMapGateDecision({
            subjectId: "task-source-contract",
            gate: "authority",
            outcome: "rejected",
            reasonCodes: ["synthetic-conflict"],
          }),
        ],
        projectionParity: parity,
      }),
      /conflicting decisions/,
    );
    const failingParity = compareTaskMapProjectionTargets(
      buildTaskMapProjectionTarget({
        target: "strategy",
        acceptedDeltaDigest,
        records: [targetRecord(
          "work-taskmap-contract",
          "shared_accepted_work",
          "accepted_open",
        )],
      }),
      buildTaskMapProjectionTarget({
        target: "task_map",
        acceptedDeltaDigest,
        records: [targetRecord(
          "work-taskmap-contract",
          "shared_accepted_work",
          "resolved",
        )],
      }),
    );
    assert.throws(
      () => buildTaskMapReplayManifest({
        fixedNow,
        sourceSnapshot: snapshot,
        semanticBrainArtifact,
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        previousProjection: previous,
        currentProjection: firstProjection,
        policyBindings: replayPolicies(),
        connectorCheckpoints: [checkpoint],
        gateDecisions: decisions,
        projectionParity: failingParity,
      }),
      /projection parity must pass/,
    );
    assert.throws(
      () => buildTaskMapReplayManifest({
        fixedNow,
        sourceSnapshot: snapshot,
        semanticBrainArtifact: attestTaskMapSemanticBrain(
          snapshot.semanticInputDigest,
          {
            ...semanticBrainArtifact.brain,
            model: "synthetic-other-model",
          },
          SEMANTIC_ATTESTATION_KEY,
        ),
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        previousProjection: previous,
        currentProjection: firstProjection,
        policyBindings: replayPolicies(),
        connectorCheckpoints: [checkpoint],
        gateDecisions: decisions,
        projectionParity: parity,
      }),
      /current projection is not bound/,
    );
    assert.throws(
      () => buildTaskMapReplayManifest({
        fixedNow,
        sourceSnapshot: snapshot,
        semanticBrainArtifact: attestTaskMapSemanticBrain(
          snapshot.semanticInputDigest,
          {
            ...structuredClone(semanticBrainArtifact.brain),
            roots: semanticBrainArtifact.brain.roots.map((root, index) => (
              index === 0 ? { ...root, title: "Changed semantic root" } : root
            )),
          },
          SEMANTIC_ATTESTATION_KEY,
        ),
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        previousProjection: previous,
        currentProjection: firstProjection,
        policyBindings: replayPolicies(),
        connectorCheckpoints: [checkpoint],
        gateDecisions: decisions,
        projectionParity: parity,
      }),
      /current projection is not bound/,
    );
    assert.throws(
      () => buildTaskMapReplayManifest({
        fixedNow: "2026-07-28T02:31:00.000Z",
        sourceSnapshot: snapshot,
        semanticBrainArtifact,
        semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        previousProjection: previous,
        currentProjection: firstProjection,
        policyBindings: replayPolicies(),
        connectorCheckpoints: [checkpoint],
        gateDecisions: decisions,
        projectionParity: parity,
      }),
      /current projection is not bound/,
    );
    assert.throws(
      () => diffTaskMapProjections(previous, {
        ...structuredClone(firstProjection),
        tasks: firstProjection.tasks.map((task, index) => (
          index === 0
            ? { ...task, summary: "/Users/private/replay-leak/session.jsonl" }
            : task
        )),
      }),
      /privacy leak: local_path/,
    );
  });

  it("makes valid new non-body harness evidence reject an old brain while body-only evidence stays neutral", () => {
    const { input, brain } = harnessFixture();
    const withBody = structuredClone(input);
    withBody.pointers.push({
      id: "oura-relative",
      sourceKind: "oura",
      sourceObjectId: "relative-day",
      sourceRefHash: "2222222222222222",
      sourceVersion: "relative-v2",
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
    withBody.events.push({
      id: "oura-relative-day",
      pointerId: "oura-relative",
      recordKind: "body_context",
      activity: "body_window_observed",
      occurredAt: "2026-07-27T07:00:00.000Z",
      observedAt: input.generatedAt,
      dayKey: "2026-07-27",
      objectRefs: ["body-day:2026-07-27"],
      title: "Body window relative to the personal baseline",
      summary: "Relative category only; no raw biometric values are stored.",
      extractionConfidence: 1,
      bodyCategory: "within_baseline",
      bodyAxis: "composite_recovery",
    });
    assert.strictEqual(
      taskMapSemanticInputDigest(withBody),
      taskMapSemanticInputDigest(input),
    );
    assert.strictEqual(
      buildTaskMapProjection(withBody, brain, { arm: "E1" }).runStatus,
      "accepted",
    );

    const changed = structuredClone(input);
    changed.pointers.push({
      id: "calendar-new",
      sourceKind: "google_calendar",
      sourceObjectId: "calendar-new-evidence",
      sourceRefHash: "3333333333333333",
      sourceVersion: "calendar-etag-v1",
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
    changed.events.push({
      id: "calendar-new-context",
      pointerId: "calendar-new",
      recordKind: "work_context",
      activity: "context_observed",
      occurredAt: "2026-07-28T01:00:00.000Z",
      observedAt: input.generatedAt,
      dayKey: "2026-07-27",
      objectRefs: ["calendar:new-evidence"],
      title: "A new bounded Calendar constraint",
      summary: "The new non-body source record changes the semantic evidence snapshot.",
      extractionConfidence: 1,
    });
    assert.notStrictEqual(
      taskMapSemanticInputDigest(changed),
      taskMapSemanticInputDigest(input),
    );
    const rejected = buildTaskMapProjection(changed, brain, { arm: "E1" });
    assert.strictEqual(rejected.runStatus, "rejected");
    assert.ok(rejected.rejections.some((rejection) => (
      rejection.proposalId === "brain"
      && rejection.reasons.includes("brain semantic input digest does not match")
    )));
  });

  it("canonical JSON orders keys by Unicode scalar value, matching the Swift reader", () => {
    // The Swift consumer (TaskMapLifecycleCanonicalJSON) sorts object keys by
    // Unicode scalar order, so 'W' (0x57) sorts before 'n' (0x6e). A locale-
    // aware sort flips case-mixed sibling keys such as currentWork/currentness
    // and makes every published generation manifest unreadable to the app.
    assert.strictEqual(
      taskMapContractCanonicalJson({ currentness: 1, currentWork: null }),
      '{"currentWork":null,"currentness":1}',
    );
    assert.strictEqual(
      taskMapContractCanonicalJson({ b: 1, B: 2, a: 3, A: 4 }),
      '{"A":4,"B":2,"a":3,"b":1}',
    );
  });
});
