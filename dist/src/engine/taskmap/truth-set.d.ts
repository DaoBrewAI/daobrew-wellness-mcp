import { TASKMAP_OWNER_TRUTH_SET_VERSION, type TaskMapProjectionParityV1, type TaskMapProjectionTargetV1, type TaskMapTruthSetDraftV1, type TaskMapTruthSetV1 } from "./types.js";
export declare function taskMapTruthTextContainsSecret(value: string): boolean;
export declare function buildTaskMapTruthSet(draft: TaskMapTruthSetDraftV1): TaskMapTruthSetV1;
export declare function assertTaskMapTruthSet(value: TaskMapTruthSetV1): TaskMapTruthSetV1;
export declare function taskMapTruthSetCanonicalJson(value: TaskMapTruthSetV1): string;
export declare function taskMapTruthSetMembershipSignature(value: TaskMapTruthSetV1, maskBody?: boolean): string;
export declare function buildTaskMapTruthProjectionTarget(value: TaskMapTruthSetV1, target: "strategy" | "task_map"): TaskMapProjectionTargetV1;
export declare function compareTaskMapTruthSetProjectionParity(value: TaskMapTruthSetV1): TaskMapProjectionParityV1;
export { TASKMAP_OWNER_TRUTH_SET_VERSION };
