export interface HeadphoneStatus {
    connected: boolean;
    device: string | null;
    detection_method: "switchaudio" | "system_profiler" | "pactl" | "none";
}
export declare function detectHeadphones(): Promise<HeadphoneStatus>;
