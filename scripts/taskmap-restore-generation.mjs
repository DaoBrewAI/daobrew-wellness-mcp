#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const DAO_ROOT = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "DaoBrew",
);
const DEFAULT_OWNERS_ROOT = path.join(DAO_ROOT, "owners");
const DEFAULT_BACKUPS_ROOT = path.join(DAO_ROOT, "backups");
const DEFAULT_GENERATION = "49c68b3b";
const FILES = Object.freeze({
  reference: "taskmap-current-generation.v1.json",
  manifest: "taskmap-generation-manifest.v1.json",
  projection: "taskmap-projection.v1.json",
  currentness: "taskmap-currentness.v1.json",
  ranking: "taskmap-task-ranking.v1.json",
  ready: "taskmap-ready-proof-targets.v1.json",
  journal: "taskmap-publication-journal.v1.json",
});
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const SHA256 = /^[a-f0-9]{64}$/;

const nativeRefreshUrl = pathToFileURL(path.join(
  PACKAGE_ROOT,
  "dist/src/engine/taskmap/native-refresh-service.js",
)).href;
const rankingUrl = pathToFileURL(path.join(
  PACKAGE_ROOT,
  "dist/src/engine/taskmap/task-ranking-publication.js",
)).href;
const sourceContractsUrl = pathToFileURL(path.join(
  PACKAGE_ROOT,
  "dist/src/engine/taskmap/source-contracts.js",
)).href;
const harnessUrl = pathToFileURL(path.join(
  PACKAGE_ROOT,
  "dist/src/engine/taskmap/harness.js",
)).href;

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function strictInstant(value, label) {
  const match = typeof value === "string" ? STRICT_RFC3339.exec(value) : null;
  if (match === null || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be a strict RFC3339 instant`);
  }
  const [, year, month, day, hour, minute, second, zone, offsetHour, offsetMinute] = match;
  if (
    Number(month) < 1
    || Number(month) > 12
    || Number(day) < 1
    || Number(day) > new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59
    || (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) fail(`${label} must be a real RFC3339 instant`);
  return new Date(value).toISOString();
}

export function parseArguments(argv) {
  const result = {
    commit: false,
    dryRun: false,
    generation: DEFAULT_GENERATION,
    ownerRoot: null,
    backupsRoot: DEFAULT_BACKUPS_ROOT,
    requestedAt: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--commit") {
      result.commit = true;
      continue;
    }
    if (argument === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (["--generation", "--owner-root", "--backups-root", "--requested-at"].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} requires a value`);
      }
      index += 1;
      if (argument === "--generation") result.generation = value;
      if (argument === "--owner-root") result.ownerRoot = path.resolve(value);
      if (argument === "--backups-root") result.backupsRoot = path.resolve(value);
      if (argument === "--requested-at") result.requestedAt = strictInstant(value, "requestedAt");
      continue;
    }
    fail(`unknown argument: ${argument}`);
  }
  if (!/^[a-f0-9]{8,64}$/.test(result.generation)) {
    fail("--generation must be an 8-64 character lowercase hex prefix");
  }
  if (result.commit && result.dryRun) {
    fail("--commit and --dry-run cannot be combined");
  }
  result.requestedAt ??= new Date().toISOString();
  return result;
}

function assertPrivateDirectory(directory, label) {
  const metadata = lstatSync(directory);
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== process.getuid()
    || (metadata.mode & 0o777) !== 0o700
    || realpathSync(directory) !== path.resolve(directory)
  ) fail(`${label} is not an owner-only real directory`);
}

function assertOwnerFile(filename, label) {
  const metadata = lstatSync(filename);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.uid !== process.getuid()
    || metadata.nlink !== 1
    || (metadata.mode & 0o777) !== 0o600
  ) fail(`${label} is not an owner-only regular file`);
}

function assertPrivateTree(root) {
  let files = 0;
  let bytes = 0;
  const visit = (directory) => {
    assertPrivateDirectory(directory, "Task Map tree directory");
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) fail("Task Map tree contains a symlink");
      if (metadata.isDirectory()) {
        visit(absolute);
        continue;
      }
      assertOwnerFile(absolute, "Task Map tree artifact");
      files += 1;
      bytes += metadata.size;
    }
  };
  visit(root);
  return { files, bytes };
}

function resolveOwnerRoot(explicitRoot) {
  if (explicitRoot !== null) return explicitRoot;
  assertPrivateDirectory(DEFAULT_OWNERS_ROOT, "DaoBrew owners directory");
  const candidates = readdirSync(DEFAULT_OWNERS_ROOT)
    .map((name) => path.join(DEFAULT_OWNERS_ROOT, name, "taskmap"))
    .filter((candidate) => existsSync(candidate));
  if (candidates.length !== 1) {
    fail("owner root is ambiguous; pass --owner-root explicitly");
  }
  return candidates[0];
}

function resolveGeneration(taskMapRoot, prefix) {
  const root = path.join(taskMapRoot, "taskmap-generations");
  assertPrivateDirectory(root, "Task Map generations directory");
  const matches = readdirSync(root)
    .filter((name) => name.startsWith(prefix))
    .map((name) => path.join(root, name))
    .filter((candidate) => lstatSync(candidate).isDirectory());
  if (matches.length !== 1) fail("generation prefix did not resolve uniquely");
  assertPrivateDirectory(matches[0], "selected generation directory");
  return matches[0];
}

function artifactReceiptMatches(directory, receipt) {
  if (
    receipt === null
    || typeof receipt !== "object"
    || typeof receipt.filename !== "string"
    || typeof receipt.sha256 !== "string"
    || !SHA256.test(receipt.sha256)
  ) return false;
  const filename = path.join(directory, receipt.filename);
  assertOwnerFile(filename, "generation artifact");
  return sha256(readFileSync(filename)) === receipt.sha256;
}

function readVerifiedGeneration(directory) {
  for (const filename of [
    FILES.manifest,
    FILES.projection,
    FILES.currentness,
    FILES.ranking,
    FILES.ready,
  ]) assertOwnerFile(path.join(directory, filename), filename);
  const manifest = readJson(path.join(directory, FILES.manifest));
  if (
    manifest.generationId !== path.basename(directory)
    || !SHA256.test(manifest.ownerScopeDigest)
    || manifest.candidateDigest !== manifest.generationId
    || !artifactReceiptMatches(directory, manifest.artifacts?.projection)
    || !artifactReceiptMatches(directory, manifest.artifacts?.currentness)
    || !artifactReceiptMatches(directory, manifest.artifacts?.ranking)
  ) fail("generation manifest or artifact receipts are invalid");
  return {
    directory,
    manifest,
    projection: readJson(path.join(directory, FILES.projection)),
    currentness: readJson(path.join(directory, FILES.currentness)),
    ranking: readJson(path.join(directory, FILES.ranking)),
  };
}

function currentGeneration(taskMapRoot) {
  const referencePath = path.join(taskMapRoot, FILES.reference);
  assertOwnerFile(referencePath, "current generation reference");
  const reference = readJson(referencePath);
  if (!SHA256.test(reference.generationId) || !SHA256.test(reference.ownerScopeDigest)) {
    fail("current generation reference is invalid");
  }
  const directory = path.join(
    taskMapRoot,
    "taskmap-generations",
    reference.generationId,
  );
  const generation = readVerifiedGeneration(directory);
  const manifestBytes = readFileSync(path.join(directory, FILES.manifest));
  if (
    reference.ownerScopeDigest !== generation.manifest.ownerScopeDigest
    || sha256(manifestBytes) !== reference.manifestDigest
  ) fail("current generation reference does not bind its manifest");
  return generation;
}

function communitySummary(projection) {
  const roots = projection.roots.filter((root) =>
    root.memberObjectRefs.some((ref) => ref.startsWith("community:"))
  );
  const rootIds = new Set(roots.map((root) => root.id));
  const tasks = projection.tasks.filter((task) => rootIds.has(task.rootId));
  const refs = roots.reduce((count, root) => count + root.memberObjectRefs.filter(
    (ref) => ref.startsWith("community:"),
  ).length, 0);
  return { roots: roots.length, tasks: tasks.length, communityRefs: refs };
}

function backupTree(taskMapRoot, backupsRoot, requestedAt) {
  mkdirSync(backupsRoot, { recursive: true, mode: 0o700 });
  chmodSync(backupsRoot, 0o700);
  assertPrivateDirectory(backupsRoot, "DaoBrew backups directory");
  const stamp = requestedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const backupDirectory = path.join(backupsRoot, `${stamp}-pre-restore`);
  if (existsSync(backupDirectory)) fail("backup destination already exists");
  mkdirSync(backupDirectory, { mode: 0o700 });
  cpSync(taskMapRoot, path.join(backupDirectory, "taskmap"), {
    recursive: true,
    errorOnExist: true,
    preserveTimestamps: true,
  });
  const stats = assertPrivateTree(path.join(backupDirectory, "taskmap"));
  return { backupDirectory, ...stats };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const taskMapRoot = resolveOwnerRoot(args.ownerRoot);
  const treeStats = assertPrivateTree(taskMapRoot);
  const selected = readVerifiedGeneration(resolveGeneration(
    taskMapRoot,
    args.generation,
  ));
  const current = currentGeneration(taskMapRoot);
  if (selected.manifest.ownerScopeDigest !== current.manifest.ownerScopeDigest) {
    fail("selected and current generations belong to different owners");
  }

  const [nativeRefresh, rankingModule, sourceContracts, harness] =
    await Promise.all([
      import(nativeRefreshUrl),
      import(rankingUrl),
      import(sourceContractsUrl),
      import(harnessUrl),
    ]);
  for (const [label, projection] of [
    ["selected", selected.projection],
    ["current", current.projection],
  ]) {
    const reasons = harness.taskMapProjectionArtifactValidationReasons(projection);
    if (projection.runStatus !== "accepted" || reasons.length !== 0) {
      fail(`${label} projection failed validation`);
    }
  }
  const selectedCommunity = communitySummary(selected.projection);
  if (
    selectedCommunity.roots === 0
    || selectedCommunity.tasks === 0
    || selectedCommunity.communityRefs === 0
  ) fail("selected generation has no recoverable community tree");
  const selectedRootIds = new Set(selected.projection.roots
    .filter((root) => root.memberObjectRefs.some((ref) => ref.startsWith("community:")))
    .map((root) => root.id));
  if (selected.projection.tasks.some((task) =>
    selectedRootIds.has(task.rootId)
    && (task.reviewState !== "proposed" || task.authority !== "none")
  )) fail("selected community work exceeds proposal-only authority");

  const acceptedCurrent = nativeRefresh.acceptedMembershipPredecessorProjection(
    current.projection,
    new Set(selected.projection.tasks.map((task) => task.id)),
  );
  const projection = acceptedCurrent === null
    ? structuredClone(selected.projection)
    : nativeRefresh.composeCurrentWorkProjections(
        selected.projection,
        acceptedCurrent,
      );
  const currentness = nativeRefresh.currentnessForNativeProjection(
    projection,
    current.currentness,
  );
  const coverageBySource = new Map();
  for (const generation of [selected, current]) {
    for (const row of generation.ranking.coverage) {
      const previous = coverageBySource.get(row.source);
      if (previous === undefined || row.state === "current") {
        coverageBySource.set(row.source, row);
      }
    }
  }
  const ranking = rankingModule.buildTaskMapTaskRankingPublication({
    projection,
    ownerScopeDigest: current.manifest.ownerScopeDigest,
    sourceStatuses: [...coverageBySource.values()].map((row) => ({
      source: row.source,
      disposition: row.state === "current" ? "retained_last_good" : "unavailable",
      sliceDigest: row.sliceDigest,
    })),
  });
  const candidate = {
    contractVersion: nativeRefresh.TASKMAP_NATIVE_PUBLICATION_CANDIDATE_VERSION,
    projection,
    currentness,
    ranking,
  };
  const canonicalCandidate = sourceContracts.taskMapContractCanonicalJson(candidate);
  const candidateDigest = sha256(canonicalCandidate);
  const graphInputDigest = sourceContracts.taskMapContractDigest({
    domain: "taskmap-generation-restoration.v1",
    selectedGenerationId: selected.manifest.generationId,
    predecessorGenerationId: current.manifest.generationId,
    successorProjectionDigest: currentness.projectionDigest,
  });
  const successorCommunity = communitySummary(projection);
  const summary = {
    status: args.commit ? "ready_to_commit" : "dry_run",
    ownerScopeDigest: current.manifest.ownerScopeDigest,
    selectedGenerationId: selected.manifest.generationId,
    predecessorGenerationId: current.manifest.generationId,
    candidateDigest,
    sourceTree: treeStats,
    selected: {
      roots: selected.projection.roots.length,
      tasks: selected.projection.tasks.length,
      ...selectedCommunity,
    },
    successor: {
      roots: projection.roots.length,
      tasks: projection.tasks.length,
      ...successorCommunity,
      retainedAcceptedTasks: acceptedCurrent?.tasks.length ?? 0,
    },
  };
  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  const backup = backupTree(taskMapRoot, args.backupsRoot, args.requestedAt);
  const publication = await nativeRefresh.publishTaskMapNativeProjection(
    path.join(taskMapRoot, FILES.projection),
    path.join(taskMapRoot, FILES.currentness),
    path.join(taskMapRoot, FILES.journal),
    {
      graphInputDigest,
      candidateDigest,
      candidate,
      requestedAtMs: Date.parse(args.requestedAt),
      expectedOwnerScopeDigest: current.manifest.ownerScopeDigest,
    },
  );
  const installed = currentGeneration(taskMapRoot);
  if (installed.manifest.generationId !== candidateDigest) {
    fail("restoration publication did not become the current generation");
  }
  const installedCommunity = communitySummary(installed.projection);
  if (
    installedCommunity.roots !== successorCommunity.roots
    || installedCommunity.tasks !== successorCommunity.tasks
    || installedCommunity.communityRefs !== successorCommunity.communityRefs
  ) fail("installed community tree does not match the staged successor");
  const journalPath = path.join(taskMapRoot, FILES.journal);
  if (existsSync(journalPath)) unlinkSync(journalPath);
  process.stdout.write(`${JSON.stringify({
    ...summary,
    status: "published",
    backup,
    publication,
  })}\n`);
}

if (
  process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
