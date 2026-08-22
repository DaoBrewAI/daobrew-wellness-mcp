import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  createTaskMapOwnerScope,
} from "../src/engine/taskmap/owner-scope.js";

const roots: string[] = [];
const OWNER_A = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const OWNER_B = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";

function confirmedConfig(userId: string, credentialCharacter: string) {
  return {
    user_id: userId,
    device_credential: `dbd_${credentialCharacter.repeat(32)}`,
    device_credential_confirmed: true,
    api_url: "https://synthetic.daobrew.test/api/v1",
  };
}

function writePrivateJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(filePath), 0o700);
  writeFileSync(filePath, JSON.stringify(value), { mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function arrangeOwnerAToken(): {
  home: string;
  configPath: string;
  ownerADigest: string;
  ownerBDigest: string;
  ownerBSourceRoot: string;
} {
  const home = mkdtempSync(path.join(tmpdir(), "oura-owner-isolation-"));
  roots.push(home);
  const configPath = path.join(home, ".daobrew", "config.json");
  const ownerA = createTaskMapOwnerScope(OWNER_A, home);
  const ownerB = createTaskMapOwnerScope(OWNER_B, home);
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
  writePrivateJson(path.join(ownerA.sourceRoot, "oura-token.json"), token);
  // The retired location is deliberately populated too: production must not
  // migrate it or treat it as current authorization for any owner.
  writePrivateJson(path.join(home, ".daobrew", "oura-token.json"), token);
  return {
    home,
    configPath,
    ownerADigest: ownerA.ownerScopeDigest,
    ownerBDigest: ownerB.ownerScopeDigest,
    ownerBSourceRoot: ownerB.sourceRoot,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Oura confirmed-owner isolation", () => {
  it("rejects a caller-forged owner guard even with the current digest", () => {
    const arranged = arrangeOwnerAToken();
    const ouraModulePath = require.resolve("../src/health/oura.js");
    const output = execFileSync(process.execPath, [
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

  it("makes owner A's token unavailable immediately after pairing changes to owner B", () => {
    const arranged = arrangeOwnerAToken();
    const ouraModulePath = require.resolve("../src/health/oura.js");
    const output = execFileSync(process.execPath, [
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

  it("does not fetch or relabel owner A physiology as owner B", () => {
    const arranged = arrangeOwnerAToken();
    writePrivateJson(arranged.configPath, confirmedConfig(OWNER_B, "b"));
    const physiologicalModulePath = require.resolve(
      "../src/engine/taskmap/physiological-source-snapshot.js",
    );
    const outputPath = path.join(
      arranged.ownerBSourceRoot,
      "taskmap-physiological-source-snapshot.v1.json",
    );
    const output = execFileSync(process.execPath, [
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

  it("stops provider reads when confirmed ownership changes during collection", () => {
    const arranged = arrangeOwnerAToken();
    const physiologicalModulePath = require.resolve(
      "../src/engine/taskmap/physiological-source-snapshot.js",
    );
    const outputPath = path.join(
      createTaskMapOwnerScope(OWNER_A, arranged.home).sourceRoot,
      "taskmap-physiological-source-snapshot.v1.json",
    );
    const output = execFileSync(process.execPath, [
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

  it("never retries or publishes another Oura batch after owner A changes to B", () => {
    const arranged = arrangeOwnerAToken();
    const syncModulePath = require.resolve("../src/health/sync.js");
    const output = execFileSync(process.execPath, [
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

  it("does not publish batch two after a successful first push changes owner A to B", () => {
    const arranged = arrangeOwnerAToken();
    const syncModulePath = require.resolve("../src/health/sync.js");
    const output = execFileSync(process.execPath, [
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
