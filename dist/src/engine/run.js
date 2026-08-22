#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEngineOnce = runEngineOnce;
const client_js_1 = require("../client.js");
const enrollment_js_1 = require("../enrollment.js");
const identity_js_1 = require("../identity.js");
const graph_db_js_1 = require("../graph-db.js");
const gemini_js_1 = require("./embeddings/gemini.js");
const biometricsDb_js_1 = require("./signals/biometricsDb.js");
const corpusAxes_js_1 = require("./reasoner/corpusAxes.js");
const v2Context_js_1 = require("./reasoner/v2Context.js");
const calendar_js_1 = require("./signals/calendar.js");
const granola_js_1 = require("./signals/granola.js");
const memory_js_1 = require("./signals/memory.js");
const assignments_js_1 = require("./assignments.js");
const reader_js_1 = require("./memory/reader.js");
const llm_js_1 = require("./memory/llm.js");
const local_config_js_1 = require("./local-config.js");
const proposer_js_1 = require("./reasoner/proposer.js");
const semantic_js_1 = require("./retrieval/semantic.js");
const verify_js_1 = require("./memory/verify.js");
const context_js_1 = require("./transfer/context.js");
const user_scope_js_1 = require("./user-scope.js");
const Reasoner_js_1 = require("./reasoner/Reasoner.js");
const triplet_js_1 = require("./triplet.js");
const upsert_js_1 = require("./upsert.js");
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
function readConfig() {
    return (0, enrollment_js_1.readClientConfigFile)((0, local_config_js_1.localConfigPath)());
}
function engineIdentityPlan(config, options) {
    if (options.demo && options.userId === undefined)
        return { ok: true, userId: IMPLICIT_DEMO_SCOPE };
    return (0, identity_js_1.resolveUserId)(config, options.userId);
}
function requireRunUserId(options) {
    const plan = engineIdentityPlan(readConfig(), options);
    if (!plan.ok)
        throw new Error(plan.reason);
    return plan.userId;
}
/** RLS seam wiring (deferred wiring 1/3): GUC-scoped executors for the
 *  user-scoped graph reads/writes on the run path. Postgres-gated — the same
 *  spread-conditional idiom as the internal-server's layer2ScopedDeps —
 *  because set_config is invalid SQLite and scoping must never change SQLite
 *  behavior (SQLite runs keep composing byte-identical SQL). */
function graphScopedDeps(userId) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return {};
    return { exec: (0, user_scope_js_1.scopedExec)(userId), query: (0, user_scope_js_1.scopedQuery)(userId) };
}
/** Window lengths for the healthkit-history range strings the fetch sends
 *  (collectSignals: options.biometricRange ?? "week"). The backend resolves
 *  the range relative to "now" server-side; this mirrors that client-side
 *  for the staleness diagnostics. Unknown ranges fall back to week. */
const RANGE_WINDOW_SEC = {
    day: 86400,
    week: 7 * 86400,
    month: 30 * 86400,
    year: 365 * 86400,
};
function pushUniqueWarnings(sink, items) {
    for (const item of items) {
        if (!sink.includes(item))
            sink.push(item);
    }
}
/** GeminiTextProvider gated on key presence — null (proposer skipped) when
 *  no Gemini key resolves, mirroring resolveTransferProvider. */
function resolveProposerLlm() {
    if (!(0, local_config_js_1.resolveGeminiApiKey)())
        return null;
    try {
        return new llm_js_1.GeminiTextProvider();
    }
    catch {
        return null;
    }
}
function resolveSemanticEmbedTexts() {
    if (!(0, local_config_js_1.resolveGeminiApiKey)())
        return null;
    try {
        const provider = new gemini_js_1.GeminiEmbeddingProvider();
        return async (texts) => provider.embed(texts);
    }
    catch {
        return null;
    }
}
async function embedSemanticQueries(queryTexts, options) {
    const uniqueTexts = [...new Set(queryTexts.map((text) => text.trim()).filter(Boolean))];
    if (uniqueTexts.length === 0)
        return new Map();
    if (options.semanticEmbedTexts) {
        const vectors = await options.semanticEmbedTexts(uniqueTexts);
        if (vectors.length !== uniqueTexts.length) {
            throw new Error(`semantic retrieval degraded: embed batch returned ${vectors.length} vectors for ${uniqueTexts.length} queries`);
        }
        return new Map(uniqueTexts.map((text, index) => [text, vectors[index]]));
    }
    if (options.semanticEmbedText) {
        const vectors = await Promise.all(uniqueTexts.map((text) => options.semanticEmbedText(text)));
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
function mergeSemanticMemoryPool(base, extras) {
    const merged = [...base];
    const seen = new Set(base.map((memory) => memory.id));
    for (const memory of extras) {
        if (seen.has(memory.id))
            continue;
        seen.add(memory.id);
        merged.push(memory);
    }
    return merged;
}
async function collectSemanticMemoryEvidence(input, options, userId, memoryEndTs) {
    const warnings = [];
    const anchors = (0, triplet_js_1.buildTripletContextAnchors)(input);
    const anchorsWithQuery = anchors.filter((anchor) => anchor.queryText);
    if (anchorsWithQuery.length === 0) {
        return { memory: input.memory, warnings };
    }
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        warnings.push("semantic retrieval degraded: graph store is not postgres (Layer-1 embeddings are warm-tier only)");
        return { memory: input.memory, warnings };
    }
    try {
        const embeddingsByQuery = await embedSemanticQueries(anchorsWithQuery.map((anchor) => anchor.queryText), options);
        const query = (0, user_scope_js_1.scopedQuery)(userId);
        const retrievalCache = new Map();
        for (const queryText of embeddingsByQuery.keys()) {
            retrievalCache.set(queryText, await (0, semantic_js_1.retrieveSemanticMemoryEvidence)({
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
        const extras = [];
        const scoresByAnchorRef = new Map();
        for (const anchor of anchorsWithQuery) {
            const matches = retrievalCache.get(anchor.queryText) ?? [];
            scoresByAnchorRef.set(anchor.state.graph_source_ref, new Map(matches.map((match) => [match.memory.id, match.semanticScore])));
            extras.push(...matches.map((match) => match.memory));
        }
        return {
            memory: mergeSemanticMemoryPool(input.memory, extras),
            scoresByAnchorRef,
            warnings,
        };
    }
    catch (err) {
        warnings.push(String(err?.message ?? err));
        return { memory: input.memory, warnings };
    }
}
/** Deterministic query text for the proposer's neighbor retrieval: top memory
 *  topics + insight snippets + recent meeting titles, bounded. */
function proposerQueryText(input) {
    const parts = [
        ...input.memory.slice(0, 5).flatMap((m) => [...m.topics, m.insight_text.slice(0, 120)]),
        ...input.granola.slice(0, 5).map((g) => g.title),
    ];
    return parts.join(" ").trim().slice(0, 600);
}
function demoInput(userId) {
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
async function collectSignals(options, userId, warnings) {
    if (options.demo)
        return { input: demoInput(userId), biometricSource: "none" };
    let client = options.client;
    if (!client) {
        const config = readConfig();
        const authenticatedConfig = (0, enrollment_js_1.resolveCredentialBoundClientConfig)(config, {
            deviceCredential: process.env.DAOBREW_DEVICE_CREDENTIAL,
            apiUrl: process.env.DAOBREW_API_URL,
        });
        const deviceCredential = authenticatedConfig.deviceCredential;
        const apiBaseUrl = authenticatedConfig.apiUrl;
        client = deviceCredential && apiBaseUrl
            ? new client_js_1.DaoBrewClient({ deviceCredential, baseUrl: apiBaseUrl })
            : undefined;
    }
    const replay = options.startTs !== undefined || options.endTs !== undefined;
    const memoryEndTs = options.memoryMode === "as-of" ? (options.asOfTs ?? options.endTs) : undefined;
    // Biometrics: Postgres stores read intraday_state/health_samples straight
    // from the warm tier by user_id (all data syncs to the database — the
    // backend HTTP path's windowing/identity quirks starved the reasoner);
    // any direct-path failure or SQLite store falls back to the HTTP client.
    // No device credential is required when a server-side direct read serves.
    const { signals: biometrics, source: biometricSource } = await (0, biometricsDb_js_1.readBiometricSignalsPreferDirect)({
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
    const scopedRead = (0, graph_db_js_1.graphStoreKind)() === "postgres" ? { query: (0, user_scope_js_1.scopedQuery)(userId) } : {};
    const [calendar, granola, memory] = await Promise.all([
        (0, calendar_js_1.readCalendarSignals)({ userId, startTs: options.startTs, endTs: options.endTs, limit: replay ? 500 : 100, ...scopedRead }),
        (0, granola_js_1.readGranolaSignals)({ userId, startTs: options.startTs, endTs: options.endTs, limit: replay ? 500 : 50, ...scopedRead }),
        (0, memory_js_1.readMemorySignals)({ userId, startTs: options.startTs, endTs: memoryEndTs, limit: replay ? 500 : 50, ...scopedRead }),
    ]);
    // baselines rides alongside input (not inside TripletInput, whose biometrics
    // field is the shared BiometricsSignals type without baselines) so the
    // reasoner can feed each episode's biometric_summary / pattern_endorsements.
    return { input: { biometrics, calendar, granola, memory }, biometricSource, baselines: biometrics.baselines };
}
async function runEngineOnce(options = {}) {
    const userId = requireRunUserId(options);
    const generationId = options.generationId?.trim() ?? "";
    const leaseToken = options.leaseToken?.trim() ?? "";
    if (Boolean(generationId) !== Boolean(leaseToken)) {
        throw new Error("generationId and leaseToken must be supplied together");
    }
    const graphStore = (0, graph_db_js_1.graphStoreKind)();
    if (generationId && (options.dryRun || graphStore !== "postgres")) {
        throw new Error("generation lease commits require a non-dry Postgres run");
    }
    const generationLease = generationId
        ? { generationId, leaseToken }
        : {};
    // Arm-time offer_state must be part of the same graph transaction as a
    // production generation. SQLite stays byte-identical and has no MRT table.
    const armedOffer = graphStore === "postgres" ? { armedOffer: {} } : {};
    const warnings = [];
    const { input, biometricSource, baselines } = await collectSignals(options, userId, warnings);
    const memoryEndTs = options.memoryMode === "as-of" ? (options.asOfTs ?? options.endTs) : undefined;
    const semanticMemory = options.demo
        ? { memory: input.memory, warnings: [], scoresByAnchorRef: undefined }
        : await collectSemanticMemoryEvidence(input, options, userId, memoryEndTs);
    pushUniqueWarnings(warnings, semanticMemory.warnings);
    const triplets = (0, triplet_js_1.joinTriplets)({ ...input, memory: semanticMemory.memory }, {
        userId,
        ...(semanticMemory.scoresByAnchorRef ? { semanticMemoryScoresByAnchorRef: semanticMemory.scoresByAnchorRef } : {}),
    });
    const reasoner = new Reasoner_js_1.Reasoner();
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
        warnings.push("graph store is sqlite but warm-tier ingest writes Postgres-only — if you expected memory/meetings, set DAOBREW_GRAPH_STORE=postgres (same DAOBREW_POSTGRES_DB as the ingest process)");
    }
    else if (corpusRowCount > 0 && signalCounts.biometric_episodes > 0) {
        // (b) Temporal-overlap trap: corpus rows exist but none joined into any
        // triplet (joinTriplets emits one triplet per biometric state, so with
        // episodes present the tell is "every triplet's corpus lists are empty",
        // not triplet_count === 0). Computed from arrays already in scope.
        const joinedCorpusRows = triplets.reduce((sum, triplet) => sum + triplet.events.length + triplet.meetings.length + triplet.memories.length, 0);
        if (joinedCorpusRows === 0) {
            warnings.push(`${corpusRowCount} corpus rows collected but all are outside the biometric window (calendar joins ±24h, memory 14d) — corpus timestamps miss every biometric state bucket; check source freshness`);
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
    const rawSamples = input.biometrics.metrics.flatMap((series) => series.samples.map((sample) => ({
        metric: series.metric,
        value: sample.value,
        timestamp: sample.timestamp,
    })));
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
                warnings.push(`raw samples stale: newest ${new Date(newestSampleTs * 1000).toISOString()} predates the biometric window — watch push may be down`);
            }
        }
        else if (signalCounts.biometric_episodes > 0) {
            warnings.push("no raw samples in window but state episodes exist — raw push pipeline may be down (states are refresh-job generated)");
        }
    }
    // Layer 2 causal memory (Postgres-only tables): read the claim-gated
    // active threads + latest user-model snapshot for this run. CONTEXT ONLY —
    // the reasoner attaches it to the armed root's props_json.memory_context
    // and it MUST NOT influence scoring/claims/arming (see reasoner types.ts).
    // Any read failure degrades to "no memory context" with a loud warning;
    // it never fails the run. SQLite runs skip the read entirely.
    let memoryContext;
    if (graphStore === "postgres") {
        try {
            // Read cap matches the root-node attachment cap in the Reasoner (5).
            // Scoped: reads user-scoped Layer-2 tables (threads/snapshots) — needs
            // the RLS GUC once the connection runs as the app role.
            const memoryRead = await (0, reader_js_1.readCausalMemory)({ userId, limit: 5, query: (0, user_scope_js_1.scopedQuery)(userId) });
            if (memoryRead.threads.length > 0) {
                memoryContext = {
                    threads: memoryRead.threads,
                    snapshotId: memoryRead.snapshot?.id ?? null,
                    snapshotFresh: memoryRead.snapshot_fresh,
                };
            }
        }
        catch (err) {
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
    let proposedThemes = [];
    let proposerAttempted = false;
    const windowRun = options.startTs !== undefined || options.endTs !== undefined;
    if (!options.demo && windowRun) {
        const proposerLlm = options.proposerLlm ?? resolveProposerLlm();
        if (!proposerLlm) {
            warnings.push("theme proposer skipped: no Gemini key — zero proposals this run");
        }
        else {
            proposerAttempted = true;
            try {
                // Semantic neighbors are candidate material for the proposer; their
                // degradation warnings are deduped against the post-delta
                // semantic_context attach so a degraded path warns once, not twice.
                const semanticWarnings = [];
                const neighbors = await (0, semantic_js_1.retrieveSemanticNeighbors)({
                    userId,
                    queryText: proposerQueryText(input),
                    warnings: semanticWarnings,
                    embedText: options.semanticEmbedText,
                    ...(graphStore === "postgres" ? { query: (0, user_scope_js_1.scopedQuery)(userId) } : {}),
                });
                pushUniqueWarnings(warnings, semanticWarnings);
                const proposal = await (0, proposer_js_1.proposeThemes)({
                    userId,
                    corpusSample: (0, proposer_js_1.buildProposerCorpusSample)({ insights: input.memory, meetings: input.granola, neighbors }),
                    existingThemes: input.memory.flatMap((m) => m.topics),
                    llm: proposerLlm,
                });
                warnings.push(...proposal.warnings);
                proposedThemes = proposal.themes;
            }
            catch (err) {
                warnings.push(`theme proposer failed; zero proposals this run: ${err?.message ?? err}`);
            }
        }
    }
    async function noSignalResult(reason) {
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
                    await (0, verify_js_1.recordCoverageObservations)({ userId, exec: (0, user_scope_js_1.scopedExec)(userId), query: (0, user_scope_js_1.scopedQuery)(userId) });
                }
                catch (err) {
                    warnings.push(`coverage observation write failed: ${err?.message ?? err}`);
                }
            }
            // RLS seam wiring (deferred wiring 1/3): the watching upsert writes and
            // re-reads the user's graph rows — scoped executors under Postgres,
            // empty spread (byte-identical SQL) under SQLite.
            await (0, upsert_js_1.upsertGraphDelta)(delta, {
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
    const preview = (0, v2Context_js_1.buildV2Context)(rawSamples);
    // Third staleness diagnostic (debug-proven blind spot): samples arrived and
    // are fresh (warning A stayed quiet) yet none of them clear the wear bar,
    // so v2 silently never activates. Mutually compatible with A/B by
    // construction: B needs zero samples, A needs stale ones.
    if (!options.demo && rawSamples.length > 0 && !preview) {
        warnings.push("raw samples present but no worn days (>=3 heart_rate samples/local day required) — v2 inactive");
    }
    const enrichmentAxes = preview
        ? (0, corpusAxes_js_1.buildCorpusAxes)({
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
                const semantic = await (0, semantic_js_1.attachSemanticContext)({
                    delta,
                    userId,
                    query: (0, user_scope_js_1.scopedQuery)(userId),
                    embedText: options.semanticEmbedText,
                });
                pushUniqueWarnings(warnings, semantic.warnings);
            }
            catch (err) {
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
                const attached = await (0, context_js_1.attachTransferCandidates)({ delta, userId, query: (0, user_scope_js_1.scopedQuery)(userId) });
                warnings.push(...attached.warnings);
            }
            catch (err) {
                warnings.push(`transfer retrieval failed; continuing without candidates: ${err?.message ?? err}`);
            }
        }
        // RLS seam wiring (deferred wiring 1/3): the armed upsert writes and
        // re-reads the user's graph rows — scoped executors under Postgres,
        // empty spread (byte-identical SQL) under SQLite.
        const result = await (0, upsert_js_1.upsertGraphDelta)(delta, {
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
                await (0, verify_js_1.recordSkippedDoneObservation)({
                    userId,
                    ghostId: result.armed_node_id,
                    delta,
                    exec: (0, user_scope_js_1.scopedExec)(userId),
                    query: (0, user_scope_js_1.scopedQuery)(userId),
                });
            }
            catch (err) {
                warnings.push(`verification observation write failed: ${err?.message ?? err}`);
            }
        }
        else if (result.status === "written" && !result.root_armed && graphStore === "postgres") {
            // Written-but-unarmed (watching-shaped) results are quiet runs too —
            // mutually exclusive with the skipped_done branch above, so a run
            // never records both a trigger and a coverage observation.
            try {
                // RLS seam wiring (phase 1): per-user verify write — GUC-scoped.
                await (0, verify_js_1.recordCoverageObservations)({ userId, exec: (0, user_scope_js_1.scopedExec)(userId), query: (0, user_scope_js_1.scopedQuery)(userId) });
            }
            catch (err) {
                warnings.push(`coverage observation write failed: ${err?.message ?? err}`);
            }
        }
        else if (result.status === "written" && result.root_armed && graphStore === "postgres") {
            // MRT randomization v1: upsertGraphDelta already drew the deterministic
            // arm and co-committed offer_state + the normal assignment INSERT before
            // the generation receipt/marker. This post-commit INSERT is an idempotent
            // fail-soft retry/observability boundary only; it never mutates graph
            // rows, so one generation always names one exact graph state.
            try {
                const offer = result.armed_offer;
                if (!offer) {
                    warnings.push("offer randomization was not included in the graph generation");
                }
                else {
                    const logged = await (0, assignments_js_1.logInterventionAssignment)({
                        userId,
                        ghostId: result.armed_node_id,
                        armedAtTs: offer.armedAtTs,
                        ghostProps: offer.ghostProps,
                        storeKind: graphStore,
                        exec: (0, user_scope_js_1.scopedExec)(userId),
                        nowTs: Math.floor(Date.now() / 1000),
                        assignment: offer.assignment,
                    });
                    if (logged.warning)
                        warnings.push(logged.warning);
                    // Control-arm recurrence: a held root still firing in a LATER week is
                    // the counterfactual analog of a done thread re-firing — record it so
                    // held episodes can settle pattern_recurred like treated ones.
                    if (offer.offerState === "held") {
                        try {
                            await (0, verify_js_1.recordHeldTriggerObservation)({
                                userId,
                                ghostId: result.armed_node_id,
                                ghostProps: offer.ghostProps,
                                exec: (0, user_scope_js_1.scopedExec)(userId),
                            });
                        }
                        catch (err) {
                            warnings.push(`held-episode observation write failed: ${err?.message ?? err}`);
                        }
                    }
                }
            }
            catch (err) {
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
    }
    catch (err) {
        if (err instanceof Reasoner_js_1.NotEnoughSignalError) {
            return noSignalResult(err.message);
        }
        throw err;
    }
}
function parseIsoArg(value, name) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms))
        throw new Error(`Invalid ${name}: ${value}`);
    return Math.trunc(ms / 1000);
}
function parseArgs(argv) {
    const options = { once: true, intervalSec: 300 };
    for (const arg of argv) {
        if (arg === "--once")
            options.once = true;
        else if (arg === "--watch") {
            options.watch = true;
            options.once = false;
        }
        else if (arg === "--dry-run")
            options.dryRun = true;
        else if (arg === "--demo")
            options.demo = true;
        else if (arg.startsWith("--interval-sec="))
            options.intervalSec = Number(arg.slice("--interval-sec=".length));
        else if (arg.startsWith("--max-runs="))
            options.maxRuns = Number(arg.slice("--max-runs=".length));
        else if (arg.startsWith("--user-id="))
            options.userId = arg.slice("--user-id=".length);
        else if (arg.startsWith("--start-iso="))
            options.startTs = parseIsoArg(arg.slice("--start-iso=".length), "start ISO");
        else if (arg.startsWith("--end-iso="))
            options.endTs = parseIsoArg(arg.slice("--end-iso=".length), "end ISO");
        else if (arg.startsWith("--as-of-iso=")) {
            options.asOfTs = parseIsoArg(arg.slice("--as-of-iso=".length), "as-of ISO");
            options.memoryMode = "as-of";
        }
        else if (arg.startsWith("--memory-mode=")) {
            const mode = arg.slice("--memory-mode=".length);
            if (mode !== "as-of" && mode !== "through-now")
                throw new Error("--memory-mode must be as-of or through-now");
            options.memoryMode = mode;
        }
        else if (arg.startsWith("--biometric-range="))
            options.biometricRange = arg.slice("--biometric-range=".length);
        else if (arg.startsWith("--state-chunk-days=")) {
            const value = Number(arg.slice("--state-chunk-days=".length));
            if (!Number.isFinite(value) || value <= 0)
                throw new Error("--state-chunk-days must be a positive number");
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
        }
        else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return options;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
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
        if (options.maxRuns && runs >= options.maxRuns)
            return;
        await sleep(Math.max(1, options.intervalSec ?? 300) * 1000);
    }
}
if (require.main === module) {
    main().catch((err) => {
        console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }, null, 2));
        process.exit(1);
    });
}
