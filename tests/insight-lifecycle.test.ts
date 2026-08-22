import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  planInsightLifecycle,
  insightContentHash,
  SUPPRESSED_INSIGHT_STRENGTH,
} from "../src/engine/ingest/insight-lifecycle.js";
import type { InsightRow } from "../src/engine/ingest/types.js";

function makeRow(id: string, sourceRef: string, overrides: Partial<InsightRow> = {}): InsightRow {
  return {
    id,
    source: "claude_project_session",
    source_ref: sourceRef,
    insight_text: `Insight for ${sourceRef}`,
    topics: ["#memory"],
    importance: 0.78,
    strength: 1,
    occurred_at_ts: 100,
    last_accessed_ts: null,
    ...overrides,
  };
}

function stubLlm(payload: unknown | (() => unknown)): { llm: { generateJson(prompt: string): Promise<unknown>; callsUsed(): number }; prompts: string[] } {
  let calls = 0;
  const prompts: string[] = [];
  return {
    llm: {
      async generateJson(prompt: string) {
        calls += 1;
        prompts.push(prompt);
        return typeof payload === "function" ? (payload as () => unknown)() : payload;
      },
      callsUsed: () => calls,
    },
    prompts,
  };
}

describe("planInsightLifecycle", () => {
  it("replays an exact-content add decision without calling the llm", async () => {
    const row = makeRow("insight-1", "/sessions/a.jsonl");
    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [row],
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) {
          return [{
            incoming_source: row.source,
            incoming_source_ref: row.source_ref,
            incoming_content_hash: insightContentHash(row),
            decision_kind: "add",
            winner_insight_id: null,
            winner_source: null,
            winner_source_ref: null,
            loser_insight_id: null,
            loser_source: null,
            loser_source_ref: null,
            decided_importance: 0.91,
            rationale: "cached",
          }];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(plan.rows[0].importance, 0.91);
    assert.equal(plan.rows[0].strength, 1);
    assert.equal(plan.geminiCallsUsed, 0);
    assert.deepEqual(plan.postWriteSql, []);
    assert.deepEqual(plan.warnings, []);
    assert.deepEqual(plan.decisionCounts, {
      add: 0,
      supersedes: 0,
      noopDuplicate: 0,
      replayed: 1,
      overflow: 0,
    });
  });

  it("replays a noop-duplicate decision by suppressing the incoming row and reinforcing the winner", async () => {
    const row = makeRow("incoming-1", "/sessions/dup.jsonl");
    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [row],
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) {
          return [{
            incoming_source: row.source,
            incoming_source_ref: row.source_ref,
            incoming_content_hash: insightContentHash(row),
            decision_kind: "noop_duplicate",
            winner_insight_id: "winner-1",
            winner_source: "claude_project_session",
            winner_source_ref: "/sessions/winner.jsonl",
            loser_insight_id: row.id,
            loser_source: row.source,
            loser_source_ref: row.source_ref,
            decided_importance: 0.67,
            rationale: "cached duplicate",
          }];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(plan.rows[0].strength, SUPPRESSED_INSIGHT_STRENGTH);
    assert.equal(plan.rows[0].importance, 0.67);
    assert.ok(plan.postWriteSql.some((sql) => /WHERE user_id = 'u1' AND id = 'winner-1'/.test(sql)));
    assert.equal(plan.geminiCallsUsed, 0);
    assert.equal(plan.decisionCounts.replayed, 1);
  });

  it("classifies add, supersedes, and noop_duplicate in one llm batch and persists replay rows", async () => {
    const addRow = makeRow("incoming-add", "/sessions/add.jsonl");
    const supersedeRow = makeRow("incoming-supersede", "/sessions/supersede.jsonl");
    const noopRow = makeRow("incoming-noop", "/sessions/noop.jsonl");
    const { llm } = stubLlm({
      decisions: [
        {
          incoming_source_ref: addRow.source_ref,
          incoming_content_hash: insightContentHash(addRow),
          decision_kind: "add",
          target_id: null,
          importance: 0.91,
          rationale: "new fact",
        },
        {
          incoming_source_ref: supersedeRow.source_ref,
          incoming_content_hash: insightContentHash(supersedeRow),
          decision_kind: "supersedes",
          target_id: "legacy-1",
          importance: 0.88,
          rationale: "newer statement",
        },
        {
          incoming_source_ref: noopRow.source_ref,
          incoming_content_hash: insightContentHash(noopRow),
          decision_kind: "noop_duplicate",
          target_id: "winner-2",
          importance: 0.63,
          rationale: "same fact",
        },
      ],
    });
    let annReads = 0;
    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [addRow, supersedeRow, noopRow],
      llm,
      embedRows: async (texts) => texts.map((_text, index) => new Array(768).fill(index / 10)),
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/FROM user_insights/.test(sql) && /ORDER BY embedding <=>/.test(sql)) {
          annReads += 1;
          if (annReads === 1) return [];
          if (annReads === 2) return [{ id: "legacy-1", source_ref: "/sessions/legacy.jsonl", text: "Old version", distance: 0.1 }];
          return [{ id: "winner-2", source_ref: "/sessions/winner.jsonl", text: "Existing duplicate", distance: 0.05 }];
        }
        if (/ORDER BY created_at_ts DESC/.test(sql)) return [];
        if (/WHERE user_id = __daobrew_scope.uid/.test(sql) && /id IN/.test(sql)) {
          return [
            {
              id: "legacy-1",
              source: "claude_project_session",
              source_ref: "/sessions/legacy.jsonl",
              insight_text: "Old version",
              topics_json: ["#legacy"],
              importance: 0.5,
              strength: 0.4,
              occurred_at_ts: 90,
              last_accessed_ts: null,
            },
            {
              id: "winner-2",
              source: "claude_project_session",
              source_ref: "/sessions/winner.jsonl",
              insight_text: "Existing duplicate",
              topics_json: ["#winner"],
              importance: 0.7,
              strength: 0.8,
              occurred_at_ts: 95,
              last_accessed_ts: null,
            },
          ];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(plan.geminiCallsUsed, 1);
    assert.equal(plan.rows[0].importance, 0.91);
    assert.equal(plan.rows[1].importance, 0.88);
    assert.equal(plan.rows[2].strength, SUPPRESSED_INSIGHT_STRENGTH);
    assert.deepEqual(plan.decisionCounts, {
      add: 1,
      supersedes: 1,
      noopDuplicate: 1,
      replayed: 0,
      overflow: 0,
    });
    assert.ok(plan.postWriteSql.some((sql) => /WHERE user_id = 'u1' AND id = 'legacy-1'/.test(sql) && /strength = 0/.test(sql)));
    assert.ok(plan.postWriteSql.some((sql) => /WHERE user_id = 'u1' AND id = 'winner-2'/.test(sql)));
    assert.equal(plan.postWriteSql.filter((sql) => /INSERT INTO insight_lifecycle_decisions/.test(sql)).length, 4);
  });

  it("fails open with one warning when the llm payload is malformed", async () => {
    const row = makeRow("incoming-1", "/sessions/bad.jsonl");
    const { llm } = stubLlm({});
    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [row],
      llm,
      embedRows: async (texts) => texts.map(() => new Array(768).fill(0.1)),
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/FROM user_insights/.test(sql) && /ORDER BY embedding <=>/.test(sql)) {
          return [{ id: "legacy-1", source_ref: "/sessions/legacy.jsonl", text: "Old version", distance: 0.1 }];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(plan.rows[0].importance, row.importance);
    assert.equal(plan.rows[0].strength, row.strength);
    assert.equal(plan.postWriteSql.length, 0);
    assert.equal(plan.geminiCallsUsed, 1);
    assert.equal(plan.warnings.length, 1);
    assert.match(plan.warnings[0], /missing decisions/i);
  });

  it("caps new classifications by content hash budget and lets overflow rows fall through unchanged", async () => {
    const first = makeRow("incoming-1", "/sessions/first.jsonl");
    const second = makeRow("incoming-2", "/sessions/second.jsonl", { importance: 0.82 });
    const embeddedTexts: string[][] = [];
    const { llm } = stubLlm({
      decisions: [
        {
          incoming_source_ref: first.source_ref,
          incoming_content_hash: insightContentHash(first),
          decision_kind: "add",
          target_id: null,
          importance: 0.95,
          rationale: "worth keeping",
        },
      ],
    });

    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [first, second],
      llm,
      embedRows: async (texts) => {
        embeddedTexts.push([...texts]);
        return texts.map(() => new Array(768).fill(0.2));
      },
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/ORDER BY embedding <=>/.test(sql) || /ORDER BY created_at_ts DESC/.test(sql)) return [];
        return [];
      },
      storeKind: () => "postgres",
      maxClassifiedRows: 1,
    });

    assert.deepEqual(embeddedTexts, [[first.insight_text]]);
    assert.equal(plan.rows[0].importance, 0.95);
    assert.equal(plan.rows[1].importance, second.importance);
    assert.equal(plan.decisionCounts.overflow, 1);
    assert.equal(plan.geminiCallsUsed, 1);
  });

  it("replays prior lifecycle decisions on the next ingest cycle without a second llm call", async () => {
    const addRow = makeRow("incoming-add", "/sessions/add.jsonl");
    const noopRow = makeRow("incoming-noop", "/sessions/noop.jsonl", { importance: 0.62 });
    const { llm } = stubLlm({
      decisions: [
        {
          incoming_source_ref: addRow.source_ref,
          incoming_content_hash: insightContentHash(addRow),
          decision_kind: "add",
          target_id: null,
          importance: 0.94,
          rationale: "new fact",
        },
        {
          incoming_source_ref: noopRow.source_ref,
          incoming_content_hash: insightContentHash(noopRow),
          decision_kind: "noop_duplicate",
          target_id: "winner-1",
          importance: 0.71,
          rationale: "same fact",
        },
      ],
    });

    const firstCycle = await planInsightLifecycle({
      userId: "u1",
      rows: [addRow, noopRow],
      llm,
      embedRows: async (texts) => texts.map((_text, index) => new Array(768).fill(index / 10)),
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/FROM user_insights/.test(sql) && /ORDER BY embedding <=>/.test(sql)) {
          return [{ id: "winner-1", source_ref: "/sessions/winner.jsonl", text: "Existing duplicate", distance: 0.05 }];
        }
        if (/WHERE user_id = __daobrew_scope.uid/.test(sql) && /id IN/.test(sql)) {
          return [{
            id: "winner-1",
            source: "claude_project_session",
            source_ref: "/sessions/winner.jsonl",
            insight_text: "Existing duplicate",
            topics_json: ["#winner"],
            importance: 0.68,
            strength: 0.8,
            occurred_at_ts: 95,
            last_accessed_ts: null,
          }];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(firstCycle.geminiCallsUsed, 1);

    const secondCycle = await planInsightLifecycle({
      userId: "u1",
      rows: [addRow, noopRow],
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) {
          return [
            {
              incoming_source: addRow.source,
              incoming_source_ref: addRow.source_ref,
              incoming_content_hash: insightContentHash(addRow),
              decision_kind: "add",
              winner_insight_id: null,
              winner_source: null,
              winner_source_ref: null,
              loser_insight_id: null,
              loser_source: null,
              loser_source_ref: null,
              decided_importance: 0.94,
              rationale: "new fact",
            },
            {
              incoming_source: noopRow.source,
              incoming_source_ref: noopRow.source_ref,
              incoming_content_hash: insightContentHash(noopRow),
              decision_kind: "noop_duplicate",
              winner_insight_id: "winner-1",
              winner_source: "claude_project_session",
              winner_source_ref: "/sessions/winner.jsonl",
              loser_insight_id: noopRow.id,
              loser_source: noopRow.source,
              loser_source_ref: noopRow.source_ref,
              decided_importance: 0.71,
              rationale: "same fact",
            },
          ];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(secondCycle.geminiCallsUsed, 0);
    assert.equal(secondCycle.rows[0].importance, 0.94);
    assert.equal(secondCycle.rows[1].importance, 0.71);
    assert.equal(secondCycle.rows[1].strength, SUPPRESSED_INSIGHT_STRENGTH);
    assert.deepEqual(secondCycle.decisionCounts, {
      add: 0,
      supersedes: 0,
      noopDuplicate: 0,
      replayed: 2,
      overflow: 0,
    });
  });

  it("excludes the incoming natural-key row from semantic lifecycle candidates", async () => {
    const row = makeRow("incoming-changed", "/sessions/changed.jsonl", {
      insight_text: "Changed content",
    });
    const { llm, prompts } = stubLlm({
      decisions: [{
        incoming_source_ref: row.source_ref,
        incoming_content_hash: insightContentHash(row),
        decision_kind: "noop_duplicate",
        target_id: "other-row",
        importance: 0.72,
        rationale: "matches the other row",
      }],
    });

    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [row],
      llm,
      embedRows: async () => [new Array(768).fill(0.1)],
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/ORDER BY embedding <=>/.test(sql)) {
          return [
            { id: "same-row", source: row.source, source_ref: row.source_ref, text: "Prior content", distance: 0.01 },
            { id: "other-row", source: row.source, source_ref: "/sessions/other.jsonl", text: "Other content", distance: 0.02 },
          ];
        }
        if (/id IN/.test(sql)) {
          return [{
            id: "other-row",
            source: row.source,
            source_ref: "/sessions/other.jsonl",
            insight_text: "Other content",
            topics_json: ["#memory"],
            importance: 0.7,
            strength: 0.8,
            occurred_at_ts: 90,
            last_accessed_ts: null,
          }];
        }
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.equal(plan.rows[0].strength, SUPPRESSED_INSIGHT_STRENGTH);
    assert.equal(plan.lifecycleOwned[0], true);
    assert.doesNotMatch(prompts[0], /same-row/);
    assert.match(prompts[0], /other-row/);
  });

  it("discards partial current-batch ownership when a later lifecycle decision fails open", async () => {
    const first = makeRow("incoming-first", "/sessions/first-partial.jsonl", { importance: 0.4 });
    const second = makeRow("incoming-second", "/sessions/second-partial.jsonl", { importance: 0.5 });
    const { llm } = stubLlm({
      decisions: [
        {
          incoming_source_ref: first.source_ref,
          incoming_content_hash: insightContentHash(first),
          decision_kind: "add",
          target_id: null,
          importance: 0.95,
          rationale: "first decision would succeed",
        },
        {
          incoming_source_ref: second.source_ref,
          incoming_content_hash: insightContentHash(second),
          decision_kind: "noop_duplicate",
          target_id: "missing-target",
          importance: 0.85,
          rationale: "metadata lookup will fail",
        },
      ],
    });

    const plan = await planInsightLifecycle({
      userId: "u1",
      rows: [first, second],
      llm,
      embedRows: async (texts) => texts.map(() => new Array(768).fill(0.1)),
      query: async (sql) => {
        if (/FROM insight_lifecycle_decisions/.test(sql)) return [];
        if (/ORDER BY embedding <=>/.test(sql)) {
          return [{
            id: "missing-target",
            source: second.source,
            source_ref: "/sessions/missing.jsonl",
            text: "Candidate without metadata",
            distance: 0.05,
          }];
        }
        if (/id IN/.test(sql)) return [];
        return [];
      },
      storeKind: () => "postgres",
    });

    assert.deepEqual(plan.rows.map((row) => row.importance), [0.4, 0.5]);
    assert.deepEqual(plan.lifecycleOwned, [false, false]);
    assert.deepEqual(plan.postWriteSql, []);
    assert.equal(plan.warnings.length, 1);
    assert.match(plan.warnings[0], /missing-target/);
  });
});
