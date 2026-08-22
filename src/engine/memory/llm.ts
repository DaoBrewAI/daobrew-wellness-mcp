import { resolveGeminiApiKey } from "../local-config.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS = 1_024;
export const GEMINI_TEXT_MAX_OUTPUT_TOKENS = 16_384;
export const GEMINI_TEXT_MAX_RESPONSE_BYTES = 1_048_576;

export interface TextGenerationProvider {
  generateJson(prompt: string): Promise<unknown>;
  callsUsed(): number;
}

export interface GeminiTextGenerationOptions {
  signal?: AbortSignal;
}

export interface RawTextGenerationProvider extends TextGenerationProvider {
  generateRawJson(
    prompt: string,
    options?: GeminiTextGenerationOptions,
  ): Promise<string>;
}

export interface GeminiTextProviderOptions {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  maxResponseBytes?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

export class GeminiTextProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`Gemini text request failed (${status})`);
    this.name = "GeminiTextProviderHttpError";
  }
}

export class GeminiTextProviderResponseError extends Error {
  constructor() {
    super("Gemini text response wrapper was invalid");
    this.name = "GeminiTextProviderResponseError";
  }
}

class GeminiTextProviderResponseTooLargeError extends Error {
  constructor() {
    super("Gemini text response exceeded bounded byte limit");
    this.name = "GeminiTextProviderResponseTooLargeError";
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (response.body === null || response.body === undefined) return;
  try {
    await response.body.cancel();
  } catch {
    // Cancellation is best-effort after the response has already failed.
  }
}

async function readBoundedResponseText(
  response: Response,
  maxResponseBytes: number,
): Promise<string> {
  if (response.body === null || response.body === undefined) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      if (totalBytes + chunk.byteLength > maxResponseBytes) {
        try {
          await reader.cancel();
        } catch {
          // The bounded failure below remains authoritative.
        }
        throw new GeminiTextProviderResponseTooLargeError();
      }
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have released during cancellation.
    }
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export class GeminiTextProvider implements RawTextGenerationProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #maxOutputTokens: number;
  readonly #maxResponseBytes: number;
  readonly #temperature: number;
  readonly #fetchImpl: typeof fetch;
  #calls = 0;

  constructor(options: GeminiTextProviderOptions = {}) {
    const key = options.apiKey ?? resolveGeminiApiKey() ?? undefined;
    if (!key) throw new Error("Gemini text generation requires GEMINI_API_KEY / GOOGLE_API_KEY or gemini_api_key in ~/.daobrew/config.json");
    const maxOutputTokens = options.maxOutputTokens
      ?? GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS;
    if (
      !Number.isSafeInteger(maxOutputTokens)
      || maxOutputTokens <= 0
      || maxOutputTokens > GEMINI_TEXT_MAX_OUTPUT_TOKENS
    ) {
      throw new RangeError(
        `Gemini maxOutputTokens must be between 1 and ${GEMINI_TEXT_MAX_OUTPUT_TOKENS}`,
      );
    }
    const maxResponseBytes = options.maxResponseBytes
      ?? GEMINI_TEXT_MAX_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(maxResponseBytes)
      || maxResponseBytes <= 0
      || maxResponseBytes > GEMINI_TEXT_MAX_RESPONSE_BYTES
    ) {
      throw new RangeError(
        `Gemini maxResponseBytes must be between 1 and ${GEMINI_TEXT_MAX_RESPONSE_BYTES}`,
      );
    }
    this.#apiKey = key;
    this.#model = options.model ?? process.env.DAOBREW_SNAPSHOT_MODEL ?? DEFAULT_MODEL;
    this.#maxOutputTokens = maxOutputTokens;
    this.#maxResponseBytes = maxResponseBytes;
    this.#temperature = options.temperature ?? 0.2;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  callsUsed(): number {
    return this.#calls;
  }

  async generateRawJson(
    prompt: string,
    options: GeminiTextGenerationOptions = {},
  ): Promise<string> {
    const url = `${GEMINI_ENDPOINT}/${this.#model}:generateContent`;
    this.#calls += 1;
    const response = await this.#fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.#apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: this.#temperature,
          maxOutputTokens: this.#maxOutputTokens,
        },
      }),
      signal: options.signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new GeminiTextProviderHttpError(response.status);
    }
    const responseText = await readBoundedResponseText(
      response,
      this.#maxResponseBytes,
    );
    let payload: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    try {
      payload = JSON.parse(responseText) as typeof payload;
    } catch {
      throw new GeminiTextProviderResponseError();
    }
    return payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
  }

  async generateJson(prompt: string): Promise<unknown> {
    const text = await this.generateRawJson(prompt);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Gemini did not return valid JSON");
    }
  }
}
