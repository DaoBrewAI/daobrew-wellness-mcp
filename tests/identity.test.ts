import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { clientOptionsFor, resolveUserId } from "../src/identity.js";

const FLAG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const ENV_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const CONFIG_UUID = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";

describe("shared identity resolver", () => {
  let savedUserId: string | undefined;
  let savedApiKey: string | undefined;
  let savedApiUrl: string | undefined;

  beforeEach(() => {
    savedUserId = process.env.DAOBREW_USER_ID;
    savedApiKey = process.env.DAOBREW_API_KEY;
    savedApiUrl = process.env.DAOBREW_API_URL;
    delete process.env.DAOBREW_USER_ID;
    delete process.env.DAOBREW_API_KEY;
    delete process.env.DAOBREW_API_URL;
  });

  afterEach(() => {
    if (savedUserId === undefined) delete process.env.DAOBREW_USER_ID;
    else process.env.DAOBREW_USER_ID = savedUserId;
    if (savedApiKey === undefined) delete process.env.DAOBREW_API_KEY;
    else process.env.DAOBREW_API_KEY = savedApiKey;
    if (savedApiUrl === undefined) delete process.env.DAOBREW_API_URL;
    else process.env.DAOBREW_API_URL = savedApiUrl;
  });

  it("resolves explicit flag before env and config", () => {
    process.env.DAOBREW_USER_ID = ENV_UUID;

    assert.deepStrictEqual(
      resolveUserId({ user_id: CONFIG_UUID }, FLAG_UUID),
      { ok: true, userId: FLAG_UUID },
    );
  });

  it("resolves env before config when no explicit flag is provided", () => {
    process.env.DAOBREW_USER_ID = ENV_UUID;

    assert.deepStrictEqual(
      resolveUserId({ user_id: CONFIG_UUID }),
      { ok: true, userId: ENV_UUID },
    );
  });

  it("resolves config when explicit and env are absent", () => {
    assert.deepStrictEqual(
      resolveUserId({ user_id: CONFIG_UUID }),
      { ok: true, userId: CONFIG_UUID },
    );
  });

  it("trims and normalizes the winning identity source", () => {
    assert.deepStrictEqual(
      resolveUserId({ user_id: `  ${CONFIG_UUID.toLowerCase()}  ` }),
      { ok: true, userId: CONFIG_UUID },
    );
  });

  it("fails closed for empty, local, api-key, and non-UUID identities", () => {
    for (const candidate of ["", "   ", "local", "LOCAL", "dbk_test", "apikey:dbk_test", "config-user"]) {
      const plan = resolveUserId({ user_id: candidate });
      assert.equal(plan.ok, false);
      assert.match(plan.reason, /no canonical UUID identity/);
    }
  });

  it("does not let an explicit empty identity fall through to env or config", () => {
    process.env.DAOBREW_USER_ID = ENV_UUID;

    for (const explicit of ["", "   "]) {
      const plan = resolveUserId({ user_id: CONFIG_UUID }, explicit);
      assert.equal(plan.ok, false);
      assert.match(plan.reason, /no canonical UUID identity/);
    }
  });

  it("builds client options with the user id as X-Device-ID identity", () => {
    const options = clientOptionsFor({ api_url: "https://api.example.test" }, CONFIG_UUID);

    assert.deepStrictEqual(options, {
      apiKey: "",
      baseUrl: "https://api.example.test",
      deviceId: CONFIG_UUID,
    });
  });

  it("keeps api key auth-only and lets env override config URL/key", () => {
    process.env.DAOBREW_API_KEY = "env-key";
    process.env.DAOBREW_API_URL = "https://env.example.test";

    const options = clientOptionsFor(
      { api_key: "config-key", api_url: "https://config.example.test" },
      CONFIG_UUID,
    );

    assert.deepStrictEqual(options, {
      apiKey: "env-key",
      baseUrl: "https://env.example.test",
      deviceId: CONFIG_UUID,
    });
  });
});
