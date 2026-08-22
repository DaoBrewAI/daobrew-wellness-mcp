import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  classifyCompositeRecoveryDays,
  fetchOuraTaskMapContext,
  OuraTaskMapContextDependencies,
  serializeOuraTaskMapContext,
  writeOuraTaskMapContextAtomic,
} from "../src/health/oura-taskmap-context.js";
import {
  parseOuraTaskMapContextCliArgs,
  resolveOuraTaskMapContextRange,
} from "../src/health/oura-taskmap-context-cli.js";
import { OuraToken } from "../src/health/oura.js";

const TOKEN: OuraToken = {
  access_token: "private-access-token-sentinel",
  refresh_token: "private-refresh-token-sentinel",
  expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
  token_type: "Bearer",
};

function emptyDependencies(
  overrides: Partial<OuraTaskMapContextDependencies> = {},
): OuraTaskMapContextDependencies {
  const emptyPage = async () => ({ data: [], next_token: null });
  return {
    loadToken: () => TOKEN,
    assertOwnerBinding: () => {},
    refreshAccessToken: async () => {
      throw new Error("unexpected token refresh");
    },
    fetchDailyReadiness: emptyPage,
    fetchDailySleep: emptyPage,
    fetchDailyActivity: emptyPage,
    fetchSleep: emptyPage,
    fetchHeartRate: emptyPage,
    ...overrides,
  };
}

describe("Oura Task Map read-only context", () => {
  it("follows every page and every provider-safe heartrate window", async () => {
    const calls = new Map<string, Array<string | undefined>>();
    const paged = (
      endpoint: string,
      firstDay: string,
      secondDay: string,
    ) => async (
      _token: OuraToken,
      _start?: string,
      _end?: string,
      nextToken?: string,
    ) => {
      const endpointCalls = calls.get(endpoint) ?? [];
      endpointCalls.push(nextToken);
      calls.set(endpoint, endpointCalls);
      return nextToken === undefined
        ? { data: [{ day: firstDay, score: 80 }], next_token: `${endpoint}-2` }
        : { data: [{ day: secondDay, score: 82 }], next_token: null };
    };
    const activityBounds: Array<[string | undefined, string | undefined]> = [];
    const heartRateWindows = new Set<string>();
    let refreshCalls = 0;
    const dependencies = emptyDependencies({
      refreshAccessToken: async (token) => {
        refreshCalls += 1;
        return token;
      },
      fetchDailyReadiness: paged(
        "daily-readiness",
        "2026-01-02",
        "2026-03-02",
      ),
      fetchDailySleep: paged("daily-sleep", "2026-01-02", "2026-03-02"),
      fetchDailyActivity: async (_token, start, end, nextToken) => {
        activityBounds.push([start, end]);
        return nextToken === undefined
          ? {
            data: [{ day: "2026-01-02", steps: 123_456_789 }],
            next_token: "activity-2",
          }
          : {
            data: [{ day: "2026-03-02", active_calories: 98_765.4321 }],
            next_token: null,
          };
      },
      fetchSleep: paged("sleep", "2026-01-02", "2026-03-02"),
      fetchHeartRate: async (_token, start, end, nextToken) => {
        heartRateWindows.add(`${start}|${end}`);
        return nextToken === undefined
          ? {
            data: [{
              id: `first-${start}`,
              timestamp: start,
              bpm: 41.234567,
            }],
            next_token: "heart-rate-2",
          }
          : {
            data: [{
              id: `second-${end}`,
              timestamp: end,
              bpm: 98.765432,
            }],
            next_token: null,
          };
      },
    });

    const document = await fetchOuraTaskMapContext({
      startDate: "2026-01-01",
      endDate: "2026-03-05",
      now: new Date("2026-03-06T00:00:00.000Z"),
    }, dependencies);

    assert.strictEqual(refreshCalls, 0);
    assert.deepStrictEqual(calls.get("daily-readiness"), [
      undefined,
      "daily-readiness-2",
    ]);
    assert.deepStrictEqual(calls.get("daily-sleep"), [
      undefined,
      "daily-sleep-2",
    ]);
    assert.deepStrictEqual(calls.get("sleep"), [undefined, "sleep-2"]);
    assert.deepStrictEqual(activityBounds, [
      ["2025-12-31", "2026-03-06"],
      ["2025-12-31", "2026-03-06"],
    ]);
    assert.strictEqual(heartRateWindows.size, 3);
    assert.strictEqual(document.coverage.dailyReadinessDays, 2);
    assert.strictEqual(document.coverage.dailySleepDays, 2);
    assert.strictEqual(document.coverage.dailyActivityDays, 2);
    assert.strictEqual(document.coverage.sleepRecords, 2);
    assert.strictEqual(document.coverage.heartRateSamples, 6);
    assert.strictEqual(document.coverage.classifiedDays, 0);
    assert.strictEqual(document.coverage.unknownDays, 64);
  });

  it("refreshes the local token only after actual expiry", async () => {
    const expired = {
      ...TOKEN,
      expires_at: Date.parse("2026-01-01T00:00:00.000Z"),
    };
    const refreshed = {
      ...TOKEN,
      access_token: "refreshed-private-token",
      expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
    };
    let refreshCalls = 0;
    const tokensSeen: OuraToken[] = [];
    const dependencies = emptyDependencies({
      loadToken: () => expired,
      refreshAccessToken: async () => {
        refreshCalls += 1;
        return refreshed;
      },
      fetchDailyReadiness: async (token) => {
        tokensSeen.push(token);
        return { data: [], next_token: null };
      },
    });
    await fetchOuraTaskMapContext({
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      now: new Date("2026-01-02T00:00:00.000Z"),
    }, dependencies);
    assert.strictEqual(refreshCalls, 1);
    assert.strictEqual(tokensSeen[0], refreshed);
  });

  it("classifies deterministically against the trailing personal baseline", () => {
    const rows = Array.from({ length: 10 }, (_, index) => {
      const day = `2026-01-${String(index + 1).padStart(2, "0")}`;
      const score = index < 7 ? 80 : [70, 80, 90][index - 7];
      return { day, score };
    });
    const forward = classifyCompositeRecoveryDays(
      "2026-01-01",
      "2026-01-10",
      rows,
      rows,
    );
    const reversed = classifyCompositeRecoveryDays(
      "2026-01-01",
      "2026-01-10",
      [...rows].reverse(),
      [...rows].reverse(),
    );
    assert.deepStrictEqual(reversed, forward);
    assert.deepStrictEqual(
      forward.map((day) => day.category),
      [
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "below_baseline",
        "within_baseline",
        "above_baseline",
      ],
    );
  });

  it("does not carry sparse observations beyond the 28-calendar-day baseline", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, index) => ({
        day: `2026-01-${String(index + 1).padStart(2, "0")}`,
        score: 80,
      })),
      { day: "2026-03-10", score: 60 },
    ];
    const classified = classifyCompositeRecoveryDays(
      "2026-01-01",
      "2026-03-10",
      rows,
      rows,
    );
    assert.equal(classified.at(-1)?.dayKey, "2026-03-10");
    assert.equal(classified.at(-1)?.category, "unknown");
  });

  it("resolves an exact inclusive backfill range and requires an absolute output", () => {
    const args = parseOuraTaskMapContextCliArgs([
      "--output",
      "/tmp/owner-safe-oura-context.json",
      "--backfill-days",
      "90",
      "--now",
      "2026-07-27T12:00:00.000Z",
    ]);
    assert.deepStrictEqual(resolveOuraTaskMapContextRange(args), {
      startDate: "2026-04-29",
      endDate: "2026-07-27",
      now: new Date("2026-07-27T12:00:00.000Z"),
    });
    assert.throws(
      () => parseOuraTaskMapContextCliArgs([
        "--output",
        "relative.json",
      ]),
      /absolute/,
    );
  });

  it("serializes only bounded categories/counts and writes atomically as 0600", async () => {
    const document = await fetchOuraTaskMapContext({
      startDate: "2026-07-26",
      endDate: "2026-07-26",
      now: new Date("2026-07-27T00:00:00.000Z"),
    }, emptyDependencies({
      fetchDailyReadiness: async () => ({
        data: [{
          day: "2026-07-26",
          score: 73.456789,
          temperature_deviation: 0.123456789,
        }],
        next_token: null,
      }),
      fetchDailySleep: async () => ({
        data: [{ day: "2026-07-26", score: 81.234567 }],
        next_token: null,
      }),
      fetchDailyActivity: async () => ({
        data: [{
          day: "2026-07-26",
          steps: 123_456_789,
          active_calories: 98_765.4321,
        }],
        next_token: null,
      }),
      fetchSleep: async () => ({
        data: [{
          day: "2026-07-26",
          average_hrv: 41.234567,
          lowest_heart_rate: 49.876543,
        }],
        next_token: null,
      }),
      fetchHeartRate: async () => ({
        data: [{
          id: "private-heart-rate-row",
          timestamp: "2026-07-26T12:00:00.000Z",
          bpm: 98.765432,
        }],
        next_token: null,
      }),
    }));
    const serialized = serializeOuraTaskMapContext(document);
    for (const secret of [
      TOKEN.access_token,
      TOKEN.refresh_token!,
      "73.456789",
      "81.234567",
      "123456789",
      "98765.4321",
      "41.234567",
      "49.876543",
      "98.765432",
    ]) {
      assert.ok(!serialized.includes(secret), `serialized raw sentinel ${secret}`);
    }
    const forbiddenKeys = new Set([
      "access_token",
      "refresh_token",
      "score",
      "temperature_deviation",
      "steps",
      "active_calories",
      "average_hrv",
      "lowest_heart_rate",
      "bpm",
      "value",
    ]);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          assert.ok(!forbiddenKeys.has(key), `serialized forbidden key ${key}`);
          visit(child);
        }
      }
    };
    visit(JSON.parse(serialized));

    const temporaryRoot = mkdtempSync(join(tmpdir(), "oura-taskmap-context-"));
    try {
      const output = join(temporaryRoot, "private", "context.json");
      writeOuraTaskMapContextAtomic(output, document);
      assert.strictEqual(statSync(output).mode & 0o777, 0o600);
      assert.deepStrictEqual(JSON.parse(readFileSync(output, "utf8")), document);
      assert.throws(
        () => writeOuraTaskMapContextAtomic("relative-context.json", document),
        /absolute/,
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
