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
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const keys_js_1 = require("../src/engine/memory/keys.js");
(0, node_test_1.describe)("Layer 2 key derivation", () => {
    (0, node_test_1.it)("uses the graph root id as thread key when present", () => {
        assert.equal((0, keys_js_1.deriveThreadKey)({ graphRootId: "ghost_abc", topics: ["x"] }), "root:ghost_abc");
    });
    (0, node_test_1.it)("derives order/case/prefix insensitive versioned semantic keys", () => {
        const a = (0, keys_js_1.deriveThreadKey)({ topics: ["#Sleep", "meetings"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
        const b = (0, keys_js_1.deriveThreadKey)({ topics: ["meetings", "sleep"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
        assert.equal(a, b);
        assert.match(a, /^sem:v1:/);
        const c = (0, keys_js_1.deriveThreadKey)({ topics: ["deadlines"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
        assert.notEqual(a, c);
    });
    (0, node_test_1.it)("produces deterministic thread, snapshot, and evidence ids", () => {
        assert.equal((0, keys_js_1.threadId)("local", "root:g1"), (0, keys_js_1.threadId)("local", "root:g1"));
        assert.notEqual((0, keys_js_1.threadId)("local", "root:g1"), (0, keys_js_1.threadId)("other", "root:g1"));
        assert.match((0, keys_js_1.threadId)("local", "root:g1"), /^cmt_[0-9a-f]{24}$/);
        assert.match((0, keys_js_1.snapshotId)("local", 3), /^ums_[0-9a-f]{24}$/);
        assert.equal((0, keys_js_1.snapshotId)("local", 3), (0, keys_js_1.snapshotId)("local", 3));
        const e1 = (0, keys_js_1.evidenceId)({
            threadId: "t",
            sourceTable: "meeting_notes",
            sourceId: "m1",
            graphNodeId: null,
            graphEdgeId: null,
            evidenceRole: "observation",
        });
        const e2 = (0, keys_js_1.evidenceId)({
            threadId: "t",
            sourceTable: "meeting_notes",
            sourceId: "m1",
            graphNodeId: null,
            graphEdgeId: null,
            evidenceRole: "observation",
        });
        assert.equal(e1, e2);
        assert.match(e1, /^cte_[0-9a-f]{24}$/);
        const e3 = (0, keys_js_1.evidenceId)({
            threadId: "t",
            sourceTable: "meeting_notes",
            sourceId: "m2",
            graphNodeId: null,
            graphEdgeId: null,
            evidenceRole: "observation",
        });
        assert.notEqual(e1, e3);
    });
    (0, node_test_1.it)("produces deterministic verification ids bucketed by kind and bucket", () => {
        const obs = (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "observation", bucket: "2026-06-29" });
        assert.equal(obs, (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "observation", bucket: "2026-06-29" }));
        assert.match(obs, /^tvf_[0-9a-f]{24}$/);
        assert.notEqual(obs, (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "observation", bucket: "2026-07-06" }));
        assert.notEqual(obs, (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "verdict", bucket: "2026-06-29" }));
        assert.notEqual(obs, (0, keys_js_1.verificationId)({ threadId: "cmt_b", kind: "observation", bucket: "2026-06-29" }));
        const verdict = (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "verdict", bucket: String(1_750_000_000) });
        assert.equal(verdict, (0, keys_js_1.verificationId)({ threadId: "cmt_a", kind: "verdict", bucket: "1750000000" }));
        assert.match(verdict, /^tvf_[0-9a-f]{24}$/);
    });
    (0, node_test_1.it)("contributor hash is salted, deterministic, and never leaks the user id (5B)", () => {
        const a = (0, keys_js_1.contributorHash)("local-user-7", "salt-a");
        assert.equal(a, (0, keys_js_1.contributorHash)("local-user-7", "salt-a"));
        assert.match(a, /^[0-9a-f]{24}$/);
        assert.notEqual(a, (0, keys_js_1.contributorHash)("local-user-7", "salt-b"));
        assert.notEqual(a, (0, keys_js_1.contributorHash)("other-user", "salt-a"));
        assert.ok(!a.includes("local-user-7"));
        assert.ok(!(0, keys_js_1.contributorHash)("bob", "salt-a").includes("bob"));
    });
    (0, node_test_1.it)("transfer record ids are one-per-handled-cycle deterministic (5B)", () => {
        const id = (0, keys_js_1.transferRecordId)({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_000 });
        assert.equal(id, (0, keys_js_1.transferRecordId)({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_000 }));
        assert.match(id, /^trf_[0-9a-f]{24}$/);
        assert.notEqual(id, (0, keys_js_1.transferRecordId)({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_001 }));
        assert.notEqual(id, (0, keys_js_1.transferRecordId)({ contributorHash: "deadbf", threadKey: "root:g1", handledAtTs: 1_750_000_000 }));
    });
});
