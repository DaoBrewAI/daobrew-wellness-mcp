#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const SHOWCASE_URL = pathToFileURL(path.join(
  PACKAGE_ROOT,
  "dist/src/engine/taskmap/showcase-source.js",
)).href;

function parseOwnerRoot(argv) {
  let ownerRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--owner-root") {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (ownerRoot !== undefined) {
      throw new Error("duplicate --owner-root");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--owner-root is required");
    }
    ownerRoot = value;
    index += 1;
  }
  if (ownerRoot === undefined) {
    throw new Error("--owner-root is required");
  }
  return ownerRoot;
}

async function main() {
  const ownerRoot = parseOwnerRoot(process.argv.slice(2));
  const { publishTaskMapShowcase } = await import(SHOWCASE_URL);
  const result = await publishTaskMapShowcase({ ownerRoot });
  const currentSources = result.refresh.sourceStatuses.filter(
    (status) => status.state === "current",
  ).length;
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    refreshStatus: result.refresh.refreshStatus,
    currentSources,
    totalSources: result.refresh.sourceStatuses.length,
  })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error
    ? error.message
    : "Task Map showcase failed";
  process.stderr.write(`taskmap-showcase: ${message}\n`);
  process.exitCode = 1;
});
