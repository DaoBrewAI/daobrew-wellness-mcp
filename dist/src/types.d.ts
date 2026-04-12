export type Quadrant = "peak" | "pushing_it" | "recharging" | "burnout";
export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export type InterventionTier = "audio" | "full";
export interface WellnessState {
    yin: number;
    yang: number;
    quadrant: Quadrant;
    quadrant_label: string;
    quadrant_description: string;
    yin_label: string;
    yang_label: string;
    active_elements: Element[];
    element_scores: Record<Element, number>;
    top_signal: string;
    recommendation: string;
    last_updated: string;
    _warning?: string;
    data_source?: string;
}
export interface SignalEvidence {
    signal: string;
    value: string;
    baseline: string;
    direction: "above" | "below" | "normal" | "unknown";
    weight: number;
}
export interface Intervention {
    type: "breathing";
    genre: string;
    duration_seconds: number;
    breathing_rate_bpm: number;
}
export interface ElementDetail {
    element: Element;
    label: string;
    score: number;
    activated: boolean;
    headline: string;
    evidence: SignalEvidence[];
    why_this_practice: string;
    intervention: Intervention;
    _warning?: string;
}
export interface SessionStart {
    session_id: string;
    status: "started";
    tier: InterventionTier;
    element: Element;
    genre: string;
    duration_seconds: number;
    breathing_rate_bpm: number;
    instruction: string;
}
export interface SessionResult {
    session_id: string;
    completed: boolean;
    duration_seconds: number;
    hrv_before: number | null;
    hrv_after: number | null;
    hrv_change_pct: number | null;
    hr_before: number | null;
    hr_after: number | null;
    summary: string;
}
export interface SessionHistoryEntry {
    session_id: string;
    timestamp: string;
    element: Element;
    tier: InterventionTier;
    duration_seconds: number;
    hrv_change_pct: number | null;
}
export declare const ELEMENT_GENRES: Record<Element, string>;
export declare const ELEMENT_LABELS: Record<Element, string>;
export declare const ELEMENT_ORGANS: Record<Element, string>;
export declare const ELEMENT_DESCRIPTIONS: Record<Element, string>;
export declare const ELEMENT_SHORT_SUMMARIES: Record<Element, string>;
export declare const ELEMENT_ACTIVATION_REASONS: Record<Element, string>;
export declare const ELEMENT_TASK_REASONS: Record<Element, string>;
export interface HealthSampleDTO {
    metric_type: string;
    value: number;
    unit: string;
    start_time: string;
    end_time: string;
    source: string;
}
