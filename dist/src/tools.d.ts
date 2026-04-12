import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DaoBrewClient } from "./client.js";
export declare const toolDefinitions: Tool[];
export declare function handleToolCall(name: string, args: Record<string, any>, isMock: boolean, _apiKey?: string, isDemo?: boolean, client?: DaoBrewClient): Promise<any>;
