#!/usr/bin/env node
/**
 * Resident-daemon entry point for wearable syncs (Oura / Google Fit):
 *   node dist/src/health/sync-cli.js [--backfill-days N]
 * Builds the backend client from ~/.daobrew/config.json (env-first, same
 * resolution as local-config.ts) and runs syncAllConnectedSources. Prints
 * one JSON line; exits 1 only when every connected source failed.
 */
import { LocalFileConfig } from "../engine/local-config.js";
export declare function parseHealthCliArgs(argv: string[]): {
    backfillDays?: number;
};
export type HealthCliPlan = {
    action: "skip";
    reason: string;
} | {
    action: "sync";
    deviceCredential: string;
    apiUrl: string;
};
/**
 * Validate the opaque server-issued principal. No persisted UUID, environment
 * user override, or caller-minted identity is accepted.
 */
export declare function healthCliPlan(config: LocalFileConfig): HealthCliPlan;
