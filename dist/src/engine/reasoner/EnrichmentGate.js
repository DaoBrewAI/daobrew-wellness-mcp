"use strict";
/**
 * EnrichmentGate — causal-engine-v2 P2, the reasoner's 7th gate.
 *
 * Sits after the six existing gates (citation / title_ban /
 * time_plausibility / biometrics_firewall / recurrence_cross_source /
 * non_clinical_language). It answers one question: does a corpus theme
 * appear on a pattern's days *more than it does at baseline*, by enough,
 * with enough real backing, to earn attribution-candidate status?
 *
 * The core is a CONTROL RATIO, not a raw count: a theme's hit-rate on
 * the target pattern's days divided by its hit-rate on a reference
 * class (recharging + balanced days). Raw counts let one talkative day
 * flood a high-frequency axis; the control ratio is what let the memory
 * axis show real signal (causal 1.61x / pricing 1.46x) while the
 * calendar axis washed out to noise (<=1x, demoted to context).
 *
 * A theme is promoted to an attribution candidate only if it clears all
 * five conditions; otherwise it degrades to context_only,
 * insufficient_power, or no_data — never a silent pass.
 *
 * Provenance: fixtures/causal-engine-v2/scripts/reunify/enrichment_unified.py
 * and findings.md F5/F7. The enrichment ratio and reference class are
 * ported verbatim; the five-condition gate is the round-4 candidate
 * contract.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ENRICHMENT_THRESHOLDS = void 0;
exports.enrichmentRatio = enrichmentRatio;
exports.roundRatio = roundRatio;
exports.enrichmentGate = enrichmentGate;
exports.DEFAULT_ENRICHMENT_THRESHOLDS = {
    minRatio: 2.0,
    minBackedDays: 3,
    minSourcesPerDay: 2,
};
/**
 * Control ratio: the theme's rate on the target days over its rate on
 * the reference class. Returns Infinity when the theme never appears in
 * the reference class but does appear on target days (a real, if
 * unquantifiable, signal); 0 when it never appears on target days.
 */
function enrichmentRatio(targetHits, targetN, referenceRate) {
    if (targetN <= 0)
        return 0;
    const targetRate = targetHits / targetN;
    if (targetRate === 0)
        return 0;
    if (referenceRate === 0)
        return Infinity;
    return targetRate / referenceRate;
}
/** Round to the same 2 decimals the Python reference emits, for parity. */
function roundRatio(ratio) {
    if (!Number.isFinite(ratio))
        return ratio;
    return Math.round(ratio * 100) / 100;
}
/**
 * The five-condition candidate gate. Order matters: coverage first (a
 * candidate with no backed days is no_data, not a weak candidate), then
 * enrichment strength, then multi-source support, then RTM/workload
 * flagging (which annotates but does not reject — the flags travel with
 * the surviving claim).
 */
function enrichmentGate(input) {
    const t = input.thresholds ?? exports.DEFAULT_ENRICHMENT_THRESHOLDS;
    const ratio = roundRatio(enrichmentRatio(input.targetHits, input.targetN, input.referenceRate));
    const backed = input.citedDays.filter((d) => d.backed);
    const multiSource = backed.filter((d) => new Set(d.sources).size >= t.minSourcesPerDay);
    const reasons = [];
    const flags = [];
    if (input.rtmSuspected) {
        flags.push("regression-to-mean: cited days are self-selected extremes; timing is descriptive, not evidential");
    }
    // Workload and physiological response are mutual causes — always flag.
    flags.push("workload confound: work volume and body reaction share a common cause");
    // Condition 1: coverage — no backed cited day means no physiological
    // basis, whatever the corpus says.
    if (backed.length === 0) {
        reasons.push("no cited day falls inside real biometric coverage");
        return mk("no_data");
    }
    // Condition 2: enough backed days to separate a real pattern from a
    // single coincidence.
    if (backed.length < t.minBackedDays) {
        reasons.push(`only ${backed.length} backed day(s); need >= ${t.minBackedDays}`);
        return mk("insufficient_power");
    }
    // Condition 3: enrichment strength — control ratio clears the bar.
    if (!(ratio >= t.minRatio)) {
        reasons.push(`enrichment ${Number.isFinite(ratio) ? ratio + "x" : "0x"} below ${t.minRatio}x`);
        return mk("context_only");
    }
    // Condition 4: multi-source support — single-source days are not
    // cross-corroborated.
    if (multiSource.length < t.minBackedDays) {
        reasons.push(`only ${multiSource.length} backed day(s) carry >= ${t.minSourcesPerDay} sources; need >= ${t.minBackedDays}`);
        return mk("insufficient_power");
    }
    // Condition 5 is the claim ceiling itself: even a clean pass is capped
    // at attribution_candidate — n=1 passive logs never settle causality.
    reasons.push(`enrichment ${Number.isFinite(ratio) ? ratio + "x" : "inf"} over ${input.referenceN}-day reference; ${multiSource.length} multi-source backed days`);
    return mk("attribution_candidate");
    function mk(verdict) {
        return {
            theme: input.theme,
            verdict,
            ratio,
            backedDays: backed.map((d) => d.date),
            multiSourceBackedDays: multiSource.map((d) => d.date),
            reasons,
            flags,
        };
    }
}
