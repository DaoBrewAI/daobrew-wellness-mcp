"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runNightlyThreadMaintenance = runNightlyThreadMaintenance;
const node_crypto_1 = require("node:crypto");
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const assignments_js_1 = require("../assignments.js");
const jobs_js_1 = require("../ingest/jobs.js");
const claims_js_1 = require("./claims.js");
const keys_js_1 = require("./keys.js");
const verify_js_1 = require("./verify.js");
const consent_js_1 = require("../transfer/consent.js");
const records_js_1 = require("../transfer/records.js");
const profile_js_1 = require("../transfer/profile.js");
const strength_js_1 = require("./strength.js");
const types_js_1 = require("./types.js");
/**
 * Layer 2 nightly consolidation: scan persisted ghost nodes, upsert durable
 * causal_memory_threads with deterministic evidence links, and recompute
 * strength/decay for ALL of the user's threads as a pure function of evidence
 * timestamps. Every write is idempotent by construction — deterministic ids,
 * ON CONFLICT guards, and recurrence copied (never incremented) from the
 * ghost's already week-unioned props — so re-runs are byte-identical no-ops.
 * Layer 2 stores refs/ids/summaries only: no bodies, no transcript spans.
 */
const JOB_NAME = "layer2:nightly";
/** Verify horizon when the root never recorded verify_horizon_weeks. */
const DEFAULT_VERIFY_HORIZON_WEEKS = 2;
/** Minimum in-window engine_ran_no_trigger observations before a quiet window
 *  earns no_recurrence_observed instead of insufficient_observation. */
const MIN_QUIET_RUNS_FOR_NO_RECURRENCE = 3;
/** Q3 GC: dormant zero-strength threads become archivable after 90 quiet days. */
const GC_DORMANT_AGE_SECONDS = 90 * 86_400;
function litText(value) {
    return value === null || value === undefined ? "NULL" : (0, graph_db_js_1.q)(String(value));
}
function litNum(value, field) {
    if (value === null || value === undefined)
        return "NULL";
    if (!Number.isFinite(value))
        throw new Error(`Invalid numeric value for ${field}: ${value}`);
    return String(value);
}
function litJson(value) {
    return `${(0, graph_db_js_1.q)(JSON.stringify(value ?? null))}::jsonb`;
}
function parseProps(value) {
    if (value && typeof value === "object" && !Array.isArray(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                return parsed;
        }
        catch {
            // fall through to empty props
        }
    }
    return {};
}
function finiteOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
/**
 * Ghost props carry refs both as plain strings (hidden_raw_refs) and as
 * support objects with a `source_ref` field (supporting_meeting_notes,
 * supporting_calendar_events, supporting_project_memories — see
 * Reasoner.ts supportCalendarProps/supportMeetingProps/supportMemoryProps).
 */
const REF_PROP_FIELDS = [
    "hidden_raw_refs",
    "supporting_meeting_notes",
    "supporting_calendar_events",
    "supporting_project_memories",
];
function collectGhostRefs(props) {
    const refs = new Set();
    const push = (value) => {
        if (typeof value === "string" && value.trim())
            refs.add(value.trim());
        else if (value && typeof value === "object" && typeof value.source_ref === "string") {
            const ref = String(value.source_ref).trim();
            if (ref)
                refs.add(ref);
        }
    };
    for (const field of REF_PROP_FIELDS) {
        const entries = props[field];
        if (Array.isArray(entries))
            entries.forEach(push);
    }
    return [...refs].sort();
}
/** Prefix conventions from src/engine/signals/*: memory:, plaud:, gdocs:, granola:, calendar:, eventkit:, state:, healthkit:. */
function classifyRef(ref) {
    const idx = ref.indexOf(":");
    if (idx <= 0)
        return null;
    const prefix = ref.slice(0, idx);
    const bareRef = ref.slice(idx + 1);
    if (!bareRef)
        return null;
    switch (prefix) {
        case "memory":
            return { evidenceKind: "source_ref", sourceTable: "user_insights", bareRef };
        case "plaud":
        case "gdocs":
        case "granola":
            return { evidenceKind: "source_ref", sourceTable: "meeting_notes", bareRef };
        case "calendar":
        case "eventkit":
            return { evidenceKind: "source_ref", sourceTable: "events", bareRef };
        case "state":
        case "healthkit":
            return { evidenceKind: "biometric", sourceTable: null, bareRef };
        default:
            return null;
    }
}
/**
 * Undirected ≤2-hop traversal from a ghost over causal edge kinds. The MVP
 * reasoner emits episode→ghost `suggests`/`evidence_for` and episode→pattern
 * `manifested` edges (Reasoner.ts buildDelta), so patterns sit exactly two
 * undirected hops from the ghost; `tagged`/`clusters`/`predicts` never count.
 */
const TRAVERSAL_EDGE_KINDS = new Set([
    "triggered",
    "manifested",
    "caused",
    "evidence_for",
    "relates_to",
    "suggests",
]);
/**
 * The canonical pattern key ('tension', 'overdrive', ...) lives in the pattern
 * node's props_json.pattern / source_ref 'pattern:<key>' (Reasoner.ts
 * addPatternNodes); element/title are only display fallbacks. The reader's
 * pattern_keys_json filter matches against this key.
 */
function patternKeyForNode(node) {
    const props = parseProps(node.props_json);
    if (typeof props.pattern === "string" && props.pattern)
        return props.pattern;
    if (typeof node.source_ref === "string" && node.source_ref.startsWith("pattern:")) {
        const key = node.source_ref.slice("pattern:".length);
        if (key)
            return key;
    }
    return node.element ?? node.title ?? null;
}
function patternKeysForGhost(ghostId, adjacency, nodesById) {
    const keys = new Set();
    const visited = new Set([ghostId]);
    let frontier = [ghostId];
    for (let hop = 0; hop < 2; hop += 1) {
        const next = [];
        for (const nodeId of frontier) {
            for (const neighbor of adjacency.get(nodeId) ?? []) {
                if (visited.has(neighbor))
                    continue;
                visited.add(neighbor);
                next.push(neighbor);
                const node = nodesById.get(neighbor);
                if (node?.kind === "pattern") {
                    const key = patternKeyForNode(node);
                    if (key)
                        keys.add(String(key));
                }
            }
        }
        frontier = next;
    }
    return [...keys].sort();
}
async function recordFailure(deps, err, startTs) {
    const exec = deps.exec ?? graph_db_js_1.execSql;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const message = String(err?.message ?? err).slice(0, 500);
    const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
    try {
        await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
            `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(JOB_NAME)}, ${durationMs}, 0, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify([`job_failed: ${message}`]))}::jsonb, ${nowTs()});`);
    }
    catch {
        // metrics are best-effort on the failure path; the original error still propagates
    }
    await (0, jobs_js_1.postAlertWebhook)(JOB_NAME, [`job_failed: ${message}`], deps);
}
async function runNightlyThreadMaintenance(deps) {
    if (!(deps.exec && deps.query) && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        throw new Error("runNightlyThreadMaintenance requires DAOBREW_GRAPH_STORE=postgres; layer 2 memory is Postgres-only");
    }
    const exec = deps.exec ?? graph_db_js_1.execSql;
    const query = deps.query ?? graph_db_js_1.queryJson;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const userId = deps.userId;
    const startTs = nowTs();
    try {
        const ghosts = await query(`SELECT id, title, subtitle, occurred_at_ts, created_at_ts, props_json FROM graph_nodes WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind = 'ghost'`);
        ghosts.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const contextNodes = ghosts.length
            ? (await query(`SELECT id, kind, title, element, source_ref, props_json FROM graph_nodes WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind IN ('pattern','episode')`))
            : [];
        const edges = ghosts.length
            ? (await query(`SELECT id, src_id, dst_id, kind FROM graph_edges WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}`))
            : [];
        const nodesById = new Map(contextNodes.map((node) => [String(node.id), node]));
        const adjacency = new Map();
        for (const edge of edges) {
            if (!TRAVERSAL_EDGE_KINDS.has(String(edge.kind)))
                continue;
            const src = String(edge.src_id);
            const dst = String(edge.dst_id);
            (adjacency.get(src) ?? adjacency.set(src, []).get(src)).push(dst);
            (adjacency.get(dst) ?? adjacency.set(dst, []).get(dst)).push(src);
        }
        // Batch source resolution: one query per source table across all ghosts.
        const refsByTable = new Map();
        const ghostRefs = new Map();
        let unresolvedRefs = 0;
        for (const ghost of ghosts) {
            const props = parseProps(ghost.props_json);
            const classified = [];
            for (const ref of collectGhostRefs(props)) {
                const parsed = classifyRef(ref);
                if (!parsed) {
                    unresolvedRefs += 1;
                    continue;
                }
                classified.push(parsed);
                if (parsed.sourceTable) {
                    const bucket = refsByTable.get(parsed.sourceTable) ?? new Set();
                    bucket.add(parsed.bareRef);
                    refsByTable.set(parsed.sourceTable, bucket);
                }
            }
            ghostRefs.set(String(ghost.id), classified);
        }
        const resolvedByTable = new Map();
        for (const table of ["meeting_notes", "events", "user_insights"]) {
            const refs = [...(refsByTable.get(table) ?? [])].sort();
            if (refs.length === 0)
                continue;
            const inList = refs.map((ref) => (0, graph_db_js_1.q)(ref)).join(", ");
            const timestampColumn = table === "events" ? "start_ts AS occurred_at_ts" : "occurred_at_ts";
            const rows = await query(`SELECT id, source_ref, ${timestampColumn} FROM ${table} WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND source_ref IN (${inList})`);
            const resolved = new Map();
            for (const row of rows) {
                if (typeof row.source_ref !== "string")
                    continue;
                resolved.set(row.source_ref, { id: String(row.id), occurredAtTs: finiteOrNull(row.occurred_at_ts) });
            }
            resolvedByTable.set(table, resolved);
        }
        const threadStatements = [];
        const evidenceRows = [];
        const now = nowTs();
        // Tonight's ghost-derived base claim per graph root — the claim pass
        // re-evaluates promotion from this base, never from the stored level.
        const baseClaimByRoot = new Map();
        const donePropsByRoot = new Map();
        // MRT v1: held (control-arm) armed roots settle like done threads, but
        // anchored on armed_at_ts; created_at_ts is the legacy episode fallback
        // (armedEpisodeTs — the same key the assignment row was minted with).
        const heldByRoot = new Map();
        for (const ghost of ghosts) {
            const ghostId = String(ghost.id);
            const props = parseProps(ghost.props_json);
            const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: ghostId });
            const id = (0, keys_js_1.threadId)(userId, threadKey);
            const claim = (0, claims_js_1.mapGraphClaimLevel)(typeof props.claim_level === "string" ? props.claim_level : undefined);
            // Accept numeric strings too — props round-trip through JSON serializers.
            const recurrenceRaw = typeof props.recurrence_count === "number" ||
                (typeof props.recurrence_count === "string" && props.recurrence_count.trim() !== "")
                ? Number(props.recurrence_count)
                : NaN;
            const recurrence = Number.isFinite(recurrenceRaw)
                ? recurrenceRaw
                : Array.isArray(props.active_weeks)
                    ? props.active_weeks.length
                    : 1;
            const status = props.status === "done" ? "done" : "active";
            baseClaimByRoot.set(ghostId, claim);
            if (props.status === "done")
                donePropsByRoot.set(ghostId, props);
            else if (props.status === "armed" && props.offer_state === "held") {
                heldByRoot.set(ghostId, { props, createdAtTs: finiteOrNull(ghost.created_at_ts) });
            }
            const title = typeof ghost.title === "string" && ghost.title ? ghost.title : ghostId;
            const summary = typeof ghost.subtitle === "string" && ghost.subtitle ? ghost.subtitle : null;
            const seenTs = finiteOrNull(ghost.occurred_at_ts) ?? finiteOrNull(ghost.created_at_ts);
            const patternKeys = patternKeysForGhost(ghostId, adjacency, nodesById);
            const firstPatternKey = patternKeys[0] ?? null;
            threadStatements.push(`INSERT INTO causal_memory_threads(\n` +
                `  id, user_id, thread_key, key_version, graph_root_id, title, summary, claim_level, status,\n` +
                `  pattern_keys_json, recurrence_count, first_seen_ts, last_seen_ts, strength, decay_state,\n` +
                `  created_at_ts, updated_at_ts\n` +
                `) VALUES (${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(threadKey)}, ${keys_js_1.THREAD_KEY_VERSION}, ${(0, graph_db_js_1.q)(ghostId)}, ${litText(title)}, ${litText(summary)}, ${(0, graph_db_js_1.q)(claim)}, ${(0, graph_db_js_1.q)(status)}, ${litJson(patternKeys)}, ${recurrence}, ${litNum(seenTs, "first_seen_ts")}, ${litNum(seenTs, "last_seen_ts")}, 1.0, 'active', ${now}, ${now})\n` +
                `ON CONFLICT (user_id, thread_key) DO UPDATE SET\n` +
                `  title = EXCLUDED.title,\n` +
                `  summary = COALESCE(EXCLUDED.summary, causal_memory_threads.summary),\n` +
                // claim_level is deliberately ABSENT here: the base claim is written on
                // INSERT only, and the V5 claim pass below is the sole writer afterwards —
                // an upsert overwrite would silently demote a promoted thread every night.
                `  status = EXCLUDED.status,\n` +
                `  pattern_keys_json = EXCLUDED.pattern_keys_json,\n` +
                `  recurrence_count = GREATEST(causal_memory_threads.recurrence_count, EXCLUDED.recurrence_count),\n` +
                `  first_seen_ts = LEAST(COALESCE(causal_memory_threads.first_seen_ts, EXCLUDED.first_seen_ts), COALESCE(EXCLUDED.first_seen_ts, causal_memory_threads.first_seen_ts)),\n` +
                `  last_seen_ts = GREATEST(COALESCE(causal_memory_threads.last_seen_ts, 0), COALESCE(EXCLUDED.last_seen_ts, 0)),\n` +
                `  updated_at_ts = EXCLUDED.updated_at_ts;`);
            for (const ref of ghostRefs.get(ghostId) ?? []) {
                const resolved = ref.sourceTable ? resolvedByTable.get(ref.sourceTable)?.get(ref.bareRef) ?? null : null;
                if (ref.sourceTable && !resolved)
                    unresolvedRefs += 1;
                evidenceRows.push({
                    // The bare source_ref is the id basis so ids stay stable whether or
                    // not the ref resolves to a warm-tier row tonight.
                    id: (0, keys_js_1.evidenceId)({
                        threadId: id,
                        sourceTable: ref.sourceTable,
                        sourceId: ref.bareRef,
                        graphNodeId: null,
                        graphEdgeId: null,
                        evidenceRole: "observation",
                    }),
                    threadId: id,
                    evidenceKind: ref.evidenceKind,
                    sourceTable: ref.sourceTable,
                    sourceId: resolved?.id ?? null,
                    sourceRef: ref.bareRef,
                    graphNodeId: null,
                    graphEdgeId: null,
                    claimLevel: claim,
                    patternKey: firstPatternKey,
                    evidenceRole: "observation",
                    observedAtTs: resolved?.occurredAtTs ?? finiteOrNull(ghost.occurred_at_ts) ?? null,
                    weight: strength_js_1.OBSERVATION_WEIGHT,
                });
            }
            if (props.status === "done") {
                // Detonate outcome: explicit tagging breaks feedback-loop confounding.
                evidenceRows.push({
                    id: (0, keys_js_1.evidenceId)({
                        threadId: id,
                        sourceTable: null,
                        sourceId: null,
                        graphNodeId: ghostId,
                        graphEdgeId: null,
                        evidenceRole: "system_initiated_intervention",
                    }),
                    threadId: id,
                    evidenceKind: "intervention_outcome",
                    sourceTable: null,
                    sourceId: null,
                    sourceRef: null,
                    graphNodeId: ghostId,
                    graphEdgeId: null,
                    claimLevel: claim,
                    patternKey: firstPatternKey,
                    evidenceRole: "system_initiated_intervention",
                    observedAtTs: finiteOrNull(ghost.occurred_at_ts) ?? now,
                    weight: strength_js_1.INTERVENTION_OUTCOME_WEIGHT,
                });
            }
        }
        for (const statement of threadStatements) {
            await exec(statement);
        }
        if (evidenceRows.length > 0) {
            const values = evidenceRows
                .map((row) => (`(${(0, graph_db_js_1.q)(row.id)}, ${(0, graph_db_js_1.q)(row.threadId)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(row.evidenceKind)}, ${litText(row.sourceTable)}, ${litText(row.sourceId)}, ${litText(row.sourceRef)}, ${litText(row.graphNodeId)}, ${litText(row.graphEdgeId)}, ${(0, graph_db_js_1.q)(row.claimLevel)}, ${litText(row.patternKey)}, ${(0, graph_db_js_1.q)(row.evidenceRole)}, ${litNum(row.observedAtTs, "observed_at_ts")}, ${row.weight}, ${now})`))
                .join(",\n");
            // Q3(a) monotone NULL-fill: a ref that resolves on a LATER night backfills
            // observed_at_ts/source_id, but an existing value is never overwritten —
            // still idempotent, and strength decay gains real timestamps over time.
            await exec(`INSERT INTO causal_thread_evidence(id, thread_id, user_id, evidence_kind, source_table, source_id, source_ref, graph_node_id, graph_edge_id, claim_level, pattern_key, evidence_role, observed_at_ts, weight, created_at_ts)\n` +
                `VALUES ${values}\n` +
                `ON CONFLICT (id) DO UPDATE SET\n` +
                `  observed_at_ts = COALESCE(causal_thread_evidence.observed_at_ts, EXCLUDED.observed_at_ts),\n` +
                `  source_id = COALESCE(causal_thread_evidence.source_id, EXCLUDED.source_id);`);
        }
        // V5(c) settlement pass: for every handled (done) root whose verify window
        // has fully elapsed, write exactly ONE verdict row per handled cycle —
        // deterministic `vd:<handled_at_ts>` bucket, ON CONFLICT (id) DO NOTHING.
        let verdictsSettled = 0;
        let transferRecordsEmitted = 0;
        const transferWarnings = new Set();
        // 5B transfer emit deps: salt/provider resolve ONCE per run; provider is
        // only constructed lazily (Gemini needs a key) and null degrades to a
        // NULL-embedding row that a later sweep can backfill from trigger_text.
        const emitSalt = deps.transferSalt !== undefined ? deps.transferSalt : (0, consent_js_1.transferSalt)();
        const emitProvider = deps.transferProvider !== undefined ? deps.transferProvider : (0, records_js_1.resolveTransferProvider)();
        for (const [ghostId, props] of [...donePropsByRoot.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const handled = await (0, verify_js_1.resolveHandledAtTs)(userId, ghostId, props, query);
            if (handled === null)
                continue;
            const horizonWeeks = finiteOrNull(props.verify_horizon_weeks) ?? DEFAULT_VERIFY_HORIZON_WEEKS;
            const windowEnd = handled + horizonWeeks * 7 * 86_400;
            if (now <= windowEnd)
                continue; // window still open — nothing to settle yet
            const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: ghostId });
            const tid = (0, keys_js_1.threadId)(userId, threadKey);
            const observations = await query(`SELECT observation, observed_at_ts FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND thread_id = ${(0, graph_db_js_1.q)(tid)} AND kind = 'observation'`);
            let triggersInWindow = 0;
            let quietRunsInWindow = 0;
            for (const row of observations) {
                const ts = finiteOrNull(row.observed_at_ts);
                if (ts === null || ts < handled || ts > windowEnd)
                    continue;
                if (row.observation === "same_thread_trigger")
                    triggersInWindow += 1;
                else if (row.observation === "engine_ran_no_trigger")
                    quietRunsInWindow += 1;
            }
            const verdict = triggersInWindow > 0
                ? "pattern_recurred"
                : quietRunsInWindow >= MIN_QUIET_RUNS_FOR_NO_RECURRENCE
                    ? "no_recurrence_observed"
                    : "insufficient_observation";
            const verdictRowId = (0, keys_js_1.verificationId)({ threadId: tid, kind: "verdict", bucket: `vd:${handled}` });
            const details = {
                same_thread_trigger_in_window: triggersInWindow,
                engine_ran_no_trigger_in_window: quietRunsInWindow,
                window_end_ts: windowEnd,
            };
            // verdictsSettled must count rows actually inserted, not attempts —
            // exec cannot read RETURNING (it resolves void), so a pre-check read
            // is the cheapest honest gate. The INSERT itself stays byte-identical
            // and ON CONFLICT-guarded, so a race merely under-counts by design.
            const existingVerdict = await query(`SELECT 1 FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND id = ${(0, graph_db_js_1.q)(verdictRowId)} LIMIT 1`);
            await exec(`INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, verdict, handled_at_ts, horizon_weeks, predicted_outcome, observed_at_ts, details_json, created_at_ts)\n` +
                `VALUES (${(0, graph_db_js_1.q)(verdictRowId)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(tid)}, ${(0, graph_db_js_1.q)(threadKey)}, ${(0, graph_db_js_1.q)(ghostId)}, 'verdict', ${(0, graph_db_js_1.q)(verdict)}, ${handled}, ${horizonWeeks}, 'no_same_thread_trigger_within_horizon', ${windowEnd}, ${litJson(details)}, ${now})\n` +
                `ON CONFLICT (id) DO NOTHING;`);
            if (existingVerdict.length === 0)
                verdictsSettled += 1;
            // 5B: a settled verdict IS a confirmed method outcome — the only moment
            // an anonymized what-worked record can honestly be emitted. Fail-soft:
            // a transfer write must never fail the nightly job. Attempted on every
            // settled cycle (not just fresh verdicts): the deterministic id +
            // ON CONFLICT guard make re-attempts free and self-healing.
            try {
                const emitted = await (0, records_js_1.emitTransferRecord)({
                    userId,
                    ghostId,
                    threadKey,
                    threadId: tid,
                    handledAtTs: handled,
                    verdict,
                    ghostProps: props,
                    salt: emitSalt,
                    provider: emitProvider,
                    exec,
                    query,
                    nowTs: now,
                });
                transferRecordsEmitted += emitted.written;
                for (const warning of emitted.warnings)
                    transferWarnings.add(warning);
            }
            catch (err) {
                transferWarnings.add(`transfer record emit failed: ${err?.message ?? String(err)}`);
            }
        }
        // MRT v1 control settlement: held episodes past their horizon settle with
        // the SAME verdict formula, anchored on armed_at_ts (episode anchor) and
        // tagged details_json.arm='control'. No transfer emit and no
        // intervention_outcome evidence — nothing was delivered, so there is no
        // "what worked" to share; the verdict exists purely as the counterfactual
        // leg of the treatment/control comparison.
        for (const [ghostId, held] of [...heldByRoot.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const handled = (0, assignments_js_1.armedEpisodeTs)(held.props, held.createdAtTs);
            if (handled === null)
                continue;
            const horizonWeeks = finiteOrNull(held.props.verify_horizon_weeks) ?? DEFAULT_VERIFY_HORIZON_WEEKS;
            const windowEnd = handled + horizonWeeks * 7 * 86_400;
            if (now <= windowEnd)
                continue; // window still open — nothing to settle yet
            const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: ghostId });
            const tid = (0, keys_js_1.threadId)(userId, threadKey);
            const observations = await query(`SELECT observation, observed_at_ts FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND thread_id = ${(0, graph_db_js_1.q)(tid)} AND kind = 'observation'`);
            let triggersInWindow = 0;
            let quietRunsInWindow = 0;
            for (const row of observations) {
                const ts = finiteOrNull(row.observed_at_ts);
                if (ts === null || ts < handled || ts > windowEnd)
                    continue;
                if (row.observation === "same_thread_trigger")
                    triggersInWindow += 1;
                else if (row.observation === "engine_ran_no_trigger")
                    quietRunsInWindow += 1;
            }
            const verdict = triggersInWindow > 0
                ? "pattern_recurred"
                : quietRunsInWindow >= MIN_QUIET_RUNS_FOR_NO_RECURRENCE
                    ? "no_recurrence_observed"
                    : "insufficient_observation";
            const verdictRowId = (0, keys_js_1.verificationId)({ threadId: tid, kind: "verdict", bucket: `vd:${handled}` });
            const details = {
                arm: "control",
                same_thread_trigger_in_window: triggersInWindow,
                engine_ran_no_trigger_in_window: quietRunsInWindow,
                window_end_ts: windowEnd,
            };
            const existingVerdict = await query(`SELECT 1 FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND id = ${(0, graph_db_js_1.q)(verdictRowId)} LIMIT 1`);
            await exec(`INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, verdict, handled_at_ts, horizon_weeks, predicted_outcome, observed_at_ts, details_json, created_at_ts)\n` +
                `VALUES (${(0, graph_db_js_1.q)(verdictRowId)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(tid)}, ${(0, graph_db_js_1.q)(threadKey)}, ${(0, graph_db_js_1.q)(ghostId)}, 'verdict', ${(0, graph_db_js_1.q)(verdict)}, ${handled}, ${horizonWeeks}, 'no_same_thread_trigger_within_horizon', ${windowEnd}, ${litJson(details)}, ${now})\n` +
                `ON CONFLICT (id) DO NOTHING;`);
            if (existingVerdict.length === 0)
                verdictsSettled += 1;
        }
        // V5(d) claim pass: EVERY nightly, re-derive claim_level for all threads as
        // a pure function of (tonight's base, verdict counts) — D1 thresholds via
        // promotedClaimLevel. History is appended only when the level changes, so
        // re-runs over identical rows emit byte-identical UPDATEs.
        const verdictRows = await query(`SELECT thread_id, verdict, details_json ->> 'arm' AS arm FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind = 'verdict'`);
        const verdictCounts = new Map();
        for (const row of verdictRows) {
            // MRT v1: control-arm verdicts are EXCLUDED from promotion counts —
            // the ladder stays treatment-evidence-based. Rows without an arm tag
            // are pre-MRT treatment verdicts.
            if (String(row.arm ?? "") === "control")
                continue;
            const key = String(row.thread_id);
            const counts = verdictCounts.get(key) ?? { confirmations: 0, contradictions: 0 };
            if (row.verdict === "no_recurrence_observed")
                counts.confirmations += 1;
            else if (row.verdict === "pattern_recurred")
                counts.contradictions += 1;
            // insufficient_observation is neither
            verdictCounts.set(key, counts);
        }
        const claimRows = await query(`SELECT id, graph_root_id, claim_level, promotion_state_json FROM causal_memory_threads WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}`);
        claimRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        for (const row of claimRows) {
            const tid = String(row.id);
            const prevState = parseProps(row.promotion_state_json);
            const current = types_js_1.CLAIM_LEVELS.includes(String(row.claim_level))
                ? row.claim_level
                : "correlation";
            // Base preference: tonight's ghost mapping > persisted base > current level
            // (last resort for pre-V5 rows that never recorded a base).
            const storedBase = types_js_1.CLAIM_LEVELS.includes(String(prevState.base_claim_level))
                ? prevState.base_claim_level
                : null;
            const rootId = typeof row.graph_root_id === "string" ? row.graph_root_id : null;
            const base = (rootId ? baseClaimByRoot.get(rootId) : undefined) ?? storedBase ?? current;
            const counts = verdictCounts.get(tid) ?? { confirmations: 0, contradictions: 0 };
            const final = (0, claims_js_1.promotedClaimLevel)(base, counts.confirmations, counts.contradictions);
            const history = Array.isArray(prevState.history) ? [...prevState.history] : [];
            if (final !== current) {
                history.push({
                    from: current,
                    to: final,
                    at_ts: now,
                    confirmations: counts.confirmations,
                    contradictions: counts.contradictions,
                });
            }
            const state = {
                base_claim_level: base,
                confirmations: counts.confirmations,
                contradictions: counts.contradictions,
                computed_at_ts: now,
                history,
            };
            await exec(`UPDATE causal_memory_threads SET claim_level = ${(0, graph_db_js_1.q)(final)}, promotion_state_json = ${litJson(state)}, updated_at_ts = ${now} WHERE id = ${(0, graph_db_js_1.q)(tid)};`);
        }
        // Strength recompute for ALL of the user's threads — pure function of
        // evidence timestamps + now, so a re-run emits identical UPDATEs. Runs
        // AFTER the claim pass so a promotion's longer half-life (strength.ts)
        // takes effect the same night.
        const threadRows = await query(`SELECT id, claim_level FROM causal_memory_threads WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}`);
        const allEvidence = await query(`SELECT thread_id, observed_at_ts, weight FROM causal_thread_evidence WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}`);
        const evidenceByThread = new Map();
        for (const row of allEvidence) {
            const key = String(row.thread_id);
            const bucket = evidenceByThread.get(key) ?? [];
            const weight = Number(row.weight);
            bucket.push({
                observed_at_ts: finiteOrNull(row.observed_at_ts),
                weight: Number.isFinite(weight) ? weight : strength_js_1.OBSERVATION_WEIGHT,
            });
            evidenceByThread.set(key, bucket);
        }
        threadRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        for (const thread of threadRows) {
            const tid = String(thread.id);
            const evidence = evidenceByThread.get(tid) ?? [];
            const claim = types_js_1.CLAIM_LEVELS.includes(String(thread.claim_level))
                ? thread.claim_level
                : "correlation";
            const strength = (0, strength_js_1.computeStrength)(evidence, claim, now);
            const observedTimestamps = evidence
                .map((item) => item.observed_at_ts)
                .filter((ts) => typeof ts === "number");
            const lastReinforced = observedTimestamps.length ? Math.max(...observedTimestamps) : null;
            await exec(`UPDATE causal_memory_threads SET strength = ${strength}, decay_state = ${(0, graph_db_js_1.q)((0, strength_js_1.decayStateFor)(strength))}, last_reinforced_ts = ${litNum(lastReinforced, "last_reinforced_ts")}, updated_at_ts = ${now} WHERE id = ${(0, graph_db_js_1.q)(tid)};`);
        }
        // Q3(b) GC pass (D3: ARCHIVE, never delete). A thread is archivable only
        // when it is active-but-fully-decayed (dormant, strength exactly 0), older
        // than 90 days, has no evidence observed inside the window, and its graph
        // root — if it ever had one — is gone from tonight's ghost scan. Evidence
        // and verification rows are deliberately KEPT.
        const gcCutoffTs = now - GC_DORMANT_AGE_SECONDS;
        const gcCandidates = await query(`SELECT id, graph_root_id FROM causal_memory_threads WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND status = 'active' AND decay_state = 'dormant' AND strength = 0 AND created_at_ts < ${gcCutoffTs} AND NOT EXISTS (SELECT 1 FROM causal_thread_evidence e WHERE e.thread_id = causal_memory_threads.id AND e.observed_at_ts >= ${gcCutoffTs})`);
        const liveGhostIds = new Set(ghosts.map((ghost) => String(ghost.id)));
        const gcVictims = gcCandidates
            .filter((row) => {
            const rootId = typeof row.graph_root_id === "string" && row.graph_root_id ? row.graph_root_id : null;
            return rootId === null || !liveGhostIds.has(rootId);
        })
            .map((row) => String(row.id))
            .sort();
        const threadsArchived = gcVictims.length;
        if (threadsArchived > 0) {
            await exec(`UPDATE causal_memory_threads SET status = 'archived', updated_at_ts = ${now} WHERE user_id = ${(0, graph_db_js_1.q)(userId)} AND status = 'active' AND id IN (${gcVictims.map((id) => (0, graph_db_js_1.q)(id)).join(", ")});`);
        }
        // T6 (5B): refresh the slow user-profile vector — one per local day,
        // thread vocabulary only. Fail-soft like the transfer emit above.
        let profileVectorsWritten = 0;
        try {
            const profile = await (0, profile_js_1.writeProfileVector)({
                userId,
                provider: emitProvider,
                exec,
                query,
                nowTs: now,
            });
            profileVectorsWritten = profile.written;
            for (const warning of profile.warnings)
                transferWarnings.add(warning);
        }
        catch (err) {
            transferWarnings.add(`profile vector write failed: ${err?.message ?? String(err)}`);
        }
        // MRT v1 comparison metric: one pipeline_metrics row per nightly with the
        // user's cumulative settled-verdict counts by arm × verdict. Fail-soft —
        // a metrics hiccup must never fail the job. Counted from the claim-pass
        // verdict read above (arm rides along), so no extra query.
        const mrtComparison = {
            treatment_recurred: 0,
            treatment_quiet: 0,
            control_recurred: 0,
            control_quiet: 0,
        };
        for (const row of verdictRows) {
            const control = String(row.arm ?? "") === "control";
            if (row.verdict === "pattern_recurred") {
                if (control)
                    mrtComparison.control_recurred += 1;
                else
                    mrtComparison.treatment_recurred += 1;
            }
            else if (row.verdict === "no_recurrence_observed") {
                if (control)
                    mrtComparison.control_quiet += 1;
                else
                    mrtComparison.treatment_quiet += 1;
            }
            // insufficient_observation counts nowhere
        }
        const warnings = [];
        try {
            const counted = mrtComparison.treatment_recurred + mrtComparison.treatment_quiet +
                mrtComparison.control_recurred + mrtComparison.control_quiet;
            await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
                `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, 'layer2:nightly:mrt_comparison', 0, ${counted}, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify([{ mrt_comparison: mrtComparison }]))}::jsonb, ${nowTs()});`);
        }
        catch (err) {
            warnings.push(`mrt comparison metric failed: ${String(err?.message ?? err).slice(0, 200)}`);
        }
        if (unresolvedRefs > 0)
            warnings.push(`unresolved_refs: ${unresolvedRefs}`);
        if (threadsArchived > 0)
            warnings.push(`threads_archived: ${threadsArchived}`);
        warnings.push(...transferWarnings);
        const alerts = [];
        const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
        const rowsWritten = threadStatements.length + evidenceRows.length;
        await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
            `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(JOB_NAME)}, ${durationMs}, ${rowsWritten}, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify(warnings))}::jsonb, ${nowTs()});`);
        return {
            threadsUpserted: threadStatements.length,
            evidenceInserted: evidenceRows.length,
            verdictsSettled,
            threadsArchived,
            transferRecordsEmitted,
            profileVectorsWritten,
            mrtComparison,
            warnings,
            alerts,
        };
    }
    catch (err) {
        await recordFailure(deps, err, startTs);
        throw err;
    }
}
