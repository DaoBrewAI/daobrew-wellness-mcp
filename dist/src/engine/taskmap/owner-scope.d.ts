export declare const TASKMAP_OWNER_SCOPE_DOMAIN: "taskmap-owner-scope.v1";
export interface TaskMapOwnerScope {
    readonly userId: string;
    readonly ownerScopeDigest: string;
    readonly homeDirectory: string;
    readonly ownerRoot: string;
    readonly runtimeRoot: string;
    readonly taskMapRoot: string;
    readonly sourceRoot: string;
}
export declare function taskMapOwnerScopeDigest(userId: string): string;
export declare function createTaskMapOwnerScope(userId: string, homeDirectory: string): TaskMapOwnerScope;
export declare function assertTaskMapOwnerScope(value: unknown): asserts value is TaskMapOwnerScope;
