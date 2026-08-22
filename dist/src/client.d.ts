import { Element, WellnessState, ElementDetail, SessionStart, SessionResult, SessionHistoryEntry, HealthSampleDTO, BreathState, HealthkitHistory, StateHistory } from "./types.js";
export interface ClientConfig {
    deviceCredential: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export interface CurlRequestSpec {
    args: string[];
    headerInput: string;
    body?: string;
}
export interface CausalRunResponse {
    principal: {
        user_id: string;
        device_id: string;
    };
    summary: {
        status: "written" | "skipped_done" | "no_signal" | "dry_run";
        [key: string]: unknown;
    };
}
export interface GraphSnapshotResponse {
    schema_version: 1;
    principal: {
        user_id: string;
        device_id: string;
    };
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    node_count: number;
    edge_count: number;
    ghost_status_counts?: Record<string, number>;
}
export declare function buildCurlRequestSpec(config: ClientConfig, path: string, options?: {
    method?: string;
    body?: string;
}): CurlRequestSpec;
export declare class DaoBrewClient {
    private config;
    private timeoutMs;
    constructor(config: ClientConfig);
    private request;
    getWellnessState(): Promise<WellnessState>;
    assertBackendCompatible(): Promise<number>;
    getElementDetail(element: Element): Promise<ElementDetail>;
    startSession(element: Element, tier?: string): Promise<SessionStart>;
    getSessionResult(sessionId: string): Promise<SessionResult>;
    getSessionHistory(days?: number): Promise<SessionHistoryEntry[]>;
    getHealthkitHistory(metric: string, range: string): Promise<HealthkitHistory>;
    getStateHistory(limit?: number, start_ts?: number, end_ts?: number): Promise<StateHistory>;
    pushHealthSamples(samples: HealthSampleDTO[]): Promise<{
        samples_received: number;
        message: string;
    }>;
    /** Run the server-owned causal engine for the authenticated principal. */
    runCausalGraph(): Promise<CausalRunResponse>;
    /** Fetch the authenticated principal's exact graph projection for mirroring. */
    getGraphSnapshot(): Promise<GraphSnapshotResponse>;
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
    /**
     * Tell the backend to begin cycle-boundary breath-param feedback for this user.
     * Pattern is locked for the session; backend computes new params at every breath
     * cycle boundary using the just-completed cycle's HR. MCP polls `getBreathState()`
     * to render the retro bar.
     */
    startLiveSession(pattern: string, durationSec?: number, initialParams?: {
        bpm?: number;
        ratio?: number;
        depth?: number;
    }): Promise<{
        started: boolean;
        pattern: string;
        initial_params: any;
        cycle_sec: number;
        started_at_unix: number;
    }>;
    stopLiveSession(): Promise<any>;
    /**
     * Fetch the live breath-state for retro-bar rendering.
     * Returns `{active: false}` if no session is running.
     */
    getBreathState(): Promise<BreathState>;
    notifyDisconnect(): Promise<void>;
}
