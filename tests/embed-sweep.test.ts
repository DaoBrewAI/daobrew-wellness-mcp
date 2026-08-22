import { beforeEach, afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { embedSweep } from "../src/engine/embeddings/sweep.js";
import { EmbeddingProvider } from "../src/engine/embeddings/provider.js";
import { runEmbedSweep } from "../src/engine/internal-server.js";
import { POSTGRES_TABLES } from "../src/engine/postgres-schema.js";

function vector(value: number): number[] {
  return Array.from({ length: 768 }, () => value);
}

describe("embedSweep", () => {
  it("embeds user_insights null rows and writes one metrics row", async () => {
    const updates: string[] = [];
    const provider: EmbeddingProvider = {
      embed: async (texts) => texts.map((_, i) => vector(i / 10)),
    };

    const result = await embedSweep({
      table: "user_insights",
      batchSize: 2,
      limit: 2,
      provider,
      exec: async (sql) => { updates.push(sql); },
      query: async (sql) => {
        if (/embedding IS NULL/.test(sql)) return [
          { id: "a", text: "first" },
          { id: "b", text: "second" },
        ];
        if (/count\(\*\).*embedding IS NOT NULL/.test(sql)) return [{ count: 2 }];
        if (/pg_total_relation_size/.test(sql)) return [{ bytes: 12345 }];
        return [];
      },
      nowTs: () => 1234,
    });

    assert.strictEqual(result.rowsEmbedded, 2);
    // One embedContent HTTP request per text, so the quota metric counts rows.
    assert.strictEqual(result.geminiCallsUsed, 2);
    assert.match(updates.join("\n"), /UPDATE user_insights/);
    assert.match(updates.join("\n"), /INSERT INTO pipeline_metrics/);
  });

  it("counts one gemini call per row across multiple batches", async () => {
    let served = 0;
    const metricsInserts: string[] = [];
    const result = await embedSweep({
      table: "user_insights",
      batchSize: 2,
      limit: 3,
      provider: { embed: async (texts) => texts.map(() => vector(0.2)) },
      exec: async (sql) => { if (/INSERT INTO pipeline_metrics/.test(sql)) metricsInserts.push(sql); },
      query: async (sql) => {
        if (/embedding IS NULL/.test(sql)) {
          const remaining = 3 - served;
          const take = Math.min(2, remaining);
          const rows = Array.from({ length: take }, (_, i) => ({ id: `r${served + i}`, text: `t${served + i}` }));
          served += take;
          return rows;
        }
        return [];
      },
      nowTs: () => 1234,
    });

    assert.strictEqual(result.rowsEmbedded, 3);
    // 3 texts embedded = 3 embedContent requests, regardless of batching (2+1).
    assert.strictEqual(result.geminiCallsUsed, 3);
    assert.strictEqual(metricsInserts.length, 1);
    assert.match(metricsInserts[0], /, 3, 0, 3, /); // rows_written=3, dedup_skips=0, gemini_calls_used=3
  });

  it("warns when meeting bodies are truncated for embedding", async () => {
    const result = await embedSweep({
      table: "meeting_notes",
      batchSize: 2,
      limit: 2,
      provider: { embed: async (texts) => texts.map(() => vector(0.1)) },
      exec: async () => {},
      query: async (sql) => {
        if (/embedding IS NULL/.test(sql)) return [
          { id: "m1", text: "long body", truncated: true },
          { id: "m2", text: "short body", truncated: false },
        ];
        return [];
      },
      nowTs: () => 1234,
    });

    assert.strictEqual(result.rowsEmbedded, 2);
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /truncated/);
    assert.match(result.warnings[0], /m1/);
  });

  it("sweeps transfer_records: selects NULL trigger_embedding rows guarded by trigger_text", async () => {
    const selects: string[] = [];
    await embedSweep({
      table: "transfer_records",
      batchSize: 2,
      limit: 2,
      provider: { embed: async (texts) => texts.map(() => vector(0.2)) },
      exec: async () => {},
      query: async (sql) => {
        if (/trigger_embedding IS NULL/.test(sql)) {
          selects.push(sql);
          return selects.length === 1
            ? [
                { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
                { id: "tr2", text: "late-night deploy spiral", truncated: false },
              ]
            : [];
        }
        return [];
      },
      nowTs: () => 1234,
    });

    assert.strictEqual(
      selects[0],
      "SELECT id, trigger_text AS text, FALSE AS truncated FROM transfer_records WHERE trigger_embedding IS NULL AND trigger_text IS NOT NULL ORDER BY created_at_ts LIMIT 2",
    );
  });

  it("sweeps transfer_records: UPDATE writes trigger_embedding halfvec keyed by id", async () => {
    const updates: string[] = [];
    const result = await embedSweep({
      table: "transfer_records",
      batchSize: 2,
      limit: 2,
      provider: { embed: async (texts) => texts.map(() => vector(0.3)) },
      exec: async (sql) => { updates.push(sql); },
      query: async (sql) =>
        /trigger_embedding IS NULL/.test(sql) && updates.length === 0
          ? [
              { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
              { id: "tr2", text: "late-night deploy spiral", truncated: false },
            ]
          : [],
      nowTs: () => 1234,
    });

    assert.strictEqual(result.rowsEmbedded, 2);
    const joined = updates.join("\n");
    assert.match(joined, /UPDATE transfer_records SET trigger_embedding = '\[[^\]]+\]'::halfvec WHERE id = 'tr1';/);
    assert.match(joined, /UPDATE transfer_records SET trigger_embedding = '\[[^\]]+\]'::halfvec WHERE id = 'tr2';/);
    assert.doesNotMatch(joined, /SET embedding =/);
    assert.match(joined, /'embed_sweep:transfer_records'/);
  });

  it("sweeps transfer_records: embeds trigger_text verbatim", async () => {
    const embeddedBatches: string[][] = [];
    await embedSweep({
      table: "transfer_records",
      batchSize: 2,
      limit: 2,
      provider: {
        embed: async (texts) => {
          embeddedBatches.push([...texts]);
          return texts.map(() => vector(0.4));
        },
      },
      exec: async () => {},
      query: async (sql) =>
        /trigger_embedding IS NULL/.test(sql) && embeddedBatches.length === 0
          ? [
              { id: "tr1", text: "post-lunch meeting overrun", truncated: false },
              { id: "tr2", text: "late-night deploy spiral", truncated: false },
            ]
          : [],
      nowTs: () => 1234,
    });

    assert.deepEqual(embeddedBatches, [["post-lunch meeting overrun", "late-night deploy spiral"]]);
  });

  it("keeps meeting SQL byte-identical and excludes suppressed insights", async () => {
    const seen: Record<string, string> = {};
    for (const table of ["user_insights", "meeting_notes"] as const) {
      await embedSweep({
        table,
        batchSize: 2,
        limit: 2,
        provider: { embed: async (texts) => texts.map(() => vector(0.5)) },
        exec: async () => {},
        query: async (sql) => {
          if (/embedding IS NULL/.test(sql) && !seen[table]) seen[table] = sql;
          return [];
        },
        nowTs: () => 1234,
      });
    }
    assert.strictEqual(
      seen.user_insights,
      "SELECT id, insight_text AS text, FALSE AS truncated FROM user_insights WHERE embedding IS NULL AND insight_text IS NOT NULL AND strength > 0 ORDER BY created_at_ts LIMIT 2",
    );
    assert.strictEqual(
      seen.meeting_notes,
      "SELECT id, COALESCE(NULLIF(summary,''), left(body, 12000)) AS text, (NULLIF(summary,'') IS NULL AND length(body) > 12000) AS truncated FROM meeting_notes WHERE embedding IS NULL AND COALESCE(NULLIF(summary,''), body) IS NOT NULL ORDER BY created_at_ts LIMIT 2",
    );
  });

  it("sizes warm_db_bytes over every schema table so growth is never invisible to alerts", async () => {
    const sizeQueries: string[] = [];
    await embedSweep({
      table: "user_insights",
      batchSize: 1,
      limit: 1,
      provider: { embed: async (texts) => texts.map(() => vector(0.1)) },
      exec: async () => {},
      query: async (sql) => {
        if (/pg_total_relation_size/.test(sql)) sizeQueries.push(sql);
        return [];
      },
      nowTs: () => 1234,
    });
    assert.strictEqual(sizeQueries.length, 1);
    for (const table of POSTGRES_TABLES) {
      assert.ok(
        sizeQueries[0].includes(`to_regclass('${table}')`),
        `warm-db size query must include ${table}`,
      );
    }
  });

  it("leaves rows null when provider fails", async () => {
    const updates: string[] = [];
    await assert.rejects(() => embedSweep({
      table: "meeting_notes",
      batchSize: 1,
      limit: 1,
      provider: { embed: async () => { throw new Error("quota"); } },
      exec: async (sql) => { updates.push(sql); },
      query: async (sql) => /embedding IS NULL/.test(sql) ? [{ id: "m1", text: "body" }] : [],
      nowTs: () => 1234,
    }));
    assert.doesNotMatch(updates.join("\n"), /UPDATE meeting_notes/);
  });
});

describe("runEmbedSweep gemini key gate", () => {
  // DAOBREW_POSTGRES_URL / DAOBREW_GRAPH_STORE are cleared too so the skip
  // path is provably DB-free: this test passing without any database IS the
  // proof that the guard runs before all table work.
  const ENV_KEYS = [
    "DAOBREW_CONFIG_FILE",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "DAOBREW_POSTGRES_URL",
    "DAOBREW_GRAPH_STORE",
  ] as const;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/config.json";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
  });

  it("skips with a warning and zero work when no gemini key exists anywhere", async () => {
    const result = await runEmbedSweep();
    assert.strictEqual(result.rowsEmbedded, 0);
    assert.strictEqual(result.geminiCallsUsed, 0);
    assert.deepEqual(result.alerts, []);
    assert.match(result.warnings.join(" "), /gemini key missing.*embed sweep skipped/i);
  });

  it("default sweep table set includes transfer_records", async () => {
    const result = await runEmbedSweep();
    assert.deepEqual(Object.keys(result.tables).sort(), [
      "meeting_notes",
      "transfer_records",
      "user_insights",
    ]);
  });
});
