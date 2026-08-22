"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const text_contract_js_1 = require("../src/engine/taskmap/text-contract.js");
const tempRoots = [];
const PRODUCED_AT = "2026-07-29T12:00:00.000Z";
const VALID_THROUGH = "2026-07-29T16:00:00.000Z";
(0, node_test_1.afterEach)(() => {
    for (const root of tempRoots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { force: true, recursive: true });
    }
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function binding(sourceKind) {
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
        kind: "action_item",
        title: "Freeze meeting producer",
        summary,
        occurredAt: "2026-07-29T09:00:00.000Z",
        observedAt: "2026-07-29T11:00:00.000Z",
        status: "open",
        deadline: "2026-07-30T17:00:00.000Z",
        quality: "structured_generated",
        coverage: "partial",
        confidence: 0.8,
        objectRefs: [{
                kind: "external_reference",
                referenceDigest: digest("external-task"),
            }],
    };
}
function meeting(overrides = {}) {
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
function draft(meetings = [meeting()]) {
    return {
        ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner"),
        producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
        producedAt: PRODUCED_AT,
        meetings,
    };
}
function freshSnapshot() {
    return (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft());
}
function speechActEvidence() {
    return {
        ...evidence("Please ship the normalized meeting mention."),
        kind: "action_item",
        title: "Ship the normalized mention",
        speechActClass: "request",
        speechActActor: "self",
        mentionIdentityDigest: digest("normalized-meeting-mention"),
        extractionEnvelopeDigest: digest("complete-extraction-envelope"),
        confidence: 0.73,
    };
}
function speechActEvidenceFor(speechActClass, speechActActor, index) {
    const kind = speechActClass === "commitment"
        ? "commitment"
        : speechActClass === "decision"
            ? "decision"
            : "action_item";
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
function tempFile(filename) {
    const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-meeting-producer-"));
    tempRoots.push(root);
    return node_path_1.default.join(root, filename);
}
(0, node_test_1.describe)("Task Map meeting producer freshness", () => {
    (0, node_test_1.it)("normalizes and UTF-16 bounds semantic display text before sealing", () => {
        const loneHighSurrogate = String.fromCharCode(0xd83d);
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [{
                        ...evidence(`${"😀".repeat(120)}${loneHighSurrogate}`),
                        title: `${"😀".repeat(60)}${loneHighSurrogate}`,
                    }],
            })]));
        const row = snapshot.meetings[0].evidence[0];
        assert.ok(row.title.length <= meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxTitleCharacters);
        assert.ok(row.summary.length <= meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxSummaryCharacters);
        assert.equal((0, text_contract_js_1.toWellFormedText)(row.title), row.title);
        assert.equal((0, text_contract_js_1.toWellFormedText)(row.summary), row.summary);
        assert.equal(row.title.endsWith("…"), true);
        assert.equal(row.summary.endsWith("…"), true);
    });
    (0, node_test_1.it)("routes every speech-act/actor cell through one exhaustive obligation gate", () => {
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
        ];
        assert.deepEqual(expected.map(([speechActClass, speechActActor]) => ({
            speechActClass,
            speechActActor,
            ...(0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(speechActClass, speechActActor),
        })), expected.map(([speechActClass, speechActActor, authority, proposalDisposition, promotionEligible,]) => ({
            speechActClass,
            speechActActor,
            authority,
            proposalDisposition,
            promotionEligible,
        })));
    });
    (0, node_test_1.it)("derives persisted authority, disposition, and eligibility for all 12 cells", () => {
        const classes = ["request", "commitment", "decision", "other"];
        const actors = ["self", "other", "unknown"];
        const evidenceRows = classes.flatMap((speechActClass, classIndex) => actors.map((speechActActor, actorIndex) => speechActEvidenceFor(speechActClass, speechActActor, classIndex * actors.length + actorIndex)));
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: evidenceRows,
            })]));
        assert.equal(snapshot.meetings[0].evidence.length, 12);
        assert.equal(snapshot.meetings[0].evidence.filter((row) => row.promotionEligible)
            .length, 2);
        for (const row of snapshot.meetings[0].evidence) {
            assert.ok(row.speechActClass);
            assert.ok(row.speechActActor);
            assert.deepEqual({
                authority: row.authority,
                proposalDisposition: row.proposalDisposition,
                promotionEligible: row.promotionEligible,
            }, (0, meeting_producer_freshness_js_1.taskMapMeetingObligationGate)(row.speechActClass, row.speechActActor));
        }
        (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(snapshot);
    });
    (0, node_test_1.it)("rejects caller eligibility and forged persisted obligation fields", () => {
        const callerControlled = {
            ...speechActEvidence(),
            promotionEligible: true,
        };
        assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [callerControlled],
            })])), /unsupported key/i);
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [speechActEvidence()],
            })]));
        const mutations = [
            (row) => {
                row.authority = "provider_generated_summary";
            },
            (row) => {
                row.proposalDisposition = "context_only";
            },
            (row) => {
                row.promotionEligible = false;
            },
        ];
        for (const mutate of mutations) {
            const forged = structuredClone(snapshot);
            mutate(forged.meetings[0].evidence[0]);
            assert.throws(() => (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(forged), /authority|semantic identity|promotion/i);
        }
    });
    (0, node_test_1.it)("gives provenance decisions a normalized statement proof but leaves legacy decisions null", () => {
        const newDecision = speechActEvidenceFor("decision", "unknown", 10);
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [newDecision, {
                        ...evidence("Keep the legacy decision proof contract"),
                        kind: "decision",
                        objectRefs: undefined,
                    }],
            })]));
        const provenance = snapshot.meetings[0].evidence.find((row) => row.speechActClass === "decision");
        const legacy = snapshot.meetings[0].evidence.find((row) => row.kind === "decision" && row.speechActClass === undefined);
        assert.ok(provenance?.statementReferenceDigest);
        assert.equal(provenance.proposalDisposition, "context_only");
        assert.equal(provenance.promotionEligible, false);
        assert.ok(provenance.objectRefs.some((ref) => ref.kind === "external_reference"
            && ref.referenceDigest === provenance.statementReferenceDigest));
        assert.equal(legacy?.statementReferenceDigest, null);
        assert.equal(legacy?.objectRefs.some((ref) => ref.kind === "external_reference"), false);
    });
    (0, node_test_1.it)("preserves hard-coded legacy identities, authority, and snapshot proof byte-for-byte", () => {
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
            ownerScopeDigest: "fef82909c26b1c0cb08840a6e674fd7650c6d20bf5905615665e192282bd6477",
            producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
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
            statementReferenceDigest: "3f42f527e196fda5c92406f3494cb2ff09c8ce9c21ef45215149b39a338d1b12",
            evidenceDigest: "593287d0409d92313437d485d5e208aa8c007c623d36acbd62e7c6fe903a4cfd",
            evidenceId: "tmpe_f665115dbb4c37e9",
            snapshotDigest: "3d276ac6b5cae9466ecbb46ad083758e900c4d808bc6ee2891957970b50fa003",
            snapshotId: "tmps_20a84ac1356c8c16",
            authority: "provider_generated_summary",
        });
        assert.equal(Object.hasOwn(row, "speechActClass"), false);
        assert.equal(Object.hasOwn(row, "mentionIdentityDigest"), false);
    });
    (0, node_test_1.it)("round-trips the all-or-none speech-act provenance with explicit model confidence", () => {
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [speechActEvidence()],
            })]));
        const row = snapshot.meetings[0].evidence[0];
        assert.equal(row.speechActClass, "request");
        assert.equal(row.speechActActor, "self");
        assert.equal(row.mentionIdentityDigest, digest("normalized-meeting-mention"));
        assert.equal(row.extractionEnvelopeDigest, digest("complete-extraction-envelope"));
        assert.equal(row.confidence, 0.73);
        (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(snapshot);
    });
    (0, node_test_1.it)("rejects partial speech-act provenance and speech-act rows without own confidence", () => {
        for (const missing of [
            "speechActClass",
            "speechActActor",
            "mentionIdentityDigest",
            "extractionEnvelopeDigest",
        ]) {
            const partial = speechActEvidence();
            Reflect.deleteProperty(partial, missing);
            assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                    evidence: [partial],
                })])), /speech-act provenance/i);
        }
        const withoutConfidence = speechActEvidence();
        Reflect.deleteProperty(withoutConfidence, "confidence");
        assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [withoutConfidence],
            })])), /speech-act.*confidence|confidence.*speech-act/i);
        const undefinedConfidence = {
            ...speechActEvidence(),
            confidence: undefined,
        };
        assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [undefinedConfidence],
            })])), /speech-act.*confidence|confidence.*speech-act|confidence.*number|confidence.*between/i);
    });
    (0, node_test_1.it)("rejects speech-act provenance inconsistent with its legacy evidence kind", () => {
        for (const [speechActClass, kind] of [
            ["request", "commitment"],
            ["other", "decision"],
            ["commitment", "action_item"],
            ["decision", "commitment"],
        ]) {
            assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                    evidence: [{
                            ...speechActEvidence(),
                            speechActClass,
                            kind,
                        }],
                })])), /speech-act class.*kind/i);
        }
    });
    (0, node_test_1.it)("uses normalized mention identity plus sorted explicit work refs for only new statement identities", () => {
        const explicitRef = digest("explicit-work-one");
        const secondExplicitRef = digest("explicit-work-two");
        const rowFor = (overrides = {}) => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [{
                        ...speechActEvidence(),
                        objectRefs: [{
                                kind: "external_reference",
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
        assert.equal(original.statementReferenceDigest, displayRotated.statementReferenceDigest);
        assert.notEqual(original.evidenceDigest, displayRotated.evidenceDigest);
        assert.notEqual(original.statementReferenceDigest, mentionRotated.statementReferenceDigest);
        assert.notEqual(original.statementReferenceDigest, refsRotated.statementReferenceDigest);
        assert.equal(refsRotated.statementReferenceDigest, refsReordered.statementReferenceDigest);
        assert.equal(original.statementReferenceDigest, (0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
            kind: "action_item",
            title: original.title,
            summary: original.summary,
            explicitExternalReferenceDigests: [explicitRef],
            mentionIdentityDigest: digest("normalized-meeting-mention"),
        }));
    });
    (0, node_test_1.it)("binds every new provenance field into authenticated evidence", () => {
        const original = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [speechActEvidence()],
            })]));
        const mutations = [
            (row) => {
                row.speechActClass = "other";
            },
            (row) => {
                row.speechActActor = "unknown";
            },
            (row) => {
                row.mentionIdentityDigest = digest("forged-mention");
            },
            (row) => {
                row.extractionEnvelopeDigest = digest("forged-envelope");
            },
        ];
        for (const mutate of mutations) {
            const forged = structuredClone(original);
            mutate(forged.meetings[0].evidence[0]);
            assert.throws(() => (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(forged), /statement ref|semantic identity|promotion/i);
        }
    });
    (0, node_test_1.it)("builds a revision-bound, privacy-bounded v1 snapshot and returns it only while fresh", () => {
        const snapshot = freshSnapshot();
        assert.equal(snapshot.contractVersion, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_SNAPSHOT_VERSION);
        assert.equal(snapshot.producerVersion, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION);
        assert.equal(snapshot.maxAgeMs, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS);
        assert.equal(snapshot.validThrough, VALID_THROUGH);
        assert.equal(snapshot.meetings[0].sourceVariants[0].sourceKind, "gemini_meet");
        assert.equal(snapshot.meetings[0].evidence[0].recordKind, "work_context");
        assert.equal(snapshot.meetings[0].evidence[0].proposalDisposition, "candidate_only");
        assert.equal(snapshot.meetings[0].evidence[0].authority, "provider_generated_summary");
        assert.ok(snapshot.meetings[0].evidence[0].statementReferenceDigest);
        assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some((ref) => ref.kind === "external_reference"
            && ref.referenceDigest
                === snapshot.meetings[0].evidence[0].statementReferenceDigest));
        assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some((ref) => ref.kind === "canonical_meeting"));
        assert.ok(snapshot.meetings[0].evidence[0].objectRefs.some((ref) => ref.kind === "source_object"));
        const result = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, "2026-07-29T15:59:59.999Z");
        assert.equal(result.contractVersion, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_RESULT_VERSION);
        assert.equal(result.availability, "available");
        assert.equal(result.freshness.decision, "fresh");
        assert.equal(result.freshness.currentSemanticInputEligible, true);
        assert.equal(result.snapshot?.snapshotDigest, snapshot.snapshotDigest);
        assert.equal(result.retainedLastGood, null);
    });
    (0, node_test_1.it)("uses a half-open four-hour interval and makes boundary/stale snapshots unavailable", () => {
        const snapshot = freshSnapshot();
        const boundary = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, VALID_THROUGH);
        assert.equal(boundary.availability, "unavailable");
        assert.equal(boundary.freshness.decision, "boundary_due");
        assert.equal(boundary.snapshot, null);
        assert.deepEqual({
            snapshotDigest: boundary.retainedLastGood?.snapshotDigest,
            eligible: boundary.retainedLastGood?.eligibleForCurrentSemanticInput,
        }, {
            snapshotDigest: snapshot.snapshotDigest,
            eligible: false,
        });
        const stale = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(snapshot, "2026-07-29T16:00:00.001Z");
        assert.equal(stale.availability, "unavailable");
        assert.equal(stale.freshness.decision, "stale");
        assert.equal(stale.freshness.ageMs, meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_MAX_AGE_MS + 1);
        assert.equal(stale.snapshot, null);
        assert.equal(stale.retainedLastGood?.retainedBecause, "stale");
    });
    (0, node_test_1.it)("keeps a complete zero-meeting observation fresh-empty and distinct from a missing snapshot", async () => {
        const empty = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([]));
        assert.deepEqual(empty.meetings, []);
        assert.equal(empty.watermark.observedThrough, empty.producedAt);
        const file = tempFile("fresh-empty.json");
        (0, node_fs_1.writeFileSync)(file, JSON.stringify(empty), { mode: 0o600 });
        (0, node_fs_1.chmodSync)(file, 0o600);
        const loadedEmpty = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: file,
            assessedAt: "2026-07-29T13:00:00.000Z",
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner"),
        });
        assert.equal(loadedEmpty.availability, "available");
        assert.equal(loadedEmpty.freshness.decision, "fresh");
        assert.deepEqual(loadedEmpty.snapshot?.meetings, []);
        const missing = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: tempFile("does-not-exist.json"),
            assessedAt: "2026-07-29T13:00:00.000Z",
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner"),
        });
        assert.equal(missing.availability, "unavailable");
        assert.equal(missing.freshness.decision, "missing");
        assert.equal(missing.snapshot, null);
    });
    (0, node_test_1.it)("fails closed for missing, unknown-version, malformed, and retained-last-good inputs", async () => {
        const prior = (0, meeting_producer_freshness_js_1.taskMapMeetingProducerLastGoodRef)(freshSnapshot());
        const missing = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: tempFile("missing.json"),
            assessedAt: "2026-07-29T17:00:00.000Z",
            retainedLastGood: prior,
        });
        assert.equal(missing.freshness.decision, "missing");
        assert.equal(missing.snapshot, null);
        assert.equal(missing.retainedLastGood?.snapshotDigest, prior.snapshotDigest);
        assert.equal(missing.retainedLastGood?.eligibleForCurrentSemanticInput, false);
        const unknown = structuredClone(freshSnapshot());
        unknown.producerVersion = "taskmap-meeting-producer.future";
        const unknownResult = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(unknown, "2026-07-29T13:00:00.000Z", prior);
        assert.equal(unknownResult.freshness.decision, "unknown_version");
        assert.equal(unknownResult.snapshot, null);
        assert.equal(unknownResult.retainedLastGood?.snapshotDigest, prior.snapshotDigest);
        const malformed = structuredClone(freshSnapshot());
        malformed.meetings = [{ transcript: "private raw transcript" }];
        const malformedResult = (0, meeting_producer_freshness_js_1.assessTaskMapMeetingProducerSnapshot)(malformed, "2026-07-29T13:00:00.000Z", prior);
        assert.equal(malformedResult.freshness.decision, "malformed");
        assert.equal(malformedResult.snapshot, null);
        assert.equal(malformedResult.retainedLastGood?.eligibleForCurrentSemanticInput, false);
    });
    (0, node_test_1.it)("dedupes the same Gemini/Granola evidence as variants of one canonical meeting", () => {
        const sharedEvidence = evidence();
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
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
        assert.equal(canonical.evidence[0].supportingSourceVariantRefDigests.length, 2);
        assert.equal(canonical.evidence[0].objectRefs.filter((ref) => ref.kind === "source_object").length, 2);
        assert.equal(canonical.evidence[0].quality, "structured_generated");
        assert.equal(canonical.evidence[0].confidence, 0.8);
        assert.ok(canonical.evidence[0].statementReferenceDigest);
    });
    (0, node_test_1.it)("keeps semantic identity stable across revision rotation and occurrence identity distinct across meetings", () => {
        const first = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([
            meeting({ revisionId: "opaque-revision-1" }),
        ]));
        const rotated = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([
            meeting({ revisionId: "opaque-revision-rotated" }),
        ]));
        assert.equal(first.meetings[0].canonicalMeetingId, rotated.meetings[0].canonicalMeetingId);
        assert.equal(first.meetings[0].evidence[0].evidenceDigest, rotated.meetings[0].evidence[0].evidenceDigest);
        assert.equal(first.meetings[0].evidence[0].evidenceId, rotated.meetings[0].evidence[0].evidenceId);
        assert.notEqual(first.meetings[0].primarySourceIdentityDigest, rotated.meetings[0].primarySourceIdentityDigest);
        assert.notEqual(first.meetings[0].sourceVariants[0].sourceVariantRefDigest, rotated.meetings[0].sourceVariants[0].sourceVariantRefDigest);
        const statementWithoutExplicitRef = {
            ...evidence(),
            objectRefs: undefined,
        };
        const twoMeetings = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([
            meeting({ evidence: [statementWithoutExplicitRef] }),
            meeting({
                documentId: "a-different-doc",
                revisionId: "revision-1",
                evidence: [statementWithoutExplicitRef],
            }),
        ]));
        assert.equal(twoMeetings.meetings[0].evidence[0].evidenceDigest, twoMeetings.meetings[1].evidence[0].evidenceDigest);
        assert.notEqual(twoMeetings.meetings[0].evidence[0].evidenceId, twoMeetings.meetings[1].evidence[0].evidenceId);
        const firstExternalRefs = twoMeetings.meetings[0].evidence[0].objectRefs
            .filter((ref) => ref.kind === "external_reference");
        const secondExternalRefs = twoMeetings.meetings[1].evidence[0].objectRefs
            .filter((ref) => ref.kind === "external_reference");
        assert.deepEqual(firstExternalRefs, secondExternalRefs);
        assert.equal(firstExternalRefs.length, 1);
    });
    (0, node_test_1.it)("keeps the derived statement ref stable across status/deadline changes while evidence facets and digest rotate", () => {
        const explicitUrlRef = digest("https-url-reference-one");
        const statement = {
            ...evidence(),
            objectRefs: [{
                    kind: "external_reference",
                    referenceDigest: explicitUrlRef,
                }],
        };
        const rowFor = (status, deadline, externalReferenceDigest = explicitUrlRef) => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [{
                        ...statement,
                        status,
                        deadline,
                        objectRefs: [{
                                kind: "external_reference",
                                referenceDigest: externalReferenceDigest,
                            }],
                    }],
            })])).meetings[0].evidence[0];
        const open = rowFor("open", "2026-07-30T17:00:00.000Z");
        const done = rowFor("done", "2026-07-30T17:00:00.000Z");
        const deadlineRotated = rowFor("open", "2026-08-01T17:00:00.000Z");
        const differentUrl = rowFor("open", "2026-07-30T17:00:00.000Z", digest("https-url-reference-two"));
        const derivedRef = (row, explicitRef) => row.objectRefs.find((ref) => ref.kind === "external_reference"
            && ref.referenceDigest !== explicitRef)?.referenceDigest;
        assert.ok(derivedRef(open, explicitUrlRef));
        assert.equal(open.statementReferenceDigest, derivedRef(open, explicitUrlRef));
        assert.notEqual(open.statementReferenceDigest, explicitUrlRef);
        assert.ok(open.objectRefs.some((ref) => ref.kind === "external_reference"
            && ref.referenceDigest === explicitUrlRef));
        assert.equal(derivedRef(open, explicitUrlRef), (0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
            kind: "action_item",
            title: statement.title,
            summary: statement.summary,
            explicitExternalReferenceDigests: [explicitUrlRef],
        }));
        assert.equal(derivedRef(open, explicitUrlRef), derivedRef(done, explicitUrlRef));
        assert.equal(derivedRef(open, explicitUrlRef), derivedRef(deadlineRotated, explicitUrlRef));
        assert.notEqual(derivedRef(open, explicitUrlRef), derivedRef(differentUrl, digest("https-url-reference-two")));
        assert.equal((0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
            kind: "action_item",
            title: statement.title,
            summary: statement.summary,
            explicitExternalReferenceDigests: [
                digest("https-url-reference-two"),
                explicitUrlRef,
            ],
        }), (0, meeting_producer_freshness_js_1.taskMapMeetingStatementReferenceDigest)({
            kind: "action_item",
            title: statement.title,
            summary: statement.summary,
            explicitExternalReferenceDigests: [
                explicitUrlRef,
                digest("https-url-reference-two"),
            ],
        }));
        assert.notEqual(open.evidenceDigest, done.evidenceDigest);
        assert.notEqual(open.evidenceDigest, deadlineRotated.evidenceDigest);
        assert.equal(open.status, "open");
        assert.equal(done.status, "done");
        assert.equal(open.deadline, "2026-07-30T17:00:00.000Z");
        assert.equal(deadlineRotated.deadline, "2026-08-01T17:00:00.000Z");
    });
    (0, node_test_1.it)("exposes no statement reference for decision context evidence", () => {
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
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
        assert.equal(decision.objectRefs.some((ref) => ref.kind === "external_reference"), false);
    });
    (0, node_test_1.it)("loads only a 0600 owner regular file, rejects symlinks/mode/owner mismatch, and returns no local path", async () => {
        const snapshot = freshSnapshot();
        const file = tempFile("producer.json");
        (0, node_fs_1.writeFileSync)(file, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
        (0, node_fs_1.chmodSync)(file, 0o600);
        const loaded = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: file,
            assessedAt: "2026-07-29T13:00:00.000Z",
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner"),
        });
        assert.equal(loaded.freshness.decision, "fresh");
        assert.equal(JSON.stringify(loaded).includes(file), false);
        (0, node_fs_1.chmodSync)(file, 0o644);
        const looseMode = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: file,
            assessedAt: "2026-07-29T13:00:00.000Z",
        });
        assert.equal(looseMode.freshness.decision, "malformed");
        (0, node_fs_1.chmodSync)(file, 0o600);
        const link = tempFile("producer-link.json");
        (0, node_fs_1.symlinkSync)(file, link);
        const symlink = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: link,
            assessedAt: "2026-07-29T13:00:00.000Z",
        });
        assert.equal(symlink.freshness.decision, "malformed");
        const wrongOwnerScope = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: file,
            assessedAt: "2026-07-29T13:00:00.000Z",
            expectedOwnerScopeDigest: digest("different-owner"),
        });
        assert.equal(wrongOwnerScope.freshness.decision, "malformed");
        assert.equal(wrongOwnerScope.snapshot, null);
    });
    (0, node_test_1.it)("round-trips a compact near-limit 0600 producer file through the authenticated loader", async () => {
        const meetings = Array.from({ length: 8 }, (_, meetingIndex) => meeting({
            documentId: `near-limit-document-${meetingIndex}`,
            revisionId: `near-limit-revision-${meetingIndex}`,
            evidence: Array.from({ length: 16 }, (_, evidenceIndex) => {
                const suffix = `${meetingIndex}-${evidenceIndex}`;
                return {
                    ...evidence(`Near-limit bounded semantic evidence ${suffix} ${"s".repeat(140)}`),
                    title: `Near-limit action ${suffix} ${"t".repeat(64)}`,
                    objectRefs: undefined,
                };
            }),
        }));
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft(meetings));
        const compact = Buffer.from(JSON.stringify(snapshot), "utf8");
        assert.ok(compact.byteLength
            > meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes / 2);
        assert.ok(compact.byteLength <= meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxFileBytes);
        const file = tempFile("near-limit-compact.json");
        (0, node_fs_1.writeFileSync)(file, compact, { mode: 0o600 });
        (0, node_fs_1.chmodSync)(file, 0o600);
        const loaded = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
            snapshotPath: file,
            assessedAt: "2026-07-29T13:00:00.000Z",
            expectedOwnerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner"),
        });
        assert.equal(loaded.freshness.decision, "fresh");
        assert.equal(loaded.snapshot?.snapshotDigest, snapshot.snapshotDigest);
        assert.equal(loaded.snapshot?.meetings.reduce((count, item) => count + item.evidence.length, 0), meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_LIMITS_V1.maxEvidenceGlobal);
    });
    (0, node_test_1.it)("emits only digests for source identity and has no body, transcript, participant, Gmail, credential, or path field", () => {
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
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
        assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([{
                ...meeting(),
                transcript: "raw body must not enter this contract",
            }])));
    });
    (0, node_test_1.it)("rejects participant, credential, bearer-secret, and owner-path leaks in bounded semantic text", () => {
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
            assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                    evidence: [evidence(leakedSummary)],
                })])), /semantic privacy boundary/);
        }
        assert.throws(() => (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [{
                        ...evidence(),
                        title: "Ask owner@example.com to approve",
                    }],
            })])), /semantic privacy boundary/);
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
            assert.throws(() => (0, meeting_producer_freshness_js_1.assertTaskMapMeetingProducerSnapshot)(forged), /semantic privacy boundary/);
        }
        assert.equal(forged.privacy.participantDetailsStored, false);
        assert.equal(forged.privacy.credentialsStored, false);
        assert.equal(forged.privacy.localPathsStored, false);
        const legitimate = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [evidence("Email the checklist owner after rotating the token policy and documenting the path")],
            })]));
        assert.equal(legitimate.meetings[0].evidence.length, 1);
        const linked = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [evidence("Review https://docs.example.com/spec before the bounded launch")],
            })]));
        assert.equal(linked.meetings[0].evidence.length, 1);
        const httpLinked = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)(draft([meeting({
                evidence: [evidence("Review http://docs.example.com/spec before the bounded launch")],
            })]));
        assert.equal(httpLinked.meetings[0].evidence.length, 1);
    });
    (0, node_test_1.it)("resolves the frozen owner-local default snapshot path", () => {
        assert.equal((0, meeting_producer_freshness_js_1.taskMapMeetingProducerSnapshotPath)("/tmp/owner-home"), "/tmp/owner-home/.daobrew/taskmap/meeting-producer-snapshot.v1.json");
    });
    (0, node_test_1.it)("derives one domain-separated owner scope for producer and loader", () => {
        const ownerScope = (0, confirmed_owner_js_1.testOwnerScopeDigest)("synthetic-owner-key");
        assert.match(ownerScope, /^[a-f0-9]{64}$/);
        assert.equal(ownerScope, (0, confirmed_owner_js_1.testOwnerScopeDigest)("synthetic-owner-key"));
        assert.notEqual(ownerScope, (0, confirmed_owner_js_1.testOwnerScopeDigest)("different-owner-key"));
    });
});
