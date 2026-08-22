import { STRESS_PATTERN_COPY } from "./copy.js";
import { Element, ELEMENT_TO_STRESS_PATTERN } from "./types.js";
import { PATTERN_ICON_DATA_URL } from "./icons-base64.js";

const PATTERN_COLORS: Record<Element, string> = {
  wood:  "#5dd47d",
  fire:  "#ff5d4d",
  earth: "#f4b84b",
  metal: "#e8edf2",
  water: "#5db8ff",
};

export function generateDashboardHTML(element: Element, durationSec: number): string {
  const pattern = ELEMENT_TO_STRESS_PATTERN[element];
  const copy = STRESS_PATTERN_COPY[pattern];
  const color = PATTERN_COLORS[element];
  const iconDataURL = PATTERN_ICON_DATA_URL[element];
  const scenario = copy.en
    .replace(/'/g, "\\'")
    .replace(/`/g, "\\`")
    .replace(/\\/g, "\\\\");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DaoBrew \xb7 ${copy.label}</title>
<style>
  :root {
    --bg: #07070b;
    --surface: #11111a;
    --border: #1d1d2a;
    --muted: #5e5e75;
    --text: #e9e9f4;
    --accent: ${color};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    background:
      radial-gradient(circle at 50% 30%, color-mix(in oklab, var(--accent), transparent 94%), transparent 60%),
      var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .hero {
    flex: 0 0 55%;
    position: relative;
  }
  canvas#wave { width: 100%; height: 100%; display: block; }
  .phase-tag {
    position: absolute;
    top: 24px;
    left: 28px;
    font-size: 11px;
    letter-spacing: 3px;
    color: var(--muted);
  }
  .phase-tag .live {
    color: var(--accent);
    font-weight: 600;
  }

  .mid {
    flex: 0 0 24%;
    display: grid;
    grid-template-columns: 280px 1fr;
    align-items: center;
    padding: 0 36px;
    gap: 36px;
    border-top: 1px solid var(--border);
  }
  .hr-block { text-align: left; }
  .hr-row { display: flex; align-items: baseline; gap: 12px; }
  .hr-value {
    font-size: 88px;
    font-weight: 200;
    line-height: 1;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    letter-spacing: -2px;
  }
  .hr-unit {
    font-size: 14px;
    color: var(--muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .hr-label {
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 2px;
    margin-top: 4px;
    text-transform: uppercase;
  }
  .hr-spark { width: 100%; height: 28px; margin-top: 10px; display: block; }

  .params {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .param {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 16px;
    text-align: center;
    transition: border-color 0.4s, box-shadow 0.4s, transform 0.3s;
    position: relative;
    overflow: hidden;
  }
  .param.pulse {
    border-color: var(--accent);
    box-shadow: 0 0 32px color-mix(in oklab, var(--accent), transparent 65%),
                inset 0 0 24px color-mix(in oklab, var(--accent), transparent 92%);
    transform: translateY(-2px);
  }
  .param.pulse .param-value { color: var(--accent); }
  .param-value {
    font-size: 36px;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    transition: color 0.4s;
    line-height: 1;
  }
  .param-label {
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 1.5px;
    margin-top: 8px;
    text-transform: uppercase;
  }
  .param-detail {
    font-size: 10px;
    color: #3d3d4d;
    margin-top: 3px;
  }
  .param-arrow {
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 10px;
    opacity: 0;
    color: var(--accent);
    transition: opacity 0.3s;
  }
  .param.pulse .param-arrow { opacity: 1; }

  .session {
    flex: 0 0 9%;
    display: flex;
    align-items: center;
    padding: 0 36px;
    gap: 24px;
    border-top: 1px solid var(--border);
  }
  .pattern {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, "SF Pro Display", "Helvetica Neue", "Inter", sans-serif;
    font-size: 17px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 5px;
  }
  #pattern-name {
    color: var(--accent);
    text-shadow:
      0 0 1px rgba(255,255,255,0.25),
      0 0 6px var(--accent),
      0 0 16px color-mix(in oklab, var(--accent), transparent 35%),
      0 0 32px color-mix(in oklab, var(--accent), transparent 70%);
  }
  #pattern-icon {
    height: 38px;
    width: auto;
    object-fit: contain;
    display: inline-block;
    animation: iconpulse 4s ease-in-out infinite;
  }
  @keyframes iconpulse {
    0%, 100% { opacity: 0.92; }
    50% { opacity: 1; }
  }
  .scenario {
    flex: 1;
    margin-left: 28px;
    text-align: right;
    font-family: "Iowan Old Style", "Charter", "Cambria", Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 13.5px;
    line-height: 1.4;
    text-transform: lowercase;
    letter-spacing: 0.2px;
    color: var(--accent);
    opacity: 0.92;
    text-shadow:
      0 0 4px color-mix(in oklab, var(--accent), transparent 55%),
      0 0 12px color-mix(in oklab, var(--accent), transparent 80%);
    max-width: 52%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .cycle-info {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .progress-wrap {
    flex: 1;
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
    max-width: 360px;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent), white 30%));
    transition: width 0.5s linear;
  }
  .timer {
    margin-left: auto;
    font-size: 13px;
    color: #9d9db0;
    font-variant-numeric: tabular-nums;
    letter-spacing: 1px;
  }

  .log {
    flex: 0 0 12%;
    overflow-y: auto;
    padding: 10px 36px;
    background: #050508;
    font-family: ui-monospace, "SF Mono", "JetBrains Mono", monospace;
    font-size: 11px;
    color: #6a6a80;
    border-top: 1px solid var(--border);
  }
  .log-entry {
    line-height: 18px;
    opacity: 0;
    animation: fadein 0.5s forwards;
  }
  .log-entry .accent { color: var(--accent); font-weight: 500; }
  .log-entry .ts { color: #3d3d4d; }
  @keyframes fadein { to { opacity: 1; } }
</style>
</head>
<body>

<div class="hero">
  <div class="phase-tag"><span class="live" id="phase-live">INHALE</span> · <span id="cycle-tag">cycle —</span></div>
  <canvas id="wave"></canvas>
</div>

<div class="mid">
  <div class="hr-block">
    <div class="hr-row">
      <div class="hr-value" id="hr">--</div>
      <div class="hr-unit">bpm</div>
    </div>
    <div class="hr-label">Heart rate · <span id="hr-age">waiting</span></div>
    <canvas class="hr-spark" id="spark"></canvas>
  </div>

  <div class="params">
    <div class="param" id="p-bpm">
      <div class="param-arrow">▼</div>
      <div class="param-value" id="v-bpm">--</div>
      <div class="param-label">Breath Rate</div>
      <div class="param-detail">cycles / min</div>
    </div>
    <div class="param" id="p-ratio">
      <div class="param-arrow">▼</div>
      <div class="param-value" id="v-ratio">--</div>
      <div class="param-label">Inhale Ratio</div>
      <div class="param-detail">in : out balance</div>
    </div>
    <div class="param" id="p-depth">
      <div class="param-arrow">▲</div>
      <div class="param-value" id="v-depth">--</div>
      <div class="param-label">Mod Depth</div>
      <div class="param-detail">intensity</div>
    </div>
  </div>
</div>

<div class="session">
  <div class="pattern">
    <img id="pattern-icon" src="${iconDataURL}" alt="">
    <span id="pattern-name">${copy.label.charAt(0) + copy.label.slice(1).toLowerCase()}</span>
  </div>
  <div class="cycle-info" id="cycle-info">Cycle —</div>
  <div class="progress-wrap">
    <div class="progress-bar" id="progress" style="width:0%"></div>
  </div>
  <div class="timer" id="timer">00:00 / ${fmtTime(durationSec)}</div>
  <div class="scenario">${escapeHTML(copy.en)}</div>
</div>

<div class="log" id="log"></div>

<script>
var DURATION = ${durationSec};
var ACCENT = "${color}";
var POLL_MS = 2000;

var state = null;
var prevParams = null;
var hrHistory = [];

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  var m = Math.floor(sec / 60).toString().padStart(2, "0");
  var s = (sec % 60).toString().padStart(2, "0");
  return m + ":" + s;
}

// ===== Wave canvas =====
var wave = document.getElementById("wave");
var wctx = wave.getContext("2d");
function resizeWave() {
  var dpr = window.devicePixelRatio || 1;
  wave.width = wave.clientWidth * dpr;
  wave.height = wave.clientHeight * dpr;
  wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.scale(dpr, dpr);
}
resizeWave();
window.addEventListener("resize", function() { resizeWave(); resizeSpark(); });

function breathY(t, bpm, ratio) {
  var period = 60 / bpm;
  var phase = ((t % period) + period) % period / period;
  var angle;
  if (phase < ratio) angle = (phase / ratio) * Math.PI;
  else               angle = Math.PI + ((phase - ratio) / (1 - ratio)) * Math.PI;
  return -Math.cos(angle);
}

function drawWave() {
  if (!state) { requestAnimationFrame(drawWave); return; }
  var w = wave.clientWidth, h = wave.clientHeight;
  wctx.clearRect(0, 0, w, h);

  var bpm = state.params.bpm, ratio = state.params.ratio, depth = state.params.depth;
  // Anchor on backend cycle_start_unix so the wave stays in lock-step with the
  // backend's cycle boundaries even between polls.
  var elapsed = (Date.now() / 1000 - state.cycle_start_unix);
  var period = 60 / bpm;
  var visibleSeconds = period * 2.5;

  var cy = h / 2;
  var amp = (h / 2 - 40) * Math.min(1, depth / 0.5);
  var samples = 320;
  var nowFrac = 0.65;

  wctx.beginPath();
  for (var i = 0; i <= samples; i++) {
    var x = (i / samples) * w;
    var tFromLeft = (i / samples) * visibleSeconds;
    var localTime = elapsed - visibleSeconds * nowFrac + tFromLeft;
    var y = cy - breathY(localTime, bpm, ratio) * amp;
    if (i === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
  }
  wctx.lineWidth = 2.5;
  wctx.strokeStyle = ACCENT;
  wctx.shadowColor = ACCENT;
  wctx.shadowBlur = 20;
  wctx.stroke();
  wctx.shadowBlur = 0;

  wctx.lineTo(w, h);
  wctx.lineTo(0, h);
  wctx.closePath();
  var grad = wctx.createLinearGradient(0, cy - amp, 0, h);
  grad.addColorStop(0, ACCENT + "33");
  grad.addColorStop(1, ACCENT + "00");
  wctx.fillStyle = grad;
  wctx.fill();

  var nowX = w * nowFrac;
  wctx.fillStyle = "rgba(0,0,0,0.35)";
  wctx.fillRect(nowX, 0, w - nowX, h);

  wctx.strokeStyle = "#2a2a3a";
  wctx.lineWidth = 1;
  wctx.setLineDash([3, 4]);
  wctx.beginPath();
  wctx.moveTo(nowX, 30);
  wctx.lineTo(nowX, h - 12);
  wctx.stroke();
  wctx.setLineDash([]);

  var nowY = cy - breathY(elapsed, bpm, ratio) * amp;
  wctx.fillStyle = ACCENT + "40";
  wctx.beginPath(); wctx.arc(nowX, nowY, 18, 0, Math.PI * 2); wctx.fill();
  wctx.fillStyle = ACCENT;
  wctx.beginPath(); wctx.arc(nowX, nowY, 7, 0, Math.PI * 2); wctx.fill();

  var phase = ((elapsed % period) + period) % period / period;
  document.getElementById("phase-live").textContent = phase < ratio ? "INHALE" : "EXHALE";
  document.getElementById("cycle-tag").textContent = "cycle " + state.cycle_num;

  requestAnimationFrame(drawWave);
}
requestAnimationFrame(drawWave);

// ===== Sparkline =====
var spark = document.getElementById("spark");
var sctx = spark.getContext("2d");
function resizeSpark() {
  var dpr = window.devicePixelRatio || 1;
  spark.width = spark.clientWidth * dpr;
  spark.height = spark.clientHeight * dpr;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.scale(dpr, dpr);
}
resizeSpark();

function drawSpark() {
  var w = spark.clientWidth, h = spark.clientHeight;
  sctx.clearRect(0, 0, w, h);
  if (hrHistory.length < 2) return;
  var min = Math.min.apply(null, hrHistory) - 1;
  var max = Math.max.apply(null, hrHistory) + 1;
  var range = max - min || 1;

  sctx.strokeStyle = "#1a1a25";
  sctx.lineWidth = 1;
  sctx.beginPath(); sctx.moveTo(0, h/2); sctx.lineTo(w, h/2); sctx.stroke();

  sctx.beginPath();
  hrHistory.forEach(function(v, i) {
    var x = (i / (hrHistory.length - 1)) * w;
    var y = h - ((v - min) / range) * h;
    if (i === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y);
  });
  sctx.strokeStyle = ACCENT + "aa";
  sctx.lineWidth = 1.5;
  sctx.stroke();

  var last = hrHistory[hrHistory.length - 1];
  var lastY = h - ((last - min) / range) * h;
  sctx.fillStyle = ACCENT;
  sctx.beginPath(); sctx.arc(w - 2, lastY, 3, 0, Math.PI * 2); sctx.fill();
}

// ===== Param change pulse + log entry =====
function pulseParam(key, oldVal, newVal, hrCtx) {
  var el = document.getElementById("p-" + key);
  el.querySelector(".param-arrow").textContent = newVal < oldVal ? "▼" : "▲";
  el.classList.add("pulse");
  setTimeout(function() { el.classList.remove("pulse"); }, 2000);

  var log = document.getElementById("log");
  var entry = document.createElement("div");
  entry.className = "log-entry";
  var t = new Date();
  var ts = t.getMinutes().toString().padStart(2, "0") + ":" + t.getSeconds().toString().padStart(2, "0");
  var oldStr = key === "bpm" ? oldVal.toFixed(2) : oldVal.toFixed(2);
  var newStr = key === "bpm" ? newVal.toFixed(2) : newVal.toFixed(2);
  entry.innerHTML =
    '<span class="ts">[' + ts + ']</span> cycle ' + state.cycle_num + ': ' + hrCtx +
    ' → <span class="accent">' + key + ' ' + oldStr + ' → ' + newStr + '</span>';
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// ===== Polling =====
async function poll() {
  try {
    var r = await fetch("/api/state");
    if (!r.ok) return;
    var d = await r.json();
    if (!d.active) {
      document.title = "DaoBrew · Done";
      document.getElementById("phase-live").textContent = "COMPLETE";
      return;
    }

    if (prevParams && state) {
      var hrCtx = d.hr != null ? "HR " + Math.round(d.hr) : "HR --";
      if (d.params.bpm !== prevParams.bpm) {
        document.getElementById("v-bpm").textContent = d.params.bpm.toFixed(2);
        pulseParam("bpm", prevParams.bpm, d.params.bpm, hrCtx);
      }
      if (d.params.ratio !== prevParams.ratio) {
        document.getElementById("v-ratio").textContent = d.params.ratio.toFixed(2);
        pulseParam("ratio", prevParams.ratio, d.params.ratio, hrCtx);
      }
      if (d.params.depth !== prevParams.depth) {
        document.getElementById("v-depth").textContent = d.params.depth.toFixed(2);
        pulseParam("depth", prevParams.depth, d.params.depth, hrCtx);
      }
    } else {
      document.getElementById("v-bpm").textContent = d.params.bpm.toFixed(2);
      document.getElementById("v-ratio").textContent = d.params.ratio.toFixed(2);
      document.getElementById("v-depth").textContent = d.params.depth.toFixed(2);
    }
    prevParams = { bpm: d.params.bpm, ratio: d.params.ratio, depth: d.params.depth };

    if (d.hr != null) {
      hrHistory.push(d.hr);
      if (hrHistory.length > 30) hrHistory.shift();
      document.getElementById("hr").textContent = Math.round(d.hr);
      document.getElementById("hr-age").textContent =
        d.hr_age_sec != null && d.hr_age_sec > 6 ? Math.round(d.hr_age_sec) + "s ago" : "live";
      drawSpark();
    } else {
      document.getElementById("hr").textContent = "--";
      document.getElementById("hr-age").textContent = "no signal";
    }

    document.getElementById("cycle-info").textContent = "Cycle " + d.cycle_num;
    document.getElementById("timer").textContent = fmtTime(d.session_elapsed_sec) + " / " + fmtTime(DURATION);
    document.getElementById("progress").style.width =
      Math.min(100, (d.session_elapsed_sec / DURATION) * 100) + "%";

    state = d;
  } catch(e) { /* keep last good state */ }
}
setInterval(poll, POLL_MS);
poll();
</script>
</body>
</html>`;
}

function fmtTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
