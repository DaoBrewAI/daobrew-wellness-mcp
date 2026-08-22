export const POSTGRES_TABLES = [
  "graph_nodes",
  "graph_edges",
  "events",
  "meeting_notes",
  "user_insights",
  "insight_lifecycle_decisions",
  "pipeline_metrics",
  "transfer_records",
  "transfer_consent",
  "user_vectors",
  "causal_memory_threads",
  "causal_thread_evidence",
  "user_model_snapshots",
  "population_priors",
  "thread_verifications",
  "intervention_assignments",
] as const;

/**
 * warm_db_bytes measurement for pipeline_metrics, derived from POSTGRES_TABLES
 * so every schema table (and its indexes, via pg_total_relation_size) counts
 * toward the Neon free-tier warning threshold — a table added to the schema
 * can never silently escape the size alert. to_regclass keeps the query safe
 * when a table does not exist yet.
 */
export const WARM_DB_BYTES_SQL = `SELECT (${POSTGRES_TABLES.map(
  (name) => `COALESCE(pg_total_relation_size(to_regclass('${name}')), 0)`,
).join(" + ")}) AS bytes`;

export const POSTGRES_INDEXES = [
  "ux_nodes_dedup",
  "ux_events_dedup",
  "idx_events_user_time",
  "ux_meeting_notes_dedup",
  "idx_meeting_notes_user_time",
  "ux_user_insights_dedup",
  "idx_user_insights_user_strength",
  "ux_insight_lifecycle_decisions_replay",
  "idx_insight_lifecycle_decisions_user_incoming",
  "idx_insight_lifecycle_decisions_user_winner",
  "idx_insight_lifecycle_decisions_user_loser",
  "idx_graph_nodes_embedding_cosine",
  "idx_meeting_notes_embedding_cosine",
  "idx_user_insights_embedding_cosine",
  "idx_pipeline_metrics_job_run",
  "idx_transfer_records_trigger_cosine",
  "idx_transfer_records_contributor",
  "ux_cmt_user_thread_key",
  "idx_cmt_user_status_strength",
  "idx_cmt_user_graph_root",
  "idx_cte_user_thread_observed",
  "idx_cte_user_source",
  "ux_ums_user_version",
  "ux_pp_cohort_pattern_version",
  "idx_tv_user_thread_observed",
  "idx_tv_user_kind_verdict",
  "idx_ivn_user_created",
  "idx_ivn_user_ghost",
] as const;

/**
 * Read-only production readiness contract shared by owner and app roles.
 *
 * This deliberately inspects pg_catalog instead of attempting repair.  It
 * proves that the shared backend/engine database has the complete Node schema,
 * the Alembic generation tables/marker, the two migration-owned functions,
 * and all four enabled graph invalidation triggers wired to the right
 * function.  The JSON result is parsed by ensureSchema(); a missing component
 * prevents the internal server from opening its listening socket.
 */
export const POSTGRES_RUNTIME_VERIFY_SQL = `
WITH expected_tables(name) AS (
  VALUES ${[
    ...POSTGRES_TABLES,
    "users",
    "causal_graph_generations",
    "causal_execution_leases",
  ].map((name) => `('${name}')`).join(", ")}
),
expected_indexes(name) AS (
  VALUES ${[
    ...POSTGRES_INDEXES,
    "ux_causal_graph_generations_current_user",
  ].map((name) => `('${name}')`).join(", ")}
),
expected_functions(name) AS (
  VALUES
    ('daobrew_invalidate_graph_generation'),
    ('daobrew_invalidate_all_graph_generations')
),
expected_triggers(table_name, trigger_name, function_name, trigger_type) AS (
  VALUES
    ('graph_nodes', 'trg_graph_nodes_invalidate_generation',
     'daobrew_invalidate_graph_generation', 29),
    ('graph_nodes', 'trg_graph_nodes_truncate_generation',
     'daobrew_invalidate_all_graph_generations', 32),
    ('graph_edges', 'trg_graph_edges_invalidate_generation',
     'daobrew_invalidate_graph_generation', 29),
    ('graph_edges', 'trg_graph_edges_truncate_generation',
     'daobrew_invalidate_all_graph_generations', 32)
),
present_tables AS (
  SELECT c.relname AS name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r', 'p')
),
present_indexes AS (
  SELECT c.relname AS name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_index AS i ON i.indexrelid = c.oid
   WHERE n.nspname = 'public'
     AND c.relkind = 'i'
     AND i.indisvalid
     AND i.indisready
),
present_functions AS (
  SELECT p.proname AS name
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_class AS marker
      ON marker.relname = 'causal_graph_generations'
    JOIN pg_catalog.pg_namespace AS marker_ns
      ON marker_ns.oid = marker.relnamespace
   WHERE n.nspname = 'public'
     AND p.pronargs = 0
     AND p.prorettype = 'trigger'::pg_catalog.regtype
     AND p.prosecdef
     AND p.proowner = marker.relowner
     AND marker_ns.nspname = 'public'
     AND EXISTS (
       SELECT 1
         FROM unnest(p.proconfig) AS setting
        WHERE setting = 'search_path=pg_catalog, public'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM pg_catalog.aclexplode(
           COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
         ) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
     )
),
present_triggers AS (
  SELECT c.relname AS table_name,
         t.tgname AS trigger_name,
         p.proname AS function_name,
         t.tgtype::integer AS trigger_type
    FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
   WHERE n.nspname = 'public'
     AND NOT t.tgisinternal
     AND t.tgenabled = 'O'
),
facts AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'vector'
    ) AS vector_extension,
    EXISTS (
      SELECT 1
        FROM pg_catalog.pg_attribute AS a
        JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'causal_graph_generations'
         AND a.attname = 'is_current'
         AND a.atttypid = 'boolean'::pg_catalog.regtype
         AND a.attnotnull
         AND NOT a.attisdropped
    ) AS generation_current_marker,
    COALESCE((
      SELECT array_agg(e.name ORDER BY e.name)
        FROM expected_tables AS e
       WHERE NOT EXISTS (
         SELECT 1 FROM present_tables AS p WHERE p.name = e.name
       )
    ), ARRAY[]::text[]) AS missing_tables,
    COALESCE((
      SELECT array_agg(e.name ORDER BY e.name)
        FROM expected_indexes AS e
       WHERE NOT EXISTS (
         SELECT 1 FROM present_indexes AS p WHERE p.name = e.name
       )
    ), ARRAY[]::text[]) AS missing_indexes,
    COALESCE((
      SELECT array_agg(e.name ORDER BY e.name)
        FROM expected_functions AS e
       WHERE NOT EXISTS (
         SELECT 1 FROM present_functions AS p WHERE p.name = e.name
       )
    ), ARRAY[]::text[]) AS missing_functions,
    COALESCE((
      SELECT array_agg(
               e.table_name || '.' || e.trigger_name ORDER BY e.table_name,
               e.trigger_name
             )
        FROM expected_triggers AS e
       WHERE NOT EXISTS (
         SELECT 1
           FROM present_triggers AS p
          WHERE p.table_name = e.table_name
            AND p.trigger_name = e.trigger_name
            AND p.function_name = e.function_name
            AND p.trigger_type = e.trigger_type
       )
    ), ARRAY[]::text[]) AS missing_triggers,
    (SELECT count(*) FROM expected_triggers AS e
      WHERE EXISTS (
        SELECT 1
          FROM present_triggers AS p
         WHERE p.table_name = e.table_name
           AND p.trigger_name = e.trigger_name
           AND p.function_name = e.function_name
           AND p.trigger_type = e.trigger_type
      )) AS trigger_count
)
SELECT jsonb_build_object(
  'ready', vector_extension
           AND generation_current_marker
           AND cardinality(missing_tables) = 0
           AND cardinality(missing_indexes) = 0
           AND cardinality(missing_functions) = 0
           AND cardinality(missing_triggers) = 0
           AND trigger_count = 4,
  'vector_extension', vector_extension,
  'generation_current_marker', generation_current_marker,
  'missing_tables', missing_tables,
  'missing_indexes', missing_indexes,
  'missing_functions', missing_functions,
  'missing_triggers', missing_triggers,
  'trigger_count', trigger_count
)::text AS daobrew_runtime_schema
FROM facts;
`;
