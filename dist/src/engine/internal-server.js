"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runForAllUsers = runForAllUsers;
exports.resolveInternalUserId = resolveInternalUserId;
exports.resolveInternalRequestUserId = resolveInternalRequestUserId;
exports.handleRequest = handleRequest;
exports.runEmbedSweep = runEmbedSweep;
exports.createInternalServer = createInternalServer;
exports.resolveInternalPort = resolveInternalPort;
exports.prepareInternalServerStorage = prepareInternalServerStorage;
const node_crypto_1 = require("node:crypto");
const node_http_1 = require("node:http");
const sink_js_1 = require("./ingest/sink.js");
const jobs_js_1 = require("./ingest/jobs.js");
const bootstrap_js_1 = require("./bootstrap.js");
const sweep_js_1 = require("./embeddings/sweep.js");
const gemini_js_1 = require("./embeddings/gemini.js");
const nightly_js_1 = require("./memory/nightly.js");
const snapshot_js_1 = require("./memory/snapshot.js");
const priors_js_1 = require("./transfer/priors.js");
const local_config_js_1 = require("./local-config.js");
const identity_js_1 = require("../identity.js");
const user_scope_js_1 = require("./user-scope.js");
const identity_discovery_js_1 = require("./identity-discovery.js");
const graph_db_js_1 = require("../graph-db.js");
const run_js_1 = require("./run.js");
const schema_js_1 = require("./schema.js");
const user_id_js_1 = require("../user-id.js");
/**
 * Internal warm-tier ingest/embedding HTTP entrypoints. Node built-ins only —
 * no framework, no min-instance worker, no Pub/Sub. Protected by
 * DAOBREW_INTERNAL_TOKEN when set.
 */
const SWEEP_TABLES = ["user_insights", "meeting_notes", "transfer_records"];
/**
 * RLS seam wiring (phase 1): GUC-scoped exec/query for the layer-2 job entry
 * points (HTTP handlers and the --run CLI mirror them identically). Scoping
 * is postgres-only — the layer-2 jobs treat injected deps as "caller knows
 * the store", so unconditional injection would bypass their own
 * postgres-only guard on SQLite machines; returning {} preserves that guard.
 */
function layer2ScopedDeps(userId, leaseToken) {
    if ((0, graph_db_js_1.graphStoreKind)() !== "postgres")
        return {};
    return {
        exec: leaseToken
            ? (0, user_scope_js_1.causalLeaseScopedExec)(userId, leaseToken)
            : (0, user_scope_js_1.scopedExec)(userId),
        query: (0, user_scope_js_1.scopedQuery)(userId),
    };
}
async function runForAllUsers(runOne, opts = {}) {
    const discover = opts.discover ?? (() => (0, identity_discovery_js_1.discoverActiveIdentities)());
    const identities = await discover();
    const results = [];
    for (const userId of identities) {
        try {
            const result = await runOne(userId);
            results.push({ userId, status: "ok", result });
        }
        catch (err) {
            results.push({ userId, status: "error", error: err?.message ?? String(err) });
        }
    }
    return {
        usersTotal: identities.length,
        usersOk: results.filter((r) => r.status === "ok").length,
        usersFailed: results.filter((r) => r.status === "error").length,
        results,
    };
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.setEncoding("utf-8");
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 10_000_000) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}
function sendJson(res, status, payload) {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
}
function canonicalUuid(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
        ? normalized
        : null;
}
function resolveInternalUserId(payload = {}, config = (0, local_config_js_1.readLocalConfig)()) {
    if (Object.prototype.hasOwnProperty.call(payload, "userId")) {
        return (0, identity_js_1.resolveUserId)(config, String(payload.userId ?? ""));
    }
    if (Object.prototype.hasOwnProperty.call(payload, "user_id")) {
        return (0, identity_js_1.resolveUserId)(config, String(payload.user_id ?? ""));
    }
    const effectiveConfig = {
        ...config,
        user_id: process.env.DAOBREW_USER_ID
            ?? process.env.DAOBREW_INTERNAL_USER
            ?? config.user_id,
    };
    return (0, identity_js_1.resolveUserId)(effectiveConfig);
}
/** Task Map refresh is a single-owner local control-plane route. Keep its
 * identity contract stricter than the multi-user engine/maintenance routes:
 * the configured owner must be canonical, and a supplied payload identity
 * may only confirm that same owner. */
function resolveInternalRequestUserId(payload, configuredRaw) {
    const configured = (0, user_id_js_1.canonicalUserId)(configuredRaw);
    if (!configured) {
        return { ok: false, reason: "confirmed canonical internal identity required" };
    }
    const supplied = payload.userId ?? payload.user_id;
    if (supplied === undefined)
        return { ok: true, userId: configured };
    const payloadIdentity = (0, user_id_js_1.canonicalUserId)(supplied);
    if (!payloadIdentity || payloadIdentity !== configured) {
        return { ok: false, reason: "payload identity does not match configured identity" };
    }
    return { ok: true, userId: configured };
}
async function handleRequest(req, res, serverOpts = {}) {
    const url = (req.url ?? "").split("?")[0];
    const expectedToken = process.env.DAOBREW_INTERNAL_TOKEN;
    // The public backend is the only production caller of the engine proxy.
    // Unlike the older local ingest routes, this route never falls back to an
    // unauthenticated development mode: a missing server token is a deployment
    // error, and a missing/wrong caller token is unauthorized.
    if (url === "/internal/engine/run" && !expectedToken) {
        sendJson(res, 503, { status: "error", error: "internal engine token is not configured" });
        return;
    }
    if (expectedToken && req.headers["x-daobrew-internal-token"] !== expectedToken) {
        sendJson(res, 401, { status: "error", error: "invalid internal token" });
        return;
    }
    if (req.method !== "POST") {
        sendJson(res, 405, { status: "error", error: "POST only" });
        return;
    }
    let payload;
    try {
        const raw = await readBody(req);
        payload = raw.trim() ? JSON.parse(raw) : {};
    }
    catch (err) {
        sendJson(res, 400, { status: "error", error: `invalid JSON body: ${err?.message ?? err}` });
        return;
    }
    if (url === "/internal/taskmap/refresh") {
        const identity = resolveInternalRequestUserId(payload, serverOpts.expectedUserId ?? process.env.DAOBREW_INTERNAL_USER);
        if (!identity.ok) {
            sendJson(res, 403, { status: "error", error: identity.reason });
            return;
        }
        if (serverOpts.enableDebugTaskMapRefresh !== true
            || serverOpts.taskMapRefresh === undefined) {
            sendJson(res, 404, { status: "error", error: "route unavailable" });
            return;
        }
        const trigger = payload.trigger;
        if (trigger !== "launch" && trigger !== "manual" && trigger !== "timer") {
            sendJson(res, 400, {
                status: "error",
                error: "trigger must be launch, manual, or timer",
            });
            return;
        }
        try {
            const result = await serverOpts.taskMapRefresh(trigger);
            sendJson(res, 200, result);
        }
        catch (err) {
            sendJson(res, 500, { status: "error", error: err?.message ?? String(err) });
        }
        return;
    }
    const userIdPlan = resolveInternalUserId(payload);
    try {
        if (url === "/internal/engine/run") {
            // The authenticated public backend supplies the resolved principal. Do
            // not accept an environment fallback or any client-controlled execution
            // knobs: production is one non-demo, non-dry run over the month window.
            const principal = typeof payload.userId === "string" ? payload.userId.trim() : "";
            if (!principal || principal.toLowerCase() === "local") {
                sendJson(res, 400, {
                    status: "error",
                    error: "an explicit non-local userId is required",
                });
                return;
            }
            // These capabilities are minted by the authenticated Python backend
            // after it reserves the exact principal.  They are mandatory here and
            // deliberately have no env/alias fallback, so neither a public caller
            // nor a legacy internal payload can choose a generation or bypass the
            // DB-owned lease gate.
            const generationId = canonicalUuid(payload.generationId);
            const leaseToken = canonicalUuid(payload.leaseToken);
            if (!generationId || !leaseToken) {
                sendJson(res, 400, {
                    status: "error",
                    error: "canonical generationId and leaseToken are required",
                });
                return;
            }
            const run = serverOpts.runEngineOnce ?? run_js_1.runEngineOnce;
            let result;
            try {
                result = await run({
                    once: true,
                    dryRun: false,
                    demo: false,
                    userId: principal,
                    deviceId: principal,
                    generationId,
                    leaseToken,
                    biometricRange: "month",
                });
            }
            catch {
                // Storage/provider errors can contain connection details. Keep this
                // internal HTTP boundary stable and non-sensitive.
                sendJson(res, 500, { status: "error", error: "production engine run failed" });
                return;
            }
            if (result.user_id !== principal
                || result.generation_id !== generationId
                || result.demo !== false
                || result.dry_run !== false
                || !["written", "no_signal", "skipped_done"].includes(result.status)) {
                sendJson(res, 500, {
                    status: "error",
                    error: "production engine returned an invalid result",
                });
                return;
            }
            // Preserve the engine's truthful status as the top-level status. The
            // public proxy may sanitize the remaining diagnostic fields, but must
            // never turn no_signal into a generic success.
            sendJson(res, 200, result);
            return;
        }
        if (url === "/internal/ingest/calendar") {
            if (!userIdPlan.ok) {
                sendJson(res, 400, { status: "error", error: userIdPlan.reason });
                return;
            }
            const userId = userIdPlan.userId;
            const rawEvents = payload.rawEvents ?? payload.events;
            if (!Array.isArray(rawEvents)) {
                sendJson(res, 400, { status: "error", error: "rawEvents array required" });
                return;
            }
            const result = await (0, jobs_js_1.runCalendarIngestJob)({ userId, rawEvents, sink: new sink_js_1.PostgresIngestSink() });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/ingest/granola") {
            if (!userIdPlan.ok) {
                sendJson(res, 400, { status: "error", error: userIdPlan.reason });
                return;
            }
            const userId = userIdPlan.userId;
            const rawNotes = payload.rawNotes ?? payload.meeting_notes ?? payload.notes;
            const result = await (0, jobs_js_1.runGranolaIngestJob)({
                userId,
                rawNotes: Array.isArray(rawNotes) ? rawNotes : undefined,
                sink: new sink_js_1.PostgresIngestSink(),
            });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/ingest/memory") {
            if (!userIdPlan.ok) {
                sendJson(res, 400, { status: "error", error: userIdPlan.reason });
                return;
            }
            const userId = userIdPlan.userId;
            const projectPath = payload.projectPath ?? payload.project_path;
            // Explicit string projectPath keeps the original single-project
            // behavior; absent/null switches to server-side discovery mode. A
            // present but malformed value stays a 400 rather than silently
            // discovering (and walking $HOME) on a caller bug.
            if (projectPath != null && (typeof projectPath !== "string" || !projectPath)) {
                sendJson(res, 400, { status: "error", error: "projectPath must be a non-empty string when provided" });
                return;
            }
            const result = await (0, jobs_js_1.runMemoryIngestJob)({
                userId,
                projectPath: typeof projectPath === "string" && projectPath ? projectPath : undefined,
                memoryRows: Array.isArray(payload.memoryRows) ? payload.memoryRows : undefined,
                sink: new sink_js_1.PostgresIngestSink(),
            });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/layer2/nightly") {
            // RLS seam wiring (phase 1): layer-2 maintenance reads/writes are all
            // per-user, so run the job on GUC-scoped executors for the request's
            // user (see user-scope.ts). Postgres-only guard stays with the job:
            // injecting executors would bypass its store check, so only inject on
            // the postgres path and keep the job's clean error otherwise.
            // Deliverable 2: `allUsers:true` fans the job over every active identity;
            // the single-user path (default) is unchanged/byte-identical.
            if (payload.allUsers === true) {
                const multi = await runForAllUsers((uid) => (0, nightly_js_1.runNightlyThreadMaintenance)({ userId: uid, ...layer2ScopedDeps(uid) }), serverOpts);
                sendJson(res, 200, { status: "ok", mode: "all_users", ...multi });
                return;
            }
            // The public backend supplies an exact DB lease for cost-bearing manual
            // refreshes; unlike closing an HTTP request, revoking that capability
            // reliably stops subsequent writes from a timed-out Node invocation.
            // Existing trusted scheduler/local-daemon maintenance remains unleased
            // and idempotent. A present-but-malformed capability is always rejected.
            const hasLeaseToken = payload.leaseToken !== undefined && payload.leaseToken !== null;
            const leaseToken = hasLeaseToken ? canonicalUuid(payload.leaseToken) : null;
            if (hasLeaseToken && !leaseToken) {
                sendJson(res, 400, {
                    status: "error",
                    error: "leaseToken must be a canonical UUID when provided",
                });
                return;
            }
            if (!userIdPlan.ok) {
                sendJson(res, 200, { status: "skipped", reason: userIdPlan.reason });
                return;
            }
            const userId = userIdPlan.userId;
            const result = await (0, nightly_js_1.runNightlyThreadMaintenance)({
                userId,
                ...layer2ScopedDeps(userId, leaseToken ?? undefined),
            });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/layer2/snapshot") {
            // RLS seam wiring (phase 1): same scoping as the nightly job above.
            if (payload.allUsers === true) {
                const multi = await runForAllUsers((uid) => (0, snapshot_js_1.runWeeklySnapshotJob)({ userId: uid, ...layer2ScopedDeps(uid) }), serverOpts);
                sendJson(res, 200, { status: "ok", mode: "all_users", ...multi });
                return;
            }
            if (!userIdPlan.ok) {
                sendJson(res, 200, { status: "skipped", reason: userIdPlan.reason });
                return;
            }
            const userId = userIdPlan.userId;
            const result = await (0, snapshot_js_1.runWeeklySnapshotJob)({ userId, ...layer2ScopedDeps(userId) });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/transfer/priors") {
            // Deliberately UNSCOPED (plan of record): population priors aggregate
            // the anonymized transfer annex ACROSS users by design (k-anonymity is
            // enforced at the app layer). Scoping this job would break the
            // aggregation the moment RLS enforces on the app role —
            // transfer_records/population_priors carry explicit permissive
            // policies instead (see postgres-rls.ts).
            const result = await (0, priors_js_1.runTransferPriorsJob)();
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/embed-sweep") {
            const result = await runEmbedSweep({
                tables: Array.isArray(payload.tables) ? payload.tables : payload.table ? [payload.table] : undefined,
                batchSize: payload.batchSize,
                limit: payload.limit,
            });
            sendJson(res, 200, { status: "ok", ...result });
            return;
        }
        if (url === "/internal/bootstrap") {
            // Cold-start bootstrap (MVP Phase 2): 30-day ingest backfill + embed
            // sweep + engine replay + layer-2 nightly/snapshot, one call. Postgres
            // is a hard requirement (warm-tier ingest and layer 2 are
            // Postgres-only) — refuse loudly instead of 500ing mid-flight.
            if (!userIdPlan.ok) {
                sendJson(res, 200, { status: "skipped", reason: userIdPlan.reason });
                return;
            }
            if ((0, graph_db_js_1.graphStoreKind)() !== "postgres") {
                sendJson(res, 400, {
                    status: "error",
                    error: "bootstrap requires DAOBREW_GRAPH_STORE=postgres (warm-tier ingest and layer-2 memory are Postgres-only)",
                });
                return;
            }
            const userId = userIdPlan.userId;
            const rawEvents = payload.rawEvents ?? payload.calendarRawEvents;
            const rawNotes = payload.rawNotes ?? payload.granolaRawNotes;
            const days = Number(payload.days);
            const result = await (0, bootstrap_js_1.runBootstrap)({
                userId,
                days: Number.isFinite(days) && days > 0 ? days : undefined,
                calendarRawEvents: Array.isArray(rawEvents) ? rawEvents : undefined,
                granolaRawNotes: Array.isArray(rawNotes) ? rawNotes : undefined,
                memoryProjectPath: typeof payload.projectPath === "string" && payload.projectPath ? payload.projectPath : undefined,
                embedSweep: runEmbedSweep,
            });
            sendJson(res, 200, { status: result.ok ? "ok" : "partial", ...result });
            return;
        }
        sendJson(res, 404, { status: "error", error: `unknown route: ${url}` });
    }
    catch (err) {
        sendJson(res, 500, { status: "error", error: err?.message ?? String(err) });
    }
}
async function runEmbedSweep(options) {
    const requested = options?.tables ?? SWEEP_TABLES;
    const tables = requested.filter((table) => SWEEP_TABLES.includes(table));
    if (tables.length === 0) {
        throw new Error(`No valid sweep tables in ${JSON.stringify(requested)}; expected ${SWEEP_TABLES.join(", ")}`);
    }
    // Fresh-machine guard: resolve the key per-call, BEFORE any provider
    // construction or table work. runEmbedSweep has no provider injection —
    // callers that need a custom provider use the embedSweep core directly —
    // so a missing key here always means "skip gracefully", never a 500.
    if (!(0, local_config_js_1.resolveGeminiApiKey)()) {
        const warnings = [
            "gemini key missing (GEMINI_API_KEY env or gemini_api_key in ~/.daobrew/config.json) — embed sweep skipped; ingest is unaffected",
        ];
        const skippedTables = {};
        for (const table of tables)
            skippedTables[table] = { rowsEmbedded: 0, geminiCallsUsed: 0 };
        // pipeline_metrics recency is the absence-alerting signal, so a machine
        // with a configured DB still gets zero-work rows; a fresh machine has no
        // DB at all, so metrics are strictly best-effort and never block the skip.
        // Caveat: recency-only monitors stay green during a perpetual skip — alert
        // on warnings_json non-empty or gemini_calls_used=0 streaks to catch
        // keyless machines.
        if ((0, graph_db_js_1.graphStoreKind)() === "postgres") {
            try {
                const nowTs = Math.floor(Date.now() / 1000);
                for (const table of tables) {
                    await (0, graph_db_js_1.execSql)(`INSERT INTO pipeline_metrics(id, job_name, duration_ms, rows_written, dedup_skips, gemini_calls_used, embedding_row_count, warm_db_bytes, warnings_json, run_at)\n` +
                        `VALUES (${(0, graph_db_js_1.q)(`metric_${(0, node_crypto_1.randomUUID)()}`)}, ${(0, graph_db_js_1.q)(`embed_sweep:${table}`)}, 0, 0, 0, 0, 0, 0, ${(0, graph_db_js_1.q)(JSON.stringify(warnings))}::jsonb, ${nowTs});`);
                }
            }
            catch {
                // metrics are best-effort on the skip path
            }
        }
        return { rowsEmbedded: 0, geminiCallsUsed: 0, warnings, alerts: [], tables: skippedTables };
    }
    const provider = new gemini_js_1.GeminiEmbeddingProvider();
    const perTable = {};
    const warnings = [];
    let rowsEmbedded = 0;
    let geminiCallsUsed = 0;
    for (const table of tables) {
        const result = await (0, sweep_js_1.embedSweep)({
            table,
            batchSize: options?.batchSize,
            limit: options?.limit,
            provider,
        });
        perTable[table] = { rowsEmbedded: result.rowsEmbedded, geminiCallsUsed: result.geminiCallsUsed };
        rowsEmbedded += result.rowsEmbedded;
        geminiCallsUsed += result.geminiCallsUsed;
        warnings.push(...result.warnings);
    }
    const alerts = [];
    try {
        const nowTs = Math.floor(Date.now() / 1000);
        const calls = await (0, graph_db_js_1.queryJson)(`SELECT COALESCE(sum(gemini_calls_used), 0) AS calls FROM pipeline_metrics WHERE run_at >= ${nowTs - 86_400}`);
        alerts.push(...(0, jobs_js_1.thresholdWarnings)({
            embeddingRowCount: 0,
            warmDbBytes: 0,
            geminiCallsToday: Number(calls[0]?.calls ?? 0),
        }));
    }
    catch {
        // quota readback is advisory; sweep result stands on its own
    }
    warnings.push(...alerts);
    await (0, jobs_js_1.postAlertWebhook)("embed-sweep", alerts);
    return { rowsEmbedded, geminiCallsUsed, warnings, alerts, tables: perTable };
}
function createInternalServer(options = {}) {
    return (0, node_http_1.createServer)((req, res) => {
        void handleRequest(req, res, options);
    });
}
/** DAOBREW_INTERNAL_PORT wins; Cloud Run's injected PORT is the fallback so
 *  the container listens where the platform routes; 8787 for local/launchd. */
function resolveInternalPort() {
    return Number(process.env.DAOBREW_INTERNAL_PORT || process.env.PORT || 8787);
}
/**
 * Fail-closed storage gate invoked before the HTTP socket is opened. Injectable
 * dependencies keep the ordering contract unit-testable without a live DB.
 */
function prepareInternalServerStorage(storeKind = graph_db_js_1.graphStoreKind, ensure = schema_js_1.ensureSchema) {
    if (storeKind() === "postgres")
        ensure();
}
async function main() {
    const args = process.argv.slice(2);
    const runIndex = args.indexOf("--run");
    if (runIndex !== -1) {
        const job = args[runIndex + 1];
        if (job === "layer2-nightly" || job === "layer2-snapshot") {
            // Deliverable 2: DAOBREW_MULTI_USER=1 is the CLI opt-in mirror of the
            // HTTP route's `allUsers:true` — the CLI has no request body, so an env
            // var carries the same signal. Fans the job over every active identity;
            // one identity's failure surfaces as a non-zero exit (cron alert channel)
            // but never stops the others. Unset/other values keep the single-user
            // path below byte-identical (local Mac daemon unaffected).
            if (process.env.DAOBREW_MULTI_USER === "1") {
                const runOne = (uid) => job === "layer2-nightly"
                    ? (0, nightly_js_1.runNightlyThreadMaintenance)({ userId: uid, ...layer2ScopedDeps(uid) })
                    : (0, snapshot_js_1.runWeeklySnapshotJob)({ userId: uid, ...layer2ScopedDeps(uid) });
                const multi = await runForAllUsers(runOne);
                console.log(JSON.stringify({ status: "ok", mode: "all_users", ...multi }, null, 2));
                if (multi.usersFailed > 0)
                    process.exit(2);
                return;
            }
            const userIdPlan = resolveInternalUserId({});
            if (!userIdPlan.ok) {
                console.log(JSON.stringify({ status: "skipped", reason: userIdPlan.reason }, null, 2));
                return;
            }
            const userId = userIdPlan.userId;
            // Mirrors the HTTP handlers: layer-2 jobs run on RLS GUC-scoped
            // executors for the user in scope (see layer2ScopedDeps).
            const deps = { userId, ...layer2ScopedDeps(userId) };
            const result = job === "layer2-nightly"
                ? await (0, nightly_js_1.runNightlyThreadMaintenance)(deps)
                : await (0, snapshot_js_1.runWeeklySnapshotJob)(deps);
            console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
            if (result.alerts.length > 0) {
                // Non-zero exit so a Cloud Scheduler cron surfaces the breach as a
                // failed run (design's "failed-cron email" alert channel).
                process.exit(2);
            }
            return;
        }
        if (job === "bootstrap") {
            const userIdPlan = resolveInternalUserId({});
            if (!userIdPlan.ok) {
                console.log(JSON.stringify({ status: "skipped", reason: userIdPlan.reason }, null, 2));
                return;
            }
            if ((0, graph_db_js_1.graphStoreKind)() !== "postgres") {
                console.error(JSON.stringify({
                    status: "error",
                    error: "bootstrap requires DAOBREW_GRAPH_STORE=postgres (warm-tier ingest and layer-2 memory are Postgres-only)",
                }));
                process.exit(1);
            }
            const userId = userIdPlan.userId;
            const days = Number(process.env.DAOBREW_BOOTSTRAP_DAYS ?? bootstrap_js_1.BOOTSTRAP_DEFAULT_DAYS);
            const result = await (0, bootstrap_js_1.runBootstrap)({ userId, days, embedSweep: runEmbedSweep });
            console.log(JSON.stringify({ status: result.ok ? "ok" : "partial", ...result }, null, 2));
            // Mirror the layer2/embed-sweep convention: non-zero exit surfaces a
            // partial bootstrap to a wizard/cron caller without hiding the report.
            if (!result.ok)
                process.exit(2);
            return;
        }
        if (job !== "embed-sweep") {
            console.error(JSON.stringify({ status: "error", error: `unknown --run job: ${job}` }));
            process.exit(1);
        }
        const result = await runEmbedSweep();
        console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
        if (result.alerts.length > 0) {
            // Non-zero exit so a Cloud Scheduler cron surfaces the breach as a
            // failed run (design's "failed-cron email" alert channel).
            process.exit(2);
        }
        return;
    }
    // Cloud Run marks the revision ready only after this process listens.  Keep
    // the socket closed until the shared backend/engine database has passed the
    // strict read-only schema + four-trigger contract in ensureSchema().
    prepareInternalServerStorage();
    const port = resolveInternalPort();
    const server = createInternalServer();
    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            // Another instance already owns the port — that instance is the server.
            // Exit 0 so a launchd KeepAlive={SuccessfulExit:false} agent does not
            // restart-thrash when the port is healthy and taken.
            console.log(JSON.stringify({ status: "already_running", port }));
            process.exit(0);
        }
        console.error(JSON.stringify({ status: "error", error: err.message }));
        process.exit(1);
    });
    server.listen(port, () => {
        console.log(JSON.stringify({ status: "listening", port }));
    });
}
if (require.main === module) {
    main().catch((err) => {
        console.error(JSON.stringify({ status: "error", error: err?.message ?? String(err) }));
        process.exit(1);
    });
}
