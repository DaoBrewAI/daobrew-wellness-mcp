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
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const CLIENT_SCRIPT = (0, node_path_1.join)(__dirname, "..", "..", "scripts", "granola-mcp-client.mjs");
// --non-interactive is the daemon/headless contract: when a login would be
// required (no valid cached token), the client must FAIL FAST with a non-zero
// exit instead of spinning up the OAuth callback server and hanging forever.
// A short subprocess timeout is the assertion that it never blocks on that
// server: if getToken fell through to login(), the callback server would keep
// the process alive past the timeout and execFileSync would kill it with a
// signal (status null) instead of the expected clean non-zero exit.
(0, node_test_1.describe)("granola-mcp-client --non-interactive", () => {
    (0, node_test_1.it)("fails fast (non-zero exit, no login) when no cached token exists", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "granola-mcp-noninteractive-"));
        const tokenFile = (0, node_path_1.join)(dir, "does-not-exist-token.json");
        let threw = false;
        try {
            (0, node_child_process_1.execFileSync)(process.execPath, [CLIENT_SCRIPT, "--list-tools", "--non-interactive", "--token-file", tokenFile], { encoding: "utf-8", timeout: 8000, stdio: "pipe" });
        }
        catch (err) {
            threw = true;
            // Clean non-zero exit (numeric status), NOT a timeout kill (signal set).
            assert.strictEqual(err.signal, null, `expected clean non-zero exit, got signal ${err.signal}`);
            assert.strictEqual(typeof err.status, "number");
            assert.notStrictEqual(err.status, 0);
            const stderr = String(err.stderr ?? "");
            assert.match(stderr, /non-interactive/i);
            assert.match(stderr, /login/i);
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
        assert.ok(threw, "expected the client to exit non-zero under --non-interactive");
    });
});
