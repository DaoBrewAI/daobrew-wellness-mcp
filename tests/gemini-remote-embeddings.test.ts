import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  RemoteGeminiEmbeddingError,
  RemoteGeminiEmbeddingProvider,
} from "../src/engine/embeddings/gemini-remote.js";

const CREDENTIAL = "dbd_fixture_remote_embedding_credential_1234567890";
const ENROLLMENT = {
  ok: true as const,
  apiUrl: "https://api.daobrew.example/api/v1",
  deviceCredential: CREDENTIAL,
};

function vector(first: number, second = 0): number[] {
  return [first, second, ...new Array(766).fill(0)];
}

function response(vectors: number[][], status = 200): Response {
  return new Response(JSON.stringify({
    status: "success",
    data: { vectors, model: "gemini-fixture" },
  }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RemoteGeminiEmbeddingProvider", () => {
  it("posts one authenticated batch and L2-normalizes exact 768-dimensional vectors", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new RemoteGeminiEmbeddingProvider({
      credentialPlan: ENROLLMENT,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return response([vector(3, 4), vector(0, 7)]);
      }) as typeof fetch,
    });

    const result = await provider.embed(["first", "second"]);

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.url,
      "https://api.daobrew.example/api/v1/device/llm/gemini/embed",
    );
    assert.equal(calls[0]?.init?.method, "POST");
    assert.equal(
      (calls[0]?.init?.headers as Record<string, string>).Authorization,
      `Bearer ${CREDENTIAL}`,
    );
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
      texts: ["first", "second"],
      output_dimensionality: 768,
    });
    assert.equal(result.length, 2);
    assert.ok(Math.abs(result[0]![0]! - 0.6) < 1e-12);
    assert.ok(Math.abs(result[0]![1]! - 0.8) < 1e-12);
    assert.equal(result[1]![1], 1);
  });

  it("splits at 64 texts and preserves input/vector order", async () => {
    const bodies: Array<{ texts: string[]; request_group_id?: string }> = [];
    const provider = new RemoteGeminiEmbeddingProvider({
      credentialPlan: ENROLLMENT,
      requestGroupId: "refresh_0123456789abcdef",
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          texts: string[];
          request_group_id?: string;
        };
        bodies.push(body);
        return response(body.texts.map((_text, index) => vector(index + 1)));
      }) as typeof fetch,
    });

    const result = await provider.embed(
      Array.from({ length: 65 }, (_, index) => `text-${index}`),
    );

    assert.deepEqual(bodies.map((body) => body.texts.length), [64, 1]);
    assert.deepEqual(
      bodies.map((body) => body.request_group_id),
      ["refresh_0123456789abcdef", "refresh_0123456789abcdef"],
    );
    assert.equal(result.length, 65);
    assert.ok(result.every((entry) => entry[0] === 1));
  });

  it("throws a typed malformed-response error on dimension mismatch", async () => {
    const provider = new RemoteGeminiEmbeddingProvider({
      credentialPlan: ENROLLMENT,
      fetchImpl: (async () => response([new Array(767).fill(1)])) as typeof fetch,
    });

    await assert.rejects(
      () => provider.embed(["first"]),
      (error: unknown) => error instanceof RemoteGeminiEmbeddingError
        && error.code === "malformed_response",
    );
  });

  for (const [status, code] of [
    [429, "provider_rate_limited"],
    [503, "provider_unavailable"],
  ] as const) {
    it(`maps HTTP ${status} without leaking the bearer`, async () => {
      const provider = new RemoteGeminiEmbeddingProvider({
        credentialPlan: ENROLLMENT,
        fetchImpl: (async () => new Response(
          `private upstream failure ${CREDENTIAL}`,
          { status },
        )) as typeof fetch,
      });

      let caught: unknown;
      try {
        await provider.embed(["first"]);
      } catch (error) {
        caught = error;
      }
      assert.ok(caught instanceof RemoteGeminiEmbeddingError);
      assert.equal(caught.code, code);
      assert.ok(!caught.message.includes(CREDENTIAL));
    });
  }

  it("returns an empty result without resolving or calling the network", async () => {
    let calls = 0;
    const provider = new RemoteGeminiEmbeddingProvider({
      credentialPlan: ENROLLMENT,
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("must not be reached");
      }) as typeof fetch,
    });

    assert.deepEqual(await provider.embed([]), []);
    assert.equal(calls, 0);
  });

  it("fails closed on a zero-norm vector", async () => {
    const provider = new RemoteGeminiEmbeddingProvider({
      credentialPlan: ENROLLMENT,
      fetchImpl: (async () => response([new Array(768).fill(0)])) as typeof fetch,
    });

    await assert.rejects(
      () => provider.embed(["first"]),
      (error: unknown) => error instanceof RemoteGeminiEmbeddingError
        && error.code === "malformed_response",
    );
  });
});
