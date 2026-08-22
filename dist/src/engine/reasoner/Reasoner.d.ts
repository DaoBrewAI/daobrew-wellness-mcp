import { JoinedTriplet } from "../triplet.js";
import { AttributionReasoner, GraphDelta, ReasoningInput } from "./types.js";
export declare class NotEnoughSignalError extends Error {
    constructor(message?: string);
}
type PatternKey = "overdrive" | "tension" | "depletion" | "stagnation" | "constriction";
interface PatternScore {
    key: PatternKey;
    score: number;
    reasons: string[];
}
/** Neutral local/demo root identity. Production user-scoped roots retain the
 * main-branch derivation below, so this vocabulary cleanup cannot migrate
 * enrolled users' graph ids. */
export declare const MVP_ROOT_CAUSE_ID: string;
export declare function persistentRootId(userId: string, threadKey?: string): string;
export declare function rootCauseId(userId: string): string;
export declare function scorePatterns(triplet: JoinedTriplet): PatternScore[];
export interface TripletScoreBreakdown {
    total: number;
    state_score: number;
    source_context_score: number;
    sample_score: number;
    meeting_score: number;
    event_score: number;
    memory_score: number;
}
export declare function scoreTripletBreakdown(triplet: JoinedTriplet): TripletScoreBreakdown;
export declare class Reasoner implements AttributionReasoner {
    buildWatchingDelta(input: ReasoningInput, reason?: string): Promise<GraphDelta>;
    buildDelta(input: ReasoningInput): Promise<GraphDelta>;
    private buildDeltaInner;
}
export {};
