export declare const GRAPH_NODE_KINDS: readonly ["pattern", "meeting", "episode", "theme", "ghost", "prediction", "intervention", "memory_hit"];
export declare const GRAPH_EDGE_KINDS: readonly ["triggered", "manifested", "tagged", "clusters", "suggests", "evidence_for", "predicts", "caused", "relates_to"];
export interface PostgresRuntimeSchemaStatus {
    ready: boolean;
    vector_extension: boolean;
    generation_current_marker: boolean;
    missing_tables: string[];
    missing_indexes: string[];
    missing_functions: string[];
    missing_triggers: string[];
    trigger_count: number;
}
/**
 * Strict, read-only readiness probe for the shared backend/engine database.
 * The result contains catalog names only; connection strings and credentials
 * are never reflected into an error or log message.
 */
export declare function verifyPostgresRuntimeSchema(): PostgresRuntimeSchemaStatus;
/** Test-only cache reset; production callers never need to clear readiness. */
export declare function __resetPostgresSchemaEnsureForTests(): void;
/**
 * Ensure the local causal-chain store exists.
 *
 * This is intentionally synchronous so local maintenance commands
 * can call it before issuing their inserts, and so every runtime path shares one
 * graph DDL source.
 */
export declare function ensureSchema(dbPath?: string): void;
