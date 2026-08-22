import { ensureSchema, GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS } from "./schema.js";
import { execSql, graphStoreKind, q, queryJson } from "../graph-db.js";
import { scopedUserIdExpr } from "./user-scope.js";
import { requireUserId } from "./require-user-id.js";
import {
  interventionAssignmentSql,
  PreparedArmedOffer,
  prepareArmedOffer,
} from "./assignments.js";
import {
  DetonateBrief,
  GraphDelta,
  GraphEdgeDelta,
  GraphNodeDelta,
} from "./reasoner/types.js";

type Exec = (sql: string) => Promise<void>;
type Query = (sql: string) => Promise<Record<string, any>[]>;

export interface UpsertGraphDeltaOptions {
  userId?: string;
  nowTs?: number;
  allowRearmDone?: boolean;
  /** Server-generated production generation. Valid only as an exact pair
   *  with leaseToken on Postgres; local/CLI callers never supply either. */
  generationId?: string;
  /** Exact backend execution lease authorizing one atomic graph commit. */
  leaseToken?: string;
  /** Arm-time MRT decision to embed in the graph transaction. Production
   *  callers enable this on Postgres; direct/local upserts remain unchanged. */
  armedOffer?: {
    treatmentP?: number;
  };
  /** RLS seam (deferred wiring 1/3): injected executors for the transactional
   *  batch and the internal graph_nodes reads. Defaults to the module-level
   *  execSql/queryJson — behavior is byte-identical when absent. */
  exec?: Exec;
  query?: Query;
}

export interface UpsertGraphDeltaResult {
  status: "written" | "skipped_done";
  user_id: string;
  nodes_upserted: number;
  edges_attempted: number;
  armed_node_id: string;
  root_armed: boolean;
  /** Present only when offer_state and its normal assignment INSERT were
   *  included before the generation receipt in this exact graph transaction. */
  armed_offer?: PreparedArmedOffer;
}

export class GraphDeltaValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Invalid GraphDelta: ${issues.join("; ")}`);
    this.name = "GraphDeltaValidationError";
    this.issues = issues;
  }
}

const NODE_KINDS = new Set<string>(GRAPH_NODE_KINDS);
const EDGE_KINDS = new Set<string>(GRAPH_EDGE_KINDS);
// Must stay identical to daobrew_backend.database.operations.  Both runtimes
// serialize reserve/renew/finalize and graph commit on this DB-owned gate.
const CAUSAL_EXECUTION_ADVISORY_LOCK_KEY = 1_144_153_669;
// Must match migration 0010 and postgres-schema.ts.  This second advisory
// lock serializes the generation publisher with graph-row invalidation even
// when the user has no marker row yet (so row-locking a marker is impossible).
const CAUSAL_GRAPH_GENERATION_LOCK_NAMESPACE = 1_144_153_670;

interface GenerationLeaseSql {
  guard: string;
  commit: string;
}

/**
 * Build the two halves of the production graph commit protocol.
 *
 * scopedExec supplies the surrounding transaction.  The guard takes the
 * same transaction-level advisory lock as the Python execution gate and
 * row-locks the exact still-live lease before any graph DML.  The final block
 * re-checks expiry at commit time, stamps the lease receipt, and advances the
 * graph generation.  Any failure aborts the outer transaction, rolling back
 * every graph statement and the marker together.
 */
export function generationLeaseSql(
  userId: string,
  generationId: string,
  leaseToken: string,
): GenerationLeaseSql {
  const user = q(userId);
  const generation = q(generationId);
  const lease = q(leaseToken);
  return {
    guard: `
DO $daobrew_generation_guard$
BEGIN
  PERFORM pg_advisory_xact_lock(${CAUSAL_EXECUTION_ADVISORY_LOCK_KEY});
  PERFORM pg_advisory_xact_lock(
    ${CAUSAL_GRAPH_GENERATION_LOCK_NAMESPACE}, hashtext(${user})
  );
  PERFORM 1
    FROM causal_execution_leases
   WHERE user_id = ${user}
     AND lease_token = ${lease}
     AND committed_generation_id IS NULL
     AND lease_expires_at_ts >
         floor(extract(epoch from clock_timestamp()))::bigint
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'causal execution lease is not live'
      USING ERRCODE = '55000';
  END IF;
END
$daobrew_generation_guard$;`,
    commit: `
DO $daobrew_generation_commit$
DECLARE
  commit_ts BIGINT := floor(extract(epoch from clock_timestamp()))::bigint;
BEGIN
  UPDATE causal_execution_leases
     SET committed_generation_id = ${generation},
         committed_at_ts = commit_ts
   WHERE user_id = ${user}
     AND lease_token = ${lease}
     AND committed_generation_id IS NULL
     AND lease_expires_at_ts > commit_ts;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'causal execution lease expired before commit'
      USING ERRCODE = '55000';
  END IF;

  -- Keep history because an un-finalized execution lease may still reference
  -- an older generation.  The partial unique index permits exactly one current
  -- marker, and this is deliberately the final write in the graph transaction.
  UPDATE causal_graph_generations
     SET is_current = FALSE
   WHERE user_id = ${user}
     AND is_current IS TRUE;

  INSERT INTO causal_graph_generations
      (user_id, generation_id, generated_at_ts, is_current)
  VALUES (${user}, ${generation}, commit_ts, TRUE);
END
$daobrew_generation_commit$;`,
  };
}

function resolveGenerationLeaseSql(
  userId: string,
  options: UpsertGraphDeltaOptions,
  isPostgres: boolean,
): GenerationLeaseSql | null {
  const generationId = options.generationId?.trim() ?? "";
  const leaseToken = options.leaseToken?.trim() ?? "";
  if (!generationId && !leaseToken) return null;
  if (!generationId || !leaseToken) {
    throw new GraphDeltaValidationError([
      "generationId and leaseToken must be supplied together",
    ]);
  }
  if (!isPostgres) {
    throw new GraphDeltaValidationError([
      "generationId and leaseToken require the Postgres graph store",
    ]);
  }
  return generationLeaseSql(userId, generationId, leaseToken);
}

function sqlValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return q(value);
}

function sqlJson(value: Record<string, unknown> | undefined): string {
  const literal = q(JSON.stringify(value ?? {}));
  return graphStoreKind() === "postgres" ? `${literal}::jsonb` : literal;
}

function sqlBlob(value: Buffer | null | undefined): string {
  if (!value) return "NULL";
  if (graphStoreKind() === "postgres") return "NULL";
  return `X'${value.toString("hex")}'`;
}

function mergeRootProps(node: GraphNodeDelta, delta: GraphDelta): Record<string, unknown> {
  return {
    ...(node.props_json ?? {}),
    status: "armed",
    confidence: delta.armed_root_cause.confidence,
    root_cause_class: delta.armed_root_cause.root_cause_class,
    brief: delta.armed_root_cause.brief,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => typeof entry === "string" ? entry : null)
    .filter((entry): entry is string => Boolean(entry?.trim()));
}

function sortedUniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function deepMergeRecord(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (isRecord(merged[key]) && isRecord(value)) {
      merged[key] = deepMergeRecord(merged[key] as Record<string, unknown>, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function propsRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function mergeGhostProps(
  existingDbProps: Record<string, unknown> = {},
  incomingProps: Record<string, unknown> = {},
): Record<string, unknown> {
  if (incomingProps.status === "watching") {
    return deepMergeRecord({}, incomingProps);
  }

  const merged = incomingProps.status === "armed"
    ? deepMergeRecord({}, incomingProps)
    : deepMergeRecord(existingDbProps, incomingProps);
  const activeWeeks = sortedUniqueStrings([
    ...stringArray(existingDbProps.active_weeks),
    ...stringArray(incomingProps.active_weeks),
    typeof existingDbProps.week_start === "string" ? existingDbProps.week_start : "",
    typeof incomingProps.week_start === "string" ? incomingProps.week_start : "",
  ].filter(Boolean));
  if (activeWeeks.length) {
    merged.active_weeks = activeWeeks;
    merged.first_seen_week = sortedUniqueStrings([
      typeof existingDbProps.first_seen_week === "string" ? existingDbProps.first_seen_week : "",
      typeof incomingProps.first_seen_week === "string" ? incomingProps.first_seen_week : "",
      activeWeeks[0],
    ].filter(Boolean))[0];
    merged.last_active_week = sortedUniqueStrings([
      typeof existingDbProps.last_active_week === "string" ? existingDbProps.last_active_week : "",
      typeof incomingProps.last_active_week === "string" ? incomingProps.last_active_week : "",
      activeWeeks[activeWeeks.length - 1],
    ].filter(Boolean)).at(-1);
    merged.recurrence_count = activeWeeks.length;
  }

  const existingBriefs = propsRecord(existingDbProps.weekly_briefs);
  const incomingBriefs = propsRecord(incomingProps.weekly_briefs);
  if (Object.keys(existingBriefs).length || Object.keys(incomingBriefs).length) {
    merged.weekly_briefs = {
      ...existingBriefs,
      ...incomingBriefs,
    };
  }

  const existingCooldown = propsRecord(existingDbProps.cooldown);
  const incomingCooldown = propsRecord(incomingProps.cooldown);
  if (Object.keys(existingCooldown).length || Object.keys(incomingCooldown).length) {
    merged.cooldown = deepMergeRecord(existingCooldown, incomingCooldown);
  }

  return merged;
}

function requiredBriefFields(brief: DetonateBrief): string[] {
  const missing: string[] = [];
  if (!brief.cause?.trim()) missing.push("brief.cause");
  if (!Array.isArray(brief.evidence) || brief.evidence.length === 0) missing.push("brief.evidence");
  if (!brief.context?.trim()) missing.push("brief.context");
  if (!brief.artifact_spec?.trim()) missing.push("brief.artifact_spec");
  if (!brief.suggested_block?.title?.trim()) missing.push("brief.suggested_block.title");
  if (!Number.isFinite(brief.suggested_block?.start_offset_min)) missing.push("brief.suggested_block.start_offset_min");
  if (!Number.isFinite(brief.suggested_block?.duration_min)) missing.push("brief.suggested_block.duration_min");
  return missing;
}

async function existingNodeIds(userId: string, query: Query): Promise<Set<string>> {
  const rows = await query(
    `SELECT id FROM graph_nodes WHERE user_id = ${scopedUserIdExpr(userId)};`,
  ) as { id: string }[];
  return new Set(rows.map((row) => row.id));
}

async function existingRootStatus(nodeId: string, userId: string, query: Query): Promise<string | null> {
  const statusExpr = graphStoreKind() === "postgres"
    ? "props_json ->> 'status'"
    : "json_extract(props_json, '$.status')";
  const rows = await query(
    `SELECT ${statusExpr} AS status
       FROM graph_nodes
      WHERE id = ${q(nodeId)} AND user_id = ${scopedUserIdExpr(userId)}
      LIMIT 1;`,
  ) as { status: string | null }[];
  return rows[0]?.status ?? null;
}

interface ExistingGhostState {
  props: Record<string, unknown>;
  createdAtTs: number | null;
}

async function existingGhostStates(
  nodes: GraphNodeDelta[],
  userId: string,
  query: Query,
): Promise<Map<string, ExistingGhostState>> {
  const ids = [...new Set(nodes
    .filter((node) => node.kind === "ghost")
    .map((node) => node.id))];
  if (ids.length === 0) return new Map();
  const rows = await query(
    `SELECT id, props_json, created_at_ts
       FROM graph_nodes
      WHERE user_id = ${scopedUserIdExpr(userId)}
        AND id IN (${ids.map(q).join(", ")});`,
  ) as {
    id: string;
    props_json: string | Record<string, unknown>;
    created_at_ts?: number | string | null;
  }[];
  return new Map(rows.map((row) => {
    const createdAtTs = Number(row.created_at_ts);
    return [row.id, {
      props: propsRecord(row.props_json),
      createdAtTs: Number.isFinite(createdAtTs) ? createdAtTs : null,
    }];
  }));
}

export async function validateGraphDelta(
  delta: GraphDelta,
  options: UpsertGraphDeltaOptions = {},
): Promise<void> {
  const userId = requireUserId(options.userId ?? delta.user_id, "validateGraphDelta");
  const query = options.query ?? queryJson;
  ensureSchema();

  const issues: string[] = [];
  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  for (const node of delta.nodes) {
    if (nodeIds.has(node.id)) duplicateNodeIds.add(node.id);
    nodeIds.add(node.id);
    if (!NODE_KINDS.has(node.kind)) issues.push(`invalid node kind ${node.kind}`);
    if (!node.title?.trim()) issues.push(`node ${node.id} missing title`);
    if (!node.source?.trim()) issues.push(`node ${node.id} missing source`);
    if (!node.source_ref?.trim()) issues.push(`node ${node.id} missing source_ref`);
    if (node.kind === "episode" && !/^(healthkit|state):/.test(node.source_ref)) {
      issues.push(`episode ${node.id} lacks biometric source_ref`);
    }
  }
  for (const id of duplicateNodeIds) issues.push(`duplicate node id ${id}`);

  const rootNode = delta.nodes.find((node) => node.id === delta.armed_root_cause.node_id);
  if (!rootNode) issues.push("armed_root_cause.node_id is absent from nodes");
  if (delta.armed_root_cause.root_cause_class !== "productivity") {
    issues.push("armed_root_cause.root_cause_class must be productivity");
  }
  for (const field of requiredBriefFields(delta.armed_root_cause.brief)) {
    issues.push(`missing ${field}`);
  }

  const armedNodes = delta.nodes.filter((node) => node.kind === "ghost" && node.props_json?.status === "armed");
  if (delta.root_armed === false && armedNodes.length > 0) {
    issues.push("non-armed delta marks a ghost as armed");
  } else if (armedNodes.length > 1) {
    issues.push("delta marks more than one ghost as armed");
  }

  const existingIds = await existingNodeIds(userId, query);
  const allowedIds = new Set([...existingIds, ...nodeIds]);
  const edgeIds = new Set<string>();
  const duplicateEdgeIds = new Set<string>();
  for (const edge of delta.edges) {
    if (edgeIds.has(edge.id)) duplicateEdgeIds.add(edge.id);
    edgeIds.add(edge.id);
    if (!EDGE_KINDS.has(edge.kind)) issues.push(`invalid edge kind ${edge.kind}`);
    if (!allowedIds.has(edge.src_id)) issues.push(`edge ${edge.id} missing src node ${edge.src_id}`);
    if (!allowedIds.has(edge.dst_id)) issues.push(`edge ${edge.id} missing dst node ${edge.dst_id}`);
  }
  for (const id of duplicateEdgeIds) issues.push(`duplicate edge id ${id}`);

  if (issues.length > 0) throw new GraphDeltaValidationError(issues);
}

function resolvedNodeProps(
  node: GraphNodeDelta,
  nowTs: number,
  rootDelta?: GraphDelta,
  existingGhostStatesById: Map<string, ExistingGhostState> = new Map(),
): Record<string, unknown> | undefined {
  const shouldArmRoot = rootDelta?.root_armed !== false;
  const incomingProps = rootDelta && shouldArmRoot && node.id === rootDelta.armed_root_cause.node_id
    ? mergeRootProps(node, rootDelta)
    : node.props_json;
  const existingProps = node.kind === "ghost"
    ? existingGhostStatesById.get(node.id)?.props ?? {}
    : {};
  let props = node.kind === "ghost"
    ? mergeGhostProps(existingProps, incomingProps ?? {})
    : incomingProps;
  // armed_at_ts is transition-stamped: refreshed ONLY when the ghost ENTERS
  // 'armed' (from watching/suggested/done via allowRearmDone), preserved while
  // it is already armed. The intervention-assignment episode key hangs on this:
  // the engine re-upserts the armed delta every run between detonate and
  // detonate_done, and both must derive the same assignment id. Legacy armed
  // rows without a stamp keep their absence (their episodes key on created_at_ts).
  if (node.kind === "ghost" && isRecord(props) && props.status === "armed") {
    if (existingProps.status === "armed") {
      if (existingProps.armed_at_ts !== undefined) props = { ...props, armed_at_ts: existingProps.armed_at_ts };
      // offer_state (MRT randomization v1) rides the same episode lifetime as
      // armed_at_ts. Direct/local upserts preserve the existing value. The
      // production armedOffer path below replaces it with the deterministic
      // decision BEFORE graph+generation commit, never afterward.
      if (existingProps.offer_state !== undefined) props = { ...props, offer_state: existingProps.offer_state };
    } else {
      props = { ...props, armed_at_ts: nowTs };
    }
  }
  return props;
}

function nodeSql(
  node: GraphNodeDelta,
  userId: string,
  nowTs: number,
  props: Record<string, unknown> | undefined,
): string {
  // node.user_id ?? userId: the Reasoner stamps the run user on every node,
  // so the fallback is unreachable in practice — and under RLS a foreign
  // node.user_id fails closed (WITH CHECK rejects rows outside the GUC scope).
  return `
INSERT INTO graph_nodes(
  id, user_id, kind, title, subtitle, element, occurred_at_ts,
  source, source_ref, props_json, embedding, created_at_ts
) VALUES (
  ${q(node.id)}, ${q(node.user_id ?? userId)}, ${q(node.kind)}, ${q(node.title)},
  ${sqlValue(node.subtitle)}, ${sqlValue(node.element)}, ${sqlValue(node.occurred_at_ts)},
  ${q(node.source)}, ${q(node.source_ref)}, ${sqlJson(props)}, ${sqlBlob(node.embedding)}, ${nowTs}
)
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  kind = excluded.kind,
  title = excluded.title,
  subtitle = excluded.subtitle,
  element = excluded.element,
  occurred_at_ts = excluded.occurred_at_ts,
  source = excluded.source,
  source_ref = excluded.source_ref,
  props_json = excluded.props_json,
  embedding = excluded.embedding;`;
}

function edgeSql(edge: GraphEdgeDelta, userId: string, nowTs: number): string {
  if (graphStoreKind() === "postgres") {
    return `
INSERT INTO graph_edges(
  id, user_id, src_id, dst_id, kind, label, weight, props_json, created_at_ts
) VALUES (
  ${q(edge.id)}, ${q(edge.user_id ?? userId)}, ${q(edge.src_id)}, ${q(edge.dst_id)},
  ${q(edge.kind)}, ${sqlValue(edge.label)}, ${sqlValue(edge.weight ?? 1)},
  ${sqlJson(edge.props_json)}, ${nowTs}
)
ON CONFLICT DO NOTHING;`;
  }

  return `
INSERT OR IGNORE INTO graph_edges(
  id, user_id, src_id, dst_id, kind, label, weight, props_json, created_at_ts
) VALUES (
  ${q(edge.id)}, ${q(edge.user_id ?? userId)}, ${q(edge.src_id)}, ${q(edge.dst_id)},
  ${q(edge.kind)}, ${sqlValue(edge.label)}, ${sqlValue(edge.weight ?? 1)},
  ${sqlJson(edge.props_json)}, ${nowTs}
);`;
}

function replaceInactiveGraphSql(delta: GraphDelta, userId: string): string {
  const retainedNodeIds = new Set<string>();
  const retainedEdgeIds = new Set<string>();
  for (const node of delta.nodes) retainedNodeIds.add(node.id);
  for (const edge of delta.edges) {
    retainedEdgeIds.add(edge.id);
    retainedNodeIds.add(edge.src_id);
    retainedNodeIds.add(edge.dst_id);
  }
  const edgeKeepClause = retainedEdgeIds.size
    ? `AND id NOT IN (${[...retainedEdgeIds].map(q).join(", ")})`
    : "";
  const nodeKeepClause = retainedNodeIds.size
    ? `AND id NOT IN (${[...retainedNodeIds].map(q).join(", ")})`
    : "";
  return `
DELETE FROM graph_edges
 WHERE user_id = ${q(userId)}
 ${edgeKeepClause};

DELETE FROM graph_nodes
 WHERE user_id = ${q(userId)}
 ${nodeKeepClause};`;
}

/** Keep research logging fail-soft without moving its normal write outside the
 * exact graph transaction. A schema/permission failure is contained by the
 * PL/pgSQL subtransaction; run.ts retries the same idempotent INSERT after the
 * graph commit so it can surface the existing warning contract. */
function bestEffortAssignmentSql(sql: string): string {
  const body = sql.trim().replace(/;+\s*$/, "");
  return `
DO $daobrew_offer_assignment$
BEGIN
  ${body};
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'arming-time assignment insert failed; graph commit continues';
END
$daobrew_offer_assignment$;`;
}

export async function upsertGraphDelta(
  delta: GraphDelta,
  options: UpsertGraphDeltaOptions = {},
): Promise<UpsertGraphDeltaResult> {
  const userId = requireUserId(options.userId ?? delta.user_id, "upsertGraphDelta");
  const nowTs = options.nowTs ?? Math.floor(Date.now() / 1000);
  const exec = options.exec ?? execSql;
  const query = options.query ?? queryJson;
  ensureSchema();
  await validateGraphDelta(delta, { ...options, userId });
  const isPostgres = graphStoreKind() === "postgres";
  const generationCommit = resolveGenerationLeaseSql(userId, options, isPostgres);

  const shouldArmRoot = delta.root_armed !== false;
  const rootStatus = await existingRootStatus(delta.armed_root_cause.node_id, userId, query);
  // A done root is sticky for ALL deltas, not just armed ones: a watching
  // write replaces ghost props wholesale (mergeGhostProps) and the graph
  // replace prunes the e_done_ edge, so letting it through would erase
  // status='done'/done_at_ts/artifact_ref and silently close the G5 verify
  // window early. Only an explicit allowRearmDone may clear a done root.
  if (rootStatus === "done" && !options.allowRearmDone) {
    // skipped_done is still an accepted production generation.  There is no
    // graph delta to apply, but the exact live lease must be consumed and the
    // marker advanced atomically before the engine may report success.
    if (generationCommit) {
      await exec([generationCommit.guard, generationCommit.commit].join("\n"));
    }
    return {
      status: "skipped_done",
      user_id: userId,
      nodes_upserted: 0,
      edges_attempted: 0,
      armed_node_id: delta.armed_root_cause.node_id,
      root_armed: false,
    };
  }
  const existingGhostStatesById = await existingGhostStates(delta.nodes, userId, query);
  const nodeWrites = delta.nodes.map((node) => ({
    node,
    props: resolvedNodeProps(node, nowTs, delta, existingGhostStatesById),
  }));

  let armedOffer: PreparedArmedOffer | undefined;
  let assignmentSql: string | undefined;
  if (isPostgres && shouldArmRoot && options.armedOffer) {
    const rootWrite = nodeWrites.find(
      ({ node }) => node.id === delta.armed_root_cause.node_id,
    );
    if (
      rootWrite?.node.kind === "ghost"
      && isRecord(rootWrite.props)
      && rootWrite.props.status === "armed"
    ) {
      const existing = existingGhostStatesById.get(rootWrite.node.id);
      armedOffer = prepareArmedOffer({
        userId,
        ghostId: rootWrite.node.id,
        ghostProps: rootWrite.props,
        createdAtTs: existing?.createdAtTs ?? nowTs,
        ...(options.armedOffer.treatmentP !== undefined
          ? { treatmentP: options.armedOffer.treatmentP }
          : {}),
      });
      rootWrite.props = armedOffer.ghostProps;
      assignmentSql = bestEffortAssignmentSql(interventionAssignmentSql({
        userId,
        ghostId: rootWrite.node.id,
        armedAtTs: armedOffer.armedAtTs,
        ghostProps: armedOffer.ghostProps,
        nowTs,
        assignment: armedOffer.assignment,
      }));
    }
  }

  const disarmOtherGhostsSql = graphStoreKind() === "postgres"
    ? `UPDATE graph_nodes
        SET props_json = jsonb_set(COALESCE(props_json, '{}'::jsonb), '{status}', '"suggested"'::jsonb, true)
      WHERE user_id = ${q(userId)}
        AND kind = 'ghost'
        ${shouldArmRoot ? `AND id <> ${q(delta.armed_root_cause.node_id)}` : ""}
        AND props_json ->> 'status' = 'armed';`
    : `UPDATE graph_nodes
        SET props_json = json_set(COALESCE(NULLIF(props_json, ''), '{}'), '$.status', 'suggested')
      WHERE user_id = ${q(userId)}
        AND kind = 'ghost'
        ${shouldArmRoot ? `AND id <> ${q(delta.armed_root_cause.node_id)}` : ""}
        AND json_extract(props_json, '$.status') = 'armed';`;

  // Postgres contract: NO transaction control here — in production `exec` is
  // scopedExec, which wraps the delegated SQL in its own BEGIN / set_config /
  // COMMIT transaction (pooler-safe RLS scoping + atomicity via psql's
  // ON_ERROR_STOP=1). Emitting BEGIN/COMMIT here would nest: the inner COMMIT
  // ends scopedExec's transaction early and drops the transaction-local GUC
  // for every statement after it. SQLite keeps its own BEGIN IMMEDIATE batch.
  const sql = [
    ...(isPostgres ? [] : ["BEGIN IMMEDIATE;"]),
    ...(generationCommit ? [generationCommit.guard] : []),
    disarmOtherGhostsSql,
    replaceInactiveGraphSql(delta, userId),
    ...nodeWrites.map(({ node, props }) => nodeSql(node, userId, nowTs, props)),
    ...delta.edges.map((edge) => edgeSql(edge, userId, nowTs)),
    ...(assignmentSql ? [assignmentSql] : []),
    ...(generationCommit ? [generationCommit.commit] : []),
    ...(isPostgres ? [] : ["COMMIT;"]),
  ].join("\n");

  await exec(sql);

  return {
    status: "written",
    user_id: userId,
    nodes_upserted: delta.nodes.length,
    edges_attempted: delta.edges.length,
    armed_node_id: delta.armed_root_cause.node_id,
    root_armed: shouldArmRoot,
    ...(armedOffer ? { armed_offer: armedOffer } : {}),
  };
}
