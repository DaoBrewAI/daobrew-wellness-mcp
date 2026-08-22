import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  canonicalProfileText,
  canonicalTriggerText,
  embedProfileVector,
  embedTriggerVector,
} from "../src/engine/transfer/vectors.js";
import { EmbeddingProvider } from "../src/engine/embeddings/provider.js";
import { isOptedIn, purgeContributor } from "../src/engine/transfer/consent.js";
import { contributorHash } from "../src/engine/memory/keys.js";
import {
  rerankTransferCandidates,
  retrieveTransferCandidates,
  stage1AnnSql,
} from "../src/engine/transfer/retrieve.js";
import { attachTransferCandidates } from "../src/engine/transfer/context.js";
import { emitTransferRecord } from "../src/engine/transfer/records.js";
import { writeProfileVector } from "../src/engine/transfer/profile.js";
import { runTransferPriorsJob } from "../src/engine/transfer/priors.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function sharedGraphMigrationSource(): string {
  const root = existsSync(resolve(process.cwd(), "alembic.ini"))
    ? process.cwd()
    : resolve(process.cwd(), "..");
  return readFileSync(
    resolve(root, "alembic", "versions", "0015_shared_graph_schema.py"),
    "utf8",
  );
}

function fakeProvider(calls: string[][]): EmbeddingProvider {
  return {
    async embed(texts: string[]) {
      calls.push(texts);
      return texts.map(() => new Array(768).fill(0.25));
    },
  };
}

describe("transfer vectors (5B)", () => {
  it("canonical trigger text is deterministic across input order and casing", () => {
    const a = canonicalTriggerText({
      stressPattern: "overdrive",
      rootCauseClass: "productivity",
      contextTerms: ["demo", "one-wedge"],
    });
    const b = canonicalTriggerText({
      stressPattern: "Overdrive",
      rootCauseClass: "productivity",
      contextTerms: ["#One-Wedge", "demo", "demo"],
    });
    assert.equal(a, b);
    assert.equal(a, "trigger overdrive productivity | ctx: demo one-wedge");
  });

  it("canonical trigger text tolerates missing context terms", () => {
    assert.equal(
      canonicalTriggerText({ stressPattern: "tension", rootCauseClass: "productivity", contextTerms: [] }),
      "trigger tension productivity",
    );
  });

  it("canonical profile text is stable and never carries snapshot prose", () => {
    const input = {
      dominantPatterns: ["Wood", "fire", "wood"],
      threadKeys: ["root:ghost_b", "root:ghost_a"],
      snapshotClaimCeiling: "attribution_candidate",
    };
    const withProse = {
      ...input,
      snapshot_text: "Neo keeps circling the one wedge demo proof loop",
    } as typeof input;
    const a = canonicalProfileText(input);
    const b = canonicalProfileText(withProse);
    assert.equal(a, b);
    assert.equal(a, "profile patterns: fire wood | threads: root:ghost_a root:ghost_b | ceiling: attribution_candidate");
    assert.ok(!b.includes("one wedge demo proof loop"));
  });

  it("embeds trigger and profile text through the provider, one call each", async () => {
    const calls: string[][] = [];
    const provider = fakeProvider(calls);
    const trigger = await embedTriggerVector(provider, {
      stressPattern: "overdrive",
      rootCauseClass: "productivity",
      contextTerms: ["demo"],
    });
    const profile = await embedProfileVector(provider, {
      dominantPatterns: ["wood"],
      threadKeys: ["root:g1"],
      snapshotClaimCeiling: null,
    });
    assert.equal(trigger.text, "trigger overdrive productivity | ctx: demo");
    assert.equal(trigger.vector.length, 768);
    assert.equal(profile.text, "profile patterns: wood | threads: root:g1");
    assert.equal(profile.vector.length, 768);
    assert.deepEqual(calls, [[trigger.text], [profile.text]]);
  });
});

describe("transfer consent (5B, default-closed)", () => {
  it("isOptedIn is false with no row, false row, and true only on opted_in", async () => {
    const rows: Record<string, any>[] = [];
    const query = async (_sql: string) => rows;
    assert.equal(await isOptedIn("local", query), false);
    rows.push({ opted_in: false });
    assert.equal(await isOptedIn("local", query), false);
    rows[0] = { opted_in: true };
    assert.equal(await isOptedIn("local", query), true);
  });

  it("purge deletes by contributor hash and revokes consent, never naming the user in transfer_records SQL", async () => {
    const executed: string[] = [];
    const exec = async (sql: string) => {
      executed.push(sql);
    };
    await purgeContributor({ userId: "pii-user-7", salt: "salt-a", exec, nowTs: 1_750_000_000 });
    const hash = contributorHash("pii-user-7", "salt-a");
    const deleteSql = executed.find((sql) => sql.includes("DELETE FROM transfer_records"));
    assert.ok(deleteSql, "expected a transfer_records DELETE");
    assert.ok(deleteSql.includes(hash));
    assert.ok(!deleteSql.includes("pii-user-7"), "identity must not appear in transfer_records SQL");
    const consentSql = executed.find((sql) => sql.includes("transfer_consent"));
    assert.ok(consentSql, "expected a consent revocation write");
    assert.match(consentSql, /opted_in/);
    assert.match(consentSql, /FALSE|false/);
  });

  it("purge fails closed when the salt is missing", async () => {
    await assert.rejects(
      () => purgeContributor({ userId: "local", salt: "", exec: async () => {}, nowTs: 1 }),
      /DAOBREW_TRANSFER_SALT/,
    );
  });
});

describe("transfer two-stage retrieval (5B)", () => {
  const CURRENT_BUCKET = { stress_pattern: "overdrive", root_cause_class: "productivity" };

  function candidate(over: Record<string, any> = {}): Record<string, any> {
    return {
      id: "trf_x",
      method_json: { suggested_block: { title: "Draft wedge" } },
      outcome: "worked",
      outcome_strength: 1,
      context_bucket_json: { ...CURRENT_BUCKET },
      contributor_hash: "c1",
      distance: 0.1,
      created_at_ts: 1_700_000_000,
      ...over,
    };
  }

  it("stage-1 SQL is pure ANN: bare <=> ORDER BY, worked-only, index-friendly", () => {
    const sql = stage1AnnSql(new Array(768).fill(0.5), 100);
    assert.match(sql, /WHERE trigger_embedding IS NOT NULL AND outcome = 'worked'/);
    assert.match(sql, /ORDER BY trigger_embedding <=> '\[[^']+\]'::halfvec\s+LIMIT 100/);
    const orderBy = sql.slice(sql.indexOf("ORDER BY"));
    assert.ok(!/[+*]/.test(orderBy), "no arithmetic mixed into the ANN ORDER BY");
  });

  it("re-rank is weighted (0.5/0.3/0.2): outcome and context beat raw similarity", () => {
    const closeButWeak = candidate({
      id: "trf_a",
      contributor_hash: "c_a",
      distance: 0.05,
      outcome_strength: 0.2,
      context_bucket_json: { stress_pattern: "tension", root_cause_class: "sleep" },
    });
    const fartherButProven = candidate({ id: "trf_b", contributor_hash: "c_b", distance: 0.1 });
    const ranked = rerankTransferCandidates([closeButWeak, fartherButProven], CURRENT_BUCKET);
    assert.equal(ranked[0].id, "trf_b");
    assert.ok(ranked[0].score > ranked[1].score);
  });

  it("recency carries zero weight: identical candidates differing only by age tie exactly", () => {
    const oldRec = candidate({ id: "trf_old", contributor_hash: "c_old", created_at_ts: 1_000_000_000 });
    const newRec = candidate({ id: "trf_new", contributor_hash: "c_new", created_at_ts: 1_800_000_000 });
    const ranked = rerankTransferCandidates([oldRec, newRec], CURRENT_BUCKET);
    assert.equal(ranked[0].score, ranked[1].score);
  });

  it("returns at most k=3", () => {
    const ranked = rerankTransferCandidates(
      [
        candidate({ id: "a", contributor_hash: "c1" }),
        candidate({ id: "b", contributor_hash: "c2" }),
        candidate({ id: "c", contributor_hash: "c3" }),
        candidate({ id: "d", contributor_hash: "c4" }),
      ],
      CURRENT_BUCKET,
    );
    assert.equal(ranked.length, 3);
  });

  it("serves at most one record per contributor: the higher-scoring one wins", () => {
    const ranked = rerankTransferCandidates(
      [
        candidate({ id: "trf_weak", contributor_hash: "c1", outcome_strength: 0.2 }),
        candidate({ id: "trf_strong", contributor_hash: "c1", outcome_strength: 1 }),
        candidate({ id: "trf_other", contributor_hash: "c2", outcome_strength: 0.5 }),
      ],
      CURRENT_BUCKET,
    );
    assert.equal(ranked.length, 2, "duplicate-contributor record is capped out");
    assert.deepEqual(ranked.map((c) => c.id), ["trf_strong", "trf_other"]);
  });

  it("cap runs before the k-slice: a capped-out duplicate promotes the next contributor into top-k", () => {
    // Kills the slice-then-cap mutant: c1's second record must not consume a
    // top-3 slot — the lower-scored fresh contributor c4 takes it instead.
    const ranked = rerankTransferCandidates(
      [
        candidate({ id: "trf_c1_best", contributor_hash: "c1", outcome_strength: 1 }),
        candidate({ id: "trf_c1_second", contributor_hash: "c1", outcome_strength: 0.9 }),
        candidate({ id: "trf_c2", contributor_hash: "c2", outcome_strength: 0.8 }),
        candidate({ id: "trf_c3", contributor_hash: "c3", outcome_strength: 0.7 }),
        candidate({ id: "trf_c4", contributor_hash: "c4", outcome_strength: 0.6 }),
      ],
      CURRENT_BUCKET,
    );
    assert.deepEqual(ranked.map((c) => c.id), ["trf_c1_best", "trf_c2", "trf_c3"]);
    assert.equal(ranked.length, 3);
    // and with only the duplicate blocking, c4 is served:
    const promoted = rerankTransferCandidates(
      [
        candidate({ id: "trf_c1_best", contributor_hash: "c1", outcome_strength: 1 }),
        candidate({ id: "trf_c1_second", contributor_hash: "c1", outcome_strength: 0.9 }),
        candidate({ id: "trf_c2", contributor_hash: "c2", outcome_strength: 0.8 }),
        candidate({ id: "trf_c4", contributor_hash: "c4", outcome_strength: 0.6 }),
      ],
      CURRENT_BUCKET,
    );
    assert.deepEqual(promoted.map((c) => c.id), ["trf_c1_best", "trf_c2", "trf_c4"]);
  });

  it("records without a contributor_hash each count as their own contributor", () => {
    const ranked = rerankTransferCandidates(
      [
        candidate({ id: "trf_m1", contributor_hash: "" }),
        candidate({ id: "trf_m2", contributor_hash: null }),
        candidate({ id: "trf_m3", contributor_hash: undefined }),
      ],
      CURRENT_BUCKET,
    );
    assert.equal(ranked.length, 3, "missing hashes must not collapse into one contributor");
  });

  it("k-anon: buckets below 5 distinct contributors are suppressed before re-rank", async () => {
    const pool = [1, 2, 3].map((i) => candidate({ id: `trf_${i}`, contributor_hash: `c${i}` }));
    const makeQuery = (contributors: number) => async (sql: string) => {
      if (/ORDER BY trigger_embedding <=>/.test(sql)) return pool;
      if (/COUNT\(DISTINCT contributor_hash\)/.test(sql)) {
        return [{ stress_pattern: "overdrive", root_cause_class: "productivity", contributors }];
      }
      return [];
    };
    const suppressed = await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: CURRENT_BUCKET,
      query: makeQuery(4),
    });
    assert.equal(suppressed.source, "none");
    assert.deepEqual(suppressed.candidates, []);

    const served = await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: CURRENT_BUCKET,
      query: makeQuery(5),
    });
    assert.equal(served.source, "transfer_records");
    assert.equal(served.candidates.length, 3);
    assert.ok(served.candidates[0].score > 0);
  });

  it("stage-1 pool defaults to LIMIT 15 when no stage1Limit is passed", async () => {
    const captured: string[] = [];
    await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: CURRENT_BUCKET,
      query: async (sql: string) => {
        captured.push(sql);
        return [];
      },
    });
    const annSql = captured.find((sql) => /ORDER BY trigger_embedding <=>/.test(sql));
    assert.ok(annSql, "ANN query was issued");
    assert.match(annSql!, /LIMIT 15;/);
  });

  it("returns the none marker on an empty pool", async () => {
    const result = await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: CURRENT_BUCKET,
      query: async () => [],
    });
    assert.equal(result.source, "none");
    assert.deepEqual(result.candidates, []);
  });
});

describe("transfer retrieval falls back to population priors (5B/§6)", () => {
  it("suppressed or empty pools fall back to the cohort prior when one exists", async () => {
    const prior = {
      stress_pattern: "overdrive",
      prior_json: { worked: 6, did_not_work: 2, top_methods: [] },
      sample_size: 8,
      confidence: 0.5,
      version: 5,
    };
    const result = await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: { stress_pattern: "overdrive", root_cause_class: "productivity" },
      query: async () => [],
      readPrior: async (pattern: string) => (pattern === "overdrive" ? prior : null),
    });
    assert.equal(result.source, "population_priors");
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.prior, prior);
  });

  it("stays none when neither neighbors nor priors exist", async () => {
    const result = await retrieveTransferCandidates({
      triggerVector: new Array(768).fill(0.5),
      contextBucket: { stress_pattern: "overdrive", root_cause_class: "productivity" },
      query: async () => [],
      readPrior: async () => null,
    });
    assert.equal(result.source, "none");
    assert.equal(result.prior, undefined);
  });
});

describe("transfer candidates attach context-only to the armed root (5B/D7)", () => {
  function armedDelta(props: Record<string, any>) {
    return {
      user_id: "local",
      nodes: [{ id: "ghost_x", kind: "ghost", title: "ROOT", source: "reasoner", source_ref: "r:x", props_json: props }],
      edges: [],
      armed_root_cause: { node_id: "ghost_x" },
    } as any;
  }

  function servedQuery(): (sql: string) => Promise<Record<string, any>[]> {
    return async (sql: string) => {
      if (/ORDER BY trigger_embedding <=>/.test(sql)) {
        return [1, 2, 3, 4, 5].map((i) => ({
          id: `trf_${i}`,
          method_json: { suggested_block: { title: `Method ${i}` } },
          outcome: "worked",
          outcome_strength: 0.8,
          context_bucket_json: { stress_pattern: "overdrive", root_cause_class: "productivity" },
          contributor_hash: `c${i}`,
          distance: 0.1 * i,
        }));
      }
      if (/COUNT\(DISTINCT contributor_hash\)/.test(sql)) {
        return [{ stress_pattern: "overdrive", root_cause_class: "productivity", contributors: 5 }];
      }
      return [];
    };
  }

  it("attaches at most 3 stable-field candidates under memory_context, hash-free", async () => {
    const delta = armedDelta({
      status: "armed",
      selected_pattern: "overdrive",
      root_cause_class: "productivity",
      linked_patterns: ["wood"],
    });
    const result = await attachTransferCandidates({
      delta,
      userId: "local",
      query: servedQuery(),
      provider: fakeProvider([]),
    });
    assert.equal(result.source, "transfer_records");
    assert.equal(result.attached, 3);
    const ctx = delta.nodes[0].props_json.memory_context;
    assert.ok(ctx);
    assert.equal(ctx.transfer_source, "transfer_records");
    assert.equal(ctx.transport_status, "source_prior", "neighbors are un-transported source priors (§5.6)");
    assert.equal(ctx.transfer_candidates.length, 3);
    for (const candidate of ctx.transfer_candidates) {
      assert.deepEqual(Object.keys(candidate).sort(), ["method", "outcome_strength", "score"]);
    }
    assert.ok(!JSON.stringify(ctx).includes("contributor"), "contributor hashes must not surface");
  });

  it("skips watching-shaped roots (no selected_pattern) without touching props", async () => {
    const delta = armedDelta({ status: "watching" });
    const result = await attachTransferCandidates({
      delta,
      userId: "local",
      query: servedQuery(),
      provider: fakeProvider([]),
    });
    assert.equal(result.source, "none");
    assert.equal(result.attached, 0);
    assert.equal(delta.nodes[0].props_json.memory_context, undefined);
  });

  it("surfaces the prior as transfer_prior when neighbors are unavailable", async () => {
    const delta = armedDelta({ selected_pattern: "overdrive", root_cause_class: "productivity" });
    const result = await attachTransferCandidates({
      delta,
      userId: "local",
      query: async (sql: string) =>
        /FROM population_priors WHERE/.test(sql)
          ? [{ stress_pattern: "overdrive", prior_json: { worked: 6, did_not_work: 2, top_methods: [] }, sample_size: 8, confidence: 0.5, version: 2 }]
          : [],
      provider: fakeProvider([]),
    });
    assert.equal(result.source, "population_priors");
    const ctx = delta.nodes[0].props_json.memory_context;
    assert.equal(ctx.transfer_source, "population_priors");
    assert.equal(ctx.transport_status, "source_prior", "cohort priors are un-transported source priors (§5.6)");
    assert.equal(ctx.transfer_prior.prior_json.worked, 6);
    assert.equal(ctx.transfer_candidates, undefined);
  });

  it("leaves props untouched on none, and warns instead of attaching without a provider", async () => {
    const delta = armedDelta({ selected_pattern: "overdrive", root_cause_class: "productivity" });
    const none = await attachTransferCandidates({ delta, userId: "local", query: async () => [], provider: fakeProvider([]) });
    assert.equal(none.source, "none");
    assert.equal(delta.nodes[0].props_json.memory_context, undefined);

    const noProvider = await attachTransferCandidates({ delta, userId: "local", query: servedQuery(), provider: null });
    assert.equal(noProvider.attached, 0);
    assert.ok(noProvider.warnings.some((w) => w.includes("provider")));
    assert.equal(delta.nodes[0].props_json.memory_context, undefined);
  });
});

describe("5B privacy verification suite (mandatory gates)", () => {
  const PII_USER = "pii-user-7";
  const PII_MARKERS = [
    PII_USER,
    "PII_PROSE_SENTINEL",
    "/Users/neo/secret/wedge.md",
    "TRANSCRIPT_SENTINEL",
  ];

  it("the emitter's SQL carries zero planted PII end to end", async () => {
    const executed: string[] = [];
    const result = await emitTransferRecord({
      userId: PII_USER,
      ghostId: "ghost_pii",
      threadKey: "root:ghost_pii",
      threadId: "cmt_pii",
      handledAtTs: 1_750_000_000,
      verdict: "no_recurrence_observed",
      ghostProps: {
        selected_pattern: "overdrive",
        root_cause_class: "productivity",
        linked_patterns: ["wood"],
        artifact_ref: "/Users/neo/secret/wedge.md",
        summary: "TRANSCRIPT_SENTINEL long prose about the user's meetings",
        brief: {
          cause: "PII_PROSE_SENTINEL cause narrative",
          evidence: ["TRANSCRIPT_SENTINEL evidence span"],
          artifact_spec: "Write the wedge doc",
          suggested_block: { title: "Draft wedge", start_offset_min: 30, duration_min: 45 },
        },
      },
      salt: "salt-a",
      provider: { embed: async (texts) => texts.map(() => new Array(768).fill(0.1)) },
      exec: async (sql) => { executed.push(sql); },
      query: async (sql) =>
        /FROM transfer_consent WHERE/.test(sql) ? [{ opted_in: true }] : [],
      nowTs: 1_750_000_100,
    });
    assert.equal(result.written, 1);
    const transferSql = executed.filter((sql) => sql.includes("transfer_records"));
    assert.equal(transferSql.length, 1);
    for (const marker of PII_MARKERS) {
      assert.ok(!transferSql[0].includes(marker), `PII marker leaked into transfer SQL: ${marker}`);
    }
  });

  it("population priors never republish contributor hashes", async () => {
    const calls: string[] = [];
    await runTransferPriorsJob({
      exec: async (sql) => { calls.push(sql); },
      query: async (sql) => {
        if (/COUNT\(DISTINCT contributor_hash\)/.test(sql)) {
          return [{ stress_pattern: "overdrive", outcome: "worked", n: 6, contributors: 6 }];
        }
        if (/AS stress_pattern, method_json/.test(sql)) {
          return [{ stress_pattern: "overdrive", method_json: { suggested_block: { title: "Draft wedge" } }, outcome_strength: 0.9, contributor_hash: "c0ffee11c0ffee11c0ffee11" }];
        }
        if (/MAX\(version\)/.test(sql)) return [{ v: null }];
        return [];
      },
      nowTs: () => 1_800_000_000,
    });
    const priorInsert = calls.find((sql) => /INSERT INTO population_priors/.test(sql));
    assert.ok(priorInsert);
    assert.ok(!priorInsert.includes("c0ffee11c0ffee11c0ffee11"), "contributor hash must not surface in priors");
    assert.ok(!priorInsert.includes("contributor_hash"), "priors must not reference contributor identity at all");
  });

  it("the transfer DDL itself is identity-free (re-assert of the schema gate)", () => {
    const migration = sharedGraphMigrationSource();
    const start = migration.indexOf("CREATE TABLE IF NOT EXISTS transfer_records(");
    const ddl = migration.slice(start, migration.indexOf(");", start));
    assert.doesNotMatch(ddl, /user_id/);
  });
});

// F1 One-Time-Filter regression: under scopedQuery, a `user_id = '<literal>'`
// in the body lets the planner fold the RLS qual into a One-Time Filter
// evaluated at executor startup — before the lateral scope row has run
// set_config — so a fresh pooled backend silently returns zero rows. Read
// bodies must reference the scope row's uid instead. consent is DUAL-MODE
// (store-aware expression: sqlite has no scope wrapper), records/profile run
// only on the postgres nightly path (unconditional scope-row reference).
describe("transfer RLS scoping (F1 One-Time-Filter regression)", () => {
  async function withGraphStore<T>(kind: string, fn: () => Promise<T>): Promise<T> {
    const previous = process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_GRAPH_STORE = kind;
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env.DAOBREW_GRAPH_STORE;
      else process.env.DAOBREW_GRAPH_STORE = previous;
    }
  }

  it("consent read references the scope row under postgres, never the literal", async () => {
    await withGraphStore("postgres", async () => {
      const reads: string[] = [];
      await isOptedIn("u-consent", async (sql) => { reads.push(sql); return []; });
      assert.equal(reads.length, 1);
      assert.ok(
        reads[0].includes("user_id = __daobrew_scope.uid"),
        `consent read must filter user_id via the scope row, got: ${reads[0]}`,
      );
      assert.ok(
        !reads[0].includes("user_id = 'u-consent'"),
        `consent read must NOT compare user_id to a literal, got: ${reads[0]}`,
      );
    });
  });

  it("consent read keeps the escaped literal under sqlite (plain queryJson has no scope row)", async () => {
    await withGraphStore("sqlite", async () => {
      const reads: string[] = [];
      await isOptedIn("u-consent", async (sql) => { reads.push(sql); return []; });
      assert.equal(reads.length, 1);
      assert.ok(
        reads[0].includes("user_id = 'u-consent'"),
        `sqlite consent read must keep the literal, got: ${reads[0]}`,
      );
      assert.ok(
        !reads[0].includes("__daobrew_scope.uid"),
        `sqlite has no scope row — the reference would be an unknown-column error, got: ${reads[0]}`,
      );
    });
  });

  it("the emitter's verdict-count read references the scope row, never the literal", async () => {
    await withGraphStore("postgres", async () => {
      const reads: string[] = [];
      await emitTransferRecord({
        userId: "pii-user-7",
        ghostId: "ghost_pii",
        threadKey: "root:ghost_pii",
        threadId: "cmt_pii",
        handledAtTs: 1_750_000_000,
        verdict: "no_recurrence_observed",
        ghostProps: { selected_pattern: "overdrive", root_cause_class: "productivity" },
        salt: "salt-a",
        provider: null,
        exec: async () => {},
        query: async (sql) => {
          reads.push(sql);
          return /FROM transfer_consent WHERE/.test(sql) ? [{ opted_in: true }] : [];
        },
        nowTs: 1_750_000_100,
      });
      const verdictReads = reads.filter((sql) => sql.includes("FROM thread_verifications"));
      assert.equal(verdictReads.length, 1);
      assert.ok(
        verdictReads[0].includes("user_id = __daobrew_scope.uid"),
        `verdict-count read must filter user_id via the scope row, got: ${verdictReads[0]}`,
      );
      assert.ok(
        !verdictReads[0].includes("user_id = 'pii-user-7'"),
        `verdict-count read must NOT compare user_id to a literal, got: ${verdictReads[0]}`,
      );
    });
  });

  it("profile-vector reads reference the scope row, never the literal", async () => {
    const reads: string[] = [];
    const query = async (sql: string) => {
      reads.push(sql);
      if (/FROM causal_memory_threads/.test(sql)) {
        return [{ thread_key: "root:ghost_a", pattern_keys_json: ["wood"] }];
      }
      return [];
    };
    await writeProfileVector({
      userId: "u-prof",
      provider: fakeProvider([]),
      exec: async () => {},
      query,
      nowTs: 1_750_000_000,
    });
    // threads read + latest-version read + snapshot claim-ceiling read
    assert.equal(reads.length, 3);
    for (const sql of reads) {
      assert.ok(
        sql.includes("user_id = __daobrew_scope.uid"),
        `profile read must filter user_id via the scope row, got: ${sql}`,
      );
      assert.ok(
        !sql.includes("user_id = 'u-prof'"),
        `profile read must NOT compare user_id to a literal, got: ${sql}`,
      );
    }
  });
});
