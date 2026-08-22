#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { DaoBrewClient } from "./client.js";
import { LocalFileConfig } from "./engine/local-config.js";
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
export declare function createMcpRuntime(config?: LocalFileConfig, argv?: string[], log?: (message: string) => void): McpRuntime;
export declare function createMcpServer(runtime: McpRuntime): Server;
export declare function assertMcpRuntimeReady(runtime: McpRuntime): Promise<void>;
