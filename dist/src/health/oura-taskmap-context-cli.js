#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOuraTaskMapContextCliArgs = parseOuraTaskMapContextCliArgs;
exports.resolveOuraTaskMapContextRange = resolveOuraTaskMapContextRange;
exports.runOuraTaskMapContextCli = runOuraTaskMapContextCli;
const node_path_1 = require("node:path");
const oura_taskmap_context_js_1 = require("./oura-taskmap-context.js");
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BACKFILL_DAYS = 90;
const USAGE = `Usage:
  daobrew-oura-taskmap-context \\
    --output /absolute/path/oura-taskmap-context.json \\
    [--start-date YYYY-MM-DD] \\
    [--end-date YYYY-MM-DD] \\
    [--backfill-days N] \\
    [--now RFC3339]

The inclusive range defaults to the preceding ${DEFAULT_BACKFILL_DAYS} days.
Use --start-date for an explicit longer history. --start-date and
--backfill-days are mutually exclusive. This command reads Oura only; it never
pushes samples to a backend and never serializes raw biometric values.`;
function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed)
        && new Date(parsed).toISOString().slice(0, 10) === value;
}
function validNow(value) {
    return /^\d{4}-\d{2}-\d{2}T/.test(value)
        && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        && Number.isFinite(Date.parse(value));
}
function parseOuraTaskMapContextCliArgs(argv) {
    if (argv.includes("--help") || argv.includes("-h"))
        return { help: true };
    const valueFlags = new Set([
        "--output",
        "--start-date",
        "--end-date",
        "--backfill-days",
        "--now",
    ]);
    const values = new Map();
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (!valueFlags.has(flag))
            throw new Error(`unknown argument: ${flag}`);
        if (values.has(flag))
            throw new Error(`duplicate argument: ${flag}`);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
            throw new Error(`missing value for ${flag}`);
        }
        values.set(flag, value);
        index += 1;
    }
    const outputPath = values.get("--output");
    if (!outputPath)
        throw new Error("--output is required");
    if (!(0, node_path_1.isAbsolute)(outputPath))
        throw new Error("--output must be an absolute path");
    const startDate = values.get("--start-date");
    const endDate = values.get("--end-date");
    if (startDate && !validDay(startDate)) {
        throw new Error("--start-date must be YYYY-MM-DD");
    }
    if (endDate && !validDay(endDate)) {
        throw new Error("--end-date must be YYYY-MM-DD");
    }
    const backfillText = values.get("--backfill-days");
    const backfillDays = backfillText === undefined
        ? undefined
        : Number(backfillText);
    if (backfillDays !== undefined
        && (!Number.isInteger(backfillDays) || backfillDays <= 0)) {
        throw new Error("--backfill-days must be a positive integer");
    }
    if (startDate && backfillDays !== undefined) {
        throw new Error("--start-date and --backfill-days are mutually exclusive");
    }
    const nowText = values.get("--now");
    if (nowText && !validNow(nowText)) {
        throw new Error("--now must be RFC3339 with an explicit timezone");
    }
    return {
        help: false,
        outputPath,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(backfillDays !== undefined ? { backfillDays } : {}),
        ...(nowText ? { now: new Date(nowText) } : {}),
    };
}
function resolveOuraTaskMapContextRange(args) {
    const now = args.now ?? new Date();
    if (!Number.isFinite(now.getTime()))
        throw new Error("now must be valid");
    const endDate = args.endDate ?? now.toISOString().slice(0, 10);
    const endMs = Date.parse(`${endDate}T00:00:00.000Z`);
    const backfillDays = args.backfillDays ?? DEFAULT_BACKFILL_DAYS;
    const startDate = args.startDate ?? new Date(endMs - (backfillDays - 1) * DAY_MS).toISOString().slice(0, 10);
    if (Date.parse(`${startDate}T00:00:00.000Z`) > endMs) {
        throw new Error("requested Oura date range is reversed");
    }
    return { startDate, endDate, now };
}
function safeErrorMessage(error) {
    const message = error instanceof Error ? error.message : "Oura context export failed";
    return message
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
        .replace(/\b(?:access|refresh)[_-]?token\b[^,\n]*/gi, "token [redacted]");
}
async function runOuraTaskMapContextCli(argv) {
    const args = parseOuraTaskMapContextCliArgs(argv);
    if (args.help) {
        process.stdout.write(`${USAGE}\n`);
        return;
    }
    const range = resolveOuraTaskMapContextRange(args);
    const document = await (0, oura_taskmap_context_js_1.fetchOuraTaskMapContext)(range);
    (0, oura_taskmap_context_js_1.writeOuraTaskMapContextAtomic)(args.outputPath, document);
    process.stdout.write(`${JSON.stringify((0, oura_taskmap_context_js_1.summarizeOuraTaskMapContext)(document))}\n`);
}
if (require.main === module) {
    runOuraTaskMapContextCli(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`oura-taskmap-context: ${safeErrorMessage(error)}\n`);
        process.exitCode = 1;
    });
}
