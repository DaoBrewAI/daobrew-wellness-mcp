import { Element, WellnessState, ElementDetail, SessionStart, SessionResult, SessionHistoryEntry, HealthSampleDTO } from "./types.js";
export interface ClientConfig {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export declare class DaoBrewClient {
    private apiKey;
    private baseUrl;
    private timeoutMs;
    constructor(config: ClientConfig);
    private request;
    getWellnessState(): Promise<WellnessState>;
    getElementDetail(element: Element): Promise<ElementDetail>;
    startSession(element: Element, tier?: string): Promise<SessionStart>;
    getSessionResult(sessionId: string): Promise<SessionResult>;
    getSessionHistory(days?: number): Promise<SessionHistoryEntry[]>;
    pushHealthSamples(samples: HealthSampleDTO[]): Promise<{
        samples_received: number;
        message: string;
    }>;
    createPairingCode(): Promise<{
        code: string;
        expires_in_seconds: number;
    }>;
    sendHeartbeat(): Promise<void>;
    /**
     * Fetch the latest live heart-rate sample from the backend.
     * Schema (Track B contract):
     *   { hr: float|null, age_seconds: float|null, stale: bool }
     *
     * On HTTP/parse failure, returns `{hr: null, stale: true}` rather than throwing —
     * `daobrew_check` is auto-polled every 2s and we do not want to break the dashboard
     * stream on a transient backend hiccup.
     */
    getLiveHR(): Promise<{
        hr: number | null;
        age_seconds?: number;
        stale?: boolean;
    }>;
    notifyDisconnect(): Promise<void>;
}
