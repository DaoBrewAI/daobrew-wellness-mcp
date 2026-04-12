"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSession = startSession;
exports.getActiveSession = getActiveSession;
exports.clearSession = clearSession;
exports.isSessionRunning = isSessionRunning;
exports.durationPlayed = durationPlayed;
let activeSession = null;
function startSession(session) {
    activeSession = session;
}
function getActiveSession() {
    return activeSession;
}
function clearSession() {
    const prev = activeSession;
    activeSession = null;
    return prev;
}
function isSessionRunning() {
    if (!activeSession)
        return false;
    // Verify the audio process is still alive (skip for pid <= 0, e.g. text tier)
    if (activeSession.pid > 0) {
        try {
            process.kill(activeSession.pid, 0);
        }
        catch {
            // Process is dead — clear stale session
            activeSession = null;
            return false;
        }
    }
    return true;
}
function durationPlayed() {
    if (!activeSession)
        return null;
    return Math.round((Date.now() - activeSession.startTime) / 1000);
}
