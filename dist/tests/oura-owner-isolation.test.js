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
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const roots = [];
const OWNER_A = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const OWNER_B = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
function confirmedConfig(userId, credentialCharacter) {
    return {
        user_id: userId,
        device_credential: `dbd_${credentialCharacter.repeat(32)}`,
        device_credential_confirmed: true,
        api_url: "https://synthetic.daobrew.test/api/v1",
    };
}
function writePrivateJson(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(node_path_1.default.dirname(filePath), 0o700);
    (0, node_fs_1.writeFileSync)(filePath, JSON.stringify(value), { mode: 0o600 });
    (0, node_fs_1.chmodSync)(filePath, 0o600);
}
function arrangeOwnerAToken() {
    const home = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "oura-owner-isolation-"));
    roots.push(home);
    const configPath = node_path_1.default.join(home, ".daobrew", "config.json");
    const ownerA = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_A, home);
    const ownerB = (0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_B, home);
    const token = {
        access_token: "owner-a-access",
        refresh_token: "owner-a-refresh",
        expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
        token_type: "Bearer",
        scope: "daily heartrate",
        oauth_mode: "managed",
        authorization_generation: "auth_owner_a",
        owner_scope_digest: ownerA.ownerScopeDigest,
    };
    writePrivateJson(configPath, confirmedConfig(OWNER_A, "a"));
    writePrivateJson(node_path_1.default.join(ownerA.sourceRoot, "oura-token.json"), token);
    // The retired location is deliberately populated too: production must not
    // migrate it or treat it as current authorization for any owner.
    writePrivateJson(node_path_1.default.join(home, ".daobrew", "oura-token.json"), token);
    return {
        home,
        configPath,
        ownerADigest: ownerA.ownerScopeDigest,
        ownerBDigest: ownerB.ownerScopeDigest,
        ownerBSourceRoot: ownerB.sourceRoot,
    };
}
(0, node_test_1.afterEach)(() => {
    for (const root of roots.splice(0)) {
        (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
    }
});
(0, node_test_1.describe)("Oura confirmed-owner isolation", () => {
    (0, node_test_1.it)("rejects a caller-forged owner guard even with the current digest", () => {
        const arranged = arrangeOwnerAToken();
        const ouraModulePath = require.resolve("../src/health/oura.js");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        const oura = require(${JSON.stringify(ouraModulePath)});
        const token = oura.loadToken();
        const trusted = oura.captureCurrentOuraOwnerGuard(token);
        oura.assertCurrentOuraOwnerGuard(trusted);
        let forged = "accepted";
        try {
          oura.assertCurrentOuraOwnerGuard({
            ownerScopeDigest: ${JSON.stringify(arranged.ownerADigest)},
          });
        } catch {
          forged = "rejected";
        }
        process.stdout.write(forged);
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        assert.equal(output, "rejected");
    });
    (0, node_test_1.it)("makes owner A's token unavailable immediately after pairing changes to owner B", () => {
        const arranged = arrangeOwnerAToken();
        const ouraModulePath = require.resolve("../src/health/oura.js");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        const fs = require("node:fs");
        const oura = require(${JSON.stringify(ouraModulePath)});
        const first = oura.loadToken();
        fs.writeFileSync(
          ${JSON.stringify(arranged.configPath)},
          JSON.stringify(${JSON.stringify(confirmedConfig(OWNER_B, "b"))}),
          { mode: 0o600 },
        );
        const second = oura.loadToken();
        process.stdout.write(JSON.stringify({
          firstAccessToken: first?.access_token ?? null,
          secondAccessToken: second?.access_token ?? null,
        }));
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        assert.deepEqual(JSON.parse(output), {
            firstAccessToken: "owner-a-access",
            secondAccessToken: null,
        });
    });
    (0, node_test_1.it)("does not fetch or relabel owner A physiology as owner B", () => {
        const arranged = arrangeOwnerAToken();
        writePrivateJson(arranged.configPath, confirmedConfig(OWNER_B, "b"));
        const physiologicalModulePath = require.resolve("../src/engine/taskmap/physiological-source-snapshot.js");
        const outputPath = node_path_1.default.join(arranged.ownerBSourceRoot, "taskmap-physiological-source-snapshot.v1.json");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        (async () => {
          let fetchCalls = 0;
          global.fetch = async () => {
            fetchCalls += 1;
            return {
              ok: true,
              json: async () => ({ data: [], next_token: null }),
            };
          };
          const physiological = require(${JSON.stringify(physiologicalModulePath)});
          let decision = "resolved";
          try {
            await physiological.refreshTaskMapPhysiologicalSourceSnapshot({
              outputPath: ${JSON.stringify(outputPath)},
              ownerScopeDigest: ${JSON.stringify(arranged.ownerBDigest)},
              force: true,
              clock: () => new Date("2026-08-01T12:00:00.000Z"),
            });
          } catch {
            decision = "rejected";
          }
          process.stdout.write(JSON.stringify({ decision, fetchCalls }));
        })().catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        assert.deepEqual(JSON.parse(output), {
            decision: "rejected",
            fetchCalls: 0,
        });
    });
    (0, node_test_1.it)("stops provider reads when confirmed ownership changes during collection", () => {
        const arranged = arrangeOwnerAToken();
        const physiologicalModulePath = require.resolve("../src/engine/taskmap/physiological-source-snapshot.js");
        const outputPath = node_path_1.default.join((0, owner_scope_js_1.createTaskMapOwnerScope)(OWNER_A, arranged.home).sourceRoot, "taskmap-physiological-source-snapshot.v1.json");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        (async () => {
          const fs = require("node:fs");
          let fetchCalls = 0;
          global.fetch = async () => {
            fetchCalls += 1;
            if (fetchCalls === 1) {
              fs.writeFileSync(
                ${JSON.stringify(arranged.configPath)},
                JSON.stringify(${JSON.stringify(confirmedConfig(OWNER_B, "b"))}),
                { mode: 0o600 },
              );
            }
            return {
              ok: true,
              json: async () => ({ data: [], next_token: null }),
            };
          };
          const physiological = require(${JSON.stringify(physiologicalModulePath)});
          let decision = "resolved";
          try {
            await physiological.refreshTaskMapPhysiologicalSourceSnapshot({
              outputPath: ${JSON.stringify(outputPath)},
              ownerScopeDigest: ${JSON.stringify(arranged.ownerADigest)},
              force: true,
              clock: () => new Date("2026-08-01T12:00:00.000Z"),
            });
          } catch {
            decision = "rejected";
          }
          process.stdout.write(JSON.stringify({ decision, fetchCalls }));
        })().catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        assert.deepEqual(JSON.parse(output), {
            decision: "rejected",
            fetchCalls: 1,
        });
    });
    (0, node_test_1.it)("never retries or publishes another Oura batch after owner A changes to B", () => {
        const arranged = arrangeOwnerAToken();
        const syncModulePath = require.resolve("../src/health/sync.js");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        (async () => {
          const fs = require("node:fs");
          global.fetch = async (url) => ({
            ok: true,
            status: 200,
            json: async () => ({
              data: String(url).includes("heartrate")
                ? Array.from({ length: 501 }, (_, index) => ({
                    bpm: 60 + (index % 10),
                    timestamp: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index).toISOString(),
                  }))
                : [],
              next_token: null,
            }),
          });
          const sync = require(${JSON.stringify(syncModulePath)});
          let pushCalls = 0;
          const result = await sync.syncAllConnectedSources({
            async pushHealthSamples() {
              pushCalls += 1;
              fs.writeFileSync(
                ${JSON.stringify(arranged.configPath)},
                JSON.stringify(${JSON.stringify(confirmedConfig(OWNER_B, "b"))}),
                { mode: 0o600 },
              );
              throw new Error("synthetic retryable backend failure");
            },
          });
          process.stdout.write(JSON.stringify({ pushCalls, result }));
        })().catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        const observed = JSON.parse(output);
        assert.equal(observed.pushCalls, 1);
        assert.equal(observed.result[0].samples_pushed, 0);
        assert.match(observed.result[0].error, /owner enrollment changed/i);
    });
    (0, node_test_1.it)("does not publish batch two after a successful first push changes owner A to B", () => {
        const arranged = arrangeOwnerAToken();
        const syncModulePath = require.resolve("../src/health/sync.js");
        const output = (0, node_child_process_1.execFileSync)(process.execPath, [
            "-e",
            `
        (async () => {
          const fs = require("node:fs");
          global.fetch = async (url) => ({
            ok: true,
            status: 200,
            json: async () => ({
              data: String(url).includes("heartrate")
                ? Array.from({ length: 501 }, (_, index) => ({
                    bpm: 64,
                    timestamp: new Date(Date.parse("2026-08-01T12:00:00.000Z") + index).toISOString(),
                  }))
                : [],
              next_token: null,
            }),
          });
          const sync = require(${JSON.stringify(syncModulePath)});
          let pushCalls = 0;
          const result = await sync.syncAllConnectedSources({
            async pushHealthSamples(batch) {
              pushCalls += 1;
              fs.writeFileSync(
                ${JSON.stringify(arranged.configPath)},
                JSON.stringify(${JSON.stringify(confirmedConfig(OWNER_B, "b"))}),
                { mode: 0o600 },
              );
              return { samples_received: batch.length, message: "accepted" };
            },
          });
          process.stdout.write(JSON.stringify({ pushCalls, result }));
        })().catch((error) => {
          console.error(error);
          process.exitCode = 1;
        });
      `,
        ], {
            env: { ...process.env, HOME: arranged.home },
            encoding: "utf8",
        });
        const observed = JSON.parse(output);
        assert.equal(observed.pushCalls, 1);
        assert.equal(observed.result[0].samples_pushed, 500);
        assert.match(observed.result[0].error, /owner enrollment changed/i);
    });
});
