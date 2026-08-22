import { afterEach, beforeEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GeminiTextProvider,
  GeminiTextProviderHttpError,
} from "../src/engine/memory/llm.js";
import { GeminiEmbeddingProvider } from "../src/engine/embeddings/gemini.js";
import { readLocalConfig, resolveGeminiApiKey, resolveGranolaToken } from "../src/engine/local-config.js";

function geminiResponse(obj: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
  }), { status: 200 });
}

function geminiRawResponse(text: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200 });
}

describe("Gemini text provider", () => {
  it("posts to generateContent and parses the JSON payload", async () => {
    const calls: Array<{ url: string; body: any; headers: any }> = [];
    const provider = new GeminiTextProvider({
      apiKey: "test-key",
      fetchImpl: (async (url: any, init: any) => {
        calls.push({
          url: String(url),
          body: JSON.parse(init.body),
          headers: init.headers,
        });
        return geminiResponse({ hello: "world" });
      }) as typeof fetch,
    });
    const out = await provider.generateJson("prompt text");
    assert.deepEqual(out, { hello: "world" });
    assert.equal(provider.callsUsed(), 1);
    assert.match(calls[0].url, /:generateContent/);
    assert.ok(!calls[0].url.includes("test-key"));
    assert.equal(calls[0].headers["x-goog-api-key"], "test-key");
    assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 1_024);
    assert.equal(calls[0].body.contents[0].parts[0].text, "prompt text");
  });

  it("returns exact raw model JSON while keeping generateJson compatible", async () => {
    const raw = ' \n{ "hello": "world", "items": [1, 2] }\n ';
    const provider = new GeminiTextProvider({
      apiKey: "k",
      fetchImpl: (async () => geminiRawResponse(raw)) as typeof fetch,
    });

    assert.equal(await provider.generateRawJson("raw prompt"), raw);
    assert.deepEqual(await provider.generateJson("parsed prompt"), {
      hello: "world",
      items: [1, 2],
    });
    assert.equal(provider.callsUsed(), 2);
  });

  it("passes an AbortSignal to fetch and observes cancellation", async () => {
    let observedAbort = false;
    const provider = new GeminiTextProvider({
      apiKey: "k",
      fetchImpl: ((_url: any, init: any) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          observedAbort = true;
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })) as typeof fetch,
    });
    const controller = new AbortController();
    const pending = provider.generateRawJson("p", { signal: controller.signal });
    controller.abort();

    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(observedAbort, true);
  });

  it("throws typed sanitized HTTP errors without response or key material", async () => {
    for (const status of [401, 403, 429, 500]) {
      const provider = new GeminiTextProvider({
        apiKey: "secret-test-key",
        fetchImpl: (async () => ({
          ok: false,
          status,
          text: async () => "private upstream response detail",
        })) as unknown as typeof fetch,
      });
      await assert.rejects(
        () => provider.generateRawJson("p"),
        (error: unknown) => {
          assert.ok(error instanceof GeminiTextProviderHttpError);
          assert.equal(error.status, status);
          assert.ok(!error.message.includes("private upstream response detail"));
          assert.ok(!error.message.includes("secret-test-key"));
          return true;
        },
      );
    }
  });

  it("cancels a non-OK response body before throwing its typed status", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => { canceled = true; },
    });
    const provider = new GeminiTextProvider({
      apiKey: "secret-test-key",
      fetchImpl: (async () => ({
        ok: false,
        status: 429,
        body,
      })) as unknown as typeof fetch,
    });

    await assert.rejects(
      () => provider.generateRawJson("p"),
      (error: unknown) => (
        error instanceof GeminiTextProviderHttpError
        && error.status === 429
      ),
    );
    assert.equal(canceled, true);
  });

  it("rejects and cancels an oversized streamed response wrapper", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(80));
        controller.enqueue(new Uint8Array(80));
      },
      cancel: () => { canceled = true; },
    });
    const options = {
      apiKey: "secret-test-key",
      maxResponseBytes: 100,
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        body,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "{}" }] } }],
        }),
      })) as unknown as typeof fetch,
    };
    const provider = new GeminiTextProvider(options);

    await assert.rejects(
      () => provider.generateRawJson("p"),
      /response exceeded bounded byte limit/,
    );
    assert.equal(canceled, true);
  });

  it("sanitizes malformed successful wrapper JSON without exposing its content", async () => {
    const secret = "secret-wrapper-fragment";
    const provider = new GeminiTextProvider({
      apiKey: "secret-test-key",
      fetchImpl: (async () => new Response(
        `{"candidate":"${secret}" trailing-private-bytes`,
        { status: 200 },
      )) as typeof fetch,
    });

    await assert.rejects(
      () => provider.generateRawJson("p"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "GeminiTextProviderResponseError");
        assert.equal(error.message, "Gemini text response wrapper was invalid");
        assert.ok(!error.message.includes(secret));
        assert.ok(!error.message.includes("trailing-private-bytes"));
        return true;
      },
    );
  });

  it("throws when the model output is not JSON", async () => {
    const provider = new GeminiTextProvider({
      apiKey: "k",
      fetchImpl: (async () => geminiRawResponse("not json")) as typeof fetch,
    });
    await assert.rejects(() => provider.generateJson("p"), /did not return valid JSON/);
  });

  it("throws at construction when no api key is available", () => {
    const savedGemini = process.env.GEMINI_API_KEY;
    const savedGoogle = process.env.GOOGLE_API_KEY;
    const savedConfigFile = process.env.DAOBREW_CONFIG_FILE;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    // Point at a nonexistent config so a real ~/.daobrew/config.json with a
    // gemini_api_key cannot flip this test on developer machines.
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
    try {
      assert.throws(() => new GeminiTextProvider({}), /GEMINI_API_KEY/);
    } finally {
      if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
      if (savedGoogle !== undefined) process.env.GOOGLE_API_KEY = savedGoogle;
      if (savedConfigFile !== undefined) process.env.DAOBREW_CONFIG_FILE = savedConfigFile;
      else delete process.env.DAOBREW_CONFIG_FILE;
    }
  });
});

describe("Gemini providers fall back to local config", () => {
  const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY"] as const;
  let savedEnv: Record<string, string | undefined>;
  let workDir: string;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    workDir = mkdtempSync(join(tmpdir(), "daobrew-gemini-fallback-"));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  function writeConfig(obj: unknown): void {
    const configFile = join(workDir, "config.json");
    writeFileSync(configFile, JSON.stringify(obj));
    process.env.DAOBREW_CONFIG_FILE = configFile;
  }

  it("GeminiTextProvider falls back to gemini_api_key in config.json", async () => {
    writeConfig({ gemini_api_key: "gm_cfg" });
    const calls: Array<{ url: string; headers: any }> = [];
    const provider = new GeminiTextProvider({
      fetchImpl: (async (url: any, init: any) => {
        calls.push({ url: String(url), headers: init.headers });
        return geminiResponse({ ok: true });
      }) as typeof fetch,
    });
    await provider.generateJson("p");
    assert.ok(!calls[0].url.includes("gm_cfg"));
    assert.equal(calls[0].headers["x-goog-api-key"], "gm_cfg");
  });

  it("GeminiEmbeddingProvider falls back to gemini_api_key in config.json", async () => {
    writeConfig({ gemini_api_key: "gm_cfg" });
    const headers: any[] = [];
    const provider = new GeminiEmbeddingProvider({
      fetchImpl: (async (_url: any, init: any) => {
        headers.push(init.headers);
        return {
          ok: true,
          status: 200,
          json: async () => ({ embedding: { values: new Array(768).fill(1) } }),
        } as unknown as Response;
      }) as typeof fetch,
    });
    await provider.embed(["t"]);
    assert.equal(headers[0]["x-goog-api-key"], "gm_cfg");
  });

  it("env GEMINI_API_KEY still wins over the config file", async () => {
    writeConfig({ gemini_api_key: "gm_cfg" });
    process.env.GEMINI_API_KEY = "gm_env";
    const headers: any[] = [];
    const provider = new GeminiTextProvider({
      fetchImpl: (async (_url: any, init: any) => {
        headers.push(init.headers);
        return geminiResponse({ ok: true });
      }) as typeof fetch,
    });
    await provider.generateJson("p");
    assert.equal(headers[0]["x-goog-api-key"], "gm_env");
  });

  it("GeminiEmbeddingProvider still throws when no key exists anywhere", () => {
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
    assert.throws(() => new GeminiEmbeddingProvider(), /GEMINI_API_KEY/);
  });
});

describe("local config reader", () => {
  const ENV_KEYS = ["DAOBREW_CONFIG_FILE", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GRANOLA_API_TOKEN"] as const;
  let savedEnv: Record<string, string | undefined>;
  let workDir: string;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    workDir = mkdtempSync(join(tmpdir(), "daobrew-local-config-"));
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it("reads gemini_api_key and granola_api_token from the file named by DAOBREW_CONFIG_FILE", () => {
    const configFile = join(workDir, "config.json");
    writeFileSync(configFile, JSON.stringify({
      gemini_api_key: "gm_from_config",
      granola_api_token: "gr_from_config",
    }));
    process.env.DAOBREW_CONFIG_FILE = configFile;

    const config = readLocalConfig();
    assert.equal(config.gemini_api_key, "gm_from_config");
    assert.equal(config.granola_api_token, "gr_from_config");
    assert.equal(resolveGeminiApiKey(), "gm_from_config");
    assert.equal(resolveGranolaToken(), "gr_from_config");
  });

  it("prefers env vars over the config file", () => {
    process.env.DAOBREW_CONFIG_FILE = join(workDir, "does-not-exist.json");
    process.env.GEMINI_API_KEY = "gm_env";
    assert.equal(resolveGeminiApiKey(), "gm_env");
  });

  it("never throws: missing config resolves to null/{} and malformed JSON reads as {}", () => {
    process.env.DAOBREW_CONFIG_FILE = join(workDir, "does-not-exist.json");
    assert.equal(resolveGeminiApiKey(), null);
    assert.equal(resolveGranolaToken(), null);
    assert.deepEqual(readLocalConfig(), {});

    const malformedFile = join(workDir, "malformed.json");
    writeFileSync(malformedFile, "{ not valid json !!");
    process.env.DAOBREW_CONFIG_FILE = malformedFile;
    assert.deepEqual(readLocalConfig(), {});
  });
});
