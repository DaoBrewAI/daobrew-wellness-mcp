import { SemanticBrainOutput, TaskMapAblationReport, TaskMapHarnessOptions, TaskMapInput, TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_ALGORITHM_POLICY: {
    readonly version: "taskmap-policy.2";
    readonly engineRulesVersion: "taskmap-engine-rules.3";
    readonly validationRulesVersion: "taskmap-validation-rules.3";
    readonly identityRulesVersion: "taskmap-identity-rules.3";
    readonly limits: {
        readonly titleCharacters: 96;
        readonly summaryCharacters: 200;
    };
    readonly timestamps: "strict-rfc3339-with-z-or-offset";
    readonly privacy: {
        readonly encodedTextIsDecodedBeforeScan: true;
        readonly bodySourceKindsExcludedFromSemanticInput: readonly ["oura"];
        readonly bodySourceRecordKinds: readonly ["body_context", "receipt"];
        readonly rawBiometricValues: "metric-vocabulary-plus-number-redaction-with-window-count-exception";
    };
    readonly rootReuseJaccard: 0.5;
    readonly rootPersistence: {
        readonly objective: "max-cardinality-then-max-overlap";
        readonly dummyCost: "row-count-plus-two";
        readonly ineligibleCost: "twice-dummy-cost";
        readonly finalIdsUnique: true;
    };
    readonly rootMembership: "unique-source-backed-object-refs";
    readonly taskIdentity: {
        readonly authoritative: "source-kind-and-source-ref-hash";
        readonly discovered: "normalized-content-root-members-and-source-backed-evidence";
        readonly previousDiscoveredEvidence: "source-kind-and-source-ref-hash-never-local-pointer-id";
    };
    readonly bodyJoinWindowMs: number;
    readonly bodyFreshnessWindowMs: number;
    readonly bodyFreshnessRationale: "taskmap-context-layer uses an approximately 72-hour freshness half-life and omits stale body edges";
    readonly bodyJoinRequiresExplicitEligibility: true;
    readonly actionableBodyCategories: readonly ["below_baseline", "above_baseline"];
    readonly bodyJoinEligibleRecordKinds: readonly ["work_context", "receipt"];
    readonly causal: {
        readonly statsDerivedFromInput: true;
        readonly targetCategories: readonly ["below_baseline", "above_baseline"];
        readonly neutralReferenceCategory: "within_baseline";
        readonly bodyAxisRequired: true;
        readonly citedDays: "exact-target-and-eligible-work-date-intersection";
        readonly sourceKinds: "derived-from-root-evidence";
        readonly comparableCorpusCoverage: "complete-source-day-receipts-cover-every-root-join-eligible-source-kind";
        readonly rootObservableSourceScope: "all-source-kinds-from-root-body-join-eligible-evidence-empty-is-incomparable";
        readonly minCorpusSourcesPerDay: number;
        readonly rtmSuspected: "true-when-any-extreme-target-hit-is-cited";
        readonly minNeutralReferenceDays: number;
        readonly neutralReferenceRationale: "require at least the same three-day floor as target backed-day evidence";
        readonly enrichmentThresholds: import("../reasoner/EnrichmentGate.js").EnrichmentThresholds;
    };
    readonly scoreWeights: {
        readonly sourcePriority: 0.25;
        readonly deadlinePressure: 0.25;
        readonly dependencyImpact: 0.15;
        readonly recurrence: 0.15;
        readonly staleOpen: 0.1;
        readonly evidenceStrength: 0.1;
    };
    readonly rootScoreWeights: {
        readonly maxChildActionability: 0.5;
        readonly rootRecurrence: 0.2;
        readonly evidenceStrength: 0.1;
        readonly sourceBreadth: 0.1;
        readonly actionableLoad: 0.05;
        readonly dependencyBreadth: 0.05;
    };
    readonly rootScoreCaps: {
        readonly sourceKinds: 3;
        readonly actionableTasks: 5;
        readonly dependencyEdges: 5;
        readonly bodyBonus: 0.08;
    };
    readonly rootClosedScoring: "all-components-zero-when-no-actionable-tasks";
    readonly bodyBonus: {
        readonly C2_ATTRIBUTION_CANDIDATE: 0.03;
        readonly C3_CAUSAL_HYPOTHESIS: 0.05;
        readonly C4_VALIDATED_PATTERN: 0.08;
    };
    readonly deadlinePressure: readonly [{
        readonly maxDays: 1;
        readonly score: 1;
    }, {
        readonly maxDays: 3;
        readonly score: 0.85;
    }, {
        readonly maxDays: 7;
        readonly score: 0.65;
    }, {
        readonly maxDays: 14;
        readonly score: 0.4;
    }, {
        readonly maxDays: 30;
        readonly score: 0.2;
    }];
    readonly staleOpenDays: 30;
    readonly recurrence: {
        readonly dayCap: 4;
        readonly pointerCap: 3;
        readonly divisor: 7;
    };
    readonly dependencyCountCap: 3;
    readonly closedWorkScoring: "all-components-zero";
    readonly authoritativeStatePrecedence: readonly ["task_completed", "source_status", "task_reopened", "task_created", "unknown"];
    readonly edgeIdentity: "from-relation-to";
    readonly authoritativeCoverage: "one-to-one-latest-not-proven-closed";
    readonly temporalOrder: "occurred-at-lte-observed-at-lte-input-lte-brain-lte-run";
    readonly causalDayJoin: "explicit-source-local-day-key";
    readonly retractions: "target-and-retracting-tombstone-are-not-live-work";
    readonly routingCapabilityMatrix: "sync-mode-and-authority-v1";
    readonly sourceOwnedRouteEligibility: "deep-link-delegate-native-agent-or-return-capability";
    readonly returnRouting: "explicit-or-sole-eligible-cited-origin-and-always-approval-gated";
    readonly edgeEndpointMatrix: "advances-root-to-task-execution-and-informed-by-task-to-task-related-to-same-kind";
    readonly semanticSupersedes: "discovered-target-must-be-explicitly-superseded-source-owned-targets-rejected";
    readonly executionEdges: "depends-on-blocks-and-supersedes-must-be-acyclic";
};
export declare const TASKMAP_ALGORITHM_POLICY_DIGEST: string;
export declare function taskMapInputDigest(input: TaskMapInput): string;
/**
 * The semantic brain receives work events only. Body events and body-only
 * pointers are deliberately absent so biometrics cannot influence membership.
 */
export declare function taskMapSemanticInput(input: TaskMapInput): TaskMapInput;
export declare function taskMapSemanticInputDigest(input: TaskMapInput): string;
export declare function taskMapProjectionPrivacyLeakReasons(value: unknown): string[];
/** Read-only validation of the complete Task Map input contract. */
export declare function taskMapInputValidationReasons(input: TaskMapInput): string[];
export declare function taskMapProjectionArtifactValidationReasons(projection: TaskMapProjectionV1): string[];
export declare function buildTaskMapProjection(input: TaskMapInput, brain: SemanticBrainOutput | null, options: TaskMapHarnessOptions): TaskMapProjectionV1;
export declare function taskMapMembershipSignature(projection: TaskMapProjectionV1): string;
export declare function runTaskMapAblation(input: TaskMapInput, brain: SemanticBrainOutput, options?: Omit<TaskMapHarnessOptions, "arm">): TaskMapAblationReport;
