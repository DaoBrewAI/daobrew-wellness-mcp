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
export declare const STRESS_PATTERN_COPY: Record<StressPattern, PatternCopy>;
/** Short one-liner used in the text content above the dashboard image. */
export declare function shortStatusLine(pattern: StressPattern, hr: number | null, elapsedSec: number, totalSec: number): string;
