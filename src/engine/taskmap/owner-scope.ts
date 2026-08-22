import { createHash } from "node:crypto";
import path from "node:path";

import { canonicalUserId } from "../../user-id.js";

export const TASKMAP_OWNER_SCOPE_DOMAIN =
  "taskmap-owner-scope.v1" as const;

const SHA256 = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export interface TaskMapOwnerScope {
  readonly userId: string;
  readonly ownerScopeDigest: string;
  readonly homeDirectory: string;
  readonly ownerRoot: string;
  readonly runtimeRoot: string;
  readonly taskMapRoot: string;
  readonly sourceRoot: string;
}

export function taskMapOwnerScopeDigest(userId: string): string {
  const canonical = canonicalUserId(userId);
  if (canonical === null || userId !== canonical) {
    throw new Error("Task Map owner identity must be a canonical uppercase UUID");
  }
  return createHash("sha256")
    .update(`${TASKMAP_OWNER_SCOPE_DOMAIN}\0${canonical}`, "utf8")
    .digest("hex");
}

export function createTaskMapOwnerScope(
  userId: string,
  homeDirectory: string,
): TaskMapOwnerScope {
  if (
    typeof homeDirectory !== "string"
    || !path.isAbsolute(homeDirectory)
    || path.normalize(homeDirectory) !== homeDirectory
    || CONTROL_CHARACTER.test(homeDirectory)
  ) {
    throw new Error("Task Map home directory must be normalized and absolute");
  }
  const ownerScopeDigest = taskMapOwnerScopeDigest(userId);
  const ownerRoot = path.join(
    homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "owners",
    ownerScopeDigest,
  );
  return Object.freeze({
    userId,
    ownerScopeDigest,
    homeDirectory,
    ownerRoot,
    runtimeRoot: path.join(ownerRoot, "taskmap-refresh"),
    taskMapRoot: path.join(ownerRoot, "taskmap"),
    sourceRoot: path.join(ownerRoot, "sources"),
  });
}

export function assertTaskMapOwnerScope(
  value: unknown,
): asserts value is TaskMapOwnerScope {
  if (value === null || typeof value !== "object") {
    throw new Error("Task Map owner scope is unavailable");
  }
  const scope = value as Record<string, unknown>;
  if (
    typeof scope.userId !== "string"
    || typeof scope.ownerScopeDigest !== "string"
    || !SHA256.test(scope.ownerScopeDigest)
    || scope.ownerScopeDigest !== taskMapOwnerScopeDigest(scope.userId)
  ) {
    throw new Error("Task Map owner scope binding is invalid");
  }
  const expected = createTaskMapOwnerScope(
    scope.userId,
    String(scope.homeDirectory),
  );
  for (const key of [
    "homeDirectory",
    "ownerRoot",
    "runtimeRoot",
    "taskMapRoot",
    "sourceRoot",
  ] as const) {
    if (scope[key] !== expected[key]) {
      throw new Error("Task Map owner scope paths are invalid");
    }
  }
}
