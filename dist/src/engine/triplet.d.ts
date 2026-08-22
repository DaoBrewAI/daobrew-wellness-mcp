import type { BiometricSampleSignal, BiometricsSignals, StateSignal } from "./signals/biometrics.js";
import type { CalendarEventSignal } from "./signals/calendar.js";
import type { GranolaMeetingSignal } from "./signals/granola.js";
import type { MemoryInsightSignal } from "./signals/memory.js";
export interface TripletInput {
    biometrics: BiometricsSignals;
    calendar: CalendarEventSignal[];
    granola: GranolaMeetingSignal[];
    memory: MemoryInsightSignal[];
}
export interface TripletJoinOptions {
    userId?: string;
    sampleWindowSec?: number;
    contextWindowSec?: number;
    memoryWindowSec?: number;
    maxMemoryHits?: number;
    locfStalenessCapSec?: number;
    semanticMemoryScoresByAnchorRef?: ReadonlyMap<string, ReadonlyMap<string, number>>;
    semanticMemoryMatchThreshold?: number;
}
export interface BiometricEpisode {
    state: StateSignal;
    samples: BiometricSampleSignal[];
    occurred_at_ts: number;
    source_refs: string[];
}
export interface JoinedTriplet {
    id: string;
    user_id: string;
    episode: BiometricEpisode;
    events: CalendarEventSignal[];
    meetings: GranolaMeetingSignal[];
    memories: MemoryInsightSignal[];
    source_refs: string[];
}
export interface TripletContextAnchor {
    state: StateSignal;
    anchorTs: number;
    events: CalendarEventSignal[];
    meetings: GranolaMeetingSignal[];
    queryText: string;
}
export declare function buildTripletContextAnchors(input: TripletInput, options?: Pick<TripletJoinOptions, "contextWindowSec">): TripletContextAnchor[];
export declare function joinTriplets(input: TripletInput, options?: TripletJoinOptions): JoinedTriplet[];
