import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildCurlRequestSpec, DaoBrewClient } from "../src/client.js";

const DEVICE_CREDENTIAL = "dbd_0123456789abcdefghijklmnopqrstuv";

async function withJsonServer(
  handler: (req: IncomingMessage) => unknown,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    try {
      const data = handler(req);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("DaoBrewClient", () => {
  it("constructor sets defaults", () => {
    const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL });
    assert.ok(client);
  });

  it("constructor accepts custom baseUrl and timeout", () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:8000/api/v1",
      timeoutMs: 5000,
    });
    assert.ok(client);
  });

  it("checks backend contract compatibility through the version route", async () => {
    await withJsonServer((req) => {
      assert.strictEqual(req.url, "/version");
      assert.strictEqual(req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
      return { contract_version: 1 };
    }, async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      assert.equal(await client.assertBackendCompatible(), 1);
    });
  });

  it("fails closed for older or malformed backend contract readiness", async () => {
    await withJsonServer(() => ({ contract_version: 0 }), async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      await assert.rejects(() => client.assertBackendCompatible(), /backend version is behind/i);
    });
    await withJsonServer(() => ({}), async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      await assert.rejects(() => client.assertBackendCompatible(), /version response is invalid/i);
    });
  });

  it("keeps the bearer credential out of curl argv", () => {
    const spec = buildCurlRequestSpec(
      {
        deviceCredential: DEVICE_CREDENTIAL,
        baseUrl: "https://api.example.test/api/v1",
      },
      "/device/health/samples",
      { method: "POST", body: JSON.stringify({ samples: [] }) },
    );
    assert.equal(spec.args.join(" ").includes(DEVICE_CREDENTIAL), false);
    assert.ok(spec.args.includes("@/dev/fd/3"));
    assert.equal(spec.headerInput, `Authorization: Bearer ${DEVICE_CREDENTIAL}\n`);
    assert.equal(spec.args.at(-1), "https://api.example.test/api/v1/device/health/samples");
  });

  it("getWellnessState rejects on network error", async () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:1", // Nothing listening
      timeoutMs: 1000,
    });
    await assert.rejects(
      () => client.getWellnessState(),
      (err: Error) => {
        assert.ok(err.message.length > 0);
        return true;
      }
    );
  });

  it("getElementDetail rejects on network error", async () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getElementDetail("wood"));
  });

  it("startSession rejects on network error", async () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.startSession("fire", "text"));
  });

  it("getSessionResult rejects on network error", async () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getSessionResult("sess_test"));
  });

  it("getSessionHistory rejects on network error", async () => {
    const client = new DaoBrewClient({
      deviceCredential: DEVICE_CREDENTIAL,
      baseUrl: "http://localhost:1",
      timeoutMs: 1000,
    });
    await assert.rejects(() => client.getSessionHistory(7));
  });

  it("getHealthkitHistory calls backend history endpoint", async () => {
    await withJsonServer((req) => {
      assert.strictEqual(req.url, "/device/health/history?metric=heart_rate&range=week");
      assert.strictEqual(req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
      return {
        metric: "heart_rate",
        range: "week",
        samples: [{ value: 72, timestamp: "2026-06-15T00:00:00+00:00" }],
        aggregated: { avg: 72, min: 72, max: 72 },
      };
    }, async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      const history = await client.getHealthkitHistory("heart_rate", "week");
      assert.strictEqual(history.metric, "heart_rate");
      assert.strictEqual(history.samples[0].value, 72);
      assert.strictEqual(history.aggregated.avg, 72);
    });
  });

  it("uses bearer-only principal selection and never sends X-Device-ID", async () => {
    await withJsonServer((req) => {
      assert.strictEqual(req.url, "/state/history?limit=1");
      assert.strictEqual(req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
      assert.strictEqual(req.headers["x-device-id"], undefined);
      return { states: [], total_count: 0, limit: 1 };
    }, async (baseUrl) => {
      const client = new DaoBrewClient({
        deviceCredential: DEVICE_CREDENTIAL,
        baseUrl,
        timeoutMs: 1000,
      });
      const history = await client.getStateHistory(1);
      assert.deepStrictEqual(history.states, []);
    });
  });

  it("streams a wide health backfill body instead of placing it in argv", async () => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          assert.strictEqual(req.url, "/device/health/samples");
          assert.strictEqual(req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
          const body = Buffer.concat(chunks).toString("utf8");
          assert.ok(body.length > 512 * 1024, "fixture must exceed the macOS argv ceiling");
          const parsed = JSON.parse(body);
          assert.strictEqual(parsed.samples.length, 6_000);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            data: { samples_received: parsed.samples.length, message: "ok" },
          }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    try {
      const samples = Array.from({ length: 6_000 }, (_, index) => ({
        metric_type: "heart_rate" as const,
        value: 60 + (index % 40),
        unit: "bpm",
        start_time: "2026-07-15T12:00:00.000Z",
        end_time: "2026-07-15T12:00:00.000Z",
        source: "oura",
      }));
      const client = new DaoBrewClient({
        deviceCredential: DEVICE_CREDENTIAL,
        baseUrl: `http://127.0.0.1:${address.port}`,
        timeoutMs: 5_000,
      });
      const result = await client.pushHealthSamples(samples);
      assert.strictEqual(result.samples_received, 6_000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("requests a server-owned causal run without a client identity payload", async () => {
    let body = "";
    const server = createServer((req, res) => {
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { body += chunk; });
      req.on("end", () => {
        assert.strictEqual(req.url, "/causal/run");
        assert.strictEqual(req.headers.authorization, `Bearer ${DEVICE_CREDENTIAL}`);
        assert.strictEqual(req.headers["x-device-id"], undefined);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          data: {
            principal: { user_id: "server-user", device_id: "server-device" },
            summary: { status: "no_signal" },
          },
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    try {
      const client = new DaoBrewClient({
        deviceCredential: DEVICE_CREDENTIAL,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
      const result = await client.runCausalGraph();
      assert.strictEqual(result.summary.status, "no_signal");
      assert.equal(body, "");
      assert.equal(/user_id|device_id|tenant/i.test(body), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("getStateHistory passes optional limit and time bounds", async () => {
    await withJsonServer((req) => {
      assert.strictEqual(req.url, "/state/history?limit=5&start_ts=100&end_ts=200");
      return {
        states: [
          {
            bucket_ts: 100,
            yin_score: 40,
            yang_score: 75,
            category: "pushing_it",
            source_quality: "data_verified",
            updated_at_ts: 101,
          },
        ],
        total_count: 1,
        limit: 5,
      };
    }, async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      const history = await client.getStateHistory(5, 100, 200);
      assert.strictEqual(history.total_count, 1);
      assert.strictEqual(history.states[0].category, "pushing_it");
    });
  });

  it("getStateHistory omits query parameters when unspecified", async () => {
    await withJsonServer((req) => {
      assert.strictEqual(req.url, "/state/history");
      return { states: [], total_count: 0, limit: 10 };
    }, async (baseUrl) => {
      const client = new DaoBrewClient({ deviceCredential: DEVICE_CREDENTIAL, baseUrl, timeoutMs: 1000 });
      const history = await client.getStateHistory();
      assert.deepStrictEqual(history.states, []);
    });
  });

});
