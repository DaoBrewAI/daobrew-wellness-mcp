"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ENGINE = (0, node_path_1.join)(__dirname, "..", "src", "engine", "run.js");
const CONFIG_UUID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const WIRE_UUID = "8D6C05BD-9220-46F7-822C-23F0F0D2DA41";
const DEVICE_CREDENTIAL = "dbd_engine_identity_fixture_1234567890";
function testTmpRoot() {
    const root = (0, node_path_1.join)(process.cwd(), ".test-tmp", "engine-identity");
    (0, node_fs_1.mkdirSync)(root, { recursive: true });
    return root;
}
function withTempDir(run) {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "case-"));
    try {
        return run(dir);
    }
    finally {
        (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
    }
}
async function withTempDirAsync(run) {
    const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)(testTmpRoot(), "case-"));
    try {
        return await run(dir);
    }
    finally {
        (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
    }
}
function runEngine(args, env) {
    const childEnv = { ...process.env };
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined)
            delete childEnv[key];
        else
            childEnv[key] = value;
    }
    return (0, node_child_process_1.spawnSync)(process.execPath, [ENGINE, ...args], {
        cwd: (0, node_path_1.join)(__dirname, "..", ".."),
        env: childEnv,
        encoding: "utf-8",
    });
}
function installCurlCapture(dir) {
    const captureFile = (0, node_path_1.join)(dir, "curl-args.jsonl");
    const script = (0, node_path_1.join)(dir, "curl");
    (0, node_fs_1.writeFileSync)(script, `#!/usr/bin/env node
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
    (0, node_fs_1.chmodSync)(script, 0o755);
    return { path: dir, captureFile };
}
(0, node_test_1.describe)("engine CLI identity resolution", () => {
    (0, node_test_1.it)("fails closed with exit 2 when config and env do not provide identity", () => {
        withTempDir((dir) => {
            const configFile = (0, node_path_1.join)(dir, "config.json");
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({ api_url: "http://127.0.0.1:1/api/v1" }));
            const result = runEngine(["--once"], {
                DAOBREW_CONFIG_FILE: configFile,
                DAOBREW_GRAPH_STORE: "sqlite",
                DAOBREW_GRAPH_DB: (0, node_path_1.join)(dir, "graph.db"),
                DAOBREW_USER_ID: undefined,
                DAOBREW_API_KEY: undefined,
            });
            assert.equal(result.status, 2);
            assert.match(result.stderr, /"status":\s*"skipped"/);
            assert.match(result.stderr, /no canonical UUID identity/);
        });
    });
    (0, node_test_1.it)("rejects literal local even when it is supplied explicitly", () => {
        withTempDir((dir) => {
            const configFile = (0, node_path_1.join)(dir, "config.json");
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({ user_id: CONFIG_UUID }));
            const result = runEngine(["--once", "--user-id=local"], {
                DAOBREW_CONFIG_FILE: configFile,
                DAOBREW_GRAPH_STORE: "sqlite",
                DAOBREW_GRAPH_DB: (0, node_path_1.join)(dir, "graph.db"),
                DAOBREW_API_KEY: undefined,
            });
            assert.equal(result.status, 2);
            assert.match(result.stderr, /no canonical UUID identity/);
        });
    });
    (0, node_test_1.it)("removes the legacy --device-id flag from help", () => {
        const result = runEngine(["--help"], {});
        assert.equal(result.status, 0);
        assert.doesNotMatch(result.stdout, /--device-id/);
    });
    (0, node_test_1.it)("keeps local UUID graph scope separate from bearer-owned backend auth", () => {
        withTempDir((dir) => {
            const configFile = (0, node_path_1.join)(dir, "config.json");
            (0, node_fs_1.writeFileSync)(configFile, JSON.stringify({
                user_id: WIRE_UUID,
                device_credential: DEVICE_CREDENTIAL,
                api_url: "https://capture.example.test/api/v1",
            }));
            const curl = installCurlCapture(dir);
            const result = runEngine(["--once", "--dry-run"], {
                DAOBREW_CONFIG_FILE: configFile,
                DAOBREW_API_URL: "https://attacker.example.test/api/v1",
                DAOBREW_GRAPH_STORE: "sqlite",
                DAOBREW_GRAPH_DB: (0, node_path_1.join)(dir, "graph.db"),
                DAOBREW_API_KEY: undefined,
                CURL_CAPTURE_FILE: curl.captureFile,
                PATH: `${curl.path}:${process.env.PATH}`,
            });
            assert.equal(result.status, 0, result.stderr);
            assert.ok((0, node_fs_1.existsSync)(curl.captureFile), "engine should call the backend client");
            const calls = (0, node_fs_1.readFileSync)(curl.captureFile, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
            assert.ok(calls.length > 0, "engine should call the backend client");
            for (const call of calls) {
                assert.ok(call.args.at(-1)?.startsWith("https://capture.example.test/api/v1/"), `persisted credential was rebound to an environment URL: ${JSON.stringify(call.args)}`);
                assert.ok(!call.args.some((arg) => /X-Device-ID|Authorization: Bearer/.test(arg)), `identity leaked in argv: ${JSON.stringify(call.args)}`);
                assert.equal(call.headerInput, `Authorization: Bearer ${DEVICE_CREDENTIAL}\n`);
                assert.equal(call.headerMode, 0o600);
                const headerArg = call.args.find((arg, index) => call.args[index - 1] === "-H" && arg.startsWith("@"));
                assert.ok(headerArg);
                assert.equal((0, node_fs_1.existsSync)(headerArg.slice(1)), false, "private header file should be removed after curl exits");
            }
        });
    });
});
