import { randomUUID } from "crypto";
import {
  closeSync,
  constants,
  chmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";

export type OuraOAuthMode = "managed" | "personal";

export interface StoredOuraToken {
  /** Exact Task Map owner scope that authorized this provider grant. */
  owner_scope_digest?: string;
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
  scope?: string;
  oauth_mode?: OuraOAuthMode;
  authorization_generation?: string | number;
  authorized_at?: number;
  saved_at?: number;
}

export interface OuraTokenLockOptions {
  timeoutMs?: number;
  staleMs?: number;
  retryDelayMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  nonce?: () => string;
}

export interface RefreshSaveResult<T extends StoredOuraToken> {
  token: T;
  saved: boolean;
}

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_RETRY_MS = 10;

export function normalizeAuthorizationGeneration(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed.length <= 128 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return undefined;
}

export function createAuthorizationGeneration(nonce: () => string = randomUUID): string {
  return `auth_${nonce()}`;
}

export function ouraTokenLockPath(tokenFile: string): string {
  return `${tokenFile}.lock`;
}

export function ouraTokenTemporaryPath(
  tokenFile: string,
  pid = process.pid,
  nonce: string = randomUUID(),
): string {
  return `${tokenFile}.tmp-${pid}-${nonce}`;
}

export function readOuraTokenFile<T extends StoredOuraToken = StoredOuraToken>(
  tokenFile: string,
): T | null {
  let descriptor: number | undefined;
  try {
    const tokenDirectory = dirname(tokenFile);
    const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    const directoryStat = lstatSync(tokenDirectory);
    if (
      !directoryStat.isDirectory()
      || directoryStat.isSymbolicLink()
      || (directoryStat.mode & 0o777) !== 0o700
      || (expectedUid !== undefined && directoryStat.uid !== expectedUid)
    ) {
      return null;
    }

    const pathStat = lstatSync(tokenFile);
    if (
      !pathStat.isFile()
      || pathStat.isSymbolicLink()
      || pathStat.nlink !== 1
      || (pathStat.mode & 0o777) !== 0o600
      || (expectedUid !== undefined && pathStat.uid !== expectedUid)
    ) {
      return null;
    }

    descriptor = openSync(tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openStat = fstatSync(descriptor);
    if (
      !openStat.isFile()
      || openStat.nlink !== 1
      || (openStat.mode & 0o777) !== 0o600
      || (expectedUid !== undefined && openStat.uid !== expectedUid)
      || openStat.dev !== pathStat.dev
      || openStat.ino !== pathStat.ino
    ) {
      return null;
    }

    const token = JSON.parse(readFileSync(descriptor, "utf-8"));
    if (!isUsableOuraToken(token)) return null;
    return token as T;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch {}
    }
  }
}

function isUsableOuraToken(token: any): token is StoredOuraToken {
  return typeof token?.access_token === "string"
    && Boolean(token.access_token.trim())
    && typeof token?.refresh_token === "string"
    && Boolean(token.refresh_token.trim())
    && Number.isFinite(token?.expires_at)
    && (
      token?.oauth_mode === undefined
      || token.oauth_mode === "managed"
      || token.oauth_mode === "personal"
    );
}

function ensureOwnerOnlyTokenDirectory(tokenDirectory: string): void {
  mkdirSync(tokenDirectory, { recursive: true, mode: 0o700 });
  const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const directoryStat = lstatSync(tokenDirectory);
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || (expectedUid !== undefined && directoryStat.uid !== expectedUid)
  ) {
    throw new Error("Refusing to use an unsafe Oura token directory");
  }
  if ((directoryStat.mode & 0o777) !== 0o700) {
    chmodSync(tokenDirectory, 0o700);
  }
}

function atomicWriteOuraToken<T extends StoredOuraToken>(
  tokenFile: string,
  token: T,
  nonce: () => string,
): void {
  if (!isUsableOuraToken(token)) {
    throw new Error("Refusing to save an incomplete Oura OAuth token");
  }
  const tokenDirectory = dirname(tokenFile);
  ensureOwnerOnlyTokenDirectory(tokenDirectory);
  const temporary = ouraTokenTemporaryPath(tokenFile, process.pid, nonce());
  try {
    writeFileSync(
      temporary,
      JSON.stringify(token, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    chmodSync(temporary, 0o600);
    renameSync(temporary, tokenFile);
    chmodSync(tokenFile, 0o600);
  } finally {
    try { rmSync(temporary, { force: true }); } catch {}
  }
}

async function withOuraTokenLock<T>(
  tokenFile: string,
  operation: () => T | Promise<T>,
  options: OuraTokenLockOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep
    ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const nonce = options.nonce ?? randomUUID;
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_LOCK_RETRY_MS;
  const tokenDirectory = dirname(tokenFile);
  const lockPath = ouraTokenLockPath(tokenFile);
  const ownerPath = `${lockPath}/owner`;
  const owner = nonce();
  const deadline = now() + timeoutMs;

  ensureOwnerOnlyTokenDirectory(tokenDirectory);

  while (true) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      chmodSync(lockPath, 0o700);
      writeFileSync(ownerPath, owner, { mode: 0o600 });
      chmodSync(ownerPath, 0o600);
      break;
    } catch (error: any) {
      if (error?.code !== "EEXIST") {
        throw new Error("Could not acquire the local Oura token lock");
      }
      try {
        if (now() - statSync(lockPath).mtimeMs > staleMs) {
          const abandoned = `${lockPath}.stale-${process.pid}-${nonce()}`;
          renameSync(lockPath, abandoned);
          rmSync(abandoned, { recursive: true, force: true });
          continue;
        }
      } catch {}
      if (now() >= deadline) {
        throw new Error("Timed out waiting for the local Oura token lock");
      }
      await sleep(retryDelayMs);
    }
  }

  try {
    return await operation();
  } finally {
    try {
      if (readFileSync(ownerPath, "utf-8") === owner) {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch {}
  }
}

export async function saveNewOuraAuthorization<T extends StoredOuraToken>(
  tokenFile: string,
  token: Omit<T, "authorization_generation">,
  options: OuraTokenLockOptions & {
    generation?: () => string;
    validateBeforeSave?: () => void;
  } = {},
): Promise<T> {
  return withOuraTokenLock(tokenFile, () => {
    readOuraTokenFile(tokenFile);
    options.validateBeforeSave?.();
    const generation = options.generation?.()
      ?? createAuthorizationGeneration(options.nonce);
    if (!normalizeAuthorizationGeneration(generation)) {
      throw new Error("Could not allocate an Oura authorization generation");
    }
    const next = { ...token, authorization_generation: generation } as T;
    atomicWriteOuraToken(tokenFile, next, options.nonce ?? randomUUID);
    return next;
  }, options);
}

function sameRefreshSnapshot(
  current: StoredOuraToken,
  expected: StoredOuraToken,
): boolean {
  return normalizeAuthorizationGeneration(current.authorization_generation)
      === normalizeAuthorizationGeneration(expected.authorization_generation)
    && current.owner_scope_digest === expected.owner_scope_digest
    && current.access_token === expected.access_token
    && current.refresh_token === expected.refresh_token
    && current.oauth_mode === expected.oauth_mode;
}

export async function compareAndSwapOuraRefresh<T extends StoredOuraToken>(
  tokenFile: string,
  expected: T,
  refreshed: T,
  options: OuraTokenLockOptions & {
    validateBeforeSave?: () => void;
  } = {},
): Promise<RefreshSaveResult<T>> {
  return withOuraTokenLock(tokenFile, () => {
    const current = readOuraTokenFile<T>(tokenFile);
    if (!current) {
      throw new Error(
        "Oura authorization changed during token refresh; reconnect if needed",
      );
    }
    if (!sameRefreshSnapshot(current, expected)) {
      return { token: current, saved: false };
    }
    options.validateBeforeSave?.();
    const next = {
      ...refreshed,
      authorization_generation: current.authorization_generation,
    } as T;
    atomicWriteOuraToken(tokenFile, next, options.nonce ?? randomUUID);
    return { token: next, saved: true };
  }, options);
}
