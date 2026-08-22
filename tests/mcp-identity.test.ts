import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { assertMcpRuntimeReady, createMcpRuntime } from "../src/index.js";

const PERSISTED_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";
const ENVIRONMENT_CREDENTIAL = "dbd_vutsrqponmlkjihgfedcba9876543210";

const ENV_KEYS = [
  "DAOBREW_API_URL",
  "DAOBREW_DEVICE_CREDENTIAL",
  "DAOBREW_MOCK",
] as const;

function withEnv<T>(
  env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => T,
): T {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) previous.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("MCP credential-bound startup", () => {
  it("uses the persisted device credential and its persisted server URL as one authority record", () => {
    withEnv({
      DAOBREW_DEVICE_CREDENTIAL: ENVIRONMENT_CREDENTIAL,
      DAOBREW_API_URL: "https://attacker.example.test/api/v1",
      DAOBREW_MOCK: undefined,
    }, () => {
      const runtime = createMcpRuntime({
        device_credential: PERSISTED_CREDENTIAL,
        api_url: "https://api.example.test/api/v1/",
      }, ["node", "index.js"]);

      assert.equal(runtime.isMock, false);
      assert.equal(runtime.deviceCredential, PERSISTED_CREDENTIAL);
      assert.equal(runtime.apiUrl, "https://api.example.test/api/v1");
      assert.ok(runtime.client);
    });
  });

  it("allows a paired environment credential and URL only when no credential is persisted", () => {
    withEnv({
      DAOBREW_DEVICE_CREDENTIAL: ENVIRONMENT_CREDENTIAL,
      DAOBREW_API_URL: "https://development.example.test/api/v1",
      DAOBREW_MOCK: undefined,
    }, () => {
      const runtime = createMcpRuntime({}, ["node", "index.js"]);

      assert.equal(runtime.isMock, false);
      assert.equal(runtime.deviceCredential, ENVIRONMENT_CREDENTIAL);
      assert.equal(runtime.apiUrl, "https://development.example.test/api/v1");
      assert.ok(runtime.client);
    });
  });

  it("does not treat legacy API keys or caller-selected UUIDs as backend identity", () => {
    withEnv({
      DAOBREW_DEVICE_CREDENTIAL: undefined,
      DAOBREW_API_URL: undefined,
      DAOBREW_MOCK: undefined,
    }, () => {
      const logs: string[] = [];
      const runtime = createMcpRuntime({
        api_url: "https://api.example.test/api/v1",
        api_key: "dbk_legacy_install",
        user_id: "8D6C05BD-9220-46F7-822C-23F0F0D2DA41",
      } as any, ["node", "index.js"], (message) => logs.push(message));

      assert.equal(runtime.isMock, true);
      assert.equal(runtime.deviceCredential, undefined);
      assert.equal(runtime.client, undefined);
      assert.match(runtime.mockReason ?? "", /device credential/i);
      assert.equal(logs.length, 1);
    });
  });

  it("fails closed into mock mode when the credential-bound URL is unsafe", () => {
    withEnv({
      DAOBREW_DEVICE_CREDENTIAL: undefined,
      DAOBREW_API_URL: undefined,
      DAOBREW_MOCK: undefined,
    }, () => {
      const logs: string[] = [];
      const runtime = createMcpRuntime({
        device_credential: PERSISTED_CREDENTIAL,
        api_url: "http://api.example.test/api/v1",
      }, ["node", "index.js"], (message) => logs.push(message));

      assert.equal(runtime.isMock, true);
      assert.equal(runtime.client, undefined);
      assert.match(runtime.mockReason ?? "", /HTTPS/);
      assert.equal(logs.length, 1);
    });
  });

  it("honors explicit mock and demo flags without constructing an authenticated client", () => {
    withEnv({ DAOBREW_MOCK: undefined }, () => {
      const runtime = createMcpRuntime({
        device_credential: PERSISTED_CREDENTIAL,
        api_url: "https://api.example.test/api/v1",
      }, ["node", "index.js", "--mock", "--demo"]);

      assert.equal(runtime.isMock, true);
      assert.equal(runtime.isDemo, true);
      assert.equal(runtime.client, undefined);
      assert.equal(runtime.mockReason, "mock mode requested");
    });
  });

  it("fails closed before MCP readiness when the credential-bound backend is incompatible", async () => {
    let checked = false;
    await assert.rejects(
      assertMcpRuntimeReady({
        isMock: false,
        isDemo: false,
        client: {
          assertBackendCompatible: async () => {
            checked = true;
            throw new Error("DaoBrew backend version is behind this client");
          },
        } as any,
      }),
      /backend version is behind/i,
    );
    assert.equal(checked, true);
  });
});
