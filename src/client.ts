import {
  Element, WellnessState, ElementDetail, SessionStart,
  SessionResult, SessionHistoryEntry, HealthSampleDTO,
} from "./types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_BASE_URL = "https://api.daobrew.com/api/v1";
const DEFAULT_TIMEOUT_MS = 15000;

export interface ClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class DaoBrewClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const args = [
      "-sS", "--max-time", String(Math.ceil(this.timeoutMs / 1000)),
      "-H", `Authorization: Bearer ${this.apiKey}`,
      "-H", "Content-Type: application/json",
    ];
    if (options.method === "POST") {
      args.push("-X", "POST");
      if (options.body) args.push("-d", options.body);
    }
    args.push(url);

    const { stdout } = await execFileAsync("curl", args, { timeout: this.timeoutMs + 2000 });
    const json = JSON.parse(stdout) as any;
    if (json.success === false) {
      throw new Error(`DaoBrew API error: ${json.error?.message ?? json.error ?? "Unknown error"}`);
    }
    return json.data as T;
  }

  async getWellnessState(): Promise<WellnessState> {
    return this.request<WellnessState>("/state/current?format=mcp");
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

  async pushHealthSamples(samples: HealthSampleDTO[]): Promise<{ samples_received: number; message: string }> {
    if (samples.length === 0) return { samples_received: 0, message: "No samples to push" };
    return this.request<{ samples_received: number; message: string }>("/healthkit/samples", {
      method: "POST",
      body: JSON.stringify({ samples }),
    });
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
