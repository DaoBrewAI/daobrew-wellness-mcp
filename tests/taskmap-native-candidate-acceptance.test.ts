import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1,
  assertTaskMapNativeCandidateAcceptanceStore,
  filterTaskMapNativeCandidateShelfAgainstAcceptanceStore,
  loadTaskMapNativeCandidateAcceptanceStore,
  mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput,
  promoteTaskMapAgentSessionCandidate,
  promoteTaskMapCalendarCandidate,
  promoteTaskMapNativeCandidate,
  taskMapNativeCandidateAcceptanceHeadDigest,
  writeTaskMapNativeCandidateAcceptanceStore,
  type TaskMapNativeCandidateAcceptanceStoreV1,
} from "../src/engine/taskmap/native-candidate-acceptance.js";
import {
  buildTaskMapAgentSessionCandidateReview,
} from "../src/engine/taskmap/agent-session-candidate-adapter.js";
import {
  buildTaskMapAgentSessionProducerSnapshot,
  type TaskMapAgentSessionObservationV1,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import { buildAgentSessionExtractionFixture } from
  "./taskmap-agent-session-extraction-fixture.js";
import {
  buildTaskMapCalendarCandidateReview,
} from "../src/engine/taskmap/calendar-candidate-adapter.js";
import type {
  TaskMapCalendarProducerEventV1,
  TaskMapCalendarProducerResultV1,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import type {
  TaskMapCalendarExtractionReportV1,
} from "../src/engine/taskmap/calendar-refresh-llm-replay.js";
import {
  buildTaskMapMeetingProducerSnapshot,
  assessTaskMapMeetingProducerSnapshot,
  taskMapMeetingStatementReferenceDigest,
  type TaskMapMeetingProducerEvidenceDraftV1,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  buildTaskMapNativeCandidateReview,
  buildTaskMapNativeCandidateShelf,
  reduceTaskMapNativeCandidateReview,
  reduceTaskMapNativeCandidateReviewFromProofRows,
  resolveTaskMapNativeCandidateProof,
  taskMapNativeCandidateReviewCanonicalBytes,
} from "../src/engine/taskmap/native-candidate-review.js";
import {
  buildTaskMapNativeSemanticProjection,
  taskMapNativeSemanticInputFromMeetingProducerResult,
} from "../src/engine/taskmap/native-semantic-builder-adapter.js";
import {
  retainReceiptBackedPendingRows,
} from "../src/engine/taskmap/native-candidate-review-cli.js";
import * as semanticAdapter from "../src/engine/taskmap/native-semantic-builder-adapter.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import type {
  MentionActor,
  MentionSpeechActClass,
} from "../src/engine/taskmap/mention-extraction.js";
import type { TaskMapSourceAuthorityBindingV1 } from "../src/engine/taskmap/types.js";
import {
  testOwnerScopeDigest,
} from "./support/confirmed-owner.js";

const roots: string[] = [];
const AT = "2026-08-03T18:00:00.000Z";
const ASSESSED = "2026-08-03T18:01:00.000Z";
const CONFIRMED = "2026-08-03T18:01:30.000Z";

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function binding(): TaskMapSourceAuthorityBindingV1 {
  return {
    connectionId: "task6-meeting-owner",
    sourceKind: "gemini_meet",
    tenantOrWorkspaceDigest: digest("task6-workspace"),
    accountOrPrincipalDigest: digest("task6-principal"),
    grantVersion: "grant-1",
  };
}

function evidence(
  speechActClass: MentionSpeechActClass = "request",
  speechActActor: MentionActor = "self",
  suffix = "primary",
): TaskMapMeetingProducerEvidenceDraftV1 {
  const kind = speechActClass === "decision"
    ? "decision"
    : speechActClass === "commitment"
      ? "commitment"
      : "action_item";
  const mentionIdentityDigest = digest(`mention:${suffix}`);
  return {
    kind,
    title: `Confirm task ${suffix}`,
    summary: `Confirm the bounded task ${suffix}.`,
    occurredAt: "2026-08-03T17:55:00.000Z",
    observedAt: "2026-08-03T17:59:00.000Z",
    status: "open",
    quality: "structured_generated",
    coverage: "partial",
    confidence: 0.82,
    objectRefs: [],
    speechActClass,
    speechActActor,
    mentionIdentityDigest,
    extractionEnvelopeDigest: digest(`envelope:${suffix}`),
  };
}

function context(
  speechActClass: MentionSpeechActClass = "request",
  speechActActor: MentionActor = "self",
  owner = "task6-owner",
  suffix = "primary",
) {
  const ownerScopeDigest = testOwnerScopeDigest(owner);
  const snapshot = buildTaskMapMeetingProducerSnapshot({
    ownerScopeDigest,
    producedAt: AT,
    meetings: [{
      binding: binding(),
      documentId: `document-${owner}-${suffix}`,
      revisionId: "revision-1",
      contentDigest: digest(`content:${owner}:${suffix}`),
      modifiedAt: "2026-08-03T17:58:00.000Z",
      eventTime: "2026-08-03T17:55:00.000Z",
      observedAt: "2026-08-03T17:59:00.000Z",
      evidence: [evidence(speechActClass, speechActActor, suffix)],
    }],
  });
  const result = assessTaskMapMeetingProducerSnapshot(snapshot, ASSESSED);
  const overlay = buildTaskMapNativeCandidateReview({
    result,
    previous: null,
    expectedOwnerScopeDigest: ownerScopeDigest,
    assessedAt: ASSESSED,
  });
  const shelf = buildTaskMapNativeCandidateShelf(result, overlay, ASSESSED);
  return { ownerScopeDigest, result, overlay, shelf, row: shelf.candidates[0]! };
}

function promotionInput(
  source = context(),
  overrides: Record<string, unknown> = {},
) {
  return {
    result: source.result,
    overlay: source.overlay,
    previousStore: null,
    expectedOwnerScopeDigest: source.ownerScopeDigest,
    assessedAt: ASSESSED,
    candidateId: source.row.candidateId,
    expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
    expectedStatementReferenceDigest: source.row.statementReferenceDigest,
    expectedEvidenceProofDigests: source.row.evidenceProofDigests,
    idempotencyKeyDigest: digest("explicit-owner-confirmation-1"),
    confirmedAt: CONFIRMED,
    ...overrides,
  };
}

function agentObservation(input: {
  session: string;
  directive?: string;
  outcome?: string;
  includeRoute?: boolean;
  terminalLatest?: boolean;
}): TaskMapAgentSessionObservationV1 {
  const directive = input.directive ?? "Implement proposal adoption";
  const rows: unknown[] = [
    {
      timestamp: "2026-08-03T17:50:00.000Z",
      type: "session_meta",
      payload: { id: input.session },
    },
  ];
  if (input.includeRoute !== false) {
    rows.push({
      timestamp: "2026-08-03T17:51:00.000Z",
      type: "turn_context",
      payload: {
        cwd: "/Users/reviewer/DaobrewAI",
        workspace_roots: ["/Users/reviewer/DaobrewAI"],
      },
    });
  }
  rows.push(
    {
      timestamp: "2026-08-03T17:52:00.000Z",
      type: "response_item",
      payload: {
        id: `${input.session}-turn`,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: directive }],
      },
    },
    {
      timestamp: "2026-08-03T17:53:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: input.outcome ?? "Prepared the adoption implementation.",
        }],
      },
    },
  );
  if (input.terminalLatest === true) {
    rows.push({
      timestamp: "2026-08-03T17:54:00.000Z",
      type: "response_item",
      payload: {
        id: `${input.session}-terminal`,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "quit" }],
      },
    });
  }
  return {
    provider: "codex",
    rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  };
}

function agentContext(input: {
  owner?: string;
  observations?: TaskMapAgentSessionObservationV1[];
} = {}) {
  const ownerScopeDigest = testOwnerScopeDigest(input.owner ?? "task8-owner");
  const snapshot = buildTaskMapAgentSessionProducerSnapshot({
    ownerScopeDigest,
    producedAt: AT,
    observations: input.observations ?? [agentObservation({ session: "agent-a" })],
  });
  const admission = buildTaskMapAgentSessionSemanticAdmission(snapshot);
  const extraction = buildAgentSessionExtractionFixture(admission, ASSESSED);
  const projection = buildTaskMapAgentSessionCandidateReview({
    admission,
    extraction,
    previous: null,
    expectedOwnerScopeDigest: ownerScopeDigest,
    assessedAt: ASSESSED,
  });
  return {
    ownerScopeDigest,
    admission,
    extraction,
    row: projection.shelf.candidates[0],
    shelf: projection.shelf,
    overlay: projection.overlay,
  };
}

function agentPromotionInput(
  source = agentContext(),
  overrides: Record<string, unknown> = {},
) {
  assert.ok(source.row);
  return {
    admission: source.admission,
    extraction: source.extraction,
    overlay: source.overlay,
    previousStore: null,
    expectedOwnerScopeDigest: source.ownerScopeDigest,
    expectedAcceptanceHeadDigest:
      taskMapNativeCandidateAcceptanceHeadDigest(null),
    assessedAt: ASSESSED,
    candidateId: source.row.candidateId,
    expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
    expectedStatementReferenceDigest: source.row.statementReferenceDigest,
    expectedEvidenceProofDigests: source.row.evidenceProofDigests,
    idempotencyKeyDigest: digest("task8-owner-adoption"),
    confirmedAt: CONFIRMED,
    ...overrides,
  };
}

function calendarContext(owner = "task8-calendar-owner") {
  const ownerScopeDigest = testOwnerScopeDigest(owner);
  const event: TaskMapCalendarProducerEventV1 = {
    provider: "local_calendar",
    eventIdentityDigest: digest("calendar-event"),
    crossProviderIdentityDigest: null,
    revisionDigest: digest("calendar-revision"),
    title: "Review calendar launch",
    startAt: "2026-08-03T17:45:00.000Z",
    endAt: "2026-08-03T18:15:00.000Z",
  };
  const result: TaskMapCalendarProducerResultV1 = {
    contractVersion: "taskmap-calendar-producer-result.v1",
    resultDigest: digest("calendar-result"),
    ownerScopeDigest,
    availability: "available",
    assessedAt: ASSESSED,
    providers: [],
    events: [event],
    privacy: {
      boundedTitlesStored: true,
      attendeesStored: false,
      locationsStored: false,
      notesStored: false,
      urlsStored: false,
      rawProviderIdsStored: false,
      credentialsStored: false,
      localPathsStored: false,
    },
  };
  const mentionIdentityDigest = digest("calendar-mention");
  const reportBase = {
    contractVersion: "taskmap-calendar-extraction-report.v1" as const,
    ownerScopeDigest,
    resultDigest: result.resultDigest,
    promptTemplateDigest: digest("calendar-prompt"),
    assessedAt: ASSESSED,
    segments: [{
      segmentIndex: 0,
      inputDigest: digest("calendar-input"),
      eventIdentityDigests: [event.eventIdentityDigest],
      status: "extracted" as const,
      degradationCode: null,
      envelopeDigest: digest("calendar-envelope"),
      envelopeModel: "fixture-model",
      envelopeTransport: "claude-cli" as const,
      mentions: [{
        text: "Review calendar launch",
        title: "Review calendar launch",
        speechActClass: "request" as const,
        speechActActor: "self" as const,
        confidence: 0.92,
        mentionIdentityDigest,
        proposalDisposition: "candidate_only" as const,
        promotionEligible: true,
      }],
    }],
    pendingCount: 0,
  };
  const extraction: TaskMapCalendarExtractionReportV1 = {
    ...reportBase,
    reportDigest: taskMapContractDigest(reportBase),
  };
  const projection = buildTaskMapCalendarCandidateReview({
    result,
    extraction,
    previous: null,
    expectedOwnerScopeDigest: ownerScopeDigest,
    assessedAt: ASSESSED,
  });
  return {
    ownerScopeDigest,
    result,
    extraction,
    overlay: projection.overlay,
    shelf: projection.shelf,
    row: projection.shelf.candidates[0]!,
  };
}

function tempStorePath(): string {
  const root = mkdtempSync(path.join(process.cwd(), ".task6-acceptance-"));
  roots.push(root);
  const parent = path.join(root, "taskmap");
  mkdirSync(parent, { mode: 0o700 });
  chmodSync(parent, 0o700);
  return path.join(parent, "native-candidate-acceptance.v1.json");
}

function promoteDistinctCandidate(
  previousStore: TaskMapNativeCandidateAcceptanceStoreV1 | null,
  suffix: string,
  confirmedAt: string,
) {
  const source = context("request", "self", "task6-owner", suffix);
  return promoteTaskMapNativeCandidate(promotionInput(source, {
    previousStore,
    idempotencyKeyDigest: digest(`explicit-owner-confirmation:${suffix}`),
    confirmedAt,
  }));
}

function coordinatedRehash(
  store: TaskMapNativeCandidateAcceptanceStoreV1,
): TaskMapNativeCandidateAcceptanceStoreV1 {
  const rehashed = structuredClone(store);
  const receipt = rehashed.receipts[0]!;
  const {
    promotionId: _promotionId,
    promotionDigest: _promotionDigest,
    ...receiptCore
  } = receipt;
  receipt.promotionDigest = taskMapContractDigest({
    domain: "taskmap-native-candidate-promotion.1",
    ...receiptCore,
  });
  receipt.promotionId = `tmcandidatepromotion_${receipt.promotionDigest}`;
  rehashed.headReceiptDigest = receipt.promotionDigest;
  return rehashed;
}

function acceptanceOptions(
  store: TaskMapNativeCandidateAcceptanceStoreV1,
): Parameters<typeof buildTaskMapNativeSemanticProjection>[1] {
  return {
    candidateAcceptanceStore: store,
  };
}

function rekeyManualAuthority(
  input: ReturnType<
    typeof mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput
  >,
  suffix: string,
): ReturnType<typeof mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput> {
  const forged = structuredClone(input);
  const pointer = forged.taskMapInput.pointers.find((item) =>
    item.sourceKind === "manual"
  )!;
  const event = forged.taskMapInput.events.find((item) =>
    item.pointerId === pointer.id
  )!;
  const sourceBinding = forged.sourceBindings.find((item) =>
    item.pointerId === pointer.id
  )!;
  const evidenceBinding = forged.evidenceBindings.find((item) =>
    item.eventId === event.id
  )!;
  const pointerId = `forged-manual-${suffix}`;
  const eventId = `forged-manual-event-${suffix}`;
  const forgedDigest = digest(`forged-manual-authority:${suffix}`);
  pointer.id = pointerId;
  pointer.sourceObjectId = forgedDigest;
  pointer.sourceRefHash = forgedDigest;
  pointer.sourceVersion = forgedDigest;
  event.id = eventId;
  event.pointerId = pointerId;
  event.objectRefs = [`external:${forgedDigest}`];
  sourceBinding.pointerId = pointerId;
  sourceBinding.semanticOriginId = forgedDigest;
  sourceBinding.semanticIdentityDigest = forgedDigest;
  sourceBinding.sourceIdentityDigest = forgedDigest;
  sourceBinding.observedRevision = forgedDigest;
  sourceBinding.evidenceRevision = forgedDigest;
  sourceBinding.observedContentDigest = forgedDigest;
  sourceBinding.evidenceContentDigest = forgedDigest;
  evidenceBinding.eventId = eventId;
  evidenceBinding.rootLinkRefs = [`external:${forgedDigest}`];
  return forged;
}

describe("Task Map owner-confirmed candidate acceptance", () => {
  it("promotes calendar proof, filters rebuilt rows, and merges accepted work without resurrection", () => {
    const source = calendarContext();
    const promoted = promoteTaskMapCalendarCandidate({
      result: source.result,
      extraction: source.extraction,
      overlay: source.overlay,
      previousStore: null,
      expectedOwnerScopeDigest: source.ownerScopeDigest,
      expectedAcceptanceHeadDigest:
        taskMapNativeCandidateAcceptanceHeadDigest(null),
      assessedAt: ASSESSED,
      candidateId: source.row.candidateId,
      expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
      expectedStatementReferenceDigest: source.row.statementReferenceDigest,
      expectedEvidenceProofDigests: source.row.evidenceProofDigests,
      idempotencyKeyDigest: digest("calendar-owner-adoption"),
      confirmedAt: CONFIRMED,
    });

    assert.equal(promoted.receipt.accepted.title, "Review calendar launch");
    const rebuiltCalendarRows = buildTaskMapCalendarCandidateReview({
      result: source.result,
      extraction: source.extraction,
      previous: source.overlay,
      expectedOwnerScopeDigest: source.ownerScopeDigest,
      assessedAt: ASSESSED,
    }).shelf.candidates as unknown as Parameters<
      typeof filterTaskMapNativeCandidateShelfAgainstAcceptanceStore
    >[0];
    assert.deepEqual(
      filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
        rebuiltCalendarRows,
        promoted.store,
        source.ownerScopeDigest,
        new Set(),
      ),
      rebuiltCalendarRows,
      "a durable receipt must stay visible until a verified projection publishes its promotion",
    );
    assert.deepEqual(
      filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
        rebuiltCalendarRows,
        promoted.store,
        source.ownerScopeDigest,
        new Set([promoted.receipt.promotionId]),
      ),
      [],
    );
    const sourceRotated = retainReceiptBackedPendingRows(
      [],
      promoted.store,
      new Set(),
    );
    assert.deepEqual(sourceRotated.durableConfirmedCandidateIds, [
      promoted.receipt.candidateId,
    ]);
    assert.equal(sourceRotated.candidates.length, 1);
    assert.deepEqual(sourceRotated.candidates[0], {
      candidateId: promoted.receipt.candidateId,
      candidateRevisionDigest: promoted.receipt.candidateRevisionDigest,
      statementReferenceDigest: promoted.receipt.statementReferenceDigest,
      evidenceProofDigests: promoted.receipt.evidenceProofDigests,
      candidateFamily: "accepted_pending",
      kind: promoted.receipt.accepted.kind,
      title: promoted.receipt.accepted.title,
      summary: promoted.receipt.accepted.summary,
      speechActClass: promoted.receipt.accepted.speechActClass,
      speechActActor: promoted.receipt.accepted.speechActActor,
      confidence: promoted.receipt.accepted.confidence,
      mentionIdentityDigest: promoted.receipt.accepted.mentionIdentityDigest,
      sourceKinds: ["accepted_pending"],
      occurredAt: promoted.receipt.accepted.occurredAt,
      observedAt: promoted.receipt.accepted.observedAt,
      reviewState: "unreviewed",
      reviewedAt: null,
      reviewedOnly: false,
      promotionEligible: false,
      acceptedWork: false,
      sourceWritebackEligible: false,
      rankEligible: false,
      routeEligible: false,
      proveEligible: false,
      runEligible: false,
    });
    const changedCurrentRow = structuredClone(rebuiltCalendarRows[0]) as any;
    changedCurrentRow.candidateRevisionDigest = digest("changed-current-revision");
    changedCurrentRow.statementReferenceDigest = digest("changed-current-statement");
    changedCurrentRow.evidenceProofDigests = [digest("changed-current-proof")];
    const changedEvidence = retainReceiptBackedPendingRows(
      [changedCurrentRow],
      promoted.store,
      new Set(),
    );
    assert.deepEqual(
      changedEvidence.candidates,
      sourceRotated.candidates,
      "changed producer evidence must not impersonate the receipt-bound adopted task",
    );
    assert.deepEqual(
      retainReceiptBackedPendingRows(
        [],
        promoted.store,
        new Set([promoted.receipt.promotionId]),
      ),
      { candidates: [], durableConfirmedCandidateIds: [] },
      "a verified accepted projection takes over the receipt-backed row",
    );
    const meeting = context("request", "self", "task8-calendar-owner");
    const merged = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      taskMapNativeSemanticInputFromMeetingProducerResult(
        meeting.result,
        source.ownerScopeDigest,
      ),
      promoted.store,
    );
    assert.ok(merged.taskMapInput.pointers.some((pointer) =>
      pointer.id === `tmcandidatepromotion_${promoted.receipt.promotionDigest}`
      && pointer.sourceKind === "manual"
    ));
  });

  it("coexists as one meeting, Agent Session, and Calendar review queue and promotes all three without resurrection", () => {
    const owner = "task9-three-source-owner";
    const meeting = context("request", "self", owner, "task9-meeting");
    const agent = agentContext({
      owner,
      observations: [agentObservation({
        session: "task9-agent",
        directive: "Prepare the Task 9 agent launch",
      })],
    });
    const calendar = calendarContext(owner);
    assert.ok(agent.row);
    const queue = [meeting.row, agent.row, calendar.row];
    assert.deepEqual(
      ["meeting", agent.row.candidateFamily, calendar.row.candidateFamily]
        .sort(),
      ["agent_session", "calendar", "meeting"],
    );
    assert.deepEqual(meeting.row.sourceKinds, ["gemini_meet"]);
    assert.deepEqual(agent.row.sourceKinds, ["codex_session"]);
    assert.deepEqual(calendar.row.sourceKinds, ["calendar"]);
    assert.ok(queue.every((row) =>
      !row.acceptedWork
      && !row.rankEligible
      && !row.routeEligible
      && !row.proveEligible
      && !row.runEligible
    ));

    const promotedMeeting = promoteTaskMapNativeCandidate(
      promotionInput(meeting, {
        idempotencyKeyDigest: digest("task9-meeting-confirmation"),
      }),
    );
    const promotedAgent = promoteTaskMapAgentSessionCandidate(
      agentPromotionInput(agent, {
        previousStore: promotedMeeting.store,
        expectedAcceptanceHeadDigest:
          taskMapNativeCandidateAcceptanceHeadDigest(promotedMeeting.store),
        idempotencyKeyDigest: digest("task9-agent-confirmation"),
      }),
    );
    const promotedCalendar = promoteTaskMapCalendarCandidate({
      result: calendar.result,
      extraction: calendar.extraction,
      overlay: calendar.overlay,
      previousStore: promotedAgent.store,
      expectedOwnerScopeDigest: calendar.ownerScopeDigest,
      expectedAcceptanceHeadDigest:
        taskMapNativeCandidateAcceptanceHeadDigest(promotedAgent.store),
      assessedAt: ASSESSED,
      candidateId: calendar.row.candidateId,
      expectedCandidateRevisionDigest:
        calendar.row.candidateRevisionDigest,
      expectedStatementReferenceDigest:
        calendar.row.statementReferenceDigest,
      expectedEvidenceProofDigests: calendar.row.evidenceProofDigests,
      idempotencyKeyDigest: digest("task9-calendar-confirmation"),
      confirmedAt: CONFIRMED,
    });
    assert.equal(promotedCalendar.store.receipts.length, 3);
    for (const source of [meeting, agent, calendar] as const) {
      assert.deepEqual(
        filterTaskMapNativeCandidateShelfAgainstAcceptanceStore(
          source.shelf.candidates as unknown as Parameters<
            typeof filterTaskMapNativeCandidateShelfAgainstAcceptanceStore
          >[0],
          promotedCalendar.store,
          source.ownerScopeDigest,
        ),
        [],
      );
    }
    const merged = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      taskMapNativeSemanticInputFromMeetingProducerResult(
        meeting.result,
        meeting.ownerScopeDigest,
      ),
      promotedCalendar.store,
    );
    const projection = buildTaskMapNativeSemanticProjection(
      merged,
      acceptanceOptions(promotedCalendar.store),
    );
    const promotionPointerIds = new Set(
      promotedCalendar.store.receipts.map((receipt) =>
        `tmcandidatepromotion_${receipt.promotionDigest}`
      ),
    );
    const promotedTasks = projection.tasks.filter((task) =>
      task.taskHomePointerId !== undefined
      && promotionPointerIds.has(task.taskHomePointerId)
    );
    assert.equal(promotedTasks.length, 3);
    assert.ok(promotedTasks.every((task) =>
      task.reviewState === "accepted"
      && task.authority === "user"
      && task.citations[0]?.sourceKind === "manual"
    ));
    assert.deepEqual(
      projection.sources
        .filter((pointer) => promotionPointerIds.has(pointer.id))
        .map((pointer) => pointer.sourceKind),
      ["manual", "manual", "manual"],
    );
  });

  it("adopts a freshly resolved agent proposal through the current v1 receipt head only", () => {
    const firstSource = agentContext({
      observations: [agentObservation({
        session: "agent-first",
        directive: "Prepare the first owner task",
      })],
    });
    const first = promoteTaskMapAgentSessionCandidate(
      agentPromotionInput(firstSource, {
        idempotencyKeyDigest: digest("task8-first-adoption"),
      }),
    );
    const secondSource = agentContext({
      observations: [agentObservation({
        session: "agent-second",
        directive: "Prepare the second owner task",
      })],
    });
    const admissionBefore = taskMapContractCanonicalJson(secondSource.admission);
    const promoted = promoteTaskMapAgentSessionCandidate(
      agentPromotionInput(secondSource, {
        previousStore: first.store,
        expectedAcceptanceHeadDigest: first.store.headReceiptDigest,
        idempotencyKeyDigest: digest("task8-second-adoption"),
      }),
    );

    assert.equal(promoted.store.contractVersion, "taskmap-native-candidate-acceptance.v1");
    assert.equal(promoted.store.receipts.length, 2);
    assert.equal(
      promoted.receipt.previousReceiptDigest,
      first.store.headReceiptDigest,
    );
    assert.deepEqual(promoted.receipt.authority, {
      sourceKind: "manual",
      authority: "user",
      syncMode: "personal_fork",
      capabilities: ["read_task"],
      recordKind: "authoritative_task",
      lifecycle: "explicit_user_policy",
      sourceStatus: "open",
    });
    assert.equal(promoted.receipt.sourceWritebackAttempted, false);
    assert.equal(promoted.receipt.accepted.kind, "action_item");
    assert.equal(promoted.receipt.accepted.speechActClass, "request");
    assert.equal(promoted.receipt.accepted.speechActActor, "self");
    assert.equal(
      secondSource.row!.candidateFamily,
      "agent_session",
    );
    if (secondSource.row!.candidateFamily !== "agent_session") assert.fail();
    assert.equal(
      promoted.receipt.accepted.mentionIdentityDigest,
      secondSource.row!.mentionIdentityDigest,
    );
    assert.equal(
      taskMapContractCanonicalJson(secondSource.admission),
      admissionBefore,
      "adoption must not mutate proposal evidence",
    );
    const receiptBytes = taskMapContractCanonicalJson(promoted.receipt);
    for (const forbidden of [
      "approve",
      "export",
      "selectedAgent",
      "processId",
      "command",
      "sourceWritebackEligible",
    ]) {
      assert.equal(receiptBytes.includes(forbidden), false, forbidden);
    }
  });

  it("re-resolves agent identity, support revision, statement, and evidence at mutation time", () => {
    const observed = agentContext();
    const current = agentContext({
      observations: [
        agentObservation({ session: "agent-a" }),
        agentObservation({ session: "agent-b" }),
      ],
    });
    assert.equal(current.row!.candidateId, observed.row!.candidateId);
    assert.notEqual(
      current.row!.candidateRevisionDigest,
      observed.row!.candidateRevisionDigest,
    );

    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(current, {
          expectedCandidateRevisionDigest:
            observed.row!.candidateRevisionDigest,
          expectedStatementReferenceDigest:
            observed.row!.statementReferenceDigest,
          expectedEvidenceProofDigests:
            observed.row!.evidenceProofDigests,
        }),
      ),
      /exact current agent candidate proof does not match confirmation/,
    );
    const changedCluster = agentContext({
      observations: [agentObservation({
        session: "agent-a",
        directive: "Implement a different proposal",
      })],
    });
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(changedCluster, {
          candidateId: observed.row!.candidateId,
          expectedCandidateRevisionDigest:
            observed.row!.candidateRevisionDigest,
          expectedStatementReferenceDigest:
            observed.row!.statementReferenceDigest,
          expectedEvidenceProofDigests:
            observed.row!.evidenceProofDigests,
        }),
      ),
      /agent candidate is unavailable/,
    );
  });

  it("rejects a currently dismissed agent proposal while preserving unreviewed compatibility", () => {
    const source = agentContext();
    const context = {
      ownerScopeDigest: source.ownerScopeDigest,
      producerResultDigest: source.extraction.reportDigest,
      producerSnapshotDigest: source.admission.sourceSnapshotDigest,
      producedAt: source.admission.producedAt,
      assessedAt: ASSESSED,
      candidates: source.shelf.candidates as never,
    };
    const dismissed = reduceTaskMapNativeCandidateReviewFromProofRows({
      context,
      overlay: source.overlay,
      candidateId: source.row!.candidateId,
      expectedCandidateRevisionDigest:
        source.row!.candidateRevisionDigest,
      action: "dismiss",
      idempotencyKeyDigest: digest("task8-dismiss-agent"),
      decidedAt: ASSESSED,
    });

    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, { overlay: dismissed }),
      ),
      /dismissed|unavailable/,
    );
    assert.doesNotThrow(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, { overlay: null }),
      ),
      "A missing overlay keeps the existing unreviewed adoption path.",
    );
  });

  it("rejects wrong owner, stale admission, disappeared route, and disposed latest row", () => {
    const source = agentContext();
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, {
          expectedOwnerScopeDigest: testOwnerScopeDigest("another-owner"),
        }),
      ),
      /another owner/,
    );
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, {
          assessedAt: "2026-08-03T22:01:00.000Z",
        }),
      ),
      /stale/,
    );
    for (const unavailable of [
      agentContext({
        observations: [agentObservation({
          session: "agent-a",
          includeRoute: false,
        })],
      }),
      agentContext({
        observations: [agentObservation({
          session: "agent-a",
          terminalLatest: true,
        })],
      }),
    ]) {
      assert.equal(unavailable.admission.clusters.length, 0);
      assert.throws(
        () => promoteTaskMapAgentSessionCandidate(
          agentPromotionInput(source, {
            admission: unavailable.admission,
            extraction: unavailable.extraction,
          }),
        ),
        /agent candidate is unavailable/,
      );
    }
  });

  it("rejects duplicate adoption, receipt-head mismatch, and v1 candidate rebinding", () => {
    const source = agentContext();
    const first = promoteTaskMapAgentSessionCandidate(
      agentPromotionInput(source),
    );
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, {
          previousStore: first.store,
          expectedAcceptanceHeadDigest: first.store.headReceiptDigest,
          idempotencyKeyDigest: digest("different-task8-key"),
        }),
      ),
      /already promoted/,
    );
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(agentContext({
          observations: [agentObservation({
            session: "agent-next",
            directive: "Prepare another task",
          })],
        }), {
          previousStore: first.store,
          expectedAcceptanceHeadDigest: digest("stale-head"),
        }),
      ),
      /receipt head does not match/,
    );
    const meeting = context();
    assert.throws(
      () => promoteTaskMapAgentSessionCandidate(
        agentPromotionInput(source, {
          candidateId: meeting.row.candidateId,
          expectedCandidateRevisionDigest:
            meeting.row.candidateRevisionDigest,
          expectedStatementReferenceDigest:
            meeting.row.statementReferenceDigest,
          expectedEvidenceProofDigests:
            meeting.row.evidenceProofDigests,
        }),
      ),
      /agent candidate is unavailable/,
    );
  });

  it("rejects coordinated rehashed stores containing standalone privacy leaks", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    for (const leak of [
      "Contact owner@example.com",
      "Review https://example.com/private",
      "Open file:///Users/owner/private.txt",
      "Use token=abcdef123456",
      "Rotate ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "Inspect eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature123456",
      "Open /Users/owner/private.txt",
      String.raw`Open C:\Users\owner\private.txt`,
      String.raw`Open \\server\share\private.txt`,
    ]) {
      const draft = structuredClone(accepted.store);
      draft.receipts[0]!.accepted.summary = leak;
      assert.throws(
        () => assertTaskMapNativeCandidateAcceptanceStore(
          coordinatedRehash(draft),
        ),
        /privacy|canonical|bounded text/i,
        leak,
      );
    }
  });

  it("rejects coordinated rehashed stores with noncanonical display whitespace", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    for (const displayText of [
      " Leading whitespace",
      "Repeated  whitespace",
      "Trailing whitespace ",
      "Nonbreaking\u00a0whitespace",
    ]) {
      const draft = structuredClone(accepted.store);
      draft.receipts[0]!.accepted.title = displayText;
      assert.throws(
        () => assertTaskMapNativeCandidateAcceptanceStore(
          coordinatedRehash(draft),
        ),
        /canonical|bounded text/i,
        displayText,
      );
    }
  });

  it("rejects the complete bidi-control set in coordinated rehashed durable text", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const bidiControls = [
      "\u061c",
      "\u200e",
      "\u200f",
      "\u202a",
      "\u202b",
      "\u202c",
      "\u202d",
      "\u202e",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
    ];
    for (const field of ["title", "summary"] as const) {
      for (const control of bidiControls) {
        const unsafeText = `Review ${control}context`;
        const draft = structuredClone(accepted.store);
        draft.receipts[0]!.accepted[field] = unsafeText;
        assert.throws(
          () => assertTaskMapNativeCandidateAcceptanceStore(
            coordinatedRehash(draft),
          ),
          /display|meaningful|bidi|bounded text/i,
          `${field}: ${JSON.stringify(unsafeText)}`,
        );
      }
    }
  });

  it("rejects every Unicode Cc scalar in coordinated rehashed durable text", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const allUnicodeControlCharacters = [
      ...Array.from({ length: 0x20 }, (_, codePoint) => String.fromCodePoint(codePoint)),
      ...Array.from(
        { length: 0x21 },
        (_, offset) => String.fromCodePoint(0x7f + offset),
      ),
    ];
    const unicodeControlCharacters = [
      "\u009b",
      ...allUnicodeControlCharacters.filter((control) => control !== "\u009b"),
    ];
    for (const field of ["title", "summary"] as const) {
      for (const control of unicodeControlCharacters) {
        const draft = structuredClone(accepted.store);
        draft.receipts[0]!.accepted[field] = `Review ${control}context`;
        assert.throws(
          () => assertTaskMapNativeCandidateAcceptanceStore(
            coordinatedRehash(draft),
          ),
          /display|control|bounded text/i,
          `${field}: U+${control.codePointAt(0)!.toString(16).padStart(4, "0")}`,
        );
      }
    }
  });

  it("rejects coordinated rehashed durable text without a meaningful scalar", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    for (const field of ["title", "summary"] as const) {
      const draft = structuredClone(accepted.store);
      draft.receipts[0]!.accepted[field] = "\u200b\u200d";
      assert.throws(
        () => assertTaskMapNativeCandidateAcceptanceStore(
          coordinatedRehash(draft),
        ),
        /display|meaningful|bounded text/i,
        field,
      );
    }
  });

  it("rejects default-ignorable marks without a meaningful scalar after coordinated rehash", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const defaultIgnorableMarks = [
      "\ufe0e",
      "\ufe0f",
      "\u{e0100}",
      "\u034f",
      "\u180b",
    ];
    for (const field of ["title", "summary"] as const) {
      for (const unsafeText of defaultIgnorableMarks) {
        const draft = structuredClone(accepted.store);
        draft.receipts[0]!.accepted[field] = unsafeText;
        assert.throws(
          () => assertTaskMapNativeCandidateAcceptanceStore(
            coordinatedRehash(draft),
          ),
          /display|meaningful|bounded text/i,
          `${field}: ${JSON.stringify(unsafeText)}`,
        );
      }
    }
  });

  it("preserves legitimate emoji and Indic format controls in durable text", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const legitimateText = "Review ✈️, 👩‍💻, and क्‍ष output";
    const draft = structuredClone(accepted.store);
    draft.receipts[0]!.accepted.title = legitimateText;
    draft.receipts[0]!.accepted.summary = legitimateText;

    assert.doesNotThrow(
      () => assertTaskMapNativeCandidateAcceptanceStore(
        coordinatedRehash(draft),
      ),
    );
  });

  it("rejects coordinated rehashed stores observed before occurrence", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const draft = structuredClone(accepted.store);
    draft.receipts[0]!.accepted.occurredAt =
      "2026-08-03T18:00:00.000Z";
    draft.receipts[0]!.accepted.observedAt =
      "2026-08-03T17:59:00.000Z";
    assert.throws(
      () => assertTaskMapNativeCandidateAcceptanceStore(
        coordinatedRehash(draft),
      ),
      /chronology|timestamp/i,
    );
  });

  it("resolves the exact authenticated current proof without changing review overlay bytes", () => {
    const source = context();
    const before = taskMapNativeCandidateReviewCanonicalBytes(source.overlay);
    const proof = resolveTaskMapNativeCandidateProof({
      result: source.result,
      overlay: source.overlay,
      expectedOwnerScopeDigest: source.ownerScopeDigest,
      assessedAt: ASSESSED,
      candidateId: source.row.candidateId,
    });
    assert.deepEqual(proof, source.row);
    assert.equal(taskMapNativeCandidateReviewCanonicalBytes(source.overlay), before);
  });

  it("rejects an otherwise eligible caller-fabricated raw occurrence", () => {
    const source = context();
    assert.throws(
      () => resolveTaskMapNativeCandidateProof({
        result: source.result,
        overlay: source.overlay,
        expectedOwnerScopeDigest: source.ownerScopeDigest,
        assessedAt: ASSESSED,
        candidateId: source.row.candidateId,
        authenticatedOccurrences: [{
          statementReferenceDigest: source.row.statementReferenceDigest,
          evidenceProofDigest: digest("fabricated-eligible-proof"),
          kind: "action_item",
          title: source.row.title,
          summary: source.row.summary,
          speechActClass: "request",
          speechActActor: "self",
          mentionIdentityDigest: source.row.mentionIdentityDigest!,
          confidence: source.row.confidence,
          promotionEligible: true,
          sourceKind: "granola",
          occurredAt: source.row.occurredAt,
          observedAt: source.row.observedAt,
        }],
      } as Parameters<typeof resolveTaskMapNativeCandidateProof>[0]),
      /unsupported or missing fields/,
    );
  });

  it("accepts only eligible request-self and commitment-self proofs", () => {
    for (const speechActClass of ["request", "commitment"] as const) {
      const source = context(speechActClass, "self", `owner-${speechActClass}`);
      const accepted = promoteTaskMapNativeCandidate(promotionInput(source));
      assert.equal(accepted.receipt.accepted.speechActClass, speechActClass);
      assert.equal(accepted.receipt.accepted.speechActActor, "self");
      assert.equal(accepted.receipt.authority.sourceKind, "manual");
      assert.equal(accepted.receipt.authority.authority, "user");
      assert.equal(accepted.receipt.authority.syncMode, "personal_fork");
      assert.deepEqual(accepted.receipt.authority.capabilities, ["read_task"]);
      assert.equal(accepted.receipt.authority.recordKind, "authoritative_task");
      assert.equal(accepted.receipt.authority.lifecycle, "explicit_user_policy");
      assert.equal(accepted.receipt.sourceWritebackAttempted, false);
    }
  });

  it("rejects every ineligible class/actor cell", () => {
    for (const speechActClass of ["request", "commitment", "decision", "other"] as const) {
      for (const actor of ["self", "other", "unknown"] as const) {
        if ((speechActClass === "request" || speechActClass === "commitment") && actor === "self") continue;
        const source = context(speechActClass, actor, `${speechActClass}-${actor}`);
        assert.throws(
          () => promoteTaskMapNativeCandidate(promotionInput(source)),
          /not promotion eligible/,
        );
      }
    }
  });

  it("rejects stale, missing, dismissed, wrong-owner, and exact-proof mismatches", () => {
    const source = context();
    for (const [field, value] of [
      ["candidateId", `tmnativecandidate_${"f".repeat(64)}`],
      ["expectedCandidateRevisionDigest", digest("stale")],
      ["expectedStatementReferenceDigest", digest("wrong-statement")],
      ["expectedEvidenceProofDigests", [digest("wrong-proof")]],
      ["expectedOwnerScopeDigest", testOwnerScopeDigest("wrong-owner")],
    ] as const) {
      assert.throws(
        () => promoteTaskMapNativeCandidate(promotionInput(source, { [field]: value })),
        /candidate acceptance|candidate review/i,
      );
    }
    const dismissed = reduceTaskMapNativeCandidateReview({
      result: source.result,
      overlay: source.overlay,
      expectedOwnerScopeDigest: source.ownerScopeDigest,
      assessedAt: ASSESSED,
      candidateId: source.row.candidateId,
      expectedCandidateRevisionDigest: source.row.candidateRevisionDigest,
      action: "dismiss",
      idempotencyKeyDigest: digest("dismiss"),
      decidedAt: ASSESSED,
    });
    assert.throws(
      () => promoteTaskMapNativeCandidate(promotionInput(source, { overlay: dismissed })),
      /dismissed|not present/,
    );
  });

  it("persists a bounded authenticated chain and replays identically after restart without producer state", async () => {
    const storePath = tempStorePath();
    const first = promoteTaskMapNativeCandidate(promotionInput());
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
      store: first.store,
    });
    const loaded = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
    });
    assert.deepEqual(loaded, first.store);
    assert.equal(
      taskMapNativeCandidateAcceptanceHeadDigest(loaded),
      first.receipt.promotionDigest,
    );
    const replay = promoteTaskMapNativeCandidate(promotionInput(context(), {
      result: null,
      overlay: null,
      previousStore: loaded,
      confirmedAt: "2026-08-03T19:00:00.000Z",
    }));
    assert.deepEqual(replay.receipt, first.receipt);
    assert.deepEqual(replay.store, first.store);
    assert.throws(
      () => promoteTaskMapNativeCandidate(promotionInput(context(), {
        result: null,
        overlay: null,
        previousStore: loaded,
        expectedStatementReferenceDigest: digest("conflict"),
      })),
      /idempotency key conflicts/,
    );
    assert.throws(
      () => promoteTaskMapNativeCandidate(promotionInput(context(), {
        previousStore: loaded,
        idempotencyKeyDigest: digest("different-key"),
      })),
      /already promoted/,
    );
    assert.ok(Buffer.byteLength(readFileSync(storePath)) < TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes);
  });

  it("loads a missing store without creating its parent directory", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".task6-load-missing-"));
    roots.push(root);
    const parent = path.join(root, "missing-taskmap");
    const storePath = path.join(parent, "native-candidate-acceptance.v1.json");
    const loaded = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: testOwnerScopeDigest("task6-owner"),
    });
    assert.equal(loaded, null);
    assert.equal(existsSync(parent), false);
  });

  it("treats an exact persisted-store replay as a byte-identical no-op", async () => {
    const storePath = tempStorePath();
    const first = promoteDistinctCandidate(null, "base", CONFIRMED);
    const input = {
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
      store: first.store,
    };
    await writeTaskMapNativeCandidateAcceptanceStore(input);
    const before = statSync(storePath, { bigint: true });
    const beforeBytes = readFileSync(storePath);
    await writeTaskMapNativeCandidateAcceptanceStore(input);
    const after = statSync(storePath, { bigint: true });
    assert.deepEqual(readFileSync(storePath), beforeBytes);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
  });

  it("rejects a canonical two-receipt initialization without creating its parent", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".task6-genesis-missing-"));
    roots.push(root);
    const parent = path.join(root, "absent-taskmap");
    const storePath = path.join(
      parent,
      "native-candidate-acceptance.v1.json",
    );
    assert.equal(existsSync(parent), false);
    const first = promoteDistinctCandidate(null, "base", CONFIRMED);
    const twoReceipts = promoteDistinctCandidate(
      first.store,
      "extension-a",
      "2026-08-03T18:02:00.000Z",
    );
    assert.equal(twoReceipts.store.receipts.length, 2);
    assert.doesNotThrow(() =>
      assertTaskMapNativeCandidateAcceptanceStore(twoReceipts.store)
    );
    await assert.rejects(
      writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: twoReceipts.store.ownerScopeDigest,
        store: twoReceipts.store,
      }),
      /initial|genesis|one receipt/i,
    );
    assert.equal(existsSync(parent), false);
    assert.equal(existsSync(storePath), false);
  });

  it("rejects a stale rollback after a valid one-receipt extension", async () => {
    const storePath = tempStorePath();
    const first = promoteDistinctCandidate(null, "base", CONFIRMED);
    const extended = promoteDistinctCandidate(
      first.store,
      "extension-a",
      "2026-08-03T18:02:00.000Z",
    );
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
      store: first.store,
    });
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: extended.store.ownerScopeDigest,
      store: extended.store,
    });
    const extendedBytes = readFileSync(storePath);
    await assert.rejects(
      writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: first.store.ownerScopeDigest,
        store: first.store,
      }),
      /append|stale|rollback|fork/i,
    );
    assert.deepEqual(readFileSync(storePath), extendedBytes);
  });

  it("rejects a same-head fork after another extension wins", async () => {
    const storePath = tempStorePath();
    const first = promoteDistinctCandidate(null, "base", CONFIRMED);
    const extensionA = promoteDistinctCandidate(
      first.store,
      "extension-a",
      "2026-08-03T18:02:00.000Z",
    );
    const extensionB = promoteDistinctCandidate(
      first.store,
      "extension-b",
      "2026-08-03T18:03:00.000Z",
    );
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
      store: first.store,
    });
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: extensionA.store.ownerScopeDigest,
      store: extensionA.store,
    });
    const winningBytes = readFileSync(storePath);
    await assert.rejects(
      writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: extensionB.store.ownerScopeDigest,
        store: extensionB.store,
      }),
      /append|stale|rollback|fork/i,
    );
    assert.deepEqual(readFileSync(storePath), winningBytes);
  });

  it("serializes concurrent stale writers so exactly one extension wins", async () => {
    const storePath = tempStorePath();
    const first = promoteDistinctCandidate(null, "base", CONFIRMED);
    const extensionA = promoteDistinctCandidate(
      first.store,
      "extension-a",
      "2026-08-03T18:02:00.000Z",
    );
    const extensionB = promoteDistinctCandidate(
      first.store,
      "extension-b",
      "2026-08-03T18:03:00.000Z",
    );
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
      store: first.store,
    });
    const outcomes = await Promise.allSettled(
      [extensionA, extensionB].map((extension) =>
        writeTaskMapNativeCandidateAcceptanceStore({
          storePath,
          expectedOwnerScopeDigest: extension.store.ownerScopeDigest,
          store: extension.store,
        })
      ),
    );
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assert.match(String(rejected.reason), /append|stale|rollback|fork/i);
    const loaded = await loadTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: first.store.ownerScopeDigest,
    });
    assert.ok(
      taskMapContractCanonicalJson(loaded)
        === taskMapContractCanonicalJson(extensionA.store)
      || taskMapContractCanonicalJson(loaded)
        === taskMapContractCanonicalJson(extensionB.store),
    );
  });

  it("rejects store tamper, symlinks, hardlinks, and unsafe modes without replacing safe bytes", async () => {
    const storePath = tempStorePath();
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
      store: accepted.store,
    });
    const safeBytes = readFileSync(storePath, "utf8");
    chmodSync(path.dirname(storePath), 0o755);
    await assert.rejects(
      writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
        store: accepted.store,
      }),
      /0700 directory/,
    );
    assert.equal(readFileSync(storePath, "utf8"), safeBytes);
    chmodSync(path.dirname(storePath), 0o700);
    const tampered = JSON.parse(safeBytes) as TaskMapNativeCandidateAcceptanceStoreV1;
    tampered.receipts[0]!.accepted.title = "tampered";
    assert.throws(() => assertTaskMapNativeCandidateAcceptanceStore(tampered), /digest|chain/);

    chmodSync(storePath, 0o644);
    await assert.rejects(
      loadTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
      }),
      /authentication/,
    );
    chmodSync(storePath, 0o600);
    const peer = `${storePath}.peer`;
    linkSync(storePath, peer);
    await assert.rejects(
      loadTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
      }),
      /authentication/,
    );
    unlinkSync(peer);
    unlinkSync(storePath);
    symlinkSync(path.basename(peer), storePath);
    await assert.rejects(
      writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
        store: accepted.store,
      }),
      /regular file|symbolic link|ELOOP/,
    );
  });

  it("fails authenticated store reads on replacement and same-inode metadata races", async () => {
    for (const race of [
      "replace",
      "chmod",
      "hardlink",
      "mutate_restore_mtime",
      "overgrowth",
    ] as const) {
      const storePath = tempStorePath();
      const accepted = promoteTaskMapNativeCandidate(promotionInput());
      await writeTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
        store: accepted.store,
      });
      const safeBytes = readFileSync(storePath);
      const initial = statSync(storePath);
      await assert.rejects(
        loadTaskMapNativeCandidateAcceptanceStore({
          storePath,
          expectedOwnerScopeDigest: accepted.store.ownerScopeDigest,
          afterAuthenticatedReadForTesting: () => {
            if (race === "replace") {
              renameSync(storePath, `${storePath}.replaced`);
              writeFileSync(storePath, safeBytes, { mode: 0o600 });
            } else if (race === "chmod") {
              chmodSync(storePath, 0o644);
            } else if (race === "hardlink") {
              linkSync(storePath, `${storePath}.peer`);
            } else if (race === "overgrowth") {
              writeFileSync(
                storePath,
                Buffer.alloc(
                  TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes,
                  0x20,
                ),
                { flag: "a" },
              );
            } else {
              const descriptor = openSync(storePath, "r+");
              try {
                writeSync(
                  descriptor,
                  Buffer.from([safeBytes[0] === 0x7b ? 0x5b : 0x7b]),
                  0,
                  1,
                  0,
                );
              } finally {
                closeSync(descriptor);
              }
              utimesSync(storePath, initial.atime, initial.mtime);
            }
          },
        }),
        /authentication|changed|replaced/,
      );
    }
  });

  it("rejects invalid UTF-8 and an initial authority store over its byte cap", async () => {
    const storePath = tempStorePath();
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const replacementStore = structuredClone(accepted.store);
    replacementStore.receipts[0]!.accepted.title =
      "Confirm the \uFFFD bounded task";
    const validReplacementStore = coordinatedRehash(replacementStore);
    assert.doesNotThrow(() =>
      assertTaskMapNativeCandidateAcceptanceStore(validReplacementStore)
    );
    await writeTaskMapNativeCandidateAcceptanceStore({
      storePath,
      expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
      store: validReplacementStore,
    });
    const bytes = readFileSync(storePath);
    const replacementBytes = Buffer.from("\uFFFD");
    const replacementOffset = bytes.indexOf(replacementBytes);
    assert.ok(replacementOffset >= 0);
    writeFileSync(storePath, Buffer.concat([
      bytes.subarray(0, replacementOffset),
      Buffer.from([0xff]),
      bytes.subarray(replacementOffset + replacementBytes.length),
    ]), { mode: 0o600 });
    await assert.rejects(
      loadTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
      }),
      /UTF-8/,
    );

    writeFileSync(
      storePath,
      Buffer.alloc(
        TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxFileBytes + 1,
        0x20,
      ),
      { mode: 0o600 },
    );
    await assert.rejects(
      loadTaskMapNativeCandidateAcceptanceStore({
        storePath,
        expectedOwnerScopeDigest: validReplacementStore.ownerScopeDigest,
      }),
      /authentication|bounded|size|limit/,
    );
  });

  it("rehydrates deterministic manual authority and creates accepted work without source writeback", () => {
    const source = context();
    const accepted = promoteTaskMapNativeCandidate(promotionInput(source));
    const base = taskMapNativeSemanticInputFromMeetingProducerResult(
      source.result,
      source.ownerScopeDigest,
    );
    const merged = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      base,
      accepted.store,
    );
    const pointer = merged.taskMapInput.pointers.find((candidate) =>
      candidate.id === `tmcandidatepromotion_${accepted.receipt.promotionDigest}`
    )!;
    const event = merged.taskMapInput.events.find((candidate) =>
      candidate.id === `tmcandidatepromotionevent_${accepted.receipt.promotionDigest}`
    )!;
    assert.ok(pointer);
    assert.ok(event);
    assert.equal(pointer.id, `tmcandidatepromotion_${accepted.receipt.promotionDigest}`);
    assert.equal(event.id, `tmcandidatepromotionevent_${accepted.receipt.promotionDigest}`);
    assert.equal(pointer.sourceRefHash, accepted.receipt.promotionDigest);
    assert.equal(pointer.sourceVersion, accepted.receipt.promotionDigest);
    assert.deepEqual(event.objectRefs, [
      `external:${accepted.receipt.statementReferenceDigest}`,
      `promotion-proof:${accepted.receipt.promotionDigest}`,
    ]);
    assert.equal(event.recordKind, "authoritative_task");
    assert.equal(event.sourceStatus, "open");
    const projection = buildTaskMapNativeSemanticProjection(
      merged,
      acceptanceOptions(accepted.store),
    );
    const promoted = projection.tasks.find((task) =>
      task.taskHomePointerId === pointer.id
    );
    assert.ok(promoted);
    assert.equal(promoted.reviewState, "accepted");
    assert.equal(promoted.authority, "user");
    assert.equal(promoted.openState, "open");
    assert.equal(promoted.citations[0]?.sourceKind, "manual");
    assert.equal(
      taskMapContractCanonicalJson(accepted.store).includes("document-task6-owner"),
      false,
    );
  });

  it("does not export a generic raw manual-authority merge seam", () => {
    assert.equal(
      (semanticAdapter as unknown as Record<string, unknown>)
        .mergeTaskMapNativeManualAuthorityInput,
      undefined,
    );
  });

  it("rejects direct raw manual authority and requires its exact validated receipt store", () => {
    const source = context();
    const accepted = promoteTaskMapNativeCandidate(promotionInput(source));
    const base = taskMapNativeSemanticInputFromMeetingProducerResult(
      source.result,
      source.ownerScopeDigest,
    );
    const receiptBound = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      base,
      accepted.store,
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(receiptBound),
      /invalid_source_binding|candidate acceptance/i,
    );
    const arbitrary = rekeyManualAuthority(receiptBound, "direct");
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(arbitrary),
      /invalid_source_binding|candidate acceptance/i,
    );
    assert.doesNotThrow(() => buildTaskMapNativeSemanticProjection(
      receiptBound,
      acceptanceOptions(accepted.store),
    ));
  });

  it("rejects stale, tampered, wrong-owner, missing, extra, and colliding receipt contexts", () => {
    const source = context();
    const first = promoteTaskMapNativeCandidate(promotionInput(source));
    const base = taskMapNativeSemanticInputFromMeetingProducerResult(
      source.result,
      source.ownerScopeDigest,
    );
    const receiptBound = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      base,
      first.store,
    );
    const secondSource = context("commitment", "self", "task6-owner");
    const second = promoteTaskMapNativeCandidate(promotionInput(secondSource, {
      previousStore: first.store,
      idempotencyKeyDigest: digest("explicit-owner-confirmation-2"),
    }));
    const newerInput = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      base,
      second.store,
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        newerInput,
        acceptanceOptions(first.store),
      ),
      /invalid_source_binding|candidate acceptance/i,
    );

    const tampered = structuredClone(first.store);
    tampered.receipts[0]!.accepted.title = "Tampered accepted title";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        receiptBound,
        acceptanceOptions(tampered),
      ),
      /invalid_source_binding|candidate acceptance/i,
    );

    const other = context("request", "self", "task6-other-owner");
    const wrongOwner = promoteTaskMapNativeCandidate(promotionInput(other));
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        receiptBound,
        acceptanceOptions(wrongOwner.store),
      ),
      /invalid_source_binding|candidate acceptance/i,
    );

    const missing = structuredClone(receiptBound);
    const missingEvent = missing.taskMapInput.events.find((item) =>
      item.pointerId.startsWith("tmcandidatepromotion_")
    )!;
    missing.taskMapInput.events = missing.taskMapInput.events.filter((item) =>
      item.id !== missingEvent.id
    );
    missing.evidenceBindings = missing.evidenceBindings.filter((item) =>
      item.eventId !== missingEvent.id
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        missing,
        acceptanceOptions(first.store),
      ),
      /invalid_source_binding|no_eligible_work/i,
    );

    const extraFragment = rekeyManualAuthority(receiptBound, "extra");
    const extra = structuredClone(receiptBound);
    extra.taskMapInput.pointers.push(
      extraFragment.taskMapInput.pointers.find((item) =>
        item.sourceKind === "manual"
      )!,
    );
    extra.taskMapInput.events.push(
      extraFragment.taskMapInput.events.find((item) =>
        item.id === "forged-manual-event-extra"
      )!,
    );
    extra.sourceBindings.push(
      extraFragment.sourceBindings.find((item) =>
        item.pointerId === "forged-manual-extra"
      )!,
    );
    extra.evidenceBindings.push(
      extraFragment.evidenceBindings.find((item) =>
        item.eventId === "forged-manual-event-extra"
      )!,
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        extra,
        acceptanceOptions(first.store),
      ),
      /invalid_source_binding|candidate acceptance/i,
    );

    const collision = structuredClone(receiptBound);
    const collidingPointer = collision.taskMapInput.pointers.find((item) =>
      item.sourceKind === "manual"
    )!;
    collidingPointer.sourceKind = "linear";
    collidingPointer.authority = "source_system";
    collidingPointer.syncMode = "return_only";
    collidingPointer.capabilities = ["read_task"];
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        collision,
        acceptanceOptions(first.store),
      ),
      /invalid_source_binding|candidate acceptance/i,
    );
  });

  it("preserves a legacy accepted manual predecessor without current raw manual authority", () => {
    const source = context();
    const accepted = promoteTaskMapNativeCandidate(promotionInput(source));
    const base = taskMapNativeSemanticInputFromMeetingProducerResult(
      source.result,
      source.ownerScopeDigest,
    );
    const predecessor = buildTaskMapNativeSemanticProjection(
      mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
        base,
        accepted.store,
      ),
      acceptanceOptions(accepted.store),
    );
    const predecessorBytes = taskMapContractCanonicalJson(predecessor);
    assert.equal(predecessor.tasks.length, 1);
    assert.equal(predecessor.tasks[0]!.authority, "user");
    assert.equal(predecessor.tasks[0]!.citations[0]?.sourceKind, "manual");
    const current = structuredClone(base);
    current.taskMapInput.generatedAt = "2026-08-03T18:02:00.000Z";
    assert.equal(
      current.taskMapInput.pointers.some((pointer) =>
        pointer.sourceKind === "manual"
      ),
      false,
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(current, {
        previousProjection: predecessor,
        previousProjectionDigest:
          diffTaskMapProjections(null, predecessor).currentProjectionDigest,
      }),
      /no_eligible_work|predecessor_continuity_required/i,
    );
    assert.equal(taskMapContractCanonicalJson(predecessor), predecessorBytes);
  });

  it("binds normalized statement identity and never accepts caller display text", () => {
    const source = context();
    const accepted = promoteTaskMapNativeCandidate({
      ...promotionInput(source),
      expectedStatementReferenceDigest: taskMapMeetingStatementReferenceDigest({
        kind: "action_item",
        title: "ignored caller title",
        summary: "ignored caller summary",
        explicitExternalReferenceDigests: [],
        mentionIdentityDigest: digest("mention:primary"),
      }),
    });
    assert.equal(accepted.receipt.accepted.title, source.row.title);
    assert.equal(accepted.receipt.accepted.summary, source.row.summary);
    assert.equal(taskMapContractCanonicalJson(accepted.store).includes("ignored caller"), false);
  });

  it("rejects more than 128 receipts or proofs and a noncanonical store", () => {
    const accepted = promoteTaskMapNativeCandidate(promotionInput());
    const tooMany = structuredClone(accepted.store);
    tooMany.receipts = Array.from(
      { length: TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_LIMITS_V1.maxReceipts + 1 },
      () => structuredClone(accepted.receipt),
    );
    assert.throws(() => assertTaskMapNativeCandidateAcceptanceStore(tooMany), /bounded|limit/);
    const noncanonical = structuredClone(accepted.store);
    noncanonical.receipts[0]!.evidenceProofDigests = [digest("z"), digest("a")]
      .sort()
      .reverse();
    assert.throws(() => assertTaskMapNativeCandidateAcceptanceStore(noncanonical), /sorted|digest|chain/);

    const rehashedIneligible = structuredClone(accepted.store);
    const receipt = rehashedIneligible.receipts[0]!;
    receipt.accepted.kind = "decision";
    receipt.accepted.speechActClass = "decision";
    receipt.accepted.speechActActor = "self";
    const {
      promotionId: _oldId,
      promotionDigest: _oldDigest,
      ...receiptCore
    } = receipt;
    receipt.promotionDigest = taskMapContractDigest({
      domain: "taskmap-native-candidate-promotion.1",
      ...receiptCore,
    });
    receipt.promotionId = `tmcandidatepromotion_${receipt.promotionDigest}`;
    rehashedIneligible.headReceiptDigest = receipt.promotionDigest;
    assert.throws(
      () => assertTaskMapNativeCandidateAcceptanceStore(rehashedIneligible),
      /promotion eligible|speech-act/,
    );

    for (const mutate of [
      (candidate: typeof receipt) => {
        candidate.candidateId = `tmnativecandidate_${"f".repeat(64)}`;
      },
      (candidate: typeof receipt) => {
        candidate.candidateRevisionDigest = digest("forged-revision");
      },
    ]) {
      const rehashed = structuredClone(accepted.store);
      const forged = rehashed.receipts[0]!;
      mutate(forged);
      const {
        promotionId: _id,
        promotionDigest: _digest,
        ...forgedCore
      } = forged;
      forged.promotionDigest = taskMapContractDigest({
        domain: "taskmap-native-candidate-promotion.1",
        ...forgedCore,
      });
      forged.promotionId = `tmcandidatepromotion_${forged.promotionDigest}`;
      rehashed.headReceiptDigest = forged.promotionDigest;
      assert.throws(
        () => assertTaskMapNativeCandidateAcceptanceStore(rehashed),
        /candidate identity|candidate revision/,
      );
    }
  });
});
