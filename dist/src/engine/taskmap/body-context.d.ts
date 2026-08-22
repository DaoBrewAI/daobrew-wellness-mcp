import { TaskMapBodyContextDisclosureV1, TaskMapInput, TaskMapProjectionV1 } from "./types.js";
export interface PrivacySafeOuraContext {
    contractVersion: string;
    generatedAt: string;
    sourceKind: "oura";
    coverage: TaskMapBodyContextDisclosureV1["coverage"];
    classifier: TaskMapBodyContextDisclosureV1["classifier"];
    days: Array<{
        dayKey: string;
        axis: "composite_recovery";
        category: "below_baseline" | "within_baseline" | "above_baseline" | "unknown";
    }>;
    privacy: {
        rawBiometricsStored: false;
        sourceBodiesStored: false;
        localPathsStored: false;
    };
}
/**
 * Bind a privacy-safe Oura snapshot to the exact accepted projection.
 *
 * The function recomputes the existing post-membership body join from cited
 * work events and fails if the disclosure count diverges from the projection.
 */
export declare function buildTaskMapBodyContextDisclosure(input: TaskMapInput, projection: TaskMapProjectionV1, context: PrivacySafeOuraContext): TaskMapBodyContextDisclosureV1;
