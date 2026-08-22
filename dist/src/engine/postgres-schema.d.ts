export declare const POSTGRES_TABLES: readonly ["graph_nodes", "graph_edges", "events", "meeting_notes", "user_insights", "insight_lifecycle_decisions", "pipeline_metrics", "transfer_records", "transfer_consent", "user_vectors", "causal_memory_threads", "causal_thread_evidence", "user_model_snapshots", "population_priors", "thread_verifications", "intervention_assignments"];
/**
 * warm_db_bytes measurement for pipeline_metrics, derived from POSTGRES_TABLES
 * so every schema table (and its indexes, via pg_total_relation_size) counts
 * toward the Neon free-tier warning threshold — a table added to the schema
 * can never silently escape the size alert. to_regclass keeps the query safe
 * when a table does not exist yet.
 */
export declare const WARM_DB_BYTES_SQL: string;
export declare const POSTGRES_INDEXES: readonly ["ux_nodes_dedup", "ux_events_dedup", "idx_events_user_time", "ux_meeting_notes_dedup", "idx_meeting_notes_user_time", "ux_user_insights_dedup", "idx_user_insights_user_strength", "ux_insight_lifecycle_decisions_replay", "idx_insight_lifecycle_decisions_user_incoming", "idx_insight_lifecycle_decisions_user_winner", "idx_insight_lifecycle_decisions_user_loser", "idx_graph_nodes_embedding_cosine", "idx_meeting_notes_embedding_cosine", "idx_user_insights_embedding_cosine", "idx_pipeline_metrics_job_run", "idx_transfer_records_trigger_cosine", "idx_transfer_records_contributor", "ux_cmt_user_thread_key", "idx_cmt_user_status_strength", "idx_cmt_user_graph_root", "idx_cte_user_thread_observed", "idx_cte_user_source", "ux_ums_user_version", "ux_pp_cohort_pattern_version", "idx_tv_user_thread_observed", "idx_tv_user_kind_verdict", "idx_ivn_user_created", "idx_ivn_user_ghost"];
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
export declare const POSTGRES_RUNTIME_VERIFY_SQL: string;
