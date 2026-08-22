import { type RootCausalGateInput, type SemanticBrainOutput, type TaskMapInput, type TaskMapProjectionV1 } from "./types.js";
export declare const TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION: "taskmap-native-predecessor-evidence.v1";
export declare const TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_LIMITS_V1: Readonly<{
    readonly maxEvidenceFileBytes: number;
    readonly maxProjectionFileBytes: number;
    readonly maxCurrentnessFileBytes: number;
    readonly maxInputBytes: number;
    readonly maxBrainBytes: number;
    readonly maxPreviousProjectionBytes: number;
    readonly maxPointers: 8192;
    readonly maxEvents: 32768;
    readonly maxBrainRoots: 2048;
    readonly maxBrainTasks: 4096;
    readonly maxBrainEdges: 8192;
    readonly maxCausalInputs: 2048;
    readonly maxArrayLength: 32768;
    readonly maxObjectKeys: 64;
    readonly maxDepth: 32;
    readonly maxStringCharacters: 65536;
}>;
export interface TaskMapNativePredecessorCurrentnessV1 {
    contractVersion: "taskmap-native-currentness-gate.v1";
    runId: string;
    inputDigest: string;
    projectionDigest: string;
    taskDispositions: Array<{
        taskId: string;
        disposition: "current" | "needs_lifecycle_review";
    }>;
}
export interface TaskMapNativePredecessorReplayV1 {
    previousProjection: TaskMapProjectionV1 | null;
    causalInputs: RootCausalGateInput[];
}
export interface TaskMapNativePredecessorBindingV1 {
    runId: string;
    inputDigest: string;
    semanticInputDigest: string;
    brainOutputDigest: string;
    replayDigest: string;
    projectionDigest: string;
    projectionFileDigest: string;
    currentnessFileDigest: string;
}
export interface TaskMapNativePredecessorEvidenceV1 {
    contractVersion: typeof TASKMAP_NATIVE_PREDECESSOR_EVIDENCE_VERSION;
    binding: TaskMapNativePredecessorBindingV1;
    replay: TaskMapNativePredecessorReplayV1;
    taskMapInput: TaskMapInput;
    semanticBrainOutput: SemanticBrainOutput;
    artifactDigest: string;
}
export interface TaskMapNativePredecessorEvidenceContextV1 {
    projection: TaskMapProjectionV1;
    currentness: TaskMapNativePredecessorCurrentnessV1;
    projectionFileBytes: Buffer;
    currentnessFileBytes: Buffer;
}
export interface BuildTaskMapNativePredecessorEvidenceInputV1 extends TaskMapNativePredecessorEvidenceContextV1 {
    replay: TaskMapNativePredecessorReplayV1;
    taskMapInput: TaskMapInput;
    semanticBrainOutput: SemanticBrainOutput;
}
export interface TaskMapNativePredecessorEvidenceVerificationV1 {
    binding: TaskMapNativePredecessorBindingV1;
    taskMapInput: TaskMapInput;
    semanticBrainOutput: SemanticBrainOutput;
}
export interface TaskMapNativePredecessorEvidenceLocationV1 {
    homeDirectory: string;
}
export interface WriteTaskMapNativePredecessorEvidenceInputV1 extends TaskMapNativePredecessorEvidenceLocationV1 {
    evidence: TaskMapNativePredecessorEvidenceV1;
}
export declare function buildTaskMapNativePredecessorEvidence(input: BuildTaskMapNativePredecessorEvidenceInputV1): TaskMapNativePredecessorEvidenceV1;
export declare function assertTaskMapNativePredecessorEvidence(value: unknown, context: TaskMapNativePredecessorEvidenceContextV1): TaskMapNativePredecessorEvidenceVerificationV1;
export declare function taskMapNativePredecessorEvidencePath(homeDirectory: string): string;
export declare function loadTaskMapNativePredecessorEvidence(input: TaskMapNativePredecessorEvidenceLocationV1): Promise<TaskMapNativePredecessorEvidenceVerificationV1>;
export declare function writeTaskMapNativePredecessorEvidence(input: WriteTaskMapNativePredecessorEvidenceInputV1): Promise<TaskMapNativePredecessorEvidenceVerificationV1>;
