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
const assert = __importStar(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const native_candidate_acceptance_cli_js_1 = require("../src/engine/taskmap/native-candidate-acceptance-cli.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const taskmap_calendar_extraction_fixture_js_1 = require("./taskmap-calendar-extraction-fixture.js");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const meeting_refresh_llm_replay_js_1 = require("../src/engine/taskmap/meeting-refresh-llm-replay.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const roots = [];
const PRIVATE_KEY = "PRIVATE_TASK6_RAW_IDEMPOTENCY_KEY";
(0, node_test_1.afterEach)(() => {
    for (const root of roots.splice(0))
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function userId(label) {
    const hex = digest(label).toUpperCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function binding() {
    return {
        connectionId: "task6-cli-meeting",
        sourceKind: "gemini_meet",
        tenantOrWorkspaceDigest: digest("task6-cli-workspace"),
        accountOrPrincipalDigest: digest("task6-cli-principal"),
        grantVersion: "grant-1",
    };
}
function makeOwner(label) {
    const home = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join(process.cwd(), ".task6-cli-")));
    roots.push(home);
    const state = node_path_1.default.join(home, ".daobrew");
    (0, node_fs_1.mkdirSync)(state, { mode: 0o700 });
    (0, node_fs_1.chmodSync)(state, 0o700);
    const id = userId(label);
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(state, "config.json"), JSON.stringify({
        user_id: id,
        device_credential: `dbd_task6_${digest(label)}`,
        device_credential_confirmed: true,
        api_url: "https://task6.invalid/api/v1",
    }), { mode: 0o600 });
    const scope = (0, owner_scope_js_1.createTaskMapOwnerScope)(id, home);
    (0, node_fs_1.mkdirSync)(scope.sourceRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.mkdirSync)(scope.taskMapRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(scope.sourceRoot, 0o700);
    (0, node_fs_1.chmodSync)(scope.taskMapRoot, 0o700);
    return { home, scope };
}
function snapshotBytes(ownerScopeDigest) {
    return (0, source_contracts_js_1.taskMapContractCanonicalJson)((0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest,
        producedAt: new Date(Date.now() - 30_000).toISOString(),
        meetings: [{
                binding: binding(),
                documentId: "PRIVATE_TASK6_DOCUMENT",
                revisionId: "PRIVATE_TASK6_REVISION",
                contentDigest: digest("task6-cli-content"),
                modifiedAt: new Date(Date.now() - 90_000).toISOString(),
                eventTime: new Date(Date.now() - 180_000).toISOString(),
                observedAt: new Date(Date.now() - 60_000).toISOString(),
                evidence: [{
                        kind: "action_item",
                        title: "Confirm the CLI candidate",
                        summary: "Explicitly confirm the bounded CLI candidate.",
                        occurredAt: new Date(Date.now() - 180_000).toISOString(),
                        observedAt: new Date(Date.now() - 60_000).toISOString(),
                        status: "open",
                        quality: "structured_generated",
                        coverage: "partial",
                        confidence: 0.88,
                        speechActClass: "request",
                        speechActActor: "self",
                        mentionIdentityDigest: digest("task6-cli-mention"),
                        extractionEnvelopeDigest: digest("task6-cli-envelope"),
                    }],
            }],
    }));
}
function agentObservation(session) {
    const now = Date.now();
    const rows = [
        {
            timestamp: new Date(now - 240_000).toISOString(),
            type: "session_meta",
            payload: { id: session },
        },
        {
            timestamp: new Date(now - 210_000).toISOString(),
            type: "turn_context",
            payload: {
                cwd: "/Users/reviewer/DaobrewAI",
                workspace_roots: ["/Users/reviewer/DaobrewAI"],
            },
        },
        {
            timestamp: new Date(now - 180_000).toISOString(),
            type: "response_item",
            payload: {
                id: `${session}-turn`,
                type: "message",
                role: "user",
                content: [{
                        type: "input_text",
                        text: "Implement deterministic proposal adoption",
                    }],
            },
        },
        {
            timestamp: new Date(now - 120_000).toISOString(),
            type: "response_item",
            payload: {
                type: "message",
                role: "assistant",
                content: [{
                        type: "output_text",
                        text: "Prepared deterministic proposal adoption.",
                    }],
            },
        },
    ];
    return {
        provider: "codex",
        rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    };
}
async function writeAgentSnapshot(scope, observations = [agentObservation("task8-cli-agent")]) {
    const snapshotPath = node_path_1.default.join(scope.sourceRoot, "agent-session-producer-snapshot.v1.json");
    const snapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: scope.ownerScopeDigest,
        producedAt: new Date(Date.now() - 30_000).toISOString(),
        observations,
    });
    (0, node_fs_1.writeFileSync)(snapshotPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(snapshot), {
        mode: 0o600,
    });
    (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(scope.runtimeRoot, 0o700);
    await (0, taskmap_agent_session_extraction_fixture_js_1.refreshAgentSessionExtractionFixture)({
        admission: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(snapshot),
        taskMapRoot: scope.taskMapRoot,
        runtimeRoot: scope.runtimeRoot,
        promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md"),
        assessedAt: new Date().toISOString(),
    });
    return snapshotPath;
}
async function writeCalendarSnapshot(scope) {
    const producedAt = new Date(Date.now() - 30_000).toISOString();
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const endAt = new Date(Date.now() + 5_400_000).toISOString();
    const eventIdentityDigest = digest("task8-calendar-cli-event");
    const title = "Review the calendar CLI launch";
    const local = (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
        ownerScopeDigest: scope.ownerScopeDigest,
        producedAt,
        events: [{
                eventIdentityDigest,
                crossProviderIdentityDigest: null,
                revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, title, startAt, endAt]),
                title,
                startAt,
                endAt,
            }],
    });
    const localExportPath = node_path_1.default.join(scope.sourceRoot, "calendar-export.json");
    (0, node_fs_1.writeFileSync)(localExportPath, (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)(local), { mode: 0o600 });
    (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(scope.runtimeRoot, 0o700);
    const assessedAt = new Date().toISOString();
    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath,
        googleSnapshotPath: node_path_1.default.join(scope.sourceRoot, "calendar-google-provider-snapshot.v1.json"),
        assessedAt,
        expectedOwnerScopeDigest: scope.ownerScopeDigest,
    });
    await (0, taskmap_calendar_extraction_fixture_js_1.refreshCalendarExtractionFixture)({
        result,
        taskMapRoot: scope.taskMapRoot,
        runtimeRoot: scope.runtimeRoot,
        promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/calendar-extraction-v1.md"),
        assessedAt,
    });
    return localExportPath;
}
function invoke(home, entrypoint, argv) {
    return (0, node_child_process_1.spawnSync)(process.execPath, [entrypoint, ...argv], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            HOME: home,
            DAOBREW_CONFIG_FILE: node_path_1.default.join(home, ".daobrew", "config.json"),
        },
        encoding: "utf8",
    });
}
function writeCurrentGranolaReceipt(scope, snapshotPath) {
    const snapshotBytes = (0, node_fs_1.readFileSync)(snapshotPath);
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(scope.sourceRoot, "taskmap-resident-receipt.v1.json"), JSON.stringify({
        contractVersion: "taskmap-resident-receipt.v1",
        ownerScopeDigest: scope.ownerScopeDigest,
        granola_mcp_success: new Date(Date.now() - 1_000).toISOString(),
        granola_mcp_snapshot_sha256: (0, node_crypto_1.createHash)("sha256")
            .update(snapshotBytes)
            .digest("hex"),
    }), { mode: 0o600 });
}
(0, node_test_1.describe)("Task Map candidate acceptance CLI", () => {
    (0, node_test_1.it)("parses an exact explicit owner-confirmation command", () => {
        const candidateId = `tmnativecandidate_${"a".repeat(64)}`;
        const revision = "b".repeat(64);
        const statement = "c".repeat(64);
        const proofs = ["d".repeat(64), "e".repeat(64)];
        assert.deepEqual((0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--promote", candidateId,
            "--revision", revision,
            "--statement", statement,
            "--evidence-proofs", proofs.join(","),
            "--idempotency-key", PRIVATE_KEY,
        ]), {
            candidateId,
            candidateRevisionDigest: revision,
            statementReferenceDigest: statement,
            evidenceProofDigests: proofs,
            idempotencyKey: PRIVATE_KEY,
        });
        assert.throws(() => (0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--promote", candidateId,
            "--revision", revision,
            "--statement", statement,
            "--evidence-proofs", proofs.reverse().join(","),
            "--idempotency-key", PRIVATE_KEY,
        ]), /usage/);
    });
    (0, node_test_1.it)("parses the explicit agent-adoption command without accepting display payloads", () => {
        const candidateId = `tmnativecandidate_${"a".repeat(64)}`;
        const revision = "b".repeat(64);
        const statement = "c".repeat(64);
        const proofs = ["d".repeat(64), "e".repeat(64)];
        assert.deepEqual((0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--adopt-agent", candidateId,
            "--revision", revision,
            "--statement", statement,
            "--evidence-proofs", proofs.join(","),
            "--idempotency-key", PRIVATE_KEY,
        ]), {
            candidateFamily: "agent_session",
            candidateId,
            candidateRevisionDigest: revision,
            statementReferenceDigest: statement,
            evidenceProofDigests: proofs,
            idempotencyKey: PRIVATE_KEY,
        });
        assert.throws(() => (0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--adopt-agent", candidateId,
            "--title", "Caller controlled title",
        ]), /usage/);
    });
    (0, node_test_1.it)("parses the explicit calendar-adoption command without accepting display payloads", () => {
        const candidateId = `tmnativecandidate_${"a".repeat(64)}`;
        const revision = "b".repeat(64);
        const statement = "c".repeat(64);
        const proofs = ["d".repeat(64), "e".repeat(64)];
        assert.deepEqual((0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--adopt-calendar", candidateId,
            "--revision", revision,
            "--statement", statement,
            "--evidence-proofs", proofs.join(","),
            "--idempotency-key", PRIVATE_KEY,
        ]), {
            candidateFamily: "calendar",
            candidateId,
            candidateRevisionDigest: revision,
            statementReferenceDigest: statement,
            evidenceProofDigests: proofs,
            idempotencyKey: PRIVATE_KEY,
        });
        assert.throws(() => (0, native_candidate_acceptance_cli_js_1.parseTaskMapNativeCandidateAcceptanceCommand)([
            "--adopt-calendar", candidateId,
            "--title", "Caller controlled title",
        ]), /usage/);
    });
    (0, node_test_1.it)("adopts an agent proposal from fresh local proof and replays without source mutation", async () => {
        const { home, scope } = makeOwner("task8-agent-cli-owner");
        const snapshotPath = await writeAgentSnapshot(scope);
        const sourceBefore = (0, node_fs_1.readFileSync)(snapshotPath, "utf8");
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const acceptanceEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const row = JSON.parse(listed.stdout).candidates[0];
        assert.equal(row.candidateFamily, "agent_session");
        const argv = [
            "--adopt-agent", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task8-agent-owner-confirmation",
        ];
        const first = invoke(home, acceptanceEntry, argv);
        assert.equal(first.status, 0, first.stderr);
        assert.equal(first.stderr, "");
        const receipt = JSON.parse(first.stdout);
        assert.deepEqual(receipt.authority, {
            sourceKind: "manual",
            authority: "user",
            syncMode: "personal_fork",
            capabilities: ["read_task"],
            recordKind: "authoritative_task",
            lifecycle: "explicit_user_policy",
            sourceStatus: "open",
        });
        assert.equal(receipt.sourceWritebackAttempted, false);
        assert.equal(receipt.accepted.kind, "action_item");
        assert.equal((0, node_fs_1.readFileSync)(snapshotPath, "utf8"), sourceBefore);
        const storeBytes = (0, node_fs_1.readFileSync)((0, native_candidate_acceptance_cli_js_1.taskMapNativeCandidateAcceptanceStorePath)(scope.taskMapRoot), "utf8");
        assert.equal(/approve|export|selectedAgent|processId|command/.test(storeBytes), false);
        (0, node_fs_1.rmSync)(snapshotPath);
        const replay = invoke(home, acceptanceEntry, argv);
        assert.equal(replay.status, 0, replay.stderr);
        assert.deepEqual(JSON.parse(replay.stdout), receipt);
    });
    (0, node_test_1.it)("adopts a calendar proposal and retains it across restart until publication", async () => {
        const { home, scope } = makeOwner("task8-calendar-cli-owner");
        const snapshotPath = await writeCalendarSnapshot(scope);
        const sourceBefore = (0, node_fs_1.readFileSync)(snapshotPath, "utf8");
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const acceptanceEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const row = JSON.parse(listed.stdout).candidates.find((candidate) => candidate.candidateFamily === "calendar");
        assert.ok(row);
        const promoted = invoke(home, acceptanceEntry, [
            "--adopt-calendar", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task8-calendar-owner-confirmation",
        ]);
        assert.equal(promoted.status, 0, promoted.stderr);
        assert.equal(JSON.parse(promoted.stdout).accepted.title, "Review the calendar CLI launch");
        assert.equal((0, node_fs_1.readFileSync)(snapshotPath, "utf8"), sourceBefore);
        const replayedShelf = invoke(home, reviewEntry, ["--list"]);
        assert.equal(replayedShelf.status, 0, replayedShelf.stderr);
        const pendingShelf = JSON.parse(replayedShelf.stdout);
        assert.equal(pendingShelf.candidates.some((candidate) => candidate.candidateFamily === "calendar"), true);
        assert.deepEqual(pendingShelf.durableConfirmedCandidateIds, [
            row.candidateId,
        ]);
    });
    (0, node_test_1.it)("rejects cached agent proof after the shared review overlay dismisses it", async () => {
        const { home, scope } = makeOwner("task8-agent-cli-dismissed");
        await writeAgentSnapshot(scope);
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const acceptanceEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const row = JSON.parse(listed.stdout).candidates[0];
        const dismissed = invoke(home, reviewEntry, [
            "--review", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--action", "dismiss",
        ]);
        assert.equal(dismissed.status, 0, dismissed.stderr);
        assert.equal(JSON.parse(dismissed.stdout).candidates.length, 0);
        const rejected = invoke(home, acceptanceEntry, [
            "--adopt-agent", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task8-dismissed-agent-confirmation",
        ]);
        assert.equal(rejected.status, 1);
        assert.equal(rejected.stdout, "");
        assert.match(rejected.stderr, /unavailable/);
        assert.equal((0, node_fs_1.existsSync)((0, native_candidate_acceptance_cli_js_1.taskMapNativeCandidateAcceptanceStorePath)(scope.taskMapRoot)), false);
    });
    (0, node_test_1.it)("rejects an agent adoption after the support set changes", async () => {
        const { home, scope } = makeOwner("task8-agent-cli-stale");
        await writeAgentSnapshot(scope);
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const acceptanceEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const row = JSON.parse(listed.stdout).candidates[0];
        await writeAgentSnapshot(scope, [
            agentObservation("task8-cli-agent"),
            agentObservation("task8-cli-agent-support"),
        ]);
        const rejected = invoke(home, acceptanceEntry, [
            "--adopt-agent", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task8-stale-agent-confirmation",
        ]);
        assert.equal(rejected.status, 1);
        assert.equal(rejected.stdout, "");
        assert.match(rejected.stderr, /unavailable/);
        assert.equal((0, node_fs_1.readFileSync)(node_path_1.default.join(scope.sourceRoot, "agent-session-producer-snapshot.v1.json"), "utf8").includes("task8-stale-agent-confirmation"), false);
    });
    (0, node_test_1.it)("preserves empty stdout and exit status without echoing invalid argv", () => {
        const home = makeOwner("task6-diagnostic").home;
        const entrypoint = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const unreflectedArgument = "PRIVATE_CANDIDATE_ACCEPTANCE_ARGUMENT";
        const result = invoke(home, entrypoint, [unreflectedArgument]);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^taskmap-native-candidate-acceptance: unavailable\nTypeError: usage: native-candidate-acceptance-cli/m);
        assert.match(result.stderr, /at usageError/);
        assert.equal(result.stderr.includes(unreflectedArgument), false);
    });
    (0, node_test_1.it)("uses only confirmed owner sourceRoot/taskMapRoot, promotes, replays, and never writes source files", () => {
        const { home, scope } = makeOwner("task6-cli-owner");
        const snapshotPath = node_path_1.default.join(scope.sourceRoot, "meeting-producer-snapshot.v1.json");
        (0, node_fs_1.writeFileSync)(snapshotPath, snapshotBytes(scope.ownerScopeDigest), { mode: 0o600 });
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const promotionEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const row = JSON.parse(listed.stdout).candidates[0];
        const sourceNames = (0, node_fs_1.readdirSync)(scope.sourceRoot);
        const sourceBefore = (0, node_fs_1.readFileSync)(snapshotPath, "utf8");
        const argv = [
            "--promote", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", PRIVATE_KEY,
        ];
        const first = invoke(home, promotionEntry, argv);
        assert.equal(first.status, 0, first.stderr);
        assert.equal(first.stderr, "");
        const receipt = JSON.parse(first.stdout);
        assert.match(receipt.promotionDigest, /^[a-f0-9]{64}$/);
        const storePath = (0, native_candidate_acceptance_cli_js_1.taskMapNativeCandidateAcceptanceStorePath)(scope.taskMapRoot);
        const storeBytes = (0, node_fs_1.readFileSync)(storePath, "utf8");
        assert.equal(storeBytes.includes(PRIVATE_KEY), false);
        assert.equal(storeBytes.includes("PRIVATE_TASK6_DOCUMENT"), false);
        assert.deepEqual((0, node_fs_1.readdirSync)(scope.sourceRoot), sourceNames);
        assert.equal((0, node_fs_1.readFileSync)(snapshotPath, "utf8"), sourceBefore);
        (0, node_fs_1.rmSync)(snapshotPath);
        const replay = invoke(home, promotionEntry, argv);
        assert.equal(replay.status, 0, replay.stderr);
        assert.deepEqual(JSON.parse(replay.stdout), receipt);
    });
    (0, node_test_1.it)("has no legacy home-global producer fallback and fails coarsely", () => {
        const { home, scope } = makeOwner("task6-no-fallback");
        const legacyRoot = node_path_1.default.join(home, ".daobrew", "taskmap");
        (0, node_fs_1.mkdirSync)(legacyRoot, { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(legacyRoot, "meeting-producer-snapshot.v1.json"), snapshotBytes(scope.ownerScopeDigest), { mode: 0o600 });
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const result = invoke(home, reviewEntry, ["--list"]);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /^taskmap-native-candidate-review: unavailable\nError: candidate evidence is unavailable/m);
        assert.match(result.stderr, /\n {4}at /);
        assert.equal(result.stderr.includes(home), false);
    });
    (0, node_test_1.it)("lists, reviews, promotes, and restart-retains a reverified raw report", async () => {
        const { home, scope } = makeOwner("task7-raw-cli-owner");
        (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.chmodSync)(scope.runtimeRoot, 0o700);
        const body = "Meeting context. I will ship the verified raw CLI lane. Closing context.";
        const mention = "I will ship the verified raw CLI lane.";
        const rawPath = node_path_1.default.join(scope.sourceRoot, "granola-mcp-snapshot.json");
        (0, node_fs_1.writeFileSync)(rawPath, JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "PRIVATE_RAW_CLI_NOTE_ID",
                    source: "granola",
                    source_ref: "PRIVATE_RAW_CLI_NOTE_ID",
                    title: "Private raw CLI meeting",
                    created_at: new Date(Date.now() - 60_000).toISOString(),
                    occurred_at: new Date(Date.now() - 120_000).toISOString(),
                    participants: ["Private participant"],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                }],
        }), { mode: 0o600 });
        writeCurrentGranolaReceipt(scope, rawPath);
        const promptTemplatePath = node_path_1.default.resolve(__dirname, "../../prompts/mention-extraction-v1.md");
        const station = {
            provider: {
                transport: "codex-cli",
                executable: "/private/codex",
                args: [],
                model: "task7-test-model",
            },
            async run(request) {
                return {
                    stationId: "mention-extraction-v1",
                    model: "task7-test-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        mentions: [{
                                class: "commitment",
                                actor: "self",
                                text: mention,
                                title: "Ship the verified raw CLI lane",
                                confidence: 0.93,
                            }],
                    }),
                    producedAt: new Date().toISOString(),
                    transport: "codex-cli",
                };
            },
        };
        await (0, meeting_refresh_llm_replay_js_1.refreshTaskMapGranolaMeetingExtraction)({
            snapshotPath: rawPath,
            taskMapRoot: scope.taskMapRoot,
            runtimeRoot: scope.runtimeRoot,
            ownerScopeDigest: scope.ownerScopeDigest,
            promptTemplatePath,
            assessedAt: new Date().toISOString(),
            createStation: async () => station,
        });
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const promotionEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const initialShelf = JSON.parse(listed.stdout);
        assert.equal(initialShelf.candidates.length, 1);
        const row = initialShelf.candidates[0];
        assert.deepEqual(row.sourceKinds, ["granola"]);
        assert.equal(row.reviewState, "unreviewed");
        const reviewed = invoke(home, reviewEntry, [
            "--review", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--action", "accept_for_review",
        ]);
        assert.equal(reviewed.status, 0, reviewed.stderr);
        assert.equal(JSON.parse(reviewed.stdout)
            .candidates[0]?.reviewState, "accept_for_review");
        const promoted = invoke(home, promotionEntry, [
            "--promote", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task7-raw-cli-confirmation",
        ]);
        assert.equal(promoted.status, 0, promoted.stderr);
        const afterRestart = invoke(home, reviewEntry, ["--list"]);
        assert.equal(afterRestart.status, 0, afterRestart.stderr);
        const pendingShelf = JSON.parse(afterRestart.stdout);
        assert.equal(pendingShelf.candidates.length, 1);
        assert.equal(pendingShelf.candidates[0]?.candidateId, row.candidateId);
        assert.deepEqual(pendingShelf.durableConfirmedCandidateIds, [
            row.candidateId,
        ]);
        assert.equal((0, node_fs_1.readFileSync)((0, native_candidate_acceptance_cli_js_1.taskMapNativeCandidateAcceptanceStorePath)(scope.taskMapRoot), "utf8").includes("PRIVATE_RAW_CLI_NOTE_ID"), false);
    });
    (0, node_test_1.it)("ignores a fresh raw report without its owner receipt while preserving Google evidence", async () => {
        const { home, scope } = makeOwner("task7-unreceipted-raw-google-owner");
        (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
        const now = Date.now();
        const rawAt = new Date(now - 60_000).toISOString();
        const rawPath = node_path_1.default.join(scope.sourceRoot, "granola-mcp-snapshot.json");
        const mention = "I will ship the unreceipted raw candidate.";
        const body = `Context. ${mention} Closing context.`;
        (0, node_fs_1.writeFileSync)(rawPath, JSON.stringify({
            events: [],
            meeting_notes: [{
                    id: "PRIVATE_STALE_RAW_NOTE",
                    source: "granola",
                    source_ref: "PRIVATE_STALE_RAW_NOTE",
                    title: "Stale raw note",
                    created_at: new Date(Date.parse(rawAt) - 60_000).toISOString(),
                    occurred_at: new Date(Date.parse(rawAt) - 120_000).toISOString(),
                    participants: [],
                    summary: body,
                    body,
                    transcript: [],
                    topics: [],
                }],
        }), { mode: 0o600 });
        const station = {
            provider: {
                transport: "codex-cli",
                executable: "/private/codex",
                args: [],
                model: "task7-stale-test-model",
            },
            async run(request) {
                return {
                    stationId: "mention-extraction-v1",
                    model: "task7-stale-test-model",
                    promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(request.promptText),
                    inputDigest: request.inputDigest,
                    outputJson: JSON.stringify({
                        mentions: [{
                                class: "commitment",
                                actor: "self",
                                text: mention,
                                title: "Ship the unreceipted raw candidate",
                                confidence: 0.91,
                            }],
                    }),
                    producedAt: rawAt,
                    transport: "codex-cli",
                };
            },
        };
        await (0, meeting_refresh_llm_replay_js_1.refreshTaskMapGranolaMeetingExtraction)({
            snapshotPath: rawPath,
            taskMapRoot: scope.taskMapRoot,
            runtimeRoot: scope.runtimeRoot,
            ownerScopeDigest: scope.ownerScopeDigest,
            promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/mention-extraction-v1.md"),
            assessedAt: rawAt,
            createStation: async () => station,
        });
        const snapshotPath = node_path_1.default.join(scope.sourceRoot, "meeting-producer-snapshot.v1.json");
        (0, node_fs_1.writeFileSync)(snapshotPath, snapshotBytes(scope.ownerScopeDigest), {
            mode: 0o600,
        });
        const reviewEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
        const promotionEntry = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-acceptance-cli.js");
        const listed = invoke(home, reviewEntry, ["--list"]);
        assert.equal(listed.status, 0, listed.stderr);
        const shelf = JSON.parse(listed.stdout);
        assert.equal(shelf.candidates.length, 1);
        const row = shelf.candidates[0];
        assert.deepEqual(row.sourceKinds, ["gemini_meet"]);
        const promoted = invoke(home, promotionEntry, [
            "--promote", row.candidateId,
            "--revision", row.candidateRevisionDigest,
            "--statement", row.statementReferenceDigest,
            "--evidence-proofs", row.evidenceProofDigests.join(","),
            "--idempotency-key", "task7-stale-raw-google-confirmation",
        ]);
        assert.equal(promoted.status, 0, promoted.stderr);
        const receipt = JSON.parse(promoted.stdout);
        assert.deepEqual(receipt.evidenceProofDigests, row.evidenceProofDigests);
        assert.equal(receipt.accepted.title, "Confirm the CLI candidate");
    });
});
