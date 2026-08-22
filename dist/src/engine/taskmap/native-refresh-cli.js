#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS = exports.TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS = exports.TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS = exports.TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS = void 0;
exports.taskMapNativeRefreshStrategyFallbackFromEnvironment = taskMapNativeRefreshStrategyFallbackFromEnvironment;
exports.taskMapNativeRefreshServiceOptionsFromEnvironment = taskMapNativeRefreshServiceOptionsFromEnvironment;
exports.parseTaskMapNativeRefreshCommand = parseTaskMapNativeRefreshCommand;
exports.runTaskMapNativeRefreshCommand = runTaskMapNativeRefreshCommand;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_util_1 = require("node:util");
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
const owner_refresh_coordinator_js_1 = require("./owner-refresh-coordinator.js");
const native_refresh_service_js_1 = require("./native-refresh-service.js");
const strategy_source_adapter_js_1 = require("./strategy-source-adapter.js");
const source_contracts_js_1 = require("./source-contracts.js");
const identity_js_1 = require("../../identity.js");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const LOCAL_GIT_EXECUTABLE = "/usr/bin/git";
const ROW_BINDINGS_MAX_BYTES = 128 * 1_024;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
exports.TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS = native_refresh_service_js_1.TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS;
exports.TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS = native_refresh_service_js_1.TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS;
exports.TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS = native_refresh_service_js_1.TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS;
exports.TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS = native_refresh_service_js_1.TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS;
/// The acceptance-store and publication readers require canonical (symlink-
/// free) paths — on macOS the default temp dir lives under /var, a symlink to
/// /private/var, so an unresolved home fails their fail-closed realpath
/// guards. Canonicalize once at the process boundary; the guards stay strict.
function canonicalHomeDirectory(home = (0, node_os_1.homedir)()) {
    try {
        return node_fs_1.realpathSync.native(home);
    }
    catch (error) {
        process.stderr.write(`taskmap-native-refresh: canonical home unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        return home;
    }
}
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function explicitAbsolutePath(value, label) {
    const trimmed = value.trim();
    if (trimmed.length === 0
        || !node_path_1.default.isAbsolute(trimmed)
        || CONTROL_CHARACTER.test(trimmed)) {
        throw new TypeError(`${label} must be an absolute local path`);
    }
    return node_path_1.default.normalize(trimmed);
}
async function readBoundedRegularFile(filePath, maximumBytes) {
    const metadata = await (0, promises_1.lstat)(filePath);
    if (!metadata.isFile()
        || metadata.isSymbolicLink()
        || metadata.size > maximumBytes) {
        throw new Error("Task Map local input is unavailable");
    }
    return (0, promises_1.readFile)(filePath);
}
async function resolveConfirmedOwner(environment, homeDirectory) {
    const explicitRaw = (environment.DAOBREW_USER_ID ?? "").trim();
    const plan = await (0, identity_js_1.loadConfirmedTaskMapOwner)(homeDirectory, {
        ...(explicitRaw.length === 0 ? {} : { userId: explicitRaw }),
        apiUrl: environment.DAOBREW_API_URL,
    });
    if (!plan.ok) {
        throw new Error(plan.reason);
    }
    return plan.owner;
}
function canonicalGitHubRemote(raw) {
    const trimmed = raw.trim();
    const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(trimmed);
    if (ssh !== null) {
        return `https://github.com/${ssh[1]}/${ssh[2]}`;
    }
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        throw new Error("Task Map Strategy repository remote is unavailable");
    }
    const segments = parsed.pathname
        .replace(/\.git$/u, "")
        .split("/")
        .filter(Boolean);
    if (parsed.protocol !== "https:"
        || parsed.hostname !== "github.com"
        || parsed.port !== ""
        || parsed.username !== ""
        || parsed.password !== ""
        || parsed.search !== ""
        || parsed.hash !== ""
        || segments.length !== 2) {
        throw new Error("Task Map Strategy repository remote is unavailable");
    }
    return `https://github.com/${segments[0]}/${segments[1]}`;
}
async function gitText(repositoryRoot, args, maximumBytes) {
    const result = await execFileAsync(LOCAL_GIT_EXECUTABLE, [
        "--no-replace-objects",
        "--no-lazy-fetch",
        "-C",
        repositoryRoot,
        ...args,
    ], {
        encoding: "utf8",
        env: {
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_NO_LAZY_FETCH: "1",
            GIT_NO_REPLACE_OBJECTS: "1",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_TERMINAL_PROMPT: "0",
            LANG: "C",
            LC_ALL: "C",
        },
        maxBuffer: maximumBytes,
        timeout: 10_000,
    });
    return result.stdout;
}
async function repositoryProvider(repositoryRoot) {
    const remoteLocator = canonicalGitHubRemote(await gitText(repositoryRoot, ["remote", "get-url", "origin"], 8_192));
    return {
        remoteLocator,
        async readImmutableRepositoryFile(request) {
            if (request.remoteLocator !== remoteLocator) {
                throw new Error("Task Map Strategy repository locator mismatch");
            }
            await gitText(repositoryRoot, ["cat-file", "-e", `${request.revision}^{commit}`], 8_192);
            const [content, committedAt] = await Promise.all([
                gitText(repositoryRoot, [
                    "show",
                    "--no-ext-diff",
                    "--no-textconv",
                    `${request.revision}:${request.repositoryRelativePath}`,
                ], request.maximumBytes + 1),
                gitText(repositoryRoot, ["show", "-s", "--format=%cI", request.revision], 8_192).then((value) => value.trim()),
            ]);
            if (Buffer.byteLength(content, "utf8") > request.maximumBytes) {
                throw new Error("Task Map Strategy repository content is too large");
            }
            return {
                remoteLocator,
                revision: request.revision,
                repositoryRelativePath: request.repositoryRelativePath,
                committedAt,
                content,
                contentDigest: sha256(content),
            };
        },
    };
}
function taskMapNativeRefreshStrategyFallbackFromEnvironment(environment = process.env, homeDirectory = (0, node_os_1.homedir)()) {
    const rawRepository = (environment.DAOBREW_TASKMAP_STRATEGY_REPO ?? "").trim();
    const rawBindings = (environment.DAOBREW_TASKMAP_STRATEGY_BINDINGS ?? "").trim();
    if (rawRepository.length === 0 && rawBindings.length === 0) {
        return undefined;
    }
    if (rawRepository.length === 0 || rawBindings.length === 0) {
        throw new TypeError("Strategy refresh requires both local repository and row bindings");
    }
    const normalizedHome = explicitAbsolutePath(homeDirectory, "homeDirectory");
    const repositoryRoot = explicitAbsolutePath(rawRepository, "DAOBREW_TASKMAP_STRATEGY_REPO");
    const rowBindingsPath = explicitAbsolutePath(rawBindings, "DAOBREW_TASKMAP_STRATEGY_BINDINGS");
    return {
        homeDirectory: normalizedHome,
        async readAdapterInput() {
            const owner = await resolveConfirmedOwner(environment, normalizedHome);
            const [projectionBytes, currentnessBytes, rowBindingBytes, repository,] = await Promise.all([
                readBoundedRegularFile(node_path_1.default.join(owner.taskMapRoot, "taskmap-projection.v1.json"), strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumProjectionBytes),
                readBoundedRegularFile(node_path_1.default.join(owner.taskMapRoot, "taskmap-currentness.v1.json"), strategy_source_adapter_js_1.TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumCurrentnessBytes),
                readBoundedRegularFile(rowBindingsPath, ROW_BINDINGS_MAX_BYTES),
                repositoryProvider(repositoryRoot),
            ]);
            const rowBindings = JSON.parse(rowBindingBytes.toString("utf8"));
            return {
                ownerScopeDigest: owner.ownerScopeDigest,
                binding: {
                    connectionId: "strategy-owner-local-read",
                    sourceKind: "strategy",
                    tenantOrWorkspaceDigest: (0, source_contracts_js_1.taskMapContractDigest)({
                        domain: "taskmap-strategy-local-workspace.1",
                        remoteLocator: repository.remoteLocator,
                    }),
                    accountOrPrincipalDigest: owner.ownerScopeDigest,
                    grantVersion: "strategy-local-read-v1",
                },
                projectionBytes,
                currentnessBytes,
                expectedProjectionFileDigest: sha256(projectionBytes),
                expectedCurrentnessFileDigest: sha256(currentnessBytes),
                rowBindings,
                repositoryProvider: {
                    readImmutableRepositoryFile: repository.readImmutableRepositoryFile,
                },
            };
        },
    };
}
function taskMapNativeRefreshServiceOptionsFromEnvironment(confirmedOwner, environment = process.env, homeDirectory = (0, node_os_1.homedir)(), createStation) {
    return {
        confirmedOwner,
        strategyFallback: taskMapNativeRefreshStrategyFallbackFromEnvironment(environment, homeDirectory),
        communityPlanDeadlineMs: native_refresh_service_js_1.TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS,
        ...(createStation === undefined ? {} : {
            createMeetingExtractionStation: createStation,
            createAgentSessionExtractionStation: createStation,
            createCalendarExtractionStation: createStation,
            createCommunityGroupingStation: createStation,
        }),
    };
}
function parseTaskMapNativeRefreshCommand(argv) {
    if (argv.length === 1 && argv[0] === "--recover-only") {
        return { operation: "recover" };
    }
    if (argv.length !== 2
        || argv[0] !== "--trigger"
        || (argv[1] !== "launch"
            && argv[1] !== "manual"
            && argv[1] !== "timer")) {
        throw new TypeError("usage: native-refresh-cli --trigger launch|manual|timer | --recover-only");
    }
    return { operation: "refresh", trigger: argv[1] };
}
async function runTaskMapNativeRefreshCommand(argv, runtime) {
    const command = parseTaskMapNativeRefreshCommand(argv);
    const confirmedOwner = runtime === undefined
        ? await resolveConfirmedOwner(process.env, canonicalHomeDirectory())
        : null;
    const activeRuntime = runtime ?? new native_refresh_service_js_1.TaskMapNativeRefreshService(taskMapNativeRefreshServiceOptionsFromEnvironment(confirmedOwner, process.env, canonicalHomeDirectory()));
    if (command.operation === "recover") {
        if (activeRuntime.recoverPendingPublication === undefined) {
            throw new Error("Task Map publication recovery is unavailable");
        }
        return {
            status: "ok",
            operation: "recover",
            recovered: await activeRuntime.recoverPendingPublication(),
        };
    }
    return activeRuntime.requestRefresh(command.trigger);
}
function safeFailureResponse(nowMs) {
    return {
        status: "partial",
        refreshStatus: "unavailable",
        sourceStatuses: owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
            source,
            disposition: "unavailable",
            state: "unavailable",
            lastSuccessAtMs: null,
            nextDueAtMs: null,
            proof: null,
        })),
        requestedAtMs: nowMs,
        nextDueAtMs: nowMs,
        publicationVerified: false,
        publicationBlockReason: "publication_failed",
    };
}
async function main() {
    const nowMs = Date.now();
    try {
        const response = await runTaskMapNativeRefreshCommand(process.argv.slice(2));
        process.stdout.write(`${JSON.stringify(response)}\n`);
    }
    catch (error) {
        process.stdout.write(`${JSON.stringify(safeFailureResponse(nowMs))}\n`);
        process.stderr.write(`taskmap-native-refresh: unavailable\n${(0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(error)}\n`);
        process.exitCode = 1;
    }
}
if (require.main === module) {
    void main();
}
