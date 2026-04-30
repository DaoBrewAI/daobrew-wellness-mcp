"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDashboardPNG = renderDashboardPNG;
const canvas_1 = require("@napi-rs/canvas");
const copy_js_1 = require("./copy.js");
const W = 1000;
const H = 620;
/** Rendered as fallback when sparkline has no samples. */
const SPARKLINE_PLACEHOLDER_TEXT = "waiting for HR…";
function renderDashboardPNG(data) {
    const canvas = (0, canvas_1.createCanvas)(W, H);
    const ctx = canvas.getContext("2d");
    drawBackground(ctx);
    drawHeader(ctx, data);
    drawPatternCard(ctx, data);
    drawHRCard(ctx, data);
    drawBreathCard(ctx, data);
    drawBottomBar(ctx, data);
    return canvas.toBuffer("image/png");
}
function drawBackground(ctx) {
    ctx.fillStyle = "#0F1117";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1A1D26";
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, H);
        ctx.stroke();
    }
    for (let i = 0; i < H; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(W, i);
        ctx.stroke();
    }
}
function drawHeader(ctx, data) {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px -apple-system, sans-serif";
    ctx.fillText("DAOBREW · LIVE SESSION", 32, 36);
    ctx.fillStyle = "#6B7280";
    ctx.font = "13px -apple-system, sans-serif";
    const watch = data.watchConnected ? "✓" : "·";
    const phone = data.iphoneConnected ? "✓" : "·";
    ctx.fillText(`⌚ Watch ${watch}   📱 iPhone ${phone}   🎧 AirPods ✓`, 32, 58);
    // Right-aligned mm:ss / mm:ss
    const elapsed = formatMMSS(data.sessionElapsedSec);
    const total = formatMMSS(data.sessionTotalSec);
    const timeStr = `${elapsed} / ${total}`;
    ctx.fillStyle = "#6B7280";
    const tw = ctx.measureText(timeStr).width;
    ctx.fillText(timeStr, W - tw - 32, 36);
}
function drawPatternCard(ctx, data) {
    const copy = copy_js_1.STRESS_PATTERN_COPY[data.stressPattern];
    const pX = 32;
    const pY = 88;
    const pW = 380;
    const pH = 140;
    const grad = ctx.createLinearGradient(pX, pY, pX + pW, pY + pH);
    grad.addColorStop(0, copy.color);
    grad.addColorStop(1, copy.colorDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    roundRect(ctx, pX, pY, pW, pH, 16);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px -apple-system, sans-serif";
    ctx.fillText(`${copy.emoji}  ${copy.label}`, pX + 24, pY + 44);
    const subline = `${copy.subhead} · score ${Math.round(data.stressScore)}`;
    const deltaPart = Math.abs(data.stressScoreDelta) >= 1
        ? ` → ${Math.round(data.stressScore + data.stressScoreDelta)}`
        : "";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(subline + deltaPart, pX + 24, pY + 70);
    // MetaMate scenario — wrap to 2 lines max
    const copyText = data.metaMateCopy ?? copy.en;
    const lines = wrapText(ctx, copyText, pW - 48, "12px -apple-system, sans-serif");
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        ctx.fillText(`"${lines[i]}${i === Math.min(lines.length, 3) - 1 ? '"' : ""}`, pX + 24, pY + 100 + i * 16);
    }
}
function drawHRCard(ctx, data) {
    const hX = 432;
    const hY = 88;
    const hW = 536;
    const hH = 140;
    ctx.fillStyle = "#1A1D26";
    ctx.beginPath();
    roundRect(ctx, hX, hY, hW, hH, 16);
    ctx.fill();
    ctx.fillStyle = "#6B7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText("HEART RATE  · last 60s", hX + 20, hY + 28);
    const stale = data.hrStale === true || data.currentHR == null;
    const hrColor = stale ? "#6B7280" : "#FFFFFF";
    const hrText = stale ? "—" : String(Math.round(data.currentHR));
    ctx.fillStyle = hrColor;
    ctx.font = "bold 64px -apple-system, sans-serif";
    ctx.fillText(hrText, hX + 20, hY + 100);
    ctx.font = "20px -apple-system, sans-serif";
    ctx.fillStyle = "#6B7280";
    // X offset based on hrText width
    const numW = ctx.measureText(hrText).width;
    // re-measure with the bold 64px font for accuracy
    ctx.font = "bold 64px -apple-system, sans-serif";
    const numWAccurate = ctx.measureText(hrText).width;
    ctx.font = "20px -apple-system, sans-serif";
    ctx.fillText(" bpm", hX + 20 + numWAccurate, hY + 100);
    // Delta line — first non-null sample vs current
    const firstReal = data.hrHistory.find((v) => v != null);
    if (!stale && firstReal != null && data.currentHR != null) {
        const delta = data.currentHR - firstReal;
        const pct = (delta / firstReal) * 100;
        const arrow = delta < 0 ? "▼" : delta > 0 ? "▲" : "→";
        const deltaColor = delta < 0 ? "#10B981" : delta > 0 ? "#FF5E3A" : "#6B7280";
        ctx.fillStyle = deltaColor;
        ctx.font = "13px -apple-system, sans-serif";
        ctx.fillText(`${arrow} ${Math.abs(pct).toFixed(0)}%  (was ${Math.round(firstReal)})`, hX + 20, hY + 124);
    }
    else {
        ctx.fillStyle = "#6B7280";
        ctx.font = "13px -apple-system, sans-serif";
        ctx.fillText(stale ? "watch disconnected" : "warming up…", hX + 20, hY + 124);
    }
    // Sparkline area
    const sxStart = hX + 200;
    const syStart = hY + 50;
    const sxEnd = hX + hW - 20;
    const syEnd = hY + 120;
    drawSparkline(ctx, data, sxStart, syStart, sxEnd, syEnd, stale);
}
function drawSparkline(ctx, data, sxStart, syStart, sxEnd, syEnd, stale) {
    const sw = sxEnd - sxStart;
    const sh = syEnd - syStart;
    const samples = data.hrHistory.filter((v) => v != null);
    if (samples.length < 2) {
        ctx.fillStyle = "#374151";
        ctx.font = "13px -apple-system, sans-serif";
        const txt = SPARKLINE_PLACEHOLDER_TEXT;
        const tw = ctx.measureText(txt).width;
        ctx.fillText(txt, sxStart + sw / 2 - tw / 2, syStart + sh / 2);
        return;
    }
    const minV = Math.max(40, Math.min(...samples) - 3);
    const maxV = Math.max(...samples) + 3;
    const range = Math.max(1, maxV - minV);
    // Use ALL data.hrHistory entries (with nulls as gaps)
    const allPoints = data.hrHistory.map((v, i) => ({
        x: sxStart + (i / Math.max(1, data.hrHistory.length - 1)) * sw,
        y: v == null ? syEnd : syEnd - ((v - minV) / range) * sh,
        v,
    }));
    const accent = stale ? "#6B7280" : copy_js_1.STRESS_PATTERN_COPY[data.stressPattern].color;
    // Stroke — break on null gaps
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    let pathOpen = false;
    ctx.beginPath();
    for (const p of allPoints) {
        if (p.v == null) {
            pathOpen = false;
            continue;
        }
        if (!pathOpen) {
            ctx.moveTo(p.x, p.y);
            pathOpen = true;
        }
        else {
            ctx.lineTo(p.x, p.y);
        }
    }
    ctx.stroke();
    // Gradient fill under the most-recent contiguous run
    const lastValid = [...allPoints].reverse().findIndex((p) => p.v == null);
    const startIdx = lastValid === -1 ? 0 : allPoints.length - lastValid;
    const tail = allPoints.slice(startIdx).filter((p) => p.v != null);
    if (tail.length >= 2) {
        const sparkGrad = ctx.createLinearGradient(0, syStart, 0, syEnd);
        sparkGrad.addColorStop(0, hexToRgba(accent, 0.3));
        sparkGrad.addColorStop(1, hexToRgba(accent, 0));
        ctx.fillStyle = sparkGrad;
        ctx.beginPath();
        ctx.moveTo(tail[0].x, tail[0].y);
        for (const p of tail.slice(1))
            ctx.lineTo(p.x, p.y);
        ctx.lineTo(tail[tail.length - 1].x, syEnd);
        ctx.lineTo(tail[0].x, syEnd);
        ctx.closePath();
        ctx.fill();
        // Current dot
        const last = tail[tail.length - 1];
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(last.x, last.y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(last.x, last.y, 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}
function drawBreathCard(ctx, data) {
    const bX = 32;
    const bY = 252;
    const bW = 936;
    const bH = 220;
    ctx.fillStyle = "#1A1D26";
    ctx.beginPath();
    roundRect(ctx, bX, bY, bW, bH, 16);
    ctx.fill();
    ctx.fillStyle = "#6B7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText(`BREATH  · cycle ${data.cycleNum} / ${data.totalCycles}   ·   ${data.breathBPM.toFixed(1)} BPM   ·   ratio ${data.inhaleRatio.toFixed(2)}`, bX + 24, bY + 28);
    // Bar geometry
    const barY = bY + 70;
    const barH = 48;
    const gap = 20;
    const totalBarW = bW - 48;
    const cycleSec = 60 / Math.max(1, data.breathBPM);
    const inhaleSec = cycleSec * data.inhaleRatio;
    const exhaleSec = cycleSec * (1 - data.inhaleRatio);
    const inBarW = totalBarW * data.inhaleRatio - gap / 2;
    const outBarW = totalBarW * (1 - data.inhaleRatio) - gap / 2;
    const inX = bX + 24;
    const outX = inX + inBarW + gap;
    const isInhale = data.breathPhase === "inhale";
    // IN bar
    ctx.fillStyle = "#0F1117";
    ctx.beginPath();
    roundRect(ctx, inX, barY, inBarW, barH, 10);
    ctx.fill();
    const inGrad = ctx.createLinearGradient(inX, barY, inX + inBarW, barY);
    inGrad.addColorStop(0, "#10B981");
    inGrad.addColorStop(1, "#34D399");
    ctx.fillStyle = inGrad;
    if (isInhale) {
        ctx.beginPath();
        roundRect(ctx, inX, barY, inBarW * data.breathProgress, barH, 10);
        ctx.fill();
    }
    else {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        roundRect(ctx, inX, barY, inBarW, barH, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.fillText(`INHALE  ${inhaleSec.toFixed(1)}s`, inX + 16, barY + 30);
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillStyle = isInhale ? "#FFFFFF" : "#9CA3AF";
    const inhalePctText = `${Math.round(data.inhaleRatio * 100)}%${isInhale ? "   ◀ now inhaling" : ""}`;
    ctx.fillText(inhalePctText, inX + 16, barY + 46);
    // OUT bar
    ctx.fillStyle = "#0F1117";
    ctx.beginPath();
    roundRect(ctx, outX, barY, outBarW, barH, 10);
    ctx.fill();
    const outGrad = ctx.createLinearGradient(outX, barY, outX + outBarW, barY);
    outGrad.addColorStop(0, "#3B82F6");
    outGrad.addColorStop(1, "#60A5FA");
    ctx.fillStyle = outGrad;
    if (!isInhale) {
        ctx.beginPath();
        roundRect(ctx, outX, barY, outBarW * data.breathProgress, barH, 10);
        ctx.fill();
    }
    else {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        roundRect(ctx, outX, barY, outBarW, barH, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.fillText(`EXHALE  ${exhaleSec.toFixed(1)}s`, outX + 16, barY + 30);
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillStyle = !isInhale ? "#FFFFFF" : "#9CA3AF";
    const exhalePctText = `${Math.round((1 - data.inhaleRatio) * 100)}%${!isInhale ? "   ◀ now exhaling" : ""}`;
    ctx.fillText(exhalePctText, outX + 16, barY + 46);
    // Phase label
    ctx.font = "bold 14px -apple-system, sans-serif";
    ctx.fillStyle = isInhale ? "#34D399" : "#60A5FA";
    ctx.fillText(isInhale ? "▲ NOW INHALING" : "▼ NOW EXHALING", bX + 24, bY + 150);
    // Sine-wave breath visual
    const cycleX = (data.breathPhase === "inhale" ? data.breathProgress * data.inhaleRatio : data.inhaleRatio + data.breathProgress * (1 - data.inhaleRatio));
    ctx.strokeStyle = isInhale ? "#34D399" : "#60A5FA";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const waveY = bY + 185;
    const waveStart = bX + 24;
    const waveW = bW - 48;
    for (let x = waveStart; x < waveStart + waveW; x += 2) {
        const phase = (x - waveStart) / waveW;
        const y = waveY + Math.sin(phase * Math.PI * 5) * 8;
        if (x === waveStart)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Cycle position marker
    const markerX = waveStart + cycleX * waveW;
    ctx.fillStyle = isInhale ? "#34D399" : "#60A5FA";
    ctx.beginPath();
    ctx.arc(markerX, waveY, 4, 0, 2 * Math.PI);
    ctx.fill();
}
function drawBottomBar(ctx, data) {
    const sX = 32;
    const sY = 496;
    const sW = 936;
    const sH = 92;
    ctx.fillStyle = "#1A1D26";
    ctx.beginPath();
    roundRect(ctx, sX, sY, sW, sH, 16);
    ctx.fill();
    // Session progress
    ctx.fillStyle = "#6B7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText("SESSION", sX + 20, sY + 26);
    const progX = sX + 20;
    const progY = sY + 38;
    const progW = 540;
    const progH = 12;
    ctx.fillStyle = "#0F1117";
    ctx.beginPath();
    roundRect(ctx, progX, progY, progW, progH, 6);
    ctx.fill();
    const frac = Math.max(0, Math.min(1, data.sessionElapsedSec / Math.max(1, data.sessionTotalSec)));
    const progFill = progW * frac;
    if (progFill > 0) {
        const progGrad = ctx.createLinearGradient(progX, progY, progX + progFill, progY);
        progGrad.addColorStop(0, "#10B981");
        progGrad.addColorStop(1, "#34D399");
        ctx.fillStyle = progGrad;
        ctx.beginPath();
        roundRect(ctx, progX, progY, progFill, progH, 6);
        ctx.fill();
    }
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText(`${formatMMSS(data.sessionElapsedSec)} / ${formatMMSS(data.sessionTotalSec)}`, sX + 20, sY + 72);
    // HRV
    ctx.fillStyle = "#6B7280";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText("HRV", sX + 600, sY + 26);
    if (data.hrvBefore == null && data.hrvCurrent == null) {
        ctx.fillStyle = "#6B7280";
        ctx.font = "13px -apple-system, sans-serif";
        ctx.fillText("(no HRV samples yet)", sX + 600, sY + 60);
    }
    else {
        const before = data.hrvBefore == null ? "—" : String(Math.round(data.hrvBefore));
        const current = data.hrvCurrent == null ? "—" : String(Math.round(data.hrvCurrent));
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 24px -apple-system, sans-serif";
        ctx.fillText(before, sX + 600, sY + 60);
        const beforeW = ctx.measureText(before).width;
        ctx.font = "14px -apple-system, sans-serif";
        ctx.fillStyle = "#6B7280";
        ctx.fillText("ms", sX + 600 + beforeW + 4, sY + 60);
        ctx.fillStyle = "#10B981";
        ctx.font = "bold 20px -apple-system, sans-serif";
        ctx.fillText("→", sX + 670, sY + 58);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 24px -apple-system, sans-serif";
        ctx.fillText(current, sX + 700, sY + 60);
        const currentW = ctx.measureText(current).width;
        ctx.font = "14px -apple-system, sans-serif";
        if (data.hrvBefore != null && data.hrvCurrent != null) {
            const pct = ((data.hrvCurrent - data.hrvBefore) / data.hrvBefore) * 100;
            const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "→";
            const color = pct > 0 ? "#10B981" : pct < 0 ? "#FF5E3A" : "#6B7280";
            ctx.fillStyle = color;
            ctx.fillText(`ms  ${arrow} ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, sX + 700 + currentW + 4, sY + 60);
        }
        else {
            ctx.fillStyle = "#6B7280";
            ctx.fillText("ms", sX + 700 + currentW + 4, sY + 60);
        }
    }
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "12px -apple-system, sans-serif";
    ctx.fillText("vs session start", sX + 600, sY + 78);
}
// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    // Some canvas backends have ctx.roundRect; fall back to manual draw.
    const ctxAny = ctx;
    if (typeof ctxAny.roundRect === "function") {
        ctxAny.roundRect(x, y, w, h, r);
        return;
    }
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
function formatMMSS(sec) {
    const total = Math.max(0, Math.round(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
function wrapText(ctx, text, maxWidth, font) {
    const prevFont = ctx.font;
    ctx.font = font;
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
        const test = line.length === 0 ? w : `${line} ${w}`;
        if (ctx.measureText(test).width <= maxWidth) {
            line = test;
        }
        else {
            if (line)
                lines.push(line);
            line = w;
        }
    }
    if (line)
        lines.push(line);
    ctx.font = prevFont;
    return lines;
}
