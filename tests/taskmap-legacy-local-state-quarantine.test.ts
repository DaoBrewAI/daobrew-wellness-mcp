import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TaskMapLegacyLocalStateQuarantineError,
  assertNoUnmigratedTaskMapLegacyLocalState,
  inspectTaskMapLegacyLocalState,
} from "../src/engine/taskmap/legacy-local-state-quarantine.js";
import {
  buildTaskMapExplicitExternalReopen,
  buildTaskMapExternalCompletion,
  buildTaskMapLocalCompletionIdentity,
  summarizeTaskMapLocalLifecycleHistory,
  taskMapLocalLifecycleDecisionCanonicalBytes,
  type TaskMapLocalLifecycleDecisionV1,
} from "../src/engine/taskmap/local-completion-overlay.js";
import { taskMapContractDigest } from
  "../src/engine/taskmap/source-contracts.js";

const digest = (character: string): string => character.repeat(64);
const CURRENT_OWNER_SCOPE = digest("b");

function lifecycleRecord(
  taskId: string,
  ownerScopeDigest: string,
  minute = 2,
) {
  const identity = buildTaskMapLocalCompletionIdentity({
    taskId,
    rootId: "tmr_legacy_work",
    workId: `work_${taskId}`,
    canonicalSourceObjectKeyDigest: digest("c"),
    aliasSourceObjectKeyDigests: [],
    sourceIdentityDigest: digest("d"),
    sourceRevision: `revision-${taskId}`,
    sourceRevisionObservedAt: "2026-08-01T08:01:00.000Z",
  });
  return buildTaskMapExternalCompletion({
    explicitOwnerAction: true,
    localOwnerScopeDigest: ownerScopeDigest,
    identity,
    projection: {
      projectionContractVersion: "taskmap.v1",
      runId: "tmrun_legacy_quarantine",
      inputDigest: digest("e"),
      generatedAt: "2026-08-01T08:00:00.000Z",
      projectionDigest: digest("f"),
    },
    completedAt: `2026-08-01T08:${String(minute).padStart(2, "0")}:00.000Z`,
  });
}

function decisionId(record: TaskMapLocalLifecycleDecisionV1): string {
  switch (record.decision) {
    case "close": return record.closeDecisionId;
    case "reopen": return record.reopenDecisionId;
    case "complete_elsewhere":
      return record.externalCompletionDecisionId;
    case "reopen_external_completion":
      return record.externalReopenDecisionId;
  }
}

function legacyFixture(
  buildRecords: (
    legacyOwnerScopeDigest: string,
  ) => readonly TaskMapLocalLifecycleDecisionV1[],
): {
  homeDirectory: string;
  ownerRoot: string;
  decisionsRoot: string;
  legacyOwnerScopeDigest: string;
  records: readonly TaskMapLocalLifecycleDecisionV1[];
  cleanup: () => void;
} {
  const homeDirectory = mkdtempSync(path.join(
    realpathSync(os.tmpdir()),
    "taskmap-legacy-quarantine-",
  ));
  const legacyRoot = path.join(
    homeDirectory,
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap-local-execution",
  );
  const decisionsRoot = path.join(legacyRoot, "completion-decisions");
  mkdirSync(decisionsRoot, { recursive: true, mode: 0o700 });
  chmodSync(legacyRoot, 0o700);
  chmodSync(decisionsRoot, 0o700);
  const legacyOwnerScopeDigest = taskMapContractDigest({
    domain: "taskmap-local-os-owner.1",
    uid: (typeof process.getuid === "function"
      ? process.getuid()
      : lstatSync(legacyRoot).uid).toString(10),
    ownerRoot: path.dirname(legacyRoot),
  });
  const records = buildRecords(legacyOwnerScopeDigest);
  for (const record of records) {
    writeFileSync(
      path.join(decisionsRoot, `${decisionId(record)}.json`),
      taskMapLocalLifecycleDecisionCanonicalBytes(record),
      { mode: 0o600 },
    );
  }
  return {
    homeDirectory,
    ownerRoot: path.join(
      homeDirectory,
      "Library",
      "Application Support",
      "DaoBrew",
      "owners",
      CURRENT_OWNER_SCOPE,
    ),
    decisionsRoot,
    legacyOwnerScopeDigest,
    records,
    cleanup: () => rmSync(homeDirectory, { recursive: true, force: true }),
  };
}

function assertQuarantined(action: () => unknown): void {
  assert.throws(action, (error: unknown) =>
    error instanceof TaskMapLegacyLocalStateQuarantineError
    && error.code === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED"
  );
}

describe("legacy local lifecycle quarantine", () => {
  it("returns only active terminal IDs without rebinding the legacy owner", () => {
    const fixture = legacyFixture((legacyOwnerScopeDigest) => {
      const activeA = lifecycleRecord(
        "tmt_legacy_active_a",
        legacyOwnerScopeDigest,
      );
      const reopenedCompletion = lifecycleRecord(
        "tmt_legacy_reopened",
        legacyOwnerScopeDigest,
        3,
      );
      const reopen = buildTaskMapExplicitExternalReopen({
        completionRecord: reopenedCompletion,
        explicitOwnerAction: true,
        reopenedAt: "2026-08-01T08:04:00.000Z",
      });
      const activeB = lifecycleRecord(
        "tmt_legacy_active_b",
        legacyOwnerScopeDigest,
        5,
      );
      return [activeA, reopenedCompletion, reopen, activeB];
    });
    const expectedTaskIds = [
      "tmt_legacy_active_a",
      "tmt_legacy_active_b",
    ];

    assert.deepEqual(
      summarizeTaskMapLocalLifecycleHistory([...fixture.records]),
      {
        localOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
        activeTerminalTaskIds: expectedTaskIds,
      },
    );

    try {
      const inspected = inspectTaskMapLegacyLocalState(fixture);
      assert.deepEqual(inspected, {
        legacyOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
        activeTerminalTaskIds: expectedTaskIds,
      });
      assert.notEqual(inspected?.legacyOwnerScopeDigest, CURRENT_OWNER_SCOPE);

      assert.deepEqual(
        assertNoUnmigratedTaskMapLegacyLocalState({
          ...fixture,
          selectedTaskId: "tmt_current_owner_unrelated",
        }),
        inspected,
      );
      assertQuarantined(() =>
        assertNoUnmigratedTaskMapLegacyLocalState({
          ...fixture,
          selectedTaskId: "tmt_legacy_active_b",
        })
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed for cross-owner lifecycle history", () => {
    const fixture = legacyFixture((legacyOwnerScopeDigest) => [
      lifecycleRecord("tmt_legacy_owner_a", legacyOwnerScopeDigest),
      lifecycleRecord("tmt_legacy_owner_b", digest("9"), 3),
    ]);
    try {
      assertQuarantined(() => inspectTaskMapLegacyLocalState(fixture));
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed when a sealed history is bound to a different legacy path scope", () => {
    const fixture = legacyFixture(() => [
      lifecycleRecord("tmt_legacy_wrong_path_scope", digest("9")),
    ]);
    try {
      assertQuarantined(() => inspectTaskMapLegacyLocalState(fixture));
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps immutable decisions available despite a stale derived overlay", () => {
    const fixture = legacyFixture((legacyOwnerScopeDigest) => [
      lifecycleRecord(
        "tmt_legacy_decision_authority",
        legacyOwnerScopeDigest,
      ),
    ]);
    try {
      // Crash residue in the derived overlay is deliberately not opened once
      // immutable per-decision files are present and valid.
      writeFileSync(
        path.join(
          path.dirname(fixture.decisionsRoot),
          "completion-overlay.v1.json",
        ),
        "{\"stale-and-incomplete\":true}\n",
        { mode: 0o644 },
      );
      assert.deepEqual(inspectTaskMapLegacyLocalState(fixture), {
        legacyOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
        activeTerminalTaskIds: ["tmt_legacy_decision_authority"],
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed for malformed or unsafe legacy decision files", () => {
    for (const scenario of ["malformed", "unsafe_mode"] as const) {
      const fixture = legacyFixture((legacyOwnerScopeDigest) => [
        lifecycleRecord(
          `tmt_legacy_${scenario}`,
          legacyOwnerScopeDigest,
        ),
      ]);
      const record = fixture.records[0]!;
      const filePath = path.join(
        fixture.decisionsRoot,
        `${decisionId(record)}.json`,
      );
      try {
        if (scenario === "malformed") {
          writeFileSync(filePath, "{\"broken\":true}\n", { mode: 0o600 });
        } else {
          chmodSync(filePath, 0o644);
        }
        assertQuarantined(() => inspectTaskMapLegacyLocalState(fixture));
      } finally {
        fixture.cleanup();
      }
    }
  });
});
