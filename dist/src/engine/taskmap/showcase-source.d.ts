import { type TaskMapNativeRefreshResponse } from "./native-refresh-service.js";
import type { TaskMapOwnerRefreshSource } from "./owner-refresh-coordinator.js";
import { type SemanticBrainOutput, type TaskMapInput } from "./types.js";
import type { PrivacySafeOuraContext } from "./body-context.js";
export declare const SHOWCASE_FIXED_NOW = "2026-07-31T12:00:00.000Z";
export interface TaskMapShowcaseSource {
    input: TaskMapInput;
    brain: SemanticBrainOutput;
    bodyContext: PrivacySafeOuraContext;
    sourceStates: Array<{
        source: TaskMapOwnerRefreshSource;
        state: "current" | "unavailable";
    }>;
}
export interface PublishTaskMapShowcaseOptions {
    ownerRoot: string;
    homeDirectory?: string;
}
export interface PublishTaskMapShowcaseResult {
    refresh: TaskMapNativeRefreshResponse;
}
export declare function buildTaskMapShowcaseSource(): TaskMapShowcaseSource;
export declare function resolveTaskMapShowcaseOwnerRoot(ownerRoot: string, homeDirectory?: string): string;
export declare function publishTaskMapShowcase(options: PublishTaskMapShowcaseOptions): Promise<PublishTaskMapShowcaseResult>;
