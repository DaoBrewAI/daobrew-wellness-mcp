"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeProfileVector = writeProfileVector;
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const sweep_js_1 = require("../embeddings/sweep.js");
const v2Context_js_1 = require("../reasoner/v2Context.js");
const vectors_js_1 = require("./vectors.js");
/** Same fixed-offset day convention as verify.ts coverage buckets. */
const PROFILE_TZ_OFFSET_HOURS = -7;
const PROFILE_THREAD_CAP = 20;
function patternKeys(value) {
    const parsed = typeof value === "string" && value.trim() ? safeParse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
}
function safeParse(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return [];
    }
}
async function writeProfileVector(input) {
    const threads = await input.query(`SELECT thread_key, pattern_keys_json FROM causal_memory_threads WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND status = 'active' ORDER BY strength DESC, thread_key ASC LIMIT ${PROFILE_THREAD_CAP}`);
    if (threads.length === 0)
        return { written: 0, warnings: [] }; // nothing to profile — silent
    if (!input.provider) {
        return { written: 0, warnings: ["profile vector skipped: no embedding provider"] };
    }
    const latest = await input.query(`SELECT version, created_at_ts FROM user_vectors WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind = 'profile' ORDER BY version DESC LIMIT 1`);
    const today = (0, v2Context_js_1.localDayKey)(input.nowTs, PROFILE_TZ_OFFSET_HOURS);
    const latestVersion = Number(latest[0]?.version ?? 0) || 0;
    const latestTs = Number(latest[0]?.created_at_ts ?? NaN);
    if (Number.isFinite(latestTs) && (0, v2Context_js_1.localDayKey)(latestTs, PROFILE_TZ_OFFSET_HOURS) === today) {
        return { written: 0, warnings: [] }; // one vector per local day — re-runs are no-ops
    }
    const snapshot = await input.query(`SELECT claim_ceiling FROM user_model_snapshots WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} ORDER BY version DESC LIMIT 1`);
    const basis = (0, vectors_js_1.canonicalProfileText)({
        dominantPatterns: threads.flatMap((row) => patternKeys(row.pattern_keys_json)),
        threadKeys: threads.map((row) => String(row.thread_key)),
        snapshotClaimCeiling: typeof snapshot[0]?.claim_ceiling === "string" ? snapshot[0].claim_ceiling : null,
    });
    const [vector] = await input.provider.embed([basis]);
    await input.exec(`INSERT INTO user_vectors(user_id, kind, version, profile_embedding, basis_text, created_at_ts)\n` +
        `VALUES (${(0, graph_db_js_1.q)(input.userId)}, 'profile', ${latestVersion + 1}, ${(0, sweep_js_1.vectorLiteral)(vector)}, ${(0, graph_db_js_1.q)(basis)}, ${input.nowTs})\n` +
        `ON CONFLICT (user_id, kind, version) DO NOTHING;`);
    return { written: 1, warnings: [] };
}
