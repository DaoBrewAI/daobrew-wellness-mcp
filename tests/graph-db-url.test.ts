import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  postgresCliArgs,
  postgresCliCommand,
  graphStoreDescription,
  graphStoreKind,
  resolvedPostgresUrl,
  execSqlSync,
  __resetGraphDbConfigCacheForTests,
} from "../src/graph-db.js";

/**
 * Point DAOBREW_CONFIG_FILE at a temp file to prove graph-db never consumes a
 * client-stored database URL.
 */
function withConfigFile(t: any, config: Record<string, unknown> | null): void {
  const prevConfigFile = process.env.DAOBREW_CONFIG_FILE;
  const prevUrl = process.env.DAOBREW_POSTGRES_URL;
  const prevStore = process.env.DAOBREW_GRAPH_STORE;
  let dir: string | null = null;
  if (config === null) {
    process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";
  } else {
    dir = mkdtempSync(join(tmpdir(), "daobrew-graphdb-test-"));
    const file = join(dir, "config.json");
    writeFileSync(file, JSON.stringify(config));
    process.env.DAOBREW_CONFIG_FILE = file;
  }
  __resetGraphDbConfigCacheForTests();
  t.after(() => {
    if (prevConfigFile === undefined) delete process.env.DAOBREW_CONFIG_FILE;
    else process.env.DAOBREW_CONFIG_FILE = prevConfigFile;
    if (prevUrl === undefined) delete process.env.DAOBREW_POSTGRES_URL;
    else process.env.DAOBREW_POSTGRES_URL = prevUrl;
    if (prevStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = prevStore;
    __resetGraphDbConfigCacheForTests();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
}

test("client config postgres_url is ignored when server env is absent", (t) => {
  withConfigFile(t, { postgres_url: "postgresql://u:cfg-secret@cfg-host.neon.tech/neondb?sslmode=require" });
  delete process.env.DAOBREW_POSTGRES_URL;
  delete process.env.DAOBREW_GRAPH_STORE;
  assert.equal(resolvedPostgresUrl(), undefined);
  assert.equal(graphStoreKind(), "sqlite");
  assert.ok(!graphStoreDescription().includes("cfg-secret"));
  const args = postgresCliArgs();
  assert.equal(args[0], "compose");
  assert.ok(!args.some((a) => a.includes("cfg-host.neon.tech")));
});

test("env URL wins over config postgres_url", (t) => {
  withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
  delete process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:x@env-host/envdb";
  assert.equal(resolvedPostgresUrl(), "postgresql://u:x@env-host/envdb");
  assert.equal(graphStoreDescription(), "postgres:env-host/envdb");
  const args = postgresCliArgs();
  assert.ok(args.some((a) => a.includes("env-host")));
  assert.ok(!args.some((a) => a.includes("cfg-host")));
});

test("explicit DAOBREW_GRAPH_STORE=sqlite stays local despite retired client config", (t) => {
  withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
  delete process.env.DAOBREW_POSTGRES_URL;
  process.env.DAOBREW_GRAPH_STORE = "sqlite";
  assert.equal(graphStoreKind(), "sqlite");
  assert.ok(!graphStoreDescription().startsWith("postgres:"));
});

test("empty-string env URL does not fall through to client config", (t) => {
  withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
  delete process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_POSTGRES_URL = "   ";
  assert.equal(resolvedPostgresUrl(), undefined);
  assert.equal(graphStoreKind(), "sqlite");
});

test("no env URL and no config file: sqlite", (t) => {
  withConfigFile(t, null);
  delete process.env.DAOBREW_POSTGRES_URL;
  delete process.env.DAOBREW_GRAPH_STORE;
  assert.equal(resolvedPostgresUrl(), undefined);
  assert.equal(graphStoreKind(), "sqlite");
});

test("empty/whitespace config postgres_url is treated as unset", (t) => {
  withConfigFile(t, { postgres_url: "  " });
  delete process.env.DAOBREW_POSTGRES_URL;
  delete process.env.DAOBREW_GRAPH_STORE;
  assert.equal(resolvedPostgresUrl(), undefined);
  assert.equal(graphStoreKind(), "sqlite");
});

test("URL mode: docker run psql with the connection string", (t) => {
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
  });
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:secret@ep-x-pooler.aws.neon.tech/neondb?sslmode=require";
  const args = postgresCliArgs();
  assert.equal(args[0], "run");
  assert.ok(args.includes("psql"));
  assert.ok(args.some((a) => a.includes("ep-x-pooler")));
  assert.ok(args.includes("-At"));
});

test("compose mode unchanged when URL unset (and no config fallback)", (t) => {
  withConfigFile(t, null);
  delete process.env.DAOBREW_POSTGRES_URL;
  const args = postgresCliArgs();
  assert.equal(args[0], "compose");
});

test("description never leaks credentials", (t) => {
  const prevStore = process.env.DAOBREW_GRAPH_STORE;
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    if (prevStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = prevStore;
  });
  delete process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:secret@host/db";
  assert.equal(graphStoreDescription(), "postgres:host/db");
  assert.ok(!graphStoreDescription().includes("secret"));
});

test("description falls back to redacted marker when URL is unparseable", (t) => {
  const prevStore = process.env.DAOBREW_GRAPH_STORE;
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    if (prevStore === undefined) delete process.env.DAOBREW_GRAPH_STORE;
    else process.env.DAOBREW_GRAPH_STORE = prevStore;
  });
  delete process.env.DAOBREW_GRAPH_STORE;
  process.env.DAOBREW_POSTGRES_URL = "://bad";
  assert.equal(graphStoreDescription(), "postgres:<redacted>");
});

test("sync error path never leaks the connection URL password", (t) => {
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_POSTGRES_IMAGE;
  });
  const password = "s3kr1t-canary-pw";
  process.env.DAOBREW_POSTGRES_URL = `postgresql://u:${password}@unreachable-host.invalid/db`;
  // Invalid image reference (spaces/uppercase) makes docker fail immediately
  // without any network pull, so the real catch path in runPostgresSync fires.
  process.env.DAOBREW_POSTGRES_IMAGE = "INVALID IMAGE NAME";
  assert.throws(
    () => execSqlSync("SELECT 1"),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.ok(
        !err.message.includes(password),
        `error message leaked the password: ${err.message}`,
      );
      return true;
    },
  );
});

test("DAOBREW_PSQL_BIN=psql switches URL mode to a native psql argv", (t) => {
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_PSQL_BIN;
  });
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
  process.env.DAOBREW_PSQL_BIN = "psql";
  assert.deepEqual(postgresCliCommand(), {
    bin: "psql",
    args: ["postgresql://u:p@h/db", "-v", "ON_ERROR_STOP=1", "-At"],
  });
});

test("unset DAOBREW_PSQL_BIN keeps the docker run argv byte-identical", (t) => {
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_PSQL_BIN;
  });
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
  delete process.env.DAOBREW_PSQL_BIN;
  assert.deepEqual(postgresCliCommand(), { bin: "docker", args: postgresCliArgs() });
  assert.equal(postgresCliCommand().args[0], "run");
});

test("blank DAOBREW_PSQL_BIN is treated as unset", (t) => {
  t.after(() => {
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_PSQL_BIN;
  });
  process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
  process.env.DAOBREW_PSQL_BIN = "   ";
  assert.equal(postgresCliCommand().bin, "docker");
});

test("compose mode stays docker even when DAOBREW_PSQL_BIN is set", (t) => {
  withConfigFile(t, null);
  t.after(() => {
    delete process.env.DAOBREW_PSQL_BIN;
  });
  delete process.env.DAOBREW_POSTGRES_URL;
  process.env.DAOBREW_PSQL_BIN = "psql";
  const command = postgresCliCommand();
  assert.equal(command.bin, "docker");
  assert.equal(command.args[0], "compose");
});
