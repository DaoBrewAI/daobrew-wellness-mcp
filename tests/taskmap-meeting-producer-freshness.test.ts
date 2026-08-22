import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
  TASKMAP_MEETING_PRODUCER_LIMITS_V1,
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  assertTaskMapMeetingProducerSnapshot,
  assessTaskMapMeetingProducerSnapshot,
  buildTaskMapMeetingProducerSnapshot,
  loadTaskMapMeetingProducerResult,
  taskMapMeetingObligationGate,
  taskMapMeetingProducerLastGoodRef,
  taskMapMeetingProducerSnapshotPath,
  taskMapMeetingStatementReferenceDigest,
  type TaskMapMeetingProducerMeetingDraftV1,
  type TaskMapMeetingProducerSnapshotDraftV1,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  testOwnerScopeDigest as taskMapMeetingProducerOwnerScopeDigest,
} from "./support/confirmed-owner.js";
import type {
  TaskMapSourceAuthorityBindingV1,
  TaskMapSourceKind,
} from "../src/engine/taskmap/types.js";
import { toWellFormedText } from "../src/engine/taskmap/text-contract.js";

const tempRoots: string[] = [];
const PRODUCED_AT = "2026-07-29T12:00:00.000Z";
const VALID_THROUGH = "2026-07-29T16:00:00.000Z";

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function binding(
  sourceKind: Extract<TaskMapSourceKind, "gemini_meet" | "granola">,
): TaskMapSourceAuthorityBindingV1 {
  return {
    connectionId: `${sourceKind}-owner`,
    sourceKind,
    tenantOrWorkspaceDigest: digest(`${sourceKind}-workspace`),
    accountOrPrincipalDigest: digest(`${sourceKind}-principal`),
    grantVersion: "grant-1",
  };
}

function evidence(summary = "Ship the freshness-gated producer contract") {
  return {
    kind: "action_item" as const,
    title: "Freeze meeting producer",
    summary,
    occurredAt: "2026-07-29T09:00:00.000Z",
    observedAt: "2026-07-29T11:00:00.000Z",
    status: "open" as const,
    deadline: "2026-07-30T17:00:00.000Z",
    quality: "structured_generated" as const,
    coverage: "partial" as const,
    confidence: 0.8,
    objectRefs: [{
      kind: "external_reference" as const,
      referenceDigest: digest("external-task"),
    }],
  };
}

function meeting(
  overrides: Partial<TaskMapMeetingProducerMeetingDraftV1> = {},
): TaskMapMeetingProducerMeetingDraftV1 {
  return {
    binding: binding("gemini_meet"),
    documentId: "doc-secret-owner-only",
    revisionId: "opaque-revision-secret-1",
    contentDigest: digest("bounded-structured-content"),
    modifiedAt: "2026-07-29T10:00:00.000Z",
    eventTime: "2026-07-29T09:00:00.000Z",
    observedAt: "2026-07-29T11:00:00.000Z",
    evidence: [evidence()],
    ...overrides,
  };
}

function draft(
  meetings = [meeting()],
): TaskMapMeetingProducerSnapshotDraftV1 {
  return {
    ownerScopeDigest: taskMapMeetingProducerOwnerScopeDigest("owner"),
    producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
    producedAt: PRODUCED_AT,
    meetings,
  };
}

function freshSnapshot() {
  return buildTaskMapMeetingProducerSnapshot(draft());
}

function speechActEvidence() {
  return {
    ...evidence("Please ship the normalized meeting mention."),
    kind: "action_item" as const,
    title: "Ship the normalized mention",
    speechActClass: "request" as const,
    speechActActor: "self" as const,
    mentionIdentityDigest: digest("normalized-meeting-mention"),
    extractionEnvelopeDigest: digest("complete-extraction-envelope"),
    confidence: 0.73,
  };
}

function speechActEvidenceFor(
  speechActClass: "request" | "commitment" | "decision" | "other",
  speechActActor: "self" | "other" | "unknown",
  index: number,
) {
  const kind = speechActClass === "commitment"
    ? "commitment" as const
    : speechActClass === "decision"
      ? "decision" as const
      : "action_item" as const;
  return {
    ...evidence(`Verbatim ${speechActClass} ${speechActActor} ${index}.`),
    kind,
    title: `${speechActClass} ${speechActActor} ${index}`,
    speechActClass,
    speechActActor,
    mentionIdentityDigest: digest(`mention-${index}`),
    extractionEnvelopeDigest: digest(`envelope-${index}`),
    confidence: (index + 1) / 20,
  };
}

function tempFile(filename: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "taskmap-meeting-producer-"));
  tempRoots.push(root);
  return path.join(root, filename);
}

describe("Task Map meeting producer freshness", () => {
  it("normalizes and UTF-16 bounds semantic display text before sealing", () => {
    const loneHighSurrogate = String.fromCharCode(0xd83d);
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [{
        ...evidence(`${"😀".repeat(120)}${loneHighSurrogate}`),
        title: `${"😀".repeat(60)}${loneHighSurrogate}`,
      }],
    })]));
    const row = snapshot.meetings[0].evidence[0];

    assert.ok(row.title.length <= TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxTitleCharacters);
    assert.ok(row.summary.length <= TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters);
    assert.equal(toWellFormedText(row.title), row.title);
    assert.equal(toWellFormedText(row.summary), row.summary);
    assert.equal(row.title.endsWith("…"), true);
    assert.equal(row.summary.endsWith("…"), true);
  });

  it("routes every speech-act/actor cell through one exhaustive obligation gate", () => {
    const expected = [
      ["request", "self", "explicit_commitment", "candidate_only", true],
      ["request", "other", "provider_generated_summary", "candidate_only", false],
      ["request", "unknown", "provider_generated_summary", "candidate_only", false],
      ["commitment", "self", "explicit_commitment", "candidate_only", true],
      ["commitment", "other", "provider_generated_summary", "candidate_only", false],
      ["commitment", "unknown", "provider_generated_summary", "candidate_only", false],
      ["decision", "self", "context_only", "context_only", false],
      ["decision", "other", "context_only", "context_only", false],
      ["decision", "unknown", "context_only", "context_only", false],
      ["other", "self", "provider_generated_summary", "candidate_only", false],
      ["other", "other", "provider_generated_summary", "candidate_only", false],
      ["other", "unknown", "provider_generated_summary", "candidate_only", false],
    ] as const;

    assert.deepEqual(
      expected.map(([speechActClass, speechActActor]) => ({
        speechActClass,
        speechActActor,
        ...taskMapMeetingObligationGate(speechActClass, speechActActor),
      })),
      expected.map(([
        speechActClass,
        speechActActor,
        authority,
        proposalDisposition,
        promotionEligible,
      ]) => ({
        speechActClass,
        speechActActor,
        authority,
        proposalDisposition,
        promotionEligible,
      })),
    );
  });

  it("derives persisted authority, disposition, and eligibility for all 12 cells", () => {
    const classes = ["request", "commitment", "decision", "other"] as const;
    const actors = ["self", "other", "unknown"] as const;
    const evidenceRows = classes.flatMap((speechActClass, classIndex) =>
      actors.map((speechActActor, actorIndex) =>
        speechActEvidenceFor(
          speechActClass,
          speechActActor,
          classIndex * actors.length + actorIndex,
        )
      )
    );
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: evidenceRows,
    })]));

    assert.equal(snapshot.meetings[0].evidence.length, 12);
    assert.equal(
      snapshot.meetings[0].evidence.filter((row) => row.promotionEligible)
        .length,
      2,
    );
    for (const row of snapshot.meetings[0].evidence) {
      assert.ok(row.speechActClass);
      assert.ok(row.speechActActor);
      assert.deepEqual({
        authority: row.authority,
        proposalDisposition: row.proposalDisposition,
        promotionEligible: row.promotionEligible,
      }, taskMapMeetingObligationGate(row.speechActClass, row.speechActActor));
    }
    assertTaskMapMeetingProducerSnapshot(snapshot);
  });

  it("rejects caller eligibility and forged persisted obligation fields", () => {
    const callerControlled = {
      ...speechActEvidence(),
      promotionEligible: true,
    };
    assert.throws(
      () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
        evidence: [callerControlled],
      })])),
      /unsupported key/i,
    );

    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [speechActEvidence()],
    })]));
    const mutations = [
      (row: typeof snapshot.meetings[0]["evidence"][number]) => {
        row.authority = "provider_generated_summary";
      },
      (row: typeof snapshot.meetings[0]["evidence"][number]) => {
        row.proposalDisposition = "context_only";
      },
      (row: typeof snapshot.meetings[0]["evidence"][number]) => {
        row.promotionEligible = false;
      },
    ];
    for (const mutate of mutations) {
      const forged = structuredClone(snapshot);
      mutate(forged.meetings[0].evidence[0]);
      assert.throws(
        () => assertTaskMapMeetingProducerSnapshot(forged),
        /authority|semantic identity|promotion/i,
      );
    }
  });

  it("gives provenance decisions a normalized statement proof but leaves legacy decisions null", () => {
    const newDecision = speechActEvidenceFor("decision", "unknown", 10);
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [newDecision, {
        ...evidence("Keep the legacy decision proof contract"),
        kind: "decision",
        objectRefs: undefined,
      }],
    })]));
    const provenance = snapshot.meetings[0].evidence.find(
      (row) => row.speechActClass === "decision",
    );
    const legacy = snapshot.meetings[0].evidence.find(
      (row) => row.kind === "decision" && row.speechActClass === undefined,
    );

    assert.ok(provenance?.statementReferenceDigest);
    assert.equal(provenance.proposalDisposition, "context_only");
    assert.equal(provenance.promotionEligible, false);
    assert.ok(provenance.objectRefs.some((ref) =>
      ref.kind === "external_reference"
      && ref.referenceDigest === provenance.statementReferenceDigest
    ));
    assert.equal(legacy?.statementReferenceDigest, null);
    assert.equal(
      legacy?.objectRefs.some((ref) => ref.kind === "external_reference"),
      false,
    );
  });

  it("preserves hard-coded legacy identities, authority, and snapshot proof byte-for-byte", () => {
    const snapshot = buildTaskMapMeetingProducerSnapshot({
      ownerScopeDigest:
        "fef82909c26b1c0cb08840a6e674fd7650c6d20bf5905615665e192282bd6477",
      producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
      producedAt: PRODUCED_AT,
      meetings: [meeting()],
    });
    const row = snapshot.meetings[0].evidence[0];

    assert.deepEqual({
      statementReferenceDigest: row.statementReferenceDigest,
      evidenceDigest: row.evidenceDigest,
      evidenceId: row.evidenceId,
      snapshotDigest: snapshot.snapshotDigest,
      snapshotId: snapshot.snapshotId,
      authority: row.authority,
    }, {
      statementReferenceDigest:
        "3f42f527e196fda5c92406f3494cb2ff09c8ce9c21ef45215149b39a338d1b12",
      evidenceDigest:
        "593287d0409d92313437d485d5e208aa8c007c623d36acbd62e7c6fe903a4cfd",
      evidenceId: "tmpe_f665115dbb4c37e9",
      snapshotDigest:
        "3d276ac6b5cae9466ecbb46ad083758e900c4d808bc6ee2891957970b50fa003",
      snapshotId: "tmps_20a84ac1356c8c16",
      authority: "provider_generated_summary",
    });
    assert.equal(Object.hasOwn(row, "speechActClass"), false);
    assert.equal(Object.hasOwn(row, "mentionIdentityDigest"), false);
  });

  it("round-trips the all-or-none speech-act provenance with explicit model confidence", () => {
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [speechActEvidence()],
    })]));
    const row = snapshot.meetings[0].evidence[0];

    assert.equal(row.speechActClass, "request");
    assert.equal(row.speechActActor, "self");
    assert.equal(
      row.mentionIdentityDigest,
      digest("normalized-meeting-mention"),
    );
    assert.equal(
      row.extractionEnvelopeDigest,
      digest("complete-extraction-envelope"),
    );
    assert.equal(row.confidence, 0.73);
    assertTaskMapMeetingProducerSnapshot(snapshot);
  });

  it("rejects partial speech-act provenance and speech-act rows without own confidence", () => {
    for (const missing of [
      "speechActClass",
      "speechActActor",
      "mentionIdentityDigest",
      "extractionEnvelopeDigest",
    ] as const) {
      const partial = speechActEvidence();
      Reflect.deleteProperty(partial, missing);
      assert.throws(
        () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
          evidence: [partial],
        })])),
        /speech-act provenance/i,
      );
    }

    const withoutConfidence = speechActEvidence();
    Reflect.deleteProperty(withoutConfidence, "confidence");
    assert.throws(
      () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
        evidence: [withoutConfidence],
      })])),
      /speech-act.*confidence|confidence.*speech-act/i,
    );

    const undefinedConfidence = {
      ...speechActEvidence(),
      confidence: undefined,
    };
    assert.throws(
      () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
        evidence: [undefinedConfidence],
      })])),
      /speech-act.*confidence|confidence.*speech-act|confidence.*number|confidence.*between/i,
    );
  });

  it("rejects speech-act provenance inconsistent with its legacy evidence kind", () => {
    for (const [speechActClass, kind] of [
      ["request", "commitment"],
      ["other", "decision"],
      ["commitment", "action_item"],
      ["decision", "commitment"],
    ] as const) {
      assert.throws(
        () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
          evidence: [{
            ...speechActEvidence(),
            speechActClass,
            kind,
          }],
        })])),
        /speech-act class.*kind/i,
      );
    }
  });

  it("uses normalized mention identity plus sorted explicit work refs for only new statement identities", () => {
    const explicitRef = digest("explicit-work-one");
    const secondExplicitRef = digest("explicit-work-two");
    const rowFor = (
      overrides: Partial<ReturnType<typeof speechActEvidence>> = {},
    ) => buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [{
        ...speechActEvidence(),
        objectRefs: [{
          kind: "external_reference" as const,
          referenceDigest: explicitRef,
        }],
        ...overrides,
      }],
    })])).meetings[0].evidence[0];
    const original = rowFor();
    const displayRotated = rowFor({
      title: "A different bounded display title",
      summary: "A different bounded display summary.",
    });
    const mentionRotated = rowFor({
      mentionIdentityDigest: digest("different-normalized-mention"),
    });
    const refsRotated = rowFor({
      objectRefs: [
        { kind: "external_reference", referenceDigest: secondExplicitRef },
        { kind: "external_reference", referenceDigest: explicitRef },
      ],
    });
    const refsReordered = rowFor({
      objectRefs: [
        { kind: "external_reference", referenceDigest: explicitRef },
        { kind: "external_reference", referenceDigest: secondExplicitRef },
      ],
    });

    assert.equal(
      original.statementReferenceDigest,
      displayRotated.statementReferenceDigest,
    );
    assert.notEqual(original.evidenceDigest, displayRotated.evidenceDigest);
    assert.notEqual(
      original.statementReferenceDigest,
      mentionRotated.statementReferenceDigest,
    );
    assert.notEqual(
      original.statementReferenceDigest,
      refsRotated.statementReferenceDigest,
    );
    assert.equal(
      refsRotated.statementReferenceDigest,
      refsReordered.statementReferenceDigest,
    );
    assert.equal(
      original.statementReferenceDigest,
      taskMapMeetingStatementReferenceDigest({
        kind: "action_item",
        title: original.title,
        summary: original.summary,
        explicitExternalReferenceDigests: [explicitRef],
        mentionIdentityDigest: digest("normalized-meeting-mention"),
      }),
    );
  });

  it("binds every new provenance field into authenticated evidence", () => {
    const original = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [speechActEvidence()],
    })]));
    const mutations = [
      (row: typeof original.meetings[0]["evidence"][number]) => {
        row.speechActClass = "other";
      },
      (row: typeof original.meetings[0]["evidence"][number]) => {
        row.speechActActor = "unknown";
      },
      (row: typeof original.meetings[0]["evidence"][number]) => {
        row.mentionIdentityDigest = digest("forged-mention");
      },
      (row: typeof original.meetings[0]["evidence"][number]) => {
        row.extractionEnvelopeDigest = digest("forged-envelope");
      },
    ];

    for (const mutate of mutations) {
      const forged = structuredClone(original);
      mutate(forged.meetings[0].evidence[0]);
      assert.throws(
        () => assertTaskMapMeetingProducerSnapshot(forged),
        /statement ref|semantic identity|promotion/i,
      );
    }
  });

  it("builds a revision-bound, privacy-bounded v1 snapshot and returns it only while fresh", () => {
    const snapshot = freshSnapshot();
    assert.equal(
      snapshot.contractVersion,
      TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION,
    );
    assert.equal(snapshot.producerVersion, TASKMAP_MEETING_PRODUCER_VERSION);
    assert.equal(snapshot.maxAgeMs, TASKMAP_MEETING_PRODUCER_MAX_AGE_MS);
    assert.equal(snapshot.validThrough, VALID_THROUGH);
    assert.equal(snapshot.meetings[0].sourceVariants[0].sourceKind, "gemini_meet");
    assert.equal(snapshot.meetings[0].evidence[0].recordKind, "work_context");
    assert.equal(
      snapshot.meetings[0].evidence[0].proposalDisposition,
      "candidate_only",
    );
    assert.equal(
      snapshot.meetings[0].evidence[0].authority,
      "provider_generated_summary",
    );
    assert.ok(snapshot.meetings[0].evidence[0].statementReferenceDigest);
    assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some(
      (ref) =>
        ref.kind === "external_reference"
        && ref.referenceDigest
          === snapshot.meetings[0].evidence[0].statementReferenceDigest,
    ));
    assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some(
      (ref) => ref.kind === "canonical_meeting",
    ));
    assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some(
      (ref) => ref.kind === "source_object",
    ));

    const result = assessTaskMapMeetingProducerSnapshot(
      snapshot,
      "2026-07-29T15:59:59.999Z",
    );
    assert.equal(result.contractVersion, TASKMAP_MEETING_PRODUCER_RESULT_VERSION);
    assert.equal(result.availability, "available");
    assert.equal(result.freshness.decision, "fresh");
    assert.equal(result.freshness.currentSemanticInputEligible, true);
    assert.equal(result.snapshot?.snapshotDigest, snapshot.snapshotDigest);
    assert.equal(result.retainedLastGood, null);
  });

  it("uses a half-open four-hour interval and makes boundary/stale snapshots unavailable", () => {
    const snapshot = freshSnapshot();
    const boundary = assessTaskMapMeetingProducerSnapshot(
      snapshot,
      VALID_THROUGH,
    );
    assert.equal(boundary.availability, "unavailable");
    assert.equal(boundary.freshness.decision, "boundary_due");
    assert.equal(boundary.snapshot, null);
    assert.deepEqual(
      {
        snapshotDigest: boundary.retainedLastGood?.snapshotDigest,
        eligible: boundary.retainedLastGood?.eligibleForCurrentSemanticInput,
      },
      {
        snapshotDigest: snapshot.snapshotDigest,
        eligible: false,
      },
    );

    const stale = assessTaskMapMeetingProducerSnapshot(
      snapshot,
      "2026-07-29T16:00:00.001Z",
    );
    assert.equal(stale.availability, "unavailable");
    assert.equal(stale.freshness.decision, "stale");
    assert.equal(stale.freshness.ageMs, TASKMAP_MEETING_PRODUCER_MAX_AGE_MS + 1);
    assert.equal(stale.snapshot, null);
    assert.equal(stale.retainedLastGood?.retainedBecause, "stale");
  });

  it("keeps a complete zero-meeting observation fresh-empty and distinct from a missing snapshot", async () => {
    const empty = buildTaskMapMeetingProducerSnapshot(draft([]));
    assert.deepEqual(empty.meetings, []);
    assert.equal(empty.watermark.observedThrough, empty.producedAt);
    const file = tempFile("fresh-empty.json");
    writeFileSync(file, JSON.stringify(empty), { mode: 0o600 });
    chmodSync(file, 0o600);
    const loadedEmpty = await loadTaskMapMeetingProducerResult({
      snapshotPath: file,
      assessedAt: "2026-07-29T13:00:00.000Z",
      expectedOwnerScopeDigest:
        taskMapMeetingProducerOwnerScopeDigest("owner"),
    });
    assert.equal(loadedEmpty.availability, "available");
    assert.equal(loadedEmpty.freshness.decision, "fresh");
    assert.deepEqual(loadedEmpty.snapshot?.meetings, []);

    const missing = await loadTaskMapMeetingProducerResult({
      snapshotPath: tempFile("does-not-exist.json"),
      assessedAt: "2026-07-29T13:00:00.000Z",
      expectedOwnerScopeDigest:
        taskMapMeetingProducerOwnerScopeDigest("owner"),
    });
    assert.equal(missing.availability, "unavailable");
    assert.equal(missing.freshness.decision, "missing");
    assert.equal(missing.snapshot, null);
  });

  it("fails closed for missing, unknown-version, malformed, and retained-last-good inputs", async () => {
    const prior = taskMapMeetingProducerLastGoodRef(freshSnapshot());
    const missing = await loadTaskMapMeetingProducerResult({
      snapshotPath: tempFile("missing.json"),
      assessedAt: "2026-07-29T17:00:00.000Z",
      retainedLastGood: prior,
    });
    assert.equal(missing.freshness.decision, "missing");
    assert.equal(missing.snapshot, null);
    assert.equal(missing.retainedLastGood?.snapshotDigest, prior.snapshotDigest);
    assert.equal(
      missing.retainedLastGood?.eligibleForCurrentSemanticInput,
      false,
    );

    const unknown = structuredClone(freshSnapshot()) as unknown as {
      producerVersion: string;
    };
    unknown.producerVersion = "taskmap-meeting-producer.future";
    const unknownResult = assessTaskMapMeetingProducerSnapshot(
      unknown,
      "2026-07-29T13:00:00.000Z",
      prior,
    );
    assert.equal(unknownResult.freshness.decision, "unknown_version");
    assert.equal(unknownResult.snapshot, null);
    assert.equal(
      unknownResult.retainedLastGood?.snapshotDigest,
      prior.snapshotDigest,
    );

    const malformed = structuredClone(freshSnapshot()) as unknown as {
      meetings: unknown[];
    };
    malformed.meetings = [{ transcript: "private raw transcript" }];
    const malformedResult = assessTaskMapMeetingProducerSnapshot(
      malformed,
      "2026-07-29T13:00:00.000Z",
      prior,
    );
    assert.equal(malformedResult.freshness.decision, "malformed");
    assert.equal(malformedResult.snapshot, null);
    assert.equal(
      malformedResult.retainedLastGood?.eligibleForCurrentSemanticInput,
      false,
    );
  });

  it("dedupes the same Gemini/Granola evidence as variants of one canonical meeting", () => {
    const sharedEvidence = evidence();
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [sharedEvidence],
      secondaryVariants: [{
        binding: binding("granola"),
        sourceObjectId: "granola-note-secret",
        sourceVersion: "granola-version-4",
        contentDigest: digest("granola-bounded-content"),
        modifiedAt: "2026-07-29T10:30:00.000Z",
        eventTime: "2026-07-29T09:00:00.000Z",
        observedAt: "2026-07-29T11:30:00.000Z",
        evidence: [{
          ...sharedEvidence,
          observedAt: "2026-07-29T11:30:00.000Z",
          quality: "provider_summary",
          confidence: 0.7,
        }],
      }],
    })]));
    const canonical = snapshot.meetings[0];
    assert.equal(canonical.sourceVariants.length, 2);
    assert.equal(canonical.evidence.length, 1);
    assert.equal(
      canonical.evidence[0].supportingSourceVariantRefDigests.length,
      2,
    );
    assert.equal(
      canonical.evidence[0].objectRefs.filter(
        (ref) => ref.kind === "source_object",
      ).length,
      2,
    );
    assert.equal(canonical.evidence[0].quality, "structured_generated");
    assert.equal(canonical.evidence[0].confidence, 0.8);
    assert.ok(canonical.evidence[0].statementReferenceDigest);
  });

  it("keeps semantic identity stable across revision rotation and occurrence identity distinct across meetings", () => {
    const first = buildTaskMapMeetingProducerSnapshot(draft([
      meeting({ revisionId: "opaque-revision-1" }),
    ]));
    const rotated = buildTaskMapMeetingProducerSnapshot(draft([
      meeting({ revisionId: "opaque-revision-rotated" }),
    ]));
    assert.equal(
      first.meetings[0].canonicalMeetingId,
      rotated.meetings[0].canonicalMeetingId,
    );
    assert.equal(
      first.meetings[0].evidence[0].evidenceDigest,
      rotated.meetings[0].evidence[0].evidenceDigest,
    );
    assert.equal(
      first.meetings[0].evidence[0].evidenceId,
      rotated.meetings[0].evidence[0].evidenceId,
    );
    assert.notEqual(
      first.meetings[0].primarySourceIdentityDigest,
      rotated.meetings[0].primarySourceIdentityDigest,
    );
    assert.notEqual(
      first.meetings[0].sourceVariants[0].sourceVariantRefDigest,
      rotated.meetings[0].sourceVariants[0].sourceVariantRefDigest,
    );

    const statementWithoutExplicitRef = {
      ...evidence(),
      objectRefs: undefined,
    };
    const twoMeetings = buildTaskMapMeetingProducerSnapshot(draft([
      meeting({ evidence: [statementWithoutExplicitRef] }),
      meeting({
        documentId: "a-different-doc",
        revisionId: "revision-1",
        evidence: [statementWithoutExplicitRef],
      }),
    ]));
    assert.equal(
      twoMeetings.meetings[0].evidence[0].evidenceDigest,
      twoMeetings.meetings[1].evidence[0].evidenceDigest,
    );
    assert.notEqual(
      twoMeetings.meetings[0].evidence[0].evidenceId,
      twoMeetings.meetings[1].evidence[0].evidenceId,
    );
    const firstExternalRefs = twoMeetings.meetings[0].evidence[0].objectRefs
      .filter((ref) => ref.kind === "external_reference");
    const secondExternalRefs = twoMeetings.meetings[1].evidence[0].objectRefs
      .filter((ref) => ref.kind === "external_reference");
    assert.deepEqual(firstExternalRefs, secondExternalRefs);
    assert.equal(firstExternalRefs.length, 1);
  });

  it("keeps the derived statement ref stable across status/deadline changes while evidence facets and digest rotate", () => {
    const explicitUrlRef = digest("https-url-reference-one");
    const statement = {
      ...evidence(),
      objectRefs: [{
        kind: "external_reference" as const,
        referenceDigest: explicitUrlRef,
      }],
    };
    const rowFor = (
      status: "open" | "done",
      deadline: string,
      externalReferenceDigest = explicitUrlRef,
    ) => buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [{
        ...statement,
        status,
        deadline,
        objectRefs: [{
          kind: "external_reference" as const,
          referenceDigest: externalReferenceDigest,
        }],
      }],
    })])).meetings[0].evidence[0];
    const open = rowFor("open", "2026-07-30T17:00:00.000Z");
    const done = rowFor("done", "2026-07-30T17:00:00.000Z");
    const deadlineRotated = rowFor("open", "2026-08-01T17:00:00.000Z");
    const differentUrl = rowFor(
      "open",
      "2026-07-30T17:00:00.000Z",
      digest("https-url-reference-two"),
    );
    const derivedRef = (
      row: typeof open,
      explicitRef: string,
    ) => row.objectRefs.find((ref) =>
      ref.kind === "external_reference"
      && ref.referenceDigest !== explicitRef
    )?.referenceDigest;

    assert.ok(derivedRef(open, explicitUrlRef));
    assert.equal(open.statementReferenceDigest, derivedRef(open, explicitUrlRef));
    assert.notEqual(open.statementReferenceDigest, explicitUrlRef);
    assert.ok(open.objectRefs.some((ref) =>
      ref.kind === "external_reference"
      && ref.referenceDigest === explicitUrlRef
    ));
    assert.equal(
      derivedRef(open, explicitUrlRef),
      taskMapMeetingStatementReferenceDigest({
        kind: "action_item",
        title: statement.title,
        summary: statement.summary,
        explicitExternalReferenceDigests: [explicitUrlRef],
      }),
    );
    assert.equal(
      derivedRef(open, explicitUrlRef),
      derivedRef(done, explicitUrlRef),
    );
    assert.equal(
      derivedRef(open, explicitUrlRef),
      derivedRef(deadlineRotated, explicitUrlRef),
    );
    assert.notEqual(
      derivedRef(open, explicitUrlRef),
      derivedRef(differentUrl, digest("https-url-reference-two")),
    );
    assert.equal(
      taskMapMeetingStatementReferenceDigest({
        kind: "action_item",
        title: statement.title,
        summary: statement.summary,
        explicitExternalReferenceDigests: [
          digest("https-url-reference-two"),
          explicitUrlRef,
        ],
      }),
      taskMapMeetingStatementReferenceDigest({
        kind: "action_item",
        title: statement.title,
        summary: statement.summary,
        explicitExternalReferenceDigests: [
          explicitUrlRef,
          digest("https-url-reference-two"),
        ],
      }),
    );
    assert.notEqual(open.evidenceDigest, done.evidenceDigest);
    assert.notEqual(open.evidenceDigest, deadlineRotated.evidenceDigest);
    assert.equal(open.status, "open");
    assert.equal(done.status, "done");
    assert.equal(open.deadline, "2026-07-30T17:00:00.000Z");
    assert.equal(
      deadlineRotated.deadline,
      "2026-08-01T17:00:00.000Z",
    );
  });

  it("exposes no statement reference for decision context evidence", () => {
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [{
        ...evidence("Keep the current launch plan"),
        kind: "decision",
        objectRefs: undefined,
      }],
    })]));
    const decision = snapshot.meetings[0].evidence[0];
    assert.equal(decision.kind, "decision");
    assert.equal(decision.proposalDisposition, "context_only");
    assert.equal(decision.statementReferenceDigest, null);
    assert.equal(
      decision.objectRefs.some((ref) => ref.kind === "external_reference"),
      false,
    );
  });

  it("loads only a 0600 owner regular file, rejects symlinks/mode/owner mismatch, and returns no local path", async () => {
    const snapshot = freshSnapshot();
    const file = tempFile("producer.json");
    writeFileSync(file, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    const loaded = await loadTaskMapMeetingProducerResult({
      snapshotPath: file,
      assessedAt: "2026-07-29T13:00:00.000Z",
      expectedOwnerScopeDigest:
        taskMapMeetingProducerOwnerScopeDigest("owner"),
    });
    assert.equal(loaded.freshness.decision, "fresh");
    assert.equal(JSON.stringify(loaded).includes(file), false);

    chmodSync(file, 0o644);
    const looseMode = await loadTaskMapMeetingProducerResult({
      snapshotPath: file,
      assessedAt: "2026-07-29T13:00:00.000Z",
    });
    assert.equal(looseMode.freshness.decision, "malformed");

    chmodSync(file, 0o600);
    const link = tempFile("producer-link.json");
    symlinkSync(file, link);
    const symlink = await loadTaskMapMeetingProducerResult({
      snapshotPath: link,
      assessedAt: "2026-07-29T13:00:00.000Z",
    });
    assert.equal(symlink.freshness.decision, "malformed");

    const wrongOwnerScope = await loadTaskMapMeetingProducerResult({
      snapshotPath: file,
      assessedAt: "2026-07-29T13:00:00.000Z",
      expectedOwnerScopeDigest: digest("different-owner"),
    });
    assert.equal(wrongOwnerScope.freshness.decision, "malformed");
    assert.equal(wrongOwnerScope.snapshot, null);
  });

  it("round-trips a compact near-limit 0600 producer file through the authenticated loader", async () => {
    const meetings = Array.from({ length: 8 }, (_, meetingIndex) => meeting({
      documentId: `near-limit-document-${meetingIndex}`,
      revisionId: `near-limit-revision-${meetingIndex}`,
      evidence: Array.from({ length: 16 }, (_, evidenceIndex) => {
        const suffix = `${meetingIndex}-${evidenceIndex}`;
        return {
          ...evidence(
            `Near-limit bounded semantic evidence ${suffix} ${
              "s".repeat(140)
            }`,
          ),
          title: `Near-limit action ${suffix} ${"t".repeat(64)}`,
          objectRefs: undefined,
        };
      }),
    }));
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft(meetings));
    const compact = Buffer.from(JSON.stringify(snapshot), "utf8");
    assert.ok(
      compact.byteLength
        > TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes / 2,
    );
    assert.ok(
      compact.byteLength <= TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes,
    );
    const file = tempFile("near-limit-compact.json");
    writeFileSync(file, compact, { mode: 0o600 });
    chmodSync(file, 0o600);

    const loaded = await loadTaskMapMeetingProducerResult({
      snapshotPath: file,
      assessedAt: "2026-07-29T13:00:00.000Z",
      expectedOwnerScopeDigest:
        taskMapMeetingProducerOwnerScopeDigest("owner"),
    });
    assert.equal(loaded.freshness.decision, "fresh");
    assert.equal(loaded.snapshot?.snapshotDigest, snapshot.snapshotDigest);
    assert.equal(
      loaded.snapshot?.meetings.reduce(
        (count, item) => count + item.evidence.length,
        0,
      ),
      TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidenceGlobal,
    );
  });

  it("emits only digests for source identity and has no body, transcript, participant, Gmail, credential, or path field", () => {
    const snapshot = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      documentId: "raw-private-document-id",
      revisionId: "raw-private-revision-id",
      secondaryVariants: [{
        binding: binding("granola"),
        sourceObjectId: "raw-private-granola-id",
        sourceVersion: "raw-private-granola-version",
        contentDigest: digest("granola-content"),
        modifiedAt: "2026-07-29T10:00:00.000Z",
        eventTime: "2026-07-29T09:00:00.000Z",
        observedAt: "2026-07-29T11:00:00.000Z",
        evidence: [],
      }],
    })]));
    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      "raw-private-document-id",
      "raw-private-revision-id",
      "raw-private-granola-id",
      "raw-private-granola-version",
      "\"body\"",
      "\"transcript\"",
      "\"participants\"",
      "\"gmail\"",
      "\"credentials\"",
      "\"snapshotPath\"",
      "\"authoritative_task\"",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.equal(snapshot.privacy.sourceBodiesStored, false);
    assert.equal(snapshot.privacy.transcriptBodiesStored, false);
    assert.equal(snapshot.privacy.emailContentStored, false);
    assert.equal(snapshot.privacy.participantDetailsStored, false);

    assert.throws(() => buildTaskMapMeetingProducerSnapshot(draft([{
      ...meeting(),
      transcript: "raw body must not enter this contract",
    } as TaskMapMeetingProducerMeetingDraftV1])));
  });

  it("rejects participant, credential, bearer-secret, and owner-path leaks in bounded semantic text", () => {
    for (const leakedSummary of [
      "Send the decision to neo@example.com after review",
      "Use token=sk_live_owner_secret for the refresh",
      "Read the owner state from /Users/neo/.daobrew/private.json",
      "Call the endpoint with Bearer abcdefghijklmnop",
      "Use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 for the GitHub call",
      "Use gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 for the GitHub call",
      "Use ghu_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 for the GitHub call",
      "Use ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 for the GitHub call",
      "Use ghr_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 for the GitHub call",
      "Use sk-abcdefghijklmnopqrstuvwxyz123456 for the OpenAI call",
      "Use sk-proj-abcdefghijklmnopqrstuvwxyz123456 for the OpenAI call",
      "Forward eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.abcdefghijklmnop",
      "Use AWS key AKIAABCDEFGHIJKLMNOP for the producer",
      "Read transient state from /private/var/folders/owner/secret.json",
      "Read mounted state from /Volumes/Owner/private.json",
      "Read temporary state from /tmp/owner-token.json",
      "Read system cache from /var/folders/zz/owner/cache.json",
      "Compare the result with /etc/passwd",
      "Read the owner secret from ~/secret/file",
      "Read Windows state from C:\\Users\\neo\\secret.txt",
      "Review (/etc/passwd) before launch",
      "Open \"/Users/neo/private.json\" before launch",
      "Open file:///etc/passwd before launch",
      "Open \\\\server\\share\\secret before launch",
    ]) {
      assert.throws(
        () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
          evidence: [evidence(leakedSummary)],
        })])),
        /semantic privacy boundary/,
      );
    }
    assert.throws(
      () => buildTaskMapMeetingProducerSnapshot(draft([meeting({
        evidence: [{
          ...evidence(),
          title: "Ask owner@example.com to approve",
        }],
      })])),
      /semantic privacy boundary/,
    );

    let forged = structuredClone(freshSnapshot());
    for (const leakedSummary of [
      "Load token=owner_private_value before refresh",
      "Review (/etc/passwd) before launch",
      "Open \"/Users/neo/private.json\" before launch",
      "Open file:///etc/passwd before launch",
      "Open \\\\server\\share\\secret before launch",
    ]) {
      forged = structuredClone(freshSnapshot());
      forged.meetings[0].evidence[0].summary = leakedSummary;
      assert.throws(
        () => assertTaskMapMeetingProducerSnapshot(forged),
        /semantic privacy boundary/,
      );
    }
    assert.equal(forged.privacy.participantDetailsStored, false);
    assert.equal(forged.privacy.credentialsStored, false);
    assert.equal(forged.privacy.localPathsStored, false);

    const legitimate = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [evidence(
        "Email the checklist owner after rotating the token policy and documenting the path",
      )],
    })]));
    assert.equal(legitimate.meetings[0].evidence.length, 1);
    const linked = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [evidence(
        "Review https://docs.example.com/spec before the bounded launch",
      )],
    })]));
    assert.equal(linked.meetings[0].evidence.length, 1);
    const httpLinked = buildTaskMapMeetingProducerSnapshot(draft([meeting({
      evidence: [evidence(
        "Review http://docs.example.com/spec before the bounded launch",
      )],
    })]));
    assert.equal(httpLinked.meetings[0].evidence.length, 1);
  });

  it("resolves the frozen owner-local default snapshot path", () => {
    assert.equal(
      taskMapMeetingProducerSnapshotPath("/tmp/owner-home"),
      "/tmp/owner-home/.daobrew/taskmap/meeting-producer-snapshot.v1.json",
    );
  });

  it("derives one domain-separated owner scope for producer and loader", () => {
    const ownerScope =
      taskMapMeetingProducerOwnerScopeDigest("synthetic-owner-key");
    assert.match(ownerScope, /^[a-f0-9]{64}$/);
    assert.equal(
      ownerScope,
      taskMapMeetingProducerOwnerScopeDigest("synthetic-owner-key"),
    );
    assert.notEqual(
      ownerScope,
      taskMapMeetingProducerOwnerScopeDigest("different-owner-key"),
    );
  });
});
