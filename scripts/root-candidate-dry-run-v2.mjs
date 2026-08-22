#!/usr/bin/env node
/**
 * Reasoner v2 dry-run — causal-engine-v2 P3 gate artifact.
 *
 * Runs the three round-4 candidates through the 7th gate on the REAL
 * unified snapshot (63 worn days), then sweeps the gate thresholds to
 * show how candidate verdicts move — the honesty knobs the CEO owns.
 *
 * Axis inputs are fixture-derived from the round-4 findings
 * (fixtures/causal-engine-v2/findings.md F4/F5): cited days and source
 * mixes are the documented ones; enrichment hit-rates encode the
 * documented control ratios. No live data is read.
 *
 * Usage: node scripts/root-candidate-dry-run-v2.mjs [--json <outfile>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

const { buildV2Context, runEnrichmentGateWithCoverage } = await import(
  path.join(ROOT, "dist/src/engine/reasoner/v2Context.js")
);
const { wornDominantDistribution, computePatternSignatures } = await import(
  path.join(ROOT, "dist/src/engine/signals/patterns.js")
);
const { buildCoverageTable } = await import(
  path.join(ROOT, "dist/src/engine/coverage.js")
);

// ---- load the real snapshot -------------------------------------------
const unified = JSON.parse(
  readFileSync(
    path.join(ROOT, "fixtures/causal-engine-v2/data/reunified/unified_v2.json"),
    "utf8",
  ),
);
const samples = [];
for (const [metric, rows] of Object.entries(unified.metrics)) {
  for (const row of rows) samples.push({ metric, value: row.value, timestamp: row.ts });
}

// ---- the three round-4 candidates (findings F4) ------------------------
// demo_polish: three flagged evenings, all worn, all multi-source.
// pricing:     cited days include 6/10 — a vacuum day (no wear at all).
// attribution: only two cited days exist.
const CANDIDATES = [
  {
    name: "demo_polish",
    axis: {
      theme: "demo_readiness",
      targetHits: 3,
      targetN: 6,
      referenceRate: 0, // never appears in the reference class -> ratio inf
      referenceN: 27,
      citedDays: [
        { date: "2026-06-13", sources: ["granola", "memory"] },
        { date: "2026-06-14", sources: ["calendar", "memory"] },
        { date: "2026-06-26", sources: ["granola", "memory"] },
      ],
      rtmSuspected: true,
    },
    documented: "PASS — 3/3 backed, real_inference, attribution-candidate cap",
  },
  {
    name: "pricing",
    axis: {
      theme: "pricing_monetization",
      // documented memory-axis control ratio 1.46x (rate 0.5 / ref 0.343)
      targetHits: 3,
      targetN: 6,
      referenceRate: 0.343,
      referenceN: 27,
      citedDays: [
        { date: "2026-06-09", sources: ["granola", "memory"] },
        { date: "2026-06-10", sources: ["granola", "memory"] }, // vacuum day
        { date: "2026-06-26", sources: ["calendar", "memory"] },
      ],
      rtmSuspected: true,
    },
    documented: "FAIL — 6/10 has no wear; honest no_data/insufficient, never a candidate",
  },
  {
    name: "attribution",
    axis: {
      theme: "causal_rootcause",
      // documented memory-axis control ratio 1.61x (rate 0.333 / ref 0.207)
      targetHits: 2,
      targetN: 6,
      referenceRate: 0.207,
      referenceN: 27,
      citedDays: [
        { date: "2026-06-22", sources: ["granola", "memory"] },
        { date: "2026-06-26", sources: ["memory", "calendar"] },
      ],
      rtmSuspected: false,
    },
    documented: "FAIL — n=2 cited days < 3; insufficient_power",
  },
];

// ---- run ----------------------------------------------------------------
const v2 = buildV2Context(samples);
if (!v2) throw new Error("v2 context failed to build");

const coverage = v2.coverage;
const signatures = computePatternSignatures(samples, coverage);
const distribution = wornDominantDistribution(signatures);

const report = {
  snapshot: {
    worn_days: coverage.wornDays.length,
    vacuum_days_in_span: coverage.vacuumDays.length,
    raw_dominant_distribution: distribution,
  },
  default_thresholds: v2.thresholds,
  candidates: {},
  threshold_sweep: [],
};

console.log("=== Reasoner v2 dry-run · real 63-day snapshot ===\n");
console.log(
  `worn days: ${coverage.wornDays.length} · raw dominant: ${JSON.stringify(distribution)}\n`,
);

console.log("--- candidate verdicts (default contract: ratio>=2.0, backed>=3, sources>=2) ---");
for (const candidate of CANDIDATES) {
  const { gate, coverageCap } = runEnrichmentGateWithCoverage(candidate.axis, coverage);
  report.candidates[candidate.name] = {
    verdict: gate.verdict,
    ratio: Number.isFinite(gate.ratio) ? gate.ratio : "inf",
    backed_days: gate.backedDays,
    multi_source_backed_days: gate.multiSourceBackedDays,
    coverage_cap: coverageCap.level,
    unbacked_dates: coverageCap.unbackedDates,
    rtm_flags: gate.flags,
    reasons: gate.reasons,
    documented_expectation: candidate.documented,
  };
  console.log(
    `${candidate.name.padEnd(12)} verdict=${gate.verdict.padEnd(22)} ratio=${String(Number.isFinite(gate.ratio) ? gate.ratio : "inf").padEnd(5)} backed=${gate.backedDays.length}/${candidate.axis.citedDays.length} cap=${coverageCap.level}${coverageCap.unbackedDates.length ? ` (no wear: ${coverageCap.unbackedDates.join(",")})` : ""}`,
  );
}

// ---- threshold sensitivity sweep ---------------------------------------
console.log("\n--- threshold sweep (verdict per candidate) ---");
console.log("ratio\\backed |  " + CANDIDATES.map((c) => c.name.padEnd(22)).join(""));
for (const minRatio of [1.5, 2.0, 2.5]) {
  for (const minBackedDays of [2, 3, 4]) {
    const thresholds = { minRatio, minBackedDays, minSourcesPerDay: 2 };
    const row = { minRatio, minBackedDays, verdicts: {} };
    const cells = [];
    for (const candidate of CANDIDATES) {
      const { gate } = runEnrichmentGateWithCoverage(candidate.axis, coverage, thresholds);
      row.verdicts[candidate.name] = gate.verdict;
      cells.push(gate.verdict.padEnd(22));
    }
    report.threshold_sweep.push(row);
    console.log(`${String(minRatio).padEnd(5)} b>=${minBackedDays}   |  ` + cells.join(""));
  }
}

const outFlag = process.argv.indexOf("--json");
if (outFlag !== -1 && process.argv[outFlag + 1]) {
  const out = process.argv[outFlag + 1];
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nreport written: ${out}`);
}
