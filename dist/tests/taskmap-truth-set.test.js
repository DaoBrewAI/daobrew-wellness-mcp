"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const truth_set_js_1 = require("../src/engine/taskmap/truth-set.js");
const types_js_1 = require("../src/engine/taskmap/types.js");
const PACKAGE_ROOT = process.cwd();
const TRUTH_FIXTURE_PATH = node_path_1.default.resolve(PACKAGE_ROOT, "tests/fixtures/taskmap-p9.3/jul-27-reviewed-truth-set.json");
const OWNER_SCRIPT_PATH = node_path_1.default.resolve(PACKAGE_ROOT, "scripts/taskmap-truth-set-owner.mjs");
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
function containsLocalPathToken(value) {
    for (let index = 0; index < value.length; index += 1) {
        if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1]))
            continue;
        const remainder = value.slice(index);
        if (remainder.startsWith("/")
            || remainder.startsWith("~/")
            || remainder.startsWith("~\\")
            || remainder.startsWith("./")
            || remainder.startsWith(".\\")
            || remainder.startsWith("../")
            || remainder.startsWith("..\\")
            || /^[A-Za-z]:[\\/]/.test(remainder)
            || remainder.startsWith("\\\\")) {
            return true;
        }
    }
    return false;
}
function containsUriScheme(value) {
    for (let index = 0; index < value.length; index += 1) {
        if (index > 0 && /[A-Za-z0-9_]/.test(value[index - 1]))
            continue;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.slice(index)))
            return true;
    }
    return false;
}
function containsCommonSecret(value) {
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
function assertSafeOwnerStdout(stdout, rawIdentifiers, expected) {
    if (rawIdentifiers.some((identifier) => stdout.includes(identifier))
        || containsLocalPathToken(stdout)
        || EMAIL_TEXT.test(stdout)
        || containsUriScheme(stdout)
        || containsCommonSecret(stdout)) {
        throw new Error("owner stdout contains private content");
    }
    const parsed = JSON.parse(stdout);
    node_assert_1.default.deepStrictEqual(Object.keys(parsed).sort(), OWNER_SUMMARY_KEYS);
    node_assert_1.default.deepStrictEqual(parsed, expected);
    return parsed;
}
function readJson(filePath) {
    return JSON.parse((0, node_fs_1.readFileSync)(filePath, "utf8"));
}
function readTruthDraft() {
    return readJson(TRUTH_FIXTURE_PATH);
}
function readGeminiFixture(filename) {
    return readJson(node_path_1.default.resolve(PACKAGE_ROOT, "tests/fixtures/taskmap-p9.2", filename));
}
function designMeetingSources() {
    const design = (0, source_contracts_js_1.buildGeminiMeetSource)(readGeminiFixture("gemini-direct-discovery.json").draft);
    const hint = design.envelope.meetingIdentity;
    const calendarBinding = {
        ...design.envelope.binding,
        sourceKind: "google_calendar",
    };
    const granolaBinding = {
        connectionId: "synthetic-granola-read",
        sourceKind: "granola",
        tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-granola-workspace"),
        accountOrPrincipalDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-granola-principal"),
        grantVersion: "granola-read-v1",
    };
    const calendar = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: design.envelope.ownerScopeDigest,
        binding: calendarBinding,
        sourceKind: "google_calendar",
        objectType: "calendar_event",
        sourceObjectId: "synthetic-calendar-design-event",
        sourceRevision: "synthetic-calendar-design-revision",
        eventTime: hint.startAt,
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-calendar-content"),
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
    const granola = (0, source_contracts_js_1.buildTaskMapSourceEnvelope)({
        ownerScopeDigest: design.envelope.ownerScopeDigest,
        binding: granolaBinding,
        sourceKind: "granola",
        objectType: "meeting_note",
        sourceObjectId: "synthetic-granola-design-meeting",
        sourceRevision: "synthetic-granola-design-revision",
        eventTime: hint.startAt,
        contentDigest: (0, source_contracts_js_1.taskMapContractDigest)("synthetic-granola-content"),
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
function label(truthSet, caseKey) {
    const found = truthSet.labels.find((item) => item.caseKey === caseKey);
    node_assert_1.default.ok(found, `missing truth label ${caseKey}`);
    return found;
}
function mutateLabel(draft, caseKey, mutation) {
    return {
        ...structuredClone(draft),
        labels: draft.labels.map((item) => (item.caseKey === caseKey ? { ...item, ...mutation } : item)),
    };
}
function rawDigest(value) {
    return (0, source_contracts_js_1.taskMapContractDigest)(value);
}
function ownerPointer(rawValue, rawKey, digestKey) {
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
                calendar: ownerPointer("owner-test-calendar-z8f4", "eventId", "eventIdDigest"),
                geminiDrive: {
                    ...ownerPointer("owner-test-document-q6m2", "documentId", "documentIdDigest"),
                    ...ownerPointer("owner-test-revision-v7k9", "revisionId", "revisionIdDigest"),
                },
                gmailDiscovery: {
                    channel: "gmail_direct",
                    duplicateContentSuppressed: true,
                    ...ownerPointer("owner-test-message-d3p8", "messageId", "messageIdDigest"),
                },
                granola: ownerPointer("owner-test-granola-b5n1", "meetingId", "meetingIdDigest"),
            },
            {
                label: "weekly",
                calendar: null,
                geminiDrive: {
                    ...ownerPointer("owner-test-document-r2c7", "documentId", "documentIdDigest"),
                    ...ownerPointer("owner-test-revision-h4w6", "revisionId", "revisionIdDigest"),
                },
                gmailDiscovery: {
                    channel: "gmail_forwarded",
                    duplicateContentSuppressed: true,
                    ...ownerPointer("owner-test-message-j9t3", "messageId", "messageIdDigest"),
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
(0, node_test_1.describe)("Task Map P9.3 reviewed truth set", () => {
    (0, node_test_1.it)("keeps workClass, evidenceRole, adjudication, lifecycle, projection, and delta as independent closed axes", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        node_assert_1.default.strictEqual(truthSet.contractVersion, types_js_1.TASKMAP_TRUTH_SET_VERSION);
        node_assert_1.default.strictEqual(truthSet.labelPolicyVersion, types_js_1.TASKMAP_TRUTH_LABEL_POLICY_VERSION);
        node_assert_1.default.strictEqual(truthSet.splitPolicyVersion, types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION);
        node_assert_1.default.strictEqual(truthSet.reviewBatchPolicyVersion, types_js_1.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION);
        node_assert_1.default.match(truthSet.reviewBatchDigest, /^[a-f0-9]{64}$/);
        node_assert_1.default.strictEqual(truthSet.sourceContractVersion, types_js_1.TASKMAP_SOURCE_ENVELOPE_VERSION);
        node_assert_1.default.strictEqual(truthSet.labels.length, 29);
        node_assert_1.default.ok(Object.isFrozen(truthSet));
        node_assert_1.default.ok(Object.isFrozen(truthSet.labels[0]));
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
                node_assert_1.default.ok(Object.hasOwn(row, axis), `${row.caseKey} lacks ${axis}`);
            }
        }
        node_assert_1.default.deepStrictEqual(truthSet.overallMetrics, {
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
        node_assert_1.default.deepStrictEqual(truthSet.splitMetrics.map((item) => item.timeSplit), ["T0", "T1", "T2", "T3", "T4"]);
        node_assert_1.default.deepStrictEqual(truthSet.splitBoundaries.map((item) => item.timeSplit), ["T0", "T1", "T2", "T3", "T4"]);
        node_assert_1.default.ok(truthSet.splitBoundaries.every((item) => item.semantics === "inclusive_start_exclusive_end"));
        node_assert_1.default.strictEqual(truthSet.splitBoundaries.at(-1)?.endAt, truthSet.asOf);
        node_assert_1.default.notStrictEqual(label(truthSet, "strategy_taskmap_open").adjudication, label(truthSet, "weekly_gemini_corroboration").adjudication);
        node_assert_1.default.strictEqual(label(truthSet, "strategy_taskmap_open").workClass, label(truthSet, "weekly_gemini_corroboration").workClass);
        node_assert_1.default.strictEqual(label(truthSet, "design_system_update_merge").workClass, label(truthSet, "design_dri_checkpoint_candidate").workClass);
        node_assert_1.default.notStrictEqual(label(truthSet, "design_system_update_merge").adjudication, label(truthSet, "design_dri_checkpoint_candidate").adjudication);
    });
    (0, node_test_1.it)("rejects unknown fields, missing axes, owner-shaped refs, and collapsed label semantics", () => {
        const draft = readTruthDraft();
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)({
            ...draft,
            transcript: "forbidden source body",
        }), /forbidden or unknown fields/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)({
            ...draft,
            reviewAuthorityDigest: "a".repeat(64),
        }), /forbidden or unknown fields/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)({
            ...draft,
            asOf: "2026-07-28T04:00:00.000Z",
            reviewedAt: "2026-07-28T03:59:59.000Z",
        }), /asOf cannot follow reviewedAt/);
        const missingAxis = structuredClone(draft);
        delete missingAxis.labels[0].workClass;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(missingAxis), /unsupported truth workClass/);
        const missingRequiredReference = structuredClone(draft);
        delete missingRequiredReference.labels[0].sourceRecordRef;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(missingRequiredReference), /sourceRecordRef is required/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { sourceRecordRef: "/Users/private/task.jsonl" })), /synthetic or digest-only reference/);
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
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { subject })), /privacy-safe/);
        }
        node_assert_1.default.doesNotThrow(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { subject: "Coordinate Mac/iOS design system" })));
        for (const leaked of [
            "Read path=/root/.ssh/id_rsa",
            "Read uri=file:///root/.ssh/id_rsa",
            "Read[path=/root/.ssh/id_rsa]",
        ]) {
            node_assert_1.default.ok(containsLocalPathToken(leaked) || containsUriScheme(leaked), `independent privacy corpus missed ${leaked}`);
        }
        node_assert_1.default.strictEqual(containsLocalPathToken("Coordinate Mac/iOS"), false);
        node_assert_1.default.strictEqual(containsUriScheme("Coordinate Mac/iOS"), false);
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
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { subject })), /privacy-safe/);
        }
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "weekly_pollution_jtc", {
            workClass: "inferred_candidate",
            adjudication: "candidate_review",
            lifecycle: "awaiting_review",
        })), /candidate_review requires/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { expectedDelta: "new_candidate" })), /accepted-work delta/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { membershipContribution: 0 })), /derived membership contribution/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", {
            expectedDelta: "new_accepted_work",
            membershipContribution: 0,
        })), /derived membership contribution/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", {
            sourceKind: "github",
            labelAuthority: "reviewed_truth",
        })), /shared_accepted_work projection requires closed-list source authority|accepted_work requires source-authoritative/);
        for (const sourceKind of ["unknown", "slack"]) {
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_open", { sourceKind })), /shared_accepted_work projection requires closed-list source authority|accepted_work requires source-authoritative/);
        }
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_commit_merge", {
            sourceKind: "unknown",
            labelAuthority: "reviewed_truth",
        })), /shared_accepted_work projection requires closed-list source authority/);
        for (const sourceKind of ["gemini_meet", "unknown"]) {
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_central_truth_context", {
                sourceKind,
                labelAuthority: "reviewed_truth",
                ...(sourceKind === "gemini_meet"
                    ? { canonicalEventRef: "synthetic:event.authority-guard-probe" }
                    : {}),
            })), /strategy_durable_context projection requires Strategy source authority/);
        }
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "weekly_gemini_corroboration", { canonicalWorkRef: "synthetic:work.unreviewed-meeting-claim" })), /does not resolve to prior authoritative accepted work/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_ios_existing_update", { canonicalWorkRef: "synthetic:work.unreviewed-update-target" })), /does not resolve to prior authoritative accepted work|first later accepted work reference/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "weekly_gemini_corroboration", {
            expectedProjection: {
                strategy: "shared_accepted_work",
                taskMap: "shared_accepted_work",
            },
        })), /shared_accepted_work projection requires closed-list source authority|meeting and session merge evidence cannot claim shared accepted work/);
        const withoutStrategyMergeReason = mutateLabel(draft, "design_system_update_merge", {
            reasonCodes: label((0, truth_set_js_1.buildTaskMapTruthSet)(draft), "design_system_update_merge").reasonCodes.filter((reason) => reason !== "strategy_reviewed_existing_work_merge"),
        });
        node_assert_1.default.deepStrictEqual((0, truth_set_js_1.buildTaskMapTruthSet)(withoutStrategyMergeReason).overallMetrics, (0, truth_set_js_1.buildTaskMapTruthSet)(draft).overallMetrics);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(withoutStrategyMergeReason, "design_system_update_merge", { labelAuthority: "source_authority" })), /closed authoritative-work source allowlist/);
        const withoutStrategyBlockerReason = mutateLabel(draft, "design_dri_checkpoint_candidate", {
            reasonCodes: label((0, truth_set_js_1.buildTaskMapTruthSet)(draft), "design_dri_checkpoint_candidate").reasonCodes.filter((reason) => reason !== "strategy_blocker_candidate_review"),
        });
        node_assert_1.default.deepStrictEqual((0, truth_set_js_1.buildTaskMapTruthSet)(withoutStrategyBlockerReason).overallMetrics, (0, truth_set_js_1.buildTaskMapTruthSet)(draft).overallMetrics);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(withoutStrategyBlockerReason, "design_dri_checkpoint_candidate", {
            sourceKind: "gemini_meet",
            labelAuthority: "reviewed_truth",
            canonicalEventRef: "synthetic:event.design-sync-2026-07-27",
        })), /taskmap_candidate_review projection requires Strategy candidate authority|candidate_review must be Strategy-backed/);
        const completedWorkRef = label((0, truth_set_js_1.buildTaskMapTruthSet)(draft), "p8_real_data_acceptance_completed").canonicalWorkRef;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "design_dri_checkpoint_candidate", { canonicalWorkRef: completedWorkRef })), /cannot reopen a completed or superseded|terminal work rejects same-split or later live semantics/);
        const supersededWorkRef = label((0, truth_set_js_1.buildTaskMapTruthSet)(draft), "p7_founder_gate_superseded").canonicalWorkRef;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_taskmap_commit_merge", { canonicalWorkRef: supersededWorkRef })), /cannot reopen a completed or superseded|terminal work rejects same-split or later live semantics/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(withoutStrategyBlockerReason, "design_dri_checkpoint_candidate", {
            labelAuthority: "reviewed_truth",
        })), /taskmap_candidate_review projection requires Strategy candidate authority|Strategy truth labels must retain Strategy source authority/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(withoutStrategyBlockerReason, "design_dri_checkpoint_candidate", {
            canonicalEventRef: "synthetic:event.design-sync-2026-07-27",
        })), /taskmap_candidate_review projection requires Strategy candidate authority|candidate_review must be Strategy-backed/);
        const forged = structuredClone((0, truth_set_js_1.buildTaskMapTruthSet)(draft));
        forged.labels[0] = {
            ...forged.labels[0],
            labelId: "tmtruthlabel_attackerchosen",
        };
        node_assert_1.default.throws(() => (0, truth_set_js_1.assertTaskMapTruthSet)(forged), /derived identity is invalid/);
        const forgedReviewBatch = structuredClone((0, truth_set_js_1.buildTaskMapTruthSet)(draft));
        forgedReviewBatch.reviewBatchDigest = "a".repeat(64);
        node_assert_1.default.throws(() => (0, truth_set_js_1.assertTaskMapTruthSet)(forgedReviewBatch), /invalid derived fields/);
    });
    (0, node_test_1.it)("maps direct Gmail to design, forwarded Gmail to weekly, keeps Gmail semantically neutral, and invents no weekly Calendar", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
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
        node_assert_1.default.strictEqual(new Set(designEventRefs).size, 1);
        node_assert_1.default.strictEqual(new Set(weeklyEventRefs).size, 1);
        node_assert_1.default.strictEqual(direct.discoveryChannel, "gmail_direct");
        node_assert_1.default.strictEqual(forwarded.discoveryChannel, "gmail_forwarded");
        node_assert_1.default.notStrictEqual(direct.canonicalEventRef, forwarded.canonicalEventRef);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "design_granola_degraded_duplicate", {
            canonicalEventRef: forwarded.canonicalEventRef,
            timeSplit: "T1",
        })), /exact canonical-event parity/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "design_granola_degraded_duplicate", { timeSplit: "T4" })), /canonical event cannot span multiple truth time splits/);
        node_assert_1.default.ok(!truthSet.labels.some((item) => (item.sourceKind === "google_calendar"
            && item.canonicalEventRef === forwarded.canonicalEventRef)));
        for (const gmail of truthSet.labels.filter((item) => item.sourceKind === "gmail")) {
            node_assert_1.default.strictEqual(gmail.evidenceRole, "discovery_pointer");
            node_assert_1.default.strictEqual(gmail.adjudication, "exclude_duplicate");
            node_assert_1.default.strictEqual(gmail.expectedDelta, "none");
            node_assert_1.default.strictEqual(gmail.recurrenceContribution, 0);
            node_assert_1.default.strictEqual(gmail.membershipContribution, 0);
        }
        for (const caseKey of [
            "weekly_gmail_forwarded_discovery",
            "design_calendar_identity_anchor",
            "design_gemini_primary_variant",
            "design_granola_degraded_duplicate",
        ]) {
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), caseKey, { canonicalEventRef: undefined })), /meeting and discovery source rows require a canonicalEventRef/);
        }
        const eventlessMeetingMasquerade = structuredClone(readTruthDraft());
        const eventless = eventlessMeetingMasquerade.labels.find((item) => item.caseKey === "codex_root_continues_taskmap");
        node_assert_1.default.ok(eventless);
        eventless.sourceKind = "gemini_meet";
        delete eventless.sessionRole;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(eventlessMeetingMasquerade), /meeting and discovery source rows require a canonicalEventRef/);
        const directFixture = readGeminiFixture("gemini-direct-discovery.json").draft;
        const builtDirect = (0, source_contracts_js_1.buildGeminiMeetSource)(directFixture);
        const driveOnly = (0, source_contracts_js_1.buildGeminiMeetSource)({
            ...directFixture,
            gmailDiscoveries: [],
        });
        node_assert_1.default.strictEqual((0, source_contracts_js_1.buildTaskMapSourceSnapshot)([builtDirect.envelope], builtDirect.discoveryPointers).semanticInputDigest, (0, source_contracts_js_1.buildTaskMapSourceSnapshot)([driveOnly.envelope], []).semanticInputDigest);
        const forwardedFixture = readGeminiFixture("gemini-forwarded-discovery.json").draft;
        node_assert_1.default.strictEqual((0, source_contracts_js_1.buildGeminiMeetSource)(forwardedFixture).envelope.meetingIdentity
            ?.calendarEventIdDigest, undefined);
    });
    (0, node_test_1.it)("deduplicates missing and different meeting ends into one design event and counts recurrence once", () => {
        const { design, calendar, granola } = designMeetingSources();
        node_assert_1.default.strictEqual(granola.meetingIdentity?.endAt, undefined);
        node_assert_1.default.strictEqual(calendar.meetingIdentity?.endAt, "2026-07-28T02:15:00.000Z");
        node_assert_1.default.strictEqual(design.envelope.meetingIdentity?.endAt, "2026-07-28T02:30:00.000Z");
        const canonical = (0, source_contracts_js_1.canonicalizeTaskMapMeetings)([
            granola,
            design.envelope,
            calendar,
        ]);
        node_assert_1.default.strictEqual(canonical.length, 1);
        node_assert_1.default.strictEqual(canonical[0].identityMethod, "calendar_event");
        node_assert_1.default.strictEqual(canonical[0].evidenceVariantEnvelopeIds.length, 2);
        node_assert_1.default.strictEqual(canonical[0].calendarEnvelopeIds.length, 1);
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        const designRef = label(truthSet, "design_gemini_primary_variant").canonicalEventRef;
        const designRows = truthSet.labels.filter((item) => item.canonicalEventRef === designRef);
        node_assert_1.default.strictEqual(designRows.reduce((sum, item) => sum + item.recurrenceContribution, 0), 1);
        node_assert_1.default.strictEqual(label(truthSet, "design_granola_degraded_duplicate")
            .recurrenceContribution, 0);
    });
    (0, node_test_1.it)("keeps merge, pollution, T0-T4 metrics, and byte replay stable under input ordering", () => {
        const draft = readTruthDraft();
        const first = (0, truth_set_js_1.buildTaskMapTruthSet)(draft);
        const reorderedDraft = structuredClone(draft);
        reorderedDraft.labels.reverse();
        reorderedDraft.splitBoundaries.reverse();
        reorderedDraft.expectedSplitMetrics.reverse();
        for (const row of reorderedDraft.labels)
            row.reasonCodes.reverse();
        const replay = (0, truth_set_js_1.buildTaskMapTruthSet)(reorderedDraft);
        node_assert_1.default.deepStrictEqual(replay, first);
        node_assert_1.default.strictEqual((0, truth_set_js_1.taskMapTruthSetCanonicalJson)(replay), (0, truth_set_js_1.taskMapTruthSetCanonicalJson)(first));
        node_assert_1.default.strictEqual(replay.truthSetDigest, first.truthSetDigest);
        node_assert_1.default.strictEqual(replay.truthSetId, first.truthSetId);
        node_assert_1.default.strictEqual(label(first, "design_system_update_merge").canonicalWorkRef, label(first, "strategy_ios_approval_blocked").canonicalWorkRef);
        node_assert_1.default.deepStrictEqual(first.labels
            .filter((item) => item.adjudication === "reject_pollution")
            .map((item) => item.subject)
            .sort(), [
            "100",
            "Connect Background",
            "Contact Party",
            "Delegation wrapper is not work",
            "JTC",
            "Spin up mission",
            "Valencia",
        ].sort());
    });
    (0, node_test_1.it)("rejects a non-work row rewritten as an existing-work merge even when aggregate metrics are forged", () => {
        const draft = mutateLabel(readTruthDraft(), "weekly_pollution_jtc", {
            canonicalWorkRef: "synthetic:work.taskmap.productization",
            adjudication: "merge_into_existing",
            lifecycle: "open",
            expectedDelta: "merge_existing_work",
        });
        const t1 = draft.expectedSplitMetrics.find((item) => item.timeSplit === "T1");
        node_assert_1.default.ok(t1);
        t1.metrics.mergeIntoExistingCount += 1;
        t1.metrics.pollutionRejectionCount -= 1;
        draft.expectedOverallMetrics.mergeIntoExistingCount += 1;
        draft.expectedOverallMetrics.pollutionRejectionCount -= 1;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(draft), /non_work is exactly the reject_pollution lane|merge_into_existing/);
    });
    (0, node_test_1.it)("deduplicates the continuing root and delegated subagents while rejecting wrappers", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        const root = label(truthSet, "codex_root_continues_taskmap");
        const subagents = truthSet.labels.filter((item) => item.sessionRole === "subagent");
        const wrapper = label(truthSet, "codex_wrapper_rejected");
        node_assert_1.default.strictEqual(root.expectedDelta, "merge_existing_work");
        node_assert_1.default.strictEqual(root.recurrenceContribution, 0);
        node_assert_1.default.ok(subagents.length >= 2);
        node_assert_1.default.ok(subagents.every((item) => (item.canonicalWorkRef === root.canonicalWorkRef
            && item.evidenceRole === "delegated_execution"
            && item.adjudication === "exclude_duplicate"
            && item.recurrenceContribution === 0)));
        node_assert_1.default.strictEqual(wrapper.workClass, "non_work");
        node_assert_1.default.strictEqual(wrapper.adjudication, "reject_pollution");
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "codex_subagent_truthset_delegated", { recurrenceContribution: 1 })), /exclude_duplicate must be projection- and contribution-neutral|subagent sessions are delegated duplicates/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "codex_root_continues_taskmap", { expectedDelta: "new_root" })), /merge_into_existing requires live canonical work and no new membership|continuing root session cannot/);
    });
    (0, node_test_1.it)("requires every local agent-session row to declare its root, subagent, or wrapper role", () => {
        const missingRootRole = structuredClone(readTruthDraft());
        const root = missingRootRole.labels.find((item) => item.caseKey === "codex_root_continues_taskmap");
        node_assert_1.default.ok(root);
        delete root.sessionRole;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(missingRootRole), /every local agent-session source requires an explicit sessionRole/);
        const forgedWrapper = structuredClone(readTruthDraft());
        const wrapper = forgedWrapper.labels.find((item) => item.caseKey === "codex_wrapper_rejected");
        node_assert_1.default.ok(wrapper);
        delete wrapper.sessionRole;
        Object.assign(wrapper, {
            canonicalWorkRef: "synthetic:work.taskmap.productization",
            workClass: "explicit_work",
            evidenceRole: "corroborating_variant",
            adjudication: "merge_into_existing",
            lifecycle: "open",
            expectedDelta: "merge_existing_work",
        });
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(forgedWrapper), /every local agent-session source requires an explicit sessionRole/);
        for (const caseKey of [
            "codex_subagent_truthset_delegated",
            "codex_wrapper_rejected",
        ]) {
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), caseKey, {
                canonicalWorkRef: undefined,
                canonicalEventRef: "synthetic:event.fake-session-link",
            })), /every local agent-session source requires a canonicalWorkRef/);
            node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), caseKey, { canonicalWorkRef: "synthetic:work.never-authoritative" })), /agent-session canonicalWorkRef requires earlier authoritative membership/);
        }
    });
    (0, node_test_1.it)("prevents completed and superseded work from reopening", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        for (const terminal of [
            label(truthSet, "p8_real_data_acceptance_completed"),
            label(truthSet, "p7_founder_gate_superseded"),
        ]) {
            node_assert_1.default.strictEqual(terminal.expectedDelta, "none");
            node_assert_1.default.strictEqual(terminal.recurrenceContribution, 0);
            node_assert_1.default.strictEqual(terminal.membershipContribution, 0);
        }
        node_assert_1.default.strictEqual(truthSet.overallMetrics.falseReopenCount, 0);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "p8_real_data_acceptance_completed", { expectedDelta: "update_existing_work" })), /completed or superseded work cannot reopen/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "p7_founder_gate_superseded", { membershipContribution: 1 })), /completed or superseded work cannot reopen|derived membership contribution/);
        const sameSplit = readTruthDraft();
        const supersededRef = sameSplit.labels.find((item) => item.caseKey === "p7_founder_gate_superseded")?.canonicalWorkRef;
        node_assert_1.default.ok(supersededRef);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(sameSplit, "strategy_fundraising_open", { canonicalWorkRef: supersededRef })), /terminal work rejects same-split or later live semantics/);
        const completedRef = readTruthDraft().labels.find((item) => item.caseKey === "p8_real_data_acceptance_completed")?.canonicalWorkRef;
        node_assert_1.default.ok(completedRef);
        const validHistoricalResolution = (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "strategy_fundraising_open", { canonicalWorkRef: completedRef }));
        for (const target of ["strategy", "task_map"]) {
            const projection = (0, truth_set_js_1.buildTaskMapTruthProjectionTarget)(validHistoricalResolution, target);
            const projectedRecord = projection.records.find((item) => (item.sourceIdentityDigest
                === (0, source_contracts_js_1.taskMapContractDigest)(`truth-source:${completedRef}`)));
            node_assert_1.default.ok(projectedRecord);
            node_assert_1.default.strictEqual(projectedRecord.lifecycle, "resolved");
        }
        node_assert_1.default.deepStrictEqual((0, truth_set_js_1.compareTaskMapTruthSetProjectionParity)(validHistoricalResolution).failures, []);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "strategy_ios_existing_update", { canonicalWorkRef: completedRef })), /terminal work rejects same-split or later live semantics/);
        const projectionCollision = mutateLabel(readTruthDraft(), "strategy_central_truth_context", { canonicalWorkRef: supersededRef });
        const collisionTruth = (0, truth_set_js_1.buildTaskMapTruthSet)(projectionCollision);
        node_assert_1.default.throws(() => (0, truth_set_js_1.compareTaskMapTruthSetProjectionParity)(collisionTruth), /projection record cannot overwrite a terminal lifecycle/);
    });
    (0, node_test_1.it)("counts membership by unique canonical work ref and rejects duplicate contributors", () => {
        const draft = readTruthDraft();
        const taskMapRef = draft.labels.find((item) => item.caseKey === "strategy_taskmap_open")?.canonicalWorkRef;
        node_assert_1.default.ok(taskMapRef);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(draft, "strategy_fundraising_open", { canonicalWorkRef: taskMapRef })), /canonical work reference may contribute Task Map membership at most once/);
    });
    (0, node_test_1.it)("requires a first later accepted work ref to declare its creation delta", () => {
        const draft = mutateLabel(readTruthDraft(), "strategy_taskmap_commit_merge", {
            canonicalWorkRef: "synthetic:work.new-later-accepted",
            evidenceRole: "primary_authority",
            adjudication: "accepted_work",
            expectedDelta: "none",
            membershipContribution: 1,
        });
        const t4 = draft.expectedSplitMetrics.find((item) => item.timeSplit === "T4");
        node_assert_1.default.ok(t4);
        t4.metrics.membershipContribution += 1;
        t4.metrics.mergeIntoExistingCount -= 1;
        draft.expectedOverallMetrics.membershipContribution += 1;
        draft.expectedOverallMetrics.mergeIntoExistingCount -= 1;
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(draft), /nonterminal accepted_work with delta none is limited to the T0 baseline/);
    });
    (0, node_test_1.it)("keeps Oura post-membership only and preserves the membership signature when body is masked", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        const oura = label(truthSet, "oura_context_membership_neutral");
        node_assert_1.default.strictEqual(oura.workClass, "context_only");
        node_assert_1.default.strictEqual(oura.adjudication, "context_only");
        node_assert_1.default.strictEqual(oura.membershipContribution, 0);
        node_assert_1.default.strictEqual(oura.recurrenceContribution, 0);
        node_assert_1.default.strictEqual((0, truth_set_js_1.taskMapTruthSetMembershipSignature)(truthSet), (0, truth_set_js_1.taskMapTruthSetMembershipSignature)(truthSet, true));
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "oura_context_membership_neutral", { membershipContribution: 1 })), /context_only cannot become accepted or candidate work|Oura is post-membership context only/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "oura_context_membership_neutral", { evidenceRole: "primary_authority" })), /Oura is corroborating post-membership context or explicit unlinked coverage only/);
        node_assert_1.default.throws(() => (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "oura_context_membership_neutral", { canonicalWorkRef: "synthetic:work.never-accepted" })), /linked Oura context requires earlier membership-bearing accepted work/);
        const unlinked = (0, truth_set_js_1.buildTaskMapTruthSet)(mutateLabel(readTruthDraft(), "oura_context_membership_neutral", {
            canonicalWorkRef: undefined,
            reasonCodes: ["unlinked_body_coverage"],
        }));
        node_assert_1.default.strictEqual(label(unlinked, "oura_context_membership_neutral").canonicalWorkRef, undefined);
    });
    (0, node_test_1.it)("passes Strategy/Task Map parity with one iOS update, one DRI candidate, and no automatic accepted task or root", () => {
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        const parity = (0, truth_set_js_1.compareTaskMapTruthSetProjectionParity)(truthSet);
        node_assert_1.default.deepStrictEqual(parity.failures, []);
        node_assert_1.default.strictEqual(parity.intentionalDifferences.length, 4);
        node_assert_1.default.strictEqual(truthSet.overallMetrics.newRootCount, 0);
        node_assert_1.default.strictEqual(truthSet.overallMetrics.newAcceptedWorkCount, 0);
        node_assert_1.default.strictEqual(truthSet.overallMetrics.updatedExistingWorkCount, 1);
        node_assert_1.default.strictEqual(truthSet.overallMetrics.candidateReviewCount, 1);
        node_assert_1.default.strictEqual(truthSet.overallMetrics.automaticAcceptedFromMeetingOrSessionCount, 0);
        node_assert_1.default.strictEqual(label(truthSet, "strategy_ios_existing_update").canonicalWorkRef, label(truthSet, "strategy_ios_approval_blocked").canonicalWorkRef);
        node_assert_1.default.strictEqual(label(truthSet, "design_dri_checkpoint_candidate").adjudication, "candidate_review");
        const mergedDesignCandidate = label(truthSet, "design_system_update_merge");
        node_assert_1.default.strictEqual(mergedDesignCandidate.sourceKind, "gemini_meet");
        node_assert_1.default.strictEqual(mergedDesignCandidate.evidenceRole, "corroborating_variant");
        node_assert_1.default.strictEqual(mergedDesignCandidate.labelAuthority, "reviewed_truth");
        node_assert_1.default.ok(mergedDesignCandidate.reasonCodes.includes("strategy_reviewed_existing_work_merge"));
        node_assert_1.default.strictEqual(mergedDesignCandidate.canonicalWorkRef, label(truthSet, "strategy_ios_approval_blocked").canonicalWorkRef);
        const strategyBlockerCandidate = label(truthSet, "design_dri_checkpoint_candidate");
        node_assert_1.default.strictEqual(strategyBlockerCandidate.sourceKind, "strategy");
        node_assert_1.default.strictEqual(strategyBlockerCandidate.evidenceRole, "primary_authority");
        node_assert_1.default.strictEqual(strategyBlockerCandidate.labelAuthority, "source_authority");
        node_assert_1.default.strictEqual(strategyBlockerCandidate.canonicalEventRef, undefined);
        node_assert_1.default.ok(strategyBlockerCandidate.reasonCodes.includes("strategy_blocker_candidate_review"));
    });
    (0, node_test_1.it)("writes a digest-bound immutable owner artifact with 0700/0600 permissions and no raw IDs", () => {
        const testHome = (0, node_fs_1.mkdtempSync)(node_path_1.default.join(node_os_1.default.tmpdir(), "taskmap-truth-owner-"));
        try {
            const ownerRoot = node_path_1.default.join(testHome, "Library", "Application Support", "DaoBrew", "taskmap");
            const sourceRun = node_path_1.default.join(ownerRoot, "p9.2-synthetic-owner-source");
            (0, node_fs_1.mkdirSync)(sourceRun, { recursive: true, mode: 0o700 });
            (0, node_fs_1.chmodSync)(ownerRoot, 0o700);
            (0, node_fs_1.chmodSync)(sourceRun, 0o700);
            const sourceManifestPath = node_path_1.default.join(sourceRun, "owner-live-source-manifest.json");
            const sourceManifest = syntheticOwnerManifest();
            (0, node_fs_1.writeFileSync)(sourceManifestPath, `${JSON.stringify(sourceManifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            (0, node_fs_1.chmodSync)(sourceManifestPath, 0o600);
            const runId = "p9.3-synthetic-truth-run";
            const independentlyReviewedTruth = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
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
            const first = (0, node_child_process_1.spawnSync)(process.execPath, args, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.strictEqual(first.status, 0, first.stderr);
            const outputDirectory = node_path_1.default.join(ownerRoot, runId);
            const outputPath = node_path_1.default.join(outputDirectory, "taskmap-truth-set.v2.json");
            node_assert_1.default.strictEqual((0, node_fs_1.statSync)(outputDirectory).mode & 0o777, 0o700);
            node_assert_1.default.strictEqual((0, node_fs_1.statSync)(outputPath).mode & 0o777, 0o600);
            const artifact = readJson(outputPath);
            const rawIdentifiers = sourceManifest.sources.flatMap((row) => [
                row.calendar?.eventId,
                row.geminiDrive.documentId,
                row.geminiDrive.revisionId,
                row.gmailDiscovery.messageId,
                row.granola?.meetingId,
            ]).filter((value) => value !== undefined);
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
            const summary = assertSafeOwnerStdout(first.stdout, rawIdentifiers, expectedSummary);
            node_assert_1.default.throws(() => assertSafeOwnerStdout(`${JSON.stringify({
                ...summary,
                sensitivePath: "/private/taskmap/owner.json",
            })}\n`, rawIdentifiers, expectedSummary), /owner stdout contains private content/);
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
                node_assert_1.default.throws(() => assertSafeOwnerStdout(`${JSON.stringify({
                    ...summary,
                    detail: extraValue,
                })}\n`, rawIdentifiers, expectedSummary), /owner stdout contains private content/);
            }
            const { artifactDigest, ...core } = artifact;
            node_assert_1.default.strictEqual(artifactDigest, (0, source_contracts_js_1.taskMapContractDigest)(core));
            const serialized = JSON.stringify(artifact);
            node_assert_1.default.ok(rawIdentifiers.every((identifier) => !serialized.includes(identifier)));
            node_assert_1.default.ok(!serialized.includes(TRUTH_FIXTURE_PATH));
            node_assert_1.default.ok(!serialized.includes("@"));
            node_assert_1.default.deepStrictEqual({
                sourceCapturedAt: artifact.sourceCapturedAt,
                truthAsOf: artifact.truthAsOf,
                truthReviewedAt: artifact.truthReviewedAt,
                createdAt: artifact.createdAt,
            }, {
                sourceCapturedAt: "2026-07-28T03:45:00.000Z",
                truthAsOf: "2026-07-28T04:21:31.000Z",
                truthReviewedAt: "2026-07-28T04:21:40.000Z",
                createdAt: "2026-07-28T06:45:00.000Z",
            });
            node_assert_1.default.strictEqual(artifact.splitPolicyVersion, types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION);
            node_assert_1.default.strictEqual(artifact.reviewBatchPolicyVersion, types_js_1.TASKMAP_TRUTH_REVIEW_BATCH_POLICY_VERSION);
            node_assert_1.default.strictEqual(artifact.reviewAttestationVersion, "taskmap-owner-review-attestation.v2");
            node_assert_1.default.strictEqual(artifact.expectedTruthSetDigest, independentlyReviewedTruth.truthSetDigest);
            node_assert_1.default.strictEqual(artifact.expectedReviewBatchDigest, independentlyReviewedTruth.reviewBatchDigest);
            node_assert_1.default.strictEqual(artifact.reviewAttestationDigest, (0, source_contracts_js_1.taskMapContractDigest)({
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
            }));
            node_assert_1.default.strictEqual(artifact.overallMetrics
                .canonicalMeetingCount, 2);
            node_assert_1.default.deepStrictEqual(artifact.splitBoundaries
                .map((boundary) => boundary.timeSplit), ["T0", "T1", "T2", "T3", "T4"]);
            const forgedMeetingDraft = structuredClone(readTruthDraft());
            const forgedMeetingRow = forgedMeetingDraft.labels.find((item) => item.caseKey === "weekly_pollution_jtc");
            node_assert_1.default.ok(forgedMeetingRow);
            forgedMeetingRow.canonicalEventRef = "synthetic:event.forged-third";
            forgedMeetingDraft.expectedOverallMetrics.canonicalMeetingCount = 3;
            const forgedT1 = forgedMeetingDraft.expectedSplitMetrics.find((item) => item.timeSplit === "T1");
            node_assert_1.default.ok(forgedT1);
            forgedT1.metrics.canonicalMeetingCount = 2;
            node_assert_1.default.strictEqual((0, truth_set_js_1.buildTaskMapTruthSet)(forgedMeetingDraft).overallMetrics
                .canonicalMeetingCount, 3);
            const forgedFixturePath = node_path_1.default.join(testHome, "forged-third-canonical-meeting.json");
            (0, node_fs_1.writeFileSync)(forgedFixturePath, `${JSON.stringify(forgedMeetingDraft, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            const forgedMeetingRunId = "p9.3-forged-third-canonical-meeting";
            const forgedMeetingArgs = args.map((value, index) => {
                if (args[index - 1] === "--truth-set-fixture") {
                    return forgedFixturePath;
                }
                if (args[index - 1] === "--run-id")
                    return forgedMeetingRunId;
                return value;
            });
            const forgedMeeting = (0, node_child_process_1.spawnSync)(process.execPath, forgedMeetingArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(forgedMeeting.status, 0);
            node_assert_1.default.match(forgedMeeting.stderr, /does not match the independently reviewed digest/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, forgedMeetingRunId)), false);
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
            const extraContextT4 = extraContextDraft.expectedSplitMetrics.find((item) => item.timeSplit === "T4");
            node_assert_1.default.ok(extraContextT4);
            extraContextT4.metrics.labelCount += 1;
            extraContextDraft.expectedOverallMetrics.labelCount += 1;
            node_assert_1.default.strictEqual((0, truth_set_js_1.buildTaskMapTruthSet)(extraContextDraft).overallMetrics.labelCount, 30);
            const extraContextFixturePath = node_path_1.default.join(testHome, "forged-extra-safe-context.json");
            (0, node_fs_1.writeFileSync)(extraContextFixturePath, `${JSON.stringify(extraContextDraft, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            const extraContextRunId = "p9.3-forged-extra-safe-context";
            const extraContextArgs = args.map((value, index) => {
                if (args[index - 1] === "--truth-set-fixture") {
                    return extraContextFixturePath;
                }
                if (args[index - 1] === "--run-id")
                    return extraContextRunId;
                return value;
            });
            const extraContext = (0, node_child_process_1.spawnSync)(process.execPath, extraContextArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(extraContext.status, 0);
            node_assert_1.default.match(extraContext.stderr, /does not match the independently reviewed digest/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, extraContextRunId)), false);
            const substitutedDraft = mutateLabel(readTruthDraft(), "strategy_admin_plane_context", {
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
            });
            const substitutedTruth = (0, truth_set_js_1.buildTaskMapTruthSet)(substitutedDraft);
            node_assert_1.default.deepStrictEqual(substitutedTruth.overallMetrics, independentlyReviewedTruth.overallMetrics);
            node_assert_1.default.notStrictEqual(substitutedTruth.truthSetDigest, independentlyReviewedTruth.truthSetDigest);
            const substitutedFixturePath = node_path_1.default.join(testHome, "forged-same-metrics-substitution.json");
            (0, node_fs_1.writeFileSync)(substitutedFixturePath, `${JSON.stringify(substitutedDraft, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            const substitutedRunId = "p9.3-forged-same-metrics-substitution";
            const substitutedArgs = args.map((value, index) => {
                if (args[index - 1] === "--truth-set-fixture") {
                    return substitutedFixturePath;
                }
                if (args[index - 1] === "--run-id")
                    return substitutedRunId;
                return value;
            });
            const substituted = (0, node_child_process_1.spawnSync)(process.execPath, substitutedArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(substituted.status, 0);
            node_assert_1.default.match(substituted.stderr, /does not match the independently reviewed digest/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, substitutedRunId)), false);
            const wrongBatchRunId = "p9.3-forged-review-batch";
            const wrongBatchArgs = args.map((value, index) => {
                if (args[index - 1] === "--expected-review-batch-digest") {
                    return "a".repeat(64);
                }
                if (args[index - 1] === "--run-id")
                    return wrongBatchRunId;
                return value;
            });
            const wrongBatch = (0, node_child_process_1.spawnSync)(process.execPath, wrongBatchArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(wrongBatch.status, 0);
            node_assert_1.default.match(wrongBatch.stderr, /does not match the independently reviewed batch digest/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, wrongBatchRunId)), false);
            const second = (0, node_child_process_1.spawnSync)(process.execPath, args, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(second.status, 0);
            node_assert_1.default.match(second.stderr, /run already exists/);
            node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractDigest)(readJson(outputPath)), (0, source_contracts_js_1.taskMapContractDigest)(artifact));
            const futureSourceRun = node_path_1.default.join(ownerRoot, "p9.2-synthetic-source-after-truth");
            (0, node_fs_1.mkdirSync)(futureSourceRun, { mode: 0o700 });
            (0, node_fs_1.chmodSync)(futureSourceRun, 0o700);
            const futureSourceManifestPath = node_path_1.default.join(futureSourceRun, "owner-live-source-manifest.json");
            (0, node_fs_1.writeFileSync)(futureSourceManifestPath, `${JSON.stringify({
                ...sourceManifest,
                capturedAt: "2026-07-28T04:21:31.001Z",
            }, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            (0, node_fs_1.chmodSync)(futureSourceManifestPath, 0o600);
            const sourceAfterTruthRunId = "p9.3-source-after-truth";
            const sourceAfterTruthArgs = args.map((value, index) => {
                if (args[index - 1] === "--source-manifest") {
                    return futureSourceManifestPath;
                }
                if (args[index - 1] === "--run-id")
                    return sourceAfterTruthRunId;
                return value;
            });
            const sourceAfterTruth = (0, node_child_process_1.spawnSync)(process.execPath, sourceAfterTruthArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(sourceAfterTruth.status, 0);
            node_assert_1.default.match(sourceAfterTruth.stderr, /capturedAt cannot follow truth asOf/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, sourceAfterTruthRunId)), false);
            const createdBeforeReviewRunId = "p9.3-created-before-review";
            const createdBeforeReviewArgs = args.map((value, index) => {
                if (args[index - 1] === "--run-id")
                    return createdBeforeReviewRunId;
                if (args[index - 1] === "--now")
                    return "2026-07-28T04:21:39.999Z";
                return value;
            });
            const createdBeforeReview = (0, node_child_process_1.spawnSync)(process.execPath, createdBeforeReviewArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(createdBeforeReview.status, 0);
            node_assert_1.default.match(createdBeforeReview.stderr, /reviewedAt cannot follow owner artifact createdAt/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, createdBeforeReviewRunId)), false);
            const invalidDigestSourceRun = node_path_1.default.join(ownerRoot, "p9.3-synthetic-invalid-pointer-digest");
            (0, node_fs_1.mkdirSync)(invalidDigestSourceRun, { mode: 0o700 });
            (0, node_fs_1.chmodSync)(invalidDigestSourceRun, 0o700);
            const invalidDigestManifestPath = node_path_1.default.join(invalidDigestSourceRun, "owner-live-source-manifest.json");
            const invalidDigestManifest = structuredClone(sourceManifest);
            invalidDigestManifest.sources[0].geminiDrive.documentIdDigest =
                "0".repeat(64);
            (0, node_fs_1.writeFileSync)(invalidDigestManifestPath, `${JSON.stringify(invalidDigestManifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
            (0, node_fs_1.chmodSync)(invalidDigestManifestPath, 0o600);
            const invalidDigestRunId = "p9.3-invalid-pointer-digest";
            const invalidDigestArgs = args.map((value, index) => {
                if (args[index - 1] === "--source-manifest") {
                    return invalidDigestManifestPath;
                }
                if (args[index - 1] === "--run-id")
                    return invalidDigestRunId;
                return value;
            });
            const invalidDigest = (0, node_child_process_1.spawnSync)(process.execPath, invalidDigestArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(invalidDigest.status, 0);
            node_assert_1.default.match(invalidDigest.stderr, /pointer digest is invalid/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, invalidDigestRunId)), false);
            (0, node_fs_1.chmodSync)(sourceManifestPath, 0o644);
            const insecureRunId = "p9.3-insecure-source-mode";
            const insecureArgs = args.map((value, index) => (args[index - 1] === "--run-id" ? insecureRunId : value));
            const insecure = (0, node_child_process_1.spawnSync)(process.execPath, insecureArgs, {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, HOME: testHome },
                encoding: "utf8",
            });
            node_assert_1.default.notStrictEqual(insecure.status, 0);
            node_assert_1.default.match(insecure.stderr, /owner-only before it can be read/);
            node_assert_1.default.strictEqual((0, node_fs_1.existsSync)(node_path_1.default.join(ownerRoot, insecureRunId)), false);
        }
        finally {
            (0, node_fs_1.rmSync)(testHome, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps the committed truth fixture synthetic and free of provider IDs, paths, emails, and bodies", () => {
        const fixtureText = (0, node_fs_1.readFileSync)(TRUTH_FIXTURE_PATH, "utf8");
        node_assert_1.default.strictEqual(containsLocalPathToken(fixtureText), false);
        node_assert_1.default.strictEqual(containsUriScheme(fixtureText), false);
        node_assert_1.default.ok(!fixtureText.includes("@"));
        node_assert_1.default.ok(!fixtureText.includes("https://"));
        node_assert_1.default.ok(!fixtureText.includes("documentId"));
        node_assert_1.default.ok(!fixtureText.includes("revisionId"));
        node_assert_1.default.ok(!fixtureText.includes("messageId"));
        node_assert_1.default.ok(!fixtureText.includes("meetingId"));
        node_assert_1.default.ok(!fixtureText.includes("eventId"));
        node_assert_1.default.ok(!fixtureText.includes("transcript"));
        node_assert_1.default.ok(!fixtureText.includes("sessionBody"));
        node_assert_1.default.ok(!fixtureText.includes("rawBiometric"));
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
            node_assert_1.default.ok(!fixtureText.includes(secretPrefix));
        }
        const truthSet = (0, truth_set_js_1.buildTaskMapTruthSet)(readTruthDraft());
        node_assert_1.default.strictEqual((0, source_contracts_js_1.taskMapContractCanonicalJson)((0, truth_set_js_1.assertTaskMapTruthSet)(truthSet)), (0, truth_set_js_1.taskMapTruthSetCanonicalJson)(truthSet));
        node_assert_1.default.strictEqual(readTruthDraft().contractVersion, types_js_1.TASKMAP_TRUTH_SET_DRAFT_VERSION);
        node_assert_1.default.strictEqual(readTruthDraft().splitPolicyVersion, types_js_1.TASKMAP_TRUTH_TIME_SPLIT_POLICY_VERSION);
    });
});
