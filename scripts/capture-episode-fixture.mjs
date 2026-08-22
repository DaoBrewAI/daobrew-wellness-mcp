// Task 4 fixture harness (throwaway — scratch script, gitignored intent).
//
// Why this exists: for the live user the reasoner stays in WATCHING (no meeting
// note clears the root-eligibility gate), so a plain bootstrap emits no episode
// nodes and there is no real props_json with biometric_summary to capture. That
// gate is a SOURCE-signal gate, orthogonal to the biometric contract Task 6
// tests. This harness drives the REAL engine (readBiometricSignalsFromDb for the
// real warm-tier samples + baselines, joinTriplets, Reasoner.buildDelta with a
// real-shaped eligible source context) so the emitted episode props_json is
// produced by the actual engine code path, with genuine biometric numbers.
//
// It writes the episode's props_json verbatim to the Swift fixture path.
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { readBiometricSignalsFromDb } from "../dist/src/engine/signals/biometricsDb.js";
import { joinTriplets } from "../dist/src/engine/triplet.js";
import { Reasoner } from "../dist/src/engine/reasoner/Reasoner.js";
import { canonicalUserId } from "../dist/src/user-id.js";

const cfg = JSON.parse(readFileSync(os.homedir() + "/.daobrew/config.json", "utf8"));
process.env.DAOBREW_GRAPH_STORE = "postgres";
process.env.DAOBREW_GRAPH_DB_URL = cfg.postgres_url;
// biometric_device_ids come from config via resolveBiometricDeviceIds() already.

const userId = canonicalUserId(process.env.DAOBREW_USER_ID ?? cfg.user_id);
if (!userId) {
  throw new Error("canonical UUID user_id is required; set DAOBREW_USER_ID or run setup");
}
// The newest real state bucket and its ±4h sample window (verified live).
const anchorBucketTs = 1783483200; // 2026-07-08T04:00Z, running_on_empty
const startTs = anchorBucketTs - 4 * 3600;
const endTs = anchorBucketTs + 4 * 3600;

// 1) REAL biometrics read (samples + states + 30-day baselines from Task 2).
const bio = await readBiometricSignalsFromDb({
  userId,
  metrics: ["heart_rate", "hrv", "heart_rate_variability", "active_energy_burned", "step_count"],
  range: "day",
  startTs,
  endTs,
});
const hrSeries = bio.metrics.find((m) => m.metric === "heart_rate");
console.error(
  "read: states=" + bio.states.length +
  " hr_samples=" + (hrSeries?.samples.length ?? 0) +
  " baselines=" + JSON.stringify(bio.baselines),
);
if (!bio.states.length || !(hrSeries?.samples.length)) {
  console.error("FATAL: real read returned no states/samples for the window; cannot build an episode.");
  process.exit(1);
}

// 2) A real-SHAPED eligible source context (mirrors the arming fixture in
//    reasoner.test.ts) anchored to overlap the real state bucket, so a root
//    arms and the episode branch runs. The biometrics are 100% real; only the
//    meeting/calendar wrapper is representative (that gate is orthogonal to the
//    biometric contract being captured).
const anchor = anchorBucketTs;
const input = {
  biometrics: bio,
  calendar: [{
    id: "event-fixture", user_id: userId, source: "eventkit", source_ref: "evt-fixture",
    graph_source_ref: "calendar:evt-fixture", title: "DaoBrew demo sync",
    start_ts: anchor + 60, end_ts: anchor + 1800, all_day: false, attendee_count: 2,
    attendees: [], calendar_name: "DaoBrew", location: "Zoom", metadata: {}, created_at_ts: anchor - 600,
  }],
  granola: [{
    id: "meeting-fixture", user_id: userId, source: "granola", source_ref: "note-fixture",
    graph_source_ref: "granola:note-fixture", event_id: "event-fixture", kind: "meeting",
    title: "DaoBrew demo sync", occurred_at_ts: anchor + 120, duration_sec: 1800, participants: [],
    summary: "Demo flow review with investor deadline pressure and positioning risk.",
    body: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
    transcript_spans: [{
      idx: 0, speaker: "Neo", ts_offset_sec: 120,
      text: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
    }],
    topics: ["#demo"], created_at_ts: anchor - 600,
  }],
  memory: [{
    id: "memory-fixture", user_id: userId, source: "claude_sessions", source_ref: "session.md:42",
    graph_source_ref: "memory:session.md:42",
    insight_text: "Project memory says Neo keeps circling the one wedge demo proof loop and needs a real review path.",
    topics: ["#one-wedge", "#demo-readiness"], importance: 0.9, strength: 0.8,
    occurred_at_ts: null, last_accessed_ts: null, created_at_ts: anchor - 600,
  }],
};

const triplets = joinTriplets(input, { userId, sampleWindowSec: 4 * 3600, contextWindowSec: 24 * 3600, memoryWindowSec: 14 * 24 * 3600 });
console.error("triplets=" + triplets.length);
const delta = await new Reasoner().buildDelta({ user_id: userId, triplets, baselines: bio.baselines });
const episode = delta.nodes.find((n) => n.kind === "episode");
if (!episode) {
  console.error("FATAL: no episode node emitted (still WATCHING). Nodes: " + delta.nodes.map((n) => n.kind).join(","));
  process.exit(1);
}
const props = episode.props_json;
if (!props || !props.biometric_summary) {
  console.error("FATAL: episode has no biometric_summary. keys=" + Object.keys(props || {}).join(","));
  process.exit(1);
}
const out = "/Users/linhanyang/Documents/Daobrew/DaobrewAI/DaobrewSentinelMac/Tests/SentinelMacTests/Fixtures/episode-props-fixture.json";
writeFileSync(out, JSON.stringify(props, null, 2) + "\n");
console.error("WROTE fixture. biometric_summary.summary = " + JSON.stringify(props.biometric_summary.summary));
console.error("pattern_endorsements = " + JSON.stringify(props.pattern_endorsements));
