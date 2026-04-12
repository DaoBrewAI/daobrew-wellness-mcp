#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleToolCall, toolDefinitions } from "./tools.js";
import { stopPlayback } from "./audio.js";
import { DaoBrewClient } from "./client.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Load API config from file (env vars are unreliable — Claude Code may not pass them)
const CONFIG_FILE = join(homedir(), ".daobrew", "config.json");
let fileConfig: { api_key?: string; api_url?: string } = {};
if (existsSync(CONFIG_FILE)) {
  try { fileConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")); } catch {}
}

const apiKey = process.env.DAOBREW_API_KEY || fileConfig.api_key;
const apiBaseUrl = process.env.DAOBREW_API_URL || fileConfig.api_url;

// Mock only when explicitly requested via env AND no API key available
const isMock = process.env.DAOBREW_MOCK === "true" || !apiKey;
const isDemo = process.argv.includes("--demo");

if (!isMock && !apiKey) {
  // This shouldn't happen since isMock=true when !apiKey, but just in case
  console.error("No API key found. Add api_key to ~/.daobrew/config.json or set DAOBREW_API_KEY.");
  process.exit(1);
}

const client = !isMock && apiKey
  ? new DaoBrewClient({ apiKey, baseUrl: apiBaseUrl })
  : undefined;

const server = new Server(
  { name: "daobrew-wellness", version: "0.1.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleToolCall(name, args ?? {}, isMock, apiKey, isDemo, client);
    // Inject mock-mode warning so LLMs cannot miss it
    let text = JSON.stringify(result, null, 2);
    if (isMock) {
      text = `⚠️ MOCK MODE — ALL DATA BELOW IS SIMULATED. No wearable is connected. Do NOT present these numbers as real biometric readings. Tell the user this is demo data.\n\n${text}`;
    }
    return { content: [{ type: "text", text }] };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
      isError: true,
    };
  }
});

const PROMPTS = [
  { name: "breathe", description: "Start a guided breathing session matched to your current stress pattern", arguments: [] },
  { name: "stress", description: "Check your current biometric wellness state", arguments: [] },
  { name: "stop", description: "Stop the currently playing breathing session", arguments: [] },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS,
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;
  switch (name) {
    case "breathe":
      return {
        description: "Start a guided breathing session",
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: "I need a breathing break. Check my wellness state and start a session for my top stress pattern." },
          },
        ],
      };
    case "stress":
      return {
        description: "Check wellness state",
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: "Check my current stress levels and biometric wellness state." },
          },
        ],
      };
    case "stop":
      return {
        description: "Stop current session",
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: "Stop the current breathing session." },
          },
        ],
      };
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start heartbeat so the iOS app knows the agent is online
  if (client) {
    const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
    const heartbeatTimer = setInterval(async () => {
      try {
        await client.sendHeartbeat();
      } catch {
        // Non-fatal — backend may be temporarily unreachable
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Send initial heartbeat immediately
    client.sendHeartbeat().catch(() => {});

    // Clean up on exit
    const originalShutdown = shutdown;
    shutdown = () => {
      clearInterval(heartbeatTimer);
      client.notifyDisconnect().finally(() => {
        stopPlayback();
        process.exit(0);
      });
    };
  }
}

let shutdown: () => void = () => {
  stopPlayback();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

main().catch(console.error);
