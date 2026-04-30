/**
 * DaoBrew live-session dashboard renderer.
 *
 * Renders a 1000x620 dark-theme PNG showing:
 *   - Pattern card (color-coded per stress pattern) + MetaMate scenario copy
 *   - Heart rate card with big number + 60-sample sparkline
 *   - Breath bars (IN green / OUT blue) with the active phase highlighted
 *   - Bottom row: session progress bar + HRV before→current delta
 *
 * Visual reference: /tmp/draw_dashboard.js (drafted 2026-04-28).
 *
 * Asset swap: Today this uses placeholder shapes + emoji. When the user provides
 * Figma SVGs, replace the per-pattern icon block in `drawPatternCard` with
 * `loadImage(<assets/${pattern}.svg>)` — single line, no other code change.
 */
import { StressPattern } from "./types.js";
/** Data fed to the renderer. Caller is responsible for normalizing units. */
export interface DashboardData {
    stressPattern: StressPattern;
    /** 0-100 pattern-activation score (current). */
    stressScore: number;
    /** Delta vs session start (positive = pattern intensified, negative = cooled off). */
    stressScoreDelta: number;
    /** Optional override for the MetaMate copy block (defaults to canonical English). */
    metaMateCopy?: string;
    /** Latest HR sample (bpm) or null if stale/unavailable. */
    currentHR: number | null;
    /** Last ~60 HR samples (oldest first). null entries become gaps in the sparkline. */
    hrHistory: Array<number | null>;
    /** Current breath phase. */
    breathPhase: "inhale" | "exhale";
    /** 0-1 progress within the current phase. */
    breathProgress: number;
    /** Fraction of the breath cycle spent inhaling (typically 0.25-0.50). */
    inhaleRatio: number;
    /** Breath rate. */
    breathBPM: number;
    /** Current cycle (1-indexed). */
    cycleNum: number;
    /** Total cycles planned. */
    totalCycles: number;
    /** Session elapsed time in seconds. */
    sessionElapsedSec: number;
    /** Session total duration in seconds. */
    sessionTotalSec: number;
    /** Pre-session HRV baseline in ms (null = unknown). */
    hrvBefore: number | null;
    /** Live HRV in ms (null = unknown). */
    hrvCurrent: number | null;
    watchConnected: boolean;
    iphoneConnected: boolean;
    /** When true the HR card is greyed out and shows "—". */
    hrStale?: boolean;
}
export declare function renderDashboardPNG(data: DashboardData): Buffer;
