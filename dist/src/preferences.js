"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = load;
exports.save = save;
exports.incrementSessionCount = incrementSessionCount;
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const PREFS_DIR = (0, path_1.join)((0, os_1.homedir)(), ".daobrew");
const PREFS_FILE = (0, path_1.join)(PREFS_DIR, "prefs.json");
const DEFAULTS = {
    ambient_optin: false,
    ambient_optin_date: null,
    preferred_volume: 0.3,
    cooldown_minutes: 30,
    disabled: false,
    headphones_trusted: false,
    session_count: 0,
    voiceover: true,
};
function load() {
    if (!(0, fs_1.existsSync)(PREFS_FILE))
        return { ...DEFAULTS };
    try {
        return { ...DEFAULTS, ...JSON.parse((0, fs_1.readFileSync)(PREFS_FILE, "utf-8")) };
    }
    catch {
        return { ...DEFAULTS };
    }
}
function save(prefs) {
    if (!(0, fs_1.existsSync)(PREFS_DIR))
        (0, fs_1.mkdirSync)(PREFS_DIR, { recursive: true });
    const current = load();
    const updated = { ...current, ...prefs };
    (0, fs_1.writeFileSync)(PREFS_FILE, JSON.stringify(updated, null, 2));
}
function incrementSessionCount() {
    const prefs = load();
    const count = prefs.session_count + 1;
    const updates = { session_count: count };
    if (count >= 3 && prefs.voiceover) {
        updates.voiceover = false;
    }
    save(updates);
    return count;
}
