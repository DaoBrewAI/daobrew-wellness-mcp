import {
  WellnessState, ElementDetail, SessionStart, SessionResult,
  SessionHistoryEntry, Element, Quadrant,
  ELEMENT_GENRES, ELEMENT_LABELS, ELEMENT_ORGANS,
  ELEMENT_SHORT_SUMMARIES, ELEMENT_ACTIVATION_REASONS, ELEMENT_TASK_REASONS,
} from "./types.js";

let wellnessCallCount = 0;

function getQuadrant(yin: number, yang: number): Quadrant {
  if (yin >= 50 && yang >= 50) return "peak";
  if (yin < 50 && yang >= 50) return "pushing_it";
  if (yin >= 50 && yang < 50) return "recharging";
  return "burnout";
}

const QUADRANT_LABELS: Record<Quadrant, string> = {
  peak: "In Flow",
  pushing_it: "Pushing It",
  recharging: "Recharging",
  burnout: "Running on Empty",
};

const QUADRANT_DESCRIPTIONS: Record<Quadrant, string> = {
  peak: "Your energy is in harmony. Maintain this state.",
  pushing_it: "Active but under-recovered. Consider rest soon.",
  recharging: "Well-recovered but low activity. Your body is conserving energy.",
  burnout: "Under-recovered and inactive. Gentle movement and rest recommended.",
};

function yinStateLabel(score: number): string {
  if (score >= 80) return "Fully Charged";
  if (score >= 60) return "Steady";
  if (score >= 40) return "Thinning";
  if (score >= 20) return "Running Low";
  return "Empty";
}

function yangStateLabel(score: number): string {
  if (score >= 80) return "Fired Up";
  if (score >= 60) return "Moving";
  if (score >= 40) return "Coasting";
  if (score >= 20) return "Sluggish";
  return "Stalled";
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function timeAwareBias(): { yinBias: number; yangBias: number; fireBias: number; earthBias: number } {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return { yinBias: -15, yangBias: -20, fireBias: 20, earthBias: 0 };
  if (hour >= 13 && hour < 15) return { yinBias: -10, yangBias: -10, fireBias: 0, earthBias: 15 };
  if (hour >= 9 && hour < 12) return { yinBias: 10, yangBias: 15, fireBias: 0, earthBias: -10 };
  return { yinBias: 0, yangBias: 0, fireBias: 0, earthBias: 0 };
}

export function mockWellnessState(isDemo: boolean = false): WellnessState {
  wellnessCallCount++;
  const bias = timeAwareBias();

  // First call always stressed (good first impression). Demo mode = always stressed.
  const stressed = isDemo || wellnessCallCount === 1 || wellnessCallCount % 3 === 0;
  const yin = Math.max(0, Math.min(100, rand(stressed ? 15 : 40, stressed ? 45 : 85) + bias.yinBias));
  const yang = Math.max(0, Math.min(100, rand(stressed ? 50 : 35, stressed ? 80 : 90) + bias.yangBias));
  const quadrant = getQuadrant(yin, yang);

  const scores: Record<Element, number> = {
    wood: Math.max(0, Math.min(100, rand(stressed ? 40 : 10, stressed ? 80 : 45))),
    fire: Math.max(0, Math.min(100, rand(stressed ? 30 : 5, stressed ? 70 : 40) + bias.fireBias)),
    earth: Math.max(0, Math.min(100, rand(stressed ? 25 : 10, stressed ? 60 : 40) + bias.earthBias)),
    metal: Math.max(0, Math.min(100, rand(5, stressed ? 55 : 35))),
    water: Math.max(0, Math.min(100, rand(5, stressed ? 45 : 25))),
  };

  // On first call or demo, ensure at least one element is active (score >= 50)
  if (stressed) {
    const topKey = (Object.entries(scores) as [Element, number][])
      .sort((a, b) => b[1] - a[1])[0][0];
    if (scores[topKey] < 50) scores[topKey] = rand(55, 75);
  }

  const active = (Object.entries(scores) as [Element, number][])
    .filter(([, s]) => s >= 50)
    .map(([e]) => e);

  const topElement = (Object.entries(scores) as [Element, number][])
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
      ? `[SIMULATED] ${ELEMENT_LABELS[topElement[0] as Element]} Qi · ${ELEMENT_SHORT_SUMMARIES[topElement[0] as Element]}`
      : `[SIMULATED] All biometrics within normal range`,
    recommendation: active.length > 0
      ? `${ELEMENT_LABELS[topElement[0] as Element]} Qi pattern detected (simulated). Connect a wearable for real data.`
      : `Simulated data — connect a wearable for real wellness assessment.`,
    last_updated: new Date().toISOString(),
  };
}

export function mockElementDetail(element: Element): ElementDetail {
  const score = rand(40, 85);
  return {
    element,
    label: `${ELEMENT_LABELS[element]} · ${ELEMENT_ORGANS[element]}`,
    score,
    activated: score >= 50,
    headline: ELEMENT_ACTIVATION_REASONS[element],
    _warning: "⚠️ SIMULATED — no real biometric data. Connect a wearable for actual readings.",
    evidence: [
      { signal: "HRV", value: "N/A (no wearable)", baseline: "N/A", direction: "unknown", weight: 0.35 },
      { signal: "Heart Rate", value: "N/A (no wearable)", baseline: "N/A", direction: "unknown", weight: 0.25 },
    ],
    why_this_practice: ELEMENT_TASK_REASONS[element],
    intervention: {
      type: "breathing", genre: ELEMENT_GENRES[element],
      duration_seconds: 300, breathing_rate_bpm: 6.0,
    },
  };
}

const activeSessions: Map<string, { element: Element; tier: string; startTime: number }> = new Map();

export function mockStartSession(element: Element, tier: string = "audio"): SessionStart {
  const sessionId = `sess_${Date.now().toString(36)}`;
  activeSessions.set(sessionId, { element, tier, startTime: Date.now() });
  return {
    session_id: sessionId, status: "started",
    tier: tier as any, element,
    genre: ELEMENT_GENRES[element], duration_seconds: 300, breathing_rate_bpm: 6.0,
    instruction: `${ELEMENT_LABELS[element]} Qi · ${ELEMENT_SHORT_SUMMARIES[element]}, try deep breathing. Inhale as music rises, exhale as it fades. Session runs 5 minutes.`,
  };
}

export function mockSessionResult(sessionId: string): SessionResult {
  return {
    session_id: sessionId, completed: true, duration_seconds: 300,
    hrv_before: null as any, hrv_after: null as any, hrv_change_pct: null as any,
    hr_before: null as any, hr_after: null as any,
    summary: `[SIMULATED] Session completed. No real biometric data available — connect Apple Watch or Oura Ring to measure actual HRV/HR changes during sessions.`,
  };
}

export function mockSessionHistory(days: number = 7): SessionHistoryEntry[] {
  const entries: SessionHistoryEntry[] = [];
  const elements: Element[] = ["wood", "fire", "earth", "metal", "water"];
  const count = rand(3, Math.min(days * 2, 14));
  for (let i = 0; i < count; i++) {
    const daysAgo = rand(0, days - 1);
    const d = new Date(); d.setDate(d.getDate() - daysAgo);
    entries.push({
      session_id: `sess_hist_${i}`, timestamp: d.toISOString(),
      element: elements[rand(0, 4)], tier: "audio",
      duration_seconds: 300, hrv_change_pct: rand(10, 55),
    });
  }
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** Reset wellnessCallCount — for tests only. */
export function _resetWellnessCallCount(): void {
  wellnessCallCount = 0;
}
