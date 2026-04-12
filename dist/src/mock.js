"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockWellnessState = mockWellnessState;
exports.mockElementDetail = mockElementDetail;
exports.mockStartSession = mockStartSession;
exports.mockSessionResult = mockSessionResult;
exports.mockSessionHistory = mockSessionHistory;
exports._resetWellnessCallCount = _resetWellnessCallCount;
const types_js_1 = require("./types.js");
let wellnessCallCount = 0;
function getQuadrant(yin, yang) {
    if (yin >= 50 && yang >= 50)
        return "peak";
    if (yin < 50 && yang >= 50)
        return "pushing_it";
    if (yin >= 50 && yang < 50)
        return "recharging";
    return "burnout";
}
const QUADRANT_LABELS = {
    peak: "In Flow",
    pushing_it: "Pushing It",
    recharging: "Recharging",
    burnout: "Running on Empty",
};
const QUADRANT_DESCRIPTIONS = {
    peak: "Your energy is in harmony. Maintain this state.",
    pushing_it: "Active but under-recovered. Consider rest soon.",
    recharging: "Well-recovered but low activity. Your body is conserving energy.",
    burnout: "Under-recovered and inactive. Gentle movement and rest recommended.",
};
function yinStateLabel(score) {
    if (score >= 80)
        return "Fully Charged";
    if (score >= 60)
        return "Steady";
    if (score >= 40)
        return "Thinning";
    if (score >= 20)
        return "Running Low";
    return "Empty";
}
function yangStateLabel(score) {
    if (score >= 80)
        return "Fired Up";
    if (score >= 60)
        return "Moving";
    if (score >= 40)
        return "Coasting";
    if (score >= 20)
        return "Sluggish";
    return "Stalled";
}
function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function timeAwareBias() {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 6)
        return { yinBias: -15, yangBias: -20, fireBias: 20, earthBias: 0 };
    if (hour >= 13 && hour < 15)
        return { yinBias: -10, yangBias: -10, fireBias: 0, earthBias: 15 };
    if (hour >= 9 && hour < 12)
        return { yinBias: 10, yangBias: 15, fireBias: 0, earthBias: -10 };
    return { yinBias: 0, yangBias: 0, fireBias: 0, earthBias: 0 };
}
function mockWellnessState(isDemo = false) {
    wellnessCallCount++;
    const bias = timeAwareBias();
    // First call always stressed (good first impression). Demo mode = always stressed.
    const stressed = isDemo || wellnessCallCount === 1 || wellnessCallCount % 3 === 0;
    const yin = Math.max(0, Math.min(100, rand(stressed ? 15 : 40, stressed ? 45 : 85) + bias.yinBias));
    const yang = Math.max(0, Math.min(100, rand(stressed ? 50 : 35, stressed ? 80 : 90) + bias.yangBias));
    const quadrant = getQuadrant(yin, yang);
    const scores = {
        wood: Math.max(0, Math.min(100, rand(stressed ? 40 : 10, stressed ? 80 : 45))),
        fire: Math.max(0, Math.min(100, rand(stressed ? 30 : 5, stressed ? 70 : 40) + bias.fireBias)),
        earth: Math.max(0, Math.min(100, rand(stressed ? 25 : 10, stressed ? 60 : 40) + bias.earthBias)),
        metal: Math.max(0, Math.min(100, rand(5, stressed ? 55 : 35))),
        water: Math.max(0, Math.min(100, rand(5, stressed ? 45 : 25))),
    };
    // On first call or demo, ensure at least one element is active (score >= 50)
    if (stressed) {
        const topKey = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])[0][0];
        if (scores[topKey] < 50)
            scores[topKey] = rand(55, 75);
    }
    const active = Object.entries(scores)
        .filter(([, s]) => s >= 50)
        .map(([e]) => e);
    const topElement = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])[0];
    return {
        _warning: "⚠️ SIMULATED DATA — no wearable connected. Connect Apple Watch or Oura Ring for real biometrics.",
        data_source: "mock",
        yin, yang, quadrant,
        quadrant_label: QUADRANT_LABELS[quadrant],
        quadrant_description: QUADRANT_DESCRIPTIONS[quadrant],
        yin_label: yinStateLabel(yin),
        yang_label: yangStateLabel(yang),
        active_elements: active,
        element_scores: scores,
        top_signal: active.length > 0
            ? `[SIMULATED] ${types_js_1.ELEMENT_LABELS[topElement[0]]} Qi · ${types_js_1.ELEMENT_SHORT_SUMMARIES[topElement[0]]}`
            : `[SIMULATED] All biometrics within normal range`,
        recommendation: active.length > 0
            ? `${types_js_1.ELEMENT_LABELS[topElement[0]]} Qi pattern detected (simulated). Connect a wearable for real data.`
            : `Simulated data — connect a wearable for real wellness assessment.`,
        last_updated: new Date().toISOString(),
    };
}
function mockElementDetail(element) {
    const score = rand(40, 85);
    return {
        element,
        label: `${types_js_1.ELEMENT_LABELS[element]} · ${types_js_1.ELEMENT_ORGANS[element]}`,
        score,
        activated: score >= 50,
        headline: types_js_1.ELEMENT_ACTIVATION_REASONS[element],
        _warning: "⚠️ SIMULATED — no real biometric data. Connect a wearable for actual readings.",
        evidence: [
            { signal: "HRV", value: "N/A (no wearable)", baseline: "N/A", direction: "unknown", weight: 0.35 },
            { signal: "Heart Rate", value: "N/A (no wearable)", baseline: "N/A", direction: "unknown", weight: 0.25 },
        ],
        why_this_practice: types_js_1.ELEMENT_TASK_REASONS[element],
        intervention: {
            type: "breathing", genre: types_js_1.ELEMENT_GENRES[element],
            duration_seconds: 300, breathing_rate_bpm: 6.0,
        },
    };
}
const activeSessions = new Map();
function mockStartSession(element, tier = "audio") {
    const sessionId = `sess_${Date.now().toString(36)}`;
    activeSessions.set(sessionId, { element, tier, startTime: Date.now() });
    return {
        session_id: sessionId, status: "started",
        tier: tier, element,
        genre: types_js_1.ELEMENT_GENRES[element], duration_seconds: 300, breathing_rate_bpm: 6.0,
        instruction: `${types_js_1.ELEMENT_LABELS[element]} Qi · ${types_js_1.ELEMENT_SHORT_SUMMARIES[element]}, try deep breathing. Inhale as music rises, exhale as it fades. Session runs 5 minutes.`,
    };
}
function mockSessionResult(sessionId) {
    return {
        session_id: sessionId, completed: true, duration_seconds: 300,
        hrv_before: null, hrv_after: null, hrv_change_pct: null,
        hr_before: null, hr_after: null,
        summary: `[SIMULATED] Session completed. No real biometric data available — connect Apple Watch or Oura Ring to measure actual HRV/HR changes during sessions.`,
    };
}
function mockSessionHistory(days = 7) {
    const entries = [];
    const elements = ["wood", "fire", "earth", "metal", "water"];
    const count = rand(3, Math.min(days * 2, 14));
    for (let i = 0; i < count; i++) {
        const daysAgo = rand(0, days - 1);
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        entries.push({
            session_id: `sess_hist_${i}`, timestamp: d.toISOString(),
            element: elements[rand(0, 4)], tier: "audio",
            duration_seconds: 300, hrv_change_pct: rand(10, 55),
        });
    }
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
/** Reset wellnessCallCount — for tests only. */
function _resetWellnessCallCount() {
    wellnessCallCount = 0;
}
