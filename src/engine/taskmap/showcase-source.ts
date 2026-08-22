import {
  existsSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadConfirmedTaskMapOwner } from "../../identity.js";

import { buildTaskMapBodyContextDisclosure } from "./body-context.js";
import {
  buildTaskMapProjection,
  taskMapProjectionArtifactValidationReasons,
  taskMapSemanticInputDigest,
} from "./harness.js";
import {
  validateTaskMapNativeCurrentWork,
  type TaskMapNativeCurrentWorkV1,
} from "./native-current-work-successor.js";
import {
  TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
  TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME,
  TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION,
  TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME,
  TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
  TASKMAP_NATIVE_GENERATIONS_DIRECTORY,
  TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME,
  TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME,
  TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
  TaskMapNativeRefreshService,
  currentnessForNativeProjection,
  type TaskMapNativePublicationCandidate,
  type TaskMapNativeRefreshResponse,
  type TaskMapNativeSafeSlice,
  type TaskMapBodySignalAssessmentV1,
} from "./native-refresh-service.js";
import {
  buildTaskMapReadyProofTargets,
} from "./ready-frontier.js";
import type {
  TaskMapOwnerCollectedSlice,
  TaskMapOwnerRefreshSource,
} from "./owner-refresh-coordinator.js";
import {
  diffTaskMapProjections,
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type SemanticBrainOutput,
  type TaskMapInput,
} from "./types.js";
import {
  TASKMAP_TASK_RANKING_FILENAME,
  buildTaskMapTaskRankingPublication,
} from "./task-ranking-publication.js";
import type { PrivacySafeOuraContext } from "./body-context.js";

export const SHOWCASE_FIXED_NOW = "2026-07-31T12:00:00.000Z";
const SHOWCASE_REFRESH_NOW = "2026-07-31T12:01:00.000Z";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export interface TaskMapShowcaseSource {
  input: TaskMapInput;
  brain: SemanticBrainOutput;
  bodyContext: PrivacySafeOuraContext;
  sourceStates: Array<{
    source: TaskMapOwnerRefreshSource;
    state: "current" | "unavailable";
  }>;
}

export interface PublishTaskMapShowcaseOptions {
  ownerRoot: string;
  homeDirectory?: string;
}

export interface PublishTaskMapShowcaseResult {
  refresh: TaskMapNativeRefreshResponse;
}

function sourcePointer(
  id: string,
  sourceKind: "codex_session" | "gemini_meet" | "oura",
  sourceObjectId: string,
  sourceRefHash: string,
  authoritative = false,
): TaskMapInput["pointers"][number] {
  if (authoritative) {
    return {
      id,
      sourceKind,
      sourceObjectId,
      sourceRefHash,
      sourceVersion: "showcase-source-v1",
      authority: "source_system",
      syncMode: "return_only",
      capabilities: ["read_task", "deep_link"],
    };
  }
  return {
    id,
    sourceKind,
    sourceObjectId,
    sourceRefHash,
    sourceVersion: "showcase-source-v1",
    authority: "none",
    syncMode: "reference_only",
    capabilities: ["read_context"],
  };
}

export function buildTaskMapShowcaseSource(): TaskMapShowcaseSource {
  const input: TaskMapInput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    generatedAt: SHOWCASE_FIXED_NOW,
    pointers: [
      sourcePointer(
        "ptr-synthetic-authority",
        "gemini_meet",
        "taskmap-showcase-loop",
        "1111111111111111",
        true,
      ),
      sourcePointer(
        "ptr-synthetic-agent",
        "gemini_meet",
        "bounded-showcase-session",
        "2222222222222222",
      ),
      sourcePointer(
        "ptr-synthetic-body",
        "oura",
        "relative-recovery-window",
        "3333333333333333",
      ),
    ],
    events: [
      {
        id: "event-synthetic-source-task",
        pointerId: "ptr-synthetic-authority",
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: "2026-07-29T16:00:00.000Z",
        observedAt: "2026-07-31T11:55:00.000Z",
        dayKey: "2026-07-29",
        objectRefs: [
          "workstream:local-task-map",
          "task:showcase-loop",
        ],
        title: "Complete the showcase loop",
        summary:
          "Prove the local Task Map from source refresh through retained execution evidence.",
        extractionConfidence: 1,
        sourceStatus: "in_progress",
        priority: 1,
      },
      {
        id: "event-synthetic-publication",
        pointerId: "ptr-synthetic-agent",
        recordKind: "work_context",
        activity: "commitment_stated",
        occurredAt: "2026-07-29T17:00:00.000Z",
        observedAt: "2026-07-31T11:56:00.000Z",
        dayKey: "2026-07-29",
        objectRefs: [
          "workstream:local-task-map",
          "outcome:source-publication",
        ],
        title: "Trace source inputs through publication",
        summary:
          "Keep projection, currentness, and sidecars bound to one deterministic refresh.",
        extractionConfidence: 0.98,
        bodyJoinEligible: true,
      },
      {
        id: "event-synthetic-execution",
        pointerId: "ptr-synthetic-agent",
        recordKind: "work_context",
        activity: "commitment_stated",
        occurredAt: "2026-07-29T18:00:00.000Z",
        observedAt: "2026-07-31T11:57:00.000Z",
        dayKey: "2026-07-29",
        objectRefs: [
          "workstream:local-task-map",
          "outcome:execution-receipts",
        ],
        title: "Verify approval and execution receipts",
        summary:
          "Keep approval, start, artifact, report, and close as distinct evidence.",
        extractionConfidence: 0.98,
        bodyJoinEligible: true,
      },
      {
        id: "event-synthetic-visual",
        pointerId: "ptr-synthetic-agent",
        recordKind: "work_context",
        activity: "commitment_stated",
        occurredAt: "2026-07-29T19:00:00.000Z",
        observedAt: "2026-07-31T11:58:00.000Z",
        dayKey: "2026-07-29",
        objectRefs: [
          "workstream:local-task-map",
          "outcome:signed-forest",
        ],
        title: "Capture the signed Task Map Forest",
        summary:
          "Retain visual evidence from the repo-built signed app in isolated showcase mode.",
        extractionConfidence: 0.98,
        bodyJoinEligible: true,
      },
      {
        id: "event-synthetic-body",
        pointerId: "ptr-synthetic-body",
        recordKind: "body_context",
        activity: "body_window_observed",
        occurredAt: "2026-07-29T12:00:00.000Z",
        observedAt: "2026-07-31T11:59:00.000Z",
        dayKey: "2026-07-29",
        objectRefs: ["body-day:2026-07-29"],
        title: "Recovery window was below the recent personal range",
        summary:
          "Relative category only; related in time and not proof of cause.",
        extractionConfidence: 1,
        bodyCategory: "below_baseline",
        bodyAxis: "composite_recovery",
      },
    ],
  };

  const brain: SemanticBrainOutput = {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    provider: "showcase-reviewed",
    model: "deterministic-v1",
    promptHash: "aaaaaaaaaaaaaaaa",
    inputDigest: taskMapSemanticInputDigest(input),
    generatedAt: SHOWCASE_FIXED_NOW,
    roots: [{
      proposalId: "root-local-task-map",
      title: "Make the local Task Map trustworthy end to end",
      summary:
        "One source-linked workstream proves publication, execution evidence, and the signed Forest.",
      evidenceEventIds: [
        "event-synthetic-source-task",
        "event-synthetic-publication",
        "event-synthetic-execution",
        "event-synthetic-visual",
      ],
      memberObjectRefs: [
        "workstream:local-task-map",
        "task:showcase-loop",
        "outcome:source-publication",
        "outcome:execution-receipts",
        "outcome:signed-forest",
      ],
      confidence: 0.99,
    }],
    tasks: [
      {
        proposalId: "task-showcase-loop",
        rootProposalId: "root-local-task-map",
        title: "Complete the showcase loop",
        summary:
          "Prove source refresh, approval, execution, report, and close without owner data.",
        evidenceEventIds: [
          "event-synthetic-source-task",
          "event-synthetic-publication",
        ],
        authoritativeTaskEventId: "event-synthetic-source-task",
        openState: "open",
        confidence: 1,
      },
      {
        proposalId: "task-showcase-publication",
        rootProposalId: "root-local-task-map",
        title: "Trace source inputs through publication",
        summary:
          "Verify accepted projection, currentness, current work, and body disclosure.",
        evidenceEventIds: [
          "event-synthetic-source-task",
          "event-synthetic-publication",
        ],
        openState: "open",
        confidence: 0.98,
      },
      {
        proposalId: "task-showcase-execution",
        rootProposalId: "root-local-task-map",
        title: "Verify approval and execution receipts",
        summary:
          "Prove each authorization and execution lifecycle transition independently.",
        evidenceEventIds: [
          "event-synthetic-source-task",
          "event-synthetic-execution",
        ],
        openState: "open",
        confidence: 0.98,
      },
      {
        proposalId: "task-showcase-visual",
        rootProposalId: "root-local-task-map",
        title: "Capture the signed Task Map Forest",
        summary:
          "Record the reference-like hierarchy from the signed local app.",
        evidenceEventIds: [
          "event-synthetic-source-task",
          "event-synthetic-visual",
        ],
        openState: "open",
        confidence: 0.98,
      },
    ],
    edges: [
      ["publication", "task-showcase-publication"],
      ["execution", "task-showcase-execution"],
      ["visual", "task-showcase-visual"],
      ["loop", "task-showcase-loop"],
    ].map(([suffix, taskProposalId]) => ({
      proposalId: `edge-root-${suffix}`,
      fromProposalId: "root-local-task-map",
      toProposalId: taskProposalId,
      relation: "advances" as const,
      evidenceEventIds: ["event-synthetic-source-task"],
      confidence: 1,
    })),
  };

  const supplementalWorkstreams = [
    {
      proposalId: "root-reviewable-evidence",
      objectRef: "workstream:reviewable-evidence",
      title: "Keep showcase evidence easy to review",
      summary:
        "Compiler, test, visual, and handoff evidence stay distinct and easy to audit.",
      tasks: [
        {
          proposalId: "task-compiler-evidence",
          objectRef: "outcome:compiler-evidence",
          title: "Record compiler and test evidence",
          summary:
            "Retain focused and full-gate results with their exact truth boundaries.",
        },
        {
          proposalId: "task-forest-comparison",
          objectRef: "outcome:forest-comparison",
          title: "Compare the deterministic Forest",
          summary:
            "Keep the accepted hierarchy and visual-density comparison reproducible.",
        },
        {
          proposalId: "task-cto-handoff",
          objectRef: "outcome:cto-handoff",
          title: "Package the CTO review handoff",
          summary:
            "Separate verified evidence, known gaps, and reviewer decisions.",
        },
      ],
    },
    {
      proposalId: "root-isolated-refresh",
      objectRef: "workstream:isolated-refresh",
      title: "Keep source refresh isolated from owner state",
      summary:
        "Root guards, source truth, and sanitized provenance keep the showcase separate.",
      tasks: [
        {
          proposalId: "task-owner-root-guard",
          objectRef: "outcome:owner-root-guard",
          title: "Verify the owner-root guard",
          summary:
            "Reject normal, relative, redirected, and already-used owner roots.",
        },
        {
          proposalId: "task-unavailable-source-truth",
          objectRef: "outcome:unavailable-source-truth",
          title: "Retain unavailable source truth",
          summary:
            "Show two current and two unavailable source families without inference.",
        },
        {
          proposalId: "task-sanitized-provenance",
          objectRef: "outcome:sanitized-provenance",
          title: "Audit sanitized provenance",
          summary:
            "Keep citations useful without identities, source bodies, paths, or tokens.",
        },
      ],
    },
  ] as const;

  supplementalWorkstreams.forEach((workstream, rootIndex) => {
    const eventIds: string[] = [];
    const memberObjectRefs: string[] = [workstream.objectRef];
    workstream.tasks.forEach((task, taskIndex) => {
      const eventId = `event-synthetic-${task.proposalId}`;
      const pointerId = `ptr-synthetic-${task.proposalId}`;
      input.pointers.push(sourcePointer(
        pointerId,
        "codex_session",
        task.objectRef,
        (40 + rootIndex * 10 + taskIndex)
          .toString(16)
          .padStart(16, "0"),
        true,
      ));
      eventIds.push(eventId);
      memberObjectRefs.push(task.objectRef);
      input.events.push({
        id: eventId,
        pointerId,
        recordKind: "authoritative_task",
        activity: "task_created",
        occurredAt: `2026-07-${27 + taskIndex}T${16 + rootIndex}:00:00.000Z`,
        observedAt: `2026-07-31T11:${40 + rootIndex * 5 + taskIndex}:00.000Z`,
        dayKey: `2026-07-${27 + taskIndex}`,
        objectRefs: [workstream.objectRef, task.objectRef],
        title: task.title,
        summary: task.summary,
        extractionConfidence: 0.97,
        sourceStatus: "in_progress",
        priority:
          (rootIndex === 0 ? 1 : 0.5) - taskIndex * 0.01,
      });
      brain.tasks.push({
        proposalId: task.proposalId,
        rootProposalId: workstream.proposalId,
        title: task.title,
        summary: task.summary,
        evidenceEventIds: [eventId],
        authoritativeTaskEventId: eventId,
        openState: "open",
        confidence: 0.97,
      });
      brain.edges.push({
        proposalId: `edge-${workstream.proposalId}-${taskIndex + 1}`,
        fromProposalId: workstream.proposalId,
        toProposalId: task.proposalId,
        relation: "advances",
        evidenceEventIds: [eventId],
        confidence: 1,
      });
    });
    brain.roots.push({
      proposalId: workstream.proposalId,
      title: workstream.title,
      summary: workstream.summary,
      evidenceEventIds: eventIds,
      memberObjectRefs,
      confidence: 0.97,
    });
  });
  brain.inputDigest = taskMapSemanticInputDigest(input);

  const bodyContext: PrivacySafeOuraContext = {
    contractVersion: "oura-taskmap-context.v1",
    generatedAt: SHOWCASE_FIXED_NOW,
    sourceKind: "oura",
    coverage: {
      startDay: "2026-07-23",
      endDay: "2026-07-29",
      dailyActivityDays: 0,
      dailyReadinessDays: 7,
      dailySleepDays: 7,
      sleepRecords: 0,
      heartRateSamples: 0,
      classifiedDays: 7,
      unknownDays: 0,
    },
    classifier: {
      version: "showcase-relative-v1",
      axis: "composite_recovery",
      method: "Relative category from a deterministic sanitized seven-day window.",
      minimumMetricsPerDay: 2,
      lowerThreshold: -1,
      upperThreshold: 1,
    },
    days: Array.from({ length: 7 }, (_, index) => {
      const day = 23 + index;
      return {
        dayKey: `2026-07-${day}`,
        axis: "composite_recovery" as const,
        category: day === 29
          ? "below_baseline" as const
          : "within_baseline" as const,
      };
    }),
    privacy: {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
    },
  };

  return {
    input,
    brain,
    bodyContext,
    sourceStates: [
      { source: "agent_session", state: "current" },
      { source: "meeting_notes", state: "current" },
      { source: "calendar", state: "unavailable" },
      { source: "body", state: "current" },
    ],
  };
}

function pathContains(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveTaskMapShowcaseOwnerRoot(
  ownerRoot: string,
  homeDirectory: string = homedir(),
): string {
  const trimmed = ownerRoot.trim();
  if (
    trimmed.length === 0
    || !path.isAbsolute(trimmed)
    || path.normalize(trimmed) !== trimmed
    || CONTROL_CHARACTER.test(trimmed)
  ) {
    throw new TypeError("Task Map showcase requires an absolute isolated owner root");
  }
  const normalizedHome = path.resolve(homeDirectory);
  const normalOwnerRoot = path.join(
    normalizedHome,
    "Library",
    "Application Support",
    "DaoBrew",
  );
  if (
    pathContains(normalOwnerRoot, trimmed)
    || pathContains(trimmed, normalOwnerRoot)
  ) {
    throw new Error("Task Map showcase refuses the normal owner root");
  }
  if (!existsSync(trimmed)) {
    throw new Error("Task Map showcase owner root must already exist");
  }
  const metadata = lstatSync(trimmed);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Task Map showcase owner root must be symlink-free");
  }
  const canonical = realpathSync(trimmed);
  if (canonical !== trimmed) {
    throw new Error("Task Map showcase owner root must be symlink-free");
  }
  return canonical;
}

function showcaseSlice(
  source: "agent_session" | "meeting_notes" | "body",
  ownerScopeDigest: string,
): TaskMapOwnerCollectedSlice<TaskMapNativeSafeSlice> {
  const revision = taskMapContractDigest(`showcase:${source}:revision-v1`);
  return {
    ownerScopeDigest,
    revision,
    sliceDigest: taskMapContractDigest(`showcase:${source}:slice-v1`),
    value: {
      contractVersion: "taskmap-native-safe-source-slice.v1",
      ownerScopeDigest,
      source,
      recordCount: 1,
      records: [{
        identityDigest: taskMapContractDigest(
          `showcase:${source}:identity-v1`,
        ),
        revision,
        occurredAtMs: Date.parse("2026-07-29T18:00:00.000Z"),
      }],
      metadata: {
        showcase: true,
        privacySafe: true,
      },
    },
  };
}

function showcaseRanking(
  projection: ReturnType<typeof buildTaskMapProjection>,
  ownerScopeDigest: string,
) {
  return buildTaskMapTaskRankingPublication({
    projection,
    ownerScopeDigest,
    sourceStatuses: [
      {
        source: "agent_session",
        disposition: "fresh",
        sliceDigest: taskMapContractDigest(
          "showcase:agent_session:slice-v1",
        ),
      },
      {
        source: "meeting_notes",
        disposition: "fresh",
        sliceDigest: taskMapContractDigest(
          "showcase:meeting_notes:slice-v1",
        ),
      },
      {
        source: "calendar",
        disposition: "unavailable",
        sliceDigest: null,
      },
      {
        source: "body",
        disposition: "fresh",
        sliceDigest: taskMapContractDigest("showcase:body:slice-v1"),
      },
    ],
  });
}

function currentWorkForShowcase(
  projection: ReturnType<typeof buildTaskMapProjection>,
  currentness: ReturnType<typeof currentnessForNativeProjection>,
): TaskMapNativeCurrentWorkV1 {
  const task = projection.tasks.find((row) => (
    row.title === "Complete the showcase loop"
    && row.reviewState === "accepted"
    && row.openState === "open"
  ));
  if (task === undefined) {
    throw new Error("Task Map showcase approval target is unavailable");
  }
  const root = projection.roots.find((row) => row.id === task.rootId);
  if (root === undefined || task.returnRoute.state !== "source_owned") {
    throw new Error("Task Map showcase source route is unavailable");
  }
  const sourceById = new Map(
    projection.sources.map((source) => [source.id, source]),
  );
  const contextPointerIds = [...new Set([
    ...task.originPointerIds,
    ...task.citations.map((citation) => citation.pointerId),
  ])]
    .filter((pointerId) => sourceById.get(pointerId)?.sourceKind !== "oura")
    .sort();
  const core = {
    contractVersion: "taskmap-current-work.v1" as const,
    projection: {
      contractVersion: projection.contractVersion,
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      generatedAt: projection.generatedAt,
      projectionDigest: currentness.projectionDigest,
    },
    currentGoal: {
      rootId: root.id,
      title: "Make the local Task Map trustworthy end to end",
      accepted: true as const,
    },
    nextTaskToProve: {
      taskId: task.id,
      rootId: root.id,
      outcome:
        "Complete the showcase loop with a signed app and retained receipts.",
      input: {
        summary:
          "Use only the deterministic source citations already published in this isolated showcase.",
        contextPointerIds,
      },
      predecessors: [],
      doneDefinition: [
        "Projection, currentness, current work, and body context validate.",
        "Approval and start remain separate explicit actions.",
        "Execution returns receipts, an artifact, and an HTML report.",
        "Close prunes active work without deleting retained evidence.",
      ],
      permission: {
        requiresExplicitApproval: true as const,
        approvalGranted: false as const,
      },
      returnTarget: {
        state: "source_owned" as const,
        pointerId: task.returnRoute.pointerId,
      },
      executable: false as const,
    },
    privacy: {
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      rawBiometricsStored: false as const,
    },
  };
  const currentWork: TaskMapNativeCurrentWorkV1 = {
    ...core,
    artifactDigest: taskMapContractDigest(core),
  };
  return validateTaskMapNativeCurrentWork(
    currentWork,
    Buffer.from(taskMapContractCanonicalJson(currentWork), "utf8"),
    projection,
    currentness,
  );
}

async function writeCanonicalOwnerArtifact(
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeFile(
    filePath,
    taskMapContractCanonicalJson(value),
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );
  await chmod(filePath, 0o600);
}

async function stageReferencedShowcasePredecessor(
  taskMapRoot: string,
  ownerScopeDigest: string,
  candidate: TaskMapNativePublicationCandidate,
  currentWork: TaskMapNativeCurrentWorkV1,
): Promise<void> {
  const generationId = taskMapContractDigest(candidate);
  const generationRoot = path.join(
    taskMapRoot,
    TASKMAP_NATIVE_GENERATIONS_DIRECTORY,
  );
  const generationDirectory = path.join(generationRoot, generationId);
  await mkdir(generationRoot, { recursive: false, mode: 0o700 });
  await mkdir(generationDirectory, { recursive: false, mode: 0o700 });
  await chmod(generationRoot, 0o700);
  await chmod(generationDirectory, 0o700);
  const artifacts = {
    projection: {
      filename: "taskmap-projection.v1.json",
      sha256: taskMapContractDigest(candidate.projection),
    },
    currentness: {
      filename: "taskmap-currentness.v1.json",
      sha256: taskMapContractDigest(candidate.currentness),
    },
    currentWork: {
      filename: "taskmap-current-work.v1.json",
      sha256: taskMapContractDigest(currentWork),
    },
    ranking: {
      filename: TASKMAP_TASK_RANKING_FILENAME,
      sha256: taskMapContractDigest(candidate.ranking),
    },
  };
  await writeCanonicalOwnerArtifact(
    path.join(generationDirectory, artifacts.projection.filename),
    candidate.projection,
  );
  await writeCanonicalOwnerArtifact(
    path.join(generationDirectory, artifacts.currentness.filename),
    candidate.currentness,
  );
  await writeCanonicalOwnerArtifact(
    path.join(generationDirectory, artifacts.currentWork.filename),
    currentWork,
  );
  await writeCanonicalOwnerArtifact(
    path.join(generationDirectory, artifacts.ranking.filename),
    candidate.ranking,
  );
  const readyProofTargets = buildTaskMapReadyProofTargets({
    projection: candidate.projection,
    currentness: candidate.currentness,
    proofTargets: [{
      ...structuredClone(currentWork.nextTaskToProve),
      approvalPackage: {
        contractVersion: "taskmap-local-approval-inspection.v1",
        readyForLocalApproval: true,
        currentWorkApprovalGranted: false,
        currentWorkExecutable: false,
        authorizationScope: "prepare_local_package_only",
        dispatchAuthorized: false,
        sourceWritebackAuthorized: false,
        codexTaskStartAuthorized: false,
        sourceCompletionAuthorized: false,
        outcomeVerificationAuthorized: false,
      },
    }],
  });
  await writeCanonicalOwnerArtifact(
    path.join(
      generationDirectory,
      TASKMAP_NATIVE_READY_PROOF_TARGETS_FILENAME,
    ),
    readyProofTargets,
  );
  const manifest = {
    contractVersion: TASKMAP_NATIVE_GENERATION_MANIFEST_VERSION,
    generationId,
    ownerScopeDigest,
    graphInputDigest: taskMapContractDigest({
      domain: "taskmap-showcase-bootstrap-graph.v1",
      ownerScopeDigest,
    }),
    candidateDigest: generationId,
    requestedAtMs: Date.parse(SHOWCASE_FIXED_NOW),
    artifacts,
  };
  await writeCanonicalOwnerArtifact(
    path.join(
      generationDirectory,
      TASKMAP_NATIVE_GENERATION_MANIFEST_FILENAME,
    ),
    manifest,
  );
  await writeCanonicalOwnerArtifact(
    path.join(taskMapRoot, TASKMAP_NATIVE_GENERATION_REFERENCE_FILENAME),
    {
      contractVersion: TASKMAP_NATIVE_GENERATION_REFERENCE_VERSION,
      generationId,
      ownerScopeDigest,
      manifestDigest: taskMapContractDigest(manifest),
    },
  );
}

function showcaseBodySignalAssessment(
  projection: TaskMapNativePublicationCandidate["projection"],
  physiologicalSnapshotDigest: string,
): TaskMapBodySignalAssessmentV1 {
  const observedDate = "2026-07-29";
  const base = {
    contractVersion: TASKMAP_BODY_SIGNAL_ASSESSMENT_VERSION,
    projection: {
      runId: projection.runId,
      inputDigest: projection.inputDigest,
      projectionDigest:
        diffTaskMapProjections(null, projection).currentProjectionDigest,
    },
    physiologicalSnapshotDigest,
    assessedAt: SHOWCASE_REFRESH_NOW,
    sourceFamily: "physiological" as const,
    signal: {
      axis: "composite_recovery" as const,
      displayName: "Readiness + Sleep" as const,
      comparison: "relative_to_recent_personal_range" as const,
      targetCategory: "below_baseline" as const,
    },
    coverage: {
      startDay: observedDate,
      endDay: observedDate,
      classifiedDays: 1,
      unknownDays: 0,
    },
    roots: projection.roots.map((root) => {
      const matchedWorkSources = [...new Set(root.citations.flatMap(
        (citation) => citation.sourceKind === "codex_session"
          ? ["Codex sessions" as const]
          : citation.sourceKind === "gemini_meet"
            ? ["Gemini meeting notes" as const]
            : [],
      ))].sort();
      return {
        rootId: root.id,
        relationship: "body_informed" as const,
        evidenceLevel: "body_informed" as const,
        observedSignalDates: [observedDate],
        matchedWorkDates: [observedDate],
        matchedWorkSources,
        matchedDateCount: 1,
        signalSummary:
          "Readiness + Sleep was below your recent personal range on 2026-07-29 within 2026-07-29 through 2026-07-29.",
        relevanceSummary:
          `Body-informed: accepted work in this workstream occurred on 2026-07-29, when recovery was below your recent personal range in ${matchedWorkSources.join(" and ")}. This is an association, not proof of cause.`,
        reasonCode: null,
      };
    }).sort((left, right) => left.rootId.localeCompare(right.rootId)),
    boundary:
      "Body-informed context only. Association is not proof of cause." as const,
    privacy: {
      rawBiometricsStored: false as const,
      sourceBodiesStored: false as const,
      localPathsStored: false as const,
      providerIdentityStored: false as const,
    },
  };
  return {
    ...base,
    artifactDigest: taskMapContractDigest(base),
  };
}

export async function publishTaskMapShowcase(
  options: PublishTaskMapShowcaseOptions,
): Promise<PublishTaskMapShowcaseResult> {
  const ownerRoot = resolveTaskMapShowcaseOwnerRoot(
    options.ownerRoot,
    options.homeDirectory,
  );
  const taskMapRoot = path.join(ownerRoot, "taskmap");
  const runtimeRoot = path.join(ownerRoot, "taskmap-refresh");
  if (existsSync(taskMapRoot) || existsSync(runtimeRoot)) {
    throw new Error("Task Map showcase owner root must be unused");
  }
  await mkdir(taskMapRoot, { recursive: false, mode: 0o700 });
  await mkdir(runtimeRoot, { recursive: false, mode: 0o700 });
  await chmod(taskMapRoot, 0o700);
  await chmod(runtimeRoot, 0o700);

  const showcaseOwnerPlan = await loadConfirmedTaskMapOwner(
    options.homeDirectory ?? homedir(),
  );
  if (!showcaseOwnerPlan.ok) {
    throw new Error(showcaseOwnerPlan.reason);
  }

  const projectionPath = path.join(
    taskMapRoot,
    "taskmap-projection.v1.json",
  );
  const currentnessPath = path.join(
    taskMapRoot,
    "taskmap-currentness.v1.json",
  );
  const currentWorkPath = path.join(
    taskMapRoot,
    "taskmap-current-work.v1.json",
  );
  const bodyContextPath = path.join(
    taskMapRoot,
    "taskmap-body-context.v1.json",
  );
  const bodyAssessmentPath = path.join(
    taskMapRoot,
    TASKMAP_BODY_SIGNAL_ASSESSMENT_FILENAME,
  );
  const source = buildTaskMapShowcaseSource();
  const predecessorProjection = buildTaskMapProjection(
    source.input,
    source.brain,
    { arm: "E4", now: SHOWCASE_FIXED_NOW },
  );
  if (
    predecessorProjection.runStatus !== "accepted"
    || taskMapProjectionArtifactValidationReasons(predecessorProjection)
      .length > 0
  ) {
    throw new Error("Task Map showcase predecessor projection was rejected");
  }
  const predecessorCurrentness = currentnessForNativeProjection(
    predecessorProjection,
    null,
  );
  const predecessorCurrentWork = currentWorkForShowcase(
    predecessorProjection,
    predecessorCurrentness,
  );
  const predecessorRanking = showcaseRanking(
    predecessorProjection,
    showcaseOwnerPlan.owner.ownerScopeDigest,
  );
  // This excluded developer harness stages one complete referenced bootstrap
  // predecessor before the refresh service starts. Fixed files below are only
  // compatibility output; the same verified generation reference used by
  // production readers controls visibility.
  await writeCanonicalOwnerArtifact(projectionPath, predecessorProjection);
  await writeCanonicalOwnerArtifact(currentnessPath, predecessorCurrentness);
  await writeCanonicalOwnerArtifact(
    currentWorkPath,
    predecessorCurrentWork,
  );
  await stageReferencedShowcasePredecessor(
    taskMapRoot,
    showcaseOwnerPlan.owner.ownerScopeDigest,
    {
      contractVersion: TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
      projection: predecessorProjection,
      currentness: predecessorCurrentness,
      ranking: predecessorRanking,
    },
    predecessorCurrentWork,
  );

  const successorProjection = buildTaskMapProjection(
    source.input,
    source.brain,
    {
      arm: "E4",
      now: SHOWCASE_REFRESH_NOW,
      previousProjection: predecessorProjection,
    },
  );
  const successorCurrentness = currentnessForNativeProjection(
    successorProjection,
    predecessorCurrentness,
  );
  const successorCandidate: TaskMapNativePublicationCandidate = {
    contractVersion: TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
    projection: successorProjection,
    currentness: successorCurrentness,
    ranking: showcaseRanking(
      successorProjection,
      showcaseOwnerPlan.owner.ownerScopeDigest,
    ),
  };
  const service = new TaskMapNativeRefreshService({
    confirmedOwner: showcaseOwnerPlan.owner,
    runtimeRoot,
    projectionPath,
    currentnessPath,
    collectors: {
      agent_session: async () => showcaseSlice(
        "agent_session",
        showcaseOwnerPlan.owner.ownerScopeDigest,
      ),
      meeting_notes: async () => showcaseSlice(
        "meeting_notes",
        showcaseOwnerPlan.owner.ownerScopeDigest,
      ),
      calendar: async () => {
        throw new Error("Showcase calendar is intentionally unavailable");
      },
      body: async () => showcaseSlice(
        "body",
        showcaseOwnerPlan.owner.ownerScopeDigest,
      ),
    },
    graphBuilder: async (input) => {
      const freshSources = input.graphInput.sources
        .filter((row) => row.value !== null)
        .map((row) => row.source)
        .sort();
      if (taskMapContractCanonicalJson(freshSources)
        !== taskMapContractCanonicalJson([
          "agent_session",
          "body",
          "meeting_notes",
        ])) {
        throw new Error("Task Map showcase source truth changed");
      }
      return {
        candidateDigest: taskMapContractDigest(successorCandidate),
        candidate: successorCandidate as unknown as Record<string, unknown>,
      };
    },
    nowMs: () => Date.parse(SHOWCASE_REFRESH_NOW),
  });
  const refresh = await service.requestRefresh("manual");
  if (
    refresh.refreshStatus !== "published"
    || refresh.publicationVerified !== true
  ) {
    throw new Error("Task Map showcase native refresh did not publish");
  }

  const projectionBytes = await readFile(projectionPath);
  const currentnessBytes = await readFile(currentnessPath);
  const currentWorkBytes = await readFile(currentWorkPath);
  const projection = JSON.parse(
    projectionBytes.toString("utf8"),
  ) as typeof successorProjection;
  const currentness = JSON.parse(
    currentnessBytes.toString("utf8"),
  ) as typeof successorCurrentness;
  const currentWork = JSON.parse(currentWorkBytes.toString("utf8"));
  if (
    taskMapProjectionArtifactValidationReasons(projection).length > 0
    || currentness.projectionDigest
      !== diffTaskMapProjections(null, projection).currentProjectionDigest
  ) {
    throw new Error("Task Map showcase publication failed strict validation");
  }
  validateTaskMapNativeCurrentWork(
    currentWork,
    currentWorkBytes,
    projection,
    currentness,
  );
  const body = buildTaskMapBodyContextDisclosure(
    source.input,
    projection,
    source.bodyContext,
  );
  await writeCanonicalOwnerArtifact(bodyContextPath, body);
  const bodyAssessment = showcaseBodySignalAssessment(
    projection,
    taskMapContractDigest({
      domain: "taskmap-showcase-physiological-snapshot.1",
      bodyContext: source.bodyContext,
    }),
  );
  await writeCanonicalOwnerArtifact(bodyAssessmentPath, bodyAssessment);
  const persistedBody = JSON.parse(
    (await readFile(bodyContextPath)).toString("utf8"),
  );
  if (
    persistedBody.projectionRunId !== projection.runId
    || persistedBody.projectionInputDigest !== projection.inputDigest
    || persistedBody.nodes.length === 0
  ) {
    throw new Error("Task Map showcase body disclosure failed validation");
  }

  return { refresh };
}
