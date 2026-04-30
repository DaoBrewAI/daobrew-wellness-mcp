import { DaoBrewClient } from "../client.js";
import { HealthSampleDTO } from "../types.js";
import * as oura from "./oura.js";
import * as googleFit from "./google-fit.js";

export interface SyncResult {
  source: string;
  samples_pushed: number;
  error?: string;
}

export async function syncAllConnectedSources(client: DaoBrewClient): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  if (oura.isConnected()) {
    results.push(await syncOura(client));
  }
  if (googleFit.isConnected()) {
    results.push(await syncGoogleFit(client));
  }

  return results;
}

async function syncOura(client: DaoBrewClient): Promise<SyncResult> {
  let token = oura.loadToken();
  if (!token) return { source: "oura", samples_pushed: 0, error: "No token found" };

  try {
    // Refresh token if expired
    if (Date.now() >= token.expires_at) {
      token = await oura.refreshAccessToken(token);
    }

    const samples: HealthSampleDTO[] = [];

    // Use last 4 hours for heart rate, last 2 days for sleep/readiness
    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const hrStart = fourHoursAgo.toISOString();
    const hrEnd = now.toISOString();
    const sleepStart = twoDaysAgo.toISOString().slice(0, 10);
    const sleepEnd = now.toISOString().slice(0, 10);

    // Fetch heart rate
    const hrData = await oura.fetchHeartRate(token, hrStart, hrEnd);
    if (hrData?.data) {
      for (const d of hrData.data) {
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
    }

    // Fetch sleep — extract HRV, resting HR, sleep duration
    const sleepData = await oura.fetchSleep(token, sleepStart, sleepEnd);
    if (sleepData?.data) {
      for (const s of sleepData.data) {
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
    }

    // Fetch readiness — extract body temp deviation
    const readiness = await oura.fetchDailyReadiness(token, sleepStart, sleepEnd);
    if (readiness?.data) {
      for (const r of readiness.data) {
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
    }

    if (samples.length === 0) {
      return { source: "oura", samples_pushed: 0 };
    }

    const result = await client.pushHealthSamples(samples);
    return { source: "oura", samples_pushed: result.samples_received };
  } catch (err: any) {
    return { source: "oura", samples_pushed: 0, error: err.message };
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
