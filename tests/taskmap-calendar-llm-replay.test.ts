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
  TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME,
  TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
  loadCurrentTaskMapCalendarExtractionProof,
  loadVerifiedTaskMapCalendarExtractionReport,
  buildTaskMapCalendarSemanticFragment,
  refreshTaskMapCalendarExtraction,
  type TaskMapCalendarExtractionReportV1,
} from "../src/engine/taskmap/calendar-refresh-llm-replay.js";
import {
  buildTaskMapCalendarCandidateReview,
} from "../src/engine/taskmap/calendar-candidate-adapter.js";
import {
  buildTaskMapCalendarExtractionSegments,
  renderTaskMapCalendarMentionPrompt,
} from "../src/engine/taskmap/calendar-extraction.js";
import {
  TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
  buildTaskMapLocalCalendarExport,
  loadTaskMapCalendarProducerResult,
  taskMapCalendarFieldDigest,
  taskMapLocalCalendarExportCanonicalJson,
  type TaskMapCalendarEventV1,
  type TaskMapCalendarProducerResultV1,
} from "../src/engine/taskmap/calendar-producer-freshness.js";
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
  assertTaskMapNativeCandidateShelfV2,
} from "../src/engine/taskmap/native-candidate-review.js";
import {
  buildTaskMapNativeSemanticProjection,
} from "../src/engine/taskmap/native-semantic-builder-adapter.js";
import {
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const OWNER = taskMapContractDigest("calendar-replay-owner");
const PRODUCED_AT = "2026-08-07T19:00:00.000Z";
const ASSESSED_AT = "2026-08-07T20:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";

function event(index: number): TaskMapCalendarEventV1 {
  const startAt = new Date(
    Date.parse("2026-07-01T08:00:00.000Z") + index * 86_400_000,
  ).toISOString();
  const eventIdentityDigest = taskMapContractDigest(`calendar-replay-event-${index}`);
  const title = `Review calendar item ${index}`;
  const endAt = new Date(Date.parse(startAt) + 1_800_000).toISOString();
  return {
    eventIdentityDigest,
    crossProviderIdentityDigest: null,
    revisionDigest: taskMapCalendarFieldDigest(
      TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN,
      [eventIdentityDigest, title, startAt, endAt],
    ),
    title,
    startAt,
    endAt,
  };
}

async function fixture(eventCount = 1): Promise<{
  root: string;
  taskMapRoot: string;
  runtimeRoot: string;
  promptTemplatePath: string;
  localExportPath: string;
  googleSnapshotPath: string;
  result: TaskMapCalendarProducerResultV1;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(
    path.join(tmpdir(), "taskmap-calendar-replay-"),
  );
  const taskMapRoot = path.join(root, "taskmap");
  const runtimeRoot = path.join(root, "runtime");
  const promptTemplatePath = path.join(root, "calendar-extraction-v1.md");
  const localExportPath = path.join(root, "calendar-export.json");
  const googleSnapshotPath = path.join(root, "calendar-google.json");
  await mkdir(taskMapRoot, { mode: 0o700 });
  await mkdir(runtimeRoot, { mode: 0o700 });
  await writeFile(promptTemplatePath, TEMPLATE, { mode: 0o600 });
  const local = buildTaskMapLocalCalendarExport({
    ownerScopeDigest: OWNER,
    producedAt: PRODUCED_AT,
    events: Array.from({ length: eventCount }, (_, index) => event(index)),
  });
  await writeFile(
    localExportPath,
    taskMapLocalCalendarExportCanonicalJson(local),
    { mode: 0o600 },
  );
  const result = await loadTaskMapCalendarProducerResult({
    localExportPath,
    googleSnapshotPath,
    assessedAt: ASSESSED_AT,
    expectedOwnerScopeDigest: OWNER,
  });
  assert.equal(result.availability, "available");
  return {
    root,
    taskMapRoot,
    runtimeRoot,
    promptTemplatePath,
    localExportPath,
    googleSnapshotPath,
    result,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function outputFor(promptText: string): string {
  const match = /Review calendar item \d+/.exec(promptText);
  const text = match?.[0] ?? "Review calendar item 0";
  return JSON.stringify({
    mentions: [{
      text,
      title: text,
      class: "other",
      actor: "unknown",
      confidence: 0.83,
    }],
  });
}

function stationFactory(
  calls: { factory: number; run: string[] },
  output: (promptText: string) => string,
  transport: LlmProviderId = "claude-cli",
): TaskMapLlmStationFactory {
  return async () => {
    calls.factory += 1;
    const station: LlmStation = {
      provider: {
        transport,
        executable: transport === "gemini-remote" ? "" : "/private/provider",
        args: [],
        model: "calendar-test-model",
      },
      async run(request): Promise<LlmStationEnvelope> {
        calls.run.push(request.promptText);
        return {
          stationId: "mention-extraction-v1",
          model: "calendar-test-model",
          promptDigest: taskMapContractDigest(request.promptText),
          inputDigest: request.inputDigest,
          outputJson: output(request.promptText),
          producedAt: ASSESSED_AT,
          transport,
        };
      },
    };
    return station;
  };
}

function realStationFactory(
  output: (promptText: string) => string,
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
          result: output(request.stdin),
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
): Promise<TaskMapCalendarExtractionReportV1> {
  return refreshTaskMapCalendarExtraction({
    result: f.result,
    taskMapRoot: f.taskMapRoot,
    runtimeRoot: f.runtimeRoot,
    ownerScopeDigest: OWNER,
    promptTemplatePath: f.promptTemplatePath,
    assessedAt: ASSESSED_AT,
    createStation,
  });
}

describe("Task Map calendar Station-1 extraction replay", () => {
  it("records and byte-identically replays a Gemini calendar envelope", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    const rawOutput = ' {"mentions":[{"text":"Review calendar item 0",'
      + '"title":"Review calendar item 0","class":"other",'
      + '"actor":"unknown","confidence":0.83}]} ';
    try {
      const report = await refresh(
        f,
        stationFactory(calls, () => rawOutput, "gemini-remote"),
      );
      assert.equal(report.segments[0]?.envelopeTransport, "gemini-remote");
      const segment = buildTaskMapCalendarExtractionSegments(f.result.events)[0]!;
      const rendered = renderTaskMapCalendarMentionPrompt(TEMPLATE, segment.body);
      const envelope = await loadEnvelope(
        f.taskMapRoot,
        rendered,
        segment.body,
        TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
      );
      assert.equal(envelope?.transport, "gemini-remote");
      assert.equal(envelope?.outputJson, rawOutput);

      const replayed = await refresh(f, async () => {
        assert.fail("Gemini calendar replay must not recreate the station");
      });
      assert.deepEqual(replayed, report);
    } finally {
      await f.cleanup();
    }
  });

  it("returns null when the current calendar extraction report is absent", async () => {
    const f = await fixture();
    try {
      assert.equal(await loadCurrentTaskMapCalendarExtractionProof({
        localExportPath: f.localExportPath,
        googleSnapshotPath: f.googleSnapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        currentAssessedAt: ASSESSED_AT,
      }), null);
    } finally {
      await f.cleanup();
    }
  });

  it("reconstructs the exact assessed producer result for a later authenticated load", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, outputFor));
      const proof = await loadCurrentTaskMapCalendarExtractionProof({
        localExportPath: f.localExportPath,
        googleSnapshotPath: f.googleSnapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        currentAssessedAt: "2026-08-07T21:00:00.000Z",
      });

      assert.ok(proof);
      assert.equal(proof.result.assessedAt, ASSESSED_AT);
      assert.equal(proof.result.resultDigest, f.result.resultDigest);
      assert.equal(proof.extraction.reportDigest, report.reportDigest);
      assert.equal(await loadCurrentTaskMapCalendarExtractionProof({
        localExportPath: f.localExportPath,
        googleSnapshotPath: f.googleSnapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        currentAssessedAt: "2026-08-08T00:00:00.001Z",
      }), null);
    } finally {
      await f.cleanup();
    }
  });

  it("persists namespaced envelopes and gate-derived calendar mentions", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, outputFor));
      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, 1);
      assert.equal(report.pendingCount, 0);
      assert.equal(report.segments[0]?.status, "extracted");
      assert.equal(report.segments[0]?.mentions[0]?.speechActClass, "other");
      assert.equal(report.segments[0]?.mentions[0]?.proposalDisposition, "candidate_only");
      assert.equal(report.segments[0]?.mentions[0]?.promotionEligible, false);
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        report.segments[0]!.inputDigest,
        TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
      );
      assert.equal((await lstat(envelopePath)).mode & 0o777, 0o600);
    } finally {
      await f.cleanup();
    }
  });

  it("extracts JSON-fenced and bare-fenced calendar segments through the real station with canonical envelopes", async () => {
    const f = await fixture(25);
    try {
      const report = await refresh(f, realStationFactory((promptText) => {
        const output = outputFor(promptText);
        return promptText.includes("Review calendar item 0")
          ? "```json\n" + output + "\n```"
          : "```\n" + output + "\n```";
      }));

      assert.equal(report.pendingCount, 0);
      assert.equal(report.segments.length, 2);
      for (const row of report.segments) {
        assert.equal(row.status, "extracted");
        assert.equal(row.degradationCode, null);
        assert.match(row.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
      }

      const segments = buildTaskMapCalendarExtractionSegments(f.result.events);
      for (const segment of segments) {
        const rendered = renderTaskMapCalendarMentionPrompt(TEMPLATE, segment.body);
        const envelope = await loadEnvelope(
          f.taskMapRoot,
          rendered,
          segment.body,
          TASKMAP_CALENDAR_ENVELOPE_NAMESPACE,
        );
        assert.equal(envelope?.outputJson, outputFor(rendered.promptText));
      }
    } finally {
      await f.cleanup();
    }
  });

  it("accepts gemini-remote in calendar envelope and report contracts", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(
        f,
        stationFactory(calls, outputFor, "gemini-remote"),
      );
      assert.equal(report.segments[0]?.envelopeTransport, "gemini-remote");
      const reloaded = await loadVerifiedTaskMapCalendarExtractionReport({
        result: f.result,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.equal(reloaded?.segments[0]?.envelopeTransport, "gemini-remote");
    } finally {
      await f.cleanup();
    }
  });

  it("folds duplicate segment mention identities before shelf and projection construction", async () => {
    const f = await fixture(25);
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, () =>
        JSON.stringify({
          mentions: [
            {
              text: "Review calendar item",
              title: "Lower-confidence other request",
              class: "request",
              actor: "other",
              confidence: 0.7,
            },
            {
              text: "Review calendar item",
              title: "Higher-confidence self request",
              class: "request",
              actor: "self",
              confidence: 0.9,
            },
            {
              text: "Review calendar item",
              title: "Later tied request",
              class: "request",
              actor: "other",
              confidence: 0.9,
            },
          ],
        })
      ));

      assert.equal(report.pendingCount, 0, JSON.stringify(report));
      const mentions = report.segments[0]!.mentions;
      assert.equal(mentions.length, 1);
      assert.equal(mentions[0]?.title, "Higher-confidence self request");
      assert.equal(mentions[0]?.speechActActor, "self");
      assert.equal(mentions[0]?.confidence, 0.9);
      assert.equal(mentions[0]?.promotionEligible, false);

      const review = buildTaskMapCalendarCandidateReview({
        result: f.result,
        extraction: report,
        previous: null,
        expectedOwnerScopeDigest: OWNER,
        assessedAt: ASSESSED_AT,
      });
      assert.equal(review.shelf.candidates.length, 1);
      assert.equal(review.shelf.candidates[0]?.promotionEligible, false);
      assertTaskMapNativeCandidateShelfV2(review.shelf);

      const fragment = buildTaskMapCalendarSemanticFragment(f.result, report);
      assert.equal(fragment.taskMapInput.events.length, 25);
      const projection = buildTaskMapNativeSemanticProjection({
        contractVersion: "taskmap-native-semantic-builder-input.v1",
        ownerScopeDigest: OWNER,
        producer: {
          id: "taskmap-meeting-producer-result.v1",
          version: "taskmap-meeting-producer.1",
        },
        freshness: {
          decision: "fresh",
          available: true,
          retainedLastGood: false,
          producedAt: ASSESSED_AT,
          validThrough: "2026-08-08T00:00:00.000Z",
          assessedAt: ASSESSED_AT,
        },
        sourceBindings: fragment.sourceBindings,
        evidenceBindings: fragment.evidenceBindings,
        taskMapInput: fragment.taskMapInput,
      });
      assert.equal(projection.tasks.length, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("rejects persisted segment rows with duplicate mention identities", async () => {
    const f = await fixture();
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refresh(f, stationFactory(calls, outputFor));
      const reportPath = path.join(
        f.runtimeRoot,
        TASKMAP_CALENDAR_EXTRACTION_REPORT_FILENAME,
      );
      const tampered = JSON.parse(
        await readFile(reportPath, "utf8"),
      ) as TaskMapCalendarExtractionReportV1;
      tampered.segments[0]!.mentions.push({
        ...tampered.segments[0]!.mentions[0]!,
      });
      const { reportDigest: _oldDigest, ...payload } = tampered;
      tampered.reportDigest = taskMapContractDigest(payload);
      await writeFile(reportPath, JSON.stringify(tampered), { mode: 0o600 });

      await assert.rejects(
        loadVerifiedTaskMapCalendarExtractionReport({
          result: f.result,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        (error: unknown) => {
          assert.equal(
            (error as { code?: string }).code,
            "calendar_extraction_report_malformed",
          );
          return true;
        },
      );
    } finally {
      await f.cleanup();
    }
  });

  it("replays unchanged results with zero station calls and identical report identity", async () => {
    const f = await fixture();
    const firstCalls = { factory: 0, run: [] as string[] };
    try {
      const first = await refresh(f, stationFactory(firstCalls, outputFor));
      const replayCalls = { factory: 0, run: [] as string[] };
      const replayed = await refresh(f, stationFactory(replayCalls, outputFor));
      assert.equal(replayCalls.factory, 0);
      assert.equal(replayCalls.run.length, 0);
      assert.equal(replayed.reportDigest, first.reportDigest);
      assert.deepEqual(replayed, first);
    } finally {
      await f.cleanup();
    }
  });

  it("accounts all segments as pending after one no-provider selection failure", async () => {
    const f = await fixture(25);
    let factoryCalls = 0;
    try {
      const report = await refresh(f, async () => {
        factoryCalls += 1;
        throw new LlmStationUnavailableError("no_provider");
      });
      assert.equal(factoryCalls, 1);
      assert.equal(report.segments.length, 2);
      assert.equal(report.pendingCount, 2);
      assert.ok(report.segments.every((row) =>
        row.status === "degraded"
        && row.degradationCode === "no_provider"
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
        degraded.segments[0]?.degradationCode,
        "remote_consent_required",
      );

      const calls = { factory: 0, run: [] as string[] };
      const recovered = await refresh(f, stationFactory(calls, outputFor));
      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, 1);
      assert.equal(recovered.pendingCount, 0);
      assert.equal(recovered.segments[0]?.status, "extracted");
    } finally {
      await f.cleanup();
    }
  });

  it("persists and reloads provider_rate_limited for every pending segment", async () => {
    const f = await fixture(25);
    try {
      const report = await refresh(f, async () => ({
        provider: {
          transport: "claude-cli",
          executable: "/private/provider",
          args: [],
          model: "calendar-test-model",
        },
        async run() {
          throw new LlmStationUnavailableError(
            "provider_rate_limited",
            "claude-cli",
          );
        },
      }));
      assert.ok(report.segments.every((row) =>
        row.status === "degraded"
        && row.degradationCode === "provider_rate_limited"
      ));

      const reloaded = await loadVerifiedTaskMapCalendarExtractionReport({
        result: f.result,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.ok(reloaded?.segments.every((row) =>
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
        refreshTaskMapCalendarExtraction({
          result: f.result,
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

  it("isolates malformed output to one segment and extracts the other", async () => {
    const f = await fixture(25);
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refresh(f, stationFactory(calls, (promptText) =>
        promptText.includes("Review calendar item 0") ? "not-json" : outputFor(promptText)
      ));
      assert.equal(calls.run.length, 2);
      assert.equal(report.pendingCount, 1);
      assert.equal(report.segments[0]?.degradationCode, "invalid_extraction_output");
      assert.equal(report.segments[1]?.status, "extracted");
    } finally {
      await f.cleanup();
    }
  });

  it("backfills pending segments when the station recovers", async () => {
    const f = await fixture();
    try {
      const degraded = await refresh(f, async () => {
        throw new LlmStationUnavailableError("no_provider");
      });
      assert.equal(degraded.pendingCount, 1);
      const calls = { factory: 0, run: [] as string[] };
      const recovered = await refresh(f, stationFactory(calls, outputFor));
      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, 1);
      assert.equal(recovered.pendingCount, 0);
      assert.equal(recovered.segments[0]?.status, "extracted");
    } finally {
      await f.cleanup();
    }
  });

  it("maps station timeout to provider_timeout pending state", async () => {
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
      assert.equal(report.segments[0]?.degradationCode, "provider_timeout");
    } finally {
      await f.cleanup();
    }
  });
});
