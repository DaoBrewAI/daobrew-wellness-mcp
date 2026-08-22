#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  TASKMAP_OWNER_REFRESH_SOURCES,
  type TaskMapOwnerRefreshTrigger,
} from "./owner-refresh-coordinator.js";
import {
  TaskMapNativeRefreshService,
  TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS,
  TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS,
  TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS,
  TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS,
  TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS,
  type TaskMapNativeRefreshResponse,
  type TaskMapNativeRefreshServiceOptions,
  type TaskMapNativeStrategyFallbackOptions,
} from "./native-refresh-service.js";
import type { LlmStation } from "./llm-station.js";
import {
  TASKMAP_STRATEGY_SOURCE_LIMITS_V1,
  type ReadTaskMapStrategySourceAdapterInputV1,
  type TaskMapStrategyRepositoryReadRequestV1,
  type TaskMapStrategyRowBindingV1,
} from "./strategy-source-adapter.js";
import { taskMapContractDigest } from "./source-contracts.js";
import {
  loadConfirmedTaskMapOwner,
  type ConfirmedTaskMapOwner,
} from "../../identity.js";

const execFileAsync = promisify(execFile);
const LOCAL_GIT_EXECUTABLE = "/usr/bin/git";
const ROW_BINDINGS_MAX_BYTES = 128 * 1_024;
const CONTROL_CHARACTER =
  /[\u0000-\u001f\u007f]/u;

type RefreshEnvironment = Readonly<Record<string, string | undefined>>;
export const TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS =
  TASKMAP_NATIVE_COMMUNITY_PLAN_DISCOVERY_BUDGET_MS;
export const TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS =
  TASKMAP_NATIVE_COMMUNITY_PLAN_INFERENCE_BUDGET_MS;
export const TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS =
  TASKMAP_NATIVE_COMMUNITY_PLAN_PUBLICATION_HEADROOM_MS;
export const TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS =
  TASKMAP_NATIVE_COMMUNITY_PLAN_TITLE_BUDGET_MS;
type PackagedStationFactory = (signal?: AbortSignal) => Promise<LlmStation>;

/// The acceptance-store and publication readers require canonical (symlink-
/// free) paths — on macOS the default temp dir lives under /var, a symlink to
/// /private/var, so an unresolved home fails their fail-closed realpath
/// guards. Canonicalize once at the process boundary; the guards stay strict.
function canonicalHomeDirectory(home: string = homedir()): string {
  try {
    return realpathSync.native(home);
  } catch (error) {
    process.stderr.write(
      `taskmap-native-refresh: canonical home unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    return home;
  }
}

export type TaskMapNativeRefreshCommand =
  | { operation: "refresh"; trigger: TaskMapOwnerRefreshTrigger }
  | { operation: "recover" };

export interface TaskMapNativeRecoveryResponse {
  status: "ok";
  operation: "recover";
  recovered: boolean;
}

export interface TaskMapNativeRefreshCommandRuntime {
  requestRefresh(
    trigger: TaskMapOwnerRefreshTrigger,
  ): Promise<TaskMapNativeRefreshResponse>;
  recoverPendingPublication?(): Promise<boolean>;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function explicitAbsolutePath(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length === 0
    || !path.isAbsolute(trimmed)
    || CONTROL_CHARACTER.test(trimmed)
  ) {
    throw new TypeError(`${label} must be an absolute local path`);
  }
  return path.normalize(trimmed);
}

async function readBoundedRegularFile(
  filePath: string,
  maximumBytes: number,
): Promise<Buffer> {
  const metadata = await lstat(filePath);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.size > maximumBytes
  ) {
    throw new Error("Task Map local input is unavailable");
  }
  return readFile(filePath);
}

async function resolveConfirmedOwner(
  environment: RefreshEnvironment,
  homeDirectory: string,
): Promise<ConfirmedTaskMapOwner> {
  const explicitRaw = (environment.DAOBREW_USER_ID ?? "").trim();
  const plan = await loadConfirmedTaskMapOwner(
    homeDirectory,
    {
      ...(explicitRaw.length === 0 ? {} : { userId: explicitRaw }),
      apiUrl: environment.DAOBREW_API_URL,
    },
  );
  if (!plan.ok) {
    throw new Error(plan.reason);
  }
  return plan.owner;
}

function canonicalGitHubRemote(raw: string): string {
  const trimmed = raw.trim();
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(
    trimmed,
  );
  if (ssh !== null) {
    return `https://github.com/${ssh[1]}/${ssh[2]}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Task Map Strategy repository remote is unavailable");
  }
  const segments = parsed.pathname
    .replace(/\.git$/u, "")
    .split("/")
    .filter(Boolean);
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "github.com"
    || parsed.port !== ""
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || segments.length !== 2
  ) {
    throw new Error("Task Map Strategy repository remote is unavailable");
  }
  return `https://github.com/${segments[0]}/${segments[1]}`;
}

async function gitText(
  repositoryRoot: string,
  args: readonly string[],
  maximumBytes: number,
): Promise<string> {
  const result = await execFileAsync(
    LOCAL_GIT_EXECUTABLE,
    [
      "--no-replace-objects",
      "--no-lazy-fetch",
      "-C",
      repositoryRoot,
      ...args,
    ],
    {
      encoding: "utf8",
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_NO_LAZY_FETCH: "1",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
      },
      maxBuffer: maximumBytes,
      timeout: 10_000,
    },
  );
  return result.stdout;
}

async function repositoryProvider(
  repositoryRoot: string,
): Promise<{
  remoteLocator: string;
  readImmutableRepositoryFile(
    request: Readonly<TaskMapStrategyRepositoryReadRequestV1>,
  ): Promise<unknown>;
}> {
  const remoteLocator = canonicalGitHubRemote(
    await gitText(repositoryRoot, ["remote", "get-url", "origin"], 8_192),
  );
  return {
    remoteLocator,
    async readImmutableRepositoryFile(request) {
      if (request.remoteLocator !== remoteLocator) {
        throw new Error("Task Map Strategy repository locator mismatch");
      }
      await gitText(
        repositoryRoot,
        ["cat-file", "-e", `${request.revision}^{commit}`],
        8_192,
      );
      const [content, committedAt] = await Promise.all([
        gitText(
          repositoryRoot,
          [
            "show",
            "--no-ext-diff",
            "--no-textconv",
            `${request.revision}:${request.repositoryRelativePath}`,
          ],
          request.maximumBytes + 1,
        ),
        gitText(
          repositoryRoot,
          ["show", "-s", "--format=%cI", request.revision],
          8_192,
        ).then((value) => value.trim()),
      ]);
      if (Buffer.byteLength(content, "utf8") > request.maximumBytes) {
        throw new Error("Task Map Strategy repository content is too large");
      }
      return {
        remoteLocator,
        revision: request.revision,
        repositoryRelativePath: request.repositoryRelativePath,
        committedAt,
        content,
        contentDigest: sha256(content),
      };
    },
  };
}

export function taskMapNativeRefreshStrategyFallbackFromEnvironment(
  environment: RefreshEnvironment = process.env,
  homeDirectory: string = homedir(),
): TaskMapNativeStrategyFallbackOptions | undefined {
  const rawRepository =
    (environment.DAOBREW_TASKMAP_STRATEGY_REPO ?? "").trim();
  const rawBindings =
    (environment.DAOBREW_TASKMAP_STRATEGY_BINDINGS ?? "").trim();
  if (rawRepository.length === 0 && rawBindings.length === 0) {
    return undefined;
  }
  if (rawRepository.length === 0 || rawBindings.length === 0) {
    throw new TypeError(
      "Strategy refresh requires both local repository and row bindings",
    );
  }
  const normalizedHome = explicitAbsolutePath(
    homeDirectory,
    "homeDirectory",
  );
  const repositoryRoot = explicitAbsolutePath(
    rawRepository,
    "DAOBREW_TASKMAP_STRATEGY_REPO",
  );
  const rowBindingsPath = explicitAbsolutePath(
    rawBindings,
    "DAOBREW_TASKMAP_STRATEGY_BINDINGS",
  );
  return {
    homeDirectory: normalizedHome,
    async readAdapterInput(): Promise<
      ReadTaskMapStrategySourceAdapterInputV1
    > {
      const owner = await resolveConfirmedOwner(
        environment,
        normalizedHome,
      );
      const [
        projectionBytes,
        currentnessBytes,
        rowBindingBytes,
        repository,
      ] = await Promise.all([
        readBoundedRegularFile(
          path.join(owner.taskMapRoot, "taskmap-projection.v1.json"),
          TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumProjectionBytes,
        ),
        readBoundedRegularFile(
          path.join(owner.taskMapRoot, "taskmap-currentness.v1.json"),
          TASKMAP_STRATEGY_SOURCE_LIMITS_V1.maximumCurrentnessBytes,
        ),
        readBoundedRegularFile(
          rowBindingsPath,
          ROW_BINDINGS_MAX_BYTES,
        ),
        repositoryProvider(repositoryRoot),
      ]);
      const rowBindings = JSON.parse(
        rowBindingBytes.toString("utf8"),
      ) as TaskMapStrategyRowBindingV1[];
      return {
        ownerScopeDigest: owner.ownerScopeDigest,
        binding: {
          connectionId: "strategy-owner-local-read",
          sourceKind: "strategy",
          tenantOrWorkspaceDigest: taskMapContractDigest({
            domain: "taskmap-strategy-local-workspace.1",
            remoteLocator: repository.remoteLocator,
          }),
          accountOrPrincipalDigest: owner.ownerScopeDigest,
          grantVersion: "strategy-local-read-v1",
        },
        projectionBytes,
        currentnessBytes,
        expectedProjectionFileDigest: sha256(projectionBytes),
        expectedCurrentnessFileDigest: sha256(currentnessBytes),
        rowBindings,
        repositoryProvider: {
          readImmutableRepositoryFile:
            repository.readImmutableRepositoryFile,
        },
      };
    },
  };
}

export function taskMapNativeRefreshServiceOptionsFromEnvironment(
  confirmedOwner: ConfirmedTaskMapOwner,
  environment: RefreshEnvironment = process.env,
  homeDirectory: string = homedir(),
  createStation?: PackagedStationFactory,
): TaskMapNativeRefreshServiceOptions {
  return {
    confirmedOwner,
    strategyFallback: taskMapNativeRefreshStrategyFallbackFromEnvironment(
      environment,
      homeDirectory,
    ),
    communityPlanDeadlineMs:
      TASKMAP_NATIVE_COMMUNITY_PLAN_DEFAULT_DEADLINE_MS,
    ...(createStation === undefined ? {} : {
      createMeetingExtractionStation: createStation,
      createAgentSessionExtractionStation: createStation,
      createCalendarExtractionStation: createStation,
      createCommunityGroupingStation: createStation,
    }),
  };
}

export function parseTaskMapNativeRefreshCommand(
  argv: readonly string[],
): TaskMapNativeRefreshCommand {
  if (argv.length === 1 && argv[0] === "--recover-only") {
    return { operation: "recover" };
  }
  if (
    argv.length !== 2
    || argv[0] !== "--trigger"
    || (
      argv[1] !== "launch"
      && argv[1] !== "manual"
      && argv[1] !== "timer"
    )
  ) {
    throw new TypeError(
      "usage: native-refresh-cli --trigger launch|manual|timer | --recover-only",
    );
  }
  return { operation: "refresh", trigger: argv[1] };
}

export async function runTaskMapNativeRefreshCommand(
  argv: readonly string[],
  runtime?: TaskMapNativeRefreshCommandRuntime,
): Promise<TaskMapNativeRefreshResponse | TaskMapNativeRecoveryResponse> {
  const command = parseTaskMapNativeRefreshCommand(argv);
  const confirmedOwner = runtime === undefined
    ? await resolveConfirmedOwner(
      process.env,
      canonicalHomeDirectory(),
    )
    : null;
  const activeRuntime = runtime ?? new TaskMapNativeRefreshService(
    taskMapNativeRefreshServiceOptionsFromEnvironment(
      confirmedOwner!,
      process.env,
      canonicalHomeDirectory(),
    ),
  );
  if (command.operation === "recover") {
    if (activeRuntime.recoverPendingPublication === undefined) {
      throw new Error("Task Map publication recovery is unavailable");
    }
    return {
      status: "ok",
      operation: "recover",
      recovered: await activeRuntime.recoverPendingPublication(),
    };
  }
  return activeRuntime.requestRefresh(command.trigger);
}

function safeFailureResponse(nowMs: number): TaskMapNativeRefreshResponse {
  return {
    status: "partial",
    refreshStatus: "unavailable",
    sourceStatuses: TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
      source,
      disposition: "unavailable",
      state: "unavailable",
      lastSuccessAtMs: null,
      nextDueAtMs: null,
      proof: null,
    })),
    requestedAtMs: nowMs,
    nextDueAtMs: nowMs,
    publicationVerified: false,
    publicationBlockReason: "publication_failed",
  };
}

async function main(): Promise<void> {
  const nowMs = Date.now();
  try {
    const response = await runTaskMapNativeRefreshCommand(
      process.argv.slice(2),
    );
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(safeFailureResponse(nowMs))}\n`);
    process.stderr.write(
      `taskmap-native-refresh: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
