import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME,
  loadTaskMapLlmProposalSurface,
  publishTaskMapLlmProposalSurface,
} from "../src/engine/taskmap/llm-proposal-surface.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";

const OWNER = "a".repeat(64);

async function fixture(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "taskmap-llm-surface-"));
  await chmod(root, 0o700);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function projection() {
  return {
    contractVersion: "taskmap.v1",
    roots: [{ id: "root-a", title: "Launch" }],
    tasks: [{
      id: "task-a",
      rootId: "root-a",
      title: "Ship launch notes",
      summary: "Prepare the release summary.",
    }, {
      id: "task-b",
      rootId: "root-a",
      title: "Prepare release notes",
      summary: "Draft the launch summary.",
    }],
    edges: [],
  } as never;
}

describe("Task Map owner-visible LLM proposal surface", () => {
  it("publishes only read-only duplicate and validated breakdown proposals", async () => {
    const f = await fixture();
    try {
      const document = await publishTaskMapLlmProposalSurface({
        taskMapRoot: f.root,
        ownerScopeDigest: OWNER,
        projection: projection(),
        identityStatus: {
          stationId: "identity-adjudication-v1",
          state: "current",
          pendingCount: 0,
          degradationCode: null,
          lastSuccessAtMs: 1,
        },
        identityArtifact: {
          artifactDigest: "b".repeat(64),
          result: {
            mergeCandidates: [{
              pairId: "pair-a-b",
              leftCandidateId: "task-a",
              rightCandidateId: "task-b",
              confidence: "ambiguous",
            }],
          },
        } as never,
        decompositionStatus: {
          stationId: "task-decomposition-v1",
          state: "current",
          pendingCount: 0,
          degradationCode: null,
          lastSuccessAtMs: 1,
        },
        decompositionArtifact: {
          artifactDigest: "c".repeat(64),
          workItems: [{
            taskId: "task-a",
            validProposals: [{
              proposal: {
                proposalId: "proposal-a",
                subtasks: [{
                  subtaskId: "subtask-a",
                  title: "Draft the outline",
                  summary: "Create the first release-note outline.",
                }],
              },
            }],
          }],
        } as never,
      });

      assert.deepEqual(document.possibleDuplicates.proposals, [{
        pairId: "pair-a-b",
        leftTaskId: "task-a",
        rightTaskId: "task-b",
        leftTitle: "Ship launch notes",
        rightTitle: "Prepare release notes",
        confidence: "ambiguous",
        awaitingOwnerAcceptance: true,
      }]);
      assert.deepEqual(document.suggestedBreakdowns.proposals, [{
        proposalId: "proposal-a",
        parentTaskId: "task-a",
        parentTitle: "Ship launch notes",
        subtasks: [{
          subtaskId: "subtask-a",
          title: "Draft the outline",
          summary: "Create the first release-note outline.",
        }],
        awaitingOwnerAcceptance: true,
      }]);
      assert.deepEqual(document.authority, {
        aliasesWritten: false,
        nodesWritten: false,
        edgesWritten: false,
        acceptanceAuthority: false,
        requiresOwnerAcceptance: true,
      });
      assert.deepEqual(
        await loadTaskMapLlmProposalSurface({
          taskMapRoot: f.root,
          ownerScopeDigest: OWNER,
          projection: projection(),
        }),
        document,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("fails closed on re-sealed authority escalation and preserves degraded empties", async () => {
    const f = await fixture();
    try {
      const degraded = await publishTaskMapLlmProposalSurface({
        taskMapRoot: f.root,
        ownerScopeDigest: OWNER,
        projection: projection(),
        identityStatus: {
          stationId: "identity-adjudication-v1",
          state: "unavailable",
          pendingCount: 2,
          degradationCode: "embedding_provider_failed",
          lastSuccessAtMs: null,
        },
        identityArtifact: null,
        decompositionStatus: {
          stationId: "task-decomposition-v1",
          state: "deferred",
          pendingCount: 1,
          degradationCode: "validation_failed",
          lastSuccessAtMs: null,
        },
        decompositionArtifact: null,
      });
      assert.equal(degraded.possibleDuplicates.proposals.length, 0);
      assert.equal(degraded.suggestedBreakdowns.proposals.length, 0);

      const filePath = path.join(f.root, TASKMAP_LLM_PROPOSAL_SURFACE_FILENAME);
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      parsed.authority.aliasesWritten = true;
      const { artifactDigest: _digest, ...base } = parsed;
      parsed.artifactDigest = taskMapContractDigest(base);
      await writeFile(filePath, JSON.stringify(parsed), { mode: 0o600 });

      assert.equal(await loadTaskMapLlmProposalSurface({
        taskMapRoot: f.root,
        ownerScopeDigest: OWNER,
        projection: projection(),
      }), null);
    } finally {
      await f.cleanup();
    }
  });
});
