#!/usr/bin/env node
import { DaoBrewClient } from "../client.js";
import {
  readClientConfigFile,
  resolveCredentialBoundClientConfig,
} from "../enrollment.js";
import { resolveUserId } from "../identity.js";
import { graphStoreKind, GraphStoreKind } from "../graph-db.js";
import { GeminiEmbeddingProvider } from "./embeddings/gemini.js";
import { BiometricSource, readBiometricSignalsPreferDirect } from "./signals/biometricsDb.js";
import type { BiometricsClient } from "./signals/biometrics.js";
import { buildCorpusAxes } from "./reasoner/corpusAxes.js";
import { buildV2Context } from "./reasoner/v2Context.js";
import { RawSample } from "./signals/patterns.js";
import { readCalendarSignals } from "./signals/calendar.js";
import { readGranolaSignals } from "./signals/granola.js";
import { readMemorySignals } from "./signals/memory.js";
import { logInterventionAssignment } from "./assignments.js";
import { readCausalMemory } from "./memory/reader.js";
import { GeminiTextProvider, TextGenerationProvider } from "./memory/llm.js";
import { LocalFileConfig, localConfigPath, resolveGeminiApiKey } from "./local-config.js";
import { buildProposerCorpusSample, ProposedTheme, proposeThemes } from "./reasoner/proposer.js";
import {
  attachSemanticContext,
  retrieveSemanticMemoryEvidence,
  retrieveSemanticNeighbors,
} from "./retrieval/semantic.js";
import { recordCoverageObservations, recordHeldTriggerObservation, recordSkippedDoneObservation } from "./memory/verify.js";
import { attachTransferCandidates } from "./transfer/context.js";
import { scopedExec, scopedQuery } from "./user-scope.js";
import { Reasoner, NotEnoughSignalError } from "./reasoner/Reasoner.js";
import { ReasoningInput } from "./reasoner/types.js";
import type { MetricBaseline } from "./reasoner/biometric-endorsement.js";
import { buildTripletContextAnchors, joinTriplets, TripletInput } from "./triplet.js";
import { upsertGraphDelta } from "./upsert.js";

export interface EngineRunOptions {
  once?: boolean;
  watch?: boolean;
  dryRun?: boolean;
  demo?: boolean;
  userId?: string;
  /** @deprecated Accepted for internal compatibility but never sent as backend identity. */
  deviceId?: string;
  /** Server-generated opaque generation for the token-gated production run. */
  generationId?: string;
  /** Exact backend lease authorizing that production generation commit. */
  leaseToken?: string;
  startTs?: number;
  endTs?: number;
  asOfTs?: number;
  memoryMode?: "as-of" | "through-now";
  biometricRange?: string;
  client?: BiometricsClient;
  stateChunkDays?: number;
  intervalSec?: number;
  maxRuns?: number;
  /** Test seam (pipeline completeness): injected query-embedding function for
   *  the semantic retrieval path; default resolves the Gemini provider. */
  semanticEmbedText?: (text: string) => Promise<number[]>;
  semanticEmbedTexts?: (texts: string[]) => Promise<number[][]>;
  /** Test seam (pipeline completeness): injected LLM for the theme proposer;
   *  default resolves GeminiTextProvider when a Gemini key is present. */
  proposerLlm?: TextGenerationProvider;
}

export interface EngineRunResult {
  status: "dry_run" | "written" | "skipped_done" | "no_signal";
  user_id: string;
  /** Echoed only after the graph delta and this marker co-commit. */
  generation_id?: string;
  demo: boolean;
  dry_run: boolean;
  triplet_count: number;
  node_count: number;
  edge_count: number;
  armed_node_id?: string;
  root_armed: boolean;
  /** Which graph store this run resolved to (same resolution graph-db.ts
   *  uses). Present on EVERY result — including no_signal — so the
   *  split-store trap ("write Postgres, read empty SQLite") is visible. */
  graph_store: GraphStoreKind;
  /** Per-source row counts collected this run. Present on EVERY result —
   *  all four result paths (dry_run, written/skipped_done, and both
   *  no_signal paths) build it before returning, so it is non-optional. */
  signal_counts: {
    calendar: number;
    granola: number;
    memory: number;
    biometric_episodes: number;
    /** Which source served the biometrics this run: "neon-direct" (warm-tier
     *  Postgres read by user_id), "api" (backend HTTP path), or "none"
     *  (demo input, or no source could serve — warnings say why). */
    biometric_source: BiometricSource;
  };
  /** Corpus enrichment axes derived live for the 7th gate. Present on
   *  reasoned runs (dry_run/written) ONLY when the v2 preview context
   *  activated (raw samples were present): 0 then means "v2 ran, no axes".
   *  Omitted when v2 never activated and on no_signal paths, so 0 is
   *  never ambiguous with "v2 never ran". */
  enrichment_axes_count?: number;
  /** LLM proposer observability (pipeline completeness stage 2). Present
   *  ONLY when the proposer actually attempted (window/replay run with a
   *  Gemini key or injected seam): the count of lint-surviving proposed
   *  themes. Omitted otherwise, so 0 always means "proposer ran, nothing
   *  survived", never "proposer never ran". */
  proposed_theme_count?: number;
  /** Of the enrichment axes above, how many were minted by llm_proposed
   *  themes. Present only when BOTH v2 activated and the proposer attempted
   *  (same non-ambiguity rule as enrichment_axes_count). */
  llm_proposed_axes_count?: number;
  warnings: string[];
}

/** Fixed canonical scope for implicit `--demo` identity.
 *
 *  This MUST be a compile-time constant, not a per-process value. The graph
 *  node id derivation (Reasoner.nodeId -> stableHash) is a pure function of
 *  (userId, kind, sourceRef), and the upsert is INSERT ... ON CONFLICT(id).
 *  A per-process user id therefore made every `--demo` run write a fresh,
 *  disjoint graph — the conflict clause could never fire — and put the
 *  previous run's armed ghost outside the `WHERE user_id = ...` disarm sweep
 *  in upsert.ts. Both the idempotency and stale-armed-root contracts in
 *  tests/run.test.ts depend on this staying constant across processes.
 *
 *  Deliberately NOT the founder's canonical id: demo writes must never land
 *  in a real user's scope (tests/run.test.ts asserts this explicitly). */
const IMPLICIT_DEMO_SCOPE = "9741C74A-9070-475C-A364-2D54C9279E95";

function readConfig(): LocalFileConfig {
  return readClientConfigFile(localConfigPath()) as LocalFileConfig;
}

function engineIdentityPlan(config: LocalFileConfig, options: EngineRunOptions) {
  if (options.demo && options.userId === undefined) return { ok: true as const, userId: IMPLICIT_DEMO_SCOPE };
  return resolveUserId(config, options.userId);
}

function requireRunUserId(options: EngineRunOptions): string {
  const plan = engineIdentityPlan(readConfig(), options);
  if (!plan.ok) throw new Error(plan.reason);
  return plan.userId;
}

/** RLS seam wiring (deferred wiring 1/3): GUC-scoped executors for the
 *  user-scoped graph reads/writes on the run path. Postgres-gated — the same
 *  spread-conditional idiom as the internal-server's layer2ScopedDeps —
 *  because set_config is invalid SQLite and scoping must never change SQLite
 *  behavior (SQLite runs keep composing byte-identical SQL). */
function graphScopedDeps(userId: string): { exec?: (sql: string) => Promise<void>; query?: (sql: string) => Promise<Record<string, any>[]> } {
  if (graphStoreKind() !== "postgres") return {};
  return { exec: scopedExec(userId), query: scopedQuery(userId) };
}

/** Window lengths for the healthkit-history range strings the fetch sends
 *  (collectSignals: options.biometricRange ?? "week"). The backend resolves
 *  the range relative to "now" server-side; this mirrors that client-side
 *  for the staleness diagnostics. Unknown ranges fall back to week. */
const RANGE_WINDOW_SEC: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400,
};

function pushUniqueWarnings(sink: string[], items: string[]): void {
  for (const item of items) {
    if (!sink.includes(item)) sink.push(item);
  }
}

/** GeminiTextProvider gated on key presence — null (proposer skipped) when
 *  no Gemini key resolves, mirroring resolveTransferProvider. */
function resolveProposerLlm(): TextGenerationProvider | null {
  if (!resolveGeminiApiKey()) return null;
  try {
    return new GeminiTextProvider();
  } catch {
    return null;
  }
}

function resolveSemanticEmbedTexts(): ((texts: string[]) => Promise<number[][]>) | null {
  if (!resolveGeminiApiKey()) return null;
  try {
    const provider = new GeminiEmbeddingProvider();
    return async (texts: string[]) => provider.embed(texts);
  } catch {
    return null;
  }
}

async function embedSemanticQueries(
  queryTexts: string[],
  options: EngineRunOptions,
): Promise<Map<string, number[]>> {
  const uniqueTexts = [...new Set(queryTexts.map((text) => text.trim()).filter(Boolean))];
  if (uniqueTexts.length === 0) return new Map();

  if (options.semanticEmbedTexts) {
    const vectors = await options.semanticEmbedTexts(uniqueTexts);
    if (vectors.length !== uniqueTexts.length) {
      throw new Error(`semantic retrieval degraded: embed batch returned ${vectors.length} vectors for ${uniqueTexts.length} queries`);
    }
    return new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
  }

  if (options.semanticEmbedText) {
    const vectors = await Promise.all(uniqueTexts.map((text) => options.semanticEmbedText!(text)));
    return new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
  }

  const batched = resolveSemanticEmbedTexts();
  if (batched) {
    const vectors = await batched(uniqueTexts);
    if (vectors.length !== uniqueTexts.length) {
      throw new Error(`semantic retrieval degraded: embed batch returned ${vectors.length} vectors for ${uniqueTexts.length} queries`);
    }
    return new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
  }

  throw new Error("semantic retrieval degraded: no Gemini key to embed the query (GEMINI_API_KEY / GOOGLE_API_KEY / gemini_api_key)");
}

function mergeSemanticMemoryPool(
  base: TripletInput["memory"],
  extras: TripletInput["memory"],
): TripletInput["memory"] {
  const merged = [...base];
  const seen = new Set(base.map((memory) => memory.id));
  for (const memory of extras) {
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    merged.push(memory);
  }
  return merged;
}

async function collectSemanticMemoryEvidence(
  input: TripletInput,
  options: EngineRunOptions,
  userId: string,
  memoryEndTs: number | undefined,
): Promise<{
  memory: TripletInput["memory"];
  scoresByAnchorRef?: Map<string, Map<string, number>>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const anchors = buildTripletContextAnchors(input);
  const anchorsWithQuery = anchors.filter((anchor) => anchor.queryText);
  if (anchorsWithQuery.length === 0) {
    return { memory: input.memory, warnings };
  }
  if (graphStoreKind() !== "postgres") {
    warnings.push("semantic retrieval degraded: graph store is not postgres (Layer-1 embeddings are warm-tier only)");
    return { memory: input.memory, warnings };
  }

  try {
    const embeddingsByQuery = await embedSemanticQueries(
      anchorsWithQuery.map((anchor) => anchor.queryText),
      options,
    );
    const query = scopedQuery(userId);
    const retrievalCache = new Map<string, Awaited<ReturnType<typeof retrieveSemanticMemoryEvidence>>>();
    for (const queryText of embeddingsByQuery.keys()) {
      retrievalCache.set(queryText, await retrieveSemanticMemoryEvidence({
        userId,
        queryEmbedding: embeddingsByQuery.get(queryText),
        query,
        nowTs: () => options.asOfTs ?? options.endTs ?? Math.floor(Date.now() / 1000),
        endTs: memoryEndTs,
        warnings,
      }));
    }

    if (warnings.length > 0) {
      return { memory: input.memory, warnings };
    }

    const extras: TripletInput["memory"] = [];
    const scoresByAnchorRef = new Map<string, Map<string, number>>();
    for (const anchor of anchorsWithQuery) {
      const matches = retrievalCache.get(anchor.queryText) ?? [];
      scoresByAnchorRef.set(
        anchor.state.graph_source_ref,
        new Map(matches.map((match) => [match.memory.id, match.semanticScore])),
      );
      extras.push(...matches.map((match) => match.memory));
    }

    return {
      memory: mergeSemanticMemoryPool(input.memory, extras),
      scoresByAnchorRef,
      warnings,
    };
  } catch (err: any) {
    warnings.push(String(err?.message ?? err));
    return { memory: input.memory, warnings };
  }
}

/** Deterministic query text for the proposer's neighbor retrieval: top memory
 *  topics + insight snippets + recent meeting titles, bounded. */
function proposerQueryText(input: TripletInput): string {
  const parts = [
    ...input.memory.slice(0, 5).flatMap((m) => [...m.topics, m.insight_text.slice(0, 120)]),
    ...input.granola.slice(0, 5).map((g) => g.title),
  ];
  return parts.join(" ").trim().slice(0, 600);
}

function demoInput(userId: string): TripletInput {
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
      summary: "Demo flow review",
      body: "We still need to pick one wedge for the demo story and close the read to detonate to verify proof loop.",
      transcript_spans: [{
        idx: 0,
        speaker: "Neo",
        ts_offset_sec: 120,
        text: "We still need to pick one wedge for the demo story and close the read to detonate to verify proof loop.",
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
      insight_text: "Project memory says Neo keeps circling the one wedge demo proof loop and needs the real handoff path plus a reviewable evidence trail.",
      topics: ["#one-wedge", "#demo-readiness", "#detonator"],
      importance: 0.9,
      strength: 0.8,
      occurred_at_ts: null,
      last_accessed_ts: null,
      created_at_ts: 902,
    }],
  };
}

async function collectSignals(
  options: EngineRunOptions,
  userId: string,
  warnings: string[],
): Promise<{ input: TripletInput; biometricSource: BiometricSource; baselines?: MetricBaseline[] }> {
  if (options.demo) return { input: demoInput(userId), biometricSource: "none" };

  let client = options.client;
  if (!client) {
    const config = readConfig();
    const authenticatedConfig = resolveCredentialBoundClientConfig(config, {
      deviceCredential: process.env.DAOBREW_DEVICE_CREDENTIAL,
      apiUrl: process.env.DAOBREW_API_URL,
    });
    const deviceCredential = authenticatedConfig.deviceCredential;
    const apiBaseUrl = authenticatedConfig.apiUrl;
    client = deviceCredential && apiBaseUrl
      ? new DaoBrewClient({ deviceCredential, baseUrl: apiBaseUrl })
      : undefined;
  }
  const replay = options.startTs !== undefined || options.endTs !== undefined;
  const memoryEndTs = options.memoryMode === "as-of" ? (options.asOfTs ?? options.endTs) : undefined;
  // Biometrics: Postgres stores read intraday_state/health_samples straight
  // from the warm tier by user_id (all data syncs to the database — the
  // backend HTTP path's windowing/identity quirks starved the reasoner);
  // any direct-path failure or SQLite store falls back to the HTTP client.
  // No device credential is required when a server-side direct read serves.
  const { signals: biometrics, source: biometricSource } = await readBiometricSignalsPreferDirect({
    userId,
    client,
    range: options.biometricRange ?? "week",
    stateLimit: replay ? 100 : 24,
    startTs: options.startTs,
    endTs: options.endTs,
    stateChunkDays: replay ? (options.stateChunkDays ?? 7) : undefined,
  }, warnings);

  // RLS seam wiring (deferred wiring 1/3): the three corpus readers hit
  // user-scoped Layer-1 tables (events/meeting_notes/user_insights), so under
  // Postgres they read through a GUC-scoped query. SQLite runs get an empty
  // spread and compose byte-identical SQL.
  // Memory is startTs-bounded on replay runs (bootstrap windows must bound
  // it), while its endTs stays as-of-only — live runs deliberately read
  // memory through "now".
  const scopedRead = graphStoreKind() === "postgres" ? { query: scopedQuery(userId) } : {};
  const [calendar, granola, memory] = await Promise.all([
    readCalendarSignals({ userId, startTs: options.startTs, endTs: options.endTs, limit: replay ? 500 : 100, ...scopedRead }),
    readGranolaSignals({ userId, startTs: options.startTs, endTs: options.endTs, limit: replay ? 500 : 50, ...scopedRead }),
    readMemorySignals({ userId, startTs: options.startTs, endTs: memoryEndTs, limit: replay ? 500 : 50, ...scopedRead }),
  ]);

  // baselines rides alongside input (not inside TripletInput, whose biometrics
  // field is the shared BiometricsSignals type without baselines) so the
  // reasoner can feed each episode's biometric_summary / pattern_endorsements.
  return { input: { biometrics, calendar, granola, memory }, biometricSource, baselines: biometrics.baselines };
}

export async function runEngineOnce(options: EngineRunOptions = {}): Promise<EngineRunResult> {
  const userId = requireRunUserId(options);
  const generationId = options.generationId?.trim() ?? "";
  const leaseToken = options.leaseToken?.trim() ?? "";
  if (Boolean(generationId) !== Boolean(leaseToken)) {
    throw new Error("generationId and leaseToken must be supplied together");
  }
  const graphStore = graphStoreKind();
  if (generationId && (options.dryRun || graphStore !== "postgres")) {
    throw new Error("generation lease commits require a non-dry Postgres run");
  }
  const generationLease = generationId
    ? { generationId, leaseToken }
    : {};
  // Arm-time offer_state must be part of the same graph transaction as a
  // production generation. SQLite stays byte-identical and has no MRT table.
  const armedOffer = graphStore === "postgres" ? { armedOffer: {} } : {};
  const warnings: string[] = [];
  const { input, biometricSource, baselines } = await collectSignals(options, userId, warnings);
  const memoryEndTs = options.memoryMode === "as-of" ? (options.asOfTs ?? options.endTs) : undefined;
  const semanticMemory = options.demo
    ? { memory: input.memory, warnings: [] as string[], scoresByAnchorRef: undefined as Map<string, Map<string, number>> | undefined }
    : await collectSemanticMemoryEvidence(input, options, userId, memoryEndTs);
  pushUniqueWarnings(warnings, semanticMemory.warnings);
  const triplets = joinTriplets(
    { ...input, memory: semanticMemory.memory },
    {
      userId,
      ...(semanticMemory.scoresByAnchorRef ? { semanticMemoryScoresByAnchorRef: semanticMemory.scoresByAnchorRef } : {}),
    },
  );
  const reasoner = new Reasoner();
  const generatedAtTs = options.asOfTs ?? options.endTs ?? Math.floor(Date.now() / 1000);

  const signalCounts = {
    calendar: input.calendar.length,
    granola: input.granola.length,
    memory: input.memory.length,
    biometric_episodes: input.biometrics.states.length,
    biometric_source: biometricSource,
  };
  const corpusRowCount = signalCounts.calendar + signalCounts.granola + signalCounts.memory;
  // Two silent failure modes become loud warnings here. They are mutually
  // exclusive by construction: (a) requires an EMPTY corpus, (b) a NON-empty
  // one — so a run can never carry both.
  if (graphStore === "sqlite" && corpusRowCount === 0) {
    // (a) Split-store trap: warm-tier ingest writes Postgres-only, so a
    // reader defaulting to SQLite silently sees an empty corpus.
    warnings.push(
      "graph store is sqlite but warm-tier ingest writes Postgres-only — if you expected memory/meetings, set DAOBREW_GRAPH_STORE=postgres (same DAOBREW_POSTGRES_DB as the ingest process)",
    );
  } else if (corpusRowCount > 0 && signalCounts.biometric_episodes > 0) {
    // (b) Temporal-overlap trap: corpus rows exist but none joined into any
    // triplet (joinTriplets emits one triplet per biometric state, so with
    // episodes present the tell is "every triplet's corpus lists are empty",
    // not triplet_count === 0). Computed from arrays already in scope.
    const joinedCorpusRows = triplets.reduce(
      (sum, triplet) => sum + triplet.events.length + triplet.meetings.length + triplet.memories.length,
      0,
    );
    if (joinedCorpusRows === 0) {
      warnings.push(
        `${corpusRowCount} corpus rows collected but all are outside the biometric window (calendar joins ±24h, memory 14d) — corpus timestamps miss every biometric state bucket; check source freshness`,
      );
    }
  }

  // Raw-sample staleness (G1 masking): ScheduledRefreshJob keeps minting
  // fresh state episodes twice daily even when the watch→backend raw-sample
  // push dies (it did on 2026-06-23), so a run can look healthy while v2
  // silently never activates. Built here — before the no_signal early
  // return — so every result path carries these warnings. Demo runs skip
  // the check: demo input is synthetic and never fetched against a
  // biometric window. The two warnings are mutually exclusive by
  // construction (rawSamples non-empty vs empty).
  const rawSamples: RawSample[] = input.biometrics.metrics.flatMap((series) =>
    series.samples.map((sample) => ({
      metric: series.metric,
      value: sample.value,
      timestamp: sample.timestamp,
    })),
  );
  if (!options.demo) {
    if (rawSamples.length > 0) {
      // NOTE: the raw-sample fetch ignores startTs/endTs — the backend
      // always resolves `range` relative to server now (only state history
      // is ts-bounded; see biometrics.ts getHealthkitHistory). So on replay
      // runs (startTs/endTs set) this diagnostic window diverges from the
      // actually-fetched one and the stale warning can flag live-week
      // samples against a replay window. Accepted: replays are diagnostic
      // runs; this check targets live scheduled runs.
      const windowEndTs = options.endTs ?? Math.floor(Date.now() / 1000);
      const range = options.biometricRange ?? "week";
      const windowStartTs = options.startTs ?? windowEndTs - (RANGE_WINDOW_SEC[range] ?? RANGE_WINDOW_SEC.week);
      // reduce, not Math.max(...spread): a year of fine-grained samples can
      // exceed the spread-arg limit and throw RangeError.
      const newestSampleTs = rawSamples.reduce((max, sample) => {
        const ts = Date.parse(sample.timestamp) / 1000;
        return Number.isFinite(ts) && ts > max ? ts : max;
      }, Number.NEGATIVE_INFINITY);
      if (Number.isFinite(newestSampleTs) && newestSampleTs < windowStartTs) {
        warnings.push(
          `raw samples stale: newest ${new Date(newestSampleTs * 1000).toISOString()} predates the biometric window — watch push may be down`,
        );
      }
    } else if (signalCounts.biometric_episodes > 0) {
      warnings.push(
        "no raw samples in window but state episodes exist — raw push pipeline may be down (states are refresh-job generated)",
      );
    }
  }

  // Layer 2 causal memory (Postgres-only tables): read the claim-gated
  // active threads + latest user-model snapshot for this run. CONTEXT ONLY —
  // the reasoner attaches it to the armed root's props_json.memory_context
  // and it MUST NOT influence scoring/claims/arming (see reasoner types.ts).
  // Any read failure degrades to "no memory context" with a loud warning;
  // it never fails the run. SQLite runs skip the read entirely.
  let memoryContext: ReasoningInput["memoryContext"];
  if (graphStore === "postgres") {
    try {
      // Read cap matches the root-node attachment cap in the Reasoner (5).
      // Scoped: reads user-scoped Layer-2 tables (threads/snapshots) — needs
      // the RLS GUC once the connection runs as the app role.
      const memoryRead = await readCausalMemory({ userId, limit: 5, query: scopedQuery(userId) });
      if (memoryRead.threads.length > 0) {
        memoryContext = {
          threads: memoryRead.threads,
          snapshotId: memoryRead.snapshot?.id ?? null,
          snapshotFresh: memoryRead.snapshot_fresh,
        };
      }
    } catch (err: any) {
      warnings.push(`layer 2 memory read failed; continuing without memory context: ${err?.message ?? String(err)}`);
    }
  }

  // Pipeline completeness stage 2 (LLM proposer): window/replay runs ONLY —
  // the bootstrap engine call always sets startTs/endTs, so "once per
  // bootstrap" rides this hook. Gated on Gemini key presence (or the injected
  // test seam); ANY failure degrades to zero proposals and the run proceeds.
  // Proposals feed buildCorpusAxes below tagged origin='llm_proposed' and
  // pass the IDENTICAL literal whole-word matching + enrichment/7-gate chain
  // as memory topics — LLM text never becomes evidence or citations. Runs
  // before the no_signal early return so the stage is alive (and its counts
  // observable) even on quiet replay windows.
  let proposedThemes: ProposedTheme[] = [];
  let proposerAttempted = false;
  const windowRun = options.startTs !== undefined || options.endTs !== undefined;
  if (!options.demo && windowRun) {
    const proposerLlm = options.proposerLlm ?? resolveProposerLlm();
    if (!proposerLlm) {
      warnings.push("theme proposer skipped: no Gemini key — zero proposals this run");
    } else {
      proposerAttempted = true;
      try {
        // Semantic neighbors are candidate material for the proposer; their
        // degradation warnings are deduped against the post-delta
        // semantic_context attach so a degraded path warns once, not twice.
        const semanticWarnings: string[] = [];
        const neighbors = await retrieveSemanticNeighbors({
          userId,
          queryText: proposerQueryText(input),
          warnings: semanticWarnings,
          embedText: options.semanticEmbedText,
          ...(graphStore === "postgres" ? { query: scopedQuery(userId) } : {}),
        });
        pushUniqueWarnings(warnings, semanticWarnings);
        const proposal = await proposeThemes({
          userId,
          corpusSample: buildProposerCorpusSample({ insights: input.memory, meetings: input.granola, neighbors }),
          existingThemes: input.memory.flatMap((m) => m.topics),
          llm: proposerLlm,
        });
        warnings.push(...proposal.warnings);
        proposedThemes = proposal.themes;
      } catch (err: any) {
        warnings.push(`theme proposer failed; zero proposals this run: ${err?.message ?? err}`);
      }
    }
  }

  async function noSignalResult(reason: string): Promise<EngineRunResult> {
    warnings.push(reason);
    const delta = await reasoner.buildWatchingDelta({ user_id: userId, triplets, generated_at_ts: generatedAtTs }, reason);
    if (!options.dryRun) {
      // G5 coverage (D2): a quiet run is evidence that done threads did not
      // re-fire today. Recorded BEFORE the watching upsert — a watching
      // write replaces ghost props wholesale (mergeGhostProps) and would
      // erase status='done' before the done-thread query could see it.
      // Postgres-only and fail-soft; dry runs never reach this branch.
      if (graphStore === "postgres") {
        try {
          // RLS seam wiring (phase 1): verify writes/reads are per-user, so
          // run them on GUC-scoped executors (see user-scope.ts).
          await recordCoverageObservations({ userId, exec: scopedExec(userId), query: scopedQuery(userId) });
        } catch (err: any) {
          warnings.push(`coverage observation write failed: ${err?.message ?? err}`);
        }
      }
      // RLS seam wiring (deferred wiring 1/3): the watching upsert writes and
      // re-reads the user's graph rows — scoped executors under Postgres,
      // empty spread (byte-identical SQL) under SQLite.
      await upsertGraphDelta(delta, {
        userId,
        ...generationLease,
        ...armedOffer,
        ...graphScopedDeps(userId),
      });
    }
    return {
      status: "no_signal",
      user_id: userId,
      generation_id: generationId || undefined,
      demo: !!options.demo,
      dry_run: !!options.dryRun,
      triplet_count: triplets.length,
      node_count: delta.nodes.length,
      edge_count: delta.edges.length,
      armed_node_id: delta.armed_root_cause.node_id,
      root_armed: false,
      graph_store: graphStore,
      signal_counts: signalCounts,
      proposed_theme_count: proposerAttempted ? proposedThemes.length : undefined,
      warnings,
    };
  }

  if (triplets.length === 0) {
    return noSignalResult("Watching: no stress moments were available to evaluate");
  }

  // v2 context: whenever the run holds raw samples (built above with the
  // staleness diagnostics), the reasoner swaps to the raw signature layer
  // + coverage capping.
  // Derive corpus enrichment axes live (handoff debt #1). Signature/coverage
  // still activate without axes; axes only add the 7th-gate input.
  const preview = buildV2Context(rawSamples);
  // Third staleness diagnostic (debug-proven blind spot): samples arrived and
  // are fresh (warning A stayed quiet) yet none of them clear the wear bar,
  // so v2 silently never activates. Mutually compatible with A/B by
  // construction: B needs zero samples, A needs stale ones.
  if (!options.demo && rawSamples.length > 0 && !preview) {
    warnings.push(
      "raw samples present but no worn days (>=3 heart_rate samples/local day required) — v2 inactive",
    );
  }
  const enrichmentAxes = preview
    ? buildCorpusAxes({
        signatures: preview.signaturesByDate,
        insights: input.memory,
        meetings: input.granola,
        calendarEvents: input.calendar,
        timezoneOffsetHours: preview.timezoneOffsetHours,
        // llm_proposed candidates join the same literal matching + gate
        // chain as memory topics (empty on live runs / proposer degradation).
        proposedThemes,
      })
    : [];
  // Observability for the proposer's surviving axes: only meaningful when
  // both v2 activated and the proposer attempted (0 stays unambiguous).
  const llmProposedAxesCount = preview && proposerAttempted
    ? enrichmentAxes.filter((axis) => axis.origin === "llm_proposed").length
    : undefined;
  // enrichmentAxes is the only field that differs from the preview context,
  // so spread instead of a second (deterministic but redundant) rebuild.
  const v2 = preview ? { ...preview, enrichmentAxes } : null;

  try {
    const delta = await reasoner.buildDelta({ user_id: userId, triplets, generated_at_ts: generatedAtTs, v2: v2 ?? undefined, memoryContext, baselines });
    if (options.dryRun) {
      return {
        status: "dry_run",
        user_id: userId,
        demo: !!options.demo,
        dry_run: true,
        triplet_count: triplets.length,
        node_count: delta.nodes.length,
        edge_count: delta.edges.length,
        armed_node_id: delta.armed_root_cause.node_id,
        root_armed: false,
        graph_store: graphStore,
        signal_counts: signalCounts,
        enrichment_axes_count: preview ? enrichmentAxes.length : undefined,
        proposed_theme_count: proposerAttempted ? proposedThemes.length : undefined,
        llm_proposed_axes_count: llmProposedAxesCount,
        warnings,
      };
    }

    // 5B transfer (D7): attach anonymized what-worked candidates to the armed
    // root AFTER buildDelta and BEFORE the upsert — the reasoner never sees
    // them, so scoring/arming influence is impossible by construction.
    // Postgres-only (transfer_records is warm-tier) and fail-soft; dry runs
    // returned above, so their deltas stay byte-identical.
    if (graphStore === "postgres") {
      // Pipeline completeness stage 1 (ANN retrieval): semantic neighbors from
      // the user's OWN Layer-1 embeddings, attached to the armed root as
      // props_json.semantic_context. Context only — same "MUST NOT influence"
      // honesty marker as memory_context, and it runs after buildDelta like
      // the transfer attach, so gate/reasoner influence is impossible by
      // construction. Fail-soft: every degradation (no key, zero embedded
      // rows, query failure) surfaces as a run warning, mirroring the
      // staleness warnings, so "alive but empty" is observable.
      try {
        const semantic = await attachSemanticContext({
          delta,
          userId,
          query: scopedQuery(userId),
          embedText: options.semanticEmbedText,
        });
        pushUniqueWarnings(warnings, semantic.warnings);
      } catch (err: any) {
        warnings.push(`semantic context attach failed; continuing without semantic context: ${err?.message ?? err}`);
      }
      try {
        // RLS seam wiring (phase 1): every read on this path is annex-
        // permissive — the ANN search hits transfer_records and the prior
        // fallback hits population_priors, both with explicit USING(true)
        // policies — so the GUC scope is harmless today and keeps the entry
        // point uniformly scoped if the retrieval ever grows a user-scoped
        // read. (The armed-root graph_nodes re-read happens later inside
        // upsertGraphDelta, whose exec/query seam is wired at the call site
        // below.) attachTransferCandidates only exposes a query seam (it
        // performs no writes), so that is all we wire.
        const attached = await attachTransferCandidates({ delta, userId, query: scopedQuery(userId) });
        warnings.push(...attached.warnings);
      } catch (err: any) {
        warnings.push(`transfer retrieval failed; continuing without candidates: ${err?.message ?? err}`);
      }
    }

    // RLS seam wiring (deferred wiring 1/3): the armed upsert writes and
    // re-reads the user's graph rows — scoped executors under Postgres,
    // empty spread (byte-identical SQL) under SQLite.
    const result = await upsertGraphDelta(delta, {
      userId,
      ...generationLease,
      ...armedOffer,
      ...graphScopedDeps(userId),
    });
    // G5 verify loop: a skipped_done result means the done root re-fired and
    // the delta was thrown away — the ONLY moment recurrence is observable.
    // Postgres-only (thread_verifications is a warm-tier table) and
    // fail-soft: an observation write must never fail the run. Dry-run never
    // reaches here (skipped_done only exists on real upserts), so dry runs
    // naturally write nothing.
    if (result.status === "skipped_done" && graphStore === "postgres") {
      try {
        // RLS seam wiring (phase 1): per-user verify write — GUC-scoped.
        await recordSkippedDoneObservation({
          userId,
          ghostId: result.armed_node_id,
          delta,
          exec: scopedExec(userId),
          query: scopedQuery(userId),
        });
      } catch (err: any) {
        warnings.push(`verification observation write failed: ${err?.message ?? err}`);
      }
    } else if (result.status === "written" && !result.root_armed && graphStore === "postgres") {
      // Written-but-unarmed (watching-shaped) results are quiet runs too —
      // mutually exclusive with the skipped_done branch above, so a run
      // never records both a trigger and a coverage observation.
      try {
        // RLS seam wiring (phase 1): per-user verify write — GUC-scoped.
        await recordCoverageObservations({ userId, exec: scopedExec(userId), query: scopedQuery(userId) });
      } catch (err: any) {
        warnings.push(`coverage observation write failed: ${err?.message ?? err}`);
      }
    } else if (result.status === "written" && result.root_armed && graphStore === "postgres") {
      // MRT randomization v1: upsertGraphDelta already drew the deterministic
      // arm and co-committed offer_state + the normal assignment INSERT before
      // the generation receipt/marker. This post-commit INSERT is an idempotent
      // fail-soft retry/observability boundary only; it never mutates graph
      // rows, so one generation always names one exact graph state.
      try {
        const offer = result.armed_offer;
        if (!offer) {
          warnings.push("offer randomization was not included in the graph generation");
        } else {
          const logged = await logInterventionAssignment({
            userId,
            ghostId: result.armed_node_id,
            armedAtTs: offer.armedAtTs,
            ghostProps: offer.ghostProps,
            storeKind: graphStore,
            exec: scopedExec(userId),
            nowTs: Math.floor(Date.now() / 1000),
            assignment: offer.assignment,
          });
          if (logged.warning) warnings.push(logged.warning);
          // Control-arm recurrence: a held root still firing in a LATER week is
          // the counterfactual analog of a done thread re-firing — record it so
          // held episodes can settle pattern_recurred like treated ones.
          if (offer.offerState === "held") {
            try {
              await recordHeldTriggerObservation({
                userId,
                ghostId: result.armed_node_id,
                ghostProps: offer.ghostProps,
                exec: scopedExec(userId),
              });
            } catch (err: any) {
              warnings.push(`held-episode observation write failed: ${err?.message ?? err}`);
            }
          }
        }
      } catch (err: any) {
        warnings.push(`offer randomization failed: ${err?.message ?? err}`);
      }
    }
    return {
      status: result.status,
      user_id: userId,
      generation_id: generationId || undefined,
      demo: !!options.demo,
      dry_run: false,
      triplet_count: triplets.length,
      node_count: delta.nodes.length,
      edge_count: delta.edges.length,
      armed_node_id: result.armed_node_id,
      root_armed: result.root_armed,
      graph_store: graphStore,
      signal_counts: signalCounts,
      enrichment_axes_count: preview ? enrichmentAxes.length : undefined,
      proposed_theme_count: proposerAttempted ? proposedThemes.length : undefined,
      llm_proposed_axes_count: llmProposedAxesCount,
      warnings,
    };
  } catch (err) {
    if (err instanceof NotEnoughSignalError) {
      return noSignalResult(err.message);
    }
    throw err;
  }
}

function parseIsoArg(value: string, name: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${name}: ${value}`);
  return Math.trunc(ms / 1000);
}

function parseArgs(argv: string[]): EngineRunOptions {
  const options: EngineRunOptions = { once: true, intervalSec: 300 };
  for (const arg of argv) {
    if (arg === "--once") options.once = true;
    else if (arg === "--watch") {
      options.watch = true;
      options.once = false;
    } else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--demo") options.demo = true;
    else if (arg.startsWith("--interval-sec=")) options.intervalSec = Number(arg.slice("--interval-sec=".length));
    else if (arg.startsWith("--max-runs=")) options.maxRuns = Number(arg.slice("--max-runs=".length));
    else if (arg.startsWith("--user-id=")) options.userId = arg.slice("--user-id=".length);
    else if (arg.startsWith("--start-iso=")) options.startTs = parseIsoArg(arg.slice("--start-iso=".length), "start ISO");
    else if (arg.startsWith("--end-iso=")) options.endTs = parseIsoArg(arg.slice("--end-iso=".length), "end ISO");
    else if (arg.startsWith("--as-of-iso=")) {
      options.asOfTs = parseIsoArg(arg.slice("--as-of-iso=".length), "as-of ISO");
      options.memoryMode = "as-of";
    } else if (arg.startsWith("--memory-mode=")) {
      const mode = arg.slice("--memory-mode=".length);
      if (mode !== "as-of" && mode !== "through-now") throw new Error("--memory-mode must be as-of or through-now");
      options.memoryMode = mode;
    } else if (arg.startsWith("--biometric-range=")) options.biometricRange = arg.slice("--biometric-range=".length);
    else if (arg.startsWith("--state-chunk-days=")) {
      const value = Number(arg.slice("--state-chunk-days=".length));
      if (!Number.isFinite(value) || value <= 0) throw new Error("--state-chunk-days must be a positive number");
      options.stateChunkDays = value;
    }
    else if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: daobrew-engine [--once|--watch] [--dry-run] [--demo] [--interval-sec=N]",
        "                       [--user-id=UUID]",
        "                       [--start-iso=ISO] [--end-iso=ISO]",
        "                       [--as-of-iso=ISO] [--memory-mode=as-of|through-now]",
        "                       [--biometric-range=week|month|year] [--state-chunk-days=N]",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = readConfig();
  const plan = engineIdentityPlan(config, options);
  if (!plan.ok) {
    console.error(JSON.stringify({ status: "skipped", reason: plan.reason }, null, 2));
    process.exit(2);
  }
  options.userId = plan.userId;

  if (!options.watch) {
    const result = await runEngineOnce(options);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  let runs = 0;
  while (true) {
    runs += 1;
    const result = await runEngineOnce(options);
    console.log(JSON.stringify({ run: runs, ...result }));
    if (options.maxRuns && runs >= options.maxRuns) return;
    await sleep(Math.max(1, options.intervalSec ?? 300) * 1000);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }, null, 2));
    process.exit(1);
  });
}
