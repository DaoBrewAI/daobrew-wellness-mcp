"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalTriggerText = canonicalTriggerText;
exports.canonicalProfileText = canonicalProfileText;
exports.embedTriggerVector = embedTriggerVector;
exports.embedProfileVector = embedProfileVector;
/**
 * Canonical texts for the two 5B vector spaces. These are the ONLY strings
 * that ever reach the embedding provider for transfer purposes, and they are
 * built from closed vocabularies (pattern keys, root classes, thread keys) —
 * never from insight prose, transcripts, or snapshot text. Determinism
 * matters: the same trigger must embed to the same vector across runs, so
 * terms are lowercased, deduped, and sorted before joining.
 */
function normalizedTerms(values) {
    const seen = new Set();
    for (const value of values) {
        const term = value.trim().toLowerCase().replace(/^#+/, "");
        if (term)
            seen.add(term);
    }
    return [...seen].sort();
}
function canonicalTriggerText(input) {
    const head = `trigger ${input.stressPattern.trim().toLowerCase()} ${input.rootCauseClass.trim().toLowerCase()}`;
    const ctx = normalizedTerms(input.contextTerms);
    return ctx.length ? `${head} | ctx: ${ctx.join(" ")}` : head;
}
function canonicalProfileText(input) {
    const parts = [
        `profile patterns: ${normalizedTerms(input.dominantPatterns).join(" ")}`,
        `threads: ${[...new Set(input.threadKeys)].sort().join(" ")}`,
    ];
    if (input.snapshotClaimCeiling)
        parts.push(`ceiling: ${input.snapshotClaimCeiling}`);
    return parts.join(" | ");
}
async function embedTriggerVector(provider, input) {
    const text = canonicalTriggerText(input);
    const [vector] = await provider.embed([text]);
    return { text, vector };
}
async function embedProfileVector(provider, input) {
    const text = canonicalProfileText(input);
    const [vector] = await provider.embed([text]);
    return { text, vector };
}
