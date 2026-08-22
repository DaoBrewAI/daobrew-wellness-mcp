"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCausalMemory = readCausalMemory;
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const claims_js_1 = require("./claims.js");
const types_js_1 = require("./types.js");
const DEFAULT_LIMIT = 12;
/** Snapshots older than this stop counting as fresh context. */
const SNAPSHOT_FRESH_SECONDS = 7 * 86_400;
function parseJsonArray(value) {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed))
                return parsed.map(String);
        }
        catch {
            // fall through
        }
    }
    return [];
}
function finiteOrNull(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function toClaimLevel(value) {
    return types_js_1.CLAIM_LEVELS.includes(String(value))
        ? value
        : "correlation";
}
async function readCausalMemory(options) {
    if (!options.query && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        throw new Error("readCausalMemory requires DAOBREW_GRAPH_STORE=postgres; layer 2 memory is Postgres-only");
    }
    const query = options.query ?? graph_db_js_1.queryJson;
    const userId = options.userId;
    const limit = options.limit ?? DEFAULT_LIMIT;
    const filters = [
        `user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}`,
        `status = 'active'`,
        `decay_state = 'active'`,
    ];
    if (options.graphRootId)
        filters.push(`graph_root_id = ${(0, graph_db_js_1.q)(options.graphRootId)}`);
    if (options.patternKeys && options.patternKeys.length > 0) {
        const keys = options.patternKeys.map((key) => (0, graph_db_js_1.q)(key)).join(", ");
        filters.push(`pattern_keys_json ?| array[${keys}]`);
    }
    const threadRows = await query(`SELECT id, user_id, thread_key, key_version, graph_root_id, title, summary, claim_level, status, pattern_keys_json, recurrence_count, first_seen_ts, last_seen_ts, last_reinforced_ts, strength, decay_state\n` +
        `FROM causal_memory_threads\n` +
        `WHERE ${filters.join(" AND ")}\n` +
        `ORDER BY strength DESC, last_seen_ts DESC\n` +
        `LIMIT ${limit}`);
    const evidenceTablesByThread = new Map();
    const verificationByThread = new Map();
    if (threadRows.length > 0) {
        // Scope to the returned threads — this is the hot path; never drag the
        // user's full evidence history through the transport.
        const threadIdList = threadRows.map((row) => (0, graph_db_js_1.q)(String(row.id))).join(", ");
        const evidenceRows = await query(`SELECT thread_id, source_table FROM causal_thread_evidence WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND thread_id IN (${threadIdList})`);
        for (const row of evidenceRows) {
            const key = String(row.thread_id);
            const bucket = evidenceTablesByThread.get(key) ?? new Set();
            bucket.add(typeof row.source_table === "string" && row.source_table ? row.source_table : null);
            evidenceTablesByThread.set(key, bucket);
        }
        // V6: one aggregate pass over the settled verdicts for these threads.
        // Same scoping idiom as the evidence query; counting mirrors nightly's
        // claim pass (insufficient_observation is neither side).
        const verdictRows = await query(`SELECT thread_id, verdict, observed_at_ts FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind = 'verdict' AND thread_id IN (${threadIdList})`);
        for (const row of verdictRows) {
            const key = String(row.thread_id);
            const summary = verificationByThread.get(key) ?? {
                confirmations: 0,
                contradictions: 0,
                last_verdict_at_ts: null,
            };
            if (row.verdict === "no_recurrence_observed")
                summary.confirmations += 1;
            else if (row.verdict === "pattern_recurred")
                summary.contradictions += 1;
            const ts = finiteOrNull(row.observed_at_ts);
            if (ts !== null && (summary.last_verdict_at_ts === null || ts > summary.last_verdict_at_ts)) {
                summary.last_verdict_at_ts = ts;
            }
            verificationByThread.set(key, summary);
        }
    }
    const threads = threadRows.map((row) => {
        const id = String(row.id);
        const claim = toClaimLevel(row.claim_level);
        const tables = [...(evidenceTablesByThread.get(id) ?? new Set())];
        return {
            id,
            user_id: String(row.user_id ?? userId),
            thread_key: String(row.thread_key ?? ""),
            key_version: Number(row.key_version) || 1,
            graph_root_id: typeof row.graph_root_id === "string" && row.graph_root_id ? row.graph_root_id : null,
            title: String(row.title ?? id),
            summary: typeof row.summary === "string" && row.summary ? row.summary : null,
            claim_level: claim,
            status: "active",
            pattern_keys_json: parseJsonArray(row.pattern_keys_json),
            recurrence_count: Number(row.recurrence_count) || 0,
            first_seen_ts: finiteOrNull(row.first_seen_ts),
            last_seen_ts: finiteOrNull(row.last_seen_ts),
            last_reinforced_ts: finiteOrNull(row.last_reinforced_ts),
            strength: Number(row.strength) || 0,
            decay_state: "active",
            influence: (0, claims_js_1.gateThreadInfluence)(claim, tables),
            evidence_tables: tables.filter((table) => table !== null).sort(),
            verification: verificationByThread.get(id) ?? {
                confirmations: 0,
                contradictions: 0,
                last_verdict_at_ts: null,
            },
        };
    });
    const snapshotRows = await query(`SELECT id, user_id, version, snapshot_text, source_thread_ids_json, claim_ceiling, generated_from_count, created_at_ts\n` +
        `FROM user_model_snapshots\n` +
        `WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL}\n` +
        `ORDER BY version DESC\n` +
        `LIMIT 1`);
    const snapshotRow = snapshotRows[0];
    const snapshot = snapshotRow
        ? {
            id: String(snapshotRow.id),
            user_id: String(snapshotRow.user_id ?? userId),
            version: Number(snapshotRow.version) || 0,
            snapshot_text: String(snapshotRow.snapshot_text ?? ""),
            source_thread_ids_json: parseJsonArray(snapshotRow.source_thread_ids_json),
            claim_ceiling: toClaimLevel(snapshotRow.claim_ceiling),
            generated_from_count: Number(snapshotRow.generated_from_count) || 0,
            created_at_ts: finiteOrNull(snapshotRow.created_at_ts) ?? 0,
        }
        : null;
    const now = options.nowTs ? options.nowTs() : Math.floor(Date.now() / 1000);
    const snapshotFresh = snapshot !== null && now - snapshot.created_at_ts < SNAPSHOT_FRESH_SECONDS;
    return { threads, snapshot, snapshot_fallback: snapshot === null, snapshot_fresh: snapshotFresh };
}
