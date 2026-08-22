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
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
const node_module_1 = require("node:module");
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const enrollment_js_1 = require("../src/enrollment.js");
const identity_js_1 = require("../src/identity.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const nodeRequire = (0, node_module_1.createRequire)(__filename);
const { setupCliAnchorEnrollment } = nodeRequire("../src/cli-anchor-enrollment.js");
const API_URL = "https://api.example.test/api/v1";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_CREDENTIAL = "dbd_wipe_replay_credential_12345678901234567890";
const INSTALLATION_NONCE = "dbi_wipe_replay_nonce_123456789012345678901234";
function versionResponse() {
    return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { contract_version: 1 } }),
    };
}
(0, node_test_1.describe)("wiped-machine identity replay", () => {
    (0, node_test_1.it)("replays CLI bootstrap through confirm and keeps one owner scope across mutation and restart", async () => {
        const home = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-wipe-replay-home-"));
        const configFile = (0, node_path_1.join)(home, ".daobrew", "config.json");
        let confirmationCalls = 0;
        const fetchImpl = (async (input) => {
            const url = String(input);
            if (url.endsWith("/device/register-anchor")) {
                return {
                    ok: true,
                    status: 201,
                    json: async () => ({
                        success: true,
                        data: {
                            api_url: API_URL,
                            user_id: OWNER_ID,
                            device_id: DEVICE_ID,
                            device_credential: DEVICE_CREDENTIAL,
                        },
                    }),
                };
            }
            if (url.endsWith("/device/confirm")) {
                confirmationCalls += 1;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            status: "confirmed",
                            user_id: OWNER_ID,
                            device_id: DEVICE_ID,
                        },
                    }),
                };
            }
            if (url.endsWith("/version"))
                return versionResponse();
            throw new Error("unexpected synthetic backend route");
        });
        try {
            await setupCliAnchorEnrollment({
                apiUrl: API_URL,
                existing: {},
                fetchImpl,
                installationNonce: INSTALLATION_NONCE,
                platform: "darwin",
                surface: "cli",
                userId: OWNER_ID,
                writeConfig: (config) => {
                    (0, enrollment_js_1.writeSecureClientConfig)(configFile, config);
                },
            });
            const bootstrappedOwner = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home);
            assert.equal(bootstrappedOwner.ok, true);
            assert.equal(confirmationCalls, 1);
            if (!bootstrappedOwner.ok)
                return;
            const initialDigest = bootstrappedOwner.owner.ownerScopeDigest;
            (0, enrollment_js_1.mutateSecureClientConfig)(configFile, (current) => ({
                ...current,
                sources: ["granola"],
            }));
            const afterMutation = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home);
            assert.equal(afterMutation.ok, true);
            if (afterMutation.ok) {
                assert.equal(afterMutation.owner.ownerScopeDigest, initialDigest);
            }
            const callsBeforeRestart = confirmationCalls;
            await (0, enrollment_js_1.ensureDeviceEnrollment)({
                configFile,
                metadata: { surface: "wellness-mcp", platform: "darwin" },
                fetchImpl,
            });
            assert.equal(confirmationCalls, callsBeforeRestart);
            const afterRestart = await (0, identity_js_1.loadConfirmedTaskMapOwner)(home);
            assert.equal(afterRestart.ok, true);
            if (afterRestart.ok) {
                assert.equal(afterRestart.owner.ownerScopeDigest, initialDigest);
            }
            const helper = (0, node_child_process_1.spawnSync)(process.execPath, [(0, node_path_1.join)(process.cwd(), "scripts", "ingest-daemon-helper.mjs"), "owner-digest", OWNER_ID], { encoding: "utf8" });
            assert.equal(helper.status, 0);
            assert.equal(helper.stdout.trim(), initialDigest);
            assert.equal(initialDigest, (0, node_crypto_1.createHash)("sha256")
                .update(`${owner_scope_js_1.TASKMAP_OWNER_SCOPE_DOMAIN}\0${OWNER_ID}`, "utf8")
                .digest("hex"));
            assert.equal(initialDigest, (0, owner_scope_js_1.taskMapOwnerScopeDigest)(OWNER_ID));
        }
        finally {
            (0, node_fs_1.rmSync)(home, { recursive: true, force: true });
        }
    });
});
