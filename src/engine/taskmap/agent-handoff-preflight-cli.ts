#!/usr/bin/env node

import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { loadConfirmedTaskMapOwnerSync } from "../../identity.js";
import {
  assertTaskMapAgentAdapterHandoffPreflight,
  buildTaskMapAgentWorkspaceBinding,
  inspectTaskMapAdoptedAgentAdapterPreflight,
  TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1,
  type TaskMapAgentAdapterHandoffPreflightV1,
  type TaskMapAgentHandoffAdapterV1,
  type TaskMapAgentWorkspaceBindingV1,
} from "./agent-handoff-preflight.js";
import {
  TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN,
  TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN,
} from "./agent-session-producer-freshness.js";
import { formatTaskMapCliErrorDiagnostic } from "./cli-error-diagnostic.js";
import {
  inspectTaskMapLocalApprovalOperationalContext,
} from "./local-approval-package.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "./source-contracts.js";

export const TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV =
  "TASKMAP_AGENT_HANDOFF_PREFLIGHT_TEST_MODE";

const DIGEST = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40,64}$/;
const ADAPTER_PREFLIGHT_ID = /^tmadapterpreflight_[a-f0-9]{64}$/;
const TASK_ID = /^tmt_[A-Za-z0-9._-]{1,256}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const FILE_MODE = 0o600;
const DIRECTORY_MODE = 0o700;
const execFileAsync = promisify(execFile);

interface PreflightRoots {
  ownerRoot: string;
  taskMapRoot: string;
  expectedCandidateOwnerScopeDigest: string;
}

export interface ParsedTaskMapAgentHandoffPreflightCliArguments
  extends PreflightRoots {
  command: "inspect";
  adapter: TaskMapAgentHandoffAdapterV1;
  packagePath: string;
  workspacePath: string;
}

export interface TaskMapAgentHandoffPreflightCliDependencies {
  environment?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  resolveWorkspaceBinding?: (
    input: ResolveTaskMapAgentWorkspaceBindingInputV1,
  ) => Promise<TaskMapAgentWorkspaceBindingV1>;
}

export interface ResolveTaskMapAgentWorkspaceBindingInputV1 {
  workspacePath: string;
  expectedCandidateOwnerScopeDigest: string;
  routingIdentityKind: "project" | "repository";
}

export interface InspectTaskMapAgentAdapterPreflightFromPathsInputV1
  extends PreflightRoots {
  adapter: TaskMapAgentHandoffAdapterV1;
  packagePath: string;
  workspacePath: string;
}

export interface PreparedTaskMapAgentAdapterPreflightV1 {
  preflight: TaskMapAgentAdapterHandoffPreflightV1;
  artifactPath: string;
}

function fail(message = "Task Map agent handoff preflight CLI input is invalid"): never {
  throw new Error(message);
}

function assertNormalizedAbsolute(value: string, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Buffer.byteLength(value, "utf8") > 4_096
    || CONTROL_CHARACTER.test(value)
    || !path.isAbsolute(value)
    || path.normalize(value) !== value
  ) {
    fail(`${label} is invalid`);
  }
  return value;
}

function parseFlags(args: readonly string[]): Map<string, string> {
  if (args.length === 0 || args.length % 2 !== 0) fail();
  const flags = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (
      key === undefined
      || value === undefined
      || !key.startsWith("--")
      || value.startsWith("--")
      || flags.has(key)
    ) {
      fail();
    }
    flags.set(key, value);
  }
  return flags;
}

function productRoots(
  dependencies: TaskMapAgentHandoffPreflightCliDependencies,
): PreflightRoots {
  const environment = dependencies.environment ?? process.env;
  const homeDirectory = assertNormalizedAbsolute(
    dependencies.homeDirectory ?? homedir(),
    "home directory",
  );
  const confirmed = loadConfirmedTaskMapOwnerSync(homeDirectory, {
    userId: environment.DAOBREW_USER_ID,
    apiUrl: environment.DAOBREW_API_URL,
  });
  if (!confirmed.ok) fail("confirmed Task Map owner is unavailable");
  return {
    ownerRoot: confirmed.owner.ownerRoot,
    taskMapRoot: confirmed.owner.taskMapRoot,
    expectedCandidateOwnerScopeDigest: confirmed.owner.ownerScopeDigest,
  };
}

function rootsFromFlags(
  flags: Map<string, string>,
  dependencies: TaskMapAgentHandoffPreflightCliDependencies,
): PreflightRoots {
  const testOwnerRoot = flags.get("--test-owner-root");
  const ownerScopeDigest = flags.get("--test-owner-scope-digest");
  if (testOwnerRoot === undefined) {
    if (ownerScopeDigest !== undefined) fail();
    return productRoots(dependencies);
  }
  const environment = dependencies.environment ?? process.env;
  if (
    environment[TASKMAP_AGENT_HANDOFF_PREFLIGHT_CLI_TEST_MODE_ENV] !== "1"
    || ownerScopeDigest === undefined
    || !DIGEST.test(ownerScopeDigest)
  ) {
    fail();
  }
  const ownerRoot = assertNormalizedAbsolute(testOwnerRoot, "test owner root");
  flags.delete("--test-owner-root");
  flags.delete("--test-owner-scope-digest");
  return {
    ownerRoot,
    taskMapRoot: path.join(ownerRoot, "taskmap"),
    expectedCandidateOwnerScopeDigest: ownerScopeDigest,
  };
}

export function parseTaskMapAgentHandoffPreflightCliArguments(
  argv: readonly string[],
  dependencies: TaskMapAgentHandoffPreflightCliDependencies = {},
): ParsedTaskMapAgentHandoffPreflightCliArguments {
  const [command, ...rawFlags] = argv;
  if (command !== "inspect") fail();
  const flags = parseFlags(rawFlags);
  const roots = rootsFromFlags(flags, dependencies);
  const adapter = flags.get("--adapter");
  const packagePath = flags.get("--package");
  const workspacePath = flags.get("--workspace");
  const expectedKeys = new Set(["--adapter", "--package", "--workspace"]);
  if (
    flags.size !== expectedKeys.size
    || [...flags.keys()].some((key) => !expectedKeys.has(key))
    || (adapter !== "codex" && adapter !== "claude_code")
    || packagePath === undefined
    || workspacePath === undefined
  ) {
    fail();
  }
  return {
    command,
    ...roots,
    adapter,
    packagePath: assertNormalizedAbsolute(packagePath, "package path"),
    workspacePath: assertNormalizedAbsolute(workspacePath, "workspace path"),
  };
}

function expectedUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

async function assertOwnerControlledRegularFile(
  filePath: string,
  label: string,
): Promise<void> {
  const stat = await lstat(filePath);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || (expectedUid() !== undefined && stat.uid !== expectedUid())
    || (stat.mode & 0o077) !== 0
    || await realpath(filePath) !== filePath
  ) {
    fail(`${label} is unsafe`);
  }
}

async function assertOwnerControlledDirectory(
  directoryPath: string,
  label: string,
): Promise<void> {
  const stat = await lstat(directoryPath);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || (expectedUid() !== undefined && stat.uid !== expectedUid())
    || await realpath(directoryPath) !== directoryPath
  ) {
    fail(`${label} is unsafe`);
  }
}

async function gitOutput(
  workspacePath: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync(
    "git",
    ["-C", workspacePath, ...args],
    {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1_024,
      windowsHide: true,
    },
  );
  const output = result.stdout.trim();
  if (output.length === 0 || CONTROL_CHARACTER.test(output)) {
    fail("Git workspace output is invalid");
  }
  return output;
}

export async function resolveTaskMapAgentWorkspaceBinding(
  input: ResolveTaskMapAgentWorkspaceBindingInputV1,
): Promise<TaskMapAgentWorkspaceBindingV1> {
  const workspacePath = assertNormalizedAbsolute(
    input.workspacePath,
    "workspace path",
  );
  if (
    !DIGEST.test(input.expectedCandidateOwnerScopeDigest)
    || (
      input.routingIdentityKind !== "project"
      && input.routingIdentityKind !== "repository"
    )
  ) {
    fail("candidate owner scope digest is invalid");
  }
  await assertOwnerControlledDirectory(workspacePath, "workspace directory");
  const repositoryRoot = path.normalize(await gitOutput(
    workspacePath,
    ["rev-parse", "--show-toplevel"],
  ));
  const relativeToRepository = path.relative(repositoryRoot, workspacePath);
  const workspaceInsideRepository = (
    relativeToRepository === ""
    || (
      relativeToRepository !== ".."
      && !relativeToRepository.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativeToRepository)
    )
  );
  if (
    !workspaceInsideRepository
    || (
      input.routingIdentityKind === "repository"
      && repositoryRoot !== workspacePath
    )
  ) {
    fail("selected workspace must be the Git repository root");
  }
  const head = await gitOutput(
    repositoryRoot,
    ["rev-parse", "--verify", "HEAD^{commit}"],
  );
  if (!GIT_COMMIT.test(head)) fail("Git workspace HEAD is invalid");
  const routingDomain = input.routingIdentityKind === "project"
    ? TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_PROJECT_ROUTING_DOMAIN
    : TASKMAP_AGENT_SESSION_PROVIDER_NEUTRAL_REPOSITORY_ROUTING_DOMAIN;
  const routingPath = input.routingIdentityKind === "project"
    ? workspacePath : repositoryRoot;
  const repositoryIdentityDigest = taskMapContractDigest({
    domain: routingDomain,
    ownerScopeDigest: input.expectedCandidateOwnerScopeDigest,
    nativeIdentity: routingPath.normalize("NFKC"),
  });
  return buildTaskMapAgentWorkspaceBinding({
    projectId: `tmproject_${taskMapContractDigest({
      domain: "taskmap-agent-selected-project.1",
      repositoryIdentityDigest,
    })}`,
    repositoryIdentityDigest,
    workspaceRevisionDigest: taskMapContractDigest({
      domain: "taskmap-agent-git-workspace-revision.1",
      repositoryIdentityDigest,
      head,
    }),
  });
}

function assertInspectInput(
  input: InspectTaskMapAgentAdapterPreflightFromPathsInputV1,
): void {
  if (
    (input.adapter !== "codex" && input.adapter !== "claude_code")
    || !DIGEST.test(input.expectedCandidateOwnerScopeDigest)
  ) {
    fail();
  }
  assertNormalizedAbsolute(input.ownerRoot, "owner root");
  assertNormalizedAbsolute(input.taskMapRoot, "task map root");
  assertNormalizedAbsolute(input.packagePath, "package path");
  assertNormalizedAbsolute(input.workspacePath, "workspace path");
  if (input.taskMapRoot !== path.join(input.ownerRoot, "taskmap")) fail();
}

async function selectedPackageTaskId(packagePath: string): Promise<string> {
  await assertOwnerControlledRegularFile(packagePath, "package artifact");
  const handle = await open(packagePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (stat.size <= 0 || stat.size > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes) {
      fail("selected package is invalid");
    }
    const bytes = await handle.readFile();
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("selected package is invalid");
    }
    if (taskMapContractCanonicalJson(parsed) !== bytes.toString("utf8")
      || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("selected package is invalid");
    }
    const candidate = parsed as Record<string, unknown>;
    const task = candidate.task;
    if (candidate.contractVersion !== "taskmap-local-execution-package.v1"
      || task === null || typeof task !== "object" || Array.isArray(task)
      || !TASK_ID.test((task as Record<string, unknown>).taskId as string)) {
      fail("selected package is invalid");
    }
    return (task as Record<string, unknown>).taskId as string;
  } finally {
    await handle.close();
  }
}

export async function inspectTaskMapAgentAdapterHandoffPreflightFromPaths(
  input: InspectTaskMapAgentAdapterPreflightFromPathsInputV1,
  dependencies: Pick<
    TaskMapAgentHandoffPreflightCliDependencies,
    "resolveWorkspaceBinding"
  > = {},
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  assertInspectInput(input);
  const taskId = await selectedPackageTaskId(input.packagePath);
  const local = await inspectTaskMapLocalApprovalOperationalContext({
    ownerRoot: input.ownerRoot,
    taskMapRoot: input.taskMapRoot,
    taskId,
  });
  if (
    local.response.status !== "package_ready"
    || local.response.artifactAccess === null
    || local.response.artifactAccess.packagePath !== input.packagePath
    || path.dirname(input.packagePath)
      !== local.response.artifactAccess.revealDirectoryPath
    || local.agentSessionEpisode === null
  ) {
    fail("selected package is not the current prepared package");
  }
  await assertOwnerControlledRegularFile(input.packagePath, "package artifact");
  const workspaceBinding = await (
    dependencies.resolveWorkspaceBinding ?? resolveTaskMapAgentWorkspaceBinding
  )({
    workspacePath: input.workspacePath,
    expectedCandidateOwnerScopeDigest:
      input.expectedCandidateOwnerScopeDigest,
    routingIdentityKind: local.agentSessionEpisode.routingIdentityKind,
  });
  return inspectTaskMapAdoptedAgentAdapterPreflight({
    adapter: input.adapter,
    ownerRoot: input.ownerRoot,
    taskMapRoot: input.taskMapRoot,
    expectedCandidateOwnerScopeDigest:
      input.expectedCandidateOwnerScopeDigest,
    taskId,
    workspaceBinding,
  });
}

export function taskMapAgentAdapterPreflightArtifactPath(
  packagePath: string,
  adapterPreflightId: string,
): string {
  assertNormalizedAbsolute(packagePath, "package path");
  if (!ADAPTER_PREFLIGHT_ID.test(adapterPreflightId)) fail();
  return path.join(
    path.dirname(packagePath),
    `adapter-preflight_${adapterPreflightId}.json`,
  );
}

async function readPrivateCanonicalArtifact(
  artifactPath: string,
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      artifactPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const stat = await handle.stat();
    if (
      !stat.isFile()
      || (expectedUid() !== undefined && stat.uid !== expectedUid())
      || (stat.mode & 0o777) !== FILE_MODE
      || stat.size <= 0
      || stat.size > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes
    ) {
      fail("adapter preflight artifact is unsafe");
    }
    const bytes = await handle.readFile();
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("adapter preflight artifact is invalid");
    }
    assertTaskMapAgentAdapterHandoffPreflight(parsed);
    if (taskMapContractCanonicalJson(parsed) !== bytes.toString("utf8")) {
      fail("adapter preflight artifact is not canonical");
    }
    return parsed;
  } finally {
    await handle?.close();
  }
}

export async function readTaskMapAgentAdapterHandoffPreflightArtifact(
  packagePath: string,
  adapterPreflightId: string,
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  const artifactPath = taskMapAgentAdapterPreflightArtifactPath(
    packagePath,
    adapterPreflightId,
  );
  return readPrivateCanonicalArtifact(artifactPath);
}

async function persistImmutableAdapterPreflight(
  packagePath: string,
  preflight: TaskMapAgentAdapterHandoffPreflightV1,
): Promise<string> {
  assertTaskMapAgentAdapterHandoffPreflight(preflight);
  const artifactPath = taskMapAgentAdapterPreflightArtifactPath(
    packagePath,
    preflight.adapterPreflightId,
  );
  const directoryPath = path.dirname(artifactPath);
  await assertOwnerControlledDirectory(directoryPath, "package directory");
  const directoryStat = await lstat(directoryPath);
  if ((directoryStat.mode & 0o777) !== DIRECTORY_MODE) {
    fail("package directory permissions are unsafe");
  }
  const bytes = Buffer.from(taskMapContractCanonicalJson(preflight), "utf8");
  if (
    bytes.byteLength <= 0
    || bytes.byteLength
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxArtifactBytes
  ) {
    fail("adapter preflight artifact exceeds its byte bound");
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(
      artifactPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      FILE_MODE,
    );
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await handle?.close();
  }
  const readback = await readPrivateCanonicalArtifact(artifactPath);
  if (taskMapContractCanonicalJson(readback) !== bytes.toString("utf8")) {
    fail("immutable adapter preflight artifact conflicts with existing bytes");
  }
  return artifactPath;
}

export async function prepareTaskMapAgentAdapterHandoffPreflight(
  input: InspectTaskMapAgentAdapterPreflightFromPathsInputV1,
  dependencies: Pick<
    TaskMapAgentHandoffPreflightCliDependencies,
    "resolveWorkspaceBinding"
  > = {},
): Promise<PreparedTaskMapAgentAdapterPreflightV1> {
  const preflight = await inspectTaskMapAgentAdapterHandoffPreflightFromPaths(
    input,
    dependencies,
  );
  const artifactPath = await persistImmutableAdapterPreflight(
    input.packagePath,
    preflight,
  );
  return { preflight, artifactPath };
}

export async function runTaskMapAgentHandoffPreflightCli(
  argv: readonly string[],
  dependencies: TaskMapAgentHandoffPreflightCliDependencies = {},
): Promise<TaskMapAgentAdapterHandoffPreflightV1> {
  const parsed = parseTaskMapAgentHandoffPreflightCliArguments(
    argv,
    dependencies,
  );
  const prepared = await prepareTaskMapAgentAdapterHandoffPreflight(
    parsed,
    dependencies,
  );
  return prepared.preflight;
}

export function taskMapAgentHandoffPreflightCliOutput(
  preflight: TaskMapAgentAdapterHandoffPreflightV1,
): string {
  assertTaskMapAgentAdapterHandoffPreflight(preflight);
  const output = `${taskMapContractCanonicalJson(preflight)}\n`;
  if (
    Buffer.byteLength(output, "utf8")
      > TASKMAP_AGENT_HANDOFF_PREFLIGHT_LIMITS_V1.maxSummaryBytes
  ) {
    fail("adapter preflight CLI output exceeded its byte bound");
  }
  return output;
}

async function main(): Promise<void> {
  try {
    const result = await runTaskMapAgentHandoffPreflightCli(
      process.argv.slice(2),
    );
    process.stdout.write(taskMapAgentHandoffPreflightCliOutput(result));
  } catch (error) {
    process.stderr.write(
      `taskmap-agent-handoff-preflight: unavailable\n${formatTaskMapCliErrorDiagnostic(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
