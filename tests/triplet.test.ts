import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { joinTriplets } from "../src/engine/triplet.js";
import type { TripletInput } from "../src/engine/triplet.js";

const TRIPLET_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";

function fixtureInput(): TripletInput {
  return {
    biometrics: {
      metrics: [
        {
          metric: "heart_rate",
          range: "day",
          aggregated: { avg: 72, min: 65, max: 90 },
          samples: [
            {
              metric: "heart_rate",
              value: 90,
              timestamp: "1970-01-01T00:16:50.000Z",
              graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:50.000Z",
            },
          ],
        },
      ],
      states: [
        {
          bucket_ts: 1000,
          yin_score: 35,
          yang_score: 82,
          category: "pushing_it",
          source_quality: "data_verified",
          updated_at_ts: 1010,
          graph_source_ref: "state:1000",
        },
      ],
    },
    calendar: [
      {
        id: "event-1",
        user_id: TRIPLET_TEST_USER,
        source: "eventkit",
        source_ref: "evt-1",
        graph_source_ref: "calendar:evt-1",
        title: "AI2 demo sync",
        start_ts: 1030,
        end_ts: 1600,
        all_day: false,
        attendee_count: 2,
        attendees: [],
        calendar_name: "DaoBrew",
        location: "Zoom",
        metadata: {},
        created_at_ts: 900,
      },
    ],
    granola: [
      {
        id: "meeting-1",
        user_id: TRIPLET_TEST_USER,
        source: "granola",
        source_ref: "note-1",
        graph_source_ref: "granola:note-1",
        event_id: "event-1",
        kind: "meeting",
        title: "AI2 demo sync",
        occurred_at_ts: 1040,
        duration_sec: 1800,
        participants: [],
        summary: "Demo flow review",
        body: null,
        topics: ["#demo"],
        created_at_ts: 901,
      },
    ],
    memory: [
      {
        id: "memory-1",
        user_id: TRIPLET_TEST_USER,
        source: "claude_sessions",
        source_ref: "session.md:42",
        graph_source_ref: "memory:session.md:42",
        insight_text: "For the demo, show the real handoff path.",
        topics: ["#demo"],
        importance: 0.9,
        strength: 0.8,
        occurred_at_ts: null,
        last_accessed_ts: null,
        created_at_ts: 902,
      },
    ],
  };
}

describe("joinTriplets", () => {
  it("joins biometric episodes to nearby calendar, meeting, and memory context", () => {
    const triplets = joinTriplets(fixtureInput(), {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    assert.strictEqual(triplets.length, 1);
    assert.strictEqual(triplets[0].episode.state.graph_source_ref, "state:1000");
    assert.strictEqual(triplets[0].episode.samples.length, 1);
    assert.strictEqual(triplets[0].events[0].graph_source_ref, "calendar:evt-1");
    assert.strictEqual(triplets[0].meetings[0].graph_source_ref, "granola:note-1");
    assert.strictEqual(triplets[0].memories[0].graph_source_ref, "memory:session.md:42");
    assert.deepStrictEqual(triplets[0].episode.source_refs, [
      "healthkit:heart_rate:1970-01-01T00:16:50.000Z",
      "state:1000",
    ]);
  });

  it("joins same-local-day source context by default for long-horizon attribution", () => {
    const input = fixtureInput();
    const stateTs = Math.trunc(Date.parse("2026-05-29T21:00:00-07:00") / 1000);
    const sourceTs = Math.trunc(Date.parse("2026-05-29T09:15:00-07:00") / 1000);
    input.biometrics.states[0].bucket_ts = stateTs;
    input.biometrics.states[0].graph_source_ref = `state:${stateTs}`;
    input.calendar[0].start_ts = sourceTs;
    input.calendar[0].end_ts = sourceTs + 1800;
    input.granola[0].occurred_at_ts = sourceTs + 120;

    const triplets = joinTriplets(input, { userId: TRIPLET_TEST_USER });

    assert.strictEqual(triplets.length, 1);
    assert.strictEqual(triplets[0].events[0].graph_source_ref, "calendar:evt-1");
    assert.strictEqual(triplets[0].meetings[0].graph_source_ref, "granola:note-1");
  });

  it("does not join source rows outside the default one-day attribution horizon", () => {
    const input = fixtureInput();
    const stateTs = Math.trunc(Date.parse("2026-05-29T21:00:00-07:00") / 1000);
    const sourceTs = stateTs - (25 * 60 * 60);
    input.biometrics.states[0].bucket_ts = stateTs;
    input.biometrics.states[0].graph_source_ref = `state:${stateTs}`;
    input.calendar[0].start_ts = sourceTs;
    input.calendar[0].end_ts = sourceTs + 1800;
    input.granola[0].event_id = null;
    input.granola[0].occurred_at_ts = sourceTs + 120;

    const triplets = joinTriplets(input, { userId: TRIPLET_TEST_USER });

    assert.strictEqual(triplets.length, 1);
    assert.strictEqual(triplets[0].events.length, 0);
    assert.strictEqual(triplets[0].meetings.length, 0);
  });

  it("is deterministic when input order changes", () => {
    const input = fixtureInput();
    const reversed: TripletInput = {
      biometrics: {
        ...input.biometrics,
        metrics: [...input.biometrics.metrics].reverse(),
        states: [...input.biometrics.states].reverse(),
      },
      calendar: [...input.calendar].reverse(),
      granola: [...input.granola].reverse(),
      memory: [...input.memory].reverse(),
    };

    assert.deepStrictEqual(
      joinTriplets(input, { userId: TRIPLET_TEST_USER }).map((triplet) => ({ id: triplet.id, refs: triplet.source_refs })),
      joinTriplets(reversed, { userId: TRIPLET_TEST_USER }).map((triplet) => ({ id: triplet.id, refs: triplet.source_refs })),
    );
  });

  it("keeps context-relevant memories inside the per-triplet cap over higher-importance junk", () => {
    const input = fixtureInput();
    const base = input.memory[0];
    // Five in-window junk digests with ZERO context-term overlap but maxed
    // strength/importance (per-source importance is nearly constant), plus one
    // lower-strength memory that actually shares terms with the meeting/event
    // context (ai2, demo, flow, review). The cap is 5: importance-first
    // selection silently drops the only relevant memory before the reasoner
    // ever sees it.
    input.memory = [
      ...[1, 2, 3, 4, 5].map((n) => ({
        ...base,
        id: `memory-junk-${n}`,
        source: "codex_project_session",
        source_ref: `rollout-${n}.jsonl`,
        graph_source_ref: `memory:rollout-${n}.jsonl`,
        insight_text: `git branch failed; retry checking figma exports tonight (${n}).`,
        topics: [],
        importance: 0.9,
        strength: 0.9,
        occurred_at_ts: 1000,
      })),
      {
        ...base,
        id: "memory-relevant",
        source: "claude_project_session",
        source_ref: "claude.md:10",
        graph_source_ref: "memory:claude.md:10",
        insight_text: "AI2 demo flow review needs a wedge decision.",
        topics: [],
        importance: 0.7,
        strength: 0.5,
        occurred_at_ts: 1000,
      },
    ];

    const triplets = joinTriplets(input, {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    assert.strictEqual(triplets.length, 1);
    assert.strictEqual(triplets[0].memories.length, 5, "cap stays at 5");
    const ids = triplets[0].memories.map((memory) => memory.id);
    assert.strictEqual(
      ids[0],
      "memory-relevant",
      "context-relevant memory must survive the cap and rank first",
    );
  });

  it("uses semantic memory scores for the overlap arm while keeping the time-window arm intact", () => {
    const input = fixtureInput();
    const base = input.memory[0];
    input.memory = [
      {
        ...base,
        id: "memory-semantic",
        source_ref: "semantic.md:1",
        graph_source_ref: "memory:semantic.md:1",
        insight_text: "Release proof loop needs a wedge handoff.",
        topics: ["#release"],
        occurred_at_ts: 1000 - 30 * 86400,
        importance: 0.85,
        strength: 0.7,
      },
      {
        ...base,
        id: "memory-window",
        source_ref: "window.md:1",
        graph_source_ref: "memory:window.md:1",
        insight_text: "No lexical overlap here either.",
        topics: [],
        occurred_at_ts: 1000,
        importance: 0.2,
        strength: 0.1,
      },
    ];

    const lexicalTriplets = joinTriplets(input, {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    assert.deepStrictEqual(
      lexicalTriplets[0].memories.map((memory) => memory.id),
      ["memory-window"],
      "without semantic evidence the old lexical path stays unchanged",
    );

    const semanticTriplets = joinTriplets(input, {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
      semanticMemoryScoresByAnchorRef: new Map([
        ["state:1000", new Map([["memory-semantic", 0.86]])],
      ]),
    });

    assert.deepStrictEqual(
      semanticTriplets[0].memories.map((memory) => memory.id),
      ["memory-semantic", "memory-window"],
    );
  });

  it("does not invent episodes when backend state history is empty", () => {
    const input = fixtureInput();
    input.biometrics.states = [];
    assert.deepStrictEqual(joinTriplets(input, { userId: TRIPLET_TEST_USER }), []);
  });

  it("carries the nearest prior per-metric sample within the LOCF staleness cap", () => {
    const input = fixtureInput();
    input.biometrics.metrics = [
      {
        metric: "heart_rate",
        range: "day",
        aggregated: { avg: 80, min: 80, max: 80 },
        samples: [
          {
            metric: "heart_rate",
            value: 80,
            timestamp: "1970-01-01T00:50:00.000Z",
            graph_source_ref: "healthkit:heart_rate:3000",
          },
        ],
      },
      {
        metric: "heart_rate_variability",
        range: "day",
        aggregated: { avg: 34, min: 34, max: 34 },
        samples: [
          {
            metric: "heart_rate_variability",
            value: 34,
            timestamp: "1970-01-01T00:01:40.000Z",
            graph_source_ref: "healthkit:hrv:100",
          },
        ],
      },
    ];
    input.biometrics.states[0].bucket_ts = 1_000;

    const triplets = joinTriplets(input, {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      locfStalenessCapSec: 1_000,
    });

    assert.equal(triplets[0].episode.samples.length, 1);
    assert.equal(triplets[0].episode.samples[0].metric, "heart_rate_variability");
    assert.equal(triplets[0].episode.samples[0].carried, true);
  });

  it("does not carry samples older than the LOCF staleness cap boundary", () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples = [
      {
        metric: "heart_rate",
        value: 80,
        timestamp: "1970-01-01T00:00:00.000Z",
        graph_source_ref: "healthkit:heart_rate:0",
      },
    ];
    input.biometrics.states[0].bucket_ts = 1_000;

    const triplets = joinTriplets(input, {
      userId: TRIPLET_TEST_USER,
      sampleWindowSec: 60,
      locfStalenessCapSec: 999,
    });

    assert.equal(triplets[0].episode.samples.length, 0);
    assert.equal(triplets[0].episode.state.source_quality, "data_verified");
  });
});
