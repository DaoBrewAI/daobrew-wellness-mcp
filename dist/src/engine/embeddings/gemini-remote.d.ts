import { type CredentialBoundClientPlan } from "../../identity.js";
import type { EmbeddingProvider, Float16Vector } from "./provider.js";
export type RemoteGeminiEmbeddingErrorCode = "provider_unauthenticated" | "provider_rate_limited" | "provider_unavailable" | "malformed_response" | "timeout";
export declare class RemoteGeminiEmbeddingError extends Error {
    readonly code: RemoteGeminiEmbeddingErrorCode;
    constructor(code: RemoteGeminiEmbeddingErrorCode);
}
export interface RemoteGeminiEmbeddingOptions {
    credentialPlan?: CredentialBoundClientPlan;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    requestGroupId?: string;
}
export declare class RemoteGeminiEmbeddingProvider implements EmbeddingProvider {
    private readonly credentialPlan;
    private readonly fetchImpl;
    private readonly timeoutMs;
    private readonly requestGroupId;
    constructor(options?: RemoteGeminiEmbeddingOptions);
    embed(texts: string[]): Promise<Float16Vector[]>;
    private embedBatch;
}
