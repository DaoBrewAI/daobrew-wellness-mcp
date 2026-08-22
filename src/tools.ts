import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { graphDbExists, graphStoreDescription, graphStoreKind, queryJson, execSql, q } from "./graph-db.js";
import {
  armedEpisodeTs, closeInterventionAssignment, logInterventionAssignment,
  USER_ACCEPTANCE_VALUES, UserAcceptance,
} from "./engine/assignments.js";
import { execFile } from "child_process";
import {
  Element, StressPattern,
  STRESS_PATTERN_TO_ELEMENT, ELEMENT_TO_STRESS_PATTERN, STRESS_PATTERN_LIST,
  BreathState,
} from "./types.js";
import { STRESS_PATTERN_COPY, shortStatusLine } from "./copy.js";
import { playAudio, stopPlayback } from "./audio.js";
import { detectHeadphones } from "./headphones.js";
import { load as loadPrefs, save as savePrefs, incrementSessionCount } from "./preferences.js";
import { getActiveSession, clearSession, isSessionRunning, startSession } from "./session.js";
import { readLocalConfig } from "./engine/local-config.js";
import { resolveUserId } from "./identity.js";
import { scopedExec, scopedQuery, type Exec, type Query } from "./engine/user-scope.js";
import * as cooldown from "./cooldown.js";
import * as cache from "./cache.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { DaoBrewClient } from "./client.js";
import { startDashboardServer, stopDashboardServer } from "./dashboard-server.js";
import { checkEntitlement } from "./entitlement.js";
import * as oura from "./health/oura.js";

/** Keep the founder-approved local mock surface without making the
 * development-only fixture module part of the production package's eager
 * import graph. Source checkouts build mock.js; published installs never load
 * it unless an operator explicitly requests mock mode. */
function developmentMock(): typeof import("./mock.js") {
  return require("./mock.js") as typeof import("./mock.js");
}

type DetonateBrief = import("./mock.js").DetonateBrief;
const mockWellnessState = (...args: Parameters<typeof import("./mock.js").mockWellnessState>) =>
  developmentMock().mockWellnessState(...args);
const mockStartSession = (...args: Parameters<typeof import("./mock.js").mockStartSession>) =>
  developmentMock().mockStartSession(...args);
const mockSessionHistory = (...args: Parameters<typeof import("./mock.js").mockSessionHistory>) =>
  developmentMock().mockSessionHistory(...args);
const mockDetonateBrief = () => developmentMock().mockDetonateBrief();
const mockDetonateDone = (causeId: string) => developmentMock().mockDetonateDone(causeId);

// ──────────────────────────────────────────────────────────────────────────────
// Tool definitions — exactly 6 tools per 2026-05-02 demo plan.
// ──────────────────────────────────────────────────────────────────────────────

export const toolDefinitions: Tool[] = [
  {
    name: "daobrew_check",
    description:
      "Check the user's current biometric stress state.",
    inputSchema: {
      type: "object" as const,
      properties: {
        force_refresh: {
          type: "boolean" as const,
          description: "Force fresh state fetch, bypassing 30-min cache. Use for explicit user wellness check.",
        },
      },
      required: [],
    },
  },
  {
    name: "daobrew_breathe",
    description:
      "Start a guided resonance breathing session matched to a stress pattern. Plays therapeutic audio and opens a live waveform dashboard in the user's browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        stress_pattern: {
          type: "string" as const,
          enum: STRESS_PATTERN_LIST,
          description: "User-facing stress pattern: tension | overdrive | stagnation | constriction | depletion",
        },
        mode: {
          type: "string" as const,
          enum: ["ambient", "ondemand"],
          description: "ambient = proactive (agent-initiated, requires opt-in), ondemand = user-requested. Default: ondemand",
        },
        force: {
          type: "boolean" as const,
          description: "Bypass cooldown timer for acute stress spikes. Default: false",
        },
      },
      required: ["stress_pattern"],
    },
  },
  {
    name: "daobrew_stop",
    description:
      "Stop the current DaoBrew breathing session. Returns a one-line text summary (cycles + HR delta).",
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string" as const, description: "Optional session ID; stops current if omitted" },
      },
      required: [],
    },
  },
  {
    name: "daobrew_history",
    description: "Get recent wellness session history and trends.",
    inputSchema: {
      type: "object" as const,
      properties: { days: { type: "integer" as const, description: "Lookback window in days" } },
      required: [],
    },
  },
  {
    name: "daobrew_status",
    description:
      "Get DaoBrew server status: mode, connected data sources, headphone status, preferences, active session. Use for first-run onboarding.",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "daobrew_settings",
    description: "Enable/disable ambient monitoring, adjust volume, cooldown, or voiceover. Persists to ~/.daobrew/prefs.json.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ambient_optin: { type: "boolean" as const, description: "Enable/disable ambient (proactive) mode" },
        disabled: { type: "boolean" as const, description: "Disable all proactive wellness checks" },
        preferred_volume: { type: "number" as const, description: "Audio volume 0.0-1.0" },
        cooldown_minutes: { type: "integer" as const, description: "Minutes between sessions" },
        headphones_trusted: { type: "boolean" as const, description: "Skip headphone detection" },
        voiceover: { type: "boolean" as const, description: "Enable/disable voiceover in on-demand tracks" },
        dashboard_enabled: { type: "boolean" as const, description: "Enable/disable live breath dashboard in browser" },
      },
      required: [],
    },
  },
  {
    name: "daobrew_connect_watch",
    description:
      "Pair the user's Apple Watch (via the DaoBrew Health Sync TestFlight iPhone app) for live biometric streaming.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "daobrew_detonate",
    description:
      "Fetch the ready Sentinel action package: likely work thread, evidence, artifact spec, and next steps. Call this when the user opens the Sentinel action package.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cause_id: { type: "string" as const, description: "Specific armed cause node id; omit to fetch the first armed cause" },
      },
      required: [],
    },
  },
  {
    name: "daobrew_schedule_block",
    description:
      "Create a calendar block in macOS Calendar.app for reviewing a Sentinel action package (or any focus block). Times are relative to now.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const, description: "Event title, e.g. 'DaoBrew · AI2 demo story prep'" },
        start_offset_min: { type: "integer" as const, description: "Minutes from now until the block starts (default 60)" },
        duration_min: { type: "integer" as const, description: "Block length in minutes (default 45)" },
        calendar_name: { type: "string" as const, description: "Target calendar name; defaults to the first writable calendar" },
      },
      required: ["title"],
    },
  },
  {
    name: "daobrew_detonate_done",
    description:
      "Mark a Sentinel action package as completed: records the artifact reference and closes the loop.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cause_id: { type: "string" as const, description: "The cause node id from daobrew_detonate" },
        artifact_ref: { type: "string" as const, description: "Where the produced artifact lives, e.g. a file path or URL" },
        user_acceptance: {
          type: "string" as const,
          enum: ["accepted", "edited", "rejected"],
          description: "Optional: how the user received the artifact — accepted as-is, edited it, or rejected it.",
        },
      },
      required: ["cause_id", "artifact_ref"],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Per-process state — only the planned session duration (for the progress bar).
// All cycle timing, params, and HR live on the backend now.
// ──────────────────────────────────────────────────────────────────────────────

interface LocalSessionInfo {
  pattern: StressPattern;
  durationSec: number;
  startedHR: number | null;
}
let localSessionInfo: LocalSessionInfo | null = null;

function resetDashboardState(): void {
  localSessionInfo = null;
}

/** Mock-mode synthesis of a backend BreathState (mirrors backend cycle-boundary logic locally). */
function mockBreathState(pattern: Element, sessionStartMs: number, plannedDurationSec: number): BreathState {
  const elapsedSec = (Date.now() - sessionStartMs) / 1000;
  // Mock: BPM drifts down 6 -> 5 over the session (Fire-style cooling).
  const bpm = Math.max(4, 6 - elapsedSec / 120);
  const cycleSec = 60 / bpm;
  const cyclesElapsed = elapsedSec / cycleSec;
  const cycleNum = Math.floor(cyclesElapsed) + 1;
  const cycleStartUnix = sessionStartMs / 1000 + Math.floor(cyclesElapsed) * cycleSec;
  // Synthesize a slowly cooling HR
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

// ──────────────────────────────────────────────────────────────────────────────
// MCP content-block helpers
// ──────────────────────────────────────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

interface ToolResultWithContent {
  /** Marker — when present, index.ts forwards `content` verbatim instead of JSON-stringifying. */
  __mcp_content__: true;
  /** Marker — data came from the user's local graph DB, not the mock generator;
   *  index.ts skips the simulated-data banner even when the server runs in mock mode. */
  __local_data__?: true;
  content: ContentBlock[];
}

function toolContent(blocks: ContentBlock[], opts?: { localData?: boolean }): ToolResultWithContent {
  const result: ToolResultWithContent = { __mcp_content__: true, content: blocks };
  if (opts?.localData) result.__local_data__ = true;
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tool dispatch
// ──────────────────────────────────────────────────────────────────────────────

export async function handleToolCall(
  name: string, args: Record<string, any>, isMock: boolean, _apiKey?: string, isDemo: boolean = false, client?: DaoBrewClient
): Promise<any> {
  // Input validation — translate stress_pattern at API boundary
  if (args.stress_pattern && !STRESS_PATTERN_LIST.includes(args.stress_pattern as StressPattern)) {
    throw new Error(
      `Invalid stress_pattern "${args.stress_pattern}". Must be one of: ${STRESS_PATTERN_LIST.join(", ")}`,
    );
  }

  function requireClient(): DaoBrewClient {
    if (!client) throw new Error("DaoBrewClient not initialized. Sign in to DaoBrew on this Mac to enroll this device, or use --mock.");
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
        ? mockSessionHistory(args.days ?? 7)
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

async function handleCheck(
  args: Record<string, any>,
  isMock: boolean,
  isDemo: boolean,
  client?: DaoBrewClient,
): Promise<any> {
  const forceRefresh = args.force_refresh === true;
  const CACHE_KEY = "wellness_state";

  // ── Fast path: active live session → return concise text only.
  // The live waveform/UI lives in the browser dashboard (see dashboard-server.ts).
  // Chat surface stays a single status line so the agent has something to acknowledge.
  const localSession = getActiveSession();
  if (localSession && localSessionInfo) {
    const breathState: BreathState = isMock
      ? mockBreathState(localSession.element, localSession.startTime, localSessionInfo.durationSec)
      : await client!.getBreathState();

    if (breathState.active) {
      const text = shortStatusLine(
        ELEMENT_TO_STRESS_PATTERN[breathState.pattern],
        breathState.current_hr,
        breathState.session_elapsed_sec,
        localSessionInfo.durationSec,
      );
      return toolContent([{ type: "text", text }]);
    }
    // session active locally but backend has none — fall through to idle
  }

  // ── No active session → return wellness state + idle frame.
  let state: any;
  if (!forceRefresh) {
    const cached = cache.get<any>(CACHE_KEY);
    if (cached) state = cached.data;
  }
  if (!state) {
    if (forceRefresh && !isMock && client) {
      try {
        const { syncAllConnectedSources } = await import("./health/sync.js");
        await syncAllConnectedSources(client);
      } catch { /* sync failure shouldn't block */ }
    }
    if (isMock) {
      const mockStateFile = join(homedir(), ".daobrew", "mock-state.json");
      if (existsSync(mockStateFile)) {
        state = JSON.parse(require("fs").readFileSync(mockStateFile, "utf-8"));
      } else {
        state = mockWellnessState(isDemo);
      }
    } else {
      state = await client!.getWellnessState();
    }
    cache.set(CACHE_KEY, state);
  }

  const elementScores = (state.element_scores ?? {}) as Record<Element, number>;
  let topElement: Element = "wood";
  let topScore = -1;
  for (const e of Object.keys(elementScores) as Element[]) {
    if (elementScores[e] > topScore) {
      topScore = elementScores[e];
      topElement = e;
    }
  }
  const topPattern: StressPattern = ELEMENT_TO_STRESS_PATTERN[topElement] ?? "tension";
  const copy = STRESS_PATTERN_COPY[topPattern];

  let liveHR: { hr: number | null; age_seconds?: number; stale?: boolean } = { hr: null, stale: true };
  if (!isMock && client) liveHR = await client.getLiveHR();
  else if (isMock) liveHR = { hr: 78, age_seconds: 1, stale: false };

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

async function handleBreathe(
  args: Record<string, any>,
  isMock: boolean,
  _isDemo: boolean,
  client?: DaoBrewClient,
): Promise<any> {
  const prefs = loadPrefs();
  const stressPattern = args.stress_pattern as StressPattern;
  const element = STRESS_PATTERN_TO_ELEMENT[stressPattern];
  const mode = (args.mode as "ambient" | "ondemand") || "ondemand";
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
  if (isSessionRunning()) {
    return { status: "session_active", message: "A session is already running. Call daobrew_stop first." };
  }

  // Guard 4: cooldown (unless force=true)
  if (!force && cooldown.isActive(mode)) {
    const remaining = cooldown.remainingMinutes(mode);
    return { status: "cooldown", remaining_minutes: remaining, message: `${mode} cooldown active. ${remaining} min remaining. Use force: true to override.` };
  }

  // Guard 5: headphone check
  if (!(mode === "ondemand" && prefs.headphones_trusted)) {
    const headphones = await detectHeadphones();
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
  const session = isMock ? mockStartSession(element, "audio") : await client!.startSession(element, "audio");
  session.duration_seconds = SESSION_DURATION_SEC;

  const volume = prefs.preferred_volume ?? 0.4;
  const audioResult = await playAudio(element, "breathing", volume);

  if (audioResult.status !== "playing") {
    return {
      status: "audio_error",
      audio_status: audioResult.status,
      audio_error: audioResult.error,
      message: `Audio playback failed (${audioResult.status}): ${audioResult.error}. Check ~/.daobrew/audio/ for audio files.`,
    };
  }

  startSession({
    sessionId: session.session_id,
    pid: audioResult.pid!,
    element,
    genre: session.genre,
    duration: session.duration_seconds,
    startTime: Date.now(),
    mode,
  });
  cooldown.activate(mode, (prefs.cooldown_minutes ?? 30) * 60 * 1000);
  incrementSessionCount();

  // Tell backend to start cycle-boundary feedback for this user. Backend computes
  // new params at every breath cycle boundary; MCP polls breath-state to render.
  let liveSessionStarted = false;
  if (!isMock && client) {
    try {
      // Capture HR snapshot for the summary frame's "HR delta" line.
      const startHR = await client.getLiveHR().catch(() => ({ hr: null as number | null }));
      await client.startLiveSession(element, session.duration_seconds);
      localSessionInfo = {
        pattern: stressPattern,
        durationSec: session.duration_seconds,
        startedHR: startHR.hr,
      };
      liveSessionStarted = true;
    } catch (err: any) {
      // Don't fail the whole tool if backend session start fails — audio still plays,
      // just no live cycle-feedback. Surface in the response so caller can debug.
      localSessionInfo = {
        pattern: stressPattern,
        durationSec: session.duration_seconds,
        startedHR: null,
      };
    }
  } else {
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
  let dashboardURL: string | null = null;
  if (!isMock && client && prefs.dashboard_enabled) {
    try {
      dashboardURL = await startDashboardServer(element, session.duration_seconds, client);
    } catch {}
  }

  const copy = STRESS_PATTERN_COPY[stressPattern];
  const durationMin = Math.round(session.duration_seconds / 60);
  const statusText = `${copy.emoji} Playing ${stressPattern} session — ${durationMin} min. 🎧`;

  const dashboardBlock = dashboardURL ? `${dashboardURL}\n\n` : "";

  return toolContent([
    { type: "text", text:
      `${dashboardBlock}${statusText}\n\n` +
      `Say "stop" to end the session.`
    },
  ]);
}

async function handleStop(args: Record<string, any>, isMock: boolean, client?: DaoBrewClient): Promise<any> {
  const stopped = stopPlayback();
  const stoppedSession = clearSession();
  const localInfo = localSessionInfo;
  resetDashboardState();
  await stopDashboardServer();
  cache.invalidate("wellness_state");

  if (!stopped && !stoppedSession) {
    return { status: "no_active_session", duration_played: null, message: "No active session to stop." };
  }

  // Tell backend to end the live session — gives us cycles_completed + final params + last HR.
  let backendStop: any = null;
  if (!isMock && client) {
    try { backendStop = await client.stopLiveSession(); } catch { /* best-effort */ }
  }

  const played = stoppedSession ? Math.round((Date.now() - stoppedSession.startTime) / 1000) : 0;
  const sessionId = args.session_id ?? stoppedSession?.sessionId ?? null;

  // client.request() already unwraps `data` envelope.
  const cyclesCompleted = backendStop?.cycles_completed ?? 0;
  const endedHR = backendStop?.last_cycle_hr_mean ?? null;
  const startedHR = localInfo?.startedHR ?? null;

  const summaryText =
    `Session stopped after ${Math.round(played / 60)} min ${played % 60}s.` +
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
async function armedActionPackageStatus(): Promise<Record<string, any> | null> {
  if (!graphDbExists()) return null;
  try {
    const { query } = toolScopedDb();
    const armedStatusExpr = graphStoreKind() === "postgres"
      ? "props_json ->> 'status' = 'armed'"
      : "json_extract(props_json, '$.status') = 'armed'";
    const rows = (await query(
      `SELECT id, title, props_json FROM graph_nodes
       WHERE kind = 'ghost' AND ${armedStatusExpr}
       ORDER BY created_at_ts LIMIT 1`,
    )) as Array<{ id: string; title?: string; props_json?: string | Record<string, any> }>;
    if (rows.length === 0) return null;
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
  } catch {
    return null; // fail-soft: status must render without the graph
  }
}

async function handleStatus(isMock: boolean, client?: DaoBrewClient): Promise<any> {
  const headphones = await detectHeadphones();
  const prefs = loadPrefs();
  const activeSession = getActiveSession();
  const ouraConnected = oura.isConnected();
  const gfitConnected = existsSync(join(homedir(), ".daobrew", "google-fit-token.json"));

  let appleWatchStatus = "not_connected";
  if (isMock) {
    appleWatchStatus = "paired";
  } else if (client) {
    try {
      const liveHR = await client.getLiveHR();
      if (liveHR.hr != null && !liveHR.stale) {
        appleWatchStatus = "connected";
      } else if (liveHR.hr != null) {
        appleWatchStatus = "paired_stale";
      }
    } catch {}
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
          stress_pattern: ELEMENT_TO_STRESS_PATTERN[activeSession.element],
          mode: activeSession.mode,
          duration_played: Math.round((Date.now() - activeSession.startTime) / 1000),
        }
      : null,
    sentinel_action_package: await armedActionPackageStatus(),
  };
}

function handleSettings(args: Record<string, any>): any {
  const updates: Partial<import("./preferences.js").Preferences> = {};
  const allowed = ["ambient_optin", "disabled", "preferred_volume", "cooldown_minutes", "headphones_trusted", "voiceover", "dashboard_enabled"] as const;
  for (const key of allowed) {
    if (args[key] !== undefined) (updates as any)[key] = args[key];
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
  savePrefs(updates);
  return { status: "updated", preferences: loadPrefs() };
}

async function handleConnectWatch(isMock: boolean, client?: DaoBrewClient): Promise<any> {
  // Apple Watch only — Oura/Google Fit dropped from demo surface (per plan §C.2.7).
  if (isMock) {
    return {
      status: "mock_mode",
      source: "apple_watch",
      install_url: "https://testflight.apple.com/join/6XTNFvv5",
      instructions:
        "Running in mock mode — no real backend connection. Sign in to DaoBrew on this Mac to enroll this device.",
    };
  }
  if (!client) {
    return {
      status: "not_configured",
      source: "apple_watch",
      error: "No API client initialized. Sign in to DaoBrew on this Mac to enroll this device, then retry.",
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
      instructions:
        `1. Install DaoBrew Health Sync on your iPhone (TestFlight link above)\n` +
        `2. Open the app and tap "Pair with Claude Code"\n` +
        `3. Enter code: ${pairing.code}\n` +
        `4. Grant HealthKit permissions when prompted\n` +
        `5. On your Apple Watch, open the DaoBrew Health Sync app once to grant Watch HealthKit permissions\n` +
        `6. Live HR will stream within seconds of session start.`,
    };
  } catch (err: any) {
    return {
      status: "backend_error",
      source: "apple_watch",
      error: err?.message || "Could not reach backend to generate pairing code",
      install_url: "https://testflight.apple.com/join/6XTNFvv5",
      instructions:
        "Backend is unavailable. Check that this Mac is enrolled and the backend is online, then try again.",
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Detonator — causal-chain root-cause handoff
//
// Reads the local Sentinel graph DB (shared with the macOS app) when it exists;
// graph tools work without a backend device credential. DaoBrew stays brain + scheduling + brief
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
 *     ?? fail closed
 *
 * Row payload fields (e.g. rows[0].user_id for the assignment log) keep
 * reading the row; only the QUERY/EXEC scope comes from this identity.
 */
export function toolUserId(): string {
  const plan = resolveUserId(readLocalConfig());
  if (!plan.ok) throw new Error(plan.reason);
  return plan.userId;
}

/** Postgres-gated scoped executors for the tool handlers: under Postgres the
 *  SQL carries the session GUC for toolUserId(); under SQLite the raw
 *  transports are returned so composed SQL stays byte-identical (set_config
 *  is invalid SQLite). */
function toolScopedDb(): { query: Query; exec: Exec } {
  if (graphStoreKind() !== "postgres") return { query: queryJson, exec: execSql };
  const userId = toolUserId();
  return { query: scopedQuery(userId), exec: scopedExec(userId) };
}

function renderBrief(
  brief: DetonateBrief,
  opts?: { blockScheduled?: boolean; blockLine?: string },
): string {
  const b = brief.suggested_block;
  // When the Sentinel app armed this cause it already wrote the calendar
  // block — tell the agent to skip scheduling instead of double-booking.
  const scheduleStep = opts?.blockScheduled
    ? `  2. Prep block already on calendar${opts.blockLine ? ` (${opts.blockLine})` : ""} — skip daobrew_schedule_block.\n`
    : `  2. Schedule the prep block: daobrew_schedule_block({ title: ${JSON.stringify(b.title)}, start_offset_min: ${b.start_offset_min}, duration_min: ${b.duration_min} })\n`;
  const contextBlock = brief.context
    ? `CONTEXT  (Sentinel assembled this from your watch signal, notes, and project context)\n${brief.context}\n\n`
    : "";
  return (
    `SENTINEL ACTION PACKAGE — ready to review\n\n` +
    `cause_id: ${brief.cause_id}\n\n` +
    `LIKELY WORK THREAD\n${brief.cause}\n\n` +
    `EVIDENCE\n${brief.evidence.map(e => `  • ${e}`).join("\n")}\n\n` +
    contextBlock +
    `REVIEW TASK\n${brief.artifact_spec}\n\n` +
    `NEXT STEPS (do these now)\n` +
    `  1. Present the likely work thread and evidence to the user.\n` +
    scheduleStep +
    `  3. Produce the artifact per spec and save it to a file.\n` +
    `  4. Close the loop: daobrew_detonate_done({ cause_id: ${JSON.stringify(brief.cause_id)}, artifact_ref: "<path>" }) — include user_acceptance: "accepted" | "edited" | "rejected" if the user reacted to the artifact.`
  );
}

async function handleDetonate(args: Record<string, any>, isMock: boolean): Promise<any> {
  if (!isMock) {
    const entitlement = checkEntitlement();
    if (!entitlement.entitled) {
      return {
        status: "not_entitled",
        reason: entitlement.reason,
        install_and_pay: entitlement.install_and_pay,
      };
    }
  }

  if (graphDbExists()) {
    const { query, exec } = toolScopedDb();
    const where = args.cause_id ? `id = ${q(String(args.cause_id))} AND` : "";
    const armedStatusExpr = graphStoreKind() === "postgres"
      ? "props_json ->> 'status' = 'armed'"
      : "json_extract(props_json, '$.status') = 'armed'";
    let rows: Array<{ id: string; user_id?: string; created_at_ts?: number; title: string; props_json: string | Record<string, any> }>;
    try {
      rows = (await query(
        `SELECT id, user_id, created_at_ts, title, props_json FROM graph_nodes
         WHERE ${where} kind = 'ghost' AND ${armedStatusExpr}
         ORDER BY created_at_ts LIMIT 1`,
      )) as typeof rows;
    } catch (err: any) {
      return { status: "graph_error", db: graphStoreDescription(), error: err?.message };
    }
    if (rows.length === 0) {
      return toolContent(
        [{ type: "text", text: "No ready Sentinel action package found. Keep watching from Sentinel's Patterns view." }],
        { localData: true },
      );
    }
    const props = typeof rows[0].props_json === "string"
      ? JSON.parse(rows[0].props_json || "{}")
      : rows[0].props_json ?? {};
    const stored = props.brief ?? {};
    const brief: DetonateBrief = {
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
      await logInterventionAssignment({
        userId: rows[0].user_id ?? toolUserId(),
        ghostId: rows[0].id,
        armedAtTs: armedEpisodeTs(props, rows[0].created_at_ts ?? null),
        ghostProps: props,
        storeKind: graphStoreKind(),
        exec,
        nowTs: Math.floor(Date.now() / 1000),
      });
    } catch { /* fail-soft: assignment logging never blocks the brief */ }
    return toolContent(
      [{ type: "text", text: renderBrief(brief, { blockScheduled: !!props.block_scheduled, blockLine: props.block_line }) }],
      { localData: true },
    );
  }

  if (isMock) {
    const brief = mockDetonateBrief();
    if (!brief) return toolContent([{ type: "text", text: "No ready Sentinel action package in the mock chain. Restart the server to reset the demo." }]);
    return toolContent([{ type: "text", text: renderBrief(brief) }]);
  }

  return {
    status: "no_graph",
    db: graphStoreDescription(),
    message:
      "No Sentinel graph found. The graph is written by the Sentinel macOS app; for the demo chain run: node scripts/seed-demo-graph.mjs",
  };
}

async function handleScheduleBlock(args: Record<string, any>): Promise<any> {
  const title = String(args.title ?? "").trim();
  if (!title) throw new Error("daobrew_schedule_block requires a title.");
  if (process.platform !== "darwin") {
    return { status: "unsupported_platform", message: "Calendar blocks require macOS (Calendar.app via osascript)." };
  }
  const startOffsetMin = Number.isFinite(args.start_offset_min) ? Math.max(0, Math.round(args.start_offset_min)) : 60;
  const durationMin = Number.isFinite(args.duration_min) ? Math.max(5, Math.round(args.duration_min)) : 45;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const calendarClause = args.calendar_name
    ? `calendar "${esc(String(args.calendar_name))}"`
    : `(first calendar whose writable is true)`;
  const script =
    `tell application "Calendar"\n` +
    `  set blockStart to (current date) + ${startOffsetMin * 60}\n` +
    `  set blockEnd to blockStart + ${durationMin * 60}\n` +
    `  tell ${calendarClause}\n` +
    `    make new event with properties {summary:"${esc(title)}", start date:blockStart, end date:blockEnd}\n` +
    `    return name of it\n` +
    `  end tell\n` +
    `end tell`;
  const calendarName = await new Promise<string>((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 20_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout.trim());
    });
  }).catch((err: Error) => {
    throw new Error(
      `Calendar write failed: ${err.message}. Grant Calendar automation permission, or pass calendar_name (e.g. "Home").`,
    );
  });
  const start = new Date(Date.now() + startOffsetMin * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return toolContent(
    [{ type: "text", text: `📅 Block scheduled: "${title}" ${fmt(start)}–${fmt(new Date(start.getTime() + durationMin * 60_000))} on calendar "${calendarName}".` }],
    { localData: true },
  );
}

async function handleDetonateDone(args: Record<string, any>, isMock: boolean): Promise<any> {
  const causeId = String(args.cause_id ?? "").trim();
  const artifactRef = String(args.artifact_ref ?? "").trim();
  if (!causeId || !artifactRef) throw new Error("daobrew_detonate_done requires cause_id and artifact_ref.");
  const acceptance: UserAcceptance | null = args.user_acceptance == null
    ? null
    : (args.user_acceptance as UserAcceptance);
  if (acceptance !== null && !USER_ACCEPTANCE_VALUES.includes(acceptance)) {
    throw new Error(
      `Invalid user_acceptance "${args.user_acceptance}". Must be one of: ${USER_ACCEPTANCE_VALUES.join(", ")}`,
    );
  }

  if (graphDbExists()) {
    const { query, exec } = toolScopedDb();
    const rows = (await query(
      `SELECT id, user_id, created_at_ts, props_json FROM graph_nodes WHERE id = ${q(causeId)} AND kind = 'ghost'`,
    )) as Array<{ id: string; user_id?: string; created_at_ts?: number; props_json?: string | Record<string, any> }>;
    if (rows.length === 0) {
      return { status: "not_found", cause_id: causeId, message: "No matching Sentinel action package was found." };
    }
    const now = Math.floor(Date.now() / 1000);
    const acceptancePairPg = acceptance ? `, 'user_acceptance', ${q(acceptance)}` : "";
    const acceptancePairSqlite = acceptance ? `, '$.user_acceptance', ${q(acceptance)}` : "";
    const sql = graphStoreKind() === "postgres"
      ? `UPDATE graph_nodes
           SET props_json = COALESCE(props_json, '{}'::jsonb)
             || jsonb_build_object('status', 'done', 'artifact_ref', ${q(artifactRef)}, 'done_at_ts', ${now}${acceptancePairPg})
         WHERE id = ${q(causeId)};
         INSERT INTO graph_edges(id, user_id, src_id, dst_id, kind, label, created_at_ts)
           SELECT 'e_done_' || ${q(causeId)}, p.user_id, p.id, ${q(causeId)}, 'caused', 'detonated', ${now}
           FROM graph_nodes p
           WHERE p.kind = 'pattern'
             AND p.user_id = (SELECT user_id FROM graph_nodes WHERE id = ${q(causeId)})
           ORDER BY p.created_at_ts LIMIT 1
         ON CONFLICT DO NOTHING;`
      : `UPDATE graph_nodes SET props_json = json_set(props_json, '$.status', 'done', '$.artifact_ref', ${q(artifactRef)}, '$.done_at_ts', ${now}${acceptancePairSqlite}) WHERE id = ${q(causeId)};
       INSERT OR IGNORE INTO graph_edges(id, user_id, src_id, dst_id, kind, label, created_at_ts)
         SELECT 'e_done_' || ${q(causeId)}, p.user_id, p.id, ${q(causeId)}, 'caused', 'detonated', ${now}
         FROM graph_nodes p
         WHERE p.kind = 'pattern'
           AND p.user_id = (SELECT user_id FROM graph_nodes WHERE id = ${q(causeId)})
         ORDER BY p.created_at_ts LIMIT 1;`;
    await exec(sql);
    // Outcome close (thin MRT): artifact_done + optional user_acceptance onto
    // the assignment row. Fail-soft — closing the ghost must never fail here.
    // The episode key reads the SAME source as detonate: props.armed_at_ts
    // first (transition-stamped, from the pre-update row), created_at_ts legacy.
    try {
      const doneProps = typeof rows[0].props_json === "string"
        ? JSON.parse(rows[0].props_json || "{}")
        : rows[0].props_json ?? {};
      await closeInterventionAssignment({
        userId: rows[0].user_id ?? toolUserId(),
        ghostId: rows[0].id,
        armedAtTs: armedEpisodeTs(doneProps, rows[0].created_at_ts ?? null),
        userAcceptance: acceptance,
        storeKind: graphStoreKind(),
        exec,
        nowTs: now,
      });
    } catch { /* fail-soft: outcome logging (incl. props parse) never blocks the close */ }
    return toolContent(
      [{ type: "text", text:
        `Sentinel action package completed.\n\n` +
        `"${causeId}" is closed — artifact at ${artifactRef}.\n` +
        `Sentinel will use the next matching recovery curve in the weekly insight. The loop is closed.` }],
      { localData: true },
    );
  }

  if (isMock) {
    mockDetonateDone(causeId);
    return toolContent([{ type: "text", text: `Sentinel action package completed (mock). "${causeId}" closed — artifact at ${artifactRef}.` }]);
  }

  return { status: "no_graph", db: graphStoreDescription(), message: "No Sentinel graph found; nothing to close." };
}
