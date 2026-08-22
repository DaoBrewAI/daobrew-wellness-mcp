#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { stopPlayback } from "./audio.js";
import { DaoBrewClient } from "./client.js";
import { stopDashboardServer } from "./dashboard-server.js";
import {
  readClientConfigFile,
  resolveCredentialBoundClientConfig,
} from "./enrollment.js";
import { localConfigPath, LocalFileConfig } from "./engine/local-config.js";
import { handleToolCall, toolDefinitions } from "./tools.js";

export interface McpRuntime {
  isMock: boolean;
  isDemo: boolean;
  deviceCredential?: string;
  apiUrl?: string;
  client?: DaoBrewClient;
  mockReason?: string;
}

/**
 * Resolve the MCP's authenticated runtime without accepting a caller-selected
 * user or device identifier. The server-issued device credential determines
 * the principal; a persisted credential is inseparable from its persisted URL.
 */
export function createMcpRuntime(
  config?: LocalFileConfig,
  argv: string[] = process.argv,
  log: (message: string) => void = console.error,
): McpRuntime {
  const isDemo = argv.includes("--demo");
  const forceMock = process.env.DAOBREW_MOCK === "true" || argv.includes("--mock");
  if (forceMock) {
    return { isMock: true, isDemo, mockReason: "mock mode requested" };
  }

  try {
    const fileConfig = config ?? readClientConfigFile(localConfigPath()) as LocalFileConfig;
    const authenticatedConfig = resolveCredentialBoundClientConfig(fileConfig, {
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
      client: new DaoBrewClient({ deviceCredential, baseUrl: apiUrl }),
    };
  } catch (error: unknown) {
    const mockReason = error instanceof Error
      ? `DaoBrew authenticated client unavailable: ${error.message}`
      : "DaoBrew authenticated client unavailable";
    log(mockReason);
    return { isMock: true, isDemo, mockReason };
  }
}

export function createMcpServer(runtime: McpRuntime): Server {
  const server = new Server(
    { name: "daobrew-wellness", version: "0.1.0" },
    { capabilities: { tools: {}, prompts: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleToolCall(
        name,
        args ?? {},
        runtime.isMock,
        runtime.deviceCredential,
        runtime.isDemo,
        runtime.client,
      );

      if (result && typeof result === "object" && (result as any).__mcp_content__) {
        const blocks = (result as any).content as Array<any>;
        // Local graph data remains real even if remote wearable access is unavailable.
        if (
          runtime.isMock
          && !(result as any).__local_data__
          && blocks.length > 0
          && blocks[0].type === "text"
        ) {
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
      return { content: [{ type: "text" as const, text }] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
  server.setRequestHandler(GetPromptRequestSchema, promptHandler);
  return server;
}

export async function assertMcpRuntimeReady(runtime: McpRuntime): Promise<void> {
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

async function promptHandler(request: any) {
  const { name } = request.params;
  switch (name) {
    case "breathe":
      return {
        description: "Start a guided breathing session",
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "I need a breathing break. Call daobrew_check first to identify my top stress pattern, then daobrew_breathe with that pattern. After it returns, poll daobrew_check every 2 seconds and show me the dashboard image until I say stop or the session ends.",
          },
        }],
      };
    case "stress":
      return {
        description: "Check wellness state",
        messages: [{
          role: "user" as const,
          content: { type: "text" as const, text: "Check my current stress levels via daobrew_check (force_refresh: true)." },
        }],
      };
    case "stop":
      return {
        description: "Stop current session",
        messages: [{
          role: "user" as const,
          content: { type: "text" as const, text: "Stop the current breathing session via daobrew_stop." },
        }],
      };
    case "detonator":
      return {
        description: "Open the ready Sentinel action package",
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              "You are helping me review a ready DaoBrew Sentinel action package. "
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

let shutdown: () => void = () => {
  stopDashboardServer();
  stopPlayback();
  process.exit(0);
};

async function main(): Promise<void> {
  const runtime = createMcpRuntime();
  await assertMcpRuntimeReady(runtime);
  const server = createMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (runtime.client) {
    const client = runtime.client;
    const heartbeat = async () => {
      try {
        await client.sendHeartbeat();
      } catch {
        // Non-fatal: the backend may be temporarily unreachable.
      }
    };
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    void heartbeat();

    shutdown = () => {
      clearInterval(heartbeatTimer);
      stopDashboardServer();
      client.notifyDisconnect().finally(() => {
        stopPlayback();
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
