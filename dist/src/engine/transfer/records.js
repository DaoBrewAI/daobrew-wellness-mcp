"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTransferProvider = resolveTransferProvider;
exports.emitTransferRecord = emitTransferRecord;
const graph_db_js_1 = require("../../graph-db.js");
const user_scope_js_1 = require("../user-scope.js");
const gemini_js_1 = require("../embeddings/gemini.js");
const sweep_js_1 = require("../embeddings/sweep.js");
const keys_js_1 = require("../memory/keys.js");
const consent_js_1 = require("./consent.js");
const vectors_js_1 = require("./vectors.js");
function stringArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function textOrNull(value) {
    return typeof value === "string" && value.trim() ? value : null;
}
function litText(value) {
    return value === null || value === undefined ? "NULL" : (0, graph_db_js_1.q)(String(value));
}
/** First entry of the future action ontology; constant until more method shapes exist. */
const METHOD_CLASS = "task_package";
/**
 * Fixed engine-local frame, matching VERIFY_TZ_OFFSET_HOURS in memory/verify.ts
 * and the localDayKey convention in reasoner/v2Context.ts.
 */
const TRANSFER_TZ_OFFSET_HOURS = -7;
/**
 * Week bucket (Monday-start) containing `epochSeconds` in the fixed-offset local
 * frame. `key` is the Monday's YYYY-MM-DD; `startTs` is the epoch seconds of
 * Monday 00:00 in that frame — the only timestamp transfer_records may store
 * (privacy: exact_ts_absent).
 */
function weekBucket(epochSeconds, offsetHours) {
    const shifted = new Date((epochSeconds + offsetHours * 3600) * 1000);
    const dayStartMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
    const mondayMs = dayStartMs - daysSinceMonday * 86_400_000;
    return {
        key: new Date(mondayMs).toISOString().slice(0, 10),
        startTs: mondayMs / 1000 - offsetHours * 3600,
    };
}
/** Gemini needs a key; jobs degrade to NULL-embedding rows without one. */
function resolveTransferProvider() {
    try {
        return new gemini_js_1.GeminiEmbeddingProvider();
    }
    catch {
        return null;
    }
}
async function emitTransferRecord(input) {
    const warnings = [];
    if (input.verdict !== "no_recurrence_observed" && input.verdict !== "pattern_recurred") {
        return { written: 0, warnings }; // insufficient_observation settles nothing transferable
    }
    if (!(await (0, consent_js_1.isOptedIn)(input.userId, input.query))) {
        return { written: 0, warnings }; // default-closed, silently
    }
    if (!input.salt) {
        return { written: 0, warnings: ["transfer record skipped: DAOBREW_TRANSFER_SALT unset (fail closed)"] };
    }
    const props = input.ghostProps;
    const stressPattern = typeof props.selected_pattern === "string" && props.selected_pattern.trim()
        ? props.selected_pattern
        : "unknown";
    const rootCauseClass = typeof props.root_cause_class === "string" && props.root_cause_class.trim()
        ? props.root_cause_class
        : "productivity";
    const trigger = (0, vectors_js_1.canonicalTriggerText)({
        stressPattern,
        rootCauseClass,
        contextTerms: stringArray(props.linked_patterns),
    });
    let embeddingLiteral = "NULL";
    if (input.provider) {
        const [vector] = await input.provider.embed([trigger]);
        embeddingLiteral = (0, sweep_js_1.vectorLiteral)(vector);
    }
    else {
        warnings.push("transfer trigger embedding skipped: no embedding provider (row is backfillable)");
    }
    const brief = props.brief && typeof props.brief === "object" ? props.brief : {};
    const method = {
        suggested_block: brief.suggested_block ?? null,
        artifact_spec: typeof brief.artifact_spec === "string" ? brief.artifact_spec : null,
    };
    const outcome = input.verdict === "no_recurrence_observed" ? "worked" : "did_not_work";
    const verdictRows = await input.query(`SELECT verdict FROM thread_verifications WHERE user_id = ${user_scope_js_1.SCOPED_USER_ID_SQL} AND thread_id = ${(0, graph_db_js_1.q)(input.threadId)} AND kind = 'verdict'`);
    let confirmations = 0;
    let contradictions = 0;
    for (const row of verdictRows) {
        if (row.verdict === "no_recurrence_observed")
            confirmations += 1;
        else if (row.verdict === "pattern_recurred")
            contradictions += 1;
    }
    const settled = confirmations + contradictions;
    const outcomeStrength = settled > 0 ? Number((confirmations / settled).toFixed(4)) : 0;
    const hash = (0, keys_js_1.contributorHash)(input.userId, input.salt);
    const id = (0, keys_js_1.transferRecordId)({ contributorHash: hash, threadKey: input.threadKey, handledAtTs: input.handledAtTs });
    const contextBucket = { stress_pattern: stressPattern, root_cause_class: rootCauseClass };
    // §6.3 provenance: quality tiers travel with the record; the Reasoner stamps
    // source_quality into the episode root props, claim_level is the evidence tier.
    const sourceQuality = textOrNull(props.source_quality);
    const evidenceQuality = textOrNull(props.claim_level);
    // §6.2.4 exact_ts_absent: created_at_ts is coarsened to the week-bucket start —
    // the exact emission timestamp never reaches the cross-user store.
    const week = weekBucket(input.nowTs, TRANSFER_TZ_OFFSET_HOURS);
    await input.exec(`INSERT INTO transfer_records(id, contributor_hash, trigger_embedding, trigger_text, method_json, outcome, outcome_strength, context_bucket_json, source_quality, evidence_quality, method_class, created_week_bucket, created_at_ts)\n` +
        `VALUES (${(0, graph_db_js_1.q)(id)}, ${(0, graph_db_js_1.q)(hash)}, ${embeddingLiteral}, ${(0, graph_db_js_1.q)(trigger)}, ${(0, graph_db_js_1.q)(JSON.stringify(method))}::jsonb, ${(0, graph_db_js_1.q)(outcome)}, ${outcomeStrength}, ${(0, graph_db_js_1.q)(JSON.stringify(contextBucket))}::jsonb, ${litText(sourceQuality)}, ${litText(evidenceQuality)}, ${(0, graph_db_js_1.q)(METHOD_CLASS)}, ${(0, graph_db_js_1.q)(week.key)}, ${week.startTs})\n` +
        `ON CONFLICT (id) DO NOTHING;`);
    return { written: 1, warnings };
}
