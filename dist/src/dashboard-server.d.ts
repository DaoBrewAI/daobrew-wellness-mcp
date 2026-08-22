import { DaoBrewClient } from "./client.js";
import { Element } from "./types.js";
export declare function getDashboardURL(): string | null;
export declare function startDashboardServer(element: Element, durationSec: number, client: DaoBrewClient): Promise<string>;
export declare function stopDashboardServer(): Promise<void>;
