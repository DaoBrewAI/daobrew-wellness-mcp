"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresIngestSink = void 0;
const graph_db_js_1 = require("../../graph-db.js");
const node_crypto_1 = require("node:crypto");
const user_scope_js_1 = require("../user-scope.js");
const gemini_js_1 = require("../embeddings/gemini.js");
const llm_js_1 = require("../memory/llm.js");
const insight_lifecycle_js_1 = require("./insight-lifecycle.js");
function defaultLifecycleLlm() {
    try {
        return new llm_js_1.GeminiTextProvider();
    }
    catch {
        return null;
    }
}
function defaultLifecycleEmbeddings() {
    try {
        const provider = new gemini_js_1.GeminiEmbeddingProvider();
        return async (texts) => provider.embed(texts);
    }
    catch {
        return null;
    }
}
function stableStringify(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value ?? null);
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
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
/** User-scoped primary key: row ids from the normalizers are content/file
 *  hashes with NO user component, so the same source file ingested under two
 *  identities collides on the bare PK — and under RLS the losing INSERT
 *  surfaces as "new row violates row-level security policy" because the
 *  conflicting row is invisible. Suffixing a short user hash makes ids
 *  per-user; "local" keeps the legacy scheme (sqlite/local flows and every
 *  pre-scoping row). Dedup is unaffected: it keys on (user_id, source,
 *  source_ref), so old-scheme rows for the SAME user still dedup-skip. */
function scopedRowId(id, userId) {
    if (userId === "local")
        return id;
    const suffix = (0, node_crypto_1.createHash)("sha256").update(userId).digest("hex").slice(0, 8);
    return `${id}_u${suffix}`;
}
class PostgresIngestSink {
    exec;
    query;
    nowTs;
    lifecycle;
    schemaReady = null;
    constructor(executors) {
        if (!executors?.exec && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
            throw new Error("PostgresIngestSink requires DAOBREW_GRAPH_STORE=postgres; warm-tier ingest is Postgres-only");
        }
        this.exec = executors?.exec ?? graph_db_js_1.execSql;
        this.query = executors?.query ?? graph_db_js_1.queryJson;
        this.nowTs = executors?.nowTs ?? (() => Math.floor(Date.now() / 1000));
        this.lifecycle = executors?.lifecycle;
    }
    ensureSchema() {
        if (!this.schemaReady) {
            // Shared Postgres DDL is Alembic-owned. Runtime ingest readiness is a
            // read-only source-table probe; failures clear the cache so a later
            // ingest can retry after migrations finish.
            this.schemaReady = this.query("SELECT 1 FROM events LIMIT 0;")
                .then(() => undefined)
                .catch((err) => {
                this.schemaReady = null;
                throw new Error(`Postgres ingest schema is not ready; run Alembic upgrade head first (${err?.message ?? err})`);
            });
        }
        return this.schemaReady;
    }
    async fetchExisting(table, columns, userId, keys) {
        if (keys.length === 0)
            return [];
        const pairs = keys
            .map((key) => `(${(0, graph_db_js_1.q)(key.source)}, ${(0, graph_db_js_1.q)(key.source_ref)})`)
            .join(", ");
        // user_id filtered via the scope row, NOT a literal — a literal creates
        // the One-Time Filter fail-closed trap on fresh pooled backends (see
        // SCOPED_USER_ID_SQL in user-scope.ts; live bug F1).
        return (0, user_scope_js_1.scopedQuery)(userId, this.query)(`SELECT ${columns.join(", ")} FROM ${table}\n` +
            ` WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND (source, source_ref) IN (${pairs})`);
    }
    async upsertEvents(userId, rows) {
        await this.ensureSchema();
        const exec = (0, user_scope_js_1.scopedExec)(userId, this.exec);
        const existing = await this.fetchExisting("events", ["source", "source_ref", "title", "start_ts", "end_ts", "all_day", "attendee_count", "attendees_json", "calendar_name", "location", "metadata_json"], userId, rows.filter((row) => row.source_ref !== null).map((row) => ({ source: row.source, source_ref: row.source_ref })));
        const byKey = new Map(existing.map((row) => [`${row.source}\u0000${row.source_ref}`, row]));
        let rowsWritten = 0;
        let dedupSkips = 0;
        for (const row of rows) {
            const prior = row.source_ref === null ? undefined : byKey.get(`${row.source}\u0000${row.source_ref}`);
            if (prior && this.eventUnchanged(prior, row)) {
                dedupSkips += 1;
                continue;
            }
            const conflict = row.source_ref === null
                ? "ON CONFLICT (id)"
                : "ON CONFLICT (user_id, source, source_ref) WHERE source_ref IS NOT NULL";
            await exec(`INSERT INTO events(id, user_id, source, source_ref, title, start_ts, end_ts, all_day, attendee_count, attendees_json, calendar_name, location, metadata_json, created_at_ts)\n` +
                `VALUES (${(0, graph_db_js_1.q)(scopedRowId(row.id, userId))}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(row.source)}, ${litText(row.source_ref)}, ${(0, graph_db_js_1.q)(row.title)}, ${litNum(row.start_ts, "start_ts")}, ${litNum(row.end_ts, "end_ts")}, ${row.all_day ? 1 : 0}, ${litNum(row.attendee_count, "attendee_count")}, ${litJson(row.attendees)}, ${litText(row.calendar_name)}, ${litText(row.location)}, ${litJson(row.metadata)}, ${this.nowTs()})\n` +
                `${conflict} DO UPDATE SET\n` +
                `  title = EXCLUDED.title, start_ts = EXCLUDED.start_ts, end_ts = EXCLUDED.end_ts,\n` +
                `  all_day = EXCLUDED.all_day, attendee_count = EXCLUDED.attendee_count,\n` +
                `  attendees_json = EXCLUDED.attendees_json, calendar_name = EXCLUDED.calendar_name,\n` +
                `  location = EXCLUDED.location, metadata_json = EXCLUDED.metadata_json;`);
            rowsWritten += 1;
        }
        return { rowsWritten, dedupSkips };
    }
    eventUnchanged(prior, row) {
        return (prior.title === row.title &&
            Number(prior.start_ts) === row.start_ts &&
            (prior.end_ts ?? null) === (row.end_ts ?? null) &&
            Number(prior.all_day) === (row.all_day ? 1 : 0) &&
            (prior.attendee_count ?? null) === (row.attendee_count ?? null) &&
            stableStringify(prior.attendees_json ?? []) === stableStringify(row.attendees) &&
            (prior.calendar_name ?? null) === (row.calendar_name ?? null) &&
            (prior.location ?? null) === (row.location ?? null) &&
            stableStringify(prior.metadata_json ?? {}) === stableStringify(row.metadata));
    }
    async upsertMeetingNotes(userId, rows) {
        await this.ensureSchema();
        const exec = (0, user_scope_js_1.scopedExec)(userId, this.exec);
        const existing = await this.fetchExisting("meeting_notes", ["source", "source_ref", "event_id", "kind", "title", "occurred_at_ts", "duration_sec", "participants_json", "summary", "body", "transcript_spans_json", "topics_json"], userId, rows.filter((row) => row.source_ref !== null).map((row) => ({ source: row.source, source_ref: row.source_ref })));
        const byKey = new Map(existing.map((row) => [`${row.source}\u0000${row.source_ref}`, row]));
        let rowsWritten = 0;
        let dedupSkips = 0;
        for (const row of rows) {
            const prior = row.source_ref === null ? undefined : byKey.get(`${row.source}\u0000${row.source_ref}`);
            const textChanged = !prior || this.meetingTextChanged(prior, row);
            if (prior && !textChanged && this.meetingMetaUnchanged(prior, row)) {
                dedupSkips += 1;
                continue;
            }
            const conflict = row.source_ref === null
                ? "ON CONFLICT (id)"
                : "ON CONFLICT (user_id, source, source_ref) WHERE source_ref IS NOT NULL";
            const embeddingSet = textChanged ? ",\n  embedding = NULL" : "";
            await exec(`INSERT INTO meeting_notes(id, user_id, source, source_ref, event_id, kind, title, occurred_at_ts, duration_sec, participants_json, summary, body, transcript_spans_json, topics_json, created_at_ts, embedding)\n` +
                `VALUES (${(0, graph_db_js_1.q)(scopedRowId(row.id, userId))}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(row.source)}, ${litText(row.source_ref)}, ${litText(row.event_id)}, ${(0, graph_db_js_1.q)(row.kind)}, ${(0, graph_db_js_1.q)(row.title)}, ${litNum(row.occurred_at_ts, "occurred_at_ts")}, ${litNum(row.duration_sec, "duration_sec")}, ${litJson(row.participants)}, ${litText(row.summary)}, ${litText(row.body)}, ${litJson(row.transcript_spans)}, ${litJson(row.topics)}, ${this.nowTs()}, NULL)\n` +
                `${conflict} DO UPDATE SET\n` +
                `  event_id = EXCLUDED.event_id, kind = EXCLUDED.kind, title = EXCLUDED.title,\n` +
                `  occurred_at_ts = EXCLUDED.occurred_at_ts, duration_sec = EXCLUDED.duration_sec,\n` +
                `  participants_json = EXCLUDED.participants_json, summary = EXCLUDED.summary,\n` +
                `  body = EXCLUDED.body, transcript_spans_json = EXCLUDED.transcript_spans_json,\n` +
                `  topics_json = EXCLUDED.topics_json${embeddingSet};`);
            rowsWritten += 1;
        }
        return { rowsWritten, dedupSkips };
    }
    meetingTextChanged(prior, row) {
        return (prior.title !== row.title ||
            (prior.summary ?? null) !== (row.summary ?? null) ||
            (prior.body ?? null) !== (row.body ?? null) ||
            stableStringify(prior.transcript_spans_json ?? []) !== stableStringify(row.transcript_spans));
    }
    meetingMetaUnchanged(prior, row) {
        return ((prior.event_id ?? null) === (row.event_id ?? null) &&
            prior.kind === row.kind &&
            (prior.occurred_at_ts ?? null) === (row.occurred_at_ts ?? null) &&
            (prior.duration_sec ?? null) === (row.duration_sec ?? null) &&
            stableStringify(prior.participants_json ?? []) === stableStringify(row.participants) &&
            stableStringify(prior.topics_json ?? []) === stableStringify(row.topics));
    }
    async upsertInsights(userId, rows) {
        await this.ensureSchema();
        const exec = (0, user_scope_js_1.scopedExec)(userId, this.exec);
        const scopedRead = (0, user_scope_js_1.scopedQuery)(userId, this.query);
        const existing = await this.fetchExisting("user_insights", ["source", "source_ref", "insight_text", "topics_json", "occurred_at_ts", "last_accessed_ts"], userId, rows.filter((row) => row.source_ref !== null).map((row) => ({ source: row.source, source_ref: row.source_ref })));
        const byKey = new Map(existing.map((row) => [`${row.source}\u0000${row.source_ref}`, row]));
        // Historical text-versioned duplicates per natural key (see the prior-
        // exists branch below): count them so the prune only spends a round trip
        // on keys that actually hold more than one row.
        const keyCounts = new Map();
        for (const existingRow of existing) {
            const key = `${existingRow.source}\u0000${existingRow.source_ref}`;
            keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
        }
        let rowsWritten = 0;
        let dedupSkips = 0;
        const pendingRows = [];
        for (const row of rows) {
            const key = `${row.source}\u0000${row.source_ref}`;
            const prior = row.source_ref === null ? undefined : byKey.get(key);
            const hasDuplicates = (keyCounts.get(key) ?? 0) > 1;
            const textChanged = !prior || prior.insight_text !== row.insight_text;
            // Never dedup-skip a key that still holds duplicate rows: skipping
            // would leave the pair in place until some later ingest's text collides
            // it on ux_user_insights_dedup — take the update path and prune now.
            if (prior && !textChanged && !hasDuplicates && this.insightUnchanged(prior, row)) {
                dedupSkips += 1;
                continue;
            }
            pendingRows.push(row);
        }
        let lifecycleWarnings = [];
        let geminiCallsUsed = 0;
        let lifecycleDecisionCounts;
        let lifecycleRows = pendingRows;
        let lifecycleOwned = pendingRows.map(() => false);
        let postWriteSql = [];
        if (pendingRows.length > 0) {
            const lifecycle = await (0, insight_lifecycle_js_1.planInsightLifecycle)({
                userId,
                rows: pendingRows,
                query: scopedRead,
                llm: this.lifecycle?.llm === undefined ? defaultLifecycleLlm() : this.lifecycle.llm,
                embedRows: this.lifecycle?.embedRows === undefined ? defaultLifecycleEmbeddings() : this.lifecycle.embedRows,
                nowTs: this.nowTs,
                storeKind: this.lifecycle?.storeKind ?? graph_db_js_1.graphStoreKind,
                maxClassifiedRows: this.lifecycle?.maxClassifiedRows,
            });
            lifecycleRows = lifecycle.rows;
            lifecycleOwned = lifecycle.lifecycleOwned;
            postWriteSql = lifecycle.postWriteSql;
            lifecycleWarnings = lifecycle.warnings;
            geminiCallsUsed = lifecycle.geminiCallsUsed;
            lifecycleDecisionCounts = lifecycle.decisionCounts;
        }
        const writeSql = [];
        for (const [rowIndex, row] of lifecycleRows.entries()) {
            const key = `${row.source}\u0000${row.source_ref}`;
            const prior = row.source_ref === null ? undefined : byKey.get(key);
            const hasDuplicates = (keyCounts.get(key) ?? 0) > 1;
            const textChanged = !prior || prior.insight_text !== row.insight_text;
            const embeddingSet = textChanged ? ",\n  embedding = NULL" : "";
            const lifecycleSet = lifecycleOwned[rowIndex]
                ? `,\n  importance = ${litNum(row.importance, "importance")}, strength = ${litNum(row.strength, "strength")}`
                : "";
            if (prior) {
                // A row for this (user, source, source_ref) already exists — update it
                // in place by the natural key. Ids changed scheme over time (bare hash
                // → user-scoped hash), so the id is NOT a reliable conflict target for
                // historical rows, and the text-inclusive ux_user_insights_dedup index
                // would reject a same-text INSERT under a fresh id. Historical data
                // also holds text-versioned DUPLICATES per natural key (the text-
                // inclusive index permitted them) — prune to the newest row BEFORE the
                // UPDATE, as its OWN statement. A single-statement prune (DELETE in a
                // data-modifying CTE) does NOT protect the UPDATE: Postgres runs an
                // unreferenced modifying CTE only after the main statement completes
                // (ExecPostprocessPlan), and CTE effects are invisible to the main
                // query either way — so when the incoming text equaled a doomed
                // duplicate's text, the UPDATE hit ux_user_insights_dedup, the whole
                // statement (prune included) rolled back, and every later ingest
                // re-failed identically (F1: the ingest daemon loop).
                const keyWhere = `user_id = ${(0, graph_db_js_1.q)(userId)} AND source = ${(0, graph_db_js_1.q)(row.source)} AND source_ref = ${litText(row.source_ref)}`;
                const survivorSelect = `SELECT id FROM user_insights WHERE ${keyWhere}\n` +
                    `  ORDER BY created_at_ts DESC, id DESC LIMIT 1`;
                if (hasDuplicates) {
                    writeSql.push(`DELETE FROM user_insights WHERE ${keyWhere} AND id NOT IN (\n` +
                        `  ${survivorSelect}\n` +
                        `);`);
                }
                writeSql.push(`UPDATE user_insights SET\n` +
                    `  insight_text = ${(0, graph_db_js_1.q)(row.insight_text)}, topics_json = ${litJson(row.topics)},\n` +
                    `  occurred_at_ts = ${litNum(row.occurred_at_ts, "occurred_at_ts")}, last_accessed_ts = ${litNum(row.last_accessed_ts, "last_accessed_ts")}${lifecycleSet}${embeddingSet}\n` +
                    ` WHERE id IN (${survivorSelect});`);
            }
            else {
                writeSql.push(`INSERT INTO user_insights(id, user_id, source, source_ref, insight_text, topics_json, importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts, embedding)\n` +
                    `VALUES (${(0, graph_db_js_1.q)(scopedRowId(row.id, userId))}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(row.source)}, ${litText(row.source_ref)}, ${(0, graph_db_js_1.q)(row.insight_text)}, ${litJson(row.topics)}, ${litNum(row.importance, "importance")}, ${litNum(row.strength, "strength")}, ${litNum(row.occurred_at_ts, "occurred_at_ts")}, ${litNum(row.last_accessed_ts, "last_accessed_ts")}, ${this.nowTs()}, NULL)\n` +
                    `ON CONFLICT (id) DO UPDATE SET\n` +
                    `  insight_text = EXCLUDED.insight_text, topics_json = EXCLUDED.topics_json,\n` +
                    `  occurred_at_ts = EXCLUDED.occurred_at_ts, last_accessed_ts = EXCLUDED.last_accessed_ts${embeddingSet};`);
            }
            rowsWritten += 1;
        }
        writeSql.push(...postWriteSql);
        if (writeSql.length > 0) {
            await exec(writeSql.join("\n"));
        }
        return {
            rowsWritten,
            dedupSkips,
            warnings: lifecycleWarnings,
            geminiCallsUsed,
            lifecycleDecisionCounts,
        };
    }
    insightUnchanged(prior, row) {
        return (stableStringify(prior.topics_json ?? []) === stableStringify(row.topics) &&
            (prior.occurred_at_ts ?? null) === (row.occurred_at_ts ?? null) &&
            (prior.last_accessed_ts ?? null) === (row.last_accessed_ts ?? null));
    }
}
exports.PostgresIngestSink = PostgresIngestSink;
