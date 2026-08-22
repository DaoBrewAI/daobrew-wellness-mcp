import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Reasoner } from "../src/engine/reasoner/Reasoner.js";
import {
  buildV2Context,
  claimLevelForVerdict,
  runEnrichmentGateWithCoverage,
} from "../src/engine/reasoner/v2Context.js";
import { RawSample } from "../src/engine/signals/patterns.js";
import { joinTriplets, TripletInput } from "../src/engine/triplet.js";

const REASONER_V2_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";

const PACKAGE_ROOT = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.join(__dirname, "..", "..")
  : path.join(__dirname, "..");

function unifiedSamples(): RawSample[] {
  const unified = JSON.parse(
    readFileSync(
      path.join(
        PACKAGE_ROOT,
        "fixtures",
        "causal-engine-v2",
        "data",
        "reunified",
        "unified_v2.json",
      ),
      "utf8",
    ),
  ) as { metrics: Record<string, { ts: string; value: number }[]> };
  const samples: RawSample[] = [];
  for (const [metric, rows] of Object.entries(unified.metrics)) {
    for (const row of rows) {
      samples.push({ metric, value: row.value, timestamp: row.ts });
    }
  }
  return samples;
}

// The proven gate-clearing fixture from reasoner.test.ts, time-shifted
// onto June 13 2026 — a worn, TENSION-dominant day in the golden
// timeline — so the v2 signature lookup has a real day to hit.
const BASE_TS = Math.floor(Date.parse("2026-06-13T21:00:00-07:00") / 1000);

function fixtureInput(): TripletInput {
  const iso = (offset: number) => new Date((BASE_TS + offset) * 1000).toISOString();
  return {
    biometrics: {
      metrics: [{
        metric: "heart_rate",
        range: "day",
        aggregated: { avg: 88, min: 70, max: 96 },
        samples: [{
          metric: "heart_rate",
          value: 96,
          timestamp: iso(10),
          graph_source_ref: `healthkit:heart_rate:${iso(10)}`,
        }],
      }],
      states: [{
        bucket_ts: BASE_TS,
        yin_score: 35,
        yang_score: 82,
        category: "pushing_it",
        source_quality: "data_verified",
        updated_at_ts: BASE_TS + 10,
        graph_source_ref: `state:${BASE_TS}`,
      }],
    },
    calendar: [{
      id: "event-1",
      user_id: REASONER_V2_USER,
      source: "eventkit",
      source_ref: "evt-1",
      graph_source_ref: "calendar:evt-1",
      title: "Pricing sync",
      start_ts: BASE_TS + 30,
      end_ts: BASE_TS + 600,
      all_day: false,
      attendee_count: 2,
      attendees: [],
      calendar_name: "DaoBrew",
      location: "Zoom",
      metadata: {},
      created_at_ts: BASE_TS - 100,
    }],
    granola: [{
      id: "meeting-1",
      user_id: REASONER_V2_USER,
      source: "granola",
      source_ref: "note-1",
      graph_source_ref: "granola:note-1",
      event_id: "event-1",
      kind: "meeting",
      title: "Pricing sync",
      occurred_at_ts: BASE_TS + 40,
      duration_sec: 1800,
      participants: [],
      summary: "Pricing review with tier-split pressure and unresolved value line.",
      body: "We still need to pick one wedge for the pricing story and close the read to review to verify proof loop.",
      transcript_spans: [{
        idx: 0,
        speaker: "Neo",
        ts_offset_sec: 120,
        text: "We still need to pick one wedge for the pricing story and close the read to review to verify proof loop.",
      }],
      topics: ["#pricing"],
      created_at_ts: BASE_TS - 99,
    }],
    memory: [{
      id: "memory-1",
      user_id: REASONER_V2_USER,
      source: "claude_sessions",
      source_ref: "session.md:42",
      graph_source_ref: "memory:session.md:42",
      insight_text: "Project memory says Neo keeps circling the one wedge pricing proof loop and needs a real review path.",
      topics: ["#one-wedge", "#pricing"],
      importance: 0.9,
      strength: 0.8,
      occurred_at_ts: null,
      last_accessed_ts: null,
      created_at_ts: BASE_TS - 98,
    }],
  };
}

function fixtureTriplets() {
  return joinTriplets(fixtureInput(), {
    userId: REASONER_V2_USER,
    sampleWindowSec: 60,
    contextWindowSec: 120,
    memoryWindowSec: 10,
  });
}

test("v2 context: signature layer replaces the quadrant re-encoding on worn days", async () => {
  const samples = unifiedSamples();
  const v2 = buildV2Context(samples, {
    enrichmentAxes: [
      {
        theme: "pricing_monetization",
        targetHits: 3,
        targetN: 6,
        referenceRate: 0.1,
        referenceN: 27,
        citedDays: [
          { date: "2026-06-13", sources: ["granola", "memory"] },
          { date: "2026-06-14", sources: ["granola", "memory"] },
          { date: "2026-06-26", sources: ["calendar", "memory"] },
        ],
        rtmSuspected: true,
      },
    ],
  });
  assert.ok(v2, "context builds from the unified snapshot");
  assert.equal(v2.coverage.wornDays.length, 63);

  const reasoner = new Reasoner();
  const delta = await reasoner.buildDelta({
    user_id: REASONER_V2_USER,
    triplets: fixtureTriplets(),
    generated_at_ts: Math.floor(Date.parse("2026-07-02T12:00:00-07:00") / 1000),
    v2,
  });

  const root = delta.nodes.find((node) => node.kind === "ghost");
  assert.ok(root, "an attribution root is proposed");
  const props = root.props_json as Record<string, any>;

  // Provenance flips to the raw signature layer.
  assert.equal(props.biometric_pattern_source, "raw_multi_metric_signature_v2");
  assert.equal(props.signature_day, "2026-06-13");
  assert.equal(props.signature_quality, "real_inference");
  assert.ok(props.signature_coverage > 0);

  // June 13's raw dominant is OVERDRIVE in the golden timeline
  // (pattern_timeline_v2.json) — and the selected pattern must NEVER be
  // a fabricated depletion.
  assert.equal(props.selected_pattern, "overdrive");
  assert.notEqual(props.selected_pattern, "depletion");

  // 7th gate: 3/3 backed multi-source days at 5x enrichment → candidate,
  // with the RTM + workload flags travelling on the claim.
  assert.equal(props.enrichment_gate.verdict, "attribution_candidate");
  assert.equal(props.claim_level, "source_backed_hypothesis_not_settled_causality");
  assert.equal(props.coverage_cap.level, "attribution_candidate");
  assert.ok(
    (props.rtm_flags as string[]).some((f) => f.includes("regression-to-mean")),
  );
});

test("v2 gate outcomes: pricing-with-vacuum-day and n<3 degrade honestly", () => {
  const samples = unifiedSamples();
  const v2 = buildV2Context(samples);
  assert.ok(v2);

  // pricing: one cited day (6/10) is a vacuum day → only 2 backed days →
  // insufficient_power, and the coverage cap names the unbacked date.
  const pricing = runEnrichmentGateWithCoverage(
    {
      theme: "pricing_monetization",
      targetHits: 3,
      targetN: 6,
      referenceRate: 0.1,
      referenceN: 27,
      citedDays: [
        { date: "2026-06-09", sources: ["granola", "memory"] },
        { date: "2026-06-10", sources: ["granola", "memory"] },
        { date: "2026-06-26", sources: ["calendar", "memory"] },
      ],
      rtmSuspected: true,
    },
    v2.coverage,
  );
  assert.equal(pricing.gate.verdict, "insufficient_power");
  assert.deepEqual(pricing.coverageCap.unbackedDates, ["2026-06-10"]);
  assert.equal(pricing.coverageCap.level, "context_only");

  // attribution: only two cited days at all → insufficient_power.
  const attribution = runEnrichmentGateWithCoverage(
    {
      theme: "causal_rootcause",
      targetHits: 2,
      targetN: 6,
      referenceRate: 0.05,
      referenceN: 27,
      citedDays: [
        { date: "2026-06-22", sources: ["granola", "memory"] },
        { date: "2026-06-26", sources: ["memory", "calendar"] },
      ],
      rtmSuspected: false,
    },
    v2.coverage,
  );
  assert.equal(attribution.gate.verdict, "insufficient_power");

  assert.equal(
    claimLevelForVerdict("context_only", "source_backed_hypothesis_not_settled_causality"),
    "context_only",
  );
});

test("legacy path unchanged: no v2 input keeps watch_data_only provenance", async () => {
  const reasoner = new Reasoner();
  const delta = await reasoner.buildDelta({
    user_id: REASONER_V2_USER,
    triplets: fixtureTriplets(),
    generated_at_ts: Math.floor(Date.parse("2026-07-02T12:00:00-07:00") / 1000),
  });
  const root = delta.nodes.find((node) => node.kind === "ghost");
  assert.ok(root);
  const props = root.props_json as Record<string, any>;
  assert.equal(props.biometric_pattern_source, "watch_data_only");
  assert.equal(props.enrichment_gate, undefined);
});
