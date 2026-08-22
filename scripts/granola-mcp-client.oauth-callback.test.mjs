import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, startCallbackServer } from "./granola-mcp-client.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

// Mirror the installed-runtime layout: the ingest daemon invokes scripts
// through the ~/Library/.../engine/current SYMLINK, never the real path.
function runViaSymlink(scriptRelPath, args) {
  const tmpRoot = join(packageDir, ".test-tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const tmp = mkdtempSync(join(tmpRoot, "daobrew-symlink-guard-"));
  try {
    const link = join(tmp, "current");
    symlinkSync(packageDir, link);
    return spawnSync(process.execPath, [join(link, scriptRelPath), ...args], { encoding: "utf8" });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function withoutRedirectPortEnv(fn) {
  const saved = process.env.GRANOLA_MCP_REDIRECT_PORT;
  delete process.env.GRANOLA_MCP_REDIRECT_PORT;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GRANOLA_MCP_REDIRECT_PORT;
    else process.env.GRANOLA_MCP_REDIRECT_PORT = saved;
  }
}

async function occupyEphemeralPort() {
  const fake = createFakeServerFactory();
  const callback = await startCallbackServer(0, "unused", fake.createServer);
  return callback.server;
}

function createFakeServerFactory({ assignedPort = 49152, listenError = null } = {}) {
  let server = null;
  return {
    createServer(handler) {
      const listeners = new Map();
      server = {
        closed: false,
        handler,
        on(event, listener) {
          listeners.set(event, listener);
          return server;
        },
        listen(port, _host, callback) {
          if (listenError) {
            queueMicrotask(() => listeners.get("error")?.(listenError));
            return server;
          }
          server.port = port === 0 ? assignedPort : port;
          queueMicrotask(callback);
          return server;
        },
        address() {
          return { port: server.port };
        },
        close(callback) {
          server.closed = true;
          if (callback) queueMicrotask(callback);
          return server;
        },
      };
      return server;
    },
    get server() {
      return server;
    },
  };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function dispatchFakeCallback(server, path) {
  const req = { url: path };
  const response = { status: 0, headers: {}, body: "" };
  const res = {
    writeHead(status, headers = {}) {
      response.status = status;
      response.headers = headers;
      return res;
    },
    end(chunk = "") {
      response.body += String(chunk);
      return res;
    },
  };
  server.handler(req, res);
  return response;
}

test("default callback port is ephemeral so a busy 8787 (internal server) cannot break login", async () => {
  // The regression: the internal engine server holds 8787, and the old default
  // callback port was 8787, so --login always died with EADDRINUSE.
  const blocker = await occupyEphemeralPort();
  try {
    const defaultPort = withoutRedirectPortEnv(() => parseArgs([]).port);
    assert.equal(defaultPort, 0, "default port must be 0 (OS-assigned), not a fixed port");

    const fake = createFakeServerFactory({ assignedPort: 49200 });
    const callback = await startCallbackServer(defaultPort, "state-xyz", fake.createServer);
    try {
      assert.ok(Number.isInteger(callback.port) && callback.port > 0, "must bind a real nonzero port");
      assert.notEqual(callback.port, blocker.address().port, "must not collide with the occupied port");
    } finally {
      await closeServer(callback.server);
    }
  } finally {
    await closeServer(blocker);
  }
});

test("callback round-trip resolves the authorization code with HTTP 200", async () => {
  const fake = createFakeServerFactory();
  const callback = await startCallbackServer(0, "state-abc", fake.createServer);
  try {
    const response = dispatchFakeCallback(callback.server, "/callback?state=state-abc&code=abc123");
    assert.equal(response.status, 200);
    assert.equal(await callback.code, "abc123");
  } finally {
    await closeServer(callback.server);
  }
});

test("state mismatch responds 400 and rejects the code promise", async () => {
  const fake = createFakeServerFactory();
  const callback = await startCallbackServer(0, "state-good", fake.createServer);
  try {
    const rejection = assert.rejects(callback.code, /state mismatch/);
    const response = dispatchFakeCallback(callback.server, "/callback?state=state-evil&code=abc123");
    assert.equal(response.status, 400);
    await rejection;
  } finally {
    await closeServer(callback.server);
  }
});

test("--port and GRANOLA_MCP_REDIRECT_PORT overrides are honored verbatim", () => {
  assert.equal(withoutRedirectPortEnv(() => parseArgs(["--port", "8899"]).port), 8899);

  const saved = process.env.GRANOLA_MCP_REDIRECT_PORT;
  process.env.GRANOLA_MCP_REDIRECT_PORT = "8898";
  try {
    assert.equal(parseArgs([]).port, 8898);
  } finally {
    if (saved === undefined) delete process.env.GRANOLA_MCP_REDIRECT_PORT;
    else process.env.GRANOLA_MCP_REDIRECT_PORT = saved;
  }
});

test("--port above 65535 fails --port validation instead of ERR_SOCKET_BAD_PORT", () => {
  assert.throws(() => withoutRedirectPortEnv(() => parseArgs(["--port", "65536"])), /Invalid --port/);
});

test("CLI guard: main() runs when granola-mcp-client.mjs is invoked through a symlink", () => {
  // Regression: Node realpath-resolves the main module's import.meta.url but
  // process.argv[1] keeps the symlinked spelling, so a guard comparing
  // pathToFileURL(process.argv[1]) directly never matches under engine/current
  // and main() silently no-ops (exit 0, empty stdout).
  const result = runViaSymlink("scripts/granola-mcp-client.mjs", ["--help"]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(
    result.stdout,
    /Usage:/,
    "main() must run (print usage) when invoked via symlink; empty stdout means the CLI guard did not recognize the main module",
  );
});

test("CLI guard: main() runs when backfill-granola-transcripts.mjs is invoked through a symlink", () => {
  const result = runViaSymlink("scripts/backfill-granola-transcripts.mjs", ["--help"]);
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.match(result.stdout, /Usage:/, "backfill main() must run when invoked via symlink");
});

test("an explicitly pinned busy port still fails loudly instead of silently rebinding", async () => {
  const err = new Error("address already in use");
  err.code = "EADDRINUSE";
  const fake = createFakeServerFactory({ listenError: err });
  await assert.rejects(
    startCallbackServer(8787, "state-xyz", fake.createServer),
    (caught) => caught?.code === "EADDRINUSE",
  );
});
