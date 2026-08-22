import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME,
  TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES,
  TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES,
  TaskMapMeetingExtractionUnavailableError,
  buildTaskMapGranolaSemanticFragment,
  buildTaskMapRawGranolaCandidateShelf,
  buildTaskMapUnifiedMeetingCandidateContext,
  buildTaskMapUnifiedMeetingCandidateRows,
  loadEnvelope,
  loadVerifiedTaskMapGranolaExtractionReport,
  readAuthenticatedTaskMapGranolaSnapshot,
  refreshTaskMapGranolaMeetingExtraction,
  renderTaskMapMentionExtractionPrompt,
  taskMapMentionExtractionEnvelopePath,
  type TaskMapLlmStationFactory,
} from "../src/engine/taskmap/meeting-refresh-llm-replay.js";
import {
  promoteTaskMapVerifiedMeetingCandidate,
} from "../src/engine/taskmap/native-candidate-acceptance.js";
import {
  buildTaskMapNativeCandidateReviewFromProofRows,
} from "../src/engine/taskmap/native-candidate-review.js";
import {
  LlmStationUnavailableError,
  createLlmStation,
  type LlmStation,
  type LlmStationEnvelope,
  type LlmProviderId,
} from "../src/engine/taskmap/llm-station.js";
import {
  TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
} from "../src/engine/taskmap/meeting-producer-freshness.js";
import {
  taskMapContractCanonicalJson,
  taskMapContractDigest,
} from "../src/engine/taskmap/source-contracts.js";

const OWNER = taskMapContractDigest("owner-task-7");
const ASSESSED_AT = "2026-08-03T12:00:00.000Z";
const TEMPLATE = "Return strict JSON only.\n";

function note(
  id: string,
  body: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    source: "granola",
    source_ref: id,
    title: "Planning",
    created_at: "2026-08-03T09:00:00.000Z",
    occurred_at: "2026-08-03T09:00:00.000Z",
    participants: ["Owner"],
    summary: body,
    body,
    transcript: [],
    topics: [],
    ...overrides,
  };
}

function extraction(text: string, title = "Ship the replay lane"): string {
  return JSON.stringify({
    mentions: [{
      class: "commitment",
      actor: "self",
      text,
      title,
      confidence: 0.91,
    }],
  });
}

async function fixture(
  rows: readonly Record<string, unknown>[],
): Promise<{
  root: string;
  snapshotPath: string;
  taskMapRoot: string;
  runtimeRoot: string;
  promptTemplatePath: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "taskmap-task7-"));
  const snapshotPath = path.join(root, "granola-mcp-snapshot.json");
  const taskMapRoot = path.join(root, "taskmap");
  const runtimeRoot = path.join(root, "runtime");
  const promptTemplatePath = path.join(root, "mention-extraction-v1.md");
  await mkdir(taskMapRoot, { mode: 0o700 });
  await mkdir(runtimeRoot, { mode: 0o700 });
  await writeFile(
    snapshotPath,
    JSON.stringify({ events: [], meeting_notes: rows }),
    { mode: 0o600 },
  );
  await writeFile(promptTemplatePath, TEMPLATE, { mode: 0o600 });
  return {
    root,
    snapshotPath,
    taskMapRoot,
    runtimeRoot,
    promptTemplatePath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function rewriteExtractionReport(
  runtimeRoot: string,
  mutate: (report: Record<string, unknown>) => void,
): Promise<void> {
  const reportPath = path.join(
    runtimeRoot,
    TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME,
  );
  const report = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, unknown>;
  mutate(report);
  delete report.reportDigest;
  report.reportDigest = taskMapContractDigest(report);
  await writeFile(reportPath, taskMapContractCanonicalJson(report), { mode: 0o600 });
}

function stationFactory(
  calls: { factory: number; run: string[] },
  outputFor: (stdin: string) => string,
  transport: LlmProviderId = "claude-cli",
): TaskMapLlmStationFactory {
  return async () => {
    calls.factory += 1;
    const station: LlmStation = {
      provider: {
        transport,
        executable: transport === "gemini-remote" ? "" : "/private/provider",
        args: [],
        model: "private-model",
      },
      async run(request): Promise<LlmStationEnvelope> {
        calls.run.push(request.promptText);
        return {
          stationId: "mention-extraction-v1",
          model: "private-model",
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

describe("Task Map production Granola extraction replay", () => {
  it("records and byte-identically replays a Gemini meeting envelope", async () => {
    const body = "I will ship the Gemini replay lane.";
    const rawOutput = " " + extraction(body) + " ";
    const f = await fixture([note("gemini-note", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => rawOutput, "gemini-remote"),
      });
      assert.equal(report.notes[0]?.status, "extracted");
      const rendered = renderTaskMapMentionExtractionPrompt(TEMPLATE, body);
      const envelope = await loadEnvelope(f.taskMapRoot, rendered, body);
      assert.equal(envelope?.transport, "gemini-remote");
      assert.equal(envelope?.outputJson, rawOutput);

      const replayed = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          assert.fail("Gemini meeting replay must not recreate the station");
        },
      });
      assert.deepEqual(replayed, report);
    } finally {
      await f.cleanup();
    }
  });

  it("authenticates and parses only the exact bounded raw export shape", async () => {
    const body = "I will ship the replay lane.";
    const f = await fixture([note("raw-note-1", body)]);
    try {
      const parsed = await readAuthenticatedTaskMapGranolaSnapshot({
        snapshotPath: f.snapshotPath,
      });
      assert.equal(parsed.notes.length, 1);
      assert.equal(parsed.notes[0]?.body, body);
      assert.equal(parsed.notes[0]?.occurredAt, "2026-08-03T09:00:00.000Z");
      assert.match(parsed.notes[0]!.sourceIdentityDigest, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(parsed).includes("raw-note-1"), false);

      await writeFile(
        f.snapshotPath,
        JSON.stringify({ events: [], meeting_notes: [note("x", body)], extra: true }),
        { mode: 0o600 },
      );
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        (error) => error instanceof TaskMapMeetingExtractionUnavailableError
          && error.code === "raw_snapshot_malformed",
      );
      await writeFile(
        f.snapshotPath,
        JSON.stringify({ events: [], meeting_notes: Array.from({ length: 65 }, (_, index) => note(`n-${index}`, body)) }),
        { mode: 0o600 },
      );
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        (error) => error instanceof TaskMapMeetingExtractionUnavailableError
          && error.code === "raw_snapshot_limit_exceeded",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("fails closed on mode, symlink, hardlink, and file-size violations", async () => {
    const f = await fixture([note("raw-note-1", "I will ship it.")]);
    try {
      await chmod(f.snapshotPath, 0o644);
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        /unavailable/,
      );
      await chmod(f.snapshotPath, 0o600);
      const hardlinkPath = path.join(f.root, "snapshot-hardlink.json");
      await link(f.snapshotPath, hardlinkPath);
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        /unavailable/,
      );
      await rm(hardlinkPath);
      const target = path.join(f.root, "snapshot-target.json");
      await writeFile(target, JSON.stringify({ events: [], meeting_notes: [] }), { mode: 0o600 });
      const linked = path.join(f.root, "snapshot-symlink.json");
      await symlink(target, linked);
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: linked }),
        /unavailable/,
      );
      await writeFile(f.snapshotPath, Buffer.alloc(TASKMAP_GRANOLA_SNAPSHOT_MAX_BYTES + 1), { mode: 0o600 });
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        /unavailable/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("fails authenticated reads on controlled chmod and same-inode restore races", async () => {
    for (const race of ["chmod", "mutate_restore_mtime"] as const) {
      const f = await fixture([
        note(`authenticated-race-${race}`, "I will ship the authenticated reader."),
      ]);
      try {
        const initial = await lstat(f.snapshotPath);
        await assert.rejects(
          readAuthenticatedTaskMapGranolaSnapshot({
            snapshotPath: f.snapshotPath,
            afterAuthenticatedReadForTesting: async () => {
              if (race === "chmod") {
                await chmod(f.snapshotPath, 0o644);
                return;
              }
              const bytes = await readFile(f.snapshotPath);
              bytes[0] = bytes[0] === 0x7b ? 0x5b : 0x7b;
              await writeFile(f.snapshotPath, bytes, { mode: 0o600 });
              await utimes(f.snapshotPath, initial.atime, initial.mtime);
            },
          }),
          /unavailable|replaced|metadata/,
        );
      } finally {
        await f.cleanup();
      }
    }
  });

  it("binds complete prompt stdin, independent body input, and template bytes", () => {
    const body = "I will ship the replay lane.";
    const rendered = renderTaskMapMentionExtractionPrompt(TEMPLATE, body);
    assert.equal(rendered.inputDigest, taskMapContractDigest(body));
    assert.equal(rendered.promptTemplateDigest, taskMapContractDigest(TEMPLATE));
    assert.equal(rendered.promptDigest, taskMapContractDigest(rendered.promptText));
    assert.ok(rendered.promptText.startsWith(TEMPLATE));
    assert.ok(rendered.promptText.endsWith(body + "\n<<<END_UNTRUSTED_MEETING_NOTE_V1>>>\n"));
  });

  it("extracts fenced model output in all three fence states through the real station", async () => {
    const bodies = [
      "I will ship the fenced-json lane.",
      "I will ship the bare-fence lane.",
      "I will ship the unfenced lane.",
    ];
    const f = await fixture([
      note("fence-note-1", bodies[0]!),
      note("fence-note-2", bodies[1]!),
      note("fence-note-3", bodies[2]!),
    ]);
    const wrap = (promptText: string): string => {
      if (promptText.includes(bodies[0]!)) {
        return "```json\n" + extraction(bodies[0]!) + "\n```";
      }
      if (promptText.includes(bodies[1]!)) {
        return "```\n" + extraction(bodies[1]!) + "\n```";
      }
      return extraction(bodies[2]!);
    };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: realStationFactory(wrap),
      });
      assert.equal(report.notes.length, 3);
      for (const row of report.notes) {
        assert.equal(row.status, "extracted");
        assert.equal(row.degradationCode, null);
        assert.match(row.envelopeDigest ?? "", /^[a-f0-9]{64}$/);
      }
      for (const body of bodies) {
        const rendered = renderTaskMapMentionExtractionPrompt(TEMPLATE, body);
        const envelope = await loadEnvelope(f.taskMapRoot, rendered, body);
        assert.equal(envelope?.outputJson, extraction(body));
      }
    } finally {
      await f.cleanup();
    }
  });

  it("accepts and replays a canonical gemini-remote envelope", async () => {
    const body = "I will ship the remote replay lane.";
    const f = await fixture([note("remote-note", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(
          calls,
          () => extraction(body),
          "gemini-remote",
        ),
      });
      const rendered = renderTaskMapMentionExtractionPrompt(TEMPLATE, body);
      const envelope = await loadEnvelope(f.taskMapRoot, rendered, body);
      assert.equal(envelope?.transport, "gemini-remote");
      assert.equal(calls.run.length, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("durably records misses, then replays all hits with zero provider detection or calls", async () => {
    const body = "I will ship the replay lane.";
    const f = await fixture([note("raw-note-1", body), note("raw-note-2", body)]);
    const first = { factory: 0, run: [] as string[] };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(first, () => extraction(body)),
      });
      assert.equal(first.factory, 1);
      assert.equal(first.run.length, 1, "identical bodies share one envelope");
      assert.equal(report.notes.length, 2);
      assert.ok(report.notes.every((row) => row.status === "extracted"));
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        taskMapContractDigest(body),
      );
      assert.equal((await lstat(envelopePath)).mode & 0o777, 0o600);

      const replay = { factory: 0, run: [] as string[] };
      const replayed = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          replay.factory += 1;
          throw new Error("must not detect a provider for all-hit replay");
        },
      });
      assert.equal(replay.factory, 0);
      assert.deepEqual(replayed.notes, report.notes);
    } finally {
      await f.cleanup();
    }
  });

  it("selects once for multiple misses and degrades one failed note without stopping later notes", async () => {
    const bodies = [
      "Agenda A. I will ship A. Closing A.",
      "Agenda B. I will ship B. Closing B.",
      "Agenda C. I will ship C. Closing C.",
    ];
    const f = await fixture(bodies.map((body, index) => note(`raw-${index}`, body)));
    let runIndex = 0;
    const calls = { factory: 0, run: [] as string[] };
    try {
      const createStation: TaskMapLlmStationFactory = async () => {
        calls.factory += 1;
        return {
          provider: { transport: "codex-cli", executable: "/private/codex", args: [], model: "default" },
          async run(request) {
            calls.run.push(request.promptText);
            const body = bodies.find((candidate) => request.promptText.includes(candidate))!;
            runIndex += 1;
            if (body === bodies[1]) {
              throw new LlmStationUnavailableError("timeout", "codex-cli");
            }
            return {
              stationId: "mention-extraction-v1",
              model: "default",
              promptDigest: taskMapContractDigest(request.promptText),
              inputDigest: request.inputDigest,
              outputJson: extraction(
                body.match(/I will ship [ABC]\./)![0],
                `Ship item ${runIndex}`,
              ),
              producedAt: ASSESSED_AT,
              transport: "codex-cli",
            };
          },
        };
      };
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation,
      });
      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, 3);
      assert.deepEqual(report.notes.map((row) => row.status), ["extracted", "degraded", "extracted"]);
      assert.ok(report.notes.some((row) => row.degradationCode === "provider_timeout"));
      const bytes = await readFile(path.join(f.runtimeRoot, TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME), "utf8");
      assert.equal(bytes.includes("private provider stderr"), false);
      assert.equal(bytes.includes("/Users/owner"), false);
      assert.equal(bytes.includes(bodies[0]!), false);
    } finally {
      await f.cleanup();
    }
  });

  it("degrades all misses after one unavailable selection attempt", async () => {
    const f = await fixture([note("raw-a", "I will ship A."), note("raw-b", "I will ship B.")]);
    let factoryCalls = 0;
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          factoryCalls += 1;
          throw new LlmStationUnavailableError("no_provider");
        },
      });
      assert.equal(factoryCalls, 1);
      assert.ok(report.notes.every((row) => row.degradationCode === "no_provider"));
      assert.equal(JSON.stringify(report).includes("/Users/owner"), false);
    } finally {
      await f.cleanup();
    }
  });

  it("maps unauthenticated station selection once and strictly reloads the stable code", async () => {
    const f = await fixture([
      note("auth-a", "I will ship authenticated A."),
      note("auth-b", "I will ship authenticated B."),
    ]);
    let factoryCalls = 0;
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          factoryCalls += 1;
          throw new LlmStationUnavailableError(
            "provider_unauthenticated",
            "claude-cli",
          );
        },
      });
      assert.equal(factoryCalls, 1);
      assert.ok(report.notes.every((row) => (
        row.degradationCode === "provider_unauthenticated"
      )));

      const reloaded = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.ok(reloaded.notes.every((row) => (
        row.degradationCode === "provider_unauthenticated"
      )));
    } finally {
      await f.cleanup();
    }
  });

  it("persists remote-consent-required notes and retries them after consent", async () => {
    const body = "I will ship after approving remote AI.";
    const f = await fixture([note("consent-a", body)]);
    try {
      const degraded = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          throw new LlmStationUnavailableError("remote_consent_required");
        },
      });
      assert.equal(
        degraded.notes[0]?.degradationCode,
        "remote_consent_required",
      );
      assert.equal(degraded.notes[0]?.status, "degraded");

      const calls = { factory: 0, run: [] as string[] };
      const recovered = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      assert.equal(calls.factory, 1);
      assert.equal(calls.run.length, 1);
      assert.equal(recovered.notes[0]?.status, "extracted");
      assert.equal(recovered.notes[0]?.degradationCode, null);
    } finally {
      await f.cleanup();
    }
  });

  it("maps rate-limited station responses and strictly reloads the stable code", async () => {
    const f = await fixture([
      note("limit-a", "I will ship rate-limited A."),
      note("limit-b", "I will ship rate-limited B."),
    ]);
    let factoryCalls = 0;
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: async () => {
          factoryCalls += 1;
          throw new LlmStationUnavailableError(
            "provider_rate_limited",
            "claude-cli",
          );
        },
      });
      assert.equal(factoryCalls, 1);
      assert.ok(report.notes.every((row) =>
        row.degradationCode === "provider_rate_limited"
      ));

      const reloaded = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.ok(reloaded.notes.every((row) =>
        row.degradationCode === "provider_rate_limited"
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("never overwrites a tampered envelope and rejects stale reports", async () => {
    const body = "I will ship the replay lane.";
    const f = await fixture([note("raw-note-1", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      const envelopePath = taskMapMentionExtractionEnvelopePath(f.taskMapRoot, taskMapContractDigest(body));
      const tampered = JSON.parse(await readFile(envelopePath, "utf8"));
      tampered.promptDigest = taskMapContractDigest("tampered");
      await writeFile(envelopePath, taskMapContractCanonicalJson(tampered), { mode: 0o600 });
      await assert.rejects(
        refreshTaskMapGranolaMeetingExtraction({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
          assessedAt: ASSESSED_AT,
          createStation: stationFactory(calls, () => extraction(body)),
        }),
        /unavailable/,
      );
      assert.equal(JSON.parse(await readFile(envelopePath, "utf8")).promptDigest, tampered.promptDigest);

      await rm(envelopePath);
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      await writeFile(
        f.snapshotPath,
        JSON.stringify({ events: [], meeting_notes: [note("raw-note-2", "I will ship changed input.")] }),
        { mode: 0o600 },
      );
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /unavailable/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("rehydrates only proposal/context semantic fragments and proof-bound raw shelf rows", async () => {
    const body = "Agenda chatter before the obligation. I will ship the replay lane. Closing chatter.";
    const mention = "I will ship the replay lane.";
    const f = await fixture([note("raw-note-1", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(mention)),
      });
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      const fragment = buildTaskMapGranolaSemanticFragment(verified);
      assert.ok(fragment.taskMapInput.pointers.every((pointer) =>
        pointer.sourceKind === "granola"
        && pointer.authority === "none"
        && pointer.syncMode === "reference_only"
        && pointer.capabilities.includes("read_context")
      ));
      assert.ok(fragment.evidenceBindings.every((binding) =>
        binding.disposition === "candidate_only"
        || binding.disposition === "context_only"
      ));
      assert.ok(fragment.taskMapInput.events.every((event) => event.recordKind === "work_context"));
      assert.ok(fragment.sourceBindings.every((binding) =>
        binding.observedRevision === binding.evidenceRevision
        && binding.observedContentDigest === binding.evidenceContentDigest
      ));
      assert.ok(fragment.evidenceBindings.every((binding) =>
        binding.disposition !== "candidate_only"
        || binding.candidateIdentityRef?.startsWith("external:") === true
      ));
      assert.ok(fragment.taskMapInput.events.every((event) =>
        event.objectRefs.some((ref) => ref.startsWith("canonical-meeting:"))
      ));
      const shelf = buildTaskMapRawGranolaCandidateShelf(verified);
      assert.equal(shelf.candidates.length, 1);
      assert.equal(shelf.candidates[0]?.sourceKinds.join(","), "granola");
      assert.equal(shelf.candidates[0]?.promotionEligible, true);
      assert.equal(shelf.candidates[0]?.reviewState, "unreviewed");
      assert.equal(shelf.candidates[0]?.reviewedOnly, false);
      assert.match(shelf.candidates[0]!.candidateRevisionDigest, /^[a-f0-9]{64}$/);
      assert.match(shelf.candidates[0]!.evidenceProofDigests[0]!, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(verified).includes(body), false);

      const googleProof = taskMapContractDigest("google-proof");
      const google = {
        ...shelf.candidates[0]!,
        evidenceProofDigests: [googleProof],
        candidateRevisionDigest: taskMapContractDigest("google-revision"),
        sourceKinds: ["gemini_meet" as const],
      };
      assert.equal(
        buildTaskMapUnifiedMeetingCandidateRows({
          ownerScopeDigest: OWNER,
          googleCandidates: [google],
          rawReport: null,
          acceptanceStore: null,
        })[0],
        google,
        "Google-only rows remain byte/object exact",
      );
      const union = buildTaskMapUnifiedMeetingCandidateRows({
        ownerScopeDigest: OWNER,
        googleCandidates: [google],
        rawReport: verified,
        acceptanceStore: null,
      });
      assert.equal(union.length, 1);
      assert.deepEqual(union[0]?.sourceKinds, ["gemini_meet", "granola"]);
      assert.deepEqual(union[0]?.evidenceProofDigests, [
        googleProof,
        ...shelf.candidates[0]!.evidenceProofDigests,
      ].sort());
    } finally {
      await f.cleanup();
    }
  });

  it("treats an empty-evidence extracted row as no contribution and still builds the fragment", async () => {
    const emptyBody = "Weather chatter with nothing actionable in it.";
    const mentionBody = "Context. I will ship the mixed-report lane. Closing.";
    const mention = "I will ship the mixed-report lane.";
    const f = await fixture([
      note("mixed-empty-note", emptyBody),
      note("mixed-mention-note", mentionBody),
    ]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(
          calls,
          (promptText) => promptText.includes(mention)
            ? extraction(mention)
            : JSON.stringify({ mentions: [] }),
        ),
      });
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });

      // The zero-mention note is genuinely "extracted", not degraded: it passed
      // validation and simply produced no evidence.
      const emptyRows = verified.notes.filter((row) =>
        row.status === "extracted" && row.evidence.length === 0
      );
      assert.equal(emptyRows.length, 1);
      assert.equal(emptyRows[0]?.degradationCode, null);

      // The fragment builds, and every pointer comes from the non-empty row only.
      const fragment = buildTaskMapGranolaSemanticFragment(verified);
      assert.equal(fragment.taskMapInput.pointers.length, 1);
      assert.equal(fragment.sourceBindings.length, 1);
      const contributing = verified.notes.find((row) => row.evidence.length > 0)!;
      assert.equal(
        fragment.taskMapInput.pointers[0]?.sourceObjectId,
        contributing.sourceIdentityDigest,
      );
      assert.equal(
        fragment.sourceBindings[0]?.sourceIdentityDigest,
        contributing.sourceIdentityDigest,
      );
      assert.ok(fragment.taskMapInput.events.length > 0);
      assert.ok(fragment.taskMapInput.events.every((event) =>
        event.pointerId === fragment.taskMapInput.pointers[0]?.id
      ));
    } finally {
      await f.cleanup();
    }
  });

  it("still rejects non-empty evidence that lost its canonical meeting reference", async () => {
    const body = "Context. I will ship the tamper-guard lane. Closing.";
    const mention = "I will ship the tamper-guard lane.";
    const f = await fixture([note("tamper-guard-note", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(mention)),
      });
      await rewriteExtractionReport(f.runtimeRoot, (report) => {
        const notes = report.notes as Record<string, unknown>[];
        for (const row of notes) {
          const evidence = row.evidence as Record<string, unknown>[];
          for (const item of evidence) {
            item.objectRefs = (item.objectRefs as Record<string, unknown>[])
              .filter((ref) => ref.kind !== "canonical_meeting");
          }
        }
        // evidence stays non-empty — this is the "genuine tamper" shape, distinct
        // from the legitimate zero-mention shape Task 1 made benign.
        assert.ok(notes.every((row) =>
          (row.evidence as unknown[]).length > 0
        ));
      });
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        (error) => error instanceof TaskMapMeetingExtractionUnavailableError
          && error.code === "extraction_report_tampered",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("builds an empty, pointer-less fragment when every extracted row has no evidence", async () => {
    const f = await fixture([
      note("all-empty-note-1", "Scheduling small talk only."),
      note("all-empty-note-2", "More chatter, still nothing actionable."),
    ]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => JSON.stringify({ mentions: [] })),
      });
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.equal(verified.notes.length, 2);
      assert.ok(verified.notes.every((row) =>
        row.status === "extracted" && row.evidence.length === 0
      ));

      // Must not throw — this is the whole point of T1.
      const fragment = buildTaskMapGranolaSemanticFragment(verified);

      // The contract native-refresh-service.ts:7427 depends on: a pointer-less
      // fragment, which that guard declines to adopt, leaving rawGranolaFragment
      // null and the refresh free to publish the other sources.
      assert.equal(fragment.taskMapInput.pointers.length, 0);
      assert.equal(fragment.taskMapInput.events.length, 0);
      assert.equal(fragment.sourceBindings.length, 0);
      assert.equal(fragment.evidenceBindings.length, 0);
      assert.equal(fragment.ownerScopeDigest, OWNER);

      // The shelf path is likewise empty rather than broken.
      assert.equal(buildTaskMapRawGranolaCandidateShelf(verified).candidates.length, 0);
    } finally {
      await f.cleanup();
    }
  });

  it("rejects fabricated raw reports and recomputes the exact promotion proof", async () => {
    const body = "Context. I will ship the guarded proof lane. Closing.";
    const mention = "I will ship the guarded proof lane.";
    const f = await fixture([note("raw-proof-note", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(mention)),
      });
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      const row = buildTaskMapRawGranolaCandidateShelf(verified).candidates[0]!;
      const context = buildTaskMapUnifiedMeetingCandidateContext({
        ownerScopeDigest: OWNER,
        assessedAt: ASSESSED_AT,
        googleCandidates: [],
        googleResultDigest: null,
        googleSnapshotDigest: null,
        googleProducedAt: null,
        rawReport: verified,
      });
      const overlay = buildTaskMapNativeCandidateReviewFromProofRows({
        context,
        previous: null,
      });
      const input = {
        result: null,
        overlay,
        rawReport: verified,
        previousStore: null,
        expectedOwnerScopeDigest: OWNER,
        assessedAt: ASSESSED_AT,
        candidateId: row.candidateId,
        expectedCandidateRevisionDigest: row.candidateRevisionDigest,
        expectedStatementReferenceDigest: row.statementReferenceDigest,
        expectedEvidenceProofDigests: row.evidenceProofDigests,
        idempotencyKeyDigest: taskMapContractDigest("task7-proof-confirmation"),
        confirmedAt: ASSESSED_AT,
      };
      assert.equal(
        promoteTaskMapVerifiedMeetingCandidate(input).receipt.candidateId,
        row.candidateId,
      );
      assert.equal(Object.isFrozen(verified.notes), true);
      assert.equal(Object.isFrozen(verified.notes[0]!), true);
      assert.equal(Object.isFrozen(verified.notes[0]!.evidenceProofDigests), true);
      assert.equal(Object.isFrozen(verified.notes[0]!.evidence[0]!), true);
      assert.throws(() => {
        verified.notes[0]!.evidenceProofDigests[0] =
          taskMapContractDigest("nested-forged-proof");
      }, TypeError);
      const fabricated = JSON.parse(JSON.stringify(verified));
      assert.throws(
        () => promoteTaskMapVerifiedMeetingCandidate({
          ...input,
          rawReport: fabricated,
        }),
        /unverified_extraction_report/,
      );
      assert.throws(
        () => promoteTaskMapVerifiedMeetingCandidate({
          ...input,
          expectedEvidenceProofDigests: [taskMapContractDigest("fabricated-proof")],
        }),
        /exact current candidate proof/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("keeps raw candidate display and promotion receipt invariant to occurrence order", async () => {
    const mention = "I will ship the order-invariant candidate.";
    const alphaBody = `Alpha context. ${mention} Closing context.`;
    const betaBody = `Beta context. ${mention} Closing context.`;
    const alpha = note("raw-order-alpha", alphaBody, {
      created_at: "2026-08-03T09:00:00.000Z",
      occurred_at: "2026-08-03T08:00:00.000Z",
    });
    const beta = note("raw-order-beta", betaBody, {
      created_at: "2026-08-03T11:00:00.000Z",
      occurred_at: "2026-08-03T10:00:00.000Z",
    });
    const build = async (rows: readonly Record<string, unknown>[]) => {
      const f = await fixture(rows);
      const calls = { factory: 0, run: [] as string[] };
      try {
        const report = await refreshTaskMapGranolaMeetingExtraction({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
          assessedAt: ASSESSED_AT,
          createStation: stationFactory(calls, (prompt) => JSON.stringify({
            mentions: [{
              class: "commitment",
              actor: "self",
              text: mention,
              title: prompt.includes("Alpha context")
                ? "Alpha display title"
                : "Beta display title",
              confidence: prompt.includes("Alpha context") ? 0.81 : 0.94,
            }],
          })),
        });
        const row = buildTaskMapRawGranolaCandidateShelf(report).candidates[0]!;
        const context = buildTaskMapUnifiedMeetingCandidateContext({
          ownerScopeDigest: OWNER,
          assessedAt: ASSESSED_AT,
          googleCandidates: [],
          googleResultDigest: null,
          googleSnapshotDigest: null,
          googleProducedAt: null,
          rawReport: report,
        });
        const overlay = buildTaskMapNativeCandidateReviewFromProofRows({
          context,
          previous: null,
        });
        const receipt = promoteTaskMapVerifiedMeetingCandidate({
          result: null,
          overlay,
          rawReport: report,
          previousStore: null,
          expectedOwnerScopeDigest: OWNER,
          assessedAt: ASSESSED_AT,
          candidateId: row.candidateId,
          expectedCandidateRevisionDigest: row.candidateRevisionDigest,
          expectedStatementReferenceDigest: row.statementReferenceDigest,
          expectedEvidenceProofDigests: row.evidenceProofDigests,
          idempotencyKeyDigest: taskMapContractDigest(
            "task7-order-invariant-confirmation",
          ),
          confirmedAt: ASSESSED_AT,
        }).receipt;
        return {
          row: structuredClone(row),
          receipt: structuredClone(receipt),
        };
      } finally {
        await f.cleanup();
      }
    };

    const forward = await build([alpha, beta]);
    const reversed = await build([beta, alpha]);

    assert.equal(
      taskMapContractCanonicalJson(forward.row),
      taskMapContractCanonicalJson(reversed.row),
    );
    assert.equal(
      taskMapContractCanonicalJson(forward.receipt),
      taskMapContractCanonicalJson(reversed.receipt),
    );
    assert.equal(forward.receipt.accepted.title, forward.row.title);
  });

  it("rejects invalid UTF-8, duplicate JSON keys, noncanonical time, and reversed chronology", async () => {
    const f = await fixture([note("strict-json-note", "I will ship strict JSON.")]);
    try {
      await writeFile(f.snapshotPath, Buffer.from([0xc3, 0x28]), { mode: 0o600 });
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        (error) => error instanceof TaskMapMeetingExtractionUnavailableError
          && error.code === "raw_snapshot_malformed",
      );
      await writeFile(
        f.snapshotPath,
        '{"events":[],"events":[],"meeting_notes":[]}',
        { mode: 0o600 },
      );
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        (error) => error instanceof TaskMapMeetingExtractionUnavailableError
          && error.code === "raw_snapshot_malformed",
      );
      await writeFile(
        f.snapshotPath,
        JSON.stringify({
          events: [],
          meeting_notes: [note("strict-json-note", "I will ship strict JSON.", {
            created_at: "2026-02-30T09:00:00.000Z",
          })],
        }),
        { mode: 0o600 },
      );
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        /invalid_note_contract/,
      );
      await writeFile(
        f.snapshotPath,
        JSON.stringify({
          events: [],
          meeting_notes: [note("strict-json-note", "I will ship strict JSON.", {
            created_at: "2026-08-03T09:00:00.000Z",
            occurred_at: "2026-08-03T10:00:00.000Z",
          })],
        }),
        { mode: 0o600 },
      );
      await assert.rejects(
        readAuthenticatedTaskMapGranolaSnapshot({ snapshotPath: f.snapshotPath }),
        /invalid_note_contract/,
      );
      await writeFile(
        f.snapshotPath,
        JSON.stringify({
          events: [],
          meeting_notes: [note("strict-json-note", "I will ship strict JSON.", {
            created_at: "2026-08-03T10:00:00+01:00",
            occurred_at: "2026-08-03",
          })],
        }),
        { mode: 0o600 },
      );
      const normalized = await readAuthenticatedTaskMapGranolaSnapshot({
        snapshotPath: f.snapshotPath,
      });
      assert.equal(normalized.notes[0]?.createdAt, "2026-08-03T09:00:00.000Z");
      assert.equal(normalized.notes[0]?.occurredAt, "2026-08-03T00:00:00.000Z");
    } finally {
      await f.cleanup();
    }
  });

  it("validates every persisted report row matrix and exact source identity set", async () => {
    const f = await fixture([
      note("matrix-a", "I will ship matrix A."),
      note("matrix-b", "I will ship matrix B."),
    ]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, (prompt) =>
          extraction(prompt.includes("matrix A") ? "I will ship matrix A." : "I will ship matrix B.")),
      });
      await rewriteExtractionReport(f.runtimeRoot, (report) => {
        const rows = report.notes as Array<Record<string, unknown>>;
        rows[1] = structuredClone(rows[0]!);
      });
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /stale|tampered|malformed/,
      );

      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction("I will ship matrix A.")),
      });
      await rewriteExtractionReport(f.runtimeRoot, (report) => {
        const row = (report.notes as Array<Record<string, unknown>>)[0]!;
        row.status = "degraded";
        row.degradationCode = "private_provider_diagnostic";
      });
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /malformed|tampered/,
      );

      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction("I will ship matrix A.")),
      });
      await rewriteExtractionReport(f.runtimeRoot, (report) => {
        const row = (report.notes as Array<Record<string, unknown>>)[0]!;
        row.occurredAt = "2026-08-03T08:58:00.000Z";
        row.observedAt = "2026-08-03T09:01:00.000Z";
      });
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /stale|tampered/,
        "report source timestamps must exactly match the authenticated note",
      );
    } finally {
      await f.cleanup();
    }
  });

  it("rejects duplicate-key and invalid-UTF8 envelope/report persistence", async () => {
    const body = "I will ship strict persisted JSON.";
    const f = await fixture([note("strict-persisted", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        taskMapContractDigest(body),
      );
      const envelopeBytes = await readFile(envelopePath, "utf8");
      await writeFile(
        envelopePath,
        envelopeBytes.replace(
          '"stationId":',
          '"stationId":"mention-extraction-v1","stationId":',
        ),
        { mode: 0o600 },
      );
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /envelope_tampered/,
      );

      await rm(envelopePath);
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      const reportPath = path.join(
        f.runtimeRoot,
        TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME,
      );
      const reportBytes = await readFile(reportPath, "utf8");
      await writeFile(
        reportPath,
        reportBytes.replace(
          '"contractVersion":',
          '"contractVersion":"taskmap-meeting-extraction-report.v1","contractVersion":',
        ),
        { mode: 0o600 },
      );
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /extraction_report_malformed/,
      );
      await writeFile(reportPath, Buffer.from([0xc3, 0x28]), { mode: 0o600 });
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /extraction_report_malformed/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("rejects a raw snapshot swap before durable report readback", async () => {
    const body = "Context. I will ship the source barrier. Closing.";
    const f = await fixture([note("barrier-a", body)]);
    try {
      await assert.rejects(
        refreshTaskMapGranolaMeetingExtraction({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
          assessedAt: ASSESSED_AT,
          createStation: async () => ({
            provider: {
              transport: "codex-cli",
              executable: "/private/codex",
              args: [],
              model: "barrier-model",
            },
            async run(request) {
              await writeFile(
                f.snapshotPath,
                JSON.stringify({
                  events: [],
                  meeting_notes: [note("barrier-b", "I will ship changed bytes.")],
                }),
                { mode: 0o600 },
              );
              return {
                stationId: "mention-extraction-v1",
                model: "barrier-model",
                promptDigest: taskMapContractDigest(request.promptText),
                inputDigest: request.inputDigest,
                outputJson: extraction("I will ship the source barrier."),
                producedAt: ASSESSED_AT,
                transport: "codex-cli",
              };
            },
          }),
        }),
        /stale|unavailable/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("recovers an authenticated envelope hard-link crash phase", async () => {
    const body = "I will ship crash-safe envelopes.";
    const f = await fixture([note("envelope-crash", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(body)),
      });
      const envelopePath = taskMapMentionExtractionEnvelopePath(
        f.taskMapRoot,
        taskMapContractDigest(body),
      );
      const crashTemp = path.join(
        path.dirname(envelopePath),
        `.${path.basename(envelopePath)}.${"a".repeat(32)}.tmp`,
      );
      await link(envelopePath, crashTemp);
      assert.equal((await lstat(envelopePath)).nlink, 2);
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.equal(verified.notes[0]?.status, "extracted");
      assert.equal((await lstat(envelopePath)).nlink, 1);
      await assert.rejects(lstat(crashTemp), { code: "ENOENT" });
    } finally {
      await f.cleanup();
    }
  });

  it("uses maximum occurrence confidence as the deterministic representative", async () => {
    const mention = "I will ship the representative confidence lane.";
    const f = await fixture([
      note("confidence-low", `Low context. ${mention}`),
      note("confidence-high", `High context. ${mention}`),
    ]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, (prompt) => JSON.stringify({
          mentions: [{
            class: "commitment",
            actor: "self",
            text: mention,
            title: "Ship the representative confidence lane",
            confidence: prompt.includes("High context") ? 0.94 : 0.41,
          }],
        })),
      });
      const verified = await loadVerifiedTaskMapGranolaExtractionReport({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
      });
      assert.equal(
        buildTaskMapRawGranolaCandidateShelf(verified).candidates[0]?.confidence,
        0.94,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("collapses duplicate evidence identities within one provider response", async () => {
    const mention = "I will ship the unique evidence lane.";
    const f = await fixture([note("duplicate-evidence-note", mention)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => JSON.stringify({
          mentions: [0.61, 0.94].map((confidence) => ({
            class: "commitment",
            actor: "self",
            text: mention,
            title: "Ship the unique evidence lane",
            confidence,
          })),
        })),
      });

      assert.equal(report.notes[0]?.evidence.length, 1);
      assert.equal(report.notes[0]?.evidence[0]?.confidence, 0.94);
      assert.equal(report.notes[0]?.evidenceProofDigests.length, 1);
    } finally {
      await f.cleanup();
    }
  });

  it("round-trips the exact 64-by-20 admitted report boundary and rejects one byte over its cap", async () => {
    const mentions = Array.from({ length: 20 }, (_, index) => {
      const textPrefix = `Ship ${index} `;
      const titlePrefix = `Ship ${index} `;
      return {
        class: "commitment" as const,
        actor: "self" as const,
        text: textPrefix + "🚀".repeat(
          200 - Array.from(textPrefix).length,
        ),
        title: titlePrefix + "🚀".repeat(
          80 - Array.from(titlePrefix).length,
        ),
        confidence: 0.9,
      };
    });
    const body = mentions.map((mention) => mention.text).join("\n");
    const f = await fixture(
      Array.from({ length: 64 }, (_, index) =>
        note(`maximum-report-${index}`, body)
      ),
    );
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => JSON.stringify({ mentions })),
      });
      assert.equal(report.notes.length, 64);
      assert.ok(report.notes.every((row) => row.evidence.length === 20));
      const reportPath = path.join(
        f.runtimeRoot,
        TASKMAP_GRANOLA_EXTRACTION_REPORT_FILENAME,
      );
      const reportBytes = Number((await lstat(reportPath)).size);
      assert.ok(reportBytes > 2 * 1_024 * 1_024);
      assert.ok(reportBytes <= TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES);

      await writeFile(
        reportPath,
        Buffer.alloc(TASKMAP_GRANOLA_EXTRACTION_REPORT_MAX_BYTES + 1, 0x20),
        { mode: 0o600 },
      );
      await assert.rejects(
        loadVerifiedTaskMapGranolaExtractionReport({
          snapshotPath: f.snapshotPath,
          taskMapRoot: f.taskMapRoot,
          runtimeRoot: f.runtimeRoot,
          ownerScopeDigest: OWNER,
          promptTemplatePath: f.promptTemplatePath,
        }),
        /metadata|unavailable/,
      );
    } finally {
      await f.cleanup();
    }
  });

  it("rejects raw list and promotion proof at the exact four-hour boundary", async () => {
    const body = "I will ship the raw freshness gate.";
    const f = await fixture([note("raw-freshness-note", body)]);
    const calls = { factory: 0, run: [] as string[] };
    try {
      const report = await refreshTaskMapGranolaMeetingExtraction({
        snapshotPath: f.snapshotPath,
        taskMapRoot: f.taskMapRoot,
        runtimeRoot: f.runtimeRoot,
        ownerScopeDigest: OWNER,
        promptTemplatePath: f.promptTemplatePath,
        assessedAt: ASSESSED_AT,
        createStation: stationFactory(calls, () => extraction(
          body,
          "Ship the raw freshness gate",
        )),
      });
      const boundary = new Date(
        Date.parse(report.producedAt) + TASKMAP_MEETING_PRODUCER_MAX_AGE_MS,
      ).toISOString();
      const fresh = buildTaskMapUnifiedMeetingCandidateContext({
        ownerScopeDigest: OWNER,
        assessedAt: new Date(Date.parse(boundary) - 1).toISOString(),
        googleCandidates: [],
        googleResultDigest: null,
        googleSnapshotDigest: null,
        googleProducedAt: null,
        rawReport: report,
      });
      assert.equal(fresh.candidates.length, 1);
      assert.throws(
        () => buildTaskMapUnifiedMeetingCandidateContext({
          ownerScopeDigest: OWNER,
          assessedAt: boundary,
          googleCandidates: [],
          googleResultDigest: null,
          googleSnapshotDigest: null,
          googleProducedAt: null,
          rawReport: report,
        }),
        /stale/,
      );
      assert.throws(
        () => buildTaskMapUnifiedMeetingCandidateContext({
          ownerScopeDigest: OWNER,
          assessedAt: new Date(Date.parse(report.producedAt) - 1).toISOString(),
          googleCandidates: [],
          googleResultDigest: null,
          googleSnapshotDigest: null,
          googleProducedAt: null,
          rawReport: report,
        }),
        /stale/,
      );

      const overlay = buildTaskMapNativeCandidateReviewFromProofRows({
        context: fresh,
        previous: null,
      });
      const candidate = fresh.candidates[0]!;
      assert.throws(
        () => promoteTaskMapVerifiedMeetingCandidate({
          result: null,
          overlay,
          rawReport: report,
          previousStore: null,
          expectedOwnerScopeDigest: OWNER,
          assessedAt: boundary,
          candidateId: candidate.candidateId,
          expectedCandidateRevisionDigest:
            candidate.candidateRevisionDigest,
          expectedStatementReferenceDigest:
            candidate.statementReferenceDigest,
          expectedEvidenceProofDigests:
            candidate.evidenceProofDigests,
          idempotencyKeyDigest: taskMapContractDigest(
            "stale-raw-confirmation",
          ),
          confirmedAt: boundary,
        }),
        /stale/,
      );
    } finally {
      await f.cleanup();
    }
  });
});
