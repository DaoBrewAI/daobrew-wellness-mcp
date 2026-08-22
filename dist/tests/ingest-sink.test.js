"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const sink_js_1 = require("../src/engine/ingest/sink.js");
const claudeMemory_js_1 = require("../src/engine/sources/claudeMemory.js");
(0, node_test_1.describe)("PostgresIngestSink", () => {
    (0, node_test_1.it)("runs a read-only schema readiness probe before ingesting", async () => {
        const statements = [];
        const queries = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async (sql) => {
                queries.push(sql);
                if (/SELECT 1 FROM events LIMIT 0/.test(sql))
                    return [];
                return [{ inserted: 1, updated: 0 }];
            },
            nowTs: () => 1234,
        });
        const result = await sink.upsertEvents("u1", [{
                id: "evt_ddl",
                source: "eventkit",
                source_ref: "calendar:ddl",
                title: "After denied DDL",
                start_ts: 100,
                end_ts: null,
                all_day: false,
                attendee_count: 0,
                attendees: [],
                calendar_name: null,
                location: null,
                metadata: {},
            }]);
        assert.strictEqual(result.rowsWritten, 1);
        assert.strictEqual(queries[0], "SELECT 1 FROM events LIMIT 0;");
        assert.doesNotMatch(queries[0], /CREATE|ALTER|DROP|set_config/i);
        assert.match(statements.join("\n"), /INSERT INTO events/);
    });
    (0, node_test_1.it)("schema readiness failures rethrow and are retryable (no cached rejection)", async () => {
        let failReadiness = true;
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async () => { },
            query: async (sql) => {
                if (/SELECT 1 FROM events LIMIT 0/.test(sql) && failReadiness) {
                    throw new Error("relation events does not exist");
                }
                return [{ inserted: 1, updated: 0 }];
            },
            nowTs: () => 1234,
        });
        const row = {
            id: "evt_retry", source: "eventkit", source_ref: "calendar:r", title: "t",
            start_ts: 1, end_ts: null, all_day: false, attendee_count: 0,
            attendees: [], calendar_name: null, location: null, metadata: {},
        };
        await assert.rejects(() => sink.upsertEvents("u1", [row]), /run Alembic upgrade head first/);
        failReadiness = false; // transient cleared — the next ingest must retry, not replay
        const result = await sink.upsertEvents("u1", [row]);
        assert.strictEqual(result.rowsWritten, 1);
    });
    (0, node_test_1.it)("user-scopes row ids so two identities never collide on the bare PK", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{ inserted: 1, updated: 0 }],
            nowTs: () => 1234,
        });
        const row = {
            id: "evt_stable", source: "eventkit", source_ref: "calendar:x", title: "t",
            start_ts: 1, end_ts: null, all_day: false, attendee_count: 0,
            attendees: [], calendar_name: null, location: null, metadata: {},
        };
        await sink.upsertEvents("dbk_userA", [row]);
        await sink.upsertEvents("dbk_userB", [row]);
        const inserts = statements.filter((s) => /INSERT INTO events/.test(s));
        const idA = inserts[0].match(/'(evt_stable_u[0-9a-f]{8})'/)?.[1];
        const idB = inserts[1].match(/'(evt_stable_u[0-9a-f]{8})'/)?.[1];
        assert.ok(idA && idB, "both inserts carry user-suffixed ids");
        assert.notStrictEqual(idA, idB);
        // legacy scheme untouched for "local"
        await sink.upsertEvents("local", [row]);
        assert.match(statements[statements.length - 1], /'evt_stable'/);
    });
    (0, node_test_1.it)("upserts events idempotently and reports dedup skips", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{ inserted: 1, updated: 0 }],
            nowTs: () => 1234,
        });
        const result = await sink.upsertEvents("u1", [{
                id: "evt_1",
                source: "eventkit",
                source_ref: "calendar:1",
                title: "Design review",
                start_ts: 100,
                end_ts: 200,
                all_day: false,
                attendee_count: 2,
                attendees: [{ email: "a@example.com" }],
                calendar_name: "Work",
                location: "Zoom",
                metadata: { raw: true },
            }]);
        assert.strictEqual(result.rowsWritten, 1);
        assert.strictEqual(result.dedupSkips, 0);
        assert.match(statements.join("\n"), /INSERT INTO events/);
        assert.match(statements.join("\n"), /ON CONFLICT ON CONSTRAINT ux_events_dedup|ON CONFLICT \(user_id, source, source_ref\)/);
    });
    (0, node_test_1.it)("writes embedding null for meeting notes and insights", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{ inserted: 1, updated: 0 }],
            nowTs: () => 1234,
        });
        await sink.upsertMeetingNotes("u1", [{
                id: "meeting_1",
                source: "granola",
                source_ref: "note:1",
                event_id: null,
                kind: "meeting",
                title: "Demo sync",
                occurred_at_ts: 100,
                duration_sec: 1200,
                participants: [],
                summary: "Discussed demo",
                body: "Transcript body",
                transcript_spans: [{ idx: 0, text: "hello" }],
                topics: ["#demo"],
            }]);
        await sink.upsertInsights("u1", [{
                id: "insight_1",
                source: "claude_sessions",
                source_ref: "file.jsonl:1",
                insight_text: "User prefers reviewable evidence trails.",
                topics: ["#memory"],
                importance: 0.8,
                strength: 1,
                occurred_at_ts: null,
                last_accessed_ts: null,
            }]);
        assert.match(statements.join("\n"), /embedding\s*\)/);
        assert.match(statements.join("\n"), /NULL/);
    });
    (0, node_test_1.it)("refreshes a changed-file session insight via id conflict and clears embedding", async () => {
        // Regression: session-file insights have a file-stable id, so when the
        // file content (and thus insight_text) changes, conflicting on the
        // text-inclusive dedup index misses and the INSERT dies on the primary
        // key. The upsert must conflict on (id) and refresh the text instead.
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{
                    source: "claude_project_session",
                    source_ref: "/sessions/file.jsonl",
                    insight_text: "Claude Code project session: old task.",
                    topics_json: ["#claude-session"],
                    importance: 0.78,
                    strength: 1,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                }],
            nowTs: () => 1234,
        });
        const result = await sink.upsertInsights("u1", [{
                id: "claude_session_abc123",
                source: "claude_project_session",
                source_ref: "/sessions/file.jsonl",
                insight_text: "Claude Code project session: old task. Outcome: new outcome.",
                topics: ["#claude-session"],
                importance: 0.78,
                strength: 1,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            }]);
        assert.strictEqual(result.rowsWritten, 1);
        assert.strictEqual(result.dedupSkips, 0);
        // Prior row exists -> natural-key UPDATE targeting the newest row, never
        // an INSERT: historical rows carry old-scheme ids and the text-inclusive
        // dedup index rejects same-text INSERTs under fresh ids. With a single
        // prior row there is nothing to prune — no DELETE round trip.
        const updateSql = statements.find((sql) => sql.includes("UPDATE user_insights SET"));
        assert.ok(updateSql, "expected a natural-key UPDATE statement");
        assert.match(updateSql, /WHERE id IN \(SELECT id FROM user_insights/);
        assert.match(updateSql, /ORDER BY created_at_ts DESC, id DESC LIMIT 1/);
        assert.doesNotMatch(updateSql, /DELETE FROM/);
        assert.strictEqual(statements.some((sql) => sql.includes("DELETE FROM user_insights")), false);
        assert.match(updateSql, /embedding = NULL/);
    });
    (0, node_test_1.it)("prunes historical duplicate rows in a separate statement BEFORE the survivor UPDATE", async () => {
        // Live regression (F1): user_insights holds historical text-versioned
        // duplicates per natural key (the text-inclusive ux_user_insights_dedup
        // index permitted them). The old single-statement form put the prune
        // DELETE in an unreferenced data-modifying CTE — Postgres executes those
        // AFTER the main UPDATE completes (ExecPostprocessPlan), and their
        // effects are invisible to it either way — so whenever the incoming
        // insight_text equaled a doomed duplicate's text, the UPDATE violated
        // ux_user_insights_dedup, the WHOLE statement (prune included) rolled
        // back, and every subsequent ingest re-failed identically. The prune
        // must therefore be its own statement, issued before the UPDATE.
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            // Two prior rows for the same natural key: the historical pair.
            // Incoming text below equals the OLDER (doomed) row's text — the
            // exact shape that made the live daemon fail every cycle.
            query: async () => [
                {
                    source: "claude_project_session",
                    source_ref: "/sessions/file.jsonl",
                    insight_text: "Claude Code project session: stable task.",
                    topics_json: ["#claude-session"],
                    importance: 0.78,
                    strength: 1,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                },
                {
                    source: "claude_project_session",
                    source_ref: "/sessions/file.jsonl",
                    insight_text: "Claude Code project session: transient task.",
                    topics_json: ["#claude-session"],
                    importance: 0.78,
                    strength: 1,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                },
            ],
            nowTs: () => 1234,
        });
        const result = await sink.upsertInsights("u1", [{
                id: "claude_session_abc123",
                source: "claude_project_session",
                source_ref: "/sessions/file.jsonl",
                insight_text: "Claude Code project session: stable task.",
                topics: ["#claude-session"],
                importance: 0.78,
                strength: 1,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            }]);
        assert.strictEqual(result.rowsWritten, 1);
        assert.strictEqual(result.dedupSkips, 0);
        assert.strictEqual(statements.length, 1, "the prune and survivor update share one scoped transaction");
        const deleteIdx = statements[0].indexOf("DELETE FROM user_insights");
        const updateIdx = statements[0].indexOf("UPDATE user_insights SET");
        assert.ok(deleteIdx >= 0, "expected a standalone duplicate-prune DELETE statement");
        assert.ok(updateIdx >= 0, "expected a survivor UPDATE statement");
        assert.ok(deleteIdx < updateIdx, "prune DELETE must run before the survivor UPDATE");
        assert.doesNotMatch(statements[0].slice(updateIdx), /DELETE FROM/, "survivor UPDATE must not embed the prune in a CTE (Postgres runs unreferenced modifying CTEs after the main statement)");
        assert.strictEqual(statements.some((sql) => sql.includes("INSERT INTO user_insights")), false);
    });
    (0, node_test_1.it)("keeps embedding on a metadata-only insight change", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{
                    source: "codex_project_session",
                    source_ref: "/sessions/codex.jsonl",
                    insight_text: "Codex project session: same task.",
                    topics_json: ["#codex-session"],
                    importance: 0.5,
                    strength: 1,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                }],
            nowTs: () => 1234,
        });
        const result = await sink.upsertInsights("u1", [{
                id: "codex_session_def456",
                source: "codex_project_session",
                source_ref: "/sessions/codex.jsonl",
                insight_text: "Codex project session: same task.",
                topics: ["#codex-session", "#updated"],
                importance: 0.82,
                strength: 1,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            }]);
        assert.strictEqual(result.rowsWritten, 1);
        const updateSql = statements.find((sql) => sql.includes("UPDATE user_insights SET"));
        assert.ok(updateSql, "expected a natural-key UPDATE statement");
        assert.doesNotMatch(updateSql, /embedding = NULL/);
    });
    (0, node_test_1.it)("still dedup-skips an unchanged insight", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{
                    source: "claude_project_session",
                    source_ref: "/sessions/file.jsonl",
                    insight_text: "Claude Code project session: same task.",
                    topics_json: ["#claude-session"],
                    importance: 0.78,
                    strength: 1,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                }],
            nowTs: () => 1234,
        });
        const result = await sink.upsertInsights("u1", [{
                id: "claude_session_abc123",
                source: "claude_project_session",
                source_ref: "/sessions/file.jsonl",
                insight_text: "Claude Code project session: same task.",
                topics: ["#claude-session"],
                importance: 0.78,
                strength: 1,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            }]);
        assert.strictEqual(result.rowsWritten, 0);
        assert.strictEqual(result.dedupSkips, 1);
        assert.strictEqual(statements.some((sql) => sql.includes("INSERT INTO user_insights")), false);
    });
    (0, node_test_1.it)("preserves lifecycle-owned importance and strength on an unchanged re-ingest", async () => {
        const statements = [];
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async () => [{
                    source: "claude_project_session",
                    source_ref: "/sessions/file.jsonl",
                    insight_text: "Claude Code project session: same task.",
                    topics_json: ["#claude-session"],
                    importance: 0.93,
                    strength: 0,
                    occurred_at_ts: 100,
                    last_accessed_ts: null,
                }],
            nowTs: () => 1234,
        });
        const result = await sink.upsertInsights("u1", [{
                id: "claude_session_abc123",
                source: "claude_project_session",
                source_ref: "/sessions/file.jsonl",
                insight_text: "Claude Code project session: same task.",
                topics: ["#claude-session"],
                importance: 0.78,
                strength: 1,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            }]);
        assert.strictEqual(result.rowsWritten, 0);
        assert.strictEqual(result.dedupSkips, 1);
        assert.deepStrictEqual(statements, []);
    });
    (0, node_test_1.it)("persists lifecycle-owned fields for changed existing ADD, NOOP, and SUPERSEDES rows atomically", async () => {
        for (const decisionKind of ["add", "noop_duplicate", "supersedes"]) {
            const statements = [];
            let llmCalls = 0;
            const source = "claude_project_session";
            const sourceRef = `/sessions/${decisionKind}.jsonl`;
            const targetId = decisionKind === "add" ? null : `target-${decisionKind}`;
            const llm = {
                async generateJson(prompt) {
                    llmCalls += 1;
                    const hash = JSON.parse(prompt.slice(prompt.indexOf("Input: ") + 7))[0].incoming_content_hash;
                    return { decisions: [{
                                incoming_source_ref: sourceRef,
                                incoming_content_hash: hash,
                                decision_kind: decisionKind,
                                target_id: targetId,
                                importance: 0.9,
                                rationale: "test decision",
                            }] };
                },
                callsUsed: () => llmCalls,
            };
            const sink = new sink_js_1.PostgresIngestSink({
                exec: async (sql) => { statements.push(sql); },
                query: async (sql) => {
                    if (/SELECT 1 FROM events LIMIT 0/.test(sql))
                        return [];
                    if (/FROM insight_lifecycle_decisions/.test(sql))
                        return [];
                    if (/ORDER BY embedding <=>/.test(sql)) {
                        return targetId === null ? [] : [{
                                id: targetId,
                                source,
                                source_ref: `/sessions/target-${decisionKind}.jsonl`,
                                text: "Related prior insight",
                                distance: 0.05,
                            }];
                    }
                    if (/ORDER BY created_at_ts DESC/.test(sql) && !/id IN/.test(sql))
                        return [];
                    if (/id IN/.test(sql)) {
                        return targetId === null ? [] : [{
                                id: targetId,
                                source,
                                source_ref: `/sessions/target-${decisionKind}.jsonl`,
                                insight_text: "Related prior insight",
                                topics_json: ["#memory"],
                                importance: 0.6,
                                strength: 0.8,
                                occurred_at_ts: 90,
                                last_accessed_ts: null,
                            }];
                    }
                    if (/FROM user_insights/.test(sql)) {
                        return [{
                                source,
                                source_ref: sourceRef,
                                insight_text: "Old content",
                                topics_json: ["#memory"],
                                importance: 0.3,
                                strength: 0.2,
                                occurred_at_ts: 90,
                                last_accessed_ts: null,
                            }];
                    }
                    return [];
                },
                nowTs: () => 1234,
                lifecycle: {
                    llm,
                    embedRows: async () => [new Array(768).fill(0.1)],
                    storeKind: () => "postgres",
                },
            });
            const incoming = {
                id: `incoming-${decisionKind}`,
                source,
                source_ref: sourceRef,
                insight_text: "Changed content",
                topics: ["#memory"],
                importance: 0.4,
                strength: 0.6,
                occurred_at_ts: 100,
                last_accessed_ts: null,
            };
            const result = await sink.upsertInsights("u1", [incoming]);
            assert.equal(result.rowsWritten, 1);
            assert.equal(statements.length, 1, "all row and lifecycle effects must share one scoped transaction");
            assert.match(statements[0], /^BEGIN;/);
            assert.match(statements[0], /INSERT INTO insight_lifecycle_decisions/);
            assert.match(statements[0], /importance = 0\.9/);
            const expectedStrength = decisionKind === "noop_duplicate" ? 0 : decisionKind === "supersedes" ? 0.8 : 0.6;
            assert.match(statements[0], new RegExp(`strength = ${expectedStrength}(?:\\D|$)`));
            assert.match(statements[0], /COMMIT;$/);
        }
    });
    (0, node_test_1.it)("submits the row mutation and durable decision in one rollback-capable scoped exec", async () => {
        const statements = [];
        let llmCalls = 0;
        const row = {
            id: "incoming-atomic",
            source: "claude_project_session",
            source_ref: "/sessions/atomic.jsonl",
            insight_text: "Changed atomic content",
            topics: ["#memory"],
            importance: 0.4,
            strength: 0.6,
            occurred_at_ts: 100,
            last_accessed_ts: null,
        };
        const sink = new sink_js_1.PostgresIngestSink({
            exec: async (sql) => {
                statements.push(sql);
                throw new Error("injected transaction failure");
            },
            query: async (sql) => {
                if (/SELECT 1 FROM events LIMIT 0/.test(sql))
                    return [];
                if (/FROM insight_lifecycle_decisions/.test(sql))
                    return [];
                if (/ORDER BY embedding <=>|ORDER BY created_at_ts DESC/.test(sql))
                    return [];
                if (/FROM user_insights/.test(sql))
                    return [{
                            source: row.source,
                            source_ref: row.source_ref,
                            insight_text: "Old atomic content",
                            topics_json: ["#memory"],
                            importance: 0.2,
                            strength: 0.2,
                            occurred_at_ts: 90,
                            last_accessed_ts: null,
                        }];
                return [];
            },
            lifecycle: {
                llm: {
                    async generateJson(prompt) {
                        llmCalls += 1;
                        const hash = JSON.parse(prompt.slice(prompt.indexOf("Input: ") + 7))[0].incoming_content_hash;
                        return { decisions: [{
                                    incoming_source_ref: row.source_ref,
                                    incoming_content_hash: hash,
                                    decision_kind: "add",
                                    target_id: null,
                                    importance: 0.85,
                                    rationale: "atomic add",
                                }] };
                    },
                    callsUsed: () => llmCalls,
                },
                embedRows: async () => [new Array(768).fill(0.1)],
                storeKind: () => "postgres",
            },
        });
        await assert.rejects(() => sink.upsertInsights("u1", [row]), /injected transaction failure/);
        assert.equal(statements.length, 1);
        assert.match(statements[0], /^BEGIN;/);
        assert.match(statements[0], /UPDATE user_insights SET/);
        assert.match(statements[0], /INSERT INTO insight_lifecycle_decisions/);
        assert.match(statements[0], /COMMIT;$/);
    });
});
// ---------------------------------------------------------------------------
// Memory-row project attribution: Claude Code stores each session under
// ~/.claude/projects/<dir>/ where <dir> is the session cwd with every
// non-alphanumeric character replaced by "-". The old substring selection
// (path.includes(basename(projectPath))) let one configured project claim
// another project's session files — projectPath /Users/alice matched EVERY
// directory under /Users/alice — so the same (source, source_ref) row was
// ingested by several projects, each stamping its own #<project> topic.
// insightUnchanged then correctly reported a topics change on every 10-minute
// daemon cycle and the row was rewritten forever (live symptom:
// rowsWritten:254, dedupSkips:2 on back-to-back unchanged ingests). Each file
// must belong to exactly ONE project: its encoded directory.
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("memory ingest project attribution (topics churn regression)", () => {
    function writeSession(root, dir, name, cwd, task) {
        const projectDir = (0, node_path_1.join)(root, dir);
        (0, node_fs_1.mkdirSync)(projectDir, { recursive: true });
        const file = (0, node_path_1.join)(projectDir, name);
        (0, node_fs_1.writeFileSync)(file, JSON.stringify({ cwd, type: "user", message: { content: task } }) + "\n");
        return file;
    }
    function withSessions(run) {
        const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-attribution-"));
        try {
            return run({
                s1: writeSession(root, "-Users-alice", "s1.jsonl", "/Users/alice", "Organize home directory notes"),
                s2: writeSession(root, "-Users-alice-Work-app", "s2.jsonl", "/Users/alice/Work/app", "Fix the login flow"),
                s3: writeSession(root, "-Users-alice-Work-app--claude-worktrees-fix-1", "s3.jsonl", "/Users/alice/Work/app/.claude/worktrees/fix-1", "Patch the flaky retry"),
            });
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    }
    (0, node_test_1.it)("a parent-path project does not claim other projects' session files", () => {
        withSessions(({ s1, s2, s3 }) => {
            const rows = (0, claudeMemory_js_1.buildMemoryRows)({ projectPath: "/Users/alice", codexFiles: [], claudeFiles: [s1, s2, s3] });
            assert.deepEqual(rows.map((row) => row.source_ref), [s1]);
            assert.deepEqual(rows[0].topics, ["#claude-session", "#alice"]);
        });
    });
    (0, node_test_1.it)("a project does not claim its worktrees' session files (and vice versa)", () => {
        withSessions(({ s1, s2, s3 }) => {
            const appRows = (0, claudeMemory_js_1.buildMemoryRows)({
                projectPath: "/Users/alice/Work/app", codexFiles: [], claudeFiles: [s1, s2, s3],
            });
            assert.deepEqual(appRows.map((row) => row.source_ref), [s2]);
            const worktreeRows = (0, claudeMemory_js_1.buildMemoryRows)({
                projectPath: "/Users/alice/Work/app/.claude/worktrees/fix-1", codexFiles: [], claudeFiles: [s1, s2, s3],
            });
            assert.deepEqual(worktreeRows.map((row) => row.source_ref), [s3]);
        });
    });
    (0, node_test_1.it)("overlapping configured projects never produce the same insight key with different topics", () => {
        withSessions(({ s1, s2, s3 }) => {
            const claudeFiles = [s1, s2, s3];
            const byProject = ["/Users/alice", "/Users/alice/Work/app", "/Users/alice/Work/app/.claude/worktrees/fix-1"]
                .map((projectPath) => (0, claudeMemory_js_1.buildMemoryRows)({ projectPath, codexFiles: [], claudeFiles }));
            const refs = byProject.flat().map((row) => row.source_ref);
            assert.deepEqual(refs.sort(), [...new Set(refs)].sort(), "each session file ingested by exactly one project");
        });
    });
    (0, node_test_1.it)("streams every discovery file once while preserving legacy rows and order", async () => {
        const root = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-single-pass-"));
        try {
            const projectA = (0, node_path_1.join)(root, "Work", "alpha");
            const projectB = (0, node_path_1.join)(root, "Work", "beta");
            const claudeRoot = (0, node_path_1.join)(root, "home", ".claude", "projects");
            const codexRoot = (0, node_path_1.join)(root, "home", ".codex", "sessions", "2026", "08");
            const claudeDir = (0, node_path_1.join)(claudeRoot, projectA.replace(/[^A-Za-z0-9]/g, "-"));
            (0, node_fs_1.mkdirSync)(claudeDir, { recursive: true });
            (0, node_fs_1.mkdirSync)(codexRoot, { recursive: true });
            const claudeFile = (0, node_path_1.join)(claudeDir, "claude.jsonl");
            const codexFile = (0, node_path_1.join)(codexRoot, "codex.jsonl");
            (0, node_fs_1.writeFileSync)(claudeFile, [
                JSON.stringify({
                    timestamp: "2026-08-01T01:00:00Z",
                    cwd: projectA,
                    type: "user",
                    message: { role: "user", content: "Fix alpha setup" },
                }),
                JSON.stringify({
                    type: "assistant",
                    message: { role: "assistant", content: "Alpha setup fixed" },
                }),
            ].join("\n"));
            (0, node_fs_1.writeFileSync)(codexFile, [
                JSON.stringify({
                    type: "turn_context",
                    payload: { cwd: projectB, workspace_roots: [projectB, projectA] },
                }),
                JSON.stringify({
                    timestamp: "2026-08-01T02:00:00Z",
                    type: "response_item",
                    payload: { type: "message", role: "user", content: "Fix shared sync" },
                }),
                JSON.stringify({
                    type: "response_item",
                    payload: { type: "message", role: "assistant", content: "Shared sync fixed" },
                }),
            ].join("\n"));
            const roots = {
                claudeProjectsRoot: claudeRoot,
                codexSessionsRoot: (0, node_path_1.join)(root, "home", ".codex", "sessions"),
            };
            const projectPaths = (0, claudeMemory_js_1.discoverMemoryProjects)(roots);
            const expected = projectPaths.flatMap((projectPath) => (0, claudeMemory_js_1.buildMemoryRows)({
                projectPath,
                codexFiles: [codexFile],
                claudeFiles: [claudeFile],
            }));
            const reads = new Map();
            const actual = await (0, claudeMemory_js_1.buildDiscoveredMemoryRows)({
                ...roots,
                codexFiles: [codexFile],
                claudeFiles: [claudeFile],
                onFileRead: (file) => reads.set(file, (reads.get(file) ?? 0) + 1),
            });
            assert.deepEqual(actual.rows, expected);
            assert.deepEqual(actual.projects, projectPaths.map((path) => ({
                path,
                rows: expected.filter((row) => row.topics.includes(`#${path.split("/").at(-1)}`)).length,
            })));
            assert.deepEqual(reads, new Map([
                [codexFile, 1],
                [claudeFile, 1],
            ]));
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
});
// ---------------------------------------------------------------------------
// RLS scoping: every warm-tier write/read the sink emits must carry the batch
// user's GUC scope. Batches are homogeneous BY CONSTRUCTION — userId is a
// per-method-call parameter and EventRow/MeetingRow/InsightRow carry no
// user_id field — so there is no mixed-batch case; instead we pin that each
// batch is scoped with its own user (see the sequential-batches test).
// ---------------------------------------------------------------------------
(0, node_test_1.describe)("PostgresIngestSink RLS scoping", () => {
    /** Keep in sync with postgres-rls.ts RLS_GUC and user-scope.ts. */
    const GUC = "app.daobrew_user_id";
    /**
     * scopedExec's pooler-safe transaction opener: BEGIN + transaction-local
     * set_config (is_local = true) so the GUC and the DML share one pooled
     * backend and nothing leaks past COMMIT.
     */
    const execScopeOpen = (userId) => `BEGIN;\nSELECT set_config('${GUC}', '${userId}', true);`;
    function occurrences(haystack, needle) {
        return haystack.split(needle).length - 1;
    }
    function makeSink(statements, queries, existing = []) {
        return new sink_js_1.PostgresIngestSink({
            exec: async (sql) => { statements.push(sql); },
            query: async (sql) => { queries.push(sql); return existing; },
            nowTs: () => 1234,
        });
    }
    function fetchQueries(queries) {
        return queries.filter((sql) => !/^SELECT 1 FROM events LIMIT 0;?$/.test(sql));
    }
    const eventRow = (id) => ({
        id,
        source: "eventkit",
        source_ref: `calendar:${id}`,
        title: "Design review",
        start_ts: 100,
        end_ts: 200,
        all_day: false,
        attendee_count: 2,
        attendees: [],
        calendar_name: "Work",
        location: null,
        metadata: {},
    });
    const insightRow = (id) => ({
        id,
        source: "claude_sessions",
        source_ref: `file.jsonl:${id}`,
        insight_text: "User prefers reviewable evidence trails.",
        topics: ["#memory"],
        importance: 0.8,
        strength: 1,
        occurred_at_ts: null,
        last_accessed_ts: null,
    });
    (0, node_test_1.it)("scopes every event INSERT with the batch user's GUC exactly once", async () => {
        const statements = [];
        const queries = [];
        const sink = makeSink(statements, queries);
        await sink.upsertEvents("u1", [eventRow("evt_1"), eventRow("evt_2")]);
        const inserts = statements.filter((sql) => sql.includes("INSERT INTO events"));
        assert.strictEqual(inserts.length, 2);
        for (const sql of inserts) {
            assert.ok(sql.startsWith(execScopeOpen("u1")), `event INSERT must start with the scoped BEGIN + transaction-local set_config, got: ${sql}`);
            assert.ok(sql.trimEnd().endsWith("COMMIT;"), `event INSERT must commit the scoped transaction, got: ${sql}`);
            assert.strictEqual(occurrences(sql, "set_config"), 1, "set_config exactly once per statement");
        }
    });
    (0, node_test_1.it)("scopes the dedup read-back query with the batch user (single-statement lateral form)", async () => {
        const statements = [];
        const queries = [];
        const sink = makeSink(statements, queries);
        await sink.upsertEvents("u1", [eventRow("evt_1")]);
        const dataQueries = fetchQueries(queries);
        assert.strictEqual(dataQueries.length, 1, "expected one fetchExisting query");
        const sql = dataQueries[0];
        assert.ok(sql.includes(`set_config('${GUC}', 'u1', true)`), `read-back query must carry the GUC set_config, got: ${sql}`);
        assert.strictEqual(occurrences(sql, "set_config"), 1, "set_config exactly once per query");
        // queryJson wraps the whole string in a subquery, so the scope must be
        // composed inside one SELECT — never a `SELECT set_config(...);` statement prefix.
        assert.ok(!sql.includes(";"), "scoped query must be a single semicolon-free statement");
    });
    (0, node_test_1.it)("dedup read-back filters user_id by the scope row, never by a literal (fail-closed regression)", async () => {
        // Live root cause (F1): with `user_id = '<literal>'` in the read-back
        // body, the planner folds the RLS qual into a One-Time Filter
        // (current_setting(GUC) = '<literal>') evaluated at executor startup —
        // BEFORE the lateral scope row runs set_config. On a fresh pooled
        // backend (Neon autosuspend recycles them before every daemon cycle)
        // the GUC is unset, the filter is false, and the fetch silently returns
        // ZERO rows — so every batch row looks new, takes the INSERT path under
        // a fresh user-scoped id, and the first unchanged old-scheme row
        // violates ux_user_insights_dedup. Referencing the scope row's uid
        // instead removes the constant equivalence (no One-Time Filter) and
        // forces set_config to run before the scan.
        const statements = [];
        const queries = [];
        const sink = makeSink(statements, queries);
        await sink.upsertEvents("u1", [eventRow("evt_1")]);
        await sink.upsertInsights("u1", [insightRow("insight_1")]);
        const dataQueries = fetchQueries(queries);
        assert.strictEqual(dataQueries.length, 2, "expected one fetchExisting query per upsert");
        for (const sql of dataQueries) {
            assert.ok(sql.includes("user_id = __daobrew_scope.uid"), `read-back must filter user_id via the scope row, got: ${sql}`);
            assert.strictEqual(sql.includes("user_id = 'u1'"), false, "read-back must NOT compare user_id to a literal (creates the One-Time Filter fail-closed trap)");
        }
    });
    (0, node_test_1.it)("scopes meeting-note and insight INSERTs with the batch user's GUC exactly once", async () => {
        const statements = [];
        const sink = makeSink(statements, []);
        await sink.upsertMeetingNotes("u1", [{
                id: "meeting_1",
                source: "granola",
                source_ref: "note:1",
                event_id: null,
                kind: "meeting",
                title: "Demo sync",
                occurred_at_ts: 100,
                duration_sec: 1200,
                participants: [],
                summary: "Discussed demo",
                body: "Transcript body",
                transcript_spans: [],
                topics: ["#demo"],
            }]);
        await sink.upsertInsights("u1", [insightRow("insight_1")]);
        const noteInsert = statements.find((sql) => sql.includes("INSERT INTO meeting_notes"));
        const insightInsert = statements.find((sql) => sql.includes("INSERT INTO user_insights"));
        assert.ok(noteInsert, "expected a meeting_notes INSERT");
        assert.ok(insightInsert, "expected a user_insights INSERT");
        for (const sql of [noteInsert, insightInsert]) {
            assert.ok(sql.startsWith(execScopeOpen("u1")), `INSERT must open the scoped transaction, got: ${sql}`);
            assert.ok(sql.trimEnd().endsWith("COMMIT;"), `INSERT must commit the scoped transaction, got: ${sql}`);
            assert.strictEqual(occurrences(sql, "set_config"), 1, "set_config exactly once per statement");
        }
    });
    (0, node_test_1.it)("scopes each batch with its own user across sequential batches on one sink", async () => {
        // Pins the homogeneous-batch contract: one userId per upsert call; a
        // second batch for another user must carry THAT user, never the first.
        const statements = [];
        const sink = makeSink(statements, []);
        await sink.upsertInsights("u1", [insightRow("insight_u1")]);
        await sink.upsertInsights("u2", [insightRow("insight_u2")]);
        const u1Insert = statements.find((sql) => sql.includes("insight_u1"));
        const u2Insert = statements.find((sql) => sql.includes("insight_u2"));
        assert.ok(u1Insert && u2Insert, "expected one INSERT per batch");
        assert.ok(u1Insert.startsWith(execScopeOpen("u1")), "first batch scoped as u1");
        assert.ok(u2Insert.startsWith(execScopeOpen("u2")), "second batch scoped as u2");
        assert.strictEqual(occurrences(u2Insert, "'u1'"), 0, "u1 scope must not leak into u2's batch");
    });
    (0, node_test_1.it)("leaves the read-only schema readiness probe unscoped", async () => {
        // Runtime readiness is a catalog/source-table probe owned by setup, not a
        // user-scoped row read. Per-user GUC scoping belongs only on data reads and
        // writes.
        const statements = [];
        const queries = [];
        const sink = makeSink(statements, queries);
        await sink.upsertInsights("u1", [insightRow("insight_1")]);
        assert.strictEqual(queries[0], "SELECT 1 FROM events LIMIT 0;");
        assert.strictEqual(occurrences(queries[0], "set_config"), 0, "readiness probe must not carry the GUC");
        assert.match(statements[0], /INSERT INTO user_insights/);
    });
});
