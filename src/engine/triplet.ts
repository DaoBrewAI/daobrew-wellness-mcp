import { createHash } from "node:crypto";
import type {
  BiometricSampleSignal,
  BiometricsSignals,
  StateSignal,
} from "./signals/biometrics.js";
import type { CalendarEventSignal } from "./signals/calendar.js";
import type { GranolaMeetingSignal } from "./signals/granola.js";
import type { MemoryInsightSignal } from "./signals/memory.js";
import { requireUserId } from "./require-user-id.js";

export interface TripletInput {
  biometrics: BiometricsSignals;
  calendar: CalendarEventSignal[];
  granola: GranolaMeetingSignal[];
  memory: MemoryInsightSignal[];
}

export interface TripletJoinOptions {
  userId?: string;
  sampleWindowSec?: number;
  contextWindowSec?: number;
  memoryWindowSec?: number;
  maxMemoryHits?: number;
  locfStalenessCapSec?: number;
  semanticMemoryScoresByAnchorRef?: ReadonlyMap<string, ReadonlyMap<string, number>>;
  semanticMemoryMatchThreshold?: number;
}

export interface BiometricEpisode {
  state: StateSignal;
  samples: BiometricSampleSignal[];
  occurred_at_ts: number;
  source_refs: string[];
}

export interface JoinedTriplet {
  id: string;
  user_id: string;
  episode: BiometricEpisode;
  events: CalendarEventSignal[];
  meetings: GranolaMeetingSignal[];
  memories: MemoryInsightSignal[];
  source_refs: string[];
}

export interface TripletContextAnchor {
  state: StateSignal;
  anchorTs: number;
  events: CalendarEventSignal[];
  meetings: GranolaMeetingSignal[];
  queryText: string;
}

const DEFAULT_SAMPLE_WINDOW_SEC = 4 * 60 * 60;
// Join windows below are mirrored in run.ts's temporal-overlap warning text ("calendar joins ±24h, memory 14d").
const DEFAULT_CONTEXT_WINDOW_SEC = 24 * 60 * 60;
const DEFAULT_MEMORY_WINDOW_SEC = 14 * 24 * 60 * 60;
const DEFAULT_MAX_MEMORY_HITS = 5;
const DEFAULT_LOCF_STALENESS_CAP_SEC = 6 * 60 * 60;
const DEFAULT_SEMANTIC_MEMORY_MATCH_THRESHOLD = 0.6;

function timestampToSeconds(timestamp: string): number | null {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return Math.trunc(ms / 1000);
}

function stableHash(parts: readonly string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

function byRef<T extends { graph_source_ref: string }>(a: T, b: T): number {
  return a.graph_source_ref.localeCompare(b.graph_source_ref);
}

function byTimeThenRef<T extends { graph_source_ref: string }>(
  getTime: (value: T) => number | null,
): (a: T, b: T) => number {
  return (a, b) => {
    const aTime = getTime(a) ?? Number.MAX_SAFE_INTEGER;
    const bTime = getTime(b) ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime || byRef(a, b);
  };
}

function withinWindow(valueTs: number | null, anchorTs: number, windowSec: number): boolean {
  return valueTs !== null && Math.abs(valueTs - anchorTs) <= windowSec;
}

function overlapsWindow(startTs: number, endTs: number | null, anchorTs: number, windowSec: number): boolean {
  const end = endTs ?? startTs;
  return startTs <= anchorTs + windowSec && end >= anchorTs - windowSec;
}

function lowerTerms(...values: Array<string | null | undefined>): Set<string> {
  const terms = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const token of value.toLowerCase().match(/[a-z0-9#_-]{3,}/g) ?? []) {
      terms.add(token);
    }
  }
  return terms;
}

function contextTerms(events: CalendarEventSignal[], meetings: GranolaMeetingSignal[]): Set<string> {
  const terms = new Set<string>();
  for (const event of events) {
    for (const term of lowerTerms(event.title, event.calendar_name, event.location)) terms.add(term);
  }
  for (const meeting of meetings) {
    for (const term of lowerTerms(meeting.title, meeting.summary, ...meeting.topics)) terms.add(term);
  }
  return terms;
}

function contextQueryText(events: CalendarEventSignal[], meetings: GranolaMeetingSignal[]): string {
  return [...contextTerms(events, meetings)].sort().join(" ");
}

/**
 * Shared-term count between a memory and the triplet's event/meeting context
 * terms. The join threshold stays >= 1 (hasOverlap semantics); the raw count
 * also ranks memories for the per-triplet cap, so a context-relevant insight
 * is not silently dropped in favor of a higher-importance-but-irrelevant one
 * (per-source importance is nearly constant, so it cannot rank relevance).
 */
function memoryOverlapCount(memory: MemoryInsightSignal, terms: Set<string>): number {
  if (terms.size === 0) return 0;
  const memoryTerms = lowerTerms(memory.insight_text, ...memory.topics);
  let count = 0;
  for (const term of memoryTerms) {
    if (terms.has(term)) count += 1;
  }
  return count;
}

function memoryMatches(
  memory: MemoryInsightSignal,
  anchorTs: number,
  memoryWindowSec: number,
  overlap: number,
): boolean {
  return withinWindow(memory.occurred_at_ts, anchorTs, memoryWindowSec) || overlap >= 1;
}

function semanticMemoryMatches(
  memory: MemoryInsightSignal,
  anchorTs: number,
  memoryWindowSec: number,
  semanticScore: number | null,
  matchThreshold: number,
): boolean {
  return (
    withinWindow(memory.occurred_at_ts, anchorTs, memoryWindowSec) ||
    (semanticScore !== null && semanticScore >= matchThreshold)
  );
}

export function buildTripletContextAnchors(
  input: TripletInput,
  options: Pick<TripletJoinOptions, "contextWindowSec"> = {},
): TripletContextAnchor[] {
  const contextWindowSec = options.contextWindowSec ?? DEFAULT_CONTEXT_WINDOW_SEC;
  const states = [...input.biometrics.states].sort(
    (a, b) => a.bucket_ts - b.bucket_ts || byRef(a, b),
  );

  return states.map((state) => {
    const anchorTs = state.bucket_ts;
    const events = input.calendar
      .filter((event) => overlapsWindow(event.start_ts, event.end_ts, anchorTs, contextWindowSec))
      .sort(byTimeThenRef((event) => event.start_ts));
    const eventIds = new Set(events.map((event) => event.id));
    const meetings = input.granola
      .filter((meeting) => (
        (meeting.event_id !== null && eventIds.has(meeting.event_id)) ||
        withinWindow(meeting.occurred_at_ts, anchorTs, contextWindowSec)
      ))
      .sort(byTimeThenRef((meeting) => meeting.occurred_at_ts));

    return {
      state,
      anchorTs,
      events,
      meetings,
      queryText: contextQueryText(events, meetings),
    };
  });
}

export function joinTriplets(
  input: TripletInput,
  options: TripletJoinOptions = {},
): JoinedTriplet[] {
  const userId = requireUserId(options.userId, "joinTriplets");
  const sampleWindowSec = options.sampleWindowSec ?? DEFAULT_SAMPLE_WINDOW_SEC;
  const contextWindowSec = options.contextWindowSec ?? DEFAULT_CONTEXT_WINDOW_SEC;
  const memoryWindowSec = options.memoryWindowSec ?? DEFAULT_MEMORY_WINDOW_SEC;
  const maxMemoryHits = options.maxMemoryHits ?? DEFAULT_MAX_MEMORY_HITS;
  const locfStalenessCapSec = options.locfStalenessCapSec ?? DEFAULT_LOCF_STALENESS_CAP_SEC;
  const semanticMemoryMatchThreshold = options.semanticMemoryMatchThreshold ?? DEFAULT_SEMANTIC_MEMORY_MATCH_THRESHOLD;

  const samples = input.biometrics.metrics
    .flatMap((series) => series.samples)
    .map((sample) => ({ sample, ts: timestampToSeconds(sample.timestamp) }))
    .filter((entry): entry is { sample: BiometricSampleSignal; ts: number } => entry.ts !== null)
    .sort((a, b) => a.ts - b.ts || byRef(a.sample, b.sample));

  const states = [...input.biometrics.states].sort(
    (a, b) => a.bucket_ts - b.bucket_ts || byRef(a, b),
  );
  const anchorsByRef = new Map(
    buildTripletContextAnchors(input, { contextWindowSec }).map((anchor) => [anchor.state.graph_source_ref, anchor]),
  );

  return states.map((state) => {
    const anchorTs = state.bucket_ts;
    const directSamples = samples
      .filter((entry) => withinWindow(entry.ts, anchorTs, sampleWindowSec))
      .map((entry) => entry.sample);
    const directMetrics = new Set(directSamples.map((sample) => sample.metric));
    const carriedSamples = input.biometrics.metrics
      .filter((series) => !directMetrics.has(series.metric))
      .map((series) => samples
        .filter((entry) => entry.sample.metric === series.metric)
        .filter((entry) => entry.ts < anchorTs && anchorTs - entry.ts <= locfStalenessCapSec)
        .sort((a, b) => b.ts - a.ts || byRef(a.sample, b.sample))[0])
      .filter((entry): entry is { sample: BiometricSampleSignal; ts: number } => Boolean(entry))
      .map((entry) => ({ ...entry.sample, carried: true }));
    const episodeSamples = [...directSamples, ...carriedSamples]
      .sort((a, b) => a.metric.localeCompare(b.metric) || byRef(a, b));

    const anchor = anchorsByRef.get(state.graph_source_ref);
    const events = anchor?.events ?? [];
    const meetings = anchor?.meetings ?? [];

    const terms = contextTerms(events, meetings);
    const semanticScores = options.semanticMemoryScoresByAnchorRef?.get(state.graph_source_ref);
    const semanticMode = semanticScores !== undefined;
    const memories = input.memory
      .map((memory) => {
        const overlap = memoryOverlapCount(memory, terms);
        const semanticScore = semanticScores?.get(memory.id) ?? null;
        return { memory, overlap, semanticScore };
      })
      .filter(({ memory, overlap, semanticScore }) => (
        semanticMode
          ? semanticMemoryMatches(memory, anchorTs, memoryWindowSec, semanticScore, semanticMemoryMatchThreshold)
          : memoryMatches(memory, anchorTs, memoryWindowSec, overlap)
      ))
      .sort((a, b) => (
        (semanticMode
          ? (b.semanticScore ?? 0) - (a.semanticScore ?? 0)
          : b.overlap - a.overlap) ||
        b.memory.strength - a.memory.strength ||
        b.memory.importance - a.memory.importance ||
        (b.memory.occurred_at_ts ?? 0) - (a.memory.occurred_at_ts ?? 0) ||
        byRef(a.memory, b.memory)
      ))
      .slice(0, maxMemoryHits)
      .map(({ memory }) => memory);

    const episodeSourceRefs = [
      state.graph_source_ref,
      ...episodeSamples.map((sample) => sample.graph_source_ref),
    ].sort();
    const sourceRefs = [
      ...episodeSourceRefs,
      ...events.map((event) => event.graph_source_ref),
      ...meetings.map((meeting) => meeting.graph_source_ref),
      ...memories.map((memory) => memory.graph_source_ref),
    ].sort();

    return {
      id: `triplet_${stableHash([userId, ...sourceRefs])}`,
      user_id: userId,
      episode: {
        state,
        samples: episodeSamples,
        occurred_at_ts: anchorTs,
        source_refs: episodeSourceRefs,
      },
      events,
      meetings,
      memories,
      source_refs: sourceRefs,
    };
  });
}
