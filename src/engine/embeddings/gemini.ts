import { EmbeddingProvider, Float16Vector } from "./provider.js";
import { resolveGeminiApiKey } from "../local-config.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_MODEL = "gemini-embedding-001";

/**
 * At non-default output dimensions (768 vs the model's native 3072) the API
 * does NOT return unit-normalized vectors, so we L2-normalize client-side to
 * keep cosine/HNSW distances correct. Fail-closed on a zero-norm vector.
 */
function l2Normalize(values: number[], index: number): number[] {
  let sumSquares = 0;
  for (const v of values) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (!Number.isFinite(norm) || norm === 0) {
    throw new Error(`Gemini embedding ${index} has zero norm; refusing to store an unnormalizable vector`);
  }
  return values.map((v) => v / norm);
}

export interface GeminiEmbeddingOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: GeminiEmbeddingOptions) {
    const apiKey = options?.apiKey ?? resolveGeminiApiKey() ?? undefined;
    if (!apiKey) {
      throw new Error("Gemini embeddings require GEMINI_API_KEY / GOOGLE_API_KEY or gemini_api_key in ~/.daobrew/config.json");
    }
    this.apiKey = apiKey;
    // Empty/whitespace env must fall through to the default, not build a malformed URL.
    this.model = options?.model ?? ((process.env.DAOBREW_EMBED_MODEL ?? "").trim() || DEFAULT_MODEL);
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  async embed(
    texts: string[],
    options?: { signal?: AbortSignal },
  ): Promise<Float16Vector[]> {
    if (texts.length === 0) return [];
    const vectors: Float16Vector[] = [];
    for (let index = 0; index < texts.length; index++) {
      vectors.push(await this.embedOne(texts[index], index, options?.signal));
    }
    return vectors;
  }

  private async embedOne(
    text: string,
    index: number,
    signal?: AbortSignal,
  ): Promise<Float16Vector> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${GEMINI_ENDPOINT}/${this.model}:embedContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal,
      });
    } catch (err: any) {
      throw new Error(`Gemini embedding request failed: ${err?.message ?? err}`);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`Gemini embedding request failed (${response.status}): ${detail}`);
    }
    const payload: any = await response.json();
    const values = payload?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Gemini embedding ${index} has ${values?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}`);
    }
    return l2Normalize(values, index);
  }
}
