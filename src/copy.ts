/**
 * MetaMate copy + brand colors for the 5 stress patterns.
 *
 * Source: docs/plans/2026-05-02-metamate-demo-plan.md (lines ~392-412),
 * drafted 2026-04-28, awaiting user review.
 *
 * Color palette (TCM-conventional):
 *   tension      → #10B981  green   (Wood, growth/spring/Liver)
 *   overdrive    → #FF5E3A  red     (Fire, blaze/summer/Heart)
 *   stagnation   → #F59E0B  amber   (Earth, late-summer/Spleen)
 *   constriction → #E5E7EB  pale    (Metal, autumn/Lung — pure white reserved for text)
 *   depletion    → #3B82F6  blue    (Water, winter/Kidney)
 *
 * The exact two pattern colors used in the canvas reference (/tmp/draw_dashboard.js) were
 * #10B981 (green) and #FF5E3A (red); we keep those identical for tension/overdrive and
 * extend the palette using TCM-conventional element associations.
 */

import { StressPattern } from "./types.js";

export interface PatternCopy {
  /** UPPERCASE label shown in the dashboard pattern card */
  label: string;
  /** Short emoji used in text content + dashboard heading */
  emoji: string;
  /** TCM organ system (one-line subhead) */
  subhead: string;
  /** English MetaMate scenario (1-3 sentences) */
  en: string;
  /** Chinese MetaMate scenario */
  zh: string;
  /** Hex color (no leading #) used as the pattern card background gradient base */
  color: string;
  /** Slightly darker gradient endpoint for the pattern card */
  colorDark: string;
}

export const STRESS_PATTERN_COPY: Record<StressPattern, PatternCopy> = {
  tension: {
    label: "TENSION",
    emoji: "🌲",
    subhead: "Liver Qi · stuck in fight mode",
    en: "Your manager's 1AM message — you saw it, didn't reply. Been mentally drafting the answer ever since. 30 tabs open, staring at Phabricator, scrolling but not reading.",
    zh: "Manager 凌晨 1 点的 ping 你看了，没回。一直在脑子里组织答案。Phabricator 开着，30 个 tab，滚来滚去啥也没读进去。",
    color: "#10B981",
    colorDark: "#047857",
  },
  overdrive: {
    label: "OVERDRIVE",
    emoji: "🔥",
    subhead: "Heart Qi · racing",
    en: "Your SEV's been open 4 hours. Three on-calls are pinging. You've pushed the same commit five times and CI keeps failing. Hands shaking but you can't stop typing.",
    zh: "SEV 开了 4 小时，3 个 oncall 在追你。同一个 commit push 了 5 次都过不了 CI。手指颤抖但停不下来。",
    color: "#FF5E3A",
    colorDark: "#C03B1F",
  },
  stagnation: {
    label: "STAGNATION",
    emoji: "⛰️",
    subhead: "Spleen Qi · sluggish",
    en: "Three back-to-back meetings just ended. Back at Claude Code, the cursor's been blinking on line 47 for 20 minutes. gchat has 12 unread. You haven't opened it.",
    zh: "三个会刚连着开完，回 Claude Code。光标在第 47 行闪了 20 分钟。gchat 12 条未读，你没点开。",
    color: "#F59E0B",
    colorDark: "#B45309",
  },
  constriction: {
    label: "CONSTRICTION",
    emoji: "⚔️",
    subhead: "Lung Qi · faltering",
    en: "PSC due tonight. Self-review still half-written. Every line you re-read three times. Phone buzzes, you flinch. Shoulders up by your ears.",
    zh: "PSC 今晚截止，self-review 还写了一半。每打一行重读三遍。手机一震你就跳一下。肩膀缩到耳朵了。",
    color: "#E5E7EB",
    colorDark: "#9CA3AF",
  },
  depletion: {
    label: "DEPLETION",
    emoji: "🌊",
    subhead: "Kidney Essence · low",
    en: "Three launch weeks back-to-back. On-call just rolled off you. Today was supposed to be design-doc day — you can't get past the first sentence. The coffee isn't working.",
    zh: "三个连续 launch week，oncall 刚轮换走。今天本来该写 design doc，第一句就写不动。咖啡也救不了。",
    color: "#3B82F6",
    colorDark: "#1D4ED8",
  },
};

/** Short one-liner used in the text content above the dashboard image. */
export function shortStatusLine(
  pattern: StressPattern,
  hr: number | null,
  elapsedSec: number,
  totalSec: number,
): string {
  const copy = STRESS_PATTERN_COPY[pattern];
  const labelTitle = copy.label.charAt(0) + copy.label.slice(1).toLowerCase();
  const hrPart = hr == null ? "HR —" : `HR ${Math.round(hr)}`;
  const mm = Math.floor(elapsedSec / 60);
  const ss = Math.floor(elapsedSec % 60).toString().padStart(2, "0");
  const tm = Math.floor(totalSec / 60);
  const ts = Math.floor(totalSec % 60).toString().padStart(2, "0");
  return `${copy.emoji} ${labelTitle} · ${hrPart} → cooling down. (${mm}:${ss} / ${tm}:${ts})`;
}
