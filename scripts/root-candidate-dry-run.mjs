#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { DaoBrewClient } from "../dist/src/client.js";
import { readBiometricSignals } from "../dist/src/engine/signals/biometrics.js";
import { readBiometricSignalsPreferDirect } from "../dist/src/engine/signals/biometricsDb.js";
import { readCalendarSignals } from "../dist/src/engine/signals/calendar.js";
import { readGranolaSignals } from "../dist/src/engine/signals/granola.js";
import { readMemorySignals } from "../dist/src/engine/signals/memory.js";
import { joinTriplets } from "../dist/src/engine/triplet.js";
import { graphStoreKind } from "../dist/src/graph-db.js";
import { scopedQuery } from "../dist/src/engine/user-scope.js";
import { scorePatterns, scoreTripletBreakdown } from "../dist/src/engine/reasoner/Reasoner.js";
import {
  proposeLatentHypotheses,
  verifyLatentHypothesis,
} from "../dist/src/engine/reasoner/LatentHypothesis.js";
import { canonicalUserId } from "../dist/src/user-id.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(scriptDir, "..");
const repoDir = resolve(mcpDir, "..");
const evidenceDir = resolve(repoDir, "docs", "loop", "evidence");

const SAMPLE_WINDOW_SEC = 4 * 60 * 60;
const CONTEXT_WINDOW_SEC = 24 * 60 * 60;
const MEMORY_WINDOW_SEC = 14 * 24 * 60 * 60;

const INTERNAL_OR_DEMO_TERMS = /\b(source-backed|source backed|detonate|detonator|root cause|coding agent|claude|codex|mcp|backend|verifier|license|entitlement|prompt|chat box|copy paste|human in the loop)\b/i;
const DEMO_TERMS = /\b(demo|proof|handoff|artifact|verify|verification|detonate|detonator)\b/i;

const THEME_FRAMES = [
  {
    key: "b2b_b2c_positioning",
    label: "B2B/B2C and one-wedge positioning",
    terms: ["b2b", "b2c", "consumer", "enterprise", "partner", "wedge", "positioning", "value proposition", "value prop", "brand", "focus"],
  },
  {
    key: "demo_readiness",
    label: "Demo/proof-loop readiness",
    terms: ["demo", "proof", "handoff", "artifact", "verify", "end to end", "closed loop", "story"],
  },
  {
    key: "evidence_completeness",
    label: "Evidence completeness and meeting-note coverage",
    terms: ["transcript", "granola", "meeting note", "source", "evidence", "citation", "body", "truncated"],
  },
  {
    key: "human_loop_autonomy",
    label: "Human-in-the-loop autonomy and artifact delivery",
    terms: ["human in the loop", "copy paste", "chat box", "automatic", "ship", "ls", "signal", "artifact"],
  },
  {
    key: "license_gate",
    label: "Paid entitlement and action-package gate",
    terms: ["license", "entitlement", "paid", "checkout", "not_entitled"],
  },
  {
    key: "graph_presentation",
    label: "Graph presentation and navigability",
    terms: ["obsidian", "graph", "radial", "node", "week", "column", "source"],
  },
];

function parseArgs(argv) {
  const options = {
    label: "phase-6-99d-root-candidate-dry-run",
    userId: null,
    startIso: "2026-05-26T00:00:00-07:00",
    endIso: "2026-06-25T23:59:59-07:00",
    memoryMode: "through-now",
    biometricRange: "year",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (name) => (arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : argv[++i]);
    if (arg === "--label" || arg.startsWith("--label=")) options.label = value("--label");
    else if (arg === "--user-id" || arg.startsWith("--user-id=")) options.userId = value("--user-id");
    else if (arg === "--start-iso" || arg.startsWith("--start-iso=")) options.startIso = value("--start-iso");
    else if (arg === "--end-iso" || arg.startsWith("--end-iso=")) options.endIso = value("--end-iso");
    else if (arg === "--memory-mode" || arg.startsWith("--memory-mode=")) options.memoryMode = value("--memory-mode");
    else if (arg === "--biometric-range" || arg.startsWith("--biometric-range=")) options.biometricRange = value("--biometric-range");
    else throw new Error(`Unknown argument: ${arg}`);
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

function isoToTs(value) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${value}`);
  return Math.trunc(ms / 1000);
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function iso(ts) {
  if (!Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function fingerprint(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, 12);
}

function hitTerms(text, terms) {
  const normalized = normalize(text);
  return terms.filter((term) => normalized.includes(term.toLowerCase()));
}

function citedSpanSummaries(meeting, terms) {
  const body = normalize(meeting.body);
  return (meeting.transcript_spans ?? [])
    .filter((span) => {
      const text = normalize(span.text);
      return text.length >= 16 && body.includes(text);
    })
    .map((span) => ({
      idx: span.idx ?? null,
      speaker: span.speaker ?? null,
      ts_offset_sec: span.ts_offset_sec ?? null,
      text_sha256_12: fingerprint(span.text),
      hit_terms: hitTerms(span.text, terms),
    }));
}

function meetingSummary(meeting, terms) {
  return {
    id: meeting.id,
    title: meeting.title,
    source_ref: meeting.graph_source_ref,
    occurred_iso: iso(meeting.occurred_at_ts),
    event_id: meeting.event_id,
    has_body: Boolean(meeting.body),
    body_length: meeting.body?.length ?? 0,
    span_count: meeting.transcript_spans?.length ?? 0,
    cited_spans: citedSpanSummaries(meeting, terms),
    topic_hits: hitTerms([meeting.summary, ...(meeting.topics ?? [])].join(" "), terms),
  };
}

function memorySummary(memory, terms) {
  return {
    id: memory.id,
    source: memory.source,
    source_ref: memory.graph_source_ref,
    strength: memory.strength,
    importance: memory.importance,
    occurred_iso: iso(memory.occurred_at_ts),
    hit_terms: hitTerms([memory.insight_text, ...(memory.topics ?? [])].join(" "), terms),
    internal_or_demo_language_hit: INTERNAL_OR_DEMO_TERMS.test(memory.insight_text),
    demo_language_hit: DEMO_TERMS.test(memory.insight_text),
  };
}

function titleList(rows) {
  return [...new Set(rows.map((row) => row.title).filter(Boolean))].slice(0, 8);
}

function uniqueByKey(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function verifyWithMemoryFilter(proposal, triplet, biometricPatterns, predicate) {
  const filteredMemories = triplet.memories.filter(predicate);
  const proposals = proposeLatentHypotheses({
    meetings: triplet.meetings,
    memories: filteredMemories,
    biometric_patterns: biometricPatterns,
    event_titles: triplet.events.map((event) => event.title),
    anchor_ts: triplet.episode.state.bucket_ts,
  });
  const reproposed = proposals.find((candidate) => (
    candidate.thread_key === proposal.thread_key &&
    candidate.cause === proposal.cause
  ));
  if (!reproposed) {
    return {
      accepted: false,
      rejected_reasons: ["proposal check failed: removing this memory set removes the candidate"],
    };
  }
  return verifyLatentHypothesis(reproposed, {
    meetings: triplet.meetings,
    memories: filteredMemories,
    biometric_patterns: biometricPatterns,
    event_titles: triplet.events.map((event) => event.title),
    anchor_ts: triplet.episode.state.bucket_ts,
  });
}

function candidateRows(triplets) {
  const rows = [];
  for (const triplet of triplets) {
    const biometricPatterns = scorePatterns(triplet).map((entry) => entry.key);
    const proposals = proposeLatentHypotheses({
      meetings: triplet.meetings,
      memories: triplet.memories,
      biometric_patterns: biometricPatterns,
      event_titles: triplet.events.map((event) => event.title),
      anchor_ts: triplet.episode.state.bucket_ts,
    });
    for (const proposal of proposals) {
      const verification = verifyLatentHypothesis(proposal, {
        meetings: triplet.meetings,
        memories: triplet.memories,
        biometric_patterns: biometricPatterns,
        event_titles: triplet.events.map((event) => event.title),
        anchor_ts: triplet.episode.state.bucket_ts,
      });
      const noProjectMemory = verifyWithMemoryFilter(proposal, triplet, biometricPatterns, () => false);
      const noInternalDemoLanguage = verifyWithMemoryFilter(
        proposal,
        triplet,
        biometricPatterns,
        (memory) => !INTERNAL_OR_DEMO_TERMS.test(memory.insight_text),
      );
      const noDemoLanguage = verifyWithMemoryFilter(
        proposal,
        triplet,
        biometricPatterns,
        (memory) => !DEMO_TERMS.test(memory.insight_text),
      );
      const terms = [...new Set([...proposal.surface_terms, proposal.thread_key])];
      rows.push({
        candidate_key: `${proposal.thread_key}:${triplet.id}`,
        thread_key: proposal.thread_key,
        cause: proposal.cause,
        accepted: verification.accepted,
        claim_level: verification.claim_level,
        gates: verification.gates,
        rejected_reasons: verification.rejected_reasons,
        ablation: {
          accepted_without_project_memory: noProjectMemory.accepted,
          accepted_without_internal_process_language: noInternalDemoLanguage.accepted,
          accepted_without_demo_language: noDemoLanguage.accepted,
          rejected_without_project_memory: noProjectMemory.rejected_reasons,
          rejected_without_internal_process_language: noInternalDemoLanguage.rejected_reasons,
          rejected_without_demo_language: noDemoLanguage.rejected_reasons,
        },
        triplet: {
          id: triplet.id,
          score: scoreTripletBreakdown(triplet),
          state_ref: triplet.episode.state.graph_source_ref,
          state_iso: iso(triplet.episode.state.bucket_ts),
          state_category: triplet.episode.state.category,
          biometric_patterns: biometricPatterns,
          event_titles: titleList(triplet.events),
          meeting_titles: titleList(triplet.meetings),
        },
        evidence_summary: {
          cited_span_count: proposal.evidence_spans.length,
          memory_support_count: proposal.memory_support.length,
          meetings: triplet.meetings.map((meeting) => meetingSummary(meeting, terms)),
          memories: triplet.memories.map((memory) => memorySummary(memory, terms)),
        },
      });
    }
  }
  return uniqueByKey(rows, (row) => `${row.thread_key}:${row.cause}:${row.triplet.state_ref}`);
}

function themeScan(meetings, memories) {
  return THEME_FRAMES.map((frame) => {
    const meetingHits = meetings
      .map((meeting) => ({
        meeting: meetingSummary(meeting, frame.terms),
        hits: hitTerms([meeting.title, meeting.summary, meeting.body, ...(meeting.topics ?? [])].join(" "), frame.terms),
      }))
      .filter((row) => row.hits.length > 0);
    const memoryHits = memories
      .map((memory) => ({
        memory: memorySummary(memory, frame.terms),
        hits: hitTerms([memory.insight_text, ...(memory.topics ?? [])].join(" "), frame.terms),
      }))
      .filter((row) => row.hits.length > 0);
    return {
      key: frame.key,
      label: frame.label,
      meeting_hit_count: meetingHits.length,
      memory_hit_count: memoryHits.length,
      meeting_hits: meetingHits.slice(0, 10),
      memory_hits: memoryHits.slice(0, 10),
      root_status: meetingHits.length > 0 && memoryHits.length > 0
        ? "theme_has_cross_source_support_but_still_requires_watch_alignment_and_verifier_acceptance"
        : "support_only_not_a_root",
    };
  });
}

function markdown(report) {
  const accepted = report.candidates.filter((candidate) => candidate.accepted);
  const rejected = report.candidates.filter((candidate) => !candidate.accepted);
  const lines = [
    "# Phase 6.99D Root Candidate Dry Run",
    "",
    `Generated at: ${report.generated_at}`,
    `Replay window: ${report.replay.start_iso} to ${report.replay.end_iso}`,
    `Graph store: ${report.runtime.graph_store}`,
    "",
    "## Source Counts",
    "",
    `- Backend/watch state buckets: ${report.sources.biometric_state_count}`,
    `- Events: ${report.sources.event_count}`,
    `- Meeting notes: ${report.sources.meeting_note_count}`,
    `- Meeting notes with body: ${report.sources.meeting_notes_with_body}`,
    `- Meeting notes with transcript spans: ${report.sources.meeting_notes_with_spans}`,
    `- Project memory rows: ${report.sources.memory_count}`,
    "",
    "## Accepted Candidates",
    "",
    accepted.length === 0 ? "- None." : accepted.map((candidate) => (
      `- ${candidate.cause} (${candidate.thread_key}) - state ${candidate.triplet.state_ref}; spans=${candidate.evidence_summary.cited_span_count}; memories=${candidate.evidence_summary.memory_support_count}; without_project_memory=${candidate.ablation.accepted_without_project_memory}; without_demo_language=${candidate.ablation.accepted_without_demo_language}`
    )).join("\n"),
    "",
    "## Rejected Candidate Attempts",
    "",
    rejected.length === 0 ? "- None." : rejected.slice(0, 20).map((candidate) => (
      `- ${candidate.thread_key} at ${candidate.triplet.state_ref}: ${candidate.rejected_reasons.join("; ") || "rejected"}`
    )).join("\n"),
    "",
    "## Theme Scan",
    "",
    ...report.theme_scan.map((theme) => (
      `- ${theme.label}: meeting_hits=${theme.meeting_hit_count}, memory_hits=${theme.memory_hit_count}, status=${theme.root_status}`
    )),
    "",
    "## Privacy",
    "",
    "This dry run does not write graph rows and does not paste transcript text. It records source refs, body lengths, span indexes, offsets, hashes, and hit terms only.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(evidenceDir, { recursive: true });
  const startTs = isoToTs(options.startIso);
  const endTs = isoToTs(options.endIso);
  const configPath = join(homedir(), ".daobrew", "config.json");
  const config = readJsonSafe(configPath);
  const userId = requireCanonicalUserId(options.userId ?? process.env.DAOBREW_USER_ID ?? config.user_id);
  const apiUrl = process.env.DAOBREW_API_URL || config.api_url || "https://daobrew-backend-iaupcwo6dq-uw.a.run.app/api/v1";
  const client = new DaoBrewClient({
    apiKey: process.env.DAOBREW_API_KEY || config.api_key || "",
    baseUrl: apiUrl,
    deviceId: userId,
  });

  // Biometrics via the engine's own preferred read: direct warm-tier under
  // postgres (the HTTP client path returns "DaoBrew API error" in this env),
  // HTTP fallback otherwise. Mirrors run.ts so the dry-run sees what the engine sees.
  const bioWarnings = [];
  // RLS seam: under postgres the Layer-1 readers hit user-scoped tables and must
  // run through a GUC-scoped query (mirrors run.ts). Without it they emit
  // `user_id = __daobrew_scope.uid` with no scope row and error.
  const scopedRead = graphStoreKind() === "postgres" ? { query: scopedQuery(userId) } : {};
  const [{ signals: biometrics }, events, meetings, memories] = await Promise.all([
    readBiometricSignalsPreferDirect({
      userId,
      client,
      range: options.biometricRange,
      stateLimit: 100,
      startTs,
      endTs,
      stateChunkDays: 7,
      tobDays: 30,
    }, bioWarnings),
    readCalendarSignals({ userId, startTs, endTs, limit: 250, ...scopedRead }),
    readGranolaSignals({ userId, startTs, endTs, limit: 250, ...scopedRead }),
    readMemorySignals({ userId, limit: 250, ...scopedRead }),
  ]);
  for (const w of bioWarnings) process.stderr.write(`[biometrics] ${w}\n`);

  const triplets = joinTriplets({ biometrics, calendar: events, granola: meetings, memory: memories }, {
    userId,
    sampleWindowSec: SAMPLE_WINDOW_SEC,
    contextWindowSec: CONTEXT_WINDOW_SEC,
    memoryWindowSec: MEMORY_WINDOW_SEC,
  });
  const candidates = candidateRows(triplets).sort((a, b) => (
    Number(b.accepted) - Number(a.accepted) ||
    b.triplet.score.total - a.triplet.score.total ||
    a.thread_key.localeCompare(b.thread_key)
  ));
  const report = {
    generated_at: new Date().toISOString(),
    replay: {
      label: options.label,
      user_id: userId,
      start_iso: options.startIso,
      end_iso: options.endIso,
      start_ts: startTs,
      end_ts: endTs,
      biometric_range: options.biometricRange,
      memory_mode: options.memoryMode,
    },
    runtime: {
      graph_store: process.env.DAOBREW_GRAPH_STORE || (process.env.DAOBREW_POSTGRES_URL ? "postgres" : "sqlite"),
      dry_run_only: true,
      graph_rows_written: 0,
      raw_transcript_text_written_to_evidence: false,
      internal_or_demo_seed_terms_removed_from_reasoner: true,
    },
    sources: {
      biometric_state_count: biometrics.states.length,
      metric_series_count: biometrics.metrics.length,
      event_count: events.length,
      meeting_note_count: meetings.length,
      meeting_notes_with_body: meetings.filter((meeting) => (meeting.body?.length ?? 0) > 0).length,
      meeting_notes_with_spans: meetings.filter((meeting) => (meeting.transcript_spans?.length ?? 0) > 0).length,
      memory_count: memories.length,
    },
    candidates,
    theme_scan: themeScan(meetings, memories),
  };

  const stamp = report.generated_at.replace(/[:.]/g, "-");
  const label = String(options.label).replace(/[^a-zA-Z0-9_-]/g, "-");
  const jsonPath = join(evidenceDir, `${label}-${stamp}.json`);
  const mdPath = join(evidenceDir, `${label}-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, markdown(report));
  console.log(JSON.stringify({ json_path: jsonPath, md_path: mdPath, accepted: report.candidates.filter((candidate) => candidate.accepted).length, candidates: report.candidates.length }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err?.message ?? String(err) }, null, 2));
  process.exit(1);
});
