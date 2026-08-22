import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TASKMAP_ALGORITHM_POLICY_DIGEST } from "../src/engine/taskmap/harness.js";
import {
  TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1,
  TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS,
  validateTaskMapDecomposition,
  validateTaskMapDecompositionValidationResult,
  type TaskMapDecompositionValidationCandidateV1,
  type TaskMapDecompositionValidationContextV1,
} from "../src/engine/taskmap/decomposition-validation.js";
import { buildTaskMapCodRankingPublication } from "../src/engine/taskmap/cod-ranking-publication.js";
import {
  TASKMAP_DECOMPOSITION_STATION_ID,
  buildTaskMapMethodLibrary,
  proposeTaskMapDecomposition,
  type TaskMapDecompositionResultV1,
} from "../src/engine/taskmap/method-library.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";
import {
  TASKMAP_ALGORITHM_POLICY_VERSION,
  TASKMAP_CONTRACT_VERSION,
  type TaskMapCitation,
  type TaskMapEdge,
  type TaskMapProjectionV1,
  type TaskMapScoreBreakdown,
  type TaskMapTask,
} from "../src/engine/taskmap/types.js";

const digest = (label: string): string => taskMapContractDigest(`decomposition-validation:${label}`);
const ROOT_ID = `tmr_${digest("root").slice(0, 16)}`;
const PARENT_ID = `tmt_${digest("parent").slice(0, 16)}`;
const PEER_ID = `tmt_${digest("peer").slice(0, 16)}`;
const ZERO_SCORE: TaskMapScoreBreakdown = {
  sourcePriority: 0,
  deadlinePressure: 0,
  dependencyImpact: 0,
  recurrence: 0,
  staleOpen: 0,
  evidenceStrength: 0,
  bodyBonus: 0,
  total: 0,
};

function citation(pointerId: string, sourceKind: "codex_session" | "oura" = "codex_session"): TaskMapCitation {
  return {
    eventId: `event-${digest(pointerId).slice(0, 16)}`,
    pointerId,
    sourceKind,
    sourceRefHash: digest(`source:${pointerId}`),
    occurredAt: "2026-08-14T12:00:00.000Z",
    extractionConfidence: 1,
  };
}

function task(id: string, pointerId: string): TaskMapTask {
  return {
    id,
    rootId: ROOT_ID,
    title: `Accepted owner work ${id.slice(-4)}`,
    summary: "Current accepted work.",
    reviewState: "accepted",
    openState: "open",
    authority: "source_system",
    taskHomePointerId: pointerId,
    originPointerIds: [pointerId],
    returnRoute: { state: "source_return", pointerId, requiresApproval: true },
    citations: [citation(pointerId)],
    score: ZERO_SCORE,
    whyNow: [],
    discoveredBy: ["agent_session"],
    bodyContextCount: 0,
  };
}

function projection(): TaskMapProjectionV1 {
  const parent = task(PARENT_ID, "session-parent");
  const peer = task(PEER_ID, "session-peer");
  return {
    contractVersion: TASKMAP_CONTRACT_VERSION,
    algorithmPolicyVersion: TASKMAP_ALGORITHM_POLICY_VERSION,
    algorithmPolicyDigest: TASKMAP_ALGORITHM_POLICY_DIGEST,
    runStatus: "accepted",
    arm: "E4",
    runId: `tmrun_${digest("run").slice(0, 16)}`,
    generatedAt: "2026-08-14T12:00:00.000Z",
    inputDigest: digest("input"),
    brain: null,
    sources: ["session-parent", "session-peer"].map((id) => ({
      id,
      sourceKind: "codex_session" as const,
      authority: "source_system" as const,
      syncMode: "reference_only" as const,
      capabilities: ["read_task" as const],
    })),
    roots: [{
      id: ROOT_ID,
      title: "Accepted owner work",
      summary: "Current accepted root.",
      taskIds: [parent.id, peer.id],
      memberObjectRefs: ["work-parent", "work-peer"],
      citations: [],
      causalGrade: "C0_NO_DATA",
      bodyContextCount: 0,
      scoreBreakdown: {
        maxChildActionability: 0,
        rootRecurrence: 0,
        evidenceStrength: 0,
        sourceBreadth: 0,
        actionableLoad: 0,
        dependencyBreadth: 0,
        bodyBonus: 0,
        total: 0,
      },
      score: 0,
      whyNow: [],
    }],
    tasks: [parent, peer],
    edges: [],
    rejections: [],
    privacy: { sourceBodiesStored: false, localPathsStored: false, rawBiometricsStored: false },
  };
}

async function task7Result(
  pointerId = "session-parent",
  taskId = PARENT_ID,
  subtaskCount = 1,
): Promise<TaskMapDecompositionResultV1> {
  const library = buildTaskMapMethodLibrary({
    templates: [{
      templateId: "release-checklist-v1",
      domainSignature: "software.release",
      methodId: "verified-release",
      subtasks: Array.from({ length: subtaskCount }, (_, index) => ({
        title: `Verify release step ${["alpha", "beta"][index] ?? "later"}`,
        summary: `Run the accepted ${["alpha", "beta"][index] ?? "later"} verification step.`,
      })),
    }],
  });
  return proposeTaskMapDecomposition({
    workItem: {
      taskId,
      domainSignature: "software.release",
      title: "Ship the release",
      summary: "Prepare and verify the accepted release.",
      citationPointerIds: [pointerId],
    },
    library,
  });
}

async function task7ReplayResult(): Promise<TaskMapDecompositionResultV1> {
  return proposeTaskMapDecomposition({
    workItem: {
      taskId: PARENT_ID,
      domainSignature: "software.unknown",
      title: "Ship the release",
      summary: "Prepare and verify the accepted release.",
      citationPointerIds: ["session-parent"],
    },
    library: buildTaskMapMethodLibrary({ templates: [] }),
    llmModelId: "offline-replay-v1",
    runner: async () => ({
      outputJson: JSON.stringify({
        proposals: [{
          methodId: "replayed-release",
          subtasks: [{
            title: "Verify replayed release",
            summary: "Run the replayed verification contract.",
            citationPointerIds: ["session-parent"],
          }],
        }],
      }),
    }),
  });
}

async function task7GeminiResult(): Promise<TaskMapDecompositionResultV1> {
  return proposeTaskMapDecomposition({
    workItem: {
      taskId: PARENT_ID,
      domainSignature: "software.gemini",
      title: "Ship the release",
      summary: "Prepare and verify the accepted release.",
      citationPointerIds: ["session-parent"],
    },
    library: buildTaskMapMethodLibrary({ templates: [] }),
    station: {
      provider: {
        transport: "gemini-remote",
        executable: "",
        args: [],
        model: "gemini-3.1-flash-lite",
      },
      run: async (request) => ({
        stationId: TASKMAP_DECOMPOSITION_STATION_ID,
        model: "gemini-3.1-flash-lite",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify({
          proposals: [{
            methodId: "gemini-release",
            subtasks: [{
              title: "Verify Gemini release",
              summary: "Run the Gemini verification contract.",
              citationPointerIds: ["session-parent"],
            }],
          }],
        }),
        producedAt: "2026-08-14T12:00:00.000Z",
        transport: "gemini-remote",
      }),
    },
  });
}

async function task7UnavailableResult(): Promise<TaskMapDecompositionResultV1> {
  return proposeTaskMapDecomposition({
    workItem: {
      taskId: PARENT_ID,
      domainSignature: "software.unavailable",
      title: "Ship the release",
      summary: "Prepare and verify the accepted release.",
      citationPointerIds: ["session-parent"],
    },
    library: buildTaskMapMethodLibrary({ templates: [] }),
  });
}

function candidateFrom(sourceResult: TaskMapDecompositionResultV1): TaskMapDecompositionValidationCandidateV1 {
  const proposal = structuredClone(sourceResult.proposals[0]!);
  return {
    ...proposal,
    sourceResultArtifactDigest: sourceResult.artifactDigest,
    sourceProposalDigest: taskMapContractDigest(proposal),
    parentTaskId: PARENT_ID,
    edges: [{
      id: `tme_${digest("edge").slice(0, 16)}`,
      from: proposal.subtasks[0]!.subtaskId,
      to: PARENT_ID,
      relation: "informed_by",
      citationPointerIds: ["session-parent"],
    }],
  };
}

function context(sourceResult: TaskMapDecompositionResultV1): TaskMapDecompositionValidationContextV1 {
  return { projection: projection(), sourceResult };
}

async function fixture() {
  const sourceResult = await task7Result();
  return { sourceResult, candidate: candidateFrom(sourceResult), context: context(sourceResult) };
}

function reseal<T extends { artifactDigest: string }>(artifact: T): T {
  const { artifactDigest: _oldDigest, ...core } = artifact;
  artifact.artifactDigest = taskMapContractDigest(core);
  return artifact;
}

function projectionEdge(label: string, from: string, to: string, relation: TaskMapEdge["relation"] = "depends_on"): TaskMapEdge {
  return {
    id: `tme_${digest(label).slice(0, 16)}`,
    from,
    to,
    relation,
    citations: [citation("session-parent")],
  };
}

function rankingInput(projectionValue: TaskMapProjectionV1) {
  return {
    projection: projectionValue,
    ownerScopeDigest: digest("owner"),
    sourceStatuses: [
      { source: "agent_session" as const, disposition: "fresh" as const, sliceDigest: digest("agent") },
      { source: "meeting_notes" as const, disposition: "unavailable" as const, sliceDigest: null },
      { source: "calendar" as const, disposition: "unavailable" as const, sliceDigest: null },
      { source: "body" as const, disposition: "unavailable" as const, sliceDigest: null },
    ],
    factors: projectionValue.tasks.map((candidate) => ({
      taskId: candidate.id,
      costOfDelayBasisPoints: 1_000,
      effort: 1,
    })),
  };
}

describe("Task Map Station-3 five-step validation", () => {
  it("passes a canonically bound Task-7 proposal through all five ordered steps", async () => {
    const input = await fixture();
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.equal(result.valid, true);
    assert.deepEqual(result.steps.map((step) => step.stepId), TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS);
    assert.ok(result.steps.every((step) => step.passed && step.reasons.length === 0));
    assert.deepEqual(validateTaskMapDecompositionValidationResult(result, input.candidate, input.context), result);
  });

  it("fails closed for missing or mismatched Task-7 artifact and proposal digests", async () => {
    for (const mutate of [
      (draft: Record<string, unknown>) => { delete draft.sourceResultArtifactDigest; },
      (draft: Record<string, unknown>) => { draft.sourceResultArtifactDigest = "0".repeat(64); },
      (draft: Record<string, unknown>) => { delete draft.sourceProposalDigest; },
      (draft: Record<string, unknown>) => { draft.sourceProposalDigest = "0".repeat(64); },
    ]) {
      const input = await fixture();
      const candidate = structuredClone(input.candidate) as unknown as Record<string, unknown>;
      mutate(candidate);
      const result = validateTaskMapDecomposition(candidate, input.context);
      assert.equal(result.valid, false);
      assert.ok(result.steps[0]!.reasons.some((reason) => /source|digest|Task-7/i.test(reason)));
    }
    const missingContextResult = await fixture();
    const missingSourceResult = {
      projection: missingContextResult.context.projection,
    } as unknown as TaskMapDecompositionValidationContextV1;
    assert.equal(validateTaskMapDecomposition(
      missingContextResult.candidate,
      missingSourceResult,
    ).valid, false);
  });

  it("fails closed for an invalid Task-7 result seal and re-sealed authority forgery", async () => {
    const brokenSeal = await fixture();
    brokenSeal.context.sourceResult = structuredClone(brokenSeal.context.sourceResult);
    brokenSeal.context.sourceResult.artifactDigest = "0".repeat(64);
    assert.equal(validateTaskMapDecomposition(brokenSeal.candidate, brokenSeal.context).valid, false);

    const forged = await fixture();
    forged.context.sourceResult = structuredClone(forged.context.sourceResult);
    const mutable = forged.context.sourceResult as unknown as {
      authority: { edgesWritten: boolean; requiresOwnerAcceptance: boolean };
      artifactDigest: string;
    };
    mutable.authority.edgesWritten = true;
    reseal(mutable);
    forged.candidate.sourceResultArtifactDigest = mutable.artifactDigest;
    assert.equal(validateTaskMapDecomposition(forged.candidate, forged.context).valid, false);

    const forgedState = await fixture();
    forgedState.context.sourceResult = structuredClone(forgedState.context.sourceResult);
    forgedState.context.sourceResult.source = "llm_station";
    reseal(forgedState.context.sourceResult);
    forgedState.candidate.sourceResultArtifactDigest = forgedState.context.sourceResult.artifactDigest;
    assert.equal(validateTaskMapDecomposition(
      forgedState.candidate,
      forgedState.context,
    ).valid, false);
  });

  it("fails closed when the selected proposal is absent or differs from canonical Task-7 content", async () => {
    for (const mutate of [
      (draft: TaskMapDecompositionValidationCandidateV1) => {
        draft.proposalId = `tmdecomp_${digest("absent").slice(0, 16)}`;
      },
      (draft: TaskMapDecompositionValidationCandidateV1) => { draft.methodId = "forged-method"; },
      (draft: TaskMapDecompositionValidationCandidateV1) => {
        draft.subtasks[0]!.summary = "Forged subtask content.";
      },
    ]) {
      const input = await fixture();
      mutate(input.candidate);
      input.candidate.sourceProposalDigest = taskMapContractDigest({
        proposalId: input.candidate.proposalId,
        methodId: input.candidate.methodId,
        subtasks: input.candidate.subtasks,
      });
      const result = validateTaskMapDecomposition(input.candidate, input.context);
      assert.equal(result.valid, false);
      assert.ok(result.steps[0]!.reasons.some((reason) => /Task-7|proposal|canonical/i.test(reason)));
    }
  });

  it("rejects cross-task substitution by recomputing Task-7 proposal and subtask identities", async () => {
    const sourceResult = await task7Result("session-peer", PARENT_ID);
    const candidate = candidateFrom(sourceResult);
    candidate.parentTaskId = PEER_ID;
    candidate.edges[0]!.to = PEER_ID;
    candidate.edges[0]!.citationPointerIds = ["session-peer"];
    const validationContext = context(sourceResult);

    const result = validateTaskMapDecomposition(candidate, validationContext);
    assert.equal(result.valid, false);
    assert.ok(result.steps[0]!.reasons.some((reason) => /identity|Task-7|parent/i.test(reason)));
  });

  it("requires proposal citations to support the parent and edge citations to support endpoints", async () => {
    const wrongParentEvidence = await task7Result("session-peer");
    const wrongParentCandidate = candidateFrom(wrongParentEvidence);
    wrongParentCandidate.edges[0]!.citationPointerIds = ["session-peer"];
    const proposalResult = validateTaskMapDecomposition(
      wrongParentCandidate,
      context(wrongParentEvidence),
    );
    assert.equal(proposalResult.valid, false);
    assert.ok(proposalResult.steps[1]!.reasons.some((reason) => /parent|support/i.test(reason)));

    const endpointInput = await fixture();
    endpointInput.candidate.edges.push({
      id: `tme_${digest("unsupported-peer-edge").slice(0, 16)}`,
      from: endpointInput.candidate.subtasks[0]!.subtaskId,
      to: PEER_ID,
      relation: "informed_by",
      citationPointerIds: ["session-parent"],
    });
    const endpointResult = validateTaskMapDecomposition(
      endpointInput.candidate,
      endpointInput.context,
    );
    assert.equal(endpointResult.valid, false);
    assert.ok(endpointResult.steps[1]!.reasons.some((reason) => /endpoint|support/i.test(reason)));
  });

  it("enforces exact Task-7 LLM provider/transport correlations and unavailable state", async () => {
    const gemini = await task7GeminiResult();
    assert.equal(gemini.llm.providerId, "gemini-remote");
    assert.equal(gemini.llm.transport, "gemini-remote");
    assert.equal(
      validateTaskMapDecomposition(candidateFrom(gemini), context(gemini)).valid,
      true,
    );
    const forgedLocal = structuredClone(gemini);
    (forgedLocal.llm as unknown as { providerId: string; transport: string }).providerId =
      "local-rules";
    (forgedLocal.llm as unknown as { transport: string }).transport = "local-rules";
    reseal(forgedLocal);
    assert.equal(
      validateTaskMapDecomposition(
        candidateFrom(forgedLocal),
        context(forgedLocal),
      ).valid,
      false,
    );

    const replay = await task7ReplayResult();
    assert.equal(validateTaskMapDecomposition(candidateFrom(replay), context(replay)).valid, true);

    const remoteReplay = structuredClone(replay);
    remoteReplay.llm.providerId = "gemini-remote";
    remoteReplay.llm.transport = "gemini-remote";
    reseal(remoteReplay);
    assert.equal(
      validateTaskMapDecomposition(
        candidateFrom(remoteReplay),
        context(remoteReplay),
      ).valid,
      true,
    );

    const forgedReplay = structuredClone(replay);
    (forgedReplay.llm as unknown as { providerId: string }).providerId = "forged-provider";
    reseal(forgedReplay);
    const forgedCandidate = candidateFrom(forgedReplay);
    const forgedResult = validateTaskMapDecomposition(forgedCandidate, context(forgedReplay));
    assert.equal(forgedResult.valid, false);
    assert.ok(forgedResult.steps[0]!.reasons.some((reason) => /provider|transport|LLM/i.test(reason)));

    const mismatchedReplay = structuredClone(replay);
    (mismatchedReplay.llm as unknown as { providerId: string }).providerId = "claude-cli";
    reseal(mismatchedReplay);
    const mismatchedResult = validateTaskMapDecomposition(
      candidateFrom(mismatchedReplay),
      context(mismatchedReplay),
    );
    assert.equal(mismatchedResult.valid, false);
    assert.ok(mismatchedResult.steps[0]!.reasons.some((reason) => /provider|transport|LLM/i.test(reason)));

    const unavailable = structuredClone(await task7UnavailableResult());
    unavailable.unavailableReason = null;
    reseal(unavailable);
    const unavailableCandidate = {
      ...(await fixture()).candidate,
      sourceResultArtifactDigest: unavailable.artifactDigest,
    };
    const unavailableResult = validateTaskMapDecomposition(
      unavailableCandidate,
      context(unavailable),
    );
    assert.equal(unavailableResult.valid, false);
    assert.ok(unavailableResult.steps[0]!.reasons.some((reason) => /unavailable|zero|LLM/i.test(reason)));

    const forgedUnavailableOutput = structuredClone(await task7UnavailableResult());
    forgedUnavailableOutput.llm.outputDigest = "0".repeat(64);
    reseal(forgedUnavailableOutput);
    const forgedUnavailableCandidate = {
      ...(await fixture()).candidate,
      sourceResultArtifactDigest: forgedUnavailableOutput.artifactDigest,
    };
    const forgedUnavailableResult = validateTaskMapDecomposition(
      forgedUnavailableCandidate,
      context(forgedUnavailableOutput),
    );
    assert.equal(forgedUnavailableResult.valid, false);
    assert.ok(forgedUnavailableResult.steps[0]!.reasons.some((reason) => /unavailable|zero|LLM/i.test(reason)));
  });

  it("uses the Task-7 256-character model provenance ceiling", async () => {
    const replay = structuredClone(await task7ReplayResult());
    replay.llm.modelId = "m".repeat(257);
    reseal(replay);
    const result = validateTaskMapDecomposition(candidateFrom(replay), context(replay));
    assert.equal(result.valid, false);
    assert.ok(result.steps[0]!.reasons.some((reason) => /model|LLM/i.test(reason)));
  });

  it("rejects an oversized supplied Task-7 result before trusting its seal", async () => {
    const input = await fixture();
    const validationContext = {
      projection: input.context.projection,
      sourceResult: {
        ...input.sourceResult,
        padding: "x".repeat(TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxSourceResultBytes),
      },
    } as unknown as TaskMapDecompositionValidationContextV1;
    const result = validateTaskMapDecomposition(input.candidate, validationContext);
    assert.equal(result.valid, false);
    assert.ok(result.steps[0]!.reasons.some((reason) => /Task-7|bounded|bytes/i.test(reason)));
  });

  for (const [name, mutate, expectedStep] of [
    ["missing required field", (draft: Record<string, unknown>) => {
      delete (draft.subtasks as Array<Record<string, unknown>>)[0]!.summary;
    }, "field_completeness"],
    ["citation to an unknown pointer", (draft: Record<string, unknown>) => {
      (draft.edges as Array<Record<string, unknown>>)[0]!.citationPointerIds = ["unknown-pointer"];
    }, "citation_validity"],
    ["cycle in proposed edges", (draft: Record<string, unknown>) => {
      const subtaskId = (draft.subtasks as Array<{ subtaskId: string }>)[0]!.subtaskId;
      draft.edges = [
        { id: `tme_${digest("cycle-a").slice(0, 16)}`, from: PARENT_ID, to: subtaskId, relation: "depends_on", citationPointerIds: ["session-parent"] },
        { id: `tme_${digest("cycle-b").slice(0, 16)}`, from: subtaskId, to: PARENT_ID, relation: "depends_on", citationPointerIds: ["session-parent"] },
      ];
    }, "acyclicity"],
    ["illegal edge relation for its endpoints", (draft: Record<string, unknown>) => {
      (draft.edges as Array<Record<string, unknown>>)[0]!.relation = "advances";
    }, "edge_type_legality"],
    ["privacy leak in text", (draft: Record<string, unknown>) => {
      (draft.edges as Array<Record<string, unknown>>)[0]!.id = "/Users/alice/private/edge";
    }, "privacy_boundary"],
  ] as const) {
    it(`rejects ${name} while still reporting all five steps`, async () => {
      const input = await fixture();
      const candidate = structuredClone(input.candidate) as unknown as Record<string, unknown>;
      mutate(candidate);
      const result = validateTaskMapDecomposition(candidate, input.context);
      assert.equal(result.valid, false);
      assert.equal(result.steps.length, 5);
      assert.equal(result.steps.find((step) => !step.passed)?.stepId, expectedStep);
      assert.deepEqual(result.steps.map((step) => step.stepId), TASKMAP_DECOMPOSITION_VALIDATION_STEP_IDS);
    });
  }

  it("uses canonical projection validation and rejects body-only citation evidence", async () => {
    const malformedProjection = await fixture();
    malformedProjection.context.projection.tasks[0]!.id = "not-a-canonical-task-id";
    const malformedResult = validateTaskMapDecomposition(
      malformedProjection.candidate,
      malformedProjection.context,
    );
    assert.equal(malformedResult.valid, false);
    assert.ok(malformedResult.steps[0]!.reasons.some((reason) => /projection artifact/i.test(reason)));

    const bodyResult = await task7Result("oura-body");
    const bodyCandidate = candidateFrom(bodyResult);
    bodyCandidate.edges[0]!.citationPointerIds = ["oura-body"];
    const bodyContext = context(bodyResult);
    bodyContext.projection.sources.push({
      id: "oura-body",
      sourceKind: "oura",
      authority: "source_system",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
    const bodyValidation = validateTaskMapDecomposition(bodyCandidate, bodyContext);
    assert.equal(bodyValidation.valid, false);
    assert.ok(bodyValidation.steps[1]!.reasons.some((reason) => /body|oura|non-body/i.test(reason)));
  });

  it("requires trim-stable identifiers", async () => {
    const input = await fixture();
    input.candidate.edges[0]!.id = ` ${input.candidate.edges[0]!.id} `;
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.equal(result.valid, false);
    assert.ok(result.steps[0]!.reasons.some((reason) => /id|trim|bounded/i.test(reason)));
  });

  it("rejects duplicate edge identities across proposed and existing edges", async () => {
    const proposedDuplicate = await fixture();
    proposedDuplicate.candidate.edges.push({
      ...proposedDuplicate.candidate.edges[0]!,
      id: `tme_${digest("duplicate-proposed").slice(0, 16)}`,
    });
    assert.ok(validateTaskMapDecomposition(proposedDuplicate.candidate, proposedDuplicate.context)
      .steps[3]!.reasons.some((reason) => /duplicate/i.test(reason)));

    const existingDuplicate = await fixture();
    existingDuplicate.context.projection.edges.push(projectionEdge("existing-duplicate", PARENT_ID, PEER_ID, "informed_by"));
    existingDuplicate.candidate.edges.push({
      id: `tme_${digest("proposed-existing-duplicate").slice(0, 16)}`,
      from: PARENT_ID,
      to: PEER_ID,
      relation: "informed_by",
      citationPointerIds: ["session-parent"],
    });
    assert.ok(validateTaskMapDecomposition(existingDuplicate.candidate, existingDuplicate.context)
      .steps[3]!.reasons.some((reason) => /duplicate/i.test(reason)));
  });

  it("rejects global identity collisions across proposed and existing nodes and edges", async () => {
    for (const collidingId of [PARENT_ID, `tme_${digest("existing-id").slice(0, 16)}`]) {
      const input = await fixture();
      if (collidingId.startsWith("tme_")) {
        input.context.projection.edges.push(projectionEdge("existing-id", PARENT_ID, PEER_ID));
      }
      input.candidate.edges[0]!.id = collidingId;
      const result = validateTaskMapDecomposition(input.candidate, input.context);
      assert.equal(result.valid, false);
      assert.ok(result.steps[3]!.reasons.some((reason) => /identity|collid|global/i.test(reason)));
    }
    const subtaskCollision = await fixture();
    subtaskCollision.candidate.edges[0]!.id = subtaskCollision.candidate.subtasks[0]!.subtaskId;
    assert.equal(validateTaskMapDecomposition(
      subtaskCollision.candidate,
      subtaskCollision.context,
    ).valid, false);
  });

  it("mirrors v1 supersedes authority and open-state legality", async () => {
    const input = await fixture();
    input.candidate.edges = [{
      id: `tme_${digest("supersedes").slice(0, 16)}`,
      from: input.candidate.subtasks[0]!.subtaskId,
      to: PARENT_ID,
      relation: "supersedes",
      citationPointerIds: ["session-parent"],
    }];
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.equal(result.valid, false);
    assert.ok(result.steps[3]!.reasons.some((reason) => /source-owned|authority/i.test(reason)));
    assert.ok(result.steps[3]!.reasons.some((reason) => /superseded|open state/i.test(reason)));

    const allowed = await fixture();
    allowed.context.projection.tasks[0]!.authority = "none";
    allowed.context.projection.tasks[0]!.openState = "superseded";
    allowed.candidate.edges = [{
      id: `tme_${digest("allowed-supersedes").slice(0, 16)}`,
      from: allowed.candidate.subtasks[0]!.subtaskId,
      to: PARENT_ID,
      relation: "supersedes",
      citationPointerIds: ["session-parent"],
    }];
    assert.equal(validateTaskMapDecomposition(allowed.candidate, allowed.context).valid, true);
  });

  it("detects an existing-plus-proposed raw-direction execution cycle", async () => {
    const input = await fixture();
    input.context.projection.edges.push(projectionEdge("existing-cycle", PARENT_ID, PEER_ID));
    const subtaskId = input.candidate.subtasks[0]!.subtaskId;
    input.candidate.edges = [
      { id: `tme_${digest("cycle-peer-subtask").slice(0, 16)}`, from: PEER_ID, to: subtaskId, relation: "depends_on", citationPointerIds: ["session-parent"] },
      { id: `tme_${digest("cycle-subtask-parent").slice(0, 16)}`, from: subtaskId, to: PARENT_ID, relation: "depends_on", citationPointerIds: ["session-parent"] },
    ];
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.equal(result.valid, false);
    assert.ok(result.steps[2]!.reasons.length > 0);
  });

  it("fails when the existing projection already contains an execution cycle", async () => {
    const input = await fixture();
    input.context.projection.edges.push(
      projectionEdge("existing-cycle-a", PARENT_ID, PEER_ID),
      projectionEdge("existing-cycle-b", PEER_ID, PARENT_ID),
    );
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.equal(result.valid, false);
    assert.ok(result.steps[2]!.reasons.some((reason) => /existing|cycle/i.test(reason)));
  });

  it("rejects orphan subtasks and envelopes connected to the wrong parent", async () => {
    const orphan = await fixture();
    orphan.candidate.edges = [];
    assert.ok(validateTaskMapDecomposition(orphan.candidate, orphan.context)
      .steps[3]!.reasons.some((reason) => /orphan|subtask|parent/i.test(reason)));

    const wrongParent = await fixture();
    wrongParent.candidate.edges[0]!.to = PEER_ID;
    assert.ok(validateTaskMapDecomposition(wrongParent.candidate, wrongParent.context)
      .steps[3]!.reasons.some((reason) => /parent/i.test(reason)));
  });

  it("allows a bounded subtask chain when every subtask reaches the parent component", async () => {
    const sourceResult = await task7Result("session-parent", PARENT_ID, 2);
    const candidate = candidateFrom(sourceResult);
    const [first, second] = candidate.subtasks;
    candidate.edges = [
      {
        id: `tme_${digest("chain-parent-first").slice(0, 16)}`,
        from: PARENT_ID,
        to: first!.subtaskId,
        relation: "informed_by",
        citationPointerIds: ["session-parent"],
      },
      {
        id: `tme_${digest("chain-first-second").slice(0, 16)}`,
        from: first!.subtaskId,
        to: second!.subtaskId,
        relation: "informed_by",
        citationPointerIds: ["session-parent"],
      },
    ];
    assert.equal(validateTaskMapDecomposition(candidate, context(sourceResult)).valid, true);
  });

  it("keeps a validated-but-unaccepted proposal invisible to ranking", async () => {
    const input = await fixture();
    const projectionBefore = structuredClone(input.context.projection);
    const before = buildTaskMapCodRankingPublication(rankingInput(input.context.projection));
    const validated = validateTaskMapDecomposition(input.candidate, input.context);
    const after = buildTaskMapCodRankingPublication(rankingInput(input.context.projection));
    assert.equal(validated.valid, true);
    assert.deepEqual(validated.authority, { nodesWritten: false, edgesWritten: false, requiresOwnerAcceptance: true });
    assert.deepEqual(input.context.projection, projectionBefore);
    assert.equal(before.artifactDigest, after.artifactDigest);
  });

  it("enforces exact keys, collection bounds, deterministic reasons, and safe reports", async () => {
    const input = await fixture();
    const unknownKey = structuredClone(input.candidate) as unknown as Record<string, unknown>;
    unknownKey.accepted = true;
    const tooManyEdges = structuredClone(input.candidate) as unknown as Record<string, unknown>;
    tooManyEdges.edges = Array.from({ length: 65 }, (_, index) => ({
      id: `edge-${index}`,
      from: PARENT_ID,
      to: input.candidate.subtasks[0]!.subtaskId,
      relation: "depends_on",
      citationPointerIds: ["session-parent"],
    }));
    for (const candidate of [unknownKey, tooManyEdges]) {
      const first = validateTaskMapDecomposition(candidate, input.context);
      const second = validateTaskMapDecomposition(candidate, input.context);
      assert.equal(first.valid, false);
      assert.deepEqual(first, second);
      assert.ok(first.steps[0]!.reasons.length > 0);
    }
    const rejectedSecrets = structuredClone(input.candidate);
    rejectedSecrets.edges[0]!.id = "/Users/alice/private-edge";
    rejectedSecrets.edges[0]!.citationPointerIds = ["/Users/alice/private-pointer"];
    assert.ok(!JSON.stringify(validateTaskMapDecomposition(rejectedSecrets, input.context))
      .includes("/Users/alice/private"));
  });

  it("rejects a re-sealed validation result whose canonical decision was forged", async () => {
    const input = await fixture();
    const forged = structuredClone(validateTaskMapDecomposition(input.candidate, input.context));
    forged.valid = false;
    forged.steps[0]!.passed = false;
    forged.steps[0]!.reasons = ["forged"];
    reseal(forged);
    assert.throws(
      () => validateTaskMapDecompositionValidationResult(forged, input.candidate, input.context),
      /canonical|validation|digest/i,
    );
  });

  it("publishes the standard sealed privacy block and rejects a re-sealed privacy forgery", async () => {
    const input = await fixture();
    const result = validateTaskMapDecomposition(input.candidate, input.context);
    assert.deepEqual(result.privacy, {
      sourceBodiesStored: false,
      localPathsStored: false,
      rawBiometricsStored: false,
    });

    const forged = structuredClone(result);
    (forged.privacy as unknown as { sourceBodiesStored: boolean }).sourceBodiesStored = true;
    reseal(forged);
    assert.throws(
      () => validateTaskMapDecompositionValidationResult(forged, input.candidate, input.context),
      /privacy|canonical|validation/i,
    );
  });

  it("rejects an oversized supplied validation result before canonical reconstruction", async () => {
    const input = await fixture();
    const result = {
      ...validateTaskMapDecomposition(input.candidate, input.context),
      padding: "x".repeat(TASKMAP_DECOMPOSITION_VALIDATION_LIMITS_V1.maxArtifactBytes),
    };
    assert.throws(
      () => validateTaskMapDecompositionValidationResult(result, input.candidate, input.context),
      /bounded|bytes|size/i,
    );
  });
});
