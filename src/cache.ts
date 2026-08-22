const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const store = new Map<string, CacheEntry<any>>();

export function get<T>(key: string): { data: T; age_seconds: number } | null {
  const entry = store.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age > DEFAULT_TTL_MS) {
    store.delete(key);
    return null;
  }
  return { data: entry.data, age_seconds: Math.round(age / 1000) };
}

export function set<T>(key: string, data: T): void {
  store.set(key, { data, timestamp: Date.now() });
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function ageSeconds(key: string): number {
  const entry = store.get(key);
  if (!entry) return -1;
  return Math.round((Date.now() - entry.timestamp) / 1000);
}
