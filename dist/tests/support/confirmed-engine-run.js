"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEngineOnce = runEngineOnce;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const run_js_1 = require("../../src/engine/run.js");
const graph_db_js_1 = require("../../src/graph-db.js");
const schema_js_1 = require("../../src/engine/schema.js");
const biometrics_js_1 = require("../../src/engine/signals/biometrics.js");
const confirmed_owner_js_1 = require("./confirmed-owner.js");
const DEFAULT_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const shimDirectory = node_path_1.default.join(process.cwd(), ".test-tmp", `engine-curl-${process.pid}`);
const curlShimPath = node_path_1.default.join(shimDirectory, "curl");
const seededRows = new Map();
process.once("exit", () => {
    (0, node_fs_1.rmSync)(shimDirectory, { recursive: true, force: true });
});
function sqlText(value) {
    return value === null ? "NULL" : (0, graph_db_js_1.q)(value);
}
function installCurlShim() {
    (0, node_fs_1.mkdirSync)(shimDirectory, { recursive: true, mode: 0o700 });
    (0, node_fs_1.writeFileSync)(curlShimPath, `#!/usr/bin/env node
const fixture = JSON.parse(process.env.DAOBREW_TEST_BIOMETRICS_FIXTURE || "{}");
const rawUrl = process.argv.find((arg) => /^https?:\\/\\//u.test(arg));
if (!rawUrl) process.exit(2);
const url = new URL(rawUrl);
let data;
if (url.pathname.endsWith("/healthkit/history")) {
  const metric = url.searchParams.get("metric") || "";
  data = fixture.metrics?.[metric] || {
    metric,
    range: url.searchParams.get("range") || "week",
    samples: [],
    aggregated: { avg: 0, min: 0, max: 0 },
  };
} else if (url.pathname.endsWith("/state/history")) {
  const limit = Number(url.searchParams.get("limit") || 24);
  data = { states: fixture.states || [], total_count: (fixture.states || []).length, limit };
} else {
  process.stderr.write("unexpected test URL: " + rawUrl);
  process.exit(22);
}
process.stdout.write(JSON.stringify({ success: true, data }));
`, { mode: 0o700 });
    (0, node_fs_1.chmodSync)(curlShimPath, 0o700);
}
function fixtureFromSignals(signals) {
    return {
        metrics: Object.fromEntries(signals.metrics.map((series) => [series.metric, {
                metric: series.metric,
                range: series.range,
                samples: series.samples.map((sample) => ({
                    value: sample.value,
                    timestamp: sample.timestamp,
                })),
                aggregated: series.aggregated,
            }])),
        states: signals.states.map((state) => ({
            bucket_ts: state.bucket_ts,
            yin_score: state.yin_score,
            yang_score: state.yang_score,
            category: state.category,
            source_quality: state.source_quality,
            updated_at_ts: state.updated_at_ts,
        })),
    };
}
function fixtureFromTriplet(input) {
    return fixtureFromSignals(input.biometrics);
}
function emptyBiometricsClient() {
    return {
        async getHealthkitHistory(metric, range) {
            return {
                metric,
                range,
                samples: [],
                aggregated: { avg: 0, min: 0, max: 0 },
            };
        },
        async getStateHistory(limit = 24) {
            return { states: [], total_count: 0, limit };
        },
    };
}
async function collectFixture(options) {
    if (options.testInput)
        return fixtureFromTriplet(options.testInput);
    const replay = options.startTs !== undefined || options.endTs !== undefined;
    const signals = await (0, biometrics_js_1.readBiometricSignals)(options.client ?? emptyBiometricsClient(), {
        metrics: biometrics_js_1.DEFAULT_BIOMETRIC_METRICS,
        range: options.biometricRange ?? "week",
        stateLimit: replay ? 100 : 24,
        startTs: options.startTs,
        endTs: options.endTs,
        stateChunkDays: replay ? (options.stateChunkDays ?? 7) : undefined,
    });
    return fixtureFromSignals(signals);
}
async function deleteSeededRows(key) {
    const previous = seededRows.get(key);
    if (!previous)
        return;
    const deleteIds = async (table, ids) => {
        if (ids.length === 0)
            return;
        await (0, graph_db_js_1.execSql)(`DELETE FROM ${table} WHERE id IN (${ids.map(graph_db_js_1.q).join(", ")});`);
    };
    await deleteIds("events", previous.eventIds);
    await deleteIds("meeting_notes", previous.meetingIds);
    await deleteIds("user_insights", previous.memoryIds);
    seededRows.delete(key);
}
async function seedTripletInput(key, input) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "sqlite") {
        throw new Error("test-only authored signal seeding is restricted to isolated SQLite stores");
    }
    (0, schema_js_1.ensureSchema)();
    await deleteSeededRows(key);
    for (const row of input.calendar) {
        await (0, graph_db_js_1.execSql)(`INSERT OR REPLACE INTO events (
      id, user_id, source, source_ref, title, start_ts, end_ts, all_day,
      attendee_count, attendees_json, calendar_name, location, metadata_json,
      created_at_ts
    ) VALUES (
      ${(0, graph_db_js_1.q)(row.id)}, ${(0, graph_db_js_1.q)(row.user_id)}, ${(0, graph_db_js_1.q)(row.source)}, ${sqlText(row.source_ref)},
      ${(0, graph_db_js_1.q)(row.title)}, ${Math.trunc(row.start_ts)}, ${row.end_ts === null ? "NULL" : Math.trunc(row.end_ts)},
      ${row.all_day ? 1 : 0}, ${row.attendee_count === null ? "NULL" : Math.trunc(row.attendee_count)},
      ${(0, graph_db_js_1.q)(JSON.stringify(row.attendees))}, ${sqlText(row.calendar_name)}, ${sqlText(row.location)},
      ${(0, graph_db_js_1.q)(JSON.stringify(row.metadata))}, ${Math.trunc(row.created_at_ts)}
    );`);
    }
    for (const row of input.granola) {
        await (0, graph_db_js_1.execSql)(`INSERT OR REPLACE INTO meeting_notes (
      id, user_id, source, source_ref, event_id, kind, title, occurred_at_ts,
      duration_sec, participants_json, summary, body, transcript_spans_json,
      topics_json, created_at_ts
    ) VALUES (
      ${(0, graph_db_js_1.q)(row.id)}, ${(0, graph_db_js_1.q)(row.user_id)}, ${(0, graph_db_js_1.q)(row.source)}, ${sqlText(row.source_ref)},
      ${sqlText(row.event_id)}, ${(0, graph_db_js_1.q)(row.kind)}, ${(0, graph_db_js_1.q)(row.title)},
      ${row.occurred_at_ts === null ? "NULL" : Math.trunc(row.occurred_at_ts)},
      ${row.duration_sec === null ? "NULL" : Math.trunc(row.duration_sec)},
      ${(0, graph_db_js_1.q)(JSON.stringify(row.participants))}, ${sqlText(row.summary)}, ${sqlText(row.body)},
      ${(0, graph_db_js_1.q)(JSON.stringify(row.transcript_spans ?? []))}, ${(0, graph_db_js_1.q)(JSON.stringify(row.topics))},
      ${Math.trunc(row.created_at_ts)}
    );`);
    }
    for (const row of input.memory) {
        await (0, graph_db_js_1.execSql)(`INSERT OR REPLACE INTO user_insights (
      id, user_id, source, source_ref, insight_text, topics_json, importance,
      strength, occurred_at_ts, last_accessed_ts, created_at_ts
    ) VALUES (
      ${(0, graph_db_js_1.q)(row.id)}, ${(0, graph_db_js_1.q)(row.user_id)}, ${(0, graph_db_js_1.q)(row.source)}, ${sqlText(row.source_ref)},
      ${(0, graph_db_js_1.q)(row.insight_text)}, ${(0, graph_db_js_1.q)(JSON.stringify(row.topics))}, ${row.importance},
      ${row.strength}, ${row.occurred_at_ts === null ? "NULL" : Math.trunc(row.occurred_at_ts)},
      ${row.last_accessed_ts === null ? "NULL" : Math.trunc(row.last_accessed_ts)},
      ${Math.trunc(row.created_at_ts)}
    );`);
    }
    seededRows.set(key, {
        eventIds: input.calendar.map((row) => row.id),
        meetingIds: input.granola.map((row) => row.id),
        memoryIds: input.memory.map((row) => row.id),
    });
}
function testFetch(proposerLlm, semanticEmbedText) {
    return async (input, init) => {
        const url = String(input);
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (url.includes(":generateContent")) {
            if (!proposerLlm)
                throw new Error("unexpected Gemini text request");
            const prompt = body?.contents?.[0]?.parts?.[0]?.text ?? "";
            const generated = await proposerLlm.generateJson(prompt);
            return new Response(JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }],
            }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes(":embedContent")) {
            const text = body?.content?.parts?.[0]?.text ?? "";
            const provided = semanticEmbedText ? await semanticEmbedText(text) : [1];
            const values = Array.from({ length: 768 }, (_, index) => provided[index] ?? 0);
            return new Response(JSON.stringify({ embedding: { values } }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }
        throw new Error(`unexpected test fetch: ${url}`);
    };
}
async function runEngineOnce(options = {}) {
    const { userId = DEFAULT_TEST_USER, client, semanticEmbedText, proposerLlm, testInput, ...productionOptions } = options;
    const owner = (0, confirmed_owner_js_1.confirmedTestOwner)(userId);
    const databaseKey = `${process.env.DAOBREW_GRAPH_DB ?? "default"}\0${owner.userId}`;
    if (testInput)
        await seedTripletInput(databaseKey, testInput);
    else
        await deleteSeededRows(databaseKey);
    const fixture = await collectFixture({
        ...productionOptions,
        userId,
        client,
        semanticEmbedText,
        proposerLlm,
        testInput,
    });
    installCurlShim();
    const saved = {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        DAOBREW_USER_ID: process.env.DAOBREW_USER_ID,
        DAOBREW_CONFIG_FILE: process.env.DAOBREW_CONFIG_FILE,
        DAOBREW_TEST_BIOMETRICS_FIXTURE: process.env.DAOBREW_TEST_BIOMETRICS_FIXTURE,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    const savedFetch = globalThis.fetch;
    process.env.HOME = owner.homeDirectory;
    process.env.PATH = `${shimDirectory}${node_path_1.default.delimiter}${saved.PATH ?? ""}`;
    process.env.DAOBREW_USER_ID = owner.userId;
    process.env.DAOBREW_CONFIG_FILE = node_path_1.default.join(owner.homeDirectory, ".daobrew", "config.json");
    process.env.DAOBREW_TEST_BIOMETRICS_FIXTURE = JSON.stringify(fixture);
    if (proposerLlm || semanticEmbedText) {
        process.env.GEMINI_API_KEY = "test-only-gemini-key";
        globalThis.fetch = testFetch(proposerLlm, semanticEmbedText);
    }
    try {
        return await (0, run_js_1.runEngineOnce)(productionOptions);
    }
    finally {
        globalThis.fetch = savedFetch;
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
    }
}
