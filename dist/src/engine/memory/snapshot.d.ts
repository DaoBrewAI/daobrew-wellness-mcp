import { TextGenerationProvider } from "./llm.js";
import { MemoryClaimLevel } from "./types.js";
type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface SnapshotThreadFacts {
    id: string;
    title: string;
    summary: string | null;
    claim_level: MemoryClaimLevel;
    recurrence_count: number;
    pattern_keys: string[];
    evidence_count: number;
    first_seen_ts: number | null;
    last_seen_ts: number | null;
    strength: number;
}
export interface SnapshotSection {
    text: string;
    thread_id: string;
}
export interface SnapshotModel {
    recurring_stressors: SnapshotSection[];
    pattern_tendencies: SnapshotSection[];
    intervention_response: SnapshotSection[];
    inference_cautions: SnapshotSection[];
}
export interface WeeklySnapshotJobDeps {
    userId: string;
    exec?: Exec;
    query?: Query;
    nowTs?: () => number;
    llm?: TextGenerationProvider;
    maxThreads?: number;
    alertWebhook?: string;
    fetchImpl?: typeof fetch;
}
export interface WeeklySnapshotJobResult {
    written: boolean;
    version?: number;
    warnings: string[];
    alerts: string[];
}
export declare function claimCeiling(threads: Array<Pick<SnapshotThreadFacts, "claim_level">>): MemoryClaimLevel;
export declare function buildSnapshotPrompt(threads: SnapshotThreadFacts[]): string;
export interface SnapshotValidationVerdict {
    ok: boolean;
    errors: string[];
}
export declare function validateSnapshotModel(raw: unknown, threads: Array<Pick<SnapshotThreadFacts, "id" | "claim_level">>): SnapshotValidationVerdict;
export declare function renderSnapshotText(model: SnapshotModel, _threads: Array<Pick<SnapshotThreadFacts, "id">>): string;
export declare function runWeeklySnapshotJob(deps: WeeklySnapshotJobDeps): Promise<WeeklySnapshotJobResult>;
export {};
