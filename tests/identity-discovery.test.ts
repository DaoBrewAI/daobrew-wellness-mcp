import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { discoverActiveIdentities, canonicalIdentities } from "../src/engine/identity-discovery.js";

describe("canonicalIdentities", () => {
  const UUID_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
  const UUID_B = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
  const UUID_C = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";

  it("drops api-key legacy buckets instead of treating them as runnable identities", () => {
    assert.deepStrictEqual(canonicalIdentities(["dbk_alice", "apikey:dbk_alice"]), []);
  });

  it("keeps a canonical UUID as a standalone principal", () => {
    assert.deepStrictEqual(canonicalIdentities([UUID_A.toLowerCase()]), [UUID_A]);
  });

  it("dedupes and sorts UUID anchors deterministically", () => {
    assert.deepStrictEqual(
      canonicalIdentities([UUID_B, UUID_A, UUID_B.toLowerCase()]),
      [UUID_A, UUID_B],
    );
  });

  it("drops empty/falsy ids", () => {
    assert.deepStrictEqual(canonicalIdentities(["", UUID_A]), [UUID_A]);
  });

  it("drops non-UUID labels", () => {
    assert.deepStrictEqual(canonicalIdentities(["UUID-X", "local", "config-user"]), []);
  });
});

describe("discoverActiveIdentities", () => {
  const UUID_A = "14802294-BEED-480E-ABF6-7E3703FA25CD";
  const UUID_B = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
  const UUID_C = "C6408EC3-4463-4FFC-A0A3-6CE44B5558CF";

  it("unions DISTINCT UUID user_ids across biometric + insight tables and drops legacy buckets", async () => {
    const sqls: string[] = [];
    const query = async (sql: string): Promise<any[]> => {
      sqls.push(sql);
      if (sql.includes("information_schema.tables")) {
        return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
      }
      if (sql.includes("FROM intraday_state")) return [{ user_id: "apikey:dbk_alice" }, { user_id: UUID_A }];
      if (sql.includes("FROM health_samples")) return [{ user_id: "dbk_alice" }, { user_id: UUID_A.toLowerCase() }];
      if (sql.includes("FROM user_insights")) return [{ user_id: "apikey:dbk_alice" }, { user_id: UUID_B }];
      throw new Error(`unexpected sql: ${sql}`);
    };

    const ids = await discoverActiveIdentities({ query, nowTs: 1_000_000, windowDays: 30 });

    assert.deepStrictEqual([...ids].sort(), [UUID_A, UUID_B].sort());
  });

  it("runs on the plain owner executor — never a scopedQuery wrapper", async () => {
    const sqls: string[] = [];
    const query = async (sql: string): Promise<any[]> => {
      sqls.push(sql);
      if (sql.includes("information_schema.tables")) {
        return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
      }
      return [];
    };
    await discoverActiveIdentities({ query, nowTs: 1_000_000, windowDays: 30 });
    assert.ok(
      !sqls.some((s) => /set_config|__daobrew_scope/.test(s)),
      "discovery must NOT use scopedQuery — it would fail-closed to one user",
    );
  });

  it("applies the recency window on the right column per table", async () => {
    const cutoff = 1_000_000 - 30 * 86_400;
    const sqls: string[] = [];
    const query = async (sql: string): Promise<any[]> => {
      sqls.push(sql);
      if (sql.includes("information_schema.tables")) {
        return [{ table_name: "intraday_state" }, { table_name: "health_samples" }];
      }
      return [];
    };
    await discoverActiveIdentities({ query, nowTs: 1_000_000, windowDays: 30 });

    const stateSql = sqls.find((s) => s.includes("FROM intraday_state"))!;
    const sampleSql = sqls.find((s) => s.includes("FROM health_samples"))!;
    const insightSql = sqls.find((s) => s.includes("FROM user_insights"))!;
    assert.ok(stateSql.includes(`bucket_ts >= ${cutoff}`), `state: ${stateSql}`);
    assert.ok(sampleSql.includes(`start_time_ts >= ${cutoff}`), `sample: ${sampleSql}`);
    assert.ok(insightSql.includes(`created_at_ts >= ${cutoff}`), `insight: ${insightSql}`);
    // Each is a DISTINCT user_id scan (no per-user literal comparison).
    for (const [label, sql] of [["state", stateSql], ["sample", sampleSql], ["insight", insightSql]] as const) {
      assert.ok(/SELECT DISTINCT user_id/.test(sql), `${label} must be a DISTINCT user_id scan, got: ${sql}`);
    }
  });

  it("tolerates absent backend biometric tables (probe-guarded, insights only)", async () => {
    const query = async (sql: string): Promise<any[]> => {
      if (sql.includes("information_schema.tables")) return []; // no backend tables present
      if (sql.includes("FROM intraday_state") || sql.includes("FROM health_samples")) {
        throw new Error(`must not query absent table: ${sql}`);
      }
      if (sql.includes("FROM user_insights")) return [{ user_id: UUID_C }];
      throw new Error(`unexpected sql: ${sql}`);
    };
    const ids = await discoverActiveIdentities({ query, nowTs: 1_000_000, windowDays: 30 });
    assert.deepStrictEqual([...ids], [UUID_C]);
  });
});
