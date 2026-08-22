#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpRuntime = createMcpRuntime;
exports.createMcpServer = createMcpServer;
exports.assertMcpRuntimeReady = assertMcpRuntimeReady;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const audio_js_1 = require("./audio.js");
const client_js_1 = require("./client.js");
const dashboard_server_js_1 = require("./dashboard-server.js");
const enrollment_js_1 = require("./enrollment.js");
const local_config_js_1 = require("./engine/local-config.js");
const tools_js_1 = require("./tools.js");
/**
 * Resolve the MCP's authenticated runtime without accepting a caller-selected
 * user or device identifier. The server-issued device credential determines
 * the principal; a persisted credential is inseparable from its persisted URL.
 */
function createMcpRuntime(config, argv = process.argv, log = console.error) {
    const isDemo = argv.includes("--demo");
    const forceMock = process.env.DAOBREW_MOCK === "true" || argv.includes("--mock");
    if (forceMock) {
        return { isMock: true, isDemo, mockReason: "mock mode requested" };
    }
    try {
        const fileConfig = config ?? (0, enrollment_js_1.readClientConfigFile)((0, local_config_js_1.localConfigPath)());
        const authenticatedConfig = (0, enrollment_js_1.resolveCredentialBoundClientConfig)(fileConfig, {
            deviceCredential: process.env.DAOBREW_DEVICE_CREDENTIAL,
            apiUrl: process.env.DAOBREW_API_URL,
        });
        const deviceCredential = authenticatedConfig.deviceCredential;
        const apiUrl = authenticatedConfig.apiUrl;
        if (!deviceCredential || !apiUrl) {
            const mockReason = "No enrolled DaoBrew device credential found. Sign in to DaoBrew again or use --mock.";
            log(mockReason);
            return { isMock: true, isDemo, mockReason };
        }
        return {
            isMock: false,
            isDemo,
            deviceCredential,
            apiUrl,
            client: new client_js_1.DaoBrewClient({ deviceCredential, baseUrl: apiUrl }),
        };
    }
    catch (error) {
        const mockReason = error instanceof Error
            ? `DaoBrew authenticated client unavailable: ${error.message}`
            : "DaoBrew authenticated client unavailable";
        log(mockReason);
        return { isMock: true, isDemo, mockReason };
    }
}
function createMcpServer(runtime) {
    const server = new index_js_1.Server({ name: "daobrew-wellness", version: "0.1.0" }, { capabilities: { tools: {}, prompts: {} } });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
        tools: tools_js_1.toolDefinitions,
    }));
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await (0, tools_js_1.handleToolCall)(name, args ?? {}, runtime.isMock, runtime.deviceCredential, runtime.isDemo, runtime.client);
            if (result && typeof result === "object" && result.__mcp_content__) {
                const blocks = result.content;
                // Local graph data remains real even if remote wearable access is unavailable.
                if (runtime.isMock
                    && !result.__local_data__
                    && blocks.length > 0
                    && blocks[0].type === "text") {
                    blocks[0] = {
                        ...blocks[0],
                        text: `⚠️ MOCK MODE — ALL DATA BELOW IS SIMULATED. No wearable is connected. Do NOT present these numbers as real biometric readings. Tell the user this is demo data.\n\n${blocks[0].text}`,
                    };
                }
                return { content: blocks };
            }
            let text = JSON.stringify(result, null, 2);
            if (runtime.isMock) {
                text = `⚠️ MOCK MODE — ALL DATA BELOW IS SIMULATED. No wearable is connected. Do NOT present these numbers as real biometric readings. Tell the user this is demo data.\n\n${text}`;
            }
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: message }) }],
                isError: true,
            };
        }
    });
    server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
    server.setRequestHandler(types_js_1.GetPromptRequestSchema, promptHandler);
    return server;
}
async function assertMcpRuntimeReady(runtime) {
    if (runtime.client) {
        await runtime.client.assertBackendCompatible();
    }
}
const PROMPTS = [
    { name: "breathe", description: "Start a guided breathing session matched to your current stress pattern", arguments: [] },
    { name: "stress", description: "Check your current biometric wellness state", arguments: [] },
    { name: "stop", description: "Stop the currently playing breathing session", arguments: [] },
    { name: "detonator", description: "Fetch the ready Sentinel action package, schedule a prep block, and complete the review task it names", arguments: [] },
];
async function promptHandler(request) {
    const { name } = request.params;
    switch (name) {
        case "breathe":
            return {
                description: "Start a guided breathing session",
                messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: "I need a breathing break. Call daobrew_check first to identify my top stress pattern, then daobrew_breathe with that pattern. After it returns, poll daobrew_check every 2 seconds and show me the dashboard image until I say stop or the session ends.",
                        },
                    }],
            };
        case "stress":
            return {
                description: "Check wellness state",
                messages: [{
                        role: "user",
                        content: { type: "text", text: "Check my current stress levels via daobrew_check (force_refresh: true)." },
                    }],
            };
        case "stop":
            return {
                description: "Stop current session",
                messages: [{
                        role: "user",
                        content: { type: "text", text: "Stop the current breathing session via daobrew_stop." },
                    }],
            };
        case "detonator":
            return {
                description: "Open the ready Sentinel action package",
                messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: "You are helping me review a ready DaoBrew Sentinel action package. "
                                + "Call daobrew_detonate to fetch the likely work thread and its evidence.\n"
                                + "Branch on the tool result:\n"
                                + "- If DaoBrew tools are missing, tell me to install/connect the DaoBrew Sentinel agent and MCP first.\n"
                                + "- If daobrew_detonate returns status: \"not_entitled\", show the checkout URL and payment steps. Stop there; do not invent or execute a detonation.\n"
                                + "- If daobrew_detonate returns a ready action package, continue:\n"
                                + "1. Show me the likely work thread and its evidence before doing anything else.\n"
                                + "2. Schedule the suggested prep block via daobrew_schedule_block.\n"
                                + "3. Do the task: produce the artifact exactly per the artifact spec and save it to a file in the current directory.\n"
                                + "4. Call daobrew_detonate_done with the cause_id and the file path to close the loop, and tell me it's closed.\n"
                                + "If there is no ready action package, just tell me — don't invent one.",
                        },
                    }],
            };
        default:
            throw new Error(`Unknown prompt: ${name}`);
    }
}
let shutdown = () => {
    (0, dashboard_server_js_1.stopDashboardServer)();
    (0, audio_js_1.stopPlayback)();
    process.exit(0);
};
async function main() {
    const runtime = createMcpRuntime();
    await assertMcpRuntimeReady(runtime);
    const server = createMcpServer(runtime);
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    if (runtime.client) {
        const client = runtime.client;
        const heartbeat = async () => {
            try {
                await client.sendHeartbeat();
            }
            catch {
                // Non-fatal: the backend may be temporarily unreachable.
            }
        };
        const heartbeatTimer = setInterval(heartbeat, 60_000);
        void heartbeat();
        shutdown = () => {
            clearInterval(heartbeatTimer);
            (0, dashboard_server_js_1.stopDashboardServer)();
            client.notifyDisconnect().finally(() => {
                (0, audio_js_1.stopPlayback)();
                process.exit(0);
            });
        };
    }
}
if (require.main === module) {
    process.on("SIGTERM", () => shutdown());
    process.on("SIGINT", () => shutdown());
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
