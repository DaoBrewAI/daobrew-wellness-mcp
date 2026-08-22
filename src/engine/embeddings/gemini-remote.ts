import {
  credentialBoundApiEndpoint,
  resolveCredentialBoundClient,
  type CredentialBoundClientPlan,
} from "../../identity.js";
import { readLocalConfig } from "../local-config.js";
import { assertTaskMapStrictJsonSyntaxAndUniqueKeys } from "../taskmap/mention-extraction.js";
import type { EmbeddingProvider, Float16Vector } from "./provider.js";

const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 64;
const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;
const DEFAULT_TIMEOUT_MS = 60_000;
const REQUEST_GROUP_ID = /^[A-Za-z0-9_-]{16,96}$/;

export type RemoteGeminiEmbeddingErrorCode =
  | "provider_unauthenticated"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "malformed_response"
  | "timeout";

export class RemoteGeminiEmbeddingError extends Error {
  constructor(readonly code: RemoteGeminiEmbeddingErrorCode) {
    super(`Remote Gemini embeddings unavailable: ${code}`);
    this.name = "RemoteGeminiEmbeddingError";
  }
}

export interface RemoteGeminiEmbeddingOptions {
  credentialPlan?: CredentialBoundClientPlan;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  requestGroupId?: string;
}

function l2Normalize(values: number[]): Float16Vector {
  let sumSquares = 0;
  for (const value of values) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new RemoteGeminiEmbeddingError("malformed_response");
  }
  return values.map((value) => value / norm);
}

function responseError(status: number): RemoteGeminiEmbeddingError {
  if (status === 401 || status === 403) {
    return new RemoteGeminiEmbeddingError("provider_unauthenticated");
  }
  if (status === 429) {
    return new RemoteGeminiEmbeddingError("provider_rate_limited");
  }
  return new RemoteGeminiEmbeddingError("provider_unavailable");
}

function parseVectors(responseText: string, expectedCount: number): Float16Vector[] {
  let payload: unknown;
  try {
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(responseText);
    payload = JSON.parse(responseText);
  } catch {
    throw new RemoteGeminiEmbeddingError("malformed_response");
  }
  if (payload === null || Array.isArray(payload) || typeof payload !== "object") {
    throw new RemoteGeminiEmbeddingError("malformed_response");
  }
  const data = (payload as Record<string, unknown>).data;
  if (
    (payload as Record<string, unknown>).status !== "success"
    || data === null
    || Array.isArray(data)
    || typeof data !== "object"
  ) {
    throw new RemoteGeminiEmbeddingError("malformed_response");
  }
  const vectors = (data as Record<string, unknown>).vectors;
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new RemoteGeminiEmbeddingError("malformed_response");
  }
  return vectors.map((candidate) => {
    if (
      !Array.isArray(candidate)
      || candidate.length !== EMBEDDING_DIMENSIONS
      || candidate.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    return l2Normalize(candidate as number[]);
  });
}

export class RemoteGeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly credentialPlan: Extract<CredentialBoundClientPlan, { ok: true }>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly requestGroupId: string | undefined;

  constructor(options: RemoteGeminiEmbeddingOptions = {}) {
    const plan = options.credentialPlan
      ?? resolveCredentialBoundClient(readLocalConfig());
    if (!plan.ok) {
      throw new RemoteGeminiEmbeddingError("provider_unauthenticated");
    }
    this.credentialPlan = plan;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs !== undefined
      && Number.isFinite(options.timeoutMs)
      && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;
    if (
      options.requestGroupId !== undefined
      && !REQUEST_GROUP_ID.test(options.requestGroupId)
    ) {
      throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    this.requestGroupId = options.requestGroupId;
  }

  async embed(texts: string[]): Promise<Float16Vector[]> {
    if (texts.length === 0) return [];
    const vectors: Float16Vector[] = [];
    for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
      const batch = texts.slice(start, start + MAX_BATCH_SIZE);
      vectors.push(...await this.embedBatch(batch));
    }
    return vectors;
  }

  private async embedBatch(texts: string[]): Promise<Float16Vector[]> {
    const abortController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        abortController.abort();
        reject(new RemoteGeminiEmbeddingError("timeout"));
      }, this.timeoutMs);
    });
    timer?.unref();

    let responseText: string;
    try {
      responseText = await Promise.race([
        (async () => {
          const response = await this.fetchImpl(
            credentialBoundApiEndpoint(
              this.credentialPlan.apiUrl,
              "/api/v1/device/llm/gemini/embed",
            ),
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.credentialPlan.deviceCredential}`,
              },
              body: JSON.stringify({
                texts,
                output_dimensionality: EMBEDDING_DIMENSIONS,
                ...(this.requestGroupId === undefined
                  ? {}
                  : { request_group_id: this.requestGroupId }),
              }),
              signal: abortController.signal,
            },
          );
          if (!response.ok) throw responseError(response.status);
          const declaredLength = Number(response.headers.get("Content-Length"));
          if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
            throw new RemoteGeminiEmbeddingError("malformed_response");
          }
          return response.text();
        })(),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof RemoteGeminiEmbeddingError) throw error;
      if (abortController.signal.aborted) {
        throw new RemoteGeminiEmbeddingError("timeout");
      }
      throw new RemoteGeminiEmbeddingError("provider_unavailable");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) {
      throw new RemoteGeminiEmbeddingError("malformed_response");
    }
    return parseVectors(responseText, texts.length);
  }
}
