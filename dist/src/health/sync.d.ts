import { DaoBrewClient } from "../client.js";
export interface SyncResult {
    source: string;
    samples_pushed: number;
    error?: string;
}
export declare function syncAllConnectedSources(client: DaoBrewClient): Promise<SyncResult[]>;
