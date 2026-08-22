/**
 * Design §6, finally built: "a population pattern is a consolidation job with
 * a different GROUP BY." Aggregates the anonymized transfer_records into
 * cohort-level population_priors — the cold-start / sparse-cohort fallback
 * when neighbor retrieval is below k-anonymity. v1 cohort is 'global'
 * (no cohort attributes exist yet — D6). Counts are always published;
 * concrete top_methods are k-anon-gated like the neighbor path.
 */
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface TransferPriorsJobDeps {
    exec?: Exec;
    query?: Query;
    nowTs?: () => number;
    kAnonThreshold?: number;
}
export interface TransferPriorsJobResult {
    priorsWritten: number;
    version: number | null;
    warnings: string[];
}
export declare function runTransferPriorsJob(deps?: TransferPriorsJobDeps): Promise<TransferPriorsJobResult>;
export interface PopulationPriorRow {
    stress_pattern: string;
    prior_json: {
        worked: number;
        did_not_work: number;
        top_methods: Array<Record<string, unknown>>;
    };
    sample_size: number;
    confidence: number;
    version: number;
}
export declare function readPopulationPrior(stressPattern: string, query?: Query): Promise<PopulationPriorRow | null>;
export {};
