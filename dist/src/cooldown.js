"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.isActive = isActive;
exports.remainingMinutes = remainingMinutes;
exports.clear = clear;
exports.clearAll = clearAll;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
let ambientCooldownEnd = 0;
let ondemandCooldownEnd = 0;
function activate(mode, durationMs = DEFAULT_COOLDOWN_MS) {
    if (mode === "ambient")
        ambientCooldownEnd = Date.now() + durationMs;
    else
        ondemandCooldownEnd = Date.now() + durationMs;
}
function isActive(mode) {
    const end = mode === "ambient" ? ambientCooldownEnd : ondemandCooldownEnd;
    return Date.now() < end;
}
function remainingMinutes(mode) {
    const end = mode === "ambient" ? ambientCooldownEnd : ondemandCooldownEnd;
    const remaining = end - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}
function clear(mode) {
    if (mode === "ambient")
        ambientCooldownEnd = 0;
    else
        ondemandCooldownEnd = 0;
}
function clearAll() {
    ambientCooldownEnd = 0;
    ondemandCooldownEnd = 0;
}
