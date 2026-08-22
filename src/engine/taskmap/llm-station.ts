import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
} from "./mention-extraction.js";
import type { CredentialBoundClientPlan } from "../../identity.js";
import type { RemoteLlmConsent } from "../local-config.js";

export const LLM_STATION_ID = "mention-extraction-v1" as const;
export const LLM_STATION_IDS = Object.freeze([
  "mention-extraction-v1",
  "identity-adjudication-v1",
  "task-decomposition-v1",
  "community-grouping-v1",
  "community-title-v1",
  "community-task-extraction-v1",
] as const);
export type LlmStationIdV1 = (typeof LLM_STATION_IDS)[number];
export const LLM_STATION_TIMEOUT_MS = 60_000;
export const LLM_STATION_DISCOVERY_TIMEOUT_MS = 5_000;
export const LLM_STATION_MAX_OUTPUT_BYTES = 1_048_576;
export const DEFAULT_LLM_PROVIDER_ORDER = Object.freeze([
  "claude-cli",
  "codex-cli",
  "cursor-cli",
] as const);

export type LlmProviderId =
  | "claude-cli"
  | "codex-cli"
  | "cursor-cli"
  | "gemini-remote";

export interface LlmStationRequest {
  stationId: LlmStationIdV1;
  promptText: string;
  inputDigest: string;
  signal?: AbortSignal;
}

export interface LlmStationEnvelope {
  stationId: LlmStationIdV1;
  model: string;
  promptDigest: string;
  inputDigest: string;
  /** The final model payload, before the caller's mention-schema validation. */
  outputJson: string;
  producedAt: string;
  transport: LlmProviderId;
}

export interface DetectedLlmProvider {
  transport: LlmProviderId;
  executable: string;
  args: readonly string[];
  /** Exact model selector used by the invocation, or `default` for provider default. */
  model: string;
}

export interface LlmStationRunnerRequest {
  executable: string;
  args: readonly string[];
  stdin: string;
  timeoutMs: number;
  signal: AbortSignal;
}

export interface LlmStationRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type LlmStationRunner = (
  request: LlmStationRunnerRequest,
) => Promise<LlmStationRunnerResult>;

export type LlmStationUnavailableReason =
  | "no_provider"
  | "provider_unauthenticated"
  | "provider_rate_limited"
  | "malformed_wrapper"
  | "nonzero_exit"
  | "timeout"
  | "empty_final_output"
  | "invalid_input_digest"
  | "invalid_station"
  | "invalid_clock"
  | "invalid_executable_override"
  | "runner_failure"
  | "remote_consent_required";

export class LlmStationUnavailableError extends Error {
  constructor(
    readonly reason: LlmStationUnavailableReason,
    readonly transport?: LlmProviderId,
    readonly exitCode?: number | null,
  ) {
    super(
      `Task Map LLM station unavailable: ${reason}`
      + (transport === undefined ? "" : ` (${transport})`),
    );
    this.name = "LlmStationUnavailableError";
  }
}

export type LlmExecutableProbe = (
  absolutePath: string,
) => boolean | Promise<boolean>;

export interface LlmProviderDetectionOptions {
  order?: readonly LlmProviderId[];
  executableOverrides?: Partial<Record<LlmProviderId, string>>;
  ownerHome?: string;
  pathEnv?: string;
  isExecutable?: LlmExecutableProbe;
  loginShellRunner?: LlmStationRunner;
  discoveryTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface LlmStationOptions extends LlmProviderDetectionOptions {
  runner?: LlmStationRunner;
  clock?: () => Date;
  timeoutMs?: number;
  remoteConsent?: RemoteLlmConsent;
  remoteCredentialPlan?: CredentialBoundClientPlan;
  remoteFetch?: typeof fetch;
  remoteRequestGroupId?: string;
}

export interface LlmStation {
  readonly provider: DetectedLlmProvider;
  run(request: LlmStationRequest): Promise<LlmStationEnvelope>;
}

interface UnwrappedOutput {
  outputJson: string;
  model?: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CODEX_MODEL = "gpt-5.6-luna";
const PROVIDER_BINARY: Readonly<Record<LlmProviderId, string>> = Object.freeze({
  "claude-cli": "claude",
  "codex-cli": "codex",
  "cursor-cli": "cursor-agent",
  "gemini-remote": "",
});
const PROVIDER_ARGS: Readonly<Record<LlmProviderId, readonly string[]>> =
  Object.freeze({
    "claude-cli": Object.freeze([
      "-p",
      "--model",
      CLAUDE_MODEL,
      "--output-format",
      "json",
      "--no-session-persistence",
      "--tools",
      "",
    ]),
    "codex-cli": Object.freeze([
      "exec",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--model",
      CODEX_MODEL,
      "-c",
      'model_reasoning_effort="low"',
      "--disable",
      "shell_tool",
      "--disable",
      "unified_exec",
      "--disable",
      "browser_use",
      "--disable",
      "in_app_browser",
      "--disable",
      "apps",
      "--disable",
      "plugins",
      "--disable",
      "memories",
      "--disable",
      "multi_agent",
      "-c",
      "mcp_servers={}",
      "--sandbox",
      "read-only",
      "-",
    ]),
    // Cursor has no verified headless invocation in graph-build v1.
    "cursor-cli": Object.freeze([]),
    "gemini-remote": Object.freeze([]),
  });
const PROVIDER_MODEL: Readonly<Record<LlmProviderId, string>> = Object.freeze({
  "claude-cli": CLAUDE_MODEL,
  "codex-cli": CODEX_MODEL,
  "cursor-cli": "unavailable",
  "gemini-remote": "gemini-remote",
});
const PROVIDER_AUTH_ARGS: Readonly<Partial<Record<LlmProviderId, readonly string[]>>> =
  Object.freeze({
    "claude-cli": Object.freeze(["auth", "status"]),
    "codex-cli": Object.freeze(["login", "status"]),
  });
const LOGIN_SHELL_EXECUTABLE = "/bin/zsh";
const LOGIN_SHELL_ARGS = Object.freeze([
  "-lc",
  "command -v claude codex",
] as const);
const LOGIN_SHELL_MAX_OUTPUT_BYTES = 4_096;

export function isValidLlmStationId(value: unknown): value is LlmStationIdV1 {
  return typeof value === "string"
    && (LLM_STATION_IDS as readonly string[]).includes(value);
}

function providerTrustedPaths(
  provider: LlmProviderId,
  ownerHome: string,
): readonly string[] {
  if (provider === "claude-cli") {
    return [
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      path.join(ownerHome, ".local", "bin", "claude"),
    ];
  }
  if (provider === "codex-cli") {
    return [
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      path.join(ownerHome, ".local", "bin", "codex"),
      "/Applications/ChatGPT.app/Contents/Resources/codex",
    ];
  }
  return [];
}

async function defaultExecutableProbe(candidate: string): Promise<boolean> {
  try {
    const details = await stat(candidate);
    if (!details.isFile()) return false;
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function uniqueCandidates(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function providerCandidates(
  provider: LlmProviderId,
  options: Required<Pick<LlmProviderDetectionOptions, "ownerHome" | "pathEnv">>
    & Pick<LlmProviderDetectionOptions, "executableOverrides">,
): string[] {
  const override = options.executableOverrides?.[provider];
  if (override !== undefined && !path.isAbsolute(override)) {
    throw new LlmStationUnavailableError(
      "invalid_executable_override",
      provider,
    );
  }
  const binary = PROVIDER_BINARY[provider];
  const pathCandidates = options.pathEnv
    .split(path.delimiter)
    .filter((entry) => entry.length > 0)
    .map((entry) => path.resolve(entry, binary));
  return uniqueCandidates([
    ...(override === undefined ? [] : [override]),
    ...pathCandidates,
    ...providerTrustedPaths(provider, options.ownerHome),
  ]);
}

async function loginShellProviderCandidates(
  options: LlmProviderDetectionOptions,
  isExecutable: LlmExecutableProbe,
): Promise<ReadonlyMap<LlmProviderId, string>> {
  const timeoutMs = options.discoveryTimeoutMs
    ?? LLM_STATION_DISCOVERY_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return new Map();

  const abortController = new AbortController();
  const abortFromCaller = () => abortController.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (options.signal?.aborted) abortFromCaller();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(new Error("Login-shell provider discovery timed out"));
    }, timeoutMs);
  });
  timer?.unref();

  let result: LlmStationRunnerResult;
  try {
    result = await Promise.race([
      (options.loginShellRunner ?? productionLlmStationRunner)({
        executable: LOGIN_SHELL_EXECUTABLE,
        args: LOGIN_SHELL_ARGS,
        stdin: "",
        timeoutMs,
        signal: abortController.signal,
      }),
      timeout,
    ]);
  } catch {
    return new Map();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
  if (
    (result.exitCode !== 0 && result.exitCode !== 1)
    || Buffer.byteLength(result.stdout, "utf8") > LOGIN_SHELL_MAX_OUTPUT_BYTES
    || /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(result.stdout)
  ) {
    return new Map();
  }

  const lines = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length > 2 || lines.some((line) => line !== line.trim())) {
    return new Map();
  }

  const providers = new Map<LlmProviderId, string>();
  for (const candidate of lines) {
    if (!path.isAbsolute(candidate)) return new Map();
    const binary = path.basename(candidate);
    const provider = binary === PROVIDER_BINARY["claude-cli"]
      ? "claude-cli"
      : binary === PROVIDER_BINARY["codex-cli"]
        ? "codex-cli"
        : undefined;
    if (provider === undefined || providers.has(provider)) return new Map();
    let available = false;
    try {
      available = await isExecutable(candidate);
    } catch {
      return new Map();
    }
    if (!available) return new Map();
    providers.set(provider, candidate);
  }
  return providers;
}

/** Resolve one provider deterministically. Cursor is deliberately unsupported. */
export async function detectProvider(
  options: LlmProviderDetectionOptions = {},
): Promise<DetectedLlmProvider> {
  const order = options.order ?? DEFAULT_LLM_PROVIDER_ORDER;
  const ownerHome = options.ownerHome ?? homedir();
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const isExecutable = options.isExecutable ?? defaultExecutableProbe;
  const seen = new Set<LlmProviderId>();
  let loginShellProviders: ReadonlyMap<LlmProviderId, string> | undefined;

  for (const provider of order) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    // Task 0 found no Cursor headless CLI. An executable name alone is not proof
    // of a safe non-interactive invocation, so v1 never guesses one.
    if (provider === "cursor-cli" || provider === "gemini-remote") continue;
    const candidates = providerCandidates(provider, {
      executableOverrides: options.executableOverrides,
      ownerHome,
      pathEnv,
    });
    for (const candidate of candidates) {
      let available = false;
      try {
        available = await isExecutable(candidate);
      } catch {
        available = false;
      }
      if (!available) continue;
      return Object.freeze({
        transport: provider,
        executable: candidate,
        args: PROVIDER_ARGS[provider],
        model: PROVIDER_MODEL[provider],
      });
    }

    loginShellProviders ??= await loginShellProviderCandidates(
      options,
      isExecutable,
    );
    const executable = loginShellProviders.get(provider);
    if (executable === undefined) continue;
    return Object.freeze({
      transport: provider,
      executable,
      args: PROVIDER_ARGS[provider],
      model: PROVIDER_MODEL[provider],
    });
  }

  throw new LlmStationUnavailableError("no_provider");
}

export function strictLlmProducedAt(clock: () => Date): string {
  let instant: Date;
  try {
    instant = clock();
  } catch {
    throw new LlmStationUnavailableError("invalid_clock");
  }
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
    throw new LlmStationUnavailableError("invalid_clock");
  }
  let producedAt: string;
  try {
    producedAt = instant.toISOString();
  } catch {
    throw new LlmStationUnavailableError("invalid_clock");
  }
  if (!STRICT_RFC3339.test(producedAt) || !Number.isFinite(Date.parse(producedAt))) {
    throw new LlmStationUnavailableError("invalid_clock");
  }
  return producedAt;
}

function unwrapClaude(stdout: string): UnwrappedOutput {
  let wrapper: unknown;
  try {
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(stdout.trim());
    wrapper = JSON.parse(stdout.trim());
  } catch {
    throw new LlmStationUnavailableError(
      "malformed_wrapper",
      "claude-cli",
    );
  }
  if (
    wrapper === null
    || Array.isArray(wrapper)
    || typeof wrapper !== "object"
    || (wrapper as Record<string, unknown>).type !== "result"
  ) {
    throw new LlmStationUnavailableError(
      "malformed_wrapper",
      "claude-cli",
    );
  }
  const record = wrapper as Record<string, unknown>;
  if (
    record.is_error === true
    && typeof record.result === "string"
    && /(?:usage|rate)\s*limit/i.test(record.result)
  ) {
    throw new LlmStationUnavailableError(
      "provider_rate_limited",
      "claude-cli",
    );
  }
  if (
    record.is_error === true
    || (typeof record.subtype === "string" && record.subtype !== "success")
  ) {
    throw new LlmStationUnavailableError(
      "malformed_wrapper",
      "claude-cli",
    );
  }
  const result = typeof record.result === "string" ? record.result : undefined;
  if (result === undefined) {
    throw new LlmStationUnavailableError(
      "malformed_wrapper",
      "claude-cli",
    );
  }
  return { outputJson: result };
}

function boundedModel(value: unknown): string | undefined {
  return typeof value === "string"
      && value.length > 0
      && value.length <= 256
      && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : undefined;
}

function unwrapCodex(stdout: string): UnwrappedOutput {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let outputJson: string | undefined;
  let model: string | undefined;
  for (const line of lines) {
    let event: unknown;
    try {
      assertTaskMapStrictJsonSyntaxAndUniqueKeys(line);
      event = JSON.parse(line);
    } catch {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "codex-cli",
      );
    }
    if (event === null || Array.isArray(event) || typeof event !== "object") {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "codex-cli",
      );
    }
    const record = event as Record<string, unknown>;
    model = boundedModel(record.model) ?? model;
    if (record.type !== "item.completed") continue;
    const item = record.item;
    if (item === null || Array.isArray(item) || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    model = boundedModel(itemRecord.model) ?? model;
    if (itemRecord.type !== "agent_message") continue;
    if (typeof itemRecord.text !== "string") {
      throw new LlmStationUnavailableError(
        "malformed_wrapper",
        "codex-cli",
      );
    }
    outputJson = itemRecord.text;
  }
  return { outputJson: outputJson ?? "", ...(model === undefined ? {} : { model }) };
}

function unwrapProviderOutput(
  provider: DetectedLlmProvider,
  stdout: string,
): UnwrappedOutput {
  return provider.transport === "claude-cli"
    ? unwrapClaude(stdout)
    : unwrapCodex(stdout);
}

const MODEL_OUTPUT_FENCE =
  /^\s*```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/i;

/**
 * Tolerantly removes exactly one outer markdown code fence (```json or bare
 * ```) that some models wrap around their final payload despite prompt
 * instructions. One pass, outermost pair only, inner content byte-preserved.
 * Everything else — interior fences, trailing prose, single-line fences —
 * passes through unchanged into the unchanged strict validation chain.
 */
export function stripTaskMapModelOutputFences(outputText: string): string {
  const match = MODEL_OUTPUT_FENCE.exec(outputText);
  return match === null ? outputText : match[1]!;
}

function abortError(): Error {
  const error = new Error("LLM station runner aborted");
  error.name = "AbortError";
  return error;
}

/** Spawn without a shell; abort terminates the child and escalates if necessary. */
export const productionLlmStationRunner: LlmStationRunner = (request) =>
  new Promise((resolve, reject) => {
    const isolatesProcessGroup = process.platform !== "win32";
    const child = spawn(request.executable, [...request.args], {
      stdio: ["pipe", "pipe", "pipe"],
      detached: isolatesProcessGroup,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let forceKill: ReturnType<typeof setTimeout> | undefined;

    const finish = (
      error?: Error,
      result?: LlmStationRunnerResult,
      preserveForceKill = false,
    ): void => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener("abort", terminate);
      if (forceKill !== undefined && !preserveForceKill) clearTimeout(forceKill);
      if (error !== undefined) reject(error);
      else resolve(result as LlmStationRunnerResult);
    };
    const signalProcessTree = (signal: NodeJS.Signals): void => {
      let groupSignaled = false;
      const pid = child.pid;
      if (
        isolatesProcessGroup
        && Number.isSafeInteger(pid)
        && (pid ?? 0) > 0
      ) {
        try {
          process.kill(-(pid as number), signal);
          groupSignaled = true;
        } catch {
          // ESRCH, missing permission, and platform gaps all take the safe
          // direct-child fallback below.
        }
      }
      if (groupSignaled) return;
      try {
        child.kill(signal);
      } catch {
        // The child may have closed between the bounded runner checks.
      }
    };
    const terminateWith = (error: Error): void => {
      if (settled) return;
      signalProcessTree("SIGTERM");
      forceKill = setTimeout(() => {
        // The direct child may already be closed while a descendant remains
        // in the isolated group, so escalation must always target the group.
        signalProcessTree("SIGKILL");
      }, 250);
      forceKill.unref();
      // The promise may reject immediately, but the independent escalation
      // timer must survive settlement until a stubborn child is terminated.
      finish(error, undefined, true);
    };
    const terminate = (): void => terminateWith(abortError());
    const outputLimitError = (): Error =>
      new Error("LLM station runner exceeded bounded output limit");

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > LLM_STATION_MAX_OUTPUT_BYTES) {
        terminateWith(outputLimitError());
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderrBytes += chunk.length;
      if (stderrBytes > LLM_STATION_MAX_OUTPUT_BYTES) {
        terminateWith(outputLimitError());
        return;
      }
      stderrChunks.push(chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        const stdout = decoder.decode(Buffer.concat(stdoutChunks));
        const stderr = new TextDecoder("utf-8", { fatal: true })
          .decode(Buffer.concat(stderrChunks));
        finish(undefined, { stdout, stderr, exitCode: code });
      } catch {
        finish(new Error("LLM station runner received invalid UTF-8"));
      }
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE" && error.code !== "ECONNRESET") finish(error);
    });
    request.signal.addEventListener("abort", terminate, { once: true });
    if (request.signal.aborted) {
      terminate();
      return;
    }
    child.stdin.end(request.stdin);
  });

class FixedProviderLlmStation implements LlmStation {
  constructor(
    readonly provider: DetectedLlmProvider,
    private readonly runner: LlmStationRunner,
    private readonly clock: () => Date,
    private readonly timeoutMs: number,
  ) {}

  async run(request: LlmStationRequest): Promise<LlmStationEnvelope> {
    if (!isValidLlmStationId(request.stationId)) {
      throw new LlmStationUnavailableError(
        "invalid_station",
        this.provider.transport,
      );
    }
    if (typeof request.inputDigest !== "string" || !SHA256.test(request.inputDigest)) {
      throw new LlmStationUnavailableError(
        "invalid_input_digest",
        this.provider.transport,
      );
    }
    const abortController = new AbortController();
    const abortFromCaller = () => abortController.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (request.signal?.aborted) abortFromCaller();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new LlmStationUnavailableError(
          "timeout",
          this.provider.transport,
        ));
        abortController.abort();
      }, this.timeoutMs);
    });
    timer?.unref();

    let result: LlmStationRunnerResult;
    try {
      result = await Promise.race([
        this.runner({
          executable: this.provider.executable,
          args: this.provider.args,
          stdin: request.promptText,
          timeoutMs: this.timeoutMs,
          signal: abortController.signal,
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof LlmStationUnavailableError) throw error;
      if (abortController.signal.aborted) {
        throw new LlmStationUnavailableError(
          "timeout",
          this.provider.transport,
        );
      }
      throw new LlmStationUnavailableError(
        "runner_failure",
        this.provider.transport,
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (result.exitCode !== 0) {
      throw new LlmStationUnavailableError(
        "nonzero_exit",
        this.provider.transport,
        result.exitCode,
      );
    }
    const finalOutput = unwrapProviderOutput(this.provider, result.stdout);
    const outputJson = stripTaskMapModelOutputFences(finalOutput.outputJson);
    if (outputJson.trim().length === 0) {
      throw new LlmStationUnavailableError(
        "empty_final_output",
        this.provider.transport,
      );
    }

    return Object.freeze({
      stationId: request.stationId,
      model: finalOutput.model ?? this.provider.model,
      promptDigest: taskMapContractDigest(request.promptText),
      inputDigest: request.inputDigest,
      outputJson,
      producedAt: strictLlmProducedAt(this.clock),
      transport: this.provider.transport,
    });
  }
}

const PREBINDING_RETRYABLE_REASONS = new Set<LlmStationUnavailableReason>([
  "provider_unauthenticated",
  "provider_rate_limited",
  "malformed_wrapper",
  "nonzero_exit",
  "timeout",
  "empty_final_output",
  "runner_failure",
]);

/**
 * Authentication proves account state, not that inference is currently usable.
 * Keep selection provisional through the first successful request, then pin the
 * transport for the rest of the refresh so later failures cannot silently mix
 * providers inside one station lifetime.
 */
class PrebindingLlmStation implements LlmStation {
  private currentIndex: number;
  private currentStation: LlmStation;
  private bound = false;

  constructor(
    private readonly candidates: readonly DetectedLlmProvider[],
    initialIndex: number,
    private readonly runner: LlmStationRunner,
    private readonly clock: () => Date,
    private readonly timeoutMs: number,
    private readonly remoteStation?: LlmStation,
    private readonly terminalError?: LlmStationUnavailableError,
  ) {
    this.currentIndex = initialIndex;
    this.currentStation = this.fixedStation(candidates[initialIndex]!);
  }

  get provider(): DetectedLlmProvider {
    return this.currentStation.provider;
  }

  private fixedStation(provider: DetectedLlmProvider): LlmStation {
    if (provider.transport === "gemini-remote") {
      if (this.remoteStation === undefined) {
        throw new LlmStationUnavailableError(
          "provider_unauthenticated",
          "gemini-remote",
        );
      }
      return this.remoteStation;
    }
    return new FixedProviderLlmStation(
      provider,
      this.runner,
      this.clock,
      this.timeoutMs,
    );
  }

  async run(request: LlmStationRequest): Promise<LlmStationEnvelope> {
    if (request.signal?.aborted) {
      throw new LlmStationUnavailableError("timeout");
    }
    if (this.bound) return this.currentStation.run(request);

    let lastInferenceError: LlmStationUnavailableError | undefined;
    for (let index = this.currentIndex; index < this.candidates.length; index += 1) {
      const provider = this.candidates[index]!;
      if (index !== this.currentIndex) {
        try {
          await authenticateProvider(
            provider,
            this.runner,
            this.timeoutMs,
            request.signal,
          );
        } catch (error) {
          if (
            error instanceof LlmStationUnavailableError
            && error.reason === "provider_unauthenticated"
          ) {
            continue;
          }
          throw error;
        }
        this.currentIndex = index;
        this.currentStation = this.fixedStation(provider);
      }

      try {
        const envelope = await this.currentStation.run(request);
        this.bound = true;
        return envelope;
      } catch (error) {
        if (
          !(error instanceof LlmStationUnavailableError)
          || !PREBINDING_RETRYABLE_REASONS.has(error.reason)
        ) {
          throw error;
        }
        lastInferenceError = error;
      }
    }
    if (this.terminalError !== undefined) throw this.terminalError;
    if (lastInferenceError !== undefined) throw lastInferenceError;
    throw new LlmStationUnavailableError(
      "provider_unauthenticated",
      this.provider.transport,
    );
  }
}

async function authenticateProvider(
  provider: DetectedLlmProvider,
  runner: LlmStationRunner,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (provider.transport === "gemini-remote") return;
  const args = PROVIDER_AUTH_ARGS[provider.transport];
  if (args === undefined) {
    throw new LlmStationUnavailableError(
      "provider_unauthenticated",
      provider.transport,
    );
  }
  const abortController = new AbortController();
  const abortFromCaller = () => abortController.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (signal?.aborted) abortFromCaller();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(new Error("Provider authentication probe timed out"));
    }, timeoutMs);
  });
  timer?.unref();

  let result: LlmStationRunnerResult;
  try {
    result = await Promise.race([
      runner({
        executable: provider.executable,
        args,
        stdin: "",
        timeoutMs,
        signal: abortController.signal,
      }),
      timeout,
    ]);
  } catch {
    throw new LlmStationUnavailableError(
      "provider_unauthenticated",
      provider.transport,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
  if (result.exitCode !== 0) {
    throw new LlmStationUnavailableError(
      "provider_unauthenticated",
      provider.transport,
    );
  }
  if (provider.transport === "claude-cli") {
    let status: unknown;
    try {
      status = JSON.parse(result.stdout);
    } catch {
      status = undefined;
    }
    if (
      status !== null
      && typeof status === "object"
      && !Array.isArray(status)
      && (status as Record<string, unknown>).loggedIn === false
    ) {
      throw new LlmStationUnavailableError(
        "provider_unauthenticated",
        provider.transport,
      );
    }
  }
  if (
    provider.transport === "codex-cli"
    && /\bnot logged in\b/i.test(result.stdout)
  ) {
    throw new LlmStationUnavailableError(
      "provider_unauthenticated",
      provider.transport,
    );
  }
}

/**
 * Select the first authenticated provider, but keep that choice provisional
 * until its first inference succeeds. A refresh that wants to re-detect after
 * the station is bound creates a new station explicitly.
 */
export async function createLlmStation(
  options: LlmStationOptions = {},
): Promise<LlmStation> {
  const assertNotAborted = (): void => {
    if (options.signal?.aborted) {
      throw new LlmStationUnavailableError("timeout");
    }
  };
  assertNotAborted();
  const timeoutMs = options.timeoutMs ?? LLM_STATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("LLM station timeoutMs must be positive");
  }
  const runner = options.runner ?? productionLlmStationRunner;
  const clock = options.clock ?? (() => new Date());
  const order = options.order ?? DEFAULT_LLM_PROVIDER_ORDER;
  const seen = new Set<LlmProviderId>();
  const candidates: DetectedLlmProvider[] = [];
  let lastAuthenticationError: LlmStationUnavailableError | undefined;
  let remoteStation: LlmStation | undefined;
  let terminalError: LlmStationUnavailableError | undefined;

  // Executable discovery is not provider readiness. Collect the deterministic
  // local candidates first so the provisional station can recover from either
  // an auth failure or a first-inference availability failure.
  for (const transport of order) {
    assertNotAborted();
    if (seen.has(transport)) continue;
    seen.add(transport);

    let provider: DetectedLlmProvider;
    try {
      provider = await detectProvider({ ...options, order: [transport] });
      assertNotAborted();
    } catch (error) {
      if (
        error instanceof LlmStationUnavailableError
        && error.reason === "no_provider"
      ) {
        continue;
      }
      throw error;
    }

    candidates.push(provider);
  }

  const {
    GeminiRemoteLlmStation,
    resolveTaskMapRemoteLlmPlan,
  } = await import("./gemini-remote.js");
  const remotePlan = resolveTaskMapRemoteLlmPlan({
    remoteConsent: options.remoteConsent,
    remoteCredentialPlan: options.remoteCredentialPlan,
  });
  if (remotePlan.consent === "granted") {
    if (remotePlan.credentialPlan.ok) {
      remoteStation = new GeminiRemoteLlmStation({
        credentialPlan: remotePlan.credentialPlan,
        fetchImpl: options.remoteFetch,
        clock,
        timeoutMs,
        requestGroupId: options.remoteRequestGroupId,
      });
      candidates.push(remoteStation.provider);
    } else {
      terminalError = new LlmStationUnavailableError(
        "provider_unauthenticated",
        "gemini-remote",
      );
    }
  } else if (remotePlan.consent === "undecided") {
    terminalError = new LlmStationUnavailableError(
      "remote_consent_required",
    );
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const provider = candidates[index]!;
    try {
      assertNotAborted();
      await authenticateProvider(provider, runner, timeoutMs, options.signal);
      assertNotAborted();
    } catch (error) {
      if (
        error instanceof LlmStationUnavailableError
        && error.reason === "provider_unauthenticated"
      ) {
        lastAuthenticationError = error;
        continue;
      }
      throw error;
    }
    return new PrebindingLlmStation(
      candidates,
      index,
      runner,
      clock,
      timeoutMs,
      remoteStation,
      terminalError,
    );
  }
  if (terminalError !== undefined) throw terminalError;
  if (lastAuthenticationError !== undefined) throw lastAuthenticationError;
  throw new LlmStationUnavailableError("no_provider");
}
