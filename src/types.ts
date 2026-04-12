// Yin/Yang quadrant states
export type Quadrant = "peak" | "pushing_it" | "recharging" | "burnout";
export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export type InterventionTier = "audio" | "full";

export interface WellnessState {
  yin: number;
  yang: number;
  quadrant: Quadrant;
  quadrant_label: string;
  quadrant_description: string;
  yin_label: string;
  yang_label: string;
  active_elements: Element[];
  element_scores: Record<Element, number>;
  top_signal: string;
  recommendation: string;
  last_updated: string;
  _warning?: string;
  data_source?: string;
}

export interface SignalEvidence {
  signal: string;
  value: string;
  baseline: string;
  direction: "above" | "below" | "normal" | "unknown";
  weight: number;
}

export interface Intervention {
  type: "breathing";
  genre: string;
  duration_seconds: number;
  breathing_rate_bpm: number;
}

export interface ElementDetail {
  element: Element;
  label: string;
  score: number;
  activated: boolean;
  headline: string;
  evidence: SignalEvidence[];
  why_this_practice: string;
  intervention: Intervention;
  _warning?: string;
}

export interface SessionStart {
  session_id: string;
  status: "started";
  tier: InterventionTier;
  element: Element;
  genre: string;
  duration_seconds: number;
  breathing_rate_bpm: number;
  instruction: string;
}

export interface SessionResult {
  session_id: string;
  completed: boolean;
  duration_seconds: number;
  hrv_before: number | null;
  hrv_after: number | null;
  hrv_change_pct: number | null;
  hr_before: number | null;
  hr_after: number | null;
  summary: string;
}

export interface SessionHistoryEntry {
  session_id: string;
  timestamp: string;
  element: Element;
  tier: InterventionTier;
  duration_seconds: number;
  hrv_change_pct: number | null;
}

export const ELEMENT_GENRES: Record<Element, string> = {
  wood: "ambient_downtempo",
  fire: "lofi_chill_jazz",
  earth: "acoustic_folk_calm",
  metal: "nature_soundscape_pads",
  water: "drone_deep_ambient",
};

export const ELEMENT_LABELS: Record<Element, string> = {
  wood: "Wood",
  fire: "Fire",
  earth: "Earth",
  metal: "Metal",
  water: "Water",
};

export const ELEMENT_ORGANS: Record<Element, string> = {
  wood: "Liver",
  fire: "Heart",
  earth: "Spleen",
  metal: "Lung",
  water: "Kidney",
};

export const ELEMENT_DESCRIPTIONS: Record<Element, string> = {
  wood: "The Detox · Cleansing & Qi flow",
  fire: "The Vessel · Circulation & clarity",
  earth: "The Core · Digestion & absorption",
  metal: "The Shield · Immunity & defense",
  water: "The Reservoir · Energy & vitality",
};

export const ELEMENT_SHORT_SUMMARIES: Record<Element, string> = {
  wood: "stagnation detected",
  fire: "restlessness detected",
  earth: "imbalance detected",
  metal: "tension detected",
  water: "depletion detected",
};

export const ELEMENT_ACTIVATION_REASONS: Record<Element, string> = {
  wood: "Low HRV detected — Liver Qi stagnation.",
  fire: "Elevated resting heart rate — Heart Fire rising.",
  earth: "Low activity — Spleen Qi grows sluggish.",
  metal: "Unsteady breathing — Lung Qi faltering.",
  water: "Weak recovery at rest — Kidney Essence low.",
};

export const ELEMENT_TASK_REASONS: Record<Element, string> = {
  wood: "Deep breathing steadies and restores Liver Qi.",
  fire: "Slow breathing settles Shen and draws Fire down.",
  earth: "Breathing from the center awakens Spleen Qi.",
  metal: "Deep breathing steadies and restores Lung Qi.",
  water: "Breathing roots Qi in Dan Tian, nourishing Kidneys.",
};

export interface HealthSampleDTO {
  metric_type: string;
  value: number;
  unit: string;
  start_time: string;  // ISO 8601
  end_time: string;    // ISO 8601
  source: string;
}
