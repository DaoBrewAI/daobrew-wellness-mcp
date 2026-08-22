#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES = exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN = void 0;
exports.parseTaskMapNativeCandidateAcceptanceCommand = parseTaskMapNativeCandidateAcceptanceCommand;
exports.taskMapNativeCandidateAcceptanceStorePath = taskMapNativeCandidateAcceptanceStorePath;
exports.runTaskMapNativeCandidateAcceptanceCommand = runTaskMapNativeCandidateAcceptanceCommand;
exports.taskMapNativeCandidateAcceptanceOutput = taskMapNativeCandidateAcceptanceOutput;
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const identity_js_1 = require("../../identity.js");
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const agent_session_producer_freshness_js_1 = require("./agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("./agent-session-semantic-admission.js");
const agent_session_refresh_llm_replay_js_1 = require("./agent-session-refresh-llm-replay.js");
const calendar_refresh_llm_replay_js_1 = require("./calendar-refresh-llm-replay.js");
const meeting_producer_freshness_js_1 = require("./meeting-producer-freshness.js");
const native_refresh_service_js_1 = require("./native-refresh-service.js");
const native_candidate_acceptance_js_1 = require("./native-candidate-acceptance.js");
const native_candidate_review_js_1 = require("./native-candidate-review.js");
const native_candidate_review_cli_js_1 = require("./native-candidate-review-cli.js");
const source_contracts_js_1 = require("./source-contracts.js");
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN = "taskmap-native-candidate-acceptance-cli-idempotency.1";
exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES = 128 * 1_024;
const CANDIDATE_ID = /^tmnativecandidate_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_KEY = /^[^\u0000-\u001f\u007f]{1,128}$/;
const STORE_FILE_NAME = "native-candidate-acceptance.v1.json";
const USAGE = "usage: native-candidate-acceptance-cli "
    + "--promote <candidateId> --revision <64hex> --statement <64hex> "
    + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key> | "
    + "--adopt-agent <candidateId> --revision <64hex> --statement <64hex> "
    + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key> | "
    + "--adopt-calendar <candidateId> --revision <64hex> --statement <64hex> "
    + "--evidence-proofs <sorted-64hex[,64hex...]> --idempotency-key <key>";
function usageError() {
    throw new TypeError(USAGE);
}
function parseTaskMapNativeCandidateAcceptanceCommand(argv) {
    const operation = argv[0];
    if (argv.length !== 10
        || (operation !== "--promote"
            && operation !== "--adopt-agent"
            && operation !== "--adopt-calendar")
        || !CANDIDATE_ID.test(argv[1] ?? "")
        || argv[2] !== "--revision"
        || !SHA256.test(argv[3] ?? "")
        || argv[4] !== "--statement"
        || !SHA256.test(argv[5] ?? "")
        || argv[6] !== "--evidence-proofs"
        || argv[8] !== "--idempotency-key"
        || !SAFE_KEY.test(argv[9] ?? ""))
        usageError();
    const proofs = argv[7].split(",");
    if (proofs.length === 0
        || proofs.length > 128
        || proofs.some((item) => !SHA256.test(item))
        || new Set(proofs).size !== proofs.length
        || proofs.some((item, index) => index > 0 && proofs[index - 1] >= item))
        usageError();
    const command = {
        candidateId: argv[1],
        candidateRevisionDigest: argv[3],
        statementReferenceDigest: argv[5],
        evidenceProofDigests: proofs,
        idempotencyKey: argv[9],
    };
    return operation === "--adopt-agent"
        ? {
            candidateFamily: "agent_session",
            ...command,
        }
        : operation === "--adopt-calendar"
            ? {
                candidateFamily: "calendar",
                ...command,
            }
            : command;
}
function taskMapNativeCandidateAcceptanceStorePath(taskMapRoot) {
    const storePath = node_path_1.default.join(taskMapRoot, STORE_FILE_NAME);
    if (!node_path_1.default.isAbsolute(storePath) || node_path_1.default.normalize(storePath) !== storePath) {
        throw new Error("candidate acceptance storage is unavailable");
    }
    return storePath;
}
async function confirmedOwner(homeDirectory) {
    const environment = (process.env.DAOBREW_USER_ID ?? "").trim();
    const plan = await (0, identity_js_1.loadConfirmedTaskMapOwner)(homeDirectory, environment.length === 0 ? {} : { userId: environment });
    if (!plan.ok)
        throw new Error("candidate acceptance owner is unavailable");
    return plan.owner;
}
function idempotencyDigest(ownerScopeDigest, rawKey) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_IDEMPOTENCY_DOMAIN,
        ownerScopeDigest,
        rawKey,
    });
}
async function runTaskMapNativeCandidateAcceptanceCommand(argv) {
    const command = parseTaskMapNativeCandidateAcceptanceCommand(argv);
    const ownerHome = (0, node_os_1.homedir)();
    const owner = await confirmedOwner(ownerHome);
    const expectedOwnerScopeDigest = owner.ownerScopeDigest;
    const overlayPath = (0, native_candidate_review_cli_js_1.taskMapNativeCandidateReviewOverlayPath)(owner.taskMapRoot);
    const storePath = taskMapNativeCandidateAcceptanceStorePath(owner.taskMapRoot);
    const producerPath = node_path_1.default.join(owner.sourceRoot, "meeting-producer-snapshot.v1.json");
    const keyDigest = idempotencyDigest(expectedOwnerScopeDigest, command.idempotencyKey);
    return (0, native_candidate_review_js_1.withTaskMapNativeCandidateReviewTransaction)({
        overlayPath,
        expectedOwnerScopeDigest,
    }, async () => {
        const previousStore = await (0, native_candidate_acceptance_js_1.loadTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest,
        });
        if (previousStore?.receipts.some((receipt) => receipt.idempotencyKeyDigest === keyDigest)) {
            return (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
                result: null,
                overlay: null,
                previousStore,
                expectedOwnerScopeDigest,
                assessedAt: new Date().toISOString(),
                candidateId: command.candidateId,
                expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                expectedStatementReferenceDigest: command.statementReferenceDigest,
                expectedEvidenceProofDigests: command.evidenceProofDigests,
                idempotencyKeyDigest: keyDigest,
                confirmedAt: new Date().toISOString(),
            }).receipt;
        }
        const assessedAt = new Date().toISOString();
        if ("candidateFamily" in command) {
            if (command.candidateFamily === "calendar") {
                const proof = await (0, calendar_refresh_llm_replay_js_1.loadCurrentTaskMapCalendarExtractionProof)({
                    localExportPath: node_path_1.default.join(owner.sourceRoot, "calendar-export.json"),
                    googleSnapshotPath: node_path_1.default.join(owner.sourceRoot, "calendar-google-provider-snapshot.v1.json"),
                    taskMapRoot: owner.taskMapRoot,
                    runtimeRoot: owner.runtimeRoot,
                    ownerScopeDigest: expectedOwnerScopeDigest,
                    promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/calendar-extraction-v1.md"),
                    currentAssessedAt: assessedAt,
                });
                if (proof === null) {
                    throw new Error("calendar candidate acceptance proof is unavailable");
                }
                const currentOverlay = await (0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
                    overlayPath,
                    expectedOwnerScopeDigest,
                });
                const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapCalendarCandidate)({
                    result: proof.result,
                    extraction: proof.extraction,
                    overlay: currentOverlay,
                    previousStore,
                    expectedOwnerScopeDigest,
                    expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(previousStore),
                    assessedAt: proof.result.assessedAt,
                    candidateId: command.candidateId,
                    expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                    expectedStatementReferenceDigest: command.statementReferenceDigest,
                    expectedEvidenceProofDigests: command.evidenceProofDigests,
                    idempotencyKeyDigest: keyDigest,
                    confirmedAt: assessedAt,
                });
                await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
                    storePath,
                    expectedOwnerScopeDigest,
                    store: promoted.store,
                });
                return promoted.receipt;
            }
            const agentResult = await (0, agent_session_producer_freshness_js_1.loadTaskMapAgentSessionProducerResult)({
                snapshotPath: node_path_1.default.join(owner.sourceRoot, "agent-session-producer-snapshot.v1.json"),
                assessedAt,
                expectedOwnerScopeDigest,
            });
            if (agentResult.availability !== "available"
                || agentResult.snapshot === null
                || agentResult.freshness.decision !== "fresh"
                || agentResult.freshness.currentSemanticInputEligible !== true)
                throw new Error("agent candidate acceptance proof is unavailable");
            const currentOverlay = await (0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
                overlayPath,
                expectedOwnerScopeDigest,
            });
            const admission = (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(agentResult.snapshot);
            const extraction = await (0, agent_session_refresh_llm_replay_js_1.loadVerifiedTaskMapAgentSessionExtractionReport)({
                admission,
                taskMapRoot: owner.taskMapRoot,
                runtimeRoot: owner.runtimeRoot,
                ownerScopeDigest: expectedOwnerScopeDigest,
                promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/agent-session-extraction-v1.md"),
            });
            if (extraction === null) {
                throw new Error("agent candidate extraction proof is unavailable");
            }
            const promoted = (0, native_candidate_acceptance_js_1.promoteTaskMapAgentSessionCandidate)({
                admission,
                extraction,
                overlay: currentOverlay,
                previousStore,
                expectedOwnerScopeDigest,
                expectedAcceptanceHeadDigest: (0, native_candidate_acceptance_js_1.taskMapNativeCandidateAcceptanceHeadDigest)(previousStore),
                assessedAt,
                candidateId: command.candidateId,
                expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                expectedStatementReferenceDigest: command.statementReferenceDigest,
                expectedEvidenceProofDigests: command.evidenceProofDigests,
                idempotencyKeyDigest: keyDigest,
                confirmedAt: assessedAt,
            });
            await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
                storePath,
                expectedOwnerScopeDigest,
                store: promoted.store,
            });
            return promoted.receipt;
        }
        let result = null;
        try {
            result = await (0, meeting_producer_freshness_js_1.loadTaskMapMeetingProducerResult)({
                snapshotPath: producerPath,
                assessedAt,
                expectedOwnerScopeDigest,
            });
            if (result.availability !== "available"
                || result.snapshot === null
                || result.freshness.decision !== "fresh")
                result = null;
        }
        catch {
            result = null;
        }
        let rawReport = null;
        try {
            rawReport = await (0, native_refresh_service_js_1.loadCurrentTaskMapOwnerGranolaExtractionReport)({
                snapshotPath: node_path_1.default.join(owner.sourceRoot, "granola-mcp-snapshot.json"),
                residentReceiptPath: node_path_1.default.join(owner.sourceRoot, "taskmap-resident-receipt.v1.json"),
                assessedAt,
                taskMapRoot: owner.taskMapRoot,
                runtimeRoot: owner.runtimeRoot,
                ownerScopeDigest: expectedOwnerScopeDigest,
                promptTemplatePath: node_path_1.default.resolve(__dirname, "../../../../prompts/mention-extraction-v1.md"),
            });
        }
        catch {
            rawReport = null;
        }
        if (result === null && rawReport === null) {
            throw new Error("candidate acceptance proof is unavailable");
        }
        const previousOverlay = await (0, native_candidate_review_js_1.loadTaskMapNativeCandidateReview)({
            overlayPath,
            expectedOwnerScopeDigest,
        });
        const overlay = rawReport !== null || result === null
            ? previousOverlay
            : (0, native_candidate_review_js_1.buildTaskMapNativeCandidateReview)({
                result,
                previous: previousOverlay,
                expectedOwnerScopeDigest,
                assessedAt,
            });
        const promoted = rawReport === null
            ? (0, native_candidate_acceptance_js_1.promoteTaskMapNativeCandidate)({
                result,
                overlay,
                previousStore,
                expectedOwnerScopeDigest,
                assessedAt,
                candidateId: command.candidateId,
                expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                expectedStatementReferenceDigest: command.statementReferenceDigest,
                expectedEvidenceProofDigests: command.evidenceProofDigests,
                idempotencyKeyDigest: keyDigest,
                confirmedAt: assessedAt,
            })
            : (0, native_candidate_acceptance_js_1.promoteTaskMapVerifiedMeetingCandidate)({
                result,
                overlay,
                rawReport,
                previousStore,
                expectedOwnerScopeDigest,
                assessedAt,
                candidateId: command.candidateId,
                expectedCandidateRevisionDigest: command.candidateRevisionDigest,
                expectedStatementReferenceDigest: command.statementReferenceDigest,
                expectedEvidenceProofDigests: command.evidenceProofDigests,
                idempotencyKeyDigest: keyDigest,
                confirmedAt: assessedAt,
            });
        await (0, native_candidate_acceptance_js_1.writeTaskMapNativeCandidateAcceptanceStore)({
            storePath,
            expectedOwnerScopeDigest,
            store: promoted.store,
        });
        return promoted.receipt;
    });
}
function taskMapNativeCandidateAcceptanceOutput(receipt) {
    const output = (0, source_contracts_js_1.taskMapContractCanonicalJson)(receipt);
    if (Buffer.byteLength(output, "utf8") > exports.TASKMAP_NATIVE_CANDIDATE_ACCEPTANCE_CLI_MAX_OUTPUT_BYTES) {
        throw new Error("candidate acceptance output is unavailable");
    }
    return output;
}
async function main() {
    try {
        const receipt = await runTaskMapNativeCandidateAcceptanceCommand(process.argv.slice(2));
        process.stdout.write(`${taskMapNativeCandidateAcceptanceOutput(receipt)}\n`);
    }
    catch (error) {
        process.stderr.write(`taskmap-native-candidate-acceptance: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module)
    void main();
