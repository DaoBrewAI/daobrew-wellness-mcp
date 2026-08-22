import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENGINE = join(__dirname, "..", "src", "engine", "run.js");
const CONFIG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const WIRE_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const DEVICE_CREDENTIAL = "dbd_engine_identity_fixture_1234567890";

function testTmpRoot(): string {
  const root = join(process.cwd(), ".test-tmp", "engine-identity");
  mkdirSync(root, { recursive: true });
  return root;
}

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(testTmpRoot(), "case-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempDirAsync<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(testTmpRoot(), "case-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runEngine(args: string[], env: Record<string, string | undefined>) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  return spawnSync(process.execPath, [ENGINE, ...args], {
    cwd: join(__dirname, "..", ".."),
    env: childEnv,
    encoding: "utf-8",
  });
}

function installCurlCapture(dir: string): { path: string; captureFile: string } {
  const captureFile = join(dir, "curl-args.jsonl");
  const script = join(dir, "curl");
  writeFileSync(script, `#!/usr/bin/env node
const { appendFileSync, readFileSync, statSync } = require("node:fs");
const args = process.argv.slice(2);
const headerArg = args.find((arg, index) => args[index - 1] === "-H" && arg.startsWith("@"));
if (!headerArg) throw new Error("missing private header file");
const headerPath = headerArg.slice(1);
const headerInput = readFileSync(headerPath, "utf8");
const headerMode = statSync(headerPath).mode & 0o777;
appendFileSync(process.env.CURL_CAPTURE_FILE, JSON.stringify({ args, headerInput, headerMode }) + "\\n");
const url = args[args.length - 1] || "";
let data;
if (url.includes("/healthkit/history")) {
  const parsed = new URL(url);
  data = {
    metric: parsed.searchParams.get("metric") || "heart_rate",
    range: parsed.searchParams.get("range") || "week",
    samples: [],
    aggregated: { avg: 0, min: 0, max: 0 },
  };
} else if (url.includes("/state/history")) {
  data = { states: [], total_count: 0, limit: 24 };
} else {
  console.log(JSON.stringify({ success: false, error: { message: "Unhandled path: " + url } }));
  process.exit(0);
}
console.log(JSON.stringify({ success: true, data }));
`);
  chmodSync(script, 0o755);
  return { path: dir, captureFile };
}

describe("engine CLI identity resolution", () => {
  it("fails closed with exit 2 when config and env do not provide identity", () => {
    withTempDir((dir) => {
      const configFile = join(dir, "config.json");
      writeFileSync(configFile, JSON.stringify({ api_url: "http://127.0.0.1:1/api/v1" }));

      const result = runEngine(["--once"], {
        DAOBREW_CONFIG_FILE: configFile,
        DAOBREW_GRAPH_STORE: "sqlite",
        DAOBREW_GRAPH_DB: join(dir, "graph.db"),
        DAOBREW_USER_ID: undefined,
        DAOBREW_API_KEY: undefined,
      });

      assert.equal(result.status, 2);
      assert.match(result.stderr, /"status":\s*"skipped"/);
      assert.match(result.stderr, /no canonical UUID identity/);
    });
  });

  it("rejects literal local even when it is supplied explicitly", () => {
    withTempDir((dir) => {
      const configFile = join(dir, "config.json");
      writeFileSync(configFile, JSON.stringify({ user_id: CONFIG_UUID }));

      const result = runEngine(["--once", "--user-id=local"], {
        DAOBREW_CONFIG_FILE: configFile,
        DAOBREW_GRAPH_STORE: "sqlite",
        DAOBREW_GRAPH_DB: join(dir, "graph.db"),
        DAOBREW_API_KEY: undefined,
      });

      assert.equal(result.status, 2);
      assert.match(result.stderr, /no canonical UUID identity/);
    });
  });

  it("removes the legacy --device-id flag from help", () => {
    const result = runEngine(["--help"], {});
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /--device-id/);
  });

  it("keeps local UUID graph scope separate from bearer-owned backend auth", () => {
    withTempDir((dir) => {
      const configFile = join(dir, "config.json");
      writeFileSync(configFile, JSON.stringify({
        user_id: WIRE_UUID,
        device_credential: DEVICE_CREDENTIAL,
        api_url: "https://capture.example.test/api/v1",
      }));
      const curl = installCurlCapture(dir);

      const result = runEngine(["--once", "--dry-run"], {
        DAOBREW_CONFIG_FILE: configFile,
        DAOBREW_API_URL: "https://attacker.example.test/api/v1",
        DAOBREW_GRAPH_STORE: "sqlite",
        DAOBREW_GRAPH_DB: join(dir, "graph.db"),
        DAOBREW_API_KEY: undefined,
        CURL_CAPTURE_FILE: curl.captureFile,
        PATH: `${curl.path}:${process.env.PATH}`,
      });

      assert.equal(result.status, 0, result.stderr);
      assert.ok(existsSync(curl.captureFile), "engine should call the backend client");
      const calls = readFileSync(curl.captureFile, "utf-8").trim().split("\n").map((line) => (
        JSON.parse(line) as { args: string[]; headerInput: string; headerMode: number }
      ));
      assert.ok(calls.length > 0, "engine should call the backend client");
      for (const call of calls) {
        assert.ok(
          call.args.at(-1)?.startsWith("https://capture.example.test/api/v1/"),
          `persisted credential was rebound to an environment URL: ${JSON.stringify(call.args)}`,
        );
        assert.ok(!call.args.some((arg) => /X-Device-ID|Authorization: Bearer/.test(arg)), `identity leaked in argv: ${JSON.stringify(call.args)}`);
        assert.equal(call.headerInput, `Authorization: Bearer ${DEVICE_CREDENTIAL}\n`);
        assert.equal(call.headerMode, 0o600);
        const headerArg = call.args.find((arg, index) => call.args[index - 1] === "-H" && arg.startsWith("@"));
        assert.ok(headerArg);
        assert.equal(existsSync(headerArg.slice(1)), false, "private header file should be removed after curl exits");
      }
    });
  });
});
