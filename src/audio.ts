import { spawn, execFile, ChildProcess } from "child_process";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Element, ELEMENT_LABELS, ELEMENT_ORGANS, ELEMENT_SHORT_SUMMARIES } from "./types.js";

// Bundled audio inside the package (works standalone)
const PACKAGE_AUDIO_DIR = join(__dirname, "..", "..", "audio");
// User-level cache (e.g. prebaked binaural versions)
const AUDIO_CACHE_DIR = join(homedir(), ".daobrew", "audio");

export interface PlaybackResult {
  status: "playing" | "no_file" | "no_player" | "error";
  pid: number | null;
  file?: string;
  error?: string;
}

let currentProcess: ChildProcess | null = null;

/** Map task type to audio file suffix */
type TaskType = "breathing" | "meditation" | "zhanZhuang";

/** Resolve the audio file for an element + task. Checks cache dir, then bundled package audio. Randomly picks from multiple tracks if available. */
function resolveAudioFile(element: Element, task: TaskType = "breathing"): string | null {
  const filename = `${element}_${task}.m4a`;

  // Collect all candidate files across both directories
  const candidates: string[] = [];

  for (const dir of [AUDIO_CACHE_DIR, PACKAGE_AUDIO_DIR]) {
    if (!existsSync(dir)) continue;

    // Exact match (e.g. wood_breathing.m4a)
    const exact = join(dir, filename);
    if (existsSync(exact)) candidates.push(exact);

    // Numbered variants (e.g. wood_breathing_1.m4a, wood_breathing_2.m4a)
    const files = readdirSync(dir).filter(f =>
      f.startsWith(`${element}_${task}_`) && f.endsWith(".m4a")
    );
    for (const f of files) candidates.push(join(dir, f));
  }

  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Legacy fallback: any file starting with element_ in cache dir
  if (existsSync(AUDIO_CACHE_DIR)) {
    const files = readdirSync(AUDIO_CACHE_DIR).filter(f => f.startsWith(`${element}_`) && f.endsWith(".m4a"));
    if (files.length > 0) return join(AUDIO_CACHE_DIR, files[Math.floor(Math.random() * files.length)]);
  }

  return null;
}

export async function playAudio(
  element: Element,
  task: TaskType = "breathing",
  volume: number = 0.4,
): Promise<PlaybackResult> {
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
      currentProcess = spawn("afplay", ["-v", String(volume), audioPath], {
        stdio: "ignore", detached: true,
      });
    } else {
      currentProcess = spawn("mpv", [
        "--no-video", "--really-quiet", `--volume=${Math.round(volume * 100)}`, audioPath,
      ], { stdio: "ignore", detached: true });
    }

    currentProcess.unref();
    const pid = currentProcess.pid ?? null;
    currentProcess.on("exit", () => { currentProcess = null; });
    return { status: "playing", pid, file: audioPath };
  } catch (err: any) {
    return { status: "error", pid: null, error: err.message };
  }
}

export function stopPlayback(): boolean {
  if (currentProcess) {
    currentProcess.kill("SIGTERM");
    currentProcess = null;
    return true;
  }
  return false;
}

export function generateTextBreathingScript(
  element: Element, durationSec: number, bpm: number
): string {
  const cycleDuration = 60 / bpm;
  const inhaleDuration = cycleDuration / 3;
  const exhaleDuration = (cycleDuration * 2) / 3;
  const cycles = Math.floor(durationSec / cycleDuration);

  let script = `\n${ELEMENT_LABELS[element]} · ${ELEMENT_ORGANS[element]} — ${ELEMENT_SHORT_SUMMARIES[element]}\n`;
  script += `${cycles} breathing cycles at ${bpm} BPM\n\n`;
  for (let i = 1; i <= Math.min(cycles, 6); i++) {
    script += `Cycle ${i}/${cycles}:\n`;
    script += `  Inhale... (${inhaleDuration.toFixed(1)}s)\n`;
    script += `  Exhale slowly... (${exhaleDuration.toFixed(1)}s)\n\n`;
  }
  if (cycles > 6) script += `  ... (${cycles - 6} more cycles)\n\n`;
  script += `Session complete. Call daobrew_get_session_result for HRV changes.\n`;
  return script;
}
