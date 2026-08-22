import {
  Element, WellnessState, ElementDetail, SessionStart,
  SessionResult, SessionHistoryEntry, HealthSampleDTO, BreathState,
  HealthkitHistory, StateHistory,
} from "./types.js";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_API_URL,
  isValidDeviceCredential,
  normalizeApiUrl,
} from "./enrollment.js";
import { REQUIRED_BACKEND_CONTRACT_VERSION } from "./backend-contract.js";

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * The request body uses stdin so wide wearable backfills never hit macOS'
 * argv limit. Authorization headers use inherited fd 3 so the bearer token is
 * absent from curl's argv/process listing and does not compete with body stdin.
 * A random 0700 directory and 0600 header file avoid Node's platform-specific
 * extra-pipe semantics; the path, but never the credential, appears in argv.
 * Both are removed as soon as curl exits or the request times out.
 */
function execCurl(
  spec: CurlRequestSpec,
  timeoutMs: number,
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const headerDir = mkdtempSync(join(tmpdir(), "daobrew-curl-"));
    const headerPath = join(headerDir, "headers");
    try {
      writeFileSync(headerPath, spec.headerInput, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (error) {
      rmSync(headerDir, { force: true, recursive: true });
      throw error;
    }

    const args = spec.args.map((arg) => arg === "@/dev/fd/3" ? `@${headerPath}` : arg);
    let child;
    try {
      child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      rmSync(headerDir, { force: true, recursive: true });
      throw error;
    }
    const { stdin, stdout: childStdout, stderr: childStderr } = child;
    if (!stdin || !childStdout || !childStderr) {
      child.kill("SIGTERM");
      throw new Error("could not open curl request streams");
    }
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rmSync(headerDir, { force: true, recursive: true });
      if (error) reject(error);
      else resolve({ stdout });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`curl timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    childStdout.setEncoding("utf8");
    childStderr.setEncoding("utf8");
    childStdout.on("data", (chunk: string) => { stdout += chunk; });
    childStderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `curl exited with ${signal ?? code}`));
    });
    stdin.on("error", (error: NodeJS.ErrnoException) => {
      // curl may close stdin after an HTTP/network failure; the close handler
      // carries the useful curl error in that case.
      if (error.code !== "EPIPE" && error.code !== "ECONNRESET") finish(error);
    });
    stdin.end(spec.body ?? "");
  });
}

export interface ClientConfig {
  deviceCredential: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface CurlRequestSpec {
  args: string[];
  headerInput: string;
  body?: string;
}

export interface CausalRunResponse {
  principal: { user_id: string; device_id: string };
  summary: {
    status: "written" | "skipped_done" | "no_signal" | "dry_run";
    [key: string]: unknown;
  };
}

export interface GraphSnapshotResponse {
  schema_version: 1;
  principal: { user_id: string; device_id: string };
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  node_count: number;
  edge_count: number;
  ghost_status_counts?: Record<string, number>;
}

interface BackendVersionResponse {
  contract_version: number;
}

export function buildCurlRequestSpec(
  config: ClientConfig,
  path: string,
  options: { method?: string; body?: string } = {},
): CurlRequestSpec {
  const credential = config.deviceCredential.trim();
  if (!isValidDeviceCredential(credential)) {
    throw new Error("DaoBrew device credential is invalid; enroll this installation first");
  }
  const baseUrl = normalizeApiUrl(config.baseUrl ?? DEFAULT_API_URL);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = [
    "-sS", "--fail-with-body", "--max-time", String(Math.ceil(timeoutMs / 1000)),
    "-H", "Content-Type: application/json",
    "-H", "@/dev/fd/3",
  ];
  if (options.method === "POST") {
    args.push("-X", "POST");
    if (options.body !== undefined) args.push("--data-binary", "@-");
  }
  args.push(`${baseUrl}${path}`);

  const headers = [`Authorization: Bearer ${credential}`];
  return {
    args,
    headerInput: `${headers.join("\n")}\n`,
    ...(options.body !== undefined ? { body: options.body } : {}),
  };
}

export class DaoBrewClient {
  private config: ClientConfig;
  private timeoutMs: number;

  constructor(config: ClientConfig) {
    // Validate at construction so callers fail closed before a sync starts.
    buildCurlRequestSpec(config, "/");
    this.config = {
      ...config,
      baseUrl: normalizeApiUrl(config.baseUrl ?? DEFAULT_API_URL),
      deviceCredential: config.deviceCredential.trim(),
    };
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
    const timeoutMs = this.timeoutMs + 2000;
    const spec = buildCurlRequestSpec(this.config, path, options);
    const { stdout } = await execCurl(spec, timeoutMs);
    const json = JSON.parse(stdout) as any;
    if (json.success === false) {
      throw new Error(`DaoBrew API error: ${json.error?.message ?? json.error ?? "Unknown error"}`);
    }
    return json.data as T;
  }

  async getWellnessState(): Promise<WellnessState> {
    return this.request<WellnessState>("/state/current?format=mcp");
  }

  async assertBackendCompatible(): Promise<number> {
    const payload = await this.request<BackendVersionResponse>("/version");
    const actual = payload?.contract_version;
    if (typeof actual !== "number" || !Number.isSafeInteger(actual)) {
      throw new Error("DaoBrew backend version response is invalid");
    }
    if (actual < REQUIRED_BACKEND_CONTRACT_VERSION) {
      throw new Error("DaoBrew backend version is behind this client; wait for the server update");
    }
    return actual;
  }

  async getElementDetail(element: Element): Promise<ElementDetail> {
    return this.request<ElementDetail>(`/element/${element}/detail`);
  }

  async startSession(element: Element, tier: string = "audio"): Promise<SessionStart> {
    return this.request<SessionStart>("/session/start", {
      method: "POST",
      body: JSON.stringify({ element, tier }),
    });
  }

  async getSessionResult(sessionId: string): Promise<SessionResult> {
    return this.request<SessionResult>(`/session/${sessionId}/outcome`);
  }

  async getSessionHistory(days: number = 7): Promise<SessionHistoryEntry[]> {
    return this.request<SessionHistoryEntry[]>(`/session/logs?limit=${days * 5}`);
  }

  async getHealthkitHistory(metric: string, range: string): Promise<HealthkitHistory> {
    const query = new URLSearchParams({ metric, range });
    return this.request<HealthkitHistory>(`/device/health/history?${query.toString()}`);
  }

  async getStateHistory(limit?: number, start_ts?: number, end_ts?: number): Promise<StateHistory> {
    const query = new URLSearchParams();
    if (limit !== undefined) query.set("limit", String(limit));
    if (start_ts !== undefined) query.set("start_ts", String(start_ts));
    if (end_ts !== undefined) query.set("end_ts", String(end_ts));
    const suffix = query.toString();
    return this.request<StateHistory>(`/state/history${suffix ? `?${suffix}` : ""}`);
  }

  async pushHealthSamples(samples: HealthSampleDTO[]): Promise<{ samples_received: number; message: string }> {
    if (samples.length === 0) return { samples_received: 0, message: "No samples to push" };
    return this.request<{ samples_received: number; message: string }>("/device/health/samples", {
      method: "POST",
      body: JSON.stringify({ samples }),
    });
  }

  /** Run the server-owned causal engine for the authenticated principal. */
  async runCausalGraph(): Promise<CausalRunResponse> {
    return this.request<CausalRunResponse>("/causal/run", {
      method: "POST",
      // Deliberately no body: the backend derives identity and run policy.
    });
  }

  /** Fetch the authenticated principal's exact graph projection for mirroring. */
  async getGraphSnapshot(): Promise<GraphSnapshotResponse> {
    return this.request("/graph/snapshot");
  }

  async createPairingCode(): Promise<{ code: string; expires_in_seconds: number }> {
    return this.request<{ code: string; expires_in_seconds: number }>("/pair/create", {
      method: "POST",
    });
  }

  async sendHeartbeat(): Promise<void> {
    await this.request<{ status: string }>("/pair/heartbeat", {
      method: "POST",
    });
  }

  /**
   * Fetch the latest live heart-rate sample from the backend.
   * Schema (Track B contract):
   *   { hr: float|null, age_seconds: float|null, stale: bool }
   *
   * On HTTP/parse failure, returns `{hr: null, stale: true}` rather than throwing —
   * `daobrew_check` is auto-polled every 2s and we do not want to break the dashboard
   * stream on a transient backend hiccup.
   */
  async getLiveHR(): Promise<{ hr: number | null; age_seconds?: number; stale?: boolean }> {
    try {
      return await this.request<{ hr: number | null; age_seconds?: number; stale?: boolean }>(
        "/session/live-hr",
      );
    } catch {
      return { hr: null, stale: true };
    }
  }

  /**
   * Tell the backend to begin cycle-boundary breath-param feedback for this user.
   * Pattern is locked for the session; backend computes new params at every breath
   * cycle boundary using the just-completed cycle's HR. MCP polls `getBreathState()`
   * to render the retro bar.
   */
  async startLiveSession(
    pattern: string,
    durationSec?: number,
    initialParams?: { bpm?: number; ratio?: number; depth?: number },
  ): Promise<{ started: boolean; pattern: string; initial_params: any; cycle_sec: number; started_at_unix: number }> {
    return this.request("/session/live/start", {
      method: "POST",
      body: JSON.stringify({
        pattern,
        ...(durationSec !== undefined && { duration_sec: durationSec }),
        ...(initialParams && { initial_params: initialParams }),
      }),
    });
  }

  async stopLiveSession(): Promise<any> {
    try {
      return await this.request("/session/live/stop", { method: "POST" });
    } catch {
      return { stopped: false, reason: "request_failed" };
    }
  }

  /**
   * Fetch the live breath-state for retro-bar rendering.
   * Returns `{active: false}` if no session is running.
   */
  async getBreathState(): Promise<BreathState> {
    try {
      return await this.request<BreathState>("/session/breath-state");
    } catch {
      return { active: false };
    }
  }

  async notifyDisconnect(): Promise<void> {
    try {
      await this.request<{ status: string }>("/pair/disconnect", {
        method: "POST",
      });
    } catch {
      // Best-effort — process may be dying
    }
  }
}
