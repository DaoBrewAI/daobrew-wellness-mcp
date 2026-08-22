import { DaoBrewClient } from "../client.js";
import { HealthSampleDTO } from "../types.js";
export interface SyncResult {
    source: string;
    samples_pushed: number;
    samples_fetched?: number;
    /** `no_data` is valid, but is not evidence that an initial import completed. */
    outcome?: "data_observed" | "no_data";
    error?: string;
}
export interface SyncOptions {
    /** Widen the fetch windows to N days (one-time backfill); incremental when absent. */
    backfillDays?: number;
}
export declare class HealthBatchPushError extends Error {
    readonly samplesPushed: number;
    readonly batchesCompleted: number;
    constructor(message: string, samplesPushed: number, batchesCompleted: number);
}
/**
 * Keep each backend write bounded. A historical Oura import can contain tens of
 * thousands of heart-rate rows, while the ingestion endpoint persists rows
 * serially. Completed batches are never replayed when a later batch retries.
 */
export declare function pushHealthSamplesInBatches(client: Pick<DaoBrewClient, "pushHealthSamples">, samples: HealthSampleDTO[], batchSize?: number, retryDelaysMs?: readonly number[], sleep?: (delayMs: number) => Promise<void>): Promise<number>;
/**
 * Report an accepted Oura fetch without conflating an empty API window with a
 * completed import. A zero accepted count can still mean rows were deduplicated.
 */
export declare function successfulOuraSyncResult(samplesFetched: number, samplesPushed: number): SyncResult;
/** Pure window computation — incremental by default, widened for backfill. */
export declare function ouraFetchWindows(now: Date, backfillDays?: number): {
    hrStart: string;
    hrEnd: string;
    sleepStart: string;
    sleepEnd: string;
};
export interface OuraHeartRateWindow {
    start: string;
    end: string;
}
/**
 * Oura interprets date filters in the member's local timezone, which is not
 * available on the OAuth token. Query one adjacent calendar day on each side,
 * then filter normalized documents back to the requested UTC interval.
 */
export declare function ouraDailyActivityQueryBounds(startDate: string, endDate: string): {
    startDate: string;
    endDate: string;
};
/**
 * Oura rejects heartrate requests wider than 30 days. Use 28-day inclusive
 * windows to leave a safety margin. Adjacent windows share their exact boundary
 * instant; collectOuraHeartRateRows deterministically removes that duplicate.
 */
export declare function ouraHeartRateWindows(start: string, end: string): OuraHeartRateWindow[];
/**
 * Normalize only fields backed by existing canonical health metric contracts.
 * Provider-specific activity scores remain source-linked context.
 */
export declare function ouraDailyActivitySamples(rows: any[], requestedStartDate?: string, requestedEndDate?: string): HealthSampleDTO[];
/**
 * Follow Oura's `next_token` contract for every multi-document endpoint. Bad
 * tokens and excessive pagination fail closed instead of trapping the daemon.
 */
export declare function collectOuraPages<T>(fetchPage: (nextToken?: string) => Promise<{
    data?: T[];
    next_token?: unknown;
}>, maxPages?: number): Promise<T[]>;
/**
 * Fetch every page in every provider-safe heartrate window and deduplicate rows
 * repeated at page/window boundaries. Rows without a stable identity remain.
 */
export declare function collectOuraHeartRateRows<T>(start: string, end: string, fetchPage: (window: OuraHeartRateWindow, nextToken?: string) => Promise<{
    data?: T[];
    next_token?: unknown;
}>): Promise<T[]>;
export declare function syncAllConnectedSources(client: DaoBrewClient, options?: SyncOptions): Promise<SyncResult[]>;
