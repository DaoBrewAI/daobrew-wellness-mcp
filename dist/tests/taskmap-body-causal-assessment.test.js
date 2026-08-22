"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const body_causal_assessment_js_1 = require("../src/engine/taskmap/body-causal-assessment.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const FIXED_NOW = "2026-07-25T23:00:00.000Z";
const BODY_SNAPSHOT_DIGEST = "b".repeat(64);
function verifiedProviderRead(overrides = {}) {
    return {
        snapshotDigest: BODY_SNAPSHOT_DIGEST,
        completedAt: "2026-07-25T22:00:00.000Z",
        validThrough: "2026-07-26T02:00:00.000Z",
        ...overrides,
    };
}
function fixture() {
    const input = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
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
    const brain = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        provider: "codex",
        model: "gpt-5.6-sol",
        promptHash: "aaaaaaaaaaaaaaaa",
        inputDigest: (0, harness_js_1.taskMapSemanticInputDigest)(input),
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
function addWorkEvent(input, brain, dayKey, source) {
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
function addCoverageReceipt(input, dayKey, source) {
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
function addBodyDay(input, dayKey, category) {
    if (input.events.some((event) => (event.recordKind === "body_context"
        && event.dayKey === dayKey
        && event.bodyCategory === category)))
        return;
    input.events.push({
        id: `body-${category}-${dayKey}`,
        pointerId: "body-context",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: `${dayKey}T19:00:00.000Z`,
        observedAt: FIXED_NOW,
        dayKey,
        objectRefs: [`body-day:${dayKey}:${category}`],
        title: category === "within_baseline"
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
function addPassingC2Evidence(input, brain, neutralDays = ["2026-07-18", "2026-07-19", "2026-07-20"]) {
    const targetDays = ["2026-07-23", "2026-07-24", "2026-07-25"];
    for (const dayKey of targetDays) {
        addWorkEvent(input, brain, dayKey, "granola");
        addWorkEvent(input, brain, dayKey, "codex");
        addBodyDay(input, dayKey, "below_baseline");
    }
    for (const dayKey of neutralDays)
        addBodyDay(input, dayKey, "within_baseline");
    for (const dayKey of [...targetDays, ...neutralDays]) {
        addCoverageReceipt(input, dayKey, "granola");
        addCoverageReceipt(input, dayKey, "codex");
    }
    brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
}
function request(input, brain) {
    return {
        input,
        brain,
        rootProposalId: "root-causal-assessment",
        bodyAxis: "composite_recovery",
        bodyCategory: "below_baseline",
        now: FIXED_NOW,
    };
}
(0, node_test_1.describe)("Task Map body causal assessment", () => {
    (0, node_test_1.it)("returns an explicit owner-shaped no-work-evidence result and cannot brighten a root", () => {
        const { input, brain } = fixture();
        const assessment = (0, body_causal_assessment_js_1.assessTaskMapBodyCausalInput)(request(input, brain));
        strict_1.default.equal(assessment.contractVersion, body_causal_assessment_js_1.TASKMAP_BODY_CAUSAL_ASSESSMENT_VERSION);
        strict_1.default.equal(assessment.status, "insufficient_evidence");
        strict_1.default.equal(assessment.reasonCode, "no_eligible_work_evidence");
        strict_1.default.equal(assessment.causalInput, null);
        strict_1.default.equal(assessment.evidence.bodyClassificationDayCount, 1);
        strict_1.default.deepEqual(assessment.evidence.bodyClassificationDates, ["2026-07-25"]);
        strict_1.default.equal(assessment.evidence.unknownBodyDayCount, 0);
        strict_1.default.equal(assessment.evidence.eligibleWorkEventCount, 0);
        const ownerResult = (0, body_causal_assessment_js_1.evaluateTaskMapOwnerBodyPatterns)({
            taskMapInput: input,
            brain,
            now: FIXED_NOW,
        });
        strict_1.default.equal(ownerResult.policyVersion, body_causal_assessment_js_1.TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version);
        strict_1.default.equal(ownerResult.projectionInputs.length, 0);
        strict_1.default.deepEqual(ownerResult.results, [{
                contractVersion: body_causal_assessment_js_1.TASKMAP_BODY_PATTERN_RESULT_VERSION,
                policyVersion: body_causal_assessment_js_1.TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
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
                reason: "No work timestamp for this workstream was explicitly eligible for body-pattern matching.",
            }]);
        strict_1.default.doesNotMatch(ownerResult.results[0].reason, /\b(?:causal|C0|C2)\b/i);
        const comparison = (0, body_causal_assessment_js_1.runTaskMapBodyCausalComparison)(request(input, brain));
        strict_1.default.equal(comparison.contractVersion, body_causal_assessment_js_1.TASKMAP_BODY_CAUSAL_COMPARISON_VERSION);
        strict_1.default.equal(comparison.assessment.reasonCode, "no_eligible_work_evidence");
        strict_1.default.equal(comparison.r0BodyMasked.runStatus, "accepted");
        strict_1.default.equal(comparison.r1BodyInformed.runStatus, "accepted");
        strict_1.default.equal(comparison.membershipStable, true);
        strict_1.default.equal(comparison.authorityStable, true);
        strict_1.default.equal(comparison.r0BodyMasked.root?.causalGrade, "C0_NO_DATA");
        strict_1.default.equal(comparison.r1BodyInformed.root?.causalGrade, "C0_NO_DATA");
        strict_1.default.equal(comparison.r0BodyMasked.root?.bodyBonus, 0);
        strict_1.default.equal(comparison.r1BodyInformed.root?.bodyBonus, 0);
        strict_1.default.equal(comparison.rootScoreDelta, 0);
        strict_1.default.equal(comparison.rootBodyBonusDelta, 0);
    });
    (0, node_test_1.it)("builds the exact existing causal input and a reproducible C2 R0/R1 comparison", () => {
        const { input, brain } = fixture();
        addPassingC2Evidence(input, brain);
        const assessment = (0, body_causal_assessment_js_1.assessTaskMapBodyCausalInput)(request(input, brain));
        strict_1.default.equal(assessment.status, "causal_input_ready");
        strict_1.default.equal(assessment.reasonCode, null);
        strict_1.default.equal(assessment.gateVerdict, "attribution_candidate");
        strict_1.default.deepEqual(assessment.causalInput, {
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
        strict_1.default.equal(assessment.causalInput?.enrichment.thresholds, undefined);
        strict_1.default.deepEqual(assessment.evidence.matchedTargetDates, [
            "2026-07-23",
            "2026-07-24",
            "2026-07-25",
        ]);
        strict_1.default.deepEqual(assessment.evidence.multiSourceBackedTargetDates, [
            "2026-07-23",
            "2026-07-24",
            "2026-07-25",
        ]);
        strict_1.default.deepEqual(harness_js_1.TASKMAP_ALGORITHM_POLICY.causal.enrichmentThresholds, {
            minRatio: 2,
            minBackedDays: 3,
            minSourcesPerDay: 2,
        });
        const ownerResult = (0, body_causal_assessment_js_1.evaluateTaskMapOwnerBodyPatterns)({
            taskMapInput: input,
            brain,
            now: FIXED_NOW,
            verifiedProviderRead: verifiedProviderRead(),
        });
        strict_1.default.equal(ownerResult.projectionInputs.length, 1);
        strict_1.default.deepEqual(ownerResult.results[0], {
            contractVersion: body_causal_assessment_js_1.TASKMAP_BODY_PATTERN_RESULT_VERSION,
            policyVersion: body_causal_assessment_js_1.TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
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
            reason: "Eligible work repeated on 3 below-baseline day(s) under the fixed complete-coverage, two-source, and 2.0x rules.",
        });
        strict_1.default.doesNotMatch(ownerResult.results[0].reason, /\b(?:causal|C0|C2)\b/i);
        const first = (0, body_causal_assessment_js_1.runTaskMapBodyCausalComparison)(request(input, brain));
        const replay = (0, body_causal_assessment_js_1.runTaskMapBodyCausalComparison)(request(input, brain));
        strict_1.default.deepEqual(replay, first);
        strict_1.default.match(first.comparisonId, /^tmbca_[a-f0-9]{16}$/);
        strict_1.default.equal(first.membershipStable, true);
        strict_1.default.equal(first.authorityStable, true);
        strict_1.default.equal(first.r0BodyMasked.root?.causalGrade, "C0_NO_DATA");
        strict_1.default.equal(first.r1BodyInformed.root?.causalGrade, "C2_ATTRIBUTION_CANDIDATE");
        strict_1.default.equal(first.r0BodyMasked.root?.bodyBonus, 0);
        strict_1.default.equal(first.r1BodyInformed.root?.bodyBonus, 0.03);
        strict_1.default.equal(first.rootBodyBonusDelta, 0.03);
        strict_1.default.equal(first.rootScoreDelta, 0.03);
        strict_1.default.equal(first.r0BodyMasked.membershipSignature, first.r1BodyInformed.membershipSignature);
    });
    (0, node_test_1.it)("shows one exact accepted work day as body-informed without creating a causal input", () => {
        const { input, brain } = fixture();
        const ordinary = input.events.find((event) => event.id === "ordinary-context");
        delete ordinary.dayKey;
        brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
        const bodyInformed = (0, body_causal_assessment_js_1.assessTaskMapBodyInformedPattern)({
            ...request(input, brain),
            verifiedProviderRead: verifiedProviderRead(),
        });
        strict_1.default.deepEqual(bodyInformed, {
            status: "body_informed",
            rootProposalId: "root-causal-assessment",
            observedTargetDates: ["2026-07-25"],
            matchedDates: ["2026-07-25"],
            matchedSourceKinds: ["granola"],
            reasonCode: null,
            reason: "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range. This is an association, not proof of cause.",
        });
        const ownerResult = (0, body_causal_assessment_js_1.evaluateTaskMapOwnerBodyPatterns)({
            taskMapInput: input,
            brain,
            now: FIXED_NOW,
            verifiedProviderRead: verifiedProviderRead(),
        });
        strict_1.default.equal(ownerResult.projectionInputs.length, 0);
        strict_1.default.deepEqual(ownerResult.results[0], {
            contractVersion: body_causal_assessment_js_1.TASKMAP_BODY_PATTERN_RESULT_VERSION,
            policyVersion: body_causal_assessment_js_1.TASKMAP_OWNER_BODY_PATTERN_POLICY_V1.version,
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
            reason: "Accepted work in this workstream occurred on 2026-07-25, when recovery was below your recent personal range. This is an association, not proof of cause.",
        });
        const comparison = (0, body_causal_assessment_js_1.runTaskMapBodyCausalComparison)(request(input, brain));
        strict_1.default.equal(comparison.r0BodyMasked.root?.bodyBonus, 0);
        strict_1.default.equal(comparison.r1BodyInformed.root?.bodyBonus, 0);
        strict_1.default.equal(comparison.membershipStable, true);
        strict_1.default.equal(comparison.authorityStable, true);
    });
    (0, node_test_1.it)("fails body-informed matching for missing or stale provider proof and for no exact signal-day timestamp", () => {
        const { input, brain } = fixture();
        const unverified = (0, body_causal_assessment_js_1.assessTaskMapBodyInformedPattern)(request(input, brain));
        strict_1.default.equal(unverified.status, "not_established");
        strict_1.default.equal(unverified.reasonCode, "body_provider_read_unverified");
        const stale = (0, body_causal_assessment_js_1.assessTaskMapBodyInformedPattern)({
            ...request(input, brain),
            verifiedProviderRead: verifiedProviderRead({
                validThrough: FIXED_NOW,
            }),
        });
        strict_1.default.equal(stale.status, "not_established");
        strict_1.default.equal(stale.reasonCode, "body_provider_read_stale");
        const ordinary = input.events.find((event) => event.id === "ordinary-context");
        delete ordinary.dayKey;
        ordinary.occurredAt = "2026-07-24T18:00:00.000Z";
        brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
        const noExactDay = (0, body_causal_assessment_js_1.assessTaskMapBodyInformedPattern)({
            ...request(input, brain),
            verifiedProviderRead: verifiedProviderRead(),
        });
        strict_1.default.equal(noExactDay.status, "not_established");
        strict_1.default.equal(noExactDay.reasonCode, "no_exact_root_work_overlap");
    });
    (0, node_test_1.it)("fails closed when one provider-bound signal day has contradictory classifications", () => {
        const { input, brain } = fixture();
        addBodyDay(input, "2026-07-25", "within_baseline");
        brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
        const result = (0, body_causal_assessment_js_1.assessTaskMapBodyInformedPattern)({
            ...request(input, brain),
            verifiedProviderRead: verifiedProviderRead(),
        });
        strict_1.default.equal(result.status, "not_established");
        strict_1.default.equal(result.reasonCode, "contradictory_body_classification");
    });
    (0, node_test_1.it)("keeps the existing three-day neutral reference floor explicit", () => {
        const { input, brain } = fixture();
        addPassingC2Evidence(input, brain, ["2026-07-18", "2026-07-19"]);
        const assessment = (0, body_causal_assessment_js_1.assessTaskMapBodyCausalInput)(request(input, brain));
        strict_1.default.equal(assessment.status, "insufficient_evidence");
        strict_1.default.equal(assessment.reasonCode, "insufficient_neutral_reference_days");
        strict_1.default.equal(assessment.gateVerdict, "insufficient_power");
        strict_1.default.equal(assessment.causalInput, null);
        strict_1.default.equal(assessment.evidence.targetHitDayCount, 3);
        strict_1.default.equal(assessment.evidence.multiSourceBackedTargetDayCount, 3);
        strict_1.default.equal(assessment.evidence.neutralReferenceDayCount, 2);
        const comparison = (0, body_causal_assessment_js_1.runTaskMapBodyCausalComparison)(request(input, brain));
        strict_1.default.equal(comparison.membershipStable, true);
        strict_1.default.equal(comparison.authorityStable, true);
        strict_1.default.equal(comparison.r1BodyInformed.root?.causalGrade, "C0_NO_DATA");
        strict_1.default.equal(comparison.rootBodyBonusDelta, 0);
    });
    (0, node_test_1.it)("does not treat single-source availability as comparable complete coverage", () => {
        const { input, brain } = fixture();
        for (const dayKey of ["2026-07-23", "2026-07-24", "2026-07-25"]) {
            addWorkEvent(input, brain, dayKey, "granola");
            addWorkEvent(input, brain, dayKey, "codex");
            addBodyDay(input, dayKey, "below_baseline");
            addCoverageReceipt(input, dayKey, "granola");
        }
        brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
        const assessment = (0, body_causal_assessment_js_1.assessTaskMapBodyCausalInput)(request(input, brain));
        strict_1.default.equal(assessment.status, "insufficient_evidence");
        strict_1.default.equal(assessment.reasonCode, "no_comparable_source_day_coverage");
        strict_1.default.equal(assessment.evidence.completeCoverageDayCount, 3);
        strict_1.default.equal(assessment.evidence.comparableCoverageDayCount, 0);
        strict_1.default.equal(assessment.causalInput, null);
    });
    (0, node_test_1.it)("does not try an above-baseline hypothesis even when it would have three matched dates", () => {
        const { input, brain } = fixture();
        input.events = input.events.filter((event) => event.recordKind !== "body_context");
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
        brain.inputDigest = (0, harness_js_1.taskMapSemanticInputDigest)(input);
        const ownerResult = (0, body_causal_assessment_js_1.evaluateTaskMapOwnerBodyPatterns)({
            taskMapInput: input,
            brain,
            now: FIXED_NOW,
        });
        strict_1.default.equal(ownerResult.policyVersion, "taskmap-owner-body-pattern-policy.1");
        strict_1.default.equal(ownerResult.projectionInputs.length, 0);
        strict_1.default.deepEqual(ownerResult.results[0].observedTargetDates, []);
        strict_1.default.deepEqual(ownerResult.results[0].matchedDates, []);
        strict_1.default.equal(ownerResult.results[0].reasonCode, "no_covered_target_body_days");
        strict_1.default.equal(ownerResult.results[0].bodyCategory, "below_baseline");
        strict_1.default.equal(ownerResult.results[0].status, "no_repeated_pattern");
    });
});
