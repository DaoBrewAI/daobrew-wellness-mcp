#!/usr/bin/env node
import { type TaskMapOwnerRefreshTrigger } from "./owner-refresh-coordinator.js";
import { type TaskMapNativeRefreshResponse, type TaskMapNativeRefreshServiceOptions, type TaskMapNativeStrategyFallbackOptions } from "./native-refresh-service.js";
import type { LlmStation } from "./llm-station.js";
import { type ConfirmedTaskMapOwner } from "../../identity.js";
type RefreshEnvironment = Readonly<Record<string, string | undefined>>;
export declare const TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS = 5000;
export declare const TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS = 80000;
export declare const TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS = 5000;
export declare const TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS: 30000;
type PackagedStationFactory = (signal?: AbortSignal) => Promise<LlmStation>;
export type TaskMapNativeRefreshCommand = {
    operation: "refresh";
    trigger: TaskMapOwnerRefreshTrigger;
} | {
    operation: "recover";
};
export interface TaskMapNativeRecoveryResponse {
    status: "ok";
    operation: "recover";
    recovered: boolean;
}
export interface TaskMapNativeRefreshCommandRuntime {
    requestRefresh(trigger: TaskMapOwnerRefreshTrigger): Promise<TaskMapNativeRefreshResponse>;
    recoverPendingPublication?(): Promise<boolean>;
}
export declare function taskMapNativeRefreshStrategyFallbackFromEnvironment(environment?: RefreshEnvironment, homeDirectory?: string): TaskMapNativeStrategyFallbackOptions | undefined;
export declare function taskMapNativeRefreshServiceOptionsFromEnvironment(confirmedOwner: ConfirmedTaskMapOwner, environment?: RefreshEnvironment, homeDirectory?: string, createStation?: PackagedStationFactory): TaskMapNativeRefreshServiceOptions;
export declare function parseTaskMapNativeRefreshCommand(argv: readonly string[]): TaskMapNativeRefreshCommand;
export declare function runTaskMapNativeRefreshCommand(argv: readonly string[], runtime?: TaskMapNativeRefreshCommandRuntime): Promise<TaskMapNativeRefreshResponse | TaskMapNativeRecoveryResponse>;
export {};
