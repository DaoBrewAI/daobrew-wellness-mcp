export declare const TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION: "taskmap-native-candidate-hierarchy.v2";
export interface TaskMapNativeCandidateHierarchyTopicV1 {
    topicId: string;
    title: string;
    titleSource: "llm_community_title_v1" | "deterministic_fallback";
    candidateIds: string[];
    candidateTasks: Array<{
        candidateId: string;
        subtasks: Array<{
            subtaskId: string;
            title: string;
            summary: string;
        }>;
    }>;
}
export interface TaskMapNativeCandidateHierarchyV1 {
    contractVersion: typeof TASKMAP_NATIVE_CANDIDATE_HIERARCHY_VERSION;
    hierarchyDigest: string;
    producerSnapshotDigest: string;
    groupingState: "available" | "unavailable";
    topics: TaskMapNativeCandidateHierarchyTopicV1[];
    ungroupedCandidateIds: string[];
    authority: "none";
    acceptedWork: false;
    rankEligible: false;
}
export interface BuildTaskMapNativeCandidateHierarchyInputV1 {
    producerSnapshotDigest: string;
    candidateIds: string[];
    groupingAvailable: boolean;
    proposals: Array<{
        rootProposalId: string;
        title: string;
        titleSource: "llm_community_title_v1" | "deterministic_fallback";
        memberNodeIds: string[];
    }>;
    candidateNodeBindings: Array<{
        candidateId: string;
        nodeIds: string[];
    }>;
    subtasks: Array<{
        rootProposalId: string;
        subtaskId: string;
        title: string;
        summary: string;
        memberNodeIds: string[];
    }>;
}
export declare function assertTaskMapNativeCandidateHierarchy(value: unknown, expectedProducerSnapshotDigest: string, expectedCandidateIds: readonly string[]): asserts value is TaskMapNativeCandidateHierarchyV1;
export declare function buildTaskMapNativeCandidateHierarchy(input: BuildTaskMapNativeCandidateHierarchyInputV1): TaskMapNativeCandidateHierarchyV1;
