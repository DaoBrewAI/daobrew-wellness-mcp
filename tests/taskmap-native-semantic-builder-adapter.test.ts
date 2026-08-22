import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
  TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION,
  TaskMapNativeSemanticBuilderUnavailableError,
  buildTaskMapNativeSemanticProjection,
  buildTaskMapNativeSemanticProjectionFromMeetingAndPhysiologicalContext,
  buildTaskMapNativeSemanticProjectionFromMeetingProducerResult,
  taskMapNativeSemanticInputFromMeetingProducerResult,
  taskMapNativeSemanticInputWithPhysiologicalContext,
  type TaskMapNativeSemanticBuilderInputV1,
  type TaskMapNativeSemanticEvidenceBindingV1,
  type TaskMapNativeSemanticSourceBindingV1,
} from "../src/engine/taskmap/native-semantic-builder-adapter.js";
import type {
  TaskMapPhysiologicalSemanticContextV1,
} from "../src/engine/taskmap/physiological-source-snapshot.js";
import {
  mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput,
  promoteTaskMapNativeCandidate,
} from "../src/engine/taskmap/native-candidate-acceptance.js";
import {
  buildTaskMapNativeCandidateReview,
  buildTaskMapNativeCandidateShelf,
} from "../src/engine/taskmap/native-candidate-review.js";
import {
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  assessTaskMapMeetingProducerSnapshot,
  buildTaskMapMeetingProducerSnapshot,
  taskMapMeetingStatementReferenceDigest,
  type TaskMapMeetingProducerMeetingDraftV1,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  testOwnerScopeDigest as taskMapMeetingProducerOwnerScopeDigest,
} from "./support/confirmed-owner.js";
import {
  taskMapMembershipSignature,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  diffTaskMapProjections,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapSourcePointer,
} from "../src/engine/taskmap/types.js";

const AT_10 = "2026-07-29T10:00:00.000Z";
const AT_11 = "2026-07-29T11:00:00.000Z";
const AT_12 = "2026-07-29T12:00:00.000Z";
const AT_14 = "2026-07-29T14:00:00.000Z";
const AT_15 = "2026-07-29T15:00:00.000Z";
const SHARED_EXTERNAL_REF = `external:${"a".repeat(64)}`;
const OWNER_SCOPE_DIGEST = digest("synthetic-owner-scope");

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function producerBinding(): TaskMapSourceAuthorityBindingV1 {
  return {
    connectionId: "gemini-owner",
    sourceKind: "gemini_meet",
    tenantOrWorkspaceDigest: digest("gemini-workspace"),
    accountOrPrincipalDigest: digest("gemini-principal"),
    grantVersion: "grant-1",
  };
}

function producerMeeting(
  documentId: string,
  occurredAt: string,
  overrides: {
    revisionId?: string;
    contentDigest?: string;
    status?: "open" | "done";
    deadline?: string;
    coverage?: "complete" | "partial";
  } = {},
): TaskMapMeetingProducerMeetingDraftV1 {
  return {
    binding: producerBinding(),
    documentId,
    revisionId: overrides.revisionId ?? `revision-${documentId}`,
    contentDigest:
      overrides.contentDigest ?? digest(`content-${documentId}`),
    modifiedAt: "2026-07-29T10:00:00.000Z",
    eventTime: occurredAt,
    observedAt: "2026-07-29T11:00:00.000Z",
    evidence: [{
      kind: "action_item",
      title: "Ship the semantic builder",
      summary: "Finish the bounded native semantic refresh adapter.",
      occurredAt,
      observedAt: "2026-07-29T11:00:00.000Z",
      status: overrides.status ?? "open",
      deadline:
        overrides.deadline ?? "2026-07-30T17:00:00.000Z",
      quality: "structured_generated",
      coverage: overrides.coverage ?? "partial",
      confidence: 0.9,
      objectRefs: [{
        kind: "external_reference",
        referenceDigest: digest("https://example.test/work/semantic-builder"),
      }],
    }],
  };
}

function physiologicalContext(
  dayKey = "2026-07-28",
): TaskMapPhysiologicalSemanticContextV1 {
  const pointerId = "physource_0123456789abcdef";
  const semanticIdentityDigest = digest("physiological-semantic-identity");
  const sourceVersion = digest("physiological-source-version");
  const event: TaskMapEvent = {
    id: "physioevent_0123456789abcdef",
    pointerId,
    recordKind: "body_context",
    activity: "body_window_observed",
    occurredAt: `${dayKey}T00:00:00.000Z`,
    observedAt: AT_12,
    dayKey,
    objectRefs: [`physiological:${digest(dayKey)}`],
    title: "Physiological context",
    summary:
      "Readiness and Sleep were below the usual recent range; body-informed, not causal.",
    extractionConfidence: 1,
    bodyCategory: "below_baseline",
    bodyAxis: "composite_recovery",
    bodyJoinEligible: false,
  };
  return {
    pointers: [{
      id: pointerId,
      sourceKind: "oura",
      sourceObjectId: digest("physiological-provider-binding"),
      sourceRefHash: semanticIdentityDigest,
      sourceVersion,
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    }],
    events: [event],
    sourceBindings: [{
      pointerId,
      semanticClass: "body_context",
      semanticOriginId: "physiological_source",
      semanticIdentityDigest,
      sourceIdentityDigest: digest("physiological-provider-binding"),
      observedRevision: sourceVersion,
      evidenceRevision: sourceVersion,
      observedContentDigest: sourceVersion,
      evidenceContentDigest: sourceVersion,
    }],
    evidenceBindings: [{
      eventId: event.id,
      disposition: "body_only",
      rootLinkRefs: [],
    }],
  };
}

function producerResult(
  meetings: TaskMapMeetingProducerMeetingDraftV1[],
  producedAt = "2026-07-29T12:00:00.000Z",
  assessedAt = "2026-07-29T13:00:00.000Z",
) {
  const ownerScopeDigest =
    taskMapMeetingProducerOwnerScopeDigest("synthetic-owner");
  const snapshot = buildTaskMapMeetingProducerSnapshot({
    ownerScopeDigest,
    producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
    producedAt,
    meetings,
  });
  return {
    ownerScopeDigest,
    result: assessTaskMapMeetingProducerSnapshot(snapshot, assessedAt),
  };
}

function speechActProducerMeeting(
  documentId = "speech-act-document",
  occurredAt = "2026-07-27T19:00:00.000Z",
): TaskMapMeetingProducerMeetingDraftV1 {
  const legacy = producerMeeting(
    documentId,
    occurredAt,
  );
  return {
    ...legacy,
    evidence: [{
      ...legacy.evidence[0],
      title: "Ship the normalized meeting mention",
      summary: "Please ship the normalized meeting mention.",
      speechActClass: "request",
      speechActActor: "self",
      mentionIdentityDigest: digest("normalized-meeting-mention"),
      extractionEnvelopeDigest: digest("complete-extraction-envelope"),
      confidence: 0.73,
    }],
  } as TaskMapMeetingProducerMeetingDraftV1;
}

function speechActDecisionProducerMeeting(): TaskMapMeetingProducerMeetingDraftV1 {
  const legacy = producerMeeting(
    "speech-act-decision-document",
    "2026-07-27T20:00:00.000Z",
  );
  return {
    ...legacy,
    evidence: [{
      ...legacy.evidence[0],
      kind: "decision",
      title: "Use the local meeting agent",
      summary: "We decided to use the local meeting agent.",
      speechActClass: "decision",
      speechActActor: "unknown",
      mentionIdentityDigest: digest("normalized-meeting-decision"),
      extractionEnvelopeDigest: digest("decision-extraction-envelope"),
      confidence: 0.66,
    }],
  } as TaskMapMeetingProducerMeetingDraftV1;
}

function pointer(
  id: string,
  sourceKind: TaskMapSourcePointer["sourceKind"],
  digestCharacter: string,
  authority: TaskMapSourcePointer["authority"] = "none",
): TaskMapSourcePointer {
  return {
    id,
    sourceKind,
    sourceObjectId: `object-${id}`,
    sourceRefHash: digest(`${id}:identity:${digestCharacter}`),
    sourceVersion: digest(`${id}:content:${digestCharacter}`),
    authority,
    syncMode: authority === "none" ? "reference_only" : "return_only",
    capabilities:
      authority === "none"
        ? ["read_context"]
        : ["read_task", "deep_link"],
  };
}

function binding(
  source: TaskMapSourcePointer,
  revision = `revision-${source.id}`,
  semanticOriginId = source.id,
): TaskMapNativeSemanticSourceBindingV1 {
  assert.ok(source.sourceVersion);
  const semanticClass =
    source.sourceKind === "gemini_meet" || source.sourceKind === "granola"
      ? "meeting_context"
      : source.sourceKind === "oura"
        ? "body_context"
        : source.authority === "none"
          ? "context_only"
          : "source_authoritative";
  return {
    pointerId: source.id,
    semanticClass,
    semanticOriginId,
    semanticIdentityDigest: source.sourceRefHash,
    sourceIdentityDigest: source.sourceRefHash,
    observedRevision: revision,
    evidenceRevision: revision,
    observedContentDigest: source.sourceVersion,
    evidenceContentDigest: source.sourceVersion,
  };
}

function candidateIdentityRef(
  event: TaskMapEvent,
  candidateKind: "action_item" | "commitment" = "action_item",
): string {
  const explicitExternalReferenceDigests = event.objectRefs
    .filter((ref) => ref.startsWith("external:"))
    .map((ref) => ref.slice("external:".length));
  return `external:${taskMapMeetingStatementReferenceDigest({
    kind: candidateKind,
    title: event.title,
    summary: event.summary,
    explicitExternalReferenceDigests,
  })}`;
}

function evidenceBinding(
  event: TaskMapEvent,
): TaskMapNativeSemanticEvidenceBindingV1 {
  if (event.recordKind === "authoritative_task") {
    return {
      eventId: event.id,
      disposition: "source_authoritative",
      rootLinkRefs: event.objectRefs.filter((ref) =>
        ref.startsWith("external:")
      ),
    };
  }
  if (
    event.recordKind === "work_context"
    && event.activity === "commitment_stated"
  ) {
    const candidateRef = candidateIdentityRef(event);
    if (!event.objectRefs.includes(candidateRef)) {
      event.objectRefs.push(candidateRef);
    }
    return {
      eventId: event.id,
      disposition: "candidate_only",
      candidateIdentityRef: candidateRef,
      candidateKind: "action_item",
      rootLinkRefs: event.objectRefs.filter((ref) =>
        ref.startsWith("external:") && ref !== candidateRef
      ),
    };
  }
  if (event.recordKind === "body_context") {
    return {
      eventId: event.id,
      disposition: "body_only",
      rootLinkRefs: [],
    };
  }
  return {
    eventId: event.id,
    disposition: "context_only",
    rootLinkRefs: [],
  };
}

function authoritativeEvent(pointerId: string): TaskMapEvent {
  return {
    id: "source-task-created",
    pointerId,
    recordKind: "authoritative_task",
    activity: "task_created",
    occurredAt: "2026-07-27T18:00:00.000Z",
    observedAt: AT_10,
    objectRefs: [SHARED_EXTERNAL_REF],
    title: "Ship the semantic builder",
    summary: "Keep source authority while producing the bounded Task Map.",
    extractionConfidence: 1,
    sourceStatus: "in_progress",
  };
}

function commitmentEvent(
  id: string,
  pointerId: string,
  occurredAt: string,
  provenanceCharacter = "b",
): TaskMapEvent {
  return {
    id,
    pointerId,
    recordKind: "work_context",
    activity: "commitment_stated",
    occurredAt,
    observedAt: AT_11,
    dayKey: occurredAt.slice(0, 10),
    objectRefs: [
      SHARED_EXTERNAL_REF,
      `canonical-meeting:${provenanceCharacter.repeat(64)}`,
      `source-object:${provenanceCharacter.repeat(64)}`,
    ],
    title: "Add the bounded meeting candidate",
    summary: "The meeting explicitly assigned the semantic adapter follow-up.",
    extractionConfidence: 0.92,
    bodyJoinEligible: true,
  };
}

function decisionEvent(pointerId: string): TaskMapEvent {
  return {
    id: "meeting-decision-context",
    pointerId,
    recordKind: "work_context",
    activity: "decision_made",
    occurredAt: "2026-07-28T20:00:00.000Z",
    observedAt: AT_11,
    dayKey: "2026-07-28",
    objectRefs: [
      SHARED_EXTERNAL_REF,
      `canonical-meeting:${"b".repeat(64)}`,
      `source-object:${"b".repeat(64)}`,
    ],
    title: "Keep grouping deterministic",
    summary: "The meeting selected deterministic grouping for the baseline.",
    extractionConfidence: 0.94,
    bodyJoinEligible: true,
  };
}

function bodyEvent(pointerId: string): TaskMapEvent {
  return {
    id: "body-window-context",
    pointerId,
    recordKind: "body_context",
    activity: "body_window_observed",
    occurredAt: "2026-07-28T15:00:00.000Z",
    observedAt: AT_11,
    dayKey: "2026-07-28",
    objectRefs: ["body:2026-07-28"],
    title: "Recovery was below baseline",
    summary: "Relative recovery context is available for the same day.",
    extractionConfidence: 1,
    bodyCategory: "below_baseline",
    bodyAxis: "readiness",
  };
}

function taskMapInput(
  generatedAt: string,
  pointers: TaskMapSourcePointer[],
  events: TaskMapEvent[],
): TaskMapInput {
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt,
    pointers,
    events,
  };
}

function artifact(
  input: TaskMapInput,
  sourceBindings?: TaskMapNativeSemanticSourceBindingV1[],
): TaskMapNativeSemanticBuilderInputV1 {
  const boundedInput = structuredClone(input);
  const evidenceBindings = boundedInput.events.map((event) =>
    evidenceBinding(event)
  );
  const exactSourceBindings = sourceBindings ?? boundedInput.pointers.map(
    (item) => {
      const exactBinding = binding(item);
      if (
        item.sourceKind === "gemini_meet"
        || item.sourceKind === "granola"
      ) {
        const canonicalMeetingDigests = new Set(
          boundedInput.events
            .filter((event) => event.pointerId === item.id)
            .flatMap((event) =>
              event.objectRefs
                .filter((ref) => ref.startsWith("canonical-meeting:"))
                .map((ref) => ref.slice("canonical-meeting:".length))
            ),
        );
        if (canonicalMeetingDigests.size === 1) {
          exactBinding.semanticOriginId = [...canonicalMeetingDigests][0];
        }
      }
      return exactBinding;
    },
  );
  return {
    contractVersion: TASKMAP_NATIVE_SEMANTIC_BUILDER_INPUT_VERSION,
    ownerScopeDigest: OWNER_SCOPE_DIGEST,
    producer: {
      id: TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
      version: TASKMAP_MEETING_PRODUCER_VERSION,
    },
    freshness: {
      decision: "fresh",
      available: true,
      retainedLastGood: false,
      producedAt: AT_10,
      validThrough: AT_14,
      assessedAt: AT_12,
    },
    sourceBindings: exactSourceBindings,
    evidenceBindings,
    taskMapInput: boundedInput,
  };
}

function predecessorOptions(previousProjection: ReturnType<
  typeof buildTaskMapNativeSemanticProjection
>): {
  previousProjection: typeof previousProjection;
  previousProjectionDigest: string;
} {
  return {
    previousProjection,
    previousProjectionDigest:
      diffTaskMapProjections(null, previousProjection).currentProjectionDigest,
  };
}

function membershipRows(
  projection: ReturnType<typeof buildTaskMapNativeSemanticProjection>,
): Array<{
  id: string;
  rootId: string;
  title: string;
  reviewState: string;
}> {
  return projection.tasks.map((task) => ({
    id: task.id,
    rootId: task.rootId,
    title: task.title,
    reviewState: task.reviewState,
  })).sort((left, right) => left.id.localeCompare(right.id));
}

describe("Task Map native semantic builder adapter", () => {
  it("preserves the hard-coded legacy producer adapter contract and digests", () => {
    const legacy = producerResult([
      producerMeeting("document-a", "2026-07-27T19:00:00.000Z"),
    ]);
    const mapped = taskMapNativeSemanticInputFromMeetingProducerResult(
      legacy.result,
      legacy.ownerScopeDigest,
    );

    assert.equal(
      taskMapContractDigest(mapped),
      "308d518b19c128a61b919f5a8acb1a890929524939ee8708e9470ad0895ee1a3",
    );
    assert.equal(
      taskMapSemanticInputDigest(mapped.taskMapInput),
      "fec86ed1df95fde7f11c45f1df8d11f94e3ed37d882453e7f2fe054b9c671cdb",
    );
    assert.equal(
      Object.hasOwn(mapped.evidenceBindings[0], "mentionIdentityDigest"),
      false,
    );
  });

  it("carries and recomputes normalized mention identity for new meeting evidence", () => {
    const producer = producerResult([
      speechActProducerMeeting("speech-act-document-a"),
      speechActProducerMeeting(
        "speech-act-document-b",
        "2026-07-28T19:00:00.000Z",
      ),
    ]);
    const mapped = taskMapNativeSemanticInputFromMeetingProducerResult(
      producer.result,
      producer.ownerScopeDigest,
    );
    const binding = mapped.evidenceBindings[0];

    assert.equal(
      binding.mentionIdentityDigest,
      digest("normalized-meeting-mention"),
    );
    assert.doesNotThrow(() => buildTaskMapNativeSemanticProjection(mapped));

    const forged = structuredClone(mapped);
    forged.evidenceBindings[0].mentionIdentityDigest = digest("forged-mention");
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(forged),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("does not carry an unverifiable mention identity on context-only decision bindings", () => {
    const producer = producerResult([speechActDecisionProducerMeeting()]);
    const evidence = producer.result.snapshot?.meetings[0].evidence[0];
    const mapped = taskMapNativeSemanticInputFromMeetingProducerResult(
      producer.result,
      producer.ownerScopeDigest,
    );
    const binding = mapped.evidenceBindings[0];

    assert.match(evidence?.statementReferenceDigest ?? "", /^[a-f0-9]{64}$/);
    assert.equal(evidence?.proposalDisposition, "context_only");
    assert.equal(evidence?.promotionEligible, false);
    assert.equal(
      evidence?.objectRefs.some((ref) =>
        ref.kind === "external_reference"
        && ref.referenceDigest === evidence.statementReferenceDigest
      ),
      true,
    );
    assert.equal(binding.disposition, "context_only");
    assert.equal(Object.hasOwn(binding, "candidateIdentityRef"), false);
    assert.equal(Object.hasOwn(binding, "mentionIdentityDigest"), false);
    assert.deepEqual(binding.rootLinkRefs, []);
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(mapped),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "no_eligible_work",
    );

    const forged = structuredClone(mapped);
    forged.evidenceBindings[0].mentionIdentityDigest = digest("forged-decision");
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(forged),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("builds one deterministic proposed delta beside source-owned work and replays exactly", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const meeting = pointer("meeting-a", "gemini_meet", "2");
    const baselineInput = taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    );
    const baseline = buildTaskMapNativeSemanticProjection(
      artifact(baselineInput),
    );
    assert.equal(baseline.runStatus, "accepted");
    assert.equal(baseline.tasks.length, 1);
    assert.equal(baseline.tasks[0].reviewState, "accepted");
    assert.equal(baseline.tasks[0].authority, "source_system");

    const changedInput = taskMapInput(
      AT_11,
      [source, meeting],
      [
        authoritativeEvent(source.id),
        commitmentEvent(
          "meeting-action-a",
          meeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    );
    const changedArtifact = artifact(changedInput);
    const first = buildTaskMapNativeSemanticProjection(
      changedArtifact,
      predecessorOptions(baseline),
    );
    const replay = buildTaskMapNativeSemanticProjection(
      structuredClone(changedArtifact),
      predecessorOptions(structuredClone(baseline)),
    );

    assert.deepEqual(replay, first);
    assert.equal(first.tasks.length, 2);
    assert.equal(
      first.tasks.some((task) => task.id === baseline.tasks[0].id),
      true,
    );
    const proposed = first.tasks.filter(
      (task) => task.reviewState === "proposed",
    );
    assert.equal(proposed.length, 1);
    assert.equal(proposed[0].authority, "none");
    assert.equal(proposed[0].taskHomePointerId, undefined);
  });

  it("never promotes decisions or body context into membership", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const meeting = pointer("meeting-a", "gemini_meet", "2");
    const body = pointer("body-day", "oura", "3");
    const workOnly = artifact(taskMapInput(
      AT_11,
      [source, meeting],
      [
        authoritativeEvent(source.id),
        commitmentEvent(
          "meeting-action-a",
          meeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    ));
    const withContext = artifact(taskMapInput(
      AT_11,
      [source, meeting, body],
      [
        bodyEvent(body.id),
        decisionEvent(meeting.id),
        authoritativeEvent(source.id),
        commitmentEvent(
          "meeting-action-a",
          meeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    ));
    const shuffled = structuredClone(withContext);
    shuffled.taskMapInput.pointers.reverse();
    shuffled.taskMapInput.events.reverse();
    shuffled.sourceBindings.reverse();

    const baseline = buildTaskMapNativeSemanticProjection(workOnly);
    const contextual = buildTaskMapNativeSemanticProjection(withContext);
    const reordered = buildTaskMapNativeSemanticProjection(shuffled);

    assert.equal(
      taskMapMembershipSignature(contextual),
      taskMapMembershipSignature(baseline),
    );
    assert.equal(
      taskMapMembershipSignature(reordered),
      taskMapMembershipSignature(baseline),
    );
    assert.deepEqual(membershipRows(contextual), membershipRows(baseline));
    assert.deepEqual(membershipRows(reordered), membershipRows(baseline));
    assert.deepEqual(reordered, contextual);
    assert.equal(
      contextual.tasks.some((task) =>
        task.citations.some(
          (citation) => citation.eventId === "meeting-decision-context",
        )
      ),
      false,
    );
  });

  it("accepts the owner-shaped 134-event input under semantic and body policy bounds", () => {
    const sourcePointers = Array.from({ length: 19 }, (_, index) =>
      pointer(`source-task-${index}`, "linear", String(index), "source_system")
    );
    const meeting = pointer("meeting-owner-shaped", "gemini_meet", "meeting");
    const body = pointer("body-owner-shaped", "oura", "body");
    const authoritative = sourcePointers.map((source, index): TaskMapEvent => ({
      id: `source-task-event-${index}`,
      pointerId: source.id,
      recordKind: "authoritative_task",
      activity: "task_created",
      occurredAt: "2026-07-20T18:00:00.000Z",
      observedAt: AT_12,
      objectRefs: [
        index === 0
          ? SHARED_EXTERNAL_REF
          : `external:${digest(`owner-task-${index}`)}`,
      ],
      title: `Owner task ${index}`,
      summary: "Source-owned work remains explicit in the bounded input.",
      extractionConfidence: 1,
      sourceStatus: "in_progress",
    }));
    const workContext = [
      commitmentEvent(
        "owner-explicit-commitment",
        meeting.id,
        "2026-07-28T19:00:00.000Z",
      ),
      ...Array.from({ length: 23 }, (_, index): TaskMapEvent => ({
        id: `owner-context-${index}`,
        pointerId: meeting.id,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-28T18:00:00.000Z",
        observedAt: AT_12,
        objectRefs: [`context:${digest(`owner-context-${index}`)}`],
        title: `Bounded context ${index}`,
        summary: "Historical reviewed context is not an explicit commitment.",
        extractionConfidence: 0.9,
      })),
    ];
    const receipt: TaskMapEvent = {
      id: "owner-receipt",
      pointerId: meeting.id,
      recordKind: "receipt",
      activity: "receipt_observed",
      occurredAt: "2026-07-28T17:00:00.000Z",
      observedAt: AT_12,
      objectRefs: [`receipt:${digest("owner-receipt")}`],
      title: "Bounded receipt observed",
      summary: "The receipt records source coverage without creating work.",
      extractionConfidence: 1,
    };
    const bodyEvents = Array.from({ length: 90 }, (_, index): TaskMapEvent => {
      const day = new Date(Date.parse("2026-07-29T00:00:00.000Z"));
      day.setUTCDate(day.getUTCDate() - index);
      const dayKey = day.toISOString().slice(0, 10);
      return {
        id: `owner-body-${index}`,
        pointerId: body.id,
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: `${dayKey}T00:00:00.000Z`,
        observedAt: AT_12,
        dayKey,
        objectRefs: [`body-day:${dayKey}`],
        title: "Recovery was within baseline",
        summary: "Relative recovery context is available for this day.",
        extractionConfidence: 1,
        bodyCategory: "within_baseline",
        bodyAxis: "readiness",
      };
    });
    const input = taskMapInput(
      AT_12,
      [...sourcePointers, meeting, body],
      [...authoritative, ...workContext, receipt, ...bodyEvents],
    );
    assert.equal(input.events.length, 134);
    assert.equal(
      input.events.filter((event) => event.recordKind === "body_context").length,
      90,
    );
    assert.equal(
      input.events.filter((event) => event.recordKind !== "body_context").length,
      44,
    );

    const projection = buildTaskMapNativeSemanticProjection(artifact(input));
    assert.equal(projection.runStatus, "accepted");
    assert.equal(projection.rejections.length, 0);
    assert.equal(projection.tasks.length, 20);
    assert.equal(
      projection.tasks.filter((task) => task.reviewState === "proposed").length,
      1,
    );

    const hostileBodyOnlyGrowth = artifact(structuredClone(input));
    while (hostileBodyOnlyGrowth.taskMapInput.events.length <= 512) {
      const index = hostileBodyOnlyGrowth.taskMapInput.events.length;
      hostileBodyOnlyGrowth.taskMapInput.events.push({
        ...bodyEvents[0],
        id: `hostile-body-${index}`,
        objectRefs: [`body-hostile:${index}`],
      });
    }
    assert.equal(hostileBodyOnlyGrowth.taskMapInput.events.length, 513);
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(hostileBodyOnlyGrowth),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "input_limit_exceeded",
    );
  });

  it("rejects 129 semantic events even when the total stays below 512", () => {
    const meeting = pointer("meeting-semantic-cap", "gemini_meet", "2");
    const semanticEvents = Array.from(
      { length: 129 },
      (_, index): TaskMapEvent => ({
        id: `semantic-context-${index}`,
        pointerId: meeting.id,
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-28T18:00:00.000Z",
        observedAt: AT_12,
        objectRefs: [
          `canonical-meeting:${digest(`semantic-context-${index}`)}`,
        ],
        title: `Bounded semantic context ${index}`,
        summary: "Context cannot create membership and remains bounded.",
        extractionConfidence: 0.9,
      }),
    );
    const input = artifact(taskMapInput(
      AT_12,
      [meeting],
      semanticEvents,
    ));
    assert.equal(input.taskMapInput.events.length, 129);
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(input),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "input_limit_exceeded",
    );
  });

  it("compacts redundant candidate occurrences before enforcing semantic limits", () => {
    const authority = pointer(
      "source-task-compaction",
      "linear",
      "authority",
      "source_system",
    );
    const candidatePointers = Array.from({ length: 2 }, (_, index) =>
      pointer(
        `calendar-candidate-${String(index).padStart(3, "0")}`,
        "local_calendar",
        `candidate-${index}`,
      )
    );
    const candidateEvents = Array.from({ length: 129 }, (_, index) =>
      commitmentEvent(
        `calendar-candidate-event-${String(index).padStart(3, "0")}`,
        candidatePointers[index === 0 ? 0 : 1].id,
        "2026-07-28T19:00:00.000Z",
        "c",
      )
    );
    const context = pointer(
      "calendar-context-retained",
      "local_calendar",
      "context",
    );
    const contextEvent: TaskMapEvent = {
      id: "calendar-context-event-retained",
      pointerId: context.id,
      recordKind: "work_context",
      activity: "context_observed",
      occurredAt: "2026-07-28T18:00:00.000Z",
      observedAt: AT_12,
      objectRefs: [`calendar-context:${digest("retained-context")}`],
      title: "Calendar context stays available",
      summary: "Non-candidate context is never compacted into work.",
      extractionConfidence: 0.9,
    };
    const originallyEmpty = pointer(
      "calendar-empty-retained",
      "local_calendar",
      "empty",
    );
    const overLimit = artifact(taskMapInput(
      AT_12,
      [authority, ...candidatePointers, context, originallyEmpty],
      [
        authoritativeEvent(authority.id),
        ...candidateEvents,
        contextEvent,
      ],
    ), [
      binding(authority),
      ...candidatePointers.map((source) =>
        binding(source, `revision-${source.id}`, "calendar_occurrence")
      ),
      binding(context),
      binding(originallyEmpty),
    ]);
    const retainedCandidateEventId = "calendar-candidate-event-000";
    const retainedCandidatePointerId = "calendar-candidate-000";
    const representative = structuredClone(overLimit);
    representative.taskMapInput.events = representative.taskMapInput.events
      .filter((event) =>
        !event.id.startsWith("calendar-candidate-event-")
        || event.id === retainedCandidateEventId
      );
    representative.evidenceBindings = representative.evidenceBindings
      .filter((binding) =>
        !binding.eventId.startsWith("calendar-candidate-event-")
        || binding.eventId === retainedCandidateEventId
      );
    representative.taskMapInput.pointers =
      representative.taskMapInput.pointers.filter((source) =>
        !source.id.startsWith("calendar-candidate-")
        || source.id === retainedCandidatePointerId
      );
    representative.sourceBindings = representative.sourceBindings.filter(
      (sourceBinding) =>
        !sourceBinding.pointerId.startsWith("calendar-candidate-")
        || sourceBinding.pointerId === retainedCandidatePointerId,
    );

    assert.equal(overLimit.taskMapInput.events.length, 131);
    assert.equal(overLimit.taskMapInput.pointers.length, 5);
    assert.equal(overLimit.evidenceBindings.length, 131);
    assert.equal(overLimit.sourceBindings.length, 5);
    const expected = buildTaskMapNativeSemanticProjection(representative);
    assert.deepEqual(
      buildTaskMapNativeSemanticProjection(overLimit),
      expected,
    );

    const expectedWithBody = taskMapNativeSemanticInputWithPhysiologicalContext(
      representative,
      physiologicalContext(),
    );
    const compactedWithBody = taskMapNativeSemanticInputWithPhysiologicalContext(
      overLimit,
      physiologicalContext(),
    );
    assert.deepEqual(compactedWithBody, expectedWithBody);
    assert.equal(
      compactedWithBody.taskMapInput.pointers.some(
        (source) => source.id === originallyEmpty.id,
      ),
      true,
    );
    assert.equal(
      compactedWithBody.taskMapInput.events.some(
        (event) => event.id === contextEvent.id,
      ),
      true,
    );
    assert.equal(
      compactedWithBody.evidenceBindings.some(
        (binding) => binding.disposition === "body_only",
      ),
      true,
    );
    assert.deepEqual(
      buildTaskMapNativeSemanticProjection(compactedWithBody),
      buildTaskMapNativeSemanticProjection(expectedWithBody),
    );

    const malformedRedundant = structuredClone(overLimit);
    const discardedMalformed = malformedRedundant.taskMapInput.events.find(
      (event) => event.id === "calendar-candidate-event-128",
    );
    assert.ok(discardedMalformed);
    discardedMalformed.occurredAt = "not-a-timestamp";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(malformedRedundant),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "harness_rejected",
    );
  });

  it("does not compact a lifecycle event that keeps an older candidate inactive", () => {
    const authority = pointer(
      "source-task-lifecycle",
      "linear",
      "authority",
      "source_system",
    );
    const meeting = pointer(
      "meeting-lifecycle",
      "gemini_meet",
      "meeting",
    );
    const target = {
      ...commitmentEvent(
        "0-candidate-target",
        meeting.id,
        "2026-07-28T19:00:00.000Z",
      ),
      observedAt: AT_10,
    };
    const representative = commitmentEvent(
      "a-candidate-representative",
      meeting.id,
      "2026-07-28T20:00:00.000Z",
    );
    const superseder = {
      ...commitmentEvent(
        "z-candidate-superseder",
        meeting.id,
        "2026-07-28T21:00:00.000Z",
      ),
      observedAt: AT_12,
      supersedesEventId: target.id,
    };
    const expected = buildTaskMapNativeSemanticProjection(artifact(
      taskMapInput(
        AT_12,
        [authority, meeting],
        [authoritativeEvent(authority.id), representative],
      ),
    ));
    const actual = buildTaskMapNativeSemanticProjection(artifact(
      taskMapInput(
        AT_12,
        [authority, meeting],
        [
          authoritativeEvent(authority.id),
          target,
          representative,
          superseder,
        ],
      ),
    ));

    assert.deepEqual(membershipRows(actual), membershipRows(expected));
    assert.deepEqual(
      actual.tasks.find((task) => task.reviewState === "proposed")
        ?.citations.map((citation) => citation.eventId),
      [representative.id],
    );
  });

  it("requires real corroboration for an unowned meeting action", () => {
    const firstMeeting = pointer("meeting-a", "gemini_meet", "2");
    const oneMeeting = artifact(taskMapInput(
      AT_11,
      [firstMeeting],
      [
        commitmentEvent(
          "meeting-action-a",
          firstMeeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    ));
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(oneMeeting),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "no_eligible_work",
    );

    const secondMeeting = pointer("meeting-b", "gemini_meet", "4");
    const corroborated = artifact(taskMapInput(
      AT_11,
      [firstMeeting, secondMeeting],
      [
        {
          ...commitmentEvent(
          "meeting-action-a",
          firstMeeting.id,
          "2026-07-27T19:00:00.000Z",
          ),
          objectRefs: [
            ...commitmentEvent(
              "meeting-action-a",
              firstMeeting.id,
              "2026-07-27T19:00:00.000Z",
            ).objectRefs,
            `external:${"e".repeat(64)}`,
          ],
        },
        {
          ...commitmentEvent(
          "meeting-action-b",
          secondMeeting.id,
          "2026-07-28T19:00:00.000Z",
          "c",
          ),
          objectRefs: [
            ...commitmentEvent(
              "meeting-action-b",
              secondMeeting.id,
              "2026-07-28T19:00:00.000Z",
              "c",
            ).objectRefs,
            `external:${"e".repeat(64)}`,
          ],
        },
      ],
    ));
    const projection = buildTaskMapNativeSemanticProjection(corroborated);
    assert.equal(projection.tasks.length, 1);
    assert.equal(projection.tasks[0].reviewState, "proposed");
    assert.deepEqual(
      projection.tasks[0].originPointerIds,
      ["meeting-a"],
    );
    assert.equal(projection.roots[0].citations.length, 2);

    const provenanceOnly = structuredClone(corroborated);
    provenanceOnly.taskMapInput.events = provenanceOnly.taskMapInput.events.map(
      (event) => ({
        ...event,
        objectRefs: event.objectRefs.filter(
          (objectRef) => !objectRef.startsWith("external:"),
        ),
      }),
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(provenanceOnly),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("treats opaque revision rotation with unchanged content as no semantic delta", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const input = taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    );
    const initialArtifact = artifact(input);
    const projection = buildTaskMapNativeSemanticProjection(initialArtifact);
    const rotatedBindings = initialArtifact.sourceBindings.map((item) => ({
      ...item,
      sourceIdentityDigest: digest("rotated-source-identity"),
      observedRevision: "rotated-revision",
      evidenceRevision: "rotated-revision",
    }));
    const rotated = artifact(structuredClone(input), rotatedBindings);
    rotated.freshness.producedAt = AT_11;
    rotated.freshness.validThrough = AT_15;
    rotated.freshness.assessedAt = AT_12;
    assert.equal(
      rotated.sourceBindings[0].semanticIdentityDigest,
      initialArtifact.sourceBindings[0].semanticIdentityDigest,
    );
    assert.equal(
      rotated.sourceBindings[0].evidenceContentDigest,
      initialArtifact.sourceBindings[0].evidenceContentDigest,
    );
    assert.notEqual(
      rotated.sourceBindings[0].sourceIdentityDigest,
      initialArtifact.sourceBindings[0].sourceIdentityDigest,
    );
    assert.notEqual(
      rotated.sourceBindings[0].observedRevision,
      initialArtifact.sourceBindings[0].observedRevision,
    );

    assert.deepEqual(
      buildTaskMapNativeSemanticProjection(
        rotated,
        predecessorOptions(projection),
      ),
      projection,
    );
  });

  it("fails closed for unavailable or mismatched evidence and missing predecessor work", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const meeting = pointer("meeting-a", "gemini_meet", "2");
    const baselineInput = taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    );
    const unavailable = artifact(baselineInput);
    unavailable.freshness = {
      ...unavailable.freshness,
      decision: "stale",
      available: false,
      retainedLastGood: true,
    };
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(unavailable),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_freshness",
    );

    const mismatched = artifact(baselineInput);
    mismatched.sourceBindings[0].evidenceRevision = "other-revision";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(mismatched),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );

    const expandedInput = taskMapInput(
      AT_11,
      [source, meeting],
      [
        authoritativeEvent(source.id),
        commitmentEvent(
          "meeting-action-a",
          meeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    );
    const expanded = buildTaskMapNativeSemanticProjection(
      artifact(expandedInput),
    );
    const droppedInput = taskMapInput(
      AT_12,
      [source],
      [authoritativeEvent(source.id)],
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        artifact(droppedInput),
        predecessorOptions(expanded),
      ),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "predecessor_continuity_required",
    );
  });

  it("does not relabel historical context as commitments to retain reviewed tasks", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const meeting = pointer("meeting-a", "gemini_meet", "2");
    const reviewedInput = taskMapInput(
      AT_11,
      [source, meeting],
      [
        authoritativeEvent(source.id),
        commitmentEvent(
          "meeting-action-a",
          meeting.id,
          "2026-07-28T19:00:00.000Z",
        ),
      ],
    );
    const predecessor = buildTaskMapNativeSemanticProjection(
      artifact(reviewedInput),
    );
    assert.equal(
      predecessor.tasks.filter((task) => task.reviewState === "proposed").length,
      1,
    );

    const historicalContext = commitmentEvent(
      "meeting-action-a",
      meeting.id,
      "2026-07-28T19:00:00.000Z",
    );
    historicalContext.activity = "context_observed";
    const successorInput = taskMapInput(
      AT_12,
      [source, meeting],
      [authoritativeEvent(source.id), historicalContext],
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        artifact(successorInput),
        predecessorOptions(predecessor),
      ),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "predecessor_continuity_required",
    );
  });

  it("separates candidate identity from root linkage", () => {
    const source = pointer("source-task", "github", "1", "source_system");
    const firstMeeting = pointer("meeting-a", "gemini_meet", "2");
    const secondMeeting = pointer("meeting-b", "gemini_meet", "3");
    const firstAction = commitmentEvent(
      "action-one",
      firstMeeting.id,
      "2026-07-28T18:00:00.000Z",
    );
    const secondAction = {
      ...commitmentEvent(
        "action-two",
        secondMeeting.id,
        "2026-07-28T19:00:00.000Z",
        "c",
      ),
      title: "Write the native integration proof",
      summary: "Produce the isolated package-level replay evidence.",
    };
    const projection = buildTaskMapNativeSemanticProjection(artifact(
      taskMapInput(
        AT_12,
        [source, firstMeeting, secondMeeting],
        [authoritativeEvent(source.id), firstAction, secondAction],
      ),
    ));
    const authoritative = projection.tasks.find(
      (task) => task.reviewState === "accepted",
    );
    const candidates = projection.tasks.filter(
      (task) => task.reviewState === "proposed",
    );
    assert.ok(authoritative);
    assert.equal(candidates.length, 2);
    assert.equal(new Set(candidates.map((task) => task.id)).size, 2);
    assert.deepEqual(
      new Set(candidates.map((task) => task.rootId)),
      new Set([authoritative.rootId]),
    );

    const hiddenExternalRef = artifact(taskMapInput(
      AT_12,
      [source, firstMeeting],
      [authoritativeEvent(source.id), firstAction],
    ));
    const hiddenEvent = hiddenExternalRef.taskMapInput.events.find(
      (event) => event.id === firstAction.id,
    );
    assert.ok(hiddenEvent);
    hiddenEvent.objectRefs.push(`external:${"9".repeat(64)}`);
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(hiddenExternalRef),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("admits a verified Strategy task as source-authoritative work", () => {
    const source = pointer(
      "strategy-task",
      "strategy",
      "1",
      "source_system",
    );
    const projection = buildTaskMapNativeSemanticProjection(artifact(
      taskMapInput(
        AT_12,
        [source],
        [authoritativeEvent(source.id)],
      ),
    ));

    assert.equal(projection.tasks.length, 1);
    assert.equal(projection.tasks[0]?.reviewState, "accepted");
    assert.equal(projection.tasks[0]?.authority, "source_system");
    assert.equal(projection.sources[0]?.sourceKind, "strategy");
  });

  it("keeps source roots independent of candidate population and root-ref order", () => {
    const rootRefX = `external:${"f".repeat(64)}`;
    const rootRefY = `external:${"0".repeat(64)}`;
    const source = pointer("source-bridge", "github", "1", "source_system");
    const firstMeeting = pointer("meeting-root-x", "gemini_meet", "2");
    const secondMeeting = pointer("meeting-root-y", "gemini_meet", "3");
    const sourceEvent = {
      ...authoritativeEvent(source.id),
      id: "source-bridge-created",
      objectRefs: [rootRefX, rootRefY],
    };
    const firstAction = {
      ...commitmentEvent(
        "root-x-action",
        firstMeeting.id,
        "2026-07-27T18:00:00.000Z",
      ),
      objectRefs: [
        rootRefX,
        `canonical-meeting:${"b".repeat(64)}`,
        `source-object:${"b".repeat(64)}`,
      ],
    };
    const secondAction = {
      ...commitmentEvent(
        "root-y-action",
        secondMeeting.id,
        "2026-07-28T18:00:00.000Z",
        "c",
      ),
      objectRefs: [
        rootRefY,
        `canonical-meeting:${"c".repeat(64)}`,
        `source-object:${"c".repeat(64)}`,
      ],
      title: "Prepare the source-root proof",
      summary: "Verify root identity does not depend on candidate support.",
    };
    const g1Artifact = artifact(taskMapInput(
      AT_12,
      [source, firstMeeting],
      [sourceEvent, firstAction],
    ));
    const g1 = buildTaskMapNativeSemanticProjection(g1Artifact);
    const reorderedBindings = structuredClone(g1Artifact);
    const sourceBinding = reorderedBindings.evidenceBindings.find(
      (item) => item.eventId === sourceEvent.id,
    );
    assert.ok(sourceBinding);
    sourceBinding.rootLinkRefs.reverse();
    assert.deepEqual(
      buildTaskMapNativeSemanticProjection(reorderedBindings),
      g1,
    );

    const g2 = buildTaskMapNativeSemanticProjection(
      artifact(taskMapInput(
        AT_12,
        [source, firstMeeting, secondMeeting],
        [sourceEvent, firstAction, secondAction],
      )),
      predecessorOptions(g1),
    );
    const g1Source = g1.tasks.find((task) => task.reviewState === "accepted");
    const g2Source = g2.tasks.find((task) => task.reviewState === "accepted");
    const g1First = g1.tasks.find((task) => task.title === firstAction.title);
    const g2First = g2.tasks.find((task) => task.title === firstAction.title);
    assert.ok(g1Source && g2Source && g1First && g2First);
    assert.equal(g2Source.id, g1Source.id);
    assert.equal(g2Source.rootId, g1Source.rootId);
    assert.equal(g2First.id, g1First.id);
    assert.equal(g2First.rootId, g1First.rootId);
    assert.equal(
      g2.tasks.every((task) => task.rootId === g1Source.rootId),
      true,
    );
  });

  it("never uses a shared root ref as candidate identity or corroboration", () => {
    const first = pointer("meeting-distinct-a", "gemini_meet", "2");
    const second = pointer("meeting-distinct-b", "gemini_meet", "3");
    const firstAction = commitmentEvent(
      "distinct-action-a",
      first.id,
      "2026-07-27T18:00:00.000Z",
    );
    const secondAction = {
      ...commitmentEvent(
        "distinct-action-b",
        second.id,
        "2026-07-28T18:00:00.000Z",
        "c",
      ),
      title: "A different explicit action",
      summary: "Sharing an external root does not make this the same work item.",
    };
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(artifact(taskMapInput(
        AT_12,
        [first, second],
        [firstAction, secondAction],
      ))),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "no_eligible_work",
    );
  });

  it("counts provider variants of one canonical meeting only once", () => {
    const gemini = pointer("meeting-gemini", "gemini_meet", "2");
    const granola = pointer("meeting-granola", "granola", "3");
    const input = taskMapInput(
      AT_12,
      [gemini, granola],
      [
        {
          ...commitmentEvent(
          "variant-gemini",
          gemini.id,
          "2026-07-27T19:00:00.000Z",
          ),
          objectRefs: [
            `canonical-meeting:${"b".repeat(64)}`,
            `source-object:${"b".repeat(64)}`,
          ],
        },
        {
          ...commitmentEvent(
          "variant-granola",
          granola.id,
          "2026-07-27T19:00:00.000Z",
          ),
          objectRefs: [
            `canonical-meeting:${"b".repeat(64)}`,
            `source-object:${"b".repeat(64)}`,
          ],
        },
      ],
    );
    const sameCanonicalOrigin = input.pointers.map((item) =>
      binding(item, `revision-${item.id}`, "b".repeat(64))
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        artifact(input, sameCanonicalOrigin),
      ),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "no_eligible_work",
    );

    const forgedDifferentOrigins = input.pointers.map((item, index) =>
      binding(
        item,
        `revision-${item.id}`,
        index === 0 ? "forged-origin-a" : "forged-origin-b",
      )
    );
    const forgedDifferentDates = structuredClone(input);
    forgedDifferentDates.events[1].occurredAt =
      "2026-07-28T19:00:00.000Z";
    forgedDifferentDates.events[1].dayKey = "2026-07-28";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(
        artifact(forgedDifferentDates, forgedDifferentOrigins),
      ),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("rejects context self-labelled as source-owned work", () => {
    const forged = pointer(
      "forged-meeting-task",
      "gemini_meet",
      "2",
      "source_system",
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(artifact(taskMapInput(
        AT_12,
        [forged],
        [authoritativeEvent(forged.id)],
      ))),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_source_binding",
    );
  });

  it("requires an authenticated predecessor digest and exact safe values", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const input = artifact(taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    ));
    const predecessor = buildTaskMapNativeSemanticProjection(input);
    const tampered = structuredClone(predecessor);
    tampered.tasks[0].title = "Tampered predecessor title";
    (tampered.privacy as { sourceBodiesStored: boolean })
      .sourceBodiesStored = true;
    assert.ok(tampered.brain);
    tampered.brain.outputDigest = "x";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(input, {
        previousProjection: tampered,
        previousProjectionDigest:
          predecessorOptions(predecessor).previousProjectionDigest,
      }),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_predecessor",
    );
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(input, {
        previousProjection: predecessor,
      }),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_predecessor",
    );
  });

  it("rejects unsupported producer or non-four-hour freshness", () => {
    const source = pointer("source-task", "linear", "1", "source_system");
    const input = artifact(taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    ));
    (input.producer as { id: string; version: string }).version =
      "future-v999";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(input),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_contract",
    );
    const longLived = artifact(taskMapInput(
      AT_10,
      [source],
      [authoritativeEvent(source.id)],
    ));
    longLived.freshness.validThrough = "2027-07-29T10:00:00.000Z";
    assert.throws(
      () => buildTaskMapNativeSemanticProjection(longLived),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "invalid_freshness",
    );
  });

  it("keeps candidate identity stable across facet updates and a third corroborating meeting", () => {
    const first = pointer("meeting-a", "gemini_meet", "2");
    const second = pointer("meeting-b", "gemini_meet", "3");
    const third = pointer("aaa-later-meeting", "gemini_meet", "4");
    const firstOccurrence = commitmentEvent(
      "action-a-open",
      first.id,
      "2026-07-26T19:00:00.000Z",
    );
    const secondOccurrence = commitmentEvent(
      "action-b",
      second.id,
      "2026-07-27T19:00:00.000Z",
      "c",
    );
    const g1Input = artifact(taskMapInput(
      AT_12,
      [first, second],
      [firstOccurrence, secondOccurrence],
    ));
    const g1 = buildTaskMapNativeSemanticProjection(g1Input);
    assert.equal(g1.tasks.length, 1);
    const updatedFirst = {
      ...firstOccurrence,
      id: "action-a-done",
      sourceStatus: "completed" as const,
      deadlineAt: "2026-08-01T17:00:00.000Z",
    };
    const thirdOccurrence = commitmentEvent(
      "action-c",
      third.id,
      "2026-07-28T19:00:00.000Z",
      "0",
    );
    const g2Input = artifact(taskMapInput(
      AT_12,
      [first, second, third],
      [updatedFirst, secondOccurrence, thirdOccurrence],
    ));
    const g2WithoutPredecessor =
      buildTaskMapNativeSemanticProjection(g2Input);
    const g2 = buildTaskMapNativeSemanticProjection(
      g2Input,
      predecessorOptions(g1),
    );
    assert.equal(g2.tasks.length, 1);
    assert.equal(g2.tasks[0].id, g1.tasks[0].id);
    assert.equal(g2.tasks[0].rootId, g1.tasks[0].rootId);
    assert.equal(g2WithoutPredecessor.tasks[0].id, g1.tasks[0].id);
    assert.equal(g2WithoutPredecessor.tasks[0].rootId, g1.tasks[0].rootId);
    assert.equal(g2.tasks[0].citations.length, 1);
    assert.equal(g2.roots[0].citations.length, 3);
    const delta = diffTaskMapProjections(g1, g2);
    assert.equal(delta.added.some((item) => item.kind === "task"), false);
    assert.equal(delta.removed.some((item) => item.kind === "task"), false);
    assert.equal(delta.changed.some((item) => item.kind === "root"), true);
  });

  it("converts the authenticated producer field without splitting an open-to-done content update", () => {
    const firstOpen = producerMeeting(
      "document-a",
      "2026-07-27T19:00:00.000Z",
    );
    const second = producerMeeting(
      "document-b",
      "2026-07-28T19:00:00.000Z",
    );
    const g1Producer = producerResult([firstOpen, second]);
    const g1Input = taskMapNativeSemanticInputFromMeetingProducerResult(
      g1Producer.result,
      g1Producer.ownerScopeDigest,
    );
    const g1 = buildTaskMapNativeSemanticProjectionFromMeetingProducerResult(
      g1Producer.result,
      { expectedOwnerScopeDigest: g1Producer.ownerScopeDigest },
    );

    const firstDone = producerMeeting(
      "document-a",
      "2026-07-27T19:00:00.000Z",
      {
        revisionId: "rotated-opaque-revision",
        contentDigest: digest("updated-structured-content"),
        status: "done",
        deadline: "2026-08-01T17:00:00.000Z",
      },
    );
    const g2Producer = producerResult(
      [firstDone, second],
      "2026-07-29T13:00:00.000Z",
      "2026-07-29T14:00:00.000Z",
    );
    const g2Input = taskMapNativeSemanticInputFromMeetingProducerResult(
      g2Producer.result,
      g2Producer.ownerScopeDigest,
    );
    const g2 = buildTaskMapNativeSemanticProjectionFromMeetingProducerResult(
      g2Producer.result,
      {
        expectedOwnerScopeDigest: g2Producer.ownerScopeDigest,
        ...predecessorOptions(g1),
      },
    );

    const g1First = g1Input.sourceBindings.find(
      (binding) =>
        binding.evidenceContentDigest === digest("content-document-a"),
    );
    assert.ok(g1First);
    const g2First = g2Input.sourceBindings.find(
      (binding) => binding.semanticOriginId === g1First.semanticOriginId,
    );
    assert.ok(g2First);
    assert.equal(
      g2First.semanticIdentityDigest,
      g1First.semanticIdentityDigest,
    );
    assert.notEqual(
      g2First.sourceIdentityDigest,
      g1First.sourceIdentityDigest,
    );
    assert.notEqual(
      g2First.evidenceContentDigest,
      g1First.evidenceContentDigest,
    );
    const g1Candidate = g1Input.evidenceBindings.find(
      (binding) => binding.disposition === "candidate_only",
    );
    const g2Candidate = g2Input.evidenceBindings.find(
      (binding) => binding.disposition === "candidate_only",
    );
    assert.ok(g1Candidate?.candidateIdentityRef);
    const g1SnapshotEvidence =
      g1Producer.result.snapshot?.meetings[0]?.evidence[0];
    assert.ok(g1SnapshotEvidence?.statementReferenceDigest);
    assert.equal(
      g1Candidate.candidateIdentityRef,
      `external:${g1SnapshotEvidence.statementReferenceDigest}`,
    );
    assert.deepEqual(
      g1Candidate.rootLinkRefs,
      g1SnapshotEvidence.objectRefs
        .filter((ref) =>
          ref.kind === "external_reference"
          && ref.referenceDigest
            !== g1SnapshotEvidence.statementReferenceDigest
        )
        .map((ref) => `external:${ref.referenceDigest}`)
        .sort(),
    );
    assert.equal(
      g2Candidate?.candidateIdentityRef,
      g1Candidate.candidateIdentityRef,
    );
    assert.equal(g2.tasks.length, 1);
    assert.equal(g2.tasks[0].id, g1.tasks[0].id);
    assert.equal(g2.tasks[0].rootId, g1.tasks[0].rootId);
    const delta = diffTaskMapProjections(g1, g2);
    assert.equal(delta.added.some((item) => item.kind === "task"), false);
    assert.equal(delta.removed.some((item) => item.kind === "task"), false);
    assert.equal(delta.changed.length > 0, true);
  });

  it("merges owner physiological context and returns one fixed-policy per-root non-match without trying another category", () => {
    const producer = producerResult([
      producerMeeting(
        "document-a",
        "2026-07-27T19:00:00.000Z",
        { coverage: "complete" },
      ),
      producerMeeting(
        "document-b",
        "2026-07-28T20:00:00.000Z",
        { coverage: "complete" },
      ),
    ]);
    const meetingOnlyInput =
      taskMapNativeSemanticInputFromMeetingProducerResult(
        producer.result,
        producer.ownerScopeDigest,
      );
    assert.deepEqual(
      [...new Set(meetingOnlyInput.taskMapInput.pointers.map(
        (pointer) => pointer.sourceKind,
      ))],
      ["gemini_meet"],
    );
    assert.equal(
      meetingOnlyInput.taskMapInput.events.filter(
        (event) => event.recordKind === "receipt",
      ).length,
      0,
    );
    const result =
      buildTaskMapNativeSemanticProjectionFromMeetingAndPhysiologicalContext(
        producer.result,
        physiologicalContext(),
        { expectedOwnerScopeDigest: producer.ownerScopeDigest },
      );

    assert.equal(
      result.contractVersion,
      TASKMAP_NATIVE_BODY_PATTERN_BUILD_VERSION,
    );
    assert.equal(result.projection.runStatus, "accepted");
    assert.equal(result.projection.roots.length, 1);
    assert.equal(result.projection.roots[0].bodyContextCount, 1);
    assert.match(
      result.bodyPatternResults[0].rootProposalId,
      /^baseline-root_[a-f0-9]{16}$/,
    );
    assert.deepEqual(result.bodyPatternResults, [{
      contractVersion: "taskmap-body-pattern-result.v1",
      policyVersion: "taskmap-owner-body-pattern-policy.1",
      rootProposalId: result.bodyPatternResults[0].rootProposalId,
      bodyAxis: "composite_recovery",
      bodyCategory: "below_baseline",
      status: "no_repeated_pattern",
      observedTargetDates: ["2026-07-28"],
      comparableTargetDates: [],
      matchedDates: [],
      matchedDateCount: 0,
      comparableReferenceDates: [],
      reasonCode: "no_comparable_source_day_coverage",
      reason:
        "No day had complete coverage for every required work source and the fixed two-source minimum.",
    }]);
    assert.doesNotMatch(
      result.bodyPatternResults[0].reason,
      /\b(?:causal|C0|C2)\b/i,
    );
  });

  it("preserves accepted manual authority while merging physiological context", () => {
    const producer = producerResult([
      speechActProducerMeeting("accepted-body-document"),
    ]);
    const overlay = buildTaskMapNativeCandidateReview({
      result: producer.result,
      previous: null,
      expectedOwnerScopeDigest: producer.ownerScopeDigest,
      assessedAt: AT_14,
    });
    const shelf = buildTaskMapNativeCandidateShelf(
      producer.result,
      overlay,
      AT_14,
    );
    const candidate = shelf.candidates[0];
    assert.ok(candidate);
    const promotion = promoteTaskMapNativeCandidate({
      result: producer.result,
      overlay,
      previousStore: null,
      expectedOwnerScopeDigest: producer.ownerScopeDigest,
      assessedAt: AT_14,
      candidateId: candidate.candidateId,
      expectedCandidateRevisionDigest: candidate.candidateRevisionDigest,
      expectedStatementReferenceDigest: candidate.statementReferenceDigest,
      expectedEvidenceProofDigests: candidate.evidenceProofDigests,
      idempotencyKeyDigest: digest("accepted-body-owner-confirmation"),
      confirmedAt: AT_15,
    });
    const accepted = mergeTaskMapNativeCandidateAcceptanceIntoSemanticInput(
      taskMapNativeSemanticInputFromMeetingProducerResult(
        producer.result,
        producer.ownerScopeDigest,
      ),
      promotion.store,
    );

    const merged = taskMapNativeSemanticInputWithPhysiologicalContext(
      accepted,
      physiologicalContext(),
      promotion.store,
    );
    assert.equal(
      merged.taskMapInput.pointers.some(
        (source) => source.sourceKind === "manual",
      ),
      true,
    );
    assert.equal(
      merged.taskMapInput.events.some(
        (event) => event.recordKind === "body_context",
      ),
      true,
    );
    assert.doesNotThrow(() => buildTaskMapNativeSemanticProjection(
      merged,
      { candidateAcceptanceStore: promotion.store },
    ));
  });

  it("maps a fresh-empty producer deterministically and reports no eligible work", () => {
    const empty = producerResult([]);
    const mapped = taskMapNativeSemanticInputFromMeetingProducerResult(
      empty.result,
      empty.ownerScopeDigest,
    );
    assert.equal(
      mapped.taskMapInput.generatedAt,
      empty.result.snapshot?.producedAt,
    );
    assert.deepEqual(mapped.taskMapInput.pointers, []);
    assert.deepEqual(mapped.taskMapInput.events, []);
    assert.throws(
      () => buildTaskMapNativeSemanticProjectionFromMeetingProducerResult(
        empty.result,
        { expectedOwnerScopeDigest: empty.ownerScopeDigest },
      ),
      (error: unknown) =>
        error instanceof TaskMapNativeSemanticBuilderUnavailableError
        && error.code === "no_eligible_work",
    );
  });
});
