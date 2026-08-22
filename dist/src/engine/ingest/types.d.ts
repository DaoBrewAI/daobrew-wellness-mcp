export interface EventRow {
    id: string;
    source: string;
    source_ref: string | null;
    title: string;
    start_ts: number;
    end_ts: number | null;
    all_day: boolean;
    attendee_count: number | null;
    attendees: unknown[];
    calendar_name: string | null;
    location: string | null;
    metadata: Record<string, unknown>;
}
export interface MeetingRow {
    id: string;
    source: string;
    source_ref: string | null;
    event_id: string | null;
    kind: "meeting" | "call" | "interview" | "one_on_one" | "standup" | "other";
    title: string;
    occurred_at_ts: number | null;
    duration_sec: number | null;
    participants: unknown[];
    summary: string | null;
    body: string | null;
    transcript_spans: unknown[];
    topics: string[];
}
export interface InsightRow {
    id: string;
    source: string;
    source_ref: string | null;
    insight_text: string;
    topics: string[];
    importance: number;
    strength: number;
    occurred_at_ts: number | null;
    last_accessed_ts: number | null;
}
export interface InsightLifecycleDecisionCounts {
    add: number;
    supersedes: number;
    noopDuplicate: number;
    replayed: number;
    overflow: number;
}
export interface IngestResult {
    rowsWritten: number;
    dedupSkips: number;
    warnings?: string[];
    geminiCallsUsed?: number;
    lifecycleDecisionCounts?: InsightLifecycleDecisionCounts;
}
export interface IngestSink {
    upsertEvents(userId: string, rows: EventRow[]): Promise<IngestResult>;
    upsertMeetingNotes(userId: string, rows: MeetingRow[]): Promise<IngestResult>;
    upsertInsights(userId: string, rows: InsightRow[]): Promise<IngestResult>;
}
