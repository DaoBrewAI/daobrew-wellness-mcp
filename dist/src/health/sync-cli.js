#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHealthCliArgs = parseHealthCliArgs;
exports.healthCliPlan = healthCliPlan;
/**
 * Resident-daemon entry point for wearable syncs (Oura / Google Fit):
 *   node dist/src/health/sync-cli.js [--backfill-days N]
 * Builds the backend client from ~/.daobrew/config.json (env-first, same
 * resolution as local-config.ts) and runs syncAllConnectedSources. Prints
 * one JSON line; exits 1 only when every connected source failed.
 */
const local_config_js_1 = require("../engine/local-config.js");
const client_js_1 = require("../client.js");
const enrollment_js_1 = require("../enrollment.js");
const sync_js_1 = require("./sync.js");
function parseHealthCliArgs(argv) {
    const idx = argv.indexOf("--backfill-days");
    if (idx === -1)
        return {};
    const days = Number(argv[idx + 1]);
    if (!Number.isInteger(days) || days <= 0)
        throw new Error("--backfill-days requires a positive integer");
    return { backfillDays: days };
}
/**
 * Validate the opaque server-issued principal. No persisted UUID, environment
 * user override, or caller-minted identity is accepted.
 */
function healthCliPlan(config) {
    const deviceCredential = config.device_credential?.trim() || "";
    let apiUrl = "";
    try {
        apiUrl = (0, enrollment_js_1.normalizeApiUrl)(config.api_url);
    }
    catch {
        // The common skip below keeps daemon output actionable and credential-free.
    }
    if (!(0, enrollment_js_1.isValidDeviceCredential)(deviceCredential)
        || !apiUrl) {
        return {
            action: "skip",
            reason: "device enrollment is incomplete — sign in to DaoBrew again or contact support",
        };
    }
    return { action: "sync", deviceCredential, apiUrl };
}
async function main() {
    const { backfillDays } = parseHealthCliArgs(process.argv.slice(2));
    const ensured = await (0, enrollment_js_1.ensureDeviceEnrollment)({
        configFile: (0, local_config_js_1.localConfigPath)(),
        apiUrl: process.env.DAOBREW_API_URL,
        metadata: { surface: "wellness-mcp-health-sync", platform: process.platform },
    });
    const config = ensured.config;
    const plan = healthCliPlan(config);
    if (plan.action === "skip") {
        console.log(JSON.stringify({ status: "skipped", reason: plan.reason }));
        return;
    }
    const client = new client_js_1.DaoBrewClient({
        deviceCredential: plan.deviceCredential,
        // The persisted credential and server-provisioned URL are one authority
        // record. Never rebind the bearer to a project-controlled environment URL.
        baseUrl: plan.apiUrl,
        // A 500-row Oura batch takes ~20s on the current production backend
        // because ingestion is transactional and recomputes state synchronously.
        timeoutMs: 60_000,
    });
    const results = await (0, sync_js_1.syncAllConnectedSources)(client, { backfillDays });
    const failed = results.filter((r) => r.error);
    console.log(JSON.stringify({
        status: results.length > 0 && failed.length === results.length ? "error" : "ok",
        backfill_days: backfillDays ?? null,
        results,
    }, null, 2));
    if (results.length > 0 && failed.length === results.length)
        process.exit(1);
}
if (require.main === module) {
    main().catch((err) => {
        if (err instanceof enrollment_js_1.BackendIncompatibleError) {
            console.error(JSON.stringify({
                status: "error",
                code: err.code,
                reason: err.reason,
                error: err.message,
            }));
        }
        else if (err instanceof enrollment_js_1.EnrollmentNeededError) {
            console.error(JSON.stringify({
                status: "skipped",
                code: err.code,
                reason: err.reason,
                error: err.message,
            }));
        }
        else {
            console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }));
        }
        process.exit(1);
    });
}
