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
const calendar_js_1 = require("../src/engine/sources/calendar.js");
const granola_js_1 = require("../src/engine/sources/granola.js");
const gdocs_js_1 = require("../src/engine/sources/gdocs.js");
const plaud_js_1 = require("../src/engine/sources/plaud.js");
const claudeMemory_js_1 = require("../src/engine/sources/claudeMemory.js");
(0, node_test_1.describe)("source normalizers", () => {
    const ENV_KEYS = ["GRANOLA_API_TOKEN", "GRANOLA_API_BASE", "DAOBREW_CONFIG_FILE"];
    let savedEnv;
    (0, node_test_1.beforeEach)(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
    });
    (0, node_test_1.afterEach)(() => {
        for (const key of ENV_KEYS) {
            if (savedEnv[key] !== undefined)
                process.env[key] = savedEnv[key];
            else
                delete process.env[key];
        }
    });
    (0, node_test_1.it)("normalizes calendar rows handed from CalendarBridge", () => {
        const rows = (0, calendar_js_1.normalizeCalendarEvents)([{
                id: "native-1",
                title: "Focus block",
                startDate: "2026-07-01T17:00:00.000Z",
                endDate: "2026-07-01T18:00:00.000Z",
                isAllDay: false,
                attendees: [{ name: "Neo" }],
                calendar: "Work",
                location: "Desk",
            }]);
        assert.strictEqual(rows[0].source, "eventkit");
        assert.strictEqual(rows[0].title, "Focus block");
        assert.strictEqual(rows[0].attendee_count, 1);
        assert.ok(Number.isInteger(rows[0].start_ts));
    });
    (0, node_test_1.it)("preserves the Swift exporter's cross-language calendar contract (G6 C3)", () => {
        // Fixture is byte-shaped like CalendarBridge.dumpEvents (SentinelMac) →
        // CalendarExporter.payload rawEvents: occurrence-unique source_ref
        // "identifier-epoch", epoch-SECOND integer timestamps, optional keys
        // (end_ts / calendar_name / location) truly ABSENT when unset,
        // "(untitled event)" fallback applied Swift-side, mailto:-stripped
        // attendees, metadata {}. See CalendarExporterTests.swift for the
        // Swift half of this contract.
        const rawEvents = [
            {
                // Recurring occurrence #1 — full shape, all optional keys present.
                id: "REC-1-1700000000",
                source: "eventkit",
                source_ref: "REC-1-1700000000",
                title: "Weekly standup",
                start_ts: 1_700_000_000,
                all_day: false,
                attendees: ["Ada Lovelace", "alan@example.com"],
                attendee_count: 2,
                metadata: {},
                end_ts: 1_700_003_600,
                calendar_name: "Work",
                location: "Seattle",
            },
            {
                // Recurring occurrence #2 — SAME eventIdentifier, one week later.
                // Minimal shape: end_ts / calendar_name / location keys omitted,
                // exactly as dumpEvents omits them when EventKit has no value.
                id: "REC-1-1700604800",
                source: "eventkit",
                source_ref: "REC-1-1700604800",
                title: "Weekly standup",
                start_ts: 1_700_604_800,
                all_day: false,
                attendees: [],
                attendee_count: 0,
                metadata: {},
            },
            {
                // No eventIdentifier → the substituted title anchors the ref.
                id: "(untitled event)-1700100000",
                source: "eventkit",
                source_ref: "(untitled event)-1700100000",
                title: "(untitled event)",
                start_ts: 1_700_100_000,
                all_day: true,
                attendees: [],
                attendee_count: 0,
                metadata: {},
            },
        ];
        const rows = (0, calendar_js_1.normalizeCalendarEvents)(rawEvents);
        assert.strictEqual(rows.length, 3);
        const [first, second, untitled] = rows;
        // source_ref survives VERBATIM in its occurrence-unique form — no
        // re-derivation, no truncation of the "-epoch" suffix.
        assert.strictEqual(first.source_ref, "REC-1-1700000000");
        assert.strictEqual(second.source_ref, "REC-1-1700604800");
        assert.strictEqual(untitled.source_ref, "(untitled event)-1700100000");
        // The recurring pair shares an identifier but must keep DISTINCT refs;
        // the ingest sink dedups on (user_id, source, source_ref), so a
        // collapse here would erase the meeting-density signal (the C1 fix).
        assert.notStrictEqual(first.source_ref, second.source_ref);
        // Epoch seconds pass through untouched (toTs must not treat them as
        // millis and divide, nor re-parse them as date strings).
        assert.strictEqual(first.start_ts, 1_700_000_000);
        assert.strictEqual(second.start_ts, 1_700_604_800);
        assert.strictEqual(first.end_ts, 1_700_003_600);
        // Absent end_ts key coerces to null — never NaN, 0, or a throw.
        assert.strictEqual(second.end_ts, null);
        assert.strictEqual(second.calendar_name, null);
        assert.strictEqual(second.location, null);
        // Type-level contract points.
        for (const row of rows) {
            assert.strictEqual(row.source, "eventkit");
            assert.ok(Number.isInteger(row.attendee_count));
            assert.strictEqual(typeof row.all_day, "boolean");
        }
        assert.strictEqual(first.attendee_count, 2);
        assert.strictEqual(first.all_day, false);
        assert.strictEqual(untitled.all_day, true);
        assert.strictEqual(untitled.title, "(untitled event)");
        assert.deepStrictEqual(first.attendees, ["Ada Lovelace", "alan@example.com"]);
        assert.deepStrictEqual(second.metadata, {});
    });
    (0, node_test_1.it)("normalizes granola meetings with transcript spans", () => {
        const rows = (0, granola_js_1.normalizeGranolaNotes)([{
                id: "note-1",
                title: "Demo review",
                created_at: "2026-07-01T17:00:00.000Z",
                transcript: [{ speaker: "A", timestamp: 12, text: "Ship the proof loop." }],
                summary: "Demo flow",
                topics: ["demo"],
            }]);
        assert.strictEqual(rows[0].source, "granola");
        assert.strictEqual(rows[0].transcript_spans[0].text, "Ship the proof loop.");
        assert.match(rows[0].body ?? "", /Ship the proof loop/);
    });
    (0, node_test_1.it)("fetches granola notes over HTTP and maps transcripts", async () => {
        const requests = [];
        const notes = await (0, granola_js_1.fetchGranolaNotes)({
            token: "wsp_test",
            fetchImpl: (async (url, init) => {
                requests.push(`${url} ${init?.headers?.Authorization ?? init?.headers?.authorization ?? ""}`);
                if (String(url).includes("get-documents")) {
                    return {
                        ok: true,
                        json: async () => ({ docs: [{ id: "d1", title: "Board sync", created_at: "2026-07-01T17:00:00Z", overview: "Summary text" }] }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({ transcript: [{ source: "microphone", text: "Ship the reader.", start_timestamp: "2026-07-01T17:00:05Z" }] }),
                };
            }),
        });
        assert.strictEqual(notes.length, 1);
        assert.strictEqual(notes[0].id, "d1");
        assert.match(requests.join("\n"), /Bearer wsp_test/);
        const rows = (0, granola_js_1.normalizeGranolaNotes)(notes);
        assert.strictEqual(rows[0].source, "granola");
        assert.match(rows[0].body ?? "", /Ship the reader/);
    });
    (0, node_test_1.it)("routes grn_ personal keys to the public v1 API and maps notes like the daemon", async () => {
        const requests = [];
        const notes = await (0, granola_js_1.fetchGranolaNotes)({
            token: "grn_personal",
            fetchImpl: (async (url, init) => {
                requests.push({
                    url: String(url),
                    method: String(init?.method ?? "GET"),
                    auth: String(init?.headers?.Authorization ?? init?.headers?.authorization ?? ""),
                });
                return {
                    ok: true,
                    json: async () => ({
                        notes: [{ id: "n1", title: "Board sync", createdAt: "2026-07-01T17:00:00Z", summary: "Summary text" }],
                    }),
                };
            }),
        });
        assert.strictEqual(requests.length, 1);
        assert.match(requests[0].url, /^https:\/\/public-api\.granola\.ai\/v1\/notes\?limit=/);
        assert.strictEqual(requests[0].method, "GET");
        assert.strictEqual(requests[0].auth, "Bearer grn_personal");
        assert.strictEqual(notes.length, 1);
        const { id, source, source_ref, title, created_at, summary } = notes[0];
        assert.deepStrictEqual({ id, source, source_ref, title, created_at, summary }, {
            id: "n1",
            source: "granola",
            source_ref: "n1",
            title: "Board sync",
            created_at: "2026-07-01T17:00:00Z",
            summary: "Summary text",
        });
        const rows = (0, granola_js_1.normalizeGranolaNotes)(notes);
        assert.strictEqual(rows[0].source, "granola");
        assert.ok(Number.isInteger(rows[0].occurred_at_ts));
    });
    (0, node_test_1.it)("keeps non-grn_ tokens on the v2 workspace path", async () => {
        const urls = [];
        await (0, granola_js_1.fetchGranolaNotes)({
            token: "wsp_workspace",
            fetchImpl: (async (url) => {
                urls.push(String(url));
                return { ok: true, json: async () => ({ docs: [] }) };
            }),
        });
        assert.match(urls[0], /api\.granola\.ai\/v2\/get-documents/);
    });
    (0, node_test_1.it)("falls back to config.json granola_api_token when env is unset", async () => {
        const workDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-granola-config-"));
        try {
            const configFile = (0, node_path_1.join)(workDir, "config.json");
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({ granola_api_token: "grn_cfg" }));
            process.env.DAOBREW_CONFIG_FILE = configFile;
            delete process.env.GRANOLA_API_TOKEN;
            const requests = [];
            await (0, granola_js_1.fetchGranolaNotes)({
                fetchImpl: (async (url, init) => {
                    requests.push({
                        url: String(url),
                        auth: String(init?.headers?.Authorization ?? init?.headers?.authorization ?? ""),
                    });
                    return { ok: true, json: async () => ({ notes: [] }) };
                }),
            });
            assert.strictEqual(requests.length, 1);
            assert.match(requests[0].url, /^https:\/\/public-api\.granola\.ai\/v1\/notes\?limit=/);
            assert.strictEqual(requests[0].auth, "Bearer grn_cfg");
        }
        finally {
            (0, node_fs_1.rmSync)(workDir, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails with a clear error when no granola token is configured", async () => {
        delete process.env.GRANOLA_API_TOKEN;
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
        await assert.rejects(() => (0, granola_js_1.fetchGranolaNotes)({}), /GRANOLA_API_TOKEN/);
    });
    (0, node_test_1.it)("extracts project memory from Codex and Claude session text", () => {
        const codex = (0, claudeMemory_js_1.parseCodexSessionText)("session.jsonl", "/repo/DaobrewAI", [
            JSON.stringify({ type: "turn_context", payload: { cwd: "/repo/DaobrewAI", workspace_roots: ["/repo/DaobrewAI"] } }),
            JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ text: "Need warm tier plan" }] } }),
            JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "Plan saved" }] } }),
        ].join("\n"));
        const claude = (0, claudeMemory_js_1.parseClaudeSessionText)("claude.jsonl", "/repo/DaobrewAI", [
            JSON.stringify({ timestamp: "2026-07-01T17:00:00.000Z", message: { role: "user", content: "DaoBrewAI memory" } }),
            JSON.stringify({ message: { role: "assistant", content: "Outcome text" } }),
        ].join("\n"));
        assert.ok(codex);
        assert.ok(claude);
        assert.match(codex.insight_text, /Need warm tier plan/);
        assert.match(claude.insight_text, /Outcome text/);
    });
});
(0, node_test_1.describe)("plaud source", () => {
    (0, node_test_1.it)("builds a meeting note with source plaud and speaker spans", () => {
        const note = (0, plaud_js_1.buildPlaudNote)({ id: "f1", title: "Client call", created_at: "2026-07-01T10:00:00Z" }, [{ speaker: "Speaker 1", text: "Budget is approved." }], "Summary: budget approved; next step invoice.");
        const [row] = (0, granola_js_1.normalizeGranolaNotes)([note]);
        assert.strictEqual(row.source, "plaud");
        assert.strictEqual(row.source_ref, "f1");
        assert.strictEqual(row.title, "Client call");
        assert.strictEqual(row.summary, "Summary: budget approved; next step invoice.");
        // MeetingRow.transcript_spans is unknown[] — narrow for the assertion.
        assert.strictEqual(row.transcript_spans[0].speaker, "Speaker 1");
    });
    (0, node_test_1.it)("tolerates missing transcript and note (list-only tiers)", () => {
        const note = (0, plaud_js_1.buildPlaudNote)({ id: "f2", title: null, created_at: null }, [], null);
        const [row] = (0, granola_js_1.normalizeGranolaNotes)([note]);
        assert.strictEqual(row.source, "plaud");
        assert.strictEqual(row.title, "(untitled meeting)");
    });
});
(0, node_test_1.describe)("gdocs source", () => {
    const doc = { body: { content: [
                { paragraph: { elements: [{ textRun: { content: "Weekly sync notes\n" } }] } },
                { sectionBreak: {} },
                { paragraph: { elements: [{ textRun: { content: "Decision: ship " } }, { textRun: { content: "Friday\n" } }] } },
            ] } };
    (0, node_test_1.it)("extracts paragraph text from a Docs API document", () => {
        assert.strictEqual((0, gdocs_js_1.extractDocText)(doc), "Weekly sync notes\nDecision: ship Friday");
    });
    (0, node_test_1.it)("builds meeting notes with source gdocs keyed by file id", () => {
        const notes = (0, gdocs_js_1.buildGdocsNotes)([{ id: "d1", name: "Weekly sync", modifiedTime: "2026-07-01T10:00:00Z" }], new Map([["d1", "Weekly sync notes\nDecision: ship Friday"]]));
        const [row] = (0, granola_js_1.normalizeGranolaNotes)(notes);
        assert.strictEqual(row.source, "gdocs");
        assert.strictEqual(row.source_ref, "d1");
        assert.strictEqual(row.title, "Weekly sync");
        assert.match(row.body, /Decision: ship Friday/);
        assert.strictEqual(row.occurred_at_ts, Math.floor(Date.parse("2026-07-01T10:00:00Z") / 1000));
    });
});
