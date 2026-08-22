"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD = exports.SEMANTIC_MEMORY_EVIDENCE_RECENCY_TAU_DAYS = exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS = exports.SEMANTIC_RECENCY_HALF_LIFE_DAYS = exports.SEMANTIC_WEIGHTS = exports.SEMANTIC_SNIPPET_MAX = exports.SEMANTIC_K_DEFAULT = exports.SEMANTIC_STAGE1_LIMIT = void 0;
exports.semanticStage1Sql = semanticStage1Sql;
exports.semanticRecencyScore = semanticRecencyScore;
exports.semanticMemoryEvidenceRecencyScore = semanticMemoryEvidenceRecencyScore;
exports.rerankSemanticNeighbors = rerankSemanticNeighbors;
exports.rerankSemanticMemoryEvidence = rerankSemanticMemoryEvidence;
exports.retrieveSemanticNeighbors = retrieveSemanticNeighbors;
exports.retrieveSemanticMemoryEvidence = retrieveSemanticMemoryEvidence;
exports.attachSemanticContext = attachSemanticContext;
const graph_db_js_1 = require("../../graph-db.js");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const user_scope_js_1 = require("../user-scope.js");
exports.SEMANTIC_STAGE1_LIMIT = 40;
exports.SEMANTIC_K_DEFAULT = 8;
exports.SEMANTIC_SNIPPET_MAX = 200;
exports.SEMANTIC_WEIGHTS = { similarity: 0.8, recency: 0.2 };
exports.SEMANTIC_RECENCY_HALF_LIFE_DAYS = 30;
exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS = {
    similarity: 0.5,
    strength: 0.2,
    recency: 0.2,
    importance: 0.1,
};
exports.SEMANTIC_MEMORY_EVIDENCE_RECENCY_TAU_DAYS = 14;
exports.SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD = 0.6;
const TABLE_TEXT_SELECT = {
    user_insights: [
        "NULL AS title",
        "insight_text AS text",
        "importance",
        "strength",
        "source",
        "user_id",
        "insight_text",
        "topics_json",
        "occurred_at_ts",
        "last_accessed_ts",
        "created_at_ts",
    ].join(", "),
    meeting_notes: [
        "title",
        "COALESCE(NULLIF(summary,''), left(body, 400)) AS text",
        "0 AS importance",
        "NULL AS strength",
        "source",
        "user_id",
        "NULL AS insight_text",
        "NULL AS topics_json",
        "occurred_at_ts",
        "NULL AS last_accessed_ts",
        "created_at_ts",
    ].join(", "),
};
function resolveStage1Options(limitOrOptions) {
    if (typeof limitOrOptions === "number") {
        return { limit: limitOrOptions, endTs: undefined, mode: "default" };
    }
    return {
        limit: limitOrOptions?.limit ?? exports.SEMANTIC_STAGE1_LIMIT,
        endTs: limitOrOptions?.endTs,
        mode: limitOrOptions?.mode ?? "default",
    };
}
function semanticStage1Sql(table, userId, queryVector, limitOrOptions) {
    const vec = vectorLiteral(queryVector);
    const options = resolveStage1Options(limitOrOptions);
    const memoryEvidenceGuard = table === "user_insights" && options.mode === "memory_evidence"
        ? "\n   AND strength > 0"
        : "";
    const replayEndBound = options.endTs === undefined
        ? ""
        : `\n   AND COALESCE(occurred_at_ts, created_at_ts) <= ${Math.trunc(options.endTs)}`;
    return (`SELECT id, source_ref, ${TABLE_TEXT_SELECT[table]},\n` +
        `       COALESCE(occurred_at_ts, created_at_ts) AS ts,\n` +
        `       embedding <=> ${vec} AS distance\n` +
        `  FROM ${table}\n` +
        ` WHERE embedding IS NOT NULL AND user_id = ${(0, user_scope_js_1.scopedUserIdExpr)(userId)}` +
        `${memoryEvidenceGuard}${replayEndBound}\n` +
        ` ORDER BY embedding <=> ${vec}\n` +
        ` LIMIT ${options.limit};`);
}
function semanticRecencyScore(rowTs, nowTs) {
    if (rowTs === null || !Number.isFinite(rowTs))
        return 0;
    const ageDays = Math.max(0, (nowTs - rowTs) / 86400);
    return Math.pow(2, -ageDays / exports.SEMANTIC_RECENCY_HALF_LIFE_DAYS);
}
function semanticMemoryEvidenceRecencyScore(rowTs, nowTs) {
    if (rowTs === null || !Number.isFinite(rowTs))
        return 0;
    const ageDays = Math.max(0, (nowTs - rowTs) / 86400);
    return Math.exp(-ageDays / exports.SEMANTIC_MEMORY_EVIDENCE_RECENCY_TAU_DAYS);
}
function snippetOf(row) {
    const text = (row.text ?? "").trim();
    const combined = row.title && row.title.trim() ? `${row.title.trim()}: ${text}` : text;
    return combined.slice(0, exports.SEMANTIC_SNIPPET_MAX);
}
function parseJsonArray(value) {
    if (Array.isArray(value))
        return value.map((entry) => String(entry));
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    }
    catch {
        return [];
    }
}
function normalizeUnitInterval(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.min(1, Math.max(0, value));
}
function vectorLiteral(values) {
    if (values.length !== 768)
        throw new Error(`Expected 768-d embedding, got ${values.length}`);
    return `'[${values.map((value) => Number(value).toPrecision(8)).join(",")}]'::halfvec`;
}
function resolveSemanticGeminiApiKey() {
    if (process.env.GEMINI_API_KEY)
        return process.env.GEMINI_API_KEY;
    if (process.env.GOOGLE_API_KEY)
        return process.env.GOOGLE_API_KEY;
    const configFile = process.env.DAOBREW_CONFIG_FILE || (0, node_path_1.join)((0, node_os_1.homedir)(), ".daobrew", "config.json");
    if (!(0, node_fs_1.existsSync)(configFile))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(configFile, "utf8"));
        return typeof parsed.gemini_api_key === "string" && parsed.gemini_api_key.trim()
            ? parsed.gemini_api_key
            : null;
    }
    catch {
        return null;
    }
}
function nowTs(input) {
    return input.nowTs ? input.nowTs() : Math.floor(Date.now() / 1000);
}
function defaultEmbedText() {
    const apiKey = resolveSemanticGeminiApiKey();
    if (!apiKey)
        return null;
    return async (text) => {
        const { GeminiEmbeddingProvider } = await import("../embeddings/gemini.js");
        const provider = new GeminiEmbeddingProvider({ apiKey });
        return (await provider.embed([text]))[0];
    };
}
function warn(sink, message) {
    sink?.push(message);
}
function normalizePoolRows(table, rows) {
    return rows.map((row) => ({
        table,
        id: String(row.id),
        source_ref: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
        title: typeof row.title === "string" ? row.title : null,
        text: typeof row.text === "string" ? row.text : null,
        ts: row.ts === null || row.ts === undefined || !Number.isFinite(Number(row.ts)) ? null : Number(row.ts),
        distance: Number(row.distance) || 0,
        importance: row.importance === null || row.importance === undefined ? null : Number(row.importance),
        strength: row.strength === null || row.strength === undefined ? null : Number(row.strength),
        source: row.source === null || row.source === undefined ? null : String(row.source),
        user_id: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
        insight_text: row.insight_text === null || row.insight_text === undefined ? null : String(row.insight_text),
        topics_json: row.topics_json ?? null,
        occurred_at_ts: row.occurred_at_ts === null || row.occurred_at_ts === undefined ? null : Number(row.occurred_at_ts),
        last_accessed_ts: row.last_accessed_ts === null || row.last_accessed_ts === undefined ? null : Number(row.last_accessed_ts),
        created_at_ts: row.created_at_ts === null || row.created_at_ts === undefined ? null : Number(row.created_at_ts),
    }));
}
async function resolveQueryVector(input) {
    let vector = input.queryEmbedding;
    if (vector)
        return vector;
    const text = (input.queryText ?? "").trim();
    if (!text) {
        warn(input.warnings, "semantic retrieval degraded: no query text or embedding provided");
        return null;
    }
    const embed = input.embedText ?? defaultEmbedText();
    if (!embed) {
        warn(input.warnings, "semantic retrieval degraded: no Gemini key to embed the query (GEMINI_API_KEY / GOOGLE_API_KEY / gemini_api_key)");
        return null;
    }
    try {
        return await embed(text);
    }
    catch (err) {
        const message = String(err?.message ?? err);
        if (!input.embedText && /Gemini embeddings require/.test(message)) {
            warn(input.warnings, "semantic retrieval degraded: no Gemini key to embed the query (GEMINI_API_KEY / GOOGLE_API_KEY / gemini_api_key)");
            return null;
        }
        throw err;
    }
}
async function fetchSemanticPool(input, tables, mode) {
    if (!input.query && (0, graph_db_js_1.graphStoreKind)() !== "postgres") {
        warn(input.warnings, "semantic retrieval degraded: graph store is not postgres (Layer-1 embeddings are warm-tier only)");
        return null;
    }
    const vector = await resolveQueryVector(input);
    if (!vector)
        return null;
    const query = input.query ?? graph_db_js_1.queryJson;
    const pools = await Promise.all(tables.map((table) => query(semanticStage1Sql(table, input.userId, vector, {
        limit: exports.SEMANTIC_STAGE1_LIMIT,
        endTs: input.endTs,
        mode,
    }))));
    const pool = tables.flatMap((table, index) => normalizePoolRows(table, pools[index]));
    if (pool.length === 0) {
        warn(input.warnings, "semantic retrieval empty: zero embedded rows for this user — the path is working, just waiting for data");
        return [];
    }
    return pool;
}
function rerankSemanticNeighbors(rows, currentTs, k = exports.SEMANTIC_K_DEFAULT) {
    const scored = rows.map((row) => {
        const distance = Number(row.distance) || 0;
        const score = exports.SEMANTIC_WEIGHTS.similarity * (1 - distance) +
            exports.SEMANTIC_WEIGHTS.recency * semanticRecencyScore(row.ts ?? null, currentTs);
        return { row, distance, score };
    });
    scored.sort((a, b) => b.score - a.score ||
        a.distance - b.distance ||
        a.row.table.localeCompare(b.row.table) ||
        a.row.id.localeCompare(b.row.id));
    return scored.slice(0, Math.max(0, k)).map(({ row, distance }) => ({
        table: row.table,
        id: String(row.id),
        source_ref: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
        snippet: snippetOf(row),
        distance,
    }));
}
function memorySignalOf(row) {
    return {
        id: String(row.id),
        user_id: String(row.user_id ?? ""),
        source: String(row.source ?? ""),
        source_ref: row.source_ref === null || row.source_ref === undefined ? null : String(row.source_ref),
        graph_source_ref: `memory:${row.source_ref ?? row.id}`,
        insight_text: String(row.insight_text ?? row.text ?? ""),
        topics: parseJsonArray(row.topics_json),
        importance: normalizeUnitInterval(Number(row.importance) || 0),
        strength: normalizeUnitInterval(Number(row.strength) || 0),
        occurred_at_ts: row.occurred_at_ts === null || row.occurred_at_ts === undefined ? null : Number(row.occurred_at_ts),
        last_accessed_ts: row.last_accessed_ts === null || row.last_accessed_ts === undefined ? null : Number(row.last_accessed_ts),
        created_at_ts: Number(row.created_at_ts ?? row.ts ?? 0) || 0,
    };
}
function rerankSemanticMemoryEvidence(rows, currentTs, k = exports.SEMANTIC_K_DEFAULT) {
    const scored = rows
        .filter((row) => row.table === "user_insights")
        .map((row) => {
        const distance = Number(row.distance) || 0;
        const similarity = normalizeUnitInterval(1 - distance);
        const strength = normalizeUnitInterval(Number(row.strength) || 0);
        const importance = normalizeUnitInterval(Number(row.importance) || 0);
        const recency = semanticMemoryEvidenceRecencyScore(row.ts ?? null, currentTs);
        const semanticScore = exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.similarity * similarity +
            exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.strength * strength +
            exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.recency * recency +
            exports.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.importance * importance;
        return {
            row,
            distance,
            strength,
            importance,
            semanticScore,
        };
    });
    scored.sort((a, b) => b.semanticScore - a.semanticScore ||
        a.distance - b.distance ||
        b.strength - a.strength ||
        b.importance - a.importance ||
        (b.row.ts ?? 0) - (a.row.ts ?? 0) ||
        a.row.id.localeCompare(b.row.id));
    return scored.slice(0, Math.max(0, k)).map(({ row, distance, semanticScore }) => ({
        memory: memorySignalOf(row),
        semanticScore,
        distance,
    }));
}
async function retrieveSemanticNeighbors(input) {
    try {
        const pool = await fetchSemanticPool(input, input.tables ?? ["user_insights", "meeting_notes"], input.mode ?? "default");
        if (!pool || pool.length === 0)
            return [];
        return rerankSemanticNeighbors(pool, nowTs(input), input.k ?? exports.SEMANTIC_K_DEFAULT);
    }
    catch (err) {
        warn(input.warnings, `semantic retrieval degraded: ${err?.message ?? err}`);
        return [];
    }
}
async function retrieveSemanticMemoryEvidence(input) {
    try {
        const pool = await fetchSemanticPool(input, ["user_insights"], "memory_evidence");
        if (!pool || pool.length === 0)
            return [];
        return rerankSemanticMemoryEvidence(pool, nowTs(input), input.k ?? exports.SEMANTIC_K_DEFAULT);
    }
    catch (err) {
        warn(input.warnings, `semantic retrieval degraded: ${err?.message ?? err}`);
        return [];
    }
}
/**
 * Attach semantic neighbors to the armed root as `props_json.semantic_context`.
 *
 * BOUNDARY: context only — same honesty marker as memory_context (Reasoner.ts
 * memoryContextProps): this props fragment MUST NOT influence scoring, claims,
 * gate outcomes, or arming. It runs AFTER buildDelta and BEFORE the upsert
 * (the attachTransferCandidates pattern), so the reasoner never sees it —
 * influence is impossible by construction. Only row REFERENCES
 * (table:source_ref-or-id) and distances are attached; full text stays in the
 * warm tier. Degrades to "no semantic_context key at all" with warnings.
 */
async function attachSemanticContext(input) {
    const warnings = [];
    const root = input.delta.nodes.find((node) => node.id === input.delta.armed_root_cause.node_id);
    const props = (root?.props_json ?? {});
    const patternText = typeof props.selected_pattern === "string" ? props.selected_pattern.trim() : "";
    const queryText = [root?.title ?? "", patternText].map((s) => s.trim()).filter(Boolean).join(" ");
    if (!root || !queryText) {
        return { attached: 0, warnings };
    }
    const neighbors = await retrieveSemanticNeighbors({
        userId: input.userId,
        queryText,
        k: input.k,
        query: input.query,
        embedText: input.embedText,
        warnings,
        nowTs: input.nowTs,
    });
    if (neighbors.length === 0)
        return { attached: 0, warnings };
    root.props_json = {
        ...props,
        semantic_context: {
            query_text: queryText,
            neighbors: neighbors.map((neighbor) => ({
                ref: `${neighbor.table}:${neighbor.source_ref ?? neighbor.id}`,
                table: neighbor.table,
                id: neighbor.id,
                distance: neighbor.distance,
            })),
        },
    };
    return { attached: neighbors.length, warnings };
}
