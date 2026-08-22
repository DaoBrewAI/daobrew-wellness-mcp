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
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_child_process_2 = require("node:child_process");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const native_refresh_cli_js_1 = require("../src/engine/taskmap/native-refresh-cli.js");
const nativeRefreshCliModule = __importStar(require("../src/engine/taskmap/native-refresh-cli.js"));
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const ISSUER_URL = "https://api.example.test/api/v1";
(0, node_test_1.it)("wires one bounded real provider ladder into packaged extraction, grouping, and title paths", () => {
    const optionsFactory = nativeRefreshCliModule.taskMapNativeRefreshServiceOptionsFromEnvironment;
    const discoveryBudget = nativeRefreshCliModule.TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS;
    const inferenceBudget = nativeRefreshCliModule.TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS;
    const writeHeadroom = nativeRefreshCliModule.TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS;
    const titleBudget = nativeRefreshCliModule.TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS;
    assert.equal(typeof optionsFactory, "function");
    const createStation = async () => ({
        provider: {
            transport: "local-rules",
            executable: "builtin",
            args: [],
            model: "fixture-provider-ladder",
        },
        async run() {
            throw new Error("not invoked by wiring test");
        },
    });
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("native-refresh-cli-shadow-ladder");
    const options = optionsFactory(owner, {}, owner.homeDirectory, createStation);
    for (const key of [
        "createMeetingExtractionStation",
        "createAgentSessionExtractionStation",
        "createCalendarExtractionStation",
        "createCommunityGroupingStation",
    ]) {
        assert.equal(options[key], createStation, key);
    }
    assert.equal(discoveryBudget, 5_000);
    assert.equal(inferenceBudget, 80_000);
    assert.equal(titleBudget, 30_000);
    assert.equal(writeHeadroom, 5_000);
    assert.equal(options.communityPlanDeadlineMs, discoveryBudget
        + inferenceBudget
        + titleBudget
        + writeHeadroom);
    assert.ok(options.communityPlanDeadlineMs <= 120_000);
    assert.equal(options.communityPlanDeadlineMs, 120_000);
});
(0, node_test_1.it)("leaves production station factories to the request-group-aware service defaults", () => {
    const optionsFactory = nativeRefreshCliModule.taskMapNativeRefreshServiceOptionsFromEnvironment;
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)("native-refresh-cli-production-ladder");
    const options = optionsFactory(owner, {}, owner.homeDirectory);
    for (const key of [
        "createMeetingExtractionStation",
        "createAgentSessionExtractionStation",
        "createCalendarExtractionStation",
        "createCommunityGroupingStation",
    ]) {
        assert.equal(options[key], undefined, key);
    }
});
function writeJson(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
function makeTempHome(prefix) {
    return (0, node_fs_1.realpathSync)((0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), prefix)));
}
function digest(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function compiledLocalImportClosure(entrypoint) {
    const pending = [node_path_1.default.resolve(entrypoint)];
    const visited = new Set();
    const localImport = /(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+\.js)["']/gu;
    while (pending.length > 0) {
        const current = pending.pop();
        assert.ok(current);
        if (visited.has(current))
            continue;
        assert.equal((0, node_fs_1.existsSync)(current), true, `compiled module missing: ${current}`);
        visited.add(current);
        const source = (0, node_fs_1.readFileSync)(current, "utf8");
        for (const match of source.matchAll(localImport)) {
            pending.push(node_path_1.default.resolve(node_path_1.default.dirname(current), match[1]));
        }
    }
    return visited;
}
function meeting(documentId, occurredAt) {
    return {
        binding: {
            connectionId: "cli-gemini-owner",
            sourceKind: "gemini_meet",
            tenantOrWorkspaceDigest: digest("cli-workspace"),
            accountOrPrincipalDigest: digest("cli-principal"),
            grantVersion: "grant-1",
        },
        documentId,
        revisionId: `revision-${documentId}`,
        contentDigest: digest(`content-${documentId}`),
        modifiedAt: occurredAt,
        eventTime: occurredAt,
        observedAt: occurredAt,
        evidence: [{
                kind: "action_item",
                title: "Ship the packaged semantic builder",
                summary: "Verify the local authenticated default Task Map path.",
                occurredAt,
                observedAt: occurredAt,
                status: "open",
                quality: "structured_generated",
                coverage: "partial",
                confidence: 0.9,
                objectRefs: [{
                        kind: "external_reference",
                        referenceDigest: digest("packaged-semantic-builder"),
                    }],
            }],
    };
}
function writeDefaultSourceFixtures(home, generatedAt) {
    writeJson(node_path_1.default.join(home, ".codex", "sessions", "session.jsonl"), { type: "session_meta" });
    writeJson(node_path_1.default.join(home, ".daobrew", "calendar-export.json"), {
        generated_at: generatedAt,
        rawEvents: [{ id: "event-1", startDate: generatedAt }],
    });
    writeJson(node_path_1.default.join(home, "Library", "Application Support", "DaoBrew", "taskmap", "taskmap-body-context.v1.json"), {
        generatedAt,
        privacy: {
            rawBiometricsStored: false,
            sourceBodiesStored: false,
        },
        coverage: {
            classifiedDays: 1,
            unknownDays: 0,
        },
    });
}
function invokeCLI(home, runtimeRoot, trigger, explicitUserId = "") {
    const command = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-refresh-cli.js");
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_2.spawn)(process.execPath, [command, "--trigger", trigger], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                HOME: home,
                DAOBREW_TASKMAP_REFRESH_ROOT: runtimeRoot,
                DAOBREW_CONFIG_FILE: node_path_1.default.join(home, ".daobrew", "config.json"),
                DAOBREW_USER_ID: explicitUserId,
                GEMINI_API_KEY: "",
                GOOGLE_API_KEY: "",
                OPENAI_API_KEY: "",
                ANTHROPIC_API_KEY: "",
                DAOBREW_TASKMAP_STRATEGY_REPO: "",
                DAOBREW_TASKMAP_STRATEGY_BINDINGS: "",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
}
(0, node_test_1.describe)("Task Map packaged refresh CLI", () => {
    (0, node_test_1.it)("ships the three-station Gemini fallback closure without new prompt resources", () => {
        const entrypoint = node_path_1.default.resolve(__dirname, "../src/engine/taskmap/native-refresh-cli.js");
        const closure = compiledLocalImportClosure(entrypoint);
        const requiredModules = [
            "../src/engine/taskmap/gemini-remote.js",
            "../src/engine/taskmap/identity-adjudication-proposal.js",
            "../src/engine/taskmap/identity-adjudication-refresh.js",
            "../src/engine/taskmap/llm-proposal-surface.js",
            "../src/engine/taskmap/llm-station.js",
            "../src/engine/taskmap/method-library.js",
            "../src/engine/taskmap/decomposition-validation.js",
            "../src/engine/taskmap/decomposition-refresh.js",
            "../src/engine/embeddings/gemini-remote.js",
        ].map((relative) => node_path_1.default.resolve(__dirname, relative));
        for (const modulePath of requiredModules) {
            assert.equal(closure.has(modulePath), true, `${node_path_1.default.basename(modulePath)} must be reachable from native-refresh-cli.js`);
        }
        for (const relative of [
            "../src/engine/taskmap/identity-adjudication-proposal.js",
            "../src/engine/taskmap/method-library.js",
        ]) {
            assert.doesNotMatch((0, node_fs_1.readFileSync)(node_path_1.default.resolve(__dirname, relative), "utf8"), /promptTemplatePath/);
        }
    });
    (0, node_test_1.it)("constructs only the explicit local Strategy bridge and fails closed on malformed or mismatched inputs", async () => {
        const home = makeTempHome("taskmap-cli-strategy-");
        const repositoryRoot = node_path_1.default.join(home, "strategy-repository");
        const repositoryPath = "tasks/TASKS.md";
        const repositoryText = [
            "# Tasks",
            "| Priority | Goal | Detail |",
            "| --- | --- | --- |",
            "| P0 | Demo Task Map | Ship the bounded local demo |",
            "",
        ].join("\n");
        (0, node_fs_1.mkdirSync)(node_path_1.default.join(repositoryRoot, "tasks"), {
            recursive: true,
            mode: 0o700,
        });
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(repositoryRoot, repositoryPath), repositoryText, { mode: 0o600 });
        (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "init", "-q"]);
        (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "config", "user.name", "Task Map Fixture"]);
        (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "config", "user.email", "fixture@example.test"]);
        (0, node_child_process_1.execFileSync)("git", [
            "-C",
            repositoryRoot,
            "remote",
            "add",
            "origin",
            "https://github.com/Example/FounderStrategy.git",
        ]);
        (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "add", repositoryPath]);
        (0, node_child_process_1.execFileSync)("git", [
            "-c",
            "commit.gpgSign=false",
            "-C",
            repositoryRoot,
            "commit",
            "-q",
            "-m",
            "fixture",
        ], {
            env: {
                ...process.env,
                GIT_AUTHOR_DATE: "2026-07-28T18:40:25-07:00",
                GIT_COMMITTER_DATE: "2026-07-28T18:40:25-07:00",
            },
        });
        const revision = (0, node_child_process_1.execFileSync)("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
        const taskMapRoot = (0, owner_scope_js_1.createTaskMapOwnerScope)("14802294-BEED-480E-ABF6-7E3703FA25CD", home).taskMapRoot;
        const projectionBytes = Buffer.from(`${JSON.stringify({ fixed: "projection" })}\n`);
        const currentnessBytes = Buffer.from(`${JSON.stringify({ fixed: "currentness" })}\n`);
        writeJson(node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json"), { fixed: "projection" });
        writeJson(node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json"), { fixed: "currentness" });
        const bindingsPath = node_path_1.default.join(home, "strategy-bindings.json");
        writeJson(bindingsPath, [{
                pointerId: "strategy-task-1",
                canonicalRowDigest: digest("strategy-row"),
            }]);
        writeJson(node_path_1.default.join(home, ".daobrew", "config.json"), {
            user_id: "14802294-BEED-480E-ABF6-7E3703FA25CD",
            device_credential: "dbd_cli_confirmed_123456789012345678901234",
            device_credential_confirmed: true,
            api_url: ISSUER_URL,
        });
        const environment = {
            DAOBREW_USER_ID: "14802294-BEED-480E-ABF6-7E3703FA25CD",
            DAOBREW_CONFIG_FILE: node_path_1.default.join(home, ".daobrew", "config.json"),
            DAOBREW_TASKMAP_STRATEGY_REPO: repositoryRoot,
            DAOBREW_TASKMAP_STRATEGY_BINDINGS: bindingsPath,
        };
        const fallback = (0, native_refresh_cli_js_1.taskMapNativeRefreshStrategyFallbackFromEnvironment)(environment, home);
        assert.ok(fallback);
        assert.equal(fallback.homeDirectory, home);
        const inheritedGitDirectory = process.env.GIT_DIR;
        process.env.GIT_DIR = node_path_1.default.join(home, "redirected-git-directory");
        let input;
        try {
            input = await fallback.readAdapterInput();
        }
        finally {
            if (inheritedGitDirectory === undefined) {
                delete process.env.GIT_DIR;
            }
            else {
                process.env.GIT_DIR = inheritedGitDirectory;
            }
        }
        assert.deepEqual(input.projectionBytes, projectionBytes);
        assert.deepEqual(input.currentnessBytes, currentnessBytes);
        assert.equal(input.expectedProjectionFileDigest, digest(projectionBytes.toString("utf8")));
        assert.equal(input.expectedCurrentnessFileDigest, digest(currentnessBytes.toString("utf8")));
        assert.equal(input.binding.sourceKind, "strategy");
        assert.equal(input.binding.accountOrPrincipalDigest, input.ownerScopeDigest);
        assert.deepEqual(input.rowBindings, [{
                pointerId: "strategy-task-1",
                canonicalRowDigest: digest("strategy-row"),
            }]);
        const observation = await input.repositoryProvider.readImmutableRepositoryFile({
            remoteLocator: "https://github.com/Example/FounderStrategy",
            revision,
            repositoryRelativePath: repositoryPath,
            maximumBytes: 256 * 1_024,
        });
        assert.deepEqual([
            observation.remoteLocator,
            observation.revision,
            observation.repositoryRelativePath,
            observation.content,
            observation.contentDigest,
        ], [
            "https://github.com/Example/FounderStrategy",
            revision,
            repositoryPath,
            repositoryText,
            digest(repositoryText),
        ]);
        await assert.rejects(input.repositoryProvider.readImmutableRepositoryFile({
            remoteLocator: "https://github.com/Other/Repository",
            revision,
            repositoryRelativePath: repositoryPath,
            maximumBytes: 256 * 1_024,
        }), /locator mismatch/);
        const alternateConfigPath = node_path_1.default.join(home, "alternate-config.json");
        writeJson(alternateConfigPath, {
            user_id: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
            device_credential: "dbd_cli_alternate_123456789012345678901234",
            device_credential_confirmed: true,
            api_url: "https://alternate.example.test/api/v1",
        });
        const configOverrideAttempt = (0, native_refresh_cli_js_1.taskMapNativeRefreshStrategyFallbackFromEnvironment)({
            ...environment,
            DAOBREW_CONFIG_FILE: alternateConfigPath,
        }, home);
        assert.ok(configOverrideAttempt);
        assert.equal((await configOverrideAttempt.readAdapterInput()).ownerScopeDigest, (0, owner_scope_js_1.taskMapOwnerScopeDigest)(environment.DAOBREW_USER_ID));
        (0, node_fs_1.writeFileSync)(bindingsPath, "{malformed", { mode: 0o600 });
        const malformed = (0, native_refresh_cli_js_1.taskMapNativeRefreshStrategyFallbackFromEnvironment)(environment, home);
        assert.ok(malformed);
        await assert.rejects(malformed.readAdapterInput(), SyntaxError);
        assert.throws(() => (0, native_refresh_cli_js_1.taskMapNativeRefreshStrategyFallbackFromEnvironment)({
            DAOBREW_TASKMAP_STRATEGY_REPO: repositoryRoot,
        }, home), /requires both/);
        assert.equal((0, native_refresh_cli_js_1.taskMapNativeRefreshStrategyFallbackFromEnvironment)({}, home), undefined);
    });
    (0, node_test_1.it)("parses one explicit product trigger and preserves the runtime receipt", async () => {
        assert.deepEqual((0, native_refresh_cli_js_1.parseTaskMapNativeRefreshCommand)(["--trigger", "manual"]), { operation: "refresh", trigger: "manual" });
        assert.throws(() => (0, native_refresh_cli_js_1.parseTaskMapNativeRefreshCommand)(["--trigger", "codex"]), /launch\|manual\|timer/);
        assert.throws(() => (0, native_refresh_cli_js_1.parseTaskMapNativeRefreshCommand)([
            "--trigger",
            "manual",
            "--user-id",
            "owner-in-process-args",
        ]), /launch\|manual\|timer/);
        const response = await (0, native_refresh_cli_js_1.runTaskMapNativeRefreshCommand)(["--trigger", "launch"], {
            requestRefresh: async (trigger) => ({
                status: "partial",
                refreshStatus: "unavailable",
                sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                    source,
                    disposition: "unavailable",
                    state: "unavailable",
                    lastSuccessAtMs: null,
                    nextDueAtMs: null,
                    proof: null,
                    ...(source === "meeting_notes"
                        ? {
                            extractionDegradationCode: "provider_unauthenticated",
                        }
                        : {}),
                })),
                requestedAtMs: trigger === "launch" ? 1_000 : 0,
                nextDueAtMs: 1_000 + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
                publicationVerified: false,
                publicationBlockReason: "semantic_provider_unavailable",
            }),
        });
        assert.ok("requestedAtMs" in response);
        assert.equal(response.requestedAtMs, 1_000);
        assert.equal(response.sourceStatuses.find((status) => status.source === "meeting_notes")?.extractionDegradationCode, "provider_unauthenticated");
    });
    (0, node_test_1.it)("runs recovery without collecting or refreshing any source", async () => {
        assert.deepEqual((0, native_refresh_cli_js_1.parseTaskMapNativeRefreshCommand)(["--recover-only"]), { operation: "recover" });
        let refreshCalls = 0;
        let recoveryCalls = 0;
        const response = await (0, native_refresh_cli_js_1.runTaskMapNativeRefreshCommand)(["--recover-only"], {
            requestRefresh: async () => {
                refreshCalls += 1;
                throw new Error("refresh must not run during recovery");
            },
            recoverPendingPublication: async () => {
                recoveryCalls += 1;
                return true;
            },
        });
        assert.deepEqual(response, {
            status: "ok",
            operation: "recover",
            recovered: true,
        });
        assert.equal(refreshCalls, 0);
        assert.equal(recoveryCalls, 1);
    });
    (0, node_test_1.it)("preserves the safe failure receipt while exposing the originating parse stack", async () => {
        const home = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-cli-diagnostic-"));
        try {
            const result = await invokeCLI(home, node_path_1.default.join(home, "runtime"), "diagnostic-sentinel");
            assert.equal(result.status, 1);
            const receipt = JSON.parse(result.stdout);
            assert.equal(result.stdout, `${JSON.stringify(receipt)}\n`);
            assert.equal(receipt.status, "partial");
            assert.equal(receipt.refreshStatus, "unavailable");
            assert.equal(receipt.publicationVerified, false);
            assert.equal(receipt.publicationBlockReason, "publication_failed");
            assert.match(result.stderr, /^taskmap-native-refresh: unavailable\nTypeError: usage: native-refresh-cli/m);
            assert.match(result.stderr, /at parseTaskMapNativeRefreshCommand/);
            assert.equal(result.stderr.includes(home), false);
        }
        finally {
            (0, node_fs_1.rmSync)(home, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("falls back from a noncanonicalizable HOME while exposing the realpath cause", async () => {
        const fixtureRoot = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-cli-canonical-home-"));
        const missingHome = node_path_1.default.join(fixtureRoot, "missing-home");
        try {
            const result = await invokeCLI(missingHome, node_path_1.default.join(fixtureRoot, "runtime"), "manual");
            assert.equal(result.status, 1);
            const receipt = JSON.parse(result.stdout);
            assert.equal(result.stdout, `${JSON.stringify(receipt)}\n`);
            assert.equal(receipt.refreshStatus, "unavailable");
            assert.match(result.stderr, /^taskmap-native-refresh: canonical home unavailable\nError: ENOENT:/m);
            assert.match(result.stderr, /missing-home/);
            assert.match(result.stderr, /taskmap-native-refresh: unavailable\nError: Task Map confirmed owner enrollment is unavailable/);
        }
        finally {
            (0, node_fs_1.rmSync)(fixtureRoot, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails closed without confirmed canonical resident identity", async () => {
        const home = makeTempHome("taskmap-cli-home-");
        const runtimeRoot = node_path_1.default.join(home, "runtime");
        writeDefaultSourceFixtures(home, new Date().toISOString());
        writeJson(node_path_1.default.join(home, ".daobrew", "gdocs-snapshot.json"), { notes: [{ id: "meeting-1", modified_time: new Date().toISOString() }] });
        const result = await invokeCLI(home, runtimeRoot, "manual");
        assert.equal(result.status, 1);
        const receipt = JSON.parse(result.stdout);
        assert.equal(receipt.refreshStatus, "unavailable");
        assert.equal(receipt.publicationVerified, false);
        assert.deepEqual(receipt.sourceStatuses.map((item) => item.source), owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES);
        assert.equal((0, node_fs_1.existsSync)(runtimeRoot), false);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(home, "Library", "Application Support", "DaoBrew", "owners")), false);
    });
    (0, node_test_1.it)("fails closed for noncanonical, unconfirmed, or mismatched resident identity", async () => {
        const canonical = "14802294-BEED-480E-ABF6-7E3703FA25CD";
        const cases = [
            {
                name: "missing-issuer",
                config: {
                    user_id: canonical,
                    device_credential: "dbd_cli_confirmed_123456789012345678901234",
                    device_credential_confirmed: true,
                },
                explicitUserId: "",
            },
            {
                name: "noncanonical",
                config: {
                    user_id: "not-a-canonical-user-id",
                    device_credential: "dbd_cli_confirmed_123456789012345678901234",
                    device_credential_confirmed: true,
                    api_url: ISSUER_URL,
                },
                explicitUserId: "",
            },
            {
                name: "unconfirmed",
                config: {
                    user_id: canonical,
                    device_credential: "dbd_cli_unconfirmed_123456789012345678901234",
                    device_credential_confirmed: false,
                    api_url: ISSUER_URL,
                },
                explicitUserId: "",
            },
            {
                name: "mismatched",
                config: {
                    user_id: canonical,
                    device_credential: "dbd_cli_confirmed_123456789012345678901234",
                    device_credential_confirmed: true,
                    api_url: ISSUER_URL,
                },
                explicitUserId: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
            },
        ];
        for (const testCase of cases) {
            const home = makeTempHome(`taskmap-cli-${testCase.name}-`);
            const runtimeRoot = node_path_1.default.join(home, "runtime");
            writeJson(node_path_1.default.join(home, ".daobrew", "config.json"), testCase.config);
            const result = await invokeCLI(home, runtimeRoot, "manual", testCase.explicitUserId);
            assert.equal(result.status, 1, testCase.name);
        }
    });
    (0, node_test_1.it)("publishes and deterministically replays through an isolated local default path", async () => {
        const home = makeTempHome("taskmap-cli-default-");
        const runtimeRoot = node_path_1.default.join(home, "runtime");
        const userId = "14802294-BEED-480E-ABF6-7E3703FA25CD";
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)(userId, home);
        const now = new Date();
        const producedAt = new Date(now.getTime() - 60_000).toISOString();
        writeDefaultSourceFixtures(home, now.toISOString());
        writeJson(node_path_1.default.join(home, ".daobrew", "config.json"), {
            user_id: userId,
            device_credential: "dbd_cli_confirmed_123456789012345678901234",
            device_credential_confirmed: true,
            api_url: ISSUER_URL,
        });
        const snapshot = (0, meeting_producer_freshness_js_1.buildTaskMapMeetingProducerSnapshot)({
            ownerScopeDigest: (0, owner_scope_js_1.taskMapOwnerScopeDigest)(userId),
            producerVersion: meeting_producer_freshness_js_1.TASKMAP_MEETING_PRODUCER_VERSION,
            producedAt,
            meetings: [
                meeting("cli-document-a", "2026-07-27T09:00:00.000Z"),
                meeting("cli-document-b", "2026-07-28T09:00:00.000Z"),
            ],
        });
        writeJson(node_path_1.default.join(ownerScope.sourceRoot, "meeting-producer-snapshot.v1.json"), snapshot);
        const first = await invokeCLI(home, runtimeRoot, "manual", userId);
        assert.equal(first.status, 0, `stdout=${first.stdout}\nstderr=${first.stderr}`);
        assert.equal(first.stderr, "");
        const firstReceipt = JSON.parse(first.stdout);
        assert.equal(firstReceipt.refreshStatus, "published");
        assert.equal(firstReceipt.publicationVerified, true);
        assert.equal(firstReceipt.publicationBlockReason, null);
        assert.equal((0, node_fs_1.existsSync)(runtimeRoot), false);
        const refreshState = JSON.parse((0, node_fs_1.readFileSync)(node_path_1.default.join(ownerScope.runtimeRoot, "taskmap-refresh-state.v1.json"), "utf8"));
        assert.equal(refreshState.ownerScopeDigest, ownerScope.ownerScopeDigest);
        for (const source of Object.values(refreshState.sources)) {
            assert.equal(source.ownerScopeDigest, ownerScope.ownerScopeDigest);
            assert.equal(source.value.ownerScopeDigest, ownerScope.ownerScopeDigest);
        }
        const taskMapRoot = ownerScope.taskMapRoot;
        const projectionPath = node_path_1.default.join(taskMapRoot, "taskmap-projection.v1.json");
        const currentnessPath = node_path_1.default.join(taskMapRoot, "taskmap-currentness.v1.json");
        assert.equal((0, node_fs_1.existsSync)(projectionPath), true);
        assert.equal((0, node_fs_1.existsSync)(currentnessPath), true);
        const projectionBefore = (0, node_fs_1.readFileSync)(projectionPath);
        const currentnessBefore = (0, node_fs_1.readFileSync)(currentnessPath);
        const projection = JSON.parse(projectionBefore.toString("utf8"));
        assert.equal(projection.tasks.length, 1);
        assert.equal(projection.tasks[0].reviewState, "proposed");
        assert.equal(projection.tasks[0].authority, "none");
        const currentness = JSON.parse(currentnessBefore.toString("utf8"));
        assert.deepEqual(currentness.taskDispositions.map((item) => item.disposition), ["needs_lifecycle_review"]);
        const replay = await invokeCLI(home, runtimeRoot, "manual", userId);
        assert.equal(replay.status, 0);
        assert.equal(replay.stderr, "");
        const replayReceipt = JSON.parse(replay.stdout);
        assert.equal(replayReceipt.refreshStatus, "no_op");
        assert.equal(replayReceipt.publicationVerified, true);
        assert.deepEqual((0, node_fs_1.readFileSync)(projectionPath), projectionBefore);
        assert.deepEqual((0, node_fs_1.readFileSync)(currentnessPath), currentnessBefore);
    });
    (0, node_test_1.it)("never replays stale status after a waited-on lock disappears when work sources are unavailable", async () => {
        const home = makeTempHome("taskmap-cli-lock-");
        const ownerScope = (0, owner_scope_js_1.createTaskMapOwnerScope)("14802294-BEED-480E-ABF6-7E3703FA25CD", home);
        const runtimeRoot = ownerScope.runtimeRoot;
        const lockPath = node_path_1.default.join(runtimeRoot, "taskmap-refresh.lock");
        const staleRequestedAtMs = 1_000;
        writeJson(node_path_1.default.join(home, ".daobrew", "config.json"), {
            user_id: "14802294-BEED-480E-ABF6-7E3703FA25CD",
            device_credential: "dbd_cli_confirmed_123456789012345678901234",
            device_credential_confirmed: true,
            api_url: ISSUER_URL,
        });
        writeJson(node_path_1.default.join(runtimeRoot, "taskmap-refresh-status.v1.json"), {
            contractVersion: "taskmap-native-refresh-status.v1",
            status: "ok",
            refreshStatus: "published",
            sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
                source,
                disposition: "fresh",
            })),
            requestedAtMs: staleRequestedAtMs,
            completedAtMs: 1_100,
            nextDueAtMs: staleRequestedAtMs + owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
            candidateDigest: "old-candidate",
            projectionDigest: "old-projection",
            publicationBlockReason: null,
            failureStage: null,
        });
        (0, node_fs_1.mkdirSync)(lockPath, { recursive: true, mode: 0o700 });
        writeJson(node_path_1.default.join(lockPath, "owner.json"), {
            contractVersion: "taskmap-native-refresh-lock.v1",
            pid: process.pid,
            createdAtMs: Date.now(),
        });
        const invocation = invokeCLI(home, runtimeRoot, "manual", "14802294-BEED-480E-ABF6-7E3703FA25CD");
        await new Promise((resolve) => setTimeout(resolve, 150));
        (0, node_fs_1.rmSync)(lockPath, { recursive: true });
        const result = await invocation;
        assert.equal(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);
        const receipt = JSON.parse(result.stdout);
        assert.equal(receipt.refreshStatus, "unavailable", JSON.stringify(receipt));
        assert.equal(receipt.publicationVerified, false);
        assert.equal(receipt.publicationBlockReason, "semantic_provider_unavailable");
        assert.notEqual(receipt.requestedAtMs, staleRequestedAtMs);
        assert.equal(receipt.nextDueAtMs, receipt.requestedAtMs);
        assert.equal((0, node_fs_1.existsSync)(node_path_1.default.join(ownerScope.taskMapRoot, "taskmap-projection.v1.json")), false);
    });
});
