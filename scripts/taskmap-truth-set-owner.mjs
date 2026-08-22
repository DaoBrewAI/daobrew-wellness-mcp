#!/usr/bin/env node
/**
 * Bind the reviewed P9.3 truth labels to the ignored P9.2 owner manifest
 * without copying any provider identifier or source content into the output.
 *
 * The CLI always writes one new immutable run below the current user's
 * Application Support Task Map root. The run directory and artifact are
 * created with 0700/0600 permissions and existing runs are never reused.
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const TRUTH_SET_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/truth-set.js"),
).href;
const SOURCE_CONTRACT_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist/src/engine/taskmap/source-contracts.js"),
).href;
const OUTPUT_FILENAME = "taskmap-truth-set.v2.json";
const VALUE_FLAGS = new Set([
  "--source-manifest",
  "--truth-set-fixture",
  "--expected-truth-set-digest",
  "--expected-review-batch-digest",
  "--run-id",
  "--now",
]);
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const SHA256 = /^[a-f0-9]{64}$/;
const LOCAL_PATH_TEXT =
  /(?:^|[^A-Za-z0-9_])(?:~[\\/]|(?:\.\.?[\\/])+|\/|[A-Za-z]:[\\/]|\\\\)[^\s"'`()\[\]{}]+/i;
const GENERIC_URI_TEXT =
  /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9+.-]*:\/\//i;
const SOURCE_MANIFEST_KEYS = new Set([
  "schemaVersion",
  "runId",
  "capturedAt",
  "sources",
  "privacy",
]);
const SOURCE_ROW_KEYS = new Set([
  "label",
  "calendar",
  "geminiDrive",
  "gmailDiscovery",
  "granola",
]);
const CALENDAR_KEYS = new Set(["eventId", "eventIdDigest"]);
const GEMINI_KEYS = new Set([
  "documentId",
  "documentIdDigest",
  "revisionId",
  "revisionIdDigest",
]);
const GMAIL_KEYS = new Set([
  "channel",
  "messageId",
  "messageIdDigest",
  "duplicateContentSuppressed",
]);
const GRANOLA_KEYS = new Set(["meetingId", "meetingIdDigest"]);
const SOURCE_PRIVACY_KEYS = new Set([
  "sourceBodiesStored",
  "emailBodiesStored",
  "participantDetailsStored",
  "rawBiometricsStored",
  "fullAgentSessionBodiesStored",
]);
const OWNER_PRIVACY = {
  sourceBodiesStored: false,
  emailBodiesStored: false,
  participantDetailsStored: false,
  rawBiometricsStored: false,
  fullAgentSessionBodiesStored: false,
  localPathsStored: false,
  secretsStored: false,
};
const REVIEWED_SPLIT_BOUNDARIES = [
  {
    timeSplit: "T0",
    startAt: "2026-07-26T07:00:00.000Z",
    endAt: "2026-07-27T07:00:00.000Z",
    semantics: "inclusive_start_exclusive_end",
  },
  {
    timeSplit: "T1",
    startAt: "2026-07-27T07:00:00.000Z",
    endAt: "2026-07-27T19:00:00.000Z",
    semantics: "inclusive_start_exclusive_end",
  },
  {
    timeSplit: "T2",
    startAt: "2026-07-27T19:00:00.000Z",
    endAt: "2026-07-28T00:00:00.000Z",
    semantics: "inclusive_start_exclusive_end",
  },
  {
    timeSplit: "T3",
    startAt: "2026-07-28T00:00:00.000Z",
    endAt: "2026-07-28T02:00:00.000Z",
    semantics: "inclusive_start_exclusive_end",
  },
  {
    timeSplit: "T4",
    startAt: "2026-07-28T02:00:00.000Z",
    endAt: "2026-07-28T04:21:31.000Z",
    semantics: "inclusive_start_exclusive_end",
  },
];
const REVIEWED_SPLIT_METRICS = [
  {
    timeSplit: "T0",
    metrics: {
      labelCount: 7,
      canonicalMeetingCount: 0,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 0,
      candidateReviewCount: 0,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 0,
      membershipContribution: 3,
      mergeIntoExistingCount: 0,
      duplicateExclusionCount: 0,
      pollutionRejectionCount: 0,
      falseReopenCount: 0,
    },
  },
  {
    timeSplit: "T1",
    metrics: {
      labelCount: 8,
      canonicalMeetingCount: 1,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 0,
      candidateReviewCount: 0,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 0,
      membershipContribution: 0,
      mergeIntoExistingCount: 1,
      duplicateExclusionCount: 1,
      pollutionRejectionCount: 6,
      falseReopenCount: 0,
    },
  },
  {
    timeSplit: "T2",
    metrics: {
      labelCount: 1,
      canonicalMeetingCount: 0,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 0,
      candidateReviewCount: 0,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 0,
      membershipContribution: 0,
      mergeIntoExistingCount: 0,
      duplicateExclusionCount: 0,
      pollutionRejectionCount: 0,
      falseReopenCount: 0,
    },
  },
  {
    timeSplit: "T3",
    metrics: {
      labelCount: 6,
      canonicalMeetingCount: 1,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 0,
      candidateReviewCount: 1,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 1,
      membershipContribution: 1,
      mergeIntoExistingCount: 1,
      duplicateExclusionCount: 2,
      pollutionRejectionCount: 0,
      falseReopenCount: 0,
    },
  },
  {
    timeSplit: "T4",
    metrics: {
      labelCount: 7,
      canonicalMeetingCount: 0,
      newRootCount: 0,
      newAcceptedWorkCount: 0,
      updatedExistingWorkCount: 1,
      candidateReviewCount: 0,
      automaticAcceptedFromMeetingOrSessionCount: 0,
      recurrenceContribution: 0,
      membershipContribution: 0,
      mergeIntoExistingCount: 2,
      duplicateExclusionCount: 2,
      pollutionRejectionCount: 1,
      falseReopenCount: 0,
    },
  },
];

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTimestamp(value, label) {
  const match = typeof value === "string" ? STRICT_RFC3339.exec(value) : null;
  if (!match || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be strict RFC3339`);
  }
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    zone,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || Number(hourText) > 23
    || Number(minuteText) > 59
    || Number(secondText) > 59
    || (zone !== "Z" && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    fail(`${label} must be a real RFC3339 instant`);
  }
  return new Date(value).toISOString();
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertOnlyKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) fail(`${label} contains unknown fields`);
}

function readRegularJson(
  label,
  filePath,
  maximumBytes = 4 * 1_024 * 1_024,
  requireOwnerOnly = false,
) {
  if (!existsSync(filePath)) fail(`${label} does not exist`);
  const metadata = lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`${label} must be a regular non-symbolic file`);
  }
  if (requireOwnerOnly && (metadata.mode & 0o077) !== 0) {
    fail(`${label} must be owner-only before it can be read`);
  }
  if (metadata.size > maximumBytes) fail(`${label} exceeds its size limit`);
  const raw = readFileSync(filePath);
  try {
    return { raw, value: JSON.parse(raw.toString("utf8")) };
  } catch {
    fail(`${label} is not valid JSON`);
  }
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
  const sourceManifestPath = path.normalize(values.get("--source-manifest"));
  const truthSetFixturePath = path.normalize(values.get("--truth-set-fixture"));
  const expectedTruthSetDigest = values.get("--expected-truth-set-digest");
  const expectedReviewBatchDigest = values.get("--expected-review-batch-digest");
  const runId = values.get("--run-id");
  const now = values.get("--now");
  if (!path.isAbsolute(sourceManifestPath) || !path.isAbsolute(truthSetFixturePath)) {
    fail("source manifest and truth-set fixture paths must be absolute");
  }
  if (!RUN_ID.test(runId)) fail("run ID is invalid");
  if (!SHA256.test(expectedTruthSetDigest)) {
    fail("--expected-truth-set-digest is invalid");
  }
  if (!SHA256.test(expectedReviewBatchDigest)) {
    fail("--expected-review-batch-digest is invalid");
  }
  const normalizedNow = normalizeTimestamp(now, "--now");
  return {
    sourceManifestPath,
    truthSetFixturePath,
    expectedTruthSetDigest,
    expectedReviewBatchDigest,
    runId,
    now: normalizedNow,
  };
}

function assertDigestPair(
  container,
  rawKey,
  digestKey,
  pointerDigests,
  rawIdentifiers,
  contractDigest,
) {
  const rawValue = container[rawKey];
  const digestValue = container[digestKey];
  if (
    typeof rawValue !== "string"
    || rawValue.length === 0
    || typeof digestValue !== "string"
    || !SHA256.test(digestValue)
    || contractDigest(rawValue) !== digestValue
  ) {
    fail("owner source pointer digest is invalid");
  }
  pointerDigests.push(digestValue);
  rawIdentifiers.push(rawValue);
}

function validateOwnerSourceManifest(value, contractDigest) {
  if (typeof contractDigest !== "function") {
    fail("owner source validation requires the frozen P9.2 contract digest");
  }
  assertOnlyKeys(value, SOURCE_MANIFEST_KEYS, "owner source manifest");
  if (value.schemaVersion !== "taskmap-owner-live-source-manifest.v1") {
    fail("unsupported owner source manifest schema");
  }
  if (
    typeof value.runId !== "string"
    || !RUN_ID.test(value.runId)
  ) {
    fail("owner source manifest metadata is invalid");
  }
  const capturedAt = normalizeTimestamp(
    value.capturedAt,
    "owner source manifest capturedAt",
  );
  assertOnlyKeys(value.privacy, SOURCE_PRIVACY_KEYS, "owner source privacy");
  if (
    Object.keys(value.privacy).length !== SOURCE_PRIVACY_KEYS.size
    || Object.values(value.privacy).some((item) => item !== false)
  ) {
    fail("owner source manifest privacy contract is invalid");
  }
  if (!Array.isArray(value.sources) || value.sources.length !== 2) {
    fail("owner source manifest must contain the reviewed two-row source set");
  }

  const pointerDigests = [];
  const rawIdentifiers = [];
  const channels = new Set();
  let anchoredRows = 0;
  let unanchoredRows = 0;
  let granolaRows = 0;
  for (const row of value.sources) {
    assertOnlyKeys(row, SOURCE_ROW_KEYS, "owner source row");
    if (typeof row.label !== "string" || row.label.length === 0 || row.label.length > 64) {
      fail("owner source row label is invalid");
    }
    assertOnlyKeys(row.geminiDrive, GEMINI_KEYS, "owner Gemini pointer");
    assertDigestPair(
      row.geminiDrive,
      "documentId",
      "documentIdDigest",
      pointerDigests,
      rawIdentifiers,
      contractDigest,
    );
    assertDigestPair(
      row.geminiDrive,
      "revisionId",
      "revisionIdDigest",
      pointerDigests,
      rawIdentifiers,
      contractDigest,
    );
    assertOnlyKeys(row.gmailDiscovery, GMAIL_KEYS, "owner Gmail pointer");
    if (!["gmail_direct", "gmail_forwarded"].includes(row.gmailDiscovery.channel)) {
      fail("owner Gmail discovery channel is invalid");
    }
    if (row.gmailDiscovery.duplicateContentSuppressed !== true) {
      fail("owner Gmail discovery must suppress duplicate content");
    }
    channels.add(row.gmailDiscovery.channel);
    assertDigestPair(
      row.gmailDiscovery,
      "messageId",
      "messageIdDigest",
      pointerDigests,
      rawIdentifiers,
      contractDigest,
    );
    if (row.calendar === null) {
      unanchoredRows += 1;
    } else {
      assertOnlyKeys(row.calendar, CALENDAR_KEYS, "owner Calendar pointer");
      assertDigestPair(
        row.calendar,
        "eventId",
        "eventIdDigest",
        pointerDigests,
        rawIdentifiers,
        contractDigest,
      );
      anchoredRows += 1;
    }
    if (row.granola !== undefined && row.granola !== null) {
      assertOnlyKeys(row.granola, GRANOLA_KEYS, "owner Granola pointer");
      assertDigestPair(
        row.granola,
        "meetingId",
        "meetingIdDigest",
        pointerDigests,
        rawIdentifiers,
        contractDigest,
      );
      granolaRows += 1;
    }
    const hasCalendar = row.calendar !== null;
    const hasGranola = row.granola !== undefined && row.granola !== null;
    if (
      (
        row.gmailDiscovery.channel === "gmail_direct"
        && (!hasCalendar || !hasGranola)
      )
      || (
        row.gmailDiscovery.channel === "gmail_forwarded"
        && (hasCalendar || hasGranola)
      )
    ) {
      fail("owner source manifest direct/forwarded provider mapping is invalid");
    }
  }
  if (
    channels.size !== 2
    || !channels.has("gmail_direct")
    || !channels.has("gmail_forwarded")
    || anchoredRows !== 1
    || unanchoredRows !== 1
    || granolaRows !== 1
    || pointerDigests.length !== 8
    || new Set(pointerDigests).size !== pointerDigests.length
  ) {
    fail("owner source manifest does not match the reviewed direct/forwarded mapping");
  }
  return {
    pointerDigests: [...pointerDigests].sort(),
    rawIdentifiers,
    capturedAt,
  };
}

function assertArtifactPrivacy(
  artifact,
  rawIdentifiers,
  truthTextContainsSecret,
) {
  if (typeof truthTextContainsSecret !== "function") {
    fail("owner artifact privacy requires the truth-set secret scanner");
  }
  const serialized = JSON.stringify(artifact);
  for (const identifier of rawIdentifiers) {
    if (serialized.includes(identifier)) fail("owner truth artifact retained a raw source identifier");
  }
  if (
    /@/.test(serialized)
    || LOCAL_PATH_TEXT.test(serialized)
    || GENERIC_URI_TEXT.test(serialized)
    || truthTextContainsSecret(serialized)
  ) {
    fail("owner truth artifact contains forbidden private content");
  }
}

function sanitizeTruthLabels(truthSet, taskMapContractDigest) {
  return truthSet.labels.map((label) => ({
    labelId: label.labelId,
    timeSplit: label.timeSplit,
    sourceKind: label.sourceKind,
    sourceRecordRefDigest: taskMapContractDigest(label.sourceRecordRef),
    ...(label.canonicalEventRef === undefined
      ? {}
      : { canonicalEventRefDigest: taskMapContractDigest(label.canonicalEventRef) }),
    ...(label.canonicalWorkRef === undefined
      ? {}
      : { canonicalWorkRefDigest: taskMapContractDigest(label.canonicalWorkRef) }),
    ...(label.discoveryChannel === undefined
      ? {}
      : { discoveryChannel: label.discoveryChannel }),
    ...(label.sessionRole === undefined ? {} : { sessionRole: label.sessionRole }),
    workClass: label.workClass,
    evidenceRole: label.evidenceRole,
    adjudication: label.adjudication,
    lifecycle: label.lifecycle,
    expectedProjection: label.expectedProjection,
    expectedDelta: label.expectedDelta,
    recurrenceContribution: label.recurrenceContribution,
    membershipContribution: label.membershipContribution,
    reasonCodes: label.reasonCodes,
    labelAuthority: label.labelAuthority,
  }));
}

async function buildOwnerTruthArtifact({
  sourceManifestRaw,
  sourceManifest,
  truthSetDraft,
  expectedTruthSetDigest,
  expectedReviewBatchDigest,
  runId,
  now,
}) {
  const {
    TASKMAP_OWNER_TRUTH_SET_VERSION,
    buildTaskMapTruthSet,
    compareTaskMapTruthSetProjectionParity,
    taskMapTruthSetMembershipSignature,
    taskMapTruthTextContainsSecret,
  } = await import(TRUTH_SET_URL);
  const {
    taskMapContractCanonicalJson,
    taskMapContractDigest,
  } = await import(SOURCE_CONTRACT_URL);
  const sourceValidation = validateOwnerSourceManifest(
    sourceManifest,
    taskMapContractDigest,
  );
  const truthSet = buildTaskMapTruthSet(truthSetDraft);
  if (truthSet.truthSetDigest !== expectedTruthSetDigest) {
    fail("truth set does not match the independently reviewed digest");
  }
  if (truthSet.reviewBatchDigest !== expectedReviewBatchDigest) {
    fail("truth set does not match the independently reviewed batch digest");
  }
  const createdAt = new Date(now).toISOString();
  if (Date.parse(sourceValidation.capturedAt) > Date.parse(truthSet.asOf)) {
    fail("owner source capturedAt cannot follow truth asOf");
  }
  if (Date.parse(truthSet.asOf) > Date.parse(truthSet.reviewedAt)) {
    fail("truth asOf cannot follow truth reviewedAt");
  }
  if (Date.parse(truthSet.reviewedAt) > Date.parse(createdAt)) {
    fail("truth reviewedAt cannot follow owner artifact createdAt");
  }
  const parity = compareTaskMapTruthSetProjectionParity(truthSet);
  if (parity.failures.length !== 0) fail("reviewed truth set projection parity failed");
  if (
    taskMapContractCanonicalJson(truthSet.splitBoundaries)
      !== taskMapContractCanonicalJson(REVIEWED_SPLIT_BOUNDARIES)
    || taskMapContractCanonicalJson(truthSet.splitMetrics)
      !== taskMapContractCanonicalJson(REVIEWED_SPLIT_METRICS)
  ) {
    fail("reviewed truth set split baseline is invalid");
  }
  if (
    truthSet.overallMetrics.labelCount !== 29
    || truthSet.overallMetrics.canonicalMeetingCount !== 2
    || truthSet.overallMetrics.newRootCount !== 0
    || truthSet.overallMetrics.newAcceptedWorkCount !== 0
    || truthSet.overallMetrics.updatedExistingWorkCount !== 1
    || truthSet.overallMetrics.candidateReviewCount !== 1
    || truthSet.overallMetrics.automaticAcceptedFromMeetingOrSessionCount !== 0
    || truthSet.overallMetrics.recurrenceContribution !== 1
    || truthSet.overallMetrics.membershipContribution !== 4
    || truthSet.overallMetrics.mergeIntoExistingCount !== 4
    || truthSet.overallMetrics.duplicateExclusionCount !== 5
    || truthSet.overallMetrics.pollutionRejectionCount !== 7
    || truthSet.overallMetrics.falseReopenCount !== 0
  ) {
    fail("reviewed truth set overall delta is invalid");
  }
  if (
    taskMapTruthSetMembershipSignature(truthSet)
    !== taskMapTruthSetMembershipSignature(truthSet, true)
  ) {
    fail("reviewed truth set body mask changes work membership");
  }
  const sourceManifestDigest = sha256(sourceManifestRaw);
  const reviewAttestationVersion = "taskmap-owner-review-attestation.v2";
  const reviewAttestationCore = {
    schemaVersion: reviewAttestationVersion,
    expectedTruthSetDigest,
    expectedReviewBatchDigest,
    reviewBatchPolicyVersion: truthSet.reviewBatchPolicyVersion,
    reviewBatchDigest: truthSet.reviewBatchDigest,
    sourceManifestDigest,
    truthSetDigest: truthSet.truthSetDigest,
    sourceCapturedAt: sourceValidation.capturedAt,
    truthAsOf: truthSet.asOf,
    truthReviewedAt: truthSet.reviewedAt,
    createdAt,
  };
  const core = {
    schemaVersion: TASKMAP_OWNER_TRUTH_SET_VERSION,
    runId,
    sourceCapturedAt: sourceValidation.capturedAt,
    truthAsOf: truthSet.asOf,
    truthReviewedAt: truthSet.reviewedAt,
    createdAt,
    sourceManifestDigest,
    sourcePointerDigests: sourceValidation.pointerDigests,
    truthSetId: truthSet.truthSetId,
    truthSetDigest: truthSet.truthSetDigest,
    expectedTruthSetDigest,
    labelPolicyVersion: truthSet.labelPolicyVersion,
    splitPolicyVersion: truthSet.splitPolicyVersion,
    reviewBatchPolicyVersion: truthSet.reviewBatchPolicyVersion,
    reviewBatchDigest: truthSet.reviewBatchDigest,
    expectedReviewBatchDigest,
    reviewAttestationVersion,
    reviewAttestationDigest: taskMapContractDigest(reviewAttestationCore),
    splitBoundaries: truthSet.splitBoundaries,
    labels: sanitizeTruthLabels(truthSet, taskMapContractDigest),
    splitMetrics: truthSet.splitMetrics,
    overallMetrics: truthSet.overallMetrics,
    membershipSignature: taskMapTruthSetMembershipSignature(truthSet),
    projectionParityDigest: taskMapContractDigest(parity),
    privacy: { ...OWNER_PRIVACY },
  };
  const artifact = {
    ...core,
    artifactDigest: taskMapContractDigest(core),
  };
  assertArtifactPrivacy(
    artifact,
    sourceValidation.rawIdentifiers,
    taskMapTruthTextContainsSecret,
  );
  const roundTrip = JSON.parse(`${taskMapContractCanonicalJson(artifact)}`);
  if (roundTrip.artifactDigest !== artifact.artifactDigest) {
    fail("owner truth artifact canonicalization failed");
  }
  return artifact;
}

function taskMapOwnerRoot() {
  return path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "DaoBrew",
    "taskmap",
  );
}

function assertSourceManifestInsideOwnerRoot(sourceManifestPath, ownerRoot) {
  const canonicalRoot = realpathSync(ownerRoot);
  const rootMetadata = lstatSync(canonicalRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    fail("Task Map owner root must be a real directory");
  }
  if ((rootMetadata.mode & 0o077) !== 0) {
    fail("Task Map owner root must be owner-only");
  }
  const canonicalManifest = realpathSync(sourceManifestPath);
  if (!canonicalManifest.startsWith(`${canonicalRoot}${path.sep}`)) {
    fail("source manifest must remain under the Task Map owner root");
  }
  const manifestDirectory = realpathSync(path.dirname(canonicalManifest));
  const directoryMetadata = lstatSync(manifestDirectory);
  if (
    !directoryMetadata.isDirectory()
    || directoryMetadata.isSymbolicLink()
    || (directoryMetadata.mode & 0o077) !== 0
  ) {
    fail("source manifest run directory must be owner-only");
  }
  return canonicalRoot;
}

function writeNewOwnerRun(ownerRoot, runId, artifact) {
  const outputDirectory = path.join(ownerRoot, runId);
  if (existsSync(outputDirectory)) fail("owner truth run already exists");
  mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });
  chmodSync(outputDirectory, 0o700);
  const outputPath = path.join(outputDirectory, OUTPUT_FILENAME);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  chmodSync(outputPath, 0o600);
  return { outputDirectory, outputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ownerRoot = taskMapOwnerRoot();
  const canonicalRoot = assertSourceManifestInsideOwnerRoot(
    args.sourceManifestPath,
    ownerRoot,
  );
  const source = readRegularJson(
    "owner source manifest",
    args.sourceManifestPath,
    4 * 1_024 * 1_024,
    true,
  );
  const truth = readRegularJson("truth-set fixture", args.truthSetFixturePath);
  const artifact = await buildOwnerTruthArtifact({
    sourceManifestRaw: source.raw,
    sourceManifest: source.value,
    truthSetDraft: truth.value,
    expectedTruthSetDigest: args.expectedTruthSetDigest,
    expectedReviewBatchDigest: args.expectedReviewBatchDigest,
    runId: args.runId,
    now: args.now,
  });
  const output = writeNewOwnerRun(canonicalRoot, args.runId, artifact);
  const metadata = lstatSync(output.outputPath);
  const directoryMetadata = lstatSync(output.outputDirectory);
  if ((directoryMetadata.mode & 0o777) !== 0o700 || (metadata.mode & 0o777) !== 0o600) {
    fail("owner truth artifact permissions are invalid");
  }
  process.stdout.write(`${JSON.stringify({
    schemaVersion: artifact.schemaVersion,
    runId: artifact.runId,
    artifactDigest: artifact.artifactDigest,
    truthSetDigest: artifact.truthSetDigest,
    sourcePointerDigestCount: artifact.sourcePointerDigests.length,
    labelCount: artifact.labels.length,
    directoryMode: "0700",
    fileMode: "0600",
    filename: OUTPUT_FILENAME,
  })}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  OUTPUT_FILENAME,
  buildOwnerTruthArtifact,
  validateOwnerSourceManifest,
  writeNewOwnerRun,
};
