#!/usr/bin/env node
// Seed realistic local warm-tier source rows for engine hardening.
//
// This intentionally requires DAOBREW_GRAPH_DB so verification runs use a temp
// DB instead of the shared Sentinel graph. Run `npm run build` first.
//
// Usage:
//   DAOBREW_GRAPH_DB=/tmp/daobrew-source-fixture.db node scripts/seed-local-source-fixture.mjs --user-id 14802294-BEED-480E-ABF6-7E3703FA25CD

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureSchema } from "../dist/src/engine/schema.js";
import { execSqlSync, graphStoreKind } from "../dist/src/graph-db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dbPath = process.env.DAOBREW_GRAPH_DB;
const userId = resolveUserId(process.argv.slice(2));
const storeKind = graphStoreKind();

function resolveUserId(argv) {
  let userId = process.env.DAOBREW_FIXTURE_USER_ID || "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/seed-local-source-fixture.mjs --user-id USER_ID");
      process.exit(0);
    }
    if (arg === "--user-id") {
      userId = argv[++i] || "";
    } else if (arg.startsWith("--user-id=")) {
      userId = arg.slice("--user-id=".length);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  const trimmed = String(userId).trim();
  if (!UUID_RE.test(trimmed)) {
    console.error("--user-id is required and must be a canonical UUID; labels, api keys, whitespace, and 'local' are not identities.");
    process.exit(1);
  }
  return trimmed.toUpperCase();
}

if (storeKind === "sqlite" && !dbPath) {
  console.error("Set DAOBREW_GRAPH_DB to a temp SQLite path before seeding local source fixture rows.");
  process.exit(1);
}

if (storeKind === "sqlite") mkdirSync(dirname(dbPath), { recursive: true });
ensureSchema(dbPath);

const now = Math.floor(Date.now() / 1000);
// Optional additive shift for every fixture event/meeting/insight timestamp,
// so tests can land the same relative timeline on a specific calendar day
// (e.g. an anomaly day in a fake-backend raw-sample window). Default 0
// preserves the original epoch-anchored fixture exactly.
const tsBase = Number(process.env.DAOBREW_FIXTURE_TS_BASE || 0);
if (!Number.isFinite(tsBase)) {
  console.error("DAOBREW_FIXTURE_TS_BASE must be a finite number of epoch seconds.");
  process.exit(1);
}
const t = (seconds) => seconds + tsBase;
const j = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'`;
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const userSuffix = `-${userId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
const fixtureId = (base) => `${base}${userSuffix}`;
const eventDeliveryId = fixtureId("fixture-event-delivery-review");
const eventReviewId = fixtureId("fixture-event-product-review");
const meetingDeliveryId = fixtureId("fixture-meeting-delivery-review");
const meetingReviewId = fixtureId("fixture-meeting-product-review");
const insightHandoffId = fixtureId("fixture-insight-delivery-handoff");
const insightSourceId = fixtureId("fixture-insight-source-truth");

const sql = `
DELETE FROM events WHERE id IN (${q(eventDeliveryId)}, ${q(eventReviewId)});
DELETE FROM meeting_notes WHERE id IN (${q(meetingDeliveryId)}, ${q(meetingReviewId)});
DELETE FROM user_insights WHERE id IN (${q(insightHandoffId)}, ${q(insightSourceId)});

INSERT INTO events (
  id, user_id, source, source_ref, title, start_ts, end_ts,
  all_day, attendee_count, attendees_json, calendar_name, location,
  metadata_json, created_at_ts
) VALUES
  (
    ${q(eventDeliveryId)}, ${q(userId)}, 'eventkit', 'evt-delivery-review',
    'Delivery readiness review', ${t(1000)}, ${t(2800)},
    0, 3, ${j(["Participant One", "Participant Two", "Advisor"])}, 'DaoBrew', 'Zoom',
    ${j({ fixture: "p1-hardening", pressure: "delivery-readiness" })}, ${now}
  ),
  (
    ${q(eventReviewId)}, ${q(userId)}, 'eventkit', 'evt-product-review',
    'Product review follow-up', ${t(7600)}, ${t(9400)},
    0, 2, ${j(["Participant One", "Participant Two"])}, 'DaoBrew', 'Office',
    ${j({ fixture: "p1-hardening", pressure: "follow-through" })}, ${now}
  );

INSERT INTO meeting_notes (
  id, user_id, source, source_ref, event_id, kind, title,
  occurred_at_ts, duration_sec, participants_json, summary, body, transcript_spans_json,
  topics_json, created_at_ts
) VALUES
  (
    ${q(meetingDeliveryId)}, ${q(userId)}, 'granola', 'granola-delivery-review',
    ${q(eventDeliveryId)}, 'meeting', 'Delivery readiness review',
    ${t(1040)}, 1800, ${j(["Participant One", "Participant Two", "Advisor"])},
    'The delivery proof still needs a source-backed handoff and verification arc.',
    'The group agreed the release should use the real agent handoff path, not an uncited artifact. We still need to close the delivery proof and verification loop end to end.',
    ${j([{ idx: 0, speaker: "Participant One", ts_offset_sec: 300, text: "We still need to close the delivery proof and verification loop end to end." }])},
    ${j(["#delivery", "#verification", "#handoff"])}, ${now}
  ),
  (
    ${q(meetingReviewId)}, ${q(userId)}, 'granola', 'granola-product-review',
    ${q(eventReviewId)}, 'call', 'Product review follow-up',
    ${t(7700)}, 1500, ${j(["Participant One", "Participant Two"])},
    'Review raised follow-through risk around turning observed stress chains into shipped artifacts.',
    'The next visible proof should be one source-backed root cause closed end to end. We still need to close the source-backed root cause proof end to end.',
    ${j([{ idx: 0, speaker: "Participant Two", ts_offset_sec: 420, text: "We still need to close the source-backed root cause proof end to end." }])},
    ${j(["#product", "#follow-through"])}, ${now}
  );

INSERT INTO user_insights (
  id, user_id, source, source_ref, insight_text, topics_json,
  importance, strength, occurred_at_ts, last_accessed_ts, created_at_ts
) VALUES
  (
    ${q(insightHandoffId)}, ${q(userId)}, 'claude_sessions', 'p1-hardening.md:42',
    'For delivery review, show the source context, handoff, and verification path; an uncited artifact alone is not convincing enough.',
    ${j(["#delivery", "#verification", "#handoff"])}, 0.94, 0.88, ${t(980)}, NULL, ${now}
  ),
  (
    ${q(insightSourceId)}, ${q(userId)}, 'claude_sessions', 'p1-hardening.md:87',
    'Use warm-tier source rows as attribution evidence, while keeping biometrics in backend health_samples rather than duplicating them locally.',
    ${j(["#data-manager", "#source-truth"])}, 0.86, 0.82, ${t(7500)}, NULL, ${now}
  );

SELECT
  'source_rows: events=' || (SELECT count(*) FROM events WHERE user_id=${q(userId)})
  || ', meeting_notes=' || (SELECT count(*) FROM meeting_notes WHERE user_id=${q(userId)})
  || ', user_insights=' || (SELECT count(*) FROM user_insights WHERE user_id=${q(userId)});
`;

const out = storeKind === "postgres"
  ? execSqlSync(sql)
  : execFileSync("sqlite3", ["-cmd", ".timeout 2000", dbPath, sql], { encoding: "utf-8" });
console.log(`Seeded local source fixture -> ${storeKind === "postgres" ? "local Postgres" : dbPath}`);
console.log(out.trim());
