type Query = (sql: string) => Promise<Record<string, any>[]>;
export interface CalendarSignalOptions {
    userId?: string;
    startTs?: number;
    endTs?: number;
    limit?: number;
    /** RLS seam (deferred wiring 1/3): injected read executor. Defaults to the
     *  module-level queryJson — behavior is byte-identical when absent. */
    query?: Query;
}
export interface CalendarEventSignal {
    id: string;
    user_id: string;
    source: string;
    source_ref: string | null;
    graph_source_ref: string;
    title: string;
    start_ts: number;
    end_ts: number | null;
    all_day: boolean;
    attendee_count: number | null;
    attendees: unknown[];
    calendar_name: string | null;
    location: string | null;
    metadata: Record<string, unknown>;
    created_at_ts: number;
}
export declare function readCalendarSignals(options?: CalendarSignalOptions): Promise<CalendarEventSignal[]>;
export {};
