"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const graph_db_js_1 = require("../src/graph-db.js");
/**
 * Point DAOBREW_CONFIG_FILE at a temp file to prove graph-db never consumes a
 * client-stored database URL.
 */
function withConfigFile(t, config) {
    const prevConfigFile = process.env.DAOBREW_CONFIG_FILE;
    const prevUrl = process.env.DAOBREW_POSTGRES_URL;
    const prevStore = process.env.DAOBREW_GRAPH_STORE;
    let dir = null;
    if (config === null) {
        process.env.DAOBREW_CONFIG_FILE = "/nonexistent/daobrew-test-config.json";
    }
    else {
        dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "daobrew-graphdb-test-"));
        const file = (0, node_path_1.join)(dir, "config.json");
        (0, node_fs_1.writeFileSync)(file, JSON.stringify(config));
        process.env.DAOBREW_CONFIG_FILE = file;
    }
    (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
    t.after(() => {
        if (prevConfigFile === undefined)
            delete process.env.DAOBREW_CONFIG_FILE;
        else
            process.env.DAOBREW_CONFIG_FILE = prevConfigFile;
        if (prevUrl === undefined)
            delete process.env.DAOBREW_POSTGRES_URL;
        else
            process.env.DAOBREW_POSTGRES_URL = prevUrl;
        if (prevStore === undefined)
            delete process.env.DAOBREW_GRAPH_STORE;
        else
            process.env.DAOBREW_GRAPH_STORE = prevStore;
        (0, graph_db_js_1.__resetGraphDbConfigCacheForTests)();
        if (dir)
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
    });
}
(0, node_test_1.test)("client config postgres_url is ignored when server env is absent", (t) => {
    withConfigFile(t, { postgres_url: "postgresql://u:cfg-secret@cfg-host.neon.tech/neondb?sslmode=require" });
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_GRAPH_STORE;
    node_assert_1.default.equal((0, graph_db_js_1.resolvedPostgresUrl)(), undefined);
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreKind)(), "sqlite");
    node_assert_1.default.ok(!(0, graph_db_js_1.graphStoreDescription)().includes("cfg-secret"));
    const args = (0, graph_db_js_1.postgresCliArgs)();
    node_assert_1.default.equal(args[0], "compose");
    node_assert_1.default.ok(!args.some((a) => a.includes("cfg-host.neon.tech")));
});
(0, node_test_1.test)("env URL wins over config postgres_url", (t) => {
    withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
    delete process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:x@env-host/envdb";
    node_assert_1.default.equal((0, graph_db_js_1.resolvedPostgresUrl)(), "postgresql://u:x@env-host/envdb");
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreDescription)(), "postgres:env-host/envdb");
    const args = (0, graph_db_js_1.postgresCliArgs)();
    node_assert_1.default.ok(args.some((a) => a.includes("env-host")));
    node_assert_1.default.ok(!args.some((a) => a.includes("cfg-host")));
});
(0, node_test_1.test)("explicit DAOBREW_GRAPH_STORE=sqlite stays local despite retired client config", (t) => {
    withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
    delete process.env.DAOBREW_POSTGRES_URL;
    process.env.DAOBREW_GRAPH_STORE = "sqlite";
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreKind)(), "sqlite");
    node_assert_1.default.ok(!(0, graph_db_js_1.graphStoreDescription)().startsWith("postgres:"));
});
(0, node_test_1.test)("empty-string env URL does not fall through to client config", (t) => {
    withConfigFile(t, { postgres_url: "postgresql://u:x@cfg-host/cfgdb" });
    delete process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_POSTGRES_URL = "   ";
    node_assert_1.default.equal((0, graph_db_js_1.resolvedPostgresUrl)(), undefined);
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreKind)(), "sqlite");
});
(0, node_test_1.test)("no env URL and no config file: sqlite", (t) => {
    withConfigFile(t, null);
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_GRAPH_STORE;
    node_assert_1.default.equal((0, graph_db_js_1.resolvedPostgresUrl)(), undefined);
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreKind)(), "sqlite");
});
(0, node_test_1.test)("empty/whitespace config postgres_url is treated as unset", (t) => {
    withConfigFile(t, { postgres_url: "  " });
    delete process.env.DAOBREW_POSTGRES_URL;
    delete process.env.DAOBREW_GRAPH_STORE;
    node_assert_1.default.equal((0, graph_db_js_1.resolvedPostgresUrl)(), undefined);
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreKind)(), "sqlite");
});
(0, node_test_1.test)("URL mode: docker run psql with the connection string", (t) => {
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
    });
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:secret@ep-x-pooler.aws.neon.tech/neondb?sslmode=require";
    const args = (0, graph_db_js_1.postgresCliArgs)();
    node_assert_1.default.equal(args[0], "run");
    node_assert_1.default.ok(args.includes("psql"));
    node_assert_1.default.ok(args.some((a) => a.includes("ep-x-pooler")));
    node_assert_1.default.ok(args.includes("-At"));
});
(0, node_test_1.test)("compose mode unchanged when URL unset (and no config fallback)", (t) => {
    withConfigFile(t, null);
    delete process.env.DAOBREW_POSTGRES_URL;
    const args = (0, graph_db_js_1.postgresCliArgs)();
    node_assert_1.default.equal(args[0], "compose");
});
(0, node_test_1.test)("description never leaks credentials", (t) => {
    const prevStore = process.env.DAOBREW_GRAPH_STORE;
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        if (prevStore === undefined)
            delete process.env.DAOBREW_GRAPH_STORE;
        else
            process.env.DAOBREW_GRAPH_STORE = prevStore;
    });
    delete process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:secret@host/db";
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreDescription)(), "postgres:host/db");
    node_assert_1.default.ok(!(0, graph_db_js_1.graphStoreDescription)().includes("secret"));
});
(0, node_test_1.test)("description falls back to redacted marker when URL is unparseable", (t) => {
    const prevStore = process.env.DAOBREW_GRAPH_STORE;
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        if (prevStore === undefined)
            delete process.env.DAOBREW_GRAPH_STORE;
        else
            process.env.DAOBREW_GRAPH_STORE = prevStore;
    });
    delete process.env.DAOBREW_GRAPH_STORE;
    process.env.DAOBREW_POSTGRES_URL = "://bad";
    node_assert_1.default.equal((0, graph_db_js_1.graphStoreDescription)(), "postgres:<redacted>");
});
(0, node_test_1.test)("sync error path never leaks the connection URL password", (t) => {
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        delete process.env.DAOBREW_POSTGRES_IMAGE;
    });
    const password = "s3kr1t-canary-pw";
    process.env.DAOBREW_POSTGRES_URL = `postgresql://u:${password}@unreachable-host.invalid/db`;
    // Invalid image reference (spaces/uppercase) makes docker fail immediately
    // without any network pull, so the real catch path in runPostgresSync fires.
    process.env.DAOBREW_POSTGRES_IMAGE = "INVALID IMAGE NAME";
    node_assert_1.default.throws(() => (0, graph_db_js_1.execSqlSync)("SELECT 1"), (err) => {
        node_assert_1.default.ok(err instanceof Error);
        node_assert_1.default.ok(!err.message.includes(password), `error message leaked the password: ${err.message}`);
        return true;
    });
});
(0, node_test_1.test)("DAOBREW_PSQL_BIN=psql switches URL mode to a native psql argv", (t) => {
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        delete process.env.DAOBREW_PSQL_BIN;
    });
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
    process.env.DAOBREW_PSQL_BIN = "psql";
    node_assert_1.default.deepEqual((0, graph_db_js_1.postgresCliCommand)(), {
        bin: "psql",
        args: ["postgresql://u:p@h/db", "-v", "ON_ERROR_STOP=1", "-At"],
    });
});
(0, node_test_1.test)("unset DAOBREW_PSQL_BIN keeps the docker run argv byte-identical", (t) => {
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        delete process.env.DAOBREW_PSQL_BIN;
    });
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
    delete process.env.DAOBREW_PSQL_BIN;
    node_assert_1.default.deepEqual((0, graph_db_js_1.postgresCliCommand)(), { bin: "docker", args: (0, graph_db_js_1.postgresCliArgs)() });
    node_assert_1.default.equal((0, graph_db_js_1.postgresCliCommand)().args[0], "run");
});
(0, node_test_1.test)("blank DAOBREW_PSQL_BIN is treated as unset", (t) => {
    t.after(() => {
        delete process.env.DAOBREW_POSTGRES_URL;
        delete process.env.DAOBREW_PSQL_BIN;
    });
    process.env.DAOBREW_POSTGRES_URL = "postgresql://u:p@h/db";
    process.env.DAOBREW_PSQL_BIN = "   ";
    node_assert_1.default.equal((0, graph_db_js_1.postgresCliCommand)().bin, "docker");
});
(0, node_test_1.test)("compose mode stays docker even when DAOBREW_PSQL_BIN is set", (t) => {
    withConfigFile(t, null);
    t.after(() => {
        delete process.env.DAOBREW_PSQL_BIN;
    });
    delete process.env.DAOBREW_POSTGRES_URL;
    process.env.DAOBREW_PSQL_BIN = "psql";
    const command = (0, graph_db_js_1.postgresCliCommand)();
    node_assert_1.default.equal(command.bin, "docker");
    node_assert_1.default.equal(command.args[0], "compose");
});
