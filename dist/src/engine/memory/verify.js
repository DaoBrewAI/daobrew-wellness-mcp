"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHandledAtTs = resolveHandledAtTs;
exports.recordSkippedDoneObservation = recordSkippedDoneObservation;
exports.recordCoverageObservations = recordCoverageObservations;
exports.recordHeldTriggerObservation = recordHeldTriggerObservation;
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const v2Context_js_1 = require("../reasoner/v2Context.js");
const keys_js_1 = require("./keys.js");
const PREDICTED_OUTCOME = "no_same_thread_trigger_within_horizon";
/** Day-bucket timezone for engine_ran_no_trigger observations: the engine's
 *  existing fixed-offset convention (v2Context DEFAULT_OFFSET_HOURS = -7,
 *  used by coverage/signature localDayKey). Not exported there, so pinned
 *  here — keep the two in sync if the engine ever grows a real tz config. */
const VERIFY_TZ_OFFSET_HOURS = -7;
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
function parseProps(value) {
    if (value && typeof value === "object" && !Array.isArray(value))
        return value;
    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                return parsed;
        }
        catch {
            // fall through to empty props
        }
    }
    return {};
}
function finiteOrNull(value) {
    const num = typeof value === "string" && value.trim() ? Number(value) : value;
    return typeof num === "number" && Number.isFinite(num) ? num : null;
}
function textOrNull(value) {
    return typeof value === "string" && value.trim() ? value : null;
}
/** Handled timestamp for a done ghost whose props are already in hand:
 *  props.done_at_ts (stamped by daobrew_detonate_done since V2) ?? the
 *  e_done_<ghostId> edge's created_at_ts (the only persisted
 *  handled-timestamp before that). Shared with the V5 settlement pass
 *  (nightly.ts) so both sides resolve the same `vd:<handled>` bucket. */
async function resolveHandledAtTs(userId, ghostId, ghostProps, query) {
    const handled = finiteOrNull(ghostProps.done_at_ts);
    if (handled !== null)
        return handled;
    const edgeRows = await query(`SELECT created_at_ts FROM graph_edges WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND id = ${(0, graph_db_js_1.q)(`e_done_${ghostId}`)}`);
    return finiteOrNull(edgeRows[0]?.created_at_ts);
}
/** Handled timestamp for a done ghost, fetching its props first. */
async function handledAtTs(userId, ghostId, query) {
    const ghostRows = await query(`SELECT props_json FROM graph_nodes WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND id = ${(0, graph_db_js_1.q)(ghostId)}`);
    const ghostProps = parseProps(ghostRows[0]?.props_json);
    const handled = await resolveHandledAtTs(userId, ghostId, ghostProps, query);
    return { handled, ghostProps };
}
/**
 * Record a same_thread_trigger observation when a run's armed delta was
 * skipped because the persistent root is already done. Bucketed by the
 * delta root's week_start, so a same-week re-fire is a single row.
 */
async function recordSkippedDoneObservation(input) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return { written: 0 };
    const exec = input.exec ?? graph_db_js_1.execSql;
    const query = input.query ?? graph_db_js_1.queryJson;
    const now = input.nowTs ?? Math.floor(Date.now() / 1000);
    const { userId, ghostId } = input;
    const { handled, ghostProps } = await handledAtTs(userId, ghostId, query);
    const rootNode = input.delta.nodes.find((node) => node.id === input.delta.armed_root_cause.node_id);
    const rootProps = parseProps(rootNode?.props_json);
    const weekStart = textOrNull(rootProps.week_start) ??
        // Defensive fallback only: buildDelta always stamps week_start on the
        // armed root. An ISO week key keeps the id deterministic regardless.
        new Date(now * 1000).toISOString().slice(0, 10);
    const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: ghostId });
    const tid = (0, keys_js_1.threadId)(userId, threadKey);
    // bucket prefixed — week_start and localDayKey are both YYYY-MM-DD and collide on Mondays
    const id = (0, keys_js_1.verificationId)({ threadId: tid, kind: "observation", bucket: `wk:${weekStart}` });
    const horizon = finiteOrNull(rootProps.verify_horizon_weeks) ?? finiteOrNull(ghostProps.verify_horizon_weeks);
    const details = {
        selected_pattern: rootProps.selected_pattern ?? null,
        week_start: rootProps.week_start ?? null,
        verify_horizon_weeks: rootProps.verify_horizon_weeks ?? null,
        claim_level: rootProps.claim_level ?? null,
        evidence_grade: rootProps.evidence_grade ?? null,
    };
    await exec(`INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_pattern_key, observed_week_start, observed_at_ts, details_json, created_at_ts)\n` +
        `VALUES (${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(tid)}, ${(0, graph_db_js_1.q)(threadKey)}, ${(0, graph_db_js_1.q)(ghostId)}, 'observation', 'same_thread_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(horizon, "horizon_weeks")}, ${(0, graph_db_js_1.q)(PREDICTED_OUTCOME)}, ${litText(textOrNull(rootProps.selected_pattern))}, ${(0, graph_db_js_1.q)(weekStart)}, ${now}, ${litJson(details)}, ${now})\n` +
        `ON CONFLICT (id) DO NOTHING;`);
    return { written: 1 };
}
/** MRT randomization v1: a held (control-arm) armed root is an episode that
 *  was deliberately NOT offered — observation-eligible like a done thread,
 *  anchored on armed_at_ts instead of done_at_ts. */
function isHeldControlGhost(props) {
    return props.status === "armed" && props.offer_state === "held";
}
/**
 * Coverage observations (D2): when a Postgres run ends watching/no_signal,
 * write one engine_ran_no_trigger row per done thread — "the engine ran
 * today and this handled thread did NOT re-fire". The local-day bucket in
 * the deterministic id caps it at 1/day/thread, which is what makes the
 * no_recurrence_observed verdict reachable at settlement (≥N quiet days).
 * MUST run BEFORE any watching upsert for the same run: a watching write
 * replaces ghost props wholesale (mergeGhostProps) and erases status='done'.
 *
 * MRT v1: held control episodes join the scan — a quiet run is equally
 * evidence that a withheld offer's pattern did not re-fire today. Their rows
 * carry handled_at_ts = armed_at_ts (episode anchor) and an arm:"control"
 * detail so settlement can tell the arms apart.
 */
async function recordCoverageObservations(input) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return { written: 0 };
    const exec = input.exec ?? graph_db_js_1.execSql;
    const query = input.query ?? graph_db_js_1.queryJson;
    const now = input.nowTs ?? Math.floor(Date.now() / 1000);
    const { userId } = input;
    const rows = await query(`SELECT id, props_json FROM graph_nodes WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND kind = 'ghost' AND (props_json ->> 'status' = 'done' OR (props_json ->> 'status' = 'armed' AND props_json ->> 'offer_state' = 'held'))`);
    if (rows.length === 0)
        return { written: 0 };
    const day = (0, v2Context_js_1.localDayKey)(now, VERIFY_TZ_OFFSET_HOURS);
    const values = rows.map((row) => {
        const props = parseProps(row.props_json);
        const ghostId = String(row.id);
        const held = isHeldControlGhost(props);
        const handled = finiteOrNull(held ? props.armed_at_ts : props.done_at_ts);
        const details = held ? { local_day: day, arm: "control" } : { local_day: day };
        const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: ghostId });
        const tid = (0, keys_js_1.threadId)(userId, threadKey);
        // bucket prefixed — week_start and localDayKey are both YYYY-MM-DD and collide on Mondays
        const id = (0, keys_js_1.verificationId)({ threadId: tid, kind: "observation", bucket: `day:${day}` });
        return `(${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(userId)}, ${(0, graph_db_js_1.q)(tid)}, ${(0, graph_db_js_1.q)(threadKey)}, ${(0, graph_db_js_1.q)(ghostId)}, 'observation', 'engine_ran_no_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(finiteOrNull(props.verify_horizon_weeks), "horizon_weeks")}, ${(0, graph_db_js_1.q)(PREDICTED_OUTCOME)}, ${now}, ${litJson(details)}, ${now})`;
    });
    await exec(`INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_at_ts, details_json, created_at_ts)\n` +
        `VALUES\n${values.join(",\n")}\n` +
        `ON CONFLICT (id) DO NOTHING;`);
    return { written: rows.length };
}
/**
 * Control-arm recurrence (MRT v1): a held root that the engine re-arms in a
 * LATER week than its arming week is the counterfactual analog of a done
 * thread re-firing — the pattern persisted without the offer. Bucketed by the
 * current week_start (`wk:` namespace, same as skipped-done triggers) so
 * within-week re-arms collapse to one row; the arming week itself never
 * counts (the episode IS that firing). Postgres-only, idempotent, fail-soft
 * at the call site.
 */
async function recordHeldTriggerObservation(input) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return { written: 0 };
    const exec = input.exec ?? graph_db_js_1.execSql;
    const now = input.nowTs ?? Math.floor(Date.now() / 1000);
    const props = input.ghostProps ?? {};
    if (!isHeldControlGhost(props))
        return { written: 0 };
    const weekStart = textOrNull(props.week_start);
    const firstWeek = textOrNull(props.first_seen_week) ?? weekStart;
    if (!weekStart || weekStart === firstWeek)
        return { written: 0 };
    const handled = finiteOrNull(props.armed_at_ts);
    const horizon = finiteOrNull(props.verify_horizon_weeks);
    const threadKey = (0, keys_js_1.deriveThreadKey)({ graphRootId: input.ghostId });
    const tid = (0, keys_js_1.threadId)(input.userId, threadKey);
    const id = (0, keys_js_1.verificationId)({ threadId: tid, kind: "observation", bucket: `wk:${weekStart}` });
    const details = {
        arm: "control",
        selected_pattern: props.selected_pattern ?? null,
        week_start: weekStart,
        first_seen_week: firstWeek,
        verify_horizon_weeks: props.verify_horizon_weeks ?? null,
        claim_level: props.claim_level ?? null,
    };
    await exec(`INSERT INTO thread_verifications(id, user_id, thread_id, thread_key, graph_root_id, kind, observation, handled_at_ts, horizon_weeks, predicted_outcome, observed_pattern_key, observed_week_start, observed_at_ts, details_json, created_at_ts)\n` +
        `VALUES (${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(input.userId)}, ${(0, graph_db_js_1.q)(tid)}, ${(0, graph_db_js_1.q)(threadKey)}, ${(0, graph_db_js_1.q)(input.ghostId)}, 'observation', 'same_thread_trigger', ${litNum(handled, "handled_at_ts")}, ${litNum(horizon, "horizon_weeks")}, ${(0, graph_db_js_1.q)(PREDICTED_OUTCOME)}, ${litText(textOrNull(props.selected_pattern))}, ${(0, graph_db_js_1.q)(weekStart)}, ${now}, ${litJson(details)}, ${now})\n` +
        `ON CONFLICT (id) DO NOTHING;`);
    return { written: 1 };
}
