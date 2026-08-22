import * as oura from "./oura.js";
import type { PrivacySafeOuraContext } from "../engine/taskmap/body-context.js";
export declare const OURA_TASKMAP_CONTEXT_VERSION: "oura-taskmap-context.v1";
export declare const OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION: "personal-baseline-composite-recovery.v2";
export type OuraTaskMapBodyCategory = "below_baseline" | "within_baseline" | "above_baseline" | "unknown";
export interface OuraTaskMapContextDay {
    dayKey: string;
    axis: "composite_recovery";
    category: OuraTaskMapBodyCategory;
}
export interface OuraTaskMapContextDocument extends PrivacySafeOuraContext {
    contractVersion: typeof OURA_TASKMAP_CONTEXT_VERSION;
    sourceKind: "oura";
    classifier: {
        version: typeof OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION;
        axis: "composite_recovery";
        method: string;
        minimumMetricsPerDay: 2;
        lowerThreshold: -1;
        upperThreshold: 1;
    };
    days: OuraTaskMapContextDay[];
    privacy: {
        rawBiometricsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
interface OuraPage<T = unknown> {
    data?: T[];
    next_token?: unknown;
}
export interface OuraTaskMapContextDependencies {
    loadToken: () => oura.OuraToken | null;
    assertOwnerBinding: (token: oura.OuraToken) => void;
    refreshAccessToken: (token: oura.OuraToken) => Promise<oura.OuraToken>;
    fetchDailyReadiness: (token: oura.OuraToken, startDate?: string, endDate?: string, nextToken?: string) => Promise<OuraPage>;
    fetchDailySleep: (token: oura.OuraToken, startDate?: string, endDate?: string, nextToken?: string) => Promise<OuraPage>;
    fetchDailyActivity: (token: oura.OuraToken, startDate?: string, endDate?: string, nextToken?: string) => Promise<OuraPage>;
    fetchSleep: (token: oura.OuraToken, startDate?: string, endDate?: string, nextToken?: string) => Promise<OuraPage>;
    fetchHeartRate: (token: oura.OuraToken, startDate?: string, endDate?: string, nextToken?: string) => Promise<OuraPage>;
}
export interface FetchOuraTaskMapContextOptions {
    startDate: string;
    endDate: string;
    /** Fix this in replays; defaults to the current instant in the live CLI. */
    now?: Date;
}
export declare const DEFAULT_OURA_TASKMAP_CONTEXT_DEPENDENCIES: OuraTaskMapContextDependencies;
/**
 * Deterministic personal-baseline classifier, version 1.
 *
 * For each day, form an internal composite only when both Oura daily readiness
 * and daily sleep scores exist; the composite is their arithmetic mean. Compare
 * it only with valid personal composites from the preceding 28 calendar days.
 * Once at least seven baseline days exist, center on their median and estimate spread with
 * 1.4826 × median absolute deviation. The neutral half-band is the larger of
 * five provider points or 1.5 × that robust spread. Values outside the band are
 * labeled below/above; all other values are within. Raw component, composite,
 * center, spread, and thresholds are discarded and never serialized.
 *
 * This is prioritization context relative to one person's recent baseline. It
 * is not a medical interpretation and cannot establish causality.
 */
export declare function classifyCompositeRecoveryDays(startDate: string, endDate: string, dailyReadinessRows: readonly unknown[], dailySleepRows: readonly unknown[]): OuraTaskMapContextDay[];
export declare function fetchOuraTaskMapContext(options: FetchOuraTaskMapContextOptions, dependencies?: OuraTaskMapContextDependencies): Promise<OuraTaskMapContextDocument>;
export declare function assertOwnerSafeOuraTaskMapContext(document: OuraTaskMapContextDocument): void;
export declare function serializeOuraTaskMapContext(document: OuraTaskMapContextDocument): string;
export declare function writeOuraTaskMapContextAtomic(outputPath: string, document: OuraTaskMapContextDocument): void;
export declare function summarizeOuraTaskMapContext(document: OuraTaskMapContextDocument): {
    status: "ok";
    contractVersion: typeof OURA_TASKMAP_CONTEXT_VERSION;
    sourceKind: "oura";
    coverage: OuraTaskMapContextDocument["coverage"];
    classifiedDays: number;
    categories: Record<OuraTaskMapBodyCategory, number>;
};
export {};
