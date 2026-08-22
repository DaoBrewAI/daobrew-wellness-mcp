import { type TaskMapNativeAgentSessionEpisodeAdmissionV1 } from "./native-current-work-successor.js";
import type { TaskMapBodyContextDisclosureV1, TaskMapProjectionV1, TaskMapTask } from "./types.js";
export declare const TASKMAP_WEDNESDAY_DEMO_LEAF_VERSION: "taskmap-wednesday-demo-leaf.v1";
export declare const TASKMAP_WEDNESDAY_DEMO_BINDING: Readonly<{
    readonly rootId: "tmr_a4c0ba7a10e990c8";
    readonly taskId: "tmt_c4f013a79bb4b551";
    readonly requestPointerId: "demo-rally-odyssey-debate";
    readonly taskHomePointerId: "demo-rally-odyssey-context";
}>;
export declare const TASKMAP_WEDNESDAY_DEMO_COPY: Readonly<{
    readonly rootTitle: "Ship the Task Map";
    readonly leafTitle: "Turn The Odyssey homecoming into DaoBrew’s product-pivot story";
    readonly inputSummary: "Use the movie block, post-movie debate, and product-pivot context to package a demo about attention as the scarce human choice.";
    readonly firstAction: "Write the hook, three story beats, and bow-ending line, then render the same privacy-safe package as result.md and report.html.";
    readonly doneChecks: readonly ["A manual or four-hour refresh retains this explicit work episode as the current leaf.", "Approval and agent start remain two separate user actions.", "result.md contains the final hook, three story beats, and the bow-ending line.", "report.html renders the same privacy-safe video package and opens locally.", "Tasks and this leaf show the same running, artifact, and report receipts.", "Only an explicit Close records Closed in DaoBrew; Keep open stays nonterminal.", "Close removes this leaf and only ancestors left with no active descendant.", "A later refresh attaches discussion as history and does not reopen or duplicate the closed work."];
    readonly noRepeatedBodyPatternSummary: "No repeated body pattern is attached to this leaf; body context cannot create, approve, dispatch, or verify the task.";
    readonly repeatedBodyPatternSummary: "A repeated body pattern is attached to the workstream as context only; it cannot create, approve, dispatch, or verify the task.";
}>;
export interface TaskMapWednesdayDemoLeafV1 {
    contractVersion: typeof TASKMAP_WEDNESDAY_DEMO_LEAF_VERSION;
    projection: {
        runId: string;
        inputDigest: string;
        projectionDigest: string;
    };
    route: {
        root: {
            id: string;
            title: string;
            sourceTitle: string;
        };
        leaf: {
            id: string;
            title: string;
        };
    };
    source: {
        requestPointerId: string;
        taskHomePointerId: string;
        agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1;
        returnTarget: {
            state: "source_owned";
            pointerId: string;
        } | {
            state: "source_return";
            pointerId: string;
        } | {
            state: "personal_fork";
            pointerId: string;
        };
    };
    input: {
        summary: string;
        contextPointerIds: string[];
    };
    prerequisites: Array<{
        taskId: string;
        relation: "depends_on" | "blocks";
        reviewState: string;
        openState: string;
    }>;
    firstAction: string;
    doneChecks: string[];
    permission: {
        requiresExplicitApproval: true;
        approvalGranted: false;
        authorizationScope: "prepare_local_package_only";
    };
    executable: false;
    privacy: {
        sourceBodiesStored: false;
        localPathsStored: false;
        rawBiometricsStored: false;
        privateMeetingContentStored: false;
    };
    bodyRelation: {
        state: "context_only" | "qualified_signal";
        summary: string;
    };
}
export interface BuildTaskMapWednesdayDemoLeafInputV1 {
    projection: TaskMapProjectionV1;
    projectionDigest: string;
    rootTitle: string;
    task: TaskMapTask;
    contextPointerIds: string[];
    predecessors: TaskMapWednesdayDemoLeafV1["prerequisites"];
    returnTarget: TaskMapWednesdayDemoLeafV1["source"]["returnTarget"];
    body: TaskMapBodyContextDisclosureV1;
    agentSessionEpisode?: TaskMapNativeAgentSessionEpisodeAdmissionV1;
}
export declare function buildTaskMapWednesdayDemoLeaf(input: BuildTaskMapWednesdayDemoLeafInputV1): TaskMapWednesdayDemoLeafV1 | null;
