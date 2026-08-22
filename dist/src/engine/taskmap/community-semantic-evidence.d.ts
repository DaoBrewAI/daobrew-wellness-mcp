import type { EmbeddingProvider } from "../embeddings/provider.js";
import { type TaskMapCommunityGraphNodeInputV1, type TaskMapCommunityGraphSemanticGroupInputV1 } from "./community-graph-brain.js";
import type { LlmProviderId, LlmStation } from "./llm-station.js";
export declare const TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_VERSION: "taskmap-community-semantic-evidence.v1";
declare const REPLAY_CAPACITY_LOCK_VERSION: "taskmap-community-replay-capacity-lock.v1";
export declare const TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_LIMITS_V1: Readonly<{
    /** Monitored fail-open ceiling; reports expose prompt_limit_exceeded and node counts. */
    readonly maxPromptBytes: number;
    readonly maxGroupingOutputBytes: 1048576;
    readonly maxGroupingReplayEntries: 32;
    readonly maxGroupingReplayBytes: number;
    readonly groupingReplayGraceMs: 5000;
    readonly groupingReplayFutureToleranceMs: 1000;
    readonly groupingReplayLockLeaseMs: 30000;
    readonly groupingReplayLockRetryCount: 2000;
    readonly groupingReplayLockRetryDelayMs: 5;
    readonly maxEmbeddingCacheEntries: 2048;
    readonly maxEmbeddingCacheBytes: number;
    readonly maxModelCharacters: 256;
}>;
export type TaskMapCommunityGroupingUnavailableReason = "no_station" | "prompt_limit_exceeded" | "station_failure" | "invalid_envelope" | "invalid_output";
export interface TaskMapCommunitySemanticEvidenceInputV1 {
    nodes: TaskMapCommunityGraphNodeInputV1[];
    station?: LlmStation | null;
    embeddingProvider?: EmbeddingProvider | null;
    embeddingModelId?: string | null;
    groupingReplayPath?: string;
    embeddingCachePath?: string;
    signal?: AbortSignal;
    storageHooksForTesting?: {
        afterOpen?: (filePath: string) => Promise<void>;
        beforeRename?: (filePath: string) => Promise<void>;
        now?: () => number;
        isPidAlive?: (pid: number) => boolean;
        onLockRetry?: (attempt: number, lockPath: string) => Promise<void>;
        afterLockAcquired?: (owner: ReplayCapacityLockV1) => Promise<void>;
        beforeLockQuarantine?: (lockPath: string) => Promise<void>;
        afterLockQuarantined?: (quarantinePath: string) => Promise<void>;
        lockRetryCount?: number;
    };
}
export interface TaskMapCommunitySemanticEvidenceReportV1 {
    contractVersion: typeof TASKMAP_COMMUNITY_SEMANTIC_EVIDENCE_VERSION;
    inputDigest: string;
    grouping: {
        /** `prompt_limit_exceeded` is a monitored fail-open ceiling, never truncation. */
        state: "available" | "unavailable";
        unavailableReason: TaskMapCommunityGroupingUnavailableReason | null;
        stationId: "community-grouping-v1";
        providerId: LlmProviderId | null;
        modelId: string | null;
        transport: LlmProviderId | null;
        promptDigest: string;
        sourceDigest: string | null;
        producedAt: string | null;
    };
    groupingCoverage: {
        groupedNodeCount: number;
        totalNodeCount: number;
        ratio: number;
    };
    embedding: {
        state: "not_requested" | "available" | "partial" | "unavailable";
        modelId: string | null;
        coverage: {
            embeddedNodeCount: number;
            totalNodeCount: number;
            ratio: number;
        };
    };
    semanticEdgeCoverage: {
        totalPairCount: number;
        groupingPairCount: number;
        embeddingPairCount: number;
        coveredPairCount: number;
        ratio: number;
    };
    cache: {
        hits: number;
        misses: number;
    };
    authority: {
        graphMutated: false;
        nodesMerged: false;
        acceptanceGranted: false;
    };
    privacy: {
        sourceTextsPersisted: false;
        credentialsPersisted: false;
        localPathsPersisted: false;
    };
    reportDigest: string;
}
export interface TaskMapCommunitySemanticEvidenceOutputV1 {
    nodes: TaskMapCommunityGraphNodeInputV1[];
    semanticGroups: TaskMapCommunityGraphSemanticGroupInputV1[];
    report: TaskMapCommunitySemanticEvidenceReportV1;
}
interface ReplayCapacityLockV1 {
    contractVersion: typeof REPLAY_CAPACITY_LOCK_VERSION;
    createdAt: string;
    generation: string;
    pid: number;
}
export declare function defaultTaskMapCommunityEmbeddingCachePath(): string;
export declare function defaultTaskMapCommunityGroupingReplayPath(): string;
export declare function buildTaskMapCommunitySemanticEvidence(input: TaskMapCommunitySemanticEvidenceInputV1): Promise<TaskMapCommunitySemanticEvidenceOutputV1>;
export {};
