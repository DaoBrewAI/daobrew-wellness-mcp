import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { joinTriplets as joinTripletsBase, TripletInput, TripletJoinOptions } from "../src/engine/triplet.js";
import { NotEnoughSignalError, Reasoner, rootCauseId } from "../src/engine/reasoner/Reasoner.js";
import { detectLatentHypothesis, proposeLatentHypotheses, verifyLatentHypothesis } from "../src/engine/reasoner/LatentHypothesis.js";
import type { GranolaMeetingSignal } from "../src/engine/signals/granola.js";
import type { MemoryInsightSignal } from "../src/engine/signals/memory.js";
import { buildReasonerPrompt } from "../src/engine/reasoner/prompt.js";

const REASONER_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OTHER_REASONER_TEST_USER = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const TEST_ROOT_CAUSE_ID = rootCauseId(REASONER_TEST_USER);

function joinTriplets(input: TripletInput, options: TripletJoinOptions = {}) {
  return joinTripletsBase(input, { userId: REASONER_TEST_USER, ...options });
}

function patternNode(delta: Awaited<ReturnType<Reasoner["buildDelta"]>>, key: string) {
  const node = delta.nodes.find((entry) => entry.kind === "pattern" && entry.source_ref === `pattern:${key}`);
  assert.ok(node, `missing pattern:${key}`);
  return node;
}

function patternId(delta: Awaited<ReturnType<Reasoner["buildDelta"]>>, key: string): string {
  return patternNode(delta, key).id;
}

function fixtureInput(userId = REASONER_TEST_USER): TripletInput {
  return {
    biometrics: {
      metrics: [{
        metric: "heart_rate",
        range: "day",
        aggregated: { avg: 88, min: 70, max: 96 },
        samples: [{
          metric: "heart_rate",
          value: 96,
          timestamp: "1970-01-01T00:16:50.000Z",
          graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:50.000Z",
        }],
      }],
      states: [{
        bucket_ts: 1000,
        yin_score: 35,
        yang_score: 82,
        category: "pushing_it",
        source_quality: "data_verified",
        updated_at_ts: 1010,
        graph_source_ref: "state:1000",
      }],
    },
    calendar: [{
      id: "event-1",
      user_id: userId,
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
    }],
    granola: [{
      id: "meeting-1",
      user_id: userId,
      source: "granola",
      source_ref: "note-1",
      graph_source_ref: "granola:note-1",
      event_id: "event-1",
      kind: "meeting",
      title: "AI2 demo sync",
      occurred_at_ts: 1040,
      duration_sec: 1800,
      participants: [],
      summary: "Demo flow review with investor deadline pressure and positioning risk.",
      body: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
      transcript_spans: [{
        idx: 0,
        speaker: "Neo",
        ts_offset_sec: 120,
        text: "We still need to pick one wedge for the demo story and close the read to review to verify proof loop.",
      }],
      topics: ["#demo"],
      created_at_ts: 901,
    }],
    memory: [{
      id: "memory-1",
      user_id: userId,
      source: "claude_sessions",
      source_ref: "session.md:42",
      graph_source_ref: "memory:session.md:42",
      insight_text: "Project memory says Neo keeps circling the one wedge demo proof loop and needs a real review path.",
      topics: ["#one-wedge", "#demo-readiness"],
      importance: 0.9,
      strength: 0.8,
      occurred_at_ts: null,
      last_accessed_ts: null,
      created_at_ts: 902,
    }],
  };
}

describe("Reasoner", () => {
  it("builds a GraphDelta with source-backed episode and armed brief", async () => {
    const triplets = joinTriplets(fixtureInput(), {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });

    assert.strictEqual(delta.armed_root_cause.node_id, TEST_ROOT_CAUSE_ID);
    assert.strictEqual(delta.armed_root_cause.root_cause_class, "productivity");
    assert.ok(delta.armed_root_cause.confidence > 0);
    assert.ok(delta.armed_root_cause.brief.evidence.length >= 3);
    assert.match(delta.armed_root_cause.brief.cause, /evidence-backed delivery loop/);
    assert.match(delta.armed_root_cause.brief.cause, /meeting note/);
    assert.doesNotMatch(delta.armed_root_cause.brief.cause, /AI2 demo sync is/);
    assert.doesNotMatch(delta.armed_root_cause.brief.cause, /colliding/);

    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);
    assert.ok(root);
    assert.strictEqual(root.kind, "ghost");
    assert.strictEqual(root.title, "Closing the evidence-backed delivery loop remains the unresolved gap attribution candidate");
    assert.strictEqual(root.subtitle, "attribution candidate");
    assert.strictEqual(
      (root.props_json?.citation_gate as Record<string, unknown>)?.has_cited_transcript_span,
      true,
    );

    const patternIds = delta.nodes
      .filter((node) => node.kind === "pattern")
      .map((node) => node.source_ref)
      .sort();
    assert.deepStrictEqual(patternIds, [
      "pattern:constriction",
      "pattern:depletion",
      "pattern:overdrive",
      "pattern:stagnation",
      "pattern:tension",
    ]);
    const overdrive = patternNode(delta, "overdrive");
    assert.strictEqual(overdrive.element, "fire");
    assert.match(overdrive.subtitle ?? "", /active candidate/);

    const episode = delta.nodes.find((node) => node.kind === "episode");
    assert.ok(episode);
    assert.strictEqual(episode.title, "Closing the evidence-backed delivery loop remains the unresolved gap");
    assert.strictEqual(episode.element, "fire");
    assert.strictEqual(episode.source_ref, "state:1000");
    assert.strictEqual(episode.props_json?.source_kind, "trigger_bundle");
    assert.strictEqual(episode.props_json?.evidence_grade, "strong");
    assert.strictEqual(
      (episode.props_json?.citation_gate as Record<string, unknown>)?.thread_key,
      "delivery-readiness",
    );
    assert.ok(Array.isArray(episode.props_json?.supporting_calendar_events));
    assert.ok(Array.isArray(episode.props_json?.supporting_meeting_notes));
    assert.strictEqual((episode.props_json?.supporting_calendar_events as unknown[]).length, 1);
    assert.strictEqual((episode.props_json?.supporting_meeting_notes as unknown[]).length, 1);
    assert.deepStrictEqual(episode.props_json?.evidence_ticks, {
      calendar: true,
      granola: true,
      memory: true,
    });
    assert.strictEqual(root.props_json?.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.strictEqual(episode.props_json?.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.ok((episode.props_json?.sample_refs as string[]).includes(
      "healthkit:heart_rate:1970-01-01T00:16:50.000Z",
    ));
    assert.ok(Array.isArray(episode.props_json?.pattern_scores));

    assert.ok(delta.nodes.some((node) => node.kind === "meeting" && node.title === "AI2 demo sync"));
    assert.ok(delta.edges.every((edge) => !["triggered", "tagged", "clusters"].includes(edge.kind)));
    assert.ok(delta.edges.some((edge) => edge.kind === "relates_to" && edge.dst_id === episode.id));
    assert.ok(!delta.edges.some((edge) => edge.kind === "manifested" && (
      delta.nodes.find((node) => node.id === edge.src_id)?.kind === "meeting"
    )));

    const episodePatternEdge = delta.edges.find((edge) => (
      edge.kind === "manifested" &&
      edge.src_id === episode.id &&
      edge.dst_id === patternId(delta, "overdrive")
    ));
    assert.ok(episodePatternEdge);
    assert.strictEqual(
      episodePatternEdge.props_json?.causality_level,
      "pattern_candidate",
    );

    const triggerRootEdge = delta.edges.find((edge) => (
      edge.kind === "suggests" &&
      edge.src_id === episode.id &&
      edge.dst_id === TEST_ROOT_CAUSE_ID
    ));
    assert.ok(triggerRootEdge);
    assert.strictEqual(
      triggerRootEdge.props_json?.causality_level,
      "source_backed_hypothesis_not_settled_causality",
    );
    assert.ok(delta.edges.every((edge) => edge.src_id.length > 0 && edge.dst_id.length > 0));
    assert.doesNotMatch(
      JSON.stringify(delta),
      /We still need to pick one wedge for the demo story and close the read/,
    );
    assert.match(JSON.stringify(delta), /text_redacted/);

    const carryForwardEdge = delta.edges.find((edge) => (
      edge.kind === "evidence_for" &&
      edge.src_id === episode.id &&
      edge.dst_id === TEST_ROOT_CAUSE_ID
    ));
    assert.ok(carryForwardEdge);
    assert.strictEqual(carryForwardEdge.props_json?.week_start, episode.props_json?.week_start);

    const visibleGraphText = JSON.stringify({
      nodes: delta.nodes.map((node) => ({
        title: node.title,
        subtitle: node.subtitle,
      })),
      brief: delta.armed_root_cause.brief,
    });
    assert.doesNotMatch(visibleGraphText, /\byin\b/i);
    assert.doesNotMatch(visibleGraphText, /\byang\b/i);
    assert.doesNotMatch(visibleGraphText, /recharging|pushing_it/i);
  });

  it("episode props carry biometric_summary and pattern_endorsements", async () => {
    const triplets = joinTriplets(fixtureInput(), {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    // Baselines ride the reasoner input (threaded from the biometrics read).
    const delta = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets,
      baselines: [{ metric_type: "heart_rate", baseline_avg: 79, day_count: 30 }],
    });
    const episode = delta.nodes.find((node) => node.kind === "episode")!;
    assert.ok(episode, "delta produces an episode node");
    const props = episode.props_json as any;
    assert.ok(props.biometric_summary, "biometric_summary present");
    assert.strictEqual(typeof props.biometric_summary.summary, "string");
    assert.ok(props.biometric_summary.sample_count >= 1);
    assert.ok(Array.isArray(props.biometric_summary.metrics));
    assert.ok(Array.isArray(props.pattern_endorsements));
    assert.ok(props.pattern_endorsements.length >= 1);
    assert.strictEqual(typeof props.pattern_endorsements[0].summary, "string");
    // The fixture's heart_rate avg (96) is above the 79 baseline → +22%.
    const hr = props.biometric_summary.metrics.find((m: any) => m.type === "heart_rate");
    assert.ok(hr, "heart_rate metric present");
    assert.strictEqual(hr.baseline_avg, 79);
    assert.strictEqual(hr.delta_pct, 22); // round((96-79)/79*100)
    // Claim gate: episode claim_level is never an attribution candidate in the
    // reasoner's vocabulary → context_only → no causal/coincided language.
    assert.doesNotMatch(props.pattern_endorsements[0].summary, /caused|coincided/i);
  });

  it("episode without samples keeps props unchanged (no biometric_summary key)", async () => {
    const input = fixtureInput();
    // Strip the raw samples so the episode has nothing to summarize.
    input.biometrics.metrics = input.biometrics.metrics.map((series) => ({ ...series, samples: [] }));
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const episode = delta.nodes.find((node) => node.kind === "episode");
    if (episode) {
      const props = episode.props_json as any;
      assert.strictEqual(props.biometric_summary, undefined, "no summary when sample_count is 0");
      assert.strictEqual(props.pattern_endorsements, undefined);
    }
  });

  it("surfaces project-memory support as first-class memory_hit nodes with suggests edges to the root", async () => {
    const joinOptions = {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    };
    const delta = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(fixtureInput(), joinOptions),
    });

    const memoryNodes = delta.nodes.filter((node) => node.kind === "memory_hit");
    assert.ok(memoryNodes.length >= 1, "memory support must surface as memory_hit nodes");
    assert.ok(memoryNodes.every((node) => node.source_ref));
    assert.ok(memoryNodes.every((node) => node.id.startsWith("memoryhit_")));
    const memoryNode = memoryNodes[0];
    assert.strictEqual(memoryNode.source, "claude_sessions");
    assert.strictEqual(memoryNode.subtitle, "claude_sessions");
    assert.strictEqual(memoryNode.source_ref, "session.md:42");
    // truncate(text, 72) caps at 71 chars + "..." = 74, same helper as sibling
    // context nodes (memoryDisplayTitle / contextNodesFor).
    assert.ok(memoryNode.title.length <= 74);
    assert.match(memoryNode.title, /^Project memory says Neo keeps circling/);
    assert.match(memoryNode.title, /\.\.\.$/);
    assert.strictEqual(memoryNode.props_json?.insight_id, "memory-1");
    assert.deepStrictEqual(memoryNode.props_json?.topics, ["#one-wedge", "#demo-readiness"]);
    assert.strictEqual(memoryNode.props_json?.strength, 0.8);
    assert.strictEqual(memoryNode.props_json?.importance, 0.9);
    // Armed path: memory_hit nodes must NOT carry the watching-context overlay.
    for (const node of memoryNodes) {
      assert.strictEqual(node.props_json?.source_context_role, undefined);
      assert.strictEqual(node.props_json?.causality_level, undefined);
    }

    const memEdges = delta.edges.filter((edge) => (
      (edge.props_json as Record<string, unknown> | undefined)?.evidence_role === "memory_support"
    ));
    assert.equal(memEdges.length, memoryNodes.length);
    const memoryNodeIds = new Set(memoryNodes.map((node) => node.id));
    for (const edge of memEdges) {
      assert.strictEqual(edge.kind, "suggests");
      assert.strictEqual(edge.label, "project memory support");
      assert.strictEqual(edge.dst_id, TEST_ROOT_CAUSE_ID, "memory edge must land on the root ghost");
      assert.ok(memoryNodeIds.has(edge.src_id), "memory edge must originate from a memory_hit node");
      assert.ok((edge.weight ?? -1) >= 0 && (edge.weight ?? 2) <= 1, "memory edge weight must be clamped to [0,1]");
    }
    assert.strictEqual(memEdges[0].weight, 0.8);

    // The memory_hit nodes complement (not replace) the root props citation list.
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);
    assert.ok(root);
    assert.strictEqual((root.props_json?.supporting_project_memories as unknown[]).length, 1);

    // Determinism: an identical input must produce identical memory_hit
    // nodes and edges (full objects, not just ids).
    const again = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(fixtureInput(), joinOptions),
    });
    const sortById = <T extends { id: string }>(items: T[]): T[] =>
      [...items].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepStrictEqual(
      sortById(again.nodes.filter((node) => node.kind === "memory_hit")),
      sortById(memoryNodes),
    );
    const memoryEdgesOf = (edges: typeof delta.edges) => edges.filter((edge) => (
      (edge.props_json as Record<string, unknown> | undefined)?.evidence_role === "memory_support"
    ));
    assert.deepStrictEqual(
      sortById(memoryEdgesOf(again.edges)),
      sortById(memEdges),
    );
  });

  it("keeps memory_hit node ids stable across different weeks (week-agnostic ids match ux_nodes_dedup)", async () => {
    const joinOptions = {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    };
    const weekA = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(fixtureInput(), joinOptions),
    });

    // Shift every timestamp forward by two weeks: same memory, different
    // week bucket. The dedup identity on graph_nodes (ux_nodes_dedup:
    // user_id, kind, source, source_ref) is week-agnostic, so the node id
    // must be too, or week B mints a new id sharing week A's dedup tuple
    // and the upsert violates the unique index.
    const shiftSec = 14 * 86400;
    const shifted = fixtureInput();
    const sample = shifted.biometrics.metrics[0].samples[0];
    const sampleIso = new Date((Date.parse(sample.timestamp) + shiftSec * 1000)).toISOString();
    sample.timestamp = sampleIso;
    sample.graph_source_ref = `healthkit:heart_rate:${sampleIso}`;
    const state = shifted.biometrics.states[0];
    state.bucket_ts += shiftSec;
    state.updated_at_ts += shiftSec;
    state.graph_source_ref = `state:${state.bucket_ts}`;
    shifted.calendar[0].start_ts += shiftSec;
    shifted.calendar[0].end_ts = (shifted.calendar[0].end_ts ?? 0) + shiftSec;
    shifted.calendar[0].created_at_ts += shiftSec;
    shifted.granola[0].occurred_at_ts = (shifted.granola[0].occurred_at_ts ?? 0) + shiftSec;
    shifted.granola[0].created_at_ts = (shifted.granola[0].created_at_ts ?? 0) + shiftSec;
    shifted.memory[0].created_at_ts += shiftSec;
    const weekB = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(shifted, joinOptions),
    });

    const idsOf = (delta: typeof weekA) => delta.nodes
      .filter((node) => node.kind === "memory_hit")
      .map((node) => node.id)
      .sort();
    const weekAIds = idsOf(weekA);
    const weekBIds = idsOf(weekB);
    assert.ok(weekAIds.length >= 1, "fixture must surface memory_hit nodes");
    assert.deepStrictEqual(weekBIds, weekAIds, "same memory across weeks must reuse the same node id");

    // Sanity: the two builds really landed in different weeks — the edge
    // props carry the week, not the node id.
    const weekOf = (delta: typeof weekA) => delta.edges
      .find((edge) => (edge.props_json as Record<string, unknown> | undefined)?.evidence_role === "memory_support")
      ?.props_json?.week_start;
    assert.ok(weekOf(weekA));
    assert.ok(weekOf(weekB));
    assert.notStrictEqual(weekOf(weekA), weekOf(weekB), "shifted fixture must bucket into a different week");
  });

  it("collapses memories sharing one source_ref into a single memory_hit node per delta", async () => {
    const joinOptions = {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    };
    const input = fixtureInput();
    // Second, DIFFERENT memory extracted from the SAME session file: distinct
    // insight id (distinct node id under hash(user, memory.id)) but identical
    // ux_nodes_dedup tuple (user_id, memory_hit, claude_sessions, session.md:42).
    // Emitting both nodes in one delta would violate the unique index.
    input.memory.push({
      ...input.memory[0],
      id: "memory-2",
      insight_text: "Second insight pulled from the very same session file as memory-1.",
      topics: ["#same-file"],
      importance: 0.5,
      strength: 0.4,
    });
    const delta = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(input, joinOptions),
    });

    const memoryNodes = delta.nodes.filter((node) => node.kind === "memory_hit");
    assert.strictEqual(memoryNodes.length, 1, "one citation node per (source, source_ref) per delta");
    assert.strictEqual(memoryNodes[0].source_ref, "session.md:42");
    // First-write-wins: the surviving node cites the first memory.
    assert.strictEqual(memoryNodes[0].props_json?.insight_id, "memory-1");

    const memEdges = delta.edges.filter((edge) => (
      (edge.props_json as Record<string, unknown> | undefined)?.evidence_role === "memory_support"
    ));
    assert.ok(memEdges.length >= 1);
    assert.strictEqual(new Set(memEdges.map((edge) => edge.id)).size, memEdges.length, "no duplicate edge ids");
    for (const edge of memEdges) {
      assert.strictEqual(edge.src_id, memoryNodes[0].id, "all support edges point at the surviving node");
    }
  });

  it("ranks memory support by context-term overlap before source importance", async () => {
    const joinOptions = {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    };
    const input = fixtureInput();
    const base = input.memory[0];
    // B: high hardcoded source importance (codex-style 0.9) but only 2 shared
    // context terms (wedge, review) — a rollout digest, not a relevant insight.
    // Listed FIRST so the old importance-driven sort visibly picks it.
    // A: lower importance (claude-style 0.78) but heavy term overlap with the
    // meeting context (one, wedge, story, investor, proof, loop, review, ...).
    input.memory = [
      {
        ...base,
        id: "memory-codex-junk",
        source: "codex_project_session",
        source_ref: "codex.md:20",
        graph_source_ref: "memory:codex.md:20",
        insight_text: "git branch failed while checking figma files; retry wedge review later.",
        topics: [],
        importance: 0.9,
        strength: 0.8,
      },
      {
        ...base,
        id: "memory-claude-relevant",
        source: "claude_project_session",
        source_ref: "claude.md:10",
        graph_source_ref: "memory:claude.md:10",
        insight_text: "Neo keeps circling the one wedge story: investor proof loop still needs a review path before the deadline.",
        topics: [],
        importance: 0.78,
        strength: 0.8,
      },
    ];
    const delta = await new Reasoner().buildDelta({
      user_id: REASONER_TEST_USER,
      triplets: joinTriplets(input, joinOptions),
    });

    // Works on both the armed (episode/root) and watching paths: find any
    // node carrying the full supporting_project_memories citation list.
    const citing = delta.nodes.find((node) => (
      Array.isArray(node.props_json?.supporting_project_memories) &&
      (node.props_json?.supporting_project_memories as unknown[]).length === 2
    ));
    assert.ok(citing, "both qualifying memories must appear in supporting_project_memories");
    const cited = (citing.props_json?.supporting_project_memories as Array<{ id: string }>).map((m) => m.id);
    assert.deepStrictEqual(
      cited,
      ["memory-claude-relevant", "memory-codex-junk"],
      "context-relevant memory must outrank the higher-importance junk digest",
    );
  });

  it("keeps equal-overlap memory support ties in a stable order regardless of input order", async () => {
    const joinOptions = {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    };
    const tieMemories = (base: TripletInput["memory"][number]) => [
      {
        ...base,
        id: "memory-tie-a",
        source: "codex_project_session",
        source_ref: "tie-a.md:1",
        graph_source_ref: "memory:tie-a.md:1",
        // Exactly 2 shared context terms (wedge, review); equal strength and
        // importance so only the deterministic tiebreak orders them.
        insight_text: "git branch failed; retry wedge review later tonight.",
        topics: [],
        importance: 0.82,
        strength: 0.6,
      },
      {
        ...base,
        id: "memory-tie-b",
        source: "codex_project_session",
        source_ref: "tie-b.md:1",
        graph_source_ref: "memory:tie-b.md:1",
        insight_text: "figma files pending; wedge review blocked on export.",
        topics: [],
        importance: 0.82,
        strength: 0.6,
      },
    ];
    const buildWith = async (reversed: boolean) => {
      const input = fixtureInput();
      const ties = tieMemories(input.memory[0]);
      input.memory = [...input.memory, ...(reversed ? [...ties].reverse() : ties)];
      return new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets: joinTriplets(input, joinOptions) });
    };
    const citedIds = (delta: Awaited<ReturnType<Reasoner["buildDelta"]>>) => {
      const citing = delta.nodes.find((node) => (
        Array.isArray(node.props_json?.supporting_project_memories) &&
        (node.props_json?.supporting_project_memories as unknown[]).length === 3
      ));
      assert.ok(citing, "all three qualifying memories must be cited");
      return (citing.props_json?.supporting_project_memories as Array<{ id: string }>).map((m) => m.id);
    };

    const forward = citedIds(await buildWith(false));
    const reversed = citedIds(await buildWith(true));
    assert.strictEqual(forward[0], "memory-1", "highest-overlap memory stays first");
    assert.deepStrictEqual(reversed, forward, "equal-overlap ties must not depend on input order");
  });

  it("hides calendar-only source rows instead of promoting them as trigger bundles", async () => {
    const input = fixtureInput();
    input.granola = [];
    input.calendar[0].source = "google_calendar";
    input.calendar[0].title = "Flight to San Francisco";
    input.calendar[0].location = "SFO";
    input.calendar[0].metadata = { topic_tags: ["#travel", "#flight"] };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("surfaces an early causal result for worn biometrics plus one non-logistics calendar signal", async () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples = [
      input.biometrics.metrics[0].samples[0],
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:16:55.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:55.000Z" },
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:17:00.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:17:00.000Z" },
    ];
    input.granola = [];
    input.memory = [];
    input.calendar[0].source = "google_calendar";
    input.calendar[0].title = "Investor demo prep";
    input.calendar[0].metadata = { topic_tags: ["#demo"] };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID)!;
    const episode = delta.nodes.find((node) => node.kind === "episode")!;

    assert.equal(root.props_json?.evidence_grade, "weak");
    assert.match(String(episode.props_json?.evidence_gap), /Early causal scan/);
  });

  it("keeps calendar plus project-memory overlap at insufficient evidence without a cited transcript span", async () => {
    const input = fixtureInput();
    input.granola = [];
    input.calendar[0].source = "google_calendar";
    input.calendar[0].title = "Seattle Consumer AI Founders Meetup (B2C)";
    input.calendar[0].location = "AI House";
    input.calendar[0].metadata = { topic_tags: ["#seattle", "#founders", "#consumer-ai"] };
    input.memory[0] = {
      ...input.memory[0],
      source: "codex_project_capsule",
      insight_text: "Seattle Consumer AI Founders Meetup at AI House raised consumer AI positioning and founders narrative questions.",
      topics: ["#seattle", "#consumer-ai", "#founders"],
    };
    input.granola = [];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("does not let source semantics assign biometric Patterns", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "AI2 founder interview pressure about B2B security constraints";
    input.granola[0].title = "AI2 founder interview pressure";
    input.granola[0].summary = "Demo story is unfinished. Founder pressure, deadline risk, B2B privacy constraints, and investor-facing positioning all came up.";
    input.granola[0].topics = ["#ai2", "#b2b", "#demo-readiness"];
    input.biometrics.states[0] = {
      ...input.biometrics.states[0],
      yin_score: 68,
      yang_score: 22,
      category: "recharging",
    };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const manifestedPatterns = new Set(delta.edges
      .filter((edge) => edge.kind === "manifested")
      .map((edge) => delta.nodes.find((node) => node.id === edge.dst_id)?.source_ref));

    assert.ok(manifestedPatterns.has("pattern:depletion"));
    assert.ok(manifestedPatterns.has("pattern:constriction"));
    assert.ok(!manifestedPatterns.has("pattern:overdrive"));
    assert.ok(!manifestedPatterns.has("pattern:tension"));
    assert.ok(!manifestedPatterns.has("pattern:stagnation"));
    assert.ok(patternNode(delta, "depletion").subtitle?.includes("active"));
    assert.ok(patternNode(delta, "constriction").subtitle?.includes("active"));
    assert.strictEqual(
      delta.nodes.find((node) => node.kind === "ghost" && node.source_ref === "reasoner:ghost-b2b-track")?.title,
      "B2B/B2C positioning evidence gap",
    );
    assert.ok(delta.assumptions?.some((assumption) => (
      assumption.key === "pattern_source" &&
      String(assumption.value).includes("never_assign_patterns")
    )));
  });

  it("selects visible episodes with a balanced per-pattern cap", async () => {
    const input = fixtureInput();
    const biometricStates = [
      { yin_score: 35, yang_score: 82, category: "pushing_it" },
      { yin_score: 68, yang_score: 22, category: "recharging" },
      { yin_score: 28, yang_score: 24, category: "running_on_empty" },
    ];
    input.biometrics.states = [];
    input.calendar = [];
    input.granola = [];
    input.memory = [];

    for (let i = 0; i < 20; i += 1) {
      const bucket = 10_000 + i * 10_000;
      const state = biometricStates[i % biometricStates.length];
      const title = `Work context ${i}`;
      input.biometrics.states.push({
        bucket_ts: bucket,
        yin_score: state.yin_score,
        yang_score: state.yang_score,
        category: state.category,
        source_quality: "data_verified",
        updated_at_ts: bucket + 10,
        graph_source_ref: `state:${bucket}`,
      });
      input.calendar.push({
        id: `event-${i}`,
        user_id: REASONER_TEST_USER,
        source: "google_calendar",
        source_ref: `gcal-${i}`,
        graph_source_ref: `calendar:gcal-${i}`,
        title,
        start_ts: bucket - 60,
        end_ts: bucket + 60,
        all_day: false,
        attendee_count: 2,
        attendees: [],
        calendar_name: "primary",
        location: "San Francisco",
        metadata: {
          my_response_status: "accepted",
          transparency: "opaque",
          topic_tags: [title],
        },
        created_at_ts: bucket - 120,
      });
      input.granola.push({
        id: `meeting-${i}`,
        user_id: REASONER_TEST_USER,
        source: "granola",
        source_ref: `note-${i}`,
        graph_source_ref: `granola:note-${i}`,
        event_id: `event-${i}`,
        kind: "meeting",
        title,
        occurred_at_ts: bucket - 30,
        duration_sec: 1800,
        participants: [],
        summary: `Summary for ${title}`,
        body: `We still need to pick one wedge for ${title} and resolve the B2B versus B2C positioning decision.`,
        transcript_spans: [{
          idx: 0,
          speaker: "Neo",
          ts_offset_sec: 30,
          text: `We still need to pick one wedge for ${title} and resolve the B2B versus B2C positioning decision.`,
        }],
        topics: [`#work-${i}`],
        created_at_ts: bucket - 100,
      });
      input.memory.push({
        id: `memory-${i}`,
        user_id: REASONER_TEST_USER,
        source: "codex_project_capsule",
        source_ref: `memory-${i}`,
        graph_source_ref: `memory:work-${i}`,
        insight_text: `${title} keeps circling the one wedge B2B/B2C positioning decision.`,
        topics: [`#work-${i}`, "#one-wedge", "#positioning"],
        importance: 0.7,
        strength: 0.7,
        occurred_at_ts: null,
        last_accessed_ts: null,
        created_at_ts: bucket - 90,
      });
    }

    const triplets = joinTriplets(input, {
      contextWindowSec: 120,
      sampleWindowSec: 60,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const episodeNodes = delta.nodes.filter((node) => node.kind === "episode");
    const visibleWeeks = new Set(episodeNodes.map((node) => node.props_json?.week_start));
    const manifestedCounts = delta.edges
      .filter((edge) => edge.kind === "manifested")
      .reduce((acc, edge) => {
        const patternRef = delta.nodes.find((node) => node.id === edge.dst_id)?.source_ref;
        if (patternRef) acc.set(patternRef, (acc.get(patternRef) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());

    assert.ok(episodeNodes.length > 0);
    assert.ok(episodeNodes.length <= visibleWeeks.size * 7);
    for (const patternRef of ["pattern:overdrive", "pattern:tension", "pattern:depletion", "pattern:stagnation", "pattern:constriction"]) {
      assert.ok((manifestedCounts.get(patternRef) ?? 0) > 0, patternRef);
      assert.ok((manifestedCounts.get(patternRef) ?? 0) <= visibleWeeks.size * 3, patternRef);
    }
    assert.ok(delta.assumptions?.some((assumption) => (
      assumption.key === "selection" &&
      String(assumption.value).includes("max_7_stress_moments_per_week")
    )));
  });

  it("is deterministic for repeated input", async () => {
    const triplets = joinTriplets(fixtureInput());
    const reasoner = new Reasoner();
    const first = await reasoner.buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const second = await reasoner.buildDelta({ user_id: REASONER_TEST_USER, triplets });

    assert.deepStrictEqual(
      first.nodes.map((node) => [node.id, node.kind, node.source_ref]),
      second.nodes.map((node) => [node.id, node.kind, node.source_ref]),
    );
    assert.deepStrictEqual(
      first.edges.map((edge) => [edge.id, edge.src_id, edge.dst_id, edge.kind]),
      second.edges.map((edge) => [edge.id, edge.src_id, edge.dst_id, edge.kind]),
    );
  });

  it("rejects local identity and scopes UUID user graph ids", async () => {
    const input = fixtureInput();
    assert.throws(
      () => joinTriplets(input, { userId: "local" }),
      /user_id is required/,
    );
    assert.throws(
      () => rootCauseId("local"),
      /user_id is required/,
    );

    const localTriplets = joinTriplets(input);
    const otherTriplets = joinTriplets(input, { userId: OTHER_REASONER_TEST_USER });
    const reasoner = new Reasoner();

    const local = await reasoner.buildDelta({ user_id: REASONER_TEST_USER, triplets: localTriplets });
    const other = await reasoner.buildDelta({ user_id: OTHER_REASONER_TEST_USER, triplets: otherTriplets });

    assert.strictEqual(local.armed_root_cause.node_id, TEST_ROOT_CAUSE_ID);
    assert.strictEqual(other.armed_root_cause.node_id, rootCauseId(OTHER_REASONER_TEST_USER));
    assert.notStrictEqual(other.armed_root_cause.node_id, TEST_ROOT_CAUSE_ID);
    assert.ok(other.nodes.every((node) => node.user_id === OTHER_REASONER_TEST_USER));
    assert.ok(other.edges.every((edge) => edge.user_id === OTHER_REASONER_TEST_USER));

    const localIds = new Set(local.nodes.map((node) => node.id));
    assert.ok(other.nodes.every((node) => !localIds.has(node.id)));
    assert.ok(other.edges.some((edge) => edge.dst_id === other.armed_root_cause.node_id));
    assert.ok(other.edges.every((edge) => edge.src_id !== TEST_ROOT_CAUSE_ID && edge.dst_id !== TEST_ROOT_CAUSE_ID));
  });

  it("uses one neutral persistent root identity across WATCHING and armed states for non-local users", async () => {
    const userId = "1A6E2A5E-DA68-4D22-90C7-3D99704EF924";
    const triplets = joinTriplets(fixtureInput(), {
      userId,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const reasoner = new Reasoner();

    const armed = await reasoner.buildDelta({ user_id: userId, triplets });
    const watching = await reasoner.buildWatchingDelta({
      user_id: userId,
      triplets,
      generated_at_ts: 1234,
    });
    const armedRoot = armed.nodes.find((node) => node.id === armed.armed_root_cause.node_id);
    const watchingRoot = watching.nodes.find((node) => node.id === watching.armed_root_cause.node_id);

    assert.ok(armedRoot);
    assert.ok(watchingRoot);
    assert.strictEqual(armedRoot.id, rootCauseId(userId));
    assert.strictEqual(watchingRoot.id, armedRoot.id);
    assert.strictEqual(watchingRoot.source_ref, armedRoot.source_ref);
    assert.strictEqual(armedRoot.source_ref, `reasoner:${armedRoot.id}`);
    assert.match(armedRoot.id, /^ghost_root_[0-9a-f]{12}$/);
    assert.doesNotMatch(`${armedRoot.id}|${armedRoot.source_ref}`, /ai2|demo|story/i);
    assert.doesNotMatch(`${watchingRoot.id}|${watchingRoot.source_ref}`, /ai2|demo|story/i);
    assert.notStrictEqual(rootCauseId("6426A15D-61C3-4C5B-BF19-5CBB7152E9E8"), armedRoot.id);

  });

  it("rejects empty triplets instead of fabricating a cause", async () => {
    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets: [] }),
      NotEnoughSignalError,
    );
  });

  it("does not fabricate a root when only balanced biometric states exist", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "AI2 investor founder demo deadline";
    input.granola[0].summary = "Investor demo pressure, deadline, B2B positioning, and founder stakes.";
    input.biometrics.states[0] = {
      ...input.biometrics.states[0],
      yin_score: 62,
      yang_score: 64,
      category: "in_flow",
    };
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("surfaces an early causal result for worn biometrics plus one memory insight", async () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples = [
      input.biometrics.metrics[0].samples[0],
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:16:55.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:55.000Z" },
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:17:00.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:17:00.000Z" },
    ];
    input.calendar = [];
    input.granola = [];
    input.memory[0].occurred_at_ts = 1000;
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      memoryWindowSec: 10,
    });

    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID)!;
    const episode = delta.nodes.find((node) => node.kind === "episode")!;
    assert.equal(root.props_json?.evidence_grade, "weak");
    assert.match(String(episode.props_json?.evidence_gap), /Early causal scan/);
  });

  it("keeps biometrics-only episodes hidden even with three non-carried samples", async () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples = [
      input.biometrics.metrics[0].samples[0],
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:16:55.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:55.000Z" },
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:17:00.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:17:00.000Z" },
    ];
    input.calendar = [];
    input.granola = [];
    input.memory = [];
    const triplets = joinTriplets(input, { sampleWindowSec: 60 });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("does not count carried samples toward early causal availability", async () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples = [
      input.biometrics.metrics[0].samples[0],
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:16:55.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:16:55.000Z" },
      { ...input.biometrics.metrics[0].samples[0], timestamp: "1970-01-01T00:17:00.000Z", graph_source_ref: "healthkit:heart_rate:1970-01-01T00:17:00.000Z", carried: true },
    ];
    input.granola = [];
    input.memory = [];
    input.calendar[0].source = "google_calendar";
    input.calendar[0].title = "Investor demo prep";
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("builds a prompt from deterministic triplet refs", () => {
    const prompt = buildReasonerPrompt({ triplets: joinTriplets(fixtureInput()) });
    assert.match(prompt, /Do not invent biometric episodes/);
    assert.match(prompt, /state:1000/);
    assert.match(prompt, /AI2 demo sync/);
    assert.doesNotMatch(prompt, /\byin\b/i);
    assert.doesNotMatch(prompt, /\byang\b/i);
    });
  });

  it("rejects Welcome David when the meeting evidence has no stress-load signal", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "Welcome David!";
    input.calendar[0].source = "google_calendar";
    input.calendar[0].metadata = { topic_tags: ["#welcome", "#friend"] };
    input.granola[0].title = "Welcome David!";
    input.granola[0].summary = "Friendly welcome chat and onboarding logistics.";
    input.granola[0].body = "Friendly welcome chat and onboarding logistics.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Neo",
      ts_offset_sec: 5,
      text: "Friendly welcome chat and onboarding logistics.",
    }];
    input.granola[0].topics = ["#welcome"];
    input.memory[0] = {
      ...input.memory[0],
      source: "codex_project_capsule",
      insight_text: "DaoBrew project memory mentions demo pressure and investor positioning.",
      topics: ["#demo", "#investor"],
    };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("drops cross-day post-hoc source rows that start after the biometric episode", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "Investor debrief after the episode";
    input.calendar[0].start_ts = 40_000;
    input.calendar[0].end_ts = 40_600;
    input.granola[0].title = "Investor debrief after the episode";
    input.granola[0].occurred_at_ts = 40_010;
    input.granola[0].summary = "Investor deadline pressure and decision risk were discussed after the biometric state bucket.";
    input.granola[0].body = "We still need to pick one wedge, but this discussion happened after the biometric state bucket.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Neo",
      ts_offset_sec: 10,
      text: "We still need to pick one wedge, but this discussion happened after the biometric state bucket.",
    }];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 24 * 60 * 60,
      memoryWindowSec: 10,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("keeps planned Calendar plus Granola context after a bucketed biometric timestamp", async () => {
    const input = fixtureInput();
    input.calendar[0].start_ts = 1000 + (90 * 60);
    input.calendar[0].end_ts = input.calendar[0].start_ts + 3600;
    input.calendar[0].metadata = {
      import_policy: "imported_calendar_granola_aligned_candidate",
      evidence_strength: "granola_calendar_biometric_candidate",
      matched_granola_refs: ["meeting-1"],
    };
    input.granola[0].occurred_at_ts = input.calendar[0].start_ts;
    input.granola[0].event_id = input.calendar[0].id;

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 2 * 60 * 60,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });

    const episode = delta.nodes.find((node) => node.kind === "episode");
    assert.ok(episode);
    assert.strictEqual(episode.title, "Closing the evidence-backed delivery loop remains the unresolved gap");
    assert.strictEqual(episode.props_json?.evidence_grade, "strong");
    assert.ok(delta.edges.some((edge) => edge.kind === "evidence_for"));
  });

  it("demotes no-summary Granola rows to insufficient evidence without other support", async () => {
    const input = fixtureInput();
    input.granola[0].summary = "No summary";
    input.granola[0].body = null;
    input.granola[0].transcript_spans = [];
    input.memory = [];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("does not arm or name a root from generic event titles alone", async () => {
    for (const title of ["Event", "Weekly sync - DaoBrew", "AI2 meeting"]) {
      const input = fixtureInput();
      input.calendar[0].title = title;
      input.granola[0].title = title;
      input.granola[0].summary = "Meeting notes mention updates and context, but no unresolved gap is cited.";
      input.granola[0].body = "Meeting notes mention updates and context, but no unresolved gap is cited.";
      input.granola[0].transcript_spans = [{
        idx: 0,
        speaker: "Neo",
        ts_offset_sec: 0,
        text: "Meeting notes mention updates and context, but no unresolved gap is cited.",
      }];

      const triplets = joinTriplets(input, {
        sampleWindowSec: 60,
        contextWindowSec: 120,
        memoryWindowSec: 10,
      });

      await assert.rejects(
        () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
        NotEnoughSignalError,
        `${title} must stay an evidence chip, not a root`,
      );
    }
  });

  it("builds a first-class WATCHING delta for insufficient evidence", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "Weekly sync - DaoBrew";
    input.granola[0].title = "Weekly sync - DaoBrew";
    input.granola[0].summary = "Meeting notes mention updates and context, but no unresolved gap is cited.";
    input.granola[0].body = "Meeting notes mention updates and context, but no unresolved gap is cited.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Neo",
      ts_offset_sec: 0,
      text: "Meeting notes mention updates and context, but no unresolved gap is cited.",
    }];
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildWatchingDelta({
      user_id: REASONER_TEST_USER,
      triplets,
      generated_at_ts: 1234,
    }, "Watching: not enough meeting-note detail to name a work thread yet");
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);

    assert.strictEqual(delta.root_armed, false);
    assert.strictEqual(delta.armed_root_cause.node_id, TEST_ROOT_CAUSE_ID);
    assert.ok(root);
    assert.strictEqual(root.title, "WATCHING");
    assert.strictEqual(root.subtitle, "insufficient evidence");
    assert.strictEqual(root.props_json?.status, "watching");
    assert.strictEqual(root.props_json?.evidence_grade, "insufficient_evidence");
    assert.strictEqual((root.props_json?.citation_gate as Record<string, unknown>)?.has_cited_transcript_span, false);
    assert.doesNotMatch(JSON.stringify(root), /Weekly sync - DaoBrew|AI2 meeting|Event/);
    assert.ok(delta.nodes.some((node) => node.kind === "meeting" && node.title === "Weekly sync - DaoBrew"));
    assert.ok(delta.edges.some((edge) => edge.kind === "relates_to" && edge.dst_id === TEST_ROOT_CAUSE_ID));
    assert.ok(delta.edges.every((edge) => edge.kind === "relates_to"));
    assert.ok(!delta.edges.some((edge) => edge.kind === "manifested"));
    assert.ok(delta.nodes.some((node) => node.kind === "pattern"));
    // No supporting project memories in this fixture -> zero memory_hit nodes.
    assert.strictEqual(delta.nodes.filter((node) => node.kind === "memory_hit").length, 0);
  });

  it("surfaces memory_hit nodes on a WATCHING root when project memory supports the context", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "Weekly sync - DaoBrew";
    input.granola[0].title = "Weekly sync - DaoBrew";
    input.granola[0].summary = "Notes mention the wedge demo review path, but no unresolved gap is cited.";
    input.granola[0].body = "Notes mention the wedge demo review path, but no unresolved gap is cited.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Neo",
      ts_offset_sec: 0,
      text: "Notes mention the wedge demo review path, but no unresolved gap is cited.",
    }];
    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildWatchingDelta({
      user_id: REASONER_TEST_USER,
      triplets,
      generated_at_ts: 1234,
    }, "Watching: not enough meeting-note detail to name a work thread yet");

    const memoryNodes = delta.nodes.filter((node) => node.kind === "memory_hit");
    assert.ok(memoryNodes.length >= 1, "watching-with-support must still surface memory_hit nodes");
    assert.ok(memoryNodes.every((node) => node.source_ref));
    // Watching invariant: memory_hit nodes carry the same context-only marking
    // as the other watching context nodes.
    for (const node of memoryNodes) {
      assert.strictEqual(node.props_json?.source_context_role, "watching_context_only");
      assert.strictEqual(node.props_json?.causality_level, "insufficient_evidence");
      // Fixture memory strength (0.8) would exceed the watching cap if leaked.
      assert.strictEqual(node.props_json?.strength, 0.8);
    }
    const memEdges = delta.edges.filter((edge) => (
      (edge.props_json as Record<string, unknown> | undefined)?.evidence_role === "memory_support"
    ));
    assert.equal(memEdges.length, memoryNodes.length);
    const memoryNodeIds = new Set(memoryNodes.map((node) => node.id));
    assert.ok(memEdges.every((edge) => edge.kind === "suggests" && edge.dst_id === TEST_ROOT_CAUSE_ID));
    assert.ok(memEdges.every((edge) => memoryNodeIds.has(edge.src_id)));
    // Watching path caps memory edge weight at the deliberate watching-context
    // weight (0.28) even though the fixture memory strength is 0.8.
    assert.ok(memEdges.every((edge) => edge.weight === 0.28));
  });

  it("uses cited transcript gap language instead of event titles for root text", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "Weekly sync - DaoBrew";
    input.granola[0].title = "AI2 meeting";
    input.granola[0].summary = "The meeting summary is generic.";
    input.granola[0].body = "The open question is which value proposition gets the primary wedge, and we still need to pick one.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Investor",
      ts_offset_sec: 1800,
      text: "The open question is which value proposition gets the primary wedge, and we still need to pick one.",
    }];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);

    assert.ok(root);
    assert.match(root.title, /evidence-backed delivery loop/);
    assert.match(delta.armed_root_cause.brief.cause, /evidence-backed delivery loop/);
    assert.doesNotMatch(root.title, /Weekly sync|AI2 meeting|Event/);
    assert.doesNotMatch(delta.armed_root_cause.brief.cause, /Weekly sync|AI2 meeting|Event/);
  });

  it("infers the deeper B2B/B2C wedge decision instead of the surface value-proposition question", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "AI2 meeting";
    input.granola[0].title = "AI2 meeting";
    input.granola[0].summary = "The summary says the team discussed product positioning.";
    input.granola[0].body = [
      "What is your value proposition?",
      "I keep hearing B2B and B2C, but which wedge are you choosing first?",
      "We still need to decide the one wedge positioning before the next investor read.",
    ].join(" ");
    input.granola[0].transcript_spans = [
      {
        idx: 0,
        speaker: "Investor",
        ts_offset_sec: 120,
        text: "What is your value proposition?",
      },
      {
        idx: 1,
        speaker: "Investor",
        ts_offset_sec: 180,
        text: "I keep hearing B2B and B2C, but which wedge are you choosing first?",
      },
      {
        idx: 2,
        speaker: "Neo",
        ts_offset_sec: 240,
        text: "We still need to decide the one wedge positioning before the next investor read.",
      },
    ];
    input.memory[0] = {
      ...input.memory[0],
      source: "codex_project_capsule",
      insight_text: "Project Memory records the same unresolved B2B vs B2C / one wedge positioning decision across DaoBrew strategy work.",
      topics: ["#b2b", "#b2c", "#one-wedge", "#positioning"],
    };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);
    const episode = delta.nodes.find((node) => node.kind === "episode");

    assert.ok(root);
    assert.ok(episode);
    assert.match(root.title, /B2B\/B2C .*one wedge positioning decision/);
    assert.match(delta.armed_root_cause.brief.cause, /B2B\/B2C .*one wedge positioning decision/);
    assert.doesNotMatch(root.title, /value proposition|AI2 meeting|Weekly sync|Event/i);
    assert.doesNotMatch(delta.armed_root_cause.brief.cause, /value proposition|AI2 meeting|Weekly sync|Event/i);
    assert.strictEqual(
      (root.props_json?.citation_gate as Record<string, unknown>)?.thread_key,
      "converge-the-story",
    );
    assert.strictEqual(root.props_json?.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.strictEqual(episode.props_json?.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.deepStrictEqual(episode.props_json?.evidence_ticks, {
      calendar: true,
      granola: true,
      memory: true,
    });
  });

  it("accepts a same-local-day source-backed hypothesis even when the meeting is hours from the biometric episode", async () => {
    const input = fixtureInput();
    const stateTs = Math.trunc(Date.parse("2026-05-29T21:00:00-07:00") / 1000);
    const meetingTs = Math.trunc(Date.parse("2026-05-29T09:20:00-07:00") / 1000);
    input.biometrics.states[0] = {
      ...input.biometrics.states[0],
      bucket_ts: stateTs,
      updated_at_ts: stateTs + 10,
      graph_source_ref: `state:${stateTs}`,
    };
    input.biometrics.metrics[0].samples[0] = {
      ...input.biometrics.metrics[0].samples[0],
      timestamp: new Date(stateTs * 1000).toISOString(),
      graph_source_ref: `healthkit:heart_rate:${stateTs}`,
    };
    input.calendar[0].title = "AI2 interview";
    input.calendar[0].start_ts = meetingTs;
    input.calendar[0].end_ts = meetingTs + 1800;
    input.calendar.push({
      ...input.calendar[0],
      id: "event-unrelated",
      source_ref: "evt-unrelated",
      graph_source_ref: "calendar:evt-unrelated",
      title: "Tesla",
      start_ts: meetingTs + (4 * 60 * 60),
      end_ts: meetingTs + (4 * 60 * 60) + 1800,
      metadata: {},
    });
    input.granola[0].title = "AI2 interview";
    input.granola[0].occurred_at_ts = meetingTs + 60;
    input.granola[0].summary = "Investor conversation about B2B/B2C positioning and which wedge to choose.";
    input.granola[0].body = [
      "What is your value proposition?",
      "I keep hearing B2B and B2C, but which wedge are you choosing first?",
      "We still need to decide the one wedge positioning before the next investor read.",
    ].join(" ");
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Investor",
      ts_offset_sec: 240,
      text: "I keep hearing B2B and B2C, but which wedge are you choosing first?",
    }];
    input.memory[0] = {
      ...input.memory[0],
      source: "codex_project_capsule",
      insight_text: "Project Memory records the unresolved B2B vs B2C one wedge positioning decision.",
      topics: ["#b2b", "#b2c", "#one-wedge", "#positioning"],
    };

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const root = delta.nodes.find((node) => node.id === TEST_ROOT_CAUSE_ID);
    const episode = delta.nodes.find((node) => node.kind === "episode");

    assert.ok(root);
    assert.ok(episode);
    assert.match(root.title, /B2B\/B2C .*one wedge positioning decision/);
    assert.strictEqual(episode.props_json?.long_horizon_context, "same_local_day");
    assert.strictEqual(episode.props_json?.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.deepStrictEqual(
      (episode.props_json?.supporting_calendar_events as Array<{ title: string }>).map((event) => event.title),
      ["AI2 interview"],
    );
    assert.ok(delta.edges.some((edge) => edge.kind === "manifested" && edge.dst_id === patternId(delta, "overdrive")));
  });

  it("does not fabricate a semantic latent root when transcript spans lack Project Memory support", async () => {
    const input = fixtureInput();
    input.calendar[0].title = "AI2 meeting";
    input.granola[0].title = "AI2 meeting";
    input.granola[0].summary = "The summary says the team discussed product positioning.";
    input.granola[0].body = "What is your value proposition? We still need to decide the one wedge positioning.";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Investor",
      ts_offset_sec: 120,
      text: "What is your value proposition? We still need to decide the one wedge positioning.",
    }];
    input.memory = [];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("exposes deterministic latent-hypothesis verifier gates separately from proposal", () => {
    const input = fixtureInput();
    input.calendar[0].title = "AI2 meeting";
    input.granola[0].title = "AI2 meeting";
    input.granola[0].summary = "The summary says the team discussed product positioning.";
    input.granola[0].body = "What is your value proposition? I keep hearing B2B and B2C, but which wedge are you choosing first?";
    input.granola[0].transcript_spans = [{
      idx: 0,
      speaker: "Investor",
      ts_offset_sec: 120,
      text: "I keep hearing B2B and B2C, but which wedge are you choosing first?",
    }];
    input.memory[0] = {
      ...input.memory[0],
      source: "codex_project_capsule",
      insight_text: "Project Memory records the unresolved B2B vs B2C one wedge positioning decision.",
      topics: ["#b2b", "#b2c", "#positioning"],
    };

    const proposal = proposeLatentHypotheses({
      meetings: input.granola,
      memories: input.memory,
      biometric_patterns: ["overdrive"],
      event_titles: input.calendar.map((event) => event.title),
      anchor_ts: input.biometrics.states[0].bucket_ts,
    })[0];
    assert.ok(proposal);

    const verification = verifyLatentHypothesis(proposal, {
      meetings: input.granola,
      memories: input.memory,
      biometric_patterns: ["overdrive"],
      event_titles: input.calendar.map((event) => event.title),
      anchor_ts: input.biometrics.states[0].bucket_ts,
    });

    assert.strictEqual(verification.accepted, true);
    assert.strictEqual(verification.claim_level, "source_backed_hypothesis_not_settled_causality");
    assert.strictEqual(verification.gates.citation, "pass");
    assert.strictEqual(verification.gates.title_ban, "pass");
    assert.strictEqual(verification.gates.time_plausibility, "pass");
    assert.strictEqual(verification.gates.biometrics_firewall, "pass");
    assert.strictEqual(verification.gates.recurrence_cross_source, "pass");
    assert.strictEqual(verification.gates.non_clinical_language, "pass");

    const titleOnly = verifyLatentHypothesis({
      ...proposal,
      cause: "AI2 meeting",
    }, {
      meetings: input.granola,
      memories: input.memory,
      biometric_patterns: ["overdrive"],
      event_titles: input.calendar.map((event) => event.title),
      anchor_ts: input.biometrics.states[0].bucket_ts,
    });
    assert.strictEqual(titleOnly.accepted, false);
    assert.ok(titleOnly.rejected_reasons.some((reason) => reason.includes("title check")));

    const clinical = verifyLatentHypothesis({
      ...proposal,
      cause: "B2B caused your burnout symptoms",
    }, {
      meetings: input.granola,
      memories: input.memory,
      biometric_patterns: ["overdrive"],
      event_titles: input.calendar.map((event) => event.title),
      anchor_ts: input.biometrics.states[0].bucket_ts,
    });
    assert.strictEqual(clinical.accepted, false);
    assert.ok(clinical.rejected_reasons.some((reason) => reason.includes("language check")));
  });

  it("proposes the causal-model definition thread from action-item style meeting notes", () => {
    const input = fixtureInput();
    input.granola[0].title = "Design discussion";
    input.granola[0].summary = "Product design sync covering stress tracking, triggers, and open questions.";
    input.granola[0].body = [
      "Open Questions and Next Steps.",
      "Trigger rationale and delivery mechanism still to be defined.",
      "Define specific metrics for the stress-to-productivity causal model.",
      "Activity type taxonomy needs further scoping.",
    ].join(" ");
    input.granola[0].transcript_spans = [
      { idx: 0, speaker: null, ts_offset_sec: null, text: "Trigger rationale and delivery mechanism still to be defined." },
      { idx: 1, speaker: null, ts_offset_sec: null, text: "Define specific metrics for the stress-to-productivity causal model." },
    ];
    input.memory[0] = {
      ...input.memory[0],
      source: "claude_sessions",
      insight_text: "Project Memory records the causal engine work: the reasoner still needs concrete trigger metrics tying biometric stress signals to productivity outcomes.",
      topics: ["#causal-engine", "#reasoner", "#biometrics"],
    };

    const context = {
      meetings: input.granola,
      memories: input.memory,
      biometric_patterns: ["depletion"],
      event_titles: ["Design discussion"],
      anchor_ts: input.granola[0].occurred_at_ts ?? undefined,
    };
    const proposal = proposeLatentHypotheses(context)
      .find((entry) => entry.thread_key === "causal-model-definition");
    assert.ok(proposal, "expected a causal-model-definition proposal from real note language");
    assert.ok(proposal.evidence_spans.length >= 1);
    assert.ok(proposal.memory_support.length >= 1);

    const verification = verifyLatentHypothesis(proposal, context);
    assert.strictEqual(verification.accepted, true);
    assert.strictEqual(verification.gates.citation, "pass");
    assert.strictEqual(verification.gates.time_plausibility, "pass");
    assert.strictEqual(verification.gates.recurrence_cross_source, "pass");
    assert.strictEqual(verification.gates.non_clinical_language, "pass");
  });

  // time_plausibility semantics (user decision 2026-07-05): filter citations to the
  // anchor's local day instead of vetoing any proposal whose evidence crosses days.
  // Multi-day history stays as recurrence context; only same-day spans are cited.
  describe("time_plausibility filter-not-veto", () => {
    const WEEK = 7 * 24 * 60 * 60;
    const TS_WEEK1 = 1_700_000_000; // 2023-11-14 America/Los_Angeles
    const TS_WEEK2 = TS_WEEK1 + WEEK; // 2023-11-21 America/Los_Angeles, same local time of day

    function meetingFixture(id: string, occurredAtTs: number, spanText: string): GranolaMeetingSignal {
      return {
        id,
        user_id: REASONER_TEST_USER,
        source: "granola",
        source_ref: id,
        graph_source_ref: `granola:${id}`,
        event_id: null,
        kind: "meeting",
        title: `Weekly strategy sync ${id}`,
        occurred_at_ts: occurredAtTs,
        duration_sec: 1800,
        participants: [],
        summary: null,
        body: spanText,
        transcript_spans: [{ idx: 0, speaker: null, ts_offset_sec: null, text: spanText }],
        topics: [],
        created_at_ts: occurredAtTs,
      };
    }

    const memoryFixture: MemoryInsightSignal = {
      id: "memory-tp-1",
      user_id: REASONER_TEST_USER,
      source: "claude_sessions",
      source_ref: "session.md:7",
      graph_source_ref: "memory:session.md:7",
      insight_text: "Project Memory records the unresolved B2B vs B2C one wedge positioning decision.",
      topics: ["#b2b", "#b2c", "#positioning"],
      importance: 0.9,
      strength: 0.8,
      occurred_at_ts: null,
      last_accessed_ts: null,
      created_at_ts: 902,
    };

    const weekOneSpanText = "I keep hearing B2B and B2C from partners, but which wedge are you choosing first?";
    const weekTwoSpanText = "We still need to decide the B2B positioning story before the investor read.";

    it("passes with multi-day evidence and cites only anchor-day spans while recurrence keeps full history", () => {
      const meetings = [
        meetingFixture("m1", TS_WEEK1, weekOneSpanText),
        meetingFixture("m2", TS_WEEK2, weekTwoSpanText),
      ];
      const context = {
        meetings,
        memories: [memoryFixture],
        biometric_patterns: ["overdrive"],
        event_titles: [],
        anchor_ts: TS_WEEK2 + 1800,
      };

      // Pre-filter proposal spans both days — the raw material the old gate vetoed.
      const proposal = proposeLatentHypotheses(context).find((entry) => entry.thread_key === "converge-the-story");
      assert.ok(proposal);
      assert.strictEqual(proposal.evidence_spans.length, 2);
      assert.strictEqual(proposal.recurrence_weeks, 2);

      const candidate = detectLatentHypothesis(context);
      assert.ok(candidate, "multi-day evidence with an anchor-day span must not be vetoed");
      assert.strictEqual(candidate.verification.gates.time_plausibility, "pass");
      assert.strictEqual(candidate.verification.accepted, true);

      // Cited evidence is filtered to the anchor's local day only.
      assert.ok(candidate.evidence_spans.length >= 1);
      assert.ok(candidate.evidence_spans.every((span) => span.source_ref === "granola:m2"));

      // Recurrence still reflects the FULL pre-filter history (2 weeks > the 1 week
      // that anchor-day evidence alone would give).
      assert.strictEqual(candidate.recurrence_weeks, 2);

      // Surface terms are re-derived from the filtered citation set for honesty.
      assert.ok(candidate.surface_terms.includes("b2b"));
      assert.ok(!candidate.surface_terms.includes("b2c"), "b2c only appears in the demoted other-day span");
    });

    it("still vetoes when the anchor day has zero same-day spans", () => {
      const meetings = [meetingFixture("m1", TS_WEEK1, weekOneSpanText)];
      const context = {
        meetings,
        memories: [memoryFixture],
        biometric_patterns: ["overdrive"],
        event_titles: [],
        anchor_ts: TS_WEEK1 + (2 * 24 * 60 * 60),
      };

      const proposal = proposeLatentHypotheses(context).find((entry) => entry.thread_key === "converge-the-story");
      assert.ok(proposal);
      const verification = verifyLatentHypothesis(proposal, context);
      assert.strictEqual(verification.gates.time_plausibility, "fail");
      assert.strictEqual(verification.accepted, false);
      assert.ok(verification.rejected_reasons.some((reason) => reason.includes("timing check")));

      assert.strictEqual(detectLatentHypothesis(context), null);
    });

    it("keeps pass-through behavior when anchor_ts is not finite", () => {
      const meetings = [
        meetingFixture("m1", TS_WEEK1, weekOneSpanText),
        meetingFixture("m2", TS_WEEK2, weekTwoSpanText),
      ];
      const context = {
        meetings,
        memories: [memoryFixture],
        biometric_patterns: ["overdrive"],
        event_titles: [],
      };

      const candidate = detectLatentHypothesis(context);
      assert.ok(candidate);
      assert.strictEqual(candidate.verification.gates.time_plausibility, "pass");
      assert.strictEqual(candidate.evidence_spans.length, 2, "no anchor means no day filtering");
      assert.strictEqual(candidate.recurrence_weeks, 2);
    });
  });

  it("defaults to insufficient evidence when biometric state has no eligible source bundle", async () => {
    const input = fixtureInput();
    input.calendar = [];
    input.granola = [];
    input.memory = [];

    const triplets = joinTriplets(input, {
      sampleWindowSec: 60,
    });

    await assert.rejects(
      () => new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets }),
      NotEnoughSignalError,
    );
  });

  it("keeps same-event trigger bundles separate when backend biometrics map to different Patterns", async () => {
    const input = fixtureInput();
    input.biometrics.metrics[0].samples.push({
      metric: "heart_rate",
      value: 62,
      timestamp: "1970-01-01T00:20:10.000Z",
      graph_source_ref: "healthkit:heart_rate:1970-01-01T00:20:10.000Z",
    });
    input.biometrics.states.push({
      bucket_ts: 1200,
      yin_score: 68,
      yang_score: 22,
      category: "recharging",
      source_quality: "data_verified",
      updated_at_ts: 1210,
      graph_source_ref: "state:1200",
    });
    input.calendar[0].start_ts = 930;
    input.calendar[0].end_ts = 1500;
    input.granola[0].occurred_at_ts = 940;

    const triplets = joinTriplets(input, {
      sampleWindowSec: 90,
      contextWindowSec: 600,
      memoryWindowSec: 10,
    });
    const delta = await new Reasoner().buildDelta({ user_id: REASONER_TEST_USER, triplets });
    const episodeNodes = delta.nodes.filter((node) => node.kind === "episode");
    const manifestedByEpisode = new Map<string, Set<string>>();
    for (const edge of delta.edges.filter((entry) => entry.kind === "manifested")) {
      manifestedByEpisode.set(edge.src_id, new Set([
        ...(manifestedByEpisode.get(edge.src_id) ?? []),
        String(delta.nodes.find((node) => node.id === edge.dst_id)?.source_ref),
      ]));
    }

    assert.strictEqual(episodeNodes.length, 2);
    assert.ok(episodeNodes.every((node) => node.title === "Closing the evidence-backed delivery loop remains the unresolved gap"));
    assert.ok([...manifestedByEpisode.values()].some((patterns) => patterns.has("pattern:overdrive")));
    assert.ok([...manifestedByEpisode.values()].some((patterns) => patterns.has("pattern:depletion")));
    assert.ok(episodeNodes.every((node) => {
      const lenses = node.props_json?.pattern_lenses as Record<string, unknown> | undefined;
      return lenses && Object.keys(lenses).length > 0;
    }));
  });
