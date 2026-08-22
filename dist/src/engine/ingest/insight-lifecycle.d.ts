import { type GraphStoreKind } from "../../graph-db.js";
import type { TextGenerationProvider } from "../memory/llm.js";
import type { InsightLifecycleDecisionCounts, InsightRow } from "./types.js";
type Query = (sql: string) => Promise<Record<string, any>[]>;
type EmbedRows = (texts: string[]) => Promise<number[][]>;
export declare const INSIGHT_LIFECYCLE_NEIGHBOR_LIMIT = 8;
export declare const INSIGHT_LIFECYCLE_MAX_CLASSIFIED_ROWS = 24;
export declare const SUPPRESSED_INSIGHT_STRENGTH = 0;
export type InsightLifecycleDecisionKind = "add" | "supersedes" | "noop_duplicate";
export interface InsightLifecyclePlan {
    rows: InsightRow[];
    /** Aligned with rows; true only when a durable or replayed lifecycle decision owns importance/strength. */
    lifecycleOwned: boolean[];
    postWriteSql: string[];
    warnings: string[];
    geminiCallsUsed: number;
    decisionCounts: InsightLifecycleDecisionCounts;
}
export interface InsightLifecycleOptions {
    userId: string;
    rows: InsightRow[];
    query: Query;
    llm?: TextGenerationProvider | null;
    embedRows?: EmbedRows | null;
    nowTs?: () => number;
    storeKind?: () => GraphStoreKind;
    maxClassifiedRows?: number;
}
export declare function insightContentHash(row: Pick<InsightRow, "insight_text" | "topics" | "occurred_at_ts" | "last_accessed_ts">): string;
export declare function planInsightLifecycle(options: InsightLifecycleOptions): Promise<InsightLifecyclePlan>;
export {};
