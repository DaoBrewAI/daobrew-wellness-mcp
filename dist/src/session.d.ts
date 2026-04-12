import { Element } from "./types.js";
export interface ActiveSession {
    sessionId: string;
    pid: number;
    element: Element;
    genre: string;
    duration: number;
    startTime: number;
    mode: "ambient" | "ondemand";
}
export declare function startSession(session: ActiveSession): void;
export declare function getActiveSession(): ActiveSession | null;
export declare function clearSession(): ActiveSession | null;
export declare function isSessionRunning(): boolean;
export declare function durationPlayed(): number | null;
