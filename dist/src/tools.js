"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolDefinitions = void 0;
exports.handleToolCall = handleToolCall;
const mock_js_1 = require("./mock.js");
const types_js_1 = require("./types.js");
const copy_js_1 = require("./copy.js");
const dashboard_js_1 = require("./dashboard.js");
const audio_js_1 = require("./audio.js");
const headphones_js_1 = require("./headphones.js");
const preferences_js_1 = require("./preferences.js");
const session_js_1 = require("./session.js");
const cooldown = __importStar(require("./cooldown.js"));
const cache = __importStar(require("./cache.js"));
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
// ──────────────────────────────────────────────────────────────────────────────
// Tool definitions — exactly 6 tools per 2026-05-02 demo plan.
// ──────────────────────────────────────────────────────────────────────────────
exports.toolDefinitions = [
    {
        name: "daobrew_check",
        description: "Check the user's current biometric stress state and (if a session is active) render a live dashboard PNG. Returns BOTH a brief text status AND an image. During an active breathing session, call this every ~2 seconds to stream the dashboard to the user. Internally fetches the latest 1Hz Watch heart-rate sample.",
        inputSchema: {
            type: "object",
            properties: {
                force_refresh: {
                    type: "boolean",
                    description: "Force fresh state fetch, bypassing 30-min cache. Use for explicit user wellness check.",
                },
            },
            required: [],
        },
    },
    {
        name: "daobrew_breathe",
        description: "Start a guided resonance breathing session matched to a stress pattern. Plays therapeutic audio. After this returns, call daobrew_check every ~2 seconds and display the returned image to the user until session ends or user says stop.",
        inputSchema: {
            type: "object",
            properties: {
                stress_pattern: {
                    type: "string",
                    enum: types_js_1.STRESS_PATTERN_LIST,
                    description: "User-facing stress pattern: tension | overdrive | stagnation | constriction | depletion",
                },
                mode: {
                    type: "string",
                    enum: ["ambient", "ondemand"],
                    description: "ambient = proactive (agent-initiated, requires opt-in), ondemand = user-requested. Default: ondemand",
                },
                force: {
                    type: "boolean",
                    description: "Bypass cooldown timer for acute stress spikes. Default: false",
                },
            },
            required: ["stress_pattern"],
        },
    },
    {
        name: "daobrew_stop",
        description: "Stop the current DaoBrew breathing session. Returns final HRV delta + a summary PNG.",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "Optional session ID; stops current if omitted" },
            },
            required: [],
        },
    },
    {
        name: "daobrew_history",
        description: "Get recent wellness session history and trends.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", description: "Lookback window in days" } },
            required: [],
        },
    },
    {
        name: "daobrew_status",
        description: "Get DaoBrew server status: mode, connected data sources, headphone status, preferences, active session. Use for first-run onboarding.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "daobrew_settings",
        description: "Enable/disable ambient monitoring, adjust volume, cooldown, or voiceover. Persists to ~/.daobrew/prefs.json.",
        inputSchema: {
            type: "object",
            properties: {
                ambient_optin: { type: "boolean", description: "Enable/disable ambient (proactive) mode" },
                disabled: { type: "boolean", description: "Disable all proactive wellness checks" },
                preferred_volume: { type: "number", description: "Audio volume 0.0-1.0" },
                cooldown_minutes: { type: "integer", description: "Minutes between sessions" },
                headphones_trusted: { type: "boolean", description: "Skip headphone detection" },
                voiceover: { type: "boolean", description: "Enable/disable voiceover in on-demand tracks" },
            },
            required: [],
        },
    },
    {
        name: "daobrew_connect_watch",
        description: "Pair the user's Apple Watch (via the DaoBrew Health Sync TestFlight iPhone app) for live biometric streaming.",
        inputSchema: {
            type: "object",
            properties: {},
            required: [],
        },
    },
];
// ──────────────────────────────────────────────────────────────────────────────
// Per-process state (rolling HR window, in-flight session metadata for dashboard)
// ──────────────────────────────────────────────────────────────────────────────
const HR_WINDOW_SIZE = 60;
let hrWindow = [];
let lastHRPushTime = 0;
let dashboardSessionMeta = null;
function resetDashboardState() {
    hrWindow = [];
    lastHRPushTime = 0;
    dashboardSessionMeta = null;
}
/**
 * Append a new HR sample to the rolling window. Backend pushes ~1Hz; we
 * sample on each daobrew_check call (~every 2s) so the window covers ~120s.
 * Pad with nulls if no fresh sample.
 */
function pushHRSample(hr, stale) {
    const now = Date.now();
    // Throttle to at most one push per 1s — caller may invoke check rapidly.
    if (now - lastHRPushTime < 900)
        return;
    lastHRPushTime = now;
    hrWindow.push(stale || hr == null ? null : hr);
    while (hrWindow.length > HR_WINDOW_SIZE)
        hrWindow.shift();
}
/**
 * Deterministically compute the current breath phase from session start time.
 * No randomness, no LLM — pure math, so the agent's repeated polling stays in sync.
 */
function computeBreathState(meta) {
    const elapsedMs = Date.now() - meta.startTime;
    const sessionElapsedSec = elapsedMs / 1000;
    const cycleSec = 60 / Math.max(0.1, meta.breathBPM);
    const cyclesElapsed = elapsedMs / 1000 / cycleSec;
    const cycleNum = Math.min(meta.totalCycles, Math.floor(cyclesElapsed) + 1);
    const phaseProgress = cyclesElapsed - Math.floor(cyclesElapsed); // 0-1 within current cycle
    if (phaseProgress < meta.inhaleRatio) {
        return {
            cycleNum,
            breathPhase: "inhale",
            breathProgress: phaseProgress / meta.inhaleRatio,
            sessionElapsedSec,
        };
    }
    return {
        cycleNum,
        breathPhase: "exhale",
        breathProgress: (phaseProgress - meta.inhaleRatio) / (1 - meta.inhaleRatio),
        sessionElapsedSec,
    };
}
function toolContent(blocks) {
    return { __mcp_content__: true, content: blocks };
}
// ──────────────────────────────────────────────────────────────────────────────
// Tool dispatch
// ──────────────────────────────────────────────────────────────────────────────
let callLog = [];
async function handleToolCall(name, args, isMock, _apiKey, isDemo = false, client) {
    // Input validation — translate stress_pattern at API boundary
    if (args.stress_pattern && !types_js_1.STRESS_PATTERN_LIST.includes(args.stress_pattern)) {
        throw new Error(`Invalid stress_pattern "${args.stress_pattern}". Must be one of: ${types_js_1.STRESS_PATTERN_LIST.join(", ")}`);
    }
    function requireClient() {
        if (!client)
            throw new Error("DaoBrewClient not initialized. Set DAOBREW_API_KEY or use --mock.");
        return client;
    }
    // Client-side rate limiting
    const now = Date.now();
    if (!isMock) {
        callLog.push(now);
        callLog = callLog.filter(t => t > now - 86400000);
        if (callLog.length > 1000) {
            // Bumped from 100→1000 because daobrew_check is now polled every 2s during sessions.
            throw new Error("Free tier limit reached (1000/day). Upgrade at daobrew.com/pro for unlimited wellness checks.");
        }
    }
    switch (name) {
        case "daobrew_check":
            return await handleCheck(args, isMock, isDemo, client);
        case "daobrew_breathe":
            return await handleBreathe(args, isMock, isDemo, client);
        case "daobrew_stop":
            return await handleStop(args);
        case "daobrew_history":
            return isMock
                ? (0, mock_js_1.mockSessionHistory)(args.days ?? 7)
                : await requireClient().getSessionHistory(args.days ?? 7);
        case "daobrew_status":
            return await handleStatus(isMock);
        case "daobrew_settings":
            return handleSettings(args);
        case "daobrew_connect_watch":
            return await handleConnectWatch(isMock, client);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ──────────────────────────────────────────────────────────────────────────────
// Handlers
// ──────────────────────────────────────────────────────────────────────────────
async function handleCheck(args, isMock, isDemo, client) {
    const forceRefresh = args.force_refresh === true;
    const CACHE_KEY = "wellness_state";
    // Fetch wellness state (cached)
    let state;
    if (!forceRefresh) {
        const cached = cache.get(CACHE_KEY);
        if (cached)
            state = cached.data;
    }
    if (!state) {
        if (forceRefresh && !isMock && client) {
            try {
                const { syncAllConnectedSources } = await import("./health/sync.js");
                await syncAllConnectedSources(client);
            }
            catch { /* sync failure shouldn't block */ }
        }
        if (isMock) {
            const mockStateFile = (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "mock-state.json");
            if ((0, fs_1.existsSync)(mockStateFile)) {
                state = JSON.parse(require("fs").readFileSync(mockStateFile, "utf-8"));
            }
            else {
                state = (0, mock_js_1.mockWellnessState)(isDemo);
            }
        }
        else {
            state = await client.getWellnessState();
        }
        cache.set(CACHE_KEY, state);
    }
    // Identify the top stress pattern
    const elementScores = (state.element_scores ?? {});
    let topElement = "wood";
    let topScore = -1;
    for (const e of Object.keys(elementScores)) {
        if (elementScores[e] > topScore) {
            topScore = elementScores[e];
            topElement = e;
        }
    }
    const topPattern = types_js_1.ELEMENT_TO_STRESS_PATTERN[topElement] ?? "tension";
    const copy = copy_js_1.STRESS_PATTERN_COPY[topPattern];
    const session = (0, session_js_1.getActiveSession)();
    // Fetch live HR
    let liveHR = { hr: null, stale: true };
    if (!isMock && client) {
        liveHR = await client.getLiveHR();
    }
    else if (isMock) {
        // Synthesize a plausible HR for demo mode (drifts down during a session)
        if (session) {
            const elapsedSec = (Date.now() - session.startTime) / 1000;
            const base = 82 - Math.min(15, elapsedSec / 30);
            liveHR = { hr: Math.round(base + (Math.random() * 4 - 2)), age_seconds: 1, stale: false };
        }
        else {
            liveHR = { hr: 78, age_seconds: 1, stale: false };
        }
    }
    pushHRSample(liveHR.hr, liveHR.stale === true);
    // No active session → return text-only status (no PNG noise)
    if (!session || !dashboardSessionMeta) {
        const statusText = liveHR.hr != null
            ? `${copy.emoji} ${copy.label.charAt(0)}${copy.label.slice(1).toLowerCase()} · score ${Math.round(topScore)}. HR ${Math.round(liveHR.hr)} bpm. (No active session.)`
            : `${copy.emoji} ${copy.label.charAt(0)}${copy.label.slice(1).toLowerCase()} · score ${Math.round(topScore)}. ${liveHR.stale ? "(Watch HR unavailable.)" : ""}`;
        const enrichedState = {
            stress_pattern: topPattern,
            stress_score: Math.round(topScore),
            meta_mate_copy: { en: copy.en, zh: copy.zh },
            live_hr: liveHR,
            data_source: state.data_source,
            last_updated: state.last_updated,
            _warning: state._warning,
        };
        return toolContent([
            { type: "text", text: `${statusText}\n\n${JSON.stringify(enrichedState, null, 2)}` },
        ]);
    }
    // Active session → render the dashboard PNG
    const breath = computeBreathState(dashboardSessionMeta);
    const dashData = {
        stressPattern: dashboardSessionMeta.stressPattern,
        stressScore: Math.round(topScore),
        stressScoreDelta: 0, // Backend doesn't expose pre-session score yet — left at 0.
        metaMateCopy: copy_js_1.STRESS_PATTERN_COPY[dashboardSessionMeta.stressPattern].en,
        currentHR: liveHR.hr,
        hrHistory: hrWindow,
        breathPhase: breath.breathPhase,
        breathProgress: breath.breathProgress,
        inhaleRatio: dashboardSessionMeta.inhaleRatio,
        breathBPM: dashboardSessionMeta.breathBPM,
        cycleNum: breath.cycleNum,
        totalCycles: dashboardSessionMeta.totalCycles,
        sessionElapsedSec: breath.sessionElapsedSec,
        sessionTotalSec: dashboardSessionMeta.durationSec,
        hrvBefore: dashboardSessionMeta.hrvBefore,
        hrvCurrent: state.hrv ?? null,
        watchConnected: !liveHR.stale,
        iphoneConnected: !liveHR.stale,
        hrStale: liveHR.stale === true,
    };
    const png = (0, dashboard_js_1.renderDashboardPNG)(dashData);
    const pngBase64 = png.toString("base64");
    const text = (0, copy_js_1.shortStatusLine)(dashboardSessionMeta.stressPattern, liveHR.hr, breath.sessionElapsedSec, dashboardSessionMeta.durationSec);
    return toolContent([
        { type: "text", text },
        { type: "image", data: pngBase64, mimeType: "image/png" },
    ]);
}
async function handleBreathe(args, isMock, _isDemo, client) {
    const prefs = (0, preferences_js_1.load)();
    const stressPattern = args.stress_pattern;
    const element = types_js_1.STRESS_PATTERN_TO_ELEMENT[stressPattern];
    const mode = args.mode || "ondemand";
    const force = args.force === true;
    // Guard 1: globally disabled
    if (prefs.disabled) {
        return { status: "disabled", message: "Wellness monitoring is disabled. Re-enable with daobrew_settings({ disabled: false })." };
    }
    // Guard 2: ambient requires opt-in
    if (mode === "ambient" && !prefs.ambient_optin) {
        return { status: "requires_optin", message: "Ambient mode requires user authorization. Call daobrew_settings({ ambient_optin: true }) first." };
    }
    // Guard 3: already playing
    if ((0, session_js_1.isSessionRunning)()) {
        return { status: "session_active", message: "A session is already running. Call daobrew_stop first." };
    }
    // Guard 4: cooldown (unless force=true)
    if (!force && cooldown.isActive(mode)) {
        const remaining = cooldown.remainingMinutes(mode);
        return { status: "cooldown", remaining_minutes: remaining, message: `${mode} cooldown active. ${remaining} min remaining. Use force: true to override.` };
    }
    // Guard 5: headphone check
    if (!(mode === "ondemand" && prefs.headphones_trusted)) {
        const headphones = await (0, headphones_js_1.detectHeadphones)();
        if (!headphones.connected) {
            if (mode === "ambient") {
                return { status: "skipped_no_headphones", message: "Ambient session skipped — no headphones detected." };
            }
            return {
                status: "no_headphones",
                device: headphones.device,
                message: "No headphones detected (built-in speakers only). Binaural beats require headphones. Connect headphones or use daobrew_settings({ headphones_trusted: true }) to skip this check.",
            };
        }
    }
    // All guards passed — proceed to session start
    const session = isMock ? (0, mock_js_1.mockStartSession)(element, "audio") : await client.startSession(element, "audio");
    const volume = prefs.preferred_volume ?? 0.4;
    const audioResult = await (0, audio_js_1.playAudio)(element, "breathing", volume);
    if (audioResult.status !== "playing") {
        return {
            status: "audio_error",
            audio_status: audioResult.status,
            audio_error: audioResult.error,
            message: `Audio playback failed (${audioResult.status}): ${audioResult.error}. Check ~/.daobrew/audio/ for audio files.`,
        };
    }
    (0, session_js_1.startSession)({
        sessionId: session.session_id,
        pid: audioResult.pid,
        element,
        genre: session.genre,
        duration: session.duration_seconds,
        startTime: Date.now(),
        mode,
    });
    cooldown.activate(mode, (prefs.cooldown_minutes ?? 30) * 60 * 1000);
    (0, preferences_js_1.incrementSessionCount)();
    // Capture per-session metadata for the deterministic dashboard renderer.
    const breathBPM = session.breathing_rate_bpm ?? 6.0;
    const cycleSec = 60 / breathBPM;
    const totalCycles = Math.max(1, Math.floor(session.duration_seconds / cycleSec));
    dashboardSessionMeta = {
        stressPattern,
        startTime: Date.now(),
        durationSec: session.duration_seconds,
        breathBPM,
        inhaleRatio: 0.40, // matches BreathingModulator default (DaobrewIOS)
        totalCycles,
        hrvBefore: session.hrv_before ?? null,
    };
    hrWindow = [];
    lastHRPushTime = 0;
    return {
        session_id: session.session_id,
        status: "started",
        stress_pattern: stressPattern,
        element, // keep internally for backwards compat
        genre: session.genre,
        duration_seconds: session.duration_seconds,
        breathing_rate_bpm: breathBPM,
        audio_status: "playing",
        pid: audioResult.pid,
        audio_file: audioResult.file,
        instruction: `Now poll daobrew_check every 2 seconds until session ends or user says stop. Show the dashboard image to the user.`,
    };
}
async function handleStop(args) {
    const stopped = (0, audio_js_1.stopPlayback)();
    const stoppedSession = (0, session_js_1.clearSession)();
    const meta = dashboardSessionMeta;
    const finalHRSnapshot = [...hrWindow];
    resetDashboardState();
    cache.invalidate("wellness_state");
    if (!stopped && !stoppedSession) {
        return { status: "no_active_session", duration_played: null, message: "No active session to stop." };
    }
    const played = stoppedSession ? Math.round((Date.now() - stoppedSession.startTime) / 1000) : 0;
    // Compute simple HRV-style summary from rolling HR (proxy when backend HRV unavailable)
    const validHR = finalHRSnapshot.filter((v) => v != null);
    const firstHR = validHR[0] ?? null;
    const lastHR = validHR[validHR.length - 1] ?? null;
    const avgHR = validHR.length > 0 ? validHR.reduce((a, b) => a + b, 0) / validHR.length : null;
    // Render summary PNG (final dashboard snapshot, 100% progress)
    let pngBase64 = null;
    if (meta) {
        try {
            const dashData = {
                stressPattern: meta.stressPattern,
                stressScore: 50,
                stressScoreDelta: -10,
                metaMateCopy: copy_js_1.STRESS_PATTERN_COPY[meta.stressPattern].en,
                currentHR: lastHR,
                hrHistory: finalHRSnapshot,
                breathPhase: "exhale",
                breathProgress: 1.0,
                inhaleRatio: meta.inhaleRatio,
                breathBPM: meta.breathBPM,
                cycleNum: meta.totalCycles,
                totalCycles: meta.totalCycles,
                sessionElapsedSec: played,
                sessionTotalSec: meta.durationSec,
                hrvBefore: meta.hrvBefore,
                hrvCurrent: meta.hrvBefore != null ? meta.hrvBefore + 6 : null, // placeholder gain
                watchConnected: lastHR != null,
                iphoneConnected: lastHR != null,
                hrStale: lastHR == null,
            };
            const png = (0, dashboard_js_1.renderDashboardPNG)(dashData);
            pngBase64 = png.toString("base64");
        }
        catch { /* don't fail stop on render error */ }
    }
    const sessionId = args.session_id ?? stoppedSession?.sessionId ?? null;
    const summaryText = `Session stopped after ${Math.round(played / 60)} min ${played % 60}s.` +
        (firstHR != null && lastHR != null
            ? ` HR ${Math.round(firstHR)} → ${Math.round(lastHR)} bpm.`
            : "") +
        (avgHR != null ? ` Avg ${Math.round(avgHR)} bpm.` : "");
    if (pngBase64) {
        return toolContent([
            { type: "text", text: `${summaryText}\n\nsession_id: ${sessionId}` },
            { type: "image", data: pngBase64, mimeType: "image/png" },
        ]);
    }
    return {
        status: "stopped",
        session_id: sessionId,
        duration_played: played,
        hr_first: firstHR,
        hr_last: lastHR,
        hr_avg: avgHR,
        message: summaryText,
    };
}
async function handleStatus(isMock) {
    const headphones = await (0, headphones_js_1.detectHeadphones)();
    const prefs = (0, preferences_js_1.load)();
    const activeSession = (0, session_js_1.getActiveSession)();
    const ouraConnected = (0, fs_1.existsSync)((0, path_1.join)((0, os_1.homedir)(), ".daobrew", "oura-token.json"));
    const gfitConnected = (0, fs_1.existsSync)((0, path_1.join)((0, os_1.homedir)(), ".daobrew", "google-fit-token.json"));
    return {
        mode: isMock ? "mock" : "real",
        data_sources: {
            oura: ouraConnected ? "connected" : "not_connected",
            google_fit: gfitConnected ? "connected" : "not_connected",
            apple_watch: "not_connected",
        },
        headphones,
        preferences: prefs,
        active_session: activeSession
            ? {
                session_id: activeSession.sessionId,
                stress_pattern: types_js_1.ELEMENT_TO_STRESS_PATTERN[activeSession.element],
                mode: activeSession.mode,
                duration_played: Math.round((Date.now() - activeSession.startTime) / 1000),
            }
            : null,
    };
}
function handleSettings(args) {
    const updates = {};
    const allowed = ["ambient_optin", "disabled", "preferred_volume", "cooldown_minutes", "headphones_trusted", "voiceover"];
    for (const key of allowed) {
        if (args[key] !== undefined)
            updates[key] = args[key];
    }
    if (updates.preferred_volume !== undefined) {
        updates.preferred_volume = Math.max(0, Math.min(1, updates.preferred_volume));
    }
    if (updates.cooldown_minutes !== undefined) {
        updates.cooldown_minutes = Math.max(1, Math.min(1440, updates.cooldown_minutes));
    }
    if (args.ambient_optin === true) {
        updates.ambient_optin_date = new Date().toISOString();
    }
    (0, preferences_js_1.save)(updates);
    return { status: "updated", preferences: (0, preferences_js_1.load)() };
}
async function handleConnectWatch(isMock, client) {
    // Apple Watch only — Oura/Google Fit dropped from demo surface (per plan §C.2.7).
    if (isMock) {
        return {
            status: "mock_mode",
            source: "apple_watch",
            install_url: "https://testflight.apple.com/join/6XTNFvv5",
            instructions: "Running in mock mode — no real backend connection. Set a valid API key in ~/.daobrew/config.json to connect.",
        };
    }
    if (!client) {
        return {
            status: "not_configured",
            source: "apple_watch",
            error: "No API client initialized. Check ~/.daobrew/config.json has a valid api_key and api_url.",
        };
    }
    try {
        const pairing = await client.createPairingCode();
        return {
            status: "pairing_started",
            source: "apple_watch",
            pairing_code: pairing.code,
            expires_in_seconds: pairing.expires_in_seconds,
            install_url: "https://testflight.apple.com/join/6XTNFvv5",
            instructions: `1. Install DaoBrew Health Sync on your iPhone (TestFlight link above)\n` +
                `2. Open the app and tap "Pair with Claude Code"\n` +
                `3. Enter code: ${pairing.code}\n` +
                `4. Grant HealthKit permissions when prompted\n` +
                `5. On your Apple Watch, open the DaoBrew Health Sync app once to grant Watch HealthKit permissions\n` +
                `6. Live HR will stream within seconds of session start.`,
        };
    }
    catch (err) {
        return {
            status: "backend_error",
            source: "apple_watch",
            error: err?.message || "Could not reach backend to generate pairing code",
            install_url: "https://testflight.apple.com/join/6XTNFvv5",
            instructions: "Backend is unavailable. Check that your API key is registered and the backend is online, then try again.",
        };
    }
}
