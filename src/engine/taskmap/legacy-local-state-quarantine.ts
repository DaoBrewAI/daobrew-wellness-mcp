import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type Stats,
} from "node:fs";
import path from "node:path";

import {
  summarizeTaskMapLocalLifecycleHistory,
  taskMapLocalCompletionOverlayCanonicalBytes,
  taskMapLocalLifecycleDecisionCanonicalBytes,
  type TaskMapLocalCompletionOverlayV1,
  type TaskMapLocalLifecycleDecisionV1,
} from "./local-completion-overlay.js";
import { taskMapContractDigest } from "./source-contracts.js";

export const TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE =
  "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED" as const;

const MAX_DECISIONS = 256;
const MAX_DECISION_BYTES = 64 * 1024;
const MAX_OVERLAY_BYTES = 4 * 1024 * 1024;
const LOCAL_OWNER_DOMAIN = "taskmap-local-os-owner.1";

export class TaskMapLegacyLocalStateQuarantineError extends Error {
  readonly code = TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE;

  constructor() {
    super("Task Map local lifecycle state is unavailable pending migration");
    this.name = "TaskMapLegacyLocalStateQuarantineError";
  }
}

export interface TaskMapLegacyLocalStateQuarantineV1 {
  legacyOwnerScopeDigest: string;
  activeTerminalTaskIds: string[];
}

function quarantine(): never {
  throw new TaskMapLegacyLocalStateQuarantineError();
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function statOrNull(valuePath: string): Stats | null {
  try {
    return lstatSync(valuePath);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return null;
    return quarantine();
  }
}

function expectedUid(stat: Stats): number {
  return typeof process.getuid === "function" ? process.getuid() : stat.uid;
}

function assertPrivateDirectory(directory: string): void {
  const stat = statOrNull(directory);
  if (
    stat === null
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || stat.uid !== expectedUid(stat)
    || (stat.mode & 0o777) !== 0o700
  ) {
    quarantine();
  }
  try {
    if (realpathSync(directory) !== directory) quarantine();
  } catch {
    quarantine();
  }
}

function readPrivateCanonicalFile(
  filePath: string,
  maximumBytes: number,
): Buffer | null {
  if (statOrNull(filePath) === null) return null;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.uid !== expectedUid(before)
      || before.nlink !== 1
      || (before.mode & 0o777) !== 0o600
      || before.size < 2
      || before.size > maximumBytes
    ) {
      quarantine();
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || bytes.length !== before.size
    ) {
      quarantine();
    }
    return bytes;
  } catch (error) {
    if (
      error instanceof TaskMapLegacyLocalStateQuarantineError
    ) {
      throw error;
    }
    return quarantine();
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    quarantine();
  }
}

function decisionId(value: TaskMapLocalLifecycleDecisionV1): string {
  switch (value.decision) {
    case "close": return value.closeDecisionId;
    case "reopen": return value.reopenDecisionId;
    case "complete_elsewhere":
      return value.externalCompletionDecisionId;
    case "reopen_external_completion":
      return value.externalReopenDecisionId;
  }
}

function readLegacyDecisions(
  decisionsRoot: string,
): TaskMapLocalLifecycleDecisionV1[] | null {
  if (statOrNull(decisionsRoot) === null) return null;
  assertPrivateDirectory(decisionsRoot);
  let names: string[];
  try {
    names = readdirSync(decisionsRoot).sort();
  } catch {
    quarantine();
  }
  if (names.length === 0) return [];
  if (names.length > MAX_DECISIONS) quarantine();
  return names.map((name) => {
    if (!/^[A-Za-z0-9._-]{1,256}\.json$/.test(name)) quarantine();
    const filePath = path.join(decisionsRoot, name);
    const bytes = readPrivateCanonicalFile(
      filePath,
      MAX_DECISION_BYTES,
    );
    if (bytes === null) quarantine();
    const value = parseJson(bytes);
    let canonical: Buffer;
    try {
      canonical = taskMapLocalLifecycleDecisionCanonicalBytes(value);
    } catch {
      quarantine();
    }
    if (!bytes.equals(canonical)) quarantine();
    const decision = value as TaskMapLocalLifecycleDecisionV1;
    if (name !== `${decisionId(decision)}.json`) quarantine();
    return decision;
  });
}

/**
 * Read and validate pre-owner lifecycle state as a separate quarantine lane.
 * The returned task IDs may be suppressed as unresolved legacy terminals, but
 * the old decisions are never attributed to the current owner or rewritten.
 */
export function inspectTaskMapLegacyLocalState(input: {
  homeDirectory: string;
  ownerRoot: string;
}): TaskMapLegacyLocalStateQuarantineV1 | null {
  if (
    !path.isAbsolute(input.homeDirectory)
    || path.normalize(input.homeDirectory) !== input.homeDirectory
    || !path.isAbsolute(input.ownerRoot)
    || path.normalize(input.ownerRoot) !== input.ownerRoot
  ) {
    quarantine();
  }
  const legacyExecutionRoot = path.join(
    input.homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap-local-execution",
  );
  if (statOrNull(legacyExecutionRoot) === null) return null;
  assertPrivateDirectory(legacyExecutionRoot);

  const decisions = readLegacyDecisions(path.join(
    legacyExecutionRoot,
    "completion-decisions",
  ));
  let overlay: TaskMapLocalCompletionOverlayV1 | null = null;
  const overlayBytes = decisions !== null && decisions.length > 0
    ? null
    : readPrivateCanonicalFile(
        path.join(legacyExecutionRoot, "completion-overlay.v1.json"),
        MAX_OVERLAY_BYTES,
      );
  if (overlayBytes !== null) {
    const value = parseJson(overlayBytes);
    let canonical: Buffer;
    try {
      canonical = taskMapLocalCompletionOverlayCanonicalBytes(
        value as TaskMapLocalCompletionOverlayV1,
      );
    } catch {
      quarantine();
    }
    if (!overlayBytes.equals(canonical)) quarantine();
    overlay = value as TaskMapLocalCompletionOverlayV1;
  }

  const history = decisions !== null && decisions.length > 0
    ? decisions
    : overlay?.completionHistory ?? [];
  if (history.length === 0) {
    // An empty private directory is not lifecycle state. Any unaccounted file
    // is rejected above instead of becoming an implicit migration signal.
    return null;
  }
  // Immutable decision files are authority. A stale derived overlay is not
  // read when those files exist; crash residue must not globally block
  // unrelated current-owner work.
  let summary: ReturnType<typeof summarizeTaskMapLocalLifecycleHistory>;
  try {
    summary = summarizeTaskMapLocalLifecycleHistory(history);
  } catch {
    quarantine();
  }
  if (
    overlay !== null
    && overlay.localOwnerScopeDigest !== summary.localOwnerScopeDigest
  ) {
    quarantine();
  }
  const legacyOwnerScopeDigest = taskMapContractDigest({
    domain: LOCAL_OWNER_DOMAIN,
    uid: expectedUid(lstatSync(legacyExecutionRoot)).toString(10),
    ownerRoot: path.dirname(legacyExecutionRoot),
  });
  if (summary.localOwnerScopeDigest !== legacyOwnerScopeDigest) {
    quarantine();
  }
  return Object.freeze({
    legacyOwnerScopeDigest,
    activeTerminalTaskIds: [...summary.activeTerminalTaskIds],
  });
}

/**
 * Compatibility entrypoint for both product CLIs. Valid legacy state is
 * quarantined per task instead of disabling every unrelated owner action.
 */
export function assertNoUnmigratedTaskMapLegacyLocalState(input: {
  homeDirectory: string;
  ownerRoot: string;
  selectedTaskId?: string;
}): TaskMapLegacyLocalStateQuarantineV1 | null {
  const quarantineState = inspectTaskMapLegacyLocalState(input);
  if (
    input.selectedTaskId !== undefined
    && quarantineState?.activeTerminalTaskIds.includes(input.selectedTaskId)
  ) {
    quarantine();
  }
  return quarantineState;
}
