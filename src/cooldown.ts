const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

let ambientCooldownEnd = 0;
let ondemandCooldownEnd = 0;

export function activate(mode: "ambient" | "ondemand", durationMs: number = DEFAULT_COOLDOWN_MS): void {
  if (mode === "ambient") ambientCooldownEnd = Date.now() + durationMs;
  else ondemandCooldownEnd = Date.now() + durationMs;
}

export function isActive(mode: "ambient" | "ondemand"): boolean {
  const end = mode === "ambient" ? ambientCooldownEnd : ondemandCooldownEnd;
  return Date.now() < end;
}

export function remainingMinutes(mode: "ambient" | "ondemand"): number {
  const end = mode === "ambient" ? ambientCooldownEnd : ondemandCooldownEnd;
  const remaining = end - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

export function clear(mode: "ambient" | "ondemand"): void {
  if (mode === "ambient") ambientCooldownEnd = 0;
  else ondemandCooldownEnd = 0;
}

export function clearAll(): void {
  ambientCooldownEnd = 0;
  ondemandCooldownEnd = 0;
}
