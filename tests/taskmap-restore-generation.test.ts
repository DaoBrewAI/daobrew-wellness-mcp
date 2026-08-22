import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

interface RestoreModule {
  parseArguments(argv: string[]): {
    commit: boolean;
    dryRun: boolean;
  };
}

async function restoreModule(): Promise<RestoreModule> {
  const url = pathToFileURL(path.join(
    process.cwd(),
    "scripts/taskmap-restore-generation.mjs",
  )).href;
  return await import(url) as RestoreModule;
}

describe("Task Map generation restore CLI", () => {
  it("defaults to a non-committing dry run", async () => {
    const { parseArguments } = await restoreModule();
    const parsed = parseArguments([]);
    assert.equal(parsed.commit, false);
    assert.equal(parsed.dryRun, false);
  });

  it("recognizes explicit dry-run and commit as separate modes", async () => {
    const { parseArguments } = await restoreModule();
    assert.deepEqual(
      {
        commit: parseArguments(["--commit"]).commit,
        dryRun: parseArguments(["--commit"]).dryRun,
      },
      { commit: true, dryRun: false },
    );
    assert.deepEqual(
      {
        commit: parseArguments(["--dry-run"]).commit,
        dryRun: parseArguments(["--dry-run"]).dryRun,
      },
      { commit: false, dryRun: true },
    );
  });

  it("fails closed when commit and dry-run are requested together", async () => {
    const { parseArguments } = await restoreModule();
    assert.throws(
      () => parseArguments(["--commit", "--dry-run"]),
      /--commit and --dry-run cannot be combined/,
    );
  });
});
