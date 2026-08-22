import type { LocalFileConfig } from "./engine/local-config.js";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import {
  assertTaskMapOwnerScope,
  createTaskMapOwnerScope,
  type TaskMapOwnerScope,
} from "./engine/taskmap/owner-scope.js";
import { canonicalUserId } from "./user-id.js";

export type IdentityPlan =
  | { ok: true; userId: string }
  | { ok: false; reason: string };

export function resolveUserId(config: LocalFileConfig, explicit?: string): IdentityPlan {
  const rawCandidate =
    explicit !== undefined
      ? explicit
      : process.env.DAOBREW_USER_ID !== undefined
        ? process.env.DAOBREW_USER_ID
        : config.user_id ?? "";
  const candidate = canonicalUserId(rawCandidate);
  if (!candidate) {
    return {
      ok: false,
      reason: "no canonical UUID identity - run daobrew setup (MCP) or launch the Sentinel app (Mac) to mint one, or set DAOBREW_USER_ID",
    };
  }
  return { ok: true, userId: candidate };
}

export function clientOptionsFor(config: LocalFileConfig, userId: string) {
  return {
    apiKey: process.env.DAOBREW_API_KEY || config.api_key || "",
    baseUrl: process.env.DAOBREW_API_URL || config.api_url,
    deviceId: userId,
  };
}

const DEVICE_CREDENTIAL_RE = /^dbd_[A-Za-z0-9_-]{28,}$/;

const CONFIRMED_TASKMAP_OWNER_AUTHORITY: unique symbol = Symbol(
  "ConfirmedTaskMapOwnerAuthority",
);
const confirmedTaskMapOwners = new WeakSet<object>();

export interface TaskMapOwnerEnrollment extends TaskMapOwnerScope {
  readonly deviceCredential: string;
  readonly issuerUrl: string;
}

export interface ConfirmedTaskMapOwner extends TaskMapOwnerEnrollment {
  readonly [CONFIRMED_TASKMAP_OWNER_AUTHORITY]: true;
}

export type ConfirmedTaskMapOwnerPlan =
  | { ok: true; owner: ConfirmedTaskMapOwner }
  | { ok: false; reason: string };

export type TaskMapOwnerEnrollmentPlan =
  | { ok: true; owner: TaskMapOwnerEnrollment }
  | { ok: false; reason: string };

export interface TaskMapOwnerEnvironmentSelection {
  userId?: unknown;
  apiUrl?: unknown;
}

export interface TaskMapConfirmedOwnerConfig {
  user_id?: unknown;
  api_url?: unknown;
  device_credential?: unknown;
  device_credential_confirmed?: unknown;
}

const MAX_CONFIRMED_OWNER_CONFIG_BYTES = 64 * 1_024;

export type CredentialBoundClientPlan =
  | { ok: true; deviceCredential: string; apiUrl: string }
  | { ok: false; reason: string };

/**
 * Resolve an absolute backend route against the credential issuer origin.
 * Persisted enrollment URLs intentionally include `/api/v1`; treating that
 * value as a string prefix would duplicate the API path for device endpoints.
 */
export function credentialBoundApiEndpoint(
  apiUrl: string,
  route: `/api/v1/${string}`,
): string {
  return new URL(route, `${apiUrl}/`).toString();
}

function normalizeApiUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim().replace(/\/+$/, ""));
    const loopback = parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "::1"
      || parsed.hostname === "[::1]";
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizePersistedHttpsIssuer(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim().replace(/\/+$/, ""));
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the immutable, persisted enrollment used by production Task Map.
 * Environment values may confirm an already-persisted UUID but can never
 * supply or rebind its credential/issuer authority record.
 */
export function validateTaskMapOwnerEnrollment(
  config: TaskMapConfirmedOwnerConfig,
  environment: TaskMapOwnerEnvironmentSelection = {},
  homeDirectory: string,
): TaskMapOwnerEnrollmentPlan {
  const configuredRaw = typeof config.user_id === "string"
    ? config.user_id.trim()
    : "";
  const userId = canonicalUserId(configuredRaw);
  if (userId === null || configuredRaw !== userId) {
    return {
      ok: false,
      reason: "Task Map persisted owner must be a canonical uppercase UUID",
    };
  }
  if (environment.userId !== undefined) {
    const explicitRaw = typeof environment.userId === "string"
      ? environment.userId.trim()
      : "";
    const explicit = canonicalUserId(explicitRaw);
    if (
      explicit === null
      || explicitRaw !== explicit
      || explicit !== userId
    ) {
      return {
        ok: false,
        reason: "Task Map explicit owner identity is unavailable or changed",
      };
    }
  }
  const deviceCredential = typeof config.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  if (
    config.device_credential_confirmed !== true
    || !DEVICE_CREDENTIAL_RE.test(deviceCredential)
  ) {
    return {
      ok: false,
      reason: "Task Map confirmed device credential is unavailable",
    };
  }
  const issuerUrl = normalizePersistedHttpsIssuer(config.api_url);
  if (issuerUrl === null) {
    return {
      ok: false,
      reason: "Task Map confirmed credential requires a persisted safe HTTPS issuer",
    };
  }
  try {
    const owner: TaskMapOwnerEnrollment = {
      ...createTaskMapOwnerScope(userId, homeDirectory),
      deviceCredential,
      issuerUrl,
    };
    return {
      ok: true,
      owner: Object.freeze(owner),
    };
  } catch {
    return {
      ok: false,
      reason: "Task Map owner storage scope is unavailable",
    };
  }
}

function confirmPersistedTaskMapOwner(
  enrollment: TaskMapOwnerEnrollment,
): ConfirmedTaskMapOwner {
  const owner = { ...enrollment } as ConfirmedTaskMapOwner;
  Object.defineProperty(owner, CONFIRMED_TASKMAP_OWNER_AUTHORITY, {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
  });
  confirmedTaskMapOwners.add(owner);
  return Object.freeze(owner);
}

export function assertConfirmedTaskMapOwner(
  value: unknown,
): asserts value is ConfirmedTaskMapOwner {
  if (
    value === null
    || typeof value !== "object"
    || !confirmedTaskMapOwners.has(value)
  ) {
    throw new Error("Task Map confirmed owner authority is unavailable");
  }
  assertTaskMapOwnerScope(value);
  const owner = value as ConfirmedTaskMapOwner;
  if (
    !DEVICE_CREDENTIAL_RE.test(owner.deviceCredential)
    || normalizePersistedHttpsIssuer(owner.issuerUrl) !== owner.issuerUrl
  ) {
    throw new Error("Task Map confirmed owner authority is invalid");
  }
}

interface StableBigIntMetadata {
  dev: bigint;
  ino: bigint;
  mode: bigint;
  nlink: bigint;
  uid: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

function stableBigIntMetadataMatches(
  expected: StableBigIntMetadata,
  actual: StableBigIntMetadata,
): boolean {
  return actual.dev === expected.dev
    && actual.ino === expected.ino
    && actual.mode === expected.mode
    && actual.nlink === expected.nlink
    && actual.uid === expected.uid
    && actual.size === expected.size
    && actual.mtimeNs === expected.mtimeNs
    && actual.ctimeNs === expected.ctimeNs;
}

/**
 * Load one installation-persisted enrollment. The path is fixed beneath the
 * supplied OS home; environment values can only confirm its UUID and can
 * never redirect or replace the credential/issuer authority record.
 */
export async function loadConfirmedTaskMapOwner(
  homeDirectory: string,
  environment: TaskMapOwnerEnvironmentSelection = {},
  afterDirectoryOpenForTesting?: () => Promise<void>,
): Promise<ConfirmedTaskMapOwnerPlan> {
  let directoryHandle: Awaited<ReturnType<typeof open>> | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const configDirectory = path.join(homeDirectory, ".daobrew");
    directoryHandle = await open(
      configDirectory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const directory = await directoryHandle.stat({ bigint: true });
    const expectedUid = typeof process.getuid === "function"
      ? BigInt(process.getuid())
      : directory.uid;
    if (
      !directory.isDirectory()
      || directory.uid !== expectedUid
      || (directory.mode & 0o077n) !== 0n
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment directory is unsafe",
      };
    }
    await afterDirectoryOpenForTesting?.();
    const configPath = path.join(configDirectory, "config.json");
    handle = await open(
      configPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile()
      || before.uid !== expectedUid
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 2n
      || before.size > BigInt(MAX_CONFIRMED_OWNER_CONFIG_BYTES)
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment is not an owner-only regular file",
      };
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const directoryAfter = await directoryHandle.stat({ bigint: true });
    const namedDirectory = await lstat(configDirectory, { bigint: true });
    const namedConfig = await lstat(configPath, { bigint: true });
    if (
      BigInt(bytes.byteLength) !== before.size
      || !stableBigIntMetadataMatches(before, after)
      || !stableBigIntMetadataMatches(directory, directoryAfter)
      || !stableBigIntMetadataMatches(directory, namedDirectory)
      || !stableBigIntMetadataMatches(before, namedConfig)
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment changed while it was read",
      };
    }
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment is malformed",
      };
    }
    const enrollment = validateTaskMapOwnerEnrollment(
      parsed as TaskMapConfirmedOwnerConfig,
      environment,
      homeDirectory,
    );
    return enrollment.ok
      ? { ok: true, owner: confirmPersistedTaskMapOwner(enrollment.owner) }
      : enrollment;
  } catch {
    return {
      ok: false,
      reason: "Task Map confirmed owner enrollment is unavailable",
    };
  } finally {
    await handle?.close().catch(() => undefined);
    await directoryHandle?.close().catch(() => undefined);
  }
}

/** Synchronous equivalent for startup/test harnesses that construct services. */
export function loadConfirmedTaskMapOwnerSync(
  homeDirectory: string,
  environment: TaskMapOwnerEnvironmentSelection = {},
  afterDirectoryOpenForTesting?: () => void,
): ConfirmedTaskMapOwnerPlan {
  let directoryDescriptor: number | undefined;
  let descriptor: number | undefined;
  try {
    const configDirectory = path.join(homeDirectory, ".daobrew");
    directoryDescriptor = openSync(
      configDirectory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const directory = fstatSync(directoryDescriptor, { bigint: true });
    const expectedUid = typeof process.getuid === "function"
      ? BigInt(process.getuid())
      : directory.uid;
    if (
      !directory.isDirectory()
      || directory.uid !== expectedUid
      || (directory.mode & 0o077n) !== 0n
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment directory is unsafe",
      };
    }
    afterDirectoryOpenForTesting?.();
    const configPath = path.join(configDirectory, "config.json");
    descriptor = openSync(
      configPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile()
      || before.uid !== expectedUid
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== 0o600n
      || before.size < 2n
      || before.size > BigInt(MAX_CONFIRMED_OWNER_CONFIG_BYTES)
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment is not an owner-only regular file",
      };
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const directoryAfter = fstatSync(directoryDescriptor, { bigint: true });
    const namedDirectory = lstatSync(configDirectory, { bigint: true });
    const namedConfig = lstatSync(configPath, { bigint: true });
    if (
      BigInt(bytes.byteLength) !== before.size
      || !stableBigIntMetadataMatches(before, after)
      || !stableBigIntMetadataMatches(directory, directoryAfter)
      || !stableBigIntMetadataMatches(directory, namedDirectory)
      || !stableBigIntMetadataMatches(before, namedConfig)
    ) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment changed while it was read",
      };
    }
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: "Task Map persisted enrollment is malformed",
      };
    }
    const enrollment = validateTaskMapOwnerEnrollment(
      parsed as TaskMapConfirmedOwnerConfig,
      environment,
      homeDirectory,
    );
    return enrollment.ok
      ? { ok: true, owner: confirmPersistedTaskMapOwner(enrollment.owner) }
      : enrollment;
  } catch {
    return {
      ok: false,
      reason: "Task Map confirmed owner enrollment is unavailable",
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
}

/**
 * Bind a persisted bearer to the persisted URL that issued it. Environment
 * values are accepted only as an explicit paired development seam when no
 * credential is present in the owner-only config file.
 */
export function resolveCredentialBoundClient(
  config: LocalFileConfig,
  environment: { deviceCredential?: unknown; apiUrl?: unknown } = {},
): CredentialBoundClientPlan {
  const persistedCredential = typeof config.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  if (DEVICE_CREDENTIAL_RE.test(persistedCredential)) {
    const apiUrl = normalizeApiUrl(config.api_url);
    return apiUrl
      ? { ok: true, deviceCredential: persistedCredential, apiUrl }
      : { ok: false, reason: "persisted device credential requires a safe persisted HTTPS API URL" };
  }

  const environmentCredential = typeof environment.deviceCredential === "string"
    ? environment.deviceCredential.trim()
    : "";
  if (DEVICE_CREDENTIAL_RE.test(environmentCredential)) {
    const apiUrl = normalizeApiUrl(environment.apiUrl);
    return apiUrl
      ? { ok: true, deviceCredential: environmentCredential, apiUrl }
      : { ok: false, reason: "environment device credential requires a safe paired HTTPS API URL" };
  }
  return { ok: false, reason: "No enrolled DaoBrew device credential found" };
}
