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
    notifyDisconnect(): Promise<void>;
}
