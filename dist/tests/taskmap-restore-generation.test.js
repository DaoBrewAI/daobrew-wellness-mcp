"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const node_url_1 = require("node:url");
async function restoreModule() {
    const url = (0, node_url_1.pathToFileURL)(node_path_1.default.join(process.cwd(), "scripts/taskmap-restore-generation.mjs")).href;
    return await import(url);
}
(0, node_test_1.describe)("Task Map generation restore CLI", () => {
    (0, node_test_1.it)("defaults to a non-committing dry run", async () => {
        const { parseArguments } = await restoreModule();
        const parsed = parseArguments([]);
        strict_1.default.equal(parsed.commit, false);
        strict_1.default.equal(parsed.dryRun, false);
    });
    (0, node_test_1.it)("recognizes explicit dry-run and commit as separate modes", async () => {
        const { parseArguments } = await restoreModule();
        strict_1.default.deepEqual({
            commit: parseArguments(["--commit"]).commit,
            dryRun: parseArguments(["--commit"]).dryRun,
        }, { commit: true, dryRun: false });
        strict_1.default.deepEqual({
            commit: parseArguments(["--dry-run"]).commit,
            dryRun: parseArguments(["--dry-run"]).dryRun,
        }, { commit: false, dryRun: true });
    });
    (0, node_test_1.it)("fails closed when commit and dry-run are requested together", async () => {
        const { parseArguments } = await restoreModule();
        strict_1.default.throws(() => parseArguments(["--commit", "--dry-run"]), /--commit and --dry-run cannot be combined/);
    });
});
