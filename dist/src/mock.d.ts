import { WellnessState, ElementDetail, SessionStart, SessionResult, SessionHistoryEntry, Element } from "./types.js";
export declare function mockWellnessState(isDemo?: boolean): WellnessState;
export declare function mockElementDetail(element: Element): ElementDetail;
export declare function mockStartSession(element: Element, tier?: string): SessionStart;
export declare function mockSessionResult(sessionId: string): SessionResult;
export declare function mockSessionHistory(days?: number): SessionHistoryEntry[];
/** Reset wellnessCallCount — for tests only. */
export declare function _resetWellnessCallCount(): void;
