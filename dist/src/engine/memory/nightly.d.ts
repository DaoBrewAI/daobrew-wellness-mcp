import { EmbeddingProvider } from "../embeddings/provider.js";
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface NightlyThreadMaintenanceDeps {
    userId: string;
    exec?: Exec;
    query?: Query;
    nowTs?: () => number;
    alertWebhook?: string;
    fetchImpl?: typeof fetch;
    /** 5B transfer emit: salt override (default env DAOBREW_TRANSFER_SALT). */
    transferSalt?: string;
    /** 5B transfer emit: provider override; null = emit with NULL embedding.
     *  Undefined = resolve Gemini lazily (null when no key). */
    transferProvider?: EmbeddingProvider | null;
}
export interface MrtComparisonCounts {
    treatment_recurred: number;
    treatment_quiet: number;
    control_recurred: number;
    control_quiet: number;
}
export interface NightlyThreadMaintenanceResult {
    threadsUpserted: number;
    evidenceInserted: number;
    verdictsSettled: number;
    threadsArchived: number;
    transferRecordsEmitted: number;
    profileVectorsWritten: number;
    /** MRT v1: cumulative settled verdicts by arm × verdict for this user
     *  (insufficient_observation counts nowhere). Mirrors the
     *  layer2:nightly:mrt_comparison pipeline_metrics row. */
    mrtComparison: MrtComparisonCounts;
    warnings: string[];
    alerts: string[];
}
export declare function runNightlyThreadMaintenance(deps: NightlyThreadMaintenanceDeps): Promise<NightlyThreadMaintenanceResult>;
export {};
