import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";

import {
  validateTaskMapTaskRankingPublication,
} from "../src/engine/taskmap/task-ranking-publication.js";
import type { TaskMapProjectionV1 } from "../src/engine/taskmap/types.js";

interface NodeRankingGolden {
  ownerScopeDigest: string;
  projectionBase64: string;
  rankingBase64: string;
  consumerAuthorityRankingBase64: string;
  consumerAuthorityTaskIDs: string[];
  consumerAuthorityScores: number[];
}

describe("Task Map cross-language ranking golden", () => {
  it("contains only Node-validator-accepted engine ranking bytes", () => {
    const fixturePath = path.resolve(
      process.cwd(),
      "../DaobrewSentinelMac/Tests/SentinelMacTests/Fixtures/TaskMapTaskRanking/node-ranking-golden.json",
    );
    const golden = JSON.parse(
      readFileSync(fixturePath, "utf8"),
    ) as NodeRankingGolden;
    const projection = JSON.parse(
      Buffer.from(golden.projectionBase64, "base64").toString("utf8"),
    ) as TaskMapProjectionV1;
    const ranking = validateTaskMapTaskRankingPublication(
      JSON.parse(Buffer.from(
        golden.consumerAuthorityRankingBase64,
        "base64",
      ).toString("utf8")),
      projection,
      golden.ownerScopeDigest,
    );

    assert.deepEqual(
      ranking.rankedAcceptedOpen.map(({ taskId }) => taskId),
      golden.consumerAuthorityTaskIDs,
    );
    assert.deepEqual(
      ranking.rankedAcceptedOpen.map(({ scoreBasisPoints }) =>
        scoreBasisPoints
      ),
      golden.consumerAuthorityScores,
    );
    assert.equal(
      Buffer.from(golden.consumerAuthorityRankingBase64, "base64")
        .equals(Buffer.from(golden.rankingBase64, "base64")),
      true,
      "the Swift authority vector must be the actual Node engine publication",
    );
  });
});
