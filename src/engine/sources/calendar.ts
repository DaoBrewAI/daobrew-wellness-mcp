import { createHash } from "node:crypto";
import { EventRow } from "../ingest/types.js";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function toTs(value: unknown): number {
  const n = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid calendar timestamp: ${value}`);
  return Math.trunc(n > 10_000_000_000 ? n / 1000 : n);
}

export function normalizeCalendarEvents(rawEvents: any[]): EventRow[] {
  return rawEvents.map((event) => {
    const sourceRef = String(event.source_ref ?? event.id ?? event.eventIdentifier ?? hash(JSON.stringify(event)));
    const startTs = toTs(event.start_ts ?? event.startDate ?? event.start);
    return {
      id: String(event.id ?? `event_${hash(sourceRef)}`),
      source: String(event.source ?? "eventkit"),
      source_ref: sourceRef,
      title: String(event.title ?? "(untitled event)"),
      start_ts: startTs,
      end_ts: event.end_ts || event.endDate || event.end ? toTs(event.end_ts ?? event.endDate ?? event.end) : null,
      all_day: Boolean(event.all_day ?? event.isAllDay ?? false),
      attendee_count: Number.isFinite(Number(event.attendee_count)) ? Number(event.attendee_count) : Array.isArray(event.attendees) ? event.attendees.length : null,
      attendees: Array.isArray(event.attendees) ? event.attendees : [],
      calendar_name: event.calendar_name ?? event.calendar ?? null,
      location: event.location ?? null,
      metadata: event.metadata ?? {},
    };
  });
}
