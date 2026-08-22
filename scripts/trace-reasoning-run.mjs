#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DaoBrewClient } from "../dist/src/client.js";
import { readBiometricSignals } from "../dist/src/engine/signals/biometrics.js";
import { readCalendarSignals } from "../dist/src/engine/signals/calendar.js";
import { readGranolaSignals } from "../dist/src/engine/signals/granola.js";
import { readMemorySignals } from "../dist/src/engine/signals/memory.js";
import { joinTriplets } from "../dist/src/engine/triplet.js";
import { Reasoner, scoreTripletBreakdown } from "../dist/src/engine/reasoner/Reasoner.js";
import { canonicalUserId } from "../dist/src/user-id.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(scriptDir, "..");
const repoDir = resolve(mcpDir, "..");
const evidenceDir = resolve(repoDir, "docs", "loop", "evidence");

const SAMPLE_WINDOW_SEC = 4 * 60 * 60;
const CONTEXT_WINDOW_SEC = 24 * 60 * 60;
const MEMORY_WINDOW_SEC = 14 * 24 * 60 * 60;

function usage() {
  return [
    "Usage: node scripts/trace-reasoning-run.mjs [options]",
    "",
    "Options:",
    "  --label NAME                 Add a label to output filenames and trace metadata.",
    "  --user-id ID                 Source UUID user id. Default: DAOBREW_USER_ID or config user_id.",
    "  --start-iso ISO              Replay window start for states/events/meeting notes.",
    "  --end-iso ISO                Replay window end for states/events/meeting notes.",
    "  --as-of-iso ISO              Cut off local memory at this time.",
    "  --memory-mode MODE           as-of or through-now. Default: through-now.",
    "  --biometric-range RANGE      healthkit history range. Default: week.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    label: null,
    userId: null,
    startIso: null,
    endIso: null,
    asOfIso: null,
    memoryMode: "through-now",
    biometricRange: "week",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (name) => (arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : argv[++i]);
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg === "--label" || arg.startsWith("--label=")) {
      options.label = value("--label");
    } else if (arg === "--user-id" || arg.startsWith("--user-id=")) {
      options.userId = value("--user-id");
    } else if (arg === "--start-iso" || arg.startsWith("--start-iso=")) {
      options.startIso = value("--start-iso");
    } else if (arg === "--end-iso" || arg.startsWith("--end-iso=")) {
      options.endIso = value("--end-iso");
    } else if (arg === "--as-of-iso" || arg.startsWith("--as-of-iso=")) {
      options.asOfIso = value("--as-of-iso");
      options.memoryMode = "as-of";
    } else if (arg === "--memory-mode" || arg.startsWith("--memory-mode=")) {
      options.memoryMode = value("--memory-mode");
    } else if (arg === "--biometric-range" || arg.startsWith("--biometric-range=")) {
      options.biometricRange = value("--biometric-range");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!["as-of", "through-now"].includes(options.memoryMode)) {
    throw new Error("--memory-mode must be as-of or through-now");
  }
  return options;
}

function requireCanonicalUserId(value) {
  const userId = canonicalUserId(value);
  if (!userId) {
    throw new Error("canonical UUID user_id is required; pass --user-id, set DAOBREW_USER_ID, or run setup");
  }
  return userId;
}

function isoToTs(value, field) {
  if (!value) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${field}: ${value}`);
  return Math.trunc(ms / 1000);
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function redactUserId(userId) {
  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

function iso(ts) {
  if (!Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function truncate(value, length = 220) {
  const text = String(value ?? "");
  return text.length <= length ? text : `${text.slice(0, length)}...`;
}

function redactTranscriptEvidence(value) {
  return String(value ?? "")
    .replace(/\([^)]{24,}\) around a backend-classified/g, "([redacted cited transcript span]) around a backend-classified")
    .replace(/(Granola transcript:[^-]+)- .+/g, "$1- [redacted cited transcript span]");
}

function sanitizedBrief(brief) {
  if (!brief || typeof brief !== "object") return brief;
  return {
    ...brief,
    cause: redactTranscriptEvidence(brief.cause),
    evidence: Array.isArray(brief.evidence)
      ? brief.evidence.map((line) => redactTranscriptEvidence(line))
      : brief.evidence,
  };
}

function closestEvent(events, ts) {
  if (!events.length) return null;
  return events
    .map((event) => {
      const end = event.end_ts ?? event.start_ts;
      const distanceSec = ts >= event.start_ts && ts <= end
        ? 0
        : Math.min(Math.abs(ts - event.start_ts), Math.abs(ts - end));
      return {
        title: event.title,
        source_ref: event.graph_source_ref,
        start_ts: event.start_ts,
        start_iso: iso(event.start_ts),
        end_ts: end,
        end_iso: iso(end),
        distance_sec: distanceSec,
        within_context_window: distanceSec <= CONTEXT_WINDOW_SEC,
      };
    })
    .sort((a, b) => a.distance_sec - b.distance_sec)[0];
}

function closestMeeting(meetings, ts) {
  if (!meetings.length) return null;
  return meetings
    .map((meeting) => {
      const distanceSec = meeting.occurred_at_ts === null
        ? Number.MAX_SAFE_INTEGER
        : Math.abs(ts - meeting.occurred_at_ts);
      return {
        title: meeting.title,
        source_ref: meeting.graph_source_ref,
        occurred_at_ts: meeting.occurred_at_ts,
        occurred_iso: iso(meeting.occurred_at_ts),
        event_id: meeting.event_id,
        distance_sec: distanceSec,
        within_context_window: distanceSec <= CONTEXT_WINDOW_SEC,
      };
    })
    .sort((a, b) => a.distance_sec - b.distance_sec)[0];
}

function metricSummary(series) {
  return {
    metric: series.metric,
    range: series.range,
    sample_count: series.samples.length,
    aggregated: series.aggregated,
    first_sample: series.samples[0] ?? null,
    last_sample: series.samples.at(-1) ?? null,
  };
}

function tripletTrace(triplet, selected, allEvents, allMeetings) {
  const score = scoreTripletBreakdown(triplet);
  const state = triplet.episode.state;
  return {
    id: triplet.id,
    selected_root_triplet: selected,
    score,
    state: {
      graph_source_ref: state.graph_source_ref,
      bucket_ts: state.bucket_ts,
      bucket_iso: iso(state.bucket_ts),
      source_quality: state.source_quality,
    },
    joins: {
      samples: {
        count: triplet.episode.samples.length,
        source_refs: triplet.episode.samples.slice(0, 12).map((sample) => sample.graph_source_ref),
        omitted_after_first_12: Math.max(0, triplet.episode.samples.length - 12),
      },
      events: triplet.events.map((event) => ({
        title: event.title,
        source_ref: event.graph_source_ref,
        start_iso: iso(event.start_ts),
        end_iso: iso(event.end_ts ?? event.start_ts),
      })),
      meetings: triplet.meetings.map((meeting) => ({
        title: meeting.title,
        source_ref: meeting.graph_source_ref,
        occurred_iso: iso(meeting.occurred_at_ts),
        event_id: meeting.event_id,
      })),
      memories: triplet.memories.map((memory) => ({
        source: memory.source,
        source_ref: memory.source_ref,
        graph_source_ref: memory.graph_source_ref,
        importance: memory.importance,
        strength: memory.strength,
        occurred_iso: iso(memory.occurred_at_ts),
        insight_prefix: truncate(memory.insight_text),
      })),
    },
    nearest_unjoined_context: {
      closest_event: closestEvent(allEvents, state.bucket_ts),
      closest_meeting: closestMeeting(allMeetings, state.bucket_ts),
    },
    source_refs: triplet.source_refs,
  };
}

function markdown(trace) {
  const root = trace.result.root;
  const selected = trace.triplets.find((triplet) => triplet.selected_root_triplet);
  return [
    "# DaoBrew Reasoning Trace",
    "",
    `Generated at: ${trace.generated_at}`,
    "",
    "## Engine",
    "",
    `- Reasoner: ${trace.engine.reasoner}`,
    `- External LLM used for graph reasoning: ${trace.engine.external_llm_used}`,
    `- OpenAI API key used for this graph delta: ${trace.engine.openai_api_key_used}`,
    `- Backend: ${trace.backend.api_url}`,
    `- UUID anchor: ${trace.backend.user_id_redacted}`,
    `- Replay label: ${trace.replay.label ?? "none"}`,
    `- Replay window: ${trace.replay.start_iso ?? "unbounded"} to ${trace.replay.end_iso ?? "unbounded"}`,
    `- Memory mode: ${trace.replay.memory_mode}${trace.replay.as_of_iso ? ` (${trace.replay.as_of_iso})` : ""}`,
    "",
    "## Source Counts",
    "",
    `- Biometrics metric series: ${trace.sources.biometrics.metric_series.length}`,
    `- Backend state buckets: ${trace.sources.biometrics.state_count}`,
    `- Events: ${trace.sources.events.count}`,
    `- Meeting notes: ${trace.sources.meeting_notes.count}`,
    `- Local user memory: ${trace.sources.user_insights.count}`,
    "",
    "## Join Windows",
    "",
    `- Samples join within +/- ${trace.join_windows.sample_window_sec / 3600}h of a backend state bucket.`,
    `- Events/meetings join within +/- ${trace.join_windows.context_window_sec / 3600}h of a backend state bucket, or meeting.event_id matches a joined event.`,
    `- Memory joins within ${trace.join_windows.memory_window_sec / 86400} days by timestamp, or by token overlap with joined event/meeting context.`,
    "",
    "## Selected Candidate",
    "",
    root ? `- Title: ${root.title}` : "- Title: none",
    root ? `- Cause text: ${root.brief.cause}` : "- Cause text: none",
    root ? `- Context: ${root.brief.context}` : "- Context: none",
    selected ? `- Selected triplet: ${selected.id}` : "- Selected triplet: none",
    selected ? `- Score: ${selected.score.total} (${JSON.stringify(selected.score)})` : "- Score: none",
    selected ? `- Backend state bucket: ${selected.state.graph_source_ref} at ${selected.state.bucket_iso}` : "- Backend state bucket: none",
    selected ? `- Joined events: ${selected.joins.events.length}` : "- Joined events: none",
    selected ? `- Joined meeting notes: ${selected.joins.meetings.length}` : "- Joined meeting notes: none",
    selected ? `- Joined memories: ${selected.joins.memories.length}` : "- Joined memories: none",
    "",
    "## Important Caveat",
    "",
    "This trace is a source-backed attribution candidate, not a proven clinical or causal truth. If events and meeting notes do not time-align with the selected backend state bucket, the result must not be described as a real root cause.",
    "",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(evidenceDir, { recursive: true });
  const configPath = join(homedir(), ".daobrew", "config.json");
  const config = readJsonSafe(configPath);
  const userId = requireCanonicalUserId(options.userId ?? process.env.DAOBREW_USER_ID ?? config.user_id);
  const apiUrl = process.env.DAOBREW_API_URL || config.api_url || "https://daobrew-backend-iaupcwo6dq-uw.a.run.app/api/v1";
  const startTs = isoToTs(options.startIso, "start ISO");
  const endTs = isoToTs(options.endIso, "end ISO");
  const asOfTs = isoToTs(options.asOfIso, "as-of ISO");
  const memoryEndTs = options.memoryMode === "as-of" ? (asOfTs ?? endTs) : undefined;

  const client = new DaoBrewClient({
    apiKey: process.env.DAOBREW_API_KEY || config.api_key || "",
    baseUrl: apiUrl,
    deviceId: userId,
  });

  const [biometrics, events, meetingNotes, userInsights] = await Promise.all([
    readBiometricSignals(client, {
      range: options.biometricRange,
      stateLimit: 100,
      startTs,
      endTs,
      tobDays: 30,
    }),
    readCalendarSignals({ userId, startTs, endTs, limit: 200 }),
    readGranolaSignals({ userId, startTs, endTs, limit: 200 }),
    readMemorySignals({ userId, endTs: memoryEndTs, limit: 200 }),
  ]);
  const triplets = joinTriplets({ biometrics, calendar: events, granola: meetingNotes, memory: userInsights }, {
    userId,
    sampleWindowSec: SAMPLE_WINDOW_SEC,
    contextWindowSec: CONTEXT_WINDOW_SEC,
    memoryWindowSec: MEMORY_WINDOW_SEC,
  });
  const delta = await new Reasoner().buildDelta({ user_id: userId, triplets });
  const rootNode = delta.nodes.find((node) => node.id === delta.armed_root_cause.node_id);
  const rankedTriplets = [...triplets].sort((a, b) => (
    scoreTripletBreakdown(b).total - scoreTripletBreakdown(a).total ||
    a.episode.occurred_at_ts - b.episode.occurred_at_ts ||
    a.id.localeCompare(b.id)
  ));
  const selectedId = typeof rootNode?.props_json?.selected_triplet_id === "string"
    ? rootNode.props_json.selected_triplet_id
    : (rankedTriplets[0]?.id ?? null);
  const trace = {
    generated_at: new Date().toISOString(),
    replay: {
      label: options.label,
      user_id: userId,
      start_iso: options.startIso,
      end_iso: options.endIso,
      as_of_iso: options.asOfIso,
      start_ts: startTs,
      end_ts: endTs,
      as_of_ts: asOfTs,
      memory_mode: options.memoryMode,
      biometric_range: options.biometricRange,
    },
    engine: {
      reasoner: "deterministic_mvp_rules",
      external_llm_used: false,
      openai_api_key_used: false,
      source_file: "daobrew-wellness-mcp/src/engine/reasoner/Reasoner.ts",
      bad_previous_template: "context is repeatedly colliding with a biometric state",
    },
    backend: {
      api_url: apiUrl,
      user_id_source: options.userId ? "flag" : process.env.DAOBREW_USER_ID ? "env" : "config.user_id",
      user_id_redacted: redactUserId(userId),
    },
    join_windows: {
      sample_window_sec: SAMPLE_WINDOW_SEC,
      context_window_sec: CONTEXT_WINDOW_SEC,
      memory_window_sec: MEMORY_WINDOW_SEC,
      max_memory_hits: 5,
    },
    sources: {
      biometrics: {
        metric_series: biometrics.metrics.map(metricSummary),
        state_count: biometrics.states.length,
      },
      events: {
        count: events.length,
        rows: events.map((event) => ({
          title: event.title,
          source_ref: event.source_ref,
          graph_source_ref: event.graph_source_ref,
          start_iso: iso(event.start_ts),
          end_iso: iso(event.end_ts ?? event.start_ts),
        })),
      },
      meeting_notes: {
        count: meetingNotes.length,
        rows: meetingNotes.map((meeting) => ({
          title: meeting.title,
          source_ref: meeting.source_ref,
          graph_source_ref: meeting.graph_source_ref,
          event_id: meeting.event_id,
          occurred_iso: iso(meeting.occurred_at_ts),
          summary: meeting.summary,
          topics: meeting.topics,
        })),
      },
      user_insights: {
        count: userInsights.length,
        source_counts: Object.entries(userInsights.reduce((acc, insight) => {
          acc[insight.source] = (acc[insight.source] ?? 0) + 1;
          return acc;
        }, {})).map(([source, count]) => ({ source, count })),
      },
    },
    triplets: rankedTriplets.map((triplet) => tripletTrace(triplet, triplet.id === selectedId, events, meetingNotes)),
    result: {
      graph_delta: {
        node_count: delta.nodes.length,
        edge_count: delta.edges.length,
        armed_root_cause: {
          ...delta.armed_root_cause,
          brief: sanitizedBrief(delta.armed_root_cause.brief),
        },
        assumptions: delta.assumptions,
      },
      root: rootNode ? {
        id: rootNode.id,
        title: rootNode.title,
        subtitle: rootNode.subtitle,
        source_ref: rootNode.source_ref,
        brief: sanitizedBrief(delta.armed_root_cause.brief),
      } : null,
      node_kind_counts: delta.nodes.reduce((acc, node) => {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        return acc;
      }, {}),
      edge_kind_counts: delta.edges.reduce((acc, edge) => {
        acc[edge.kind] = (acc[edge.kind] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };

  const stamp = trace.generated_at.replace(/[:.]/g, "-");
  const label = options.label ? `${String(options.label).replace(/[^a-zA-Z0-9_-]/g, "-")}-` : "";
  const jsonPath = join(evidenceDir, `reasoning-trace-${label}${stamp}.json`);
  const mdPath = join(evidenceDir, `reasoning-trace-${label}${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(trace, null, 2)}\n`);
  writeFileSync(mdPath, markdown(trace));
  console.log(JSON.stringify({ json_path: jsonPath, md_path: mdPath }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
  process.exit(1);
});
