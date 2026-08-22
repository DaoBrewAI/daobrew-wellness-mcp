"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const OWNER_SCOPE_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)("fixture-owner-scope");
const SEMANTIC_ATTESTATION_KEY = "synthetic-taskmap-semantic-attestation-key-material-v1";
const GEMINI_BINDING = {
    connectionId: "google-workspace-primary",
    sourceKind: "gemini_meet",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("fixture-google-workspace"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("fixture-principal"),
    grantVersion: "google-read-v1",
};
const CALENDAR_BINDING = {
    ...GEMINI_BINDING,
    sourceKind: "google_calendar",
};
const GRANOLA_BINDING = {
    connectionId: "granola-primary",
    sourceKind: "granola",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("granola-workspace"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("granola-principal"),
    grantVersion: "granola-read-v1",
};
function localAgentBinding(sourceKind) {
    return {
        connectionId: `local-${sourceKind}-index`,
        sourceKind,
        tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("local-workspace"),
        accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("local-principal"),
        grantVersion: "agent-read-v1",
    };
}
const OURA_BINDING = {
    connectionId: "oura-owner-read",
    sourceKind: "oura",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("oura-owner"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("oura-principal"),
    grantVersion: "oura-read-v1",
};
const STRATEGY_BINDING = {
    connectionId: "strategy-read",
    sourceKind: "strategy",
    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-workspace"),
    accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("strategy-principal"),
    grantVersion: "strategy-read-v1",
};
function readGeminiFixture(filename) {
    return JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.resolve(process.cwd(), "tests/fixtures/taskmap-p9.2", filename), "utf8"));
}
function envelope(draft) {
    return (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        ...draft,
    });
}
function recomputeConnectorCheckpointId(checkpoint) {
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
        acceptedSourceIdentityDigests: checkpoint.acceptedSourceIdentityDigests,
        error: checkpoint.error,
    };
    return `tmcheckpoint_${(0, source_contracts_js_1.taskMapContractDigest)(core).slice(0, 16)}`;
}
function designMeetingSources() {
    const design = (0, source_contracts_js_1.buildGeminiMeetSource)(readGeminiFixture("gemini-direct-discovery.json").draft);
    const hint = design.envelope.meetingIdentity;
    const granola = envelope({
        binding: GRANOLA_BINDING,
        sourceKind: "granola",
        objectType: "meeting_note",
        sourceObjectId: "synthetic-granola-meeting-0001",
        sourceRevision: "synthetic-granola-revision-0001",
        eventTime: hint.startAt,
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("granola-design-content"),
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
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("calendar-content"),
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
function agentEnvelope(sourceKind, id) {
    return envelope({
        binding: localAgentBinding(sourceKind),
        sourceKind,
        objectType: "agent_session",
        sourceObjectId: (0, source_contracts_js_1.taskMapContractDigest)(`synthetic-agent-session:${id}`),
        sourceRevision: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-agent-session-revision-v1"),
        eventTime: "2026-07-27T20:00:00.000Z",
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)(`${sourceKind}-bounded-evidence`),
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
        sourceObjectId: (0, source_contracts_js_1.taskMapContractDigest)(`synthetic-body-context:${id}`),
        sourceRevision: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-relative-classifier-v2"),
        eventTime: "2026-07-27T07:00:00.000Z",
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)(id),
        authority: {
            evidence: "body_context_only",
            quality: "coverage_only",
            lifecycle: "none",
            completion: "none",
            rank: "body_bonus_only",
        },
    });
}
function harnessFixture() {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
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
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
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
function semanticBrainForSnapshot(brain, semanticInputDigest) {
    return (0, source_contracts_js_1.attestTaskMapSemanticBrain)(semanticInputDigest, brain, SEMANTIC_ATTESTATION_KEY);
}
function replayPolicies() {
    return [
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
    ].map((name) => ({
        name,
        version: name === "algorithm" ? types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION : `${name}.v1`,
        digest: (0, source_contracts_js_1.taskMapContractDigest)({ name, version: "v1" }),
    }));
}
function targetRecord(canonicalRecordId, role, lifecycle) {
    return {
        canonicalRecordId,
        role,
        lifecycle,
        sourceIdentityDigest: (0, source_contracts_js_1.taskMapContractDigest)(`source:${canonicalRecordId}`),
        recordDigest: (0, source_contracts_js_1.taskMapContractDigest)({ canonicalRecordId, role, lifecycle }),
    };
}
(0, node_test_1.describe)("Task Map P9.2 source contracts", () => {
    (0, node_test_1.it)("uses Drive Doc ID plus revision as Gemini identity for direct, forwarded, and no-email discovery", () => {
        const directFixture = readGeminiFixture("gemini-direct-discovery.json");
        const forwardedFixture = readGeminiFixture("gemini-forwarded-discovery.json");
        const noEmailFixture = readGeminiFixture("gemini-no-email-discovery.json");
        const direct = (0, source_contracts_js_1.buildGeminiMeetSource)(directFixture.draft);
        const directWithoutEmail = (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...directFixture.draft,
            gmailDiscoveries: [],
        });
        const forwarded = (0, source_contracts_js_1.buildGeminiMeetSource)(forwardedFixture.draft);
        const noEmail = (0, source_contracts_js_1.buildGeminiMeetSource)(noEmailFixture.draft);
        node_assert_1.default.deepStrictEqual(direct.envelope, directWithoutEmail.envelope);
        node_assert_1.default.deepStrictEqual(direct.envelope, noEmail.envelope);
        node_assert_1.default.notStrictEqual(forwarded.envelope.sourceIdentityDigest, noEmail.envelope.sourceIdentityDigest);
        node_assert_1.default.strictEqual(direct.discoveryPointers.length, 1);
        node_assert_1.default.strictEqual(direct.discoveryPointers[0].channel, "gmail_direct");
        node_assert_1.default.strictEqual(forwarded.discoveryPointers[0].channel, "gmail_forwarded");
        node_assert_1.default.strictEqual(noEmail.discoveryPointers.length, 0);
        node_assert_1.default.strictEqual(direct.discoveryPointers[0].targetSourceIdentityDigest, noEmail.envelope.sourceIdentityDigest);
        node_assert_1.default.ok(direct.envelope.meetingIdentity?.calendarEventIdDigest);
        node_assert_1.default.ok(noEmail.envelope.meetingIdentity?.calendarEventIdDigest);
        node_assert_1.default.strictEqual(forwarded.envelope.meetingIdentity?.calendarEventIdDigest, undefined);
        const directSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([direct.envelope], direct.discoveryPointers);
        const noEmailSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([noEmail.envelope], []);
        node_assert_1.default.strictEqual(directSnapshot.semanticInputDigest, noEmailSnapshot.semanticInputDigest);
        node_assert_1.default.notStrictEqual(directSnapshot.sourceSnapshotDigest, noEmailSnapshot.sourceSnapshotDigest);
        node_assert_1.default.ok(!JSON.stringify([direct, forwarded]).includes("@"));
        node_assert_1.default.ok(!JSON.stringify([direct, forwarded]).toLowerCase().includes("emailbody"));
        node_assert_1.default.ok(!JSON.stringify([direct, forwarded]).includes("\"summary\":"));
        const changedMessage = (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...forwardedFixture.draft,
            gmailDiscoveries: [{
                    ...forwardedFixture.draft.gmailDiscoveries[0],
                    opaqueMessageId: "different-forward-message",
                }],
        });
        node_assert_1.default.strictEqual(changedMessage.envelope.sourceIdentityDigest, forwarded.envelope.sourceIdentityDigest);
        const changedRevision = (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...forwardedFixture.draft,
            revisionId: "different-drive-revision",
        });
        node_assert_1.default.notStrictEqual(changedRevision.envelope.sourceIdentityDigest, forwarded.envelope.sourceIdentityDigest);
    });
    (0, node_test_1.it)("rejects duplicate email content, participant detail, transcript, raw body values, and session bodies structurally", () => {
        const direct = readGeminiFixture("gemini-direct-discovery.json").draft;
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...direct,
            gmailDiscoveries: [{
                    ...direct.gmailDiscoveries[0],
                    senderAddress: "private@example.com",
                }],
        }), /forbidden or unknown fields: senderAddress/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...direct,
            emailBody: "duplicated summary and next steps",
        }), /forbidden or unknown fields: emailBody/);
        const { granola } = designMeetingSources();
        const draft = {
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
                ...granola.meetingIdentity,
                participants: ["private person"],
            },
            transcript: "short transcript excerpt",
        };
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)(draft), /transcript/);
        delete draft.transcript;
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)(draft), /participants/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            ...agentEnvelope("codex_session", "codex-session-1"),
            contractVersion: undefined,
            envelopeId: undefined,
            sourceObjectKeyDigest: undefined,
            sourceIdentityDigest: undefined,
            privacy: undefined,
            sessionBody: "full prompt and response",
        }), /forbidden or unknown fields/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
            binding: OURA_BINDING,
            sourceKind: "oura",
            objectType: "body_context",
            sourceObjectId: "relative-day",
            sourceRevision: "v1",
            eventTime: "2026-07-27T07:00:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("raw-body"),
            authority: {
                evidence: "body_context_only",
                quality: "coverage_only",
                lifecycle: "none",
                completion: "none",
                rank: "body_bonus_only",
            },
            hrvMs: 37,
        }), /hrvMs/);
    });
    (0, node_test_1.it)("admits an immutable Strategy row as a source-native authoritative task", () => {
        const source = envelope({
            binding: STRATEGY_BINDING,
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: "ptr-strategy-source-aware-e2e",
            sourceRevision: "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57",
            eventTime: "2026-07-29T07:15:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("canonical-strategy-row"),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        });
        node_assert_1.default.strictEqual(source.sourceKind, "strategy");
        node_assert_1.default.strictEqual(source.objectType, "authoritative_task");
        node_assert_1.default.strictEqual(source.sourceRevision, "09262e4637bd6d0e59a2fd3dba5fc7d5fc501c57");
        node_assert_1.default.strictEqual(source.authority.rank, "accepted_work");
        node_assert_1.default.strictEqual(source.privacy.sourceBodiesStored, false);
        node_assert_1.default.strictEqual(source.privacy.localPathsStored, false);
        node_assert_1.default.throws(() => envelope({
            binding: STRATEGY_BINDING,
            sourceKind: "strategy",
            objectType: "authoritative_task",
            sourceObjectId: "ptr-strategy-source-aware-e2e",
            sourceRevision: "mutable-main",
            eventTime: "2026-07-29T07:15:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("canonical-strategy-row"),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        }), /immutable 40-hex Git sourceRevision/);
    });
    (0, node_test_1.it)("fails closed on provider authority escalation, path-shaped local IDs, forged envelopes, and mixed owner scopes", () => {
        for (const sourceObjectId of [
            "Users/synthetic-user/.codex/sessions/private.jsonl",
            "C:/Users/synthetic-user/private-session.jsonl",
        ]) {
            node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
                ownerScopeDigest: OWNER_SCOPE_DIGEST,
                binding: localAgentBinding("codex_session"),
                sourceKind: "codex_session",
                objectType: "agent_session",
                sourceObjectId,
                sourceRevision: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-session-revision"),
                eventTime: "2026-07-27T20:00:00.000Z",
                contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-session-content"),
                authority: {
                    evidence: "context_only",
                    quality: "bounded_context",
                    lifecycle: "none",
                    completion: "none",
                    rank: "context_only",
                },
            }), /sourceObjectId must be a lowercase SHA-256 digest/);
        }
        node_assert_1.default.throws(() => envelope({
            binding: OURA_BINDING,
            sourceKind: "oura",
            objectType: "authoritative_task",
            sourceObjectId: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-body-object"),
            sourceRevision: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-body-revision"),
            eventTime: "2026-07-27T07:00:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-body-content"),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        }), /oura cannot emit authoritative_task/);
        node_assert_1.default.throws(() => envelope({
            binding: STRATEGY_BINDING,
            sourceKind: "strategy",
            objectType: "strategy_context",
            sourceObjectId: "synthetic-strategy-context",
            sourceRevision: "synthetic-strategy-revision",
            eventTime: "2026-07-27T20:00:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-strategy-content"),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        }), /strategy context can only provide bounded context or candidates/);
        node_assert_1.default.throws(() => envelope({
            binding: GEMINI_BINDING,
            sourceKind: "linear",
            objectType: "authoritative_task",
            sourceObjectId: "synthetic-linear-task",
            sourceRevision: "synthetic-linear-revision",
            eventTime: "2026-07-27T20:00:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-linear-content"),
            authority: {
                evidence: "authoritative_task",
                quality: "source_native",
                lifecycle: "source_status",
                completion: "source_status",
                rank: "accepted_work",
            },
        }), /source binding is not authorized/);
        const { design } = designMeetingSources();
        const mutableEnvelope = structuredClone(design.envelope);
        const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([mutableEnvelope], []);
        const storedContentDigest = snapshot.envelopes[0].contentDigest;
        mutableEnvelope.contentDigest = (0, source_contracts_js_1.taskMapContractDigest)("mutated-after-snapshot");
        node_assert_1.default.strictEqual(snapshot.envelopes[0].contentDigest, storedContentDigest);
        node_assert_1.default.ok(Object.isFrozen(snapshot));
        node_assert_1.default.ok(Object.isFrozen(snapshot.envelopes[0]));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([
            {
                ...structuredClone(design.envelope),
                transcript: "forged body",
            },
        ], []), /forbidden or unknown fields: transcript/);
        const otherScope = envelope({
            ownerScopeDigest: (0, source_contracts_js_1.taskMapContractDigest)("other-owner-scope"),
            binding: GRANOLA_BINDING,
            sourceKind: "granola",
            objectType: "meeting_note",
            sourceObjectId: "synthetic-other-scope-meeting",
            sourceRevision: "synthetic-other-scope-revision",
            eventTime: design.envelope.eventTime,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-other-scope-content"),
            authority: {
                evidence: "provider_generated_summary",
                quality: "provider_summary",
                lifecycle: "none",
                completion: "none",
                rank: "candidate_only",
            },
            meetingIdentity: design.envelope.meetingIdentity,
        });
        node_assert_1.default.strictEqual((0, source_contracts_js_1.canonicalizeTaskMapMeetings)([design.envelope, otherScope]).length, 2);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([design.envelope, otherScope], []), /cannot cross owner dedupe scopes/);
    });
    (0, node_test_1.it)("deduplicates Gemini and Granola behind one Calendar-owned canonical meeting", () => {
        const { design, granola, calendar } = designMeetingSources();
        node_assert_1.default.strictEqual(granola.meetingIdentity.endAt, undefined);
        node_assert_1.default.strictEqual(calendar.meetingIdentity.endAt, "2026-07-28T02:15:00.000Z");
        node_assert_1.default.strictEqual(design.envelope.meetingIdentity.endAt, "2026-07-28T02:30:00.000Z");
        const meetings = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([
            design.envelope,
            granola,
            calendar,
        ]);
        node_assert_1.default.strictEqual(meetings.length, 1);
        node_assert_1.default.strictEqual(meetings[0].identityMethod, "calendar_event");
        node_assert_1.default.strictEqual(meetings[0].reviewState, "resolved");
        node_assert_1.default.deepStrictEqual([...meetings[0].evidenceVariantEnvelopeIds].sort(), [design.envelope.envelopeId, granola.envelopeId].sort());
        node_assert_1.default.deepStrictEqual(meetings[0].calendarEnvelopeIds, [calendar.envelopeId]);
        node_assert_1.default.ok(!meetings[0].evidenceVariantEnvelopeIds.some((id) => id.includes("gmail")));
        const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([design.envelope, granola, calendar], design.discoveryPointers);
        node_assert_1.default.strictEqual(snapshot.canonicalMeetings.length, 1);
        node_assert_1.default.strictEqual(snapshot.canonicalMeetings[0].evidenceVariantEnvelopeIds.length, 2);
        const baselineCanonicalId = meetings[0].canonicalMeetingId;
        for (const permutation of [
            [calendar, granola, design.envelope],
            [granola, design.envelope, calendar],
            [design.envelope, calendar, granola],
        ]) {
            node_assert_1.default.strictEqual((0, source_contracts_js_1.canonicalizeTaskMapMeetings)(permutation)[0].canonicalMeetingId, baselineCanonicalId);
        }
        const renamedSameCalendar = envelope({
            binding: design.envelope.binding,
            sourceKind: "gemini_meet",
            objectType: "meeting_note",
            sourceObjectId: "synthetic-design-note-renamed",
            sourceRevision: "synthetic-design-note-renamed-revision",
            eventTime: design.envelope.eventTime,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-renamed-design-content"),
            authority: design.envelope.authority,
            meetingIdentity: {
                ...design.envelope.meetingIdentity,
                startAt: "2026-07-27T18:30:00-07:00",
                endAt: "2026-07-27T19:45:00-07:00",
                normalizedTitleDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-renamed-design-title"),
            },
        });
        const drifted = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([renamedSameCalendar, calendar]);
        node_assert_1.default.strictEqual(drifted.length, 1);
        node_assert_1.default.strictEqual(drifted[0].canonicalMeetingId, baselineCanonicalId);
        node_assert_1.default.strictEqual(drifted[0].identityMethod, "calendar_event");
        node_assert_1.default.ok(drifted[0].conflictCodes.includes("fallback_metadata_disagreement"));
    });
    (0, node_test_1.it)("keeps a unique Calendar identity when the lexically first Granola variant has no Calendar ID", () => {
        const { granola, calendar } = designMeetingSources();
        node_assert_1.default.strictEqual(granola.meetingIdentity.calendarEventIdDigest, undefined);
        const granolaFirst = {
            ...granola,
            envelopeId: "tmsrc_0000000000000000",
        };
        const calendarLast = {
            ...calendar,
            envelopeId: "tmsrc_ffffffffffffffff",
        };
        node_assert_1.default.ok(granolaFirst.envelopeId < calendarLast.envelopeId);
        const forward = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([granolaFirst, calendarLast]);
        const reverse = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([calendarLast, granolaFirst]);
        node_assert_1.default.deepStrictEqual(forward, reverse);
        node_assert_1.default.strictEqual(forward.length, 1);
        node_assert_1.default.strictEqual(forward[0].identityMethod, "calendar_event");
        node_assert_1.default.strictEqual(forward[0].reviewState, "resolved");
        node_assert_1.default.deepStrictEqual(forward[0].calendarEnvelopeIds, [calendarLast.envelopeId]);
        node_assert_1.default.deepStrictEqual(forward[0].evidenceVariantEnvelopeIds, [granolaFirst.envelopeId]);
        const fallbackGemini = envelope({
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            objectType: "meeting_note",
            sourceObjectId: "synthetic-fallback-gemini-note",
            sourceRevision: "synthetic-fallback-gemini-revision",
            eventTime: granola.eventTime,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-fallback-gemini-content"),
            authority: {
                evidence: "provider_generated_summary",
                quality: "structured_generated",
                lifecycle: "none",
                completion: "none",
                rank: "candidate_only",
            },
            meetingIdentity: {
                ...granola.meetingIdentity,
                startAt: "2026-07-27T18:30:00-07:00",
                endAt: "2026-07-27T19:30:00-07:00",
            },
        });
        const fallbackOnly = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([fallbackGemini, granola]);
        node_assert_1.default.strictEqual(fallbackOnly.length, 1);
        node_assert_1.default.strictEqual(fallbackOnly[0].identityMethod, "bounded_fingerprint");
    });
    (0, node_test_1.it)("uses a privacy-hashed exact fallback, fails ambiguous Calendar identities to review, and preserves a prior alias", () => {
        const { design, hint } = designMeetingSources();
        const fallbackHint = {
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
        const prior = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([fallback]);
        node_assert_1.default.strictEqual(prior[0].identityMethod, "bounded_fingerprint");
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
        const upgraded = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([strong], prior);
        node_assert_1.default.strictEqual(upgraded[0].canonicalMeetingId, prior[0].canonicalMeetingId);
        node_assert_1.default.strictEqual(upgraded[0].identityMethod, "calendar_event");
        const priorSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([fallback], []);
        const upgradedSnapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([strong], [], priorSnapshot.canonicalMeetings);
        node_assert_1.default.strictEqual(upgradedSnapshot.canonicalMeetings[0].canonicalMeetingId, priorSnapshot.canonicalMeetings[0].canonicalMeetingId);
        const { brain } = harnessFixture();
        node_assert_1.default.doesNotThrow(() => (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: upgradedSnapshot,
            semanticBrainArtifact: semanticBrainForSnapshot(brain, upgradedSnapshot.semanticInputDigest),
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        }));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([strong], [{
                ...structuredClone(prior[0]),
                canonicalMeetingId: "tmmeeting_attackerchosen",
            }]), /canonical meeting ID is not derived/);
        const secondCalendar = envelope({
            binding: CALENDAR_BINDING,
            sourceKind: "google_calendar",
            objectType: "calendar_event",
            sourceObjectId: "conflicting-calendar-event",
            sourceRevision: "etag-conflict",
            eventTime: hint.startAt,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("conflicting-calendar"),
            authority: {
                evidence: "context_only",
                quality: "source_native",
                lifecycle: "none",
                completion: "none",
                rank: "context_only",
            },
            meetingIdentity: {
                ...hint,
                calendarEventIdDigest: (0, source_contracts_js_1.taskMapContractDigest)("other-calendar-id"),
            },
        });
        const firstCalendar = designMeetingSources().calendar;
        const ambiguous = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([firstCalendar, secondCalendar]);
        node_assert_1.default.strictEqual(ambiguous.length, 2);
        node_assert_1.default.ok(ambiguous.every((meeting) => meeting.reviewState === "needs_review"));
        node_assert_1.default.ok(ambiguous.every((meeting) => (meeting.conflictCodes.includes("conflicting_calendar_identity"))));
        node_assert_1.default.ok(!JSON.stringify(ambiguous).includes("private person"));
    });
    (0, node_test_1.it)("keeps checkpoints per connection and advances watermarks only after a complete success", () => {
        const { design } = designMeetingSources();
        const first = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context", "deep_link"],
            state: "success",
            attemptedAt: "2026-07-28T02:00:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("watermark-1"),
                observedThrough: "2026-07-28T02:00:00.000Z",
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        });
        const failed = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(first, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["deep_link", "read_context"],
            state: "failed",
            attemptedAt: "2026-07-28T03:00:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("must-not-advance"),
                observedThrough: "2026-07-28T03:00:00.000Z",
            },
            errorCode: "provider_unavailable",
            errorDetailDigest: (0, source_contracts_js_1.taskMapContractDigest)("bounded-error"),
        });
        node_assert_1.default.deepStrictEqual(failed.watermark, first.watermark);
        node_assert_1.default.strictEqual(failed.lastSuccessfulPollAt, first.lastSuccessfulPollAt);
        node_assert_1.default.deepStrictEqual(failed.acceptedSourceIdentityDigests, first.acceptedSourceIdentityDigests);
        const noOp = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(failed, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context", "deep_link"],
            state: "success",
            attemptedAt: "2026-07-28T04:00:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("watermark-2"),
                observedThrough: "2026-07-28T04:00:00.000Z",
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        });
        node_assert_1.default.notDeepStrictEqual(noOp.watermark, first.watermark);
        node_assert_1.default.deepStrictEqual(noOp.acceptedSourceIdentityDigests, first.acceptedSourceIdentityDigests);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(noOp, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context", "deep_link"],
            state: "success",
            attemptedAt: "2026-07-28T04:15:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: first.watermark.valueDigest,
                observedThrough: "2026-07-28T04:15:00.000Z",
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        }), /watermark value cannot roll back/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(noOp, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context"],
            state: "success",
            attemptedAt: "2026-07-28T04:30:00.000Z",
            proposedWatermark: {
                kind: "revision",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("changed-watermark-kind"),
                observedThrough: "2026-07-28T04:30:00.000Z",
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        }), /watermark kind cannot change/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(noOp, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context"],
            state: "success",
            attemptedAt: "2026-07-28T04:30:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("dropped-watermark-time"),
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        }), /observedThrough cannot be dropped/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(noOp, {
            binding: { ...GEMINI_BINDING, grantVersion: "changed-grant" },
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context"],
            state: "failed",
            attemptedAt: "2026-07-28T05:00:00.000Z",
            errorCode: "grant_changed",
            errorDetailDigest: (0, source_contracts_js_1.taskMapContractDigest)("grant-changed"),
        }), /cannot cross a connection, tenant, principal, grant, or source/);
    });
    (0, node_test_1.it)("rejects required lineage deletion and optional prototype pollution through exported assertions", () => {
        const { design } = designMeetingSources();
        const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context", "deep_link"],
            state: "success",
            attemptedAt: "2026-07-28T02:00:00.000Z",
            proposedWatermark: {
                kind: "composite",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("required-field-watermark"),
                observedThrough: "2026-07-28T02:00:00.000Z",
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        });
        for (const key of [
            "connectionId",
            "grantVersion",
            "tenantOrWorkspaceDigest",
            "accountOrPrincipalDigest",
        ]) {
            const forged = structuredClone(checkpoint);
            delete forged.binding[key];
            forged.checkpointId = `tmcheckpoint_${(0, source_contracts_js_1.taskMapContractDigest)(forged).slice(0, 16)}`;
            node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(forged), /required|binding|checkpoint/i);
        }
        for (const key of [
            "adapterVersion",
            "state",
            "capabilities",
            "watermarkHistoryDigests",
            "acceptedSourceIdentityDigests",
        ]) {
            const forged = structuredClone(checkpoint);
            delete forged[key];
            forged.checkpointId = `tmcheckpoint_${(0, source_contracts_js_1.taskMapContractDigest)(forged).slice(0, 16)}`;
            node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(forged), /required|checkpoint/i);
        }
        const nullWatermark = structuredClone(checkpoint);
        nullWatermark.watermark = null;
        nullWatermark.checkpointId = recomputeConnectorCheckpointId(nullWatermark);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(nullWatermark), /watermark|object|required/i);
        const failedCheckpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(checkpoint, {
            binding: checkpoint.binding,
            sourceKind: checkpoint.sourceKind,
            adapterVersion: checkpoint.adapterVersion,
            capabilities: checkpoint.capabilities,
            state: "failed",
            attemptedAt: "2026-07-28T03:00:00.000Z",
            errorCode: "provider_unavailable",
            errorDetailDigest: (0, source_contracts_js_1.taskMapContractDigest)("required-field-failed-detail"),
        });
        const nullError = structuredClone(failedCheckpoint);
        nullError.error = null;
        nullError.checkpointId = recomputeConnectorCheckpointId(nullError);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(nullError), /error|object|required/i);
        const accessorError = structuredClone(failedCheckpoint);
        const stableError = accessorError.error;
        let errorAccessorReads = 0;
        delete accessorError.error;
        Object.defineProperty(accessorError, "error", {
            enumerable: true,
            configurable: true,
            get: () => {
                errorAccessorReads += 1;
                return stableError;
            },
        });
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(accessorError), /error.*enumerable data property|data property/i);
        node_assert_1.default.strictEqual(errorAccessorReads, 0);
        const inheritedError = structuredClone(failedCheckpoint);
        const inheritedStableError = inheritedError.error;
        let inheritedErrorReads = 0;
        delete inheritedError.error;
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
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(inheritedError), /plain object/i);
        node_assert_1.default.strictEqual(inheritedErrorReads, 0);
        const accessorWatermark = structuredClone(checkpoint);
        const stableWatermark = accessorWatermark.watermark;
        let watermarkAccessorReads = 0;
        delete accessorWatermark.watermark;
        Object.defineProperty(accessorWatermark, "watermark", {
            enumerable: true,
            configurable: true,
            get: () => {
                watermarkAccessorReads += 1;
                return stableWatermark;
            },
        });
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(accessorWatermark), /watermark.*enumerable data property|data property/i);
        node_assert_1.default.strictEqual(watermarkAccessorReads, 0);
        const hiddenAdapterVersion = structuredClone(checkpoint);
        const adapterVersion = hiddenAdapterVersion.adapterVersion;
        delete hiddenAdapterVersion.adapterVersion;
        Object.defineProperty(hiddenAdapterVersion, "adapterVersion", {
            enumerable: false,
            configurable: true,
            writable: true,
            value: adapterVersion,
        });
        hiddenAdapterVersion.checkpointId = recomputeConnectorCheckpointId(hiddenAdapterVersion);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(hiddenAdapterVersion), /required|adapterVersion/i);
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
        ]) {
            const forged = structuredClone(inheritedCase.original);
            delete forged[inheritedCase.key];
            const priorDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, inheritedCase.key);
            let getterReads = 0;
            try {
                Object.defineProperty(Object.prototype, inheritedCase.key, {
                    configurable: true,
                    get: () => {
                        getterReads += 1;
                        return inheritedCase.inheritedValue;
                    },
                });
                node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapConnectorCheckpoint)(forged), new RegExp(`connector checkpoint\\.${inheritedCase.key} must not be inherited`, "i"));
            }
            finally {
                if (priorDescriptor === undefined) {
                    Reflect.deleteProperty(Object.prototype, inheritedCase.key);
                }
                else {
                    Object.defineProperty(Object.prototype, inheritedCase.key, priorDescriptor);
                }
            }
            node_assert_1.default.strictEqual(getterReads, 0, `${inheritedCase.key} getter must not be executed`);
        }
        const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([design.envelope], []);
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
        ]) {
            const forged = structuredClone(snapshot);
            delete forged[key];
            node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(forged), /required|snapshot/i);
        }
        const hiddenBindingSnapshot = structuredClone(snapshot);
        const hiddenBinding = hiddenBindingSnapshot.envelopes[0].binding;
        const grantVersion = hiddenBinding.grantVersion;
        delete hiddenBinding.grantVersion;
        Object.defineProperty(hiddenBinding, "grantVersion", {
            enumerable: false,
            configurable: true,
            writable: true,
            value: grantVersion,
        });
        hiddenBindingSnapshot.sourceSnapshotDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            ownerScopeDigest: hiddenBindingSnapshot.ownerScopeDigest,
            envelopes: hiddenBindingSnapshot.envelopes,
            discoveryPointers: hiddenBindingSnapshot.discoveryPointers,
            canonicalMeetings: hiddenBindingSnapshot.canonicalMeetings,
        });
        hiddenBindingSnapshot.snapshotId =
            `tmsnapshot_${(0, source_contracts_js_1.taskMapContractDigest)(hiddenBindingSnapshot.sourceSnapshotDigest).slice(0, 16)}`;
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(hiddenBindingSnapshot), /required|grantVersion|binding/i);
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
        ]) {
            const forged = structuredClone(snapshot);
            delete forged.envelopes[0][key];
            node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapSourceSnapshot)(forged), /required|envelope|snapshot/i);
        }
    });
    (0, node_test_1.it)("canonicalizes parallel source order and excludes Gmail discovery, checkpoints, and optional body context from semantic invalidation", () => {
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
        const driveOnly = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)(baseEnvelopes, []);
        const gmailDiscovered = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([...baseEnvelopes].reverse(), design.discoveryPointers);
        const withBody = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([body, ...baseEnvelopes], design.discoveryPointers);
        node_assert_1.default.notStrictEqual(driveOnly.sourceSnapshotDigest, gmailDiscovered.sourceSnapshotDigest);
        node_assert_1.default.strictEqual(driveOnly.semanticInputDigest, gmailDiscovered.semanticInputDigest);
        node_assert_1.default.notStrictEqual(driveOnly.discoveryProvenanceDigest, gmailDiscovered.discoveryProvenanceDigest);
        node_assert_1.default.strictEqual(driveOnly.semanticInputDigest, withBody.semanticInputDigest);
        node_assert_1.default.notStrictEqual(driveOnly.sourceSnapshotDigest, withBody.sourceSnapshotDigest);
        node_assert_1.default.notStrictEqual(driveOnly.bodyContextDigest, withBody.bodyContextDigest);
        const changedCalendarContent = envelope({
            binding: calendar.binding,
            sourceKind: calendar.sourceKind,
            objectType: calendar.objectType,
            sourceObjectId: calendar.sourceObjectId,
            sourceRevision: calendar.sourceRevision,
            eventTime: calendar.eventTime,
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("calendar-content-changed-with-same-revision"),
            authority: calendar.authority,
            meetingIdentity: calendar.meetingIdentity,
        });
        node_assert_1.default.strictEqual(changedCalendarContent.sourceIdentityDigest, calendar.sourceIdentityDigest);
        const withChangedCalendarContent = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([
            design.envelope,
            granola,
            changedCalendarContent,
            codex,
            claude,
            cursor,
        ], []);
        node_assert_1.default.notStrictEqual(driveOnly.semanticInputDigest, withChangedCalendarContent.semanticInputDigest);
        const newCalendarEvidence = envelope({
            binding: CALENDAR_BINDING,
            sourceKind: "google_calendar",
            objectType: "calendar_event",
            sourceObjectId: "new-calendar-context",
            sourceRevision: "new-calendar-etag",
            eventTime: "2026-07-29T17:00:00.000Z",
            contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("new-calendar-context"),
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
                normalizedTitleDigest: (0, source_contracts_js_1.taskMapContractDigest)("new-calendar-title"),
                participantSetDigest: (0, source_contracts_js_1.taskMapContractDigest)("new-calendar-participants"),
            },
        });
        const changed = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([...baseEnvelopes, newCalendarEvidence], []);
        node_assert_1.default.notStrictEqual(changed.semanticInputDigest, driveOnly.semanticInputDigest);
        const { brain } = harnessFixture();
        const oldBrainArtifact = semanticBrainForSnapshot(brain, driveOnly.semanticInputDigest);
        const oldProposal = (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: driveOnly,
            semanticBrainArtifact: oldBrainArtifact,
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        });
        node_assert_1.default.doesNotThrow(() => (0, source_contracts_js_1.assertTaskMapSemanticProposalCurrent)(withBody, oldProposal));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.assertTaskMapSemanticProposalCurrent)(changed, oldProposal), /semantic brain is stale/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: changed,
            semanticBrainArtifact: oldBrainArtifact,
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        }), /artifact is stale/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: changed,
            semanticBrainArtifact: {
                ...structuredClone(oldBrainArtifact),
                sourceSemanticInputDigest: changed.semanticInputDigest,
            },
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        }), /attestation is invalid/);
    });
    (0, node_test_1.it)("keeps semantic proposal references closed and deterministic gates separate", () => {
        const { design } = designMeetingSources();
        const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([design.envelope], []);
        const { brain } = harnessFixture();
        const brainArtifact = semanticBrainForSnapshot(brain, snapshot.semanticInputDigest);
        const proposal = (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: snapshot,
            semanticBrainArtifact: brainArtifact,
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        });
        node_assert_1.default.deepStrictEqual(proposal.rootProposalIds, brainArtifact.brain.roots.map((root) => root.proposalId).sort());
        node_assert_1.default.ok(!JSON.stringify(proposal).includes("openState"));
        node_assert_1.default.ok(!JSON.stringify(proposal).includes("priority"));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: snapshot,
            semanticBrainArtifact: brainArtifact,
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
            openState: "open",
        }), /openState/);
        const first = (0, source_contracts_js_1.buildTaskMapGateDecision)({
            subjectId: "candidate-a",
            gate: "authority",
            outcome: "candidate_only",
            reasonCodes: ["meeting_context_only", "no_task_home"],
        });
        const reordered = (0, source_contracts_js_1.buildTaskMapGateDecision)({
            subjectId: "candidate-a",
            gate: "authority",
            outcome: "candidate_only",
            reasonCodes: ["no_task_home", "meeting_context_only"],
        });
        node_assert_1.default.deepStrictEqual(first, reordered);
        node_assert_1.default.ok(!JSON.stringify(first).includes("summary"));
    });
    (0, node_test_1.it)("produces stable projection diffs and classifies Strategy-vs-Task-Map differences without a Strategy runtime dependency", () => {
        const { input, brain } = harnessFixture();
        const fixedNow = "2026-07-28T02:30:00.000Z";
        const previous = (0, harness_js_1.buildTaskMapProjection)(input, brain, { arm: "E2", now: fixedNow });
        const current = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
            arm: "E3",
            now: fixedNow,
            previousProjection: previous,
        });
        const same = (0, source_contracts_js_1.diffTaskMapProjections)(previous, current);
        const repeated = (0, source_contracts_js_1.diffTaskMapProjections)(previous, structuredClone(current));
        const permutedCurrent = {
            ...structuredClone(current),
            sources: [...current.sources].reverse(),
            roots: [...current.roots].reverse(),
            tasks: [...current.tasks].reverse(),
            edges: [...current.edges].reverse(),
            rejections: [...current.rejections].reverse(),
        };
        const permuted = (0, source_contracts_js_1.diffTaskMapProjections)(previous, permutedCurrent);
        node_assert_1.default.deepStrictEqual(same, repeated);
        node_assert_1.default.deepStrictEqual(same, permuted);
        node_assert_1.default.strictEqual(same.changed.length, 0);
        node_assert_1.default.strictEqual(same.added.length, 0);
        node_assert_1.default.strictEqual(same.removed.length, 0);
        const acceptedDeltaDigest = (0, source_contracts_js_1.taskMapContractDigest)("accepted-delta");
        const sharedStrategy = targetRecord("work-taskmap-contract", "shared_accepted_work", "accepted_open");
        const sharedTaskMap = {
            ...sharedStrategy,
            recordDigest: (0, source_contracts_js_1.taskMapContractDigest)("taskmap-operational-rendering"),
        };
        const strategy = (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "strategy",
            acceptedDeltaDigest,
            records: [
                sharedStrategy,
                targetRecord("decision-connector-first", "strategy_durable_context", "resolved"),
            ],
        });
        const taskMap = (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "task_map",
            acceptedDeltaDigest,
            records: [
                sharedTaskMap,
                targetRecord("candidate-design-system", "taskmap_candidate_review", "candidate"),
                targetRecord("root-taskmap", "taskmap_operational_detail", "accepted_open"),
            ],
        });
        const parity = (0, source_contracts_js_1.compareTaskMapProjectionTargets)(strategy, taskMap);
        node_assert_1.default.deepStrictEqual(parity.failures, []);
        node_assert_1.default.deepStrictEqual(parity.intentionalDifferences.map((finding) => finding.code).sort(), [
            "strategy_durable_context_only",
            "taskmap_candidate_review_only",
            "taskmap_operational_detail_only",
        ]);
        const brokenTaskMap = (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "task_map",
            acceptedDeltaDigest,
            records: taskMap.records.filter((record) => record.canonicalRecordId !== sharedTaskMap.canonicalRecordId),
        });
        node_assert_1.default.ok((0, source_contracts_js_1.compareTaskMapProjectionTargets)(strategy, brokenTaskMap).failures.some((finding) => finding.code === "shared_work_missing_task_map"));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "strategy",
            acceptedDeltaDigest,
            records: [
                targetRecord("candidate-design-system", "taskmap_candidate_review", "candidate"),
            ],
        }), /incompatible with the strategy projection/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "task_map",
            acceptedDeltaDigest,
            records: [
                targetRecord("decision-connector-first", "strategy_durable_context", "resolved"),
            ],
        }), /incompatible with the task_map projection/);
        const downgradedTaskMap = {
            ...taskMap,
            records: taskMap.records.map((record) => (record.canonicalRecordId === sharedTaskMap.canonicalRecordId
                ? {
                    ...record,
                    role: "taskmap_candidate_review",
                    lifecycle: "candidate",
                }
                : record)),
        };
        node_assert_1.default.ok((0, source_contracts_js_1.compareTaskMapProjectionTargets)(strategy, downgradedTaskMap).failures.some((finding) => finding.code === "role_mismatch"));
    });
    (0, node_test_1.it)("replays identical snapshot, brain artifact, previous projection, policies, and fixed now byte-for-byte", () => {
        const { design, granola, calendar } = designMeetingSources();
        const snapshot = (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([
            design.envelope,
            granola,
            calendar,
            agentEnvelope("codex_session", "codex-session-1"),
            bodyEnvelope(),
        ], design.discoveryPointers);
        const { input, brain } = harnessFixture();
        const fixedNow = "2026-07-28T02:30:00.000Z";
        const previous = (0, harness_js_1.buildTaskMapProjection)(input, brain, { arm: "E2", now: fixedNow });
        const firstProjection = (0, harness_js_1.buildTaskMapProjection)(input, brain, {
            arm: "E3",
            now: fixedNow,
            previousProjection: previous,
        });
        const replayProjection = (0, harness_js_1.buildTaskMapProjection)(structuredClone(input), structuredClone(brain), {
            arm: "E3",
            now: fixedNow,
            previousProjection: structuredClone(previous),
        });
        node_assert_1.default.deepStrictEqual(replayProjection, firstProjection);
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)(replayProjection), (0, source_contracts_js_1.taskMapContractCanonicalJson)(firstProjection));
        node_assert_1.default.strictEqual(replayProjection.runId, firstProjection.runId);
        const semanticBrainArtifact = semanticBrainForSnapshot(brain, snapshot.semanticInputDigest);
        const semanticProposal = (0, source_contracts_js_1.buildTaskMapSemanticProposalReference)({
            sourceSnapshot: snapshot,
            semanticBrainArtifact,
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
        });
        const decisions = [
            (0, source_contracts_js_1.buildTaskMapGateDecision)({
                subjectId: "task-source-contract",
                gate: "authority",
                outcome: "accepted",
                reasonCodes: ["source_task_open"],
            }),
            (0, source_contracts_js_1.buildTaskMapGateDecision)({
                subjectId: "root-taskmap-productization",
                gate: "lifecycle",
                outcome: "candidate_only",
                reasonCodes: ["owner_missing"],
            }),
        ];
        const checkpoint = (0, source_contracts_js_1.advanceTaskMapConnectorCheckpoint)(null, {
            binding: GEMINI_BINDING,
            sourceKind: "gemini_meet",
            adapterVersion: "gemini-drive-adapter.1",
            capabilities: ["read_context", "deep_link"],
            state: "success",
            attemptedAt: fixedNow,
            proposedWatermark: {
                kind: "revision",
                valueDigest: (0, source_contracts_js_1.taskMapContractDigest)("drive-revision-watermark"),
                observedThrough: fixedNow,
            },
            acceptedSourceIdentityDigests: [design.envelope.sourceIdentityDigest],
        });
        const projectionDiff = (0, source_contracts_js_1.diffTaskMapProjections)(previous, firstProjection);
        const acceptedDeltaDigest = (0, source_contracts_js_1.taskMapContractDigest)({
            sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
            semanticBrainDigest: semanticProposal.semanticBrainDigest,
            gateDecisionIds: decisions.map((decision) => decision.decisionId).sort(),
            currentProjectionDigest: projectionDiff.currentProjectionDigest,
        });
        const shared = targetRecord("work-taskmap-contract", "shared_accepted_work", "accepted_open");
        const parity = (0, source_contracts_js_1.compareTaskMapProjectionTargets)((0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "strategy",
            acceptedDeltaDigest,
            records: [shared],
        }), (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "task_map",
            acceptedDeltaDigest,
            records: [shared],
        }));
        const firstManifest = (0, source_contracts_js_1.buildTaskMapReplayManifest)({
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
        const replayManifest = (0, source_contracts_js_1.buildTaskMapReplayManifest)({
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
        node_assert_1.default.deepStrictEqual(replayManifest, firstManifest);
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)(replayManifest), (0, source_contracts_js_1.taskMapContractCanonicalJson)(firstManifest));
        node_assert_1.default.strictEqual(replayManifest.manifestId, firstManifest.manifestId);
        node_assert_1.default.ok(!JSON.stringify(firstManifest).includes(SEMANTIC_ATTESTATION_KEY));
        node_assert_1.default.deepStrictEqual(replayManifest.gateDecisions.map((decision) => decision.decisionId), firstManifest.gateDecisions.map((decision) => decision.decisionId));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapReplayManifest)({
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
                (0, source_contracts_js_1.buildTaskMapGateDecision)({
                    subjectId: "task-source-contract",
                    gate: "authority",
                    outcome: "rejected",
                    reasonCodes: ["synthetic-conflict"],
                }),
            ],
            projectionParity: parity,
        }), /conflicting decisions/);
        const failingParity = (0, source_contracts_js_1.compareTaskMapProjectionTargets)((0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "strategy",
            acceptedDeltaDigest,
            records: [targetRecord("work-taskmap-contract", "shared_accepted_work", "accepted_open")],
        }), (0, source_contracts_js_1.buildTaskMapProjectionTarget)({
            target: "task_map",
            acceptedDeltaDigest,
            records: [targetRecord("work-taskmap-contract", "shared_accepted_work", "resolved")],
        }));
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapReplayManifest)({
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
        }), /projection parity must pass/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapReplayManifest)({
            fixedNow,
            sourceSnapshot: snapshot,
            semanticBrainArtifact: (0, source_contracts_js_1.attestTaskMapSemanticBrain)(snapshot.semanticInputDigest, {
                ...semanticBrainArtifact.brain,
                model: "synthetic-other-model",
            }, SEMANTIC_ATTESTATION_KEY),
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
            previousProjection: previous,
            currentProjection: firstProjection,
            policyBindings: replayPolicies(),
            connectorCheckpoints: [checkpoint],
            gateDecisions: decisions,
            projectionParity: parity,
        }), /current projection is not bound/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapReplayManifest)({
            fixedNow,
            sourceSnapshot: snapshot,
            semanticBrainArtifact: (0, source_contracts_js_1.attestTaskMapSemanticBrain)(snapshot.semanticInputDigest, {
                ...structuredClone(semanticBrainArtifact.brain),
                roots: semanticBrainArtifact.brain.roots.map((root, index) => (index === 0 ? { ...root, title: "Changed semantic root" } : root)),
            }, SEMANTIC_ATTESTATION_KEY),
            semanticBrainAttestationKey: SEMANTIC_ATTESTATION_KEY,
            previousProjection: previous,
            currentProjection: firstProjection,
            policyBindings: replayPolicies(),
            connectorCheckpoints: [checkpoint],
            gateDecisions: decisions,
            projectionParity: parity,
        }), /current projection is not bound/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.buildTaskMapReplayManifest)({
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
        }), /current projection is not bound/);
        node_assert_1.default.throws(() => (0, source_contracts_js_1.diffTaskMapProjections)(previous, {
            ...structuredClone(firstProjection),
            tasks: firstProjection.tasks.map((task, index) => (index === 0
                ? { ...task, summary: "/Users/private/replay-leak/session.jsonl" }
                : task)),
        }), /privacy leak: local_path/);
    });
    (0, node_test_1.it)("makes valid new non-body harness evidence reject an old brain while body-only evidence stays neutral", () => {
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
        node_assert_1.default.strictEqual((0, harness_js_1.taskMapSemanticInputDigest)(withBody), (0, harness_js_1.taskMapSemanticInputDigest)(input));
        node_assert_1.default.strictEqual((0, harness_js_1.buildTaskMapProjection)(withBody, brain, { arm: "E1" }).runStatus, "accepted");
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
        node_assert_1.default.notStrictEqual((0, harness_js_1.taskMapSemanticInputDigest)(changed), (0, harness_js_1.taskMapSemanticInputDigest)(input));
        const rejected = (0, harness_js_1.buildTaskMapProjection)(changed, brain, { arm: "E1" });
        node_assert_1.default.strictEqual(rejected.runStatus, "rejected");
        node_assert_1.default.ok(rejected.rejections.some((rejection) => (rejection.proposalId === "brain"
            && rejection.reasons.includes("brain semantic input digest does not match"))));
    });
    (0, node_test_1.it)("canonical JSON orders keys by Unicode scalar value, matching the Swift reader", () => {
        // The Swift consumer (TaskMapLifecycleCanonicalJSON) sorts object keys by
        // Unicode scalar order, so 'W' (0x57) sorts before 'n' (0x6e). A locale-
        // aware sort flips case-mixed sibling keys such as currentWork/currentness
        // and makes every published generation manifest unreadable to the app.
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)({ currentness: 1, currentWork: null }), '{"currentWork":null,"currentness":1}');
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)({ b: 1, B: 2, a: 3, A: 4 }), '{"A":4,"B":2,"a":3,"b":1}');
    });
});
