import { MeetingRow } from "../ingest/types.js";
export interface FetchGranolaOptions {
    token?: string;
    baseUrl?: string;
    limit?: number;
    fetchImpl?: typeof fetch;
}
/**
 * Dual-mode Granola reader, routed by token prefix. Returns raw note objects
 * for normalizeGranolaNotes.
 *
 *  - Personal keys ("grn_...") hit the public v1 API — GET /v1/notes on
 *    https://public-api.granola.ai (per-mode default base) — mapped exactly
 *    like the SentinelMac ingest daemon maps them.
 *  - Any other token hits the v2 workspace API — POST /v2/get-documents +
 *    /v1/get-document-transcript on https://api.granola.ai (per-mode default
 *    base).
 *
 * Token resolution: options.token, then GRANOLA_API_TOKEN env, then
 * granola_api_token in ~/.daobrew/config.json (via resolveGranolaToken).
 * Callers without a token can still push rawNotes straight into the ingest
 * job.
 *
 * Base URL: options.baseUrl, then GRANOLA_API_BASE env — which overrides
 * BOTH modes despite their different defaults (beware when debugging one
 * mode with it set) — then the per-mode default above. Default limit also
 * differs per mode (v1: 50, daemon parity; v2: 100, legacy).
 */
export declare function fetchGranolaNotes(options: FetchGranolaOptions): Promise<any[]>;
export declare function normalizeGranolaNotes(rawNotes: any[]): MeetingRow[];
