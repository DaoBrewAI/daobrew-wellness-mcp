import { exec } from "child_process";
import { platform } from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

/** exec with a 3-second timeout to prevent hangs on CI / headless environments */
function execWithTimeout(cmd: string, timeoutMs = 3000): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { timeout: timeoutMs });
}

// Blocklist: known built-in speakers to REJECT.
// Everything else (USB-C, DAC, Bluetooth, unknown external) = allowed.
const BUILTIN_SPEAKER_PATTERNS = [
  "macbook pro speakers", "macbook air speakers", "macbook speakers",
  "built-in output", "built-in speaker", "internal speakers",
  "display audio", "imac speakers", "mac mini", "mac pro speakers",
  "mac studio speakers",
];

export interface HeadphoneStatus {
  connected: boolean;
  device: string | null;
  detection_method: "switchaudio" | "system_profiler" | "pactl" | "none";
}

export async function detectHeadphones(): Promise<HeadphoneStatus> {
  const os = platform();

  if (os === "darwin") {
    try {
      const { stdout } = await execWithTimeout("SwitchAudioSource -c -t output");
      const device = stdout.trim();
      const deviceLower = device.toLowerCase();
      const isBuiltIn = BUILTIN_SPEAKER_PATTERNS.some(p => deviceLower.includes(p));
      return { connected: !isBuiltIn, device, detection_method: "switchaudio" };
    } catch {
      try {
        const { stdout } = await execWithTimeout("system_profiler SPBluetoothDataType -json 2>/dev/null", 5000);
        const btData = JSON.parse(stdout);
        const connectedDevices = btData?.SPBluetoothDataType?.[0]?.device_connected ?? [];
        // Find any connected audio device (Headphones, Headset, Speaker)
        let audioDevice: string | null = null;
        for (const entry of connectedDevices) {
          for (const [name, info] of Object.entries(entry)) {
            const minor = (info as any)?.device_minorType ?? "";
            if (/headphone|headset|speaker|earphone/i.test(minor) ||
                /airpod|beats|bose|sony|jabra|sennheiser/i.test(name)) {
              audioDevice = name;
              break;
            }
          }
          if (audioDevice) break;
        }
        // Legacy format fallback (older macOS)
        if (!audioDevice && stdout.includes('"attrib_Connected" : "attrib_Yes"')) {
          audioDevice = "Bluetooth Audio";
        }
        return { connected: !!audioDevice, device: audioDevice, detection_method: "system_profiler" };
      } catch {
        return { connected: true, device: null, detection_method: "none" };
      }
    }
  }

  if (os === "linux") {
    try {
      const { stdout } = await execWithTimeout("pactl list sinks short");
      const hasExternal = stdout.toLowerCase().includes("bluetooth") ||
                          stdout.toLowerCase().includes("headphone") ||
                          stdout.toLowerCase().includes("usb");
      return { connected: hasExternal, device: null, detection_method: "pactl" };
    } catch {
      return { connected: true, device: null, detection_method: "none" };
    }
  }

  return { connected: true, device: null, detection_method: "none" };
}
