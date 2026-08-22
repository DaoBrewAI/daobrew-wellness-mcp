import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { contributorHash, deriveThreadKey, evidenceId, snapshotId, threadId, transferRecordId, verificationId } from "../src/engine/memory/keys.js";

describe("Layer 2 key derivation", () => {
  it("uses the graph root id as thread key when present", () => {
    assert.equal(deriveThreadKey({ graphRootId: "ghost_abc", topics: ["x"] }), "root:ghost_abc");
  });

  it("derives order/case/prefix insensitive versioned semantic keys", () => {
    const a = deriveThreadKey({ topics: ["#Sleep", "meetings"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
    const b = deriveThreadKey({ topics: ["meetings", "sleep"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
    assert.equal(a, b);
    assert.match(a, /^sem:v1:/);
    const c = deriveThreadKey({ topics: ["deadlines"], sourceKind: "meeting_notes", patternKeys: ["wood"] });
    assert.notEqual(a, c);
  });

  it("produces deterministic thread, snapshot, and evidence ids", () => {
    assert.equal(threadId("local", "root:g1"), threadId("local", "root:g1"));
    assert.notEqual(threadId("local", "root:g1"), threadId("other", "root:g1"));
    assert.match(threadId("local", "root:g1"), /^cmt_[0-9a-f]{24}$/);
    assert.match(snapshotId("local", 3), /^ums_[0-9a-f]{24}$/);
    assert.equal(snapshotId("local", 3), snapshotId("local", 3));
    const e1 = evidenceId({
      threadId: "t",
      sourceTable: "meeting_notes",
      sourceId: "m1",
      graphNodeId: null,
      graphEdgeId: null,
      evidenceRole: "observation",
    });
    const e2 = evidenceId({
      threadId: "t",
      sourceTable: "meeting_notes",
      sourceId: "m1",
      graphNodeId: null,
      graphEdgeId: null,
      evidenceRole: "observation",
    });
    assert.equal(e1, e2);
    assert.match(e1, /^cte_[0-9a-f]{24}$/);
    const e3 = evidenceId({
      threadId: "t",
      sourceTable: "meeting_notes",
      sourceId: "m2",
      graphNodeId: null,
      graphEdgeId: null,
      evidenceRole: "observation",
    });
    assert.notEqual(e1, e3);
  });

  it("produces deterministic verification ids bucketed by kind and bucket", () => {
    const obs = verificationId({ threadId: "cmt_a", kind: "observation", bucket: "2026-06-29" });
    assert.equal(obs, verificationId({ threadId: "cmt_a", kind: "observation", bucket: "2026-06-29" }));
    assert.match(obs, /^tvf_[0-9a-f]{24}$/);
    assert.notEqual(obs, verificationId({ threadId: "cmt_a", kind: "observation", bucket: "2026-07-06" }));
    assert.notEqual(obs, verificationId({ threadId: "cmt_a", kind: "verdict", bucket: "2026-06-29" }));
    assert.notEqual(obs, verificationId({ threadId: "cmt_b", kind: "observation", bucket: "2026-06-29" }));
    const verdict = verificationId({ threadId: "cmt_a", kind: "verdict", bucket: String(1_750_000_000) });
    assert.equal(verdict, verificationId({ threadId: "cmt_a", kind: "verdict", bucket: "1750000000" }));
    assert.match(verdict, /^tvf_[0-9a-f]{24}$/);
  });

  it("contributor hash is salted, deterministic, and never leaks the user id (5B)", () => {
    const a = contributorHash("local-user-7", "salt-a");
    assert.equal(a, contributorHash("local-user-7", "salt-a"));
    assert.match(a, /^[0-9a-f]{24}$/);
    assert.notEqual(a, contributorHash("local-user-7", "salt-b"));
    assert.notEqual(a, contributorHash("other-user", "salt-a"));
    assert.ok(!a.includes("local-user-7"));
    assert.ok(!contributorHash("bob", "salt-a").includes("bob"));
  });

  it("transfer record ids are one-per-handled-cycle deterministic (5B)", () => {
    const id = transferRecordId({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_000 });
    assert.equal(id, transferRecordId({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_000 }));
    assert.match(id, /^trf_[0-9a-f]{24}$/);
    assert.notEqual(id, transferRecordId({ contributorHash: "c0ffee", threadKey: "root:g1", handledAtTs: 1_750_000_001 }));
    assert.notEqual(id, transferRecordId({ contributorHash: "deadbf", threadKey: "root:g1", handledAtTs: 1_750_000_000 }));
  });
});
