import assert from "node:assert";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildGeminiMeetSource,
  buildTaskMapSourceEnvelope,
  buildTaskMapSourceSnapshot,
  canonicalizeTaskMapMeetings,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
  type TaskMapGeminiMeetDraftV1,
} from "../src/engine/taskmap/source-contracts.js";
import {
  assertTaskMapTruthSet,
  buildTaskMapTruthProjectionTarget,
  buildTaskMapTruthSet,
  compareTaskMapTruthSetProjectionParity,
  taskMapTruthSetCanonicalJson,
  taskMapTruthSetMembershipSignature,
} from "../src/engine/taskmap/truth-set.js";
import {
  TASKMAP_SOURCE_ENVELOPE_VERSION,
  TASKMAP_TRUTH_LABEL_POLICY_VERSION,
  TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION,
  TASKMAP_TRUTH_SET_DRAFT_VERSION,
  TASKMAP_TRUTH_SET_VERSION,
  TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
  type TaskMapProjectionTargetRecordV1,
  type TaskMapSourceAuthorityBindingV1,
  type TaskMapTruthLabelDraftV1,
  type TaskMapTruthSetDraftV1,
} from "../src/engine/taskmap/types.js";

type GeminiFixture = {
  scenario: string;
  draft: TaskMapGeminiMeetDraftV1;
};

const PACKAGE_ROOT = process.cwd();
const TRUTH_FIXTURE_PATH = path.resolve(
  PACKAGE_ROOT,
  "tests/fixtures/taskmap-p9.3/jul-27-reviewed-truth-set.json",
);
const OWNER_SCRIPT_PATH = path.resolve(
  PACKAGE_ROOT,
  "scripts/taskmap-truth-set-owner.mjs",
);
const OWNER_SUMMARY_KEYS = [
  "artifactDigest",
  "directoryMode",
  "fileMode",
  "filename",
  "labelCount",
  "runId",
  "schemaVersion",
  "sourcePointerDigestCount",
  "truthSetDigest",
].sort();
const EMAIL_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function containsLocalPathToken(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1])) continue;
    const remainder = value.slice(index);
    if (
      remainder.startsWith("/")
      || remainder.startsWith("~/")
      || remainder.startsWith("~\\")
      || remainder.startsWith("./")
      || remainder.startsWith(".\\")
      || remainder.startsWith("../")
      || remainder.startsWith("..\\")
      || /^[A-Za-z]:[\\/]/.test(remainder)
      || remainder.startsWith("\\\\")
    ) {
      return true;
    }
  }
  return false;
}

function containsUriScheme(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1])) continue;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.slice(index))) return true;
  }
  return false;
}

function containsCommonSecret(value: string): boolean {
  const literalPrefixes = [
    "AKIA",
    "ASIA",
    "ghp_",
    "github_pat_",
    "sk-",
    "xoxb-",
    "AIza",
    "sk_live_",
    "npm_",
  ];
  return literalPrefixes.some((prefix) => value.includes(prefix))
    || /bearer\s+\S{8,}/i.test(value)
    || /PRIVATE KEY/i.test(value)
    || /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/.test(value);
}

function assertSafeOwnerStdout(
  stdout: string,
  rawIdentifiers: readonly string[],
  expected: Record<string, unknown>,
): Record<string, unknown> {
  if (
    rawIdentifiers.some((identifier) => stdout.includes(identifier))
    || containsLocalPathToken(stdout)
    || EMAIL_TEXT.test(stdout)
    || containsUriScheme(stdout)
    || containsCommonSecret(stdout)
  ) {
    throw new Error("owner stdout contains private content");
  }
  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  assert.deepStrictEqual(Object.keys(parsed).sort(), OWNER_SUMMARY_KEYS);
  assert.deepStrictEqual(parsed, expected);
  return parsed;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function readTruthDraft(): TaskMapTruthSetDraftV1 {
  return readJson<TaskMapTruthSetDraftV1>(TRUTH_FIXTURE_PATH);
}

function readGeminiFixture(filename: string): GeminiFixture {
  return readJson<GeminiFixture>(path.resolve(
    PACKAGE_ROOT,
    "tests/fixtures/taskmap-p9.2",
    filename,
  ));
}

function designMeetingSources() {
  const design = buildGeminiMeetSource(
    readGeminiFixture("gemini-direct-discovery.json").draft,
  );
  const hint = design.envelope.meetingIdentity!;
  const calendarBinding: TaskMapSourceAuthorityBindingV1 = {
    ...design.envelope.binding,
    sourceKind: "google_calendar",
  };
  const granolaBinding: TaskMapSourceAuthorityBindingV1 = {
    connectionId: "synthetic-granola-read",
    sourceKind: "granola",
    tenantOrWorkspaceDigest: taskMapContractDigest("synthetic-granola-workspace"),
    accountOrPrincipalDigest: taskMapContractDigest("synthetic-granola-principal"),
    grantVersion: "granola-read-v1",
  };
  const calendar = buildTaskMapSourceEnvelope({
    ownerScopeDigest: design.envelope.ownerScopeDigest,
    binding: calendarBinding,
    sourceKind: "google_calendar",
    objectType: "calendar_event",
    sourceObjectId: "synthetic-calendar-design-event",
    sourceRevision: "synthetic-calendar-design-revision",
    eventTime: hint.startAt,
    contentDigest: taskMapContractDigest("synthetic-calendar-content"),
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
  const granola = buildTaskMapSourceEnvelope({
    ownerScopeDigest: design.envelope.ownerScopeDigest,
    binding: granolaBinding,
    sourceKind: "granola",
    objectType: "meeting_note",
    sourceObjectId: "synthetic-granola-design-meeting",
    sourceRevision: "synthetic-granola-design-revision",
    eventTime: hint.startAt,
    contentDigest: taskMapContractDigest("synthetic-granola-content"),
    authority: {
      evidence: "provider_generated_summary",
      quality: "degraded_summary",
      lifecycle: "none",
      completion: "none",
      rank: "context_only",
    },
    meetingIdentity: {
      ...hint,
      calendarEventIdDigest: undefined,
      endAt: undefined,
    },
  });
  return { design, calendar, granola };
}

function label(
  truthSet: ReturnType<typeof buildTaskMapTruthSet>,
  caseKey: string,
) {
  const found = truthSet.labels.find((item) => item.caseKey === caseKey);
  assert.ok(found, `missing truth label ${caseKey}`);
  return found;
}

function mutateLabel(
  draft: TaskMapTruthSetDraftV1,
  caseKey: string,
  mutation: Partial<TaskMapTruthLabelDraftV1>,
): TaskMapTruthSetDraftV1 {
  return {
    ...structuredClone(draft),
    labels: draft.labels.map((item) => (
      item.caseKey === caseKey ? { ...item, ...mutation } : item
    )),
  };
}

function rawDigest(value: string): string {
  return taskMapContractDigest(value);
}

function ownerPointer(rawValue: string, rawKey: string, digestKey: string) {
  return {
    [rawKey]: rawValue,
    [digestKey]: rawDigest(rawValue),
  };
}

function syntheticOwnerManifest() {
  return {
    schemaVersion: "taskmap-owner-live-source-manifest.v1",
    runId: "p9.2-synthetic-owner-source",
    capturedAt: "2026-07-28T03:45:00.000Z",
    sources: [
      {
        label: "design",
        calendar: ownerPointer(
          "owner-test-calendar-z8f4",
          "eventId",
          "eventIdDigest",
        ),
        geminiDrive: {
          ...ownerPointer(
            "owner-test-document-q6m2",
            "documentId",
            "documentIdDigest",
          ),
          ...ownerPointer(
            "owner-test-revision-v7k9",
            "revisionId",
            "revisionIdDigest",
          ),
        },
        gmailDiscovery: {
          channel: "gmail_direct",
          duplicateContentSuppressed: true,
          ...ownerPointer(
            "owner-test-message-d3p8",
            "messageId",
            "messageIdDigest",
          ),
        },
        granola: ownerPointer(
          "owner-test-granola-b5n1",
          "meetingId",
          "meetingIdDigest",
        ),
      },
      {
        label: "weekly",
        calendar: null,
        geminiDrive: {
          ...ownerPointer(
            "owner-test-document-r2c7",
            "documentId",
            "documentIdDigest",
          ),
          ...ownerPointer(
            "owner-test-revision-h4w6",
            "revisionId",
            "revisionIdDigest",
          ),
        },
        gmailDiscovery: {
          channel: "gmail_forwarded",
          duplicateContentSuppressed: true,
          ...ownerPointer(
            "owner-test-message-j9t3",
            "messageId",
            "messageIdDigest",
          ),
        },
      },
    ],
    privacy: {
      sourceBodiesStored: false,
      emailBodiesStored: false,
      participantDetailsStored: false,
      rawBiometricsStored: false,
      fullAgentSessionBodiesStored: false,
    },
  };
}

describe("Task Map P9.3 reviewed truth set", () => {
  it("keeps workClass, evidenceRole, adjudication, lifecycle, projection, and delta as independent closed axes", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    assert.strictEqual(truthSet.contractVersion, TASKMAP_TRUTH_SET_VERSION);
    assert.strictEqual(
      truthSet.labelPolicyVersion,
      TASKMAP_TRUTH_LABEL_POLICY_VERSION,
    );
    assert.strictEqual(
      truthSet.splitPolicyVersion,
      TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
    );
    assert.strictEqual(
      truthSet.reviewBatchPolicyVersion,
      TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION,
    );
    assert.match(truthSet.reviewBatchDigest, /^[a-f0-9]{64}$/);
    assert.strictEqual(
      truthSet.sourceContractVersion,
      TASKMAP_SOURCE_ENVELOPE_VERSION,
    );
    assert.strictEqual(truthSet.labels.length, 29);
    assert.ok(Object.isFrozen(truthSet));
    assert.ok(Object.isFrozen(truthSet.labels[0]));
    for (const row of truthSet.labels) {
      for (const axis of [
        "workClass",
        "evidenceRole",
        "adjudication",
        "lifecycle",
        "expectedProjection",
        "expectedDelta",
        "recurrenceContribution",
        "reasonCodes",
        "labelAuthority",
      ]) {
        assert.ok(Object.hasOwn(row, axis), `${row.caseKey} lacks ${axis}`);
      }
    }
    assert.deepStrictEqual(truthSet.overallMetrics, {
      labelCount: 29,
      canonicalMeetingCount: 2,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 1,
      candidateReviewCount: 1,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 1,
      membershipContribution: 4,
      mergeIntoExistingCount: 4,
      duplicateExclusionCount: 5,
      pollutionRejectionCount: 7,
      falseReopenCount: 0,
    });
    assert.deepStrictEqual(
      truthSet.splitMetrics.map((item) => item.timeSplit),
      ["T0", "T1", "T2", "T3", "T4"],
    );
    assert.deepStrictEqual(
      truthSet.splitBoundaries.map((item) => item.timeSplit),
      ["T0", "T1", "T2", "T3", "T4"],
    );
    assert.ok(truthSet.splitBoundaries.every(
      (item) => item.semantics === "inclusive_start_exclusive_end",
    ));
    assert.strictEqual(
      truthSet.splitBoundaries.at(-1)?.endAt,
      truthSet.asOf,
    );
    assert.notStrictEqual(
      label(truthSet, "strategy_taskmap_open").adjudication,
      label(truthSet, "weekly_gemini_corroboration").adjudication,
    );
    assert.strictEqual(
      label(truthSet, "strategy_taskmap_open").workClass,
      label(truthSet, "weekly_gemini_corroboration").workClass,
    );
    assert.strictEqual(
      label(truthSet, "design_system_update_merge").workClass,
      label(truthSet, "design_dri_checkpoint_candidate").workClass,
    );
    assert.notStrictEqual(
      label(truthSet, "design_system_update_merge").adjudication,
      label(truthSet, "design_dri_checkpoint_candidate").adjudication,
    );
  });

  it("rejects unknown fields, missing axes, owner-shaped refs, and collapsed label semantics", () => {
    const draft = readTruthDraft();
    assert.throws(
      () => buildTaskMapTruthSet({
        ...draft,
        transcript: "forbidden source body",
      } as never),
      /forbidden or unknown fields/,
    );
    assert.throws(
      () => buildTaskMapTruthSet({
        ...draft,
        reviewAuthorityDigest: "a".repeat(64),
      } as never),
      /forbidden or unknown fields/,
    );
    assert.throws(
      () => buildTaskMapTruthSet({
        ...draft,
        asOf: "2026-07-28T04:00:00.000Z",
        reviewedAt: "2026-07-28T03:59:59.000Z",
      }),
      /asOf cannot follow reviewedAt/,
    );
    const missingAxis = structuredClone(draft) as unknown as {
      labels: Array<Record<string, unknown>>;
    };
    delete missingAxis.labels[0].workClass;
    assert.throws(
      () => buildTaskMapTruthSet(missingAxis as never),
      /unsupported truth workClass/,
    );
    const missingRequiredReference = structuredClone(draft) as unknown as {
      labels: Array<Record<string, unknown>>;
    };
    delete missingRequiredReference.labels[0].sourceRecordRef;
    assert.throws(
      () => buildTaskMapTruthSet(missingRequiredReference as never),
      /sourceRecordRef is required/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        { sourceRecordRef: "/Users/private/task.jsonl" } as never,
      )),
      /synthetic or digest-only reference/,
    );
    for (const subject of [
      "Read /private/taskmap/review.json",
      "Read /home/owner/taskmap/review.json",
      "Read /root/.ssh/id_rsa",
      "Read /mnt/secrets/token",
      "Read ../../private-notes.txt",
      "Read file:///root/.ssh/id_rsa",
      "Read s3://private-bucket/taskmap.json",
      "Read path=/root/.ssh/id_rsa",
      "Read uri=file:///root/.ssh/id_rsa",
      "Read[path=/root/.ssh/id_rsa]",
    ]) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          draft,
          "strategy_taskmap_open",
          { subject },
        )),
        /privacy-safe/,
      );
    }
    assert.doesNotThrow(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        { subject: "Coordinate Mac/iOS design system" },
      )),
    );
    for (const leaked of [
      "Read path=/root/.ssh/id_rsa",
      "Read uri=file:///root/.ssh/id_rsa",
      "Read[path=/root/.ssh/id_rsa]",
    ]) {
      assert.ok(
        containsLocalPathToken(leaked) || containsUriScheme(leaked),
        `independent privacy corpus missed ${leaked}`,
      );
    }
    assert.strictEqual(containsLocalPathToken("Coordinate Mac/iOS"), false);
    assert.strictEqual(containsUriScheme("Coordinate Mac/iOS"), false);
    for (const subject of [
      ["Use AWS key ", "AK", "IAABCDEFGHIJKLMNOP"].join(""),
      "Use GitHub token ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "Use OpenAI key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890",
      "Use OpenAI key sk-abcdefghijklmnopqrstuvwxyz1234567890",
      "Use bearer abcdefghijklmnopqrstuvwxyz",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      [
        "Use Slack token ",
        "xo",
        "xb-123456789012-123456789012-abcdefghijklmnopqrstuvwx",
      ].join(""),
      "Use Google key AIzaSyA123456789012345678901234567890123",
      ["Use Stripe key ", "sk_", "live_abcdefghijklmnopqrstuvwxyz123456"].join(""),
      "Use npm token npm_abcdefghijklmnopqrstuvwxyz1234567890",
      "Use JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature123456",
    ]) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          draft,
          "strategy_taskmap_open",
          { subject },
        )),
        /privacy-safe/,
      );
    }
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "weekly_pollution_jtc",
        {
          workClass: "inferred_candidate",
          adjudication: "candidate_review",
          lifecycle: "awaiting_review",
        },
      )),
      /candidate_review requires/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        { expectedDelta: "new_candidate" },
      )),
      /accepted-work delta/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        { membershipContribution: 0 },
      )),
      /derived membership contribution/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        {
          expectedDelta: "new_accepted_work",
          membershipContribution: 0,
        },
      )),
      /derived membership contribution/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_open",
        {
          sourceKind: "github",
          labelAuthority: "reviewed_truth",
        },
      )),
      /shared_accepted_work projection requires closed-list source authority|accepted_work requires source-authoritative/,
    );
    for (const sourceKind of ["unknown", "slack"] as const) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          draft,
          "strategy_taskmap_open",
          { sourceKind },
        )),
        /shared_accepted_work projection requires closed-list source authority|accepted_work requires source-authoritative/,
      );
    }
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_commit_merge",
        {
          sourceKind: "unknown",
          labelAuthority: "reviewed_truth",
        },
      )),
      /shared_accepted_work projection requires closed-list source authority/,
    );
    for (const sourceKind of ["gemini_meet", "unknown"] as const) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          draft,
          "strategy_central_truth_context",
          {
            sourceKind,
            labelAuthority: "reviewed_truth",
            ...(sourceKind === "gemini_meet"
              ? { canonicalEventRef: "synthetic:event.authority-guard-probe" }
              : {}),
          },
        )),
        /strategy_durable_context projection requires Strategy source authority/,
      );
    }
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "weekly_gemini_corroboration",
        { canonicalWorkRef: "synthetic:work.unreviewed-meeting-claim" },
      )),
      /does not resolve to prior authoritative accepted work/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_ios_existing_update",
        { canonicalWorkRef: "synthetic:work.unreviewed-update-target" },
      )),
      /does not resolve to prior authoritative accepted work|first later accepted work reference/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "weekly_gemini_corroboration",
        {
          expectedProjection: {
            strategy: "shared_accepted_work",
            taskMap: "shared_accepted_work",
          },
        },
      )),
      /shared_accepted_work projection requires closed-list source authority|meeting and session merge evidence cannot claim shared accepted work/,
    );
    const withoutStrategyMergeReason = mutateLabel(
      draft,
      "design_system_update_merge",
      {
        reasonCodes: label(
          buildTaskMapTruthSet(draft),
          "design_system_update_merge",
        ).reasonCodes.filter(
          (reason) => reason !== "strategy_reviewed_existing_work_merge",
        ),
      },
    );
    assert.deepStrictEqual(
      buildTaskMapTruthSet(withoutStrategyMergeReason).overallMetrics,
      buildTaskMapTruthSet(draft).overallMetrics,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        withoutStrategyMergeReason,
        "design_system_update_merge",
        { labelAuthority: "source_authority" },
      )),
      /closed authoritative-work source allowlist/,
    );
    const withoutStrategyBlockerReason = mutateLabel(
      draft,
      "design_dri_checkpoint_candidate",
      {
        reasonCodes: label(
          buildTaskMapTruthSet(draft),
          "design_dri_checkpoint_candidate",
        ).reasonCodes.filter(
          (reason) => reason !== "strategy_blocker_candidate_review",
        ),
      },
    );
    assert.deepStrictEqual(
      buildTaskMapTruthSet(withoutStrategyBlockerReason).overallMetrics,
      buildTaskMapTruthSet(draft).overallMetrics,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        withoutStrategyBlockerReason,
        "design_dri_checkpoint_candidate",
        {
          sourceKind: "gemini_meet",
          labelAuthority: "reviewed_truth",
          canonicalEventRef: "synthetic:event.design-sync-2026-07-27",
        },
      )),
      /taskmap_candidate_review projection requires Strategy candidate authority|candidate_review must be Strategy-backed/,
    );
    const completedWorkRef = label(
      buildTaskMapTruthSet(draft),
      "p8_real_data_acceptance_completed",
    ).canonicalWorkRef!;
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "design_dri_checkpoint_candidate",
        { canonicalWorkRef: completedWorkRef },
      )),
      /cannot reopen a completed or superseded|terminal work rejects same-split or later live semantics/,
    );
    const supersededWorkRef = label(
      buildTaskMapTruthSet(draft),
      "p7_founder_gate_superseded",
    ).canonicalWorkRef!;
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_taskmap_commit_merge",
        { canonicalWorkRef: supersededWorkRef },
      )),
      /cannot reopen a completed or superseded|terminal work rejects same-split or later live semantics/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        withoutStrategyBlockerReason,
        "design_dri_checkpoint_candidate",
        {
          labelAuthority: "reviewed_truth",
        },
      )),
      /taskmap_candidate_review projection requires Strategy candidate authority|Strategy truth labels must retain Strategy source authority/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        withoutStrategyBlockerReason,
        "design_dri_checkpoint_candidate",
        {
          canonicalEventRef: "synthetic:event.design-sync-2026-07-27",
        },
      )),
      /taskmap_candidate_review projection requires Strategy candidate authority|candidate_review must be Strategy-backed/,
    );
    const forged = structuredClone(buildTaskMapTruthSet(draft));
    forged.labels[0] = {
      ...forged.labels[0],
      labelId: "tmtruthlabel_attackerchosen",
    };
    assert.throws(
      () => assertTaskMapTruthSet(forged),
      /derived identity is invalid/,
    );
    const forgedReviewBatch = structuredClone(buildTaskMapTruthSet(draft));
    forgedReviewBatch.reviewBatchDigest = "a".repeat(64);
    assert.throws(
      () => assertTaskMapTruthSet(forgedReviewBatch),
      /invalid derived fields/,
    );
  });

  it("maps direct Gmail to design, forwarded Gmail to weekly, keeps Gmail semantically neutral, and invents no weekly Calendar", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    const direct = label(truthSet, "design_gmail_direct_discovery");
    const forwarded = label(truthSet, "weekly_gmail_forwarded_discovery");
    const designEventRefs = [
      "design_calendar_identity_anchor",
      "design_gemini_primary_variant",
      "design_granola_degraded_duplicate",
      "design_gmail_direct_discovery",
    ].map((caseKey) => label(truthSet, caseKey).canonicalEventRef);
    const weeklyEventRefs = [
      "weekly_gemini_corroboration",
      "weekly_gmail_forwarded_discovery",
    ].map((caseKey) => label(truthSet, caseKey).canonicalEventRef);
    assert.strictEqual(new Set(designEventRefs).size, 1);
    assert.strictEqual(new Set(weeklyEventRefs).size, 1);
    assert.strictEqual(direct.discoveryChannel, "gmail_direct");
    assert.strictEqual(forwarded.discoveryChannel, "gmail_forwarded");
    assert.notStrictEqual(direct.canonicalEventRef, forwarded.canonicalEventRef);
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "design_granola_degraded_duplicate",
        {
          canonicalEventRef: forwarded.canonicalEventRef,
          timeSplit: "T1",
        },
      )),
      /exact canonical-event parity/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "design_granola_degraded_duplicate",
        { timeSplit: "T4" },
      )),
      /canonical event cannot span multiple truth time splits/,
    );
    assert.ok(!truthSet.labels.some((item) => (
      item.sourceKind === "google_calendar"
      && item.canonicalEventRef === forwarded.canonicalEventRef
    )));
    for (const gmail of truthSet.labels.filter((item) => item.sourceKind === "gmail")) {
      assert.strictEqual(gmail.evidenceRole, "discovery_pointer");
      assert.strictEqual(gmail.adjudication, "exclude_duplicate");
      assert.strictEqual(gmail.expectedDelta, "none");
      assert.strictEqual(gmail.recurrenceContribution, 0);
      assert.strictEqual(gmail.membershipContribution, 0);
    }
    for (const caseKey of [
      "weekly_gmail_forwarded_discovery",
      "design_calendar_identity_anchor",
      "design_gemini_primary_variant",
      "design_granola_degraded_duplicate",
    ]) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          readTruthDraft(),
          caseKey,
          { canonicalEventRef: undefined },
        )),
        /meeting and discovery source rows require a canonicalEventRef/,
      );
    }
    const eventlessMeetingMasquerade = structuredClone(readTruthDraft());
    const eventless = eventlessMeetingMasquerade.labels.find(
      (item) => item.caseKey === "codex_root_continues_taskmap",
    );
    assert.ok(eventless);
    eventless.sourceKind = "gemini_meet";
    delete eventless.sessionRole;
    assert.throws(
      () => buildTaskMapTruthSet(eventlessMeetingMasquerade),
      /meeting and discovery source rows require a canonicalEventRef/,
    );

    const directFixture = readGeminiFixture("gemini-direct-discovery.json").draft;
    const builtDirect = buildGeminiMeetSource(directFixture);
    const driveOnly = buildGeminiMeetSource({
      ...directFixture,
      gmailDiscoveries: [],
    });
    assert.strictEqual(
      buildTaskMapSourceSnapshot(
        [builtDirect.envelope],
        builtDirect.discoveryPointers,
      ).semanticInputDigest,
      buildTaskMapSourceSnapshot([driveOnly.envelope], []).semanticInputDigest,
    );
    const forwardedFixture = readGeminiFixture(
      "gemini-forwarded-discovery.json",
    ).draft;
    assert.strictEqual(
      buildGeminiMeetSource(forwardedFixture).envelope.meetingIdentity
        ?.calendarEventIdDigest,
      undefined,
    );
  });

  it("deduplicates missing and different meeting ends into one design event and counts recurrence once", () => {
    const { design, calendar, granola } = designMeetingSources();
    assert.strictEqual(granola.meetingIdentity?.endAt, undefined);
    assert.strictEqual(calendar.meetingIdentity?.endAt, "2026-07-28T02:15:00.000Z");
    assert.strictEqual(
      design.envelope.meetingIdentity?.endAt,
      "2026-07-28T02:30:00.000Z",
    );
    const canonical = canonicalizeTaskMapMeetings([
      granola,
      design.envelope,
      calendar,
    ]);
    assert.strictEqual(canonical.length, 1);
    assert.strictEqual(canonical[0].identityMethod, "calendar_event");
    assert.strictEqual(canonical[0].evidenceVariantEnvelopeIds.length, 2);
    assert.strictEqual(canonical[0].calendarEnvelopeIds.length, 1);

    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    const designRef = label(
      truthSet,
      "design_gemini_primary_variant",
    ).canonicalEventRef;
    const designRows = truthSet.labels.filter(
      (item) => item.canonicalEventRef === designRef,
    );
    assert.strictEqual(
      designRows.reduce((sum, item) => sum + item.recurrenceContribution, 0),
      1,
    );
    assert.strictEqual(
      label(truthSet, "design_granola_degraded_duplicate")
        .recurrenceContribution,
      0,
    );
  });

  it("keeps merge, pollution, T0-T4 metrics, and byte replay stable under input ordering", () => {
    const draft = readTruthDraft();
    const first = buildTaskMapTruthSet(draft);
    const reorderedDraft = structuredClone(draft);
    reorderedDraft.labels.reverse();
    reorderedDraft.splitBoundaries.reverse();
    reorderedDraft.expectedSplitMetrics.reverse();
    for (const row of reorderedDraft.labels) row.reasonCodes.reverse();
    const replay = buildTaskMapTruthSet(reorderedDraft);
    assert.deepStrictEqual(replay, first);
    assert.strictEqual(
      taskMapTruthSetCanonicalJson(replay),
      taskMapTruthSetCanonicalJson(first),
    );
    assert.strictEqual(replay.truthSetDigest, first.truthSetDigest);
    assert.strictEqual(replay.truthSetId, first.truthSetId);
    assert.strictEqual(
      label(first, "design_system_update_merge").canonicalWorkRef,
      label(first, "strategy_ios_approval_blocked").canonicalWorkRef,
    );
    assert.deepStrictEqual(
      first.labels
        .filter((item) => item.adjudication === "reject_pollution")
        .map((item) => item.subject)
        .sort(),
      [
        "100",
        "Connect Background",
        "Contact Party",
        "Delegation wrapper is not work",
        "JTC",
        "Spin up mission",
        "Valencia",
      ].sort(),
    );
  });

  it("rejects a non-work row rewritten as an existing-work merge even when aggregate metrics are forged", () => {
    const draft = mutateLabel(
      readTruthDraft(),
      "weekly_pollution_jtc",
      {
        canonicalWorkRef: "synthetic:work.taskmap.productization",
        adjudication: "merge_into_existing",
        lifecycle: "open",
        expectedDelta: "merge_existing_work",
      },
    );
    const t1 = draft.expectedSplitMetrics.find((item) => item.timeSplit === "T1");
    assert.ok(t1);
    t1.metrics.mergeIntoExistingCount += 1;
    t1.metrics.pollutionRejectionCount -= 1;
    draft.expectedOverallMetrics.mergeIntoExistingCount += 1;
    draft.expectedOverallMetrics.pollutionRejectionCount -= 1;
    assert.throws(
      () => buildTaskMapTruthSet(draft),
      /non_work is exactly the reject_pollution lane|merge_into_existing/,
    );
  });

  it("deduplicates the continuing root and delegated subagents while rejecting wrappers", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    const root = label(truthSet, "codex_root_continues_taskmap");
    const subagents = truthSet.labels.filter((item) => item.sessionRole === "subagent");
    const wrapper = label(truthSet, "codex_wrapper_rejected");
    assert.strictEqual(root.expectedDelta, "merge_existing_work");
    assert.strictEqual(root.recurrenceContribution, 0);
    assert.ok(subagents.length >= 2);
    assert.ok(subagents.every((item) => (
      item.canonicalWorkRef === root.canonicalWorkRef
      && item.evidenceRole === "delegated_execution"
      && item.adjudication === "exclude_duplicate"
      && item.recurrenceContribution === 0
    )));
    assert.strictEqual(wrapper.workClass, "non_work");
    assert.strictEqual(wrapper.adjudication, "reject_pollution");

    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "codex_subagent_truthset_delegated",
        { recurrenceContribution: 1 },
      )),
      /exclude_duplicate must be projection- and contribution-neutral|subagent sessions are delegated duplicates/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "codex_root_continues_taskmap",
        { expectedDelta: "new_root" },
      )),
    /merge_into_existing requires live canonical work and no new membership|continuing root session cannot/,
    );
  });

  it("requires every local agent-session row to declare its root, subagent, or wrapper role", () => {
    const missingRootRole = structuredClone(readTruthDraft());
    const root = missingRootRole.labels.find(
      (item) => item.caseKey === "codex_root_continues_taskmap",
    );
    assert.ok(root);
    delete root.sessionRole;
    assert.throws(
      () => buildTaskMapTruthSet(missingRootRole),
      /every local agent-session source requires an explicit sessionRole/,
    );

    const forgedWrapper = structuredClone(readTruthDraft());
    const wrapper = forgedWrapper.labels.find(
      (item) => item.caseKey === "codex_wrapper_rejected",
    );
    assert.ok(wrapper);
    delete wrapper.sessionRole;
    Object.assign(wrapper, {
      canonicalWorkRef: "synthetic:work.taskmap.productization",
      workClass: "explicit_work",
      evidenceRole: "corroborating_variant",
      adjudication: "merge_into_existing",
      lifecycle: "open",
      expectedDelta: "merge_existing_work",
    });
    assert.throws(
      () => buildTaskMapTruthSet(forgedWrapper),
      /every local agent-session source requires an explicit sessionRole/,
    );
    for (const caseKey of [
      "codex_subagent_truthset_delegated",
      "codex_wrapper_rejected",
    ]) {
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          readTruthDraft(),
          caseKey,
          {
            canonicalWorkRef: undefined,
            canonicalEventRef: "synthetic:event.fake-session-link",
          },
        )),
        /every local agent-session source requires a canonicalWorkRef/,
      );
      assert.throws(
        () => buildTaskMapTruthSet(mutateLabel(
          readTruthDraft(),
          caseKey,
          { canonicalWorkRef: "synthetic:work.never-authoritative" },
        )),
        /agent-session canonicalWorkRef requires earlier authoritative membership/,
      );
    }
  });

  it("prevents completed and superseded work from reopening", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    for (const terminal of [
      label(truthSet, "p8_real_data_acceptance_completed"),
      label(truthSet, "p7_founder_gate_superseded"),
    ]) {
      assert.strictEqual(terminal.expectedDelta, "none");
      assert.strictEqual(terminal.recurrenceContribution, 0);
      assert.strictEqual(terminal.membershipContribution, 0);
    }
    assert.strictEqual(truthSet.overallMetrics.falseReopenCount, 0);
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "p8_real_data_acceptance_completed",
        { expectedDelta: "update_existing_work" },
      )),
      /completed or superseded work cannot reopen/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "p7_founder_gate_superseded",
        { membershipContribution: 1 },
      )),
      /completed or superseded work cannot reopen|derived membership contribution/,
    );

    const sameSplit = readTruthDraft();
    const supersededRef = sameSplit.labels.find(
      (item) => item.caseKey === "p7_founder_gate_superseded",
    )?.canonicalWorkRef;
    assert.ok(supersededRef);
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        sameSplit,
        "strategy_fundraising_open",
        { canonicalWorkRef: supersededRef },
      )),
      /terminal work rejects same-split or later live semantics/,
    );

    const completedRef = readTruthDraft().labels.find(
      (item) => item.caseKey === "p8_real_data_acceptance_completed",
    )?.canonicalWorkRef;
    assert.ok(completedRef);
    const validHistoricalResolution = buildTaskMapTruthSet(mutateLabel(
      readTruthDraft(),
      "strategy_fundraising_open",
      { canonicalWorkRef: completedRef },
    ));
    for (const target of ["strategy", "task_map"] as const) {
      const projection = buildTaskMapTruthProjectionTarget(
        validHistoricalResolution,
        target,
      );
      const projectedRecord: TaskMapProjectionTargetRecordV1 | undefined =
        projection.records.find((item) => (
        item.sourceIdentityDigest
        === taskMapContractDigest(`truth-source:${completedRef}`)
        ));
      assert.ok(projectedRecord);
      assert.strictEqual(projectedRecord.lifecycle, "resolved");
    }
    assert.deepStrictEqual(
      compareTaskMapTruthSetProjectionParity(validHistoricalResolution).failures,
      [],
    );

    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "strategy_ios_existing_update",
        { canonicalWorkRef: completedRef },
      )),
      /terminal work rejects same-split or later live semantics/,
    );

    const projectionCollision = mutateLabel(
      readTruthDraft(),
      "strategy_central_truth_context",
      { canonicalWorkRef: supersededRef },
    );
    const collisionTruth = buildTaskMapTruthSet(projectionCollision);
    assert.throws(
      () => compareTaskMapTruthSetProjectionParity(collisionTruth),
      /projection record cannot overwrite a terminal lifecycle/,
    );
  });

  it("counts membership by unique canonical work ref and rejects duplicate contributors", () => {
    const draft = readTruthDraft();
    const taskMapRef = draft.labels.find(
      (item) => item.caseKey === "strategy_taskmap_open",
    )?.canonicalWorkRef;
    assert.ok(taskMapRef);
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        draft,
        "strategy_fundraising_open",
        { canonicalWorkRef: taskMapRef },
      )),
      /canonical work reference may contribute Task Map membership at most once/,
    );
  });

  it("requires a first later accepted work ref to declare its creation delta", () => {
    const draft = mutateLabel(
      readTruthDraft(),
      "strategy_taskmap_commit_merge",
      {
        canonicalWorkRef: "synthetic:work.new-later-accepted",
        evidenceRole: "primary_authority",
        adjudication: "accepted_work",
        expectedDelta: "none",
        membershipContribution: 1,
      },
    );
    const t4 = draft.expectedSplitMetrics.find((item) => item.timeSplit === "T4");
    assert.ok(t4);
    t4.metrics.membershipContribution += 1;
    t4.metrics.mergeIntoExistingCount -= 1;
    draft.expectedOverallMetrics.membershipContribution += 1;
    draft.expectedOverallMetrics.mergeIntoExistingCount -= 1;
    assert.throws(
      () => buildTaskMapTruthSet(draft),
      /nonterminal accepted_work with delta none is limited to the T0 baseline/,
    );
  });

  it("keeps Oura post-membership only and preserves the membership signature when body is masked", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    const oura = label(truthSet, "oura_context_membership_neutral");
    assert.strictEqual(oura.workClass, "context_only");
    assert.strictEqual(oura.adjudication, "context_only");
    assert.strictEqual(oura.membershipContribution, 0);
    assert.strictEqual(oura.recurrenceContribution, 0);
    assert.strictEqual(
      taskMapTruthSetMembershipSignature(truthSet),
      taskMapTruthSetMembershipSignature(truthSet, true),
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "oura_context_membership_neutral",
        { membershipContribution: 1 },
      )),
      /context_only cannot become accepted or candidate work|Oura is post-membership context only/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "oura_context_membership_neutral",
        { evidenceRole: "primary_authority" },
      )),
      /Oura is corroborating post-membership context or explicit unlinked coverage only/,
    );
    assert.throws(
      () => buildTaskMapTruthSet(mutateLabel(
        readTruthDraft(),
        "oura_context_membership_neutral",
        { canonicalWorkRef: "synthetic:work.never-accepted" },
      )),
      /linked Oura context requires earlier membership-bearing accepted work/,
    );
    const unlinked = buildTaskMapTruthSet(mutateLabel(
      readTruthDraft(),
      "oura_context_membership_neutral",
      {
        canonicalWorkRef: undefined,
        reasonCodes: ["unlinked_body_coverage"],
      },
    ));
    assert.strictEqual(
      label(unlinked, "oura_context_membership_neutral").canonicalWorkRef,
      undefined,
    );
  });

  it("passes Strategy/Task Map parity with one iOS update, one DRI candidate, and no automatic accepted task or root", () => {
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    const parity = compareTaskMapTruthSetProjectionParity(truthSet);
    assert.deepStrictEqual(parity.failures, []);
    assert.strictEqual(parity.intentionalDifferences.length, 4);
    assert.strictEqual(truthSet.overallMetrics.newRootCount, 0);
    assert.strictEqual(truthSet.overallMetrics.newAcceptedWorkCount, 0);
    assert.strictEqual(truthSet.overallMetrics.updatedExistingWorkCount, 1);
    assert.strictEqual(truthSet.overallMetrics.candidateReviewCount, 1);
    assert.strictEqual(
      truthSet.overallMetrics.automaticAcceptedFromMeetingOrSessionCount,
      0,
    );
    assert.strictEqual(
      label(truthSet, "strategy_ios_existing_update").canonicalWorkRef,
      label(truthSet, "strategy_ios_approval_blocked").canonicalWorkRef,
    );
    assert.strictEqual(
      label(truthSet, "design_dri_checkpoint_candidate").adjudication,
      "candidate_review",
    );
    const mergedDesignCandidate = label(truthSet, "design_system_update_merge");
    assert.strictEqual(mergedDesignCandidate.sourceKind, "gemini_meet");
    assert.strictEqual(mergedDesignCandidate.evidenceRole, "corroborating_variant");
    assert.strictEqual(mergedDesignCandidate.labelAuthority, "reviewed_truth");
    assert.ok(
      mergedDesignCandidate.reasonCodes.includes(
        "strategy_reviewed_existing_work_merge",
      ),
    );
    assert.strictEqual(
      mergedDesignCandidate.canonicalWorkRef,
      label(truthSet, "strategy_ios_approval_blocked").canonicalWorkRef,
    );
    const strategyBlockerCandidate = label(
      truthSet,
      "design_dri_checkpoint_candidate",
    );
    assert.strictEqual(strategyBlockerCandidate.sourceKind, "strategy");
    assert.strictEqual(strategyBlockerCandidate.evidenceRole, "primary_authority");
    assert.strictEqual(strategyBlockerCandidate.labelAuthority, "source_authority");
    assert.strictEqual(strategyBlockerCandidate.canonicalEventRef, undefined);
    assert.ok(
      strategyBlockerCandidate.reasonCodes.includes(
        "strategy_blocker_candidate_review",
      ),
    );
  });

  it("writes a digest-bound immutable owner artifact with 0700/0600 permissions and no raw IDs", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "taskmap-truth-owner-"));
    try {
      const ownerRoot = path.join(
        testHome,
        "Library",
        "Application Support",
        "DaoBrew",
        "taskmap",
      );
      const sourceRun = path.join(ownerRoot, "p9.2-synthetic-owner-source");
      mkdirSync(sourceRun, { recursive: true, mode: 0o700 });
      chmodSync(ownerRoot, 0o700);
      chmodSync(sourceRun, 0o700);
      const sourceManifestPath = path.join(
        sourceRun,
        "owner-live-source-manifest.json",
      );
      const sourceManifest = syntheticOwnerManifest();
      writeFileSync(
        sourceManifestPath,
        `${JSON.stringify(sourceManifest, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      chmodSync(sourceManifestPath, 0o600);
      const runId = "p9.3-synthetic-truth-run";
      const independentlyReviewedTruth = buildTaskMapTruthSet(readTruthDraft());
      const args = [
        OWNER_SCRIPT_PATH,
        "--source-manifest",
        sourceManifestPath,
        "--truth-set-fixture",
        TRUTH_FIXTURE_PATH,
        "--expected-truth-set-digest",
        independentlyReviewedTruth.truthSetDigest,
        "--expected-review-batch-digest",
        independentlyReviewedTruth.reviewBatchDigest,
        "--run-id",
        runId,
        "--now",
        "2026-07-28T06:45:00.000Z",
      ];
      const first = spawnSync(process.execPath, args, {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, HOME: testHome },
        encoding: "utf8",
      });
      assert.strictEqual(first.status, 0, first.stderr);
      const outputDirectory = path.join(ownerRoot, runId);
      const outputPath = path.join(outputDirectory, "taskmap-truth-set.v2.json");
      assert.strictEqual(statSync(outputDirectory).mode & 0o777, 0o700);
      assert.strictEqual(statSync(outputPath).mode & 0o777, 0o600);
      const artifact = readJson<Record<string, unknown>>(outputPath);
      const rawIdentifiers = sourceManifest.sources.flatMap((row) => [
        row.calendar?.eventId,
        row.geminiDrive.documentId,
        row.geminiDrive.revisionId,
        (row.gmailDiscovery as unknown as { messageId: string }).messageId,
        row.granola?.meetingId,
      ]).filter((value): value is string => value !== undefined);
      const expectedSummary = {
        schemaVersion: artifact.schemaVersion,
        runId,
        artifactDigest: artifact.artifactDigest,
        truthSetDigest: artifact.truthSetDigest,
        sourcePointerDigestCount: 8,
        labelCount: 29,
        directoryMode: "0700",
        fileMode: "0600",
        filename: "taskmap-truth-set.v2.json",
      };
      const summary = assertSafeOwnerStdout(
        first.stdout,
        rawIdentifiers,
        expectedSummary,
      );
      assert.throws(
        () => assertSafeOwnerStdout(
          `${JSON.stringify({
            ...summary,
            sensitivePath: "/private/taskmap/owner.json",
          })}\n`,
          rawIdentifiers,
          expectedSummary,
        ),
        /owner stdout contains private content/,
      );
      for (const extraValue of [
        "Read path=/root/.ssh/id_rsa",
        "Read uri=file:///root/.ssh/id_rsa",
        "Read[path=/root/.ssh/id_rsa]",
        [
          "Use Slack token ",
          "xo",
          "xb-123456789012-123456789012-abcdefghijklmnopqrstuvwx",
        ].join(""),
        "Use Google key AIzaSyA123456789012345678901234567890123",
        ["Use Stripe key ", "sk_", "live_abcdefghijklmnopqrstuvwxyz123456"].join(""),
        "Use npm token npm_abcdefghijklmnopqrstuvwxyz1234567890",
        "Use JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature123456",
      ]) {
        assert.throws(
          () => assertSafeOwnerStdout(
            `${JSON.stringify({
              ...summary,
              detail: extraValue,
            })}\n`,
            rawIdentifiers,
            expectedSummary,
          ),
          /owner stdout contains private content/,
        );
      }
      const { artifactDigest, ...core } = artifact;
      assert.strictEqual(
        artifactDigest,
        taskMapContractDigest(core),
      );
      const serialized = JSON.stringify(artifact);
      assert.ok(rawIdentifiers.every((identifier) => !serialized.includes(identifier)));
      assert.ok(!serialized.includes(TRUTH_FIXTURE_PATH));
      assert.ok(!serialized.includes("@"));
      assert.deepStrictEqual(
        {
          sourceCapturedAt: artifact.sourceCapturedAt,
          truthAsOf: artifact.truthAsOf,
          truthReviewedAt: artifact.truthReviewedAt,
          createdAt: artifact.createdAt,
        },
        {
          sourceCapturedAt: "2026-07-28T03:45:00.000Z",
          truthAsOf: "2026-07-28T04:21:31.000Z",
          truthReviewedAt: "2026-07-28T04:21:40.000Z",
          createdAt: "2026-07-28T06:45:00.000Z",
        },
      );
      assert.strictEqual(
        artifact.splitPolicyVersion,
        TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
      );
      assert.strictEqual(
        artifact.reviewBatchPolicyVersion,
        TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION,
      );
      assert.strictEqual(
        artifact.reviewAttestationVersion,
        "taskmap-owner-review-attestation.v2",
      );
      assert.strictEqual(
        artifact.expectedTruthSetDigest,
        independentlyReviewedTruth.truthSetDigest,
      );
      assert.strictEqual(
        artifact.expectedReviewBatchDigest,
        independentlyReviewedTruth.reviewBatchDigest,
      );
      assert.strictEqual(
        artifact.reviewAttestationDigest,
        taskMapContractDigest({
          schemaVersion: artifact.reviewAttestationVersion,
          expectedTruthSetDigest: artifact.expectedTruthSetDigest,
          expectedReviewBatchDigest: artifact.expectedReviewBatchDigest,
          reviewBatchPolicyVersion: artifact.reviewBatchPolicyVersion,
          reviewBatchDigest: artifact.reviewBatchDigest,
          sourceManifestDigest: artifact.sourceManifestDigest,
          truthSetDigest: artifact.truthSetDigest,
          sourceCapturedAt: artifact.sourceCapturedAt,
          truthAsOf: artifact.truthAsOf,
          truthReviewedAt: artifact.truthReviewedAt,
          createdAt: artifact.createdAt,
        }),
      );
      assert.strictEqual(
        (artifact.overallMetrics as { canonicalMeetingCount: number })
          .canonicalMeetingCount,
        2,
      );
      assert.deepStrictEqual(
        (artifact.splitBoundaries as Array<{ timeSplit: string }>)
          .map((boundary) => boundary.timeSplit),
        ["T0", "T1", "T2", "T3", "T4"],
      );

      const forgedMeetingDraft = structuredClone(readTruthDraft());
      const forgedMeetingRow = forgedMeetingDraft.labels.find(
        (item) => item.caseKey === "weekly_pollution_jtc",
      );
      assert.ok(forgedMeetingRow);
      forgedMeetingRow.canonicalEventRef = "synthetic:event.forged-third";
      forgedMeetingDraft.expectedOverallMetrics.canonicalMeetingCount = 3;
      const forgedT1 = forgedMeetingDraft.expectedSplitMetrics.find(
        (item) => item.timeSplit === "T1",
      );
      assert.ok(forgedT1);
      forgedT1.metrics.canonicalMeetingCount = 2;
      assert.strictEqual(
        buildTaskMapTruthSet(forgedMeetingDraft).overallMetrics
          .canonicalMeetingCount,
        3,
      );
      const forgedFixturePath = path.join(
        testHome,
        "forged-third-canonical-meeting.json",
      );
      writeFileSync(
        forgedFixturePath,
        `${JSON.stringify(forgedMeetingDraft, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      const forgedMeetingRunId = "p9.3-forged-third-canonical-meeting";
      const forgedMeetingArgs = args.map((value, index) => {
        if (args[index - 1] === "--truth-set-fixture") {
          return forgedFixturePath;
        }
        if (args[index - 1] === "--run-id") return forgedMeetingRunId;
        return value;
      });
      const forgedMeeting = spawnSync(
        process.execPath,
        forgedMeetingArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(forgedMeeting.status, 0);
      assert.match(
        forgedMeeting.stderr,
        /does not match the independently reviewed digest/,
      );
      assert.strictEqual(
        existsSync(path.join(ownerRoot, forgedMeetingRunId)),
        false,
      );

      const extraContextDraft = structuredClone(readTruthDraft());
      extraContextDraft.labels.push({
        caseKey: "extra_safe_excluded_context",
        subject: "Extra synthetic excluded context",
        timeSplit: "T4",
        sourceKind: "unknown",
        sourceRecordRef: "synthetic:unknown.extra-context.v1",
        canonicalWorkRef: "synthetic:context.extra-safe",
        workClass: "context_only",
        evidenceRole: "corroborating_variant",
        adjudication: "context_only",
        lifecycle: "unknown",
        expectedProjection: {
          strategy: "excluded",
          taskMap: "excluded",
        },
        expectedDelta: "none",
        recurrenceContribution: 0,
        membershipContribution: 0,
        reasonCodes: ["provider_variant_deduped"],
        labelAuthority: "deterministic_policy",
      });
      const extraContextT4 = extraContextDraft.expectedSplitMetrics.find(
        (item) => item.timeSplit === "T4",
      );
      assert.ok(extraContextT4);
      extraContextT4.metrics.labelCount += 1;
      extraContextDraft.expectedOverallMetrics.labelCount += 1;
      assert.strictEqual(
        buildTaskMapTruthSet(extraContextDraft).overallMetrics.labelCount,
        30,
      );
      const extraContextFixturePath = path.join(
        testHome,
        "forged-extra-safe-context.json",
      );
      writeFileSync(
        extraContextFixturePath,
        `${JSON.stringify(extraContextDraft, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      const extraContextRunId = "p9.3-forged-extra-safe-context";
      const extraContextArgs = args.map((value, index) => {
        if (args[index - 1] === "--truth-set-fixture") {
          return extraContextFixturePath;
        }
        if (args[index - 1] === "--run-id") return extraContextRunId;
        return value;
      });
      const extraContext = spawnSync(
        process.execPath,
        extraContextArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(extraContext.status, 0);
      assert.match(
        extraContext.stderr,
        /does not match the independently reviewed digest/,
      );
      assert.strictEqual(
        existsSync(path.join(ownerRoot, extraContextRunId)),
        false,
      );

      const substitutedDraft = mutateLabel(
        readTruthDraft(),
        "strategy_admin_plane_context",
        {
          subject: "Substituted neutral context",
          sourceKind: "unknown",
          sourceRecordRef: "synthetic:unknown.substituted-context.v1",
          canonicalWorkRef: "synthetic:context.substituted-neutral",
          evidenceRole: "corroborating_variant",
          expectedProjection: {
            strategy: "excluded",
            taskMap: "excluded",
          },
          reasonCodes: ["provider_variant_deduped"],
          labelAuthority: "deterministic_policy",
        },
      );
      const substitutedTruth = buildTaskMapTruthSet(substitutedDraft);
      assert.deepStrictEqual(
        substitutedTruth.overallMetrics,
        independentlyReviewedTruth.overallMetrics,
      );
      assert.notStrictEqual(
        substitutedTruth.truthSetDigest,
        independentlyReviewedTruth.truthSetDigest,
      );
      const substitutedFixturePath = path.join(
        testHome,
        "forged-same-metrics-substitution.json",
      );
      writeFileSync(
        substitutedFixturePath,
        `${JSON.stringify(substitutedDraft, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      const substitutedRunId = "p9.3-forged-same-metrics-substitution";
      const substitutedArgs = args.map((value, index) => {
        if (args[index - 1] === "--truth-set-fixture") {
          return substitutedFixturePath;
        }
        if (args[index - 1] === "--run-id") return substitutedRunId;
        return value;
      });
      const substituted = spawnSync(
        process.execPath,
        substitutedArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(substituted.status, 0);
      assert.match(
        substituted.stderr,
        /does not match the independently reviewed digest/,
      );
      assert.strictEqual(
        existsSync(path.join(ownerRoot, substitutedRunId)),
        false,
      );

      const wrongBatchRunId = "p9.3-forged-review-batch";
      const wrongBatchArgs = args.map((value, index) => {
        if (args[index - 1] === "--expected-review-batch-digest") {
          return "a".repeat(64);
        }
        if (args[index - 1] === "--run-id") return wrongBatchRunId;
        return value;
      });
      const wrongBatch = spawnSync(
        process.execPath,
        wrongBatchArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(wrongBatch.status, 0);
      assert.match(
        wrongBatch.stderr,
        /does not match the independently reviewed batch digest/,
      );
      assert.strictEqual(
        existsSync(path.join(ownerRoot, wrongBatchRunId)),
        false,
      );

      const second = spawnSync(process.execPath, args, {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, HOME: testHome },
        encoding: "utf8",
      });
      assert.notStrictEqual(second.status, 0);
      assert.match(second.stderr, /run already exists/);
      assert.strictEqual(
        taskMapContractDigest(readJson(outputPath)),
        taskMapContractDigest(artifact),
      );

      const futureSourceRun = path.join(
        ownerRoot,
        "p9.2-synthetic-source-after-truth",
      );
      mkdirSync(futureSourceRun, { mode: 0o700 });
      chmodSync(futureSourceRun, 0o700);
      const futureSourceManifestPath = path.join(
        futureSourceRun,
        "owner-live-source-manifest.json",
      );
      writeFileSync(
        futureSourceManifestPath,
        `${JSON.stringify({
          ...sourceManifest,
          capturedAt: "2026-07-28T04:21:31.001Z",
        }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      chmodSync(futureSourceManifestPath, 0o600);
      const sourceAfterTruthRunId = "p9.3-source-after-truth";
      const sourceAfterTruthArgs = args.map((value, index) => {
        if (args[index - 1] === "--source-manifest") {
          return futureSourceManifestPath;
        }
        if (args[index - 1] === "--run-id") return sourceAfterTruthRunId;
        return value;
      });
      const sourceAfterTruth = spawnSync(
        process.execPath,
        sourceAfterTruthArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(sourceAfterTruth.status, 0);
      assert.match(sourceAfterTruth.stderr, /capturedAt cannot follow truth asOf/);
      assert.strictEqual(
        existsSync(path.join(ownerRoot, sourceAfterTruthRunId)),
        false,
      );

      const createdBeforeReviewRunId = "p9.3-created-before-review";
      const createdBeforeReviewArgs = args.map((value, index) => {
        if (args[index - 1] === "--run-id") return createdBeforeReviewRunId;
        if (args[index - 1] === "--now") return "2026-07-28T04:21:39.999Z";
        return value;
      });
      const createdBeforeReview = spawnSync(
        process.execPath,
        createdBeforeReviewArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(createdBeforeReview.status, 0);
      assert.match(
        createdBeforeReview.stderr,
        /reviewedAt cannot follow owner artifact createdAt/,
      );
      assert.strictEqual(
        existsSync(path.join(ownerRoot, createdBeforeReviewRunId)),
        false,
      );

      const invalidDigestSourceRun = path.join(
        ownerRoot,
        "p9.3-synthetic-invalid-pointer-digest",
      );
      mkdirSync(invalidDigestSourceRun, { mode: 0o700 });
      chmodSync(invalidDigestSourceRun, 0o700);
      const invalidDigestManifestPath = path.join(
        invalidDigestSourceRun,
        "owner-live-source-manifest.json",
      );
      const invalidDigestManifest = structuredClone(sourceManifest);
      invalidDigestManifest.sources[0].geminiDrive.documentIdDigest =
        "0".repeat(64);
      writeFileSync(
        invalidDigestManifestPath,
        `${JSON.stringify(invalidDigestManifest, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600, flag: "wx" },
      );
      chmodSync(invalidDigestManifestPath, 0o600);
      const invalidDigestRunId = "p9.3-invalid-pointer-digest";
      const invalidDigestArgs = args.map((value, index) => {
        if (args[index - 1] === "--source-manifest") {
          return invalidDigestManifestPath;
        }
        if (args[index - 1] === "--run-id") return invalidDigestRunId;
        return value;
      });
      const invalidDigest = spawnSync(
        process.execPath,
        invalidDigestArgs,
        {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, HOME: testHome },
          encoding: "utf8",
        },
      );
      assert.notStrictEqual(invalidDigest.status, 0);
      assert.match(invalidDigest.stderr, /pointer digest is invalid/);
      assert.strictEqual(
        existsSync(path.join(ownerRoot, invalidDigestRunId)),
        false,
      );

      chmodSync(sourceManifestPath, 0o644);
      const insecureRunId = "p9.3-insecure-source-mode";
      const insecureArgs = args.map((value, index) => (
        args[index - 1] === "--run-id" ? insecureRunId : value
      ));
      const insecure = spawnSync(process.execPath, insecureArgs, {
        cwd: PACKAGE_ROOT,
        env: { ...process.env, HOME: testHome },
        encoding: "utf8",
      });
      assert.notStrictEqual(insecure.status, 0);
      assert.match(insecure.stderr, /owner-only before it can be read/);
      assert.strictEqual(existsSync(path.join(ownerRoot, insecureRunId)), false);
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("keeps the committed truth fixture synthetic and free of provider IDs, paths, emails, and bodies", () => {
    const fixtureText = readFileSync(TRUTH_FIXTURE_PATH, "utf8");
    assert.strictEqual(containsLocalPathToken(fixtureText), false);
    assert.strictEqual(containsUriScheme(fixtureText), false);
    assert.ok(!fixtureText.includes("@"));
    assert.ok(!fixtureText.includes("https://"));
    assert.ok(!fixtureText.includes("documentId"));
    assert.ok(!fixtureText.includes("revisionId"));
    assert.ok(!fixtureText.includes("messageId"));
    assert.ok(!fixtureText.includes("meetingId"));
    assert.ok(!fixtureText.includes("eventId"));
    assert.ok(!fixtureText.includes("transcript"));
    assert.ok(!fixtureText.includes("sessionBody"));
    assert.ok(!fixtureText.includes("rawBiometric"));
    for (const secretPrefix of [
      "AKIA",
      "ASIA",
      "ghp_",
      "github_pat_",
      "sk-",
      "xoxb-",
      "AIza",
      "sk_live_",
      "npm_",
      "eyJ",
      "Bearer ",
      "PRIVATE KEY",
    ]) {
      assert.ok(!fixtureText.includes(secretPrefix));
    }
    const truthSet = buildTaskMapTruthSet(readTruthDraft());
    assert.strictEqual(
      taskMapContractCanonicalJson(assertTaskMapTruthSet(truthSet)),
      taskMapTruthSetCanonicalJson(truthSet),
    );
    assert.strictEqual(
      readTruthDraft().contractVersion,
      TASKMAP_TRUTH_SET_DRAFT_VERSION,
    );
    assert.strictEqual(
      readTruthDraft().splitPolicyVersion,
      TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION,
    );
  });
});
