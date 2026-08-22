"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const semantic_js_1 = require("../src/engine/retrieval/semantic.js");
const schema_js_1 = require("../src/engine/schema.js");
const SEMANTIC_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const NOW_TS = 1_700_000_000;
function unitVector() {
    const v = new Array(768).fill(0);
    v[0] = 1;
    return v;
}
function candidate(overrides = {}) {
    return {
        table: "user_insights",
        id: "ins-1",
        source_ref: "session.md:1",
        title: null,
        text: "pricing pressure keeps resurfacing",
        ts: NOW_TS - 3600,
        distance: 0.2,
        ...overrides,
    };
}
/** Blank out Gemini key env vars so "no key" degradation paths are testable
 *  even on shells that export a real key. */
async function withoutGeminiKeys(run) {
    const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY };
    const savedConfig = process.env.DAOBREW_CONFIG_FILE;
    const tempRoot = (0, node_path_1.resolve)(process.cwd(), ".test-tmp");
    (0, node_fs_1.mkdirSync)(tempRoot, { recursive: true });
    const configDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(tempRoot, "daobrew-semantic-config-"));
    const emptyConfig = (0, node_path_1.join)(configDir, "config.json");
    (0, node_fs_1.writeFileSync)(emptyConfig, "{}");
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.DAOBREW_CONFIG_FILE = emptyConfig;
    try {
        await run();
    }
    finally {
        (0, node_fs_1.rmSync)(configDir, { recursive: true, force: true });
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
        if (savedConfig === undefined)
            delete process.env.DAOBREW_CONFIG_FILE;
        else
            process.env.DAOBREW_CONFIG_FILE = savedConfig;
    }
}
function sqliteCliPresent() {
    try {
        (0, node_child_process_1.execFileSync)("sqlite3", ["-version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
async function withSqliteStore(run) {
    const tempRoot = (0, node_path_1.resolve)(process.cwd(), ".test-tmp");
    (0, node_fs_1.mkdirSync)(tempRoot, { recursive: true });
    const tmpDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(tempRoot, "daobrew-semantic-"));
    const dbPath = (0, node_path_1.join)(tmpDir, "sentinel-graph.db");
    const previousDb = process.env.DAOBREW_GRAPH_DB;
    const previousStore = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    process.env.DAOBREW_GRAPH_DB = dbPath;
    try {
        (0, schema_js_1.ensureSchema)(dbPath);
        await run();
    }
    finally {
        if (previousDb === undefined)
            delete process.env.DAOBREW_GRAPH_DB;
        else
            process.env.DAOBREW_GRAPH_DB = previousDb;
        if (previousStore === undefined)
            delete process.env.DAOBREW_GRAPH_STORE;
        else
            process.env.DAOBREW_GRAPH_STORE = previousStore;
        (0, node_fs_1.rmSync)(tmpDir, { recursive: true, force: true });
    }
}
(0, node_test_1.describe)("semantic stage-1 SQL (pure ANN)", () => {
    (0, node_test_1.it)("orders by bare `embedding <=> $vec`, scopes by user_id, and caps the pool at 40", () => {
        const sql = (0, semantic_js_1.semanticStage1Sql)("user_insights", SEMANTIC_TEST_USER, unitVector());
        strict_1.default.match(sql, /ORDER BY embedding <=> '\[/);
        strict_1.default.match(sql, /embedding IS NOT NULL/);
        strict_1.default.match(sql, new RegExp(`user_id = '${SEMANTIC_TEST_USER}'`));
        strict_1.default.match(sql, new RegExp(`LIMIT ${semantic_js_1.SEMANTIC_STAGE1_LIMIT}`));
        strict_1.default.equal(semantic_js_1.SEMANTIC_STAGE1_LIMIT, 40);
        // Pure ANN: the ORDER BY carries no weights/arithmetic beyond the operator.
        strict_1.default.ok(!/ORDER BY.*[+*]/.test(sql), "stage-1 ORDER BY must stay pure for the HNSW index");
    });
    (0, node_test_1.it)("selects table-appropriate text (insight_text vs summary/body) with a shared column shape", () => {
        const insights = (0, semantic_js_1.semanticStage1Sql)("user_insights", "u", unitVector());
        const meetings = (0, semantic_js_1.semanticStage1Sql)("meeting_notes", "u", unitVector());
        strict_1.default.match(insights, /insight_text/);
        strict_1.default.match(meetings, /NULLIF\(summary,''\)/);
        for (const sql of [insights, meetings]) {
            strict_1.default.match(sql, /AS distance/);
            strict_1.default.match(sql, /AS ts/);
            strict_1.default.match(sql, /source_ref/);
        }
    });
    (0, node_test_1.it)("escapes a hostile userId", () => {
        const sql = (0, semantic_js_1.semanticStage1Sql)("user_insights", "a'; DROP TABLE user_insights; --", unitVector());
        strict_1.default.match(sql, /user_id = 'a''; DROP TABLE user_insights; --'/);
    });
    (0, node_test_1.it)("adds the replay bound and active-memory filter only for semantic memory evidence mode", () => {
        const sql = (0, semantic_js_1.semanticStage1Sql)("user_insights", SEMANTIC_TEST_USER, unitVector(), {
            mode: "memory_evidence",
            endTs: 1_234,
        });
        strict_1.default.match(sql, /strength > 0/);
        strict_1.default.match(sql, /COALESCE\(occurred_at_ts, created_at_ts\) <= 1234/);
        const baseline = (0, semantic_js_1.semanticStage1Sql)("user_insights", SEMANTIC_TEST_USER, unitVector());
        strict_1.default.doesNotMatch(baseline, /strength > 0/);
        strict_1.default.doesNotMatch(baseline, /COALESCE\(occurred_at_ts, created_at_ts\) <= 1234/);
    });
});
(0, node_test_1.describe)("semantic stage-2 rerank (pure, deterministic)", () => {
    (0, node_test_1.it)("blends similarity with recency using the exported weights", () => {
        const fresh = candidate({ id: "fresh", ts: NOW_TS, distance: 0.3 });
        const stale = candidate({ id: "stale", ts: NOW_TS - 365 * 86400, distance: 0.3 });
        const [first, second] = (0, semantic_js_1.rerankSemanticNeighbors)([stale, fresh], NOW_TS);
        strict_1.default.equal(first.id, "fresh");
        strict_1.default.equal(second.id, "stale");
        // Distance still dominates: a much closer stale row beats a far fresh row.
        const close = candidate({ id: "close", ts: NOW_TS - 365 * 86400, distance: 0.05 });
        const far = candidate({ id: "far", ts: NOW_TS, distance: 0.9 });
        strict_1.default.equal((0, semantic_js_1.rerankSemanticNeighbors)([far, close], NOW_TS)[0].id, "close");
        strict_1.default.ok(semantic_js_1.SEMANTIC_WEIGHTS.similarity > semantic_js_1.SEMANTIC_WEIGHTS.recency);
    });
    (0, node_test_1.it)("recency score is 1 now, halves every half-life, and is 0 for missing timestamps", () => {
        strict_1.default.equal((0, semantic_js_1.semanticRecencyScore)(NOW_TS, NOW_TS), 1);
        strict_1.default.ok(Math.abs((0, semantic_js_1.semanticRecencyScore)(NOW_TS - 30 * 86400, NOW_TS) - 0.5) < 1e-9);
        strict_1.default.equal((0, semantic_js_1.semanticRecencyScore)(null, NOW_TS), 0);
        // Future timestamps clamp to age 0 rather than exceeding 1.
        strict_1.default.equal((0, semantic_js_1.semanticRecencyScore)(NOW_TS + 86400, NOW_TS), 1);
    });
    (0, node_test_1.it)("caps at k, is deterministic on ties, and truncates snippets to 200 chars", () => {
        const rows = [];
        for (let i = 0; i < 20; i++) {
            rows.push(candidate({ id: `ins-${String(i).padStart(2, "0")}`, distance: 0.5, ts: NOW_TS }));
        }
        const reranked = (0, semantic_js_1.rerankSemanticNeighbors)(rows, NOW_TS);
        strict_1.default.equal(reranked.length, semantic_js_1.SEMANTIC_K_DEFAULT);
        // Ties resolve by id, so identical inputs always serve identical outputs.
        strict_1.default.deepEqual(reranked.map((r) => r.id), rows.slice(0, semantic_js_1.SEMANTIC_K_DEFAULT).map((r) => r.id));
        const long = (0, semantic_js_1.rerankSemanticNeighbors)([candidate({ title: "Weekly pricing sync", text: "x".repeat(500) })], NOW_TS);
        strict_1.default.ok(long[0].snippet.length <= semantic_js_1.SEMANTIC_SNIPPET_MAX);
        strict_1.default.match(long[0].snippet, /^Weekly pricing sync: x/);
        strict_1.default.equal((0, semantic_js_1.rerankSemanticNeighbors)(rows, NOW_TS, 3).length, 3);
    });
});
(0, node_test_1.describe)("retrieveSemanticNeighbors", () => {
    const embedded = unitVector();
    function servedQuery(rowsByTable) {
        return async (sql) => {
            if (sql.includes("FROM user_insights"))
                return rowsByTable.user_insights ?? [];
            if (sql.includes("FROM meeting_notes"))
                return rowsByTable.meeting_notes ?? [];
            throw new Error(`unexpected sql: ${sql}`);
        };
    }
    (0, node_test_1.it)("embeds queryText, pools both tables, and returns reranked references", async () => {
        const embedCalls = [];
        const warnings = [];
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryText: "pricing pressure overdrive",
            warnings,
            nowTs: () => NOW_TS,
            embedText: async (text) => {
                embedCalls.push(text);
                return embedded;
            },
            query: servedQuery({
                user_insights: [
                    { id: "ins-1", source_ref: "s.md:1", title: null, text: "pricing pressure again", ts: NOW_TS - 60, distance: 0.1 },
                ],
                meeting_notes: [
                    { id: "mtg-1", source_ref: "note-9", title: "Pricing sync", text: "walked the tiers", ts: NOW_TS - 120, distance: 0.4 },
                ],
            }),
        });
        strict_1.default.deepEqual(embedCalls, ["pricing pressure overdrive"]);
        strict_1.default.equal(rows.length, 2);
        strict_1.default.equal(rows[0].table, "user_insights");
        strict_1.default.equal(rows[0].id, "ins-1");
        strict_1.default.equal(rows[0].source_ref, "s.md:1");
        strict_1.default.ok(rows[0].distance < rows[1].distance);
        strict_1.default.deepEqual(warnings, []);
    });
    (0, node_test_1.it)("skips the embed call when queryEmbedding is provided", async () => {
        let embedCalled = false;
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryEmbedding: embedded,
            embedText: async () => {
                embedCalled = true;
                return embedded;
            },
            nowTs: () => NOW_TS,
            query: servedQuery({
                user_insights: [{ id: "i", source_ref: null, title: null, text: "t", ts: NOW_TS, distance: 0.2 }],
            }),
        });
        strict_1.default.equal(embedCalled, false);
        strict_1.default.equal(rows.length, 1);
    });
    (0, node_test_1.it)("caps k", async () => {
        const many = Array.from({ length: 30 }, (_, i) => ({
            id: `i-${String(i).padStart(2, "0")}`, source_ref: null, title: null, text: "t", ts: NOW_TS, distance: 0.2,
        }));
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryEmbedding: embedded,
            k: 5,
            nowTs: () => NOW_TS,
            query: servedQuery({ user_insights: many }),
        });
        strict_1.default.equal(rows.length, 5);
    });
    // --- degradation paths: EMPTY array, never a throw ------------------------
    (0, node_test_1.it)("degrades to empty with a warning when no Gemini key can embed the query", async () => {
        await withoutGeminiKeys(async () => {
            const warnings = [];
            const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
                userId: "u1",
                queryText: "anything",
                warnings,
                query: servedQuery({}),
                // no embedText injected and no GEMINI key in the test env
            });
            strict_1.default.deepEqual(rows, []);
            strict_1.default.equal(warnings.length, 1);
            strict_1.default.match(warnings[0], /semantic retrieval degraded/);
            strict_1.default.match(warnings[0], /Gemini/i);
        });
    });
    (0, node_test_1.it)("degrades to empty with a warning on a non-postgres store", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withSqliteStore(async () => {
            const warnings = [];
            const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
                userId: "u1",
                queryText: "anything",
                warnings,
                embedText: async () => embedded,
                // no query injected -> falls back to the store, which is sqlite here
            });
            strict_1.default.deepEqual(rows, []);
            strict_1.default.equal(warnings.length, 1);
            strict_1.default.match(warnings[0], /semantic retrieval degraded/);
            strict_1.default.match(warnings[0], /postgres/i);
        });
    });
    (0, node_test_1.it)("degrades to empty with a warning when zero embedded rows exist (alive, waiting for data)", async () => {
        const warnings = [];
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryText: "anything",
            warnings,
            embedText: async () => embedded,
            query: servedQuery({}),
        });
        strict_1.default.deepEqual(rows, []);
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.match(warnings[0], /semantic retrieval empty/);
    });
    (0, node_test_1.it)("degrades to empty with a warning when the embedding call fails", async () => {
        const warnings = [];
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryText: "anything",
            warnings,
            embedText: async () => {
                throw new Error("quota exhausted");
            },
            query: servedQuery({}),
        });
        strict_1.default.deepEqual(rows, []);
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.match(warnings[0], /semantic retrieval degraded/);
        strict_1.default.match(warnings[0], /quota exhausted/);
    });
    (0, node_test_1.it)("degrades to empty with a warning when the ANN query itself fails", async () => {
        const warnings = [];
        const rows = await (0, semantic_js_1.retrieveSemanticNeighbors)({
            userId: "u1",
            queryEmbedding: embedded,
            warnings,
            query: async () => {
                throw new Error("relation does not exist");
            },
        });
        strict_1.default.deepEqual(rows, []);
        strict_1.default.equal(warnings.length, 1);
        strict_1.default.match(warnings[0], /semantic retrieval degraded/);
    });
});
(0, node_test_1.describe)("semantic memory evidence retrieval", () => {
    const embedded = unitVector();
    function memoryCandidate(overrides = {}) {
        return {
            table: "user_insights",
            id: "mem-1",
            user_id: "u1",
            source: "claude_project_session",
            source_ref: "session.md:1",
            title: null,
            text: "wedge decision keeps slipping",
            insight_text: "wedge decision keeps slipping",
            topics_json: ["#wedge"],
            ts: NOW_TS - 3600,
            occurred_at_ts: NOW_TS - 3600,
            last_accessed_ts: null,
            created_at_ts: NOW_TS - 7200,
            distance: 0.2,
            importance: 0.7,
            strength: 0.8,
            ...overrides,
        };
    }
    (0, node_test_1.it)("uses the §5B weighted rerank and clamps out-of-range strength values", () => {
        const stronger = memoryCandidate({ id: "stronger", distance: 0.18, strength: 5, importance: 0.9 });
        const weaker = memoryCandidate({ id: "weaker", distance: 0.12, strength: -2, importance: 0.1, ts: NOW_TS - 60 * 86400 });
        const reranked = (0, semantic_js_1.rerankSemanticMemoryEvidence)([weaker, stronger], NOW_TS, 2);
        strict_1.default.equal(reranked[0].memory.id, "stronger");
        strict_1.default.equal(reranked[1].memory.id, "weaker");
        strict_1.default.ok(reranked[0].semanticScore > reranked[1].semanticScore);
        strict_1.default.ok(semantic_js_1.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.similarity > semantic_js_1.SEMANTIC_MEMORY_EVIDENCE_WEIGHTS.importance);
        strict_1.default.ok(reranked[0].semanticScore >= semantic_js_1.SEMANTIC_MEMORY_EVIDENCE_MATCH_THRESHOLD);
        const capped = (0, semantic_js_1.rerankSemanticMemoryEvidence)([
            memoryCandidate({ id: "capped", strength: 4, distance: 0.2, importance: 0.5 }),
            memoryCandidate({ id: "unit", strength: 1, distance: 0.2, importance: 0.5 }),
        ], NOW_TS, 2);
        const byId = new Map(capped.map((entry) => [entry.memory.id, entry.semanticScore]));
        strict_1.default.ok(Math.abs((byId.get("capped") ?? 0) - (byId.get("unit") ?? 0)) < 1e-9);
    });
    (0, node_test_1.it)("retrieves bounded within-user memory evidence with weighted scores", async () => {
        const queries = [];
        const rows = await (0, semantic_js_1.retrieveSemanticMemoryEvidence)({
            userId: "u1",
            queryEmbedding: embedded,
            endTs: NOW_TS - 10,
            nowTs: () => NOW_TS,
            query: async (sql) => {
                queries.push(sql);
                return [memoryCandidate()];
            },
        });
        strict_1.default.equal(rows.length, 1);
        strict_1.default.equal(rows[0].memory.graph_source_ref, "memory:session.md:1");
        strict_1.default.equal(rows[0].memory.topics[0], "#wedge");
        strict_1.default.ok(rows[0].semanticScore > 0);
        strict_1.default.match(queries[0], new RegExp(`COALESCE\\(occurred_at_ts, created_at_ts\\) <= ${NOW_TS - 10}`));
        strict_1.default.match(queries[0], /strength > 0/);
    });
});
(0, node_test_1.describe)("attachSemanticContext (context-only root attachment)", () => {
    function armedDelta() {
        return {
            user_id: "u1",
            nodes: [{
                    id: "root-1",
                    kind: "ghost",
                    title: "Pricing thread under OVERDRIVE",
                    source: "reasoner",
                    source_ref: "reasoner:root",
                    props_json: { status: "suggested", selected_pattern: "overdrive" },
                }],
            edges: [],
            root_armed: true,
            armed_root_cause: { node_id: "root-1", confidence: 0.7, root_cause_class: "productivity", brief: {} },
        };
    }
    (0, node_test_1.it)("attaches neighbor REFERENCES (table:source_ref/id + distance), never text snippets", async () => {
        const delta = armedDelta();
        const queries = [];
        const result = await (0, semantic_js_1.attachSemanticContext)({
            delta,
            userId: "u1",
            nowTs: () => NOW_TS,
            embedText: async () => unitVector(),
            query: async (sql) => {
                queries.push(sql);
                if (sql.includes("FROM user_insights")) {
                    return [{ id: "ins-1", source_ref: "s.md:1", title: null, text: "secret full text", ts: NOW_TS, distance: 0.1 }];
                }
                return [{ id: "mtg-1", source_ref: null, title: "Pricing sync", text: "body", ts: NOW_TS, distance: 0.3 }];
            },
        });
        strict_1.default.equal(result.attached, 2);
        const props = delta.nodes[0].props_json;
        const context = props.semantic_context;
        strict_1.default.ok(context, "semantic_context attached to the armed root");
        strict_1.default.equal(context.neighbors.length, 2);
        strict_1.default.deepEqual(context.neighbors[0], {
            ref: "user_insights:s.md:1",
            table: "user_insights",
            id: "ins-1",
            distance: 0.1,
        });
        // source_ref-less rows fall back to table:id references.
        strict_1.default.equal(context.neighbors[1].ref, "meeting_notes:mtg-1");
        strict_1.default.ok(!JSON.stringify(context).includes("secret full text"), "full text must not reach root props");
        // Query text came from the armed root's title/pattern.
        strict_1.default.match(String(context.query_text), /Pricing thread under OVERDRIVE/);
        strict_1.default.match(String(context.query_text), /overdrive/);
        // Existing props survive the attach.
        strict_1.default.equal(props.status, "suggested");
    });
    (0, node_test_1.it)("attaches nothing (no key) but reports the degradation warning", async () => {
        await withoutGeminiKeys(async () => {
            const delta = armedDelta();
            const result = await (0, semantic_js_1.attachSemanticContext)({
                delta,
                userId: "u1",
                query: async () => [],
                // no embedText and no key in the env
            });
            strict_1.default.equal(result.attached, 0);
            strict_1.default.equal(delta.nodes[0].props_json.semantic_context, undefined);
            strict_1.default.equal(result.warnings.length, 1);
            strict_1.default.match(result.warnings[0], /semantic retrieval degraded/);
        });
    });
    (0, node_test_1.it)("skips watching-shaped deltas without a resolvable root text", async () => {
        const delta = armedDelta();
        delta.nodes = [];
        const result = await (0, semantic_js_1.attachSemanticContext)({ delta, userId: "u1", query: async () => [] });
        strict_1.default.equal(result.attached, 0);
        strict_1.default.deepEqual(result.warnings, []);
    });
});
(0, node_test_1.describe)("run.ts semantic wiring (alive on sqlite, degrades loudly)", () => {
    (0, node_test_1.it)("demo non-dry sqlite run stays green and never gains semantic_context (postgres-only path)", async (t) => {
        if (!sqliteCliPresent())
            return t.skip("sqlite3 CLI not available");
        await withSqliteStore(async () => {
            const { runEngineOnce } = await import("../src/engine/run.js");
            const result = await runEngineOnce({ once: true, demo: true, userId: SEMANTIC_TEST_USER });
            strict_1.default.equal(result.status, "written");
            // The attach lives behind the postgres guard; sqlite deltas stay byte-identical.
            strict_1.default.ok(!result.warnings.some((w) => /semantic context attach failed/.test(w)));
        });
    });
});
(0, node_test_1.describe)("semantic stage-1 RLS scoping (F1 One-Time-Filter regression)", () => {
    function withGraphStore(kind, fn) {
        const previous = process.env.DAOBREW_GRAPH_STORE;
        process.env.DAOBREW_GRAPH_STORE = kind;
        try {
            return fn();
        }
        finally {
            if (previous === undefined)
                delete process.env.DAOBREW_GRAPH_STORE;
            else
                process.env.DAOBREW_GRAPH_STORE = previous;
        }
    }
    (0, node_test_1.it)("references the scope row under postgres, never the literal", () => {
        // In postgres mode the stage-1 SQL runs through scopedQuery(userId); a
        // `user_id = '<literal>'` in the body lets the planner fold the RLS qual
        // into a One-Time Filter evaluated at executor startup — before the
        // lateral scope row has run set_config — so a fresh pooled backend
        // silently returns zero rows (live bug F1).
        withGraphStore("postgres", () => {
            const sql = (0, semantic_js_1.semanticStage1Sql)("user_insights", SEMANTIC_TEST_USER, unitVector());
            strict_1.default.ok(sql.includes("user_id = __daobrew_scope.uid"), `postgres stage-1 SQL must filter user_id via the scope row, got: ${sql}`);
            strict_1.default.ok(!sql.includes(`user_id = '${SEMANTIC_TEST_USER}'`), `postgres stage-1 SQL must NOT compare user_id to a literal, got: ${sql}`);
        });
    });
    (0, node_test_1.it)("keeps the escaped literal under sqlite (plain queryJson has no scope row)", () => {
        withGraphStore("sqlite", () => {
            const sql = (0, semantic_js_1.semanticStage1Sql)("user_insights", SEMANTIC_TEST_USER, unitVector());
            strict_1.default.ok(sql.includes(`user_id = '${SEMANTIC_TEST_USER}'`), `sqlite stage-1 SQL must keep the escaped literal, got: ${sql}`);
            strict_1.default.ok(!sql.includes("__daobrew_scope.uid"), `sqlite has no scope row — the reference would be an unknown-column error, got: ${sql}`);
        });
    });
});
