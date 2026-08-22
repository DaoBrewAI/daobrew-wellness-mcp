// Mask the machine's real ~/.daobrew/config.json BEFORE anything resolves the
// graph store (same guard as detonate.test.ts): an unmasked run could resolve
// graphStoreKind() to postgres and probe a real remote DB.
process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";

import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { handleToolCall } from "../src/development-tools.js";
import * as graphDb from "../src/graph-db.js";
import { __resetGraphDbConfigCacheForTests } from "../src/graph-db.js";
import {
  assignArmedOffer,
  assignmentId,
  drawOfferArm,
  interventionAssignmentSql,
  mrtTreatmentP,
  logInterventionAssignment,
  prepareArmedOffer,
  DEFAULT_MRT_TREATMENT_P,
  OFFER_ELIGIBLE_ACTIONS,
  RANDOMIZED_ROUTE_POLICY,
} from "../src/engine/assignments.js";

/**
 * MRT randomization v1 (design 2026-07-06 "Verification-loop completeness"):
 * system-initiated offers are randomized at arming time with a
 * hash-deterministic per-episode draw — sha256(userId|ghostId|armedAtTs) →
 * uniform [0,1), treatment iff draw < p. No RNG state: retries re-draw the
 * SAME arm, and the draw is auditable from the assignment row alone.
 */

const MRT_TEST_USER = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const EPISODE = { userId: MRT_TEST_USER, ghostId: "ghost_x", armedAtTs: 1_750_000_000 };

describe("drawOfferArm (hash-deterministic episode draw)", () => {
  it("is deterministic: same episode key always draws the same arm and value", () => {
    const a = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs, 0.9);
    const b = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs, 0.9);
    assert.deepStrictEqual(a, b);
    assert.ok(a.draw >= 0 && a.draw < 1, "draw must be uniform in [0,1)");
  });

  it("changes the draw when any episode key component changes", () => {
    const base = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs, 0.9);
    const byUser = drawOfferArm("other", EPISODE.ghostId, EPISODE.armedAtTs, 0.9);
    const byGhost = drawOfferArm(EPISODE.userId, "ghost_y", EPISODE.armedAtTs, 0.9);
    const byEpisode = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs + 1, 0.9);
    assert.notStrictEqual(base.draw, byUser.draw);
    assert.notStrictEqual(base.draw, byGhost.draw);
    assert.notStrictEqual(base.draw, byEpisode.draw);
  });

  it("p=1 always assigns treatment; p=0 always assigns control (draw < p on [0,1))", () => {
    for (let i = 0; i < 50; i += 1) {
      const treated = drawOfferArm("u", `ghost_${i}`, 1_000 + i, 1);
      assert.strictEqual(treated.arm, "task_package");
      assert.strictEqual(treated.assignmentProbability, 1);
      const held = drawOfferArm("u", `ghost_${i}`, 1_000 + i, 0);
      assert.strictEqual(held.arm, "hold_noop");
      assert.strictEqual(held.assignmentProbability, 1);
    }
  });

  it("clamps p into [0,1] and records the ASSIGNED arm's probability", () => {
    const over = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs, 1.5);
    assert.strictEqual(over.treatmentProbability, 1);
    assert.strictEqual(over.arm, "task_package");
    const under = drawOfferArm(EPISODE.userId, EPISODE.ghostId, EPISODE.armedAtTs, -0.2);
    assert.strictEqual(under.treatmentProbability, 0);
    assert.strictEqual(under.arm, "hold_noop");

    // assignment_probability = p for treatment, 1-p for control — rounded so
    // float dust (1 - 0.9 = 0.099999...) never reaches the SQL literal.
    const p = 0.9;
    for (let i = 0; i < 200; i += 1) {
      const draw = drawOfferArm("dist-user", `ghost_${i}`, 42, p);
      assert.strictEqual(
        draw.assignmentProbability,
        draw.arm === "task_package" ? 0.9 : 0.1,
      );
    }
  });

  it("distribution sanity on fixed fixtures: p=0.9 holds roughly 10% of 400 episodes", () => {
    let held = 0;
    for (let i = 0; i < 400; i += 1) {
      if (drawOfferArm("dist-user", `ghost_${i}`, 42, 0.9).arm === "hold_noop") held += 1;
    }
    // Fixed inputs → this is a constant, not a flaky sample; the bounds just
    // document that the hash spreads mass sensibly around 40/400.
    assert.ok(held >= 20 && held <= 60, `expected ~40/400 held, got ${held}`);
  });

  it("null armedAtTs keys the draw exactly like assignmentId does (legacy episode)", () => {
    const a = drawOfferArm("u", "g", null, 0.5);
    const b = drawOfferArm("u", "g", null, 0.5);
    assert.strictEqual(a.draw, b.draw);
    assert.notStrictEqual(a.draw, drawOfferArm("u", "g", 0, 0.5).draw);
  });
});

describe("mrtTreatmentP (env DAOBREW_MRT_TREATMENT_P)", () => {
  it("defaults to 0.9 when unset, blank, or junk", () => {
    assert.strictEqual(DEFAULT_MRT_TREATMENT_P, 0.9);
    assert.strictEqual(mrtTreatmentP(undefined), 0.9);
    assert.strictEqual(mrtTreatmentP("   "), 0.9);
    assert.strictEqual(mrtTreatmentP("not-a-number"), 0.9);
  });

  it("parses and clamps to [0,1]", () => {
    assert.strictEqual(mrtTreatmentP("0.5"), 0.5);
    assert.strictEqual(mrtTreatmentP("0"), 0);
    assert.strictEqual(mrtTreatmentP("1"), 1);
    assert.strictEqual(mrtTreatmentP("1.7"), 1);
    assert.strictEqual(mrtTreatmentP("-3"), 0);
  });

  it("reads process.env.DAOBREW_MRT_TREATMENT_P by default", () => {
    const saved = process.env.DAOBREW_MRT_TREATMENT_P;
    try {
      process.env.DAOBREW_MRT_TREATMENT_P = "0.25";
      assert.strictEqual(mrtTreatmentP(), 0.25);
      delete process.env.DAOBREW_MRT_TREATMENT_P;
      assert.strictEqual(mrtTreatmentP(), 0.9);
    } finally {
      if (saved === undefined) delete process.env.DAOBREW_MRT_TREATMENT_P;
      else process.env.DAOBREW_MRT_TREATMENT_P = saved;
    }
  });
});

describe("prepareArmedOffer (atomic graph-generation decision)", () => {
  it("derives offer_state and assignment SQL from one exact episode draw", () => {
    const prepared = prepareArmedOffer({
      userId: EPISODE.userId,
      ghostId: EPISODE.ghostId,
      ghostProps: {
        status: "armed",
        armed_at_ts: EPISODE.armedAtTs,
        selected_pattern: "overdrive",
        root_cause_class: "productivity",
      },
      createdAtTs: EPISODE.armedAtTs - 100,
      treatmentP: 0,
    });
    assert.strictEqual(prepared.offerState, "held");
    assert.strictEqual(prepared.ghostProps.offer_state, "held");
    assert.strictEqual(prepared.assignment.assignedAction, "hold_noop");
    assert.strictEqual(prepared.assignment.assignmentProbability, 1);

    const sql = interventionAssignmentSql({
      ...EPISODE,
      ghostProps: prepared.ghostProps,
      nowTs: EPISODE.armedAtTs + 1,
      assignment: prepared.assignment,
    });
    assert.ok(sql.includes(assignmentId(EPISODE)));
    assert.match(sql, /'hold_noop', 1, 'randomized_offer_v1'/);
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  });
});

describe("randomized assignment logging (route_policy=randomized_offer_v1)", () => {
  const ghostProps = { status: "armed", selected_pattern: "overdrive", root_cause_class: "productivity" };

  function fakeExec(log: string[]): (sql: string) => Promise<void> {
    return async (sql: string) => { log.push(sql); };
  }

  it("logs a held (control) assignment carrying both eligible arms and the assigned arm's probability", async () => {
    const log: string[] = [];
    const result = await logInterventionAssignment({
      ...EPISODE,
      ghostProps,
      storeKind: "postgres",
      exec: fakeExec(log),
      nowTs: 1_751_000_000,
      assignment: {
        assignedAction: "hold_noop",
        assignmentProbability: 0.1,
        routePolicy: RANDOMIZED_ROUTE_POLICY,
        eligibleActions: OFFER_ELIGIBLE_ACTIONS,
      },
    });
    assert.strictEqual(result.logged, true);
    assert.strictEqual(log.length, 1);
    const sql = log[0];
    assert.ok(sql.includes(assignmentId(EPISODE)), "same deterministic episode id as detonate");
    assert.match(sql, /'\["task_package","hold_noop"\]'::jsonb/);
    assert.match(sql, /'hold_noop', 0\.1, 'randomized_offer_v1'/);
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  });

  it("logs a treatment assignment with probability p under the randomized policy", async () => {
    const log: string[] = [];
    await logInterventionAssignment({
      ...EPISODE,
      ghostProps,
      storeKind: "postgres",
      exec: fakeExec(log),
      nowTs: 1_751_000_000,
      assignment: {
        assignedAction: "task_package",
        assignmentProbability: 0.9,
        routePolicy: RANDOMIZED_ROUTE_POLICY,
        eligibleActions: OFFER_ELIGIBLE_ACTIONS,
      },
    });
    assert.match(log[0], /'task_package', 0\.9, 'randomized_offer_v1'/);
  });

  it("without an assignment override the deterministic detonate contract is byte-identical", async () => {
    const log: string[] = [];
    await logInterventionAssignment({
      ...EPISODE, ghostProps, storeKind: "postgres", exec: fakeExec(log), nowTs: 1_751_000_000,
    });
    assert.match(log[0], /'\["task_package"\]'::jsonb/);
    assert.match(log[0], /'task_package', 1, 'deterministic_argmax_v1'/);
  });
});

// ── Arming-time randomization: assignArmedOffer draws the arm the moment the
// engine reports root_armed, logs the assignment, and stamps offer_state onto
// the armed root's props. Everything below runs on injected exec/query fakes.

describe("assignArmedOffer (arming-time randomization)", () => {
  const USER = MRT_TEST_USER;
  const GHOST = "ghost_armed_root";
  const ARMED_AT = 1_750_000_100;

  const armedRow = (props: Record<string, any> = {}) => ({
    id: GHOST,
    user_id: USER,
    created_at_ts: 1_750_000_000,
    props_json: {
      status: "armed",
      armed_at_ts: ARMED_AT,
      selected_pattern: "overdrive",
      root_cause_class: "productivity",
      week_start: "2026-06-29",
      ...props,
    },
  });

  function harness(rows: Record<string, any>[]) {
    const execs: string[] = [];
    const queries: string[] = [];
    return {
      execs,
      queries,
      exec: async (sql: string) => { execs.push(sql); },
      query: async (sql: string) => { queries.push(sql); return rows; },
    };
  }

  it("p=1 assigns treatment: logs task_package and stamps offer_state='offered'", async () => {
    const h = harness([armedRow()]);
    const result = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: h.exec, query: h.query, nowTs: 1_750_000_200, treatmentP: 1,
    });
    assert.strictEqual(result.assigned, true);
    assert.strictEqual(result.offerState, "offered");
    assert.strictEqual(result.armedAtTs, ARMED_AT);
    assert.strictEqual(h.execs.length, 2, "assignment INSERT then offer_state UPDATE");
    const insert = h.execs[0];
    assert.match(insert, /INSERT INTO intervention_assignments/);
    assert.ok(insert.includes(assignmentId({ userId: USER, ghostId: GHOST, armedAtTs: ARMED_AT })),
      "episode id must match what detonate/detonate_done derive");
    assert.match(insert, /'\["task_package","hold_noop"\]'::jsonb/);
    assert.match(insert, /'task_package', 1, 'randomized_offer_v1'/);
    assert.match(insert, /ON CONFLICT \(id\) DO NOTHING/);
    const update = h.execs[1];
    assert.match(update, /UPDATE graph_nodes/);
    assert.match(update, /'offer_state'/);
    assert.match(update, /'offered'/);
    assert.ok(update.includes(`'${GHOST}'`));
    assert.ok(update.includes(`'${USER}'`));
  });

  it("the armed-root read filters user_id by the scope row, never by a literal (F1 One-Time-Filter regression)", async () => {
    // Under scopedQuery, a `user_id = '<literal>'` in the body lets the
    // planner fold the RLS qual into a One-Time Filter evaluated at executor
    // startup — before the lateral scope row has run set_config — so a fresh
    // pooled backend silently returns zero rows (live bug F1), and the
    // randomization would silently skip every arming. The exec-path INSERT/
    // UPDATE keep their literals: scopedExec sets the GUC in-transaction.
    const h = harness([armedRow()]);
    await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: h.exec, query: h.query, nowTs: 1_750_000_200, treatmentP: 1,
    });
    assert.strictEqual(h.queries.length, 1);
    assert.ok(
      h.queries[0].includes("user_id = __daobrew_scope.uid"),
      `armed-root read must filter user_id via the scope row, got: ${h.queries[0]}`,
    );
    assert.ok(
      !h.queries[0].includes(`user_id = '${USER}'`),
      `armed-root read must NOT compare user_id to a literal, got: ${h.queries[0]}`,
    );
  });

  it("p=0 assigns control: logs hold_noop and stamps offer_state='held'", async () => {
    const h = harness([armedRow()]);
    const result = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: h.exec, query: h.query, nowTs: 1_750_000_200, treatmentP: 0,
    });
    assert.strictEqual(result.offerState, "held");
    assert.match(h.execs[0], /'hold_noop', 1, 'randomized_offer_v1'/);
    assert.match(h.execs[1], /'held'/);
    assert.strictEqual(result.ghostProps?.offer_state, "held");
  });

  it("re-runs are idempotent: same episode re-draws the same arm with identical SQL", async () => {
    const deps = (h: ReturnType<typeof harness>) => ({
      userId: USER, ghostId: GHOST, storeKind: "postgres" as const,
      exec: h.exec, query: h.query, nowTs: 1_750_000_200, treatmentP: 0.9,
    });
    const first = harness([armedRow()]);
    const second = harness([armedRow({ offer_state: "offered" })]);
    const a = await assignArmedOffer(deps(first));
    const b = await assignArmedOffer(deps(second));
    assert.strictEqual(a.offerState, b.offerState);
    assert.deepStrictEqual(first.execs, second.execs);
  });

  it("skips on non-postgres stores exactly like assignment logging does", async () => {
    const h = harness([armedRow()]);
    const result = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "sqlite",
      exec: h.exec, query: h.query, nowTs: 1_750_000_200, treatmentP: 1,
    });
    assert.strictEqual(result.assigned, false);
    assert.strictEqual(h.execs.length, 0);
    assert.strictEqual(h.queries.length, 0);
  });

  it("skips when the root is missing or no longer armed", async () => {
    const missing = harness([]);
    const gone = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: missing.exec, query: missing.query, nowTs: 1, treatmentP: 1,
    });
    assert.strictEqual(gone.assigned, false);
    assert.strictEqual(missing.execs.length, 0);

    const done = harness([armedRow({ status: "done" })]);
    const closed = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: done.exec, query: done.query, nowTs: 1, treatmentP: 1,
    });
    assert.strictEqual(closed.assigned, false);
    assert.strictEqual(done.execs.length, 0);
  });

  it("is fail-soft: a throwing transport resolves with a warning, never rejects", async () => {
    const boomQuery = async () => { throw new Error("pg down"); };
    const result = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: async () => {}, query: boomQuery, nowTs: 1, treatmentP: 1,
    });
    assert.strictEqual(result.assigned, false);
    assert.match(result.warning ?? "", /pg down/);

    const boomExec = async () => { throw new Error("exec down"); };
    const h = harness([armedRow()]);
    const partial = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: boomExec, query: h.query, nowTs: 1, treatmentP: 1,
    });
    assert.strictEqual(partial.assigned, false);
    assert.match(partial.warning ?? "", /exec down/);
  });

  it("legacy stampless episode keys on created_at_ts, matching the detonate-side key", async () => {
    const row = armedRow();
    delete (row.props_json as any).armed_at_ts;
    const h = harness([row]);
    const result = await assignArmedOffer({
      userId: USER, ghostId: GHOST, storeKind: "postgres",
      exec: h.exec, query: h.query, nowTs: 5, treatmentP: 1,
    });
    assert.strictEqual(result.armedAtTs, 1_750_000_000);
    assert.ok(h.execs[0].includes(assignmentId({ userId: USER, ghostId: GHOST, armedAtTs: 1_750_000_000 })));
  });
});

// ── Tool-layer CTA suppression: daobrew_status surfaces the armed root's
// action package, but a held (control) episode gets watching-style info with
// NO detonation call-to-action. daobrew_detonate itself stays user-initiated
// and is ALWAYS honored, held or not. Faked-transport idiom from
// detonate.test.ts — no real DB is ever touched.

interface CapturedSql {
  queries: string[];
  execs: string[];
}

async function withFakedGraphTransport(
  rows: Record<string, any>[],
  fn: (captured: CapturedSql) => Promise<void>,
): Promise<void> {
  const mod = graphDb as any;
  const realExec = mod.execSql;
  const realQuery = mod.queryJson;
  const realExists = mod.graphDbExists;
  const savedStore = process.env.DAOBREW_GRAPH_STORE;
  const savedUserId = process.env.DAOBREW_USER_ID;
  const captured: CapturedSql = { queries: [], execs: [] };
  mod.queryJson = async (sql: string) => {
    captured.queries.push(sql);
    return rows;
  };
  mod.execSql = async (sql: string) => {
    captured.execs.push(sql);
  };
  mod.graphDbExists = () => true;
  try {
    process.env.DAOBREW_GRAPH_STORE = "postgres";
    process.env.DAOBREW_USER_ID = MRT_TEST_USER;
    __resetGraphDbConfigCacheForTests();
    await fn(captured);
  } finally {
    mod.execSql = realExec;
    mod.queryJson = realQuery;
    mod.graphDbExists = realExists;
    if (savedStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = savedStore;
    if (savedUserId === undefined) delete process.env.DAOBREW_USER_ID;
    else process.env.DAOBREW_USER_ID = savedUserId;
    __resetGraphDbConfigCacheForTests();
  }
}

const HELD_GHOST_ROW = {
  id: "ghost_held_cta",
  user_id: MRT_TEST_USER,
  created_at_ts: 1_750_000_000,
  title: "Late-night deploy crunch",
  props_json: {
    status: "armed",
    armed_at_ts: 1_750_000_100,
    offer_state: "held",
    selected_pattern: "overdrive",
    root_cause_class: "productivity",
    brief: { cause: "the thread", evidence: ["evidence line"], artifact_spec: "write the thing" },
  },
};

const OFFERED_GHOST_ROW = {
  ...HELD_GHOST_ROW,
  id: "ghost_offered_cta",
  props_json: { ...HELD_GHOST_ROW.props_json, offer_state: "offered" },
};

describe("daobrew_status CTA suppression (MRT control arm)", () => {
  it("surfaces a ready action package with a detonate CTA for an offered root", async () => {
    await withFakedGraphTransport([OFFERED_GHOST_ROW], async () => {
      const result = await handleToolCall("daobrew_status", {}, true);
      const pkg = result.sentinel_action_package;
      assert.ok(pkg, "status must surface the armed root");
      assert.strictEqual(pkg.state, "ready");
      assert.strictEqual(pkg.cause_id, "ghost_offered_cta");
      assert.match(pkg.cta ?? "", /daobrew_detonate/);
    });
  });

  it("legacy armed roots without offer_state keep the CTA (pre-MRT episodes)", async () => {
    const legacy = { ...OFFERED_GHOST_ROW, id: "ghost_legacy_cta", props_json: { ...OFFERED_GHOST_ROW.props_json } };
    delete (legacy.props_json as any).offer_state;
    await withFakedGraphTransport([legacy], async () => {
      const result = await handleToolCall("daobrew_status", {}, true);
      assert.strictEqual(result.sentinel_action_package?.state, "ready");
    });
  });

  it("suppresses the proactive CTA for a held root: watching info only, no detonate mention", async () => {
    await withFakedGraphTransport([HELD_GHOST_ROW], async () => {
      const result = await handleToolCall("daobrew_status", {}, true);
      const pkg = result.sentinel_action_package;
      assert.ok(pkg, "held roots still show pattern/watching info");
      assert.strictEqual(pkg.state, "watching");
      assert.strictEqual(pkg.pattern, "overdrive");
      assert.strictEqual(pkg.title, "Late-night deploy crunch");
      const serialized = JSON.stringify(pkg);
      assert.ok(!serialized.includes("daobrew_detonate"), "no detonation CTA for a held episode");
      assert.ok(!serialized.includes("cause_id"), "held episodes expose no cause_id to act on");
      assert.ok(!serialized.includes("ghost_held_cta"), "held episodes expose no node id to act on");
    });
  });

  it("reports null when no root is armed, and stays fail-soft on a broken graph read", async () => {
    await withFakedGraphTransport([], async () => {
      const result = await handleToolCall("daobrew_status", {}, true);
      assert.strictEqual(result.sentinel_action_package, null);
    });

    const mod = graphDb as any;
    const realQuery = mod.queryJson;
    const realExists = mod.graphDbExists;
    mod.queryJson = async () => { throw new Error("graph down"); };
    mod.graphDbExists = () => true;
    try {
      const result = await handleToolCall("daobrew_status", {}, true);
      assert.strictEqual(result.sentinel_action_package, null, "a graph error must not break status");
      assert.ok(result.mode, "the rest of the status payload still renders");
    } finally {
      mod.queryJson = realQuery;
      mod.graphDbExists = realExists;
    }
  });
});

describe("daobrew_detonate on a held episode (intent-to-treat override)", () => {
  it("is ALWAYS honored: serves the brief and re-issues the idempotent assignment INSERT", async () => {
    await withFakedGraphTransport([HELD_GHOST_ROW], async (captured) => {
      // isMock=true skips the entitlement gate; graphDbExists() is faked true,
      // so the handler runs the real graph path (detonate.test.ts idiom).
      const result = await handleToolCall("daobrew_detonate", {}, true);
      assert.ok(result.__mcp_content__, "the brief must be served despite offer_state='held'");
      assert.match(result.content[0].text as string, /cause_id: ghost_held_cta/);

      // The detonate-time INSERT keys on the SAME episode id the arming-time
      // draw logged, and is ON CONFLICT DO NOTHING — so the hold_noop control
      // assignment survives and detonate_done's artifact_done marks the
      // override (analysis: control-with-override, intent-to-treat).
      assert.strictEqual(captured.execs.length, 1);
      const insert = captured.execs[0];
      assert.match(insert, /INSERT INTO intervention_assignments/);
      assert.match(insert, /ON CONFLICT \(id\) DO NOTHING/);
      const episodeId = assignmentId({ userId: MRT_TEST_USER, ghostId: "ghost_held_cta", armedAtTs: 1_750_000_100 });
      assert.ok(insert.includes(episodeId), "same deterministic episode id as the arming-time hold_noop row");
    });
  });

  it("detonate_done on the held episode closes the SAME assignment row (artifact_done marks the override)", async () => {
    await withFakedGraphTransport([HELD_GHOST_ROW], async (captured) => {
      const done = await handleToolCall(
        "daobrew_detonate_done",
        { cause_id: "ghost_held_cta", artifact_ref: "/tmp/held-override.md", user_acceptance: "accepted" },
        true,
      );
      assert.match(done.content[0].text as string, /Sentinel action package completed/);
      const close = captured.execs.find((sql) => /UPDATE intervention_assignments/.test(sql));
      assert.ok(close, "outcome close must run for held episodes");
      assert.match(close, /artifact_done = TRUE/);
      const episodeId = assignmentId({ userId: MRT_TEST_USER, ghostId: "ghost_held_cta", armedAtTs: 1_750_000_100 });
      assert.ok(close.includes(episodeId), "close targets the arming-time control assignment");
    });
  });
});
