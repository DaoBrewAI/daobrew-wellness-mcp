import {
  validateTaskMapNativeAgentSessionEpisodeAdmission,
  type TaskMapNativeAgentSessionEpisodeAdmissionV1,
} from "./native-current-work-successor.js";
import type {
  TaskMapBodyContextDisclosureV1,
  TaskMapProjectionV1,
  TaskMapTask,
} from "./types.js";

export const TASKMAP_WEDNESDAY_DEMO_LEAF_VERSION =
  "taskmap-wednesday-demo-leaf.v1" as const;

export const TASKMAP_WEDNESDAY_DEMO_BINDING = Object.freeze({
  rootId: "tmr_a4c0ba7a10e990c8",
  taskId: "tmt_c4f013a79bb4b551",
  requestPointerId: "demo-rally-odyssey-debate",
  taskHomePointerId: "demo-rally-odyssey-context",
} as const);

export const TASKMAP_WEDNESDAY_DEMO_COPY = Object.freeze({
  rootTitle: "Ship the Task Map",
  leafTitle: "Turn The Odyssey homecoming into DaoBrew’s product-pivot story",
  inputSummary:
    "Use the movie block, post-movie debate, and product-pivot context to package a demo about attention as the scarce human choice.",
  firstAction:
    "Write the hook, three story beats, and bow-ending line, then render the same privacy-safe package as result.md and report.html.",
  doneChecks: [
    "A manual or four-hour refresh retains this explicit work episode as the current leaf.",
    "Approval and agent start remain two separate user actions.",
    "result.md contains the final hook, three story beats, and the bow-ending line.",
    "report.html renders the same privacy-safe video package and opens locally.",
    "Tasks and this leaf show the same running, artifact, and report receipts.",
    "Only an explicit Close records Closed in DaoBrew; Keep open stays nonterminal.",
    "Close removes this leaf and only ancestors left with no active descendant.",
    "A later refresh attaches discussion as history and does not reopen or duplicate the closed work.",
  ],
  noRepeatedBodyPatternSummary:
    "No repeated body pattern is attached to this leaf; body context cannot create, approve, dispatch, or verify the task.",
  repeatedBodyPatternSummary:
    "A repeated body pattern is attached to the workstream as context only; it cannot create, approve, dispatch, or verify the task.",
} as const);

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
    returnTarget:
      | { state: "source_owned"; pointerId: string }
      | { state: "source_return"; pointerId: string }
      | { state: "personal_fork"; pointerId: string };
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

export function buildTaskMapWednesdayDemoLeaf(
  input: BuildTaskMapWednesdayDemoLeafInputV1,
): TaskMapWednesdayDemoLeafV1 | null {
  const {
    projection,
    projectionDigest,
    task,
    contextPointerIds,
    predecessors,
    returnTarget,
    body,
  } = input;
  let agentSessionEpisode:
    | TaskMapNativeAgentSessionEpisodeAdmissionV1
    | undefined;
  if (input.agentSessionEpisode !== undefined) {
    try {
      agentSessionEpisode =
        validateTaskMapNativeAgentSessionEpisodeAdmission(
          input.agentSessionEpisode,
        );
    } catch {
      return null;
    }
  }
  const binding = TASKMAP_WEDNESDAY_DEMO_BINDING;
  const root = projection.roots.find((row) => row.id === binding.rootId);
  const expectedPointers = [
    binding.requestPointerId,
    binding.taskHomePointerId,
  ].sort();
  if (
    projection.runStatus !== "accepted"
    || root === undefined
    || task.id !== binding.taskId
    || task.rootId !== binding.rootId
    || !root.taskIds.includes(task.id)
    || task.taskHomePointerId !== binding.taskHomePointerId
    || contextPointerIds.length !== expectedPointers.length
    || !contextPointerIds.every((pointerId, index) => (
      pointerId === expectedPointers[index]
    ))
    || returnTarget.state !== "source_owned"
    || returnTarget.pointerId !== binding.taskHomePointerId
    || body.projectionRunId !== projection.runId
    || body.projectionInputDigest !== projection.inputDigest
  ) {
    return null;
  }

  const qualifiedBodySignal = body.nodes.some((node) => (
    (node.nodeId === root.id || node.nodeId === task.id)
    && node.matches.length > 0
  ));
  return {
    contractVersion: TASKMAP_WEDNESDAY_DEMO_LEAF_VERSION,
    projection: {
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest,
    },
    route: {
      root: {
        id: root.id,
        title: TASKMAP_WEDNESDAY_DEMO_COPY.rootTitle,
        sourceTitle: input.rootTitle,
      },
      leaf: {
        id: task.id,
        title: TASKMAP_WEDNESDAY_DEMO_COPY.leafTitle,
      },
    },
    source: {
      requestPointerId: binding.requestPointerId,
      taskHomePointerId: binding.taskHomePointerId,
      ...(agentSessionEpisode === undefined
        ? {}
        : { agentSessionEpisode }),
      returnTarget: { ...returnTarget },
    },
    input: {
      summary: TASKMAP_WEDNESDAY_DEMO_COPY.inputSummary,
      contextPointerIds: [...contextPointerIds],
    },
    prerequisites: predecessors.map((row) => ({ ...row })),
    firstAction: TASKMAP_WEDNESDAY_DEMO_COPY.firstAction,
    doneChecks: [...TASKMAP_WEDNESDAY_DEMO_COPY.doneChecks],
    permission: {
      requiresExplicitApproval: true,
      approvalGranted: false,
      authorizationScope: "prepare_local_package_only",
    },
    executable: false,
    privacy: {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
      privateMeetingContentStored: false,
    },
    bodyRelation: qualifiedBodySignal
      ? {
          state: "qualified_signal",
          summary: TASKMAP_WEDNESDAY_DEMO_COPY.repeatedBodyPatternSummary,
        }
      : {
          state: "context_only",
          summary: TASKMAP_WEDNESDAY_DEMO_COPY.noRepeatedBodyPatternSummary,
        },
  };
}
