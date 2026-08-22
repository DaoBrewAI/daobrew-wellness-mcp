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
exports.toolUserId = toolUserId;
const graph_db_js_1 = require("./graph-db.js");
const assignments_js_1 = require("./engine/assignments.js");
const child_process_1 = require("child_process");
const types_js_1 = require("./types.js");
const copy_js_1 = require("./copy.js");
const audio_js_1 = require("./audio.js");
const headphones_js_1 = require("./headphones.js");
const preferences_js_1 = require("./preferences.js");
const session_js_1 = require("./session.js");
const local_config_js_1 = require("./engine/local-config.js");
const user_scope_js_1 = require("./engine/user-scope.js");
const cooldown = __importStar(require("./cooldown.js"));
const cache = __importStar(require("./cache.js"));
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const dashboard_server_js_1 = require("./dashboard-server.js");
const entitlement_js_1 = require("./entitlement.js");
const oura = __importStar(require("./health/oura.js"));
// ──────────────────────────────────────────────────────────────────────────────
// Tool definitions — exactly 6 tools per 2026-05-02 demo plan.
// ──────────────────────────────────────────────────────────────────────────────
exports.toolDefinitions = [
    {
        name: "daobrew_check",
        description: "Check the user's current biometric stress state.",
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
        description: "Start a guided resonance breathing session matched to a stress pattern. Plays therapeutic audio and opens a live waveform dashboard in the user's browser.",
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
        description: "Stop the current DaoBrew breathing session. Returns a one-line text summary (cycles + HR delta).",
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
                dashboard_enabled: { type: "boolean", description: "Enable/disable live breath dashboard in browser" },
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
    {
        name: "daobrew_detonate",
        description: "Fetch the ready Sentinel action package: likely work thread, evidence, artifact spec, and next steps. Call this when the user opens the Sentinel action package.",
        inputSchema: {
            type: "object",
            properties: {
                cause_id: { type: "string", description: "Specific armed cause node id; omit to fetch the first armed cause" },
            },
            required: [],
        },
    },
    {
        name: "daobrew_schedule_block",
        description: "Create a calendar block in macOS Calendar.app for reviewing a Sentinel action package (or any focus block). Times are relative to now.",
        inputSchema: {
            type: "object",
            properties: {
                title: { type: "string", description: "Event title, e.g. 'DaoBrew · AI2 demo story prep'" },
                start_offset_min: { type: "integer", description: "Minutes from now until the block starts (default 60)" },
                duration_min: { type: "integer", description: "Block length in minutes (default 45)" },
                calendar_name: { type: "string", description: "Target calendar name; defaults to the first writable calendar" },
            },
            required: ["title"],
        },
    },
    {
        name: "daobrew_detonate_done",
        description: "Mark a Sentinel action package as completed: records the artifact reference and closes the loop.",
        inputSchema: {
            type: "object",
            properties: {
                cause_id: { type: "string", description: "The cause node id from daobrew_detonate" },
                artifact_ref: { type: "string", description: "Where the produced artifact lives, e.g. a file path or URL" },
                user_acceptance: {
                    type: "string",
                    enum: ["accepted", "edited", "rejected"],
                    description: "Optional: how the user received the artifact — accepted as-is, edited it, or rejected it.",
                },
            },
            required: ["cause_id", "artifact_ref"],
        },
    },
];
let localSessionInfo = null;
function developmentMockModule() {
    return require("./mock.js");
}
function resetDashboardState() {
    localSessionInfo = null;
}
function toolContent(blocks, opts) {
    const result = { __mcp_content__: true, content: blocks };
    if (opts?.localData)
        result.__local_data__ = true;
    return result;
}
// ──────────────────────────────────────────────────────────────────────────────
// Tool dispatch
// ──────────────────────────────────────────────────────────────────────────────
async function handleToolCall(name, args, isMock, _apiKey, isDemo = false, client) {
    // Development simulations live in an unpublished module. A production npm
    // install cannot activate this boolean seam because that module is absent.
    if (isMock)
        developmentMockModule();
    // Input validation — translate stress_pattern at API boundary
    if (args.stress_pattern && !types_js_1.STRESS_PATTERN_LIST.includes(args.stress_pattern)) {
        throw new Error(`Invalid stress_pattern "${args.stress_pattern}". Must be one of: ${types_js_1.STRESS_PATTERN_LIST.join(", ")}`);
    }
    function requireClient() {
        if (!client)
            throw new Error("DaoBrewClient not initialized. Set DAOBREW_API_KEY or use --mock.");
        return client;
    }
    switch (name) {
        case "daobrew_check":
            return await handleCheck(args, isMock, isDemo, client);
        case "daobrew_breathe":
            return await handleBreathe(args, isMock, isDemo, client);
        case "daobrew_stop":
            return await handleStop(args, isMock, client);
        case "daobrew_history":
            return isMock
                ? developmentMockModule().mockSessionHistory(args.days ?? 7)
                : await requireClient().getSessionHistory(args.days ?? 7);
        case "daobrew_status":
            return await handleStatus(isMock, client);
        case "daobrew_settings":
            return handleSettings(args);
        case "daobrew_connect_watch":
            return await handleConnectWatch(isMock, client);
        case "daobrew_detonate":
            return await handleDetonate(args, isMock);
        case "daobrew_schedule_block":
            return await handleScheduleBlock(args);
        case "daobrew_detonate_done":
            return await handleDetonateDone(args, isMock);
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
    // ── Fast path: active live session → return concise text only.
    // The live waveform/UI lives in the browser dashboard (see dashboard-server.ts).
    // Chat surface stays a single status line so the agent has something to acknowledge.
    const localSession = (0, session_js_1.getActiveSession)();
    if (localSession && localSessionInfo) {
        const breathState = isMock
            ? developmentMockModule().mockBreathState(localSession.element, localSession.startTime, localSessionInfo.durationSec)
            : await client.getBreathState();
        if (breathState.active) {
            const text = (0, copy_js_1.shortStatusLine)(types_js_1.ELEMENT_TO_STRESS_PATTERN[breathState.pattern], breathState.current_hr, breathState.session_elapsed_sec, localSessionInfo.durationSec);
            return toolContent([{ type: "text", text }]);
        }
        // session active locally but backend has none — fall through to idle
    }
    // ── No active session → return wellness state + idle frame.
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
                state = developmentMockModule().mockWellnessState(isDemo);
            }
        }
        else {
            state = await client.getWellnessState();
        }
        cache.set(CACHE_KEY, state);
    }
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
    let liveHR = { hr: null, stale: true };
    if (!isMock && client)
        liveHR = await client.getLiveHR();
    else if (isMock)
        liveHR = { hr: 78, age_seconds: 1, stale: false };
    const idleMessage = liveHR.hr != null
        ? `${copy.emoji} ${copy.label} detected — score ${Math.round(topScore)}/100. HR ${Math.round(liveHR.hr)} bpm.\n${copy.en}`
        : `${copy.emoji} ${copy.label} detected — score ${Math.round(topScore)}/100. (Watch HR unavailable.)\n${copy.en}`;
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
        { type: "text", text: `${idleMessage}\n\n${JSON.stringify(enrichedState, null, 2)}` },
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
    // All guards passed — proceed to session start.
    // Override backend-suggested duration: product spec is 3 min for the demo loop.
    const SESSION_DURATION_SEC = 180;
    const session = isMock ? developmentMockModule().mockStartSession(element, "audio") : await client.startSession(element, "audio");
    session.duration_seconds = SESSION_DURATION_SEC;
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
    // Tell backend to start cycle-boundary feedback for this user. Backend computes
    // new params at every breath cycle boundary; MCP polls breath-state to render.
    let liveSessionStarted = false;
    if (!isMock && client) {
        try {
            // Capture HR snapshot for the summary frame's "HR delta" line.
            const startHR = await client.getLiveHR().catch(() => ({ hr: null }));
            await client.startLiveSession(element, session.duration_seconds);
            localSessionInfo = {
                pattern: stressPattern,
                durationSec: session.duration_seconds,
                startedHR: startHR.hr,
            };
            liveSessionStarted = true;
        }
        catch (err) {
            // Don't fail the whole tool if backend session start fails — audio still plays,
            // just no live cycle-feedback. Surface in the response so caller can debug.
            localSessionInfo = {
                pattern: stressPattern,
                durationSec: session.duration_seconds,
                startedHR: null,
            };
        }
    }
    else {
        // Mock mode — no backend, but track locally so check renders the mock frame.
        localSessionInfo = {
            pattern: stressPattern,
            durationSec: session.duration_seconds,
            startedHR: 82,
        };
        liveSessionStarted = true;
    }
    // Start live dashboard HTTP server. URL is surfaced in the tool response below
    // for the user to Cmd+Click — no auto-open, no clipboard write.
    let dashboardURL = null;
    if (!isMock && client && prefs.dashboard_enabled) {
        try {
            dashboardURL = await (0, dashboard_server_js_1.startDashboardServer)(element, session.duration_seconds, client);
        }
        catch { }
    }
    const copy = copy_js_1.STRESS_PATTERN_COPY[stressPattern];
    const durationMin = Math.round(session.duration_seconds / 60);
    const statusText = `${copy.emoji} Playing ${stressPattern} session — ${durationMin} min. 🎧`;
    const dashboardBlock = dashboardURL ? `${dashboardURL}\n\n` : "";
    return toolContent([
        { type: "text", text: `${dashboardBlock}${statusText}\n\n` +
                `Say "stop" to end the session.`
        },
    ]);
}
async function handleStop(args, isMock, client) {
    const stopped = (0, audio_js_1.stopPlayback)();
    const stoppedSession = (0, session_js_1.clearSession)();
    const localInfo = localSessionInfo;
    resetDashboardState();
    await (0, dashboard_server_js_1.stopDashboardServer)();
    cache.invalidate("wellness_state");
    if (!stopped && !stoppedSession) {
        return { status: "no_active_session", duration_played: null, message: "No active session to stop." };
    }
    // Tell backend to end the live session — gives us cycles_completed + final params + last HR.
    let backendStop = null;
    if (!isMock && client) {
        try {
            backendStop = await client.stopLiveSession();
        }
        catch { /* best-effort */ }
    }
    const played = stoppedSession ? Math.round((Date.now() - stoppedSession.startTime) / 1000) : 0;
    const sessionId = args.session_id ?? stoppedSession?.sessionId ?? null;
    // client.request() already unwraps `data` envelope.
    const cyclesCompleted = backendStop?.cycles_completed ?? 0;
    const endedHR = backendStop?.last_cycle_hr_mean ?? null;
    const startedHR = localInfo?.startedHR ?? null;
    const summaryText = `Session stopped after ${Math.round(played / 60)} min ${played % 60}s.` +
        ` ${cyclesCompleted} breathing cycles completed.` +
        (startedHR != null && endedHR != null
            ? ` HR ${Math.round(startedHR)} → ${Math.round(endedHR)} bpm.`
            : "");
    return toolContent([
        { type: "text", text: `${summaryText}\nsession_id: ${sessionId}` },
    ]);
}
/**
 * The armed root's proactive surface for daobrew_status (MRT randomization
 * v1). This is where the system OFFERS the detonation CTA — so control
 * episodes (props.offer_state === 'held', drawn at arming time) are
 * suppressed here: the pattern/watching info still shows, but no
 * call-to-action and no cause id to act on. daobrew_detonate itself is
 * user-initiated and stays ALWAYS honored, held or not (intent-to-treat
 * override). Read-only and fail-soft: any graph error degrades to null and
 * never breaks the status payload.
 */
async function armedActionPackageStatus() {
    if (!(0, graph_db_js_1.graphDbExists)())
        return null;
    try {
        const { query } = toolScopedDb();
        const armedStatusExpr = (0, graph_db_js_1.graphStoreKind)() === "postgres"
            ? "props_json ->> 'status' = 'armed'"
            : "json_extract(props_json, '$.status') = 'armed'";
        const rows = (await query(`SELECT id, title, props_json FROM graph_nodes
       WHERE kind = 'ghost' AND ${armedStatusExpr}
       ORDER BY created_at_ts LIMIT 1`));
        if (rows.length === 0)
            return null;
        const props = typeof rows[0].props_json === "string"
            ? JSON.parse(rows[0].props_json || "{}")
            : rows[0].props_json ?? {};
        if (props.offer_state === "held") {
            // Control arm: watching info only — no detonation CTA, no id to act on.
            return {
                state: "watching",
                pattern: props.selected_pattern ?? null,
                title: rows[0].title ?? null,
            };
        }
        return {
            state: "ready",
            cause_id: rows[0].id,
            pattern: props.selected_pattern ?? null,
            title: rows[0].title ?? null,
            cta: "A Sentinel action package is ready — open it with daobrew_detonate.",
        };
    }
    catch {
        return null; // fail-soft: status must render without the graph
    }
}
async function handleStatus(isMock, client) {
    const headphones = await (0, headphones_js_1.detectHeadphones)();
    const prefs = (0, preferences_js_1.load)();
    const activeSession = (0, session_js_1.getActiveSession)();
    const ouraConnected = oura.isConnected();
    const gfitConnected = (0, fs_1.existsSync)((0, path_1.join)((0, os_1.homedir)(), ".daobrew", "google-fit-token.json"));
    let appleWatchStatus = "not_connected";
    if (isMock) {
        appleWatchStatus = "paired";
    }
    else if (client) {
        try {
            const liveHR = await client.getLiveHR();
            if (liveHR.hr != null && !liveHR.stale) {
                appleWatchStatus = "connected";
            }
            else if (liveHR.hr != null) {
                appleWatchStatus = "paired_stale";
            }
        }
        catch { }
    }
    return {
        mode: isMock ? "mock" : "real",
        data_sources: {
            oura: ouraConnected ? "connected" : "not_connected",
            google_fit: gfitConnected ? "connected" : "not_connected",
            apple_watch: appleWatchStatus,
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
        sentinel_action_package: await armedActionPackageStatus(),
    };
}
function handleSettings(args) {
    const updates = {};
    const allowed = ["ambient_optin", "disabled", "preferred_volume", "cooldown_minutes", "headphones_trusted", "voiceover", "dashboard_enabled"];
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
// ──────────────────────────────────────────────────────────────────────────────
// Detonator — causal-chain root-cause handoff
//
// Reads the local Sentinel graph DB (shared with the macOS app) when it exists;
// graph tools work without an API key. DaoBrew stays brain + scheduling + brief
// + routing: the calling agent produces the artifact, never this server.
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Tool-layer identity for RLS scoping.
 *
 * The MCP server is a per-user local process — there is exactly one human
 * behind it. Under row-level security the tool layer cannot learn the user
 * from the rows it reads (no scope → no visible row, the chicken-and-egg),
 * so identity must resolve BEFORE the first query:
 *
 *   DAOBREW_USER_ID env (trimmed, non-empty)
 *     ?? user_id in ~/.daobrew/config.json (DAOBREW_CONFIG_FILE honored)
 *     ?? "local"
 *
 * Row payload fields (e.g. rows[0].user_id for the assignment log) keep
 * reading the row; only the QUERY/EXEC scope comes from this identity.
 */
function toolUserId() {
    const env = (process.env.DAOBREW_USER_ID || "").trim();
    if (env)
        return env;
    const config = (0, local_config_js_1.readLocalConfig)();
    const fromConfig = typeof config.user_id === "string" ? config.user_id.trim() : "";
    return fromConfig || "local";
}
/** Postgres-gated scoped executors for the tool handlers: under Postgres the
 *  SQL carries the session GUC for toolUserId(); under SQLite the raw
 *  transports are returned so composed SQL stays byte-identical (set_config
 *  is invalid SQLite). */
function toolScopedDb() {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return { query: graph_db_js_1.queryJson, exec: graph_db_js_1.execSql };
    const userId = toolUserId();
    return { query: (0, user_scope_js_1.scopedQuery)(userId), exec: (0, user_scope_js_1.scopedExec)(userId) };
}
function renderBrief(brief, opts) {
    const b = brief.suggested_block;
    // When the Sentinel app armed this cause it already wrote the calendar
    // block — tell the agent to skip scheduling instead of double-booking.
    const scheduleStep = opts?.blockScheduled
        ? `  2. Prep block already on calendar${opts.blockLine ? ` (${opts.blockLine})` : ""} — skip daobrew_schedule_block.\n`
        : `  2. Schedule the prep block: daobrew_schedule_block({ title: ${JSON.stringify(b.title)}, start_offset_min: ${b.start_offset_min}, duration_min: ${b.duration_min} })\n`;
    const contextBlock = brief.context
        ? `CONTEXT  (Sentinel assembled this from your watch signal, notes, and project context)\n${brief.context}\n\n`
        : "";
    return (`SENTINEL ACTION PACKAGE — ready to review\n\n` +
        `cause_id: ${brief.cause_id}\n\n` +
        `LIKELY WORK THREAD\n${brief.cause}\n\n` +
        `EVIDENCE\n${brief.evidence.map(e => `  • ${e}`).join("\n")}\n\n` +
        contextBlock +
        `REVIEW TASK\n${brief.artifact_spec}\n\n` +
        `NEXT STEPS (do these now)\n` +
        `  1. Present the likely work thread and evidence to the user.\n` +
        scheduleStep +
        `  3. Produce the artifact per spec and save it to a file.\n` +
        `  4. Close the loop: daobrew_detonate_done({ cause_id: ${JSON.stringify(brief.cause_id)}, artifact_ref: "<path>" }) — include user_acceptance: "accepted" | "edited" | "rejected" if the user reacted to the artifact.`);
}
async function handleDetonate(args, isMock) {
    if (!isMock) {
        const entitlement = (0, entitlement_js_1.checkEntitlement)();
        if (!entitlement.entitled) {
            return {
                status: "not_entitled",
                reason: entitlement.reason,
                install_and_pay: entitlement.install_and_pay,
            };
        }
    }
    if ((0, graph_db_js_1.graphDbExists)()) {
        const { query, exec } = toolScopedDb();
        const where = args.cause_id ? `id = ${(0, graph_db_js_1.q)(String(args.cause_id))} AND` : "";
        const armedStatusExpr = (0, graph_db_js_1.graphStoreKind)() === "postgres"
            ? "props_json ->> 'status' = 'armed'"
            : "json_extract(props_json, '$.status') = 'armed'";
        let rows;
        try {
            rows = (await query(`SELECT id, user_id, created_at_ts, title, props_json FROM graph_nodes
         WHERE ${where} kind = 'ghost' AND ${armedStatusExpr}
         ORDER BY created_at_ts LIMIT 1`));
        }
        catch (err) {
            return { status: "graph_error", db: (0, graph_db_js_1.graphStoreDescription)(), error: err?.message };
        }
        if (rows.length === 0) {
            return toolContent([{ type: "text", text: "No ready Sentinel action package found. Keep watching from Sentinel's Patterns view." }], { localData: true });
        }
        const props = typeof rows[0].props_json === "string"
            ? JSON.parse(rows[0].props_json || "{}")
            : rows[0].props_json ?? {};
        const stored = props.brief ?? {};
        const brief = {
            cause_id: rows[0].id,
            cause: stored.cause ?? rows[0].title,
            evidence: stored.evidence ?? [],
            context: stored.context,
            artifact_spec: stored.artifact_spec ?? `Produce the artifact resolving: ${rows[0].title}`,
            suggested_block: stored.suggested_block ?? { title: `DaoBrew · ${rows[0].title} prep`, start_offset_min: 60, duration_min: 45 },
        };
        // Assignment log (thin MRT): record what the deterministic policy served.
        // Fail-soft by contract — a logging failure must never break detonation.
        try {
            await (0, assignments_js_1.logInterventionAssignment)({
                userId: rows[0].user_id ?? "local",
                ghostId: rows[0].id,
                armedAtTs: (0, assignments_js_1.armedEpisodeTs)(props, rows[0].created_at_ts ?? null),
                ghostProps: props,
                storeKind: (0, graph_db_js_1.graphStoreKind)(),
                exec,
                nowTs: Math.floor(Date.now() / 1000),
            });
        }
        catch { /* fail-soft: assignment logging never blocks the brief */ }
        return toolContent([{ type: "text", text: renderBrief(brief, { blockScheduled: !!props.block_scheduled, blockLine: props.block_line }) }], { localData: true });
    }
    if (isMock) {
        const brief = developmentMockModule().mockDetonateBrief();
        if (!brief)
            return toolContent([{ type: "text", text: "No ready Sentinel action package in the mock chain. Restart the server to reset the demo." }]);
        return toolContent([{ type: "text", text: renderBrief(brief) }]);
    }
    return {
        status: "no_graph",
        db: (0, graph_db_js_1.graphStoreDescription)(),
        message: "No Sentinel graph found. The graph is written by the Sentinel macOS app; for the demo chain run: node scripts/seed-demo-graph.mjs",
    };
}
async function handleScheduleBlock(args) {
    const title = String(args.title ?? "").trim();
    if (!title)
        throw new Error("daobrew_schedule_block requires a title.");
    if (process.platform !== "darwin") {
        return { status: "unsupported_platform", message: "Calendar blocks require macOS (Calendar.app via osascript)." };
    }
    const startOffsetMin = Number.isFinite(args.start_offset_min) ? Math.max(0, Math.round(args.start_offset_min)) : 60;
    const durationMin = Number.isFinite(args.duration_min) ? Math.max(5, Math.round(args.duration_min)) : 45;
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const calendarClause = args.calendar_name
        ? `calendar "${esc(String(args.calendar_name))}"`
        : `(first calendar whose writable is true)`;
    const script = `tell application "Calendar"\n` +
        `  set blockStart to (current date) + ${startOffsetMin * 60}\n` +
        `  set blockEnd to blockStart + ${durationMin * 60}\n` +
        `  tell ${calendarClause}\n` +
        `    make new event with properties {summary:"${esc(title)}", start date:blockStart, end date:blockEnd}\n` +
        `    return name of it\n` +
        `  end tell\n` +
        `end tell`;
    const calendarName = await new Promise((resolve, reject) => {
        (0, child_process_1.execFile)("osascript", ["-e", script], { timeout: 20_000 }, (err, stdout, stderr) => {
            if (err)
                reject(new Error(stderr?.trim() || err.message));
            else
                resolve(stdout.trim());
        });
    }).catch((err) => {
        throw new Error(`Calendar write failed: ${err.message}. Grant Calendar automation permission, or pass calendar_name (e.g. "Home").`);
    });
    const start = new Date(Date.now() + startOffsetMin * 60_000);
    const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return toolContent([{ type: "text", text: `📅 Block scheduled: "${title}" ${fmt(start)}–${fmt(new Date(start.getTime() + durationMin * 60_000))} on calendar "${calendarName}".` }], { localData: true });
}
async function handleDetonateDone(args, isMock) {
    const causeId = String(args.cause_id ?? "").trim();
    const artifactRef = String(args.artifact_ref ?? "").trim();
    if (!causeId || !artifactRef)
        throw new Error("daobrew_detonate_done requires cause_id and artifact_ref.");
    const acceptance = args.user_acceptance == null
        ? null
        : args.user_acceptance;
    if (acceptance !== null && !assignments_js_1.USER_ACCEPTANCE_VALUES.includes(acceptance)) {
        throw new Error(`Invalid user_acceptance "${args.user_acceptance}". Must be one of: ${assignments_js_1.USER_ACCEPTANCE_VALUES.join(", ")}`);
    }
    if ((0, graph_db_js_1.graphDbExists)()) {
        const { query, exec } = toolScopedDb();
        const rows = (await query(`SELECT id, user_id, created_at_ts, props_json FROM graph_nodes WHERE id = ${(0, graph_db_js_1.q)(causeId)} AND kind = 'ghost'`));
        if (rows.length === 0) {
            return { status: "not_found", cause_id: causeId, message: "No matching Sentinel action package was found." };
        }
        const now = Math.floor(Date.now() / 1000);
        const acceptancePairPg = acceptance ? `, 'user_acceptance', ${(0, graph_db_js_1.q)(acceptance)}` : "";
        const acceptancePairSqlite = acceptance ? `, '$.user_acceptance', ${(0, graph_db_js_1.q)(acceptance)}` : "";
        const sql = (0, graph_db_js_1.graphStoreKind)() === "postgres"
            ? `UPDATE graph_nodes
           SET props_json = COALESCE(props_json, '{}'::jsonb)
             || jsonb_build_object('status', 'done', 'artifact_ref', ${(0, graph_db_js_1.q)(artifactRef)}, 'done_at_ts', ${now}${acceptancePairPg})
         WHERE id = ${(0, graph_db_js_1.q)(causeId)};
         INSERT INTO graph_edges(id, user_id, src_id, dst_id, kind, label, created_at_ts)
           SELECT 'e_done_' || ${(0, graph_db_js_1.q)(causeId)}, user_id, id, ${(0, graph_db_js_1.q)(causeId)}, 'caused', 'detonated', ${now}
           FROM graph_nodes WHERE kind = 'pattern' ORDER BY created_at_ts LIMIT 1
         ON CONFLICT DO NOTHING;`
            : `UPDATE graph_nodes SET props_json = json_set(props_json, '$.status', 'done', '$.artifact_ref', ${(0, graph_db_js_1.q)(artifactRef)}, '$.done_at_ts', ${now}${acceptancePairSqlite}) WHERE id = ${(0, graph_db_js_1.q)(causeId)};
       INSERT OR IGNORE INTO graph_edges(id, src_id, dst_id, kind, label, created_at_ts)
         SELECT 'e_done_' || ${(0, graph_db_js_1.q)(causeId)}, id, ${(0, graph_db_js_1.q)(causeId)}, 'caused', 'detonated', ${now}
         FROM graph_nodes WHERE kind = 'pattern' ORDER BY created_at_ts LIMIT 1;`;
        await exec(sql);
        // Outcome close (thin MRT): artifact_done + optional user_acceptance onto
        // the assignment row. Fail-soft — closing the ghost must never fail here.
        // The episode key reads the SAME source as detonate: props.armed_at_ts
        // first (transition-stamped, from the pre-update row), created_at_ts legacy.
        try {
            const doneProps = typeof rows[0].props_json === "string"
                ? JSON.parse(rows[0].props_json || "{}")
                : rows[0].props_json ?? {};
            await (0, assignments_js_1.closeInterventionAssignment)({
                userId: rows[0].user_id ?? "local",
                ghostId: rows[0].id,
                armedAtTs: (0, assignments_js_1.armedEpisodeTs)(doneProps, rows[0].created_at_ts ?? null),
                userAcceptance: acceptance,
                storeKind: (0, graph_db_js_1.graphStoreKind)(),
                exec,
                nowTs: now,
            });
        }
        catch { /* fail-soft: outcome logging (incl. props parse) never blocks the close */ }
        return toolContent([{ type: "text", text: `Sentinel action package completed.\n\n` +
                    `"${causeId}" is closed — artifact at ${artifactRef}.\n` +
                    `Sentinel will use the next matching recovery curve in the weekly insight. The loop is closed.` }], { localData: true });
    }
    if (isMock) {
        developmentMockModule().mockDetonateDone(causeId);
        return toolContent([{ type: "text", text: `Sentinel action package completed (mock). "${causeId}" closed — artifact at ${artifactRef}.` }]);
    }
    return { status: "no_graph", db: (0, graph_db_js_1.graphStoreDescription)(), message: "No Sentinel graph found; nothing to close." };
}
