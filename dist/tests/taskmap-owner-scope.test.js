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
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const identity_js_1 = require("../src/identity.js");
const confirmed_owner_js_1 = require("./support/confirmed-owner.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const agent_session_producer_freshness_js_1 = require("../src/engine/taskmap/agent-session-producer-freshness.js");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const meeting_producer_freshness_js_1 = require("../src/engine/taskmap/meeting-producer-freshness.js");
const native_refresh_service_js_1 = require("../src/engine/taskmap/native-refresh-service.js");
const owner_refresh_coordinator_js_1 = require("../src/engine/taskmap/owner-refresh-coordinator.js");
const OWNER_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OWNER_B = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
const DEVICE_CREDENTIAL = "dbd_owner_scope_123456789012345678901234";
const temporaryRoots = [];
(0, node_test_1.afterEach)(() => {
    for (const root of temporaryRoots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
function temporaryRoot(prefix) {
    const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join(process.cwd(), `.${prefix}`));
    temporaryRoots.push(root);
    return root;
}
function expectedDigest(userId) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(`${owner_scope_js_1.TASKMAP_OWNER_SCOPE_DOMAIN}\0${userId}`, "utf8")
        .digest("hex");
}
function writeJson(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
function ownedSlice(source, ownerScopeDigest) {
    const value = {
        contractVersion: "taskmap-native-safe-source-slice.v1",
        ownerScopeDigest,
        source,
        recordCount: 1,
        records: [{
                identityDigest: expectedDigest(OWNER_A),
                revision: `${source}-r1`,
                occurredAtMs: 1_000,
            }],
        metadata: { synthetic: true },
    };
    return {
        ownerScopeDigest,
        revision: `${source}-r1`,
        sliceDigest: (0, node_crypto_1.createHash)("sha256")
            .update(JSON.stringify(value))
            .digest("hex"),
        value,
    };
}
function failingCollectors(calls) {
    return Object.fromEntries(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.map((source) => [
        source,
        async () => {
            calls.set(source, (calls.get(source) ?? 0) + 1);
            throw new Error("synthetic source unavailable");
        },
    ]));
}
(0, node_test_1.describe)("Task Map confirmed owner scope", () => {
    (0, node_test_1.it)("derives the frozen v1 digest from the canonical uppercase UUID", () => {
        assert.equal(owner_scope_js_1.TASKMAP_OWNER_SCOPE_DOMAIN, "taskmap-owner-scope.v1");
        assert.equal((0, owner_scope_js_1.taskMapOwnerScopeDigest)(OWNER_A), expectedDigest(OWNER_A));
        assert.equal((0, agent_session_producer_freshness_js_1.taskMapAgentSessionOwnerScopeDigest)(OWNER_A), expectedDigest(OWNER_A));
        assert.equal((0, meeting_producer_freshness_js_1.taskMapMeetingProducerOwnerScopeDigest)(OWNER_A), expectedDigest(OWNER_A));
        assert.equal((0, calendar_producer_freshness_js_1.taskMapCalendarOwnerScopeDigest)(OWNER_A), expectedDigest(OWNER_A));
        assert.match((0, owner_scope_js_1.taskMapOwnerScopeDigest)(OWNER_A), /^[a-f0-9]{64}$/u);
        for (const invalid of [
            OWNER_A.toLowerCase(),
            ` ${OWNER_A}`,
            "local",
            "local-calendar-owner",
            "local-agent-session-owner-501",
            "",
        ]) {
            assert.throws(() => (0, owner_scope_js_1.taskMapOwnerScopeDigest)(invalid), /canonical uppercase UUID/u);
        }
    });
    (0, node_test_1.it)("derives disjoint production roots below the per-owner digest", () => {
        const home = "/tmp/taskmap-owner-scope-home";
        const first = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_A, home);
        const second = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_B, home);
        assert.notEqual(first.ownerScopeDigest, second.ownerScopeDigest);
        assert.equal(first.ownerRoot, node_path_1.default.join(home, "Library", "Application Support", "DaoBrew", "owners", first.ownerScopeDigest));
        assert.equal(first.runtimeRoot, node_path_1.default.join(first.ownerRoot, "taskmap-refresh"));
        assert.equal(first.taskMapRoot, node_path_1.default.join(first.ownerRoot, "taskmap"));
        assert.equal(first.sourceRoot, node_path_1.default.join(first.ownerRoot, "sources"));
        assert.notEqual(first.ownerRoot, second.ownerRoot);
    });
    (0, node_test_1.it)("requires one persisted confirmed credential and safe HTTPS issuer", () => {
        const home = "/tmp/taskmap-confirmed-owner-home";
        const accepted = (0, identity_js_1.validateTaskMapOwnerEnrollment)({
            user_id: OWNER_A,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://api.example.test/api/v1/",
        }, {}, home);
        assert.equal(accepted.ok, true);
        if (!accepted.ok)
            return;
        assert.equal(accepted.owner.userId, OWNER_A);
        assert.equal(accepted.owner.deviceCredential, DEVICE_CREDENTIAL);
        assert.equal(accepted.owner.issuerUrl, "https://api.example.test/api/v1");
        assert.equal(accepted.owner.ownerScopeDigest, (0, owner_scope_js_1.taskMapOwnerScopeDigest)(OWNER_A));
        const incomplete = [
            { user_id: OWNER_A, api_url: "https://api.example.test" },
            {
                user_id: OWNER_A,
                device_credential: DEVICE_CREDENTIAL,
                api_url: "https://api.example.test",
            },
            {
                user_id: OWNER_A,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: false,
                api_url: "https://api.example.test",
            },
            {
                user_id: OWNER_A,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
            },
            {
                user_id: OWNER_A,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                api_url: "http://api.example.test",
            },
            {
                user_id: OWNER_A,
                device_credential: DEVICE_CREDENTIAL,
                device_credential_confirmed: true,
                api_url: "https://owner:secret@api.example.test",
            },
        ];
        for (const config of incomplete) {
            assert.equal((0, identity_js_1.validateTaskMapOwnerEnrollment)(config, {}, home).ok, false);
        }
    });
    (0, node_test_1.it)("rejects an explicit UUID mismatch and never lets environment URL rebind enrollment", () => {
        const config = {
            user_id: OWNER_A,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        };
        const mismatch = (0, identity_js_1.validateTaskMapOwnerEnrollment)(config, {
            userId: OWNER_B,
            apiUrl: "https://attacker.example.test/api/v1",
        }, "/tmp/taskmap-owner-mismatch-home");
        assert.equal(mismatch.ok, false);
        if (!mismatch.ok) {
            assert.match(mismatch.reason, /explicit owner.*changed/u);
        }
        const bound = (0, identity_js_1.validateTaskMapOwnerEnrollment)(config, {
            userId: OWNER_A,
            apiUrl: "https://attacker.example.test/api/v1",
        }, "/tmp/taskmap-owner-bound-home");
        assert.equal(bound.ok, true);
        if (bound.ok) {
            assert.equal(bound.owner.issuerUrl, config.api_url);
        }
    });
    (0, node_test_1.it)("mints service authority only from the fixed owner-only persisted enrollment", async () => {
        const home = temporaryRoot("taskmap-persisted-owner-");
        writeJson(node_path_1.default.join(home, ".daobrew", "config.json"), {
            user_id: OWNER_A,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        });
        const loaded = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home, {
            userId: OWNER_A,
            apiUrl: "https://attacker.example.test/api/v1",
        });
        assert.equal(loaded.ok, true);
        if (!loaded.ok)
            return;
        (0, identity_js_1.assertConfirmedTaskMapOwner)(loaded.owner);
        assert.equal(loaded.owner.issuerUrl, "https://issuer.example.test/api/v1");
        assert.equal(loaded.owner.homeDirectory, home);
    });
    (0, node_test_1.it)("fails closed when the confirmed enrollment parent is rebound after open", async () => {
        const home = temporaryRoot("taskmap-persisted-owner-parent-race-");
        const original = node_path_1.default.join(home, ".daobrew");
        const replacement = node_path_1.default.join(home, "replacement");
        writeJson(node_path_1.default.join(original, "config.json"), {
            user_id: OWNER_A,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        });
        writeJson(node_path_1.default.join(replacement, "config.json"), {
            user_id: OWNER_B,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        });
        const loaded = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home, {}, async () => {
            (0, node_fs_1.renameSync)(original, node_path_1.default.join(home, "original-detached"));
            (0, node_fs_1.renameSync)(replacement, original);
        });
        assert.equal(loaded.ok, false);
    });
    (0, node_test_1.it)("fails closed when the synchronous enrollment parent is rebound after open", () => {
        const home = temporaryRoot("taskmap-persisted-owner-sync-parent-race-");
        const original = node_path_1.default.join(home, ".daobrew");
        const replacement = node_path_1.default.join(home, "replacement");
        writeJson(node_path_1.default.join(original, "config.json"), {
            user_id: OWNER_A,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        });
        writeJson(node_path_1.default.join(replacement, "config.json"), {
            user_id: OWNER_B,
            device_credential: DEVICE_CREDENTIAL,
            device_credential_confirmed: true,
            api_url: "https://issuer.example.test/api/v1",
        });
        const loaded = (0, identity_js_1.loadConfirmedTaskMapOwnerSync)(home, {}, () => {
            (0, node_fs_1.renameSync)(original, node_path_1.default.join(home, "original-detached"));
            (0, node_fs_1.renameSync)(replacement, original);
        });
        assert.equal(loaded.ok, false);
    });
    (0, node_test_1.it)("fails before collector callbacks when no confirmed owner is bound", () => {
        assert.equal(owner_refresh_coordinator_js_1.TASKMAP_OWNER_REFRESH_SOURCES.includes("gmail"), false);
        const root = temporaryRoot("taskmap-unpaired-service-");
        const calls = new Map();
        assert.throws(() => new native_refresh_service_js_1.TaskMapNativeRefreshService({
            runtimeRoot: node_path_1.default.join(root, "runtime"),
            projectionPath: node_path_1.default.join(root, "taskmap", "taskmap-projection.v1.json"),
            currentnessPath: node_path_1.default.join(root, "taskmap", "taskmap-currentness.v1.json"),
            collectors: failingCollectors(calls),
            graphBuilder: async () => {
                throw new Error("graph builder must not run while unpaired");
            },
        }), /confirmed owner authority/u);
        assert.equal([...calls.values()].reduce((sum, value) => sum + value, 0), 0);
    });
    (0, node_test_1.it)("rejects a structurally forged owner scope without confirmed authority", () => {
        const root = temporaryRoot("taskmap-forged-owner-service-");
        const calls = new Map();
        assert.throws(() => new native_refresh_service_js_1.TaskMapNativeRefreshService({
            ownerScope: (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_A, node_path_1.default.join(root, "home")),
            runtimeRoot: node_path_1.default.join(root, "runtime"),
            projectionPath: node_path_1.default.join(root, "taskmap", "taskmap-projection.v1.json"),
            currentnessPath: node_path_1.default.join(root, "taskmap", "taskmap-currentness.v1.json"),
            collectors: failingCollectors(calls),
            graphBuilder: async () => {
                throw new Error("forged owner graph must not run");
            },
        }), /confirmed owner authority/u);
    });
    (0, node_test_1.it)("does not restore another owner's state or last-good source slices", async () => {
        const root = temporaryRoot("taskmap-owner-isolation-");
        const sharedRuntimeRoot = node_path_1.default.join(root, "runtime");
        const sharedTaskMapRoot = node_path_1.default.join(root, "taskmap");
        const first = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_A, node_path_1.default.join(root, "home"));
        const second = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_B, node_path_1.default.join(root, "home"));
        const firstSlice = ownedSlice("agent_session", first.ownerScopeDigest);
        writeJson(node_path_1.default.join(sharedRuntimeRoot, "taskmap-refresh-state.v1.json"), {
            contractVersion: native_refresh_service_js_1.TASKMAP_NATIVE_REFRESH_STATE_VERSION,
            ownerScopeDigest: first.ownerScopeDigest,
            lastAttemptAtMs: 1_000,
            lastSuccessfulRefreshAtMs: 1_000,
            lastRefreshStatus: "published",
            lastPublicationBlockReason: null,
            verifiedGraphInputDigest: null,
            verifiedCandidateDigest: null,
            verifiedProjectionDigest: null,
            lastSourceStatuses: [{
                    source: "agent_session",
                    disposition: "fresh",
                }],
            lastSourceSuccessAtMs: { agent_session: 1_000 },
            calendarProviderStatuses: [],
            sources: { agent_session: firstSlice },
        });
        const calls = new Map();
        let observedDispositions = [];
        const service = new native_refresh_service_js_1.TaskMapNativeRefreshService({
            confirmedOwner: (0, confirmed_owner_js_1.confirmedTestOwner)(OWNER_B),
            runtimeRoot: sharedRuntimeRoot,
            projectionPath: node_path_1.default.join(sharedTaskMapRoot, "taskmap-projection.v1.json"),
            currentnessPath: node_path_1.default.join(sharedTaskMapRoot, "taskmap-currentness.v1.json"),
            collectors: failingCollectors(calls),
            graphBuilder: async (input) => {
                observedDispositions = input.graphInput.sources.map((source) => source.disposition);
                throw new Error("synthetic graph unavailable");
            },
            nowMs: () => 2_000,
        });
        const result = await service.requestRefresh("manual");
        assert.equal(result.refreshStatus, "unavailable");
        assert.deepEqual(observedDispositions, [
            "unavailable",
            "unavailable",
            "unavailable",
            "unavailable",
        ]);
        assert.equal(result.sourceStatuses.find((status) => status.source === "agent_session")
            ?.state, "unavailable");
    });
});
