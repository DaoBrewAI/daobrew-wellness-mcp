import { Element } from "./types.js";

export interface ActiveSession {
  sessionId: string;
  pid: number;
  element: Element;
  genre: string;
  duration: number;
  startTime: number;
  mode: "ambient" | "ondemand";
}

let activeSession: ActiveSession | null = null;

export function startSession(session: ActiveSession): void {
  activeSession = session;
}

export function getActiveSession(): ActiveSession | null {
  return activeSession;
}

export function clearSession(): ActiveSession | null {
  const prev = activeSession;
  activeSession = null;
  return prev;
}

export function isSessionRunning(): boolean {
  if (!activeSession) return false;
  // Verify the audio process is still alive (skip for pid <= 0, e.g. text tier)
  if (activeSession.pid > 0) {
    try {
      process.kill(activeSession.pid, 0);
    } catch {
      // Process is dead — clear stale session
      activeSession = null;
      return false;
    }
  }
  return true;
}

export function durationPlayed(): number | null {
  if (!activeSession) return null;
  return Math.round((Date.now() - activeSession.startTime) / 1000);
}
