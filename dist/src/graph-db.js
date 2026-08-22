"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphDbPath = graphDbPath;
exports.__resetGraphDbConfigCacheForTests = __resetGraphDbConfigCacheForTests;
exports.resolvedPostgresUrl = resolvedPostgresUrl;
exports.graphStoreKind = graphStoreKind;
exports.postgresCliArgs = postgresCliArgs;
exports.postgresCliCommand = postgresCliCommand;
exports.graphStoreDescription = graphStoreDescription;
exports.graphDbExists = graphDbExists;
exports.sqliteCliAvailable = sqliteCliAvailable;
exports.postgresCliAvailable = postgresCliAvailable;
exports.q = q;
exports.queryJson = queryJson;
exports.execSql = execSql;
exports.execSqlSync = execSqlSync;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
function graphDbPath() {
    return (process.env.DAOBREW_GRAPH_DB ||
        (0, path_1.join)((0, os_1.homedir)(), "Library", "Application Support", "DaoBrew", "sentinel-graph.db"));
}
function __resetGraphDbConfigCacheForTests() {
    // Retained as a source-compatible test hook. Client config is no longer read.
}
/** Server/operator environment only; client config is never consulted. */
function resolvedPostgresUrl() {
    const env = (process.env.DAOBREW_POSTGRES_URL || "").trim();
    return env || undefined;
}
function graphStoreKind() {
    const explicit = (process.env.DAOBREW_GRAPH_STORE || "").trim().toLowerCase();
    if (explicit === "postgres" || explicit === "postgresql" || explicit === "pg")
        return "postgres";
    if (explicit === "sqlite" || explicit === "sqlite3")
        return "sqlite";
    return resolvedPostgresUrl() ? "postgres" : "sqlite";
}
function defaultComposeFile() {
    const candidates = [
        (0, path_1.resolve)(process.cwd(), "docker-compose.postgres.yml"),
        (0, path_1.resolve)(process.cwd(), "..", "docker-compose.postgres.yml"),
        (0, path_1.resolve)(__dirname, "..", "..", "..", "docker-compose.postgres.yml"),
        (0, path_1.resolve)(__dirname, "..", "..", "docker-compose.postgres.yml"),
    ];
    return candidates.find((candidate) => (0, fs_1.existsSync)(candidate)) ?? candidates[0];
}
function postgresComposeFile() {
    return (0, path_1.resolve)(process.env.DAOBREW_POSTGRES_COMPOSE_FILE || defaultComposeFile());
}
function postgresCliArgs() {
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
function postgresCliCommand() {
    const psqlBin = (process.env.DAOBREW_PSQL_BIN || "").trim();
    const url = resolvedPostgresUrl();
    if (psqlBin && url) {
        return { bin: psqlBin, args: [url, "-v", "ON_ERROR_STOP=1", "-At"] };
    }
    return { bin: "docker", args: postgresCliArgs() };
}
function graphStoreDescription() {
    if (graphStoreKind() === "sqlite")
        return graphDbPath();
    const url = resolvedPostgresUrl();
    if (url) {
        try {
            const parsed = new URL(url);
            return `postgres:${parsed.hostname}/${parsed.pathname.replace(/^\//, "")}`;
        }
        catch {
            return "postgres:<redacted>";
        }
    }
    return `postgres:${process.env.DAOBREW_POSTGRES_COMPOSE_PROJECT || "daobrewai"}/${process.env.DAOBREW_POSTGRES_DB || "daobrew_local_truth"}`;
}
function graphDbExists() {
    if (graphStoreKind() === "sqlite")
        return (0, fs_1.existsSync)(graphDbPath());
    try {
        runPostgresSync("SELECT 1;");
        return true;
    }
    catch {
        return false;
    }
}
async function sqliteCliAvailable() {
    try {
        await runSqlite(["-version"], null);
        return true;
    }
    catch {
        return false;
    }
}
async function postgresCliAvailable() {
    try {
        await runPostgres("SELECT 1;");
        return true;
    }
    catch {
        return false;
    }
}
/** Escape a value as a SQL string literal. */
function q(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}
function runSqlite(args, sql) {
    return new Promise((resolve, reject) => {
        const argv = sql === null ? args : ["-cmd", ".timeout 5000", ...args, graphDbPath(), sql];
        (0, child_process_1.execFile)("sqlite3", argv, { timeout: 10_000 }, (err, stdout, stderr) => {
            if (err)
                reject(new Error(stderr?.trim() || err.message));
            else
                resolve(stdout);
        });
    });
}
function runPostgres(sql) {
    return new Promise((resolve, reject) => {
        const command = postgresCliCommand();
        const child = (0, child_process_1.spawn)(command.bin, command.args, {
            cwd: (0, path_1.dirname)(postgresComposeFile()),
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timeout = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill("SIGTERM");
            reject(new Error("Postgres command timed out"));
        }, 30_000);
        child.stdout.setEncoding("utf-8");
        child.stderr.setEncoding("utf-8");
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            reject(err);
        });
        child.on("close", (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error(stderr.trim() || `Postgres command exited with ${code}`));
        });
        child.stdin.end(sql);
    });
}
function runPostgresSync(sql) {
    const command = postgresCliCommand();
    try {
        return (0, child_process_1.execFileSync)(command.bin, command.args, {
            cwd: (0, path_1.dirname)(postgresComposeFile()),
            encoding: "utf-8",
            input: sql,
            timeout: 30_000,
        });
    }
    catch (err) {
        // execFileSync errors embed the full argv (including the connection URL
        // with password) in the message; rethrow with stderr only.
        const stderr = typeof err?.stderr === "string" ? err.stderr.trim() : "";
        throw new Error(stderr || `Postgres command failed (${graphStoreDescription()})`);
    }
}
function jsonQuerySql(sql) {
    const body = sql.trim().replace(/;+\s*$/, "");
    return `SELECT COALESCE(jsonb_agg(to_jsonb(__daobrew_rows)), '[]'::jsonb)::text FROM (${body}) AS __daobrew_rows;`;
}
async function queryJson(sql) {
    if (graphStoreKind() === "postgres") {
        const out = (await runPostgres(jsonQuerySql(sql))).trim();
        return out ? JSON.parse(out) : [];
    }
    const out = (await runSqlite(["-json"], sql)).trim();
    return out ? JSON.parse(out) : [];
}
async function execSql(sql) {
    if (graphStoreKind() === "postgres") {
        await runPostgres(sql);
        return;
    }
    await runSqlite([], sql);
}
function execSqlSync(sql) {
    if (graphStoreKind() === "postgres")
        return runPostgresSync(sql);
    return (0, child_process_1.execFileSync)("sqlite3", ["-cmd", ".timeout 5000", graphDbPath(), sql], { encoding: "utf-8" });
}
