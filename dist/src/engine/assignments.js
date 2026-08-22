"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ACCEPTANCE_VALUES = exports.DEFAULT_MRT_TREATMENT_P = exports.RANDOMIZED_ROUTE_POLICY = exports.OFFER_ELIGIBLE_ACTIONS = exports.ROUTE_POLICY = exports.ASSIGNMENT_PROBABILITY = exports.ASSIGNED_ACTION = exports.ELIGIBLE_ACTIONS = void 0;
exports.mrtTreatmentP = mrtTreatmentP;
exports.drawOfferArm = drawOfferArm;
exports.assignmentId = assignmentId;
exports.armedEpisodeTs = armedEpisodeTs;
exports.interventionAssignmentSql = interventionAssignmentSql;
exports.logInterventionAssignment = logInterventionAssignment;
exports.prepareArmedOffer = prepareArmedOffer;
exports.assignArmedOffer = assignArmedOffer;
exports.closeInterventionAssignment = closeInterventionAssignment;
const node_crypto_1 = require("node:crypto");
const graph_db_js_1 = require("../graph-db.js");
const user_scope_js_1 = require("./user-scope.js");
const keys_js_1 = require("./memory/keys.js");
exports.ELIGIBLE_ACTIONS = ["task_package"];
exports.ASSIGNED_ACTION = "task_package";
exports.ASSIGNMENT_PROBABILITY = 1; // deterministic policy — recorded, not assumed
exports.ROUTE_POLICY = "deterministic_argmax_v1";
// ── MRT randomization v1 (design 2026-07-06 "Verification-loop completeness"):
// system-initiated offers are randomized AT ARMING TIME. The detonate-time
// deterministic contract above is unchanged — its INSERT..ON CONFLICT DO
// NOTHING simply loses to the arming-time row (same episode id), which is
// exactly the intent-to-treat override semantics for held episodes.
exports.OFFER_ELIGIBLE_ACTIONS = ["task_package", "hold_noop"];
exports.RANDOMIZED_ROUTE_POLICY = "randomized_offer_v1";
exports.DEFAULT_MRT_TREATMENT_P = 0.9;
/** Treatment probability from env DAOBREW_MRT_TREATMENT_P — default 0.9,
 *  clamped to [0,1]; blank/junk falls back to the default. */
function mrtTreatmentP(raw = process.env.DAOBREW_MRT_TREATMENT_P) {
    const parsed = typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(parsed))
        return exports.DEFAULT_MRT_TREATMENT_P;
    return Math.min(1, Math.max(0, parsed));
}
/**
 * Hash-deterministic per-episode randomization: sha256(userId|ghostId|armedAtTs)
 * first 6 bytes / 2^48 → uniform [0,1); treatment iff draw < p. The key string
 * joins exactly like assignmentId (null armedAtTs → ""), so the draw and the
 * assignment row describe the same episode. Deterministic by construction:
 * retries within one arming re-draw the SAME arm; a re-arm (fresh armed_at_ts)
 * is a new decision point → fresh draw.
 */
function drawOfferArm(userId, ghostId, armedAtTs, p) {
    const clamped = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : exports.DEFAULT_MRT_TREATMENT_P;
    const digest = (0, node_crypto_1.createHash)("sha256")
        .update([userId, ghostId, String(armedAtTs ?? "")].join("|"))
        .digest();
    const draw = digest.readUIntBE(0, 6) / 2 ** 48;
    const treatment = draw < clamped;
    // Round so float dust (1 - 0.9 = 0.09999...) never reaches the SQL literal.
    const round6 = (value) => Math.round(value * 1e6) / 1e6;
    return {
        arm: treatment ? "task_package" : "hold_noop",
        draw,
        treatmentProbability: clamped,
        assignmentProbability: round6(treatment ? clamped : 1 - clamped),
    };
}
exports.USER_ACCEPTANCE_VALUES = ["accepted", "edited", "rejected"];
function assignmentId(input) {
    return `ivn_${(0, keys_js_1.sha24)([input.userId, input.ghostId, String(input.armedAtTs ?? "")].join("|"))}`;
}
/** The episode timestamp both detonate AND detonate_done key the assignment
 *  id on. Ghost ids are stable across armings and the upsert conflict path
 *  PRESERVES created_at_ts, so only the transition-stamped props.armed_at_ts
 *  (upsert.ts nodeSql) separates episodes — created_at_ts is the fallback for
 *  legacy ghosts armed before the stamp existed. */
function armedEpisodeTs(ghostProps, createdAtTs) {
    const armed = ghostProps?.armed_at_ts;
    return typeof armed === "number" && Number.isFinite(armed) ? armed : createdAtTs;
}
function vocab(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function litText(value) {
    return value === null ? "NULL" : (0, graph_db_js_1.q)(value);
}
/**
 * Build the idempotent assignment INSERT without executing it.
 *
 * The production graph writer uses this to place the normal arming-time
 * assignment in the same transaction as offer_state, the graph delta, and the
 * generation receipt. logInterventionAssignment remains the fail-soft retry
 * boundary after that transaction, so a missing/temporarily unavailable
 * research table can never block the user-visible causal graph.
 */
function interventionAssignmentSql(input) {
    const stressPattern = vocab(input.ghostProps?.selected_pattern);
    const rootCauseClass = vocab(input.ghostProps?.root_cause_class);
    const policy = input.assignment ?? {
        assignedAction: exports.ASSIGNED_ACTION,
        assignmentProbability: exports.ASSIGNMENT_PROBABILITY,
        routePolicy: exports.ROUTE_POLICY,
        eligibleActions: exports.ELIGIBLE_ACTIONS,
    };
    return (`INSERT INTO intervention_assignments(` +
        `id, user_id, ghost_id, thread_key, stress_pattern, root_cause_class, ` +
        `eligible_actions_json, assigned_action, assignment_probability, route_policy, created_at_ts) ` +
        `VALUES (${(0, graph_db_js_1.q)(assignmentId(input))}, ${(0, graph_db_js_1.q)(input.userId)}, ${(0, graph_db_js_1.q)(input.ghostId)}, ` +
        `${(0, graph_db_js_1.q)(`root:${input.ghostId}`)}, ${litText(stressPattern)}, ${litText(rootCauseClass)}, ` +
        `${(0, graph_db_js_1.q)(JSON.stringify(policy.eligibleActions))}::jsonb, ${(0, graph_db_js_1.q)(policy.assignedAction)}, ${policy.assignmentProbability}, ` +
        `${(0, graph_db_js_1.q)(policy.routePolicy)}, ${Math.floor(input.nowTs)}) ` +
        `ON CONFLICT (id) DO NOTHING;`);
}
async function logInterventionAssignment(input) {
    if (input.storeKind !== "postgres")
        return { logged: false };
    try {
        await input.exec(interventionAssignmentSql(input));
        return { logged: true };
    }
    catch (err) {
        return { logged: false, warning: `assignment log failed: ${err?.message ?? err}` };
    }
}
/** Pure arming-time decision used by both the legacy helper and the atomic
 * production graph transaction. Keeping the episode-key/draw logic in one
 * place prevents the graph stamp and assignment row from describing different
 * randomization arms. */
function prepareArmedOffer(input) {
    const armedAtTs = armedEpisodeTs(input.ghostProps, input.createdAtTs);
    const draw = drawOfferArm(input.userId, input.ghostId, armedAtTs, input.treatmentP ?? mrtTreatmentP());
    const offerState = draw.arm === "task_package" ? "offered" : "held";
    return {
        offerState,
        armedAtTs,
        ghostProps: { ...input.ghostProps, offer_state: offerState },
        assignment: {
            assignedAction: draw.arm,
            assignmentProbability: draw.assignmentProbability,
            routePolicy: exports.RANDOMIZED_ROUTE_POLICY,
            eligibleActions: exports.OFFER_ELIGIBLE_ACTIONS,
        },
    };
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
/**
 * MRT randomization v1 standalone compatibility helper. Production engine
 * runs now use prepareArmedOffer inside upsertGraphDelta so offer_state cannot
 * land after a generation marker; this helper retains the same behavior for
 * isolated callers/tests that do not own a generation transaction.
 *
 * Boundary rules match the rest of this module: Postgres warm-tier only,
 * fail-soft by contract (resolves with a warning instead of rejecting —
 * randomization must never block arming), closed vocabulary only. A held
 * episode's daobrew_detonate is ALWAYS honored: the detonate-time INSERT is
 * ON CONFLICT DO NOTHING against the hold_noop row logged here, so the
 * control assignment survives and detonate_done's artifact_done=true marks
 * the intent-to-treat override.
 */
async function assignArmedOffer(input) {
    if (input.storeKind !== "postgres")
        return { assigned: false };
    try {
        const rows = await input.query(`SELECT id, user_id, created_at_ts, props_json FROM graph_nodes ` +
            `WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND id = ${(0, graph_db_js_1.q)(input.ghostId)} AND kind = 'ghost'`);
        if (rows.length === 0)
            return { assigned: false, warning: `offer randomization skipped: armed root ${input.ghostId} not found` };
        const props = parseProps(rows[0].props_json);
        if (props.status !== "armed")
            return { assigned: false };
        const createdAtRaw = Number(rows[0].created_at_ts);
        const prepared = prepareArmedOffer({
            userId: input.userId,
            ghostId: input.ghostId,
            ghostProps: props,
            createdAtTs: Number.isFinite(createdAtRaw) ? createdAtRaw : null,
            treatmentP: input.treatmentP,
        });
        const logged = await logInterventionAssignment({
            userId: input.userId,
            ghostId: input.ghostId,
            armedAtTs: prepared.armedAtTs,
            ghostProps: props,
            storeKind: input.storeKind,
            exec: input.exec,
            nowTs: input.nowTs,
            assignment: prepared.assignment,
        });
        // Idempotent stamp — re-runs of the same episode re-derive the same state.
        await input.exec(`UPDATE graph_nodes SET props_json = COALESCE(props_json, '{}'::jsonb) ` +
            `|| jsonb_build_object('offer_state', ${(0, graph_db_js_1.q)(prepared.offerState)}) ` +
            `WHERE user_id = ${(0, graph_db_js_1.q)(input.userId)} AND id = ${(0, graph_db_js_1.q)(input.ghostId)};`);
        return {
            assigned: true,
            offerState: prepared.offerState,
            armedAtTs: prepared.armedAtTs,
            ghostProps: prepared.ghostProps,
            warning: logged.warning,
        };
    }
    catch (err) {
        return { assigned: false, warning: `offer randomization failed: ${err?.message ?? err}` };
    }
}
async function closeInterventionAssignment(input) {
    if (input.storeKind !== "postgres")
        return { logged: false };
    const acceptance = input.userAcceptance ? `, user_acceptance = ${(0, graph_db_js_1.q)(input.userAcceptance)}` : "";
    const sql = `UPDATE intervention_assignments ` +
        `SET artifact_done = TRUE, closed_at_ts = ${Math.floor(input.nowTs)}${acceptance} ` +
        `WHERE id = ${(0, graph_db_js_1.q)(assignmentId(input))};`;
    try {
        await input.exec(sql);
        return { logged: true };
    }
    catch (err) {
        return { logged: false, warning: `assignment close failed: ${err?.message ?? err}` };
    }
}
