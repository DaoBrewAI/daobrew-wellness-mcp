import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { spawnSync } from "node:child_process";
import { loadConfirmedTaskMapOwnerSync } from "../src/identity.js";

const nodeRequire = createRequire(__filename);
const cli = nodeRequire("../src/setup-cli.js");
const setupCliPath = nodeRequire.resolve("../src/setup-cli.js");
const cliAnchorEnrollmentPath = join(__dirname, "..", "src", "cli-anchor-enrollment.js");
const packageRoot = join(__dirname, "..", "..");

const originalFetch = globalThis.fetch;
const originalArgv = process.argv;
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const savedEnv = { ...process.env };

function tempRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function loadCliForCurrentUserHome(home: string): typeof cli {
  const originalLoad = (Module as any)._load;
  delete nodeRequire.cache[setupCliPath];
  (Module as any)._load = function patchedLoad(
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
  ) {
    if (request === "node:os") {
      const actual = originalLoad.call(this, request, parent, isMain);
      return {
        ...actual,
        userInfo: () => ({ ...actual.userInfo(), homedir: home }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return nodeRequire("../src/setup-cli.js");
  } finally {
    (Module as any)._load = originalLoad;
    delete nodeRequire.cache[setupCliPath];
  }
}

describe("daobrew CLI setup/sync/install", () => {
  beforeEach(() => {
    process.argv = ["node", "/tmp/daobrew&cli"];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.argv = originalArgv;
    if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
    restoreEnv();
  });

  it("setup registers the CLI anchor and confirms the returned device credential", async () => {
    const root = tempRoot("daobrew-cli-setup-");
    process.env.DAOBREW_CONFIG_FILE = join(root, ".daobrew", "config.json");
    process.env.DAOBREW_API_URL = "https://api.example.test/api/v1";
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (input, init = {}) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/device/register-anchor")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              api_url: "https://api.example.test/api/v1",
              user_id: "11111111-1111-4111-8111-111111111111",
              device_id: "22222222-2222-4222-8222-222222222222",
              device_credential: "dbd_confirmed_cli_credential_1234567890",
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            status: "confirmed",
            user_id: "33333333-3333-4333-8333-333333333333",
            device_id: "22222222-2222-4222-8222-222222222222",
          },
        }),
      } as Response;
    }) as typeof fetch;

    try {
      await cli.setupCli();
      const register = JSON.parse(String(calls[0].init.body));
      assert.equal(calls[0].url, "https://api.example.test/api/v1/device/register-anchor");
      assert.equal(register.surface, "cli");
      assert.equal(calls[1].url, "https://api.example.test/api/v1/device/confirm");
      assert.equal((calls[1].init.headers as Record<string, string>).authorization, "Bearer dbd_confirmed_cli_credential_1234567890");
      const confirmed = JSON.parse(String(calls[1].init.body));
      assert.equal(confirmed.installation_nonce, register.installation_nonce);
      const config = JSON.parse(readFileSync(process.env.DAOBREW_CONFIG_FILE, "utf8"));
      assert.equal(config.device_credential, "dbd_confirmed_cli_credential_1234567890");
      assert.equal(config.device_credential_confirmed, true);
      assert.equal(config.user_id, "33333333-3333-4333-8333-333333333333");
      assert.equal(config.device_id, "22222222-2222-4222-8222-222222222222");
      const owner = loadConfirmedTaskMapOwnerSync(root);
      assert.equal(owner.ok, true);
      if (owner.ok) {
        assert.equal(owner.owner.userId, "33333333-3333-4333-8333-333333333333");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("setup re-confirms the resident credential when its canonical owner is missing", async () => {
    const root = tempRoot("daobrew-cli-half-written-");
    const configPath = join(root, ".daobrew", "config.json");
    process.env.DAOBREW_CONFIG_FILE = configPath;
    process.env.DAOBREW_API_URL = "https://override.example.test/api/v1";
    mkdirSync(join(root, ".daobrew"), { mode: 0o700 });
    writeFileSync(configPath, JSON.stringify({
      api_url: "https://api.example.test/api/v1",
      device_credential: "dbd_half_written_cli_credential_1234567890",
      device_credential_confirmed: true,
      installation_nonce: "dbi_cli_half_written_nonce_12345678901234567890",
    }), { mode: 0o600 });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            status: "confirmed",
            user_id: "11111111-1111-4111-8111-111111111111",
            device_id: "22222222-2222-4222-8222-222222222222",
          },
        }),
      } as Response;
    }) as typeof fetch;

    try {
      await cli.setupCli();
      assert.deepEqual(calls.map((call) => call.url), [
        "https://api.example.test/api/v1/device/confirm",
      ]);
      assert.equal(
        (calls[0].init?.headers as Record<string, string>).authorization,
        "Bearer dbd_half_written_cli_credential_1234567890",
      );
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      assert.equal(config.device_credential, "dbd_half_written_cli_credential_1234567890");
      assert.equal(config.device_credential_confirmed, true);
      assert.equal(config.api_url, "https://api.example.test/api/v1");
      assert.equal(config.user_id, "11111111-1111-4111-8111-111111111111");
      assert.equal(config.device_id, "22222222-2222-4222-8222-222222222222");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("setup delegates first-device enrollment to the shared CLI enrollment helper", async () => {
    const root = tempRoot("daobrew-cli-shared-");
    process.env.DAOBREW_CONFIG_FILE = join(root, "config.json");
    process.env.DAOBREW_API_URL = "https://api.example.test/api/v1";
    const originalLoad = (Module as any)._load;
    const calls: any[] = [];
    delete nodeRequire.cache[setupCliPath];
    (Module as any)._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean) {
      const resolved = parent ? (Module as any)._resolveFilename(request, parent) : request;
      if (resolved === cliAnchorEnrollmentPath) {
        return {
          canonicalUserId: () => null,
          setupCliAnchorEnrollment: async (options: any) => {
            calls.push(options);
            options.writeConfig({
              ...options.existing,
              api_url: options.apiUrl,
              user_id: "11111111-1111-4111-8111-111111111111",
              device_id: "22222222-2222-4222-8222-222222222222",
              device_credential: "dbd_shared_cli_credential_1234567890",
              device_credential_confirmed: true,
              installation_nonce: options.installationNonce,
            });
          },
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const freshCli = nodeRequire("../src/setup-cli.js");
      await freshCli.setupCli();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].surface, "cli");
      assert.equal(calls[0].apiUrl, "https://api.example.test/api/v1");
      assert.match(calls[0].userId, /^[0-9A-F-]{36}$/);
      assert.match(calls[0].installationNonce, /^dbi_cli_/);
      const config = JSON.parse(readFileSync(process.env.DAOBREW_CONFIG_FILE, "utf8"));
      assert.equal(config.device_credential, "dbd_shared_cli_credential_1234567890");
      assert.equal(config.device_credential_confirmed, true);
      assert.equal(config.user_id, "11111111-1111-4111-8111-111111111111");
    } finally {
      (Module as any)._load = originalLoad;
      delete nodeRequire.cache[setupCliPath];
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sync-memory parses Claude and Codex fixture transcripts and posts normalized rows", async () => {
    const root = tempRoot("daobrew-cli-sync-");
    const home = join(root, "home");
    const project = join(root, "project");
    const claudeDir = join(home, ".claude", "projects", project.replace(/[^A-Za-z0-9]/g, "-"));
    const codexDir = join(home, ".codex", "sessions", "2026", "07");
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(claudeDir, "claude.jsonl"), [
      JSON.stringify({ timestamp: "2026-07-22T00:00:00Z", type: "user", message: { role: "user", content: "remember cli setup" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "setup remembered" } }),
    ].join("\n"));
    writeFileSync(join(codexDir, "codex.jsonl"), [
      JSON.stringify({ type: "turn_context", payload: { cwd: project } }),
      JSON.stringify({ timestamp: "2026-07-22T01:00:00Z", type: "response_item", payload: { type: "message", role: "user", content: "sync memory" } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: "memory synced" } }),
    ].join("\n"));
    process.env.DAOBREW_CONFIG_FILE = join(root, "config.json");
    process.env.DAOBREW_MEMORY_HOME = home;
    writeFileSync(process.env.DAOBREW_CONFIG_FILE, JSON.stringify({
      api_url: "https://api.example.test/api/v1",
      device_credential: "dbd_cli_sync_credential_1234567890",
    }));
    const posted: any[] = [];
    globalThis.fetch = (async (_input, init = {}) => {
      posted.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }) as typeof fetch;
    const fixedCli = loadCliForCurrentUserHome(join(root, "current-user-home"));

    try {
      await fixedCli.syncMemory();
      assert.equal(posted.length, 1);
      assert.equal(posted[0].rows.length, 2);
      assert.ok(posted[0].rows.every((row: any) => Array.isArray(row.topics_json)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sync-memory fails closed before reading credentials or posting while migration fence exists", async () => {
    const root = tempRoot("daobrew-cli-fence-");
    const home = join(root, "home");
    const marker = join(home, ".daobrew", "gcp-migration-writer-fence.json");
    mkdirSync(join(home, ".daobrew"), { recursive: true });
    writeFileSync(marker, JSON.stringify({ state: "fenced" }));
    process.env.DAOBREW_CONFIG_FILE = join(root, "missing-config.json");
    globalThis.fetch = (async () => {
      assert.fail("writer fence must block before network access");
    }) as typeof fetch;

    try {
      const fixedCli = loadCliForCurrentUserHome(home);
      await assert.rejects(
        () => fixedCli.syncMemory(),
        /migration writer fence is active/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sync-memory fails closed for a dangling migration fence symlink", async () => {
    const root = tempRoot("daobrew-cli-dangling-fence-");
    const home = join(root, "home");
    const marker = join(home, ".daobrew", "gcp-migration-writer-fence.json");
    mkdirSync(join(home, ".daobrew"), { recursive: true });
    symlinkSync(join(root, "missing-fence-target"), marker);
    process.env.DAOBREW_CONFIG_FILE = join(root, "missing-config.json");
    globalThis.fetch = (async () => {
      assert.fail("writer fence must block before network access");
    }) as typeof fetch;

    try {
      const fixedCli = loadCliForCurrentUserHome(home);
      await assert.rejects(
        () => fixedCli.syncMemory(),
        /migration writer fence is active/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("sync-memory holds a migration writer lease through the network write", async () => {
    const root = tempRoot("daobrew-cli-writer-lease-");
    const home = join(root, "home");
    const leaseDirectory = join(home, ".daobrew", "gcp-migration-writer-leases");
    const memoryHome = join(root, "memory");
    const project = join(root, "project");
    const codexDir = join(memoryHome, ".codex", "sessions", "2026", "07");
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(join(codexDir, "codex.jsonl"), [
      JSON.stringify({ type: "turn_context", payload: { cwd: project } }),
      JSON.stringify({ timestamp: "2026-07-22T01:00:00Z", type: "response_item", payload: { type: "message", role: "user", content: "sync memory" } }),
    ].join("\n"));
    process.env.DAOBREW_CONFIG_FILE = join(root, "config.json");
    process.env.DAOBREW_MEMORY_HOME = memoryHome;
    writeFileSync(process.env.DAOBREW_CONFIG_FILE, JSON.stringify({
      api_url: "https://api.example.test/api/v1",
      device_credential: "dbd_writer_lease_credential_1234567890",
    }));
    let observedLease = false;
    globalThis.fetch = (async () => {
      observedLease = readdirSync(leaseDirectory).length === 1;
      return { ok: true, status: 200 } as Response;
    }) as typeof fetch;
    const fixedCli = loadCliForCurrentUserHome(home);

    try {
      await fixedCli.syncMemory();
      assert.equal(observedLease, true);
      assert.deepEqual(readdirSync(leaseDirectory), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the committed package bin ignores migration fence environment redirects", () => {
    const root = tempRoot("daobrew-dist-cli-fence-");
    const marker = join(root, "gcp-migration-writer-fence.json");
    symlinkSync(join(root, "missing-fence-target"), marker);
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    );
    const packageBin = join(packageRoot, packageJson.bin.daobrew);

    try {
      const result = spawnSync(process.execPath, [packageBin, "sync-memory"], {
        encoding: "utf8",
        env: {
          ...process.env,
          DAOBREW_MIGRATION_WRITER_FENCE_PATH: marker,
          DAOBREW_CONFIG_FILE: join(root, "missing-config.json"),
        },
      });
      assert.equal(result.status, 1);
      assert.doesNotMatch(result.stderr, /migration writer fence is active/i);
      assert.match(
        result.stderr,
        /missing confirmed .* credential|writer lease/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("production exports cannot inject fence, lease, config, or network dependencies", () => {
    process.env.DAOBREW_MIGRATION_WRITER_FENCE_PATH = "/tmp/redirected-fence";

    assert.equal((cli as any).__testing, undefined);
    assert.equal(cli.syncMemory.length, 0);
    assert.deepEqual(
      Object.keys(cli).sort(),
      ["installAgent", "main", "setupCli", "syncMemory", "xmlEscape"].sort(),
    );
    assert.equal(userInfo().homedir.length > 0, true);
  });

  it("the committed package bin is rebuilt from the setup CLI source", () => {
    assert.equal(
      readFileSync(join(packageRoot, "dist", "src", "setup-cli.js"), "utf8"),
      readFileSync(join(packageRoot, "src", "setup-cli.js"), "utf8"),
    );
  });

  it("install-agent writes escaped launchd plist on macOS and prints cron recipe elsewhere", () => {
    const root = tempRoot("daobrew-cli-agent-");
    process.env.DAOBREW_LAUNCH_AGENTS_DIR = join(root, "LaunchAgents");
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      cli.installAgent();
      const plist = readFileSync(join(root, "LaunchAgents", "app.daobrew.cli-memory.plist"), "utf8");
      assert.match(plist, /StartInterval<\/key><integer>600/);
      assert.match(plist, /StandardOutPath/);
      assert.match(plist, /daobrew&amp;cli/);

      Object.defineProperty(process, "platform", { value: "linux" });
      const lines: string[] = [];
      const originalLog = console.log;
      console.log = (line: string) => lines.push(line);
      try {
        cli.installAgent();
      } finally {
        console.log = originalLog;
      }
      assert.match(lines.join("\n"), /\*\/10 \* \* \* \*/);
      assert.match(lines.join("\n"), /sync-memory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
