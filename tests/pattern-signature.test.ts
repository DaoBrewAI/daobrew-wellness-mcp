import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildCoverageTable } from "../src/engine/coverage.js";
import {
  computePatternSignatures,
  RawSample,
  UNMEASURABLE_PATTERNS,
  wornDominantDistribution,
} from "../src/engine/signals/patterns.js";

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

function unifiedSamples(): RawSample[] {
  const unified = JSON.parse(
    readFileSync(path.join(FIXTURES, "unified_v2.json"), "utf8"),
  ) as UnifiedFixture;
  const samples: RawSample[] = [];
  for (const [metric, rows] of Object.entries(unified.metrics)) {
    for (const row of rows) {
      samples.push({ metric, value: row.value, timestamp: row.ts });
    }
  }
  return samples;
}

test("raw signature reproduces the 63-worn-day golden distribution; DEPLETION hard-zero", () => {
  const samples = unifiedSamples();
  const coverage = buildCoverageTable(
    samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })),
  );
  const signatures = computePatternSignatures(samples, coverage);
  const dist = wornDominantDistribution(signatures);

  // The P1 gate: raw dominant on worn days, DEPLETION exactly 0.
  assert.equal(dist["TENSION"], 40);
  assert.equal(dist["OVERDRIVE"], 18);
  assert.equal(dist["STAGNATION"], 4);
  assert.equal(dist["CONSTRICTION"], 1);
  assert.equal(dist["DEPLETION"] ?? 0, 0, "DEPLETION must never appear in raw signal");

  const worn = signatures.filter((s) => s.quality === "real_inference");
  assert.equal(worn.length, 63);
});

test("every signature carries confidence + coverage; unmeasurable patterns are capped", () => {
  const samples = unifiedSamples();
  const coverage = buildCoverageTable(
    samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })),
  );
  const signatures = computePatternSignatures(samples, coverage);

  for (const sig of signatures) {
    assert.ok(sig.confidence >= 0 && sig.confidence <= 1);
    assert.ok(sig.coverage >= 0 && sig.coverage <= 1);
    if (UNMEASURABLE_PATTERNS.has(sig.dominant)) {
      assert.ok(
        sig.flaggedUnmeasurable && sig.confidence <= 0.2,
        `${sig.date}: unmeasurable dominant must be flagged and low-confidence`,
      );
    }
  }

  // HR-separable dominants (TENSION/OVERDRIVE) carry the hr-separable tag.
  const hrDay = signatures.find(
    (s) => s.dominant === "OVERDRIVE" && s.quality === "real_inference",
  );
  assert.ok(hrDay);
  assert.equal(hrDay.measurability, "hr-separable");
});

test("no-data days resolve to BALANCED, never a fabricated depletion", () => {
  const samples = unifiedSamples();
  const coverage = buildCoverageTable(
    samples.map((s) => ({ metric: s.metric, timestamp: s.timestamp })),
  );
  const signatures = computePatternSignatures(samples, coverage);
  const vacuum = signatures.filter((s) => s.quality === "no_data");
  assert.ok(vacuum.length > 0);
  for (const sig of vacuum) {
    assert.equal(sig.dominant, "BALANCED");
    assert.equal(sig.confidence, 0);
  }
});
