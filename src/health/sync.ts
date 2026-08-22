import { DaoBrewClient } from "../client.js";
import { HealthSampleDTO } from "../types.js";
import * as oura from "./oura.js";
import * as googleFit from "./google-fit.js";

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

const HEALTH_PUSH_BATCH_SIZE = 500;
const HEALTH_PUSH_RETRY_DELAYS_MS = [1_000, 3_000, 10_000];
const OURA_MAX_PAGES_PER_ENDPOINT = 1_000;
const OURA_MAX_HEART_RATE_WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const OURA_DAILY_ACTIVITY_PERIOD_MS = 24 * 60 * 60 * 1000;

export class HealthBatchPushError extends Error {
  constructor(
    message: string,
    readonly samplesPushed: number,
    readonly batchesCompleted: number,
  ) {
    super(message);
    this.name = "HealthBatchPushError";
  }
}

/**
 * Keep each backend write bounded. A historical Oura import can contain tens of
 * thousands of heart-rate rows, while the ingestion endpoint persists rows
 * serially. Completed batches are never replayed when a later batch retries.
 */
export async function pushHealthSamplesInBatches(
  client: Pick<DaoBrewClient, "pushHealthSamples">,
  samples: HealthSampleDTO[],
  batchSize = HEALTH_PUSH_BATCH_SIZE,
  retryDelaysMs: readonly number[] = HEALTH_PUSH_RETRY_DELAYS_MS,
  sleep: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("health sample batch size must be a positive integer");
  }
  let pushed = 0;
  let batchesCompleted = 0;
  for (let offset = 0; offset < samples.length; offset += batchSize) {
    const batch = samples.slice(offset, offset + batchSize);
    let result: Awaited<ReturnType<DaoBrewClient["pushHealthSamples"]>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        result = await client.pushHealthSamples(batch);
        break;
      } catch (error) {
        lastError = error;
        if (attempt < retryDelaysMs.length) await sleep(retryDelaysMs[attempt]);
      }
    }
    if (!result) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError);
      throw new HealthBatchPushError(
        `health sample batch ${batchesCompleted + 1} failed after ${retryDelaysMs.length + 1} attempts: ${detail}`,
        pushed,
        batchesCompleted,
      );
    }
    pushed += result.samples_received;
    batchesCompleted += 1;
  }
  return pushed;
}

async function pushOuraHealthSamplesInBatches(
  client: Pick<DaoBrewClient, "pushHealthSamples">,
  samples: HealthSampleDTO[],
  ownerGuard: oura.CurrentOuraOwnerGuard,
): Promise<number> {
  let pushed = 0;
  let batchesCompleted = 0;
  for (let offset = 0; offset < samples.length; offset += HEALTH_PUSH_BATCH_SIZE) {
    const batch = samples.slice(offset, offset + HEALTH_PUSH_BATCH_SIZE);
    let result: Awaited<ReturnType<DaoBrewClient["pushHealthSamples"]>> | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt <= HEALTH_PUSH_RETRY_DELAYS_MS.length; attempt += 1) {
      oura.assertCurrentOuraOwnerGuard(ownerGuard);
      try {
        result = await client.pushHealthSamples(batch);
      } catch (error) {
        lastError = error;
        // An owner change outranks backend retry policy. This exact branded
        // guard cannot be supplied through the generic batch API.
        oura.assertCurrentOuraOwnerGuard(ownerGuard);
        if (attempt < HEALTH_PUSH_RETRY_DELAYS_MS.length) {
          oura.assertCurrentOuraOwnerGuard(ownerGuard);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, HEALTH_PUSH_RETRY_DELAYS_MS[attempt]);
          });
          oura.assertCurrentOuraOwnerGuard(ownerGuard);
        }
        continue;
      }

      try {
        oura.assertCurrentOuraOwnerGuard(ownerGuard);
      } catch (error) {
        pushed += result.samples_received;
        batchesCompleted += 1;
        const detail = error instanceof Error ? error.message : String(error);
        throw new HealthBatchPushError(detail, pushed, batchesCompleted);
      }
      break;
    }
    if (!result) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError);
      throw new HealthBatchPushError(
        `health sample batch ${batchesCompleted + 1} failed after ${HEALTH_PUSH_RETRY_DELAYS_MS.length + 1} attempts: ${detail}`,
        pushed,
        batchesCompleted,
      );
    }
    pushed += result.samples_received;
    batchesCompleted += 1;
  }
  oura.assertCurrentOuraOwnerGuard(ownerGuard);
  return pushed;
}

/**
 * Report an accepted Oura fetch without conflating an empty API window with a
 * completed import. A zero accepted count can still mean rows were deduplicated.
 */
export function successfulOuraSyncResult(
  samplesFetched: number,
  samplesPushed: number,
): SyncResult {
  if (!Number.isInteger(samplesFetched) || samplesFetched < 0) {
    throw new Error("Oura fetched sample count must be a non-negative integer");
  }
  if (!Number.isInteger(samplesPushed) || samplesPushed < 0) {
    throw new Error("Oura pushed sample count must be a non-negative integer");
  }
  return {
    source: "oura",
    samples_fetched: samplesFetched,
    samples_pushed: samplesPushed,
    outcome: samplesFetched > 0 ? "data_observed" : "no_data",
  };
}

/** Pure window computation — incremental by default, widened for backfill. */
export function ouraFetchWindows(now: Date, backfillDays?: number): {
  hrStart: string; hrEnd: string; sleepStart: string; sleepEnd: string;
} {
  const hrStartDate = backfillDays
    ? new Date(now.getTime() - backfillDays * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const sleepStartDate = backfillDays
    ? new Date(now.getTime() - backfillDays * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  return {
    hrStart: hrStartDate.toISOString(), hrEnd: now.toISOString(),
    sleepStart: sleepStartDate.toISOString().slice(0, 10),
    sleepEnd: now.toISOString().slice(0, 10),
  };
}

export interface OuraHeartRateWindow {
  start: string;
  end: string;
}

function parseOuraDay(day: unknown): number | null {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const dayMs = Date.parse(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(dayMs)
    || new Date(dayMs).toISOString().slice(0, 10) !== day
  ) return null;
  return dayMs;
}

/**
 * Oura interprets date filters in the member's local timezone, which is not
 * available on the OAuth token. Query one adjacent calendar day on each side,
 * then filter normalized documents back to the requested UTC interval.
 */
export function ouraDailyActivityQueryBounds(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const startMs = parseOuraDay(startDate);
  const endMs = parseOuraDay(endDate);
  if (startMs === null || endMs === null || startMs > endMs) {
    throw new Error("Oura daily activity range is invalid");
  }
  return {
    startDate: new Date(startMs - OURA_DAILY_ACTIVITY_PERIOD_MS).toISOString().slice(0, 10),
    endDate: new Date(endMs + OURA_DAILY_ACTIVITY_PERIOD_MS).toISOString().slice(0, 10),
  };
}

/**
 * Oura rejects heartrate requests wider than 30 days. Use 28-day inclusive
 * windows to leave a safety margin. Adjacent windows share their exact boundary
 * instant; collectOuraHeartRateRows deterministically removes that duplicate.
 */
export function ouraHeartRateWindows(
  start: string,
  end: string,
): OuraHeartRateWindow[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    throw new Error("Oura heartrate range is invalid");
  }

  const windows: OuraHeartRateWindow[] = [];
  let cursorMs = startMs;
  while (cursorMs <= endMs) {
    const windowEndMs = Math.min(endMs, cursorMs + OURA_MAX_HEART_RATE_WINDOW_MS);
    windows.push({
      start: new Date(cursorMs).toISOString(),
      end: new Date(windowEndMs).toISOString(),
    });
    if (windowEndMs === endMs) break;
    cursorMs = windowEndMs;
  }
  return windows;
}

/**
 * Normalize only fields backed by existing canonical health metric contracts.
 * Provider-specific activity scores remain source-linked context.
 */
export function ouraDailyActivitySamples(
  rows: any[],
  requestedStartDate?: string,
  requestedEndDate?: string,
): HealthSampleDTO[] {
  let requestedStartMs: number | null = null;
  let requestedEndMs: number | null = null;
  if (requestedStartDate !== undefined || requestedEndDate !== undefined) {
    const startMs = parseOuraDay(requestedStartDate);
    const endDayMs = parseOuraDay(requestedEndDate);
    if (startMs === null || endDayMs === null || startMs > endDayMs) {
      throw new Error("Oura daily activity range is invalid");
    }
    requestedStartMs = startMs;
    requestedEndMs = endDayMs + OURA_DAILY_ACTIVITY_PERIOD_MS - 1;
  }

  const samples: HealthSampleDTO[] = [];
  for (const row of rows) {
    const fallbackStartMs = parseOuraDay(row?.day);
    if (fallbackStartMs === null) continue;

    // Daily activity begins at 04:00 in the member's local timezone. Prefer the
    // provider timestamp and normalize its actual instant to UTC. Older rows
    // without it retain an explicit UTC-day fallback.
    let startMs = fallbackStartMs;
    if (row.timestamp !== undefined) {
      if (
        typeof row.timestamp !== "string"
        || row.timestamp.slice(0, 10) !== row.day
        || !/(?:Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)
        || !Number.isFinite(Date.parse(row.timestamp))
      ) continue;
      startMs = Date.parse(row.timestamp);
    }
    const startTime = new Date(startMs).toISOString();
    const endMs = startMs + OURA_DAILY_ACTIVITY_PERIOD_MS - 1;
    const endTime = new Date(endMs).toISOString();
    if (
      requestedStartMs !== null
      && requestedEndMs !== null
      && (endMs < requestedStartMs || startMs > requestedEndMs)
    ) continue;

    const totalSteps = row.total_steps ?? row.steps;
    if (typeof totalSteps === "number" && Number.isFinite(totalSteps) && totalSteps >= 0) {
      samples.push({
        metric_type: "step_count",
        value: totalSteps,
        unit: "count",
        start_time: startTime,
        end_time: endTime,
        source: "oura",
      });
    }
    if (
      typeof row.active_calories === "number"
      && Number.isFinite(row.active_calories)
      && row.active_calories >= 0
    ) {
      samples.push({
        metric_type: "active_energy_burned",
        value: row.active_calories,
        unit: "kcal",
        start_time: startTime,
        end_time: endTime,
        source: "oura",
      });
    }
  }
  return samples;
}

/**
 * Follow Oura's `next_token` contract for every multi-document endpoint. Bad
 * tokens and excessive pagination fail closed instead of trapping the daemon.
 */
export async function collectOuraPages<T>(
  fetchPage: (nextToken?: string) => Promise<{ data?: T[]; next_token?: unknown }>,
  maxPages = OURA_MAX_PAGES_PER_ENDPOINT,
): Promise<T[]> {
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error("Oura pagination limit must be a positive integer");
  }
  const rows: T[] = [];
  const seen = new Set<string>();
  let nextToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(nextToken);
    if (!result || !Array.isArray(result.data)) {
      throw new Error("Oura API returned an invalid multi-document page");
    }
    rows.push(...result.data);
    const rawNext = result.next_token;
    if (rawNext === null || rawNext === undefined || rawNext === "") return rows;
    if (typeof rawNext !== "string" || rawNext.length > 4_096) {
      throw new Error("Oura pagination returned an invalid continuation token");
    }
    if (seen.has(rawNext)) {
      throw new Error("Oura pagination repeated a continuation token");
    }
    seen.add(rawNext);
    nextToken = rawNext;
  }
  throw new Error("Oura pagination exceeded its safety limit");
}

function ouraHeartRateRowKey(row: unknown): string | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id === "string" && record.id) return `id:${record.id}`;
  if (
    typeof record.timestamp === "string"
    && typeof record.bpm === "number"
    && Number.isFinite(record.bpm)
  ) {
    const timestampMs = Date.parse(record.timestamp);
    const timestamp = Number.isFinite(timestampMs)
      ? new Date(timestampMs).toISOString()
      : record.timestamp;
    return `sample:${timestamp}\u0000${
      typeof record.source === "string" ? record.source : ""
    }`;
  }
  return null;
}

/**
 * Fetch every page in every provider-safe heartrate window and deduplicate rows
 * repeated at page/window boundaries. Rows without a stable identity remain.
 */
export async function collectOuraHeartRateRows<T>(
  start: string,
  end: string,
  fetchPage: (
    window: OuraHeartRateWindow,
    nextToken?: string,
  ) => Promise<{ data?: T[]; next_token?: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (const window of ouraHeartRateWindows(start, end)) {
    const windowRows = await collectOuraPages<T>(
      (nextToken) => fetchPage(window, nextToken),
    );
    for (const row of windowRows) {
      const key = ouraHeartRateRowKey(row);
      if (key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }
  }
  return rows;
}

export async function syncAllConnectedSources(client: DaoBrewClient, options: SyncOptions = {}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  if (oura.isConnected()) {
    results.push(await syncOura(client, options));
  }
  if (googleFit.isConnected()) {
    results.push(await syncGoogleFit(client));
  }

  return results;
}

async function syncOura(client: DaoBrewClient, options: SyncOptions = {}): Promise<SyncResult> {
  const loadedToken = oura.loadToken();
  if (!loadedToken) return { source: "oura", samples_pushed: 0, error: "No token found" };
  let token = loadedToken;

  try {
    const ownerGuard = oura.captureCurrentOuraOwnerGuard(token);
    // Refresh the user's local OAuth token when expired.
    if (oura.needsRefresh(token, Date.now())) {
      token = await oura.refreshAccessToken(token);
    }

    const samples: HealthSampleDTO[] = [];

    // Incremental default: last 4 hours for heart rate, last 2 days for
    // sleep/readiness; backfillDays widens both windows.
    const w = ouraFetchWindows(new Date(), options.backfillDays);
    const { hrStart, hrEnd, sleepStart, sleepEnd } = w;

    // Fetch every page across provider-safe heart-rate windows.
    const heartRateRows = await collectOuraHeartRateRows<any>(
      hrStart,
      hrEnd,
      (window, nextToken) => {
        oura.assertCurrentOuraTokenOwner(token);
        return oura.fetchHeartRate(
          token,
          window.start,
          window.end,
          nextToken,
        );
      },
    );
    for (const d of heartRateRows) {
      if (d.bpm != null && d.timestamp) {
        samples.push({
          metric_type: "heart_rate",
          value: d.bpm,
          unit: "bpm",
          start_time: d.timestamp,
          end_time: d.timestamp,
          source: "oura",
        });
      }
    }

    // Sleep and readiness are multi-document routes too; dropping their
    // continuation token makes a historical import silently incomplete.
    const sleepRows = await collectOuraPages<any>(
      (nextToken) => {
        oura.assertCurrentOuraTokenOwner(token);
        return oura.fetchSleep(token, sleepStart, sleepEnd, nextToken);
      },
    );
    for (const s of sleepRows) {
      if (s.average_hrv != null && s.bedtime_start && s.bedtime_end) {
        samples.push({
          metric_type: "heart_rate_variability",
          value: s.average_hrv,
          unit: "ms",
          start_time: s.bedtime_start,
          end_time: s.bedtime_end,
          source: "oura",
        });
      }
      if (s.lowest_heart_rate != null && s.bedtime_start && s.bedtime_end) {
        samples.push({
          metric_type: "resting_heart_rate",
          value: s.lowest_heart_rate,
          unit: "bpm",
          start_time: s.bedtime_start,
          end_time: s.bedtime_end,
          source: "oura",
        });
      }
      if (s.total_sleep_duration != null && s.bedtime_start && s.bedtime_end) {
        samples.push({
          metric_type: "sleep_analysis",
          value: s.total_sleep_duration,
          unit: "seconds",
          start_time: s.bedtime_start,
          end_time: s.bedtime_end,
          source: "oura",
        });
      }
    }

    const readinessRows = await collectOuraPages<any>(
      (nextToken) => {
        oura.assertCurrentOuraTokenOwner(token);
        return oura.fetchDailyReadiness(token, sleepStart, sleepEnd, nextToken);
      },
    );
    for (const r of readinessRows) {
      if (r.temperature_deviation != null && r.day) {
        samples.push({
          metric_type: "body_temperature",
          value: 36.8 + r.temperature_deviation,
          unit: "celsius",
          start_time: r.day + "T00:00:00Z",
          end_time: r.day + "T23:59:59Z",
          source: "oura",
        });
      }
    }

    const activityQuery = ouraDailyActivityQueryBounds(sleepStart, sleepEnd);
    const activityRows = await collectOuraPages<any>(
      (nextToken) => {
        oura.assertCurrentOuraTokenOwner(token);
        return oura.fetchDailyActivity(
          token,
          activityQuery.startDate,
          activityQuery.endDate,
          nextToken,
        );
      },
    );
    samples.push(...ouraDailyActivitySamples(activityRows, sleepStart, sleepEnd));

    oura.assertCurrentOuraTokenOwner(token);
    if (samples.length === 0) {
      return successfulOuraSyncResult(0, 0);
    }

    const samplesPushed = await pushOuraHealthSamplesInBatches(
      client,
      samples,
      ownerGuard,
    );
    return successfulOuraSyncResult(samples.length, samplesPushed);
  } catch (err: any) {
    return {
      source: "oura",
      samples_pushed: err instanceof HealthBatchPushError ? err.samplesPushed : 0,
      error: err.message,
    };
  }
}

async function syncGoogleFit(client: DaoBrewClient): Promise<SyncResult> {
  let token = googleFit.loadToken();
  if (!token) return { source: "google_fit", samples_pushed: 0, error: "No token found" };

  try {
    // Refresh token if expired
    if (Date.now() >= token.expires_at) {
      const clientId = process.env.DAOBREW_GOOGLE_CLIENT_ID ?? "";
      const clientSecret = process.env.DAOBREW_GOOGLE_CLIENT_SECRET ?? "";
      if (clientId && clientSecret) {
        token = await googleFit.refreshAccessToken(token, clientId, clientSecret);
      }
    }

    const samples: HealthSampleDTO[] = [];
    const now = Date.now();
    const fourHoursAgo = now - 4 * 60 * 60 * 1000;

    // Fetch heart rate via aggregate API
    const hrData = await googleFit.fetchHeartRate(token, fourHoursAgo, now);
    if (hrData?.bucket) {
      for (const bucket of hrData.bucket) {
        for (const dataset of bucket.dataset ?? []) {
          for (const point of dataset.point ?? []) {
            for (const val of point.value ?? []) {
              if (val.fpVal != null) {
                const startMs = parseInt(point.startTimeNanos) / 1_000_000;
                const endMs = parseInt(point.endTimeNanos) / 1_000_000;
                samples.push({
                  metric_type: "heart_rate",
                  value: val.fpVal,
                  unit: "bpm",
                  start_time: new Date(startMs).toISOString(),
                  end_time: new Date(endMs).toISOString(),
                  source: "google_fit",
                });
              }
            }
          }
        }
      }
    }

    if (samples.length === 0) {
      return { source: "google_fit", samples_pushed: 0 };
    }

    const result = await client.pushHealthSamples(samples);
    return { source: "google_fit", samples_pushed: result.samples_received };
  } catch (err: any) {
    return { source: "google_fit", samples_pushed: 0, error: err.message };
  }
}
