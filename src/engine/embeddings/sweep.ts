import { randomUUID } from "node:crypto";
import { execSql, queryJson, q, graphStoreKind } from "../../graph-db.js";
import { WARM_DB_BYTES_SQL } from "../postgres-schema.js";
import { EmbeddingProvider } from "./provider.js";

/**
 * Async embedding sweep over warm-tier rows whose embedding column IS NULL.
 * Backfill and steady-state use the same loop: select null rows, embed a
 * batch per provider call, write halfvec literals back, record one
 * pipeline_metrics row per run. On provider failure source rows stay NULL
 * so the next sweep retries them.
 */

export type SweepTable = "user_insights" | "meeting_notes" | "transfer_records";

export interface EmbedSweepOptions {
  table: SweepTable;
  batchSize?: number;
  limit?: number;
  provider: EmbeddingProvider;
  exec?: (sql: string) => Promise<void>;
  query?: (sql: string) => Promise<Record<string, any>[]>;
  nowTs?: () => number;
}

export interface EmbedSweepResult {
  rowsEmbedded: number;
  geminiCallsUsed: number;
  warnings: string[];
}

export const MEETING_BODY_EMBED_LIMIT = 12_000;

interface SweepTableConfig {
  /** Column list for the null-embedding SELECT: id, text, truncated flag. */
  textSelect: string;
  /** halfvec column the sweep reads for NULL and writes the vector into. */
  embeddingColumn: string;
  /** Predicate ensuring the row has embeddable text (skips unembeddable rows). */
  nonNullGuard: string;
}

// transfer_records has no truncation clause: canonical triggers are short by
// construction, so FALSE AS truncated is exact, not an approximation.
const TABLE_CONFIG: Record<SweepTable, SweepTableConfig> = {
  user_insights: {
    textSelect: "id, insight_text AS text, FALSE AS truncated",
    embeddingColumn: "embedding",
    nonNullGuard: "insight_text IS NOT NULL AND strength > 0",
  },
  meeting_notes: {
    textSelect: `id, COALESCE(NULLIF(summary,''), left(body, ${MEETING_BODY_EMBED_LIMIT})) AS text, (NULLIF(summary,'') IS NULL AND length(body) > ${MEETING_BODY_EMBED_LIMIT}) AS truncated`,
    embeddingColumn: "embedding",
    nonNullGuard: "COALESCE(NULLIF(summary,''), body) IS NOT NULL",
  },
  transfer_records: {
    textSelect: "id, trigger_text AS text, FALSE AS truncated",
    embeddingColumn: "trigger_embedding",
    nonNullGuard: "trigger_text IS NOT NULL",
  },
};

export function vectorLiteral(values: number[]): string {
  if (values.length !== 768) throw new Error(`Expected 768-d embedding, got ${values.length}`);
  return `'[${values.map((value) => Number(value).toPrecision(8)).join(",")}]'::halfvec`;
}

export async function embedSweep(options: EmbedSweepOptions): Promise<EmbedSweepResult> {
  const config = TABLE_CONFIG[options.table];
  if (!config) {
    throw new Error(`embedSweep supports ${Object.keys(TABLE_CONFIG).join(", ")}, got ${String(options.table)}`);
  }
  if (!options.exec && graphStoreKind() !== "postgres") {
    throw new Error("embedSweep requires DAOBREW_GRAPH_STORE=postgres; warm-tier embeddings are Postgres-only");
  }
  const exec = options.exec ?? execSql;
  const query = options.query ?? queryJson;
  const nowTs = options.nowTs ?? (() => Math.floor(Date.now() / 1000));
  const batchSize = Math.max(1, options.batchSize ?? 64);
  const limit = Math.max(1, options.limit ?? 512);
  const table = options.table;

  const startTs = nowTs();
  const warnings: string[] = [];
  const truncatedIds: string[] = [];
  let rowsEmbedded = 0;
  let geminiCallsUsed = 0;

  try {
    while (rowsEmbedded < limit) {
      const take = Math.min(batchSize, limit - rowsEmbedded);
      const rows = await query(
        `SELECT ${config.textSelect} FROM ${table} WHERE ${config.embeddingColumn} IS NULL AND ${config.nonNullGuard} ORDER BY created_at_ts LIMIT ${take}`,
      );
      if (rows.length === 0) break;
      const vectors = await options.provider.embed(rows.map((row) => String(row.text ?? "")));
      // The provider makes one embedContent HTTP request per text, so the
      // daily-quota metric must count rows, not embed() invocations.
      geminiCallsUsed += rows.length;
      if (vectors.length !== rows.length) {
        throw new Error(`Provider returned ${vectors.length} vectors for ${rows.length} rows`);
      }
      const updateSql = rows
        .map((row, index) => `UPDATE ${table} SET ${config.embeddingColumn} = ${vectorLiteral(vectors[index])} WHERE id = ${q(String(row.id))};`)
        .join("\n");
      await exec(updateSql);
      rowsEmbedded += rows.length;
      truncatedIds.push(...rows.filter((row) => row.truncated).map((row) => String(row.id)));
    }
    if (truncatedIds.length > 0) {
      warnings.push(
        `${truncatedIds.length} ${table} bodies truncated to ${MEETING_BODY_EMBED_LIMIT} chars for embedding: ${truncatedIds.join(", ")}`,
      );
    }
  } catch (err: any) {
    warnings.push(`embed sweep aborted: ${err?.message ?? err}`);
    throw err;
  } finally {
    let embeddingRowCount = 0;
    let warmDbBytes = 0;
    try {
      const counted = await query(`SELECT count(*) AS count FROM ${table} WHERE ${config.embeddingColumn} IS NOT NULL`);
      embeddingRowCount = Number(counted[0]?.count ?? 0);
      const sized = await query(WARM_DB_BYTES_SQL);
      warmDbBytes = Number(sized[0]?.bytes ?? 0);
    } catch (err: any) {
      warnings.push(`metrics readback failed: ${err?.message ?? err}`);
    }
    const durationMs = Math.max(0, (nowTs() - startTs) * 1000);
    await exec(
      `INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
        `VALUES (${q(`metric_${randomUUID()}`)}, ${q(`embed_sweep:${table}`)}, ${durationMs}, ${rowsEmbedded}, 0, ${geminiCallsUsed}, ${embeddingRowCount}, ${warmDbBytes}, ${q(JSON.stringify(warnings))}::jsonb, ${nowTs()});`,
    );
  }

  return { rowsEmbedded, geminiCallsUsed, warnings };
}
