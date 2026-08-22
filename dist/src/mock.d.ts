import { WellnessState, ElementDetail, SessionStart, SessionResult, BreathState, SessionHistoryEntry, Element } from "./types.js";
/** Development-only synthesis of a backend BreathState. This module is not published. */
export declare function mockBreathState(pattern: Element, sessionStartMs: number, _plannedDurationSec: number): BreathState;
export declare function mockWellnessState(isDemo?: boolean): WellnessState;
export declare function mockElementDetail(element: Element): ElementDetail;
export declare function mockStartSession(element: Element, tier?: string): SessionStart;
export declare function mockSessionResult(sessionId: string): SessionResult;
export declare function mockSessionHistory(days?: number): SessionHistoryEntry[];
export interface DetonateBrief {
    cause_id: string;
    cause: string;
    evidence: string[];
    context?: string;
    artifact_spec: string;
    suggested_block: {
        title: string;
        start_offset_min: number;
        duration_min: number;
    };
}
export declare const AI2_DEMO_CONTEXT: string;
export declare const AI2_DEMO_ARTIFACT_SPEC: string;
export declare function mockDetonateBrief(): DetonateBrief | null;
export declare function mockDetonateDone(causeId: string): {
    status: string;
    cause_id: string;
};
/** Reset detonator mock state — for tests only. */
export declare function _resetMockDetonator(): void;
/** Reset wellnessCallCount — for tests only. */
export declare function _resetWellnessCallCount(): void;
