import {
  WellnessState, ElementDetail, SessionStart, SessionResult, BreathState,
  SessionHistoryEntry, Element, Quadrant,
  ELEMENT_GENRES, ELEMENT_LABELS, ELEMENT_ORGANS,
  ELEMENT_SHORT_SUMMARIES, ELEMENT_ACTIVATION_REASONS, ELEMENT_TASK_REASONS,
} from "./types.js";

/** Development-only synthesis of a backend BreathState. This module is not published. */
export function mockBreathState(pattern: Element, sessionStartMs: number, _plannedDurationSec: number): BreathState {
  const elapsedSec = (Date.now() - sessionStartMs) / 1000;
  const bpm = Math.max(4, 6 - elapsedSec / 120);
  const cycleSec = 60 / bpm;
  const cyclesElapsed = elapsedSec / cycleSec;
  const cycleNum = Math.floor(cyclesElapsed) + 1;
  const cycleStartUnix = sessionStartMs / 1000 + Math.floor(cyclesElapsed) * cycleSec;
  const baseHR = 82 - Math.min(15, elapsedSec / 30);
  const currentHR = Math.round(baseHR + (Math.random() * 2 - 1));
  return {
    active: true,
    pattern,
    cycle_num: cycleNum,
    cycle_start_unix: cycleStartUnix,
    cycle_sec: cycleSec,
    current_params: { bpm, ratio: 0.40, depth: 0.35 },
    current_hr: currentHR,
    current_hr_age_sec: 0.5,
    prev_cycle_hr_mean: cycleNum > 1 ? currentHR + 2 : null,
    prev_cycle_hr_std: 1.5,
    cycles_completed: Math.max(0, cycleNum - 1),
    session_started_at_unix: sessionStartMs / 1000,
    session_elapsed_sec: elapsedSec,
  };
}

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

// ── Detonator (causal-chain) mocks ───────────────────────────────────────────
// Mirrors the chain scripts/seed-demo-graph.mjs writes to the real graph DB,
// so the detonate flow can be exercised with no SQLite file present.

export interface DetonateBrief {
  cause_id: string;
  cause: string;
  evidence: string[];
  /// Rich context Sentinel assembled from the causal-chain graph + the user's
  /// strategy notes — the material the agent needs to do the task well. This is
  /// the "one-click dumps everything" payload that makes the handoff land.
  context?: string;
  artifact_spec: string;
  suggested_block: { title: string; start_offset_min: number; duration_min: number };
}

// Shared by the seed script and the mock fallback so the on-camera brief never
// drifts between them. The context block is intentionally specific — it's the
// proof that Sentinel handed the agent everything, not a vague nudge.
export const AI2_DEMO_CONTEXT =
  `Positioning\n` +
  `  DaoBrew finds the undone thing that keeps stealing your state, schedules it,\n` +
  `  opens a ready action package, then proves it changed with your own curve.\n` +
  `  Loop: read → attribute → review → verify. DaoBrew is the brain + scheduling\n` +
  `  + brief + routing — the layer UPSTREAM of the workspace that ships it. It\n` +
  `  never writes the artifact itself.\n\n` +
  `What this demo must prove\n` +
  `  Raw HR/HRV is a commodity — Oura / WHOOP / Apple already own it. The moat is\n` +
  `  the per-user causal graph + closed-loop outcome data (act → capture outcome →\n` +
  `  learn) that no LLM-over-HealthKit can reproduce. "Every sensor can read; almost\n` +
  `  nobody can intervene." Sell the causal model + the closed loop, never the data.\n\n` +
  `Narrative spine (already converged — strategy §3)\n` +
  `  1. import 4 signals — calendar · Granola notes · biometrics · session memory\n` +
  `  2. show the chain — OVERDRIVE ← 3 episodes ← investor/demo events ← "demo story"\n` +
  `  3. detonate — schedule the prep block + hand the task package to your agent\n` +
  `  4. verify — the next demo-facing event's pre-event HR peak drops 91 → 84\n\n` +
  `Where you lack readiness (Sentinel flagged across 3 weeks)\n` +
  `  • no single through-line — Granola Jun 4: "还是没有一条能讲的 demo 主线"\n` +
  `  • B2B-vs-B2C story still tangled — the demo conflates the engine with the B2C\n` +
  `    app (strategy §5 "一脑一壳"); separate the two on stage\n` +
  `  • the verify curve is the beat most likely missing on stage — make the 91 → 84\n` +
  `    comparison explicit; it IS the differentiation\n\n` +
  `Audience & stakes\n` +
  `  AI2 Incubator, investor-type, pre-revenue (seed by Q4). 3rd occurrence in 3\n` +
  `  weeks — the meeting your body keeps bracing for.\n\n` +
  `Source\n` +
  `  strategy/2026-06-11-causal-chain-b2c-b2b-strategy.md §0/§3/§4/§5 ·\n` +
  `  Granola AI2 ×3 (May 28 / Jun 4 / Jun 10) · DaoBrew session memory ×2`;

export const AI2_DEMO_ARTIFACT_SPEC =
  `Produce ai2-demo-story.html — a self-contained, single-file demo deck (no external\n` +
  `deps beyond Google fonts; opens straight in a browser). Aesthetic direction:\n` +
  `biometric instrument meets editorial manifesto — a warm dark void, NOT a generic\n` +
  `slide deck. Avoid AI-default looks (no Inter/Roboto, no flat purple-on-white).\n` +
  `  Palette (DaoBrew): near-black void over a black→rust→gold crown glow\n` +
  `    (#F1CF4A / #471B02 / #000000), peach text #EAC8AC, fire accent #FF4B43,\n` +
  `    jade/confirm #5BC47E. Add atmosphere: a faint dot-grid, a grain overlay, a\n` +
  `    radial glow behind the OVERDRIVE hub, an ECG/heartbeat line motif.\n` +
  `  Type: Fraunces (editorial serif display, italic for emphasis) for headlines,\n` +
  `    Plus Jakarta Sans for body, IBM Plex Mono for biometric numbers + labels.\n` +
  `  Motion: staggered reveal-on-scroll, a scroll-snap section per slide, a section\n` +
  `    index rail, the hub pulsing, the ECG line drawing in. Tasteful, not busy.\n` +
  `  One full-viewport section per slide:\n` +
  `  1. HOOK — title + the one-sentence opening line that lands in the first 10 seconds.\n` +
  `  2. THE CHAIN — a simple node diagram: OVERDRIVE ← 3 episodes (HR 91/88/93 vs\n` +
  `     baseline 62) ← investor/demo events ← the "demo story" work thread.\n` +
  `  3. THE LOOP — read → attribute → review → verify, one line each.\n` +
  `  4. THE MOAT — why Oura/WHOOP/Apple can't follow: per-user causal graph +\n` +
  `     closed-loop outcome data; "DaoBrew is the brain upstream of your agent — it\n` +
  `     never writes the artifact itself."\n` +
  `  5. 3-BEAT SCRIPT — hook (30s) / live chain walkthrough (60s) / detonate moment\n` +
  `     (60s); each beat = the on-screen action + the line to say.\n` +
  `  6. ANTICIPATED Q&A — 4 investor questions (moat · privacy/regulatory · why-now ·\n` +
  `     B2B-vs-B2C) with tight answers.\n` +
  `  7. CLOSE — the mic-drop line + the recursive kicker: this deck was itself produced\n` +
  `     by a detonation, the loop that made the pitch.\n` +
  `  Tone: founder pitching, concrete, no filler.`;

let mockGhostStatus: "armed" | "done" = "armed";

export function mockDetonateBrief(): DetonateBrief | null {
  if (mockGhostStatus !== "armed") return null;
  return {
    cause_id: "ghost_ai2_demo_story",
    cause: "AI2 demo story 三周未完成 — 反复出现在 investor 类会议,且每次会前 OVERDRIVE spike",
    evidence: [
      'Calendar: "AI2 Incubator Meeting" — 3rd occurrence in 3 weeks',
      'Granola · May 28: "demo story 还没定稿,Linhan 问 demo narrative"',
      'Granola · Jun 4: "还是没有一条能讲的 demo 主线"',
      'Granola · Jun 10: "demo story 仍未定稿 — 下周必须有初稿"',
      "Biometrics: pre-meeting HR 91 / 88 / 93 bpm (baseline 62), HRV −40%",
      'DaoBrew memory: user mentioned "AI2 demo 没准备好" in 2 sessions',
    ],
    context: AI2_DEMO_CONTEXT,
    artifact_spec: AI2_DEMO_ARTIFACT_SPEC,
    suggested_block: { title: "DaoBrew · AI2 demo story prep", start_offset_min: 60, duration_min: 45 },
  };
}

export function mockDetonateDone(causeId: string): { status: string; cause_id: string } {
  if (causeId === "ghost_ai2_demo_story") mockGhostStatus = "done";
  return { status: "done", cause_id: causeId };
}

/** Reset detonator mock state — for tests only. */
export function _resetMockDetonator(): void {
  mockGhostStatus = "armed";
}

/** Reset wellnessCallCount — for tests only. */
export function _resetWellnessCallCount(): void {
  wellnessCallCount = 0;
}
