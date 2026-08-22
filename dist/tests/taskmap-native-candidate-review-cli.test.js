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
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const native_candidate_review_cli_js_1 = require("../src/engine/taskmap/native-candidate-review-cli.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const agent_session_semantic_admission_js_1 = require("../src/engine/taskmap/agent-session-semantic-admission.js");
const taskmap_agent_session_extraction_fixture_js_1 = require("./taskmap-agent-session-extraction-fixture.js");
const taskmap_calendar_extraction_fixture_js_1 = require("./taskmap-calendar-extraction-fixture.js");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const ACTION_TITLE = "PRIVATE_CLI_ACTION_TITLE_SENTINEL";
const ACTION_SUMMARY = "PRIVATE_CLI_ACTION_SUMMARY_SENTINEL";
const DECISION_TITLE = "PRIVATE_CLI_DECISION_TITLE_SENTINEL";
const DOCUMENT_ID = "PRIVATE_CLI_DOCUMENT_ID_SENTINEL";
const SOURCE_REVISION = "PRIVATE_CLI_SOURCE_REVISION_SENTINEL";
const SOURCE_REFERENCE = "PRIVATE_CLI_SOURCE_REFERENCE_SENTINEL";
const SECOND_ACTION_TITLE = "PRIVATE_CLI_SECOND_ACTION_TITLE_SENTINEL";
const SECOND_ACTION_SUMMARY = "PRIVATE_CLI_SECOND_ACTION_SUMMARY_SENTINEL";
const tempRoots = [];
const configuredOwners = new Map();
const activeChildren = new Set();
(0, node_test_1.afterEach)(() => {
    for (const child of activeChildren) {
        child.kill("SIGKILL");
    }
    activeChildren.clear();
    for (const root of tempRoots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function binding() {
    return {
        connectionId: "candidate-cli-gemini-owner",
        sourceKind: "gemini_meet",
        tenantOrWorkspaceDigest: digest("candidate-cli-workspace"),
        accountOrPrincipalDigest: digest("candidate-cli-principal"),
        grantVersion: "grant-1",
    };
}
function iso(milliseconds) {
    return new Date(milliseconds).toISOString();
}
function canonicalTestUserId(label) {
    const hex = (0, node_crypto_1.createHash)("sha256").update(label).digest("hex").toUpperCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function makeHome(configuredOwner = "owner-config") {
    const root = (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-candidate-cli-")));
    tempRoots.push(root);
    const stateRoot = node_path_1.default.join(root, ".daobrew");
    (0, node_fs_1.mkdirSync)(stateRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(stateRoot, 0o700);
    (0, node_fs_1.writeFileSync)(node_path_1.default.join(stateRoot, "config.json"), JSON.stringify(configuredOwner === null
        ? {}
        : {
            user_id: canonicalTestUserId(configuredOwner),
            device_credential: `dbd_test_enrollment_${digest(configuredOwner)}`,
            device_credential_confirmed: true,
            api_url: "https://candidate-review.test.invalid/api/v1",
        }), { mode: 0o600 });
    if (configuredOwner !== null) {
        configuredOwners.set(root, configuredOwner);
        const scope = (0, owner_scope_js_1.createTaskMapOwnerScope)(canonicalTestUserId(configuredOwner), root);
        (0, node_fs_1.mkdirSync)(scope.sourceRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.mkdirSync)(scope.taskMapRoot, { recursive: true, mode: 0o700 });
        (0, node_fs_1.chmodSync)(scope.sourceRoot, 0o700);
        (0, node_fs_1.chmodSync)(scope.taskMapRoot, 0o700);
    }
    return root;
}
function ownerScopeForHome(home) {
    const owner = configuredOwners.get(home);
    if (owner === undefined)
        throw new Error("test owner is unavailable");
    return (0, owner_scope_js_1.createTaskMapOwnerScope)(canonicalTestUserId(owner), home);
}
function overlayPathForHome(home) {
    return (0, native_candidate_review_cli_js_1.taskMapNativeCandidateReviewOverlayPath)(ownerScopeForHome(home).taskMapRoot);
}
function actionEvidence(producedAtMs, overrides = {}) {
    return {
        kind: "action_item",
        title: ACTION_TITLE,
        summary: ACTION_SUMMARY,
        occurredAt: iso(producedAtMs - 180_000),
        observedAt: iso(producedAtMs - 60_000),
        status: "open",
        deadline: iso(producedAtMs + 86_400_000),
        quality: "structured_generated",
        coverage: "partial",
        confidence: 0.85,
        objectRefs: [{
                kind: "external_reference",
                referenceDigest: digest(SOURCE_REFERENCE),
            }],
        ...overrides,
    };
}
function writeProducerSnapshot(input) {
    const producedAtMs = input.producedAtMs ?? Date.now() - 30_000;
    const revision = input.revision ?? SOURCE_REVISION;
    const evidence = [
        actionEvidence(producedAtMs, input.actionOverrides),
    ];
    if (input.includeSecondCandidate === true) {
        evidence.push(actionEvidence(producedAtMs, {
            kind: "commitment",
            title: SECOND_ACTION_TITLE,
            summary: SECOND_ACTION_SUMMARY,
            occurredAt: iso(producedAtMs - 240_000),
            observedAt: iso(producedAtMs - 45_000),
            status: "in_progress",
            quality: "source_native",
            coverage: "complete",
            confidence: 1,
            objectRefs: [{
                    kind: "external_reference",
                    referenceDigest: digest(`${SOURCE_REFERENCE}:second`),
                }],
        }));
    }
    if (input.includeDecision !== false) {
        evidence.push({
            kind: "decision",
            title: DECISION_TITLE,
            summary: "PRIVATE_CLI_DECISION_SUMMARY_SENTINEL",
            occurredAt: iso(producedAtMs - 180_000),
            observedAt: iso(producedAtMs - 60_000),
            quality: "structured_generated",
            coverage: "complete",
            confidence: 0.9,
        });
    }
    const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
        ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)(input.owner),
        producedAt: iso(producedAtMs),
        meetings: [{
                binding: binding(),
                documentId: DOCUMENT_ID,
                revisionId: revision,
                contentDigest: digest(`content:${revision}`),
                modifiedAt: iso(producedAtMs - 90_000),
                eventTime: iso(producedAtMs - 180_000),
                observedAt: iso(producedAtMs - 60_000),
                evidence,
            }],
    });
    const snapshotPath = node_path_1.default.join(ownerScopeForHome(input.home).sourceRoot, "meeting-producer-snapshot.v1.json");
    (0, node_fs_1.writeFileSync)(snapshotPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(snapshot), { mode: 0o600 });
    (0, node_fs_1.chmodSync)(snapshotPath, 0o600);
}
function agentSnapshotPathForHome(home) {
    return node_path_1.default.join(ownerScopeForHome(home).sourceRoot, "agent-session-producer-snapshot.v1.json");
}
function agentObservation(producedAtMs) {
    const rows = [
        {
            timestamp: iso(producedAtMs - 240_000),
            type: "session_meta",
            payload: { id: "candidate-cli-codex-session" },
        },
        {
            timestamp: iso(producedAtMs - 210_000),
            type: "turn_context",
            payload: {
                cwd: "/Users/reviewer/DaobrewAI",
                workspace_roots: ["/Users/reviewer/DaobrewAI"],
            },
        },
        {
            timestamp: iso(producedAtMs - 180_000),
            type: "response_item",
            payload: {
                id: "candidate-cli-codex-turn",
                type: "message",
                role: "user",
                content: [{
                        type: "input_text",
                        text: "Implement deterministic work candidate review",
                    }],
            },
        },
        {
            timestamp: iso(producedAtMs - 120_000),
            type: "response_item",
            payload: {
                type: "message",
                role: "assistant",
                content: [{
                        type: "output_text",
                        text: "Prepared the bounded review implementation.",
                    }],
            },
        },
    ];
    return {
        provider: "codex",
        rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    };
}
async function writeAgentSnapshot(input) {
    const producedAtMs = input.producedAtMs ?? Date.now() - 30_000;
    const snapshot = (0, agent_session_producer_freshness_js_1.buildTaskMapAgentSessionProducerSnapshot)({
        ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)(input.owner),
        producedAt: iso(producedAtMs),
        observations: [agentObservation(producedAtMs)],
    });
    const snapshotPath = agentSnapshotPathForHome(input.home);
    (0, node_fs_1.writeFileSync)(snapshotPath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(snapshot), { mode: 0o600 });
    (0, node_fs_1.chmodSync)(snapshotPath, 0o600);
    const scope = ownerScopeForHome(input.home);
    (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(scope.runtimeRoot, 0o700);
    await (0, taskmap_agent_session_extraction_fixture_js_1.refreshAgentSessionExtractionFixture)({
        admission: (0, agent_session_semantic_admission_js_1.buildTaskMapAgentSessionSemanticAdmission)(snapshot),
        taskMapRoot: scope.taskMapRoot,
        runtimeRoot: scope.runtimeRoot,
        promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/agent-session-extraction-v1.md"),
        assessedAt: iso(Date.now()),
    });
}
async function writeCalendarSnapshot(input) {
    const scope = ownerScopeForHome(input.home);
    const producedAt = iso(Date.now() - 30_000);
    const startAt = iso(Date.now() + 3_600_000);
    const endAt = iso(Date.now() + 5_400_000);
    const eventIdentityDigest = digest(`calendar-event:${input.owner}`);
    const title = "Review the calendar launch";
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
    const assessedAt = iso(Date.now());
    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
        localExportPath,
        googleSnapshotPath: node_path_1.default.join(scope.sourceRoot, "calendar-google-provider-snapshot.v1.json"),
        assessedAt,
        expectedOwnerScopeDigest: scope.ownerScopeDigest,
    });
    (0, node_fs_1.mkdirSync)(scope.runtimeRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(scope.runtimeRoot, 0o700);
    await (0, taskmap_calendar_extraction_fixture_js_1.refreshCalendarExtractionFixture)({
        result,
        taskMapRoot: scope.taskMapRoot,
        runtimeRoot: scope.runtimeRoot,
        promptTemplatePath: node_path_1.default.resolve(__dirname, "../../prompts/calendar-extraction-v1.md"),
        assessedAt,
    });
}
function startCli(home, argv, environmentOwner = "") {
    const executable = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review-cli.js");
    const child = (0, node_child_process_1.spawn)(process.execPath, [executable, ...argv], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            HOME: home,
            DAOBREW_CONFIG_FILE: node_path_1.default.join(home, ".daobrew", "config.json"),
            DAOBREW_USER_ID: environmentOwner,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    const started = new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
    });
    const result = new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (status) => {
            activeChildren.delete(child);
            resolve({ status, stdout, stderr });
        });
    });
    return { child, started, result };
}
function invokeCli(home, argv, environmentOwner = "") {
    return startCli(home, argv, environmentOwner).result;
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function holdCandidateReviewLock(home, owner) {
    const modulePath = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-candidate-review.js");
    const overlayPath = overlayPathForHome(home);
    const ownerScopeDigest = (0, confirmed_owner_js_1.testOwnerScopeDigest)(owner);
    const script = `
    const review = require(process.env.TEST_REVIEW_MODULE);
    review.withTaskMapNativeCandidateReviewTransaction({
      overlayPath: process.env.TEST_OVERLAY_PATH,
      expectedOwnerScopeDigest: process.env.TEST_OWNER_SCOPE_DIGEST,
    }, async () => {
      if (process.send) process.send("locked");
      await new Promise(() => {
        setInterval(() => {}, 1_000);
      });
    }).catch((error) => {
      if (process.send) process.send({ error: String(error) });
      process.exitCode = 1;
    });
  `;
    const child = (0, node_child_process_1.spawn)(process.execPath, ["-e", script], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            TEST_REVIEW_MODULE: modulePath,
            TEST_OVERLAY_PATH: overlayPath,
            TEST_OWNER_SCOPE_DIGEST: ownerScopeDigest,
        },
        stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    activeChildren.add(child);
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("lock holder did not acquire the lock")), 5_000);
        child.once("message", (message) => {
            clearTimeout(timeout);
            if (message === "locked") {
                resolve();
            }
            else {
                reject(new Error(`lock holder failed: ${JSON.stringify(message)}`));
            }
        });
        child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once("exit", (status) => {
            clearTimeout(timeout);
            reject(new Error(`lock holder exited early: ${status}`));
        });
    });
    return child;
}
async function killAndWait(child) {
    if (child.exitCode !== null || child.signalCode !== null)
        return;
    const closed = new Promise((resolve) => {
        child.once("close", () => resolve());
    });
    child.kill("SIGKILL");
    await closed;
    activeChildren.delete(child);
}
function parseShelf(stdout) {
    return JSON.parse(stdout);
}
function assertCoarseFailure(result, unreflectedValues) {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^taskmap-native-candidate-review: unavailable\n(?:Error|TypeError): /);
    assert.match(result.stderr, /\n {4}at /);
    for (const value of unreflectedValues) {
        assert.equal(result.stderr.includes(value), false, value);
    }
}
(0, node_test_1.describe)("Task Map native candidate review CLI", () => {
    (0, node_test_1.it)("parses only the two closed command forms", () => {
        const candidateId = `tmnativecandidate_${"a".repeat(64)}`;
        const revision = "b".repeat(64);
        assert.deepEqual((0, native_candidate_review_cli_js_1.parseTaskMapNativeCandidateReviewCommand)(["--list"]), { kind: "list" });
        assert.deepEqual((0, native_candidate_review_cli_js_1.parseTaskMapNativeCandidateReviewCommand)([
            "--review",
            candidateId,
            "--revision",
            revision,
            "--action",
            "dismiss",
        ]), {
            kind: "review",
            candidateId,
            candidateRevisionDigest: revision,
            action: "dismiss",
        });
        for (const invalid of [
            [],
            ["--list", "--review"],
            ["--review", candidateId, "--revision", revision, "--action", "defer"],
            ["--review", candidateId, "--action", "dismiss", "--revision", revision],
            ["--review", "private-candidate", "--revision", revision, "--action", "dismiss"],
            ["--review", candidateId, "--revision", revision.toUpperCase(), "--action", "dismiss"],
        ]) {
            assert.throws(() => (0, native_candidate_review_cli_js_1.parseTaskMapNativeCandidateReviewCommand)(invalid), (error) => error instanceof TypeError
                && /native-candidate-review-cli --list/.test(error.message)
                && !error.message.includes("private-candidate"));
        }
    });
    (0, node_test_1.it)("lists candidate-only evidence from config owner state and persists no display data", async () => {
        const home = makeHome("owner-config");
        writeProducerSnapshot({ home, owner: "owner-config" });
        const result = await invokeCli(home, ["--list"]);
        assert.equal(result.status, 0);
        assert.equal(result.stderr, "");
        assert.ok(Buffer.byteLength(result.stdout, "utf8")
            <= native_candidate_review_cli_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES + 1);
        const shelf = parseShelf(result.stdout);
        assert.equal(shelf.contractVersion, "taskmap-native-candidate-shelf.v3");
        assert.equal(shelf.candidates.length, 1);
        assert.equal(shelf.candidates[0].candidateFamily, "meeting");
        assert.equal(shelf.candidates[0].title, ACTION_TITLE);
        assert.equal(shelf.candidates[0].summary, ACTION_SUMMARY);
        assert.equal(result.stdout.includes(DECISION_TITLE), false);
        assert.equal(shelf.candidates[0].acceptedWork, false);
        assert.equal(shelf.candidates[0].rankEligible, false);
        assert.equal(shelf.candidates[0].routeEligible, false);
        assert.equal(shelf.candidates[0].proveEligible, false);
        assert.equal(shelf.candidates[0].runEligible, false);
        const overlayPath = overlayPathForHome(home);
        assert.equal(overlayPath, node_path_1.default.join(ownerScopeForHome(home).taskMapRoot, "native-candidate-review.v1.json"));
        assert.equal((0, node_fs_1.statSync)(node_path_1.default.dirname(overlayPath)).mode & 0o777, 0o700);
        assert.equal((0, node_fs_1.statSync)(overlayPath).mode & 0o777, 0o600);
        const persisted = (0, node_fs_1.readFileSync)(overlayPath, "utf8");
        for (const sentinel of [
            ACTION_TITLE,
            ACTION_SUMMARY,
            DECISION_TITLE,
            DOCUMENT_ID,
            SOURCE_REVISION,
            SOURCE_REFERENCE,
            "owner-config",
            "gemini_meet",
        ]) {
            assert.equal(persisted.includes(sentinel), false, sentinel);
        }
        assert.equal(persisted.includes('"displayTextStored":false'), true);
        assert.equal(persisted.includes('"acceptedWorkStored":false'), true);
    });
    (0, node_test_1.it)("keeps deterministic community topics when live semantic grouping proof is unavailable", async () => {
        const home = makeHome("owner-v2-list");
        writeProducerSnapshot({ home, owner: "owner-v2-list" });
        await writeAgentSnapshot({ home, owner: "owner-v2-list" });
        await writeCalendarSnapshot({ home, owner: "owner-v2-list" });
        const first = await invokeCli(home, ["--list"]);
        assert.equal(first.status, 0, first.stderr);
        assert.equal(first.stderr, "");
        const firstShelf = parseShelf(first.stdout);
        assert.equal(firstShelf.contractVersion, "taskmap-native-candidate-shelf.v3");
        assert.equal(first.stdout, `${(0, source_contracts_js_1.taskMapContractCanonicalJson)(firstShelf)}\n`);
        assert.equal((first.stdout.match(/\n/g) ?? []).length, 1);
        assert.deepEqual(firstShelf.candidates.map((row) => row.candidateFamily).sort(), ["agent_session", "calendar", "meeting"]);
        assert.equal(firstShelf.hierarchy.groupingState, "available");
        assert.equal(firstShelf.hierarchy.authority, "none");
        assert.equal(firstShelf.hierarchy.acceptedWork, false);
        assert.equal(firstShelf.hierarchy.rankEligible, false);
        assert.ok(firstShelf.hierarchy.topics.length > 0);
        assert.deepEqual(firstShelf.hierarchy.ungroupedCandidateIds, []);
        assert.deepEqual(firstShelf.hierarchy.topics
            .flatMap((topic) => topic.candidateIds)
            .sort(), firstShelf.candidates.map((row) => row.candidateId).sort());
        assert.ok(firstShelf.hierarchy.topics.every((topic) => topic.title.trim().length > 0
            && (topic.titleSource === "llm_community_title_v1"
                || topic.titleSource === "deterministic_fallback")));
        const agent = firstShelf.candidates.find((row) => row.candidateFamily === "agent_session");
        assert.ok(agent);
        assert.deepEqual(agent.sourceKinds, ["codex_session"]);
        assert.equal(agent.sourceWritebackEligible, false);
        assert.equal(agent.acceptedWork, false);
        assert.equal(agent.rankEligible, false);
        assert.equal(agent.routeEligible, false);
        assert.equal(agent.proveEligible, false);
        assert.equal(agent.runEligible, false);
        const calendar = firstShelf.candidates.find((row) => row.candidateFamily === "calendar");
        assert.ok(calendar);
        assert.deepEqual(calendar.sourceKinds, ["calendar"]);
        assert.equal(calendar.sourceWritebackEligible, false);
        const replay = await invokeCli(home, ["--list"]);
        assert.equal(replay.status, 0);
        assert.equal(replay.stderr, "");
        assert.deepEqual(parseShelf(replay.stdout).candidates, firstShelf.candidates);
        assert.deepEqual(parseShelf(replay.stdout).hierarchy, firstShelf.hierarchy);
    });
    (0, node_test_1.it)("reviews an agent candidate through the shared overlay without mutating source evidence", async () => {
        const owner = "owner-v2-agent-review";
        const home = makeHome(owner);
        writeProducerSnapshot({ home, owner });
        await writeAgentSnapshot({ home, owner });
        const sourcePath = agentSnapshotPathForHome(home);
        const sourceBefore = (0, node_fs_1.readFileSync)(sourcePath, "utf8");
        const listed = parseShelf((await invokeCli(home, ["--list"])).stdout);
        const agent = listed.candidates.find((row) => row.candidateFamily === "agent_session");
        assert.ok(agent);
        const reviewed = await invokeCli(home, [
            "--review",
            agent.candidateId,
            "--revision",
            agent.candidateRevisionDigest,
            "--action",
            "accept_for_review",
        ]);
        assert.equal(reviewed.status, 0);
        assert.equal(reviewed.stderr, "");
        const reviewedShelf = parseShelf(reviewed.stdout);
        const reviewedAgent = reviewedShelf.candidates.find((row) => row.candidateFamily === "agent_session");
        assert.ok(reviewedAgent);
        assert.equal(reviewedAgent.reviewState, "accept_for_review");
        assert.equal(reviewedAgent.reviewedOnly, true);
        assert.equal(reviewedAgent.acceptedWork, false);
        assert.equal(reviewedAgent.sourceWritebackEligible, false);
        assert.equal(reviewedAgent.runEligible, false);
        assert.equal((0, node_fs_1.readFileSync)(sourcePath, "utf8"), sourceBefore);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(ownerScopeForHome(home).taskMapRoot, "native-candidate-acceptance.v1.json")), false);
        assert.equal((0, node_fs_1.readdirSync)(ownerScopeForHome(home).taskMapRoot).some((entry) => /agent|command|process|writeback/i.test(entry)), false);
    });
    (0, node_test_1.it)("rejects wrong-owner, stale, and malformed agent shelves instead of falling back to meeting data", async () => {
        const wrongHome = makeHome("owner-v2-wrong");
        writeProducerSnapshot({ home: wrongHome, owner: "owner-v2-wrong" });
        await writeAgentSnapshot({ home: wrongHome, owner: "different-v2-owner" });
        assertCoarseFailure(await invokeCli(wrongHome, ["--list"]), [
            wrongHome,
            "owner-v2-wrong",
            "different-v2-owner",
        ]);
        const staleHome = makeHome("owner-v2-stale");
        writeProducerSnapshot({ home: staleHome, owner: "owner-v2-stale" });
        await writeAgentSnapshot({
            home: staleHome,
            owner: "owner-v2-stale",
            producedAtMs: Date.now() - 5 * 60 * 60 * 1000,
        });
        assertCoarseFailure(await invokeCli(staleHome, ["--list"]), [
            staleHome,
            "owner-v2-stale",
        ]);
        const malformedHome = makeHome("owner-v2-malformed");
        writeProducerSnapshot({ home: malformedHome, owner: "owner-v2-malformed" });
        await writeAgentSnapshot({
            home: malformedHome,
            owner: "owner-v2-malformed",
        });
        const malformedPath = agentSnapshotPathForHome(malformedHome);
        const malformed = JSON.parse((0, node_fs_1.readFileSync)(malformedPath, "utf8"));
        malformed.contractVersion =
            "taskmap-agent-session-producer-snapshot.v1";
        (0, node_fs_1.writeFileSync)(malformedPath, JSON.stringify(malformed), { mode: 0o600 });
        (0, node_fs_1.chmodSync)(malformedPath, 0o600);
        assertCoarseFailure(await invokeCli(malformedHome, ["--list"]), [
            malformedHome,
            "owner-v2-malformed",
        ]);
    });
    (0, node_test_1.it)("rejects a mixed-family v2 output row before writing stdout", async () => {
        const home = makeHome("owner-v2-mixed-row");
        writeProducerSnapshot({ home, owner: "owner-v2-mixed-row" });
        await writeAgentSnapshot({ home, owner: "owner-v2-mixed-row" });
        const listed = parseShelf((await invokeCli(home, ["--list"])).stdout);
        const mixed = structuredClone(listed);
        const agent = mixed.candidates.find((row) => row.candidateFamily === "agent_session");
        assert.ok(agent);
        agent.sourceKinds.push("gemini_meet");
        assert.throws(() => (0, native_candidate_review_cli_js_1.taskMapNativeCandidateShelfOutput)(mixed), /mixed|family|source/i);
    });
    (0, node_test_1.it)("accepts only an environment confirmation of the persisted owner", async () => {
        const matchingHome = makeHome("persisted-owner");
        writeProducerSnapshot({ home: matchingHome, owner: "persisted-owner" });
        const matching = await invokeCli(matchingHome, ["--list"], canonicalTestUserId("persisted-owner"));
        assert.equal(matching.status, 0);
        assert.equal(matching.stderr, "");
        const home = makeHome("wrong-config-owner");
        writeProducerSnapshot({ home, owner: "environment-owner" });
        const result = await invokeCli(home, ["--list"], canonicalTestUserId("environment-owner"));
        assertCoarseFailure(result, [
            home,
            "wrong-config-owner",
            "environment-owner",
            DOCUMENT_ID,
            ACTION_TITLE,
        ]);
    });
    (0, node_test_1.it)("reviews and replays idempotently with a domain-separated digest", async () => {
        const home = makeHome("owner-review");
        writeProducerSnapshot({ home, owner: "owner-review" });
        const listed = await invokeCli(home, ["--list"]);
        assert.equal(listed.status, 0);
        const candidate = parseShelf(listed.stdout).candidates[0];
        const reviewArgv = [
            "--review",
            candidate.candidateId,
            "--revision",
            candidate.candidateRevisionDigest,
            "--action",
            "accept_for_review",
        ];
        const first = await invokeCli(home, reviewArgv);
        assert.equal(first.status, 0);
        assert.equal(first.stderr, "");
        const firstShelf = parseShelf(first.stdout);
        assert.equal(firstShelf.candidates[0].reviewState, "accept_for_review");
        assert.equal(firstShelf.candidates[0].reviewedOnly, true);
        assert.equal(firstShelf.candidates[0].acceptedWork, false);
        const overlayPath = overlayPathForHome(home);
        const firstBytes = (0, node_fs_1.readFileSync)(overlayPath, "utf8");
        const firstOverlay = JSON.parse(firstBytes);
        assert.equal(firstOverlay.candidates[0].review?.idempotencyKeyDigest, (0, source_contracts_js_1.taskMapContractDigest)({
            domain: native_candidate_review_cli_js_1.TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN,
            ownerScopeDigest: (0, confirmed_owner_js_1.testOwnerScopeDigest)("owner-review"),
            candidateId: candidate.candidateId,
            candidateRevisionDigest: candidate.candidateRevisionDigest,
            action: "accept_for_review",
        }));
        assert.equal(firstOverlay.candidates[0].review?.acceptedWork, false);
        for (const sentinel of [
            ACTION_TITLE,
            ACTION_SUMMARY,
            DOCUMENT_ID,
            SOURCE_REVISION,
            SOURCE_REFERENCE,
            "owner-review",
        ]) {
            assert.equal(firstBytes.includes(sentinel), false, sentinel);
        }
        const replay = await invokeCli(home, reviewArgv);
        assert.equal(replay.status, 0);
        assert.equal(replay.stderr, "");
        assert.equal(parseShelf(replay.stdout).candidates[0].reviewState, "accept_for_review");
        const replayOverlay = JSON.parse((0, node_fs_1.readFileSync)(overlayPath, "utf8"));
        assert.deepEqual(replayOverlay.candidates[0].review, firstOverlay.candidates[0].review);
    });
    (0, node_test_1.it)("keeps a live owner lock and recovers its identity-bound residue after SIGKILL", async () => {
        const owner = "owner-lock-recovery";
        const home = makeHome(owner);
        writeProducerSnapshot({ home, owner });
        const overlayPath = overlayPathForHome(home);
        const holder = await holdCandidateReviewLock(home, owner);
        assert.equal((0, node_fs_1.existsSync)(`${overlayPath}.lock`), true);
        const waiting = startCli(home, ["--list"]);
        await waiting.started;
        let settled = false;
        void waiting.result.then(() => { settled = true; }, () => { settled = true; });
        await delay(150);
        assert.equal(settled, false);
        assert.equal((0, node_fs_1.existsSync)(`${overlayPath}.lock`), true);
        await killAndWait(holder);
        const result = await waiting.result;
        assert.equal(result.status, 0);
        assert.equal(result.stderr, "");
        assert.equal(parseShelf(result.stdout).candidates.length, 1);
        assert.deepEqual((0, node_fs_1.readdirSync)(node_path_1.default.dirname(overlayPath)).filter((entry) => entry.startsWith(`${node_path_1.default.basename(overlayPath)}.lock`)), []);
    });
    (0, node_test_1.it)("serializes simultaneous reviews of different candidates without losing either decision", async () => {
        const owner = "owner-concurrent-reviews";
        const home = makeHome(owner);
        writeProducerSnapshot({
            home,
            owner,
            includeSecondCandidate: true,
        });
        const listed = await invokeCli(home, ["--list"]);
        assert.equal(listed.status, 0);
        const candidates = parseShelf(listed.stdout).candidates;
        assert.equal(candidates.length, 2);
        const first = candidates.find((row) => row.title === ACTION_TITLE);
        const second = candidates.find((row) => row.title === SECOND_ACTION_TITLE);
        assert.ok(first);
        assert.ok(second);
        const holder = await holdCandidateReviewLock(home, owner);
        const firstReview = startCli(home, [
            "--review",
            first.candidateId,
            "--revision",
            first.candidateRevisionDigest,
            "--action",
            "accept_for_review",
        ]);
        const secondReview = startCli(home, [
            "--review",
            second.candidateId,
            "--revision",
            second.candidateRevisionDigest,
            "--action",
            "dismiss",
        ]);
        await Promise.all([firstReview.started, secondReview.started]);
        await delay(100);
        await killAndWait(holder);
        const results = await Promise.all([
            firstReview.result,
            secondReview.result,
        ]);
        assert.equal(results.every((result) => result.status === 0), true);
        assert.equal(results.every((result) => result.stderr === ""), true);
        const final = parseShelf((await invokeCli(home, ["--list"])).stdout);
        assert.equal(final.candidates.find((row) => row.title === ACTION_TITLE)?.reviewState, "accept_for_review");
        assert.equal(final.candidates.find((row) => row.title === SECOND_ACTION_TITLE), undefined);
        assert.equal(final.candidates.every((row) => row.reviewedOnly
            && !row.acceptedWork
            && !row.rankEligible
            && !row.routeEligible
            && !row.proveEligible
            && !row.runEligible), true);
    });
    (0, node_test_1.it)("serializes list versus review without allowing the list to erase the decision", async () => {
        const owner = "owner-list-review-race";
        const home = makeHome(owner);
        writeProducerSnapshot({ home, owner });
        const initial = await invokeCli(home, ["--list"]);
        assert.equal(initial.status, 0);
        const candidate = parseShelf(initial.stdout).candidates[0];
        const overlayPath = overlayPathForHome(home);
        (0, node_fs_1.unlinkSync)(overlayPath);
        const holder = await holdCandidateReviewLock(home, owner);
        const list = startCli(home, ["--list"]);
        const review = startCli(home, [
            "--review",
            candidate.candidateId,
            "--revision",
            candidate.candidateRevisionDigest,
            "--action",
            "accept_for_review",
        ]);
        await Promise.all([list.started, review.started]);
        await delay(100);
        await killAndWait(holder);
        const [listResult, reviewResult] = await Promise.all([
            list.result,
            review.result,
        ]);
        assert.equal(listResult.status, 0);
        assert.equal(reviewResult.status, 0);
        assert.equal(listResult.stderr, "");
        assert.equal(reviewResult.stderr, "");
        const final = parseShelf((await invokeCli(home, ["--list"])).stdout);
        assert.equal(final.candidates[0].reviewState, "accept_for_review");
        assert.equal(final.candidates[0].reviewedOnly, true);
        assert.equal(final.candidates[0].acceptedWork, false);
        assert.equal(final.candidates[0].rankEligible, false);
        assert.equal(final.candidates[0].routeEligible, false);
        assert.equal(final.candidates[0].proveEligible, false);
        assert.equal(final.candidates[0].runEligible, false);
    });
    (0, node_test_1.it)("rejects an old candidate revision without changing durable review state", async () => {
        const home = makeHome("owner-stale-revision");
        writeProducerSnapshot({ home, owner: "owner-stale-revision" });
        const listed = await invokeCli(home, ["--list"]);
        const oldCandidate = parseShelf(listed.stdout).candidates[0];
        const overlayPath = overlayPathForHome(home);
        const before = (0, node_fs_1.readFileSync)(overlayPath, "utf8");
        writeProducerSnapshot({
            home,
            owner: "owner-stale-revision",
            revision: `${SOURCE_REVISION}-updated`,
            actionOverrides: {
                status: "in_progress",
                quality: "source_native",
                coverage: "complete",
                confidence: 1,
            },
        });
        const result = await invokeCli(home, [
            "--review",
            oldCandidate.candidateId,
            "--revision",
            oldCandidate.candidateRevisionDigest,
            "--action",
            "dismiss",
        ]);
        assertCoarseFailure(result, [
            home,
            "owner-stale-revision",
            SOURCE_REVISION,
            ACTION_TITLE,
        ]);
        assert.equal((0, node_fs_1.readFileSync)(overlayPath, "utf8"), before);
    });
    (0, node_test_1.it)("fails coarsely for missing, wrong-owner, stale, and malformed command input", async () => {
        const missingHome = makeHome("owner-missing");
        assertCoarseFailure(await invokeCli(missingHome, ["--list"]), [missingHome, "owner-missing"]);
        const wrongOwnerHome = makeHome("expected-owner");
        writeProducerSnapshot({
            home: wrongOwnerHome,
            owner: "different-owner",
        });
        assertCoarseFailure(await invokeCli(wrongOwnerHome, ["--list"]), [
            wrongOwnerHome,
            "expected-owner",
            "different-owner",
            DOCUMENT_ID,
            ACTION_TITLE,
        ]);
        const staleHome = makeHome("owner-stale");
        writeProducerSnapshot({
            home: staleHome,
            owner: "owner-stale",
            producedAtMs: Date.now() - 5 * 60 * 60 * 1000,
        });
        assertCoarseFailure(await invokeCli(staleHome, ["--list"]), [staleHome, "owner-stale", DOCUMENT_ID, ACTION_TITLE]);
        const noOwnerHome = makeHome(null);
        assertCoarseFailure(await invokeCli(noOwnerHome, ["--list"]), [noOwnerHome]);
        const malformedHome = makeHome("owner-parser");
        const malformed = await invokeCli(malformedHome, ["--review", "private-candidate"]);
        assertCoarseFailure(malformed, [malformedHome, "owner-parser", "private-candidate"]);
        assert.match(malformed.stderr, /^taskmap-native-candidate-review: unavailable\nTypeError: usage: native-candidate-review-cli/m);
        assert.match(malformed.stderr, /at usageError/);
    });
});
