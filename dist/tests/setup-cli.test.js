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
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_module_1 = __importStar(require("node:module"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_child_process_1 = require("node:child_process");
const identity_js_1 = require("../src/identity.js");
const nodeRequire = (0, node_module_1.createRequire)(__filename);
const cli = nodeRequire("../src/setup-cli.js");
const setupCliPath = nodeRequire.resolve("../src/setup-cli.js");
const cliAnchorEnrollmentPath = (0, node_path_1.join)(__dirname, "..", "src", "cli-anchor-enrollment.js");
const packageRoot = (0, node_path_1.join)(__dirname, "..", "..");
const originalFetch = globalThis.fetch;
const originalArgv = process.argv;
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const savedEnv = { ...process.env };
function tempRoot(prefix) {
    return (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), prefix));
}
function restoreEnv() {
    for (const key of Object.keys(process.env)) {
        if (!(key in savedEnv))
            delete process.env[key];
    }
    for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined)
            delete process.env[key];
        else
            process.env[key] = value;
    }
}
function loadCliForCurrentUserHome(home) {
    const originalLoad = node_module_1.default._load;
    delete nodeRequire.cache[setupCliPath];
    node_module_1.default._load = function patchedLoad(request, parent, isMain) {
        if (request === "node:os") {
            const actual = originalLoad.call(this, request, parent, isMain);
            return {
                ...actual,
                userInfo: () => ({ ...actual.userInfo(), homedir: home }),
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        return nodeRequire("../src/setup-cli.js");
    }
    finally {
        node_module_1.default._load = originalLoad;
        delete nodeRequire.cache[setupCliPath];
    }
}
(0, node_test_1.describe)("daobrew CLI setup/sync/install", () => {
    (0, node_test_1.beforeEach)(() => {
        process.argv = ["node", "/tmp/daobrew&cli"];
    });
    (0, node_test_1.afterEach)(() => {
        globalThis.fetch = originalFetch;
        process.argv = originalArgv;
        if (originalPlatform)
            Object.defineProperty(process, "platform", originalPlatform);
        restoreEnv();
    });
    (0, node_test_1.it)("setup registers the CLI anchor and confirms the returned device credential", async () => {
        const root = tempRoot("daobrew-cli-setup-");
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, ".daobrew", "config.json");
        process.env.DAOBREW_API_URL = "https://api.example.test/api/v1";
        const calls = [];
        globalThis.fetch = (async (input, init = {}) => {
            calls.push({ url: String(input), init });
            if (String(input).endsWith("/device/register-anchor")) {
                return {
                    ok: true,
                    status: 201,
                    json: async () => ({
                        success: true,
                        data: {
                            api_url: "https://api.example.test/api/v1",
                            user_id: "11111111-1111-4111-8111-111111111111",
                            device_id: "22222222-2222-4222-8222-222222222222",
                            device_credential: "dbd_confirmed_cli_credential_1234567890",
                        },
                    }),
                };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        status: "confirmed",
                        user_id: "33333333-3333-4333-8333-333333333333",
                        device_id: "22222222-2222-4222-8222-222222222222",
                    },
                }),
            };
        });
        try {
            await cli.setupCli();
            const register = JSON.parse(String(calls[0].init.body));
            strict_1.default.equal(calls[0].url, "https://api.example.test/api/v1/device/register-anchor");
            strict_1.default.equal(register.surface, "cli");
            strict_1.default.equal(calls[1].url, "https://api.example.test/api/v1/device/confirm");
            strict_1.default.equal(calls[1].init.headers.authorization, "Bearer dbd_confirmed_cli_credential_1234567890");
            const confirmed = JSON.parse(String(calls[1].init.body));
            strict_1.default.equal(confirmed.installation_nonce, register.installation_nonce);
            const config = JSON.parse((0, node_fs_1.readFileSync)(process.env.DAOBREW_CONFIG_FILE, "utf8"));
            strict_1.default.equal(config.device_credential, "dbd_confirmed_cli_credential_1234567890");
            strict_1.default.equal(config.device_credential_confirmed, true);
            strict_1.default.equal(config.user_id, "33333333-3333-4333-8333-333333333333");
            strict_1.default.equal(config.device_id, "22222222-2222-4222-8222-222222222222");
            const owner = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(root);
            strict_1.default.equal(owner.ok, true);
            if (owner.ok) {
                strict_1.default.equal(owner.owner.userId, "33333333-3333-4333-8333-333333333333");
            }
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("setup re-confirms the resident credential when its canonical owner is missing", async () => {
        const root = tempRoot("daobrew-cli-half-written-");
        const configPath = (0, node_path_1.join)(root, ".daobrew", "config.json");
        process.env.DAOBREW_CONFIG_FILE = configPath;
        process.env.DAOBREW_API_URL = "https://override.example.test/api/v1";
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(root, ".daobrew"), { mode: 0o700 });
        (0, node_fs_1.writeFileSync)(configPath, JSON.stringify({
            api_url: "https://api.example.test/api/v1",
            device_credential: "dbd_half_written_cli_credential_1234567890",
            device_credential_confirmed: true,
            installation_nonce: "dbi_cli_half_written_nonce_12345678901234567890",
        }), { mode: 0o600 });
        const calls = [];
        globalThis.fetch = (async (input, init) => {
            calls.push({ url: String(input), init });
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        status: "confirmed",
                        user_id: "11111111-1111-4111-8111-111111111111",
                        device_id: "22222222-2222-4222-8222-222222222222",
                    },
                }),
            };
        });
        try {
            await cli.setupCli();
            strict_1.default.deepEqual(calls.map((call) => call.url), [
                "https://api.example.test/api/v1/device/confirm",
            ]);
            strict_1.default.equal((calls[0].init?.headers).authorization, "Bearer dbd_half_written_cli_credential_1234567890");
            const config = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
            strict_1.default.equal(config.device_credential, "dbd_half_written_cli_credential_1234567890");
            strict_1.default.equal(config.device_credential_confirmed, true);
            strict_1.default.equal(config.api_url, "https://api.example.test/api/v1");
            strict_1.default.equal(config.user_id, "11111111-1111-4111-8111-111111111111");
            strict_1.default.equal(config.device_id, "22222222-2222-4222-8222-222222222222");
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("setup delegates first-device enrollment to the shared CLI enrollment helper", async () => {
        const root = tempRoot("daobrew-cli-shared-");
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, "config.json");
        process.env.DAOBREW_API_URL = "https://api.example.test/api/v1";
        const originalLoad = node_module_1.default._load;
        const calls = [];
        delete nodeRequire.cache[setupCliPath];
        node_module_1.default._load = function patchedLoad(request, parent, isMain) {
            const resolved = parent ? node_module_1.default._resolveFilename(request, parent) : request;
            if (resolved === cliAnchorEnrollmentPath) {
                return {
                    canonicalUserId: () => null,
                    setupCliAnchorEnrollment: async (options) => {
                        calls.push(options);
                        options.writeConfig({
                            ...options.existing,
                            api_url: options.apiUrl,
                            user_id: "11111111-1111-4111-8111-111111111111",
                            device_id: "22222222-2222-4222-8222-222222222222",
                            device_credential: "dbd_shared_cli_credential_1234567890",
                            device_credential_confirmed: true,
                            installation_nonce: options.installationNonce,
                        });
                    },
                };
            }
            return originalLoad.call(this, request, parent, isMain);
        };
        try {
            const freshCli = nodeRequire("../src/setup-cli.js");
            await freshCli.setupCli();
            strict_1.default.equal(calls.length, 1);
            strict_1.default.equal(calls[0].surface, "cli");
            strict_1.default.equal(calls[0].apiUrl, "https://api.example.test/api/v1");
            strict_1.default.match(calls[0].userId, /^[0-9A-F-]{36}$/);
            strict_1.default.match(calls[0].installationNonce, /^dbi_cli_/);
            const config = JSON.parse((0, node_fs_1.readFileSync)(process.env.DAOBREW_CONFIG_FILE, "utf8"));
            strict_1.default.equal(config.device_credential, "dbd_shared_cli_credential_1234567890");
            strict_1.default.equal(config.device_credential_confirmed, true);
            strict_1.default.equal(config.user_id, "11111111-1111-4111-8111-111111111111");
        }
        finally {
            node_module_1.default._load = originalLoad;
            delete nodeRequire.cache[setupCliPath];
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("sync-memory parses Claude and Codex fixture transcripts and posts normalized rows", async () => {
        const root = tempRoot("daobrew-cli-sync-");
        const home = (0, node_path_1.join)(root, "home");
        const project = (0, node_path_1.join)(root, "project");
        const claudeDir = (0, node_path_1.join)(home, ".claude", "projects", project.replace(/[^A-Za-z0-9]/g, "-"));
        const codexDir = (0, node_path_1.join)(home, ".codex", "sessions", "2026", "07");
        (0, node_fs_1.mkdirSync)(claudeDir, { recursive: true });
        (0, node_fs_1.mkdirSync)(codexDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(claudeDir, "claude.jsonl"), [
            JSON.stringify({ timestamp: "2026-07-22T00:00:00Z", type: "user", message: { role: "user", content: "remember cli setup" } }),
            JSON.stringify({ type: "assistant", message: { role: "assistant", content: "setup remembered" } }),
        ].join("\n"));
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(codexDir, "codex.jsonl"), [
            JSON.stringify({ type: "turn_context", payload: { cwd: project } }),
            JSON.stringify({ timestamp: "2026-07-22T01:00:00Z", type: "response_item", payload: { type: "message", role: "user", content: "sync memory" } }),
            JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: "memory synced" } }),
        ].join("\n"));
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, "config.json");
        process.env.DAOBREW_MEMORY_HOME = home;
        (0, node_fs_1.writeFileSync)(process.env.DAOBREW_CONFIG_FILE, JSON.stringify({
            api_url: "https://api.example.test/api/v1",
            device_credential: "dbd_cli_sync_credential_1234567890",
        }));
        const posted = [];
        globalThis.fetch = (async (_input, init = {}) => {
            posted.push(JSON.parse(String(init.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        });
        const fixedCli = loadCliForCurrentUserHome((0, node_path_1.join)(root, "current-user-home"));
        try {
            await fixedCli.syncMemory();
            strict_1.default.equal(posted.length, 1);
            strict_1.default.equal(posted[0].rows.length, 2);
            strict_1.default.ok(posted[0].rows.every((row) => Array.isArray(row.topics_json)));
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("sync-memory fails closed before reading credentials or posting while migration fence exists", async () => {
        const root = tempRoot("daobrew-cli-fence-");
        const home = (0, node_path_1.join)(root, "home");
        const marker = (0, node_path_1.join)(home, ".daobrew", "gcp-migration-writer-fence.json");
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(home, ".daobrew"), { recursive: true });
        (0, node_fs_1.writeFileSync)(marker, JSON.stringify({ state: "fenced" }));
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, "missing-config.json");
        globalThis.fetch = (async () => {
            strict_1.default.fail("writer fence must block before network access");
        });
        try {
            const fixedCli = loadCliForCurrentUserHome(home);
            await strict_1.default.rejects(() => fixedCli.syncMemory(), /migration writer fence is active/i);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("sync-memory fails closed for a dangling migration fence symlink", async () => {
        const root = tempRoot("daobrew-cli-dangling-fence-");
        const home = (0, node_path_1.join)(root, "home");
        const marker = (0, node_path_1.join)(home, ".daobrew", "gcp-migration-writer-fence.json");
        (0, node_fs_1.mkdirSync)((0, node_path_1.join)(home, ".daobrew"), { recursive: true });
        (0, node_fs_1.symlinkSync)((0, node_path_1.join)(root, "missing-fence-target"), marker);
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, "missing-config.json");
        globalThis.fetch = (async () => {
            strict_1.default.fail("writer fence must block before network access");
        });
        try {
            const fixedCli = loadCliForCurrentUserHome(home);
            await strict_1.default.rejects(() => fixedCli.syncMemory(), /migration writer fence is active/i);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("sync-memory holds a migration writer lease through the network write", async () => {
        const root = tempRoot("daobrew-cli-writer-lease-");
        const home = (0, node_path_1.join)(root, "home");
        const leaseDirectory = (0, node_path_1.join)(home, ".daobrew", "gcp-migration-writer-leases");
        const memoryHome = (0, node_path_1.join)(root, "memory");
        const project = (0, node_path_1.join)(root, "project");
        const codexDir = (0, node_path_1.join)(memoryHome, ".codex", "sessions", "2026", "07");
        (0, node_fs_1.mkdirSync)(codexDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(codexDir, "codex.jsonl"), [
            JSON.stringify({ type: "turn_context", payload: { cwd: project } }),
            JSON.stringify({ timestamp: "2026-07-22T01:00:00Z", type: "response_item", payload: { type: "message", role: "user", content: "sync memory" } }),
        ].join("\n"));
        process.env.DAOBREW_CONFIG_FILE = (0, node_path_1.join)(root, "config.json");
        process.env.DAOBREW_MEMORY_HOME = memoryHome;
        (0, node_fs_1.writeFileSync)(process.env.DAOBREW_CONFIG_FILE, JSON.stringify({
            api_url: "https://api.example.test/api/v1",
            device_credential: "dbd_writer_lease_credential_1234567890",
        }));
        let observedLease = false;
        globalThis.fetch = (async () => {
            observedLease = (0, node_fs_1.readdirSync)(leaseDirectory).length === 1;
            return { ok: true, status: 200 };
        });
        const fixedCli = loadCliForCurrentUserHome(home);
        try {
            await fixedCli.syncMemory();
            strict_1.default.equal(observedLease, true);
            strict_1.default.deepEqual((0, node_fs_1.readdirSync)(leaseDirectory), []);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("the committed package bin ignores migration fence environment redirects", () => {
        const root = tempRoot("daobrew-dist-cli-fence-");
        const marker = (0, node_path_1.join)(root, "gcp-migration-writer-fence.json");
        (0, node_fs_1.symlinkSync)((0, node_path_1.join)(root, "missing-fence-target"), marker);
        const packageJson = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(packageRoot, "package.json"), "utf8"));
        const packageBin = (0, node_path_1.join)(packageRoot, packageJson.bin.daobrew);
        try {
            const result = (0, node_child_process_1.spawnSync)(process.execPath, [packageBin, "sync-memory"], {
                encoding: "utf8",
                env: {
                    ...process.env,
                    DAOBREW_MIGRATION_WRITER_FENCE_PATH: marker,
                    DAOBREW_CONFIG_FILE: (0, node_path_1.join)(root, "missing-config.json"),
                },
            });
            strict_1.default.equal(result.status, 1);
            strict_1.default.doesNotMatch(result.stderr, /migration writer fence is active/i);
            strict_1.default.match(result.stderr, /missing confirmed .* credential|writer lease/i);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("production exports cannot inject fence, lease, config, or network dependencies", () => {
        process.env.DAOBREW_MIGRATION_WRITER_FENCE_PATH = "/tmp/redirected-fence";
        strict_1.default.equal(cli.__testing, undefined);
        strict_1.default.equal(cli.syncMemory.length, 0);
        strict_1.default.deepEqual(Object.keys(cli).sort(), ["installAgent", "main", "setupCli", "syncMemory", "xmlEscape"].sort());
        strict_1.default.equal((0, node_os_1.userInfo)().homedir.length > 0, true);
    });
    (0, node_test_1.it)("the committed package bin is rebuilt from the setup CLI source", () => {
        strict_1.default.equal((0, node_fs_1.readFileSync)((0, node_path_1.join)(packageRoot, "dist", "src", "setup-cli.js"), "utf8"), (0, node_fs_1.readFileSync)((0, node_path_1.join)(packageRoot, "src", "setup-cli.js"), "utf8"));
    });
    (0, node_test_1.it)("install-agent writes escaped launchd plist on macOS and prints cron recipe elsewhere", () => {
        const root = tempRoot("daobrew-cli-agent-");
        process.env.DAOBREW_LAUNCH_AGENTS_DIR = (0, node_path_1.join)(root, "LaunchAgents");
        Object.defineProperty(process, "platform", { value: "darwin" });
        try {
            cli.installAgent();
            const plist = (0, node_fs_1.readFileSync)((0, node_path_1.join)(root, "LaunchAgents", "app.daobrew.cli-memory.plist"), "utf8");
            strict_1.default.match(plist, /StartInterval<\/key><integer>600/);
            strict_1.default.match(plist, /StandardOutPath/);
            strict_1.default.match(plist, /daobrew&amp;cli/);
            Object.defineProperty(process, "platform", { value: "linux" });
            const lines = [];
            const originalLog = console.log;
            console.log = (line) => lines.push(line);
            try {
                cli.installAgent();
            }
            finally {
                console.log = originalLog;
            }
            strict_1.default.match(lines.join("\n"), /\*\/10 \* \* \* \*/);
            strict_1.default.match(lines.join("\n"), /sync-memory/);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
});
