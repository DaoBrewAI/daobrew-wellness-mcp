import * as assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN,
  TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES,
  parseTaskMapNativeCandidateReviewCommand,
  taskMapNativeCandidateShelfOutput,
  taskMapNativeCandidateReviewOverlayPath,
} from "../src/engine/taskmap/native-candidate-review-cli.js";
import {
  buildTaskMapAgentSessionProducerSnapshot,
  type TaskMapAgentSessionObservationV1,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import { refreshAgentSessionExtractionFixture } from
  "./taskmap-agent-session-extraction-fixture.js";
import { refreshCalendarExtractionFixture } from
  "./taskmap-calendar-extraction-fixture.js";
import {
  TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
  buildTaskMapLocalCalendarExport,
  loadTaskMapCalendarProducerResult,
  taskMapCalendarFieldDigest,
  taskMapLocalCalendarExportCanonicalJson,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
import {
  buildTaskMapMeetingProducerSnapshot,
  type TaskMapMeetingProducerEvidenceDraftV1,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import { createTaskMapOwnerScope } from "../src/engine/taskmap/owner-scope.js";
import {
  testOwnerScopeDigest as taskMapMeetingProducerOwnerScopeDigest,
} from "./support/confirmed-owner.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";
import type {
  TaskMapSourceAuthorityBindingV1,
} from "../src/engine/taskmap/types.js";

const ACTION_TITLE = "PRIVATE_CLI_ACTION_TITLE_SENTINEL";
const ACTION_SUMMARY = "PRIVATE_CLI_ACTION_SUMMARY_SENTINEL";
const DECISION_TITLE = "PRIVATE_CLI_DECISION_TITLE_SENTINEL";
const DOCUMENT_ID = "PRIVATE_CLI_DOCUMENT_ID_SENTINEL";
const SOURCE_REVISION = "PRIVATE_CLI_SOURCE_REVISION_SENTINEL";
const SOURCE_REFERENCE = "PRIVATE_CLI_SOURCE_REFERENCE_SENTINEL";
const SECOND_ACTION_TITLE = "PRIVATE_CLI_SECOND_ACTION_TITLE_SENTINEL";
const SECOND_ACTION_SUMMARY = "PRIVATE_CLI_SECOND_ACTION_SUMMARY_SENTINEL";
const tempRoots: string[] = [];
const configuredOwners = new Map<string, string>();
const activeChildren = new Set<ReturnType<typeof spawn>>();

afterEach(() => {
  for (const child of activeChildren) {
    child.kill("SIGKILL");
  }
  activeChildren.clear();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function binding(): TaskMapSourceAuthorityBindingV1 {
  return {
    connectionId: "candidate-cli-gemini-owner",
    sourceKind: "gemini_meet",
    tenantOrWorkspaceDigest: digest("candidate-cli-workspace"),
    accountOrPrincipalDigest: digest("candidate-cli-principal"),
    grantVersion: "grant-1",
  };
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function canonicalTestUserId(label: string): string {
  const hex = createHash("sha256").update(label).digest("hex").toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function makeHome(configuredOwner: string | null = "owner-config"): string {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), "taskmap-candidate-cli-")),
  );
  tempRoots.push(root);
  const stateRoot = path.join(root, ".daobrew");
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  chmodSync(stateRoot, 0o700);
  writeFileSync(
    path.join(stateRoot, "config.json"),
    JSON.stringify(
      configuredOwner === null
        ? {}
        : {
          user_id: canonicalTestUserId(configuredOwner),
          device_credential:
            `dbd_test_enrollment_${digest(configuredOwner)}`,
          device_credential_confirmed: true,
          api_url: "https://candidate-review.test.invalid/api/v1",
        },
    ),
    { mode: 0o600 },
  );
  if (configuredOwner !== null) {
    configuredOwners.set(root, configuredOwner);
    const scope = createTaskMapOwnerScope(
      canonicalTestUserId(configuredOwner),
      root,
    );
    mkdirSync(scope.sourceRoot, { recursive: true, mode: 0o700 });
    mkdirSync(scope.taskMapRoot, { recursive: true, mode: 0o700 });
    chmodSync(scope.sourceRoot, 0o700);
    chmodSync(scope.taskMapRoot, 0o700);
  }
  return root;
}

function ownerScopeForHome(home: string) {
  const owner = configuredOwners.get(home);
  if (owner === undefined) throw new Error("test owner is unavailable");
  return createTaskMapOwnerScope(canonicalTestUserId(owner), home);
}

function overlayPathForHome(home: string): string {
  return taskMapNativeCandidateReviewOverlayPath(
    ownerScopeForHome(home).taskMapRoot,
  );
}

function actionEvidence(
  producedAtMs: number,
  overrides: Partial<TaskMapMeetingProducerEvidenceDraftV1> = {},
): TaskMapMeetingProducerEvidenceDraftV1 {
  return {
    kind: "action_item",
    title: ACTION_TITLE,
    summary: ACTION_SUMMARY,
    occurredAt: iso(producedAtMs - 180_000),
    observedAt: iso(producedAtMs - 60_000),
    status: "open",
    deadline: iso(producedAtMs + 86_400_000),
    quality: "structured_generated",
    coverage: "partial",
    confidence: 0.85,
    objectRefs: [{
      kind: "external_reference",
      referenceDigest: digest(SOURCE_REFERENCE),
    }],
    ...overrides,
  };
}

function writeProducerSnapshot(input: {
  home: string;
  owner: string;
  producedAtMs?: number;
  revision?: string;
  actionOverrides?: Partial<TaskMapMeetingProducerEvidenceDraftV1>;
  includeDecision?: boolean;
  includeSecondCandidate?: boolean;
}): void {
  const producedAtMs = input.producedAtMs ?? Date.now() - 30_000;
  const revision = input.revision ?? SOURCE_REVISION;
  const evidence: TaskMapMeetingProducerEvidenceDraftV1[] = [
    actionEvidence(producedAtMs, input.actionOverrides),
  ];
  if (input.includeSecondCandidate === true) {
    evidence.push(actionEvidence(producedAtMs, {
      kind: "commitment",
      title: SECOND_ACTION_TITLE,
      summary: SECOND_ACTION_SUMMARY,
      occurredAt: iso(producedAtMs - 240_000),
      observedAt: iso(producedAtMs - 45_000),
      status: "in_progress",
      quality: "source_native",
      coverage: "complete",
      confidence: 1,
      objectRefs: [{
        kind: "external_reference",
        referenceDigest: digest(`${SOURCE_REFERENCE}:second`),
      }],
    }));
  }
  if (input.includeDecision !== false) {
    evidence.push({
      kind: "decision",
      title: DECISION_TITLE,
      summary: "PRIVATE_CLI_DECISION_SUMMARY_SENTINEL",
      occurredAt: iso(producedAtMs - 180_000),
      observedAt: iso(producedAtMs - 60_000),
      quality: "structured_generated",
      coverage: "complete",
      confidence: 0.9,
    });
  }
  const snapshot = buildTaskMapMeetingProducerSnapshot({
    ownerScopeDigest:
      taskMapMeetingProducerOwnerScopeDigest(input.owner),
    producedAt: iso(producedAtMs),
    meetings: [{
      binding: binding(),
      documentId: DOCUMENT_ID,
      revisionId: revision,
      contentDigest: digest(`content:${revision}`),
      modifiedAt: iso(producedAtMs - 90_000),
      eventTime: iso(producedAtMs - 180_000),
      observedAt: iso(producedAtMs - 60_000),
      evidence,
    }],
  });
  const snapshotPath = path.join(
    ownerScopeForHome(input.home).sourceRoot,
    "meeting-producer-snapshot.v1.json",
  );
  writeFileSync(
    snapshotPath,
    taskMapContractCanonicalJson(snapshot),
    { mode: 0o600 },
  );
  chmodSync(snapshotPath, 0o600);
}

function agentSnapshotPathForHome(home: string): string {
  return path.join(
    ownerScopeForHome(home).sourceRoot,
    "agent-session-producer-snapshot.v1.json",
  );
}

function agentObservation(producedAtMs: number): TaskMapAgentSessionObservationV1 {
  const rows = [
    {
      timestamp: iso(producedAtMs - 240_000),
      type: "session_meta",
      payload: { id: "candidate-cli-codex-session" },
    },
    {
      timestamp: iso(producedAtMs - 210_000),
      type: "turn_context",
      payload: {
        cwd: "/Users/reviewer/DaobrewAI",
        workspace_roots: ["/Users/reviewer/DaobrewAI"],
      },
    },
    {
      timestamp: iso(producedAtMs - 180_000),
      type: "response_item",
      payload: {
        id: "candidate-cli-codex-turn",
        type: "message",
        role: "user",
        content: [{
          type: "input_text",
          text: "Implement deterministic work candidate review",
        }],
      },
    },
    {
      timestamp: iso(producedAtMs - 120_000),
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "Prepared the bounded review implementation.",
        }],
      },
    },
  ];
  return {
    provider: "codex",
    rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  };
}

async function writeAgentSnapshot(input: {
  home: string;
  owner: string;
  producedAtMs?: number;
}): Promise<void> {
  const producedAtMs = input.producedAtMs ?? Date.now() - 30_000;
  const snapshot = buildTaskMapAgentSessionProducerSnapshot({
    ownerScopeDigest:
      taskMapMeetingProducerOwnerScopeDigest(input.owner),
    producedAt: iso(producedAtMs),
    observations: [agentObservation(producedAtMs)],
  });
  const snapshotPath = agentSnapshotPathForHome(input.home);
  writeFileSync(
    snapshotPath,
    taskMapContractCanonicalJson(snapshot),
    { mode: 0o600 },
  );
  chmodSync(snapshotPath, 0o600);
  const scope = ownerScopeForHome(input.home);
  mkdirSync(scope.runtimeRoot, { recursive: true, mode: 0o700 });
  chmodSync(scope.runtimeRoot, 0o700);
  await refreshAgentSessionExtractionFixture({
    admission: buildTaskMapAgentSessionSemanticAdmission(snapshot),
    taskMapRoot: scope.taskMapRoot,
    runtimeRoot: scope.runtimeRoot,
    promptTemplatePath: path.resolve(
      __dirname,
      "../../prompts/agent-session-extraction-v1.md",
    ),
    assessedAt: iso(Date.now()),
  });
}

async function writeCalendarSnapshot(input: {
  home: string;
  owner: string;
}): Promise<void> {
  const scope = ownerScopeForHome(input.home);
  const producedAt = iso(Date.now() - 30_000);
  const startAt = iso(Date.now() + 3_600_000);
  const endAt = iso(Date.now() + 5_400_000);
  const eventIdentityDigest = digest(`calendar-event:${input.owner}`);
  const title = "Review the calendar launch";
  const local = buildTaskMapLocalCalendarExport({
    ownerScopeDigest: scope.ownerScopeDigest,
    producedAt,
    events: [{
      eventIdentityDigest,
      crossProviderIdentityDigest: null,
      revisionDigest: taskMapCalendarFieldDigest(
        TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
        [eventIdentityDigest, title, startAt, endAt],
      ),
      title,
      startAt,
      endAt,
    }],
  });
  const localExportPath = path.join(scope.sourceRoot, "calendar-export.json");
  writeFileSync(
    localExportPath,
    taskMapLocalCalendarExportCanonicalJson(local),
    { mode: 0o600 },
  );
  const assessedAt = iso(Date.now());
  const result = await loadTaskMapCalendarProducerResult({
    localExportPath,
    googleSnapshotPath: path.join(
      scope.sourceRoot,
      "calendar-google-provider-snapshot.v1.json",
    ),
    assessedAt,
    expectedOwnerScopeDigest: scope.ownerScopeDigest,
  });
  mkdirSync(scope.runtimeRoot, { recursive: true, mode: 0o700 });
  chmodSync(scope.runtimeRoot, 0o700);
  await refreshCalendarExtractionFixture({
    result,
    taskMapRoot: scope.taskMapRoot,
    runtimeRoot: scope.runtimeRoot,
    promptTemplatePath: path.resolve(
      __dirname,
      "../../prompts/calendar-extraction-v1.md",
    ),
    assessedAt,
  });
}

type CliResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function startCli(
  home: string,
  argv: readonly string[],
  environmentOwner = "",
): {
  child: ReturnType<typeof spawn>;
  started: Promise<void>;
  result: Promise<CliResult>;
} {
  const executable = path.resolve(
    __dirname,
    "../src/engine/taskmap/native-candidate-review-cli.js",
  );
  const child = spawn(process.execPath, [executable, ...argv], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      DAOBREW_CONFIG_FILE: path.join(home, ".daobrew", "config.json"),
      DAOBREW_USER_ID: environmentOwner,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeChildren.add(child);
  const started = new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  const result = new Promise<CliResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      activeChildren.delete(child);
      resolve({ status, stdout, stderr });
    });
  });
  return { child, started, result };
}

function invokeCli(
  home: string,
  argv: readonly string[],
  environmentOwner = "",
): Promise<CliResult> {
  return startCli(home, argv, environmentOwner).result;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function holdCandidateReviewLock(
  home: string,
  owner: string,
): Promise<ReturnType<typeof spawn>> {
  const modulePath = path.resolve(
    __dirname,
    "../src/engine/taskmap/native-candidate-review.js",
  );
  const overlayPath = overlayPathForHome(home);
  const ownerScopeDigest = taskMapMeetingProducerOwnerScopeDigest(owner);
  const script = `
    const review = require(process.env.TEST_REVIEW_MODULE);
    review.withTaskMapNativeCandidateReviewTransaction({
      overlayPath: process.env.TEST_OVERLAY_PATH,
      expectedOwnerScopeDigest: process.env.TEST_OWNER_SCOPE_DIGEST,
    }, async () => {
      if (process.send) process.send("locked");
      await new Promise(() => {
        setInterval(() => {}, 1_000);
      });
    }).catch((error) => {
      if (process.send) process.send({ error: String(error) });
      process.exitCode = 1;
    });
  `;
  const child = spawn(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TEST_REVIEW_MODULE: modulePath,
      TEST_OVERLAY_PATH: overlayPath,
      TEST_OWNER_SCOPE_DIGEST: ownerScopeDigest,
    },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  activeChildren.add(child);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("lock holder did not acquire the lock")),
      5_000,
    );
    child.once("message", (message) => {
      clearTimeout(timeout);
      if (message === "locked") {
        resolve();
      } else {
        reject(new Error(`lock holder failed: ${JSON.stringify(message)}`));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (status) => {
      clearTimeout(timeout);
      reject(new Error(`lock holder exited early: ${status}`));
    });
  });
  return child;
}

async function killAndWait(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  child.kill("SIGKILL");
  await closed;
  activeChildren.delete(child);
}

function parseShelf(stdout: string): {
  contractVersion: string;
  ownerScopeDigest: string;
  assessedAt: string;
  hierarchy: {
    groupingState: "available" | "unavailable";
    hierarchyDigest: string;
    authority: string;
    acceptedWork: boolean;
    rankEligible: boolean;
    topics: Array<{
      topicId: string;
      title: string;
      titleSource: string;
      candidateIds: string[];
    }>;
    ungroupedCandidateIds: string[];
  };
  candidates: Array<{
    candidateId: string;
    candidateRevisionDigest: string;
    title: string;
    summary: string;
    candidateFamily?: string;
    sourceKinds: string[];
    reviewState: string;
    reviewedOnly: boolean;
    acceptedWork: boolean;
    rankEligible: boolean;
    routeEligible: boolean;
    proveEligible: boolean;
    runEligible: boolean;
    sourceWritebackEligible?: boolean;
  }>;
} {
  return JSON.parse(stdout) as ReturnType<typeof parseShelf>;
}

function assertCoarseFailure(
  result: { status: number | null; stdout: string; stderr: string },
  unreflectedValues: readonly string[],
): void {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /^taskmap-native-candidate-review: unavailable\n(?:Error|TypeError): /,
  );
  assert.match(result.stderr, /\n {4}at /);
  for (const value of unreflectedValues) {
    assert.equal(result.stderr.includes(value), false, value);
  }
}

describe("Task Map native candidate review CLI", () => {
  it("parses only the two closed command forms", () => {
    const candidateId = `tmnativecandidate_${"a".repeat(64)}`;
    const revision = "b".repeat(64);
    assert.deepEqual(
      parseTaskMapNativeCandidateReviewCommand(["--list"]),
      { kind: "list" },
    );
    assert.deepEqual(
      parseTaskMapNativeCandidateReviewCommand([
        "--review",
        candidateId,
        "--revision",
        revision,
        "--action",
        "dismiss",
      ]),
      {
        kind: "review",
        candidateId,
        candidateRevisionDigest: revision,
        action: "dismiss",
      },
    );
    for (const invalid of [
      [],
      ["--list", "--review"],
      ["--review", candidateId, "--revision", revision, "--action", "defer"],
      ["--review", candidateId, "--action", "dismiss", "--revision", revision],
      ["--review", "private-candidate", "--revision", revision, "--action", "dismiss"],
      ["--review", candidateId, "--revision", revision.toUpperCase(), "--action", "dismiss"],
    ]) {
      assert.throws(
        () => parseTaskMapNativeCandidateReviewCommand(invalid),
        (error: unknown) =>
          error instanceof TypeError
          && /native-candidate-review-cli --list/.test(error.message)
          && !error.message.includes("private-candidate"),
      );
    }
  });

  it("lists candidate-only evidence from config owner state and persists no display data", async () => {
    const home = makeHome("owner-config");
    writeProducerSnapshot({ home, owner: "owner-config" });

    const result = await invokeCli(home, ["--list"]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.ok(
      Buffer.byteLength(result.stdout, "utf8")
        <= TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_MAX_OUTPUT_BYTES + 1,
    );
    const shelf = parseShelf(result.stdout);
    assert.equal(shelf.contractVersion, "taskmap-native-candidate-shelf.v3");
    assert.equal(shelf.candidates.length, 1);
    assert.equal(shelf.candidates[0].candidateFamily, "meeting");
    assert.equal(shelf.candidates[0].title, ACTION_TITLE);
    assert.equal(shelf.candidates[0].summary, ACTION_SUMMARY);
    assert.equal(result.stdout.includes(DECISION_TITLE), false);
    assert.equal(shelf.candidates[0].acceptedWork, false);
    assert.equal(shelf.candidates[0].rankEligible, false);
    assert.equal(shelf.candidates[0].routeEligible, false);
    assert.equal(shelf.candidates[0].proveEligible, false);
    assert.equal(shelf.candidates[0].runEligible, false);

    const overlayPath = overlayPathForHome(home);
    assert.equal(
      overlayPath,
      path.join(
        ownerScopeForHome(home).taskMapRoot,
        "native-candidate-review.v1.json",
      ),
    );
    assert.equal(statSync(path.dirname(overlayPath)).mode & 0o777, 0o700);
    assert.equal(statSync(overlayPath).mode & 0o777, 0o600);
    const persisted = readFileSync(overlayPath, "utf8");
    for (const sentinel of [
      ACTION_TITLE,
      ACTION_SUMMARY,
      DECISION_TITLE,
      DOCUMENT_ID,
      SOURCE_REVISION,
      SOURCE_REFERENCE,
      "owner-config",
      "gemini_meet",
    ]) {
      assert.equal(persisted.includes(sentinel), false, sentinel);
    }
    assert.equal(persisted.includes('"displayTextStored":false'), true);
    assert.equal(persisted.includes('"acceptedWorkStored":false'), true);
  });

  it("keeps deterministic community topics when live semantic grouping proof is unavailable", async () => {
    const home = makeHome("owner-v2-list");
    writeProducerSnapshot({ home, owner: "owner-v2-list" });
    await writeAgentSnapshot({ home, owner: "owner-v2-list" });
    await writeCalendarSnapshot({ home, owner: "owner-v2-list" });

    const first = await invokeCli(home, ["--list"]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stderr, "");
    const firstShelf = parseShelf(first.stdout);
    assert.equal(firstShelf.contractVersion, "taskmap-native-candidate-shelf.v3");
    assert.equal(first.stdout, `${taskMapContractCanonicalJson(firstShelf)}\n`);
    assert.equal((first.stdout.match(/\n/g) ?? []).length, 1);
    assert.deepEqual(
      firstShelf.candidates.map((row) => row.candidateFamily).sort(),
      ["agent_session", "calendar", "meeting"],
    );
    assert.equal(firstShelf.hierarchy.groupingState, "available");
    assert.equal(firstShelf.hierarchy.authority, "none");
    assert.equal(firstShelf.hierarchy.acceptedWork, false);
    assert.equal(firstShelf.hierarchy.rankEligible, false);
    assert.ok(firstShelf.hierarchy.topics.length > 0);
    assert.deepEqual(firstShelf.hierarchy.ungroupedCandidateIds, []);
    assert.deepEqual(
      firstShelf.hierarchy.topics
        .flatMap((topic) => topic.candidateIds)
        .sort(),
      firstShelf.candidates.map((row) => row.candidateId).sort(),
    );
    assert.ok(firstShelf.hierarchy.topics.every((topic) =>
      topic.title.trim().length > 0
      && (
        topic.titleSource === "llm_community_title_v1"
        || topic.titleSource === "deterministic_fallback"
      )
    ));
    const agent = firstShelf.candidates.find(
      (row) => row.candidateFamily === "agent_session",
    );
    assert.ok(agent);
    assert.deepEqual(agent.sourceKinds, ["codex_session"]);
    assert.equal(agent.sourceWritebackEligible, false);
    assert.equal(agent.acceptedWork, false);
    assert.equal(agent.rankEligible, false);
    assert.equal(agent.routeEligible, false);
    assert.equal(agent.proveEligible, false);
    assert.equal(agent.runEligible, false);
    const calendar = firstShelf.candidates.find(
      (row) => row.candidateFamily === "calendar",
    );
    assert.ok(calendar);
    assert.deepEqual(calendar.sourceKinds, ["calendar"]);
    assert.equal(calendar.sourceWritebackEligible, false);

    const replay = await invokeCli(home, ["--list"]);
    assert.equal(replay.status, 0);
    assert.equal(replay.stderr, "");
    assert.deepEqual(
      parseShelf(replay.stdout).candidates,
      firstShelf.candidates,
    );
    assert.deepEqual(
      parseShelf(replay.stdout).hierarchy,
      firstShelf.hierarchy,
    );
  });

  it("reviews an agent candidate through the shared overlay without mutating source evidence", async () => {
    const owner = "owner-v2-agent-review";
    const home = makeHome(owner);
    writeProducerSnapshot({ home, owner });
    await writeAgentSnapshot({ home, owner });
    const sourcePath = agentSnapshotPathForHome(home);
    const sourceBefore = readFileSync(sourcePath, "utf8");
    const listed = parseShelf((await invokeCli(home, ["--list"])).stdout);
    const agent = listed.candidates.find(
      (row) => row.candidateFamily === "agent_session",
    );
    assert.ok(agent);

    const reviewed = await invokeCli(home, [
      "--review",
      agent.candidateId,
      "--revision",
      agent.candidateRevisionDigest,
      "--action",
      "accept_for_review",
    ]);
    assert.equal(reviewed.status, 0);
    assert.equal(reviewed.stderr, "");
    const reviewedShelf = parseShelf(reviewed.stdout);
    const reviewedAgent = reviewedShelf.candidates.find(
      (row) => row.candidateFamily === "agent_session",
    );
    assert.ok(reviewedAgent);
    assert.equal(reviewedAgent.reviewState, "accept_for_review");
    assert.equal(reviewedAgent.reviewedOnly, true);
    assert.equal(reviewedAgent.acceptedWork, false);
    assert.equal(reviewedAgent.sourceWritebackEligible, false);
    assert.equal(reviewedAgent.runEligible, false);
    assert.equal(readFileSync(sourcePath, "utf8"), sourceBefore);
    assert.equal(
      existsSync(path.join(
        ownerScopeForHome(home).taskMapRoot,
        "native-candidate-acceptance.v1.json",
      )),
      false,
    );
    assert.equal(readdirSync(ownerScopeForHome(home).taskMapRoot).some(
      (entry) => /agent|command|process|writeback/i.test(entry),
    ), false);
  });

  it("rejects wrong-owner, stale, and malformed agent shelves instead of falling back to meeting data", async () => {
    const wrongHome = makeHome("owner-v2-wrong");
    writeProducerSnapshot({ home: wrongHome, owner: "owner-v2-wrong" });
    await writeAgentSnapshot({ home: wrongHome, owner: "different-v2-owner" });
    assertCoarseFailure(await invokeCli(wrongHome, ["--list"]), [
      wrongHome,
      "owner-v2-wrong",
      "different-v2-owner",
    ]);

    const staleHome = makeHome("owner-v2-stale");
    writeProducerSnapshot({ home: staleHome, owner: "owner-v2-stale" });
    await writeAgentSnapshot({
      home: staleHome,
      owner: "owner-v2-stale",
      producedAtMs: Date.now() - 5 * 60 * 60 * 1000,
    });
    assertCoarseFailure(await invokeCli(staleHome, ["--list"]), [
      staleHome,
      "owner-v2-stale",
    ]);

    const malformedHome = makeHome("owner-v2-malformed");
    writeProducerSnapshot({ home: malformedHome, owner: "owner-v2-malformed" });
    await writeAgentSnapshot({
      home: malformedHome,
      owner: "owner-v2-malformed",
    });
    const malformedPath = agentSnapshotPathForHome(malformedHome);
    const malformed = JSON.parse(
      readFileSync(malformedPath, "utf8"),
    ) as Record<string, unknown>;
    malformed.contractVersion =
      "taskmap-agent-session-producer-snapshot.v1";
    writeFileSync(malformedPath, JSON.stringify(malformed), { mode: 0o600 });
    chmodSync(malformedPath, 0o600);
    assertCoarseFailure(await invokeCli(malformedHome, ["--list"]), [
      malformedHome,
      "owner-v2-malformed",
    ]);
  });

  it("rejects a mixed-family v2 output row before writing stdout", async () => {
    const home = makeHome("owner-v2-mixed-row");
    writeProducerSnapshot({ home, owner: "owner-v2-mixed-row" });
    await writeAgentSnapshot({ home, owner: "owner-v2-mixed-row" });
    const listed = parseShelf((await invokeCli(home, ["--list"])).stdout);
    const mixed = structuredClone(listed);
    const agent = mixed.candidates.find(
      (row) => row.candidateFamily === "agent_session",
    );
    assert.ok(agent);
    agent.sourceKinds.push("gemini_meet");
    assert.throws(
      () => taskMapNativeCandidateShelfOutput(mixed as never),
      /mixed|family|source/i,
    );
  });

  it("accepts only an environment confirmation of the persisted owner", async () => {
    const matchingHome = makeHome("persisted-owner");
    writeProducerSnapshot({ home: matchingHome, owner: "persisted-owner" });
    const matching = await invokeCli(
      matchingHome,
      ["--list"],
      canonicalTestUserId("persisted-owner"),
    );
    assert.equal(matching.status, 0);
    assert.equal(matching.stderr, "");

    const home = makeHome("wrong-config-owner");
    writeProducerSnapshot({ home, owner: "environment-owner" });

    const result = await invokeCli(
      home,
      ["--list"],
      canonicalTestUserId("environment-owner"),
    );
    assertCoarseFailure(result, [
      home,
      "wrong-config-owner",
      "environment-owner",
      DOCUMENT_ID,
      ACTION_TITLE,
    ]);
  });

  it("reviews and replays idempotently with a domain-separated digest", async () => {
    const home = makeHome("owner-review");
    writeProducerSnapshot({ home, owner: "owner-review" });
    const listed = await invokeCli(home, ["--list"]);
    assert.equal(listed.status, 0);
    const candidate = parseShelf(listed.stdout).candidates[0];
    const reviewArgv = [
      "--review",
      candidate.candidateId,
      "--revision",
      candidate.candidateRevisionDigest,
      "--action",
      "accept_for_review",
    ] as const;

    const first = await invokeCli(home, reviewArgv);
    assert.equal(first.status, 0);
    assert.equal(first.stderr, "");
    const firstShelf = parseShelf(first.stdout);
    assert.equal(firstShelf.candidates[0].reviewState, "accept_for_review");
    assert.equal(firstShelf.candidates[0].reviewedOnly, true);
    assert.equal(firstShelf.candidates[0].acceptedWork, false);
    const overlayPath = overlayPathForHome(home);
    const firstBytes = readFileSync(overlayPath, "utf8");
    const firstOverlay = JSON.parse(firstBytes) as {
      ownerScopeDigest: string;
      candidates: Array<{
        review: {
          idempotencyKeyDigest: string;
          decidedAt: string;
          acceptedWork: boolean;
        } | null;
      }>;
    };
    assert.equal(
      firstOverlay.candidates[0].review?.idempotencyKeyDigest,
      taskMapContractDigest({
        domain:
          TASKMAP_NATIVE_CANDIDATE_REVIEW_CLI_IDEMPOTENCY_DOMAIN,
        ownerScopeDigest:
          taskMapMeetingProducerOwnerScopeDigest("owner-review"),
        candidateId: candidate.candidateId,
        candidateRevisionDigest: candidate.candidateRevisionDigest,
        action: "accept_for_review",
      }),
    );
    assert.equal(firstOverlay.candidates[0].review?.acceptedWork, false);
    for (const sentinel of [
      ACTION_TITLE,
      ACTION_SUMMARY,
      DOCUMENT_ID,
      SOURCE_REVISION,
      SOURCE_REFERENCE,
      "owner-review",
    ]) {
      assert.equal(firstBytes.includes(sentinel), false, sentinel);
    }

    const replay = await invokeCli(home, reviewArgv);
    assert.equal(replay.status, 0);
    assert.equal(replay.stderr, "");
    assert.equal(
      parseShelf(replay.stdout).candidates[0].reviewState,
      "accept_for_review",
    );
    const replayOverlay = JSON.parse(
      readFileSync(overlayPath, "utf8"),
    ) as typeof firstOverlay;
    assert.deepEqual(
      replayOverlay.candidates[0].review,
      firstOverlay.candidates[0].review,
    );
  });

  it("keeps a live owner lock and recovers its identity-bound residue after SIGKILL", async () => {
    const owner = "owner-lock-recovery";
    const home = makeHome(owner);
    writeProducerSnapshot({ home, owner });
    const overlayPath = overlayPathForHome(home);
    const holder = await holdCandidateReviewLock(home, owner);
    assert.equal(existsSync(`${overlayPath}.lock`), true);

    const waiting = startCli(home, ["--list"]);
    await waiting.started;
    let settled = false;
    void waiting.result.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await delay(150);
    assert.equal(settled, false);
    assert.equal(existsSync(`${overlayPath}.lock`), true);

    await killAndWait(holder);
    const result = await waiting.result;
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(parseShelf(result.stdout).candidates.length, 1);
    assert.deepEqual(
      readdirSync(path.dirname(overlayPath)).filter((entry) =>
        entry.startsWith(`${path.basename(overlayPath)}.lock`)
      ),
      [],
    );
  });

  it("serializes simultaneous reviews of different candidates without losing either decision", async () => {
    const owner = "owner-concurrent-reviews";
    const home = makeHome(owner);
    writeProducerSnapshot({
      home,
      owner,
      includeSecondCandidate: true,
    });
    const listed = await invokeCli(home, ["--list"]);
    assert.equal(listed.status, 0);
    const candidates = parseShelf(listed.stdout).candidates;
    assert.equal(candidates.length, 2);
    const first = candidates.find((row) => row.title === ACTION_TITLE);
    const second = candidates.find(
      (row) => row.title === SECOND_ACTION_TITLE,
    );
    assert.ok(first);
    assert.ok(second);

    const holder = await holdCandidateReviewLock(home, owner);
    const firstReview = startCli(home, [
      "--review",
      first.candidateId,
      "--revision",
      first.candidateRevisionDigest,
      "--action",
      "accept_for_review",
    ]);
    const secondReview = startCli(home, [
      "--review",
      second.candidateId,
      "--revision",
      second.candidateRevisionDigest,
      "--action",
      "dismiss",
    ]);
    await Promise.all([firstReview.started, secondReview.started]);
    await delay(100);
    await killAndWait(holder);
    const results = await Promise.all([
      firstReview.result,
      secondReview.result,
    ]);
    assert.equal(results.every((result) => result.status === 0), true);
    assert.equal(results.every((result) => result.stderr === ""), true);

    const final = parseShelf((await invokeCli(home, ["--list"])).stdout);
    assert.equal(
      final.candidates.find((row) => row.title === ACTION_TITLE)?.reviewState,
      "accept_for_review",
    );
    assert.equal(
      final.candidates.find(
        (row) => row.title === SECOND_ACTION_TITLE,
      ),
      undefined,
    );
    assert.equal(
      final.candidates.every((row) =>
        row.reviewedOnly
        && !row.acceptedWork
        && !row.rankEligible
        && !row.routeEligible
        && !row.proveEligible
        && !row.runEligible
      ),
      true,
    );
  });

  it("serializes list versus review without allowing the list to erase the decision", async () => {
    const owner = "owner-list-review-race";
    const home = makeHome(owner);
    writeProducerSnapshot({ home, owner });
    const initial = await invokeCli(home, ["--list"]);
    assert.equal(initial.status, 0);
    const candidate = parseShelf(initial.stdout).candidates[0];
    const overlayPath = overlayPathForHome(home);
    unlinkSync(overlayPath);

    const holder = await holdCandidateReviewLock(home, owner);
    const list = startCli(home, ["--list"]);
    const review = startCli(home, [
      "--review",
      candidate.candidateId,
      "--revision",
      candidate.candidateRevisionDigest,
      "--action",
      "accept_for_review",
    ]);
    await Promise.all([list.started, review.started]);
    await delay(100);
    await killAndWait(holder);
    const [listResult, reviewResult] = await Promise.all([
      list.result,
      review.result,
    ]);
    assert.equal(listResult.status, 0);
    assert.equal(reviewResult.status, 0);
    assert.equal(listResult.stderr, "");
    assert.equal(reviewResult.stderr, "");

    const final = parseShelf((await invokeCli(home, ["--list"])).stdout);
    assert.equal(final.candidates[0].reviewState, "accept_for_review");
    assert.equal(final.candidates[0].reviewedOnly, true);
    assert.equal(final.candidates[0].acceptedWork, false);
    assert.equal(final.candidates[0].rankEligible, false);
    assert.equal(final.candidates[0].routeEligible, false);
    assert.equal(final.candidates[0].proveEligible, false);
    assert.equal(final.candidates[0].runEligible, false);
  });

  it("rejects an old candidate revision without changing durable review state", async () => {
    const home = makeHome("owner-stale-revision");
    writeProducerSnapshot({ home, owner: "owner-stale-revision" });
    const listed = await invokeCli(home, ["--list"]);
    const oldCandidate = parseShelf(listed.stdout).candidates[0];
    const overlayPath = overlayPathForHome(home);
    const before = readFileSync(overlayPath, "utf8");
    writeProducerSnapshot({
      home,
      owner: "owner-stale-revision",
      revision: `${SOURCE_REVISION}-updated`,
      actionOverrides: {
        status: "in_progress",
        quality: "source_native",
        coverage: "complete",
        confidence: 1,
      },
    });

    const result = await invokeCli(home, [
      "--review",
      oldCandidate.candidateId,
      "--revision",
      oldCandidate.candidateRevisionDigest,
      "--action",
      "dismiss",
    ]);
    assertCoarseFailure(result, [
      home,
      "owner-stale-revision",
      SOURCE_REVISION,
      ACTION_TITLE,
    ]);
    assert.equal(readFileSync(overlayPath, "utf8"), before);
  });

  it("fails coarsely for missing, wrong-owner, stale, and malformed command input", async () => {
    const missingHome = makeHome("owner-missing");
    assertCoarseFailure(
      await invokeCli(missingHome, ["--list"]),
      [missingHome, "owner-missing"],
    );

    const wrongOwnerHome = makeHome("expected-owner");
    writeProducerSnapshot({
      home: wrongOwnerHome,
      owner: "different-owner",
    });
    assertCoarseFailure(
      await invokeCli(wrongOwnerHome, ["--list"]),
      [
        wrongOwnerHome,
        "expected-owner",
        "different-owner",
        DOCUMENT_ID,
        ACTION_TITLE,
      ],
    );

    const staleHome = makeHome("owner-stale");
    writeProducerSnapshot({
      home: staleHome,
      owner: "owner-stale",
      producedAtMs: Date.now() - 5 * 60 * 60 * 1000,
    });
    assertCoarseFailure(
      await invokeCli(staleHome, ["--list"]),
      [staleHome, "owner-stale", DOCUMENT_ID, ACTION_TITLE],
    );

    const noOwnerHome = makeHome(null);
    assertCoarseFailure(
      await invokeCli(noOwnerHome, ["--list"]),
      [noOwnerHome],
    );

    const malformedHome = makeHome("owner-parser");
    const malformed = await invokeCli(
      malformedHome,
      ["--review", "private-candidate"],
    );
    assertCoarseFailure(
      malformed,
      [malformedHome, "owner-parser", "private-candidate"],
    );
    assert.match(
      malformed.stderr,
      /^taskmap-native-candidate-review: unavailable\nTypeError: usage: native-candidate-review-cli/m,
    );
    assert.match(malformed.stderr, /at usageError/);
  });
});
