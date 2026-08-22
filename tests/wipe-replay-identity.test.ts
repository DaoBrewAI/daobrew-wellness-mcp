import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  ensureDeviceEnrollment,
  mutateSecureClientConfig,
  writeSecureClientConfig,
} from "../src/enrollment.js";
import { loadConfirmedTaskMapOwner } from "../src/identity.js";
import {
  TASKMAP_OWNER_SCOPE_DOMAIN,
  taskMapOwnerScopeDigest,
} from "../src/engine/taskmap/owner-scope.js";

const nodeRequire = createRequire(__filename);
const { setupCliAnchorEnrollment } = nodeRequire("../src/cli-anchor-enrollment.js") as {
  setupCliAnchorEnrollment(options: Record<string, unknown>): Promise<void>;
};

const API_URL = "https://api.example.test/api/v1";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_CREDENTIAL = "dbd_wipe_replay_credential_12345678901234567890";
const INSTALLATION_NONCE = "dbi_wipe_replay_nonce_123456789012345678901234";

function versionResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { contract_version: 1 } }),
  } as Response;
}

describe("wiped-machine identity replay", () => {
  it("replays CLI bootstrap through confirm and keeps one owner scope across mutation and restart", async () => {
    const home = mkdtempSync(join(tmpdir(), "daobrew-wipe-replay-home-"));
    const configFile = join(home, ".daobrew", "config.json");
    let confirmationCalls = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
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
        } as Response;
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
        } as Response;
      }
      if (url.endsWith("/version")) return versionResponse();
      throw new Error("unexpected synthetic backend route");
    }) as typeof fetch;

    try {
      await setupCliAnchorEnrollment({
        apiUrl: API_URL,
        existing: {},
        fetchImpl,
        installationNonce: INSTALLATION_NONCE,
        platform: "darwin",
        surface: "cli",
        userId: OWNER_ID,
        writeConfig: (config: Record<string, unknown>) => {
          writeSecureClientConfig(configFile, config);
        },
      });

      const bootstrappedOwner = await loadConfirmedTaskMapOwner(home);
      assert.equal(bootstrappedOwner.ok, true);
      assert.equal(confirmationCalls, 1);
      if (!bootstrappedOwner.ok) return;
      const initialDigest = bootstrappedOwner.owner.ownerScopeDigest;

      mutateSecureClientConfig(configFile, (current) => ({
        ...current,
        sources: ["granola"],
      }));
      const afterMutation = await loadConfirmedTaskMapOwner(home);
      assert.equal(afterMutation.ok, true);
      if (afterMutation.ok) {
        assert.equal(afterMutation.owner.ownerScopeDigest, initialDigest);
      }

      const callsBeforeRestart = confirmationCalls;
      await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl,
      });
      assert.equal(confirmationCalls, callsBeforeRestart);
      const afterRestart = await loadConfirmedTaskMapOwner(home);
      assert.equal(afterRestart.ok, true);
      if (afterRestart.ok) {
        assert.equal(afterRestart.owner.ownerScopeDigest, initialDigest);
      }

      const helper = spawnSync(
        process.execPath,
        [join(process.cwd(), "scripts", "ingest-daemon-helper.mjs"), "owner-digest", OWNER_ID],
        { encoding: "utf8" },
      );
      assert.equal(helper.status, 0);
      assert.equal(helper.stdout.trim(), initialDigest);
      assert.equal(
        initialDigest,
        createHash("sha256")
          .update(`${TASKMAP_OWNER_SCOPE_DOMAIN}\0${OWNER_ID}`, "utf8")
          .digest("hex"),
      );
      assert.equal(initialDigest, taskMapOwnerScopeDigest(OWNER_ID));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
