/**
 * Read/write access to the local causal-chain graph runtime.
 *
 * SQLite remains supported for Sentinel compatibility and migration input.
 * P6.5 can opt into local Docker Postgres/pgvector by setting
 * DAOBREW_GRAPH_STORE=postgres. Alternatively, a Postgres connection URL
 * enables direct-URL mode: psql runs via `docker run` against that connection
 * string (e.g. Neon) instead of the compose service. We shell out to CLIs
 * instead of adding native database dependencies to the MCP package.
 *
 * Direct URL mode is server/operator-only: a URL may come from the process
 * environment, never from the Mac client's owner config. Explicit
 * DAOBREW_GRAPH_STORE=sqlite remains the dev/test escape hatch.
 */
export type GraphStoreKind = "sqlite" | "postgres";
export declare function graphDbPath(): string;
export declare function __resetGraphDbConfigCacheForTests(): void;
/** Server/operator environment only; client config is never consulted. */
export declare function resolvedPostgresUrl(): string | undefined;
export declare function graphStoreKind(): GraphStoreKind;
export declare function postgresCliArgs(): string[];
/**
 * Postgres transport seam: Cloud Run has no Docker daemon, so when
 * DAOBREW_PSQL_BIN names a native psql binary (trimmed, non-empty) AND we are
 * in direct-URL mode, run it directly against the connection string.
 * Compose mode and the default remain the docker argv, byte-identical.
 */
export declare function postgresCliCommand(): {
    bin: string;
    args: string[];
};
export declare function graphStoreDescription(): string;
export declare function graphDbExists(): boolean;
export declare function sqliteCliAvailable(): Promise<boolean>;
export declare function postgresCliAvailable(): Promise<boolean>;
/** Escape a value as a SQL string literal. */
export declare function q(value: string): string;
export declare function queryJson<T = Record<string, any>>(sql: string): Promise<T[]>;
export declare function execSql(sql: string): Promise<void>;
export declare function execSqlSync(sql: string): string;
