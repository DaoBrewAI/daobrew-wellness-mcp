import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  parseTaskMapNativeRefreshCommand,
  runTaskMapNativeRefreshCommand,
  taskMapNativeRefreshStrategyFallbackFromEnvironment,
} from "../src/engine/taskmap/native-refresh-cli.js";
import * as nativeRefreshCliModule from
  "../src/engine/taskmap/native-refresh-cli.js";
import { confirmedTestOwner } from "./support/confirmed-owner.js";
import {
  TASKMAP_MEETING_PRODUCER_VERSION,
  buildTaskMapMeetingProducerSnapshot,
  type TaskMapMeetingProducerMeetingDraftV1,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
  TASKMAP_OWNER_REFRESH_SOURCES,
} from "../src/engine/taskmap/owner-refresh-coordinator.js";
import {
  createTaskMapOwnerScope,
  taskMapOwnerScopeDigest,
} from "../src/engine/taskmap/owner-scope.js";

const ISSUER_URL = "https://api.example.test/api/v1";

it("wires one bounded real provider ladder into packaged extraction, grouping, and title paths", () => {
  const optionsFactory = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).taskMapNativeRefreshServiceOptionsFromEnvironment;
  const discoveryBudget = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).TASKMAP_NATIVE_PACKAGED_STATION_DISCOVERY_TIMEOUT_MS;
  const inferenceBudget = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).TASKMAP_NATIVE_PACKAGED_STATION_INFERENCE_TIMEOUT_MS;
  const writeHeadroom = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).TASKMAP_NATIVE_PACKAGED_PLAN_PUBLICATION_HEADROOM_MS;
  const titleBudget = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).TASKMAP_NATIVE_PACKAGED_TITLE_TIMEOUT_MS;
  assert.equal(typeof optionsFactory, "function");
  const createStation = async () => ({
    provider: {
      transport: "local-rules" as const,
      executable: "builtin",
      args: [],
      model: "fixture-provider-ladder",
    },
    async run() {
      throw new Error("not invoked by wiring test");
    },
  });
  const owner = confirmedTestOwner("native-refresh-cli-shadow-ladder");
  const options = (optionsFactory as (
    owner: unknown,
    environment: Readonly<Record<string, string | undefined>>,
    homeDirectory: string,
    createStation: () => Promise<unknown>,
  ) => Record<string, unknown>)(owner, {}, owner.homeDirectory, createStation);
  for (const key of [
    "createMeetingExtractionStation",
    "createAgentSessionExtractionStation",
    "createCalendarExtractionStation",
    "createCommunityGroupingStation",
  ]) {
    assert.equal(options[key], createStation, key);
  }
  assert.equal(discoveryBudget, 5_000);
  assert.equal(inferenceBudget, 80_000);
  assert.equal(titleBudget, 30_000);
  assert.equal(writeHeadroom, 5_000);
  assert.equal(
    options.communityPlanDeadlineMs,
    (discoveryBudget as number)
      + (inferenceBudget as number)
      + (titleBudget as number)
      + (writeHeadroom as number),
  );
  assert.ok((options.communityPlanDeadlineMs as number) <= 120_000);
  assert.equal(options.communityPlanDeadlineMs, 120_000);
});

it("leaves production station factories to the request-group-aware service defaults", () => {
  const optionsFactory = (
    nativeRefreshCliModule as unknown as Record<string, unknown>
  ).taskMapNativeRefreshServiceOptionsFromEnvironment;
  const owner = confirmedTestOwner("native-refresh-cli-production-ladder");
  const options = (optionsFactory as (
    owner: unknown,
    environment: Readonly<Record<string, string | undefined>>,
    homeDirectory: string,
  ) => Record<string, unknown>)(owner, {}, owner.homeDirectory);

  for (const key of [
    "createMeetingExtractionStation",
    "createAgentSessionExtractionStation",
    "createCalendarExtractionStation",
    "createCommunityGroupingStation",
  ]) {
    assert.equal(options[key], undefined, key);
  }
});

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function makeTempHome(prefix: string): string {
  return realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compiledLocalImportClosure(entrypoint: string): Set<string> {
  const pending = [path.resolve(entrypoint)];
  const visited = new Set<string>();
  const localImport = /(?:\brequire\s*\(\s*|\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}\/[^"']+\.js)["']/gu;
  while (pending.length > 0) {
    const current = pending.pop();
    assert.ok(current);
    if (visited.has(current)) continue;
    assert.equal(existsSync(current), true, `compiled module missing: ${current}`);
    visited.add(current);
    const source = readFileSync(current, "utf8");
    for (const match of source.matchAll(localImport)) {
      pending.push(path.resolve(path.dirname(current), match[1]));
    }
  }
  return visited;
}

function meeting(
  documentId: string,
  occurredAt: string,
): TaskMapMeetingProducerMeetingDraftV1 {
  return {
    binding: {
      connectionId: "cli-gemini-owner",
      sourceKind: "gemini_meet",
      tenantOrWorkspaceDigest: digest("cli-workspace"),
      accountOrPrincipalDigest: digest("cli-principal"),
      grantVersion: "grant-1",
    },
    documentId,
    revisionId: `revision-${documentId}`,
    contentDigest: digest(`content-${documentId}`),
    modifiedAt: occurredAt,
    eventTime: occurredAt,
    observedAt: occurredAt,
    evidence: [{
      kind: "action_item",
      title: "Ship the packaged semantic builder",
      summary: "Verify the local authenticated default Task Map path.",
      occurredAt,
      observedAt: occurredAt,
      status: "open",
      quality: "structured_generated",
      coverage: "partial",
      confidence: 0.9,
      objectRefs: [{
        kind: "external_reference",
        referenceDigest: digest("packaged-semantic-builder"),
      }],
    }],
  };
}

function writeDefaultSourceFixtures(home: string, generatedAt: string): void {
  writeJson(
    path.join(home, ".codex", "sessions", "session.jsonl"),
    { type: "session_meta" },
  );
  writeJson(
    path.join(home, ".daobrew", "calendar-export.json"),
    {
      generated_at: generatedAt,
      rawEvents: [{ id: "event-1", startDate: generatedAt }],
    },
  );
  writeJson(
    path.join(
      home,
      "Library",
      "Application Support",
      "DaoBrew",
      "taskmap",
      "taskmap-body-context.v1.json",
    ),
    {
      generatedAt,
      privacy: {
        rawBiometricsStored: false,
        sourceBodiesStored: false,
      },
      coverage: {
        classifiedDays: 1,
        unknownDays: 0,
      },
    },
  );
}

function invokeCLI(
  home: string,
  runtimeRoot: string,
  trigger: string,
  explicitUserId = "",
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const command = path.resolve(
    __dirname,
    "../src/engine/taskmap/native-refresh-cli.js",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [command, "--trigger", trigger],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: home,
          DAOBREW_TASKMAP_REFRESH_ROOT: runtimeRoot,
          DAOBREW_CONFIG_FILE: path.join(
            home,
            ".daobrew",
            "config.json",
          ),
          DAOBREW_USER_ID: explicitUserId,
          GEMINI_API_KEY: "",
          GOOGLE_API_KEY: "",
          OPENAI_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          DAOBREW_TASKMAP_STRATEGY_REPO: "",
          DAOBREW_TASKMAP_STRATEGY_BINDINGS: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

describe("Task Map packaged refresh CLI", () => {
  it("ships the three-station Gemini fallback closure without new prompt resources", () => {
    const entrypoint = path.resolve(
      __dirname,
      "../src/engine/taskmap/native-refresh-cli.js",
    );
    const closure = compiledLocalImportClosure(entrypoint);
    const requiredModules = [
      "../src/engine/taskmap/gemini-remote.js",
      "../src/engine/taskmap/identity-adjudication-proposal.js",
      "../src/engine/taskmap/identity-adjudication-refresh.js",
      "../src/engine/taskmap/llm-proposal-surface.js",
      "../src/engine/taskmap/llm-station.js",
      "../src/engine/taskmap/method-library.js",
      "../src/engine/taskmap/decomposition-validation.js",
      "../src/engine/taskmap/decomposition-refresh.js",
      "../src/engine/embeddings/gemini-remote.js",
    ].map((relative) => path.resolve(__dirname, relative));
    for (const modulePath of requiredModules) {
      assert.equal(
        closure.has(modulePath),
        true,
        `${path.basename(modulePath)} must be reachable from native-refresh-cli.js`,
      );
    }
    for (const relative of [
      "../src/engine/taskmap/identity-adjudication-proposal.js",
      "../src/engine/taskmap/method-library.js",
    ]) {
      assert.doesNotMatch(
        readFileSync(path.resolve(__dirname, relative), "utf8"),
        /promptTemplatePath/,
      );
    }
  });

  it("constructs only the explicit local Strategy bridge and fails closed on malformed or mismatched inputs", async () => {
    const home = makeTempHome("taskmap-cli-strategy-");
    const repositoryRoot = path.join(home, "strategy-repository");
    const repositoryPath = "tasks/TASKS.md";
    const repositoryText = [
      "# Tasks",
      "| Priority | Goal | Detail |",
      "| --- | --- | --- |",
      "| P0 | Demo Task Map | Ship the bounded local demo |",
      "",
    ].join("\n");
    mkdirSync(path.join(repositoryRoot, "tasks"), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(
      path.join(repositoryRoot, repositoryPath),
      repositoryText,
      { mode: 0o600 },
    );
    execFileSync("git", ["-C", repositoryRoot, "init", "-q"]);
    execFileSync(
      "git",
      ["-C", repositoryRoot, "config", "user.name", "Task Map Fixture"],
    );
    execFileSync(
      "git",
      ["-C", repositoryRoot, "config", "user.email", "fixture@example.test"],
    );
    execFileSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "remote",
        "add",
        "origin",
        "https://github.com/Example/FounderStrategy.git",
      ],
    );
    execFileSync("git", ["-C", repositoryRoot, "add", repositoryPath]);
    execFileSync(
      "git",
      [
        "-c",
        "commit.gpgSign=false",
        "-C",
        repositoryRoot,
        "commit",
        "-q",
        "-m",
        "fixture",
      ],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: "2026-07-28T18:40:25-07:00",
          GIT_COMMITTER_DATE: "2026-07-28T18:40:25-07:00",
        },
      },
    );
    const revision = execFileSync(
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const taskMapRoot = createTaskMapOwnerScope(
      "14802294-BEED-480E-ABF6-7E3703FA25CD",
      home,
    ).taskMapRoot;
    const projectionBytes = Buffer.from(
      `${JSON.stringify({ fixed: "projection" })}\n`,
    );
    const currentnessBytes = Buffer.from(
      `${JSON.stringify({ fixed: "currentness" })}\n`,
    );
    writeJson(
      path.join(taskMapRoot, "taskmap-projection.v1.json"),
      { fixed: "projection" },
    );
    writeJson(
      path.join(taskMapRoot, "taskmap-currentness.v1.json"),
      { fixed: "currentness" },
    );
    const bindingsPath = path.join(home, "strategy-bindings.json");
    writeJson(bindingsPath, [{
      pointerId: "strategy-task-1",
      canonicalRowDigest: digest("strategy-row"),
    }]);
    writeJson(path.join(home, ".daobrew", "config.json"), {
      user_id: "14802294-BEED-480E-ABF6-7E3703FA25CD",
      device_credential:
        "dbd_cli_confirmed_123456789012345678901234",
      device_credential_confirmed: true,
      api_url: ISSUER_URL,
    });
    const environment = {
      DAOBREW_USER_ID: "14802294-BEED-480E-ABF6-7E3703FA25CD",
      DAOBREW_CONFIG_FILE: path.join(home, ".daobrew", "config.json"),
      DAOBREW_TASKMAP_STRATEGY_REPO: repositoryRoot,
      DAOBREW_TASKMAP_STRATEGY_BINDINGS: bindingsPath,
    };
    const fallback =
      taskMapNativeRefreshStrategyFallbackFromEnvironment(
        environment,
        home,
      );
    assert.ok(fallback);
    assert.equal(fallback.homeDirectory, home);
    const inheritedGitDirectory = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(home, "redirected-git-directory");
    let input: Awaited<ReturnType<typeof fallback.readAdapterInput>>;
    try {
      input = await fallback.readAdapterInput();
    } finally {
      if (inheritedGitDirectory === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = inheritedGitDirectory;
      }
    }
    assert.deepEqual(input.projectionBytes, projectionBytes);
    assert.deepEqual(input.currentnessBytes, currentnessBytes);
    assert.equal(
      input.expectedProjectionFileDigest,
      digest(projectionBytes.toString("utf8")),
    );
    assert.equal(
      input.expectedCurrentnessFileDigest,
      digest(currentnessBytes.toString("utf8")),
    );
    assert.equal(input.binding.sourceKind, "strategy");
    assert.equal(
      input.binding.accountOrPrincipalDigest,
      input.ownerScopeDigest,
    );
    assert.deepEqual(input.rowBindings, [{
      pointerId: "strategy-task-1",
      canonicalRowDigest: digest("strategy-row"),
    }]);
    const observation =
      await input.repositoryProvider.readImmutableRepositoryFile({
        remoteLocator: "https://github.com/Example/FounderStrategy",
        revision,
        repositoryRelativePath: repositoryPath,
        maximumBytes: 256 * 1_024,
      }) as {
        remoteLocator: string;
        revision: string;
        repositoryRelativePath: string;
        content: string;
        contentDigest: string;
      };
    assert.deepEqual(
      [
        observation.remoteLocator,
        observation.revision,
        observation.repositoryRelativePath,
        observation.content,
        observation.contentDigest,
      ],
      [
        "https://github.com/Example/FounderStrategy",
        revision,
        repositoryPath,
        repositoryText,
        digest(repositoryText),
      ],
    );
    await assert.rejects(
      input.repositoryProvider.readImmutableRepositoryFile({
        remoteLocator: "https://github.com/Other/Repository",
        revision,
        repositoryRelativePath: repositoryPath,
        maximumBytes: 256 * 1_024,
      }),
      /locator mismatch/,
    );

    const alternateConfigPath = path.join(home, "alternate-config.json");
    writeJson(alternateConfigPath, {
      user_id: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
      device_credential:
        "dbd_cli_alternate_123456789012345678901234",
      device_credential_confirmed: true,
      api_url: "https://alternate.example.test/api/v1",
    });
    const configOverrideAttempt =
      taskMapNativeRefreshStrategyFallbackFromEnvironment({
        ...environment,
        DAOBREW_CONFIG_FILE: alternateConfigPath,
      }, home);
    assert.ok(configOverrideAttempt);
    assert.equal(
      (await configOverrideAttempt.readAdapterInput()).ownerScopeDigest,
      taskMapOwnerScopeDigest(environment.DAOBREW_USER_ID),
    );

    writeFileSync(bindingsPath, "{malformed", { mode: 0o600 });
    const malformed =
      taskMapNativeRefreshStrategyFallbackFromEnvironment(
        environment,
        home,
      );
    assert.ok(malformed);
    await assert.rejects(
      malformed.readAdapterInput(),
      SyntaxError,
    );
    assert.throws(
      () => taskMapNativeRefreshStrategyFallbackFromEnvironment({
        DAOBREW_TASKMAP_STRATEGY_REPO: repositoryRoot,
      }, home),
      /requires both/,
    );
    assert.equal(
      taskMapNativeRefreshStrategyFallbackFromEnvironment({}, home),
      undefined,
    );
  });

  it("parses one explicit product trigger and preserves the runtime receipt", async () => {
    assert.deepEqual(
      parseTaskMapNativeRefreshCommand(["--trigger", "manual"]),
      { operation: "refresh", trigger: "manual" },
    );
    assert.throws(
      () => parseTaskMapNativeRefreshCommand(["--trigger", "codex"]),
      /launch\|manual\|timer/,
    );
    assert.throws(
      () => parseTaskMapNativeRefreshCommand([
        "--trigger",
        "manual",
        "--user-id",
        "owner-in-process-args",
      ]),
      /launch\|manual\|timer/,
    );
    const response = await runTaskMapNativeRefreshCommand(
      ["--trigger", "launch"],
      {
        requestRefresh: async (trigger) => ({
          status: "partial",
          refreshStatus: "unavailable",
          sourceStatuses: TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
            source,
            disposition: "unavailable",
            state: "unavailable",
            lastSuccessAtMs: null,
            nextDueAtMs: null,
            proof: null,
            ...(source === "meeting_notes"
              ? {
                  extractionDegradationCode:
                    "provider_unauthenticated" as const,
                }
              : {}),
          })),
          requestedAtMs: trigger === "launch" ? 1_000 : 0,
          nextDueAtMs: 1_000 + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
          publicationVerified: false,
          publicationBlockReason: "semantic_provider_unavailable",
        }),
      },
    );
    assert.ok("requestedAtMs" in response);
    assert.equal(response.requestedAtMs, 1_000);
    assert.equal(
      response.sourceStatuses.find(
        (status) => status.source === "meeting_notes",
      )?.extractionDegradationCode,
      "provider_unauthenticated",
    );
  });

  it("runs recovery without collecting or refreshing any source", async () => {
    assert.deepEqual(
      parseTaskMapNativeRefreshCommand(["--recover-only"]),
      { operation: "recover" },
    );
    let refreshCalls = 0;
    let recoveryCalls = 0;
    const response = await runTaskMapNativeRefreshCommand(
      ["--recover-only"],
      {
        requestRefresh: async () => {
          refreshCalls += 1;
          throw new Error("refresh must not run during recovery");
        },
        recoverPendingPublication: async () => {
          recoveryCalls += 1;
          return true;
        },
      },
    );
    assert.deepEqual(response, {
      status: "ok",
      operation: "recover",
      recovered: true,
    });
    assert.equal(refreshCalls, 0);
    assert.equal(recoveryCalls, 1);
  });

  it("preserves the safe failure receipt while exposing the originating parse stack", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "taskmap-cli-diagnostic-"));
    try {
      const result = await invokeCLI(
        home,
        path.join(home, "runtime"),
        "diagnostic-sentinel",
      );

      assert.equal(result.status, 1);
      const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
      assert.equal(result.stdout, `${JSON.stringify(receipt)}\n`);
      assert.equal(receipt.status, "partial");
      assert.equal(receipt.refreshStatus, "unavailable");
      assert.equal(receipt.publicationVerified, false);
      assert.equal(receipt.publicationBlockReason, "publication_failed");
      assert.match(
        result.stderr,
        /^taskmap-native-refresh: unavailable\nTypeError: usage: native-refresh-cli/m,
      );
      assert.match(result.stderr, /at parseTaskMapNativeRefreshCommand/);
      assert.equal(result.stderr.includes(home), false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back from a noncanonicalizable HOME while exposing the realpath cause", async () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), "taskmap-cli-canonical-home-"),
    );
    const missingHome = path.join(fixtureRoot, "missing-home");
    try {
      const result = await invokeCLI(
        missingHome,
        path.join(fixtureRoot, "runtime"),
        "manual",
      );

      assert.equal(result.status, 1);
      const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
      assert.equal(result.stdout, `${JSON.stringify(receipt)}\n`);
      assert.equal(receipt.refreshStatus, "unavailable");
      assert.match(
        result.stderr,
        /^taskmap-native-refresh: canonical home unavailable\nError: ENOENT:/m,
      );
      assert.match(result.stderr, /missing-home/);
      assert.match(
        result.stderr,
        /taskmap-native-refresh: unavailable\nError: Task Map confirmed owner enrollment is unavailable/,
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed without confirmed canonical resident identity", async () => {
    const home = makeTempHome("taskmap-cli-home-");
    const runtimeRoot = path.join(home, "runtime");
    writeDefaultSourceFixtures(home, new Date().toISOString());
    writeJson(
      path.join(home, ".daobrew", "gdocs-snapshot.json"),
      { notes: [{ id: "meeting-1", modified_time: new Date().toISOString() }] },
    );

    const result = await invokeCLI(home, runtimeRoot, "manual");
    assert.equal(result.status, 1);
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(receipt.refreshStatus, "unavailable");
    assert.equal(receipt.publicationVerified, false);
    assert.deepEqual(
      (receipt.sourceStatuses as Array<{ source: string }>).map(
        (item) => item.source,
      ),
      TASKMAP_OWNER_REFRESH_SOURCES,
    );
    assert.equal(existsSync(runtimeRoot), false);
    assert.equal(
      existsSync(path.join(
        home,
        "Library",
        "Application Support",
        "DaoBrew",
        "owners",
      )),
      false,
    );
  });

  it("fails closed for noncanonical, unconfirmed, or mismatched resident identity", async () => {
    const canonical = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    const cases = [
      {
        name: "missing-issuer",
        config: {
          user_id: canonical,
          device_credential:
            "dbd_cli_confirmed_123456789012345678901234",
          device_credential_confirmed: true,
        },
        explicitUserId: "",
      },
      {
        name: "noncanonical",
        config: {
          user_id: "not-a-canonical-user-id",
          device_credential:
            "dbd_cli_confirmed_123456789012345678901234",
          device_credential_confirmed: true,
          api_url: ISSUER_URL,
        },
        explicitUserId: "",
      },
      {
        name: "unconfirmed",
        config: {
          user_id: canonical,
          device_credential:
            "dbd_cli_unconfirmed_123456789012345678901234",
          device_credential_confirmed: false,
          api_url: ISSUER_URL,
        },
        explicitUserId: "",
      },
      {
        name: "mismatched",
        config: {
          user_id: canonical,
          device_credential:
            "dbd_cli_confirmed_123456789012345678901234",
          device_credential_confirmed: true,
          api_url: ISSUER_URL,
        },
        explicitUserId: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
      },
    ];
    for (const testCase of cases) {
      const home = makeTempHome(`taskmap-cli-${testCase.name}-`);
      const runtimeRoot = path.join(home, "runtime");
      writeJson(
        path.join(home, ".daobrew", "config.json"),
        testCase.config,
      );

      const result = await invokeCLI(
        home,
        runtimeRoot,
        "manual",
        testCase.explicitUserId,
      );

      assert.equal(result.status, 1, testCase.name);
    }
  });

  it("publishes and deterministically replays through an isolated local default path", async () => {
    const home = makeTempHome("taskmap-cli-default-");
    const runtimeRoot = path.join(home, "runtime");
    const userId = "14802294-BEED-480E-ABF6-7E3703FA25CD";
    const ownerScope = createTaskMapOwnerScope(userId, home);
    const now = new Date();
    const producedAt = new Date(now.getTime() - 60_000).toISOString();
    writeDefaultSourceFixtures(home, now.toISOString());
    writeJson(path.join(home, ".daobrew", "config.json"), {
      user_id: userId,
      device_credential:
        "dbd_cli_confirmed_123456789012345678901234",
      device_credential_confirmed: true,
      api_url: ISSUER_URL,
    });
    const snapshot = buildTaskMapMeetingProducerSnapshot({
      ownerScopeDigest: taskMapOwnerScopeDigest(userId),
      producerVersion: TASKMAP_MEETING_PRODUCER_VERSION,
      producedAt,
      meetings: [
        meeting("cli-document-a", "2026-07-27T09:00:00.000Z"),
        meeting("cli-document-b", "2026-07-28T09:00:00.000Z"),
      ],
    });
    writeJson(
      path.join(ownerScope.sourceRoot, "meeting-producer-snapshot.v1.json"),
      snapshot,
    );

    const first = await invokeCLI(
      home,
      runtimeRoot,
      "manual",
      userId,
    );

    assert.equal(
      first.status,
      0,
      `stdout=${first.stdout}\nstderr=${first.stderr}`,
    );
    assert.equal(first.stderr, "");
    const firstReceipt = JSON.parse(first.stdout) as Record<string, unknown>;
    assert.equal(firstReceipt.refreshStatus, "published");
    assert.equal(firstReceipt.publicationVerified, true);
    assert.equal(firstReceipt.publicationBlockReason, null);
    assert.equal(existsSync(runtimeRoot), false);
    const refreshState = JSON.parse(readFileSync(path.join(
      ownerScope.runtimeRoot,
      "taskmap-refresh-state.v1.json",
    ), "utf8")) as {
      ownerScopeDigest: string;
      sources: Record<string, {
        ownerScopeDigest: string;
        value: { ownerScopeDigest: string };
      }>;
    };
    assert.equal(refreshState.ownerScopeDigest, ownerScope.ownerScopeDigest);
    for (const source of Object.values(refreshState.sources)) {
      assert.equal(source.ownerScopeDigest, ownerScope.ownerScopeDigest);
      assert.equal(
        source.value.ownerScopeDigest,
        ownerScope.ownerScopeDigest,
      );
    }
    const taskMapRoot = ownerScope.taskMapRoot;
    const projectionPath = path.join(
      taskMapRoot,
      "taskmap-projection.v1.json",
    );
    const currentnessPath = path.join(
      taskMapRoot,
      "taskmap-currentness.v1.json",
    );
    assert.equal(existsSync(projectionPath), true);
    assert.equal(existsSync(currentnessPath), true);
    const projectionBefore = readFileSync(projectionPath);
    const currentnessBefore = readFileSync(currentnessPath);
    const projection = JSON.parse(projectionBefore.toString("utf8")) as {
      tasks: Array<{ reviewState: string; authority: string }>;
    };
    assert.equal(projection.tasks.length, 1);
    assert.equal(projection.tasks[0].reviewState, "proposed");
    assert.equal(projection.tasks[0].authority, "none");
    const currentness = JSON.parse(
      currentnessBefore.toString("utf8"),
    ) as {
      taskDispositions: Array<{ disposition: string }>;
    };
    assert.deepEqual(
      currentness.taskDispositions.map((item) => item.disposition),
      ["needs_lifecycle_review"],
    );

    const replay = await invokeCLI(
      home,
      runtimeRoot,
      "manual",
      userId,
    );

    assert.equal(replay.status, 0);
    assert.equal(replay.stderr, "");
    const replayReceipt = JSON.parse(replay.stdout) as Record<string, unknown>;
    assert.equal(replayReceipt.refreshStatus, "no_op");
    assert.equal(replayReceipt.publicationVerified, true);
    assert.deepEqual(readFileSync(projectionPath), projectionBefore);
    assert.deepEqual(readFileSync(currentnessPath), currentnessBefore);
  });

  it("never replays stale status after a waited-on lock disappears when work sources are unavailable", async () => {
    const home = makeTempHome("taskmap-cli-lock-");
    const ownerScope = createTaskMapOwnerScope(
      "14802294-BEED-480E-ABF6-7E3703FA25CD",
      home,
    );
    const runtimeRoot = ownerScope.runtimeRoot;
    const lockPath = path.join(runtimeRoot, "taskmap-refresh.lock");
    const staleRequestedAtMs = 1_000;
    writeJson(path.join(home, ".daobrew", "config.json"), {
      user_id: "14802294-BEED-480E-ABF6-7E3703FA25CD",
      device_credential:
        "dbd_cli_confirmed_123456789012345678901234",
      device_credential_confirmed: true,
      api_url: ISSUER_URL,
    });
    writeJson(path.join(runtimeRoot, "taskmap-refresh-status.v1.json"), {
      contractVersion: "taskmap-native-refresh-status.v1",
      status: "ok",
      refreshStatus: "published",
      sourceStatuses: TASKMAP_OWNER_REFRESH_SOURCES.map((source) => ({
        source,
        disposition: "fresh",
      })),
      requestedAtMs: staleRequestedAtMs,
      completedAtMs: 1_100,
      nextDueAtMs:
        staleRequestedAtMs + TASKMAP_OWNER_REFRESH_DUE_INTERVAL_MS,
      candidateDigest: "old-candidate",
      projectionDigest: "old-projection",
      publicationBlockReason: null,
      failureStage: null,
    });
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });
    writeJson(path.join(lockPath, "owner.json"), {
      contractVersion: "taskmap-native-refresh-lock.v1",
      pid: process.pid,
      createdAtMs: Date.now(),
    });

    const invocation = invokeCLI(
      home,
      runtimeRoot,
      "manual",
      "14802294-BEED-480E-ABF6-7E3703FA25CD",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    rmSync(lockPath, { recursive: true });

    const result = await invocation;
    assert.equal(
      result.status,
      0,
      `stdout=${result.stdout}\nstderr=${result.stderr}`,
    );
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(
      receipt.refreshStatus,
      "unavailable",
      JSON.stringify(receipt),
    );
    assert.equal(receipt.publicationVerified, false);
    assert.equal(
      receipt.publicationBlockReason,
      "semantic_provider_unavailable",
    );
    assert.notEqual(receipt.requestedAtMs, staleRequestedAtMs);
    assert.equal(
      receipt.nextDueAtMs,
      receipt.requestedAtMs,
    );
    assert.equal(existsSync(path.join(
      ownerScope.taskMapRoot,
      "taskmap-projection.v1.json",
    )), false);
  });
});
