import { EmbeddingProvider, Float16Vector } from "./provider.js";
export interface GeminiEmbeddingOptions {
    apiKey?: string;
    model?: string;
    fetchImpl?: typeof fetch;
}
export declare class GeminiEmbeddingProvider implements EmbeddingProvider {
    private readonly apiKey;
    private readonly model;
    private readonly fetchImpl;
    constructor(options?: GeminiEmbeddingOptions);
    embed(texts: string[], options?: {
        signal?: AbortSignal;
    }): Promise<Float16Vector[]>;
    private embedOne;
}
