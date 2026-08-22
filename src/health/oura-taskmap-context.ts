import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import * as oura from "./oura.js";
import {
  collectOuraHeartRateRows,
  collectOuraPages,
  ouraDailyActivityQueryBounds,
} from "./sync.js";
import type {
  PrivacySafeOuraContext,
} from "../engine/taskmap/body-context.js";

export const OURA_TASKMAP_CONTEXT_VERSION = "oura-taskmap-context.v1" as const;
export const OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION =
  "personal-baseline-composite-recovery.v2" as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPORT_DAYS = 10_000;
const BASELINE_WINDOW_DAYS = 28;
const MINIMUM_BASELINE_DAYS = 7;
const MAD_SCALE = 1.4826;
const ROBUST_SPREAD_MULTIPLIER = 1.5;
const MINIMUM_BAND_POINTS = 5;

export type OuraTaskMapBodyCategory =
  | "below_baseline"
  | "within_baseline"
  | "above_baseline"
  | "unknown";

export interface OuraTaskMapContextDay {
  dayKey: string;
  axis: "composite_recovery";
  category: OuraTaskMapBodyCategory;
}

interface OuraTaskMapEndpointCoverage {
  /** Rows with a valid provider day inside the requested inclusive range. */
  rows: number;
  /** Unique provider days represented by those rows. */
  days: number;
}

export interface OuraTaskMapContextDocument extends PrivacySafeOuraContext {
  contractVersion: typeof OURA_TASKMAP_CONTEXT_VERSION;
  sourceKind: "oura";
  classifier: {
    version: typeof OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION;
    axis: "composite_recovery";
    method: string;
    minimumMetricsPerDay: 2;
    lowerThreshold: -1;
    upperThreshold: 1;
  };
  days: OuraTaskMapContextDay[];
  privacy: {
    rawBiometricsStored: false;
    sourceBodiesStored: false;
    localPathsStored: false;
  };
}

interface OuraPage<T = unknown> {
  data?: T[];
  next_token?: unknown;
}

export interface OuraTaskMapContextDependencies {
  loadToken: () => oura.OuraToken | null;
  assertOwnerBinding: (token: oura.OuraToken) => void;
  refreshAccessToken: (token: oura.OuraToken) => Promise<oura.OuraToken>;
  fetchDailyReadiness: (
    token: oura.OuraToken,
    startDate?: string,
    endDate?: string,
    nextToken?: string,
  ) => Promise<OuraPage>;
  fetchDailySleep: (
    token: oura.OuraToken,
    startDate?: string,
    endDate?: string,
    nextToken?: string,
  ) => Promise<OuraPage>;
  fetchDailyActivity: (
    token: oura.OuraToken,
    startDate?: string,
    endDate?: string,
    nextToken?: string,
  ) => Promise<OuraPage>;
  fetchSleep: (
    token: oura.OuraToken,
    startDate?: string,
    endDate?: string,
    nextToken?: string,
  ) => Promise<OuraPage>;
  fetchHeartRate: (
    token: oura.OuraToken,
    startDate?: string,
    endDate?: string,
    nextToken?: string,
  ) => Promise<OuraPage>;
}

export interface FetchOuraTaskMapContextOptions {
  startDate: string;
  endDate: string;
  /** Fix this in replays; defaults to the current instant in the live CLI. */
  now?: Date;
}

export const DEFAULT_OURA_TASKMAP_CONTEXT_DEPENDENCIES:
OuraTaskMapContextDependencies = {
  loadToken: oura.loadToken,
  assertOwnerBinding: oura.assertCurrentOuraTokenOwner,
  refreshAccessToken: oura.refreshAccessToken,
  fetchDailyReadiness: oura.fetchDailyReadiness,
  fetchDailySleep: oura.fetchDailySleep,
  fetchDailyActivity: oura.fetchDailyActivity,
  fetchSleep: oura.fetchSleep,
  fetchHeartRate: oura.fetchHeartRate,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dayMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed)
    || new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return parsed;
}

function requireDay(value: string, label: string): number {
  const parsed = dayMs(value);
  if (parsed === null) throw new Error(`${label} must be a valid YYYY-MM-DD date`);
  return parsed;
}

function enumerateDays(startDate: string, endDate: string): string[] {
  const startMs = requireDay(startDate, "startDate");
  const endMs = requireDay(endDate, "endDate");
  if (startMs > endMs) throw new Error("Oura Task Map date range is reversed");
  const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (dayCount > MAX_EXPORT_DAYS) {
    throw new Error(`Oura Task Map date range exceeds ${MAX_EXPORT_DAYS} days`);
  }
  return Array.from(
    { length: dayCount },
    (_, index) => new Date(startMs + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function rowDay(row: unknown, timestampFields: readonly string[] = []): string | null {
  if (!isRecord(row)) return null;
  const direct = dayMs(row.day);
  if (direct !== null) return String(row.day);
  for (const field of timestampFields) {
    const value = row[field];
    if (
      typeof value === "string"
      && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && Number.isFinite(Date.parse(value))
    ) {
      return new Date(Date.parse(value)).toISOString().slice(0, 10);
    }
  }
  return null;
}

function rowsInRange(
  rows: readonly unknown[],
  rangeDays: ReadonlySet<string>,
  timestampFields: readonly string[] = [],
): Array<{ row: Record<string, unknown>; day: string }> {
  const selected: Array<{ row: Record<string, unknown>; day: string }> = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const day = rowDay(row, timestampFields);
    if (day !== null && rangeDays.has(day)) selected.push({ row, day });
  }
  return selected;
}

function coverage(
  rows: readonly unknown[],
  rangeDays: ReadonlySet<string>,
  timestampFields: readonly string[] = [],
): OuraTaskMapEndpointCoverage {
  const selected = rowsInRange(rows, rangeDays, timestampFields);
  return {
    rows: selected.length,
    days: new Set(selected.map((item) => item.day)).size,
  };
}

function finiteProviderScore(value: unknown): number | null {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 100
    ? value
    : null;
}

function dailyScoreMap(
  rows: readonly unknown[],
  rangeDays: ReadonlySet<string>,
): Map<string, number> {
  const scores = new Map<string, number[]>();
  for (const { row, day } of rowsInRange(rows, rangeDays)) {
    const score = finiteProviderScore(row.score);
    if (score === null) continue;
    const values = scores.get(day) ?? [];
    values.push(score);
    scores.set(day, values);
  }
  return new Map([...scores.entries()].map(([day, values]) => [
    day,
    values.reduce((sum, value) => sum + value, 0) / values.length,
  ]));
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median requires at least one value");
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

/**
 * Deterministic personal-baseline classifier, version 1.
 *
 * For each day, form an internal composite only when both Oura daily readiness
 * and daily sleep scores exist; the composite is their arithmetic mean. Compare
 * it only with valid personal composites from the preceding 28 calendar days.
 * Once at least seven baseline days exist, center on their median and estimate spread with
 * 1.4826 × median absolute deviation. The neutral half-band is the larger of
 * five provider points or 1.5 × that robust spread. Values outside the band are
 * labeled below/above; all other values are within. Raw component, composite,
 * center, spread, and thresholds are discarded and never serialized.
 *
 * This is prioritization context relative to one person's recent baseline. It
 * is not a medical interpretation and cannot establish causality.
 */
export function classifyCompositeRecoveryDays(
  startDate: string,
  endDate: string,
  dailyReadinessRows: readonly unknown[],
  dailySleepRows: readonly unknown[],
): OuraTaskMapContextDay[] {
  const days = enumerateDays(startDate, endDate);
  const rangeDays = new Set(days);
  const readiness = dailyScoreMap(dailyReadinessRows, rangeDays);
  const sleep = dailyScoreMap(dailySleepRows, rangeDays);
  const composites = new Map<string, number>();
  for (const day of days) {
    const readinessValue = readiness.get(day);
    const sleepValue = sleep.get(day);
    if (readinessValue === undefined || sleepValue === undefined) continue;
    composites.set(day, (readinessValue + sleepValue) / 2);
  }

  let prior: Array<{ timestamp: number; value: number }> = [];
  return days.map((day): OuraTaskMapContextDay => {
    const timestamp = requireDay(day, "classification day");
    const baselineStart = timestamp - BASELINE_WINDOW_DAYS * DAY_MS;
    prior = prior.filter((entry) => entry.timestamp >= baselineStart);
    const composite = composites.get(day);
    let bodyCategory: OuraTaskMapBodyCategory = "unknown";
    if (composite !== undefined && prior.length >= MINIMUM_BASELINE_DAYS) {
      const baseline = prior.map((entry) => entry.value);
      const center = median(baseline);
      const mad = median(baseline.map((value) => Math.abs(value - center)));
      const halfBand = Math.max(
        MINIMUM_BAND_POINTS,
        ROBUST_SPREAD_MULTIPLIER * MAD_SCALE * mad,
      );
      if (composite < center - halfBand) bodyCategory = "below_baseline";
      else if (composite > center + halfBand) bodyCategory = "above_baseline";
      else bodyCategory = "within_baseline";
    }
    if (composite !== undefined) prior.push({ timestamp, value: composite });
    return {
      dayKey: day,
      axis: "composite_recovery",
      category: bodyCategory,
    };
  });
}

export async function fetchOuraTaskMapContext(
  options: FetchOuraTaskMapContextOptions,
  dependencies: OuraTaskMapContextDependencies =
    DEFAULT_OURA_TASKMAP_CONTEXT_DEPENDENCIES,
): Promise<OuraTaskMapContextDocument> {
  const days = enumerateDays(options.startDate, options.endDate);
  const rangeDays = new Set(days);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("now must be a valid instant");

  const loadedToken = dependencies.loadToken();
  if (!loadedToken) {
    throw new Error("Oura connection is unavailable; authorize Oura before exporting context");
  }
  const token = oura.needsRefresh(loadedToken, now.getTime())
    ? await dependencies.refreshAccessToken(loadedToken)
    : loadedToken;

  const dailyReadiness = await collectOuraPages<unknown>(
    (nextToken) => {
      dependencies.assertOwnerBinding(token);
      return dependencies.fetchDailyReadiness(
        token,
        options.startDate,
        options.endDate,
        nextToken,
      );
    },
  );
  const dailySleep = await collectOuraPages<unknown>(
    (nextToken) => {
      dependencies.assertOwnerBinding(token);
      return dependencies.fetchDailySleep(
        token,
        options.startDate,
        options.endDate,
        nextToken,
      );
    },
  );
  const activityQuery = ouraDailyActivityQueryBounds(
    options.startDate,
    options.endDate,
  );
  const dailyActivity = await collectOuraPages<unknown>(
    (nextToken) => {
      dependencies.assertOwnerBinding(token);
      return dependencies.fetchDailyActivity(
        token,
        activityQuery.startDate,
        activityQuery.endDate,
        nextToken,
      );
    },
  );
  const sleep = await collectOuraPages<unknown>(
    (nextToken) => {
      dependencies.assertOwnerBinding(token);
      return dependencies.fetchSleep(
        token,
        options.startDate,
        options.endDate,
        nextToken,
      );
    },
  );
  const heartRate = await collectOuraHeartRateRows<unknown>(
    `${options.startDate}T00:00:00.000Z`,
    `${options.endDate}T23:59:59.999Z`,
    (window, nextToken) => {
      dependencies.assertOwnerBinding(token);
      return dependencies.fetchHeartRate(
        token,
        window.start,
        window.end,
        nextToken,
      );
    },
  );

  const endpoints = {
    daily_readiness: coverage(dailyReadiness, rangeDays),
    daily_sleep: coverage(dailySleep, rangeDays),
    daily_activity: coverage(dailyActivity, rangeDays, ["timestamp"]),
    sleep: coverage(sleep, rangeDays, ["bedtime_start", "bedtime_end"]),
    heartrate: coverage(heartRate, rangeDays, ["timestamp"]),
  };
  const classifiedDays = classifyCompositeRecoveryDays(
    options.startDate,
    options.endDate,
    dailyReadiness,
    dailySleep,
  );
  const classifiedCount = classifiedDays.filter(
    (day) => day.category !== "unknown",
  ).length;
  const document: OuraTaskMapContextDocument = {
    contractVersion: OURA_TASKMAP_CONTEXT_VERSION,
    sourceKind: "oura",
    generatedAt: now.toISOString(),
    coverage: {
      startDay: options.startDate,
      endDay: options.endDate,
      dailyActivityDays: endpoints.daily_activity.days,
      dailyReadinessDays: endpoints.daily_readiness.days,
      dailySleepDays: endpoints.daily_sleep.days,
      sleepRecords: endpoints.sleep.rows,
      heartRateSamples: endpoints.heartrate.rows,
      classifiedDays: classifiedCount,
      unknownDays: classifiedDays.length - classifiedCount,
    },
    classifier: {
      version: OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION,
      axis: "composite_recovery",
      method:
        "Trailing 28-calendar-day personal median/MAD; band=max(5 points, 1.5 scaled MAD); context only, not medical or causal.",
      minimumMetricsPerDay: 2,
      lowerThreshold: -1,
      upperThreshold: 1,
    },
    days: classifiedDays,
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  };
  dependencies.assertOwnerBinding(token);
  assertOwnerSafeOuraTaskMapContext(document);
  return document;
}

function assertExactKeys(
  value: object,
  allowed: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains an unexpected field`);
  }
}

export function assertOwnerSafeOuraTaskMapContext(
  document: OuraTaskMapContextDocument,
): void {
  if (!isRecord(document)) throw new Error("Oura Task Map context must be an object");
  assertExactKeys(document, [
    "contractVersion",
    "sourceKind",
    "generatedAt",
    "coverage",
    "classifier",
    "days",
    "privacy",
  ], "Oura Task Map context");
  if (
    document.contractVersion !== OURA_TASKMAP_CONTEXT_VERSION
    || document.sourceKind !== "oura"
  ) {
    throw new Error("Oura Task Map context identity is invalid");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(document.generatedAt)
    || !/(?:Z|[+-]\d{2}:\d{2})$/.test(document.generatedAt)
    || !Number.isFinite(Date.parse(document.generatedAt))
  ) {
    throw new Error("Oura Task Map generatedAt must be RFC3339");
  }

  assertExactKeys(document.coverage, [
    "startDay",
    "endDay",
    "dailyActivityDays",
    "dailyReadinessDays",
    "dailySleepDays",
    "sleepRecords",
    "heartRateSamples",
    "classifiedDays",
    "unknownDays",
  ], "coverage");
  const expectedDays = enumerateDays(
    document.coverage.startDay,
    document.coverage.endDay,
  );
  assertExactKeys(document.classifier, [
    "version",
    "axis",
    "method",
    "minimumMetricsPerDay",
    "lowerThreshold",
    "upperThreshold",
  ], "classifier");
  if (
    document.classifier.version
      !== OURA_COMPOSITE_RECOVERY_CLASSIFIER_VERSION
    || document.classifier.axis !== "composite_recovery"
    || document.classifier.method.length === 0
    || document.classifier.method.length > 160
    || document.classifier.minimumMetricsPerDay !== 2
    || document.classifier.lowerThreshold !== -1
    || document.classifier.upperThreshold !== 1
  ) {
    throw new Error("classifier contract is invalid");
  }

  if (!Array.isArray(document.days) || document.days.length !== expectedDays.length) {
    throw new Error("Oura Task Map day coverage is incomplete");
  }
  const categories = new Set<OuraTaskMapBodyCategory>([
    "below_baseline",
    "within_baseline",
    "above_baseline",
    "unknown",
  ]);
  document.days.forEach((day, index) => {
    if (!isRecord(day)) throw new Error("Oura Task Map day must be an object");
    assertExactKeys(day, ["dayKey", "axis", "category"], "Oura Task Map day");
    if (
      day.dayKey !== expectedDays[index]
      || day.axis !== "composite_recovery"
      || !categories.has(day.category)
    ) {
      throw new Error("Oura Task Map day is invalid");
    }
  });
  assertExactKeys(document.privacy, [
    "rawBiometricsStored",
    "sourceBodiesStored",
    "localPathsStored",
  ], "privacy");
  if (
    document.privacy.rawBiometricsStored !== false
    || document.privacy.sourceBodiesStored !== false
    || document.privacy.localPathsStored !== false
  ) {
    throw new Error("Oura Task Map privacy boundary is invalid");
  }
  const classifiedCount = document.days.filter(
    (day) => day.category !== "unknown",
  ).length;
  const coverageCounts = [
    document.coverage.dailyActivityDays,
    document.coverage.dailyReadinessDays,
    document.coverage.dailySleepDays,
    document.coverage.sleepRecords,
    document.coverage.heartRateSamples,
    document.coverage.classifiedDays,
    document.coverage.unknownDays,
  ];
  if (
    coverageCounts.some((value) => !Number.isInteger(value) || value < 0)
    || document.coverage.dailyActivityDays > document.days.length
    || document.coverage.dailyReadinessDays > document.days.length
    || document.coverage.dailySleepDays > document.days.length
    || document.coverage.classifiedDays !== classifiedCount
    || document.coverage.unknownDays !== document.days.length - classifiedCount
  ) {
    throw new Error("Oura Task Map coverage does not match its bounded data");
  }
}

export function serializeOuraTaskMapContext(
  document: OuraTaskMapContextDocument,
): string {
  assertOwnerSafeOuraTaskMapContext(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function writeOuraTaskMapContextAtomic(
  outputPath: string,
  document: OuraTaskMapContextDocument,
): void {
  if (!isAbsolute(outputPath)) {
    throw new Error("Oura Task Map output path must be absolute");
  }
  const serialized = serializeOuraTaskMapContext(document);
  const directory = dirname(outputPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryDirectory = mkdtempSync(
    join(directory, ".oura-taskmap-context-"),
  );
  chmodSync(temporaryDirectory, 0o700);
  const temporaryPath = join(temporaryDirectory, "context.json");
  try {
    writeFileSync(temporaryPath, serialized, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    chmodSync(temporaryPath, 0o600);
    const temporaryStat = lstatSync(temporaryPath);
    if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink()) {
      throw new Error("temporary Oura Task Map output must be a regular file");
    }
    renameSync(temporaryPath, outputPath);
    chmodSync(outputPath, 0o600);
    rmdirSync(temporaryDirectory);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (existsSync(temporaryDirectory)) rmdirSync(temporaryDirectory);
    throw error;
  }
}

export function summarizeOuraTaskMapContext(
  document: OuraTaskMapContextDocument,
): {
  status: "ok";
  contractVersion: typeof OURA_TASKMAP_CONTEXT_VERSION;
  sourceKind: "oura";
  coverage: OuraTaskMapContextDocument["coverage"];
  classifiedDays: number;
  categories: Record<OuraTaskMapBodyCategory, number>;
} {
  assertOwnerSafeOuraTaskMapContext(document);
  const categories: Record<OuraTaskMapBodyCategory, number> = {
    below_baseline: 0,
    within_baseline: 0,
    above_baseline: 0,
    unknown: 0,
  };
  for (const day of document.days) categories[day.category] += 1;
  return {
    status: "ok",
    contractVersion: document.contractVersion,
    sourceKind: document.sourceKind,
    coverage: document.coverage,
    classifiedDays: document.coverage.classifiedDays,
    categories,
  };
}
