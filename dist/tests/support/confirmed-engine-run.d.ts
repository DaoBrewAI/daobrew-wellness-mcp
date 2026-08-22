import { type EngineRunOptions, type EngineRunResult } from "../../src/engine/run.js";
import { type BiometricsClient } from "../../src/engine/signals/biometrics.js";
import type { TextGenerationProvider } from "../../src/engine/memory/llm.js";
import type { TripletInput } from "../../src/engine/triplet.js";
export interface EngineTestRunOptions extends EngineRunOptions {
    userId?: string;
    client?: BiometricsClient;
    semanticEmbedText?: (text: string) => Promise<number[]>;
    proposerLlm?: TextGenerationProvider;
    testInput?: TripletInput;
}
export declare function runEngineOnce(options?: EngineTestRunOptions): Promise<EngineRunResult>;
