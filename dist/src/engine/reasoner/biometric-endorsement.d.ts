/**
 * Pure biometric endorsement builder (design 2026-07-07). Turns an episode's
 * raw samples + per-metric baselines into (a) a structured biometric_summary
 * and (b) per-pattern data-endorsement lines. NO I/O here — callers fetch;
 * this formats. Strings are DESCRIPTIVE, never causal: claim_level gates the
 * one allowed strengthening ("coincided with" at attribution_candidate).
 */
export interface EndorsementSample {
    metric_type: string;
    value: number;
    unit: string;
    start_time_ts: number;
}
export interface MetricBaseline {
    metric_type: string;
    baseline_avg: number;
    day_count: number;
}
export interface EndorsementInput {
    samples: EndorsementSample[];
    baselines: MetricBaseline[];
    window: {
        start_ts: number;
        end_ts: number;
    };
    patterns: string[];
    claimLevel: "context_only" | "attribution_candidate";
    timeZone: string;
}
export interface MetricSummary {
    type: string;
    avg: number;
    unit: string;
    baseline_avg: number | null;
    delta_pct: number | null;
}
export interface BiometricEndorsement {
    biometric_summary: {
        window: {
            start_ts: number;
            end_ts: number;
        };
        sample_count: number;
        metrics: MetricSummary[];
        patterns: string[];
        summary: string;
    };
    pattern_endorsements: {
        key: string;
        summary: string;
        metrics: MetricSummary[];
    }[];
}
export declare function buildBiometricEndorsement(input: EndorsementInput): BiometricEndorsement;
