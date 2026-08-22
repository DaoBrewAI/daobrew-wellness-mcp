#!/usr/bin/env node
/**
 * Rebuild one owner-only Task Map run from:
 *   1) a previously bounded real-work input,
 *   2) a Codex-reviewed semantic proposal, and
 *   3) a fresh privacy-safe Oura context document.
 *
 * This command never dereferences work-source pointers and never calls a
 * backend. The Oura exporter is a separate read-only step. The caller remains
 * responsible for reviewing the bounded work input/brain before invoking this
 * replay. This script first proves the reviewed brain was bound to that base
 * input, then rebases only its timestamp/digest for the fresh body-only read.
 */
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const HARNESS_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/harness.js"),
).href;
const BODY_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/body-context.js"),
).href;
const OURA_CONTEXT_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/health/oura-taskmap-context.js"),
).href;

const VALUE_FLAGS = new Set([
  "--base-input",
  "--reviewed-brain",
  "--oura-context",
  "--output-dir",
  "--now",
]);

function fail(message) {
  throw new Error(message);
}

function strictTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!VALUE_FLAGS.has(flag)) fail(`unknown argument: ${flag}`);
    if (values.has(flag)) fail(`duplicate argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing value for ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  for (const flag of VALUE_FLAGS) {
    if (!values.has(flag)) fail(`required argument missing: ${flag}`);
  }
  for (const flag of [
    "--base-input",
    "--reviewed-brain",
    "--oura-context",
    "--output-dir",
  ]) {
    if (!path.isAbsolute(values.get(flag))) fail(`${flag} must be an absolute path`);
  }
  if (!strictTimestamp(values.get("--now"))) {
    fail("--now must be RFC3339 with an explicit timezone");
  }
  return {
    baseInputPath: path.normalize(values.get("--base-input")),
    brainPath: path.normalize(values.get("--reviewed-brain")),
    ouraContextPath: path.normalize(values.get("--oura-context")),
    outputDirectory: path.normalize(values.get("--output-dir")),
    now: values.get("--now"),
  };
}

function readJson(label, filePath, maximumBytes = 4 * 1_024 * 1_024) {
  if (!existsSync(filePath)) fail(`${label} does not exist`);
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`${label} must be a regular non-symbolic file`);
  }
  if (metadata.size > maximumBytes) fail(`${label} exceeds its size limit`);
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

function digest(value) {
  return createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value),
  ).digest("hex");
}

function freshOutputDirectory(outputDirectory) {
  if (existsSync(outputDirectory)) {
    fail("--output-dir must be a new directory");
  }
  const parentDirectory = path.dirname(outputDirectory);
  let canonicalParent;
  try {
    canonicalParent = realpathSync(parentDirectory);
  } catch {
    fail("--output-dir parent must already exist");
  }
  const canonicalOutput = path.join(
    canonicalParent,
    path.basename(outputDirectory),
  );
  if (existsSync(canonicalOutput)) {
    fail("--output-dir resolves to an existing path");
  }
  return canonicalOutput;
}

function bodyTitle(category) {
  switch (category) {
    case "below_baseline":
      return "Body window was below the personal baseline";
    case "within_baseline":
      return "Body window was within the personal baseline";
    case "above_baseline":
      return "Body window was above the personal baseline";
    default:
      return "Body coverage was insufficient for a relative category";
  }
}

function bodyEvents(context, pointerId) {
  return context.days.map((day) => ({
    id: `event-body-${day.dayKey}`,
    pointerId,
    recordKind: "body_context",
    activity: "body_window_observed",
    occurredAt: `${day.dayKey}T00:00:00.000Z`,
    observedAt: context.generatedAt,
    objectRefs: [`body-day:${day.dayKey}`],
    title: bodyTitle(day.category),
    summary: "Relative category only; no raw biometric value is stored.",
    extractionConfidence: 1,
    bodyCategory: day.category,
    bodyAxis: day.axis,
    dayKey: day.dayKey,
  }));
}

function safeWorkLineage(input) {
  const pointersById = new Map(input.pointers.map((pointer) => [pointer.id, pointer]));
  const rows = new Map();
  for (const event of input.events) {
    const kind = pointersById.get(event.pointerId)?.sourceKind;
    if (!kind || kind === "oura") continue;
    const current = rows.get(kind) ?? {
      sourceKind: kind,
      pointers: new Set(),
      events: 0,
      latestOccurredAt: null,
    };
    current.pointers.add(event.pointerId);
    current.events += 1;
    if (
      typeof event.occurredAt === "string"
      && (current.latestOccurredAt === null || event.occurredAt > current.latestOccurredAt)
    ) {
      current.latestOccurredAt = event.occurredAt;
    }
    rows.set(kind, current);
  }
  return [...rows.values()]
    .map((row) => ({
      sourceKind: row.sourceKind,
      pointerCount: row.pointers.size,
      eventCount: row.events,
      latestOccurredAt: row.latestOccurredAt,
    }))
    .sort((left, right) => left.sourceKind.localeCompare(right.sourceKind));
}

function atomicWrite(directory, filename, value) {
  const directoryMetadata = lstatSync(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    fail("Task Map output directory must remain a real directory");
  }
  const temporaryDirectory = mkdtempSync(path.join(directory, ".taskmap-owner-run-"));
  chmodSync(temporaryDirectory, 0o700);
  const temporaryPath = path.join(temporaryDirectory, filename);
  const outputPath = path.join(directory, filename);
  if (existsSync(outputPath)) {
    rmdirSync(temporaryDirectory);
    fail(`refusing to overwrite Task Map run artifact: ${filename}`);
  }
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    chmodSync(temporaryPath, 0o600);
    // A hard-link publish is same-filesystem and fails if outputPath appears
    // between the preflight and publish. Unlike rename(), it never overwrites.
    linkSync(temporaryPath, outputPath);
    unlinkSync(temporaryPath);
    chmodSync(outputPath, 0o600);
    rmdirSync(temporaryDirectory);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (existsSync(temporaryDirectory)) rmdirSync(temporaryDirectory);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDirectory = freshOutputDirectory(args.outputDirectory);
  const {
    buildTaskMapProjection,
    runTaskMapAblation,
    taskMapInputDigest,
    taskMapSemanticInputDigest,
  } = await import(HARNESS_URL);
  const { buildTaskMapBodyContextDisclosure } = await import(BODY_URL);
  const { assertOwnerSafeOuraTaskMapContext } = await import(OURA_CONTEXT_URL);

  const baseInput = readJson("base input", args.baseInputPath);
  const reviewedBrain = readJson("reviewed brain", args.brainPath);
  const ouraContext = readJson("Oura context", args.ouraContextPath, 2 * 1_024 * 1_024);
  assertOwnerSafeOuraTaskMapContext(ouraContext);
  const reviewedSemanticInputDigest = taskMapSemanticInputDigest(baseInput);
  if (reviewedBrain.inputDigest !== reviewedSemanticInputDigest) {
    fail("reviewed brain semantic input digest does not match base input");
  }
  if (ouraContext.generatedAt !== args.now) {
    fail("Oura context generatedAt must equal --now");
  }

  const ouraPointer = baseInput.pointers.find((pointer) => pointer.sourceKind === "oura");
  if (!ouraPointer) fail("base input has no bounded Oura pointer");

  const retainedWorkEvents = baseInput.events.filter(
    (event) => event.pointerId !== ouraPointer.id,
  );
  const input = {
    ...baseInput,
    generatedAt: args.now,
    events: [
      ...retainedWorkEvents,
      {
        id: "event-oura-provider-read",
        pointerId: ouraPointer.id,
        recordKind: "receipt",
        activity: "receipt_observed",
        occurredAt: args.now,
        observedAt: args.now,
        objectRefs: [
          "workstream:evidence-reliability",
          "receipt:oura-provider-read",
        ],
        title: "The authorized Oura provider history was readable",
        summary:
          "Daily and heart-rate history were read from the provider without backend upload or production mutation.",
        extractionConfidence: 1,
      },
      ...bodyEvents(ouraContext, ouraPointer.id),
    ],
  };

  const brain = {
    ...reviewedBrain,
    provider: "codex-reviewed-replay",
    inputDigest: taskMapSemanticInputDigest(input),
    // The bounded proposals were reviewed for this replay, but no fresh model
    // call occurred. The timestamp records that review; the provider label and
    // manifest preserve that the semantic proposal content was reused.
    generatedAt: args.now,
  };
  const e0 = buildTaskMapProjection(input, null, { arm: "E0", now: args.now });
  const e1 = buildTaskMapProjection(input, brain, { arm: "E1", now: args.now });
  const e2 = buildTaskMapProjection(input, brain, { arm: "E2", now: args.now });
  const e3 = buildTaskMapProjection(input, brain, {
    arm: "E3",
    now: args.now,
    previousProjection: e2,
  });
  const e4 = buildTaskMapProjection(input, brain, {
    arm: "E4",
    now: args.now,
    previousProjection: e3,
  });
  const projections = [e0, e1, e2, e3, e4];
  const rejected = projections.filter((projection) => projection.runStatus !== "accepted");
  if (rejected.length > 0) {
    fail(`Task Map replay rejected: ${JSON.stringify(rejected.map((item) => ({
      arm: item.arm,
      rejections: item.rejections,
    })))}`);
  }
  const ablation = runTaskMapAblation(input, brain, {
    now: args.now,
    previousProjection: e3,
  });
  if (
    ablation.arms.some((arm) => arm.runStatus !== "accepted")
    || ablation.controls.bodyMaskMembershipStable !== true
    || ablation.controls.bodyShuffleMembershipStable !== true
  ) {
    fail("Task Map ablation controls did not pass");
  }
  const disclosure = buildTaskMapBodyContextDisclosure(input, e4, ouraContext);
  const lineage = safeWorkLineage(input);
  const manifest = {
    contractVersion: "taskmap-owner-run.v1",
    generatedAt: args.now,
    baseInputDigest: taskMapInputDigest(baseInput),
    baseSemanticInputDigest: reviewedSemanticInputDigest,
    reviewedBrainDigest: digest(reviewedBrain),
    reviewedBrain: {
      provider: reviewedBrain.provider,
      model: reviewedBrain.model,
      generatedAt: reviewedBrain.generatedAt,
      replayProvider: brain.provider,
      semanticsReused: true,
    },
    inputDigest: e4.inputDigest,
    semanticInputDigest: taskMapSemanticInputDigest(input),
    workSources: lineage,
    oura: {
      contractVersion: ouraContext.contractVersion,
      generatedAt: ouraContext.generatedAt,
      coverage: ouraContext.coverage,
      classifierVersion: ouraContext.classifier.version,
    },
    output: {
      runId: e4.runId,
      roots: e4.roots.length,
      tasks: e4.tasks.length,
      edges: e4.edges.length,
      bodyRoots: e4.roots.filter((root) => root.bodyContextCount > 0).length,
      bodyTasks: e4.tasks.filter((task) => task.bodyContextCount > 0).length,
      disclosureNodes: disclosure.nodes.length,
    },
    privacy: {
      sourceBodiesStored: false,
      rawBiometricsStored: false,
      localPathsStored: false,
    },
  };

  const outputs = [
    ["input.json", input],
    ["semantic-brain.codex.json", brain],
    ["projection-e0.json", e0],
    ["projection-e1.json", e1],
    ["projection-e2.json", e2],
    ["projection-e3.json", e3],
    ["projection-e4.json", e4],
    ["ablation.json", ablation],
    ["oura-taskmap-context.v1.json", ouraContext],
    ["taskmap-body-context.v1.json", disclosure],
    ["manifest.json", manifest],
  ];
  mkdirSync(outputDirectory, { mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  for (const [filename, value] of outputs) {
    atomicWrite(outputDirectory, filename, value);
  }
  process.stdout.write(`${JSON.stringify({
    status: "ok",
    generatedAt: args.now,
    runId: e4.runId,
    roots: e4.roots.length,
    tasks: e4.tasks.length,
    bodyRoots: manifest.output.bodyRoots,
    bodyTasks: manifest.output.bodyTasks,
    workSources: lineage,
    ouraCoverage: ouraContext.coverage,
  })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Task Map owner refresh failed";
  process.stderr.write(`taskmap-owner-refresh: ${message}\n`);
  process.exitCode = 1;
});
