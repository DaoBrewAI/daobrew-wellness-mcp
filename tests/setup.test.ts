import { afterEach, beforeEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  DETONATOR_SKILL_PACKAGE_PATH,
  MCP_RUNTIME_ARGS,
  MCP_RUNTIME_COMMAND,
  MCP_SERVER_NAME,
  applyMcpRuntimeRegistration,
  buildSetupConfig,
  installPackagedSkill,
  resolveEngineDistPath,
  resolvePackagedFile,
} from "../src/setup.js";
import {
  BackendIncompatibleError,
  EnrollmentNeededError,
  assertBackendContractCompatible,
  ensureDeviceEnrollment,
  mutateSecureClientConfig,
  normalizeApiUrl,
  readClientConfigFile,
  requestDeviceEnrollment,
  requestLegacyDeviceExchange,
  resolveCredentialBoundClientConfig,
  writeSecureClientConfig,
} from "../src/enrollment.js";
import { loadConfirmedTaskMapOwner } from "../src/identity.js";

const API_URL = "https://api.example.test/api/v1";
const PROVISIONED_API_URL = "https://provisioned.example.test/api/v1";
const DEVICE_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";
const ROTATED_DEVICE_CREDENTIAL = "dbd_vwxyz0123456789abcdefghijklmnop";
const LEGACY_API_KEY = "dbk_legacy-session-12345";
const ENROLLMENT_GRANT = "dbe_0123456789abcdefghijklmnopqrstuv";
const INSTALLATION_NONCE = "dbi_0123456789abcdefghijklmnopqrstuv";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const LEGACY_USER_ID = "apikey:dbk_ab12cd34";
const DEVICE_ID = "22222222-2222-4222-8222-222222222222";

function enrollmentResponse(overrides: Record<string, unknown> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        api_url: API_URL,
        device_credential: DEVICE_CREDENTIAL,
        user_id: USER_ID,
        device_id: DEVICE_ID,
        ...overrides,
      },
    }),
  } as Response;
}

function confirmationResponse(
  status = 200,
  data: Record<string, unknown> = { status: "confirmed" },
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ success: status >= 200 && status < 300, data }),
  } as Response;
}

function versionResponse(contractVersion: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      success: status >= 200 && status < 300,
      data: { contract_version: contractVersion },
    }),
  } as Response;
}

function compatibleBackendFetch(handler: typeof fetch): typeof fetch {
  return (async (input, init) => {
    if (String(input).endsWith("/version")) return versionResponse(1);
    return handler(input, init);
  }) as typeof fetch;
}

function testTmpRoot(): string {
  const root = join(process.cwd(), ".test-tmp", "setup");
  mkdirSync(root, { recursive: true });
  return root;
}

describe("setup MCP registration", () => {
  it("registers the published package through npx", () => {
    const config = applyMcpRuntimeRegistration({
      mcpServers: {
        existing: { command: "example", args: ["--flag"] },
      },
    });

    assert.deepStrictEqual(config.mcpServers[MCP_SERVER_NAME], {
      command: MCP_RUNTIME_COMMAND,
      args: [...MCP_RUNTIME_ARGS],
    });
    assert.deepStrictEqual(config.mcpServers.existing, {
      command: "example",
      args: ["--flag"],
    });
  });
});

describe("setup config", () => {
  it("adds a blank license placeholder to an enrolled config", () => {
    const config = buildSetupConfig({}, {
      device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
      api_url: "https://api.example.test",
      sources: [],
    });

    assert.deepStrictEqual(config, {
      device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
      api_url: "https://api.example.test",
      sources: [],
      license_key: "",
    });
  });

  it("preserves canonical identity while scrubbing legacy DB, auth, and non-canonical identity fields", () => {
    const config = buildSetupConfig(
      {
        api_key: "dbk_existing",
        postgres_url: "postgresql://shared-secret",
        postgres_maintenance_url: "postgresql://owner-secret",
        database_url: "postgresql://legacy-secret",
        user_id: "caller-selected-user",
        device_id: "caller-selected-device",
        engine_dist_path: "/tmp/published-package/dist",
        enrollment_grant: "dbe_consumed-grant-0123456789",
        license_key: "dbw_v1.payload.signature",
        entitlement_public_key: "public-key",
        checkout_url: "https://checkout.example.test",
      },
      {
        device_credential: "dbd_0123456789abcdefghijklmnopqrstuv",
        api_url: "https://api.example.test",
        sources: ["oura"],
      }
    );

    assert.equal(config.license_key, "dbw_v1.payload.signature");
    assert.equal(config.entitlement_public_key, "public-key");
    assert.equal(config.checkout_url, "https://checkout.example.test");
    assert.deepStrictEqual(config.sources, ["oura"]);
    for (const key of [
      "api_key",
      "postgres_url",
      "postgres_maintenance_url",
      "database_url",
      "user_id",
      "device_id",
      "engine_dist_path",
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(config, key), false, key);
    }
    assert.equal(Object.prototype.hasOwnProperty.call(config, "enrollment_grant"), false);

    const canonicalConfig = buildSetupConfig(
      {
        user_id: USER_ID,
        device_id: DEVICE_ID,
      },
      {
        device_credential: DEVICE_CREDENTIAL,
        api_url: API_URL,
      },
    );
    assert.equal(canonicalConfig.user_id, USER_ID);
    assert.equal(canonicalConfig.device_id, DEVICE_ID);
  });

  it("secure config mutation preserves a canonical confirmed owner tuple", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-confirmed-owner-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      installation_nonce: INSTALLATION_NONCE,
      user_id: USER_ID,
      device_id: DEVICE_ID,
    }), { mode: 0o600 });

    try {
      const mutated = mutateSecureClientConfig(configFile, (current) => ({
        ...current,
        sources: ["granola"],
      }));

      assert.equal(mutated.user_id, USER_ID);
      assert.equal(mutated.device_id, DEVICE_ID);
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.user_id, USER_ID);
      assert.equal(persisted.device_id, DEVICE_ID);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("authenticated device enrollment", () => {
  let savedEnrollmentGrant: string | undefined;
  beforeEach(() => {
    savedEnrollmentGrant = process.env.DAOBREW_ENROLLMENT_GRANT;
    delete process.env.DAOBREW_ENROLLMENT_GRANT;
  });
  afterEach(() => {
    if (savedEnrollmentGrant === undefined) delete process.env.DAOBREW_ENROLLMENT_GRANT;
    else process.env.DAOBREW_ENROLLMENT_GRANT = savedEnrollmentGrant;
  });

  it("prefers the legacy authenticated exchange and persists no tenant selector or legacy secret", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    const backupFile = `${configFile}.bak`;
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      installation_nonce: INSTALLATION_NONCE,
      enrollment_grant: ENROLLMENT_GRANT,
      postgres_url: "postgresql://shared-secret",
      postgres_maintenance_url: "postgresql://owner-secret",
      database_url: "postgresql://other-secret",
      user_id: "caller-user",
      device_id: "caller-device",
      sources: ["oura"],
    }), { mode: 0o600 });
    writeFileSync(backupFile, "postgresql://backup-secret", { mode: 0o600 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    try {
      const result = await ensureDeviceEnrollment({
        configFile,
        apiUrl: "https://attacker.example.test/api/v1",
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input, init) => {
          calls.push({ url: String(input), init });
          if (String(input).endsWith("/device/confirm")) return confirmationResponse();
          return enrollmentResponse({ user_id: LEGACY_USER_ID });
        }) as typeof fetch),
      });

      assert.equal(result.enrolled, true);
      assert.equal(
        result.enrollment.userId,
        LEGACY_USER_ID,
        "the exact retired /register principal remains transiently available",
      );
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, `${API_URL}/device/exchange`);
      assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, `Bearer ${LEGACY_API_KEY}`);
      assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
        surface: "wellness-mcp",
        platform: "darwin",
        installation_nonce: INSTALLATION_NONCE,
      });
      assert.equal(calls[1].url, `${API_URL}/device/confirm`);
      assert.equal(
        (calls[1].init?.headers as Record<string, string>).Authorization,
        `Bearer ${DEVICE_CREDENTIAL}`,
      );
      assert.deepStrictEqual(JSON.parse(String(calls[1].init?.body)), {
        installation_nonce: INSTALLATION_NONCE,
      });

      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.deepStrictEqual(persisted, {
        api_url: API_URL,
        sources: ["oura"],
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        installation_nonce: INSTALLATION_NONCE,
      });
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
      assert.equal(statSync(tempDir).mode & 0o777, 0o700);
      assert.equal(existsSync(backupFile), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses a trusted dbe provisioning path only when no legacy session exists", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      enrollment_grant: ENROLLMENT_GRANT,
      installation_nonce: INSTALLATION_NONCE,
      sources: ["oura"],
    }), { mode: 0o600 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    try {
      await ensureDeviceEnrollment({
        configFile,
        apiUrl: "https://attacker.example.test/api/v1",
        metadata: { surface: "sentinel-mac", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input, init) => {
          calls.push({ url: String(input), init });
          if (String(input).endsWith("/device/confirm")) return confirmationResponse();
          return enrollmentResponse();
        }) as typeof fetch),
      });
      assert.equal(calls[0].url, `${API_URL}/device/enroll`);
      assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, `Bearer ${ENROLLMENT_GRANT}`);
      assert.deepStrictEqual(JSON.parse(String(calls[0].init?.body)), {
        surface: "sentinel-mac",
        platform: "darwin",
        installation_nonce: INSTALLATION_NONCE,
      });
      assert.equal(calls[1].url, `${API_URL}/device/confirm`);
      assert.deepStrictEqual(JSON.parse(String(calls[1].init?.body)), {
        installation_nonce: INSTALLATION_NONCE,
      });
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.deepStrictEqual(persisted, {
        api_url: API_URL,
        sources: ["oura"],
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        installation_nonce: INSTALLATION_NONCE,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses an already-confirmed credential after one backend contract readiness check", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      installation_nonce: INSTALLATION_NONCE,
      user_id: USER_ID,
      device_id: DEVICE_ID,
      sources: ["oura"],
    }), { mode: 0o600 });
    const calls: string[] = [];
    try {
      const result = await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: (async (input) => {
          calls.push(String(input));
          return versionResponse(1);
        }) as typeof fetch,
      });
      assert.equal(result.enrolled, false);
      assert.equal(result.enrollment.deviceCredential, DEVICE_CREDENTIAL);
      assert.deepStrictEqual(calls, [`${API_URL}/version`]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("confirm persists the server-returned owner tuple and opens the owner gate", async () => {
    const home = mkdtempSync(join(testTmpRoot(), "daobrew-confirm-owner-"));
    const configDir = join(home, ".daobrew");
    mkdirSync(configDir, { mode: 0o700 });
    const configFile = join(configDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      enrollment_grant: ENROLLMENT_GRANT,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });

    try {
      await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input) => {
          if (String(input).endsWith("/device/confirm")) {
            return confirmationResponse(200, {
              status: "confirmed",
              user_id: USER_ID,
              device_id: DEVICE_ID,
            });
          }
          return enrollmentResponse();
        }) as typeof fetch),
      });

      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.user_id, USER_ID);
      assert.equal(persisted.device_id, DEVICE_ID);
      assert.equal(persisted.device_credential_confirmed, true);
      const owner = await loadConfirmedTaskMapOwner(home);
      assert.equal(owner.ok, true);
      if (owner.ok) assert.equal(owner.owner.userId, USER_ID);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("confirmed config missing user_id self-heals via idempotent re-confirm", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-confirm-self-heal-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });
    let confirmationCalls = 0;

    try {
      await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input) => {
          if (String(input).endsWith("/device/confirm")) {
            confirmationCalls += 1;
            return confirmationResponse(200, {
              status: "confirmed",
              user_id: USER_ID,
              device_id: DEVICE_ID,
            });
          }
          throw new Error("unexpected enrollment request");
        }) as typeof fetch),
      });

      assert.equal(confirmationCalls, 1);
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.user_id, USER_ID);
      assert.equal(persisted.device_id, DEVICE_ID);
      assert.equal(persisted.device_credential_confirmed, true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps a confirmed credential durable when owner repair is temporarily unavailable", async () => {
    for (const outageAt of ["version", "confirm"] as const) {
      const tempDir = mkdtempSync(join(testTmpRoot(), `daobrew-confirm-${outageAt}-outage-`));
      const configFile = join(tempDir, "config.json");
      writeFileSync(configFile, JSON.stringify({
        api_url: API_URL,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        installation_nonce: INSTALLATION_NONCE,
      }), { mode: 0o600 });

      try {
        await assert.rejects(
          ensureDeviceEnrollment({
            configFile,
            metadata: { surface: "wellness-mcp", platform: "darwin" },
            fetchImpl: (async (input) => {
              if (String(input).endsWith("/version")) {
                if (outageAt === "version") throw new Error("synthetic version outage");
                return versionResponse(1);
              }
              throw new Error("synthetic confirm outage");
            }) as typeof fetch,
          }),
          (error: unknown) => {
            assert.match(
              (error as Error).message,
              outageAt === "version" ? /temporarily unavailable/ : /backend is unreachable/,
            );
            return true;
          },
        );
        const persisted = JSON.parse(readFileSync(configFile, "utf8"));
        assert.equal(persisted.device_credential, DEVICE_CREDENTIAL);
        assert.equal(persisted.device_credential_confirmed, true);
        assert.equal("user_id" in persisted, false);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("confirm response without user_id keeps the confirmed credential", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-confirm-compatible-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: false,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });

    try {
      await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input) => {
          assert.equal(String(input), `${API_URL}/device/confirm`);
          return confirmationResponse();
        }) as typeof fetch),
      });

      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.device_credential_confirmed, true);
      assert.equal("user_id" in persisted, false);
      assert.equal("device_id" in persisted, false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed for older, missing, malformed, and missing-route backend contract versions", async () => {
    await assertBackendContractCompatible(
      API_URL,
      (async () => versionResponse(1)) as typeof fetch,
    );
    await assertBackendContractCompatible(
      API_URL,
      (async () => versionResponse(2)) as typeof fetch,
    );

    for (const response of [
      versionResponse(0),
      versionResponse(undefined),
      versionResponse("1"),
      { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as Response,
      { ok: false, status: 404, json: async () => ({}) } as Response,
    ]) {
      await assert.rejects(
        assertBackendContractCompatible(
          API_URL,
          (async () => response) as typeof fetch,
        ),
        (error: unknown) => error instanceof BackendIncompatibleError,
      );
    }
  });

  it("never rebinds a persisted bearer to an environment API URL", () => {
    assert.deepStrictEqual(
      resolveCredentialBoundClientConfig(
        {
          device_credential: DEVICE_CREDENTIAL,
          api_url: API_URL,
        },
        {
          apiUrl: "https://attacker.example.test/api/v1",
        },
      ),
      {
        deviceCredential: DEVICE_CREDENTIAL,
        apiUrl: API_URL,
      },
    );
    assert.deepStrictEqual(
      resolveCredentialBoundClientConfig(
        {},
        {
          deviceCredential: DEVICE_CREDENTIAL,
          apiUrl: "http://127.0.0.1:8787/api/v1",
        },
      ),
      {
        deviceCredential: DEVICE_CREDENTIAL,
        apiUrl: "http://127.0.0.1:8787/api/v1",
      },
    );
  });

  it("keeps recovery authority through a confirmation outage, then resumes without re-exchange", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      installation_nonce: INSTALLATION_NONCE,
      sources: ["oura"],
    }), { mode: 0o600 });
    const firstCalls: string[] = [];
    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: compatibleBackendFetch((async (input) => {
            const url = String(input);
            firstCalls.push(url);
            return url.endsWith("/device/confirm")
              ? confirmationResponse(503)
              : enrollmentResponse({ user_id: LEGACY_USER_ID });
          }) as typeof fetch),
        }),
        /confirmation is temporarily unavailable/,
      );
      assert.deepStrictEqual(firstCalls, [
        `${API_URL}/device/exchange`,
        `${API_URL}/device/confirm`,
      ]);
      const unconfirmed = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(unconfirmed.api_key, LEGACY_API_KEY);
      assert.equal(unconfirmed.device_credential, DEVICE_CREDENTIAL);
      assert.equal(unconfirmed.device_credential_confirmed, false);
      assert.equal(unconfirmed.installation_nonce, INSTALLATION_NONCE);

      const retryCalls: Array<{ url: string; init?: RequestInit }> = [];
      const result = await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input, init) => {
          retryCalls.push({ url: String(input), init });
          return confirmationResponse();
        }) as typeof fetch),
      });
      assert.equal(result.enrolled, false);
      assert.deepStrictEqual(retryCalls.map((call) => call.url), [
        `${API_URL}/device/confirm`,
      ]);
      assert.deepStrictEqual(JSON.parse(String(retryCalls[0].init?.body)), {
        installation_nonce: INSTALLATION_NONCE,
      });
      const confirmed = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(confirmed.device_credential_confirmed, true);
      assert.equal("api_key" in confirmed, false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reuses the same installation nonce after a lost exchange response", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });
    let firstBody: Record<string, unknown> | undefined;
    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: compatibleBackendFetch((async (_input, init) => {
            firstBody = JSON.parse(String(init?.body));
            throw new Error("response lost");
          }) as typeof fetch),
        }),
        /backend is unreachable/,
      );
      assert.equal(firstBody?.installation_nonce, INSTALLATION_NONCE);
      const afterLoss = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(afterLoss.api_key, LEGACY_API_KEY);
      assert.equal(afterLoss.installation_nonce, INSTALLATION_NONCE);

      const retryBodies: Record<string, unknown>[] = [];
      await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input, init) => {
          retryBodies.push(JSON.parse(String(init?.body)));
          return String(input).endsWith("/device/confirm")
            ? confirmationResponse()
            : enrollmentResponse({ user_id: LEGACY_USER_ID });
        }) as typeof fetch),
      });
      assert.equal(retryBodies[0].installation_nonce, INSTALLATION_NONCE);
      assert.equal(retryBodies[1].installation_nonce, INSTALLATION_NONCE);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rotates a rejected unconfirmed credential through the retained legacy source", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: false,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    try {
      const result = await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: compatibleBackendFetch((async (input, init) => {
          const url = String(input);
          calls.push({ url, init });
          if (url.endsWith("/device/confirm") && calls.length === 1) {
            return confirmationResponse(401);
          }
          if (url.endsWith("/device/exchange")) {
            return enrollmentResponse({
              user_id: LEGACY_USER_ID,
              device_credential: ROTATED_DEVICE_CREDENTIAL,
            });
          }
          return confirmationResponse();
        }) as typeof fetch),
      });
      assert.deepStrictEqual(calls.map((call) => call.url), [
        `${API_URL}/device/confirm`,
        `${API_URL}/device/exchange`,
        `${API_URL}/device/confirm`,
      ]);
      for (const call of calls) {
        assert.equal(
          JSON.parse(String(call.init?.body)).installation_nonce,
          INSTALLATION_NONCE,
        );
      }
      assert.equal(result.enrollment.deviceCredential, ROTATED_DEVICE_CREDENTIAL);
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.device_credential, ROTATED_DEVICE_CREDENTIAL);
      assert.equal(persisted.device_credential_confirmed, true);
      assert.equal("api_key" in persisted, false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps a rejected confirmed bearer after the secure writer scrubs its legacy source", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: true,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: compatibleBackendFetch((async (input, init) => {
            calls.push({ url: String(input), init });
            return confirmationResponse(401);
          }) as typeof fetch),
        }),
        (error: unknown) => {
          assert.ok(error instanceof EnrollmentNeededError);
          assert.equal(error.reason, "no_migration_credential");
          return true;
        },
      );
      assert.deepStrictEqual(calls.map((call) => call.url), [
        `${API_URL}/device/confirm`,
      ]);
      for (const call of calls) {
        assert.equal(
          JSON.parse(String(call.init?.body)).installation_nonce,
          INSTALLATION_NONCE,
        );
      }
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.deepStrictEqual(persisted, {
        api_url: API_URL,
        device_credential: DEVICE_CREDENTIAL,
        device_credential_confirmed: true,
        installation_nonce: INSTALLATION_NONCE,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("checks backend contract before accepting a concurrently confirmed credential", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      device_credential: DEVICE_CREDENTIAL,
      device_credential_confirmed: false,
      installation_nonce: INSTALLATION_NONCE,
    }), { mode: 0o600 });
    const calls: string[] = [];
    try {
      const result = await ensureDeviceEnrollment({
        configFile,
        metadata: { surface: "wellness-mcp", platform: "darwin" },
        fetchImpl: (async (input) => {
          const url = String(input);
          calls.push(url);
          if (url.endsWith("/version")) return versionResponse(1);
          if (url.endsWith("/device/confirm")) {
            writeFileSync(configFile, JSON.stringify({
              api_url: PROVISIONED_API_URL,
              device_credential: ROTATED_DEVICE_CREDENTIAL,
              device_credential_confirmed: true,
              installation_nonce: INSTALLATION_NONCE,
            }), { mode: 0o600 });
            return confirmationResponse(401);
          }
          throw new Error(`unexpected request ${url}`);
        }) as typeof fetch,
      });
      assert.equal(result.enrolled, false);
      assert.equal(result.enrollment.deviceCredential, ROTATED_DEVICE_CREDENTIAL);
      assert.equal(result.enrollment.apiUrl, PROVISIONED_API_URL);
      assert.deepStrictEqual(calls, [
        `${API_URL}/version`,
        `${API_URL}/device/confirm`,
        `${PROVISIONED_API_URL}/version`,
      ]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns typed ENROLLMENT_NEEDED without silently minting", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    let fetchCalls = 0;
    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          apiUrl: API_URL,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: (async () => {
            fetchCalls += 1;
            return enrollmentResponse();
          }) as typeof fetch,
        }),
        (error: unknown) => {
          assert.ok(error instanceof EnrollmentNeededError);
          assert.equal(error.code, "ENROLLMENT_NEEDED");
          assert.equal(error.reason, "no_migration_credential");
          assert.match(error.message, /sign in again|support/i);
          assert.doesNotMatch(error.message, /grant|paste/i);
          return true;
        },
      );
      assert.equal(fetchCalls, 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves a rejected legacy credential for re-auth recovery", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: API_URL,
      api_key: LEGACY_API_KEY,
      postgres_url: "postgresql://must-be-removed",
    }), { mode: 0o600 });
    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: compatibleBackendFetch(
            (async () => ({ ok: false, status: 401 }) as Response) as typeof fetch,
          ),
        }),
        (error: unknown) => {
          assert.ok(error instanceof EnrollmentNeededError);
          assert.equal(error.reason, "legacy_exchange_rejected");
          return true;
        },
      );
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.api_key, LEGACY_API_KEY);
      assert.equal("postgres_url" in persisted, false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps a temporary exchange outage distinct from invalid authentication", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({ api_url: API_URL, api_key: LEGACY_API_KEY }), { mode: 0o600 });
    try {
      await assert.rejects(
        ensureDeviceEnrollment({
          configFile,
          metadata: { surface: "wellness-mcp", platform: "darwin" },
          fetchImpl: compatibleBackendFetch(
            (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch,
          ),
        }),
        (error: unknown) => {
          assert.equal(error instanceof EnrollmentNeededError, false);
          assert.match((error as Error).message, /temporarily unavailable/);
          return true;
        },
      );
      const persisted = JSON.parse(readFileSync(configFile, "utf8"));
      assert.equal(persisted.api_key, LEGACY_API_KEY);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("classifies enrollment route 404s and malformed success bodies as backend incompatible", async () => {
    const metadata = { surface: "wellness-mcp", platform: "darwin" };
    await assert.rejects(
      requestLegacyDeviceExchange(
        API_URL,
        LEGACY_API_KEY,
        metadata,
        INSTALLATION_NONCE,
        (async () => ({ ok: false, status: 404 }) as Response) as typeof fetch,
      ),
      (error: unknown) => {
        assert.ok(error instanceof BackendIncompatibleError);
        assert.equal(error.code, "backend_incompatible");
        assert.match(error.message, /backend version/i);
        return true;
      },
    );
    await assert.rejects(
      requestDeviceEnrollment(
        API_URL,
        ENROLLMENT_GRANT,
        metadata,
        INSTALLATION_NONCE,
        (async () => ({ ok: false, status: 404 }) as Response) as typeof fetch,
      ),
      (error: unknown) => error instanceof BackendIncompatibleError,
    );
    await assert.rejects(
      requestDeviceEnrollment(
        API_URL,
        ENROLLMENT_GRANT,
        metadata,
        INSTALLATION_NONCE,
        (async () => ({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { api_url: API_URL } }),
        }) as unknown as Response) as typeof fetch,
      ),
      (error: unknown) => error instanceof BackendIncompatibleError,
    );
    await assert.rejects(
      requestLegacyDeviceExchange(
        API_URL,
        LEGACY_API_KEY,
        metadata,
        INSTALLATION_NONCE,
        (async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("invalid json");
          },
        }) as unknown as Response) as typeof fetch,
      ),
      (error: unknown) => error instanceof BackendIncompatibleError,
    );
    await assert.rejects(
      requestDeviceEnrollment(
        API_URL,
        ENROLLMENT_GRANT,
        metadata,
        INSTALLATION_NONCE,
        (async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("invalid json");
          },
        }) as unknown as Response) as typeof fetch,
      ),
      (error: unknown) => error instanceof BackendIncompatibleError,
    );
  });

  it("keeps 5xx enrollment failures on the transient retry path", async () => {
    await assert.rejects(
      requestDeviceEnrollment(
        API_URL,
        ENROLLMENT_GRANT,
        { surface: "sentinel-mac", platform: "darwin" },
        INSTALLATION_NONCE,
        (async () => ({ ok: false, status: 503 }) as Response) as typeof fetch,
      ),
      (error: unknown) => {
        assert.equal(error instanceof BackendIncompatibleError, false);
        assert.match((error as Error).message, /temporarily unavailable/);
        return true;
      },
    );
  });

  it("rejects missing or malformed device fields in a successful exchange", async () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({ api_url: API_URL, api_key: LEGACY_API_KEY }), { mode: 0o600 });
    try {
      for (const response of [
        enrollmentResponse({ device_credential: "dbk_not-a-device-token" }),
        enrollmentResponse({ user_id: "caller-chosen" }),
        enrollmentResponse({ user_id: "apikey:victim" }),
        enrollmentResponse({ user_id: "apikey:dbk_too_short" }),
        enrollmentResponse({ device_id: undefined }),
        enrollmentResponse({ api_url: "https://user:secret@api.example.test/api/v1" }),
      ]) {
        await assert.rejects(
          ensureDeviceEnrollment({
            configFile,
            metadata: { surface: "wellness-mcp", platform: "darwin" },
            fetchImpl: compatibleBackendFetch((async () => response) as typeof fetch),
          }),
          (error: unknown) => error instanceof BackendIncompatibleError,
        );
        const persisted = JSON.parse(readFileSync(configFile, "utf8"));
        assert.equal(persisted.api_key, LEGACY_API_KEY);
        assert.equal("device_credential" in persisted, false);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed on malformed config and clears possible embedded secrets", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, "{ not-json postgresql://shared-secret", { mode: 0o644 });
    try {
      assert.throws(() => readClientConfigFile(configFile), /malformed.*securely cleared/i);
      assert.deepStrictEqual(JSON.parse(readFileSync(configFile, "utf8")), { config_repair_required: true });
      assert.equal(readFileSync(configFile, "utf8").includes("postgresql"), false);
      assert.equal(statSync(configFile).mode & 0o777, 0o600);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("clears an existing config with an unsafe credential-bearing API URL", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      api_url: "https://user:secret@api.example.test/api/v1",
      postgres_url: "postgresql://shared-secret",
    }), { mode: 0o600 });
    try {
      assert.throws(() => readClientConfigFile(configFile), /unsafe API URL.*securely cleared/i);
      const contents = readFileSync(configFile, "utf8");
      assert.deepStrictEqual(JSON.parse(contents), { config_repair_required: true });
      assert.equal(/secret|postgresql/.test(contents), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts HTTPS and loopback HTTP only, with no embedded credentials/query/fragment", () => {
    assert.equal(normalizeApiUrl("https://api.example.test/api/v1/"), API_URL);
    assert.equal(normalizeApiUrl("http://127.0.0.1:8000/api/v1"), "http://127.0.0.1:8000/api/v1");
    for (const value of [
      "http://api.example.test/api/v1",
      "https://user:secret@api.example.test/api/v1",
      "https://api.example.test/api/v1?token=secret",
      "https://api.example.test/api/v1#fragment",
    ]) {
      assert.throws(() => normalizeApiUrl(value));
    }
  });

  it("secure writer rejects a credential-bearing API URL", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    try {
      assert.throws(() => writeSecureClientConfig(configFile, {
        api_url: "https://user:secret@api.example.test/api/v1",
      }), /embedded credentials/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps one persistent owner-only config lock inode", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    const lockFile = join(tempDir, "config.lock");
    try {
      writeSecureClientConfig(configFile, { first: true });
      const firstLock = statSync(lockFile);
      assert.equal(firstLock.isFile(), true);
      assert.equal(firstLock.mode & 0o777, 0o600);
      assert.equal(statSync(tempDir).mode & 0o777, 0o700);

      writeSecureClientConfig(configFile, { second: true });
      assert.equal(statSync(lockFile).ino, firstLock.ino);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects a config lock symlink without touching its target", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-enrollment-"));
    const configFile = join(tempDir, "config.json");
    const target = join(tempDir, "outside-target");
    writeFileSync(target, "unchanged", { mode: 0o600 });
    symlinkSync(target, join(tempDir, "config.lock"));
    try {
      assert.throws(
        () => writeSecureClientConfig(configFile, { must_not_write: true }),
        /could not be opened safely/,
      );
      assert.equal(readFileSync(target, "utf8"), "unchanged");
      assert.equal(existsSync(configFile), false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("setup engine dist path", () => {
  it("resolves the dist dir containing the built internal server", () => {
    const tmp = mkdtempSync(join(testTmpRoot(), "daobrew-setup-"));
    // Layout mirrors the published package: <pkg>/dist/src/setup.js is baseDir.
    const distDir = join(tmp, "dist");
    mkdirSync(join(distDir, "src", "engine"), { recursive: true });
    writeFileSync(join(distDir, "src", "engine", "internal-server.js"), "// built");
    const baseDir = join(distDir, "src"); // where setup.js lives at runtime
    assert.strictEqual(resolveEngineDistPath(baseDir), distDir);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null when the engine is not built", () => {
    const tmp = mkdtempSync(join(testTmpRoot(), "daobrew-setup-"));
    assert.strictEqual(resolveEngineDistPath(join(tmp, "dist", "src")), null);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("setup skill installation", () => {
  it("packages the canonical Detonator skill", () => {
    const source = resolvePackagedFile(DETONATOR_SKILL_PACKAGE_PATH);

    assert.ok(source);
    assert.match(readFileSync(source, "utf-8"), /name: detonator/);
    assert.match(readFileSync(source, "utf-8"), /daobrew_detonate/);
  });

  it("installs the Detonator skill to a skill directory", () => {
    const tempDir = mkdtempSync(join(testTmpRoot(), "daobrew-skill-install-"));
    try {
      const destinationDir = join(tempDir, ".codex", "skills", "detonator");
      const result = installPackagedSkill(DETONATOR_SKILL_PACKAGE_PATH, destinationDir);

      assert.ok(result);
      assert.equal(result.destination, join(destinationDir, "SKILL.md"));
      assert.match(readFileSync(result.destination, "utf-8"), /name: detonator/);
      assert.match(readFileSync(result.destination, "utf-8"), /daobrew_detonate_done/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
