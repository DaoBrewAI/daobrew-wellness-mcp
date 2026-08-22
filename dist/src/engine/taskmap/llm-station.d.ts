import type { CredentialBoundClientPlan } from "../../identity.js";
import type { RemoteLlmConsent } from "../local-config.js";
export declare const LLM_STATION_ID: "mention-extraction-v1";
export declare const LLM_STATION_IDS: readonly ["mention-extraction-v1", "identity-adjudication-v1", "task-decomposition-v1", "community-grouping-v1", "community-title-v1", "community-task-extraction-v1"];
export type LlmStationIdV1 = (typeof LLM_STATION_IDS)[number];
export declare const LLM_STATION_TIMEOUT_MS = 60000;
export declare const LLM_STATION_DISCOVERY_TIMEOUT_MS = 5000;
export declare const LLM_STATION_MAX_OUTPUT_BYTES = 1048576;
export declare const DEFAULT_LLM_PROVIDER_ORDER: readonly ["claude-cli", "codex-cli", "cursor-cli"];
export type LlmProviderId = "claude-cli" | "codex-cli" | "cursor-cli" | "gemini-remote";
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
export type LlmStationRunner = (request: LlmStationRunnerRequest) => Promise<LlmStationRunnerResult>;
export type LlmStationUnavailableReason = "no_provider" | "provider_unauthenticated" | "provider_rate_limited" | "malformed_wrapper" | "nonzero_exit" | "timeout" | "empty_final_output" | "invalid_input_digest" | "invalid_station" | "invalid_clock" | "invalid_executable_override" | "runner_failure" | "remote_consent_required";
export declare class LlmStationUnavailableError extends Error {
    readonly reason: LlmStationUnavailableReason;
    readonly transport?: LlmProviderId | undefined;
    readonly exitCode?: number | null | undefined;
    constructor(reason: LlmStationUnavailableReason, transport?: LlmProviderId | undefined, exitCode?: number | null | undefined);
}
export type LlmExecutableProbe = (absolutePath: string) => boolean | Promise<boolean>;
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
export declare function isValidLlmStationId(value: unknown): value is LlmStationIdV1;
/** Resolve one provider deterministically. Cursor is deliberately unsupported. */
export declare function detectProvider(options?: LlmProviderDetectionOptions): Promise<DetectedLlmProvider>;
export declare function strictLlmProducedAt(clock: () => Date): string;
/**
 * Tolerantly removes exactly one outer markdown code fence (```json or bare
 * ```) that some models wrap around their final payload despite prompt
 * instructions. One pass, outermost pair only, inner content byte-preserved.
 * Everything else — interior fences, trailing prose, single-line fences —
 * passes through unchanged into the unchanged strict validation chain.
 */
export declare function stripTaskMapModelOutputFences(outputText: string): string;
/** Spawn without a shell; abort terminates the child and escalates if necessary. */
export declare const productionLlmStationRunner: LlmStationRunner;
/**
 * Select the first authenticated provider, but keep that choice provisional
 * until its first inference succeeds. A refresh that wants to re-detect after
 * the station is bound creates a new station explicitly.
 */
export declare function createLlmStation(options?: LlmStationOptions): Promise<LlmStation>;
