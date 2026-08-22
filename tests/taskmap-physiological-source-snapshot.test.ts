import {
  mkdtempSync,
  readFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import * as assert from "node:assert/strict";
import {
  fetchOuraTaskMapContext,
  type FetchOuraTaskMapContextOptions,
  type OuraTaskMapContextDependencies,
  type OuraTaskMapContextDocument,
} from "../src/health/oura-taskmap-context.js";
import type { OuraToken } from "../src/health/oura.js";
import {
  TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS,
  TaskMapPhysiologicalSourceUnavailableError,
  assessTaskMapPhysiologicalSourceSnapshot,
  buildTaskMapPhysiologicalOwnerSlice,
  refreshTaskMapPhysiologicalSourceSnapshot,
} from "../src/engine/taskmap/physiological-source-snapshot.js";
import {
  taskMapOwnerScopeDigest,
} from "../src/engine/taskmap/owner-scope.js";

const OWNER_SCOPE_DIGEST = taskMapOwnerScopeDigest(
  "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
);
const OTHER_OWNER_SCOPE_DIGEST = taskMapOwnerScopeDigest(
  "14802294-BEED-480E-ABF6-7E3703FA25CD",
);

const TOKEN: OuraToken = {
  access_token: "private-access-token-not-for-receipt",
  refresh_token: "private-refresh-token-not-for-receipt",
  expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
  token_type: "Bearer",
};

async function readEmptyLiveContext(
  options: FetchOuraTaskMapContextOptions,
): Promise<OuraTaskMapContextDocument> {
  const emptyPage = async () => ({ data: [], next_token: null });
  const dependencies: OuraTaskMapContextDependencies = {
    loadToken: () => TOKEN,
    assertOwnerBinding: () => {},
    refreshAccessToken: async () => {
      throw new Error("the test token is current");
    },
    fetchDailyReadiness: emptyPage,
    fetchDailySleep: emptyPage,
    fetchDailyActivity: emptyPage,
    fetchSleep: emptyPage,
    fetchHeartRate: emptyPage,
  };
  return fetchOuraTaskMapContext(options, dependencies);
}

it(
  "persists one private four-hour live receipt and preserves it on provider failure",
  async () => {
    const root = mkdtempSync(
      path.join(tmpdir(), "taskmap-physiological-receipt-"),
    );
    const outputPath = path.join(
      root,
      "private",
      "taskmap-physiological-source-snapshot.v1.json",
    );
    const requestedAt = "2026-07-29T12:00:00.000Z";
    const completedAt = "2026-07-29T12:00:01.000Z";
    const clockValues = [requestedAt, completedAt];
    let clockIndex = 0;

    const snapshot = await refreshTaskMapPhysiologicalSourceSnapshot({
      outputPath,
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      force: true,
      historyDays: 1,
      clock: () => new Date(
        clockValues[Math.min(clockIndex++, clockValues.length - 1)]!,
      ),
      readProviderContext: readEmptyLiveContext,
    });

    assert.equal(snapshot.readReceipt.mode, "live_provider_read");
    assert.equal(snapshot.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(snapshot.readReceipt.outcome, "succeeded");
    assert.equal(snapshot.readReceipt.requestedAt, requestedAt);
    assert.equal(snapshot.readReceipt.completedAt, completedAt);
    assert.equal(
      Date.parse(snapshot.validThrough) - Date.parse(snapshot.producedAt),
      TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS,
    );
    assert.deepEqual(snapshot.privacy, {
      rawBiometricsStored: false,
      sourceBodiesStored: false,
      localPathsStored: false,
      credentialsStored: false,
    });
    assert.equal(statSync(path.dirname(outputPath)).mode & 0o777, 0o700);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    const persisted = readFileSync(outputPath, "utf8");
    assert.equal(persisted.includes(TOKEN.access_token), false);
    assert.equal(persisted.includes(TOKEN.refresh_token!), false);

    let reusedReaderCalls = 0;
    const reused = await refreshTaskMapPhysiologicalSourceSnapshot({
      outputPath,
      ownerScopeDigest: OWNER_SCOPE_DIGEST,
      historyDays: 1,
      clock: () => new Date("2026-07-29T13:00:00.000Z"),
      readProviderContext: async () => {
        reusedReaderCalls += 1;
        throw new Error("a current live receipt must be reused");
      },
    });
    assert.equal(reusedReaderCalls, 0);
    assert.equal(reused.snapshotDigest, snapshot.snapshotDigest);

    const ownerSlice = buildTaskMapPhysiologicalOwnerSlice(
      reused,
      "2026-07-29T13:00:00.000Z",
      OWNER_SCOPE_DIGEST,
    );
    assert.equal(ownerSlice.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(ownerSlice.value.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(ownerSlice.value.source, "body");
    assert.equal(
      ownerSlice.value.metadata.liveReadReceiptDigest === undefined,
      false,
    );
    assert.equal(
      ownerSlice.value.metadata.producedAtMs,
      Date.parse(completedAt),
    );
    assert.equal(
      ownerSlice.value.metadata.validThroughMs,
      Date.parse(completedAt)
        + TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS,
    );

    await assert.rejects(
      refreshTaskMapPhysiologicalSourceSnapshot({
        outputPath,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        force: true,
        historyDays: 1,
        clock: () => new Date("2026-07-29T14:00:00.000Z"),
        readProviderContext: async () => {
          throw new Error("provider unavailable");
        },
      }),
      (error: unknown) =>
        error instanceof TaskMapPhysiologicalSourceUnavailableError
        && error.code === "provider_error",
    );
    assert.equal(readFileSync(outputPath, "utf8"), persisted);

    let wrongOwnerProviderReads = 0;
    await assert.rejects(
      refreshTaskMapPhysiologicalSourceSnapshot({
        outputPath,
        ownerScopeDigest: OTHER_OWNER_SCOPE_DIGEST,
        historyDays: 1,
        clock: () => new Date("2026-07-29T13:00:00.000Z"),
        readProviderContext: async () => {
          wrongOwnerProviderReads += 1;
          throw new Error("wrong owner must not reuse the current receipt");
        },
      }),
      (error: unknown) =>
        error instanceof TaskMapPhysiologicalSourceUnavailableError
        && error.code === "provider_error",
    );
    assert.equal(wrongOwnerProviderReads, 1);
    assert.equal(readFileSync(outputPath, "utf8"), persisted);

    const boundary = assessTaskMapPhysiologicalSourceSnapshot(
      snapshot,
      snapshot.validThrough,
      OWNER_SCOPE_DIGEST,
    );
    assert.equal(boundary.decision, "boundary_due");
    assert.equal(boundary.eligibleForCurrentRefresh, false);

    const wrongOwner = assessTaskMapPhysiologicalSourceSnapshot(
      snapshot,
      "2026-07-29T13:00:00.000Z",
      OTHER_OWNER_SCOPE_DIGEST,
    );
    assert.equal(wrongOwner.decision, "malformed");
    assert.equal(wrongOwner.eligibleForCurrentRefresh, false);
    assert.equal(wrongOwner.snapshot, null);
  },
);
