export type Float16Vector = number[];
export interface EmbeddingProvider {
    embed(texts: string[], options?: {
        signal?: AbortSignal;
    }): Promise<Float16Vector[]>;
}
