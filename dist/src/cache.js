"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.set = set;
exports.invalidate = invalidate;
exports.ageSeconds = ageSeconds;
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const store = new Map();
function get(key) {
    const entry = store.get(key);
    if (!entry)
        return null;
    const age = Date.now() - entry.timestamp;
    if (age > DEFAULT_TTL_MS) {
        store.delete(key);
        return null;
    }
    return { data: entry.data, age_seconds: Math.round(age / 1000) };
}
function set(key, data) {
    store.set(key, { data, timestamp: Date.now() });
}
function invalidate(key) {
    store.delete(key);
}
function ageSeconds(key) {
    const entry = store.get(key);
    if (!entry)
        return -1;
    return Math.round((Date.now() - entry.timestamp) / 1000);
}
