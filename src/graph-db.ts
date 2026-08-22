import { execFile, execFileSync, spawn } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, resolve, join } from "path";

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

export function graphDbPath(): string {
  return (
    process.env.DAOBREW_GRAPH_DB ||
    join(homedir(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db")
  );
}

export function __resetGraphDbConfigCacheForTests(): void {
  // Retained as a source-compatible test hook. Client config is no longer read.
}

/** Server/operator environment only; client config is never consulted. */
export function resolvedPostgresUrl(): string | undefined {
  const env = (process.env.DAOBREW_POSTGRES_URL || "").trim();
  return env || undefined;
}

export function graphStoreKind(): GraphStoreKind {
  const explicit = (process.env.DAOBREW_GRAPH_STORE || "").trim().toLowerCase();
  if (explicit === "postgres" || explicit === "postgresql" || explicit === "pg") return "postgres";
  if (explicit === "sqlite" || explicit === "sqlite3") return "sqlite";
  return resolvedPostgresUrl() ? "postgres" : "sqlite";
}

function defaultComposeFile(): string {
  const candidates = [
    resolve(process.cwd(), "docker-compose.postgres.yml"),
    resolve(process.cwd(), "..", "docker-compose.postgres.yml"),
    resolve(__dirname, "..", "..", "..", "docker-compose.postgres.yml"),
    resolve(__dirname, "..", "..", "docker-compose.postgres.yml"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function postgresComposeFile(): string {
  return resolve(process.env.DAOBREW_POSTGRES_COMPOSE_FILE || defaultComposeFile());
}

export function postgresCliArgs(): string[] {
  const url = resolvedPostgresUrl();
  if (url) {
    return [
      "run",
      "--rm",
      "-i",
      process.env.DAOBREW_POSTGRES_IMAGE || "pgvector/pgvector:0.8.1-pg16",
      "psql",
      url,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ];
  }
  return [
    "compose",
    "-p",
    process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai",
    "-f",
    postgresComposeFile(),
    "exec",
    "-T",
    process.env.DAOBREW_POSTGRES_SERVICE || "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-U",
    process.env.DAOBREW_POSTGRES_USER || "daobrew",
    "-d",
    process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth",
  ];
}

/**
 * Postgres transport seam: Cloud Run has no Docker daemon, so when
 * DAOBREW_PSQL_BIN names a native psql binary (trimmed, non-empty) AND we are
 * in direct-URL mode, run it directly against the connection string.
 * Compose mode and the default remain the docker argv, byte-identical.
 */
export function postgresCliCommand(): { bin: string; args: string[] } {
  const psqlBin = (process.env.DAOBREW_PSQL_BIN || "").trim();
  const url = resolvedPostgresUrl();
  if (psqlBin && url) {
    return { bin: psqlBin, args: [url, "-v", "ON_ERROR_STOP=1", "-At"] };
  }
  return { bin: "docker", args: postgresCliArgs() };
}

export function graphStoreDescription(): string {
  if (graphStoreKind() === "sqlite") return graphDbPath();
  const url = resolvedPostgresUrl();
  if (url) {
    try {
      const parsed = new URL(url);
      return `postgres:${parsed.hostname}/${parsed.pathname.replace(/^\//, "")}`;
    } catch {
      return "postgres:<redacted>";
    }
  }
  return `postgres:${process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai"}/${process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth"}`;
}

export function graphDbExists(): boolean {
  if (graphStoreKind() === "sqlite") return existsSync(graphDbPath());
  try {
    runPostgresSync("SELECT 1;");
    return true;
  } catch {
    return false;
  }
}

export async function sqliteCliAvailable(): Promise<boolean> {
  try {
    await runSqlite(["-version"], null);
    return true;
  } catch {
    return false;
  }
}

export async function postgresCliAvailable(): Promise<boolean> {
  try {
    await runPostgres("SELECT 1;");
    return true;
  } catch {
    return false;
  }
}

/** Escape a value as a SQL string literal. */
export function q(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSqlite(args: string[], sql: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const argv = sql === null ? args : ["-cmd", ".timeout 5000", ...args, graphDbPath(), sql];
    execFile("sqlite3", argv, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

function runPostgres(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = postgresCliCommand();
    const child = spawn(command.bin, command.args, {
      cwd: dirname(postgresComposeFile()),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Postgres command timed out"));
    }, 30_000);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Postgres command exited with ${code}`));
    });
    child.stdin.end(sql);
  });
}

function runPostgresSync(sql: string): string {
  const command = postgresCliCommand();
  try {
    return execFileSync(command.bin, command.args, {
      cwd: dirname(postgresComposeFile()),
      encoding: "utf-8",
      input: sql,
      timeout: 30_000,
    });
  } catch (err: any) {
    // execFileSync errors embed the full argv (including the connection URL
    // with password) in the message; rethrow with stderr only.
    const stderr = typeof err?.stderr === "string" ? err.stderr.trim() : "";
    throw new Error(stderr || `Postgres command failed (${graphStoreDescription()})`);
  }
}

function jsonQuerySql(sql: string): string {
  const body = sql.trim().replace(/;+\s*$/, "");
  return `SELECT COALESCE(jsonb_agg(to_jsonb(__daobrew_rows)), '[]'::jsonb)::text FROM (${body}) AS __daobrew_rows;`;
}

export async function queryJson<T = Record<string, any>>(sql: string): Promise<T[]> {
  if (graphStoreKind() === "postgres") {
    const out = (await runPostgres(jsonQuerySql(sql))).trim();
    return out ? JSON.parse(out) : [];
  }
  const out = (await runSqlite(["-json"], sql)).trim();
  return out ? JSON.parse(out) : [];
}

export async function execSql(sql: string): Promise<void> {
  if (graphStoreKind() === "postgres") {
    await runPostgres(sql);
    return;
  }
  await runSqlite([], sql);
}

export function execSqlSync(sql: string): string {
  if (graphStoreKind() === "postgres") return runPostgresSync(sql);
  return execFileSync("sqlite3", ["-cmd", ".timeout 5000", graphDbPath(), sql], { encoding: "utf-8" });
}
