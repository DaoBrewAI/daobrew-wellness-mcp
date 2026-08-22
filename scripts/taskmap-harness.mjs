#!/usr/bin/env node
/**
 * Replay the versioned Task Map harness from privacy-bounded JSON artifacts.
 *
 * This command is intentionally offline. It reads only the absolute file paths
 * named on the command line; source pointers remain opaque and are never
 * followed. It does not inspect environment variables, credentials, network
 * resources, transcripts, or raw biometric stores.
 *
 * Usage:
 *   npm run build
 *   node scripts/taskmap-harness.mjs \
 *     --arm E4 \
 *     --input /absolute/path/taskmap-input.json \
 *     --brain /absolute/path/semantic-brain.json \
 *     --previous /absolute/path/previous-projection.json \
 *     --causal /absolute/path/causal-inputs.json \
 *     --output /absolute/path/taskmap-projection.json \
 *     --ablation /absolute/path/taskmap-ablation.json
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const HARNESS_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/harness.js"),
).href;
const TYPES_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/types.js"),
).href;
const ARMS = new Set(["E0", "E1", "E2", "E3", "E4"]);
const VALUE_FLAGS = new Set([
  "--arm",
  "--input",
  "--brain",
  "--previous",
  "--causal",
  "--output",
  "--ablation",
  "--now",
]);

const USAGE = `Usage:
  node scripts/taskmap-harness.mjs \\
    --arm E0|E1|E2|E3|E4 \\
    --input /absolute/path/taskmap-input.json \\
    --output /absolute/path/taskmap-projection.json \\
    [--brain /absolute/path/semantic-brain.json] \\
    [--previous /absolute/path/previous-projection.json] \\
    [--causal /absolute/path/causal-inputs.json] \\
    [--ablation /absolute/path/taskmap-ablation.json] \\
    [--now 2026-07-26T20:00:00.000Z]

The causal JSON file must contain a JSON array. --ablation requires --brain.
Every file path must be absolute; no source pointer is dereferenced.`;

function fail(message) {
  throw new Error(message);
}

function isStrictRfc3339(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_FLAGS.has(flag)) fail(`unknown argument: ${flag}`);
    if (Object.hasOwn(args, flag)) fail(`duplicate argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${flag}`);
    args[flag] = value;
    index += 1;
  }
  for (const flag of ["--arm", "--input", "--output"]) {
    if (!args[flag]) fail(`required argument missing: ${flag}`);
  }
  if (!ARMS.has(args["--arm"])) {
    fail(`--arm must be one of E0, E1, E2, E3, E4`);
  }
  if (args["--ablation"] && !args["--brain"]) {
    fail("--ablation requires --brain");
  }
  if (args["--arm"] !== "E0" && !args["--brain"]) {
    fail("--brain is required for E1, E2, E3, and E4");
  }
  if (args["--arm"] === "E0" && args["--brain"] && !args["--ablation"]) {
    fail("--brain is only valid with E0 when --ablation is requested");
  }
  if (
    args["--previous"]
    && !["E3", "E4"].includes(args["--arm"])
    && !args["--ablation"]
  ) {
    fail("--previous is only valid for E3/E4 or an ablation run");
  }
  if (
    args["--causal"]
    && args["--arm"] !== "E4"
    && !args["--ablation"]
  ) {
    fail("--causal is only valid for E4 or an ablation run");
  }
  if (args["--now"] && !isStrictRfc3339(args["--now"])) {
    fail("--now must be RFC3339 with an explicit timezone");
  }
  return {
    help: false,
    arm: args["--arm"],
    inputPath: args["--input"],
    brainPath: args["--brain"],
    previousPath: args["--previous"],
    causalPath: args["--causal"],
    outputPath: args["--output"],
    ablationPath: args["--ablation"],
    now: args["--now"],
  };
}

function assertAbsoluteFilePath(label, value) {
  if (!path.isAbsolute(value)) fail(`${label} must be an absolute path`);
  return path.normalize(value);
}

function canonicalTargetPath(filePath) {
  if (existsSync(filePath)) return realpathSync(filePath);
  const unresolved = [];
  let cursor = filePath;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) fail(`cannot resolve path: ${filePath}`);
    unresolved.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.join(realpathSync(cursor), ...unresolved);
}

function sameExistingFile(left, right) {
  if (!existsSync(left) || !existsSync(right)) return false;
  const leftStat = statSync(left);
  const rightStat = statSync(right);
  return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
}

function resolvePaths(args) {
  const paths = {
    inputPath: assertAbsoluteFilePath("--input", args.inputPath),
    outputPath: assertAbsoluteFilePath("--output", args.outputPath),
  };
  for (const [key, flag] of [
    ["brainPath", "--brain"],
    ["previousPath", "--previous"],
    ["causalPath", "--causal"],
    ["ablationPath", "--ablation"],
  ]) {
    if (args[key]) paths[key] = assertAbsoluteFilePath(flag, args[key]);
  }

  const reads = [
    paths.inputPath,
    paths.brainPath,
    paths.previousPath,
    paths.causalPath,
  ].filter(Boolean);
  const writes = [paths.outputPath, paths.ablationPath].filter(Boolean);
  const canonicalReads = reads.map(canonicalTargetPath);
  const canonicalWrites = writes.map(canonicalTargetPath);
  if (
    new Set(canonicalWrites).size !== canonicalWrites.length
    || (writes.length === 2 && sameExistingFile(writes[0], writes[1]))
  ) {
    fail("--output and --ablation must be different paths");
  }
  for (let outputIndex = 0; outputIndex < writes.length; outputIndex += 1) {
    for (let readIndex = 0; readIndex < reads.length; readIndex += 1) {
      if (
        canonicalWrites[outputIndex] === canonicalReads[readIndex]
        || sameExistingFile(writes[outputIndex], reads[readIndex])
      ) {
        fail("refusing to overwrite an input artifact");
      }
    }
  }
  return paths;
}

function readJson(label, filePath) {
  if (!existsSync(filePath)) fail(`${label} does not exist: ${filePath}`);
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`failed to read ${label}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertObject(label, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must contain a JSON object`);
  }
}

function assertArrayField(label, value, field) {
  if (!Array.isArray(value[field])) fail(`${label}.${field} must be an array`);
}

function validateInputShape(input, contractVersion) {
  assertObject("input", input);
  if (input.contractVersion !== contractVersion) {
    fail(`input.contractVersion must be ${contractVersion}`);
  }
  if (!isStrictRfc3339(input.generatedAt)) {
    fail("input.generatedAt must be RFC3339 with an explicit timezone");
  }
  assertArrayField("input", input, "pointers");
  assertArrayField("input", input, "events");
}

function validateBrainShape(brain, contractVersion) {
  assertObject("brain", brain);
  if (brain.contractVersion !== contractVersion) {
    fail(`brain.contractVersion must be ${contractVersion}`);
  }
  for (const field of ["provider", "model", "promptHash", "inputDigest"]) {
    if (typeof brain[field] !== "string") fail(`brain.${field} must be a string`);
  }
  if (!isStrictRfc3339(brain.generatedAt)) {
    fail("brain.generatedAt must be RFC3339 with an explicit timezone");
  }
  for (const field of ["roots", "tasks", "edges"]) {
    assertArrayField("brain", brain, field);
  }
}

function validatePreviousShape(previous, contractVersion) {
  assertObject("previous projection", previous);
  if (previous.contractVersion !== contractVersion) {
    fail(`previous projection.contractVersion must be ${contractVersion}`);
  }
  if (!ARMS.has(previous.arm)) fail("previous projection.arm is invalid");
  for (const field of ["roots", "tasks", "edges", "rejections"]) {
    assertArrayField("previous projection", previous, field);
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryDirectory = mkdtempSync(path.join(directory, ".taskmap-write-"));
  chmodSync(temporaryDirectory, 0o700);
  const temporary = path.join(temporaryDirectory, "artifact.tmp");
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const temporaryStat = lstatSync(temporary);
    if (!temporaryStat.isFile() || temporaryStat.isSymbolicLink()) {
      fail("temporary projection artifact must be a regular file");
    }
    renameSync(temporary, filePath);
    rmdirSync(temporaryDirectory);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    if (existsSync(temporaryDirectory)) rmdirSync(temporaryDirectory);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const paths = resolvePaths(args);

  let harness;
  let types;
  try {
    [harness, types] = await Promise.all([
      import(HARNESS_URL),
      import(TYPES_URL),
    ]);
  } catch (error) {
    fail(`compiled Task Map harness is unavailable; run npm run build first (${error.message})`);
  }

  const input = readJson("input", paths.inputPath);
  validateInputShape(input, types.TASKMAP_CONTRACT_VERSION);
  const brain = paths.brainPath ? readJson("brain", paths.brainPath) : null;
  if (brain) validateBrainShape(brain, types.TASKMAP_CONTRACT_VERSION);
  const previousProjection = paths.previousPath
    ? readJson("previous projection", paths.previousPath)
    : undefined;
  if (previousProjection) {
    validatePreviousShape(previousProjection, types.TASKMAP_CONTRACT_VERSION);
  }
  const causalInputs = paths.causalPath
    ? readJson("causal inputs", paths.causalPath)
    : undefined;
  if (causalInputs && !Array.isArray(causalInputs)) {
    fail("causal inputs must contain a JSON array");
  }

  const options = {
    arm: args.arm,
    ...(args.now ? { now: args.now } : {}),
    ...(previousProjection ? { previousProjection } : {}),
    ...(causalInputs ? { causalInputs } : {}),
  };
  const projection = harness.buildTaskMapProjection(input, brain, options);
  writeJsonAtomic(paths.outputPath, projection);

  let ablation;
  let ablationRejected = false;
  if (paths.ablationPath) {
    const ablationOptions = {
      ...(args.now ? { now: args.now } : {}),
      ...(previousProjection ? { previousProjection } : {}),
      ...(causalInputs ? { causalInputs } : {}),
    };
    const semanticPreflight = harness.buildTaskMapProjection(input, brain, {
      arm: "E1",
      ...(args.now ? { now: args.now } : {}),
    });
    if (semanticPreflight.runStatus === "accepted") {
      ablation = harness.runTaskMapAblation(input, brain, ablationOptions);
      ablationRejected = ablation.arms.some((arm) => arm.runStatus !== "accepted");
      writeJsonAtomic(paths.ablationPath, ablation);
    } else {
      ablationRejected = true;
    }
  }

  process.stdout.write(`${JSON.stringify({
    runId: projection.runId,
    runStatus: projection.runStatus,
    arm: projection.arm,
    roots: projection.roots.length,
    tasks: projection.tasks.length,
    rejections: projection.rejections.length,
    ablation: Boolean(ablation),
    ablationStatus: paths.ablationPath
      ? (ablationRejected ? "rejected" : "accepted")
      : "not_requested",
  })}\n`);
  if (projection.runStatus !== "accepted" || ablationRejected) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`taskmap-harness: ${error.message}\n`);
  process.exitCode = 1;
});
