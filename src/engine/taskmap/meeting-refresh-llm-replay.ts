import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import {
  LLM_STATION_ID,
  LlmStationUnavailableError,
  createLlmStation,
  type LlmStation,
  type LlmStationEnvelope,
} from "./llm-station.js";
import {
  buildMeetingEvidenceDrafts,
} from "./meeting-draft-builder.js";
import {
  validateMentionExtraction,
  assertTaskMapStrictJsonSyntaxAndUniqueKeys,
  type MentionActor,
  type MentionSpeechActClass,
} from "./mention-extraction.js";
import {
  parseTaskMapRawGranolaSnapshot,
  renderTaskMapMentionExtractionPrompt,
  type TaskMapRawGranolaNoteV1,
  type TaskMapRenderedMentionPromptV1,
} from "./native-meeting-extraction.js";
import {
  TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
  TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
  TASKMAP_MEETING_PRODUCER_VERSION,
  taskMapMeetingObligationGate,
  taskMapMeetingStatementReferenceDigest,
  type TaskMapMeetingProducerEvidenceKind,
  type TaskMapMeetingProducerEvidenceV1,
} from "./meeting-producer-freshness.js";
import {
  taskMapNativeCandidateId,
  taskMapNativeCandidateRevisionDigest,
  type TaskMapNativeCandidateProofRowsContextV1,
  type TaskMapNativeCandidateShelfRowV1,
} from "./native-candidate-review.js";
import {
  assertTaskMapNativeCandidateAcceptanceStore,
  type TaskMapNativeCandidateAcceptanceStoreV1,
} from "./native-candidate-acceptance.js";
import type {
  TaskMapNativeSemanticBuilderInputV1,
} from "./native-semantic-builder-adapter.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";
import {
  TASKMAP_CONTRACT_VERSION,
  type TaskMapEvent,
  type TaskMapInput,
  type TaskMapSourcePointer,
} from "./types.js";

export const TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES = 4 * 1_024 * 1_024;
export const TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES = 4 * 1_024 * 1_024;
export const TASKMAP_LLM_ENVELOPE_MAX_BYTES = 1_500_000;
export const TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME =
  "taskmap-meeting-extraction-report.v1.json";
export const TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION =
  "taskmap-meeting-extraction-report.v1" as const;

const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const SHA256 = /^[a-f0-9]{64}$/;
const STRICT_RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const ENVELOPE_KEYS = new Set([
  "stationId",
  "model",
  "promptDigest",
  "inputDigest",
  "outputJson",
  "producedAt",
  "transport",
]);
const REPORT_KEYS = new Set([
  "contractVersion",
  "ownerScopeDigest",
  "sourceSnapshotDigest",
  "promptTemplateDigest",
  "producedAt",
  "notes",
  "privacy",
  "reportDigest",
]);
const REPORT_NOTE_KEYS = new Set([
  "sourceIdentityDigest",
  "inputDigest",
  "occurredAt",
  "observedAt",
  "status",
  "degradationCode",
  "envelopeDigest",
  "evidence",
  "evidenceProofDigests",
]);
const REPORT_PRIVACY_KEYS = new Set([
  "sourceBodiesStored",
  "rawSourceIdsStored",
  "participantDetailsStored",
  "transcriptBodiesStored",
  "topicDetailsStored",
  "providerDiagnosticsStored",
  "localPathsStored",
]);
const REPORT_PRIVACY = Object.freeze({
  sourceBodiesStored: false,
  rawSourceIdsStored: false,
  participantDetailsStored: false,
  transcriptBodiesStored: false,
  topicDetailsStored: false,
  providerDiagnosticsStored: false,
  localPathsStored: false,
});
const CANDIDATE_EVIDENCE_PROOF_DOMAIN =
  "taskmap-native-candidate-evidence-proof.1";
const VERIFIED_REPORTS = new WeakSet<object>();
const DEGRADATION_CODES = new Set<TaskMapMeetingExtractionDegradationCode>([
  "raw_snapshot_unavailable",
  "raw_snapshot_malformed",
  "raw_snapshot_limit_exceeded",
  "invalid_note_contract",
  "no_provider",
  "provider_unauthenticated",
  "provider_rate_limited",
  "provider_timeout",
  "provider_nonzero_exit",
  "provider_malformed_wrapper",
  "provider_empty_output",
  "provider_runner_failure",
  "remote_consent_required",
  "invalid_extraction_output",
  "envelope_tampered",
  "envelope_store_unavailable",
]);

export type TaskMapMeetingExtractionDegradationCode =
  | "raw_snapshot_unavailable"
  | "raw_snapshot_malformed"
  | "raw_snapshot_limit_exceeded"
  | "invalid_note_contract"
  | "no_provider"
  | "provider_unauthenticated"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_nonzero_exit"
  | "provider_malformed_wrapper"
  | "provider_empty_output"
  | "provider_runner_failure"
  | "remote_consent_required"
  | "invalid_extraction_output"
  | "envelope_tampered"
  | "envelope_store_unavailable";

export interface TaskMapAuthenticatedRawGranolaSnapshotV1 {
  sourceSnapshotDigest: string;
  notes: readonly TaskMapRawGranolaNoteV1[];
}

export interface TaskMapGranolaExtractionReportNoteV1 {
  sourceIdentityDigest: string;
  inputDigest: string;
  occurredAt: string;
  observedAt: string;
  status: "extracted" | "degraded";
  degradationCode: TaskMapMeetingExtractionDegradationCode | null;
  envelopeDigest: string | null;
  evidence: TaskMapMeetingProducerEvidenceV1[];
  evidenceProofDigests: string[];
}

export interface TaskMapGranolaExtractionReportV1 {
  contractVersion: typeof TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION;
  ownerScopeDigest: string;
  sourceSnapshotDigest: string;
  promptTemplateDigest: string;
  producedAt: string;
  notes: TaskMapGranolaExtractionReportNoteV1[];
  privacy: typeof REPORT_PRIVACY;
  reportDigest: string;
}

export type VerifiedTaskMapGranolaExtractionReportV1 =
  TaskMapGranolaExtractionReportV1 & { readonly __verifiedReport?: never };

export type TaskMapLlmStationFactory = (
  signal?: AbortSignal,
) => Promise<LlmStation>;

export interface ReadAuthenticatedTaskMapGranolaSnapshotInputV1 {
  snapshotPath: string;
  /** Deterministic metadata-race seam; production callers omit it. */
  afterAuthenticatedReadForTesting?: (filePath: string) => void | Promise<void>;
}

export interface TaskMapGranolaExtractionContextV1 {
  snapshotPath: string;
  taskMapRoot: string;
  runtimeRoot: string;
  ownerScopeDigest: string;
  promptTemplatePath: string;
}

export interface RefreshTaskMapGranolaMeetingExtractionInputV1
  extends TaskMapGranolaExtractionContextV1 {
  assessedAt: string;
  createStation?: TaskMapLlmStationFactory;
  signal?: AbortSignal;
}

export interface TaskMapGranolaSemanticFragmentV1 {
  ownerScopeDigest: string;
  taskMapInput: TaskMapInput;
  sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"];
  evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"];
}

export interface TaskMapRawGranolaCandidateShelfV1 {
  ownerScopeDigest: string;
  sourceSnapshotDigest: string;
  candidates: TaskMapNativeCandidateShelfRowV1[];
}

export interface BuildTaskMapUnifiedMeetingCandidateRowsInputV1 {
  ownerScopeDigest: string;
  googleCandidates: readonly TaskMapNativeCandidateShelfRowV1[];
  rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
  acceptanceStore: TaskMapNativeCandidateAcceptanceStoreV1 | null;
}

export interface BuildTaskMapUnifiedMeetingCandidateContextInputV1 {
  ownerScopeDigest: string;
  assessedAt: string;
  googleCandidates: readonly TaskMapNativeCandidateShelfRowV1[];
  googleResultDigest: string | null;
  googleSnapshotDigest: string | null;
  googleProducedAt: string | null;
  rawReport: VerifiedTaskMapGranolaExtractionReportV1 | null;
}

export class TaskMapMeetingExtractionUnavailableError extends Error {
  constructor(readonly code: string) {
    super(`Task Map meeting extraction unavailable: ${code}`);
    this.name = "TaskMapMeetingExtractionUnavailableError";
  }
}

export function stationDegradationCode(
  error: unknown,
): TaskMapMeetingExtractionDegradationCode {
  if (!(error instanceof LlmStationUnavailableError)) {
    return "provider_runner_failure";
  }
  switch (error.reason) {
    case "no_provider":
      return "no_provider";
    case "provider_unauthenticated":
      return "provider_unauthenticated";
    case "provider_rate_limited":
      return "provider_rate_limited";
    case "timeout":
      return "provider_timeout";
    case "nonzero_exit":
      return "provider_nonzero_exit";
    case "malformed_wrapper":
      return "provider_malformed_wrapper";
    case "empty_final_output":
      return "provider_empty_output";
    case "runner_failure":
      return "provider_runner_failure";
    case "remote_consent_required":
      return "remote_consent_required";
    case "invalid_input_digest":
    case "invalid_station":
    case "invalid_clock":
    case "invalid_executable_override":
      return "invalid_extraction_output";
  }
}

function unavailable(code: string, cause?: unknown): never {
  const error = new TaskMapMeetingExtractionUnavailableError(code);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  throw error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function validTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length > 64
    || !STRICT_RFC3339.test(value)
  ) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function decodeUtf8Strict(bytes: Buffer, code: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    unavailable(code, error);
  }
}

function expectedUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

export async function assertPrivateDirectory(directory: string, create: boolean): Promise<void> {
  if (create) {
    try {
      await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
    } catch (error) {
      unavailable("store_directory_unavailable", error);
    }
  }
  let metadata;
  try {
    metadata = await lstat(directory, { bigint: true });
  } catch (error) {
    unavailable("store_directory_unavailable", error);
  }
  const uid = expectedUid();
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || Number(metadata.mode & 0o777n) !== DIRECTORY_MODE
    || (uid !== undefined && metadata.uid !== BigInt(uid))
  ) {
    unavailable("store_directory_unavailable");
  }
}

interface AuthenticatedFileRead {
  bytes: Buffer;
  digest: string;
}

export async function readAuthenticatedFile(
  filePath: string,
  maximumBytes: number,
  modePolicy: "owner_private" | "immutable_prompt",
  afterReadForTesting?: (filePath: string) => void | Promise<void>,
): Promise<AuthenticatedFileRead> {
  let handle;
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch (error) {
    unavailable("authenticated_file_open_failed", error);
  }
  try {
    const before = await handle.stat({ bigint: true });
    const uid = expectedUid();
    const permissions = Number(before.mode & 0o777n);
    const validMode = modePolicy === "owner_private"
      ? permissions === FILE_MODE
      : (permissions & 0o022) === 0;
    if (
      !before.isFile()
      || before.nlink !== 1n
      || before.size < 0n
      || before.size > BigInt(maximumBytes)
      || !validMode
      || (uid !== undefined && before.uid !== BigInt(uid))
    ) {
      unavailable("authenticated_file_metadata_invalid");
    }
    const bounded = Buffer.allocUnsafe(maximumBytes + 1);
    let byteLength = 0;
    while (byteLength < bounded.length) {
      const { bytesRead } = await handle.read(
        bounded,
        byteLength,
        bounded.length - byteLength,
        byteLength,
      );
      if (bytesRead === 0) break;
      byteLength += bytesRead;
    }
    if (byteLength > maximumBytes) {
      unavailable("authenticated_file_metadata_invalid");
    }
    const bytes = bounded.subarray(0, byteLength);
    await afterReadForTesting?.(filePath);
    const after = await handle.stat({ bigint: true });
    let current;
    try {
      current = await lstat(filePath, { bigint: true });
    } catch (error) {
      unavailable("authenticated_file_replaced", error);
    }
    const metadataMatchesBefore = (
      metadata: typeof before,
    ): boolean => {
      const metadataPermissions = Number(metadata.mode & 0o777n);
      const metadataModeValid = modePolicy === "owner_private"
        ? metadataPermissions === FILE_MODE
        : (metadataPermissions & 0o022) === 0;
      return metadata.isFile()
        && !metadata.isSymbolicLink()
        && metadata.dev === before.dev
        && metadata.ino === before.ino
        && metadata.size === before.size
        && metadata.mtimeNs === before.mtimeNs
        && metadata.ctimeNs === before.ctimeNs
        && metadata.mode === before.mode
        && metadata.uid === before.uid
        && metadata.nlink === before.nlink
        && metadata.nlink === 1n
        && metadataModeValid
        && (uid === undefined || metadata.uid === BigInt(uid));
    };
    if (
      BigInt(bytes.byteLength) !== before.size
      || !metadataMatchesBefore(after)
      || !metadataMatchesBefore(current)
    ) {
      unavailable("authenticated_file_replaced");
    }
    return {
      bytes,
      digest: taskMapContractDigest(bytes.toString("utf8")),
    };
  } catch (error) {
    if (error instanceof TaskMapMeetingExtractionUnavailableError) throw error;
    unavailable("authenticated_file_read_failed", error);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function parseJson(bytes: Buffer, code: string): unknown {
  try {
    const decoded = decodeUtf8Strict(bytes, code);
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(decoded);
    return JSON.parse(decoded);
  } catch (error) {
    if (error instanceof TaskMapMeetingExtractionUnavailableError) throw error;
    unavailable(code, error);
  }
}

/**
 * Deployment-level marker: the bundled prompt template is missing or
 * unreadable. Thrown before any per-unit work so the whole refresh
 * fail-fasts with a single station report (D-P9 code
 * "prompt_template_missing"). The message deliberately carries no path.
 */
export class TaskMapPromptTemplateUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Task Map extraction prompt template unavailable", options);
    this.name = "TaskMapPromptTemplateUnavailableError";
  }
}

export async function readPromptTemplate(promptTemplatePath: string): Promise<{
  bytes: string;
  digest: string;
}> {
  const file = await readAuthenticatedFile(
    promptTemplatePath,
    65_536,
    "immutable_prompt",
  );
  const bytes = decodeUtf8Strict(file.bytes, "prompt_template_invalid");
  if (bytes.length === 0) unavailable("prompt_template_invalid");
  return { bytes, digest: taskMapContractDigest(bytes) };
}

export async function readAuthenticatedTaskMapGranolaSnapshot(
  input: ReadAuthenticatedTaskMapGranolaSnapshotInputV1,
): Promise<TaskMapAuthenticatedRawGranolaSnapshotV1> {
  let file: AuthenticatedFileRead;
  try {
    const initial = await lstat(input.snapshotPath, { bigint: true });
    if (initial.size > BigInt(TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES)) {
      unavailable("raw_snapshot_limit_exceeded");
    }
    file = await readAuthenticatedFile(
      input.snapshotPath,
      TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES,
      "owner_private",
      input.afterAuthenticatedReadForTesting,
    );
    const raw = parseJson(file.bytes, "raw_snapshot_malformed");
    let parsed: ReturnType<typeof parseTaskMapRawGranolaSnapshot>;
    try {
      parsed = parseTaskMapRawGranolaSnapshot(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("at most 64")) {
        unavailable("raw_snapshot_limit_exceeded");
      }
      if (
        message.includes("row")
        || message.includes("source identity")
        || message.includes("meeting date")
        || message.includes("participants")
        || message.includes("transcript")
        || message.includes("topics")
        || message.includes("summary")
        || message.includes("duplicate identity")
      ) {
        unavailable("invalid_note_contract");
      }
      unavailable("raw_snapshot_malformed");
    }
    return Object.freeze({
      sourceSnapshotDigest: file.digest,
      notes: parsed.notes,
    });
  } catch (error) {
    if (error instanceof TaskMapMeetingExtractionUnavailableError) {
      if (
        error.code === "raw_snapshot_limit_exceeded"
        || error.code === "raw_snapshot_malformed"
        || error.code === "invalid_note_contract"
      ) throw error;
    }
    unavailable("raw_snapshot_unavailable", error);
  }
}

export { renderTaskMapMentionExtractionPrompt };

export function taskMapMentionExtractionEnvelopePath(
  taskMapRoot: string,
  inputDigest: string,
  namespace?: string,
): string {
  if (!SHA256.test(inputDigest)) unavailable("invalid_input_digest");
  if (namespace !== undefined && !/^[a-z][a-z-]{1,32}$/.test(namespace)) {
    unavailable("invalid_input_digest");
  }
  return path.join(
    taskMapRoot,
    "llm-envelopes",
    LLM_STATION_ID,
    ...(namespace === undefined ? [] : [namespace]),
    `${inputDigest}.json`,
  );
}

export function validateEnvelope(
  value: unknown,
  expected: TaskMapRenderedMentionPromptV1,
  noteBody: string,
  failureCode = "envelope_tampered",
): LlmStationEnvelope {
  if (!isRecord(value) || !hasExactKeys(value, ENVELOPE_KEYS)) {
    unavailable(failureCode);
  }
  if (
    value.stationId !== LLM_STATION_ID
    || value.promptDigest !== expected.promptDigest
    || value.inputDigest !== expected.inputDigest
    || (
      value.transport !== "claude-cli"
      && value.transport !== "codex-cli"
      && value.transport !== "gemini-remote"
    )
    || typeof value.model !== "string"
    || value.model.length === 0
    || value.model.length > 256
    || /[\u0000-\u001f\u007f]/.test(value.model)
    || typeof value.outputJson !== "string"
    || Buffer.byteLength(value.outputJson, "utf8") > TASKMAP_LLM_ENVELOPE_MAX_BYTES
    || !validTimestamp(value.producedAt)
  ) {
    unavailable(failureCode);
  }
  try {
    validateMentionExtraction(value.outputJson, noteBody);
  } catch (error) {
    unavailable(failureCode, error);
  }
  return Object.freeze({
    stationId: LLM_STATION_ID,
    model: value.model,
    promptDigest: value.promptDigest,
    inputDigest: value.inputDigest,
    outputJson: value.outputJson,
    producedAt: value.producedAt,
    transport: value.transport,
  });
}

async function ensureEnvelopeDirectory(
  taskMapRoot: string,
  namespace?: string,
): Promise<string> {
  if (namespace !== undefined && !/^[a-z][a-z-]{1,32}$/.test(namespace)) {
    unavailable("invalid_input_digest");
  }
  await assertPrivateDirectory(taskMapRoot, false);
  const envelopeRoot = path.join(taskMapRoot, "llm-envelopes");
  await assertPrivateDirectory(envelopeRoot, true);
  const stationRoot = path.join(envelopeRoot, LLM_STATION_ID);
  await assertPrivateDirectory(stationRoot, true);
  if (namespace === undefined) return stationRoot;
  const namespaceRoot = path.join(stationRoot, namespace);
  await assertPrivateDirectory(namespaceRoot, true);
  return namespaceRoot;
}

export async function loadEnvelope(
  taskMapRoot: string,
  expected: TaskMapRenderedMentionPromptV1,
  noteBody: string,
  namespace?: string,
): Promise<LlmStationEnvelope | null> {
  const stationRoot = await ensureEnvelopeDirectory(taskMapRoot, namespace);
  const envelopePath = taskMapMentionExtractionEnvelopePath(
    taskMapRoot,
    expected.inputDigest,
    namespace,
  );
  try {
    await lstat(envelopePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    unavailable("envelope_store_unavailable", error);
  }
  await recoverEnvelopeLinkCrash(stationRoot, envelopePath);
  const file = await readAuthenticatedFile(
    envelopePath,
    TASKMAP_LLM_ENVELOPE_MAX_BYTES,
    "owner_private",
  );
  return validateEnvelope(
    parseJson(file.bytes, "envelope_tampered"),
    expected,
    noteBody,
  );
}

async function recoverEnvelopeLinkCrash(
  stationRoot: string,
  envelopePath: string,
): Promise<void> {
  const final = await lstat(envelopePath, { bigint: true });
  if (final.nlink === 1n) return;
  if (
    final.nlink !== 2n
    || !final.isFile()
    || final.isSymbolicLink()
    || Number(final.mode & 0o777n) !== FILE_MODE
  ) unavailable("envelope_store_unavailable");
  const escaped = path.basename(envelopePath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const crashName = new RegExp(`^\\.${escaped}\\.[a-f0-9]{32}\\.tmp$`);
  const matches: string[] = [];
  for (const name of await readdir(stationRoot)) {
    if (!crashName.test(name)) continue;
    const candidatePath = path.join(stationRoot, name);
    const candidate = await lstat(candidatePath, { bigint: true });
    if (
      candidate.dev === final.dev
      && candidate.ino === final.ino
      && candidate.nlink === 2n
      && candidate.isFile()
      && !candidate.isSymbolicLink()
      && Number(candidate.mode & 0o777n) === FILE_MODE
    ) matches.push(candidatePath);
  }
  if (matches.length !== 1) unavailable("envelope_store_unavailable");
  await unlink(matches[0]!);
  await fsyncDirectory(stationRoot);
  const recovered = await lstat(envelopePath, { bigint: true });
  if (
    recovered.dev !== final.dev
    || recovered.ino !== final.ino
    || recovered.nlink !== 1n
  ) unavailable("envelope_store_unavailable");
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(
      directory,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    await handle.sync();
  } catch (error) {
    unavailable("atomic_store_failed", error);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function atomicPrivateWriteNew(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  const bytes = Buffer.from(taskMapContractCanonicalJson(value), "utf8");
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomBytes(16).toString("hex")}.tmp`,
  );
  let handle;
  let linked = false;
  try {
    handle = await open(
      tempPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      FILE_MODE,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(tempPath, filePath);
    linked = true;
    await fsyncDirectory(directory);
    await unlink(tempPath);
    await fsyncDirectory(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      unavailable("authenticated_target_exists", error);
    }
    unavailable("atomic_store_failed", error);
  } finally {
    await handle?.close().catch(() => undefined);
    if (!linked) await unlink(tempPath).catch(() => undefined);
  }
}

export async function replacePrivateFile(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await assertPrivateDirectory(directory, false);
  const currentPath = `${filePath}.current`;
  await unlink(currentPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
  await atomicPrivateWriteNew(currentPath, value);
  // Reports are replaceable derived state. Rename is atomic and remains within
  // the already authenticated owner directory.
  try {
    const current = await readAuthenticatedFile(
      currentPath,
      TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
      "owner_private",
    );
    if (current.bytes.length === 0) unavailable("atomic_store_failed");
    await (await import("node:fs/promises")).rename(currentPath, filePath);
    await fsyncDirectory(directory);
  } catch (error) {
    await unlink(currentPath).catch(() => undefined);
    if (error instanceof TaskMapMeetingExtractionUnavailableError) throw error;
    unavailable("atomic_store_failed", error);
  }
}

function envelopeDigest(envelope: LlmStationEnvelope): string {
  return taskMapContractDigest(envelope);
}

function evidenceProofDigest(evidence: TaskMapMeetingProducerEvidenceV1): string {
  return taskMapContractDigest({
    domain: CANDIDATE_EVIDENCE_PROOF_DOMAIN,
    statementReferenceDigest: evidence.statementReferenceDigest,
    evidenceDigest: evidence.evidenceDigest,
    canonicalMeetingDigest: taskMapContractDigest(evidence.canonicalMeetingId),
    kind: evidence.kind,
    occurredAt: evidence.occurredAt,
    observedAt: evidence.observedAt,
    authority: evidence.authority,
    quality: evidence.quality,
    coverage: evidence.coverage,
    confidence: evidence.confidence,
    status: evidence.status,
    deadline: evidence.deadline,
    objectRefDigests: evidence.objectRefs.map((ref) =>
      taskMapContractDigest(ref)
    ).sort(),
    supportingSourceVariantRefDigests:
      [...evidence.supportingSourceVariantRefDigests].sort(),
    sourceKinds: ["granola"],
    proposalDisposition: evidence.proposalDisposition,
    speechActClass: evidence.speechActClass,
    speechActActor: evidence.speechActActor,
    mentionIdentityDigest: evidence.mentionIdentityDigest,
    extractionEnvelopeDigest: evidence.extractionEnvelopeDigest,
    promotionEligible: evidence.promotionEligible,
  });
}

function evidenceActivity(kind: TaskMapMeetingProducerEvidenceKind):
  TaskMapMeetingProducerEvidenceV1["activity"] {
  if (kind === "decision") return "meeting_decision";
  if (kind === "commitment") return "meeting_commitment";
  return "meeting_action_item";
}

function buildRawEvidence(
  ownerScopeDigest: string,
  note: TaskMapRawGranolaNoteV1,
  envelope: LlmStationEnvelope,
): TaskMapMeetingProducerEvidenceV1[] {
  const drafts = buildMeetingEvidenceDrafts({
    sourceText: note.body,
    occurredAt: note.occurredAt,
    observedAt: note.createdAt,
  }, envelope);
  const canonicalMeetingId = `tmpraw_${taskMapContractDigest({
    domain: "taskmap-raw-granola-canonical-meeting.1",
    ownerScopeDigest,
    sourceIdentityDigest: note.sourceIdentityDigest,
  }).slice(0, 16)}`;
  const sourceVariantRefDigest = taskMapContractDigest({
    domain: "taskmap-raw-granola-source-variant.1",
    ownerScopeDigest,
    sourceIdentityDigest: note.sourceIdentityDigest,
    inputDigest: envelope.inputDigest,
  });
  const occurrences = drafts.map((draft) => {
    const obligation = taskMapMeetingObligationGate(
      draft.speechActClass!,
      draft.speechActActor!,
    );
    const statementReferenceDigest = taskMapMeetingStatementReferenceDigest({
      kind: draft.kind,
      title: draft.title,
      summary: draft.summary,
      explicitExternalReferenceDigests: [],
      mentionIdentityDigest: draft.mentionIdentityDigest,
    });
    const objectRefs = [
      {
        kind: "canonical_meeting" as const,
        referenceDigest: taskMapContractDigest(canonicalMeetingId),
      },
      {
        kind: "source_object" as const,
        referenceDigest: note.sourceIdentityDigest,
      },
      {
        kind: "external_reference" as const,
        referenceDigest: statementReferenceDigest,
      },
    ];
    const evidenceDigest = taskMapContractDigest({
      kind: draft.kind,
      title: draft.title,
      summary: draft.summary,
      status: null,
      deadline: null,
      externalObjectRefs: [objectRefs[2]],
      speechActClass: draft.speechActClass,
      speechActActor: draft.speechActActor,
      mentionIdentityDigest: draft.mentionIdentityDigest,
      extractionEnvelopeDigest: draft.extractionEnvelopeDigest,
      promotionEligible: obligation.promotionEligible,
    });
    return Object.freeze({
      evidenceId: `tmpe_${taskMapContractDigest({ canonicalMeetingId, evidenceDigest }).slice(0, 16)}`,
      evidenceDigest,
      canonicalMeetingId,
      kind: draft.kind,
      recordKind: "work_context" as const,
      activity: evidenceActivity(draft.kind),
      occurredAt: draft.occurredAt,
      observedAt: draft.observedAt,
      objectRefs,
      title: draft.title,
      summary: draft.summary,
      authority: obligation.authority,
      quality: draft.quality ?? "structured_generated",
      coverage: draft.coverage ?? "partial",
      confidence: draft.confidence!,
      status: null,
      deadline: null,
      proposalDisposition: obligation.proposalDisposition,
      statementReferenceDigest,
      supportingSourceVariantRefDigests: [sourceVariantRefDigest],
      speechActClass: draft.speechActClass!,
      speechActActor: draft.speechActActor!,
      mentionIdentityDigest: draft.mentionIdentityDigest!,
      extractionEnvelopeDigest: draft.extractionEnvelopeDigest!,
      promotionEligible: obligation.promotionEligible,
    });
  });
  const representativeByEvidenceId = new Map<
    string,
    TaskMapMeetingProducerEvidenceV1
  >();
  for (const occurrence of occurrences) {
    const current = representativeByEvidenceId.get(occurrence.evidenceId);
    if (
      current === undefined
      || occurrence.confidence > current.confidence
    ) {
      representativeByEvidenceId.set(occurrence.evidenceId, occurrence);
    }
  }
  return [...representativeByEvidenceId.values()];
}

function reportPayload(
  report: Omit<TaskMapGranolaExtractionReportV1, "reportDigest">,
): Omit<TaskMapGranolaExtractionReportV1, "reportDigest"> {
  return report;
}

function deepCloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  }
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = deepCloneFreeze(child);
    }
    return Object.freeze(clone) as T;
  }
  return value;
}

function finalizeReport(
  report: Omit<TaskMapGranolaExtractionReportV1, "reportDigest">,
): VerifiedTaskMapGranolaExtractionReportV1 {
  const complete = deepCloneFreeze({
    ...report,
    reportDigest: taskMapContractDigest(reportPayload(report)),
  });
  VERIFIED_REPORTS.add(complete);
  return complete;
}

function assertOwnerDigest(value: string): void {
  if (!SHA256.test(value)) unavailable("owner_scope_invalid");
}

function assertAssessedAt(value: string): void {
  if (!validTimestamp(value)) unavailable("assessed_at_invalid");
}

export async function refreshTaskMapGranolaMeetingExtraction(
  input: RefreshTaskMapGranolaMeetingExtractionInputV1,
): Promise<VerifiedTaskMapGranolaExtractionReportV1> {
  assertOwnerDigest(input.ownerScopeDigest);
  assertAssessedAt(input.assessedAt);
  await assertPrivateDirectory(input.runtimeRoot, false);
  const [snapshot, template] = await Promise.all([
    readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: input.snapshotPath }),
    readPromptTemplate(input.promptTemplatePath),
  ]);
  const assessedAtMs = Date.parse(input.assessedAt);
  if (snapshot.notes.some((note) =>
    Date.parse(note.occurredAt) > assessedAtMs
    || Date.parse(note.createdAt) > assessedAtMs
  )) unavailable("invalid_note_contract");
  const createStation = input.createStation
    ?? ((signal?: AbortSignal) => createLlmStation({ signal }));
  let stationPromise: Promise<LlmStation> | undefined;
  const notes: TaskMapGranolaExtractionReportNoteV1[] = [];

  for (const note of snapshot.notes) {
    const rendered = renderTaskMapMentionExtractionPrompt(template.bytes, note.body);
    let envelope = await loadEnvelope(input.taskMapRoot, rendered, note.body);
    if (envelope === null) {
      stationPromise ??= createStation(input.signal);
      let station: LlmStation;
      try {
        station = await stationPromise;
      } catch (error) {
        notes.push({
          sourceIdentityDigest: note.sourceIdentityDigest,
          inputDigest: rendered.inputDigest,
          occurredAt: note.occurredAt,
          observedAt: note.createdAt,
          status: "degraded",
          degradationCode: stationDegradationCode(error),
          envelopeDigest: null,
          evidence: [],
          evidenceProofDigests: [],
        });
        continue;
      }
      try {
        const candidate = await station.run({
          stationId: LLM_STATION_ID,
          promptText: rendered.promptText,
          inputDigest: rendered.inputDigest,
          signal: input.signal,
        });
        envelope = validateEnvelope(
          candidate,
          rendered,
          note.body,
          "invalid_extraction_output",
        );
        const envelopePath = taskMapMentionExtractionEnvelopePath(
          input.taskMapRoot,
          rendered.inputDigest,
        );
        await atomicPrivateWriteNew(envelopePath, envelope);
        const durable = await loadEnvelope(input.taskMapRoot, rendered, note.body);
        if (durable === null) unavailable("envelope_store_unavailable");
        envelope = durable;
      } catch (error) {
        if (error instanceof TaskMapMeetingExtractionUnavailableError) {
          if (error.code === "authenticated_target_exists") throw error;
          notes.push({
            sourceIdentityDigest: note.sourceIdentityDigest,
            inputDigest: rendered.inputDigest,
            occurredAt: note.occurredAt,
            observedAt: note.createdAt,
            status: "degraded",
            degradationCode: error.code === "invalid_extraction_output"
              ? "invalid_extraction_output"
              : error.code === "envelope_tampered"
                ? "envelope_tampered"
                : "envelope_store_unavailable",
            envelopeDigest: null,
            evidence: [],
            evidenceProofDigests: [],
          });
          continue;
        }
        notes.push({
          sourceIdentityDigest: note.sourceIdentityDigest,
          inputDigest: rendered.inputDigest,
          occurredAt: note.occurredAt,
          observedAt: note.createdAt,
          status: "degraded",
          degradationCode: stationDegradationCode(error),
          envelopeDigest: null,
          evidence: [],
          evidenceProofDigests: [],
        });
        continue;
      }
    }
    const evidence = buildRawEvidence(input.ownerScopeDigest, note, envelope);
    notes.push({
      sourceIdentityDigest: note.sourceIdentityDigest,
      inputDigest: rendered.inputDigest,
      occurredAt: note.occurredAt,
      observedAt: note.createdAt,
      status: "extracted",
      degradationCode: null,
      envelopeDigest: envelopeDigest(envelope),
      evidence,
      evidenceProofDigests: evidence.map(evidenceProofDigest),
    });
  }

  const report = finalizeReport({
    contractVersion: TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION,
    ownerScopeDigest: input.ownerScopeDigest,
    sourceSnapshotDigest: snapshot.sourceSnapshotDigest,
    promptTemplateDigest: template.digest,
    producedAt: input.assessedAt,
    notes,
    privacy: REPORT_PRIVACY,
  });
  await replacePrivateFile(
    path.join(input.runtimeRoot, TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME),
    report,
  );
  return loadVerifiedTaskMapGranolaExtractionReport({
    snapshotPath: input.snapshotPath,
    taskMapRoot: input.taskMapRoot,
    runtimeRoot: input.runtimeRoot,
    ownerScopeDigest: input.ownerScopeDigest,
    promptTemplatePath: input.promptTemplatePath,
  });
}

function assertReport(value: unknown): TaskMapGranolaExtractionReportV1 {
  if (!isRecord(value) || !hasExactKeys(value, REPORT_KEYS)) {
    unavailable("extraction_report_malformed");
  }
  if (
    value.contractVersion !== TASKMAP_GRANOLA_EXTRACTION_REPORT_VERSION
    || !SHA256.test(value.ownerScopeDigest as string)
    || !SHA256.test(value.sourceSnapshotDigest as string)
    || !SHA256.test(value.promptTemplateDigest as string)
    || !SHA256.test(value.reportDigest as string)
    || !validTimestamp(value.producedAt)
    || !Array.isArray(value.notes)
    || value.notes.length > 64
    || !isRecord(value.privacy)
    || !hasExactKeys(value.privacy, REPORT_PRIVACY_KEYS)
    || taskMapContractCanonicalJson(value.privacy)
      !== taskMapContractCanonicalJson(REPORT_PRIVACY)
  ) {
    unavailable("extraction_report_malformed");
  }
  const identities = new Set<string>();
  for (const row of value.notes) {
    if (!isRecord(row) || !hasExactKeys(row, REPORT_NOTE_KEYS)) {
      unavailable("extraction_report_malformed");
    }
    if (
      !SHA256.test(row.sourceIdentityDigest as string)
      || !SHA256.test(row.inputDigest as string)
      || identities.has(row.sourceIdentityDigest as string)
      || !validTimestamp(row.occurredAt)
      || !validTimestamp(row.observedAt)
      || Date.parse(row.occurredAt as string) > Date.parse(row.observedAt as string)
      || Date.parse(row.observedAt as string) > Date.parse(value.producedAt as string)
      || (row.status !== "extracted" && row.status !== "degraded")
      || !Array.isArray(row.evidence)
      || row.evidence.length > 20
      || !Array.isArray(row.evidenceProofDigests)
      || row.evidenceProofDigests.length !== row.evidence.length
      || row.evidenceProofDigests.some((proof) =>
        typeof proof !== "string" || !SHA256.test(proof)
      )
      || new Set(row.evidenceProofDigests).size
        !== row.evidenceProofDigests.length
    ) {
      unavailable("extraction_report_malformed");
    }
    identities.add(row.sourceIdentityDigest as string);
    if (row.status === "extracted") {
      if (
        row.degradationCode !== null
        || typeof row.envelopeDigest !== "string"
        || !SHA256.test(row.envelopeDigest)
      ) unavailable("extraction_report_malformed");
    } else if (
      typeof row.degradationCode !== "string"
      || !DEGRADATION_CODES.has(
        row.degradationCode as TaskMapMeetingExtractionDegradationCode,
      )
      || row.envelopeDigest !== null
      || row.evidence.length !== 0
      || row.evidenceProofDigests.length !== 0
    ) {
      unavailable("extraction_report_malformed");
    }
  }
  const { reportDigest, ...payload } = value;
  if (taskMapContractDigest(payload) !== reportDigest) {
    unavailable("extraction_report_tampered");
  }
  return value as unknown as TaskMapGranolaExtractionReportV1;
}

export async function loadVerifiedTaskMapGranolaExtractionReport(
  input: TaskMapGranolaExtractionContextV1,
): Promise<VerifiedTaskMapGranolaExtractionReportV1> {
  assertOwnerDigest(input.ownerScopeDigest);
  const [snapshot, template, reportFile] = await Promise.all([
    readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: input.snapshotPath }),
    readPromptTemplate(input.promptTemplatePath),
    readAuthenticatedFile(
      path.join(input.runtimeRoot, TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME),
      TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
      "owner_private",
    ),
  ]);
  const report = assertReport(parseJson(reportFile.bytes, "extraction_report_malformed"));
  if (
    report.ownerScopeDigest !== input.ownerScopeDigest
    || report.sourceSnapshotDigest !== snapshot.sourceSnapshotDigest
    || report.promptTemplateDigest !== template.digest
    || report.notes.length !== snapshot.notes.length
  ) {
    unavailable("extraction_report_stale");
  }
  const noteByIdentity = new Map(snapshot.notes.map((note) => [
    note.sourceIdentityDigest,
    note,
  ] as const));
  const reportIdentities = new Set(report.notes.map((row) =>
    row.sourceIdentityDigest
  ));
  if (
    reportIdentities.size !== noteByIdentity.size
    || [...noteByIdentity.keys()].some((identity) =>
      !reportIdentities.has(identity)
    )
  ) unavailable("extraction_report_stale");
  for (const row of report.notes) {
    const note = noteByIdentity.get(row.sourceIdentityDigest);
    if (note === undefined) unavailable("extraction_report_stale");
    if (
      row.occurredAt !== note.occurredAt
      || row.observedAt !== note.createdAt
    ) unavailable("extraction_report_stale");
    const rendered = renderTaskMapMentionExtractionPrompt(template.bytes, note.body);
    if (rendered.inputDigest !== row.inputDigest) unavailable("extraction_report_stale");
    if (row.status === "extracted") {
      const envelope = await loadEnvelope(input.taskMapRoot, rendered, note.body);
      if (
        envelope === null
        || envelopeDigest(envelope) !== row.envelopeDigest
      ) unavailable("extraction_report_stale");
      const evidence = buildRawEvidence(input.ownerScopeDigest, note, envelope);
      if (
        taskMapContractCanonicalJson(evidence) !== taskMapContractCanonicalJson(row.evidence)
        || taskMapContractCanonicalJson(evidence.map(evidenceProofDigest))
          !== taskMapContractCanonicalJson(row.evidenceProofDigests)
      ) unavailable("extraction_report_tampered");
    } else if (
      row.envelopeDigest !== null
      || row.evidence.length !== 0
      || row.evidenceProofDigests.length !== 0
    ) {
      unavailable("extraction_report_tampered");
    }
  }
  const verified = deepCloneFreeze(report) as VerifiedTaskMapGranolaExtractionReportV1;
  VERIFIED_REPORTS.add(verified);
  return verified;
}

function requireVerified(
  report: VerifiedTaskMapGranolaExtractionReportV1,
): void {
  if (!VERIFIED_REPORTS.has(report)) unavailable("unverified_extraction_report");
  assertReport(report);
}

export function buildTaskMapGranolaSemanticFragment(
  report: VerifiedTaskMapGranolaExtractionReportV1,
): TaskMapGranolaSemanticFragmentV1 {
  requireVerified(report);
  const pointers: TaskMapSourcePointer[] = [];
  const events: TaskMapEvent[] = [];
  const sourceBindings: TaskMapNativeSemanticBuilderInputV1["sourceBindings"] = [];
  const evidenceBindings: TaskMapNativeSemanticBuilderInputV1["evidenceBindings"] = [];
  for (const row of report.notes) {
    if (row.status !== "extracted") continue;
    // A verified extracted row with no evidence means the model legitimately found
    // zero mentions in that note. buildRawEvidence emits one canonical_meeting ref
    // per occurrence, so no evidence means no occurrences — nothing to contribute,
    // not tampering. Skip it exactly like a degraded row.
    if (row.evidence.length === 0) continue;
    const pointerId = `tmrawptr_${row.sourceIdentityDigest.slice(0, 16)}`;
    const canonicalMeetingReferenceDigest = row.evidence
      .flatMap((evidence) => evidence.objectRefs)
      .find((ref) => ref.kind === "canonical_meeting")?.referenceDigest;
    if (canonicalMeetingReferenceDigest === undefined) {
      unavailable("extraction_report_tampered");
    }
    pointers.push({
      id: pointerId,
      sourceKind: "granola",
      sourceObjectId: row.sourceIdentityDigest,
      sourceRefHash: row.sourceIdentityDigest,
      sourceVersion: row.inputDigest,
      authority: "none",
      syncMode: "reference_only",
      capabilities: ["read_context"],
    });
    sourceBindings.push({
      pointerId,
      semanticClass: "meeting_context",
      semanticOriginId: canonicalMeetingReferenceDigest,
      semanticIdentityDigest: row.sourceIdentityDigest,
      sourceIdentityDigest: row.sourceIdentityDigest,
      observedRevision: row.inputDigest,
      evidenceRevision: row.inputDigest,
      observedContentDigest: row.inputDigest,
      evidenceContentDigest: row.inputDigest,
    });
    for (const evidence of row.evidence) {
      const eventId = `tmrawevent_${taskMapContractDigest({
        pointerId,
        evidenceDigest: evidence.evidenceDigest,
      }).slice(0, 16)}`;
      const candidateIdentityRef = evidence.statementReferenceDigest === null
        ? null
        : `external:${evidence.statementReferenceDigest}`;
      const canonicalMeetingRef = `canonical-meeting:${canonicalMeetingReferenceDigest}`;
      events.push({
        id: eventId,
        pointerId,
        recordKind: "work_context",
        activity: evidence.kind === "decision"
          ? "context_observed"
          : "commitment_stated",
        occurredAt: evidence.occurredAt,
        observedAt: evidence.observedAt,
        objectRefs: candidateIdentityRef === null
          ? [canonicalMeetingRef]
          : [canonicalMeetingRef, candidateIdentityRef].sort(),
        title: evidence.title,
        summary: evidence.summary,
        extractionConfidence: evidence.confidence,
        bodyJoinEligible: false,
      });
      evidenceBindings.push(
        evidence.proposalDisposition === "candidate_only"
        && candidateIdentityRef !== null
          ? {
              eventId,
              disposition: "candidate_only",
              candidateIdentityRef,
              candidateKind: evidence.kind === "commitment"
                ? "commitment"
                : "action_item",
              mentionIdentityDigest: evidence.mentionIdentityDigest,
              rootLinkRefs: [],
            }
          : {
              eventId,
              disposition: "context_only",
              rootLinkRefs: [],
            },
      );
    }
  }
  return Object.freeze({
    ownerScopeDigest: report.ownerScopeDigest,
    taskMapInput: Object.freeze({
      contractVersion: TASKMAP_CONTRACT_VERSION,
      generatedAt: report.producedAt,
      pointers,
      events,
    }),
    sourceBindings,
    evidenceBindings,
  });
}

export function taskMapNativeSemanticInputFromGranolaReport(
  report: VerifiedTaskMapGranolaExtractionReportV1,
): TaskMapNativeSemanticBuilderInputV1 {
  requireVerified(report);
  const fragment = buildTaskMapGranolaSemanticFragment(report);
  const producedAtMs = Date.parse(report.producedAt);
  if (!Number.isFinite(producedAtMs)) unavailable("extraction_report_tampered");
  return {
    contractVersion: "taskmap-native-semantic-builder-input.v1",
    ownerScopeDigest: report.ownerScopeDigest,
    producer: {
      id: TASKMAP_MEETING_PRODUCER_RESULT_VERSION,
      version: TASKMAP_MEETING_PRODUCER_VERSION,
    },
    freshness: {
      decision: "fresh",
      available: true,
      retainedLastGood: false,
      producedAt: report.producedAt,
      validThrough: new Date(
        producedAtMs + TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
      ).toISOString(),
      assessedAt: report.producedAt,
    },
    sourceBindings: fragment.sourceBindings,
    evidenceBindings: fragment.evidenceBindings,
    taskMapInput: fragment.taskMapInput,
  };
}

export function buildTaskMapRawGranolaCandidateShelf(
  report: VerifiedTaskMapGranolaExtractionReportV1,
): TaskMapRawGranolaCandidateShelfV1 {
  requireVerified(report);
  const occurrences = report.notes.flatMap((row) =>
    row.evidence.map((evidence, index) => ({
      evidence,
      proof: row.evidenceProofDigests[index]!,
    }))
  ).filter(({ evidence }) => evidence.statementReferenceDigest !== null);
  const byStatement = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const statement = occurrence.evidence.statementReferenceDigest!;
    const current = byStatement.get(statement) ?? [];
    current.push(occurrence);
    byStatement.set(statement, current);
  }
  const candidates = [...byStatement.entries()].map(([statement, rows]) => {
    const orderedRows = [...rows].sort((left, right) =>
      left.evidence.occurredAt.localeCompare(right.evidence.occurredAt)
      || left.evidence.observedAt.localeCompare(right.evidence.observedAt)
      || left.evidence.evidenceDigest.localeCompare(
        right.evidence.evidenceDigest,
      )
      || left.proof.localeCompare(right.proof)
    );
    const first = orderedRows[0]!.evidence;
    const evidenceProofDigests = [
      ...new Set(orderedRows.map(({ proof }) => proof)),
    ].sort();
    const candidateId = taskMapNativeCandidateId(report.ownerScopeDigest, statement);
    return {
      candidateId,
      candidateRevisionDigest: taskMapNativeCandidateRevisionDigest(
        candidateId,
        evidenceProofDigests,
      ),
      statementReferenceDigest: statement,
      evidenceProofDigests,
      kind: first.kind,
      title: first.title,
      summary: first.summary,
      speechActClass: first.speechActClass as MentionSpeechActClass,
      speechActActor: first.speechActActor as MentionActor,
      mentionIdentityDigest: first.mentionIdentityDigest,
      confidence: Math.max(
        ...orderedRows.map(({ evidence }) => evidence.confidence),
      ),
      promotionEligible: orderedRows.every(({ evidence }) =>
        evidence.promotionEligible === true
      ),
      sourceKinds: ["granola" as const],
      occurredAt: orderedRows.reduce((earliest, { evidence }) =>
        evidence.occurredAt < earliest ? evidence.occurredAt : earliest,
      first.occurredAt),
      observedAt: orderedRows.reduce((latest, { evidence }) =>
        evidence.observedAt > latest ? evidence.observedAt : latest,
      first.observedAt),
      reviewState: "unreviewed" as const,
      reviewedAt: null,
      reviewedOnly: false,
      acceptedWork: false as const,
      rankEligible: false as const,
      routeEligible: false as const,
      proveEligible: false as const,
      runEligible: false as const,
    };
  }).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  return Object.freeze({
    ownerScopeDigest: report.ownerScopeDigest,
    sourceSnapshotDigest: report.sourceSnapshotDigest,
    candidates,
  });
}

/**
 * Join authenticated Google shelf rows with raw Granola rows that came through
 * the unforgeable verified-report gate. Existing Google-only rows are returned
 * unchanged. A validated acceptance store removes already-promoted IDs so a
 * restart cannot show accepted work as a suggestion again.
 */
export function buildTaskMapUnifiedMeetingCandidateRows(
  input: BuildTaskMapUnifiedMeetingCandidateRowsInputV1,
): TaskMapNativeCandidateShelfRowV1[] {
  assertOwnerDigest(input.ownerScopeDigest);
  let promotedIds = new Set<string>();
  if (input.acceptanceStore !== null) {
    assertTaskMapNativeCandidateAcceptanceStore(input.acceptanceStore);
    if (input.acceptanceStore.ownerScopeDigest !== input.ownerScopeDigest) {
      unavailable("acceptance_store_owner_mismatch");
    }
    promotedIds = new Set(
      input.acceptanceStore.receipts.map((receipt) => receipt.candidateId),
    );
  }
  const google = input.googleCandidates.filter(
    (row) => !promotedIds.has(row.candidateId),
  );
  if (input.rawReport === null) return [...google];
  requireVerified(input.rawReport);
  if (input.rawReport.ownerScopeDigest !== input.ownerScopeDigest) {
    unavailable("extraction_report_owner_mismatch");
  }
  const raw = buildTaskMapRawGranolaCandidateShelf(input.rawReport).candidates
    .filter((row) => !promotedIds.has(row.candidateId));
  if (raw.length === 0) return [...google];

  const byCandidate = new Map<string, TaskMapNativeCandidateShelfRowV1>();
  for (const row of google) byCandidate.set(row.candidateId, row);
  for (const rawRow of raw) {
    const googleRow = byCandidate.get(rawRow.candidateId);
    if (googleRow === undefined) {
      byCandidate.set(rawRow.candidateId, rawRow);
      continue;
    }
    if (
      googleRow.statementReferenceDigest !== rawRow.statementReferenceDigest
      || googleRow.kind !== rawRow.kind
    ) {
      unavailable("candidate_union_mismatch");
    }
    const evidenceProofDigests = [
      ...new Set([
        ...googleRow.evidenceProofDigests,
        ...rawRow.evidenceProofDigests,
      ]),
    ].sort();
    const candidateRevisionDigest = taskMapNativeCandidateRevisionDigest(
      googleRow.candidateId,
      evidenceProofDigests,
    );
    byCandidate.set(googleRow.candidateId, {
      ...googleRow,
      candidateRevisionDigest,
      evidenceProofDigests,
      confidence: Math.max(googleRow.confidence, rawRow.confidence),
      promotionEligible:
        googleRow.promotionEligible && rawRow.promotionEligible,
      sourceKinds: [
        ...new Set([...googleRow.sourceKinds, ...rawRow.sourceKinds]),
      ].sort() as Array<"gemini_meet" | "granola">,
      occurredAt: googleRow.occurredAt < rawRow.occurredAt
        ? googleRow.occurredAt
        : rawRow.occurredAt,
      observedAt: googleRow.observedAt > rawRow.observedAt
        ? googleRow.observedAt
        : rawRow.observedAt,
      ...(candidateRevisionDigest === googleRow.candidateRevisionDigest
        ? {}
        : {
            reviewState: "unreviewed" as const,
            reviewedAt: null,
            reviewedOnly: false,
          }),
    });
  }
  return [...byCandidate.values()].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  );
}

export function buildTaskMapUnifiedMeetingCandidateContext(
  input: BuildTaskMapUnifiedMeetingCandidateContextInputV1,
): TaskMapNativeCandidateProofRowsContextV1 {
  assertOwnerDigest(input.ownerScopeDigest);
  assertAssessedAt(input.assessedAt);
  if (input.rawReport !== null) {
    assertVerifiedTaskMapGranolaExtractionReportFresh(
      input.rawReport,
      input.assessedAt,
    );
    if (input.rawReport.ownerScopeDigest !== input.ownerScopeDigest) {
      unavailable("extraction_report_owner_mismatch");
    }
  }
  const hasGoogle = input.googleResultDigest !== null
    || input.googleSnapshotDigest !== null
    || input.googleProducedAt !== null;
  if (
    hasGoogle
    && (
      input.googleResultDigest === null
      || input.googleSnapshotDigest === null
      || input.googleProducedAt === null
      || !SHA256.test(input.googleResultDigest)
      || !SHA256.test(input.googleSnapshotDigest)
      || !validTimestamp(input.googleProducedAt)
    )
  ) unavailable("candidate_context_malformed");
  if (!hasGoogle && input.rawReport === null) {
    unavailable("candidate_context_unavailable");
  }
  const candidates = buildTaskMapUnifiedMeetingCandidateRows({
    ownerScopeDigest: input.ownerScopeDigest,
    googleCandidates: input.googleCandidates,
    rawReport: input.rawReport,
    acceptanceStore: null,
  });
  const producerResultDigest = taskMapContractDigest({
    domain: "taskmap-unified-meeting-candidate-result.1",
    googleResultDigest: input.googleResultDigest,
    rawReportDigest: input.rawReport?.reportDigest ?? null,
  });
  const producerSnapshotDigest = taskMapContractDigest({
    domain: "taskmap-unified-meeting-candidate-snapshot.1",
    googleSnapshotDigest: input.googleSnapshotDigest,
    rawSnapshotDigest: input.rawReport?.sourceSnapshotDigest ?? null,
  });
  const producedAt = [
    input.googleProducedAt,
    input.rawReport?.producedAt ?? null,
  ].filter((value): value is string => value !== null)
    .reduce((latest, value) => value > latest ? value : latest);
  return {
    ownerScopeDigest: input.ownerScopeDigest,
    producerResultDigest,
    producerSnapshotDigest,
    producedAt,
    assessedAt: input.assessedAt,
    candidates,
  };
}

export function assertVerifiedTaskMapGranolaExtractionReportFresh(
  report: VerifiedTaskMapGranolaExtractionReportV1,
  assessedAt: string,
): void {
  requireVerified(report);
  assertAssessedAt(assessedAt);
  const producedAtMs = Date.parse(report.producedAt);
  const assessedAtMs = Date.parse(assessedAt);
  if (
    assessedAtMs < producedAtMs
    || assessedAtMs
      >= producedAtMs + TASKMAP_MEETING_PRODUCER_MAX_AGE_MS
  ) unavailable("extraction_report_stale");
}
