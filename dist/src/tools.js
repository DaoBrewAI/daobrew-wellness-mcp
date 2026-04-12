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
const audio_js_1 = require("./audio.js");
const headphones_js_1 = require("./headphones.js");
const preferences_js_1 = require("./preferences.js");
const session_js_1 = require("./session.js");
const cooldown = __importStar(require("./cooldown.js"));
const cache = __importStar(require("./cache.js"));
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
exports.toolDefinitions = [
    {
        name: "daobrew_get_wellness_state",
        description: "Get the user's current biometric wellness state including Yin/Yang balance and Five-Element stress pattern scores. Call proactively during long work sessions.",
        inputSchema: {
            type: "object",
            properties: {
                force_refresh: { type: "boolean", description: "Force fresh data fetch, bypassing 30-min cache. Use true for /stress or explicit user requests." },
            },
            required: [],
        },
    },
    {
        name: "daobrew_get_element_detail",
        description: "Get detailed evidence and intervention recommendation for a specific stress pattern.",
        inputSchema: {
            type: "object",
            properties: {
                element: { type: "string", enum: ["wood", "fire", "earth", "metal", "water"], description: "The stress pattern to examine" },
            },
            required: ["element"],
        },
    },
    {
        name: "daobrew_start_breathing_session",
        description: "Start a guided resonance breathing session matched to a stress pattern. Returns session ID and plays therapeutic audio.",
        inputSchema: {
            type: "object",
            properties: {
                element: { type: "string", enum: ["wood", "fire", "earth", "metal", "water"], description: "Stress pattern to address" },
                tier: { type: "string", enum: ["audio", "full"], description: "audio = system audio playback (default), full = browser PWA (coming soon)" },
                mode: { type: "string", enum: ["ambient", "ondemand"], description: "ambient = proactive (agent-initiated), ondemand = user-requested. Default: ondemand" },
                force: { type: "boolean", description: "Bypass cooldown timer for acute stress spikes. Default: false" },
            },
            required: ["element"],
        },
    },
    {
        name: "daobrew_get_session_result",
        description: "Get the outcome of a completed breathing session including HRV changes.",
        inputSchema: {
            type: "object",
            properties: { session_id: { type: "string", description: "Session ID from start_breathing_session" } },
            required: ["session_id"],
        },
    },
    {
        name: "daobrew_get_session_history",
        description: "Get recent wellness session history and trends.",
        inputSchema: {
            type: "object",
            properties: { days: { type: "integer", description: "Lookback window in days" } },
            required: [],
        },
    },
    {
        name: "daobrew_stop_session",
        description: "Stop the current DaoBrew breathing session. Use when the user wants to end early.",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "Optional session ID; stops current if omitted" },
            },
            required: [],
        },
    },
    {
        name: "daobrew_status",
        description: "Get DaoBrew server status: mode, connected data sources, headphone status, preferences, active session. Use for first-run onboarding.",
        inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
        name: "daobrew_set_monitoring",
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
        name: "daobrew_connect_source",
        description: "Connect a wearable data source (Oura, Google Fit, or Apple Watch) for real biometric data.",
        inputSchema: {
            type: "object",
            properties: {
                source: { type: "string", enum: ["oura", "google_fit", "apple_watch"], description: "Data source to connect" },
            },
            required: ["source"],
        },
    },
];
let callLog = [];
async function handleToolCall(name, args, isMock, _apiKey, isDemo = false, client) {
    // Input validation
    const VALID_ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
    if (args.element && !VALID_ELEMENTS.includes(args.element)) {
        throw new Error(`Invalid element "${args.element}". Must be one of: ${VALID_ELEMENTS.join(", ")}`);
    }
    function requireClient() {
        if (!client)
            throw new Error("DaoBrewClient not initialized. Set DAOBREW_API_KEY or use --mock.");
        return client;
    }
    // Client-side rate limiting (free tier: 100/day during dev, 10/day for prod)
    const now = Date.now();
    if (!isMock) {
        callLog.push(now);
        callLog = callLog.filter(t => t > now - 86400000);
        if (callLog.length > 100) {
            throw new Error("Free tier limit reached (100/day). Upgrade at daobrew.com/pro for unlimited wellness checks.");
        }
    }
    switch (name) {
        case "daobrew_get_wellness_state": {
            const forceRefresh = args.force_refresh === true;
            const CACHE_KEY = "wellness_state";
            if (!forceRefresh) {
                const cached = cache.get(CACHE_KEY);
                if (cached) {
                    const session = (0, session_js_1.getActiveSession)();
                    return {
                        ...cached.data,
                        cache_age_seconds: cached.age_seconds,
                        ...(session ? {
                            active_session: {
                                session_id: session.sessionId, element: session.element,
                                mode: session.mode, duration_played: Math.round((Date.now() - session.startTime) / 1000),
                            },
                        } : {}),
                    };
                }
            }
            // Sync wearable data before fetching fresh state
            if (forceRefresh && !isMock && client) {
                try {
                    const { syncAllConnectedSources } = await import("./health/sync.js");
                    await syncAllConnectedSources(client);
                }
                catch { /* sync failure should not block state fetch */ }
            }
            // Check for mock state override file (only in mock mode)
            let state;
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
                state = await requireClient().getWellnessState();
            }
            cache.set(CACHE_KEY, state);
            const session = (0, session_js_1.getActiveSession)();
            return {
                ...state,
                cache_age_seconds: 0,
                ...(session ? {
                    active_session: {
                        session_id: session.sessionId, element: session.element,
                        mode: session.mode, duration_played: Math.round((Date.now() - session.startTime) / 1000),
                    },
                } : {}),
            };
        }
        case "daobrew_get_element_detail":
            return isMock ? (0, mock_js_1.mockElementDetail)(args.element) : await requireClient().getElementDetail(args.element);
        case "daobrew_start_breathing_session": {
            const prefs = (0, preferences_js_1.load)();
            const element = args.element;
            const tier = args.tier || "audio";
            const mode = args.mode || "ondemand";
            const force = args.force === true;
            // Guard 1: globally disabled
            if (prefs.disabled) {
                return { status: "disabled", message: "Wellness monitoring is disabled. Re-enable with daobrew_set_monitoring({ disabled: false })." };
            }
            // Guard 2: ambient requires opt-in
            if (mode === "ambient" && !prefs.ambient_optin) {
                return { status: "requires_optin", message: "Ambient mode requires user authorization. Call daobrew_set_monitoring({ ambient_optin: true }) first." };
            }
            // Guard 3: already playing
            if ((0, session_js_1.isSessionRunning)()) {
                return { status: "session_active", message: "A session is already running. Call daobrew_stop_session first." };
            }
            // Guard 4: cooldown (unless force=true)
            if (!force && cooldown.isActive(mode)) {
                const remaining = cooldown.remainingMinutes(mode);
                return { status: "cooldown", remaining_minutes: remaining, message: `${mode} cooldown active. ${remaining} min remaining. Use force: true to override.` };
            }
            // Guard 5: headphone check
            // Ambient mode ALWAYS requires real headphone detection (binaural needs headphones)
            // On-demand can skip if headphones_trusted (user's choice)
            if (!(mode === "ondemand" && prefs.headphones_trusted)) {
                const headphones = await (0, headphones_js_1.detectHeadphones)();
                if (!headphones.connected) {
                    if (mode === "ambient") {
                        // Silently skip — don't interrupt the user
                        return { status: "skipped_no_headphones", message: "Ambient session skipped — no headphones detected." };
                    }
                    return {
                        status: "no_headphones",
                        device: headphones.device,
                        message: "No headphones detected (built-in speakers only). Binaural beats require headphones. Connect headphones or use daobrew_set_monitoring({ headphones_trusted: true }) to skip this check.",
                    };
                }
            }
            // All guards passed — proceed to session start
            const session = isMock ? (0, mock_js_1.mockStartSession)(element, tier) : await requireClient().startSession(element, tier);
            const volume = prefs.preferred_volume ?? 0.4;
            // Map the recommended task to audio file task type
            const taskType = session.recommended_task === "meditation" ? "meditation"
                : session.recommended_task === "zhan_zhuang" ? "zhanZhuang"
                    : "breathing";
            const audioResult = await (0, audio_js_1.playAudio)(element, taskType, volume);
            if (audioResult.status === "playing") {
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
                return { ...session, audio_status: "playing", pid: audioResult.pid, audio_file: audioResult.file };
            }
            // Audio failed — report error, do NOT fall back to text
            return {
                status: "audio_error",
                audio_status: audioResult.status,
                audio_error: audioResult.error,
                message: `Audio playback failed (${audioResult.status}): ${audioResult.error}. Check ~/.daobrew/audio/ for audio files.`,
            };
        }
        case "daobrew_get_session_result": {
            const result = isMock ? (0, mock_js_1.mockSessionResult)(args.session_id) : await requireClient().getSessionResult(args.session_id);
            // Invalidate wellness cache so next check gets fresh post-session state
            cache.invalidate("wellness_state");
            // Fetch fresh wellness state to include as post-session snapshot
            try {
                const postState = isMock ? (0, mock_js_1.mockWellnessState)() : await requireClient().getWellnessState();
                cache.set("wellness_state", postState);
                return { ...result, post_session_state: postState };
            }
            catch {
                return result;
            }
        }
        case "daobrew_get_session_history":
            return isMock ? (0, mock_js_1.mockSessionHistory)(args.days ?? 7) : await requireClient().getSessionHistory(args.days ?? 7);
        case "daobrew_stop_session": {
            const stopped = (0, audio_js_1.stopPlayback)();
            const stoppedSession = (0, session_js_1.clearSession)();
            if (!stopped && !stoppedSession) {
                return { status: "no_active_session", duration_played: null, message: "No active session to stop." };
            }
            const played = stoppedSession ? Math.round((Date.now() - stoppedSession.startTime) / 1000) : 0;
            return {
                status: "stopped", session_id: stoppedSession?.sessionId ?? null, duration_played: played,
                message: `Session stopped after ${Math.round(played / 60)} minutes.`,
            };
        }
        case "daobrew_status": {
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
                active_session: activeSession ? {
                    session_id: activeSession.sessionId, element: activeSession.element,
                    mode: activeSession.mode, duration_played: Math.round((Date.now() - activeSession.startTime) / 1000),
                } : null,
            };
        }
        case "daobrew_set_monitoring": {
            const updates = {};
            const allowed = ["ambient_optin", "disabled", "preferred_volume", "cooldown_minutes", "headphones_trusted", "voiceover"];
            for (const key of allowed) {
                if (args[key] !== undefined)
                    updates[key] = args[key];
            }
            // Validate ranges
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
        case "daobrew_connect_source": {
            const source = args.source;
            if (source === "apple_watch") {
                // Generate pairing code if connected to real backend
                if (!isMock && client) {
                    try {
                        const pairing = await client.createPairingCode();
                        return {
                            status: "pairing_started",
                            source: "apple_watch",
                            pairing_code: pairing.code,
                            expires_in_seconds: pairing.expires_in_seconds,
                            install_url: "https://testflight.apple.com/join/6XTNFvv5",
                            instructions: `1. Install DaoBrew Health Sync on your iPhone (TestFlight link above)\n2. Open the app and tap "Pair with Claude Code"\n3. Enter code: ${pairing.code}\n4. Grant HealthKit permissions when prompted\n5. Health data will sync automatically within 1-2 minutes`,
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
                if (isMock) {
                    return {
                        status: "mock_mode",
                        source: "apple_watch",
                        install_url: "https://testflight.apple.com/join/6XTNFvv5",
                        instructions: "Running in mock mode — no real backend connection. Set a valid API key in ~/.daobrew/config.json to connect.",
                    };
                }
                return {
                    status: "not_configured",
                    source: "apple_watch",
                    error: "No API client initialized. Check ~/.daobrew/config.json has a valid api_key and api_url.",
                };
            }
            if (source === "oura") {
                if (isMock) {
                    return { status: "error", source, error: "Mock mode — cannot connect Oura. Set a valid API key and run in real mode." };
                }
                // Read credentials from env vars or config file
                const configFile = (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "config.json");
                let fileConfig = {};
                if ((0, fs_1.existsSync)(configFile)) {
                    try {
                        fileConfig = JSON.parse(require("fs").readFileSync(configFile, "utf-8"));
                    }
                    catch { }
                }
                const clientId = process.env.DAOBREW_OURA_CLIENT_ID || fileConfig.oura_client_id;
                if (!clientId)
                    return { status: "error", source, error: "Oura Client ID not set. Add oura_client_id to ~/.daobrew/config.json or set DAOBREW_OURA_CLIENT_ID env var." };
                const { startOAuthFlow } = await import("./health/oauth.js");
                const oauthResult = await startOAuthFlow(source, clientId, "https://cloud.ouraring.com/oauth/authorize", "https://api.ouraring.com/oauth/token", ["daily", "heartrate", "session", "sleep"]);
                if (oauthResult.status === "connected" && !isMock && client) {
                    try {
                        const { syncAllConnectedSources } = await import("./health/sync.js");
                        const syncResults = await syncAllConnectedSources(client);
                        return { ...oauthResult, initial_sync: syncResults };
                    }
                    catch { /* return without sync data */ }
                }
                return oauthResult;
            }
            if (source === "google_fit") {
                if (isMock) {
                    return { status: "error", source, error: "Mock mode — cannot connect Google Fit. Set a valid API key and run in real mode." };
                }
                const clientId = process.env.DAOBREW_GOOGLE_CLIENT_ID;
                if (!clientId)
                    return { status: "error", source, error: "DAOBREW_GOOGLE_CLIENT_ID env var not set" };
                const { startOAuthFlow } = await import("./health/oauth.js");
                const oauthResult = await startOAuthFlow("google_fit", clientId, "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token", ["https://www.googleapis.com/auth/fitness.heart_rate.read", "https://www.googleapis.com/auth/fitness.activity.read", "https://www.googleapis.com/auth/fitness.sleep.read"]);
                if (oauthResult.status === "connected" && !isMock && client) {
                    try {
                        const { syncAllConnectedSources } = await import("./health/sync.js");
                        const syncResults = await syncAllConnectedSources(client);
                        return { ...oauthResult, initial_sync: syncResults };
                    }
                    catch { /* return without sync data */ }
                }
                return oauthResult;
            }
            return { status: "error", source, error: `Unknown source: ${source}` };
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
