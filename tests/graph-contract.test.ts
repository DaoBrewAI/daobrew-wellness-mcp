import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS } from "../src/engine/schema.js";
import { Reasoner } from "../src/engine/reasoner/Reasoner.js";
import { joinTriplets, TripletInput } from "../src/engine/triplet.js";
import type { GraphDelta } from "../src/engine/reasoner/types.js";

const GRAPH_CONTRACT_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";

/**
 * Graph contract test (engine P5).
 *
 * Locks the node/edge `kind` strings and the ghost-node props_json keys that
 * the TypeScript engine WRITES against what the Swift Mac app READS.
 *
 * Writer side (this repo):
 *   - src/engine/schema.ts        GRAPH_NODE_KINDS / GRAPH_EDGE_KINDS + SQL CHECK constraints
 *   - src/engine/upsert.ts        validateGraphDelta gate + mergeRootProps (status "armed")
 *   - src/engine/reasoner/Reasoner.ts  buildDelta / buildWatchingDelta node assembly
 *   - src/tools.ts                daobrew_detonate_done (status "done" + artifact_ref)
 *
 * Reader side (../DaobrewSentinelMac, parsed from Swift SOURCE at test runtime):
 *   - Sources/SentinelMac/Models/KnowledgeGraph.swift    mapNodeKind / mapEdgeKind + props reads
 *   - Sources/SentinelMac/Network/SentinelGraphStore.swift  readStatusAndArtifact
 *   - Sources/SentinelMac/Models/DetonatorState.swift    props["status"] / props["artifact_ref"]
 *
 * Strings only — no UI runs. If a regex here stops matching, the reader source
 * moved: update the extraction regex AND re-verify the contract by hand.
 */

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

// Compiled test runs from dist/tests/, TS source lives in tests/ — walk up to
// whichever parent actually is the repo root.
const REPO_ROOT = (() => {
  for (const candidate of [resolve(__dirname, "..", ".."), resolve(__dirname, "..")]) {
    if (
      existsSync(join(candidate, "package.json")) &&
      existsSync(join(candidate, "src", "engine", "schema.ts"))
    ) {
      return candidate;
    }
  }
  throw new Error(`graph-contract: cannot locate daobrew-wellness-mcp repo root from ${__dirname}`);
})();

const SENTINEL_MAC_DIR = process.env.DAOBREW_SENTINEL_MAC_DIR?.trim() ||
  resolve(REPO_ROOT, "..", "DaobrewSentinelMac");
const KNOWLEDGE_GRAPH_SWIFT = join(
  SENTINEL_MAC_DIR, "Sources", "SentinelMac", "Models", "KnowledgeGraph.swift",
);
const GRAPH_STORE_SWIFT = join(
  SENTINEL_MAC_DIR, "Sources", "SentinelMac", "Network", "SentinelGraphStore.swift",
);
const DETONATOR_STATE_SWIFT = join(
  SENTINEL_MAC_DIR, "Sources", "SentinelMac", "Models", "DetonatorState.swift",
);

const READER_MISSING = `SentinelMac reader source not found (looked in ${SENTINEL_MAC_DIR}); ` +
  "set DAOBREW_SENTINEL_MAC_DIR to the DaobrewSentinelMac checkout to enforce the contract";

// ---------------------------------------------------------------------------
// Extraction helpers (formatting-robust, loud failures)
// ---------------------------------------------------------------------------

function readSource(path: string): string {
  assert.ok(existsSync(path), `graph-contract: missing source file ${path}`);
  return readFileSync(path, "utf-8");
}

/** Slice a Swift function body: from its `func <name>` marker to the next `func `. */
function sliceSwiftFunc(source: string, funcName: string, file: string): string {
  const marker = `func ${funcName}`;
  const start = source.indexOf(marker);
  assert.ok(
    start >= 0,
    `${file}: "${marker}" not found — reader source moved; update the extraction regex in graph-contract.test.ts`,
  );
  const rest = source.slice(start + marker.length);
  const next = rest.search(/\n\s*(?:private\s+|static\s+)*func\s/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Extract `case "<literal>":` raw strings from a Swift switch body. */
function extractSwitchCaseStrings(block: string, context: string): string[] {
  const kinds = [...block.matchAll(/case\s+"([a-z0-9_]+)"\s*:/g)].map((match) => match[1]);
  assert.ok(
    kinds.length > 0,
    `${context}: no case "…" strings extracted — reader source moved; update the extraction regex`,
  );
  return kinds;
}

/** Extract all '<literal>' strings from a SQL CHECK(kind IN (...)) list. */
function extractCheckKindLists(schemaSource: string): string[][] {
  const lists = [...schemaSource.matchAll(/CHECK\(kind IN \(([^)]+)\)\)/g)]
    .map((match) => [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((entry) => entry[1]));
  assert.ok(
    lists.length >= 2,
    "src/engine/schema.ts: CHECK(kind IN (...)) constraints not found — schema DDL moved; update graph-contract.test.ts",
  );
  return lists;
}

// ---------------------------------------------------------------------------
// Runtime writer fixtures — the same canonical fixture reasoner.test.ts uses,
// so the contract test exercises the real node assembly, not a transcript of it.
// ---------------------------------------------------------------------------

function fixtureInput(): TripletInput {
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
      user_id: GRAPH_CONTRACT_USER,
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
      user_id: GRAPH_CONTRACT_USER,
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
      user_id: GRAPH_CONTRACT_USER,
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

let deltasPromise: Promise<{ armed: GraphDelta; watching: GraphDelta }> | undefined;

function writerDeltas(): Promise<{ armed: GraphDelta; watching: GraphDelta }> {
  deltasPromise ??= (async () => {
    const triplets = joinTriplets(fixtureInput(), {
      userId: GRAPH_CONTRACT_USER,
      sampleWindowSec: 60,
      contextWindowSec: 120,
      memoryWindowSec: 10,
    });
    const reasoner = new Reasoner();
    const armed = await reasoner.buildDelta({ user_id: GRAPH_CONTRACT_USER, triplets });
    const watching = await reasoner.buildWatchingDelta({
      user_id: GRAPH_CONTRACT_USER,
      triplets: [],
      generated_at_ts: 1234,
    });
    return { armed, watching };
  })();
  return deltasPromise;
}

function rootProps(delta: GraphDelta): Record<string, unknown> {
  const root = delta.nodes.find((node) => node.id === delta.armed_root_cause.node_id);
  assert.ok(root, "reasoner delta lost its root ghost node");
  assert.strictEqual(root.kind, "ghost", "root node is no longer a ghost — contract test needs a rewrite");
  return (root.props_json ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Ghost props the Swift reader depends on. Every entry cites the read site in
// KnowledgeGraph.swift (line numbers as of 2026-07; functions are the stable
// anchors if lines drift).
// ---------------------------------------------------------------------------

// Required on EVERY ghost the reasoner emits (watching and armed/suggested):
const GHOST_CORE_PROPS = [
  // anchorGhostId (~L451) picks the canvas anchor by status != "watching";
  // buildInsight (~L684) prefers actionable ghosts; buildDetails renders the
  // "status" DetailRow (~L757) and the WATCHING kindLabel gate (~L830).
  "status",
  // ghostDisplayTitle fallback when the title is a bare status word (~L472).
  "root_cause_class",
  // buildDetails "scale" DetailRow (~L760).
  "root_scale",
  // buildDetails "evidence" DetailRow (~L763).
  "evidence_grade",
  // buildDetails "patterns" DetailRow (~L786).
  "linked_patterns",
  // brief.cause: ghostDisplayTitle (~L470), insight headline (~L708), detail
  // prose (~L814). brief.suggested_block.title: insight suggestedAction (~L715).
  "brief",
] as const;

// Additionally required on the armed/suggested root ghost:
const GHOST_ARMED_PROPS = [
  "week_start",                   // GraphNode.weekKey (~L390)
  "week_label",                   // GraphNode.weekLabel (~L391) + "week" DetailRow (~L766)
  "supporting_calendar_events",   // "support" DetailRow counts (~L777)
  "supporting_meeting_notes",     // "support" DetailRow counts (~L778)
  "supporting_project_memories",  // "support" DetailRow counts (~L779)
  "biometric_episode_count",      // "body signals" DetailRow (~L790)
] as const;

// Additionally required on the watching ghost:
const GHOST_WATCHING_PROPS = [
  "evidence_gap",   // NodeDetail.evidenceGap (~L741)
  "summary",        // detail prose fallback (~L737/L816)
  "key_points",     // NodeDetail.keyPoints (~L738)
  "evidence_ticks", // evidenceKinds calendar/granola/memory ticks (~L913)
] as const;

// Ghost status lifecycle the engine can leave in props_json:
//   "watching"  Reasoner.buildWatchingDelta
//   "suggested" Reasoner.buildDelta root + upsert.ts disarmOtherGhostsSql
//   "armed"     upsert.ts mergeRootProps
//   "done"      src/tools.ts daobrew_detonate_done
const ENGINE_GHOST_STATUSES = ["watching", "suggested", "armed", "done"] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("graph contract: engine writer vs SentinelMac reader", () => {
  it("schema DDL CHECK constraints match the exported kind constants", () => {
    const schemaSource = readSource(join(REPO_ROOT, "src", "engine", "schema.ts"));
    const checkLists = extractCheckKindLists(schemaSource);
    const nodeCheck = checkLists.find((list) => list.includes("ghost"));
    const edgeCheck = checkLists.find((list) => list.includes("manifested"));
    assert.ok(nodeCheck, "graph_nodes CHECK(kind IN (...)) not found in schema.ts DDL");
    assert.ok(edgeCheck, "graph_edges CHECK(kind IN (...)) not found in schema.ts DDL");
    assert.deepStrictEqual(
      [...nodeCheck].sort(),
      [...GRAPH_NODE_KINDS].sort(),
      "GRAPH_NODE_KINDS and the graph_nodes CHECK constraint drifted apart in schema.ts",
    );
    assert.deepStrictEqual(
      [...edgeCheck].sort(),
      [...GRAPH_EDGE_KINDS].sort(),
      "GRAPH_EDGE_KINDS and the graph_edges CHECK constraint drifted apart in schema.ts",
    );
  });

  it("every node kind the engine can write is handled by the Swift reader", (t) => {
    if (!existsSync(KNOWLEDGE_GRAPH_SWIFT)) return t.skip(READER_MISSING);

    const swift = readSource(KNOWLEDGE_GRAPH_SWIFT);
    const readerNodeKinds = extractSwitchCaseStrings(
      sliceSwiftFunc(swift, "mapNodeKind", "KnowledgeGraph.swift"),
      "KnowledgeGraph.swift mapNodeKind",
    );

    for (const kind of GRAPH_NODE_KINDS) {
      assert.ok(
        readerNodeKinds.includes(kind),
        `node kind "${kind}" is writable by the engine (schema.ts GRAPH_NODE_KINDS / upsert gate) ` +
        `but KnowledgeGraph.swift mapNodeKind drops it — the node would silently vanish from the canvas`,
      );
    }

    const readerOnly = readerNodeKinds.filter((kind) => !(GRAPH_NODE_KINDS as readonly string[]).includes(kind));
    if (readerOnly.length > 0) {
      // Informational only: the reader accepting more than the engine writes is harmless.
      console.log(`[graph-contract] reader-only node kinds (engine never writes): ${readerOnly.join(", ")}`);
    }
  });

  it("every edge kind the engine can write is handled by the Swift reader", (t) => {
    if (!existsSync(KNOWLEDGE_GRAPH_SWIFT)) return t.skip(READER_MISSING);

    const swift = readSource(KNOWLEDGE_GRAPH_SWIFT);
    const readerEdgeKinds = extractSwitchCaseStrings(
      sliceSwiftFunc(swift, "mapEdgeKind", "KnowledgeGraph.swift"),
      "KnowledgeGraph.swift mapEdgeKind",
    );

    for (const kind of GRAPH_EDGE_KINDS) {
      assert.ok(
        readerEdgeKinds.includes(kind),
        `edge kind "${kind}" is writable by the engine (schema.ts GRAPH_EDGE_KINDS / upsert gate) ` +
        `but KnowledgeGraph.swift mapEdgeKind drops it — the edge would silently vanish from the canvas`,
      );
    }

    const readerOnly = readerEdgeKinds.filter((kind) => !(GRAPH_EDGE_KINDS as readonly string[]).includes(kind));
    if (readerOnly.length > 0) {
      console.log(`[graph-contract] reader-only edge kinds (engine never writes): ${readerOnly.join(", ")}`);
    }
  });

  it("reasoner runtime output stays inside the schema kind sets", async () => {
    const { armed, watching } = await writerDeltas();
    const emittedNodeKinds = new Set<string>();
    const emittedEdgeKinds = new Set<string>();
    for (const delta of [armed, watching]) {
      for (const node of delta.nodes) emittedNodeKinds.add(node.kind);
      for (const edge of delta.edges) emittedEdgeKinds.add(edge.kind);
    }

    for (const kind of emittedNodeKinds) {
      assert.ok(
        (GRAPH_NODE_KINDS as readonly string[]).includes(kind),
        `Reasoner emitted node kind "${kind}" that the upsert gate / schema CHECK would reject`,
      );
    }
    for (const kind of emittedEdgeKinds) {
      assert.ok(
        (GRAPH_EDGE_KINDS as readonly string[]).includes(kind),
        `Reasoner emitted edge kind "${kind}" that the upsert gate / schema CHECK would reject`,
      );
    }

    // The fixture exercises the core canvas grammar; if these disappear the
    // contract below is asserting against the wrong delta shape.
    for (const kind of ["ghost", "pattern", "episode", "meeting"]) {
      assert.ok(emittedNodeKinds.has(kind), `fixture delta no longer emits a "${kind}" node`);
    }
    for (const kind of ["manifested", "suggests", "evidence_for", "relates_to"]) {
      assert.ok(emittedEdgeKinds.has(kind), `fixture delta no longer emits a "${kind}" edge`);
    }

    const neverEmitted = (GRAPH_NODE_KINDS as readonly string[])
      .filter((kind) => !emittedNodeKinds.has(kind));
    if (neverEmitted.length > 0) {
      console.log(`[graph-contract] schema node kinds this reasoner fixture never emits: ${neverEmitted.join(", ")}`);
    }
  });

  it("ghost nodes carry every props_json key the Swift reader renders", async () => {
    const { armed, watching } = await writerDeltas();

    for (const [variant, props, extraKeys] of [
      ["armed root", rootProps(armed), GHOST_ARMED_PROPS as readonly string[]],
      ["watching root", rootProps(watching), GHOST_WATCHING_PROPS as readonly string[]],
    ] as const) {
      for (const key of [...GHOST_CORE_PROPS, ...extraKeys]) {
        assert.ok(
          key in props,
          `${variant} ghost props_json is missing "${key}" — KnowledgeGraph.swift reads it (see citations in graph-contract.test.ts)`,
        );
      }

      // Nested shape the reader digs into (KnowledgeGraph.swift ~L470, ~L715):
      const brief = props.brief as Record<string, unknown>;
      assert.ok(
        typeof brief?.cause === "string" && brief.cause.trim().length > 0,
        `${variant} ghost brief.cause missing/empty — reader uses it for the ghost headline and title defense`,
      );
      const suggestedBlock = brief.suggested_block as Record<string, unknown>;
      assert.ok(
        typeof suggestedBlock?.title === "string" && suggestedBlock.title.trim().length > 0,
        `${variant} ghost brief.suggested_block.title missing/empty — reader uses it for WeeklyInsight.suggestedAction`,
      );

      // Status values must stay inside the reader's known lifecycle words.
      assert.ok(
        typeof props.status === "string",
        `${variant} ghost props_json.status must be a string`,
      );
    }

    assert.strictEqual(rootProps(watching).status, "watching");
    assert.strictEqual(rootProps(armed).status, "suggested");
  });

  it("Swift reader still reads the ghost props this contract asserts", (t) => {
    if (!existsSync(KNOWLEDGE_GRAPH_SWIFT)) return t.skip(READER_MISSING);

    const swift = readSource(KNOWLEDGE_GRAPH_SWIFT);
    const assertedKeys = [
      ...GHOST_CORE_PROPS,
      ...GHOST_ARMED_PROPS,
      ...GHOST_WATCHING_PROPS,
      "cause",           // brief?["cause"]
      "suggested_block", // (brief?["suggested_block"] as? [String: Any])?["title"]
    ];
    for (const key of assertedKeys) {
      assert.ok(
        swift.includes(`["${key}"]`),
        `KnowledgeGraph.swift no longer subscripts props key "${key}" — the reader contract drifted; ` +
        "update the GHOST_*_PROPS lists in graph-contract.test.ts to match what the reader actually renders",
      );
    }
  });

  it("detonate lifecycle: status + artifact_ref stay aligned across writer and reader", (t) => {
    if (!existsSync(GRAPH_STORE_SWIFT) || !existsSync(DETONATOR_STATE_SWIFT) || !existsSync(KNOWLEDGE_GRAPH_SWIFT)) {
      return t.skip(READER_MISSING);
    }

    // Writer: upsert.ts arms the root and disarms competing ghosts.
    const upsertSource = readSource(join(REPO_ROOT, "src", "engine", "upsert.ts"));
    assert.match(
      upsertSource,
      /status:\s*"armed"/,
      "upsert.ts mergeRootProps no longer sets status \"armed\" — detonator arming contract moved",
    );
    assert.match(
      upsertSource,
      /'\$\.status',\s*'suggested'/,
      "upsert.ts disarmOtherGhostsSql no longer resets losers to 'suggested' — update the contract",
    );

    // Writer: tools.ts daobrew_detonate_done closes the loop with done + artifact_ref.
    const toolsSource = readSource(join(REPO_ROOT, "src", "tools.ts"));
    assert.match(
      toolsSource,
      /'\$\.status',\s*'done',\s*'\$\.artifact_ref'/,
      "src/tools.ts daobrew_detonate_done no longer writes $.status='done' + $.artifact_ref (sqlite path)",
    );
    assert.match(
      toolsSource,
      /'status',\s*'done',\s*'artifact_ref'/,
      "src/tools.ts daobrew_detonate_done no longer writes status/artifact_ref (postgres jsonb path)",
    );

    // Reader: SentinelGraphStore.readStatusAndArtifact pulls exactly those keys (~L81).
    const storeSource = readSource(GRAPH_STORE_SWIFT);
    assert.match(
      storeSource,
      /json_extract\(props_json,\s*'\$\.status'\)/,
      "SentinelGraphStore.swift no longer reads $.status — reader source moved; update the extraction regex",
    );
    assert.match(
      storeSource,
      /'\$\.artifact_ref'/,
      "SentinelGraphStore.swift no longer reads $.artifact_ref — reader source moved; update the extraction regex",
    );

    // Reader: DetonatorState renders from the same two keys (~L448).
    const detonatorSource = readSource(DETONATOR_STATE_SWIFT);
    assert.ok(
      detonatorSource.includes('["artifact_ref"]') && detonatorSource.includes('["status"]'),
      "DetonatorState.swift no longer reads props status/artifact_ref — reader contract drifted",
    );

    // Reader: every status the engine can persist is a status word the reader
    // knows (KnowledgeGraph.swift ghostDisplayTitle statusWords, ~L463).
    const kgSource = readSource(KNOWLEDGE_GRAPH_SWIFT);
    const statusWordsMatch = kgSource.match(/statusWords:\s*Set<String>\s*=\s*\[([^\]]+)\]/);
    assert.ok(
      statusWordsMatch,
      "KnowledgeGraph.swift statusWords set not found — reader source moved; update the extraction regex",
    );
    const readerStatusWords = [...statusWordsMatch[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    for (const status of ENGINE_GHOST_STATUSES) {
      assert.ok(
        readerStatusWords.includes(status),
        `engine can persist ghost status "${status}" but KnowledgeGraph.swift statusWords does not know it`,
      );
    }
  });
});
