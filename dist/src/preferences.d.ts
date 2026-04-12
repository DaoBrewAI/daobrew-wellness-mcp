export interface Preferences {
    ambient_optin: boolean;
    ambient_optin_date: string | null;
    preferred_volume: number;
    cooldown_minutes: number;
    disabled: boolean;
    headphones_trusted: boolean;
    session_count: number;
    voiceover: boolean;
}
export declare function load(): Preferences;
export declare function save(prefs: Partial<Preferences>): void;
export declare function incrementSessionCount(): number;
