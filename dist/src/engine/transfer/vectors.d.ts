import { EmbeddingProvider, Float16Vector } from "../embeddings/provider.js";
export interface TriggerBasisInput {
    /** Selected stress pattern key on the armed root (e.g. "overdrive"). */
    stressPattern: string;
    /** Root cause class (today always "productivity"). */
    rootCauseClass: string;
    /** Closed-vocabulary context terms (linked pattern keys), NOT prose. */
    contextTerms: string[];
}
export declare function canonicalTriggerText(input: TriggerBasisInput): string;
export interface ProfileBasisInput {
    /** Pattern keys dominating the user's active threads. */
    dominantPatterns: string[];
    /** Active thread keys (already hashed/opaque — root:<id> or sem:v1:<sha>). */
    threadKeys: string[];
    /** Latest snapshot claim ceiling — a vocabulary token, never snapshot_text. */
    snapshotClaimCeiling?: string | null;
}
export declare function canonicalProfileText(input: ProfileBasisInput): string;
export interface EmbeddedText {
    text: string;
    vector: Float16Vector;
}
export declare function embedTriggerVector(provider: EmbeddingProvider, input: TriggerBasisInput): Promise<EmbeddedText>;
export declare function embedProfileVector(provider: EmbeddingProvider, input: ProfileBasisInput): Promise<EmbeddedText>;
