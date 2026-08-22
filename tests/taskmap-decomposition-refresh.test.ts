import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  refreshTaskMapDecomposition,
  selectTaskMapDecompositionWorkItems,
  taskMapDecompositionRefreshPath,
} from "../src/engine/taskmap/decomposition-refresh.js";
import type { LlmStation } from "../src/engine/taskmap/llm-station.js";
import { taskMapContractDigest } from "../src/engine/taskmap/source-contracts.js";
import type { TaskMapProjectionV1 } from "../src/engine/taskmap/types.js";

const OWNER = "a".repeat(64);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "taskmap-decomposition-refresh-"));
  const taskMapRoot = path.join(root, "taskmap");
  await mkdir(taskMapRoot, { recursive: true, mode: 0o700 });
  const projection = JSON.parse(await readFile(path.resolve(
    process.cwd(),
    "../DaobrewSentinelMac/Sources/SentinelMac/Resources/TaskMap/taskmap-demo-v1.json",
  ), "utf8")) as TaskMapProjectionV1;
  return {
    root,
    taskMapRoot,
    projection,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function station(options: { invalidCitation?: boolean } = {}): LlmStation {
  return {
    provider: {
      transport: "gemini-remote",
      executable: "",
      args: [],
      model: "gemini-fixture",
    },
    async run(request) {
      const prompt = JSON.parse(request.promptText) as {
        workItem: { citationPointerIds: string[] };
      };
      return {
        stationId: "task-decomposition-v1",
        model: "gemini-fixture",
        promptDigest: taskMapContractDigest(request.promptText),
        inputDigest: request.inputDigest,
        outputJson: JSON.stringify({ proposals: [{
          methodId: "verified-method",
          subtasks: [{
            title: "Verify the bounded child",
            summary: "Complete the bounded child action without creating grandchildren.",
            citationPointerIds: options.invalidCitation
              ? ["missing-pointer"]
              : [prompt.workItem.citationPointerIds[0]],
          }],
        }] }),
        producedAt: "2026-08-17T12:00:00.000Z",
        transport: "gemini-remote",
      };
    },
  };
}

describe("Task Map Station-3 decomposition refresh", () => {
  it("selects at most three accepted open leaves newest-first with bounded domains", async () => {
    const f = await fixture();
    try {
      const selected = selectTaskMapDecompositionWorkItems(f.projection);
      assert.equal(selected.length, 3);
      assert.deepEqual(selected.map((item) => item.taskId), [
        "tmt_075c6dcf82c484fb",
        "tmt_430a38292a0624b5",
        "tmt_0236e5eea2fa2245",
      ]);
      assert.ok(selected.every((item) =>
        /^[a-z0-9][a-z0-9._-]{0,127}$/.test(item.domainSignature)
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("validates and persists one-level proposal-only results without changing projection", async () => {
    const f = await fixture();
    let stationCalls = 0;
    try {
      const projectionBytes = JSON.stringify(f.projection);
      const first = await refreshTaskMapDecomposition({
        taskMapRoot: f.taskMapRoot,
        ownerScopeDigest: OWNER,
        projection: f.projection,
        createStation: async () => {
          stationCalls += 1;
          return station();
        },
      });
      assert.equal(
        first.state,
        "current",
        JSON.stringify(first.workItems.flatMap((item) =>
          item.validations.flatMap((validation) => validation.steps)
        )),
      );
      assert.equal(first.pendingCount, 0);
      assert.equal(first.workItems.length, 3);
      assert.ok(first.workItems.every((item) =>
        item.validProposals.length === 1
        && item.validations.length === 1
        && item.validations[0]?.valid === true
        && item.result.authority.edgesWritten === false
      ));
      assert.deepEqual(first.authority, {
        nodesWritten: false,
        edgesWritten: false,
        requiresOwnerAcceptance: true,
      });
      assert.equal(JSON.stringify(f.projection), projectionBytes);

      const artifactPath = taskMapDecompositionRefreshPath(
        f.taskMapRoot,
        taskMapContractDigest(f.projection),
      );
      const firstBytes = await readFile(artifactPath, "utf8");
      const replayed = await refreshTaskMapDecomposition({
        taskMapRoot: f.taskMapRoot,
        ownerScopeDigest: OWNER,
        projection: f.projection,
        createStation: async () => { throw new Error("must replay"); },
      });
      assert.deepEqual(replayed, first);
      assert.equal(await readFile(artifactPath, "utf8"), firstBytes);
      assert.equal(stationCalls, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("persists validation failures only as rejected reason records", async () => {
    const f = await fixture();
    try {
      const result = await refreshTaskMapDecomposition({
        taskMapRoot: f.taskMapRoot,
        ownerScopeDigest: OWNER,
        projection: f.projection,
        createStation: async () => station({ invalidCitation: true }),
      });
      assert.equal(result.state, "deferred");
      assert.ok(result.workItems.every((item) => item.validProposals.length === 0));
      assert.ok(result.workItems.every((item) =>
        item.rejected.length === 1
        && item.rejected[0]!.reasonCodes.length > 0
        && !("subtasks" in item.rejected[0]!)
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("seals zero proposals with llm_station_unavailable and leaves work untouched", async () => {
    const f = await fixture();
    try {
      const projectionBytes = JSON.stringify(f.projection);
      const result = await refreshTaskMapDecomposition({
        taskMapRoot: f.taskMapRoot,
        ownerScopeDigest: OWNER,
        projection: f.projection,
        createStation: async () => { throw new Error("no provider"); },
      });
      assert.equal(result.state, "unavailable");
      assert.equal(result.pendingCount, 3);
      assert.ok(result.workItems.every((item) =>
        item.result.proposals.length === 0
        && item.result.unavailableReason === "llm_station_unavailable"
      ));
      assert.equal(JSON.stringify(f.projection), projectionBytes);
    } finally {
      await f.cleanup();
    }
  });
});
