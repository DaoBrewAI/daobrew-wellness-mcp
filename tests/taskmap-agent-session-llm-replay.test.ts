import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME,
  TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
  loadVerifiedTaskMapAgentSessionExtractionReport,
  refreshTaskMapAgentSessionExtraction,
  type TaskMapAgentSessionExtractionReportV1,
} from "../src/engine/taskmap/agent-session-refresh-llm-replay.js";
import {
  renderTaskMapAgentSessionMentionPrompt,
  taskMapAgentSessionExtractionBody,
} from "../src/engine/taskmap/agent-session-extraction.js";
import {
  buildTaskMapAgentSessionCandidateReview,
} from "../src/engine/taskmap/agent-session-candidate-adapter.js";
import {
  buildTaskMapAgentSessionProducerSnapshot,
  type TaskMapAgentSessionObservationV1,
} from "../src/engine/taskmap/agent-session-producer-freshness.js";
import {
  buildTaskMapAgentSessionSemanticAdmission,
  type TaskMapAgentSessionSemanticAdmissionV2,
} from "../src/engine/taskmap/agent-session-semantic-admission.js";
import {
  LlmStationUnavailableError,
  createLlmStation,
  type LlmStation,
  type LlmStationEnvelope,
  type LlmProviderId,
} from "../src/engine/taskmap/llm-station.js";
import {
  TaskMapPromptTemplateUnavailableError,
  loadEnvelope,
  taskMapMentionExtractionEnvelopePath,
  type TaskMapLlmStationFactory,
} from "../src/engine/taskmap/meeting-refresh-llm-replay.js";
import {
  taskMapMeetingObligationGate,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  assertTaskMapNativeCandidateShelfV2,
} from "../src/engine/taskmap/native-candidate-review.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const OWNER = taskMapContractDigest("agent-session-replay-owner");
const ASSESSED_AT = "2026-08-07T20:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";
const DIRECTIVE = "Implement proposal adoption";

function observation(
  session: string,
  directive = DIRECTIVE,
): TaskMapAgentSessionObservationV1 {
  const rows = [
    {
      timestamp: "2026-08-07T19:50:00.000Z",
      type: "session_meta",
      payload: { id: session },
    },
    {
      timestamp: "2026-08-07T19:51:00.000Z",
      type: "turn_context",
      payload: {
        cwd: `/Users/reviewer/${session}`,
        workspace_roots: [`/Users/reviewer/${session}`],
      },
    },
    {
      timestamp: "2026-08-07T19:52:00.000Z",
      type: "response_item",
      payload: {
        id: `${session}-turn`,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: directive }],
      },
    },
    {
      timestamp: "2026-08-07T19:53:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "Prepared the proposal adoption implementation.",
        }],
      },
    },
  ];
  return {
    provider: "codex",
    rawJsonl: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  };
}

function admission(
  directives: readonly string[] = [DIRECTIVE],
): TaskMapAgentSessionSemanticAdmissionV2 {
  return buildTaskMapAgentSessionSemanticAdmission(
    buildTaskMapAgentSessionProducerSnapshot({
      ownerScopeDigest: OWNER,
      producedAt: ASSESSED_AT,
      observations: directives.map((directive, index) =>
        observation(`session-${index}`, directive)
      ),
    }),
  );
}

async function fixture(
  sourceAdmission = admission(),
): Promise<{
  root: string;
  taskMapRoot: string;
  runtimeRoot: string;
  promptTemplatePath: string;
  admission: TaskMapAgentSessionSemanticAdmissionV2;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(
    path.join(tmpdir(), "taskmap-agent-session-replay-"),
  );
  const taskMapRoot = path.join(root, "taskmap");
  const runtimeRoot = path.join(root, "runtime");
  const promptTemplatePath = path.join(root, "agent-session-extraction-v1.md");
  await mkdir(taskMapRoot, { mode: 0o700 });
  await mkdir(runtimeRoot, { mode: 0o700 });
  await writeFile(promptTemplatePath, TEMPLATE, { mode: 0o600 });
  return {
    root,
    taskMapRoot,
    runtimeRoot,
    promptTemplatePath,
    admission: sourceAdmission,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function extraction(
  mentions: readonly {
    text: string;
    title: string;
    class: "request" | "commitment" | "decision" | "other";
    actor: "self" | "other";
    confidence: number;
  }[],
): string {
  return JSON.stringify({ mentions });
}

function singleMentionOutput(promptText: string): string {
  const directive = [
    DIRECTIVE,
    "Implement session extraction A",
    "Implement session extraction B",
  ].find((candidate) => promptText.includes(candidate)) ?? DIRECTIVE;
  return extraction([{
    text: directive,
    title: "Implement session extraction",
    class: "request",
    actor: "self",
    confidence: 0.91,
  }]);
}

function stationFactory(
  calls: { factory: number; run: string[] },
  outputFor: (promptText: string) => string,
  transport: LlmProviderId = "claude-cli",
): TaskMapLlmStationFactory {
  return async () => {
    calls.factory += 1;
    const station: LlmStation = {
      provider: {
        transport,
        executable: transport === "gemini-remote" ? "" : "/private/provider",
        args: [],
        model: "session-test-model",
      },
      async run(request): Promise<LlmStationEnvelope> {
        calls.run.push(request.promptText);
        return {
          stationId: "mention-extraction-v1",
          model: "session-test-model",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: outputFor(request.promptText),
          producedAt: ASSESSED_AT,
          transport,
        };
      },
    };
    return station;
  };
}

function realStationFactory(
  outputFor: (promptText: string) => string,
): TaskMapLlmStationFactory {
  return async () => createLlmStation({
    order: ["claude-cli"],
    ownerHome: "/Users/owner",
    pathEnv: "",
    isExecutable: async (candidate) =>
      candidate === "/Users/owner/.local/bin/claude",
    clock: () => new Date(ASSESSED_AT),
    runner: async (request) => {
      if (request.args.join("\0") === "auth\0status") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return {
        stdout: JSON.stringify({
          type: "result",
          subtype: "success",
          result: outputFor(request.stdin),
        }),
        stderr: "",
        exitCode: 0,
      };
    },
  });
}

async function refresh(
  f: Awaited<ReturnType<typeof fixture>>,
  createStation: TaskMapLlmStationFactory,
): Promise<TaskMapAgentSessionExtractionReportV1> {
  return refreshTaskMapAgentSessionExtraction({
    admission: f.admission,
    taskMapRoot: f.taskMapRoot,
    runtimeRoot: f.runtimeRoot,
    ownerScopeDigest: OWNER,
    promptTemplatePath: f.promptTemplatePath,
    assessedAt: ASSESSED_AT,
    createStation,
  });
}

describe("Task Map agent-session Station-1 extraction replay", () => {
  it("records and byte-identically replays a Gemini extraction envelope", async () => {
    const f = await fixture(admission([DIRECTIVE]));
    const calls = { factory: 0, run: [] as string[] };
    const rawOutput = ' {"mentions":[{"text":"' + DIRECTIVE
      + '","title":"Implement session extraction","class":"request",'
      + '"actor":"self","confidence":0.91}]} ';
    try {
      const report = await refresh(
        f,
        stationFactory(calls, () => rawOutput, "gemini-remote"),
      );
      assert.equal(report.clusters[0]?.envelopeTransport, "gemini-remote");
      const cluster = f.admission.clusters[0]!;
      const body = taskMapAgentSessionExtractionBody(cluster);
      const rendered = renderTaskMapAgentSessionMentionPrompt(TEMPLATE, body);
      const envelope = await loadEnvelope(
        f.taskMapRoot,
        rendered,
        body,
        TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
      );
      assert.equal(envelope?.transport, "gemini-remote");
      assert.equal(envelope?.outputJson, rawOutput);

      const replayed = await refresh(f, async () => {
        assert.fail("Gemini envelope replay must not recreate the station");
      });
      assert.deepEqual(replayed, report);
    } finally {
      await f.cleanup();
    }
  });

  it("extracts JSON-fenced and bare-fenced probe outputs, stores canonical envelopes, and replays without the station", async () => {
    const directives = [
      "Implement session extraction A",
      "Implement session extraction B",
    ];
    const f = await fixture(admission(directives));
    try {
      const first = await refresh(f, realStationFactory((promptText) => {
        const output = singleMentionOutput(promptText);
        return promptText.includes(directives[0]!)
          ? "```json\n" + output + "\n```"
          : "```\n" + output + "\n```";
      }));

      assert.equal(first.pendingCount, 0);
      assert.equal(first.clusters.length, 2);
      for (const row of first.clusters) {
        assert.equal(row.status, "extracted");
        assert.equal(row.degradationCode, null);
        assert.match(row.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
        assert.equal(row.mentions.length, 1);
        const mention = row.mentions[0]!;
        assert.ok(directives.includes(mention.text));
        assert.equal(mention.title, "Implement session extraction");
        assert.equal(mention.speechActClass, "request");
        assert.equal(mention.speechActActor, "self");
        assert.equal(mention.confidence, 0.91);
      }

      for (const cluster of f.admission.clusters) {
        const body = taskMapAgentSessionExtractionBody(cluster);
        const rendered = renderTaskMapAgentSessionMentionPrompt(TEMPLATE, body);
        const envelope = await loadEnvelope(
          f.taskMapRoot,
          rendered,
          body,
          TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
        );
        assert.equal(envelope?.outputJson, singleMentionOutput(rendered.promptText));
      }

      const replayed = await refresh(f, async () => {
        assert.fail("station must not be created for persisted-envelope replay");
      });
      assert.deepEqual(replayed, first);
    } finally {
      await f.cleanup();
    }
  });

  it("accepts gemini-remote in agent-session envelope and report contracts", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(
        f,
        stationFactory(calls, singleMentionOutput, "gemini-remote"),
      );
      assert.equal(report.clusters[0]?.envelopeTransport, "gemini-remote");
      const reloaded = await loadVerifiedTaskMapAgentSessionExtractionReport({
        admission: f.admission,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.equal(reloaded?.clusters[0]?.envelopeTransport, "gemini-remote");
    } finally {
      await f.cleanup();
    }
  });

  it("persists namespaced envelopes and applies the exact four-class actor gate matrix", async () => {
    const classes = ["request", "commitment", "decision", "other"] as const;
    const actors = ["self", "other"] as const;
    const matrix = classes.flatMap((speechActClass) => actors.map((actor) => ({
      text: `${speechActClass} ${actor}`,
      title: `${speechActClass} ${actor}`,
      class: speechActClass,
      actor,
      confidence: actor === "self" ? 0.9 : 0.8,
    })));
    const f = await fixture(admission([matrix.map(({ text }) => text).join("; ")]));
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(
        f,
        stationFactory(calls, () => extraction(matrix)),
      );

      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, f.admission.clusters.length);
      assert.equal(report.pendingCount, 0);
      assert.ok(report.clusters.every((row) => row.status === "extracted"));
      const mentions = report.clusters[0]!.mentions;
      assert.equal(mentions.length, 8);
      for (const mention of mentions) {
        const expected = taskMapMeetingObligationGate(
          mention.speechActClass,
          mention.speechActActor,
        );
        assert.deepEqual({
          proposalDisposition: mention.proposalDisposition,
          promotionEligible: mention.promotionEligible,
        }, {
          proposalDisposition: expected.proposalDisposition,
          promotionEligible: expected.promotionEligible,
        });
      }
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        report.clusters[0]!.inputDigest,
        TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
      );
      assert.equal((await lstat(envelopePath)).mode & 0o777, 0o600);
      assert.match(
        envelopePath,
        /llm-envelopes\/mention-extraction-v1\/agent-session\/[a-f0-9]{64}\.json$/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("folds duplicate mention identities before shelf construction", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, () => extraction([
        {
          text: DIRECTIVE,
          title: "Lower-confidence other request",
          class: "request",
          actor: "other",
          confidence: 0.7,
        },
        {
          text: DIRECTIVE,
          title: "Higher-confidence self request",
          class: "request",
          actor: "self",
          confidence: 0.9,
        },
        {
          text: DIRECTIVE,
          title: "Later tied request",
          class: "request",
          actor: "other",
          confidence: 0.9,
        },
      ])));

      const mentions = report.clusters[0]!.mentions;
      assert.equal(mentions.length, 1);
      assert.equal(mentions[0]?.title, "Higher-confidence self request");
      assert.equal(mentions[0]?.speechActActor, "self");
      assert.equal(mentions[0]?.confidence, 0.9);
      assert.equal(mentions[0]?.promotionEligible, false);

      const review = buildTaskMapAgentSessionCandidateReview({
        admission: f.admission,
        extraction: report,
        previous: null,
        expectedOwnerScopeDigest: OWNER,
        assessedAt: ASSESSED_AT,
      });
      assert.equal(review.shelf.candidates.length, 1);
      assert.equal(review.shelf.candidates[0]?.promotionEligible, false);
      assertTaskMapNativeCandidateShelfV2(review.shelf);
    } finally {
      await f.cleanup();
    }
  });

  it("rejects persisted cluster rows with duplicate mention identities", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refresh(f, stationFactory(calls, singleMentionOutput));
      const reportPath = path.join(
        f.runtimeRoot,
        TASKMAP_AGENT_SESSION_EXTRACTION_REPORT_FILENAME,
      );
      const tampered = JSON.parse(
        await readFile(reportPath, "utf8"),
      ) as TaskMapAgentSessionExtractionReportV1;
      tampered.clusters[0]!.mentions.push({
        ...tampered.clusters[0]!.mentions[0]!,
      });
      const { reportDigest: _oldDigest, ...payload } = tampered;
      tampered.reportDigest = taskMapContractDigest(payload);
      await writeFile(reportPath, JSON.stringify(tampered), { mode: 0o600 });

      await assert.rejects(
        loadVerifiedTaskMapAgentSessionExtractionReport({
          admission: f.admission,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        (error: unknown) => {
          assert.equal(
            (error as { code?: string }).code,
            "agent_session_extraction_report_malformed",
          );
          return true;
        },
      );
    } finally {
      await f.cleanup();
    }
  });

  it("replays unchanged admissions without station creation and preserves report identity", async () => {
    const f = await fixture();
    const firstCalls = { factory: 0, run: [] as string[] };
    try {
      const first = await refresh(
        f,
        stationFactory(firstCalls, singleMentionOutput),
      );
      const replayCalls = { factory: 0, run: [] as string[] };
      const replayed = await refresh(
        f,
        stationFactory(replayCalls, singleMentionOutput),
      );

      assert.equal(firstCalls.factory, 1);
      assert.equal(replayCalls.factory, 0);
      assert.equal(replayCalls.run.length, 0);
      assert.equal(replayed.reportDigest, first.reportDigest);
      assert.deepEqual(replayed, first);
    } finally {
      await f.cleanup();
    }
  });

  it("accounts every cluster as pending after one no-provider selection failure", async () => {
    const f = await fixture(admission([
      "Implement session extraction A",
      "Implement session extraction B",
    ]));
    let factoryCalls = 0;
    try {
      const report = await refresh(f, async () => {
        factoryCalls += 1;
        throw new LlmStationUnavailableError("no_provider");
      });

      assert.equal(factoryCalls, 1);
      assert.equal(report.pendingCount, f.admission.clusters.length);
      assert.ok(report.clusters.every((row) =>
        row.status === "degraded"
        && row.degradationCode === "no_provider"
        && row.envelopeDigest === null
        && row.mentions.length === 0
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("persists remote-consent-required pending state and retries it after consent", async () => {
    const f = await fixture();
    try {
      const degraded = await refresh(f, async () => {
        throw new LlmStationUnavailableError("remote_consent_required");
      });
      assert.equal(degraded.pendingCount, 1);
      assert.equal(
        degraded.clusters[0]?.degradationCode,
        "remote_consent_required",
      );

      const recoveryCalls = { factory: 0, run: [] as string[] };
      const recovered = await refresh(
        f,
        stationFactory(recoveryCalls, singleMentionOutput),
      );
      assert.equal(recoveryCalls.factory, 1);
      assert.equal(recoveryCalls.run.length, 1);
      assert.equal(recovered.pendingCount, 0);
      assert.equal(recovered.clusters[0]?.status, "extracted");
    } finally {
      await f.cleanup();
    }
  });

  it("persists and reloads provider_rate_limited for every pending cluster", async () => {
    const f = await fixture(admission([
      "Implement session extraction A",
      "Implement session extraction B",
    ]));
    try {
      const report = await refresh(f, async () => ({
        provider: {
          transport: "claude-cli",
          executable: "/private/provider",
          args: [],
          model: "session-test-model",
        },
        async run() {
          throw new LlmStationUnavailableError(
            "provider_rate_limited",
            "claude-cli",
          );
        },
      }));
      assert.ok(report.clusters.every((row) =>
        row.status === "degraded"
        && row.degradationCode === "provider_rate_limited"
      ));

      const reloaded = await loadVerifiedTaskMapAgentSessionExtractionReport({
        admission: f.admission,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.ok(reloaded?.clusters.every((row) =>
        row.degradationCode === "provider_rate_limited"
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("throws the deployment marker before station creation when the prompt is missing", async () => {
    const f = await fixture();
    let factoryCalls = 0;
    try {
      await assert.rejects(
        refreshTaskMapAgentSessionExtraction({
          admission: f.admission,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: path.join(f.root, "missing-prompt.md"),
          assessedAt: ASSESSED_AT,
          createStation: async () => {
            factoryCalls += 1;
            throw new Error("station must not be created");
          },
        }),
        (error: unknown) => error instanceof TaskMapPromptTemplateUnavailableError,
      );
      assert.equal(factoryCalls, 0);
    } finally {
      await f.cleanup();
    }
  });

  it("isolates malformed model JSON to its cluster while later clusters extract", async () => {
    const f = await fixture(admission([
      "Implement session extraction A",
      "Implement session extraction B",
    ]));
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, (promptText) =>
        promptText.includes("extraction A")
          ? "not-json"
          : singleMentionOutput(promptText)
      ));

      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, f.admission.clusters.length);
      assert.equal(report.pendingCount, 1);
      assert.equal(
        report.clusters.filter((row) => row.status === "degraded")[0]
          ?.degradationCode,
        "invalid_extraction_output",
      );
      assert.equal(
        report.clusters.filter((row) => row.status === "extracted").length,
        1,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("backfills pending clusters and persists their envelopes when the station recovers", async () => {
    const f = await fixture();
    try {
      const degraded = await refresh(f, async () => {
        throw new LlmStationUnavailableError("no_provider");
      });
      assert.equal(degraded.pendingCount, 1);

      const recoveryCalls = { factory: 0, run: [] as string[] };
      const recovered = await refresh(
        f,
        stationFactory(recoveryCalls, singleMentionOutput),
      );
      assert.equal(recoveryCalls.factory, 1);
      assert.equal(recoveryCalls.run.length, 1);
      assert.equal(recovered.pendingCount, 0);
      assert.equal(recovered.clusters[0]?.status, "extracted");
      assert.notEqual(recovered.clusters[0]?.envelopeDigest, null);
    } finally {
      await f.cleanup();
    }
  });

  it("maps a station timeout to provider_timeout pending state", async () => {
    const f = await fixture();
    try {
      const report = await refresh(f, async () => ({
        provider: {
          transport: "codex-cli",
          executable: "/private/codex",
          args: [],
          model: "default",
        },
        async run() {
          throw new LlmStationUnavailableError("timeout", "codex-cli");
        },
      }));
      assert.equal(report.pendingCount, 1);
      assert.equal(report.clusters[0]?.degradationCode, "provider_timeout");
      assert.deepEqual(report.clusters[0]?.mentions, []);
    } finally {
      await f.cleanup();
    }
  });

  it("marks a taskless extraction as invalid and pending", async () => {
    const f = await fixture();
    try {
      const report = await refresh(
        f,
        stationFactory({ factory: 0, run: [] }, () => extraction([])),
      );
      assert.equal(report.pendingCount, 1);
      assert.equal(report.clusters[0]?.status, "degraded");
      assert.equal(
        report.clusters[0]?.degradationCode,
        "invalid_extraction_output",
      );
      assert.deepEqual(report.clusters[0]?.mentions, []);
      const cluster = f.admission.clusters[0]!;
      const body = taskMapAgentSessionExtractionBody(cluster);
      const rendered = renderTaskMapAgentSessionMentionPrompt(TEMPLATE, body);
      await assert.rejects(
        lstat(taskMapMentionExtractionEnvelopePath(
          f.taskMapRoot,
          rendered.inputDigest,
          TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
        )),
        (error: unknown) =>
          (error as NodeJS.ErrnoException).code === "ENOENT",
        "a taskless extraction must not become durable replay authority",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("retries and atomically heals a persisted taskless extraction after provider recovery", async () => {
    const f = await fixture();
    try {
      const cluster = f.admission.clusters[0]!;
      const body = taskMapAgentSessionExtractionBody(cluster);
      const rendered = renderTaskMapAgentSessionMentionPrompt(TEMPLATE, body);
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        rendered.inputDigest,
        TASKMAP_AGENT_SESSION_ENVELOPE_NAMESPACE,
      );
      await mkdir(path.dirname(envelopePath), { recursive: true, mode: 0o700 });
      await writeFile(envelopePath, taskMapContractCanonicalJson({
        stationId: "mention-extraction-v1",
        model: "persisted-taskless-fixture",
        promptDigest: rendered.promptDigest,
        inputDigest: rendered.inputDigest,
        outputJson: extraction([]),
        producedAt: ASSESSED_AT,
        transport: "claude-cli",
      }), { mode: 0o600 });
      const poisonedBytes = await readFile(envelopePath);

      const recoveryCalls = { factory: 0, run: [] as string[] };
      const recovered = await refresh(
        f,
        stationFactory(recoveryCalls, singleMentionOutput),
      );
      assert.equal(recoveryCalls.factory, 1);
      assert.equal(recoveryCalls.run.length, 1);
      assert.equal(recovered.pendingCount, 0);
      assert.equal(recovered.clusters[0]?.status, "extracted");
      assert.equal(recovered.clusters[0]?.mentions.length, 1);
      const healedBytes = await readFile(envelopePath);
      assert.notDeepEqual(healedBytes, poisonedBytes);

      const replayed = await refresh(f, async () => {
        assert.fail("a healed non-empty envelope must replay without a station");
      });
      assert.deepEqual(replayed, recovered);
      assert.deepEqual(await readFile(envelopePath), healedBytes);
    } finally {
      await f.cleanup();
    }
  });
});
