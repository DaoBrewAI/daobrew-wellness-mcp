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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const llm_station_js_1 = require("../src/engine/taskmap/llm-station.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const local_config_js_1 = require("../src/engine/local-config.js");
const FIXED_NOW = new Date("2026-08-03T12:34:56.789Z");
const INPUT_DIGEST = (0, source_contracts_js_1.taskMapContractDigest)("bounded meeting input");
const PROMPT = "Extract the four supported mention classes.";
function availablePaths(paths) {
    const available = new Set(paths);
    return async (candidate) => available.has(candidate);
}
function resultRunner(result, onRequest) {
    return async (request) => {
        if (request.args.join("\0") === "auth\0status"
            || request.args.join("\0") === "login\0status") {
            return { stdout: "", stderr: "", exitCode: 0 };
        }
        onRequest?.(request);
        return {
            stdout: result.stdout,
            stderr: result.stderr ?? "",
            exitCode: result.exitCode ?? 0,
        };
    };
}
async function rejectionReason(action, reason) {
    let caught;
    try {
        await action();
    }
    catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof llm_station_js_1.LlmStationUnavailableError);
    assert.equal(caught.reason, reason);
    return caught;
}
(0, node_test_1.describe)("Task Map model-output fence stripping", () => {
    const inner = "{\"mentions\":[]}";
    (0, node_test_1.it)("strips one ```json fence with surrounding whitespace", () => {
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)("```json\n" + inner + "\n```"), inner);
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)("  \n```JSON\r\n" + inner + "\r\n``` \n"), inner);
    });
    (0, node_test_1.it)("strips one bare ``` fence", () => {
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)("```\n" + inner + "\n```"), inner);
    });
    (0, node_test_1.it)("returns unfenced output byte-identical", () => {
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)(inner), inner);
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)(" { \"mentions\": [] } "), " { \"mentions\": [] } ");
    });
    (0, node_test_1.it)("strips only one layer and never touches interior fences", () => {
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)("```json\n```json\n" + inner + "\n```\n```"), "```json\n" + inner + "\n```");
        const interior = "{\"mentions\":[{\"text\":\"use ``` in docs\"}]}";
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)("```json\n" + interior + "\n```"), interior);
    });
    (0, node_test_1.it)("leaves non-terminal fences and single-line fences unchanged", () => {
        const trailingGarbage = "```json\n" + inner + "\n```\ntrailing prose";
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)(trailingGarbage), trailingGarbage);
        const singleLine = "```json " + inner + " ```";
        assert.equal((0, llm_station_js_1.stripTaskMapModelOutputFences)(singleLine), singleLine);
    });
});
(0, node_test_1.describe)("Task Map local coding-agent LLM station", () => {
    (0, node_test_1.it)("selects the first available supported provider in deterministic default order", async () => {
        const probes = [];
        const selected = await (0, llm_station_js_1.detectProvider)({
            ownerHome: "/Users/owner",
            pathEnv: "/usr/local/bin:/opt/homebrew/bin",
            isExecutable: async (candidate) => {
                probes.push(candidate);
                return candidate === "/opt/homebrew/bin/claude"
                    || candidate === "/Applications/ChatGPT.app/Contents/Resources/codex";
            },
        });
        assert.deepEqual(selected, {
            transport: "claude-cli",
            executable: "/opt/homebrew/bin/claude",
            args: [
                "-p",
                "--model",
                "claude-haiku-4-5-20251001",
                "--output-format",
                "json",
                "--no-session-persistence",
                "--tools",
                "",
            ],
            model: "claude-haiku-4-5-20251001",
        });
        assert.deepEqual(probes, [
            "/usr/local/bin/claude",
            "/opt/homebrew/bin/claude",
        ]);
    });
    (0, node_test_1.it)("honors provider order and an absolute executable override before PATH", async () => {
        const probes = [];
        const selected = await (0, llm_station_js_1.detectProvider)({
            order: ["codex-cli", "claude-cli"],
            executableOverrides: {
                "codex-cli": "/owner/tools/codex",
            },
            ownerHome: "/Users/owner",
            pathEnv: "/usr/local/bin",
            isExecutable: async (candidate) => {
                probes.push(candidate);
                return candidate === "/owner/tools/codex"
                    || candidate === "/usr/local/bin/claude";
            },
        });
        assert.deepEqual(selected, {
            transport: "codex-cli",
            executable: "/owner/tools/codex",
            args: [
                "exec",
                "--json",
                "--ephemeral",
                "--ignore-user-config",
                "--ignore-rules",
                "--skip-git-repo-check",
                "--model",
                "gpt-5.6-luna",
                "-c",
                'model_reasoning_effort="low"',
                "--disable",
                "shell_tool",
                "--disable",
                "unified_exec",
                "--disable",
                "browser_use",
                "--disable",
                "in_app_browser",
                "--disable",
                "apps",
                "--disable",
                "plugins",
                "--disable",
                "memories",
                "--disable",
                "multi_agent",
                "-c",
                "mcp_servers={}",
                "--sandbox",
                "read-only",
                "-",
            ],
            model: "gpt-5.6-luna",
        });
        assert.deepEqual(probes, ["/owner/tools/codex"]);
    });
    (0, node_test_1.it)("falls back to trusted Claude and Codex locations after PATH candidates", async () => {
        const claude = await (0, llm_station_js_1.detectProvider)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/daemon/bin",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
        });
        const codex = await (0, llm_station_js_1.detectProvider)({
            order: ["codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/daemon/bin",
            isExecutable: availablePaths([
                "/Applications/ChatGPT.app/Contents/Resources/codex",
            ]),
        });
        assert.equal(claude.executable, "/Users/owner/.local/bin/claude");
        assert.equal(codex.executable, "/Applications/ChatGPT.app/Contents/Resources/codex");
    });
    for (const [transport, executable] of [
        ["claude-cli", "/opt/homebrew/bin/claude"],
        ["claude-cli", "/usr/local/bin/claude"],
        ["claude-cli", "/Users/owner/.local/bin/claude"],
        ["codex-cli", "/opt/homebrew/bin/codex"],
        ["codex-cli", "/usr/local/bin/codex"],
        ["codex-cli", "/Users/owner/.local/bin/codex"],
    ]) {
        (0, node_test_1.it)(`discovers ${transport} at ${executable} with an empty GUI PATH`, async () => {
            const selected = await (0, llm_station_js_1.detectProvider)({
                order: [transport],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths([executable]),
            });
            assert.equal(selected.transport, transport);
            assert.equal(selected.executable, executable);
        });
    }
    (0, node_test_1.it)("uses one bounded fixed login-shell probe after direct candidates are absent", async () => {
        const requests = [];
        const selected = await (0, llm_station_js_1.detectProvider)({
            order: ["codex-cli", "claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/login/bin/claude", "/login/bin/codex"]),
            discoveryTimeoutMs: 50,
            loginShellRunner: async (request) => {
                requests.push(request);
                return {
                    stdout: "/login/bin/claude\n/login/bin/codex\n",
                    stderr: "",
                    exitCode: 0,
                };
            },
        });
        assert.equal(selected.transport, "codex-cli");
        assert.equal(selected.executable, "/login/bin/codex");
        assert.equal(requests.length, 1);
        assert.equal(requests[0]?.executable, "/bin/zsh");
        assert.deepEqual(requests[0]?.args, ["-lc", "command -v claude codex"]);
        assert.equal(requests[0]?.stdin, "");
        assert.equal(requests[0]?.timeoutMs, 50);
        assert.equal(requests[0]?.signal.aborted, false);
    });
    for (const [transport, executable] of [
        ["claude-cli", "/login/bin/claude"],
        ["codex-cli", "/login/bin/codex"],
    ]) {
        (0, node_test_1.it)(`accepts the single valid ${transport} login-shell result`, async () => {
            const selected = await (0, llm_station_js_1.detectProvider)({
                order: ["claude-cli", "codex-cli"],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths([executable]),
                loginShellRunner: async () => ({
                    stdout: `${executable}\n`,
                    stderr: "the other fixed command name was absent",
                    exitCode: 1,
                }),
            });
            assert.equal(selected.transport, transport);
            assert.equal(selected.executable, executable);
        });
    }
    (0, node_test_1.it)("fails closed when login-shell discovery emits an invalid executable", async () => {
        await rejectionReason(() => (0, llm_station_js_1.detectProvider)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/login/bin/claude"]),
            loginShellRunner: resultRunner({ stdout: "relative/claude\n" }),
        }), "no_provider");
    });
    (0, node_test_1.it)("fails closed and aborts a login-shell discovery timeout", async () => {
        let sawAbort = false;
        await rejectionReason(() => (0, llm_station_js_1.detectProvider)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths([]),
            discoveryTimeoutMs: 10,
            loginShellRunner: ({ signal }) => new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                    sawAbort = true;
                    reject(new Error("aborted"));
                }, { once: true });
            }),
        }), "no_provider");
        assert.equal(sawAbort, true);
    });
    (0, node_test_1.it)("rejects unavailable Cursor instead of guessing a headless invocation", async () => {
        await rejectionReason(() => (0, llm_station_js_1.detectProvider)({
            order: ["cursor-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/usr/local/bin",
            isExecutable: availablePaths(["/usr/local/bin/cursor-agent"]),
        }), "no_provider");
    });
    (0, node_test_1.it)("reports no_provider when every configured provider is unavailable", async () => {
        await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: async () => false,
            loginShellRunner: resultRunner({ stdout: "", exitCode: 1 }),
            clock: () => FIXED_NOW,
        }), "no_provider");
    });
    (0, node_test_1.it)("unwraps the Claude result string and records an exact replayable envelope", async () => {
        let runnerRequest;
        const outputJson = "{\"mentions\":[]}";
        const station = await (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({
                    type: "result",
                    subtype: "success",
                    result: outputJson,
                    usage: { input_tokens: 12, output_tokens: 4 },
                }),
            }, (request) => { runnerRequest = request; }),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.deepEqual(envelope, {
            stationId: "mention-extraction-v1",
            model: "claude-haiku-4-5-20251001",
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(PROMPT),
            inputDigest: INPUT_DIGEST,
            outputJson,
            producedAt: "2026-08-03T12:34:56.789Z",
            transport: "claude-cli",
        });
        assert.equal(runnerRequest?.executable, "/Users/owner/.local/bin/claude");
        assert.deepEqual(runnerRequest?.args, [
            "-p",
            "--model",
            "claude-haiku-4-5-20251001",
            "--output-format",
            "json",
            "--no-session-persistence",
            "--tools",
            "",
        ]);
        assert.equal(runnerRequest?.stdin, PROMPT);
        assert.equal(runnerRequest?.timeoutMs, 60_000);
        assert.equal(runnerRequest?.signal.aborted, false);
    });
    (0, node_test_1.it)("preserves Claude result verbatim when structured-output metadata is present", async () => {
        const rawResult = " { \"mentions\": [] } ";
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({
                    type: "result",
                    result: rawResult,
                    structured_output: { mentions: [] },
                }),
            }),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.outputJson, rawResult);
    });
    (0, node_test_1.it)("strips a ```json fence from the Claude result before recording the envelope", async () => {
        const inner = "{\"mentions\":[]}";
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({
                    type: "result",
                    subtype: "success",
                    result: "```json\n" + inner + "\n```",
                }),
            }),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.outputJson, inner);
    });
    (0, node_test_1.it)("strips a bare ``` fence from the Codex agent-message payload", async () => {
        const inner = "{\"mentions\":[]}";
        const stdout = [
            JSON.stringify({ type: "thread.started", model: "gpt-5.3-codex" }),
            JSON.stringify({
                type: "item.completed",
                item: { id: "item_1", type: "agent_message", text: "```\n" + inner + "\n```" },
            }),
        ].join("\n");
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["codex-cli"],
            executableOverrides: { "codex-cli": "/owner/tools/codex" },
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/owner/tools/codex"]),
            runner: resultRunner({ stdout }),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.outputJson, inner);
    });
    (0, node_test_1.it)("maps a fence wrapping only whitespace to empty_final_output", async () => {
        const station = await (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({
                    type: "result",
                    subtype: "success",
                    result: "```json\n\n```",
                }),
            }),
            clock: () => FIXED_NOW,
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "empty_final_output");
    });
    (0, node_test_1.it)("accepts only the final Codex item.completed agent-message payload", async () => {
        const firstOutput = "{\"mentions\":[{\"text\":\"old\"}]}";
        const finalOutput = "{\"mentions\":[{\"text\":\"final\"}]}";
        const stdout = [
            JSON.stringify({
                type: "thread.started",
                thread_id: "thread_123",
                model: "gpt-5.3-codex",
            }),
            JSON.stringify({ type: "transport.metadata", mentions: [{ text: "wrong" }] }),
            JSON.stringify({
                type: "item.completed",
                item: { id: "item_1", type: "agent_message", text: firstOutput },
            }),
            JSON.stringify({
                type: "item.completed",
                item: { id: "item_2", type: "reasoning", text: "not output" },
            }),
            JSON.stringify({
                type: "item.completed",
                item: { id: "item_3", type: "agent_message", text: finalOutput },
            }),
            JSON.stringify({ type: "turn.completed", usage: { output_tokens: 10 } }),
        ].join("\n");
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["codex-cli"],
            executableOverrides: { "codex-cli": "/owner/tools/codex" },
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/owner/tools/codex"]),
            runner: resultRunner({ stdout }),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.outputJson, finalOutput);
        assert.equal(envelope.transport, "codex-cli");
        assert.equal(envelope.model, "gpt-5.3-codex");
    });
    (0, node_test_1.it)("selects a provider only once for repeated station requests", async () => {
        let probeCount = 0;
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: async () => {
                probeCount += 1;
                return true;
            },
            runner: resultRunner({
                stdout: JSON.stringify({ type: "result", result: "{\"mentions\":[]}" }),
            }),
            clock: () => FIXED_NOW,
        });
        await station.run({
            stationId: "mention-extraction-v1",
            promptText: "first",
            inputDigest: INPUT_DIGEST,
        });
        await station.run({
            stationId: "mention-extraction-v1",
            promptText: "second",
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(probeCount, 1);
    });
    for (const [transport, executable, authArgs, extractionOutput] of [
        [
            "claude-cli",
            "/Users/owner/.local/bin/claude",
            ["auth", "status"],
            JSON.stringify({ type: "result", result: "{\"mentions\":[]}" }),
        ],
        [
            "codex-cli",
            "/Users/owner/.local/bin/codex",
            ["login", "status"],
            JSON.stringify({
                type: "item.completed",
                item: { type: "agent_message", text: "{\"mentions\":[]}" },
            }),
        ],
    ]) {
        (0, node_test_1.it)(`authenticates ${transport} exactly once before repeated extraction`, async () => {
            const requests = [];
            const station = await (0, llm_station_js_1.createLlmStation)({
                order: [transport],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths([executable]),
                runner: async (request) => {
                    requests.push(request);
                    return {
                        stdout: request.args.join("\0") === authArgs.join("\0")
                            ? ""
                            : extractionOutput,
                        stderr: "",
                        exitCode: 0,
                    };
                },
                clock: () => FIXED_NOW,
            });
            await station.run({
                stationId: "mention-extraction-v1",
                promptText: "first",
                inputDigest: INPUT_DIGEST,
            });
            await station.run({
                stationId: "mention-extraction-v1",
                promptText: "second",
                inputDigest: INPUT_DIGEST,
            });
            assert.deepEqual(requests.map((request) => request.args), [
                authArgs,
                station.provider.args,
                station.provider.args,
            ]);
            assert.equal(requests[0]?.stdin, "");
            assert.equal(requests.filter((request) => (request.args.join("\0") === authArgs.join("\0"))).length, 1);
        });
    }
    (0, node_test_1.it)("maps auth nonzero exit and runner failure to provider_unauthenticated", async () => {
        for (const outcome of [
            (async () => ({
                stdout: "",
                stderr: "private auth failure",
                exitCode: 17,
            })),
            (async () => { throw new Error("private auth runner failure"); }),
        ]) {
            const requests = [];
            const runner = (request) => {
                requests.push(request);
                return outcome(request);
            };
            const error = await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
                remoteConsent: "declined",
                order: ["claude-cli"],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
                runner,
            }), "provider_unauthenticated");
            assert.ok(!error.message.includes("private"));
            assert.equal(requests.length, 1, "extraction must not run after failed auth");
            assert.deepEqual(requests[0]?.args, ["auth", "status"]);
        }
    });
    (0, node_test_1.it)("maps auth timeout to provider_unauthenticated and aborts the probe", async () => {
        let sawAbort = false;
        const runner = ({ signal }) => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
                sawAbort = true;
                reject(new Error("private auth abort"));
            }, { once: true });
        });
        await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner,
            timeoutMs: 10,
        }), "provider_unauthenticated");
        assert.equal(sawAbort, true);
    });
    (0, node_test_1.it)("maps exit-0 loggedIn:false auth status to provider_unauthenticated", async () => {
        const requests = [];
        const runner = async (request) => {
            requests.push(request);
            return {
                stdout: JSON.stringify({
                    loggedIn: false,
                    authMethod: "claude.ai",
                    email: "private-owner@example.com",
                }),
                stderr: "",
                exitCode: 0,
            };
        };
        const error = await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner,
        }), "provider_unauthenticated");
        assert.ok(!error.message.includes("private-owner"));
        assert.equal(requests.length, 1, "extraction must not run after failed auth");
        assert.deepEqual(requests[0]?.args, ["auth", "status"]);
    });
    (0, node_test_1.it)("accepts exit-0 loggedIn:true and non-JSON auth status output", async () => {
        for (const stdout of [
            JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }),
            "Logged in as owner",
            "",
        ]) {
            const runner = async (request) => {
                if (request.args.join("\0") === "auth\0status") {
                    return { stdout, stderr: "", exitCode: 0 };
                }
                return { stdout: "", stderr: "", exitCode: 0 };
            };
            const station = await (0, llm_station_js_1.createLlmStation)({
                order: ["claude-cli"],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
                runner,
            });
            assert.equal(station.provider.transport, "claude-cli");
        }
    });
    (0, node_test_1.it)("maps exit-0 'Not logged in' codex login status to provider_unauthenticated", async () => {
        const runner = async () => ({
            stdout: "Not logged in\n",
            stderr: "",
            exitCode: 0,
        });
        await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/codex"]),
            runner,
        }), "provider_unauthenticated");
    });
    (0, node_test_1.it)("binds the first authenticated provider instead of the first executable", async () => {
        const requests = [];
        const runner = async (request) => {
            requests.push(request);
            const args = request.args.join("\0");
            if (request.executable === "/agent/bin/claude" && args === "auth\0status") {
                return {
                    stdout: JSON.stringify({ loggedIn: false, authMethod: "none" }),
                    stderr: "",
                    exitCode: 0,
                };
            }
            if (request.executable === "/agent/bin/codex" && args === "login\0status") {
                return { stdout: "Logged in using ChatGPT\n", stderr: "", exitCode: 0 };
            }
            return {
                stdout: JSON.stringify({
                    type: "item.completed",
                    item: { type: "agent_message", text: "{\"mentions\":[]}" },
                }),
                stderr: "",
                exitCode: 0,
            };
        };
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli", "codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/agent/bin",
            isExecutable: availablePaths([
                "/agent/bin/claude",
                "/agent/bin/codex",
            ]),
            runner,
            clock: () => FIXED_NOW,
        });
        assert.equal(station.provider.transport, "codex-cli");
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.transport, "codex-cli");
        assert.deepEqual(requests.map((request) => [
            request.executable,
            request.args,
        ]), [
            ["/agent/bin/claude", ["auth", "status"]],
            ["/agent/bin/codex", ["login", "status"]],
            ["/agent/bin/codex", station.provider.args],
        ]);
    });
    (0, node_test_1.it)("falls back when the first authenticated provider times out before binding", async () => {
        const requests = [];
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli", "codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/agent/bin",
            isExecutable: availablePaths([
                "/agent/bin/claude",
                "/agent/bin/codex",
            ]),
            runner: async (request) => {
                const call = `${request.executable}:${request.args.join("\0")}`;
                requests.push(call);
                if (request.args.join("\0") === "auth\0status") {
                    return { stdout: "", stderr: "", exitCode: 0 };
                }
                if (request.args.join("\0") === "login\0status") {
                    return { stdout: "Logged in using ChatGPT", stderr: "", exitCode: 0 };
                }
                if (request.executable === "/agent/bin/claude") {
                    return new Promise((resolve) => {
                        request.signal.addEventListener("abort", () => resolve({
                            stdout: "",
                            stderr: "",
                            exitCode: null,
                        }), { once: true });
                    });
                }
                return {
                    stdout: JSON.stringify({
                        type: "item.completed",
                        item: { type: "agent_message", text: "{\"mentions\":[]}" },
                    }),
                    stderr: "",
                    exitCode: 0,
                };
            },
            clock: () => FIXED_NOW,
            timeoutMs: 10,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.transport, "codex-cli");
        assert.equal(station.provider.transport, "codex-cli");
        assert.deepEqual(requests.map((request) => request.split(":")[0]), [
            "/agent/bin/claude",
            "/agent/bin/claude",
            "/agent/bin/codex",
            "/agent/bin/codex",
        ]);
    });
    (0, node_test_1.it)("does not invoke a fallback after the first successful inference binds", async () => {
        const requests = [];
        let inferenceCount = 0;
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli", "codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/agent/bin",
            isExecutable: availablePaths([
                "/agent/bin/claude",
                "/agent/bin/codex",
            ]),
            runner: async (request) => {
                requests.push(`${request.executable}:${request.args.join("\0")}`);
                if (request.args.join("\0") === "auth\0status") {
                    return { stdout: "", stderr: "", exitCode: 0 };
                }
                inferenceCount += 1;
                if (inferenceCount === 1) {
                    return {
                        stdout: JSON.stringify({ type: "result", result: "{\"mentions\":[]}" }),
                        stderr: "",
                        exitCode: 0,
                    };
                }
                return { stdout: "", stderr: "private failure", exitCode: 9 };
            },
            clock: () => FIXED_NOW,
        });
        await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "nonzero_exit");
        assert.equal(station.provider.transport, "claude-cli");
        assert.deepEqual(requests.map((request) => request.split(":")[0]), [
            "/agent/bin/claude",
            "/agent/bin/claude",
            "/agent/bin/claude",
        ]);
    });
    (0, node_test_1.it)("reports malformed wrappers, empty output, nonzero exits, and invalid digests", async () => {
        async function stationWith(stdout, exitCode = 0, onRequest) {
            return (0, llm_station_js_1.createLlmStation)({
                remoteConsent: "declined",
                order: ["claude-cli"],
                ownerHome: "/Users/owner",
                pathEnv: "",
                isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
                runner: resultRunner({ stdout, exitCode, stderr: "bounded failure" }, onRequest),
                clock: () => FIXED_NOW,
            });
        }
        const request = {
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        };
        await rejectionReason(async () => (await stationWith("not-json")).run(request), "malformed_wrapper");
        await rejectionReason(async () => (await stationWith('{"type":"ignored","type":"result","result":"{}"}')).run(request), "malformed_wrapper");
        await rejectionReason(async () => (await stationWith(JSON.stringify({
            type: "result",
            subtype: "error_during_execution",
            is_error: true,
            result: "transport failure, not model JSON",
        }))).run(request), "malformed_wrapper");
        await rejectionReason(async () => (await stationWith(JSON.stringify({ type: "result", result: "  " })))
            .run(request), "empty_final_output");
        await rejectionReason(async () => (await stationWith("ignored", 17)).run(request), "nonzero_exit");
        let called = false;
        const invalidDigestStation = await stationWith(JSON.stringify({ type: "result", result: "{}" }), 0, () => { called = true; });
        await rejectionReason(() => invalidDigestStation.run({ ...request, inputDigest: "not-a-digest" }), "invalid_input_digest");
        assert.equal(called, false);
    });
    (0, node_test_1.it)("maps claude usage-limit is_error result to provider_rate_limited", async () => {
        const station = await (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({
                    type: "result",
                    subtype: "error_during_execution",
                    is_error: true,
                    result: "Claude AI usage limit reached|1754870400",
                }),
            }),
            clock: () => FIXED_NOW,
        });
        const error = await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "provider_rate_limited");
        assert.ok(!error.message.includes("1754870400"));
    });
    (0, node_test_1.it)("rejects duplicate-key Codex wrapper events", async () => {
        const station = await (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["codex-cli"],
            executableOverrides: { "codex-cli": "/owner/tools/codex" },
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/owner/tools/codex"]),
            runner: resultRunner({
                stdout: '{"type":"item.started","type":"item.completed","item":{"type":"agent_message","text":"{}"}}',
            }),
            clock: () => FIXED_NOW,
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "malformed_wrapper");
    });
    (0, node_test_1.it)("times out through AbortSignal and proves the injected runner receives termination", async () => {
        let terminated = false;
        const runner = ({ args, signal }) => {
            if (args.join("\0") === "auth\0status") {
                return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
            }
            return new Promise((resolve) => {
                signal.addEventListener("abort", () => {
                    terminated = true;
                    resolve({ stdout: "", stderr: "terminated", exitCode: null });
                }, { once: true });
            });
        };
        const station = await (0, llm_station_js_1.createLlmStation)({
            remoteConsent: "declined",
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner,
            timeoutMs: 10,
            clock: () => FIXED_NOW,
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "timeout");
        assert.equal(terminated, true);
    });
    (0, node_test_1.it)("bounds production-runner stdout and stderr without exposing child output", async () => {
        for (const stream of ["stdout", "stderr"]) {
            const controller = new AbortController();
            await assert.rejects(() => (0, llm_station_js_1.productionLlmStationRunner)({
                executable: process.execPath,
                args: [
                    "-e",
                    `process.${stream}.write("x".repeat(${llm_station_js_1.LLM_STATION_MAX_OUTPUT_BYTES + 1}))`,
                ],
                stdin: "",
                timeoutMs: 5_000,
                signal: controller.signal,
            }), (error) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /bounded output limit/);
                assert.ok(!error.message.includes("xxxxx"));
                return true;
            });
        }
    });
    (0, node_test_1.it)("rejects non-UTF8 provider output before wrapper parsing", async () => {
        const controller = new AbortController();
        await assert.rejects(() => (0, llm_station_js_1.productionLlmStationRunner)({
            executable: process.execPath,
            args: [
                "-e",
                "process.stdout.write(Buffer.from([0xff]))",
            ],
            stdin: "",
            timeoutMs: 5_000,
            signal: controller.signal,
        }), /UTF-8/);
    });
    (0, node_test_1.it)("force-kills a production child that ignores SIGTERM after abort", async () => {
        const directory = await (0, promises_1.mkdtemp)(node_path_1.default.join(process.cwd(), ".taskmap-llm-station-"));
        const pidPath = node_path_1.default.join(directory, "child.pid");
        const controller = new AbortController();
        let childPid;
        try {
            const running = (0, llm_station_js_1.productionLlmStationRunner)({
                executable: process.execPath,
                args: [
                    "-e",
                    [
                        "const fs = require('node:fs')",
                        "process.on('SIGTERM', () => {})",
                        "fs.writeFileSync(process.argv[1], String(process.pid))",
                        "setInterval(() => {}, 1000)",
                    ].join(";"),
                    pidPath,
                ],
                stdin: "",
                timeoutMs: 5_000,
                signal: controller.signal,
            });
            for (let attempt = 0; attempt < 100; attempt += 1) {
                try {
                    childPid = Number(await (0, promises_1.readFile)(pidPath, "utf8"));
                    break;
                }
                catch {
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
            }
            assert.ok(Number.isSafeInteger(childPid) && (childPid ?? 0) > 0);
            controller.abort();
            await assert.rejects(running, { name: "AbortError" });
            await new Promise((resolve) => setTimeout(resolve, 400));
            assert.throws(() => process.kill(childPid, 0), (error) => (error instanceof Error
                && "code" in error
                && error.code === "ESRCH"));
            childPid = undefined;
        }
        finally {
            if (childPid !== undefined) {
                try {
                    process.kill(childPid, "SIGKILL");
                }
                catch {
                    // The expected successful path already reaped the child.
                }
            }
            await (0, promises_1.rm)(directory, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("kills an isolated provider process group when a grandchild survives TERM", async () => {
        const directory = await (0, promises_1.mkdtemp)(node_path_1.default.join(process.cwd(), ".taskmap-llm-tree-"));
        const pidPath = node_path_1.default.join(directory, "processes.json");
        const controller = new AbortController();
        let parentPid;
        let grandchildPid;
        const isAlive = (pid) => {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch (error) {
                return !(error instanceof Error
                    && "code" in error
                    && error.code === "ESRCH");
            }
        };
        try {
            const grandchildProgram = [
                "process.on('SIGTERM', () => {})",
                "setInterval(() => {}, 1000)",
            ].join(";");
            const parentProgram = [
                "const fs = require('node:fs')",
                "const { spawn } = require('node:child_process')",
                "process.on('SIGTERM', () => {})",
                `const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildProgram)}], { stdio: 'ignore' })`,
                "fs.writeFileSync(process.argv[1], JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }))",
                "setInterval(() => {}, 1000)",
            ].join(";");
            const running = (0, llm_station_js_1.productionLlmStationRunner)({
                executable: process.execPath,
                args: ["-e", parentProgram, pidPath],
                stdin: "",
                timeoutMs: 5_000,
                signal: controller.signal,
            });
            for (let attempt = 0; attempt < 100; attempt += 1) {
                try {
                    const pids = JSON.parse(await (0, promises_1.readFile)(pidPath, "utf8"));
                    parentPid = pids.parentPid;
                    grandchildPid = pids.grandchildPid;
                    break;
                }
                catch {
                    await new Promise((resolve) => setTimeout(resolve, 5));
                }
            }
            assert.ok(Number.isSafeInteger(parentPid) && (parentPid ?? 0) > 0);
            assert.ok(Number.isSafeInteger(grandchildPid) && (grandchildPid ?? 0) > 0);
            const abortedAt = Date.now();
            controller.abort();
            await assert.rejects(running, { name: "AbortError" });
            for (let attempt = 0; attempt < 100; attempt += 1) {
                if (!isAlive(parentPid) && !isAlive(grandchildPid))
                    break;
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.equal(isAlive(parentPid), false);
            assert.equal(isAlive(grandchildPid), false);
            assert.ok(Date.now() - abortedAt < 1_500);
            parentPid = undefined;
            grandchildPid = undefined;
        }
        finally {
            for (const pid of [grandchildPid, parentPid]) {
                if (pid === undefined)
                    continue;
                try {
                    process.kill(pid, "SIGKILL");
                }
                catch {
                    // The expected successful path already terminated the process.
                }
            }
            await (0, promises_1.rm)(directory, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects a clock that cannot produce a real strict RFC3339 instant", async () => {
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({ type: "result", result: "{}" }),
            }),
            clock: () => new Date("invalid"),
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "invalid_clock");
        const throwingClockStation = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({ type: "result", result: "{}" }),
            }),
            clock: () => { throw new Error("clock internals"); },
        });
        await rejectionReason(() => throwingClockStation.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "invalid_clock");
    });
});
(0, node_test_1.describe)("Task Map consent-gated remote Gemini fallback", () => {
    const credentialPlan = {
        ok: true,
        apiUrl: "https://api.daobrew.example/api/v1",
        deviceCredential: "dbd_fixture_device_credential_123456789012345",
    };
    function jsonResponse(body, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        });
    }
    function successfulRemoteFetch(calls, outputJson = "{\"mentions\":[]}") {
        return (async (input, init) => {
            calls.push({ input: String(input), init });
            return jsonResponse({
                status: "success",
                data: { output_json: outputJson, model: "gemini-fixture" },
            });
        });
    }
    (0, node_test_1.it)("resolves only durable granted or declined consent values", () => {
        assert.equal((0, local_config_js_1.resolveRemoteLlmConsent)({}), "undecided");
        assert.equal((0, local_config_js_1.resolveRemoteLlmConsent)({ remote_llm_consent: "granted" }), "granted");
        assert.equal((0, local_config_js_1.resolveRemoteLlmConsent)({ remote_llm_consent: "declined" }), "declined");
        assert.equal((0, local_config_js_1.resolveRemoteLlmConsent)({ remote_llm_consent: "invalid" }), "undecided");
    });
    (0, node_test_1.it)("requires consent when every local provider is exhausted and consent is undecided", async () => {
        await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "undecided",
            remoteCredentialPlan: credentialPlan,
        }), "remote_consent_required");
    });
    (0, node_test_1.it)("preserves no_provider when remote consent was declined", async () => {
        await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "declined",
            remoteCredentialPlan: credentialPlan,
        }), "no_provider");
    });
    (0, node_test_1.it)("reports a remote authentication failure when consent is granted but enrollment is absent", async () => {
        const error = await rejectionReason(() => (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "granted",
            remoteCredentialPlan: { ok: false, reason: "fixture unenrolled" },
        }), "provider_unauthenticated");
        assert.equal(error.transport, "gemini-remote");
        assert.ok(!error.message.includes("fixture unenrolled"));
    });
    (0, node_test_1.it)("runs and pins the enrolled remote station without repeating discovery", async () => {
        const calls = [];
        let probes = 0;
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: [],
            isExecutable: async () => {
                probes += 1;
                return false;
            },
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch: successfulRemoteFetch(calls),
            remoteRequestGroupId: "refresh_0123456789abcdef",
            clock: () => FIXED_NOW,
        });
        const first = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        const second = await station.run({
            stationId: "identity-adjudication-v1",
            promptText: "second prompt",
            inputDigest: INPUT_DIGEST,
        });
        assert.deepEqual(first, {
            stationId: "mention-extraction-v1",
            model: "gemini-fixture",
            promptDigest: (0, source_contracts_js_1.taskMapContractDigest)(PROMPT),
            inputDigest: INPUT_DIGEST,
            outputJson: "{\"mentions\":[]}",
            producedAt: "2026-08-03T12:34:56.789Z",
            transport: "gemini-remote",
        });
        assert.equal(second.transport, "gemini-remote");
        assert.equal(station.provider.model, "gemini-fixture");
        assert.equal(probes, 0);
        assert.equal(calls.length, 2);
        assert.equal(calls[0]?.input, "https://api.daobrew.example/api/v1/device/llm/gemini/generate");
        assert.equal(calls[0]?.init?.method, "POST");
        assert.equal((calls[0]?.init?.headers).Authorization, `Bearer ${credentialPlan.deviceCredential}`);
        assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
            station_id: "mention-extraction-v1",
            prompt_text: PROMPT,
            request_group_id: "refresh_0123456789abcdef",
        });
    });
    (0, node_test_1.it)("falls through from an authenticated local inference failure to remote", async () => {
        const calls = [];
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: async (request) => request.args.join("\0") === "auth\0status"
                ? { stdout: "", stderr: "", exitCode: 0 }
                : { stdout: "", stderr: "private local failure", exitCode: 17 },
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch: successfulRemoteFetch(calls),
            clock: () => FIXED_NOW,
        });
        const envelope = await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        });
        assert.equal(envelope.transport, "gemini-remote");
        assert.equal(station.provider.transport, "gemini-remote");
        assert.equal(calls.length, 1);
    });
    for (const [name, response, reason] of [
        ["401", () => new Response("", { status: 401 }), "provider_unauthenticated"],
        ["429", () => new Response("", { status: 429 }), "provider_rate_limited"],
        ["500", () => new Response("", { status: 500 }), "runner_failure"],
        ["garbage", () => new Response("not-json", { status: 200 }), "malformed_wrapper"],
    ]) {
        (0, node_test_1.it)(`maps remote ${name} without exposing the bearer`, async () => {
            const station = await (0, llm_station_js_1.createLlmStation)({
                order: [],
                remoteConsent: "granted",
                remoteCredentialPlan: credentialPlan,
                remoteFetch: (async () => response()),
            });
            const error = await rejectionReason(() => station.run({
                stationId: "mention-extraction-v1",
                promptText: PROMPT,
                inputDigest: INPUT_DIGEST,
            }), reason);
            assert.equal(error.transport, "gemini-remote");
            assert.ok(!error.message.includes(credentialPlan.deviceCredential));
        });
    }
    (0, node_test_1.it)("maps an aborted remote request to timeout", async () => {
        const remoteFetch = (async (_input, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
                const error = new Error("private bearer-adjacent timeout");
                error.name = "AbortError";
                reject(error);
            }, { once: true });
        }));
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch,
            timeoutMs: 10,
        });
        await rejectionReason(() => station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        }), "timeout");
    });
    (0, node_test_1.it)("propagates a caller abort into an in-flight remote request", { timeout: 500 }, async () => {
        let remoteSignal;
        const remoteFetch = (async (_input, init) => new Promise((_resolve, reject) => {
            remoteSignal = init?.signal ?? undefined;
            remoteSignal?.addEventListener("abort", () => {
                const error = new Error("caller cancelled");
                error.name = "AbortError";
                reject(error);
            }, { once: true });
        }));
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch,
            timeoutMs: 5_000,
        });
        const controller = new AbortController();
        const running = station.run({
            stationId: "community-task-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
            signal: controller.signal,
        });
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort(new Error("community digestion budget exceeded"));
        await rejectionReason(() => running, "timeout");
        assert.equal(remoteSignal?.aborted, true);
    });
    (0, node_test_1.it)("accepts task-decomposition-v1 for both local and remote stations", async () => {
        const local = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "",
            isExecutable: availablePaths(["/Users/owner/.local/bin/claude"]),
            runner: resultRunner({
                stdout: JSON.stringify({ type: "result", result: "{}" }),
            }),
        });
        const remote = await (0, llm_station_js_1.createLlmStation)({
            order: [],
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch: successfulRemoteFetch([]),
        });
        assert.equal((await local.run({
            stationId: "task-decomposition-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        })).stationId, "task-decomposition-v1");
        assert.equal((await remote.run({
            stationId: "task-decomposition-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        })).stationId, "task-decomposition-v1");
    });
    (0, node_test_1.it)("never calls remote when local Claude succeeds with Codex also present", async () => {
        let remoteCalls = 0;
        const station = await (0, llm_station_js_1.createLlmStation)({
            order: ["claude-cli", "codex-cli"],
            ownerHome: "/Users/owner",
            pathEnv: "/agent/bin",
            isExecutable: availablePaths(["/agent/bin/claude", "/agent/bin/codex"]),
            runner: resultRunner({
                stdout: JSON.stringify({ type: "result", result: "{}" }),
            }),
            remoteConsent: "granted",
            remoteCredentialPlan: credentialPlan,
            remoteFetch: (async () => {
                remoteCalls += 1;
                return jsonResponse({});
            }),
        });
        assert.equal((await station.run({
            stationId: "mention-extraction-v1",
            promptText: PROMPT,
            inputDigest: INPUT_DIGEST,
        })).transport, "claude-cli");
        assert.equal(remoteCalls, 0);
    });
});
