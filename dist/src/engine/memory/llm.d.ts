export declare const GEMINI_TEXT_DEFAULT_MAX_OUTPUT_TOKENS = 1024;
export declare const GEMINI_TEXT_MAX_OUTPUT_TOKENS = 16384;
export declare const GEMINI_TEXT_MAX_RESPONSE_BYTES = 1048576;
export interface TextGenerationProvider {
    generateJson(prompt: string): Promise<unknown>;
    callsUsed(): number;
}
export interface GeminiTextGenerationOptions {
    signal?: AbortSignal;
}
export interface RawTextGenerationProvider extends TextGenerationProvider {
    generateRawJson(prompt: string, options?: GeminiTextGenerationOptions): Promise<string>;
}
export interface GeminiTextProviderOptions {
    apiKey?: string;
    model?: string;
    maxOutputTokens?: number;
    maxResponseBytes?: number;
    temperature?: number;
    fetchImpl?: typeof fetch;
}
export declare class GeminiTextProviderHttpError extends Error {
    readonly status: number;
    constructor(status: number);
}
export declare class GeminiTextProviderResponseError extends Error {
    constructor();
}
export declare class GeminiTextProvider implements RawTextGenerationProvider {
    #private;
    constructor(options?: GeminiTextProviderOptions);
    callsUsed(): number;
    generateRawJson(prompt: string, options?: GeminiTextGenerationOptions): Promise<string>;
    generateJson(prompt: string): Promise<unknown>;
}
