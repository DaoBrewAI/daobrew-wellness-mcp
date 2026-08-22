"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTransferPriorsJob = runTransferPriorsJob;
exports.readPopulationPrior = readPopulationPrior;
const node_crypto_1 = require("node:crypto");
const graph_db_js_1 = require("../../graph-db.js");
const keys_js_1 = require("../memory/keys.js");
const retrieve_js_1 = require("./retrieve.js");
const JOB_NAME = "transfer_priors";
const COHORT_KEY = "global";
const TOP_METHODS_CAP = 3;
async function runTransferPriorsJob(deps = {}) {
    const exec = deps.exec ?? graph_db_js_1.execSql;
    const query = deps.query ?? graph_db_js_1.queryJson;
    const nowTs = deps.nowTs ?? (() => Math.floor(Date.now() / 1000));
    const threshold = deps.kAnonThreshold ?? retrieve_js_1.K_ANON_THRESHOLD_DEFAULT;
    const startTs = nowTs();
    const warnings = [];
    const aggregates = await query(`SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern, outcome, COUNT(*) AS n, COUNT(DISTINCT contributor_hash) AS contributors\n` +
        `  FROM transfer_records\n` +
        ` GROUP BY 1, 2;`);
    let priorsWritten = 0;
    let version = null;
    if (aggregates.length > 0) {
        const methodRows = await query(`SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern, method_json, outcome_strength, contributor_hash\n` +
            `  FROM transfer_records\n` +
            ` WHERE outcome = 'worked';`);
        const versionRows = await query(`SELECT MAX(version) AS v FROM population_priors WHERE cohort_key = ${(0, graph_db_js_1.q)(COHORT_KEY)};`);
        version = (Number(versionRows[0]?.v) || 0) + 1;
        const byPattern = new Map();
        for (const row of aggregates) {
            const pattern = String(row.stress_pattern ?? "unknown");
            const agg = byPattern.get(pattern) ?? { worked: 0, didNotWork: 0, contributors: 0 };
            const n = Number(row.n) || 0;
            if (row.outcome === "worked") {
                agg.worked += n;
                // Contributor gate keys off WORKED contributors — the only rows whose
                // methods can be published.
                agg.contributors = Math.max(agg.contributors, Number(row.contributors) || 0);
            }
            else {
                agg.didNotWork += n;
            }
            byPattern.set(pattern, agg);
        }
        for (const [pattern, agg] of [...byPattern.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const topMethods = agg.contributors >= threshold
                ? methodRows
                    .filter((row) => String(row.stress_pattern) === pattern)
                    .sort((a, b) => (Number(b.outcome_strength) || 0) - (Number(a.outcome_strength) || 0))
                    .slice(0, TOP_METHODS_CAP)
                    .map((row) => ({ method: row.method_json ?? {}, outcome_strength: Number(row.outcome_strength) || 0 }))
                : [];
            const prior = {
                worked: agg.worked,
                did_not_work: agg.didNotWork,
                top_methods: topMethods,
            };
            const sampleSize = agg.worked + agg.didNotWork;
            const confidence = Number(Math.min(1, agg.contributors / 10).toFixed(4));
            const id = `pp_${(0, keys_js_1.sha24)([COHORT_KEY, pattern, String(version)].join("|"))}`;
            await exec(`INSERT INTO population_priors(id, cohort_key, stress_pattern, prior_json, sample_size, confidence, version, created_at_ts)\n` +
                `VALUES (${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(COHORT_KEY)}, ${(0, graph_db_js_1.q)(pattern)}, ${(0, graph_db_js_1.q)(JSON.stringify(prior))}::jsonb, ${sampleSize}, ${confidence}, ${version}, ${nowTs()})\n` +
                `ON CONFLICT (id) DO NOTHING;`);
            priorsWritten += 1;
        }
    }
    const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
    await exec(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
        `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(JOB_NAME)}, ${durationMs}, ${priorsWritten}, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify(warnings))}::jsonb, ${nowTs()});`);
    return { priorsWritten, version, warnings };
}
async function readPopulationPrior(stressPattern, query = graph_db_js_1.queryJson) {
    const rows = await query(`SELECT stress_pattern, prior_json, sample_size, confidence, version\n` +
        `  FROM population_priors WHERE cohort_key = ${(0, graph_db_js_1.q)(COHORT_KEY)} AND stress_pattern = ${(0, graph_db_js_1.q)(stressPattern)}\n` +
        ` ORDER BY version DESC LIMIT 1;`);
    if (rows.length === 0)
        return null;
    const row = rows[0];
    const parsed = typeof row.prior_json === "string" ? JSON.parse(row.prior_json) : row.prior_json ?? {};
    return {
        stress_pattern: String(row.stress_pattern),
        prior_json: {
            worked: Number(parsed.worked) || 0,
            did_not_work: Number(parsed.did_not_work) || 0,
            top_methods: Array.isArray(parsed.top_methods) ? parsed.top_methods : [],
        },
        sample_size: Number(row.sample_size) || 0,
        confidence: Number(row.confidence) || 0,
        version: Number(row.version) || 0,
    };
}
