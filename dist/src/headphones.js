"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectHeadphones = detectHeadphones;
const child_process_1 = require("child_process");
const os_1 = require("os");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Blocklist: known built-in speakers to REJECT.
// Everything else (USB-C, DAC, Bluetooth, unknown external) = allowed.
const BUILTIN_SPEAKER_PATTERNS = [
    "macbook pro speakers", "macbook air speakers", "macbook speakers",
    "built-in output", "built-in speaker", "internal speakers",
    "display audio", "imac speakers", "mac mini", "mac pro speakers",
    "mac studio speakers",
];
async function detectHeadphones() {
    const os = (0, os_1.platform)();
    if (os === "darwin") {
        try {
            const { stdout } = await execAsync("SwitchAudioSource -c -t output");
            const device = stdout.trim();
            const deviceLower = device.toLowerCase();
            const isBuiltIn = BUILTIN_SPEAKER_PATTERNS.some(p => deviceLower.includes(p));
            return { connected: !isBuiltIn, device, detection_method: "switchaudio" };
        }
        catch {
            try {
                const { stdout } = await execAsync("system_profiler SPBluetoothDataType -json 2>/dev/null");
                const btData = JSON.parse(stdout);
                const connectedDevices = btData?.SPBluetoothDataType?.[0]?.device_connected ?? [];
                // Find any connected audio device (Headphones, Headset, Speaker)
                let audioDevice = null;
                for (const entry of connectedDevices) {
                    for (const [name, info] of Object.entries(entry)) {
                        const minor = info?.device_minorType ?? "";
                        if (/headphone|headset|speaker|earphone/i.test(minor) ||
                            /airpod|beats|bose|sony|jabra|sennheiser/i.test(name)) {
                            audioDevice = name;
                            break;
                        }
                    }
                    if (audioDevice)
                        break;
                }
                // Legacy format fallback (older macOS)
                if (!audioDevice && stdout.includes('"attrib_Connected" : "attrib_Yes"')) {
                    audioDevice = "Bluetooth Audio";
                }
                return { connected: !!audioDevice, device: audioDevice, detection_method: "system_profiler" };
            }
            catch {
                return { connected: true, device: null, detection_method: "none" };
            }
        }
    }
    if (os === "linux") {
        try {
            const { stdout } = await execAsync("pactl list sinks short");
            const hasExternal = stdout.toLowerCase().includes("bluetooth") ||
                stdout.toLowerCase().includes("headphone") ||
                stdout.toLowerCase().includes("usb");
            return { connected: hasExternal, device: null, detection_method: "pactl" };
        }
        catch {
            return { connected: true, device: null, detection_method: "none" };
        }
    }
    return { connected: true, device: null, detection_method: "none" };
}
