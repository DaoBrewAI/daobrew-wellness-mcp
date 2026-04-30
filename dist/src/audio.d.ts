import { Element } from "./types.js";
export interface PlaybackResult {
    status: "playing" | "no_file" | "no_player" | "error";
    pid: number | null;
    file?: string;
    error?: string;
}
/** Map task type to audio file suffix */
type TaskType = "breathing" | "meditation" | "zhanZhuang";
export declare function playAudio(element: Element, task?: TaskType, volume?: number): Promise<PlaybackResult>;
export declare function stopPlayback(): boolean;
export declare function generateTextBreathingScript(element: Element, durationSec: number, bpm: number): string;
export {};
