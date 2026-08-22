"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const oura_taskmap_context_js_1 = require("../src/health/oura-taskmap-context.js");
const physiological_source_snapshot_js_1 = require("../src/engine/taskmap/physiological-source-snapshot.js");
const owner_scope_js_1 = require("../src/engine/taskmap/owner-scope.js");
const OWNER_SCOPE_DIGEST = (0, owner_scope_js_1.taskMapOwnerScopeDigest)("B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1");
const OTHER_OWNER_SCOPE_DIGEST = (0, owner_scope_js_1.taskMapOwnerScopeDigest)("14802294-BEED-480E-ABF6-7E3703FA25CD");
const TOKEN = {
    access_token: "private-access-token-not-for-receipt",
    refresh_token: "private-refresh-token-not-for-receipt",
    expires_at: Date.parse("2027-01-01T00:00:00.000Z"),
    token_type: "Bearer",
};
async function readEmptyLiveContext(options) {
    const emptyPage = async () => ({ data: [], next_token: null });
    const dependencies = {
        loadToken: () => TOKEN,
        assertOwnerBinding: () => { },
        refreshAccessToken: async () => {
            throw new Error("the test token is current");
        },
        fetchDailyReadiness: emptyPage,
        fetchDailySleep: emptyPage,
        fetchDailyActivity: emptyPage,
        fetchSleep: emptyPage,
        fetchHeartRate: emptyPage,
    };
    return (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(options, dependencies);
}
(0, node_test_1.it)("persists one private four-hour live receipt and preserves it on provider failure", async () => {
    const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-physiological-receipt-"));
    const outputPath = node_path_1.default.join(root, "private", "taskmap-physiological-source-snapshot.v1.json");
    const requestedAt = "2026-07-29T12:00:00.000Z";
    const completedAt = "2026-07-29T12:00:01.000Z";
    const clockValues = [requestedAt, completedAt];
    let clockIndex = 0;
    const snapshot = await (0, physiological_source_snapshot_js_1.refreshTaskMapPhysiologicalSourceSnapshot)({
        outputPath,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        force: true,
        historyDays: 1,
        clock: () => new Date(clockValues[Math.min(clockIndex++, clockValues.length - 1)]),
        readProviderContext: readEmptyLiveContext,
    });
    assert.equal(snapshot.readReceipt.mode, "live_provider_read");
    assert.equal(snapshot.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(snapshot.readReceipt.outcome, "succeeded");
    assert.equal(snapshot.readReceipt.requestedAt, requestedAt);
    assert.equal(snapshot.readReceipt.completedAt, completedAt);
    assert.equal(Date.parse(snapshot.validThrough) - Date.parse(snapshot.producedAt), physiological_source_snapshot_js_1.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS);
    assert.deepEqual(snapshot.privacy, {
        rawBiometricsStored: false,
        sourceBodiesStored: false,
        localPathsStored: false,
        credentialsStored: false,
    });
    assert.equal((0, node_fs_1.statSync)(node_path_1.default.dirname(outputPath)).mode & 0o777, 0o700);
    assert.equal((0, node_fs_1.statSync)(outputPath).mode & 0o777, 0o600);
    const persisted = (0, node_fs_1.readFileSync)(outputPath, "utf8");
    assert.equal(persisted.includes(TOKEN.access_token), false);
    assert.equal(persisted.includes(TOKEN.refresh_token), false);
    let reusedReaderCalls = 0;
    const reused = await (0, physiological_source_snapshot_js_1.refreshTaskMapPhysiologicalSourceSnapshot)({
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
    const ownerSlice = (0, physiological_source_snapshot_js_1.buildTaskMapPhysiologicalOwnerSlice)(reused, "2026-07-29T13:00:00.000Z", OWNER_SCOPE_DIGEST);
    assert.equal(ownerSlice.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(ownerSlice.value.ownerScopeDigest, OWNER_SCOPE_DIGEST);
    assert.equal(ownerSlice.value.source, "body");
    assert.equal(ownerSlice.value.metadata.liveReadReceiptDigest === undefined, false);
    assert.equal(ownerSlice.value.metadata.producedAtMs, Date.parse(completedAt));
    assert.equal(ownerSlice.value.metadata.validThroughMs, Date.parse(completedAt)
        + physiological_source_snapshot_js_1.TASKMAP_PHYSIOLOGICAL_SOURCE_MAX_AGE_MS);
    await assert.rejects((0, physiological_source_snapshot_js_1.refreshTaskMapPhysiologicalSourceSnapshot)({
        outputPath,
        ownerScopeDigest: OWNER_SCOPE_DIGEST,
        force: true,
        historyDays: 1,
        clock: () => new Date("2026-07-29T14:00:00.000Z"),
        readProviderContext: async () => {
            throw new Error("provider unavailable");
        },
    }), (error) => error instanceof physiological_source_snapshot_js_1.TaskMapPhysiologicalSourceUnavailableError
        && error.code === "provider_error");
    assert.equal((0, node_fs_1.readFileSync)(outputPath, "utf8"), persisted);
    let wrongOwnerProviderReads = 0;
    await assert.rejects((0, physiological_source_snapshot_js_1.refreshTaskMapPhysiologicalSourceSnapshot)({
        outputPath,
        ownerScopeDigest: OTHER_OWNER_SCOPE_DIGEST,
        historyDays: 1,
        clock: () => new Date("2026-07-29T13:00:00.000Z"),
        readProviderContext: async () => {
            wrongOwnerProviderReads += 1;
            throw new Error("wrong owner must not reuse the current receipt");
        },
    }), (error) => error instanceof physiological_source_snapshot_js_1.TaskMapPhysiologicalSourceUnavailableError
        && error.code === "provider_error");
    assert.equal(wrongOwnerProviderReads, 1);
    assert.equal((0, node_fs_1.readFileSync)(outputPath, "utf8"), persisted);
    const boundary = (0, physiological_source_snapshot_js_1.assessTaskMapPhysiologicalSourceSnapshot)(snapshot, snapshot.validThrough, OWNER_SCOPE_DIGEST);
    assert.equal(boundary.decision, "boundary_due");
    assert.equal(boundary.eligibleForCurrentRefresh, false);
    const wrongOwner = (0, physiological_source_snapshot_js_1.assessTaskMapPhysiologicalSourceSnapshot)(snapshot, "2026-07-29T13:00:00.000Z", OTHER_OWNER_SCOPE_DIGEST);
    assert.equal(wrongOwner.decision, "malformed");
    assert.equal(wrongOwner.eligibleForCurrentRefresh, false);
    assert.equal(wrongOwner.snapshot, null);
});
