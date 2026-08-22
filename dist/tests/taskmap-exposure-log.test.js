"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const cod_ranking_publication_js_1 = require("../src/engine/taskmap/cod-ranking-publication.js");
const exposure_log_js_1 = require("../src/engine/taskmap/exposure-log.js");
const harness_js_1 = require("../src/engine/taskmap/harness.js");
const cod_ranking_policy_js_1 = require("../src/engine/taskmap/cod-ranking-policy.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const work_control_decision_js_1 = require("../src/engine/taskmap/work-control-decision.js");
const digest = (label) => (0, source_contracts_js_1.taskMapContractDigest)(`exposure-log:${label}`);
const ROOT_ID = `tmr_${digest("root").slice(0, 16)}`;
const ZERO_SCORE = {
    sourcePriority: 0,
    deadlinePressure: 0,
    dependencyImpact: 0,
    recurrence: 0,
    staleOpen: 0,
    evidenceStrength: 0,
    bodyBonus: 0,
    total: 0,
};
function rankedTask(label, sourcePriority) {
    const id = `tmt_${digest(`task:${label}`).slice(0, 16)}`;
    return {
        id,
        rootId: ROOT_ID,
        title: `Owner work ${label}`,
        summary: `Current owner evidence ${label}`,
        reviewState: "accepted",
        openState: "open",
        authority: "source_system",
        taskHomePointerId: `session-${label}`,
        originPointerIds: [`session-${label}`],
        returnRoute: {
            state: "source_return",
            pointerId: `session-${label}`,
            requiresApproval: true,
        },
        citations: [{
                eventId: `event-${label}`,
                pointerId: `session-${label}`,
                sourceKind: "codex_session",
                sourceRefHash: digest(`ref:${label}`).slice(0, 16),
                occurredAt: "2026-08-14T12:00:00.000Z",
                extractionConfidence: 1,
            }],
        score: { ...ZERO_SCORE, sourcePriority, total: sourcePriority },
        whyNow: [],
        discoveredBy: ["agent_session"],
        bodyContextCount: 0,
    };
}
function rankingInputFixture(count = 10) {
    const tasks = Array.from({ length: count }, (_unused, index) => rankedTask(`candidate-${index + 1}`, (count - index) / Math.max(count, 1)));
    const projection = {
        contractVersion: types_js_1.TASKMAP_CONTRACT_VERSION,
        algorithmPolicyVersion: types_js_1.TASKMAP_ALGORITHM_POLICY_VERSION,
        algorithmPolicyDigest: harness_js_1.TASKMAP_ALGORITHM_POLICY_DIGEST,
        runStatus: "accepted",
        arm: "E4",
        runId: "tmrun_exposure_ranking",
        generatedAt: "2026-08-14T12:00:00.000Z",
        inputDigest: digest("ranking-input"),
        brain: null,
        sources: tasks.map((_task, index) => ({
            label: `candidate-${index + 1}`,
        })).map(({ label }) => ({
            id: `session-${label}`,
            sourceKind: "codex_session",
            authority: "source_system",
            syncMode: "reference_only",
            capabilities: ["read_task"],
        })),
        roots: [{
                id: ROOT_ID,
                title: "Owner work",
                summary: "Current accepted work",
                taskIds: tasks.map((task) => task.id),
                memberObjectRefs: tasks.map((_task, index) => `work-candidate-${index + 1}`),
                citations: [],
                causalGrade: "C0_NO_DATA",
                bodyContextCount: 0,
                scoreBreakdown: {
                    maxChildActionability: 0,
                    rootRecurrence: 0,
                    evidenceStrength: 0,
                    sourceBreadth: 0,
                    actionableLoad: 0,
                    dependencyBreadth: 0,
                    bodyBonus: 0,
                    total: 0,
                },
                score: 0,
                whyNow: [],
            }],
        tasks,
        edges: [],
        rejections: [],
        privacy: {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawBiometricsStored: false,
        },
    };
    return {
        projection,
        ownerScopeDigest: digest("ranking-owner"),
        sourceStatuses: [
            { source: "agent_session", disposition: "fresh", sliceDigest: digest("agent") },
            { source: "meeting_notes", disposition: "unavailable", sliceDigest: null },
            { source: "calendar", disposition: "unavailable", sliceDigest: null },
            { source: "body", disposition: "unavailable", sliceDigest: null },
        ],
        factors: tasks.map((task, index) => ({
            taskId: task.id,
            costOfDelayBasisPoints: (index + 1) * 1_000,
            effort: 1,
        })),
    };
}
function policy2Identity() {
    return {
        version: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION,
        digest: cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST,
    };
}
function policy1Identity() {
    return {
        version: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_VERSION,
        digest: work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST,
    };
}
function boundedCandidates(count) {
    return Array.from({ length: count }, (_unused, index) => ({
        taskId: `tmt_${String(index + 1).padStart(4, "0")}`,
        pinned: false,
    }));
}
function fixture(patch = {}) {
    const rankingInput = rankingInputFixture();
    const rankingPublication = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(rankingInput);
    return {
        candidates: rankingPublication.rankedAcceptedOpen.map((row) => ({
            taskId: row.taskId,
            pinned: false,
        })),
        displayedCount: 3,
        rankingPublication,
        rankingInput,
        ...patch,
    };
}
function policy1Fixture() {
    const rankingInput = rankingInputFixture();
    rankingInput.factors[0].effort = null;
    const rankingPublication = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(rankingInput);
    return {
        rankingInput,
        rankingPublication,
        candidates: rankingPublication.rankedAcceptedOpen.map((row) => ({
            taskId: row.taskId,
            pinned: false,
        })),
        displayedCount: 3,
    };
}
function reseal(draft) {
    const { artifactDigest: _artifactDigest, ...core } = draft;
    draft.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return draft;
}
function resealRanking(draft) {
    const { artifactDigest: _artifactDigest, ...core } = draft;
    draft.artifactDigest = (0, source_contracts_js_1.taskMapContractDigest)(core);
    return draft;
}
(0, node_test_1.describe)("Task Map exposure log", () => {
    (0, node_test_1.it)("logs the complete ordered candidate set and displays exactly its prefix", () => {
        const input = fixture();
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)(input);
        strict_1.default.equal(log.entries.length, 10);
        strict_1.default.deepEqual(log.entries.map((entry) => entry.taskId), input.candidates.map((candidate) => candidate.taskId));
        strict_1.default.deepEqual(log.entries.map((entry) => entry.displayPosition), [1, 2, 3, null, null, null, null, null, null, null]);
    });
    (0, node_test_1.it)("records exact policy.2 and run/projection/ranking bindings", () => {
        const input = fixture();
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)(input);
        strict_1.default.deepEqual(log.policy, policy2Identity());
        strict_1.default.deepEqual(log.projection, input.rankingPublication.projection);
        strict_1.default.equal(log.ownerScopeDigest, input.rankingPublication.ownerScopeDigest);
        strict_1.default.equal(log.sourceRankingArtifactDigest, input.rankingPublication.artifactDigest);
    });
    (0, node_test_1.it)("supports the exact policy.1 fallback identity without mixing identities", () => {
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)(policy1Fixture());
        strict_1.default.deepEqual(log.policy, policy1Identity());
        strict_1.default.ok(log.entries.every((entry) => Object.keys(entry).sort().join(",")
            === "displayPosition,eligibleForTraining,pinned,propensity,taskId"));
    });
    (0, node_test_1.it)("gives pinned rows no propensity and excludes them from training", () => {
        const input = fixture();
        const pinnedCandidates = input.candidates.map((candidate) => ({ ...candidate }));
        pinnedCandidates[0] = { ...pinnedCandidates[0], pinned: true };
        pinnedCandidates[7] = { ...pinnedCandidates[7], pinned: true };
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)({ ...input, candidates: pinnedCandidates });
        for (const entry of log.entries.filter((candidate) => candidate.pinned)) {
            strict_1.default.equal(entry.propensity, null);
            strict_1.default.equal(entry.eligibleForTraining, false);
        }
    });
    (0, node_test_1.it)("uses deterministic-display propensity 1 and keeps non-displayed negatives trainable", () => {
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)(fixture());
        strict_1.default.equal(log.propensitySemantics, "deterministic_display_probability.v1");
        for (const entry of log.entries) {
            if (entry.displayPosition !== null && !entry.pinned) {
                strict_1.default.equal(entry.propensity, 1);
                strict_1.default.equal(entry.eligibleForTraining, true);
            }
            else if (entry.pinned) {
                strict_1.default.equal(entry.propensity, null);
                strict_1.default.equal(entry.eligibleForTraining, false);
            }
            else {
                strict_1.default.equal(entry.propensity, 0);
                strict_1.default.equal(entry.eligibleForTraining, true);
            }
        }
    });
    (0, node_test_1.it)("derives every binding from a validated Task 6 publication and rejects candidate drift", () => {
        const rankingInput = rankingInputFixture();
        const rankingPublication = (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(rankingInput);
        const exactCandidates = rankingPublication.rankedAcceptedOpen.map((row) => ({
            taskId: row.taskId,
            pinned: false,
        }));
        const reviewedInput = {
            rankingPublication,
            rankingInput,
            candidates: exactCandidates,
            displayedCount: 1,
        };
        const log = (0, exposure_log_js_1.buildTaskMapExposureLog)(reviewedInput);
        strict_1.default.equal(log.sourceRankingArtifactDigest, rankingPublication.artifactDigest);
        strict_1.default.equal(log.ownerScopeDigest, rankingPublication.ownerScopeDigest);
        strict_1.default.deepEqual(log.projection, rankingPublication.projection);
        strict_1.default.deepEqual(log.policy, rankingPublication.policy);
        const candidateDrift = [
            [...reviewedInput.candidates].reverse(),
            reviewedInput.candidates.slice(0, -1),
            [...reviewedInput.candidates, { taskId: "tmt_extra", pinned: false }],
        ];
        for (const candidates of candidateDrift) {
            strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)({ ...reviewedInput, candidates }), /candidate.*order|ranking/i);
        }
    });
    (0, node_test_1.it)("is deterministic and has no learned-ranking path to ordering or eligibility", () => {
        const input = fixture();
        const rankingBefore = structuredClone(input.rankingPublication);
        const first = (0, exposure_log_js_1.buildTaskMapExposureLog)(input);
        const replay = (0, exposure_log_js_1.buildTaskMapExposureLog)(structuredClone(input));
        strict_1.default.deepEqual(replay, first);
        strict_1.default.deepEqual(first.authority, {
            orderingChanged: false,
            eligibilityChanged: false,
            learnedRankingApplied: false,
            pinnedRowsUsedForTraining: false,
            executionGranted: false,
        });
        strict_1.default.deepEqual(input.rankingPublication, rankingBefore);
        strict_1.default.equal(input.rankingPublication.artifactDigest, rankingBefore.artifactDigest);
        strict_1.default.deepEqual(first.privacy, {
            sourceBodiesStored: false,
            localPathsStored: false,
            rawOwnerIdentifiersStored: false,
            rawSourceObjectIdentifiersStored: false,
            rawBiometricsStored: false,
            connectorSecretsStored: false,
        });
    });
    (0, node_test_1.it)("rejects duplicate or non-canonical task IDs and invalid collection/count bounds", () => {
        const base = fixture();
        const duplicate = base.candidates.map((candidate) => ({ ...candidate }));
        duplicate[1] = { ...duplicate[1], taskId: duplicate[0].taskId };
        const invalidIds = ["", " padded", "padded ", "line\nbreak", "x".repeat(513)];
        strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)({ ...base, candidates: duplicate }), /candidate.*duplicate/i);
        for (const taskId of invalidIds) {
            const rows = base.candidates.map((candidate) => ({ ...candidate }));
            rows[0] = { taskId, pinned: false };
            strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)({ ...base, candidates: rows }), /candidate.*task id/i);
        }
        for (const displayedCount of [-1, 0.5, Number.NaN, 11]) {
            strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(fixture({ displayedCount })), /displayed count/i);
        }
        strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(fixture({
            candidates: boundedCandidates(exposure_log_js_1.TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxCandidates + 1),
        })), /candidate.*bounded/i);
        strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(fixture({
            candidates: boundedCandidates(exposure_log_js_1.TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount + 1),
            displayedCount: exposure_log_js_1.TASKMAP_EXPOSURE_LOG_LIMITS_V1.maxDisplayedCount + 1,
        })), /displayed count/i);
    });
    (0, node_test_1.it)("rejects unknown candidate keys and mismatched or re-sealed ranking bindings", () => {
        const unknownCandidate = fixture();
        unknownCandidate.candidates[0].rank = 1;
        strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(unknownCandidate), /candidate.*keys/i);
        const canonical = fixture();
        const otherInput = structuredClone(canonical.rankingInput);
        otherInput.ownerScopeDigest = digest("other-owner");
        const mismatched = {
            ...canonical,
            rankingPublication: (0, cod_ranking_publication_js_1.buildTaskMapCodRankingPublication)(otherInput),
        };
        strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(mismatched), /canonical|ranking|publication/i);
        const rankingMutations = [
            (draft) => { draft.ownerScopeDigest = "0".repeat(64); },
            (draft) => { draft.projection.runId = "tmrun_resealed_forgery"; },
            (draft) => {
                draft.policy.digest = draft.policy.version === cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_VERSION
                    ? work_control_decision_js_1.TASKMAP_WORK_CONTROL_POLICY_DIGEST
                    : cod_ranking_policy_js_1.TASKMAP_COD_RANKING_POLICY_DIGEST;
            },
            (draft) => { draft.rankedAcceptedOpen[0].taskId = "tmt_resealed_forgery"; },
        ];
        for (const mutate of rankingMutations) {
            const forged = structuredClone(canonical);
            mutate(forged.rankingPublication);
            resealRanking(forged.rankingPublication);
            strict_1.default.throws(() => (0, exposure_log_js_1.buildTaskMapExposureLog)(forged), /canonical|policy|ranking|publication/i);
        }
    });
    (0, node_test_1.it)("validates by exact keys and canonical rebuild, rejecting re-sealed tampering", () => {
        const input = fixture();
        const original = (0, exposure_log_js_1.buildTaskMapExposureLog)(input);
        strict_1.default.deepEqual((0, exposure_log_js_1.validateTaskMapExposureLog)(original, input), original);
        const mutations = [
            (draft) => { draft.entries.reverse(); },
            (draft) => { draft.entries[0].displayPosition = 2; },
            (draft) => { draft.entries[0].propensity = 0.25; },
            (draft) => { draft.entries[0].eligibleForTraining = false; },
            (draft) => { draft.entries[0].pinned = true; },
            (draft) => { draft.policy.digest = "0".repeat(64); },
            (draft) => { draft.projection.runId = "tmrun_forged"; },
            (draft) => {
                draft.authority.orderingChanged = true;
            },
            (draft) => {
                draft.authority.executionGranted = true;
            },
            (draft) => {
                draft.privacy.sourceBodiesStored = true;
            },
            (draft) => {
                draft.entries[0].score = 10;
            },
            (draft) => {
                draft.unknown = true;
            },
        ];
        for (const mutate of mutations) {
            const forged = structuredClone(original);
            mutate(forged);
            reseal(forged);
            strict_1.default.throws(() => (0, exposure_log_js_1.validateTaskMapExposureLog)(forged, input), /canonical|keys|digest|binding|entry|policy|authority|privacy/i);
        }
    });
});
