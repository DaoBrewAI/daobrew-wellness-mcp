import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DaoBrewClient } from "./client.js";
export declare const toolDefinitions: Tool[];
export declare function handleToolCall(name: string, args: Record<string, any>, isMock: boolean, _apiKey?: string, isDemo?: boolean, client?: DaoBrewClient): Promise<any>;
/**
 * Tool-layer identity for RLS scoping.
 *
 * The MCP server is a per-user local process — there is exactly one human
 * behind it. Under row-level security the tool layer cannot learn the user
 * from the rows it reads (no scope → no visible row, the chicken-and-egg),
 * so identity must resolve BEFORE the first query:
 *
 *   DAOBREW_USER_ID env (trimmed, non-empty)
 *     ?? user_id in ~/.daobrew/config.json (DAOBREW_CONFIG_FILE honored)
 *     ?? fail closed
 *
 * Row payload fields (e.g. rows[0].user_id for the assignment log) keep
 * reading the row; only the QUERY/EXEC scope comes from this identity.
 */
export declare function toolUserId(): string;
