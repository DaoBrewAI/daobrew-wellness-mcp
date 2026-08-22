import { describe, it, beforeEach, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import {
  createInternalServer,
  handleRequest,
  resolveInternalUserId,
} from "../src/engine/internal-server.js";

const ENV_KEYS = [
  "DAOBREW_CONFIG_FILE",
  "DAOBREW_GRAPH_STORE",
  "DAOBREW_INTERNAL_TOKEN",
  "DAOBREW_INTERNAL_USER",
  "DAOBREW_USER_ID",
] as const;

const PAYLOAD_CAMEL_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const PAYLOAD_SNAKE_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const ENV_UUID = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";
const INTERNAL_UUID = "783A7344-AE06-4125-8A37-D452A9C1C92F";
const CONFIG_UUID = "0B0CFD38-264B-4CBE-8B9C-5613428A9D25";

class FakeResponse {
  status = 0;
  headers: Record<string, string> = {};
  body = "";

  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
  }

  end(chunk?: string) {
    if (chunk) this.body += chunk;
  }
}

async function postInternal(path: string, payload: Record<string, any>, options?: Parameters<typeof handleRequest>[2]) {
  const req = Readable.from([JSON.stringify(payload)]) as any;
  req.method = "POST";
  req.url = path;
  req.headers = { "content-type": "application/json" };
  const res = new FakeResponse() as any;
  await handleRequest(req, res, options);
  return { status: res.status, json: JSON.parse(res.body) as any };
}

describe("internal server identity resolution", () => {
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-internal-server-test-config.json";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses payload userId, payload user_id, DAOBREW_USER_ID, DAOBREW_INTERNAL_USER, then config user_id", () => {
    process.env.DAOBREW_USER_ID = ENV_UUID;
    process.env.DAOBREW_INTERNAL_USER = INTERNAL_UUID;

    assert.deepStrictEqual(resolveInternalUserId({ userId: PAYLOAD_CAMEL_UUID.toLowerCase() }, { user_id: CONFIG_UUID }), {
      ok: true,
      userId: PAYLOAD_CAMEL_UUID,
    });
    assert.deepStrictEqual(resolveInternalUserId({ user_id: PAYLOAD_SNAKE_UUID.toLowerCase() }, { user_id: CONFIG_UUID }), {
      ok: true,
      userId: PAYLOAD_SNAKE_UUID,
    });
    assert.deepStrictEqual(resolveInternalUserId({}, { user_id: CONFIG_UUID }), {
      ok: true,
      userId: ENV_UUID,
    });

    delete process.env.DAOBREW_USER_ID;
    assert.deepStrictEqual(resolveInternalUserId({}, { user_id: CONFIG_UUID }), {
      ok: true,
      userId: INTERNAL_UUID,
    });

    delete process.env.DAOBREW_INTERNAL_USER;
    assert.deepStrictEqual(resolveInternalUserId({}, { user_id: CONFIG_UUID.toLowerCase() }), {
      ok: true,
      userId: CONFIG_UUID,
    });
  });

  it("rejects empty and local request identities instead of falling back", () => {
    process.env.DAOBREW_USER_ID = ENV_UUID;
    for (const candidate of ["", "   ", "local", "LOCAL"]) {
      const plan = resolveInternalUserId({ userId: candidate }, { user_id: CONFIG_UUID });
      assert.equal(plan.ok, false, `${JSON.stringify(candidate)} must fail closed`);
      if (!plan.ok) assert.match(plan.reason, /no canonical UUID identity/);
    }
  });

  it("returns 400 for identity-bearing ingest without a resolved identity", async () => {
    process.env.DAOBREW_GRAPH_STORE = "sqlite";

    const { status, json } = await postInternal("/internal/ingest/calendar", { rawEvents: [] });

    assert.equal(status, 400);
    assert.equal(json.status, "error");
    assert.match(json.error, /no canonical UUID identity/);
  });

  it("keeps allUsers fan-out independent of single-user identity", async () => {
    const server = createInternalServer({ discover: async () => [] });
    assert.ok(server);

    const { status, json } = await postInternal(
      "/internal/layer2/nightly",
      { allUsers: true },
      { discover: async () => [] },
    );

    assert.equal(status, 200);
    assert.equal(json.status, "ok");
    assert.equal(json.mode, "all_users");
    assert.deepEqual(json.results, []);
  });

  it("skips single-user layer2 CLI jobs without identity instead of writing local", () => {
    const out = execFileSync(process.execPath, [
      "dist/src/engine/internal-server.js",
      "--run",
      "layer2-nightly",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DAOBREW_CONFIG_FILE: "/nonexistent/daobrew-internal-server-test-config.json",
        DAOBREW_GRAPH_STORE: "sqlite",
        DAOBREW_INTERNAL_USER: "",
        DAOBREW_USER_ID: "",
      },
      encoding: "utf-8",
    });
    const json = JSON.parse(out);
    assert.equal(json.status, "skipped");
    assert.match(json.reason, /no canonical UUID identity/);
  });

  it("skips HTTP bootstrap without identity before enforcing postgres store", async () => {
    process.env.DAOBREW_GRAPH_STORE = "sqlite";

    const { status, json } = await postInternal("/internal/bootstrap", {});

    assert.equal(status, 200);
    assert.equal(json.status, "skipped");
    assert.match(json.reason, /no canonical UUID identity/);
  });

  it("skips CLI bootstrap without identity before enforcing postgres store", () => {
    const out = execFileSync(process.execPath, [
      "dist/src/engine/internal-server.js",
      "--run",
      "bootstrap",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DAOBREW_CONFIG_FILE: "/nonexistent/daobrew-internal-server-test-config.json",
        DAOBREW_GRAPH_STORE: "sqlite",
        DAOBREW_INTERNAL_USER: "",
        DAOBREW_USER_ID: "",
      },
      encoding: "utf-8",
    });
    const json = JSON.parse(out);
    assert.equal(json.status, "skipped");
    assert.match(json.reason, /no canonical UUID identity/);
  });
});
