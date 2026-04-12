"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playAudio = playAudio;
exports.stopPlayback = stopPlayback;
exports.generateTextBreathingScript = generateTextBreathingScript;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const types_js_1 = require("./types.js");
// Bundled audio inside the package (works standalone)
const PACKAGE_AUDIO_DIR = (0, path_1.join)(__dirname, "..", "..", "audio");
// User-level cache (e.g. prebaked binaural versions)
const AUDIO_CACHE_DIR = (0, path_1.join)((0, os_1.homedir)(), ".daobrew", "audio");
let currentProcess = null;
/** Resolve the audio file for an element + task. Checks cache dir, then bundled package audio. Randomly picks from multiple tracks if available. */
function resolveAudioFile(element, task = "breathing") {
    const filename = `${element}_${task}.m4a`;
    // Collect all candidate files across both directories
    const candidates = [];
    for (const dir of [AUDIO_CACHE_DIR, PACKAGE_AUDIO_DIR]) {
        if (!(0, fs_1.existsSync)(dir))
            continue;
        // Exact match (e.g. wood_breathing.m4a)
        const exact = (0, path_1.join)(dir, filename);
        if ((0, fs_1.existsSync)(exact))
            candidates.push(exact);
        // Numbered variants (e.g. wood_breathing_1.m4a, wood_breathing_2.m4a)
        const files = (0, fs_1.readdirSync)(dir).filter(f => f.startsWith(`${element}_${task}_`) && f.endsWith(".m4a"));
        for (const f of files)
            candidates.push((0, path_1.join)(dir, f));
    }
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Legacy fallback: any file starting with element_ in cache dir
    if ((0, fs_1.existsSync)(AUDIO_CACHE_DIR)) {
        const files = (0, fs_1.readdirSync)(AUDIO_CACHE_DIR).filter(f => f.startsWith(`${element}_`) && f.endsWith(".m4a"));
        if (files.length > 0)
            return (0, path_1.join)(AUDIO_CACHE_DIR, files[Math.floor(Math.random() * files.length)]);
    }
    return null;
}
async function playAudio(element, task = "breathing", volume = 0.4) {
    if (process.platform !== "darwin" && process.platform !== "linux") {
        return { status: "no_player", pid: null, error: `Unsupported platform: ${process.platform}` };
    }
    const audioPath = resolveAudioFile(element, task);
    if (!audioPath) {
        return { status: "no_file", pid: null, error: `Audio file not found for ${element}_${task}.m4a — check ~/.daobrew/audio/ or package audio/ directory.` };
    }
    stopPlayback();
    try {
        if (process.platform === "darwin") {
            currentProcess = (0, child_process_1.spawn)("afplay", ["-v", String(volume), audioPath], {
                stdio: "ignore", detached: true,
            });
        }
        else {
            currentProcess = (0, child_process_1.spawn)("mpv", [
                "--no-video", "--really-quiet", `--volume=${Math.round(volume * 100)}`, audioPath,
            ], { stdio: "ignore", detached: true });
        }
        currentProcess.unref();
        const pid = currentProcess.pid ?? null;
        currentProcess.on("exit", () => { currentProcess = null; });
        return { status: "playing", pid, file: audioPath };
    }
    catch (err) {
        return { status: "error", pid: null, error: err.message };
    }
}
function stopPlayback() {
    if (currentProcess) {
        currentProcess.kill("SIGTERM");
        currentProcess = null;
        return true;
    }
    return false;
}
function generateTextBreathingScript(element, durationSec, bpm) {
    const cycleDuration = 60 / bpm;
    const inhaleDuration = cycleDuration / 3;
    const exhaleDuration = (cycleDuration * 2) / 3;
    const cycles = Math.floor(durationSec / cycleDuration);
    let script = `\n${types_js_1.ELEMENT_LABELS[element]} · ${types_js_1.ELEMENT_ORGANS[element]} — ${types_js_1.ELEMENT_SHORT_SUMMARIES[element]}\n`;
    script += `${cycles} breathing cycles at ${bpm} BPM\n\n`;
    for (let i = 1; i <= Math.min(cycles, 6); i++) {
        script += `Cycle ${i}/${cycles}:\n`;
        script += `  Inhale... (${inhaleDuration.toFixed(1)}s)\n`;
        script += `  Exhale slowly... (${exhaleDuration.toFixed(1)}s)\n\n`;
    }
    if (cycles > 6)
        script += `  ... (${cycles - 6} more cycles)\n\n`;
    script += `Session complete. Call daobrew_get_session_result for HRV changes.\n`;
    return script;
}
