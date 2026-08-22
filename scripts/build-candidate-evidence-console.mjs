#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpDir = resolve(scriptDir, "..");
const repoDir = resolve(mcpDir, "..");
const evidenceDir = resolve(repoDir, "docs", "loop", "evidence");

const DEFAULT_LABEL = "phase-6-6-candidate-evidence-console";

function parseArgs(argv) {
  const options = {
    input: "",
    label: DEFAULT_LABEL,
    outputDir: evidenceDir,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (name) => (arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : argv[++i]);
    if (arg === "--input" || arg.startsWith("--input=")) options.input = value("--input");
    else if (arg === "--label" || arg.startsWith("--label=")) options.label = value("--label");
    else if (arg === "--output-dir" || arg.startsWith("--output-dir=")) options.outputDir = value("--output-dir");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function latestDryRunInput() {
  const candidates = readdirSync(evidenceDir)
    .filter((name) => /^phase-6-99d-root-candidate-dry-run-.+\.json$/.test(name))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) {
    throw new Error(`No phase-6-99d root-candidate dry-run JSON found in ${evidenceDir}`);
  }
  return resolve(evidenceDir, latest);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function shortList(values, max = 4) {
  const cleaned = unique(values);
  return cleaned.length > max ? `${cleaned.slice(0, max).join(", ")} +${cleaned.length - max}` : cleaned.join(", ");
}

function gateSummary(gates = {}) {
  const entries = Object.entries(gates);
  if (!entries.length) return { passed: [], failed: [] };
  return {
    passed: entries.filter(([, value]) => value === "pass").map(([key]) => key),
    failed: entries.filter(([, value]) => value !== "pass").map(([key, value]) => `${key}:${value}`),
  };
}

function meetingEvidence(meeting) {
  return {
    title: meeting.title ?? "",
    source_ref: meeting.source_ref ?? "",
    occurred_iso: meeting.occurred_iso ?? null,
    body_length: meeting.body_length ?? 0,
    span_count: meeting.span_count ?? 0,
    cited_span_hashes: (meeting.cited_spans ?? []).map((span) => span.text_sha256_12).filter(Boolean),
    hit_terms: unique([
      ...(meeting.topic_hits ?? []),
      ...(meeting.cited_spans ?? []).flatMap((span) => span.hit_terms ?? []),
    ]),
  };
}

function memoryEvidence(memory) {
  return {
    source: memory.source ?? "",
    source_ref: memory.source_ref ?? "",
    occurred_iso: memory.occurred_iso ?? null,
    hit_terms: memory.hit_terms ?? [],
    demo_language_hit: Boolean(memory.demo_language_hit),
    internal_or_demo_language_hit: Boolean(memory.internal_or_demo_language_hit),
  };
}

function acceptedCandidateLane(candidate) {
  const gates = gateSummary(candidate.gates);
  const ablation = candidate.ablation ?? {};
  const meetings = (candidate.evidence_summary?.meetings ?? []).map(meetingEvidence);
  const memories = (candidate.evidence_summary?.memories ?? [])
    .filter((memory) => (memory.hit_terms ?? []).length > 0)
    .map(memoryEvidence);

  return {
    id: candidate.candidate_key,
    kind: "exploratory_candidate",
    title: candidate.cause,
    theme_key: candidate.thread_key,
    status: "not_armable_demo_or_memory_dependent",
    claim_level: candidate.claim_level ?? "candidate",
    gates,
    ablation: {
      accepted_without_project_memory: Boolean(ablation.accepted_without_project_memory),
      accepted_without_internal_process_language: Boolean(ablation.accepted_without_internal_process_language),
      accepted_without_demo_language: Boolean(ablation.accepted_without_demo_language),
      rejected_without_project_memory: ablation.rejected_without_project_memory ?? [],
      rejected_without_demo_language: ablation.rejected_without_demo_language ?? [],
    },
    watch_alignment: {
      state_ref: candidate.triplet?.state_ref ?? null,
      state_iso: candidate.triplet?.state_iso ?? null,
      state_category: candidate.triplet?.state_category ?? null,
      biometric_patterns: candidate.triplet?.biometric_patterns ?? [],
    },
    evidence: {
      meetings,
      memories,
      event_titles: candidate.triplet?.event_titles ?? [],
      meeting_titles: candidate.triplet?.meeting_titles ?? [],
    },
    why_not_armed: [
      "Fails ablation: removing project memory removes the candidate.",
      "Fails ablation: removing demo-language context removes the candidate.",
      "Useful as a product/research thread, but not source-independent enough for ARM.",
    ],
    next_move: "Show as a candidate lane with demo-dependent and needs-project-support badges.",
  };
}

function themeLane(theme) {
  const meetingHits = theme.meeting_hits ?? [];
  const memoryHits = theme.memory_hits ?? [];
  const meetings = meetingHits.slice(0, 8).map((hit) => meetingEvidence(hit.meeting ?? {}));
  const memories = memoryHits.slice(0, 8).map((hit) => memoryEvidence(hit.memory ?? {}));
  return {
    id: theme.key,
    kind: "theme",
    title: theme.label,
    theme_key: theme.key,
    status: "theme_not_armable_without_watch_alignment_and_verifier_acceptance",
    meeting_hit_count: theme.meeting_hit_count ?? meetings.length,
    memory_hit_count: theme.memory_hit_count ?? memories.length,
    evidence: {
      meetings,
      memories,
    },
    why_not_armed: [
      "Theme has cross-source support, but not enough formal watch alignment and verifier acceptance.",
      "May contain useful product truth without being a health root cause.",
    ],
    next_move: "Keep in Evidence Console as a candidate lane; do not write as an armed root.",
  };
}

function rejectedSummary(candidates) {
  const counts = new Map();
  for (const candidate of candidates.filter((row) => !row.accepted)) {
    for (const reason of candidate.rejected_reasons ?? []) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
}

function buildConsole(inputPath, dryRun) {
  const accepted = (dryRun.candidates ?? []).filter((candidate) => candidate.accepted);
  const acceptedByTitle = new Map();
  for (const lane of accepted.map(acceptedCandidateLane)) {
    const key = `${lane.theme_key}:${lane.title}`;
    const existing = acceptedByTitle.get(key);
    if (!existing) {
      acceptedByTitle.set(key, {
        ...lane,
        id: key,
        occurrences: 1,
        watch_alignments: [lane.watch_alignment],
      });
    } else {
      existing.occurrences += 1;
      existing.watch_alignments.push(lane.watch_alignment);
      existing.evidence.event_titles = unique([...existing.evidence.event_titles, ...lane.evidence.event_titles]);
      existing.evidence.meeting_titles = unique([...existing.evidence.meeting_titles, ...lane.evidence.meeting_titles]);
    }
  }

  const exploratoryLanes = [...acceptedByTitle.values()];
  const themeLanes = (dryRun.theme_scan ?? []).map(themeLane);
  const lanes = [...exploratoryLanes, ...themeLanes];

  return {
    generated_at: new Date().toISOString(),
    source_dry_run: basename(inputPath),
    decision: {
      armed_root_count: 0,
      product_state: "WATCHING",
      summary: "Candidate causes exist, but no source-independent verifier-passed root is armed.",
    },
    source_counts: dryRun.sources ?? {},
    lane_counts: {
      total: lanes.length,
      exploratory_candidates: exploratoryLanes.length,
      themes: themeLanes.length,
    },
    rejected_summary: rejectedSummary(dryRun.candidates ?? []),
    lanes,
  };
}

function mdTableEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderMarkdown(consoleDoc) {
  const lines = [];
  lines.push("# P6.6 Candidate Evidence Console");
  lines.push("");
  lines.push(`Generated at: ${consoleDoc.generated_at}`);
  lines.push(`Source dry-run: \`${consoleDoc.source_dry_run}\``);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push("- Product state: `WATCHING`");
  lines.push("- Armed roots: `0`");
  lines.push("- Candidate causes exist, but none should be armed until they survive verifier gates and ablation.");
  lines.push("- This artifact does not include raw transcript text.");
  lines.push("");
  lines.push("## Candidate Lanes");
  lines.push("");
  lines.push("| Lane | Status | Evidence | Why not armed | Next move |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const lane of consoleDoc.lanes) {
    const meetings = lane.evidence?.meetings ?? [];
    const memories = lane.evidence?.memories ?? [];
    const evidence = [
      meetings.length ? `${meetings.length} meeting refs: ${shortList(meetings.map((meeting) => meeting.title))}` : "",
      memories.length ? `${memories.length} memory refs` : "",
      lane.meeting_hit_count !== undefined ? `meeting_hits=${lane.meeting_hit_count}` : "",
      lane.memory_hit_count !== undefined ? `memory_hits=${lane.memory_hit_count}` : "",
      lane.occurrences ? `watch alignments=${lane.occurrences}` : "",
    ].filter(Boolean).join("; ");
    lines.push(`| ${mdTableEscape(lane.title)} | ${mdTableEscape(lane.status)} | ${mdTableEscape(evidence)} | ${mdTableEscape((lane.why_not_armed ?? []).join(" "))} | ${mdTableEscape(lane.next_move)} |`);
  }
  lines.push("");
  lines.push("## Rejected Gate Summary");
  lines.push("");
  for (const row of consoleDoc.rejected_summary) {
    lines.push(`- ${row.reason}: \`${row.count}\``);
  }
  lines.push("");
  lines.push("## Privacy Boundary");
  lines.push("");
  lines.push("- Meeting evidence is represented by titles, source refs, body lengths, span counts, span hashes, and hit terms.");
  lines.push("- Raw transcript text is intentionally excluded.");
  lines.push("- Event or meeting titles are evidence context only; they are not final root-cause text.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = resolve(options.input || latestDryRunInput());
  if (!existsSync(inputPath)) throw new Error(`Input JSON does not exist: ${inputPath}`);
  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const dryRun = readJson(inputPath);
  const consoleDoc = buildConsole(inputPath, dryRun);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = resolve(outputDir, `${options.label}-${timestamp}.json`);
  const mdPath = resolve(outputDir, `${options.label}-${timestamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(consoleDoc, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(consoleDoc));
  console.log(JSON.stringify({
    status: "written",
    json_path: jsonPath,
    md_path: mdPath,
    lane_counts: consoleDoc.lane_counts,
    armed_root_count: consoleDoc.decision.armed_root_count,
  }, null, 2));
}

main();
