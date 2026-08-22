"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const legacy_local_state_quarantine_js_1 = require("../src/engine/taskmap/legacy-local-state-quarantine.js");
const local_completion_overlay_js_1 = require("../src/engine/taskmap/local-completion-overlay.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const digest = (character) => character.repeat(64);
const CURRENT_OWNER_SCOPE = digest("b");
function lifecycleRecord(taskId, ownerScopeDigest, minute = 2) {
    const identity = (0, local_completion_overlay_js_1.buildTaskMapLocalCompletionIdentity)({
        taskId,
        rootId: "tmr_legacy_work",
        workId: `work_${taskId}`,
        canonicalSourceObjectKeyDigest: digest("c"),
        aliasSourceObjectKeyDigests: [],
        sourceIdentityDigest: digest("d"),
        sourceRevision: `revision-${taskId}`,
        sourceRevisionObservedAt: "2026-08-01T08:01:00.000Z",
    });
    return (0, local_completion_overlay_js_1.buildTaskMapExternalCompletion)({
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
function decisionId(record) {
    switch (record.decision) {
        case "close": return record.closeDecisionId;
        case "reopen": return record.reopenDecisionId;
        case "complete_elsewhere":
            return record.externalCompletionDecisionId;
        case "reopen_external_completion":
            return record.externalReopenDecisionId;
    }
}
function legacyFixture(buildRecords) {
    const homeDirectory = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_fs_1.realpathSync)(node_os_1.default.tmpdir()), "taskmap-legacy-quarantine-"));
    const legacyRoot = node_path_1.default.join(homeDirectory, "Library", "Application Support", "DaoBrew", "taskmap-local-execution");
    const decisionsRoot = node_path_1.default.join(legacyRoot, "completion-decisions");
    (0, node_fs_1.mkdirSync)(decisionsRoot, { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(legacyRoot, 0o700);
    (0, node_fs_1.chmodSync)(decisionsRoot, 0o700);
    const legacyOwnerScopeDigest = (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-local-os-owner.1",
        uid: (typeof process.getuid === "function"
            ? process.getuid()
            : (0, node_fs_1.lstatSync)(legacyRoot).uid).toString(10),
        ownerRoot: node_path_1.default.dirname(legacyRoot),
    });
    const records = buildRecords(legacyOwnerScopeDigest);
    for (const record of records) {
        (0, node_fs_1.writeFileSync)(node_path_1.default.join(decisionsRoot, `${decisionId(record)}.json`), (0, local_completion_overlay_js_1.taskMapLocalLifecycleDecisionCanonicalBytes)(record), { mode: 0o600 });
    }
    return {
        homeDirectory,
        ownerRoot: node_path_1.default.join(homeDirectory, "Library", "Application Support", "DaoBrew", "owners", CURRENT_OWNER_SCOPE),
        decisionsRoot,
        legacyOwnerScopeDigest,
        records,
        cleanup: () => (0, node_fs_1.rmSync)(homeDirectory, { recursive: true, force: true }),
    };
}
function assertQuarantined(action) {
    strict_1.default.throws(action, (error) => error instanceof legacy_local_state_quarantine_js_1.TaskMapLegacyLocalStateQuarantineError
        && error.code === "TASKMAP_LEGACY_LOCAL_STATE_QUARANTINED");
}
(0, node_test_1.describe)("legacy local lifecycle quarantine", () => {
    (0, node_test_1.it)("returns only active terminal IDs without rebinding the legacy owner", () => {
        const fixture = legacyFixture((legacyOwnerScopeDigest) => {
            const activeA = lifecycleRecord("tmt_legacy_active_a", legacyOwnerScopeDigest);
            const reopenedCompletion = lifecycleRecord("tmt_legacy_reopened", legacyOwnerScopeDigest, 3);
            const reopen = (0, local_completion_overlay_js_1.buildTaskMapExplicitExternalReopen)({
                completionRecord: reopenedCompletion,
                explicitOwnerAction: true,
                reopenedAt: "2026-08-01T08:04:00.000Z",
            });
            const activeB = lifecycleRecord("tmt_legacy_active_b", legacyOwnerScopeDigest, 5);
            return [activeA, reopenedCompletion, reopen, activeB];
        });
        const expectedTaskIds = [
            "tmt_legacy_active_a",
            "tmt_legacy_active_b",
        ];
        strict_1.default.deepEqual((0, local_completion_overlay_js_1.summarizeTaskMapLocalLifecycleHistory)([...fixture.records]), {
            localOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
            activeTerminalTaskIds: expectedTaskIds,
        });
        try {
            const inspected = (0, legacy_local_state_quarantine_js_1.inspectTaskMapLegacyLocalState)(fixture);
            strict_1.default.deepEqual(inspected, {
                legacyOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
                activeTerminalTaskIds: expectedTaskIds,
            });
            strict_1.default.notEqual(inspected?.legacyOwnerScopeDigest, CURRENT_OWNER_SCOPE);
            strict_1.default.deepEqual((0, legacy_local_state_quarantine_js_1.assertNoUnmigratedTaskMapLegacyLocalState)({
                ...fixture,
                selectedTaskId: "tmt_current_owner_unrelated",
            }), inspected);
            assertQuarantined(() => (0, legacy_local_state_quarantine_js_1.assertNoUnmigratedTaskMapLegacyLocalState)({
                ...fixture,
                selectedTaskId: "tmt_legacy_active_b",
            }));
        }
        finally {
            fixture.cleanup();
        }
    });
    (0, node_test_1.it)("fails closed for cross-owner lifecycle history", () => {
        const fixture = legacyFixture((legacyOwnerScopeDigest) => [
            lifecycleRecord("tmt_legacy_owner_a", legacyOwnerScopeDigest),
            lifecycleRecord("tmt_legacy_owner_b", digest("9"), 3),
        ]);
        try {
            assertQuarantined(() => (0, legacy_local_state_quarantine_js_1.inspectTaskMapLegacyLocalState)(fixture));
        }
        finally {
            fixture.cleanup();
        }
    });
    (0, node_test_1.it)("fails closed when a sealed history is bound to a different legacy path scope", () => {
        const fixture = legacyFixture(() => [
            lifecycleRecord("tmt_legacy_wrong_path_scope", digest("9")),
        ]);
        try {
            assertQuarantined(() => (0, legacy_local_state_quarantine_js_1.inspectTaskMapLegacyLocalState)(fixture));
        }
        finally {
            fixture.cleanup();
        }
    });
    (0, node_test_1.it)("keeps immutable decisions available despite a stale derived overlay", () => {
        const fixture = legacyFixture((legacyOwnerScopeDigest) => [
            lifecycleRecord("tmt_legacy_decision_authority", legacyOwnerScopeDigest),
        ]);
        try {
            // Crash residue in the derived overlay is deliberately not opened once
            // immutable per-decision files are present and valid.
            (0, node_fs_1.writeFileSync)(node_path_1.default.join(node_path_1.default.dirname(fixture.decisionsRoot), "completion-overlay.v1.json"), "{\"stale-and-incomplete\":true}\n", { mode: 0o644 });
            strict_1.default.deepEqual((0, legacy_local_state_quarantine_js_1.inspectTaskMapLegacyLocalState)(fixture), {
                legacyOwnerScopeDigest: fixture.legacyOwnerScopeDigest,
                activeTerminalTaskIds: ["tmt_legacy_decision_authority"],
            });
        }
        finally {
            fixture.cleanup();
        }
    });
    (0, node_test_1.it)("fails closed for malformed or unsafe legacy decision files", () => {
        for (const scenario of ["malformed", "unsafe_mode"]) {
            const fixture = legacyFixture((legacyOwnerScopeDigest) => [
                lifecycleRecord(`tmt_legacy_${scenario}`, legacyOwnerScopeDigest),
            ]);
            const record = fixture.records[0];
            const filePath = node_path_1.default.join(fixture.decisionsRoot, `${decisionId(record)}.json`);
            try {
                if (scenario === "malformed") {
                    (0, node_fs_1.writeFileSync)(filePath, "{\"broken\":true}\n", { mode: 0o600 });
                }
                else {
                    (0, node_fs_1.chmodSync)(filePath, 0o644);
                }
                assertQuarantined(() => (0, legacy_local_state_quarantine_js_1.inspectTaskMapLegacyLocalState)(fixture));
            }
            finally {
                fixture.cleanup();
            }
        }
    });
});
