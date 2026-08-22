import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import {
  inspectTaskMapAgentAdapterHandoffPreflightFromPaths,
  readTaskMapAgentAdapterHandoffPreflightArtifact,
} from "./agent-handoff-preflight-cli.js";

import {
  TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION,
  type TaskMapLocalExecutionPackageV1,
} from "./local-approval-package.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_AGENT_EXECUTION_START_VERSION =
  "taskmap-agent-execution-start-receipt.v2" as const;
export const TASKMAP_AGENT_EXECUTION_FINISH_VERSION =
  "taskmap-agent-execution-finish-receipt.v1" as const;
export const TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION =
  "taskmap-agent-artifact-receipt.v1" as const;
export const TASKMAP_AGENT_SESSION_REPORT_VERSION =
  "taskmap-agent-session-report-receipt.v1" as const;
export const TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION =
  "taskmap-agent-execution-inspection.v1" as const;
export const TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION =
  "taskmap-agent-execution-review-summary.v1" as const;
export const TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_VERSION =
  "taskmap-agent-execution-launcher-contract.v1" as const;
export const TASKMAP_AGENT_UNDERSTANDING_REPORT_SHAPE =
  "change_walkthrough" as const;
export const TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS = Object.freeze([
  "Context",
  "Intuition",
  "What was done",
  "Deviations & judgment calls",
  "What to watch",
  "Quiz",
] as const);

export const TASKMAP_AGENT_EXECUTION_LIMITS_V1 = Object.freeze({
  maxInputArtifactBytes: 256 * 1024,
  maxReceiptBytes: 64 * 1024,
  maxReturnedArtifacts: 8,
  maxReturnedArtifactBytes: 2 * 1024 * 1024,
  maxReturnedArtifactBytesTotal: 8 * 1024 * 1024,
  maxReportBytes: 128 * 1024,
  maxReportNarrativeSectionBytes: 4 * 1024,
  maxReportNarrativeBytesTotal: 16 * 1024,
  maxTestResults: 32,
  maxTestLabelCharacters: 160,
} as const);

export type TaskMapAgentAdapterV1 = "claude_code" | "codex_cli";
export type TaskMapAgentProofAdapterV1 = "codex" | "claude_code";
export type TaskMapAgentSessionStatusV1 =
  | "not_started"
  | "running"
  | "finished"
  | "failed";

export interface TaskMapAgentExecutionStartReceiptV1 {
  contractVersion: typeof TASKMAP_AGENT_EXECUTION_START_VERSION;
  startReceiptId: string;
  startReceiptDigest: string;
  sessionId: string;
  packageId: string;
  packageDigest: string;
  taskId: string;
  rootId: string;
  proofAdapter: TaskMapAgentProofAdapterV1;
  adapterPreflightId: string;
  adapterPreflightDigest: string;
  corePreflightId: string;
  corePreflightDigest: string;
  runtimeRequestDigest: string;
  startIdempotencyKey: string;
  localWorkspaceDigest: string;
  workspaceBindingDigest: string;
  launchedAdapter: TaskMapAgentAdapterV1;
  adapterSelection: "user_selected_after_package_approval";
  startedAt: string;
  userStartApprovalRecorded: true;
  state: "started";
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface TaskMapAgentExecutionFinishReceiptV1 {
  contractVersion: typeof TASKMAP_AGENT_EXECUTION_FINISH_VERSION;
  finishReceiptId: string;
  finishReceiptDigest: string;
  sessionId: string;
  startReceiptId: string;
  startReceiptDigest: string;
  finishedAt: string;
  sessionStatus: "finished" | "failed";
  exit:
    | { kind: "code"; code: number }
    | { kind: "signal"; signal: string };
  taskExecutedClaimed: false;
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface TaskMapAgentReturnedArtifactV1 {
  relativePath: string;
  contentDigest: string;
  bytes: number;
  mediaType:
    | "text/markdown"
    | "text/html"
    | "application/json"
    | "text/plain"
    | "application/octet-stream";
}

export interface TaskMapAgentArtifactReceiptV1 {
  contractVersion: typeof TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION;
  artifactReceiptId: string;
  artifactReceiptDigest: string;
  sessionId: string;
  startReceiptDigest: string;
  finishReceiptDigest: string;
  recordedAt: string;
  deliveryStatus: "artifact_delivered";
  artifacts: TaskMapAgentReturnedArtifactV1[];
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface TaskMapAgentReportTestResultV1 {
  label: string;
  status: "passed" | "failed" | "not_run";
}

export interface TaskMapAgentSessionReportReceiptV1 {
  contractVersion: typeof TASKMAP_AGENT_SESSION_REPORT_VERSION;
  reportReceiptId: string;
  reportReceiptDigest: string;
  sessionId: string;
  startReceiptDigest: string;
  finishReceiptDigest: string;
  artifactReceiptDigest: string;
  generatedAt: string;
  markdownRelativePath: "report.md";
  markdownDigest: string;
  htmlRelativePath: "report.html";
  htmlDigest: string;
  tests: TaskMapAgentReportTestResultV1[];
  reportStatus: "report_ready";
  transcriptStored: false;
  rawCredentialsStored: false;
  rawBiometricsStored: false;
  meetingBodiesStored: false;
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface TaskMapAgentExecutionInspectionV1 {
  contractVersion: typeof TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION;
  sessionId: string;
  progressState:
    | "not_started"
    | "started"
    | "finished_without_artifact"
    | "failed_without_artifact"
    | "artifact_delivered"
    | "report_ready";
  sessionStatus: TaskMapAgentSessionStatusV1;
  packageId: string | null;
  packageDigest: string | null;
  preflightId: string | null;
  preflightDigest: string | null;
  taskId: string | null;
  corePreflightId: string | null;
  corePreflightDigest: string | null;
  runtimeRequestDigest: string | null;
  startIdempotencyKey: string | null;
  rootId: string | null;
  workspaceBindingDigest: string | null;
  launchedAdapter: TaskMapAgentAdapterV1 | null;
  startedAt: string | null;
  finishedAt: string | null;
  artifactCount: number;
  artifactReceiptDigest: string | null;
  reportReceiptDigest: string | null;
  reportRelativePaths: [] | ["report.md", "report.html"];
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface TaskMapAgentExecutionReviewSummaryV1 {
  contractVersion:
    typeof TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION;
  summaryDigest: string;
  sessionId: string;
  progressState: TaskMapAgentExecutionInspectionV1["progressState"];
  reviewState: "not_ready" | "awaiting_review";
  reportShape:
    | null
    | typeof TASKMAP_AGENT_UNDERSTANDING_REPORT_SHAPE;
  artifactRelativePaths: string[];
  primaryArtifactRelativePath: string | null;
  markdownReportRelativePath: null | "report.md";
  htmlReportRelativePath: null | "report.html";
  artifactReceiptDigest: string | null;
  reportReceiptDigest: string | null;
  terminalStateInferred: false;
  sourceWritebackAttempted: false;
  sourceCompletion: false;
  outcomeVerified: false;
}

export interface RecordTaskMapAgentExecutionStartInputV1 {
  executionRoot: string;
  packagePath: string;
  workspacePath: string;
  sessionId: string;
  launchedAdapter: TaskMapAgentAdapterV1;
  adapterPreflightId: string;
  adapterPreflightDigest: string;
  corePreflightId: string;
  corePreflightDigest: string;
  runtimeRequestDigest: string;
  startIdempotencyKey: string;
  workspaceBindingDigest: string;
  startedAt: string;
}

export interface TaskMapAgentExecutionStartDependenciesV1 {
  inspectAdapterPreflight?:
    typeof inspectTaskMapAgentAdapterHandoffPreflightFromPaths;
  expectedCandidateOwnerScopeDigest?: string;
}

export interface RecordTaskMapAgentExecutionFinishInputV1 {
  executionRoot: string;
  sessionId: string;
  finishedAt: string;
  exit:
    | { kind: "code"; code: number }
    | { kind: "signal"; signal: string };
}

export interface RecordTaskMapAgentArtifactsInputV1 {
  executionRoot: string;
  sessionId: string;
  recordedAt: string;
  artifactRelativePaths: string[];
}

export interface GenerateTaskMapAgentSessionReportInputV1 {
  executionRoot: string;
  sessionId: string;
  generatedAt: string;
  tests?: TaskMapAgentReportTestResultV1[];
}

export interface TaskMapAgentExecutionLauncherContractV1 {
  contractVersion:
    typeof TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_VERSION;
  sessionIdentity: "caller_generated_lowercase_uuid";
  userAction: "explicit_approve_and_start";
  startReceiptTiming: "immediately_before_interactive_process_spawn";
  artifactReturnDirectory: "sessions/<session-id>/artifacts";
  requiredOrder: [
    "start",
    "finish",
    "artifacts",
    "report",
  ];
  supportedAdapters: ["claude_code", "codex_cli"];
  approvedPackageRequired: true;
  workspacePathStored: false;
  sourceWritebackSupported: false;
  outcomeVerificationSupported: false;
}

export const TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_V1 =
  Object.freeze<TaskMapAgentExecutionLauncherContractV1>({
    contractVersion: TASKMAP_AGENT_EXECUTION_LAUNCHER_CONTRACT_VERSION,
    sessionIdentity: "caller_generated_lowercase_uuid",
    userAction: "explicit_approve_and_start",
    startReceiptTiming: "immediately_before_interactive_process_spawn",
    artifactReturnDirectory: "sessions/<session-id>/artifacts",
    requiredOrder: [
      "start",
      "finish",
      "artifacts",
      "report",
    ],
    supportedAdapters: ["claude_code", "codex_cli"],
    approvedPackageRequired: true,
    workspacePathStored: false,
    sourceWritebackSupported: false,
    outcomeVerificationSupported: false,
  });

type JsonObject = Record<string, unknown>;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const DIGEST = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STRICT_RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const ROOT_ID = /^tmr_[A-Za-z0-9._-]{1,256}$/;
const PACKAGE_ID = /^tmlocalpackage_([a-f0-9]{64})$/;
const START_RECEIPT_ID = /^tmexecutionstart_([a-f0-9]{64})$/;
const FINISH_RECEIPT_ID = /^tmexecutionfinish_([a-f0-9]{64})$/;
const ARTIFACT_RECEIPT_ID = /^tmartifactreceipt_([a-f0-9]{64})$/;
const ADAPTER_PREFLIGHT_ID = /^tmadapterpreflight_([a-f0-9]{64})$/;
const CORE_PREFLIGHT_ID = /^tmhandoffpreflight_([a-f0-9]{64})$/;
const REPORT_RECEIPT_ID = /^tmsessionreport_([a-f0-9]{64})$/;
const ARTIFACT_RELATIVE_PATH =
  /^artifacts\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SIGNAL = /^SIG(?:ABRT|ALRM|BUS|FPE|HUP|ILL|INT|KILL|PIPE|QUIT|SEGV|TERM|TRAP|USR1|USR2)$/;
const SAFE_TEST_LABEL = /^[A-Za-z0-9][A-Za-z0-9 ._():/+,-]{0,159}$/;
const PACKAGE_DOMAIN = "taskmap-local-execution-package.1";
const START_DOMAIN = "taskmap-agent-execution-start-receipt.2";
const WORKSPACE_BINDING_DOMAIN =
  "taskmap-agent-execution-workspace-binding.1";
const FINISH_DOMAIN = "taskmap-agent-execution-finish-receipt.1";
const ARTIFACT_DOMAIN = "taskmap-agent-artifact-receipt.1";
const REPORT_DOMAIN = "taskmap-agent-session-report-receipt.1";
const ADAPTER_START_IDEMPOTENCY_DOMAIN =
  "taskmap-agent-adapter-start-idempotency.1";
const REVIEW_SUMMARY_DOMAIN =
  "taskmap-agent-execution-review-summary.1";

function fail(message: string): never {
  throw new Error(`Task Map agent execution unavailable: ${message}`);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is JsonObject {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain object`);
  }
}

function assertExactKeys(
  value: JsonObject,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} fields are invalid`);
  }
}

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    fail("sessionId must be a lowercase UUID");
  }
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || !STRICT_RFC3339.test(value)
    || !Number.isFinite(Date.parse(value))
  ) {
    fail(`${label} must be a strict RFC3339 timestamp`);
  }
}

function timestampMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail("timestamp is invalid");
  return parsed;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateExecutionRootInput(root: string): string {
  if (
    typeof root !== "string"
    || !path.isAbsolute(root)
    || path.normalize(root) !== root
    || root === path.parse(root).root
  ) {
    fail("executionRoot must be a normalized absolute non-root path");
  }
  return root;
}

async function assertOwnerDirectory(
  directory: string,
  create: boolean,
): Promise<string> {
  if (create) {
    await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
  }
  const resolved = await realpath(directory);
  if (resolved !== directory) fail("execution directory must not use symlinks");
  const stat = await lstat(directory);
  if (
    !stat.isDirectory()
    || stat.uid !== process.getuid?.()
    || (stat.mode & 0o777) !== DIRECTORY_MODE
  ) {
    fail("execution directory must be an owner-only directory");
  }
  return directory;
}

function sessionDirectory(executionRoot: string, sessionId: string): string {
  return path.join(executionRoot, "sessions", sessionId);
}

async function ensureSessionDirectory(
  executionRoot: string,
  sessionId: string,
): Promise<string> {
  validateExecutionRootInput(executionRoot);
  assertUuid(sessionId);
  await assertOwnerDirectory(executionRoot, true);
  const sessions = path.join(executionRoot, "sessions");
  await assertOwnerDirectory(sessions, true);
  const session = sessionDirectory(executionRoot, sessionId);
  await assertOwnerDirectory(session, true);
  await assertOwnerDirectory(path.join(session, "artifacts"), true);
  return session;
}

async function existingSessionDirectory(
  executionRoot: string,
  sessionId: string,
): Promise<string | null> {
  validateExecutionRootInput(executionRoot);
  assertUuid(sessionId);
  try {
    await assertOwnerDirectory(executionRoot, false);
    await assertOwnerDirectory(path.join(executionRoot, "sessions"), false);
    return await assertOwnerDirectory(
      sessionDirectory(executionRoot, sessionId),
      false,
    );
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function readHandleFully(
  handle: FileHandle,
  maxBytes: number,
): Promise<Buffer> {
  const stat = await handle.stat();
  if (
    !stat.isFile()
    || stat.uid !== process.getuid?.()
    || stat.nlink !== 1
    || (stat.mode & 0o777) !== FILE_MODE
    || stat.size <= 0
    || stat.size > maxBytes
  ) {
    fail("private file boundary is invalid");
  }
  const buffer = Buffer.alloc(stat.size);
  let offset = 0;
  while (offset < buffer.length) {
    const read = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      offset,
    );
    if (read.bytesRead <= 0) fail("private file read was incomplete");
    offset += read.bytesRead;
  }
  const after = await handle.stat();
  if (
    after.dev !== stat.dev
    || after.ino !== stat.ino
    || after.size !== stat.size
  ) {
    fail("private file changed while reading");
  }
  return buffer;
}

async function readPrivateBytes(
  filePath: string,
  maxBytes: number,
): Promise<Buffer> {
  const handle = await open(
    filePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    return await readHandleFully(handle, maxBytes);
  } finally {
    await handle.close();
  }
}

function parseCanonicalJsonBytes(bytes: Buffer, label: string): unknown {
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").length !== bytes.length) {
    fail(`${label} must be strict UTF-8`);
  }
  const withoutLf = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (withoutLf.includes("\n")) fail(`${label} must be single-line JSON`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutLf);
  } catch {
    fail(`${label} is not JSON`);
  }
  if (taskMapContractCanonicalJson(parsed) !== withoutLf) {
    fail(`${label} must be canonical JSON`);
  }
  return parsed;
}

async function readPrivateJson(
  filePath: string,
  maxBytes: number,
  label: string,
): Promise<unknown> {
  return parseCanonicalJsonBytes(
    await readPrivateBytes(filePath, maxBytes),
    label,
  );
}

async function writeImmutableBytes(
  filePath: string,
  bytes: Buffer,
): Promise<boolean> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(
      filePath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      FILE_MODE,
    );
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.chmod(FILE_MODE);
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && (error as NodeJS.ErrnoException).code === "EEXIST"
    ) {
      const existing = await readPrivateBytes(filePath, bytes.length);
      if (!existing.equals(bytes)) fail("immutable receipt conflicts");
      return true;
    }
    throw error;
  } finally {
    await handle?.close();
  }
  const written = await readPrivateBytes(filePath, bytes.length);
  if (!written.equals(bytes)) fail("immutable receipt readback failed");
  return false;
}

async function writeImmutableJson(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  const bytes = Buffer.from(taskMapContractCanonicalJson(value), "utf8");
  if (bytes.length > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes) {
    fail("receipt exceeds the byte limit");
  }
  return writeImmutableBytes(filePath, bytes);
}

function assertPackage(
  value: unknown,
): asserts value is TaskMapLocalExecutionPackageV1 {
  assertPlainObject(value, "execution package");
  assertExactKeys(value, [
    "contractVersion",
    "packageId",
    "packageDigest",
    "approvalAuthorizationId",
    "approvalAuthorizationDigest",
    "localOwnerScopeDigest",
    "proofDigest",
    "quartet",
    "task",
    "executionBoundary",
    "privacy",
  ], "execution package");
  assertDigest(value.packageDigest, "packageDigest");
  if (
    value.contractVersion !== TASKMAP_LOCAL_EXECUTION_PACKAGE_VERSION
    || typeof value.packageId !== "string"
    || PACKAGE_ID.exec(value.packageId)?.[1] !== value.packageDigest
  ) {
    fail("execution package identity is invalid");
  }
  const core = { ...value };
  delete core.packageId;
  delete core.packageDigest;
  if (
    taskMapContractDigest({ domain: PACKAGE_DOMAIN, ...core })
      !== value.packageDigest
  ) {
    fail("execution package seal is invalid");
  }
  assertPlainObject(value.task, "execution package task");
  if (
    typeof value.task.taskId !== "string"
    || !TASK_ID.test(value.task.taskId)
    || typeof value.task.rootId !== "string"
    || !ROOT_ID.test(value.task.rootId)
  ) {
    fail("execution package task identity is invalid");
  }
  assertPlainObject(value.executionBoundary, "execution package boundary");
  assertPlainObject(value.privacy, "execution package privacy");
  if (
    value.executionBoundary.state !== "prepared_not_started"
    || value.executionBoundary.approvalRecorded !== true
    || value.executionBoundary.deliveryStatus !== "not_started"
    || value.executionBoundary.taskStarted !== false
    || value.executionBoundary.taskExecuted !== false
    || value.executionBoundary.dispatchAuthorized !== false
    || value.executionBoundary.sourceWritebackAuthorized !== false
    || value.executionBoundary.codexTaskStartAuthorized !== false
    || value.privacy.sourceBodiesStored !== false
    || value.privacy.localPathsStored !== false
    || value.privacy.rawBiometricsStored !== false
    || value.privacy.ownerIdentityStored !== false
  ) {
    fail("execution package is not safely prepared");
  }
}

async function workspaceBindingDigest(
  workspacePath: string,
): Promise<string> {
  if (
    typeof workspacePath !== "string"
    || !path.isAbsolute(workspacePath)
    || path.normalize(workspacePath) !== workspacePath
    || workspacePath === path.parse(workspacePath).root
  ) {
    fail("workspacePath must be a normalized absolute non-root path");
  }
  const metadata = await lstat(workspacePath);
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== process.getuid?.()
    || await realpath(workspacePath) !== workspacePath
  ) {
    fail("workspacePath must be a real owner directory");
  }
  return taskMapContractDigest({
    domain: WORKSPACE_BINDING_DOMAIN,
    workspacePath,
  });
}

function sealReceipt<T extends JsonObject>(
  core: T,
  domain: string,
  digestKey: string,
  idKey: string,
  idPrefix: string,
): T & Record<string, string> {
  const digest = taskMapContractDigest({ domain, ...core });
  return {
    ...core,
    [digestKey]: digest,
    [idKey]: `${idPrefix}${digest}`,
  };
}

function assertSealedReceipt(
  value: unknown,
  options: {
    label: string;
    version: string;
    keys: readonly string[];
    domain: string;
    digestKey: string;
    idKey: string;
    idPattern: RegExp;
  },
): JsonObject {
  assertPlainObject(value, options.label);
  assertExactKeys(value, options.keys, options.label);
  if (value.contractVersion !== options.version) {
    fail(`${options.label} version is invalid`);
  }
  assertDigest(value[options.digestKey], `${options.label} digest`);
  const receiptId = value[options.idKey];
  if (
    typeof receiptId !== "string"
    || options.idPattern.exec(receiptId)?.[1]
      !== value[options.digestKey]
  ) {
    fail(`${options.label} id is invalid`);
  }
  const core = { ...value };
  delete core[options.idKey];
  delete core[options.digestKey];
  if (
    taskMapContractDigest({ domain: options.domain, ...core })
      !== value[options.digestKey]
  ) {
    fail(`${options.label} seal is invalid`);
  }
  return value;
}

function assertStartReceipt(
  value: unknown,
): asserts value is TaskMapAgentExecutionStartReceiptV1 {
  const receipt = assertSealedReceipt(value, {
    label: "start receipt",
    version: TASKMAP_AGENT_EXECUTION_START_VERSION,
    keys: [
      "contractVersion",
      "startReceiptId",
      "startReceiptDigest",
      "sessionId",
      "packageId",
      "packageDigest",
      "taskId",
      "proofAdapter",
      "adapterPreflightId",
      "adapterPreflightDigest",
      "corePreflightId",
      "corePreflightDigest",
      "runtimeRequestDigest",
      "startIdempotencyKey",
      "localWorkspaceDigest",
      "rootId",
      "workspaceBindingDigest",
      "launchedAdapter",
      "adapterSelection",
      "startedAt",
      "userStartApprovalRecorded",
      "state",
      "sourceWritebackAttempted",
      "sourceCompletion",
      "outcomeVerified",
    ],
    domain: START_DOMAIN,
    digestKey: "startReceiptDigest",
    idKey: "startReceiptId",
    idPattern: START_RECEIPT_ID,
  }) as unknown as TaskMapAgentExecutionStartReceiptV1;
  assertUuid(receipt.sessionId);
  assertTimestamp(receipt.startedAt, "startedAt");
  assertDigest(receipt.adapterPreflightDigest, "adapterPreflightDigest");
  assertDigest(receipt.corePreflightDigest, "corePreflightDigest");
  assertDigest(receipt.runtimeRequestDigest, "runtimeRequestDigest");
  assertDigest(receipt.startIdempotencyKey, "startIdempotencyKey");
  assertDigest(receipt.localWorkspaceDigest, "localWorkspaceDigest");
  assertDigest(receipt.packageDigest, "packageDigest");
  assertDigest(receipt.workspaceBindingDigest, "workspaceBindingDigest");
  if (
    !["claude_code", "codex_cli"].includes(receipt.launchedAdapter)
    || receipt.adapterSelection !== "user_selected_after_package_approval"
    || receipt.proofAdapter
      !== (receipt.launchedAdapter === "codex_cli" ? "codex" : "claude_code")
    || ADAPTER_PREFLIGHT_ID.exec(receipt.adapterPreflightId)?.[1]
      !== receipt.adapterPreflightDigest
    || CORE_PREFLIGHT_ID.exec(receipt.corePreflightId)?.[1]
      !== receipt.corePreflightDigest
    || PACKAGE_ID.exec(receipt.packageId)?.[1] !== receipt.packageDigest
    || taskMapContractDigest({
      domain: ADAPTER_START_IDEMPOTENCY_DOMAIN,
      adapter: receipt.proofAdapter,
      packageDigest: receipt.packageDigest,
      corePreflightDigest: receipt.corePreflightDigest,
      requestDigest: receipt.runtimeRequestDigest,
    }) !== receipt.startIdempotencyKey
    || receipt.userStartApprovalRecorded !== true
    || receipt.state !== "started"
    || receipt.sourceWritebackAttempted !== false
    || receipt.sourceCompletion !== false
    || receipt.outcomeVerified !== false
  ) {
    fail("start receipt boundary is invalid");
  }
}

function assertFinishReceipt(
  value: unknown,
  start: TaskMapAgentExecutionStartReceiptV1,
): asserts value is TaskMapAgentExecutionFinishReceiptV1 {
  const receipt = assertSealedReceipt(value, {
    label: "finish receipt",
    version: TASKMAP_AGENT_EXECUTION_FINISH_VERSION,
    keys: [
      "contractVersion",
      "finishReceiptId",
      "finishReceiptDigest",
      "sessionId",
      "startReceiptId",
      "startReceiptDigest",
      "finishedAt",
      "sessionStatus",
      "exit",
      "taskExecutedClaimed",
      "sourceWritebackAttempted",
      "sourceCompletion",
      "outcomeVerified",
    ],
    domain: FINISH_DOMAIN,
    digestKey: "finishReceiptDigest",
    idKey: "finishReceiptId",
    idPattern: FINISH_RECEIPT_ID,
  }) as unknown as TaskMapAgentExecutionFinishReceiptV1;
  assertTimestamp(receipt.finishedAt, "finishedAt");
  assertPlainObject(receipt.exit, "finish exit");
  if (
    receipt.sessionId !== start.sessionId
    || receipt.startReceiptId !== start.startReceiptId
    || receipt.startReceiptDigest !== start.startReceiptDigest
    || timestampMs(receipt.finishedAt) < timestampMs(start.startedAt)
    || receipt.taskExecutedClaimed !== false
    || receipt.sourceWritebackAttempted !== false
    || receipt.sourceCompletion !== false
    || receipt.outcomeVerified !== false
  ) {
    fail("finish receipt does not follow the start receipt");
  }
  const expectedStatus = receipt.exit.kind === "code" && receipt.exit.code === 0
    ? "finished"
    : "failed";
  if (receipt.sessionStatus !== expectedStatus) {
    fail("finish receipt status conflicts with exit status");
  }
  validateExit(receipt.exit);
}

function assertArtifactReceipt(
  value: unknown,
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
): asserts value is TaskMapAgentArtifactReceiptV1 {
  const receipt = assertSealedReceipt(value, {
    label: "artifact receipt",
    version: TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION,
    keys: [
      "contractVersion",
      "artifactReceiptId",
      "artifactReceiptDigest",
      "sessionId",
      "startReceiptDigest",
      "finishReceiptDigest",
      "recordedAt",
      "deliveryStatus",
      "artifacts",
      "sourceWritebackAttempted",
      "sourceCompletion",
      "outcomeVerified",
    ],
    domain: ARTIFACT_DOMAIN,
    digestKey: "artifactReceiptDigest",
    idKey: "artifactReceiptId",
    idPattern: ARTIFACT_RECEIPT_ID,
  }) as unknown as TaskMapAgentArtifactReceiptV1;
  assertTimestamp(receipt.recordedAt, "artifact recordedAt");
  if (
    receipt.sessionId !== start.sessionId
    || receipt.startReceiptDigest !== start.startReceiptDigest
    || receipt.finishReceiptDigest !== finish.finishReceiptDigest
    || timestampMs(receipt.recordedAt) < timestampMs(finish.finishedAt)
    || receipt.deliveryStatus !== "artifact_delivered"
    || receipt.sourceWritebackAttempted !== false
    || receipt.sourceCompletion !== false
    || receipt.outcomeVerified !== false
  ) {
    fail("artifact receipt boundary is invalid");
  }
  validateReturnedArtifacts(receipt.artifacts);
}

function assertReportReceipt(
  value: unknown,
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
  artifact: TaskMapAgentArtifactReceiptV1,
): asserts value is TaskMapAgentSessionReportReceiptV1 {
  const receipt = assertSealedReceipt(value, {
    label: "report receipt",
    version: TASKMAP_AGENT_SESSION_REPORT_VERSION,
    keys: [
      "contractVersion",
      "reportReceiptId",
      "reportReceiptDigest",
      "sessionId",
      "startReceiptDigest",
      "finishReceiptDigest",
      "artifactReceiptDigest",
      "generatedAt",
      "markdownRelativePath",
      "markdownDigest",
      "htmlRelativePath",
      "htmlDigest",
      "tests",
      "reportStatus",
      "transcriptStored",
      "rawCredentialsStored",
      "rawBiometricsStored",
      "meetingBodiesStored",
      "sourceWritebackAttempted",
      "sourceCompletion",
      "outcomeVerified",
    ],
    domain: REPORT_DOMAIN,
    digestKey: "reportReceiptDigest",
    idKey: "reportReceiptId",
    idPattern: REPORT_RECEIPT_ID,
  }) as unknown as TaskMapAgentSessionReportReceiptV1;
  assertTimestamp(receipt.generatedAt, "report generatedAt");
  assertDigest(receipt.markdownDigest, "markdownDigest");
  assertDigest(receipt.htmlDigest, "htmlDigest");
  if (
    receipt.sessionId !== start.sessionId
    || receipt.startReceiptDigest !== start.startReceiptDigest
    || receipt.finishReceiptDigest !== finish.finishReceiptDigest
    || receipt.artifactReceiptDigest !== artifact.artifactReceiptDigest
    || timestampMs(receipt.generatedAt) < timestampMs(artifact.recordedAt)
    || receipt.markdownRelativePath !== "report.md"
    || receipt.htmlRelativePath !== "report.html"
    || receipt.reportStatus !== "report_ready"
    || receipt.transcriptStored !== false
    || receipt.rawCredentialsStored !== false
    || receipt.rawBiometricsStored !== false
    || receipt.meetingBodiesStored !== false
    || receipt.sourceWritebackAttempted !== false
    || receipt.sourceCompletion !== false
    || receipt.outcomeVerified !== false
  ) {
    fail("report receipt boundary is invalid");
  }
  validateTests(receipt.tests);
}

function validateExit(
  exit: TaskMapAgentExecutionFinishReceiptV1["exit"],
): void {
  assertPlainObject(exit, "session exit");
  if (exit.kind === "code") {
    assertExactKeys(exit, ["kind", "code"], "session code exit");
    if (
      !Number.isSafeInteger(exit.code)
      || exit.code < 0
      || exit.code > 255
    ) {
      fail("session exit code is invalid");
    }
    return;
  }
  if (exit.kind === "signal") {
    assertExactKeys(exit, ["kind", "signal"], "session signal exit");
    if (typeof exit.signal !== "string" || !SIGNAL.test(exit.signal)) {
      fail("session exit signal is invalid");
    }
    return;
  }
  fail("session exit kind is invalid");
}

function mediaType(relativePath: string): TaskMapAgentReturnedArtifactV1["mediaType"] {
  switch (path.extname(relativePath).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".html":
    case ".htm":
      return "text/html";
    case ".json":
      return "application/json";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function validateReturnedArtifacts(
  artifacts: TaskMapAgentReturnedArtifactV1[],
): void {
  if (
    !Array.isArray(artifacts)
    || artifacts.length === 0
    || artifacts.length
      > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifacts
  ) {
    fail("artifact inventory count is invalid");
  }
  let total = 0;
  let previous = "";
  for (const artifact of artifacts) {
    assertPlainObject(artifact, "returned artifact");
    assertExactKeys(
      artifact,
      ["relativePath", "contentDigest", "bytes", "mediaType"],
      "returned artifact",
    );
    if (
      typeof artifact.relativePath !== "string"
      || !ARTIFACT_RELATIVE_PATH.test(artifact.relativePath)
      || artifact.relativePath <= previous
    ) {
      fail("artifact paths must be unique, sorted, and bounded");
    }
    assertDigest(artifact.contentDigest, "artifact contentDigest");
    if (
      !Number.isSafeInteger(artifact.bytes)
      || artifact.bytes <= 0
      || artifact.bytes
        > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifactBytes
      || artifact.mediaType !== mediaType(artifact.relativePath)
    ) {
      fail("artifact metadata is invalid");
    }
    total += artifact.bytes;
    previous = artifact.relativePath;
  }
  if (
    total > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifactBytesTotal
  ) {
    fail("artifact inventory exceeds the aggregate byte limit");
  }
}

function privacyUnsafeText(value: string): boolean {
  return (
    /(?:^|[\s"'=])(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})/i.test(value)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value)
    || /(?:bearer|client_secret|access_token|refresh_token)\s*[:=]\s*\S+/i.test(value)
    || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value)
    || /(?:\bHRV\b|readiness score|sleep score|resting heart rate|raw biometrics?)/i.test(value)
    || /(?:^|\s)(?:\/Users\/|\/home\/|~\/)/.test(value)
  );
}

function validateTests(
  tests: TaskMapAgentReportTestResultV1[],
): TaskMapAgentReportTestResultV1[] {
  if (
    !Array.isArray(tests)
    || tests.length > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxTestResults
  ) {
    fail("report tests exceed the count limit");
  }
  const normalized = tests.map((test) => {
    assertPlainObject(test, "report test");
    assertExactKeys(test, ["label", "status"], "report test");
    if (
      typeof test.label !== "string"
      || test.label.length
        > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxTestLabelCharacters
      || !SAFE_TEST_LABEL.test(test.label)
      || privacyUnsafeText(test.label)
      || !["passed", "failed", "not_run"].includes(test.status)
    ) {
      fail("report test is not privacy-safe");
    }
    return {
      label: test.label,
      status: test.status,
    };
  });
  normalized.sort((left, right) => (
    left.label.localeCompare(right.label)
    || left.status.localeCompare(right.status)
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1]!.label === normalized[index]!.label) {
      fail("report test labels must be unique");
    }
  }
  return normalized;
}

async function readStart(
  session: string,
): Promise<TaskMapAgentExecutionStartReceiptV1> {
  const parsed = await readPrivateJson(
    path.join(session, "start-receipt.json"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes,
    "start receipt",
  );
  assertStartReceipt(parsed);
  return parsed;
}

async function readFinish(
  session: string,
  start: TaskMapAgentExecutionStartReceiptV1,
): Promise<TaskMapAgentExecutionFinishReceiptV1> {
  const parsed = await readPrivateJson(
    path.join(session, "finish-receipt.json"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes,
    "finish receipt",
  );
  assertFinishReceipt(parsed, start);
  return parsed;
}

async function readArtifactReceipt(
  session: string,
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
): Promise<TaskMapAgentArtifactReceiptV1> {
  const parsed = await readPrivateJson(
    path.join(session, "artifact-receipt.json"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes,
    "artifact receipt",
  );
  assertArtifactReceipt(parsed, start, finish);
  return parsed;
}

async function readReportReceipt(
  session: string,
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
  artifact: TaskMapAgentArtifactReceiptV1,
): Promise<TaskMapAgentSessionReportReceiptV1> {
  const parsed = await readPrivateJson(
    path.join(session, "report-receipt.json"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReceiptBytes,
    "report receipt",
  );
  assertReportReceipt(parsed, start, finish, artifact);
  const markdown = await readPrivateBytes(
    path.join(session, "report.md"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportBytes,
  );
  const html = await readPrivateBytes(
    path.join(session, "report.html"),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportBytes,
  );
  if (
    sha256(markdown) !== parsed.markdownDigest
    || sha256(html) !== parsed.htmlDigest
    || privacyUnsafeText(markdown.toString("utf8"))
    || privacyUnsafeText(html.toString("utf8"))
  ) {
    fail("report files do not match their privacy-safe receipt");
  }
  return parsed;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function recordTaskMapAgentExecutionStart(
  input: RecordTaskMapAgentExecutionStartInputV1,
  dependencies: TaskMapAgentExecutionStartDependenciesV1 = {},
): Promise<{
  receipt: TaskMapAgentExecutionStartReceiptV1;
  replayed: boolean;
}> {
  assertPlainObject(input, "record-start input");
  assertExactKeys(input, [
    "executionRoot",
    "packagePath",
    "workspacePath",
    "sessionId",
    "launchedAdapter",
    "adapterPreflightId",
    "adapterPreflightDigest",
    "corePreflightId",
    "corePreflightDigest",
    "runtimeRequestDigest",
    "startIdempotencyKey",
    "workspaceBindingDigest",
    "startedAt",
  ], "record-start input");
  assertUuid(input.sessionId);
  assertTimestamp(input.startedAt, "startedAt");
  if (!["claude_code", "codex_cli"].includes(input.launchedAdapter)) {
    fail("launchedAdapter is invalid");
  }
  assertDigest(input.adapterPreflightDigest, "adapterPreflightDigest");
  assertDigest(input.corePreflightDigest, "corePreflightDigest");
  assertDigest(input.runtimeRequestDigest, "runtimeRequestDigest");
  assertDigest(input.startIdempotencyKey, "startIdempotencyKey");
  assertDigest(input.workspaceBindingDigest, "workspaceBindingDigest");
  const proofAdapter: TaskMapAgentProofAdapterV1 =
    input.launchedAdapter === "codex_cli" ? "codex" : "claude_code";
  if (
    typeof input.adapterPreflightId !== "string"
    || typeof input.corePreflightId !== "string"
  ) {
    fail("adapter preflight identity is invalid");
  }
  if (
    ADAPTER_PREFLIGHT_ID.exec(input.adapterPreflightId)?.[1]
      !== input.adapterPreflightDigest
    || CORE_PREFLIGHT_ID.exec(input.corePreflightId)?.[1]
      !== input.corePreflightDigest
  ) {
    fail("adapter preflight identity is invalid");
  }
  if (
    !path.isAbsolute(input.packagePath)
    || path.normalize(input.packagePath) !== input.packagePath
  ) {
    fail("packagePath must be a normalized absolute path");
  }
  const packageDirectory = path.dirname(input.packagePath);
  await assertOwnerDirectory(packageDirectory, false);
  const executionPackage = await readPrivateJson(
    input.packagePath,
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxInputArtifactBytes,
    "execution package",
  );
  assertPackage(executionPackage);
  const persistedAdapterPreflight =
    await readTaskMapAgentAdapterHandoffPreflightArtifact(
      input.packagePath,
      input.adapterPreflightId,
    );
  const ownerRoot = path.dirname(packageDirectory);
  const expectedCandidateOwnerScopeDigest =
    dependencies.expectedCandidateOwnerScopeDigest
      ?? (dependencies.inspectAdapterPreflight === undefined
        ? path.basename(ownerRoot)
        : executionPackage.localOwnerScopeDigest);
  if (!DIGEST.test(expectedCandidateOwnerScopeDigest)) {
    fail(
      "candidate owner scope is unavailable for current preflight validation",
    );
  }
  const adapterPreflight = await (
    dependencies.inspectAdapterPreflight
      ?? inspectTaskMapAgentAdapterHandoffPreflightFromPaths
  )({
    adapter: proofAdapter,
    packagePath: input.packagePath,
    workspacePath: input.workspacePath,
    ownerRoot,
    taskMapRoot: path.join(ownerRoot, "taskmap"),
    expectedCandidateOwnerScopeDigest:
      expectedCandidateOwnerScopeDigest,
  });
  if (
    taskMapContractCanonicalJson(persistedAdapterPreflight)
      !== taskMapContractCanonicalJson(adapterPreflight)
  ) {
    fail("persisted adapter preflight is not current");
  }
  if (
    adapterPreflight.adapter !== proofAdapter
    || adapterPreflight.adapterPreflightId !== input.adapterPreflightId
    || adapterPreflight.adapterPreflightDigest
      !== input.adapterPreflightDigest
    || adapterPreflight.corePreflightId !== input.corePreflightId
    || adapterPreflight.corePreflightDigest !== input.corePreflightDigest
    || adapterPreflight.runtimeRequest.requestDigest
      !== input.runtimeRequestDigest
    || adapterPreflight.startIdempotencyKey !== input.startIdempotencyKey
    || adapterPreflight.workspaceBindingDigest
      !== input.workspaceBindingDigest
    || adapterPreflight.packageId !== executionPackage.packageId
    || adapterPreflight.packageDigest !== executionPackage.packageDigest
    || adapterPreflight.taskId !== executionPackage.task.taskId
    || adapterPreflight.rootId !== executionPackage.task.rootId
  ) {
    fail("adapter preflight binding is invalid");
  }
  const workspaceDigest = await workspaceBindingDigest(input.workspacePath);
  const core = {
    contractVersion: TASKMAP_AGENT_EXECUTION_START_VERSION,
    sessionId: input.sessionId,
    packageId: executionPackage.packageId,
    packageDigest: executionPackage.packageDigest,
    taskId: executionPackage.task.taskId,
    rootId: executionPackage.task.rootId,
    proofAdapter,
    adapterPreflightId: input.adapterPreflightId,
    adapterPreflightDigest: input.adapterPreflightDigest,
    corePreflightId: input.corePreflightId,
    corePreflightDigest: input.corePreflightDigest,
    runtimeRequestDigest: input.runtimeRequestDigest,
    startIdempotencyKey: input.startIdempotencyKey,
    localWorkspaceDigest: workspaceDigest,
    workspaceBindingDigest: input.workspaceBindingDigest,
    launchedAdapter: input.launchedAdapter,
    adapterSelection: "user_selected_after_package_approval" as const,
    startedAt: input.startedAt,
    userStartApprovalRecorded: true as const,
    state: "started" as const,
    sourceWritebackAttempted: false as const,
    sourceCompletion: false as const,
    outcomeVerified: false as const,
  };
  const receipt = sealReceipt(
    core,
    START_DOMAIN,
    "startReceiptDigest",
    "startReceiptId",
    "tmexecutionstart_",
  ) as unknown as TaskMapAgentExecutionStartReceiptV1;
  const session = await ensureSessionDirectory(
    input.executionRoot,
    input.sessionId,
  );
  const replayed = await writeImmutableJson(
    path.join(session, "start-receipt.json"),
    receipt,
  );
  return { receipt, replayed };
}

export async function recordTaskMapAgentExecutionFinish(
  input: RecordTaskMapAgentExecutionFinishInputV1,
): Promise<{
  receipt: TaskMapAgentExecutionFinishReceiptV1;
  replayed: boolean;
}> {
  assertPlainObject(input, "record-finish input");
  assertExactKeys(
    input,
    ["executionRoot", "sessionId", "finishedAt", "exit"],
    "record-finish input",
  );
  assertUuid(input.sessionId);
  assertTimestamp(input.finishedAt, "finishedAt");
  validateExit(input.exit);
  const session = await existingSessionDirectory(
    input.executionRoot,
    input.sessionId,
  );
  if (session === null) fail("session has not started");
  const start = await readStart(session);
  if (timestampMs(input.finishedAt) < timestampMs(start.startedAt)) {
    fail("finishedAt precedes startedAt");
  }
  const sessionStatus =
    input.exit.kind === "code" && input.exit.code === 0
      ? "finished"
      : "failed";
  const core = {
    contractVersion: TASKMAP_AGENT_EXECUTION_FINISH_VERSION,
    sessionId: input.sessionId,
    startReceiptId: start.startReceiptId,
    startReceiptDigest: start.startReceiptDigest,
    finishedAt: input.finishedAt,
    sessionStatus,
    exit: { ...input.exit },
    taskExecutedClaimed: false as const,
    sourceWritebackAttempted: false as const,
    sourceCompletion: false as const,
    outcomeVerified: false as const,
  };
  const receipt = sealReceipt(
    core,
    FINISH_DOMAIN,
    "finishReceiptDigest",
    "finishReceiptId",
    "tmexecutionfinish_",
  ) as unknown as TaskMapAgentExecutionFinishReceiptV1;
  const replayed = await writeImmutableJson(
    path.join(session, "finish-receipt.json"),
    receipt,
  );
  return { receipt, replayed };
}

export async function recordTaskMapAgentArtifacts(
  input: RecordTaskMapAgentArtifactsInputV1,
): Promise<{
  receipt: TaskMapAgentArtifactReceiptV1;
  replayed: boolean;
}> {
  assertPlainObject(input, "record-artifacts input");
  assertExactKeys(input, [
    "executionRoot",
    "sessionId",
    "recordedAt",
    "artifactRelativePaths",
  ], "record-artifacts input");
  assertUuid(input.sessionId);
  assertTimestamp(input.recordedAt, "recordedAt");
  if (
    !Array.isArray(input.artifactRelativePaths)
    || input.artifactRelativePaths.length === 0
    || input.artifactRelativePaths.length
      > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifacts
  ) {
    fail("artifactRelativePaths count is invalid");
  }
  const relativePaths = [...input.artifactRelativePaths].sort();
  if (
    relativePaths.some((row, index) => (
      typeof row !== "string"
      || !ARTIFACT_RELATIVE_PATH.test(row)
      || (index > 0 && row === relativePaths[index - 1])
    ))
  ) {
    fail("artifactRelativePaths are invalid");
  }
  const session = await existingSessionDirectory(
    input.executionRoot,
    input.sessionId,
  );
  if (session === null) fail("session has not started");
  const start = await readStart(session);
  const finish = await readFinish(session, start);
  if (finish.sessionStatus !== "finished") {
    fail("failed sessions cannot deliver an accepted artifact");
  }
  if (timestampMs(input.recordedAt) < timestampMs(finish.finishedAt)) {
    fail("artifact recordedAt precedes finishedAt");
  }
  const artifactRoot = await assertOwnerDirectory(
    path.join(session, "artifacts"),
    false,
  );
  const artifacts: TaskMapAgentReturnedArtifactV1[] = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(session, relativePath);
    if (
      path.dirname(absolutePath) !== artifactRoot
      || path.relative(session, absolutePath) !== relativePath
    ) {
      fail("artifact escapes the authorized return directory");
    }
    const bytes = await readPrivateBytes(
      absolutePath,
      TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifactBytes,
    );
    artifacts.push({
      relativePath,
      contentDigest: sha256(bytes),
      bytes: bytes.length,
      mediaType: mediaType(relativePath),
    });
  }
  validateReturnedArtifacts(artifacts);
  const core = {
    contractVersion: TASKMAP_AGENT_ARTIFACT_RECEIPT_VERSION,
    sessionId: input.sessionId,
    startReceiptDigest: start.startReceiptDigest,
    finishReceiptDigest: finish.finishReceiptDigest,
    recordedAt: input.recordedAt,
    deliveryStatus: "artifact_delivered" as const,
    artifacts,
    sourceWritebackAttempted: false as const,
    sourceCompletion: false as const,
    outcomeVerified: false as const,
  };
  const receipt = sealReceipt(
    core,
    ARTIFACT_DOMAIN,
    "artifactReceiptDigest",
    "artifactReceiptId",
    "tmartifactreceipt_",
  ) as unknown as TaskMapAgentArtifactReceiptV1;
  const replayed = await writeImmutableJson(
    path.join(session, "artifact-receipt.json"),
    receipt,
  );
  return { receipt, replayed };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type TaskMapAgentUnderstandingReportSection =
  typeof TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS[number];
type TaskMapAgentNarrativeSection = Exclude<
  TaskMapAgentUnderstandingReportSection,
  "Quiz"
>;

interface TaskMapAgentUnderstandingNarrativeV1 {
  source: "receipt_fallback" | "returned_artifact";
  privacyBoundaryExcluded: boolean;
  sections: Partial<Record<TaskMapAgentNarrativeSection, string>>;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const marker =
    "\n[Returned narrative truncated at the report boundary.]";
  const contentLimit = Math.max(
    0,
    maxBytes - Buffer.byteLength(marker, "utf8"),
  );
  let bytes = 0;
  let output = "";
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > contentLimit) break;
    output += character;
    bytes += characterBytes;
  }
  return `${output.trimEnd()}${marker}`;
}

function normalizeNarrativeSections(
  text: string,
): Partial<Record<TaskMapAgentNarrativeSection, string>> {
  const sectionNames = new Set<TaskMapAgentNarrativeSection>([
    "Context",
    "Intuition",
    "What was done",
    "Deviations & judgment calls",
    "What to watch",
  ]);
  const collected = new Map<TaskMapAgentNarrativeSection, string[]>();
  const unsectioned: string[] = [];
  let active: TaskMapAgentNarrativeSection | null = null;
  let ignoringQuiz = false;
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading === "Quiz") {
      active = null;
      ignoringQuiz = true;
      continue;
    }
    if (
      heading !== undefined
      && sectionNames.has(heading as TaskMapAgentNarrativeSection)
    ) {
      active = heading as TaskMapAgentNarrativeSection;
      ignoringQuiz = false;
      if (!collected.has(active)) collected.set(active, []);
      continue;
    }
    if (active === null) {
      if (heading === undefined && !ignoringQuiz) unsectioned.push(line);
    } else {
      collected.get(active)!.push(line);
    }
  }
  if (collected.size === 0) {
    const fallback = unsectioned.join("\n").trim();
    if (fallback.length > 0) collected.set("What was done", [fallback]);
  }
  const sections: Partial<Record<TaskMapAgentNarrativeSection, string>> = {};
  let remaining =
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportNarrativeBytesTotal;
  for (const name of sectionNames) {
    const value = collected.get(name)?.join("\n").trim() ?? "";
    if (value.length === 0 || remaining <= 0) continue;
    const bounded = truncateUtf8(
      value,
      Math.min(
        remaining,
        TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportNarrativeSectionBytes,
      ),
    );
    sections[name] = bounded;
    remaining -= Buffer.byteLength(bounded, "utf8");
  }
  return sections;
}

async function returnedArtifactNarrative(
  session: string,
  artifact: TaskMapAgentArtifactReceiptV1,
): Promise<TaskMapAgentUnderstandingNarrativeV1> {
  const result = artifact.artifacts.find(
    (row) => row.relativePath === "artifacts/result.md",
  );
  if (result === undefined) {
    return {
      source: "receipt_fallback",
      privacyBoundaryExcluded: false,
      sections: {},
    };
  }
  const bytes = await readPrivateBytes(
    path.join(session, result.relativePath),
    TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReturnedArtifactBytes,
  );
  if (
    bytes.length !== result.bytes
    || sha256(bytes) !== result.contentDigest
  ) {
    fail("returned result no longer matches its artifact receipt");
  }
  const text = bytes.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(bytes)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    || privacyUnsafeText(text)
  ) {
    return {
      source: "receipt_fallback",
      privacyBoundaryExcluded: true,
      sections: {},
    };
  }
  const sections = normalizeNarrativeSections(text);
  return {
    source: Object.keys(sections).length === 0
      ? "receipt_fallback"
      : "returned_artifact",
    privacyBoundaryExcluded: false,
    sections,
  };
}

function markdownNarrative(value: string): string {
  return value
    .split("\n")
    .map((line) => (
      `> ${line
        .replaceAll("\\", "\\\\")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]")
        .replaceAll("`", "\\`")}`
    ))
    .join("\n");
}

function htmlNarrative(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => (
      `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`
    ))
    .join("");
}

function narrativeOrFallback(
  narrative: TaskMapAgentUnderstandingNarrativeV1,
  section: TaskMapAgentNarrativeSection,
  fallback: string,
): string {
  return narrative.sections[section] ?? fallback;
}

function reportQuizMarkdown(): string[] {
  return [
    "1. Why does `report_ready` mean awaiting human review rather than task completion?",
    "2. Which receipt links the returned artifact bytes to this exact agent session?",
    "3. What should a reviewer verify when a test row says `not_run`?",
    "4. Where do the primary artifact and HTML understanding report live relative to the session directory?",
    "5. What does the Deviations section record, or what uncertainty remains when it has no returned narrative?",
    "6. Which risk in What to watch prevents process exit or artifact prose from proving the outcome?",
  ];
}

async function hasChangeWalkthroughReportShape(
  session: string,
): Promise<boolean> {
  const markdown = (
    await readPrivateBytes(
      path.join(session, "report.md"),
      TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportBytes,
    )
  ).toString("utf8");
  let offset = 0;
  for (const section of TASKMAP_AGENT_UNDERSTANDING_REPORT_SECTIONS) {
    const heading = `## ${section}`;
    const index = markdown.indexOf(heading, offset);
    if (index < offset) return false;
    offset = index + heading.length;
  }
  return true;
}

function reportMarkdown(
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
  artifact: TaskMapAgentArtifactReceiptV1,
  generatedAt: string,
  tests: TaskMapAgentReportTestResultV1[],
  narrative: TaskMapAgentUnderstandingNarrativeV1,
): string {
  const artifactRows = artifact.artifacts
    .map((row) => (
      `- \`${row.relativePath}\` — ${row.bytes} bytes — \`${row.contentDigest}\``
    ))
    .join("\n");
  const testRows = tests.length === 0
    ? "- No explicit test result was recorded."
    : tests.map((row) => `- ${row.status}: ${row.label}`).join("\n");
  const context = narrativeOrFallback(
    narrative,
    "Context",
    "No separate context narrative was returned. The immutable receipt facts below are the bounded context.",
  );
  const intuition = narrativeOrFallback(
    narrative,
    "Intuition",
    "Treat the execution chain as sealed checkpoints: explicit start, process finish, digested artifact delivery, then a generated report. Each checkpoint proves only its own local fact.",
  );
  const whatWasDone = narrativeOrFallback(
    narrative,
    "What was done",
    "The returned artifact did not contain a structured change narrative. Review the digested artifact inventory and recorded tests below.",
  );
  const deviations = narrativeOrFallback(
    narrative,
    "Deviations & judgment calls",
    "No deviation narrative was present in the returned artifact. This is an information gap, not evidence that no deviations occurred.",
  );
  const whatToWatch = narrativeOrFallback(
    narrative,
    "What to watch",
    "The returned artifact and test rows still require human review. A successful process exit, delivered artifact, or confident agent statement cannot establish source completion or outcome success.",
  );
  const privacyNote = narrative.privacyBoundaryExcluded
    ? "- Returned narrative text was excluded because it crossed the privacy-safe report boundary."
    : "- Returned narrative text was included only when it passed the bounded privacy scan and matched the artifact receipt.";
  const narrativeProvenance = narrative.source === "returned_artifact"
    ? "_Returned artifact narrative is informational; immutable receipts remain the authority for delivery state._"
    : "_This is the deterministic receipt-bound fallback; missing narrative is not inferred._";
  return [
    "# Task Map understanding report",
    "",
    narrativeProvenance,
    "",
    "## Context",
    "",
    markdownNarrative(context),
    "",
    `- Task: \`${start.taskId}\``,
    `- Root: \`${start.rootId}\``,
    `- Package: \`${start.packageId}\``,
    `- Workspace binding: \`${start.workspaceBindingDigest}\``,
    `- Session: \`${start.sessionId}\``,
    `- Adapter: \`${start.launchedAdapter}\``,
    `- Started: ${start.startedAt}`,
    `- Finished: ${finish.finishedAt}`,
    `- Process status: ${finish.sessionStatus}`,
    `- Exit: ${finish.exit.kind === "code" ? `code ${finish.exit.code}` : finish.exit.signal}`,
    "",
    "## Intuition",
    "",
    markdownNarrative(intuition),
    "",
    "## What was done",
    "",
    markdownNarrative(whatWasDone),
    "",
    "### Receipt-bound returned artifacts",
    "",
    artifactRows,
    "",
    "### Recorded tests",
    "",
    testRows,
    "",
    "## Deviations & judgment calls",
    "",
    markdownNarrative(deviations),
    "",
    "## What to watch",
    "",
    markdownNarrative(whatToWatch),
    "",
    privacyNote,
    "- Artifact delivery is not source completion or outcome verification.",
    "- No source writeback was attempted.",
    "- The task remains open until an explicit user decision is recorded elsewhere.",
    "",
    "## Quiz",
    "",
    ...reportQuizMarkdown(),
    "",
    `Generated: ${generatedAt}`,
    "",
  ].join("\n");
}

function reportHtml(
  start: TaskMapAgentExecutionStartReceiptV1,
  finish: TaskMapAgentExecutionFinishReceiptV1,
  artifact: TaskMapAgentArtifactReceiptV1,
  generatedAt: string,
  tests: TaskMapAgentReportTestResultV1[],
  narrative: TaskMapAgentUnderstandingNarrativeV1,
): string {
  const artifacts = artifact.artifacts
    .map((row) => (
      `<li><code>${escapeHtml(row.relativePath)}</code> — ${row.bytes} bytes — <code>${row.contentDigest}</code></li>`
    ))
    .join("");
  const testRows = tests.length === 0
    ? "<li>No explicit test result was recorded.</li>"
    : tests.map((row) => (
        `<li>${escapeHtml(row.status)}: ${escapeHtml(row.label)}</li>`
      )).join("");
  const exit = finish.exit.kind === "code"
    ? `code ${finish.exit.code}`
    : finish.exit.signal;
  const context = narrativeOrFallback(
    narrative,
    "Context",
    "No separate context narrative was returned. The immutable receipt facts below are the bounded context.",
  );
  const intuition = narrativeOrFallback(
    narrative,
    "Intuition",
    "Treat the execution chain as sealed checkpoints: explicit start, process finish, digested artifact delivery, then a generated report. Each checkpoint proves only its own local fact.",
  );
  const whatWasDone = narrativeOrFallback(
    narrative,
    "What was done",
    "The returned artifact did not contain a structured change narrative. Review the digested artifact inventory and recorded tests below.",
  );
  const deviations = narrativeOrFallback(
    narrative,
    "Deviations & judgment calls",
    "No deviation narrative was present in the returned artifact. This is an information gap, not evidence that no deviations occurred.",
  );
  const whatToWatch = narrativeOrFallback(
    narrative,
    "What to watch",
    "The returned artifact and test rows still require human review. A successful process exit, delivered artifact, or confident agent statement cannot establish source completion or outcome success.",
  );
  const privacyNote = narrative.privacyBoundaryExcluded
    ? "Returned narrative text was excluded because it crossed the privacy-safe report boundary."
    : "Returned narrative text was included only when it passed the bounded privacy scan and matched the artifact receipt.";
  const narrativeProvenance = narrative.source === "returned_artifact"
    ? "Returned artifact narrative is informational; immutable receipts remain the authority for delivery state."
    : "This is the deterministic receipt-bound fallback; missing narrative is not inferred.";
  const quiz = reportQuizMarkdown()
    .map((question) => `<li>${escapeHtml(question.replace(/^\d+\.\s*/, ""))}</li>`)
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Task Map understanding report</title>",
    "<style>:root{color-scheme:dark}body{max-width:800px;margin:48px auto;padding:0 26px 72px;background:#160708;color:#f4eadc;font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif}code{color:#f3ca72;overflow-wrap:anywhere}h1{font-size:2rem}h1,h2,h3{letter-spacing:-.02em}section{border-top:1px solid #5b2a2d;padding-top:16px;margin-top:30px}.narrative{padding:2px 16px;border-left:3px solid #b45b55;background:#211012}.boundary{color:#d6b9ae}.eyebrow{color:#e3a65e;font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}li{margin:.35rem 0}</style>",
    "</head><body>",
    '<p class="eyebrow">Awaiting human review</p>',
    "<h1>Task Map understanding report</h1>",
    `<p class="boundary">${escapeHtml(narrativeProvenance)}</p>`,
    `<section><h2>Context</h2><div class="narrative">${htmlNarrative(context)}</div><ul>`,
    `<li>Task: <code>${start.taskId}</code></li>`,
    `<li>Root: <code>${start.rootId}</code></li>`,
    `<li>Package: <code>${start.packageId}</code></li>`,
    `<li>Workspace binding: <code>${start.workspaceBindingDigest}</code></li>`,
    `<li>Session: <code>${start.sessionId}</code></li>`,
    `<li>Adapter: <code>${start.launchedAdapter}</code></li>`,
    `<li>Started: ${start.startedAt}</li>`,
    `<li>Finished: ${finish.finishedAt}</li>`,
    `<li>Process status: ${finish.sessionStatus}</li>`,
    `<li>Exit: ${escapeHtml(exit)}</li>`,
    "</ul></section>",
    `<section><h2>Intuition</h2><div class="narrative">${htmlNarrative(intuition)}</div></section>`,
    `<section><h2>What was done</h2><div class="narrative">${htmlNarrative(whatWasDone)}</div><h3>Receipt-bound returned artifacts</h3><ul>${artifacts}</ul><h3>Recorded tests</h3><ul>${testRows}</ul></section>`,
    `<section><h2>Deviations &amp; judgment calls</h2><div class="narrative">${htmlNarrative(deviations)}</div></section>`,
    `<section class="boundary"><h2>What to watch</h2><div class="narrative">${htmlNarrative(whatToWatch)}</div><ul>`,
    `<li>${escapeHtml(privacyNote)}</li>`,
    "<li>Artifact delivery is not source completion or outcome verification.</li>",
    "<li>No source writeback was attempted.</li>",
    "<li>The task remains open until an explicit user decision is recorded elsewhere.</li>",
    "</ul></section>",
    `<section><h2>Quiz</h2><ol>${quiz}</ol></section>`,
    `<p>Generated: ${generatedAt}</p>`,
    "</body></html>",
  ].join("");
}

export async function generateTaskMapAgentSessionReport(
  input: GenerateTaskMapAgentSessionReportInputV1,
): Promise<{
  receipt: TaskMapAgentSessionReportReceiptV1;
  replayed: boolean;
}> {
  assertPlainObject(input, "generate-report input");
  const expectedKeys = input.tests === undefined
    ? ["executionRoot", "sessionId", "generatedAt"]
    : ["executionRoot", "sessionId", "generatedAt", "tests"];
  assertExactKeys(input, expectedKeys, "generate-report input");
  assertUuid(input.sessionId);
  assertTimestamp(input.generatedAt, "generatedAt");
  const tests = validateTests(input.tests ?? []);
  const session = await existingSessionDirectory(
    input.executionRoot,
    input.sessionId,
  );
  if (session === null) fail("session has not started");
  const start = await readStart(session);
  const finish = await readFinish(session, start);
  const artifact = await readArtifactReceipt(session, start, finish);
  if (timestampMs(input.generatedAt) < timestampMs(artifact.recordedAt)) {
    fail("generatedAt precedes artifact delivery");
  }
  const narrative = await returnedArtifactNarrative(session, artifact);
  const markdown = Buffer.from(
    reportMarkdown(
      start,
      finish,
      artifact,
      input.generatedAt,
      tests,
      narrative,
    ),
    "utf8",
  );
  const html = Buffer.from(
    reportHtml(
      start,
      finish,
      artifact,
      input.generatedAt,
      tests,
      narrative,
    ),
    "utf8",
  );
  if (
    markdown.length > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportBytes
    || html.length > TASKMAP_AGENT_EXECUTION_LIMITS_V1.maxReportBytes
    || privacyUnsafeText(markdown.toString("utf8"))
    || privacyUnsafeText(html.toString("utf8"))
  ) {
    fail("generated report violates its privacy or byte boundary");
  }
  const core = {
    contractVersion: TASKMAP_AGENT_SESSION_REPORT_VERSION,
    sessionId: input.sessionId,
    startReceiptDigest: start.startReceiptDigest,
    finishReceiptDigest: finish.finishReceiptDigest,
    artifactReceiptDigest: artifact.artifactReceiptDigest,
    generatedAt: input.generatedAt,
    markdownRelativePath: "report.md" as const,
    markdownDigest: sha256(markdown),
    htmlRelativePath: "report.html" as const,
    htmlDigest: sha256(html),
    tests,
    reportStatus: "report_ready" as const,
    transcriptStored: false as const,
    rawCredentialsStored: false as const,
    rawBiometricsStored: false as const,
    meetingBodiesStored: false as const,
    sourceWritebackAttempted: false as const,
    sourceCompletion: false as const,
    outcomeVerified: false as const,
  };
  const receipt = sealReceipt(
    core,
    REPORT_DOMAIN,
    "reportReceiptDigest",
    "reportReceiptId",
    "tmsessionreport_",
  ) as unknown as TaskMapAgentSessionReportReceiptV1;
  const mdReplay = await writeImmutableBytes(
    path.join(session, "report.md"),
    markdown,
  );
  const htmlReplay = await writeImmutableBytes(
    path.join(session, "report.html"),
    html,
  );
  const receiptReplay = await writeImmutableJson(
    path.join(session, "report-receipt.json"),
    receipt,
  );
  return {
    receipt,
    replayed: mdReplay && htmlReplay && receiptReplay,
  };
}

export async function inspectTaskMapAgentExecution(
  executionRoot: string,
  sessionId: string,
): Promise<TaskMapAgentExecutionInspectionV1> {
  const session = await existingSessionDirectory(executionRoot, sessionId);
  if (session === null) {
    return {
      contractVersion: TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION,
      sessionId,
      progressState: "not_started",
      sessionStatus: "not_started",
      packageId: null,
      packageDigest: null,
      preflightId: null,
      preflightDigest: null,
      corePreflightId: null,
      corePreflightDigest: null,
      runtimeRequestDigest: null,
      startIdempotencyKey: null,
      taskId: null,
      rootId: null,
      workspaceBindingDigest: null,
      launchedAdapter: null,
      startedAt: null,
      finishedAt: null,
      artifactCount: 0,
      artifactReceiptDigest: null,
      reportReceiptDigest: null,
      reportRelativePaths: [],
      sourceWritebackAttempted: false,
      sourceCompletion: false,
      outcomeVerified: false,
    };
  }
  const start = await readStart(session);
  let finish: TaskMapAgentExecutionFinishReceiptV1 | null = null;
  let artifact: TaskMapAgentArtifactReceiptV1 | null = null;
  let report: TaskMapAgentSessionReportReceiptV1 | null = null;
  try {
    finish = await readFinish(session, start);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (finish !== null) {
    try {
      artifact = await readArtifactReceipt(session, start, finish);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  if (finish !== null && artifact !== null) {
    try {
      report = await readReportReceipt(session, start, finish, artifact);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  const progressState = report !== null
    ? "report_ready"
    : artifact !== null
      ? "artifact_delivered"
      : finish === null
        ? "started"
        : finish.sessionStatus === "finished"
          ? "finished_without_artifact"
          : "failed_without_artifact";
  return {
    contractVersion: TASKMAP_AGENT_EXECUTION_INSPECTION_VERSION,
    sessionId,
    progressState,
    sessionStatus: finish?.sessionStatus ?? "running",
    packageId: start.packageId,
    packageDigest: start.packageDigest,
    preflightId: start.adapterPreflightId,
    preflightDigest: start.adapterPreflightDigest,
    corePreflightId: start.corePreflightId,
    corePreflightDigest: start.corePreflightDigest,
    runtimeRequestDigest: start.runtimeRequestDigest,
    startIdempotencyKey: start.startIdempotencyKey,
    taskId: start.taskId,
    rootId: start.rootId,
    workspaceBindingDigest: start.workspaceBindingDigest,
    launchedAdapter: start.launchedAdapter,
    startedAt: start.startedAt,
    finishedAt: finish?.finishedAt ?? null,
    artifactCount: artifact?.artifacts.length ?? 0,
    artifactReceiptDigest: artifact?.artifactReceiptDigest ?? null,
    reportReceiptDigest: report?.reportReceiptDigest ?? null,
    reportRelativePaths: report === null ? [] : ["report.md", "report.html"],
    sourceWritebackAttempted: false,
    sourceCompletion: false,
    outcomeVerified: false,
  };
}

/**
 * Strict, receipt-derived adoption seam for a later Tasks/Task Map UI.
 *
 * The existing inspection.v1 JSON stays unchanged for current clients. This
 * summary adds only openable relative paths and an explicit review state. It
 * cannot infer a terminal task state from process, artifact, or report facts.
 */
export async function summarizeTaskMapAgentExecutionForReview(
  executionRoot: string,
  sessionId: string,
): Promise<TaskMapAgentExecutionReviewSummaryV1> {
  const inspection = await inspectTaskMapAgentExecution(
    executionRoot,
    sessionId,
  );
  let artifact: TaskMapAgentArtifactReceiptV1 | null = null;
  let report: TaskMapAgentSessionReportReceiptV1 | null = null;
  let reportShapeVerified = false;
  if (inspection.artifactCount > 0) {
    const session = await existingSessionDirectory(executionRoot, sessionId);
    if (session === null) fail("receipt-backed session disappeared");
    const start = await readStart(session);
    const finish = await readFinish(session, start);
    artifact = await readArtifactReceipt(session, start, finish);
    if (inspection.progressState === "report_ready") {
      report = await readReportReceipt(session, start, finish, artifact);
      reportShapeVerified = await hasChangeWalkthroughReportShape(session);
    }
  }
  const artifactRelativePaths =
    artifact?.artifacts.map((row) => row.relativePath) ?? [];
  const preferredArtifact = artifactRelativePaths.includes(
    "artifacts/result.md",
  )
    ? "artifacts/result.md"
    : artifactRelativePaths[0] ?? null;
  const awaitingReview = report !== null;
  const core = {
    contractVersion: TASKMAP_AGENT_EXECUTION_REVIEW_SUMMARY_VERSION,
    sessionId,
    progressState: inspection.progressState,
    reviewState: awaitingReview
      ? "awaiting_review" as const
      : "not_ready" as const,
    reportShape: awaitingReview && reportShapeVerified
      ? TASKMAP_AGENT_UNDERSTANDING_REPORT_SHAPE
      : null,
    artifactRelativePaths,
    primaryArtifactRelativePath: preferredArtifact,
    markdownReportRelativePath: awaitingReview
      ? "report.md" as const
      : null,
    htmlReportRelativePath: awaitingReview
      ? "report.html" as const
      : null,
    artifactReceiptDigest:
      artifact?.artifactReceiptDigest ?? null,
    reportReceiptDigest: report?.reportReceiptDigest ?? null,
    terminalStateInferred: false as const,
    sourceWritebackAttempted: false as const,
    sourceCompletion: false as const,
    outcomeVerified: false as const,
  };
  return {
    ...core,
    summaryDigest: taskMapContractDigest({
      domain: REVIEW_SUMMARY_DOMAIN,
      ...core,
    }),
  };
}
