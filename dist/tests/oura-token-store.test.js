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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const oura_token_store_js_1 = require("../src/health/oura-token-store.js");
const roots = [];
(0, node_test_1.afterEach)(() => {
    for (const root of roots.splice(0))
        (0, fs_1.rmSync)(root, { recursive: true, force: true });
});
function fixture() {
    const root = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), "daobrew-oura-token-store-"));
    roots.push(root);
    const prefs = (0, path_1.join)(root, ".daobrew");
    (0, fs_1.mkdirSync)(prefs, { mode: 0o700 });
    return { root, tokenFile: (0, path_1.join)(prefs, "oura-token.json") };
}
function token(access, refresh, generation) {
    return {
        access_token: access,
        refresh_token: refresh,
        expires_at: 4_000_000_000_000,
        token_type: "Bearer",
        authorization_generation: generation,
        authorized_at: 1_750_000_000,
        saved_at: 1_750_000_000,
    };
}
function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}
(0, node_test_1.describe)("Oura token store concurrency", () => {
    (0, node_test_1.it)("rejects an in-flight browser grant after OAuth application credentials change", async () => {
        const { tokenFile } = fixture();
        const old = await (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-old", "refresh-old"), {
            generation: () => "auth_old",
        });
        let credentialsStillMatch = false;
        await assert.rejects((0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-stale", "refresh-stale"), {
            generation: () => "auth_stale",
            validateBeforeSave: () => {
                assert.strictEqual((0, fs_1.existsSync)((0, oura_token_store_js_1.ouraTokenLockPath)(tokenFile)), true);
                if (!credentialsStillMatch) {
                    throw new Error("Oura application credentials changed while authorization was in progress. Start Connect again.");
                }
            },
        }), /credentials changed while authorization was in progress/i);
        assert.deepStrictEqual((0, oura_token_store_js_1.readOuraTokenFile)(tokenFile), old);
        assert.strictEqual((0, fs_1.existsSync)((0, oura_token_store_js_1.ouraTokenLockPath)(tokenFile)), false);
    });
    (0, node_test_1.it)("discards a stale refresh response after a concurrent browser authorization", async () => {
        const { tokenFile } = fixture();
        const old = await (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-old", "refresh-old"), {
            generation: () => "auth_old",
        });
        const network = deferred();
        const refresh = (async () => {
            await network.promise;
            return (0, oura_token_store_js_1.compareAndSwapOuraRefresh)(tokenFile, old, token("access-stale", "refresh-stale", old.authorization_generation));
        })();
        const newest = await (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-new", "refresh-new"), {
            generation: () => "auth_new",
        });
        network.resolve();
        const result = await refresh;
        assert.strictEqual(result.saved, false);
        assert.deepStrictEqual(result.token, newest);
        assert.deepStrictEqual((0, oura_token_store_js_1.readOuraTokenFile)(tokenFile), newest);
    });
    (0, node_test_1.it)("fails closed when credentials deletion wins against an in-flight refresh", async () => {
        const { tokenFile } = fixture();
        const old = await (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-old", "refresh-old"), {
            generation: () => "auth_old",
        });
        const network = deferred();
        const refresh = (async () => {
            await network.promise;
            return (0, oura_token_store_js_1.compareAndSwapOuraRefresh)(tokenFile, old, token("access-stale", "refresh-stale", old.authorization_generation));
        })();
        (0, fs_1.unlinkSync)(tokenFile);
        network.resolve();
        await assert.rejects(refresh, /authorization changed during token refresh/i);
        assert.strictEqual((0, fs_1.existsSync)(tokenFile), false);
    });
    (0, node_test_1.it)("serializes concurrent same-process grants and leaves no temporary files", async () => {
        const { root, tokenFile } = fixture();
        const [first, second] = await Promise.all([
            (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-1", "refresh-1"), {
                generation: () => "auth_first",
            }),
            (0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("access-2", "refresh-2"), {
                generation: () => "auth_second",
            }),
        ]);
        assert.notStrictEqual(first.authorization_generation, second.authorization_generation);
        assert.ok(["auth_first", "auth_second"].includes(String((0, oura_token_store_js_1.readOuraTokenFile)(tokenFile)?.authorization_generation)));
        assert.deepStrictEqual((0, fs_1.readdirSync)((0, path_1.join)(root, ".daobrew")).filter((name) => name.includes(".tmp-")), []);
        assert.strictEqual((0, fs_1.statSync)((0, path_1.join)(root, ".daobrew")).mode & 0o777, 0o700);
        assert.strictEqual((0, fs_1.statSync)(tokenFile).mode & 0o777, 0o600);
        assert.strictEqual((0, fs_1.existsSync)((0, oura_token_store_js_1.ouraTokenLockPath)(tokenFile)), false);
    });
    (0, node_test_1.it)("uses a random nonce beyond PID for each temporary path", () => {
        const path = "/tmp/oura-token.json";
        assert.notStrictEqual((0, oura_token_store_js_1.ouraTokenTemporaryPath)(path, 42, "nonce-a"), (0, oura_token_store_js_1.ouraTokenTemporaryPath)(path, 42, "nonce-b"));
    });
    (0, node_test_1.it)("CAS-refreshes legacy tokens without inventing a reconnect generation", async () => {
        const { tokenFile } = fixture();
        const legacy = token("legacy-access", "legacy-refresh");
        (0, fs_1.writeFileSync)(tokenFile, JSON.stringify(legacy), { mode: 0o600 });
        const refreshed = token("next-access", "next-refresh");
        const result = await (0, oura_token_store_js_1.compareAndSwapOuraRefresh)(tokenFile, legacy, refreshed);
        assert.strictEqual(result.saved, true);
        assert.strictEqual(result.token.authorization_generation, undefined);
        const stored = (0, oura_token_store_js_1.readOuraTokenFile)(tokenFile);
        assert.strictEqual(stored?.access_token, refreshed.access_token);
        assert.strictEqual(stored?.refresh_token, refreshed.refresh_token);
        assert.strictEqual(stored?.authorization_generation, undefined);
    });
    (0, node_test_1.it)("includes oauth_mode in the refresh snapshot so authorities cannot cross", async () => {
        const { tokenFile } = fixture();
        const personal = {
            ...token("same-access", "same-refresh", "auth_same"),
            oauth_mode: "personal",
        };
        (0, fs_1.writeFileSync)(tokenFile, JSON.stringify(personal), { mode: 0o600 });
        const staleManagedExpectation = {
            ...personal,
            oauth_mode: "managed",
        };
        const result = await (0, oura_token_store_js_1.compareAndSwapOuraRefresh)(tokenFile, staleManagedExpectation, { ...staleManagedExpectation, access_token: "stale-managed-access" });
        assert.strictEqual(result.saved, false);
        assert.strictEqual(result.token.oauth_mode, "personal");
        assert.deepStrictEqual((0, oura_token_store_js_1.readOuraTokenFile)(tokenFile), personal);
    });
    (0, node_test_1.it)("rejects unknown oauth modes while preserving legacy missing-mode records", () => {
        const { tokenFile } = fixture();
        const legacy = token("legacy-access", "legacy-refresh");
        (0, fs_1.writeFileSync)(tokenFile, JSON.stringify(legacy), { mode: 0o600 });
        const readableLegacy = (0, oura_token_store_js_1.readOuraTokenFile)(tokenFile);
        assert.strictEqual(readableLegacy?.access_token, legacy.access_token);
        assert.strictEqual(readableLegacy?.oauth_mode, undefined);
        (0, fs_1.writeFileSync)(tokenFile, JSON.stringify({ ...legacy, oauth_mode: "future-mode" }), { mode: 0o600 });
        assert.strictEqual((0, oura_token_store_js_1.readOuraTokenFile)(tokenFile), null);
    });
    (0, node_test_1.it)("keeps lock failures credential-free", async () => {
        const { tokenFile } = fixture();
        const lock = (0, oura_token_store_js_1.ouraTokenLockPath)(tokenFile);
        (0, fs_1.writeFileSync)(tokenFile, JSON.stringify(token("secret-access", "secret-refresh")), { mode: 0o600 });
        // A non-directory at the shared lock path makes acquisition fail without
        // ever including token material in the surfaced error.
        (0, fs_1.writeFileSync)(lock, "occupied", { mode: 0o600 });
        (0, fs_1.chmodSync)(lock, 0o600);
        await assert.rejects((0, oura_token_store_js_1.saveNewOuraAuthorization)(tokenFile, token("new-secret-access", "new-secret-refresh"), {
            timeoutMs: 0,
        }), (error) => {
            assert.doesNotMatch(error.message, /secret-access|secret-refresh|new-secret/i);
            return true;
        });
    });
});
(0, node_test_1.describe)("Oura authorization generations", () => {
    (0, node_test_1.it)("uses collision-safe opaque values while accepting safe legacy numbers", () => {
        assert.notStrictEqual((0, oura_token_store_js_1.createAuthorizationGeneration)(() => "uuid-a"), (0, oura_token_store_js_1.createAuthorizationGeneration)(() => "uuid-b"));
        assert.strictEqual((0, oura_token_store_js_1.normalizeAuthorizationGeneration)(42), "42");
        assert.strictEqual((0, oura_token_store_js_1.normalizeAuthorizationGeneration)("auth_uuid-a"), "auth_uuid-a");
        assert.strictEqual((0, oura_token_store_js_1.normalizeAuthorizationGeneration)(true), undefined);
        assert.strictEqual((0, oura_token_store_js_1.normalizeAuthorizationGeneration)(Number.MAX_SAFE_INTEGER + 1), undefined);
    });
});
