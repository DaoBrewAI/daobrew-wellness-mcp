"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.K_ANON_THRESHOLD_DEFAULT = exports.FINAL_K_DEFAULT = exports.STAGE1_LIMIT_DEFAULT = exports.TRANSFER_WEIGHTS = void 0;
exports.stage1AnnSql = stage1AnnSql;
exports.bucketContributorCountsSql = bucketContributorCountsSql;
exports.contextFit = contextFit;
exports.rerankTransferCandidates = rerankTransferCandidates;
exports.retrieveTransferCandidates = retrieveTransferCandidates;
const sweep_js_1 = require("../embeddings/sweep.js");
exports.TRANSFER_WEIGHTS = { trigger: 0.5, outcome: 0.3, context: 0.2 };
exports.STAGE1_LIMIT_DEFAULT = 15;
exports.FINAL_K_DEFAULT = 3;
exports.K_ANON_THRESHOLD_DEFAULT = 5;
function stage1AnnSql(triggerVector, limit = exports.STAGE1_LIMIT_DEFAULT) {
    const vec = (0, sweep_js_1.vectorLiteral)(triggerVector);
    return (`SELECT id, contributor_hash, method_json, outcome, outcome_strength, context_bucket_json, created_at_ts,\n` +
        `       trigger_embedding <=> ${vec} AS distance\n` +
        `  FROM transfer_records\n` +
        ` WHERE trigger_embedding IS NOT NULL AND outcome = 'worked'\n` +
        ` ORDER BY trigger_embedding <=> ${vec}\n` +
        ` LIMIT ${limit};`);
}
/** Distinct-contributor counts per coarse bucket — a separate grouped query
 *  (window functions cannot COUNT(DISTINCT), and the ANN query stays pure). */
function bucketContributorCountsSql() {
    return (`SELECT context_bucket_json ->> 'stress_pattern' AS stress_pattern,\n` +
        `       context_bucket_json ->> 'root_cause_class' AS root_cause_class,\n` +
        `       COUNT(DISTINCT contributor_hash) AS contributors\n` +
        `  FROM transfer_records\n` +
        ` GROUP BY 1, 2;`);
}
function parseBucket(value) {
    let record = {};
    if (value && typeof value === "object" && !Array.isArray(value))
        record = value;
    else if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                record = parsed;
        }
        catch {
            // fall through to unknowns
        }
    }
    return {
        stress_pattern: typeof record.stress_pattern === "string" ? record.stress_pattern : "unknown",
        root_cause_class: typeof record.root_cause_class === "string" ? record.root_cause_class : "unknown",
    };
}
function bucketKey(bucket) {
    return `${bucket.stress_pattern}|${bucket.root_cause_class}`;
}
function contextFit(candidateBucket, currentBucket) {
    let matches = 0;
    if (candidateBucket.stress_pattern === currentBucket.stress_pattern)
        matches += 1;
    if (candidateBucket.root_cause_class === currentBucket.root_cause_class)
        matches += 1;
    return matches / 2;
}
function rerankTransferCandidates(rows, currentBucket, k = exports.FINAL_K_DEFAULT) {
    const scored = rows.map((row) => {
        const bucket = parseBucket(row.context_bucket_json);
        const distance = Number(row.distance) || 0;
        const outcomeStrength = Number(row.outcome_strength) || 0;
        const score = exports.TRANSFER_WEIGHTS.trigger * (1 - distance) +
            exports.TRANSFER_WEIGHTS.outcome * outcomeStrength +
            exports.TRANSFER_WEIGHTS.context * contextFit(bucket, currentBucket);
        return {
            contributorHash: typeof row.contributor_hash === "string" ? row.contributor_hash : "",
            candidate: {
                id: String(row.id),
                method_json: row.method_json && typeof row.method_json === "object" ? row.method_json : {},
                outcome: String(row.outcome),
                outcome_strength: outcomeStrength,
                context_bucket_json: bucket,
                score: Number(score.toFixed(6)),
            },
        };
    });
    scored.sort((a, b) => b.candidate.score - a.candidate.score || a.candidate.id.localeCompare(b.candidate.id));
    // Read-time contribution bound + result diversity (research doc §1.7,
    // "contribution-bounded"): k-anonymity counts distinct contributors in the
    // pool, but without this cap the served top-k could all come from one
    // contributor. Keep only the highest-scoring record per contributor_hash;
    // rows with a missing/empty hash each count as their own contributor.
    const seenContributors = new Set();
    const capped = scored.filter(({ contributorHash }) => {
        if (!contributorHash)
            return true;
        if (seenContributors.has(contributorHash))
            return false;
        seenContributors.add(contributorHash);
        return true;
    });
    // contributor_hash is stripped here — it must never appear on ScoredTransferCandidate.
    return capped.slice(0, k).map(({ candidate }) => candidate);
}
async function priorFallback(input) {
    const prior = input.readPrior ? await input.readPrior(input.contextBucket.stress_pattern) : null;
    return prior
        ? { source: "population_priors", candidates: [], prior }
        : { source: "none", candidates: [] };
}
async function retrieveTransferCandidates(input) {
    const pool = await input.query(stage1AnnSql(input.triggerVector, input.stage1Limit ?? exports.STAGE1_LIMIT_DEFAULT));
    if (pool.length === 0)
        return priorFallback(input);
    const threshold = input.kAnonThreshold ?? exports.K_ANON_THRESHOLD_DEFAULT;
    const countRows = await input.query(bucketContributorCountsSql());
    const contributorsByBucket = new Map();
    for (const row of countRows) {
        contributorsByBucket.set(bucketKey(parseBucket({ stress_pattern: row.stress_pattern, root_cause_class: row.root_cause_class })), Number(row.contributors) || 0);
    }
    const servable = pool.filter((row) => {
        const key = bucketKey(parseBucket(row.context_bucket_json));
        return (contributorsByBucket.get(key) ?? 0) >= threshold;
    });
    if (servable.length === 0)
        return priorFallback(input);
    return {
        source: "transfer_records",
        candidates: rerankTransferCandidates(servable, input.contextBucket, input.k ?? exports.FINAL_K_DEFAULT),
    };
}
