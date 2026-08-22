import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessTaskMapBodyCausalInput,
  assessTaskMapBodyInformedPattern,
  evaluateTaskMapOwnerBodyPatterns,
  runTaskMapBodyCausalComparison,
  TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION,
  TASKMAP_BODY_CAUSAL_COMPARISON_VERSION,
  TASKMAP_BODY_PATTERN_RESULT_VERSION,
  TASKMAP_OWNER_BODY_PATTERN_POLICY_V1,
} from "../src/engine/taskmap/body-causal-assessment.js";
import {
  TASKMAP_ALGORITHM_POLICY,
  taskMapSemanticInputDigest,
} from "../src/engine/taskmap/harness.js";
import {
  type SemanticBrainOutput,
  TASKMAP_CONTRACT_VERSION,
  type TaskMapInput,
} from "../src/engine/taskmap/types.js";

const FIXED_NOW = "2026-07-25T23:00:00.000Z";
const BODY_SNAPSHOT_DIGEST = "b".repeat(64);

function verifiedProviderRead(
  overrides: Partial<{
    snapshotDigest: string;
    completedAt: string;
    validThrough: string;
  }> = {},
) {
  return {
    snapshotDigest: BODY_SNAPSHOT_DIGEST,
    completedAt: "2026-07-25T22:00:00.000Z",
    validThrough: "2026-07-26T02:00:00.000Z",
    ...overrides,
  };
}

function fixture(): {
  input: TaskMapInput;
  brain: SemanticBrainOutput;
} {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: FIXED_NOW,
    pointers: [
      {
        id: "strategy-task",
        sourceKind: "strategy",
        sourceObjectId: "task-safe-ref",
        sourceRefHash: "0000000000000000",
        authority: "source_system",
        syncMode: "return_only",
        capabilities: ["read_task", "deep_link"],
      },
      {
        id: "granola-context",
        sourceKind: "granola",
        sourceObjectId: "granola-safe-ref",
        sourceRefHash: "1111111111111111",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "codex-context",
        sourceKind: "codex_session",
        sourceObjectId: "codex-safe-ref",
        sourceRefHash: "2222222222222222",
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
      {
        id: "body-context",
        sourceKind: "oura",
        sourceObjectId: "relative-body-window",
        sourceRefHash: "3333333333333333",
        sourceVersion: BODY_SNAPSHOT_DIGEST,
        authority: "none",
        syncMode: "reference_only",
        capabilities: ["read_context"],
      },
    ],
    events: [
      {
        id: "task-created",
        pointerId: "strategy-task",
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: "2026-07-21T18:00:00.000Z",
        observedAt: FIXED_NOW,
        objectRefs: ["task:causal-assessment"],
        title: "Verify the provider-neutral causal assessment",
        summary: "Keep accepted work authority separate from physiological context.",
        extractionConfidence: 1,
        sourceStatus: "open",
      },
      {
        id: "ordinary-context",
        pointerId: "granola-context",
        recordKind: "work_context",
        activity: "context_observed",
        occurredAt: "2026-07-25T18:00:00.000Z",
        observedAt: FIXED_NOW,
        dayKey: "2026-07-25",
        objectRefs: ["context:ordinary"],
        title: "Ordinary implementation context",
        summary: "This context supports the workstream but is not marked as actual work timing.",
        extractionConfidence: 0.9,
      },
      {
        id: "body-target-25",
        pointerId: "body-context",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-25T19:00:00.000Z",
        observedAt: FIXED_NOW,
        dayKey: "2026-07-25",
        objectRefs: ["body-day:2026-07-25"],
        title: "Body window below personal baseline",
        summary: "Relative category only; no raw physiological value is stored.",
        extractionConfidence: 1,
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
      },
    ],
  };
  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "codex",
    model: "gpt-5.6-sol",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: FIXED_NOW,
    roots: [{
      proposalId: "root-causal-assessment",
      title: "Provider-neutral causal assessment",
      summary: "Assess physiological context only after accepted work membership is fixed.",
      evidenceEventIds: ["task-created", "ordinary-context"],
      memberObjectRefs: ["task:causal-assessment"],
      confidence: 1,
    }],
    tasks: [{
      proposalId: "task-causal-assessment",
      rootProposalId: "root-causal-assessment",
      title: "Verify the provider-neutral causal assessment",
      summary: "Prove the fixed gate without changing work authority or membership.",
      evidenceEventIds: ["task-created", "ordinary-context"],
      authoritativeTaskEventId: "task-created",
      openState: "open",
      confidence: 1,
    }],
    edges: [{
      proposalId: "edge-causal-assessment",
      fromProposalId: "root-causal-assessment",
      toProposalId: "task-causal-assessment",
      relation: "advances",
      evidenceEventIds: ["ordinary-context"],
      confidence: 1,
    }],
  };
  return { input, brain };
}

function addWorkEvent(
  input: TaskMapInput,
  brain: SemanticBrainOutput,
  dayKey: string,
  source: "granola" | "codex",
): void {
  const id = `eligible-${source}-${dayKey}`;
  input.events.push({
    id,
    pointerId: source === "granola" ? "granola-context" : "codex-context",
    recordKind: "work_context",
    activity: "context_observed",
    occurredAt: `${dayKey}T18:00:00.000Z`,
    observedAt: FIXED_NOW,
    dayKey,
    objectRefs: [`work:${source}:${dayKey}`],
    title: "Explicitly eligible work timing",
    summary: "This source-local event records actual work timing for the accepted workstream.",
    extractionConfidence: 0.9,
    bodyJoinEligible: true,
  });
  brain.roots[0].evidenceEventIds.push(id);
  brain.tasks[0].evidenceEventIds.push(id);
}

function addCoverageReceipt(
  input: TaskMapInput,
  dayKey: string,
  source: "granola" | "codex",
): void {
  input.events.push({
    id: `coverage-${source}-${dayKey}`,
    pointerId: source === "granola" ? "granola-context" : "codex-context",
    recordKind: "receipt",
    activity: "receipt_observed",
    occurredAt: `${dayKey}T17:00:00.000Z`,
    observedAt: FIXED_NOW,
    dayKey,
    objectRefs: [`coverage:${source}:${dayKey}`],
    title: "Complete source-local corpus coverage",
    summary: "The bounded source reported complete availability for this source-local day.",
    extractionConfidence: 1,
    corpusCoverage: "complete",
  });
}

function addBodyDay(
  input: TaskMapInput,
  dayKey: string,
  category: "below_baseline" | "within_baseline" | "above_baseline",
): void {
  if (
    input.events.some((event) => (
      event.recordKind === "body_context"
      && event.dayKey === dayKey
      && event.bodyCategory === category
    ))
  ) return;
  input.events.push({
    id: `body-${category}-${dayKey}`,
    pointerId: "body-context",
    recordKind: "body_context",
    activity: "body_window_observed",
    occurredAt: `${dayKey}T19:00:00.000Z`,
    observedAt: FIXED_NOW,
    dayKey,
    objectRefs: [`body-day:${dayKey}:${category}`],
    title:
      category === "within_baseline"
        ? "Body window within personal baseline"
        : category === "above_baseline"
          ? "Body window above personal baseline"
          : "Body window below personal baseline",
    summary: "Relative category only; no raw physiological value is stored.",
    extractionConfidence: 1,
    bodyAxis: "composite_recovery",
    bodyCategory: category,
  });
}

function addPassingC2Evidence(
  input: TaskMapInput,
  brain: SemanticBrainOutput,
  neutralDays = ["2026-07-18", "2026-07-19", "2026-07-20"],
): void {
  const targetDays = ["2026-07-23", "2026-07-24", "2026-07-25"];
  for (const dayKey of targetDays) {
    addWorkEvent(input, brain, dayKey, "granola");
    addWorkEvent(input, brain, dayKey, "codex");
    addBodyDay(input, dayKey, "below_baseline");
  }
  for (const dayKey of neutralDays) addBodyDay(input, dayKey, "within_baseline");
  for (const dayKey of [...targetDays, ...neutralDays]) {
    addCoverageReceipt(input, dayKey, "granola");
    addCoverageReceipt(input, dayKey, "codex");
  }
  brain.inputDigest = taskMapSemanticInputDigest(input);
}

function request(input: TaskMapInput, brain: SemanticBrainOutput) {
  return {
    input,
    brain,
    rootProposalId: "root-causal-assessment",
    bodyAxis: "composite_recovery" as const,
    bodyCategory: "below_baseline" as const,
    now: FIXED_NOW,
  };
}

describe("Task Map body causal assessment", () => {
  it("returns an explicit owner-shaped no-work-evidence result and cannot brighten a root", () => {
    const { input, brain } = fixture();
    const assessment = assessTaskMapBodyCausalInput(request(input, brain));
    assert.equal(assessment.contractVersion, TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION);
    assert.equal(assessment.status, "insufficient_evidence");
    assert.equal(assessment.reasonCode, "no_eligible_work_evidence");
    assert.equal(assessment.causalInput, null);
    assert.equal(assessment.evidence.bodyClassificationDayCount, 1);
    assert.deepEqual(
      assessment.evidence.bodyClassificationDates,
      ["2026-07-25"],
    );
    assert.equal(assessment.evidence.unknownBodyDayCount, 0);
    assert.equal(assessment.evidence.eligibleWorkEventCount, 0);

    const ownerResult = evaluateTaskMapOwnerBodyPatterns({
      taskMapInput: input,
      brain,
      now: FIXED_NOW,
    });
    assert.equal(
      ownerResult.policyVersion,
      TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
    );
    assert.equal(ownerResult.projectionInputs.length, 0);
    assert.deepEqual(ownerResult.results, [{
      contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
      policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
      rootProposalId: "root-causal-assessment",
      bodyAxis: "composite_recovery",
      bodyCategory: "below_baseline",
      status: "no_repeated_pattern",
      observedTargetDates: ["2026-07-25"],
      comparableTargetDates: [],
      matchedDates: [],
      matchedDateCount: 0,
      comparableReferenceDates: [],
      reasonCode: "no_eligible_work_evidence",
      reason:
        "No work timestamp for this workstream was explicitly eligible for body-pattern matching.",
    }]);
    assert.doesNotMatch(ownerResult.results[0].reason, /\b(?:causal|C0|C2)\b/i);

    const comparison = runTaskMapBodyCausalComparison(request(input, brain));
    assert.equal(comparison.contractVersion, TASKMAP_BODY_CAUSAL_COMPARISON_VERSION);
    assert.equal(comparison.assessment.reasonCode, "no_eligible_work_evidence");
    assert.equal(comparison.r0BodyMasked.runStatus, "accepted");
    assert.equal(comparison.r1BodyInformed.runStatus, "accepted");
    assert.equal(comparison.membershipStable, true);
    assert.equal(comparison.authorityStable, true);
    assert.equal(comparison.r0BodyMasked.root?.causalGrade, "C0_NO_DATA");
    assert.equal(comparison.r1BodyInformed.root?.causalGrade, "C0_NO_DATA");
    assert.equal(comparison.r0BodyMasked.root?.bodyBonus, 0);
    assert.equal(comparison.r1BodyInformed.root?.bodyBonus, 0);
    assert.equal(comparison.rootScoreDelta, 0);
    assert.equal(comparison.rootBodyBonusDelta, 0);
  });

  it("builds the exact existing causal input and a reproducible C2 R0/R1 comparison", () => {
    const { input, brain } = fixture();
    addPassingC2Evidence(input, brain);

    const assessment = assessTaskMapBodyCausalInput(request(input, brain));
    assert.equal(assessment.status, "causal_input_ready");
    assert.equal(assessment.reasonCode, null);
    assert.equal(assessment.gateVerdict, "attribution_candidate");
    assert.deepEqual(assessment.causalInput, {
      rootProposalId: "root-causal-assessment",
      bodyAxis: "composite_recovery",
      bodyCategory: "below_baseline",
      enrichment: {
        theme: "Provider-neutral causal assessment",
        targetHits: 3,
        targetN: 3,
        referenceRate: 0,
        referenceN: 3,
        citedDays: [
          {
            date: "2026-07-23",
            backed: true,
            sources: ["codex_session", "granola"],
          },
          {
            date: "2026-07-24",
            backed: true,
            sources: ["codex_session", "granola"],
          },
          {
            date: "2026-07-25",
            backed: true,
            sources: ["codex_session", "granola"],
          },
        ],
        rtmSuspected: true,
      },
    });
    assert.equal(assessment.causalInput?.enrichment.thresholds, undefined);
    assert.deepEqual(assessment.evidence.matchedTargetDates, [
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    assert.deepEqual(assessment.evidence.multiSourceBackedTargetDates, [
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
    ]);
    assert.deepEqual(TASKMAP_ALGORITHM_POLICY.causal.enrichmentThresholds, {
      minRatio: 2,
      minBackedDays: 3,
      minSourcesPerDay: 2,
    });

    const ownerResult = evaluateTaskMapOwnerBodyPatterns({
      taskMapInput: input,
      brain,
      now: FIXED_NOW,
      verifiedProviderRead: verifiedProviderRead(),
    });
    assert.equal(ownerResult.projectionInputs.length, 1);
    assert.deepEqual(ownerResult.results[0], {
      contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
      policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
      rootProposalId: "root-causal-assessment",
      bodyAxis: "composite_recovery",
      bodyCategory: "below_baseline",
      status: "repeated_pattern",
      evidenceLevel: "corroborated_association",
      observedTargetDates: [
        "2026-07-23",
        "2026-07-24",
        "2026-07-25",
      ],
      comparableTargetDates: [
        "2026-07-23",
        "2026-07-24",
        "2026-07-25",
      ],
      matchedDates: [
        "2026-07-23",
        "2026-07-24",
        "2026-07-25",
      ],
      matchedDateCount: 3,
      matchedSourceKinds: ["codex_session", "granola"],
      comparableReferenceDates: [
        "2026-07-18",
        "2026-07-19",
        "2026-07-20",
      ],
      reasonCode: null,
      reason:
        "Eligible work repeated on 3 below-baseline day(s) under the fixed complete-coverage, two-source, and 2.0x rules.",
    });
    assert.doesNotMatch(ownerResult.results[0].reason, /\b(?:causal|C0|C2)\b/i);

    const first = runTaskMapBodyCausalComparison(request(input, brain));
    const replay = runTaskMapBodyCausalComparison(request(input, brain));
    assert.deepEqual(replay, first);
    assert.match(first.comparisonId, /^tmbca_[a-f0-9]{16}$/);
    assert.equal(first.membershipStable, true);
    assert.equal(first.authorityStable, true);
    assert.equal(first.r0BodyMasked.root?.causalGrade, "C0_NO_DATA");
    assert.equal(first.r1BodyInformed.root?.causalGrade, "C2_ATTRIBUTION_CANDIDATE");
    assert.equal(first.r0BodyMasked.root?.bodyBonus, 0);
    assert.equal(first.r1BodyInformed.root?.bodyBonus, 0.03);
    assert.equal(first.rootBodyBonusDelta, 0.03);
    assert.equal(first.rootScoreDelta, 0.03);
    assert.equal(
      first.r0BodyMasked.membershipSignature,
      first.r1BodyInformed.membershipSignature,
    );
  });

  it("shows one exact accepted work day as body-informed without creating a causal input", () => {
    const { input, brain } = fixture();
    const ordinary = input.events.find((event) => event.id === "ordinary-context")!;
    delete ordinary.dayKey;
    brain.inputDigest = taskMapSemanticInputDigest(input);

    const bodyInformed = assessTaskMapBodyInformedPattern({
      ...request(input, brain),
      verifiedProviderRead: verifiedProviderRead(),
    });
    assert.deepEqual(bodyInformed, {
      status: "body_informed",
      rootProposalId: "root-causal-assessment",
      observedTargetDates: ["2026-07-25"],
      matchedDates: ["2026-07-25"],
      matchedSourceKinds: ["granola"],
      reasonCode: null,
      reason:
        "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range. This is an association, not proof of cause.",
    });

    const ownerResult = evaluateTaskMapOwnerBodyPatterns({
      taskMapInput: input,
      brain,
      now: FIXED_NOW,
      verifiedProviderRead: verifiedProviderRead(),
    });
    assert.equal(ownerResult.projectionInputs.length, 0);
    assert.deepEqual(ownerResult.results[0], {
      contractVersion: TASKMAP_BODY_PATTERN_RESULT_VERSION,
      policyVersion: TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
      rootProposalId: "root-causal-assessment",
      bodyAxis: "composite_recovery",
      bodyCategory: "below_baseline",
      status: "body_informed",
      evidenceLevel: "body_informed",
      observedTargetDates: ["2026-07-25"],
      comparableTargetDates: [],
      matchedDates: ["2026-07-25"],
      matchedDateCount: 1,
      matchedSourceKinds: ["granola"],
      comparableReferenceDates: [],
      reasonCode: null,
      reason:
        "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range. This is an association, not proof of cause.",
    });

    const comparison = runTaskMapBodyCausalComparison(request(input, brain));
    assert.equal(comparison.r0BodyMasked.root?.bodyBonus, 0);
    assert.equal(comparison.r1BodyInformed.root?.bodyBonus, 0);
    assert.equal(comparison.membershipStable, true);
    assert.equal(comparison.authorityStable, true);
  });

  it("fails body-informed matching for missing or stale provider proof and for no exact signal-day timestamp", () => {
    const { input, brain } = fixture();

    const unverified = assessTaskMapBodyInformedPattern(
      request(input, brain),
    );
    assert.equal(unverified.status, "not_established");
    assert.equal(
      unverified.reasonCode,
      "body_provider_read_unverified",
    );

    const stale = assessTaskMapBodyInformedPattern({
      ...request(input, brain),
      verifiedProviderRead: verifiedProviderRead({
        validThrough: FIXED_NOW,
      }),
    });
    assert.equal(stale.status, "not_established");
    assert.equal(stale.reasonCode, "body_provider_read_stale");

    const ordinary = input.events.find((event) => event.id === "ordinary-context")!;
    delete ordinary.dayKey;
    ordinary.occurredAt = "2026-07-24T18:00:00.000Z";
    brain.inputDigest = taskMapSemanticInputDigest(input);
    const noExactDay = assessTaskMapBodyInformedPattern({
      ...request(input, brain),
      verifiedProviderRead: verifiedProviderRead(),
    });
    assert.equal(noExactDay.status, "not_established");
    assert.equal(noExactDay.reasonCode, "no_exact_root_work_overlap");
  });

  it("fails closed when one provider-bound signal day has contradictory classifications", () => {
    const { input, brain } = fixture();
    addBodyDay(input, "2026-07-25", "within_baseline");
    brain.inputDigest = taskMapSemanticInputDigest(input);

    const result = assessTaskMapBodyInformedPattern({
      ...request(input, brain),
      verifiedProviderRead: verifiedProviderRead(),
    });
    assert.equal(result.status, "not_established");
    assert.equal(
      result.reasonCode,
      "contradictory_body_classification",
    );
  });

  it("keeps the existing three-day neutral reference floor explicit", () => {
    const { input, brain } = fixture();
    addPassingC2Evidence(input, brain, ["2026-07-18", "2026-07-19"]);

    const assessment = assessTaskMapBodyCausalInput(request(input, brain));
    assert.equal(assessment.status, "insufficient_evidence");
    assert.equal(assessment.reasonCode, "insufficient_neutral_reference_days");
    assert.equal(assessment.gateVerdict, "insufficient_power");
    assert.equal(assessment.causalInput, null);
    assert.equal(assessment.evidence.targetHitDayCount, 3);
    assert.equal(assessment.evidence.multiSourceBackedTargetDayCount, 3);
    assert.equal(assessment.evidence.neutralReferenceDayCount, 2);

    const comparison = runTaskMapBodyCausalComparison(request(input, brain));
    assert.equal(comparison.membershipStable, true);
    assert.equal(comparison.authorityStable, true);
    assert.equal(comparison.r1BodyInformed.root?.causalGrade, "C0_NO_DATA");
    assert.equal(comparison.rootBodyBonusDelta, 0);
  });

  it("does not treat single-source availability as comparable complete coverage", () => {
    const { input, brain } = fixture();
    for (const dayKey of ["2026-07-23", "2026-07-24", "2026-07-25"]) {
      addWorkEvent(input, brain, dayKey, "granola");
      addWorkEvent(input, brain, dayKey, "codex");
      addBodyDay(input, dayKey, "below_baseline");
      addCoverageReceipt(input, dayKey, "granola");
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);

    const assessment = assessTaskMapBodyCausalInput(request(input, brain));
    assert.equal(assessment.status, "insufficient_evidence");
    assert.equal(assessment.reasonCode, "no_comparable_source_day_coverage");
    assert.equal(assessment.evidence.completeCoverageDayCount, 3);
    assert.equal(assessment.evidence.comparableCoverageDayCount, 0);
    assert.equal(assessment.causalInput, null);
  });

  it("does not try an above-baseline hypothesis even when it would have three matched dates", () => {
    const { input, brain } = fixture();
    input.events = input.events.filter(
      (event) => event.recordKind !== "body_context",
    );
    const targetDays = ["2026-07-23", "2026-07-24", "2026-07-25"];
    const referenceDays = ["2026-07-18", "2026-07-19", "2026-07-20"];
    for (const dayKey of targetDays) {
      addWorkEvent(input, brain, dayKey, "granola");
      addWorkEvent(input, brain, dayKey, "codex");
      addBodyDay(input, dayKey, "above_baseline");
    }
    for (const dayKey of referenceDays) {
      addBodyDay(input, dayKey, "within_baseline");
    }
    for (const dayKey of [...targetDays, ...referenceDays]) {
      addCoverageReceipt(input, dayKey, "granola");
      addCoverageReceipt(input, dayKey, "codex");
    }
    brain.inputDigest = taskMapSemanticInputDigest(input);

    const ownerResult = evaluateTaskMapOwnerBodyPatterns({
      taskMapInput: input,
      brain,
      now: FIXED_NOW,
    });

    assert.equal(
      ownerResult.policyVersion,
      "taskmap-owner-body-pattern-policy.1",
    );
    assert.equal(ownerResult.projectionInputs.length, 0);
    assert.deepEqual(ownerResult.results[0].observedTargetDates, []);
    assert.deepEqual(ownerResult.results[0].matchedDates, []);
    assert.equal(
      ownerResult.results[0].reasonCode,
      "no_covered_target_body_days",
    );
    assert.equal(ownerResult.results[0].bodyCategory, "below_baseline");
    assert.equal(ownerResult.results[0].status, "no_repeated_pattern");
  });
});
