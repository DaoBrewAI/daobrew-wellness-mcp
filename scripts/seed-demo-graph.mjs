#!/usr/bin/env node
// Seed the Sentinel causal-chain graph with the AI2 demo chain.
//
// Creates ~/Library/Application Support/DaoBrew/sentinel-graph.db (override
// with DAOBREW_GRAPH_DB) using the macOS-bundled `sqlite3` CLI, with the same
// DDL the Sentinel macOS app uses. Safe to re-run: nodes/edges are upserted
// and the ghost root cause is re-armed, so every video take starts clean.
//
// Usage: node scripts/seed-demo-graph.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
// Single source of truth for the on-camera context + prompt — imported from the
// built mock so the seed and the live brief can never drift. Run `npm run build`
// before seeding (the README sequence already does).
import { AI2_DEMO_CONTEXT, AI2_DEMO_ARTIFACT_SPEC } from "../dist/src/mock.js";
import { ensureSchema } from "../dist/src/engine/schema.js";

const DEMO_USER_ID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed !== value || !UUID_RE.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

const dbPath =
  process.env.DAOBREW_GRAPH_DB ||
  join(homedir(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db");
const rawUserId = process.env.DAOBREW_USER_ID;
const userId = rawUserId === undefined ? DEMO_USER_ID : canonicalUserId(rawUserId);
if (!userId) {
  throw new Error("DAOBREW_USER_ID must be a canonical UUID when provided");
}

mkdirSync(dirname(dbPath), { recursive: true });
ensureSchema(dbPath);

const now = Math.floor(Date.now() / 1000);
const day = 86400;
const j = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'`;
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

const brief = {
  cause: "AI2 demo story 三周未完成 — 反复出现在 investor 类会议,且每次会前 OVERDRIVE spike",
  evidence: [
    "Calendar: \"AI2 Incubator Meeting\" — 3rd occurrence in 3 weeks",
    "Granola · May 28: \"demo story 还没定稿,Linhan 问 demo narrative\"",
    "Granola · Jun 4: \"还是没有一条能讲的 demo 主线\"",
    "Granola · Jun 10: \"demo story 仍未定稿 — 下周必须有初稿\"",
    "Biometrics: pre-meeting HR 91 / 88 / 93 bpm (baseline 62), HRV −40%",
    "DaoBrew memory: user mentioned \"AI2 demo 没准备好\" in 2 sessions",
  ],
  context: AI2_DEMO_CONTEXT,
  artifact_spec: AI2_DEMO_ARTIFACT_SPEC,
  suggested_block: { title: "DaoBrew · AI2 demo story prep", start_offset_min: 60, duration_min: 45 },
};

const sql = `
PRAGMA busy_timeout=2000;

INSERT OR IGNORE INTO graph_nodes(id,user_id,kind,title,subtitle,element,occurred_at_ts,source,source_ref,props_json,created_at_ts) VALUES
  ('pat_overdrive',${q(userId)},'pattern','OVERDRIVE','Fire pattern — sustained sympathetic push','fire',NULL,'wuxing_engine','OVERDRIVE','{}',${now}),
  ('mtg_ai2_1',${q(userId)},'meeting','AI2 Incubator Meeting','May 28',NULL,${now - 14 * day},'granola','granola-ai2-1',${j({ snippet: "demo story 还没定稿,Linhan 问 demo narrative" })},${now}),
  ('mtg_ai2_2',${q(userId)},'meeting','AI2 Incubator Meeting','Jun 4',NULL,${now - 7 * day},'granola','granola-ai2-2',${j({ snippet: "还是没有一条能讲的 demo 主线" })},${now}),
  ('mtg_ai2_3',${q(userId)},'meeting','AI2 Incubator Meeting','Jun 10',NULL,${now - 1 * day},'granola','granola-ai2-3',${j({ snippet: "demo story 仍未定稿 — 下周必须有初稿" })},${now}),
  ('ep_1',${q(userId)},'episode','OVERDRIVE spike','pre-meeting HR 91 (baseline 62)','fire',${now - 14 * day},'sentinel','ep-2026-05-28',${j({ hr: 91, baseline: 62, hrv_delta_pct: -40 })},${now}),
  ('ep_2',${q(userId)},'episode','OVERDRIVE spike','pre-meeting HR 88 (baseline 62)','fire',${now - 7 * day},'sentinel','ep-2026-06-04',${j({ hr: 88, baseline: 62, hrv_delta_pct: -38 })},${now}),
  ('ep_3',${q(userId)},'episode','OVERDRIVE spike','pre-meeting HR 93 (baseline 62)','fire',${now - 1 * day},'sentinel','ep-2026-06-10',${j({ hr: 93, baseline: 62, hrv_delta_pct: -42 })},${now}),
  ('mem_1',${q(userId)},'memory_hit','\"AI2 demo 没准备好\"','DaoBrew session memory ×2',NULL,${now - 5 * day},'claude_sessions','mem-ai2-demo','{}',${now}),
  ('theme_ai2',${q(userId)},'theme','AI2 demo story 三周未完成','root-cause theme',NULL,NULL,'sentinel','theme-ai2-demo','{}',${now});

-- The ghost is REPLACEd (not ignored) so re-seeding re-arms it for a fresh take.
INSERT OR REPLACE INTO graph_nodes(id,user_id,kind,title,subtitle,element,occurred_at_ts,source,source_ref,props_json,created_at_ts) VALUES
  ('ghost_ai2_demo_story',${q(userId)},'ghost','AI2 demo story','Demo story — not yet created',NULL,NULL,'sentinel','ghost-ai2-demo-story',${j({ status: "armed", brief })},${now});

INSERT OR IGNORE INTO graph_edges(id,user_id,src_id,dst_id,kind,label,created_at_ts) VALUES
  ('e_mtg1_ep1',${q(userId)},'mtg_ai2_1','ep_1','triggered',NULL,${now}),
  ('e_mtg2_ep2',${q(userId)},'mtg_ai2_2','ep_2','triggered',NULL,${now}),
  ('e_mtg3_ep3',${q(userId)},'mtg_ai2_3','ep_3','triggered',NULL,${now}),
  ('e_ep1_pat',${q(userId)},'ep_1','pat_overdrive','manifested',NULL,${now}),
  ('e_ep2_pat',${q(userId)},'ep_2','pat_overdrive','manifested',NULL,${now}),
  ('e_ep3_pat',${q(userId)},'ep_3','pat_overdrive','manifested',NULL,${now}),
  ('e_mtg1_theme',${q(userId)},'mtg_ai2_1','theme_ai2','tagged',NULL,${now}),
  ('e_mtg2_theme',${q(userId)},'mtg_ai2_2','theme_ai2','tagged',NULL,${now}),
  ('e_mtg3_theme',${q(userId)},'mtg_ai2_3','theme_ai2','tagged',NULL,${now}),
  ('e_mem_theme',${q(userId)},'mem_1','theme_ai2','tagged',NULL,${now}),
  ('e_theme_ghost',${q(userId)},'theme_ai2','ghost_ai2_demo_story','suggests',NULL,${now});

-- Re-arming means any prior completion edge from a previous take must go too.
DELETE FROM graph_edges WHERE dst_id='ghost_ai2_demo_story' AND kind='caused';

SELECT 'nodes: ' || count(*) FROM graph_nodes;
`;

const out = execFileSync("sqlite3", [dbPath, sql], { encoding: "utf-8" });
console.log(`Seeded demo causal chain → ${dbPath}`);
console.log(out.trim());
console.log("Ghost 'AI2 demo story' is ARMED. Run /detonator in your agent.");
