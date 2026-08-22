import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildCoverageTable,
  capClaimByCoverage,
  detectMockContamination,
  RawCoverageSample,
} from "../src/engine/coverage.js";

// Compiled tests run from dist/tests/, sources from tests/ — resolve the
// fixtures dir from the package root either way.
const PACKAGE_ROOT = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.join(__dirname, "..", "..")
  : path.join(__dirname, "..");
const FIXTURES = path.join(
  PACKAGE_ROOT,
  "fixtures",
  "causal-engine-v2",
  "data",
  "reunified",
);

interface UnifiedFixture {
  metrics: Record<string, { ts: string; value: number }[]>;
}

function unifiedSamples(): RawCoverageSample[] {
  const unified = JSON.parse(
    readFileSync(path.join(FIXTURES, "unified_v2.json"), "utf8"),
  ) as UnifiedFixture;
  const samples: RawCoverageSample[] = [];
  for (const [metric, rows] of Object.entries(unified.metrics)) {
    for (const row of rows) samples.push({ metric, timestamp: row.ts });
  }
  return samples;
}

// The 8 vacuum days the round-4 findings name inside the May-June void
// window — coverage must call every one of them unworn (F4 gate).
const KNOWN_VACUUM_DAYS = [
  "2026-05-29",
  "2026-05-31",
  "2026-06-04",
  "2026-06-05",
  "2026-06-10",
  "2026-06-19",
  "2026-06-20",
  "2026-06-21",
];

test("coverage table reproduces the 63 worn days of the unified snapshot", () => {
  const table = buildCoverageTable(unifiedSamples());
  assert.equal(table.wornDays.length, 63);
  assert.equal(table.span?.start, "2026-03-18");
  assert.equal(table.span?.end, "2026-07-02");
  for (const day of KNOWN_VACUUM_DAYS) {
    assert.equal(table.days[day]?.worn ?? false, false, `${day} must be unworn`);
    assert.ok(
      table.vacuumDays.includes(day),
      `${day} must be a vacuum day (zero raw samples)`,
    );
  }
});

test("claim capping: a cited vacuum day drops attribution to context-only", () => {
  const table = buildCoverageTable(unifiedSamples());
  // pricing candidate shape from the findings: cited 6/09 (worn), 6/10
  // (vacuum), 6/26 (worn) — the 6/10 gap caps the claim.
  const capped = capClaimByCoverage(
    "attribution_candidate",
    ["2026-06-09", "2026-06-10", "2026-06-26"],
    table,
  );
  assert.equal(capped.level, "context_only");
  assert.deepEqual(capped.unbackedDates, ["2026-06-10"]);
  assert.ok(capped.cappedBecause?.includes("2026-06-10"));

  // demo_polish shape: all three cited days worn — claim survives.
  const passed = capClaimByCoverage(
    "attribution_candidate",
    ["2026-06-13", "2026-06-14", "2026-06-26"],
    table,
  );
  assert.equal(passed.level, "attribution_candidate");
  assert.equal(passed.unbackedDates.length, 0);

  const empty = capClaimByCoverage("attribution_candidate", [], table);
  assert.equal(empty.level, "insufficient_power");
});

test("mock contamination: state windows without raw rows are synthetic (F8)", () => {
  const samples: RawCoverageSample[] = [
    { metric: "heart_rate", timestamp: "2026-06-23T10:00:00+00:00" },
    { metric: "heart_rate", timestamp: "2026-06-23T11:00:00+00:00" },
  ];
  const t = (iso: string) => Date.parse(iso) / 1000;
  const report = detectMockContamination(
    [
      // real: raw rows inside
      { id: "w1", startTs: t("2026-06-23T09:00:00Z"), endTs: t("2026-06-23T12:00:00Z") },
      // mock: state exists after the sync break, no raw rows
      { id: "w2", startTs: t("2026-06-24T09:00:00Z"), endTs: t("2026-06-24T21:00:00Z") },
    ],
    samples,
  );
  assert.deepEqual(report.clean.map((w) => w.id), ["w1"]);
  assert.deepEqual(report.contaminated.map((w) => w.id), ["w2"]);
});

test("coverage fraction counts distinct 2h HR buckets", () => {
  const samples: RawCoverageSample[] = [
    // three samples in the same local bucket + one in another bucket,
    // plus enough HR rows to make the day worn
    { metric: "heart_rate", timestamp: "2026-06-01T10:05:00-07:00" },
    { metric: "heart_rate", timestamp: "2026-06-01T10:25:00-07:00" },
    { metric: "heart_rate", timestamp: "2026-06-01T11:15:00-07:00" },
    { metric: "heart_rate", timestamp: "2026-06-01T15:00:00-07:00" },
  ];
  const table = buildCoverageTable(samples);
  const day = table.days["2026-06-01"];
  assert.ok(day.worn);
  assert.equal(day.hrBucketsCovered, 2);
  assert.equal(day.coverageFraction, 2 / 12);
});
