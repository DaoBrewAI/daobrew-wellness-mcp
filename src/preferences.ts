import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PREFS_DIR = join(homedir(), ".daobrew");
const PREFS_FILE = join(PREFS_DIR, "prefs.json");

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

const DEFAULTS: Preferences = {
  ambient_optin: false,
  ambient_optin_date: null,
  preferred_volume: 0.3,
  cooldown_minutes: 30,
  disabled: false,
  headphones_trusted: false,
  session_count: 0,
  voiceover: true,
};

export function load(): Preferences {
  if (!existsSync(PREFS_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(PREFS_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(prefs: Partial<Preferences>): void {
  if (!existsSync(PREFS_DIR)) mkdirSync(PREFS_DIR, { recursive: true });
  const current = load();
  const updated = { ...current, ...prefs };
  writeFileSync(PREFS_FILE, JSON.stringify(updated, null, 2));
}

export function incrementSessionCount(): number {
  const prefs = load();
  const count = prefs.session_count + 1;
  const updates: Partial<Preferences> = { session_count: count };
  if (count >= 3 && prefs.voiceover) {
    updates.voiceover = false;
  }
  save(updates);
  return count;
}
