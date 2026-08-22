export declare const TASKMAP_LEGACY_LOCAL_STATE_QUARANTINE_CODE: "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED";
export declare class TaskMapLegacyLocalStateQuarantineError extends Error {
    readonly code: "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED";
    constructor();
}
export interface TaskMapLegacyLocalStateQuarantineV1 {
    legacyOwnerScopeDigest: string;
    activeTerminalTaskIds: string[];
}
/**
 * Read and validate pre-owner lifecycle state as a separate quarantine lane.
 * The returned task IDs may be suppressed as unresolved legacy terminals, but
 * the old decisions are never attributed to the current owner or rewritten.
 */
export declare function inspectTaskMapLegacyLocalState(input: {
    homeDirectory: string;
    ownerRoot: string;
}): TaskMapLegacyLocalStateQuarantineV1 | null;
/**
 * Compatibility entrypoint for both product CLIs. Valid legacy state is
 * quarantined per task instead of disabling every unrelated owner action.
 */
export declare function assertNoUnmigratedTaskMapLegacyLocalState(input: {
    homeDirectory: string;
    ownerRoot: string;
    selectedTaskId?: string;
}): TaskMapLegacyLocalStateQuarantineV1 | null;
