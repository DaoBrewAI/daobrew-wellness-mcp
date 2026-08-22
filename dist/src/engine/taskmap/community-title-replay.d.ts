import type { TaskMapCommunityGraphNodeInputV1, TaskMapCommunityGraphOutputV1 } from "./community-graph-brain.js";
import type { LlmStation, LlmStationEnvelope } from "./llm-station.js";
export declare const TASKMAP_COMMUNITY_TITLE_ENVELOPE_MAX_BYTES: number;
interface CommunityTitleReplayScopeV1 {
    directory: string;
    graphOutput: TaskMapCommunityGraphOutputV1;
    nodeLookup: ReadonlyMap<string, TaskMapCommunityGraphNodeInputV1>;
}
/**
 * Best-effort load of the recorded batch title envelope for the current
 * community set. Any storage or validation failure returns null so the
 * caller falls back to the live station or the deterministic titles.
 */
export declare function loadRecordedCommunityTitleEnvelope(scope: CommunityTitleReplayScopeV1, inputDigest: string): Promise<LlmStationEnvelope | null>;
/**
 * Wraps a live station so every valid community-title-v1 envelope it
 * produces is recorded for byte-identical replay in later generations.
 * Recording is best-effort and never affects the live result.
 */
export declare function withCommunityTitleEnvelopeRecording(station: LlmStation, scope: CommunityTitleReplayScopeV1): LlmStation;
export {};
