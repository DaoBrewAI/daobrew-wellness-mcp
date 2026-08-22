"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEETING_BODY_EMBED_LIMIT = void 0;
exports.vectorLiteral = vectorLiteral;
exports.embedSweep = embedSweep;
const node_crypto_1 = require("node:crypto");
const graph_db_js_1 = require("../../graph-db.js");
const postgres_schema_js_1 = require("../postgres-schema.js");
exports.MEETING_BODY_EMBED_LIMIT = 12_000;
// transfer_records has no truncation clause: canonical triggers are short by
// construction, so FALSE AS truncated is exact, not an approximation.
const TABLE_CONFIG = {
    user_insights: {
        textSelect: "id, insight_text AS text, FALSE AS truncated",
        embeddingColumn: "embedding",
        nonNullGuard: "insight_text IS NOT NULL AND strength > 0",
    },
    meeting_notes: {
        textSelect: `id, COALESCE(NULLIF(summary,''), left(body, ${exports.MEETING_BODY_EMBED_LIMIT})) AS text, (NULLIF(summary,'') IS NULL AND length(body) > ${exports.MEETING_BODY_EMBED_LIMIT}) AS truncated`,
        embeddingColumn: "embedding",
        nonNullGuard: "COALESCE(NULLIF(summary,''), body) IS NOT NULL",
    },
    transfer_records: {
        textSelect: "id, trigger_text AS text, FALSE AS truncated",
        embeddingColumn: "trigger_embedding",
        nonNullGuard: "trigger_text IS NOT NULL",
    },
};
function vectorLiteral(values) {
    if (values.length !== 768)
        throw new Error(`Expected 768-d embedding, got ${values.length}`);
    return `'[${values.map((value) => Number(value).toPrecision(8)).join(",")}]'::halfvec`;
}
async function embedSweep(options) {
    const config = TABLE_CONFIG[options.table];
    if (!config) {
        throw new Error(`embedSweep supports ${Object.keys(TABLE_CONFIG).join(", ")}, got ${String(options.table)}`);
    }
    if (!options.exec && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        throw new Error("embedSweep requires DAOBREW_GRAPH_STORE=postgres; warm-tier embeddings are Postgres-only");
    }
    const exec = options.exec ?? graph_db_js_1.execSql;
    const query = options.query ?? graph_db_js_1.queryJson;
    const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const batchSize = Math.max(1, options.batchSize ?? 64);
    const limit = Math.max(1, options.limit ?? 512);
    const table = options.table;
    const startTs = nowTs();
    const warnings = [];
    const truncatedIds = [];
    let rowsEmbedded = 0;
    let geminiCallsUsed = 0;
    try {
        while (rowsEmbedded < limit) {
            const take = Math.min(batchSize, limit - rowsEmbedded);
            const rows = await query(`SELECT ${config.textSelect} FROM ${table} WHERE ${config.embeddingColumn} IS NULL AND ${config.nonNullGuard} ORDER BY created_at_ts LIMIT ${take}`);
            if (rows.length === 0)
                break;
            const vectors = await options.provider.embed(rows.map((row) => String(row.text ?? "")));
            // The provider makes one embedContent HTTP request per text, so the
            // daily-quota metric must count rows, not embed() invocations.
            geminiCallsUsed += rows.length;
            if (vectors.length !== rows.length) {
                throw new Error(`Provider returned ${vectors.length} vectors for ${rows.length} rows`);
            }
            const updateSql = rows
                .map((row, index) => `UPDATE ${table} SET ${config.embeddingColumn} = ${vectorLiteral(vectors[index])} WHERE id = ${(0, graph_db_js_1.q)(String(row.id))};`)
                .join("\n");
            await exec(updateSql);
            rowsEmbedded += rows.length;
            truncatedIds.push(...rows.filter((row) => row.truncated).map((row) => String(row.id)));
        }
        if (truncatedIds.length > 0) {
            warnings.push(`${truncatedIds.length} ${table} bodies truncated to ${exports.MEETING_BODY_EMBED_LIMIT} chars for embedding: ${truncatedIds.join(", ")}`);
        }
    }
    catch (err) {
        warnings.push(`embed sweep aborted: ${err?.message ?? err}`);
        throw err;
    }
    finally {
        let embeddingRowCount = 0;
        let warmDbBytes = 0;
        try {
            const counted = await query(`SELECT count(*) AS count FROM ${table} WHERE ${config.embeddingColumn} IS NOT NULL`);
            embeddingRowCount = Number(counted[0]?.count ?? 0);
            const sized = await query(postgres_schema_js_1.WARM_DB_BYTES_SQL);
            warmDbBytes = Number(sized[0]?.bytes ?? 0);
        }
        catch (err) {
            warnings.push(`metrics readback failed: ${err?.message ?? err}`);
        }
        const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
        await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
            `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(`embed_sweep:${table}`)}, ${durationMs}, ${rowsEmbedded}, 0, ${geminiCallsUsed}, ${embeddingRowCount}, ${warmDbBytes}, ${(0, graph_db_js_1.q)(JSON.stringify(warnings))}::jsonb, ${nowTs()});`);
    }
    return { rowsEmbedded, geminiCallsUsed, warnings };
}
